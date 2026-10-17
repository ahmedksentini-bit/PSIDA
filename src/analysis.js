/**
 * Orchestration du calcul d'un pont-dalle : géométrie, charges permanentes, modèles de trafic
 * (Eurocodes ou Fascicule 61), enveloppes longitudinales (poutre équivalente) et répartition
 * transversale (Guyon-Massonnet) → moments longitudinaux par mètre m_x(y), tranchants, réactions.
 *
 * Hypothèses (à confronter aux notes CHAMOA / PSIDA) :
 *  H1  Dalle isotrope de largeur totale 2b (encorbellements compris), inertie équivalente constante.
 *  H2  Flexion longitudinale sur poutre continue à EI constant, appuis simples (piles-colonnes ou voiles).
 *  H3  Répartition transversale au premier harmonique, θ = b / L_eq, L_eq = distance entre points de
 *      moment nul sous charge uniforme (travée de rive et travée intermédiaire) ; sur appui, moyenne
 *      des L_eq des deux travées adjacentes.
 *  H4  Chaque file de charge (voie, roue, bande) est traitée indépendamment : m_x(y) = Σ K̄_i(y)·M_i/(2b),
 *      les positions longitudinales de chaque file étant choisies indépendamment (borne supérieure
 *      légèrement conservative pour Bc où les files sont alignées).
 *  H5  Poids propre : K = 1 (charge uniforme sur toute la largeur) ; superstructures : charges-lignes
 *      excentrées avec K(e,y) ; revêtement : bande uniforme sur la chaussée avec K̄.
 *  H6  Ouvrage droit (biais ≥ 70 gr : à corriger par les coefficients du guide SETRA 1989).
 */
import { ContinuousBeam } from './beam.js';
import { coefKFunction, coefKBand } from './guyon.js';
import { EC_ALPHA, notionalLanes, lm1, lm2, TS_GEOM, FOOTWAY } from './loads_ec.js';
import { classePont, voiesF61, chargeA, BC, BT, MC120, D240, TROTTOIR, deltaDyn } from './loads_f61.js';

export class SlabDeck {
  /**
   * @param {object} g
   * @param {number[]} g.spans portées [m]
   * @param {number} g.width largeur totale de la dalle 2b [m]
   * @param {number} g.h épaisseur de la dalle [m]
   * @param {{y1:number, y2:number}} g.roadway bornes de la chaussée (largeur roulable) dans le repère y ∈ [−b, b]
   * @param {number} [g.gammaC=25] poids volumique du béton [kN/m³]
   * @param {{g:number, e:number, label?:string}[]} [g.lines] charges permanentes linéaires (corniches, BN4, trottoirs…) [kN/m] en e
   * @param {{q:number, y1:number, y2:number, label?:string}[]} [g.bands] charges permanentes surfaciques (revêtement, remblai) [kN/m²]
   * @param {{y1:number, y2:number}[]} [g.footways] trottoirs (pour q_fk)
   * @param {number} [g.nGrid=100] positions de charge par travée
   * @param {number} [g.nSec=20] intervalles de sections par travée
   * @param {number[]} [g.ys] ordonnées de calcul transversal (défaut : 9 points de −b à b)
   * @param {number[]} [g.Leq] portées équivalentes imposées (sinon calculées)
   */
  constructor(g) {
    this.g = g;
    this.spans = g.spans;
    this.b = g.width / 2;
    this.h = g.h;
    this.beam = new ContinuousBeam(g.spans, { nGrid: g.nGrid || 100, nSec: g.nSec || 20 });
    this.Leq = g.Leq || this.beam.equivalentSpans();
    this.ys = g.ys || Array.from({ length: 9 }, (_, i) => -this.b + 2 * this.b * i / 8);
    this.gammaC = g.gammaC || 25;
    this._Kcache = new Map();
  }

  /** Portée équivalente associée à une section (H3). */
  LeqAt(secIdx) {
    const s = this.beam.sections[secIdx];
    if (s.frac === 0 && s.span > 0) return 0.5 * (this.Leq[s.span - 1] + this.Leq[s.span]);
    if (s.frac === 1 && s.span < this.spans.length - 1) return 0.5 * (this.Leq[s.span] + this.Leq[s.span + 1]);
    return this.Leq[s.span];
  }

  /** K̄(y) pour une bande [e1,e2] (ou ligne si e1=e2) et une portée équivalente L (mis en cache). */
  Kbar(L, e1, e2) {
    const key = `${L.toFixed(4)}|${e1.toFixed(3)}|${e2.toFixed(3)}`;
    if (this._Kcache.has(key)) return this._Kcache.get(key);
    let vals;
    if (Math.abs(e2 - e1) < 1e-9) { const f = coefKFunction({ b: this.b, L, e: e1 }); vals = this.ys.map(y => f(y)); }
    else vals = this.ys.map(y => coefKBand({ b: this.b, L, e1, e2, y }));
    this._Kcache.set(key, vals);
    return vals;
  }

  /** Sections « clés » : mi-travée (plus proche du max), et appuis intermédiaires. */
  keySections() {
    const out = [];
    const n = this.spans.length;
    for (let j = 0; j < n; j++) {
      const frac = n === 1 ? 0.5 : j === 0 ? 0.4 : j === n - 1 ? 0.6 : 0.5;
      out.push({ label: `Travée ${j + 1} (${frac}L)`, idx: this.beam.sectionIndex(j, frac) });
      if (j < n - 1) out.push({ label: `Appui P${j + 1}`, idx: this.beam.supportSectionIndex(j + 1) });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Charges permanentes
  // ---------------------------------------------------------------------------

  /** Charges permanentes : liste de « files » {label, kind:'uniform', q [kN/m], e1, e2, K:1|calc}. */
  permanentFiles() {
    const files = [];
    const gDalle = this.gammaC * this.h * 2 * this.b;
    files.push({ label: 'Poids propre dalle', q: gDalle, e1: -this.b, e2: this.b, unitK: true });
    for (const l of this.g.lines || []) files.push({ label: l.label || 'Charge linéaire', q: l.g, e1: l.e, e2: l.e, unitK: false });
    for (const bd of this.g.bands || []) files.push({ label: bd.label || 'Charge surfacique', q: bd.q * (bd.y2 - bd.y1), e1: bd.y1, e2: bd.y2, unitK: false });
    return files;
  }

  /**
   * Sollicitations permanentes : M_total, V, R par section (poutre), et m_x(y) par K̄ (H5).
   */
  permanent() {
    const files = this.permanentFiles();
    const nS = this.beam.sections.length;
    const M = new Array(nS).fill(0), Vm = new Array(nS).fill(0), Vp = new Array(nS).fill(0);
    const R = new Array(this.spans.length + 1).fill(0);
    const mx = Array.from({ length: nS }, () => this.ys.map(() => 0));
    const gTotal = files.reduce((a, f) => a + f.q, 0);
    for (const f of files) {
      const r = this.beam.uniformLoad(f.q);
      for (let s = 0; s < nS; s++) {
        M[s] += r.M[s]; Vm[s] += r.Vm[s]; Vp[s] += r.Vp[s];
        const K = f.unitK ? null : this.Kbar(this.LeqAt(s), f.e1, f.e2);
        this.ys.forEach((_, iy) => { mx[s][iy] += (K ? K[iy] : 1) * r.M[s] / (2 * this.b); });
      }
      r.R.forEach((v, i) => R[i] += v);
    }
    return { files, gTotal, M, Vm, Vp, R, mx };
  }

  // ---------------------------------------------------------------------------
  // Évaluation générique d'un cas de charge (liste de files indépendantes)
  // ---------------------------------------------------------------------------

  /**
   * Une file = { label, kind:'udl'|'axles'|'strip'|'spanwise', q|axles|len|qOfL,
   *              tracks:[{e1,e2,share}] } : la charge est répartie transversalement entre les
   * « tracks » (roues, bandes) avec la part « share » (somme = 1).
   * Résultat : enveloppes M (poutre), V, R et m_x(y) max/min par section.
   */
  evaluateCase(files) {
    const bm = this.beam;
    const nS = bm.sections.length, nSup = this.spans.length + 1;
    const Mmax = new Array(nS).fill(0), Mmin = new Array(nS).fill(0);
    const Vmax = new Array(nS).fill(0), Vmin = new Array(nS).fill(0);
    const Rmax = new Array(nSup).fill(0), Rmin = new Array(nSup).fill(0);
    const mxMax = Array.from({ length: nS }, () => this.ys.map(() => 0));
    const mxMin = Array.from({ length: nS }, () => this.ys.map(() => 0));
    const envOf = (il, f) => {
      if (f.kind === 'udl') return bm.udlEnvelope(il, f.q);
      if (f.kind === 'axles') return bm.axleEnvelope(il, f.axles);
      if (f.kind === 'strip') return bm.stripEnvelope(il, f.q, f.len);
      if (f.kind === 'spanwise') return bm.spanwiseEnvelope(il, f.qOfL);
      throw new Error('kind inconnu ' + f.kind);
    };
    for (const f of files) {
      for (let s = 0; s < nS; s++) {
        const em = envOf(bm.ILM[s], f);
        Mmax[s] += em.max; Mmin[s] += em.min;
        const ev1 = envOf(bm.ILVm[s], f), ev2 = envOf(bm.ILVp[s], f);
        Vmax[s] += Math.max(ev1.max, ev2.max); Vmin[s] += Math.min(ev1.min, ev2.min);
        const L = this.LeqAt(s);
        for (const t of f.tracks) {
          const K = this.Kbar(L, t.e1, t.e2);
          this.ys.forEach((_, iy) => {
            const a = K[iy] * em.max * t.share / (2 * this.b), c = K[iy] * em.min * t.share / (2 * this.b);
            mxMax[s][iy] += Math.max(a, c, 0); mxMin[s][iy] += Math.min(a, c, 0);
          });
        }
      }
      for (let i = 0; i < nSup; i++) { const e = envOf(bm.ILR[i], f); Rmax[i] += e.max; Rmin[i] += e.min; }
    }
    return { Mmax, Mmin, Vmax, Vmin, Rmax, Rmin, mxMax, mxMin };
  }

  /** Fusion de cas alternatifs (enveloppe de plusieurs arrangements). */
  static envelopeOf(results) {
    const out = JSON.parse(JSON.stringify(results[0]));
    for (const r of results.slice(1)) {
      for (const k of ['Mmax', 'Vmax', 'Rmax']) out[k] = out[k].map((v, i) => Math.max(v, r[k][i]));
      for (const k of ['Mmin', 'Vmin', 'Rmin']) out[k] = out[k].map((v, i) => Math.min(v, r[k][i]));
      out.mxMax = out.mxMax.map((row, s) => row.map((v, i) => Math.max(v, r.mxMax[s][i])));
      out.mxMin = out.mxMin.map((row, s) => row.map((v, i) => Math.min(v, r.mxMin[s][i])));
    }
    return out;
  }

  /** Deux arrangements de voies de largeur wl dans la chaussée : depuis le bord y1 et depuis le bord y2. */
  laneArrangements(nLanes, wl) {
    const { y1, y2 } = this.g.roadway;
    const fromLeft = [], fromRight = [];
    for (let i = 0; i < nLanes; i++) {
      fromLeft.push({ e1: y1 + i * wl, e2: y1 + (i + 1) * wl });
      fromRight.push({ e1: y2 - (i + 1) * wl, e2: y2 - i * wl });
    }
    const restL = { e1: y1 + nLanes * wl, e2: y2 }, restR = { e1: y1, e2: y2 - nLanes * wl };
    return [{ lanes: fromLeft, rest: restL }, { lanes: fromRight, rest: restR }];
  }

  // ---------------------------------------------------------------------------
  // Eurocode : LM1 (gr1a), LM2 (gr1b), trottoirs (gr3)
  // ---------------------------------------------------------------------------

  /**
   * @param {{alpha?:object}} opt alpha = EC_ALPHA.recommended | FR1 | FR2
   * @returns {{lanes:object, lm1:object, gr1a:object, TS:object, UDL:object, footway:object, gr1b:object, gr3:object}}
   */
  eurocode({ alpha = EC_ALPHA.recommended } = {}) {
    const { y1, y2 } = this.g.roadway;
    const w = y2 - y1;
    const nl = notionalLanes(w);
    const m1 = lm1(nl.n, alpha);
    const arrangements = this.laneArrangements(nl.n, nl.wl);
    const resTS = [], resUDL = [];
    for (const arr of arrangements) {
      const filesTS = [], filesUDL = [];
      m1.lanes.forEach((ln, i) => {
        const lane = arr.lanes[i], e = 0.5 * (lane.e1 + lane.e2);
        if (ln.Q > 0) filesTS.push({
          label: `TS voie ${ln.i}`, kind: 'axles',
          axles: [{ d: 0, P: ln.Q }, { d: TS_GEOM.axleSpacing, P: ln.Q }],
          tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }],
        });
        if (ln.q > 0) filesUDL.push({ label: `UDL voie ${ln.i}`, kind: 'udl', q: ln.q * nl.wl, tracks: [{ e1: lane.e1, e2: lane.e2, share: 1 }] });
      });
      if (arr.rest.e2 - arr.rest.e1 > 1e-6 && m1.qr > 0) {
        filesUDL.push({ label: 'UDL aire résiduelle', kind: 'udl', q: m1.qr * (arr.rest.e2 - arr.rest.e1), tracks: [{ e1: arr.rest.e1, e2: arr.rest.e2, share: 1 }] });
      }
      resTS.push(this.evaluateCase(filesTS));
      resUDL.push(this.evaluateCase(filesUDL));
    }
    const TS = SlabDeck.envelopeOf(resTS), UDL = SlabDeck.envelopeOf(resUDL);
    // trottoirs : q_fk = 3 kN/m² (combinaison avec LM1) / 5 kN/m² (gr3)
    const fw = (q) => (this.g.footways || []).map(f => ({ label: 'Trottoir', kind: 'udl', q: q * (f.y2 - f.y1), tracks: [{ e1: f.y1, e2: f.y2, share: 1 }] }));
    const footway3 = this.evaluateCase(fw(FOOTWAY.qfkCombi));
    const gr3 = this.evaluateCase(fw(FOOTWAY.qfk));
    const gr1a = SlabDeck.sum([TS, UDL, footway3]);
    // LM2 : essieu isolé, positionné n'importe où sur la chaussée (roues à 1 m de l'axe, au plus près du bord)
    const l2 = lm2(alpha);
    const posLM2 = [y1 + 1 + l2.contact.y / 2, y2 - 1 - l2.contact.y / 2, 0.5 * (y1 + y2)];
    const gr1b = SlabDeck.envelopeOf(posLM2.map(e => this.evaluateCase([{
      label: 'LM2', kind: 'axles', axles: [{ d: 0, P: l2.Q }],
      tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }],
    }])));
    return { lanes: nl, lm1: m1, alpha, TS, UDL, footway: footway3, gr1a, gr1b, gr3 };
  }

  /** Somme de plusieurs résultats de cas (cumul de charges simultanées). */
  static sum(results) {
    const out = JSON.parse(JSON.stringify(results[0]));
    for (const r of results.slice(1)) {
      for (const k of ['Mmax', 'Mmin', 'Vmax', 'Vmin', 'Rmax', 'Rmin']) out[k] = out[k].map((v, i) => v + r[k][i]);
      out.mxMax = out.mxMax.map((row, s) => row.map((v, i) => v + r.mxMax[s][i]));
      out.mxMin = out.mxMin.map((row, s) => row.map((v, i) => v + r.mxMin[s][i]));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Fascicule 61 titre II : A(l), Bc, Bt, Mc120, D240, trottoirs
  // ---------------------------------------------------------------------------

  /**
   * @param {{classe?:number, nRetenue?:number, Gspan?:number[]}} opt
   *   classe   classe du pont (sinon déduite de la largeur roulable)
   *   nRetenue nombre de dispositifs de retenue bordant la chaussée (0,5 m chacun retiré pour Lc)
   *   Gspan    poids permanent par travée [kN] pour δ (sinon calculé avec les charges permanentes)
   */
  fascicule61({ classe = null, nRetenue = 0, Gspan = null } = {}) {
    const { y1, y2 } = this.g.roadway;
    const Lr = y2 - y1, Lc = Lr - 0.5 * nRetenue;
    const cl = classe || classePont(Lr);
    const { nv, v } = voiesF61(Lc);
    const yc1 = y1 + (Lr - Lc) / 2, yc2 = y2 - (Lr - Lc) / 2;
    const gT = this.permanent().gTotal;
    const G = Gspan || this.spans.map(L => gT * L);

    // --- A(l) : nombre de voies chargées de 1 à nv, voies les plus excentrées d'abord (deux côtés)
    const resA = [];
    for (let nvc = 1; nvc <= nv; nvc++) {
      for (const arr of this.laneArrangements(nvc, v)) {
        const files = arr.lanes.map((ln, i) => ({
          label: `A(l) voie ${i + 1}`, kind: 'spanwise',
          qOfL: l => chargeA(l, { classe: cl, nVoiesChargees: nvc, v }).q * v,
          tracks: [{ e1: ln.e1, e2: ln.e2, share: 1 }],
        }));
        resA.push(this.evaluateCase(files));
      }
    }
    const A = SlabDeck.envelopeOf(resA);

    // --- Bc : 1 à nv files de 2 camions, largeur 2,50 m, accolées depuis chaque bord de la chaussée
    const resBc = [];
    for (let nf = 1; nf <= Math.min(nv, 5); nf++) {
      const bc = BC.bc[cl][nf - 1];
      for (const side of [1, -1]) {
        const files = [];
        for (let i = 0; i < nf; i++) {
          const edge = side > 0 ? yc1 : yc2;
          const e = edge + side * (2.5 * i + 1.25);
          files.push({
            label: `Bc file ${i + 1}`, kind: 'axles',
            axles: BC.axlesTwoTrucks.map(a => ({ d: a.d, P: a.P * bc })),
            tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }],
          });
        }
        resBc.push(this.evaluateCase(files));
      }
    }
    const BcRaw = SlabDeck.envelopeOf(resBc);
    // majoration dynamique par travée (δ dépend de L, G, S) → on applique δ max (conservatif) ou par section
    const nfMax = Math.min(nv, 5);
    const SBc = this.spans.map(L => nfMax * BC.bc[cl][nfMax - 1] * 300 * (L >= 16.5 ? 2 : 1));
    const deltaBc = this.spans.map((L, j) => deltaDyn(L, G[j], SBc[j]));
    const Bc = this.applyDelta(BcRaw, deltaBc);

    // --- Bt : 1 ou 2 tandems (classes 1 et 2)
    let Bt = null, deltaBt = null;
    if (BT.bt[cl]) {
      const resBt = [];
      for (let nf = 1; nf <= Math.min(nv, 2); nf++) {
        for (const side of [1, -1]) {
          const files = [];
          for (let i = 0; i < nf; i++) {
            const edge = side > 0 ? yc1 : yc2;
            const e = edge + side * (2.5 * i + 1.25);
            files.push({
              label: `Bt file ${i + 1}`, kind: 'axles',
              axles: BT.axles.map(a => ({ d: a.d, P: a.P * BT.bt[cl] })),
              tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }],
            });
          }
          resBt.push(this.evaluateCase(files));
        }
      }
      const SBt = this.spans.map(() => Math.min(nv, 2) * BT.bt[cl] * 320);
      deltaBt = this.spans.map((L, j) => deltaDyn(L, G[j], SBt[j]));
      Bt = this.applyDelta(SlabDeck.envelopeOf(resBt), deltaBt);
    }

    // --- Mc120 : un engin, axe placé au plus près de chaque bord (largeur hors tout 4,30 m) et au centre
    const half = MC120.trackSpacing / 2;
    const posMc = [yc1 + 2.15, yc2 - 2.15, 0.5 * (yc1 + yc2)];
    const resMc = posMc.map(e => this.evaluateCase([{
      label: 'Mc120', kind: 'strip', q: 2 * MC120.qTrack, len: MC120.trackLength,
      tracks: [{ e1: e - half - 0.5, e2: e - half + 0.5, share: 0.5 }, { e1: e + half - 0.5, e2: e + half + 0.5, share: 0.5 }],
    }]));
    const SMc = this.spans.map(L => MC120.P * Math.min(1, L / MC120.trackLength));
    const deltaMc = this.spans.map((L, j) => deltaDyn(L, G[j], SMc[j]));
    const Mc120 = this.applyDelta(SlabDeck.envelopeOf(resMc), deltaMc);

    // --- D240 : convoi seul, sans majoration dynamique
    const posD = [yc1 + D240.width / 2, yc2 - D240.width / 2, 0.5 * (yc1 + yc2)];
    const D = SlabDeck.envelopeOf(posD.map(e => this.evaluateCase([{
      label: 'D240', kind: 'strip', q: D240.q, len: D240.length,
      tracks: [{ e1: e - D240.width / 2, e2: e + D240.width / 2, share: 1 }],
    }])));

    // --- trottoirs 1,5 kN/m² (cumulables avec A et B)
    const trott = this.evaluateCase((this.g.footways || []).map(f => ({
      label: 'Trottoir', kind: 'udl', q: TROTTOIR.q * (f.y2 - f.y1), tracks: [{ e1: f.y1, e2: f.y2, share: 1 }],
    })));

    return { classe: cl, Lr, Lc, nv, v, G, A, Bc, deltaBc, Bt, deltaBt, Mc120, deltaMc, D240: D, trottoir: trott };
  }

  /** Applique un coefficient de majoration dynamique par travée aux résultats d'un cas (sur appui : max des deux). */
  applyDelta(res, delta) {
    const out = JSON.parse(JSON.stringify(res));
    const dAt = s => {
      const sec = this.beam.sections[s];
      if (sec.frac === 0 && sec.span > 0) return Math.max(delta[sec.span - 1], delta[sec.span]);
      if (sec.frac === 1 && sec.span < this.spans.length - 1) return Math.max(delta[sec.span], delta[sec.span + 1]);
      return delta[sec.span];
    };
    for (const k of ['Mmax', 'Mmin', 'Vmax', 'Vmin']) out[k] = out[k].map((v, s) => v * dAt(s));
    out.mxMax = out.mxMax.map((row, s) => row.map(v => v * dAt(s)));
    out.mxMin = out.mxMin.map((row, s) => row.map(v => v * dAt(s)));
    const dMax = Math.max(...delta);
    out.Rmax = out.Rmax.map(v => v * dMax); out.Rmin = out.Rmin.map(v => v * dMax);
    out.delta = delta;
    return out;
  }
}
