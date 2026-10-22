/**
 * Plans de coffrage des appuis : une feuille par ligne d'appui (culées C0 et Cn, piles P1…), avec l'élévation (vue suivant
 * l'axe de l'ouvrage), la coupe dans l'axe de l'ouvrage, la vue en plan de la fondation, les niveaux, les notes et les
 * quantités. Géométrie : données de l'onglet « Appuis et fondations », complétées ligne par ligne par le plan de
 * nivellement (st.supports.spLigne, st.supports.niv).
 *
 * Repères : élévation et vue en plan en X = −y (vue de C0 vers la dernière culée, comme les coupes du tablier) ; coupe
 * en x le long de l'ouvrage, origine sur l'axe des appareils, x > 0 côté travée pour une culée (miroir pour Cn).
 * Niveaux : NGF du plan de nivellement, sinon relatifs (±0,00 = dessus de la dalle à l'axe).
 */
import { Vue, Feuille, fmtCote, fmtNiv } from './dessin.js';
import { composer } from './mise_en_page.js';
import { tableauCalage } from './nivellement.js';
import { geometrie } from './geometrie.js';

const GG = { e: 0.30, joint: 0.05 }, DEB = 0.05;   // garde-grève, joint ; débord des bossages
const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const rect = (v, calque, x0, z0, x1, z1) => v.poly(calque, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
const coupe = (v, x0, z0, x1, z1) => { const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; v.poly('COFFRAGE', p, true); v.hachure(p); };
function rupture(v, x0, x1, z, amp = 0.10) {
  const xm = (x0 + x1) / 2, w = Math.min(0.2, (x1 - x0) / 6);
  v.poly('COFFRAGE', [[x0 - 0.08, z], [xm - w, z], [xm - w / 2, z + amp], [xm + w / 2, z - amp], [xm + w, z], [x1 + 0.08, z]]);
}

/** Géométrie complète de la ligne d'appui i. */
export function geometrieAppui(st, i) {
  const s = st.supports; if (!s || !s.lines) throw new Error('plans des appuis : lancer le calcul des appuis (onglet Appuis et fondations)');
  const G = geometrie(st), n = G.n, end = i === 0 || i === n - 1, sp = (s.spLigne && s.spLigne[i]) || s.sp || st.p.supports, width = s.width;
  const ap = G.appareils[i], nvL = s.niv && s.niv.actif && s.niv.lignes ? s.niv.lignes[i] : null;
  const hBos = nvL ? nvL.hBos : 0.10, hApp = ap.h;
  const zT = nvL ? nvL.zT : -G.h - hApp - hBos, zSF = zT + hBos + hApp, zCh = nvL ? nvL.zCh : G.tRev;
  const F = sp.found, pieux = F.type !== 'superficielle';
  const out = { i, nom: G.nomLigne(i), end, sgn: i === 0 ? 1 : -1, width, ap, hBos, hApp, zT, zSF, zCh, niv: !!nvL, G, F, pieux };
  if (end) {
    const C = sp.culee, rem = C.type === 'remblayee';
    out.kind = 'culee'; out.type = C.type; out.C = C;
    out.hc = rem ? 0 : C.hc; out.Hm = C.Hm;
    out.zDS = zT - out.hc - C.Hm;
    out.hGG = C.hGG ?? s.hGG ?? (G.h + 0.15 + hApp);
    const ln = s.lines && s.lines[i], gg = ln && (ln.EC || ln.BAEL);
    out.eRet = gg && gg.retour ? gg.retour.e : Math.max(0.2, (C.Lret + 2) / 20);
    out.Lret = C.Lret;
    out.Lf = width + 1.0;
    // coupe dans l'axe : garde-grève derrière le joint, sommier (remblayée) ou chevêtre (sur colonnes)
    const a = G.aL != null ? (i === 0 ? G.aL : G.aR) : 0;
    // nu avant du garde-grève : derrière le joint (about + joint), et jamais sur le bossage (arrière du bossage + 10 cm)
    const aBos = ap.a / 2 + DEB;
    out.xGGav = -Math.max(a + GG.joint, aBos + 0.10); out.xGGar = out.xGGav - GG.e;
    if (a < aBos + 0.05) out.alerte = `About ${fr(a)} m trop court : le tablier ne couvre pas le bossage (a/2 + débord = ${fr(aBos)} m). Garde-grève reculé à ${fr(-out.xGGav)} m de l'axe des appareils ; revoir l'about (onglet Projet, ≥ 0,1 + 15 D : guide Sétra des ponts-dalles, § 3.2).`;
    if (rem) {
      out.hSom = Math.min(1.0, C.Hm / 2);
      out.xMur = [out.xGGar, out.xGGar + C.em];
      out.xSom = [out.xGGar, Math.max(out.xGGar + C.em + 0.3, ap.a / 2 + hBos + 0.15)];
      out.xFut = (out.xMur[0] + out.xMur[1]) / 2;
    } else {
      out.xChev = [out.xGGar, Math.max(out.xGGar + C.lc, ap.a / 2 + 0.25)];
      out.xFut = (out.xChev[0] + out.xChev[1]) / 2;
      out.nCol = C.nCol; out.D = C.D;
    }
    out.dalle = C.dalle ? { L: Math.min(6, Math.max(3, 0.6 * (C.Hm + out.hGG))), e: 0.30 } : null;
  } else {
    const P = sp.pile, col = P.type === 'colonnes', H = Array.isArray(P.H) ? (P.H[Math.min(P.H.length - 1, i - 1)] ?? P.H[0]) : P.H;
    out.kind = 'pile'; out.type = P.type; out.P = P;
    out.hc = col ? P.hc : 0; out.H = H;
    out.zDS = zT - out.hc - H;
    out.Lv = P.Lv ?? width; out.b = P.b; out.bTop = P.bTop ?? P.b;
    out.Lf = (col ? width : out.Lv) + 1.0;
    out.xFut = 0;
    if (col) { out.nCol = P.nCol; out.D = P.D; out.lc = P.lc; }
  }
  out.B = F.B; out.hs = F.hs;
  out.zSS = out.zDS - F.hs;
  out.zTN = nvL && nvL.zTN != null ? nvL.zTN : out.zSS + (F.De ?? 1);
  if (pieux) {
    out.nF = Math.max(1, F.nFiles); out.nP = Math.max(1, F.nPile); out.Dp = F.pileD; out.Lp = F.Lpile; out.sP = F.sPile;
    out.fileX = f => (out.nF === 1 ? 0 : (f - (out.nF - 1) / 2) * F.sPile);
    out.pieuY = k => out.Lf * (2 * k + 1) / (2 * out.nP) - out.Lf / 2;
    out.incl = f => { const a = (F.incl || [])[f] ?? 0; return (out.fileX(f) < 0 ? -1 : 1) * a * Math.PI / 180; };
    out.zPP = out.zSS - F.Lpile;
  }
  // colonnes : axes répartis sur la largeur (comme le calcul du chevêtre)
  if (out.nCol) out.colY = j => -width / 2 + width * (2 * j + 1) / (2 * out.nCol);
  return out;
}

/* ------------------------------------------------------------------------- élévation (vue suivant l'axe) */
export function vueElevation(A) {
  const v = new Vue(`ÉLÉVATION ${A.kind === 'culee' ? 'DE LA CULÉE' : 'DE LA PILE'} ${A.nom} (vue suivant l'axe de l'ouvrage)`);
  const X = y => -y, w = A.width, G = A.G;
  // fondation, béton de propreté
  rect(v, 'COFFRAGE', -A.Lf / 2, A.zSS, A.Lf / 2, A.zDS);
  v.proprete(-A.Lf / 2, A.Lf / 2, A.zSS);
  v.texte('TEXTES', [A.Lf * 0.3, (A.zSS + A.zDS) / 2], 'Semelle', { h: 2.6, ancre: 'c', v: 'm' });
  // corps de l'appui
  const zHautCorps = A.zT - A.hc;
  if (A.kind === 'pile' && A.type !== 'colonnes') rect(v, 'COFFRAGE', -A.Lv / 2, A.zDS, A.Lv / 2, A.zT);
  else if (A.kind === 'culee' && A.type === 'remblayee') {
    rect(v, 'COFFRAGE', -w / 2, A.zDS, w / 2, A.zT);
    v.ligne('COFFRAGE', [-w / 2, A.zT - A.hSom], [w / 2, A.zT - A.hSom]);
    v.texte('TEXTES', [w * 0.3, A.zT - A.hSom / 2], 'Sommier', { h: 2.6, ancre: 'c', v: 'm' });
    v.texte('TEXTES', [w * 0.3, (A.zDS + A.zT - A.hSom) / 2], 'Mur de front', { h: 2.6, ancre: 'c', v: 'm' });
  } else {
    for (let j = 0; j < A.nCol; j++) { const y = X(A.colY(j)); rect(v, 'COFFRAGE', y - A.D / 2, A.zDS, y + A.D / 2, zHautCorps); v.cylindre(y - A.D / 2, y + A.D / 2, A.zDS, zHautCorps); v.ligne('AXES', [y, A.zDS - 0.3], [y, A.zT + 0.4]); }
    rect(v, 'COFFRAGE', -w / 2, zHautCorps, w / 2, A.zT);
    v.texte('TEXTES', [w * 0.3, (zHautCorps + A.zT) / 2], 'Chevêtre', { h: 2.6, ancre: 'c', v: 'm' });
    if (A.kind === 'culee' && A.type === 'apparente' && A.C.hv > 0) rect(v, 'COFFRAGE', -w / 2, zHautCorps - A.C.hv, w / 2, zHautCorps);
  }
  // garde-grève (culées), vu au-dessus du sommier, derrière les appareils
  if (A.kind === 'culee') { rect(v, 'COFFRAGE', -w / 2, A.zT, w / 2, A.zT + A.hGG); v.texte('TEXTES', [w * 0.3, A.zT + A.hGG / 2], 'Garde-grève', { h: 2.4, ancre: 'c', v: 'm' }); }
  // bossages et appareils
  for (const y of A.ap.yb) {
    const x = X(y), bb = A.ap.b + 2 * DEB;
    rect(v, 'COFFRAGE', x - bb / 2, A.zT, x + bb / 2, A.zT + A.hBos);
    rect(v, 'APPAREILS', x - A.ap.b / 2, A.zT + A.hBos, x + A.ap.b / 2, A.zSF);
    v.ligne('APPAREILS', [x - A.ap.b / 2, (A.zT + A.hBos + A.zSF) / 2], [x + A.ap.b / 2, (A.zT + A.hBos + A.zSF) / 2]);
  }
  // tablier (silhouette)
  if (A.kind === 'pile') {
    const ys = []; for (let y = -G.b; y <= G.b + 1e-9; y += 0.5) ys.push(y);
    const d0 = G.dessous(0), z = y => A.zSF + (G.dessous(y) - d0), zh = y => A.zSF + (G.dessus(y) - d0);
    v.poly('VUES', [...ys.map(y => [X(y), z(y)]), ...ys.slice().reverse().map(y => [X(y), zh(y)])], true);
    v.texte('TEXTES', [0, A.zSF + G.h + 0.25], 'tablier', { h: 2.2, ancre: 'c' });
  }
  // pieux
  if (A.pieux) for (let k = 0; k < A.nP; k++) {
    const y = A.pieuY(k), Lv = Math.min(A.Lp, 2.5);
    v.poly('COFFRAGE', [[y - A.Dp / 2, A.zSS - Lv], [y - A.Dp / 2, A.zSS], [y + A.Dp / 2, A.zSS], [y + A.Dp / 2, A.zSS - Lv]]);
    rupture(v, y - A.Dp / 2, y + A.Dp / 2, A.zSS - Lv);
    v.cylindre(y - A.Dp / 2, y + A.Dp / 2, A.zSS - Lv + 0.15, A.zSS - 0.10);
    v.ligne('AXES', [y, A.zSS + 0.2], [y, A.zSS - Lv - 0.3]);
  }
  if (A.pieux) v.texte('TEXTES', [A.pieuY(A.nP - 1) + A.Dp / 2 + 0.25, A.zSS - 1.6], `${A.nF * A.nP} pieux Ø ${fr(A.Dp)}, L = ${fr(A.Lp)}`, { h: 2.5, ancre: 'g' });
  // terrain naturel
  const xT = A.Lf / 2 + 1.2;
  v.terrain([[-xT, A.zTN], [-A.Lf / 2 - 0.15, A.zTN]]); v.terrain([[A.Lf / 2 + 0.15, A.zTN], [xT, A.zTN]]);
  v.texte('TEXTES', [-xT, A.zTN + 0.08], 'TN', { h: 2.4, ancre: 'g' });
  // axe de l'ouvrage
  v.ligne('AXES', [0, A.zSS - (A.pieux ? 3.0 : 0.6)], [0, A.zSF + G.h + 0.8]);
  // cotes horizontales
  const zb = A.zSS - (A.pieux ? 3.3 : 0.9);
  v.coteH([-A.Lf / 2, A.zSS], [A.Lf / 2, A.zSS], zb);
  const lCorps = A.kind === 'pile' && A.type !== 'colonnes' ? A.Lv : w;
  if (Math.abs(lCorps - A.Lf) > 1e-6) v.coteH([-lCorps / 2, A.zT], [lCorps / 2, A.zT], A.zSF + G.h + (A.kind === 'culee' ? A.hGG : 0.3) + 0.6);
  if (A.nCol) { const ys = Array.from({ length: A.nCol }, (_, j) => X(A.colY(j))).sort((p, q) => p - q); for (let k = 0; k + 1 < ys.length; k++) v.coteH([ys[k], A.zDS], [ys[k + 1], A.zDS], zb + 0.55); }
  if (A.pieux && A.nP > 1) { for (let k = 0; k + 1 < A.nP; k++) v.coteH([A.pieuY(k), A.zSS - 2.5], [A.pieuY(k + 1), A.zSS - 2.5], zb + 0.55); }
  // cotes verticales (à gauche)
  const xv = -A.Lf / 2 - 0.9, zs = [A.zSS, A.zDS, ...(A.hc > 0 ? [A.zT - A.hc] : []), A.zT, ...(A.kind === 'culee' ? [A.zT + A.hGG] : [])];
  for (let k = 0; k + 1 < zs.length; k++) v.coteV([-A.Lf / 2, zs[k]], [-A.Lf / 2, zs[k + 1]], xv);
  // niveaux (à droite)
  const xn = Math.max(A.Lf, w) / 2 + 0.4;
  v.niveau([xn, A.zT], A.zT, A.kind === 'culee' && A.type === 'remblayee' ? 'sommier' : A.hc > 0 ? 'chevêtre' : 'tête');
  v.niveau([A.Lf / 2 + 0.2, A.zDS], A.zDS, 'semelle');
  v.niveau([A.Lf / 2 + 0.2, A.zSS], A.zSS, 'fond');
  if (A.kind === 'culee') v.niveau([xn, A.zT + A.hGG], A.zT + A.hGG, 'GG');
  if (A.pieux) v.niveau([A.pieuY(A.nP - 1) + A.Dp / 2 + 0.2, A.zSS - 2.5], A.zPP, 'pointe');
  return v;
}

/* ------------------------------------------------------------------------------ coupe dans l'axe de l'ouvrage */
export function vueCoupe(A, { longueurPieux = 2.5 } = {}) {
  const v = new Vue(`COUPE DANS L'AXE DE L'OUVRAGE — ${A.nom}`), G = A.G, S = A.sgn, X = x => S * x;
  const xs = (a, b) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
  const box = (a, b, z0, z1) => { const [p, q] = xs(a, b); coupe(v, p, z0, q, z1); };
  const zH = A.zT - A.hc;
  // fondation, béton de propreté
  const xS = [A.xFut - A.B / 2, A.xFut + A.B / 2];
  box(xS[0], xS[1], A.zSS, A.zDS);
  { const [p, q] = xs(xS[0], xS[1]); v.proprete(p, q, A.zSS); }
  { const [p, q] = xs(xS[0], xS[1]), xe = S > 0 ? q + 0.10 : p - 0.10, xt = xe + S * 1.0;
    v.ligne('REPERES', [xe - S * 0.3, A.zSS - 0.05], [xt, A.zSS - 0.55]);
    v.texte('TEXTES', [xt + S * 0.05, A.zSS - 0.55], 'Béton de propreté ép. 10 cm', { h: 2.2, ancre: S > 0 ? 'g' : 'd', v: 'm' }); }
  if (A.kind === 'pile') {
    if (A.type === 'colonnes') { box(-A.D / 2, A.D / 2, A.zDS, zH); box(-A.lc / 2, A.lc / 2, zH, A.zT); }
    else { const p = [[-A.b / 2, A.zDS], [A.b / 2, A.zDS], [A.bTop / 2, A.zT], [-A.bTop / 2, A.zT]]; v.poly('COFFRAGE', p, true); v.hachure(p); }
  } else if (A.type === 'remblayee') {
    box(A.xMur[0], A.xMur[1], A.zDS, A.zT - A.hSom);
    box(A.xSom[0], A.xSom[1], A.zT - A.hSom, A.zT);
    box(A.xGGar, A.xGGav, A.zT, A.zT + A.hGG);
  } else {
    box(A.xFut - A.D / 2, A.xFut + A.D / 2, A.zDS, zH);
    box(A.xChev[0], A.xChev[1], zH, A.zT);
    box(A.xGGar, A.xGGav, A.zT, A.zT + A.hGG);
    if (A.type === 'apparente' && A.C.hv > 0) box(A.xGGar, A.xGGar + 0.3, zH - A.C.hv, zH);
  }
  // mur en retour (vu au-delà du plan de coupe) et dalle de transition
  if (A.kind === 'culee') {
    const xr = A.xGGar, top = A.zT + A.hGG;
    const p = [[X(xr), top], [X(xr - A.Lret), top], [X(xr - A.Lret), top - 0.8], [X(xr), Math.max(A.zDS, top - (A.Hm + A.hGG))]];
    v.poly('VUES', p, false);
    v.texte('TEXTES', [X(xr - A.Lret / 2), top + 0.12], `mur en retour, L = ${fr(A.Lret)}, e = ${fr(A.eRet)}`, { h: 2.2, ancre: 'c' });
    if (A.dalle) {
      const zt = A.zCh - 0.6, p2 = [[X(xr), zt], [X(xr - A.dalle.L), zt], [X(xr - A.dalle.L), zt - A.dalle.e], [X(xr), zt - A.dalle.e]];
      v.poly('VUES', p2, true);
      v.texte('TEXTES', [X(xr - A.dalle.L / 2), zt - A.dalle.e - 0.32], `dalle de transition ${fr(A.dalle.L)} × ${fr(A.dalle.e)}`, { h: 2.2, ancre: 'c' });
    }
  }
  // bossage, appareil, tablier (silhouette)
  const ba = A.ap.a + 2 * DEB;
  box(-ba / 2, ba / 2, A.zT, A.zT + A.hBos);
  { const [p, q] = xs(-A.ap.a / 2, A.ap.a / 2); rect(v, 'APPAREILS', p, A.zT + A.hBos, q, A.zSF); }
  const xd0 = A.kind === 'culee' ? A.xGGav + GG.joint : -3.5, xd1 = 3.5;
  { const [p, q] = xs(xd0, xd1); v.poly('VUES', [[p, A.zSF], [q, A.zSF], [q, A.zSF + G.h], [p, A.zSF + G.h]], true); }
  v.texte('TEXTES', [X(2.0), A.zSF + G.h + 0.15], 'tablier', { h: 2.2, ancre: 'c' });
  // pieux (inclinaison éventuelle)
  if (A.pieux) for (let f = 0; f < A.nF; f++) {
    const x = A.xFut + A.fileX(f), om = A.incl(f), L = Math.min(A.Lp, longueurPieux), dx = Math.tan(om) * L;
    const a = [X(x - A.Dp / 2), A.zSS], b = [X(x + A.Dp / 2), A.zSS], c = [X(x + A.Dp / 2 + dx), A.zSS - L], d = [X(x - A.Dp / 2 + dx), A.zSS - L];
    v.poly('COFFRAGE', [d, a]); v.poly('COFFRAGE', [b, c]);
    if (L >= A.Lp - 1e-9) v.poly('COFFRAGE', [d, c]); else rupture(v, Math.min(c[0], d[0]), Math.max(c[0], d[0]), A.zSS - L);
    if (Math.abs(om) < 1e-6) v.cylindre(Math.min(a[0], b[0]), Math.max(a[0], b[0]), A.zSS - L + 0.15, A.zSS - 0.10, 7);
    v.ligne('AXES', [X(x), A.zSS + 0.2], [X(x + dx * 1.15), A.zSS - L * 1.15]);
  }
  // terrain naturel
  const xm = Math.max(Math.abs(xS[0]), Math.abs(xS[1])) + 1.2, xl = A.kind === 'culee' ? Math.max(xm, A.Lret + 1.5) : xm;
  { const [p, q] = xs(xS[0], xS[1]); v.terrain([[-xl, A.zTN], [p - 0.15, A.zTN]]); v.terrain([[q + 0.15, A.zTN], [xl, A.zTN]]); }
  v.texte('TEXTES', [-xl, A.zTN + 0.08], 'TN', { h: 2.4, ancre: 'g' });
  // remblai derrière la culée (côté opposé à la travée), jusqu'au niveau du dessus du garde-grève
  if (A.kind === 'culee') {
    const top = A.zT + A.hGG, xd = A.xGGar, xf = -Math.max(xl, A.Lret + 1.5) * 1 + 0, zb = Math.max(A.zTN, A.zDS);
    const pts = [[X(xd), top], [X(xd - (xl - Math.abs(xd))), top], [X(xd - (xl - Math.abs(xd))), zb], [X(Math.min(xd, xS[0])), zb]];
    v.pointille(pts, 3.2); void xf;
  }
  // axe des appareils
  v.ligne('AXES', [0, A.zSS - (A.pieux ? 3.0 : 0.5)], [0, A.zSF + G.h + 0.6]);
  v.texte('TEXTES', [0, A.zSF + G.h + 0.75], 'axe des appareils', { h: 2.2, ancre: 'c' });
  // cotes
  const zb = A.zSS - (A.pieux ? 3.3 : 0.8);
  { const [p, q] = xs(xS[0], xS[1]); v.coteH([p, A.zSS], [q, A.zSS], zb); }
  if (A.pieux && A.nF > 1) for (let f = 0; f + 1 < A.nF; f++) v.coteH([X(A.xFut + A.fileX(f)), A.zSS - 2.5], [X(A.xFut + A.fileX(f + 1)), A.zSS - 2.5], zb + 0.5);
  const zh = A.zT + (A.kind === 'culee' ? A.hGG : 0) + 0.5;
  if (A.kind === 'pile') {
    if (A.type === 'colonnes') v.coteH([-A.lc / 2, A.zT], [A.lc / 2, A.zT], zh);
    else { v.coteH([-A.bTop / 2, A.zT], [A.bTop / 2, A.zT], zh); if (A.bTop !== A.b) v.coteH([-A.b / 2, A.zDS], [A.b / 2, A.zDS], A.zDS + 0.4); }
  } else if (A.type === 'remblayee') {
    const ch = [A.xGGar, A.xGGav, A.xSom[1]].map(X).sort((p, q) => p - q);
    v.coteH([ch[0], A.zT + A.hGG], [ch[1], A.zT + A.hGG], zh); v.coteH([ch[1], A.zT], [ch[2], A.zT], zh);
    const [p, q] = xs(A.xMur[0], A.xMur[1]); v.coteH([p, A.zDS], [q, A.zDS], A.zDS + 0.45);
  } else {
    const [p, q] = xs(A.xChev[0], A.xChev[1]); v.coteH([p, A.zT], [q, A.zT], zh);
  }
  // niveaux
  const xn = (S > 0 ? Math.max(xS[1], 1.2) : Math.max(-xS[0], 1.2)) + 0.4;
  v.niveau([xn, A.zT], A.zT); v.niveau([xn, A.zDS], A.zDS); v.niveau([xn, A.zSS], A.zSS);
  if (Math.min(Math.abs(A.zTN - A.zDS), Math.abs(A.zTN - A.zSS)) > 0.2) v.niveau([xn, A.zTN], A.zTN, 'TN');
  if (A.niv) v.niveau([X(2.6), A.zSF + G.h + G.tRev], A.zCh, 'chaussée');
  return v;
}

/* ----------------------------------------------------------------------------------- vue en plan de la fondation */
export function vuePlan(A) {
  const v = new Vue(`VUE EN PLAN — FONDATION ET CORPS DE L'APPUI ${A.nom}`), X = y => -y, S = A.sgn, w = A.width;
  const xS = [A.xFut - A.B / 2, A.xFut + A.B / 2].map(x => S * x).sort((p, q) => p - q);
  rect(v, 'COFFRAGE', -A.Lf / 2, xS[0], A.Lf / 2, xS[1]);
  // corps de l'appui coupé au-dessus de la semelle (hachuré)
  const hach = (a, b, c, d) => { const p = [[a, c], [b, c], [b, d], [a, d]]; v.poly('COFFRAGE', p, true); v.hachure(p); };
  if (A.kind === 'pile') {
    if (A.type === 'colonnes') for (let j = 0; j < A.nCol; j++) { v.cercle('COFFRAGE', [X(A.colY(j)), 0], A.D / 2); }
    else hach(-A.Lv / 2, A.Lv / 2, -A.b / 2, A.b / 2);
  } else if (A.type === 'remblayee') {
    const [p, q] = [S * A.xMur[0], S * A.xMur[1]].sort((a, b) => a - b); hach(-w / 2, w / 2, p, q);
  } else for (let j = 0; j < A.nCol; j++) v.cercle('COFFRAGE', [X(A.colY(j)), S * A.xFut], A.D / 2);
  // murs en retour (suspendus, au-dessus : tirets)
  if (A.kind === 'culee') for (const sg of [-1, 1]) {
    const y0 = sg * (w / 2 - A.eRet / 2), xr = A.xGGar;
    const [p, q] = [S * xr, S * (xr - A.Lret)].sort((a, b) => a - b);
    v.poly('VUES', [[y0 - A.eRet / 2, p], [y0 + A.eRet / 2, p], [y0 + A.eRet / 2, q], [y0 - A.eRet / 2, q]], true);
  }
  // pieux (sous la semelle : tirets)
  if (A.pieux) for (let f = 0; f < A.nF; f++) for (let k = 0; k < A.nP; k++) {
    const c = [A.pieuY(k), S * (A.xFut + A.fileX(f))];
    v.cercle('VUES', c, A.Dp / 2); v.ligne('AXES', [c[0] - A.Dp * 0.7, c[1]], [c[0] + A.Dp * 0.7, c[1]]); v.ligne('AXES', [c[0], c[1] - A.Dp * 0.7], [c[0], c[1] + A.Dp * 0.7]);
  }
  // axes : axe de l'appui (appareils) et axe de l'ouvrage
  v.ligne('AXES', [-A.Lf / 2 - 1.0, 0], [A.Lf / 2 + 1.0, 0]);
  v.texte('TEXTES', [A.Lf / 2 + 1.1, 0], `axe ${A.nom}`, { h: 2.4, ancre: 'g', v: 'm' });
  v.ligne('AXES', [0, xS[0] - 0.8], [0, xS[1] + 0.8]);
  v.texte('TEXTES', [0, xS[1] + 0.95], 'axe de l\'ouvrage', { h: 2.2, ancre: 'c' });
  // flèche : côté travée
  const ft = S * (A.kind === 'culee' ? 1 : 1) * (xS[1] - xS[0]) / 2;
  v.texte('TEXTES', [-A.Lf / 2, xS[1] + 0.35], A.kind === 'culee' ? (A.sgn > 0 ? 'côté travée ↑' : 'côté travée ↓') : `vers ${A.G.nomLigne(A.i + 1)} ↑`, { h: 2.2, ancre: 'g' });
  void ft;
  // cotes
  v.coteH([-A.Lf / 2, xS[0]], [A.Lf / 2, xS[0]], xS[0] - 0.7);
  v.coteV([A.Lf / 2, xS[0]], [A.Lf / 2, xS[1]], A.Lf / 2 + 0.7);
  if (A.pieux) {
    if (A.nP > 1) for (let k = 0; k + 1 < A.nP; k++) v.coteH([A.pieuY(k), xS[1]], [A.pieuY(k + 1), xS[1]], xS[1] + 0.45);
    if (A.nF > 1) { const xf = Array.from({ length: A.nF }, (_, f) => S * (A.xFut + A.fileX(f))).sort((p, q) => p - q); for (let f = 0; f + 1 < A.nF; f++) v.coteV([-A.Lf / 2, xf[f]], [-A.Lf / 2, xf[f + 1]], -A.Lf / 2 - 0.6); }
  }
  return v;
}

/* --------------------------------------------------------------------------------------- quantités et notes */
export function quantitesAppui(A) {
  const w = A.width, Q = [];
  Q.push(['Semelle', A.B * A.Lf * A.hs]);
  if (A.kind === 'pile') {
    if (A.type === 'colonnes') { Q.push([`Colonnes (${A.nCol} × Ø ${fr(A.D)})`, A.nCol * Math.PI * A.D ** 2 / 4 * A.H]); if (A.hc > 0) Q.push(['Chevêtre', w * A.lc * A.hc]); }
    else Q.push(['Voile', A.Lv * (A.b + A.bTop) / 2 * A.H]);
  } else if (A.type === 'remblayee') {
    Q.push(['Mur de front', w * A.C.em * (A.Hm - A.hSom)]);
    Q.push(['Sommier', w * (A.xSom[1] - A.xSom[0]) * A.hSom]);
  } else {
    Q.push([`Colonnes (${A.nCol} × Ø ${fr(A.D)})`, A.nCol * Math.PI * A.D ** 2 / 4 * A.Hm]);
    Q.push(['Chevêtre', w * (A.xChev[1] - A.xChev[0]) * A.hc]);
    if (A.type === 'apparente' && A.C.hv > 0) Q.push(['Voile frontal', w * 0.3 * A.C.hv]);
  }
  if (A.kind === 'culee') {
    Q.push(['Garde-grève', w * GG.e * A.hGG]);
    Q.push(['Murs en retour (2)', 2 * A.eRet * A.Lret * (A.Hm + A.hGG) / 2]);
    if (A.dalle) Q.push(['Dalle de transition', w * A.dalle.L * A.dalle.e]);
  }
  Q.push([`Bossages (${A.ap.yb.length})`, A.ap.yb.length * (A.ap.a + 2 * DEB) * (A.ap.b + 2 * DEB) * A.hBos]);
  const pieux = A.pieux ? { n: A.nF * A.nP, ml: A.nF * A.nP * A.Lp, V: A.nF * A.nP * Math.PI * A.Dp ** 2 / 4 * A.Lp } : null;
  return { lignes: Q, total: Q.reduce((s, q) => s + q[1], 0), pieux };
}

/** Coupe une note longue en lignes d'au plus n caractères (retrait de 3 espaces après la première). */
export function couperNote(t, n = 92) {
  const out = []; let l = '';
  for (const w of t.split(' ')) { if ((l + ' ' + w).trim().length > n) { out.push(l); l = '   ' + w; } else l = (l ? l + ' ' : '') + w; }
  if (l) out.push(l); return out;
}

function notes(st, A) {
  const m = st.p.supports ? st.p.supports.mat : { fck: 25, fyk: 400, c: 0.05 };
  const CUBE = { 20: 25, 25: 30, 30: 37, 35: 45, 40: 50 };
  return [
    'NOTES',
    `1. Béton des appuis : C${m.fck}/${CUBE[m.fck] ?? Math.round(m.fck * 1.22)} ; béton de propreté sous la semelle, 10 cm.`,
    `2. Enrobage nominal ${fr(m.c * 100, 1)} cm (${fr(m.c * 100 + 2, 1)} cm sur les faces coffrées contre le sol). Aciers B500B.`,
    '3. Cotes en mètres. ' + (A.niv ? 'Niveaux en mètres, rattachés au plan de nivellement.' : 'Niveaux relatifs (m) : ±0,00 = dessus de la dalle à l\'axe.'),
    `4. Appareils d'appui ${A.ap.label} (${A.ap.yb.length}) sur bossages de ${fr(A.hBos)} m, débord ${fr(DEB)} m.`,
    A.kind === 'culee' ? '5. Remblai technique contigu à la culée, drainage et barbacanes à définir. Murs en retour suspendus.' : '5. Parements vus : coffrage soigné ; arêtes chanfreinées 2 × 2 cm.',
    A.pieux ? `6. Pieux ${st.p.supports.found.pileType || 'forés'} Ø ${fr(A.Dp)} m, recépage à la cote de sous-face de semelle.` : '6. Fond de fouille à réceptionner (portance du sol à vérifier à l\'ouverture).',
    ...(A.alerte ? couperNote('7. ATTENTION — ' + A.alerte) : []),
  ];
}

/* --------------------------------------------------------------------------------------------- la feuille */
export function planCoffrageAppui(st, i, cartouche = {}) {
  const A = geometrieAppui(st, i);
  const el = vueElevation(A), cp = vueCoupe(A), pl = vuePlan(A), db = vueDetailBossage(A);
  const Q = quantitesAppui(A);
  const lignes = Q.lignes.map(([d, v]) => [d, 'm³', fr(v, 2)]);
  lignes.push(Object.assign(['Total béton', 'm³', fr(Q.total, 2)], { gras: true }));
  if (Q.pieux) lignes.push([`Pieux (${Q.pieux.n} × Ø ${fr(A.Dp)})`, 'ml', fr(Q.pieux.ml, 1)], ['Béton des pieux', 'm³', fr(Q.pieux.V, 2)]);
  const tab = { titre: `QUANTITÉS — ${A.nom}`, cols: [{ t: 'Désignation', w: 92, a: 'g' }, { t: 'Unité', w: 22, a: 'c' }, { t: 'Quantité', w: 30, a: 'd' }], lignes, hl: 5, h: 2.1 };
  const tc = tableauCalage(A), hc = (tc.lignes.length + 2) * tc.hl;
  const N = notes(st, A), ht = (lignes.length + 2) * 5, hn = N.length * 2.2 * 1.6;
  // élévation et coupe dans l'axe en haut, vue en plan dessous (alignée sur l'élévation), tableaux au-dessus du cartouche
  const F = composer({ titre: `${A.kind === 'culee' ? 'CULÉE' : 'PILE'} ${A.nom} — PLAN DE COFFRAGE`, cartouche,
    rangees: [[el, cp], [pl, db]],
    groupes: [{ vues: [el, cp, pl], cible: 75, min: 20 }, { vues: [db], cible: 20, min: 10 }],
    aligner: [{ ref: el, vue: pl }],
    colonne: { largeur: 182, hauteur: 2 + ht + 5 + hc + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      F.tableau(tab, F.W - 10 - 146, y + 2);
      F.tableau(tc, F.W - 10 - 146, y + 2 + ht + 5);
      F.note(N, F.W - 10 - 180 + 2, y + 2 + ht + 5 + hc + 6 + hn - 2.2 * 0.6, 2.2);
      F.notes[F.notes.length - 1].titreGras = true;
    } });
  F.cartouche.echelles = F.cartouche.echelles || `1/${el.echelle} ; 1/${db.echelle}`;
  return F;
}

/**
 * Détail du bossage et du plot de vérinage (coupe suivant la ligne d'appui, appareil extrême) : sous-face du tablier,
 * appareil d'appui, bossage en micro-béton, plot de vérinage voisin (même dessus que le bossage : la hauteur de l'appareil
 * reste libre pour les vérins plats lors d'un remplacement), surface de repiquage du chevêtre ou du sommier.
 */
export function vueDetailBossage(A) {
  const v = new Vue(`DÉTAIL BOSSAGE ET PLOT DE VÉRINAGE — ${A.nom}`), b = A.ap.b, hA = A.hApp, hB = A.hBos;
  const bb = b + 2 * DEB, wp = 0.40, ec = 0.15, yp = bb / 2 + ec + wp / 2;   // plot 0,40 × 0,40 à 15 cm du bossage
  const z0 = 0, zB = z0 + hB, zA = zB + hA, yL = -bb / 2 - 0.25, yR = yp + wp / 2 + 0.25;
  // chevêtre (coupé) et tablier (coupé), avec ruptures
  const ch = [[yL, z0 - 0.18], [yR, z0 - 0.18], [yR, z0], [yL, z0]]; v.poly('COFFRAGE', ch, true); v.hachure(ch);
  const tb = [[yL, zA], [yR, zA], [yR, zA + 0.12], [yL, zA + 0.12]]; v.poly('COFFRAGE', tb, true); v.hachure(tb);
  // bossage, appareil (frettes figurées), plot de vérinage
  rect(v, 'COFFRAGE', -bb / 2, z0, bb / 2, zB);
  rect(v, 'APPAREILS', -b / 2, zB, b / 2, zA);
  const nf = Math.max(2, Math.round(hA / 0.015)); for (let k = 1; k < nf; k++) v.ligne('APPAREILS', [-b / 2 + 0.01, zB + hA * k / nf], [b / 2 - 0.01, zB + hA * k / nf]);
  rect(v, 'COFFRAGE', yp - wp / 2, z0, yp + wp / 2, zB);
  v.ligne('VUES', [yL, z0 - 0.05], [yR, z0 - 0.05]);
  // libellés
  const lab = (p, q, s) => { v.ligne('REPERES', p, q); v.texte('TEXTES', [q[0] + (q[0] >= p[0] ? 0.02 : -0.02), q[1]], s, { h: 2.2, ancre: q[0] >= p[0] ? 'g' : 'd', v: 'm' }); };
  const xl = yR + 0.08;
  lab([b / 4, zA + 0.06], [xl, zA + 0.30], 'Tablier');
  lab([b / 4, (zB + zA) / 2], [xl, zA + 0.14], `Appareil d'appui ${A.ap.label}`);
  lab([-bb / 4, zB / 2], [yL - 0.08, zA + 0.14], `Bossage ${fr(bb * 1000, 0)} × ${fr((A.ap.a + 2 * DEB) * 1000, 0)}, ép. ${fr(hB * 100, 0)} cm`);
  lab([-bb / 4, zB * 0.3], [yL - 0.08, z0 + 0.02], 'micro-béton dosé à 500 kg/m³');
  lab([yp, zB * 0.6], [xl, zB * 0.4], `Plot de vérinage ${fr(wp)} × ${fr(wp)}`);
  lab([yp - wp / 2 - 0.05, z0 - 0.05], [xl, z0 - 0.12], 'Surface de repiquage, épaisseur min. 5 cm');
  lab([0, z0 - 0.12], [yL - 0.08, z0 - 0.12], A.kind === 'culee' && A.type === 'remblayee' ? 'Sommier' : A.hc > 0 ? 'Chevêtre' : 'Tête de l\'appui');
  // cotes
  v.coteH([-b / 2, zA], [b / 2, zA], zA + 0.30);
  v.coteH([-bb / 2, z0], [bb / 2, z0], z0 - 0.38);
  v.coteH([bb / 2, z0], [yp - wp / 2, z0], z0 - 0.38);
  v.coteH([yp - wp / 2, z0], [yp + wp / 2, z0], z0 - 0.38);
  v.coteV([-bb / 2, z0], [-bb / 2, zB], -bb / 2 - 0.10);
  v.coteV([-b / 2, zB], [-b / 2, zA], -bb / 2 - 0.10);
  v.ligne('AXES', [0, z0 - 0.30], [0, zA + 0.42]);
  return v;
}

/** Lignes d'appui pour lesquelles un plan est disponible. */
export function appuisDisponibles(st) {
  if (!st || !st.supports || !st.supports.lines || st.supportsError) return [];
  return st.supports.lines.map((_, i) => i);
}
