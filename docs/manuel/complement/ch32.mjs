/**
 * Chapitre 32 — Compléments Eurocodes du tablier et des appuis (versions 0.99.14 à 0.99.28).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formDefaults } from '../../../tools/formdefaults.mjs';
import { EXEMPLES, donnees } from '../../../tools/exemples.mjs';
import { parseData, compute } from '../../../src/pipeline.js';
import { gradientEN1991_1_5 } from '../../../src/loads_ec.js';
import { durabilite, durabilitePrecontrainte } from '../../../src/durabilite.js';
import { parsePoutres, computePoutres } from '../../../src/beams/run.js';
import { chargesRoutieresEC } from '../../../src/cadre/routeEC.js';
import { cadreDe, geometrieCadre } from '../../../src/cadre/picf.js';
import { biaisPoutres } from '../../../src/beams/biais.js';
import { deversementPoutre } from '../../../src/beams/deversement.js';
import { grillagePoutres } from '../../../src/beams/grillage.js';
import { grillageTravee, casGrillage } from '../../../src/beams/grillage3d.js';
import { antiCheminement } from '../../../src/supports/bearings1337.js';
import { coefficientsBiais } from '../../../src/plate/biais_appuis.js';

const NOTE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../test/data/ec6_note.json', import.meta.url)), 'utf8'));
const VREF = { pt_geo: 'dims', pt_spans: '33', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56', pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '1.79 sur -6.56,6.56', pt_type: 'BP', pt_fck: '40' };

export default async function chapitre32(k) {
  const { fr } = k;
  const t = (x, d = 2) => fr(x, d).replace(',', '{,}').replace(/ /g, '\\,');

  k.h1(32, 'Compléments Eurocodes du tablier et des appuis');
  k.p(`Les versions 0.99.14 à 0.99.28 ont complété le calcul aux Eurocodes : gradient thermique, tension initiale des câbles,
    durabilité et enrobages, trafic des cadres, biais et stabilité des poutres, grillage et vue 3D, et plusieurs vérifications
    des appuis. Ce chapitre présente chacune avec un calcul à la main.`);

  // —— gradient
  k.h2('Le gradient thermique de l\'EN 1991-1-5');
  const g8 = gradientEN1991_1_5(0.08), kh = 1.0 + (0.08 - 0.05) / 0.05 * (0.7 - 1.0);
  k.p(`Quand le champ « Gradient thermique » est vide, PSIDA applique aux calculs Eurocodes l'approche 1 de l'EN 1991-1-5
    (§ 6.1.4.1, composante linéaire) pour un tablier en dalle de béton (type 3) : $\\Delta T_{M,heat} = 15$ °C et
    $\\Delta T_{M,cool} = 8$ °C (tableau 6.1), multipliés par $k_{sur}$ (tableau 6.2), qui dépend de l'épaisseur du revêtement.
    Les calculs au Fascicule 61 gardent la pratique antérieure, +12 / −6 °C. Avec 8 cm de revêtement, on interpole entre
    50 mm ($k = 1{,}0$) et 100 mm ($k = 0{,}7$) :`);
  k.eq(String.raw`k_{sur,heat} = 1{,}0 + \frac{80 - 50}{100 - 50}\,(0{,}7 - 1{,}0) = ${t(kh, 2)} \qquad \Delta T_{heat} = 15 \times ${t(kh, 2)} = ${t(15 * kh, 1)}\ ^\circ\text{C} \qquad \Delta T_{cool} = -8 \times 1{,}0 = -8\ ^\circ\text{C}`);
  k.cmp([['$\\Delta T_{M,heat}$, revêtement 8 cm', 15 * kh, g8.heat, '°C', 1], ['$\\Delta T_{M,cool}$', -8, g8.cool, '°C', 1]], { legende: 'Gradient thermique (EN 1991-1-5)' });
  k.p(`Une valeur saisie dans le champ s'applique partout, aux Eurocodes comme au Fascicule 61. La ligne « étanchéité seule »
    du tableau 6.2 ($k = 1{,}5$) n'est pas proposée : un revêtement nul est traité comme « sans revêtement » ($k = 0{,}8$). Au-delà
    de 15 cm, la valeur de 15 cm est retenue.`);

  // —— σ_pm0
  k.h2('La tension des câbles après pertes instantanées');
  const fpk = 1860, fp01 = 1640, lim = Math.min(0.75 * fpk, 0.85 * fp01), jack = Math.min(0.8 * fpk, 0.9 * fp01);
  const EC6 = {
    ...formDefaults(), spans: NOTE.spans.join(', '), width: '13.6', h: '1.00', area: '11.499', overhangs: '0, 0', hEdge: '0.20', joue: '1.5', roadway: '-6.3, 6.3', footways: '',
    lines: '5.3 k 0.95/1.05 @ -6.6 ; 5.3 k 0.95/1.05 @ 6.6 ; 0.65 k 0.95/1.05 @ -6.4 ; 0.65 k 0.95/1.05 @ 6.4 ; 0.36 k 0.95/1.05 @ -6.75 ; 0.36 k 0.95/1.05 @ 6.75 ; 7.5 k 0.95/1.05 @ 0',
    bands: '1.68 sur -6.3,6.3 k 0.8/1.4 ; 0.088 sur -6.8,6.8 k 0.95/1.05 ; 6.75 sur -6.8,-6.3 k 0.95/1.05 ; 6.75 sur 6.3,6.8 k 0.95/1.05',
    ys: '-6.8,-5.3,-3,-1.5,0,1.5,3,5.3,6.8', EI: '34100, 0.7991', fck: '35', fyk: '500', psi: '80', dT: '10.8, -6', delta: '0.01', phiFluage: '2', tRev: '0.074', alpha: 'FR2',
    withTherm: 'on', nBearings: '4', tassProb: NOTE.tassProb_mm.join(', '),
    bp_actif: 'on', bp_reg: 'EC2', bp_n: '27', bp_unite: '12', bp_f: '0.17', bp_k: '0.007', bp_g: '6', bp_Ep: '195000', bp_sigma0: '', bp_fprg: '1860', bp_fpeg: '1640', bp_rho1000: '2.5',
    bp_j: '5', bp_fcj: '22.57', bp_phiC: '2', bp_epsCs: '0.00032', bp_decomp: 'qp', bp_ptsRef: 'inf',
    bp_pts: NOTE.points_inf.map(([x, z]) => `${x} ${z}`).join(' ; '), bp_sigx: '', bp_secB: '11.499', bp_secI: '0.7991', bp_secV: '0.5207',
  };
  const dpS = compute(parseData(EC6)).psidp, s = dpS.sigPm0;
  k.p(`Aux règles EN 1992 (dalle précontrainte, VIPP, PRAD), PSIDA contrôle deux limites de l'EN 1992-1-1 § 5.10 : la tension
    à l'ancrage pendant la mise en tension (§ 5.10.2.1) et la tension $\\sigma_{pm0}$ juste après les pertes instantanées
    (frottement, recul d'ancrage, raccourcissement élastique, § 5.10.3 (2)). Pour des torons $f_{pk} = 1\\,860$ MPa,
    $f_{p0,1k} = 1\\,640$ MPa :`);
  k.eq(String.raw`\sigma_{p,max} = \min(0{,}8 f_{pk}\ ;\ 0{,}9 f_{p0,1k}) = \min(1\,488\ ;\ 1\,476) = ${t(jack, 0)}\ \text{MPa}
    \qquad \sigma_{pm0} \le \min(0{,}75 f_{pk}\ ;\ 0{,}85 f_{p0,1k}) = \min(1\,395\ ;\ 1\,394) = ${t(lim, 0)}\ \text{MPa}`);
  k.cmp([['Limite à l\'ancrage $\\sigma_{p,max}$', jack, s.sigmaJack, 'MPa', 0], ['Limite $\\sigma_{pm0}$', lim, s.lim, 'MPa', 0]], { legende: 'Limites de tension (EN 1992-1-1 § 5.10)' });
  k.p(`Quand la tension à l'ancrage est laissée vide, PSIDA part de $\\sigma_{p,max}$ et l'abaisse tant que $\\sigma_{pm0}$ dépasse la
    limite : au plus quatre reprises, chacune multipliant la tension par $\\min(0{,}995 ; 0{,}999 \\times \\text{limite}/\\sigma_{pm0,max})$.
    Le maximum de $\\sigma_{pm0}$ n'est pas à l'ancrage, où agit le recul, mais en travée. Pour la dalle de la note EC6
    (deux travées de ${fr(NOTE.spans[0], 2)} et ${fr(NOTE.spans[1], 2)} m, 27 câbles 12T15S), PSIDA retient
    $\\sigma_{p0} = ${t(dpS.sigma0, 2)}$ MPa à l'ancrage et obtient $\\sigma_{pm0,max} = ${t(s.max, 2)}$ MPa à x = ${fr(s.x, 2)} m,
    sous la limite. Une contrainte imposée (table x σ) est contrôlée telle quelle : la « contrainte finale » de la note EC6
    atteint 1 425 MPa et PSIDA la signale.`);

  // —— durabilité
  k.h2('Durabilité : classe de béton et enrobages');
  const Dd = durabilite({ expo: 'XC4', fck: 35, phi: 20, vie: 100, dalle: true });
  k.p(`Depuis la version 0.99.24, chaque ouvrage reçoit une note de durabilité (EN 1992-1-1 § 4.4.1) : classe de béton minimale
    des classes d'exposition saisies (annexe E, tableau E.1N, ou NF EN 206/CN), classe structurale (tableau 4.3N) et enrobage
    nominal $c_{nom} = c_{min} + \\Delta c_{dev}$ avec $\\Delta c_{dev} = 10$ mm. La classe structurale part de S4 ; +2 pour
    100 ans ; −1 si le béton atteint le seuil du tableau 4.3N (C40/50 en XC4) ; −1 pour une géométrie de dalle.`);
  k.p(`**Pont-dalle de l'exemple fil rouge** (XC4, C35/45, HA20, 100 ans) : S = 4 + 2 − 1 (dalle) = S5 ; C35/45 n'atteint pas
    C40/50. Le tableau 4.4N donne $c_{min,dur} = 35$ mm (S5, XC4), d'où $c_{min} = \\max(\\phi ; c_{min,dur} ; 10) = 35$ mm et
    $c_{nom} = 45$ mm au nu : l'axe des aciers longitudinaux doit être à $45 + 20/2 = 55$ mm du parement. C'est l'enrobage
    par défaut du pont-dalle depuis la version 0.99.25.`);
  const Dp = durabilitePrecontrainte({ expo: 'XC4', fck: 40, vie: 100, gaine: 80 }), rN = computePoutres(parsePoutres({ ...formDefaults(), ...VREF })), G = rN.durabP;
  k.p(`**Gaines de précontrainte** (§ 4.4.1.2 (3), version 0.99.26) : $c_{nom,p} = \\max(c_{min,b} ; c_{min,dur,p} ; 10) + \\Delta c_{dev}$ avec
    $c_{min,b}$ = diamètre de la gaine (80 mm au plus) en post-tension, 1,5 Ø du toron en pré-tension, et $c_{min,dur,p}$ du
    tableau 4.5N. Pour le tablier VIPP de 4 × 33 m (VIPP de 33 m, 12T15S en gaine de 80 mm, XC4, 100 ans, C40/50) : S = 4 + 2 − 1 = S5,
    $c_{min,dur,p} = 45$ mm, d'où $c_{nom,p} = \\max(80 ; 45) + 10 = 90$ mm. Une âme de 0,20 m laisse
    $(200 − 80)/2 = 60$ mm de part et d'autre de la gaine relevée : il faut $b_w \\ge 2 \\times 90 + 80 = 260$ mm.`);
  k.cmp([
    ['$c_{nom}$ du pont-dalle', 45, Dd.cnom, 'mm', 0], ['$c_{nom,p}$ des gaines', 90, Dp.cnom, 'mm', 0],
    ['$b_{w,min}$ de l\'âme de la VIPP', 0.26, G.bwMin, 'm', 2],
  ], { legende: 'Enrobages nominaux (EN 1992-1-1 § 4.4.1)' });
  k.p(`Les âmes de 20 cm du guide Sétra VIPP de 1996 relèvent du BPEL : aux Eurocodes, PSIDA les signale. Les appuis reçoivent
    par défaut XC4 en élévation et XC2 en fondation ; les semelles ont au moins $k_1 = 40$ mm et les pieux forés $k_2 = 75$ mm
    (§ 4.4.1.3 (4)). Depuis la version 0.99.37, le seuil de réduction de la classe structurale suit les classes d'exposition
    du tableau 4.3N (XS2 avec XD3 et XS3, C45/55).`);

  // —— cadres sous route
  k.h2('Le trafic Eurocode des cadres sous remblai');
  const geom = geometrieCadre({ n: 1, B: 4.0, H: 3.0, L: 16.02, et: 0.45, er: 0.45, ep: 0.45, ei: 0.45, Hr: 1.36 });
  const R = chargesRoutieresEC(geom, cadreDe(geom), { alpha: 'FR2' }, { largeurChargeable: 12 });
  const dd = 1.36 * Math.tan(Math.PI / 6) + 0.45 / 2, bb = 0.40 + 2 * dd, qT = 0.9 * 300 / 2 / bb ** 2, q2 = 0.8 * 400 / 2 / ((0.35 + 2 * dd) * (0.60 + 2 * dd));
  const der = Object.fromEntries(R.derivations.map(x => [x.sys, x]));
  k.p(`Avec « Trafic porté » = route Eurocodes (version 0.99.15), le cadre reçoit le LM1 et le LM2 de l'EN 1991-2. La roue du TS
    (0,40 × 0,40 m) se diffuse à travers le remblai $H_r$ suivant l'angle θ (30° par défaut) et jusqu'au feuillet moyen de la
    traverse. Exemple du PIGR-1 : remblai de 1,36 m, traverse de 0,45 m, coefficients α de l'annexe nationale française
    (classe 2 : $\\alpha_{Q1} = 0{,}9$, $\\beta_Q = 0{,}8$).`);
  k.eq(String.raw`d = H_r \tan\theta + \frac{e_t}{2} = 1{,}36 \times 0{,}5774 + 0{,}225 = ${t(dd, 4)}\ \text{m} \qquad b = 0{,}40 + 2d = ${t(bb, 4)}\ \text{m}
    \qquad q_{TS} = \frac{0{,}9 \times 300/2}{b^2} = ${t(qT, 2)}\ \text{kN/m}^2`);
  k.p(`Pour le LM2, la roue de $\\beta_Q \\times 200$ kN (0,35 × 0,60 m) s'étale sur $(0{,}35 + 2d)(0{,}60 + 2d)$ :
    $q_{LM2} = 160/(${t(0.35 + 2 * dd, 4)} \\times ${t(0.60 + 2 * dd, 4)}) = ${t(q2, 2)}$ kN/m².`);
  k.cmp([['$d$', dd, R.d, 'm', 4], ['$b$', bb, R.bxTS, 'm', 4], ['$q_{TS}$ voie 1', qT, der['TS (LM1)'].qBrute * 10, 'kN/m²', 2], ['$q_{LM2}$', q2, der.LM2.q * 10, 'kN/m²', 2]],
    { legende: 'Charges de roue diffusées sur la traverse du PIGR-1' });
  k.p(`La note SCIA du PIGR-1 donne 23,06 kN/m². PSIDA applique ensuite, par mètre de largeur, la bande de 1 m la plus chargée :
    une ligne qui recoupe le plus d'empreintes. Les deux roues d'un essieu y comptent à pleine pression, ce qui est
    prudent pour les cadres larges.`);

  // —— biais AASHTO
  k.h2('Le biais des ponts à poutres');
  const B1 = biaisPoutres({ psi: 60, L: 33, ts: 0.30, S: 3.28, Kg: 1.0 }), th = (100 - 60) * 0.9, Fv = 1 + 0.20 * (33 * 0.3 ** 3 / 1.0) ** 0.3 * Math.tan(th * Math.PI / 180);
  k.p(`Ni l'Eurocode ni le guide Sétra VIPP ne donnent de règle pour le biais d'un tablier à poutres. PSIDA (version 0.99.17)
    reprend le coefficient de l'AASHTO LRFD (tabliers en béton sur poutres en béton) pour l'effort tranchant et les réactions
    des poutres de rive à l'angle obtus. Le biais ψ en grades devient un angle θ = (100 − ψ) × 0,9° ; $K_g$ est la raideur
    de la poutre seule, $n(I_b + A_b e_g^2)$ :`);
  k.eq(String.raw`F_V = 1 + 0{,}20\left(\frac{L\,t_s^3}{K_g}\right)^{0{,}3}\tan\theta`);
  k.p(`Pour ψ = 60 gr (θ = 36°), L = 33 m, $t_s = 0{,}30$ m et $K_g = 1{,}0$ m⁴ : $F_V = 1 + 0{,}20 \\times 0{,}891^{0{,}3} \\times \\tan 36° = ${t(Fv, 4)}$.`);
  k.cmp([['$F_V$', Fv, B1.Fv, '—', 4]], { legende: 'Coefficient de biais de l\'AASHTO' });
  k.p(`PSIDA applique $F_V$ à la part du trafic de l'effort tranchant et des réactions des poutres de rive, en entier à l'appui et
    nul à mi-travée. La réduction des moments de l'AASHTO est donnée pour mémoire. Sous 70 gr, une étude par grillage ou
    éléments finis est signalée.`);

  // —— Mast
  k.h2('Le déversement des poutres en phase de pose');
  const o = { L: 30, w: 15, A: 0.6, I: 0.25, Iy: 0.03, vs: 0.8, vi: 0.7, bt: 1.2, P: 3000, e: 0.5, fckT: 30, fctmT: 2.9, E: 32000, a: 1 };
  const Dv = deversementPoutre(o), Lv = Dv.levage, l = o.L - 2 * o.a, Mg = o.w * (l ** 2 / 8 - o.a ** 2 / 2);
  const sig = -o.P / o.A + o.P * o.e * o.vs / o.I - Mg * o.vs / o.I, yr = o.vs + 0.20;
  const z0 = o.w / (12 * o.E * 1000 * o.Iy * o.L) * (l ** 5 / 10 - o.a ** 2 * l ** 3 + 3 * o.a ** 4 * l + 6 * o.a ** 5 / 5);
  const ei = 2 / 3 * o.L / 960 + 0.006, thI = ei / yr, thM = (o.fctmT * 1000 - sig) / (Mg * (o.bt / 2) / o.Iy), FSc = 1 / (z0 / yr + thI / thM);
  k.p(`Une poutre préfabriquée suspendue à deux points de levage peut basculer latéralement. PSIDA (version 0.99.17) applique la
    méthode de Mast (PCI) : la poutre tourne autour de l'axe des points de levage, situé à $y_r$ au-dessus de son centre de
    gravité ; l'excentricité initiale $e_i$ et la flèche latérale $z_0$ sous le poids propre font tourner la poutre ; la fissuration
    du coin de la table limite la rotation admissible $\\theta_{max}$. Exemple : L = 30 m, w = 15 kN/m, points de levage à
    a = 1 m des extrémités, $I_y = 0{,}03$ m⁴, $E = 32\\,000$ MPa, précontrainte P = 3 000 kN à e = 0,50 m.`);
  k.eq(String.raw`\begin{aligned}
    M_g &= w\left(\frac{l^2}{8} - \frac{a^2}{2}\right) = ${t(Mg, 1)}\ \text{kN·m} \qquad
    \sigma_{haut} = -\frac{P}{A} + \frac{P\,e\,v_s}{I} - \frac{M_g v_s}{I} = ${t(sig / 1000, 3)}\ \text{MPa}\\
    z_0 &= \frac{w}{12\,E I_y L}\left[\frac{l^5}{10} - a^2 l^3 + 3a^4 l + \frac{6a^5}{5}\right] = ${t(z0, 4)}\ \text{m} \qquad
    e_i = \tfrac23\,\frac{L}{960} + 6\ \text{mm} = ${t(ei, 4)}\ \text{m}\\
    \theta_{max} &= \frac{f_{ctm}(t) - \sigma_{haut}}{M_g\,(b_t/2)/I_y} = ${t(thM, 4)}\ \text{rad} \qquad
    FS_c = \frac{1}{z_0/y_r + \theta_i/\theta_{max}} = ${t(FSc, 3)}
  \end{aligned}`);
  k.cmp([['$z_0$', z0, Lv.z0, 'm', 4], ['$\\theta_{max}$', thM, Lv.thetaMax, 'rad', 4], ['$FS_c$ au levage', FSc, Lv.FSc, '—', 3]], { legende: 'Stabilité au levage (Mast), $y_r = v_s + 0{,}20$ m' });
  k.p(`Exigences : $FS_c \\ge 1{,}0$ (fissuration) et $FS_f \\ge 1{,}5$ (rupture). PSIDA vérifie aussi la poutre posée sur deux
    appareils provisoires (raideur de rotation de la NF EN 1337-3, $FS_r \\ge 1{,}5$ au renversement), les contraintes de levage
    avec un poids majoré ou minoré de 15 %, et le critère (5.40b) de l'EN 1992-1-1 § 5.9. Le vent et le transport ne sont pas
    examinés.`);

  // —— grillage
  k.h2('Le grillage et la vue 3D des ponts à poutres');
  const ys = [-4.92, -1.64, 1.64, 4.92], S2 = ys.reduce((a, y) => a + y * y, 0), e = -4.92;
  const gc = grillagePoutres({ n: 4, b1: 3.28, L: 33, Ip: 1, Kp: 1e-9, hd: 1e-3, m: 20, entretoises: Array.from({ length: 19 }, (_, i) => ({ x: 33 * (i + 1) / 20, I: 1e6, K: 0 })) });
  const Kg = gc.Kbar(e, e), Kc = ys.map(y => 4 * (1 / 4 + e * y / S2));
  k.p(`Le champ « Répartition transversale » propose depuis la version 0.99.26 un grillage (Hambly 1991) : poutres $EI_p$, $GK_p$,
    hourdis en barres transversales, entretoises en T, appuis à $w = \\theta_x = 0$, G = E/2. Une charge-ligne sinusoïdale
    donne les coefficients $\\bar K_k = n M_k/\\sum M$. Premier contrôle : avec des entretoises infiniment rigides et sans
    torsion, le grillage doit retrouver Courbon. Pour quatre poutres à 3,28 m ($\\sum y^2 = ${t(S2, 3)}$ m²) et une charge sur la
    poutre de rive (e = −4,92 m) : $\\bar K = 4\\,(1/4 + e\\,y_k/\\sum y^2)$.`);
  k.cmp([0, 1, 2, 3].map(i => [`$\\bar K$ poutre ${i + 1}`, Kc[i], Kg[i], '—', 3, 0.005, 1e-6]), { legende: 'Grillage à entretoises rigides et méthode de Courbon' });
  const rN2 = computePoutres(parsePoutres({ ...formDefaults(), ...VREF })), T = grillageTravee(rN2, 33), gg = T.g, im = gg.m / 2;
  const cG = casGrillage(T, { cas: 'UDL', y: -2.5 }), Mm = Array.from({ length: gg.n }, (_, kk) => cG.M[im * gg.n + kk]).reduce((a, v) => a + v, 0);
  const qU = 9 * 8, sR = cG.R.reduce((a, r) => a + r.R, 0);
  k.p(`Second contrôle, sur la vue 3D (version 0.99.28) d'un tablier VIPP de 4 × 33 m : l'UDL de 9 kN/m² sur la chaussée de 8 m charge le tablier de
    $q = 72$ kN/m. La somme des moments des poutres à mi-travée doit valoir le moment isostatique $q L^2/8$, et la somme des
    réactions la charge $q L$, quelle que soit la répartition :`);
  k.cmp([['$\\sum M(L/2)$', qU * 33 ** 2 / 8, Mm, 'kN·m', 1, 0.002], ['$\\sum R$', qU * 33, sR, 'kN', 1, 0.002]], { legende: 'Vue 3D du grillage, UDL sur un tablier VIPP de 4 × 33 m' });
  k.p(`(Avant la version 0.99.37, la charge répartie posée sur les lignes d'appui n'entrait pas dans les réactions de la vue 3D :
    il manquait $q\\,dx$. Les moments n'étaient pas touchés.) Avec ses vraies raideurs, le grillage d'un tablier VIPP de 4 × 33 m donne
    $\\bar K = 2{,}71$ à la poutre de rive chargée sur son axe, contre 2,50 par Guyon-Massonnet. Le grillage reste une lecture
    de la répartition ; les justifications se font aux sections.`);

  // —— biais pont-dalle
  k.h2('Le biais du pont-dalle calculé par Guyon-Massonnet');
  const st2 = compute(parseData({ ...donnees(EXEMPLES[1]), methodeTablier: 'guyon' })), KB = st2.bearings.kBiais || [];
  k.p(`Pour un pont-dalle biais calculé par Guyon-Massonnet, PSIDA (version 0.99.26) estime l'effet du biais sur les appareils
    d'appui par deux résolutions de la plaque (éléments DKT, maille de 0,50 m, appareils rigides) sous les charges
    permanentes : ouvrage biais et ouvrage droit. Sur chaque ligne d'appui, le rapport $\\rho = n R_{max}/\\sum R$ mesure la
    concentration sur l'appareil le plus chargé ; $\\kappa_{max} = \\rho_{biais}/\\rho_{droit}$ (au moins 1) multiplie les
    coefficients $k_{CP}$ et $k_Q$ de PSI-DA 68, $\\kappa_{min}$ la réaction minimale.`);
  if (KB.length > 1) {
    const rho = Rr => Rr.length * Math.max(...Rr) / Rr.reduce((a, v) => a + v, 0), lst = v => v.map(x => fr(x, 1)).join(' / ');
    const [L0, L1] = KB, k0 = Math.max(1, rho(L0.biais.R) / rho(L0.droit.R)), k1 = Math.max(1, rho(L1.biais.R) / rho(L1.droit.R));
    k.p(`Exemple 2 (12 + 16 + 16 + 12 m, ψ = 70 gr, trois appareils par ligne). Culée C0 : réactions ${lst(L0.biais.R)} kN en biais,
      ${lst(L0.droit.R)} kN en droit. Pile P1 : ${lst(L1.biais.R)} kN en biais, ${lst(L1.droit.R)} kN en droit. Pour la pile :
      $\\rho_{biais} = 3 \\times ${t(Math.max(...L1.biais.R), 1)}/${t(L1.biais.R.reduce((a, v) => a + v, 0), 1)} = ${t(rho(L1.biais.R), 4)}$,
      $\\rho_{droit} = ${t(rho(L1.droit.R), 4)}$, d'où $\\kappa_{max} = ${t(k1, 4)}$.`);
    k.cmp([['$\\kappa_{max}$ culée C0', k0, L0.kMax, '—', 4], ['$\\kappa_{max}$ pile P1', k1, L1.kMax, '—', 4]], { legende: 'Coefficients de biais des appareils (exemple 2)' });
  }
  k.p(`L'hypothèse est que le trafic se concentre dans l'angle obtus au moins autant que les charges permanentes.`);

  // —— appuis
  k.h2('Appuis : anti-cheminement, gros béton, souffle des joints, séisme');
  const AC = antiCheminement({ Fxy: 200, fck: 30, fyk: 500 }), FEd = 1.35 * 200, As = FEd / (0.7 * 500 / 1.15) * 10;
  k.p(`**Dispositif anti-cheminement** (version 0.99.25). Quand le non-glissement d'un appareil en élastomère fretté n'est pas
    vérifié ($F_{xy} > \\mu_e F_z$, NF EN 1337-3 § 5.3.3.6), l'appareil doit être fixé. PSIDA dimensionne des taquets pour tout
    l'effort horizontal, frottement négligé : $F_{Ed} = 1{,}35\\,F_{xy}$, coutures $A_s \\ge F_{Ed}/(\\mu f_{yd})$ avec $\\mu = 0{,}7$
    (EN 1992-1-1 § 6.2.5, interface rugueuse), 4 HA16 au moins, surface d'appui $\\ge F_{Ed}/f_{cd}$. Pour $F_{xy} = 200$ kN, C30/37,
    B500 : $F_{Ed} = 270$ kN, $A_s = 270/(0{,}7 \\times 434{,}8) = ${t(As, 2)}$ cm², soit ${AC.nHA16} HA16.`);
  k.cmp([['$A_s$ des coutures', As, AC.As * 1e4, 'cm²', 3], ['Surface d\'appui', FEd / 20 * 10, AC.Acontact * 1e4, 'cm²', 1]], { legende: 'Dispositif anti-cheminement' });
  k.p(`**Massif en gros béton** (version 0.99.15). Une semelle peut reposer sur un massif non armé de hauteur $h_{gb}$, débordant de
    $d_{gb}$ (défaut $h_{gb}/2$, diffusion 2V/1H). La portance, le glissement, l'excentrement et le tassement sont vérifiés à la base
    du massif ($B' = B + 2d_{gb}$, $L' = L + 2d_{gb}$, poids $23\\,B'L'h_{gb}$). Le contact semelle / massif est limité à
    $\\sigma_{réf} = V/((B − 2e)L) \\le 0{,}8 f_{ck}/\\gamma_c$ et le glissement béton sur béton à $H \\le 0{,}6\\,V$. Exemple : semelle de
    4 × 13 m, massif de 2 m en C15 : $B' = 6$ m, $L' = 15$ m, poids $23 \\times 6 \\times 15 \\times 2 = 4\\,140$ kN, limite de contact
    $0{,}8 \\times 15/1{,}5 = 8$ MPa.`);
  k.p(`**Souffle des joints de chaussée.** $W = \\max(2 v_T + v_{RF} ;\\ W_{séisme})$, où $v_T$ et $v_{RF}$ sont les déplacements dus à la
    température et au retrait-fluage. Le souffle sismique vient du module Pont EC8 : catégorie I-II, séisme ignoré
    ($2 d_T + d_G$) ; $d_E \\le 2$ cm : $2 d_E + 2 d_T + d_G$ ; $d_E > 2$ cm : $2\\,(d_G + 0{,}5\\,d_T) + 0{,}8\\,d_E$ (souffle de
    service, avec $\\psi_2 = 0{,}5$ sur la température, plus 40 % du souffle sismique, garde-grève fusible).`);
  k.p(`**Séisme non calculé** (version 0.99.25). Si la case « Séisme » n'est pas cochée alors que la zone de sismicité est de 2 à 5
    et la catégorie d'importance de II à IV, la note des appuis le signale (arrêté du 26 octobre 2011). Hors de France, la zone
    et la catégorie saisies doivent traduire le règlement local.`);
}
