/**
 * Renfort des tests (campagne de mutation, docs/validation/mutation.md) : efforts de freinage (src/bearings.js)
 * recalculés à la main — EN 1991-2 § 4.4.1 et Fascicule 61 titre II art. 4.4 et 5.2.4.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brakingEC, brakingF61 } from '../src/bearings.js';

const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg} : attendu ${b}, obtenu ${a}`);

test('EN 1991-2 § 4.4.1 : Q_lk = 0,6 α_Q1 (2 Q_1k) + 0,10 α_q1 q_1k w_1 L, borné à [180 α_Q1 ; 900] kN', () => {
  proche(brakingEC({ L: 46 }), 360 + 0.1 * 9 * 3 * 46, 1e-12, 'L = 46 m');                  // 484,2 kN
  proche(brakingEC({ alphaQ1: 0.9, alphaq1: 0.7, L: 46 }), 0.6 * 0.9 * 600 + 0.1 * 0.7 * 9 * 3 * 46, 1e-12, 'α < 1');
  proche(brakingEC({ L: 300 }), 900, 1e-12, 'plafond 900 kN');
  // minorant 180 α_Q1 : atteint seulement avec un Q_1k réduit
  proche(brakingEC({ alphaQ1: 1, Q1k: 100, q1k: 2.5, L: 5 }), 180, 1e-12, 'plancher 180 α_Q1');
  proche(brakingEC({ alphaQ1: 0.8, Q1k: 100, q1k: 2.5, L: 5 }), 144, 1e-12, 'plancher 180 × 0,8');
  proche(brakingEC({ Q1k: 300, q1k: 9, w1: 2.5, L: 40 }), 360 + 0.1 * 9 * 2.5 * 40, 1e-12, 'w_1 = 2,5 m');
});

test('Fascicule 61 : max(300 kN (un camion Bc) ; A·S/(20 + 0,0035 S))', () => {
  proche(brakingF61({ Aq: 10, S: 100 }), 300, 1e-12, 'Bc gouverne');                        // 1000/20,35 = 49 kN
  const S = 46 * 9, Aq = 8;                                                                   // 414 m²
  proche(brakingF61({ Aq: 20, S: 2000 }), 20 * 2000 / (20 + 7), 1e-12, 'A(l) gouverne');      // 1481,5 kN
  proche(brakingF61({ Aq, S }), Math.max(300, Aq * S / (20 + 0.0035 * S)), 1e-12, 'exemple');
});
