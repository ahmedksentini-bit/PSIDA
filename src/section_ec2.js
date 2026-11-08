/**
 * Sections en béton armé par mètre de largeur — EN 1992-1-1 / EN 1992-2 (+ annexe nationale française
 * sur quelques points signalés). Flexion simple de section rectangulaire b = 1 m, hauteur h.
 *
 * Unités : m, MN, MPa. Les moments sont en MN·m/m, les aciers en m²/m (×1e4 → cm²/m).
 *
 * Conventions reprises de CHAMOA : hauteur utile d = h − c (enrobage à l'axe des aciers) ; fatigue des
 * armatures vérifiée de façon simplifiée par σs ≤ 300 MPa sous combinaison caractéristique
 * (CHAMOA : « traction max dans les aciers BA aux ELS caractéristiques (fatigue) : 300 MPa »).
 */

/** Caractéristiques des matériaux (EN 1992-1-1 tableau 3.1, §3.1.6, §3.2.7). */
export function materialsEC2({ fck = 35, fyk = 500, gammaC = 1.5, gammaS = 1.15, alphaCC = 1.0, Es = 200000, alphaE = 15, kcc = 0.6, fsFat = 300 } = {}) {
  const fcm = fck + 8;
  const fctm = fck <= 50 ? 0.30 * Math.pow(fck, 2 / 3) : 2.12 * Math.log(1 + fcm / 10);
  const Ecm = 22000 * Math.pow(fcm / 10, 0.3);
  return {
    fck, fyk, gammaC, gammaS, alphaCC, Es, fcm, fctm, Ecm,
    fcd: alphaCC * fck / gammaC, fyd: fyk / gammaS,
    lambda: fck <= 50 ? 0.8 : 0.8 - (fck - 50) / 400, eta: fck <= 50 ? 1 : 1 - (fck - 50) / 200,
    alphaE,                // coefficient d'équivalence ELS (15 : long terme, pratique française)
    sigCcar: kcc * fck,    // compression béton ELS caractéristique (EC2 7.2(2), k1 = 0,6)
    sigCqp: 0.45 * fck,    // ELS quasi-permanent (k2 = 0,45)
    sigSlim: Math.min(0.8 * fyk, fsFat), // acier : 0,8 fyk (7.2(5), k3 = 0,8) et fatigue simplifiée 300 MPa
    xdLim: fck <= 50 ? 0.45 : 0.35, // limite de ductilité x/d (EC2 5.5(4) sans redistribution, pratique)
  };
}

/** Intégrales ∫₀ˣ w(ζ)·(x−ζ)ᵏ dζ (k = 0, 1, 2) par Simpson — w(ζ) largeur à la distance ζ de la fibre la plus comprimée. */
function widthMoments(w, x, n = 40) {
  if (x <= 0) return [0, 0, 0];
  const h = x / n, out = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const z = i * h, c = i === 0 || i === n ? 1 : i % 2 ? 4 : 2, wz = w(z);
    out[0] += c * wz; out[1] += c * wz * (x - z); out[2] += c * wz * (x - z) * (x - z);
  }
  return out.map(v => v * h / 3);
}

/**
 * Flexion ELU, section b × h (largeur de la zone comprimée variable via `widthFn(ζ)`, ζ depuis la fibre
 * la plus comprimée — chanfreins), aciers tendus (et comprimés si nécessaire).
 * @param {number} M moment de calcul [MN·m] (valeur absolue)
 * @returns {{As:number, As2:number, xi:number, z:number, mu:number, xOverD:number}} aciers en m²
 */
export function flexureULS(M, { b = 1, d, dp = 0.05, widthFn = null }, mat) {
  const { fcd, fyd, lambda, eta, xdLim } = mat;
  if (M <= 0) return { As: 0, As2: 0, xi: 0, z: d, mu: 0, xOverD: 0 };
  if (widthFn) {
    // bloc rectangulaire de hauteur λx sur largeur variable : C(x) = η fcd ∫ w dζ, bras = d − ζ_c
    const resist = x => { const [A0, A1] = widthMoments(widthFn, lambda * x); const C = eta * fcd * A0; const zc = A0 > 0 ? lambda * x - A1 / A0 : 0; return { C, z: d - zc }; };
    let lo = 1e-6, hi = xdLim * d;
    const Mlim = (() => { const r = resist(hi); return r.C * r.z; })();
    if (M <= Mlim) {
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; const r = resist(mid); if (r.C * r.z >= M) hi = mid; else lo = mid; }
      const r = resist(hi);
      return { As: r.C / fyd, As2: 0, xi: lambda * hi / d, z: r.z, mu: M / (b * d * d * eta * fcd), xOverD: hi / d };
    }
    const r = resist(hi);
    const As2 = (M - Mlim) / ((d - dp) * fyd);
    return { As: r.C / fyd + As2, As2, xi: lambda * xdLim, z: r.z, mu: M / (b * d * d * eta * fcd), xOverD: xdLim };
  }
  const mu = M / (b * d * d * eta * fcd);
  const xiLim = lambda * xdLim, muLim = xiLim * (1 - xiLim / 2);
  if (mu <= muLim) {
    const xi = 1 - Math.sqrt(Math.max(0, 1 - 2 * mu));
    const z = d * (1 - xi / 2);
    return { As: M / (z * fyd), As2: 0, xi, z, mu, xOverD: xi / lambda };
  }
  // aciers comprimés
  const zLim = d * (1 - xiLim / 2), Mlim = muLim * b * d * d * eta * fcd;
  const As2 = (M - Mlim) / ((d - dp) * fyd);
  return { As: Mlim / (zLim * fyd) + As2, As2, xi: xiLim, z: zLim, mu, xOverD: xdLim };
}

/**
 * Section fissurée élastique (b, d, As, As2, αe) : position de l'axe neutre, inertie, contraintes sous M.
 */
export function crackedSection(M, { b = 1, d, As, As2 = 0, dp = 0.05, widthFn = null }, mat) {
  const n = mat.alphaE;
  if (widthFn) {
    // équilibre des moments statiques : ∫ w(ζ)(x−ζ)dζ + n As2 (x−d') = n As (d−x)
    let lo = 1e-6, hi = d;
    const f = x => widthMoments(widthFn, x)[1] + n * As2 * (x - dp) - n * As * (d - x);
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; }
    const x = hi;
    const I = widthMoments(widthFn, x)[2] + n * As * (d - x) * (d - x) + n * As2 * (x - dp) * (x - dp);
    return { x, I, sigC: M * x / I, sigS: n * M * (d - x) / I, sigS2: n * M * (x - dp) / I };
  }
  // b x²/2 + n As2 (x − d') − n As (d − x) = 0
  const A = b / 2, B = n * (As + As2), C = -n * (As * d + As2 * dp);
  const x = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  const I = b * x * x * x / 3 + n * As * (d - x) * (d - x) + n * As2 * (x - dp) * (x - dp);
  return { x, I, sigC: M * x / I, sigS: n * M * (d - x) / I, sigS2: n * M * (x - dp) / I };
}

/**
 * Moment limite du béton à l'ELS (méthode classique des sections rectangulaires, étendue à une largeur variable) :
 * les deux contraintes limites sont atteintes ensemble, axe neutre y₁ = α₁ d avec α₁ = n σ̄c / (n σ̄c + σ̄s).
 * Béton comprimé : σ(ζ) = σ̄c (y₁ − ζ)/y₁ sur la largeur w(ζ) (b si la section est rectangulaire).
 * @returns {{y1:number, Fc:number, Mrb:number, Arb:number}} résultante du béton Fc [MN/m], moment par rapport aux
 *   aciers tendus Mrb [MN·m/m] et aciers tendus correspondants Arb = Fc/σ̄s [m²/m]
 */
export function momentLimiteELS({ b = 1, d, widthFn = null }, { n, sigC, sigS }) {
  const y1 = n * sigC / (n * sigC + sigS) * d;
  let S1, S2; // ∫ w (y₁ − ζ) dζ et ∫ w (y₁ − ζ)² dζ
  if (widthFn) { const m = widthMoments(widthFn, y1); S1 = m[1]; S2 = m[2]; } else { S1 = b * y1 * y1 / 2; S2 = b * y1 * y1 * y1 / 3; }
  const Fc = sigC / y1 * S1, Mrb = sigC / y1 * ((d - y1) * S1 + S2);
  return { y1, Fc, Mrb, Arb: Fc / sigS };
}

/**
 * Aciers d'une section fléchie à l'ELS sous σs ≤ σ̄s et σc ≤ σ̄c (contraintes calculées en section fissurée, n = α_e).
 * - M ≤ M_rb (moment limite du béton) : aciers tendus seuls, A tel que σs = σ̄s (le béton reste sous σ̄c) ;
 * - M > M_rb : aciers comprimés. L'axe neutre reste à y₁ ; A' = (M − M_rb) / (σ'sc (d − d')) avec
 *   σ'sc = n σ̄c (y₁ − d')/y₁, et A = A_rb + A' σ'sc / σ̄s.
 * A et A' sont continus et croissants en M (méthode du moment limite, BAEL 91 A.4.5,2 et EN 1992-1-1 § 7.2).
 * Taux total A + A' > 4 % de la section (EN 1992-1-1 § 9.2.1.1(3)) : drapeau `rhoMaxDepasse`.
 */
export function flexureSLS(M, { b = 1, d, h = null, dp = 0.05, widthFn = null }, mat, { sigSlim = mat.sigSlim, sigClim = mat.sigCcar } = {}) {
  if (M <= 0) return { As: 0, As2: 0, sigC: 0, sigS: 0, x: 0 };
  const lim = momentLimiteELS({ b, d, widthFn }, { n: mat.alphaE, sigC: sigClim, sigS: sigSlim });
  const taux = (As, As2) => { const Ac = h ? b * h : b * d; return { rho: (As + As2) / Ac, rhoMaxDepasse: (As + As2) > 0.04 * Ac }; };
  if (M <= lim.Mrb) {
    // aciers tendus seuls : σs(As) décroît avec As → bissection sur σs = σ̄s (le béton est alors sous σ̄c)
    let lo = 1e-9, hi = Math.max(lim.Arb, 1e-6);
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (crackedSection(M, { b, d, As: mid, dp, widthFn }, mat).sigS <= sigSlim) hi = mid; else lo = mid; }
    return { As: hi, As2: 0, Mrb: lim.Mrb, y1: lim.y1, ...taux(hi, 0), ...crackedSection(M, { b, d, As: hi, dp, widthFn }, mat) };
  }
  const sigSc = mat.alphaE * sigClim * (lim.y1 - dp) / lim.y1;
  if (!(sigSc > 0) || dp >= d) {
    // aciers comprimés au-dessus de l'axe neutre limite impossibles (section trop mince) : solution par défaut
    // (bras de levier d − d', σ'sc = σ̄s) signalée par le drapeau
    const As2 = (M - lim.Mrb) / (sigSlim * Math.max(d - dp, 1e-3)), As = lim.Arb + As2;
    return { As, As2, Mrb: lim.Mrb, y1: lim.y1, comprimesInefficaces: true, ...taux(As, As2), ...crackedSection(M, { b, d, As, As2, dp, widthFn }, mat) };
  }
  const As2 = (M - lim.Mrb) / (sigSc * (d - dp)), As = lim.Arb + As2 * sigSc / sigSlim;
  return { As, As2, Mrb: lim.Mrb, y1: lim.y1, sigSc, ...taux(As, As2), ...crackedSection(M, { b, d, As, As2, dp, widthFn }, mat) };
}

/**
 * Largeur relative de la zone comprimée pour une dalle à chanfreins symétriques (CHAMOA : « hauteur au
 * bord » hb et « largeur de la joue » j) : en compression par l'intrados (moments sur appuis), la largeur
 * passe de (2b − 2j)/2b au parement à 1 au-dessus de la hauteur de chanfrein h − hb.
 */
export function chamferWidthFn({ width, h, hEdge, joue }) {
  const beta = (width - 2 * joue) / width, tc = h - hEdge;
  return zeta => (tc <= 0 ? 1 : beta + (1 - beta) * Math.min(1, zeta / tc));
}

/**
 * Ouverture de fissure wk (EN 1992-1-1 §7.3.4) pour une section b×h, aciers As de diamètre φ, sous M.
 * k3 selon l'annexe nationale française : k3 = 3,4·(25/c)^(2/3) pour c > 25 mm (option `k3FR`) ; α_e = E_s/E_cm dans (7.9).
 * @returns {{wk:number, srMax:number, epsDiff:number, sigS:number, rhoEff:number}} wk en mm
 */
export function crackWidth(M, { b = 1, h, d, As, phi = 0.020, c = 0.030, widthFn = null }, mat, { kt = 0.4, k3FR = true } = {}) {
  if (M <= 0 || As <= 0) return { wk: 0, srMax: 0, epsDiff: 0, sigS: 0, rhoEff: 0 };
  const r = crackedSection(M, { b, d, As, widthFn }, mat);
  const fctEff = mat.fctm;
  const hcEf = Math.min(2.5 * (h - d), (h - r.x) / 3, h / 2);
  const rhoEff = As / (b * hcEf);
  // EN 1992-1-1 (7.9) : α_e = E_s/E_cm (et non le coefficient d'équivalence 15 des contraintes)
  const aE = mat.Ecm ? mat.Es / mat.Ecm : mat.alphaE;
  const epsDiff = Math.max((r.sigS - kt * fctEff / rhoEff * (1 + aE * rhoEff)) / mat.Es, 0.6 * r.sigS / mat.Es);
  const cmm = c * 1000;
  const k3 = k3FR && cmm > 25 ? 3.4 * Math.pow(25 / cmm, 2 / 3) : 3.4;
  const k1 = 0.8, k2 = 0.5, k4 = 0.425;
  const spacing = As > 0 ? (Math.PI * phi * phi / 4) / As : Infinity; // espacement des barres [m] pour 1 m
  let srMax;
  if (spacing <= 5 * (c + phi / 2)) srMax = k3 * c + k1 * k2 * k4 * phi / rhoEff;
  else srMax = 1.3 * (h - r.x);
  return { wk: srMax * epsDiff * 1000, srMax, epsDiff, sigS: r.sigS, rhoEff, x: r.x };
}

/** Aciers nécessaires pour wk ≤ wkMax sous M (fréquent), par bissection. */
export function asForCrackWidth(M, sec, mat, { wkMax = 0.3, phi = 0.020, c = 0.030 } = {}) {
  if (M <= 0) return 0;
  let lo = 1e-6, hi = M / (0.5 * sec.d * 100) * 4;
  const ok = As => crackWidth(M, { ...sec, As, phi, c }, mat).wk <= wkMax;
  if (!ok(hi)) return hi;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return hi;
}

/** Aciers minimaux (EN 1992-1-1 §9.2.1.1 ×1,2 pour les dalles de pont selon CHAMOA, §7.3.2, et 3 cm²/m par face). */
export function minimumSteel({ b = 1, h, d }, mat, { kSlab = 1.2, perFace = 3e-4, kc = 0.4 } = {}) {
  const as921 = kSlab * Math.max(0.26 * mat.fctm / mat.fyk, 0.0013) * b * d;
  const k = h <= 0.3 ? 1.0 : h >= 0.8 ? 0.65 : 1.0 - 0.35 * (h - 0.3) / 0.5;
  const fctEff = Math.max(mat.fctm, 2.9);
  const Act = b * h / 2; // flexion simple, section rectangulaire : moitié de la section tendue au moment de la fissuration
  const as732 = kc * k * fctEff * Act / mat.fyk;
  return { as921, as732, perFace, asMin: Math.max(as921, as732, perFace) };
}

/** Résistance à l'effort tranchant sans armatures (EN 1992-1-1 §6.2.2) par mètre, VRd,c en MN. */
export function shearVRdc({ b = 1, d, As }, mat) {
  const k = Math.min(2, 1 + Math.sqrt(0.2 / d));
  const rho = Math.min(0.02, As / (b * d));
  const CRdc = 0.18 / mat.gammaC;
  const vmin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(mat.fck);
  const v = Math.max(CRdc * k * Math.pow(100 * rho * mat.fck, 1 / 3), vmin);
  return { VRdc: v * b * d, v, k, rho, vmin };
}

/**
 * Poinçonnement sous une roue (EN 1992-1-1 §6.4) : aire d'impact a×b diffusée à 45° à travers le
 * revêtement (épaisseur tRev) et jusqu'au feuillet moyen (h/2) ; contour de contrôle u1 à 2d.
 * @returns {{vEd:number, vRdc:number, u1:number, ok:boolean}} contraintes en MPa
 */
export function punching({ Q, a = 0.4, bb = 0.4, tRev = 0.08, h, d, As }, mat, { beta = 1.0 } = {}) {
  const a1 = a + 2 * tRev + h, b1 = bb + 2 * tRev + h; // diffusion 45° : revêtement + h/2 de chaque côté
  const u1 = 2 * (a1 + b1) + 4 * Math.PI * d;
  const vEd = beta * Q / (u1 * d);
  const { v } = shearVRdc({ d, As }, mat);
  return { vEd, vRdc: v, u1, a1, b1, ok: vEd <= v };
}
