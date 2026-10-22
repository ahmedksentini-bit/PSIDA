/**
 * Calcul par phases avec fluage et retrait (src/phasage) : recoupements avec des solutions fermées.
 *  - loi de Dischinger (vitesse de fluage) : redistribution d'un changement de schéma, X(t) = X_cont (1 − e^{−Δφ}) ;
 *    retrait gêné d'une barre bi-encastrée, N(t) = −E A ε∞/φ∞ (1 − e^{−Δφ}) ;
 *  - loi de l'EN 1992-1-1 : coefficient de fluage de l'annexe B recalculé à la main, retrait § 3.1.4, coefficient de
 *    vieillissement χ déduit de la relaxation calculée (valeurs usuelles de Bažant ≈ 0,8), changement de schéma recoupé
 *    par l'équation intégrale de Volterra résolue indépendamment (et, en ordre de grandeur, par la méthode AAEM).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculPhasage, instants } from '../src/phasage/phasage.js';
import { betonEC2 } from '../src/phasage/fluage.js';

const proche = (a, b, tol, lab) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${lab} : ${a} ≠ ${b} (tol ${tol})`);
const L = 10, w = 10;
const deuxTravees = (beton, { tCharge = 10, tContinuite = 30, tFin = 10000, parDecade = 16 } = {}) => calculPhasage({
  noeuds: [[0, 0], [L, 0], [L, 0], [2 * L, 0]], betons: { B: beton },
  barres: [{ i: 0, j: 1, A: 1, I: 0.1, beton: 'B' }, { i: 2, j: 3, A: 1, I: 0.1, beton: 'B' }],
  phases: [
    { t: tCharge, nom: 'travées isostatiques', activer: [0, 1], appuis: [{ n: 0, ddl: ['ux', 'uy'] }, { n: 1, ddl: ['uy'] }, { n: 2, ddl: ['ux', 'uy'] }, { n: 3, ddl: ['uy'] }], charges: [{ barre: 0, w }, { barre: 1, w }] },
    { t: tContinuite, nom: 'clavage sur appui', liaisons: [{ a: 1, b: 2, ddl: ['rz'] }] },
  ], tFin, parDecade,
});

test('Phasage élastique : une phase = calcul classique (poutre continue à deux travées)', () => {
  const r = calculPhasage({ noeuds: [[0, 0], [L, 0], [2 * L, 0]], betons: { B: { loi: 'elastique', E: 30000 } },
    barres: [{ i: 0, j: 1, A: 1, I: 0.1, beton: 'B' }, { i: 1, j: 2, A: 1, I: 0.1, beton: 'B' }],
    phases: [{ t: 0, activer: [0, 1], appuis: [{ n: 0, ddl: ['ux', 'uy'] }, { n: 1, ddl: ['uy'] }, { n: 2, ddl: ['uy'] }], charges: [{ barre: 0, w }, { barre: 1, w }] }], tFin: 0 });
  proche(r.final.barres[0].Mj, -w * L * L / 8, 1e-9, 'moment sur appui');
  proche(r.final.reactions[4], 1.25 * w * L, 1e-9, 'réaction centrale');
  // sans fluage, le clavage après chargement ne crée aucun moment sur appui
  const r2 = deuxTravees({ loi: 'elastique', E: 30000 });
  assert.ok(Math.abs(r2.final.barres[0].Mj) < 1e-6);
  proche(r2.final.barres[0].Mmi, w * L * L / 8, 1e-9, 'moment isostatique');
});

test('Dischinger : moment de continuité X(t) = X_cont (1 − e^{−[φ(t) − φ(t₁)]}), convergence en pas de temps', () => {
  const phiInf = 2, T = 100, ph = t => phiInf * (1 - Math.exp(-t / T));
  let err = Infinity;
  for (const pd of [8, 16, 32]) {
    const r = deuxTravees({ loi: 'dischinger', E: 30000, phiInf, T }, { parDecade: pd });
    const ex = -w * L * L / 8 * (1 - Math.exp(-(ph(10000) - ph(30))));
    const e = Math.abs(r.final.barres[0].Mj / ex - 1);
    assert.ok(e < Math.max(err, 1e-3), `l'erreur doit décroître (${e} après ${err})`); err = e;
    // à mi-chemin : t = 130 j
    const p = r.pas.find(q => Math.abs(q.t - 130) < 15);
    if (pd === 32) proche(p.barres[0].Mj, -w * L * L / 8 * (1 - Math.exp(-(ph(p.t) - ph(30)))), 2e-3, 'X(130 j)');
  }
  assert.ok(err < 5e-4, `écart final ${err}`);
});

test('Dischinger : retrait gêné d’une barre bi-encastrée, N(t) = −E A ε∞/φ∞ (1 − e^{−Δφ})', () => {
  const phiInf = 2, T = 100, eInf = -300e-6, E = 30000, A = 0.5, ph = t => phiInf * (1 - Math.exp(-t / T));
  const r = calculPhasage({ noeuds: [[0, 0], [10, 0]], betons: { B: { loi: 'dischinger', E, phiInf, T, epsInf: eInf } }, barres: [{ i: 0, j: 1, A, I: 0.05, beton: 'B' }],
    phases: [{ t: 10, activer: [0], appuis: [{ n: 0, ddl: ['ux', 'uy', 'rz'] }, { n: 1, ddl: ['ux', 'uy', 'rz'] }] }], tFin: 10000, parDecade: 32 });
  proche(r.final.barres[0].N, -E * 1000 * A * eInf / phiInf * (1 - Math.exp(-(ph(10000) - ph(10)))), 1e-3, 'N');
  assert.ok(Math.abs(r.final.barres[0].Mi) < 1e-6);
});

test('EN 1992-1-1 : fluage (annexe B) et retrait (§ 3.1.4) recalculés à la main', () => {
  // C30/37, HR 50 %, h0 = 150 mm, ciment N, t0 = 28 j : fcm = 38 > 35 → α1, α2
  const b = betonEC2({ fck: 30, RH: 50, h0: 150, ciment: 'N' });
  const a1 = (35 / 38) ** 0.7, a2 = (35 / 38) ** 0.2, phiRH = (1 + 0.5 / (0.1 * Math.cbrt(150)) * a1) * a2;
  const phi0 = phiRH * 16.8 / Math.sqrt(38) / (0.1 + 28 ** 0.2), bH = 1.5 * (1 + (0.6) ** 18) * 150 + 250 * (35 / 38) ** 0.5;
  proche(b.phi(28 + 10000, 28), phi0 * (10000 / (bH + 10000)) ** 0.3, 1e-12, 'φ(t, 28)');
  assert.ok(b.phi(1e6, 28) > 2.3 && b.phi(1e6, 28) < 2.6);   // ordre de grandeur de la figure 3.1
  // C35/45, HR 70 %, h0 = 300 mm : ε_cd,0 = 0,85 (220 + 110·4) e^{−0,12·4,3} 10⁻⁶ β_RH ; k_h = 0,75 ; ε_ca∞ = 62,5·10⁻⁶
  const c = betonEC2({ fck: 35, RH: 70, h0: 300, ciment: 'N', ts: 3 });
  const ecd0 = 0.85 * (220 + 440) * Math.exp(-0.12 * 4.3) * 1e-6 * 1.55 * (1 - 0.7 ** 3), t = 10000;
  const ecd = (t - 3) / (t - 3 + 0.04 * Math.sqrt(300 ** 3)) * 0.75 * ecd0, eca = (1 - Math.exp(-0.2 * Math.sqrt(t))) * 62.5e-6;
  proche(c.retrait(t), -(ecd + eca), 1e-12, 'ε_cs');
});

test('EN 1992-1-1 : relaxation calculée → coefficient de vieillissement χ ≈ 0,8 (Bažant)', () => {
  const o = { fck: 35, RH: 70, h0: 300, ciment: 'N', avecRetrait: false }, b = betonEC2(o), eps = 1e-4, E0 = b.E(28) * 1000;
  const r = calculPhasage({ noeuds: [[0, 0], [1, 0]], betons: { B: o }, barres: [{ i: 0, j: 1, A: 1, I: 0.1, beton: 'B' }],
    phases: [{ t: 28, activer: [0], appuis: [{ n: 0, ddl: ['ux', 'uy', 'rz'] }, { n: 1, ddl: ['uy', 'rz'] }], nodales: [{ n: 1, F: [E0 * eps, 0, 0] }] },
      { t: 28, appuis: [{ n: 1, ddl: ['ux'] }] }], tFin: 28 + 10000, parDecade: 16 });
  const R = r.final.barres[0].N / eps, phiE0 = b.E(28) * (b.J(10028, 28) - 1 / b.E(28));   // φ rapporté à E_c(t0)
  const chi = E0 / (E0 - R) - 1 / phiE0;
  assert.ok(chi > 0.75 && chi < 0.9, `χ = ${chi}`);
  assert.ok(R / E0 > 0.2 && R / E0 < 0.5, `R/E0 = ${R / E0}`);
});

test('EN 1992-1-1 : moment de continuité = solution de l’équation intégrale de Volterra résolue à part', () => {
  // ∫_{t1}^{t} J(t, τ) dX(τ) = X_cont [J(t, t0) − J(t1, t0)] : schéma des trapèzes sur une grille logarithmique fine,
  // indépendant du moteur (aucune matrice, aucune barre). La méthode AAEM (χ ≈ 0,8) en donne une approximation à ~10 %.
  const o = { fck: 35, RH: 70, h0: 300, ciment: 'N', avecRetrait: false }, b = betonEC2(o), Xc = -w * L * L / 8;
  const t0 = 10, t1 = 30, tf = 10000, r = deuxTravees(o, { tCharge: t0, tContinuite: t1, tFin: tf, parDecade: 16 });
  const N = 2000, ts = [t1]; for (let k = 1; k <= N; k++) ts.push(t1 + 1e-3 * ((tf - t1) / 1e-3) ** (k / N));
  const X = [0];
  for (let n = 1; n <= N; n++) {
    let s0 = 0; for (let k = 1; k < n; k++) s0 += (X[k] - X[k - 1]) * 0.5 * (b.J(ts[n], ts[k - 1]) + b.J(ts[n], ts[k]));
    X.push(X[n - 1] + (Xc * (b.J(ts[n], t0) - b.J(t1, t0)) - s0) / (0.5 * (b.J(ts[n], ts[n - 1]) + b.J(ts[n], ts[n]))));
  }
  proche(r.final.barres[0].Mj, X[N], 5e-3, 'X(∞)');
  const phiHat = b.E(t1) * (b.J(tf, t1) - 1 / b.E(t1)), Xaaem = Xc * b.E(t1) * (b.J(tf, t0) - b.J(t1, t0)) / (1 + 0.8 * phiHat);
  proche(r.final.barres[0].Mj, Xaaem, 0.15, 'X(∞) AAEM (ordre de grandeur)');
});

test('Instants de calcul : progression géométrique, bornes exactes', () => {
  const t = instants(30, 10000, 8);
  assert.equal(t[t.length - 1], 10000); assert.ok(t[0] > 30 && t[0] <= 30.1 + 1e-12);
  for (let k = 2; k < t.length - 1; k++) proche((t[k] - 30) / (t[k - 1] - 30), 10 ** (1 / 8), 1e-9, 'raison');
});

test('Retrait d’un étai : la réaction est restituée, on retrouve la travée unique (élastique)', () => {
  const r = calculPhasage({ noeuds: [[0, 0], [L, 0], [2 * L, 0]], betons: { B: { loi: 'elastique', E: 30000 } },
    barres: [{ i: 0, j: 1, A: 1, I: 0.1, beton: 'B' }, { i: 1, j: 2, A: 1, I: 0.1, beton: 'B' }],
    phases: [{ t: 0, activer: [0, 1], appuis: [{ n: 0, ddl: ['ux', 'uy'] }, { n: 1, ddl: ['uy'] }, { n: 2, ddl: ['uy'] }], charges: [{ barre: 0, w }, { barre: 1, w }] },
      { t: 5, retirerAppuis: [{ n: 1, ddl: ['uy'] }] }], tFin: 5 });
  proche(r.final.barres[0].Mj, w * (2 * L) ** 2 / 8, 1e-9, 'moment à mi-portée après décintrement');
  assert.ok(Math.abs(r.final.reactions[4]) < 1e-9);
  proche(r.final.reactions[1], w * L, 1e-9, 'réaction d’about');
});
