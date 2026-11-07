/** v0.99.28 : vue 3D du grillage des ponts à poutres — résolution complète, équilibre, scène. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { grillageTravee, casGrillage, GRANDEURS_GRILLAGE } from '../src/beams/grillage3d.js';
import { grillagePoutres } from '../src/beams/grillage.js';
import { sceneGrillage } from '../web/vue3d_poutres.js';

const VREF = { pt_geo: 'dims', pt_spans: '33', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56', pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '1.79 sur -6.56,6.56', pt_type: 'BP', pt_fck: '40' };
const r = computePoutres(parsePoutres({ ...formDefaults(), ...VREF }));

test('Grillage complet : Σ réactions = charge, Σ M de mi-travée = moment isostatique, flèche E I', () => {
  const T = grillageTravee(r, 33), g = T.g;
  for (const cas of ['G', 'TS', 'UDL']) {
    const R = casGrillage(T, { cas, y: -2.5 });
    assert.ok(Math.abs(R.R.reduce((t, a) => t + a.R, 0) - R.total) < 1e-6 * R.total, cas);
  }
  // charge uniforme sur chaque poutre (nœuds intérieurs) : Σ M(L/2) = statique, symétrie
  const F = g.vecteur(); for (let i = 1; i < g.m; i++) for (let k = 0; k < g.n; k++) g.chargePoint(F, g.xs[i], g.ys[k], g.dx);
  const R = g.resultats(F), im = g.m / 2, M = Array.from({ length: g.n }, (_, k) => R.M[im * g.n + k]);
  let st = 0; for (let i = 1; i < g.m; i++) st += g.n * g.dx * Math.min(g.xs[i], 33 - g.xs[i]) / 2;
  assert.ok(Math.abs(M.reduce((t, v) => t + v, 0) - st) < 1e-6 * st);
  assert.ok(Math.abs(M[0] - M[3]) < 1e-6 * M[0]);
  // poutres indépendantes (hourdis et torsion négligeables) : flèche 5 q L⁴/384 E I à la discrétisation près
  const g1 = grillagePoutres({ n: 2, b1: 3, L: 20, Ip: 0.5, Kp: 1e-9, hd: 1e-3, m: 40, E: 3e7 }), F1 = g1.vecteur();
  for (let i = 1; i < g1.m; i++) for (let k = 0; k < 2; k++) g1.chargePoint(F1, g1.xs[i], g1.ys[k], 10 * g1.dx);
  const w = g1.resultats(F1).w[20 * 2], w0 = 5 * 10 * 20 ** 4 / (384 * 3e7 * 0.5);
  assert.ok(Math.abs(w - w0) < 0.01 * w0, `${w} / ${w0}`);
});

test('Scène 3D du grillage : surfaces, âmes, entretoises, couleurs bornées ; tablier continu refusé', () => {
  const T = grillageTravee(r, 33), res = casGrillage(T, { cas: 'TS', x: 16.5, y: -2.5 });
  for (const gr of Object.keys(GRANDEURS_GRILLAGE)) {
    const S = sceneGrillage(T, res, { grandeur: gr });
    const nq = T.g.m * (T.g.n + 1) + T.g.n * T.g.m + 2 * (T.g.n - 1);   // hourdis + âmes + entretoises d'about
    assert.equal(S.nt, 2 * nq);
    assert.ok(S.cols.every(c => c >= 0 && c <= 1) && S.tri.every(Number.isFinite));
    assert.equal(S.n, (T.g.m + 1) * T.g.n); assert.equal(S.roues.length, 4);
  }
  const c = computePoutres(parsePoutres({ ...formDefaults(), ...VREF, pt_spans: '33, 33', pt_continu: 'on' }));
  if (c.continu) assert.throws(() => grillageTravee(c, 33), /indépendantes/);
});
