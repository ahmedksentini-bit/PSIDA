/**
 * Géométrie commune aux plans : transformation plan (u le long de l'axe depuis C0, y à gauche) → coordonnées en plan,
 * lignes d'appui, appareils, profil en travers de la dalle, cotes du nivellement.
 */
import { geoTrace } from '../plate/deck.js';
import { epaisseur } from '../plate/deck.js';
import { deltaDevers } from '../devers.js';
import { bearingSpacing, totalHeight } from '../bearings.js';

export function geometrie(st) {
  const deck = st.deck, g = deck.g, b = deck.b, x0 = deck.beam.x0, n = x0.length;
  const [aL, aR] = g.overhangs || [0, 0], uA = x0[0] - aL, uB = x0[n - 1] + aR;
  const PL = deck.plaque && deck.plaque.M;
  // biais : par ligne (ouvrage courbe à lignes biaises) ou uniforme
  const psiL = PL && PL.psiL ? PL.psiL : x0.map(() => g.psi || 100);
  let pt, tangente, courbe = false, rayonMin = Infinity;
  if (g.trace) {
    const G = geoTrace(g.trace, { x0: x0.map(x => x - x0[0]), psiL: g.trace.psiLignes ? psiL : null });
    const O = G.pt(0, 0);
    pt = (u, y) => { const p = G.pt(u - x0[0], y); return [p[0] - O[0], p[1] - O[1]]; };
    tangente = u => { const t = G.axe.tangente(G.s0 + u - x0[0]); return t; };
    courbe = true;
    try { rayonMin = G.axe.rayonMin(G.s0 + uA - x0[0], G.s0 + uB - x0[0]); } catch { rayonMin = Infinity; }
  } else {
    const cot = Math.abs(psiL[0] - 100) < 1e-9 ? 0 : 1 / Math.tan(psiL[0] * Math.PI / 200);
    pt = (u, y) => [u + y * cot, y];
    tangente = () => [1, 0];
  }
  // appareils : ordonnées y (distance normale à l'axe) par ligne
  const nb = st.bearings.nb;
  const yb = x0.map((_, i) => {
    if (PL && PL.lignes) return PL.lignes[i].yb;
    const psi = psiL[i], a = bearingSpacing({ width: 2 * b, psi: Math.min(psi, 200 - psi), n: nb }), s = Math.sin(psi * Math.PI / 200);
    return Array.from({ length: nb }, (_, k) => (k - (nb - 1) / 2) * a * s);
  });
  const appareils = st.bearings.rows.map((r, i) => {
    const sel = r.sel || { bd: { a: 300, b: 400, t: 10, ts: 3 }, n: 3 };
    return { a: sel.bd.a / 1000, b: sel.bd.b / 1000, h: totalHeight(sel.bd, sel.n) / 1000, label: sel.label || `${sel.bd.a}×${sel.bd.b}×${sel.n}(${sel.bd.t}+${sel.bd.ts})`, yb: yb[i] };
  });
  // profil en travers : dessus et dessous de la dalle (par rapport au dessus à l'axe), selon le mode de dévers
  const dv = g.devers || null;
  const dessus = y => (dv && dv.mode !== 'revetement' ? deltaDevers(dv, y) : 0);
  const dessous = y => (dv && dv.mode === 'dalle' ? -deck.h : dessus(y) - epaisseur({ ...deck, g: { ...g, devers: null } }, y));
  const niv = st.supports && st.supports.niv && st.supports.niv.actif ? st.supports.niv : null;
  const nomLigne = i => (i === 0 ? 'C0' : i === n - 1 ? `C${i}` : `P${i}`);
  return { deck, g, b, h: deck.h, x0, n, uA, uB, aL, aR, psiL, pt, tangente, courbe, rayonMin, appareils, dessus, dessous, niv, nomLigne, tRev: st.p.mat.tRev };
}

/** Points d'une courbe u ↦ pt(u, y) échantillonnée (pas ≤ 1 m, et les abscisses imposées). */
export function courbeU(G, y, u0, u1, imposes = []) {
  const us = new Set([u0, u1, ...imposes.filter(u => u > u0 && u < u1)]);
  const N = G.courbe ? Math.max(2, Math.ceil((u1 - u0) / 1)) : 1;
  for (let k = 1; k < N; k++) us.add(u0 + (u1 - u0) * k / N);
  return [...us].sort((a, b) => a - b).map(u => G.pt(u, y));
}
