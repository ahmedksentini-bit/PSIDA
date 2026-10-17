import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA, notionalLanes, lm1 } from '../src/loads_ec.js';
import { voiesF61, classePont, MC120, D240 } from '../src/loads_f61.js';
import { elevationSVG, crossSectionSVG } from './svg.js';
import { envelopePlot, shearPlot, reactionPlot, kPlot, transversePlot, factorPlot, influencePlot, surfacePlot } from './plots.js';

const $ = s => document.querySelector(s);
const nums = s => s.split(/[,;\s]+/).filter(Boolean).map(Number);
const pairs = s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => nums(t));
const fmt = v => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
const cell = v => `<td class="${v < -0.05 ? 'neg' : ''}">${fmt(v)}</td>`;

let state = null;

function parseForm(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  const [y1, y2] = nums(d.roadway);
  const overhangs = nums(d.overhangs || '0,0');
  return {
    deckInput: {
      spans: nums(d.spans), width: +d.width, h: +d.h, roadway: { y1, y2 },
      area: d.area.trim() ? +d.area : undefined, overhangs: [overhangs[0] || 0, overhangs[1] || 0],
      footways: pairs(d.footways).map(([a, b]) => ({ y1: a, y2: b })),
      lines: d.lines.split(';').map(t => t.trim()).filter(Boolean).map(t => { const [g, e] = t.split('@').map(Number); return { g, e }; }),
      bands: d.bands.split(';').map(t => t.trim()).filter(Boolean).map(t => { const [q, r] = t.split('sur'); const [a, b] = nums(r); return { q: +q, y1: a, y2: b }; }),
      ys: nums(d.ys), Leq: d.Leq.trim() ? nums(d.Leq) : undefined,
      nu: +d.nu, laneStep: +d.laneStep, nSec: 20, nGrid: 100,
    },
    alpha: d.alpha, nRetenue: +d.nRetenue, classe: d.classe.trim() ? +d.classe : null, chamoaSign: !!d.chamoaSign,
  };
}

function compute(p) {
  const t0 = performance.now();
  const deck = new SlabDeck(p.deckInput);
  const keys = deck.keySections();
  const perm = deck.permanent();
  const ec = deck.eurocode({ alpha: EC_ALPHA[p.alpha] });
  const f61 = deck.fascicule61({ nRetenue: p.nRetenue, classe: p.classe });
  const cases = [
    { id: 'TS', label: 'LM1 – TS', res: ec.TS, ref: 'EC' }, { id: 'UDL', label: 'LM1 – UDL', res: ec.UDL, ref: 'EC' },
    { id: 'LM1', label: 'LM1 (TS + UDL)', res: ec.LM1, ref: 'EC' }, { id: 'gr1a', label: 'gr1a (LM1 + trottoirs 3 kN/m²)', res: ec.gr1a, ref: 'EC' },
    { id: 'gr1b', label: 'gr1b (LM2)', res: ec.gr1b, ref: 'EC' }, { id: 'gr3', label: 'gr3 (trottoirs 5 kN/m²)', res: ec.gr3, ref: 'EC' },
    { id: 'A', label: 'A(l)', res: f61.A, ref: 'F61' }, { id: 'Bc', label: 'Bc (δ inclus)', res: f61.Bc, ref: 'F61' },
    ...(f61.Bt ? [{ id: 'Bt', label: 'Bt (δ inclus)', res: f61.Bt, ref: 'F61' }] : []),
    { id: 'Mc120', label: 'Mc120 (δ inclus)', res: f61.Mc120, ref: 'F61' }, { id: 'D240', label: 'D240', res: f61.D240, ref: 'F61' },
    { id: 'trott', label: 'Trottoirs 1,5 kN/m²', res: f61.trottoir, ref: 'F61' },
  ];
  return { p, deck, keys, perm, ec, f61, cases, dt: (performance.now() - t0) / 1000 };
}

/** Charges à dessiner sur la coupe pour un cas (arrangement représentatif, voies depuis le bord y1). */
function caseLoads(st, id) {
  const { deck, ec, f61 } = st;
  const { y1, y2 } = deck.g.roadway;
  const out = [];
  if (['TS', 'UDL', 'LM1', 'gr1a', 'gr3'].includes(id)) {
    const nl = ec.lanes, m1 = ec.lm1;
    m1.lanes.forEach((ln, i) => {
      const e1 = y1 + i * nl.wl, e2 = e1 + nl.wl, e = (e1 + e2) / 2;
      if (id !== 'TS' && id !== 'gr3' && ln.q > 0) out.push({ kind: 'band', e1, e2, label: `voie ${ln.i} : ${ln.q.toFixed(1)} kN/m²` });
      if (id !== 'UDL' && id !== 'gr3' && ln.Q > 0) { out.push({ kind: 'wheel', e: e - 1 }); out.push({ kind: 'wheel', e: e + 1 }); }
    });
    if (id !== 'TS' && id !== 'gr3' && nl.wr > 0) out.push({ kind: 'band', e1: y1 + nl.n * nl.wl, e2: y2, label: `résiduel ${m1.qr.toFixed(1)}` });
    if (id === 'gr1a' || id === 'gr3') for (const fw of deck.g.footways || []) out.push({ kind: 'band', e1: fw.y1, e2: fw.y2, label: id === 'gr3' ? '5 kN/m²' : '3 kN/m²', color: '#2a8f6a' });
  } else if (id === 'gr1b') {
    const e = y1 + 1 + 0.175; out.push({ kind: 'wheel', e: e - 1, w: 0.35 }); out.push({ kind: 'wheel', e: e + 1, w: 0.35 });
  } else if (id === 'A') {
    for (let i = 0; i < f61.nv; i++) { const yc1 = y1 + (f61.Lr - f61.Lc) / 2; out.push({ kind: 'band', e1: yc1 + i * f61.v, e2: yc1 + (i + 1) * f61.v, label: `voie ${i + 1}` }); }
  } else if (id === 'Bc' || id === 'Bt') {
    const yc1 = y1 + (f61.Lr - f61.Lc) / 2, nf = id === 'Bt' ? Math.min(f61.nv, 2) : Math.min(f61.nv, 5);
    for (let i = 0; i < nf; i++) { const e = yc1 + 2.5 * i + 1.25; out.push({ kind: 'band', e1: e - 1.25, e2: e + 1.25, label: `file ${i + 1}`, opacity: 0.12 }); out.push({ kind: 'wheel', e: e - 1, w: 0.25 }); out.push({ kind: 'wheel', e: e + 1, w: 0.25 }); }
  } else if (id === 'Mc120') {
    const e = (y1 + y2) / 2, h = MC120.trackSpacing / 2;
    out.push({ kind: 'band', e1: e - h - 0.5, e2: e - h + 0.5, label: 'chenille' }); out.push({ kind: 'band', e1: e + h - 0.5, e2: e + h + 0.5, label: 'chenille' });
  } else if (id === 'D240') {
    const e = (y1 + y2) / 2; out.push({ kind: 'band', e1: e - D240.width / 2, e2: e + D240.width / 2, label: 'D240 — 3,20 m' });
  } else if (id === 'trott') {
    for (const fw of deck.g.footways || []) out.push({ kind: 'band', e1: fw.y1, e2: fw.y2, label: '1,5 kN/m²', color: '#2a8f6a' });
  }
  return out;
}

function tableEnv(st, res, title, withFactor = true) {
  const { deck, keys } = st;
  const f = withFactor ? deck.transverseFactors(res) : null;
  let h = `<details><summary>${title}</summary><table><thead><tr><th>Section</th><th>M max [kN·m]</th><th>M min</th>${withFactor ? '<th>K</th>' : ''}${deck.ys.map(y => `<th>y=${y}</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) {
    h += `<tr><td>${k.label}</td>${cell(res.Mmax[k.idx])}${cell(res.Mmin[k.idx])}${withFactor ? `<td>${f.K[k.idx].toFixed(3)}</td>` : ''}${res.mxMax[k.idx].map(cell).join('')}</tr>`;
    h += `<tr><td class="small">&nbsp;&nbsp;m_x min</td><td></td><td></td>${withFactor ? '<td></td>' : ''}${res.mxMin[k.idx].map(cell).join('')}</tr>`;
  }
  h += `</tbody></table><p class="small">R max = ${res.Rmax.map(v => v.toFixed(0)).join(' / ')} kN ; R min = ${res.Rmin.map(v => v.toFixed(0)).join(' / ')} kN${res.delta ? ' ; δ = ' + res.delta.map(v => v.toFixed(3)).join(' / ') : ''}. K = facteur de répartition transversale maximal de la section (équivalent du KTRANS de CHAMOA).</p></details>`;
  return h;
}

function renderStatic(st) {
  const { deck, keys, perm, ec, f61, p } = st;
  $('#model-info').innerHTML = `Portées équivalentes L_eq = ${deck.Leq.map(v => v.toFixed(3)).join(' / ')} m — θ = b/L_eq = ${deck.Leq.map(L => (deck.b / L).toFixed(3)).join(' / ')} — ν = ${deck.nu}.<br>
    Eurocode : ${ec.lanes.n} voie(s) de ${ec.lanes.wl.toFixed(2)} m, aire résiduelle ${ec.lanes.wr.toFixed(2)} m, ${ec.alpha.label}, ${ec.nArrangements} arrangements transversaux.
    Fascicule 61 : classe ${f61.classe}, Lc = ${f61.Lc.toFixed(2)} m, ${f61.nv} voie(s) de ${f61.v.toFixed(2)} m. Charges permanentes g = ${perm.gTotal.toFixed(1)} kN/m. Calcul en ${st.dt.toFixed(1)} s.`;
  $('#elevation').innerHTML = elevationSVG(deck, keys);
  // sélecteurs
  const sel = $('#case-select');
  sel.innerHTML = st.cases.map(c => `<option value="${c.id}">${c.ref === 'EC' ? 'EC — ' : 'F61 — '}${c.label}</option>`).join('');
  sel.value = 'LM1';
  const selSec = $('#section-select');
  selSec.innerHTML = keys.map((k, i) => `<option value="${i}">${k.label}</option>`).join('');
  const selSpan = $('#span-select');
  selSpan.innerHTML = deck.spans.map((L, j) => `<option value="${j}">Travée ${j + 1} (${L} m, L_eq ${deck.Leq[j].toFixed(2)} m)</option>`).join('');
  // enveloppes longitudinales : permanent + cas principaux
  const main = st.cases.filter(c => ['LM1', 'gr1b', 'A', 'Bc', 'Mc120', 'D240'].includes(c.id));
  envelopePlot($('#plot-M'), deck, perm, main, { invert: p.chamoaSign });
  shearPlot($('#plot-V'), deck, perm, main);
  reactionPlot($('#plot-R'), deck, perm, main);
  kPlot($('#plot-K'), deck, 0);
  // tableaux
  let h = `<details open><summary>Charges permanentes (g = ${perm.gTotal.toFixed(1)} kN/m)</summary><table><thead><tr><th>Section</th><th>M [kN·m]</th>${deck.ys.map(y => `<th>y=${y}</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) h += `<tr><td>${k.label}</td>${cell(perm.M[k.idx])}${perm.mx[k.idx].map(cell).join('')}</tr>`;
  h += `</tbody></table><p class="small">Réactions : ${perm.R.map(v => v.toFixed(0)).join(' / ')} kN</p></details>`;
  h += `<h3>Eurocodes — EN 1991-2 (valeurs caractéristiques)</h3>` + st.cases.filter(c => c.ref === 'EC').map(c => tableEnv(st, c.res, c.label)).join('');
  h += `<h3>Fascicule 61 titre II (valeurs caractéristiques, δ inclus pour B et Mc)</h3>` + st.cases.filter(c => c.ref === 'F61').map(c => tableEnv(st, c.res, c.label)).join('');
  $('#tables').innerHTML = h;
  renderCase(st); renderSection(st);
}

function renderCase(st) {
  const id = $('#case-select').value;
  const c = st.cases.find(x => x.id === id);
  const note = c.ref === 'EC' ? 'Arrangement représentatif (voies depuis le bord gauche) ; le calcul balaie toutes les positions.' : 'Arrangement représentatif ; le calcul balaie toutes les positions.';
  $('#cross').innerHTML = crossSectionSVG({ deck: st.deck, loads: caseLoads(st, id), title: `Coupe transversale — ${c.label}`, note });
  transversePlot($('#plot-mx'), st.deck, st.keys, st.perm, c.res, c.label);
  factorPlot($('#plot-f'), st.deck, st.keys, st.deck.transverseFactors(c.res), c.label);
  surfacePlot($('#plot-3d'), st.deck, c.res, $('#surface-which').value, `m_x(x, y) ${$('#surface-which').value === 'mxMax' ? 'max' : 'min'} — ${c.label} [kN·m/m]`);
}

function renderSection(st) {
  const k = st.keys[+$('#section-select').value];
  const sup = k.kind === 'support' ? k.span + 1 : (k.span === 0 ? 1 : k.span);
  influencePlot($('#plot-IL'), st.deck, k.idx, Math.min(sup, st.deck.spans.length));
}

$('#f').addEventListener('submit', ev => {
  ev.preventDefault();
  $('#results').hidden = false;
  try { state = compute(parseForm(ev.target)); renderStatic(state); $('#error').textContent = ''; }
  catch (e) { $('#error').textContent = e.stack || String(e); }
});
$('#case-select').addEventListener('change', () => state && renderCase(state));
$('#surface-which').addEventListener('change', () => state && renderCase(state));
$('#section-select').addEventListener('change', () => state && renderSection(state));
$('#span-select').addEventListener('change', () => state && kPlot($('#plot-K'), state.deck, +$('#span-select').value));
$('#btn-chamoa').addEventListener('click', () => {
  const f = $('#f');
  f.spans.value = '10, 15, 15, 10'; f.width.value = 12; f.h.value = 0.75; f.area.value = 8.91; f.overhangs.value = '0.5, 0.5';
  f.roadway.value = '-5, 5'; f.footways.value = '-6,-5 ; 5,6'; f.lines.value = '10 @ -5.85 ; 10 @ 5.85';
  f.bands.value = '0.66 sur -6,6 ; 1.92 sur -5,5 ; 0.72 sur -6,-5 ; 0.72 sur 5,6'; f.ys.value = '-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6';
  f.Leq.value = ''; f.alpha.value = 'FR2'; f.nRetenue.value = 0; f.classe.value = ''; f.nu.value = 0.2; f.chamoaSign.checked = true;
});
