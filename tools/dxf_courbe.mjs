/** Fabrique le DXF d'essai d'un ouvrage courbe : axe (droite 10 m, arc R = 60 m à gauche sur 36 m, droite 10 m) sur le
 *  calque AXE, lignes d'appui radiales de 12 m sur le calque APPUIS aux abscisses 2, 16, 34, 48 (travées 14 / 18 / 14). */
import { writeFileSync } from 'node:fs';
import { ecrireDXF } from '../src/geom/dxf.js';
import { Axe } from '../src/geom/axe.js';
export function dxfCourbe({ R = 60, Larc = 36, L1 = 10, L2 = 10, stations = [2, 16, 34, 48], lAppui = 12, x0 = 1000, y0 = 2000 } = {}) {
  const th = Larc / R, A = [x0, y0], B = [x0 + L1, y0];
  const C = [B[0] + R * Math.sin(th), B[1] + R * (1 - Math.cos(th))], t = [Math.cos(th), Math.sin(th)];
  const D = [C[0] + L2 * t[0], C[1] + L2 * t[1]];
  const axe = new Axe([{ type: 'ligne', a: A, b: B }, { type: 'arc', c: [B[0], B[1] + R], r: R, a0: -Math.PI / 2, a1: -Math.PI / 2 + th, sens: 1, a: B, b: C }, { type: 'ligne', a: C, b: D }]);
  const ent = [{ type: 'LWPOLYLINE', calque: 'AXE', pts: [{ x: A[0], y: A[1] }, { x: B[0], y: B[1], bulge: Math.tan(th / 4) }, { x: C[0], y: C[1] }, { x: D[0], y: D[1] }] }];
  for (const s of stations) ent.push({ type: 'LINE', calque: 'APPUIS', a: axe.pointDeporte(s, -lAppui / 2), b: axe.pointDeporte(s, lAppui / 2) });
  return ecrireDXF(ent);
}
if (process.argv[1] && process.argv[1].endsWith('dxf_courbe.mjs')) { const f = process.argv[2] || 'exemples/ouvrage_courbe.dxf'; writeFileSync(f, dxfCourbe()); console.log('écrit', f); }
