/**
 * Poutre continue sur appuis ponctuels rigides ou élastiques (chevêtre sur fûts, semelle filante sur pieux) — éléments
 * finis d'Euler-Bernoulli, charges ponctuelles et réparties. Unités : m, kN, kN/m (raideur des appuis), kN·m², kN·m.
 */

/**
 * @param {object} p length, EI, supports [{ x, k? }] (k absent = appui rigide ; appui unique encastré), loads [{ x, P }] (P > 0 vers le bas), q (kN/m), n
 * @returns {{x:number[], M:number[], V:number[], R:number[], Mmax:number, Mmin:number, Vabs:number}}
 *   M > 0 : fibre inférieure tendue
 */
export function beamOnSupports({ length, EI = 1e6, supports, loads = [], q = 0, n = 240 }) {
  const pts = new Set([0, length, ...supports.map(s => s.x), ...loads.map(l => l.x)].map(v => +Math.min(length, Math.max(0, v)).toFixed(6)));
  for (let i = 1; i < n; i++) pts.add(+(i * length / n).toFixed(6));
  const x = [...pts].sort((a, b) => a - b), nn = x.length, nd = 2 * nn;
  const K = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
  for (let e = 0; e < nn - 1; e++) {
    const L = x[e + 1] - x[e], k = EI / L ** 3;
    const ke = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
    const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[dof[a]][dof[b]] += k * ke[a][b];
    const fe = [-q * L / 2, -q * L * L / 12, -q * L / 2, q * L * L / 12];   // v positif vers le haut
    for (let a = 0; a < 4; a++) F[dof[a]] += fe[a];
  }
  const at = v => x.findIndex(t => Math.abs(t - Math.min(length, Math.max(0, v))) < 1e-5);
  for (const l of loads) F[2 * at(l.x)] -= l.P;
  const kRigid = 1e6 * EI / (length / Math.max(1, supports.length)) ** 3;
  const sup = supports.map(s => ({ i: at(s.x), k: s.k ?? kRigid }));
  for (const s of sup) K[2 * s.i][2 * s.i] += s.k;
  // appui unique (fût encastré dans le chevêtre) : rotation bloquée
  if (sup.length === 1) K[2 * sup[0].i + 1][2 * sup[0].i + 1] += kRigid * length ** 2;
  // Gauss avec pivot partiel
  const A = K.map((r, i) => [...r, F[i]]);
  for (let c = 0; c < nd; c++) {
    let p = c; for (let r = c + 1; r < nd; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const pv = A[c][c];
    for (let r = c + 1; r < nd; r++) { const f = A[r][c] / pv; if (f) for (let k2 = c; k2 <= nd; k2++) A[r][k2] -= f * A[c][k2]; }
  }
  const u = new Float64Array(nd);
  for (let r = nd - 1; r >= 0; r--) { let s = A[r][nd]; for (let c = r + 1; c < nd; c++) s -= A[r][c] * u[c]; u[r] = s / A[r][r]; }
  const R = sup.map(s => -s.k * u[2 * s.i]);
  // moments et efforts tranchants par équilibre (statique à partir de l'extrémité gauche)
  const M = x.map(xi => {
    let m = 0;
    for (const l of loads) if (l.x < xi - 1e-9) m -= l.P * (xi - l.x);
    sup.forEach((s, j) => { if (x[s.i] < xi - 1e-9) m += R[j] * (xi - x[s.i]); });
    return m - q * xi * xi / 2;
  });
  const V = x.map(xi => {
    let v = -q * xi;
    for (const l of loads) if (l.x <= xi + 1e-9) v -= l.P;
    sup.forEach((s, j) => { if (x[s.i] <= xi + 1e-9) v += R[j]; });
    return v;
  });
  return { x, M, V, R, Mmax: Math.max(0, ...M), Mmin: Math.min(0, ...M), Vabs: Math.max(...V.map(Math.abs)) };
}
