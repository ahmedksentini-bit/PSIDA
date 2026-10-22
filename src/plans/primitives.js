/**
 * Mise à plat d'une feuille en primitives (lignes, polylignes, cercles, arcs, textes) pour les écrivains SVG et DXF.
 *   L : { a, b }   P : { pts, ferme }   C : { c, r, plein }   A : { c, r, a0, a1 (degrés) }   T : { p, s, h, ancre, v, angle, gras }
 * Coordonnées « papier » en mm (y vers le haut) ; pour le DXF, chaque vue à échelle unique est aussi rendue en
 * coordonnées réelles (mm de l'ouvrage) dans un bloc inséré à l'échelle 1/échelle.
 */
import { transfo, geomCote, hachuresPoly, normaleG, fmtNiv, CADRE, VUE_PAD, boiteVuePlacee, boiteNote } from './dessin.js';

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
    else if (e.t === 'terrain') {
      const pts = e.pts.map(f); P(c, { t: 'P', pts, ferme: false });
      // traits à 45° de 1,6 mm tous les 2,5 mm, côté sol
      const pas = 2.5 * k, l = 1.6 * k;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue;
        const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1] * -e.cote, u[0] * -e.cote];
        const d = [(-u[0] - n[0]) * l / Math.SQRT2, (-u[1] - n[1]) * l / Math.SQRT2];
        for (let s0 = pas / 2; s0 < L; s0 += pas) { const q = [a[0] + u[0] * s0, a[1] + u[1] * s0]; P(c, { t: 'L', a: q, b: [q[0] + d[0], q[1] + d[1]], ep: 0.18 }); }
      }
    } else if (e.t === 'pointille') {
      // points pseudo-aléatoires (suite déterministe) dans le polygone, un par carré de « pas » mm
      const pts = e.pts.map(f), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pas = (e.pas || 2.2) * k;
      const dedans = (x, y) => { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
      let g = 12345; const rnd = () => (g = (g * 16807) % 2147483647) / 2147483647;
      for (let y = y0 + pas / 2; y < y1; y += pas) for (let x = x0 + pas / 2; x < x1; x += pas) {
        const px = x + (rnd() - 0.5) * pas * 0.8, py = y + (rnd() - 0.5) * pas * 0.8;
        if (dedans(px, py)) P(c, { t: 'C', c: [px, py], r: 0.13 * k, plein: true });
      }
    }
    else if (e.t === 'cote') {
      const A = f(e.a), B = f(e.b), n = normaleG(e.a, e.b), A1 = f([e.a[0] + n[0] * e.d, e.a[1] + n[1] * e.d]);
      const dmm = Math.hypot(A1[0] - A[0], A1[1] - A[1]) * Math.sign(e.d || 1);
      const g = geomCote(A, B, dmm, { attache: 2 * k, deborde: 1.5 * k, tick: 1.2 * k });
      for (const [a, b] of g.lignes) P(c, { t: 'L', a, b });
      const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      P('TEXTES', { t: 'T', p: g.texte.p, s: e.texte ?? L.toFixed(2).replace('.', ','), h: 2.5 * k, ancre: 'c', v: g.texte.v, angle: g.texte.angle });
    } else if (e.t === 'coteH' || e.t === 'coteV') {
      // attaches de l'objet à la ligne de cote (jour de 1 mm, dépassement de 1,5 mm), traits obliques, texte au-dessus
      const H = e.t === 'coteH', A = f(e.a), B = f(e.b);
      const A2 = H ? f([e.a[0], e.z]) : f([e.x, e.a[1]]), B2 = H ? f([e.b[0], e.z]) : f([e.x, e.b[1]]);
      const att = (S, Q) => {
        const dx = Q[0] - S[0], dy = Q[1] - S[1], L = Math.hypot(dx, dy);
        if (L < 1.2 * k) return;
        const u = [dx / L, dy / L];
        P(c, { t: 'L', a: [S[0] + u[0] * k, S[1] + u[1] * k], b: [Q[0] + u[0] * 1.5 * k, Q[1] + u[1] * 1.5 * k] });
      };
      att(A, A2); att(B, B2);
      const d = [B2[0] - A2[0], B2[1] - A2[1]], L = Math.hypot(...d) || 1, u = [d[0] / L, d[1] / L];
      P(c, { t: 'L', a: [A2[0] - u[0] * 1.5 * k, A2[1] - u[1] * 1.5 * k], b: [B2[0] + u[0] * 1.5 * k, B2[1] + u[1] * 1.5 * k] });
      const tk = 1.2 * k, o = [(u[0] - u[1]) / Math.SQRT2 * tk, (u[1] + u[0]) / Math.SQRT2 * tk];
      for (const Q of [A2, B2]) P(c, { t: 'L', a: [Q[0] - o[0], Q[1] - o[1]], b: [Q[0] + o[0], Q[1] + o[1]] });
      const Lr = H ? Math.abs(e.b[0] - e.a[0]) : Math.abs(e.b[1] - e.a[1]);
      const mid = [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2];
      P('TEXTES', H ? { t: 'T', p: [mid[0], mid[1] + 0.9 * k], s: e.texte ?? Lr.toFixed(2).replace('.', ','), h: 2.5 * k, ancre: 'c', v: 'b', angle: 0 }
        : { t: 'T', p: [mid[0] - 0.9 * k, mid[1]], s: e.texte ?? Lr.toFixed(2).replace('.', ','), h: 2.5 * k, ancre: 'c', v: 'b', angle: 90 });
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

/** Coupe un texte en lignes d'au plus n caractères. */
function lignesDe(t, n) {
  const out = []; let l = '';
  for (const w of String(t || '').split(/\s+/).filter(Boolean)) { if (l && (l + ' ' + w).length > n) { out.push(l); l = w; } else l = l ? l + ' ' + w : w; }
  if (l) out.push(l); return out;
}

/**
 * Cadre de la feuille (marge de reliure 20 mm à gauche, 10 mm ailleurs) et cartouche en bande sur toute la largeur du bas,
 * à la manière des dossiers d'ouvrages courants : bureau d'études | maître d'ouvrage | projet | phase, ouvrage et titre du
 * plan | indices (date, établi, vérifié, approuvé, modification) et identification (échelles, format, n° de plan, indice).
 * Au-dessus : mention de vérification des cotes par l'entrepreneur.
 */
export function primitivesCadre(F) {
  const out = [], L = (a, b, ep) => out.push({ calque: 'CARTOUCHE', t: 'L', a, b, ...(ep ? { ep } : {}) });
  const R = (x, y, w, h, ep) => out.push({ calque: 'CARTOUCHE', t: 'P', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], ferme: true, ...(ep ? { ep } : {}) });
  const T = (p, s, h = 2.5, o = {}) => out.push({ calque: 'TEXTES', t: 'T', p, s: String(s ?? ''), h, ancre: 'g', v: 'm', ...o });
  const fit = (s, w, h, gras) => Math.min(h, w / ((gras ? 0.6 : 0.53) * Math.max(1, String(s || '').length)));
  const x0 = CADRE.x0, y0 = CADRE.y0, x1 = F.W - CADRE.d, y1 = F.H - CADRE.d, HB = CADRE.bande;
  out.push({ calque: 'CARTOUCHE', t: 'P', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ferme: true, ep: 0.7 });
  const c = F.cartouche || {}, Wb = x1 - x0, yt = y0 + HB;
  R(x0, y0, Wb, HB, 0.5);
  const fr = [0.15, 0.17, 0.19, 0.21], xs = [x0];
  for (const f of fr) xs.push(xs[xs.length - 1] + f * Wb);
  xs.push(x1);
  for (let k = 1; k < xs.length - 1; k++) L([xs[k], y0], [xs[k], yt], 0.5);
  const lab = (x, y, s) => T([x + 1.2, y - 2], s, 1.5);
  // 1. bureau d'études
  { const w = xs[1] - xs[0], cx = (xs[0] + xs[1]) / 2, nom = c.bureau || '';
    if (nom) T([cx, yt - 9], nom, fit(nom, w - 4, 4.2, true), { ancre: 'c', gras: true });
    else lab(xs[0], yt, 'Bureau d\'études');
    lignesDe(c.bureauAdresse, Math.floor((w - 4) / (0.53 * 1.8))).slice(0, 4).forEach((l, k) => T([cx, yt - 16 - k * 2.9], l, 1.8, { ancre: 'c' }));
    T([cx, y0 + 2.5], `Calcul : ${c.logiciel || 'PSIDA'}`, 1.6, { ancre: 'c' }); }
  // 2. maître d'ouvrage (lignes séparées par « ; » ou retour à la ligne)
  { const w = xs[2] - xs[1], cx = (xs[1] + xs[2]) / 2, L0 = String(c.maitreOuvrage || '').split(/\s*[;\n]\s*/).filter(Boolean).slice(0, 5);
    lab(xs[1], yt, 'Maître d\'ouvrage');
    L0.forEach((l, k) => { const h = fit(l, w - 3, k === 0 ? 2.8 : 2.1, k === 0); T([cx, yt - 9 - k * 4.2 + (5 - L0.length) * 1.6], l, h, { ancre: 'c', gras: k === 0 }); }); }
  // 3. projet
  { const w = xs[3] - xs[2], cx = (xs[2] + xs[3]) / 2, h = 2.4, P = lignesDe(c.projet, Math.floor((w - 4) / (0.6 * h))).slice(0, 5);
    lab(xs[2], yt, 'Projet');
    P.forEach((l, k) => T([cx, yt - 10 - k * 3.8 + (5 - P.length) * 1.5], l, h, { ancre: 'c', gras: true })); }
  // 4. phase et lot ; ouvrage ; titre du plan
  { const w = xs[4] - xs[3], cx = (xs[3] + xs[4]) / 2, yp = yt - 8;
    L([xs[3], yp], [xs[4], yp]); L([cx, yp], [cx, yt]);
    T([xs[3] + 1.5, yt - 4], 'PHASE :', 1.8); T([xs[3] + 14, yt - 4], c.phase || '', fit(c.phase, w / 2 - 15, 3.2, true), { gras: true });
    T([cx + 1.5, yt - 4], 'LOT :', 1.8); T([cx + 11, yt - 4], c.lot || '—', fit(c.lot || '—', w / 2 - 12, 3, true), { gras: true });
    if (c.ouvrage) T([cx, yp - 4], c.ouvrage, fit(c.ouvrage, w - 4, 2.4), { ancre: 'c' });
    const tl = lignesDe(F.titre, Math.max(12, Math.floor((w - 4) / (0.6 * 3.2)))).slice(0, 3);
    tl.forEach((l, k) => T([cx, y0 + 4 + (tl.length - 1 - k) * 4.6 + (3 - tl.length) * 2], l, fit(l, w - 3, 3.2, true), { ancre: 'c', gras: true })); }
  // 5. indices (haut) et identification du plan (bas)
  { const xa = xs[4], w = x1 - xa, ym = y0 + HB / 2;
    L([xa, ym], [x1, ym], 0.5);
    const ci = [['Ind.', 0.08, c.indice || 'A'], ['Date', 0.17, c.date], ['Établi', 0.14, c.etabli], ['Vérifié', 0.14, c.verifie], ['Approuvé', 0.14, c.approuve], ['Modification', 0.33, c.modification || 'Première émission']];
    const yh = yt - 5.5; L([xa, yh], [x1, yh]); const yr = yh - 5.8; L([xa, yr], [x1, yr]);
    let xx = xa;
    for (const [k, f, v] of ci) {
      const ww = f * w; T([xx + ww / 2, yt - 2.75], k, 1.6, { ancre: 'c', gras: true }); if (v) T([xx + ww / 2, yh - 2.9], v, fit(v, ww - 1.5, 2.1), { ancre: 'c' });
      xx += ww; if (xx < x1 - 0.1) L([xx, ym], [xx, yt]);
    }
    const cj = [['Échelle(s)', 0.31, c.echelles], ['Format', 0.12, F.format], ['N° de plan', 0.43, c.numero], ['Ind.', 0.14, c.indice || 'A']];
    xx = xa;
    for (const [k, f, v] of cj) {
      const ww = f * w; T([xx + 1.2, ym - 2], k, 1.5); if (v) T([xx + ww / 2, ym - 9.5], v, fit(v, ww - 2, k === 'N° de plan' || k === 'Ind.' ? 3.4 : 2.3, true), { ancre: 'c', gras: k !== 'Échelle(s)' });
      xx += ww; if (xx < x1 - 0.1) L([xx, y0], [xx, ym]);
    }
  }
  // mention au-dessus du cartouche
  if (c.mention !== false) T([x0 + 1.5, yt + CADRE.mention / 2], 'Nota : l\'entrepreneur est tenu de vérifier toutes les cotes avant exécution ; il signalera au maître d\'œuvre toute erreur ou omission.', 2.1, { gras: false });
  return { out, zoneCartouche: [x0, y0, Wb, HB + CADRE.mention] };
}

/** Largeur approchée d'un texte (police condensée), mm. */
export const largeurTexte = (s, h) => 0.52 * h * String(s).length;

/**
 * Échelle graphique : barre de 4 segments alternés (pleins / vides) d'une longueur réelle « ronde » de 30 à 70 mm papier,
 * graduée 0 – L/2 – L (m). (x, y) : coin bas-gauche, mm papier.
 */
export const longueurEchelle = den => [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find(l => l * 1000 / den >= 30) || 100;
export const largeurEchelle = den => longueurEchelle(den) * 1000 / den;
export function echelleGraphique(x, y, den, lib = '') {
  const out = [], kmm = 1000 / den;
  const L = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find(l => l * kmm >= 30) || 100, W = L * kmm, h = 1.4;
  out.push({ calque: 'TEXTES', t: 'P', pts: [[x, y], [x + W, y], [x + W, y + h], [x, y + h]], ferme: true, ep: 0.18 });
  for (let k = 0; k < 4; k += 2) out.push({ calque: 'TEXTES', t: 'L', a: [x + k * W / 4, y + h / 2], b: [x + (k + 1) * W / 4, y + h / 2], ep: h });
  const t = (xx, s) => out.push({ calque: 'TEXTES', t: 'T', p: [xx, y + h + 0.8], s, h: 1.8, ancre: 'c', v: 'b' });
  t(x, '0'); t(x + W / 2, String(L / 2).replace('.', ',')); t(x + W, `${String(L).replace('.', ',')} m`);
  if (lib) out.push({ calque: 'TEXTES', t: 'T', p: [x + W + 2, y], s: lib, h: 1.8, ancre: 'g', v: 'b' });
  return out;
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
    // cadre tireté ; titre centré, en gras, souligné ; « Ech : 1/50 » et échelle(s) graphique(s) dessous
    const [x0, y0] = f([E.x0, E.y0]), [bx, by, bw, bh] = boiteVuePlacee(pl), cx = bx + bw / 2, yT = by + bh - VUE_PAD - 4;
    papier.push({ calque: 'CADRES', t: 'P', pts: [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]], ferme: true });
    const lt = 0.6 * 3.8 * v.titre.length;
    papier.push({ calque: 'TEXTES', t: 'T', p: [cx, yT], s: v.titre, h: 3.8, ancre: 'c', v: 'b', gras: true });
    papier.push({ calque: 'TEXTES', t: 'L', a: [cx - lt / 2, yT - 0.9], b: [cx + lt / 2, yT - 0.9], ep: 0.3 });
    const te = v.echelleV ? `Ech : 1/${v.echelle} (long.) — 1/${v.echelleV} (haut.)` : `Ech : 1/${v.echelle}`;
    const barres = v.echelleV ? [[v.echelle, 'long.'], [v.echelleV, 'haut.']] : [[v.echelle, '']];
    const wte = 0.53 * 2.5 * te.length, wb = barres.reduce((s, [d, l]) => s + largeurEchelle(d) + (l ? 10 : 0) + 6, 0);
    let xe = cx - (wte + wb) / 2, ye = yT - 7.5;
    papier.push({ calque: 'TEXTES', t: 'T', p: [xe, ye], s: te, h: 2.5, ancre: 'g', v: 'b' });
    xe += wte + 6;
    for (const [den, lib] of barres) { papier.push(...echelleGraphique(xe, ye, den, lib)); xe += largeurEchelle(den) + (lib ? 10 : 0) + 6; }
    if (blocsDXF && !v.echelleV) {
      const kd = 1000;   // mm réels par m
      blocs.push({ nom: `VUE_${i + 1}`, prims: primitivesVue(v, p => [(p[0] - E.x0) * kd, (p[1] - E.y0) * kd], v.echelle, kd), x: x0, y: y0, sx: 1 / v.echelle, sy: 1 / v.echelle });
    } else papier.push(...primitivesVue(v, f, 1, 1000 / v.echelle));
  });
  for (const t of F.tableaux) papier.push(...primitivesTableau(t));
  papier.push(...(F.papier || []));
  for (const n of F.notes) {
    n.lignes.forEach((s, k) => papier.push({ calque: 'TEXTES', t: 'T', p: [n.x, n.y - k * n.h * 1.6], s: k === 0 && n.titreGras && s === 'NOTES' ? 'NOTA :' : s, h: n.h, ancre: 'g', v: 'h', gras: k === 0 && n.titreGras }));
    if (n.titreGras) { const [x, y, w, h] = boiteNote(n); papier.push({ calque: 'CARTOUCHE', t: 'P', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], ferme: true, ep: 0.35 }); }
  }
  return { papier, blocs };
}
