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
import { mechanicalSkew, equivalentWidth, annexe12A } from './skew.js';

const kNm2MNm = 1e-3;

/**
 * @param {import('./analysis.js').SlabDeck} deck
 * @param {object} perm   deck.permanent()
 * @param {object} ec     deck.eurocode()
 * @param {object} opt    { fck, fyk, c, phi, wkMax, tRev, alphaE, fsFat, kSlab }
 */
/** Boucle sections × fibres × faces à partir d'une combinaison EC {ELU, CAR, FREQ, QP} (max/min [s][iy]). */
function facesEC(deck, comb, mat, sec, secTop, mins, { wkMax, phi, c }) {
  const nS = deck.beam.sections.length;
  const perFibre = [], bot = [], top = [];
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
  return { perFibre, bot, top, envBot: bot.map(r => Math.max(...r)), envTop: top.map(r => Math.max(...r)) };
}

export function designEC(deck, perm, ec, opt = {}) {
  const { c = 0.03, phi = 0.020, wkMax = 0.3, tRev = 0.08, thermal = null, settle = null } = opt;
  const mat = materialsEC2(opt);
  const h = deck.h, d = h - c, sec = { b: 1, h, d };
  // chanfreins : compression par l'intrados (moments sur appuis) sur largeur réduite
  const wTop = deck.g.chamfer ? chamferWidthFn({ width: 2 * deck.b, h, hEdge: deck.g.chamfer.hEdge, joue: deck.g.chamfer.joue }) : null;
  const secTop = { ...sec, widthFn: wTop };
  const comb = combineEC(perm, ec, { thermal, settle });
  const mins = minimumSteel(sec, mat, { kSlab: opt.kSlab ?? 1.2 });
  const { perFibre, bot, top, envBot, envTop } = facesEC(deck, comb, mat, sec, secTop, mins, { wkMax, phi, c });
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
    // EC2 6.2.3 : si V_Ed > V_Rd,c, étriers A_sw/s = V_Ed / (z·fywd·cot θ), z = 0,9 d, cot θ = 1 (bielles à 45°), et V_Rd,max
    const z = 0.9 * d, cotT = 1, fywd = mat.fyd, nu1 = 0.6 * (1 - mat.fck / 250);
    const VRdmax = 1 * z * nu1 * mat.fcd / (cotT + 1 / cotT);
    const AswS = VEd > r.VRdc ? VEd / (z * fywd * cotT) : 0;
    return { VEd, VRdc: r.VRdc, ratio: VEd / r.VRdc, rho: r.rho, AswS, VRdmax, okMax: VEd <= VRdmax };
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
 * Profil provisoire (phase de chantier) ou convoi LM3 seul : combinaisons avec une seule action variable Q
 * (ELU = 1,35 G + 1,35 Q ; ELS car. = G + Ta + 0,6 T + Q ; ELS fréq. = G + 0,5 T + ψ₁ Q ; ELS QP = G + Ta + 0,5 T), puis
 * aciers par face comme designEC ; `longEC` permet l'enveloppe des deux profils.
 */
export function designSingleActionEC(deck, perm, Q, opt = {}) {
  const { c = 0.03, phi = 0.020, wkMax = 0.3, thermal = null, settle = null, psi1 = 0.75, label = 'Q' } = opt;
  const mat = materialsEC2(opt);
  const h = deck.h, d = h - c, sec = { b: 1, h, d };
  const wTop = deck.g.chamfer ? chamferWidthFn({ width: 2 * deck.b, h, hEdge: deck.g.chamfer.hEdge, joue: deck.g.chamfer.joue }) : null;
  const secTop = { ...sec, widthFn: wTop };
  const mins = minimumSteel(sec, mat, { kSlab: opt.kSlab ?? 1.2 });
  const nS = deck.beam.sections.length, ny = deck.ys.length;
  const t = (key, s, iy) => (thermal ? thermal[key][s][iy] : 0), ta = (key, s, iy) => (settle ? settle[key][s][iy] : 0);
  const q = (key, s, iy) => (Q ? Q[key][s][iy] : 0);
  const mk = fn => Array.from({ length: nS }, (_, s) => Array.from({ length: ny }, (_, iy) => fn(s, iy)));
  const comb = {
    ELU: { max: mk((s, iy) => 1.35 * perm.mxMax[s][iy] + 1.35 * Math.max(q('mxMax', s, iy), 0)), min: mk((s, iy) => 1.35 * perm.mxMin[s][iy] + 1.35 * Math.min(q('mxMin', s, iy), 0)) },
    CAR: { max: mk((s, iy) => perm.mxMax[s][iy] + ta('mxMax', s, iy) + 0.6 * t('mxMax', s, iy) + Math.max(q('mxMax', s, iy), 0)), min: mk((s, iy) => perm.mxMin[s][iy] + ta('mxMin', s, iy) + 0.6 * t('mxMin', s, iy) + Math.min(q('mxMin', s, iy), 0)) },
    FREQ: { max: mk((s, iy) => perm.mxMax[s][iy] + 0.5 * t('mxMax', s, iy) + psi1 * Math.max(q('mxMax', s, iy), 0)), min: mk((s, iy) => perm.mxMin[s][iy] + 0.5 * t('mxMin', s, iy) + psi1 * Math.min(q('mxMin', s, iy), 0)) },
    QP: { max: mk((s, iy) => perm.mxMax[s][iy] + ta('mxMax', s, iy) + 0.5 * t('mxMax', s, iy)), min: mk((s, iy) => perm.mxMin[s][iy] + ta('mxMin', s, iy) + 0.5 * t('mxMin', s, iy)) },
  };
  const beamM = { max: deck.beam.sections.map((_, s) => perm.Mmax[s] + (settle ? settle.Mmax[s] : 0) + 0.6 * (thermal ? thermal.Mmax[s] : 0) + Math.max(Q ? Q.Mmax[s] : 0, 0)), min: deck.beam.sections.map((_, s) => perm.Mmin[s] + (settle ? settle.Mmin[s] : 0) + 0.6 * (thermal ? thermal.Mmin[s] : 0) + Math.min(Q ? Q.Mmin[s] : 0, 0)) };
  const r = facesEC(deck, comb, mat, sec, secTop, mins, { wkMax, phi, c });
  return { ref: 'EC', label, mat, d, h, c, phi, comb, beamCAR: beamM, mins, ...r };
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
  // coefficient de répartition propre à chaque cas (auparavant celui de Bc pour tous : non conservatif quand Bt gouverne)
  const Kof = r => (r ? deck.transverseFactors(r).K : null);
  const Ks = { A: Kof(f61.A), Bc: Kof(f61.Bc), Bt: Kof(f61.Bt), Mc120: Kof(f61.Mc120), D240: Kof(f61.D240) };
  const shear = deck.beam.sections.map((_, s) => {
    const vG = Math.max(Math.abs(perm.Vm[s]), Math.abs(perm.Vp[s]));
    const pick = key => (f61[key] ? (Ks[key][s] || 1) * Math.max(Math.abs(f61[key].Vmax[s]), Math.abs(f61[key].Vmin[s])) : 0);
    const vAB = Math.max(pick('A'), pick('Bc'), pick('Bt'));
    const vMc = Math.max(pick('Mc120'), pick('D240'));
    const Vu = Math.max(1.35 * vG + 1.6 * vAB, 1.35 * vG + 1.35 * vMc) / (2 * deck.b) * kNm2MNm;
    const r = shearBAEL(Vu, sec, mat);
    // BAEL A.5.1.23 (armatures droites) si τu > τ̄u des dalles : A_t/s_t ≥ (τu − 0,3 k ft28)·b/(0,9 fsu), k = 1, et τu ≤ min(0,2 fc28/γb ; 5 MPa)
    const tauMax = Math.min(0.2 * mat.fc28 / mat.gammaB, 5);
    const AtS = r.tau > r.tauLim ? Math.max(0, r.tau - 0.3 * mat.ft28) / (0.9 * mat.fsu) : 0;
    return { Vu, tau: r.tau, tauLim: r.tauLim, ratio: r.tau / r.tauLim, AtS, tauMax, okMax: r.tau <= tauMax };
  });
  const delta = f61.deltaBc ? Math.max(...f61.deltaBc) : 1;
  const punch = {
    Br: punchingBAEL({ Qu: 1.6 * 100 * delta * kNm2MNm, a: 0.3, bb: 0.6, tRev, h }, mat),
    Bc: punchingBAEL({ Qu: 1.6 * 60 * delta * kNm2MNm, a: 0.25, bb: 0.25, tRev, h }, mat),
  };
  return { ref: 'F61', mat, d, h, c, comb, beam, perFibre, bot, top, envBot, envTop, mins, shear, punch,
    transverseMin: { bot: Math.max(...envBot) / 4, top: Math.max(...envTop) / 4 } };
}

// -----------------------------------------------------------------------------------------------------
// Flexion transversale : aciers transversaux par travée (section rectangulaire par mètre, d_y = h − c − φ)
// -----------------------------------------------------------------------------------------------------

/**
 * Biais : moments dans la direction des aciers transversaux (annexe 12A du BPEL, pratique CHAMOA) pour une travée.
 * MX = moment longitudinal maximal de la travée (par mètre, toutes fibres), MY = moment transversal maximal (Guyon) ;
 * les deux maxima ne sont pas concomitants (CHAMOA). Pour la nappe supérieure (MY < 0) la note prend MX = 0.
 * @returns {{phiMec:number, psi2:number, Be:number, max:object, min:object}} ou null si l'ouvrage est droit
 */
function skewMoments(deck, j, longComb, transComb, opt) {
  const psi = opt.psi ?? deck.g.psi ?? 100;
  if (!(psi < 100)) return null;
  const Be = equivalentWidth({ width: 2 * deck.b, h: deck.h, I: opt.I || null });
  const phiMec = mechanicalSkew({ psi, Be, L: deck.spans[j] });
  const psi2 = opt.transversePerpendicular ? 100 : psi;
  const idx = deck.beam.sections.map((s, i) => (s.span === j ? i : -1)).filter(i => i >= 0);
  const out = { phiMec, psi2, Be, psi, max: {}, min: {} };
  for (const key of Object.keys(transComb)) {
    const MX = Math.max(0, ...idx.map(i => Math.max(...longComb[key].max[i])));
    const MY = Math.max(0, ...transComb[key].max[j]), MYmin = Math.min(0, ...transComb[key].min[j]);
    out.max[key] = { MX, MY, M: annexe12A({ MX, MY, phiMec, psi, psi2, face: 'bot' }).M2 };
    out.min[key] = { MX: 0, MY: MYmin, M: annexe12A({ MX: 0, MY: MYmin, phiMec, psi, psi2, face: 'top' }).M2 };
  }
  return out;
}

/** Pseudo-résultats [travée][y] pour réutiliser les combinaisons longitudinales. */
function asCase(spans, pick) { if (!pick(spans[0])) return null; return { mxMax: spans.map(sp => pick(sp).myMax), mxMin: spans.map(sp => pick(sp).myMin) }; }

/**
 * @param {object} trans   résultat de TransverseModel.run()
 * @param {object} longEC  résultat de designEC (pour les minimums non sectionnels)
 */
export function designTransverseEC(deck, trans, longEC, opt = {}) {
  const { c = 0.03, phi = 0.020, wkMax = 0.3, phiLong = 0.020 } = opt;
  const mat = materialsEC2(opt);
  const h = deck.h, d = h - c - phiLong, sec = { b: 1, h, d };
  const spans = trans.spans;
  const perm = { mxMax: spans.map(sp => sp.perm.myMax), mxMin: spans.map(sp => sp.perm.myMin) };
  const ec = { TS: asCase(spans, sp => sp.ec.TS), UDL: asCase(spans, sp => sp.ec.UDL), footway: asCase(spans, sp => sp.ec.footway), gr1b: asCase(spans, sp => sp.ec.gr1b), gr3: asCase(spans, sp => sp.ec.gr3) };
  const thermal = asCase(spans, sp => sp.thermal), settle = asCase(spans, sp => sp.settle);
  const comb = combineEC(perm, ec, { thermal, settle });
  const mins = minimumSteel(sec, mat, { kSlab: opt.kSlab ?? 1.2 });
  const out = [];
  spans.forEach((sp, j) => {
    const idx = deck.beam.sections.map((s, i) => (s.span === j ? i : -1)).filter(i => i >= 0);
    const asLongBot = Math.max(...idx.map(i => longEC.envBot[i])), asLongTop = Math.max(...idx.map(i => longEC.envTop[i]));
    const face = (Mu, Mcar, Mfre) => {
      const uls = flexureULS(Mu * kNm2MNm, sec, mat), sls = flexureSLS(Mcar * kNm2MNm, sec, mat), wk = asForCrackWidth(Mfre * kNm2MNm, sec, mat, { wkMax, phi, c });
      return { Mu, Mcar, Mfre, AsULS: uls.As, AsSLS: sls.As, AsWk: wk, flex: Math.max(uls.As, sls.As, wk), sigS: sls.sigS, sigC: sls.sigC };
    };
    const botY = trans.ys.map((_, iy) => face(Math.max(comb.ELU.max[j][iy], 0), Math.max(comb.CAR.max[j][iy], 0), Math.max(comb.FREQ.max[j][iy], 0)));
    const topY = trans.ys.map((_, iy) => face(Math.max(-comb.ELU.min[j][iy], 0), Math.max(-comb.CAR.min[j][iy], 0), Math.max(-comb.FREQ.min[j][iy], 0)));
    const ib = botY.map(f => f.flex).indexOf(Math.max(...botY.map(f => f.flex))), it = topY.map(f => f.flex).indexOf(Math.max(...topY.map(f => f.flex)));
    let bot = botY[ib], top = topY[it];
    // biais : moments dans la direction des aciers (annexe 12A) à la place de m_y
    const skew = skewMoments(deck, j, longEC.comb, { ELU: comb.ELU, CAR: comb.CAR, FREQ: comb.FREQ }, opt);
    if (skew) {
      bot = { ...face(skew.max.ELU.M, skew.max.CAR.M, skew.max.FREQ.M), straight: bot, skew: skew.max };
      top = { ...face(-skew.min.ELU.M, -skew.min.CAR.M, -skew.min.FREQ.M), straight: top, skew: skew.min };
    }
    const nonSecBot = 0.2 * asLongBot;
    // minimum du guide SETRA 1989 § 3.4.3 (gradient thermique) : 1,3 n ‰ ≤ 2 ‰ de b·h, × 1/sin ψ si parallèles aux lignes d'appui
    const nWL = 2 * deck.b / deck.spans[j];   // § 3.4.3 : η = largeur / portée de la travée considérée
    const minGuide = Math.min(1.3 * nWL, 2) / 1000 * h * (skew && skew.psi2 < 100 ? 1 / Math.sin(skew.psi2 * Math.PI / 200) : 1);
    const botAs = Math.max(bot.flex, nonSecBot, mins.perFace, minGuide);
    const nonSecTop = Math.max(0.2 * asLongTop, 0.5 * botAs);
    const topAs = Math.max(top.flex, nonSecTop, mins.perFace);
    out.push({ j, L: sp.L, bot: { ...bot, y: trans.ys[ib], nonSec: nonSecBot, perFace: mins.perFace, minGuide, As: botAs }, top: { ...top, y: trans.ys[it], nonSec: nonSecTop, perFace: mins.perFace, As: topAs }, asLongBot, asLongTop, skew, comb: { CARmax: comb.CAR.max[j], CARmin: comb.CAR.min[j], ELUmax: comb.ELU.max[j], ELUmin: comb.ELU.min[j] } });
  });
  return { mat, d, spans: out, ys: trans.ys, skew: out[0].skew ? { psi: out[0].skew.psi, psi2: out[0].skew.psi2, Be: out[0].skew.Be, sinPsi: Math.sin(out[0].skew.psi2 * Math.PI / 200) } : null };
}

export function designTransverseBAEL(deck, trans, longBAEL, opt = {}) {
  const { c = 0.03, phiLong = 0.020 } = opt;
  const mat = materialsBAEL(opt);
  const h = deck.h, d = h - c - phiLong, sec = { b: 1, h, d };
  const spans = trans.spans;
  const perm = { mxMax: spans.map(sp => sp.perm.myMax), mxMin: spans.map(sp => sp.perm.myMin) };
  const f61 = { A: asCase(spans, sp => sp.f61.A), Bc: asCase(spans, sp => sp.f61.Bc), Bt: spans[0].f61.Bt ? asCase(spans, sp => sp.f61.Bt) : null, Mc120: asCase(spans, sp => sp.f61.Mc120), D240: asCase(spans, sp => sp.f61.D240), trottoir: asCase(spans, sp => sp.f61.trottoir) };
  const thermal = asCase(spans, sp => sp.thermal), settle = asCase(spans, sp => sp.settle);
  const comb = combineBAEL(perm, f61, { thermal, settle });
  // ELU avec ν = 0 (béton fissuré) si un second calcul transversal est fourni et que la fissuration est peu nuisible
  // (pratique PSIDA.EL / MRB-EL ; l'ELS reste calculé avec ν de la dalle) — EN 1992-1-1 § 3.1.3(4)
  if (opt.transELU && mat.fissuration === 'peu nuisible') {
    const s0 = opt.transELU.spans;
    const perm0 = { mxMax: s0.map(sp => sp.perm.myMax), mxMin: s0.map(sp => sp.perm.myMin) };
    const f610 = { A: asCase(s0, sp => sp.f61.A), Bc: asCase(s0, sp => sp.f61.Bc), Bt: s0[0].f61.Bt ? asCase(s0, sp => sp.f61.Bt) : null, Mc120: asCase(s0, sp => sp.f61.Mc120), D240: asCase(s0, sp => sp.f61.D240), trottoir: asCase(s0, sp => sp.f61.trottoir) };
    comb.ELU = combineBAEL(perm0, f610, { thermal: asCase(s0, sp => sp.thermal), settle: asCase(s0, sp => sp.settle) }).ELU;
    comb.nuELU = 0;
  }
  const mins = minimumSteelBAEL(sec, mat);
  const out = [];
  spans.forEach((sp, j) => {
    const idx = deck.beam.sections.map((s, i) => (s.span === j ? i : -1)).filter(i => i >= 0);
    const asLongBot = Math.max(...idx.map(i => longBAEL.envBot[i])), asLongTop = Math.max(...idx.map(i => longBAEL.envTop[i]));
    const face = (Mu, Ms) => { const elu = flexureELU(Mu * kNm2MNm, sec, mat), els = flexureELS(Ms * kNm2MNm, sec, mat); return { Mu, Ms, AsELU: elu.As, AsELS: els.As, flex: Math.max(elu.As, els.As), sigS: els.sigS, sigB: els.sigB }; };
    const botY = trans.ys.map((_, iy) => face(Math.max(comb.ELU.max[j][iy], 0), Math.max(comb.ELS.max[j][iy], 0)));
    const topY = trans.ys.map((_, iy) => face(Math.max(-comb.ELU.min[j][iy], 0), Math.max(-comb.ELS.min[j][iy], 0)));
    const ib = botY.map(f => f.flex).indexOf(Math.max(...botY.map(f => f.flex))), it = topY.map(f => f.flex).indexOf(Math.max(...topY.map(f => f.flex)));
    let bot = botY[ib], top = topY[it];
    const skew = skewMoments(deck, j, longBAEL.comb, { ELU: comb.ELU, ELS: comb.ELS }, opt);
    if (skew) {
      bot = { ...face(skew.max.ELU.M, skew.max.ELS.M), straight: bot, skew: skew.max };
      top = { ...face(-skew.min.ELU.M, -skew.min.ELS.M), straight: top, skew: skew.min };
    }
    const nWL = 2 * deck.b / deck.spans[j];   // § 3.4.3 : η = largeur / portée de la travée considérée
    const minGuide = Math.min(1.3 * nWL, 2) / 1000 * h * (skew && skew.psi2 < 100 ? 1 / Math.sin(skew.psi2 * Math.PI / 200) : 1);
    // armatures de répartition BAEL (B.7.4) : ≥ A_s,long/4 (charges réparties) ; ≥ A_s,long/3 pour charges concentrées
    const botAs = Math.max(bot.flex, asLongBot / 3, mins.dalle, minGuide), topAs = Math.max(top.flex, asLongTop / 3, mins.dalle);
    out.push({ j, L: sp.L, bot: { ...bot, y: trans.ys[ib], nonSec: asLongBot / 3, minGuide, As: botAs }, top: { ...top, y: trans.ys[it], nonSec: asLongTop / 3, As: topAs }, asLongBot, asLongTop, skew, comb: { ELSmax: comb.ELS.max[j], ELSmin: comb.ELS.min[j], ELUmax: comb.ELU.max[j], ELUmin: comb.ELU.min[j] } });
  });
  return { mat, d, spans: out, ys: trans.ys, skew: out[0].skew ? { psi: out[0].skew.psi, psi2: out[0].skew.psi2, Be: out[0].skew.Be, sinPsi: Math.sin(out[0].skew.psi2 * Math.PI / 200) } : null };
}
