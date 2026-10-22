/**
 * Plan de coffrage du tablier : vue en plan, coupe longitudinale développée suivant l'axe, coupes transversales en
 * travée et sur appui, notes et quantités. Une feuille A1 (ou A0 pour les grands ouvrages).
 *
 * Conventions : cotes en m, niveaux en m (NGF quand un plan de nivellement est saisi, sinon relatifs au dessus de la
 * dalle à l'axe sur C0). Coupes transversales vues de C0 vers la dernière culée : la gauche de l'axe (y > 0) est à
 * gauche du dessin (x = −y).
 */
import { Vue, Feuille, fmtCote, fmtNiv } from './dessin.js';
import { composer } from './mise_en_page.js';
import { geometrie, courbeU } from './geometrie.js';
import { dessinerBord, bordGeom, gargouilles, vueDetailBord } from './equipements.js';

const GG = { e: 0.30, joint: 0.05 };   // garde-grève : épaisseur, joint de chaussée (m)
const TROTTOIR = 0.20;                // hauteur des bordures de trottoir (m)

/** Ligne de rupture (zigzag) horizontale de x0 à x1 à l'altitude z. */
function rupture(v, x0, x1, z, amp = 0.12) {
  const xm = (x0 + x1) / 2, w = Math.min(0.25, (x1 - x0) / 6);
  v.poly('COFFRAGE', [[x0 - 0.1, z], [xm - w, z], [xm - w / 2, z + amp], [xm + w / 2, z - amp], [xm + w, z], [x1 + 0.1, z]]);
}
const rect = (v, calque, x0, z0, x1, z1) => v.poly(calque, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);

/** Profil en travers de la dalle : polygone (y, z relatif au dessus à l'axe), avec les cassures du dévers et des chanfreins. */
function profilDalle(G) {
  const b = G.b, ch = G.g.chamfer, ys = new Set([-b, b, 0]);
  if (ch && ch.joue > 0) { ys.add(-b + ch.joue); ys.add(b - ch.joue); }
  for (let y = -b; y <= b; y += 0.5) ys.add(+y.toFixed(6));
  const Y = [...ys].filter(y => y >= -b - 1e-9 && y <= b + 1e-9).sort((p, q) => p - q);
  const haut = Y.map(y => [y, G.dessus(y)]), bas = Y.slice().reverse().map(y => [y, G.dessous(y)]);
  return { haut, bas, poly: [...haut, ...bas] };
}

function niveauxLigne(G, i) {
  if (!G.niv) return null;
  const L = G.niv.lignes[i];
  return L ? { zCh: L.zCh, zSF: L.zSF, zT: L.zT, hBos: L.hBos, hApp: L.hApp, zTN: L.zTN } : null;
}

/* ------------------------------------------------------------------------------------------------ vue en plan */
export function vuePlan(G, eq = null) {
  const v = new Vue('VUE EN PLAN'), { b, uA, uB, x0, n } = G;
  // contour
  const gauche = courbeU(G, b, uA, uB, x0), droite = courbeU(G, -b, uA, uB, x0).reverse();
  v.poly('COFFRAGE', [...gauche, ...droite], true);
  // joues des chanfreins (arêtes vues par-dessous : tirets) et bordures de trottoir
  const ch = G.g.chamfer;
  if (ch && ch.joue > 0) for (const s of [-1, 1]) v.poly('VUES', courbeU(G, s * (b - ch.joue), uA, uB, x0));
  for (const fw of G.g.footways || []) for (const y of [fw.y1, fw.y2]) if (Math.abs(Math.abs(y) - b) > 1e-6) v.poly('VUES', courbeU(G, y, uA, uB, x0));
  // équipements : nu extérieur des corniches, axe des dispositifs de retenue, gargouilles
  if (eq) for (const sg of [1, -1]) {
    const B = bordGeom(G, eq, sg);
    if (B.corniche) v.poly('EQUIPEMENTS', courbeU(G, sg * (b + eq.cornE), uA, uB, x0));
    if (B.dispositif) v.poly('EQUIPEMENTS', courbeU(G, B.dispositif.y, uA, uB, x0));
  }
  if (eq) for (const g of gargouilles(G, eq)) v.cercle('EQUIPEMENTS', G.pt(g.u, g.y), eq.gargD / 2 + 0.05);
  // axe longitudinal et lignes d'appui
  v.poly('AXES', courbeU(G, 0, uA - 1.5, uB + 1.5, x0));
  x0.forEach((u, i) => {
    v.ligne('AXES', G.pt(u, -b - 1.2), G.pt(u, b + 1.2));
    v.texte('TEXTES', G.pt(u, b + 1.6), G.nomLigne(i), { h: 3.5, ancre: 'c', gras: true });
    // appareils (sous la dalle) : a perpendiculaire à la ligne d'appui, b le long de la ligne
    const ap = G.appareils[i], P0 = G.pt(u, 0), P1 = G.pt(u, 1), t = [P1[0] - P0[0], P1[1] - P0[1]], lt = Math.hypot(...t);
    const T = [t[0] / lt, t[1] / lt], N = [T[1], -T[0]];
    for (const y of ap.yb) {
      const c = G.pt(u, y), ha = ap.a / 2, hb = ap.b / 2;
      v.poly('APPAREILS', [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [c[0] + p * ha * N[0] + q * hb * T[0], c[1] + p * ha * N[1] + q * hb * T[1]]), true);
    }
  });
  // biais
  const psi = G.psiL[0];
  if (Math.abs(psi - 100) > 1e-6 && !G.courbe) v.texte('TEXTES', G.pt(x0[0], -b - 5.2), `Biais ψ = ${psi.toFixed(2).replace('.', ',')} gr`, { h: 2.5, ancre: 'c' });
  // cotes : travées (le long de l'axe, en développé), longueur totale, largeur
  if (!G.courbe) {
    const pts = [uA, ...x0, uB].filter((u, k, a) => k === 0 || u - a[k - 1] > 1e-6);
    const bord = u => G.pt(u, -b);   // biais uniforme : les écarts sur le bord égalent les écarts sur l'axe
    for (let k = 0; k + 1 < pts.length; k++) v.coteH(bord(pts[k]), bord(pts[k + 1]), -b - 2.8);
    v.coteH(bord(uA), bord(uB), -b - 4.2);
    const xg = Math.min(G.pt(uA, -b)[0], G.pt(uA, b)[0]) - 0.8;
    v.coteV(G.pt(uA, -b), G.pt(uA, b), xg - 2.6);
    // trottoirs et chaussée
    const cuts = [-b, ...(G.g.footways || []).flatMap(f => [f.y1, f.y2]), b].filter((y, k, a) => a.indexOf(y) === k).sort((p, q) => p - q);
    if (cuts.length > 2) for (let k = 0; k + 1 < cuts.length; k++) v.coteV(G.pt(uA, cuts[k]), G.pt(uA, cuts[k + 1]), xg - 1.2);
  }
  if (G.courbe) {   // ouvrage courbe : longueurs développées le long de l'axe et rayon minimal
    const pts = [uA, ...x0, uB].filter((u, k, a) => k === 0 || u - a[k - 1] > 1e-6);
    for (let k = 0; k + 1 < pts.length; k++) {
      const um = (pts[k] + pts[k + 1]) / 2, P0 = G.pt(um - 0.5, 0), P1 = G.pt(um + 0.5, 0);
      const ang = Math.atan2(P1[1] - P0[1], P1[0] - P0[0]) * 180 / Math.PI;
      v.texte('COTES', G.pt(um, 0.35), `${fmtCote(pts[k + 1] - pts[k])} (dév.)`, { h: 2.5, ancre: 'c', angle: ang });
    }
    const R = G.rayonMin;
    if (R && isFinite(R)) v.texte('TEXTES', G.pt(x0[0], -b - 2.6), `Axe en courbe : rayon minimal ${fmtCote(R)} m — longueur développée ${fmtCote(uB - uA)} m`, { h: 2.5, ancre: 'g' });
  }
  // flèche du sens de la coupe longitudinale et repères des coupes transversales
  const um = (x0[0] + x0[1]) / 2;
  repereCoupe(v, G, um, 'A');
  repereCoupe(v, G, x0[Math.min(1, n - 1)], 'B', 0.9);
  return v;
}

/** Trait de coupe transversale (A-A, B-B) à l'abscisse u. */
function repereCoupe(v, G, u, lettre, du = 0) {
  const b = G.b, uu = u + du;
  for (const s of [-1, 1]) {
    const a = G.pt(uu, s * (b + 0.4)), c = G.pt(uu, s * (b + 1.4));
    v.ligne('AXES', a, c);
    const fl = G.pt(uu + 0.9, s * (b + 1.4));
    v.ligne('COFFRAGE', c, fl);
    v.poly('COFFRAGE', [fl, G.pt(uu + 0.55, s * (b + 1.25)), G.pt(uu + 0.55, s * (b + 1.55))], true);
    v.texte('TEXTES', G.pt(uu + 0.5, s * (b + 2.1)), lettre, { h: 4, ancre: 'c', v: 'm', gras: true });
  }
}

/* --------------------------------------------------------------------------- coupe longitudinale développée */
function vueElevation(G, st) {
  const v = new Vue('COUPE LONGITUDINALE DÉVELOPPÉE SUIVANT L\'AXE'), { uA, uB, x0, n, h } = G;
  const sup = st.p.supports || {}, pile = sup.pile || {}, culee = sup.culee || {};
  // altitudes du dessus de la dalle à l'axe : nivellement (chaussée − revêtement) ou relatives
  const NV = x0.map((_, i) => niveauxLigne(G, i));
  const zDessus = u => {
    if (!NV[0]) return 0;
    const zs = NV.map(q => q.zCh - G.tRev);
    if (u <= x0[0]) return zs[0] + (zs[1] - zs[0]) * (u - x0[0]) / (x0[1] - x0[0]);
    for (let i = 0; i + 1 < n; i++) if (u <= x0[i + 1] + 1e-9) return zs[i] + (zs[i + 1] - zs[i]) * (u - x0[i]) / (x0[i + 1] - x0[i]);
    return zs[n - 1] + (zs[n - 1] - zs[n - 2]) * (u - x0[n - 1]) / (x0[n - 1] - x0[n - 2]);
  };
  const e0 = G.dessous(0) - G.dessus(0);   // épaisseur à l'axe (négative)
  const us = [uA, ...x0, uB];
  const haut = us.map(u => [u, zDessus(u)]), bas = us.slice().reverse().map(u => [u, zDessus(u) + e0]);
  const dalle = [...haut, ...bas];
  v.poly('COFFRAGE', dalle, true); v.hachure(dalle);
  // revêtement
  v.poly('VUES', us.map(u => [u, zDessus(u) + G.tRev]));
  const attache = new Map(us.map(u => [u, zDessus(u) + e0]));   // point d'attache des cotes de travées
  x0.forEach((u, i) => {
    const ap = G.appareils[i], zsf = zDessus(u) + e0, nv = NV[i];
    const hApp = ap.h, hBos = nv ? nv.hBos : 0.10, zT = nv ? nv.zT : zsf - hApp - hBos;
    // appareil, bossage
    rect(v, 'APPAREILS', u - ap.a / 2, zsf - hApp, u + ap.a / 2, zsf);
    rect(v, 'COFFRAGE', u - ap.a / 2 - 0.10, zT, u + ap.a / 2 + 0.10, zsf - hApp);
    // chevêtre ou sommier, amorce de l'appui
    const estCulee = i === 0 || i === n - 1, P = estCulee ? culee : pile;
    const lc = P.lc || (estCulee ? 1.2 : 1.0), hc = P.hc || (estCulee ? 0.8 : 0);
    let x1 = u - lc / 2, x2 = u + lc / 2;
    if (estCulee) {   // le sommier est tenu derrière le garde-grève
      const s = i === 0 ? -1 : 1, about = i === 0 ? uA : uB, xgg = about + s * GG.joint;
      const xint = xgg + s * GG.e;
      if (s < 0) { x1 = Math.min(x1, xint); } else { x2 = Math.max(x2, xint); }
      // garde-grève : du sommier au niveau de la chaussée
      const zg = zDessus(about) + G.tRev;
      rect(v, 'COFFRAGE', Math.min(xgg, xint), zT, Math.max(xgg, xint), zg);
      v.hachure([[Math.min(xgg, xint), zT], [Math.max(xgg, xint), zT], [Math.max(xgg, xint), zg], [Math.min(xgg, xint), zg]]);
    }
    const hBloc = hc > 0 ? hc : 0.6;
    v.poly('COFFRAGE', [[x1, zT - hBloc - 0.6], [x1, zT], [x2, zT], [x2, zT - hBloc - 0.6]]);
    if (hc > 0) {
      // fût ou mur sous le chevêtre / sommier
      const ep = estCulee ? (culee.em || 0.8) : (pile.type === 'voile' ? (pile.b || 0.6) : (pile.D || 0.8));
      const xm = estCulee ? (i === 0 ? x1 + ep / 2 : x2 - ep / 2) : u;
      v.ligne('VUES', [x1, zT - hc], [xm - ep / 2, zT - hc]); v.ligne('VUES', [xm + ep / 2, zT - hc], [x2, zT - hc]);
    }
    rupture(v, x1, x2, zT - hBloc - 0.6);
    // axe d'appui et nom
    v.ligne('AXES', [u, zDessus(u) + G.tRev + 1.0], [u, zT - hBloc - 1.0]);
    attache.set(u, zT - hBloc - 1.0);
    v.texte('TEXTES', [u, zDessus(u) + G.tRev + 1.3], G.nomLigne(i), { h: 3.5, ancre: 'c', gras: true });
    // niveaux
    if (nv) {
      v.niveau([u + 0.3, zDessus(u) + G.tRev], nv.zCh);
      v.niveau([x2 + 0.2, zT], zT);
    } else if (i === 0) {
      v.niveau([u + 0.3, zDessus(u)], 0, 'dessus dalle');
      v.niveau([u + ap.a / 2 + 0.3, zsf], zsf);
    }
  });
  // cotes : abouts et travées, épaisseur
  const zb = Math.min(...attache.values()) - 0.6;
  const pts = us.filter((u, k, a) => k === 0 || u - a[k - 1] > 1e-6);
  for (let k = 0; k + 1 < pts.length; k++) v.coteH([pts[k], attache.get(pts[k])], [pts[k + 1], attache.get(pts[k + 1])], zb);
  const um = (x0[0] + x0[1]) / 2;
  v.coteV([um, zDessus(um) + e0], [um, zDessus(um)], um + 0.8, fmtCote(-e0));
  return v;
}

/* ------------------------------------------------------------------------------------- coupes transversales */
function vueCoupe(G, st, { titre, appui = null, eq = null }) {
  const v = new Vue(titre), { b } = G, X = y => -y;
  const pr = profilDalle(G), ch = G.g.chamfer;
  const poly = pr.poly.map(([y, z]) => [X(y), z]);
  v.poly('COFFRAGE', poly, true); v.hachure(poly);
  // revêtement et trottoirs
  const rd = G.g.roadway || { y1: -b, y2: b };
  const Yr = []; for (let y = rd.y1; y <= rd.y2 + 1e-9; y += 0.5) Yr.push(y); if (Yr[Yr.length - 1] < rd.y2) Yr.push(rd.y2);
  v.poly('VUES', Yr.map(y => [X(y), G.dessus(y) + G.tRev]));
  if (eq) for (const sg of [1, -1]) {
    const { notes } = dessinerBord(v, G, eq, sg);
    if (sg > 0 && appui == null) {
      // désignations du bord gauche, à gauche de la coupe, reliées par des lignes de rappel (comme les dossiers d'ouvrages)
      const xt = X(b) - eq.cornE - 0.9, zs = notes.map(n => n[0][1]).sort((p, q) => q - p);
      const z0 = Math.max(...zs) + 0.15, pas = 0.32;
      notes.slice().sort((a2, b2) => b2[0][1] - a2[0][1]).forEach(([p, t], k) => {
        const z = z0 - k * pas; v.ligne('REPERES', p, [xt + 0.05, z]); v.cercle('REPERES', p, 0.02, true);
        v.texte('TEXTES', [xt, z], t.replace(/ \(schéma\)/, ''), { h: 2.4, ancre: 'd', v: 'm' });
      });
      const yr = -b * 0.25, pz = [X(yr), G.dessus(yr) + G.tRev];
      v.ligne('REPERES', pz, [X(yr) - 0.6, pz[1] + 0.9]);
      v.texte('TEXTES', [X(yr) - 0.65, pz[1] + 0.9], `Couche de roulement en béton bitumineux ép. ${fmtCote(G.tRev - eq.etanE).replace(/^0,/, '0,')} m ; étanchéité ép. ${fmtCote(eq.etanE)} m`, { h: 2.4, ancre: 'd', v: 'm' });
    }
  }
  else for (const fw of G.g.footways || []) {
    const z1 = G.dessus(fw.y1), z2 = G.dessus(fw.y2);
    v.poly('COFFRAGE', [[X(fw.y1), z1], [X(fw.y1), z1 + TROTTOIR], [X(fw.y2), z2 + TROTTOIR], [X(fw.y2), z2]]);
  }
  // axe
  // cotes : largeur totale, trottoirs / chaussée, épaisseurs
  const zc = Math.max(...pr.haut.map(p => p[1])) + (eq ? Math.max(eq.hDR, eq.hGC) + 0.30 : TROTTOIR + 0.5) + 0.3;
  v.ligne('AXES', [0, zc + 0.75], [0, G.dessous(0) - (appui != null ? 1.2 : 0.4)]);
  v.texte('TEXTES', [0, zc + 0.85], 'Axe', { h: 2.5, ancre: 'c' });
  const cuts = [-b, ...(G.g.footways || []).flatMap(f => [f.y1, f.y2]), b].filter((y, k, a) => a.indexOf(y) === k).sort((p, q) => p - q);
  const surTrottoir = y => (G.g.footways || []).some(f => y >= Math.min(f.y1, f.y2) - 1e-9 && y <= Math.max(f.y1, f.y2) + 1e-9);
  const haut = y => [X(y), G.dessus(y) + (surTrottoir(y) ? TROTTOIR : G.tRev)];
  for (let k = 0; k + 1 < cuts.length; k++) v.coteH(haut(cuts[k + 1]), haut(cuts[k]), zc);
  if (eq && appui == null) {   // chaîne de détail du bord gauche : corniche, dispositif, trottoir, chaussée
    const B = bordGeom(G, eq, 1), pts = [b + (B.corniche ? eq.cornE : 0), b];
    if (B.corniche) pts.push(b - eq.cornL);
    if (B.longrine) pts.push(B.longrine.c - eq.lgB / 2);
    if (B.fw) pts.push(Math.min(Math.abs(B.fw.y1), Math.abs(B.fw.y2)));
    const u = [...new Set(pts.map(d => +d.toFixed(4)))].sort((p2, q2) => q2 - p2), zd = G.dessus(b) + (eq ? Math.max(eq.hDR, eq.hGC) : 0) + 0.25;
    for (let k = 0; k + 1 < u.length; k++) v.coteH([X(u[k]), G.dessus(Math.min(u[k], b))], [X(u[k + 1]), G.dessus(u[k + 1])], zd);
  }
  v.coteH(haut(b), haut(-b), zc + 0.45);
  v.coteV([X(0), G.dessous(0)], [X(0), G.dessus(0)], X(0) + 0.6, fmtCote(G.dessus(0) - G.dessous(0)));
  if (ch && ch.joue > 0) {
    v.coteV([X(-b), G.dessous(-b)], [X(-b), G.dessus(-b)], X(-b) + 0.35, fmtCote(G.dessus(-b) - G.dessous(-b)));
    v.coteH([X(-b + ch.joue), G.dessous(-b + ch.joue)], [X(-b), G.dessous(-b)], G.dessous(0) - 0.35);
  }
  // dévers
  const dv = G.g.devers;
  if (dv && dv.p > 0) {
    const ys = dv.profil === 'unique' ? [b * 0.45] : [b * 0.45, -b * 0.45];
    for (const y of ys) {
      const z = G.dessus(y) + G.tRev + 0.12, sgn = G.dessus(y + 0.5) < G.dessus(y - 0.5) ? 1 : -1;   // la pente descend vers y + sgn
      v.texte('TEXTES', [X(y), z], `${dv.p.toFixed(1).replace('.', ',')} %`, { h: 2.5, ancre: 'c' });
      const xa = X(y + sgn * 0.75), d = X(y + sgn) - X(y) > 0 ? 1 : -1;   // flèche dans le sens de la pente
      v.poly('TEXTES', [[xa - d * 0.25, z + 0.03], [xa, z + 0.07], [xa - d * 0.25, z + 0.11]], true);
      v.ligne('TEXTES', [xa - d * 0.55, z + 0.07], [xa, z + 0.07]);
    }
  }
  if (appui != null) {
    const i = appui, ap = G.appareils[i], nv = niveauxLigne(G, i), zsf = G.dessous(0);
    const hBos = nv ? nv.hBos : 0.10, zT = zsf - ap.h - hBos;
    const sup = st.p.supports || {}, estCulee = i === 0 || i === G.n - 1, P = estCulee ? sup.culee || {} : sup.pile || {};
    for (const y of ap.yb) {
      const zl = G.dessous(y);
      rect(v, 'APPAREILS', X(y) - ap.b / 2, zl - ap.h, X(y) + ap.b / 2, zl);
      rect(v, 'COFFRAGE', X(y) - ap.b / 2 - 0.10, zT, X(y) + ap.b / 2 + 0.10, zl - ap.h);
    }
    // chevêtre ou sommier, sur la largeur du tablier
    const hc = Math.min(P.hc || 0.8, 1.0), xa = X(b) - 0.2, xb = X(-b) + 0.2;
    v.poly('COFFRAGE', [[xa, zT - hc - 0.25], [xa, zT], [xb, zT], [xb, zT - hc - 0.25]]);
    rupture(v, xa, xb, zT - hc - 0.25);
    // entraxes des appareils
    const yb = ap.yb.slice().sort((p, q) => q - p);
    const zr = zT - hc - 0.65;
    for (let k = 0; k + 1 < yb.length; k++) v.coteH([X(yb[k]), zT], [X(yb[k + 1]), zT], zr);
    v.texte('TEXTES', [0, zr - 0.45], `${ap.yb.length} appareils ${ap.label} sur bossages de ${fmtCote(hBos)}`, { h: 2.5, ancre: 'c', v: 'h' });
    if (nv) {
      v.niveau([0.5, G.dessus(0) + G.tRev], nv.zCh);
      v.niveau([X(yb[yb.length - 1]) + ap.b / 2 + 0.4, zT], nv.zT);
    }
  }
  return v;
}

/* ------------------------------------------------------------------------------------- quantités et notes */
export function quantitesCoffrage(st, G = geometrie(st)) {
  const pr = profilDalle(G), L = G.uB - G.uA;
  let A = 0; const P = pr.poly;
  for (let k = 0; k < P.length; k++) { const a = P[k], c = P[(k + 1) % P.length]; A += a[0] * c[1] - c[0] * a[1]; }
  A = Math.abs(A) / 2;
  const ch = G.g.chamfer, hEdge = ch && ch.joue > 0 ? ch.hEdge : G.h;
  const s = G.psiL.map(p => Math.sin(p * Math.PI / 200));
  // sous-face (développée, chanfreins compris), joues, abouts
  let dev = 0; for (let k = 0; k + 1 < pr.bas.length; k++) dev += Math.hypot(pr.bas[k + 1][0] - pr.bas[k][0], pr.bas[k + 1][1] - pr.bas[k][1]);
  const coffrage = { sousFace: dev * L, joues: 2 * hEdge * L, abouts: A / s[0] + A / s[s.length - 1] };
  const masse = (st.rebar && st.rebar.marks || []).reduce((t, m) => t + (m.mass || 0), 0);
  const V = A * L;
  return { aire: A, longueur: L, beton: V, coffrage, coffrageTotal: coffrage.sousFace + coffrage.joues + coffrage.abouts, acier: masse, ratio: masse / V };
}

const fr = (x, d = 1) => x.toFixed(d).replace('.', ',');

function notesCoffrage(st, G) {
  const m = st.p.mat, CUBE = { 20: 25, 25: 30, 30: 37, 35: 45, 40: 50, 45: 55, 50: 60, 55: 67, 60: 75 }, cls = `C${m.fck}/${CUBE[m.fck] ?? Math.round(m.fck * 1.22)}`;
  return [
    'NOTES',
    `1. Béton du tablier : ${cls} (fck = ${m.fck} MPa), classes d'exposition à préciser au CCTP.`,
    `2. Enrobage nominal des armatures : ${fr(m.c * 100, 1)} cm. Aciers B500B (fyk = ${m.fyk} MPa).`,
    '3. Cotes en mètres, mesurées dans le plan horizontal et le long de l\'axe (développé).',
    G.niv ? '4. Niveaux en mètres, rattachés au système altimétrique du plan de nivellement.' : '4. Niveaux relatifs (m) : ±0,00 = dessus de la dalle à l\'axe, au droit de C0.',
    `5. Revêtement de chaussée : ${fr(G.tRev * 100, 0)} cm (étanchéité comprise). Bordures de trottoir figurées.`,
    '6. Appareils d\'appui en élastomère fretté (NF EN 1337-3), posés sur bossages.',
    '7. Le présent plan est issu du calcul PSIDA ; il ne dispense pas des vérifications d\'exécution.',
  ];
}

function tableauQuantites(Q) {
  return {
    titre: 'QUANTITÉS (tablier)',
    cols: [{ t: 'Désignation', w: 104, a: 'g' }, { t: 'Unité', w: 22, a: 'c' }, { t: 'Quantité', w: 34, a: 'd' }],
    lignes: [
      ['Béton du tablier', 'm³', fr(Q.beton, 1)],
      ['Coffrage : sous-face et chanfreins', 'm²', fr(Q.coffrage.sousFace, 1)],
      ['Coffrage : joues de rive', 'm²', fr(Q.coffrage.joues, 1)],
      ['Coffrage : abouts', 'm²', fr(Q.coffrage.abouts, 1)],
      ['Armatures (plan de ferraillage)', 'kg', Q.acier ? Math.round(Q.acier).toLocaleString('fr-FR').replace(/ /g, ' ') : '—'],
      ['Ratio d\'armatures', 'kg/m³', Q.acier ? fr(Q.ratio, 0) : '—'],
    ],
  };
}

/* --------------------------------------------------------------------------------------------- la feuille */
export function planCoffrage(st, cartouche = {}, eq = null) {
  // coupes transversales en travée et sur appui, détail du bord (vue en plan et coupe longitudinale : feuille d'ensemble)
  const G = geometrie(st);
  const ca = vueCoupe(G, st, { titre: 'COUPE A-A (en travée)', eq });
  const iB = Math.min(1, G.n - 1);
  const cb = vueCoupe(G, st, { titre: `COUPE B-B (sur ${G.nomLigne(iB)})`, appui: iB, eq });
  const det = eq ? vueDetailBord(G, eq, 1) : null;
  if (det) det.titre = 'DÉTAIL 1 — BORD DU TABLIER';
  const Q = quantitesCoffrage(st, G), tq = tableauQuantites(Q), hq = (tq.lignes.length + 2) * 6;
  const notes = notesCoffrage(st, G), hn = notes.length * 2.1 * 1.6;
  const F = composer({
    titre: 'TABLIER — COFFRAGE : COUPES TRANSVERSALES ET DÉTAILS', cartouche,
    rangees: det ? [[ca], [cb, det]] : [[ca, cb]],
    groupes: [{ vues: [ca, cb], cible: 2 * G.b <= 14 ? 50 : 75, min: 20 }, ...(det ? [{ vues: [det], cible: 25, min: 20 }] : [])],
    colonne: { largeur: 182, hauteur: 2 + hq + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      F.tableau(tq, F.W - 10 - 162, y + 2);
      F.note(notes, F.W - 10 - 182 + 2, y + 2 + hq + 6 + hn - 2.1 * 0.6, 2.1);
      F.notes[F.notes.length - 1].titreGras = true;
    },
  });
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(p => '1/' + p.vue.echelle))].join(' ; ');
  return F;
}
