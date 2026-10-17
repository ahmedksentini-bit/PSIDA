import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialsEC2, flexureULS, flexureSLS, crackedSection, crackWidth, asForCrackWidth, minimumSteel, shearVRdc, punching } from '../src/section_ec2.js';
import { materialsBAEL, flexureELU, flexureELS, minimumSteelBAEL, shearBAEL } from '../src/section_bael.js';
import { combineEC } from '../src/combinations.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} attendu ${b}, obtenu ${a}`);
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg || ''} attendu ${b}, obtenu ${a}`);

test('EC2 matériaux C35/45, B500', () => {
  const m = materialsEC2({ fck: 35, fyk: 500 });
  rel(m.fctm, 3.21, 0.01, 'fctm'); rel(m.fcd, 23.33, 0.001, 'fcd'); rel(m.fyd, 434.8, 0.001, 'fyd'); rel(m.Ecm, 34077, 0.01, 'Ecm');
  assert.equal(m.sigSlim, 300); rel(m.sigCcar, 21, 1e-9);
});

test('EC2 flexion ELU : M = 0,3 MN·m/m, d = 0,65 m, C35 → As = 10,78 cm²/m (calcul manuel)', () => {
  const m = materialsEC2({ fck: 35, fyk: 500 });
  const r = flexureULS(0.3, { d: 0.65 }, m);
  // μ = 0,3/(0,65²·23,33) = 0,03043 ; ξ = 1 − √(1 − 2μ) = 0,03091 ; z = 0,65(1 − ξ/2) = 0,6400 ; As = 0,3/(0,64·434,8)
  rel(r.mu, 0.03043, 1e-3, 'μ'); rel(r.z, 0.6400, 1e-3, 'z'); rel(r.As * 1e4, 10.78, 2e-3, 'As');
  assert.equal(r.As2, 0);
  // aciers comprimés au-delà de μ_lim (x/d = 0,45 → ξ = 0,36, μ_lim = 0,2952)
  const big = flexureULS(0.2952 * 0.65 * 0.65 * 23.333 * 1.3, { d: 0.65 }, m);
  assert.ok(big.As2 > 0 && big.xOverD === 0.45, 'aciers comprimés');
});

test('EC2 section fissurée : x et contraintes (b = 1, d = 0,65, As = 20 cm², αe = 15, M = 0,25)', () => {
  const m = materialsEC2({ fck: 35, fyk: 500, alphaE: 15 });
  const r = crackedSection(0.25, { d: 0.65, As: 20e-4 }, m);
  // x²/2 = 15·20e-4·(0,65 − x) → x² + 0,06x − 0,039 = 0 → x = 0,1695
  rel(r.x, 0.1695, 2e-3, 'x');
  const I = r.x ** 3 / 3 + 15 * 20e-4 * (0.65 - r.x) ** 2;
  rel(r.I, I, 1e-9, 'I'); rel(r.sigS, 15 * 0.25 * (0.65 - r.x) / I, 1e-9, 'σs');
  // dimensionnement ELS : σs ≤ 300 → As tel que σs = 300 (bras ≈ 0,94 d)
  const s = flexureSLS(0.25, { d: 0.65 }, m);
  rel(s.sigS, 300, 1e-6, 'σs = 300'); assert.ok(s.sigC < 21, 'σc ok'); rel(s.As * 1e4, 0.25 / (0.94 * 0.65 * 300) * 1e4, 0.03, 'As ELS');
});

test('CHAMOA mi-travée 2 : M_ELS,cara = 8,62 MN·m sur 12 m, h = 0,772, c = 3 cm → ≈ 431,7 cm² (σs ≤ 300 MPa)', () => {
  const m = materialsEC2({ fck: 35, fyk: 500 });
  const s = flexureSLS(8.62 / 12, { d: 0.772 - 0.03 }, m);
  rel(s.As * 1e4 * 12, 431.7, 0.03, 'As total CHAMOA');
  // minimum tendu 9.2.1.1 ×1,2 avec bt = 11,12 m et d = 0,742 → 165,2 cm²
  const mins = minimumSteel({ h: 0.772, d: 0.742 }, m, { kSlab: 1.2 });
  rel(mins.as921 * 11.12 * 1e4, 165.2, 0.02, 'As,min 9.2.1.1');
  // 7.3.2 : kc k fct,eff Act / fyk avec Act = 4,407 m² → 75,8 cm² (k = 0,67)
  const k = 1.0 - 0.35 * (0.772 - 0.3) / 0.5;
  rel(0.4 * k * 3.21 * 4.407 / 500 * 1e4, 75.8, 0.02, 'As,min 7.3.2');
});

test('EC2 ouverture de fissure 7.3.4 : cohérence et dimensionnement', () => {
  const m = materialsEC2({ fck: 35, fyk: 500 });
  const sec = { h: 0.7, d: 0.65 };
  const w = crackWidth(0.3, { ...sec, As: 25e-4, phi: 0.02, c: 0.03 }, m);
  assert.ok(w.wk > 0.05 && w.wk < 0.6, 'wk plausible ' + w.wk);
  const As = asForCrackWidth(0.3, sec, m, { wkMax: 0.3, phi: 0.02, c: 0.03 });
  const chk = crackWidth(0.3, { ...sec, As, phi: 0.02, c: 0.03 }, m);
  close(chk.wk, 0.3, 1e-4, 'wk = 0,3 au dimensionnement');
  // ouverture décroissante avec As
  assert.ok(crackWidth(0.3, { ...sec, As: 40e-4 }, m).wk < crackWidth(0.3, { ...sec, As: 20e-4 }, m).wk);
});

test('EC2 tranchant V_Rd,c et poinçonnement', () => {
  const m = materialsEC2({ fck: 35, fyk: 500 });
  const r = shearVRdc({ d: 0.65, As: 30e-4 }, m);
  // k = 1 + √(200/650) = 1,5547 ; ρ = 0,004615 ; v = 0,12·1,5547·(100·0,004615·35)^(1/3) = 0,4715 MPa ; vmin = 0,035·1,5547^1,5·√35 = 0,4014
  rel(r.k, 1.5547, 1e-3); rel(r.v, 0.4715, 2e-3, 'v'); rel(r.VRdc, 0.4715 * 0.65, 2e-3, 'VRdc');
  const p = punching({ Q: 0.2025, a: 0.4, bb: 0.4, tRev: 0.08, h: 0.7, d: 0.65, As: 30e-4 }, m);
  // a1 = 0,4 + 0,16 + 0,7 = 1,26 ; u1 = 2·(1,26+1,26) + 4π·0,65 = 13,21 m ; vEd = 0,2025/(13,21·0,65) = 0,0236 MPa
  rel(p.u1, 13.209, 1e-3, 'u1'); rel(p.vEd, 0.02358, 2e-3, 'vEd'); assert.ok(p.ok);
});

test('BAEL : ELU M = 0,3, fc28 = 30, fe = 500, d = 0,65 → As = 10,85 cm² ; ELS préjudiciable σ̄s = 250 MPa', () => {
  const m = materialsBAEL({ fc28: 30, fe: 500 });
  rel(m.fbu, 17, 1e-9); rel(m.fsu, 434.8, 1e-3); rel(m.muL, 0.372, 2e-3, 'μ_lim'); rel(m.sigSbar, 250, 1e-9, 'σ̄s');
  const r = flexureELU(0.3, { d: 0.65 }, m);
  // μ = 0,04177 ; α = 1,25(1−√(1−2μ)) = 0,05336 ; z = 0,65(1 − 0,4α) = 0,6361 ; As = 0,3/(0,6361·434,8)
  rel(r.mu, 0.04177, 1e-3); rel(r.alpha, 0.05336, 2e-3); rel(r.As * 1e4, 10.85, 3e-3, 'As ELU');
  const s = flexureELS(0.25, { d: 0.65 }, m);
  rel(s.sigS, 250, 1e-6, 'σs = σ̄s'); assert.ok(s.sigB <= 18, 'σb ok');
  const mins = minimumSteelBAEL({ h: 0.7, d: 0.65 }, m);
  rel(mins.nonFrag * 1e4, 0.23 * 0.65 * 2.4 / 500 * 1e4, 1e-9, 'non-fragilité'); rel(mins.dalle * 1e4, 4.2, 1e-9, '0,06 % bh');
  const sh = shearBAEL(0.5, { d: 0.65 }, m); rel(sh.tauLim, 1.4, 1e-9, 'τ̄u = 0,07·30/1,5');
});

test('combinaisons EC : γ et ψ sur un exemple scalaire', () => {
  const mk = (max, min) => ({ mxMax: [[max]], mxMin: [[min]] });
  const perm = { mx: [[100]] };
  const ec = { TS: mk(60, -10), UDL: mk(20, -5), footway: mk(5, -1), gr1b: mk(50, -8), gr3: mk(4, -1) };
  const c = combineEC(perm, ec);
  close(c.ELU.max[0][0], 1.35 * 100 + 1.35 * 85, 1e-9, 'ELU max'); close(c.ELU.min[0][0], 1.0 * 100 + 1.35 * (-16), 1e-9, 'ELU min');
  close(c.CAR.max[0][0], 185, 1e-9, 'CAR'); close(c.FREQ.max[0][0], 100 + 0.75 * 60 + 0.4 * 20 + 0.4 * 5, 1e-9, 'FREQ');
  close(c.QP.max[0][0], 100, 1e-9, 'QP');
  const c2 = combineEC({ mx: [[-100]] }, ec); close(c2.ELU.min[0][0], -135 + 1.35 * (-16), 1e-9, 'ELU min, G négatif');
  // avec gradient thermique et tassements (formules CHAMOA) : CAR = G + Ta + max(T + ψ0Q, 0,6T + Q1, Q2)
  const th = mk(30, -15), ta = mk(12, -12);
  const c3 = combineEC(perm, ec, { thermal: th, settle: ta });
  close(c3.CAR.max[0][0], 100 + 12 + Math.max(30 + 0.75 * 60 + 0.4 * 20 + 0.4 * 5, 0.6 * 30 + 85, 50), 1e-9, 'CAR avec T, Ta');
  close(c3.FREQ.max[0][0], 100 + Math.max(0.6 * 30, 0.5 * 30 + 0.75 * 60 + 0.4 * 20 + 0.4 * 5, 0.75 * 50), 1e-9, 'FREQ avec T');
  close(c3.QP.max[0][0], 100 + 12 + 0.5 * 30, 1e-9, 'QP avec T, Ta');
  close(c3.ELU.max[0][0], 135 + 1.35 * 85, 1e-9, 'ELU sans T ni Ta');
});
