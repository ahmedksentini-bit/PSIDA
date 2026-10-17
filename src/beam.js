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
    return { M0, ML, theta };
  }

  /**
   * Grille des positions de charge : abouts (consoles au-delà des appuis extrêmes, chargés aussi par le trafic —
   * pratique PSIDA.EL / PSIDP.EL), nGrid points par travée, extrémité finale.
   */
  _buildGrid() {
    const pos = [];
    const [aL, aR] = this.overhangs || [0, 0];
    const nOv = a => Math.max(2, Math.ceil(a / (Math.min(...this.spans) / this.nGrid)));
    if (aL > 1e-9) { const m = nOv(aL); for (let k = m; k >= 1; k--) pos.push({ j: -1, a: aL * k / m, x: -aL * k / m, over: 'L' }); }
    for (let j = 0; j < this.n; j++) {
      const L = this.spans[j];
      for (let i = 0; i < this.nGrid; i++) pos.push({ j, a: L * i / this.nGrid, x: this.x0[j] + L * i / this.nGrid });
    }
    pos.push({ j: this.n - 1, a: this.spans[this.n - 1], x: this.Ltot });
    if (aR > 1e-9) { const m = nOv(aR); for (let k = 1; k <= m; k++) pos.push({ j: this.n, a: aR * k / m, x: this.Ltot + aR * k / m, over: 'R' }); }
    this.positions = pos;
    this.xs = pos.map(p => p.x);
    this.xMin = this.xs[0]; this.xMax = this.xs[this.xs.length - 1];
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
    // ILT[i][p] : rotation du nœud i (horaire +) pour une charge unité, rigidités relatives EI (diviser par EI réel)
    const ILT = Array.from({ length: nSup }, () => new Float64Array(nP));

    // charge unité sur un about à la distance t de l'appui extrême : moment −t imposé au nœud extrême (réponse linéaire)
    // + charge directe sur l'appui extrême
    const unitNode = node => { const Mn = new Array(this.n + 1).fill(0); Mn[node] = -1; return this._responseToNodalMoments(Mn); };
    const uL = unitNode(0), uR = unitNode(this.n);
    for (let p = 0; p < nP; p++) {
      const { j, a, over } = this.positions[p];
      if (over) {
        const u = over === 'L' ? uL : uR, t = a;
        for (let i = 0; i < nSup; i++) ILT[i][p] = t * u.theta[i];
        for (let s = 0; s < nS; s++) {
          const { span, xi } = this.sections[s];
          const slope = t * (u.ML[span] - u.M0[span]) / this.spans[span];
          ILM[s][p] = t * u.M0[span] + slope * xi; ILVm[s][p] = slope; ILVp[s][p] = slope;
        }
        for (let i = 0; i < nSup; i++) {
          let R = 0;
          if (i < this.n) R += t * (u.ML[i] - u.M0[i]) / this.spans[i];
          if (i > 0) R -= t * (u.ML[i - 1] - u.M0[i - 1]) / this.spans[i - 1];
          if ((over === 'L' && i === 0) || (over === 'R' && i === this.n)) R += 1;
          ILR[i][p] = R;
        }
        continue;
      }
      const Lj = this.spans[j];
      const { M0, ML, theta } = this.endMomentsPoint(j, a, 1);
      for (let i = 0; i < nSup; i++) ILT[i][p] = theta[i];
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
    // sauts des lignes d'influence de l'effort tranchant au droit de la section : limites à gauche et à droite
    // (extrapolation linéaire des deux points voisins, erreur O(h²)), utilisées par integrateIL et ilAt — sinon la
    // grille étale le saut unité sur une maille et l'effort tranchant sous charge répartie perd g·h/2
    const xs = this.xs;
    this.sections.forEach((sec, s) => {
      const p = xs.findIndex(x => Math.abs(x - sec.x) < 1e-9);
      if (p < 0) return;
      for (const il of [ILVm[s], ILVp[s]]) {
        const left = p >= 2 ? 2 * il[p - 1] - il[p - 2] : il[p];
        const right = p + 2 < nP ? 2 * il[p + 1] - il[p + 2] : il[p];
        if (Math.abs(right - left) > 0.5) il.jump = { p, left, right };
      }
    });
    this.ILM = ILM; this.ILVm = ILVm; this.ILVp = ILVp; this.ILR = ILR; this.ILT = ILT;
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
    if (x < this.xMin || x > this.xMax) return 0;
    // recherche dichotomique
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    if (xs[hi] === xs[lo]) return il[lo];
    const J = il.jump;
    if (J && x === xs[J.p]) return il[J.p];
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    const vlo = J && lo === J.p ? J.right : il[lo], vhi = J && hi === J.p ? J.left : il[hi];
    return vlo + t * (vhi - vlo);
  }

  /**
   * Intégrale de la ligne d'influence sur [xa, xb], avec option de ne retenir que
   * la partie positive (sign=+1) ou négative (sign=-1) — zones défavorables.
   */
  integrateIL(il, xa = 0, xb = this.Ltot, sign = 0) {
    const xs = this.xs;
    let s = 0;
    const clip = v => (sign > 0 ? Math.max(v, 0) : sign < 0 ? Math.min(v, 0) : v);
    const J = il.jump;
    for (let p = 0; p < xs.length - 1; p++) {
      let x1 = xs[p], x2 = xs[p + 1];
      if (x2 <= xa || x1 >= xb) continue;
      const a1 = J && p === J.p ? J.right : il[p], a2 = J && p + 1 === J.p ? J.left : il[p + 1];
      let v1 = a1, v2 = a2;
      // restriction de l'intervalle à [xa, xb]
      if (x1 < xa) { v1 = a1 + (a2 - a1) * (xa - x1) / (x2 - x1); x1 = xa; }
      if (x2 > xb) { v2 = a1 + (a2 - a1) * (xb - xs[p]) / (xs[p + 1] - xs[p]); x2 = xb; }
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
    return { max: q * this.integrateIL(il, this.xMin, this.xMax, +1), min: q * this.integrateIL(il, this.xMin, this.xMax, -1) };
  }

  /** Travée qui porte l'abscisse x (abouts rattachés aux travées de rive). */
  spanOf(x) {
    if (x < this.x0[1]) return 0;
    if (x >= this.x0[this.n - 1]) return this.n - 1;
    let j = 0; while (j < this.n - 1 && x >= this.x0[j + 1]) j++;
    return j;
  }

  /** Intégrale de la ligne d'influence sur [xa, xb] ventilée par travée porteuse (abouts compris dans les rives). */
  integrateByspan(il, xa, xb, sign = 0) {
    const parts = new Array(this.n).fill(0);
    const bnd = [this.xMin, ...this.x0.slice(1, this.n), this.xMax];
    for (let j = 0; j < this.n; j++) {
      const a = Math.max(xa, bnd[j]), b = Math.min(xb, bnd[j + 1]);
      if (b > a) parts[j] = this.integrateIL(il, a, b, sign);
    }
    return parts;
  }

  /**
   * Enveloppe d'une charge répartie dont l'intensité dépend de la longueur chargée l (Fasc. 61 titre II,
   * système A(l)) : on charge les zones de même signe de la ligne d'influence — travées entières, parties de
   * travées délimitées par ses zéros et abouts —, l étant la somme des longueurs chargées (pratique PSIDA.EL /
   * PSIDP.EL : « longueurs chargées 13,93 et 2,83 m »). Énumération des sous-ensembles de zones de même signe.
   * @param {Float64Array} il ligne d'influence
   * @param {(l:number)=>number} qOfL intensité [kN/m] pour une longueur chargée l [m]
   * @returns {{max, min, spansMax:number[], spansMin:number[], zonesMax, zonesMin, partsMax:number[], partsMin:number[]}}
   */
  spanwiseEnvelope(il, qOfL) {
    const xs = this.xs, cuts = [];
    const J = il.jump;
    for (let p = 0; p < xs.length - 1; p++) {
      const v1 = J && p === J.p ? J.right : il[p], v2 = J && p + 1 === J.p ? J.left : il[p + 1];
      if (v1 * v2 < 0) cuts.push(xs[p] + (xs[p + 1] - xs[p]) * v1 / (v1 - v2));
    }
    if (J) cuts.push(xs[J.p]);
    const bounds = [...new Set([this.xMin, ...this.x0, this.xMax, ...cuts].map(v => Math.round(v * 1e9) / 1e9))].sort((a, b) => a - b);
    const zones = [];
    for (let k = 0; k < bounds.length - 1; k++) {
      const x1 = bounds[k], x2 = bounds[k + 1];
      if (x2 - x1 < 1e-6) continue;
      const area = this.integrateIL(il, x1, x2, 0);
      if (Math.abs(area) > 1e-12) zones.push({ x1, x2, len: x2 - x1, area, span: this.spanOf((x1 + x2) / 2) });
    }
    const best = sgn => {
      let set = zones.filter(z => sgn * z.area > 0);
      // garde-fou combinatoire : au-delà de 16 zones, on écarte les plus petites (effet négligeable)
      if (set.length > 16) set = set.sort((a, b) => Math.abs(b.area) - Math.abs(a.area)).slice(0, 16);
      const m = set.length; let v0 = 0, list0 = [], q0 = 0;
      for (let mask = 1; mask < (1 << m); mask++) {
        let l = 0, I = 0;
        for (let i = 0; i < m; i++) if (mask & (1 << i)) { l += set[i].len; I += set[i].area; }
        const q = qOfL(l), v = q * I;
        if (sgn * v > sgn * v0) { v0 = v; q0 = q; list0 = set.filter((_, i) => mask & (1 << i)); }
      }
      const parts = new Array(this.n).fill(0);
      for (const z of list0) parts[z.span] += q0 * z.area;
      return { v: v0, list: list0, parts };
    };
    const bM = best(1), bm = best(-1);
    const spansOf = list => [...new Set(list.map(z => z.span))].sort((a, b) => a - b);
    return { max: bM.v, min: bm.v, spansMax: spansOf(bM.list), spansMin: spansOf(bm.list),
      zonesMax: bM.list.map(({ x1, x2 }) => ({ x1, x2 })), zonesMin: bm.list.map(({ x1, x2 }) => ({ x1, x2 })), partsMax: bM.parts, partsMin: bm.parts };
  }

  /** Contribution par travée porteuse d'un groupe d'essieux placé en x (sens dir). */
  _axleParts(il, axles, x, dir) {
    const parts = new Array(this.n).fill(0);
    for (const ax of axles) { const xa = x + dir * ax.d; const v = this.ilAt(il, xa); if (v) parts[this.spanOf(xa)] += ax.P * v; }
    return parts;
  }

  /**
   * Enveloppe d'un convoi d'essieux glissant sur l'ouvrage, abouts compris (les deux sens de marche).
   * @param {Float64Array} il
   * @param {{d:number, P:number}[]} axles distances cumulées depuis le 1er essieu [m], charges [kN]
   * @param {{step?:number}} opt pas de glissement [m] (défaut 0.05)
   * @returns {{max, min, xmax, xmin, dirMax, dirMin, partsMax, partsMin}}
   */
  axleEnvelope(il, axles, { step = 0.05 } = {}) {
    const dmax = Math.max(...axles.map(a => a.d));
    let max = -Infinity, min = Infinity, xmax = 0, xmin = 0, dirMax = 1, dirMin = 1;
    for (const dir of [1, -1]) {
      for (let x = this.xMin - dmax; x <= this.xMax + dmax + 1e-9; x += step) {
        let v = 0;
        for (const ax of axles) v += ax.P * this.ilAt(il, x + dir * ax.d);
        if (v > max) { max = v; xmax = x; dirMax = dir; }
        if (v < min) { min = v; xmin = x; dirMin = dir; }
      }
    }
    return { max, min, xmax, xmin, dirMax, dirMin, partsMax: this._axleParts(il, axles, xmax, dirMax), partsMin: this._axleParts(il, axles, xmin, dirMin) };
  }

  /**
   * Programmation dynamique d'un convoi de nVeh véhicules identiques sur une grille de positions :
   * extremum de Σ f(x_k) avec x_{k+1} − x_k ≥ off (pas de grille), chaque véhicule pouvant sortir de l'ouvrage
   * (f = 0 aux extrémités de la grille). Renvoie les positions retenues (indices).
   */
  _trainDP(f, off, nVeh) {
    const n = f.length, out = {};
    for (const sgn of [1, -1]) {
      const levels = [];
      let b = Float64Array.from(f, v => sgn * v);
      for (let i = n - 2; i >= 0; i--) b[i] = Math.max(b[i], b[i + 1]);
      levels.push(b);
      for (let k = 2; k <= nVeh; k++) {
        const prev = levels[k - 2], nb = new Float64Array(n);
        for (let i = n - 1; i >= 0; i--) nb[i] = Math.max(sgn * f[i] + (i + off < n ? prev[i + off] : 0), i + 1 < n ? nb[i + 1] : -Infinity);
        levels.push(nb);
      }
      // reconstruction des positions
      const pos = []; let i = 0;
      for (let k = nVeh; k >= 1 && i < n; k--) {
        const lev = levels[k - 1], target = lev[i];
        let q = i;
        while (q < n) {
          const here = sgn * f[q] + (k > 1 ? (q + off < n ? levels[k - 2][q + off] : 0) : 0);
          if (Math.abs(here - target) < 1e-9 * (1 + Math.abs(target))) break;
          q++;
        }
        if (q >= n) break;
        pos.push(q); i = q + off;
      }
      out[sgn > 0 ? 'max' : 'min'] = { v: sgn * levels[nVeh - 1][0], pos };
    }
    return out;
  }

  /**
   * Enveloppe d'une file de nVeh véhicules identiques (même sens de marche) dont l'espacement est libre
   * au-delà d'un pas minimal entre essieux avant (Fasc. 61 art. 5.2 : « la distance des deux camions
   * d'une même file est déterminée pour produire l'effet le plus défavorable », camions Bc de 10,50 m
   * d'encombrement → pas ≥ 10,50 m). Chaque véhicule peut aussi sortir de l'ouvrage (contribution nulle).
   */
  trainEnvelope(il, axles, { nVeh = 2, pitch = 10.5, step = 0.05 } = {}) {
    const dmax = Math.max(...axles.map(a => a.d));
    const ext = dmax + pitch * nVeh, x0 = this.xMin - ext;
    const n = Math.ceil((this.xMax - this.xMin + 2 * ext) / step) + 1;
    const off = Math.round(pitch / step);
    let res = { max: -Infinity, min: Infinity, partsMax: null, partsMin: null };
    for (const dir of [1, -1]) {
      const f = new Float64Array(n);
      for (let i = 0; i < n; i++) { const x = x0 + i * step; let v = 0; for (const ax of axles) v += ax.P * this.ilAt(il, x + dir * ax.d); f[i] = v; }
      const dp = this._trainDP(f, off, nVeh);
      const partsOf = pos => pos.reduce((acc, i) => { const pp = this._axleParts(il, axles, x0 + i * step, dir); return acc.map((v, j) => v + pp[j]); }, new Array(this.n).fill(0));
      if (dp.max.v > res.max) { res.max = dp.max.v; res.partsMax = partsOf(dp.max.pos); }
      if (dp.min.v < res.min) { res.min = dp.min.v; res.partsMin = partsOf(dp.min.pos); }
    }
    return res;
  }

  /**
   * Enveloppe d'une charge répartie uniforme de longueur finie (chenille, D240…)
   * glissant sur l'ouvrage (abouts compris) : intensité q [kN/m] sur une longueur len.
   */
  stripEnvelope(il, q, len, { step = 0.05 } = {}) {
    let max = -Infinity, min = Infinity, xmax = 0, xmin = 0;
    for (let x = this.xMin - len; x <= this.xMax + 1e-9; x += step) {
      const v = q * this.integrateIL(il, Math.max(this.xMin, x), Math.min(this.xMax, x + len), 0);
      if (v > max) { max = v; xmax = x; }
      if (v < min) { min = v; xmin = x; }
    }
    const partsAt = x => this.integrateByspan(il, Math.max(this.xMin, x), Math.min(this.xMax, x + len)).map(v => q * v);
    return { max, min, xmax, xmin, partsMax: partsAt(xmax), partsMin: partsAt(xmin) };
  }

  /**
   * Convoi de charges réparties de longueur len à espacement libre, pas ≥ pitch entre débuts
   * (Mc120 : F61 titre II art. 9 — distance libre ≥ 30,50 m entre engins, nombre d'engins non limité :
   * pitch = 6,10 + 30,50 = 36,60 m). nVeh par défaut : autant que l'ouvrage peut en porter.
   */
  stripTrainEnvelope(il, q, len, { pitch = 36.6, nVeh = null, step = 0.05 } = {}) {
    const nv = nVeh || Math.max(1, Math.ceil((this.xMax - this.xMin + len) / pitch) + 1);
    const ext = len + pitch, x0 = this.xMin - ext;
    const n = Math.ceil((this.xMax - this.xMin + 2 * ext) / step) + 1;
    const off = Math.round(pitch / step);
    const f = new Float64Array(n);
    for (let i = 0; i < n; i++) { const x = x0 + i * step; const a = Math.max(this.xMin, x), b = Math.min(this.xMax, x + len); f[i] = b > a ? q * this.integrateIL(il, a, b, 0) : 0; }
    const dp = this._trainDP(f, off, nv);
    const partsOf = pos => pos.reduce((acc, i) => { const x = x0 + i * step; const a = Math.max(this.xMin, x), b = Math.min(this.xMax, x + len); const pp = b > a ? this.integrateByspan(il, a, b) : new Array(this.n).fill(0); return acc.map((v, j) => v + q * pp[j]); }, new Array(this.n).fill(0));
    return { max: dp.max.v, min: dp.min.v, partsMax: partsOf(dp.max.pos), partsMin: partsOf(dp.min.pos) };
  }

  /** Enveloppe d'une charge répartie q sur les zones défavorables, ventilée par travée porteuse. */
  udlEnvelopeParts(il, q) {
    return { partsMax: this.integrateByspan(il, this.xMin, this.xMax, +1).map(v => q * v), partsMin: this.integrateByspan(il, this.xMin, this.xMax, -1).map(v => q * v) };
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
    return { M0, ML, theta };
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
   * method = 'fleches' : portée de la travée isostatique ayant la même flèche à mi-travée que la travée
   * chargée seule (programme PSIDA.EL 1984 : 9,017 m pour la travée de rive de 9,75 m de la note commentée).
   */
  equivalentSpans(method = 'moments') {
    if (this.n === 1) return [this.spans[0]];
    const out = [];
    for (let j = 0; j < this.n; j++) {
      const L = this.spans[j];
      // charge p = 1 sur la seule travée j : moments d'extrémité par intégration des lignes d'influence,
      // puis M(x) = M0 + (ML − M0)·x/L + x(L − x)/2 exact dans la travée → racines du trinôme
      const M0 = this.integrateIL(this.ILM[this.sectionIndex(j, 0)], this.x0[j], this.x0[j + 1], 0);
      const ML = this.integrateIL(this.ILM[this.sectionIndex(j, 1)], this.x0[j], this.x0[j + 1], 0);
      if (method === 'fleches') {
        // flèche à mi-travée (EI = 1, p = 1) : isostatique + moments d'extrémité ; travée isostatique
        // de même flèche : 5 Leq⁴/384 = w(L/2) (méthode PSIDA.EL 1984, cf. docs/hypotheses.md)
        const w = 5 * L ** 4 / 384 + (M0 + ML) * L * L / 16;
        out.push(w > 0 ? (384 * w / 5) ** 0.25 : L);
        continue;
      }
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
