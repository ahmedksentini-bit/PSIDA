/**
 * Appuis et fondations — chaîne complète à partir des résultats du tablier (réactions, appareils d'appui) :
 * rigidités des lignes, répartition du freinage et des déformations imposées, combinaisons en tête (BAEL/F61 et EC),
 * descente en pied, fûts (piles voiles ou colonnes, voiles et colonnes de culée), chevêtres, garde-grève, murs en
 * retour, semelles superficielles ou sur pieux, pieux (Ménard, efforts, ferraillage, portance).
 * Unités : m, kN, kN·m, MPa (p*_l, E_M en MPa).
 */
import { neopreneFlexibility, cantileverFlexibility, horizontalDistribution, brakingF61Deck, headCombinationsBAEL, headCombinationsEC } from './actions.js';
import { designShaft, pierCap, buckling } from './pier.js';
import { gardeGreve, murEnRetour, earthPressure, dalleTransition, Ka } from './abutment.js';
import { shallowFooting, footingStrutTie, pileCapStrutTie, pileGroupForces, menardReaction, lateralPile, pileMinSteel, pileCapacity262 } from './foundation.js';
import { requiredSteelNM } from './section_nm.js';
import { bearingSpacing } from '../bearings.js';

/** Valeurs par défaut du formulaire « Appuis et fondations ». */
export const SUPPORT_DEFAULTS = {
  pile: { type: 'voile', H: [6], b: 0.6, Lv: null, nCol: 3, D: 0.8, hc: 0, lc: 1.2 },
  culee: { type: 'remblayee', Hm: 3.0, em: 0.8, hGG: null, Lret: 4.0, nCol: 3, D: 0.8, hc: 1.0, lc: 1.6 },
  found: { type: 'superficielle', B: 3.0, hs: 1.0, De: 1.0, pileD: 0.8, nPile: 3, nFiles: 2, sPile: 2.4, Lpile: 15 },
  soil: { cat: 'sables', ple: 1.0, EM: 10, alpha: 0.5, phi: 30, gamma: 20, q: 10 },
  mat: { fck: 25, fyk: 400, c: 0.05 },
  eps: { TLD: 3e-4, TCD: 1e-4 },
};

const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? { ...a[k], ...b[k] } : b[k] ?? a[k]; return o; };
const EiB = fc => 11000 * fc ** (1 / 3), EvB = fc => 3700 * fc ** (1 / 3), Ecm = fck => 22000 * ((fck + 8) / 10) ** 0.3;

/**
 * @param {object} st résultats de compute() (pipeline) ; @param {object} input données « Appuis » (voir SUPPORT_DEFAULTS)
 */
export function computeSupports(st, input = {}) {
  const sp = merge(SUPPORT_DEFAULTS, input);
  const { deck, perm, f61, ec, bearings } = st;
  const width = 2 * deck.b, Ltot = deck.spans.reduce((a, v) => a + v, 0);
  const xs = [0]; deck.spans.forEach(L => xs.push(xs[xs.length - 1] + L));
  const nL = xs.length, isEnd = i => i === 0 || i === nL - 1;
  const { fck, fyk, c } = sp.mat;
  const Hpile = i => { const H = [].concat(sp.pile.H); return H[Math.min(H.length - 1, i - 1)] ?? H[0]; };
  const Lv = sp.pile.Lv ?? width;
  const hGG = sp.culee.hGG ?? deck.h + 0.15 + Math.max(...bearings.rows.map(r => (r.sel ? r.sel.hTot : 60))) / 1000;

  // --- rigidités horizontales (néoprène + fût console encastré ; fondation supposée rigide) ---
  const shaftI = i => {
    if (isEnd(i)) return sp.culee.type === 'remblayee' ? Infinity : sp.culee.nCol * Math.PI * sp.culee.D ** 4 / 64;
    return sp.pile.type === 'voile' ? Lv * sp.pile.b ** 3 / 12 : sp.pile.nCol * Math.PI * sp.pile.D ** 4 / 64;
  };
  const shaftH = i => (isEnd(i) ? sp.culee.Hm : Hpile(i) + (sp.pile.type === 'colonnes' ? sp.pile.hc : 0));
  const lineData = code => xs.map((x, i) => {
    const r = bearings.rows[i], sel = r.sel || { bd: { a: 300, b: 400 }, T: 0.04 };
    const a = sel.bd.a / 1000, b = sel.bd.b / 1000, Te = (sel.T || 0.04) + 2 * 0.0025;   // élastomère + enrobages 2,5 mm
    const I = shaftI(i), H = shaftH(i);
    const Ei = code === 'BAEL' ? EiB(fck) : Ecm(fck), Ev = code === 'BAEL' ? EvB(fck) : Ecm(fck) / 3;
    return {
      x, bearing: { a, b, Te, n: r.nb },
      sNeo: { inst: neopreneFlexibility({ n: r.nb, a, b, Te, G: 1.8 }), diff: neopreneFlexibility({ n: r.nb, a, b, Te, G: 0.9 }) },
      sApp: { inst: Number.isFinite(I) ? cantileverFlexibility({ H, E: Ei, I }) : 0, diff: Number.isFinite(I) ? cantileverFlexibility({ H, E: Ev, I }) : 0 },
    };
  });
  const distB = horizontalDistribution(lineData('BAEL')), distE = horizontalDistribution(lineData('EC'));

  // --- actions en tête par ligne ---
  const chargeable = deck.g.roadway.y2 - deck.g.roadway.y1;
  const brk = brakingF61Deck({ Ltot, Lc: chargeable });
  const RF = Math.max(0, st.p.concept.epsSlow ?? 2.5e-4), epsT = 1e-5 * (st.p.concept.dTu ?? 30);
  const R = (res, i) => (res ? Math.max(0, res.Rmax[i]) : 0);
  const heads = xs.map((x, i) => {
    const G = { N: perm.Rmax[i] };
    const tr = R(f61.trottoir, i);
    const bB = distB.braking(1)[i];
    const QF = [
      { label: 'A(l) + trottoirs', N: R(f61.A, i) + tr, H: brk.A * bB, gU: 1.605, gS: 1.2 },
      { label: 'Bc + trottoirs', N: R(f61.Bc, i) + tr, H: brk.Bc * bB, gU: 1.605, gS: 1.2 },
      ...(f61.Bt ? [{ label: 'Bt + trottoirs', N: R(f61.Bt, i) + tr, H: 0, gU: 1.605, gS: 1.2 }] : []),
      ...(f61.Mc120 ? [{ label: 'Mc120 + trottoirs', N: R(f61.Mc120, i) + tr, H: 0, gU: 1.35, gS: 1.0 }] : []),
    ];
    const F61 = headCombinationsBAEL({ G, Q: QF, RF: { H: distB.imposed(RF).H[i] }, TLD: { H: distB.imposed(sp.eps.TLD).H[i] }, TCD: { H: distB.imposed(sp.eps.TCD, 'inst').H[i] }, envelope: true });
    const psi0 = (0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i) + 0.4 * R(ec.gr3, i) * 0.6) / Math.max(1e-9, R(ec.gr1a, i));
    const QE = [
      { label: 'gr1a', N: R(ec.gr1a, i), H: 0, psi0 },
      { label: 'gr2 (freinage)', N: 0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i), H: bearings.H * distE.braking(1)[i], psi0: 0 },
    ];
    const EC = headCombinationsEC({ G, Q: QE, RF: { H: distE.imposed(RF).H[i] }, T: { H: distE.imposed(epsT).H[i] } });
    return { x, F61, EC };
  });

  // --- éléments d'appui ---
  const soil = sp.soil, KA = Ka(soil.phi);
  const lines = xs.map((x, i) => {
    const end = isEnd(i), out = { i, x, kind: end ? 'culee' : 'pile', type: end ? sp.culee.type : sp.pile.type, head: heads[i] };
    out.K = { BAEL: { inst: distB.K.inst[i], diff: distB.K.diff[i] }, EC: { inst: distE.K.inst[i], diff: distE.K.diff[i] } };
    const per = {};
    for (const code of ['BAEL', 'EC']) {
      const combos = code === 'BAEL' ? heads[i].F61 : heads[i].EC;
      const gU = 1.35;
      let base, shaftRes, extra = {};
      if (!end) {
        const P = sp.pile, Hf = Hpile(i), col = P.type === 'colonnes';
        const Wchev = col && P.hc > 0 ? 25 * P.hc * P.lc * width : 0;
        const Wfut = col ? 25 * P.nCol * Math.PI * P.D ** 2 / 4 * Hf : 25 * Lv * P.b * Hf;
        base = combos.map(cb => { const g = cb.ls === 'ELU' ? gU : 1; return { ...cb, Nb: cb.N + g * (Wchev + Wfut), Mb: cb.H * (Hf + (col ? P.hc : 0)), Hb: cb.H }; });
        const shape = col ? { D: P.D, c: c + 0.01, nBars: 12 } : { b: Lv, h: P.b, c: c + 0.01 };
        shaftRes = designShaft({ shape, code, fck, fyk, Hf, combos: base.filter(b => b.ls === 'ELU').map(b => ({ label: b.label, N: b.Nb, M: b.Mb })), n: col ? P.nCol : 1 });
        if (col && P.hc > 0) {
          const nb = bearings.nb, pitch = bearingSpacing({ width, psi: st.p.concept.psi, n: nb });
          const ys = Array.from({ length: nb }, (_, k) => width / 2 + (k - (nb - 1) / 2) * pitch);
          const row = bearings.rows[i], kQ = code === 'BAEL' ? 1.605 : 1.35;
          const Pu = (1.35 * row.kCP * perm.Rmax[i] + kQ * row.kQ * Math.max(0, row.Rmax - perm.Rmax[i])) / nb;
          extra.cap = pierCap({ length: width, supports: Array.from({ length: P.nCol }, (_, j) => ({ x: width * (2 * j + 1) / (2 * P.nCol) })), loads: ys.map(y => ({ x: y, P: Pu })), q: 1.35 * 25 * P.hc * P.lc, b: P.lc, h: P.hc, c, fck, fyk, code });
          extra.cap.Pu = Pu;
        }
      } else {
        const C = sp.culee, Hm = C.Hm, rem = C.type === 'remblayee';
        const ep = earthPressure({ H: Hm + hGG, B: rem ? width : C.nCol * Math.min(3 * C.D, width / C.nCol), K: KA, gamma: soil.gamma, q: soil.q });
        const dt = dalleTransition({ Hr: Hm + hGG });
        const Wtop = rem ? 25 * (0.3 * hGG + 1.0 * (C.em + 0.3)) * width : 25 * C.hc * C.lc * width + 25 * 0.3 * hGG * width;
        const Wwall = rem ? 25 * C.em * Hm * width : 25 * C.nCol * Math.PI * C.D ** 2 / 4 * Hm;
        const mr = murEnRetour({ L: C.Lret, h: Hm + hGG });
        const Wret = 2 * 25 * mr.e * C.Lret * (Hm + hGG) / 2;
        base = combos.map(cb => {
          const elu = cb.ls === 'ELU', g = elu ? gU : 1, gq = code === 'BAEL' ? (elu ? 1.605 : 1.2) : (elu ? 1.35 : 1);
          const Hb = cb.H + g * ep.Pg + gq * ep.Pq;
          return { ...cb, Nb: cb.N + g * (Wtop + Wwall + Wret + dt.Rg * width) + gq * dt.Rq * width / 3, Mb: cb.H * (Hm + (rem ? 0 : C.hc)) + g * ep.Mg + gq * ep.Mq, Hb };
        });
        extra.earth = { ...ep, K: KA, Htot: Hm + hGG };
        const shape = rem ? { b: 1, h: C.em, c: c + 0.01 } : { D: C.D, c: c + 0.01, nBars: 12 };
        shaftRes = designShaft({ shape, code, fck, fyk, Hf: Hm, combos: base.filter(b => b.ls === 'ELU').map(b => ({ label: b.label, N: b.Nb, M: b.Mb })), n: rem ? width : C.nCol });
        const gg = gardeGreve({ h: hGG, K: KA, gamma: soil.gamma });
        const ggAs = (requiredSteelNM({ b: 1, h: gg.e, c }, { code, fck, fyk }, 0, gg.ELU).As ?? NaN) / 2;
        extra.gg = { ...gg, h: hGG, As: Math.max(ggAs, 0.001 * gg.e) };
        const hh = Hm + hGG;
        extra.retour = { ...mr, L: C.Lret, h: hh, AsH: (requiredSteelNM({ b: hh / 2, h: mr.e, c }, { code, fck, fyk }, 0, 1.35 * mr.Mh).As ?? NaN) / 2, AsV: (requiredSteelNM({ b: mr.e, h: Math.max(0.5, hh / 2), c }, { code, fck, fyk }, 0, 1.35 * mr.Mv).As ?? NaN) / 2 };
        if (!rem && C.hc > 0) {
          const nb = bearings.nb, pitch = bearingSpacing({ width, psi: st.p.concept.psi, n: nb });
          const ys = Array.from({ length: nb }, (_, k) => width / 2 + (k - (nb - 1) / 2) * pitch);
          const row = bearings.rows[i], kQ = code === 'BAEL' ? 1.605 : 1.35;
          const Pu = (1.35 * row.kCP * perm.Rmax[i] + kQ * row.kQ * Math.max(0, row.Rmax - perm.Rmax[i])) / nb;
          extra.cap = pierCap({ length: width, supports: Array.from({ length: C.nCol }, (_, j) => ({ x: width * (2 * j + 1) / (2 * C.nCol) })), loads: ys.map(y => ({ x: y, P: Pu })), q: 1.35 * 25 * C.hc * C.lc, b: C.lc, h: C.hc, c, fck, fyk, code });
          extra.cap.Pu = Pu;
        }
      }
      // --- fondation ---
      const F = sp.found, bWall = end ? (sp.culee.type === 'remblayee' ? sp.culee.em : sp.culee.D) : (sp.pile.type === 'voile' ? sp.pile.b : sp.pile.D);
      const Lf = (end ? width : (sp.pile.type === 'voile' ? Lv : width)) + 1.0;
      const Wsem = 25 * F.B * Lf * F.hs;
      const fd = base.map(b => { const g = b.ls === 'ELU' ? gU : 1; return { label: b.label, ls: b.ls, V: b.Nb + g * Wsem, H: b.Hb, M: b.Mb + b.Hb * F.hs }; });
      let found;
      if (F.type === 'superficielle') {
        const checks = fd.map(f => ({ ...f, ...shallowFooting({ code, B: F.B, L: Lf, D: F.De, De: F.De, V: f.V, H: f.H, M: f.M, ls: f.ls, soil: soil.cat, ple: soil.ple, phi: soil.phi }) }));
        const eluMax = fd.filter(f => f.ls === 'ELU').reduce((a, f) => (f.V * (1 + 3 * Math.abs(f.M) / f.V / F.B) > a.Nn ? { f, Nn: f.V * (1 + 3 * Math.abs(f.M) / f.V / F.B) } : a), { Nn: 0 });
        const d = F.hs - c - 0.01, fsu = fyk / 1.15;
        found = { type: 'superficielle', B: F.B, L: Lf, hs: F.hs, W: Wsem, checks, worstV: Math.max(...checks.map(k => k.ratioV)), worstH: Math.max(...checks.map(k => k.ratioH)), excOk: checks.every(k => k.excOk),
          AsLong: footingStrutTie({ N: eluMax.Nn, B: F.B, b: bWall, d, fsu }) };
        // sens transversal : semelle filante sous voile → aciers de répartition ≥ 1/4 des aciers principaux (par m) ;
        // sous colonnes → poutre renversée sur les colonnes chargée par la réaction du sol uniforme
        const nc = end ? (sp.culee.type === 'enterree' ? sp.culee.nCol : 0) : (sp.pile.type === 'colonnes' ? sp.pile.nCol : 0);
        if (nc > 0) {
          const off = (Lf - width) / 2, Vu = eluMax.f ? eluMax.f.V : 0;
          const bm = pierCap({ length: Lf, supports: Array.from({ length: nc }, (_, j) => ({ x: off + width * (2 * j + 1) / (2 * nc) })), loads: [], q: -Vu / Lf, b: F.B, h: F.hs, c, fck, fyk, code, rhoMin: 0.001 });
          found.trans = { mode: 'poutre sur colonnes', Mneg: bm.Mneg, Mpos: bm.Mpos, AsTop: bm.AsTop, AsBot: bm.AsBot };
          found.AsTransPerM = Math.max(bm.AsTop, bm.AsBot) / F.B;
        } else found.AsTransPerM = found.AsLong / Lf / 4;
      } else {
        const nF = Math.max(1, F.nFiles), nP = Math.max(1, F.nPile), D = F.pileD;
        const xsP = []; for (let f = 0; f < nF; f++) for (let k = 0; k < nP; k++) xsP.push(nF === 1 ? 0 : (f - (nF - 1) / 2) * F.sPile);
        const kR = menardReaction({ EM: soil.EM * 1000, alpha: soil.alpha, B: D }).k;
        const Ep = code === 'BAEL' ? EiB(Math.min(fck, 25)) : Ecm(Math.min(fck, 30));
        // pieu de Winkler-Ménard, tête encastrée : réponse linéaire calculée une fois pour H = 1 kN
        const lat1 = lateralPile({ L: F.Lpile, D, E: Ep, k: kR, H: 1, fixedHead: true });
        const rows = fd.map(f => {
          const Hp = Math.abs(f.H) / xsP.length, Mhead = Math.abs(lat1.M[0]) * Hp;
          const g = pileGroupForces({ N: f.V, M: Math.abs(f.M), xs: xsP, Mhead: nF > 1 ? Mhead : Math.abs(f.M) / xsP.length });
          return { ...f, Nmax: Math.max(...g.N), Nmin: Math.min(...g.N), Hp, Mhead, Mmax: lat1.Mmax * Hp, y0: lat1.y0 * Hp };
        });
        const elu = rows.filter(r => r.ls === 'ELU'), els = rows.filter(r => r.ls === 'ELS');
        const shapeP = { D, c: 0.07, nBars: 12 };
        // béton de pieu foré : BAEL / F62-V f_c = min(f_c28 ; 25)/(k₁ k₂), k₁ = 1,2 (groupe B), k₂ = 1,05 ; EC2 § 2.4.2.5 : γ_c × k_f = 1,1
        const pileMat = code === 'BAEL' ? { code, fck: Math.min(fck, 25) / (1.2 * 1.05), fyk } : { code, fck: Math.min(fck, 30), fyk, gammaC: 1.5 * 1.1 };
        const AsP = Math.max(...elu.map(r => Math.max(requiredSteelNM(shapeP, pileMat, Math.max(0, r.Nmin), r.Mmax).As ?? Infinity, requiredSteelNM(shapeP, pileMat, r.Nmax, r.Mmax).As ?? Infinity)));
        const cap = pileCapacity262({ D, layers: [{ soil: soil.cat, pl: soil.ple, h: F.Lpile }], pleTip: soil.ple });
        const NmaxU = Math.max(...elu.map(r => r.Nmax)), NmaxS = Math.max(0, ...els.map(r => r.Nmax));
        const capRatio = code === 'EC' ? { ELU: NmaxU / cap.Rcd, ELS: NmaxS / cap.Rcrd } : { ELU: NmaxU / ((cap.Rb + cap.Rs) / 1.4), ELS: NmaxS / ((0.5 * cap.Rb + 0.7 * cap.Rs) / 1.1) };
        const Rfile = Math.max(...elu.map(r => r.Nmax)) * nP;
        const tie = nF === 2 ? pileCapStrutTie({ R: Rfile, l: F.sPile, b: bWall, h: F.hs - 0.1, sigS: fyk / 1.15 }) : null;
        found = { type: 'pieux', D, n: xsP.length, nF, nP, Lpile: F.Lpile, k: kR, rows, NmaxU, NmaxS, NminU: Math.min(...elu.map(r => r.Nmin)), As: Math.max(AsP, pileMinSteel({ D, code })), AsReq: AsP, Amin: pileMinSteel({ D, code }), cap, capRatio, tie, Rfile, hs: F.hs, W: Wsem };
      }
      per[code] = { base, shaft: shaftRes, ...extra, found };
    }
    out.BAEL = per.BAEL; out.EC = per.EC;
    return out;
  });
  return { sp, xs, Lv, width, distB, distE, braking: { F61: brk, EC: bearings.H }, eps: { RF, TLD: sp.eps.TLD, TCD: sp.eps.TCD, T: epsT }, hGG, Ka: KA, lines };
}
