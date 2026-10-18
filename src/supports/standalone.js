/**
 * « Appuis seuls » : calcul des appuis et fondations pour un tablier quelconque (ponts à poutres, caissons, dalles
 * précontraintes…) à partir des réactions par ligne d'appui saisies par l'utilisateur (valeurs caractéristiques, δ inclus),
 * au lieu des réactions calculées par le module pont-dalle. Construit un état minimal compatible avec computeSupports et
 * toPontEC8 (séisme).
 * Unités : m, kN, rad.
 */
import { brakingEC, selectBearing, designation, totalHeight, STANDARD_BEARINGS } from '../bearings.js';
import { computeSupports } from './index.js';

const nums = s => String(s ?? '').split(/[,;\s]+/).filter(Boolean).map(Number);

/**
 * Lecture du formulaire « appuis seuls ».
 * Lignes : « G ; G_min ; A ; Bc ; Mc120 ; trottoirs ; TS ; UDL [; rotation permanente] » (kN, une ligne par ligne d'appui).
 * Appareils : « auto » ou « a×b×n(t+ts) » en mm (ex. 300×400×3(10+3)).
 */
export function parseStandalone(d) {
  const rows = String(d.ss_lines || '').split('\n').map(t => t.trim()).filter(Boolean).map(t => nums(t.replace(/;/g, ' ')));
  const m = String(d.ss_bearing || 'auto').match(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*\(\s*(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*\)/);
  return {
    spans: nums(d.ss_spans), width: +d.ss_width || 10, h: +d.ss_h || 1.0, area: +d.ss_area || null, superstructures: +d.ss_super || 0,
    Lc: +d.ss_Lc || (+d.ss_width || 10) - 2, nb: +d.ss_nb || 2,
    bearing: m ? { bd: { a: +m[1], b: +m[2], t: +m[4], ts: +m[5] }, n: +m[3] } : null,
    lines: rows.map(r => ({ G: r[0] || 0, Gmin: r[1] ?? r[0] ?? 0, A: r[2] || 0, Bc: r[3] || 0, Mc120: r[4] || 0, trott: r[5] || 0, TS: r[6] || 0, UDL: r[7] || 0, rot: r[8] || 0 })),
    epsSlow: +(d.epsSlow || 2.5e-4), dTu: +(d.dTu || 30),
  };
}

/** État minimal (pipeline) à partir des données « appuis seuls ». */
export function standaloneState(inp, supportsInput) {
  const n = inp.spans.length + 1;
  if (inp.lines.length !== n) throw new Error(`${n} lignes d'appui attendues (une par ligne, culées comprises) : ${inp.lines.length} saisies.`);
  const L = inp.lines, Ltot = inp.spans.reduce((a, v) => a + v, 0);
  const R = f => ({ Rmax: L.map(f), Rmin: L.map(() => 0) });
  const xs = [0]; inp.spans.forEach(s => xs.push(xs[xs.length - 1] + s));
  const H = brakingEC({ L: Ltot });
  const xf = Ltot / 2;
  const rows = L.map((l, i) => {
    const Qmax = Math.max(l.A, l.Bc, l.Mc120, l.TS + l.UDL) + l.trott;
    const Pmax = (l.G + Qmax) / inp.nb, Pmin = Math.max(0, l.Gmin) / inp.nb;
    const loads = { Pmax, Pmin, H: H / (inp.nb * n), ug: (inp.epsSlow + 1e-5 * inp.dTu) * Math.abs(xs[i] - xf), alpha: 0.003 + Math.abs(l.rot) };
    let sel;
    if (inp.bearing) {
      const bd = STANDARD_BEARINGS.find(b => b.a === inp.bearing.bd.a && b.b === inp.bearing.bd.b) || { ...inp.bearing.bd, ns: [inp.bearing.n] };
      sel = { bd: { ...bd, t: inp.bearing.bd.t, ts: inp.bearing.bd.ts }, n: inp.bearing.n, T: inp.bearing.n * inp.bearing.bd.t / 1000 };
      sel.label = designation(sel.bd, sel.n); sel.hTot = totalHeight(sel.bd, sel.n);
    } else sel = selectBearing(loads);
    return { i, x: xs[i], nb: inp.nb, Rmax: l.G + Qmax, Rmin: l.Gmin, kCP: 1, kQ: 1, Pmax, sel };
  });
  const width = inp.width;
  return {
    p: { concept: { epsSlow: inp.epsSlow, dTu: inp.dTu, psi: 100 }, deckInput: { lines: [{ g: inp.superstructures }], bands: [], overhangs: [0, 0], area: inp.area ?? width * inp.h } },
    deck: { b: width / 2, h: inp.h, spans: inp.spans.slice(), area: inp.area ?? width * inp.h, g: { roadway: { y1: -inp.Lc / 2, y2: inp.Lc / 2 }, overhangs: [0, 0] } },
    perm: { Rmax: L.map(l => l.G), Rmin: L.map(l => l.Gmin) },
    f61: { A: R(l => l.A), Bc: R(l => l.Bc), Bt: null, Mc120: L.some(l => l.Mc120 > 0) ? R(l => l.Mc120) : null, trottoir: R(l => l.trott) },
    ec: { TS: R(l => l.TS), UDL: R(l => l.UDL), gr1a: R(l => l.TS + l.UDL + 2 * l.trott), gr3: R(l => l.trott * 5 / 1.5) },
    bearings: { rows, nb: inp.nb, H, rotPerm: L.map(l => l.rot) },
    standalone: true,
  };
}

/** Calcul complet « appuis seuls ». */
export function computeStandalone(inp, supportsInput) {
  const st = standaloneState(inp, supportsInput);
  st.p.supports = supportsInput;
  st.supports = computeSupports(st, supportsInput);
  return st;
}
