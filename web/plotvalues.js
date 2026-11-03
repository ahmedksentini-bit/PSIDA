/**
 * Valeurs numériques sous chaque graphique : un bloc repliable « Valeurs » placé juste après le conteneur Plotly, avec
 * le tableau des séries tracées (abscisse en première colonne, une colonne par courbe) et un export CSV (séparateur « ; »,
 * virgule décimale, lisible directement par un tableur réglé en français). Le tableau n'est construit qu'à l'ouverture
 * du bloc, pour ne rien coûter aux graphiques qu'on ne consulte pas.
 */

const nf = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
/** Nombre de décimales selon l'ordre de grandeur (valeurs d'une même colonne). */
function decimals(col) {
  const m = Math.max(0, ...col.filter(Number.isFinite).map(Math.abs));
  return m >= 100 ? 1 : m >= 10 ? 2 : m >= 1 ? 3 : 4;
}
const label = (t, i) => (t.name ? String(t.name) : `série ${i + 1}`) + (t.visible === 'legendonly' ? ' (masquée)' : '');
const plain = s => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
const keyOf = x => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : String(x));

/** Tableau {head, rows} à partir des traces : union des abscisses, une colonne par trace (cases vides si absente). */
function tableOf(data, layout) {
  const surf = data.find(t => t.type === 'surface');
  if (surf) {
    // surface z(y, x) : une ligne par y, une colonne par x
    const head = [plain(layout?.scene?.yaxis?.title?.text ?? layout?.scene?.yaxis?.title ?? 'y') + ' \\ x', ...surf.x.map(x => nf(x, 2))];
    const rows = surf.y.map((y, iy) => [y, ...surf.z[iy]]);
    return { head, rows, numericX: true, decs: [2, ...surf.x.map(() => decimals(surf.z.flat()))] };
  }
  const traces = data.filter(t => Array.isArray(t.y) && t.type !== 'heatmap' && t.type !== 'contour');
  if (!traces.length) return null;
  const order = [], idx = new Map();
  const numericX = traces.every(t => (t.x || []).every(x => typeof x === 'number'));
  for (const t of traces) (t.x || t.y.map((_, i) => i)).forEach(x => { const k = keyOf(x); if (!idx.has(k)) { idx.set(k, order.length); order.push(x); } });
  const perm = order.map((_, i) => i);
  if (numericX) perm.sort((a, b) => order[a] - order[b]);
  const pos = new Map(perm.map((p, r) => [p, r]));
  const rows = perm.map(p => [order[p], ...traces.map(() => null)]);
  traces.forEach((t, j) => (t.x || t.y.map((_, i) => i)).forEach((x, i) => { rows[pos.get(idx.get(keyOf(x)))][j + 1] = t.y[i]; }));
  const xTitle = plain(layout?.xaxis?.title?.text ?? layout?.xaxis?.title ?? 'x') || 'x';
  const decs = [numericX ? decimals(order) : 0, ...traces.map(t => decimals(t.y))];
  return { head: [xTitle, ...traces.map(label)], rows, numericX, decs };
}

function fmt(v, d) { return v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : typeof v === 'number' ? nf(v, d) : String(v); }

function render(box, data, layout) {
  const tb = tableOf(data, layout);
  const body = box.querySelector('.pv-body');
  if (!tb) { body.textContent = 'Pas de valeurs tabulables pour ce graphique.'; return; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const th = tb.head.map(h => `<th>${esc(h)}</th>`).join('');
  const tr = tb.rows.map(r => `<tr>${r.map((v, j) => `<td>${esc(fmt(v, tb.decs[j]))}</td>`).join('')}</tr>`).join('');
  body.innerHTML = `<div class="pv-scroll"><table class="pv-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  const btn = box.querySelector('.pv-csv');
  btn.onclick = (e) => {
    e?.preventDefault(); e?.stopPropagation();
    const q = s => (/[;"\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    const csv = [tb.head.map(q).join(';'), ...tb.rows.map(r => r.map((v, j) => q(fmt(v, Math.max(tb.decs[j], 3)))).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = (plain(layout?.title?.text ?? layout?.title ?? 'valeurs').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 60) || 'valeurs') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

/** Plotly.newPlot + bloc « Valeurs » associé (créé une fois, mis à jour à chaque nouveau tracé). */
export function plot(div, data, layout, config) {
  const res = Plotly.newPlot(div, data, layout, config);
  const el = typeof div === 'string' ? document.getElementById(div) : div;
  if (!el || !el.parentNode) return res;
  let box = el.nextElementSibling;
  if (!(box && box.classList.contains('plot-values') && box.dataset.for === (el.id || ''))) {
    box = document.createElement('details');
    box.className = 'plot-values';
    box.dataset.for = el.id || '';
    box.innerHTML = '<summary>Valeurs numériques <button type="button" class="pv-csv" title="Télécharger les valeurs (CSV, séparateur ;)">CSV</button></summary><div class="pv-body"></div>';
    el.after(box);
    box.addEventListener('toggle', () => { if (box.open && box._stale) { box._stale = false; render(box, box._data, box._layout); } });
  }
  box._data = data; box._layout = layout; box._stale = true;
  // le bouton CSV doit marcher même bloc fermé : rendu à la demande
  box.querySelector('.pv-csv').onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (box._stale) { box._stale = false; render(box, data, layout); } box.querySelector('.pv-csv').onclick(e); };
  if (box.open) { box._stale = false; render(box, data, layout); }
  return res;
}
