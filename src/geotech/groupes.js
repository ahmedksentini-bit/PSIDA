// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/groupes.js) — module testé de fond.ksr-infra.org (170 tests).
// Groupes de pieux : coefficient d'efficacité et bloc monolithique.
// Fascicule 62 titre V article C.4.1,2 et annexe G.1 ; NF P94-262 articles
// 9.3 et 10.3, annexe J (guide Cerema, chapitre 9).

/** Formule de Converse-Labarre : Ce = 1 − [arctan(B/d)/(π/2)] (2 − 1/m − 1/n). */
export function converseLabarre({ B, d, m, n }) {
  return 1 - (Math.atan(B / d) / (Math.PI / 2)) * (2 - 1 / m - 1 / n);
}

/** F62 annexe G.1 § 2.5,1 (sols cohérents) : Ce = ¼ (1 + d/B) pour 1 ≤ d/B ≤ 3, 1 au-delà. */
export function efficaciteCoherentF62({ B, d }) {
  const r = d / B;
  if (r >= 3) return 1;
  return 0.25 * (1 + Math.max(r, 1));
}

/**
 * NF P94-262 formules J.2.2 et J.2.3 : Ce = 1 si d ≥ 3B, sinon
 * Ce = 1 − Cd [2 − (1/m + 1/n)] avec Cd = 1 − ¼ (1 + d/B).
 */
export function efficaciteEC7({ B, d, m, n }) {
  const r = d / B;
  if (r >= 3) return 1;
  const Cd = 1 - 0.25 * (1 + Math.max(r, 1));
  return 1 - Cd * (2 - (1 / m + 1 / n));
}

/**
 * Vérification de l'effet de groupe.
 *  F62 C.4.1,21 : Σ Fdi ≤ Ce · n · Qmax (Qmax de l'élément isolé).
 *  EC7 9.3.1 : le coefficient ne réduit que le frottement ; aux ELU
 *  Fcg;d ≤ N (Rb;d + Ce Rs;d).
 */
export function verifGroupeF62({ sommeF, Ce, n, Qmax }) {
  const R = Ce * n * Qmax;
  return { R, taux: sommeF / R, ok: sommeF <= R + 1e-9 };
}
export function verifGroupeEC7({ Fcgd, N, Rbd, Rsd, Ce }) {
  const R = N * (Rbd + Ce * Rsd);
  return { R, taux: Fcgd / R, ok: Fcgd <= R + 1e-9 };
}

/** Dimensions du bloc monolithique : plus petit périmètre circonscrit à un groupe en maille rectangulaire. */
export function blocMonolithique({ B, d, m, n, dPrime = d }) {
  const Lb = (n - 1) * d + B, lb = (m - 1) * dPrime + B;
  return { L: Math.max(Lb, lb), l: Math.min(Lb, lb), perimetre: 2 * (Lb + lb), aire: Lb * lb };
}
