/**
 * Onglet Tablier — « Maillage du modèle en plaque » : vue du maillage DKT (triangles, nœuds, appuis-ressorts, lignes
 * d'appui, sections et fibres de calcul, épaisseur), en plan ; agrandissement dans un nouvel onglet ; export DXF du
 * maillage (R12, mètres). Méthode « plaque » : maillage du calcul ; sinon, aperçu construit à la demande (raideurs des
 * appareils non calculées : appuis rigides).
 */
import { plaqueTablier } from '../src/plate/deck.js';

const $ = s => document.querySelector(s);
const f0 = v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const f2 = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let apercu = null;   // modèle construit pour l'aperçu (méthode Guyon-Massonnet)

/** Arêtes uniques des triangles. */
function aretes(P) {
  const vu = new Set(), out = [];
  for (const t of P.T) for (let k = 0; k < 3; k++) {
    const a = t.ids[k], b = t.ids[(k + 1) % 3], key = a < b ? a * 1e7 + b : b * 1e7 + a;
    if (!vu.has(key)) { vu.add(key); out.push([a, b]); }
  }
  return out;
}
const pos = (P, p) => P.Pt(Math.floor(p / P.ny), p % P.ny);

/** Statistiques du maillage. */
export function statsMaillage(M) {
  const P = M.P, A = aretes(P);
  let lmin = Infinity, lmax = 0;
  for (const [a, b] of A) { const p = pos(P, a), q = pos(P, b), l = Math.hypot(p[0] - q[0], p[1] - q[1]); lmin = Math.min(lmin, l); lmax = Math.max(lmax, l); }
  return { noeuds: P.n, triangles: P.T.length, ddl: P.ndof, aretes: A.length, appuis: P.appuis.length, lmin, lmax, nx: P.nx, ny: P.ny };
}

/** SVG du maillage en plan. */
export function maillageSVG(M, { noeuds = false, numeros = false, epaisseur = true, sections = true } = {}) {
  const P = M.P, E = M.E * 1000, nu = M.nu;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let p = 0; p < P.n; p++) { const q = pos(P, p); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const m = 1.5, W = x1 - x0 + 2 * m, H = y1 - y0 + 2 * m, k = 40;   // 40 unités SVG par mètre
  const X = x => ((x - x0 + m) * k).toFixed(1), Y = y => ((y1 - y + m) * k).toFixed(1);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(W * k).toFixed(0)} ${(H * k).toFixed(0)}" font-family="Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>`;
  // épaisseur (chanfreins, dévers) : teinte par triangle
  if (epaisseur) {
    const hs = P.T.map(t => Math.cbrt(12 * (1 - nu * nu) * t.D / E)), hmin = Math.min(...hs), hmax = Math.max(...hs);
    P.T.forEach((t, e) => {
      const r = hmax > hmin + 1e-6 ? (hs[e] - hmin) / (hmax - hmin) : 0, c = Math.round(235 - 70 * r);
      s += `<polygon points="${t.x.map((x, i) => `${X(x)},${Y(t.y[i])}`).join(' ')}" fill="rgb(${c},${c + 8},${Math.min(255, c + 20)})" stroke="none"/>`;
    });
    s += `<text x="${X(x0)}" y="${(H * k - 8).toFixed(0)}" font-size="${(0.5 * k).toFixed(0)}" fill="#334">teinte : épaisseur ${f2(hmin)} à ${f2(hmax)} m</text>`;
  }
  // arêtes
  let d = '';
  for (const [a, b] of aretes(P)) { const p = pos(P, a), q = pos(P, b); d += `M${X(p[0])} ${Y(p[1])}L${X(q[0])} ${Y(q[1])}`; }
  s += `<path d="${d}" stroke="#475569" stroke-width="0.8" fill="none"/>`;
  // sections et fibres de calcul
  if (sections) {
    for (const i of M.iSec) { let dd = ''; for (let j = 0; j < P.ny; j++) { const q = P.Pt(i, j); dd += `${j ? 'L' : 'M'}${X(q[0])} ${Y(q[1])}`; } s += `<path d="${dd}" stroke="#16a34a" stroke-width="1" fill="none" stroke-dasharray="6 4" opacity="0.7"/>`; }
    for (const j of M.jFib) { let dd = ''; for (let i = 0; i < P.nx; i++) { const q = P.Pt(i, j); dd += `${i ? 'L' : 'M'}${X(q[0])} ${Y(q[1])}`; } s += `<path d="${dd}" stroke="#9333ea" stroke-width="1.2" fill="none" stroke-dasharray="2 4"/>`; }
  }
  // nœuds et numéros
  if (noeuds || numeros) for (let p = 0; p < P.n; p++) {
    const q = pos(P, p);
    if (noeuds) s += `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="1.8" fill="#0f172a"/>`;
    if (numeros) s += `<text x="${(+X(q[0]) + 2).toFixed(1)}" y="${(+Y(q[1]) - 2).toFixed(1)}" font-size="6" fill="#0f172a">${p + 1}</text>`;
  }
  // appuis : ressorts (raideur effective)
  for (const a of P.appuis) {
    const q = P.Pt(a.i, a.j), rig = !Number.isFinite(a.k);
    s += `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="7" fill="${rig ? '#dc2626' : '#2563eb'}" stroke="#fff" stroke-width="1.5"/>`;
  }
  // noms des lignes d'appui
  M.deck.beam.x0.forEach((x, i) => {
    const iN = P.plusProche(P.xs, x), q = P.Pt(iN, P.ny - 1), n = M.deck.beam.x0.length;
    s += `<text x="${X(q[0])}" y="${(+Y(q[1]) - 14).toFixed(1)}" font-size="${(0.55 * k).toFixed(0)}" font-weight="bold" text-anchor="middle" fill="#0f172a">${i === 0 ? 'C0' : i === n - 1 ? 'C' + i : 'P' + i}</text>`;
  });
  return s + '</svg>';
}

/** DXF R12 du maillage (mètres) : arêtes (calque MAILLAGE), appuis (APPUIS), numéros des nœuds (NOEUDS). */
export function maillageDXF(M, { numeros = false } = {}) {
  const P = M.P, L = [], n = v => (+v.toFixed(4)).toString();
  L.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC');
  L.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '3');
  for (const [nom, c] of [['MAILLAGE', 8], ['APPUIS', 5], ['NOEUDS', 7]]) L.push('0', 'LAYER', '2', nom, '70', '0', '62', String(c), '6', 'CONTINUOUS');
  L.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  for (const [a, b] of aretes(P)) { const p = pos(P, a), q = pos(P, b); L.push('0', 'LINE', '8', 'MAILLAGE', '10', n(p[0]), '20', n(p[1]), '30', '0.0', '11', n(q[0]), '21', n(q[1]), '31', '0.0'); }
  for (const a of P.appuis) { const q = P.Pt(a.i, a.j); L.push('0', 'CIRCLE', '8', 'APPUIS', '10', n(q[0]), '20', n(q[1]), '30', '0.0', '40', '0.15'); }
  if (numeros) for (let p = 0; p < P.n; p++) { const q = pos(P, p); L.push('0', 'TEXT', '8', 'NOEUDS', '10', n(q[0] + 0.03), '20', n(q[1] + 0.03), '30', '0.0', '40', '0.08', '1', String(p + 1)); }
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\r\n') + '\r\n';
}

function modele(st) {
  if (st.deck.plaque) return { M: st.deck.plaque.M, calcul: true };
  return apercu && apercu.deck === st.deck ? { M: apercu.M, calcul: false } : null;
}

function dessiner(st) {
  const box = $('#maillage-box'); if (!box) return;
  const r = modele(st);
  $('#maillage-gen').hidden = !!st.deck.plaque;
  if (!r) { $('#maillage-svg').innerHTML = ''; $('#maillage-info').innerHTML = 'Tablier calculé par Guyon-Massonnet : le maillage n\'a pas été construit. « Construire le maillage » le génère (pas de 0,50 m, appareils supposés rigides) sans lancer le calcul en plaque.'; return; }
  const M = r.M, S = statsMaillage(M), P = M.P;
  const kv = [...new Set(P.appuis.map(a => (Number.isFinite(a.k) ? f0(a.k / 1000) + ' MN/m' : 'rigides')))];
  $('#maillage-info').innerHTML = `${r.calcul ? '<span class="badge ok">CALCUL</span> maillage du calcul en plaque' : '<span class="badge warn">APERÇU</span> maillage construit pour l\'aperçu (appareils rigides)'} : ${S.nx} × ${S.ny} = ${f0(S.noeuds)} nœuds, ${f0(S.triangles)} triangles DKT (Batoz, Bathe et Ho), ${f0(S.ddl)} degrés de liberté (w, θx, θy), arêtes de ${f2(S.lmin)} à ${f2(S.lmax)} m ; ${S.appuis} appareils en ressorts verticaux (${kv.join(', ')}) ; ${M.geo ? 'ouvrage courbe : nœuds à leur position en plan' : M.cot ? `mailles en parallélogrammes suivant le biais ψ = ${f0(M.psi)} gr` : 'mailles rectangulaires coupées en deux triangles'}. <span style="color:#16a34a">Tirets verts</span> : sections de calcul ; <span style="color:#9333ea">pointillés violets</span> : fibres ; points <span style="color:#dc2626">rouges</span> (rigides) ou <span style="color:#2563eb">bleus</span> (ressorts) : appareils.`;
  const svg = maillageSVG(M, { noeuds: $('#maillage-noeuds').checked, numeros: $('#maillage-num').checked, epaisseur: $('#maillage-ep').checked, sections: $('#maillage-sec').checked });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  $('#maillage-svg').innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Ouvrir en grand (zoom du navigateur)"><img src="${url}" alt="Maillage du tablier" style="width:100%;height:auto;border:1px solid #d0d4da"></a>`;
}

export function renderMaillage(st) { if ($('#maillage-box')) { if (apercu && apercu.deck !== st.deck) apercu = null; dessiner(st); } }

export function initMaillage(getState) {
  if (!$('#maillage-box')) return;
  for (const id of ['#maillage-noeuds', '#maillage-num', '#maillage-ep', '#maillage-sec']) $(id).addEventListener('change', () => { const st = getState(); if (st && st.deck) dessiner(st); });
  $('#maillage-gen').addEventListener('click', () => {
    const st = getState(); if (!st || !st.deck) return;
    const nb = st.bearings ? st.bearings.nb : 4, psi = st.p && st.p.concept ? st.p.concept.psi : 100;
    try { apercu = { deck: st.deck, M: plaqueTablier(st.deck, { h: 0.5, nb, psi, kv: Infinity, E: (st.p && st.p.E) || 34000 }) }; } catch (e) { $('#maillage-info').textContent = 'Maillage impossible : ' + e.message; return; }
    dessiner(st);
  });
  $('#maillage-dxf').addEventListener('click', () => {
    const st = getState(); const r = st && st.deck ? modele(st) : null; if (!r) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([maillageDXF(r.M, { numeros: $('#maillage-num').checked })], { type: 'application/dxf' })); a.download = 'maillage-tablier.dxf'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
}
