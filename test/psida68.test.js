/**
 * Confrontation aux formules du dossier SETRA « PSI-DA 68 – Calcul automatique – Méthode de calcul » (pièce 2.5, 1968-1973).
 * Rapport détaillé : docs/hypotheses.md (ou /home/claude/ref/reports/psida68.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousBeam } from '../src/beam.js';
import { coefK } from '../src/guyon.js';
import { deltaDyn, voiesF61 } from '../src/loads_f61.js';

const sh = Math.sinh, ch = Math.cosh, PI = Math.PI;

test('PSI-DA 68 § 2.2.2.1 (p. 16) : expression fermée de K (Guyon, α = 1) = guyon.js avec ν = 0', () => {
  const K68 = (theta, e, y, b) => {
    const s = PI * theta, psi = PI * e / b, beta = PI * y / b, X = PI - Math.abs(beta - psi);
    const P = u => (s * ch(s) - sh(s)) * ch(theta * u) - theta * u * sh(s) * sh(theta * u);
    const Q = u => (2 * sh(s) + s * ch(s)) * sh(theta * u) - theta * u * sh(s) * ch(theta * u);
    return s / (2 * sh(s) ** 2) * ((s * ch(s) + sh(s)) * ch(theta * X) - theta * X * sh(s) * sh(theta * X)
      + P(psi) * P(beta) / (3 * sh(s) * ch(s) - s) + Q(psi) * Q(beta) / (3 * sh(s) * ch(s) + s));
  };
  for (const th of [0.3, 0.5, 1.0, 1.5]) for (const e of [-1, -0.5, 0, 0.25, 0.75, 1]) for (const y of [-1, -0.5, 0, 0.5, 1]) {
    const a = K68(th, e, y, 1), c = coefK({ b: 1, L: 1 / th, e, y, nu: 0 });
    assert.ok(Math.abs(a - c) <= 1e-9 * Math.abs(c), `θ=${th} e=${e} y=${y} : ${a} / ${c}`);
  }
});

test('PSI-DA 68 § 2.2.2.2 (p. 16) : λ = l·⁴√(1 − 4,8 (M_i,i + M_i,i+1)/l²) = equivalentSpans("fleches")', () => {
  for (const spans of [[9.75, 13.93, 13.93, 9.75], [12, 18, 12], [10, 15, 15, 10]]) {
    const bm = new ContinuousBeam(spans, { nGrid: 200 });
    const Le = bm.equivalentSpans('fleches');
    spans.forEach((l, j) => {
      const Mi = Math.abs(bm.integrateIL(bm.ILM[bm.sectionIndex(j, 0)], bm.x0[j], bm.x0[j + 1]));
      const Mj = Math.abs(bm.integrateIL(bm.ILM[bm.sectionIndex(j, 1)], bm.x0[j], bm.x0[j + 1]));
      const lam = l * Math.pow(1 - 4.8 * (Mi + Mj) / (l * l), 0.25);
      assert.ok(Math.abs(lam - Le[j]) < 1e-9, `travée ${j + 1} : ${lam} / ${Le[j]}`);
    });
  }
});

test('PSI-DA 68 § 2.4.2 (p. 27) : ligne d\'influence de réaction d\'une poutre continue à infinité de travées égales', () => {
  // R(α) = 1 − 2,196 α² + 1,196 α³ ; 2,784 − 5,352 α + 3,156 α² − 0,588 α³ ; −3,168 + 3,576 α − 1,308 α² + 0,156 α³
  const R = a => { const x = Math.abs(a); if (x < 1) return 1 - 2.196 * x ** 2 + 1.196 * x ** 3; if (x < 2) return 2.784 - 5.352 * x + 3.156 * x ** 2 - 0.588 * x ** 3; if (x < 3) return -3.168 + 3.576 * x - 1.308 * x ** 2 + 0.156 * x ** 3; return 0; };
  const bm = new ContinuousBeam(Array(21).fill(1), { nGrid: 200 });
  for (let a = 0; a <= 3.0001; a += 0.1) assert.ok(Math.abs(bm.ilAt(bm.ILR[10], 10 + a) - R(a)) < 1e-3, `α = ${a.toFixed(1)}`);
});

test('PSI-DA 68 § 2.2.1 (p. 14) et § 2.2.3.1 (p. 17) : majoration dynamique et nombre de voies', () => {
  const P = 1200, S = 132, L = 13.93;
  assert.ok(Math.abs(deltaDyn(L, P, S) - (1 + 0.4 / (1 + 0.2 * L) + 0.6 / (1 + 4 * P / S))) < 1e-12);
  assert.deepEqual(voiesF61(4.9), { nv: 1, v: 4.9 });
  assert.deepEqual(voiesF61(5.5), { nv: 2, v: 2.75 });
  assert.equal(voiesF61(6).nv, 2); assert.equal(voiesF61(8.99).nv, 2); assert.equal(voiesF61(9.2).nv, 3);
});
