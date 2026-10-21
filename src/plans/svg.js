/**
 * Feuille de plan → SVG (unités : mm, format réel de la feuille). Utilisé pour l'aperçu et pour le PDF (svg2pdf).
 */
import { CALQUES } from './dessin.js';
import { primitivesFeuille } from './primitives.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DASH = { DASHED: '3 1.5', CENTER: '9 1.5 1.5 1.5', CONTINUOUS: null };
const COUL = { 1: '#c81e1e', 3: '#0a7a2f', 4: '#0e7490', 5: '#1f4fbf', 6: '#9b2c9b', 7: '#111111', 8: '#6b7280' };
export const POLICE = 'DejaVu Sans Condensed, Arial Narrow, Arial, sans-serif';

/**
 * `mesure(s, h, gras)` (facultatif) : largeur du texte en mm ; les textes centrés ou alignés à droite sont alors
 * placés en début de ligne à partir de cette largeur (svg2pdf ne gère pas sûrement text-anchor d'une page à l'autre).
 */
export function feuilleSVG(F, { couleurs = true, police = POLICE, mm = true, mesure = null } = {}) {
  const { papier } = primitivesFeuille(F), H = F.H;
  const Y = y => (H - y).toFixed(3), X = x => x.toFixed(3);
  const sty = (calque, extra = {}) => {
    const c = CALQUES[calque] || CALQUES.TEXTES, col = couleurs ? COUL[c.couleur] || '#111' : '#111';
    return { col, ep: extra.ep ?? c.ep, dash: DASH[c.type] };
  };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${F.W}${mm ? 'mm' : ''}" height="${H}${mm ? 'mm' : ''}" viewBox="0 0 ${F.W} ${H}" font-family="${police}">`;
  s += `<rect x="0" y="0" width="${F.W}" height="${H}" fill="#ffffff"/>`;
  for (const p of papier) {
    const st = sty(p.calque, p);
    const ln = `stroke="${st.col}" stroke-width="${st.ep}" fill="none"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''} stroke-linecap="round" stroke-linejoin="round"`;
    if (p.t === 'L') s += `<line x1="${X(p.a[0])}" y1="${Y(p.a[1])}" x2="${X(p.b[0])}" y2="${Y(p.b[1])}" ${ln}/>`;
    else if (p.t === 'P') s += `<${p.ferme ? 'polygon' : 'polyline'} points="${p.pts.map(q => `${X(q[0])},${Y(q[1])}`).join(' ')}" ${ln}/>`;
    else if (p.t === 'C') s += `<circle cx="${X(p.c[0])}" cy="${Y(p.c[1])}" r="${p.r.toFixed(3)}" stroke="${st.col}" stroke-width="${st.ep}" fill="${p.plein ? st.col : 'none'}"/>`;
    else if (p.t === 'A') {
      const a0 = p.a0 * Math.PI / 180, a1 = p.a1 * Math.PI / 180, large = ((p.a1 - p.a0) % 360 + 360) % 360 > 180 ? 1 : 0;
      s += `<path d="M ${X(p.c[0] + p.r * Math.cos(a0))} ${Y(p.c[1] + p.r * Math.sin(a0))} A ${p.r.toFixed(3)} ${p.r.toFixed(3)} 0 ${large} 0 ${X(p.c[0] + p.r * Math.cos(a1))} ${Y(p.c[1] + p.r * Math.sin(a1))}" ${ln}/>`;
    } else if (p.t === 'T') {
      let anchor = p.ancre === 'c' ? 'middle' : p.ancre === 'd' ? 'end' : 'start', dx = 0;
      if (mesure && anchor !== 'start') { dx = -mesure(String(p.s), p.h, !!p.gras) * (anchor === 'middle' ? 0.5 : 1); anchor = 'start'; }
      // décalage vertical explicite (dominant-baseline mal géré par svg2pdf) : m = demi-hauteur des capitales, h = hauteur
      const dy = p.v === 'm' ? 0.36 * p.h : p.v === 'h' ? 0.75 * p.h : 0;
      const tr = p.angle ? ` transform="rotate(${(-p.angle).toFixed(2)} ${X(p.p[0])} ${Y(p.p[1])})"` : '';
      s += `<text x="${X(p.p[0] + dx)}" y="${(H - p.p[1] + dy).toFixed(3)}" font-size="${p.h.toFixed(2)}" text-anchor="${anchor}" fill="${st.col}"${p.gras ? ' font-weight="bold"' : ''}${tr}>${esc(p.s)}</text>`;
    }
  }
  return s + '</svg>';
}
