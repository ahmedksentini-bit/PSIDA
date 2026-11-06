/**
 * Flèche à long terme d'une dalle en béton armé (PSI-DA) et contre-flèche de réglage du coffrage — EN 1992-1-1 § 7.4.3.
 *
 * Moments quasi permanents : moments permanents du calcul (st.perm.M, poids propre et superstructures ; trafic ψ₂ = 0).
 * Section rectangulaire de largeur 2b et d'épaisseur h (chanfreins négligés), aciers fournis du plan de ferraillage
 * (st.rebar.check : provBot / provTop par mètre), module effectif E_c,eff = E_cm / (1 + φ) (φ : coefficient de fluage du
 * formulaire, 2 par défaut), α_e = E_s / E_c,eff.
 * Courbure κ = ζ κ_II + (1 − ζ) κ_I avec ζ = 1 − β (M_cr / M)² (β = 0,5, charges de longue durée ; ζ = 0 si M < M_cr),
 * M_cr = f_ctm W_I ; la flèche s'obtient par double intégration de κ dans chaque travée, nulle sur les appuis (les moments
 * étant ceux de l'analyse élastique, la continuité des rotations n'est pas imposée à nouveau). Retrait non pris en compte
 * (courbure de retrait § 7.4.3(6) : majoration à apprécier ; le guide Sétra des ponts-dalles la néglige pour le réglage).
 * Contre-flèche = − w (positive vers le haut), à ajouter aux cotes de nivellement du coffrage.
 */
import { materialsEC2, crackedSection } from './section_ec2.js';

export function flecheLongTermeBA(st, { beta = 0.5 } = {}) {
  const bm = st.deck && st.deck.beam, M = st.perm && st.perm.M, rc = st.rebar && st.rebar.check;
  if (!bm || !M || !rc || rc.length !== bm.sections.length) return null;
  const m = st.p.mat, phi = Number.isFinite(st.p.phiFluage) && st.p.phiFluage > 0 ? st.p.phiFluage : 2;
  const W = 2 * st.deck.b, h = st.deck.h, mat = materialsEC2({ fck: m.fck, fyk: m.fyk }), Eeff = mat.Ecm / (1 + phi);
  const matF = { ...mat, alphaE: 200000 / Eeff };
  const II = W * h ** 3 / 12, Mcr = mat.fctm * 1000 * W * h ** 2 / 6;          // kN·m (f_ctm en MPa)
  const phiL = m.phi || 0.02, d = h - m.c - phiL / 2, dp = m.c + (m.phiT || 0.016) / 2;
  const sec = bm.sections.map((s, k) => {
    const Mk = M[k], q = rc[k], sag = Mk >= 0, Mabs = Math.abs(Mk);
    const As = (sag ? q.provBot : q.provTop) * W, As2 = (sag ? q.provTop : q.provBot) * W;
    const kI = Mk / (Eeff * 1000 * II);                                        // 1/m (E en kPa)
    let kII = kI, zeta = 0;
    if (Mabs > Mcr) {
      const cs = crackedSection(Mabs / 1000, { b: W, d, As, As2, dp }, matF);
      kII = Math.sign(Mk) * Mabs / (Eeff * 1000 * cs.I);
      zeta = 1 - beta * (Mcr / Mabs) ** 2;
    }
    return { x: s.x, span: s.span, M: Mk, zeta, kappa: zeta * kII + (1 - zeta) * kI, kI };
  });
  // double intégration par travée (trapèzes), w = 0 aux appuis ; w > 0 vers le bas sous moment positif
  const w = new Array(sec.length).fill(0), wI = new Array(sec.length).fill(0);
  const travees = [...new Set(sec.map(s => s.span))];
  for (const j of travees) {
    const idx = sec.map((s, k) => (s.span === j ? k : -1)).filter(k => k >= 0);
    for (const [key, out] of [['kappa', w], ['kI', wI]]) {
      const xs = idx.map(k => sec[k].x), ks = idx.map(k => sec[k][key]);
      const th = [0], y = [0];
      for (let i = 1; i < xs.length; i++) { const dx = xs[i] - xs[i - 1]; th.push(th[i - 1] + (ks[i] + ks[i - 1]) / 2 * dx); y.push(y[i - 1] + (th[i] + th[i - 1]) / 2 * dx); }
      const L = xs.at(-1) - xs[0] || 1, yL = y.at(-1);
      idx.forEach((k, i) => { out[k] = -(y[i] - yL * (xs[i] - xs[0]) / L); });
    }
  }
  const iMax = w.reduce((b, v, k) => (v > w[b] ? k : b), 0);
  return { xs: sec.map(s => s.x), w, wNonFissure: wI, sections: sec, phi, Eeff, Mcr, beta, wMax: w[iMax], xMax: sec[iMax].x };
}

/** Flèche interpolée à l'abscisse u (m). */
export function flecheEn(F, u) {
  const { xs, w } = F; let i = 0;
  while (i < xs.length - 2 && xs[i + 1] < u) i++;
  const t = Math.min(1, Math.max(0, (u - xs[i]) / ((xs[i + 1] - xs[i]) || 1)));
  return w[i] + (w[i + 1] - w[i]) * t;
}
