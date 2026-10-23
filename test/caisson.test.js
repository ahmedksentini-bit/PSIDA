// Caisson : flexion transversale (cadre), fléaux en construction (déséquilibre), plans des ouvrages par phases
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flexionTransversale, lu } from '../src/phasage/caisson_transversal.js';
import { desequilibreFleau, BARRE_36 } from '../src/phasage/desequilibre.js';
import { computePhasage } from '../web/phasage_view.js';
import { planFleauCoffrage, planFleauCablage, planContinuesCoffrage, planContinuesCablage } from '../src/plans/ouvrages_phases.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);
const K = { B: 12, ts: 0.25, Bi: 6.5, ti: 0.22, bw: 0.45 };
const FORM_F = { ph_type: 'fleau', fl_ccn: '10', fl_ccv: '6', fl_ccAp: '28.5', fl_ccP0: '4000', fl_crn: '6', fl_crv: '4', fl_Lr: '10' };

test('LU : résolution d\'un système dense', () => {
  const A = [[4, 1, 2], [1, 5, 1], [2, 1, 6]], x = [1, -2, 3], b = A.map(r => r.reduce((s, v, j) => s + v * x[j], 0));
  lu(A)(b).forEach((v, i) => near(v, x[i], 1e-12, `x${i}`));
});

test('cadre : encastrement de l\'encorbellement = statique, ordre de grandeur du trafic sur la console', () => {
  const r = flexionTransversale({ K, h: 2.3, Lr: 10, gBord: 8, tRev: 0.08 });
  const xw = K.Bi / 2 - K.bw / 2, Lc = K.B / 2 - xw - K.bw / 2, s = r.sections[0];
  near(s.Gpp, -25 * K.ts * Lc * Lc / 2, 1e-9, 'poids propre de la console');
  near(s.Gsup, -8 * (Lc - 0.25) - 24 * 0.08 * (Math.max(0, 10 / 2 - (xw + K.bw / 2))) ** 2 / 2, 0.02, 'bord + revêtement');
  // LM1 sur la console : ordre de grandeur de src/cantilever.js (roue à 0,50 m du bord de chaussée, b_eff = b₀ + 1,20 + 2x)
  const b0 = 0.4 + 0.16 + K.ts, x = 10 / 2 - 0.5 - (xw + K.bw / 2), mTS = 2 * 150 * x / (b0 + 1.2 + 2 * x);
  assert.ok(-s.Qmin > mTS && -s.Qmin < mTS + 9 * (10 / 2 - (xw + K.bw / 2)) ** 2 / 2 + 1, `M_Q console ${s.Qmin} (TS seul ${mTS})`);
  // âmes : moments de tête et de pied, armatures positives
  assert.ok(r.sections.every(q => q.AsTendu.pos > 0 && q.AsTendu.neg > 0));
});

test('déséquilibre : moments des cas de charge et clouage', () => {
  const o = computePhasage(FORM_F), D = desequilibreFleau(o, { dc: 3 }), e = D.etapes.at(-1), B = o.p.caisson.B;
  near(e.M.CLL, 0.24 * B * e.Lh ** 2 / 2, 1e-12, 'CLL');
  near(e.M.WUP, 0.24 * B * e.Lh ** 2 / 2, 1e-12, 'WUP');
  near(e.M.AI, 2 * o.p.Qeq * e.Lh, 1e-12, 'chute d\'équipage');
  near(e.T, Math.max(0, e.Md / 3 - 0.9 * e.Nv / 2), 1e-12, 'traction par file');
  assert.ok(e.nb * BARRE_36.Fd >= e.T);
  // les moments de déséquilibre croissent avec l'avancement
  for (let k = 1; k < D.etapes.length; k++) assert.ok(D.etapes[k].Md > D.etapes[k - 1].Md);
  assert.ok(o.desequilibre && o.transversal, 'intégrés au calcul du fléau');
});

test('plans des fléaux et des poutres continues : mises en page valides', () => {
  const f = computePhasage(FORM_F), p = computePhasage({ ph_type: 'poutres', ph_P: '4300', ph_Ap: '33' });
  for (const F of [planFleauCoffrage(f), planFleauCablage(f), planContinuesCoffrage(p), planContinuesCablage(p)]) assert.ok(F.valide().ok, F.titre + ' : ' + F.valide().problemes.join(' ; '));
});
