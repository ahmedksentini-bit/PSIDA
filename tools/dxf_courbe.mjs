/** Fabrique le DXF d'essai d'un ouvrage courbe : axe (droite 10 m, arc R = 60 m à gauche sur 36 m, droite 10 m) sur le
 *  calque AXE, lignes d'appui radiales de 12 m sur le calque APPUIS aux abscisses 2, 16, 34, 48 (travées 14 / 18 / 14). */
import { writeFileSync } from 'node:fs';
import { ecrireDXF } from '../src/geom/dxf.js';
import { Axe } from '../src/geom/axe.js';
import { clothoSeg } from '../src/geom/clothoide.js';
export function dxfCourbe({ R = 60, Larc = 36, L1 = 10, L2 = 10, stations = [2, 16, 34, 48], lAppui = 12, x0 = 1000, y0 = 2000, parallele = null } = {}) {
  const th = Larc / R, A = [x0, y0], B = [x0 + L1, y0];
  const C = [B[0] + R * Math.sin(th), B[1] + R * (1 - Math.cos(th))], t = [Math.cos(th), Math.sin(th)];
  const D = [C[0] + L2 * t[0], C[1] + L2 * t[1]];
  const axe = new Axe([{ type: 'ligne', a: A, b: B }, { type: 'arc', c: [B[0], B[1] + R], r: R, a0: -Math.PI / 2, a1: -Math.PI / 2 + th, sens: 1, a: B, b: C }, { type: 'ligne', a: C, b: D }]);
  const ent = [{ type: 'LWPOLYLINE', calque: 'AXE', pts: [{ x: A[0], y: A[1] }, { x: B[0], y: B[1], bulge: Math.tan(th / 4) }, { x: C[0], y: C[1] }, { x: D[0], y: D[1] }] }];
  // lignes d'appui radiales, ou toutes parallèles à la direction « parallele » [rad] (franchissement d'une voie droite)
  for (const s of stations) {
    if (parallele == null) { ent.push({ type: 'LINE', calque: 'APPUIS', a: axe.pointDeporte(s, -lAppui / 2), b: axe.pointDeporte(s, lAppui / 2) }); continue; }
    const P = axe.point(s), d = [Math.cos(parallele), Math.sin(parallele)], n = axe.normale(s), sn = Math.abs(d[0] * n[0] + d[1] * n[1]), l = lAppui / 2 / sn;
    ent.push({ type: 'LINE', calque: 'APPUIS', a: [P[0] - l * d[0], P[1] - l * d[1]], b: [P[0] + l * d[0], P[1] + l * d[1]] });
  }
  return ecrireDXF(ent);
}
/**
 * Axe avec clothoïdes : droite L1, clothoïde Lc (R ∞ → R), arc R sur La, clothoïde Lc (R → ∞), droite L2.
 * Exporté comme le font les logiciels de tracé : en SPLINE (points de contrôle tous les `pas` m) ou en polyligne à points
 * serrés ; lignes d'appui radiales aux abscisses données.
 */
export function axeClothoides({ R = 60, Lc = 20, La = 16, L1 = 10, L2 = 10, x0 = 1000, y0 = 2000 } = {}) {
  const segs = []; let a = [x0, y0], th = 0;
  const add = g => { segs.push(g); a = g.b; };
  add({ type: 'ligne', a, b: [a[0] + L1, a[1]] });
  add(clothoSeg({ a, theta0: 0, k0: 0, k1: 1 / R, long: Lc })); th = Lc / (2 * R);
  const c = [a[0] - R * Math.sin(th), a[1] + R * Math.cos(th)], a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  add({ type: 'arc', c, r: R, a0, a1: a0 + La / R, sens: 1, a, b: [c[0] + R * Math.cos(a0 + La / R), c[1] + R * Math.sin(a0 + La / R)] }); th += La / R;
  add(clothoSeg({ a, theta0: th, k0: 1 / R, k1: 0, long: Lc })); th += Lc / (2 * R);
  add({ type: 'ligne', a, b: [a[0] + L2 * Math.cos(th), a[1] + L2 * Math.sin(th)] });
  return new Axe(segs);
}
export function dxfClothoides({ forme = 'spline', pas = null, stations = [15, 29, 47, 61], lAppui = 12, ...o } = {}) {
  const axe = axeClothoides(o), h = pas ?? (forme === 'spline' ? 1 : 0.5), pts = [];
  for (let s = 0; s <= axe.L + 1e-9; s += h) pts.push(axe.point(s).map(v => +v.toFixed(4)));
  const ent = [forme === 'spline' ? { type: 'SPLINE', calque: 'AXE', ctrl: pts } : { type: 'LWPOLYLINE', calque: 'AXE', pts: pts.map(([x, y]) => ({ x, y })) }];
  for (const s of stations) ent.push({ type: 'LINE', calque: 'APPUIS', a: axe.pointDeporte(s, -lAppui / 2), b: axe.pointDeporte(s, lAppui / 2) });
  return ecrireDXF(ent);
}

if (process.argv[1] && process.argv[1].endsWith('dxf_courbe.mjs')) {
  writeFileSync('exemples/ouvrage_courbe.dxf', dxfCourbe());
  // variante : lignes d'appui toutes parallèles, perpendiculaires à l'axe des X du dessin (franchissement d'une voie droite)
  writeFileSync('exemples/ouvrage_courbe_biais.dxf', dxfCourbe({ parallele: Math.PI / 2 }));
  writeFileSync('exemples/ouvrage_clothoides.dxf', dxfClothoides());
  console.log('écrit exemples/ouvrage_courbe.dxf, ouvrage_courbe_biais.dxf et ouvrage_clothoides.dxf');
}
