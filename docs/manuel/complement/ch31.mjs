/**
 * Chapitre 31 — Ponts à poutres en béton armé à travées continues (dossier Sétra PSI-BA 77), versions 0.99.18 à 0.99.23.
 */
import { formDefaults } from '../../../tools/formdefaults.mjs';
import { parsePoutres, computePoutres } from '../../../src/beams/run.js';
import { ContinuousBeam } from '../../../src/beam.js';
import { coefficientsLongitudinaux } from '../../../src/beams/entretoise_int.js';
import { donneesBA, planFerraillageBA } from '../../../src/plans/poutres_ba.js';
import { nomenclatureBA } from '../../../src/plans/nomenclature_ba.js';
import { rayonCintrage } from '../../../src/plans/bordereau.js';
import { feuilleSVG } from '../../../src/plans/svg.js';
import { recadrer } from './outils.mjs';

export const DP_PSIBA = {
  ...formDefaults(), pt_type: 'BA', pt_geo: 'rect', pt_spans: '11.66, 18.80, 18.80, 14.45', pt_continu: 'oui', pt_entInt: '1, 2, 2, 1', pt_beInt: '0.38',
  pt_n: '3', pt_b1: '4.00', pt_hd: '0.20', pt_parts: '0.38 0.76', pt_road: '-3.75, 3.75', pt_foot: '-5,-3.75 ; 3.75,5', pt_lines: '', pt_bands: '',
  pt_fck: '30', pt_fyk: '400', pt_b0: '0.38', pt_cover: '0.10', pt_mil: 'Mc120', pt_ret: '0', pt_tePile: '0.50',
};

/** Équation des trois moments (inertie constante, appuis simples) : moments sur appuis intermédiaires sous w_i par travée. */
export function troisMoments(L, w) {
  const m = L.length - 1, A = [...Array(m)].map(() => Array(m).fill(0)), b = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    A[i][i] = 2 * (L[i] + L[i + 1]);
    if (i > 0) A[i][i - 1] = L[i];
    if (i < m - 1) A[i][i + 1] = L[i + 1];
    b[i] = -(w[i] * L[i] ** 3 + w[i + 1] * L[i + 1] ** 3) / 4;
  }
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
    const f = A[j][i] / A[i][i];
    for (let c = 0; c < m; c++) A[j][c] -= f * A[i][c];
    b[j] -= f * b[i];
  }
  const x = Array(m);
  for (let i = m - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < m; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return { x, A0: null };
}

export default async function chapitre31(k) {
  const { fr } = k;
  const r = computePoutres(parsePoutres(DP_PSIBA));
  const L = [11.66, 18.8, 18.8, 14.45];

  k.h1(31, 'Ponts à poutres en béton armé à travées continues (PSI-BA 77)');
  k.p(`Depuis la version 0.99.19, l'onglet « Tablier à poutres » calcule des poutres en béton armé continues sur 2 à 6 travées,
    coulées sur cintre, comme le dossier pilote Sétra PSI-BA 77. Les versions suivantes ont ajouté les entretoises
    intermédiaires (0.99.20), leur dessin (0.99.21) et la nomenclature des armatures (0.99.23). Le chapitre suit l'exemple
    d'application du dossier PSI-BA : quatre travées de 11,66 – 18,80 – 18,80 – 14,45 m, trois poutres espacées de 4,00 m.
    Chaque résultat est refait à la main puis comparé à PSIDA, et, quand la note PSI-BA le donne, à la note.`);

  k.h2('La saisie');
  k.p(`Choisissez « béton armé » comme type de poutre, puis « continues (coulées sur cintre, PSI-BA) » dans le champ
    « Travées (poutres BA) ». Les champs propres aux travées continues n'apparaissent qu'à ce moment.`);
  k.table(['Champ', 'Exemple', 'Rôle'], [
    ['Travées (poutres BA)', 'continues', 'poutre continue d\'inertie constante sur appuis simples indéformables'],
    ['Entretoises intermédiaires par travée', '1, 2, 2, 1', '0 : Guyon-Massonnet ; 1 ou plus : méthode de Courbon. Un nombre pour toutes les travées ou une liste'],
    ['Épaisseur des entretoises intermédiaires', '0,38 m', 'épaisseur de l\'entretoise calculée (PSI-BA : 0,15 m au moins avec du HA25, 0,20 m avec du HA32)'],
    ['Épaisseur des entretoises sur piles', '0,50 m', 'largeur e de la réduction au nu (§ 31.6)'],
    ['Gousset d\'appui : épaisseur d\'âme, longueur', 'vide', 'âme élargie au droit des piles ; vide : b₀, sur 0,15 L de part et d\'autre'],
  ], { legende: 'Champs des poutres BA continues', larg: [32, 16, 52] });
  k.table(['Donnée', 'Valeur'], [
    ['Travées', '11,66 – 18,80 – 18,80 – 14,45 m'],
    ['Poutres', '3 poutres rectangulaires 0,38 × 0,76 m sous hourdis de 0,20 m, entraxe 4,00 m'],
    ['Profil en travers', 'chaussée de 7,50 m (y = −3,75 à 3,75 m), deux trottoirs de 1,25 m'],
    ['Matériaux', 'béton f_ck = 30 MPa, aciers f_yk = 400 MPa, axe des aciers à 0,10 m'],
    ['Trafic', 'Fascicule 61 (A, Bc, Bt, Br, Mc120, trottoirs) et LM1 de l\'EN 1991-2'],
  ], { legende: 'Données de l\'exemple (superstructures non saisies : seul le poids propre est permanent)', larg: [28, 72] });

  // —— Courbon
  k.h2('La répartition transversale de Courbon');
  k.p(`Avec des entretoises intermédiaires et au moins trois poutres, PSIDA abandonne Guyon-Massonnet pour la méthode de Courbon,
    celle de la note PSI-BA : les entretoises, supposées infiniment rigides, font tourner la section en bloc. Une charge P
    d'excentricité e se répartit entre les n poutres d'ordonnées $y_k$ suivant :`);
  k.eq(String.raw`R_k = P\left(\frac{1}{n} + \frac{e\,y_k}{\sum y_j^2}\right) \qquad \eta_k = \frac{n\,R_k}{P} = 1 + \frac{n\,e\,y_k}{\sum y_j^2}`);
  k.p(`Ici $y = -4{,}00 ;\ 0 ;\ 4{,}00$ m, d'où $\\sum y^2 = 32$ m². Le coefficient $\\eta$ multiplie l'effet d'une charge
    supposée répartie également entre les poutres (η = 1 pour toutes les poutres d'une charge centrée). Les systèmes sont placés
    au plus près de la poutre de rive y = −4,00 m :`);
  const b0 = r.spans[1].beams[0].eta, eta = e => 1 + 3 * e * 4 / 32;
  k.ul([
    '**Bc** : deux files accolées, la première roue à 0,25 m du bord de la chaussée. Roues à −3,50 / −1,50 m et −1,00 / 1,00 m : résultante à $e = 1{,}25$ m.',
    '**Bt** : deux tandems dans des bandes de 3,00 m, de −3,75 à −0,75 m puis de −0,75 à 2,25 m : $e = (2{,}25 − 0{,}75)/2 = 0{,}75$ m.',
    '**Mc120** : char de 4,30 m de large contre le bord de la chaussée : $e = 3{,}75 − 2{,}15 = 1{,}60$ m.',
    '**A(l)** : la chaussée entière, centrée : $e = 0$.',
  ]);
  k.cmp([
    ['$\\eta$ Bc, poutre de rive', eta(1.25), b0.Bc, '—', 5],
    ['$\\eta$ Bt, poutre de rive', eta(0.75), b0.Bt, '—', 5],
    ['$\\eta$ Mc120, poutre de rive', eta(1.6), b0.Mc120, '—', 4],
    ['$\\eta$ A(l), toutes les poutres', 1, b0.A, '—', 4],
  ], { legende: 'Coefficients de Courbon de la poutre de rive (travée 2)' });
  k.p(`La note PSI-BA pondère chaque poutre par son inertie ; avec trois poutres identiques, les deux écritures coïncident.`);

  // —— Charges permanentes
  k.h2('Les moments sur appuis des charges permanentes');
  k.p(`La poutre est continue, d'inertie constante (les goussets ne sont pas comptés dans la raideur, ce qui est prudent sur
    appui). Sous une charge uniforme $w_i$ par travée, l'équation des trois moments de Clapeyron s'écrit pour chaque appui
    intermédiaire i :`);
  k.eq(String.raw`L_i\,M_{i-1} + 2\,(L_i + L_{i+1})\,M_i + L_{i+1}\,M_{i+1} = -\frac{w_i L_i^3 + w_{i+1} L_{i+1}^3}{4}`);
  const wN = [3.691, 3.812, 3.812, 3.671], mN = troisMoments(L, wN).x;
  k.p(`**Recoupement avec la note PSI-BA.** La note donne pour la poutre 1 des charges permanentes de 3,691 / 3,812 / 3,812 /
    3,671 t/m (poids propre et superstructures). Avec $M_1 = M_5 = 0$ :`);
  k.eq(String.raw`\begin{aligned}
    61{,}92\,M_2 + 18{,}80\,M_3 &= -\tfrac{1}{4}(3{,}691 \times 11{,}66^3 + 3{,}812 \times 18{,}80^3) = -${fr((wN[0] * 11.66 ** 3 + wN[1] * 18.8 ** 3) / 4, 1).replace(',', '{,}')}\\
    18{,}80\,M_2 + 75{,}20\,M_3 + 18{,}80\,M_4 &= -\tfrac{1}{4}(2 \times 3{,}812 \times 18{,}80^3) = -${fr(2 * 3.812 * 18.8 ** 3 / 4, 1).replace(',', '{,}')}\\
    18{,}80\,M_3 + 66{,}50\,M_4 &= -\tfrac{1}{4}(3{,}812 \times 18{,}80^3 + 3{,}671 \times 14{,}45^3) = -${fr((wN[2] * 18.8 ** 3 + wN[3] * 14.45 ** 3) / 4, 1).replace(',', '{,}')}
  \end{aligned}`);
  const B = new ContinuousBeam(L, { nGrid: 400, nSec: 20 });
  const Mlig = i => {
    const IL = B.ILM[B.supportSectionIndex(i)];
    let m = 0;
    for (let p = 1; p < B.positions.length; p++) {
      const j = B.positions[p].j;
      if (j > 3) continue;
      m += wN[Math.min(Math.max(j, 0), 3)] * (IL[p] + IL[p - 1]) / 2 * (B.positions[p].x - B.positions[p - 1].x);
    }
    return m;
  };
  const note = [-90.942, -119.933, -102.950];
  k.table(['Appui', 'À la main', 'Note PSI-BA', 'PSIDA (lignes d\'influence)', 'Écart PSIDA / main'],
    [0, 1, 2].map(i => {
      const p = Mlig(i + 1);
      k.controles.push({ chapitre: '31', libelle: `$M$ appui ${i + 2}, charges de la note`, main: mN[i], psida: p, rel: Math.abs(p - mN[i]) / Math.abs(mN[i]), tol: 0.002, ok: Math.abs(p - mN[i]) <= 0.002 * Math.abs(mN[i]) });
      return [`${i + 2}`, fr(mN[i], 2), fr(note[i], 2), fr(p, 2), `${fr(100 * (p - mN[i]) / mN[i], 2)} %`];
    }), { legende: 'Moments sur piles des charges permanentes de la note, poutre 1 (t·m)', larg: [12, 20, 20, 26, 22] });
  k.p(`PSIDA n'a pas résolu ce système : il intègre la charge sur les lignes d'influence de la poutre continue, celles qui servent
    au trafic. Le résultat est le même, à la discrétisation près.`);
  const g = 3.2664 * 25 / 3, mG = troisMoments(L, [g, g, g, g]).x;
  k.p(`**Dans l'exemple saisi**, seul le poids propre est permanent : hourdis $12{,}00 \\times 0{,}20 = 2{,}400$ m² et poutres
    $3 \\times 0{,}38 \\times 0{,}76 = 0{,}866$ m², soit $3{,}266 \\times 25 = 81{,}66$ kN/m pour le tablier et, par Courbon
    (charge centrée, η = 1), $g = 27{,}22$ kN/m par poutre. Le même système donne :`);
  k.cmp([0, 1, 2].map(i => [`$M_G$ appui ${i + 2}, poutre de rive`, mG[i], r.appuis[i].beams[0].Mcomp.G, 'kN·m', 1]),
    { legende: 'Moments sur piles du poids propre' });

  // —— A(l)
  k.h2('Le trafic sur appui : la charge A(l)');
  k.p(`Pour le moment négatif sur l'appui 3, la ligne d'influence est négative sur les deux travées voisines et positive au-delà :
    on charge les travées 2 et 3, soit une longueur chargée $l = 37{,}60$ m. Avec deux voies de 3,75 m en première classe
    ($a_1 = 1$, $a_2 = v_0/v = 3{,}50/3{,}75$) :`);
  const l = 37.6, A = 0.23 + 36 / (l + 12), a2 = 3.5 / 3.75, qA = A * a2 * 7.5 / 3 * 10, mA = troisMoments(L, [0, qA, qA, 0]).x;
  k.eq(String.raw`A(l) = 0{,}23 + \frac{36}{l + 12} = 0{,}23 + \frac{36}{49{,}60} = ${fr(A, 4).replace(',', '{,}')}\ \text{t/m}^2
    \qquad q = A(l)\,a_1 a_2 \times 7{,}50 / 3 = ${fr(qA, 2).replace(',', '{,}')}\ \text{kN/m par poutre}`);
  k.p(`L'équation des trois moments avec $w_2 = w_3 = q$ et $w_1 = w_4 = 0$ donne le moment sur l'appui 3 :`);
  k.cmp([['$M_{A(l)}$ appui 3, poutre de rive', mA[1], r.appuis[1].beams[0].Mcomp.A, 'kN·m', 1]],
    { legende: 'Moment de A(l) sur l\'appui 3' });
  k.p(`La note PSI-BA trouve −79,30 t·m sur cet appui (−793 kN·m), soit 2,6 % de moins que ce calcul ; elle ne détaille pas la
    largeur ni les coefficients qu'elle retient. Les appuis 2 et 4 se recoupent avec la note à moins de 4 %.`);

  // —— δ
  k.h2('Le coefficient de majoration dynamique');
  const s = r.spans[1], Gt = 81.66 * 18.8 / 10, S = 4 * 30 * 1.1, dB = 1 + 0.4 / (1 + 0.2 * 18.8) + 0.6 / (1 + 4 * Gt / S);
  k.p(`Le coefficient $\\delta_B$ du Fascicule 61 se calcule par travée, avec sa portée et son poids propre. Pour la travée 2
    ($L = 18{,}80$ m), $G = 81{,}66 \\times 18{,}80 = ${fr(Gt * 10, 0)}$ kN $= ${fr(Gt, 1)}$ t, et la plus lourde charge B
    plaçable est celle de deux files de deux camions Bc, $S = 4 \\times 30 \\times b_c = 4 \\times 30 \\times 1{,}1 = 132$ t :`);
  k.eq(String.raw`\delta_B = 1 + \frac{0{,}4}{1 + 0{,}2\,L} + \frac{0{,}6}{1 + 4\,G/S}
    = 1 + \frac{0{,}4}{4{,}76} + \frac{0{,}6}{1 + 4 \times ${fr(Gt, 1).replace(',', '{,}')}/132} = ${fr(dB, 4).replace(',', '{,}')}`);
  k.cmp([['$\\delta_B$, travée 2', dB, s.deltaB, '—', 4]], { legende: 'Coefficient de majoration dynamique' });

  // —— combinaisons et nu
  k.h2('Combinaisons et réduction au nu de l\'entretoise sur pile');
  const q3 = r.appuis[1].beams[0], c = q3.Mcomp, Bt3 = c.Bc + c.trott, Mt3 = c.Mc120 + c.trott;
  const elu = 1.35 * c.G + Math.min(1.605 * Math.min(c.A + c.trott, Bt3), 1.35 * Mt3);
  const els = c.G + 1.2 * Math.min(c.A + c.trott, Bt3);
  const eluEC = 1.35 * (c.G + Math.min(c.gr1a, c.gr1b ?? Infinity));
  k.p(`Sur l'appui 3, PSIDA donne pour la poutre de rive, coefficients dynamiques et de Courbon compris :
    $M_G = ${fr(c.G, 1)}$, $M_{A} = ${fr(c.A, 1)}$, $M_{Bc} = ${fr(c.Bc, 1)}$, $M_{Mc120} = ${fr(c.Mc120, 1)}$,
    $M_{trott} = ${fr(c.trott, 1)}$ et $M_{gr1a} = ${fr(c.gr1a, 1)}$ kN·m. Les combinaisons sont celles de la note PSI-BA et de
    l'EN 1990 :`);
  k.eq(String.raw`\begin{aligned}
    M_{ELU,F61} &= 1{,}35\,M_G + \min\left[1{,}605\,(M_B + M_{tr})\ ;\ 1{,}35\,(M_{Mc120} + M_{tr})\right]\\
    M_{ELS,F61} &= M_G + 1{,}2\,(M_B + M_{tr}) \qquad M_{ELU,EC} = 1{,}35\,(M_G + \min(gr1a\ ;\ gr1b))
  \end{aligned}`);
  k.p(`(min désigne ici l'effet le plus négatif ; B, plus défavorable que A(l) sur cet appui, gouverne.) Le moment calculé à
    l'axe de la pile est trop sévère : l'entretoise sur pile, d'épaisseur e, porte la poutre sur sa largeur. Comme dans la note
    PSI-BA, PSIDA retient le moment au nu :`);
  const V3 = Math.max(q3.Vg, q3.Vd), nu = q3.Maxe.ELU_F61 + V3 * 0.5 / 2;
  k.eq(String.raw`|M_{nu}| = |M_{axe}| - \frac{V\,e}{2} = ${fr(-q3.Maxe.ELU_F61, 1).replace(',', '{,}')} - \frac{${fr(V3, 1).replace(',', '{,}')} \times 0{,}50}{2}
    = ${fr(-nu, 1).replace(',', '{,}')}\ \text{kN·m}`);
  k.cmp([
    ['$M_{ELU}$ Fascicule 61 à l\'axe', elu, q3.Maxe.ELU_F61, 'kN·m', 1],
    ['$M_{ELS}$ Fascicule 61 à l\'axe', els, q3.Maxe.ELS_F61, 'kN·m', 1],
    ['$M_{ELU}$ EN 1990 à l\'axe', eluEC, q3.Maxe.ELU_EC, 'kN·m', 1],
    ['$M_{ELU}$ Fascicule 61 au nu', nu, q3.Mnu.ELU_F61, 'kN·m', 1],
  ], { legende: 'Moments de calcul sur l\'appui 3, poutre de rive' });
  k.p(`La note PSI-BA fait la même réduction sur son appui 3 : $V = 51{,}0$ t, $e = 0{,}50$ m, $−166{,}43 + 51{,}0 \\times 0{,}50/2
    = −153{,}68$ t·m.`);

  // —— gousset
  k.h2('Le gousset d\'appui');
  const d = 0.96 - 0.10, tau = V3 / (0.38 * d) / 1000, bNec = V3 / (3000 * d);
  k.p(`L'âme de 0,38 m est trop mince sur pile. Le cisaillement BAEL vaut $\\tau_u = V_u/(b_0 d)$ avec $d = 0{,}96 − 0{,}10 = 0{,}86$ m ;
    la fissuration étant préjudiciable, $\\bar\\tau_u = \\min(0{,}15 f_{c28}/\\gamma_b ; 4) = 3{,}0$ MPa. L'épaisseur d'âme nécessaire
    est $b = V_u/(\\bar\\tau_u d)$ :`);
  k.cmp([
    ['$\\tau_u$ sur l\'appui 3', tau, q3.cisaillementBAEL.tau, 'MPa', 3],
    ['$b$ nécessaire au cisaillement', bNec, q3.goussetNecessaire, 'm', 3],
  ], { legende: 'Cisaillement sur l\'appui 3' });
  k.fig({ src: new URL('img/psiba_appuis.jpg', import.meta.url).href, largeur: 100, legende: 'Onglet « Tablier à poutres », exemple PSI-BA : enveloppe des moments ELU le long du tablier continu et tableau des appuis intermédiaires (moment à l\'axe / au nu, aciers supérieurs, compression du béton).' });
  k.p(`PSIDA retient aussi la largeur qui limite la compression du béton à $0{,}6 f_{ck}$ aux ELS : ${fr(q3.compressionNecessaire, 2)} m sur cet
    appui, qui gouverne. L'appui 3, entre les deux grandes travées, est le plus sollicité, comme dans la note. Saisir
    « Gousset d'appui : épaisseur d'âme » = 1,00 m fait passer toutes les vérifications sur appui.`);

  // —— entretoises intermédiaires
  k.h2('Les entretoises intermédiaires');
  const E = r.entInt, c4 = coefficientsLongitudinaux(7.225);
  k.p(`PSIDA calcule l'entretoise de la travée où elles sont le plus espacées : ici la travée 4, avec une seule entretoise,
    $\\lambda = L/(n_e + 1) = 14{,}45/2 = 7{,}225$ m. Une charge à la distance x de l'entretoise lui transmet la fraction
    $1 − |x|/\\lambda$ (PSI-BA § 7.2.1). On place les essieux au plus défavorable, par file de roues :`);
  const bc = 12 + 12 * (1 - 1.5 / 7.225) + 6 * (1 - 4.5 / 7.225) + 6 * (1 - 6 / 7.225);
  const mc = 55 / 6.1 * (6.1 - 3.05 ** 2 / 7.225);
  k.ul([
    `**Bc** : essieux arrière de 12 t du premier camion à 0 et 1,50 m, son essieu avant de 6 t à −4,50 m, l'essieu avant du second camion à 1,50 + 4,50 = 6,00 m :
      $12 + 12(1 − 1{,}5/7{,}225) + 6(1 − 4{,}5/7{,}225) + 6(1 − 6/7{,}225) = ${fr(bc, 2)}$ t par essieu, ${fr(bc / 2, 2)} t par file de roues.`,
    `**Mc120** : chenille de 55 t sur 6,10 m centrée sur l'entretoise : $\\frac{55}{6{,}10}\\left(6{,}10 − \\frac{3{,}05^2}{7{,}225}\\right) = ${fr(mc, 2)}$ t par chenille.`,
    `**Trottoirs** : charge locale de 4,5 kN/m² sur une bande de 1 m : $4{,}5 \\times \\lambda = ${fr(4.5 * 7.225, 2)}$ kN.`,
  ]);
  k.cmp([
    ['Bc, par file de roues, hors $\\delta$', bc / 2 * 10, c4.Bc, 'kN', 1],
    ['Mc120, par chenille, hors $\\delta$', mc * 10, c4.Mc, 'kN', 1],
    ['Trottoirs, par mètre de largeur', 4.5 * 7.225, c4.trott, 'kN', 2],
  ], { legende: 'Coefficients longitudinaux de l\'entretoise (λ = 7,225 m)' });
  const d4 = r.spans[3].deltaB;
  k.p(`PSIDA affiche ces charges coefficient dynamique compris : pour Bc, $${fr(c4.Bc, 1).replace(',', '{,}')} \\times \\delta_B = ${fr(c4.Bc, 1).replace(',', '{,}')} \\times ${fr(d4, 3).replace(',', '{,}')} = ${fr(c4.Bc * d4, 1).replace(',', '{,}')}$ kN (δ de la travée 4).`);
  k.fig({ src: new URL('img/psiba_entretoise.jpg', import.meta.url).href, largeur: 100, legende: 'Charges reportées sur l\'entretoise intermédiaire de la travée 4 (δ compris).' });
  const V = E.tranchants.find(q => q.poutre === 0), Mt = y => E.moments.find(q => Math.abs(q.y - y) < 1e-6);
  k.p(`Ces charges, réparties entre les poutres par Courbon, chargent l'entretoise comme une poutre sur appuis élastiques.
    PSIDA balaye les positions transversales (pas de 0,05 m) et donne les efforts à 0,25 m d'intervalle. La note PSI-BA donne
    les mêmes efforts pour quelques sections ; les écarts tiennent au $\\delta$ (PSIDA compte le poids de la travée sur la section
    des poutres) et aux bandes de 3 m du Bt :`);
  const ref = [
    ['Effort tranchant, poutre de rive, Bc', V.F61.Bc.max / 10, 31.10], ['Effort tranchant, poutre de rive, Bt', V.F61.Bt.max / 10, 35.71],
    ['Effort tranchant, poutre de rive, Mc120', V.F61.Mc120.max / 10, 54.76], ['Effort tranchant, poutre de rive, A(l)', V.F61.A.max / 10, 26.10],
    ['Moment à y = −3,50 m, Bc', Mt(-3.5).F61.Bc.max / 10, 15.55], ['Moment à y = −3,50 m, Mc120', Mt(-3.5).F61.Mc120.max / 10, 25.43],
    ['Moment à y = 0, G + max Q', Mt(0).max.PSIBA / 10, 55.39],
  ];
  k.table(['Effort (t, t·m, δ compris)', 'Note PSI-BA', 'PSIDA', 'Écart'],
    ref.map(([lib, p, n]) => [lib, fr(n, 2), fr(p, 2), `${fr(100 * (p - n) / n, 1)} %`]),
    { legende: 'Entretoise de la travée 4 : PSIDA et la note PSI-BA', larg: [48, 17, 17, 18] });
  k.p(`Avec 0,38 m d'épaisseur, l'entretoise est vérifiée (épaisseur nécessaire ${fr(E.bNec, 2)} m), comme l'épaisseur optimisée
    de la note. À 0,30 m, PSIDA la refuse et la page des recommandations propose l'épaisseur qui suffit.`);

  // —— plans
  k.h2('Plans, nomenclature et façonnage');
  const D = donneesBA(r), N = nomenclatureBA(D), Fe = planFerraillageBA(D, {});
  k.p(`L'onglet Plans produit pour les poutres BA un coffrage, un ferraillage et, depuis la version 0.99.23, une nomenclature
    (feuille BA-FAC-01). La poutre détaillée est la plus sollicitée de la plus longue travée. Les lits inférieurs suivent
    l'épure d'arrêt de PSI-BA (section nécessaire décalée de 0,8 h, puis de la longueur de scellement) ; les aciers supérieurs
    sur appui forment deux groupes, le plus long arrêté là où les aciers du hourdis suffisent ; les entretoises intermédiaires
    sont dessinées avec leurs barres E1 à E4.`);
  const svgFe = feuilleSVG(Fe, { mm: false });
  k.fig({ svg: recadrer(svgFe, [0.245, 0.07, 0.595, 0.32]), legende: 'Élévation de la poutre détaillée et épure d\'arrêt des barres inférieures (feuille de ferraillage, extrait).' });
  k.fig({ svg: recadrer(svgFe, [0.125, 0.35, 0.715, 0.615]), largeur: 85, legende: 'Coupe A-A à mi-travée : quatre lits de HA40 dans le talon de 0,38 m, nappes du hourdis.' });
  const cad = N.lignes.find(q => /^cadres d'âme/.test(q.desig)), rr = rayonCintrage(cad.phi);
  const Lc = 2 * (cad.A + cad.B + cad.C) - 2.5 * rr - 5 * cad.phi;
  k.p(`Les longueurs de coupe suivent l'ISO 4066 (codes de forme de la BS 8666). Pour le cadre d'âme fermé par crochets à
    135° (code 51), HA${cad.phi}, $A = ${cad.A}$, $B = ${cad.B}$, $C = ${cad.C}$ mm et un rayon de cintrage $r = 2\\phi = ${rr}$ mm
    (mandrin de 4 φ, EN 1992-1-1 § 8.3) :`);
  k.eq(String.raw`L = 2\,(A + B + C) - 2{,}5\,r - 5\,\phi = 2 \times ${cad.A + cad.B + cad.C} - 2{,}5 \times ${rr} - 5 \times ${cad.phi} = ${Lc}\ \text{mm}`);
  k.cmp([['Longueur de coupe du cadre d\'âme', Lc, cad.L, 'mm', 0]], { legende: 'Façonnage d\'un cadre' });
  k.p(`Les barres de plus de 12 m sont coupées en pièces égales recouvertes (§ 33.6). Pour l'exemple, la nomenclature totalise
    ${fr(N.parElement.poutre / 1000, 1)} t pour les trois poutres, ${fr(N.parElement.hourdis / 1000, 1)} t pour le hourdis,
    ${fr(N.parElement.intermediaire / 1000, 2)} t pour les entretoises intermédiaires et ${fr(N.parElement.about / 1000, 2)} t
    pour les entretoises d'about. La feuille de ferraillage reprend les masses du bordereau.`);
  k.note(`Avec 0,10 m à l'axe des aciers et des lits de HA40, le centre de gravité des lits dessinés est plus bas que l'axe du
    calcul : PSIDA le signale (« durabilité et hauteur utile »). La note PSI-BA retenait d'ailleurs d = 0,77 m.`, 'Attention');

  k.h2('Limites');
  k.ul([
    'Poutres BA continues seulement : les VIPP et PRAD restent à travées indépendantes (ou rendues continues, chapitre 28).',
    'Inertie constante, appuis indéformables ; la torsion des poutres introduite par les entretoises n\'est pas calculée.',
    'Courbon suppose des entretoises rigides ; sans entretoise intermédiaire, Guyon-Massonnet s\'applique travée par travée avec la portée équivalente de la poutre continue.',
    'Le biais n\'est pas traité par Courbon ; le coefficient F_V de l\'AASHTO (§ 32.5) reste disponible.',
  ]);
  return r;
}
