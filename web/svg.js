/**
 * Schémas SVG natifs (élévation longitudinale, coupe transversale) — sans dépendance,
 * couleurs héritées du thème via currentColor et variables CSS.
 */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f2 = v => (Math.round(v * 100) / 100).toString();

/**
 * Élévation : travées, appuis, abouts, épaisseur, sections clés, points de moment nul (L_eq).
 * @param {import('../src/analysis.js').SlabDeck} deck
 * @param {{label:string, idx:number}[]} keys
 */
export function elevationSVG(deck, keys) {
  const bm = deck.beam;
  const [aL, aR] = deck.g.overhangs || [0, 0];
  const Ltot = bm.Ltot + aL + aR;
  const W = 1000, H = 230, m = { l: 40, r: 90, t: 30, b: 70 };
  const sx = x => m.l + (x + aL) / Ltot * (W - m.l - m.r);
  const hPx = Math.max(10, Math.min(28, deck.h / Ltot * (W - m.l - m.r) * 4));
  const y0 = m.t + 60;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" role="img" aria-label="Élévation longitudinale">`;
  // dalle
  s += `<rect x="${sx(-aL)}" y="${y0}" width="${sx(bm.Ltot + aR) - sx(-aL)}" height="${hPx}" fill="var(--slab, #9aa5b8)" stroke="currentColor" stroke-width="1.2"/>`;
  // appuis
  bm.x0.forEach((x, i) => {
    const X = sx(x);
    s += `<path d="M${X},${y0 + hPx} l-9,16 h18 z" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
    s += `<line x1="${X - 12}" y1="${y0 + hPx + 16}" x2="${X + 12}" y2="${y0 + hPx + 16}" stroke="currentColor"/>`;
    s += `<text x="${X}" y="${y0 + hPx + 32}" text-anchor="middle">${i === 0 ? 'C0' : i === bm.n ? 'C' + bm.n : 'P' + i}</text>`;
  });
  // cotes des travées
  const yc = y0 + hPx + 52;
  for (let j = 0; j < bm.n; j++) {
    const a = sx(bm.x0[j]), b = sx(bm.x0[j + 1]);
    s += `<line x1="${a}" y1="${yc}" x2="${b}" y2="${yc}" stroke="currentColor" stroke-width="0.8"/>`;
    s += `<line x1="${a}" y1="${yc - 5}" x2="${a}" y2="${yc + 5}" stroke="currentColor" stroke-width="0.8"/><line x1="${b}" y1="${yc - 5}" x2="${b}" y2="${yc + 5}" stroke="currentColor" stroke-width="0.8"/>`;
    s += `<text x="${(a + b) / 2}" y="${yc - 4}" text-anchor="middle">${f2(bm.spans[j])} m</text>`;
    s += `<text x="${(a + b) / 2}" y="${yc + 14}" text-anchor="middle" opacity="0.7">L_eq ${f2(deck.Leq[j])} m · θ ${(deck.b / deck.Leq[j]).toFixed(3)}</text>`;
  }
  // épaisseur
  s += `<text x="${sx(bm.Ltot + aR) + 4}" y="${y0 + hPx / 2 + 4}">h = ${f2(deck.h)} m</text>`;
  // sections clés
  for (const k of keys) {
    const X = sx(bm.sections[k.idx].x);
    s += `<line x1="${X}" y1="${y0 - 26}" x2="${X}" y2="${y0 + hPx}" stroke="var(--acc, #0b5fa5)" stroke-dasharray="3 3"/>`;
    s += `<text x="${X}" y="${y0 - 30}" text-anchor="middle" fill="var(--acc, #0b5fa5)">${esc(k.label.replace(/ \(.*\)/, ''))}</text>`;
  }
  s += `<text x="${m.l}" y="${m.t - 10}" font-weight="600">Élévation (travée équivalente : travée seule chargée, points de moment nul)</text>`;
  s += `</svg>`;
  return s;
}

/**
 * Coupe transversale : dalle, chaussée, trottoirs, charges permanentes linéiques, voies / files du cas
 * sélectionné (roues TS, files Bc/Bt, chenilles Mc120, bande D240), ordonnées de calcul.
 * @param {object} opt { deck, loads:[{kind:'wheel'|'band', e1,e2, label, color}], title, lanesLabel }
 */
export function crossSectionSVG({ deck, loads = [], title = 'Coupe transversale', note = '' }) {
  const b = deck.b, h = deck.h;
  const W = 1000, H = 300, m = { l: 50, r: 50 };
  const sy = y => m.l + (y + b) / (2 * b) * (W - m.l - m.r);
  const scale = (W - m.l - m.r) / (2 * b);
  const hPx = Math.max(16, Math.min(60, h * scale));
  const yTop = 150;
  const { y1, y2 } = deck.g.roadway;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" role="img" aria-label="${esc(title)}">`;
  s += `<text x="${m.l}" y="22" font-weight="600">${esc(title)}</text>`;
  if (note) s += `<text x="${m.l}" y="40" opacity="0.75">${esc(note)}</text>`;
  // trottoirs (bandes surélevées)
  for (const fw of deck.g.footways || []) {
    s += `<rect x="${sy(fw.y1)}" y="${yTop - 10}" width="${sy(fw.y2) - sy(fw.y1)}" height="10" fill="var(--footway, #c7ccd6)" stroke="currentColor" stroke-width="0.8"/>`;
  }
  // chaussée
  s += `<rect x="${sy(y1)}" y="${yTop - 4}" width="${sy(y2) - sy(y1)}" height="4" fill="var(--road, #4d5566)"/>`;
  // dalle
  s += `<rect x="${sy(-b)}" y="${yTop}" width="${sy(b) - sy(-b)}" height="${hPx}" fill="var(--slab, #9aa5b8)" stroke="currentColor" stroke-width="1.2"/>`;
  // charges permanentes linéiques (flèches)
  // libellés étagés quand des charges voisines se chevaucheraient (≈ 6,5 px par caractère en corps 12)
  const lastEnd = [];
  for (const l of [...(deck.g.lines || [])].sort((p, q) => p.e - q.e)) {
    const X = sy(l.e), txt = `${l.label ? l.label + ' ' : ''}${f2(l.g)} kN/m`, w = 6.5 * txt.length;
    let lev = 0; while (lev < 3 && lastEnd[lev] !== undefined && X - w / 2 < lastEnd[lev] + 6) lev++;
    lastEnd[lev] = X + w / 2;
    const yl = yTop - 52 - 14 * lev;
    s += `<line x1="${X}" y1="${yl + 4}" x2="${X}" y2="${yTop - 14}" stroke="var(--warn, #9a5b00)" stroke-width="1.6" marker-end="url(#arr)"/>`;
    s += `<text x="${X}" y="${yl}" text-anchor="middle" fill="var(--warn, #9a5b00)">${esc(txt)}</text>`;
  }
  // charges du cas (roues, bandes)
  for (const ld of loads) {
    const c = ld.color || 'var(--acc, #0b5fa5)';
    if (ld.kind === 'wheel') {
      const X = sy(ld.e), w = Math.max(8, (ld.w || 0.4) * scale);
      s += `<rect x="${X - w / 2}" y="${yTop - 22}" width="${w}" height="12" fill="${c}" opacity="0.9"/>`;
      s += `<line x1="${X}" y1="${yTop - 44}" x2="${X}" y2="${yTop - 24}" stroke="${c}" stroke-width="1.4" marker-end="url(#arr)"/>`;
    } else {
      const X1 = sy(ld.e1), X2 = sy(ld.e2);
      s += `<rect x="${X1}" y="${yTop - 34}" width="${X2 - X1}" height="22" fill="${c}" opacity="${ld.opacity || 0.25}" stroke="${c}" stroke-width="0.8"/>`;
      if (ld.label) s += `<text x="${(X1 + X2) / 2}" y="${yTop - 38}" text-anchor="middle" fill="${c}">${esc(ld.label)}</text>`;
    }
  }
  // ordonnées de calcul
  const yAx = yTop + hPx + 26;
  s += `<line x1="${sy(-b)}" y1="${yAx}" x2="${sy(b)}" y2="${yAx}" stroke="currentColor" stroke-width="0.8"/>`;
  for (const y of deck.ys) {
    const X = sy(y);
    s += `<line x1="${X}" y1="${yAx - 4}" x2="${X}" y2="${yAx + 4}" stroke="currentColor" stroke-width="0.8"/>`;
    s += `<text x="${X}" y="${yAx + 18}" text-anchor="middle">${f2(y)}</text>`;
  }
  s += `<text x="${sy(0)}" y="${yAx + 36}" text-anchor="middle" opacity="0.75">y [m] — largeur 2b = ${f2(2 * b)} m, chaussée ${f2(y2 - y1)} m</text>`;
  s += `<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>`;
  s += `</svg>`;
  return s;
}
