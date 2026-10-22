/**
 * Dispositions constructives et métré des cadres (portage de BVTrace PicfSlab.cs, PicfDetailing.cs,
 * CulvertStructureBlocks.cs) : épaisseur indicative SETRA selon l'ouverture, renforts de goussets, minimum transversal,
 * découpage en blocs monolithiques (barres de 12 m, 3 cellules au plus par bloc), avant-métré béton / acier.
 */
import { largeurCalc, epVoile, nCell } from './cadre.js';
import { minimumBael } from './sections.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');

// ── Épaisseur SETRA ────────────────────────────────────────────────────────────────────────────────
const TABLE_E = [[1.0, 0.15], [1.5, 0.20], [2.0, 0.20], [3.0, 0.30], [4.0, 0.50], [6.0, 0.60]];
export const E_DEFAUT = 0.20;
export function epaisseurPicf(B) {
  if (!(B > 0)) return E_DEFAUT;
  if (B <= TABLE_E[0][0]) return TABLE_E[0][1];
  for (let i = 1; i < TABLE_E.length; i++) if (B <= TABLE_E[i][0]) {
    const t = (B - TABLE_E[i - 1][0]) / (TABLE_E[i][0] - TABLE_E[i - 1][0]);
    return Math.round((TABLE_E[i - 1][1] + t * (TABLE_E[i][1] - TABLE_E[i - 1][1])) * 100) / 100;
  }
  return TABLE_E[TABLE_E.length - 1][1];
}
export const horsTableEpaisseur = B => B > 0 && (B < TABLE_E[0][0] || B > TABLE_E[TABLE_E.length - 1][0]);

// ── Goussets et minimum transversal ───────────────────────────────────────────────────────────────
export function goussetSup(B) {
  if (!(B > 0)) return { L: 0, n: 0, base: 'Ouverture inconnue : renfort non défini.' };
  if (B > 5) return { L: 1.50, n: 6, base: 'ouverture > 5 m' };
  if (B > 3) return { L: 1.20, n: 5, base: '3 m < ouverture ≤ 5 m' };
  return { L: 0.70, n: 3, base: 'ouverture ≤ 3 m' };
}
export function goussetInf(B) {
  if (!(B > 0)) return { L: 0, n: 0, base: 'Ouverture inconnue : renfort non défini.' };
  if (B > 4) return { L: 1.30, n: 7, base: 'ouverture > 4 m' };
  if (B > 2) return { L: 1.00, n: 5, base: '2 m < ouverture ≤ 4 m' };
  return { L: 0.80, n: 4, base: 'ouverture ≤ 2 m' };
}
export const ESPACEMENT_VOILE = 0.40, ESPACEMENT_VOILE_JOINT = 0.20, HAUTEUR_ZONE_DENSE = 2.00;
export function minimumTransversal(asInfTraverse, d, fc28, fe, etriers) {
  const moitie = Math.max(0, asInfTraverse) / 2, frag = minimumBael(d, fc28, fe), ret = Math.max(moitie, frag);
  const gouv = moitie >= frag ? 'moitié du ferraillage de la face inférieure de la traverse' : 'condition de non-fragilité';
  let detail = `As ≥ ${fr(ret)} cm²/ml — ${gouv} (moitié ${fr(moitie)}, non-fragilité ${fr(frag)})`;
  if (!etriers) detail += '. Le guide impose en outre un « ferraillage plancher » lorsque les étriers ne sont pas nécessaires, sans en donner la valeur : à compléter.';
  return { as: ret, gouv, detail };
}

// ── Blocs monolithiques ─────────────────────────────────────────────────────────────────────────────
export const LONGUEUR_BARRE = 12.0, CELLULES_PAR_BLOC = 3;
export function decoupageBlocs(cellules, entraxe, Lbarre = LONGUEUR_BARRE, maxBloc = CELLULES_PAR_BLOC) {
  if (cellules < 1) return { blocs: [], joints: 0, explication: '', refus: 'Nombre de cellules non renseigné.' };
  if (!(entraxe > 0)) return { blocs: [], joints: 0, explication: '', refus: 'Entraxe des voiles non déterminé : le découpage en blocs est impossible.' };
  const parL = Math.floor(Lbarre / entraxe);
  if (parL < 1) return { blocs: [], joints: 0, explication: '', refus: `Une seule cellule mesure déjà ${fr(entraxe)} m d'entraxe, au-delà de la longueur de barre disponible (${fr(Lbarre, 1)} m) : le ferraillage transversal impose des recouvrements, à traiter explicitement.` };
  const parBloc = Math.min(maxBloc, parL), nb = Math.ceil(cellules / parBloc), base = Math.floor(cellules / nb), reste = cellules % nb;
  const blocs = []; let c = 0;
  for (let b = 0; b < nb; b++) { const k = base + (b < reste ? 1 : 0); blocs.push({ premiere: c, n: k, gaucheExt: b === 0, droiteExt: b === nb - 1, label: k === 1 ? `cellule ${c + 1}` : `cellules ${c + 1} à ${c + k}` }); c += k; }
  const motif = parL < maxBloc ? `limité par la longueur de barre (${fr(Lbarre, 1)} m pour un entraxe de ${fr(entraxe)} m, soit ${parL} cellule(s) par bloc)` : `limité à ${maxBloc} cellules par bloc pour le coulage`;
  const explication = nb === 1 ? `Ouvrage coulé d'un seul tenant (${cellules} cellule(s), ${fr(cellules * entraxe)} m de largeur de calcul).`
    : `${cellules} cellules réparties en ${nb} blocs de ${blocs.map(b => b.n).join(' + ')} cellules, ${nb - 1} joint(s) sec(s) — ${motif}.`;
  return { blocs, joints: nb - 1, explication, refus: null };
}

// ── Avant-métré ──────────────────────────────────────────────────────────────────────────────────
export const RHO_ACIER = 7850, RATIO_BAS = 80, RATIO_HAUT = 140;
/** Béton et acier estimés : par famille, la plus forte section retenue, deux faces × (principal + répartition à 50 %). */
export function avantMetre(g, h, longueur, sections) {
  const n = nCell(g), L = longueur > 0 ? longueur : 1, Lext = largeurCalc(g) + g.ep;
  let aire = g.et * Lext + g.er * Lext;
  for (let j = 0; j <= n; j++) aire += epVoile(g, j) * h;
  const beton = aire * L;
  const fam = b => b.startsWith('Traverse') ? 'Traverse' : b.startsWith('Radier') ? 'Radier' : 'Voiles';
  const par = {};
  for (const s of sections) { const f = fam(s.barre), a = s.asGouv; if (!(f in par) || a > par[f]) par[f] = a; }
  const surf = f => f === 'Voiles' ? (n + 1) * h * L : Lext * L;
  let m3 = 0;
  for (const [f, a] of Object.entries(par)) m3 += a / 1e4 * 1.5 * 2 * surf(f);
  const acier = m3 * RHO_ACIER, ratio = beton > 0 ? acier / beton : 0;
  let note = `Béton ${fr(beton, 1)} m³ · acier estimé ${acier.toFixed(0)} kg · ratio ${ratio.toFixed(0)} kg/m³`;
  if (ratio < RATIO_BAS || ratio > RATIO_HAUT) note += `. Hors de la plage usuelle ${RATIO_BAS}–${RATIO_HAUT} kg/m³ — vérifier le dimensionnement avant de chiffrer.`;
  note += ' Recouvrements et façonnages non comptés.';
  return { beton, acier, ratio, note };
}
