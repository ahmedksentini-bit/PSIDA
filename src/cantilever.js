/**
 * Encorbellements latéraux : flexion d'encastrement par mètre (dalle en console d'épaisseur variable, EN 1991-2).
 *
 * Hypothèses (prédimensionnement) :
 *  - console de portée Lc (nu de la nervure → extrémité), épaisseur linéaire de hr (encastrement) à ht (extrémité) ;
 *  - charges réparties : poids propre, superstructures (lignes à la distance e du nu, bandes q sur [x1, x2]),
 *    trottoir q_fk (EN 1991-2 § 5.3.2.1 : 5 kN/m² seul, 3 kN/m² avec LM1) ;
 *  - roues du tandem TS (lane 1) et essieu LM2 si la chaussée empiète sur l'encorbellement : diffusion à 45° à travers le
 *    revêtement jusqu'au feuillet moyen (b₀ = a + 2 t_rev + h_m), puis en plan jusqu'à l'encastrement (b_eff = b₀ + 2x) ;
 *    les deux essieux du tandem (1,20 m) se recouvrent : b_eff = b₀ + 1,20 + 2x ;
 *  - CHAMOA (§ 4.2) calcule l'encorbellement comme une dalle encastrée d'inertie variable, découplée de la flexion
 *    longitudinale ; le guide SETRA 1989 renvoie à l'annexe 3 du guide PSIDP.EL.
 * Unités : m, kN, kN·m/m.
 */
import { materialsEC2, flexureULS, flexureSLS, asForCrackWidth, minimumSteel } from './section_ec2.js';

/**
 * @param {object} p
 * @param {number} p.Lc portée de l'encorbellement [m] ; @param {number} p.hr épaisseur à l'encastrement ; @param {number} p.ht à l'extrémité
 * @param {{g:number, e:number}[]} [p.lines] charges linéiques [kN/m] à e du nu ; @param {{q:number, x1:number, x2:number}[]} [p.bands] bandes permanentes [kN/m²]
 * @param {{x1:number, x2:number}} [p.footway] trottoir sur l'encorbellement (distances au nu)
 * @param {number} [p.roadOverlap=0] largeur de chaussée située sur l'encorbellement (depuis le nu) ; @param {number} [p.tRev=0.08]
 * @param {number} [p.alphaQ1=1] ; @param {number} [p.alphaq1=1] ; @param {number} [p.betaQ=1] ; @param {number} [p.gammaC=25]
 */
export function cantileverMoments(p) {
  const { Lc, hr, ht, tRev = 0.08, alphaQ1 = 1, alphaq1 = 1, betaQ = 1, gammaC = 25, roadOverlap = 0 } = p;
  const hAt = x => hr + (ht - hr) * x / Lc; // x depuis le nu
  // poids propre : ∫₀ᴸ γ h(x) x dx
  const mG = gammaC * (hr * Lc * Lc / 2 + (ht - hr) * Lc * Lc / 3);
  const vG = gammaC * (hr + ht) / 2 * Lc;
  let mSup = 0, vSup = 0;
  for (const l of p.lines || []) { mSup += l.g * l.e; vSup += l.g; }
  for (const b of p.bands || []) { mSup += b.q * (b.x2 * b.x2 - b.x1 * b.x1) / 2; vSup += b.q * (b.x2 - b.x1); }
  // trottoir
  const fw = p.footway;
  const mFw = fw ? (fw.x2 * fw.x2 - fw.x1 * fw.x1) / 2 : 0; // par kN/m²
  const footway = { seul: 5 * mFw, avecLM1: 3 * mFw, V: fw ? 5 * (fw.x2 - fw.x1) : 0 };
  // roues
  let ts = null, lm2 = null, udl = null;
  if (roadOverlap > 0.3) {
    const xQ = Math.max(0.3, roadOverlap - 0.5); // roue à 0,50 m du bord de chaussée (bordure) au plus
    const hm = hAt(xQ / 2);
    const Q = alphaQ1 * 150, b0 = 0.4 + 2 * tRev + hm, beff = b0 + 1.2 + 2 * xQ;
    ts = { Q, xQ, b0, beff, m: 2 * Q * xQ / beff, V: 2 * Q / beff };
    const Q2 = betaQ * 200, b02 = 0.6 + 2 * tRev + hm, beff2 = b02 + 2 * xQ;
    lm2 = { Q: Q2, xQ, b0: b02, beff: beff2, m: Q2 * xQ / beff2, V: Q2 / beff2 };
    const q = alphaq1 * 9;
    udl = { q, m: q * roadOverlap * roadOverlap / 2, V: q * roadOverlap };
  }
  const G = { m: mG + mSup, V: vG + vSup, mG, mSup };
  // combinaisons (EN 1990 A2) : ELU 1,35 G + 1,35 Q ; ELS car. G + Q ; ELS fréq. G + ψ1 Q (TS 0,75, UDL 0,4, trottoir 0,4 ; LM2 0,75)
  const q1a = (ts ? ts.m + udl.m : 0) + footway.avecLM1, q1b = lm2 ? lm2.m : 0, q3 = footway.seul;
  const Qcar = Math.max(q1a, q1b, q3), Qfre = Math.max(ts ? 0.75 * ts.m + 0.4 * udl.m + 0.4 * footway.avecLM1 : 0.4 * footway.avecLM1, lm2 ? 0.75 * lm2.m : 0, 0.4 * q3);
  const Vq = Math.max((ts ? ts.V + udl.V : 0) + (fw ? 3 * (fw.x2 - fw.x1) : 0), lm2 ? lm2.V : 0, footway.V);
  return { Lc, hr, ht, G, footway, ts, lm2, udl, ELU: 1.35 * G.m + 1.35 * Qcar, CAR: G.m + Qcar, FREQ: G.m + Qfre, QP: G.m, VELU: 1.35 * (G.V + Vq), governing: q1a >= q1b && q1a >= q3 ? 'gr1a (TS + UDL + trottoir 3 kN/m²)' : q1b >= q3 ? 'gr1b (LM2)' : 'gr3 (trottoir 5 kN/m²)' };
}

/** Aciers supérieurs d'encastrement par mètre (EC2 : ELU, σs ≤ 300 MPa à l'ELS car., wk à l'ELS fréquent, minimums). */
export function cantileverDesign(mom, { fck = 35, fyk = 500, c = 0.04, phi = 0.016, wkMax = 0.3, kSlab = 1.2 } = {}) {
  const mat = materialsEC2({ fck, fyk });
  const h = mom.hr, d = h - c, sec = { b: 1, h, d };
  const k = 1e-3;
  const uls = flexureULS(mom.ELU * k, sec, mat), sls = flexureSLS(mom.CAR * k, sec, mat), wk = asForCrackWidth(mom.FREQ * k, sec, mat, { wkMax, phi, c });
  const mins = minimumSteel(sec, mat, { kSlab });
  const As = Math.max(uls.As, sls.As, wk, mins.as921, mins.perFace);
  return { mat, d, AsULS: uls.As, AsSLS: sls.As, AsWk: wk, as921: mins.as921, perFace: mins.perFace, As, sigS: sls.sigS, sigC: sls.sigC, xOverD: uls.xOverD };
}
