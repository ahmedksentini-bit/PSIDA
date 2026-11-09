/**
 * Feuilles de ferraillage des cadres et portiques (PICF, PIPO), à partir des repères de src/plans/cadre.js :
 *
 *  1. COUPES ET DÉTAILS : coupe transversale armée (lits décalés lisibles, cintrages au mandrin, bulles rangées
 *     au-dessus de la traverse, sous le radier et de part et d'autre des piédroits, chaînes de cotes) ; détails des
 *     nœuds à grande échelle (angle supérieur, angle inférieur, nœud sur voile intermédiaire) aux positions réelles des
 *     lits, avec enrobage, recouvrements, chapeaux et équerres cotés ; coupe longitudinale complète dans la cellule 1
 *     (traverse et radier coupés, piédroit vu au-delà, tronçons de répartition et recouvrements décalés, abouts).
 *  2. VUES EN PLAN : traverse et radier en demi-vues (nappe supérieure / nappe inférieure), biais, espacements,
 *     chapeaux, équerres, tronçons de répartition recouverts et décalés d'une barre à l'autre.
 *  3. NOMENCLATURE ET FAÇONNAGE : chaque repère dessiné à part dans sa position de pose (sans échelle), cotes de
 *     façonnage A, B, C, longueur de coupe, mandrin ; bordereau ISO 4066 et récapitulatif par diamètre.
 *
 * Coordonnées de la coupe : x depuis le parement extérieur gauche, z depuis la sous-face du radier (m). Les vues
 * dépendant de l'échelle (décalages des lits, bulles) sont reconstruites à chaque échelle essayée par la mise en page.
 */
import { Vue, fmtCote } from './dessin.js';
import { rayonCintrage, recapitulatif } from './bordereau.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { reperesCadre, contourBeton, lignesBordereau, desig, numeroter, nomOuvrage } from './cadre.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const esp = s => fr(s * 100, Math.abs(s * 100 - Math.round(s * 100)) > 1e-6 ? 1 : 0);
const biaise = G => Math.abs(G.biais - 90) > 1e-6;

/* ------------------------------------------------------------------------------------------ outils */
/** Polyligne aux angles arrondis (rayon r, m) : cintrage au mandrin. */
export function arrondir(pts, r) {
  if (!(r > 0) || pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (la < 1e-9 || lc < 1e-9) { out.push(b); continue; }
    const u = [(b[0] - a[0]) / la, (b[1] - a[1]) / la], w = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc];
    const th = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1])));
    if (th < 1e-3) { out.push(b); continue; }
    const t = Math.min(r * Math.tan(th / 2), 0.45 * la, 0.45 * lc), rr = t / Math.tan(th / 2);
    const p0 = [b[0] - u[0] * t, b[1] - u[1] * t], sg = Math.sign(u[0] * w[1] - u[1] * w[0]);
    const ctr = [p0[0] - sg * u[1] * rr, p0[1] + sg * u[0] * rr], a0 = Math.atan2(p0[1] - ctr[1], p0[0] - ctr[0]);
    const k = 6; for (let q = 0; q <= k; q++) { const ang = a0 + sg * th * q / k; out.push([ctr[0] + rr * Math.cos(ang), ctr[1] + rr * Math.sin(ang)]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Découpe d'une polyligne par un rectangle [x0, z0, x1, z1] (Liang-Barsky par segment) : morceaux visibles. */
export function decouper(pts, [x0, z0, x1, z1]) {
  const morceaux = []; let cur = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dz, a[1] - z0], [dz, z1 - a[1]]]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) { ok = false; break; } continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (!ok || t1 - t0 < 1e-9) { cur = null; continue; }
    const A = [a[0] + t0 * dx, a[1] + t0 * dz], B = [a[0] + t1 * dx, a[1] + t1 * dz];
    if (cur && t0 < 1e-9) cur.push(B); else { cur = [A, B]; morceaux.push(cur); }
    if (t1 < 1 - 1e-9) cur = null;
  }
  return morceaux;
}

/** Positions 1D écartées d'au moins `gap`, au plus près des positions souhaitées (ordre conservé). */
export function etaler(prefs, gap, [lo, hi] = [-Infinity, Infinity]) {
  const ord = prefs.map((p, i) => ({ i, p })).sort((a, b) => a.p - b.p), pos = ord.map(o => o.p);
  for (let k = 1; k < pos.length; k++) pos[k] = Math.max(pos[k], pos[k - 1] + gap);
  // recentrage : déplacement moyen nul, puis rentrée dans [lo, hi] si possible
  const moy = ord.reduce((s, o, k) => s + pos[k] - o.p, 0) / (ord.length || 1);
  for (let k = 0; k < pos.length; k++) pos[k] -= moy;
  if (pos.length && pos[0] < lo) { const d = lo - pos[0]; for (let k = 0; k < pos.length; k++) pos[k] += d; }
  if (pos.length && pos[pos.length - 1] > hi && pos[0] - (pos[pos.length - 1] - hi) >= lo) { const d = pos[pos.length - 1] - hi; for (let k = 0; k < pos.length; k++) pos[k] -= d; }
  for (let k = 1; k < pos.length; k++) pos[k] = Math.max(pos[k], pos[k - 1] + gap);
  const out = []; ord.forEach((o, k) => { out[o.i] = pos[k]; }); return out;
}

/** Point d'un repère le plus proche de la droite axe = val (axe 0 : x, 1 : z), côté `cote` (+1 : plus grand). */
function cibleSur(geo, m, val, axe, cote) {
  let best = null, sc = Infinity;
  const essai = (p, d) => { const s = d * 1e3 - cote * p[1 - axe]; if (s < sc) { sc = s; best = p; } };
  for (const t of geo.traits) if (t.m === m) for (let i = 0; i + 1 < t.pts.length; i++) {
    const a = t.pts[i], b = t.pts[i + 1], da = b[axe] - a[axe];
    if (Math.abs(da) < 1e-9) { const p = (b[1 - axe] - a[1 - axe]) * cote > 0 ? b : a; essai(p, Math.abs(a[axe] - val)); continue; }
    const u = Math.max(0, Math.min(1, (val - a[axe]) / da)), p = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
    essai(p, Math.abs(p[axe] - val));
  }
  for (const q of geo.points) if (q.m === m) essai(q.c, Math.abs(q.c[axe] - val));
  return best;
}

/**
 * Bulles rangées sur une ligne : axe 'x' (rangée horizontale à l'ordonnée `at`, renvois verticaux, désignation
 * écrite verticalement) ou 'z' (colonne à l'abscisse `at`, renvois horizontaux). sens = +1 : textes vers le haut /
 * la droite. items : [{ m, pref }] ; geo : géométrie des barres de la vue.
 */
function ranger(v, geo, items, { axe, at, k, sens, bornes, texte = desig }) {
  if (!items.length) return;
  const P = etaler(items.map(q => q.pref), 7.4 * k, bornes);
  items.forEach((q, i) => {
    const b = axe === 'x' ? [P[i], at] : [at, P[i]], ia = axe === 'x' ? 0 : 1;
    const t = q.cible ? q.cible(P[i]) : cibleSur(geo, q.m, P[i], ia, sens);
    v.repere(b, q.m.mark, t);
    const s = texte(q.m);
    if (axe === 'x') v.texte('TEXTES', [b[0], b[1] + sens * 4.2 * k], s, { h: 2.2, ancre: sens > 0 ? 'g' : 'd', v: 'm', angle: 90 });
    else v.texte('TEXTES', [b[0] + sens * 4.2 * k, b[1]], s, { h: 2.4, ancre: sens > 0 ? 'g' : 'd', v: 'm' });
  });
}

/** Tronçons [a, b] de nP pièces recouvertes de l0 : [[a0, b0], …]. */
function troncons(a, b, nP, l0) {
  if (!(nP > 1)) return [[a, b]];
  const L = b - a, lp = (L + (nP - 1) * l0) / nP, out = [];
  for (let q = 0; q < nP; q++) { const x0 = a + q * (lp - l0); out.push([x0, Math.min(b, x0 + lp)]); }
  return out;
}

/* ------------------------------------------------------------------- géométrie des barres dans la coupe */
/**
 * Barres de la coupe transversale : traits { m, pts } (cintrés) et points { m, c } (barres coupées).
 * lit(φ) : épaisseur de dessin d'un lit (m) — φ réel dans les détails, majoré dans la coupe d'ensemble.
 * Lits depuis chaque parement : traverse sup. (nappe filante, chapeaux, répartition), traverse inf. (nappe de la
 * cellule, équerres, répartition, filants d'angle), piédroit ext. (verticales, retours des nappes filantes, retours des
 * chapeaux, horizontales), piédroit int. et voiles (verticales, équerres, horizontales, filants d'angle).
 */
export function barresCoupe(G, marks, c, lit, { cintrer = true } = {}) {
  const { n, xL, xR, W, zi, zt, zT, ouvert } = G;
  const M1 = p => marks.find(m => m.pos === p), MA = p => marks.filter(m => m.pos === p).sort((a, b) => (a.piece || 0) - (b.piece || 0));
  const ph = (...ps) => Math.max(0, ...ps.map(p => marks.filter(m => m.pos === p).reduce((s, m) => Math.max(s, m.phi), 0)));
  const off = (L, k) => { let s = c; for (let j = 0; j < k; j++) s += lit(L[j]); return s + lit(L[k]) / 2; };
  const traits = [], points = [];
  const trait = (m, pts) => { if (m && pts.length > 1) traits.push({ m, pts: cintrer ? arrondir(pts, rayonCintrage(m.phi) / 1000) : pts }); };
  const point = (m, p) => { if (m) points.push({ m, c: p }); };
  const rangeePoints = (m, a, b, fixe, axe, s) => {
    if (!m || b <= a) return;
    const nb = Math.max(1, Math.min(80, Math.round((b - a) / (s || 0.2))));
    for (let q = 0; q <= nb; q++) { const u = a + (b - a) * q / nb; point(m, axe === 'x' ? [u, fixe] : [fixe, u]); }
  };
  // lits
  const LTs = [ph('trExt'), ph('trChA', 'trChM'), ph('trRepE')], LTi = [ph('trInt'), ph('gSup'), ph('trRepI'), ph('gSupR')];
  const LRo = [ph('raExt'), ph('raChA', 'raChM'), ph('raRepE')], LRi = [ph('raInt'), ph('gInf'), ph('raRepI'), ph('gInfR')];
  const zTs = k => zT - off(LTs, k), zTi = k => zt + off(LTi, k), zRo = k => off(LRo, k), zRi = k => zi - off(LRi, k);
  const face = (j, cote) => {   // repère des verticales d'une face de voile : j, cote 'g' (face en xL[j]) ou 'd' (xR[j])
    if (j === 0 && cote === 'g') return M1('pExt') || M1('pgExt');
    if (j === 0) return M1('pInt') || M1('pgInt');
    if (j === n && cote === 'd') return M1('pExt') || M1('pdExt');
    if (j === n) return M1('pInt') || M1('pdInt');
    return M1('voile');
  };
  const ext = (j, cote) => (j === 0 && cote === 'g') || (j === n && cote === 'd');
  const lits = (j, cote) => ext(j, cote) ? [face(j, cote)?.phi || 0, ph('trExt', 'raExt'), ph('trChA', 'raChA'), ph('pRep')]
    : [face(j, cote)?.phi || 0, ph('gSup', 'gInf'), ph('pRep'), ph('gSupR', 'gInfR')];
  const xF = (j, cote, k) => (cote === 'g' ? xL[j] + off(lits(j, cote), k) : xR[j] - off(lits(j, cote), k));

  // verticales des piédroits et des voiles (tronçons éventuels, recouvrements décalés)
  for (let j = 0; j <= n; j++) for (const cote of ['g', 'd']) {
    const m = face(j, cote); if (!m) continue;
    const z0 = ouvert ? -(m.lbd || 0.5) : c, z1 = zT - c, x = xF(j, cote, 0), dx = (cote === 'g' ? 1 : -1) * lit(m.phi) * 0.7;
    troncons(z0, z1, m.nP, m.l0).forEach(([a, b], q) => trait(m, [[x + (q % 2) * dx, a], [x + (q % 2) * dx, b]]));
  }
  // nappes extérieures filantes (U ; pièces d'extrémité en L et pièces courantes si plus de 12 m)
  for (const [pre, zf, sg] of [['tr', zTs(0), -1], ['ra', ouvert ? null : zRo(0), 1]]) {
    const U = MA(`${pre}Ext`); if (!U.length || zf == null) continue;
    const xa = xF(0, 'g', 1), xb = xF(n, 'd', 1), zl = sg < 0 ? zT - c - U[0].leg : c + U[0].leg, nP = U[0].nP || 1;
    if (nP === 1) trait(U[0], [[xa, zl], [xa, zf], [xb, zf], [xb, zl]]);
    else troncons(xa, xb, nP, U[0].l0).forEach(([a, b], q) => {
      const z = zf + sg * (q % 2) * lit(U[0].phi) * 0.7, m = q === 0 || q === nP - 1 ? U[0] : U[1] || U[0];
      trait(m, q === 0 ? [[a, zl], [a, z], [b, z]] : q === nP - 1 ? [[a, z], [b, z], [b, zl]] : [[a, z], [b, z]]);
    });
  }
  // chapeaux d'angle (L) et chapeaux sur voiles intermédiaires
  for (const [pre, zf, sg] of [['tr', zTs(1), -1], ['ra', ouvert ? null : zRo(1), 1]]) {
    if (zf == null) continue;
    const ca = M1(`${pre}ChA`), cm = M1(`${pre}ChM`);
    if (ca) for (const j of ca.noeuds) {
      const xv = j === 0 ? xF(0, 'g', 2) : xF(n, 'd', 2), zl = sg < 0 ? zT - c - ca.vert : c + ca.vert, x1 = j === 0 ? xR[0] + ca.ext : xL[n] - ca.ext;
      trait(ca, [[xv, zl], [xv, zf], [x1, zf]]);
    }
    if (cm) for (const j of cm.noeuds) trait(cm, [[xL[j] - cm.ext, zf], [xR[j] + cm.ext, zf]]);
  }
  // nappes intérieures (une par cellule, jusqu'à l'enrobage opposé des voiles)
  for (const [pre, zf, sg] of [['tr', zTi(0), 1], ['ra', ouvert ? null : zRi(0), -1]]) {
    if (zf == null) continue;
    for (const m of MA(`${pre}Int`)) for (const i of m.cellules)
      troncons(xL[i] + c, xR[i + 1] - c, m.nP, m.l0).forEach(([a, b], q) => trait(m, [[a, zf + sg * (q % 2) * lit(m.phi) * 0.7], [b, zf + sg * (q % 2) * lit(m.phi) * 0.7]]));
  }
  // équerres d'angle (renforts de goussets) et leurs filants
  for (const [pos, zh, zr, sg] of [['gSup', zTi(1), zTi(3), -1], ['gInf', ouvert ? null : zRi(1), ouvert ? null : zRi(3), 1]]) {
    const m = M1(pos), r = M1(pos + 'R'); if (!m || zh == null) continue;
    for (let i = 0; i < n; i++) for (const [j, cote, s] of [[i, 'd', 1], [i + 1, 'g', -1]]) {
      const xv = xF(j, cote, 1), xr = xF(j, cote, 3);
      trait(m, [[xv + s * m.Lg, zh], [xv, zh], [xv, zh + sg * m.leg]]);
      if (r) {   // n φ₂ répartis à l'intérieur de l'équerre, le long des deux branches
        const Lh = m.Lg - Math.abs(xr - xv), Lv = m.leg - Math.abs(zr - zh), tot = Lh + Lv;
        for (let q = 0; q < r.nParAngle; q++) {
          const u = tot * (q + 0.5) / r.nParAngle;
          point(r, u < Lh ? [xr + s * (Lh - u + 0.02), zr] : [xr, zr + sg * (u - Lh + 0.02)]);
        }
      }
    }
  }
  // répartition : barres coupées
  const rT = M1('trRepE'), rTi = M1('trRepI'), rR = M1('raRepE'), rRi = M1('raRepI'), rP = M1('pRep');
  rangeePoints(rT, xF(0, 'g', 3) + 0.03, xF(n, 'd', 3) - 0.03, zTs(2), 'x', rT?.s);
  if (!ouvert) rangeePoints(rR, xF(0, 'g', 3) + 0.03, xF(n, 'd', 3) - 0.03, zRo(2), 'x', rR?.s);
  for (let i = 0; i < n; i++) {
    rangeePoints(rTi, xR[i] + 0.04, xL[i + 1] - 0.04, zTi(2), 'x', rTi?.s);
    if (!ouvert) rangeePoints(rRi, xR[i] + 0.04, xL[i + 1] - 0.04, zRi(2), 'x', rRi?.s);
  }
  if (rP) for (let j = 0; j <= n; j++) for (const cote of ['g', 'd']) rangeePoints(rP, (ouvert ? 0 : zi) + 0.05, zt - 0.05, xF(j, cote, 3), 'z', rP.s);
  return { traits, points, zTs, zTi, zRo, zRi, xF };
}

function dessinerBarres(v, geo, rp) {
  for (const t of geo.traits) v.poly('ACIERS', t.pts);
  for (const q of geo.points) v.cercle('ACIERS_COUPES', q.c, rp(q.m), true);
}

/* ------------------------------------------------------------------------------- coupe d'ensemble */
const famille = m => (/^(tr|gSup)/.test(m.pos) ? 'haut' : /^(ra|gInf)/.test(m.pos) ? 'bas' : /^(pd)/.test(m.pos) || m.pos === 'voile' ? 'droite' : 'gauche');

/** Fenêtres des détails (coordonnées de la coupe) : A angle supérieur, B angle inférieur, C nœud sur voile. */
function fenetresDetails(G, marks, c) {
  const { n, xL, xR, W, zi, zt, zT, ouvert } = G, M1 = p => marks.find(m => m.pos === p);
  const tE = M1('trExt'), ca = M1('trChA'), gS = M1('gSup'), rE = M1('raExt'), ra = M1('raChA'), gI = M1('gInf'), cm = M1('trChM');
  const out = [];
  const hx = Math.max(ca?.ext || 0, gS?.Lg || 0, 0.4) + 0.25, hzA = Math.max(tE?.leg || 0, ca?.vert || 0, (gS?.leg || 0) + (zT - zt), 0.6) + 0.25;
  out.push({ id: 'A', titre: 'DÉTAIL A — ANGLE SUPÉRIEUR', w: [-0.02, Math.max(0, zT - hzA), Math.min(xR[0] + hx, n === 1 ? (xR[0] + xL[1]) / 2 : xL[1] - 0.05), zT + 0.02], coin: 'hg' });
  if (!ouvert) {
    const hzB = Math.max(rE?.leg || 0, ra?.vert || 0, (gI?.leg || 0) + zi, 0.6) + 0.25, hxB = Math.max(ra?.ext || 0, gI?.Lg || 0, 0.4) + 0.25;
    out.push({ id: 'B', titre: 'DÉTAIL B — ANGLE INFÉRIEUR', w: [-0.02, -0.02, Math.min(xR[0] + hxB, n === 1 ? (xR[0] + xL[1]) / 2 : xL[1] - 0.05), Math.min(zT, hzB)], coin: 'bg' });
  }
  if (n > 1) {
    const hx2 = Math.max(cm?.ext || 0, gS?.Lg || 0, 0.4) + 0.25, hz2 = Math.max((gS?.leg || 0) + (zT - zt), 0.5) + 0.25;
    out.push({ id: 'C', titre: 'DÉTAIL C — NŒUD SUR VOILE INTERMÉDIAIRE', w: [Math.max(xR[0] + 0.05, xL[1] - hx2), Math.max(0, zT - hz2), Math.min(xL[2] - 0.05, xR[1] + hx2), zT + 0.02], coin: 'h' });
  }
  return out;
}

function vueCoupeArmatures(G, marks, h, e = 50) {
  const v = new Vue('COUPE TRANSVERSALE — ARMATURES'), c = h.enrobage, k = e / 1000, { n, xL, xR, W, zi, zt, zT, ouvert } = G;
  contourBeton(v, G, { hachures: false });
  const tmin = Math.min(...G.g.ouv.map(() => 1), ...Array.from({ length: n + 1 }, (_, j) => xR[j] - xL[j]), G.et, ouvert ? 9 : G.er);
  const minW = Math.min(0.55 * k, Math.max(0.004, (tmin / 2 - c) / 4.5));
  const geo = barresCoupe(G, marks, c, phi => (phi ? Math.max(phi / 1000, minW) : 0));
  dessinerBarres(v, geo, m => Math.max(m.phi / 2000, 0.38 * k));
  if (ouvert) {   // portique : semelles (plan propre) sous les piédroits, verticales ancrées de l_bd
    const lbd = Math.max(0.3, ...marks.filter(m => /Ext$|Int$|voile/.test(m.pos) && m.lbd).map(m => m.lbd));
    for (let j = 0; j <= n; j++) {
      const xa = xL[j] - 0.4, xb = xR[j] + 0.4, zb = -lbd - 0.15;
      v.poly('VUES', [[xa, 0], [xb, 0], [xb, zb], [xa, zb]], true);
      if (j === 0) v.texte('TEXTES', [(xa + xb) / 2, zb - 1.5 * k], 'semelle : plan propre', { h: 2.0, ancre: 'c', v: 'h' });
    }
  }
  // reprises de bétonnage (arase du radier, position indicative) et repères des détails
  if (!ouvert) for (let j = 0; j <= n; j++) v.ligne('VUES', [xL[j] - 0.03, zi], [xR[j] + 0.03, zi]);
  if (!ouvert) v.texte('TEXTES', [xR[0] + 0.6 * k, zi + 1.2 * k], 'RB', { h: 2, ancre: 'g', v: 'b' });
  for (const D of fenetresDetails(G, marks, c)) {
    const [x0, z0, x1, z1] = D.w, bas = D.coin === 'bg';
    v.poly('VUES', [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
    v.texte('TEXTES', [x0 + (D.coin === 'h' ? 0.1 : -1.5 * k), bas ? z0 - 1.5 * k : z1 + 1.5 * k], D.id, { h: 3.5, ancre: D.coin === 'h' ? 'g' : 'd', v: bas ? 'h' : 'b', gras: true });
  }
  // chaînes de cotes : épaisseurs et ouvertures sous la coupe, hauteurs à droite
  const zc = (ouvert ? -Math.max(0.3, ...marks.filter(m => m.lbd).map(m => m.lbd)) - 0.15 - 6 * k : 0) - 7 * k, pts = [0]; for (let j = 0; j <= n; j++) { if (j > 0) pts.push(xL[j]); pts.push(xR[j]); }
  for (let q = 0; q + 1 < pts.length; q++) v.coteH([pts[q], 0], [pts[q + 1], 0], zc);
  v.coteH([0, 0], [W, 0], zc - 6 * k);
  const zs = ouvert ? [0, zt, zT] : [0, zi, zt, zT], xc = W + 7 * k;
  for (let q = 0; q + 1 < zs.length; q++) v.coteV([W, zs[q]], [W, zs[q + 1]], xc);
  v.coteV([W, 0], [W, zT], xc + 6 * k);
  // bulles : traverse au-dessus, radier au-dessous, piédroits à gauche, piédroit droit et voiles à droite
  const xc1 = (xR[0] + xL[1]) / 2, o1 = G.g.ouv[0];
  const pref = m => {
    const P = {
      trChA: (m.noeuds?.[0] === 0 ? xR[0] + 0.5 * (m.ext || 0) : xL[n] - 0.5 * (m.ext || 0)), raChA: (m.noeuds?.[0] === 0 ? xR[0] + 0.5 * (m.ext || 0) : xL[n] - 0.5 * (m.ext || 0)),
      gSup: xR[0] + 0.6 * (m.Lg || 0), gInf: xR[0] + 0.6 * (m.Lg || 0), gSupR: xR[0] + 0.2 * (m.Lg || 0), gInfR: xR[0] + 0.2 * (m.Lg || 0),
      trExt: m.piece ? W / 2 + 0.3 : xc1 - 0.3 * o1, raExt: m.piece ? W / 2 + 0.3 : xc1 - 0.3 * o1,
      trRepE: xc1 + 0.12 * o1, raRepE: xc1 + 0.12 * o1, trRepI: xc1 + 0.3 * o1, raRepI: xc1 + 0.3 * o1,
      trChM: m.noeuds ? xR[m.noeuds[0]] + 0.5 * m.ext : W / 2, raChM: m.noeuds ? xR[m.noeuds[0]] + 0.5 * m.ext : W / 2,
      pExt: zi + 0.25 * G.h, pgExt: zi + 0.25 * G.h, pdExt: zi + 0.25 * G.h, pInt: zi + 0.5 * G.h, pgInt: zi + 0.5 * G.h, pdInt: zi + 0.5 * G.h,
      pRep: zi + 0.75 * G.h, voile: zi + 0.6 * G.h,
    };
    if (/^(tr|ra)Int$/.test(m.pos)) { const i = m.cellules[0]; return (xR[i] + xL[i + 1]) / 2 - 0.05 * G.g.ouv[i]; }
    return P[m.pos] ?? W / 2;
  };
  const F = { haut: [], bas: [], gauche: [], droite: [] };
  for (const m of marks) F[famille(m)].push({ m, pref: pref(m) });
  const bornesX = [-2 * k, W + 2 * k];
  ranger(v, geo, F.haut, { axe: 'x', at: zT + 9 * k, k, sens: 1, bornes: bornesX });
  ranger(v, geo, F.bas, { axe: 'x', at: zc - 18 * k, k, sens: -1, bornes: bornesX });
  ranger(v, geo, F.gauche, { axe: 'z', at: -12 * k, k, sens: -1, bornes: [0, zT] });
  ranger(v, geo, F.droite, { axe: 'z', at: xc + 20 * k, k, sens: 1, bornes: [0, zT] });
  return v;
}

/* --------------------------------------------------------------------------------------- détails */
/** Détail d'un nœud à grande échelle : lits à leur position réelle, cotes d'enrobage, de recouvrement et de longueurs. */
function vueDetail(G, marks, h, D, e = 10) {
  const v = new Vue(D.titre), c = h.enrobage, k = e / 1000, { n, xL, xR, W, zi, zt, zT, ouvert } = G, M1 = p => marks.find(m => m.pos === p);
  const [x0, z0, x1, z1] = D.w;
  // béton : intersection de la coupe avec la fenêtre (contour vu + traits de coupure)
  const contour = [];
  if (ouvert) {
    const pts = [[0, 0], [xR[0], 0]]; for (let i = 0; i < n; i++) pts.push([xR[i], zt], [xL[i + 1], zt], [xL[i + 1], 0], [xR[i + 1], 0]); pts.push([W, zT], [0, zT], [0, 0]);
    contour.push(pts);
  } else {
    contour.push([[0, 0], [W, 0], [W, zT], [0, zT], [0, 0]]);
    for (let i = 0; i < n; i++) contour.push([[xR[i], zi], [xL[i + 1], zi], [xL[i + 1], zt], [xR[i], zt], [xR[i], zi]]);
  }
  for (const pts of contour) for (const mo of decouper(pts, D.w)) v.poly('COFFRAGE', mo);
  // traits de coupure (zigzag) là où la fenêtre tranche le béton
  const plein = (x, z) => x > 0 && x < W && z > 0 && z < zT && !(z > zi + 1e-9 && z < zt - 1e-9 && G.g.ouv.some((o, i) => x > xR[i] + 1e-9 && x < xL[i + 1] - 1e-9)) && !(ouvert && z < zt && G.g.ouv.some((o, i) => x > xR[i] && x < xL[i + 1]));
  const zig = (a, b) => {   // segment de coupure a → b avec une brisure au milieu
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nn = [-u[1], u[0]], d = 1.6 * k;
    v.poly('COFFRAGE', [a, [m[0] - u[0] * d, m[1] - u[1] * d], [m[0] - u[0] * d * 0.3 + nn[0] * d, m[1] - u[1] * d * 0.3 + nn[1] * d], [m[0] + u[0] * d * 0.3 - nn[0] * d, m[1] + u[1] * d * 0.3 - nn[1] * d], [m[0] + u[0] * d, m[1] + u[1] * d], b]);
  };
  const bord = (fixe, axe, lo, hi) => {   // parties pleines du bord de la fenêtre
    const N = 400; let deb = null;
    for (let q = 0; q <= N; q++) {
      const u = lo + (hi - lo) * q / N, p = axe === 'x' ? [fixe, u] : [u, fixe], ok = plein(...p) && q < N;
      if (ok && deb == null) deb = u; else if (!ok && deb != null) { const f = u; if (f - deb > 0.02) zig(axe === 'x' ? [fixe, deb] : [deb, fixe], axe === 'x' ? [fixe, f] : [f, fixe]); deb = null; }
    }
  };
  bord(x0, 'x', z0, z1); bord(x1, 'x', z0, z1); bord(z0, 'z', x0, x1); bord(z1, 'z', x0, x1);
  // aciers aux positions réelles
  const geo = barresCoupe(G, marks, c, phi => (phi ? phi / 1000 : 0));
  const vis = { traits: [], points: [] };
  for (const t of geo.traits) for (const mo of decouper(t.pts, D.w)) vis.traits.push({ m: t.m, pts: mo });
  for (const q of geo.points) if (q.c[0] >= x0 && q.c[0] <= x1 && q.c[1] >= z0 && q.c[1] <= z1) vis.points.push(q);
  for (const t of vis.traits) v.poly('ACIERS', t.pts);
  for (const q of vis.points) v.cercle('ACIERS_COUPES', q.c, q.m.phi / 2000, true);
  // cotes
  const haut = D.coin !== 'bg', zf = haut ? zT : 0, sg = haut ? 1 : -1;
  if (D.coin === 'hg' || D.coin === 'bg') {
    v.coteH([0, zf], [xR[0], zf], zf + sg * 6 * k);   // épaisseur du piédroit
    v.coteV([x1, haut ? zt : 0], [x1, haut ? zT : zi], x1 + 5 * k);   // épaisseur de la dalle
    v.coteH([0, zf], [c, zf], zf + sg * 12 * k, `c = ${fr(c * 100, 1)}`);
    const U = M1(haut ? 'trExt' : 'raExt'), ca = M1(haut ? 'trChA' : 'raChA'), g = M1(haut ? 'gSup' : 'gInf');
    if (U?.leg) v.coteV([0, haut ? zT - c : c], [0, haut ? zT - c - U.leg : c + U.leg], -6 * k, `retour ${fr(U.leg)}`);
    if (ca?.noeuds.includes(0)) {
      v.coteH([xR[0], zf], [xR[0] + ca.ext, zf], zf + sg * 6 * k, `chapeau ${fr(ca.ext)}`);
      v.coteV([0, haut ? zT - c : c], [0, haut ? zT - c - ca.vert : c + ca.vert], -14 * k, `${fr(ca.vert)}`);
    }
    if (g) {
      const xv = geo.xF(0, 'd', 1), zh = haut ? geo.zTi(1) : geo.zRi(1);
      v.coteH([xv, zh], [xv + g.Lg, zh], zh - sg * 6 * k, `équerre ${fr(g.Lg)}`);
      v.coteV([xR[0], zh], [xR[0], zh - sg * g.leg], xR[0] + 6 * k, fr(g.leg));
    }
  } else {
    const cm = M1('trChM'), g = M1('gSup');
    v.coteH([xL[1], zT], [xR[1], zT], zT + 6 * k);
    if (cm) { v.coteH([xL[1] - cm.ext, zT], [xL[1], zT], zT + 6 * k, fr(cm.ext)); v.coteH([xR[1], zT], [xR[1] + cm.ext, zT], zT + 6 * k, fr(cm.ext)); }
    if (g) { const xv = geo.xF(1, 'd', 1), zh = geo.zTi(1); v.coteH([xv, zh], [xv + g.Lg, zh], zh - 6 * k, `équerre ${fr(g.Lg)}`); }
  }
  // bulles en colonne à droite de la fenêtre
  const vus = [...new Set([...vis.traits.map(t => t.m), ...vis.points.map(q => q.m)])];
  const centre = m => {
    let best = null, L = -1;
    for (const t of vis.traits) if (t.m === m) for (let i = 0; i + 1 < t.pts.length; i++) { const a = t.pts[i], b = t.pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > L) { L = l; best = [(a[0] + b[0]) / 2 + (b[0] - a[0]) * 0.15, (a[1] + b[1]) / 2 + (b[1] - a[1]) * 0.15]; } }
    if (!best) { const q = vis.points.filter(p => p.m === m); best = q[Math.floor(q.length / 2)]?.c; }
    return best;
  };
  const items = vus.map(m => ({ m, c: centre(m) })).filter(q => q.c).sort((a, b) => b.c[1] - a.c[1]);
  const xcol = x1 + 18 * k, P = etaler(items.map(q => q.c[1]), 7.4 * k), xv = x1 - 0.1 * (x1 - x0);
  const proche = (m, z) => {   // point du repère le plus proche de (xv, z), la hauteur comptant triple
    let best = null, d = Infinity;
    const essai = p => { const s2 = Math.abs(p[0] - xv) + 3 * Math.abs(p[1] - z); if (s2 < d) { d = s2; best = p; } };
    for (const t of vis.traits) if (t.m === m) for (let i = 0; i + 1 < t.pts.length; i++) {
      const a = t.pts[i], b = t.pts[i + 1];
      for (let q = 0; q <= 8; q++) essai([a[0] + (b[0] - a[0]) * q / 8, a[1] + (b[1] - a[1]) * q / 8]);
    }
    for (const q of vis.points) if (q.m === m) essai(q.c);
    return best;
  };
  items.forEach((q, i) => {
    v.repere([xcol, P[i]], q.m.mark, proche(q.m, P[i]) || q.c);
    v.texte('TEXTES', [xcol + 4.2 * k, P[i]], desig(q.m), { h: 2.4, ancre: 'g', v: 'm' });
  });
  return v;
}

/* ------------------------------------------------------------------------------- coupe longitudinale */
/**
 * Coupe longitudinale dans l'axe de la cellule 1, regard vers le piédroit gauche : traverse et radier coupés (aciers
 * principaux en points, répartition en traits, tronçons recouverts), piédroit vu au-delà (verticales et horizontales de
 * sa face intérieure, en trait interrompu), abouts. Longueur réelle ; au-delà de 16 m, partie centrale interrompue.
 */
function vueCoupeLongitudinale(G, marks, h, e = 50) {
  const c = h.enrobage, k = e / 1000, { zi, zt, zT, ouvert } = G, M1 = p => marks.find(m => m.pos === p);
  const L = G.L > 0 ? G.L : 2, coupe = L > 16, Lv = coupe ? 4 : L, gapC = 0.8;
  const v = new Vue(`COUPE LONGITUDINALE DANS LA CELLULE 1${G.L > 0 ? '' : ' (longueur non saisie : 2 m)'}`);
  // u réel → x de dessin (partie centrale supprimée si coupe)
  const X = u => (!coupe ? u : u <= Lv ? u : u >= L - Lv ? u - (L - 2 * Lv) + gapC : null);
  const seg = (u0, u1) => (!coupe ? [[u0, u1]] : [[u0, Math.min(u1, Lv)], [Math.max(u0, L - Lv), u1]].filter(([a, b]) => b > a + 1e-9));
  const ligne = (cal, u0, u1, z) => { for (const [a, b] of seg(u0, u1)) v.ligne(cal, [X(a), z], [X(b), z]); };
  const bandes = ouvert ? [[zt, zT]] : [[0, zi], [zt, zT]];
  for (const [za, zb] of bandes) {
    ligne('COFFRAGE', 0, L, za); ligne('COFFRAGE', 0, L, zb);
    v.ligne('COFFRAGE', [X(0), za], [X(0), zb]); v.ligne('COFFRAGE', [X(L), za], [X(L), zb]);
    if (coupe) for (const xb of [Lv, Lv + gapC]) { const zm = (za + zb) / 2; v.poly('COFFRAGE', [[xb, za - 0.04], [xb, zm - 0.04], [xb + 0.05, zm], [xb - 0.05, zm + 0.01], [xb, zm + 0.05], [xb, zb + 0.04]]); }
  }
  // piédroit gauche vu au-delà, entre radier et traverse
  const pI = M1('pInt') || M1('pgInt'), pR = M1('pRep'), z0 = ouvert ? 0 : zi;
  const uV = Math.max(c, L - 2.5);   // piédroit vu représenté sur 2,5 m côté tête aval
  if (pI) for (let u = L - c; u >= uV - 1e-9; u -= pI.s) { const x = X(u); if (x != null) v.ligne('VUES', [x, z0], [x, zt]); }
  if (pR) for (let z = z0 + 0.05; z < zt - 0.03; z += pR.s) ligne('VUES', uV, L - c, z);
  if (pI && uV > c + 0.1 && X(uV) != null) v.ligne('VUES', [X(uV), z0], [X(uV), zt]);
  // aciers
  const geoL = { traits: [], points: [] }, lit = phi => phi / 1000;
  const pts = (m, z) => { if (!m) return; for (let u = c; u <= L - c + 1e-9; u += m.s) { const x = X(u); if (x != null) { v.cercle('ACIERS_COUPES', [x, z], Math.max(m.phi / 2000, 0.35 * k), true); geoL.points.push({ m, c: [x, z] }); } } };
  const coteL0 = new Set();
  const rep = (m, z, sg, zc) => {
    if (!m) return;
    troncons(c, L - c, m.nP, m.l0).forEach(([a, b], q) => {
      const zz = z + sg * (q % 2) * Math.max(lit(m.phi), 0.6 * k);
      for (const [a2, b2] of seg(a, b)) { v.ligne('ACIERS', [X(a2), zz], [X(b2), zz]); geoL.traits.push({ m, pts: [[X(a2), zz], [X(b2), zz]] }); }
    });
    if (m.nP > 1 && !coteL0.has(zc)) { coteL0.add(zc); const [, b0] = troncons(c, L - c, m.nP, m.l0)[0], a1 = b0 - m.l0; if (X(a1) != null && X(b0) != null) v.coteH([X(a1), z], [X(b0), z], zc, `l₀ = ${fr(m.l0)}`); }
  };
  const d = m => Math.max(m ? m.phi / 1000 : 0, 0.7 * k);
  const tE = M1('trExt'), tI = marks.find(m => m.pos === 'trInt' && m.cellules.includes(0)), rE = M1('raExt'), rI = marks.find(m => m.pos === 'raInt' && m.cellules.includes(0));
  const zTE = zT - c - d(tE) / 2, zTR = zTE - d(tE) / 2 - d(M1('trChA')) - d(M1('trRepE')) / 2, zTI = zt + c + d(tI) / 2, zTRI = zTI + d(tI) / 2 + d(M1('gSup')) + d(M1('trRepI')) / 2;
  pts(tE, zTE); rep(M1('trRepE'), zTR, -1, zt - 5 * k); pts(tI, zTI); rep(M1('trRepI'), zTRI, 1, zt - 5 * k);
  let zRE, zRR, zRI, zRRI;
  if (!ouvert) {
    zRE = c + d(rE) / 2; zRR = zRE + d(rE) / 2 + d(M1('raChA')) + d(M1('raRepE')) / 2; zRI = zi - c - d(rI) / 2; zRRI = zRI - d(rI) / 2 - d(M1('gInf')) - d(M1('raRepI')) / 2;
    pts(rE, zRE); rep(M1('raRepE'), zRR, 1, zi + 5 * k); pts(rI, zRI); rep(M1('raRepI'), zRRI, -1, zi + 5 * k);
  }
  // abouts : enrobage et espacement
  if (tE) { v.coteH([X(0), zT], [X(c), zT], zT + 5 * k, `c = ${fr(c * 100, 1)}`); v.coteH([X(c), zT], [X(c + tE.s), zT], zT + 10 * k, `e = ${esp(tE.s)}`); }
  v.texte('TEXTES', [X(0) - 3 * k, (ouvert ? zt + zT : zi + zt) / 2], 'TÊTE AMONT', { h: 2.4, ancre: 'c', v: 'm', angle: 90 });
  v.texte('TEXTES', [X(L) + 3 * k, (ouvert ? zt + zT : zi + zt) / 2], 'TÊTE AVAL', { h: 2.4, ancre: 'c', v: 'm', angle: 90 });
  if (coupe) v.texte('TEXTES', [Lv + gapC / 2, (z0 + zt) / 2], `${fr(L - 2 * Lv)} m non représentés`, { h: 2.2, ancre: 'c', v: 'm', angle: 90 });
  v.coteH([X(0), ouvert ? zt : 0], [X(L), ouvert ? zt : 0], (ouvert ? zt : 0) - 6 * k, fmtCote(L));
  // bulles : traverse au-dessus, radier au-dessous, piédroit vu sur la tête aval
  const xs = X(Math.min(L - c, Lv)) ?? 1, H = [[tE, 0.12], [M1('trRepE'), 0.22], [tI, 0.32], [M1('trRepI'), 0.42]].filter(q => q[0]);
  ranger(v, geoL, H.map(([m, f]) => ({ m, pref: xs * f + X(0) })), { axe: 'x', at: zT + 18 * k, k, sens: 1 });
  if (!ouvert) ranger(v, geoL, [[rE, 0.12], [M1('raRepE'), 0.22], [rI, 0.32], [M1('raRepI'), 0.42]].filter(q => q[0]).map(([m, f]) => ({ m, pref: xs * f + X(0) })), { axe: 'x', at: -18 * k, k, sens: -1 });
  const xr = X(L) + 16 * k, pv = [pI, pR].filter(Boolean);
  pv.forEach((m, i) => {
    const zb = z0 + (zt - z0) * (0.35 + 0.3 * i), cible = m === pR ? [X(L) - 0.4, Math.min(zt - 0.05, z0 + 0.05 + Math.round((zb - z0 - 0.05) / m.s) * m.s)] : [X(L - c), zb];
    v.repere([xr, zb], m.mark, cible);
    v.texte('TEXTES', [xr + 4.2 * k, zb], `${desig(m)} (piédroit vu)`, { h: 2.4, ancre: 'g', v: 'm' });
  });
  return v;
}

/* --------------------------------------------------------------------------------------- vues en plan */
/**
 * Vue en plan d'une dalle (traverse ou radier) en deux demi-vues séparées par l'axe : côté tête gauche de l'axe
 * (x < W/2) la nappe supérieure, de l'autre côté la nappe inférieure. u le long de l'axe de l'ouvrage, x le long des
 * têtes ; aciers principaux parallèles aux têtes, répartition parallèle aux piédroits (PICF-EL, option 1 en biais).
 * Représentation usuelle : une barre type par famille, en trait fort, et sa ligne de répartition (trait fin, bornée
 * par deux traits d'arrêt, la barre type marquée d'un point) sur laquelle pointe la bulle du repère.
 */
function vuePlanDalle(G, marks, h, dalle, e = 50) {
  const c = h.enrobage, k = e / 1000, { n, xL, xR, W } = G, L = G.L > 0 ? G.L : Math.max(2, W);
  const cb = Math.cos(G.biais * Math.PI / 180), sb = G.sb, P = (u, x) => [u + x * cb, -x * sb];
  const tr = dalle === 'tr', M1 = p => marks.find(m => m.pos === p), MA = p => marks.filter(m => m.pos === p);
  const v = new Vue(`VUE EN PLAN — ${tr ? 'TRAVERSE' : 'RADIER'} (demi-vues : nappe supérieure / nappe inférieure)`);
  v.poly('COFFRAGE', [P(0, 0), P(L, 0), P(L, W), P(0, W)], true);
  for (let j = 0; j <= n; j++) for (const x of [xL[j], xR[j]]) if (x > 1e-9 && x < W - 1e-9) v.ligne('VUES', P(0, x), P(L, x));
  v.ligne('AXES', P(-0.5, W / 2), P(L + 0.5, W / 2));
  const geo = { traits: [], points: [] };
  const barre = (m, a, b) => v.poly('ACIERS', [a, b]);
  const tick = (p, dir) => { const t = 1.2 * k; v.ligne('REPERES', [p[0] - dir[0] * t, p[1] - dir[1] * t], [p[0] + dir[0] * t, p[1] + dir[1] * t]); };
  /** Ligne de répartition de a à b (bornée), barre type en t ; enregistrée comme cible des bulles du repère. */
  const repart = (m, a, b, t, dirBarre) => {
    v.ligne('REPERES', a, b); tick(a, dirBarre); tick(b, dirBarre); v.cercle('ACIERS_COUPES', t, 0.6 * k, true);
    geo.traits.push({ m, pts: [a, b] });
  };
  const ux = [cb, -sb], uu = [1, 0];   // directions des barres principales (le long des têtes) et de la répartition
  const sup = tr ? { ext: 'trExt', ch: 'trChA', chm: 'trChM', rep: 'trRepE' } : { int: 'raInt', g: 'gInf', rep: 'raRepI', gR: 'gInfR' };
  const inf = tr ? { int: 'trInt', g: 'gSup', rep: 'trRepI', gR: 'gSupR' } : { ext: 'raExt', ch: 'raChA', chm: 'raChM', rep: 'raRepE' };
  const lim = (a, b, demi) => (demi === 0 ? [Math.max(a, 0), Math.min(b, W / 2)] : [Math.max(a, W / 2), Math.min(b, W)]);
  const famille = (N, demi) => {
    // familles de la demi-vue, chacune à sa position u le long de l'ouvrage (barres types réparties)
    const fam = [];
    if (N.ext) for (const m of MA(N.ext)) fam.push({ m, zones: [[c, W - c]] });
    if (N.ch) { const ca = M1(N.ch); if (ca) fam.push({ m: ca, zones: ca.noeuds.map(j => (j === 0 ? [c, xR[0] + ca.ext] : [xL[n] - ca.ext, W - c])) }); }
    if (N.chm) { const cm = M1(N.chm); if (cm) fam.push({ m: cm, zones: cm.noeuds.map(j => [xL[j] - cm.ext, xR[j] + cm.ext]) }); }
    if (N.int) for (const m of MA(N.int)) fam.push({ m, zones: m.cellules.map(i => [xL[i] + c, xR[i + 1] - c]) });
    if (N.g) { const g = M1(N.g); if (g) fam.push({ m: g, zones: Array.from({ length: n }, (_, i) => [[xR[i] - c, xR[i] - c + g.Lg], [xL[i + 1] + c - g.Lg, xL[i + 1] + c]]).flat() }); }
    const out = fam.map(f => ({ ...f, zones: f.zones.map(z => lim(...z, demi)).filter(([a, b]) => b > a + 0.02) })).filter(f => f.zones.length);
    out.forEach((f, q) => {
      const ut = c + (L - 2 * c) * (0.1 + 0.8 * (q + 0.5) / (out.length + 1.2));
      // barres types (une par zone) et ligne de répartition sur toute la longueur, au milieu de la première zone
      for (const [a, b] of f.zones) barre(f.m, P(ut, a), P(ut, b));
      const [a0, b0] = f.zones[0], xr = (a0 + b0) / 2;
      repart(f.m, P(c, xr), P(L - c, xr), P(ut, xr), ux);
      f.u = ut;
    });
    // répartition : barres types sur toute la longueur (tronçons, joints décalés), ligne de répartition le long des têtes
    const rp = M1(N.rep);
    if (rp) {
      const zones = (N.ext ? [[c, W - c]] : Array.from({ length: n }, (_, i) => [xR[i] + 0.04, xL[i + 1] - 0.04])).map(z => lim(...z, demi)).filter(([a, b]) => b > a + 0.02);
      const tn = troncons(c, L - c, rp.nP, rp.l0), uR = c + (L - 2 * c) * 0.93;
      zones.forEach(([a, b], q) => {
        const x1 = a + (b - a) * 0.3, x2 = a + (b - a) * 0.3 + rp.s;
        for (const [x, dec] of [[x1, 0], [x2, 1]]) {   // deux barres voisines : joints décalés d'un demi-tronçon
          const sh = dec && rp.nP > 1 ? (tn[0][1] - tn[0][0]) / 2 : 0;
          const tt = rp.nP > 1 ? troncons(c - sh, L - c + sh, rp.nP + dec, rp.l0).map(([u0, u1]) => [Math.max(c, u0), Math.min(L - c, u1)]).filter(([u0, u1]) => u1 > u0 + 0.05) : tn;
          tt.forEach(([u0, u1], w) => { const dx = (w % 2) * Math.max(rp.phi / 1000, 0.5 * k); barre(rp, P(u0, x + dx), P(u1, x + dx)); });
        }
        if (q === 0 && rp.nP > 1) { const u1 = tn[0][1], u0 = u1 - rp.l0; v.cote(P(u0, x1), P(u1, x1), (demi === 0 ? 1 : -1) * 4 * k, `l₀ = ${fr(rp.l0)}`); }
        repart(rp, P(uR, a), P(uR, b), P(uR, x1), uu);
      });
    }
    if (N.gR) {   // filants d'angle : un type par angle intérieur, sur la longueur
      const r = M1(N.gR), g = M1(N.g);
      if (r && g) for (let i = 0; i < n; i++) for (const [x0, s] of [[xR[i], 1], [xL[i + 1], -1]]) {
        const x = x0 + s * Math.min(0.15, g.Lg / 3); if (lim(x, x, demi)[0] !== x || lim(x, x, demi)[1] !== x) continue;
        for (const [u0, u1] of troncons(c, L - c, r.nP, r.l0)) barre(r, P(u0, x), P(u1, x));
        if (!geo.traits.some(t => t.m === r)) geo.traits.push({ m: r, pts: [P(c, x), P(L - c, x)] });
      }
    }
    return out;
  };
  famille(sup, 0); famille(inf, 1);
  v.texte('TEXTES', P(-4 * k, W / 4), 'NAPPE SUP.', { h: 2.6, ancre: 'c', v: 'm', angle: 90, gras: true });
  v.texte('TEXTES', P(-4 * k, 3 * W / 4), 'NAPPE INF.', { h: 2.6, ancre: 'c', v: 'm', angle: 90, gras: true });
  v.texte('TEXTES', P(-9 * k, W / 2), 'TÊTE AMONT', { h: 2.4, ancre: 'c', v: 'm', angle: 90 });
  v.texte('TEXTES', P(L + 4 * k, W / 2), 'TÊTE AVAL', { h: 2.4, ancre: 'c', v: 'm', angle: 90 });
  if (biaise(G)) v.texte('TEXTES', P(L / 2, W / 2 + 1.2 * k / sb), `biais ${fr(G.biais / 0.9, 1)} gr`, { h: 2.4, ancre: 'c', v: 'b' });
  v.cote(P(L, 0), P(L, W), -10 * k, fmtCote(W));
  // bulles : nappe supérieure au-dessus du plan, nappe inférieure au-dessous, pointant sur les lignes de répartition
  const repDe = N => [N.ext, N.ch, N.chm, N.int, N.g, N.rep, N.gR].flatMap(p => (p ? MA(p) : [])).filter((m, i, a) => a.indexOf(m) === i && geo.traits.some(t => t.m === m));
  const cibleLigne = (m, demi) => u => {
    let best = null, d = Infinity;
    for (const t of geo.traits) if (t.m === m) {
      const [a, b] = t.pts, mid = (a[1] + b[1]) / 2; if (demi === 0 ? mid < -W / 2 * sb : mid > -W / 2 * sb) continue;
      const dx = b[0] - a[0], tt = Math.abs(dx) > 1e-9 ? Math.max(0, Math.min(1, (u - a[0]) / dx)) : 0.5, p = [a[0] + tt * dx, a[1] + tt * (b[1] - a[1])];
      const sc = Math.abs(p[0] - u) + Math.abs(p[1] - (demi === 0 ? 0 : -W * sb)) * 0.05;
      if (sc < d) { d = sc; best = p; }
    }
    return best;
  };
  const S = repDe(sup), I = repDe(inf), x0 = Math.min(0, W * cb), x1 = Math.max(L, L + W * cb);
  const pr = (liste, demi) => liste.map((m, i) => ({ m, cible: cibleLigne(m, demi), pref: x0 + (x1 - x0) * (0.08 + 0.84 * (i + 0.5) / liste.length) }));
  ranger(v, geo, pr(S, 0), { axe: 'x', at: Math.max(0, -0 * sb) + 10 * k, k, sens: 1, bornes: [x0, x1] });
  ranger(v, geo, pr(I, 1), { axe: 'x', at: -W * sb - 10 * k, k, sens: -1, bornes: [x0, x1] });
  const lt = Math.max(0, ...S.map(m => desig(m).length)) * 0.53 * 2.2;
  v.cote(P(0, 0), P(L, 0), 16 * k + lt * k, `${fmtCote(L)}${G.L > 0 ? '' : ' (longueur non saisie)'}`);
  return v;
}

/* ---------------------------------------------------------------------------------- éclaté des barres */
/**
 * Façonnage : chaque repère dessiné dans sa position de pose (sans échelle), cotes A, B, C du bordereau (mm),
 * mandrin, nombre et longueur de coupe. Grille de cases de 100 × 27 mm papier.
 */
function vueFaconnage(marks, e = 50, cols = 3) {
  const v = new Vue('FAÇONNAGE DES ARMATURES'), k = e / 1000;
  v.sansEchelle = true;
  const W0 = 104, H0 = 29, pm = (x, y) => [x * k, y * k];
  marks.forEach((m, i) => {
    const cx = (i % cols) * W0, cy = -Math.floor(i / cols) * H0;
    v.repere(pm(cx + 4, cy - 4), m.mark);
    v.texte('TEXTES', pm(cx + 9, cy - 4), `${m.nombre} ${m.nParAngle ? `HA${m.phi}` : desig(m)} — L = ${fr(m.L / 1000, 3)} m`, { h: 2.4, ancre: 'g', v: 'm', gras: true });
    const lab = m.label.length > 68 ? m.label.slice(0, 66) + '…' : m.label;
    v.texte('TEXTES', pm(cx + 9, cy - 8.2), lab, { h: 1.8, ancre: 'g', v: 'm' });
    // forme dans sa position de pose : retours vers le bas (traverse, équerres sup.), vers le haut (radier, équerres inf.)
    const { A = 0, B = 0, C = 0 } = m.dims, bas = /^(tr|gSup)/.test(m.pos) || m.code === '21' && !/^ra/.test(m.pos);
    const sgn = bas ? -1 : 1, yb = bas ? cy - 13 : cy - 23.5, f = mm => Math.max(6, Math.min(10, mm / 120));
    const r = 1.1, x0 = cx + 10;
    let pts, cotes = [];
    if (m.code === '00') {
      const l = Math.max(30, Math.min(84, A / 100)); pts = [[x0, cy - 19], [x0 + l, cy - 19]];
      cotes.push([String(A), [x0 + l / 2, cy - 17.6], 0]);
    } else if (m.code === '11') {
      const l = Math.max(30, Math.min(80, A / 100)), b = f(B), xa = /ChA$/.test(m.pos) || /^g/.test(m.pos) ? x0 + 4 : x0;
      // retour à l'extrémité gauche (angle du cadre) pour les chapeaux et équerres
      pts = [[xa, yb + sgn * b], [xa, yb], [xa + l, yb]];
      cotes.push([String(A), [xa + l / 2, yb + (sgn > 0 ? -3.4 : 1.2)], 0], [String(B), [xa - 1.2, yb + sgn * b / 2], 90]);
    } else if (m.code === '21') {
      const l = Math.max(36, Math.min(80, B / 100)), a = f(A), cc = f(C);
      pts = [[x0 + 4, yb + sgn * a], [x0 + 4, yb], [x0 + 4 + l, yb], [x0 + 4 + l, yb + sgn * cc]];
      cotes.push([String(B), [x0 + 4 + l / 2, yb + (sgn > 0 ? -3.4 : 1.2)], 0], [String(A), [x0 + 2.8, yb + sgn * a / 2], 90], [String(C), [x0 + 4 + l + 2.8, yb + sgn * cc / 2], 90]);
    } else pts = [[x0, cy - 19], [x0 + 40, cy - 19]];
    v.poly('ACIERS', arrondir(pts.map(p => pm(...p)), r * k));
    for (const [s, p, ang] of cotes) v.texte('COTES', pm(...p), s, { h: 2.2, ancre: 'c', v: ang ? 'b' : 'b', angle: ang });
    if (m.code !== '00') v.texte('TEXTES', pm(cx + 98, cy - 19), `mandrin r = ${fr(rayonCintrage(m.phi), 0)}`, { h: 1.8, ancre: 'd', v: 'm' });
    if (m.nP > 1) v.texte('TEXTES', pm(cx + 98, cy - 23), `recouvrement l₀ = ${fr(m.l0 * 1000, 0)}`, { h: 1.8, ancre: 'd', v: 'm' });
  });
  // quadrillage léger des cases
  const nl = Math.ceil(marks.length / cols);
  for (let r = 0; r <= nl; r++) v.ligne('TABLEAUX', pm(-2, -r * H0 + 1), pm(cols * W0 - 2, -r * H0 + 1));
  for (let q = 0; q <= cols; q++) v.ligne('TABLEAUX', pm(q * W0 - 2, 1), pm(q * W0 - 2, -nl * H0 + 1));
  return v;
}

/* ----------------------------------------------------------------------------------------- feuilles */
function notesFerraillage(res, R) {
  const { G, minPICF, gs, gi } = R, h = res.h, phis = [...new Set(R.marks.map(m => m.phi))].sort((a, b) => a - b);
  return numeroter([
    'NOTES',
    `1. Aciers HA f_e = ${h.fe} MPa ; enrobage ${fr(h.enrobage * 100, 1)} cm. Cotes en m (coupes), en mm (façonnage).`,
    `2. Sections calculées : onglet Cadres et portiques (${h.code === 'EC2' ? 'EN 1992' : 'BAEL 91'}) ; dispositions : guide Sétra PICF-EL.`,
    `3. Ancrages et recouvrements : ${h.code === 'EC2' ? 'EN 1992-1-1 § 8.4 et 8.7' : 'BAEL 91 A.6.1,23 (l_s = φ f_e / 4 τ_s)'} ; recouvrements décalés d'une barre à l'autre.`,
    `4. Mandrins : ${phis.slice(0, 4).map(p => `Ø${p} r = ${fr(rayonCintrage(p), 0)} mm`).join(', ')}.`,
    '5. Faces extérieures : nappe filante en U + chapeaux sur nœuds ; faces intérieures : une nappe par cellule, ancrée jusqu\'à l\'enrobage opposé.',
    `6. Répartition min. ${fr(minPICF)} cm²/ml ; renforts d'angle (équerres à l'espacement double de la nappe intérieure) : ${fr(gs.L)} m / ${gs.n} φ₂${res.ouvert ? '' : ` et ${fr(gi.L)} m / ${gi.n} φ₂`}.`,
    '7. Coupe d\'ensemble : lits écartés pour la lisibilité ; détails A, B, C : lits à leur position réelle.',
    ...(res.ouvert ? [] : ['8. RB : reprise de bétonnage à l\'arase supérieure du radier (position indicative, à valider avec l\'entreprise).']),
    ...(biaise(G) ? [`9. Biais ${fr(G.biais / 0.9, 1)} gr : principaux parallèles aux têtes, répartition parallèle aux piédroits (PICF-EL, option 1).`] : []),
    ...(R.parMetre ? ['10. Longueur non saisie : nombres et masses pour 1 m d\'ouvrage.'] : []),
  ]);
}
const echellesCartouche = F => [...new Set(F.vues.filter(p => !p.vue.sansEchelle).map(p => '1/' + p.vue.echelle))].join(' ; ') || 'sans échelle';

/** Feuille 1 : coupe transversale armée et détails des nœuds. */
export function planFerraillageCadre(res, cartouche = {}, { bloc = '' } = {}) {
  const R = reperesCadre(res), { G, marks } = R, h = res.h, D = fenetresDetails(G, marks, h.enrobage);
  const NN = notesFerraillage(res, R), hn = NN.length * 2.2 * 1.6;
  const cp = vueCoupeArmatures(G, marks, h, 25), dets = D.map(d => vueDetail(G, marks, h, d, 10));
  const F = composer({
    titre: `${nomOuvrage(res, bloc)} — FERRAILLAGE : COUPE ET DÉTAILS`, cartouche,
    rangees: [[cp], dets],
    groupes: [{ vues: [cp], cible: 50, min: 20, refaire: e => [vueCoupeArmatures(G, marks, h, e)] },
      { vues: dets, cible: 10, min: 10, refaire: e => D.map(d => vueDetail(G, marks, h, d, e)) }],
    colonne: { largeur: 190, hauteur: hn + 8 },
    poser: (F, [x, y]) => { F.note(NN, F.W - 10 - 190 + 2, y + 2 + hn - 2.2 * 0.6, 2.2); F.notes[F.notes.length - 1].titreGras = true; },
  }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || echellesCartouche(F);
  F.masse = marks.reduce((s, m) => s + m.masse, 0);
  return F;
}

/** Feuille 2 : vues en plan de la traverse et du radier (demi-vues des deux nappes) et coupe longitudinale. */
export function planFerraillagePlanCadre(res, cartouche = {}, { bloc = '' } = {}) {
  const R = reperesCadre(res), { G, marks } = R, h = res.h;
  const NN = numeroter(['NOTES',
    '1. Vues en plan : demi-vues, nappe supérieure côté tête gauche de l\'axe, nappe inférieure de l\'autre côté.',
    '2. Une barre type par repère (trait fort) et sa ligne de répartition (bornée, barre type pointée).',
    '3. Répartition parallèle aux piédroits ; tronçons recouverts de l₀, joints décalés d\'une barre à l\'autre.',
    '4. Coupe longitudinale : piédroit vu au-delà en trait interrompu (représenté côté tête aval).',
    ...(R.parMetre ? ['5. Longueur non saisie : vues tracées sur une longueur conventionnelle.'] : [])]);
  const hn = NN.length * 2.2 * 1.6;
  const plans = e => [vuePlanDalle(G, marks, h, 'tr', e), ...(G.ouvert ? [] : [vuePlanDalle(G, marks, h, 'ra', e)])];
  const V = plans(100), cl = vueCoupeLongitudinale(G, marks, h, 50);
  const F = composer({
    titre: `${nomOuvrage(res, bloc)} — FERRAILLAGE : VUES EN PLAN ET COUPE LONGITUDINALE`, cartouche,
    rangees: [V, [cl]],
    groupes: [{ vues: V, cible: 100, min: 25, refaire: plans }, { vues: [cl], cible: 100, min: 20, refaire: e => [vueCoupeLongitudinale(G, marks, h, e)] }],
    colonne: { largeur: 190, hauteur: hn + 8 },
    poser: (F, [x, y]) => { F.note(NN, F.W - 10 - 190 + 2, y + 2 + hn - 2.2 * 0.6, 2.2); F.notes[F.notes.length - 1].titreGras = true; },
  }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || echellesCartouche(F);
  return F;
}

/** Feuille 3 : façonnage des repères et bordereau ISO 4066. */
export function planFaconnageCadre(res, cartouche = {}, { bloc = '' } = {}) {
  const { marks } = reperesCadre(res);
  const lignes = lignesBordereau(marks), R0 = recapitulatif(lignes), wb = 166, hl = 4.6;
  const hb = (lignes.length + 2) * hl + 6 + (R0.diam.length + 3) * 5.5;
  const ec = vueFaconnage(marks, 50, marks.length > 14 ? 3 : 2);
  let R = R0;
  const F = composer({
    titre: `${nomOuvrage(res, bloc)} — NOMENCLATURE ET FAÇONNAGE`, cartouche,
    rangees: [[ec]],
    groupes: [{ vues: [ec], cible: 50, min: 50, refaire: e => [vueFaconnage(marks, e, marks.length > 14 ? 3 : 2)] }],
    colonne: { largeur: wb + 16, hauteur: Infinity },
    poser: (F, [x, y, w, hc]) => { ({ R } = placerBordereau(F, lignes, [F.W - 10 - wb - 3, y + 2, wb, Math.min(hb, hc - 4)])); },
  }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = 'sans échelle';
  F.masse = R.masse;
  return F;
}
