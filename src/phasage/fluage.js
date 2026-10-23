/**
 * Lois de comportement différé du béton pour le calcul par phases.
 *
 *  - Loi « ec2 » : NF EN 1992-1-1, § 3.1.2 (évolution de f_cm et E_cm avec l'âge), § 3.1.4 (retrait de dessiccation et
 *    retrait endogène) et annexe B (coefficient de fluage φ(t, t₀), âge corrigé selon le type de ciment, B.9).
 *    Fonction de fluage : J(t, τ) = 1 / E_c(τ) + φ(t, τ) / E_c,   E_c = 1,05 E_cm (§ 3.1.4 (2)).
 *  - Loi « dischinger » (validation) : J(t, τ) = [1 + φ(t) − φ(τ)] / E, φ(t) = φ∞ (1 − e^{−(t − t₀)/T}). Loi « à vitesse de
 *    fluage » pour laquelle les redistributions ont une solution fermée (Dischinger, 1937) : elle sert à recouper le
 *    calcul pas à pas, pas à dimensionner.
 *
 * Unités : temps en jours, contraintes et modules en MPa, épaisseur fictive h₀ en mm, humidité relative en %.
 */

const CIMENT = { S: { alpha: -1, ads1: 3, ads2: 0.13, s: 0.38 }, N: { alpha: 0, ads1: 4, ads2: 0.12, s: 0.25 }, R: { alpha: 1, ads1: 6, ads2: 0.11, s: 0.20 } };

/** k_h du tableau 3.3 (interpolation linéaire). */
function kh(h0) {
  const T = [[100, 1.0], [200, 0.85], [300, 0.75], [500, 0.70]];
  if (h0 <= 100) return 1.0;
  if (h0 >= 500) return 0.70;
  for (let i = 1; i < T.length; i++) if (h0 <= T[i][0]) return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (h0 - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
  return 0.70;
}

/**
 * Béton selon l'EN 1992-1-1. o = { fck (MPa), RH (%), h0 (mm), ciment: 'S' | 'N' | 'R', ts (âge au début de la
 * dessiccation, j), avecRetrait (false : fluage seul) } ; température 20 °C. Les âges sont comptés depuis le coulage.
 */
export function betonEC2({ fck = 35, RH = 70, h0 = 300, ciment = 'N', ts = 3, avecRetrait = true } = {}) {
  const c = CIMENT[ciment] || CIMENT.N, fcm = fck + 8, Ecm = 22000 * (fcm / 10) ** 0.3, Ec = 1.05 * Ecm;
  const betaCC = t => Math.exp(c.s * (1 - Math.sqrt(28 / Math.max(t, 1e-6))));
  const fcmT = t => betaCC(t) * fcm, EcmT = t => (fcmT(t) / fcm) ** 0.3 * Ecm;
  // annexe B : fluage
  const a1 = (35 / fcm) ** 0.7, a2 = (35 / fcm) ** 0.2, a3 = (35 / fcm) ** 0.5;
  const phiRH = fcm <= 35 ? 1 + (1 - RH / 100) / (0.1 * Math.cbrt(h0)) : (1 + (1 - RH / 100) / (0.1 * Math.cbrt(h0)) * a1) * a2;
  const bFcm = 16.8 / Math.sqrt(fcm);
  const t0Corr = t0 => Math.max(0.5, t0 * (9 / (2 + t0 ** 1.2) + 1) ** c.alpha);   // (B.9), à 20 °C
  const bT0 = t0 => 1 / (0.1 + t0Corr(t0) ** 0.2);
  const bH = Math.min(1.5 * (1 + (0.012 * RH) ** 18) * h0 + 250 * (fcm <= 35 ? 1 : a3), 1500 * (fcm <= 35 ? 1 : a3));
  const phi = (t, t0) => (t <= t0 ? 0 : phiRH * bFcm * bT0(t0) * ((t - t0) / (bH + t - t0)) ** 0.3);
  // § 3.1.4 (6) et annexe B.2 : retrait
  const bRH = 1.55 * (1 - (RH / 100) ** 3);
  const ecd0 = 0.85 * ((220 + 110 * c.ads1) * Math.exp(-c.ads2 * fcm / 10)) * 1e-6 * bRH;
  const k = kh(h0), ecaInf = 2.5 * (fck - 10) * 1e-6;
  const retrait = t => {
    if (!avecRetrait) return 0;
    const ecd = t > ts ? (t - ts) / ((t - ts) + 0.04 * Math.sqrt(h0 ** 3)) * k * ecd0 : 0;
    const eca = (1 - Math.exp(-0.2 * Math.sqrt(Math.max(t, 0)))) * ecaInf;
    return -(ecd + eca);   // raccourcissement négatif
  };
  return {
    type: 'ec2', fck, fcm, Ecm, Ec, RH, h0, ciment, ts,
    E: t => EcmT(t),
    /** J(t, τ) en 1/MPa, âges depuis le coulage. */
    J: (t, tau) => 1 / EcmT(tau) + phi(t, tau) / Ec,
    phi, retrait, phiRH, bH,
  };
}

/** Loi de Dischinger (validation) : E constant, φ(t) = φ∞ (1 − e^{−t/T}), retrait affine en φ (ε_sh = ε∞ φ(t) / φ∞). */
export function betonDischinger({ E = 30000, phiInf = 2, T = 100, epsInf = 0 } = {}) {
  const ph = t => phiInf * (1 - Math.exp(-Math.max(t, 0) / T));
  return {
    type: 'dischinger', E: () => E,
    J: (t, tau) => (1 + Math.max(0, ph(t) - ph(tau))) / E,
    phi: (t, tau) => Math.max(0, ph(t) - ph(tau)), phiDe: ph,
    retrait: t => (phiInf > 0 ? epsInf * ph(t) / phiInf : 0),
  };
}

/**
 * Loi non vieillissante (validation) : J(t, τ) = [1 + φ∞ (1 − e^{−(t − τ)/T})] / E — hypothèse du Bulletin technique
 * Sétra n° 7 (1972), annexe I § 2.2 (« module élastique indépendant de l'âge »). Solide de Kelvin : relaxation
 * R(t)/E = [1 + φ∞ e^{−(1 + φ∞) t/T}] / (1 + φ∞).
 */
export function betonNonVieillissant({ E = 30000, phiInf = 2, T = 100 } = {}) {
  const ph = d => phiInf * (1 - Math.exp(-Math.max(d, 0) / T));
  return { type: 'nonVieillissant', E: () => E, J: (t, tau) => (1 + ph(t - tau)) / E, phi: (t, tau) => ph(t - tau), retrait: () => 0 };
}

/** Loi élastique (sans fluage ni retrait) : contrôle des calculs par phases instantanés. */
export function betonElastique({ E = 30000 } = {}) { return { type: 'elastique', E: () => E, J: () => 1 / E, phi: () => 0, retrait: () => 0 }; }

export function loiBeton(o = {}) {
  if (o.loi === 'dischinger') return betonDischinger(o);
  if (o.loi === 'elastique') return betonElastique(o);
  if (o.loi === 'nonVieillissant') return betonNonVieillissant(o);
  return betonEC2(o);
}
