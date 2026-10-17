/**
 * Poutre continue sur appuis simples (modèle de « poutre équivalente » d'un pont-dalle).
 *
 * - EI constant par travée (rapports relatifs admis : seule la répartition hyperstatique en dépend).
 * - Méthode des rotations (slope-deflection) : inconnues = rotations des nœuds d'appui.
 * - Lignes d'influence de M, V (à gauche et à droite de la section) et des réactions R,
 *   calculées sur une grille de positions de charge unitaire.
 * - Enveloppes : charge répartie sur zones défavorables (EC LM1-UDL), charge répartie par
 *   travées entières avec intensité fonction de la longueur chargée (Fasc. 61 A(l)),
 *   convois d'essieux glissants (TS, Bc, Bt, Mc120, D240…).
 *
 * Conventions :
 *   - x croît de la culée C0 (x = 0) vers la culée Cn ; travée j entre appuis j et j+1.
 *   - Moment fléchissant positif = fibre inférieure tendue.
 *   - Effort tranchant positif = somme des forces à gauche vers le haut.
 *   - Charges positives vers le bas.
 *   - Moments d'extrémité de barre (interne) : sens horaire positif.
 */
import { solve } from './linalg.js';

export class ContinuousBeam {
  /**
   * @param {number[]} spans portées [m]
   * @param {{EI?:number[], nGrid?:number, nSec?:number}} opt
   *   EI    rigidités relatives par travée (défaut : 1 partout)
   *   nGrid nombre de positions de charge par travée pour les lignes d'influence (défaut 100)
   *   nSec  nombre d'intervalles de sections par travée (défaut 20 → sections tous les L/20)
   */
  constructor(spans, { EI = null, nGrid = 100, nSec = 20, overhangs = [0, 0] } = {}) {
    if (!spans.length) throw new Error('Au moins une travée');
    this.spans = spans.slice();
    this.n = spans.length;
    this.EI = EI ? EI.slice() : spans.map(() => 1);
    this.nGrid = nGrid;
    this.nSec = nSec;
    this.overhangs = overhangs; // abouts (consoles) au-delà des appuis extrêmes [m] : chargés par g seulement
    this.x0 = [0];
    for (let j = 0; j < this.n; j++) this.x0.push(this.x0[j] + spans[j]);
    this.Ltot = this.x0[this.n];
    this._buildStiffness();
    this._buildGrid();
    this._buildSections();
    this._buildInfluenceLines();
  }

  /** Matrice de rigidité en rotation (n+1 × n+1). */
  _buildStiffness() {
    const N = this.n + 1;
    const K = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let j = 0; j < this.n; j++) {
      const k = this.EI[j] / this.spans[j];
      K[j][j] += 4 * k; K[j][j + 1] += 2 * k;
      K[j + 1][j] += 2 * k; K[j + 1][j + 1] += 4 * k;
    }
    this.K = K;
  }

  /**
   * Moments d'extrémité (fléchissants, fibre inf. tendue +) de toutes les travées
   * sous une charge ponctuelle P en travée j à l'abscisse locale a.
   * @returns {{M0:number[], ML:number[]}} M0[j] à gauche de la travée j, ML[j] à droite
   */
  endMomentsPoint(j, a, P = 1) {
    const L = this.spans[j], b = L - a;
    const N = this.n + 1;
    const F = new Array(N).fill(0); // moments d'encastrement parfait (horaire +)
    const femL = -P * a * b * b / (L * L);
    const femR = P * a * a * b / (L * L);
    F[j] += femL; F[j + 1] += femR;
    const theta = solve(this.K, F.map(v => -v));
    const M0 = new Array(this.n), ML = new Array(this.n);
    for (let s = 0; s < this.n; s++) {
      const k = this.EI[s] / this.spans[s];
      const Ml = k * (4 * theta[s] + 2 * theta[s + 1]) + (s === j ? femL : 0);
      const Mr = k * (2 * theta[s] + 4 * theta[s + 1]) + (s === j ? femR : 0);
      M0[s] = Ml;      // moment horaire à gauche = fibre inférieure tendue
      ML[s] = -Mr;     // moment horaire à droite = fibre supérieure tendue
    }
    return { M0, ML };
  }

  /** Grille des positions de charge : nGrid points par travée + extrémité finale. */
  _buildGrid() {
    const pos = [];
    for (let j = 0; j < this.n; j++) {
      const L = this.spans[j];
      for (let i = 0; i < this.nGrid; i++) pos.push({ j, a: L * i / this.nGrid, x: this.x0[j] + L * i / this.nGrid });
    }
    pos.push({ j: this.n - 1, a: this.spans[this.n - 1], x: this.Ltot });
    this.positions = pos;
    this.xs = pos.map(p => p.x);
  }

  /** Sections de calcul : (nSec+1) par travée, abscisse locale xi. */
  _buildSections() {
    const secs = [];
    for (let j = 0; j < this.n; j++) {
      const L = this.spans[j];
      for (let s = 0; s <= this.nSec; s++) {
        secs.push({ span: j, xi: L * s / this.nSec, x: this.x0[j] + L * s / this.nSec, frac: s / this.nSec });
      }
    }
    this.sections = secs;
  }

  /**
   * Lignes d'influence sur la grille :
   *  ILM[s][p]  moment à la section s pour une charge unité à la position p
   *  ILVm/ILVp  effort tranchant juste à gauche / à droite de la section
   *  ILR[i][p]  réaction de l'appui i
   */
  _buildInfluenceLines() {
    const nS = this.sections.length, nP = this.positions.length, nSup = this.n + 1;
    const ILM = Array.from({ length: nS }, () => new Float64Array(nP));
    const ILVm = Array.from({ length: nS }, () => new Float64Array(nP));
    const ILVp = Array.from({ length: nS }, () => new Float64Array(nP));
    const ILR = Array.from({ length: nSup }, () => new Float64Array(nP));

    for (let p = 0; p < nP; p++) {
      const { j, a } = this.positions[p];
      const Lj = this.spans[j];
      const { M0, ML } = this.endMomentsPoint(j, a, 1);
      const atSupportLeft = a === 0;                 // charge exactement sur l'appui j
      const atSupportRight = a === Lj;               // charge exactement sur l'appui j+1 (dernier point)

      for (let s = 0; s < nS; s++) {
        const { span, xi } = this.sections[s];
        const L = this.spans[span];
        const slope = (ML[span] - M0[span]) / L;
        let M = M0[span] + slope * xi;
        let Vm = slope, Vp = slope;
        if (span === j && !atSupportLeft && !atSupportRight) {
          const b = Lj - a;
          M += xi < a ? b * xi / L : a * (L - xi) / L;
          Vm += xi <= a ? b / L : -a / L;
          Vp += xi < a ? b / L : -a / L;
        }
        ILM[s][p] = M; ILVm[s][p] = Vm; ILVp[s][p] = Vp;
      }
      // réactions : saut d'effort tranchant à l'appui (+ charge posée sur l'appui)
      for (let i = 0; i < nSup; i++) {
        let R = 0;
        if (i < this.n) { // tranchant à droite de l'appui i = début de la travée i
          const L = this.spans[i];
          let V = (ML[i] - M0[i]) / L;
          if (i === j && !atSupportLeft && !atSupportRight) V += (Lj - a) / L;
          R += V;
        }
        if (i > 0) { // tranchant à gauche de l'appui i = fin de la travée i-1
          const L = this.spans[i - 1];
          let V = (ML[i - 1] - M0[i - 1]) / L;
          if (i - 1 === j && !atSupportLeft && !atSupportRight) V += -a / L;
          R -= V;
        }
        if ((atSupportLeft && i === j) || (atSupportRight && i === j + 1)) R += 1;
        ILR[i][p] = R;
      }
    }
    this.ILM = ILM; this.ILVm = ILVm; this.ILVp = ILVp; this.ILR = ILR;
  }

  /** Index de la section la plus proche de (travée j, fraction f de la portée). */
  sectionIndex(j, frac) {
    let best = -1, d = Infinity;
    this.sections.forEach((s, i) => { if (s.span === j) { const dd = Math.abs(s.frac - frac); if (dd < d) { d = dd; best = i; } } });
    return best;
  }

  /** Index de la section « sur appui i » (côté droit de la travée i-1, ou gauche de la travée i). */
  supportSectionIndex(i) {
    return i === 0 ? this.sectionIndex(0, 0) : this.sectionIndex(i - 1, 1);
  }

  // ---------------------------------------------------------------------------
  // Outils sur lignes d'influence
  // ---------------------------------------------------------------------------

  /** Valeur interpolée d'une ligne d'influence en x (0 hors de l'ouvrage). */
  ilAt(il, x) {
    const xs = this.xs;
    if (x < 0 || x > this.Ltot) return 0;
    // recherche dichotomique
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    if (xs[hi] === xs[lo]) return il[lo];
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return il[lo] + t * (il[hi] - il[lo]);
  }

  /**
   * Intégrale de la ligne d'influence sur [xa, xb], avec option de ne retenir que
   * la partie positive (sign=+1) ou négative (sign=-1) — zones défavorables.
   */
  integrateIL(il, xa = 0, xb = this.Ltot, sign = 0) {
    const xs = this.xs;
    let s = 0;
    const clip = v => (sign > 0 ? Math.max(v, 0) : sign < 0 ? Math.min(v, 0) : v);
    for (let p = 0; p < xs.length - 1; p++) {
      let x1 = xs[p], x2 = xs[p + 1];
      if (x2 <= xa || x1 >= xb) continue;
      let v1 = il[p], v2 = il[p + 1];
      // restriction de l'intervalle à [xa, xb]
      if (x1 < xa) { v1 = v1 + (v2 - v1) * (xa - x1) / (x2 - x1); x1 = xa; }
      if (x2 > xb) { v2 = il[p] + (il[p + 1] - il[p]) * (xb - xs[p]) / (xs[p + 1] - xs[p]); x2 = xb; }
      const h = x2 - x1;
      if (h <= 0) continue;
      if (sign === 0 || (v1 >= 0 && v2 >= 0 && sign > 0) || (v1 <= 0 && v2 <= 0 && sign < 0)) {
        s += 0.5 * (v1 + v2) * h;
      } else if ((v1 <= 0 && v2 <= 0 && sign > 0) || (v1 >= 0 && v2 >= 0 && sign < 0)) {
        // rien
      } else {
        // changement de signe dans l'intervalle : triangle utile
        const xc = x1 + h * v1 / (v1 - v2);
        const vKeep = clip(v1) !== 0 ? v1 : v2;
        const hKeep = clip(v1) !== 0 ? xc - x1 : x2 - xc;
        s += 0.5 * vKeep * hKeep;
      }
    }
    return s;
  }

  /**
   * Enveloppe d'une charge répartie q (kN/m) appliquée sur les zones défavorables
   * (EN 1991-2 §4.3.2 : UDL sur les parties défavorables de la ligne d'influence).
   * @returns {{max:number, min:number}}
   */
  udlEnvelope(il, q) {
    return { max: q * this.integrateIL(il, 0, this.Ltot, +1), min: q * this.integrateIL(il, 0, this.Ltot, -1) };
  }

  /**
   * Enveloppe d'une charge répartie par travées entières dont l'intensité dépend
   * de la longueur chargée l (Fasc. 61 titre II, système A(l)).
   * @param {Float64Array} il ligne d'influence
   * @param {(l:number)=>number} qOfL intensité [kN/m] pour une longueur chargée l [m]
   * @returns {{max:number, min:number, spansMax:number[], spansMin:number[]}}
   */
  spanwiseEnvelope(il, qOfL) {
    const n = this.n;
    const perSpan = [];
    for (let j = 0; j < n; j++) perSpan.push(this.integrateIL(il, this.x0[j], this.x0[j + 1], 0));
    let max = 0, min = 0, spansMax = [], spansMin = [];
    for (let mask = 1; mask < (1 << n); mask++) {
      let l = 0, I = 0; const list = [];
      for (let j = 0; j < n; j++) if (mask & (1 << j)) { l += this.spans[j]; I += perSpan[j]; list.push(j); }
      const v = qOfL(l) * I;
      if (v > max) { max = v; spansMax = list; }
      if (v < min) { min = v; spansMin = list; }
    }
    return { max, min, spansMax, spansMin };
  }

  /**
   * Enveloppe d'un convoi d'essieux glissant sur l'ouvrage (les deux sens de marche).
   * @param {Float64Array} il
   * @param {{d:number, P:number}[]} axles distances cumulées depuis le 1er essieu [m], charges [kN]
   * @param {{step?:number}} opt pas de glissement [m] (défaut 0.05)
   * @returns {{max:number, min:number, xmax:number, xmin:number, dirMax:number, dirMin:number}}
   */
  axleEnvelope(il, axles, { step = 0.05 } = {}) {
    const dmax = Math.max(...axles.map(a => a.d));
    let max = -Infinity, min = Infinity, xmax = 0, xmin = 0, dirMax = 1, dirMin = 1;
    for (const dir of [1, -1]) {
      for (let x = -dmax; x <= this.Ltot + dmax + 1e-9; x += step) {
        let v = 0;
        for (const ax of axles) v += ax.P * this.ilAt(il, x + dir * ax.d);
        if (v > max) { max = v; xmax = x; dirMax = dir; }
        if (v < min) { min = v; xmin = x; dirMin = dir; }
      }
    }
    return { max, min, xmax, xmin, dirMax, dirMin };
  }

  /**
   * Enveloppe d'une charge répartie uniforme de longueur finie (chenille, D240…)
   * glissant sur l'ouvrage : intensité q [kN/m] sur une longueur len.
   */
  stripEnvelope(il, q, len, { step = 0.05 } = {}) {
    let max = -Infinity, min = Infinity, xmax = 0, xmin = 0;
    for (let x = -len; x <= this.Ltot + 1e-9; x += step) {
      const v = q * this.integrateIL(il, Math.max(0, x), Math.min(this.Ltot, x + len), 0);
      if (v > max) { max = v; xmax = x; }
      if (v < min) { min = v; xmin = x; }
    }
    return { max, min, xmax, xmin };
  }

  // ---------------------------------------------------------------------------
  // Sollicitations sous charges permanentes (charge uniforme g sur toute la longueur)
  // ---------------------------------------------------------------------------

  /**
   * Réponse (moments d'extrémité fléchissants M0/ML par travée) à des moments imposés aux nœuds :
   * Mnode[i] = moment fléchissant (fibre inf. tendue +) que la poutre doit présenter au nœud i
   * (utilisé pour les consoles d'about : M = −g·a²/2 aux appuis extrêmes).
   */
  _responseToNodalMoments(Mnode) {
    const N = this.n + 1;
    // équations : M_left(0) = Mnode[0] ; équilibre interne ; −M_right(n−1) = Mnode[n]
    const rhs = new Array(N).fill(0);
    rhs[0] = Mnode[0] || 0;
    rhs[N - 1] = -(Mnode[N - 1] || 0);
    const theta = solve(this.K, rhs);
    const M0 = new Array(this.n), ML = new Array(this.n);
    for (let s = 0; s < this.n; s++) {
      const k = this.EI[s] / this.spans[s];
      M0[s] = k * (4 * theta[s] + 2 * theta[s + 1]);
      ML[s] = -(k * (2 * theta[s] + 4 * theta[s + 1]));
    }
    return { M0, ML };
  }

  /**
   * Réponse à des termes d'encastrement parfait FEM (horaires +) et à des rotations de corde ψ_j
   * (horaires +, ψ = (v_{j+1} − v_j)/L, v positif vers le bas) : moments d'extrémité fléchissants M0/ML
   * et diagramme linéaire (aucune charge en travée).
   * @param {number[]} femL FEM à gauche de chaque travée, femR à droite, psi rotations de corde
   */
  _responseFemPsi(femL, femR, psi, EI = this.EI) {
    const N = this.n + 1;
    const F = new Array(N).fill(0);
    for (let j = 0; j < this.n; j++) {
      const k = EI[j] / this.spans[j];
      F[j] += (femL[j] || 0) - 6 * k * (psi[j] || 0);
      F[j + 1] += (femR[j] || 0) - 6 * k * (psi[j] || 0);
    }
    // matrice de rigidité avec EI réels
    const K = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let j = 0; j < this.n; j++) {
      const k = EI[j] / this.spans[j];
      K[j][j] += 4 * k; K[j][j + 1] += 2 * k; K[j + 1][j] += 2 * k; K[j + 1][j + 1] += 4 * k;
    }
    const theta = solve(K, F.map(v => -v));
    const M0 = new Array(this.n), ML = new Array(this.n);
    for (let s = 0; s < this.n; s++) {
      const k = EI[s] / this.spans[s];
      M0[s] = k * (4 * theta[s] + 2 * theta[s + 1]) - 6 * k * (psi[s] || 0) + (femL[s] || 0);
      ML[s] = -(k * (2 * theta[s] + 4 * theta[s + 1]) - 6 * k * (psi[s] || 0) + (femR[s] || 0));
    }
    return this._linearDiagram(M0, ML);
  }

  /** Diagramme M linéaire par travée à partir des moments d'extrémité, avec V et R associés. */
  _linearDiagram(M0, ML) {
    const M = [], Vm = [], Vp = [];
    this.sections.forEach(sec => {
      const L = this.spans[sec.span], slope = (ML[sec.span] - M0[sec.span]) / L;
      M.push(M0[sec.span] + slope * sec.xi); Vm.push(slope); Vp.push(slope);
    });
    const R = new Array(this.n + 1).fill(0);
    for (let i = 0; i <= this.n; i++) {
      if (i < this.n) R[i] += (ML[i] - M0[i]) / this.spans[i];
      if (i > 0) R[i] -= (ML[i - 1] - M0[i - 1]) / this.spans[i - 1];
    }
    return { M, Vm, Vp, R, M0, ML };
  }

  /**
   * Courbure imposée uniforme κ [1/m] dans toutes les travées (gradient thermique) : κ > 0 pour une fibre
   * supérieure plus chaude (la poutre libre se bombe vers le haut) → moments hyperstatiques positifs sur
   * appuis intermédiaires. EI en kN·m² par travée.
   */
  thermalCurvature(kappa, EI) {
    const femL = this.spans.map((_, j) => EI[j] * kappa), femR = this.spans.map((_, j) => -EI[j] * kappa);
    return this._responseFemPsi(femL, femR, this.spans.map(() => 0), EI);
  }

  /**
   * Tassement imposé δ [m] (positif vers le bas) des appuis : v[i] par appui (0 ailleurs). EI en kN·m².
   */
  settlement(v, EI) {
    const psi = this.spans.map((L, j) => ((v[j + 1] || 0) - (v[j] || 0)) / L);
    return this._responseFemPsi(this.spans.map(() => 0), this.spans.map(() => 0), psi, EI);
  }

  /** Moments, tranchants et réactions sous une charge uniforme g [kN/m] sur tout l'ouvrage (abouts compris). */
  uniformLoad(g) {
    const M = this.sections.map((_, s) => g * this.integrateIL(this.ILM[s]));
    const Vm = this.sections.map((_, s) => g * this.integrateIL(this.ILVm[s]));
    const Vp = this.sections.map((_, s) => g * this.integrateIL(this.ILVp[s]));
    const R = this.ILR.map(il => g * this.integrateIL(il));
    const [aL, aR] = this.overhangs;
    if (aL > 0 || aR > 0) {
      const Mnode = new Array(this.n + 1).fill(0);
      Mnode[0] = -g * aL * aL / 2; Mnode[this.n] = -g * aR * aR / 2;
      const { M0, ML } = this._responseToNodalMoments(Mnode);
      this.sections.forEach((sec, s) => {
        const L = this.spans[sec.span], slope = (ML[sec.span] - M0[sec.span]) / L;
        M[s] += M0[sec.span] + slope * sec.xi; Vm[s] += slope; Vp[s] += slope;
      });
      for (let i = 0; i <= this.n; i++) {
        if (i < this.n) R[i] += (ML[i] - M0[i]) / this.spans[i];
        if (i > 0) R[i] -= (ML[i - 1] - M0[i - 1]) / this.spans[i - 1];
      }
      R[0] += g * aL; R[this.n] += g * aR;
    }
    return { M, Vm, Vp, R };
  }

  /**
   * Portée équivalente de chaque travée au sens de Guyon-Massonnet (« méthode des moments »
   * de CHAMOA / PSIDA) : distance entre les points de moment nul de la travée lorsqu'elle est
   * seule chargée par une charge uniforme ; travée isostatique → portée réelle.
   * Vérifié sur l'exemple CHAMOA-PSIDA (10-15-15-10 m : 8,9118 / 11,1862 m).
   */
  equivalentSpans() {
    if (this.n === 1) return [this.spans[0]];
    const out = [];
    for (let j = 0; j < this.n; j++) {
      const L = this.spans[j];
      // charge p = 1 sur la seule travée j : moments d'extrémité par intégration des lignes d'influence,
      // puis M(x) = M0 + (ML − M0)·x/L + x(L − x)/2 exact dans la travée → racines du trinôme
      const M0 = this.integrateIL(this.ILM[this.sectionIndex(j, 0)], this.x0[j], this.x0[j + 1], 0);
      const ML = this.integrateIL(this.ILM[this.sectionIndex(j, 1)], this.x0[j], this.x0[j + 1], 0);
      const a = -0.5, bq = L / 2 + (ML - M0) / L, c = M0;
      const disc = bq * bq - 4 * a * c;
      if (disc <= 0) { out.push(L); continue; }
      const r1 = (-bq + Math.sqrt(disc)) / (2 * a), r2 = (-bq - Math.sqrt(disc)) / (2 * a);
      const x1 = Math.max(0, Math.min(r1, r2)), x2 = Math.min(L, Math.max(r1, r2));
      out.push(x2 - x1);
    }
    return out;
  }

}
