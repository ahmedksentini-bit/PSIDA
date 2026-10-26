/**
 * Ponts-rails — déformations, vibrations et nécessité d'une analyse dynamique (lot 4 du chantier ponts-rails).
 * Sans dépendance d'interface. Unités : kN, m, s, km/h ; flèches restituées en mm.
 *
 * Sources (chaque valeur porte son article) :
 *  - NF EN 1991-2 (2004) : § 6.4.4 et figure 6.9 (organigramme), figure 6.10 et éq. (6.1)-(6.3) (limites de n₀, fréquence
 *    par la flèche sous permanentes), § 6.4.6.3.1 tableau 6.6 (amortissement), § 6.4.6.3.3 (module limité à C50/60),
 *    annexe F tableaux F.1 et F.2 ((v/n₀)lim), § 6.5.4.5.2 (déplacements de l'extrémité du tablier δH et δV) — relus
 *    sur l'exemplaire NF EN 1991-2 fourni (pages 56-59, 66-67, 117-118) ;
 *  - NF EN 1990/A1 (2006), annexe A2.4.4 : gauche du tablier (A2.4.4.2.2), flèche verticale L/600 (A2.4.4.2.3),
 *    déformation transversale et fréquence latérale (A2.4.4.2.4, tableau A2.8), confort des voyageurs (A2.4.4.3,
 *    tableau A2.9, figure A2.3) — relus sur la NF EN 1990/A1 (pages 22 à 27 de la norme) ; figure A2.3 numérisée.
 *
 * Modèle : la flèche du tablier sous une voie chargée est celle de la poutre continue (rigidité EI de tout le tablier,
 * section non fissurée, module instantané E_cm) multipliée par le coefficient K̄(y) de Guyon-Massonnet de la bande de
 * la voie (le coefficient K de Guyon-Massonnet est par définition le rapport de la flèche en y à la flèche moyenne) ;
 * les flèches de la poutre sont obtenues en forme fermée travée par travée (charge ponctuelle sur appuis simples + moments
 * d'extrémité de la poutre continue), puis les convois LM71 / SW/0 / SW/2 sont déplacés sur ces lignes d'influence par
 * les mêmes enveloppes que les sollicitations (beam.js).
 */
import { coefKBand } from './guyon.js';
import { LM71, lm71, sw, coefficientDynamique } from './loads_rail.js';

/**
 * Valeurs non recoupées sur un texte de la norme : vide depuis la relecture de la NF EN 1990/A1 (A2.4.4, pages 22 à 27 de
 * la norme) le 26/10/2026. La figure A2.3 est une numérisation (voir FIGURE_A23) : sa précision est indiquée dans la note.
 */
export const A_CONFIRMER_DEFORMATIONS = [];

// ---------------------------------------------------------------------------------------------------------------------
// Matériau, fréquences et organigramme de la figure 6.9
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Module instantané E_cm [MPa] (EN 1992-1-1 tableau 3.1 : 22 (f_cm/10)^0,3 GPa, f_cm = f_ck + 8), limité à la valeur d'un
 * C50/60 pour le comportement dynamique (EN 1991-2 § 6.4.6.3.3(3)).
 */
export const ecmDynamique = fck => 22000 * ((Math.min(fck, 50) + 8) / 10) ** 0.3;

/** Limites de la fréquence propre n₀ [Hz] (EN 1991-2 figure 6.10, éq. 6.1 et 6.2), valables pour 4 m ≤ L ≤ 100 m. */
export function limitesN0(L) {
  return { sup: 94.76 * L ** -0.748, inf: L <= 20 ? 80 / L : 23.58 * L ** -0.592, domaine: L >= 4 && L <= 100 };
}

/** n₀ [Hz] d'une travée sur appuis simples soumise à la flexion seule, par la flèche δ₀ [mm] sous permanentes (éq. 6.3). */
export const n0DepuisFleche = d0mm => 17.75 / Math.sqrt(d0mm);

/** δ₀ [mm] à mi-portée d'une travée sur appuis simples sous une charge uniforme g [kN/m] (5 g L⁴ / 384 EI). */
export const flecheUniforme = (g, L, EI) => 1000 * 5 * g * L ** 4 / (384 * EI);

/**
 * Coefficient d'amortissement critique ζ [%] (EN 1991-2 § 6.4.6.3.1, tableau 6.6 — limites inférieures) :
 * 'metal' (métallique et mixte), 'precontraint' (béton précontraint), 'beton_arme' (poutrelles enrobées et béton armé).
 */
export function amortissement(type, L) {
  const c = { metal: [0.5, 0.125], precontraint: [1.0, 0.07], beton_arme: [1.5, 0.07] }[type] || [1.5, 0.07];
  return L < 20 ? c[0] + c[1] * (20 - L) : c[0];
}

// Annexe F, tableaux F.1 (a_max < 3,5 m/s², voie ballastée) et F.2 (a_max < 5,0 m/s²) : (v/n₀)lim [m] par classe de
// portée L ∈ [a, b), coefficient d'amortissement ζ [%] et masse m [10³ kg/m] ∈ [5 ; 7 ; 9 ; 10 ; 13 ; 15 ; 18 ; 20 ; 25 ;
// 30 ; 40 ; 50 ; ∞) ; null : case vide (hors domaine). Relu sur la NF EN 1991-2, pages 117-118.
const MASSES_F = [5, 7, 9, 10, 13, 15, 18, 20, 25, 30, 40, 50];
const PORTEES_F = [5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 40];
const _ = null;
const TABLE_F1 = [
  { L: 5, z: { 2: [1.71, 1.78, 1.88, 1.88, 1.93, 1.93, 2.13, 2.13, 3.08, 3.08, 3.54, 3.59], 4: [1.71, 1.83, 1.93, 1.93, 2.13, 2.24, 3.03, 3.08, 3.38, 3.54, 4.31, 4.31] } },
  { L: 7.5, z: { 2: [1.94, 2.08, 2.64, 2.64, 2.77, 2.77, 3.06, 5.00, 5.14, 5.20, 5.35, 5.42], 4: [2.15, 2.64, 2.77, 2.98, 4.93, 5.00, 5.14, 5.21, 5.35, 5.62, 6.39, 6.53] } },
  { L: 10, z: { 1: [2.40, 2.50, 2.50, 2.50, 2.71, 6.15, 6.25, 6.36, 6.36, 6.45, 6.45, 6.57], 2: [2.50, 2.71, 2.71, 5.83, 6.15, 6.25, 6.36, 6.36, 6.45, 6.45, 7.19, 7.29] } },
  { L: 12.5, z: { 1: [2.50, 2.50, 3.58, 3.58, 5.24, 5.24, 5.36, 5.36, 7.86, 9.14, 9.14, 9.14], 2: [3.45, 5.12, 5.24, 5.24, 5.36, 5.36, 7.86, 8.22, 9.53, 9.76, 10.36, 10.48] } },
  { L: 15, z: { 1: [3.00, 5.33, 5.33, 5.33, 6.33, 6.33, 6.50, 6.50, 6.50, 7.80, 7.80, 7.80], 2: [5.33, 5.33, 6.33, 6.33, 6.50, 6.50, 10.17, 10.33, 10.33, 10.50, 10.67, 12.40] } },
  { L: 17.5, z: { 1: [3.50, 6.33, 6.33, 6.33, 6.50, 6.50, 7.17, 7.17, 10.67, 12.80, 12.80, 12.80] } },
  { L: 20, z: { 1: [5.21, 5.21, 5.42, 7.08, 7.50, 7.50, 13.54, 13.54, 13.96, 14.17, 14.38, 14.38] } },
  { L: 25, z: { 1: [6.25, 6.46, 6.46, 10.21, 10.21, 10.21, 10.63, 10.63, 12.75, 12.75, 12.75, 12.75] } },
  { L: 30, z: { 1: [_, _, _, 10.56, 18.33, 18.33, 18.61, 18.61, 18.89, 19.17, 19.17, 19.17] } },
  { L: 40, z: { 1: [_, _, _, 14.73, 15.00, 15.56, 15.56, 15.83, 18.33, 18.33, 18.33, 18.33] } },
];
const TABLE_F2 = [
  { L: 5, z: { 2: [1.78, 1.88, 1.93, 1.93, 2.13, 2.13, 3.08, 3.08, 3.44, 3.54, 3.59, 4.13], 4: [1.88, 1.93, 2.13, 2.13, 3.08, 3.13, 3.44, 3.54, 3.59, 4.31, 4.31, 4.31] } },
  { L: 7.5, z: { 2: [2.08, 2.64, 2.78, 2.78, 3.06, 5.07, 5.21, 5.21, 5.28, 5.35, 6.33, 6.33], 4: [2.64, 2.98, 4.86, 4.93, 5.14, 5.21, 5.35, 5.42, 6.32, 6.46, 6.67, 6.67] } },
  { L: 10, z: { 1: [2.50, 2.50, 2.71, 6.15, 6.25, 6.36, 6.36, 6.46, 6.46, 6.46, 7.19, 7.19], 2: [2.71, 5.83, 6.15, 6.15, 6.36, 6.46, 6.46, 6.46, 7.19, 7.19, 7.75, 7.75] } },
  { L: 12.5, z: { 1: [2.50, 3.58, 5.24, 5.24, 5.36, 5.36, 7.86, 8.33, 9.14, 9.14, 9.14, 9.14], 2: [5.12, 5.24, 5.36, 5.36, 7.86, 8.22, 9.53, 9.64, 10.36, 10.36, 10.48, 10.48] } },
  { L: 15, z: { 1: [5.33, 5.33, 6.33, 6.33, 6.50, 6.50, 6.50, 7.80, 7.80, 7.80, 7.80, 7.80], 2: [5.33, 6.33, 6.50, 6.50, 10.33, 10.33, 10.50, 10.50, 10.67, 10.67, 12.40, 12.40] } },
  { L: 17.5, z: { 1: [6.33, 6.33, 6.50, 6.50, 7.17, 10.67, 10.67, 12.80, 12.80, 12.80, 12.80, 12.80] } },
  { L: 20, z: { 1: [5.21, 7.08, 7.50, 7.50, 13.54, 13.75, 13.96, 14.17, 14.38, 14.38, 14.38, 14.38] } },
  { L: 25, z: { 1: [6.46, 10.20, 10.42, 10.42, 10.63, 10.63, 12.75, 12.75, 12.75, 12.75, 12.75, 12.75] } },
  { L: 30, z: { 1: [_, _, _, 18.33, 18.61, 18.89, 18.89, 19.17, 19.17, 19.17, 19.17, 19.17] } },
  { L: 40, z: { 1: [_, _, _, 15.00, 15.56, 15.83, 18.33, 18.33, 18.33, 18.33, 18.33, 18.33] } },
];

/**
 * (v/n₀)lim [m] de l'annexe F (tableau F.1 pour a_max = 3,5 m/s², voie ballastée ; F.2 pour 5,0 m/s²) pour une portée L
 * [m], une masse m [10³ kg/m] et un amortissement ζ [%] : ligne de la classe de portée, ζ tabulé le plus grand ne
 * dépassant pas ζ (côté sécurité), colonne de la classe de masse. null hors domaine (L < 5 m, m < 5 t/m, ζ inférieur
 * au plus petit ζ tabulé, case vide).
 */
export function vSurN0Lim({ L, m, zeta, aMax = 3.5 }) {
  const T = aMax >= 5 ? TABLE_F2 : TABLE_F1;
  if (!(L >= 5) || !(m >= 5)) return null;
  let i = PORTEES_F.length - 1; while (i > 0 && L < PORTEES_F[i]) i--;
  const zs = Object.keys(T[i].z).map(Number).filter(z => z <= zeta + 1e-9);
  if (!zs.length) return null;
  const zr = Math.max(...zs);
  let j = MASSES_F.length - 1; while (j > 0 && m < MASSES_F[j]) j--;
  const v = T[i].z[zr][j];
  return v == null ? null : { v, ligne: { L: PORTEES_F[i], zeta: zr }, colonne: MASSES_F[j], tableau: aMax >= 5 ? 'F.2' : 'F.1' };
}

/**
 * Organigramme de la figure 6.9 (EN 1991-2 § 6.4.4) : analyse dynamique requise ou non.
 * @param {object} o V [km/h] ; continu (travées continues) ; simple (structure simple, note 1 : appuis simples, poutre ou
 *   dalle, biais négligeable) ; L [m] ; n0 [Hz] (et n0min, n0max : fourchette de masse) ; nT [Hz] (fréquence de torsion,
 *   facultative) ; m [t/m] ; zeta [%] ; entretien ; alpha ; repartition [m] (longueur de répartition des essieux, ≥ 2,50 m)
 * @returns {{requise: boolean|null, etapes: string[], conclusion: string, reserve?: string}}
 */
export function decisionAnalyseDynamique(o) {
  const et = [], V = o.V || 0, lim = o.L > 0 ? limitesN0(o.L) : null;
  const n0s = [...new Set([o.n0, o.n0min, o.n0max].filter(x => x > 0).map(x => +x.toFixed(6)))];
  const dansLimites = lim && n0s.length ? n0s.every(n => n >= lim.inf - 1e-9 && n <= lim.sup + 1e-9) : null;
  const sousSup = lim && n0s.length ? n0s.every(n => n <= lim.sup + 1e-9) : null;
  const fin = (requise, conclusion, reserve) => ({ requise, etapes: et, conclusion, ...(reserve ? { reserve } : {}), limites: lim });
  const brancheTorsion = () => {
    if (!(o.nT > 0)) { et.push('n_T (première fréquence de torsion) non renseignée : branche n_T > 1,2 n₀ non évaluable'); return fin(null, 'indéterminé : renseigner n_T ou effectuer l\'analyse dynamique (§ 6.4.6)'); }
    if (!(o.nT > 1.2 * o.n0)) { et.push(`n_T = ${o.nT.toFixed(2).replace(".", ",")} Hz ≤ 1,2 n₀ = ${(1.2 * o.n0).toFixed(2).replace(".", ",")} Hz`); return fin(true, 'analyse dynamique requise, avec les modes propres de torsion et de flexion (§ 6.4.6)'); }
    et.push(`n_T = ${o.nT.toFixed(2).replace(".", ",")} Hz > 1,2 n₀ = ${(1.2 * o.n0).toFixed(2).replace(".", ",")} Hz → tableaux F.1 et F.2`);
    // conditions de validité de l'annexe F (F(2))
    const cond = [];
    if (o.entretien !== 'soigne') cond.push('voie soigneusement entretenue (Φ2) exigée par F(2)');
    if (sousSup === false) cond.push('n₀ au-dessus de la limite supérieure de la figure 6.10');
    if ((o.alpha ?? 1) < 1) cond.push('α ≥ 1 exigé par F(2)');
    if (o.repartition != null && o.repartition < 2.5) cond.push('répartition des charges d\'essieux sur au moins 2,50 m exigée par F(2)');
    if (!o.simple) cond.push('structure sur appuis simples exigée par F(2)');
    if (cond.length) { et.push('annexe F non applicable : ' + cond.join(' ; ')); return fin(true, 'analyse dynamique requise (§ 6.4.6) : annexe F non applicable'); }
    const t = vSurN0Lim({ L: o.L, m: o.m, zeta: o.zeta, aMax: 3.5 });
    if (!t) { et.push(`(v/n₀)lim hors du domaine des tableaux (L = ${o.L.toFixed(1).replace(".", ",")} m, m = ${(o.m || 0).toFixed(1).replace(".", ",")} t/m, ζ = ${(o.zeta || 0).toFixed(2).replace(".", ",")} %)`); return fin(true, 'analyse dynamique requise (§ 6.4.6) : hors du domaine de l\'annexe F'); }
    const v = V / 3.6, r = v / o.n0;
    et.push(`v/n₀ = ${v.toFixed(1).replace(".", ",")}/${o.n0.toFixed(2).replace(".", ",")} = ${r.toFixed(2).replace(".", ",")} m ; (v/n₀)lim = ${t.v.toFixed(2).replace(".", ",")} m (tableau ${t.tableau}, ligne L ≥ ${t.ligne.L} m, ζ = ${t.ligne.zeta} %, m ≥ ${t.colonne} t/m)`);
    return r <= t.v ? fin(false, 'analyse dynamique non requise (annexe F) ; Φ2 avec l\'analyse statique (§ 6.4.3(1)P)') : fin(true, 'analyse dynamique requise (§ 6.4.6) : modes propres de flexion suffisants');
  };
  if (V <= 200) {
    et.push(`V = ${V > 0 ? V : '—'} km/h ≤ 200 km/h`);
    if (o.continu) { et.push('pont à travées continues (note 5)'); return fin(false, 'analyse dynamique non requise ; Φ avec l\'analyse statique (§ 6.4.3(1)P)', 'note 5 de la figure 6.9 : sous réserve des vérifications de résistance et de déformation de l\'EN 1990 A2.4.4 (y compris le confort très bon des voyageurs)'); }
    if (!lim || !lim.domaine) { et.push(`L = ${o.L} m hors du domaine 4-100 m de la figure 6.10`); return fin(null, 'indéterminé : portée hors du domaine de la figure 6.10 — analyse dynamique à envisager'); }
    if (dansLimites) { et.push(`n₀ = ${n0s.map(n => n.toFixed(2).replace(".", ",")).join(' / ')} Hz dans les limites de la figure 6.10 [${lim.inf.toFixed(2).replace(".", ",")} ; ${lim.sup.toFixed(2).replace(".", ",")}] Hz (note 6)`); return fin(false, 'analyse dynamique non requise ; Φ avec l\'analyse statique (§ 6.4.3(1)P)'); }
    et.push(`n₀ = ${n0s.map(n => n.toFixed(2).replace(".", ",")).join(' / ')} Hz hors des limites de la figure 6.10 [${lim.inf.toFixed(2).replace(".", ",")} ; ${lim.sup.toFixed(2).replace(".", ",")}] Hz`);
    if (sousSup === false) { et.push('n₀ au-dessus de la limite supérieure (note 7)'); return fin(true, 'analyse dynamique requise (note 7 de la figure 6.9 ; § 6.4.6)'); }
    return brancheTorsion();
  }
  et.push(`V = ${V} km/h > 200 km/h`);
  if (!o.simple) { et.push('structure non simple (note 1)'); return fin(true, 'analyse dynamique requise, avec les modes propres de torsion et de flexion (§ 6.4.6) ; HSLM si la ligne est interopérable (§ 6.4.6.1.1(2))'); }
  if (o.L >= 40) {
    et.push('L ≥ 40 m');
    if (dansLimites) { et.push(`n₀ dans les limites de la figure 6.10 [${lim.inf.toFixed(2).replace(".", ",")} ; ${lim.sup.toFixed(2).replace(".", ",")}] Hz`); return fin(false, 'analyse dynamique non requise ; Φ avec l\'analyse statique (§ 6.4.3(1)P)'); }
    et.push('n₀ hors des limites de la figure 6.10');
  } else et.push('L < 40 m');
  return brancheTorsion();
}

// ---------------------------------------------------------------------------------------------------------------------
// Limites de l'EN 1990/A1 annexe A2.4.4 et de l'EN 1991-2 § 6.5.4.5.2
// ---------------------------------------------------------------------------------------------------------------------

/** Gauche maximal t [mm sur 3 m] pour l'écartement 1,435 m (EN 1990 A2.4.4.2.2, valeurs recommandées t₁, t₂, t₃). */
export const limiteGauche = V => (V <= 120 ? 4.5 : V <= 200 ? 3.0 : 1.5);
/** Gauche total (voie existante + tablier) t_T ≤ 7,5 mm sur 3 m (A2.4.4.2.2, valeur recommandée). */
export const GAUCHE_TOTAL = 7.5;
/** Flèche verticale maximale sous trafic ferroviaire : L/600 (A2.4.4.2.3(1), valeur recommandée). */
export const FLECHE_L_SUR = 600;
/** Rotation horizontale et variation de rayon maximales (A2.4.4.2.4, tableau A2.8, valeurs recommandées). */
export function limiteTransversale(V, multiTabliers = false) {
  const row = V <= 120 ? [0.0035, 1700, 3500] : V <= 200 ? [0.0020, 6000, 9500] : [0.0015, 14000, 17500];
  return { thetaH: row[0], rayon: multiTabliers ? row[2] : row[1] };
}
/** Première fréquence de vibration latérale minimale d'une travée f_h0 = 1,2 Hz (A2.4.4.2.4(3), valeur recommandée). */
export const FH0 = 1.2;
/** Accélération verticale dans les voitures b_v [m/s²] par niveau de confort (A2.4.4.3.1, tableau A2.9). */
export const BV = { tres_bon: 1.0, bon: 1.3, acceptable: 2.0 };
/**
 * Coefficient appliqué aux L/δ de la figure A2.3 (A2.4.4.3.2(5)) : la figure vaut pour trois travées indépendantes
 * successives ou plus (1,0) ; une travée, ou deux travées indépendantes ou continues : 0,7 ; ouvrage continu à trois
 * travées ou plus : 0,9. Ces coefficients ne s'appliquent pas à la limite L/δ = 600 (note sous la figure A2.3).
 */
export function facteurConfort({ nTravees, continu }) {
  if (continu) return nTravees >= 3 ? 0.9 : 0.7;
  return nTravees >= 3 ? 1.0 : 0.7;
}

/**
 * Figure A2.3 de l'EN 1990/A1 (b_v = 1 m/s², trois travées indépendantes ou plus), numérisée sur la NF EN 1990/A1 (scan
 * redressé de 0,69°, quadrillage relevé au pixel, segments ajustés par moindres carrés sur les traits — résidus 1 à 5 px,
 * précision ≈ ± 2 %) : chaque courbe = palier jusqu'à Lp, rampe linéaire jusqu'au sommet (Ls ; vs), descente linéaire
 * jusqu'au plancher 600 (atteint en L600) ou jusqu'à 120 m (v120). Plancher L/δ = 600 commun à toutes les courbes.
 */
export const FIGURE_A23 = {
  120: { palier: 800, Lp: 10.2, Ls: 22.2, vs: 889, L600: 36.8 },
  160: { palier: 900, Lp: 12.4, Ls: 29.5, vs: 1196, L600: 63.6 },
  200: { palier: 1000, Lp: 14.7, Ls: 37.5, vs: 1518, L600: 90.0 },
  220: { palier: 1100, Lp: 17.1, Ls: 41.1, vs: 1662, L600: 101.8 },
  250: { palier: 1200, Lp: 19.6, Ls: 47.1, vs: 1910, v120: 644 },
  280: { palier: 1300, Lp: 22.2, Ls: 52.4, vs: 2119, v120: 954 },
  300: { palier: 1400, Lp: 24.6, Ls: 56.2, vs: 2276, v120: 1173 },
  350: { palier: 1500, Lp: 27.2, Ls: 65.1, vs: 2648, v120: 1695 },
};
const courbeA23 = (c, L) => {
  if (L <= c.Lp) return c.palier;
  if (L <= c.Ls) return c.palier + (c.vs - c.palier) * (L - c.Lp) / (c.Ls - c.Lp);
  const v = c.L600 ? c.vs + (600 - c.vs) * (L - c.Ls) / (c.L600 - c.Ls) : c.vs + (c.v120 - c.vs) * (L - c.Ls) / (120 - c.Ls);
  return Math.max(600, v);
};
/**
 * L/δ de la figure A2.3 pour une vitesse V [km/h] et une portée L [m] : interpolation linéaire en V entre les courbes ;
 * V < 120 km/h : courbe 120 km/h (côté sécurité, la figure ne descend pas plus bas) ; V > 350 km/h et L > 120 m : hors
 * du domaine de la figure (A2.4.4.3.2(6) : analyse spéciale) → null.
 */
export function lSurDeltaFigure(V, L) {
  if (!(L > 0) || L > 120 + 1e-9 || V > 350 + 1e-9) return null;
  const Vs = Object.keys(FIGURE_A23).map(Number);
  const v = Math.max(V || 0, 120);
  let i = 0; while (i < Vs.length - 2 && v > Vs[i + 1]) i++;
  const [Va, Vb] = [Vs[i], Vs[i + 1]], t = Math.min(1, Math.max(0, (v - Va) / (Vb - Va)));
  return courbeA23(FIGURE_A23[Va], L) * (1 - t) + courbeA23(FIGURE_A23[Vb], L) * t;
}
/**
 * L/δ requis pour le confort (A2.4.4.3.2(4)-(5)) : max(k × (L/δ)_fig / b_v ; 600) — k (0,7 / 0,9 / 1,0) et b_v ne
 * s'appliquent pas au plancher 600 ; si k et b_v font passer sous 600, le plancher est retenu et signalé (`plancher`).
 */
export function lSurDeltaRequis({ fig, k = 1, bv = 1 }) {
  if (!(fig > 0)) return null;
  const brut = k * fig / bv;
  return { brut, requis: Math.max(brut, 600), plancher: brut < 600 - 1e-9 };
}

/** Accélération verticale maximale du tablier (A2.4.4.2.1(4)) : γ_bt = 3,5 m/s² (ballast), γ_df = 5 m/s² (pose directe). */
export const ACCELERATION_MAX = { ballast: 3.5, poseDirecte: 5.0 };

/** δH [mm] admissible à l'extrémité du tablier sous charges verticales (EN 1991-2 § 6.5.4.5.2(2)). */
export const deltaHLim = (interaction = false) => (interaction ? 8 : 10);
/** δV [mm] admissible entre le dessus du tablier et la construction adjacente (EN 1991-2 § 6.5.4.5.2(3)). */
export const deltaVLim = V => (V > 160 ? 2 : 3);

// ---------------------------------------------------------------------------------------------------------------------
// Flèches et rotations de la poutre continue (lignes d'influence en forme fermée)
// ---------------------------------------------------------------------------------------------------------------------

/** Flèche (vers le bas +) en ξ d'une travée L sur appuis simples sous P = 1 en a (EI = 1). */
function wPonctuelle(a, xi, L) {
  if (xi <= a) { const b = L - a; return b * xi * (L * L - b * b - xi * xi) / (6 * L); }
  const b2 = L - xi, a2 = a; return a2 * b2 * (L * L - a2 * a2 - b2 * b2) / (6 * L);
}
/** Flèche en ξ due aux moments d'extrémité M0 (gauche) et ML (droite), fibre inférieure tendue + (EI = 1). */
const wMoments = (M0, ML, xi, L) => (M0 * xi * (L - xi) * (2 * L - xi) + ML * xi * (L * L - xi * xi)) / (6 * L);
/** Pentes (dw/dξ) aux extrémités 0 et L, charge ponctuelle unité en a (EI = 1). */
const pentesPonctuelle = (a, L) => { const b = L - a; return [b * (L * L - b * b) / (6 * L), -a * (L * L - a * a) / (6 * L)]; };
const pentesMoments = (M0, ML, L) => [(2 * M0 + ML) * L / 6, -(M0 + 2 * ML) * L / 6];

/**
 * Fonction de flèche de la poutre continue `beam` (ContinuousBeam) pour des rigidités EI [kN·m²] par travée :
 * renvoie { w(x, p), pente(j, cote, p) } — w : flèche [m, vers le bas +] au point x sous une charge unité [kN] à la position
 * de grille p (beam.positions[p], abouts compris) ; pente : rotation de la travée j à son extrémité gauche (0) ou droite (1).
 * Charges sur les abouts : moment nodal −P·a à l'appui extrême. Points sur les abouts : rotation rigide de la travée de
 * rive (la flexion propre de l'about est négligée).
 */
export function flechesPoutre(beam, EI) {
  const n = beam.n, L = beam.spans, x0 = beam.x0;
  const reps = beam.positions.map(pos => {
    if (pos.j < 0 || pos.j >= n) {
      const Mnode = new Array(n + 1).fill(0);
      if (pos.j < 0) Mnode[0] = -pos.a; else Mnode[n] = -pos.a;
      const r = beam._responseToNodalMoments(Mnode);
      return { j: -1, a: 0, M0: r.M0, ML: r.ML };
    }
    const r = beam.endMomentsPoint(pos.j, pos.a, 1);
    return { j: pos.j, a: pos.a, M0: r.M0, ML: r.ML };
  });
  const pente = (j, cote, p) => {
    const r = reps[p];
    const pm = pentesMoments(r.M0[j], r.ML[j], L[j]);
    let s = pm[cote];
    if (r.j === j) s += pentesPonctuelle(r.a, L[j])[cote];
    return s / EI[j];
  };
  const w = (x, p) => {
    if (x < x0[0]) return pente(0, 0, p) * (x - x0[0]);
    if (x > x0[n]) return pente(n - 1, 1, p) * (x - x0[n]);
    let j = 0; while (j < n - 1 && x > x0[j + 1]) j++;
    const xi = x - x0[j], r = reps[p];
    let v = wMoments(r.M0[j], r.ML[j], xi, L[j]);
    if (r.j === j) v += wPonctuelle(r.a, xi, L[j]);
    return v / EI[j];
  };
  return { w, pente, nPos: reps.length };
}

/** Ligne d'influence (tableau sur beam.xs) d'une grandeur f(p) définie par position de charge. */
function ligne(beam, f) { const il = new Float64Array(beam.xs.length); for (let p = 0; p < il.length; p++) il[p] = f(p); return il; }

/** Enveloppe max / min d'un modèle ferroviaire sur une ligne d'influence (mêmes routines que les sollicitations). */
function enveloppe(beam, il, modele) {
  if (modele.kind === 'lm71') return beam.lm71Envelope(il, modele);
  if (modele.kind === 'sw') return beam.swEnvelope(il, modele);
  throw new Error('modèle inconnu');
}

// ---------------------------------------------------------------------------------------------------------------------
// Vérifications d'un tablier sous rail
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Déformations et vibrations d'un tablier sous rail (pont-dalle ou tablier à poutres modélisé par SlabDeck).
 * @param {SlabDeck} deck tablier (poutre continue deck.beam, Guyon-Massonnet : deck.b, deck.nu, deck.alphaTorsion, deck.Leq)
 * @param {object} rail résultat de deck.ferroviaire() (params, voies, phi, diffusion.bw, ecc, continu)
 * @param {object} o EI [kN·m²] (tablier entier, non fissuré, E_cm) ; EIz [kN·m²] (flexion horizontale du tablier) ;
 *   gPerm { nom, min, max } [kN/m] ; eSup [m] (axe neutre → dessus du tablier) ; abouts [aG, aD] [m] (extrémité du tablier
 *   au-delà de l'appareil d'appui) ; type ('beton_arme' | 'precontraint') ; nT [Hz] ; confort ('tres_bon'…) ;
 *   LdeltaFig (forçage de L/δ de la figure A2.3, b_v = 1 ; sinon figure numérisée) ; phiL600 (flèche L/600 majorée par Φ) ; simple (structure simple au sens de la note 1) ; ecartementVoie
 *   (1,435 m) ; multiTabliers
 */
export function deformationsRail(deck, rail, o = {}) {
  const beam = deck.beam, n = beam.n, R = rail.params, V = R.V || 0;
  const EIs = beam.spans.map(() => o.EI);
  const F = flechesPoutre(beam, EIs);
  const s = o.ecartementVoie || 1.435;
  const alpha = R.alpha ?? 1, phi = rail.phi;
  const avert = [];
  // ---- modèles verticaux (charges caractéristiques ; ψ = 1 : note 4 du tableau A2.3 pour les déformations)
  const M = (a, k = 1) => {
    const L71 = lm71(a), out = [{ nom: 'LM71', kind: 'lm71', P: k * L71.essieux[0].Q, n: LM71.n, a: LM71.a, q: k * L71.qv }];
    if (rail.continu) { const s0 = sw('SW/0', a); out.push({ nom: 'SW/0', kind: 'sw', q: k * s0.q, a: s0.a, c: s0.c }); }
    return out;
  };
  const sw2 = R.sw2 ? (k = 1) => { const s2 = sw('SW/2'); return { nom: 'SW/2', kind: 'sw', q: k * s2.q, a: s2.a, c: s2.c }; } : null;
  // ---- coefficient K de Guyon-Massonnet d'une bande de voie (axe e) en y, pour la travée j
  const bw = rail.diffusion.bw, ecc = rail.ecc;
  const Kc = new Map();
  const K = (j, e, y) => {
    const jj = Math.min(j, deck.Leq.length - 1), key = `${jj}|${e.toFixed(4)}|${y.toFixed(4)}`;
    if (!Kc.has(key)) Kc.set(key, coefKBand({ b: deck.b, L: deck.Leq[jj], e1: Math.max(-deck.b, e - bw / 2), e2: Math.min(deck.b, e + bw / 2), y: Math.max(-deck.b, Math.min(deck.b, y)), nu: deck.nu, alpha: deck.alphaTorsion }));
    return Kc.get(key);
  };
  const spanOf = x => { let j = 0; while (j < n - 1 && x > beam.x0[j + 1]) j++; return j; };
  const voies = rail.voies;

  // ---- 1. flèche verticale le long de chaque voie (A2.4.4.2.3(1)) et confort (A2.4.4.3)
  const fracs = [0.4, 0.45, 0.5, 0.55, 0.6];
  const fleches = [], confort = [];
  for (let j = 0; j < n; j++) {
    const Lj = beam.spans[j];
    let best = null, bestC = null;
    for (const f of fracs) {
      const x = beam.x0[j] + f * Lj, il = ligne(beam, p => F.w(x, p));
      const env = mods => Math.max(...mods.map(m => enveloppe(beam, il, m).max));
      // L/600 : charges verticales classifiées (α), SW/0 sur les ouvrages continus, SW/2 si requis ; toutes les voies chargées (prudent)
      const kL600 = o.phiL600 ? phi : 1;     // A2.4.4.2.3(1) : charges classifiées, sans Φ (option prudente : × Φ)
      const wA = env(M(alpha, kL600)), wS2 = sw2 ? env([sw2(kL600)]) : 0;
      // confort : LM71 × Φ, α = 1, une seule voie chargée (A2.4.4.3.2)
      const wC = env(M(1, phi).filter(m => m.nom === 'LM71'));
      for (const [t, yt] of voies.entries()) {
        // flèche sous la voie t : moyenne des deux files de rails ; contributions de chaque voie chargée (bande ± e)
        const wRail = (yy, w1, w2Other) => voies.reduce((acc, ye, u) => acc + Math.max(K(j, ye + ecc, yy), K(j, ye - ecc, yy)) * (u === t ? w1 : w2Other), 0);
        const yR = [yt - s / 2, yt + s / 2];
        const toutes = Math.max(...yR.map(yy => wRail(yy, Math.max(wA, wS2), wA)));     // SW/2 sur la voie t, LM71/SW0 sur l'autre
        const cand = { j, x, f, w: toutes, voie: t };
        if (!best || cand.w > best.w) best = cand;
        const wc = Math.max(...yR.map(yy => Math.max(K(j, yt + ecc, yy), K(j, yt - ecc, yy)) * wC));
        if (!bestC || wc > bestC.w) bestC = { j, x, f, w: wc, voie: t };
      }
    }
    const lim = Lj / FLECHE_L_SUR;
    fleches.push({ j, L: Lj, x: best.x, voie: best.voie, w: best.w, lim, ok: best.w <= lim + 1e-12, LsurD: Lj / best.w });
    const fac = facteurConfort({ nTravees: o.nTravees || n, continu: rail.continu }), bv = BV[o.confort || 'tres_bon'] || 1;
    // (L/δ)_fig : valeur saisie (forçage) ou figure A2.3 numérisée ; hors domaine (L > 120 m, V > 350 km/h) : analyse spéciale
    const fig = o.LdeltaFig > 0 ? o.LdeltaFig : lSurDeltaFigure(V, Lj), req = lSurDeltaRequis({ fig, k: fac, bv });
    confort.push({ j, L: Lj, x: bestC.x, voie: bestC.voie, w: bestC.w, LsurD: Lj / bestC.w, facteur: fac, bv, fig, source: o.LdeltaFig > 0 ? 'saisie' : 'figure',
      LsurDbrut: req ? req.brut : null, LsurDlim: req ? req.requis : null, plancher: req ? req.plancher : false, horsDomaine: !req, ok: req ? Lj / bestC.w >= req.requis - 1e-9 : null });
  }

  if (!(V > 0)) avert.push('vitesse de ligne non renseignée : confort vérifié avec la courbe V = 120 km/h de la figure A2.3');
  else if (V < 120) avert.push(`V = ${V} km/h < 120 km/h : confort vérifié avec la courbe V = 120 km/h de la figure A2.3 (la plus basse, côté sécurité)`);
  if (confort.some(c => c.horsDomaine)) avert.push('confort : portée > 120 m ou vitesse > 350 km/h, hors du domaine de la figure A2.3 — analyse spéciale nécessaire (EN 1990 A2.4.4.3.2(6))');
  if (confort.some(c => c.plancher)) avert.push('confort : le coefficient du nombre de travées et b_v font passer L/δ sous 600 ; le plancher L/δ = 600 de la figure A2.3, non multiplié, est retenu');
  // ---- 2. gauche du tablier sur 3 m (A2.4.4.2.2) : LM71 × α × Φ (SW/0, SW/2), force centrifuge (excentrement) ; les
  // points hors du tablier (remblai d'accès) ont une flèche nulle → gauche d'entrée et de sortie compris
  let eCf = 0;
  if (V > 0 && R.rayon > 0) for (const c of (rail.horizontal?.centrifuge || [])) eCf = Math.max(eCf, 1.80 * c.V * c.V * c.f / (127 * R.rayon));
  const pas = 0.25, base = 3.0, xA = beam.xMin - base, xB = beam.xMax;
  const wDeck = (x, p) => (x < beam.xMin - 1e-9 || x > beam.xMax + 1e-9 ? 0 : F.w(x, p));
  let gauche = { t: 0 };
  const modsG = [...M(alpha, phi), ...(sw2 ? [sw2(phi)] : [])];
  for (let x = xA; x <= xB + 1e-9; x += pas) {
    const il = ligne(beam, p => wDeck(x + base, p) - wDeck(x, p));
    const amp = Math.max(...modsG.map(m => { const e = enveloppe(beam, il, m); return Math.max(Math.abs(e.max), Math.abs(e.min)); }));
    if (amp <= 0) continue;
    const j = spanOf(Math.min(Math.max(x + base / 2, 0), beam.Ltot));
    for (const [t, yt] of voies.entries()) {
      // gauche de la voie t : différence de flèche entre ses deux files de rails, voies chargées avec l'excentrement le plus
      // défavorable (r/18, augmenté de l'excentrement dû à la force centrifuge sur la voie en courbe)
      let dK = 0;
      for (const ye of voies) {
        const d = Math.max(...[ecc + eCf, -(ecc + eCf)].map(e => Math.abs(K(j, ye + e, yt + s / 2) - K(j, ye + e, yt - s / 2))));
        dK += d;
      }
      const t3 = 1000 * dK * amp;
      if (t3 > gauche.t) gauche = { t: t3, x, voie: t, dK, amp };
    }
  }
  gauche.lim = limiteGauche(V); gauche.ok = gauche.t <= gauche.lim + 1e-9; gauche.limTotal = GAUCHE_TOTAL; gauche.eCf = eCf;

  // ---- 3. extrémités du tablier : rotation, δH (§ 6.5.4.5.2(2), LM71 et SW/0 × α, sans Φ, une ou deux voies) et δV
  // (§ 6.5.4.5.2(3), actions variables : soulèvement de l'about au-delà de l'appareil d'appui, Φ inclus)
  const abouts = o.abouts || deck.g.overhangs || [0, 0];
  const nVoiesTot = voies.length;
  const extremites = [[0, 0], [n - 1, 1]].map(([j, cote], k) => {
    const il = ligne(beam, p => F.pente(j, cote, p));
    const th = mods => Math.max(...mods.map(m => { const e = enveloppe(beam, il, m); return Math.max(Math.abs(e.max), Math.abs(e.min)); }));
    const thS = th(M(alpha, 1)) * nVoiesTot, thD = th([...M(alpha, phi), ...(sw2 ? [sw2(phi)] : [])]) * nVoiesTot;
    const dH = 1000 * thS * (o.eSup || 0), a = abouts[k] || 0, dV = 1000 * thD * a;
    return { appui: k === 0 ? 'C0' : `C${n}`, theta: thS, thetaDyn: thD, deltaH: dH, deltaHlim: deltaHLim(false), okH: dH <= deltaHLim(false) + 1e-9,
      about: a, deltaV: dV, deltaVlim: deltaVLim(V), okV: a > 0 ? dV <= deltaVLim(V) + 1e-9 : null };
  });

  // ---- 4. fréquence propre n₀ et organigramme de la figure 6.9
  const g = o.gPerm || {};
  const L1 = Math.max(...beam.spans);
  let n0 = null, n0min = null, n0max = null, d0 = null;
  if (!rail.continu && o.EI > 0 && g.nom > 0) {
    d0 = flecheUniforme(g.nom, L1, o.EI);
    n0 = n0DepuisFleche(d0);
    if (g.max > 0) n0min = n0DepuisFleche(flecheUniforme(g.max, L1, o.EI));
    if (g.min > 0) n0max = n0DepuisFleche(flecheUniforme(g.min, L1, o.EI));
  }
  const m = g.nom > 0 ? g.nom / 9.81 : null, zeta = amortissement(o.type || 'beton_arme', L1);
  const decision = decisionAnalyseDynamique({ V, continu: rail.continu, simple: o.simple !== false && !rail.continu, L: rail.continu ? rail.LPhi.LPhi : L1, n0, n0min, n0max, nT: o.nT, m, zeta,
    entretien: R.entretien, alpha, repartition: (R.longueurTraverse || 2.6) });
  if (rail.continu) avert.push('pont à travées continues : n₀ non estimé (l\'équation 6.3 vaut pour les travées sur appuis simples) ; l\'organigramme conclut sans n₀ pour V ≤ 200 km/h (note 5)');

  // ---- 5. déformation transversale et fréquence latérale (A2.4.4.2.4) : travée sur appuis simples (prudent pour les
  // travées continues), effort de lacet 100 α kN (α ≥ 1) à mi-portée et force centrifuge répartie ; vent et gradient
  // thermique transversal non pris en compte
  let transversal = null;
  if (o.EIz > 0) {
    const Q = 100 * Math.max(alpha, 1);
    const qc = (rail.horizontal?.centrifuge || []).reduce((a, c) => Math.max(a, c.qt + 4 * c.Qt / 6.4), 0) * nVoiesTot;
    const rows = beam.spans.map(Lj => {
      const dh = Q * Lj ** 3 / (48 * o.EIz) + 5 * qc * Lj ** 4 / (384 * o.EIz);
      const thh = Q * Lj ** 2 / (16 * o.EIz) + qc * Lj ** 3 / (24 * o.EIz);
      const fh = g.nom > 0 ? Math.PI / (2 * Lj * Lj) * Math.sqrt(o.EIz / (g.nom / 9.81)) : null;
      return { L: Lj, deltaH: dh, thetaH: thh, rayon: dh > 0 ? Lj * Lj / (8 * dh) : Infinity, fh };
    });
    const lim = limiteTransversale(V, !!o.multiTabliers);
    transversal = { rows, lim, Q, qc, fh0: FH0, ok: rows.every(r => (r.thetaH <= lim.thetaH + 1e-12 || r.rayon >= lim.rayon) && (r.fh == null || r.fh >= FH0)) };
  }

  return { fleches, confort, gauche, extremites, n0: { L: L1, d0, n0, n0min, n0max, m, zeta, type: o.type || 'beton_arme', limites: limitesN0(L1), E: o.E }, decision, transversal,
    hyp: { EI: o.EI, EIz: o.EIz, eSup: o.eSup, s, phi, alpha, V, confort: o.confort || 'tres_bon', LdeltaFig: o.LdeltaFig || null, phiL600: !!o.phiL600 }, avert, aConfirmer: A_CONFIRMER_DEFORMATIONS };
}
