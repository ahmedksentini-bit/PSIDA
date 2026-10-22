/**
 * Feuille « Dispositifs de retenue — abords de l'ouvrage » : vue en plan schématique de l'ouvrage et de ses abords (barrière
 * de l'ouvrage, raccords, glissières, extrémités), élévation de principe du raccord et implantation de la glissière en
 * remblai. Les raccords et les extrémités sont des dispositifs certifiés : ils renvoient aux fiches techniques du fournisseur
 * (NF EN 1317). La queue de carpe est interdite en extrémité ; elle ne sert qu'au raccord entre deux dispositifs.
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const rect = (v, c, x0, z0, x1, z1) => v.poly(c, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
const lab = (v, p, q, t, ancre = 'g', r = v.echelle / 1000 * 0.6) => { v.ligne('REPERES', p, q); v.cercle('REPERES', p, r, true); v.texte('TEXTES', [q[0] + (ancre === 'g' ? 0.15 : -0.15), q[1]], t, { h: 2.4, ancre, v: 'm' }); };

/** Élévation du raccordement : barrière de l'ouvrage, transition, glissière courante. */
function vueRaccordement(eq) {
  const v = new Vue('RACCORD DE LA BARRIÈRE DE L\'OUVRAGE À LA GLISSIÈRE (élévation, principe)'), h = eq.hDR || 1.0, hg = 0.75;
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
  v.coteH([xt, hg], [0, hg], 1.6, 'raccord : fiche technique du fournisseur (NF EN 1317)');
  v.coteH([-22, hg], [xt, hg], 1.6, 'glissière courante');
  lab(v, [6, h - 0.07], [8, 2.6], `Barrière de l'ouvrage (type BN4), h ${fr(h)}`);
  lab(v, [-6, hg - 0.2], [-8, 2.6], 'Raccord barrière / glissière : dispositif certifié, constitution selon la fiche technique du fournisseur', 'd');
  return v;
}

/** Vue en plan schématique de l'ouvrage et de ses abords : barrière, raccords, glissières, extrémités certifiées. */
function vueAbords(st) {
  const v = new Vue('OUVRAGE ET ABORDS — DISPOSITIFS DE RETENUE (vue en plan, schéma)');
  const L = Math.max(20, (st && st.deck ? st.deck.spans.reduce((a, b) => a + b, 0) : 40)), b = 6, Lr = 12, Lg = 30, Le = 12;
  // ouvrage, chaussée
  v.poly('COFFRAGE', [[0, -b], [L, -b], [L, b], [0, b]], true); v.texte('TEXTES', [L / 2, 0], 'OUVRAGE', { h: 3, ancre: 'c', v: 'm', gras: true });
  v.ligne('VUES', [-Lr - Lg - Le - 4, -b + 0.5], [L + Lr + Lg + Le + 4, -b + 0.5]); v.ligne('VUES', [-Lr - Lg - Le - 4, b - 0.5], [L + Lr + Lg + Le + 4, b - 0.5]);
  v.ligne('AXES', [-Lr - Lg - Le - 4, 0], [0, 0]); v.ligne('AXES', [L, 0], [L + Lr + Lg + Le + 4, 0]);
  for (const sg of [-1, 1]) {
    const y = sg * (b + 0.3);
    v.ligne('EQUIPEMENTS', [0, y], [L, y]);                                    // barrière de l'ouvrage
    for (const [x0, x1, kind] of [[-Lr, 0, 'r'], [-Lr - Lg, -Lr, 'g'], [-Lr - Lg - Le, -Lr - Lg, 'e'], [L, L + Lr, 'r'], [L + Lr, L + Lr + Lg, 'g'], [L + Lr + Lg, L + Lr + Lg + Le, 'e']]) {
      if (kind === 'g') v.ligne('EQUIPEMENTS', [x0, y], [x1, y]);
      else { const p = [[x0, y - 0.35], [x1, y - 0.35], [x1, y + 0.35], [x0, y + 0.35]]; v.poly('EQUIPEMENTS', p, true); if (kind === 'e') v.hachure(p); }
    }
  }
  const lab2 = (p, q, t) => { v.ligne('REPERES', p, q); v.texte('TEXTES', [q[0], q[1] + (q[1] > 0 ? 0.4 : -0.4)], t, { h: 2.4, ancre: 'c', v: q[1] > 0 ? 'b' : 'h' }); };
  lab2([L / 2, b + 0.3], [L / 2, b + 4], 'Barrière de l\'ouvrage (type BN4)');
  lab2([-Lr / 2, b + 0.3], [-Lr / 2, b + 8], 'Raccord barrière / glissière : fiche technique du fournisseur (NF EN 1317)');
  lab2([-Lr - Lg / 2, b + 0.3], [-Lr - Lg / 2, b + 4], 'Glissière');
  lab2([-Lr - Lg - Le / 2, -b - 0.3], [-Lr - Lg - Le / 2, -b - 5], 'Extrémité certifiée (NF EN 1317) : fiche technique du fournisseur');
  v.texte('TEXTES', [L / 2, -b - 9], 'Queue de carpe interdite en extrémité de file ; admise seulement pour le raccord entre deux dispositifs', { h: 2.6, ancre: 'c', v: 'h', gras: true });
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
  const ab = vueAbords(st), ra = vueRaccordement(eq), im = vueImplantation();
  const notes = [
    'NOTES',
    '1. Schémas de principe. Raccords (transitions) et extrémités : dispositifs certifiés selon NF EN 1317, mis en œuvre',
    '   conformément aux fiches techniques du fournisseur (constitution, longueurs, ancrages, entraxes).',
    '2. Queue de carpe interdite en extrémité de file ; elle n\'est utilisée que pour le raccord entre deux dispositifs.',
    '3. Raccord à la barrière de l\'ouvrage : continuité de la retenue, sans discontinuité ni point dur.',
    '4. Implantation : distance à la crête du talus et fiche des supports selon la largeur de fonctionnement W et la notice.',
  ];
  const hn = notes.length * 2.2 * 1.6;
  const F = composer({ titre: 'ÉQUIPEMENTS — DISPOSITIFS DE RETENUE AUX ABORDS : SCHÉMAS DE PRINCIPE', cartouche,
    rangees: [[ab], [ra, im]],
    groupes: [{ vues: [ab], cible: 1000, min: 250 }, { vues: [ra], cible: 200, min: 50 }, { vues: [im], cible: 50, min: 20 }],
    colonne: { largeur: 186, hauteur: 2 + hn + 4 },
    poser: (F, [x, y]) => { F.note(notes, F.W - 10 - 184, y + 2 + hn - 2.2 * 0.6, 2.2); F.notes[F.notes.length - 1].titreGras = true; } });
  F.cartouche.echelles = F.cartouche.echelles || 'sans échelle (principe)';
  return F;
}
