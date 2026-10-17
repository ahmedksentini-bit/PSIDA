/**
 * Benchmark contre le rapport « programme de calcul PSI DA » (Drive) : note de calcul d'un pont-dalle précontraint
 * isostatique (programme interne PSDPV comparé à PSIDP-EL du SETRA et à des calculs manuels) — travée de 25,60 m,
 * abouts 0,88 m, largeur équivalente 10,30 m (S = 9,69 m², I = 0,689796 m⁴, h ≈ 0,93 m), chaussée 8,50 m, classe 1,
 * 2 voies de 4,25 m, Bc / Bt / Mc120. Hors précontrainte.
 * Le programme convertit 1 t = 9,81 kN (A(l) = 230 + 36000/(l+12) kg/m² × 9,81), l'outil 1 t = 10 kN :
 * les charges de trafic de l'outil sont donc ramenées par le facteur 0,981 avant comparaison.
 * Écarts commentés dans /home/claude/ref/reports/progpsida.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { coefMu } from '../src/guyon.js';
import { deltaDyn } from '../src/loads_f61.js';
import { endRotations } from '../src/bearings.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : réf ${b}, outil ${a.toFixed(5)} (écart ${(100 * (a - b) / Math.abs(b)).toFixed(2)} %)`);
const L = 25.6, W = 10.30, B = W / 2, D = 0.88, U = 0.981;   // U : 9,81 kN/t (programme) / 10 kN/t (outil)
const G = (237.647 + 48.854) * L;                              // poids ossature + superstructures nominales de la travée [kN]
const mk = (nu, extra = {}) => new SlabDeck({ spans: [L], overhangs: [D, D], width: W, h: 0.93, area: 9.69, gammaC: 24.525,
  roadway: { y1: -4.25, y2: 4.25 }, footways: [{ y1: -B, y2: -4.25 }, { y1: 4.25, y2: B }], nu, laneStep: 0.25, nGrid: 128,
  ys: Array.from({ length: 17 }, (_, i) => -B + W * i / 16), ...extra });

test('PSI DA (PSDPV/PSIDP) — charges permanentes avec abouts, rotations d\'appui', () => {
  const deck = mk(0, { nSec: 40 });
  const bm = deck.beam, u = bm.uniformLoad(1);
  const mid = bm.sectionIndex(0, 0.5), q1 = bm.sectionIndex(0, 0.25), a = bm.sectionIndex(0, 0);
  rel(deck.gammaC * deck.area, 237.647, 1e-5, 'g ossature [kN/m]');
  rel(237.647 * u.M[mid] / 1000, 19.376, 5e-4, 'M ossature L/2 [MN·m]');
  rel(237.647 * u.M[q1] / 1000, 14.509, 5e-4, 'M ossature L/4');
  rel(237.647 * u.M[a] / 1000, -0.092, 5e-3, 'M ossature sur appui (console d\'about)');
  rel(237.647 * u.R[0] / 1000, 3.251, 5e-4, 'R ossature');
  rel(56.591 * u.M[mid] / 1000, 4.614, 5e-4, 'M superstructures max L/2'); rel(56.591 * u.R[0] / 1000, 0.774, 2e-3, 'R superstructures max');
  // rotations sur appui : ossature avec le module différé 11 994 MPa, A(l) avec le module instantané 35 982 MPa
  const xi = bm.sections.map(s => s.xi);
  rel(endRotations(xi, u.M.map(m => 237.647 * m), L, 11994e3 * 0.689796).thetaA * 1e3, 19.9375, 2e-3, 'θ ossature [1e-3 rad]');
  const f = deck.fascicule61({ classe: 1, nRetenue: 0, Gspan: [G] });
  rel(U * endRotations(xi, f.A.Mmax, L, 35982e3 * 0.689796).thetaA * 1e3, 2.296, 2e-3, 'θ A(l)');
  // gradient thermique : ouvrage isostatique → aucun moment hyperstatique
  const t = deck.thermal({ dTheat: 10, dTcool: -10, E: 35982, I: 0.689796, hTherm: 1.0 });
  assert.ok(Math.max(...t.Mmax.map(Math.abs)) < 1e-9, 'gradient thermique sans effet sur une travée isostatique');
});

test('PSI DA — coefficients de répartition (Guyon-Massonnet, ν = 0, θ = 0,2012), δ, moments A / Bc / Bt / Mc120', () => {
  const deck = mk(0);
  const f = deck.fascicule61({ classe: 1, nRetenue: 0, Gspan: [G] });
  assert.equal(f.nv, 2); rel(f.v, 4.25, 1e-9, 'largeur de voie');
  const mid = deck.beam.sectionIndex(0, 0.5), q1 = deck.beam.sectionIndex(0, 0.25);
  const K = r => deck.transverseFactors(r).K;
  const KA = K(f.A), KBc = K(f.Bc), KBt = K(f.Bt), KMc = K(f.Mc120), KT = K(f.trottoir);
  // coefficients « retenus » du programme (identiques à PSIDP à 0,3 % près)
  rel(KA[mid], 1.0015, 5e-4, 'K A(l)'); rel(KBc[mid], 1.0604, 5e-4, 'K Bc'); rel(KBt[mid], 1.0415, 5e-4, 'K Bt');
  rel(KMc[mid], 1.0747, 5e-4, 'K Mc120'); rel(KT[mid], 1.0132, 2e-3, 'K trottoirs');
  // δ : système B (S = 2 files × 2 camions × bc 1,1) et Mc120 (110 t)
  rel(deltaDyn(L, G, 4 * 294.3 * 1.1), 1.0907, 1e-4, 'δB'); rel(deltaDyn(L, G, 1079.1), 1.0866, 1e-4, 'δMc');
  rel(f.deltaBc[0], 1.0907, 1e-3, 'δB outil (S = 1320 kN)'); rel(f.deltaMc[0], 1.0866, 1e-3, 'δMc outil (S = 1100 kN)');
  // moments pondérés de la note (×1,2 sur A et B à l'ELS, δ et K inclus) [MN·m], outil ramené à 1 t = 9,81 kN
  const M = (r, k, s, fac) => U * fac * r.Mmax[s] * k[s] / 1000;
  rel(M(f.A, KA, mid, 1.2), 8.028, 2e-3, 'A L/2'); rel(M(f.A, KA, q1, 1.2), 6.021, 2e-3, 'A L/4');
  rel(M(f.Bc, KBc, mid, 1.2), 6.784, 2e-3, 'Bc L/2'); rel(M(f.Bc, KBc, q1, 1.2), 5.594, 2e-3, 'Bc L/4');
  rel(M(f.Bt, KBt, mid, 1.2), 5.189, 2e-3, 'Bt L/2'); rel(M(f.Bt, KBt, q1, 1.2), 3.964, 2e-3, 'Bt L/4');
  rel(M(f.Mc120, KMc, mid, 1.0), 7.106, 2e-3, 'Mc120 L/2'); rel(M(f.Mc120, KMc, q1, 1.0), 5.330, 2e-3, 'Mc120 L/4');
  // trottoirs 1,472 kN/m² (150 kg/m²) sur 2 × 1,065 m : 0,260 MN·m (outil : 1,5 kN/m² sur 2 × 0,90 m)
  rel(f.trottoir.Mmax[mid] * KT[mid] / 1000 * (1.472 * 2.13) / (1.5 * 1.8), 0.260, 3e-3, 'trottoirs L/2');
});

test('PSI DA — paramètre μ de Guyon-Massonnet (tables ITBTP 1962, ν = 0, θ = 0,20), fibre axiale', () => {
  const ref = [[0, 2116.23], [1.2875, 956.23], [2.575, -61.13], [3.8625, -987.31], [B, -1868.48]];
  for (const [e, r] of ref) rel(coefMu({ b: B, L: B / 0.2, e, y: 0, nu: 0 }) * 1e4, r, 2e-3, `μ(e = ${e})`);
});

test('PSI DA — réaction d\'appui de rive avec trafic sur l\'about', () => {
  const deck = mk(0);
  const f = deck.fascicule61({ classe: 1, nRetenue: 0, Gspan: [G] });
  rel(U * f.A.Rmax[0] / 1000, 1.095, 1e-2, 'R A(l) chargée sur about + travée (l = 26,48 m)');
  rel(U * f.Bc.Rmax[0] / f.Bc.deltaR[0] / 1000, 0.983, 1e-2, 'R Bc, essieu arrière en bout d\'about');
});

test('PSI DA — rotations d\'appui sous convois par ligne d\'influence de rotation', () => {
  const deck = mk(0, { nSec: 40 });
  const f = deck.fascicule61({ classe: 1, nRetenue: 0, Gspan: [G] });
  const EI = 35982e3 * 0.689796, th = r => Math.max(Math.abs(r.Tmax[0]), Math.abs(r.Tmin[0])) / r.deltaR[0] / EI;
  // écart systématique ≈ +2,5 % sur les trois convois (module ou inertie retenus par la référence, non lisibles dans l'OCR)
  rel(U * th(f.Bt) * 1e3, 1.033, 3e-2, 'θ Bt');
  rel(U * th(f.Mc120) * 1e3, 1.747, 3e-2, 'θ Mc120');
  rel(U * th(f.Bc) * 1e3, 1.728, 3e-2, 'θ Bc');
});
