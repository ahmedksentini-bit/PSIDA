/**
 * Fondations des appuis : semelles superficielles (portance pressiométrique, excentrement, glissement), semelles sur
 * pieux (méthode des bielles), groupe de pieux (efforts en tête), module de réaction de Ménard, portance des pieux,
 * ferraillage minimal des pieux.
 *
 * Références : Fascicule 62 titre V (1993) ; NF P 94-261 (2013) et guide Cerema 2015 (tableau des k_p, facteurs partiels) ;
 * NF P 94-262 ; SETRA FOND 72 et PP73 (bielles) ; note des appuis du Pont de Noé (reproduite : Ménard, pieux, bielles).
 * Les valeurs marquées TODO_VERIF sont à relire sur les textes (non accessibles lors de l'écriture).
 * Unités : m, kN, kPa (kN/m²), MPa.
 */

/** Paramètres de k_p (NF P 94-261 tableau D.2.3 — guide Cerema 2015, tab. 11) : [a, b, c, kp0] pour B/L = 0 (filante) et 1. */
export const KP_261 = {
  argiles: { filante: [0.2, 0.02, 1.3, 0.8], carree: [0.3, 0.02, 1.5, 0.8] },
  sables: { filante: [0.3, 0.05, 2, 1.0], carree: [0.22, 0.18, 5, 1.0] },
  craies: { filante: [0.28, 0.22, 2.8, 0.8], carree: [0.35, 0.31, 3, 0.8] },
  marnes: { filante: [0.2, 0.2, 3, 0.8], carree: [0.2, 0.3, 3, 0.8] },
};

/** Facteur de portance pressiométrique k_p (NF P 94-261 D.2.3), interpolé linéairement en B/L. */
export function kp261({ soil = 'sables', De, B, L }) {
  const f = ([a, b, c, k0]) => k0 + (a + b * De / B) * (1 - Math.exp(-c * De / B));
  const t = Math.min(1, B / L), p = KP_261[soil];
  return f(p.filante) * (1 - t) + f(p.carree) * t;
}

/** Coefficient d'inclinaison des sols cohérents i_δ = (1 − 2δ/π)² (NF P 94-261 D.2.4 ; F62-V). */
export const iDeltaCohesive = delta => (1 - 2 * delta / Math.PI) ** 2;
/**
 * Sols frottants (F62-V annexe F.2 ; NF P 94-261 D.2.4.2, δ ≤ π/4) : i_δ = (1 − δ')² − δ'(2 − 3δ') e^(−D_e/B), δ' = 2δ/π —
 * (1 − δ/45°)² pour D_e = 0, forme cohérente pour D_e/B → ∞. Branche δ > π/4 (D.2.4.3) non codée : i_δ borné à 0. TODO_VERIF
 */
export const iDeltaFrictional = (delta, DeB) => { const d = 2 * delta / Math.PI; return Math.max(0, (1 - d) ** 2 - d * (2 - 3 * d) * Math.exp(-DeB)); };

/**
 * Semelle superficielle rectangulaire B × L sous (V, H, M_B) — modèle de Meyerhof (surface effective B' = B − 2e).
 * EC (NF P 94-261) : R_v;d = A' q_net /(γ_R;v γ_R;d;v), γ_R;d;v = 1,2, γ_R;v = 1,4 (ELU) ; 2,3 (ELS) TODO_VERIF ;
 * glissement R_h;d = V tan φ'/(γ_R;h γ_R;d;h), γ_R;h = 1,1, γ_R;d;h = 0,9 TODO_VERIF ; excentrement 1 − 2e/B ≥ 1/15 (ELU), 1/2 (ELS car.).
 * BAEL (F62-V) : q'_ref = (3 q_max + q_min)/4 ≤ q'_0 + i_δ k_p p*_le/γ_q, γ_q = 2 (ELU), 3 (ELS) ; glissement V tan φ'/1,2 + c' A'/1,5.
 */
export function shallowFooting({ code = 'EC', B, L, D = 1, V, H = 0, M = 0, ls = 'ELU', soil = 'sables', ple, De = null, q0 = 0, phi = 30, c = 0, cohesive = false }) {
  const e = V > 0 ? Math.abs(M) / V : 0, Bp = Math.max(0, B - 2 * e), Ap = Bp * L;
  const DeV = De ?? D;
  const kp = kp261({ soil, De: DeV, B: Math.max(Bp, 1e-3), L });
  const delta = V > 0 ? Math.atan(Math.abs(H) / V) : 0;
  const idelta = H === 0 ? 1 : cohesive ? iDeltaCohesive(delta) : iDeltaFrictional(delta, DeV / B);
  const qnet = kp * ple * 1000 * idelta;                                  // p*_le en MPa → q_net en kPa
  if (code === 'EC') {
    const gRv = ls === 'ELU' ? 1.4 : 2.3, Rvd = Ap * qnet / (gRv * 1.2);
    const Rhd = V * Math.tan(phi * Math.PI / 180) / (1.1 * 0.9) + (cohesive ? Ap * c : 0);
    const excOk = 1 - 2 * e / B >= (ls === 'ELU' ? 1 / 15 : 0.5);
    return { e, Bp, Ap, kp, idelta, qnet, Rvd, ratioV: V / Rvd, Rhd, ratioH: Math.abs(H) / Rhd, excOk };
  }
  const qmax = e <= B / 6 ? V / (B * L) * (1 + 6 * e / B) : 2 * V / (3 * L * (B / 2 - e)), qmin = e <= B / 6 ? V / (B * L) * (1 - 6 * e / B) : 0;
  const qref = (3 * qmax + qmin) / 4, gq = ls === 'ELU' ? 2 : 3;
  const qadm = q0 + idelta * kp * ple * 1000 / gq;
  const compressed = e <= B / 6 ? 1 : 3 * (B / 2 - e) / B;
  return { e, Bp, Ap, kp, idelta, qmax, qmin, qref, qadm, ratioV: qref / qadm, Rhd: V * Math.tan(phi * Math.PI / 180) / 1.2 + c * Ap / 1.5, ratioH: Math.abs(H) / (V * Math.tan(phi * Math.PI / 180) / 1.2 + c * Ap / 1.5), compressed, excOk: compressed >= (ls === 'ELU' ? 0.10 : 0.75) };
}

/**
 * Semelle sur pieux, méthode des bielles (FOND 72 / PP73) : tirant inférieur par paire de pieux de part et d'autre d'un fût
 * de largeur b, entraxe l, hauteur utile h : A = R/σ_s · (l/2 − b/4)/h (R réaction d'un pieu) — Noé : 498,9 cm² (note 501,5).
 */
export function pileCapStrutTie({ R, l, b, h, sigS }) { return R / (sigS * 1000) * (l / 2 - b / 4) / h; }

/** Semelle superficielle par bielles (BAEL / DTU 13.12) : A = N (B − b)/(8 d f_su) par direction (charge centrée). */
export function footingStrutTie({ N, B, b, d, fsu }) { return N * (B - b) / (8 * d * fsu * 1000); }

/**
 * Efforts dans les pieux d'un groupe sous semelle rigide : N_k = N/n ± (M − n·M_tête)·x_k/Σx², H partagé également.
 * @param {number[]} xs abscisses des pieux par rapport au centre de la semelle (une valeur par pieu)
 */
export function pileGroupForces({ N, M, H = 0, xs, Mhead = 0 }) {
  const n = xs.length, sx2 = xs.reduce((a, x) => a + x * x, 0);
  const Mr = M - n * Mhead;
  return { N: xs.map(x => N / n + (sx2 > 0 ? Mr * x / sx2 : 0)), H: H / n };
}

/**
 * Module de réaction frontal de Ménard (Fascicule 62 V annexe C.5 ; NF P 94-262 annexe I) : B₀ = 0,60 m,
 * E_s = 12 E_M / [(4/3)(B₀/B)(2,65 B/B₀)^α + α] (B ≥ B₀), 12 E_M / [(4/3)(2,65)^α + α] (B < B₀) ; k = E_s/B.
 * Noé : E_M = 1800 t/m², α = 0,66 → k = 6756 t/m³ (Ø 1,20) et 9120 t/m³ (Ø 0,80).
 */
export function menardReaction({ EM, alpha, B, B0 = 0.6 }) {
  const Es = B >= B0 ? 12 * EM / ((4 / 3) * (B0 / B) * (2.65 * B / B0) ** alpha + alpha) : 12 * EM / ((4 / 3) * 2.65 ** alpha + alpha);
  return { Es, k: Es / B };
}

/**
 * Pieu sous effort horizontal et moment en tête (poutre de Winkler, différences finies), tête libre ou encastrée, pied libre.
 * @returns {{y0, theta0, Mmax, M, z, flexHead}} déplacement et rotation en tête, moment maximal, profil des moments
 */
export function lateralPile({ L, D, E, k, H, M0 = 0, n = 200, fixedHead = false }) {
  const I = Math.PI * D ** 4 / 64, EI = E * 1000 * I, h = L / n, kh = k * D;   // k [kN/m³] → ressort linéique k·D [kN/m²]
  // inconnues y_0..y_n ; EI y'''' + k D y = 0 ; conditions : tête M = −EI y'' = M0 (ou y' = 0), V = −EI y''' = H ; pied M = V = 0
  const N = n + 1, A = Array.from({ length: N + 4 }, () => new Float64Array(N + 4)), rhs = new Float64Array(N + 4);
  const idx = i => i + 2; // nœuds fictifs −2, −1, n+1, n+2
  for (let i = 0; i <= n; i++) {
    const r = idx(i);
    A[r][idx(i - 2)] += EI / h ** 4; A[r][idx(i - 1)] += -4 * EI / h ** 4; A[r][idx(i)] += 6 * EI / h ** 4 + kh; A[r][idx(i + 1)] += -4 * EI / h ** 4; A[r][idx(i + 2)] += EI / h ** 4;
  }
  // tête : V = −EI y''' = H (signe : H pousse vers +y), M : −EI y'' = M0 ou y' = 0
  A[0][idx(-2)] = -1; A[0][idx(-1)] = 2; A[0][idx(1)] = -2; A[0][idx(2)] = 1; rhs[0] = -2 * h ** 3 * H / EI * -1;
  if (fixedHead) { A[1][idx(-1)] = -1; A[1][idx(1)] = 1; rhs[1] = 0; } else { A[1][idx(-1)] = 1; A[1][idx(0)] = -2; A[1][idx(1)] = 1; rhs[1] = -M0 * h ** 2 / EI; }
  // pied : y'' = 0, y''' = 0
  A[N + 2][idx(n - 1)] = 1; A[N + 2][idx(n)] = -2; A[N + 2][idx(n + 1)] = 1;
  A[N + 3][idx(n - 2)] = -1; A[N + 3][idx(n - 1)] = 2; A[N + 3][idx(n + 1)] = -2; A[N + 3][idx(n + 2)] = 1;
  // élimination de Gauss avec pivot partiel
  const m = N + 4, Mx = A.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[p][c])) p = r;
    [Mx[c], Mx[p]] = [Mx[p], Mx[c]];
    const pv = Mx[c][c]; if (Math.abs(pv) < 1e-30) continue;
    for (let r = 0; r < m; r++) { if (r === c) continue; const f = Mx[r][c] / pv; if (f) for (let k2 = c; k2 <= m; k2++) Mx[r][k2] -= f * Mx[c][k2]; }
  }
  const y = Array.from({ length: m }, (_, i) => Mx[i][m] / Mx[i][i]);
  const yy = i => y[idx(i)];
  const Mz = Array.from({ length: n + 1 }, (_, i) => -EI * (yy(i - 1) - 2 * yy(i) + yy(i + 1)) / h ** 2);
  return { y0: yy(0), theta0: (yy(1) - yy(-1)) / (2 * h), M: Mz, z: Mz.map((_, i) => i * h), Mmax: Math.max(...Mz.map(Math.abs)), flexHead: H ? yy(0) / H : null };
}

/** Section minimale d'armatures des pieux forés : BAEL/DTU 13.2 0,5 % ; NF EN 1536 : 0,5 % (A ≤ 0,5 m²), 25 cm² (≤ 1 m²), 0,25 % au-delà. */
export function pileMinSteel({ D, code = 'BAEL' }) {
  const A = Math.PI * D ** 2 / 4;
  if (code === 'BAEL') return 0.005 * A;
  return A <= 0.5 ? 0.005 * A : A <= 1 ? 25e-4 : 0.0025 * A;
}

/**
 * Portance d'un pieu par la méthode pressiométrique (NF P 94-262, simplifiée) : R_b = k_p p*_le A, R_s = π D Σ q_s,i h_i,
 * q_s = α·f_sol(p*_l), f_sol = (a p*_l + b)(1 − e^(−c p*_l)) (p*_l en MPa → q_s en MPa) ; R_c;d = (R_b + R_s)/(1,15 × 1,1 × 1,1)
 * (ELU) ; ELS caractéristique R_c;cr = (0,5 R_b + 0,7 R_s)/(1,15 × 1,1 × 0,9). Paramètres TODO_VERIF.
 */
export const FSOL_262 = { argiles: [0.003, 0.04, 3.5], intermediaires: [0.01, 0.06, 1.2], sables: [0.007, 0.07, 1.3], craies: [0.008, 0.08, 3], marnes: [0.01, 0.08, 3] };
export function pileCapacity262({ D, layers, kp = 1.15, alphaPile = 1.1, pleTip }) {
  const A = Math.PI * D ** 2 / 4;
  const Rb = kp * pleTip * 1000 * A;
  let Rs = 0;
  for (const ly of layers) { const [a, b, c] = FSOL_262[ly.soil] || FSOL_262.sables; const fs = (a * ly.pl + b) * (1 - Math.exp(-c * ly.pl)); Rs += Math.PI * D * ly.h * alphaPile * fs * 1000; }
  return { Rb, Rs, Rcd: (Rb + Rs) / (1.15 * 1.1 * 1.1), Rcrd: (0.5 * Rb + 0.7 * Rs) / (1.15 * 1.1 * 0.9) };
}
