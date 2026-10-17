/**
 * Benchmark contre la note PSIDA.EL (version 84-1) reproduite en annexe du guide SETRA PSI-PAP (juin 1986,
 * « modèle d'application, ouvrage à trois travées ») : 14,50 – 24,60 – 14,50 m, abouts 0,40 m, biais 90 gr,
 * dalle 13,90 × 0,72 m (I = 0,432346 m⁴), trottoirs 1,70 + chaussée 10,50 + trottoirs 1,70, classe 1, 3 voies,
 * ossature 25,230 t/ml (ρ = 2,521 t/m³), QSUP 7,250 / 5,840 t/ml, A, Bc, Bt (pas de Mc120).
 * Source : texte OCR du guide (pages 67 à 76). Unités de la note : t et m (1 t = 10 kN).
 * Rapport détaillé : écarts et correctifs proposés (A(l) sur parties de travées, trottoirs en flexion
 * transversale, saut de l'effort tranchant) — les cas encore non conformes sont marqués TODO.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousBeam } from '../src/beam.js';
import { SlabDeck } from '../src/analysis.js';
import { plateHarmonic } from '../src/guyon.js';
import { mechanicalSkew } from '../src/skew.js';
import { TransverseModel } from '../src/transverse.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PSIDA ${b}, outil ${a.toFixed(4)} (écart ${(100 * (a - b) / Math.abs(b)).toFixed(2)} %)`);
const SPANS = [14.5, 24.6, 14.5], W = 13.9, B = W / 2;
const G_MIN = 25.23 + 5.84, G_MAX = 25.23 + 7.25;   // t/ml
const GR = gr => gr * Math.PI / 200;

test('PSIPAP/PSIDA.EL — lignes d\'influence, foyers, permanent, réactions, L_eq, biais mécanique', () => {
  const bm = new ContinuousBeam(SPANS, { nGrid: 200, overhangs: [0.4, 0.4] });
  const P1 = bm.supportSectionIndex(1);
  const area = j => bm.integrateIL(bm.ILM[P1], bm.x0[j], bm.x0[j + 1]);
  [-10.817, -36.204, 3.403].forEach((r, j) => assert.ok(Math.abs(area(j) - r) <= 2e-3, `aire appui 2 travée ${j + 1} : ${r} / ${area(j)}`));
  // cubique de la ligne d'influence (page 5) : travée 2, M(ξ) = A ξ³ + B ξ² + C ξ (|A| = 11,290279, |B|,|C| = 25,765564 / 14,475296)
  const f = xi => bm.ilAt(bm.ILM[P1], bm.x0[1] + xi * 24.6);
  rel(f(0.5), -11.290279 / 8 + 25.765564 / 4 - 14.475296 / 2, 2e-4, 'ordonnée à mi-travée 2');
  // foyers de la travée 2 : 5,887 (gauche) et 18,713 m (droit)
  const sup = k => [1, 2].map(i => bm.integrateIL(bm.ILM[bm.supportSectionIndex(i)], bm.x0[k], bm.x0[k + 1]));
  const m3 = sup(2), m1 = sup(0);
  rel(24.6 * m3[0] / (m3[0] - m3[1]), 5.887, 1e-3, 'foyer gauche'); rel(24.6 * m1[0] / (m1[0] - m1[1]), 18.713, 1e-3, 'foyer droit');
  // charges permanentes (la note néglige le moment de console des abouts : ≤ 0,3 %)
  const u = bm.uniformLoad(1);
  rel(G_MIN * u.M[P1], -1355.20, 1e-3, 'M appui 2 g min'); rel(G_MAX * u.M[P1], -1416.70, 1e-3, 'M appui 2 g max');
  for (const [fr, r] of [[0.1, -532.20], [0.3, 647.14], [0.4, 941.98], [0.5, 1040.26]]) rel(G_MAX * u.M[bm.sectionIndex(1, fr)], r, 3e-3, `M travée 2 ${fr} L`);
  rel(G_MAX * u.R[0], 151.0, 1e-3, 'R1 g max'); rel(G_MIN * u.R[0], 144.4, 1e-3, 'R1 g min');
  rel(G_MAX * u.R[1], 732.7, 1e-3, 'R2 g max'); rel(G_MIN * u.R[1], 700.9, 1e-3, 'R2 g min');
  // portées équivalentes biaises (méthode des flèches) et biais mécaniques (page 24 ; guide p. 28)
  const Le = bm.equivalentSpans('fleches');
  rel(Le[0], 13.507, 3e-4, 'L_eq travée 1'); rel(Le[1], 19.870, 3e-4, 'L_eq travée 2');
  const p1 = mechanicalSkew({ psi: 90, Be: W, L: 14.5 }), p2 = mechanicalSkew({ psi: 90, Be: W, L: 24.6 });
  rel(p1, 92.649, 1e-5, 'biais mécanique travée 1'); rel(p2, 95.097, 1e-5, 'biais mécanique travée 2');
  rel(Le[0] * Math.sin(GR(p1)), 13.418, 3e-4, 'travée droite équivalente'); rel(W / Math.sin(GR(p1)), 13.993, 2e-4, 'largeur 2b/sin ψ');
  rel(W / Math.sin(GR(p1)) / 2 / 13.418, 0.521, 2e-3, 'paramètre d\'entretoisement');
});

test('PSIPAP/PSIDA.EL — Fascicule 61 : A(l), B, trottoirs (travées), réactions sur appui 2, combinaisons', () => {
  const deck = new SlabDeck({ spans: SPANS, overhangs: [0.4, 0.4], width: W, h: 0.72, area: W * 0.72, gammaC: 25.21,
    roadway: { y1: -5.25, y2: 5.25 }, footways: [{ y1: -B, y2: -5.25 }, { y1: 5.25, y2: B }],
    bands: [{ q: 72.5 / W, y1: -B, y2: B, kmin: 58.4 / 72.5, kmax: 1.0, label: 'QSUP' }],
    leqMethod: 'fleches', nu: 0, nGrid: 100, ys: Array.from({ length: 29 }, (_, i) => -B + W * i / 28) });
  // conventions SETRA par défaut : K et δ de la travée porteuse, G de δ = ½(G min + G max)·L, A(l) par zones
  const f = deck.fascicule61({ classe: 1, nRetenue: 0 });
  assert.equal(f.nv, 3); assert.equal(f.v, 3.5);
  const KA = null, KBc = null, KBt = null, KT = null;
  // moment de la note = Σ_j K_j·δ_j·M_j = max_y m_x·2b
  const MK = (r, k, s, w = 'Mmax') => (w === 'Mmax' ? Math.max(...r.mxMax[s]) : Math.min(...r.mxMin[s])) * W / 10;
  const sec = (j, fr) => deck.beam.sectionIndex(j, fr);
  // A(l) en travée (page 18 / 20) : sections où la ligne d'influence est positive sur la travée entière
  [[0.2, 228.21], [0.4, 325.47], [0.5, 324.99], [0.8, 127.16]].forEach(([fr, r]) => rel(MK(f.A, KA, sec(0, fr)), r, 1e-3, `A travée 1 ${fr} L`));
  [[0.3, 317.59], [0.4, 423.04], [0.5, 458.19]].forEach(([fr, r]) => rel(MK(f.A, KA, sec(1, fr)), r, 1e-3, `A travée 2 ${fr} L`));
  // B (Bc gouverne ici, 3 files bc = 0,95) : l'outil trouve des positions un peu plus défavorables (+1 à +2 %)
  const Bmax = s => Math.max(MK(f.Bc, KBc, s), MK(f.Bt, KBt, s));
  [[0, 0.4, 276.00], [0, 0.5, 277.22], [1, 0.4, 382.57], [1, 0.5, 393.87]].forEach(([j, fr, r]) => {
    const v = Bmax(sec(j, fr)); assert.ok(v >= r * 0.999 && v <= r * 1.025, `B travée ${j + 1} ${fr} L : PSIDA ${r}, outil ${v.toFixed(2)}`);
  });
  // trottoirs (1,5 kN/m² sur 1,70 m)
  [[0, 0.5, 13.68], [1, 0.5, 21.44]].forEach(([j, fr, r]) => rel(MK(f.trottoir, KT, sec(j, fr)), r, 2e-3, `trottoirs travée ${j + 1}`));
  // réactions sur appui 2 « pour la largeur totale », sans δ ni coefficient de répartition (page 23)
  rel(f.A.Rmax[1] / 10, 206.4, 2e-3, 'R2 A'); rel(f.A.Rmin[1] / 10, -12.2, 1e-2, 'R2 A min');
  rel(f.Bc.Rmax[1] / f.Bc.deltaR[1] / 10, 150.8, 2e-3, 'R2 Bc'); rel(f.Bt.Rmax[1] / f.Bt.deltaR[1] / 10, 65.0, 2e-3, 'R2 Bt');
  rel(f.trottoir.Rmax[1] / 10, 11.9, 5e-3, 'R2 trottoirs');
  // combinaisons (règles BAEL 83, γ = 1,125 × …) à mi-travée 2 : ELS 1611,53 / 893,98 ; ELU 2170,56 / 871,72 t·m
  const s = sec(1, 0.5), u = deck.beam.uniformLoad(1), gM = 324.8 * u.M[s] / 10, gm = 310.7 * u.M[s] / 10;
  const qmax = Math.max(MK(f.A, KA, s), Bmax(s)), tmax = MK(f.trottoir, KT, s);
  rel(gM + 1.2 * MK(f.A, KA, s) + tmax, 1611.53, 1e-3, 'ELS max (A gouverne)');
  rel(1.125 * (1.2 * gM + 1.42 * qmax + 1.42 * tmax), 2170.56, 1e-3, 'ELU max');
  const qmin = Math.min(MK(f.A, KA, s, 'Mmin'), MK(f.Bc, KBc, s, 'Mmin')), tmin = MK(f.trottoir, KT, s, 'Mmin');
  rel(1.125 * (0.9 * gm + 1.42 * qmin + 1.42 * tmin), 871.72, 3e-3, 'ELU min');
});

test('PSIPAP/PSIDA.EL — flexion transversale : μ (ν = 0,2), MY sous charges permanentes et A(l)', () => {
  const s1 = Math.sin(GR(92.649)), s2 = Math.sin(GR(95.097));
  const b = W / s1 / 2, L = 13.418;
  const mu = (n, y) => { const h = plateHarmonic({ b, L, n, e: y, nu: 0.2 }); return -(h.d2(y) - 0.2 * h.k * h.k * h.Y(y)) / b; };
  // ordonnées au droit des fibres (y = 0, −B/4, −3B/8 de la largeur droite, rapportées à la largeur biaise)
  [[0, [0.1678, 0.0610, 0.0366]], [-3.475 / s1, [0.1516, 0.0602, 0.0366]], [-5.213 / s1, [0.1132, 0.0564]]].forEach(([y, refs]) =>
    refs.forEach((r, i) => rel(mu(2 * i + 1, y), r, 2e-3, `μ${2 * i + 1} fibre ${y.toFixed(3)}`)));
  const hr = 5.25 / s1, ys = [0, -3.475 / s1, -5.213 / s1];
  const deck = new SlabDeck({ spans: SPANS, overhangs: [0.4, 0.4], width: 2 * b, h: 0.72, area: W * 0.72, gammaC: 25.21 * s1,
    roadway: { y1: -hr, y2: hr }, footways: [{ y1: -b, y2: -hr }, { y1: hr, y2: b }],
    bands: [{ q: 72.5 / (2 * b), y1: -b, y2: b, kmin: 58.4 / 72.5, kmax: 1 }], Leq: [L, 19.870 * s2, L], nu: 0.2, ys });
  const tm = new TransverseModel(deck, { tRev: 0.08, nHarm: 25 });
  const p1 = tm.permanent(0), p2 = tm.permanent(1);
  [8.062, 6.419, 4.021].forEach((r, i) => rel(p1.myMax[i] / 10, r, 6e-3, `MY CP travée 1 fibre ${i}`));
  [7.712, 6.140, 3.846].forEach((r, i) => rel(p1.myMin[i] / 10, r, 6e-3, `MY CP min travée 1 fibre ${i}`));
  [12.395, 9.540, 5.745].forEach((r, i) => rel(p2.myMax[i] / 10, r, 1e-2, `MY CP travée 2 fibre ${i}`));
  const r1 = tm.fascicule61(0, { classe: 1, G: 310.7 * 14.9 / L });
  rel(r1.A.myMax[0] / 10, 6.469, 1e-2, 'MY A fibre 1'); rel(r1.A.myMax[1] / 10, 5.895, 1e-2, 'MY A fibre 2');
  rel(r1.A.myMin[1] / 10, -0.667, 4e-2, 'MY A min fibre 2');
  rel(r1.Bt.myMax[1] / 10, 5.894, 2e-2, 'MY Bt fibre 2');
  // trottoirs : charge locale 4,5 kN/m², un trottoir ou les deux (−0,490 / −0,257 / 0,198 t·m/m)
  rel(r1.trottoir.myMin[0] / 10, -0.490, 1e-2, 'MY trottoirs min fibre 1'); rel(r1.trottoir.myMin[1] / 10, -0.257, 1e-2, 'MY trottoirs min fibre 2');
  rel(r1.trottoir.myMax[2] / 10, 0.198, 1.5e-2, 'MY trottoirs max fibre 4');
});

test('PSIPAP/PSIDA.EL — A(l) sur parties de travées (zones de la ligne d\'influence), effort tranchant permanent', () => {
  const deck = new SlabDeck({ spans: SPANS, overhangs: [0.4, 0.4], width: W, h: 0.72, roadway: { y1: -5.25, y2: 5.25 },
    footways: [{ y1: -B, y2: -5.25 }, { y1: 5.25, y2: B }], leqMethod: 'fleches', nu: 0, nGrid: 100, ys: Array.from({ length: 29 }, (_, i) => -B + W * i / 28) });
  const f = deck.fascicule61({ classe: 1, nRetenue: 0 });
  const MK = (r, s) => Math.max(...r.mxMax[s]) * W / 10, s = deck.beam.sectionIndex(0, 0.9), s2 = deck.beam.sectionIndex(1, 0.1);
  rel(MK(f.A, s), 65.84, 1e-2, 'A travée 1 0,90 L (zones 4,67 m + 14,50 m)');
  rel(MK(f.A, s2), 61.67, 2e-2, 'A travée 2 0,10 L');
  const bm = new ContinuousBeam(SPANS, { nGrid: 100, overhangs: [0.4, 0.4] });
  rel(G_MAX * bm.uniformLoad(1).Vp[bm.sectionIndex(1, 0)], 399.5, 2e-3, 'V permanent travée 2 côté gauche');
});
