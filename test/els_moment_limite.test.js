/**
 * Flexion ELS par le moment limite du béton (v0.99.47) : armatures simples sous M_rb, armatures doubles au-delà.
 * Références calculées à la main (méthode classique BAEL 91 A.4.5,2 ; même logique EN 1992-1-1 § 7.2 avec α_e = 15).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialsBAEL, flexureELS } from '../src/section_bael.js';
import { materialsEC2, flexureSLS, chamferWidthFn, crackedSection } from '../src/section_ec2.js';

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : ${a} ≠ ${b}`);

test('BAEL : fc28 = 25, Fe 500 FP (σ̄s = 250, σ̄bc = 15), b = 1, d = 0,50, d\' = 0,05', () => {
  const m = materialsBAEL({ fc28: 25, fe: 500 });
  assert.equal(m.sigSbar, 250); assert.equal(m.sigBbar, 15);
  // α₁ = 15·15/(15·15 + 250) = 0,473684 ; y₁ = 0,236842 ; M_rb = ½·15·y₁·(0,5 − y₁/3) = 0,747922 MN·m ; A_rb = ½·15·y₁/250
  const y1 = 0.5 * 225 / 475, Mrb = 0.5 * 15 * y1 * (0.5 - y1 / 3), Arb = 0.5 * 15 * y1 / 250;
  proche(Mrb, 0.747922, 1e-5, 'M_rb à la main');
  const r0 = flexureELS(0.5, { d: 0.5 }, m);
  assert.equal(r0.As2, 0); proche(r0.sigS, 250, 1e-6, 'σs = σ̄s en armatures simples'); assert.ok(r0.sigB < 15);
  proche(r0.Mrb, Mrb, 1e-9, 'M_rb');
  // M = 1,0 MN·m > M_rb : σ'sc = 225 (y₁ − 0,05)/y₁ = 177,50 ; A' = (1 − M_rb)/(177,50 × 0,45) = 31,56 cm² ;
  // A = A_rb + A' σ'sc/σ̄s = 71,05 + 22,41 = 93,46 cm²
  const r = flexureELS(1.0, { d: 0.5 }, m), sc = 225 * (y1 - 0.05) / y1, A2 = (1 - Mrb) / (sc * 0.45), A = Arb + A2 * sc / 250;
  proche(sc, 177.50, 1e-4, 'σ\'sc'); proche(A2 * 1e4, 31.56, 1e-3, 'A\' à la main'); proche(A * 1e4, 93.46, 1e-3, 'A à la main');
  proche(r.As2, A2, 1e-9, 'A\''); proche(r.As, A, 1e-9, 'A');
  proche(r.sigB, 15, 1e-9, 'σbc = σ̄bc'); proche(r.sigS, 250, 1e-9, 'σs = σ̄s'); proche(r.x, y1, 1e-9, 'axe neutre en y₁');
});

test('EC2 : C30/37, B500 (σc ≤ 18, σs ≤ 300 avec la limite de fatigue simplifiée), d = 0,65', () => {
  const m = materialsEC2({ fck: 30, fyk: 500 });
  assert.equal(m.sigSlim, 300); proche(m.sigCcar, 18, 1e-12, 'σc limite');
  // α₁ = 15·18/(270 + 300) = 0,473684 ; y₁ = 0,307895 ; M_rb = ½·18·y₁·(0,65 − y₁/3) = 1,516874 MN·m
  const d = 0.65, y1 = d * 270 / 570, Mrb = 0.5 * 18 * y1 * (d - y1 / 3), Arb = 0.5 * 18 * y1 / 300;
  const sc = 270 * (y1 - 0.05) / y1, M = 2.0, A2 = (M - Mrb) / (sc * (d - 0.05)), A = Arb + A2 * sc / 300;
  const r = flexureSLS(M, { d }, m);
  proche(r.Mrb, Mrb, 1e-9, 'M_rb'); proche(r.As2, A2, 1e-9, 'A_s2'); proche(r.As, A, 1e-9, 'A_s');
  proche(r.sigC, 18, 1e-9, 'σc'); proche(r.sigS, 300, 1e-9, 'σs');
  // taux : (A + A')/(b d) sans h ; avec h = 0,70 l'alerte 4 % se calcule sur b h
  const rh = flexureSLS(4.5, { d, h: 0.7 }, m);
  assert.equal(rh.rhoMaxDepasse, (rh.As + rh.As2) > 0.04 * 0.7);
});

test('EC2 : largeur variable (chanfreins) — M_rb intégré, continuité au passage', () => {
  const m = materialsEC2({ fck: 30, fyk: 500 }), w = chamferWidthFn({ width: 12, h: 0.7, hEdge: 0.4, joue: 1 }), d = 0.645;
  const f = M => flexureSLS(M, { d, widthFn: w }, m), Mrb = f(1e-3).Mrb;
  const b = f(0.999999 * Mrb), a = f(1.000001 * Mrb), c = f(1.5 * Mrb);
  assert.ok(Math.abs(a.As - b.As) < 1e-6 && c.As > a.As && c.As2 > 0);
  const cs = crackedSection(1.5 * Mrb, { d, As: c.As, As2: c.As2, widthFn: w }, m);
  proche(cs.sigC, 18, 1e-3, 'σc au moment 1,5 M_rb'); proche(cs.sigS, 300, 1e-3, 'σs au moment 1,5 M_rb');
});

test('pont-dalle : aciers comprimés repris dans la face opposée et signalés (dalle trop mince), rien sur l\'exemple fil rouge', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const { reglesTablier } = await import('../src/reco/tablier.js');
  const items = st => reglesTablier.flatMap(r => r(st)).filter(i => /aciers comprimés|Taux maximal/.test(i.verification));
  const fin = compute(parseData({ ...formDefaults(), h: '0.45' })), D = fin.design.EC;
  let vu = 0;
  D.perFibre.forEach((row, s) => row.forEach(f => {
    for (const [face, autre, env] of [['bot', 'top', D.envTop], ['top', 'bot', D.envBot]]) {
      const a2 = f[face].As2 || 0;
      if (a2 > 1e-9) { vu++; assert.ok(env[s] >= a2 - 1e-12, `section ${s} : A_s2 ${a2} non repris (face ${autre} ${env[s]})`); assert.ok(f[autre].AsComp >= a2 - 1e-12); }
    }
  }));
  assert.ok(vu > 0, 'la dalle de 0,45 m demande des aciers comprimés');
  assert.ok(items(fin).some(i => /A_s2 = /.test(i.constat)), 'recommandation « aciers comprimés »');
  const ref = compute(parseData(formDefaults()));
  assert.equal(items(ref).length, 0);
  assert.ok(ref.design.EC.perFibre.every(r => r.every(f => !(f.bot.As2 > 0) && !(f.top.As2 > 0))));
});
