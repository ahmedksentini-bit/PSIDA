/**
 * Tête d'appui sous les appareils d'appui : bossages (pression localisée, frettage) et partie de voile en console.
 *
 * Pression localisée (BAEL 91 révisé 99, A.8.4,12 et annexe E.8.2,2) : charge R_u sur l'aire a₀ × b₀ de l'appareil, centrée dans le bossage a × b
 * (rectangle homothétique) ; σ = R_u/(a₀ b₀) ≤ K f_bu, f_bu = 0,85 f_cj/(θ γ_b),
 *   K = 1 + [3 − 4/3 (α + β)] √[(1 − 4α/3)(1 − 4β/3)] ≤ 3,3, α = a₀/a, β = b₀/b ;
 *   condition de débord minimal d_a ≥ a₀/6 et d_b ≥ b₀/6 (a/a₀ ≥ 4/3, b/b₀ ≥ 4/3) ; si elle n'est pas satisfaite, K = 1
 *   (commentaire de l'A.8.4,12).
 * Frettage sous les appareils (BAEL 91 révisé 99, annexe E.8, transposition de l'annexe 4 du BPEL à l'ELU) :
 *   f_su = f_e/γ_s ; frettes de surface A_s ≥ 0,04 R_u/f_su ; prismes symétriques d_j = 2 min(c_j ; c_j*) ;
 *   éclatement R_j = 0,25 (1 − b₀ⱼ/d_j) R_uj (plan Δ, le long de la ligne d'appareils) ou 0,25 (1 − a₀ⱼ/d_j) R_uj (plan Δ′),
 *   A_ej = R_j/(k_j f_su), k_j = 1 (position extrême) ou 1,5 (intermédiaire) ;
 *   total dans chaque plan A_e + A_s = sup(max A_ej ; 0,15 max R_uj/f_su) + 0,04 R_u/f_su, sur une longueur max d_j.
 * Console courte (BAEL 91 révisé 99, annexe E.6) : d ≥ max(a ; ℓ) ; τ_u = V_u/(b₀ d), d plafonné à 4a (charge
 *   concentrée) ou 4ℓ (charge répartie sur ℓ) ; τ_u ≤ min[0,03 (2 + δ) f_cj ; 4 MPa], δ = d/a ≤ 4, f_cj ≤ 30 MPa ;
 *   A = M_u/(z f_e/γ_s), z = min[0,7 d (1 + 0,1 δ) ; 2,4 a (0,4 + 0,1 δ)] ; Σ A_r = λ A, λ = max[¼ (δ + 12 τ_u/f_cj − 1) ; 1/10],
 *   réparties sur au plus 4a + ℓ/2 si δ a été plafonné ; armatures inférieures ≥ A/10.
 *   Effort horizontal en tête : non traité par l'annexe E.6 (E.6.2,6) ; complément de la pratique (J. Perchat, Techniques de
 *   l'Ingénieur C 2 314 § 2.7.4.5) : τ_u divisé par (1 − 0,6 H_u/V_u) et A augmentée de H_u/(f_e/γ_s).
 * Unités : m, kN, MPa.
 */

/** Pression localisée sous un appareil (BAEL A.8.4,1). */
export function localPressure({ R, a0, b0, a, b, fcj, gb = 1.5, theta = 1 }) {
  const al = a0 / a, be = b0 / b, fbu = 0.85 * fcj / (theta * gb);
  const outside = al > 0.75 + 1e-12 || be > 0.75 + 1e-12;
  const Kf = 1 + (3 - 4 / 3 * (al + be)) * Math.sqrt(Math.max(0, (1 - 4 * al / 3) * (1 - 4 * be / 3)));
  const K = outside ? 1 : Math.min(3.3, Math.max(1, Kf));
  const sig = R / 1000 / (a0 * b0);
  return { al, be, Kformula: Kf, K, outside, fbu, lim: K * fbu, sig, ok: sig <= K * fbu + 1e-9 };
}

/**
 * Frettage sous les appareils d'une ligne (BAEL annexe E.8.2,3). Plan Δ′ (épaisseur d_A de l'appui, un seul appareil dans
 * l'épaisseur) ; plan Δ le long de la ligne : appareil extrême d = 2 min(entraxe/2 ; distance au bord), k = 1, appareil
 * intermédiaire d = entraxe, k = 1,5.
 */
export function bearingSplitting({ R, a0, b0, dA, pitch = Infinity, edge = Infinity, n = 1, fe, gs = 1.15 }) {
  const fsu = fe * 1000 / gs;                      // kN/m²
  const As = 0.04 * R / fsu;
  const Ae = (a, d, k) => ({ d, k, Rj: 0.25 * Math.max(0, 1 - a / d) * R, Aej: 0.25 * Math.max(0, 1 - a / d) * R / (k * fsu) });
  const pl = Ae(a0, Math.max(dA, a0), 1);
  const ext = Ae(b0, Math.max(2 * Math.min(pitch / 2, edge), b0), 1), mid = n >= 3 ? Ae(b0, Math.max(pitch, b0), 1.5) : null;
  const tr = { ...(mid && mid.Aej > ext.Aej ? mid : ext), ext, mid };
  const tot = p => Math.max(p.Aej, 0.15 * R / fsu) + As;
  const planes = [{ plan: 'Δ′ (épaisseur de l\'appui)', a: a0, ...pl, Ae: Math.max(pl.Aej, 0.15 * R / fsu), total: tot(pl) },
    { plan: 'Δ (ligne d\'appareils)', a: b0, ...tr, Ae: Math.max(tr.Aej, 0.15 * R / fsu), total: tot(tr) }];
  return { fsu: fsu / 1000, As, planes };
}

/** Console courte (BAEL annexe E.6). Charges : Vu, Hu [kN] ; a bras de levier de la charge [m] ; Mu [kN·m] (par défaut Vu·a). */
export function shortCorbel({ Vu, Hu = 0, Mu = null, a, d, b0, fcj, fe, gs = 1.15, l = 0 }) {
  const fc = Math.min(fcj, 30), short = d >= Math.max(a, l) - 1e-9;
  const dEff = Math.min(d, l > 0 ? 4 * l : 4 * a), delta = Math.min(dEff / a, 4);
  const red = Vu > 0 ? 1 - 0.6 * Math.abs(Hu) / Vu : 1;
  const tau = Vu / 1000 / (b0 * dEff) / Math.max(red, 1e-6);
  const tauLim = Math.min(0.03 * (2 + delta) * fc, 4);
  const z = Math.min(0.7 * dEff * (1 + 0.1 * delta), 2.4 * a * (0.4 + 0.1 * delta));
  const fed = fe * 1000 / gs, M = Mu ?? Vu * a;
  const A = M / (z * fed) + Math.abs(Hu) / fed;
  const lambda = Math.max(0.25 * (delta + 12 * tau / fcj - 1), 0.1);
  return { short, dEff, delta, tau, tauLim, okTau: tau <= tauLim + 1e-9, z, Mu: M, A, lambda, Ar: lambda * A, Ai: A / 10, hAr: d / a > 4 ? 4 * a + l / 2 : d };
}
