/**
 * Force centrifuge EN 1991-2 § 4.4.2 (tableau 4.3) : Q_tk = 0,2 Q_v (r < 200 m) ; 40 Q_v / r (200 ≤ r ≤ 1500 m) ; 0 au-delà.
 * Q_v = Σ α_Qi (2 Q_ik) : poids total des tandems TS du modèle 1. Force transversale ponctuelle au niveau de la chaussée,
 * à prendre dans le groupe gr2 avec le freinage (tableau 4.4a).
 */
export function forceCentrifuge({ r, Qv }) {
  if (!(r > 0) || !Number.isFinite(r)) return 0;
  if (r < 200) return 0.2 * Qv;
  if (r <= 1500) return 40 * Qv / r;
  return 0;
}
/** Q_v pour n voies conventionnelles (Q_1k, Q_2k, Q_3k = 300, 200, 100 kN par essieu). */
export function qvEC(aQ = [1, 1, 1], nVoies = 3) {
  const Q = [300, 200, 100]; let s = 0;
  for (let i = 0; i < Math.min(3, nVoies); i++) s += 2 * (aQ[i] ?? 1) * Q[i];
  return s;
}
