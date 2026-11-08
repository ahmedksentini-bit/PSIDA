/**
 * Dalle de transition d'une culée — calcul par mètre de largeur (EN 1991-2, EN 1992-1-1) et choix de l'épaisseur.
 * Voir src/plans/dalle_transition.js pour le plan de ferraillage.
 */
import { materialsEC2, flexureULS, flexureSLS, asForCrackWidth, minimumSteel, shearVRdc } from '../section_ec2.js';
import { chooseBars } from '../rebar.js';
import { PlaqueEF } from '../plate/fe.js';

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
export function intensite(B, roues, t, db, offFixe = null, y0 = 0, wc = B) {
  let best = 0;
  const span = roues.reduce((m, r) => Math.max(m, r.y), 0);
  for (let off = offFixe ?? y0; off <= (offFixe ?? y0 + Math.max(0, wc - span - 0.5)) + 1e-9; off += 0.25) {
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
export function calculDalleTransition({ L, e = 0.30, B = 8, hc0 = 0.30, pente = 0.05, fck = 30, fyk = 500, cSup = 0.05, cInf = 0.07, aQ = [1, 1, 1], aq1 = 1, gamma = 20, wk = 0.3, plaque = null, w = null }) {
  const Lc = Math.max(1, L - 0.30), x0 = 0.15;                                  // x : depuis l'appui côté corbeau
  const hcov = x => hc0 + pente * (x0 + x), hm = hc0 + pente * L / 2;
  const g = 25 * e + gamma * hm, Mg = g * Lc ** 2 / 8;
  const diff = x => 2 * (Math.max(0, hcov(x)) + e / 2);
  const xc = x => Math.min(Lc, Math.max(0, x)), bm = x => 2.5 * xc(x) * (1 - xc(x) / Lc), bv = x => 2 * Math.min(xc(x), Lc - xc(x));   // Δb
  // LM1 : tandems des voies de 3 m (300, 200, 100 kN × α_Qi, roues 0,40 × 0,40 à 2,00 m, essieux à 1,20 m) + UDL 9 α_q1 kN/m²
  const wc = Math.min(B, w > 0 ? w : B), y0 = (B - wc) / 2;
  const nv = Math.max(1, Math.min(3, Math.floor(wc / 3 + 1e-9)));
  const rouesTS = []; for (let j = 0; j < nv; j++) { const Q = [300, 200, 100][j] * (aQ[j] ?? 1); rouesTS.push({ y: 3 * j + 0.5, F: Q / 2 }, { y: 3 * j + 2.5, F: Q / 2 }); }
  const memo = new Map(), r2 = v => Math.round(v * 50) / 50;
  const I = (roues, t, db) => { const k = `${roues.length}:${r2(t)}:${r2(db)}`; if (!memo.has(k)) memo.set(k, intensite(B, roues, r2(t), r2(db), null, y0, wc)); return memo.get(k); };
  const convoiTS = bf => u => [0, 1.2].map(dx => { const x = u + dx, t = 0.40 + diff(x); return { x, a: t, P: I(rouesTS, t, bf(x)) }; });
  const TS = enveloppeConvoi(Lc, convoiTS(bm), { d: e - cInf - 0.008, convoiV: convoiTS(bv) });
  const qU = 9 * aq1, MU = qU * Lc ** 2 / 8;
  // LM2 : essieu unique β_Q·400 kN (β_Q = α_Q1), roues 0,35 (sens de circulation) × 0,60 à 2,00 m
  const Q2 = 400 * (aQ[0] ?? 1), roues2 = [{ y: 0.3, F: Q2 / 2 }, { y: 2.3, F: Q2 / 2 }];
  const convoi2 = bf => u => { const t = 0.60 + diff(u); return [{ x: u, a: 0.35 + diff(u), P: I(roues2, t, bf(u)) }]; };
  const dd = e - cInf - 0.008, LM2 = enveloppeConvoi(Lc, convoi2(bm), { d: dd, convoiV: convoi2(bv) });
  const Vg = g * (Lc / 2 - dd), VU = qU * (Lc / 2 - dd);
  // moment de trafic : méthode des bandes, ou plaque si elle donne davantage (bords libres, voies adjacentes)
  const MQb = Math.max(TS.M + MU, LM2.M), MQp = plaque ? plaque.mxMax.Q : 0;
  const MQ = Math.max(MQb, MQp), VQ = Math.max(TS.V + VU, LM2.V), gouv = MQp > MQb ? 'plaque' : TS.M + MU >= LM2.M ? 'LM1' : 'LM2';
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
  const sup = chooseBars(res.mins.perFace, { phiMin: 10, phiMax: 12, sMax: 0.20, sMin: 0.20 });
  // aciers parallèles au garde-grève : calcul de plaque (Wood-Armer) s'il est fourni, sinon 20 % des principaux
  const T = plaque ? aciersTransversaux(plaque, { e, cInf, cSup, phiL: ch.phi, phiS: sup.phi, fck, fyk, AsPrincipal: ch.As, wk }) : null;
  const rep = T ? T.inf.choix : chooseBars(Math.max(0.2 * ch.As, res.mins.perFace), { phiMin: 10, phiMax: 20, sMax: 0.25, sMin: 0.10 });
  const supT = T ? T.sup.choix : sup;
  const vrd = shearVRdc({ b: 1, d, As: ch.As }, mat), VRdc = vrd.VRdc * 1000;
  // réaction d'appui sur le corbeau (charges sans réduction β, largeur b_v)
  const R = enveloppeConvoi(Lc, convoiTS(bv), { d: 0 }).V + qU * Lc / 2, R2 = enveloppeConvoi(Lc, convoi2(bv), { d: 0 }).V;
  const RG = g * Lc / 2, RQ = Math.max(R, R2);
  return {
    L, Lc, e, B, w: wc, hc0, pente, hm, gamma, g, fck, fyk, cSup, cInf, nv,
    M: { G: Mg, TS: TS.M, UDL: MU, LM2: LM2.M, bandes: MQb, plaque: plaque ? MQp : null, Q: MQ, ELU: Mu, ELS: Ms, QP: Mqp }, V: { G: Vg, Q: VQ, ELU: Vu }, gouverne: gouv,
    transv: T ? { inf: { ...T.inf, M: plaque.inf, pos: plaque.posInf }, sup: { ...T.sup, M: plaque.sup, pos: plaque.posSup } } : null, supT,
    corbeau: { G: RG, Q: RQ, ELU: 1.35 * (RG + RQ) },
    // aciers comprimés (au-delà du moment limite du béton, ELU ou ELS) : non admis pour la dalle de transition → épaissir
    d, As: { ELU: res.elu.As, ELS: res.els.As, fissuration: res.fis, min: res.mins.asMin, requis: res.As, comprimes: Math.max(res.elu.As2 || 0, res.els.As2 || 0) },
    inf: ch, rep, sup, VRdc, okV: Vu <= VRdc + 1e-9, okAs: !ch.insufficient && ch.As + 1e-12 >= res.As && !(Math.max(res.elu.As2 || 0, res.els.As2 || 0) > 1e-9), sigS: res.els.sigS,
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
  for (const e of [0.30, 0.35, 0.40, 0.45]) {
    const plaque = o.plaque === false ? null : plaqueDalleTransition({ L: o.L, e, B: o.B, psi: o.psi ?? 100, hc0: o.hc0, pente: o.pente, aQ: o.aQ, aq1: o.aq1, w: o.w ?? null });
    K = calculDalleTransition({ ...o, e, plaque }); if (K.okV && K.okAs) { res = { e, K }; break; }
  }
  res = res || { e: 0.45, K };
  if (CACHE.size > 200) CACHE.clear();
  CACHE.set(cle, res);
  return res;
}

/**
 * Corbeau d'appui de la dalle de transition, console courte (EN 1992-1-1 annexe J.3, bielle et tirant) par mètre :
 * charge F_Ed (réaction ELU de la dalle) à a_c du nu du garde-grève, effort horizontal H_Ed ≥ 0,2 F_Ed (§ 10.9.4.7,
 * frottement et freinage transmis par les goujons), bras de levier z₀ = 0,8 d ;
 * tirant A_s = (F_Ed a_c / z₀ + H_Ed) / f_yd ; a_c ≤ 0,5 h_c → cadres horizontaux fermés ≥ 0,5 A_s (J.3(3)) ;
 * bielle : σ = F_Ed / (b_bielle sin θ) ≤ ν' f_cd, ν' = 1 − f_ck/250, largeur de bielle 0,2 d (à défaut d'appui défini).
 * Unités : kN, m ; A_s en m²/m.
 */
export function corbeauDalle({ FEd, ac = 0.15, hc = 0.40, c = 0.05, phi = 12, fck = 30, fyk = 500 }) {
  const d = hc - c - phi / 2000, z0 = 0.8 * d, fyd = fyk / 1.15, fcd = fck / 1.5;
  const HEd = 0.2 * FEd, Ft = FEd * ac / z0 + HEd, As = Ft / (fyd * 1000);
  const lien = ac <= 0.5 * hc ? 0.5 * As : 0.25 * As;
  const theta = Math.atan2(z0, ac), sig = FEd / (0.2 * d * Math.sin(theta)) / 1000, sigRd = (1 - fck / 250) * fcd;
  return { FEd, HEd, ac, hc, d, z0, Ft, As, lien, theta: theta * 180 / Math.PI, sig, sigRd, ok: sig <= sigRd + 1e-9 };
}

/**
 * Moments transversaux de la dalle de transition par un calcul de plaque (éléments DKT de src/plate/fe.js) :
 * plaque de L_c × B (parallélogramme si biais ψ, appuis linéaires rigides sur les deux bords parallèles au garde-grève,
 * bords longitudinaux libres), surfaces d'influence (K symétrique : réponse = zᵀF avec K z = c) de m_x, m_y et m_xy en
 * des points de la ligne médiane et d'une ligne à L_c/4 ; roues diffusées à 1/1 jusqu'au feuillet moyen, voies TS
 * déplacées en long et en travers, essieu LM2, UDL 9 α_q1 sur toute la dalle (majorant). Aciers dans le repère
 * (axe, parallèle au garde-grève) : Wood-Armer m_y + |m_xy| (nappe inférieure) et m_y − |m_xy| (nappe supérieure).
 * Renvoie les enveloppes caractéristiques et ELU [kN·m/m] et m_x maximal (contrôle de la méthode des bandes).
 */
const CACHE_PL = new Map();
export function plaqueDalleTransition(o) {
  const cle = JSON.stringify(o);
  if (CACHE_PL.has(cle)) return CACHE_PL.get(cle);
  const r = plaqueCalc(o);
  if (CACHE_PL.size > 50) CACHE_PL.clear();
  CACHE_PL.set(cle, r);
  return r;
}
function plaqueCalc({ L, e = 0.30, B = 8, psi = 100, hc0 = 0.30, pente = 0.05, aQ = [1, 1, 1], aq1 = 1, gamma = 20, h: pas = 0.25, nu = 0.2, E = 30000, w = null }) {
  // chaussée de largeur w centrée sur la dalle (voies et roues confinées à la chaussée) ; à défaut, toute la largeur
  const wc = Math.min(B, w > 0 ? w : B), y0 = (B - wc) / 2;
  const Lc = Math.max(1, L - 0.30), x0 = 0.15, D = E * 1000 * e ** 3 / (12 * (1 - nu * nu));
  const nX = Math.max(6, Math.ceil(Lc / pas)), nY = Math.max(8, Math.ceil(B / pas));
  const xs = Array.from({ length: nX + 1 }, (_, k) => Lc * k / nX), ys = Array.from({ length: nY + 1 }, (_, k) => B * k / nY);
  const appuis = [];
  for (const i of [0, nX]) for (const y of ys) appuis.push({ x: xs[i] + y * (Math.abs(psi - 100) < 1e-9 ? 0 : 1 / Math.tan(psi * Math.PI / 200)), y, k: Infinity });
  const P = new PlaqueEF({ xs, ys, D, nu, appuis, psi, ordre: 'court' });
  // cibles : ligne médiane (s = L_c/2) et quart de portée, en travers tous les ~0,5 m (bords exclus pour m_y)
  const iM = P.plusProche(xs, Lc / 2), iQ = P.plusProche(xs, Lc / 4), pasJ = Math.max(1, Math.round(0.5 / (B / nY)));
  const cibles = [];
  for (const i of [iM, iQ]) for (let j = 0; j <= nY; j += pasJ) cibles.push({ i, j });
  const infl = cibles.map(t => ({ ...t, mx: P.K.solve(P.vecteurGrandeur(t.i, t.j, 'mx')), my: P.K.solve(P.vecteurGrandeur(t.i, t.j, 'my')), mxy: P.K.solve(P.vecteurGrandeur(t.i, t.j, 'mxy')) }));
  const dot = (z, F) => { let s = 0; for (let p = 0; p < F.length; p++) if (F[p]) s += z[3 * p] * F[p]; return s; };
  const diff = s => 2 * (Math.max(0, hc0 + pente * (x0 + s)) + e / 2);
  // charges permanentes et UDL
  const hm = hc0 + pente * L / 2, g = 25 * e + gamma * hm;
  const FG = P.chargeRectangle(P.vecteur(), { x1: 0, x2: Lc, y1: 0, y2: B, q: g }), FU = P.chargeRectangle(P.vecteur(), { x1: 0, x2: Lc, y1: 0, y2: B, q: 9 * aq1 });
  const val = (F, t) => ({ mx: dot(t.mx, F), my: dot(t.my, F), mxy: dot(t.mxy, F) });
  const G = infl.map(t => val(FG, t)), U = infl.map(t => val(FU, t));
  // trafic : enveloppe de m_y + |m_xy| (inférieure) et m_y − |m_xy| (supérieure) ; m_x maximal
  const nv = Math.max(1, Math.min(3, Math.floor(wc / 3 + 1e-9)));
  const roues = (Q, l, w, yl) => [yl, yl + 2.0].map(y => ({ Q: Q / 2, l, w, y }));
  const env = infl.map(() => ({ inf: 0, sup: 0, mx: 0 })), envL2 = infl.map(() => ({ inf: 0, sup: 0, mx: 0 }));
  const F = P.vecteur();
  const poser = (lst, s) => { F.fill(0); for (const r of lst) { const t = r.l + diff(s), tw = r.w + diff(s); P.chargeRectangle(F, { x1: s - t / 2, x2: s + t / 2, y1: r.y - tw / 2, y2: r.y + tw / 2, q: r.Q / (t * tw) }); } };
  const cumul = (E2, base) => infl.forEach((t, k) => { const v = val(F, t), my = v.my, mxy = v.mxy; E2[k].inf = Math.max(E2[k].inf, my + Math.abs(mxy) * Math.sign(my + 1e-12)); E2[k].sup = Math.min(E2[k].sup, my - Math.abs(mxy)); E2[k].mx = Math.max(E2[k].mx, v.mx); void base; });
  const dy = 0.5, ds = Math.max(0.15, Lc / 16);
  for (const miroir of [false, true]) for (let off = y0; off <= y0 + Math.max(0, wc - 3 * nv) + 1e-9; off += dy) {
    const lst0 = []; for (let j = 0; j < nv; j++) lst0.push(...roues([300, 200, 100][j] * (aQ[j] ?? 1), 0.40, 0.40, off + 3 * (miroir ? nv - 1 - j : j) + 0.5));
    for (let s = -0.6; s <= Lc + 0.6 + 1e-9; s += ds) {
      const lst = []; for (const r of lst0) lst.push({ ...r, l: 0.40, s: s - 0.6 }, { ...r, l: 0.40, s: s + 0.6 });
      F.fill(0); for (const r of lst) { const t = r.l + diff(r.s), tw = r.w + diff(r.s); P.chargeRectangle(F, { x1: r.s - t / 2, x2: r.s + t / 2, y1: r.y - tw / 2, y2: r.y + tw / 2, q: r.Q / (t * tw) }); }
      cumul(env);
    }
  }
  for (let off = y0; off <= y0 + Math.max(0, wc - 2.6) + 1e-9; off += dy) for (let s = 0; s <= Lc + 1e-9; s += ds) { poser(roues(400 * (aQ[0] ?? 1), 0.35, 0.60, off + 0.3), s); cumul(envL2); }
  const res = infl.map((t, k) => {
    const g0 = G[k], u0 = U[k], wa = (m) => m;
    const qInf = Math.max(env[k].inf + Math.max(0, u0.my + Math.abs(u0.mxy)), envL2[k].inf), qSup = Math.min(env[k].sup + Math.min(0, u0.my - Math.abs(u0.mxy)), envL2[k].sup);
    const gInf = g0.my + Math.abs(g0.mxy), gSup = g0.my - Math.abs(g0.mxy);
    return { s: xs[t.i], y: ys[t.j], bord: t.j === 0 || t.j === nY, G: g0, inf: { G: wa(gInf), Q: qInf, ELU: 1.35 * (gInf + qInf), ELS: gInf + qInf }, sup: { G: gSup, Q: qSup, ELU: 1.35 * (gSup + qSup), ELS: gSup + qSup }, mx: { G: g0.mx, Q: Math.max(env[k].mx + u0.mx, envL2[k].mx) } };
  });
  const maxi = f => res.reduce((b, r) => (f(r) > f(b) ? r : b), res[0]);
  const rI = maxi(r => r.inf.ELU), rS = maxi(r => -r.sup.ELU), rX = maxi(r => r.mx.G + r.mx.Q);
  return { Lc, B, psi, nX, nY, g, res, w: wc, nv, inf: rI.inf, sup: rS.sup, posInf: { s: rI.s, y: rI.y }, posSup: { s: rS.s, y: rS.y }, mxMax: { G: rX.mx.G, Q: rX.mx.Q, ELU: 1.35 * (rX.mx.G + rX.mx.Q) } };
}

/** Aciers transversaux (// garde-grève) déduits du calcul de plaque, par mètre ; min. 20 % des principaux et minimum. */
export function aciersTransversaux(Pl, { e, cInf = 0.07, cSup = 0.05, phiL = 20, phiS = 10, fck = 30, fyk = 500, AsPrincipal, wk = 0.3 }) {
  const mat = { ...materialsEC2({ fck, fyk }) };
  const face = (MuK, MsK, c, phiExt) => {
    const d = e - c - phiExt / 1000 - 0.006;
    const elu = flexureULS(Math.max(0, MuK) / 1000, { b: 1, d }, mat), els = flexureSLS(Math.max(0, MsK) / 1000, { b: 1, d }, mat), mins = minimumSteel({ b: 1, h: e, d }, mat);
    return { d, ELU: elu.As, ELS: els.As, min: mins.perFace };
  };
  const I = face(Pl.inf.ELU, Pl.inf.ELS, cInf, phiL), S = face(-Pl.sup.ELU, -Pl.sup.ELS, cSup, phiS);
  const reqI = Math.max(I.ELU, I.ELS, 0.2 * AsPrincipal, I.min), reqS = Math.max(S.ELU, S.ELS, S.min);
  return { inf: { ...I, requis: reqI, choix: chooseBars(reqI, { phiMin: 10, phiMax: 20, sMax: 0.25, sMin: 0.10 }) }, sup: { ...S, requis: reqS, choix: chooseBars(reqS, { phiMin: 10, phiMax: 16, sMax: 0.20, sMin: 0.10 }) } };
}
