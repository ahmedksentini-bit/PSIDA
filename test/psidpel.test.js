/**
 * Benchmark contre la note de calcul modèle PSIDP.EL (SETRA, octobre 1985, version 84-1) — parties hors précontrainte.
 * Pont-dalle 13,50 – 17,61 – 17,61 – 13,50 m, abouts 0,55 m, biais 80 gr, rectangle équivalent 9,837 × 0,55 m
 * (S = 5,43 m², I = 0,136392 m⁴), trottoirs 1,25 m + chaussée 7,50 m, classe 1, Fascicule 61 titre II.
 * Source : texte OCR de la note (gtext/psidpel.txt) ; unités t et m (1 t = 10 kN) ; rapport : ref/reports/psidpel.md.
 * Conventions PSIDP.EL relevées : L_eq par la flèche à mi-travée, K avec ν = 0, efforts longitudinaux des charges
 * d'exploitation × sin² φ (biais mécanique), δ avec G = g moyen × L, convoi de deux Mc120, A(l) par zones de signe,
 * trottoirs chargés sur leur largeur réelle, flexion transversale avec ν = 0,2 sur la travée droite équivalente.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousBeam } from '../src/beam.js';
import { SlabDeck } from '../src/analysis.js';
import { coefK, plateHarmonic } from '../src/guyon.js';
import { mechanicalSkew } from '../src/skew.js';
import { deltaDyn, maxAxleLoadOnLength, chargeA, BC, BT, MC120, COMBI_BAEL } from '../src/loads_f61.js';
import { TransverseModel } from '../src/transverse.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PSIDP ${b}, outil ${a.toFixed(4)} (écart ${(100 * (a - b) / Math.abs(b)).toFixed(2)} %)`);
const SPANS = [13.5, 17.61, 17.61, 13.5], W = 9.837, B = W / 2;
const G = { omin: 13.303, omax: 13.847, cmin: 16.303, cmax: 17.847, moy: 17.075 }; // t/ml (ossature ; ossature + superstructures)
const sin2 = SPANS.map(L => Math.sin(mechanicalSkew({ psi: 80, Be: W, L }) * Math.PI / 200) ** 2);

test('PSIDP.EL — lignes d\'influence, foyers, charges permanentes, réactions', () => {
  const bm = new ContinuousBeam(SPANS, { nGrid: 200, overhangs: [0.55, 0.55] });
  const area = (il, j) => bm.integrateIL(il, bm.x0[j], bm.x0[j + 1]);
  const tot = il => [0, 1, 2, 3].reduce((a, j) => a + area(il, j), 0);
  const P1 = bm.supportSectionIndex(1), P2 = bm.supportSectionIndex(2);
  const cases = [
    [bm.ILM[P1], [-10.701, -17.361, 4.581, -0.815]], [bm.ILM[P2], [2.879, -16.187, -16.187, 2.879]],
    [bm.ILM[bm.sectionIndex(0, 0.4)], [17.590, -6.944, 1.833, -0.326]],
    [bm.ILR[0], [5.957, -1.286, 0.339, -0.060]], [bm.ILR[1], [8.314, 10.158, -1.519, 0.270]], [bm.ILR[2], [-0.981, 9.918, 9.918, -0.981]],
  ];
  for (const [il, refs] of cases) refs.forEach((r, j) => assert.ok(Math.abs(area(il, j) - r) <= 2e-3, `aire ${r} / ${area(il, j)}`));
  for (const [f, r] of [[0.1, 5.772], [0.3, 11.848], [0.5, 10.634], [0.7, 2.130], [0.9, -13.664], [0.95, -18.752]]) rel(tot(bm.ILM[bm.sectionIndex(0, f)]), r, 1e-3, `aire totale ${f} L`);
  // foyers : droite travée 2 = 13,877 ; droite travée 3 = 13,725 ; gauche travée 3 = 3,733
  const sup = k => [1, 2, 3].map(i => bm.integrateIL(bm.ILM[bm.supportSectionIndex(i)], bm.x0[k], bm.x0[k + 1]));
  const m1 = sup(0), m4 = sup(3);
  rel(17.61 * m1[0] / (m1[0] - m1[1]), 13.877, 1e-3, 'foyer droite travée 2');
  rel(17.61 * m4[1] / (m4[1] - m4[2]), 3.733, 1e-3, 'foyer gauche travée 3');
  // charges permanentes : la note calcule Σ aires × g (moments de console des abouts négligés)
  rel(G.cmax * tot(bm.ILM[P1]), -433.6, 1e-3, 'C.P. max appui 2'); rel(G.omin * tot(bm.ILM[P1]), -323.2, 1e-3, 'ossature min appui 2');
  rel(G.cmax * tot(bm.ILM[P2]), -475.0, 1e-3, 'C.P. max appui 3'); rel(G.cmax * tot(bm.ILM[bm.sectionIndex(1, 0.5)]), 237.5, 1e-3, 'C.P. 0,5 L travée 2');
  // réactions permanentes (abouts compris : aire 0,564 de R1 sur l'about, reproduite par uniformLoad)
  const u = bm.uniformLoad(1);
  rel(G.cmax * u.R[0], 98.4, 5e-3, 'R1 perm max'); rel(G.cmax * u.R[1], 307.4, 2e-3, 'R2'); rel(G.cmin * u.R[2], 291.4, 2e-3, 'R3 min');
  // tranchant juste à droite de l'appui 1 : Σ aires 4,950 — l'intégration de la marche de la ligne d'influence perd ½ pas de grille
  rel(bm.integrateIL(bm.ILVp[bm.sectionIndex(0, 0)]), 4.950, 1e-2, 'aire LI tranchant travée 1 gauche');
});

test('PSIDP.EL — L_eq (flèches), biais mécanique, sin² φ, δ, coefficients K', () => {
  const bm = new ContinuousBeam(SPANS, { nGrid: 200, overhangs: [0.55, 0.55] });
  const Le = bm.equivalentSpans('fleches');
  rel(Le[0], 12.428, 5e-4, 'L_eq travée 1'); rel(Le[1], 14.663, 5e-4, 'L_eq travée 2');
  const phi = SPANS.map(L => mechanicalSkew({ psi: 80, Be: W, L }));
  rel(phi[0], 87.611, 2e-5, 'biais mécanique 1'); rel(phi[1], 89.977, 2e-5, 'biais mécanique 2');
  rel(sin2[0], 0.963, 1e-3, 'minoration travée 1'); rel(sin2[1], 0.975, 1e-3, 'minoration travée 2');
  // travée droite équivalente pour la flexion transversale : λ' = L_eq sin φ, 2b' = 2b/sin φ (biais MÉCANIQUE)
  const sp = Math.sin(phi[1] * Math.PI / 200);
  rel(Le[1] * sp, 14.482, 5e-4, 'λ\''); rel(W / sp, 9.961, 5e-4, '2b/sin φ'); rel((W / sp / 2) / (Le[1] * sp), 0.344, 3e-3, 'θ\'');
  // δ : G = g moyen × L (sans abouts), S = Bc 2 files × 1,1 (fenêtre glissante), 110 t pour Mc120
  const SB = L => Math.max(2 * 1.1 * maxAxleLoadOnLength(BC.axlesTwoTrucks, L), 2 * maxAxleLoadOnLength(BT.axles, L)) / 10;
  rel(SB(13.5), 119, 2e-3, 'S travée 1'); rel(SB(17.61), 132, 1e-6, 'S travée 2');
  for (const [L, S, r] of [[13.5, SB(13.5), 1.177], [17.61, SB(17.61), 1.148], [13.5, 110, 1.172], [17.61, 110, 1.139]]) assert.ok(Math.abs(deltaDyn(L, G.moy * L, S) - r) < 1e-3, `δ ${r}`);
  // K de Guyon-Massonnet ν = 0 : roues de deux files Bc accolées au bord gauche de la chaussée, fibre −b, travée 2
  const wheels = [-3.5, -1.5, -1.0, 1.0], refW = [1.3568, 1.1077, 1.0528, 0.8656];
  wheels.forEach((e, i) => rel(coefK({ b: B, L: Le[1], e, y: -B, nu: 0 }), refW[i], 5e-4, `K roue ${e}`));
  rel(refW.reduce((a, v) => a + v, 0) / 4 * 1.1, 1.205, 1e-3, 'coefficient Bc travée 2 (bc = 1,10 inclus)');
  rel(coefK({ b: B, L: Le[0], e: -0.0435, y: 0, nu: 0 }), 1.0582, 5e-4, 'K axe');
  // la ligne d'influence de la note commence au bord du trottoir réel (−5,00 m), au-delà du rectangle : extrapolation
  rel(coefK({ b: B, L: Le[0], e: -B, y: -B, nu: 0 }), 1.7697, 1.5e-2, 'K(b, b)');
});

test('PSIDP.EL — moments Fascicule 61 (K, δ, sin² φ), réactions, convoi de deux Mc120, A(l) par zones', () => {
  // conventions SETRA de l'outil : K et δ de la travée porteuse (défaut Fasc. 61), G de δ = g moyen × L (défaut),
  // option sin2Phi (minoration sin²φ_mec des moments d'exploitation), Mc120 en convoi, A(l) par zones de signe constant
  const deck = new SlabDeck({ spans: SPANS, overhangs: [0.55, 0.55], width: W, h: 0.55, area: 5.43, roadway: { y1: -3.75, y2: 3.75 },
    footways: [{ y1: -5, y2: -3.75 }, { y1: 3.75, y2: 5 }], kDalle: [0.98, 1.02], bands: [{ q: 35 / W, y1: -B, y2: B, kmin: 3 / 3.5, kmax: 4 / 3.5 }],
    leqMethod: 'fleches', nu: 0, nGrid: 200, psi: 80, sin2Phi: true, ys: Array.from({ length: 17 }, (_, i) => -B + W * i / 16) });
  const f = deck.fascicule61({ classe: 1, nRetenue: 0 });
  assert.equal(f.nv, 2); assert.equal(f.v, 3.75);
  rel(f.deltaBc[0], 1.177, 1e-3, 'δB travée 1 (G moyen par défaut)'); rel(f.deltaMc[1], 1.139, 1e-3, 'δMc travée 2');
  const bm = deck.beam, sec = (j, fr) => bm.sectionIndex(j, fr), P1 = bm.supportSectionIndex(1), P2 = bm.supportSectionIndex(2);
  // coefficients correctifs de la travée (récapitulation p. 20 de la note ; Bc avec bc = 1,10) : convention « section »
  const fS = deck.fascicule61({ classe: 1, nRetenue: 0, convention: 'section' });
  const K = {}; for (const k of ['A', 'Bc', 'Bt', 'Mc120', 'trottoir']) K[k] = deck.transverseFactors(fS[k]).K;
  const s14 = sec(0, 0.4), s25 = sec(1, 0.5);
  rel(K.trottoir[s14], 1.099, 3e-3, 'K trottoirs 1'); rel(K.A[s14], 1.018, 1e-3, 'K A 1'); rel(1.1 * K.Bc[s14], 1.230, 1e-3, 'K Bc 1');
  rel(K.Bt[s14], 1.057, 2e-3, 'K Bt 1'); rel(K.Mc120[s14], 1.176, 4e-3, 'K Mc 1');
  rel(K.trottoir[s25], 1.062, 3e-3, 'K trottoirs 2'); rel(K.A[s25], 1.011, 1e-3, 'K A 2'); rel(1.1 * K.Bc[s25], 1.205, 1e-3, 'K Bc 2');
  rel(K.Bt[s25], 1.047, 1e-3, 'K Bt 2'); rel(K.Mc120[s25], 1.139, 4e-3, 'K Mc 2');
  // moments de la note = Σ_j K_j·δ_j·sin²φ_j·M_j = max_y m_x·2b
  const M = (k, s, w) => (w === 'Mmax' ? Math.max(...f[k].mxMax[s]) : Math.min(...f[k].mxMin[s])) * W / 10;
  const Bm = (s, w) => (w === 'Mmax' ? Math.max : Math.min)(M('Bc', s, w), M('Bt', s, w));
  // A(l) (la note imprime A et B intervertis à 0,4 L par l'OCR : A 198,1, B 193,0)
  rel(M('A', s14, 'Mmax'), 198.1, 3e-3, 'A 0,4 L'); rel(M('A', sec(0, 0.5), 'Mmax'), 196.3, 3e-3, 'A 0,5 L');
  rel(M('A', sec(0, 0.1), 'Mmax'), 80.3, 3e-3, 'A 0,1 L'); rel(M('A', s25, 'Mmax'), 219.5, 3e-3, 'A 0,5 L travée 2');
  rel(M('A', P2, 'Mmin'), -221.8, 5e-3, 'A appui 3'); rel(M('A', P1, 'Mmin'), -205.8, 1e-2, 'A appui 2');
  rel(M('A', sec(0, 0.9), 'Mmax'), 48.5, 5e-3, 'A 0,9 L (zones de signe constant)');
  // B = max(Bc, Bt)
  rel(Bm(s25, 'Mmax'), 199.1, 3e-3, 'B 0,5 L travée 2'); rel(Bm(sec(0, 0.5), 'Mmax'), 189.7, 1.2e-2, 'B 0,5 L');
  rel(Bm(sec(0, 0.1), 'Mmax'), 84.4, 1e-2, 'B 0,1 L'); rel(Bm(P2, 'Mmin'), -220.9, 5e-3, 'B appui 3'); rel(Bm(s14, 'Mmax'), 193.0, 3e-3, 'B 0,4 L');
  // trottoirs chargés sur leur largeur réelle de 1,25 m
  rel(M('trottoir', s14, 'Mmax'), 7.7, 1e-2, 'trottoirs 0,4 L'); rel(M('trottoir', s25, 'Mmax'), 8.9, 1e-2, 'trottoirs 0,5 L travée 2');
  rel(M('trottoir', P2, 'Mmin'), -12.6, 1.5e-2, 'trottoirs appui 3');
  // convoi de deux Mc120 (distance libre ≥ 30,50 m, pas ≥ 36,60 m)
  for (const [s, r] of [[s14, 321.2], [sec(0, 0.5), 319.1], [s25, 324.2], [sec(0, 0.1), 131.2]]) rel(M('Mc120', s, 'Mmax'), r, 5e-3, `Mc120 convoi section ${s}`);
  // réactions des appuis intermédiaires (a1, bc inclus ; sans K ni δ)
  for (const [i, r] of [[1, [137.7, 106.0, 63.8, 7.0]], [2, [137.8, 107.7, 63.8, 7.4]]]) {
    rel(f.A.Rmax[i] / 10, r[0], 3e-3, `R${i + 1} A`); rel(f.Bc.Rmax[i] / f.Bc.deltaR[i] / 10, r[1], 3e-3, `R${i + 1} Bc`);
    rel(f.Bt.Rmax[i] / f.Bt.deltaR[i] / 10, r[2], 3e-3, `R${i + 1} Bt`); rel(f.trottoir.Rmax[i] / 10, r[3], 1e-2, `R${i + 1} trottoirs`);
  }
  rel(f.Mc120.Rmax[2] / f.Mc120.deltaR[2] / 10, 107.6, 3e-3, 'R3 Mc120'); rel(f.Mc120.Rmax[1] / f.Mc120.deltaR[1] / 10, 110.8, 3e-3, 'R2 Mc120 (convoi)');
  // δ des réactions de culée : (δ + 1,5)/2 = 1,338 pour B, (δ + 1,2)/2 = 1,186 pour Mc120
  rel(f.Bc.deltaR[0], 1.338, 1e-3, 'δ culée B'); rel(f.Mc120.deltaR[0], 1.186, 1e-3, 'δ culée Mc120');
  // combinaison ELU sur l'appui 2 avec les sollicitations de la note : 1,35 C.P. + 1,6 B + 1,6 trottoirs = −935,8 t·m
  rel(COMBI_BAEL.ELU.G * -433.6 + COMBI_BAEL.ELU.B * -208.1 + COMBI_BAEL.ELU.trottoir * -11.3, -935.8, 1e-3, 'ELU appui 2');
});

test('PSIDP.EL — flexion transversale : μ₁ μ₃ μ₅ (ν = 0,2) et MY sous A(l) sur la travée droite équivalente', () => {
  const sp = Math.sin(89.977 * Math.PI / 200), b = 9.961 / 2, L = 14.482;
  const mu = (n, y) => { const h = plateHarmonic({ b, L, n, e: y, nu: 0.2 }); return -(h.d2(y) - 0.2 * h.k * h.k * h.Y(y)) / b; };
  // fibres à 0, E/4, 3E/8 de l'axe (E = 9,837), rapportées à la dalle droite équivalente : y / sin φ
  const REF = { 0: [0.2232, 0.0917, 0.0555], 2.459: [0.1893, 0.0887, 0.0550], 3.689: [0.1288, 0.0777, 0.0521] };
  for (const [y, r] of Object.entries(REF)) [1, 3, 5].forEach((n, i) => rel(mu(n, -y / sp), r[i], 2e-3, `μ${n}(y = ${y})`));
  // facteurs d'étalement rapportés à la portée biaise 14,663 m : Bt 2,31 m → 0,990 / 0,911 / 0,764
  const Bm = (c, m) => Math.sin(m * Math.PI * c / (2 * 14.663)) / (m * Math.PI * c / (2 * 14.663));
  rel(Bm(2.31, 1), 0.990, 1e-3, 'B1 Bt'); rel(Bm(2.31, 3), 0.911, 1e-3, 'B3 Bt'); rel(Bm(2.31, 5), 0.764, 1e-3, 'B5 Bt'); rel(Bm(6.81, 1), 0.914, 1e-3, 'B1 Mc');
  const half = 3.75 / sp;
  const deck = new SlabDeck({ spans: SPANS, width: 9.961, h: 0.55, roadway: { y1: -half, y2: half }, footways: [{ y1: -b, y2: -half }, { y1: half, y2: b }],
    Leq: [12.194, L, L, 12.194], nu: 0.2, ys: [0, -2.459 / sp, -3.689 / sp] });
  const r = new TransverseModel(deck, { tRev: 0.08, nHarm: 5 }).fascicule61(1, { classe: 1, G: 10 * G.moy });
  rel(r.A.myMax[0] / 10, 4.833, 2e-3, 'MY A fibre 1'); rel(r.A.myMax[1] / 10, 3.489, 3e-3, 'MY A fibre 2'); rel(r.A.myMax[2] / 10, 1.907, 3e-3, 'MY A fibre 4');
  rel(r.A.myMin[2] / 10, -0.200, 1e-2, 'MY A min fibre 4');
});
