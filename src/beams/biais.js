/**
 * Biais des ponts à poutres (travées indépendantes, poutres parallèles à l'axe, lignes d'appui biaises).
 *
 * Ni l'Eurocode ni le guide Sétra VIPP ne donnent de règle de répartition pour le biais ; le guide VIPP (1996) demande
 * une étude particulière en dessous de 70 gr environ. PSIDA reprend les coefficients des facteurs de répartition de
 * l'AASHTO LRFD (9e éd., § 4.6.2.2.2e et 4.6.2.2.3c, tabliers en béton sur poutres béton en I ou en T, types a, e, k),
 * calés sur des calculs aux éléments finis de grillages biais (NCHRP 12-26, Zokaie et al. 1991) :
 *
 *  - effort tranchant à l'angle obtus (tableau 4.6.2.2.3c-1) : F_V = 1 + 0,20 (L t_s³ / K_g)^0,3 tan θ, 0 ≤ θ ≤ 60° ;
 *  - réduction des moments (tableau 4.6.2.2.2e-1) : r_M = 1 − c₁ (tan θ)^1,5, c₁ = 0,25 (K_g/(L t_s³))^0,25 (S/L)^0,5
 *    (c₁ = 0 pour θ < 30°, θ plafonné à 60°) — donnée pour mémoire, non appliquée (prudent).
 *
 * θ : angle de biais compté depuis la normale à l'axe, θ = (100 − ψ) × 0,9° (ψ en grades, 100 = pont droit) ; L portée,
 * t_s épaisseur du hourdis, S entraxe des poutres, K_g = n (I_b + A_b e_g²) paramètre de rigidité longitudinale de la poutre
 * seule (n = E_poutre / E_hourdis, e_g distance des centres de gravité de la poutre et du hourdis). Unités cohérentes (m) :
 * le facteur 12 de l'AASHTO ne fait que convertir les pieds de L en pouces.
 *
 * Application (hypothèse PSIDA) : F_V multiplie la part du trafic de l'effort tranchant et de la réaction des poutres de rive
 * (l'angle obtus est à une extrémité de chacune), décroissant linéairement de l'appui à la mi-travée ; les poutres
 * intérieures et les charges permanentes ne sont pas corrigées. La somme des réactions d'une ligne est inchangée (l'angle
 * aigu est déchargé) : la réaction corrigée est celle de l'appareil le plus chargé.
 */
export function biaisPoutres({ psi = 100, L, ts, S, Kg }) {
  const thetaBrut = Math.max(0, (100 - psi) * 0.9), theta = Math.min(thetaBrut, 60);
  const notes = [];
  if (!(thetaBrut > 1e-9)) return { psi, theta: 0, Fv: 1, rM: 1, c1: 0, actif: false, notes };
  if (thetaBrut > 60) notes.push(`biais ${psi} gr (θ = ${thetaBrut.toFixed(1)}° > 60°) : hors du domaine de l'AASHTO LRFD, coefficients calculés à θ = 60° — étude par grillage ou éléments finis nécessaire`);
  if (psi < 70) notes.push('biais inférieur à 70 gr : le guide Sétra VIPP (1996) demande une étude particulière (grillage ou éléments finis)');
  const t = Math.tan(theta * Math.PI / 180);
  const Fv = 1 + 0.20 * (L * ts ** 3 / Kg) ** 0.3 * t;
  const c1 = theta < 30 ? 0 : 0.25 * (Kg / (L * ts ** 3)) ** 0.25 * Math.sqrt(S / L);
  const rM = 1 - c1 * t ** 1.5;
  return { psi, theta, thetaBrut, Fv, rM, c1, Kg, actif: true, notes };
}

/** K_g = n (I_b + A_b e_g²) de la poutre seule, avec n = E_poutre/E_hourdis (E_cm ∝ (f_ck + 8)^0,3). */
export function kgPoutre({ Ib, Ab, eg, fckP = null, fckH = null }) {
  const n = fckP && fckH ? ((fckP + 8) / (fckH + 8)) ** 0.3 : 1;
  return { n, Kg: n * (Ib + Ab * eg * eg) };
}
