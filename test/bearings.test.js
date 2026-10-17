/**
 * Appareils d'appui en élastomère fretté — règles du guide SETRA 1989 § 3.6 (BT4) et gamme standard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_BEARINGS, checkBearing, selectBearing, brakingEC, endRotations, designation, totalHeight } from '../src/bearings.js';
import { ContinuousBeam } from '../src/beam.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : attendu ${b}, obtenu ${a}`);

test('gamme standard : désignation, hauteur, et vérifications du § 3.6.1', () => {
  const bd = STANDARD_BEARINGS.find(x => x.a === 200 && x.b === 300);
  assert.equal(designation(bd, 3), '200×300×3(8+2)'); assert.equal(totalHeight(bd, 3), 28);
  // exemple du guide : 200×300×3(8+2) → T = 24 mm ; σ = 600 kN / 0,06 m² = 10 MPa ≤ min(15 ; 0,8·0,06/(0,008·0,5) = 12)
  const r = checkBearing(bd, 3, { Pmax: 600, Pmin: 150, H: 20, ug: 0.010, alpha: 0.004 });
  rel(r.sig, 10, 1e-9, 'σ'); rel(r.sigLim, 12, 1e-9, 'σ_lim = G ab/(t(a+b))'); rel(r.T, 0.024, 1e-9, 'T = n t');
  rel(r.dist1, 0.01 / 0.024, 1e-9, 'u_g/T'); rel(r.dist2, 0.01 / 0.024 + 20 / (1.6 * 1000 * 0.06), 1e-9, 'distorsion totale');
  rel(r.Tmax, 0.04, 1e-9, 'T ≤ a/5'); rel(r.rotLim, 3 * 0.008 * 0.024 / 0.04, 1e-9, 'α ≤ 3 t T / a²');
  assert.ok(r.ok, 'vérifié');
  assert.ok(!checkBearing(bd, 3, { Pmax: 1000, Pmin: 150, H: 20, ug: 0.010, alpha: 0.004 }).checks.compression, 'σ = 16,7 MPa > 15');
  assert.ok(!checkBearing(bd, 3, { Pmax: 600, Pmin: 150, H: 20, ug: 0.015, alpha: 0.004 }).checks.distorsionVide, 'u_g/T = 0,62 > 0,5');
  assert.ok(!checkBearing(bd, 3, { Pmax: 600, Pmin: 150, H: 20, ug: 0.010, alpha: 0.02 }).checks.rotation, 'rotation excessive');
  const low = checkBearing(bd, 3, { Pmax: 600, Pmin: 60, H: 20, ug: 0.010, alpha: 0.004 });
  assert.ok(low.antiCheminement, 'σ_min = 1 MPa < 2 → anti-cheminement');
  rel(low.f, 0.10 + 0.6 / 1, 1e-9, 'f = 0,10 + 0,6/σ');
});

test('sélection du plus petit appareil standard et freinage EN 1991-2', () => {
  const s = selectBearing({ Pmax: 1528, Pmin: 676, H: 21, ug: 0.0083, alpha: 0.0058 });
  assert.equal(s.label, '300×400×3(10+3)', 'exemple CHAMOA, pile P1 : 300×400×3(10+3)');
  assert.equal(selectBearing({ Pmax: 20000, Pmin: 5000, H: 50, ug: 0.02, alpha: 0.005 }), null, 'hors gamme');
  rel(brakingEC({ L: 50 }), 0.6 * 600 + 0.1 * 9 * 3 * 50, 1e-9, 'Q_lk = 360 + 135');
  assert.equal(brakingEC({ L: 1000 }), 900, 'plafond 900 kN'); rel(brakingEC({ alphaQ1: 0.9, alphaq1: 0.7, L: 50 }), 0.6 * 0.9 * 600 + 0.1 * 0.7 * 9 * 3 * 50, 1e-9, 'classe 2 : 418,5 kN');
});

test('rotation d\'appui par la poutre conjuguée : qL³/(24 EI) pour une travée isostatique', () => {
  const L = 12, q = 100, EI = 2e6;
  const bm = new ContinuousBeam([L], { nGrid: 100, nSec: 20 });
  const { M } = bm.uniformLoad(q);
  const r = endRotations(bm.sections.map(s => s.xi), M, L, EI);
  rel(r.thetaA, q * L ** 3 / (24 * EI), 5e-3, 'θ_A (trapèzes, 20 intervalles)'); rel(r.thetaB, q * L ** 3 / (24 * EI), 5e-3, 'θ_B');
});
