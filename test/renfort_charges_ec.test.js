/**
 * Renfort des tests (campagne de mutation, docs/validation/mutation.md) : modèles de charge de l'EN 1991-2
 * (§ 4.2.3, 4.3.2 à 4.3.5, tableau 4.1 et 4.2), coefficients de l'EN 1990 A2 (tableau A2.1) et gradient
 * de l'EN 1991-1-5 (tableaux 6.1 et 6.2), valeurs de la norme.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notionalLanes, lm1, TS_GEOM, lm2, LM4, FOOTWAY, COMBI, gradientEN1991_1_5 } from '../src/loads_ec.js';

const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg} : attendu ${b}, obtenu ${a}`);
const UN = { aQ: [1, 1, 1], aq1: 1, aq2: 1, aqr: 1 };

test('tableau 4.1 : voies conventionnelles', () => {
  assert.deepEqual(notionalLanes(5.39), { n: 1, wl: 3, wr: 5.39 - 3 });
  assert.deepEqual(notionalLanes(5.4), { n: 2, wl: 2.7, wr: 0 });
  assert.deepEqual(notionalLanes(5.99), { n: 2, wl: 5.99 / 2, wr: 0 });
  assert.deepEqual(notionalLanes(6), { n: 2, wl: 3, wr: 0 });
  assert.deepEqual(notionalLanes(10), { n: 3, wl: 3, wr: 1 });
});

test('tableau 4.2 : LM1 (Q_ik 300/200/100 kN, q_ik 9/2,5 kN/m²), coefficients α', () => {
  const r = lm1(4, UN);
  assert.deepEqual(r.lanes.map(l => [l.Qk, l.qk]), [[300, 9], [200, 2.5], [100, 2.5], [0, 2.5]]);
  assert.equal(r.qr, 2.5);
  const a = lm1(4, { aQ: [0.9, 0.8, 0.7], aq1: 0.7, aq2: 1.2, aqr: 1.1 });
  assert.deepEqual(a.lanes.map(l => [+l.Q.toFixed(9), +l.q.toFixed(9)]), [[270, 6.3], [160, 3], [70, 3], [0, 3]]);
  proche(a.qr, 2.75, 1e-12, 'aire résiduelle');
  assert.deepEqual(TS_GEOM, { axleSpacing: 1.2, wheelTrack: 2, contact: { x: 0.4, y: 0.4 } });
});

test('§ 4.3.3 à 4.3.5 : LM2, foule, trottoirs', () => {
  assert.deepEqual(lm2({ aQ: [0.9], betaQ: 0.8 }), { Q: 320, wheelTrack: 2, contact: { x: 0.6, y: 0.35 } });
  assert.equal(lm2({ aQ: [0.9] }).Q, 360);                  // à défaut β_Q = α_Q1
  assert.deepEqual(LM4, { q: 5 }); assert.deepEqual(FOOTWAY, { qfk: 5, qfkCombi: 3 });
});

test('EN 1990 A2 tableau A2.1 : γ et ψ des charges routières', () => {
  assert.deepEqual([COMBI.gammaG, COMBI.gammaGfav, COMBI.gammaQ], [1.35, 1, 1.35]);
  assert.deepEqual(COMBI.psi0, { TS: 0.75, UDL: 0.4, footway: 0.4, gr1b: 0, gr3: 0 });
  assert.deepEqual(COMBI.psi1, { TS: 0.75, UDL: 0.4, footway: 0.4, gr1b: 0.75, gr3: 0 });
  assert.deepEqual(COMBI.psi2, { TS: 0, UDL: 0, footway: 0, gr1b: 0, gr3: 0 });
});

test('EN 1991-1-5 : gradient linéaire 15 / 8 °C × k_sur (tableau 6.2, interpolation)', () => {
  const k = t => gradientEN1991_1_5(t);
  assert.deepEqual([k(0).heat, k(0).cool], [12, -8.8]);           // 0,8 / 1,1
  assert.deepEqual([k(0.05).heat, k(0.05).cool], [15, -8]);
  assert.deepEqual([k(0.1).heat, k(0.1).cool], [10.5, -8]);
  assert.deepEqual([k(0.15).heat, k(0.15).cool], [7.5, -8]);
  const d = k();                                                   // 80 mm par défaut : k = 1,0 + 0,6 × (0,7 − 1,0) = 0,82
  proche(d.kHeat, 0.82, 1e-12, 'k_sur 80 mm'); assert.equal(d.heat, 12.3); assert.equal(d.t, 0.08);
  proche(k(0.025).kHeat, 0.9, 1e-12, '25 mm'); proche(k(0.025).kCool, 1.05, 1e-12, '25 mm refroidissement');
  proche(k(0.125).kHeat, 0.6, 1e-12, '125 mm');
  assert.equal(k(0.3).t, 0.15); assert.equal(k(-1).t, 0); assert.equal(k(NaN).t, 0.08);
});
