/** Plaque de Kirchhoff par différences finies (src/plate) : validation sur les solutions exactes et sur l'exemple. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaqueDF, grille, BandSPD } from '../src/plate/fd.js';
import { PlaqueEF } from '../src/plate/fe.js';
import { plaqueTablier, permanentPlaque, raideurAppareil, repere } from '../src/plate/deck.js';
import { transverseMoments } from '../src/guyon.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA } from '../src/loads_ec.js';
import { woodArmer } from '../src/plate/design.js';

test('Cholesky bande : système de Poisson 1D', () => {
  const n = 50, K = new BandSPD(n, 1), f = new Float64Array(n).fill(1);
  for (let i = 0; i < n; i++) { K.add(i, i, 2); if (i < n - 1) K.add(i, i + 1, -1); }
  const x = K.solve(f);
  for (let i = 0; i < n; i++) { const t = i + 1; assert.ok(Math.abs(x[i] - t * (n + 1 - t) / 2) < 1e-9); }
});

test('Plaque de Lévy (deux bords appuyés, deux bords libres) : solution exacte de Guyon-Massonnet à 99 harmoniques', () => {
  const L = 14, b = 6, nu = 0.2, D = 34000e3 * 0.7 ** 3 / (12 * (1 - nu * nu)), ysOut = [-6, -5, -4, -3, -1.5, 0, 3, 6];
  const xs = grille([0, L], 0.25), ys = grille([-b, ...ysOut, b], 0.25);
  const appuis = []; for (const x of [0, L]) for (const y of ys) appuis.push({ x, y, k: Infinity });
  const P = new PlaqueDF({ xs, ys, D, nu, appuis });
  const cas = [
    [{ x1: 0, x2: L, e1: -b, e2: b, q: 10 }],
    [L / 2 - 0.6, L / 2 + 0.6].flatMap(xa => [-5.3, -3.3].map(e => ({ x1: xa - 0.63, x2: xa + 0.63, e1: e - 0.63, e2: e + 0.63, q: 150 / 1.26 ** 2 }))),
  ];
  for (const patches of cas) {
    const F = P.vecteur(); for (const p of patches) P.chargeRectangle(F, { x1: p.x1, x2: p.x2, y1: p.e1, y2: p.e2, q: p.q });
    const w = P.resoudre(F), m = P.moments(w), i = P.plusProche(xs, L / 2);
    const ex = transverseMoments({ b, L, patches, x: L / 2, ys: ysOut, nHarm: 99, nu });
    ysOut.forEach((y, k) => {
      const p = P.idx(i, P.plusProche(ys, y));
      assert.ok(Math.abs(m.mx[p] - ex.mx[k]) < 0.005 * Math.max(...ex.mx.map(Math.abs)), `m_x y = ${y} : ${m.mx[p]} / ${ex.mx[k]}`);
      assert.ok(Math.abs(m.my[p] - ex.my[k]) < 0.01 * Math.max(...ex.my.map(Math.abs)), `m_y y = ${y} : ${m.my[p]} / ${ex.my[k]}`);
    });
    const R = P.reactions(w).reduce((s, a) => s + a.R, 0), Q = patches.reduce((s, p) => s + p.q * (p.x2 - p.x1) * (p.e2 - p.e1), 0);
    assert.ok(Math.abs(R - Q) < 1e-6 * Q);
  }
});

test('Plaque de Navier (quatre bords appuyés) : m au centre = 0,0479 q a² (ν = 0,3), flèche 0,00406 q a⁴/D', () => {
  const a = 10, nu = 0.3, D = 1e5, q = 10, xs = grille([0, a], 0.2), ys = grille([0, a], 0.2);
  const appuis = []; for (const x of xs) for (const y of ys) if (x === 0 || y === 0 || Math.abs(x - a) < 1e-9 || Math.abs(y - a) < 1e-9) appuis.push({ x, y, k: Infinity });
  const P = new PlaqueDF({ xs, ys, D, nu, appuis });
  const w = P.resoudre(P.chargeRectangle(P.vecteur(), { x1: 0, x2: a, y1: 0, y2: a, q }));
  const c = P.idx(P.plusProche(xs, a / 2), P.plusProche(ys, a / 2)), m = P.moments(w);
  assert.ok(Math.abs(m.mx[c] / (0.0479 * q * a * a) - 1) < 0.01, `${m.mx[c]}`);
  assert.ok(Math.abs(w[c] / (0.00406 * q * a ** 4 / D) - 1) < 0.01, `${w[c]}`);
});

test('Tablier de l\'exemple en plaque : équilibre, moments sur la largeur proches de la poutre, pointes sur appareils', () => {
  const st = compute(parseData(formDefaults()));
  const kv = st.bearings.rows.map(r => raideurAppareil(r.sel.bd, r.sel.n));
  const M = plaqueTablier(st.deck, { h: 0.25, E: st.p.E || 34000, nb: st.bearings.nb, kv });
  const r = permanentPlaque(M);
  const tot = st.perm.R.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(r.R.reduce((s, v) => s + v, 0) / tot - 1) < 1e-3, 'somme des réactions');
  r.R.forEach((v, i) => assert.ok(Math.abs(v / st.perm.R[i] - 1) < 0.02, `ligne ${i}`));
  const s1 = st.deck.beam.sections.findIndex(s => Math.abs(s.x - st.deck.beam.x0[1]) < 1e-6);
  assert.ok(Math.abs(r.Mtot[s1] / st.perm.M[s1] - 1) < 0.02, 'moment sur P1');
  // au droit des appareils, m_x dépasse la moyenne M/2b (pointes de l'annexe 4 § 7 du guide PSIDP-EL)
  assert.ok(Math.min(...r.mx[s1]) < 1.15 * st.perm.M[s1] / (2 * st.deck.b));
});

test('Enveloppes longitudinales accélérées (primitive, échantillons en cache) = calcul direct par ilAt / integrateIL', () => {
  const st = compute(parseData(formDefaults())), bm = st.deck.beam;
  for (const il of [bm.ILM[5], bm.ILVm[12], bm.ILR[1]]) {
    const C = bm._primitive(il);
    for (const [a, b] of [[0.3, 7.1], [bm.xMin, bm.xMax], [10.02, 10.07]]) assert.ok(Math.abs(C(b) - C(a) - bm.integrateIL(il, a, b, 0)) < 1e-9 * (1 + Math.abs(C(bm.xMax))));
    const g = bm._samples(il, bm.xMin - 3.01, 900, 0.05);
    for (let i = 0; i < 900; i++) assert.ok(Math.abs(g[i] - bm.ilAt(il, bm.xMin - 3.01 + i * 0.05)) < 1e-12);
    // essieux : balayage direct
    const axles = [{ d: 0, P: 120 }, { d: 1.2, P: 120 }, { d: 3.3, P: 60 }], e = bm.axleEnvelope(il, axles);
    let mx = -Infinity, mn = Infinity;
    for (const dir of [1, -1]) for (let i = 0, x = bm.xMin - 3.3; x <= bm.xMax + 3.3 + 1e-9; x = bm.xMin - 3.3 + ++i * 0.05) { let v = 0; for (const a of axles) v += a.P * bm.ilAt(il, x + dir * a.d); mx = Math.max(mx, v); mn = Math.min(mn, v); }
    // (au droit d'une discontinuité d'effort tranchant, l'arrondi des abscisses peut tomber d'un côté ou de l'autre du saut)
    const tol = (il.jump ? 5e-4 : 1e-9) * Math.max(Math.abs(mx), Math.abs(mn));
    assert.ok(Math.abs(e.max - mx) <= tol && Math.abs(e.min - mn) <= tol, `${e.max} / ${mx}, ${e.min} / ${mn}`);
  }
});

test('Programmation dynamique des convois : identique à l\'énumération des couples de véhicules', () => {
  const st = compute(parseData(formDefaults())), bm = st.deck.beam;
  const f = Float64Array.from({ length: 400 }, (_, i) => Math.sin(i / 23) + 0.3 * Math.cos(i / 7)), off = 37, r = bm._trainDP(f, off, 2);
  let mx = -Infinity, mn = Infinity;
  for (let i = 0; i < f.length; i++) { mx = Math.max(mx, f[i]); mn = Math.min(mn, f[i]); for (let j = i + off; j < f.length; j++) { mx = Math.max(mx, f[i] + f[j]); mn = Math.min(mn, f[i] + f[j]); } }
  assert.ok(Math.abs(r.max.v - mx) < 1e-12 && Math.abs(r.min.v - mn) < 1e-12);
  assert.ok(Math.abs(r.max.pos.reduce((s, i) => s + f[i], 0) - mx) < 1e-12);
});

test('Plaque, trafic LM1 de l\'exemple : symétrie, pointes sur appareils, cohérence avec la poutre', () => {
  const st = compute(parseData(formDefaults()));
  const kv = st.bearings.rows.map(r => raideurAppareil(r.sel.bd, r.sel.n));
  const P = new SlabDeck({ ...parseData(formDefaults()).deckInput, plaque: { nb: st.bearings.nb, kv } });
  const e = P.eurocode({ alpha: EC_ALPHA[parseData(formDefaults()).alpha] }).LM1, G = st.ec.LM1;
  const secs = P.beam.sections, ys = P.ys, nF = ys.length;
  const trapz = row => row.reduce((s, v, i) => (i ? s + (v + row[i - 1]) / 2 * (ys[i] - ys[i - 1]) : 0), 0);
  for (let s = 0; s < secs.length; s++) {
    // ouvrage et arrangements symétriques en travers : enveloppes symétriques
    for (let i = 0; i < nF; i++) for (const k of ['mxMax', 'mxMin', 'myMax', 'myMin']) assert.ok(Math.abs(e[k][s][i] - e[k][s][nF - 1 - i]) < 0.02 * (1 + Math.abs(e[k][s][i])), `${k} s${s} f${i}`);
    // ∫ enveloppe ≥ enveloppe de ∫ (moment total de la poutre)
    if (G.Mmax[s] > 500) assert.ok(trapz(e.mxMax[s]) > 0.98 * G.Mmax[s], `Σmx+ s${s}`);
    if (G.Mmin[s] < -500) assert.ok(trapz(e.mxMin[s]) < 0.98 * G.Mmin[s], `Σmx− s${s}`);
  }
  // aux sections déterminantes (moments extrêmes), sans excès déraisonnable (répartition transversale ≈ Guyon)
  const sMax = G.Mmax.indexOf(Math.max(...G.Mmax)), sMin = G.Mmin.indexOf(Math.min(...G.Mmin));
  assert.ok(trapz(e.mxMax[sMax]) < 1.3 * G.Mmax[sMax] && trapz(e.mxMin[sMin]) > 1.3 * G.Mmin[sMin], `${trapz(e.mxMax[sMax]) / G.Mmax[sMax]} ${trapz(e.mxMin[sMin]) / G.Mmin[sMin]}`);
  for (const [k, sk] of [['mxMax', sMax], ['mxMin', sMin]]) {
    const r = Math.max(...e[k][sk].map(Math.abs)) / Math.max(...G[k][sk].map(Math.abs));
    assert.ok(r > 0.9 && r < 1.3, `${k} plaque / Guyon = ${r}`);
  }
  e.RappMax.forEach((row, i) => assert.ok(row.reduce((a, b) => a + b, 0) >= 0.99 * G.Rmax[i], `appareils ligne ${i}`));
  // sur pile, m_x négatif concentré au droit des appareils (fibres ±4,5 m) plus qu'entre eux (±3 m)
  const s1 = secs.findIndex(s => Math.abs(s.x - P.beam.x0[1]) < 1e-6), j45 = ys.findIndex(y => Math.abs(y - 4.5) < 1e-6), j3 = ys.findIndex(y => Math.abs(y - 3) < 1e-6);
  if (j45 >= 0 && j3 >= 0) assert.ok(e.mxMin[s1][j45] < e.mxMin[s1][j3]);
});

test('Wood-Armer : m_x* = m_x ± |m_xy|, m_y* = m_y ± |m_xy| (règle de base, majorante)', () => {
  const r = { mxMax: [[10, 0]], mxMin: [[-5, -20]], myMax: [[3, 1]], myMin: [[-1, -2]], mxyMax: [[4, 1]], mxyMin: [[-6, -1]] };
  const w = woodArmer(r);
  assert.deepEqual(w.mxMax, [[16, 1]]); assert.deepEqual(w.mxMin, [[-11, -21]]);
  assert.deepEqual(w.myMax, [[9, 2]]); assert.deepEqual(w.myMin, [[-7, -3]]);
  // règle corrigée (m_y* < 0 → m_y* = 0, m_x* = m_x + m_xy²/|m_y|) jamais plus défavorable que la règle de base
  for (const [mx, my, mxy] of [[100, -80, 30], [50, -10, 5], [10, -100, 60]]) if (my + Math.abs(mxy) < 0) assert.ok(mx + mxy * mxy / Math.abs(my) <= mx + Math.abs(mxy));
});

test('Calcul complet en plaque : dimensionnement, chevêtres proches de l\'annexe 4 sur piles, appareils, plan de ferraillage', () => {
  const p = parseData(formDefaults());
  const st = compute({ ...p, methodeTablier: 'plaque' }), G = st.guyon;
  assert.ok(st.deck.plaque && !st.rebarError && !st.supportsError, st.rebarError || st.supportsError);
  assert.ok(st.rebar.deficits.length <= G.rebar.deficits.length);
  // aciers inférieurs longitudinaux : du même ordre que Guyon-Massonnet (CHAMOA)
  const r = Math.max(...st.design.EC.envBot) / Math.max(...G.design.EC.envBot);
  assert.ok(r > 0.9 && r < 1.2, `As inf plaque / Guyon = ${r}`);
  // pointes sur appareils des piles reprises par renforts locaux (annexe 4 § 7)
  assert.ok(st.design.EC.renfortsAppareils.length === st.deck.spans.length - 1 && st.rebar.locMarks.length === st.deck.spans.length - 1);
  // chevêtres de pile : bande ① de la plaque à ± 15 % du moment local du guide (règles calées sur MRB)
  for (const cv of st.chevetres.slice(1, -1)) {
    const g = Math.max(cv.annexe4.mc, cv.annexe4.me_neg);
    assert.ok(Math.abs(cv.bands.top[0].m / g - 1) < 0.15, `P${cv.i} : ${cv.bands.top[0].m} / ${g}`);
    assert.ok(Math.abs(cv.R2 / cv.annexe4.R2 - 1) < 0.1);
  }
  // appareil le plus chargé ≥ réaction caractéristique lue sur la plaque
  st.bearings.rows.forEach((row, i) => assert.ok(row.Pmax >= Math.max(...st.bearings.plaque[i].Rk) - 1e-6));
  // flexion transversale : lue sur la plaque, mêmes ordres de grandeur que Guyon
  st.transDesign.EC.spans.forEach((sp, j) => assert.ok(sp.bot.As / G.transDesign.EC.spans[j].bot.As > 0.8 && sp.bot.As / G.transDesign.EC.spans[j].bot.As < 1.5));
});

test('Éléments finis DKT : plaques de Navier et de Lévy, plaque biaise de Morley (30°)', () => {
  { // Navier
    const a = 10, nu = 0.3, D = 1e5, q = 10, xs = grille([0, a], 0.5), ys = grille([0, a], 0.5);
    const appuis = []; for (const x of xs) for (const y of ys) if (x === 0 || y === 0 || Math.abs(x - a) < 1e-9 || Math.abs(y - a) < 1e-9) appuis.push({ x, y, k: Infinity });
    const P = new PlaqueEF({ xs, ys, D, nu, appuis }), w = P.resoudre(P.chargeRectangle(P.vecteur(), { x1: 0, x2: a, y1: 0, y2: a, q }));
    const c = P.idx(P.plusProche(xs, a / 2), P.plusProche(ys, a / 2)), m = P.moments(w);
    assert.ok(Math.abs(m.mx[c] / (0.0479 * q * a * a) - 1) < 0.005 && Math.abs(w[c] / (0.00406 * q * a ** 4 / D) - 1) < 0.005);
  }
  { // Lévy (deux bords libres) contre Guyon-Massonnet à 99 harmoniques
    const L = 14, b = 6, nu = 0.2, D = 34000e3 * 0.7 ** 3 / (12 * (1 - nu * nu)), ysOut = [-4.5, -3, -1.5, 0, 3];
    const xs = grille([0, L], 0.25), ys = grille([-b, ...ysOut, b], 0.25);
    const appuis = []; for (const x of [0, L]) for (const y of ys) appuis.push({ x, y, k: Infinity });
    const P = new PlaqueEF({ xs, ys, D, nu, appuis }), patches = [{ x1: 0, x2: L, e1: -b, e2: b, q: 10 }];
    const w = P.resoudre(P.chargeRectangle(P.vecteur(), { x1: 0, x2: L, y1: -b, y2: b, q: 10 })), m = P.moments(w), i = P.plusProche(xs, L / 2);
    const ex = transverseMoments({ b, L, patches, x: L / 2, ys: ysOut, nHarm: 99, nu });
    ysOut.forEach((y, k) => { const p = P.idx(i, P.plusProche(ys, y)); assert.ok(Math.abs(m.mx[p] / ex.mx[k] - 1) < 0.003 && Math.abs(m.my[p] / ex.my[k] - 1) < 0.01); });
  }
  { // Morley (1963) : losange de 30°, quatre bords appuyés, ν = 0,3 : w = 4,08e-4 qL⁴/D, M_max = 0,0191 qL², M_min = 0,0108 qL²
    const L = 10, nu = 0.3, D = 1e5, q = 10, Hh = L / 2, cot = Math.sqrt(3), xs = grille([0, L], L / 32), ys = grille([0, Hh], Hh / 32);
    const appuis = []; for (const s of xs) for (const y of ys) if (s === 0 || y === 0 || Math.abs(s - L) < 1e-9 || Math.abs(y - Hh) < 1e-9) appuis.push({ x: s + y * cot, y, k: Infinity });
    const P = new PlaqueEF({ xs, ys, D, nu, appuis, psi: 100 / 3 }), w = P.resoudre(P.chargeRectangle(P.vecteur(), { x1: 0, x2: L, y1: 0, y2: Hh, q }));
    const c = P.idx(P.plusProche(xs, L / 2), P.plusProche(ys, Hh / 2)), m = P.moments(w);
    const a = (m.mx[c] + m.my[c]) / 2, r = Math.hypot((m.mx[c] - m.my[c]) / 2, m.mxy[c]);
    assert.ok(Math.abs(w[c] / (4.08e-4 * q * L ** 4 / D) - 1) < 0.03, `w ${w[c]}`);
    assert.ok(Math.abs((a + r) / (0.0191 * q * L * L) - 1) < 0.03 && Math.abs((a - r) / (0.0108 * q * L * L) - 1) < 0.05);
  }
});

test('Wood-Armer pour armatures biaises : capacité ≥ moment normal dans toute direction (faces inférieure et supérieure)', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 3000; t++) {
    const m = { mx: rnd() * 300 - 150, my: rnd() * 300 - 150, mxy: rnd() * 120 - 60 }, aGr = 40 + rnd() * 60, al = aGr * Math.PI / 200, R = repere(aGr);
    const L = k => Object.entries(R[k]).reduce((s, [g, c]) => s + c * m[g], 0), T = Math.abs(L('mxy'));
    const bot = [L('mx') + T, L('my') + T], top = [L('mx') - T, L('my') - T];
    for (let k = 0; k < 180; k++) {
      const th = k * Math.PI / 180, mn = m.mx * Math.cos(th) ** 2 + m.my * Math.sin(th) ** 2 + 2 * m.mxy * Math.sin(th) * Math.cos(th);
      const cap = M => M[0] * Math.cos(th) ** 2 + M[1] * Math.cos(th - al) ** 2;
      assert.ok(cap(bot) >= mn - 1e-9 && cap(top) <= mn + 1e-9);
    }
  }
});

test('Différences finies et éléments finis sur le tablier de l\'exemple : réactions et moments concordants', () => {
  const st = compute(parseData(formDefaults()));
  const r = moteur => permanentPlaque(plaqueTablier(st.deck, { h: 0.5, nb: 4, kv: Infinity, moteur }));
  const A = r('df'), B = r('ef');
  A.Rapp.forEach((row, i) => row.forEach((v, k) => assert.ok(Math.abs(B.Rapp[i][k] / v - 1) < 0.01)));
  const sm = st.deck.beam.sectionIndex(1, 0.5);
  A.mx[sm].forEach((v, f) => assert.ok(Math.abs(B.mx[sm][f] / v - 1) < 0.02));
});

test('Ouvrage biais en plaque (ψ = 80 gr) : équilibre, symétrie centrale, réactions plus fortes aux angles obtus', () => {
  const d = formDefaults(); d.psi = '80';
  const p = parseData(d), st = compute(p);
  const M = plaqueTablier(st.deck, { h: 0.5, nb: 4, kv: Infinity, psi: 80 }), r = permanentPlaque(M);
  const tot = st.perm.R.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(r.R.reduce((s, v) => s + v, 0) / tot - 1) < 2e-3);
  // symétrie par rapport au centre de l'ouvrage : appareil k de la ligne i ↔ appareil n−1−k de la ligne N−1−i
  const N = r.Rapp.length;
  r.Rapp.forEach((row, i) => row.forEach((v, k) => assert.ok(Math.abs(v - r.Rapp[N - 1 - i][row.length - 1 - k]) < 0.01 * Math.abs(v) + 1)));
  // culée C0 : l'angle obtus (côté y > 0 pour x = s + y cot ψ, ψ < 100 gr) est le plus chargé
  assert.ok(r.Rapp[0][3] > r.Rapp[0][0]);
});
