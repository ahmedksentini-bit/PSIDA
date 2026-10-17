/**
 * Petites routines d'algèbre linéaire (systèmes denses de petite taille).
 * Aucune dépendance : le moteur doit tourner tel quel dans le navigateur.
 */

/**
 * Résout A·x = b par élimination de Gauss avec pivot partiel.
 * @param {number[][]} A matrice carrée (n×n), non modifiée
 * @param {number[]} b second membre (n)
 * @returns {number[]} x
 */
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) throw new Error('linalg.solve : matrice singulière');
    if (p !== c) [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Points et poids de Gauss-Legendre sur [-1, 1] (n = 2..6). */
const GL = {
  2: [[-0.5773502691896257, 1], [0.5773502691896257, 1]],
  3: [[-0.7745966692414834, 0.5555555555555556], [0, 0.8888888888888888], [0.7745966692414834, 0.5555555555555556]],
  4: [[-0.8611363115940526, 0.3478548451374538], [-0.3399810435848563, 0.6521451548625461],
      [0.3399810435848563, 0.6521451548625461], [0.8611363115940526, 0.3478548451374538]],
  5: [[-0.906179845938664, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665], [0, 0.5688888888888889],
      [0.5384693101056831, 0.4786286704993665], [0.906179845938664, 0.2369268850561891]],
  6: [[-0.932469514203152, 0.17132449237917036], [-0.6612093864662645, 0.3607615730481386],
      [-0.2386191860831969, 0.46791393457269104], [0.2386191860831969, 0.46791393457269104],
      [0.6612093864662645, 0.3607615730481386], [0.932469514203152, 0.17132449237917036]],
};

/**
 * Intégrale de f sur [a, b] par Gauss-Legendre composite.
 * @param {(t:number)=>number} f
 * @param {number} a
 * @param {number} b
 * @param {{n?:number, pieces?:number}} opt n points par morceau, nombre de morceaux
 */
export function gaussIntegrate(f, a, b, { n = 4, pieces = 1 } = {}) {
  const pts = GL[n] || GL[4];
  let s = 0;
  const h = (b - a) / pieces;
  for (let p = 0; p < pieces; p++) {
    const a1 = a + p * h, b1 = a1 + h;
    const c = (a1 + b1) / 2, r = (b1 - a1) / 2;
    for (const [t, w] of pts) s += w * f(c + r * t);
    // le facteur r est commun à tout le morceau
  }
  // chaque morceau a le même r = h/2
  return s * (h / 2);
}

/** Nœuds (abscisses, poids) de Gauss-Legendre sur [a, b]. */
export function gaussNodes(a, b, n = 4) {
  const pts = GL[n] || GL[4];
  const c = (a + b) / 2, r = (b - a) / 2;
  return pts.map(([t, w]) => [c + r * t, w * r]);
}
