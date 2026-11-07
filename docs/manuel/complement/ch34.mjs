/**
 * Chapitre 34 — Dalles de transition et murs en aile (versions 0.99.30 à 0.99.36).
 */
import { parseData, compute } from '../../../src/pipeline.js';
import { formDefaults } from '../../../tools/formdefaults.mjs';
import { dalleTransitionCulee, planDalleTransition } from '../../../src/plans/dalle_transition.js';
import { intensite, plaqueDalleTransition, epaisseurDalleTransition } from '../../../src/supports/dalle_transition.js';
import { parseCadre, computeCadre } from '../../../src/cadre/run.js';
import { anglesEsthetiques, calculMurAile, kaeMononobe, epaisseurAbaque } from '../../../src/cadre/murs_aile.js';
import { ailesCadre, planMursAile } from '../../../src/plans/murs_aile.js';
import { feuilleSVG } from '../../../src/plans/svg.js';
import { recadrer } from './outils.mjs';

const RAD = Math.PI / 180;

export default async function chapitre34(k) {
  const { fr } = k;
  const t = (x, d = 2) => fr(x, d).replace(',', '{,}').replace(/\u202f/g, '\\,');

  k.h1(34, 'Dalles de transition et murs en aile');
  k.p(`Les versions 0.99.30 à 0.99.36 ajoutent deux ouvrages annexes : la dalle de transition des culées du pont-dalle et
    les murs en aile des cadres et portiques. Tous deux ont leur feuille de plan, leur nomenclature et, depuis la version 0.99.34,
    leur chapitre dans la note de calcul (« Dalles de transition » dans la note du pont, « Murs en aile » dans la note du cadre).`);

  // ——————————————————————————————— dalle de transition
  const st = compute(parseData(formDefaults()));
  const D = dalleTransitionCulee(st, 0), K = D.K;
  k.h2('La dalle de transition : modèle et données');
  k.p(`La dalle de transition s'appuie d'un côté sur le corbeau du garde-grève, de l'autre sur le remblai. PSIDA la calcule par
    mètre de largeur comme une dalle sur deux appuis simples, de portée $L_c = L − 0{,}30$ m, sous son poids, celui du remblai qui
    la couvre et le trafic de l'EN 1991-2 (LM1 et LM2), diffusé jusqu'au feuillet moyen. Elle se déclare dans l'onglet
    « Appuis et fondations » (culées) ; sa longueur, son épaisseur et sa largeur viennent de la géométrie de la culée.`);
  k.table(['Donnée (culée C0 de l\'exemple fil rouge)', 'Valeur'], [
    ['Longueur L ; portée de calcul $L_c$', `${fr(K.L)} m ; ${fr(K.Lc)} m`],
    ['Épaisseur e ; largeur B ; chaussée w', `${fr(K.e)} m ; ${fr(K.B)} m ; ${fr(K.w)} m`],
    ['Couverture au garde-grève ; pente', `${fr(K.hc0)} m ; ${fr(100 * K.pente, 0)} %`],
    ['Béton ; aciers ; enrobage inférieur', `C${K.fck} ; f_yk = ${K.fyk} MPa ; ${fr(K.cInf)} m`],
  ], { legende: 'Dalle de transition de l\'exemple fil rouge (culée C0)', larg: [55, 45] });

  k.h3('Charges permanentes');
  const hm = K.hc0 + K.pente * K.L / 2, g = 25 * K.e + 20 * hm, Mg = g * K.Lc ** 2 / 8;
  k.p(`La couverture moyenne vaut $h_m = h_{c0} + p\\,L/2 = ${t(K.hc0)} + ${t(K.pente)} \\times ${t(K.L / 2)} = ${t(hm, 3)}$ m. Avec 25 kN/m³
    pour le béton et 20 kN/m³ pour le remblai :`);
  k.eq(String.raw`g = 25\,e + 20\,h_m = 25 \times ${t(K.e)} + 20 \times ${t(hm, 3)} = ${t(g)}\ \text{kN/m}^2
    \qquad M_G = \frac{g\,L_c^2}{8} = ${t(Mg)}\ \text{kN·m/m}`);

  k.h3('Trafic : largeurs efficaces et charges voisines');
  k.p(`Une roue de largeur $t_0$ se diffuse à 1/1 dans la couverture et jusqu'au feuillet moyen : $t = t_0 + 2(h + e/2)$. Le moment
    d'une charge à l'abscisse x se répartit sur la largeur efficace du DAfStb Heft 240, l'effort tranchant sur $b_v = t + 2x$ :`);
  k.eq(String.raw`b_m = t + 2{,}5\,x\left(1 - \frac{x}{L_c}\right) \qquad b_v = t + 2x`);
  k.p(`Quand les largeurs de deux roues voisines se recouvrent, elles forment une seule charge, de largeur
    $(y_{max} − y_{min}) + t$ ; une largeur qui sort de la dalle est tronquée au bord. C'est ce qui donne le plus d'effet aux
    roues placées près du bord libre.`);
  const x = K.Lc / 2, h = K.hc0 + K.pente * (0.15 + x), diff = 2 * (h + K.e / 2), tL = 0.60 + diff, a = 0.35 + diff, dbm = 2.5 * x * (1 - x / K.Lc);
  const y0 = (K.B - K.w) / 2, r2 = v => Math.round(v * 50) / 50, larg = (y0 + 0.30) + 2.00 + (r2(tL) + r2(dbm)) / 2, p2 = 400 / larg, M2 = p2 * (K.Lc / 4 - a / 8);
  k.p(`**Calcul à la main du LM2.** L'essieu de 400 kN ($\\beta_Q = 1$) a deux roues de 0,35 × 0,60 m espacées de 2,00 m. À mi-portée
    ($x = ${t(x, 3)}$ m), la couverture vaut ${fr(h, 3)} m, d'où :`);
  k.eq(String.raw`t = 0{,}60 + 2\,(${t(h, 3)} + ${t(K.e / 2, 3)}) = ${t(tL, 3)}\ \text{m} \qquad
    b_m - t = 2{,}5 \times ${t(x, 3)} \times 0{,}5 = ${t(dbm, 3)}\ \text{m} \qquad a = 0{,}35 + ${t(diff, 3)} = ${t(a, 3)}\ \text{m}`);
  k.p(`Les deux roues se recouvrent ($2{,}00 < t + 2{,}5x(1 − x/L_c)$) : elles forment une charge de 400 kN. Placée au plus près du
    bord de la chaussée, à ${fr(y0, 2)} + 0,30 m du bord de la dalle, sa largeur est tronquée à gauche :
    $b = ${t(y0 + 0.30)} + 2{,}00 + (${t(r2(tL))} + ${t(r2(dbm))})/2 = ${t(larg, 3)}$ m, soit $p = 400/${t(larg, 3)} = ${t(p2)}$ kN/m.
    Répartie sur la longueur a, centrée à mi-portée :`);
  k.eq(String.raw`M_{LM2} = p\left(\frac{L_c}{4} - \frac{a}{8}\right) = ${t(p2)} \times \left(\frac{${t(K.Lc)}}{4} - \frac{${t(a, 3)}}{8}\right) = ${t(M2)}\ \text{kN·m/m}`);
  const MU = 9 * K.Lc ** 2 / 8;
  k.cmp([
    ['$g$', g, K.g, 'kN/m²', 2], ['$M_G$', Mg, K.M.G, 'kN·m/m', 2],
    ['$M_{UDL}$ ($9\\,L_c^2/8$)', MU, K.M.UDL, 'kN·m/m', 2],
    ['$M_{LM2}$ à mi-portée', M2, K.M.LM2, 'kN·m/m', 2, 0.01],
  ], { legende: 'Moments de la dalle de transition : bandes' });
  k.p(`Le LM2 est maximal un peu à côté du milieu : PSIDA déplace le convoi par pas de 5 cm, d'où l'écart. Le tandem TS du LM1 se
    traite de même, voie par voie (300, 200 et 100 kN par essieu), deux essieux à 1,20 m : $M_{TS} = ${t(K.M.TS)}$ kN·m/m, et
    $M_{TS} + M_{UDL} = ${t(K.M.bandes)}$ kN·m/m gouverne la méthode des bandes.`);

  k.h3('Le calcul en plaque (version 0.99.36)');
  const U = plaqueDalleTransition({ L: 5, e: 0.30, B: 40, hc0: 0.30, aQ: [0, 0, 0], aq1: 0 });
  const rU = U.res.find(q => Math.abs(q.y - 20) < 0.6 && Math.abs(q.s - U.Lc / 2) < 0.2);
  k.p(`La méthode des bandes ignore les bords libres et les voies voisines. Depuis la version 0.99.36, PSIDA calcule aussi la dalle
    comme une plaque (éléments DKT, appuis linéaires sur le corbeau et sur le remblai) et place le trafic sur les surfaces
    d'influence, voies confinées dans la chaussée. Le moment retenu est le plus grand des deux ; les aciers parallèles au
    garde-grève sortent des moments de Wood-Armer $m_y \\pm |m_{xy}|$ au lieu des 20 % forfaitaires.`);
  k.p(`**Contrôle de la plaque.** Sous une charge uniforme, une dalle très large (B = 40 m, L = 5 m) doit se comporter au centre
    comme une poutre : $m_x = g L_c^2/8$ et $m_y = \\nu\\,m_x$ avec $\\nu = 0{,}2$.`);
  k.cmp([
    ['$m_x$ au centre, $g L_c^2/8$', U.g * U.Lc ** 2 / 8, rU.G.mx, 'kN·m/m', 2, 0.01],
    ['$m_y$ au centre, $0{,}2\\, m_x$', 0.2 * U.g * U.Lc ** 2 / 8, rU.G.my, 'kN·m/m', 2, 0.02],
  ], { legende: 'Plaque de 40 × 5 m sous charge uniforme' });
  k.p(`Pour la dalle de l'exemple, la plaque donne $M_Q = ${t(K.M.plaque)}$ kN·m/m contre ${fr(K.M.bandes, 2)} par les bandes
    (+${fr(100 * (K.M.plaque / K.M.bandes - 1), 0)} %) : les roues de rive chargent le bord libre davantage que ne le suppose la
    largeur efficace. Le tableau donne l'épaisseur que PSIDA retient selon la longueur (dalle de 11,36 m, chaussée de 10 m).`);
  const rows = [3, 4, 5, 6].map(L => {
    const E = epaisseurDalleTransition({ L, B: 11.36, w: 10, hc0: 0.30, pente: 0.05, fck: 30, fyk: 500, cSup: 0.05, cInf: 0.07 });
    return [`${fr(L, 2)} m`, fr(E.K.M.bandes, 1), fr(E.K.M.plaque, 1), `${fr(E.e, 2)} m`, `HA${E.K.inf.phi} e = ${fr(E.K.inf.s, 3)}`];
  });
  k.table(['L', '$M_Q$ bandes', '$M_Q$ plaque', 'Épaisseur', 'Lit inférieur'], rows,
    { legende: 'Épaisseur retenue selon la longueur (kN·m/m, C30/37, f_yk = 500 MPa)', larg: [12, 20, 20, 18, 30] });

  k.h3('Aciers et effort tranchant');
  const Mu = 1.35 * (K.M.G + K.M.Q), d = K.d, fcd = K.fck / 1.5, fyd = K.fyk / 1.15;
  const mu = Mu / 1000 / (d ** 2 * fcd), al = 1.25 * (1 - Math.sqrt(1 - 2 * mu)), z = d * (1 - 0.4 * al), As = Mu / 1000 / (z * fyd) * 1e4;
  k.p(`ELU : $M_{Ed} = 1{,}35\\,(M_G + M_Q) = 1{,}35 \\times (${t(K.M.G)} + ${t(K.M.Q)}) = ${t(Mu)}$ kN·m/m. Avec $d = e − c − \\phi/2 = ${t(d, 3)}$ m :`);
  k.eq(String.raw`\mu = \frac{M_{Ed}}{d^2 f_{cd}} = ${t(mu, 4)} \quad \alpha = 1{,}25\,(1 - \sqrt{1 - 2\mu}) = ${t(al, 4)} \quad
    z = d\,(1 - 0{,}4\,\alpha) = ${t(z, 4)}\ \text{m} \quad A_s = \frac{M_{Ed}}{z\,f_{yd}} = ${t(As)}\ \text{cm}^2/\text{m}`);
  const kk = 1 + Math.sqrt(200 / (d * 1000)), rho = K.inf.As / d, v = 0.12 * kk * Math.cbrt(100 * rho * K.fck), vmin = 0.035 * kk ** 1.5 * Math.sqrt(K.fck);
  const VRdc = Math.max(v, vmin) * d * 1000, Vg = g * (K.Lc / 2 - (K.e - K.cInf - 0.008));
  k.p(`Effort tranchant sans armatures (EN 1992-1-1 § 6.2.2), avec le lit choisi HA${K.inf.phi} e = ${fr(K.inf.s, 3)} ($\\rho_l = ${t(100 * rho, 3)}$ %) :
    $k = 1 + \\sqrt{200/d} = ${t(kk, 3)}$, $v_{Rd,c} = 0{,}12\\,k\\,(100 \\rho_l f_{ck})^{1/3} = ${t(v, 3)}$ MPa. L'effort tranchant
    est pris à d de l'appui, les charges à moins de 2d réduites de $\\beta = a_v/2d$.`);
  k.cmp([
    ['$A_s$ ELU', As, K.As.ELU * 1e4, 'cm²/m', 2],
    ['$V_{Rd,c}$', VRdc, K.VRdc, 'kN/m', 1],
    ['$V_G$ à d de l\'appui', Vg, K.V.G, 'kN/m', 2],
  ], { legende: 'Section de la dalle de transition' });

  k.h3('Le corbeau');
  const C = D.Kc, dC = C.hc - 0.05 - 0.006, z0 = 0.8 * dC, Ft = C.FEd * C.ac / z0 + 0.2 * C.FEd, AsC = Ft / (K.fyk / 1.15 * 1000) * 1e4;
  k.p(`Le corbeau est une console courte (EN 1992-1-1 annexe J.3) chargée par la réaction ELU de la dalle,
    $F_{Ed} = 1{,}35\\,(R_G + R_Q) = ${t(C.FEd)}$ kN/m, à $a_c = ${t(C.ac)}$ m du nu ; un effort horizontal $H_{Ed} = 0{,}2\\,F_{Ed}$ s'y ajoute.
    Avec $h_c = ${t(C.hc)}$ m, $d = ${t(dC, 3)}$ m et $z_0 = 0{,}8\\,d$ :`);
  k.eq(String.raw`F_t = F_{Ed}\,\frac{a_c}{z_0} + H_{Ed} = ${t(C.FEd)} \times \frac{${t(C.ac)}}{${t(z0, 4)}} + ${t(0.2 * C.FEd)} = ${t(Ft)}\ \text{kN/m}
    \qquad A_s = \frac{F_t}{f_{yd}} = ${t(AsC)}\ \text{cm}^2/\text{m}`);
  k.cmp([['Tirant $F_t$', Ft, C.Ft, 'kN/m', 2], ['$A_s$ du tirant', AsC, C.As * 1e4, 'cm²/m', 3]], { legende: 'Corbeau de la culée C0' });
  k.p(`Le tirant (HA${C.tirant.phi} e = ${fr(C.tirant.s, 2)}) est complété par des cadres d'au moins la moitié de sa section. La
    réaction de la dalle entre aussi dans les charges de la culée : aux Eurocodes, PSIDA retient le plus grand du forfait
    historique (60 kN/m sur un tiers de la largeur) et de la réaction de l'UDL augmentée de ce que le TS sur la dalle ajoute au
    TS sur le tablier.`);
  const svgDT = feuilleSVG(planDalleTransition(st, 0, {}), { mm: false });
  k.fig({ svg: recadrer(svgDT, [0.075, 0.035, 0.315, 0.21]), largeur: 80, legende: 'Feuille APP-DT de la culée C0 : coupe A-A dans l\'axe de l\'ouvrage (dalle, corbeau, goujons).' });
  k.fig({ svg: recadrer(svgDT, [0.69, 0.415, 0.985, 0.625]), largeur: 85, legende: 'Feuille APP-DT : le tableau « calcul par mètre de largeur » reprend les grandeurs de ce paragraphe.' });

  // ——————————————————————————————— murs en aile
  k.h2('Les murs en aile des cadres et portiques');
  const base = { cf_type: 'picf', cf_n: '1', cf_B: '3', cf_H: '2.5', cf_L: '15', cf_biais: '100', cf_Hr: '1.5' };
  const cad = computeCadre(parseCadre(base)), A = ailesCadre(cad), w1 = A.ailes[0], Kc = A.calc;
  k.p(`Les murs en aile retiennent le remblai aux têtes du cadre. PSIDA les dessine et les calcule comme des murs en T renversé
    (onglet « Cadres et portiques », groupe « Murs en aile ») d'après le guide Sétra « Ponts-cadres et portiques » (1992, § 2.8.1
    et 3.6.1) et l'abaque d'épaisseur du dossier PICF-EL (DT422). L'exemple est le dalot de 3,00 × 2,50 m sous 1,50 m de remblai
    du chapitre 27, talus à 3/2, revanche de 0,50 m.`);
  k.h3('Orientation et longueur');
  const Lo = 3, ag = 15 + 0.03 * Lo ** 2, aDeg = ag * 0.9;
  k.p(`Le guide propose, en grades, un angle $\\alpha = 15 + 0{,}03\\,L^2$ avec l'axe de l'ouvrage, L étant l'ouverture, et au coin
    aigu d'un ouvrage biais $\\beta = 0{,}008\\,(\\varphi + 25)\\,\\alpha$ (φ biais en grades). Pour L = 3 m :
    $\\alpha = 15{,}27$ gr $= ${t(aDeg, 3)}$°. Le pied du talus descend le long du mur avec la pente $\\cos\\theta/m$ ; le mur s'arrête
    0,20 m au-delà du point où le talus atteint le dessus de la semelle augmenté de la revanche :`);
  const pente = Math.cos(aDeg * RAD) / 1.5, Lw = A.lr + (w1.zTop0 - (A.geo.er + 0.50)) / pente + 0.20;
  k.eq(String.raw`L_w = l_r + \frac{z_{t} - (e_r + 0{,}50)}{\cos\theta/m} + 0{,}20 = ${t(A.lr)} + \frac{${t(w1.zTop0)} - ${t(A.geo.er + 0.5)}}{${t(pente, 4)}} + 0{,}20 = ${t(Lw, 3)}\ \text{m}`);
  k.cmp([['$\\alpha$', aDeg, anglesEsthetiques(3, 90).alpha, '°', 3], ['Pente du talus le long du mur', pente, w1.pente, '—', 4], ['Longueur $L_w$', Lw, w1.Lw, 'm', 3]],
    { legende: 'Géométrie des ailes' });
  k.p(`En biais, β se place au coin aigu : c'est lui qui égalise les surfaces vues des deux ailes d'une même tête (11 % d'écart
    au lieu de 50 % dans l'autre sens, pour 70 gr). PSIDA affiche ces surfaces. Pour un ouvrage à plusieurs cellules, L = 1,15 D.`);

  k.h3('Le voile');
  const hv = Kc.hv, em = epaisseurAbaque(hv, 25, 'aile'), eF = (0.25 + 0.02 * hv) / 1.02, eB = Math.ceil(Math.max(eF, em) * 100 - 1e-6) / 100;
  k.p(`Le mur est calculé dans deux zones : la zone haute, de hauteur $h_v = ${t(hv)}$ m au-dessus de la semelle, et une seconde au
    milieu de la longueur du talus ($h_v = ${t(A.calc2.hv)}$ m), qui permet d'alléger le ferraillage. L'épaisseur à la base est la plus
    grande de celle que donne le fruit (tête 0,25 m, fruit 2 %) et de l'abaque $e_m$ du DT422, lu à $h − 0{,}50$ m pour une aile :`);
  k.eq(String.raw`e_b = \frac{e_t + f\,h_v}{1 + f} = \frac{0{,}25 + 0{,}02 \times ${t(hv)}}{1{,}02} = ${t(eF, 3)}\ \text{m}
    \qquad e_m(${t(hv - 0.5)}) = ${t(em, 3)}\ \text{m} \qquad e_b = ${t(eB)}\ \text{m}`);
  const Mgv = Kc.Ka * 20 * hv ** 3 / 6, Mqv = Kc.Ka * 10 * hv ** 2 / 2;
  k.p(`Poussée des terres $K_a = ${t(Kc.Ka)}$, $\\gamma = 20$ kN/m³, surcharge $q = 10$ kN/m² :
    $M_G = K_a \\gamma h_v^3/6$, $M_Q = K_a q h_v^2/2$, $M_u = 1{,}35\\,M_G + 1{,}5\\,M_Q$.`);
  k.cmp([['Épaisseur à la base $e_b$', eB, Kc.eB, 'm', 2], ['$M_G$ à la base', Mgv, Kc.voile.Mg, 'kN·m/m', 2], ['$M_Q$ à la base', Mqv, Kc.voile.Mq, 'kN·m/m', 2],
    ['$M_u$', 1.35 * Mgv + 1.5 * Mqv, Kc.voile.Mu, 'kN·m/m', 2]], { legende: 'Voile de la zone haute' });

  k.h3('La semelle : stabilité');
  const S = Kc.semelle, es = Kc.es, H = hv + es, Pg = Kc.Ka * 20 * H ** 2 / 2, Pq = Kc.Ka * 10 * H, Mr = Pg * H / 3 + Pq * H / 2;
  const W1 = 25 * (0.25 + eB) / 2 * hv, W2 = 25 * S.B * es, W3 = 20 * hv * S.b, x1 = S.a + eB / 2, x2 = S.B / 2, x3 = S.a + eB + S.b / 2;
  const Ms = W1 * x1 + W2 * x2 + W3 * x3, N = W1 + W2 + W3, FSr = Ms / Mr, FSg = N * Math.tan(30 * RAD) / (Pg + Pq);
  k.p(`La semelle a l'épaisseur du mur à sa base ($e_s = ${t(es)}$ m). PSIDA élargit sa largeur B par pas de 10 cm jusqu'à vérifier
    le renversement et le glissement (≥ 1,5), le tiers central et, si elle est donnée, la contrainte admissible. Pour
    $B = ${t(S.B)}$ m (patin ${fr(S.a, 2)} m, talon ${fr(S.b, 2)} m), sur la hauteur $H = h_v + e_s = ${t(H)}$ m :`);
  k.eq(String.raw`\begin{aligned}
    P_G &= K_a \gamma H^2/2 = ${t(Pg)} \quad P_Q = K_a q H = ${t(Pq)} \quad M_r = P_G H/3 + P_Q H/2 = ${t(Mr)}\ \text{kN·m/m}\\
    W_1 &= ${t(W1)}\ (x = ${t(x1, 3)}) \quad W_2 = ${t(W2)}\ (x = ${t(x2)}) \quad W_3 = ${t(W3)}\ (x = ${t(x3, 3)}) \quad M_s = ${t(Ms)}\ \text{kN·m/m}\\
    F_r &= M_s/M_r = ${t(FSr, 3)} \qquad F_g = \frac{N \tan\varphi}{P_G + P_Q} = \frac{${t(N)} \times \tan 30°}{${t(Pg + Pq)}} = ${t(FSg, 3)}
  \end{aligned}`);
  k.cmp([['Renversement $F_r$', FSr, S.FSr, '—', 3], ['Glissement $F_g$', FSg, S.FSg, '—', 3]], { legende: 'Stabilité de la semelle (≥ 1,5)' });

  k.h3('Le séisme (version 0.99.36)');
  const kh = 0.15, kv = 0.075, phiR = Math.asin((1 - Kc.Ka) / (1 + Kc.Ka)) / RAD, th = Math.atan(kh / (1 + kv)) / RAD;
  const f = phiR * RAD, q = th * RAD, rac = Math.sqrt(Math.sin(f) * Math.sin(f - q) / Math.cos(q)), KAE = Math.cos(f - q) ** 2 / (Math.cos(q) ** 2 * (1 + rac) ** 2);
  const E = calculMurAile(hv, { Ka: Kc.Ka, gamma: 20, q: 10, phiSol: 30, es, eT: 0.25, c: 0.05, h: A.h, seisme: { kh } });
  const Ed = 0.5 * KAE * (1 + kv) * 20 * hv ** 2;
  k.p(`Quand le cadre est calculé au séisme, les ailes le sont aussi, avec le $k_h$ de son action sismique (EN 1998-5 § 7.3.2,
    mur fléchi : r = 1, $k_v = \\pm 0{,}5\\,k_h$). La poussée totale est celle de Mononobe-Okabe, sans frottement terre-écran, l'angle
    de frottement du remblai étant déduit de $K_a$ : $\\varphi = \\arcsin\\frac{1 − K_a}{1 + K_a} = ${t(phiR, 2)}$°. PSIDA essaie
    $1 \\pm k_v$ et garde le plus défavorable, ici $1 + k_v$ : pour $k_h = 0{,}15$, $\\theta = \\arctan\\frac{k_h}{1 + k_v} = ${t(th, 3)}$° et`);
  k.eq(String.raw`K_{AE} = \frac{\cos^2(\varphi - \theta)}{\cos^2\theta\left[1 + \sqrt{\dfrac{\sin\varphi\,\sin(\varphi - \theta)}{\cos\theta}}\right]^2} = ${t(KAE, 4)}
    \qquad E_d = \tfrac12 K_{AE}\,\gamma\,(1 + k_v)\,h_v^2 = ${t(Ed)}\ \text{kN/m}`);
  k.cmp([['$K_{AE}$', KAE, E.seisme.K, '—', 4], ['$E_d$ sur le voile', Ed, E.seisme.voile.Ed, 'kN/m', 2], ['Contrôle : $K_{AE}$ pour $\\theta = 0$', 1 / 3, kaeMononobe(30, 0, 0), '—', 4]],
    { legende: 'Poussée dynamique de Mononobe-Okabe (k_h = 0,15)' });
  k.p(`L'incrément dynamique $E_d − K_a\\gamma h^2/2$ agit à mi-hauteur ; l'inertie du voile s'y ajoute. En situation accidentelle
    les coefficients partiels valent 1 : renversement et glissement ≥ 1, excentricité ≤ B/3. Ici la semelle passe à
    ${fr(E.semelle.B, 2)} m ($F_r = ${t(E.semelle.seisme.FSr)}$, $F_g = ${t(E.semelle.seisme.FSg)}$).`);

  k.h3('Jonction avec le piédroit et plan');
  k.p(`Le champ « Jonction » offre les deux solutions du guide (§ 3.6.1). Solution 1 (défaut) : le mur est encastré dans le
    piédroit ; PSIDA ajoute sur 1,00 m des barres en face avant de même section que les verticales côté terre. Solution 2 : un
    joint sépare le mur du piédroit. La feuille OH-AIL-01 donne l'élévation développée de chaque aile, la coupe A-A et le
    bordereau des quatre ailes.`);
  const svgA = feuilleSVG(planMursAile(cad, {}), { mm: false });
  k.fig({ svg: recadrer(svgA, [0.185, 0.445, 0.6, 0.88]), largeur: 85, legende: 'Feuille OH-AIL-01 : élévation développée d\'une aile, revanche de 0,50 m, zones 1 et 2.' });
  k.fig({ svg: recadrer(svgA, [0.695, 0.05, 0.955, 0.39]), largeur: 70, legende: 'Feuille OH-AIL-01 : coupe A-A à l\'enracinement (voile, semelle de 2,40 m, repères).' });
  k.h2('Limites');
  k.ul([
    'Dalle de transition : appuis simples, remblai non déformable ; tassement du remblai et dalle en console non traités.',
    'Murs en aile : poussée de Rankine (ou $K_a$ saisi), frottement terre-écran nul ; sol de fondation par contrainte admissible.',
    'Les murs en retour des culées restent traités par le chapitre 13 (§ 13.10).',
  ]);
}
