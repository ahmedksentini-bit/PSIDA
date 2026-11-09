/**
 * Renfort des tests de la poutre continue (src/beam.js), campagne de mutation : cas limites comparés à des solutions
 * exactes de la résistance des matériaux (formule des trois moments de Clapeyron avec rigidités par travée, poutre
 * console, courbure et tassement imposés obtenus par superposition sur la poutre isostatique de 2L, ligne d'influence
 * du moment sur appui). Aucune valeur n'est recopiée d'une sortie de PSIDA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousBeam } from '../src/beam.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} : attendu ${b}, obtenu ${a}`);

test('deux travées inégales, rigidités différentes, charge uniforme : M sur appui = trois moments (Clapeyron)', () => {
  const L1 = 10, L2 = 15, E1 = 1, E2 = 2.5, q = 3;
  const bm = new ContinuousBeam([L1, L2], { EI: [E1, E2], nGrid: 400, nSec: 40 });
  const { M, R } = bm.uniformLoad(q);
  // 2 M1 (L1/E1 + L2/E2) = −q/4 (L1³/E1 + L2³/E2)
  const M1 = -q * (L1 ** 3 / E1 + L2 ** 3 / E2) / (8 * (L1 / E1 + L2 / E2));
  close(M[bm.supportSectionIndex(1)], M1, 1e-4 * Math.abs(M1), 'M appui 1');
  close(R[0], q * L1 / 2 + M1 / L1, 1e-4 * q * L1, 'R0 = qL1/2 + M1/L1');
  close(R[2], q * L2 / 2 + M1 / L2, 1e-4 * q * L2, 'R2 = qL2/2 + M1/L2');
  close(R[0] + R[1] + R[2], q * (L1 + L2), 1e-6, 'équilibre');
  // moment en travée 2 à mi-portée : qL²/8 + M1/2
  close(M[bm.sectionIndex(1, 0.5)], q * L2 * L2 / 8 + M1 / 2, 1e-4 * q * L2 * L2, 'M mi-travée 2');
});

test('charge ponctuelle à mi-travée d\'une poutre à deux travées égales : M_B = −3PL/32, réactions 13/32, 22/32, −3/32', () => {
  const L = 12, bm = new ContinuousBeam([L, L], { nGrid: 100 });
  const p = bm.positions.findIndex(q => Math.abs(q.x - L / 2) < 1e-9);
  close(bm.ILM[bm.supportSectionIndex(1)][p], -3 * L / 32, 1e-9, 'M_B');
  close(bm.ILR[0][p], 13 / 32, 1e-9, 'R_A'); close(bm.ILR[1][p], 22 / 32, 1e-9, 'R_B'); close(bm.ILR[2][p], -3 / 32, 1e-9, 'R_C');
  // moment sous la charge : 13/32 · L/2
  close(bm.ILM[bm.sectionIndex(0, 0.5)][p], 13 / 64 * L, 1e-9, 'M sous la charge');
  // même résultat par endMomentsPoint (moments d'extrémité)
  const em = bm.endMomentsPoint(0, L / 2, 1);
  close(em.ML[0], -3 * L / 32, 1e-12, 'ML travée 1'); close(em.M0[1], -3 * L / 32, 1e-12, 'M0 travée 2'); close(em.M0[0], 0, 1e-12, 'M0 rive');
});

test('ligne d\'influence du moment sur appui (deux travées égales) : M_B(a) = −a(L² − a²)/(4L²), extremum −L/(6√3) en a = L/√3', () => {
  const L = 10, bm = new ContinuousBeam([L, L], { nGrid: 200 }), s = bm.supportSectionIndex(1);
  for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const a = f * L, p = bm.positions.findIndex(q => Math.abs(q.x - a) < 1e-9), p2 = bm.positions.findIndex(q => Math.abs(q.x - (2 * L - a)) < 1e-9);
    close(bm.ILM[s][p], -a * (L * L - a * a) / (4 * L * L), 1e-9, `M_B, charge en ${a}`);
    close(bm.ILM[s][p2], bm.ILM[s][p], 1e-9, 'symétrie');
  }
  const env = bm.axleEnvelope(bm.ILM[s], [{ d: 0, P: 100 }], { step: 0.01 });
  close(env.min, -100 * L / (6 * Math.sqrt(3)), 1e-4 * 100 * L, 'essieu seul : M_B min');
  close(env.max, 0, 1e-9, 'M_B max');
});

test('abouts : charge au bout de la console (c) → M sur l\'appui de rive = −c, M sur l\'appui intermédiaire = +c/4 (deux travées égales)', () => {
  const L = 10, c = 0.8, bm = new ContinuousBeam([L, L], { nGrid: 100, overhangs: [c, 0] });
  const p = bm.positions.findIndex(q => Math.abs(q.x + c) < 1e-9);
  assert.ok(p >= 0, 'position au bout de l\'about');
  close(bm.ILM[bm.supportSectionIndex(0)][p], -c, 1e-9, 'M appui 0');
  close(bm.ILM[bm.supportSectionIndex(1)][p], c / 4, 1e-9, 'M appui 1 (M0 L + 4 M1 L = 0)');
  // réactions : travée 1 avec M0 = −c, M1 = c/4 → R0 = 1 + (M1 − M0)/L ; R2 = M1/L ; R1 = −(R0 + R2) + 1
  const R0 = 1 + (c / 4 + c) / L, R2 = c / 4 / L;
  close(bm.ILR[0][p], R0, 1e-9, 'R0'); close(bm.ILR[2][p], R2, 1e-9, 'R2'); close(bm.ILR[1][p], 1 - R0 - R2, 1e-9, 'R1');
  // charge permanente avec about : M appui 0 = −g c²/2, et le moment gagne c²/8 sur l'appui intermédiaire
  const g = 2, bm2 = new ContinuousBeam([L, L], { nGrid: 400, overhangs: [c, c] }), U = bm2.uniformLoad(g);
  close(U.M[bm2.supportSectionIndex(0)], -g * c * c / 2, 1e-6, 'M appui 0 sous g');
  close(U.M[bm2.supportSectionIndex(1)], -g * L * L / 8 + g * c * c / 4, 1e-4 * g * L * L, 'M_B = −gL²/8 + 2 × gc²/8');
  close(U.R.reduce((a, r) => a + r, 0), g * (2 * L + 2 * c), 1e-6, 'équilibre, abouts compris');
});

test('courbure imposée et tassement d\'appui (deux travées égales) : M_B = 3EIκ/2 et 3EIδ/L² (superposition sur la poutre de 2L)', () => {
  const L = 14, EI = 2.4e6, kappa = 1e-5, delta = 0.01, bm = new ContinuousBeam([L, L], { nSec: 20 });
  // poutre libre de 2L courbée de κ : flèche relative au milieu κ(2L)²/8 = κL²/2 ; force rendant la flèche nulle
  // R = 48 EI (κL²/2)/(2L)³ = 3EIκ/L ; moment au milieu R·2L/4 = 3EIκ/2 (fibre inférieure tendue, voir thermalCurvature)
  const T = bm.thermalCurvature(kappa, [EI, EI]);
  close(T.M[bm.supportSectionIndex(1)], 1.5 * EI * kappa, 1e-9 * EI * kappa, 'gradient');
  close(T.M[bm.supportSectionIndex(0)], 0, 1e-9, 'appui de rive');
  close(T.R[1], -3 * EI * kappa / L, 1e-9 * EI * kappa, 'R_B = −3EIκ/L');
  // tassement δ de l'appui central : force équivalente 48 EI δ/(2L)³ = 6EIδ/L³ vers le bas, M_B = 3EIδ/L² (> 0)
  const S = bm.settlement([0, delta, 0], [EI, EI]);
  close(S.M[bm.supportSectionIndex(1)], 3 * EI * delta / (L * L), 1e-9 * EI, 'tassement central');
  close(S.R[1], -6 * EI * delta / L ** 3, 1e-9 * EI, 'R_B = −6EIδ/L³');
  // tassement d'un appui de rive : moitié de l'effet sur l'appui central, de signe opposé (rotation de corde)
  const S0 = bm.settlement([delta, 0, 0], [EI, EI]);
  close(S0.M[bm.supportSectionIndex(1)], -1.5 * EI * delta / (L * L), 1e-9 * EI, 'tassement de rive');
});

test('charge répartie de longueur finie et charges SW : maximum à mi-portée d\'une travée isostatique', () => {
  const L = 20, q = 10, c = 6.1, bm = new ContinuousBeam([L], { nGrid: 400, nSec: 20 }), s = bm.sectionIndex(0, 0.5);
  // chenille centrée : M = q c L/4 − q c²/8
  close(bm.stripEnvelope(bm.ILM[s], q, c, { step: 0.01 }).max, q * c * L / 4 - q * c * c / 8, 1e-3 * q * L * L, 'chenille');
  // SW : deux charges q de longueur a séparées de c, la travée de 20 m ne porte que l'intervalle central
  const a = 15, cc = 5.3, sw = bm.swEnvelope(bm.ILM[s], { q, a, c: cc }, { step: 0.01 });
  // deux placements candidats : une seule charge de 15 m centrée (q a L/4 − q a²/8), ou les deux charges de part et
  // d'autre de la mi-portée, l'intervalle libre centré (qL²/8 − q c²/8)
  close(sw.max, Math.max(q * a * L / 4 - q * a * a / 8, q * L * L / 8 - q * cc * cc / 8), 1e-3 * q * L * L, 'SW max');
  // effort tranchant à l'appui : charge uniforme complète → qL/2
  close(bm.udlEnvelope(bm.ILVp[bm.sectionIndex(0, 0)], q).max, q * L / 2, 1e-6 * q * L, 'V appui');
});

test('portée équivalente « flèches » (PSIDA.EL) : trois travées égales, travée de rive chargée seule', () => {
  const L = 10, bm = new ContinuousBeam([L, L, L], { nGrid: 300 }), Leq = bm.equivalentSpans('fleches');
  // M_B = −qL²/15 (travée de rive seule chargée) ; flèche à mi-travée 5L⁴/384 + (0 + M_B) L²/16 ; travée isostatique équivalente
  const w = 5 * L ** 4 / 384 - L ** 4 / 15 / 16;
  close(Leq[0], (384 * w / 5) ** 0.25, 2e-3, 'Leq rive');
  close(Leq[2], Leq[0], 1e-9, 'symétrie');
  // travée centrale seule chargée : M_B = M_C = −qL²/20
  close(Leq[1], (384 * (5 * L ** 4 / 384 - 2 * L ** 4 / 20 / 16) / 5) ** 0.25, 2e-3, 'Leq centrale');
  assert.deepEqual(new ContinuousBeam([L]).equivalentSpans('fleches'), [L]);
});

test('enveloppe par travées entières, intensité fonction de la longueur chargée : trois travées égales, M à 0,4 L de rive', () => {
  const L = 10, bm = new ContinuousBeam([L, L, L], { nGrid: 200, nSec: 20 }), s = bm.sectionIndex(0, 0.4);
  // travées 1 et 3 chargées (q constant) : M_B = M_C = −qL²/20 → M(0,4L) = q·0,4L·0,6L/2 − 0,4 qL²/20 = 0,1 qL²
  const env = bm.spanwiseEnvelope(bm.ILM[s], () => 1);
  close(env.max, 0.1 * L * L, 1e-3 * L * L, 'max (travées 1 et 3)');
  assert.deepEqual(env.spansMax, [0, 2]);
  // intensité décroissante avec la longueur chargée, q(l) = 200/l : charger la seule travée 1 (q = 20) l'emporte
  // M(0,4L) travée 1 seule : M_B = −qL²/15, M_C = +qL²/60 → 0,12 qL² − 0,4 qL²/15 = 0,09333 qL²
  const env2 = bm.spanwiseEnvelope(bm.ILM[s], l => 200 / l);
  close(env2.max, 20 * 0.0933333 * L * L, 1e-3 * 20 * L * L, 'max avec q(l)');
  assert.deepEqual(env2.spansMax, [0]);
  close(env2.partsMax.reduce((a, v) => a + v, 0), env2.max, 1e-9 * L * L, 'ventilation par travée');
  // moment sur appui B, travées 1 et 2 chargées (Clapeyron : 4M_B + M_C = −qL²/2 ; M_B + 4M_C = −qL²/4) : M_B = −7qL²/60
  const envB = bm.spanwiseEnvelope(bm.ILM[bm.supportSectionIndex(1)], () => 1);
  close(envB.min, -7 / 60 * L * L, 1e-3 * L * L, 'M_B min (travées 1, 2 ; travée 3 soulage)');
  assert.deepEqual(envB.spansMin, [0, 1]);
});

test('intégrales partielles de ligne d\'influence et zones de signe : bornes hors grille (réaction d\'une travée isostatique)', () => {
  const L = 10, bm = new ContinuousBeam([L], { nGrid: 20 }), il = bm.ILR[0];   // ligne 1 − x/L
  const I = (a, b) => (b - a) - (b * b - a * a) / (2 * L);
  close(bm.integrateIL(il, 1.23, 7.77), I(1.23, 7.77), 1e-12, 'intégrale partielle');
  close(bm.integrateIL(il, -5, 20), L / 2, 1e-12, 'bornes au-delà de l\'ouvrage');
  close(bm.integrateIL(il, 0, L, -1), 0, 1e-12, 'partie négative nulle');
  // ventilation par travée sur deux travées : M_B, partie négative = somme des deux travées
  const b2 = new ContinuousBeam([L, 2 * L], { nGrid: 100 }), s = b2.supportSectionIndex(1);
  const parts = b2.integrateByspan(b2.ILM[s], b2.xMin, b2.xMax, -1), tot = b2.integrateIL(b2.ILM[s], b2.xMin, b2.xMax, -1);
  close(parts[0] + parts[1], tot, 1e-9, 'Σ des parties');
  // M_B sous q = 1 sur la seule travée 2 (2L) : Clapeyron 2 M_B (L + 2L) = −(2L)³/4 → M_B = −(2L)³/(24 L)
  close(parts[1], -((2 * L) ** 3) / (24 * L), 1e-3 * L * L, 'travée 2 seule');
  assert.equal(b2.spanOf(-0.1), 0); assert.equal(b2.spanOf(L), 1); assert.equal(b2.spanOf(3 * L + 1), 1);
});

test('ligne d\'influence de l\'effort tranchant : saut unité au droit de la section, valeurs exactes de part et d\'autre', () => {
  const L = 10, bm = new ContinuousBeam([L], { nGrid: 100, nSec: 10 }), s = bm.sectionIndex(0, 0.3), xs = 0.3 * L;
  // V juste à droite de la section (ILVp) : charge à gauche → −x/L ; charge à droite → 1 − x/L
  close(bm.ilAt(bm.ILVp[s], xs - 0.05), -(xs - 0.05) / L, 1e-9, 'charge juste à gauche');
  close(bm.ilAt(bm.ILVp[s], xs + 0.05), 1 - (xs + 0.05) / L, 1e-9, 'charge juste à droite');
  close(bm.ilAt(bm.ILVp[s], 2.43), -0.243, 1e-9, 'hors grille, à gauche');
  // essieu glissant : V max à droite de la section = 1 − 0,3 = 0,7 P
  close(bm.axleEnvelope(bm.ILVp[s], [{ d: 0, P: 1 }], { step: 0.01 }).max, 0.7, 2e-3, 'V max');
  close(bm.axleEnvelope(bm.ILVp[s], [{ d: 0, P: 1 }], { step: 0.01 }).min, -0.3, 2e-3, 'V min');
});

test('about de droite : charge au bout → M sur le dernier appui = −c ; file de véhicules à espacement libre (programmation dynamique)', () => {
  const L = 10, c = 0.6, bm = new ContinuousBeam([L, L], { nGrid: 100, overhangs: [0, c] });
  const p = bm.positions.length - 1;
  close(bm.positions[p].x, 2 * L + c, 1e-12, 'dernière position');
  close(bm.ILM[bm.supportSectionIndex(2)][p], -c, 1e-9, 'M dernier appui');
  close(bm.ILM[bm.supportSectionIndex(1)][p], c / 4, 1e-9, 'M appui central');
  // deux charges unité espacées d'au moins 10 m sur deux travées de 10 m : sans contrainte, chacune irait en L/√3 de
  // l'appui de rive (espacement 2L − 2L/√3 = 8,45 m < 10) ; l'espacement minimal est donc actif : charges en a et a + 10,
  // M_B(a) = −[a(L² − a²) + (10 − a)(L² − (10 − a)²)]/(4L²), extremum en a = 5 → −2·5·75/400 = −1,875
  const b2 = new ContinuousBeam([L, L], { nGrid: 200 }), s = b2.supportSectionIndex(1);
  const tr = b2.trainEnvelope(b2.ILM[s], [{ d: 0, P: 1 }], { nVeh: 2, pitch: 10, step: 0.01 });
  close(tr.min, -2 * 5 * 75 / 400, 1e-3, 'deux véhicules, espacement minimal actif');
  // espacement minimal de 8 m : non actif, chaque charge à son extremum
  const tr8 = b2.trainEnvelope(b2.ILM[s], [{ d: 0, P: 1 }], { nVeh: 2, pitch: 8, step: 0.01 });
  close(tr8.min, -2 * L / (6 * Math.sqrt(3)), 2e-3, 'deux véhicules, espacement libre');
  assert.ok(Math.abs(tr.posMin[1] - tr.posMin[0]) >= 10 - 1e-6, `espacement ${tr.posMin}`);
  // pas minimal plus grand que l'ouvrage : un seul véhicule utile
  const tr1 = b2.trainEnvelope(b2.ILM[s], [{ d: 0, P: 1 }], { nVeh: 2, pitch: 25, step: 0.01 });
  close(tr1.min, -L / (6 * Math.sqrt(3)), 2e-3, 'un seul véhicule utile');
  // M en travée : max positif d'un essieu en 0,4 L = 0,4 L·(… ) borné par la travée isostatique L/4
  const m = b2.trainEnvelope(b2.ILM[b2.sectionIndex(0, 0.5)], [{ d: 0, P: 1 }], { nVeh: 1, pitch: 10, step: 0.01 });
  close(m.max, b2.ILM[b2.sectionIndex(0, 0.5)][b2.positions.findIndex(q => Math.abs(q.x - L / 2) < 1e-9)], 2e-3, 'un véhicule = ligne d\'influence au droit');
});
