/**
 * Grillage de poutres (Hambly, « Bridge Deck Behaviour », 2e éd. 1991, chap. 3) : répartition transversale des charges
 * d'un tablier à poutres à travée indépendante, en contrôle ou en remplacement de Guyon-Massonnet et de Courbon.
 *
 * Modèle : n poutres longitudinales (rigidités de la poutre avec son hourdis, E I_p et G K_p, K_p comprenant b₁ h_d³/6),
 * découpées en m éléments ; à chaque station, une barre transversale représentant le hourdis de largeur tributaire Δx
 * (E Δx h_d³/12, G Δx h_d³/6) ; entretoises intermédiaires éventuelles (section en T : âme b_e × h_e, table de hourdis
 * de largeur participante) ajoutées aux barres transversales de leur station. Degrés de liberté par nœud : flèche w
 * (vers le bas), rotations θ_x et θ_y ; éléments de poutre de Bernoulli (flexion) et de torsion de Saint-Venant.
 * Appuis : w = 0 et θ_x = 0 aux extrémités de chaque poutre (entretoises d'about : torsion des poutres bloquée, comme
 * le bord simplement appuyé de la dalle orthotrope de Guyon). G = E/2 (ν = 0, convention de Guyon-Massonnet).
 * Une charge-ligne en y = e, d'intensité sinusoïdale le long de la travée (premier harmonique, comme le coefficient K de
 * Guyon-Massonnet), est appliquée aux barres transversales par les fonctions de forme d'Hermite (console rigide au-delà
 * des poutres de rive) ; coefficient de la poutre k : η_k(e) = M_k/ΣM (moments de mi-travée),
 * K̄_k = n η_k, comme pour la pratique PAP (mêmes coefficients pour M, V et R).
 */

/** Factorisation LU (pivot partiel) d'une matrice dense, résolution de plusieurs seconds membres. */
function lu(A) {
  const n = A.length, P = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let p = k, mx = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > mx) { mx = Math.abs(A[i][k]); p = i; }
    if (mx < 1e-300) throw new Error('grillage : matrice singulière');
    if (p !== k) { [A[p], A[k]] = [A[k], A[p]]; [P[p], P[k]] = [P[k], P[p]]; }
    const Ak = A[k], pv = Ak[k];
    for (let i = k + 1; i < n; i++) { const Ai = A[i], f = Ai[k] / pv; if (f === 0) continue; Ai[k] = f; for (let j = k + 1; j < n; j++) Ai[j] -= f * Ak[j]; }
  }
  return b => {
    const n2 = A.length, x = P.map(i => b[i]);
    for (let i = 0; i < n2; i++) { let s = x[i]; const Ai = A[i]; for (let j = 0; j < i; j++) s -= Ai[j] * x[j]; x[i] = s; }
    for (let i = n2 - 1; i >= 0; i--) { let s = x[i]; const Ai = A[i]; for (let j = i + 1; j < n2; j++) s -= Ai[j] * x[j]; x[i] = s / Ai[i]; }
    return x;
  };
}

/** Raideur de flexion [w1, s1, w2, s2] (s = dw/dξ) et de torsion [t1, t2] d'une barre de longueur l. */
const kFlexion = (EI, l) => { const a = EI / l ** 3; return [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]].map(r => r.map(v => v * a)); };
const hermite = (a, l) => { const t = a / l; return [1 - 3 * t * t + 2 * t ** 3, a * (1 - t) ** 2, 3 * t * t - 2 * t ** 3, a * (t * t - t)]; };

/**
 * @param {object} o { n, b1, L, Ip, Kp, hd, m (éléments par poutre, pair), entretoises [{ x, I, K }] (rigidités propres,
 *   hourdis compris), pas (pas des positions e de la charge, m) }
 * @returns { ys, eta(e) → [η_k], Kbar(e1, e2) → [K̄_k], N (degrés de liberté) }
 */
export function grillagePoutres({ n, b1, L, Ip, Kp, hd, m = 20, entretoises = [], pas = 0.05, E = 1 }) {
  if (!(n >= 2)) throw new Error('grillage : deux poutres au moins');
  m = Math.max(4, 2 * Math.round(m / 2));
  const G = E / 2, ys = Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * b1), dx = L / m, xs = Array.from({ length: m + 1 }, (_, i) => i * dx);
  const id = (i, k) => 3 * (i * n + k), N = 3 * n * (m + 1);   // DDL : w, θx, θy
  const K = Array.from({ length: N }, () => new Float64Array(N));
  const ajouter = (dofs, k) => { for (let a = 0; a < dofs.length; a++) for (let b = 0; b < dofs.length; b++) K[dofs[a][0]][dofs[b][0]] += dofs[a][1] * dofs[b][1] * k[a][b]; };
  // poutres longitudinales : flexion (w, s = dw/dx = −θy), torsion θx
  for (let k = 0; k < n; k++) for (let i = 0; i < m; i++) {
    const a = id(i, k), b = id(i + 1, k);
    ajouter([[a, 1], [a + 2, -1], [b, 1], [b + 2, -1]], kFlexion(E * Ip, dx));
    const t = G * Kp / dx; ajouter([[a + 1, 1], [b + 1, 1]], [[t, -t], [-t, t]]);
  }
  // barres transversales : hourdis (largeur tributaire) + entretoises ; flexion (w, s = dw/dy = θx), torsion θy
  const ent = new Map(); for (const q of entretoises) { const i = Math.max(1, Math.min(m - 1, Math.round(q.x / dx))); const r = ent.get(i) || { I: 0, K: 0 }; r.I += q.I; r.K += q.K; ent.set(i, r); }
  for (let i = 0; i <= m; i++) {
    const w = i === 0 || i === m ? dx / 2 : dx, e = ent.get(i) || { I: 0, K: 0 }, I = w * hd ** 3 / 12 + e.I, Kt = w * hd ** 3 / 6 + e.K;
    for (let k = 0; k < n - 1; k++) {
      const a = id(i, k), b = id(i, k + 1);
      ajouter([[a, 1], [a + 1, 1], [b, 1], [b + 1, 1]], kFlexion(E * I, b1));
      const t = G * Kt / b1; ajouter([[a + 2, 1], [b + 2, 1]], [[t, -t], [-t, t]]);
    }
  }
  // appuis : w = 0 et θx = 0 aux deux extrémités de chaque poutre (pénalisation)
  const K0 = K.map(r => Float64Array.from(r));   // raideur sans les appuis (réactions = K₀u − F aux appuis)
  const big = 1e12 * Math.max(...Array.from({ length: N }, (_, j) => Math.abs(K[j][j])));
  for (const i of [0, m]) for (let k = 0; k < n; k++) { K[id(i, k)][id(i, k)] += big; K[id(i, k) + 1][id(i, k) + 1] += big; }
  const resoudre = lu(K.map(r => Array.from(r)));
  const im = m / 2, inv = 1 / dx ** 2;
  // moment de mi-travée de chaque poutre : M = −E I w'' (w vers le bas), moyenne des éléments gauche et droit
  const moments = u => ys.map((_, k) => {
    const w0 = u[id(im - 1, k)], s0 = -u[id(im - 1, k) + 2], w1 = u[id(im, k)], s1 = -u[id(im, k) + 2], w2 = u[id(im + 1, k)], s2 = -u[id(im + 1, k) + 2];
    const gauche = 6 * (w0 - w1) * inv + (2 * s0 + 4 * s1) / dx, droite = 6 * (w2 - w1) * inv - (4 * s1 + 2 * s2) / dx;
    return -E * Ip * (gauche + droite) / 2;
  });
  // charge-ligne en y = e, d'intensité sinusoïdale le long de la travée (premier harmonique : définition de K de Guyon)
  const eta0 = e => {
    const F = new Array(N).fill(0), y0 = ys[0], yn = ys[n - 1];
    for (let i = 1; i < m; i++) {
      const q = Math.sin(Math.PI * xs[i] / L) * dx;
      if (e <= y0 || e >= yn) { const k = e <= y0 ? 0 : n - 1, d = e - ys[k]; F[id(i, k)] += q; F[id(i, k) + 1] += q * d; }
      else { let k = 0; while (k < n - 2 && e > ys[k + 1]) k++; const h = hermite(e - ys[k], b1); F[id(i, k)] += q * h[0]; F[id(i, k) + 1] += q * h[1]; F[id(i, k + 1)] += q * h[2]; F[id(i, k + 1) + 1] += q * h[3]; }
    }
    const M = moments(resoudre(F)), S = M.reduce((s, v) => s + v, 0);
    return M.map(v => v / S);
  };
  // tabulation de η(e) de −b à +b (au-delà : extrapolation linéaire, console rigide), interpolation linéaire
  const b = n * b1 / 2, nE = Math.max(8, Math.ceil(2 * b / pas)), es = Array.from({ length: nE + 1 }, (_, j) => -b + 2 * b * j / nE), tab = es.map(eta0);
  const eta = e => {
    const t = (e + b) / (2 * b) * nE, j = Math.max(0, Math.min(nE - 1, Math.floor(t))), r = t - j;
    return tab[j].map((v, k) => v + (tab[j + 1][k] - v) * r);
  };
  const Kbar = (e1, e2) => {
    const q = Math.abs(e2 - e1) < 1e-9 ? 1 : 40, acc = new Array(n).fill(0);
    for (let i = 0; i < q; i++) { const e = q === 1 ? e1 : e1 + (e2 - e1) * (i + 0.5) / q; eta(e).forEach((v, k) => { acc[k] += v / q; }); }
    return acc.map(v => n * v);
  };
  // ------------------------------------------------------------ résolution complète (vue 3D, src/beams/grillage3d.js)
  const In = i => { const e = ent.get(i) || { I: 0, K: 0 }, w = i === 0 || i === m ? dx / 2 : dx; return { I: w * hd ** 3 / 12 + e.I, K: w * hd ** 3 / 6 + e.K, w }; };
  /** Force P (vers le bas) en (x, e) : partage linéaire entre stations, Hermite en travers (console rigide au-delà des rives). */
  const chargePoint = (F, x, e, P) => {
    const t = Math.min(m, Math.max(0, x / dx)), i0 = Math.min(m - 1, Math.floor(t)), r = t - i0;
    for (const [i, c] of [[i0, 1 - r], [i0 + 1, r]]) {
      if (c <= 0 || i === 0 || i === m) continue;     // charge directement sur l'appui : sans effet sur le tablier
      const q = P * c, y0 = ys[0], yn = ys[n - 1];
      if (e <= y0 || e >= yn) { const k = e <= y0 ? 0 : n - 1; F[id(i, k)] += q; F[id(i, k) + 1] += q * (e - ys[k]); }
      else { let k = 0; while (k < n - 2 && e > ys[k + 1]) k++; const h = hermite(e - ys[k], b1); F[id(i, k)] += q * h[0]; F[id(i, k) + 1] += q * h[1]; F[id(i, k + 1)] += q * h[2]; F[id(i, k + 1) + 1] += q * h[3]; }
    }
    return F;
  };
  const resoudreF = F => resoudre(Array.from(F));
  /** Résultats d'un vecteur de charges : flèches w, moments des poutres M [kN·m] et du hourdis m_y [kN·m/m] aux nœuds,
   * torsion des poutres T [kN·m] par élément, réactions aux extrémités des poutres [kN]. */
  const resultats = F => {
    const u = resoudreF(F), w = new Float64Array(n * (m + 1)), M = new Float64Array(n * (m + 1)), my = new Float64Array(n * (m + 1)), T = new Float64Array(n * (m + 1));
    const nd = (i, k) => i * n + k;
    for (let i = 0; i <= m; i++) for (let k = 0; k < n; k++) w[nd(i, k)] = u[id(i, k)];
    for (let k = 0; k < n; k++) for (let i = 0; i <= m; i++) {
      const c = [];
      if (i > 0) { const w0 = u[id(i - 1, k)], s0 = -u[id(i - 1, k) + 2], w1 = u[id(i, k)], s1 = -u[id(i, k) + 2]; c.push(6 * (w0 - w1) / dx ** 2 + (2 * s0 + 4 * s1) / dx); }
      if (i < m) { const w1 = u[id(i, k)], s1 = -u[id(i, k) + 2], w2 = u[id(i + 1, k)], s2 = -u[id(i + 1, k) + 2]; c.push(6 * (w2 - w1) / dx ** 2 - (4 * s1 + 2 * s2) / dx); }
      M[nd(i, k)] = -E * Ip * c.reduce((a, v) => a + v, 0) / c.length;
      const tw = []; if (i > 0) tw.push(u[id(i, k) + 1] - u[id(i - 1, k) + 1]); if (i < m) tw.push(u[id(i + 1, k) + 1] - u[id(i, k) + 1]);
      T[nd(i, k)] = G * Kp * tw.reduce((a, v) => a + v, 0) / tw.length / dx;
    }
    for (let i = 0; i <= m; i++) { const S = In(i); for (let k = 0; k < n; k++) {
      const c = [];
      if (k > 0) { const w0 = u[id(i, k - 1)], s0 = u[id(i, k - 1) + 1], w1 = u[id(i, k)], s1 = u[id(i, k) + 1]; c.push(6 * (w0 - w1) / b1 ** 2 + (2 * s0 + 4 * s1) / b1); }
      if (k < n - 1) { const w1 = u[id(i, k)], s1 = u[id(i, k) + 1], w2 = u[id(i, k + 1)], s2 = u[id(i, k + 1) + 1]; c.push(6 * (w2 - w1) / b1 ** 2 - (4 * s1 + 2 * s2) / b1); }
      my[nd(i, k)] = -E * S.I * c.reduce((a, v) => a + v, 0) / c.length / S.w;
    } }
    const R = [];
    // réaction vers le haut = F − K₀u au degré de liberté w de l'appui
    for (const i of [0, m]) for (let k = 0; k < n; k++) { const d = id(i, k); let r = F[d]; const Ki = K0[d]; for (let j = 0; j < N; j++) r -= Ki[j] * u[j]; R.push({ i, k, x: xs[i], y: ys[k], R: r }); }
    // rotation θ_x des nœuds (pente transversale) pour prolonger la surface jusqu'aux bords du tablier
    const tx = new Float64Array(n * (m + 1)); for (let i = 0; i <= m; i++) for (let k = 0; k < n; k++) tx[nd(i, k)] = u[id(i, k) + 1];
    return { u, w, M, my, T, R, tx, total: F.reduce((a, v, j) => a + (j % 3 === 0 ? v : 0), 0) };
  };
  const vecteur = () => new Float64Array(N);
  return { ys, xs, eta, Kbar, N, m, n, b1, L, dx, E, chargePoint, resultats, vecteur, entretoises: [...ent.entries()].map(([i, r]) => ({ x: xs[i], ...r })) };
}
