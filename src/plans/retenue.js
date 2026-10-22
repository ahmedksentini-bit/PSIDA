/**
 * Feuille « Dispositifs de retenue — plans types » : plans de principe des abords de l'ouvrage, à la manière des plans
 * types des dossiers d'ouvrages : raccordement de la barrière de l'ouvrage à la glissière de la route (zone de transition),
 * extrémités de file (enfouie dans le talus, abaissée et ancrée), queue de carpe réservée à l'extrémité aval d'une chaussée
 * unidirectionnelle, implantation de la glissière en remblai. Dessins de principe : la notice du dispositif certifié
 * (NF EN 1317) fixe les entraxes, les longueurs de transition et les extrémités.
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const rect = (v, c, x0, z0, x1, z1) => v.poly(c, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
const lab = (v, p, q, t, ancre = 'g', r = v.echelle / 1000 * 0.6) => { v.ligne('REPERES', p, q); v.cercle('REPERES', p, r, true); v.texte('TEXTES', [q[0] + (ancre === 'g' ? 0.15 : -0.15), q[1]], t, { h: 2.4, ancre, v: 'm' }); };

/** Élévation du raccordement : barrière de l'ouvrage, transition, glissière courante. */
function vueRaccordement(eq) {
  const v = new Vue('RACCORDEMENT DE L\'OUVRAGE À LA ROUTE (élévation, principe)'), h = eq.hDR || 1.0, hg = 0.75;
  // ouvrage : tablier et corniche, culée en amorce
  rect(v, 'COFFRAGE', 0, -0.9, 12, 0); v.hachure([[0, -0.9], [12, -0.9], [12, 0], [0, 0]]);
  v.texte('TEXTES', [6, -0.45], 'tablier (corniche vue)', { h: 2.4, ancre: 'c', v: 'm' });
  v.ligne('COFFRAGE', [-0.05, 0.3], [-0.05, -2.2]); v.texte('TEXTES', [0.1, -2.0], 'joint / garde-grève', { h: 2.2, ancre: 'g', v: 'm' });
  v.terrain([[-22, 0], [-0.1, 0]]);
  // barrière de l'ouvrage : poteaux tous les 2,50 m, deux lisses
  for (let x = 0.6; x <= 11.8; x += 2.5) rect(v, 'EQUIPEMENTS', x - 0.04, 0, x + 0.04, h);
  for (const z of [h - 0.07, h - 0.46]) rect(v, 'EQUIPEMENTS', 0.3, z - 0.04, 12, z + 0.04);
  // transition : glissière raidie (entraxe réduit), lisse doublée, fixée sur la barrière
  const xt = -12;
  for (let x = -0.5; x >= xt; x -= 1.0) rect(v, 'EQUIPEMENTS', x - 0.03, -0.4, x + 0.03, hg);
  rect(v, 'EQUIPEMENTS', xt, hg - 0.31, 0.6, hg); rect(v, 'EQUIPEMENTS', xt, hg - 0.31 - 0.08, 0.6, hg - 0.31);
  // glissière courante
  for (let x = xt - 4; x >= -22; x -= 4) rect(v, 'EQUIPEMENTS', x - 0.03, -0.4, x + 0.03, hg);
  rect(v, 'EQUIPEMENTS', -22, hg - 0.31, xt, hg);
  v.coteH([xt, hg], [0, hg], 1.6, 'zone de transition (longueur selon la notice)');
  v.coteH([-22, hg], [xt, hg], 1.6, 'glissière courante');
  v.coteH([xt - 4, -0.4], [xt, -0.4], -1.2, 'entraxe courant');
  v.coteH([-3.5, -0.4], [-2.5, -0.4], -1.2, 'réduit');
  lab(v, [6, h - 0.07], [8, 2.6], `Barrière de l'ouvrage (type BN4), h ${fr(h)}`);
  lab(v, [-6, hg - 0.2], [-8, 2.6], 'Glissière raidie : entraxe des supports réduit, lisse doublée, raccord rigide sur la barrière', 'd');
  return v;
}

/** Extrémité amont enfouie dans le talus (vue en plan). */
function vueEnfouie() {
  const v = new Vue('EXTRÉMITÉ AMONT ENFOUIE DANS LE TALUS (vue en plan, principe)');
  v.ligne('COFFRAGE', [-30, 0], [10, 0]); v.texte('TEXTES', [8, -0.6], 'bord de chaussée', { h: 2.2, ancre: 'd', v: 'h' });
  v.ligne('AXES', [-30, -3.5], [10, -3.5]); v.texte('TEXTES', [9, -3.9], 'sens de circulation →', { h: 2.4, ancre: 'd', v: 'h' });
  // glissière : parallèle puis évasée vers le talus, extrémité enfouie
  const g = [[10, 1.0], [-8, 1.0], [-26, 3.6]];
  v.poly('EQUIPEMENTS', g); for (let k = 0; k <= 9; k++) { const t = k / 9, p = [g[1][0] + (g[2][0] - g[1][0]) * t, g[1][1] + (g[2][1] - g[1][1]) * t]; v.cercle('EQUIPEMENTS', p, 0.12); }
  for (let x = 8; x > -8; x -= 4) v.cercle('EQUIPEMENTS', [x, 1.0], 0.12);
  // crête et pied du talus de déblai
  v.poly('VUES', [[-30, 3.0], [-14, 3.0]]); v.poly('VUES', [[-30, 5.0], [-12, 5.0]]);
  v.texte('TEXTES', [-29, 3.3], 'pied du talus de déblai', { h: 2.2, ancre: 'g', v: 'b' }); v.texte('TEXTES', [-29, 5.3], 'crête du talus', { h: 2.2, ancre: 'g', v: 'b' });
  lab(v, [-25, 3.5], [-22, 8], 'Extrémité ancrée dans le talus (lisse enfouie à hauteur constante)');
  lab(v, [-15, 2.1], [-6, 6.5], 'Évasement progressif (taux selon la notice)');
  v.texte('TEXTES', [-10, -1.4], 'L\'extrémité amont ne doit jamais présenter de bout libre face au trafic', { h: 2.4, ancre: 'c', v: 'h', gras: true });
  return v;
}

/** Extrémité abaissée et ancrée au sol (élévation). */
function vueAbaissee(eq) {
  const v = new Vue('EXTRÉMITÉ ABAISSÉE ET ANCRÉE AU SOL (élévation, principe)'), hg = 0.75;
  v.terrain([[-16, 0], [6, 0]]);
  v.poly('EQUIPEMENTS', [[6, hg], [-2, hg], [-12, 0.02]]); v.poly('EQUIPEMENTS', [[6, hg - 0.31], [-2, hg - 0.31], [-11, -0.05]]);
  for (let x = 4; x >= -10; x -= 2) { const zt = x > -2 ? hg : hg * (x + 12) / 10; rect(v, 'EQUIPEMENTS', x - 0.03, -0.8, x + 0.03, Math.max(0.05, zt)); }
  rect(v, 'COFFRAGE', -13.2, -0.9, -11.6, 0); v.hachure([[-13.2, -0.9], [-11.6, -0.9], [-11.6, 0], [-13.2, 0]]);
  lab(v, [-12.4, -0.45], [-14.5, -2.2], 'Massif d\'ancrage', 'd');
  lab(v, [-7, 0.35], [-6, 2.0], 'Lisse abaissée progressivement jusqu\'au sol');
  v.coteH([-12, 0], [-2, 0], -1.4, 'longueur d\'abaissement (selon la notice)');
  return v;
}

/** Queue de carpe : extrémité aval seulement. */
function vueQueueCarpe() {
  const v = new Vue('QUEUE DE CARPE — EXTRÉMITÉ AVAL UNIQUEMENT (vue en plan)');
  v.ligne('COFFRAGE', [-4, 0], [10, 0]); v.ligne('AXES', [-4, -2.5], [10, -2.5]);
  v.texte('TEXTES', [-3.5, -2.9], '← sens de circulation (chaussée unidirectionnelle)', { h: 2.4, ancre: 'g', v: 'h' });
  v.poly('EQUIPEMENTS', [[10, 0.8], [1.0, 0.8], [0.2, 1.3], [0.0, 1.6]]);
  for (let x = 8; x >= 1; x -= 2) v.cercle('EQUIPEMENTS', [x, 0.8], 0.12);
  lab(v, [0.1, 1.45], [2.5, 3.2], 'Queue de carpe : fin de file aval, hors de tout choc frontal');
  v.texte('TEXTES', [3, -4.0], 'Interdite en extrémité amont et sur chaussée bidirectionnelle (bout libre exposé au choc frontal)', { h: 2.4, ancre: 'c', v: 'h', gras: true });
  return v;
}

/** Implantation de la glissière en remblai (coupe). */
function vueImplantation() {
  const v = new Vue('IMPLANTATION DE LA GLISSIÈRE EN REMBLAI (coupe, principe)');
  const ch = [[-3, 0], [0, -0.06], [1.0, -0.10], [2.3, -0.13]]; v.poly('COFFRAGE', ch);
  v.terrain([[2.3, -0.13], [4.8, -1.8]], -1); v.texte('TEXTES', [3.8, -0.9], 'talus de remblai', { h: 2.2, ancre: 'g', v: 'm', angle: -34 });
  v.texte('TEXTES', [-1.5, 0.12], 'chaussée', { h: 2.4, ancre: 'c', v: 'b' }); v.texte('TEXTES', [0.5, 0.02], 'accotement', { h: 2.2, ancre: 'c', v: 'b' });
  const x = 1.25, hg = 0.75;
  rect(v, 'EQUIPEMENTS', x - 0.04, -1.6, x + 0.04, hg - 0.05);
  rect(v, 'EQUIPEMENTS', x - 0.24, hg - 0.31, x - 0.14, hg);   // lisse
  rect(v, 'EQUIPEMENTS', x - 0.14, hg - 0.22, x - 0.04, hg - 0.10);   // écarteur
  lab(v, [x - 0.2, hg - 0.15], [-1.5, 1.4], 'Glissière (lisse, écarteur, support enfoncé)', 'd');
  v.coteH([x, -0.12], [2.3, -0.13], -0.45, 'd ≥ W');
  v.coteV([x + 0.3, -1.6], [x + 0.3, -0.12], x + 0.6, 'fiche');
  v.texte('TEXTES', [0, -2.2], 'd : distance du support à la crête du talus, à adapter à la largeur de fonctionnement W ; fiche du support selon la notice et le sol', { h: 2.2, ancre: 'c', v: 'h' });
  return v;
}

export function planRetenueTypes(st, eq, cartouche = {}) {
  const ra = vueRaccordement(eq), en = vueEnfouie(), ab = vueAbaissee(eq), qc = vueQueueCarpe(), im = vueImplantation();
  const notes = [
    'NOTES',
    '1. Plans de principe. Dispositifs certifiés (NF EN 1317, marquage CE) : la notice du fabricant fait foi pour les entraxes,',
    '   la longueur et la constitution de la zone de transition, les extrémités et la fiche des supports.',
    '2. Extrémités amont (et les deux extrémités sur chaussée bidirectionnelle) : enfouies dans le talus, abaissées et ancrées,',
    '   ou extrémités absorbantes certifiées. Pas de bout libre ni de queue de carpe face au trafic.',
    '3. La queue de carpe n\'est admise qu\'en fin de file aval d\'une chaussée unidirectionnelle.',
    '4. Raccordement à la barrière de l\'ouvrage : continuité de la retenue, raidissement progressif de la glissière,',
    '   sans discontinuité ni point dur ; niveau de retenue de la route au moins égal à celui des abords.',
  ];
  const hn = notes.length * 2.2 * 1.6;
  const F = composer({ titre: 'ÉQUIPEMENTS — DISPOSITIFS DE RETENUE : PLANS TYPES', cartouche,
    rangees: [[ra], [en, ab], [qc, im]],
    groupes: [{ vues: [ra], cible: 100, min: 50 }, { vues: [en, qc], cible: 250, min: 100 }, { vues: [ab], cible: 100, min: 50 }, { vues: [im], cible: 25, min: 20 }],
    colonne: { largeur: 186, hauteur: 2 + hn + 4 },
    poser: (F, [x, y]) => { F.note(notes, F.W - 10 - 184, y + 2 + hn - 2.2 * 0.6, 2.2); F.notes[F.notes.length - 1].titreGras = true; } });
  F.cartouche.echelles = F.cartouche.echelles || 'sans échelle (principe)';
  return F;
}
