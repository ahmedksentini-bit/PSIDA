/**
 * Combinaisons d'actions, par section et par fibre y, à partir des enveloppes caractéristiques :
 * permanent (kmin/kmax), trafic, gradient thermique T (option), tassements aléatoires Ta (option).
 *
 *  Eurocodes (EN 1990 A2, pratique CHAMOA — formules vérifiées sur la note : ELS caractéristique à P1 = 10 042 kN·m) :
 *    ELU fondamental  : γG·G + γQ·Q                              (T et Ta : ζ = 0 à l'ELU)
 *    ELS caractéristique : G + Ta + max( T + ψ0·Q ;  ψ0T·T + Q_LM1 ;  Q_LM2 )     ψ0T = 0,6
 *    ELS fréquent     : G + max( ψ1T·T ;  ψ2T·T + ψ1·Q_LM1 ;  ψ1·Q_LM2 )           ψ1T = 0,6, ψ2T = 0,5 (Ta : ρ1 = 0)
 *    ELS quasi-permanent : G + Ta + ψ2T·T
 *    ψ (trafic) : TS 0,75 ; UDL 0,40 ; trottoirs 0,40 (ψ0 = ψ1) ; LM2 ψ0 = 0, ψ1 = 0,75 ; gr3 : 0
 *
 *  Fascicule 61 + BAEL 91 (annexe D, ponts routes) :
 *    ELU : 1,35 G + 1,6 (A ou B) + 1,6 Trottoir ;  1,35 G + 1,35 Mc ;  1,35 G + 1,35 D
 *    ELS : G + Ta + 0,6 T + 1,2 (A ou B) + Trottoir ;  G + Ta + 0,6 T + Mc ;  G + Ta + 0,6 T + D   (T, Ta optionnels)
 */

export const EC_COMBI = {
  gammaG: 1.35, gammaGfav: 1.0, gammaQ: 1.35,
  psi0: { TS: 0.75, UDL: 0.40, footway: 0.40, LM2: 0, gr3: 0 },
  psi1: { TS: 0.75, UDL: 0.40, footway: 0.40, LM2: 0.75, gr3: 0 },
  psi0T: 0.6, psi1T: 0.6, psi2T: 0.5, rho0: 1, rho1: 0, rhoQP: 1,
};
export const BAEL_COMBI = { ELU: { G: 1.35, Gfav: 1.0, AB: 1.6, trott: 1.6, Mc: 1.35, D: 1.35, T: 0, Ta: 0 }, ELS: { G: 1.0, AB: 1.2, trott: 1.0, Mc: 1.0, D: 1.0, T: 0.6, Ta: 1.0 } };

const gPlus = (G, gam, gamFav) => (G >= 0 ? gam * G : gamFav * G);
const gMinus = (G, gam, gamFav) => (G <= 0 ? gam * G : gamFav * G);
const zeros2 = (nS, nY) => Array.from({ length: nS }, () => new Array(nY).fill(0));

/**
 * Combinaisons Eurocode par section et fibre.
 * @param {object} perm   deck.permanent() (mxMax/mxMin ou mx)
 * @param {object} ec     deck.eurocode()
 * @param {{thermal?:object, settle?:object, k?:object}} opt résultats de deck.thermal() / deck.settlements()
 * @returns {{ELU:{max,min}, CAR:{max,min}, FREQ:{max,min}, QP:{max,min}}} tableaux [s][iy]
 */
export function combineEC(perm, ec, { thermal = null, settle = null, k = EC_COMBI } = {}) {
  const Gmax = perm.mxMax || perm.mx, Gmin = perm.mxMin || perm.mx;
  const nS = Gmax.length, nY = Gmax[0].length;
  const T = thermal ? thermal : { mxMax: zeros2(nS, nY), mxMin: zeros2(nS, nY) };
  const Ta = settle ? settle : { mxMax: zeros2(nS, nY), mxMin: zeros2(nS, nY) };
  const out = { ELU: { max: [], min: [] }, CAR: { max: [], min: [] }, FREQ: { max: [], min: [] }, QP: { max: [], min: [] } };
  for (let s = 0; s < nS; s++) {
    const r = { ELU: [[], []], CAR: [[], []], FREQ: [[], []], QP: [[], []] };
    for (let iy = 0; iy < nY; iy++) {
      const gM = Gmax[s][iy], gm = Gmin[s][iy];
      const v = (res, which) => (which === 'max' ? res.mxMax[s][iy] : res.mxMin[s][iy]);
      for (const which of ['max', 'min']) {
        const sel = which === 'max' ? Math.max : Math.min, g = which === 'max' ? gM : gm, i = which === 'max' ? 0 : 1;
        const ts = v(ec.TS, which), udl = v(ec.UDL, which), fw = v(ec.footway, which), lm2 = v(ec.gr1b, which), g3 = v(ec.gr3, which);
        const t = v(T, which), ta = v(Ta, which);
        const q1 = ts + udl + fw, q1psi0 = k.psi0.TS * ts + k.psi0.UDL * udl + k.psi0.footway * fw;
        const q1psi1 = k.psi1.TS * ts + k.psi1.UDL * udl + k.psi1.footway * fw;
        const qCar = sel(q1, lm2, g3, 0);
        r.ELU[i].push((which === 'max' ? gPlus(g, k.gammaG, k.gammaGfav) : gMinus(g, k.gammaG, k.gammaGfav)) + k.gammaQ * qCar);
        r.CAR[i].push(g + k.rho0 * ta + sel(t + q1psi0, k.psi0T * t + q1, lm2, k.psi0T * t + g3, 0));
        r.FREQ[i].push(g + k.rho1 * ta + sel(k.psi1T * t, k.psi2T * t + q1psi1, k.psi1.LM2 * lm2, 0));
        r.QP[i].push(g + k.rhoQP * ta + k.psi2T * t);
      }
    }
    for (const key of Object.keys(out)) { out[key].max.push(r[key][0]); out[key].min.push(r[key][1]); }
  }
  return out;
}

/** Combinaisons BAEL / Fascicule 61 par section et fibre. */
export function combineBAEL(perm, f61, { thermal = null, settle = null, k = BAEL_COMBI } = {}) {
  const Gmax = perm.mxMax || perm.mx, Gmin = perm.mxMin || perm.mx;
  const nS = Gmax.length, nY = Gmax[0].length;
  const T = thermal ? thermal : { mxMax: zeros2(nS, nY), mxMin: zeros2(nS, nY) };
  const Ta = settle ? settle : { mxMax: zeros2(nS, nY), mxMin: zeros2(nS, nY) };
  const out = { ELU: { max: [], min: [] }, ELS: { max: [], min: [] }, QP: { max: [], min: [] } };
  for (let s = 0; s < nS; s++) {
    const r = { ELU: [[], []], ELS: [[], []], QP: [[], []] };
    for (let iy = 0; iy < nY; iy++) {
      for (const which of ['max', 'min']) {
        const sel = which === 'max' ? Math.max : Math.min, g = which === 'max' ? Gmax[s][iy] : Gmin[s][iy], i = which === 'max' ? 0 : 1;
        const pick = res => (res ? (which === 'max' ? res.mxMax[s][iy] : res.mxMin[s][iy]) : 0);
        const ab = sel(pick(f61.A), pick(f61.Bc), pick(f61.Bt), 0), tr = sel(pick(f61.trottoir), 0), mc = sel(pick(f61.Mc120), 0), d = sel(pick(f61.D240), 0);
        const t = pick(T), ta = pick(Ta);
        const E = k.ELU, S = k.ELS;
        const gE = which === 'max' ? gPlus(g, E.G, E.Gfav) : gMinus(g, E.G, E.Gfav);
        r.ELU[i].push(sel(gE + E.AB * ab + E.trott * tr, gE + E.Mc * mc, gE + E.D * d) + E.T * t + E.Ta * ta);
        r.ELS[i].push(S.G * g + S.Ta * ta + S.T * t + sel(S.AB * ab + S.trott * tr, S.Mc * mc, S.D * d, 0));
        r.QP[i].push(g + S.Ta * ta + S.T * t);
      }
    }
    for (const key of Object.keys(out)) { out[key].max.push(r[key][0]); out[key].min.push(r[key][1]); }
  }
  return out;
}

/** Combinaisons sur les efforts de poutre entière (M, V, R) — Eurocode. */
export function combineBeamEC(perm, ec, { thermal = null, settle = null, k = EC_COMBI } = {}) {
  const mk = (key, perMax, perMin) => {
    const n = perMax.length;
    const q = i => ({
      ts: [ec.TS[key + 'max'][i], ec.TS[key + 'min'][i]], udl: [ec.UDL[key + 'max'][i], ec.UDL[key + 'min'][i]], fw: [ec.footway[key + 'max'][i], ec.footway[key + 'min'][i]],
      lm2: [ec.gr1b[key + 'max'][i], ec.gr1b[key + 'min'][i]], g3: [ec.gr3[key + 'max'][i], ec.gr3[key + 'min'][i]],
      t: thermal ? [thermal[key + 'max'][i], thermal[key + 'min'][i]] : [0, 0], ta: settle ? [settle[key + 'max'][i], settle[key + 'min'][i]] : [0, 0],
    });
    const out = { ELUmax: [], ELUmin: [], CARmax: [], CARmin: [], FREQmax: [], FREQmin: [] };
    for (let i = 0; i < n; i++) {
      const c = q(i);
      for (const [j, which] of [[0, 'max'], [1, 'min']]) {
        const sel = which === 'max' ? Math.max : Math.min, g = which === 'max' ? perMax[i] : perMin[i];
        const q1 = c.ts[j] + c.udl[j] + c.fw[j], q1p0 = k.psi0.TS * c.ts[j] + k.psi0.UDL * c.udl[j] + k.psi0.footway * c.fw[j], q1p1 = k.psi1.TS * c.ts[j] + k.psi1.UDL * c.udl[j] + k.psi1.footway * c.fw[j];
        out['ELU' + which].push((which === 'max' ? gPlus(g, k.gammaG, k.gammaGfav) : gMinus(g, k.gammaG, k.gammaGfav)) + k.gammaQ * sel(q1, c.lm2[j], c.g3[j], 0));
        out['CAR' + which].push(g + k.rho0 * c.ta[j] + sel(c.t[j] + q1p0, k.psi0T * c.t[j] + q1, c.lm2[j], k.psi0T * c.t[j] + c.g3[j], 0));
        out['FREQ' + which].push(g + sel(k.psi1T * c.t[j], k.psi2T * c.t[j] + q1p1, k.psi1.LM2 * c.lm2[j], 0));
      }
    }
    return out;
  };
  const Vg = perm.Vm.map((v, i) => (Math.abs(v) > Math.abs(perm.Vp[i]) ? v : perm.Vp[i]));
  return { M: mk('M', perm.Mmax || perm.M, perm.Mmin || perm.M), V: mk('V', Vg, Vg), R: mk('R', perm.Rmax || perm.R, perm.Rmin || perm.R) };
}

/** Combinaisons sur les efforts de poutre entière — BAEL / Fasc. 61. */
export function combineBeamBAEL(perm, f61, { thermal = null, settle = null, k = BAEL_COMBI } = {}) {
  const mk = (key, perMax, perMin) => {
    const n = perMax.length, E = k.ELU, S = k.ELS;
    const pick = (res, which, i) => (res ? res[key + which][i] : 0);
    const out = { ELUmax: [], ELUmin: [], ELSmax: [], ELSmin: [] };
    for (let i = 0; i < n; i++) {
      for (const which of ['max', 'min']) {
        const sel = which === 'max' ? Math.max : Math.min, g = which === 'max' ? perMax[i] : perMin[i];
        const ab = sel(pick(f61.A, which, i), pick(f61.Bc, which, i), pick(f61.Bt, which, i), 0), tr = sel(pick(f61.trottoir, which, i), 0), mc = sel(pick(f61.Mc120, which, i), 0), d = sel(pick(f61.D240, which, i), 0);
        const t = pick(thermal, which, i), ta = pick(settle, which, i);
        const gE = which === 'max' ? gPlus(g, E.G, E.Gfav) : gMinus(g, E.G, E.Gfav);
        out['ELU' + which].push(sel(gE + E.AB * ab + E.trott * tr, gE + E.Mc * mc, gE + E.D * d) + E.T * t + E.Ta * ta);
        out['ELS' + which].push(S.G * g + S.Ta * ta + S.T * t + sel(S.AB * ab + S.trott * tr, S.Mc * mc, S.D * d, 0));
      }
    }
    return out;
  };
  const Vg = perm.Vm.map((v, i) => (Math.abs(v) > Math.abs(perm.Vp[i]) ? v : perm.Vp[i]));
  return { M: mk('M', perm.Mmax || perm.M, perm.Mmin || perm.M), V: mk('V', Vg, Vg), R: mk('R', perm.Rmax || perm.R, perm.Rmin || perm.R) };
}
