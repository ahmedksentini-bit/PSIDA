/**
 * Dessin du plan de ferraillage : coupe longitudinale (nappes, filantes, renforts, ancrages, recouvrements, épingles),
 * coupes transversales (en travée et sur appui), nomenclature et métré, graphique A_s mis en place / requis.
 */
import { areaOf, massPerM } from '../src/rebar.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fr = (v, d = 2) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
const COL = { inf: 'var(--acc, #0b5fa5)', sup: 'var(--warn, #c8552b)', renf: '#2a8f6a', stir: '#8a4fb8', chev: '#b45309' };

function bubble(x, y, n, color) {
  return `<circle cx="${x}" cy="${y}" r="9" fill="var(--card, #fff)" stroke="${color}" stroke-width="1.4"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${n}</text>`;
}

/** Coupe longitudinale suivant l'axe (échelle verticale dilatée). */
export function longitudinalRebarSVG(deck, plan) {
  const W = 1100, H = 540;
  const [aL, aR] = deck.g.overhangs || [0, 0];
  const Ltot = deck.beam.Ltot + aL + aR, x0 = deck.beam.x0;
  const m = { l: 40, r: 40 }, sc = (W - m.l - m.r) / Ltot;
  const sx = x => m.l + (x + aL) * sc;
  const yT = 210, hPx = 70, yB = yT + hPx, cPx = 9;
  const yTop1 = yT + cPx, yTop2 = yT + cPx + 7, yBot1 = yB - cPx, yBot2 = yB - cPx - 7;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="11" fill="currentColor" role="img" aria-label="Coupe longitudinale du ferraillage">`;
  s += `<text x="${m.l}" y="20" font-weight="600" font-size="13">Coupe longitudinale — ferraillage longitudinal (échelle verticale dilatée)</text>`;
  s += `<text x="${m.l}" y="37" opacity="0.75">Filantes (traits pleins) et renforts intercalés (traits décalés, verts) ; arrêts sur épure décalée a_l = d = ${fr(plan.al)} m + l_bd ;</text>`;
  s += `<text x="${m.l}" y="52" opacity="0.75">recouvrements des filantes inférieures sur appuis intermédiaires ; épingles d'effort tranchant (hachures violettes).</text>`;
  s += `<rect x="${sx(-aL)}" y="${yT}" width="${Ltot * sc}" height="${hPx}" fill="var(--slab, #9aa5b8)" fill-opacity="0.35" stroke="currentColor"/>`;
  // épingles
  for (const st of plan.stirrups) { const X1 = sx(st.x1), X2 = sx(st.x2); for (let X = X1; X <= X2; X += 5) s += `<line x1="${X}" y1="${yT + 4}" x2="${X}" y2="${yB - 4}" stroke="${COL.stir}" stroke-width="0.6" opacity="0.6"/>`; }
  // appuis
  x0.forEach((x, i) => { const X = sx(x); s += `<path d="M${X},${yB} l-8,14 h16 z" fill="none" stroke="currentColor"/><text x="${X}" y="${yB + 28}" text-anchor="middle" font-weight="600">${i === 0 ? 'C0' : i === x0.length - 1 ? 'C' + i : 'P' + i}</text>`; });
  const drawBar = (mk, y, color, hookDir) => {
    const X1 = sx(mk.x1), X2 = sx(mk.x2);
    let t = `<line x1="${X1}" y1="${y}" x2="${X2}" y2="${y}" stroke="${color}" stroke-width="2.2"/>`;
    if (mk.hookL) t += `<line x1="${X1}" y1="${y}" x2="${X1}" y2="${y + hookDir * 18}" stroke="${color}" stroke-width="2.2"/>`;
    if (mk.hookR) t += `<line x1="${X2}" y1="${y}" x2="${X2}" y2="${y + hookDir * 18}" stroke="${color}" stroke-width="2.2"/>`;
    return t;
  };
  // supérieurs
  s += drawBar(plan.filTop, yTop1, COL.sup, 1);
  const lab = [];
  lab.push({ mk: plan.filTop, X: sx(deck.beam.x0[0] + deck.spans[0] * 0.5), y: yT - 64, color: COL.sup, txt: `HA${plan.filTop.phi} e=${fr(plan.filTop.s * 100, 1)} — ${plan.filTop.pieces} él., L ${fr(plan.filTop.len)} m` });
  plan.supTop.forEach((t, k) => {
    if (!t.renfort) return;
    s += drawBar(t.renfort, yTop2, COL.renf, 1);
    const X1 = sx(t.renfort.x1), X2 = sx(t.renfort.x2), yd = yT - 18 - (k % 2) * 14;
    s += `<g stroke="${COL.renf}" stroke-width="0.8"><line x1="${X1}" y1="${yd}" x2="${X2}" y2="${yd}"/><line x1="${X1}" y1="${yd - 4}" x2="${X1}" y2="${yTop2}" stroke-dasharray="2 2"/><line x1="${X2}" y1="${yd - 4}" x2="${X2}" y2="${yTop2}" stroke-dasharray="2 2"/></g>`;
    s += `<text x="${(X1 + X2) / 2}" y="${yd - 4}" text-anchor="middle" fill="${COL.renf}">${fr(x0[t.i] - t.renfort.x1)} + ${fr(t.renfort.x2 - x0[t.i])} m</text>`;
    lab.push({ mk: t.renfort, X: sx(x0[t.i]), y: yT - 64 - 18 * ((k % 2) + 1), color: COL.renf, txt: `HA${t.renfort.phi} e=${fr(t.renfort.s * 100, 1)}` });
  });
  // inférieurs
  plan.spansBot.forEach((sp, j) => {
    const y = j % 2 ? yBot1 + 3 : yBot1;
    s += drawBar(sp.filante, y, COL.inf, -1);
    lab.push({ mk: sp.filante, X: sx(x0[j] + deck.spans[j] * 0.3), y: yB + 84 + (j % 2) * 22, color: COL.inf, txt: `HA${sp.filante.phi} e=${fr(sp.filante.s * 100, 1)}, L ${fr(sp.filante.len)} m${sp.filante.pieces > 1 ? ` (${sp.filante.pieces} él.)` : ''}` });
    if (sp.renfort) {
      s += drawBar(sp.renfort, yBot2, COL.renf, -1);
      const X1 = sx(sp.renfort.x1), X2 = sx(sp.renfort.x2), yd = yB + 44;
      s += `<g stroke="${COL.renf}" stroke-width="0.8"><line x1="${X1}" y1="${yd}" x2="${X2}" y2="${yd}"/><line x1="${X1}" y1="${yBot2}" x2="${X1}" y2="${yd + 4}" stroke-dasharray="2 2"/><line x1="${X2}" y1="${yBot2}" x2="${X2}" y2="${yd + 4}" stroke-dasharray="2 2"/></g>`;
      s += `<text x="${(X1 + X2) / 2}" y="${yd + 13}" text-anchor="middle" fill="${COL.renf}">x ${fr(sp.renfort.x1)} → ${fr(sp.renfort.x2)} m</text>`;
      lab.push({ mk: sp.renfort, X: sx(x0[j] + deck.spans[j] * 0.65), y: yB + 128 + (j % 2) * 22, color: COL.renf, txt: `HA${sp.renfort.phi} e=${fr(sp.renfort.s * 100, 1)}, L ${fr(sp.renfort.len)} m` });
    }
  });
  for (const l of lab) {
    const yBar = l.mk.face === 'sup' ? (l.mk.role === 'filante' ? yTop1 : yTop2) : (l.mk.role === 'filante' ? yBot1 : yBot2);
    s += `<line x1="${l.X}" y1="${l.y + (l.y < yT ? 9 : -9)}" x2="${l.X}" y2="${yBar}" stroke="${l.color}" stroke-width="0.6" opacity="0.7"/>`;
    s += bubble(l.X, l.y, l.mk.mark, l.color) + `<text x="${l.X + 13}" y="${l.y + 4}" fill="${l.color}">${esc(l.txt)}</text>`;
  }
  s += `<text x="${m.l}" y="${H - 10}" opacity="0.75">Repères = numéros de la nomenclature. Retours (crosses) aux extrémités au-delà des appuis d'extrémité (guide § 3.4.8). Longueurs mesurées suivant l'axe.</text>`;
  return s + `</svg>`;
}

/** Coupe transversale à l'abscisse x : barres longitudinales (points) et transversales (traits). */
export function crossRebarSVG(deck, plan, x, title) {
  const onLine = q => Math.abs(deck.beam.x0[q.support] - x) < 1e-6;
  const chev = (plan.chevMarks || []).filter(onLine), chevB = (plan.chevBands || []).filter(onLine);
  const onPier = deck.beam.x0.slice(1, -1).some(xa => Math.abs(xa - x) < 1e-6);
  const W = 1100, H = 250 + (onPier ? 16 : 0) + (chevB.length ? 22 : 0);
  const b = deck.b, h = deck.h, m = { l: 60, r: 60 }, sc = (W - m.l - m.r) / (2 * b);
  const sy = y => m.l + (y + b) * sc, hPx = Math.max(40, Math.min(90, h * sc * 1.6)), yT = 90, yB = yT + hPx;
  const c = 0.03 * hPx / h + 6;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="11" fill="currentColor" role="img" aria-label="${esc(title)}">`;
  s += `<text x="${m.l}" y="20" font-weight="600" font-size="13">${esc(title)}</text>`;
  const ch = deck.g.chamfer;
  if (ch && ch.hEdge < h) { const hE = ch.hEdge / h * hPx, j = ch.joue * sc; s += `<polygon points="${sy(-b)},${yT} ${sy(b)},${yT} ${sy(b)},${yT + hE} ${sy(b) - j},${yB} ${sy(-b) + j},${yB} ${sy(-b)},${yT + hE}" fill="var(--slab, #9aa5b8)" fill-opacity="0.35" stroke="currentColor"/>`; }
  else s += `<rect x="${sy(-b)}" y="${yT}" width="${2 * b * sc}" height="${hPx}" fill="var(--slab, #9aa5b8)" fill-opacity="0.35" stroke="currentColor"/>`;
  const active = (mk) => mk && x >= mk.x1 - 1e-9 && x <= mk.x2 + 1e-9;
  // ordonnée de la sous-face (chanfreins : les aciers inférieurs suivent la sous-face)
  const underside = yy => { if (!(ch && ch.hEdge < h)) return yB; const dEdge = b - Math.abs(yy); if (dEdge >= ch.joue) return yB; return yT + (ch.hEdge + (h - ch.hEdge) * dEdge / ch.joue) / h * hPx; };
  const dots = (mk, y, color, offset) => {
    let t = ''; const n = Math.floor((2 * b - 0.06) / mk.s) + 1, y0 = -b + 0.03 + offset;
    for (let k = 0; k < n; k++) { const yy = y0 + k * mk.s; if (yy > b - 0.03) break; const yv = mk.face === 'inf' ? Math.min(y, underside(yy) - c) : y; t += `<circle cx="${sy(yy)}" cy="${yv}" r="${Math.max(2.2, mk.phi / 8)}" fill="${color}"/>`; }
    return t;
  };
  const topF = plan.filTop, topR = plan.supTop.map(t => t.renfort).find(active);
  const sp = plan.spansBot.find(q => active(q.filante) && x >= deck.beam.x0[q.j] - 1e-9 && x <= deck.beam.x0[q.j + 1] + 1e-9) || plan.spansBot.find(q => active(q.filante));
  const botF = sp && sp.filante, botR = sp && active(sp.renfort) ? sp.renfort : null;
  // transversaux (travée de la section)
  const j = sp ? sp.j : 0;
  const tInf = plan.transMarks.find(t => t.span === j && t.face === 'inf'), tSup = plan.transMarks.find(t => t.span === j && t.face === 'sup');
  if (tSup) s += `<line x1="${sy(-b) + 4}" y1="${yT + c + 5}" x2="${sy(b) - 4}" y2="${yT + c + 5}" stroke="${COL.sup}" stroke-width="1.2" stroke-dasharray="6 2"/>`;
  if (tInf) { const pts = []; for (let k = 0; k <= 60; k++) { const yy = -b + 0.04 + (2 * b - 0.08) * k / 60; pts.push(`${sy(yy)},${Math.min(yB - c - 5, underside(yy) - c - 5)}`); } s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${COL.inf}" stroke-width="1.2" stroke-dasharray="6 2"/>`; }
  // chevêtre incorporé (section sur une ligne d'appui) : barres parallèles à la ligne d'appui, vues sur toute leur longueur
  const cs = chev.filter(m => m.face === 'sup'), ci = chev.filter(m => m.face === 'inf');
  if (cs.length) s += `<line x1="${sy(-b) + 4}" y1="${yT + c + 9}" x2="${sy(b) - 4}" y2="${yT + c + 9}" stroke="${COL.chev}" stroke-width="2.4"/>`;
  if (ci.length) { const pts = []; for (let k = 0; k <= 60; k++) { const yy = -b + 0.04 + (2 * b - 0.08) * k / 60; pts.push(`${sy(yy)},${Math.min(yB - c - 9, underside(yy) - c - 9)}`); } s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${COL.chev}" stroke-width="2.4"/>`; }
  s += dots(topF, yT + c, COL.sup, 0);
  if (topR) s += dots(topR, yT + c, COL.renf, topR.s / 2);
  if (botF) s += dots(botF, yB - c, COL.inf, 0);
  if (botR) s += dots(botR, yB - c, COL.renf, botR.s / 2);
  const AsTop = areaOf(topF.phi) / topF.s + (topR ? areaOf(topR.phi) / topR.s : 0), AsBot = botF ? areaOf(botF.phi) / botF.s + (botR ? areaOf(botR.phi) / botR.s : 0) : 0;
  s += `<text x="${m.l}" y="${yT - 30}" fill="${COL.sup}">Nappe supérieure : ${bubbleTxt(topF)}${topR ? ` + ${bubbleTxt(topR)} intercalés` : ''} = ${fr(AsTop * 1e4, 1)} cm²/m${tSup ? ` ; transversaux ${bubbleTxt(tSup)}` : ''}</text>`;
  s += `<text x="${m.l}" y="${yB + 30}" fill="${COL.inf}">Nappe inférieure : ${botF ? bubbleTxt(botF) : '—'}${botR ? ` + ${bubbleTxt(botR)} intercalés` : ''} = ${fr(AsBot * 1e4, 1)} cm²/m${tInf ? ` ; transversaux ${bubbleTxt(tInf)}` : ''}</text>`;
  if (chevB.length) {
    const comp = chevB.filter(q => q.mark), ok = chevB.filter(q => !q.mark).map(q => q.band);
    const t1 = comp.map(q => `${q.band} ${bubbleTxt(q.mark)} en complément${q.courant ? ` de (${q.courant.mark})` : ''}`).join(', ');
    s += `<text x="${m.l}" y="${yB + (onPier ? 82 : 66)}" fill="${COL.chev}" font-weight="600">Chevêtre incorporé (annexe 4 § 6.2, enveloppe avec les transversaux) — ${t1 || 'aucun complément'}${ok.length ? ` ; ${ok.join(' ')} : transversaux courants suffisants` : ''}</text>`;
  }
  const lapNote = deck.beam.x0.slice(1, -1).some(xa => Math.abs(xa - x) < 1e-6) ? ' Sur appui intermédiaire : recouvrement des filantes inférieures des deux travées (une seule nappe représentée).' : '';
  s += `<text x="${m.l}" y="${yB + 48}" opacity="0.75">Section à x = ${fr(x)} m ; cadres de chaînage des bords libres sur une largeur h ; enrobage à l'axe ${fr(plan.c * 100, 1)} cm (schématique).</text>`;
  if (lapNote) s += `<text x="${m.l}" y="${yB + 64}" opacity="0.75">${lapNote.trim()}</text>`;
  return s + `</svg>`;
}
const bubbleTxt = mk => `(${mk.mark}) HA${mk.phi} e=${fr(mk.s * 100, 1)}`;

/** Nomenclature (repère, φ, espacement, longueur, nombre, longueur totale, masse). */
export function scheduleHTML(plan) {
  let h = `<table><thead><tr><th>Rep.</th><th>Désignation</th><th>Nappe</th><th>φ [mm]</th><th>e [cm]</th><th>Long. unitaire [m]</th><th>Éléments</th><th>Nombre</th><th>Long. totale [m]</th><th>Masse [kg]</th><th>Observations</th></tr></thead><tbody>`;
  for (const m of plan.marks) h += `<tr><td><b>${m.mark}</b></td><td style="text-align:left">${esc(m.label)}</td><td>${m.face}</td><td>HA${m.phi}</td><td>${fr(m.s * 100, 1)}</td><td>${fr(m.len)}</td><td>${m.pieces}</td><td>${m.count}</td><td>${fr(m.count * m.totalLen, 0)}</td><td>${fr(m.mass, 0)}</td><td style="white-space:normal;text-align:left" class="small">${esc(m.note || '')}</td></tr>`;
  const byPhi = {};
  for (const m of plan.marks) byPhi[m.phi] = (byPhi[m.phi] || 0) + m.mass;
  h += `</tbody><tfoot><tr><th colspan="9" style="text-align:right">Total</th><th>${fr(plan.totalMass, 0)}</th><th class="small">${fr(plan.ratio, 0)} kg/m³ de béton (${fr(plan.volume, 0)} m³)</th></tr></tfoot></table>`;
  h += `<p class="small">Récapitulatif par diamètre : ${Object.keys(byPhi).sort((a, b) => a - b).map(p => `HA${p} ${fr(byPhi[p] / 1000, 2)} t`).join(' ; ')}. Masses théoriques (7 850 kg/m³), longueurs unitaires hors façonnage, recouvrements des éléments de plus de 12 m inclus.</p>`;
  return h;
}

/** A_s mis en place / requis (épure brute et décalée). */
export function providedPlot(div, deck, plan) {
  const xs = plan.check.map(r => r.x), cm = a => a.map(v => v * 1e4);
  const data = [
    { x: xs, y: cm(plan.check.map(r => r.reqBot)), name: 'inf. requis', mode: 'lines', line: { color: '#0b5fa5', width: 1.5, dash: 'dot' } },
    { x: xs, y: cm(plan.check.map(r => r.shBot)), name: 'inf. requis, épure décalée', mode: 'lines', line: { color: '#0b5fa5', width: 1.5 } },
    { x: xs, y: cm(plan.check.map(r => r.provBot)), name: 'inf. mis en place', mode: 'lines', line: { color: '#0b5fa5', width: 3, shape: 'hv' }, fill: 'tozeroy', fillcolor: 'rgba(11,95,165,0.10)' },
    { x: xs, y: cm(plan.check.map(r => -r.reqTop)), name: 'sup. requis', mode: 'lines', line: { color: '#c8552b', width: 1.5, dash: 'dot' } },
    { x: xs, y: cm(plan.check.map(r => -r.shTop)), name: 'sup. requis, épure décalée', mode: 'lines', line: { color: '#c8552b', width: 1.5 } },
    { x: xs, y: cm(plan.check.map(r => -r.provTop)), name: 'sup. mis en place', mode: 'lines', line: { color: '#c8552b', width: 3, shape: 'hv' }, fill: 'tozeroy', fillcolor: 'rgba(200,85,43,0.10)' },
  ];
  const cs = getComputedStyle(document.documentElement), ink = cs.getPropertyValue('--ink').trim() || '#1d2433', grid = cs.getPropertyValue('--line').trim() || '#d9dee7';
  Plotly.newPlot(div, data, { title: { text: 'A_s mis en place et requis [cm²/m] (supérieur vers le bas)', font: { size: 14 } }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: ink, size: 12 },
    margin: { l: 60, r: 20, t: 40, b: 50 }, xaxis: { title: { text: 'x [m]' }, gridcolor: grid }, yaxis: { title: { text: 'A_s [cm²/m]' }, gridcolor: grid }, legend: { orientation: 'h', y: -0.25 }, hovermode: 'x unified',
    shapes: deck.beam.x0.map(x => ({ type: 'line', x0: x, x1: x, y0: 0, y1: 1, yref: 'paper', line: { color: grid, width: 1, dash: 'dash' } })) }, { responsive: true, displaylogo: false });
}
