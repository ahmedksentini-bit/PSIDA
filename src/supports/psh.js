/**
 * Appui sur pieux à la manière du programme SETRA/CETE de l'Ouest PSH (« Calcul des appuis d'ouvrages d'art », v. 1.11,
 * 1993) : semelle rigide sur pieux élastiques (verticaux ou inclinés, tête encastrée ou articulée, pied libre ou encastré),
 * sol de Winkler à module de réaction k(z) couche par couche (Ménard), matrice de rigidité du groupe, matrices de souplesse
 * de la tête d'appui (fût compris) sous charges instantanées et soutenues, efforts et déplacements des pieux le long du fût
 * (M, T, y, pression sur le sol p = k y).
 *
 * Conventions (plan vertical de calcul x, z vers le bas) : déplacements de la semelle (u horizontal, w vertical vers le bas,
 * θ rotation de +x vers +z), efforts conjugués (H, V, M). Un pieu i de tête en x_i, incliné de ω_i (axe dirigé vers
 * (sin ω, cos ω)) : déplacements locaux a (axial), t (transversal, direction (cos ω, −sin ω)), φ = y'(0) = −θ.
 * Rigidité axiale (convention PSH) : pieu travaillant en colonne de longueur L, pointe fixe, K_a = E A/L ; rigidité
 * transversale : poutre de Winkler E I y'''' + k(z) B y = 0 (différences finies), matrice 2 × 2 en (t, φ) obtenue par
 * l'énergie de déformation des deux solutions à déplacement de tête imposé.
 * Unités : m, kN, kN·m ; E en kN/m², k en kN/m³.
 */

/** Résolution dense par élimination de Gauss avec pivot partiel (A modifiée). */
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const pv = M[c][c]; if (Math.abs(pv) < 1e-300) throw new Error('système singulier');
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / pv; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
export const inv3 = m => {
  const [[a, b, c], [d, e, f], [g, h, i]] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
};
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const T = A => A[0].map((_, j) => A.map(r => r[j]));
const mv = (A, v) => A.map(r => r.reduce((s, x, k) => s + x * v[k], 0));

/**
 * Pieu de Winkler à déplacement de tête imposé : deux solutions unitaires (t = 1, φ = 0) et (t = 0, φ = 1).
 * @param {object} p L, D, E [kN/m²], k (nombre ou fonction de la profondeur sous la tête) [kN/m³], tip 'libre' | 'encastre', n
 * @returns {{ K: number[][], z: number[], unit: object[], EI: number, kOf: Function }}
 */
export function winklerPile({ L, D, E, k, tip = 'libre', n = 240 }) {
  const I = Math.PI * D ** 4 / 64, EI = E * I, h = L / n, kOf = typeof k === 'function' ? k : () => k;
  const N = n + 1, idx = i => i + 2, m = N + 4;
  const sys = (y0, f0) => {
    const A = Array.from({ length: m }, () => new Array(m).fill(0)), rhs = new Array(m).fill(0);
    for (let i = 1; i <= n; i++) {           // nœud 0 : déplacement imposé ; équation de Winkler aux nœuds 1..n
      const r = idx(i);
      A[r][idx(i - 2)] += EI / h ** 4; A[r][idx(i - 1)] += -4 * EI / h ** 4; A[r][idx(i)] += 6 * EI / h ** 4 + kOf(i * h) * D; A[r][idx(i + 1)] += -4 * EI / h ** 4; A[r][idx(i + 2)] += EI / h ** 4;
    }
    A[0][idx(0)] = 1; rhs[0] = y0;                                   // y(0) = t
    A[1][idx(-1)] = -1 / (2 * h); A[1][idx(1)] = 1 / (2 * h); rhs[1] = f0;   // y'(0) = φ
    A[idx(0)][idx(-2)] = 1; A[idx(0)][idx(-1)] = -1; A[idx(0)][idx(0)] = 0;  // équation fictive : y(−2) − y(−1) = 0 (non utilisée par y'' de tête)
    rhs[idx(0)] = 0;
    if (tip === 'encastre') { A[N + 2][idx(n)] = 1; A[N + 3][idx(n - 1)] = -1; A[N + 3][idx(n + 1)] = 1; }
    else { A[N + 2][idx(n - 1)] = 1; A[N + 2][idx(n)] = -2; A[N + 2][idx(n + 1)] = 1; A[N + 3][idx(n - 2)] = -1; A[N + 3][idx(n - 1)] = 2; A[N + 3][idx(n + 1)] = -2; A[N + 3][idx(n + 2)] = 1; }
    const y = solve(A, rhs);
    return Array.from({ length: n + 3 }, (_, i) => y[idx(i - 1)]);   // y(−1) … y(n+1)
  };
  const Y = [sys(1, 0), sys(0, 1)];
  const at = (y, i) => y[i + 1];
  const curv = (y, i) => (at(y, i - 1) - 2 * at(y, i) + at(y, i + 1)) / h ** 2;
  // matrice de rigidité par l'énergie : K_ij = ∫ EI y_i'' y_j'' dz + ∫ k B y_i y_j dz (trapèzes)
  const K = [[0, 0], [0, 0]];
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? h / 2 : h, kk = kOf(i * h) * D;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) K[a][b] += w * (EI * curv(Y[a], i) * curv(Y[b], i) + kk * at(Y[a], i) * at(Y[b], i));
  }
  const z = Array.from({ length: n + 1 }, (_, i) => i * h);
  const unit = Y.map(y => ({ y: z.map((_, i) => at(y, i)), M: z.map((_, i) => EI * curv(y, i)) }));
  // effort tranchant par dérivation du moment (différences centrées)
  for (const u of unit) u.T = u.M.map((_, i) => (i === 0 ? (-3 * u.M[0] + 4 * u.M[1] - u.M[2]) / (2 * h) : i === n ? (3 * u.M[n] - 4 * u.M[n - 1] + u.M[n - 2]) / (2 * h) : (u.M[i + 1] - u.M[i - 1]) / (2 * h)));
  return { K, z, unit, EI, kOf, D, L, E };
}

/** Matrice locale 3 × 3 d'un pieu en (a, t, φ) : axiale E A/L, transversale de Winkler, tête encastrée ou articulée. */
export function pileLocalK(wp, { head = 'encastre', Ka = null } = {}) {
  const ka = Ka ?? wp.E * Math.PI * wp.D ** 2 / 4 / wp.L;
  const [[ktt, ktf], [kft, kff]] = wp.K;
  if (head === 'articule') return [[ka, 0, 0], [0, ktt - ktf * kft / kff, 0], [0, 0, 0]];
  return [[ka, 0, 0], [0, ktt, ktf], [0, kft, kff]];
}

/** Matrice de passage des déplacements de la semelle (w, θ, u) aux déplacements locaux (a, t, φ) d'un pieu en x, incliné de ω. */
function Bmat(x, omega) {
  const s = Math.sin(omega), c = Math.cos(omega);
  // a = u s + (w + θ x) c ; t = u c − (w + θ x) s ; φ = −θ  (ordre des colonnes : w, θ, u)
  return [[c, x * c, s], [-s, -x * s, c], [0, -1, 0]];
}

/**
 * Groupe de pieux sous semelle rigide (plan de calcul) : rigidité K (ordre w, θ, u ↔ V, M, H) au niveau des têtes de pieux.
 * @param {object[]} piles [{ x, omega (rad) }] ; @param {object} wp winklerPile ; opt { head, Ka }
 */
export function pileGroup(piles, wp, opt = {}) {
  const Kl = pileLocalK(wp, opt);
  let K = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const Bs = piles.map(p => Bmat(p.x, p.omega || 0));
  for (const B of Bs) { const k = mul(T(B), mul(Kl, B)); K = K.map((r, i) => r.map((v, j) => v + k[i][j])); }
  return {
    K, Kl, wp, piles,
    /** Efforts (V, M, H) au niveau des têtes → déplacements de la semelle et efforts locaux de chaque pieu. */
    respond(V, M, H) {
      const q = solve(K.map(r => [...r]), [V, M, H]);
      return { q, piles: Bs.map((B, i) => { const d = mv(B, q), f = mv(Kl, d); return { x: piles[i].x, omega: piles[i].omega || 0, a: d[0], t: d[1], phi: d[2], N: f[0], T: f[1], M: f[2] }; }) };
    },
  };
}

/** Profil d'un pieu (M, T, y, p) pour des déplacements de tête (t, φ) : combinaison des solutions unitaires. */
export function pileProfile(wp, t, phi, head = 'encastre') {
  let ph = phi;
  if (head === 'articule') { const [[ktt, ktf], [, kff]] = wp.K; ph = -ktf * t / kff; }   // rotation libre : moment de tête nul
  const [u1, u2] = wp.unit;
  return wp.z.map((z, i) => { const y = t * u1.y[i] + ph * u2.y[i]; return { z, y, M: t * u1.M[i] + ph * u2.M[i], T: t * u1.T[i] + ph * u2.T[i], p: wp.kOf(z) * y }; });
}

/**
 * Matrice de souplesse de la tête d'appui (ordre N, M, T ↔ déplacement vertical, rotation, déplacement horizontal) :
 * superstructure en tronçons consoles empilés au-dessus d'une semelle rigide de hauteur hs (fût, puis chevêtre…),
 * segments [{ h, E, A, I }] (I = Infinity : tronçon rigide), groupe de pieux sous la semelle (souplesse C = K⁻¹ ramenée de
 * h = Σh + hs). Contributions d'un tronçon [s₀ ; s₁] (cotes au-dessus de la semelle, tête en H) :
 * θ/M = ∫ ds/EI, θ/T = ∫ (H − s) ds/EI, u/T = ∫ (H − s)² ds/EI, w/N = ∫ ds/EA.
 */
export function headFlexibility({ group, segments = [], hs = 0 }) {
  const C = inv3(group.K), H = segments.reduce((a, g) => a + g.h, 0), h = H + hs;
  const Ftr = [[1, 0, 0], [0, 1, h], [0, 0, 1]];               // (V, M_têtes, H) = Ftr · (N, M, T)
  const F = mul(T(Ftr), mul(C, Ftr));
  let s0 = 0;
  for (const g of segments) {
    const s1 = s0 + g.h, EI = g.E * g.I, a = H - s0, b = H - s1;   // a > b : distances à la tête
    if (Number.isFinite(EI) && EI > 0) {
      F[1][1] += g.h / EI; const tt = (a ** 2 - b ** 2) / 2 / EI; F[1][2] += tt; F[2][1] += tt; F[2][2] += (a ** 3 - b ** 3) / 3 / EI;
    }
    if (g.A && Number.isFinite(g.E * g.A)) F[0][0] += g.h / (g.E * g.A);
    s0 = s1;
  }
  return F;
}

/**
 * Effort tranchant d'un pieu circulaire (section pleine Ø D, armatures sur un cercle de rayon r_s = D/2 − c) :
 * largeur b_w = D, hauteur utile d = D/2 + 2 r_s/π (approche usuelle pour les sections circulaires) ;
 * BAEL 91 A.5.1 : τ_u = V_u/(b_w d) ≤ min(0,15 f_c28/γ_b ; 4 MPa), A_t/s_t ≥ γ_s (τ_u − 0,3 f_tj) b_w/(0,9 f_e) ;
 * EN 1992-1-1 § 6.2 : V_Rd,c = max(0,18/γ_c k (100 ρ f_ck)^⅓ ; 0,035 k^1,5 f_ck^½) b_w d (ρ = 0,5 A_s/(b_w d)),
 * A_sw/s = V_Ed/(z f_ywd cot θ), z = 0,9 d, cot θ = 2,5 ; V_Rd,max = b_w z ν f_cd/(cot θ + tan θ).
 */
export function pileShear({ V, D, c = 0.07, As = 0, fck = 25, fyk = 400, code = 'BAEL', gammaC = 1.5 }) {
  const rs = D / 2 - c, d = D / 2 + 2 * rs / Math.PI, bw = D;
  if (code === 'BAEL') {
    const tau = Math.abs(V) / (bw * d) / 1000, ft = 0.6 + 0.06 * fck, lim = Math.min(0.15 * fck / 1.5, 4);
    return { d, bw, tau, lim, ok: tau <= lim, AtS: Math.max(0, 1.15 * (tau - 0.3 * ft) * bw / (0.9 * fyk)), AtSmin: 0.4 * bw / fyk };
  }
  const k = Math.min(2, 1 + Math.sqrt(0.2 / d)), rho = Math.min(0.02, 0.5 * As / (bw * d));
  const VRdc = Math.max(0.18 / gammaC * k * (100 * rho * fck) ** (1 / 3), 0.035 * k ** 1.5 * Math.sqrt(fck)) * bw * d * 1000;
  const z = 0.9 * d, nu = 0.6 * (1 - fck / 250), VRdmax = bw * z * nu * fck / gammaC * 1000 / (2.5 + 0.4);
  return { d, bw, VRdc, VRdmax, ok: Math.abs(V) <= VRdmax, AtS: Math.abs(V) <= VRdc ? 0 : Math.abs(V) / (z * fyk / 1.15 * 1000 * 2.5), AtSmin: 0.08 * Math.sqrt(fck) / fyk * bw };
}

/**
 * Semelle sur n files de pieux, méthode des bielles généralisée (PP73 1.3.2 ch. 4) : pour chaque pieu hors de l'emprise du
 * fût, tirant T = R (|x| − b/4)/h (pour deux files symétriques : A₁ = R (l/2 − b/4)/(h σ̄)) et angle de bielle
 * θ = atan(h/(|x| − b/4)) ≥ 45° ; flexion de console au nu du fût M = Σ R (|x| − b/2) (contrôle, h utile d).
 * @param {object[]} files [{ x, R (réaction totale de la file) }] ; b largeur du fût ; hs hauteur ; fsu, sigma (ELS)
 */
export function pileCapFiles({ files, b, hs, cover = 0.10, fsu }) {
  const h = hs - cover;
  const rows = files.map(f => {
    const ax = Math.abs(f.x), arm = ax - b / 4;
    if (ax <= b / 2) return { ...f, inside: true, tie: 0, theta: 90 };
    return { ...f, inside: false, tie: f.R * arm / h, theta: Math.atan2(h, arm) * 180 / Math.PI };
  });
  const side = s => rows.filter(r => Math.sign(r.x) === s && !r.inside);
  const Mface = s => side(s).reduce((a, r) => a + r.R * (Math.abs(r.x) - b / 2), 0);
  const tieMax = Math.max(0, ...rows.map(r => r.tie)), Mmax = Math.max(Mface(1), Mface(-1));
  return { h, rows, tieMax, A: tieMax / (fsu * 1000), Mface: Mmax, Abend: Mmax / (0.9 * h * fsu * 1000), thetaMin: Math.min(...rows.filter(r => !r.inside).map(r => r.theta), 90) };
}
