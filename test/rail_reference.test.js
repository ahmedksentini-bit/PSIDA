/**
 * Ponts-rails, lot 6 : validation et cas de référence.
 *
 * A. Validation externe — S. D. Paulse, « Analysis and comparison of the South African and Eurocode live load models for
 *    railway bridges », mémoire de master, University of Cape Town, 2018 (http://hdl.handle.net/11427/29698) :
 *    tableau 4.1 (moments maximaux absolus LM71 sur travées isostatiques, calcul Prokon, essieu Q_vk3 décalé du milieu)
 *    et tableau 4.2 (limites de n0 de la figure 6.10, arrondies à l'unité).
 * B. Cas de référence complet, entièrement recalculé ici sans rien importer du moteur pour le contrôle : dalle continue
 *    12 + 16 + 12 m, deux voies, α = 1,21, SW/2 requis, V = 160 km/h, r = 1 500 m. Lignes d'influence par l'équation des
 *    trois moments (Clapeyron, EI constant), enveloppes par balayage au pas de 1 cm, efforts horizontaux à la main.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { limitesN0 } from '../src/rail_deformations.js';
import { effortsLongitudinaux, effortsTransversaux } from '../src/rail_appuis.js';

const proche = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b} (tolérance ${tol})`);
const RAIL = { voies: [0], alpha: 1, entretien: 'normal', sw2: false, ballast: 0.30, longueurTraverse: 2.60, hTraverse: 0.22 };
const dalle = (spans, nSec = 20, width = 6) => new SlabDeck({ spans, width, h: 0.9, roadway: { y1: -width / 2, y2: width / 2 }, overhangs: [0, 0], lines: [], bands: [], footways: [], nGrid: 100, nSec });
const phi3 = L => Math.min(Math.max(2.16 / (Math.sqrt(L) - 0.2) + 0.73, 1), 2);

// ---------------------------------------------------------------------------------------------------------------------
// A. Validation externe (mémoire UCT, tableaux 4.1 et 4.2)
// ---------------------------------------------------------------------------------------------------------------------

test('A1 — LM71 isostatique : moments maximaux absolus du mémoire UCT (tableau 4.1, Prokon)', () => {
  // valeurs publiées (α = 1, sans Φ) : 10 m → 1 859,46 kN·m ; 25 m → 8 936,20 kN·m ; 40 m → 20 515,65 kN·m
  const publie = { 10: 1859.46, 25: 8936.20, 40: 20515.65 };
  for (const [L, M] of Object.entries(publie).map(([k, v]) => [Number(k), v])) {
    // maillage fin (100 sections par travée) : la section du maximum absolu est atteinte à quelques centimètres près
    const d = dalle([L], 100), r = d.ferroviaire(RAIL);
    proche(r.phi, phi3(L), 1e-12);
    proche(Math.max(...r.groupes[0].res.Mmax) / r.phi, M, 1e-4);
    // maillage par défaut (20 sections) : écart borné à 0,25 % (section du maximum absolu hors des points de calcul)
    const d20 = dalle([L]), r20 = d20.ferroviaire(RAIL);
    const e = Math.max(...r20.groupes[0].res.Mmax) / r20.phi / M - 1;
    assert.ok(e <= 1e-6 && e > -0.0025, `L = ${L} m : écart ${(e * 100).toFixed(3)} %`);
  }
});

test('A2 — limites de n0 de la figure 6.10 : concordance avec le tableau 4.2 du mémoire UCT (arrondi à l\'unité)', () => {
  const publie = { 5: [28, 16], 10: [17, 8], 15: [12, 5], 20: [10, 4], 25: [9, 4], 30: [7, 3], 35: [7, 3], 40: [6, 3] };
  for (const [L, [sup, inf]] of Object.entries(publie)) {
    const l = limitesN0(Number(L));
    assert.equal(Math.round(l.sup), sup, `sup L = ${L}`);
    assert.equal(Math.round(l.inf), inf, `inf L = ${L}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// B. Cas de référence — calcul de contrôle indépendant
// ---------------------------------------------------------------------------------------------------------------------

const L3 = [12, 16, 12], X = [0, 12, 28, 40];
/**
 * Moments sur appuis intermédiaires B (x = 12) et C (x = 28) sous une charge unité en x, par l'équation des trois moments
 * (EI constant) : L_j M_{j−1} + 2 (L_j + L_{j+1}) M_j + L_{j+1} M_{j+1} = − Σ termes de charge ; pour une charge P à a de
 * l'appui gauche d'une travée L (b = L − a) : terme à droite P a b (L + a) / L, terme à gauche P a b (L + b) / L.
 */
function momentsAppuis(x) {
  let t1 = 0, t2 = 0;
  const i = x < X[1] ? 0 : x < X[2] ? 1 : 2, L = L3[i], a = x - X[i], b = L - a;
  if (a > 0 && b > 0) {
    const droite = a * b * (L + a) / L, gauche = a * b * (L + b) / L;
    if (i === 0) t1 = droite;
    if (i === 1) { t1 = gauche; t2 = droite; }
    if (i === 2) t2 = gauche;
  }
  // [2(L1+L2)  L2 ; L2  2(L2+L3)] [MB ; MC] = −[t1 ; t2]
  const A = 2 * (L3[0] + L3[1]), B = L3[1], C = 2 * (L3[1] + L3[2]), det = A * C - B * B;
  return { MB: (-t1 * C + t2 * B) / det, MC: (-t2 * A + t1 * B) / det };
}
/** Ligne d'influence du moment en xs : moment isostatique de la travée + interpolation des moments d'appuis. */
function ligneInfluence(xs) {
  const j = xs < X[1] ? 0 : xs < X[2] ? 1 : 2, L = L3[j], s = xs - X[j];
  return x => {
    if (x <= 0 || x >= 40) return 0;
    const { MB, MC } = momentsAppuis(x), Mg = [0, MB, MC, 0][j], Md = [0, MB, MC, 0][j + 1];
    let m0 = 0;
    if (x > X[j] && x < X[j + 1]) { const a = x - X[j]; m0 = a <= s ? a * (L - s) / L : s * (L - a) / L; }
    return m0 + Mg * (1 - s / L) + Md * s / L;
  };
}
const PAS = 0.01, NX = Math.round(40 / PAS);
function tabule(il) { const v = new Float64Array(NX + 1); for (let k = 0; k <= NX; k++) v[k] = il(k * PAS); return v; }
/** Intégrale des seules parties de signe `signe` sur [u, v] (trapèzes au pas de 1 cm). */
function aireSigne(t, u, v, signe) {
  const a = Math.max(0, Math.round(u / PAS)), b = Math.min(NX, Math.round(v / PAS)); let s = 0;
  for (let k = a; k < b; k++) { const y0 = signe * t[k], y1 = signe * t[k + 1]; s += PAS * (Math.max(y0, 0) + Math.max(y1, 0)) / 2; }
  return signe * s;
}
const ilAt = (t, x) => (x <= 0 || x >= 40 ? 0 : t[Math.round(x / PAS)]);
/** LM71 : groupe indivisible de 4 × 250 kN (zone de 6,40 m) ; 80 kN/m sur les seules parties défavorables hors de la zone. */
function lm71(t, signe) {
  const tot = aireSigne(t, 0, 40, signe); let best = 0;
  for (let s = -6.4; s <= 40 + 1e-9; s += PAS) {
    let v = 0; for (let k = 0; k < 4; k++) v += 250 * ilAt(t, s + 0.8 + 1.6 * k);
    v += 80 * (tot - aireSigne(t, s, s + 6.4, signe));
    if (signe * v > signe * best) best = v;
  }
  return best;
}
/** SW/0 ou SW/2 : motif indivisible q sur a, vide c, q sur a. */
function swm(t, q, a, c, signe) {
  let best = 0;
  for (let s = -(2 * a + c); s <= 40 + 1e-9; s += PAS) {
    const tot = (u, v) => { const k0 = Math.max(0, Math.round(u / PAS)), k1 = Math.min(NX, Math.round(v / PAS)); let z = 0; for (let k = k0; k < k1; k++) z += PAS * (t[k] + t[k + 1]) / 2; return z; };
    const v = q * (tot(s, s + a) + tot(s + a + c, s + 2 * a + c));
    if (signe * v > signe * best) best = v;
  }
  return best;
}

test('B1 — cas de référence 12 + 16 + 12 m : L_Φ, Φ3, enveloppes LM71 / SW/0 / SW/2 contre un calcul indépendant', () => {
  const R = { ...RAIL, voies: [-2.1, 2.1], alpha: 1.21, sw2: true, V: 160, rayon: 1500 };
  const d = dalle(L3, 20, 10), r = d.ferroviaire(R);
  // L_Φ (tableau 6.2, cas 5.2) : L_m = 40/3 = 13,333 m ; k = 1,3 (n = 3) ; L_Φ = 17,333 m ≥ max L_i = 16 m
  proche(r.LPhi.LPhi, 1.3 * 40 / 3, 1e-12); proche(r.phi, phi3(1.3 * 40 / 3), 1e-12); proche(r.phi, 1.27500, 1e-5);
  assert.deepEqual(r.vert, ['LM71', 'SW/0']);
  // contrôle de la ligne d'influence : appui B sous charge en milieu de travée 2 (formule fermée des trois moments)
  const { MB } = momentsAppuis(20);
  // charge unité au milieu de la travée centrale, structure symétrique : M_B = M_C, (2 × 28 + 16) M_B = −8 × 8 × 24 / 16 = −96
  proche(MB, -96 / 72, 1e-12); proche(momentsAppuis(20).MC, -96 / 72, 1e-12);
  const tB = tabule(ligneInfluence(12)), tM = tabule(ligneInfluence(20)), tM1 = tabule(ligneInfluence(5));
  const G = id => r.groupes.find(g => g.id === id).res, aphi = 1.21 * r.phi;
  const sB = d.beam.supportSectionIndex(1), sM = d.beam.sectionIndex(1, 0.5);
  // appui B, moment négatif : max(|LM71|, |SW/0|) × α × Φ, une voie (gr11)
  const mB = Math.min(lm71(tB, -1), swm(tB, 133, 15, 5.3, -1));
  proche(G('rail1').Mmin[sB], mB * aphi, 2e-3);
  // milieu de la travée centrale, moment positif
  const mM = Math.max(lm71(tM, 1), swm(tM, 133, 15, 5.3, 1));
  proche(G('rail1').Mmax[sM], mM * aphi, 2e-3);
  // deux voies (gr21) : effets globaux doublés
  proche(G('rail2').Mmax[sM], 2 * G('rail1').Mmax[sM], 1e-9);
  // SW/2 (sans α) sur une voie (gr16), milieu de la travée centrale et appui B
  proche(G('sw2').Mmax[sM], swm(tM, 150, 25, 7, 1) * r.phi, 2e-3);
  proche(G('sw2').Mmin[sB], swm(tB, 150, 25, 7, -1) * r.phi, 2e-3);
  // la travée de rive est couverte par une section voisine : contrôle de cohérence (le maximum calculé n'est pas en dessous)
  const sR = d.beam.sectionIndex(0, 5 / 12);
  if (Number.isInteger(sR)) assert.ok(G('rail1').Mmax[sR] >= 0.99 * Math.max(lm71(tM1, 1), swm(tM1, 133, 15, 5.3, 1)) * aphi);
  // γ et ψ des groupes (tableaux A2.3 et A2.4(B) de l'EN 1990/A1)
  assert.deepEqual(r.groupes.map(g => [g.ref, g.gamma, g.psi0, g.psi1]), [['gr11', 1.45, 0.8, 0.8], ['gr21', 1.45, 0.8, 0.7], ['gr16', 1.2, 0.8, 0.8], ['gr26', 1.2, 0.8, 0.7]]);
});

test('B2 — cas de référence : actions horizontales recalculées à la main (§ 6.5.1 à 6.5.3)', () => {
  // longueur d'influence 40 m, α = 1,21, ouvrage continu (SW/0), SW/2 requis, deux voies de sens opposés
  const lo = effortsLongitudinaux({ L: 40, alpha: 1.21, continu: true, sw2: true });
  proche(lo.voie.Qla, 1.21 * 1000);            // démarrage LM71 : 33 × 40 = 1 320 > 1 000 kN → 1 000 × α = 1 210 kN
  proche(lo.voie.Qlb, 1.21 * 20 * 40);         // freinage LM71 : 20 × 40 × α = 968 kN
  proche(lo.deux, 1210 + 968);                 // § 6.5.3(9) : freinage sur une voie + démarrage sur l'autre = 2 178 kN
  proche(lo.voieSW2.Qlb, 35 * 33);             // SW/2 sur ses parties chargées : 25 + (40 − 32) = 33 m → 1 155 kN
  proche(lo.sw2b, 1155 + 1210);                // SW/2 freinant sur une voie, LM71 démarrant sur l'autre
  // force centrifuge (tableau 6.8) : V = 160 km/h > 120, r = 1 500 m, L_f = 40 m
  const f = 1 - (160 - 120) / 1000 * (814 / 160 + 1.75) * (1 - Math.sqrt(2.88 / 40));   // 0,79989
  proche(f, 0.79989, 1e-5);
  const W = Math.max(1000 + 80 * (40 - 6.4), 133 * 30);                                 // LM71 3 688 kN ; SW/0 3 990 kN
  const tr = effortsTransversaux({ L: 40, alpha: 1.21, continu: true, V: 160, rayon: 1500, sw2: true });
  const casB = 160 ** 2 / (127 * 1500) * f * W, casA = 120 ** 2 / (127 * 1500) * 1.21 * W;   // 428,9 et 364,9 kN
  proche(tr.centrifuge, Math.max(casB, casA), 1e-9); proche(tr.centrifuge, 428.89, 1e-4);
  proche(tr.centrifugeSW2, 80 ** 2 / (127 * 1500) * 150 * 33, 1e-9);   // SW/2 à 80 km/h, f = 1, sans α : 166,3 kN
  proche(tr.lacet, 121);                                                // 100 kN × α (α ≥ 1)
  // tableau d'actions horizontales du tablier (lot 2) cohérent avec les appuis (lot 5) : SW/2 sur ses parties chargées
  const d = dalle(L3, 20, 10), r = d.ferroviaire({ ...RAIL, voies: [-2.1, 2.1], alpha: 1.21, sw2: true, V: 160, rayon: 1500 });
  proche(r.horizontal.demarrageFreinageSW2.freinage, 1155);
  proche(r.horizontal.demarrageFreinage.demarrage, 1210); proche(r.horizontal.demarrageFreinage.freinage, 968);
});
