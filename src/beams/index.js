/**
 * Ponts à poutres (VIPP, PRAD, poutres BA sous chaussée) à travées indépendantes : répartition transversale de
 * Guyon-Massonnet du réseau poutres + hourdis (paramètres θ et α, interpolation de Massonnet en √α comme PONTYPE/PAP),
 * charges Eurocodes et Fascicule 61 placées transversalement comme pour les ponts-dalles, efforts par poutre.
 *
 * Méthode (SETRA, programme PONTYPE/PAP ; Guyon 1946, Massonnet 1950) : grillage de n poutres d'entraxe b₁ (largeur active
 * 2b = n b₁), rigidités par unité de largeur ρ_p = E I_p/b₁, γ_p = G K_p/b₁ (poutres + hourdis), ρ_e = E I_e/ℓ₁,
 * γ_e = G K_e/ℓ₁ (hourdis seul : I = h_d³/12, K = h_d³/6 par m ; ou entretoises), G = E/2 :
 *   θ = (b/L)(ρ_p/ρ_e)^¼,  α = (γ_p + γ_e)/(2√(ρ_p ρ_e)).
 * Le moment d'une poutre k vaut M_k = m_x(y_k)·b₁ = K̄(y_k)·M/n (y_k axe de la poutre) ; la dalle orthotrope de Guyon est
 * résolue par le modèle de dalle (SlabDeck) avec la portée « de Guyon » L/(ρ_p/ρ_e)^¼ (qui donne le θ voulu) et α.
 * Effort tranchant et réactions par poutre : coefficients de Guyon-Massonnet de la mi-travée (pratique PAP). Poutres de rive :
 * à l'appui, la charge en console (corniche, dispositif de retenue, trottoir) descend directement dans la poutre de rive, et
 * le coefficient de mi-travée peut la sous-estimer. Hypothèse prudente de PSIDA pour les poutres de rive : à l'appui
 * (réactions et V en x = 0), le plus grand des coefficients de Guyon-Massonnet et de la règle des bras de levier (hourdis
 * articulé sur les poutres, mêmes placements transversaux des charges), raccordé linéairement à Guyon-Massonnet sur une
 * longueur égale à la largeur du tablier 2b (≤ L/2). Poutres intérieures : Guyon-Massonnet (la règle des bras de levier y
 * serait très pénalisante ; les facteurs de répartition de l'effort tranchant calés par éléments finis, AASHTO LRFD
 * § 4.6.2.2.3, restent voisins de ceux du moment ; la même pratique retient la règle des bras de levier pour la rive).
 * Les moments restent ceux de Guyon-Massonnet.
 * Unités : m, kN, kN·m, m⁴.
 */
import { SlabDeck } from '../analysis.js';
import { EC_ALPHA } from '../loads_ec.js';

/**
 * Tablier « règle des bras de levier » : même modèle de charges que SlabDeck, mais K̄(y_k) = n w_k(e), w_k part de la charge
 * placée en e reprise par la poutre k quand le hourdis est articulé sur les poutres (répartition linéaire entre les deux
 * poutres voisines, console au-delà des poutres de rive). Les y du tablier doivent être les axes des poutres.
 */
class TablierLevier extends SlabDeck {
  _w(e) {
    const ys = this.ys, n = ys.length, w = new Array(n).fill(0);
    if (n === 1) { w[0] = 1; return w; }
    let j = 0; while (j < n - 2 && e > ys[j + 1]) j++;
    const t = (e - ys[j]) / (ys[j + 1] - ys[j]);   // < 0 ou > 1 : console de rive (extrapolation linéaire)
    w[j] = 1 - t; w[j + 1] = t;
    return w;
  }
  Kbar(L, e1, e2) {
    const key = `L|${e1.toFixed(3)}|${e2.toFixed(3)}`;
    if (this._Kcache.has(key)) return this._Kcache.get(key);
    const n = this.ys.length, m = Math.abs(e2 - e1) < 1e-9 ? 1 : 40, acc = new Array(n).fill(0);
    for (let i = 0; i < m; i++) { const e = m === 1 ? e1 : e1 + (e2 - e1) * (i + 0.5) / m; this._w(e).forEach((v, k) => { acc[k] += v / m; }); }
    const vals = acc.map(v => n * v);
    this._Kcache.set(key, vals);
    return vals;
  }
}

/** Paramètres de Guyon-Massonnet d'un tablier à poutres (E disparaît des rapports). */
export function guyonParams({ n, b1, L, Ip, Kp, hd = 0.2, Ie = null, Ke = null, le = 1 }) {
  const rhoP = Ip / b1, gammaP = Kp / (2 * b1);
  const rhoE = Ie != null ? Ie / le : hd ** 3 / 12, gammaE = Ke != null ? Ke / (2 * le) : hd ** 3 / 12;
  const b = n * b1 / 2;
  return { b, rhoP, gammaP, rhoE, gammaE, theta: b / L * (rhoP / rhoE) ** 0.25, alpha: (gammaP + gammaE) / (2 * Math.sqrt(rhoP * rhoE)), Lguyon: L / (rhoP / rhoE) ** 0.25 };
}

/**
 * Coefficient de torsion d'un rectangle b × t (b ≥ t) : K = k b t³, k = ⅓ − 0,21 (t/b)(1 − (t/b)⁴/12) (Saint-Venant,
 * approximation de Roark) ; pour le hourdis (dalle) on retient ½ × ⅓ b h³ = b h³/6 (pratique SETRA).
 */
export const kTorsion = (b, t) => { const [B, T] = b >= t ? [b, t] : [t, b]; return (1 / 3 - 0.21 * (T / B) * (1 - (T / B) ** 4 / 12)) * B * T ** 3; };

/**
 * Caractéristiques d'une poutre en I ou en T avec son hourdis (rectangles empilés depuis le bas) :
 * parts [{ b, h }] du talon vers la table, hourdis { b: b₁, h: h_d } au-dessus. Renvoie A, v (fibre sup.), v' (inf.), I, K
 * (somme des k b t³ des parties de la poutre + b₁ h_d³/6 pour le hourdis).
 */
export function beamSection({ parts, hourdis = null }) {
  let z = 0, A = 0, S = 0;
  const all = [...parts, ...(hourdis ? [{ ...hourdis, isSlab: true }] : [])].map(p => { const r = { ...p, z0: z }; z += p.h; return r; });
  for (const p of all) { const a = p.b * p.h; A += a; S += a * (p.z0 + p.h / 2); }
  const zg = S / A, H = z;
  let I = 0, K = 0;
  for (const p of all) { I += p.b * p.h ** 3 / 12 + p.b * p.h * (p.z0 + p.h / 2 - zg) ** 2; K += p.isSlab ? p.b * p.h ** 3 / 6 : kTorsion(p.b, p.h); }
  return { A, I, K, H, v: H - zg, vp: zg };
}

/**
 * Tablier à poutres à travées indépendantes.
 * @param {object} g spans (travées isostatiques), n, b1, hd, beam { A (poutre + hourdis), I, K } ou parts, roadway { y1, y2 },
 *   footways [{ y1, y2 }], lines [{ g, e }] (superstructures, e peut dépasser b : corniches), bands [{ q, y1, y2 }],
 *   gammaC (25), nRetenue, classe, mil, alphaEC ('recommended'…), kmin/kmax des superstructures
 */
export function beamDeck(g) {
  const sec = g.beam.parts ? beamSection({ parts: g.beam.parts, hourdis: { b: g.b1, h: g.hd } }) : g.beam;
  const n = g.n, b1 = g.b1, width = n * b1, b = width / 2;
  const ys = Array.from({ length: n }, (_, k) => -b + b1 * (k + 0.5));
  const spansU = [...new Set(g.spans.map(L => +L.toFixed(3)))];
  const bySpan = new Map();
  for (const L of spansU) {
    const gp = guyonParams({ n, b1, L, Ip: sec.I, Kp: sec.K, hd: g.hd, Ie: g.Ie ?? null, Ke: g.Ke ?? null, le: g.le ?? 1 });
    const opts = { spans: [L], width, h: sec.H || g.hd, area: n * sec.A + (g.extraArea || 0), roadway: g.roadway, footways: g.footways || [],
      lines: g.lines || [], bands: g.bands || [], ys, Leq: [gp.Lguyon], alphaTorsion: gp.alpha, nu: 0, laneStep: g.laneStep || 0.25, nSec: 20, nGrid: 100, gammaC: g.gammaC || 25 };
    if (g.rail) {
      // pont à poutres sous rail : groupes ferroviaires (EN 1991-2 section 6) à la place du trafic routier ; bande de
      // répartition diffusée dans le ballast puis dans le hourdis jusqu'à son feuillet moyen (h_d)
      const chargesR = dk => ({ perm: dk.permanent(), rail: dk.ferroviaire({ ...g.rail, hDiffusion: g.hd }) });
      const deck = new SlabDeck(opts), { perm, rail } = chargesR(deck);
      const lev = n > 1 && g.levier !== false ? chargesR(new TablierLevier(opts)) : null;
      const cas = P => ({ G: P.perm, ...Object.fromEntries(P.rail.groupes.map(G => [G.id, G.res])) });
      bySpan.set(L, { L, gp, deck, perm, f61: null, ec: null, rail, beams: perBeamCases(deck, cas({ perm, rail }), lev ? cas(lev) : {}, b1, n) });
      continue;
    }
    const charges = dk => ({ perm: dk.permanent(), f61: dk.fascicule61({ nRetenue: g.nRetenue ?? 2, classe: g.classe ?? null, mil: g.mil || 'Mc120' }), ec: dk.eurocode({ alpha: EC_ALPHA[g.alphaEC || 'recommended'] }) });
    const deck = new SlabDeck(opts), { perm, f61, ec } = charges(deck);
    // règle des bras de levier (effort tranchant et réactions par poutre près des appuis) : inutile si n = 1
    const lev = n > 1 && g.levier !== false ? charges(new TablierLevier(opts)) : null;
    bySpan.set(L, { L, gp, deck, perm, f61, ec, beams: perBeam(deck, perm, f61, ec, b1, n, lev) });
  }
  return { sec, n, b1, width, ys, spans: g.spans, spansU, bySpan };
}

/**
 * Efforts par poutre : M_k = m_x(y_k) b₁ (enveloppes), V_k et R_k = V et R du tablier × coefficient de la poutre
 * η_k = M_k/(M/n) à mi-travée (pratique PAP : mêmes coefficients de répartition pour M et V).
 */
function perBeam(deck, perm, f61, ec, b1, n, lev = null) {
  const casesDe = (P, F, E) => ({ G: P, A: F.A, Bc: F.Bc, Bt: F.Bt, Mc120: F.Mc120, D240: F.D240, trott: F.trottoir, TS: E.TS, UDL: E.UDL, footway: E.footway, LM1: E.LM1, gr1a: E.gr1a, gr1b: E.gr1b });
  return perBeamCases(deck, casesDe(perm, f61, ec), lev ? casesDe(lev.perm, lev.f61, lev.ec) : {}, b1, n);
}

/** Efforts par poutre pour un ensemble de cas de charge { id: résultat du tablier } (routiers ou ferroviaires). */
function perBeamCases(deck, cases, casesL, b1, n) {
  const secs = deck.beam.sections, mid = deck.beam.sectionIndex(0, 0.5);
  const etaDe = (r, k) => { if (!r) return null; const mx = r.mxMax || r.mx, Mt = (r.Mmax || r.M)[mid]; return Mt ? mx[mid][k] * b1 / (Mt / n) : 1; };
  return Array.from({ length: n }, (_, k) => {
    const out = { k, y: deck.ys[k], x: secs.map(s => s.x) };
    for (const [id, r] of Object.entries(cases)) {
      if (!r) continue;
      const mxMax = r.mxMax || r.mx, mxMin = r.mxMin || r.mx;
      const Mmax = secs.map((_, s) => mxMax[s][k] * b1), Mmin = secs.map((_, s) => mxMin[s][k] * b1);
      const Mt = (r.Mmax || r.M)[mid];
      const eta = Mt ? Mmax[mid] / (Mt / n) : 1;
      // V et R : poutres de rive, à l'appui, max(Guyon-Massonnet ; bras de levier), raccordé à Guyon-Massonnet sur 2b (≤ L/2)
      const rive = k === 0 || k === n - 1, etaL = etaDe(casesL[id], k), etaV = rive ? Math.max(eta, etaL ?? -Infinity) : eta, L = deck.spans[0], Ltr = Math.min(2 * deck.b, L / 2);
      const etaX = x => eta + (etaV - eta) * Math.max(0, 1 - Math.min(x, L - x) / Ltr);
      const Vmax = r.Vmax ? r.Vmax.map((v, s) => v * etaX(secs[s].x) / n) : (r.Vm ? r.Vm.map((v, s) => v * etaX(secs[s].x) / n) : null);
      const Vmin = r.Vmin ? r.Vmin.map((v, s) => v * etaX(secs[s].x) / n) : null;
      out[id] = { Mmax, Mmin, eta, etaL, etaV, Vmax, Vmin, Rmax: (r.Rmax || r.R).map(v => v * etaV / n) };
    }
    return out;
  });
}

/**
 * Combinaisons ferroviaires par poutre (EN 1990 A2, tableaux A2.3 et A2.4(B) ; groupes du tableau 6.11 de l'EN 1991-2),
 * à chaque section, chaque groupe étant l'action variable dominante (seule action de trafic) :
 * ELU 1,35 G + max_g γ_g Q_g (γ = 1,45 ; 1,20 pour les groupes contenant SW/2) ; caractéristique G + max_g Q_g ;
 * fréquente G + max_g ψ₁,g Q_g ; quasi permanente G (ψ₂ = 0). Q_g : moments et efforts tranchants de la poutre sous le
 * groupe g, coefficient dynamique Φ inclus. Rend aussi les parts de trafic seules (Qcar, Qfreq, QeluM, QeluV) pour la
 * chaîne de précontrainte.
 */
export function beamCombinationsRail(bm, groupes) {
  const nS = bm.G.Mmax.length, z = () => new Array(nS).fill(0);
  const out = { ELS_car: z(), ELS_freq: z(), ELU: z(), Qcar: z(), Qfreq: z(), QeluM: z(), QeluV: z(), gov: [] };
  for (let i = 0; i < nS; i++) {
    let car = 0, freq = 0, elu = 0, vElu = 0, gov = null;
    for (const G of groupes) {
      const r = bm[G.id]; if (!r) continue;
      const M = r.Mmax[i], V = Math.max(Math.abs(r.Vmax?.[i] ?? 0), Math.abs(r.Vmin?.[i] ?? 0));
      car = Math.max(car, M); freq = Math.max(freq, G.psi1 * M);
      if (G.gamma * M > elu) { elu = G.gamma * M; gov = G.id; }
      vElu = Math.max(vElu, G.gamma * V);
    }
    const Gm = bm.G.Mmax[i];
    out.Qcar[i] = car; out.Qfreq[i] = freq; out.QeluM[i] = elu; out.QeluV[i] = vElu; out.gov[i] = gov;
    out.ELS_car[i] = Gm + car; out.ELS_freq[i] = Gm + freq; out.ELU[i] = 1.35 * Gm + elu;
  }
  return out;
}

/**
 * Combinaisons par poutre (moments, à chaque section) :
 * BAEL / Fascicule 61 : ELS G + max[1,2 (A ou B) ; Mc120 ; D240] + trottoirs (1,0 ou 1,2 avec A/B, comme PAP) ;
 * ELU 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 ou D240 + trottoirs)] ;
 * Eurocodes : ELU 1,35 G + 1,35 max(gr1a ; gr1b) ; ELS caractéristique G + max(gr1a ; gr1b).
 */
export function beamCombinations(bm) {
  const nS = bm.G.Mmax.length, z = () => new Array(nS).fill(0);
  const get = (id, i) => (bm[id] ? bm[id].Mmax[i] : 0);
  const out = { ELS_F61: z(), ELU_F61: z(), ELS_EC: z(), ELU_EC: z(), govF: [], govE: [] };
  for (let i = 0; i < nS; i++) {
    const G = bm.G.Mmax[i], tr = get('trott', i);
    const AB = Math.max(get('A', i), get('Bc', i), get('Bt', i)), MC = Math.max(get('Mc120', i), get('D240', i));
    out.ELS_F61[i] = G + Math.max(1.2 * (AB + tr), MC + tr);
    out.ELU_F61[i] = 1.35 * G + Math.max(1.605 * (AB + tr), 1.35 * (MC + tr));
    const Q = Math.max(get('gr1a', i), get('gr1b', i));
    out.ELS_EC[i] = G + Q; out.ELU_EC[i] = 1.35 * G + 1.35 * Q;
  }
  return out;
}
