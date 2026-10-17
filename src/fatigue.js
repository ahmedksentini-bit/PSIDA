/**
 * Fatigue des armatures — EN 1992-2 annexe NN (méthode des étendues de contrainte équivalentes λ_s) avec le modèle de
 * charge de fatigue FLM3 de l'EN 1991-2 § 4.6.4.
 *
 *  FLM3 : 4 essieux de 120 kN (1,20 – 6,00 – 1,20 m), 2 roues par essieu à 2,00 m, impacts 0,40 × 0,40 m, placé sur la
 *  voie lente ; annexe NN.2.1 (101) : charges d'essieu × 1,75 pour la vérification des zones d'appuis intermédiaires des
 *  ponts continus, × 1,40 ailleurs.
 *  Δσ_s,equ = λ_s · Δσ_s,Ec,  λ_s = φ_fat · λ_s,1 · λ_s,2 · λ_s,3 · λ_s,4 ;
 *  λ_s,2 = Q̄ · (N_obs / 2·10⁶)^(1/k₂), λ_s,3 = (N_années / 100)^(1/k₂), λ_s,4 = (Σ N_obs,i / N_obs,1)^(1/k₂), k₂ = 9 (barres
 *  droites, tableau 6.3N) ; Q̄ (tableau NN.1) : 1,0 trafic longue distance, 0,94 moyenne distance, 0,82 trafic local ;
 *  λ_s,1 : figure NN.1 (fonction de la portée et de la zone) — à lire sur la figure, valeur saisie.
 *  Vérification (6.8.5) : γ_F,fat · Δσ_s,equ ≤ Δσ_Rsk(N*) / γ_s,fat, Δσ_Rsk(10⁶) = 162,5 MPa (tableau 6.3N), γ_s,fat = 1,15.
 *  Δσ_s,Ec : étendue de contrainte dans les aciers calculée en section fissurée (6.8.2) sous le passage de FLM3, à partir
 *  de l'étendue de moment par mètre à la fibre dimensionnante (répartition de Guyon).
 */
import { crackedSection } from './section_ec2.js';

export const FLM3 = { axles: [{ d: 0, P: 120 }, { d: 1.2, P: 120 }, { d: 7.2, P: 120 }, { d: 8.4, P: 120 }], wheelSpacing: 2.0, contact: { a: 0.4, b: 0.4 } };
export const Q_BAR = { longue: 1.0, moyenne: 0.94, locale: 0.82 };
/** Nombre de poids lourds par an et par voie lente (EN 1991-2 tableau 4.5) selon la catégorie de trafic. */
export const N_OBS = { 1: 2.0e6, 2: 0.5e6, 3: 0.125e6, 4: 0.05e6 };

/**
 * Passage de FLM3 sur la voie lente : enveloppe des moments par mètre (voie 1 au bord de la chaussée, deux côtés).
 * @param {import('./analysis.js').SlabDeck} deck
 * @param {{factor?:number, laneWidth?:number}} opt facteur sur les essieux (1,75 appuis / 1,40 ailleurs appliqué ensuite)
 */
export function flm3Envelope(deck, { laneWidth = 3 } = {}) {
  const { y1, y2 } = deck.g.roadway;
  const arrangements = [y1 + laneWidth / 2, y2 - laneWidth / 2].map(e => [{ label: 'FLM3', kind: 'axles', axles: FLM3.axles, tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }] }]);
  return deck.evaluateArrangements(arrangements);
}

/**
 * Vérification à la fatigue des aciers longitudinaux aux sections clés.
 * @param {import('./analysis.js').SlabDeck} deck
 * @param {object} flm   résultat de flm3Envelope
 * @param {object} perm  deck.permanent()
 * @param {object} design designEC (perFibre, mat, d, h)
 * @param {{label:string, idx:number, kind:string}[]} keys
 * @param {{lambda1?:number, trafic?:'longue'|'moyenne'|'locale', categorie?:1|2|3|4, nYears?:number, nSlowLanes?:number, phiFat?:number, k2?:number, dSigRsk?:number, gammaS?:number, gammaF?:number}} opt
 */
export function fatigueCheck(deck, flm, perm, design, keys, opt = {}) {
  const { lambda1 = 1.0, trafic = 'longue', categorie = 2, nYears = 100, nSlowLanes = 1, phiFat = 1.0, k2 = 9, dSigRsk = 162.5, gammaS = 1.15, gammaF = 1.0 } = opt;
  const Nobs = N_OBS[categorie] || 0.5e6;
  const lambda2 = Q_BAR[trafic] * Math.pow(Nobs / 2e6, 1 / k2), lambda3 = Math.pow(nYears / 100, 1 / k2), lambda4 = Math.pow(nSlowLanes, 1 / k2);
  const lambdaS = phiFat * lambda1 * lambda2 * lambda3 * lambda4;
  const mat = design.mat, h = design.h, d = design.d;
  const rows = keys.map(k => {
    const s = k.idx, factor = k.kind === 'support' ? 1.75 : 1.40;
    const face = k.kind === 'support' ? 'top' : 'bot';
    // fibre dimensionnante = celle du ferraillage maximal
    const arr = design[face][s]; const iy = arr.indexOf(Math.max(...arr)); const f = design.perFibre[s][iy][face];
    const As = f.As;
    const sign = face === 'bot' ? 1 : -1;
    const mG = sign * perm.mx[s][iy], mMax = sign * (face === 'bot' ? flm.mxMax[s][iy] : flm.mxMin[s][iy]) * factor, mMin = sign * (face === 'bot' ? flm.mxMin[s][iy] : flm.mxMax[s][iy]) * factor;
    const Mhi = Math.max(mG + mMax, 0) * 1e-3, Mlo = Math.max(mG + mMin, 0) * 1e-3; // MN·m/m
    const sec = { b: 1, d, As: Math.max(As, 1e-6) };
    const sHi = Mhi > 0 ? crackedSection(Mhi, sec, mat).sigS : 0, sLo = Mlo > 0 ? crackedSection(Mlo, sec, mat).sigS : 0;
    const dSigEc = sHi - sLo, dSigEqu = lambdaS * dSigEc;
    const lim = dSigRsk / gammaS;
    return { label: k.label, kind: k.kind, face, y: deck.ys[iy], factor, As, mG, dM: mMax - mMin, Mhi: Mhi * 1e3, Mlo: Mlo * 1e3, sigHi: sHi, sigLo: sLo, dSigEc, dSigEqu, lim, ratio: gammaF * dSigEqu / lim, ok: gammaF * dSigEqu <= lim };
  });
  return { rows, lambdaS, lambda1, lambda2, lambda3, lambda4, phiFat, Nobs, trafic, categorie, nYears, k2, dSigRsk, gammaS, gammaF };
}
