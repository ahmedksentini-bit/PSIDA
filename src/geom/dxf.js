/**
 * Lecture minimale d'un fichier DXF ASCII (tracé en plan) : entités LINE, ARC, CIRCLE (ignoré), LWPOLYLINE et
 * POLYLINE/VERTEX (avec renflements « bulge », code 42), dans la section ENTITIES, avec leur calque (code 8).
 * Les autres entités sont ignorées. Coordonnées en unités du dessin (supposées en mètres ; facteur d'échelle possible).
 * Renvoie { entites: [{ type, calque, ... }], calques: [noms] }. Une entité « polyligne » devient une liste de segments
 * { type: 'ligne', a, b } ou { type: 'arc', c, r, a0, a1 (rad, sens trigonométrique), a, b }.
 */
export function lireDXF(texte, { echelle = 1 } = {}) {
  const l = texte.replace(/\r/g, '').split('\n');
  const paires = [];
  for (let k = 0; k + 1 < l.length; k += 2) paires.push([parseInt(l[k].trim(), 10), l[k + 1].trim()]);
  // section ENTITIES
  let i = paires.findIndex((p, k) => p[0] === 2 && p[1] === 'ENTITIES' && paires[k - 1] && paires[k - 1][1] === 'SECTION');
  if (i < 0) throw new Error('DXF : section ENTITIES introuvable');
  const ents = [];
  let cur = null;
  const fin = () => { if (cur) ents.push(cur); cur = null; };
  for (i = i + 1; i < paires.length; i++) {
    const [c, v] = paires[i];
    if (c === 0) { fin(); if (v === 'ENDSEC') break; cur = { type: v, g: [] }; continue; }
    if (cur) cur.g.push([c, v]);
  }
  fin();
  const out = [], s = echelle;
  for (let k = 0; k < ents.length; k++) {
    const e = ents[k], get = (c, d = 0) => { const p = e.g.find(x => x[0] === c); return p ? +p[1] : d; };
    const calque = (e.g.find(x => x[0] === 8) || [8, '0'])[1];
    if (e.type === 'LINE') out.push({ type: 'polyligne', calque, segments: [{ type: 'ligne', a: [get(10) * s, get(20) * s], b: [get(11) * s, get(21) * s] }] });
    else if (e.type === 'ARC') {
      const c = [get(10) * s, get(20) * s], r = get(40) * s, a0 = get(50) * Math.PI / 180, a1 = get(51) * Math.PI / 180;
      out.push({ type: 'polyligne', calque, segments: [arcSeg(c, r, a0, a1 <= a0 ? a1 + 2 * Math.PI : a1, 1)] });
    } else if (e.type === 'LWPOLYLINE') {
      const pts = []; let last = null;
      for (const [c, v] of e.g) {
        if (c === 10) { last = { x: +v * s, y: 0, bulge: 0 }; pts.push(last); } else if (c === 20 && last) last.y = +v * s; else if (c === 42 && last) last.bulge = +v;
      }
      const closed = (get(70) & 1) === 1;
      out.push({ type: 'polyligne', calque, segments: depuisSommets(pts, closed) });
    } else if (e.type === 'POLYLINE') {
      const pts = [];
      for (k = k + 1; k < ents.length && ents[k].type === 'VERTEX'; k++) {
        const vx = ents[k], g = c => { const p = vx.g.find(x => x[0] === c); return p ? +p[1] : 0; };
        pts.push({ x: g(10) * s, y: g(20) * s, bulge: g(42) });
      }
      out.push({ type: 'polyligne', calque, segments: depuisSommets(pts, (get(70) & 1) === 1) });
    }
  }
  return { entites: out, calques: [...new Set(out.map(e => e.calque))] };
}

/** Arc de centre c, rayon r, de l'angle a0 à a1 ; sens +1 trigonométrique, −1 horaire (a1 < a0). */
function arcSeg(c, r, a0, a1, sens) {
  return { type: 'arc', c, r, a0, a1, sens, a: [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], b: [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)] };
}

/** Segments d'une polyligne à renflements : bulge = tan(θ/4), θ angle au centre (> 0 : sens trigonométrique). */
function depuisSommets(pts, closed) {
  const seg = [], n = pts.length;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const p = pts[k], q = pts[(k + 1) % n], a = [p.x, p.y], b = [q.x, q.y];
    if (Math.abs(p.bulge) < 1e-12) { seg.push({ type: 'ligne', a, b }); continue; }
    const th = 4 * Math.atan(p.bulge), d = Math.hypot(b[0] - a[0], b[1] - a[1]), r = d / (2 * Math.sin(Math.abs(th) / 2));
    // centre : à gauche de la corde (bulge > 0) ou à droite, à la distance r cos(θ/2)
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
    const h = r * Math.cos(th / 2) * Math.sign(th), c = [mx - uy * h, my + ux * h];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
    seg.push({ type: 'arc', c, r, a0, a1: a0 + th, sens: Math.sign(th), a, b });
  }
  return seg;
}

/** Écriture d'un DXF minimal (R12, ENTITIES seules) : lignes, arcs et polylignes à renflements — pour les essais. */
export function ecrireDXF(entites) {
  const L = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const e of entites) {
    if (e.type === 'LINE') L.push('0', 'LINE', '8', e.calque, '10', e.a[0], '20', e.a[1], '30', 0, '11', e.b[0], '21', e.b[1], '31', 0);
    else if (e.type === 'ARC') L.push('0', 'ARC', '8', e.calque, '10', e.c[0], '20', e.c[1], '30', 0, '40', e.r, '50', e.a0Deg, '51', e.a1Deg);
    else if (e.type === 'LWPOLYLINE') { L.push('0', 'LWPOLYLINE', '8', e.calque, '90', e.pts.length, '70', 0); for (const p of e.pts) { L.push('10', p.x, '20', p.y); if (p.bulge) L.push('42', p.bulge); } }
  }
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.map(String).join('\n') + '\n';
}
