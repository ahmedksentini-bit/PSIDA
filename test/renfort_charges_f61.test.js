/**
 * Renfort des tests (campagne de mutation, docs/validation/mutation.md) : valeurs réglementaires du Fascicule 61
 * titre II (art. 2, 4, 5, 6, 9, 10) et coefficients BAEL 91 (A.3.3), recalculées à la main.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiesF61, A1, V0, chargeA, BC, BT, BR, deltaDyn, maxAxleLoadOnLength, MC120, maxStripTrainLoad, D240, TROTTOIR, COMBI_BAEL } from '../src/loads_f61.js';

const proche = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : attendu ${b}, obtenu ${a}`);

test('art. 2 : nombre et largeur des voies', () => {
  assert.deepEqual(voiesF61(9), { nv: 3, v: 3 });
  assert.deepEqual(voiesF61(5.5), { nv: 2, v: 2.75 });          // 5 ≤ Lc < 6 : deux voies
  assert.deepEqual(voiesF61(6), { nv: 2, v: 3 });
  assert.deepEqual(voiesF61(4.9), { nv: 1, v: 4.9 });
  assert.deepEqual(voiesF61(12.5), { nv: 4, v: 3.125 });
});

test('art. 4.2 : a1 (voies chargées réglementaires) et v0', () => {
  assert.deepEqual(A1[1], [1, 1, 0.9, 0.75, 0.7]);
  assert.deepEqual(A1[2].slice(0, 2), [1, 0.9]);
  assert.deepEqual(A1[3].slice(0, 2), [0.9, 0.8]);
  assert.deepEqual(V0, { 1: 3.5, 2: 3, 3: 2.75 });
});

test('art. 4 : A(l) = 2,3 + 360/(l + 12), a1, a2 et minimum 4 − 0,002 l', () => {
  let r = chargeA(20);                                            // classe 1, une voie, v = v0
  proche(r.A, 13.55, 1e-12, 'A(20)'); assert.equal(r.a1, 1); assert.equal(r.a2, 1); proche(r.q, 13.55, 1e-12, 'q');
  r = chargeA(20, { classe: 2, nVoiesChargees: 2, v: 3.5 });       // a1 = 0,9, a2 = 3,0/3,5
  proche(r.q, 0.9 * 13.55 * 3 / 3.5, 1e-12, 'q classe 2');
  r = chargeA(300, { classe: 1, nVoiesChargees: 5, v: 3 });        // 0,7 A(300) = 2,418 < 4 − 0,6 = 3,4 : minimum
  proche(r.A, 2.3 + 360 / 312, 1e-12, 'A(300)'); proche(r.q, 3.4 * 3.5 / 3, 1e-12, 'q minimum');
  r = chargeA(30, { classe: 3, nVoiesChargees: 1, v: 2.5 });
  proche(r.q, 0.9 * (2.3 + 360 / 42) * 2.75 / 2.5, 1e-12, 'q classe 3');
});

test('art. 5 : systèmes Bc, Bt, Br (géométrie, impacts, coefficients bc et bt)', () => {
  assert.deepEqual(BC.axlesOneTruck, [{ d: 0, P: 60 }, { d: 4.5, P: 120 }, { d: 6, P: 120 }]);
  assert.equal(BC.wheelTrack, 2); assert.equal(BC.width, 2.5);
  assert.deepEqual(BC.contactRear, { x: 0.25, y: 0.25 }); assert.deepEqual(BC.contactFront, { x: 0.2, y: 0.2 });
  assert.deepEqual(BC.bc[1], [1.2, 1.1, 0.95, 0.8, 0.7]);
  assert.deepEqual(BC.bc[2].slice(0, 2), [1, 1]); assert.deepEqual(BC.bc[3].slice(0, 2), [1, 0.8]);
  assert.deepEqual(BT.axles, [{ d: 0, P: 160 }, { d: 1.35, P: 160 }]);
  assert.equal(BT.wheelTrack, 2); assert.equal(BT.width, 3); assert.deepEqual(BT.contact, { x: 0.25, y: 0.6 });
  assert.equal(BT.bt[1], 1); assert.equal(BT.bt[2], 0.9);
  assert.deepEqual(BR, { P: 100, contact: { x: 0.3, y: 0.6 } });
});

test('art. 5.5 : δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4 G/S) et S par fenêtre glissante', () => {
  proche(deltaDyn(14, 3000, 600), 1 + 0.4 / 3.8 + 0.6 / 21, 1e-12, 'δ');
  const ax = BC.axlesTwoTrucks;                                   // 60-120-120 | 60-120-120, essieux à 0 ; 4,5 ; 6 ; 10,5 ; 15 ; 16,5
  assert.equal(maxAxleLoadOnLength(ax, 1.5), 240);
  assert.equal(maxAxleLoadOnLength(ax, 6), 300);
  assert.equal(maxAxleLoadOnLength(ax, 4.4), 240);
  assert.equal(maxAxleLoadOnLength(ax, 10.5), 420);               // 4,5 → 15 : 120 + 120 + 60 + 120
  assert.equal(maxAxleLoadOnLength(ax, 16.5), 600);
  assert.equal(maxAxleLoadOnLength(BT.axles, 1.34), 160);
  assert.equal(maxAxleLoadOnLength(BT.axles, 1.35), 320);
});

test('art. 9 et 10 : Mc120, D240, convoi de chenilles sur une longueur L', () => {
  assert.deepEqual([MC120.P, MC120.trackLength, MC120.trackWidth, MC120.trackSpacing, MC120.gapMin], [1100, 6.1, 1, 3.3, 30.5]);
  proche(MC120.qTrack, 550 / 6.1, 1e-12, 'q chenille');
  assert.deepEqual([D240.P, D240.length, D240.width], [2400, 18.6, 3.2]); proche(D240.q, 2400 / 18.6, 1e-12, 'q D240');
  const pas = MC120.trackLength + MC120.gapMin;                     // 36,60 m entre têtes d'engins
  proche(maxStripTrainLoad(3, 6.1, pas, 1100), 1100 * 3 / 6.1, 1e-9, 'L < 6,10 m');
  proche(maxStripTrainLoad(20, 6.1, pas, 1100), 1100, 1e-9, '6,10 ≤ L ≤ 36,60 m');
  // L = 40 m : un engin entier + 40 − 6,10 − 30,50 = 3,40 m du suivant
  proche(maxStripTrainLoad(40, 6.1, pas, 1100), 1100 + 1100 * 3.4 / 6.1, 1e-9, 'L = 40 m');
  // L = 80 m : engins sur [0 ; 6,1], [36,6 ; 42,7] et [73,2 ; 79,3] : les trois tiennent entiers
  proche(maxStripTrainLoad(80, 6.1, pas, 1100), 3300, 1e-9, 'L = 80 m');
  // les trois engins occupent 79,30 m : une fenêtre de 70 m n'en couvre que deux entiers ; de 75 m, deux + 1,80 m du premier
  proche(maxStripTrainLoad(70, 6.1, pas, 1100), 2200, 1e-9, 'L = 70 m');
  proche(maxStripTrainLoad(75, 6.1, pas, 1100), 2200 + 1100 * 1.8 / 6.1, 1e-9, 'L = 75 m');
});

test('art. 6 et BAEL A.3.3 : trottoirs et coefficients de pondération', () => {
  assert.deepEqual(TROTTOIR, { q: 1.5, qLocal: 4.5 });
  assert.deepEqual(COMBI_BAEL.ELU, { G: 1.35, Gfav: 1, A: 1.6, B: 1.6, Mc: 1.35, D: 1.35, trottoir: 1.6 });
  assert.deepEqual(COMBI_BAEL.ELS, { G: 1, A: 1.2, B: 1.2, Mc: 1, D: 1, trottoir: 1 });
});
