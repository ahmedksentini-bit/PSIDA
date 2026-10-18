/**
 * Module PSI-DP (précontrainte longitudinale) — calage sur la note modèle SETRA PSIDP-EL 84-1 (dossier pilote PSI-DP) :
 * 13,50 – 17,61 – 17,61 – 13,50 m, 18 câbles 12T13 tendus aux deux extrémités, σ_p0 = 151 000 t/m², unités de la note
 * (t, m, t/m²). Valeurs de référence : ref/reports/psidp_spec.md § 6 (page NP de la note entre parenthèses).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prestress } from '../src/psidp/prestress.js';
import { ContinuousBeam } from '../src/beam.js';

export const SPANS = [13.5, 17.61, 17.61, 13.5];
const P = (A, B, C, x1) => ({ A, B, C, x1 });
export const SEGS = [
  [P(0.003698, -0.040182, 0, 5.4), P(0.005784, -0.062708, 0.060818, 11.126), P(-0.013896, 0.375184, -2.375077, 13.5)],
  [P(-0.019766, 0, 0.157419, 1.766), P(0.004727, -0.086519, 0.233824, 8.805), P(0.005558, -0.101160, 0.298284, 15.852), P(-0.021352, 0.752021, -6.464108, 17.61)],
  [P(-0.021350, 0, 0.157419, 1.758), P(0.005558, -0.094605, 0.240570, 8.805), P(0.004727, -0.079964, 0.176116, 15.844), P(-0.019770, 0.696308, -5.973562, 17.61)],
  [P(-0.013896, 0, 0.157419, 2.374), P(0.005784, -0.093456, 0.268370, 8.1), P(0.003698, -0.059668, 0.131528, 13.5)],
];
const bm = new ContinuousBeam(SPANS, { nGrid: 200 });
const u = bm.uniformLoad(17.075), xsG = bm.sections.map(s => s.x);
const MGmean = x => { let k = 0; while (k < xsG.length - 2 && xsG[k + 1] < x) k++; const t = (x - xsG[k]) / (xsG[k + 1] - xsG[k] || 1); return u.M[k] + t * (u.M[k + 1] - u.M[k]); };
export const INPUT = {
  spans: SPANS, sec: { B: 5.43, I: 0.136392, v: 0.273, vp: 0.277 },
  cable: { n: 18, Ap: 1116e-6, phiG: 0.07, segs: SEGS, sigma0: 151000, f: 0.18, phi: 0.002, g: 0.006, Ep: 19.4e6, rho1000: 2.5, mu0: 0.43, fprg: 189000, ends: 'both', friction: 'dixiemes' },
  mat: { Eij: 3128069, Ei28: 3216226, epsR: 2e-4, Kfl: 2, rj: 0.5 },
  MGmean,
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} : note ${b}, outil ${a.toFixed(3)}`);
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : note ${b}, outil ${a.toFixed(3)} (${(100 * (a - b) / b).toFixed(2)} %)`);

test('PSI-DP — section nette, frottement, recul d\'ancrage, raccourcissement, tensions initiales (NP 27-29)', () => {
  const r = prestress(INPUT);
  rel(r.nAp, 0.020088, 1e-6, 'n A_p'); rel(r.Bn, 5.3607, 1e-4, 'B_n');
  const x04 = r.xOf(0, 0.4), x10 = r.xOf(0, 1);
  rel(r.at(r.friction.s, x04), 148308, 2e-4, 'σ_p0(x) 0,4 L'); rel(r.at(r.friction.s, x10), 142691, 2e-4, 'σ_p0(x) 1,0 L');
  rel(r.recoil.left.d, 13.171, 2e-3, 'longueur d\'influence du recul');
  near(r.at(r.recoil.loss, 0), 15959, 20, 'perte au blocage x = 0'); near(r.at(r.recoil.loss, x04), 10575, 20, 'perte au blocage 0,4 L');
  rel(r.shortening.dSc, 2218, 0.015, 'raccourcissement élastique');
  for (const [x, dsi, spi] of [[0, 18176, 132824], [x04, 15485, 135515], [x10, 10527, 140473]]) { near(r.at(r.dSi, x), dsi, 60, `Δσ_i x = ${x.toFixed(2)}`); near(r.at(r.spi, x), spi, 60, `σ_pi x = ${x.toFixed(2)}`); }
  near(r.at(r.MT.max.sig, x04), 141632, 60, 'σ_pi max 0,4 L'); near(r.at(r.MT.min.sig, x04), 129398, 80, 'σ_pi min 0,4 L');
  for (const [x, v] of [[0, 5435], [x04, 5834], [x10, 6600]]) near(r.at(r.delayed.dRho, x), v, 25, `relaxation x = ${x.toFixed(2)}`);
  near(r.delayed.dR, 3880, 0.5, 'retrait');
});

test('PSI-DP — pertes différées réajustées, tensions et forces M.S / E.S (NP 33-34)', () => {
  const r = prestress(INPUT);
  const x0 = 0, x04 = r.xOf(0, 0.4), x09 = r.xOf(0, 0.9), x10 = r.xOf(0, 1), x25 = r.xOf(1, 0.5);
  for (const [x, v] of [[x0, 5358], [x04, 5978], [x09, 6892], [x10, 5543], [x25, 6782]]) rel(r.at(r.delayed.dFl, x), v, 0.025, `fluage réajusté x = ${x.toFixed(2)}`);
  for (const [x, v] of [[x0, 13916], [x04, 14844], [x10, 15138]]) rel(r.at(r.delayed.dSd, x), v, 0.012, `Δσ_d E.S x = ${x.toFixed(2)}`);
  rel(r.at(r.ES.moy.sig, x04), 120672, 2e-3, 'σ_p E.S moyen 0,4 L'); rel(r.at(r.ES.min.sig, x04), 111586, 3e-3, 'σ_p E.S P2 0,4 L');
  rel(r.at(r.MS.moy.sig, x04), 128094, 2e-3, 'σ_p M.S moyen 0,4 L'); rel(r.at(r.MS.max.sig, x04), 135695, 2e-3, 'σ_p M.S P1 0,4 L');
  rel(r.at(r.MT.moy.F, x04), 2722, 3e-3, 'F initiale moyenne 0,4 L'); rel(r.at(r.MT.max.F, x04), 2845, 3e-3, 'F initiale max 0,4 L');
  rel(r.at(r.ES.min.F, x10), 2354, 4e-3, 'F E.S min appui 2'); rel(r.at(r.ES.min.F, x25), 2205, 5e-3, 'F E.S min 0,5 L travée 2');
});

test('PSI-DP — moments, tranchants et réactions hyperstatiques (NP 31-34, 51)', () => {
  const r = prestress(INPUT);
  for (const [ph, kk, a2, a3] of [['MT', 'moy', 12.3, 141.7], ['MT', 'max', 14.4, 146.8], ['MS', 'moy', 11.8, 133.6], ['MS', 'max', 14.1, 140.3], ['ES', 'moy', 11.3, 125.5], ['ES', 'min', 9.0, 117.2]]) {
    const X = r[ph][kk].hyp.X; near(X[1], a2, 1.2, `M_hyp appui 2 ${ph} ${kk}`); near(X[2], a3, 2.0, `M_hyp appui 3 ${ph} ${kk}`); near(X[3], X[1], 0.2, 'symétrie');
  }
  const h = r.ES.min.hyp; near(h.V[0], 0.7, 0.15, 'V_hyp travée 1 E.S'); near(h.V[1], 6.2, 0.2, 'V_hyp travée 2 E.S');
  near(h.R[0], 0.7, 0.15, 'R_hyp appui 1'); near(h.R[1], 5.5, 0.3, 'R_hyp appui 2'); near(h.R[2], -12.4, 0.4, 'R_hyp appui 3');
});

test('PSI-DP — contraintes classe II, section d\'enrobage, aciers passifs, ELU, effort tranchant (NP 35-56)', async () => {
  const { psidpChecks, mLim } = await import('../src/psidp/checks.js');
  const r = prestress(INPUT), x04 = r.xOf(0, 0.4), x10 = r.xOf(0, 1);
  const area = x => MGmean(x) / 17.075;                    // aire de la ligne d'influence de M (C.P. unitaire)
  const G = (x, a, b, c) => ({ min: a * area(x), moy: b * area(x), max: c * area(x) });
  // moments des charges d'exploitation rares à 0,4 L (Mc120 321,2 + trottoirs 7,7 ; NP 39) et sur l'appui 2 (déduit de NP 39)
  const pick = (x, a, b) => (Math.abs(x - x04) < 1e-6 ? a : b);
  const chk = psidpChecks(r, {
    sec: { B: 5.43, I: 0.136392, v: 0.273, vp: 0.277, h: 0.55, bTop: 10.0, bBot: 9.6 }, phiG: 0.07, nCables: 18, Ep: 19.4e6,
    stations: [{ x: x04, label: '0,4 L travée 1' }, { x: x10, label: 'appui 2' }],
    M: { oss: x => G(x, 13.303, 13.575, 13.847), cp: x => G(x, 16.303, 17.075, 17.846),
      rare: x => pick(x, { max: 328.9, min: -60 }, { max: 20, min: -297.4 }), freq: x => pick(x, { max: 123.6, min: -30 }, { max: 10, min: -150 }),
      elu: x => pick(x, { max: 0, min: 0 }, { max: 0, min: -935.8 }) },
    V: { els: () => ({ max: 0, min: -283.2 }), elu: () => ({ max: 0, min: -391.1 }) },
    lim: { fcj: 2300, fc28: 2500, ftj: 199, ft28: 211 },
    steel: { fe: 40000, skin: 3e-4, Es: 2e7, gs: 1.15, gp: 1.15, gb: 1.5, fpeg: 168000, cover: 0.035, atMin: 0 },
  });
  const [s04, s10] = chk.stresses;
  // E.S rare : max fibre sup. 1 033 et min fibre inf. −206 à 0,4 L ; bord de la section d'enrobage −64 (commentaire NP 39)
  const rare04 = s04.phases.ES.rare[0];
  near(rare04.s, 1033, 6, 'E.S rare σ sup 0,4 L'); near(rare04.i, -206, 6, 'E.S rare σ inf 0,4 L'); near(rare04.enc, -64, 6, 'bord de la section d\'enrobage 0,4 L');
  const rare10 = s10.phases.ES.rare[1];
  near(rare10.s, -199, 6, 'E.S rare σ sup appui 2'); near(rare10.i, 1087, 8, 'E.S rare σ inf appui 2'); near(rare10.enc, -173, 8, 'enrobage appui 2');
  // aciers passifs (toute la largeur) : peau 0,003000 / 0,002880 ; 1,5 ‰ B = 0,008145 sur appui ; non-fragilité
  rel(chk.steel[0].top.skin, 0.003, 1e-6, 'peau sup.'); rel(chk.steel[0].bot.skin, 0.00288, 1e-6, 'peau inf.');
  rel(chk.steel[1].bot.sup, 0.008145, 1e-4, '1,5 ‰ B'); rel(chk.steel[0].bot.nf, 0.003190, 0.01, 'non-fragilité inf. 0,4 L'); rel(chk.steel[1].top.nf, 0.003104, 0.01, 'non-fragilité sup. appui 2');
  // ELU E.S sur l'appui 2 : M_cal −556,3, M_lim −610,3 (déformations −3,50 ‰ ; 3,02 ‰)
  const e = chk.elu.find(q => q.label === 'appui 2' && q.ph === 'ES');
  near(e.min.Mcal, -556.3, 2, 'M_cal ELU appui 2');
  const ml = mLim({ N: 2354, hog: true, h: 0.55, v: 0.273, vp: 0.277, b: 9.6, As: 0.0031, d: 0.515, zc: 0.157, Ap: 0.020088, sp2: 117182, Ep: 19.4e6, Es: 2e7, fbu: 0.85 * 2500 / 1.5, fsu: 40000 / 1.15, fpu: 168000 / 1.15 });
  rel(ml.Mlim, 610.3, 0.01, 'M_lim appui 2'); near(ml.es, 3.02, 0.05, 'ε acier passif');
  const m4 = mLim({ N: 2242, hog: true, h: 0.55, v: 0.273, vp: 0.277, b: 9.6, As: 0.003, d: 0.515, zc: -0.10915, Ap: 0.020088, sp2: 111586, Ep: 19.4e6, Es: 2e7, fbu: 0.85 * 2500 / 1.5, fsu: 40000 / 1.15, fpu: 168000 / 1.15 });
  rel(m4.Mlim, 466.8, 0.01, 'M_lim min 0,4 L');
  // effort tranchant à h/2 de l'appui 2 côté travée 1 : V_red 265,2 (ELS) / 365,5 (ELU), σ_x 434, τ 81 / τ̄ 233, τ_u 111, bielle 257 / 944
  const sh = chk.shear.find(q => q.support === 1 && q.side === 'gauche');
  rel(Math.abs(sh.Vels), 265.2, 0.01, 'V réduit ELS'); rel(sh.sx, 434, 0.01, 'σ_x'); near(sh.tau, 81, 1.5, 'τ ELS'); near(sh.tauBar, 233, 2, 'τ̄');
  // ELU : la note retranche 25,6 t (relevage × 1,42) ; PSIDA retranche le relevage sans majoration (18,6 t) : +1,9 % du côté de la sécurité
  rel(Math.abs(sh.Velu), 365.5, 0.025, 'V réduit ELU'); near(sh.tauU, 111, 3, 'τ_u'); near(sh.beta * 200 / Math.PI, 33.333, 0.01, 'β_u'); near(sh.sb, 257, 7, 'bielle'); near(sh.sbLim, 944, 1, 'limite bielle');
});

test('PSI-DP — dimensionnement intégré au modèle PSIDA (18-24-18 m, h = 0,85 m) : nombre minimal d\'unités, note', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const { buildNote } = await import('../web/note.js');
  const st = compute(parseData({ ...formDefaults(), spans: '18, 24, 18', h: '0.85', bp_actif: 'on' }));
  assert.equal(st.psidpError, null);
  const dp = st.psidp;
  assert.ok(dp.ok && dp.auto && dp.n >= 10 && dp.n <= 30, `n = ${dp.n}`);
  assert.ok(dp.opt && dp.opt.feasible && dp.opt.path.some(([k, m]) => k === dp.n - 1 && m < 0), 'n − 1 insuffisant avec le tracé recherché');
  assert.ok(dp.c.extremes.every(e => e.ok)); assert.ok(dp.c.elu.every(e => e.min.ok && e.max.ok));
  assert.ok(dp.geoChk.Rmin >= dp.unit.Rmin && !dp.geoChk.gaps.length, 'tracé automatique continu');
  // pertes totales moyennes plausibles (15 à 30 %) et symétrie de l'ouvrage symétrique
  const loss = 1 - dp.r.ES.moy.sig.reduce((a, v) => a + v, 0) / dp.r.ES.moy.sig.length / (dp.sigma0 * 1000);
  assert.ok(loss > 0.12 && loss < 0.32, `pertes ${loss}`);
  const X = dp.r.ES.min.hyp.X; assert.ok(Math.abs(X[1] - X[2]) < 1e-6 * Math.abs(X[1]) + 1e-6);
  // nombre imposé insuffisant → contraintes non vérifiées
  const st2 = compute(parseData({ ...formDefaults(), spans: '18, 24, 18', h: '0.85', bp_actif: 'on', bp_n: String(dp.n - 4) }));
  assert.ok(!st2.psidp.ok);
  const note = buildNote(st, { ref: 'F61' });
  const i = note.blocks.findIndex(b => b.t === 'h1' && /Précontrainte longitudinale/.test(b.text));
  assert.ok(i > 0);
  const ch = note.blocks.slice(i + 1, note.blocks.findIndex((b, k) => k > i && b.t === 'h1'));
  assert.ok(ch.filter(b => b.t === 'svg').length >= 5 && !JSON.stringify(ch).includes('NaN'));
  assert.ok(!JSON.stringify(ch).includes('— — L'));
  // dalle en béton armé sur grandes portées : le plan de ferraillage BA ne bloque plus le calcul
  assert.ok(st.rebar || st.rebarError);
});

test('PSI-DP — flèches (NP 58) et flexion transversale due à la précontrainte (NP 48)', async () => {
  const { deflection } = await import('../src/psidp/prestress.js');
  const { SlabDeck } = await import('../src/analysis.js');
  const { TransverseModel } = await import('../src/transverse.js');
  const r = prestress(INPUT), I = 0.136392, Ei = 3128069, E28 = 3216226, x04 = r.xOf(0, 0.4);
  const MG = r.xs.map(x => MGmean(x)), MO = MG.map(v => v * 13.575 / 17.075), MP = ph => r.xs.map((x, i) => ph.F[i] * r.z[i] + ph.Mhyp[i]);
  const w = (M, E) => 1000 * r.at(deflection(r.xs, M, SPANS, E * I).w, x04);
  near(w(MO, Ei), -5.2, 0.1, 'flèche ossature instantanée 0,4 L [mm]');
  near(w(MG, Ei), -6.6, 0.1, 'flèche C.P. instantanée');
  near(3 * w(MG, E28), -19.1, 0.15, 'flèche C.P. à long terme (E_v28)');
  near(w(MP(r.MT.moy), Ei), 8.5, 0.35, 'contre-flèche de précontrainte instantanée');
  near(2 * w(MP(r.ES.moy), E28), 15.0, 0.3, 'contre-flèche de précontrainte par fluage');
  near(w(MP(r.MT.moy), Ei) + 2 * w(MP(r.ES.moy), E28) + 3 * w(MG, E28), 4.4, 0.6, 'flèche en service après fluage');
  // travée droite équivalente de la note (2b/sin φ = 9,961 m, λ′ = 14,482 m), ν = 0,2 : p = −F2 (A2 + A3)/9 = −2,52 t/m²
  const sp = Math.sin(89.977 * Math.PI / 200), b = 9.961 / 2, half = 3.75 / sp;
  const deck = new SlabDeck({ spans: SPANS, width: 9.961, h: 0.55, roadway: { y1: -half, y2: half }, footways: [{ y1: -b, y2: -half }, { y1: half, y2: b }], Leq: [12.194, 14.482, 14.482, 12.194], nu: 0.2, ys: [0, -2.459 / sp, -3.689 / sp] });
  const m = new TransverseModel(deck, { tRev: 0.08, nHarm: 15 }), u = m.response(1, 'pp', m.bandPatches(1, -b, b)).my, p = -2205 * (0.004727 + 0.005558) / 9;
  rel(p, -2.52, 2e-3, 'poussée transversale');
  [-6.752, -5.186, -3.105].forEach((ref, i) => rel(p * u[i], ref, 0.04, `MY_PREC fibre ${[1, 2, 4][i]}`));
});

test('PSI-DP — recherche du tracé (nombre d\'unités minimal) et zones d\'about (BPEL annexe 4)', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const base = { ...formDefaults(), bp_actif: 'on' };
  // ouvrage à deux travées inégales (15 + 22 m) : le tracé standard (excentricités maximales) ne convient pour aucun nombre
  // d'unités raisonnable ; le tracé recherché trouve une solution
  const opt = compute(parseData({ ...base, spans: '15, 22', h: '0.8' })).psidp;
  assert.ok(opt.ok && opt.opt.feasible, `n = ${opt.n}`);
  const std = compute(parseData({ ...base, spans: '15, 22', h: '0.8', bp_trace: 'standard' })).psidp;
  assert.ok(!std.ok || std.n >= opt.n);
  const s3 = compute(parseData({ ...base, spans: '18, 24, 18', h: '0.85' })).psidp, s3s = compute(parseData({ ...base, spans: '18, 24, 18', h: '0.85', bp_trace: 'standard' })).psidp;
  assert.ok(s3.n <= s3s.n && s3.ok && s3s.ok, `${s3.n} / ${s3s.n}`);
  // zones d'about : formules de l'annexe 4 recalculées à la main
  const A = s3.anchors, U = s3.unit, Fj0 = U.Ap * s3.sigma0 * 1000, ssl = 2 / 3 * 500000;
  rel(A.Fj0, Fj0, 1e-9, 'F_j0'); rel(A.As, 0.04 * Fj0 / ssl, 1e-9, 'frettage de surface');
  const d = A.dv, e = A.dh;
  rel(A.vert.sigT, 0.5 * (1 - A.a / d) * Fj0 / (e * d), 1e-9, 'σ_t éclatement'); rel(A.vert.Ae, Math.max(0.25 * (1 - A.a / d) * Fj0 / ssl, 0.15 * Fj0 / ssl), 1e-9, 'A_e');
  assert.equal(A.rows, 1); assert.ok(A.general.every(g => Math.abs(g.Vmax) < 0.05 * Fj0), 'ancrages centrés : équilibre général quasi nul');
});
