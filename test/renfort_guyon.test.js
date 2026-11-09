/**
 * Renfort des tests de Guyon-Massonnet (src/guyon.js), campagne de mutation : identités exactes de l'équation de la plaque
 * orthotrope D(Y'''' − 2αk²Y'' + k⁴Y) = δ(y − e) à bords libres (ν = 0), obtenues en l'intégrant sur la largeur :
 *   ∫Y dy = 1/k⁴ pour tout α (d'où K moyen = 1, aussi pour les harmoniques supérieurs) ;
 *   α = 0 : ∫yY dy = e/k⁴ (premier moment, d'où ∫y K dy = 2b e) ;
 * et limites connues : α = 0, θ → 0 → K = 1 + 3ey/b² (Courbon) ; α = 1, θ → 0 → K = 1 ; interpolation de Massonnet
 * K = K₀ + (K₁ − K₀)√α. Aucune valeur n'est recopiée d'une sortie de PSIDA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateHarmonic, coefK, coefKFunction, coefKBand, coefMu, tableK, transverseMoments, meanDeflection } from '../src/guyon.js';
import { gaussNodes } from '../src/linalg.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} : attendu ${b}, obtenu ${a}`);
/** ∫ f sur [a, b], Gauss composite, coupure en c (point anguleux sous la charge). */
const integre = (f, a, b, c = null, n = 40) => {
  const seg = c != null && c > a && c < b ? [[a, c], [c, b]] : [[a, b]];
  let s = 0;
  for (const [u, v] of seg) { const h = (v - u) / n; for (let i = 0; i < n; i++) for (const [x, w] of gaussNodes(u + i * h, u + (i + 1) * h, 4)) s += w * f(x); }
  return s;
};

test('∫Y dy = 1/k⁴ pour tout α et pour les harmoniques supérieurs (ν = 0) ; K moyen = 1', () => {
  for (const [b, L, e, alpha, n] of [[5, 15, 1.2, 1, 1], [5, 15, 1.2, 0, 1], [6, 20, -3.5, 0.3, 1], [4, 12, 2, 1, 3], [4, 12, 0.5, 0.15, 5]]) {
    const h = plateHarmonic({ b, L, n, e, alpha }), k = n * Math.PI / L;
    close(integre(h.Y, -b, b, e) * k ** 4, 1, 1e-8, `∫Y k⁴ (b ${b}, L ${L}, e ${e}, α ${alpha}, n ${n})`);
  }
  for (const [b, L, e, alpha] of [[5, 15, 1.2, 1], [6, 20, -3.5, 0.3], [6, 20, 5.9, 0]]) {
    const K = coefKFunction({ b, L, e, alpha, alphaMode: 'exact' });
    close(integre(K, -b, b, e) / (2 * b), 1, 1e-8, `K moyen (α ${alpha})`);
  }
  // ν ≠ 0 : la normalisation passe par la flèche moyenne calculée → K moyen = 1 aussi
  const Kn = coefKFunction({ b: 5, L: 15, e: 2, nu: 0.2 });
  close(integre(Kn, -5, 5, 2) / 10, 1, 1e-6, 'K moyen, ν = 0,2');
  const h = plateHarmonic({ b: 5, L: 15, e: 2, nu: 0.2 });
  close(meanDeflection(h), integre(h.Y, -5, 5, 2) / 10, 1e-8, 'flèche moyenne');
});

test('α = 0 (sans torsion) : premier moment ∫y K dy = 2b e (équilibre des moments d\'une section indéformable en torsion nulle)', () => {
  for (const [b, L, e] of [[5, 15, 1.2], [6, 30, -4], [4, 8, 3.5]]) {
    const K = coefKFunction({ b, L, e, alpha: 0, alphaMode: 'exact' });
    close(integre(y => y * K(y), -b, b, e), 2 * b * e, 1e-7 * b * b, `∫yK (b ${b}, L ${L}, e ${e})`);
  }
});

test('limites θ → 0 : α = 0 → K = 1 + 3ey/b² (Courbon) ; α = 1 → K = 1 ; interpolation de Massonnet à α = 0,25', () => {
  const b = 3, L = 300;   // θ = b/L = 0,01
  for (const [e, y] of [[2, 3], [2, -3], [-1.5, 0.5], [3, 3]]) {
    close(coefK({ b, L, e, y, alpha: 0, alphaMode: 'exact' }), 1 + 3 * e * y / (b * b), 2e-3, `α = 0, e ${e}, y ${y}`);
    close(coefK({ b, L, e, y, alpha: 1 }), 1, 1e-3, `α = 1, e ${e}, y ${y}`);
    close(coefK({ b, L, e, y, alpha: 0.25 }), 1 + 0.5 * 3 * e * y / (b * b), 2e-3, `α = 0,25 (√α = 0,5)`);
  }
  // le mode « exact » à α intermédiaire n'est pas l'interpolation de Massonnet (pour θ notable)
  const kx = coefK({ b: 5, L: 10, e: 4, y: 4, alpha: 0.25, alphaMode: 'exact' }), km = coefK({ b: 5, L: 10, e: 4, y: 4, alpha: 0.25 });
  assert.ok(Math.abs(kx - km) > 1e-3, `exact ${kx} ≈ Massonnet ${km}`);
});

test('bande de charge : K moyen sur [e1, e2] ; en limite de Courbon, K de la bande = K au milieu (linéaire en e)', () => {
  const b = 3, L = 300;
  close(coefKBand({ b, L, e1: -1, e2: 2.5, y: 3, alpha: 0 }), 1 + 3 * 0.75 * 3 / 9, 2e-3, 'bande, α = 0');
  close(coefKBand({ b: 5, L: 15, e1: 1.5, e2: 1.5, y: 2 }), coefK({ b: 5, L: 15, e: 1.5, y: 2 }), 1e-12, 'bande nulle = charge-ligne');
  // moyenne exacte par intégration indépendante (θ = 1/3)
  const ref = integre(e => coefK({ b: 5, L: 15, e, y: -2 }), 0.5, 3.5, null, 12) / 3;
  close(coefKBand({ b: 5, L: 15, e1: 0.5, e2: 3.5, y: -2 }), ref, 1e-6, 'bande, θ = 1/3');
});

test('réciprocité K(e, y) = K(y, e) avec l\'interpolation de Massonnet ; tableau = coefK', () => {
  for (const alpha of [0.1, 0.4, 1]) {
    close(coefK({ b: 5, L: 12, e: 3, y: -1, alpha }), coefK({ b: 5, L: 12, e: -1, y: 3, alpha }), 1e-9, `réciprocité α ${alpha}`);
  }
  const T = tableK({ b: 5, L: 12, es: [0, 2.5, 5], ys: [-5, 0, 5], alpha: 0.4 });
  close(T[1][2], coefK({ b: 5, L: 12, e: 2.5, y: 5, alpha: 0.4 }), 1e-12, 'tableK');
  close(T[2][0], coefK({ b: 5, L: 12, e: 5, y: -5, alpha: 0.4 }), 1e-12, 'tableK, charge en bord');
});

test('moment transversal : μ nul aux bords (aussi interpolé) ; m_x intégré sur la largeur = moment de poutre de la charge (série de Fourier)', () => {
  for (const alpha of [1, 0.3]) for (const y of [-5, 5]) close(coefMu({ b: 5, L: 15, e: 2, y, alpha }), 0, 1e-9, `μ(bord ${y}), α ${alpha}`);
  // charge de 20 kPa sur [4, 9] × [−2, 3] d'une travée de 15 m ; moment de poutre à x = 7,5 m (charge-ligne 100 kN/m)
  const b = 5, L = 15, patch = { x1: 4, x2: 9, e1: -2, e2: 3, q: 20 }, x = 7.5, ys = Array.from({ length: 41 }, (_, i) => -b + i * 2 * b / 40);
  const r = transverseMoments({ b, L, patches: [patch], x, ys, nHarm: 99 });
  let s = 0; for (let i = 0; i < 40; i++) s += (r.mx[i] + r.mx[i + 1]) / 2 * (ys[i + 1] - ys[i]);   // trapèzes
  const P = 20 * 5 * 5, Ra = P * (L - 6.5) / L, Mpoutre = Ra * x - 20 * 5 * (x - 4) ** 2 / 2;
  close(s, Mpoutre, 0.01 * Mpoutre, 'Σ m_x = M poutre');
});

test('charge sur un bord libre (e = ±b) : conditions aux limites et symétrie K(−b, y) = K(b, −y), K moyen = 1', () => {
  const b = 5, L = 15, k = Math.PI / L;
  for (const e of [b, -b]) {
    const h = plateHarmonic({ b, L, e }), s = Math.sign(e);
    // bord chargé : moment nul, effort tranchant de Kirchhoff égal à la charge (Y''' − 2k²Y' = −s) ; bord opposé libre
    close(h.d2(e), 0, 1e-9, `M_y bord chargé ${e}`);
    close(h.d3(e) - 2 * k * k * h.d1(e), -s, 1e-9, `V_y bord chargé ${e}`);
    close(h.d2(-e), 0, 1e-9, `M_y bord opposé ${e}`);
    close(h.d3(-e) - 2 * k * k * h.d1(-e), 0, 1e-9, `V_y bord opposé ${e}`);
    close(integre(h.Y, -b, b) * k ** 4, 1, 1e-8, `∫Y k⁴, charge en ${e}`);
  }
  for (const y of [-5, -2, 0, 3, 5]) close(coefK({ b, L, e: -b, y }), coefK({ b, L, e: b, y: -y }), 1e-9, `symétrie y ${y}`);
  // limite continue : charge à 1 mm du bord ≈ charge sur le bord
  close(coefK({ b, L, e: -b + 1e-3, y: -b }), coefK({ b, L, e: -b, y: -b }), 2e-3, 'continuité au bord');
});

test('interpolation de Massonnet appliquée aussi à μ et aux moments locaux : f(α) = f₀ + (f₁ − f₀)√α', () => {
  const o = { b: 5, L: 12, e: 2.5, y: 1 }, r = Math.sqrt(0.36);
  const m0 = coefMu({ ...o, alpha: 0, alphaMode: 'exact' }), m1 = coefMu({ ...o, alpha: 1 });
  close(coefMu({ ...o, alpha: 0.36 }), m0 + (m1 - m0) * r, 1e-12, 'μ');
  assert.ok(Math.abs(m1 - m0) > 1e-4, 'μ₀ et μ₁ distincts');
  const P = { b: 5, L: 12, patches: [{ x1: 3, x2: 7, e1: -1, e2: 2.5, q: 10 }], x: 6, ys: [-5, -2, 1, 4], nHarm: 15 };
  const t0 = transverseMoments({ ...P, alpha: 0, alphaMode: 'exact' }), t1 = transverseMoments({ ...P, alpha: 1 }), tm = transverseMoments({ ...P, alpha: 0.36 });
  P.ys.forEach((_, i) => {
    close(tm.my[i], t0.my[i] + (t1.my[i] - t0.my[i]) * r, 1e-9, `m_y ${i}`);
    close(tm.mx[i], t0.mx[i] + (t1.mx[i] - t0.mx[i]) * r, 1e-9, `m_x ${i}`);
  });
  // α = 1 : la torsion répartit, m_x plus uniforme qu'à α = 0
  assert.ok(Math.max(...t1.mx) - Math.min(...t1.mx) < Math.max(...t0.mx) - Math.min(...t0.mx), 'torsion répartissante');
});
