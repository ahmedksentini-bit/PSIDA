/**
 * Mise à plat d'une feuille en primitives (lignes, polylignes, cercles, arcs, textes) pour les écrivains SVG et DXF.
 *   L : { a, b }   P : { pts, ferme }   C : { c, r, plein }   A : { c, r, a0, a1 (degrés) }   T : { p, s, h, ancre, v, angle, gras }
 * Coordonnées « papier » en mm (y vers le haut) ; pour le DXF, chaque vue à échelle unique est aussi rendue en
 * coordonnées réelles (mm de l'ouvrage) dans un bloc inséré à l'échelle 1/échelle.
 */
import { transfo, geomCote, hachuresPoly, normaleG, fmtNiv } from './dessin.js';

/**
 * Primitives d'une vue. `f` transforme un point réel (m) en coordonnées de sortie ; `k` = mm de sortie par mm papier
 * (1 sur la feuille, échelle dans un bloc en mm réels) ; `kd` = mm de sortie par m réel (pour les décalages de cote).
 */
export function primitivesVue(vue, f, k, kd) {
  const out = [], P = (calque, o) => out.push({ calque, ...o });
  for (const e of vue.ents) {
    const c = e.calque;
    if (e.t === 'ligne') P(c, { t: 'L', a: f(e.a), b: f(e.b) });
    else if (e.t === 'poly') P(c, { t: 'P', pts: e.pts.map(f), ferme: e.ferme });
    else if (e.t === 'cercle') P(c, { t: 'C', c: f(e.c), r: e.r * kd, plein: e.plein });
    else if (e.t === 'arc') P(c, { t: 'A', c: f(e.c), r: e.r * kd, a0: e.a0 * 180 / Math.PI, a1: e.a1 * 180 / Math.PI });
    else if (e.t === 'texte') P(c, { t: 'T', p: f(e.p), s: e.s, h: e.h * k, ancre: e.ancre, v: e.v, angle: e.angle, gras: e.gras });
    else if (e.t === 'hachure') { const pts = e.pts.map(f); for (const [a, b] of hachuresPoly(pts, 2 * k)) P(c, { t: 'L', a, b }); }
    else if (e.t === 'cote') {
      const A = f(e.a), B = f(e.b), n = normaleG(e.a, e.b), A1 = f([e.a[0] + n[0] * e.d, e.a[1] + n[1] * e.d]);
      const dmm = Math.hypot(A1[0] - A[0], A1[1] - A[1]) * Math.sign(e.d || 1);
      const g = geomCote(A, B, dmm, { attache: 2 * k, deborde: 1.5 * k, tick: 1.2 * k });
      for (const [a, b] of g.lignes) P(c, { t: 'L', a, b });
      const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      P('TEXTES', { t: 'T', p: g.texte.p, s: e.texte ?? L.toFixed(2).replace('.', ','), h: 2.5 * k, ancre: 'c', v: g.texte.v, angle: g.texte.angle });
    } else if (e.t === 'niveau') {
      const p = f(e.p), s = 2.2 * k;
      P(c, { t: 'P', pts: [p, [p[0] - s, p[1] + s * 1.2], [p[0] + s, p[1] + s * 1.2]], ferme: true });
      P(c, { t: 'L', a: [p[0] - s * 1.5, p[1]], b: [p[0] + s * 6, p[1]] });
      P('TEXTES', { t: 'T', p: [p[0] + s * 1.4, p[1] + s * 1.5], s: e.s ? `${e.s} ${fmtNiv(e.z)}` : fmtNiv(e.z), h: 2.2 * k, ancre: 'g', v: 'b' });
    } else if (e.t === 'repere') {
      const p = f(e.p), r = 3 * k;
      P(c, { t: 'C', c: p, r, plein: false });
      P('TEXTES', { t: 'T', p, s: String(e.n), h: 2.6 * k, ancre: 'c', v: 'm', gras: true });
      if (e.cible) {
        const q = f(e.cible), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d > r) P(c, { t: 'L', a: [p[0] + (q[0] - p[0]) * r / d, p[1] + (q[1] - p[1]) * r / d], b: q });
      }
    }
  }
  return out;
}

/** Tableau : { titre, cols: [{ t, w, a: 'g'|'c'|'d' }], lignes: [[...]], hl (hauteur de ligne, mm), h (texte) }. */
export function primitivesTableau(tab) {
  const out = [], hl = tab.hl || 6, h = tab.h || 2.2, W = tab.cols.reduce((s, c) => s + c.w, 0);
  const n = tab.lignes.length + 1 + (tab.titre ? 1 : 0);
  let y = tab.y + n * hl;   // haut du tableau (y vers le haut)
  const L = (a, b) => out.push({ calque: 'TABLEAUX', t: 'L', a, b }), T = (p, s, o = {}) => out.push({ calque: 'TEXTES', t: 'T', p, s: String(s), h, ancre: 'g', v: 'm', ...o });
  L([tab.x, y], [tab.x + W, y]);
  if (tab.titre) { T([tab.x + W / 2, y - hl / 2], tab.titre, { ancre: 'c', gras: true, h: h * 1.1 }); y -= hl; L([tab.x, y], [tab.x + W, y]); }
  const ligne = (cells, gras) => {
    let x = tab.x;
    tab.cols.forEach((c, i) => {
      const a = c.a || 'g', px = a === 'g' ? x + 1.2 : a === 'd' ? x + c.w - 1.2 : x + c.w / 2;
      if (cells[i] !== '' && cells[i] != null) T([px, y - hl / 2], cells[i], { ancre: a, gras });
      x += c.w;
    });
    y -= hl; L([tab.x, y], [tab.x + W, y]);
  };
  ligne(tab.cols.map(c => c.t), true);
  out.push({ calque: 'TABLEAUX', t: 'L', a: [tab.x, y + hl], b: [tab.x + W, y + hl], double: true });
  for (const r of tab.lignes) ligne(r, r.gras);
  // verticales
  const top = tab.y + n * hl - (tab.titre ? hl : 0);
  let x = tab.x; L([x, tab.y], [x, tab.y + n * hl]);
  for (const c of tab.cols) { x += c.w; L([x, tab.y], [x, x === tab.x + W ? tab.y + n * hl : top]); }
  return out;
}
export const largeurTableau = tab => tab.cols.reduce((s, c) => s + c.w, 0);
export const hauteurTableau = tab => (tab.lignes.length + 1 + (tab.titre ? 1 : 0)) * (tab.hl || 6);

/** Cadre de la feuille (marge de reliure 20 mm à gauche, 10 mm ailleurs) et cartouche en bas à droite. */
export function primitivesCadre(F) {
  const out = [], L = (a, b, calque = 'CARTOUCHE') => out.push({ calque, t: 'L', a, b });
  const T = (p, s, h = 2.5, o = {}) => out.push({ calque: 'TEXTES', t: 'T', p, s: String(s ?? ''), h, ancre: 'g', v: 'm', ...o });
  const x0 = 20, y0 = 10, x1 = F.W - 10, y1 = F.H - 10;
  out.push({ calque: 'CARTOUCHE', t: 'P', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ferme: true, ep: 0.7 });
  // cartouche 180 × 62 mm
  const c = F.cartouche || {}, w = 180, cx = x1 - w, rows = [
    ['Maître d\'ouvrage', c.maitreOuvrage], ['Projet', c.projet], ['Ouvrage', c.ouvrage],
  ];
  let y = y0 + 62;
  out.push({ calque: 'CARTOUCHE', t: 'P', pts: [[cx, y0], [x1, y0], [x1, y], [cx, y]], ferme: true, ep: 0.5 });
  for (const [k, v] of rows) { L([cx, y - 8], [x1, y - 8]); T([cx + 2, y - 4], k, 1.8); T([cx + 34, y - 4], v, 2.6); y -= 8; }
  // titre du plan
  L([cx, y - 14], [x1, y - 14]); T([cx + 2, y - 3.2], 'Titre du plan', 1.8); T([cx + w / 2, y - 8.5], F.titre, 4, { ancre: 'c', gras: true }); y -= 14;
  // ligne : échelles | format | n° | indice | date
  const cols = [['Échelle(s)', c.echelles, 60], ['Format', F.format, 22], ['N° de plan', c.numero, 46], ['Indice', c.indice || 'A', 18], ['Date', c.date, 34]];
  let xx = cx;
  for (const [k, v, ww] of cols) { T([xx + 1.5, y - 3], k, 1.6); T([xx + 1.5, y - 7.5], v, 2.4); xx += ww; if (xx < x1 - 0.1) L([xx, y], [xx, y - 10]); }
  L([cx, y - 10], [x1, y - 10]); y -= 10;
  // établi / vérifié / logiciel
  const cols2 = [['Établi par', c.etabli, 60], ['Vérifié par', c.verifie, 60], ['Calcul', c.logiciel || 'PSIDA', 60]];
  xx = cx;
  for (const [k, v, ww] of cols2) { T([xx + 1.5, y - 3], k, 1.6); T([xx + 1.5, y - 7], v, 2.2); xx += ww; if (xx < x1 - 0.1) L([xx, y], [xx, y0]); }
  // tableau des indices au-dessus du cartouche
  const yi = y0 + 62;
  out.push({ calque: 'CARTOUCHE', t: 'P', pts: [[cx, yi], [x1, yi], [x1, yi + 14], [cx, yi + 14]], ferme: true });
  L([cx, yi + 7], [x1, yi + 7]); L([cx + 18, yi], [cx + 18, yi + 14]); L([cx + 52, yi], [cx + 52, yi + 14]);
  T([cx + 2, yi + 10.5], 'Indice', 1.8); T([cx + 20, yi + 10.5], 'Date', 1.8); T([cx + 54, yi + 10.5], 'Modification', 1.8);
  T([cx + 2, yi + 3.5], c.indice || 'A', 2.2); T([cx + 20, yi + 3.5], c.date, 2.2); T([cx + 54, yi + 3.5], c.modification || 'Première émission', 2.2);
  return { out, zoneCartouche: [cx, y0, w, 62 + 14] };
}

/**
 * Feuille complète en primitives papier ; `blocs` : vues à échelle unique, en mm réels, avec leur point d'insertion.
 * `blocsDXF` = true : les vues à échelle unique ne sont pas mises à plat sur la feuille (elles sont dans les blocs).
 */
export function primitivesFeuille(F, { blocsDXF = false } = {}) {
  const papier = [], blocs = [];
  papier.push(...primitivesCadre(F).out);
  F.vues.forEach((pl, i) => {
    const { f, E } = transfo(pl), v = pl.vue;
    // titre de la vue, souligné, avec l'échelle
    const tv = v.titre + (v.echelleV ? ` — échelles ${'1/' + v.echelle} (long.), ${'1/' + v.echelleV} (haut.)` : ` — échelle 1/${v.echelle}`);
    const [x0, y0] = f([E.x0, E.y0]), [x1, y1] = f([E.x1, E.y1]);
    papier.push({ calque: 'TEXTES', t: 'T', p: [x0, y1 + 6], s: tv, h: 3.5, ancre: 'g', v: 'b', gras: true });
    papier.push({ calque: 'TEXTES', t: 'L', a: [x0, y1 + 5.2], b: [x0 + Math.min(x1 - x0, 3.5 * 0.55 * tv.length), y1 + 5.2] });
    if (blocsDXF && !v.echelleV) {
      const kd = 1000;   // mm réels par m
      blocs.push({ nom: `VUE_${i + 1}`, prims: primitivesVue(v, p => [(p[0] - E.x0) * kd, (p[1] - E.y0) * kd], v.echelle, kd), x: x0, y: y0, sx: 1 / v.echelle, sy: 1 / v.echelle });
    } else papier.push(...primitivesVue(v, f, 1, 1000 / v.echelle));
  });
  for (const t of F.tableaux) papier.push(...primitivesTableau(t));
  papier.push(...(F.papier || []));
  for (const n of F.notes) n.lignes.forEach((s, k) => papier.push({ calque: 'TEXTES', t: 'T', p: [n.x, n.y - k * n.h * 1.6], s, h: n.h, ancre: 'g', v: 'h', gras: k === 0 && n.titreGras }));
  return { papier, blocs };
}
