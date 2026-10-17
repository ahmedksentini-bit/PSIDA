/**
 * Flexion transversale m_y(y) par travée — modèle « dalle isostatique équivalente » (pratique PSIDA / CHAMOA) :
 * plaque isotrope de largeur 2b, de portée L_eq, bords libres, ν (0,2 par défaut), chargée par les
 * charges réelles diffusées à 45° jusqu'au feuillet moyen (contact + 2·t_rev + h), résolue en séries de
 * Fourier (guyon.transverseMoments). Les moments sont évalués à x = L_eq/2, les charges roulantes étant
 * centrées sur cette section (position la plus défavorable pour m_y), et enveloppés sur les arrangements
 * transversaux (voies glissées / renumérotées, files accolées glissées).
 *
 * Effets thermiques et tassements : m_y = ν · m_x (plaque isotrope, dilatation transversale libre).
 */
import { transverseMoments } from './guyon.js';
import { notionalLanes, lm1, lm2, TS_GEOM, FOOTWAY } from './loads_ec.js';
import { classePont, voiesF61, chargeA, BC, BT, MC120, D240, TROTTOIR, deltaDyn, maxAxleLoadOnLength } from './loads_f61.js';

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((v, i) => { for (const p of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([v, ...p]); });
  return out;
}
function slidePositions(y1, y2, w, step = 0.5) {
  const free = y2 - y1 - w;
  if (free <= 1e-9) return [y1];
  const n = Math.max(1, Math.ceil(free / step));
  return Array.from({ length: n + 1 }, (_, i) => y1 + free * i / n);
}

export class TransverseModel {
  /**
   * @param {import('./analysis.js').SlabDeck} deck
   * @param {{tRev?:number, nHarm?:number, ys?:number[], diffuseToMidPlane?:boolean}} opt
   */
  constructor(deck, { tRev = 0.08, nHarm = 15, ys = null, diffuseToMidPlane = true } = {}) {
    this.deck = deck;
    this.tRev = tRev;
    this.nHarm = nHarm;
    this.ys = ys || deck.ys;
    this.diffuse = diffuseToMidPlane;
    this._cache = new Map();
  }

  /** Diffusion d'une aire d'impact a (long.) × bb (transv.) jusqu'au feuillet moyen. */
  diffused(a, bb) {
    const add = this.diffuse ? 2 * this.tRev + this.deck.h : 2 * this.tRev;
    return { a: a + add, bb: bb + add };
  }

  /** Réponse m_y(y) et m_x(y) de la travée j (x = L/2) à une liste de patches unitaires (mise en cache). */
  response(j, key, patches) {
    const k = `${j}|${key}`;
    if (this._cache.has(k)) return this._cache.get(k);
    const L = this.deck.Leq[j], b = this.deck.b;
    const clipped = patches.map(p => ({ ...p, x1: Math.max(0, p.x1), x2: Math.min(L, p.x2) })).filter(p => p.x2 - p.x1 > 1e-6 && p.e2 > -b && p.e1 < b)
      .map(p => ({ ...p, e1: Math.max(-b, p.e1), e2: Math.min(b, p.e2) }));
    const r = transverseMoments({ b, L, patches: clipped, x: L / 2, ys: this.ys, nHarm: this.nHarm, nu: this.deck.nu, alpha: this.deck.alphaTorsion });
    this._cache.set(k, r);
    return r;
  }

  // ---- patches unitaires ---------------------------------------------------------------------------

  /** Tandem TS : 2 essieux à x ± 0,6, roues à e ± 1, charge 1 kN par essieu (0,5 par roue). */
  tsPatches(j, e) {
    const L = this.deck.Leq[j], { a, bb } = this.diffused(TS_GEOM.contact.x, TS_GEOM.contact.y);
    const out = [];
    for (const dx of [-0.6, 0.6]) for (const de of [-1, 1]) out.push({ x1: L / 2 + dx - a / 2, x2: L / 2 + dx + a / 2, e1: e + de - bb / 2, e2: e + de + bb / 2, q: 0.5 / (a * bb) });
    return out;
  }
  /** Essieu isolé (LM2, Br…) : 1 kN par essieu, roues à e ± 1 (2 roues) ou roue unique en e. */
  axlePatches(j, e, cx, cy, wheels = 2) {
    const L = this.deck.Leq[j], { a, bb } = this.diffused(cx, cy);
    if (wheels === 1) return [{ x1: L / 2 - a / 2, x2: L / 2 + a / 2, e1: e - bb / 2, e2: e + bb / 2, q: 1 / (a * bb) }];
    return [-1, 1].map(de => ({ x1: L / 2 - a / 2, x2: L / 2 + a / 2, e1: e + de - bb / 2, e2: e + de + bb / 2, q: 0.5 / (a * bb) }));
  }
  /** Bande uniforme q = 1 kN/m² sur [e1,e2] et toute la portée. */
  bandPatches(j, e1, e2) { return [{ x1: 0, x2: this.deck.Leq[j], e1, e2, q: 1 }]; }
  /** Camions Bc (2 camions, 6 essieux, roues à e ± 1) : charges unitaires × poids d'essieu réels / 300 (1 camion = 1). */
  bcPatches(j, e) {
    const L = this.deck.Leq[j];
    const rear = this.diffused(BC.contactRear.x, BC.contactRear.y), front = this.diffused(BC.contactFront.x, BC.contactFront.y);
    // essieux arrière du 1er camion centrés sur x = L/2 (±0,75) ; essieu avant à −4,5 ; 2e camion derrière
    const axles = [{ d: -0.75 - 4.5, P: 60, c: front }, { d: -0.75, P: 120, c: rear }, { d: 0.75, P: 120, c: rear },
      { d: 0.75 + 4.5, P: 60, c: front }, { d: 0.75 + 9.0, P: 120, c: rear }, { d: 0.75 + 10.5, P: 120, c: rear }];
    const out = [];
    for (const ax of axles) for (const de of [-1, 1]) out.push({ x1: L / 2 + ax.d - ax.c.a / 2, x2: L / 2 + ax.d + ax.c.a / 2, e1: e + de - ax.c.bb / 2, e2: e + de + ax.c.bb / 2, q: (ax.P / 2) / (ax.c.a * ax.c.bb) });
    return out;
  }
  btPatches(j, e) {
    const L = this.deck.Leq[j], c = this.diffused(BT.contact.x, BT.contact.y);
    const out = [];
    for (const dx of [-0.675, 0.675]) for (const de of [-1, 1]) out.push({ x1: L / 2 + dx - c.a / 2, x2: L / 2 + dx + c.a / 2, e1: e + de - c.bb / 2, e2: e + de + c.bb / 2, q: 80 / (c.a * c.bb) });
    return out;
  }
  mcPatches(j, e) {
    const L = this.deck.Leq[j], h = MC120.trackSpacing / 2, c = this.diffused(MC120.trackLength, MC120.trackWidth);
    return [-h, h].map(de => ({ x1: L / 2 - c.a / 2, x2: L / 2 + c.a / 2, e1: e + de - c.bb / 2, e2: e + de + c.bb / 2, q: 550 / (c.a * c.bb) }));
  }
  dPatches(j, e) {
    const L = this.deck.Leq[j], c = this.diffused(D240.length, D240.width);
    return [{ x1: L / 2 - c.a / 2, x2: L / 2 + c.a / 2, e1: e - c.bb / 2, e2: e + c.bb / 2, q: 2400 / (c.a * c.bb) }];
  }

  // ---- enveloppes ------------------------------------------------------------------------------------

  /** Enveloppe max/min de Σ coef·réponse sur des arrangements (liste de listes {key, patches, coef}). */
  envelope(j, arrangements) {
    const n = this.ys.length;
    const myMax = new Array(n).fill(0), myMin = new Array(n).fill(0), mxMax = new Array(n).fill(0), mxMin = new Array(n).fill(0);
    for (const arr of arrangements) {
      const my = new Array(n).fill(0), mx = new Array(n).fill(0);
      for (const c of arr) { const r = this.response(j, c.key, c.patches); for (let i = 0; i < n; i++) { my[i] += c.coef * r.my[i]; mx[i] += c.coef * r.mx[i]; } }
      for (let i = 0; i < n; i++) { myMax[i] = Math.max(myMax[i], my[i]); myMin[i] = Math.min(myMin[i], my[i]); mxMax[i] = Math.max(mxMax[i], mx[i]); mxMin[i] = Math.min(mxMin[i], mx[i]); }
    }
    return { myMax, myMin, mxMax, mxMin };
  }

  /** Charges permanentes (valeurs nominales et enveloppe kmin/kmax) sur la dalle isostatique équivalente. */
  permanent(j) {
    const deck = this.deck, b = deck.b, g = deck.g, n = this.ys.length;
    const comps = [];
    // poids propre : q = γ·h, et allègement des chanfreins (épaisseur de h_edge au bord à h à |y| = b − joue)
    comps.push({ key: 'pp', patches: this.bandPatches(j, -b, b), coef: deck.gammaC * deck.h, kmin: g.kDalle?.[0] ?? 1, kmax: g.kDalle?.[1] ?? 1 });
    if (g.chamfer) {
      const { hEdge, joue } = g.chamfer, nP = 4;
      for (const s of [1, -1]) for (let i = 0; i < nP; i++) {
        const y1 = b - joue + joue * i / nP, y2 = y1 + joue / nP, mid = (y1 + y2) / 2;
        const lighten = (deck.h - hEdge) * (mid - (b - joue)) / joue;
        comps.push({ key: `ch${s}${i}`, patches: this.bandPatches(j, s > 0 ? y1 : -y2, s > 0 ? y2 : -y1), coef: -deck.gammaC * lighten, kmin: g.kDalle?.[0] ?? 1, kmax: g.kDalle?.[1] ?? 1 });
      }
    }
    (g.lines || []).forEach((l, i) => comps.push({ key: `ln${i}`, patches: this.bandPatches(j, l.e - 0.15, l.e + 0.15), coef: l.g / 0.3, kmin: l.kmin ?? 1, kmax: l.kmax ?? 1 }));
    (g.bands || []).forEach((bd, i) => comps.push({ key: `bd${i}`, patches: this.bandPatches(j, bd.y1, bd.y2), coef: bd.q, kmin: bd.kmin ?? 1, kmax: bd.kmax ?? 1 }));
    const my = new Array(n).fill(0), myMax = new Array(n).fill(0), myMin = new Array(n).fill(0), mx = new Array(n).fill(0);
    for (const c of comps) {
      const r = this.response(j, c.key, c.patches);
      for (let i = 0; i < n; i++) {
        const v = c.coef * r.my[i];
        my[i] += v; mx[i] += c.coef * r.mx[i]; myMax[i] += Math.max(c.kmin * v, c.kmax * v); myMin[i] += Math.min(c.kmin * v, c.kmax * v);
      }
    }
    return { my, mx, myMax, myMin };
  }

  /** Cas Eurocode par travée : TS, UDL, trottoirs (3 et 5 kN/m²), LM2. */
  eurocode(j, alpha) {
    const deck = this.deck, { y1, y2 } = deck.g.roadway, w = y2 - y1;
    const nl = notionalLanes(w), m1 = lm1(nl.n, alpha), l2 = lm2(alpha);
    const slots = Array.from({ length: nl.n }, (_, i) => i);
    const perms = nl.n <= 3 ? permutations(slots) : permutations(slots).filter((p, i, arr) => arr.findIndex(q => q.slice(0, 3).join(',') === p.slice(0, 3).join(',')) === i);
    const arrTS = [], arrUDL = [];
    for (const s of slidePositions(y1, y2, nl.n * nl.wl, deck.laneStep)) {
      const phys = slots.map(i => ({ e1: s + i * nl.wl, e2: s + (i + 1) * nl.wl }));
      const rest = [{ e1: y1, e2: s }, { e1: s + nl.n * nl.wl, e2: y2 }].filter(r => r.e2 - r.e1 > 1e-6);
      for (const p of perms) {
        const ts = [], udl = [];
        m1.lanes.forEach((ln, i) => {
          const lane = phys[p[i]], e = 0.5 * (lane.e1 + lane.e2);
          if (ln.Q > 0) ts.push({ key: `ts|${e.toFixed(3)}`, patches: this.tsPatches(j, e), coef: ln.Q });
          if (ln.q > 0) udl.push({ key: `bd|${lane.e1.toFixed(3)}|${lane.e2.toFixed(3)}`, patches: this.bandPatches(j, lane.e1, lane.e2), coef: ln.q });
        });
        for (const r of rest) udl.push({ key: `bd|${r.e1.toFixed(3)}|${r.e2.toFixed(3)}`, patches: this.bandPatches(j, r.e1, r.e2), coef: m1.qr });
        arrTS.push(ts); arrUDL.push(udl);
      }
    }
    const fw = q => [(deck.g.footways || []).map((f, i) => ({ key: `bd|${f.y1.toFixed(3)}|${f.y2.toFixed(3)}`, patches: this.bandPatches(j, f.y1, f.y2), coef: q }))];
    const arrLM2 = slidePositions(y1 + 1 + l2.contact.y / 2, y2 - 1 - l2.contact.y / 2, 0, deck.laneStep).map(e => [{ key: `lm2|${e.toFixed(3)}`, patches: this.axlePatches(j, e, l2.contact.x, l2.contact.y, 2), coef: l2.Q }]);
    return { TS: this.envelope(j, arrTS), UDL: this.envelope(j, arrUDL), footway: this.envelope(j, fw(FOOTWAY.qfkCombi)), gr3: this.envelope(j, fw(FOOTWAY.qfk)), gr1b: this.envelope(j, arrLM2), lanes: nl };
  }

  /** Cas Fascicule 61 par travée : A(l) (voies fixes, sous-ensembles), Bc, Bt, Mc120, D240, trottoirs ; δ inclus. */
  fascicule61(j, { classe = null, nRetenue = 0, G = null } = {}) {
    const deck = this.deck, { y1, y2 } = deck.g.roadway;
    const Lr = y2 - y1, Lc = Lr - 0.5 * nRetenue, cl = classe || classePont(Lr);
    const { nv, v } = voiesF61(Lc);
    const yc1 = y1 + (Lr - Lc) / 2, yc2 = y2 - (Lr - Lc) / 2;
    const voies = Array.from({ length: nv }, (_, i) => ({ e1: yc1 + i * v, e2: yc1 + (i + 1) * v }));
    const Lj = deck.spans[j];
    const arrA = [];
    for (let mask = 1; mask < (1 << nv); mask++) {
      const list = voies.filter((_, i) => mask & (1 << i)), nvc = list.length;
      const q = chargeA(Lj, { classe: cl, nVoiesChargees: nvc, v }).q;
      arrA.push(list.map(ln => ({ key: `bd|${ln.e1.toFixed(3)}|${ln.e2.toFixed(3)}`, patches: this.bandPatches(j, ln.e1, ln.e2), coef: q })));
    }
    const gT = G ?? deck.permanent().gTotal;
    const nfMax = Math.min(nv, 5);
    const arrBc = [];
    for (let nf = 1; nf <= nfMax; nf++) {
      const bc = BC.bc[cl][nf - 1];
      for (const s of slidePositions(yc1, yc2, 2.5 * nf, deck.laneStep)) arrBc.push(Array.from({ length: nf }, (_, i) => { const e = s + 2.5 * i + 1.25; return { key: `bc|${e.toFixed(3)}`, patches: this.bcPatches(j, e), coef: bc }; }));
    }
    const SB = Math.max(nfMax * BC.bc[cl][nfMax - 1] * maxAxleLoadOnLength(BC.axlesTwoTrucks, Lj), BT.bt[cl] ? Math.min(nv, 2) * BT.bt[cl] * maxAxleLoadOnLength(BT.axles, Lj) : 0);
    const dBc = deltaDyn(Lj, gT * Lj, SB);
    const scale = (env, k) => ({ myMax: env.myMax.map(x => x * k), myMin: env.myMin.map(x => x * k), mxMax: env.mxMax.map(x => x * k), mxMin: env.mxMin.map(x => x * k) });
    const Bc = scale(this.envelope(j, arrBc), dBc);
    let Bt = null;
    if (BT.bt[cl]) {
      const arrBt = [];
      for (let nf = 1; nf <= Math.min(nv, 2); nf++) { const wb = Math.min(BT.width, Lc / nf); for (const s of slidePositions(yc1, yc2, wb * nf, deck.laneStep)) arrBt.push(Array.from({ length: nf }, (_, i) => { const e = s + wb * i + wb / 2; return { key: `bt|${e.toFixed(3)}`, patches: this.btPatches(j, e), coef: BT.bt[cl] }; })); }
      Bt = scale(this.envelope(j, arrBt), dBc);
    }
    const arrMc = slidePositions(yc1 + 2.15, yc2 - 2.15, 0, deck.laneStep).map(e => [{ key: `mc|${e.toFixed(3)}`, patches: this.mcPatches(j, e), coef: 1 }]);
    const Mc120 = scale(this.envelope(j, arrMc), deltaDyn(Lj, gT * Lj, MC120.P * Math.min(1, Lj / MC120.trackLength)));
    const arrD = slidePositions(yc1 + D240.width / 2, yc2 - D240.width / 2, 0, deck.laneStep).map(e => [{ key: `d|${e.toFixed(3)}`, patches: this.dPatches(j, e), coef: 1 }]);
    const D = this.envelope(j, arrD);
    const trott = this.envelope(j, [(deck.g.footways || []).map(f => ({ key: `bd|${f.y1.toFixed(3)}|${f.y2.toFixed(3)}`, patches: this.bandPatches(j, f.y1, f.y2), coef: TROTTOIR.q }))]);
    return { A: this.envelope(j, arrA), Bc, Bt, Mc120, D240: D, trottoir: trott, classe: cl, nv, v };
  }

  /**
   * Calcul complet : par travée, permanent + cas EC + cas F61 (+ thermique et tassements : ν·m_x).
   * @returns {{spans:{j, L, perm, ec, f61, thermal, settle}[]}}
   */
  run({ alpha, f61opt = {}, thermal = null, settle = null } = {}) {
    const deck = this.deck, spans = [];
    const gT = deck.permanent().gTotal;
    for (let j = 0; j < deck.spans.length; j++) {
      const sec = deck.beam.sectionIndex(j, 0.5);
      // profil transversal du couplage ν : forme de la réponse à une charge uniforme (nulle aux bords libres)
      const pp = this.response(j, 'pp', this.bandPatches(j, -deck.b, deck.b));
      const ref = Math.max(...pp.my.map(Math.abs));
      const shape = this.ys.map((_, i) => (ref > 1e-9 ? pp.my[i] / ref : 0));
      const nuT = (res, key) => (res ? this.ys.map((_, i) => deck.nu * res[key][sec] / (2 * deck.b) * shape[i]) : this.ys.map(() => 0));
      spans.push({
        j, L: deck.Leq[j], x: deck.Leq[j] / 2,
        perm: this.permanent(j), ec: this.eurocode(j, alpha), f61: this.fascicule61(j, { ...f61opt, G: gT }),
        thermal: { myMax: nuT(thermal, 'Mmax'), myMin: nuT(thermal, 'Mmin') }, settle: { myMax: nuT(settle, 'Mmax'), myMin: nuT(settle, 'Mmin') },
      });
    }
    return { spans, ys: this.ys };
  }
}
