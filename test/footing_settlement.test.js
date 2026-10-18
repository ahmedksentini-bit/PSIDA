import test from 'node:test';
import assert from 'node:assert/strict';
import { footingSettlement } from '../src/supports/foundation.js';

// Calcul à la main (F62 V annexe F.2) : B = 4 m, L = 13 m, D = 1 m, sol homogène E_M = 8 MPa (α = 2/3 sable-limon)
test('tassement de Ménard d\'une semelle : calcul à la main', () => {
  const profile = { at: () => ({ EM: 8, alpha: 0.67, classe: 'sable-B' }), ruptures: [] };
  const t = footingSettlement({ profile, B: 4, L: 13, D: 1, Vqp: 90 * 52, gamma: 20, code: 'BAEL' });
  assert.ok(Math.abs(t.q - 90) < 1e-9);
  assert.equal(t.dq, 70);
  // λc (L/B = 3,25) = 1,30 + 0,25/2 × 0,10 = 1,3125 ; λd = 1,78 + 0,125 × 0,36 = 1,825
  assert.ok(Math.abs(t.lc - 1.3125) < 1e-9 && Math.abs(t.ld - 1.825) < 1e-9);
  // E_d (F62) homogène : 4/E_d = (1 + 1/0,85 + 1 + 2/2,5)/8 → E_d = 32/3,97647 = 8,0473 MPa
  assert.ok(Math.abs(t.Ed - 32 / (1 + 1 / 0.85 + 1 + 0.8)) < 1e-9);
  const sc = 0.67 * 70 * 1.3125 * 4 / (9 * 8000) * 1000, sd = 2 * 70 * 0.6 * (1.825 * 4 / 0.6) ** 0.67 / (9 * t.Ed * 1000) * 1000;
  assert.ok(Math.abs(t.sc - sc) < 1e-9 && Math.abs(t.sd - sd) < 1e-9);
  assert.ok(Math.abs(t.s - 3.42 - 6.18) < 0.05, `s = ${t.s}`);
});
