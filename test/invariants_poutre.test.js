/**
 * Invariants physiques sur des ouvrages tirés au hasard (1/3) : poutre continue, Guyon-Massonnet, grillage de poutres.
 * Les tirages sont reproductibles (test/alea.mjs) ; un échec affiche la graine du tirage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tirages, ecart } from './alea.mjs';
import { ContinuousBeam } from '../src/beam.js';
import { coefK, coefKFunction } from '../src/guyon.js';
import { grillagePoutres } from '../src/beams/grillage.js';
import { TablierCourbon } from '../src/beams/index.js';

/** Travure tirée dans le domaine d'emploi des ponts-dalles (1 à 5 travées de 5 à 30 m, rapports de portées 0,5 à 1). */
function travure(r, { symetrique = false } = {}) {
  const n = r.entier(1, 5), Lc = r.entre(8, 30);
  let spans = Array.from({ length: n }, () => r.arrondi(Lc * r.entre(0.5, 1), 0.05));
  if (symetrique) spans = spans.map((L, j) => spans[Math.min(j, n - 1 - j)]);
  const a = r.u() < 0.3 ? 0 : r.arrondi(r.entre(0.2, 1.0), 0.05);
  return { spans, overhangs: [a, symetrique ? a : (r.u() < 0.3 ? 0 : r.arrondi(r.entre(0.2, 1.0), 0.05))] };
}

test('poutre continue — chaque position de la charge unité : somme des réactions = 1', () => {
  tirages(60, (r, ctx) => {
    const t = travure(r), bm = new ContinuousBeam(t.spans, { overhangs: t.overhangs, nGrid: r.entier(20, 80) });
    ctx.desc = JSON.stringify(t);
    for (let p = 0; p < bm.positions.length; p++) {
      let s = 0; for (const il of bm.ILR) s += il[p];
      assert.ok(Math.abs(s - 1) < 1e-9, `position ${p} (x = ${bm.xs[p]}) : ΣR = ${s}`);
    }
  });
});

// Tolérance 3·10⁻⁴ de g L²/8 sur la statique : intégration des lignes d'influence par trapèzes sur la grille de nGrid = 100
// positions par travée, erreur en O(h²) (1·10⁻⁴ ici, 5·10⁻⁶ avec nGrid = 400) — erreur numérique, pas un défaut.
test('poutre continue — charge uniforme : ΣR = g (L + abouts), statique de chaque travée M(x) = M_a(1−ξ) + M_b ξ + g x (L − x)/2', () => {
  tirages(60, (r, ctx) => {
    const t = travure(r), g = r.entre(50, 400), bm = new ContinuousBeam(t.spans, { overhangs: t.overhangs, nSec: 2 * r.entier(5, 12) });
    ctx.desc = JSON.stringify({ ...t, g });
    const U = bm.uniformLoad(g), Ltot = bm.Ltot + t.overhangs[0] + t.overhangs[1];
    assert.ok(ecart(U.R.reduce((a, v) => a + v, 0), g * Ltot) < 1e-9, `ΣR = ${U.R.reduce((a, v) => a + v, 0)} ≠ ${g * Ltot}`);
    const echelle = g * Math.max(...t.spans) ** 2 / 8;
    bm.sections.forEach((s, k) => {
      const L = t.spans[s.span], ia = bm.sectionIndex(s.span, 0), ib = bm.sectionIndex(s.span, 1);
      const attendu = U.M[ia] * (1 - s.frac) + U.M[ib] * s.frac + g * s.xi * (L - s.xi) / 2;
      assert.ok(ecart(U.M[k], attendu, echelle) < 3e-4, `travée ${s.span}, ξ = ${s.frac} : M = ${U.M[k]}, statique ${attendu}`);
    });
    // équilibre de chaque appui : R_i = V(droite) − V(gauche)
    for (let i = 0; i <= t.spans.length; i++) {
      const vd = i < t.spans.length ? U.Vp[bm.sectionIndex(i, 0)] : g * t.overhangs[1];   // au-delà du dernier appui : about
      const vg = i > 0 ? U.Vm[bm.sectionIndex(i - 1, 1)] : -g * t.overhangs[0];
      assert.ok(ecart(U.R[i], vd - vg, g * Math.max(...t.spans)) < 1e-4, `appui ${i} : R = ${U.R[i]}, saut de V = ${vd - vg}`);
    }
  });
});

test('poutre continue — travure symétrique : moments, tranchants et réactions symétriques', () => {
  tirages(40, (r, ctx) => {
    const t = travure(r, { symetrique: true }), g = r.entre(50, 400), bm = new ContinuousBeam(t.spans, { overhangs: t.overhangs });
    ctx.desc = JSON.stringify(t);
    const U = bm.uniformLoad(g), n = t.spans.length, echelle = g * Math.max(...t.spans) ** 2 / 8;
    bm.sections.forEach((s, k) => {
      const km = bm.sectionIndex(n - 1 - s.span, 1 - s.frac);
      assert.ok(ecart(U.M[k], U.M[km], echelle) < 1e-9, `M(${s.span}, ${s.frac}) = ${U.M[k]} ≠ miroir ${U.M[km]}`);
    });
    U.R.forEach((R, i) => assert.ok(ecart(R, U.R[n - i], g * Math.max(...t.spans)) < 1e-9, `R${i} ≠ R${n - i}`));
    // enveloppe UDL des moments : symétrique aussi
    bm.sections.forEach((s, k) => {
      const km = bm.sectionIndex(n - 1 - s.span, 1 - s.frac), e1 = bm.udlEnvelope(bm.ILM[k], 9), e2 = bm.udlEnvelope(bm.ILM[km], 9);
      assert.ok(ecart(e1.max, e2.max, echelle) < 1e-6 && ecart(e1.min, e2.min, echelle) < 1e-6, `enveloppe UDL non symétrique en (${s.span}, ${s.frac})`);
    });
  });
});

test('poutre continue — réciprocité de Maxwell-Betti : R_k sous un tassement unité de l\'appui i = R_i sous celui de k ; réactions de tassement auto-équilibrées', () => {
  tirages(40, (r, ctx) => {
    const t = travure(r), n = t.spans.length;
    if (n < 2) return;
    const EI = t.spans.map(() => r.entre(2e6, 2e7)), bm = new ContinuousBeam(t.spans, { EI });
    ctx.desc = JSON.stringify({ ...t, EI });
    const R = Array.from({ length: n + 1 }, (_, i) => { const v = new Array(n + 1).fill(0); v[i] = 0.01; return bm.settlement(v, EI).R; });
    const echelle = Math.max(...R.flat().map(Math.abs));
    for (let i = 0; i <= n; i++) {
      assert.ok(Math.abs(R[i].reduce((a, v) => a + v, 0)) < 1e-9 * echelle, `tassement de l'appui ${i} : ΣR ≠ 0`);
      for (let k = 0; k < i; k++) assert.ok(ecart(R[i][k], R[k][i], echelle) < 1e-9, `R_${k}(v_${i}) = ${R[i][k]} ≠ R_${i}(v_${k}) = ${R[k][i]}`);
    }
  });
});

test('poutre continue — continuité : une portée perturbée de 10⁻³ ne fait pas sauter les enveloppes (UDL et tandem)', () => {
  const TS = [{ d: 0, P: 300 }, { d: 1.2, P: 300 }];
  tirages(25, (r, ctx) => {
    const t = travure(r), j = r.entier(0, t.spans.length - 1), s2 = t.spans.slice(); s2[j] *= 1 + 1e-3;
    ctx.desc = JSON.stringify({ ...t, j });
    const A = new ContinuousBeam(t.spans, { overhangs: t.overhangs }), B = new ContinuousBeam(s2, { overhangs: t.overhangs });
    const echelle = 300 * Math.max(...t.spans) / 2;
    A.sections.forEach((s, k) => {
      for (const [ea, eb, quoi] of [[A.udlEnvelope(A.ILM[k], 9), B.udlEnvelope(B.ILM[k], 9), 'UDL'], [A.axleEnvelope(A.ILM[k], TS, { step: 0.1 }), B.axleEnvelope(B.ILM[k], TS, { step: 0.1 }), 'TS']]) {
        assert.ok(Number.isFinite(ea.max) && Number.isFinite(ea.min), `${quoi} non fini`);
        assert.ok(ecart(ea.max, eb.max, echelle) < 2e-2 && ecart(ea.min, eb.min, echelle) < 2e-2, `${quoi} (${s.span}, ${s.frac}) : ${ea.max}/${ea.min} → ${eb.max}/${eb.min}`);
      }
    });
  });
});

test('poutre continue — monotonie : sur une travée isostatique, le moment de mi-travée vaut g L²/8 et croît avec la portée', () => {
  tirages(40, r => {
    const L = r.entre(5, 40), g = r.entre(10, 300), A = new ContinuousBeam([L]), B = new ContinuousBeam([L * 1.05]);
    const MA = A.uniformLoad(g).M[A.sectionIndex(0, 0.5)], MB = B.uniformLoad(g).M[B.sectionIndex(0, 0.5)];
    assert.ok(ecart(MA, g * L * L / 8) < 1e-6, `M = ${MA} ≠ gL²/8 = ${g * L * L / 8}`);
    assert.ok(MB > MA);
  });
});

test('Guyon-Massonnet — ∫K dy = 2b (flèche moyenne), réciprocité K(e, y) = K(y, e), symétrie K(e, y) = K(−e, −y)', () => {
  tirages(40, (r, ctx) => {
    const b = r.entre(2, 9), L = r.entre(6, 40), alpha = r.u() < 0.4 ? 1 : r.entre(0.05, 1), e = r.entre(-b, b), y = r.entre(-b, b);
    ctx.desc = JSON.stringify({ b, L, alpha, e, y, theta: b / L });
    const f = coefKFunction({ b, L, e, alpha });
    // intégrale de K sur la largeur (Gauss composite, 64 morceaux, coupure en y = e où K'' est discontinue)
    let s = 0;
    for (const [a1, b1] of [[-b, e], [e, b]]) {
      const m = 32, h = (b1 - a1) / m, gx = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526], gw = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
      for (let i = 0; i < m; i++) for (let q = 0; q < 4; q++) s += gw[q] * h / 2 * f(a1 + h * (i + 0.5) + gx[q] * h / 2);
    }
    assert.ok(ecart(s, 2 * b) < 1e-6, `∫K dy = ${s} ≠ 2b = ${2 * b}`);
    const k1 = coefK({ b, L, e, y, alpha }), k2 = coefK({ b, L, e: y, y: e, alpha }), k3 = coefK({ b, L, e: -e, y: -y, alpha });
    assert.ok(ecart(k1, k2, 1) < 1e-6, `K(e,y) = ${k1} ≠ K(y,e) = ${k2}`);
    assert.ok(ecart(k1, k3, 1) < 1e-6, `K(e,y) = ${k1} ≠ K(−e,−y) = ${k3}`);
  });
});

test('Guyon-Massonnet — cas limite θ → 0 : dalle isotrope (α = 1) K → 1 ; sans torsion (α = 0) K → 1 + 3 e y / b² (Courbon continu) ; interpolation en √α entre les deux', () => {
  tirages(20, r => {
    const b = r.entre(1, 4), L = b * r.entre(200, 1000), alpha = r.entre(0.05, 1);
    for (const e of [-b, 0, b * 0.6]) for (const y of [-b, -b / 3, b]) {
      const k1 = coefK({ b, L, e, y, alpha: 1 }), k0 = coefK({ b, L, e, y, alpha: 0, alphaMode: 'exact' }), ka = coefK({ b, L, e, y, alpha }), c = 1 + 3 * e * y / (b * b);
      assert.ok(Math.abs(k1 - 1) < 2e-3, `α = 1, θ = ${b / L} : K(${e}, ${y}) = ${k1}`);
      assert.ok(Math.abs(k0 - c) < 5e-3 * Math.max(1, Math.abs(c)), `α = 0, θ = ${b / L} : K(${e}, ${y}) = ${k0} ≠ ${c}`);
      assert.ok(Math.abs(ka - (c + (1 - c) * Math.sqrt(alpha))) < 5e-3 * Math.max(1, Math.abs(c)), `α = ${alpha} : K(${e}, ${y}) = ${ka}`);
    }
  });
});

/** Tablier à poutres tiré au hasard (VIPP, PRAD, poutres BA : 3 à 8 poutres, entraxe 1 à 3,5 m, portée 10 à 40 m). */
function tablierPoutres(r) {
  const n = r.entier(3, 8), b1 = r.entre(1, 3.5), L = r.entre(10, 40), hd = r.entre(0.16, 0.3), Ip = r.entre(0.05, 1.2), Kp = Ip * r.entre(0.005, 0.05);
  return { n, b1, L, hd, Ip, Kp };
}

test('grillage — charge ponctuelle : ΣR = P, Σ M_poutres(L/2) = moment isostatique, réciprocité des flèches', () => {
  tirages(15, (r, ctx) => {
    const t = tablierPoutres(r), G = grillagePoutres({ ...t, m: 2 * r.entier(5, 10), E: 30e6 });
    ctx.desc = JSON.stringify(t);
    const i = r.entier(1, G.m - 1), x = G.xs[i], e = r.entre(-t.n * t.b1 / 2, t.n * t.b1 / 2), P = 100;
    const res = G.resultats(G.chargePoint(G.vecteur(), x, e, P));
    const SR = res.R.reduce((a, q) => a + q.R, 0);
    assert.ok(ecart(SR, P) < 1e-6, `ΣR = ${SR}`);
    const im = G.m / 2, SM = Array.from({ length: t.n }, (_, k) => res.M[im * t.n + k]).reduce((a, v) => a + v, 0);
    const Miso = x <= t.L / 2 ? P * x / 2 : P * (t.L - x) / 2;
    assert.ok(ecart(SM, Miso, P * t.L / 4) < 1e-6, `Σ M(L/2) = ${SM}, isostatique ${Miso}`);
    // Maxwell-Betti : flèche de la poutre k sous P sur la poutre j = flèche de j sous P sur k (même station)
    const j = r.entier(0, t.n - 1), k = r.entier(0, t.n - 1);
    const wj = G.resultats(G.chargePoint(G.vecteur(), x, G.ys[j], 1)).w[i * t.n + k], wk = G.resultats(G.chargePoint(G.vecteur(), x, G.ys[k], 1)).w[i * t.n + j];
    assert.ok(ecart(wj, wk) < 1e-6, `w_${k}(P_${j}) = ${wj} ≠ w_${j}(P_${k}) = ${wk}`);
  });
});

test('grillage — symétrie η_k(e) = η_{n−1−k}(−e) ; entretoises infiniment rigides et poutres sans torsion → Courbon', () => {
  tirages(10, (r, ctx) => {
    const t = tablierPoutres(r);
    ctx.desc = JSON.stringify(t);
    const G = grillagePoutres({ ...t, m: 12 }), e = r.entre(-t.n * t.b1 / 2, t.n * t.b1 / 2), a = G.eta(e), bb = G.eta(-e);
    a.forEach((v, k) => assert.ok(Math.abs(v - bb[t.n - 1 - k]) < 1e-6, `η_${k}(${e}) = ${v} ≠ η_${t.n - 1 - k}(${-e}) = ${bb[t.n - 1 - k]}`));
    // Courbon : entretoises infiniment rigides à chaque station, hourdis et poutres sans raideur de torsion
    const ent = Array.from({ length: 11 }, (_, q) => ({ x: (q + 1) * t.L / 12, I: 1e4 * t.Ip, K: 0 }));
    const R = grillagePoutres({ ...t, Kp: 1e-9 * t.Ip, hd: 1e-3, m: 12, entretoises: ent });
    const C = new TablierCourbon({ spans: [t.L], width: t.n * t.b1, h: 1, ys: R.ys });
    const ec = r.entre(-0.4, 0.4) * t.n * t.b1, kc = C.Kbar(t.L, ec, ec), kg = R.Kbar(ec, ec);
    kc.forEach((v, k) => assert.ok(Math.abs(v - kg[k]) < 2e-3 * Math.max(1, Math.abs(v)), `poutre ${k}, e = ${ec} : grillage ${kg[k]}, Courbon ${v}`));
  });
});

test('non-régression — essieu au bout de l\'about : une position qui atteint l\'extrémité à un arrondi près est retenue', () => {
  // travée de 7 m, abouts de 0,80 et 0,40 m, pas de 0,10 m : x = −2,0 + 94 × 0,1 = 7,400000000000002 > xMax = 7,4 était
  // rejetée (ligne d'influence nulle) ; moment à 0,8 L sous le tandem : −0,8 × 0,4 × 300 = −96 kN·m (et non −72)
  const bm = new ContinuousBeam([7], { overhangs: [0.8, 0.4] }), k = bm.sectionIndex(0, 0.8);
  const env = bm.axleEnvelope(bm.ILM[k], [{ d: 0, P: 300 }, { d: 1.2, P: 300 }], { step: 0.1 });
  assert.ok(Math.abs(env.min + 96) < 1e-6, `min = ${env.min}`);
  assert.ok(Math.abs(bm.ilAt(bm.ILM[k], 7.4 + 1e-12) - bm.ilAt(bm.ILM[k], 7.4)) < 1e-12 && bm.ilAt(bm.ILM[k], 7.5) === 0);
});
