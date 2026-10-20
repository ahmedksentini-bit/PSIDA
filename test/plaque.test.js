/** Plaque de Kirchhoff par différences finies (src/plate) : validation sur les solutions exactes et sur l'exemple. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaqueDF, grille, BandSPD } from '../src/plate/fd.js';
import { plaqueTablier, permanentPlaque, raideurAppareil } from '../src/plate/deck.js';
import { transverseMoments } from '../src/guyon.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA } from '../src/loads_ec.js';

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
  assert.ok(trapz(e.mxMax[sMax]) < 1.25 * G.Mmax[sMax] && trapz(e.mxMin[sMin]) > 1.25 * G.Mmin[sMin]);
  for (const [k, sk] of [['mxMax', sMax], ['mxMin', sMin]]) {
    const r = Math.max(...e[k][sk].map(Math.abs)) / Math.max(...G[k][sk].map(Math.abs));
    assert.ok(r > 0.9 && r < 1.3, `${k} plaque / Guyon = ${r}`);
  }
  e.RappMax.forEach((row, i) => assert.ok(row.reduce((a, b) => a + b, 0) >= 0.99 * G.Rmax[i], `appareils ligne ${i}`));
  // sur pile, m_x négatif concentré au droit des appareils (fibres ±4,5 m) plus qu'entre eux (±3 m)
  const s1 = secs.findIndex(s => Math.abs(s.x - P.beam.x0[1]) < 1e-6), j45 = ys.findIndex(y => Math.abs(y - 4.5) < 1e-6), j3 = ys.findIndex(y => Math.abs(y - 3) < 1e-6);
  if (j45 >= 0 && j3 >= 0) assert.ok(e.mxMin[s1][j45] < e.mxMin[s1][j3]);
});
