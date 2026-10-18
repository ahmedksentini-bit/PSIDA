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
 * Unités : m, kN, kN·m, m⁴.
 */
import { SlabDeck } from '../analysis.js';
import { EC_ALPHA } from '../loads_ec.js';

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
    const deck = new SlabDeck({ spans: [L], width, h: sec.H || g.hd, area: n * sec.A + (g.extraArea || 0), roadway: g.roadway, footways: g.footways || [],
      lines: g.lines || [], bands: g.bands || [], ys, Leq: [gp.Lguyon], alphaTorsion: gp.alpha, nu: 0, laneStep: g.laneStep || 0.25, nSec: 20, nGrid: 100, gammaC: g.gammaC || 25 });
    const perm = deck.permanent();
    const f61 = deck.fascicule61({ nRetenue: g.nRetenue ?? 2, classe: g.classe ?? null, mil: g.mil || 'Mc120' });
    const ec = deck.eurocode({ alpha: EC_ALPHA[g.alphaEC || 'recommended'] });
    bySpan.set(L, { L, gp, deck, perm, f61, ec, beams: perBeam(deck, perm, f61, ec, b1, n) });
  }
  return { sec, n, b1, width, ys, spans: g.spans, spansU, bySpan };
}

/**
 * Efforts par poutre : M_k = m_x(y_k) b₁ (enveloppes), V_k et R_k = V et R du tablier × coefficient de la poutre
 * η_k = M_k/(M/n) à mi-travée (pratique PAP : mêmes coefficients de répartition pour M et V).
 */
function perBeam(deck, perm, f61, ec, b1, n) {
  const secs = deck.beam.sections, mid = deck.beam.sectionIndex(0, 0.5);
  const cases = { G: perm, A: f61.A, Bc: f61.Bc, Bt: f61.Bt, Mc120: f61.Mc120, D240: f61.D240, trott: f61.trottoir, TS: ec.TS, UDL: ec.UDL, LM1: ec.LM1, gr1a: ec.gr1a, gr1b: ec.gr1b };
  return Array.from({ length: n }, (_, k) => {
    const out = { k, y: deck.ys[k], x: secs.map(s => s.x) };
    for (const [id, r] of Object.entries(cases)) {
      if (!r) continue;
      const mxMax = r.mxMax || r.mx, mxMin = r.mxMin || r.mx;
      const Mmax = secs.map((_, s) => mxMax[s][k] * b1), Mmin = secs.map((_, s) => mxMin[s][k] * b1);
      const Mt = (r.Mmax || r.M)[mid];
      const eta = Mt ? Mmax[mid] / (Mt / n) : 1;
      const Vmax = r.Vmax ? r.Vmax.map(v => v * eta / n) : (r.Vm ? r.Vm.map(v => v * eta / n) : null);
      const Vmin = r.Vmin ? r.Vmin.map(v => v * eta / n) : null;
      out[id] = { Mmax, Mmin, eta, Vmax, Vmin, Rmax: (r.Rmax || r.R).map(v => v * eta / n) };
    }
    return out;
  });
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
