/**
 * Benchmark contre la sortie PONTYPE/PAP (IPSO, 2012) de la note de calcul du tablier du Pont de Noé
 * (corridor Abidjan–Lagos, COMETE/ICI) : travée isostatique 33 m, 4 poutres VIPP entraxe 3,28 m,
 * 2b = 13,12 m, chaussée 8 m + 2 trottoirs de 2,56 m, classe 1, θ = 0,679, α = 0,148.
 * Unités de la note : t et m (1 t = 10 kN). Écarts commentés dans /home/claude/ref/reports/noe.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coefK, plateHarmonic } from '../src/guyon.js';
import { ContinuousBeam } from '../src/beam.js';
import { chargeA, voiesF61, classePont, BC, BT, MC120, TROTTOIR, deltaDyn, maxAxleLoadOnLength } from '../src/loads_f61.js';
import { checkBearing } from '../src/bearings.js';

const b = 6.56, THETA = 0.679, ALPHA = 0.148, Lg = b / THETA;   // L « Guyon » = b/θ
const rel = (a, r, tol, msg) => assert.ok(Math.abs(a - r) <= tol * Math.abs(r), `${msg} : PAP ${r}, outil ${a.toFixed(4)}`);
// interpolation de Massonnet K_α = K₀ + (K₁ − K₀)√α (ν = 0) — c'est ce que fait PONTYPE/PAP
const Kint = (e, y) => { e = Math.max(-b, Math.min(b, e)); const k0 = coefK({ b, L: Lg, e, y, nu: 0, alpha: 0 }), k1 = coefK({ b, L: Lg, e, y, nu: 0, alpha: 1 }); return k0 + (k1 - k0) * Math.sqrt(ALPHA); };
const muInt = (n, e, y) => { e = Math.max(-b, Math.min(b, e)); const f = a => { const h = plateHarmonic({ b, L: Lg, n, e, nu: 0, alpha: a }); return -h.d2(y) / b; }; const m0 = f(0), m1 = f(1); return m0 + (m1 - m0) * Math.sqrt(ALPHA); };

const KREF = { // lignes d'influence de K (pas 0,125 m depuis −6,56 m), un point sur huit
  [-4.92]: [[0, 3.2065], [8, 2.829], [16, 2.4218], [24, 1.9806], [32, 1.5523], [40, 1.1671], [48, 0.8384], [56, 0.5684], [64, 0.3524], [72, 0.1816], [80, 0.0451], [88, -0.0678], [96, -0.1669], [104, -0.2599]],
  [-1.64]: [[0, 0.9303], [8, 1.0924], [16, 1.2531], [24, 1.3999], [32, 1.5063], [40, 1.5291], [48, 1.4346], [56, 1.2636], [64, 1.0561], [72, 0.8371], [80, 0.6206], [88, 0.412], [96, 0.2117], [104, 0.0167]],
  [1.64]: [[0, -0.0066], [8, 0.1881], [16, 0.3876], [24, 0.5951], [32, 0.8108], [40, 1.03], [48, 1.24], [56, 1.4172], [64, 1.5235], [72, 1.5145], [80, 1.4154], [88, 1.2718], [96, 1.1119], [104, 0.9497]],
  [4.92]: [[0, -0.271], [8, -0.1782], [16, -0.0803], [24, 0.0305], [32, 0.1636], [40, 0.3298], [48, 0.5398], [56, 0.8029], [64, 1.1245], [72, 1.5034], [80, 1.9277], [88, 2.3697], [96, 2.7825], [104, 3.1616]],
};
const MUREF = { // coefficients μ_n × 10⁴ (pas 0,5 m depuis −6,56 m), un point sur trois
  [-1.64]: { 1: [[0, -1356.4], [3, -657.5], [6, 120.7], [9, 1112.3], [12, 833.9], [15, 259.5], [18, -96.3], [21, -328.8], [24, -506.1]],
    3: [[0, 3.5], [3, -60.2], [6, -89.1], [9, 228.7], [12, 6.3], [15, -86.2], [18, -34.2], [21, -3.7], [24, 2.4]],
    5: [[0, 1.3], [3, -1.6], [6, -39.8], [9, 67.4], [12, -48.5], [15, -16.5], [18, 1.2], [21, 0.2], [24, -0.1]] },
  [-4.92]: { 1: [[0, -1215.5], [3, 496.8], [6, 327.1], [9, 111.7], [12, -3.8], [15, -60.9], [18, -86.1], [21, -96.1], [24, -101.1]],
    3: [[0, -461.2], [3, 361.1], [6, -7.6], [9, -63.5], [12, -24.9], [15, -3.0], [18, 1.3], [21, 0.6], [24, -0.1]],
    5: [[0, -139.8], [3, 202.4], [6, -52.4], [9, -9.9], [12, 1.2], [15, 0.1], [18, -0.1], [21, 0.0], [24, 0.0]] },
};

test('Noé/PAP — K de Guyon-Massonnet tablier à poutres (θ = 0,679, α = 0,148) : interpolation de Massonnet √α', () => {
  for (const [y, pts] of Object.entries(KREF)) for (const [i, r] of pts) {
    const e = -b + 0.125 * i;
    assert.ok(Math.abs(Kint(e, +y) - r) <= 1e-3, `K(y=${y}, e=${e.toFixed(3)}) : PAP ${r}, outil ${Kint(e, +y).toFixed(4)}`);
  }
  // guyon.js applique par défaut l'interpolation de Massonnet (PAP) ; la solution orthotrope « exacte » s'en écarte de 3,6 % au bord
  const kDef = coefK({ b, L: Lg, e: -b, y: -4.92, nu: 0, alpha: ALPHA });
  assert.ok(Math.abs(kDef - 3.2065) <= 1e-3, 'défaut = interpolation √α (PAP) ' + kDef);
  const kEx = coefK({ b, L: Lg, e: -b, y: -4.92, nu: 0, alpha: ALPHA, alphaMode: 'exact' });
  assert.ok(kEx > 3.2065 * 1.03, 'exact α ≠ PAP ' + kEx);
});

test('Noé/PAP — coefficients μ de flexion transversale (harmonique 1, 3, 5 ; ν = 0, interpolation √α)', () => {
  for (const [y, harm] of Object.entries(MUREF)) for (const [n, pts] of Object.entries(harm)) for (const [i, r] of pts) {
    const e = -b + 0.5 * i, m = 1e4 * muInt(+n, e, +y);
    assert.ok(Math.abs(m - r) <= 2.5, `μ${n}(y=${y}, e=${e.toFixed(2)}) ×1e4 : PAP ${r}, outil ${m.toFixed(1)}`);
  }
});

test('Noé/PAP — coefficients correctifs de répartition par cas de charge (poutres 1 et 2)', () => {
  const band = (e1, e2, y, n = 200) => { let s = 0; for (let i = 0; i < n; i++) s += Kint(e1 + (e2 - e1) * (i + 0.5) / n, y); return s / n; };
  const best = (w, f) => { let m = 0; for (let s = -4; s <= 4 - w + 1e-9; s += 0.01) m = Math.max(m, f(s)); return m; };
  const REF = { [-4.92]: { tr: 1.360, A: 0.821, Bc: 1.358, Bt: 1.085, Mc: 1.346 }, [-1.64]: { tr: 0.697, A: 1.198, Bc: 1.548, Bt: 1.355, Mc: 1.391 } };
  for (const [ys, r] of Object.entries(REF)) {
    const y = +ys;
    const t1 = band(-b, -4, y), t2 = band(4, b, y);
    rel(Math.max(t1 / 2, (t1 + t2) / 2), r.tr, 1e-2, `trottoirs y=${y} (un ou deux trottoirs, normalisé par deux)`);
    rel((band(-4, 0, y) + band(0, 4, y)) / 2, r.A, 2e-3, `A(l) 2 voies y=${y}`);
    const bc2 = best(5, s => 1.1 * [s + 0.25, s + 2.25, s + 2.75, s + 4.75].reduce((a, e) => a + Kint(e, y), 0) / 4);
    rel(bc2, r.Bc, 2e-2, `Bc 2 files (bc = 1,1) y=${y}`);
    const bt2 = best(6, s => [s + 0.5, s + 2.5, s + 3.5, s + 5.5].reduce((a, e) => a + Kint(e, y), 0) / 4);
    rel(bt2, r.Bt, 2e-2, `Bt 2 tandems (bandes de 3 m) y=${y}`);
    const mc = best(4.3, s => (band(s, s + 1, y) + band(s + 3.3, s + 4.3, y)) / 2);
    rel(mc, r.Mc, 2e-3, `Mc120 y=${y}`);
  }
});

test('Noé/PAP — charges Fascicule 61 : A(l), a1/a2, bc, δ (G = moyenne max/min), moments par poutre à mi-travée', () => {
  assert.equal(classePont(8), 1); assert.deepEqual(voiesF61(8), { nv: 2, v: 4 });
  const L = 33, bm = new ContinuousBeam([L], { nGrid: 400 }), mid = bm.sectionIndex(0, 0.5);
  const A = chargeA(L, { classe: 1, nVoiesChargees: 2, v: 4 });
  assert.equal(A.a1, 1); rel(A.a2, 0.875, 1e-9, 'a2'); rel(A.A, 10.3, 1e-9, 'A(33)');
  const qA = A.q * 8;
  rel(qA * L * L / 8 / 4 * 0.821 / 10, 201.44, 1e-3, 'A poutre 1'); rel(qA * L * L / 8 / 4 * 1.198 / 10, 293.89, 1e-3, 'A poutre 2');
  // δ : G = ½(G_max + G_min)·L = 856 t (PAP), S = 2 files × 2 camions × 1,1 = 132 t ; Mc120 : S = 110 t
  const G = (26.825 + 25.056) / 2 * L * 10, SB = 2 * 1.1 * maxAxleLoadOnLength(BC.axlesTwoTrucks, L);
  rel(G / 10, 856, 1e-3, 'G'); rel(SB / 10, 132, 1e-9, 'S Bc');
  const dB = deltaDyn(L, G, Math.max(SB, 2 * maxAxleLoadOnLength(BT.axles, L))), dC = deltaDyn(L, G, MC120.P);
  rel(dB, 1.075, 5e-4, 'δB'); rel(dC, 1.071, 5e-4, 'δC');
  const mFile = bm.trainEnvelope(bm.ILM[mid], BC.axlesOneTruck, { nVeh: 2, pitch: BC.pitchMin }).max;   // 1 file, bc = 1
  rel(dB * 1.358 * mFile * 2 / 4 / 10, 246.36, 1e-3, 'Bc poutre 1'); rel(dB * 1.548 * mFile * 2 / 4 / 10, 280.81, 1e-3, 'Bc poutre 2');
  const mc = bm.stripEnvelope(bm.ILM[mid], 2 * MC120.qTrack, MC120.trackLength).max;
  rel(dC * 1.346 * mc / 4 / 10, 295.91, 5e-3, 'Mc120 poutre 1 (PAP −0,3 % : pas de positions)');
  rel(TROTTOIR.q * 5.12 * L * L / 8 / 4 * 1.360 / 10, 35.56, 1e-3, 'trottoirs poutre 1');
});

test('Noé — appareil 400×400×4(12+3) sous les règles BT4 du guide 1989 (bearings.js) : distorsion lente refusée en C1', () => {
  // charges ELS par appareil (t → kN) : G 127,5 t, Bc 38,38 t ; déplacements lents C1 : retrait 16,2 + fluage 11,5 + TLD 13,9 mm
  const r = checkBearing({ a: 400, b: 400, t: 12, ts: 3 }, 4, { Pmax: (127.5 + 38.38) * 10, Pmin: 115.6 * 10, H: 22.9, ug: 0.0162 + 0.0115 + 0.0139, alpha: 0.003 });
  assert.ok(r.checks.compression, 'σ = 10,4 MPa ≤ 13,3 MPa');
  rel(r.dist1, 0.867, 2e-3, 'u_g/T');
  assert.equal(r.checks.distorsionVide, false, 'BT4 (u_g/T ≤ 0,5) refuse ce que la note admet selon NF EN 1337-3 (ε_q = v_x/T_e ≤ 1)');
});
