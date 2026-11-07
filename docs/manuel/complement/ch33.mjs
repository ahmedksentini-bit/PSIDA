/**
 * Chapitre 33 — Plans d'exécution : compléments des versions 0.99.29 et 0.99.30 (et corrections de la 0.99.37).
 */
import { formDefaults } from '../../../tools/formdefaults.mjs';
import { EXEMPLES, donnees } from '../../../tools/exemples.mjs';
import { parseData, compute } from '../../../src/pipeline.js';
import { donneesCablage, ordreTension, planCablageDalle } from '../../../src/plans/cablage_dalle.js';
import { pointsImplantation, versProjet, nivellementTablier } from '../../../src/plans/implantation.js';
import { geometrieAppui } from '../../../src/plans/appuis.js';
import { flecheLongTermeBA } from '../../../src/fleche_ba.js';
import { materialsEC2 } from '../../../src/section_ec2.js';
import { calepinageCorniches, EQ_DEFAUTS } from '../../../src/plans/equipements.js';
import { geometrie } from '../../../src/plans/geometrie.js';
import { anchorage } from '../../../src/rebar.js';
import { texteRecouvrements } from '../../../src/plans/notes_durabilite.js';
import { controlesPlans } from '../../../src/plans/controles.js';
import { feuilleSVG } from '../../../src/plans/svg.js';
import { recadrer } from './outils.mjs';

export default async function chapitre33(k) {
  const { fr } = k;
  const t = (x, d = 2) => fr(x, d).replace(',', '{,}').replace(/ /g, '\\,');

  k.h1(33, 'Plans d\'exécution : compléments');
  k.p(`Les versions 0.99.29 et 0.99.30 ont repris les plans après la relecture de plans d'entreprise réels (autoroute A640,
    lots 5 à 7 : 34 feuilles d'appuis, 14 de tablier, 10 de cadre). Les défauts les plus fréquents chez eux — nomenclature recopiée
    d'un appui à l'autre, abouts différents entre coffrage et câblage, recouvrements variables d'une feuille à l'autre, classes
    d'exposition absentes — sont devenus des règles ou des contrôles automatiques de PSIDA. Ce chapitre présente les nouvelles
    feuilles et refait leurs calculs à la main.`);

  // —— câblage
  const st3 = compute(parseData(donnees(EXEMPLES[2]))), C = donneesCablage(st3), dp = st3.psidp, xs = C.xs;
  k.h2('Le câblage de la dalle précontrainte');
  k.p(`La feuille TAB-CAB-01 dessine le câble moyen de PSI-DP (cote depuis l'intrados $v' + z$), prolongé tangentiellement jusqu'aux
    abouts, ses ordonnées aux dixièmes de chaque travée, les points bas et hauts, les plaques d'ancrage et un tableau de mise
    en tension. Exemple 3 : dalle de 18 + 25 + 25 + 18 m, ${C.n} câbles ${dp.unit.label}, $E_p = ${fr(dp.bp.Ep, 0)}$ MPa,
    $\\sigma_{p0} = ${t(dp.sigma0, 0)}$ MPa, tension aux deux extrémités.`);
  const iF = xs.indexOf(C.xFixe), sF = dp.r.friction.sL[iF] / 1000, dA = xs[0] - C.uA;
  const dl = ((dp.sigma0 + sF) / 2 * C.xFixe + dp.sigma0 * dA) / dp.bp.Ep;
  k.p(`**Allongement.** Chaque extrémité tire le câble jusqu'au point fixe, où les tensions venues des deux côtés s'égalent
    (ici $x = ${t(C.xFixe)}$ m, au milieu, $\\sigma = ${t(sF, 1)}$ MPa après frottement). L'allongement vaut $\\Delta l = \\int \\sigma\\,ds / E_p$
    sur cette longueur, plus la longueur hors modèle entre l'about et le premier point du câble (${fr(dA, 2)} m) à $\\sigma_{p0}$.
    La tension décroît presque linéairement : à la main, on prend la moyenne des deux extrémités.`);
  k.eq(String.raw`\Delta l \approx \frac{\dfrac{\sigma_{p0} + \sigma_{fixe}}{2}\,x_{fixe} + \sigma_{p0}\,d_A}{E_p}
    = \frac{\dfrac{${t(dp.sigma0, 0)} + ${t(sF, 1)}}{2} \times ${t(C.xFixe)} + ${t(dp.sigma0, 0)} \times ${t(dA)}}{${t(dp.bp.Ep, 0)}} = ${t(dl * 1000, 1)}\ \text{mm}`);
  k.cmp([['Allongement côté C0', dl * 1000, C.allG * 1000, 'mm', 1, 0.005]], { legende: 'Allongement théorique (exemple 3)' });
  k.p(`PSIDA intègre le long du câble développé. Avec une tension par une seule extrémité, tout le câble s'allonge vers
    elle, et la longueur hors modèle côté passif est comptée à la tension qui y arrive (corrigé en version 0.99.37 pour la
    tension depuis l'extrémité opposée à C0).`);
  const ord = ordreTension(C.n), c = Math.ceil(C.n / 2), main = [c]; for (let q = 1; q < c; q++) main.push(c + q, c - q);
  k.p(`**Ordre de mise en tension.** Les câbles se tendent du centre vers les bords, en alternant, pour que la dalle reste
    symétriquement comprimée : pour n impair, c = ⌈n/2⌉ puis c + 1, c − 1, c + 2… ; pour n pair, c + 1, c, c + 2, c − 1… (comme
    l'OA67). Pour n = ${C.n} : ${ord.slice(0, 9).join(', ')}… ${ord.slice(-2).join(', ')}.`);
  k.cmp([['Rang du 3ᵉ câble tendu', main[2], ord[2], '—', 0], ['Rang du dernier câble tendu', main.at(-1), ord.at(-1), '—', 0]], { legende: 'Ordre de mise en tension' });
  k.fig({ svg: recadrer(feuilleSVG(planCablageDalle(st3, {}), { mm: false }), [0, 0, 1, 0.55]), legende: 'Feuille TAB-CAB-01 de l\'exemple 3 (partie haute) : coupe développée du câble moyen et ordonnées.' });

  // —— ferraillage passif d'about
  const sd = dp.anchors.sides[0], V = sd.vert, lv = V.levels[0], ssl = 2 / 3 * dp.steel.fe, a = 0.25;   // f_e en kPa
  const Rj = 0.25 * (1 - Math.min(a, lv.d) / lv.d) * lv.F, Ae = Math.max(Rj / ssl, 0.15 * lv.F / ssl), As = 0.04 * lv.F / ssl;
  k.h2('Le ferraillage passif de la dalle précontrainte');
  k.p(`La feuille de ferraillage d'une dalle précontrainte reprend les aciers passifs du calcul PSI-DP (peau, non-fragilité,
    zones tendues) et ajoute les armatures des zones d'ancrage (BPEL 91 annexe 4). Dans le plan vertical, les ${C.n} câbles
    forment un seul niveau : $F = ${t(lv.F, 1)}$ kN, prisme de hauteur $d = ${t(lv.d, 4)}$ m, plaque de $a = 0{,}25$ m,
    $\\bar\\sigma_s = \\tfrac23 f_e = ${t(ssl / 1000, 1)}$ MPa :`);
  k.eq(String.raw`A_s = 0{,}04\,\frac{F}{\bar\sigma_s} = ${t(As * 1e4, 2)}\ \text{cm}^2 \qquad
    R = 0{,}25\left(1 - \frac{a}{d}\right)F = ${t(Rj, 1)}\ \text{kN} \qquad A_e = \frac{R}{\bar\sigma_s} = ${t(Ae * 1e4, 2)}\ \text{cm}^2`);
  k.cmp([['$A_s$ de surface', As * 1e4, V.As * 1e4, 'cm²', 2], ['$A_e$ d\'éclatement', Ae * 1e4, V.Ae * 1e4, 'cm²', 2]], { legende: 'Zone d\'ancrage de l\'exemple 3, plan vertical' });
  k.p(`$A_s$ devient des U HA12 dans les 0,1 d de la face d'about, $A_e$ des U HA14 répartis de 0,1 d à d. Dans le plan horizontal,
    les barres transversales d'éclatement sont réparties sur la longueur de régularisation horizontale ; depuis la version
    0.99.37, leur diamètre est choisi pour qu'elles y tiennent à 10 cm d'entraxe au moins. La bielle d'about demande des
    armatures inférieures $A_{s,inf} = (H_b − F_p)/f_{yd}$. Le frettage local de chaque ancrage suit l'agrément du procédé.`);

  // —— implantation
  const base = { ...formDefaults(), niv_actif: 'on', niv_zCh: '100;100.5;101;101.2' };
  const stI = compute(parseData({ ...base, niv_R: '2000' })), { points } = pointsImplantation(stI), A1 = geometrieAppui(stI, 1);
  const c1 = points.find(q => q.appui === 1 && q.point === 'coin 1'), proj = { E0: 500000, N0: 3800000, gis: 12.5 }, P = versProjet(c1, proj);
  const g = proj.gis * Math.PI / 200, E = proj.E0 + c1.x * Math.sin(g) - c1.y * Math.cos(g), Nn = proj.N0 + c1.x * Math.cos(g) + c1.y * Math.sin(g);
  k.h2('Implantation et nivellement');
  k.p(`La feuille d'implantation donne, pour chaque appui, le centre et les quatre coins de la semelle (et les pieux) dans le
    repère de l'ouvrage (x le long de l'axe depuis C0, y vers la gauche), puis dans le repère du projet si l'on saisit
    l'origine $(E_0, N_0)$ et le gisement g de l'axe. Les coins sont numérotés dans le sens trigonométrique depuis l'angle situé
    côté C0 et à droite de l'axe (y < 0). Pour la pile P1 de l'exemple fil rouge (semelle ${fr(A1.B, 2)} × ${fr(A1.Lf, 2)} m centrée à x = 14 m),
    le coin 1 est en $x = 14 − ${t(A1.B / 2, 3)} = ${t(c1.x, 3)}$, $y = ${t(c1.y, 3)}$. Avec $E_0 = 500\\,000$, $N_0 = 3\\,800\\,000$ et
    $g = 12{,}5$ gr :`);
  k.eq(String.raw`E = E_0 + x \sin g - y \cos g = ${t(E, 4)} \qquad N = N_0 + x \cos g + y \sin g = ${t(Nn, 4)}`);
  k.cmp([['$E$ du coin 1 de P1', E, P.E, 'm', 4, 1e-9, 1e-4], ['$N$ du coin 1 de P1', Nn, P.N, 'm', 4, 1e-9, 1e-4]], { legende: 'Coordonnées d\'implantation' });
  const Nv = nivellementTablier(stI), sT = Nv.stations.find(q => /2\/4/.test(q.nom) && Math.abs(q.u - 23) < 1e-6);
  const tRev = stI.p.mat.tRev, za = 100.5 - tRev, zb = 101 - tRev, zl = za + (zb - za) * (23 - 14) / 18, zp = zl + (23 - 14) * (32 - 23) / (2 * 2000);
  k.p(`**Nivellement.** On saisit les cotes de la chaussée sur l'axe de chaque appui ; PSIDA retranche le revêtement
    (${fr(tRev * 100, 0)} cm), interpole entre appuis et, depuis la version 0.99.30, ajoute la flèche d'un raccordement parabolique de
    rayon R (champ niv_R, positif pour un point haut) : $z = z_a + (z_b − z_a)\\frac{u − a}{b − a} + \\frac{(u − a)(b − u)}{2R}$.
    Au milieu de la travée centrale (u = 23 m, a = 14, b = 32 m, R = 2 000 m) :`);
  k.eq(String.raw`z = ${t(za, 2)} + (${t(zb, 2)} - ${t(za, 2)}) \times \frac{9}{18} + \frac{9 \times 9}{2 \times 2\,000} = ${t(zl, 3)} + ${t(81 / 4000, 5)} = ${t(zp, 5)}\ \text{m}`);
  k.cmp([['Cote de l\'axe à mi-travée 2', zp, sT.z, 'm', 5, 1e-9, 1e-6]], { legende: 'Nivellement (raccordement parabolique)' });
  k.p(`La feuille ajoute la contre-flèche du coffrage : $−w$ de la flèche à long terme, celle de PSI-DP pour une dalle
    précontrainte, celle du paragraphe suivant pour une dalle armée.`);

  // —— contre-flèche BA
  k.h2('La contre-flèche des dalles armées');
  const L = 10, n = 100, sections = Array.from({ length: n + 1 }, (_, q) => ({ x: L * q / n, span: 0 })), q8 = 8;
  const S = { deck: { b: 0.5, h: 0.5, beam: { sections, x0: [0, L] } }, perm: { M: sections.map(s => q8 * s.x * (L - s.x) / 2) },
    rebar: { check: sections.map(() => ({ provBot: 15.71e-4, provTop: 5.65e-4 })) }, p: { mat: { fck: 30, fyk: 500, c: 0.05, phi: 0.02, phiT: 0.016 }, phiFluage: 2 } };
  const F = flecheLongTermeBA(S), mat = materialsEC2({ fck: 30, fyk: 500 }), Eeff = mat.Ecm / 3, aE = 200000 / Eeff;
  const As1 = 15.71e-4, As2 = 5.65e-4, d = 0.5 - 0.05 - 0.01, dpr = 0.05 + 0.008, Ah = 0.5 + aE * (As1 + As2);
  const yG = (0.5 * 0.25 + aE * (As1 * d + As2 * dpr)) / Ah, II = 0.5 ** 3 / 12 + 0.5 * (0.25 - yG) ** 2 + aE * As1 * (d - yG) ** 2 + aE * As2 * (yG - dpr) ** 2;
  const w = 5 * q8 * L ** 4 / (384 * Eeff * 1000 * II);
  k.p(`Depuis la version 0.99.30, PSIDA calcule la flèche à long terme d'une dalle armée sous les charges permanentes (EN 1992-1-1
    § 7.4.3) : courbure $\\kappa = \\zeta \\kappa_{II} + (1 − \\zeta)\\kappa_I$ avec $\\zeta = 1 − 0{,}5\\,(M_{cr}/M)^2$ (nul si $M < M_{cr}$),
    module effectif $E_{c,eff} = E_{cm}/(1 + \\varphi)$, aciers réellement fournis par le plan de ferraillage, double intégration
    par travée. Depuis la version 0.99.37, l'état I est la section non fissurée homogénéisée (aciers compris, $\\alpha_e = E_s/E_{c,eff}$),
    comme l'état II ; $M_{cr}$ se calcule sur la section homogénéisée instantanée. Les moments étant ceux de l'analyse
    élastique, la fissuration des zones d'appui réduirait la flèche des travées alors que la redistribution réelle
    l'augmente : la flèche retenue n'est donc jamais inférieure à celle de la section non fissurée. Le retrait n'est pas compté.`);
  k.p(`**Contrôle sur une travée isostatique** de 10 m, dalle de 0,50 m par mètre, C30/37, φ = 2, HA20 e = 0,20 en bas
    ($A_s = 15{,}71$ cm²/m) et 5,65 cm²/m en haut, sous q = 8 kN/m ($M = 100$ kN·m < $M_{cr}$) :
    $E_{c,eff} = ${t(mat.Ecm, 0)}/3 = ${t(Eeff, 0)}$ MPa, $\\alpha_e = ${t(aE, 2)}$, centre de gravité homogénéisé à $${t(yG, 4)}$ m du dessus et
    $I_I = ${t(II * 1e4, 2)} \\times 10^{-4}$ m⁴ :`);
  k.eq(String.raw`w = \frac{5\,q\,L^4}{384\,E_{c,eff}\,I_I} = \frac{5 \times 8 \times 10^4}{384 \times ${t(Eeff * 1000, 0)} \times ${t(II, 6)}} = ${t(w * 1000, 2)}\ \text{mm}`);
  k.cmp([['Flèche à mi-portée, section non fissurée', w * 1000, F.w[n / 2] * 1000, 'mm', 2, 0.002]], { legende: 'Flèche à long terme d\'une travée isostatique' });
  const stB = compute(parseData(formDefaults())), FB = flecheLongTermeBA(stB);
  k.p(`Pour l'exemple fil rouge, la flèche à long terme atteint ${fr(FB.wMax * 1000, 1)} mm à x = ${fr(FB.xMax, 1)} m (travée centrale) :
    c'est la contre-flèche que porte le plan de nivellement en mode « BA ».`);

  // —— corniches
  const stC = compute(parseData(formDefaults())), Gc = geometrie(stC), CC = calepinageCorniches(stC, EQ_DEFAUTS, Gc), Rv = CC.rives[0];
  const Lr = Rv.Lr, n0 = Math.floor((Lr + 0.02) / 2.5 + 1e-9), nc = n0 - 1, Lend = (Lr - nc * 2.48 - (nc + 1) * 0.02) / 2;
  k.h2('Le calepinage des corniches préfabriquées');
  k.p(`La feuille des équipements découpe chaque rive en éléments de $L_e = 2{,}48$ m séparés de joints de 2 cm, avec deux éléments
    d'about égaux, coupés suivant le biais. Pour la rive de l'exemple fil rouge, $L_{rive} = ${t(Lr)}$ m : $n_0 = \\lfloor (L_{rive} + j)/(L_e + j) \\rfloor = ${n0}$ ;
    il reste ${fr(Lr - (n0 * 2.5 - 0.02), 2)} m, d'où $n = n_0 − 1 = ${nc}$ éléments courants et deux abouts de`);
  k.eq(String.raw`L_{about} = \frac{L_{rive} - n L_e - (n + 1)\,j}{2} = \frac{${t(Lr)} - ${nc} \times 2{,}48 - ${nc + 1} \times 0{,}02}{2} = ${t(Lend, 3)}\ \text{m}`);
  k.cmp([['Éléments courants', nc, Rv.nc, '—', 0], ['Longueur d\'about', Lend, Rv.Lend, 'm', 3]], { legende: 'Calepinage des corniches' });
  k.p(`Masse d'un élément : $25\\,A_c L/9{,}81$ t, $A_c$ étant l'aire réelle de la section de corniche. En biais, l'about est coupé
    suivant la ligne d'appui : $\\Delta = (L_{talon} + E)\\,|\\cot\\psi|$. Les réservations sont réparties au pas saisi (1,50 m).`);

  // —— barres > 12 m
  const { fck, fyk } = stC.p.mat, hD = stC.deck.h, fctd = 0.7 * 0.3 * fck ** (2 / 3) / 1.5, fyd = fyk / 1.15;
  const fbd = 2.25 * fctd, lb = 0.020 / 4 * fyd / fbd, l0 = 1.5 * lb, fbdS = 0.7 * fbd, l0S = 1.5 * 0.020 / 4 * fyd / fbdS;
  const aI = anchorage(20, { fck, fyk, h: 1 }), aS = anchorage(20, { fck, fyk, top: true, h: hD });
  k.h2('Barres de plus de 12 m et recouvrements');
  k.p(`Les barres du commerce mesurent 12 m. Une barre plus longue est coupée en n pièces égales recouvertes de
    $l_0 = \\alpha_6 l_{bd}$ ($\\alpha_6 = 1{,}5$, EN 1992-1-1 § 8.7.3) : $n = \\lceil (\\ell − l_0)/(12 − l_0) \\rceil$ ; un U trop long devient deux L.
    Pour l'exemple fil rouge (C35/45, B500, HA20) : $f_{ctd} = 0{,}7 \\times 0{,}3 f_{ck}^{2/3}/1{,}5 = ${t(fctd, 3)}$ MPa ;
    en bonne adhérence $f_{bd} = 2{,}25 \\eta_1 f_{ctd} = ${t(fbd, 3)}$ MPa et $l_{b,rqd} = \\frac{\\phi}{4}\\frac{f_{yd}}{f_{bd}} = ${t(lb, 3)}$ m ;
    en nappe supérieure d'une dalle de ${fr(hD, 2)} m, l'adhérence n'est pas bonne (§ 8.4.2 (2)) et $\\eta_1 = 0{,}7$.`);
  k.cmp([['$l_0$ HA20, nappe inférieure', l0, aI.l0, 'm', 3], ['$l_0$ HA20, nappe supérieure', l0S, aS.l0, 'm', 3]], { legende: 'Longueurs de recouvrement (EN 1992-1-1 § 8.7.3)' });
  k.p(`La note des plans donne ces longueurs en diamètres, par nappe : « ${texteRecouvrements([12, 16, 20, 25], { fck, fyk }, { hauteur: hD })} ».
    (Jusqu'à la version 0.99.36, la note ne donnait que la valeur de la nappe inférieure, et les bordereaux des appuis comptaient
    les barres découpées à leur longueur d'avant découpe : les deux points sont corrigés.)`);

  // —— contrôles
  const CT = controlesPlans(compute(parseData({ ...formDefaults(), cover: '0.055', ap_zone: '1' })));
  k.h2('Les contrôles automatiques des plans');
  k.p(`L'onglet Plans affiche un tableau de contrôles avant l'export : PSIDA relit ses propres feuilles comme on relit celles d'une
    entreprise. Pour l'exemple fil rouge, ${CT.length} contrôles, ${CT.filter(q => !q.ok).length} non conforme(s) :`);
  const vus = new Set(), lignes = [];
  for (const q of CT) { const cle = q.controle; if (vus.has(cle)) continue; vus.add(cle); lignes.push([q.objet, q.controle, q.valeur, q.limite, q.ok ? 'OK' : 'NON']); }
  k.table(['Objet', 'Contrôle', 'Valeur', 'Limite', 'Verdict'], lignes, { legende: 'Contrôles des plans (un exemple par contrôle)', larg: [14, 28, 20, 30, 8] });
  k.p(`Un béton de C25/30 avec 3 cm d'enrobage fait sortir deux NON (classe de béton, axe des aciers). Les mandrins de cintrage
    (4 Ø jusqu'à HA16, 7 Ø au-delà, § 8.3) sont appliqués d'office par le bordereau. Chaque feuille porte enfin ses notes de
    durabilité : classes d'exposition, $c_{nom}$ au nu des armatures extérieures, axe des aciers, recouvrements.`);
}
