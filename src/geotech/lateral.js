// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/lateral.js) — module testé de fond.ksr-infra.org.
// Pieu sous effort transversal : module de réaction de Ménard, solution
// analytique du pieu long (Winkler, sol homogène) et résolution par
// différences finies pour un sol en couches, avec palier plastique.
// Fascicule 62 annexe C.5 ; NF P94-262 annexe I (guide Cerema, chapitre 8).
//
// Unités : z, B, L en m · EM, pf*, pl* en MPa · Kf en kPa (kN/m par m de
// déplacement) · EI en kN·m² · H en kN · M en kN·m · y en m.

import { B0 } from "./tassements.js";

/**
 * Module de réaction linéique de Ménard pour les sollicitations de courte
 * durée (F62 C.5 art. 3.1 ; NF P94-262 formules I.1.3.1 et I.1.3.2) :
 *   B ≥ B0 : Kf = 12 EM / [ 4/3 (B0/B)(2,65 B/B0)^α + α ]
 *   B ≤ B0 : Kf = 12 EM / [ 4/3 (2,65)^α + α ]
 * (formule de Ménard multipliée par 2 pour le court terme). Longue durée : Kf/2.
 */
export function moduleKf({ EM, B, alpha }) {
  const den = B >= B0
    ? (4 / 3) * (B0 / B) * (2.65 * B / B0) ** alpha + alpha
    : (4 / 3) * 2.65 ** alpha + alpha;
  const Kf = (12 * EM * 1000) / den;
  return { Kf, KfLongTerme: Kf / 2, Es: Kf / 2 };
}

/**
 * Minoration près de la surface (F62 C.5 art. 6 ; NF P94-262 I.1.6) :
 * coefficient 0,5 (1 + z/zc) sur les pentes et les paliers, zc = 2B (sols
 * cohérents) ou 4B (sols frottants). Simplification admise par la norme :
 * 0,5 sur la pente et 0,7 sur le palier entre 0 et zc.
 */
export function minorationSurface({ z, B, sol = "coherent", simplifiee = false }) {
  const zc = (sol === "coherent" ? 2 : 4) * B;
  if (z >= zc) return { pente: 1, palier: 1, zc };
  if (simplifiee) return { pente: 0.5, palier: 0.7, zc };
  const c = 0.5 * (1 + z / zc);
  return { pente: c, palier: c, zc };
}

/**
 * Pieu long en sol homogène (Kf constant), tête au niveau du sol :
 *   l0 = (4 EI / Kf)^¼, λ = 1/l0 ;
 *   y(z) = (2λ/Kf) e^(−λz) [H cos λz + λ M (cos λz − sin λz)]
 *   M(z) = e^(−λz) [M (cos λz + sin λz) + (H/λ) sin λz]
 * Tête libre : y0 = 2H/(Kf l0) + 2M/(Kf l0²) ; Mmax ≈ 0,322 H l0 si M = 0.
 * Tête encastrée (rotation nulle) : y0 = H/(Kf l0), M0 = −H l0/2.
 */
export function pieuLongAnalytique({ EI, Kf, H, M = 0, tete = "libre" }) {
  const l0 = (4 * EI / Kf) ** 0.25;
  const lam = 1 / l0;
  const M0 = tete === "encastree" ? -H * l0 / 2 : M;
  const y = (z) => ((2 * lam) / Kf) * Math.exp(-lam * z) * (H * Math.cos(lam * z) + lam * M0 * (Math.cos(lam * z) - Math.sin(lam * z)));
  const Mz = (z) => Math.exp(-lam * z) * (M0 * (Math.cos(lam * z) + Math.sin(lam * z)) + (H / lam) * Math.sin(lam * z));
  const Tz = (z) => Math.exp(-lam * z) * (H * (Math.cos(lam * z) - Math.sin(lam * z)) - 2 * lam * M0 * Math.sin(lam * z));
  const y0 = y(0);
  const theta0 = ((2 * lam) / Kf) * (-lam * H - 2 * lam * lam * M0);
  // Moment maximal en valeur absolue : recherche sur 0 ≤ z ≤ 3 l0.
  let zMax = 0, MMax = Math.abs(Mz(0));
  for (let i = 1; i <= 600; i++) {
    const z = (3 * l0 * i) / 600, m = Math.abs(Mz(z));
    if (m > MMax) { MMax = m; zMax = z; }
  }
  return { l0, y0, theta0, M0, MMax, zMax, y, M: Mz, T: Tz };
}

/** Pieu « souple » (comportement de pieu long) si sa longueur dépasse ≈ 3 l0. */
export const pieuSouple = ({ L, l0 }) => L >= 3 * l0;

/** Résolution d'un système linéaire dense (Gauss avec pivot partiel). */
function resoudre(A, b) {
  const n = b.length;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    [A[k], A[p]] = [A[p], A[k]];
    [b[k], b[p]] = [b[p], b[k]];
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      if (!f) continue;
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

/**
 * Pieu de longueur L dans un sol stratifié, par différences finies.
 * reaction(z) → { K (kPa), rmax (kN/m, Infinity si élastique) }.
 * Tête : effort H et moment M (libre) ou rotation nulle (encastrée) ; pied libre.
 * Loi élasto-plastique r = min(K |y| ; rmax) traitée par modules sécants.
 */
export function pieuDifferencesFinies({ L, EI, H, M = 0, tete = "libre", reaction, n = 200, iterations = 60 }) {
  const h = L / n, N = n;
  const z = Array.from({ length: N + 1 }, (_, i) => i * h);
  const lois = z.map((zi) => reaction(zi));
  let k = lois.map((l) => l.K);
  let y = new Array(N + 1).fill(0);
  let plastifies = 0;
  for (let it = 0; it < iterations; it++) {
    const A = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
    const bvec = new Array(N + 1).fill(0);
    const c = EI / h ** 4;
    // Nœuds fictifs exprimés en fonction des nœuds réels : { coefs, cst }.
    const fictif = (j) => {
      if (j === -1) {
        // tête libre : EI y''(0) = M ; encastrée : y'(0) = 0
        if (tete === "encastree") return { coefs: { 1: 1 }, cst: 0 };
        return { coefs: { 1: -1, 0: 2 }, cst: (M * h * h) / EI };
      }
      if (j === -2) {
        // EI y'''(0) = H : y(−2) = y2 − 2y1 + 2y(−1) − 2h³H/EI
        const m1 = fictif(-1);
        const coefs = { 2: 1, 1: -2 };
        for (const [i, v] of Object.entries(m1.coefs)) coefs[i] = (coefs[i] ?? 0) + 2 * v;
        return { coefs, cst: 2 * m1.cst - (2 * h ** 3 * H) / EI };
      }
      if (j === N + 1) return { coefs: { [N]: 2, [N - 1]: -1 }, cst: 0 };
      if (j === N + 2) {
        const p1 = fictif(N + 1);
        const coefs = { [N - 2]: 1, [N - 1]: -2 };
        for (const [i, v] of Object.entries(p1.coefs)) coefs[i] = (coefs[i] ?? 0) + 2 * v;
        return { coefs, cst: 2 * p1.cst };
      }
      return null;
    };
    const stencil = [1, -4, 6, -4, 1];
    for (let i = 0; i <= N; i++) {
      for (let s = 0; s < 5; s++) {
        const j = i - 2 + s, coef = c * stencil[s];
        if (j >= 0 && j <= N) A[i][j] += coef;
        else {
          const f = fictif(j);
          for (const [jj, v] of Object.entries(f.coefs)) A[i][Number(jj)] += coef * v;
          bvec[i] -= coef * f.cst;
        }
      }
      A[i][i] += k[i];
    }
    const ynew = resoudre(A, bvec);
    // Modules sécants là où le palier est atteint.
    let change = false;
    plastifies = 0;
    const knew = lois.map((l, i) => {
      const r = l.K * Math.abs(ynew[i]);
      if (r > l.rmax) { plastifies++; return l.rmax / Math.max(Math.abs(ynew[i]), 1e-12); }
      return l.K;
    });
    for (let i = 0; i <= N; i++) if (Math.abs(knew[i] - k[i]) > 1e-6 * (lois[i].K + 1)) change = true;
    y = ynew; k = knew;
    if (!change) break;
  }
  // Efforts dans le pieu.
  const Mz = z.map((_, i) => {
    const ym = i === 0 ? (tete === "encastree" ? y[1] : 2 * y[0] - y[1] + (M * h * h) / EI) : y[i - 1];
    const yp = i === N ? 2 * y[N] - y[N - 1] : y[i + 1];
    return (EI * (yp - 2 * y[i] + ym)) / (h * h);
  });
  if (tete !== "encastree") Mz[0] = M;
  Mz[N] = 0;
  const Tz = z.map((_, i) => (i === 0 ? H : i === N ? 0 : (Mz[i + 1] - Mz[i - 1]) / (2 * h)));
  const p = z.map((_, i) => k[i] * y[i]);
  let iMax = 0;
  for (let i = 0; i <= N; i++) if (Math.abs(Mz[i]) > Math.abs(Mz[iMax])) iMax = i;
  return { z, y, M: Mz, T: Tz, p, y0: y[0], MMax: Mz[iMax], zMMax: z[iMax], plastifies };
}
