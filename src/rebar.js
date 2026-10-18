/**
 * Plan de ferraillage : choix des barres (φ, espacement), épure d'arrêt des barres longitudinales, longueurs d'ancrage
 * et de recouvrement, aciers transversaux, cadres de bord libre, épingles d'effort tranchant, nomenclature et métré.
 *
 * Règles (EN 1992-1-1, dalles) :
 *  - épure décalée a_l = d (9.3.1.1(4)) ; chaque barre arrêtée est prolongée de l_bd au-delà du point où elle n'est plus
 *    nécessaire (9.2.1.3) ;
 *  - au moins 50 % des aciers inférieurs de travée prolongés jusqu'aux appuis (9.3.1.2(1)) → schéma « filantes + renforts »
 *    à barres alternées ;
 *  - espacements (9.3.1.1(3)) : armatures principales ≤ min(3h ; 400 mm), ≤ min(2h ; 250 mm) dans les zones de moment
 *    maximal ; armatures secondaires ≤ min(3,5h ; 450 mm), ≤ min(3h ; 400 mm) ;
 *  - ancrage (8.4) : l_b,rqd = (φ/4)(σ_sd/f_bd), f_bd = 2,25 η₁ η₂ f_ctd, η₁ = 1 (bonnes conditions, nappe inférieure),
 *    0,7 (nappe supérieure d'une dalle de plus de 250 mm) ; l_bd = l_b,rqd (α = 1, σ_sd = f_yd, sécuritaire) ≥ l_b,min ;
 *  - recouvrement (8.7.3) : l₀ = α₆ l_bd, α₆ = 1,5 (plus de 50 % des barres recouvertes dans la section) ;
 *  - barres du commerce de 12 m au plus (recouvrements au-delà).
 * Unités : m, m²/m ; diamètres en mm dans les sorties.
 */

export const BARS = [8, 10, 12, 14, 16, 20, 25, 32];
export const areaOf = phi => Math.PI * (phi / 1000) ** 2 / 4;           // m²
export const massPerM = phi => 7850 * areaOf(phi);                      // kg/m
const SPACINGS = [0.10, 0.125, 0.15, 0.175, 0.20, 0.25];
const pen = phi => (phi >= 32 ? 1.15 : 1); // pénalité des HA32 (façonnage, ancrage)

/** Longueurs d'ancrage et de recouvrement (EC2 8.4, 8.7). */
export function anchorage(phi, { fck = 35, fyk = 500, top = false, h = 0.75, alpha6 = 1.5 } = {}) {
  const fctd = 0.7 * 0.3 * Math.pow(fck, 2 / 3) / 1.5;
  const eta1 = top && h > 0.25 ? 0.7 : 1, eta2 = phi <= 32 ? 1 : (132 - phi) / 100;
  const fbd = 2.25 * eta1 * eta2 * fctd, fyd = fyk / 1.15;
  const lbrqd = (phi / 1000 / 4) * fyd / fbd;
  const lbd = Math.max(lbrqd, 0.3 * lbrqd, 10 * phi / 1000, 0.10);
  return { fbd, lbrqd, lbd, l0: Math.max(alpha6 * lbd, 0.3 * alpha6 * lbrqd, 15 * phi / 1000, 0.20) };
}

/** Plus légère combinaison φ / s fournissant As (φ ≥ φmin), espacement ≤ sMax. */
export function chooseBars(As, { phiMin = 12, phiMax = 32, sMax = 0.25, sMin = 0.10 } = {}) {
  let best = null;
  for (const phi of BARS.filter(p => p >= phiMin && p <= phiMax)) for (const s of SPACINGS.filter(v => v <= sMax + 1e-9 && v >= sMin - 1e-9)) {
    const prov = areaOf(phi) / s;
    if (prov + 1e-9 < As) continue;
    const score = prov * 1e4 + (phi > 25 ? 1.5 : 0) + s * 0.01; // poids, pénalité gros diamètres, préférer s faible à égalité
    if (!best || score < best.score) best = { phi, s, As: prov, score };
  }
  if (!best) { const phi = phiMax, s = sMin; best = { phi, s, As: areaOf(phi) / s, score: Infinity, insufficient: true }; }
  delete best.score;
  return best;
}

/**
 * Épure décalée : A(x) = max de A sur [x − a_l, x + a_l], A étant linéaire entre les sections du modèle. Les bornes
 * x ± a_l sont interpolées : sinon, avec un pas de sections (0,9 m) supérieur à a_l (0,65 m), le décalage serait sans effet.
 */
export function shiftedEnvelope(xs, A, al) {
  const at = x => { // valeur(s) interpolée(s) en x (max des deux côtés d'une discontinuité)
    let v = -Infinity;
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i], b = xs[i + 1];
      if (b > a && x > a - 1e-12 && x < b + 1e-12) v = Math.max(v, A[i] + (A[i + 1] - A[i]) * (x - a) / (b - a));
    }
    return v;
  };
  return xs.map(x => Math.max(...A.filter((_, i) => Math.abs(xs[i] - x) <= al + 1e-9), at(x - al), at(x + al)));
}

/**
 * Intervalles où f(x) > A (x croissants), bornés à [lo, hi] ; f est linéaire entre les sections, les extrémités des
 * intervalles sont les abscisses interpolées où f franchit A (et non la section la plus proche, à 0,9 m près).
 */
function exceed(xs, f, A, lo, hi) {
  const out = []; let cur = null;
  const cross = (i, j) => (xs[j] > xs[i] && f[j] !== f[i] ? xs[i] + (A - f[i]) * (xs[j] - xs[i]) / (f[j] - f[i]) : xs[j]);
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < lo - 1e-9 || xs[i] > hi + 1e-9) continue;
    const prevIn = i > 0 && xs[i - 1] >= lo - 1e-9;
    if (f[i] > A + 1e-9) {
      if (!cur) cur = { x1: prevIn && f[i - 1] <= A + 1e-9 ? Math.max(lo, cross(i - 1, i)) : xs[i], x2: xs[i] };
      cur.x2 = xs[i];
    } else if (cur) { cur.x2 = Math.min(hi, cross(i - 1, i)); out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

/** Découpe une barre de longueur ℓ en éléments ≤ Lmax avec recouvrements l₀. */
function pieces(len, l0, Lmax = 12) {
  if (len <= Lmax) return { n: 1, total: len };
  const n = Math.ceil((len - l0) / (Lmax - l0));
  return { n, total: len + (n - 1) * l0 };
}

/**
 * Plan de ferraillage complet.
 * @param {object} p
 * @param {import('./analysis.js').SlabDeck} p.deck
 * @param {object} p.design   designEC (envBot, envTop, d, h, c, mins, shear) — éventuellement enveloppé avec chantier/LM3
 * @param {object} [p.trans]  designTransverseEC (spans[j].bot.As / top.As, skew)
 * @param {{fck,fyk,phiLong,phiTrans,cEnd}} [p.opt]
 */
export function rebarPlan({ deck, design, trans = null, opt = {} }) {
  const { fck = 35, fyk = 500, phiLong = 20, phiTrans = 16, cEnd = 0.05, Lmax = 12 } = opt;
  const h = deck.h, d = design.d, c = design.c, width = 2 * deck.b;
  const secs = deck.beam.sections, xs = secs.map(s => s.x), x0 = deck.beam.x0, n = deck.spans.length;
  const [aL, aR] = deck.g.overhangs || [0, 0];
  const xStart = -aL + cEnd, xEnd = deck.beam.Ltot + aR - cEnd;
  const al = d;
  const sMaxPeak = Math.min(2 * h, 0.25), sMaxMain = Math.min(3 * h, 0.40);
  const bot = shiftedEnvelope(xs, design.envBot, al), top = shiftedEnvelope(xs, design.envTop, al);
  const nBarsAcross = s => Math.floor((width - 2 * c) / s + 1e-9) + 1;
  const marks = []; let id = 0;
  const add = m => { m.mark = ++id; m.mass = m.count * m.totalLen * massPerM(m.phi); marks.push(m); return m; };
  const anchB = phi => anchorage(phi, { fck, fyk, top: false, h }), anchT = phi => anchorage(phi, { fck, fyk, top: true, h });

  // ---------------- nappe inférieure : par travée, filantes (≥ 50 % et zones d'appui) + renforts alternés
  const spansBot = [];
  for (let j = 0; j < n; j++) {
    const idx = secs.map((s, i) => (s.span === j ? i : -1)).filter(i => i >= 0);
    const L = deck.spans[j], peak = Math.max(...idx.map(i => bot[i]));
    const nearSup = Math.max(...idx.filter(i => secs[i].frac <= 0.15 || secs[i].frac >= 0.85).map(i => bot[i]));
    const Af = Math.max(0.5 * peak, nearSup, design.mins.perFace);
    // espacement commun s : filantes φf/s, renforts φr/s intercalés (espacement résultant s/2)
    let best = null;
    for (const s of [0.20, 0.25, 0.30].filter(v => v <= sMaxMain + 1e-9)) {
      const f = chooseBars(Af, { phiMin: Math.min(phiLong, 16), sMax: s, sMin: s });
      if (f.insufficient) continue;
      const need = Math.max(peak - f.As, 0);
      const r = need > 1e-9 ? chooseBars(need, { phiMin: 12, sMax: s, sMin: s }) : null;
      if (r && r.insufficient) continue;
      const mass = f.As * pen(f.phi) + (r ? r.As * pen(r.phi) * 0.6 : 0);
      if (!best || mass < best.mass) best = { s, f, r, mass };
    }
    if (!best) { const f = chooseBars(peak, { phiMin: phiLong, sMax: sMaxPeak }); best = { s: f.s, f, r: null }; }
    const a = anchB(best.f.phi);
    const leftEnd = j === 0, rightEnd = j === n - 1;
    const x1 = leftEnd ? xStart : x0[j] - a.l0 / 2, x2 = rightEnd ? xEnd : x0[j + 1] + a.l0 / 2;
    const len = x2 - x1, pc = pieces(len, a.l0, Lmax);
    const filante = add({ face: 'inf', dir: 'long', role: 'filante', span: j, phi: best.f.phi, s: best.s, x1, x2, len, pieces: pc.n, totalLen: pc.total, count: nBarsAcross(best.s),
      hookL: leftEnd, hookR: rightEnd, label: `Filantes inférieures travée ${j + 1}`, note: `${leftEnd ? 'ancrées par retour au-delà de C0 ; ' : ''}${rightEnd ? `ancrées par retour au-delà de C${n} ; ` : ''}recouvrement l₀ = ${a.l0.toFixed(2)} m sur appui intermédiaire` });
    let renfort = null;
    if (best.r) {
      const zones = exceed(xs, design.envBot, best.f.As, x0[j], x0[j + 1]).map(z => ({ x1: z.x1 - al, x2: z.x2 + al })); // épure décalée de a_l
      const ar = anchB(best.r.phi);
      if (zones.length) {
        let r1 = Math.max(x0[j], Math.min(...zones.map(z => z.x1)) - ar.lbd), r2 = Math.min(x0[j + 1], Math.max(...zones.map(z => z.x2)) + ar.lbd);
        if ((r2 - r1) > 0.85 * L) { r1 = x1; r2 = x2; }
        renfort = add({ face: 'inf', dir: 'long', role: 'renfort', span: j, phi: best.r.phi, s: best.s, x1: r1, x2: r2, len: r2 - r1, pieces: pieces(r2 - r1, ar.l0, Lmax).n, totalLen: pieces(r2 - r1, ar.l0, Lmax).total, count: nBarsAcross(best.s),
          label: `Renforts inférieurs travée ${j + 1}`, note: `intercalés entre les filantes ; arrêt à l_bd = ${ar.lbd.toFixed(2)} m au-delà de l'épure décalée (a_l = d)` });
      }
    }
    spansBot.push({ j, peak, Af, filante, renfort, provided: x => (x >= filante.x1 && x <= filante.x2 ? areaOf(filante.phi) / filante.s : 0) + (renfort && x >= renfort.x1 && x <= renfort.x2 ? areaOf(renfort.phi) / renfort.s : 0) });
  }

  // ---------------- nappe supérieure : filantes sur toute la longueur + renforts sur appuis intermédiaires
  // zones de travée (à plus de 0,35 L d'un appui intermédiaire) : les filantes y suffisent, les renforts couvrent le reste
  const outside = secs.map((s, i) => i).filter(i => x0.slice(1, n).every(xa => Math.abs(xs[i] - xa) >= 0.35 * deck.spans[secs[i].span] - 1e-9));
  const AfTop = Math.max(design.mins.perFace, ...outside.map(i => top[i]));
  const peakTop = Math.max(...top);
  let bestT = null;
  const Ltop = deck.beam.Ltot + aL + aR;
  for (const s of [0.15, 0.20, 0.25, 0.30].filter(v => v <= sMaxMain + 1e-9)) {
    const f = chooseBars(AfTop, { phiMin: 12, sMax: s, sMin: s });
    if (f.insufficient) continue;
    let ok = true, mass = f.As * pen(f.phi) * Ltop;
    const rs = [];
    for (let i = 1; i < n; i++) {
      const pk = Math.max(...secs.map((q, k) => (Math.abs(xs[k] - x0[i]) <= 0.5 * Math.min(deck.spans[i - 1], deck.spans[i]) ? top[k] : 0)));
      const need = Math.max(pk - f.As, 0);
      const r = need > 1e-9 ? chooseBars(need, { phiMin: 12, sMax: s, sMin: s }) : null;
      if (r && r.insufficient) { ok = false; break; }
      rs.push({ i, pk, r }); if (r) mass += r.As * pen(r.phi) * 0.25 * (deck.spans[i - 1] + deck.spans[i]);
    }
    if (ok && (!bestT || mass < bestT.mass)) bestT = { s, f, rs, mass };
  }
  const aTf = anchT(bestT.f.phi);
  const topLen = xEnd - xStart, pcT = pieces(topLen, aTf.l0, Lmax);
  const filTop = add({ face: 'sup', dir: 'long', role: 'filante', span: null, phi: bestT.f.phi, s: bestT.s, x1: xStart, x2: xEnd, len: topLen, pieces: pcT.n, totalLen: pcT.total, count: nBarsAcross(bestT.s), hookL: true, hookR: true,
    label: 'Filantes supérieures', note: `${pcT.n} élément(s) ≤ ${Lmax} m, recouvrements l₀ = ${aTf.l0.toFixed(2)} m de préférence en travée (moments faibles en fibre supérieure)` });
  const supTop = [];
  for (const { i, pk, r } of bestT.rs) {
    if (!r) { supTop.push({ i, pk, renfort: null }); continue; }
    const ar = anchT(r.phi);
    const zones = exceed(xs, design.envTop, bestT.f.As, x0[i] - deck.spans[i - 1] * 0.5, x0[i] + deck.spans[i] * 0.5).map(z => ({ x1: z.x1 - al, x2: z.x2 + al })); // épure décalée de a_l
    const r1 = Math.max(x0[i - 1], Math.min(...zones.map(z => z.x1)) - ar.lbd), r2 = Math.min(x0[i + 1], Math.max(...zones.map(z => z.x2)) + ar.lbd);
    const pc = pieces(r2 - r1, ar.l0, Lmax);
    const m = add({ face: 'sup', dir: 'long', role: 'renfort', support: i, phi: r.phi, s: bestT.s, x1: r1, x2: r2, len: r2 - r1, pieces: pc.n, totalLen: pc.total, count: nBarsAcross(bestT.s),
      label: `Renforts supérieurs sur P${i}`, note: `intercalés ; ${(x0[i] - r1).toFixed(2)} m côté travée ${i} et ${(r2 - x0[i]).toFixed(2)} m côté travée ${i + 1} (épure décalée + l_bd = ${ar.lbd.toFixed(2)} m)` });
    supTop.push({ i, pk, renfort: m });
  }
  const providedTop = x => (x >= filTop.x1 && x <= filTop.x2 ? areaOf(filTop.phi) / filTop.s : 0) + supTop.reduce((a, t) => a + (t.renfort && x >= t.renfort.x1 && x <= t.renfort.x2 ? areaOf(t.renfort.phi) / t.renfort.s : 0), 0);
  const providedBot = x => spansBot.reduce((a, sp) => a + sp.provided(x), 0);

  // ---------------- aciers transversaux par travée (parallèles aux lignes d'appui ou perpendiculaires aux bords libres)
  const transMarks = [];
  if (trans) {
    const sinPsi = trans.skew ? trans.skew.sinPsi : 1;
    const sMaxSec = Math.min(3 * h, 0.40);
    trans.spans.forEach(sp => {
      for (const [face, req] of [['inf', sp.bot.As], ['sup', sp.top.As]]) {
        const b = chooseBars(req, { phiMin: Math.min(phiTrans, 12), phiMax: 25, sMax: sMaxSec });
        const lenBar = (width - 2 * c) / sinPsi + 2 * 10 * b.phi / 1000; // retours 10φ aux bords libres
        const L = deck.spans[sp.j];
        const count = Math.floor(L * sinPsi / b.s) + 1;
        transMarks.push(add({ face, dir: 'trans', role: 'courant', span: sp.j, phi: b.phi, s: b.s, len: lenBar, pieces: 1, totalLen: lenBar, count, label: `Transversaux ${face === 'inf' ? 'inférieurs' : 'supérieurs'} travée ${sp.j + 1}`,
          note: `${trans.skew && trans.skew.psi2 < 100 ? 'parallèles aux lignes d\'appui' : 'perpendiculaires aux bords libres'}, requis ${(req * 1e4).toFixed(1)} cm²/m, retours 10φ aux bords libres`, req, provided: b.As }));
      }
    });
  }

  // ---------------- cadres de chaînage des bords libres (guide § 3.4.5 : ≥ 5 cm²/m) et épingles d'effort tranchant
  const Ltot = xEnd - xStart;
  const cad = chooseBars(5e-4, { phiMin: 10, phiMax: 14, sMax: 0.25 });
  const cadLen = 2 * (h - 2 * c) + 2 * Math.max(h - 2 * c, 0.3) + 2 * 10 * cad.phi / 1000;
  add({ face: 'bord', dir: 'cadre', role: 'chaînage', phi: cad.phi, s: cad.s, len: cadLen, pieces: 1, totalLen: cadLen, count: 2 * (Math.floor(Ltot / cad.s) + 1), label: 'Cadres de chaînage des bords libres', note: `largeur h = ${h.toFixed(2)} m le long de chaque bord libre, ${(cad.As * 1e4).toFixed(1)} cm²/m ≥ 5 (guide § 3.4.5)` });
  const shearZones = [];
  let cur = null;
  design.shear.forEach((v, i) => { if (v.AswS > 1e-9) { if (!cur) cur = { x1: xs[i], x2: xs[i], A: v.AswS }; cur.x2 = xs[i]; cur.A = Math.max(cur.A, v.AswS); } else if (cur) { shearZones.push(cur); cur = null; } });
  if (cur) shearZones.push(cur);
  const stirrups = shearZones.map(z => {
    const phi = z.A > 12e-4 ? 12 : 10, a = areaOf(phi);
    let st = Math.min(Math.sqrt(a / z.A), 0.75 * d, 0.40); st = Math.floor(st / 0.025) * 0.025 || 0.10;
    const len = h - 2 * c + 2 * 10 * phi / 1000;
    const zx1 = z.x1 - d / 2, zx2 = z.x2 + d / 2;
    const count = Math.ceil((zx2 - zx1) / st) * Math.ceil(width / st);
    return add({ face: 'âme', dir: 'vertical', role: 'épingles', phi, s: st, x1: zx1, x2: zx2, len, pieces: 1, totalLen: len, count, label: `Épingles d'effort tranchant x ∈ [${zx1.toFixed(1)} ; ${zx2.toFixed(1)}]`, note: `A_sw/s requis ${(z.A * 1e4).toFixed(1)} cm²/m², maille ${(st * 100).toFixed(1)} × ${(st * 100).toFixed(1)} cm (≤ 0,75 d)` });
  });

  // ---------------- contrôle A_s mis en place ≥ requis (épure non décalée et décalée)
  const check = xs.map((x, i) => ({ x, reqBot: design.envBot[i], reqTop: design.envTop[i], shBot: bot[i], shTop: top[i], provBot: providedBot(x), provTop: providedTop(x) }));
  const deficits = check.filter(r => r.provBot + 1e-7 < Math.max(r.reqBot, r.shBot) || r.provTop + 1e-7 < Math.max(r.reqTop, r.shTop));
  const totalMass = marks.reduce((a, m) => a + m.mass, 0);
  const volume = deck.area * (deck.beam.Ltot + aL + aR);
  return { c, marks, spansBot, filTop, supTop, transMarks, stirrups, check, deficits, totalMass, volume, ratio: totalMass / volume, al, sMaxPeak, sMaxMain, xStart, xEnd };
}
