/**
 * Renfort des tests (campagne de mutation, docs/validation/mutation.md) : justifications de section des cadres
 * (src/cadre/sections.js, unités t·m/ml, t/ml, cm²/ml) recalculées à la main (BAEL 91, EN 1992-1-1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMMA_B, GAMMA_S, MU_LIMITE, tranchantBael, minimumBael, alphaEls, elsBael, elsComposeeBael, eluBael, EXPOSITION, fctm, ecm,
  minimumEc2, eluEc2, tranchantEc2, fissureEc2, choixBarres } from '../src/cadre/sections.js';

const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg} : attendu ${b}, obtenu ${a}`);

test('BAEL : constantes, τ_u et non-fragilité', () => {
  assert.deepEqual([GAMMA_B, GAMMA_S, MU_LIMITE], [1.5, 1.15, 0.372]);
  // τ_lim = 0,07 × 25/1,5 = 1,1667 MPa ; V = 70 t/ml sur d = 0,60 m → τ = 1,1667 MPa : la limite est admise (≤)
  const lim = 0.07 * 25 / 1.5, r = tranchantBael(lim * 100 * 0.6, 0.6, 25);
  proche(r.lim, lim, 1e-12, 'τ_lim'); proche(r.tau, lim, 1e-12, 'τ'); assert.equal(r.ok, true); proche(r.ratio, 1, 1e-12, 'taux');
  assert.equal(tranchantBael(80, 0.6, 25).ok, false);
  proche(minimumBael(0.5, 25, 400), 0.23 * 0.5 * 2.1 / 400 * 1e4, 1e-12, 'non-fragilité');
  assert.equal(minimumBael(0, 25, 400), 0); assert.equal(minimumBael(0.5, 25, 0), 0);
});

test('BAEL : ELS (α de la section fissurée), flexion composée et ELU', () => {
  // α vérifie α²(3 − α) = k (1 − α), k = 90 μ/σ_s
  const a = alphaEls(0.01, 200), k = 90 * 0.01 / 200; proche(a * a * (3 - a), k * (1 - a), 5e-3, 'équation de α');
  const big = alphaEls(10, 200), kb = 90 * 10 / 200; proche(big * big * (3 - big), kb * (1 - big), 1e-9, 'α hors domaine (dichotomie)');
  // ELS : M = 20 t·m/ml, d = 0,45, σ_s = 200 MPa : As = M/(z σ_s), z = d (1 − α/3)
  const e = elsBael(20, 0.45, 200, 25, 400), mu = 0.2 / 0.45 ** 2, al = alphaEls(mu, 200);
  proche(e.as, 0.2 / (0.45 * (1 - al / 3)) / 200 * 1e4, 1e-12, 'As ELS'); assert.equal(e.minG, false);
  const small = elsBael(0.5, 0.45, 200, 25, 400); assert.equal(small.minG, true); proche(small.as, minimumBael(0.45, 25, 400), 1e-12, 'minimum');
  // flexion composée : moment rapporté aux aciers M_A = M + N (d − e/2), soulagement N/σ_s
  const c = elsComposeeBael(20, 30, 0.5, 0.45, 200, 25, 400), ma = 20 + 30 * (0.45 - 0.25);
  proche(c.as, elsBael(ma, 0.45, 200, 25, 400).as - 0.30 / 200 * 1e4, 1e-12, 'As flexion composée');
  // ELU : f_bu = 0,85 f_c28/(θ γ_b), μ_bu, α = 1,25 (1 − √(1 − 2 μ)), z = d (1 − 0,4 α)
  const u = eluBael(30, 0.45, 25, 500), fbu = 0.85 * 25 / 1.5, mub = 0.3 / (0.45 ** 2 * fbu), alp = 1.25 * (1 - Math.sqrt(1 - 2 * mub));
  proche(u.mu, mub, 1e-12, 'μ_bu'); proche(u.alpha, alp, 1e-12, 'α'); proche(u.z, 0.45 * (1 - 0.4 * alp), 1e-12, 'z');
  proche(u.as, 0.3 / (u.z * 500 / 1.15) * 1e4, 1e-12, 'As ELU');
  proche(eluBael(30, 0.45, 25, 500, 1.5, 1.15, 0.9).mu, 0.3 / (0.45 ** 2 * 0.85 * 25 / (0.9 * 1.5)), 1e-12, 'θ = 0,9');
  assert.equal(eluBael(300, 0.3, 25, 500).surarme, true);
  assert.equal(eluBael(0, 0.3, 25, 500).as, 0);
});

test('EC2 : f_ctm, E_cm, minimum 9.2.1.1, ELU, V_Rd,c 6.2.2', () => {
  proche(fctm(30), 0.3 * 30 ** (2 / 3), 1e-12, 'fctm'); proche(fctm(60), 2.12 * Math.log(1 + 6.8), 1e-12, 'fctm > C50');
  proche(ecm(30), 22000 * 3.8 ** 0.3, 1e-12, 'Ecm');
  proche(minimumEc2(0.45, 30, 500), Math.max(0.26 * fctm(30) / 500, 0.0013) * 0.45 * 1e4, 1e-12, 'minimum');
  proche(minimumEc2(0.45, 12, 500), 0.0013 * 0.45 * 1e4, 1e-12, 'minimum 0,13 %');
  assert.equal(minimumEc2(0, 30, 500), 0); assert.equal(minimumEc2(0.45, 30, 0), 0);
  const u = eluEc2(30, 0.45, 30, 500), mu = 0.3 / (0.45 ** 2 * 20), xi = 1.25 * (1 - Math.sqrt(1 - 2 * mu));
  proche(u.mu, mu, 1e-12, 'μ'); proche(u.as, 0.3 / (0.45 * (1 - 0.4 * xi) * 500 / 1.15) * 1e4, 1e-12, 'As');
  // V_Rd,c : k = 1 + √(200/d[mm]) ≤ 2, ρ = A_sl/(b d) ≤ 0,02, C = 0,18/γ_c, v_min = 0,035 k^1,5 √f_ck
  const t = tranchantEc2(30, 0.45, 30, 20), k = 1 + Math.sqrt(200 / 450), rho = 20e-4 / 0.45;
  const v = Math.max(0.18 / 1.5 * k * (100 * rho * 30) ** (1 / 3), 0.035 * k ** 1.5 * Math.sqrt(30));
  proche(t.vRd, v * 0.45 * 100, 1e-12, 'V_Rd,c'); proche(t.vMin, 0.035 * k ** 1.5 * Math.sqrt(30) * 45, 1e-12, 'v_min');
  assert.equal(tranchantEc2(t.vRd, 0.45, 30, 20).ok, true);
  const tm = tranchantEc2(10, 0.15, 30, 1);                       // d = 150 mm : k plafonné à 2 ; ρ faible → v_min
  proche(tm.vRd, 0.035 * 2 ** 1.5 * Math.sqrt(30) * 15, 1e-12, 'k = 2, v_min');
  proche(tranchantEc2(30, 0.45, 30, 500).vRd, 0.18 / 1.5 * k * (100 * 0.02 * 30) ** (1 / 3) * 45, 1e-12, 'ρ plafonné à 2 %');
});

test('EC2 7.3.4 : ouverture de fissure w_k = s_r,max (ε_sm − ε_cm)', () => {
  assert.deepEqual(EXPOSITION, { XC1: 0.4, 'XC2-XC4': 0.3, 'XD-XS': 0.2 });
  const M = 20, e = 0.5, d = 0.45, as = 20, phi = 0.016, c = 0.04, fck = 30;
  const A = as / 1e4, aE = 200000 / ecm(fck), x = -aE * A + Math.sqrt((aE * A) ** 2 + 2 * aE * A * d);
  const sigma = 0.2 / ((d - x / 3) * A), hcef = Math.min(2.5 * (e - d), (e - x) / 3, e / 2), rho = A / hcef;
  const eps = Math.max((sigma - 0.4 * fctm(fck) * (1 + aE * rho) / rho) / 200000, 0.6 * sigma / 200000);
  const sr = (3.4 * c + 0.8 * 0.5 * 0.425 * phi / rho) * 1000;
  const r = fissureEc2(M, e, d, as, phi, c, fck);
  proche(r.sigma, sigma, 1e-12, 'σ_s'); proche(r.sr, sr, 1e-12, 's_r,max'); proche(r.wk, sr * eps, 1e-12, 'w_k'); assert.equal(r.wmax, 0.3);
  assert.equal(r.ok, r.wk <= 0.3);
  // ε_sm − ε_cm minoré par 0,6 σ_s/E_s : barres peu chargées
  const f = fissureEc2(2, e, d, as, phi, c, fck), s2 = 0.02 / ((d - x / 3) * A);
  proche(f.wk, sr * Math.max((s2 - 0.4 * fctm(fck) * (1 + aE * rho) / rho) / 200000, 0.6 * s2 / 200000), 1e-12, 'w_k minoré');
  assert.equal(fissureEc2(M, e, d, as, phi, c, fck, 'XD-XS').wmax, 0.2);
  assert.equal(fissureEc2(0, e, d, as, phi, c, fck).wk, 0);
  assert.equal(fissureEc2(M, 0.4, d, as, phi, c, fck).wk, 0);       // e ≤ d : géométrie incomplète
});

test('Choix des barres : première disposition du catalogue qui suffit', () => {
  const r = choixBarres(7.5);                                     // HA14 e = 20 : 7,70 cm²/ml
  assert.equal(r.option.label, 'HA14 e = 20 cm'); proche(r.fournie, 100 / 20 * Math.PI * 0.7 ** 2, 1e-12, 'aire');
  assert.equal(choixBarres(-1).ok, false); assert.equal(choixBarres(NaN).ok, false); assert.equal(choixBarres(1000).ok, false);
  assert.equal(choixBarres(0).option.label, 'HA10 e = 20 cm');
});
