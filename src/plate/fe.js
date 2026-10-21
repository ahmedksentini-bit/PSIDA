/**
 * Plaque mince de Kirchhoff par éléments finis : triangle DKT (Discrete Kirchhoff Triangle ; J.-L. Batoz, K.-J. Bathe,
 * L.-W. Ho, « A study of three-node triangular plate bending elements », Int. J. Numer. Methods Eng., 15, 1980), trois
 * degrés de liberté par nœud (w, θx = ∂w/∂y, θy = −∂w/∂x). Les rotations βx = −∂w/∂x, βy = −∂w/∂y sont interpolées
 * quadratiquement (fonctions Hx, Hy) avec l'hypothèse de Kirchhoff imposée aux sommets et aux milieux des côtés.
 *
 * Maillage : grille (s, y) à pas variables, s = abscisse le long de l'axe mesurée sur la ligne y = 0 ; un nœud (s, y) est
 * au point x = s + y·cot ψ, de sorte que les lignes s = cte sont parallèles aux lignes d'appui (ouvrage biais d'angle ψ,
 * ψ = 100 gr pour un ouvrage droit) et les lignes y = cte aux bords libres. Chaque maille (parallélogramme) est coupée
 * en deux triangles par sa plus courte diagonale (en damier pour un ouvrage droit).
 *
 * Mêmes conventions et même interface que PlaqueDF (fd.js) : w positif vers le bas, m_x = −D(w,xx + ν w,yy),
 * m_y = −D(w,yy + ν w,xx), m_xy = −D(1 − ν) w,xy ; resoudre(F) renvoie les flèches nodales (le vecteur complet des
 * inconnues est attaché en .u) ; vecteurGrandeur(i, j, g) renvoie le vecteur c tel que la grandeur vaille cᵀu, d'où la
 * surface d'influence η = (K⁻¹c)_w (réciprocité de Maxwell-Betti). Les moments nodaux sont la moyenne des valeurs aux
 * sommets des triangles qui se partagent le nœud.
 * Unités : m, kN, kPa ; D en kN·m.
 */
import { BandSPD } from './fd.js';

// points d'intégration : milieux des côtés (exact pour un intégrande quadratique), poids 1/6
const GAUSS = [[0.5, 0], [0.5, 0.5], [0, 0.5]];

/** Coefficients a, b, c, d, e des côtés 4 (2-3), 5 (3-1), 6 (1-2). */
function coefficients(x, y) {
  const out = {};
  for (const [k, i, j] of [[4, 1, 2], [5, 2, 0], [6, 0, 1]]) {
    const xij = x[i] - x[j], yij = y[i] - y[j], l2 = xij * xij + yij * yij;
    out[k] = { a: -xij / l2, b: 0.75 * xij * yij / l2, c: (0.25 * xij * xij - 0.5 * yij * yij) / l2, d: -yij / l2, e: (0.25 * yij * yij - 0.5 * xij * xij) / l2 };
  }
  return out;
}

/** Hx, Hy (9 composantes) au point (ξ, η) du triangle de référence. */
function H(C, xi, eta) {
  const L1 = 1 - xi - eta;
  const N1 = L1 * (2 * L1 - 1), N2 = xi * (2 * xi - 1), N3 = eta * (2 * eta - 1), N4 = 4 * xi * eta, N5 = 4 * eta * L1, N6 = 4 * xi * L1;
  const { 4: c4, 5: c5, 6: c6 } = C;
  const Hx = [
    1.5 * (c6.a * N6 - c5.a * N5), c5.b * N5 + c6.b * N6, N1 - c5.c * N5 - c6.c * N6,
    1.5 * (c4.a * N4 - c6.a * N6), c6.b * N6 + c4.b * N4, N2 - c6.c * N6 - c4.c * N4,
    1.5 * (c5.a * N5 - c4.a * N4), c4.b * N4 + c5.b * N5, N3 - c4.c * N4 - c5.c * N5,
  ];
  const Hy = [
    1.5 * (c6.d * N6 - c5.d * N5), -N1 + c5.e * N5 + c6.e * N6, -c5.b * N5 - c6.b * N6,
    1.5 * (c4.d * N4 - c6.d * N6), -N2 + c6.e * N6 + c4.e * N4, -c6.b * N6 - c4.b * N4,
    1.5 * (c5.d * N5 - c4.d * N4), -N3 + c4.e * N4 + c5.e * N5, -c4.b * N4 - c5.b * N5,
  ];
  return [Hx, Hy];
}

/** Matrice B (3 × 9) des courbures [βx,x ; βy,y ; βx,y + βy,x] au point (ξ, η) ; dérivées par différences centrées,
 * exactes puisque Hx et Hy sont quadratiques. */
function matB(T, xi, eta) {
  const { C, x, y, A2 } = T, h = 1e-3;
  const [Hxp, Hyp] = H(C, xi + h, eta), [Hxm, Hym] = H(C, xi - h, eta), [Hxq, Hyq] = H(C, xi, eta + h), [Hxr, Hyr] = H(C, xi, eta - h);
  const x31 = x[2] - x[0], x12 = x[0] - x[1], y31 = y[2] - y[0], y12 = y[0] - y[1];
  const B = [new Float64Array(9), new Float64Array(9), new Float64Array(9)];
  for (let k = 0; k < 9; k++) {
    const hxXi = (Hxp[k] - Hxm[k]) / (2 * h), hxEt = (Hxq[k] - Hxr[k]) / (2 * h), hyXi = (Hyp[k] - Hym[k]) / (2 * h), hyEt = (Hyq[k] - Hyr[k]) / (2 * h);
    B[0][k] = (y31 * hxXi + y12 * hxEt) / A2;
    B[1][k] = (-x31 * hyXi - x12 * hyEt) / A2;
    B[2][k] = (-x31 * hxXi - x12 * hxEt + y31 * hyXi + y12 * hyEt) / A2;
  }
  return B;
}

export class PlaqueEF {
  /**
   * @param {object} o { xs : abscisses s de la grille, ys, D:(x,y)=>number, nu, appuis:[{x,y,k}] (x = abscisse le long de
   *   l'axe du point d'appui ; ressorts verticaux kN/m ; k = Infinity → très raide), psi [gr] (biais, défaut 100) }
   */
  constructor({ xs, ys, D, nu = 0.2, appuis = [], psi = 100, geo = null }) {
    // geo (ouvrage courbe) : { pt(s, y) → [x, y], J(s, y) = 1 − κ y (rapport des aires), theta(s) angle de la tangente } ;
    // les moments sont alors exprimés dans le repère local (tangente, normale) de l'axe
    this.geo = geo;
    this.xs = xs; this.ys = ys; this.nu = nu; this.psi = psi;
    this.cot = Math.abs(psi - 100) < 1e-9 ? 0 : 1 / Math.tan(psi * Math.PI / 200);
    this.nx = xs.length; this.ny = ys.length; this.n = this.nx * this.ny; this.ndof = 3 * this.n;
    this.idx = (i, j) => i * this.ny + j;
    this.X = (i, j) => xs[i] + ys[j] * this.cot;
    this.Pt = (i, j) => (geo ? geo.pt(xs[i], ys[j]) : [this.X(i, j), ys[j]]);
    this.Dn = new Float64Array(this.n);
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.ny; j++) this.Dn[this.idx(i, j)] = typeof D === 'function' ? D(this.X(i, j), ys[j]) : D;
    this.appuis = appuis.map(a => ({ ...a, i: this.plusProche(xs, geo ? (a.s ?? a.x) : a.x - a.y * this.cot), j: this.plusProche(ys, a.y) }));
    this.mailler();
    this.assembler();
  }
  plusProche(v, t) { let b = 0; for (let k = 1; k < v.length; k++) if (Math.abs(v[k] - t) < Math.abs(v[b] - t)) b = k; return b; }
  mailler() {
    const { nx, ny, ys } = this, T = [];
    const tri = (p, q, r) => {
      const ids = [p, q, r].map(([i, j]) => this.idx(i, j));
      const P3 = [p, q, r].map(([i, j]) => this.Pt(i, j));
      let x = P3.map(v => v[0]), y = P3.map(v => v[1]);
      let A2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
      if (A2 < 0) { [ids[1], ids[2]] = [ids[2], ids[1]]; [x[1], x[2]] = [x[2], x[1]]; [y[1], y[2]] = [y[2], y[1]]; A2 = -A2; }
      const D = (this.Dn[ids[0]] + this.Dn[ids[1]] + this.Dn[ids[2]]) / 3;
      T.push({ ids, x, y, A2, D, C: coefficients(x, y) });
    };
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      const dd = (u, v) => { const A = this.Pt(...u), B = this.Pt(...v); return Math.hypot(A[0] - B[0], A[1] - B[1]); };
      const d1 = dd([i + 1, j + 1], [i, j]), d2 = dd([i, j + 1], [i + 1, j]);
      const diag1 = Math.abs(d1 - d2) < 1e-9 * (d1 + d2) ? (i + j) % 2 === 0 : d1 < d2;
      if (diag1) { tri([i, j], [i + 1, j], [i + 1, j + 1]); tri([i, j], [i + 1, j + 1], [i, j + 1]); }
      else { tri([i, j], [i + 1, j], [i, j + 1]); tri([i + 1, j], [i + 1, j + 1], [i, j + 1]); }
    }
    this.T = T;
    // triangles autour de chaque nœud (lissage des moments)
    this.autour = Array.from({ length: this.n }, () => []);
    T.forEach((t, e) => t.ids.forEach((p, s) => this.autour[p].push([e, s])));
  }
  Db(D) { const nu = this.nu; return [[D, D * nu, 0], [D * nu, D, 0], [0, 0, D * (1 - nu) / 2]]; }
  assembler() {
    const K = new BandSPD(this.ndof, 3 * (this.ny + 2));
    for (const t of this.T) {
      const Db = this.Db(t.D), ke = Array.from({ length: 9 }, () => new Float64Array(9));
      for (const [xi, eta] of GAUSS) {
        const B = matB(t, xi, eta), w = t.A2 / 6;   // 2A × poids 1/6 (aire du triangle de référence 1/2 × 1/3)
        const DB = [0, 1, 2].map(r => Float64Array.from({ length: 9 }, (_, k) => Db[r][0] * B[0][k] + Db[r][1] * B[1][k] + Db[r][2] * B[2][k]));
        for (let p = 0; p < 9; p++) for (let q = p; q < 9; q++) ke[p][q] += w * (B[0][p] * DB[0][q] + B[1][p] * DB[1][q] + B[2][p] * DB[2][q]);
      }
      const g = t.ids.flatMap(p => [3 * p, 3 * p + 1, 3 * p + 2]);
      for (let p = 0; p < 9; p++) for (let q = p; q < 9; q++) if (ke[p][q]) K.add(g[p], g[q], ke[p][q]);
    }
    const h = Math.min(this.xs[1] - this.xs[0], this.ys[1] - this.ys[0]);
    for (const a of this.appuis) {
      const p = this.idx(a.i, a.j);
      a.kEff = Number.isFinite(a.k) ? a.k : 1e6 * this.Dn[p] / (h * h);
      K.add(3 * p, 3 * p, a.kEff);
    }
    this.K = K;
  }
  /** Charges nodales d'une charge uniforme q [kPa] sur [s1, s2] × [y1, y2] (x1, x2 = abscisses s ; aires tributaires,
   * l'aire d'une maille en parallélogramme valant Δs·Δy). */
  chargeRectangle(F, { x1, x2, y1, y2, q }) {
    const { xs, ys, nx, ny } = this;
    const bornes = (v, k, N) => [k > 0 ? (v[k - 1] + v[k]) / 2 : v[0], k < N - 1 ? (v[k] + v[k + 1]) / 2 : v[N - 1]];
    for (let i = 0; i < nx; i++) {
      const [a1, a2] = bornes(xs, i, nx), lx = Math.min(a2, x2) - Math.max(a1, x1);
      if (lx <= 0) continue;
      for (let j = 0; j < ny; j++) {
        const [b1, b2] = bornes(ys, j, ny), ly = Math.min(b2, y2) - Math.max(b1, y1);
        if (ly > 0) F[this.idx(i, j)] += q * lx * ly * (this.geo ? this.geo.J(xs[i], ys[j]) : 1);
      }
    }
    return F;
  }
  /** Force ponctuelle P [kN] au point (x, y) (x le long de l'axe), répartie bilinéairement en (s, y). */
  chargePonctuelle(F, { x, y, P }) {
    const loc = (v, t) => { let k = 0; while (k < v.length - 2 && v[k + 1] < t) k++; const r = (t - v[k]) / (v[k + 1] - v[k]); return [k, Math.min(1, Math.max(0, r))]; };
    const [i, rx] = loc(this.xs, x - y * this.cot), [j, ry] = loc(this.ys, y);
    F[this.idx(i, j)] += P * (1 - rx) * (1 - ry); F[this.idx(i + 1, j)] += P * rx * (1 - ry);
    F[this.idx(i, j + 1)] += P * (1 - rx) * ry; F[this.idx(i + 1, j + 1)] += P * rx * ry;
    return F;
  }
  vecteur() { return new Float64Array(this.n); }
  /** F : charges nodales (n) ou second membre complet (3n). Renvoie les flèches nodales, vecteur complet en .u. */
  resoudre(F) {
    let b = F;
    if (F.length === this.n) { b = new Float64Array(this.ndof); for (let p = 0; p < this.n; p++) b[3 * p] = F[p]; }
    const u = this.K.solve(b), w = new Float64Array(this.n);
    for (let p = 0; p < this.n; p++) w[p] = u[3 * p];
    w.u = u;
    return w;
  }
  /** Moments élémentaires au sommet s du triangle e : lignes [mx, my, mxy] de Db·B (vecteurs de 9 coefficients). */
  _sommet(e, s) {
    const t = this.T[e], B = matB(t, [0, 1, 0][s], [0, 0, 1][s]), Db = this.Db(t.D);
    const m = [0, 1, 2].map(r => Float64Array.from({ length: 9 }, (_, k) => Db[r][0] * B[0][k] + Db[r][1] * B[1][k] + Db[r][2] * B[2][k]));
    return m;
  }
  _cache() {
    if (this._som) return this._som;
    return (this._som = this.T.map((_, e) => [0, 1, 2].map(s => this._sommet(e, s))));
  }
  /** Moments [kN·m/m] aux nœuds (moyenne des sommets des triangles adjacents) : { mx, my, mxy }. */
  moments(w) {
    const u = w.u || w, S = this._cache(), n = this.n, out = { mx: new Float64Array(n), my: new Float64Array(n), mxy: new Float64Array(n) };
    const keys = ['mx', 'my', 'mxy'];
    for (let p = 0; p < n; p++) {
      const lst = this.autour[p];
      for (const [e, s] of lst) {
        const g = this.T[e].ids;
        for (let r = 0; r < 3; r++) { let v = 0; for (let k = 0; k < 9; k++) v += S[e][s][r][k] * u[3 * g[Math.floor(k / 3)] + (k % 3)]; out[keys[r]][p] += v / lst.length; }
      }
    }
    if (this.geo) for (let p = 0; p < n; p++) {   // repère local de l'axe (tangente, normale)
      const th = this.geo.theta(this.xs[Math.floor(p / this.ny)]), c = Math.cos(th), sn = Math.sin(th), a = out.mx[p], b = out.my[p], t = out.mxy[p];
      out.mx[p] = c * c * a + sn * sn * b + 2 * c * sn * t; out.my[p] = sn * sn * a + c * c * b - 2 * c * sn * t; out.mxy[p] = -c * sn * a + c * sn * b + (c * c - sn * sn) * t;
    }
    for (let p = 0; p < n; p++) if (this.bordY(p)) out.my[p] = 0;   // bord libre y = cte : m_y = 0 (m_n nul)
    return out;
  }
  /** Nœud sur un bord libre y = ±b. */
  bordY(p) { const j = p % this.ny; return j === 0 || j === this.ny - 1; }
  /**
   * Vecteur c (3n) tel que la grandeur au nœud (i, j) vaille cᵀu. g : 'mx', 'my', 'mxy' ou combinaison linéaire
   * { mx: a, my: b, mxy: c } (moments dans la direction des armatures).
   */
  vecteurGrandeur(i, j, g) {
    const co = typeof g === 'string' ? { [g]: 1 } : g;
    let f = [co.mx || 0, this.bordY(this.idx(i, j)) ? 0 : co.my || 0, co.mxy || 0];
    if (this.geo) {   // coefficients du repère local ramenés au repère global
      const th = this.geo.theta(this.xs[i]), c = Math.cos(th), sn = Math.sin(th);
      f = [f[0] * c * c + f[1] * sn * sn - f[2] * c * sn, f[0] * sn * sn + f[1] * c * c + f[2] * c * sn, f[0] * 2 * c * sn - f[1] * 2 * c * sn + f[2] * (c * c - sn * sn)];
    }
    const c = new Float64Array(this.ndof), p = this.idx(i, j), lst = this.autour[p], S = this._cache();
    for (const [e, s] of lst) {
      const ids = this.T[e].ids;
      for (let k = 0; k < 9; k++) {
        const v = f[0] * S[e][s][0][k] + f[1] * S[e][s][1][k] + f[2] * S[e][s][2][k];
        c[3 * ids[Math.floor(k / 3)] + (k % 3)] += v / lst.length;
      }
    }
    c.complet = true;
    return c;
  }
  /** Réactions des appuis [kN] (positives vers le haut). */
  reactions(w) { return this.appuis.map(a => ({ ...a, R: a.kEff * w[this.idx(a.i, a.j)] })); }
}
