/**
 * Flexion composée (N, M) des sections d'appuis — modèle à fibres, rectangle ou cercle, armatures symétriques.
 * ELU : pivots A (ε_s = 10 ‰ BAEL ; ε_ud EC2), B (ε_cu = 3,5 ‰), C (2 ‰ à 3/7 h) ; béton parabole-rectangle
 * (BAEL : f_bu = 0,85 f_c28/(θ γ_b) ; EC2 : f_cd = α_cc f_ck/γ_c), acier élastique parfaitement plastique (f_su / f_yd).
 * Convention : N > 0 compression [kN], M ≥ 0 [kN·m], dimensions en m, aciers en m².
 */

/** Matériaux ELU d'une section d'appui. */
export function nmMaterials({ code = 'BAEL', fck = 25, fyk = 400, gammaC = 1.5, gammaS = 1.15, alphaCC = 1.0, theta = 1 } = {}) {
  const fc = code === 'BAEL' ? 0.85 * fck / (theta * gammaC) : alphaCC * fck / gammaC;
  return { code, fc, fy: fyk / gammaS, Es: 200000, ec2: 0.002, ecu: 0.0035, esu: code === 'BAEL' ? 0.010 : 0.045 };
}

/** Contrainte du béton (parabole-rectangle) pour un raccourcissement ε ≥ 0 [MPa]. */
const sigC = (eps, m) => (eps <= 0 ? 0 : eps < m.ec2 ? m.fc * (1 - (1 - eps / m.ec2) ** 2) : m.fc);
const sigS = (eps, m) => Math.max(-m.fy, Math.min(m.fy, m.Es * eps));

/**
 * Discrétisation : fibres de béton (y depuis le centre de gravité, aire) et barres (y, aire unitaire relative).
 * rect : { b, h, c } (c = enrobage à l'axe des aciers, deux nappes symétriques en ±(h/2 − c)) ;
 * circ : { D, c, nBars } (barres réparties sur le cercle de rayon D/2 − c).
 */
export function nmGeometry(shape) {
  const fib = [], bars = [];
  if (shape.D) {
    const R = shape.D / 2, n = 80;
    for (let i = 0; i < n; i++) { const y1 = -R + 2 * R * i / n, y2 = y1 + 2 * R / n, y = (y1 + y2) / 2; fib.push({ y, A: 2 * Math.sqrt(Math.max(0, R * R - y * y)) * (y2 - y1) }); }
    const rs = R - shape.c, nb = shape.nBars || 12;
    for (let k = 0; k < nb; k++) bars.push({ y: rs * Math.cos(2 * Math.PI * k / nb), w: 1 / nb });
    return { fib, bars, h: shape.D, ymax: R };
  }
  const { b, h, c } = shape, n = 80;
  for (let i = 0; i < n; i++) fib.push({ y: -h / 2 + h * (i + 0.5) / n, A: b * h / n });
  bars.push({ y: h / 2 - c, w: 0.5 }, { y: -(h / 2 - c), w: 0.5 });
  return { fib, bars, h, ymax: h / 2 };
}

/** Efforts résistants (N, M) pour une déformation plane ε(y) = ε0 + κ y et une section d'acier totale As. */
function forces(geo, m, As, e0, k) {
  let N = 0, M = 0;
  for (const f of geo.fib) { const s = sigC(e0 + k * f.y, m) * 1000 * f.A; N += s; M += s * f.y; }
  for (const bb of geo.bars) { const s = sigS(e0 + k * bb.y, m) * 1000 * As * bb.w; N += s; M += s * bb.y; }
  return { N, M };
}

/**
 * Moment résistant ultime M_Rd(N_Ed) pour une section d'acier totale As : recherche de la déformation limite (pivots)
 * équilibrant N_Ed (dichotomie sur la position de l'axe neutre).
 */
export function momentCapacity(geo, m, As, Ned) {
  const yt = geo.ymax, ybar = Math.min(...geo.bars.map(b => b.y));
  // paramétrage par la hauteur comprimée x (de la fibre supérieure) : pivot A, B ou C
  const strain = x => {
    const h = 2 * yt;
    if (x >= h) { // section entièrement comprimée : pivot C (ε = ε_c2 à 3/7 h de la fibre la plus comprimée)
      const ytop = Math.max(m.ec2, Math.min(m.ecu, m.ecu - (m.ecu - m.ec2) * (x - h) / (x - (3 / 7) * h + 1e-9)));
      const k = ytop > m.ec2 ? (ytop - m.ec2) / ((3 / 7) * h) : 0;
      return { e0: ytop - k * yt, k };
    }
    const dS = yt - ybar; // distance fibre sup → aciers inférieurs
    let ec = m.ecu, k = ec / x;
    if ((k * (dS - x)) > m.esu) { k = m.esu / (dS - x); ec = k * x; } // pivot A
    return { e0: ec - k * yt, k };
  };
  const Nof = x => { const s = strain(x); return forces(geo, m, As, s.e0, s.k); };
  let lo = 1e-4 * geo.h, hi = 50 * geo.h;
  const fLo = Nof(lo).N - Ned, fHi = Nof(hi).N - Ned;
  if (fHi < 0) return { MRd: -Infinity, x: null, Nmax: Nof(hi).N };      // N_Ed supérieur à la capacité en compression
  if (fLo > 0) return { MRd: Nof(lo).M, x: lo, tension: true };
  for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (Nof(mid).N - Ned > 0) hi = mid; else lo = mid; }
  const r = Nof((lo + hi) / 2);
  return { MRd: r.M, x: (lo + hi) / 2 };
}

/** Section d'acier totale minimale (symétrique) telle que M_Rd(N_Ed) ≥ M_Ed ; null si impossible avec As ≤ AsMax. */
export function requiredSteelNM(shape, matOpt, Ned, Med, { AsMax = null } = {}) {
  const m = nmMaterials(matOpt), geo = nmGeometry(shape);
  const Ac = geo.fib.reduce((a, f) => a + f.A, 0), cap = AsMax ?? 0.08 * Ac;
  const ok = As => momentCapacity(geo, m, As, Ned).MRd >= Math.abs(Med) - 1e-6;
  if (ok(0)) return { As: 0, Ac };
  if (!ok(cap)) return { As: null, Ac };
  let lo = 0, hi = cap;
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return { As: hi, Ac };
}
