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
import { calculPhasage, instants, relaxation, resultante } from '../src/phasage/phasage.js';
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

// ---------------------------------------------------------------- sections composées (barres décalées)
const composite = (lois, { n = 20, Lc = 20, phases }) => {
  const noeuds = Array.from({ length: n + 1 }, (_, k) => [k * Lc / n, 0]);
  const parts = [{ A: 0.4, I: 0.03, e: 0, beton: 'P' }, { A: 0.5, I: 0.5 * 0.2 ** 2 / 12, e: 0.7, beton: 'H' }];
  const barres = parts.flatMap((p, ip) => Array.from({ length: n }, (_, k) => ({ i: k, j: k + 1, ...p, nom: ip ? 'hourdis' : 'poutre' })));
  return { r: calculPhasage({ noeuds, betons: lois, barres, phases: phases(n), tFin: phases.tFin ?? 0, parDecade: 16 }), n, Lc, parts };
};
const appuisIso = n => [{ n: 0, ddl: ['ux', 'uy'] }, { n, ddl: ['uy'] }];
const tous = n => Array.from({ length: 2 * n }, (_, k) => k);

test('Section composée (élastique) : poutre + hourdis décalé = section homogène équivalente (flèche, moment)', () => {
  const E = 30000, { r, n, Lc, parts } = composite({ P: { loi: 'elastique', E }, H: { loi: 'elastique', E } },
    { phases: n => [{ t: 0, activer: tous(n), appuis: appuisIso(n), charges: Array.from({ length: n }, (_, k) => ({ barre: k, w })) }] });
  const A = parts.reduce((s0, p) => s0 + p.A, 0), yg = parts.reduce((s0, p) => s0 + p.A * p.e, 0) / A;
  const I = parts.reduce((s0, p) => s0 + p.I + p.A * (p.e - yg) ** 2, 0);
  proche(-r.final.u[3 * (n / 2) + 1], 5 * w * Lc ** 4 / (384 * E * 1000 * I), 0.01, 'flèche à mi-portée');
  const R = resultante(r.final, [n / 2 - 1, 2 * n - 1 - (n / 2)], Lc / n);
  proche(R.M, w * Lc * Lc / 8, 1e-6, 'moment de la section composée');
  assert.ok(Math.abs(R.N) < 1e-6 * w * Lc);
});

test('Section composée : retrait différentiel du hourdis — efforts et courbure = calcul de section indépendant', () => {
  const E = 30000, eps = -300e-6, { r, n, Lc, parts } = composite({ P: { loi: 'elastique', E }, H: { loi: 'elastique', E, epsInf: eps, T: 50 } },
    { phases: Object.assign(n => [{ t: 0, activer: tous(n), appuis: appuisIso(n) }], { tFin: 5000 }) });
  // ε(y) = ε0 − κ y ; Nk = E Ak (ε0 − κ ek − εsh,k), Mk = E Ik κ ; ΣN = 0, Σ(Mk − Nk ek) = 0
  const sh = [0, eps * (1 - Math.exp(-5000 / 50))], Ek = E * 1000;
  const a11 = parts.reduce((s0, p) => s0 + Ek * p.A, 0), a12 = -parts.reduce((s0, p) => s0 + Ek * p.A * p.e, 0);
  const a21 = -parts.reduce((s0, p) => s0 + Ek * p.A * p.e, 0), a22 = parts.reduce((s0, p) => s0 + Ek * (p.I + p.A * p.e * p.e), 0);
  const b1 = parts.reduce((s0, p, k) => s0 + Ek * p.A * sh[k], 0), b2 = -parts.reduce((s0, p, k) => s0 + Ek * p.A * sh[k] * p.e, 0);
  const det = a11 * a22 - a12 * a21, e0 = (b1 * a22 - a12 * b2) / det, kap = (a11 * b2 - a21 * b1) / det;
  const Nh = Ek * parts[1].A * (e0 - kap * parts[1].e - sh[1]);
  proche(r.final.barres[2 * n - 1 - n / 2].N, Nh, 1e-3, 'effort normal du hourdis');
  proche(-r.final.u[3 * (n / 2) + 1], kap * Lc * Lc / 8, 1e-3, 'flèche (courbure uniforme)');
  assert.ok(Nh > 0, 'hourdis tendu par son retrait gêné');
});

test('Section composée homogène (même béton, même âge) : le fluage ne redistribue rien entre les parties', () => {
  const o = { fck: 35, RH: 70, h0: 300, avecRetrait: false, tCoulage: 0 };
  const { r, n } = composite({ P: o, H: o }, { phases: Object.assign(n => [{ t: 28, activer: tous(n), appuis: appuisIso(n), charges: Array.from({ length: n }, (_, k) => ({ barre: k, w })) }], { tFin: 10000 }) });
  const k0 = r.pas.findIndex(p => p.t === 28), a = r.pas[k0].barres[2 * n - 1 - n / 2].N, b = r.final.barres[2 * n - 1 - n / 2].N;
  proche(b, a, 1e-6, 'effort du hourdis constant');
  const b2 = betonEC2(o), ratio = r.final.u[3 * (n / 2) + 1] / r.pas[k0].u[3 * (n / 2) + 1];
  proche(ratio, b2.E(28) * b2.J(10000, 28), 1e-6, 'flèche × E(t0)·J(t, t0)');
});

test('Modèle type « poutres rendues continues » : câblage du générateur (élastique) et note', async () => {
  const { poutresContinues, DEFAUTS_POUTRES, momentsRemarquables } = await import('../src/phasage/exemples.js');
  const p = { ...DEFAUTS_POUTRES, cable: { ...DEFAUTS_POUTRES.cable, P: 0 } };
  const { modele, reperes } = poutresContinues(p);
  modele.betons = { P: { loi: 'elastique', E: 35000, tCoulage: 0 }, H: { loi: 'elastique', E: 35000, tCoulage: 60 } };
  const r = calculPhasage(modele), m = momentsRemarquables(r.final, reperes, resultante);
  // sans fluage : seules les superstructures (posées après clavage) voient la continuité — trois travées égales
  proche(m.appuis[0], -0.1 * p.gSup * p.L ** 2, 0.01, 'moment sur appui 1 (maillage de 10 barres)');
  proche(m.travees[1], (p.poutre.A + p.hourdis.A) * p.gBeton * p.L ** 2 / 8 + 0.025 * p.gSup * p.L ** 2, 0.01, 'mi-travée centrale');
  // avec les lois de l'Eurocode : le moment sur appui devient moins négatif que −0,1 g L²… ou plus, mais il évolue
  const { computePhasage, phasageBlocks } = await import('../web/phasage_view.js');
  const out = computePhasage({}), B = phasageBlocks(out);
  assert.ok(B.some(b => b.t === 'svg') && B.some(b => b.t === 'table'));
  const ma = momentsRemarquables(out.r.final, out.reperes, resultante).appuis[0];
  assert.ok(Math.abs(ma + 0.1 * 8 * 625) > 20, 'redistribution par fluage et retrait visible');
});

// ---------------------------------------------------------------- pertes instantanées (§ 5.10.5)
test('Pertes instantanées : frottement exponentiel, recul d’ancrage (λ = √(g E_p A_p / p)), aire conservée', async () => {
  const { pertesInstantanees } = await import('../src/phasage/precontrainte.js');
  const Ap = 0.003, EpAp = 195e6 * Ap, P0 = 4000, mu = 0.19, k = 0.007, g = 0.006;
  const segs = Array.from({ length: 10 }, () => ({ L: 4, alpha: 0 }));
  const r = pertesInstantanees({ P0, mu, k, g, Ap }, segs);
  proche(r.avant[r.avant.length - 1], P0 * Math.exp(-mu * k * 40), 1e-12, 'frottement en bout');
  const p = P0 * mu * k, lam = Math.sqrt(g * EpAp / p);
  // exact (frottement exponentiel, a = μk) : 2 P0 [(1 − e^{−aλ})/a − λ e^{−aλ}] = g E_p A_p ; ≈ √(g E_p A_p / p) à 1–2 %
  const a = mu * k, F = l => 2 * P0 * ((1 - Math.exp(-a * l)) / a - l * Math.exp(-a * l)) - g * EpAp;
  let lo = 0, hi = 40; for (let it = 0; it < 100; it++) { const m = (lo + hi) / 2; if (F(m) > 0) hi = m; else lo = m; }
  proche(r.lambda[0], lo, 2e-3, 'λ exact'); proche(r.lambda[0], lam, 0.02, 'λ ≈ √(g E_p A_p / p)');
  proche(r.avant[0] - r.apres[0], 2 * P0 * (1 - Math.exp(-a * lo)), 2e-3, 'perte à l’ancrage');
  const aire = (a, b) => { let s0 = 0; for (let i = 1; i < r.x.length; i++) s0 += ((a[i - 1] - b[i - 1]) + (a[i] - b[i])) / 2 * (r.x[i] - r.x[i - 1]); return s0; };
  proche(aire(r.avant, r.apres), g * EpAp, 1e-6, 'aire de la perte = E_p A_p g');
  // câble court : λ dépasse la longueur, tout le câble est affecté, aire conservée
  const c = pertesInstantanees({ P0, mu, k, g, Ap }, [{ L: 6, alpha: 0 }]);
  assert.equal(c.lambda[0], 6); proche((() => { let s0 = 0; for (let i = 1; i < c.x.length; i++) s0 += ((c.avant[i - 1] - c.apres[i - 1]) + (c.avant[i] - c.apres[i])) / 2 * (c.x[i] - c.x[i - 1]); return s0; })(), g * EpAp, 1e-6, 'aire, câble court');
});

test('Pertes instantanées : câble parabolique (déviations angulaires) et mise en tension par les deux extrémités', async () => {
  const { pertesInstantanees } = await import('../src/phasage/precontrainte.js');
  const L = 30, f = 0.9, n = 12, ex = x => -4 * f * x / L * (1 - x / L);
  const segs = Array.from({ length: n }, (_, i) => { const a = i * L / n, b = a + L / n; return { L: Math.hypot(L / n, ex(b) - ex(a)), alpha: Math.atan((ex(b) - ex(a)) / (L / n)) }; });
  const theta = Math.abs(segs[n - 1].alpha - segs[0].alpha), Ls = segs.reduce((s0, q) => s0 + q.L, 0);
  const r = pertesInstantanees({ P0: 3000, mu: 0.19, k: 0.007, g: 0.006, Ap: 0.0025 }, segs);
  proche(r.avant[r.avant.length - 1], 3000 * Math.exp(-0.19 * (theta + 0.007 * Ls)), 1e-9, 'frottement en bout, θ = somme des déviations');
  assert.ok(theta > 0.9 * 8 * f / L && theta < 8 * f / L, `θ = ${theta}`);
  const d = pertesInstantanees({ P0: 3000, mu: 0.19, k: 0.007, g: 0.006, Ap: 0.0025, tension: 'deux' }, segs);
  d.P.forEach((v, i) => proche(v, d.P[n - 1 - i], 1e-9, 'symétrie'));
  assert.ok(Math.min(...d.P) > Math.min(...r.P), 'deux extrémités : moins de pertes au milieu');
});

test('Pertes instantanées dans le calcul par phases : P0 au vérin → forces par segment', () => {
  const r = calculPhasage({ noeuds: [[0, 0], [10, 0], [20, 0]], betons: { B: { loi: 'elastique', E: 35000 } },
    barres: [{ i: 0, j: 1, A: 1, I: 0.1, beton: 'B' }, { i: 1, j: 2, A: 1, I: 0.1, beton: 'B' }],
    phases: [{ t: 0, activer: [0, 1], appuis: [{ n: 0, ddl: ['ux', 'uy'] }, { n: 2, ddl: ['uy'] }] }],
    cables: [{ Ap: 0.003, P0: 4000, mu: 0.19, k: 0.007, g: 0.006, phase: 0, segments: [{ barre: 0, ei: 0, ej: -0.4 }, { barre: 1, ei: -0.4, ej: 0 }] }], tFin: 0 });
  const pi = r.pertesInstantanees[0];
  r.final.cables.forEach((c, i) => proche(c.N, pi.P[i], 1e-9, 'force injectée'));
  assert.ok(pi.P[0] < 4000 && pi.P[1] < pi.P[0] + 1e-9 || pi.lambda[0] > 10);
});

test('Fléaux par encorbellements (élastique, sans câbles ni équipage) : moment sur pile = console sous poids propre', async () => {
  const { fleaux, DEFAUTS_FLEAU, momentsFleau } = await import('../src/phasage/exemples.js');
  const p = { ...DEFAUTS_FLEAU, Qeq: 0, cable: { ...DEFAUTS_FLEAU.cable, P0: 0 }, continuite: { ...DEFAUTS_FLEAU.continuite, n: 0 } };
  const { modele, reperes } = fleaux(p);
  modele.cables = [];
  for (const k of Object.keys(modele.betons)) modele.betons[k] = { loi: 'elastique', E: 36000, tCoulage: modele.betons[k].tCoulage };
  const r = calculPhasage(modele);
  // console de droite du fléau 1 : M(pile) = −Σ w_k ℓ_k d_k (barres D0…Dnv)
  let M = 0; for (const b of reperes.F[0].bD) { const bb = modele.barres[b], [xi] = modele.noeuds[bb.i], [xj] = modele.noeuds[bb.j]; M -= bb.A * p.gBeton * (xj - xi) * ((xi + xj) / 2 - reperes.F[0].xp); }
  const kFin = r.finPhase[modele.phases.findIndex(ph => /Clavages/.test(ph.nom)) - 1];
  proche(momentsFleau(r.pas[kFin], reperes).P1, M, 1e-9, 'moment sur pile en fin de construction');
  // sans fluage, le clavage ne change rien avant les superstructures (clé à 0)
  const kAv = r.finPhase[modele.phases.length - 2];
  assert.ok(Math.abs(momentsFleau(r.pas[kAv], reperes).cle) < 1e-6 * Math.abs(M));
});

test('Contre-flèches des fléaux (élastique, sans câbles) = flèches de la console complète sous les charges postérieures au réglage', async () => {
  const { fleaux, DEFAUTS_FLEAU, contreflechesFleau } = await import('../src/phasage/exemples.js');
  const p = { ...DEFAUTS_FLEAU, Qeq: 0, continuite: { ...DEFAUTS_FLEAU.continuite, n: 0 } };
  const { modele, reperes: R } = fleaux(p);
  modele.cables = [];
  const E = 36000e3; for (const k of Object.keys(modele.betons)) modele.betons[k] = { loi: 'elastique', E: E / 1000, tCoulage: modele.betons[k].tCoulage };
  const r = calculPhasage(modele), cf = contreflechesFleau(r, modele, R).filter(c => c.cote === 'D');
  // console droite du fléau 1 : charges réparties w_k sur [r_k, r_{k+1}] (k = 0…nv), I constant par barre ;
  // flèche du point a sous les voussoirs q ≥ k (posés après le réglage du joint k) : ∫ M(x)(a − x)/EI dx (aires des moments)
  const bars = R.F[0].bD.map(b => { const bb = modele.barres[b]; return { x0: modele.noeuds[bb.i][0] - R.F[0].xp, x1: modele.noeuds[bb.j][0] - R.F[0].xp, w: bb.A * p.gBeton, I: bb.I }; });
  const fleche = (a, qMin) => {
    let s0 = 0; const nG = 400, L = bars[bars.length - 1].x1;
    for (let i = 0; i < nG; i++) {
      const x = (i + 0.5) * Math.min(a, L) / nG; if (x > a) break;
      let M = 0; for (let q = qMin; q < bars.length; q++) { const b = bars[q], l0 = Math.max(b.x0, x); if (b.x1 > l0) M -= b.w * (b.x1 - l0) * ((b.x1 + l0) / 2 - x); }
      const I = bars.find(b => x >= b.x0 && x <= b.x1).I; s0 += M * (a - x) / (E * I) * Math.min(a, L) / nG;
    }
    return s0;   // vers le haut positif (M négatif → flèche vers le bas, s0 < 0)
  };
  for (const c of cf) {
    const attendu = c.k === 0 ? fleche(c.x - R.F[0].xp, 0) : fleche(c.x - R.F[0].xp, c.k);
    proche(c.construction, attendu, 0.01, `joint ${c.k} : déplacement de construction`);
  }
  assert.ok(cf[cf.length - 1].contrefleche > 0, 'contre-flèche positive (vers le haut) en bout de fléau');
});
