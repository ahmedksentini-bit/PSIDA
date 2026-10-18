/**
 * Figures SVG des notes de calcul et des onglets (rendu natif, sans Plotly : identiques à l'écran, dans la note HTML et,
 * converties en PNG, dans la note Word). Graphiques tracés avec la boîte à outils de figures du bureau de calcul
 * fond.ksr-infra.org (src/vendor/fond-figures.js) ; schémas d'appui dessinés ici.
 */
import { graphe, pasJoli, COULEURS, svg, texte, ligne, figureContraintes } from '../src/vendor/fond-figures.js';
import { elevationSVG } from './svg.js';
import { guideElevationSVG, guideCrossSectionSVG } from './guide_schema.js';
import { longitudinalRebarSVG, crossRebarSVG } from './rebarplan.js';

const PAL = ['#0369a1', '#dc2626', '#0f766e', '#b45309', '#7c3aed', '#64748b', '#0891b2', '#be185d'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = v => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—');
const f2 = v => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—');
export const svgBlock = (svgStr, caption) => ({ t: 'svg', svg: svgStr, caption });

/** Graphique de courbes : bornes arrondies, zéro inclus, légende sous le graphique. */
export function lineChart({ titre = '', xlabel = '', ylabel = '', series, invertY = false, zones = [], marques = [], largeur = 680, hauteur = 300, includeZero = true, xRange = null }) {
  const pts = series.flatMap(s => s.points).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!pts.length) return '';
  let [x0, x1] = xRange || [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))];
  let y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  if (includeZero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 - y0 < 1e-12) { y1 += 1; y0 -= 1; }
  const py = pasJoli(y1 - y0, 6); y0 = Math.floor(y0 / py - 1e-9) * py; y1 = Math.ceil(y1 / py + 1e-9) * py;
  if (x1 - x0 < 1e-12) x1 = x0 + 1;
  return graphe({ largeur, hauteur, xmin: x0, xmax: x1, ymin: y0, ymax: y1, xlabel, ylabel, titre, inverserY: invertY, zones, marques,
    series: series.map((s, k) => ({ points: s.points, couleur: s.couleur || PAL[k % PAL.length], tirets: s.tirets, epaisseur: s.epaisseur ?? 2, libelle: s.libelle, marqueurs: s.marqueurs })) });
}

/** Histogramme groupé (catégories × séries). */
export function barChart({ titre = '', cats, series, ylabel = '', largeur = 680, hauteur = 280 }) {
  const all = series.flatMap(s => s.values).filter(Number.isFinite);
  if (!all.length) return '';
  let y0 = Math.min(0, ...all), y1 = Math.max(0, ...all);
  const py = pasJoli(y1 - y0 || 1, 5); y0 = Math.floor(y0 / py) * py; y1 = Math.ceil(y1 / py) * py || py;
  const g = { l: 64, r: 14, t: 14, b: 46 }, W = largeur - g.l - g.r, H = hauteur - g.t - g.b;
  const Y = v => g.t + H - (v - y0) / (y1 - y0) * H, n = cats.length, m = series.length, cw = W / n, bw = Math.min(34, cw * 0.8 / m);
  const legH = 20;
  return svg({ largeur, hauteur: hauteur + legH, titre, contenu: () => {
    let s = '';
    for (let v = y0; v <= y1 + 1e-9; v += py) { s += ligne(g.l, Y(v), g.l + W, Y(v), COULEURS.grille, 1); s += texte(g.l - 7, Y(v) + 4, f1(v), 'text-anchor="end" class="pt"'); }
    cats.forEach((c, i) => {
      const xc = g.l + cw * (i + 0.5);
      series.forEach((se, k) => {
        const v = se.values[i]; if (!Number.isFinite(v)) return;
        const x = xc - (m * bw) / 2 + k * bw, yv = Y(Math.max(v, 0)), h = Math.abs(Y(v) - Y(0));
        s += `<rect x="${x.toFixed(1)}" y="${(v >= 0 ? yv : Y(0)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${se.couleur || PAL[k % PAL.length]}"/>`;
        if (m <= 3) s += texte(x + bw / 2 - 1, (v >= 0 ? yv - 3 : Y(v) + 11), f1(v), 'text-anchor="middle" style="font-size:9.5px"');
      });
      s += texte(xc, g.t + H + 15, c, 'text-anchor="middle" class="pt"');
    });
    s += ligne(g.l, Y(0), g.l + W, Y(0), COULEURS.trait, 1.2);
    s += `<rect x="${g.l}" y="${g.t}" width="${W}" height="${H}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.1"/>`;
    s += `<text transform="translate(14 ${g.t + H / 2}) rotate(-90)" text-anchor="middle" style="font-weight:700">${esc(ylabel)}</text>`;
    let lx = g.l; series.forEach((se, k) => { s += `<rect x="${lx}" y="${hauteur + 2}" width="14" height="10" fill="${se.couleur || PAL[k % PAL.length]}"/>`; s += texte(lx + 18, hauteur + 11, se.libelle, 'style="font-size:11px;font-weight:700"'); lx += 30 + se.libelle.length * 6.2; });
    return s;
  } });
}

// ===================================================================================================== tablier
/**
 * Figures du tablier pour la note globale : données (élévation, coupe), lignes d'influence, enveloppes de M et de V,
 * réactions, sections d'acier requises, plans de ferraillage.
 */
export function deckFigures(st, ref = 'EC') {
  const { deck, perm } = st, bm = deck.beam, xs = bm.sections.map(s => s.x), isF = ref === 'F61';
  const d = isF ? st.design.F61 : st.design.EC, B = d.beam, sls = isF ? 'ELS' : 'CAR', slsLab = isF ? 'ELS' : 'ELS car.';
  const out = { data: [], il: [], M: [], V: [], R: [], As: [], rebar: [] };
  // données : élévation et coupe dans la représentation du guide SETRA 1989, puis élévation de calcul (sections étudiées)
  const gg = { ...deck.g, spans: deck.spans, h: deck.h, width: 2 * deck.b, lines: deck.g.lines || [], bands: deck.g.bands || [], ys: deck.g.ys || [] };
  try { out.data.push(svgBlock(guideElevationSVG(gg, st.supports?.sp || st.p?.supports || null), 'Élévation de l\'ouvrage (représentation du guide SETRA « Ponts-dalles », 1989)')); } catch (e) { /* schéma non disponible */ }
  try { out.data.push(svgBlock(guideCrossSectionSVG(gg), 'Coupe transversale : dalle, chaussée et voies, trottoirs, charges de superstructure, appareils d\'appui')); } catch (e) { /* idem */ }
  try { out.data.push(svgBlock(elevationSVG(deck, st.keys), 'Modèle de calcul : travées, appuis, sections étudiées')); } catch (e) { /* idem */ }
  // lignes d'influence : moment à mi-travée 1 et sur le premier appui intermédiaire, réaction de cet appui
  try {
    const iMid = bm.sectionIndex(0, 0.5), iSup = bm.n > 1 ? bm.supportSectionIndex(1) : bm.sectionIndex(0, 0.25);
    const xsIL = Array.from(bm.xs);
    const ser = [{ points: xsIL.map((x, k) => [x, bm.ILM[iMid][k]]), libelle: `M à mi-travée 1 (x = ${f2(xs[iMid])} m) [kN·m/kN]` }];
    if (bm.n > 1) ser.push({ points: xsIL.map((x, k) => [x, bm.ILM[iSup][k]]), libelle: `M sur l'appui P1 (x = ${f2(xs[iSup])} m)`, tirets: '6 3' });
    out.il.push(svgBlock(lineChart({ xlabel: 'position de la charge unité x [m]', ylabel: 'M [kN·m/kN]', series: ser }), 'Lignes d\'influence des moments fléchissants'));
    if (bm.ILR && bm.n > 1) out.il.push(svgBlock(lineChart({ xlabel: 'position de la charge unité x [m]', ylabel: 'R [kN/kN]', series: [{ points: xsIL.map((x, k) => [x, bm.ILR[1][k]]), libelle: 'Réaction de l\'appui P1' }], hauteur: 240 }), 'Ligne d\'influence de la réaction d\'un appui intermédiaire'));
  } catch (e) { /* lignes d'influence indisponibles */ }
  const ptsOf = arr => xs.map((x, k) => [x, arr[k]]);
  out.M.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'M [kN·m] (largeur totale)', series: [
    { points: ptsOf(perm.M), libelle: 'permanentes', couleur: PAL[5] },
    { points: ptsOf(B.M.ELUmax), libelle: 'ELU max', couleur: PAL[1] }, { points: ptsOf(B.M.ELUmin), libelle: 'ELU min', couleur: PAL[1], tirets: '5 3' },
    { points: ptsOf(B.M[`${sls}max`]), libelle: `${slsLab} max`, couleur: PAL[0] }, { points: ptsOf(B.M[`${sls}min`]), libelle: `${slsLab} min`, couleur: PAL[0], tirets: '5 3' }] }),
  `Enveloppes des moments fléchissants — ${isF ? 'Fascicule 61 / BAEL' : 'Eurocodes'}`));
  out.V.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'V [kN] (largeur totale)', series: [
    { points: ptsOf(B.V.ELUmax), libelle: 'ELU max', couleur: PAL[1] }, { points: ptsOf(B.V.ELUmin), libelle: 'ELU min', couleur: PAL[1], tirets: '5 3' },
    { points: ptsOf(B.V[`${sls}max`]), libelle: `${slsLab} max`, couleur: PAL[0] }, { points: ptsOf(B.V[`${sls}min`]), libelle: `${slsLab} min`, couleur: PAL[0], tirets: '5 3' }] }),
  'Enveloppes des efforts tranchants'));
  const sup = bm.x0.map((_, i) => (i === 0 ? 'C0' : i === bm.n ? `C${bm.n}` : `P${i}`));
  out.R.push(svgBlock(barChart({ cats: sup, ylabel: 'R [kN]', series: [{ libelle: 'permanentes', values: perm.R, couleur: PAL[5] }, { libelle: `${slsLab} max`, values: B.R[`${sls}max`], couleur: PAL[0] }, { libelle: 'ELU max', values: B.R.ELUmax, couleur: PAL[1] }] }), 'Réactions d\'appui (largeur totale)'));
  try {
    const bot = d.envBot.map(v => (Array.isArray(v) ? Math.max(...v) : v) * 1e4), top = d.envTop.map(v => (Array.isArray(v) ? Math.max(...v) : v) * 1e4);
    out.As.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'A_s [cm²/m]', series: [{ points: ptsOf(bot), libelle: 'nappe inférieure', couleur: PAL[1] }, { points: ptsOf(top), libelle: 'nappe supérieure', couleur: PAL[0] }] }), 'Sections d\'acier longitudinales requises (fibre la plus sollicitée)'));
  } catch (e) { /* sections non disponibles */ }
  if (st.rebar) {
    try { out.rebar.push(svgBlock(longitudinalRebarSVG(deck, st.rebar), 'Plan de ferraillage longitudinal')); } catch (e) { /* plan indisponible */ }
    try { out.rebar.push(svgBlock(crossRebarSVG(deck, st.rebar, bm.x0[0] + deck.spans[0] / 2, 'Coupe transversale — mi-travée 1'), 'Ferraillage — coupe à mi-travée 1')); } catch (e) { /* idem */ }
    if (bm.n > 1) try { out.rebar.push(svgBlock(crossRebarSVG(deck, st.rebar, bm.x0[1], 'Coupe transversale — appui P1'), 'Ferraillage — coupe sur l\'appui P1')); } catch (e) { /* idem */ }
  }
  return out;
}

// ===================================================================================================== appuis
/**
 * Schéma d'un appui à l'échelle : fût (voile ou colonnes), chevêtre, garde-grève, semelle, pieux (inclinés), terrain
 * naturel, remblai, niveau des plus hautes eaux et fond affouillé, cotes principales.
 */
export function supportSchema(sup, L, code = 'EC') {
  const sp = sup.sp, end = L.kind === 'culee', F = sp.found, r = L[code], found = r.found;
  const col = end ? sp.culee.type !== 'remblayee' : sp.pile.type === 'colonnes';
  const Hf = end ? sp.culee.Hm : (Array.isArray(sp.pile.H) ? sp.pile.H[Math.min(sp.pile.H.length - 1, L.i - 1)] : sp.pile.H);
  const hc = end ? (col ? sp.culee.hc : 0) : (col ? sp.pile.hc : 0), hGG = end ? sup.hGG : 0;
  const bF = end ? (col ? sp.culee.D : sp.culee.em) : (col ? sp.pile.D : sp.pile.b), lc = end ? sp.culee.lc : sp.pile.lc;
  const onP = F.type !== 'superficielle', Lp = onP ? F.Lpile : 0, De = F.De, hs = F.hs, B = F.B;
  const w = sup.water && sup.water[L.i], hR = found.hR || 0;
  // repère : z vers le bas depuis le terrain naturel ; dessus de semelle à De − hs
  const zTop = -(Hf + hc + hGG) + (De - hs), zBot = De + Lp + 1;
  const xHalf = Math.max(B, onP ? (F.nFiles - 1) * F.sPile + F.pileD + Lp * Math.tan(Math.max(0, ...(F.incl || [0])) * Math.PI / 180) : B) / 2 + 2;
  // échelle fixée par la hauteur ; largeur adaptée au dessin (les schémas étroits se placent côte à côte)
  const Hpx = 420, m = { l: 30, r: 150, t: 24, b: 20 };
  const sc = Math.min(300 / (2 * xHalf), (Hpx - m.t - m.b) / (zBot - zTop)), W = Math.max(330, Math.ceil(m.l + m.r + 2 * xHalf * sc));
  const X = x => m.l + (x + xHalf) * sc, Y = z => m.t + (z - zTop) * sc;
  const conc = '#cbd5e1', st = COULEURS.trait;
  return svg({ largeur: W, hauteur: Hpx, titre: `Schéma ${L.kind === 'culee' ? 'de la culée' : 'de la pile'} ${L.i + 1}`, contenu: () => {
    let s = '';
    // terrain, remblai, eau
    s += `<rect x="${X(-xHalf)}" y="${Y(0)}" width="${2 * xHalf * sc}" height="${(zBot - 0) * sc}" fill="#e8dcc3" opacity=".55"/>`;
    s += ligne(X(-xHalf), Y(0), X(xHalf), Y(0), '#8a6d3b', 1.6);
    s += texte(X(xHalf) + 4, Y(0) + 4, 'TN', 'style="font-size:11px;font-weight:700;fill:#8a6d3b"');
    if (end) { s += `<rect x="${X(bF / 2)}" y="${Y(zTop + hGG)}" width="${(xHalf - bF / 2) * sc}" height="${(0 - zTop - hGG) * sc}" fill="#eadfd2" opacity=".8"/>`; s += texte(X(xHalf) - 4, Y(0) - 6, 'remblai', 'text-anchor="end" class="pt"'); }
    if (w) {
      s += `<rect x="${X(-xHalf)}" y="${Y(-w.hw)}" width="${2 * xHalf * sc}" height="${w.hw * sc}" fill="#0077be" opacity=".14"/>`;
      s += ligne(X(-xHalf), Y(-w.hw), X(xHalf), Y(-w.hw), '#0077be', 1.4, 'stroke-dasharray="6 3"');
      s += texte(X(xHalf) + 4, Y(-w.hw) + 4, `PHE (h = ${f2(w.hw)} m)`, 'style="font-size:11px;fill:#0077be;font-weight:700"');
      s += ligne(X(-xHalf), Y(w.dAff), X(xHalf), Y(w.dAff), '#b91c1c', 1.2, 'stroke-dasharray="3 3"');
      s += texte(X(xHalf) + 4, Y(w.dAff) + 4, `affouillement ${f2(w.dAff)} m`, 'style="font-size:11px;fill:#b91c1c;font-weight:700"');
    }
    // pieux
    if (onP) {
      const files = Array.from({ length: F.nFiles }, (_, f) => (F.nFiles === 1 ? 0 : (f - (F.nFiles - 1) / 2) * F.sPile));
      files.forEach((x, f) => {
        const a = ((F.incl || [])[f] ?? 0) * Math.PI / 180 * (x < 0 ? -1 : 1), dx = Lp * Math.sin(a), dz = Lp * Math.cos(a), hw = F.pileD / 2 * sc;
        const x0 = X(x), y0 = Y(De), x1 = X(x + dx), y1 = Y(De + dz);
        s += `<path d="M${x0 - hw},${y0} L${x1 - hw},${y1} L${x1 + hw},${y1} L${x0 + hw},${y0} Z" fill="${conc}" stroke="${st}" stroke-width="1"/>`;
      });
      s += texte(X(files[files.length - 1]) + F.pileD * sc / 2 + 6, Y(De + Lp / 2), `${F.nFiles} × ${F.nPile} pieux Ø ${f2(F.pileD)} m, L = ${f1(Lp)} m`, 'class="pt"');
      if (hR > 0) s += texte(X(-xHalf) + 4, Y(De + hR / 2), `remblai traversé ${f2(hR)} m`, 'class="pt"');
    }
    // semelle
    s += `<rect x="${X(-B / 2)}" y="${Y(De - hs)}" width="${B * sc}" height="${hs * sc}" fill="${conc}" stroke="${st}" stroke-width="1.2"/>`;
    s += texte(X(B / 2) + 6, Y(De - hs / 2) + 4, `semelle ${f2(B)} × ${f2(hs)} m`, 'class="pt"');
    // fût, chevêtre, garde-grève
    const zf0 = De - hs, zf1 = zf0 - Hf;
    const bT = !end && !col && sp.pile.bTop && Math.abs(sp.pile.bTop - bF) > 1e-6 ? sp.pile.bTop : null;
    if (bT) s += `<polygon points="${X(-bT / 2)},${Y(zf1)} ${X(bT / 2)},${Y(zf1)} ${X(bF / 2)},${Y(zf1) + Hf * sc} ${X(-bF / 2)},${Y(zf1) + Hf * sc}" fill="${conc}" stroke="${st}" stroke-width="1.2"/>`;
    else s += `<rect x="${X(-bF / 2)}" y="${Y(zf1)}" width="${bF * sc}" height="${Hf * sc}" fill="${conc}" stroke="${st}" stroke-width="1.2"/>`;
    s += texte(X(bF / 2) + 6, Y(zf1) + 14, `${col ? (end ? `${sp.culee.nCol} col.` : `${sp.pile.nCol} col.`) + ` Ø ${f2(bF)}` : (end ? 'mur' : 'voile') + ` ${bT ? `${f2(bT)} (tête) – ${f2(bF)} (pied)` : f2(bF)}`} ; H = ${f2(Hf)} m`, 'class="pt"');
    if (hc > 0) { s += `<rect x="${X(-lc / 2)}" y="${Y(zf1 - hc)}" width="${lc * sc}" height="${hc * sc}" fill="${conc}" stroke="${st}" stroke-width="1.2"/>`; s += texte(X(lc / 2) + 6, Y(zf1 - hc / 2) + 4, `chevêtre ${f2(lc)} × ${f2(hc)}`, 'class="pt"'); }
    if (end && hGG > 0) { const e = r.gg ? r.gg.e : 0.3; s += `<rect x="${X(bF / 2 - e)}" y="${Y(zf1 - hc - hGG)}" width="${e * sc}" height="${hGG * sc}" fill="${conc}" stroke="${st}" stroke-width="1.2"/>`; s += texte(X(bF / 2) + 6, Y(zf1 - hc - hGG / 2), `garde-grève ${f2(hGG)} m`, 'class="pt"'); }
    // appareil d'appui
    const yA = Y(zf1 - hc - (end ? hGG * 0 : 0));
    s += `<rect x="${X(-0.25)}" y="${yA - 5}" width="${0.5 * sc}" height="5" fill="#334155"/>`;
    s += texte(X(-bF / 2) - 6, yA - 2, 'appareils', 'text-anchor="end" class="pt"');
    // cote de fondation
    s += ligne(X(-xHalf) + 12, Y(0), X(-xHalf) + 12, Y(De), st, 1); s += texte(X(-xHalf) + 16, Y(De / 2) + 4, `D = ${f2(De)} m`, 'class="pt"');
    return s;
  } });
}

/** Répartition des efforts horizontaux entre les lignes d'appui : raideurs et parts du freinage. */
export function distributionChart(sup, code = 'EC') {
  const dist = code === 'BAEL' ? sup.distB : sup.distE;
  const cats = sup.lines.map(L => `${L.kind === 'culee' ? 'C' : 'P'}${L.i + 1}`);
  return barChart({ cats, ylabel: 'K [MN/m] ; freinage [%]', series: [
    { libelle: 'K instantanée [MN/m]', values: dist.K.inst.map(v => v / 1000), couleur: PAL[0] },
    { libelle: 'K différée [MN/m]', values: dist.K.diff.map(v => v / 1000), couleur: PAL[6] },
    { libelle: 'part du freinage [%]', values: dist.braking(1).map(v => 100 * v), couleur: PAL[1] }] });
}

/** SVG côte à côte dans un seul SVG (convertible en image pour la note Word) ; largeur totale au moins minW (centré). */
export function sideBySide(a, b, gap = 10, minW = 0) {
  const list = (Array.isArray(a) ? a : [a, b]).filter(Boolean);
  const dim = s => { const m = s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); return m ? [+m[1], +m[2]] : [340, 380]; };
  const ds = list.map(dim), H = Math.max(...ds.map(d => d[1]));
  const wSum = ds.reduce((t, d) => t + d[0], 0) + gap * (list.length - 1), Wt = Math.max(wSum, minW);
  let x = (Wt - wSum) / 2, body = '';
  list.forEach((s, k) => { body += s.replace(/^<svg /, `<svg x="${x}" y="0" width="${ds[k][0]}" height="${ds[k][1]}" `); x += ds[k][0] + gap; });
  return `<svg viewBox="0 0 ${Wt} ${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/** Profils M(z) et y(z) du pieu le plus sollicité (cas « M max ») : deux graphiques côte à côte. */
export function pileProfileCharts(L, code = 'EC') {
  const f = L[code].found; if (!f.psh) return [];
  const g = f.psh.gov.find(([lab]) => /M max/.test(lab)); if (!g) return [];
  const r = g[1], fl = r.psh.files.reduce((a, x) => (x.Mmax > a.Mmax ? x : a), r.psh.files[0]);
  const pr = fl.prof, transv = pr.some(q => q.Mt);
  const mC = lineChart({ xlabel: 'M [kN·m]', ylabel: 'z sous la tête [m]', invertY: true, largeur: 340, hauteur: 380, includeZero: false,
    series: [{ points: pr.map(q => [q.M, q.z]), libelle: 'M longitudinal', couleur: PAL[1] }, ...(transv ? [{ points: pr.map(q => [q.Mt, q.z]), libelle: 'M transversal', couleur: PAL[4], tirets: '5 3' }] : [])] });
  const yC = lineChart({ xlabel: 'y [mm] ; p [kPa]/10', ylabel: 'z sous la tête [m]', invertY: true, largeur: 340, hauteur: 380, includeZero: false,
    series: [{ points: pr.map(q => [q.y * 1000, q.z]), libelle: 'déplacement y', couleur: PAL[0] }, { points: pr.map(q => [q.p / 10, q.z]), libelle: 'pression p/10', couleur: PAL[3], tirets: '4 3' }] });
  return [svgBlock(sideBySide(mC, yC), `${L.kind === 'culee' ? 'Culée' : 'Pile'} ${L.i + 1} — pieu le plus sollicité (file ${fl.file + 1}, ${r.label}) : moments, déplacements et pression sur le sol`)];
}

/** Diagramme des contraintes sous la semelle superficielle (cas ELU le plus défavorable). */
export function footingPressureChart(L, code = 'EC') {
  const f = L[code].found; if (f.type !== 'superficielle') return null;
  const w = f.checks.filter(k => k.ls === 'ELU').reduce((a, k) => (k.ratioV > a.ratioV ? k : a), f.checks.find(k => k.ls === 'ELU') || f.checks[0]);
  if (!w) return null;
  const Vm = w.V / f.L, e = w.e, B = f.B;
  const qmax = w.qmax ?? (Vm / Math.max(1e-6, B - 2 * e)), qmin = w.qmin ?? 0, Bc = (w.compressed ?? 1) * B;
  try {
    return svgBlock(figureContraintes({ B, V: Vm, e, qmax, qmin, Bc, qref: w.qref ?? null, meyerhof: Vm / Math.max(1e-6, B - 2 * e), uniteV: 'kN/m' }),
      `${L.kind === 'culee' ? 'Culée' : 'Pile'} ${L.i + 1} — contraintes sous la semelle (${w.label})`);
  } catch (err) { return null; }
}
