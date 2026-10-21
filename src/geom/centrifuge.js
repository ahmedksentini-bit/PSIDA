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

/**
 * Fascicule 61 titre II art. 7 : forces centrifuges calculées à partir du seul système Bc (tous les camions disposés sur la
 * chaussée), fraction du poids : (R + 150)/(6 R + 350) pour R ≤ 400 m, 80/R au-delà (continuité 0,2 à 400 m) ;
 * majorées du coefficient dynamique δ_B (art. 7.13) et des coefficients bc ; horizontales, normales à l'axe, à la surface
 * de la chaussée ; non cumulées avec le freinage (art. 7.3) ; pas de force centrifuge des charges militaires ni
 * exceptionnelles (art. 9.7, 10.5).
 */
export function coefCentrifugeF61(r) {
  if (!(r > 0) || !Number.isFinite(r)) return 0;
  return r <= 400 ? (r + 150) / (6 * r + 350) : 80 / r;
}
/** Effort total [kN] : max sur le nombre de files nf ≤ min(nv, 5) de nf · bc(nf) · (camions par file) · 300 kN · coef · δ. */
export function forceCentrifugeF61({ r, nv, bc, delta = 1, Ltot = Infinity }) {
  const c = coefCentrifugeF61(r); if (!c) return { F: 0, coef: 0, nf: 0, nCam: 0 };
  const nCam = Ltot >= 16.5 ? 2 : 1;   // au plus deux camions par file en longueur (art. 5.21), encombrement 10,50 m
  let best = { F: 0, nf: 0 };
  for (let nf = 1; nf <= Math.min(nv, 5); nf++) { const F = nf * bc[nf - 1] * nCam * 300 * c * delta; if (F > best.F) best = { F, nf }; }
  return { ...best, coef: c, nCam, delta };
}
