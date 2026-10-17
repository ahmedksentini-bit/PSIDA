/**
 * Orchestration du calcul d'un pont-dalle : géométrie, charges permanentes, modèles de trafic
 * (Eurocodes ou Fascicule 61), enveloppes longitudinales (poutre équivalente) et répartition
 * transversale (Guyon-Massonnet) → moments longitudinaux par mètre m_x(y), tranchants, réactions.
 *
 * Hypothèses (confrontées à la note CHAMOA-PSIDA, cf. docs/hypotheses.md et test/chamoa.test.js) :
 *  H1  Dalle isotrope de largeur totale 2b (encorbellements compris), inertie équivalente constante.
 *      Coefficient de Poisson ν = 0,2 par défaut (CHAMOA) ; ν = 0 reproduit les tables de Massonnet.
 *  H2  Flexion longitudinale sur poutre continue à EI constant, appuis simples, abouts en console
 *      chargés par les charges permanentes.
 *  H3  Répartition transversale au premier harmonique, θ = b / L_eq, L_eq = distance entre points de
 *      moment nul de la travée chargée seule par une charge uniforme (« méthode des moments » CHAMOA) ;
 *      sur appui, moyenne des L_eq des deux travées adjacentes.
 *  H4  Pour chaque fibre y, arrangement transversal des voies / files le plus défavorable (glissement et
 *      renumérotation des voies) ; chaque file positionnée indépendamment dans le sens longitudinal :
 *      m_x(y) = Σ K̄_i(y)·M_i/(2b).
 *  H5  Poids propre : K = 1 ; superstructures : charges-lignes excentrées avec K(e,y) ; revêtement : bande
 *      uniforme sur la chaussée avec K̄.
 *  H6  Ouvrage droit (biais ≥ 70 gr : à corriger par les coefficients du guide SETRA 1989).
 */
import { ContinuousBeam } from './beam.js';
import { coefKFunction, coefKBand } from './guyon.js';
import { EC_ALPHA, notionalLanes, lm1, lm2, TS_GEOM, FOOTWAY } from './loads_ec.js';
import { classePont, voiesF61, chargeA, BC, BT, MC120, D240, TROTTOIR, deltaDyn } from './loads_f61.js';

/** Permutations d'un tableau (petites tailles). */
function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((v, i) => { for (const p of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([v, ...p]); });
  return out;
}

/** Positions d'un bloc de largeur w glissant dans [y1, y2] par pas ≤ step (bornes incluses). */
function slidePositions(y1, y2, w, step = 0.5) {
  const free = y2 - y1 - w;
  if (free <= 1e-9) return [y1];
  const n = Math.max(1, Math.ceil(free / step));
  return Array.from({ length: n + 1 }, (_, i) => y1 + free * i / n);
}

export class SlabDeck {
  /**
   * @param {object} g
   * @param {number[]} g.spans portées [m]
   * @param {number} g.width largeur totale de la dalle 2b [m]
   * @param {number} g.h épaisseur de la dalle [m]
   * @param {{y1:number, y2:number}} g.roadway bornes de la chaussée (largeur roulable) dans le repère y ∈ [−b, b]
   * @param {number} [g.gammaC=25] poids volumique du béton [kN/m³]
   * @param {number} [g.area] aire de la section droite [m²] (défaut 2b·h) — pour le poids propre
   * @param {number[]} [g.overhangs=[0,0]] abouts en console au-delà des appuis extrêmes [m]
   * @param {{g:number, e:number, label?:string}[]} [g.lines] charges permanentes linéaires (corniches, BN4, trottoirs…) [kN/m] en e
   * @param {{q:number, y1:number, y2:number, label?:string}[]} [g.bands] charges permanentes surfaciques (revêtement, remblai) [kN/m²]
   * @param {{y1:number, y2:number}[]} [g.footways] trottoirs (pour q_fk)
   * @param {number} [g.nGrid=100] positions de charge par travée
   * @param {number} [g.nSec=20] intervalles de sections par travée
   * @param {number[]} [g.ys] ordonnées de calcul transversal (défaut : 9 points de −b à b)
   * @param {number[]} [g.Leq] portées équivalentes imposées (sinon calculées, H3)
   * @param {number} [g.nu=0.2] coefficient de Poisson de la dalle pour Guyon-Massonnet (0 = tables de Massonnet)
   * @param {number} [g.alphaTorsion=1] paramètre de torsion α de Guyon-Massonnet (1 = dalle isotrope)
   * @param {number} [g.laneStep=0.5] pas de glissement transversal des voies / files [m]
   */
  constructor(g) {
    this.g = g;
    this.spans = g.spans;
    this.b = g.width / 2;
    this.h = g.h;
    this.beam = new ContinuousBeam(g.spans, { nGrid: g.nGrid || 100, nSec: g.nSec || 20, overhangs: g.overhangs || [0, 0] });
    this.Leq = g.Leq || this.beam.equivalentSpans();
    this.ys = g.ys || Array.from({ length: 9 }, (_, i) => -this.b + 2 * this.b * i / 8);
    this.gammaC = g.gammaC || 25;
    this.area = g.area || g.width * g.h;
    this.nu = g.nu === undefined ? 0.2 : g.nu;
    this.alphaTorsion = g.alphaTorsion === undefined ? 1 : g.alphaTorsion;
    this.laneStep = g.laneStep || 0.5;
    this._Kcache = new Map();
    this._envCache = new Map();
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
    const opt = { b: this.b, L, nu: this.nu, alpha: this.alphaTorsion };
    let vals;
    if (Math.abs(e2 - e1) < 1e-9) { const f = coefKFunction({ ...opt, e: e1 }); vals = this.ys.map(y => f(y)); }
    else vals = this.ys.map(y => coefKBand({ ...opt, e1, e2, y }));
    this._Kcache.set(key, vals);
    return vals;
  }

  /** Sections « clés » : mi-travée (plus proche du max), et appuis intermédiaires. */
  keySections() {
    const out = [];
    const n = this.spans.length;
    for (let j = 0; j < n; j++) {
      const frac = n === 1 ? 0.5 : j === 0 ? 0.4 : j === n - 1 ? 0.6 : 0.5;
      out.push({ label: `Travée ${j + 1} (${frac}L)`, idx: this.beam.sectionIndex(j, frac), span: j, kind: 'span' });
      if (j < n - 1) out.push({ label: `Appui P${j + 1}`, idx: this.beam.supportSectionIndex(j + 1), span: j, kind: 'support' });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Charges permanentes
  // ---------------------------------------------------------------------------

  permanentFiles() {
    const files = [];
    files.push({ label: 'Poids propre dalle', q: this.gammaC * this.area, e1: -this.b, e2: this.b, unitK: true });
    for (const l of this.g.lines || []) files.push({ label: l.label || 'Charge linéaire', q: l.g, e1: l.e, e2: l.e, unitK: false });
    for (const bd of this.g.bands || []) files.push({ label: bd.label || 'Charge surfacique', q: bd.q * (bd.y2 - bd.y1), e1: bd.y1, e2: bd.y2, unitK: false });
    return files;
  }

  /** Sollicitations permanentes : M_total, V, R par section (poutre), et m_x(y) par K̄ (H5). */
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
  // Évaluation générique : files de charge indépendantes, arrangements transversaux alternatifs
  // ---------------------------------------------------------------------------

  /** Enveloppes de poutre (M, V, R) d'une file, mises en cache par signature longitudinale. */
  _beamEnvelopes(f) {
    const sig = f.kind + '|' + (f.kind === 'axles' ? JSON.stringify(f.axles) : f.kind === 'strip' ? `${f.q}|${f.len}` : f.kind === 'spanwise' ? f.sigL : f.q);
    if (this._envCache.has(sig)) return this._envCache.get(sig);
    const bm = this.beam;
    const envOf = il => {
      if (f.kind === 'udl') return bm.udlEnvelope(il, f.q);
      if (f.kind === 'axles') return bm.axleEnvelope(il, f.axles);
      if (f.kind === 'strip') return bm.stripEnvelope(il, f.q, f.len);
      if (f.kind === 'spanwise') return bm.spanwiseEnvelope(il, f.qOfL);
      throw new Error('kind inconnu ' + f.kind);
    };
    const M = bm.sections.map((_, s) => envOf(bm.ILM[s]));
    const V = bm.sections.map((_, s) => { const a = envOf(bm.ILVm[s]), c = envOf(bm.ILVp[s]); return { max: Math.max(a.max, c.max), min: Math.min(a.min, c.min) }; });
    const R = bm.ILR.map(il => envOf(il));
    const out = { M, V, R };
    this._envCache.set(sig, out);
    return out;
  }

  /**
   * Un arrangement = liste de files { label, kind, q|axles|len|qOfL(+sigL), tracks:[{e1,e2,share}] }.
   * `arrangements` = alternatives transversales (même contenu longitudinal, positions différentes) :
   * les enveloppes de poutre sont calculées une fois, m_x(y) est enveloppé sur les arrangements.
   * @returns {{Mmax,Mmin,Vmax,Vmin,Rmax,Rmin,mxMax,mxMin}}
   */
  evaluateArrangements(arrangements) {
    const nS = this.beam.sections.length, nSup = this.spans.length + 1;
    const zeroS = () => new Array(nS).fill(0);
    let out = null;
    for (const files of arrangements) {
      const Mmax = zeroS(), Mmin = zeroS(), Vmax = zeroS(), Vmin = zeroS();
      const Rmax = new Array(nSup).fill(0), Rmin = new Array(nSup).fill(0);
      const mxMax = Array.from({ length: nS }, () => this.ys.map(() => 0));
      const mxMin = Array.from({ length: nS }, () => this.ys.map(() => 0));
      for (const f of files) {
        const env = this._beamEnvelopes(f);
        for (let s = 0; s < nS; s++) {
          const em = env.M[s];
          Mmax[s] += em.max; Mmin[s] += em.min; Vmax[s] += env.V[s].max; Vmin[s] += env.V[s].min;
          const L = this.LeqAt(s);
          for (const t of f.tracks) {
            const K = this.Kbar(L, t.e1, t.e2);
            for (let iy = 0; iy < this.ys.length; iy++) {
              const a = K[iy] * em.max * t.share / (2 * this.b), c = K[iy] * em.min * t.share / (2 * this.b);
              mxMax[s][iy] += Math.max(a, c, 0); mxMin[s][iy] += Math.min(a, c, 0);
            }
          }
        }
        for (let i = 0; i < nSup; i++) { Rmax[i] += env.R[i].max; Rmin[i] += env.R[i].min; }
      }
      const r = { Mmax, Mmin, Vmax, Vmin, Rmax, Rmin, mxMax, mxMin };
      out = out ? SlabDeck.envelopeOf([out, r]) : r;
    }
    return out || this.evaluateArrangements([[]]);
  }

  /** Un seul arrangement. */
  evaluateCase(files) { return this.evaluateArrangements([files]); }

  /** Fusion de cas alternatifs (enveloppe). */
  static envelopeOf(results) {
    const out = results[0];
    for (const r of results.slice(1)) {
      for (const k of ['Mmax', 'Vmax', 'Rmax']) out[k] = out[k].map((v, i) => Math.max(v, r[k][i]));
      for (const k of ['Mmin', 'Vmin', 'Rmin']) out[k] = out[k].map((v, i) => Math.min(v, r[k][i]));
      out.mxMax = out.mxMax.map((row, s) => row.map((v, i) => Math.max(v, r.mxMax[s][i])));
      out.mxMin = out.mxMin.map((row, s) => row.map((v, i) => Math.min(v, r.mxMin[s][i])));
    }
    return out;
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

  /** Résultat multiplié par un scalaire (ψ, γ…). */
  static scale(res, k) {
    const out = JSON.parse(JSON.stringify(res));
    for (const key of ['Mmax', 'Mmin', 'Vmax', 'Vmin', 'Rmax', 'Rmin']) out[key] = out[key].map(v => v * k);
    out.mxMax = out.mxMax.map(row => row.map(v => v * k)); out.mxMin = out.mxMin.map(row => row.map(v => v * k));
    return out;
  }

  /**
   * Facteur de répartition transversale « à la CHAMOA » : pour chaque section, f(y) = m_x,max(y)/(M_max/2b)
   * (ou min/min) et K_section = max_y f(y) — c'est le KTRANS que CHAMOA applique au calcul ST1.
   */
  transverseFactors(res) {
    const nS = this.beam.sections.length;
    const fMax = [], fMin = [], K = [];
    for (let s = 0; s < nS; s++) {
      const a = res.Mmax[s] / (2 * this.b), c = res.Mmin[s] / (2 * this.b);
      fMax.push(res.mxMax[s].map(v => (Math.abs(a) > 1e-9 ? v / a : 0)));
      fMin.push(res.mxMin[s].map(v => (Math.abs(c) > 1e-9 ? v / c : 0)));
      K.push(Math.max(...fMax[s], ...fMin[s]));
    }
    return { fMax, fMin, K };
  }

  // ---------------------------------------------------------------------------
  // Arrangements transversaux
  // ---------------------------------------------------------------------------

  /**
   * Voies Eurocode : bloc de n voies contiguës de largeur wl glissant dans la chaussée (pas laneStep),
   * numérotation des voies permutée (les 3 premières portent des charges différentes), aire résiduelle
   * = reste de la chaussée de part et d'autre du bloc.
   * @returns {{lanes:{e1,e2}[], rest:{e1,e2}[]}[]} lanes[i] = position physique de la voie numéro i+1
   */
  laneArrangementsEC(nLanes, wl) {
    const { y1, y2 } = this.g.roadway;
    const out = [];
    const slots = Array.from({ length: nLanes }, (_, i) => i);
    // permutations utiles : seules les 3 premières voies diffèrent (au-delà, voies identiques)
    const perms = nLanes <= 3 ? permutations(slots) : permutations(slots).filter((p, i, arr) => {
      const key = p.slice(0, 3).join(','); return arr.findIndex(q => q.slice(0, 3).join(',') === key) === i;
    });
    for (const s of slidePositions(y1, y2, nLanes * wl, this.laneStep)) {
      const phys = slots.map(i => ({ e1: s + i * wl, e2: s + (i + 1) * wl }));
      const rest = [{ e1: y1, e2: s }, { e1: s + nLanes * wl, e2: y2 }].filter(r => r.e2 - r.e1 > 1e-6);
      for (const p of perms) out.push({ lanes: p.map(i => phys[i]), rest });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Eurocode : LM1 (gr1a), LM2 (gr1b), trottoirs (gr3)
  // ---------------------------------------------------------------------------

  /**
   * @param {{alpha?:object}} opt alpha = EC_ALPHA.recommended | FR1 | FR2
   */
  eurocode({ alpha = EC_ALPHA.recommended } = {}) {
    const { y1, y2 } = this.g.roadway;
    const w = y2 - y1;
    const nl = notionalLanes(w);
    const m1 = lm1(nl.n, alpha);
    const arrangements = this.laneArrangementsEC(nl.n, nl.wl);
    const arrTS = [], arrUDL = [];
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
      for (const r of arr.rest) if (m1.qr > 0) filesUDL.push({ label: 'UDL aire résiduelle', kind: 'udl', q: m1.qr * (r.e2 - r.e1), tracks: [{ e1: r.e1, e2: r.e2, share: 1 }] });
      arrTS.push(filesTS); arrUDL.push(filesUDL);
    }
    const TS = this.evaluateArrangements(arrTS), UDL = this.evaluateArrangements(arrUDL);
    const fw = q => (this.g.footways || []).map(f => ({ label: 'Trottoir', kind: 'udl', q: q * (f.y2 - f.y1), tracks: [{ e1: f.y1, e2: f.y2, share: 1 }] }));
    const footway3 = this.evaluateCase(fw(FOOTWAY.qfkCombi));
    const gr3 = this.evaluateCase(fw(FOOTWAY.qfk));
    const LM1 = SlabDeck.sum([TS, UDL]);
    const gr1a = SlabDeck.sum([TS, UDL, footway3]);
    const l2 = lm2(alpha);
    const posLM2 = slidePositions(y1 + 1 + l2.contact.y / 2, y2 - 1 - l2.contact.y / 2, 0, this.laneStep);
    const gr1b = this.evaluateArrangements(posLM2.map(e => [{
      label: 'LM2', kind: 'axles', axles: [{ d: 0, P: l2.Q }],
      tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }],
    }]));
    return { lanes: nl, lm1: m1, alpha, nArrangements: arrangements.length, TS, UDL, LM1, footway: footway3, gr1a, gr1b, gr3 };
  }

  // ---------------------------------------------------------------------------
  // Fascicule 61 titre II : A(l), Bc, Bt, Mc120, D240, trottoirs
  // ---------------------------------------------------------------------------

  /**
   * @param {{classe?:number, nRetenue?:number, Gspan?:number[]}} opt
   */
  fascicule61({ classe = null, nRetenue = 0, Gspan = null } = {}) {
    const { y1, y2 } = this.g.roadway;
    const Lr = y2 - y1, Lc = Lr - 0.5 * nRetenue;
    const cl = classe || classePont(Lr);
    const { nv, v } = voiesF61(Lc);
    const yc1 = y1 + (Lr - Lc) / 2, yc2 = y2 - (Lr - Lc) / 2;
    const gT = this.permanent().gTotal;
    const G = Gspan || this.spans.map(L => gT * L);
    const voies = Array.from({ length: nv }, (_, i) => ({ e1: yc1 + i * v, e2: yc1 + (i + 1) * v }));

    // --- A(l) : tout sous-ensemble des voies fixes ; a1 dépend du nombre de voies chargées
    const arrA = [];
    for (let mask = 1; mask < (1 << nv); mask++) {
      const list = voies.filter((_, i) => mask & (1 << i));
      const nvc = list.length;
      arrA.push(list.map((ln, i) => ({
        label: `A(l) ${nvc} voie(s)`, kind: 'spanwise', sigL: `A|${cl}|${nvc}|${v.toFixed(3)}`,
        qOfL: l => chargeA(l, { classe: cl, nVoiesChargees: nvc, v }).q * v,
        tracks: [{ e1: ln.e1, e2: ln.e2, share: 1 }],
      })));
    }
    const A = this.evaluateArrangements(arrA);

    // --- Bc : 1 à nv files de 2 camions (largeur 2,50 m), bloc de files accolées glissant dans Lc
    const arrBc = [];
    const nfMax = Math.min(nv, 5);
    for (let nf = 1; nf <= nfMax; nf++) {
      const bc = BC.bc[cl][nf - 1];
      for (const s of slidePositions(yc1, yc2, 2.5 * nf, this.laneStep)) {
        arrBc.push(Array.from({ length: nf }, (_, i) => {
          const e = s + 2.5 * i + 1.25;
          return { label: `Bc file ${i + 1}/${nf}`, kind: 'axles', axles: BC.axlesTwoTrucks.map(a => ({ d: a.d, P: a.P * bc })),
            tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }] };
        }));
      }
    }
    const SBc = this.spans.map(L => nfMax * BC.bc[cl][nfMax - 1] * 300 * (L >= 16.5 ? 2 : 1));
    const deltaBc = this.spans.map((L, j) => deltaDyn(L, G[j], SBc[j]));
    const Bc = this.applyDelta(this.evaluateArrangements(arrBc), deltaBc);

    // --- Bt : 1 ou 2 tandems (classes 1 et 2)
    let Bt = null, deltaBt = null;
    if (BT.bt[cl]) {
      const arrBt = [];
      for (let nf = 1; nf <= Math.min(nv, 2); nf++) {
        for (const s of slidePositions(yc1, yc2, 2.5 * nf, this.laneStep)) {
          arrBt.push(Array.from({ length: nf }, (_, i) => {
            const e = s + 2.5 * i + 1.25;
            return { label: `Bt file ${i + 1}/${nf}`, kind: 'axles', axles: BT.axles.map(a => ({ d: a.d, P: a.P * BT.bt[cl] })),
              tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }] };
          }));
        }
      }
      const SBt = this.spans.map(() => Math.min(nv, 2) * BT.bt[cl] * 320);
      deltaBt = this.spans.map((L, j) => deltaDyn(L, G[j], SBt[j]));
      Bt = this.applyDelta(this.evaluateArrangements(arrBt), deltaBt);
    }

    // --- Mc120 : un engin (largeur hors tout 4,30 m) glissant dans Lc
    const half = MC120.trackSpacing / 2;
    const arrMc = slidePositions(yc1 + 2.15, yc2 - 2.15, 0, this.laneStep).map(e => [{
      label: 'Mc120', kind: 'strip', q: 2 * MC120.qTrack, len: MC120.trackLength,
      tracks: [{ e1: e - half - 0.5, e2: e - half + 0.5, share: 0.5 }, { e1: e + half - 0.5, e2: e + half + 0.5, share: 0.5 }],
    }]);
    const SMc = this.spans.map(L => MC120.P * Math.min(1, L / MC120.trackLength));
    const deltaMc = this.spans.map((L, j) => deltaDyn(L, G[j], SMc[j]));
    const Mc120 = this.applyDelta(this.evaluateArrangements(arrMc), deltaMc);

    // --- D240 : convoi seul, sans majoration dynamique
    const arrD = slidePositions(yc1 + D240.width / 2, yc2 - D240.width / 2, 0, this.laneStep).map(e => [{
      label: 'D240', kind: 'strip', q: D240.q, len: D240.length, tracks: [{ e1: e - D240.width / 2, e2: e + D240.width / 2, share: 1 }],
    }]);
    const D = this.evaluateArrangements(arrD);

    const trott = this.evaluateCase((this.g.footways || []).map(f => ({
      label: 'Trottoir', kind: 'udl', q: TROTTOIR.q * (f.y2 - f.y1), tracks: [{ e1: f.y1, e2: f.y2, share: 1 }],
    })));

    return { classe: cl, Lr, Lc, nv, v, G, A, Bc, deltaBc, Bt, deltaBt, Mc120, deltaMc, D240: D, trottoir: trott };
  }

  /** Applique un coefficient de majoration dynamique par travée (sur appui : max des deux). */
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
