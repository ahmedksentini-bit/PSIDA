/**
 * Invariants physiques sur des ouvrages tirés au hasard (2/3) : plaque de Kirchhoff (éléments finis DKT et
 * différences finies) — équilibre, solution exacte de Lévy, réciprocité de Maxwell-Betti, symétrie, continuité du biais.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tirages, ecart, rng } from './alea.mjs';
import { PlaqueEF } from '../src/plate/fe.js';
import { PlaqueDF, grille } from '../src/plate/fd.js';
import { transverseMoments } from '../src/guyon.js';

/** Plaque de Lévy tirée au hasard : travée L (8 à 22 m), largeur 2b (6 à 14 m), deux bords appuyés, deux bords libres. */
function levy(r, Moteur = PlaqueEF, { psi = 100, h = null } = {}) {
  const L = r.arrondi(r.entre(8, 22), 0.5), b = r.arrondi(r.entre(3, 7), 0.5), nu = r.choix([0, 0.15, 0.2]), ep = r.entre(0.4, 1.0);
  const D = 34000e3 * ep ** 3 / (12 * (1 - nu * nu)), hh = h || r.choix([0.5, 0.5, 0.4]);
  const xs = grille([0, L], hh), ys = grille([-b, 0, b], hh);
  const appuis = []; for (const x of [0, L]) for (const y of ys) appuis.push({ x: x + y * (Math.abs(psi - 100) < 1e-9 ? 0 : 1 / Math.tan(psi * Math.PI / 200)), y, k: Infinity });
  return { L, b, nu, D, xs, ys, P: new Moteur({ xs, ys, D, nu, appuis, ...(Moteur === PlaqueEF ? { psi } : {}) }) };
}

for (const [nom, Moteur] of [['éléments finis', PlaqueEF], ['différences finies', PlaqueDF]]) {
  test(`plaque (${nom}) — charge rectangulaire au hasard : ΣR = charge totale ; m_x et m_y à mi-portée = solution exacte de Lévy`, () => {
    // maille de 0,25 m : sous une petite surface chargée, m_y converge en O(h) (écart de 6 % à 0,5 m, 0,4 % à 0,25 m)
    tirages(5, (r, ctx) => {
      const T = levy(r, Moteur, { h: 0.25 }), { L, b, nu, P, xs, ys } = T;
      const x1 = r.entre(0, L * 0.6), x2 = Math.min(L, x1 + r.entre(1, L)), e1 = r.entre(-b, b * 0.5), e2 = Math.min(b, e1 + r.entre(1, 2 * b)), q = r.entre(5, 200);
      ctx.desc = JSON.stringify({ L, b, nu, x1, x2, e1, e2 });
      const w = P.resoudre(P.chargeRectangle(P.vecteur(), { x1, x2, y1: e1, y2: e2, q })), m = P.moments(w);
      const Q = q * (x2 - x1) * (e2 - e1), R = P.reactions(w).reduce((s, a) => s + a.R, 0);
      assert.ok(ecart(R, Q) < 1e-6, `ΣR = ${R}, charge ${Q}`);
      const yo = [-b, -b / 2, 0, b / 2, b].map(y => ys[P.plusProche(ys, y)]), i = P.plusProche(xs, L / 2);
      const ex = transverseMoments({ b, L, patches: [{ x1, x2, e1, e2, q }], x: xs[i], ys: yo, nHarm: 99, nu });
      const smx = Math.max(...ex.mx.map(Math.abs)), smy = Math.max(1e-9, ...ex.my.map(Math.abs), 0.05 * smx);
      yo.forEach((y, k) => {
        const p = P.idx(i, P.plusProche(ys, y));
        assert.ok(Math.abs(m.mx[p] - ex.mx[k]) < 0.03 * smx, `m_x(y = ${y}) = ${m.mx[p]}, Lévy ${ex.mx[k]}`);
        assert.ok(Math.abs(m.my[p] - ex.my[k]) < 0.03 * smy, `m_y(y = ${y}) = ${m.my[p]}, Lévy ${ex.my[k]}`);
      });
    });
  });
}

test('plaque (éléments finis) — réciprocité de Maxwell-Betti des flèches et symétrie sous chargement symétrique', () => {
  tirages(6, (r, ctx) => {
    const { L, b, P, xs, ys } = levy(r);
    ctx.desc = JSON.stringify({ L, b });
    const pt = () => ({ x: xs[r.entier(1, xs.length - 2)], y: ys[r.entier(0, ys.length - 1)] });
    const A = pt(), B = pt();
    const wA = P.resoudre(P.chargePonctuelle(P.vecteur(), { ...A, P: 1 })), wB = P.resoudre(P.chargePonctuelle(P.vecteur(), { ...B, P: 1 }));
    const pA = P.idx(P.plusProche(xs, A.x), P.plusProche(ys, A.y)), pB = P.idx(P.plusProche(xs, B.x), P.plusProche(ys, B.y));
    assert.ok(ecart(wA[pB], wB[pA], Math.max(Math.abs(wA[pA]), Math.abs(wB[pB]))) < 1e-8, `w_B(P_A) = ${wA[pB]} ≠ w_A(P_B) = ${wB[pA]}`);
    // deux charges symétriques par rapport à l'axe y = 0 → flèches et moments symétriques
    const e = r.entre(0.5, b), F = P.vecteur(); P.chargeRectangle(F, { x1: 0, x2: L, y1: e - 0.5, y2: e, q: 10 }); P.chargeRectangle(F, { x1: 0, x2: L, y1: -e, y2: -e + 0.5, q: 10 });
    const w = P.resoudre(F), m = P.moments(w), i = P.plusProche(xs, L / 2), smx = Math.max(...Array.from(m.mx).map(Math.abs));
    for (let j = 0; j < ys.length; j++) {
      const p = P.idx(i, j), q = P.idx(i, ys.length - 1 - j);
      assert.ok(Math.abs(m.mx[p] - m.mx[q]) < 1e-6 * smx, `m_x non symétrique en y = ${ys[j]} : ${m.mx[p]} / ${m.mx[q]}`);
    }
  });
});

// Défaut documenté (non corrigé, voir docs/validation/invariants.md) : le maillage du pont droit (ψ = 100 gr) alterne les
// diagonales des mailles, celui d'un pont biais prend toujours la plus courte. Entre ψ = 100 et ψ = 99,999 gr la
// triangulation change donc d'un coup : écart jusqu'à 1,3 % de m_x max hors des lignes d'appui et 5 % aux angles
// (maille de 0,5 m, 30 tirages), qui diminue de moitié quand la maille est divisée par deux (erreur de discrétisation en O(h), pas un saut
// du modèle). Le test borne ce saut et vérifie qu'il converge avec la maille.
test('plaque (éléments finis) — continuité du biais : ψ = 99,999 gr ≈ pont droit ; l\'écart dû au changement de triangulation converge avec la maille', () => {
  tirages(3, (r, ctx) => {
    const g = r.u() * 1e6 | 0, ch = T => ({ x1: T.L * 0.3, x2: T.L * 0.7, y1: -T.b / 2, y2: T.b / 2, q: 20 });
    const saut = h => {
      const A = levy(rng(g), PlaqueEF, { h }), B = levy(rng(g), PlaqueEF, { psi: 99.999, h });   // même tirage, seul ψ change
      ctx.desc = JSON.stringify({ L: A.L, b: A.b, h });
      const wa = A.P.resoudre(A.P.chargeRectangle(A.P.vecteur(), ch(A))), wb = B.P.resoudre(B.P.chargeRectangle(B.P.vecteur(), ch(A)));
      const ma = A.P.moments(wa), mb = B.P.moments(wb), s = Math.max(...Array.from(ma.mx).map(Math.abs)), sw = Math.max(...Array.from(wa).map(Math.abs));
      let dw = 0, dIn = 0, dApp = 0;
      for (let p = 0; p < wa.length; p++) {
        dw = Math.max(dw, Math.abs(wa[p] - wb[p]) / sw);
        const i = A.P.iOf(p), d = Math.abs(ma.mx[p] - mb.mx[p]) / s;
        if (i === 0 || i === A.P.nx - 1) dApp = Math.max(dApp, d); else dIn = Math.max(dIn, d);
      }
      return { dw, dIn, dApp };
    };
    const a = saut(0.5), b = saut(0.25);
    assert.ok(a.dw < 2e-3 && a.dIn < 0.02 && a.dApp < 0.08, `saut ψ 100 → 99,999 gr à 0,5 m : flèches ${a.dw}, m_x ${a.dIn} (courant) / ${a.dApp} (lignes d'appui)`);
    assert.ok(b.dIn < 0.7 * a.dIn + 1e-4 && b.dApp < 0.7 * a.dApp + 1e-4, `le saut ne converge pas avec la maille : ${JSON.stringify({ a, b })}`);
  });
});
