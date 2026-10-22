/**
 * Tableaux de calage et de dimensionnement des appuis, à la manière des dossiers d'ouvrages courants :
 *   - tableauCalage(A) : niveaux d'une ligne d'appui (chaussée, sous-face du tablier, dessus de l'appui, dessus et fond de
 *     la fondation, terrain naturel, pointe des pieux), placé sur la feuille de coffrage de l'appui ;
 *   - planNivellement(st) : feuille récapitulative « Tableau de dimensionnement et nivellement », une ligne par appui
 *     (biais, dimensions du corps et de la fondation, niveaux, appareils d'appui).
 * Niveaux : NGF du plan de nivellement quand il est actif, sinon relatifs (±0,00 = dessus de la dalle à l'axe).
 */
import { Feuille, hautBande, CADRE } from './dessin.js';
import { geometrieAppui, appuisDisponibles } from './appuis.js';

const fr = (x, d = 2) => (x == null || !isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));

/** Lignes de niveaux d'une ligne d'appui : [désignation, symbole, niveau]. */
export function niveauxAppui(A) {
  const L = [
    ['Chaussée à l\'axe', 'Zch', A.zCh],
    ['Sous-face du tablier (dessus des appareils)', 'Zsf', A.zSF],
    ['Dessus du bossage', 'Zb', A.zT + A.hBos],
    [A.kind === 'culee' && A.type === 'remblayee' ? 'Dessus du sommier' : A.hc > 0 ? 'Dessus du chevêtre' : 'Dessus de l\'appui', 'Zc', A.zT],
    ...(A.kind === 'culee' ? [['Dessus du garde-grève', 'Zgg', A.zT + A.hGG]] : []),
    ['Dessus de la semelle', 'Zs', A.zDS],
    ['Fond de la semelle', 'Zf', A.zSS],
    ['Terrain naturel', 'ZTN', A.zTN],
    ...(A.pieux ? [['Pointe des pieux', 'Zp', A.zPP]] : []),
  ];
  return L;
}

/** Tableau de calage d'une ligne d'appui (feuille de coffrage de l'appui). */
export function tableauCalage(A) {
  return {
    titre: `TABLEAU DE CALAGE — ${A.nom}${A.niv ? ' (NGF)' : ' (niveaux relatifs)'}`, hl: 5, h: 2.1,
    cols: [{ t: 'Niveau', w: 92, a: 'g' }, { t: 'Symbole', w: 22, a: 'c' }, { t: 'Cote (m)', w: 30, a: 'd' }],
    lignes: niveauxAppui(A).map(([d, s, z]) => [d, s, fr(z)]),
  };
}

/** Ligne du tableau récapitulatif pour un appui. */
function ligneRecap(st, A) {
  const G = A.G, psi = G.psiL[A.i];
  const corps = A.kind === 'pile'
    ? (A.type === 'colonnes' ? `${A.nCol} col. Ø ${fr(A.D)} ; chev. ${fr(A.lc)} × ${fr(A.hc)}` : `voile ${fr(A.Lv)} × ${fr(A.b)}`)
    : A.type === 'remblayee' ? `mur ${fr(A.C.em)} ; sommier h ${fr(A.hSom)}` : `${A.nCol} col. Ø ${fr(A.D)} ; chev. h ${fr(A.hc)}`;
  const H = A.kind === 'pile' ? A.H : A.Hm;
  const fond = A.pieux ? `${A.nF * A.nP} pieux Ø ${fr(A.Dp)}, L ${fr(A.Lp)}` : 'superficielle';
  return [A.nom, fr(psi), corps, fr(H), fr(A.B), fr(A.Lf), fr(A.hs), fond, fr(A.zCh), fr(A.zSF), fr(A.zT), fr(A.zDS), fr(A.zSS), `${A.ap.yb.length} × ${A.ap.label}`];
}

/** Feuille « Tableau de dimensionnement et nivellement ». */
export function planNivellement(st, cartouche = {}) {
  const ids = appuisDisponibles(st);
  if (!ids.length) throw new Error('tableau de nivellement : lancer le calcul des appuis (onglet Appuis et fondations)');
  const As = ids.map(i => geometrieAppui(st, i));
  const cols = [
    { t: 'Appui', w: 14, a: 'c' }, { t: 'Biais (gr)', w: 17, a: 'c' }, { t: 'Corps de l\'appui', w: 58, a: 'g' }, { t: 'H (m)', w: 14, a: 'd' },
    { t: 'B (m)', w: 14, a: 'd' }, { t: 'Lf (m)', w: 15, a: 'd' }, { t: 'hs (m)', w: 14, a: 'd' }, { t: 'Fondation', w: 44, a: 'g' },
    { t: 'Zch', w: 17, a: 'd' }, { t: 'Zsf', w: 17, a: 'd' }, { t: 'Zc', w: 17, a: 'd' }, { t: 'Zs', w: 17, a: 'd' }, { t: 'Zf', w: 17, a: 'd' },
    { t: 'Appareils d\'appui', w: 48, a: 'g' },
  ];
  const W = cols.reduce((s, c) => s + c.w, 0);
  const tab = { titre: `TABLEAU DE DIMENSIONNEMENT ET NIVELLEMENT${As[0].niv ? ' (niveaux NGF)' : ' (niveaux relatifs)'}`, cols, lignes: As.map(A => ligneRecap(st, A)), hl: 7, h: 2.2 };
  const notes = [
    'NOTES',
    'H : hauteur du fût (piles) ou du mur / des colonnes (culées) ; B × Lf × hs : semelle (sens de l\'ouvrage × largeur × épaisseur).',
    'Zch : chaussée à l\'axe ; Zsf : sous-face du tablier ; Zc : dessus du chevêtre ou du sommier ; Zs, Zf : dessus et fond de la semelle.',
    'Détail des niveaux de chaque appui : tableau de calage de sa feuille de coffrage.',
  ];
  const fmt = cartouche.format && cartouche.format !== 'auto' ? cartouche.format : (W + 40 <= 390 ? 'A3' : W + 40 <= 564 ? 'A2' : 'A1');
  const F = new Feuille(fmt, { titre: 'APPUIS — TABLEAU DE DIMENSIONNEMENT ET NIVELLEMENT', cartouche: { ...cartouche } });
  const H = (tab.lignes.length + 2) * tab.hl, x = CADRE.x0 + (F.W - CADRE.d - CADRE.x0 - W) / 2;
  const yTop = F.H - CADRE.d - 30, y = Math.max(hautBande() + 40, yTop - H);
  F.tableau(tab, x, y);
  F.note(notes, x + 2, y - 10, 2.2); F.notes[0].titreGras = true;
  F.cartouche.echelles = F.cartouche.echelles || 'sans objet';
  return F;
}
