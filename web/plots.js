/**
 * Graphiques Plotly : enveloppes longitudinales, réactions, répartition transversale K(y) et m_x(y),
 * lignes d'influence, surface m_x(x, y). Plotly est chargé globalement par index.html.
 */
import { tableK } from '../src/guyon.js';

const PALETTE = ['#0b5fa5', '#c8552b', '#2a8f6a', '#8a4fb8', '#b8860b', '#d1335b', '#3b8ea5', '#6b6b6b', '#a65c2a', '#4e7a1e'];

function theme() {
  const cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue('--ink').trim() || '#1d2433';
  const grid = cs.getPropertyValue('--line').trim() || '#d9dee7';
  return { ink, grid };
}

function baseLayout(title, xTitle, yTitle, extra = {}) {
  const { ink, grid } = theme();
  return {
    title: { text: title, font: { size: 14 } },
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: ink, family: 'system-ui, sans-serif', size: 12 },
    margin: { l: 60, r: 20, t: 40, b: 50 },
    xaxis: { title: { text: xTitle }, gridcolor: grid, zerolinecolor: ink, zerolinewidth: 1 },
    yaxis: { title: { text: yTitle }, gridcolor: grid, zerolinecolor: ink, zerolinewidth: 1 },
    legend: { orientation: 'h', y: -0.25 },
    hovermode: 'x unified',
    ...extra,
  };
}

export const CONFIG = { responsive: true, displaylogo: false, toImageButtonOptions: { format: 'svg' }, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };

/** Enveloppes M(x) (poutre entière) et V(x), permanent + cas de trafic. */
export function envelopePlot(div, deck, perm, cases, { invert = false } = {}) {
  const xs = deck.beam.sections.map(s => s.x);
  const sgn = invert ? -1 : 1;
  const data = [];
  data.push({ x: xs, y: perm.M.map(v => sgn * v), name: 'Permanent (nominal)', line: { color: '#6b6b6b', width: 2 }, mode: 'lines' });
  cases.forEach((c, i) => {
    const col = PALETTE[i % PALETTE.length];
    data.push({ x: xs, y: c.res.Mmax.map(v => sgn * v), name: c.label + ' max', line: { color: col, width: 1.5 }, mode: 'lines', legendgroup: c.label });
    data.push({ x: xs, y: c.res.Mmin.map(v => sgn * v), name: c.label + ' min', line: { color: col, width: 1.5, dash: 'dot' }, mode: 'lines', legendgroup: c.label, showlegend: false });
  });
  const layout = baseLayout('Enveloppes des moments fléchissants — poutre entière [kN·m]' + (invert ? ' — convention CHAMOA (+ = fibre supérieure tendue)' : ' (+ = fibre inférieure tendue)'), 'x [m]', 'M [kN·m]');
  // appuis
  layout.shapes = deck.beam.x0.map(x => ({ type: 'line', x0: x, x1: x, y0: 0, y1: 1, yref: 'paper', line: { color: theme().grid, width: 1, dash: 'dash' } }));
  Plotly.newPlot(div, data, layout, CONFIG);
}

export function shearPlot(div, deck, perm, cases) {
  const xs = deck.beam.sections.map(s => s.x);
  const data = [{ x: xs, y: perm.Vm, name: 'Permanent', line: { color: '#6b6b6b', width: 2 }, mode: 'lines' }];
  cases.forEach((c, i) => {
    const col = PALETTE[i % PALETTE.length];
    data.push({ x: xs, y: c.res.Vmax, name: c.label + ' max', line: { color: col, width: 1.5 }, mode: 'lines', legendgroup: c.label });
    data.push({ x: xs, y: c.res.Vmin, name: c.label + ' min', line: { color: col, width: 1.5, dash: 'dot' }, mode: 'lines', legendgroup: c.label, showlegend: false });
  });
  const layout = baseLayout('Enveloppes des efforts tranchants — poutre entière [kN]', 'x [m]', 'V [kN]');
  layout.shapes = deck.beam.x0.map(x => ({ type: 'line', x0: x, x1: x, y0: 0, y1: 1, yref: 'paper', line: { color: theme().grid, width: 1, dash: 'dash' } }));
  Plotly.newPlot(div, data, layout, CONFIG);
}

export function reactionPlot(div, deck, perm, cases) {
  const labels = deck.beam.x0.map((_, i) => i === 0 ? 'C0' : i === deck.beam.n ? 'C' + deck.beam.n : 'P' + i);
  const data = [{ x: labels, y: perm.R, name: 'Permanent', type: 'bar', marker: { color: '#6b6b6b' } }];
  cases.forEach((c, i) => data.push({ x: labels, y: c.res.Rmax, name: c.label + ' max', type: 'bar', marker: { color: PALETTE[i % PALETTE.length] } }));
  const layout = baseLayout('Réactions d\'appui [kN]', 'Appui', 'R [kN]', { barmode: 'group', hovermode: 'closest' });
  Plotly.newPlot(div, data, layout, CONFIG);
}

/** Famille de courbes K(y) pour e = 0, b/4, b/2, 3b/4, b (travée j). */
export function kPlot(div, deck, j = 0) {
  const b = deck.b, L = deck.Leq[j];
  const ys = Array.from({ length: 61 }, (_, i) => -b + 2 * b * i / 60);
  const es = [0, 0.25, 0.5, 0.75, 1].map(r => r * b);
  const T = tableK({ b, L, es, ys, nu: deck.nu, alpha: deck.alphaTorsion });
  const data = T.map((row, i) => ({ x: ys, y: row, name: `e = ${es[i].toFixed(2)} m (${['0', 'b/4', 'b/2', '3b/4', 'b'][i]})`, mode: 'lines', line: { color: PALETTE[i], width: 1.8 } }));
  const layout = baseLayout(`Coefficients K de Guyon-Massonnet — travée ${j + 1}, θ = ${(b / L).toFixed(3)}, ν = ${deck.nu}, α = ${deck.alphaTorsion}`, 'y [m]', 'K');
  layout.shapes = [{ type: 'line', x0: -b, x1: b, y0: 1, y1: 1, line: { color: theme().grid, width: 1, dash: 'dash' } }];
  Plotly.newPlot(div, data, layout, CONFIG);
}

/** m_x(y) aux sections clés : permanent et un cas de trafic (max et min). */
export function transversePlot(div, deck, keys, perm, caseRes, caseLabel) {
  const data = [];
  keys.forEach((k, i) => {
    const col = PALETTE[i % PALETTE.length];
    data.push({ x: deck.ys, y: caseRes.mxMax[k.idx], name: `${k.label} — ${caseLabel} max`, mode: 'lines+markers', line: { color: col }, marker: { size: 5 } });
    data.push({ x: deck.ys, y: caseRes.mxMin[k.idx], name: `${k.label} — min`, mode: 'lines+markers', line: { color: col, dash: 'dot' }, marker: { size: 5 }, showlegend: false });
    data.push({ x: deck.ys, y: perm.mx[k.idx], name: `${k.label} — permanent`, mode: 'lines', line: { color: col, width: 1, dash: 'dash' }, showlegend: false, visible: 'legendonly' });
  });
  const layout = baseLayout(`Moments longitudinaux par mètre m_x(y) — ${caseLabel} [kN·m/m]`, 'y [m]', 'm_x [kN·m/m]', { hovermode: 'closest' });
  Plotly.newPlot(div, data, layout, CONFIG);
}

/** Facteur de répartition f(y) = m_x(y)/(M/2b) aux sections clés (à comparer aux KTRANS de CHAMOA). */
export function factorPlot(div, deck, keys, factors, caseLabel) {
  const data = keys.map((k, i) => ({ x: deck.ys, y: (k.kind === 'support' ? factors.fMin : factors.fMax)[k.idx], name: `${k.label} (K = ${factors.K[k.idx].toFixed(3)})`, mode: 'lines+markers', line: { color: PALETTE[i % PALETTE.length] }, marker: { size: 5 } }));
  const layout = baseLayout(`Facteur de répartition transversale f(y) = m_x(y) / (M / 2b) — ${caseLabel}`, 'y [m]', 'f', { hovermode: 'closest' });
  layout.shapes = [{ type: 'line', x0: -deck.b, x1: deck.b, y0: 1, y1: 1, line: { color: theme().grid, width: 1, dash: 'dash' } }];
  Plotly.newPlot(div, data, layout, CONFIG);
}

/** Lignes d'influence de M (section), V⁻/V⁺ et réaction d'un appui. */
export function influencePlot(div, deck, secIdx, supIdx) {
  const bm = deck.beam;
  const xs = bm.xs;
  const sec = bm.sections[secIdx];
  const data = [
    { x: xs, y: Array.from(bm.ILM[secIdx]), name: `M à x = ${sec.x.toFixed(2)} m [kN·m/kN]`, mode: 'lines', line: { color: PALETTE[0], width: 2 } },
    { x: xs, y: Array.from(bm.ILVm[secIdx]), name: 'V⁻ (gauche)', mode: 'lines', line: { color: PALETTE[1], width: 1.2 }, yaxis: 'y2' },
    { x: xs, y: Array.from(bm.ILVp[secIdx]), name: 'V⁺ (droite)', mode: 'lines', line: { color: PALETTE[1], width: 1.2, dash: 'dot' }, yaxis: 'y2' },
    { x: xs, y: Array.from(bm.ILR[supIdx]), name: `R appui ${supIdx} [kN/kN]`, mode: 'lines', line: { color: PALETTE[2], width: 1.5 }, yaxis: 'y2' },
  ];
  const layout = baseLayout('Lignes d\'influence (charge unité se déplaçant sur l\'ouvrage)', 'position de la charge x [m]', 'M [kN·m/kN]');
  layout.yaxis2 = { title: { text: 'V, R [kN/kN]' }, overlaying: 'y', side: 'right', gridcolor: 'rgba(0,0,0,0)' };
  layout.shapes = [{ type: 'line', x0: sec.x, x1: sec.x, y0: 0, y1: 1, yref: 'paper', line: { color: PALETTE[0], width: 1, dash: 'dash' } },
    ...bm.x0.map(x => ({ type: 'line', x0: x, x1: x, y0: 0, y1: 1, yref: 'paper', line: { color: theme().grid, width: 1, dash: 'dot' } }))];
  Plotly.newPlot(div, data, layout, CONFIG);
}

/** Surface m_x(x, y) d'un cas (max ou min). */
export function surfacePlot(div, deck, res, which = 'mxMax', title = '') {
  const xs = deck.beam.sections.map(s => s.x);
  const z = deck.ys.map((_, iy) => xs.map((_, s) => res[which][s][iy]));
  const data = [{ type: 'surface', x: xs, y: deck.ys, z, colorscale: which === 'mxMax' ? 'Viridis' : 'Cividis', showscale: true, colorbar: { title: 'kN·m/m', thickness: 12 } }];
  const { ink, grid } = theme();
  const layout = {
    title: { text: title, font: { size: 14 } }, paper_bgcolor: 'rgba(0,0,0,0)', font: { color: ink, size: 11 },
    margin: { l: 0, r: 0, t: 40, b: 0 }, height: 420,
    scene: { xaxis: { title: 'x [m]', gridcolor: grid }, yaxis: { title: 'y [m]', gridcolor: grid }, zaxis: { title: 'm_x [kN·m/m]', gridcolor: grid }, aspectmode: 'manual', aspectratio: { x: 2, y: 1, z: 0.6 } },
  };
  Plotly.newPlot(div, data, layout, CONFIG);
}
