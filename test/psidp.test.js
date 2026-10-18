/**
 * Module PSI-DP (précontrainte longitudinale) — calage sur la note modèle SETRA PSIDP-EL 84-1 (dossier pilote PSI-DP) :
 * 13,50 – 17,61 – 17,61 – 13,50 m, 18 câbles 12T13 tendus aux deux extrémités, σ_p0 = 151 000 t/m², unités de la note
 * (t, m, t/m²). Valeurs de référence : ref/reports/psidp_spec.md § 6 (page NP de la note entre parenthèses).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prestress } from '../src/psidp/prestress.js';
import { ContinuousBeam } from '../src/beam.js';

export const SPANS = [13.5, 17.61, 17.61, 13.5];
const P = (A, B, C, x1) => ({ A, B, C, x1 });
export const SEGS = [
  [P(0.003698, -0.040182, 0, 5.4), P(0.005784, -0.062708, 0.060818, 11.126), P(-0.013896, 0.375184, -2.375077, 13.5)],
  [P(-0.019766, 0, 0.157419, 1.766), P(0.004727, -0.086519, 0.233824, 8.805), P(0.005558, -0.101160, 0.298284, 15.852), P(-0.021352, 0.752021, -6.464108, 17.61)],
  [P(-0.021350, 0, 0.157419, 1.758), P(0.005558, -0.094605, 0.240570, 8.805), P(0.004727, -0.079964, 0.176116, 15.844), P(-0.019770, 0.696308, -5.973562, 17.61)],
  [P(-0.013896, 0, 0.157419, 2.374), P(0.005784, -0.093456, 0.268370, 8.1), P(0.003698, -0.059668, 0.131528, 13.5)],
];
const bm = new ContinuousBeam(SPANS, { nGrid: 200 });
const u = bm.uniformLoad(17.075), xsG = bm.sections.map(s => s.x);
const MGmean = x => { let k = 0; while (k < xsG.length - 2 && xsG[k + 1] < x) k++; const t = (x - xsG[k]) / (xsG[k + 1] - xsG[k] || 1); return u.M[k] + t * (u.M[k + 1] - u.M[k]); };
export const INPUT = {
  spans: SPANS, sec: { B: 5.43, I: 0.136392, v: 0.273, vp: 0.277 },
  cable: { n: 18, Ap: 1116e-6, phiG: 0.07, segs: SEGS, sigma0: 151000, f: 0.18, phi: 0.002, g: 0.006, Ep: 19.4e6, rho1000: 2.5, mu0: 0.43, fprg: 189000, ends: 'both', friction: 'dixiemes' },
  mat: { Eij: 3128069, Ei28: 3216226, epsR: 2e-4, Kfl: 2, rj: 0.5 },
  MGmean,
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} : note ${b}, outil ${a.toFixed(3)}`);
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : note ${b}, outil ${a.toFixed(3)} (${(100 * (a - b) / b).toFixed(2)} %)`);

test('PSI-DP — section nette, frottement, recul d\'ancrage, raccourcissement, tensions initiales (NP 27-29)', () => {
  const r = prestress(INPUT);
  rel(r.nAp, 0.020088, 1e-6, 'n A_p'); rel(r.Bn, 5.3607, 1e-4, 'B_n');
  const x04 = r.xOf(0, 0.4), x10 = r.xOf(0, 1);
  rel(r.at(r.friction.s, x04), 148308, 2e-4, 'σ_p0(x) 0,4 L'); rel(r.at(r.friction.s, x10), 142691, 2e-4, 'σ_p0(x) 1,0 L');
  rel(r.recoil.left.d, 13.171, 2e-3, 'longueur d\'influence du recul');
  near(r.at(r.recoil.loss, 0), 15959, 20, 'perte au blocage x = 0'); near(r.at(r.recoil.loss, x04), 10575, 20, 'perte au blocage 0,4 L');
  rel(r.shortening.dSc, 2218, 0.015, 'raccourcissement élastique');
  for (const [x, dsi, spi] of [[0, 18176, 132824], [x04, 15485, 135515], [x10, 10527, 140473]]) { near(r.at(r.dSi, x), dsi, 60, `Δσ_i x = ${x.toFixed(2)}`); near(r.at(r.spi, x), spi, 60, `σ_pi x = ${x.toFixed(2)}`); }
  near(r.at(r.MT.max.sig, x04), 141632, 60, 'σ_pi max 0,4 L'); near(r.at(r.MT.min.sig, x04), 129398, 80, 'σ_pi min 0,4 L');
  for (const [x, v] of [[0, 5435], [x04, 5834], [x10, 6600]]) near(r.at(r.delayed.dRho, x), v, 25, `relaxation x = ${x.toFixed(2)}`);
  near(r.delayed.dR, 3880, 0.5, 'retrait');
});

test('PSI-DP — pertes différées réajustées, tensions et forces M.S / E.S (NP 33-34)', () => {
  const r = prestress(INPUT);
  const x0 = 0, x04 = r.xOf(0, 0.4), x09 = r.xOf(0, 0.9), x10 = r.xOf(0, 1), x25 = r.xOf(1, 0.5);
  for (const [x, v] of [[x0, 5358], [x04, 5978], [x09, 6892], [x10, 5543], [x25, 6782]]) rel(r.at(r.delayed.dFl, x), v, 0.025, `fluage réajusté x = ${x.toFixed(2)}`);
  for (const [x, v] of [[x0, 13916], [x04, 14844], [x10, 15138]]) rel(r.at(r.delayed.dSd, x), v, 0.012, `Δσ_d E.S x = ${x.toFixed(2)}`);
  rel(r.at(r.ES.moy.sig, x04), 120672, 2e-3, 'σ_p E.S moyen 0,4 L'); rel(r.at(r.ES.min.sig, x04), 111586, 3e-3, 'σ_p E.S P2 0,4 L');
  rel(r.at(r.MS.moy.sig, x04), 128094, 2e-3, 'σ_p M.S moyen 0,4 L'); rel(r.at(r.MS.max.sig, x04), 135695, 2e-3, 'σ_p M.S P1 0,4 L');
  rel(r.at(r.MT.moy.F, x04), 2722, 3e-3, 'F initiale moyenne 0,4 L'); rel(r.at(r.MT.max.F, x04), 2845, 3e-3, 'F initiale max 0,4 L');
  rel(r.at(r.ES.min.F, x10), 2354, 4e-3, 'F E.S min appui 2'); rel(r.at(r.ES.min.F, x25), 2205, 5e-3, 'F E.S min 0,5 L travée 2');
});

test('PSI-DP — moments, tranchants et réactions hyperstatiques (NP 31-34, 51)', () => {
  const r = prestress(INPUT);
  for (const [ph, kk, a2, a3] of [['MT', 'moy', 12.3, 141.7], ['MT', 'max', 14.4, 146.8], ['MS', 'moy', 11.8, 133.6], ['MS', 'max', 14.1, 140.3], ['ES', 'moy', 11.3, 125.5], ['ES', 'min', 9.0, 117.2]]) {
    const X = r[ph][kk].hyp.X; near(X[1], a2, 1.2, `M_hyp appui 2 ${ph} ${kk}`); near(X[2], a3, 2.0, `M_hyp appui 3 ${ph} ${kk}`); near(X[3], X[1], 0.2, 'symétrie');
  }
  const h = r.ES.min.hyp; near(h.V[0], 0.7, 0.15, 'V_hyp travée 1 E.S'); near(h.V[1], 6.2, 0.2, 'V_hyp travée 2 E.S');
  near(h.R[0], 0.7, 0.15, 'R_hyp appui 1'); near(h.R[1], 5.5, 0.3, 'R_hyp appui 2'); near(h.R[2], -12.4, 0.4, 'R_hyp appui 3');
});
