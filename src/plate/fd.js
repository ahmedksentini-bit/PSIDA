/**
 * Plaque mince de Kirchhoff par différences finies, en formulation énergétique (méthode des différences finies
 * énergétique : les courbures sont des différences finies centrées des flèches nodales, l'énergie de déformation est
 * sommée sur la grille et minimisée). Les conditions de bord libre (m_n = 0, effort tranchant de Kirchhoff nul, coins
 * libres) sont alors naturelles : elles n'ont pas à être écrites avec des nœuds fictifs.
 *
 *   U = ½ Σ_nœuds A D [κx² + κy² + 2ν κx κy] + ½ Σ_mailles A D 2(1 − ν) κxy²  −  Σ F w  + ½ Σ k w²  (appuis élastiques)
 *   κx = ∂²w/∂x², κy = ∂²w/∂y², κxy = ∂²w/∂x∂y ; w positif vers le bas, moments positifs en fibre inférieure tendue :
 *   m_x = −D(κx + ν κy), m_y = −D(κy + ν κx), m_xy = −D(1 − ν) κxy.
 *
 * Grille rectangulaire à pas variables (les lignes d'appui et les bords tombent sur des nœuds). Aux nœuds de bord, la
 * courbure perpendiculaire au bord, qui n'a pas de différence centrée, est prise égale à celle du premier nœud intérieur
 * (option `bord : 'extrapole'`), ou omise (`'omis'`).
 * Unités : m, kN, kPa ; D en kN·m.
 */

/** Système symétrique défini positif en stockage bande (moitié supérieure), factorisation de Cholesky. */
export class BandSPD {
  constructor(n, bw) {
    this.n = n; this.bw = bw; this.a = new Float64Array(n * (bw + 1)); this.factored = false;
  }
  add(i, j, v) {
    if (j < i) [i, j] = [j, i];
    const d = j - i; if (d > this.bw) throw new Error(`BandSPD : hors bande (${d} > ${this.bw})`);
    this.a[i * (this.bw + 1) + d] += v;
  }
  get(i, j) { if (j < i) [i, j] = [j, i]; const d = j - i; return d > this.bw ? 0 : this.a[i * (this.bw + 1) + d]; }
  factor() {
    const { n, bw, a } = this, W = bw + 1;
    for (let i = 0; i < n; i++) {
      // a[i][i] -= Σ_k L[k][i]² ; puis ligne i
      const kmin = Math.max(0, i - bw);
      let s = a[i * W];
      for (let k = kmin; k < i; k++) { const l = a[k * W + (i - k)]; s -= l * l; }
      if (!(s > 0)) throw new Error(`plaque : matrice non définie positive au nœud ${i} (appuis insuffisants ?)`);
      const lii = Math.sqrt(s); a[i * W] = lii;
      const jmax = Math.min(n - 1, i + bw);
      for (let j = i + 1; j <= jmax; j++) {
        let t = a[i * W + (j - i)];
        const k0 = Math.max(0, j - bw);
        for (let k = Math.max(kmin, k0); k < i; k++) t -= a[k * W + (i - k)] * a[k * W + (j - k)];
        a[i * W + (j - i)] = t / lii;
      }
    }
    this.factored = true;
  }
  solve(b) {
    if (!this.factored) this.factor();
    const { n, bw, a } = this, W = bw + 1, x = Float64Array.from(b);
    for (let i = 0; i < n; i++) { let s = x[i]; for (let k = Math.max(0, i - bw); k < i; k++) s -= a[k * W + (i - k)] * x[k]; x[i] = s / a[i * W]; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j <= Math.min(n - 1, i + bw); j++) s -= a[i * W + (j - i)] * x[j]; x[i] = s / a[i * W]; }
    return x;
  }
}

/** Coordonnées de grille : points imposés (bords, lignes d'appui, appareils…) et pas maximal h entre deux points. */
export function grille(points, h) {
  const p = [...new Set(points.map(v => Math.round(v * 1e6) / 1e6))].sort((u, v) => u - v);
  const out = [p[0]];
  for (let k = 1; k < p.length; k++) {
    const L = p[k] - p[k - 1]; if (L < 1e-6) continue;
    const n = Math.max(1, Math.round(L / h));
    for (let m = 1; m <= n; m++) out.push(p[k - 1] + L * m / n);
  }
  return out;
}

/** Coefficients de la dérivée seconde centrée sur pas variables (h1 à gauche, h2 à droite). */
const d2 = (h1, h2) => [2 / (h1 * (h1 + h2)), -2 / (h1 * h2), 2 / (h2 * (h1 + h2))];

/**
 * Plaque rectangulaire [x0 ; x1] × [y0 ; y1] sur grille xs × ys.
 * @param {object} o { xs, ys, D:(x,y)=>number, nu, appuis:[{x,y,k}] (ressorts verticaux, kN/m ; k = Infinity → très raide),
 *   bord : 'extrapole' | 'omis' }
 */
export class PlaqueDF {
  constructor({ xs, ys, D, nu = 0.2, appuis = [], bord = 'extrapole' }) {
    this.xs = xs; this.ys = ys; this.nu = nu; this.bord = bord;
    this.nx = xs.length; this.ny = ys.length; this.n = this.nx * this.ny;
    this.idx = (i, j) => i * this.ny + j;
    this.Dn = new Float64Array(this.n);
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.ny; j++) this.Dn[this.idx(i, j)] = typeof D === 'function' ? D(xs[i], ys[j]) : D;
    this.appuis = appuis.map(a => ({ ...a, i: this.plusProche(xs, a.x), j: this.plusProche(ys, a.y) }));
    this.assembler();
  }
  plusProche(v, t) { let b = 0; for (let k = 1; k < v.length; k++) if (Math.abs(v[k] - t) < Math.abs(v[b] - t)) b = k; return b; }
  /** Aire tributaire d'un nœud. */
  aire(i, j) {
    const { xs, ys, nx, ny } = this;
    const ax = ((i > 0 ? xs[i] - xs[i - 1] : 0) + (i < nx - 1 ? xs[i + 1] - xs[i] : 0)) / 2;
    const ay = ((j > 0 ? ys[j] - ys[j - 1] : 0) + (j < ny - 1 ? ys[j + 1] - ys[j] : 0)) / 2;
    return ax * ay;
  }
  /** Courbure κx au nœud (i, j) : liste [(indice, coefficient)] ou null. */
  kx(i, j) {
    const { xs, nx } = this;
    let c = i;
    if (i === 0 || i === nx - 1) { if (this.bord === 'omis' || nx < 3) return null; c = i === 0 ? 1 : nx - 2; }
    const [a, b, d] = d2(xs[c] - xs[c - 1], xs[c + 1] - xs[c]);
    return [[this.idx(c - 1, j), a], [this.idx(c, j), b], [this.idx(c + 1, j), d]];
  }
  ky(i, j) {
    const { ys, ny } = this;
    let c = j;
    if (j === 0 || j === ny - 1) { if (this.bord === 'omis' || ny < 3) return null; c = j === 0 ? 1 : ny - 2; }
    const [a, b, d] = d2(ys[c] - ys[c - 1], ys[c + 1] - ys[c]);
    return [[this.idx(i, c - 1), a], [this.idx(i, c), b], [this.idx(i, c + 1), d]];
  }
  /** Torsion κxy de la maille (i, j)-(i+1, j+1). */
  kxy(i, j) {
    const hx = this.xs[i + 1] - this.xs[i], hy = this.ys[j + 1] - this.ys[j], s = 1 / (hx * hy);
    return [[this.idx(i + 1, j + 1), s], [this.idx(i + 1, j), -s], [this.idx(i, j + 1), -s], [this.idx(i, j), s]];
  }
  assembler() {
    const { nx, ny, nu } = this;
    const K = new BandSPD(this.n, 2 * ny + 2);
    // forme quadratique ½ wᵀ K w ; pour un terme ½ c (uᵀw)(vᵀw), K reçoit c (u vᵀ + v uᵀ)/2 ; pour ½ c (uᵀw)², K reçoit c u uᵀ
    const quad = (u, v, c) => {
      const acc = new Map();
      const put = (p, q, val) => { const a = p <= q ? p : q, b = p <= q ? q : p; const key = a * this.n + b; acc.set(key, (acc.get(key) || 0) + val); };
      if (u === v) { for (const [p, a] of u) for (const [q, b] of u) put(p, q, c * a * b); }
      else { for (const [p, a] of u) for (const [q, b] of v) { put(p, q, 0.5 * c * a * b); put(q, p, 0.5 * c * a * b); } }
      for (const [key, val] of acc) { const a = Math.floor(key / this.n), b = key - a * this.n; K.add(a, b, a === b ? val : val / 2); }
    };
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const A = this.aire(i, j), D = this.Dn[this.idx(i, j)], cx = this.kx(i, j), cy = this.ky(i, j);
      if (cx) quad(cx, cx, A * D);
      if (cy) quad(cy, cy, A * D);
      if (cx && cy) quad(cx, cy, 2 * nu * A * D);
    }
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      const A = (this.xs[i + 1] - this.xs[i]) * (this.ys[j + 1] - this.ys[j]);
      const D = (this.Dn[this.idx(i, j)] + this.Dn[this.idx(i + 1, j)] + this.Dn[this.idx(i, j + 1)] + this.Dn[this.idx(i + 1, j + 1)]) / 4;
      const c = this.kxy(i, j);
      quad(c, c, 2 * (1 - nu) * A * D);
    }
    // appuis élastiques ; appui « rigide » : raideur 10⁶ fois la raideur de flexion locale D/h²
    for (const a of this.appuis) {
      const p = this.idx(a.i, a.j), h = Math.min(this.xs[1] - this.xs[0], this.ys[1] - this.ys[0]);
      a.kEff = Number.isFinite(a.k) ? a.k : 1e6 * this.Dn[p] / (h * h);
      K.add(p, p, a.kEff);
    }
    this.K = K;
  }
  /** Charges nodales équivalentes d'un rectangle uniforme q [kPa] sur [x1, x2] × [y1, y2] (aires tributaires). */
  chargeRectangle(F, { x1, x2, y1, y2, q }) {
    const { xs, ys, nx, ny } = this;
    const bornes = (v, k, N) => [k > 0 ? (v[k - 1] + v[k]) / 2 : v[0], k < N - 1 ? (v[k] + v[k + 1]) / 2 : v[N - 1]];
    for (let i = 0; i < nx; i++) {
      const [a1, a2] = bornes(xs, i, nx), lx = Math.min(a2, x2) - Math.max(a1, x1);
      if (lx <= 0) continue;
      for (let j = 0; j < ny; j++) {
        const [b1, b2] = bornes(ys, j, ny), ly = Math.min(b2, y2) - Math.max(b1, y1);
        if (ly > 0) F[this.idx(i, j)] += q * lx * ly;
      }
    }
    return F;
  }
  /** Force ponctuelle P [kN] répartie bilinéairement sur les quatre nœuds voisins. */
  chargePonctuelle(F, { x, y, P }) {
    const loc = (v, t) => { let k = 0; while (k < v.length - 2 && v[k + 1] < t) k++; const r = (t - v[k]) / (v[k + 1] - v[k]); return [k, Math.min(1, Math.max(0, r))]; };
    const [i, rx] = loc(this.xs, x), [j, ry] = loc(this.ys, y);
    F[this.idx(i, j)] += P * (1 - rx) * (1 - ry); F[this.idx(i + 1, j)] += P * rx * (1 - ry);
    F[this.idx(i, j + 1)] += P * (1 - rx) * ry; F[this.idx(i + 1, j + 1)] += P * rx * ry;
    return F;
  }
  vecteur() { return new Float64Array(this.n); }
  resoudre(F) { return this.K.solve(F); }
  /** Moments [kN·m/m] aux nœuds : { mx, my, mxy } (Float64Array, indice idx(i, j)). */
  moments(w) {
    const { nx, ny, nu } = this, mx = new Float64Array(this.n), my = new Float64Array(this.n), mxy = new Float64Array(this.n), cnt = new Float64Array(this.n);
    const val = c => (c ? c.reduce((s, [p, a]) => s + a * w[p], 0) : 0);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const p = this.idx(i, j), D = this.Dn[p];
      // au bord, la courbure perpendiculaire extrapolée n'est pas fiable pour les moments : on impose m_n = 0 sur un bord libre
      let kx = val(this.kx(i, j)), ky = val(this.ky(i, j));
      const bordX = i === 0 || i === nx - 1, bordY = j === 0 || j === ny - 1;
      if (bordY && !bordX) ky = -nu * kx;            // m_y = 0 au bord libre y = cte
      if (bordX && !bordY) kx = -nu * ky;            // m_x = 0 au bord libre x = cte
      if (bordX && bordY) { kx = 0; ky = 0; }
      mx[p] = -D * (kx + nu * ky); my[p] = -D * (ky + nu * kx);
    }
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      const v = val(this.kxy(i, j));
      const D = (this.Dn[this.idx(i, j)] + this.Dn[this.idx(i + 1, j)] + this.Dn[this.idx(i, j + 1)] + this.Dn[this.idx(i + 1, j + 1)]) / 4;
      for (const p of [this.idx(i, j), this.idx(i + 1, j), this.idx(i, j + 1), this.idx(i + 1, j + 1)]) { mxy[p] += -D * (1 - nu) * v; cnt[p]++; }
    }
    for (let p = 0; p < this.n; p++) mxy[p] /= cnt[p] || 1;
    return { mx, my, mxy };
  }
  /**
   * Vecteur c tel que la grandeur vaille cᵀw au nœud (i, j) : 'mx', 'my', 'mxy' (mêmes règles de bord que moments()).
   * La surface d'influence de la grandeur est alors η = K⁻¹ c (réciprocité de Maxwell-Betti).
   */
  vecteurGrandeur(i, j, type) {
    const { nx, ny, nu } = this, c = new Float64Array(this.n), p0 = this.idx(i, j), D = this.Dn[p0];
    const add = (lst, f) => { if (lst) for (const [p, a] of lst) c[p] += f * a; };
    if (type === 'mxy') {
      const cells = [];
      for (const [a, b] of [[i - 1, j - 1], [i - 1, j], [i, j - 1], [i, j]]) if (a >= 0 && b >= 0 && a < nx - 1 && b < ny - 1) cells.push([a, b]);
      for (const [a, b] of cells) {
        const Dc = (this.Dn[this.idx(a, b)] + this.Dn[this.idx(a + 1, b)] + this.Dn[this.idx(a, b + 1)] + this.Dn[this.idx(a + 1, b + 1)]) / 4;
        add(this.kxy(a, b), -Dc * (1 - nu) / cells.length);
      }
      return c;
    }
    const bordX = i === 0 || i === nx - 1, bordY = j === 0 || j === ny - 1;
    if (bordX && bordY) return c;
    const kx = this.kx(i, j), ky = this.ky(i, j);
    if (bordY) { if (type === 'mx') add(kx, -D * (1 - nu * nu)); return c; }   // m_y = 0 : ky = −ν kx
    if (bordX) { if (type === 'my') add(ky, -D * (1 - nu * nu)); return c; }
    if (type === 'mx') { add(kx, -D); add(ky, -D * nu); } else { add(ky, -D); add(kx, -D * nu); }
    return c;
  }
  /** Réactions des appuis [kN] (positives vers le haut). */
  reactions(w) { return this.appuis.map(a => ({ ...a, R: a.kEff * w[this.idx(a.i, a.j)] })); }
}
