/**
 * Surfaces d'influence de la plaque du tablier (réciprocité de Maxwell-Betti : η = K⁻¹ c, une résolution par grandeur
 * avec la matrice déjà factorisée) et enveloppes des charges d'exploitation.
 *
 * Grandeurs : m_x, m_y, m_xy aux sections de la poutre × fibres (deck.ys), réaction de chaque appareil.
 * Pour une « file » de charges du modèle poutre (voie, file de camions, chenille… : { kind, q|axles|len, tracks }), la
 * surface est réduite à une ligne d'influence le long du pont, η_f(x) = Σ_pistes part · moyenne_y∈[e1,e2] η(x, y), à
 * laquelle on applique les mêmes enveloppes longitudinales que la poutre (charge répartie, essieux, convois, bandes ;
 * parts par travée pour les δ du Fascicule 61). Les files se placent indépendamment en long, comme dans le modèle
 * poutre ; la position transversale est celle de l'arrangement.
 */
import { plaqueTablier, repere } from './deck.js';

/** Grandeurs aux sections × fibres, dans le repère des armatures (voir repere() de deck.js) : m_x → moment des aciers
 * longitudinaux, m_y → moment des aciers transversaux, m_xy → terme de torsion de Wood-Armer ; identiques aux moments
 * cartésiens pour un ouvrage droit. */
export const GRANDEURS = ['mx', 'my', 'mxy'];

export class InfluencePlaque {
  /**
   * @param {object} deck SlabDeck
   * @param {object} opt options de plaqueTablier (h, E, nu, nb, kv, psi)
   */
  constructor(deck, opt = {}) {
    this.deck = deck;
    // pas de glissement des enveloppes longitudinales (celui de la poutre ; 0,10 m fait gagner 25 % mais écarte jusqu'à 2 %)
    this.pas = opt.pas ?? 0.05;
    this.M = plaqueTablier(deck, { h: 0.5, ...opt });
    const { P, iSec, jFib } = this.M;
    this.nS = iSec.length; this.nF = jFib.length;
    this.cibles = [];
    for (const g of GRANDEURS) for (let s = 0; s < this.nS; s++) for (let f = 0; f < this.nF; f++) this.cibles.push({ g, s, f, i: iSec[s], j: jFib[f] });
    this.nM = this.cibles.length;
    for (const [k, a] of P.appuis.entries()) this.cibles.push({ g: 'R', ligne: a.ligne, rang: a.rang, k });
    // moyennes de m_y et m_xy sur les bandes de chevêtre (ligne d'appui × bande)
    this.nB0 = this.cibles.length;
    deck.beam.x0.forEach((x, ligne) => { const i = P.plusProche(P.xs, x); this.M.bandes.bandes.forEach((bd, kb) => { for (const g of ['my', 'mxy']) this.cibles.push({ g: 'B' + g, ligne, kb, i, poids: bd.poids }); }); });
    this._eta = new Array(this.cibles.length);
    this._lignes = new Map();
    this._env = new Map();
    // abscisses de la poutre (positions de charge des lignes d'influence) → interpolation sur la grille de la plaque
    const xs = P.xs, bx = deck.beam.xs;
    this.interp = Array.from(bx, x => { let k = 0; while (k < xs.length - 2 && xs[k + 1] < x) k++; const r = Math.min(1, Math.max(0, (x - xs[k]) / (xs[k + 1] - xs[k]))); return [k, r]; });
  }
  /** Surface d'influence de la cible k (Float32Array sur les nœuds). */
  surface(k) {
    if (this._eta[k]) return this._eta[k];
    const { P } = this.M, c = this.cibles[k];
    let v;
    // combinaison linéaire des vecteurs cartésiens (repère des armatures) : somme coefficient × vecteurGrandeur
    const comb = (i, j, co, w = 1, acc = null) => {
      for (const [g, a] of Object.entries(co)) { if (!a) continue; const u = P.vecteurGrandeur(i, j, g); acc ||= new Float64Array(u.length); for (let p = 0; p < u.length; p++) if (u[p]) acc[p] += w * a * u[p]; }
      return acc;
    };
    if (c.g === 'R') { v = new Float64Array(P.n); const a = P.appuis[c.k]; v[P.idx(a.i, a.j)] = a.kEff; }
    else if (c.g[0] === 'B') { for (const [j, w] of c.poids) v = comb(c.i, j, this.M.repereChev[c.g.slice(1)], w, v); v ||= new Float64Array(P.n); }
    else v = comb(c.i, c.j, this.M.repere[c.g]) || new Float64Array(P.n);
    return (this._eta[k] = Float32Array.from(P.resoudre(v)));
  }
  /** Table d'interpolation des abscisses de la poutre sur la ligne de nœuds j (biais) ; i = −1 hors de la dalle. */
  interpY(j) {
    this._iy ||= new Map();
    if (this._iy.has(j)) return this._iy.get(j);
    const { P } = this.M, xs = P.xs, sh = P.ys[j] * this.M.cot;
    const tab = Array.from(this.deck.beam.xs, x => {
      const t = x - sh;
      if (t < xs[0] - 1e-9 || t > xs[xs.length - 1] + 1e-9) return [-1, 0];
      let k = 0; while (k < xs.length - 2 && xs[k + 1] < t) k++;
      return [k, Math.min(1, Math.max(0, (t - xs[k]) / (xs[k + 1] - xs[k])))];
    });
    this._iy.set(j, tab);
    return tab;
  }
  /** Ligne d'influence (abscisses de la poutre) de la cible k pour une piste [e1, e2]. */
  ligne(k, e1, e2) {
    const key = `${k}|${e1.toFixed(3)}|${e2.toFixed(3)}`;
    if (this._lignes.has(key)) return this._lignes.get(key);
    const { P } = this.M, ys = P.ys, eta = this.surface(k), b = this.deck.b;
    const a1 = Math.max(-b, Math.min(e1, e2)), a2 = Math.min(b, Math.max(e1, e2));
    // poids en y : point (interpolation linéaire) ou moyenne sur [a1, a2] (trapèzes sur la grille, bornes interpolées)
    const poids = new Float64Array(ys.length);
    const pointY = (y, w) => { let j = 0; while (j < ys.length - 2 && ys[j + 1] < y) j++; const r = Math.min(1, Math.max(0, (y - ys[j]) / (ys[j + 1] - ys[j]))); poids[j] += w * (1 - r); poids[j + 1] += w * r; };
    if (a2 - a1 < 1e-6) pointY(a1, 1);
    else {
      const pts = [a1, ...ys.filter(y => y > a1 && y < a2), a2], L = a2 - a1;
      for (let m = 1; m < pts.length; m++) { const d = (pts[m] - pts[m - 1]) / L / 2; pointY(pts[m - 1], d); pointY(pts[m], d); }
    }
    const nx = P.xs.length, ny = ys.length, J = [], W = [];
    for (let j = 0; j < ny; j++) if (poids[j]) { J.push(j); W.push(poids[j]); }
    const out = new Float64Array(this.deck.beam.xs.length);
    if (!this.M.cot) {
      const lx = new Float64Array(nx);
      for (let i = 0; i < nx; i++) { let t = 0; const o = i * ny; for (let m = 0; m < J.length; m++) t += W[m] * eta[o + J[m]]; lx[i] = t; }
      for (let m = 0; m < out.length; m++) { const [i, r] = this.interp[m]; out[m] = lx[i] * (1 - r) + lx[i + 1] * r; }
    } else {
      // ouvrage biais : la charge en (x, y) est au nœud d'abscisse s = x − y·cot ψ ; interpolation propre à chaque fibre
      for (let q = 0; q < J.length; q++) {
        const j = J[q], tab = this.interpY(j);
        for (let m = 0; m < out.length; m++) { const [i, r] = tab[m]; if (i < 0) continue; out[m] += W[q] * (eta[i * ny + j] * (1 - r) + eta[(i + 1) * ny + j] * r); }
      }
    }
    this._lignes.set(key, out);
    return out;
  }
  /**
   * Enveloppes d'une file pour toutes les cibles : { max, min, partsMax, partsMin }[] (indice de cible).
   * @param {object} f file du modèle poutre ; envOf(il) = enveloppe longitudinale de cette file sur une ligne d'influence
   */
  enveloppesFile(f, envOf, sig) {
    const key = `${sig}|${f.tracks.map(t => `${t.e1.toFixed(3)},${t.e2.toFixed(3)},${t.share}`).join(';')}`;
    if (this._env.has(key)) return this._env.get(key);
    const n = this.cibles.length, out = new Array(n), nX = this.interp.length;
    // ouvrage courbe : une charge répartie par mètre de voie, à l'excentrement y, couvre J = 1 − κ y mètre d'axe
    const geo = this.M.geo, distrib = ['udl', 'strip', 'stripTrain', 'spanwise'].includes(f.kind), bx = this.deck.beam.xs;
    const Jt = geo && distrib ? f.tracks.map(t => Float64Array.from(bx, x => geo.J(x, (t.e1 + t.e2) / 2))) : null;
    for (let k = 0; k < n; k++) {
      const il = new Float64Array(nX);
      f.tracks.forEach((t, q) => { const l = this.ligne(k, t.e1, t.e2); for (let m = 0; m < nX; m++) il[m] += t.share * l[m] * (Jt ? Jt[q][m] : 1); });
      out[k] = envOf(il);
    }
    this._env.set(key, out);
    return out;
  }
  /** Indice de la cible (grandeur g, section s, fibre f). */
  indice(g, s, f) { return GRANDEURS.indexOf(g) * this.nS * this.nF + s * this.nF + f; }
}
