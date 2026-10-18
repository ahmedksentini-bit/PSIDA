/**
 * Piles (voile ou colonnes) et voiles de culée : descente des efforts de la tête au pied, stabilité de forme, ferraillage
 * en flexion composée et dispositions minimales.
 *
 * Références : SETRA PP73 « Appuis des tabliers » (piles et palées) ; BAEL 91 A.4.4 (flambement, méthode forfaitaire),
 * A.8.1,21 (pourcentages minimaux) ; EN 1992-1-1 § 5.8 (second ordre, courbure nominale), § 9.5 / 9.6 (minimums).
 * Unités : m, kN, kN·m, MPa.
 */
import { requiredSteelNM } from './section_nm.js';
import { beamOnSupports } from './beam1d.js';

/** Efforts en pied du fût (et en sous-face de semelle) à partir des efforts en tête d'une combinaison. */
export function descendLoads({ N, H, M = 0, Hf, hc = 0, gamma = 1.35, Wchev = 0, Wfut = 0, Wsem = 0, hs = 0, Msup = 0 }) {
  const top = { N, M, H };
  const base = { N: N + gamma * (Wchev + Wfut), M: M + Msup + H * (Hf + hc), H };
  const found = { N: base.N + gamma * Wsem, M: base.M + H * hs, H };
  return { top, base, found };
}

/** Élancement et contrainte critique d'Euler (vérification de la note Noé) ; l_f = 2 H pour un fût console. */
export function buckling({ Lf, h, Ev, b = null, D = null }) {
  const i = D ? D / 4 : h / Math.sqrt(12);
  const lambda = Lf / i;
  return { lambda, sigCr: Math.PI ** 2 * Ev / lambda ** 2, i };
}

/**
 * Second ordre (excentricités), pour un effort normal N [kN] et une excentricité du premier ordre e₁ [m].
 * BAEL A.4.4,3 — méthode forfaitaire si l_f/h ≤ max(15 ; 20 e₁/h) : e_a = max(2 cm ; l/250), e₂ = 3 l_f²(2 + α φ)/(10⁴ h), φ = 2,
 *   α = M_G/(M_G + M_Q) ; au-delà (piles élancées, cas courant), justification de l'état limite de stabilité de forme (A.4.4,2)
 *   remplacée ici par l'amplification du moment M = N (e₁ + e_a)/(1 − N/N_cr), N_cr = π² E_v I/l_f² (module différé,
 *   section brute — approche simplifiée, à confirmer par un calcul non linéaire si N/N_cr > 0,1).
 * EC2 § 5.8.3.1 : pas de second ordre si λ ≤ λ_lim = 20 A B C/√n (A = 0,7, B = 1,1, C = 0,7, n = N/(A_c f_cd)) ;
 *   sinon courbure nominale § 5.8.8 : e₂ = (1/r) l₀²/10, 1/r = K_r K_φ ε_yd/(0,45 d) (K_r = K_φ = 1, sécuritaire) ;
 *   imperfection e_i = θ_i l₀/2, θ_i = α_h/200, α_h = 2/√l (2/3 ≤ α_h ≤ 1) ; e₀ ≥ max(h/30 ; 20 mm) (§ 6.1(4)).
 */
export function secondOrder({ code = 'BAEL', Lf, h, d = null, L = null, alpha = 0.5, phi = 2, fyk = 400, fck = 25, N, e1 = 0, Ev, I, Ac }) {
  const l = L ?? Lf / 2;
  if (code === 'BAEL') {
    const ea = Math.max(0.02, l / 250);
    if (Lf / h <= Math.max(15, 20 * (e1 + ea) / h)) { const e2 = 3 * Lf ** 2 * (2 + alpha * phi) / (1e4 * h); return { method: 'forfaitaire BAEL A.4.4,3', ea, e2, etot: e1 + ea + e2 }; }
    const Ncr = Math.PI ** 2 * Ev * 1000 * I / Lf ** 2;
    if (N >= Ncr) return { method: 'amplification', ea, Ncr, etot: Infinity };
    return { method: 'amplification 1/(1 − N/N_cr)', ea, Ncr, amp: 1 / (1 - N / Ncr), etot: (e1 + ea) / (1 - N / Ncr) };
  }
  const ah = Math.min(1, Math.max(2 / 3, 2 / Math.sqrt(l))), ei = (ah / 200) * Lf / 2;
  const e0 = Math.max(e1 + ei, h / 30, 0.02);
  const nrel = N / (Ac * fck / 1.5 * 1000), lam = Lf / Math.sqrt(I / Ac), lamLim = 20 * 0.7 * 1.1 * 0.7 / Math.sqrt(Math.max(nrel, 1e-6));
  if (lam <= lamLim) return { method: 'EC2 5.8.3.1 : λ ≤ λ_lim', ea: ei, lam, lamLim, etot: e0 };
  const e2 = (fyk / 1.15 / 200000) / (0.45 * (d ?? 0.9 * h)) * Lf ** 2 / 10;
  return { method: 'EC2 5.8.8 courbure nominale', ea: ei, e2, lam, lamLim, etot: e0 + e2 };
}

/** Pourcentages minimaux et maximaux d'armatures longitudinales d'un fût. */
/**
 * Pourcentages minimaux et maximaux d'armatures longitudinales d'un fût ; PP73 1.3.2 § 1.1.2 : au moins 20 cm² par élément
 * pour les colonnes, poteaux et voiles de section inférieure à 1 m² (taux fréquemment porté à 2 % pour les colonnes, § 1.3).
 */
export function minimumSteelPier({ code = 'BAEL', Ac, perimeter, Ned = 0, fyk = 400, element = false }) {
  const pp73 = element || Ac < 1 ? 20e-4 : 0;
  if (code === 'BAEL') return { min: Math.max(4e-4 * perimeter, 0.002 * Ac, pp73), max: 0.05 * Ac, rule: `BAEL A.8.1,21 : max(4 cm²/m de parement ; 0,2 % B), 5 % B au plus${pp73 ? ' ; PP73 1.3.2 § 1.1.2 : ≥ 20 cm² par colonne, poteau ou voile < 1 m²' : ''}` };
  return { min: Math.max(0.1 * Ned / (fyk / 1.15 * 1000), 0.002 * Ac, pp73), max: 0.04 * Ac, rule: `EC2 § 9.5.2 / 9.6.2 : max(0,10 N_Ed/f_yd ; 0,002 A_c), 0,04 A_c au plus${pp73 ? ' ; PP73 1.3.2 § 1.1.2 : ≥ 20 cm² par élément' : ''}` };
}

/**
 * Fût de pile ou voile de culée : ferraillage en flexion composée en pied, sur l'ensemble des combinaisons ELU.
 * @param {object} p  shape ({ b, h, c } longitudinal × transversal, ou { D, c, nBars }), code, fck, fyk, Ev (MPa), Hf (hauteur), Lf,
 *   combos : [{ label, N, M }] en pied (ELU) ; n : nombre de fûts identiques (colonnes) partageant N et M
 */
export function designShaft({ shape, code = 'BAEL', fck = 25, fyk = 400, Ev = null, Hf, Lf = null, combos = [], n = 1, alphaGQ = 0.5 }) {
  const lf = Lf ?? 2 * Hf;
  const h = shape.D || shape.h;
  const Ac = shape.D ? Math.PI * shape.D ** 2 / 4 : shape.b * shape.h;
  const per = shape.D ? Math.PI * shape.D : 2 * (shape.b + shape.h);
  const Evv = Ev ?? (code === 'BAEL' ? 3700 * fck ** (1 / 3) : 22000 * ((fck + 8) / 10) ** 0.3 / 3);
  const buck = buckling({ Lf: lf, h, Ev: Evv, D: shape.D || null });
  const I = shape.D ? Math.PI * shape.D ** 4 / 64 : shape.b * shape.h ** 3 / 12;
  const rows = combos.map(c => {
    // c.My : moment transversal global (séisme Y) partagé entre fûts circulaires (moment résultant) ;
    // c.Mloc : moment local d'un seul fût (choc de véhicule ou de bateau sur une colonne), non partagé
    const N = c.N / n, Mx = Math.abs(c.M) / n, My = shape.D ? Math.abs(c.My || 0) / n : 0;
    const M1 = Math.hypot(Mx, My) + Math.abs(c.Mloc || 0), e1 = N > 0 ? M1 / N : 0;
    const so = secondOrder({ code, Lf: lf, h, d: h - (shape.c ?? 0.05), L: Hf, alpha: alphaGQ, fyk, fck, N, e1, Ev: Evv, I, Ac });
    const Mtot = Number.isFinite(so.etot) ? Math.max(M1, N * so.etot) : Infinity;
    // situations accidentelles (séisme, chocs) : γ_b = 1,15 (BAEL A.4.3,41) / γ_c = 1,2 (EC2 2.4.2.4), γ_s = 1,0
    const mat = c.acc ? { code, fck, fyk, gammaC: code === 'BAEL' ? 1.15 : 1.2, gammaS: 1.0 } : { code, fck, fyk };
    const r = Number.isFinite(Mtot) ? requiredSteelNM(shape, mat, N, Mtot) : { As: null };
    return { ...c, Nshaft: N, M1, Mtot, e1, secondOrder: so, As: r.As, sigma: N / Ac / 1000 };
  });
  const mins = minimumSteelPier({ code, Ac, perimeter: per, Ned: Math.max(0, ...rows.map(r => r.Nshaft)), fyk, element: !!shape.D });
  const AsReq = Math.max(0, ...rows.map(r => (r.As === null ? Infinity : r.As)));
  return { Ac, I, perimeter: per, buckling: buck, Ev: Evv, rows, mins, As: Math.max(AsReq, mins.min), AsReq, ok: AsReq <= mins.max };
}

/**
 * Chevêtre de pile sur n fûts (console sur un fût unique) ou semelle filante sur pieux (appuis élastiques k = E S/L) :
 * poutre continue sous les réactions d'appareils et le poids propre ; aciers par nappe (flexion simple, section N-M
 * symétrique / 2) et minimum par face rhoMin : chevêtre 0,5 % pour l'ensemble des nappes (PP73 1.3.2 § 2.2.5.1, soit
 * 0,25 % par face ; armatures transversales ≥ 0,2 %, t < 20 cm ; section conseillée ≥ 0,60 × 0,70 m) ; semelles 0,12 % par
 * nappe (§ 1.1.1).
 * @param {object} p length, supports [{ x, k? }], loads [{ x, P }], q (kN/m), b, h, c, fck, fyk, code, EI, rhoMin (par face)
 */
export function pierCap({ length, supports, loads, q = 0, b, h, c = 0.05, fck = 25, fyk = 400, code = 'BAEL', EI = null, rhoMin = 0.0025 }) {
  const E = code === 'BAEL' ? 11000 * fck ** (1 / 3) : 22000 * ((fck + 8) / 10) ** 0.3;
  const r = beamOnSupports({ length, EI: EI ?? E * 1000 * b * h ** 3 / 12, supports: supports.map(s => (typeof s === 'number' ? { x: s } : s)), loads, q });
  const Mneg = -r.Mmin, Mpos = r.Mmax;
  const As = M => (M > 0 ? (requiredSteelNM({ b, h, c }, { code, fck, fyk }, 0, M).As ?? Infinity) / 2 : 0);
  const Amin = rhoMin * b * h;
  return { Mneg, Mpos, V: r.Vabs, R: r.R, AsTop: Math.max(As(Mneg), Amin), AsBot: Math.max(As(Mpos), Amin), Amin, AtMin: 0.002 * b, beam: r };
}
