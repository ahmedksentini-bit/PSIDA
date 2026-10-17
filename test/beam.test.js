import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousBeam } from '../src/beam.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} attendu ${b}, obtenu ${a}`);

test('travée isostatique : PL/4 à mi-portée, réactions P/2', () => {
  const bm = new ContinuousBeam([10]);
  const sMid = bm.sectionIndex(0, 0.5);
  const pMid = bm.positions.findIndex(p => Math.abs(p.x - 5) < 1e-9);
  close(bm.ILM[sMid][pMid], 2.5, 1e-9, 'M mi-portée');
  close(bm.ILR[0][pMid], 0.5, 1e-9, 'R0');
  close(bm.ILR[1][pMid], 0.5, 1e-9, 'R1');
  // tranchant : +1/2 à gauche de la charge, -1/2 à droite
  close(bm.ILVm[sMid][pMid], 0.5, 1e-9, 'V- à la charge');
  close(bm.ILVp[sMid][pMid], -0.5, 1e-9, 'V+ à la charge');
  // charge sur appui : réaction 1
  close(bm.ILR[0][0], 1, 1e-9, 'R0 charge sur appui');
  close(bm.ILR[1][bm.positions.length - 1], 1, 1e-9, 'R1 charge sur appui final');
});

test('2 travées égales sous charge uniforme : M appui = -qL²/8, M travée max = 9/128 qL²', () => {
  const L = 12, q = 1;
  const bm = new ContinuousBeam([L, L], { nGrid: 200, nSec: 40 });
  const { M, R } = bm.uniformLoad(q);
  const sSup = bm.supportSectionIndex(1);
  close(M[sSup], -q * L * L / 8, 1e-3 * q * L * L, 'M appui central');
  const sMax = bm.sectionIndex(0, 3 / 8);
  close(M[sMax], 9 / 128 * q * L * L, 2e-3 * q * L * L, 'M max travée (3L/8)');
  close(R[1], 10 / 8 * q * L, 1e-3 * q * L, 'R centrale = 5qL/4');
  close(R[0], 3 / 8 * q * L, 1e-3 * q * L, 'R rive = 3qL/8');
  close(R[0] + R[1] + R[2], 2 * q * L, 1e-6, 'équilibre vertical');
});

test('3 travées égales sous charge uniforme : M appuis = -qL²/10', () => {
  const L = 10, q = 2;
  const bm = new ContinuousBeam([L, L, L], { nGrid: 200 });
  const { M, R } = bm.uniformLoad(q);
  close(M[bm.supportSectionIndex(1)], -q * L * L / 10, 1e-3 * q * L * L, 'M appui 1');
  close(M[bm.supportSectionIndex(2)], -q * L * L / 10, 1e-3 * q * L * L, 'M appui 2');
  close(M[bm.sectionIndex(0, 0.4)], 0.08 * q * L * L, 2e-3 * q * L * L, 'M travée de rive (0.4L)');
  close(M[bm.sectionIndex(1, 0.5)], 0.025 * q * L * L, 2e-3 * q * L * L, 'M travée centrale');
  close(R.reduce((a, c) => a + c, 0), 3 * q * L, 1e-6, 'équilibre vertical');
});

test('enveloppe UDL sur zones défavorables (2 travées) : M travée max = 0.0957 qL² (une travée chargée)', () => {
  const L = 10, q = 1;
  const bm = new ContinuousBeam([L, L], { nGrid: 200, nSec: 40 });
  // une seule travée chargée : M appui = -qL²/16, M max en travée chargée ≈ 0.0957 qL² à 0.4375 L
  const s = bm.sectionIndex(0, 0.4375);
  const env = bm.udlEnvelope(bm.ILM[s], q);
  close(env.max, 0.09570 * q * L * L, 1e-3 * q * L * L, 'M max');
  const sup = bm.supportSectionIndex(1);
  const envS = bm.udlEnvelope(bm.ILM[sup], q);
  close(envS.min, -q * L * L / 8, 1e-3 * q * L * L, 'M min appui (deux travées chargées)');
  close(envS.max, 0, 1e-9, 'M max appui = 0');
  // enveloppe par travées entières avec q constant → même résultat
  const envT = bm.spanwiseEnvelope(bm.ILM[sup], () => q);
  close(envT.min, -q * L * L / 8, 1e-3 * q * L * L, 'M min appui (travées entières)');
  assert.deepEqual(envT.spansMin, [0, 1]);
});

test('convoi glissant : tandem 2×P espacé 1,2 m sur travée isostatique', () => {
  const L = 10, P = 150;
  const bm = new ContinuousBeam([L], { nGrid: 200, nSec: 40 });
  const s = bm.sectionIndex(0, 0.5);
  const env = bm.axleEnvelope(bm.ILM[s], [{ d: 0, P }, { d: 1.2, P }], { step: 0.01 });
  // M max à mi-portée : essieu à mi-portée + 2e essieu à 1,2 m → P(L/4) + P·(L/2−1.2)/2
  const expected = P * L / 4 + P * (L / 2 - 1.2) * (L / 2) / L;
  close(env.max, expected, 1e-6 * expected + 1e-6, 'M max tandem');
  const rEnv = bm.axleEnvelope(bm.ILR[0], [{ d: 0, P }, { d: 1.2, P }], { step: 0.01 });
  close(rEnv.max, P + P * (L - 1.2) / L, 1e-6 * P, 'R max tandem');
});

test('portées équivalentes (travée seule chargée, « méthode des moments » CHAMOA)', () => {
  const bm = new ContinuousBeam([10, 10, 10], { nGrid: 200, nSec: 20 });
  const Leq = bm.equivalentSpans();
  // 3 travées égales : travée de rive seule chargée → M_B = −qL²/15, zéro à 13L/15 ; travée centrale seule
  // chargée → M_B = M_C = −qL²/20, zéros à L(1 ± √0,6)/2 → distance 0,7746 L
  close(Leq[0], 10 * 13 / 15, 2e-3, 'Leq rive');
  close(Leq[1], 10 * Math.sqrt(0.6), 2e-3, 'Leq centrale');
  close(Leq[2], 10 * 13 / 15, 2e-3, 'Leq rive');
  // exemple CHAMOA-PSIDA : 10-15-15-10 m, abouts 0,50 m → 8,9118 / 11,1862
  const b2 = new ContinuousBeam([10, 15, 15, 10], { nGrid: 100, nSec: 20, overhangs: [0.5, 0.5] });
  const L2 = b2.equivalentSpans();
  close(L2[0], 8.9118, 2e-3, 'Leq CHAMOA travée 1'); close(L2[1], 11.1862, 2e-3, 'Leq CHAMOA travée 2');
});
