/** Independent analytical checks for the bridge-beam module.
 * These are elementary reference solutions, not proof of full Guyon-Massonnet validity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beamSection, guyonParams, kTorsion } from '../src/beams/index.js';
import { ContinuousBeam } from '../src/beam.js';

const close = (actual, expected, rtol = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= rtol * Math.max(1, Math.abs(expected)),
    `expected ${expected}, received ${actual}`);

test('Reference beam: 20 m simply supported, 100 kN at midspan', () => {
  const L = 20, P = 100;
  const bm = new ContinuousBeam([L], { nGrid: 100, nSec: 20 });
  // Exact analytical targets, independent of PSIDA:
  const R = P / 2, M = P * L / 4;
  close(R, 50); close(M, 500);
  // Compare PSIDA point-load response through influence lines;
  // support reactions and bending moment at x = L/2.
  const mid = bm.sectionIndex(0, 0.5);
  const x = L / 2;
  const interpolate = (xs, values, q) => {
    const j = xs.findIndex(v => v >= q);
    if (j === 0) return values[0];
    if (j < 0) return values.at(-1);
    const t = (q - xs[j-1]) / (xs[j] - xs[j-1]);
    return values[j-1] * (1-t) + values[j] * t;
  };
  // For uniform grid, integrateIL is not used: evaluate ordinate at the load.
  close(P * interpolate(bm.grid, bm.ILM[mid], x), M, 1e-5);
  close(P * interpolate(bm.grid, bm.ILR[0], x), R, 1e-5);
  close(P * interpolate(bm.grid, bm.ILR[1], x), R, 1e-5);
});

test('Rectangular beam section: exact area, centroid, second moment', () => {
  const b = 0.4, h = 1.2;
  const s = beamSection({ parts: [{ b, h }] });
  close(s.A, b*h);
  close(s.I, b*h**3/12);
  close(s.v, h/2);
  close(s.vp, h/2);
  close(s.K, kTorsion(b,h));
});

test('Guyon parameters: dimensional scaling and symmetry', () => {
  const p = { n: 10, b1: 1, L: 20, Ip: 0.02999, Kp: 0.006737, hd: 0.2 };
  const a = guyonParams(p);
  close(a.b, 5);
  close(a.theta, (5/20) * ((p.Ip/p.b1)/(p.hd**3/12))**0.25);
  assert.ok(a.alpha > 0 && Number.isFinite(a.alpha));
  // Scaling all section inertias together leaves dimensionless parameters unchanged.
  const c = 3;
  const scaled = guyonParams({ ...p, Ip: p.Ip*c, Kp: p.Kp*c,
    Ie: (p.hd**3/12)*c, Ke: (p.hd**3/6)*c });
  close(scaled.theta, a.theta);
  close(scaled.alpha, a.alpha);
});
