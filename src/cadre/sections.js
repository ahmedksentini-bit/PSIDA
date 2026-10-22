/**
 * Justification des sections d'un cadre, par mètre linéaire (portage de BVTrace BaelSection.cs, BaelBarSelection.cs,
 * Eurocode2Section.cs). Moments en t·m/ml, efforts en t/ml (1 t = 10 kN, soit 1 t·m/ml = 0,01 MN·m/ml), aciers en cm²/ml.
 *  - BAEL 91 : ELS (σs admissible), flexion composée (moment rapporté aux aciers tendus, soulagement N/σs), ELU
 *    (μ_bu ≤ 0,372), non-fragilité 0,23 d ftj/fe, effort tranchant sans armatures 0,07 fc28/γb (A.5.2,2).
 *  - EN 1992-1-1 : ELU (αcc = 1), minimum §9.2.1.1, V_Rd,c §6.2.2, ouverture de fissure §7.3.4.
 */
const fr = (x, d = 2) => (isFinite(x) ? x.toFixed(d).replace('.', ',') : String(x));

// ── BAEL ─────────────────────────────────────────────────────────────────────────────────────────
export const GAMMA_B = 1.5, GAMMA_S = 1.15, MU_LIMITE = 0.372;
export const ftj = fc28 => 0.6 + 0.06 * fc28;
export const limiteTau = (fc28, gb = GAMMA_B) => 0.07 * fc28 / gb;

export function tranchantBael(vu, d, fc28, gb = GAMMA_B) {
  if (!(d > 0)) throw new RangeError('hauteur utile nulle');
  const tau = Math.abs(vu) / 100 / d, lim = limiteTau(fc28, gb), ok = tau <= lim;
  return { tau, lim, ok, ratio: lim > 0 ? tau / lim : Infinity,
    message: ok ? `τu = ${fr(tau, 3)} MPa ≤ ${fr(lim, 3)} MPa — aucune armature d'effort tranchant (BAEL A.5.2,2, dalle sans reprise de bétonnage).`
      : `τu = ${fr(tau, 3)} MPa > ${fr(lim, 3)} MPa (dépassement de ${fr((tau / lim - 1) * 100, 1)} %) — la condition de l'article A.5.2,2 n'est PAS remplie : armatures d'effort tranchant nécessaires, ou épaisseur à augmenter.` };
}

export function minimumBael(d, fc28, fe) { if (!(d > 0) || !(fe > 0)) return 0; return 0.23 * d * ftj(fc28) / fe * 1e4; }

export function alphaEls(mu, sigmaS) {
  if (!(sigmaS > 0)) throw new RangeError('σs nul');
  if (mu <= 0) return 0;
  const k = 90 * mu / sigmaS, a1 = Math.sqrt(k * 0.2), a2 = Math.sqrt(k * (1 - a1) / (3 - a1));
  return Math.sqrt(k * (1 - a2) / (3 - a2));
}

/** ELS, flexion simple. */
export function elsBael(M, d, sigmaS, fc28, fe) {
  if (!(d > 0)) throw new RangeError('hauteur utile nulle');
  const m = Math.abs(M), mu = m / (d * d) / 100, alpha = alphaEls(mu, sigmaS);
  const asCalc = m / 100 / d / (1 - alpha / 3) / sigmaS * 1e4, asMin = minimumBael(d, fc28, fe), minG = asMin > asCalc, as = Math.max(asCalc, asMin);
  return { as, alpha, minG, detail: minG ? `As = ${fr(as)} cm²/ml — condition de non-fragilité (calcul ${fr(asCalc)} cm²/ml)` : `As = ${fr(as)} cm²/ml — α = ${fr(alpha, 3)}, minimum ${fr(asMin)} cm²/ml non déterminant` };
}

/** ELS, flexion composée (N > 0 en compression). */
export function elsComposeeBael(M, N, e, d, sigmaS, fc28, fe) {
  if (!(d > 0)) throw new RangeError('hauteur utile nulle');
  const m = Math.abs(M), ma = m + N * (d - e / 2), fl = elsBael(Math.max(ma, 0), d, sigmaS, fc28, fe);
  const soul = N * 0.01 / sigmaS * 1e4, asCalc = fl.as - soul, asMin = minimumBael(d, fc28, fe), minG = asMin > asCalc, as = Math.max(asCalc, asMin);
  return { as, alpha: fl.alpha, minG, detail: `As = ${fr(as)} cm²/ml — flexion composée : M = ${fr(m)} t·m/ml et N = ${fr(N)} t/ml (compression), M_A = ${fr(ma)} t·m/ml, soulagement ${fr(soul)} cm²/ml${minG ? ', non-fragilité déterminante' : ''}` };
}

/** ELU, flexion simple. */
export function eluBael(M, d, fc28, fe, gb = GAMMA_B, gs = GAMMA_S, theta = 1) {
  if (!(d > 0)) throw new RangeError('hauteur utile nulle');
  const fbu = 0.85 * fc28 / (theta * gb), fsu = fe / gs, mu = Math.abs(M) * 0.01, muBu = mu / (d * d * fbu);
  if (muBu <= 0) return { as: 0, mu: 0, alpha: 0, z: d, surarme: false, detail: 'Moment nul à l\'ELU.' };
  if (muBu > MU_LIMITE) return { as: NaN, mu: muBu, alpha: NaN, z: NaN, surarme: true, detail: `μ_bu = ${fr(muBu, 3)} > ${fr(MU_LIMITE, 3)} : section surarmée à l'ELU — des aciers comprimés seraient nécessaires. Augmenter l'épaisseur ou la résistance du béton.` };
  const alpha = 1.25 * (1 - Math.sqrt(1 - 2 * muBu)), z = d * (1 - 0.4 * alpha), as = mu / (z * fsu) * 1e4;
  return { as, mu: muBu, alpha, z, surarme: false, detail: `As = ${fr(as)} cm²/ml — μ_bu = ${fr(muBu, 3)}, α = ${fr(alpha, 3)}, z = ${fr(z, 3)} m` };
}

// ── Choix des barres ───────────────────────────────────────────────────────────────────────────────
const opt = (des, e, d) => ({ des, e, d, get aire() { return 100 / e / d.length * d.reduce((s, x) => s + Math.PI * (x / 2) ** 2, 0) / 100; }, get label() { return `${des} e = ${String(e).replace('.', ',')} cm`; }, get phiMax() { return Math.max(...d) / 1000; } });
export const CATALOGUE = [
  opt('HA10', 20, [10]), opt('HA12', 20, [12]), opt('HA14', 20, [14]), opt('HA16', 20, [16]), opt('HA16+HA20 alternés', 20, [16, 20]),
  opt('HA20', 20, [20]), opt('HA16', 10, [16]), opt('HA25', 20, [25]), opt('HA16+HA20 alternés', 10, [16, 20]), opt('HA20', 10, [20]),
  opt('HA16+HA25 alternés', 10, [16, 25]), opt('HA32', 20, [32]),
];
export function choixBarres(req, cat = CATALOGUE) {
  if (!cat.length) return { option: null, req, fournie: 0, ok: false, message: 'Catalogue de barres vide.' };
  if (Number.isNaN(req) || req < 0) return { option: null, req, fournie: 0, ok: false, message: 'Section d\'acier requise non déterminée : aucune disposition ne peut être choisie.' };
  const best = cat.find(o => o.aire >= req);
  if (!best) { const mx = cat[cat.length - 1]; return { option: null, req, fournie: 0, ok: false, message: `Aucune disposition du catalogue ne fournit ${fr(req)} cm²/ml : la plus forte (${mx.label}) en fournit ${fr(mx.aire)}, soit ${fr(req - mx.aire)} cm²/ml de moins. Épaissir la pièce, ou compléter le catalogue.` }; }
  return { option: best, req, fournie: best.aire, ok: true, message: `${best.label} — ${fr(best.aire)} cm²/ml pour ${fr(req)} requis (+${fr((best.aire / req - 1) * 100, 1)} %)` };
}

// ── Eurocode 2 ──────────────────────────────────────────────────────────────────────────────────
export const EXPOSITION = { XC1: 0.40, 'XC2-XC4': 0.30, 'XD-XS': 0.20 };
export const fctm = fck => fck <= 50 ? 0.30 * fck ** (2 / 3) : 2.12 * Math.log(1 + (fck + 8) / 10);
export const ecm = fck => 22000 * ((fck + 8) / 10) ** 0.3;
export function minimumEc2(d, fck, fyk) { if (!(d > 0) || !(fyk > 0)) return 0; return Math.max(0.26 * fctm(fck) / fyk * d, 0.0013 * d) * 1e4; }
export const limiteAcierEc2 = fyk => 0.8 * fyk;

export function eluEc2(M, d, fck, fyk, gc = 1.5, gs = 1.15) {
  if (!(d > 0)) throw new RangeError('hauteur utile nulle');
  const fcd = fck / gc, fyd = fyk / gs, m = Math.abs(M) * 0.01, mu = m / (d * d * fcd);
  if (mu <= 0) return { as: 0, mu: 0, alpha: 0, z: d, surarme: false, detail: 'Moment nul à l\'ELU.' };
  if (mu > MU_LIMITE) return { as: NaN, mu, alpha: NaN, z: NaN, surarme: true, detail: `μ = ${fr(mu, 3)} > ${fr(MU_LIMITE, 3)} : la section réclame des aciers comprimés (ξ dépasserait ξ_lim = 0,617). Augmenter l'épaisseur ou la classe du béton.` };
  const xi = 1.25 * (1 - Math.sqrt(1 - 2 * mu)), z = d * (1 - 0.4 * xi), as = m / (z * fyd) * 1e4;
  return { as, mu, alpha: xi, z, surarme: false, detail: `As = ${fr(as)} cm²/ml — μ = ${fr(mu, 3)}, ξ = x/d = ${fr(xi, 3)}, z = ${fr(z, 3)} m, f_cd = ${fr(fcd)} MPa, f_yd = ${fr(fyd, 1)} MPa` };
}

export function tranchantEc2(vEd, d, fck, asl, gc = 1.5) {
  if (!(d > 0)) throw new RangeError('hauteur utile nulle');
  const k = Math.min(1 + Math.sqrt(200 / (d * 1000)), 2), rho = Math.min(Math.max(asl, 0) / 1e4 / d, 0.02);
  const vrdc = 0.18 / gc * k * (100 * rho * fck) ** (1 / 3), vmin = 0.035 * k ** 1.5 * Math.sqrt(fck), ret = Math.max(vrdc, vmin);
  const vRd = ret * d * 100, ved = Math.abs(vEd), ok = ved <= vRd;
  return { ved, vRd, vMin: vmin * d * 100, ok, message: ok
    ? `V_Ed = ${fr(ved)} ≤ V_Rd,c = ${fr(vRd)} t/ml — aucune armature d'effort tranchant (EN 1992-1-1 §6.2.2 ; k = ${fr(k, 3)}, ρ_l = ${fr(rho * 100, 3)} %${ret <= vmin + 1e-12 ? ', minorant v_min déterminant' : ''}).`
    : `V_Ed = ${fr(ved)} > V_Rd,c = ${fr(vRd)} t/ml (dépassement de ${fr((ved / vRd - 1) * 100, 1)} %) — EN 1992-1-1 §6.2.2 non satisfait (k = ${fr(k, 3)}, ρ_l = ${fr(rho * 100, 3)} %) : armatures d'effort tranchant nécessaires, ou épaisseur à augmenter.` };
}

export function fissureEc2(M, e, d, as, phi, c, fck, exposition = 'XC2-XC4') {
  const wmax = EXPOSITION[exposition] ?? 0.30, A = Math.max(as, 1e-6) / 1e4, m = Math.abs(M) * 0.01;
  if (!(d > 0) || !(e > d) || m <= 0) return { wk: 0, wmax, sigma: 0, sr: 0, ok: true, detail: 'Moment de service nul ou géométrie incomplète : fissuration non calculée.' };
  const aE = 200000 / ecm(fck), b = aE * A, cc = -aE * A * d, x = (-b + Math.sqrt(b * b - 2 * cc)) / 1;
  const z = d - x / 3, sigma = m / (z * A);
  const hcef = Math.min(2.5 * (e - d), Math.min((e - x) / 3, e / 2)), rho = A / Math.max(hcef, 1e-6), fct = fctm(fck);
  const eps = Math.max((sigma - 0.4 * fct * (1 + aE * rho) / rho) / 200000, 0.6 * sigma / 200000);
  const sr = (3.4 * c + 0.8 * 0.5 * 0.425 * phi / rho) * 1000, wk = sr * eps, ok = wk <= wmax + 1e-9;
  let detail = `w_k = ${wk.toFixed(3).replace('.', ',')} mm ${ok ? '≤' : '>'} w_max = ${fr(wmax)} mm — σ_s = ${fr(sigma, 1)} MPa, s_r,max = ${fr(sr, 1)} mm, ρ_p,eff = ${fr(rho * 100)} %, φ = ${fr(phi * 1000, 1)} mm`;
  if (!ok) detail += '. Resserrer les barres ou augmenter la section : l\'ouverture dépend du diamètre et de l\'espacement, pas seulement de la contrainte.';
  return { wk, wmax, sigma, sr, ok, detail };
}
