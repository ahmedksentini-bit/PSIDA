/**
 * Clothoïdes (raccordements progressifs) et courbes lissées du tracé en plan.
 *
 * Segment « clothoide » : départ a, angle de la tangente θ0, courbure κ0 au départ et κ1 à l'arrivée (signées, > 0 :
 * virage à gauche), longueur `long`. Courbure linéaire en abscisse : κ(u) = κ0 + (κ1 − κ0) u / L ; angle
 * θ(u) = θ0 + κ0 u + (κ1 − κ0) u² / (2L) ; position par intégration de (cos θ, sin θ) (Gauss-Legendre).
 * Paramètre A = √(L / |κ1 − κ0|) (A² = R L pour une clothoïde partant d'une droite).
 *
 * Le DXF ne connaît pas la clothoïde : les logiciels de tracé l'exportent en SPLINE ou en polyligne à sommets serrés.
 * `ajusterElements` reconstitue droites, arcs et clothoïdes à partir de ces points par le diagramme des courbures
 * (courbure lissée par régression locale de l'angle, segmentation en morceaux linéaires de Douglas-Peucker).
 */

const GL = [[-0.9061798459386640, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665], [0, 0.5688888888888889],
  [0.5384693101056831, 0.4786286704993665], [0.9061798459386640, 0.2369268850561891]];

/** Angle de la tangente à l'abscisse u (0 ≤ u ≤ long). */
export const clothoTheta = (g, u) => g.theta0 + g.k0 * u + (g.k1 - g.k0) * u * u / (2 * g.long);
export const clothoKappa = (g, u) => g.k0 + (g.k1 - g.k0) * u / g.long;

/** Point de la clothoïde à l'abscisse u (intégration de Gauss-Legendre à 5 points par tronçon de 2 m au plus). */
export function clothoPoint(g, u) {
  const m = Math.max(1, Math.ceil(Math.abs(u) / 2)), h = u / m;
  let x = g.a[0], y = g.a[1];
  for (let k = 0; k < m; k++) {
    const c = (k + 0.5) * h;
    for (const [t, w] of GL) { const th = clothoTheta(g, c + t * h / 2); x += w * h / 2 * Math.cos(th); y += w * h / 2 * Math.sin(th); }
  }
  return [x, y];
}

/** Table de points tous les mètres (accélère clothoPointRapide). */
export function clothoTable(g) {
  const n = Math.floor(g.long), t = [g.a.slice()];
  for (let k = 1; k <= n; k++) {
    const p = t[k - 1]; let x = p[0], y = p[1];
    for (const [tt, w] of GL) { const th = clothoTheta(g, k - 0.5 + tt / 2); x += w / 2 * Math.cos(th); y += w / 2 * Math.sin(th); }
    t.push([x, y]);
  }
  return t;
}
/** Point à l'abscisse u depuis la table (un pas d'intégration au plus). */
export function clothoPointRapide(g, tab, u) {
  const k = Math.max(0, Math.min(tab.length - 1, Math.floor(u))), h = u - k, p = tab[k];
  if (Math.abs(h) < 1e-12) return p.slice();
  let x = p[0], y = p[1];
  for (const [tt, w] of GL) { const th = clothoTheta(g, k + h / 2 + tt * h / 2); x += w * h / 2 * Math.cos(th); y += w * h / 2 * Math.sin(th); }
  return [x, y];
}

/** Segment clothoïde complet (extrémité b calculée). */
export function clothoSeg({ a, theta0, k0, k1, long }) {
  const g = { type: 'clothoide', a: [a[0], a[1]], theta0, k0, k1, long };
  g.b = clothoPoint(g, long);
  return g;
}

/** Clothoïde parcourue en sens inverse. */
export function clothoInverse(g) {
  return clothoSeg({ a: g.b, theta0: clothoTheta(g, g.long) + Math.PI, k0: -g.k1, k1: -g.k0, long: g.long });
}

/** Paramètre A de la clothoïde (∞ si la courbure ne varie pas). */
export const clothoA = g => (Math.abs(g.k1 - g.k0) < 1e-12 ? Infinity : Math.sqrt(g.long / Math.abs(g.k1 - g.k0)));

// ---------------------------------------------------------------------------------------------------------------
// SPLINE du DXF (B-spline rationnelle) : évaluation de de Boor
// ---------------------------------------------------------------------------------------------------------------

/** Points d'une B-spline (degré p, nœuds, points de contrôle [x, y], poids) échantillonnée tous les `pas` m environ. */
export function echantillonnerSpline({ degre, noeuds, ctrl, poids = null }, pas = 0.25) {
  const p = degre, U = noeuds, n = ctrl.length - 1, w = poids && poids.length === ctrl.length ? poids : ctrl.map(() => 1);
  const t0 = U[p], t1 = U[n + 1];
  const evalPt = t => {
    let k = p; while (k < n && U[k + 1] <= t) k++;
    if (t >= t1) k = n;
    const d = []; for (let j = 0; j <= p; j++) { const c = ctrl[k - p + j], wj = w[k - p + j]; d.push([c[0] * wj, c[1] * wj, wj]); }
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const i = k - p + j, den = U[i + p - r + 1] - U[i], al = den > 0 ? (t - U[i]) / den : 0;
      d[j] = [0, 1, 2].map(q => (1 - al) * d[j - 1][q] + al * d[j][q]);
    }
    return [d[p][0] / d[p][2], d[p][1] / d[p][2]];
  };
  // longueur approchée par le polygone de contrôle, puis échantillonnage régulier en paramètre
  let Lc = 0; for (let k = 1; k < ctrl.length; k++) Lc += Math.hypot(ctrl[k][0] - ctrl[k - 1][0], ctrl[k][1] - ctrl[k - 1][1]);
  const N = Math.max(20, Math.ceil(Lc / pas) * 2), out = [];
  for (let m = 0; m <= N; m++) out.push(evalPt(t0 + (t1 - t0) * m / N));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Reconstitution des éléments (droites, arcs, clothoïdes) à partir de points serrés
// ---------------------------------------------------------------------------------------------------------------

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Chaîne d'éléments à courbure linéaire par morceaux (continue) : nœuds sb (abscisses, sb[0] = 0), courbures kb aux
 * nœuds, départ a et angle θ0. Morceau à courbure nulle → droite, constante → arc, variable → clothoïde.
 */
export function chainer(a, theta0, sb, kb) {
  const segs = []; let p = a, th = theta0;
  for (let m = 0; m < sb.length - 1; m++) {
    const lg = sb[m + 1] - sb[m], k0 = kb[m], k1 = kb[m + 1];
    if (lg < 1e-9) continue;
    let g;
    if (Math.abs(k0) < 1e-12 && Math.abs(k1) < 1e-12) g = { type: 'ligne', a: p, b: [p[0] + lg * Math.cos(th), p[1] + lg * Math.sin(th)] };
    else if (Math.abs(k0 - k1) < 1e-12) {
      const r = 1 / Math.abs(k0), sg = Math.sign(k0), c = [p[0] - sg * r * Math.sin(th), p[1] + sg * r * Math.cos(th)], a0 = Math.atan2(p[1] - c[1], p[0] - c[0]), a1 = a0 + sg * lg / r;
      g = { type: 'arc', c, r, a0, a1, sens: sg, a: p, b: [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)] };
    } else g = clothoSeg({ a: p, theta0: th, k0, k1, long: lg });
    th += (k0 + k1) / 2 * lg;
    segs.push(g); p = g.b;
  }
  return segs;
}

/** Description d'un élément. */
export function libelleElement(g) {
  if (g.type === 'ligne') return `droite ${Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]).toFixed(2)} m`;
  if (g.type === 'arc') return `arc R = ${g.r.toFixed(2)} m sur ${(g.r * Math.abs(g.a1 - g.a0)).toFixed(2)} m`;
  const R = k => (Math.abs(k) < 1e-12 ? '∞' : (1 / Math.abs(k)).toFixed(1));
  return `clothoïde A = ${clothoA(g).toFixed(2)} m sur ${g.long.toFixed(2)} m (R ${R(g.k0)} → ${R(g.k1)} m)`;
}

/**
 * @param {number[][]} pts points [x, y] dans l'ordre du tracé (pas de quelques décimètres à quelques mètres)
 * @param {object} o { fenetre : longueur de lissage de l'angle [m] }
 * @returns {{ segments, ecartMax, elements: string[] }}
 * Étapes : (1) courbure lissée (pente de la régression locale de l'angle des cordes) ; (2) diagramme des courbures
 * découpé en morceaux linéaires (Douglas-Peucker, 10 % de la courbure maximale), nœuds proches de 0 annulés, paliers
 * égalisés (arcs) ; (3) moindres carrés (Levenberg-Marquardt) sur les écarts latéraux des points : angle de départ,
 * abscisses des nœuds et courbures des nœuds non nuls (les paliers gardent une valeur unique).
 */
export function ajusterElements(pts, { fenetre = null } = {}) {
  const P = [pts[0]]; for (const q of pts.slice(1)) { const r = P[P.length - 1]; if (Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-6) P.push(q); }
  const n = P.length;
  if (n < 3) { const segs = [{ type: 'ligne', a: P[0], b: P[n - 1] }]; return { segments: segs, ecartMax: 0, elements: segs.map(libelleElement) }; }
  const s = [0]; for (let k = 1; k < n; k++) s.push(s[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const L = s[n - 1], sm = [], phi = [];
  for (let k = 0; k < n - 1; k++) { sm.push((s[k] + s[k + 1]) / 2); const a = Math.atan2(P[k + 1][1] - P[k][1], P[k + 1][0] - P[k][0]); phi.push(k ? phi[k - 1] + wrap(a - phi[k - 1]) : a); }
  const pas = L / (n - 1), w = fenetre ?? Math.min(L / 3, Math.max(5 * pas, L / 15, 3));
  const kap = new Float64Array(n), thetaS = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const c = Math.min(Math.max(s[k], w / 2), L - w / 2);
    let S0 = 0, S1 = 0, S2 = 0, T0 = 0, T1 = 0;
    for (let j = 0; j < n - 1; j++) { if (Math.abs(sm[j] - c) > w / 2 + 1e-9) continue; const x = sm[j] - c; S0++; S1 += x; S2 += x * x; T0 += phi[j]; T1 += x * phi[j]; }
    const det = S0 * S2 - S1 * S1, b1 = det > 1e-12 ? (S0 * T1 - S1 * T0) / det : 0, b0 = (T0 - b1 * S1) / Math.max(S0, 1);
    kap[k] = b1; thetaS[k] = b0 + b1 * (s[k] - c);
  }
  const kMax = Math.max(...kap.map(Math.abs));
  // tracé rectiligne
  if (kMax * L < 1e-4) { const segs = chainer(P[0], thetaS[0], [0, L], [0, 0]); return { segments: segs, ecartMax: 0, elements: segs.map(libelleElement) }; }
  const tol = Math.max(2e-5, 0.1 * kMax);
  const garde = new Uint8Array(n); garde[0] = garde[n - 1] = 1;
  const dp = (i, j) => {
    let dm = 0, im = -1;
    for (let k = i + 1; k < j; k++) { const r = (s[k] - s[i]) / (s[j] - s[i]), d = Math.abs(kap[k] - (kap[i] + r * (kap[j] - kap[i]))); if (d > dm) { dm = d; im = k; } }
    if (dm > tol && im > 0) { garde[im] = 1; dp(i, im); dp(im, j); }
  };
  dp(0, n - 1);
  let sb = [], kb = [];
  for (let k = 0; k < n; k++) if (garde[k]) { sb.push(s[k]); kb.push(Math.abs(kap[k]) < tol ? 0 : kap[k]); }
  // nœuds trop proches (< 2 pas ou < w/4) fusionnés
  for (let m = 1; m < sb.length - 1; m++) if (sb[m] - sb[m - 1] < Math.max(2 * pas, w / 4)) { sb.splice(m, 1); kb.splice(m, 1); m--; }
  // paliers : courbures voisines de même signe et proches → valeur commune (arc) ; nœud intermédiaire d'une rampe régulière retiré
  const grp = kb.map((_, m) => m);
  for (let m = 0; m < kb.length - 1; m++) if (kb[m] && kb[m + 1] && Math.abs(kb[m] - kb[m + 1]) < tol) grp[m + 1] = grp[m];
  for (let m = 1; m < kb.length - 1; m++) {
    if (grp[m] === grp[m - 1] || grp[m + 1] === grp[m]) continue;
    const r = (sb[m] - sb[m - 1]) / (sb[m + 1] - sb[m - 1]);
    if (kb[m - 1] && kb[m + 1] && Math.abs(kb[m] - (kb[m - 1] + r * (kb[m + 1] - kb[m - 1]))) < tol / 2) { sb.splice(m, 1); kb.splice(m, 1); grp.splice(m, 1); m--; }
  }
  // nœuds intérieurs d'un palier retirés (ils n'ont pas d'effet : jacobien singulier)
  for (let m = 1; m < kb.length - 1; m++) if (kb[m] && grp[m] === grp[m - 1] && grp[m + 1] === grp[m]) { sb.splice(m, 1); kb.splice(m, 1); grp.splice(m, 1); m--; }
  const optimiser = (sb, kb, grp, theta0) => {
    // paramètres : θ0, abscisses des nœuds intérieurs, une courbure par groupe non nul
    const groupes = [...new Set(grp.filter((g, m) => kb[m] !== 0))];
    const valGroupe = g => { const ms = grp.map((x, m) => (x === g ? m : -1)).filter(m => m >= 0); return ms.reduce((t, m) => t + kb[m], 0) / ms.length; };
    const p0 = [theta0, ...sb.slice(1, -1), ...groupes.map(valGroupe)];
    const nInt = sb.length - 2, ech = [1, ...sb.slice(1, -1).map(() => 1), ...groupes.map(() => kMax)];
    const construire = (p, final = false) => {
      const sbp = [0, ...p.slice(1, 1 + nInt), L];
      for (let m = 1; m < sbp.length; m++) if (sbp[m] < sbp[m - 1] + 1e-3) sbp[m] = sbp[m - 1] + 1e-3;
      const kbp = grp.map((g, m) => { const q = groupes.indexOf(g); return kb[m] === 0 || q < 0 ? 0 : p[1 + nInt + q]; });
      if (final) for (let m = 1; m < sbp.length; m++) if (sbp[m] - sbp[m - 1] < 0.01 && sbp.length > 2) { const j = m === sbp.length - 1 ? m - 1 : m; sbp.splice(j, 1); kbp.splice(j, 1); m--; }
      if (final === 'noeuds') return { sbp, kbp };
      return chainer(P[0], p[0], sbp, kbp);
    };
    // écarts latéraux : projection locale (Newton sur l'abscisse, départ à l'abscisse du point)
    const ecarts = segs => {
      const ax = { seg: segs }; let s0 = 0; for (const g of segs) { g.s0 = s0; g.L = g.type === 'ligne' ? Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) : g.type === 'clothoide' ? g.long : g.r * Math.abs(g.a1 - g.a0); s0 += g.L; }
      const Ltot = s0;
      const loc = t => { const tt = Math.max(0, Math.min(Ltot, t)); let g = segs[segs.length - 1]; for (const h of segs) if (tt <= h.s0 + h.L + 1e-12) { g = h; break; } const u = tt - g.s0, ext = t - tt;
        let pt, th;
        if (g.type === 'ligne') { const d = [(g.b[0] - g.a[0]) / g.L, (g.b[1] - g.a[1]) / g.L]; pt = [g.a[0] + u * d[0], g.a[1] + u * d[1]]; th = Math.atan2(d[1], d[0]); }
        else if (g.type === 'arc') { const dir = Math.sign(g.a1 - g.a0), an = g.a0 + dir * u / g.r; pt = [g.c[0] + g.r * Math.cos(an), g.c[1] + g.r * Math.sin(an)]; th = an + dir * Math.PI / 2; }
        else { pt = clothoPoint(g, u); th = clothoTheta(g, u); }
        return [[pt[0] + ext * Math.cos(th), pt[1] + ext * Math.sin(th)], th]; };
      void ax;
      return P.map((q, k) => {
        let t = s[k];
        for (let it = 0; it < 4; it++) { const [pt, th] = loc(t); t += (q[0] - pt[0]) * Math.cos(th) + (q[1] - pt[1]) * Math.sin(th); }
        const [pt, th] = loc(t); return -(q[0] - pt[0]) * Math.sin(th) + (q[1] - pt[1]) * Math.cos(th);
      });
    };
    // Levenberg-Marquardt (jacobien numérique)
    let p = p0.slice(), r = ecarts(construire(p)), f = r.reduce((t, v) => t + v * v, 0), lam = 1e-3;
    for (let it = 0; it < 60; it++) {
      const J = p.map((_, q) => { const h = 1e-6 * ech[q], pp = p.slice(); pp[q] += h; const rr = ecarts(construire(pp)); return rr.map((v, k) => (v - r[k]) / h); });
      const m = p.length, A = Array.from({ length: m }, () => new Float64Array(m)), g = new Float64Array(m);
      for (let a = 0; a < m; a++) { for (let b = 0; b <= a; b++) { let t = 0; for (let k = 0; k < r.length; k++) t += J[a][k] * J[b][k]; A[a][b] = A[b][a] = t; } let t = 0; for (let k = 0; k < r.length; k++) t += J[a][k] * r[k]; g[a] = t; }
      let ok = false;
      for (let essai = 0; essai < 8; essai++) {
        const dmax = Math.max(...A.map((row, a) => row[a])), M = A.map((row, a) => Float64Array.from(row, (v, b) => (a === b ? v + lam * Math.max(v, 1e-9 * dmax) : v)));
        const d = resoudre(M, Float64Array.from(g, v => -v));
        const pn = p.map((v, q) => v + d[q]), rn = ecarts(construire(pn)), fn = rn.reduce((t, v) => t + v * v, 0);
        if (fn < f) { p = pn; r = rn; const gain = f - fn; f = fn; lam = Math.max(lam / 3, 1e-9); ok = gain > 1e-12 * (1 + f); break; }
        lam *= 5;
      }
      if (!ok) break;
    }
    return { p, construire, ecarts };
  };
  // passes successives : clothoïdes consécutives de même pente de courbure fusionnées, clothoïdes à courbure presque
  // constante changées en arcs, puis nouvel ajustement
  let res = optimiser(sb, kb, grp, thetaS[0]);
  for (let passe = 0; passe < 3; passe++) {
    const { sbp, kbp } = res.construire(res.p, 'noeuds');
    let change = false;
    for (let m = 0; m < kbp.length; m++) if (kbp[m] && Math.abs(kbp[m]) < 2e-5) { kbp[m] = 0; change = true; }   // R > 50 km : droite
    const pente = m => (kbp[m + 1] - kbp[m]) / (sbp[m + 1] - sbp[m]);
    for (let m = 1; m < sbp.length - 1; m++) {
      const a = pente(m - 1), b = pente(m), ref = Math.max(Math.abs(a), Math.abs(b));
      if (ref > 1e-9 && Math.abs(a - b) < 0.03 * ref && Math.sign(a) === Math.sign(b)) { sbp.splice(m, 1); kbp.splice(m, 1); m--; change = true; }
    }
    const g2 = kbp.map((_, m) => m);
    for (let m = 0; m < kbp.length - 1; m++) {
      const k0 = kbp[m], k1 = kbp[m + 1], ref = Math.max(Math.abs(k0), Math.abs(k1));
      if (k0 && k1 && Math.abs(k0 - k1) < 0.01 * ref) { g2[m + 1] = g2[m]; if (Math.abs(k0 - k1) > 1e-12) change = true; }
    }
    if (!change) break;
    for (let m = 1; m < kbp.length - 1; m++) if (kbp[m] && g2[m] === g2[m - 1] && g2[m + 1] === g2[m]) { sbp.splice(m, 1); kbp.splice(m, 1); g2.splice(m, 1); m--; }
    res = optimiser(sbp, kbp, g2, res.p[0]);
  }
  const { p, construire, ecarts } = res;
  const segments = construire(p, true).map(({ s0: _s, L: _l, ...g }) => g);
  return { segments, ecartMax: Math.max(...ecarts(construire(p, true)).map(Math.abs)), elements: segments.map(libelleElement) };
}

/** Résolution d'un petit système linéaire (Gauss, pivot partiel). */
function resoudre(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pv = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[pv][c])) pv = i;
    [M[c], M[pv]] = [M[pv], M[c]];
    if (Math.abs(M[c][c]) < 1e-30) continue;
    for (let i = c + 1; i < n; i++) { const f = M[i][c] / M[c][c]; for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]; }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let t = M[i][n]; for (let j = i + 1; j < n; j++) t -= M[i][j] * x[j]; x[i] = Math.abs(M[i][i]) < 1e-30 ? 0 : t / M[i][i]; }
  return x;
}
