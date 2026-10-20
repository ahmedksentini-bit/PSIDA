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
import { plaqueTablier } from './deck.js';

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
    if (c.g === 'R') { v = new Float64Array(P.n); const a = P.appuis[c.k]; v[P.idx(a.i, a.j)] = a.kEff; }
    else v = P.vecteurGrandeur(c.i, c.j, c.g);
    return (this._eta[k] = Float32Array.from(P.resoudre(v)));
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
    const nx = P.xs.length, ny = ys.length, lx = new Float64Array(nx), J = [], W = [];
    for (let j = 0; j < ny; j++) if (poids[j]) { J.push(j); W.push(poids[j]); }
    for (let i = 0; i < nx; i++) { let t = 0; const o = i * ny; for (let m = 0; m < J.length; m++) t += W[m] * eta[o + J[m]]; lx[i] = t; }
    const out = new Float64Array(this.interp.length);
    for (let m = 0; m < out.length; m++) { const [i, r] = this.interp[m]; out[m] = lx[i] * (1 - r) + lx[i + 1] * r; }
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
    for (let k = 0; k < n; k++) {
      const il = new Float64Array(nX);
      for (const t of f.tracks) { const l = this.ligne(k, t.e1, t.e2); for (let m = 0; m < nX; m++) il[m] += t.share * l[m]; }
      out[k] = envOf(il);
    }
    this._env.set(key, out);
    return out;
  }
  /** Indice de la cible (grandeur g, section s, fibre f). */
  indice(g, s, f) { return GRANDEURS.indexOf(g) * this.nS * this.nF + s * this.nF + f; }
}
