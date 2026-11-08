/**
 * Renfort des tests (campagne de mutation, docs/validation/mutation.md) : assemblage du dimensionnement de src/design.js
 * sur l'exemple par défaut — effort tranchant (EC2 6.2.2 / 6.2.3, BAEL A.5.1), poinçonnement, minimums transversaux et
 * valeurs par défaut des options — recalculé à partir des efforts du calcul, indépendamment de design.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { designEC, designBAEL } from '../src/design.js';
import { punching } from '../src/section_ec2.js';
import { punchingBAEL } from '../src/section_bael.js';

const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg} : attendu ${b}, obtenu ${a}`);
const st = compute(parseData(formDefaults()));
const { deck, perm, ec, f61 } = st;
const mat = { fck: 30, fyk: 500, fc28: 30, fe: 500, fissuration: 'FP' };

test('EC : valeurs par défaut des options (c = 0,03, φ = 0,020, wk = 0,3 mm, t_rev = 0,08, k_dalle = 1,2)', () => {
  const D0 = designEC(deck, perm, ec, mat), D1 = designEC(deck, perm, ec, { ...mat, c: 0.03, phi: 0.020, wkMax: 0.3, tRev: 0.08, kSlab: 1.2 });
  proche(D0.d, deck.h - 0.03, 1e-12, 'd = h − c');
  assert.deepEqual(D0.envBot, D1.envBot); assert.deepEqual(D0.envTop, D1.envTop);
  assert.deepEqual(D0.punch, D1.punch); assert.deepEqual(D0.mins, D1.mins);
  const B0 = designBAEL(deck, perm, f61, mat), B1 = designBAEL(deck, perm, f61, { ...mat, c: 0.03, tRev: 0.08 });
  proche(B0.d, deck.h - 0.03, 1e-12, 'd BAEL'); assert.deepEqual(B0.envBot, B1.envBot); assert.deepEqual(B0.punch, B1.punch);
});

test('EC : V_Ed = (1,35 V_G + 1,35 K V_Q)/2b, V_Rd,max = z ν₁ f_cd/2, A_sw/s = V_Ed/(z f_ywd)', () => {
  const D = st.design.EC, K = deck.transverseFactors(ec.LM1).K;
  for (const s of [0, 3, Math.floor(D.shear.length / 2), D.shear.length - 1]) {
    const vG = Math.max(Math.abs(perm.Vm[s]), Math.abs(perm.Vp[s]));
    const vQ = Math.max(Math.abs(Math.max(ec.gr1a.Vmax[s], ec.gr1b.Vmax[s])), Math.abs(Math.min(ec.gr1a.Vmin[s], ec.gr1b.Vmin[s])));
    const VEd = (1.35 * vG + 1.35 * (K[s] || 1) * vQ) / (2 * deck.b) / 1000;
    const r = D.shear[s], z = 0.9 * D.d;
    proche(r.VEd, VEd, 1e-12, `V_Ed section ${s}`);
    proche(r.VRdmax, z * 0.6 * (1 - D.mat.fck / 250) * D.mat.fcd / 2, 1e-12, `V_Rd,max section ${s}`);
    proche(r.ratio, r.VEd / r.VRdc, 1e-12, 'taux');
    proche(r.AswS, r.VEd > r.VRdc ? r.VEd / (z * D.mat.fyd) : 0, 1e-12, 'A_sw/s');
    assert.equal(r.okMax, r.VEd <= r.VRdmax);
  }
  // un cas où des étriers sont nécessaires : effort tranchant forcé (V_G × 20)
  const permX = { ...perm, Vm: perm.Vm.map(v => 20 * v), Vp: perm.Vp.map(v => 20 * v) };
  const X = designEC(deck, permX, ec, mat), s = 0, z = 0.9 * X.d;
  assert.ok(X.shear[s].VEd > X.shear[s].VRdc);
  proche(X.shear[s].AswS, X.shear[s].VEd / (z * X.mat.fyd), 1e-12, 'étriers');
});

test('EC : poinçonnement sous la roue LM1 (α_Q1 300/2, 0,40 × 0,40) et LM2 (β_Q 400/2, 0,35 × 0,60), γ = 1,35', () => {
  const D = st.design.EC, AsP = Math.max(...D.envBot), tRev = st.p.mat.tRev;
  assert.deepEqual(D.punch.LM1, punching({ Q: 1.35 * ec.lm1.lanes[0].Q / 2 / 1000, a: 0.4, bb: 0.4, tRev, h: D.h, d: D.d, As: AsP }, D.mat));
  assert.deepEqual(D.punch.LM2, punching({ Q: 1.35 * 400 * ec.alpha.aQ[0] / 2 / 1000, a: 0.6, bb: 0.35, tRev, h: D.h, d: D.d, As: AsP }, D.mat));
  // minimum transversal : 20 % du longitudinal en partie basse ; en partie haute max(20 % du haut ; 10 % du bas)
  proche(D.transverseMin.bot, 0.2 * Math.max(...D.envBot), 1e-12, 'min bas');
  proche(D.transverseMin.top, Math.max(0.2 * Math.max(...D.envTop), 0.1 * Math.max(...D.envBot)), 1e-12, 'min haut');
});

test('BAEL : V_u = max(1,35 V_G + 1,6 V_AB ; 1,35 V_G + 1,35 V_Mc)/2b ; τ̄_u max ; A_t/s_t ; poinçonnement Br et Bc', () => {
  const D = st.design.F61, M = D.mat;
  const Kof = r => (r ? deck.transverseFactors(r).K : null);
  const Ks = { A: Kof(f61.A), Bc: Kof(f61.Bc), Bt: Kof(f61.Bt), Mc120: Kof(f61.Mc120), D240: Kof(f61.D240) };
  for (const s of [0, 3, D.shear.length - 1]) {
    const vG = Math.max(Math.abs(perm.Vm[s]), Math.abs(perm.Vp[s]));
    const pick = k => (f61[k] ? (Ks[k][s] || 1) * Math.max(Math.abs(f61[k].Vmax[s]), Math.abs(f61[k].Vmin[s])) : 0);
    const Vu = Math.max(1.35 * vG + 1.6 * Math.max(pick('A'), pick('Bc'), pick('Bt')), 1.35 * vG + 1.35 * Math.max(pick('Mc120'), pick('D240'))) / (2 * deck.b) / 1000;
    const r = D.shear[s];
    proche(r.Vu, Vu, 1e-12, `V_u section ${s}`);
    proche(r.tau, Vu / D.d, 1e-12, 'τ_u'); proche(r.tauLim, 0.07 * M.fc28 / M.gammaB, 1e-12, 'τ̄_u dalle');
    proche(r.tauMax, Math.min(0.2 * M.fc28 / M.gammaB, 5), 1e-12, 'τ_u max');
    proche(r.AtS, r.tau > r.tauLim ? Math.max(0, r.tau - 0.3 * M.ft28) / (0.9 * M.fsu) : 0, 1e-12, 'A_t/s_t');
  }
  const delta = Math.max(...f61.deltaBc), tRev = st.p.mat.tRev;
  assert.deepEqual(D.punch.Br, punchingBAEL({ Qu: 1.6 * 100 * delta / 1000, a: 0.3, bb: 0.6, tRev, h: D.h }, M));
  assert.deepEqual(D.punch.Bc, punchingBAEL({ Qu: 1.6 * 60 * delta / 1000, a: 0.25, bb: 0.25, tRev, h: D.h }, M));
  proche(D.transverseMin.bot, Math.max(...D.envBot) / 4, 1e-12, 'min bas BAEL');
  proche(D.transverseMin.top, Math.max(...D.envTop) / 4, 1e-12, 'min haut BAEL');
  // étriers BAEL forcés
  const permX = { ...perm, Vm: perm.Vm.map(v => 30 * v), Vp: perm.Vp.map(v => 30 * v) };
  const XB = designBAEL(deck, permX, f61, mat), X = XB.shear[0];
  assert.ok(X.tau > X.tauLim); proche(X.AtS, (X.tau - 0.3 * XB.mat.ft28) / (0.9 * XB.mat.fsu), 1e-12, 'A_t/s_t forcé');
});
