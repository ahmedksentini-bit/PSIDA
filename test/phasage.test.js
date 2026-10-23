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
import { calculPhasage, instants, relaxation } from '../src/phasage/phasage.js';
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

test('Guide Sétra « Eurocode 2 — application aux ponts-routes en béton » (2008), ch. 3 § 2.3.3 : φ ≈ 0,25 et 0,47', () => {
  // traverse d'un pont-cadre C35/45, h = 0,38 m (h0 ≈ e, dalle sans étanchéité, ch. 4 § 3.1 a), HR 70 % (§ 3.3) ;
  // déformation imposée pendant 4 mois à 50 ans, puis à 2 ans
  const b = betonEC2({ fck: 35, RH: 70, h0: 380, ciment: 'N' }), an = 365.25, m4 = 4 * 30.44;
  assert.equal(b.phi(50 * an + m4, 50 * an).toFixed(2), '0.25');
  assert.equal(b.phi(2 * an + m4, 2 * an).toFixed(2), '0.47');
});

test('Bulletin technique Sétra n° 7 (1972), annexe I § 2.2 : clavage de deux consoles, M_f(∞) = k/(1 + k) · ∫M dx/I / ∫dx/I', () => {
  // poutre bi-encastrée de portée 2a réalisée par clavage de deux consoles chargées (w) juste avant le clavage ;
  // béton non vieillissant (hypothèse du bulletin) de coefficient différé k = φ∞. Consoles de moment M_g = −w x²/2 :
  // moyenne −w a²/6, d'où M_f(∞) = k/(1 + k) · w a²/6 à la clé (positif), et M_f(t) = M_f(∞) (1 − e^{−(1+k) t/T}).
  const a = 15, k = 2, T = 100, t0 = 20;
  const r = calculPhasage({ noeuds: [[0, 0], [a, 0], [a, 0], [2 * a, 0]], betons: { B: { loi: 'nonVieillissant', E: 30000, phiInf: k, T } },
    barres: [{ i: 0, j: 1, A: 5, I: 3, beton: 'B' }, { i: 3, j: 2, A: 5, I: 3, beton: 'B' }],
    phases: [{ t: t0, nom: 'fléaux', activer: [0, 1], appuis: [{ n: 0, ddl: ['ux', 'uy', 'rz'] }, { n: 3, ddl: ['ux', 'uy', 'rz'] }], charges: [{ barre: 0, w }, { barre: 1, w }] },
      { t: t0, nom: 'clavage', liaisons: [{ a: 1, b: 2, ddl: ['ux', 'uy', 'rz'] }] }], tFin: t0 + 20000, parDecade: 32 });
  const Mf = k / (1 + k) * w * a * a / 6;
  proche(r.final.barres[0].Mj, Mf, 2e-3, 'M_f(∞) à la clé');
  proche(r.final.barres[0].Mi, -w * a * a / 2 + Mf, 2e-3, 'moment sur appui');
  const p = r.pas.find(q => q.t - t0 > 30);
  proche(p.barres[0].Mj, Mf * (1 - Math.exp(-(1 + k) * (p.t - t0) / T)), 5e-3, 'M_f(t)');
});

test('Précontrainte (élastique) : câble rectiligne excentré sur deux travées, moment hyperstatique 1,5 P·e sur appui', () => {
  const P = 1000, e = -0.3;
  const r = calculPhasage({ noeuds: [[0, 0], [L, 0], [2 * L, 0]], betons: { B: { loi: 'elastique', E: 30000 } },
    barres: [{ i: 0, j: 1, A: 1, I: 0.1, beton: 'B' }, { i: 1, j: 2, A: 1, I: 0.1, beton: 'B' }],
    phases: [{ t: 0, activer: [0, 1], appuis: [{ n: 0, ddl: ['ux', 'uy'] }, { n: 1, ddl: ['uy'] }, { n: 2, ddl: ['uy'] }] }],
    cables: [{ Ap: 0.003, P, phase: 0, segments: [{ barre: 0, ei: e, ej: e }, { barre: 1, ei: e, ej: e }] }], tFin: 0 });
  // moment isostatique P·e partout, hyperstatique −1,5 P·e sur l'appui central (réaction vers le bas 3 P|e|/L)
  proche(r.final.barres[0].Mi, P * e, 1e-9, 'moment isostatique sur culée');
  proche(r.final.barres[0].Mj, P * e - 1.5 * P * e, 1e-9, 'moment total sur appui central');
  proche(r.final.reactions[4], 3 * P * e / L, 1e-9, 'réaction centrale');
  proche(r.final.barres[0].N, -P, 1e-9, 'compression du béton');
  r.final.cables.forEach(c => proche(c.N, P, 1e-9, 'force du câble (post-tension)'));
});

test('Pertes différées : moteur ≈ NF EN 1992-1-1 éq. (5.46) — câble centré, puis excentré sous poids propre avec relaxation', () => {
  // 1) barre isostatique précontrainte au centre de gravité, C35/45, HR 70 %, h0 = 300 mm, tension à 28 j, 50 ans
  const o = { fck: 35, RH: 70, h0: 300, ciment: 'N' }, b = betonEC2(o), Ac = 0.5, Ap = 0.002, sp = 0.75 * 1860 * 0.9, P = sp * 1000 * Ap, tf = 28 + 18250;
  let r = calculPhasage({ noeuds: [[0, 0], [10, 0]], betons: { B: o }, barres: [{ i: 0, j: 1, A: Ac, I: 0.05, beton: 'B' }],
    phases: [{ t: 28, activer: [0], appuis: [{ n: 0, ddl: ['ux', 'uy'] }, { n: 1, ddl: ['uy'] }] }], cables: [{ Ap, P, phase: 0, rho1000: 0, segments: [{ barre: 0, ei: 0, ej: 0 }] }], tFin: tf, parDecade: 16 });
  const Ep = 195000, f546 = (bb, sc, z, Acc, Ic, App, dpr) => {
    const phi = bb.phi(tf, 28), ecs = bb.retrait(tf) - bb.retrait(28);
    return (-ecs * Ep + 0.8 * dpr + Ep / bb.Ecm * phi * sc) / (1 + Ep / bb.Ecm * App / Acc * (1 + Acc * z * z / Ic) * (1 + 0.8 * phi));
  };
  proche((P - r.final.cables[0].N) / Ap / 1000, f546(b, P / Ac / 1000, 0, Ac, 0.05, Ap, 0), 0.03, 'perte, câble centré');
  // 2) poutre de 20 m (10 barres), câble à z = −0,45 m, poids propre, relaxation classe 2 réduite à 0,8 (§ 5.10.6)
  const o2 = { fck: 40, RH: 70, h0: 400, ciment: 'N' }, b2 = betonEC2(o2), n = 10, Lb = 20, A2 = 0.8, I2 = 0.12, z = -0.45, w2 = A2 * 25, Ap2 = 0.004, P2 = sp * 1000 * Ap2;
  const noeuds = Array.from({ length: n + 1 }, (_, k) => [k * Lb / n, 0]), barres = Array.from({ length: n }, (_, k) => ({ i: k, j: k + 1, A: A2, I: I2, beton: 'B' }));
  r = calculPhasage({ noeuds, betons: { B: o2 }, barres, phases: [{ t: 28, activer: barres.map((_, k) => k), appuis: [{ n: 0, ddl: ['ux', 'uy'] }, { n, ddl: ['uy'] }], charges: barres.map((_, k) => ({ barre: k, w: w2 })) }],
    cables: [{ Ap: Ap2, P: P2, phase: 0, relax: 0.8, segments: barres.map((_, k) => ({ barre: k, ei: z, ej: z })) }], tFin: tf, parDecade: 16 });
  const k = n / 2, x0 = k * Lb / n, x1 = x0 + Lb / n, Mg = w2 / 2 * (Lb * (x1 * x1 - x0 * x0) / 2 - (x1 ** 3 - x0 ** 3) / 3) / (x1 - x0);
  const sc = (P2 / A2 + P2 * z * z / I2 + Mg * z / I2) / 1000;   // compression au niveau du câble (MPa)
  proche((P2 - r.final.cables[k].N) / Ap2 / 1000, f546(b2, sc, z, A2, I2, Ap2, relaxation({}, sp)(tf - 28)), 0.03, 'perte à mi-portée');
});

test('Relaxation des aciers : NF EN 1992-1-1 éq. (3.29), classe 2, μ = 0,675, 500 000 h ≈ 3,5 %', () => {
  const s0 = 0.75 * 1860 * 0.9, d = relaxation({ classe: 2, rho1000: 2.5 }, s0)(500000 / 24) / s0;
  proche(d, 0.66 * 2.5 * Math.exp(9.1 * 0.675) * 500 ** (0.75 * 0.325) * 1e-5, 1e-12, 'Δσ_pr/σ_pi');
  assert.ok(d > 0.03 && d < 0.04);
});
