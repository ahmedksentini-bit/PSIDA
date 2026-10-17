import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { notionalLanes, lm1, EC_ALPHA } from '../src/loads_ec.js';
import { classePont, voiesF61, chargeA, deltaDyn } from '../src/loads_f61.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} attendu ${b}, obtenu ${a}`);

test('voies conventionnelles EN 1991-2 tableau 4.1', () => {
  assert.deepEqual(notionalLanes(5), { n: 1, wl: 3, wr: 2 });
  assert.deepEqual(notionalLanes(5.7), { n: 2, wl: 2.85, wr: 0 });
  assert.deepEqual(notionalLanes(10), { n: 3, wl: 3, wr: 1 });
  const m = lm1(4, EC_ALPHA.FR2);
  close(m.lanes[0].Q, 270, 1e-9); close(m.lanes[0].q, 6.3, 1e-9); close(m.lanes[3].Q, 0, 1e-9); close(m.lanes[3].q, 2.5, 1e-9);
});

test('Fascicule 61 : classe, voies, A(l), δ', () => {
  assert.equal(classePont(7), 1); assert.equal(classePont(6), 2); assert.equal(classePont(5.5), 3);
  assert.deepEqual(voiesF61(9), { nv: 3, v: 3 });
  assert.deepEqual(voiesF61(5.5), { nv: 2, v: 2.75 });
  const a = chargeA(20, { classe: 1, nVoiesChargees: 2, v: 3.5 });
  close(a.A, 2.3 + 360 / 32, 1e-9, 'A(20)'); close(a.a1, 1, 1e-9); close(a.a2, 1, 1e-9);
  close(a.q, 2.3 + 360 / 32, 1e-9, 'q');
  // minimum a1·A(l) ≥ 4 − 0,002 l : avec a1 = 0,7 (5 voies) et l = 150 m, 0,7·A = 3,17 < 3,70 ⇒ plancher
  const big = chargeA(150, { classe: 1, nVoiesChargees: 5, v: 3.5 });
  close(big.q, 4 - 0.3, 1e-9, 'plancher');
  close(deltaDyn(14, 269 * 14, 1710), 1 + 0.4 / 3.8 + 0.6 / (1 + 4 * 269 * 14 / 1710), 1e-12);
});

test('SlabDeck : cohérence globale (moyenne de m_x sur la largeur = M/2b ; symétrie ; ordres de grandeur)', () => {
  const deck = new SlabDeck({
    spans: [14, 18, 14], width: 12, h: 0.7, roadway: { y1: -5, y2: 5 },
    footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }],
    lines: [{ g: 5, e: -5.9 }, { g: 5, e: 5.9 }], bands: [{ q: 2.6, y1: -5, y2: 5 }],
    ys: Array.from({ length: 25 }, (_, i) => -6 + 12 * i / 24), nGrid: 60, nSec: 10,
  });
  const perm = deck.permanent();
  close(perm.gTotal, 25 * 0.7 * 12 + 10 + 26, 1e-9, 'g');
  const s = deck.keySections()[1].idx; // appui P1
  // moyenne de m_x(y) sur la largeur (trapèzes) = M/2b
  const mean = perm.mx[s].reduce((acc, v, i, arr) => acc + (i === 0 || i === arr.length - 1 ? v / 2 : v), 0) / (arr => arr.length - 1)(perm.mx[s]);
  close(mean, perm.M[s] / 12, Math.abs(perm.M[s] / 12) * 0.01, 'moyenne m_x permanent');
  // symétrie transversale
  perm.mx[s].forEach((v, i) => close(v, perm.mx[s][24 - i], 1e-6, 'symétrie'));
  const ec = deck.eurocode();
  assert.equal(ec.lanes.n, 3);
  assert.ok(ec.TS.Mmax[deck.keySections()[0].idx] > 2500 && ec.TS.Mmax[deck.keySections()[0].idx] < 3500, 'TS travée 1');
  assert.ok(ec.gr1a.Mmin[s] < -3000 && ec.gr1a.Mmin[s] > -3800, 'gr1a appui');
  ec.gr1a.mxMax[s].forEach((v, i) => close(v, ec.gr1a.mxMax[s][24 - i], 1e-6, 'symétrie gr1a'));
  const f61 = deck.fascicule61({ nRetenue: 2 });
  assert.equal(f61.classe, 1); assert.equal(f61.nv, 3);
  assert.ok(f61.A.Mmax[deck.keySections()[0].idx] > 2000, 'A(l)');
  assert.ok(f61.Bc.delta.every(d => d > 1 && d < 1.3), 'δ Bc');
  assert.ok(f61.Mc120.Mmax[deck.keySections()[0].idx] > 2000, 'Mc120');
});
