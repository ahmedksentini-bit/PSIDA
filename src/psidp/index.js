/**
 * Module PSI-DP : dimensionnement et justification de la précontrainte longitudinale d'un pont-dalle continu (dalle pleine
 * rectangulaire ou à encorbellements), à partir du modèle PSIDA (lignes d'influence, Fascicule 61 titre II, répartition
 * transversale de Guyon-Massonnet) — démarche du dossier pilote SETRA PSI-DP et de la note modèle PSIDP-EL 84-1, règles
 * BPEL 91 révisé 99 (classe II). Unités internes : m, kN, kPa ; entrées et sorties des matériaux en MPa.
 */
import { prestress, cableGeometry, deflection } from './prestress.js';
import { materialsBAEL, flexureELU, flexureELS } from '../section_bael.js';
import { psidpChecks, mLim } from './checks.js';

/** Unités de précontrainte courantes (aire d'acier, Ø extérieur de gaine, rayon minimal de courbure). */
export const UNITS = {
  '7T15S': { Ap: 1050e-6, phiG: 0.065, Rmin: 4.5, plate: 0.20, label: '7 T 15 S' },
  '12T13': { Ap: 1116e-6, phiG: 0.070, Rmin: 6.0, plate: 0.22, label: '12 T 13' },
  '12T15S': { Ap: 1800e-6, phiG: 0.080, Rmin: 6.0, plate: 0.25, label: '12 T 15 S' },
  '19T15S': { Ap: 2850e-6, phiG: 0.095, Rmin: 7.0, plate: 0.30, label: '19 T 15 S' },
};

export const BP_DEFAULTS = {
  actif: false, unite: '12T15S', n: null, fprg: 1860, fpeg: 1660, sigma0: null, Ep: 190000, rho1000: 2.5, mu0: 0.43,
  f: 0.18, phi: 0.002, g: 0.006, ends: 'both', friction: 'continu', fcj: null, epsR: 2e-4, Kfl: 2, rj: 0.5,
  cover: null, decal: 0.007, eSup: null, eLow: null, lowEnd: 0.4, a: 0.1, segs: null, fe: 500, skin: 3e-4, trace: 'optimise',
};

/** Caractéristiques de la section brute (rectangle 2b × h, ou encorbellements : épaisseur h_rive au bord, joue). */
export function sectionProps({ width, h, chamfer }) {
  const b = width / 2;
  const pts = chamfer && chamfer.hEdge > 0 && chamfer.hEdge < h && chamfer.joue > 0 && chamfer.joue < b
    ? [[-b, 0], [b, 0], [b, -chamfer.hEdge], [b - chamfer.joue, -h], [-b + chamfer.joue, -h], [-b, -chamfer.hEdge]]
    : [[-b, 0], [b, 0], [b, -h], [-b, -h]];
  let As = 0, Sy = 0, Ixx = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length], c = x1 * y2 - x2 * y1;
    As += c / 2; Sy += (y1 + y2) * c / 6; Ixx += (y1 * y1 + y1 * y2 + y2 * y2) * c / 12;
  }
  const A = Math.abs(As), yg = Sy / As, I = Math.abs(Ixx) - A * yg * yg, v = -yg, vp = h + yg;
  return { B: A, I, v, vp, h, bTop: width, bBot: pts.length === 6 ? width - 2 * chamfer.joue : width, rho: I / (A * v * vp) };
}

/**
 * Tracé automatique du câble moyen (paraboles, démarche du guide PSI-DP) : ancrages sur la fibre moyenne aux appuis
 * extrêmes, sommets de parabole sur les appuis intermédiaires (excentricité e_s vers le haut), points bas à 0,4 L des
 * travées de rive et 0,5 L des travées intermédiaires (excentricité e_l vers le bas), points d'inflexion à a·L des appuis.
 */
export function autoCable(spans, { zSup, zLow: zLowIn, lowEnd = 0.4, a = 0.1 }) {
  const n = spans.length, segs = [];
  const arr = (v, i) => (Array.isArray(v) ? v[i] : v);
  const zs = i => (i === 0 || i === n ? 0 : arr(zSup, i));
  for (let j = 0; j < n; j++) {
    const L = spans[j], left = j === 0, right = j === n - 1, zLow = arr(zLowIn, j), le = arr(lowEnd, j);
    const xl = n === 1 ? L / 2 : left ? le * L : right ? (1 - le) * L : L / 2;
    const list = [];
    // côté gauche : ancrage (une parabole de sommet au point bas) ou appui intermédiaire (deux paraboles et inflexion)
    if (left) { const k0 = (zs(0) - zLow) / (xl * xl); list.push({ A: k0, B: -2 * k0 * xl, C: zLow + k0 * xl * xl, x1: xl }); }
    else {
      const aa = a * L, d1 = xl - aa, D = zs(j) - zLow, k1 = D / (d1 * (d1 + aa)), k2 = k1 * d1 / aa;
      list.push({ A: -k2, B: 0, C: zs(j), x1: aa });                                    // z = z_s − k2 x²
      list.push({ A: k1, B: -2 * k1 * xl, C: zLow + k1 * xl * xl, x1: xl });            // z = z_l + k1 (x − x_l)²
    }
    if (right) { const d = L - xl, k0 = (zs(n) - zLow) / (d * d); list.push({ A: k0, B: -2 * k0 * xl, C: zLow + k0 * xl * xl, x1: L }); }
    else {
      const aa = a * L, d1 = L - aa - xl, D = zs(j + 1) - zLow, k1 = D / (d1 * (d1 + aa)), k2 = k1 * d1 / aa;
      list.push({ A: k1, B: -2 * k1 * xl, C: zLow + k1 * xl * xl, x1: L - aa });
      list.push({ A: -k2, B: 2 * k2 * L, C: zs(j + 1) - k2 * L * L, x1: L });           // z = z_s − k2 (x − L)²
    }
    segs.push(list);
  }
  return segs;
}

/** Paraboles saisies : « A B C x1 ; A B C x1 | … » (une liste par travée, séparateur |). */
export function parseSegs(txt, nSpans) {
  if (!txt || !String(txt).trim()) return null;
  const spans = String(txt).split('|').map(s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => { const [A, B, C, x1] = t.split(/[\s,]+/).map(Number); return { A, B, C, x1 }; }));
  if (spans.length !== nSpans || spans.some(l => !l.length || l.some(q => [q.A, q.B, q.C, q.x1].some(v => !Number.isFinite(v))))) throw new Error(`Paraboles du câble : ${nSpans} travée(s) attendue(s), chaque tronçon « A B C x_fin ».`);
  return spans;
}

/**
 * Prédimensionnement de la force utile (dossier PSI-DP, annexe 1) : classe II, F∞ = max(F1, F2),
 * F1 = [l²/8 (g + ξ S1) − f_t η B y]/Z, F2 = l²/8 (g + ξ S2)/Z, S1 = 1,2 L_ch A(l), S2 = ψ1 L_ch A(l).
 */
export function predimForce({ spans, g, Lch, A, sec, ft, phiG }) {
  const n = spans.length, l = n >= 3 ? Math.max(...spans.slice(1, -1)) : Math.max(...spans);
  const th = n >= 3 ? spans[0] / l : 1;
  const xi = n <= 2 ? 1 : n === 3 ? Math.max(1, 5 * (th + 1) / 8) : Math.max(1.1, (3 * th + 7) / 8);
  const S1 = 1.2 * Lch * A(l), S2 = 0.6 * Lch * A(l), eta = sec.rho;
  const Z = n === 1 ? sec.vp - 1.5 * phiG : sec.h - 3 * phiG + eta * sec.h, y = n === 1 ? sec.v : sec.h;
  const F1 = (l * l / 8 * (g + xi * S1) - ft * eta * sec.B * y) / Z, F2 = l * l / 8 * (g + xi * S2) / Z;
  return { l, xi, S1, S2, Z, F1, F2, F: Math.max(F1, F2) };
}

const interpS = (xs, ys, x) => { if (x <= xs[0]) return ys[0]; for (let k = 1; k < xs.length; k++) if (x <= xs[k]) { const t = (x - xs[k - 1]) / (xs[k] - xs[k - 1] || 1); return ys[k - 1] + t * (ys[k] - ys[k - 1]); } return ys[ys.length - 1]; };

/**
 * Dimensionnement complet à partir du modèle de tablier PSIDA.
 * @param {object} ctx { deck, perm, f61, thermal, beamF61 (combineBeamBAEL), fc28 [MPa] } ; @param {object} bp options (BP_DEFAULTS)
 */
export function designPSIDP(ctx, bpIn = {}) {
  const bp = { ...BP_DEFAULTS, ...bpIn };
  const { deck, perm, f61, thermal } = ctx, bm = deck.beam, spans = deck.spans;
  const U = UNITS[bp.unite] || UNITS['12T15S'];
  const sec = sectionProps({ width: 2 * deck.b, h: deck.h, chamfer: deck.g.chamfer });
  const MPa = 1000, fc28 = ctx.fc28, fcj = bp.fcj || Math.min(fc28, 0.8 * fc28 + 2);
  const ft = v => 0.6 + 0.06 * v, Ei = v => 11000 * Math.cbrt(v);
  const fprg = bp.fprg, fpeg = bp.fpeg, sigma0 = bp.sigma0 || Math.min(0.8 * fprg, 0.9 * fpeg);
  const cover = bp.cover ?? U.phiG, off = cover + U.phiG / 2 + bp.decal;
  const zSup = bp.eSup != null ? sec.v - bp.eSup : sec.v - off, zLow = bp.eLow != null ? -(sec.vp - bp.eLow) : -(sec.vp - off);
  const imposed = parseSegs(bp.segs, spans.length);
  let segs = imposed || autoCable(spans, { zSup, zLow, lowEnd: bp.lowEnd, a: bp.a });

  // sollicitations de poutre entière (moments de calcul = max_y m_x · 2b, comme PSIDP-EL) aux sections du modèle
  const xs = bm.sections.map(s => s.x), W = 2 * deck.b, nS = xs.length;
  const files = deck.permanentFiles(), oss = deck.permanentFromFiles([files[0]]);
  const fib = (res, s, w) => (res ? res[w === 'max' ? 'mxMax' : 'mxMin'][s] : null);
  const Q = { rareMax: [], rareMin: [], freqMax: [], freqMin: [], eluMax: [], eluMin: [] };
  for (let s = 0; s < nS; s++) {
    for (const w of ['max', 'min']) {
      const sel = w === 'max' ? Math.max : Math.min, ny = deck.ys.length;
      let rare = w === 'max' ? -Infinity : Infinity, freq = rare, elu = rare;
      for (let iy = 0; iy < ny; iy++) {
        const pk = k => { const a = fib(f61[k], s, w); return a ? a[iy] : 0; };
        const ab = sel(pk('A'), pk('Bc'), pk('Bt'), 0), tr = sel(pk('trottoir'), 0), mc = sel(pk('Mc120'), 0), d = sel(pk('D240'), 0);
        const t = thermal ? (thermal[w === 'max' ? 'mxMax' : 'mxMin'][s][iy] || 0) : 0;
        rare = sel(rare, sel(1.2 * ab + tr, mc + tr, d, 0) + 0.6 * t);
        freq = sel(freq, 0.6 * (ab + tr) + 0.5 * t);
        elu = sel(elu, sel(1.6 * ab + 1.6 * tr, 1.35 * mc + 1.6 * tr, 1.35 * d));
      }
      Q[`rare${w === 'max' ? 'Max' : 'Min'}`].push(rare * W); Q[`freq${w === 'max' ? 'Max' : 'Min'}`].push(freq * W); Q[`elu${w === 'max' ? 'Max' : 'Min'}`].push(elu * W);
    }
  }
  const G = { min: perm.Mmin, moy: perm.M, max: perm.Mmax }, O = { min: oss.Mmin, moy: oss.M, max: oss.Mmax };
  const at = arr => x => interpS(xs, arr, x);
  const M = {
    oss: x => ({ min: at(O.min)(x), moy: at(O.moy)(x), max: at(O.max)(x) }),
    cp: x => ({ min: at(G.min)(x), moy: at(G.moy)(x), max: at(G.max)(x) }),
    rare: x => ({ max: at(Q.rareMax)(x), min: at(Q.rareMin)(x) }),
    freq: x => ({ max: at(Q.freqMax)(x), min: at(Q.freqMin)(x) }),
    elu: x => { const gx = at(G.max)(x), gn = at(G.min)(x); return { max: (gx >= 0 ? 1.35 : 1) * gx + at(Q.eluMax)(x), min: (gn <= 0 ? 1.35 : 1) * gn + at(Q.eluMin)(x) }; },
  };
  const bV = ctx.beamF61 ? ctx.beamF61.V : null;
  const V = bV ? { els: x => ({ max: at(bV.ELSmax)(x), min: at(bV.ELSmin)(x) }), elu: x => ({ max: at(bV.ELUmax)(x), min: at(bV.ELUmin)(x) }) } : null;
  const stations = bm.sections.map((s, k) => ({ x: xs[k], label: `${s.span + 1} — ${(s.xi / spans[s.span]).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L` }));
  const lim = { fcj: fcj * MPa, fc28: fc28 * MPa, ftj: ft(fcj) * MPa, ft28: ft(fc28) * MPa };
  const steel = { fe: bp.fe * MPa, skin: bp.skin, Es: 200000 * MPa, gs: 1.15, gp: 1.15, gb: 1.5, fpeg: fpeg * MPa, cover: 0.035, atMin: (bp.atMin ?? 0.1) * MPa };

  const cableOf = (n, sg) => ({ n, Ap: U.Ap, phiG: U.phiG, segs: sg, sigma0: sigma0 * MPa, f: bp.f, phi: bp.phi, g: bp.g, Ep: bp.Ep * MPa, rho1000: bp.rho1000, mu0: bp.mu0, fprg: fprg * MPa, ends: bp.ends, friction: bp.friction });
  const matP = { Eij: Ei(fcj) * MPa, Ei28: Ei(fc28) * MPa, epsR: bp.epsR, Kfl: bp.Kfl, rj: bp.rj };
  const run = (n, sg = segs, fast = false) => {
    const r = prestress({ spans, sec, MGmean: at(G.moy), cable: cableOf(n, sg), mat: matP, nPerSpan: fast ? 20 : 100, iterations: fast ? 3 : 6 });
    const c = psidpChecks(r, { sec, phiG: U.phiG, nCables: n, Ep: bp.Ep * MPa, stations, M, V, lim, steel, stressOnly: fast });
    return { n, r, c, ok: c.extremes.every(e => e.ok), segs: sg };
  };
  /** Marge minimale normée des contraintes (> 0 : classe II vérifiée), pénalisée si le rayon minimal n'est pas respecté. */
  const margin = (c, sg) => {
    let m = Infinity;
    for (const e of c.extremes) {
      m = Math.min(m, (e.cLim - e.cmax) / lim.fc28, (e.enc - e.encLim) / lim.ft28);
      if (e.horsLim !== null) m = Math.min(m, (e.hors - e.horsLim) / lim.ft28);
    }
    const R = cableGeometry(spans, sg).checks().Rmin;
    return R < U.Rmin ? m - (U.Rmin - R) / U.Rmin : m;
  };
  // nombre d'unités : imposé, ou le plus petit satisfaisant les contraintes de classe II (départ au prédimensionnement)
  const Lch = deck.g.roadway.y2 - deck.g.roadway.y1;
  const pre = predimForce({ spans, g: perm.gTotal, Lch, A: l => 2.3 + 360 / (l + 12), sec, ft: ft(fc28) * MPa, phiG: U.phiG });
  const n0 = Math.max(2, Math.ceil(pre.F / (U.Ap * 0.8 * sigma0 * MPa)));
  let res, tried = [];
  const searchN = (sg, start) => {
    let n = start, r0 = run(n, sg, true); const tr = [[n, r0.ok]];
    if (r0.ok) { while (n > 2) { const t = run(n - 1, sg, true); tr.push([n - 1, t.ok]); if (!t.ok) break; r0 = t; n--; } }
    else { while (!r0.ok && n < start + 40) { n++; r0 = run(n, sg, true); tr.push([n, r0.ok]); } }
    return { n, tr };
  };
  let opt = null;
  if (bp.n) { res = run(bp.n); }
  else {
    const s1 = searchN(segs, n0); tried = s1.tr;
    let nBest = s1.n;
    if (!imposed && bp.trace === 'optimise' && spans.length > 1) {
      // ---- recherche du tracé : excentricités des points bas (fraction λ_j de l'excentricité maximale) et sur appuis
      // (μ_i), position du point bas des travées de rive ; recherche par coordonnées maximisant la marge minimale (centrage
      // du tracé dans le fuseau, comme la transformation linéaire du programme PSIDP), puis diminution du nombre d'unités.
      const nS2 = spans.length, sym = spans.every((L, j) => Math.abs(L - spans[nS2 - 1 - j]) < 1e-6);
      const keyL = j => (sym ? Math.min(j, nS2 - 1 - j) : j), keyS = i => (sym ? Math.min(i, nS2 - i) : i);
      const P = { lam: {}, mu: {}, le: 0.4 };
      for (let j = 0; j < nS2; j++) P.lam[keyL(j)] = 1;
      for (let i = 1; i < nS2; i++) P.mu[keyS(i)] = 1;
      const segsOf = q => autoCable(spans, { zSup: Array.from({ length: nS2 + 1 }, (_, i) => (i === 0 || i === nS2 ? 0 : zSup * q.mu[keyS(i)])), zLow: spans.map((_, j) => zLow * q.lam[keyL(j)]), lowEnd: spans.map(() => q.le), a: bp.a });
      const evalP = (n, q) => { const sg = segsOf(q), rr = run(n, sg, true); return { m: margin(rr.c, sg), sg }; };
      const optimise = n => {
        let q = JSON.parse(JSON.stringify(P)), best = evalP(n, q), evals = 1;
        const coords = [...Object.keys(q.lam).map(k => ['lam', k, -0.5, 1]), ...Object.keys(q.mu).map(k => ['mu', k, 0, 1]), ['le', null, 0.3, 0.5]];
        for (const step of [0.2, 0.1, 0.05]) {
          let improved = true;
          while (improved && evals < 90) {
            improved = false;
            for (const [grp, k, lo, hi] of coords) for (const sgn of [1, -1]) {
              const t = JSON.parse(JSON.stringify(q)), cur = k === null ? t[grp] : t[grp][k];
              const nv = Math.min(hi, Math.max(lo, cur + sgn * step * (grp === 'le' ? 0.5 : 1)));
              if (Math.abs(nv - cur) < 1e-9) continue;
              if (k === null) t[grp] = nv; else t[grp][k] = nv;
              const e = evalP(n, t); evals++;
              if (e.m > best.m + 1e-6) { best = e; q = t; improved = true; }
            }
          }
        }
        return { q, ...best, evals };
      };
      const okDefault = s1.tr.some(([, ok]) => ok);
      let n = okDefault ? nBest : n0, o = optimise(n);
      opt = { path: [[n, o.m]] };
      const step = Math.max(1, Math.round(0.1 * n));
      for (let up = 0; o.m < 0 && up < 8; up++) { n += step; o = optimise(n); opt.path.push([n, o.m]); }
      if (o.m >= 0) {
        while (n > 2) { const o2 = optimise(n - 1); opt.path.push([n - 1, o2.m]); if (o2.m < 0) break; n--; o = o2; }
        segs = o.sg; nBest = n;
      } else if (!okDefault) {
        // aucun nombre d'unités ne convient : on garde le meilleur compromis trouvé (marge la plus grande)
        const [nb] = opt.path.reduce((a, b2) => (b2[1] > a[1] ? b2 : a)); o = optimise(nb); segs = o.sg; nBest = nb;
      }
      opt = { ...opt, n: nBest, ...o, feasible: o.m >= 0 };
    }
    // calcul définitif (discrétisation fine) ; si la marge disparaît, une unité de plus
    res = run(nBest, segs);
    for (let k = 0; !res.ok && k < 3 && (!opt || opt.feasible); k++) { nBest++; res = run(nBest, segs); tried.push([nBest, res.ok]); }
  }
  const geoChk = cableGeometry(spans, segs).checks();
  // armatures passives complémentaires si |M_cal| > M_lim (ELU)
  for (const e of res.c.elu) for (const w of ['min', 'max']) {
    const q = e[w]; if (q.ok) continue;
    const k = res.c.stresses.findIndex(s => Math.abs(s.x - e.x) < 1e-9), st = res.c.steel[k], hog = q.Mcal < 0, P0 = e.ph === 'ES' ? res.r.ES.min : res.r.MS.max;
    const base = { N: res.r.at(P0.F, e.x), hog, h: sec.h, v: sec.v, vp: sec.vp, b: hog ? sec.bBot : sec.bTop, d: sec.h - 0.035, zc: res.r.at(res.r.z, e.x), Ap: res.r.nAp, sp2: res.r.at(P0.sig, e.x), Ep: bp.Ep * MPa, Es: steel.Es, fbu: 0.85 * lim.fc28 / 1.5, fsu: steel.fe / 1.15, fpu: fpeg * MPa / 1.15 };
    let lo = hog ? st.top.As : st.bot.As, hi = lo + 0.5;
    if (mLim({ ...base, As: hi }).Mlim < Math.abs(q.Mcal)) { q.AsAdd = Infinity; continue; }
    for (let it = 0; it < 50; it++) { const m = (lo + hi) / 2; if (mLim({ ...base, As: m }).Mlim < Math.abs(q.Mcal)) lo = m; else hi = m; }
    q.AsAdd = hi - (hog ? st.top.As : st.bot.As);
  }
  const anchors = anchorZone({ n: res.n, U, sec, sigma0: sigma0 * MPa, lim, fe: bp.fe * MPa, slope: [res.r.th[0], res.r.th[res.r.th.length - 1]], zEnd: [res.r.z[0], res.r.z[res.r.z.length - 1]], width: sec.bBot });
  return { bp, unit: U, sec, sigma0, fcj, fc28, lim, steel, segs, geoChk, pre, n0, tried, auto: !bp.n, opt, anchors, xs, M, Q, G, O, ...res };
}

/**
 * Flexion transversale due à la précontrainte (note PSIDP-EL, NP 47-50) : la déviation du câble moyen en travée exerce une
 * poussée vers le haut uniforme p = −F · 2Ā⁺ / 2b (Ā⁺ = moyenne pondérée des coefficients A > 0 des paraboles de la travée,
 * F = P2 en service définitif à mi-travée), dont on tire m_y(y) par le même noyau de Guyon-Massonnet que les charges
 * permanentes ; valeur minimale × F1,MS/F2,ES. Puis aciers transversaux BAEL avec ces moments ajoutés aux combinaisons.
 */
export function transversePrestress(dp, { deck, model, transDesign, mat }) {
  const r = dp.r, b = deck.b, out = [];
  const m = materialsBAEL(mat), h = deck.h, d = h - (mat.c ?? 0.03) - (mat.phiLong ?? 0.02), sec = { b: 1, h, d };
  deck.spans.forEach((L, j) => {
    const segs = dp.segs[j]; let sA = 0, sL = 0, x0 = 0;
    for (const q of segs) { const len = q.x1 - x0; if (q.A > 0) { sA += q.A * len; sL += len; } x0 = q.x1; }
    const Abar = sL ? sA / sL : 0, xm = r.xOf(j, 0.5);
    const F2 = r.at(r.ES.min.F, xm), F1 = r.at(r.MS.max.F, xm), p = -F2 * 2 * Abar / (2 * b);
    const unit = model.response(j, 'pp', model.bandPatches(j, -b, b)).my;
    const myMax = unit.map(u => p * u), myMin = myMax.map(v => v * F1 / F2);
    const c = transDesign && transDesign.spans[j] ? transDesign.spans[j].comb : null;
    let design = null;
    if (c) {
      const face = (Mu, Ms) => { const e = flexureELU(Math.max(Mu, 0) / 1000, sec, m), s2 = flexureELS(Math.max(Ms, 0) / 1000, sec, m); return { Mu, Ms, As: Math.max(e.As, s2.As) }; };
      const botY = myMax.map((v, iy) => face(c.ELUmax[iy] + v, c.ELSmax[iy] + v)), topY = myMin.map((v, iy) => face(-(c.ELUmin[iy] + v), -(c.ELSmin[iy] + v)));
      const pick = arr => arr.reduce((a, f, iy) => (f.As > a.f.As ? { f, iy } : a), { f: arr[0], iy: 0 });
      const bo = pick(botY), to = pick(topY), BA = transDesign.spans[j];
      design = { bot: { ...bo.f, y: deck.ys[bo.iy], AsBA: BA.bot.flex }, top: { ...to.f, y: deck.ys[to.iy], AsBA: BA.top.flex } };
    }
    out.push({ j, L, Abar, F2, F1, p, myMax, myMin, ys: deck.ys, design, N: F2 / r.Bn * h, N1: F1 / r.Bn * h });
  });
  return out;
}

/**
 * Flèches et rotations (note PSIDP-EL, NP 58) : poutre continue à inertie brute constante sous les moments réels.
 * Ossature et C.P. instantanées avec E_ij, C.P. à long terme (1 + K_fl) w(E_i28) (= E_v28 = E_i28/3 pour K_fl = 2),
 * précontrainte instantanée (P moyenne initiale, E_ij), précontrainte par fluage K_fl · w(P∞ moyenne, E_i28).
 */
export function psidpDeflections(dp) {
  const r = dp.r, spans = r.geo.x0.slice(1).map((x, j) => x - r.geo.x0[j]), I = dp.sec.I, MPa = 1000;
  const Eij = 11000 * Math.cbrt(dp.fcj) * MPa, E28 = 11000 * Math.cbrt(dp.fc28) * MPa, Kfl = dp.bp.Kfl;
  const MG = r.xs.map(x => dp.M.cp(x).moy), MO = r.xs.map(x => dp.M.oss(x).moy);
  const MP = ph => r.xs.map((x, i) => ph.F[i] * r.z[i] + ph.Mhyp[i]);
  const oss = deflection(r.xs, MO, spans, Eij * I), cp = deflection(r.xs, MG, spans, Eij * I), cp28 = deflection(r.xs, MG, spans, E28 * I);
  const pI = deflection(r.xs, MP(r.MT.moy), spans, Eij * I), pInf = deflection(r.xs, MP(r.ES.moy), spans, E28 * I);
  const w = {
    oss: oss.w, cp: cp.w, cpTot: cp28.w.map(v => (1 + Kfl) * v), pI: pI.w, pFl: pInf.w.map(v => Kfl * v),
  };
  w.miseEnTension = w.oss.map((v, i) => v + w.pI[i]);
  w.service = w.cpTot.map((v, i) => v + w.pI[i] + w.pFl[i]);
  const rot = { cp: cp.rot, pI: pI.rot, service: cp28.rot.map((q, i) => ({ g: q.g == null ? null : (1 + Kfl) * q.g + pI.rot[i].g + Kfl * pInf.rot[i].g, d: q.d == null ? null : (1 + Kfl) * q.d + pI.rot[i].d + Kfl * pInf.rot[i].d })) };
  return { xs: r.xs, w, rot, Eij, E28 };
}

/**
 * Zones d'about — ancrages des câbles (BPEL 91, annexe 4) : prisme de première régularisation de chaque ancrage
 * (dimension d dans chaque plan : entraxe ou deux fois la distance au parement, plaque d'ancrage a), frettage de surface
 * A_s = 0,04 F_j0/σ_s,lim, éclatement σ_tj = 0,5 (1 − a/d) F_j0/(e′ d) ≤ 1,25 f_tj et σ_xm = F_j0/(e′ d) ≤ (2/3) f_cj,
 * armatures R = 0,25 (1 − a/d) F_j0, A_e = R/(k σ_s,lim) (k = 1 nappe d'extrémité, 1,5 nappe intermédiaire),
 * A_e ≥ 0,15 F_j0/σ_s,lim ; équilibre général dans le plan vertical sur la longueur de régularisation l_r = h : V_x(t) =
 * forces d'ancrage (réparties sur leur prisme) au-dessus de la coupure t − effort normal du béton au-dessus de t dans la
 * section régularisée (Navier), τ_g = 2 V_x,max/(b l_r), A_c = V_x,max/σ_s,lim. σ_s,lim = (2/3) f_e.
 * Ancrages en une nappe si h ≥ 2 a + 2 enrobages, sinon deux nappes (disposition conseillée par le guide SETRA 1989 § 3.3).
 */
export function anchorZone({ n, U, sec, sigma0, lim, fe, slope = [0, 0], zEnd = [0, 0], width }) {
  const a = U.plate || 0.25, Fj0 = U.Ap * sigma0, ssl = 2 / 3 * fe, h = sec.h, c0 = 0.05;
  const rows = h >= 2 * a + 2 * c0 ? 1 : 2, perRow = Math.ceil(n / rows);
  const sp = (width - 2 * c0 - a) / Math.max(1, perRow - 1), dh = Math.min(perRow > 1 ? sp : width, 2 * (c0 + a / 2) + sp);
  const dv = rows === 1 ? h : h / 2;
  const plane = (d, e, k) => {
    const sigT = 0.5 * (1 - a / d) * Fj0 / (e * d), sigX = Fj0 / (e * d), R = 0.25 * (1 - a / d) * Fj0;
    return { d, e, sigT, sigX, okT: sigT <= 1.25 * lim.ftj, okX: sigX <= 2 / 3 * lim.fcj, R, Ae: Math.max(R / (k * ssl), 0.15 * Fj0 / ssl) };
  };
  const vert = plane(dv, dh, 1), hor = plane(dh, dv, perRow > 2 ? 1.5 : 1);
  // équilibre général (plan vertical), par mètre de largeur multiplié par la largeur : section b × h, ancrages répartis
  const out = zEnd.map((z0, side) => {
    const F = n * Fj0 * Math.cos(Math.atan(slope[side])), levels = rows === 1 ? [z0] : [z0 + h / 4, z0 - h / 4];
    const yb = -sec.vp, B = sec.B, I = sec.I, Fe = F * levels.reduce((s, z) => s + z, 0) / levels.length;
    let Vmax = 0, tAt = 0;
    for (let k = 0; k <= 200; k++) {
      const y = yb + h * k / 200;
      let Fabove = 0;
      for (const z of levels) { const lo = z - dv / 2, hi = z + dv / 2, f = F / levels.length; Fabove += f * Math.min(1, Math.max(0, (hi - y) / (hi - lo))); }
      // effort normal du béton au-dessus de y : ∫_y^v (F/B + Fe·η/I) b dη, b = B/h (largeur moyenne)
      const b = B / h, v = sec.v, Nc = b * ((F / B) * (v - y) + Fe / I * (v * v - y * y) / 2);
      const V = Fabove - Nc; if (Math.abs(V) > Math.abs(Vmax)) { Vmax = V; tAt = y; }
    }
    const tauG = 2 * Math.abs(Vmax) / (width * h);
    return { side: side ? 'droite' : 'gauche', F, Vmax, yAt: tAt, tauG, tauLim: 1.5 * lim.ftj, ok: tauG + vert.sigT <= 1.5 * lim.ftj, Ac: Math.abs(Vmax) / ssl };
  });
  return { a, Fj0, rows, perRow, spacing: perRow > 1 ? sp : null, dv, dh, ssl, As: 0.04 * Fj0 / ssl, vert, hor, general: out };
}
