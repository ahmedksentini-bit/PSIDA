/**
 * Orchestration du calcul d'un pont-dalle : géométrie, charges permanentes, modèles de trafic
 * (Eurocodes ou Fascicule 61), enveloppes longitudinales (poutre équivalente) et répartition
 * transversale (Guyon-Massonnet) → moments longitudinaux par mètre m_x(y), tranchants, réactions.
 *
 * Hypothèses (confrontées à la note CHAMOA-PSIDA, cf. docs/hypotheses.md et test/chamoa.test.js) :
 *  H1  Dalle isotrope de largeur totale 2b (encorbellements compris), inertie équivalente constante.
 *      Coefficient de Poisson ν = 0,2 par défaut (CHAMOA) ; ν = 0 reproduit les tables de Massonnet.
 *  H2  Flexion longitudinale sur poutre continue à EI constant, appuis simples, abouts en console
 *      chargés par les charges permanentes et par le trafic (pratique PSIDA.EL / PSIDP.EL).
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
import { mechanicalSkew } from './skew.js';
import { coefKFunction, coefKBand } from './guyon.js';
import { InfluencePlaque, GRANDEURS } from './plate/influence.js';
import { permanentPlaque } from './plate/deck.js';
import { EC_ALPHA, notionalLanes, lm1, lm2, TS_GEOM, FOOTWAY } from './loads_ec.js';
import { classePont, voiesF61, chargeA, BC, BT, MC120, D240, TROTTOIR, deltaDyn, maxAxleLoadOnLength, maxStripTrainLoad } from './loads_f61.js';

/** Champs à deux indices des résultats (section × fibre ; ligne × appareil pour Rapp). */
const CLES_2D = ['mxMax', 'mxMin', 'myMax', 'myMin', 'mxyMax', 'mxyMin', 'RappMax', 'RappMin'];

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
   * @param {'section'|'travee'} [g.f61Convention='travee'] K et δ des charges du Fascicule 61 : de la travée porteuse (SETRA) ou de la section
   * @param {boolean} [g.sin2Phi=false] minoration sin²φ_mec des moments d'exploitation Fasc. 61 (option PSIDP.EL)
   * @param {'moments'|'fleches'} [g.leqMethod='moments'] calcul de L_eq : points de moment nul (CHAMOA) ou flèche à mi-travée (PSIDA.EL)
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
    this.Leq = g.Leq || this.beam.equivalentSpans(g.leqMethod || 'moments');
    this.ys = g.ys || Array.from({ length: 9 }, (_, i) => -this.b + 2 * this.b * i / 8);
    this.gammaC = g.gammaC || 25;
    this.area = g.area || g.width * g.h;
    this.nu = g.nu === undefined ? 0.2 : g.nu;
    this.alphaTorsion = g.alphaTorsion === undefined ? 1 : g.alphaTorsion;
    this.laneStep = g.laneStep || 0.5;
    this._Kcache = new Map();
    this._envCache = new Map();
    // méthode « plaque » (différences finies) : g.plaque = { nb, kv, E, h } — m_x, m_y, m_xy et réactions par appareil
    // tirés des surfaces d'influence de la dalle continue sur ses appareils, au lieu de Guyon-Massonnet
    this.plaque = g.plaque ? new InfluencePlaque(this, g.plaque) : null;
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
    if (Math.abs(e2 - e1) < 1e-9 && Math.abs(e1) > this.b + 1e-9) {
      // charge-ligne hors de la largeur active (corniche, superstructures de rive d'un tablier à poutres) : extrapolation
      // linéaire de la ligne d'influence de K depuis le bord (pratique PONTYPE/PAP, pas de 0,125 m)
      const s = Math.sign(e1), fb = coefKFunction({ ...opt, e: s * this.b }), fi = coefKFunction({ ...opt, e: s * (this.b - 0.125) });
      vals = this.ys.map(y => fb(y) + (fb(y) - fi(y)) / 0.125 * (Math.abs(e1) - this.b));
    } else if (Math.abs(e2 - e1) < 1e-9) { const f = coefKFunction({ ...opt, e: e1 }); vals = this.ys.map(y => f(y)); }
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
    const g = this.g;
    files.push({ label: 'Poids propre dalle', q: this.gammaC * this.area, e1: -this.b, e2: this.b, unitK: true, kmin: g.kDalle?.[0] ?? 1, kmax: g.kDalle?.[1] ?? 1 });
    for (const l of g.lines || []) files.push({ label: l.label || 'Charge linéaire', q: l.g, e1: l.e, e2: l.e, unitK: false, kmin: l.kmin ?? 1, kmax: l.kmax ?? 1 });
    for (const bd of g.bands || []) files.push({ label: bd.label || 'Charge surfacique', q: bd.q * (bd.y2 - bd.y1), e1: bd.y1, e2: bd.y2, unitK: false, kmin: bd.kmin ?? 1, kmax: bd.kmax ?? 1 });
    return files;
  }

  /**
   * Sollicitations permanentes : valeurs nominales (M, V, R, mx) et enveloppes min/max par les
   * coefficients de valeur caractéristique kmin/kmax de chaque composante (EN 1991-1-1 §5.2.3, CHAMOA).
   */
  permanent() { return this.permanentFromFiles(this.permanentFiles()); }

  /** Idem pour une liste de composantes permanentes quelconque (profil provisoire de chantier, variantes). */
  permanentFromFiles(files) {
    const nS = this.beam.sections.length, nSup = this.spans.length + 1;
    const z = () => new Array(nS).fill(0), zy = () => Array.from({ length: nS }, () => this.ys.map(() => 0));
    const M = z(), Vm = z(), Vp = z(), Mmax = z(), Mmin = z();
    const R = new Array(nSup).fill(0), Rmax = new Array(nSup).fill(0), Rmin = new Array(nSup).fill(0);
    const mx = zy(), mxMax = zy(), mxMin = zy();
    const gTotal = files.reduce((a, f) => a + f.q, 0);
    for (const f of files) {
      const r = this.beam.uniformLoad(f.q);
      for (let s = 0; s < nS; s++) {
        M[s] += r.M[s]; Vm[s] += r.Vm[s]; Vp[s] += r.Vp[s];
        Mmax[s] += Math.max(f.kmin * r.M[s], f.kmax * r.M[s]); Mmin[s] += Math.min(f.kmin * r.M[s], f.kmax * r.M[s]);
        const K = f.unitK ? null : this.Kbar(this.LeqAt(s), f.e1, f.e2);
        this.ys.forEach((_, iy) => {
          const v = (K ? K[iy] : 1) * r.M[s] / (2 * this.b);
          mx[s][iy] += v; mxMax[s][iy] += Math.max(f.kmin * v, f.kmax * v); mxMin[s][iy] += Math.min(f.kmin * v, f.kmax * v);
        });
      }
      r.R.forEach((v, i) => { R[i] += v; Rmax[i] += Math.max(f.kmin * v, f.kmax * v); Rmin[i] += Math.min(f.kmin * v, f.kmax * v); });
    }
    if (this.plaque) {
      // plaque : m_x réel (au lieu de K·M/2b), m_y, m_xy et réactions par appareil, chaque composante entre k_min et k_max
      const pr = permanentPlaque(this.plaque.M, files);
      const z2 = () => Array.from({ length: nS }, () => this.ys.map(() => 0));
      const ext = { my: z2(), mxy: z2(), myMax: z2(), myMin: z2(), mxyMax: z2(), mxyMin: z2(), Rapp: pr.Rapp, RappMax: pr.Rapp.map(r => r.map(() => 0)), RappMin: pr.Rapp.map(r => r.map(() => 0)) };
      for (const row of mx) row.fill(0); for (const row of mxMax) row.fill(0); for (const row of mxMin) row.fill(0);
      for (const f of pr.fichiers) {
        const add = (src, nom, nMax, nMin) => src.forEach((row, s) => row.forEach((v, i) => { (nom ? ext[nom] : mx)[s][i] += v; (nMax === 'mx' ? mxMax : ext[nMax])[s][i] += Math.max(f.kmin * v, f.kmax * v); (nMin === 'mx' ? mxMin : ext[nMin])[s][i] += Math.min(f.kmin * v, f.kmax * v); }));
        add(f.mx, null, 'mx', 'mx'); add(f.my, 'my', 'myMax', 'myMin'); add(f.mxy, 'mxy', 'mxyMax', 'mxyMin');
        f.Rapp.forEach((r, i) => r.forEach((v, k) => { ext.RappMax[i][k] += Math.max(f.kmin * v, f.kmax * v); ext.RappMin[i][k] += Math.min(f.kmin * v, f.kmax * v); }));
      }
      return { files, gTotal, M, Vm, Vp, R, mx, Mmax, Mmin, Rmax, Rmin, mxMax, mxMin, ...ext, plaque: true };
    }
    return { files, gTotal, M, Vm, Vp, R, mx, Mmax, Mmin, Rmax, Rmin, mxMax, mxMin };
  }

  /** Rigidité de flexion de la section entière EI [kN·m²] : E [MPa] × I [m⁴] (I = 2b·h³/12 par défaut). */
  EItotal({ E = 34000, I = null } = {}) {
    const It = I ?? (2 * this.b * Math.pow(this.h, 3) / 12);
    return E * 1000 * It;
  }

  /**
   * Gradient thermique (EN 1991-1-5 §6.1.4.1 — approche 1, composante linéaire) : courbure κ = αT·ΔT/h,
   * ΔT > 0 = fibre supérieure plus chaude. Effets hyperstatiques uniformes sur la largeur (K = 1).
   * @returns {{heat, cool, Mmax, Mmin, mxMax, mxMin, Rmax, Rmin}}
   */
  thermal({ dTheat = 12, dTcool = -6, alphaT = 1e-5, E = 34000, I = null, hTherm = null } = {}) {
    const EI = this.spans.map(() => this.EItotal({ E, I }));
    const hh = hTherm ?? this.h;
    const run = dT => { const r = this.beam.thermalCurvature(alphaT * dT / hh, EI); return { ...r, mx: r.M.map(m => this.ys.map(() => m / (2 * this.b))) }; };
    const heat = run(dTheat), cool = run(dTcool);
    const nS = this.beam.sections.length;
    const Mmax = [], Mmin = [], mxMax = [], mxMin = [];
    for (let s = 0; s < nS; s++) {
      Mmax.push(Math.max(heat.M[s], cool.M[s], 0)); Mmin.push(Math.min(heat.M[s], cool.M[s], 0));
      mxMax.push(this.ys.map((_, iy) => Math.max(heat.mx[s][iy], cool.mx[s][iy], 0))); mxMin.push(this.ys.map((_, iy) => Math.min(heat.mx[s][iy], cool.mx[s][iy], 0)));
    }
    const Rmax = heat.R.map((v, i) => Math.max(v, cool.R[i], 0)), Rmin = heat.R.map((v, i) => Math.min(v, cool.R[i], 0));
    const Vmax = heat.Vm.map((v, s) => Math.max(v, cool.Vm[s], 0)), Vmin = heat.Vm.map((v, s) => Math.min(v, cool.Vm[s], 0));
    return { heat, cool, Mmax, Mmin, mxMax, mxMin, Rmax, Rmin, Vmax, Vmin, EI: EI[0] };
  }

  /**
   * Tassements aléatoires (pratique CHAMOA / guide Cerema) : δ sur un appui et −δ sur l'appui adjacent,
   * module différé E/(1+φ) (φ = 2 → E/3), enveloppe sur toutes les paires d'appuis adjacents et les deux signes.
   */
  settlements({ delta = 0.01, E = 34000, I = null, phi = 2 } = {}) {
    const EI = this.spans.map(() => this.EItotal({ E, I }) / (1 + phi));
    const nS = this.beam.sections.length, nSup = this.spans.length + 1;
    const Mmax = new Array(nS).fill(0), Mmin = new Array(nS).fill(0), Rmax = new Array(nSup).fill(0), Rmin = new Array(nSup).fill(0);
    const Vmax = new Array(nS).fill(0), Vmin = new Array(nS).fill(0);
    const cases = [];
    for (let i = 0; i < nSup - 1; i++) {
      const v = new Array(nSup).fill(0); v[i] = delta; v[i + 1] = -delta;
      const r = this.beam.settlement(v, EI);
      cases.push({ pair: [i, i + 1], ...r });
      for (let s = 0; s < nS; s++) { Mmax[s] = Math.max(Mmax[s], Math.abs(r.M[s])); Mmin[s] = -Mmax[s]; Vmax[s] = Math.max(Vmax[s], Math.abs(r.Vm[s])); Vmin[s] = -Vmax[s]; }
      r.R.forEach((val, k) => { Rmax[k] = Math.max(Rmax[k], Math.abs(val)); Rmin[k] = -Rmax[k]; });
    }
    const mxMax = Mmax.map(m => this.ys.map(() => m / (2 * this.b))), mxMin = Mmin.map(m => this.ys.map(() => m / (2 * this.b)));
    return { cases, Mmax, Mmin, mxMax, mxMin, Rmax, Rmin, Vmax, Vmin, EI: EI[0] };
  }

  // ---------------------------------------------------------------------------
  // Évaluation générique : files de charge indépendantes, arrangements transversaux alternatifs
  // ---------------------------------------------------------------------------

  /** Enveloppes de poutre (M, V, R) d'une file, mises en cache par signature longitudinale. */
  /** Signature longitudinale d'une file (contenu de charge, sans la position transversale). */
  _sig(f) { return f.kind + '|' + (f.kind === 'axles' ? JSON.stringify(f.axles) : f.kind === 'train' ? JSON.stringify([f.axles, f.nVeh, f.pitch]) : f.kind === 'strip' || f.kind === 'stripTrain' ? `${f.q}|${f.len}|${f.pitch || ''}` : f.kind === 'spanwise' ? f.sigL : f.q); }

  /** Enveloppe longitudinale d'une file sur une ligne d'influence (positions de charge de la poutre). */
  _envOf(f, il) {
    const bm = this.beam, step = this._pasEnv || 0.05;
    if (f.kind === 'udl') return { ...bm.udlEnvelope(il, f.q), ...bm.udlEnvelopeParts(il, f.q) };
    if (f.kind === 'stripTrain') return bm.stripTrainEnvelope(il, f.q, f.len, { pitch: f.pitch, nVeh: f.nVeh, step });
    if (f.kind === 'axles') return bm.axleEnvelope(il, f.axles, { step });
    if (f.kind === 'train') return bm.trainEnvelope(il, f.axles, { nVeh: f.nVeh, pitch: f.pitch, step });
    if (f.kind === 'strip') return bm.stripEnvelope(il, f.q, f.len, { step });
    if (f.kind === 'spanwise') return bm.spanwiseEnvelope(il, f.qOfL);
    throw new Error('kind inconnu ' + f.kind);
  }

  _beamEnvelopes(f) {
    const sig = f.kind + '|' + (f.kind === 'axles' ? JSON.stringify(f.axles) : f.kind === 'train' ? JSON.stringify([f.axles, f.nVeh, f.pitch]) : f.kind === 'strip' || f.kind === 'stripTrain' ? `${f.q}|${f.len}|${f.pitch || ''}` : f.kind === 'spanwise' ? f.sigL : f.q);
    if (this._envCache.has(sig)) return this._envCache.get(sig);
    const bm = this.beam;
    const envOf = il => this._envOf(f, il);
    const M = bm.sections.map((_, s) => envOf(bm.ILM[s]));
    const V = bm.sections.map((_, s) => {
      const a = envOf(bm.ILVm[s]), c = envOf(bm.ILVp[s]);
      const hi = a.max >= c.max ? a : c, lo = a.min <= c.min ? a : c;
      return { max: hi.max, min: lo.min, partsMax: hi.partsMax, partsMin: lo.partsMin };
    });
    const R = bm.ILR.map(il => envOf(il));
    const T = bm.ILT.map(il => envOf(il));   // rotations d'appui (EI relatif = 1)
    const out = { M, V, R, T };
    this._envCache.set(sig, out);
    return out;
  }

  /**
   * Un arrangement = liste de files { label, kind, q|axles|len|qOfL(+sigL), tracks:[{e1,e2,share}] }.
   * `arrangements` = alternatives transversales (même contenu longitudinal, positions différentes) :
   * les enveloppes de poutre sont calculées une fois, m_x(y) est enveloppé sur les arrangements.
   * @param {object} [opt]
   * @param {number[]} [opt.delta] majoration dynamique par travée (Fasc. 61) — appliquée ici
   * @param {number} [opt.dEnd] δ « d'entrée » des réactions de culée : δ_culée = ½[δ + max(δ ; dEnd)] (PSI-DA 68 § 2.4.3,
   *   PSIDP.EL : 1,5 pour B, 1,2 pour Mc120) ; appuis intermédiaires : max des δ des deux travées
   * @param {'section'|'travee'} [opt.convention] 'section' : K (L_eq de la section, moyenne sur appui) et δ de la section
   *   appliqués à toutes les charges (CHAMOA) ; 'travee' : chaque charge reçoit le K et le δ de la travée qui la porte
   *   (PSI-DA 68 § 2.2.2, PSIDA.EL, PSIDP.EL)
   * @param {number[]} [opt.momentFactor] facteur par travée porteuse appliqué aux seuls moments (option PSIDP.EL :
   *   minoration sin²φ_mec des moments longitudinaux des charges d'exploitation ; convention 'travee' seulement)
   * @returns {{Mmax,Mmin,Vmax,Vmin,Rmax,Rmin,mxMax,mxMin}}
   */
  evaluateArrangements(arrangements, { delta = null, dEnd = null, convention = 'section', momentFactor = null } = {}) {
    const nS = this.beam.sections.length, nSup = this.spans.length + 1, nSp = this.spans.length;
    const zeroS = () => new Array(nS).fill(0);
    const dSp = delta || this.spans.map(() => 1);
    const dAt = s => {
      const sec = this.beam.sections[s];
      if (sec.frac === 0 && sec.span > 0) return Math.max(dSp[sec.span - 1], dSp[sec.span]);
      if (sec.frac === 1 && sec.span < nSp - 1) return Math.max(dSp[sec.span], dSp[sec.span + 1]);
      return dSp[sec.span];
    };
    const dR = i => {
      if (i === 0 || i === nSup - 1) { const d = dSp[i === 0 ? 0 : nSp - 1]; return dEnd ? 0.5 * (d + Math.max(d, dEnd)) : d; }
      return Math.max(dSp[i - 1], dSp[i]);
    };
    const perSpan = convention === 'travee';
    const mF = momentFactor || this.spans.map(() => 1);
    let out = null;
    for (const files of arrangements) {
      const Mmax = zeroS(), Mmin = zeroS(), Vmax = zeroS(), Vmin = zeroS();
      const Rmax = new Array(nSup).fill(0), Rmin = new Array(nSup).fill(0), Tmax = new Array(nSup).fill(0), Tmin = new Array(nSup).fill(0);
      const mxMax = Array.from({ length: nS }, () => this.ys.map(() => 0));
      const mxMin = Array.from({ length: nS }, () => this.ys.map(() => 0));
      const PL = this.plaque, z2 = () => Array.from({ length: nS }, () => this.ys.map(() => 0));
      const extra = PL ? { myMax: z2(), myMin: z2(), mxyMax: z2(), mxyMin: z2(), RappMax: this.beam.x0.map(() => new Array(PL.M.nb).fill(0)), RappMin: this.beam.x0.map(() => new Array(PL.M.nb).fill(0)) } : null;
      for (const f of files) {
        const env = this._beamEnvelopes(f);
        if (PL) {
          // plaque : m_x, m_y, m_xy de la file aux sections × fibres, réactions par appareil
          const pe = PL.enveloppesFile(f, il => { this._pasEnv = PL.pas; try { return this._envOf(f, il); } finally { this._pasEnv = null; } }, this._sig(f));
          const val = (e, s, mom) => {
            if (perSpan && e.partsMax && e.partsMin) {
              const sd = (parts, fac) => parts.reduce((a, v, j) => a + dSp[j] * (fac ? mF[j] : 1) * v, 0);
              return [sd(e.partsMax, mom), sd(e.partsMin, mom)];
            }
            const d = dAt(s); return [e.max * d, e.min * d];
          };
          for (const g of GRANDEURS) {
            const [kMax, kMin] = g === 'mx' ? [mxMax, mxMin] : g === 'my' ? [extra.myMax, extra.myMin] : [extra.mxyMax, extra.mxyMin];
            for (let s = 0; s < nS; s++) for (let iy = 0; iy < this.ys.length; iy++) {
              const [a, c] = val(pe[PL.indice(g, s, iy)], s, g === 'mx');
              kMax[s][iy] += Math.max(a, c, 0); kMin[s][iy] += Math.min(a, c, 0);
            }
          }
          for (let k = PL.nM; k < PL.cibles.length; k++) {
            const c = PL.cibles[k], e = pe[k], d = delta ? dR(c.ligne) : 1;
            extra.RappMax[c.ligne][c.rang] += Math.max(e.max * d, e.min * d, 0); extra.RappMin[c.ligne][c.rang] += Math.min(e.max * d, e.min * d, 0);
          }
        }
        for (let i = 0; i < nSup; i++) { const d = delta ? dR(i) : 1; Tmax[i] += env.T[i].max * d; Tmin[i] += env.T[i].min * d; }
        for (let s = 0; s < nS; s++) {
          const em = env.M[s], ev = env.V[s];
          const useParts = perSpan && em.partsMax && em.partsMin;
          const sumD = parts => parts.reduce((a, v, j) => a + dSp[j] * v, 0);
          const sumDM = parts => parts.reduce((a, v, j) => a + dSp[j] * mF[j] * v, 0);
          if (useParts) {
            Mmax[s] += sumDM(em.partsMax); Mmin[s] += sumDM(em.partsMin);
            Vmax[s] += ev.partsMax ? sumD(ev.partsMax) : ev.max * dAt(s); Vmin[s] += ev.partsMin ? sumD(ev.partsMin) : ev.min * dAt(s);
          } else {
            const d = dAt(s);
            Mmax[s] += em.max * d; Mmin[s] += em.min * d; Vmax[s] += ev.max * d; Vmin[s] += ev.min * d;
          }
          if (!PL) for (const t of f.tracks) {
            const k2 = t.share / (2 * this.b);
            if (useParts) {
              const Ks = this.spans.map((_, j) => this.Kbar(this.Leq[j], t.e1, t.e2));
              for (let iy = 0; iy < this.ys.length; iy++) {
                let a = 0, c = 0;
                for (let j = 0; j < nSp; j++) { a += Ks[j][iy] * dSp[j] * mF[j] * em.partsMax[j]; c += Ks[j][iy] * dSp[j] * mF[j] * em.partsMin[j]; }
                a *= k2; c *= k2;
                mxMax[s][iy] += Math.max(a, c, 0); mxMin[s][iy] += Math.min(a, c, 0);
              }
            } else {
              const K = this.Kbar(this.LeqAt(s), t.e1, t.e2), d = dAt(s);
              for (let iy = 0; iy < this.ys.length; iy++) {
                const a = K[iy] * em.max * d * k2, c = K[iy] * em.min * d * k2;
                mxMax[s][iy] += Math.max(a, c, 0); mxMin[s][iy] += Math.min(a, c, 0);
              }
            }
          }
        }
        for (let i = 0; i < nSup; i++) { const d = delta ? dR(i) : 1; Rmax[i] += env.R[i].max * d; Rmin[i] += env.R[i].min * d; }
      }
      const r = { Mmax, Mmin, Vmax, Vmin, Rmax, Rmin, Tmax, Tmin, mxMax, mxMin, ...(extra || {}) };
      out = out ? SlabDeck.envelopeOf([out, r]) : r;
    }
    out = out || this.evaluateArrangements([[]]);
    if (delta) { out.delta = delta.slice(); out.deltaR = Array.from({ length: nSup }, (_, i) => dR(i)); out.convention = convention; }
    return out;
  }

  /** Un seul arrangement. */
  evaluateCase(files) { return this.evaluateArrangements([files]); }

  /** Fusion de cas alternatifs (enveloppe). */
  static envelopeOf(results) {
    const out = results[0];
    for (const r of results.slice(1)) {
      for (const k of ['Mmax', 'Vmax', 'Rmax', 'Tmax']) if (out[k] && r[k]) out[k] = out[k].map((v, i) => Math.max(v, r[k][i]));
      for (const k of ['Mmin', 'Vmin', 'Rmin', 'Tmin']) if (out[k] && r[k]) out[k] = out[k].map((v, i) => Math.min(v, r[k][i]));
      for (const k of CLES_2D) if (out[k] && r[k]) out[k] = out[k].map((row, s) => row.map((v, i) => (k.endsWith('Max') ? Math.max(v, r[k][s][i]) : Math.min(v, r[k][s][i]))));
    }
    return out;
  }

  /** Somme de plusieurs résultats de cas (cumul de charges simultanées). */
  static sum(results) {
    const out = JSON.parse(JSON.stringify(results[0]));
    for (const r of results.slice(1)) {
      for (const k of ['Mmax', 'Mmin', 'Vmax', 'Vmin', 'Rmax', 'Rmin', 'Tmax', 'Tmin']) if (out[k] && r[k]) out[k] = out[k].map((v, i) => v + r[k][i]);
      for (const k of CLES_2D) if (out[k] && r[k]) out[k] = out[k].map((row, s) => row.map((v, i) => v + r[k][s][i]));
    }
    return out;
  }

  /** Résultat multiplié par un scalaire (ψ, γ…). */
  static scale(res, k) {
    const out = JSON.parse(JSON.stringify(res));
    for (const key of ['Mmax', 'Mmin', 'Vmax', 'Vmin', 'Rmax', 'Rmin', 'Tmax', 'Tmin']) if (out[key]) out[key] = out[key].map(v => v * k);
    for (const key of CLES_2D) if (out[key]) out[key] = out[key].map(row => row.map(v => v * k));
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
  fascicule61({ classe = null, nRetenue = 0, Gspan = null, convention = null, mil = 'Mc120+D240' } = {}) {
    const { y1, y2 } = this.g.roadway;
    const Lr = y2 - y1, Lc = Lr - 0.5 * nRetenue;
    const cl = classe || classePont(Lr);
    const { nv, v } = voiesF61(Lc);
    const yc1 = y1 + (Lr - Lc) / 2, yc2 = y2 - (Lr - Lc) / 2;
    // convention SETRA par défaut : K et δ de la travée qui porte la charge (PSIDA.EL, PSIDP.EL, PSI-DA 68 § 2.2.2)
    const conv = convention || this.g.f61Convention || 'travee';
    // option PSIDP.EL : minoration sin²φ_mec (biais mécanique de chaque travée) des moments d'exploitation
    const mF = this.g.sin2Phi && (this.g.psi || 100) < 100
      ? this.spans.map(L => Math.sin(mechanicalSkew({ psi: this.g.psi, Be: 2 * this.b, L }) * Math.PI / 200) ** 2) : null;
    const optsQ = { convention: conv, momentFactor: mF };
    // G de δ : ½(G_min + G_max)·L (valeurs caractéristiques des permanentes) — PONTYPE, PSIDA.EL, PSIDP.EL
    const gMean = this.permanentFiles().reduce((a, f) => a + f.q * ((f.kmin ?? 1) + (f.kmax ?? 1)) / 2, 0);
    const G = Gspan || this.spans.map(L => gMean * L);
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
    const A = this.evaluateArrangements(arrA, optsQ);

    // --- Bc : 1 à nv files de 2 camions (largeur 2,50 m), bloc de files accolées glissant dans Lc
    const arrBc = [];
    const nfMax = Math.min(nv, 5);
    for (let nf = 1; nf <= nfMax; nf++) {
      const bc = BC.bc[cl][nf - 1];
      for (const s of slidePositions(yc1, yc2, 2.5 * nf, this.laneStep)) {
        arrBc.push(Array.from({ length: nf }, (_, i) => {
          const e = s + 2.5 * i + 1.25;
          return { label: `Bc file ${i + 1}/${nf}`, kind: 'train', nVeh: 2, pitch: BC.pitchMin, axles: BC.axlesOneTruck.map(a => ({ d: a.d, P: a.P * bc })),
            tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }] };
        }));
      }
    }
    const SBc = this.spans.map(L => nfMax * BC.bc[cl][nfMax - 1] * maxAxleLoadOnLength(BC.axlesTwoTrucks, L));
    // δ du système B : S = poids le plus élevé des essieux de Bc OU de Bt plaçables sur la travée (art. 5.5),
    // un même coefficient pour Bc et Bt (cf. note PSIDA.EL commentée)
    const SBt0 = this.spans.map(L => (BT.bt[cl] ? Math.min(nv, 2) * BT.bt[cl] * maxAxleLoadOnLength(BT.axles, L) : 0));
    const deltaBc = this.spans.map((L, j) => deltaDyn(L, G[j], Math.max(SBc[j], SBt0[j])));
    const Bc = this.evaluateArrangements(arrBc, { ...optsQ, delta: deltaBc, dEnd: 1.5 });

    // --- Bt : 1 ou 2 tandems (classes 1 et 2)
    let Bt = null, deltaBt = null;
    if (BT.bt[cl]) {
      const arrBt = [];
      for (let nf = 1; nf <= Math.min(nv, 2); nf++) {
        const wb = Math.min(BT.width, Lc / nf);   // bande de 3 m par tandem (réduite si Lc < 3·nf)
        for (const s of slidePositions(yc1, yc2, wb * nf, this.laneStep)) {
          arrBt.push(Array.from({ length: nf }, (_, i) => {
            const e = s + wb * i + wb / 2;
            return { label: `Bt file ${i + 1}/${nf}`, kind: 'axles', axles: BT.axles.map(a => ({ d: a.d, P: a.P * BT.bt[cl] })),
              tracks: [{ e1: e - 1, e2: e - 1, share: 0.5 }, { e1: e + 1, e2: e + 1, share: 0.5 }] };
          }));
        }
      }
      deltaBt = deltaBc;
      Bt = this.evaluateArrangements(arrBt, { ...optsQ, delta: deltaBt, dEnd: 1.5 });
    }

    // --- Mc120 : engins de largeur hors tout 4,30 m glissant dans Lc, en convoi longitudinal
    const half = MC120.trackSpacing / 2;
    // convoi d'engins Mc120 à espacement libre (distance libre ≥ 30,50 m, art. 9) — note modèle PSIDP.EL
    const arrMc = slidePositions(yc1 + 2.15, yc2 - 2.15, 0, this.laneStep).map(e => [{
      label: 'Mc120', kind: 'stripTrain', pitch: MC120.trackLength + MC120.gapMin, q: 2 * MC120.qTrack, len: MC120.trackLength,
      tracks: [{ e1: e - half - 0.5, e2: e - half + 0.5, share: 0.5 }, { e1: e + half - 0.5, e2: e + half + 0.5, share: 0.5 }],
    }]);
    const SMc = this.spans.map(L => maxStripTrainLoad(L, MC120.trackLength, MC120.trackLength + MC120.gapMin, MC120.P));
    const deltaMc = this.spans.map((L, j) => deltaDyn(L, G[j], SMc[j]));
    // charges militaires et exceptionnelles selon l'itinéraire (art. 9 et 10) : 'Mc120', 'D240', 'Mc120+D240' ou 'aucune'
    const withMc = /Mc120/.test(mil), withD = /D240/.test(mil);
    const Mc120 = withMc ? this.evaluateArrangements(arrMc, { ...optsQ, delta: deltaMc, dEnd: 1.2 }) : null;

    // --- D240 : convoi seul, sans majoration dynamique
    const arrD = slidePositions(yc1 + D240.width / 2, yc2 - D240.width / 2, 0, this.laneStep).map(e => [{
      label: 'D240', kind: 'strip', q: D240.q, len: D240.length, tracks: [{ e1: e - D240.width / 2, e2: e + D240.width / 2, share: 1 }],
    }]);
    const D = withD ? this.evaluateArrangements(arrD, optsQ) : null;

    const trott = this.evaluateArrangements([(this.g.footways || []).map(f => ({
      label: 'Trottoir', kind: 'udl', q: TROTTOIR.q * (f.y2 - f.y1), tracks: [{ e1: f.y1, e2: f.y2, share: 1 }],
    }))], optsQ);

    return { classe: cl, Lr, Lc, nv, v, G, A, Bc, deltaBc, Bt, deltaBt, Mc120, deltaMc, D240: D, trottoir: trott, mil };
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
    for (const k of CLES_2D) if (out[k] && !k.startsWith('Rapp')) out[k] = out[k].map((row, s) => row.map(v => v * dAt(s)));
    const dMax = Math.max(...delta);
    for (const k of ['RappMax', 'RappMin']) if (out[k]) out[k] = out[k].map(row => row.map(v => v * dMax));
    out.Rmax = out.Rmax.map(v => v * dMax); out.Rmin = out.Rmin.map(v => v * dMax);
    out.delta = delta;
    return out;
  }
}
