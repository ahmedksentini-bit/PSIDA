/**
 * Sections en béton armé par mètre de largeur — BAEL 91 (révisé 99), flexion simple, section rectangulaire.
 * Unités : m, MN, MPa ; aciers en m²/m.
 */

/** Matériaux BAEL (A.2.1, A.4.3.4, A.4.5.3). */
export function materialsBAEL({ fc28 = 30, fe = 500, gammaB = 1.5, gammaS = 1.15, theta = 1, Es = 200000, fissuration = 'prejudiciable', eta = 1.6 } = {}) {
  const ft28 = 0.6 + 0.06 * fc28;
  const fbu = 0.85 * fc28 / (theta * gammaB), fsu = fe / gammaS;
  const epsL = fsu / Es;
  const alphaL = 3.5e-3 / (3.5e-3 + epsL), muL = 0.8 * alphaL * (1 - 0.4 * alphaL);
  let sigSbar;
  if (fissuration === 'peu nuisible') sigSbar = Infinity;
  else if (fissuration === 'tres prejudiciable') sigSbar = Math.min(0.5 * fe, Math.max(0.4 * fe, 90 * Math.sqrt(eta * ft28)));
  else sigSbar = Math.min(2 / 3 * fe, Math.max(0.5 * fe, 110 * Math.sqrt(eta * ft28)));
  return { fc28, fe, ft28, gammaB, gammaS, fbu, fsu, Es, alphaL, muL, sigSbar, sigBbar: 0.6 * fc28, n: 15, fissuration };
}

/** Flexion ELU (A.4.3) : pivot A/B, aciers comprimés au-delà de μ_lim. */
export function flexureELU(Mu, { b = 1, d, dp = 0.05 }, mat) {
  if (Mu <= 0) return { As: 0, As2: 0, alpha: 0, z: d, mu: 0 };
  const mu = Mu / (b * d * d * mat.fbu);
  if (mu <= mat.muL) {
    const alpha = 1.25 * (1 - Math.sqrt(Math.max(0, 1 - 2 * mu)));
    const z = d * (1 - 0.4 * alpha);
    return { As: Mu / (z * mat.fsu), As2: 0, alpha, z, mu };
  }
  const zL = d * (1 - 0.4 * mat.alphaL), ML = mat.muL * b * d * d * mat.fbu;
  const As2 = (Mu - ML) / ((d - dp) * mat.fsu);
  return { As: ML / (zL * mat.fsu) + As2, As2, alpha: mat.alphaL, z: zL, mu };
}

/** Section fissurée (n = 15). */
export function crackedSectionBAEL(M, { b = 1, d, As, As2 = 0, dp = 0.05, widthFn = null }, mat) {
  const n = mat.n;
  if (widthFn) {
    const wm = (x, k) => { const nn = 40, h = x / nn; let s = 0; for (let i = 0; i <= nn; i++) { const z = i * h, c = i === 0 || i === nn ? 1 : i % 2 ? 4 : 2; s += c * widthFn(z) * Math.pow(x - z, k); } return s * h / 3; };
    let lo = 1e-6, hi = d;
    const f = x => wm(x, 1) + n * As2 * (x - dp) - n * As * (d - x);
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; }
    const x = hi, I = wm(x, 2) + n * As * (d - x) * (d - x) + n * As2 * (x - dp) * (x - dp);
    return { x, I, sigB: M * x / I, sigS: n * M * (d - x) / I };
  }
  const A = b / 2, B = n * (As + As2), C = -n * (As * d + As2 * dp);
  const x = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  const I = b * x * x * x / 3 + n * As * (d - x) * (d - x) + n * As2 * (x - dp) * (x - dp);
  return { x, I, sigB: M * x / I, sigS: n * M * (d - x) / I };
}

/** Flexion ELS (A.4.5.3) : aciers pour σ̄s et σ̄bc (bissection). */
export function flexureELS(Ms, { b = 1, d, dp = 0.05, widthFn = null }, mat) {
  if (Ms <= 0 || !isFinite(mat.sigSbar)) return { As: 0, As2: 0, sigB: 0, sigS: 0, x: 0 };
  let lo = 1e-6, hi = Ms / (0.5 * d * mat.sigSbar) * 4;
  const ok = As => { const r = crackedSectionBAEL(Ms, { b, d, As, dp, widthFn }, mat); return r.sigS <= mat.sigSbar && r.sigB <= mat.sigBbar; };
  if (!ok(hi)) {
    let lo2 = 0, hi2 = hi;
    const ok2 = As2 => { const As = Ms / (0.9 * d * mat.sigSbar) + As2; const r = crackedSectionBAEL(Ms, { b, d, As, As2, dp, widthFn }, mat); return r.sigB <= mat.sigBbar && r.sigS <= mat.sigSbar; };
    for (let i = 0; i < 60; i++) { const mid = (lo2 + hi2) / 2; if (ok2(mid)) hi2 = mid; else lo2 = mid; }
    const As2 = hi2, As = Ms / (0.9 * d * mat.sigSbar) + As2;
    return { As, As2, ...crackedSectionBAEL(Ms, { b, d, As, As2, dp, widthFn }, mat) };
  }
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return { As: hi, As2: 0, ...crackedSectionBAEL(Ms, { b, d, As: hi, dp, widthFn }, mat) };
}

/** Minimums : non-fragilité (A.4.2.1) et pourcentage minimal des dalles (B.7.4). */
export function minimumSteelBAEL({ b = 1, h, d }, mat) {
  const nonFrag = 0.23 * b * d * mat.ft28 / mat.fe;
  const rho0 = mat.fe >= 500 ? 0.0006 : mat.fe >= 400 ? 0.0008 : 0.0012;
  const dalle = rho0 * b * h;
  return { nonFrag, dalle, asMin: Math.max(nonFrag, dalle) };
}

/** Effort tranchant des dalles sans armatures d'âme (A.5.2.2) : τu ≤ 0,07 fc28/γb. */
export function shearBAEL(Vu, { b = 1, d }, mat) {
  const tau = Vu / (b * d), tauLim = 0.07 * mat.fc28 / mat.gammaB;
  return { tau, tauLim, ok: tau <= tauLim };
}

/** Poinçonnement (A.5.2.42) : Qu ≤ 0,045 · uc · h · fc28/γb, uc = périmètre du rectangle d'impact diffusé au feuillet moyen. */
export function punchingBAEL({ Qu, a = 0.25, bb = 0.25, tRev = 0.08, h }, mat) {
  const a1 = a + 2 * tRev + h, b1 = bb + 2 * tRev + h;
  const uc = 2 * (a1 + b1);
  const QuLim = 0.045 * uc * h * mat.fc28 / mat.gammaB;
  return { Qu, QuLim, uc, ok: Qu <= QuLim };
}
