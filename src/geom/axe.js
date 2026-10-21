/**
 * Axe en plan d'un ouvrage (suite de droites et d'arcs de cercle) paramétré par l'abscisse curviligne s :
 * point(s), tangente(s), normale à gauche n(s), courbure κ(s) (> 0 : virage à gauche), projection d'un point.
 * Lignes d'appui (segments du DXF) : abscisse de leur intersection avec l'axe et angle ψ avec l'axe [gr].
 */
export class Axe {
  /** @param {object[]} segments segments chaînés ({type:'ligne', a, b} ou {type:'arc', c, r, a0, a1, sens, a, b}) */
  constructor(segments) {
    this.seg = segments.map(g => ({ ...g, L: g.type === 'ligne' ? Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) : g.r * Math.abs(g.a1 - g.a0) }));
    let s = 0; for (const g of this.seg) { g.s0 = s; s += g.L; }
    this.L = s;
  }
  /** Chaîne les segments des entités (dans l'ordre de parcours, en retournant ceux qui sont à l'envers). */
  static depuisEntites(entites, tol = 1e-3) {
    const segs = entites.flatMap(e => e.segments);
    if (!segs.length) throw new Error('axe : aucun segment');
    const inv = g => (g.type === 'ligne' ? { ...g, a: g.b, b: g.a } : { ...g, a0: g.a1, a1: g.a0, sens: -g.sens, a: g.b, b: g.a });
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    // extrémité de départ : un bout qui n'est relié à aucun autre segment
    const libres = segs.flatMap((g, k) => [[k, 'a'], [k, 'b']]).filter(([k, e]) => !segs.some((h, m) => m !== k && (d(h.a, segs[k][e]) < tol || d(h.b, segs[k][e]) < tol)));
    let [k0, e0] = libres[0] || [0, 'a'];
    const reste = new Set(segs.map((_, k) => k)), ordre = [];
    let g = e0 === 'a' ? segs[k0] : inv(segs[k0]); reste.delete(k0); ordre.push(g);
    while (reste.size) {
      let trouve = false;
      for (const k of reste) { const h = segs[k]; if (d(h.a, g.b) < tol) { g = h; } else if (d(h.b, g.b) < tol) { g = inv(h); } else continue; reste.delete(k); ordre.push(g); trouve = true; break; }
      if (!trouve) throw new Error(`axe : ${reste.size} segment(s) non raccordé(s) au tracé (tolérance ${tol} m)`);
    }
    // sens de parcours : de l'extrémité de x le plus petit vers l'autre
    const ax = new Axe(ordre);
    return ax.point(0)[0] <= ax.point(ax.L)[0] ? ax : new Axe(ordre.slice().reverse().map(inv));
  }
  _seg(s) { const t = Math.max(0, Math.min(this.L, s)); let g = this.seg[this.seg.length - 1]; for (const h of this.seg) if (t <= h.s0 + h.L + 1e-12) { g = h; break; } return [g, t - g.s0]; }
  point(s) {
    const [g, u] = this._seg(s), ext = s < 0 ? s : s > this.L ? s - this.L : 0;
    let p;
    if (g.type === 'ligne') { const t = u / g.L; p = [g.a[0] + t * (g.b[0] - g.a[0]), g.a[1] + t * (g.b[1] - g.a[1])]; }
    else { const th = g.a0 + Math.sign(g.a1 - g.a0) * u / g.r; p = [g.c[0] + g.r * Math.cos(th), g.c[1] + g.r * Math.sin(th)]; }
    if (ext) { const t = this.tangente(s); p = [p[0] + ext * t[0], p[1] + ext * t[1]]; }   // prolongement rectiligne
    return p;
  }
  tangente(s) {
    const [g, u] = this._seg(s);
    if (g.type === 'ligne') return [(g.b[0] - g.a[0]) / g.L, (g.b[1] - g.a[1]) / g.L];
    const dir = Math.sign(g.a1 - g.a0), th = g.a0 + dir * u / g.r;
    return [-Math.sin(th) * dir, Math.cos(th) * dir];
  }
  normale(s) { const t = this.tangente(s); return [-t[1], t[0]]; }
  courbure(s) { if (s < 0 || s > this.L) return 0; const [g] = this._seg(s); return g.type === 'ligne' ? 0 : Math.sign(g.a1 - g.a0) / g.r; }
  /** Point à l'abscisse s et au déport y (vers la gauche de l'axe). */
  pointDeporte(s, y) { const p = this.point(s), n = this.normale(s); return [p[0] + y * n[0], p[1] + y * n[1]]; }
  /** Abscisse et déport du point le plus proche (recherche par échantillonnage puis raffinement). */
  projeter(q) {
    const N = Math.max(200, Math.ceil(this.L / 0.5));
    let best = 0, dmin = Infinity;
    for (let k = 0; k <= N; k++) { const s = this.L * k / N, p = this.point(s), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < dmin) { dmin = d; best = s; } }
    let h = this.L / N;
    for (let it = 0; it < 40; it++) { for (const s of [best - h, best + h]) { const p = this.point(s), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < dmin) { dmin = d; best = s; } } h /= 2; }
    const p = this.point(best), n = this.normale(best);
    return { s: best, y: (q[0] - p[0]) * n[0] + (q[1] - p[1]) * n[1], d: dmin };
  }
  /** Rayon minimal (∞ si l'axe est droit), sur tout l'axe ou sur [sa, sb]. */
  rayonMin(sa = -Infinity, sb = Infinity) { return Math.min(Infinity, ...this.seg.filter(g => g.type === 'arc' && g.s0 + g.L > sa + 1e-9 && g.s0 < sb - 1e-9).map(g => g.r)); }
}

/**
 * Lignes d'appui (segments) : abscisse s de l'intersection avec l'axe, angle ψ [gr] entre l'axe et la ligne (100 gr =
 * ligne d'appui radiale, perpendiculaire à l'axe). Triées par s croissant.
 */
export function stationsAppuis(axe, lignes) {
  return lignes.map(seg => {
    // intersection : point du segment le plus proche de l'axe (déport nul)
    let lo = 0, hi = 1;
    const y = t => axe.projeter([seg.a[0] + t * (seg.b[0] - seg.a[0]), seg.a[1] + t * (seg.b[1] - seg.a[1])]).y;
    let ylo = y(lo), yhi = y(hi);
    if (ylo * yhi > 0) throw new Error('ligne d\'appui qui ne coupe pas l\'axe');
    for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2, ym = y(m); if (ylo * ym <= 0) { hi = m; yhi = ym; } else { lo = m; ylo = ym; } }
    const t = (lo + hi) / 2, P = [seg.a[0] + t * (seg.b[0] - seg.a[0]), seg.a[1] + t * (seg.b[1] - seg.a[1])], pr = axe.projeter(P);
    const u = [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]], lu = Math.hypot(u[0], u[1]), tg = axe.tangente(pr.s);
    const cosA = Math.abs(u[0] * tg[0] + u[1] * tg[1]) / lu, psi = Math.acos(Math.min(1, cosA)) * 200 / Math.PI;
    return { s: pr.s, psi, longueur: lu, P };
  }).sort((a, b) => a.s - b.s);
}
