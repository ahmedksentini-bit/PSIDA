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
    // séisme : nature du tablier, continuité, inerties (m⁴, rapportées au béton des appuis), liaisons par ligne
    type: ['dalle', 'poutres', 'caisson', 'mixte'].includes(d.ss_type) ? d.ss_type : 'dalle',
    continuite: d.ss_iso === 'isostatique' ? 'isostatique' : 'continu',
    Iv: +d.ss_Iv > 0 ? +d.ss_Iv : null, It: +d.ss_It > 0 ? +d.ss_It : null, fck: +d.ss_fck > 0 ? +d.ss_fck : null,
    liaisons: String(d.ss_liaisons || '').split(/[,;]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
      .map(t => (t.startsWith('fix') ? 'fixe' : t.startsWith('gli') ? 'glissant' : 'elastomere')),
  };
}

/** État minimal (pipeline) à partir des données « appuis seuls ». */
export function standaloneState(inp, supportsInput) {
  const n = inp.spans.length + 1;
  if (inp.lines.length !== n) throw new Error(`${n} lignes d'appui attendues (une par ligne, culées comprises) : ${inp.lines.length} saisies.`);
  const L = inp.lines, Ltot = inp.spans.reduce((a, v) => a + v, 0);
  const R = f => ({ Rmax: L.map(f), Rmin: L.map(() => 0) });
  const xs = [0]; inp.spans.forEach(s => xs.push(xs[xs.length - 1] + s));
  // freinage : sur la longueur chargée d'un seul tenant (une travée si les travées sont indépendantes)
  const H = brakingEC({ L: inp.continuite === 'isostatique' ? Math.max(...inp.spans) : Ltot });
  const xf = Ltot / 2;
  if (inp.liaisons && inp.liaisons.length && inp.liaisons.length !== n) throw new Error(`${n} liaisons attendues (une par ligne d'appui, culées comprises) : ${inp.liaisons.length} saisies.`);
  if (inp.liaisons && inp.liaisons.length && inp.liaisons.every(t => t === 'glissant')) throw new Error('toutes les liaisons sont glissantes : le tablier n\'est tenu horizontalement nulle part.');
  const liaison = i => (inp.liaisons && inp.liaisons[i]) || 'elastomere';
  // travées indépendantes : deux rangées d'appareils (une par about de travée) sur chaque pile
  const nbL = i => (inp.continuite === 'isostatique' && i > 0 && i < n - 1 ? 2 * inp.nb : inp.nb);
  const rows = L.map((l, i) => {
    const Qmax = Math.max(l.A, l.Bc, l.Mc120, l.TS + l.UDL) + l.trott;
    const Pmax = (l.G + Qmax) / nbL(i), Pmin = Math.max(0, l.Gmin) / nbL(i);
    const loads = { Pmax, Pmin, H: H / (nbL(i) * n), ug: (inp.epsSlow + 1e-5 * inp.dTu) * (inp.continuite === 'isostatique' ? Math.max(...inp.spans) / 2 : Math.abs(xs[i] - xf)), alpha: 0.003 + Math.abs(l.rot) };
    let sel;
    if (liaison(i) !== 'elastomere') sel = null;   // appareil à pot fixe ou glissant : hors du domaine des élastomères
    else if (inp.bearing) {
      const bd = STANDARD_BEARINGS.find(b => b.a === inp.bearing.bd.a && b.b === inp.bearing.bd.b) || { ...inp.bearing.bd, ns: [inp.bearing.n] };
      sel = { bd: { ...bd, t: inp.bearing.bd.t, ts: inp.bearing.bd.ts }, n: inp.bearing.n, T: inp.bearing.n * inp.bearing.bd.t / 1000 };
      sel.label = designation(sel.bd, sel.n); sel.hTot = totalHeight(sel.bd, sel.n);
    } else sel = selectBearing(loads);
    return { i, x: xs[i], nb: nbL(i), Rmax: l.G + Qmax, Rmin: l.Gmin, kCP: 1, kQ: 1, Pmax, sel, liaison: liaison(i), auto: !(inp.liaisons && inp.liaisons[i]) };
  });
  // liaisons non saisies où aucun élastomère fretté standard ne convient (réaction trop forte) : appareils à pot ; la ligne
  // intermédiaire la plus proche du milieu devient le point fixe si aucun point fixe n'est saisi, les autres glissent
  const notes = [], echecs = rows.filter(r => r.auto && r.liaison === 'elastomere' && !r.sel);
  if (echecs.length) {
    const xm = Ltot / 2, dejaFixe = rows.some(r => r.liaison === 'fixe');
    const inter = echecs.filter(r => r.i > 0 && r.i < n - 1), cand = (inter.length ? inter : echecs).reduce((a, r) => (Math.abs(r.x - xm) < Math.abs(a.x - xm) ? r : a));
    for (const r of echecs) {
      r.liaison = !dejaFixe && r === cand ? 'fixe' : 'glissant';
      notes.push(`ligne ${r.i + 1} : aucun élastomère fretté standard ne porte ${Math.round(r.Pmax)} kN par appareil — appareils à pot ${r.liaison === 'fixe' ? 'fixes (point fixe)' : 'glissants'} retenus (NF EN 1337-5 et -2, à dimensionner avec le fabricant)`);
    }
  }
  const width = inp.width;
  return {
    p: { concept: { epsSlow: inp.epsSlow, dTu: inp.dTu, psi: 100 }, deckInput: { lines: [{ g: inp.superstructures }], bands: [], overhangs: [0, 0], area: inp.area ?? width * inp.h } },
    deck: { b: width / 2, h: inp.h, spans: inp.spans.slice(), area: inp.area ?? width * inp.h, g: { roadway: { y1: -inp.Lc / 2, y2: inp.Lc / 2 }, overhangs: [0, 0] },
      type: inp.type || 'dalle', continuite: inp.continuite || 'continu', Iv: inp.Iv ?? null, It: inp.It ?? null, fck: inp.fck ?? null, superstructures: inp.superstructures },
    perm: { Rmax: L.map(l => l.G), Rmin: L.map(l => l.Gmin) },
    f61: { A: R(l => l.A), Bc: R(l => l.Bc), Bt: null, Mc120: L.some(l => l.Mc120 > 0) ? R(l => l.Mc120) : null, trottoir: R(l => l.trott) },
    ec: { TS: R(l => l.TS), UDL: R(l => l.UDL), gr1a: R(l => l.TS + l.UDL + 2 * l.trott), gr3: R(l => l.trott * 5 / 1.5) },
    bearings: { rows, nb: inp.nb, H, rotPerm: L.map(l => l.rot), notes },
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
