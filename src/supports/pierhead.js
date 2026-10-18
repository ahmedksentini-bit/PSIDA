/**
 * Tête d'appui sous les appareils d'appui : bossages (pression localisée, frettage) et partie de voile en console.
 *
 * Pression localisée (BAEL 91 A.8.4,1) : charge R_u sur l'aire a₀ × b₀ de l'appareil, centrée dans le bossage a × b
 * (rectangle homothétique) ; σ = R_u/(a₀ b₀) ≤ K f_bu, f_bu = 0,85 f_cj/(θ γ_b),
 *   K = 1 + [3 − 4/3 (α + β)] √[(1 − 4α/3)(1 − 4β/3)] ≤ 3,3, α = a₀/a, β = b₀/b ;
 *   la formule vaut 1 pour α = β = 3/4 ; au-delà (bossage à peine plus grand que l'appareil), les deux facteurs sous la
 *   racine sont négatifs et la formule redonnerait K > 1 : K = 1 (hypothèse PSIDA, prudente).
 * Frettage sous l'appareil (transposition aux réactions d'appui de l'annexe 4 du BPEL, § 1.2, première régularisation,
 * pratique des notes d'appuis) : σ_s,lim = 2/3 f_e ; frettes de surface A_s = 0,04 R_u/σ_s,lim ; éclatement dans chaque
 * plan R = 0,25 (1 − a₀/d) R_u, A_e = max(R ; 0,15 R_u)/σ_s,lim, d hauteur du prisme symétrique (épaisseur de l'appui ou
 * entraxe des appareils).
 * Console courte (BAEL 91 annexe E.6, d'après J. Perchat, Techniques de l'Ingénieur C 2 314 § 2.7.4) : d ≥ max(a ; ℓ) ;
 *   δ = min(d/a ; 4), d plafonné à 4a (charge concentrée) ou 4a + ℓ/2 (charge répartie sur ℓ, lecture du texte de Perchat,
 *   à confirmer sur l'annexe E.6) ; τ_u = V_u/(b₀ d) / (1 − 0,6 H_u/V_u) ≤ min[0,03 (2 + δ) f_cj ; 4 MPa], f_cj ≤ 30 MPa ;
 *   z = min[0,7 d (1 + 0,1 δ) ; 2,4 a (0,4 + 0,1 δ)] ; A = M_u/(z f_e/γ_s) + H_u/(f_e/γ_s) ;
 *   armatures réparties Σ A_r = λ A, λ = max[¼ (δ + 12 τ_u/f_cj − 1) ; 0,1] ; armatures inférieures A_i ≥ A/10.
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

/** Frettage sous un appareil (annexe 4 du BPEL transposée) : frettes de surface, éclatement dans les deux plans. */
export function bearingSplitting({ R, a0, b0, dA, dB, fe }) {
  const ssl = 2 / 3 * fe * 1000;                      // kN/m²
  const planes = [{ plan: 'longitudinal', a: a0, d: dA }, { plan: 'transversal', a: b0, d: dB }].map(p => {
    const Rj = 0.25 * Math.max(0, 1 - p.a / p.d) * R;
    return { ...p, Rj, Ae: Math.max(Rj, 0.15 * R) / ssl };
  });
  return { ssl: ssl / 1000, As: 0.04 * R / ssl, planes };
}

/** Console courte (BAEL annexe E.6). Charges : Vu, Hu [kN] ; a bras de levier de la charge [m] ; Mu [kN·m] (par défaut Vu·a). */
export function shortCorbel({ Vu, Hu = 0, Mu = null, a, d, b0, fcj, fe, gs = 1.15, l = 0 }) {
  const fc = Math.min(fcj, 30), short = d >= Math.max(a, l) - 1e-9;
  const dEff = Math.min(d, 4 * a + (l > 0 ? l / 2 : 0)), delta = Math.min(dEff / a, 4);
  const red = Vu > 0 ? 1 - 0.6 * Math.abs(Hu) / Vu : 1;
  const tau = Vu / 1000 / (b0 * dEff) / Math.max(red, 1e-6);
  const tauLim = Math.min(0.03 * (2 + delta) * fc, 4);
  const z = Math.min(0.7 * dEff * (1 + 0.1 * delta), 2.4 * a * (0.4 + 0.1 * delta));
  const fed = fe * 1000 / gs, M = Mu ?? Vu * a;
  const A = M / (z * fed) + Math.abs(Hu) / fed;
  const lambda = Math.max(0.25 * (delta + 12 * tau / fc - 1), 0.1);
  return { short, dEff, delta, tau, tauLim, okTau: tau <= tauLim + 1e-9, z, Mu: M, A, lambda, Ar: lambda * A, Ai: A / 10 };
}
