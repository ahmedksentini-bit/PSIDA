/**
 * Benchmark contre la note de calcul commentée PSIDA.EL (SETRA, version 84-1, réimpression 1990) :
 * pont-dalle BA 9,75 – 13,93 – 13,93 – 9,75 m, abouts 0,35 m, biais 80 gr, rectangle équivalent 7,913 × 0,52 m
 * (I = 0,092720 m⁴, S = 4,1256 m²), chaussée 6 m + 2 trottoirs, classe 1, Fascicule 61 titre II.
 * Unités de la note : t et m (1 t = 10 kN) — les résultats de l'outil sont divisés par 10.
 * Écarts commentés dans docs/hypotheses.md § 1 quater.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousBeam } from '../src/beam.js';
import { SlabDeck } from '../src/analysis.js';
import { coefK, plateHarmonic } from '../src/guyon.js';
import { mechanicalSkew } from '../src/skew.js';
import { deltaDyn, maxAxleLoadOnLength, BC, BT } from '../src/loads_f61.js';
import { TransverseModel } from '../src/transverse.js';
import { materialsBAEL, flexureELU } from '../src/section_bael.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PSIDA ${b}, outil ${a.toFixed(4)} (écart ${(100 * (a - b) / Math.abs(b)).toFixed(2)} %)`);
const SPANS = [9.75, 13.93, 13.93, 9.75];
const W = 7.913, B = W / 2;
const G_MIN = 10.314 + 2.550, G_MAX = 10.314 + 4.250;   // t/ml : ossature + QSUP min / max

test('PSIDA.EL — lignes d\'influence (aires par travée), foyers', () => {
  const bm = new ContinuousBeam(SPANS, { nGrid: 200, overhangs: [0.35, 0.35] });
  const area = (il, j) => bm.integrateIL(il, bm.x0[j], bm.x0[j + 1]);
  const P1 = bm.supportSectionIndex(1), P2 = bm.supportSectionIndex(2), s04 = bm.sectionIndex(0, 0.4);
  const cases = [
    ['M appui 2', bm.ILM[P1], [-5.314, -11.316, 2.952, -0.422]],
    ['M appui 3', bm.ILM[P2], [1.434, -10.037, -10.037, 1.434]],
    ['M 0,4 L travée 1', bm.ILM[s04], [9.282, -4.527, 1.181, -0.169]],
    ['R appui 1', bm.ILR[0], [4.330, -1.161, 0.303, -0.043]],
    ['R appui 3', bm.ILR[2], [-0.618, 7.806, 7.806, -0.618]],
  ];
  for (const [lab, il, refs] of cases) refs.forEach((r, j) => assert.ok(Math.abs(area(il, j) - r) <= 2e-3, `${lab} travée ${j + 1} : ${r} / ${area(il, j)}`));
  // foyers de gauche des travées 2 et 3 (3,166 / 2,960 m) : point de moment nul quand on charge à droite
  const sup = k => [1, 2, 3].map(i => bm.integrateIL(bm.ILM[bm.supportSectionIndex(i)], bm.x0[k], bm.x0[k + 1]));
  const m3 = sup(2), m4 = sup(3);
  rel(13.93 * m3[0] / (m3[0] - m3[1]), 3.166, 2e-3, 'foyer gauche travée 2');
  rel(13.93 * m4[1] / (m4[1] - m4[2]), 2.960, 2e-3, 'foyer gauche travée 3');
});

test('PSIDA.EL — charges permanentes, dénivellations d\'appui (Ei), portée équivalente, biais mécanique', () => {
  const bm = new ContinuousBeam(SPANS, { nGrid: 200, overhangs: [0.35, 0.35] });
  const P1 = bm.supportSectionIndex(1), P2 = bm.supportSectionIndex(2);
  const u = bm.uniformLoad(1);
  // la note ne fait pas porter le moment de console des abouts (Σ aires × g) : écart ≤ 0,15 % sur appui
  rel(G_MIN * u.M[P1], -181.39, 1.5e-3, 'M appui 2 g min'); rel(G_MAX * u.M[P1], -205.36, 1.5e-3, 'M appui 2 g max');
  rel(G_MAX * u.M[P2], -250.58, 1e-3, 'M appui 3 g max');
  rel(G_MAX * u.R[0], 55.1, 2e-3, 'R1 g max'); rel(G_MAX * u.R[2], 209.4, 1e-3, 'R3 g max');
  rel(G_MIN * bm.integrateIL(bm.ILM[bm.sectionIndex(0, 0.4)]), 74.19, 1e-3, 'M 0,4 L travée 1 (Σ aires)');
  // tableau « dénivellation de 1 cm » calculé avec Ei = 3 803 214 t/m² (Ev = Ei/3 pour les tassements effectifs)
  const EI = SPANS.map(() => 3803214 * 0.09272);
  const refM2 = [-49.77, 94.01, -56.40, 16.12, -3.95], refR3 = [-5.78, 15.77, -19.97, 15.77, -5.78];
  for (let k = 0; k < 5; k++) {
    const v = [0, 0, 0, 0, 0]; v[k] = 0.01;
    const r = bm.settlement(v, EI);
    rel(r.M[P1], refM2[k], 2e-3, `M appui 2, 1 cm en appui ${k + 1}`); rel(r.R[2], refR3[k], 3e-3, `R3, 1 cm en appui ${k + 1}`);
  }
  // tassements aléatoires 1 cm (paires d'appuis adjacents ±δ, Ev = Ei/3) : ±50,14 (appui 2) et ±45,84 (appui 3) t·m
  const deck = new SlabDeck({ spans: SPANS, width: W, h: 0.52, roadway: { y1: -3, y2: 3 }, overhangs: [0.35, 0.35] });
  const st = deck.settlements({ delta: 0.01, E: 38032.14, I: 0.09272, phi: 2 });
  rel(st.Mmax[deck.beam.supportSectionIndex(1)] / 10, 50.14, 2e-3, 'tassements appui 2');
  rel(st.Mmax[deck.beam.supportSectionIndex(2)] / 10, 45.84, 2e-3, 'tassements appui 3');
  // portée équivalente biaise 9,017 m : flèche à mi-travée de la travée seule chargée ; θ = 0,44
  const Le = bm.equivalentSpans('fleches');
  rel(Le[0], 9.017, 5e-4, 'L_eq travée 1'); rel(B / Le[0], 0.44, 5e-3, 'θ');
  // biais mécanique 86,574 gr (largeur 7,913 m, ψ = 80 gr) et travée droite équivalente 8,818 m
  const phi = mechanicalSkew({ psi: 80, Be: W, L: 9.75 });
  rel(phi, 86.574, 1e-4, 'biais mécanique');
  rel(Le[0] * Math.sin(phi * Math.PI / 200), 8.818, 5e-4, 'portée droite équivalente');
});

test('PSIDA.EL — coefficients K de Guyon-Massonnet (ν = 0, θ = 0,44) aux fibres −3,96 / −3,00 / 0', () => {
  // extraits des lignes d'influence de la page 18 (pas 0,125 m depuis −4,00 m), e clampé à la largeur équivalente
  const REF = {
    [-B]: [[0, 1.9199], [8, 1.6138], [16, 1.3345], [24, 1.0955], [32, 0.9001], [40, 0.7456], [48, 0.6261], [56, 0.5329], [64, 0.4544]],
    [-3]: [[0, 1.6200], [8, 1.4715], [16, 1.2949], [24, 1.1131], [32, 0.9478], [40, 0.8083], [48, 0.6958], [56, 0.6060], [64, 0.5297]],
    [0]: [[0, 0.8980], [8, 0.9478], [16, 1.0020], [24, 1.0534], [32, 1.0790], [40, 1.0534], [48, 1.0020]],
  };
  for (const [y, pts] of Object.entries(REF)) for (const [i, r] of pts) {
    const e = Math.max(-B, Math.min(B, -4 + 0.125 * i));
    rel(coefK({ b: B, L: 9.017, e, y: +y, nu: 0 }), r, 8e-3, `K(y = ${(+y).toFixed(2)}, e = ${e.toFixed(3)})`);
  }
});

test('PSIDA.EL — charges Fascicule 61 : δ, coefficients de répartition, moments A / B / Mc120 / trottoirs', () => {
  // δ du système B (S = Bc 2 files × 1,1, fenêtre glissante) et de Mc120 avec G = g min × (L + about) : 1,201 / 1,238 (calculs manuels p. 22)
  const S1 = Math.max(2 * 1.1 * maxAxleLoadOnLength(BC.axlesTwoTrucks, 9.75), 2 * maxAxleLoadOnLength(BT.axles, 9.75));
  assert.equal(maxAxleLoadOnLength(BC.axlesTwoTrucks, 13.93), 540, '54 t de Bc sur 13,93 m');
  assert.ok(Math.abs(deltaDyn(9.75, 128.64 * 10.1, S1) - 1.201) < 3e-3, 'δB travée 1');
  assert.ok(Math.abs(deltaDyn(9.75, 128.64 * 10.1, 1100) - 1.238) < 3e-3, 'δMc travée 1');

  const deck = new SlabDeck({ spans: SPANS, overhangs: [0.35, 0.35], width: W, h: 0.52, area: 4.1256,
    roadway: { y1: -3, y2: 3 }, footways: [{ y1: -B, y2: -3 }, { y1: 3, y2: B }],
    bands: [{ q: 42.5 / W, y1: -B, y2: B, kmin: 0.6, kmax: 1.0, label: 'QSUP' }],
    leqMethod: 'fleches', nu: 0, nGrid: 100, ys: Array.from({ length: 17 }, (_, i) => -B + W * i / 16) });
  // convention SETRA par défaut : K et δ de la travée porteuse ; G de δ = ½(G min + G max)·L
  const f = deck.fascicule61({ classe: 1, nRetenue: 0 });
  rel(f.deltaBc[0], 1.201, 1e-3, 'δB travée 1 (défaut)'); rel(f.deltaMc[0], 1.238, 1e-3, 'δMc travée 1 (défaut)');
  assert.equal(f.nv, 2); assert.equal(f.v, 3);
  const s04 = deck.beam.sectionIndex(0, 0.4), P1 = deck.beam.supportSectionIndex(1), s25 = deck.beam.sectionIndex(1, 0.5);
  // coefficients de répartition de la travée (convention « section » : K = max_y m_x / (M/2b) d'une seule travée)
  const fS = deck.fascicule61({ classe: 1, nRetenue: 0, convention: 'section' });
  const K = r => deck.transverseFactors(r).K;
  const KA = K(fS.A), KBc = K(fS.Bc), KBt = K(fS.Bt), KMc = K(fS.Mc120), KT = K(fS.trottoir);
  // coefficients correctifs travée 1 (récapitulation p. 20 ; Bc hors bc = 1,157 / 1,1)
  rel(KA[s04], 1.024, 3e-3, 'K A'); rel(KBc[s04], 1.157 / 1.1, 5e-3, 'K Bc'); rel(KBt[s04], 1.023, 3e-3, 'K Bt');
  rel(KMc[s04], 1.127, 5e-3, 'K Mc120'); rel(KT[s04], 1.129, 5e-3, 'K trottoirs');
  // moment de la note = Σ_travées K_j·δ_j·M_j = max_y m_x(y)·2b
  const MK = (r, k, s, w = 'Mmax') => (w === 'Mmax' ? Math.max(...r.mxMax[s]) : Math.min(...r.mxMin[s])) * W / 10;
  // A(l) : 0,4 L travée 1, appui 2, 0,5 L travée 2
  rel(MK(f.A, KA, s04), 125.46, 3e-3, 'A 0,4 L'); rel(MK(f.A, KA, P1, 'Mmin'), -146.54, 3e-3, 'A appui 2'); rel(MK(f.A, KA, s25), 155.68, 3e-3, 'A 0,5 L travée 2');
  // B = max(Bc, Bt) en travée (Bt gouverne), Bc sur appui
  rel(Math.max(MK(f.Bc, KBc, s04), MK(f.Bt, KBt, s04)), 138.20, 6e-3, 'B 0,4 L');
  rel(Math.max(MK(f.Bc, KBc, s25), MK(f.Bt, KBt, s25)), 155.03, 8e-3, 'B 0,5 L travée 2');
  rel(Math.min(MK(f.Bc, KBc, P1, 'Mmin'), MK(f.Bt, KBt, P1, 'Mmin')), -151.50, 2e-2, 'B appui 2');
  // Mc120 (convoi) en travée et sur appui (K et δ de la travée porteuse ; en convention « section » : +6 %)
  rel(MK(f.Mc120, KMc, s04), 204.11, 6e-3, 'Mc120 0,4 L'); rel(MK(f.Mc120, KMc, s25), 232.61, 6e-3, 'Mc120 0,5 L travée 2');
  const mcP1 = MK(f.Mc120, KMc, P1, 'Mmin');
  rel(mcP1, -169.90, 1e-2, 'Mc120 appui 2');
  assert.ok(MK(fS.Mc120, KMc, P1, 'Mmin') < mcP1, 'convention « section » plus défavorable sur appui');
  // trottoirs : la note charge 1,00 m de trottoir réel, l'outil 0,9565 m de largeur équivalente → −4 %
  rel(MK(f.trottoir, KT, s04), 3.52 * 0.9565, 2e-2, 'trottoirs 0,4 L (largeur équivalente)');
  // combinaison ELU sur appui 2 (1,125 × [1,2 (G + tassements) + 1,42 B + 1,42 trottoirs]) : −595,81 t·m
  const T = 50.14, Gm = 1.35 * (G_MAX * deck.beam.uniformLoad(1).M[P1] - T);
  const elu = Gm + Math.min(1.6 * MK(f.A, KA, P1, 'Mmin'), 1.6 * MK(f.Bc, KBc, P1, 'Mmin'), 1.35 * mcP1) + 1.6 * MK(f.trottoir, KT, P1, 'Mmin');
  rel(elu, -595.81, 1e-2, 'ELU appui 2');
  // section d'acier correspondante (fc28 = 30,6 MPa, fe = 400 MPa, groupes de 3 HA25 : d = 0,52 − 0,025 − 1,5 × 0,025)
  const As = flexureELU(595.81 / 100, { b: W, d: 0.52 - 0.025 - 0.0375 }, materialsBAEL({ fc28: 30.6, fe: 400 })).As;
  rel(As, 0.0425, 5e-3, 'A_s ELU appui 2 [m²]');
});

test('PSIDA.EL — flexion transversale : coefficient μ (ν = 0,2) et MY sous A(l) (ν = 0, béton fissuré)', () => {
  const b = 8.092 / 2, L = 8.818;
  const mu = (n, e, y, nu) => { const h = plateHarmonic({ b, L, n, e, nu }); return -(h.d2(y) - nu * h.k * h.k * h.Y(y)) / b; };
  rel(mu(1, 0, 0, 0.2), 0.1848, 2e-3, 'μ1 axe'); rel(mu(3, 0, 0, 0.2), 0.0692, 5e-3, 'μ3 axe'); rel(mu(5, 0, 0, 0.2), 0.0416, 5e-3, 'μ5 axe');
  rel(mu(1, -2, -1.978, 0.2), 0.1606, 2e-2, 'μ1 fibre 2');
  // facteurs d'étalement longitudinal (harmonique 1, rapportés à la portée biaise 9,017 m) : Bc 0,970 sur 2,43 m, Mc120 0,783 sur 6,78 m
  const fac = c => Math.sin(Math.PI * c / (2 * 9.017)) / (Math.PI * c / (2 * 9.017));
  rel(fac(2.43), 0.970, 1e-3, 'Bc'); rel(fac(6.78), 0.783, 2e-3, 'Mc120');
  // MY sous A(l) à l'axe, travée 1 : 1,470 t·m/m (ν = 0, dalle droite équivalente 8,818 × 8,092, chaussée 6/sin φ)
  const half = 3 / Math.sin(86.574 * Math.PI / 200);
  const deck = new SlabDeck({ spans: SPANS, width: 8.092, h: 0.52, roadway: { y1: -half, y2: half }, Leq: [8.818, 11.29, 11.29, 8.818], nu: 0, ys: [0, -1.978] });
  const r = new TransverseModel(deck, { tRev: 0.08, nHarm: 25 }).fascicule61(0, { classe: 1, G: 128.64 * 10.1 / 9.75 });
  rel(r.A.myMax[0] / 10, 1.470, 1e-2, 'MY A axe'); rel(r.A.myMax[1] / 10, 1.886, 2e-2, 'MY A fibre 2');
  // même calcul par la transformation automatique de l'outil (dalle droite équivalente au biais mécanique, ψ = 80 gr)
  const deckS = new SlabDeck({ spans: SPANS, overhangs: [0.35, 0.35], width: W, h: 0.52, roadway: { y1: -3, y2: 3 }, leqMethod: 'fleches', nu: 0, psi: 80, ys: [0, -1.978 * Math.sin(86.574 * Math.PI / 200)] });
  const tS = new TransverseModel(deckS, { tRev: 0.08, nHarm: 25, skewEquivalent: true });
  rel(tS.sinPhi[0], Math.sin(86.574 * Math.PI / 200), 1e-6, 'sin φ_mec travée 1');
  rel(tS.fascicule61(0, { classe: 1 }).A.myMax[0] / 10, 1.470, 1e-2, 'MY A axe (transformation automatique)');
});
