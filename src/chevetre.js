/**
 * Lignes d'appui à appareils discrets : répartition de la réaction entre appareils et ferraillage des chevêtres
 * incorporés — annexe 4 du guide de calcul PSIDP-EL (SETRA, 1985), « Dimensionnement des appareils d'appui et
 * ferraillage des chevêtres incorporés » (règles établies à partir de Schleicher-Wegener, Hallbjörn et du programme MRB).
 *
 * Notations (§ 2) : B largeur de la dalle équivalente mesurée le long de la ligne d'appui, L demi-somme des portées des
 * travées adjacentes (adaptation aux culées : about + demi-portée de rive), appareils latéraux à c des bords libres,
 * entraxes a (latéraux) et e (centraux) ; α = a/B, λ = c/B, μ = e/B.
 *
 * Deux types de charges (§ 4) : type 1 (permanentes, précontrainte, trafic éloigné) réparties comme une charge uniforme
 * sur la dalle ; type 2 (trafic à moins de d de la ligne d'appui) réparties comme sur une poutre sur appuis simples :
 *   d = max[a + c ; (a + e)/2 ; min(B/2 ; L)]
 *   ζ_A = (d/L)(2 − d/L) ; ζ_CE = (d/X)(2 − d/L)/(2 − X/L) si X > d, 1 sinon (X demi-longueur de chenille) ;
 *   ζ_B = (1 − d/(2L))·P_d/S_q (P_d poids des essieux plaçables sur 2d, coefficients compris) ; ζ ≤ 1.
 * Unités : m, kN, kN·m.
 */
import { ContinuousBeam } from './beam.js';
import { materialsEC2, flexureULS } from './section_ec2.js';
import { bearingSpacing } from './bearings.js';

/** Coefficients de forme de la répartition des charges de type 1 (§ 5.2, 5.3, 8). */
export function annexe4Shape({ B, n, a, c, e = null }) {
  const alpha = a / B, lambda = c / B, ee = e ?? a, mu = ee / B;
  const t = 0.2 / alpha - 2.7 * alpha + 0.7;
  const s = -0.112 / alpha + 3.2 * alpha - 2;
  // § 8 : appareils latéraux très voisins des bords libres (λ ≤ 0,05) → formule d'interpolation (17)
  const u = n === 4 && lambda <= 0.05 ? (alpha - 0.9) / (3.15 * alpha + 0.018) : 2 * mu * s + t;
  if (n === 2) return { alpha, lambda, mu, t, s, u, rive: 0.5, central: 0.5 };
  if (n === 3) return { alpha, lambda, mu, t, s, u, rive: 0.25 * (1 + t), central: 0.5 * (1 - t) };
  return { alpha, lambda, mu, t, s, u, rive: 0.25 * (1 + u), central: 0.25 * (1 - u) };
}

/** Longueur d (§ 4, éq. 3). */
export function annexe4D({ B, a, c, e = null, L }) {
  return Math.max(a + c, (a + (e ?? a)) / 2, Math.min(B / 2, L));
}

/**
 * Part ζ d'un cas de charges d'exploitation traitée en type 2 (§ 4).
 * @param {{type:'A'|'B'|'CE', Sq:number, Pd?:number, X?:number}} cs
 */
export function annexe4Zeta(cs, d, L) {
  let z;
  if (cs.type === 'A') z = (d / L) * (2 - d / L);
  else if (cs.type === 'CE') { const X = cs.X ?? 3.05; z = X > d ? (d / X) * (2 - d / L) / (2 - X / L) : 1; }
  else z = cs.Sq > 0 ? (1 - d / (2 * L)) * (cs.Pd ?? cs.Sq) / cs.Sq : 0;
  return Math.max(0, Math.min(1, z));
}

/**
 * Réactions des appareils de rive et central (§ 5) pour une ligne de n appareils (2, 3, 4 ; 5 → 4 avec e = 2a ;
 * nombres pairs ≥ 6 par l'artifice des doublets du § 5.4.2).
 * @param {object} p
 * @param {number} p.B, p.n, p.a, p.c, [p.e], p.L
 * @param {number} p.Sg réaction totale de la ligne sous les charges de type 1 permanentes (et précontrainte Sp)
 * @param {{type, Sq, k2, Pd?, X?}[]} p.cases cas d'exploitation simultanés (réactions totales de la ligne, coefficients compris)
 *   k2 : A → n_a·v ; B → (n_b − 1)·ℓ + ℓ0 ; CE → largeur hors tout des chenilles + min(d, X)
 * @returns {{R1, R2, Rmax, d, shape, zetas, k1}}
 */
export function annexe4Reactions({ B, n, a, c, e = null, L, Sg, Sp = 0, cases = [] }) {
  if (n === 5) return annexe4Reactions({ B, n: 4, a, c, e: 2 * a, L, Sg, Sp, cases });
  if (n >= 6 && n % 2 === 0) {
    // doublets : appareil fictif par paire (c' = c + a/2, a' = e' = a + e) ; part de l'appareil réel : 0,5 (doublet central),
    // 0,5 (1 + |u|) (doublet de rive) avec u calculé pour α = a/(e + 2(a + c)), μ = e/(e + 2(a + c))
    const ee = e ?? a, cf = c + a / 2, af = a + ee;
    const r = annexe4Reactions({ B, n: n / 2, a: af, c: cf, e: af, L, Sg, Sp, cases });
    const den = ee + 2 * (a + c), u = annexe4Shape({ B: den, n: 4, a, c: 1, e: ee }).u;
    const R1 = 0.5 * (1 + Math.abs(u)) * r.R1, R2 = 0.5 * r.R2;
    return { ...r, R1, R2, Rmax: Math.max(R1, R2), doublets: true };
  }
  const sh = annexe4Shape({ B, n, a, c, e });
  const d = annexe4D({ B, a, c, e, L }), k1 = (a + c) ** 2 / a;
  const ee = e ?? a;
  let R1 = sh.rive * (Sg + Sp), R2 = sh.central * (Sg + Sp);
  const zetas = [];
  for (const cs of cases) {
    const z = annexe4Zeta(cs, d, L); zetas.push(z);
    const cap = v => Math.min(1, v);
    if (n === 2) { R1 += 0.5 * cap((1 - z) + (k1 / cs.k2) * z) * cs.Sq; R2 = R1; continue; }
    R1 += cap((1 - z) * sh.rive + 0.5 * (k1 / cs.k2) * z) * cs.Sq;
    R2 += cap((1 - z) * sh.central + (n === 3 ? a / cs.k2 : (a + ee) / (2 * cs.k2)) * z) * cs.Sq;
  }
  return { R1, R2, Rmax: Math.max(R1, R2), d, shape: sh, zetas, k1 };
}

/**
 * Moments du chevêtre incorporé (§ 6.1) : poutre continue sur les appareils d'appui avec consoles c, chargée par la
 * réaction de type 1 répartie sur toute la longueur et par chaque cas de type 2 (ζ·S_q étalé sur k2) placé au plus
 * défavorable ; moments locaux par mètre de largeur droite : m_c⁻ = M_c⁻/(1,5 c), m_e⁻ = 1,5 M_e⁻/e, m_e⁺ = 1,5 M_e⁺/e.
 * @param {object} p  mêmes données que annexe4Reactions ; p.simultaneous = true (Eurocodes : TS + UDL) ou false (F61 : max des cas)
 * @returns {{Mc, Me_neg, Me_pos, mc, me_neg, me_pos, bands}}
 */
export function chevetreMoments({ B, n, a, c, e = null, L, Sg, Sp = 0, cases = [], simultaneous = true }) {
  const ee = n === 5 ? 2 * a : (e ?? a);
  const nn = n === 5 ? 4 : n;
  const spans = nn === 2 ? [a] : nn === 3 ? [a, a] : [a, ...Array(nn - 3).fill(ee), a];
  const bm = new ContinuousBeam(spans, { nGrid: 80, nSec: 20, overhangs: [c, c] });
  const d = annexe4D({ B, a, c, e: ee, L });
  const zetas = cases.map(cs => annexe4Zeta(cs, d, L));
  const q1 = (Sg + Sp + cases.reduce((s, cs, i) => s + (1 - zetas[i]) * cs.Sq, 0)) / B;
  const u1 = bm.uniformLoad(q1);
  const env = cases.map((cs, i) => {
    const len = Math.min(cs.k2, bm.xMax - bm.xMin), q = zetas[i] * cs.Sq / len;
    return bm.sections.map((_, s) => bm.stripEnvelope(bm.ILM[s], q, len, { step: 0.05 }));
  });
  const nS = bm.sections.length;
  const Mmax = [], Mmin = [];
  for (let s = 0; s < nS; s++) {
    const parts = env.map(E => E[s]);
    const add = k => (simultaneous ? parts.reduce((t, p) => t + p[k], 0) : parts.reduce((t, p) => (k === 'max' ? Math.max(t, p[k]) : Math.min(t, p[k])), 0));
    Mmax.push(u1.M[s] + add('max')); Mmin.push(u1.M[s] + add('min'));
  }
  const supIdx = i => bm.supportSectionIndex(i);
  const Mc = Math.max(Math.abs(Mmin[supIdx(0)]), Math.abs(Mmin[supIdx(spans.length)]));
  const interior = spans.length > 1 ? Array.from({ length: spans.length - 1 }, (_, k) => supIdx(k + 1)) : [];
  const Me_neg = interior.length ? Math.max(...interior.map(i => Math.abs(Math.min(Mmin[i], 0)))) : 0;
  const centralSpans = nn >= 4 ? spans.map((_, j) => j).slice(1, -1) : spans.map((_, j) => j);
  const Me_pos = Math.max(0, ...bm.sections.map((sc, s) => (centralSpans.includes(sc.span) ? Mmax[s] : 0)));
  const eLoc = nn >= 4 ? ee : a;
  const mc = c > 1e-9 ? Mc / (1.5 * c) : 0, me_neg = 1.5 * Me_neg / eLoc, me_pos = 1.5 * Me_pos / eLoc;
  const big = Math.max(c, a, ee);
  const bands = {
    top: [
      { label: 'bande centrale ①', width: 2 / 3 * big, m: Math.max(mc, me_neg) },
      { label: 'zone ②', width: Math.max(2 * c, a, ee), m: Math.max(2 / 3 * mc, 0.5 * me_neg) },
      { label: 'extensions ③', width: 2 * Math.max(a, ee, c), m: me_neg / 3 },
    ],
    bot: [
      { label: 'bande ①\'', width: 2 / 3 * Math.max(a, ee), m: me_pos },
      { label: 'zone ②\'', width: 2 * Math.max(a, ee), m: me_pos / 3 },
    ],
  };
  return { d, zetas, q1, Mc, Me_neg, Me_pos, mc, me_neg, me_pos, bands, spans, Mmax, Mmin };
}

/**
 * Moment de chevêtre de la note automatique PSIDP.EL (p. 52) : |M| = R/e · ℓ/12 par mètre (R réaction maximale d'un
 * appareil, e largeur du chevêtre perpendiculairement aux lignes d'appui, ℓ distance entre deux appareils).
 */
export function chevetreMomentPSIDP({ R, width, spacing }) { return R / width * spacing / 12; }

/**
 * Chevêtres incorporés de toutes les lignes d'appui d'un tablier (Eurocodes, ELU fondamental 1,35 G + 1,35 LM1) :
 * réactions de l'appareil le plus chargé (annexe 4) et ferraillage des bandes (EC2, flexion simple par mètre).
 * @param {object} p  deck, perm (permanent), ec (eurocode), n appareils par ligne, psi [gr], cover, phi, fck, fyk
 */
export function chevetresEC({ deck, perm, ec, n, psi = 100, cover = 0.03, phi = 0.016, fck = 35, fyk = 500, gG = 1.35, gQ = 1.35 }) {
  const s = Math.sin(psi * Math.PI / 200), B = 2 * deck.b / s;
  const a = bearingSpacing({ width: 2 * deck.b, psi, n }), c = Math.max(0, (B - (n - 1) * a) / 2);
  const nl = ec.lanes.n, wl = ec.lanes.wl, lanes = ec.lm1.lanes;
  const k2TS = Math.max(1, nl - 1) > 0 ? (nl - 1) * wl + 2.0 : 2.0;
  const k2UDL = deck.g.roadway.y2 - deck.g.roadway.y1;
  const mat = materialsEC2({ fck, fyk }), d = deck.h - cover - phi / 2;
  const [aL, aR] = deck.g.overhangs || [0, 0];
  const spans = deck.spans;
  return deck.beam.x0.map((x, i) => {
    const L = i === 0 ? aL + spans[0] / 2 : i === spans.length ? aR + spans[spans.length - 1] / 2 : (spans[i - 1] + spans[i]) / 2;
    const dd = annexe4D({ B, a, c, L });
    const Pd = gQ * lanes.slice(0, 3).reduce((t, ln) => t + (2 * dd >= 1.2 ? 2 : 1) * ln.Q, 0);
    const cases = [
      { type: 'B', label: 'TS', Sq: gQ * Math.max(ec.TS.Rmax[i], 0), Pd, k2: k2TS },
      { type: 'A', label: 'UDL + trottoirs', Sq: gQ * Math.max(ec.UDL.Rmax[i] + (ec.footway ? ec.footway.Rmax[i] : 0), 0), k2: k2UDL },
    ];
    const Sg = gG * perm.Rmax[i];
    const R = annexe4Reactions({ B, n, a, c, L, Sg, cases });
    const M = chevetreMoments({ B, n, a, c, L, Sg, cases, simultaneous: true });
    const As = m => (m > 0 ? flexureULS(m / 1000, { b: 1, d }, mat).As : 0);
    const bands = { top: M.bands.top.map(b => ({ ...b, As: As(b.m) })), bot: M.bands.bot.map(b => ({ ...b, As: As(b.m) })) };
    return { i, x, L, B, n, a, c, d: dd, zetas: R.zetas, R1: R.R1, R2: R.R2, Rmax: R.Rmax, Rmoy: (Sg + cases.reduce((t, cs) => t + cs.Sq, 0)) / n, Mc: M.Mc, Me_neg: M.Me_neg, Me_pos: M.Me_pos, mc: M.mc, me_neg: M.me_neg, me_pos: M.me_pos, bands, dEff: d };
  });
}
