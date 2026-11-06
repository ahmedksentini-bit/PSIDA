/**
 * Dalle de transition d'une culée — calcul par mètre de largeur (EN 1991-2, EN 1992-1-1) et choix de l'épaisseur.
 * Voir src/plans/dalle_transition.js pour le plan de ferraillage.
 */
import { materialsEC2, flexureULS, flexureSLS, asForCrackWidth, minimumSteel, shearVRdc } from '../section_ec2.js';
import { chooseBars } from '../rebar.js';

/**
 * Enveloppe d'une poutre isostatique de portée Lc sous un convoi de charges réparties sur des longueurs finies, déplacé pas
 * à pas. `convoi(u)` renvoie les charges [{ x, a, P }] (centre, longueur, résultante par mètre de largeur) pour la position
 * u de son origine ; les parties hors travée sont ignorées. Moment maximal en travée ; effort tranchant aux sections
 * situées à d des appuis (EN 1992-1-1 § 6.2.1(8)), charges placées à a_v ≤ 2d d'un appui réduites de β = a_v / 2d
 * (§ 6.2.2(6), a_v ≥ 0,5 d) — `convoiV` fournit les charges de l'effort tranchant (largeurs efficaces différentes).
 */
export function enveloppeConvoi(Lc, convoi, { n = 120, pas = 0.05, d = 0, convoiV = convoi } = {}) {
  const parties = (qs, beta) => {
    const out = [];
    for (const q of qs) {
      const s = Math.max(0, q.x - q.a / 2), t = Math.min(Lc, q.x + q.a / 2);
      if (t <= s) continue;
      let k = 1;
      if (beta && d > 0) { const av = Math.max(0.5 * d, Math.min(q.x, Lc - q.x)); if (av < 2 * d) k = av / (2 * d); }
      out.push({ s, t, w: k * q.P / q.a });
    }
    return out;
  };
  const RA = ps => ps.reduce((S, p) => S + p.w * (p.t - p.s) * (Lc - (p.s + p.t) / 2) / Lc, 0), tot = ps => ps.reduce((S, p) => S + p.w * (p.t - p.s), 0);
  const gauche = (ps, x) => ps.reduce((S, p) => S + p.w * Math.max(0, Math.min(x, p.t) - p.s), 0);
  let Mmax = 0, Vmax = 0, xM = Lc / 2;
  const xd = Math.min(d, Lc / 2);
  for (let u = -2; u <= Lc + 2 + 1e-9; u += pas) {
    const ps = parties(convoi(u), false);
    if (ps.length) {
      const ra = RA(ps);
      for (let k = 1; k < n; k++) {
        const x = Lc * k / n;
        let M = ra * x;
        for (const p of ps) if (x >= p.t) M -= p.w * (p.t - p.s) * (x - (p.s + p.t) / 2); else if (x > p.s) M -= p.w * (x - p.s) ** 2 / 2;
        if (M > Mmax) { Mmax = M; xM = x; }
      }
    }
    const pv = parties(convoiV(u), true);
    if (pv.length) { const ra = RA(pv), rb = tot(pv) - ra; Vmax = Math.max(Vmax, ra - gauche(pv, xd), rb - (tot(pv) - gauche(pv, Lc - xd))); }
  }
  return { M: Mmax, V: Vmax, xM };
}

/**
 * Intensité linéique transversale d'essieux (voies adjacentes comprises) [kN/m par m] : roues de largeur diffusée t ; une
 * charge ou un groupe de charges de largeur t_g se répartit sur b = t_g + Δb ; les charges dont les largeurs efficaces se
 * recouvrent sont regroupées en une seule charge de largeur t_g = (y_max − y_min) + t (règle des charges voisines du
 * DAfStb Heft 240) ; largeurs tronquées aux bords de la dalle [0 ; B]. Maximum sur la position transversale des voies.
 */
export function intensite(B, roues, t, db, offFixe = null) {
  let best = 0;
  const span = roues.reduce((m, r) => Math.max(m, r.y), 0);
  for (let off = offFixe ?? 0; off <= (offFixe ?? Math.max(0, B - span - 0.5)) + 1e-9; off += 0.25) {
    let G = roues.map(r => ({ y0: off + r.y, y1: off + r.y, F: r.F })).sort((p, q) => p.y0 - q.y0);
    const bande = g => [Math.max(0, g.y0 - (t + db) / 2), Math.min(B, g.y1 + (t + db) / 2)];
    for (let fusion = true; fusion;) {
      fusion = false;
      for (let k = 0; k + 1 < G.length; k++) if (bande(G[k])[1] > bande(G[k + 1])[0] + 1e-9) { G[k] = { y0: G[k].y0, y1: G[k + 1].y1, F: G[k].F + G[k + 1].F }; G.splice(k + 1, 1); fusion = true; break; }
    }
    for (const g of G) { const [y0, y1] = bande(g); best = Math.max(best, g.F / Math.max(0.1, y1 - y0)); }
  }
  return best;
}

/**
 * Calcul de la dalle de transition par mètre de largeur. Entrées : L, e, B (largeur) [m], couverture au droit du garde-grève
 * hc0 [m], pente, matériaux { fck, fyk }, enrobages cSup / cInf [m], α_Q1..3, α_q1. Efforts en kN et kN·m par mètre.
 * Largeur efficace d'une charge de largeur diffusée t à l'abscisse x : b_m = t + 2,5 x (1 − x/L_c) pour le moment (DAfStb
 * Heft 240, dalle sur deux appuis), b_v = t + 2x pour l'effort tranchant (diffusion à 45° de part et d'autre jusqu'à l'appui) ; charges voisines
 * regroupées (voir intensite).
 */
export function calculDalleTransition({ L, e = 0.30, B = 8, hc0 = 0.30, pente = 0.05, fck = 30, fyk = 500, cSup = 0.05, cInf = 0.07, aQ = [1, 1, 1], aq1 = 1, gamma = 20, wk = 0.3 }) {
  const Lc = Math.max(1, L - 0.30), x0 = 0.15;                                  // x : depuis l'appui côté corbeau
  const hcov = x => hc0 + pente * (x0 + x), hm = hc0 + pente * L / 2;
  const g = 25 * e + gamma * hm, Mg = g * Lc ** 2 / 8;
  const diff = x => 2 * (Math.max(0, hcov(x)) + e / 2);
  const xc = x => Math.min(Lc, Math.max(0, x)), bm = x => 2.5 * xc(x) * (1 - xc(x) / Lc), bv = x => 2 * Math.min(xc(x), Lc - xc(x));   // Δb
  // LM1 : tandems des voies de 3 m (300, 200, 100 kN × α_Qi, roues 0,40 × 0,40 à 2,00 m, essieux à 1,20 m) + UDL 9 α_q1 kN/m²
  const nv = Math.max(1, Math.min(3, Math.floor(B / 3 + 1e-9)));
  const rouesTS = []; for (let j = 0; j < nv; j++) { const Q = [300, 200, 100][j] * (aQ[j] ?? 1); rouesTS.push({ y: 3 * j + 0.5, F: Q / 2 }, { y: 3 * j + 2.5, F: Q / 2 }); }
  const memo = new Map(), r2 = v => Math.round(v * 50) / 50;
  const I = (roues, t, db) => { const k = `${roues.length}:${r2(t)}:${r2(db)}`; if (!memo.has(k)) memo.set(k, intensite(B, roues, r2(t), r2(db))); return memo.get(k); };
  const convoiTS = bf => u => [0, 1.2].map(dx => { const x = u + dx, t = 0.40 + diff(x); return { x, a: t, P: I(rouesTS, t, bf(x)) }; });
  const TS = enveloppeConvoi(Lc, convoiTS(bm), { d: e - cInf - 0.008, convoiV: convoiTS(bv) });
  const qU = 9 * aq1, MU = qU * Lc ** 2 / 8;
  // LM2 : essieu unique β_Q·400 kN (β_Q = α_Q1), roues 0,35 (sens de circulation) × 0,60 à 2,00 m
  const Q2 = 400 * (aQ[0] ?? 1), roues2 = [{ y: 0.3, F: Q2 / 2 }, { y: 2.3, F: Q2 / 2 }];
  const convoi2 = bf => u => { const t = 0.60 + diff(u); return [{ x: u, a: 0.35 + diff(u), P: I(roues2, t, bf(u)) }]; };
  const dd = e - cInf - 0.008, LM2 = enveloppeConvoi(Lc, convoi2(bm), { d: dd, convoiV: convoi2(bv) });
  const Vg = g * (Lc / 2 - dd), VU = qU * (Lc / 2 - dd);
  const MQ = Math.max(TS.M + MU, LM2.M), VQ = Math.max(TS.V + VU, LM2.V), gouv = TS.M + MU >= LM2.M ? 'LM1' : 'LM2';
  const Mu = 1.35 * (Mg + MQ), Ms = Mg + MQ, Mqp = Mg, Vu = 1.35 * (Vg + VQ);
  // section : lit inférieur principal (extérieur), d = e − c_inf − φ/2 ; itération sur le diamètre
  const mat = { ...materialsEC2({ fck, fyk }) };
  let phi = 16, res = null;
  for (let it = 0; it < 4; it++) {
    const d = e - cInf - phi / 2000;
    const elu = flexureULS(Mu / 1000, { b: 1, d }, mat), els = flexureSLS(Ms / 1000, { b: 1, d }, mat);
    const fis = asForCrackWidth(Mqp / 1000, { b: 1, h: e, d }, mat, { wkMax: wk, phi: phi / 1000, c: cInf });
    const mins = minimumSteel({ b: 1, h: e, d }, mat);
    const As = Math.max(elu.As, els.As, fis, mins.asMin);
    const ch = chooseBars(As, { phiMin: 12, phiMax: 25, sMax: 0.20, sMin: 0.10 });
    res = { d, elu, els, fis, mins, As, ch };
    if (ch.phi === phi) break;
    phi = ch.phi;
  }
  const { d, ch } = res;
  const rep = chooseBars(Math.max(0.2 * ch.As, res.mins.perFace), { phiMin: 10, phiMax: 20, sMax: 0.25, sMin: 0.10 });
  const sup = chooseBars(res.mins.perFace, { phiMin: 10, phiMax: 12, sMax: 0.20, sMin: 0.20 });
  const vrd = shearVRdc({ b: 1, d, As: ch.As }, mat), VRdc = vrd.VRdc * 1000;
  // réaction d'appui sur le corbeau (charges sans réduction β, largeur b_v)
  const R = enveloppeConvoi(Lc, convoiTS(bv), { d: 0 }).V + qU * Lc / 2, R2 = enveloppeConvoi(Lc, convoi2(bv), { d: 0 }).V;
  const RG = g * Lc / 2, RQ = Math.max(R, R2);
  return {
    L, Lc, e, B, hc0, pente, hm, gamma, g, fck, fyk, cSup, cInf, nv,
    M: { G: Mg, TS: TS.M, UDL: MU, LM2: LM2.M, Q: MQ, ELU: Mu, ELS: Ms, QP: Mqp }, V: { G: Vg, Q: VQ, ELU: Vu }, gouverne: gouv,
    corbeau: { G: RG, Q: RQ, ELU: 1.35 * (RG + RQ) },
    d, As: { ELU: res.elu.As, ELS: res.els.As, fissuration: res.fis, min: res.mins.asMin, requis: res.As },
    inf: ch, rep, sup, VRdc, okV: Vu <= VRdc + 1e-9, okAs: !ch.insufficient && ch.As + 1e-12 >= res.As, sigS: res.els.sigS,
  };
}


/**
 * Épaisseur de la dalle de transition : 0,30 m (guide Sétra 1984), portée par pas de 5 cm jusqu'à 0,45 m tant que la
 * flexion (aciers ≤ HA25 e = 0,10) ou l'effort tranchant sans armatures ne sont pas vérifiés. Renvoie { e, K }.
 */
const CACHE = new Map();
export function epaisseurDalleTransition(o) {
  const cle = JSON.stringify(o);
  if (CACHE.has(cle)) return CACHE.get(cle);
  let K = null, res = null;
  for (const e of [0.30, 0.35, 0.40, 0.45]) { K = calculDalleTransition({ ...o, e }); if (K.okV && K.okAs) { res = { e, K }; break; } }
  res = res || { e: 0.45, K };
  if (CACHE.size > 200) CACHE.clear();
  CACHE.set(cle, res);
  return res;
}
