/**
 * Ferraillage longitudinal par mètre, par section et par fibre, puis enveloppe sur la largeur.
 *
 *  Eurocodes : ELU flexion (bloc rectangulaire), ELS caractéristique (σc ≤ 0,6 fck, σs ≤ min(0,8 fyk ; 300 MPa)
 *              fatigue simplifiée), ELS fréquent (wk ≤ wk,max, EC2 7.3.4), minimums (9.2.1.1 ×1,2 dalle,
 *              7.3.2, 3 cm²/m par face), V_Rd,c (6.2.2), poinçonnement sous roue (6.4).
 *  BAEL / Fasc. 61 : ELU flexion, ELS fissuration préjudiciable (σ̄s, σ̄bc), non-fragilité et pourcentage
 *              minimal des dalles, τu des dalles, poinçonnement (A.5.2.42).
 *
 * Convention CHAMOA : d = h − c. Les moments par mètre m_x(y) sont ceux de la répartition transversale ;
 * l'enveloppe sur y donne le ferraillage uniforme « à la CHAMOA » (KTRANS·M/2b).
 */
import { combineEC, combineBAEL, combineBeamEC, combineBeamBAEL } from './combinations.js';
import { materialsEC2, flexureULS, flexureSLS, asForCrackWidth, minimumSteel, shearVRdc, punching, chamferWidthFn } from './section_ec2.js';
import { materialsBAEL, flexureELU, flexureELS, minimumSteelBAEL, shearBAEL, punchingBAEL } from './section_bael.js';

const kNm2MNm = 1e-3;

/**
 * @param {import('./analysis.js').SlabDeck} deck
 * @param {object} perm   deck.permanent()
 * @param {object} ec     deck.eurocode()
 * @param {object} opt    { fck, fyk, c, phi, wkMax, tRev, alphaE, fsFat, kSlab }
 */
export function designEC(deck, perm, ec, opt = {}) {
  const { c = 0.03, phi = 0.020, wkMax = 0.3, tRev = 0.08, thermal = null, settle = null } = opt;
  const mat = materialsEC2(opt);
  const h = deck.h, d = h - c, sec = { b: 1, h, d };
  // chanfreins : compression par l'intrados (moments sur appuis) sur largeur réduite
  const wTop = deck.g.chamfer ? chamferWidthFn({ width: 2 * deck.b, h, hEdge: deck.g.chamfer.hEdge, joue: deck.g.chamfer.joue }) : null;
  const secTop = { ...sec, widthFn: wTop };
  const comb = combineEC(perm, ec, { thermal, settle });
  const nS = deck.beam.sections.length;
  const mins = minimumSteel(sec, mat, { kSlab: opt.kSlab ?? 1.2 });
  const perFibre = []; // [s][iy] = { bot:{...}, top:{...} }
  const bot = [], top = [];
  for (let s = 0; s < nS; s++) {
    const rowB = [], rowT = [], fibres = [];
    for (let iy = 0; iy < deck.ys.length; iy++) {
      const face = (Mu, Mcar, Mfre, Mqp, sc = sec) => {
        const uls = flexureULS(Mu * kNm2MNm, sc, mat);
        const sls = flexureSLS(Mcar * kNm2MNm, sc, mat);
        const wk = asForCrackWidth(Mfre * kNm2MNm, sc, mat, { wkMax, phi, c });
        const as921 = Mcar > 0 ? mins.as921 : 0, as732 = Mqp > 0 ? mins.as732 : 0;
        const As = Math.max(uls.As, sls.As, wk, as921, as732, mins.perFace);
        return { Mu, Mcar, Mfre, Mqp, AsULS: uls.As, AsSLS: sls.As, AsWk: wk, as921, as732, perFace: mins.perFace, As, As2: Math.max(uls.As2, sls.As2 || 0), sigS: sls.sigS, sigC: sls.sigC, xOverD: uls.xOverD };
      };
      const b = face(Math.max(comb.ELU.max[s][iy], 0), Math.max(comb.CAR.max[s][iy], 0), Math.max(comb.FREQ.max[s][iy], 0), Math.max(comb.QP.max[s][iy], 0));
      const t = face(Math.max(-comb.ELU.min[s][iy], 0), Math.max(-comb.CAR.min[s][iy], 0), Math.max(-comb.FREQ.min[s][iy], 0), Math.max(-comb.QP.min[s][iy], 0), secTop);
      rowB.push(b.As); rowT.push(t.As); fibres.push({ bot: b, top: t });
    }
    bot.push(rowB); top.push(rowT); perFibre.push(fibres);
  }
  const envBot = bot.map(r => Math.max(...r)), envTop = top.map(r => Math.max(...r));
  // effort tranchant : combinaison de poutre avec le facteur K du cas dominant (LM1), par mètre
  const beam = combineBeamEC(perm, ec, { thermal, settle });
  const KL = deck.transverseFactors(ec.LM1).K;
  const shear = deck.beam.sections.map((_, s) => {
    const K = KL[s] || 1;
    const vG = Math.max(Math.abs(perm.Vm[s]), Math.abs(perm.Vp[s]));
    const vQ = Math.max(Math.abs(Math.max(ec.gr1a.Vmax[s], ec.gr1b.Vmax[s])), Math.abs(Math.min(ec.gr1a.Vmin[s], ec.gr1b.Vmin[s])));
    const VEd = (1.35 * vG + 1.35 * K * vQ) / (2 * deck.b) * kNm2MNm; // MN/m
    const As = Math.max(envBot[s], envTop[s]);
    const r = shearVRdc({ d, As }, mat);
    return { VEd, VRdc: r.VRdc, ratio: VEd / r.VRdc, rho: r.rho };
  });
  // poinçonnement : roue LM1 voie 1 (αQ1·300/2, 0,40×0,40) et roue LM2 (βQ·200, 0,35×0,60), ELU γQ = 1,35
  const Q1 = 1.35 * ec.lm1.lanes[0].Q / 2 * kNm2MNm, Q2 = 1.35 * 400 * ec.alpha.aQ[0] / 2 * kNm2MNm;
  const AsP = Math.max(...envBot);
  const punch = {
    LM1: punching({ Q: Q1, a: 0.4, bb: 0.4, tRev, h, d, As: AsP }, mat),
    LM2: punching({ Q: Q2, a: 0.6, bb: 0.35, tRev, h, d, As: AsP }, mat),
  };
  return { ref: 'EC', mat, d, h, c, phi, comb, beam, perFibre, bot, top, envBot, envTop, mins, shear, punch,
    transverseMin: { bot: Math.max(...envBot) * 0.2, top: Math.max(Math.max(...envTop) * 0.2, Math.max(...envBot) * 0.2 * 0.5) } };
}

/**
 * @param {object} opt { fc28, fe, c, fissuration, tRev }
 */
export function designBAEL(deck, perm, f61, opt = {}) {
  const { c = 0.03, tRev = 0.08, thermal = null, settle = null } = opt;
  const mat = materialsBAEL(opt);
  const h = deck.h, d = h - c, sec = { b: 1, h, d };
  const wTop = deck.g.chamfer ? chamferWidthFn({ width: 2 * deck.b, h, hEdge: deck.g.chamfer.hEdge, joue: deck.g.chamfer.joue }) : null;
  const secTop = { ...sec, widthFn: wTop };
  const comb = combineBAEL(perm, f61, { thermal, settle });
  const nS = deck.beam.sections.length;
  const mins = minimumSteelBAEL(sec, mat);
  const perFibre = [], bot = [], top = [];
  for (let s = 0; s < nS; s++) {
    const rowB = [], rowT = [], fibres = [];
    for (let iy = 0; iy < deck.ys.length; iy++) {
      const face = (Mu, Ms, sc = sec) => {
        const elu = flexureELU(Mu * kNm2MNm, sc, mat);
        const els = flexureELS(Ms * kNm2MNm, sc, mat);
        const nonFrag = Ms > 0 ? mins.nonFrag : 0;
        const As = Math.max(elu.As, els.As, nonFrag, mins.dalle);
        return { Mu, Ms, AsELU: elu.As, AsELS: els.As, nonFrag, dalle: mins.dalle, As, As2: Math.max(elu.As2, els.As2 || 0), sigS: els.sigS, sigB: els.sigB, alpha: elu.alpha };
      };
      const b = face(Math.max(comb.ELU.max[s][iy], 0), Math.max(comb.ELS.max[s][iy], 0));
      const t = face(Math.max(-comb.ELU.min[s][iy], 0), Math.max(-comb.ELS.min[s][iy], 0), secTop);
      rowB.push(b.As); rowT.push(t.As); fibres.push({ bot: b, top: t });
    }
    bot.push(rowB); top.push(rowT); perFibre.push(fibres);
  }
  const envBot = bot.map(r => Math.max(...r)), envTop = top.map(r => Math.max(...r));
  const beam = combineBeamBAEL(perm, f61, { thermal, settle });
  const KA = deck.transverseFactors(f61.Bc).K;
  const shear = deck.beam.sections.map((_, s) => {
    const K = KA[s] || 1;
    const vG = Math.max(Math.abs(perm.Vm[s]), Math.abs(perm.Vp[s]));
    const pick = (r, key) => (r ? Math.abs(r[key][s]) : 0);
    const vAB = Math.max(pick(f61.A, 'Vmax'), pick(f61.A, 'Vmin'), pick(f61.Bc, 'Vmax'), pick(f61.Bc, 'Vmin'), pick(f61.Bt, 'Vmax'), pick(f61.Bt, 'Vmin'));
    const vMc = Math.max(pick(f61.Mc120, 'Vmax'), pick(f61.Mc120, 'Vmin'), pick(f61.D240, 'Vmax'), pick(f61.D240, 'Vmin'));
    const Vu = Math.max(1.35 * vG + 1.6 * K * vAB, 1.35 * vG + 1.35 * K * vMc) / (2 * deck.b) * kNm2MNm;
    const r = shearBAEL(Vu, sec, mat);
    return { Vu, tau: r.tau, tauLim: r.tauLim, ratio: r.tau / r.tauLim };
  });
  const delta = f61.deltaBc ? Math.max(...f61.deltaBc) : 1;
  const punch = {
    Br: punchingBAEL({ Qu: 1.6 * 100 * delta * kNm2MNm, a: 0.3, bb: 0.6, tRev, h }, mat),
    Bc: punchingBAEL({ Qu: 1.6 * 60 * delta * kNm2MNm, a: 0.25, bb: 0.25, tRev, h }, mat),
  };
  return { ref: 'F61', mat, d, h, c, comb, beam, perFibre, bot, top, envBot, envTop, mins, shear, punch,
    transverseMin: { bot: Math.max(...envBot) / 4, top: Math.max(...envTop) / 4 } };
}
