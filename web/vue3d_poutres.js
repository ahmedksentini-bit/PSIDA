/**
 * Onglet « Ponts à poutres » — « Vue 3D du grillage » : hourdis déformé (surface), âmes des poutres (rubans verticaux
 * de la hauteur des poutres), entretoises intermédiaires, réactions des appareils en flèches, roues du tandem.
 * Couleur : flèche w (partout), moment des poutres M ou torsion T (sur les âmes), moment transversal m_y (sur le hourdis).
 * Rendu, gestes et palettes : web/vue3d.js ; grillage et cas : src/beams/grillage3d.js (travées indépendantes).
 */
import { grillageTravee, casGrillage, GRANDEURS_GRILLAGE } from '../src/beams/grillage3d.js';
import { Rendu, gestes, gradientCSS, couleur, DIVERGENTE, SEQUENTIELLE, sub, cross, norm } from './vue3d.js';

const $ = s => document.querySelector(s);
const fr = (v, d = 0) => (Number.isFinite(v) ? (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
const GRIS = [0.80, 0.82, 0.85], GRIS_AME = [0.70, 0.72, 0.76];

/** Géométrie de la scène du grillage (testable sans WebGL). */
export function sceneGrillage(T, res, { grandeur = 'M', amplification = 1 } = {}) {
  const g = T.g, n = g.n, m = g.m, G = GRANDEURS_GRILLAGE[grandeur], b = n * g.b1 / 2, L = g.L, H = T.H;
  const nd = (i, k) => i * n + k, val = res[grandeur];
  const Lc = Math.max(L, 2 * b), wmax = Math.max(...Array.from(res.w, Math.abs)) || 1, amp = amplification * 0.04 * Lc / wmax;
  // bornes de la grandeur
  let vmin = Infinity, vmax = -Infinity; for (const v of val) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
  if (G.symetrique) { const a = Math.max(Math.abs(vmin), Math.abs(vmax)) || 1; vmin = -a; vmax = a; } else if (vmax - vmin < 1e-12) vmax = vmin + 1;
  const pal = G.symetrique ? DIVERGENTE : SEQUENTIELLE, col = v => couleur(pal, (v - vmin) / (vmax - vmin));
  const cx = L / 2, X = i => g.xs[i] - cx;
  // hourdis : colonnes en travers = bord gauche, axes des poutres, bord droit (console : w + θx (y − y_k))
  const Yc = [-b, ...g.ys, b];
  const zS = (i, c) => { const k = c === 0 ? 0 : c === n + 1 ? n - 1 : c - 1, p = nd(i, k), d = Yc[c] - g.ys[k]; return -(res.w[p] + res.tx[p] * d) * amp; };
  const vS = (i, c) => { const k = c === 0 ? 0 : c === n + 1 ? n - 1 : c - 1, p = nd(i, k); return grandeur === 'w' ? res.w[p] + res.tx[p] * (Yc[c] - g.ys[k]) : grandeur === 'my' ? (c === 0 || c === n + 1 ? 0 : res.my[p]) : null; };
  const tri = [], cols = [], nors = [];
  const quad = (A, B, C, D, cA, cB, cC, cD) => { for (const [P, Q, R, a, bb, c] of [[A, B, C, cA, cB, cC], [A, C, D, cA, cC, cD]]) { const nn = norm(cross(sub(Q, P), sub(R, P))); tri.push(...P, ...Q, ...R); cols.push(...a, ...bb, ...c); nors.push(...nn, ...nn, ...nn); } };
  const cS = (i, c) => { const v = vS(i, c); return v == null ? GRIS : col(v); };
  for (let i = 0; i < m; i++) for (let c = 0; c < n + 1; c++) {
    const P = (ii, cc) => [X(ii), Yc[cc], zS(ii, cc)];
    quad(P(i, c), P(i + 1, c), P(i + 1, c + 1), P(i, c + 1), cS(i, c), cS(i + 1, c), cS(i + 1, c + 1), cS(i, c + 1));
  }
  // âmes des poutres : rubans verticaux sous le hourdis
  const cA = (i, k) => (G.sur === 'poutres' || grandeur === 'w' ? col(val[nd(i, k)]) : GRIS_AME);
  for (let k = 0; k < n; k++) for (let i = 0; i < m; i++) {
    const z0 = zS(i, k + 1), z1 = zS(i + 1, k + 1), y = g.ys[k];
    quad([X(i), y, z0], [X(i + 1), y, z1], [X(i + 1), y, z1 - H], [X(i), y, z0 - H], cA(i, k), cA(i + 1, k), cA(i + 1, k), cA(i, k));
  }
  // entretoises intermédiaires (et d'about) : rubans transversaux gris entre les poutres
  const iEnt = [0, m, ...T.ents.map(e => Math.round(e.x / g.dx))];
  for (const i of iEnt) for (let k = 0; k < n - 1; k++) {
    const za = zS(i, k + 1), zb = zS(i, k + 2), h = 0.85 * H;
    quad([X(i), g.ys[k], za], [X(i), g.ys[k + 1], zb], [X(i), g.ys[k + 1], zb - h], [X(i), g.ys[k], za - h], GRIS_AME, GRIS_AME, GRIS_AME, GRIS_AME);
  }
  // lignes : axes des poutres, stations, bords
  const lg = [];
  for (let c = 0; c < n + 2; c++) for (let i = 0; i < m; i++) lg.push(X(i), Yc[c], zS(i, c), X(i + 1), Yc[c], zS(i + 1, c));
  for (let i = 0; i <= m; i++) for (let c = 0; c < n + 1; c++) lg.push(X(i), Yc[c], zS(i, c), X(i), Yc[c + 1], zS(i, c + 1));
  for (let k = 0; k < n; k++) for (let i = 0; i < m; i++) lg.push(X(i), g.ys[k], zS(i, k + 1) - H, X(i + 1), g.ys[k], zS(i + 1, k + 1) - H);
  // réactions sous les âmes
  const Rmax = Math.max(...res.R.map(a => Math.abs(a.R)), 1e-9), fl = [], fc = [];
  for (const a of res.R) {
    const x = X(a.i), y = a.y, z = zS(a.i, a.k + 1) - H, l = 0.15 * Lc * Math.abs(a.R) / Rmax, h = Math.min(0.3 * l, 0.012 * Lc), s = a.R >= 0 ? 1 : -1;
    const bas = z - l - 0.01 * Lc, haut = z - 0.01 * Lc, pointe = s > 0 ? haut : bas, base = pointe - s * h;
    fl.push(x, y, bas, x, y, haut, x, y, pointe, x - h * 0.6, y, base, x, y, pointe, x + h * 0.6, y, base, x, y, pointe, x, y - h * 0.6, base, x, y, pointe, x, y + h * 0.6, base);
    const c = s > 0 ? [0.86, 0.15, 0.15] : [0.15, 0.39, 0.92]; for (let q = 0; q < 10; q++) fc.push(...c);
  }
  // points de lecture : nœuds du grillage (axes des poutres, niveau du hourdis)
  const pos = [], ref = [];
  for (let i = 0; i <= m; i++) for (let k = 0; k < n; k++) { pos.push([X(i), g.ys[k], zS(i, k + 1)]); ref.push({ i, k, p: nd(i, k) }); }
  return { tri: new Float32Array(tri), cols: new Float32Array(cols), nors: new Float32Array(nors), lignes: new Float32Array(lg), fleches: new Float32Array(fl), flechesCol: new Float32Array(fc),
    pos, ref, n: pos.length, nt: tri.length / 9, vmin, vmax, amp, Lc, G, roues: (res.roues || []).map(r => [r.x - cx, r.y]), cx };
}

// ---------------------------------------------------------------- interface
let R = null, etat = null, poutres = null;
const lire = () => ({ L: +$('#g3d-L').value, cas: $('#g3d-cas').value, grandeur: $('#g3d-gr').value, amplification: +$('#g3d-amp').value, maillage: $('#g3d-maillage').checked, reactions: $('#g3d-reac').checked, xr: +$('#g3d-x').value, yr: +$('#g3d-y').value });

function calculer() {
  const info = $('#g3d-info'); if (!info) return;
  if (!poutres) { info.textContent = 'Calculez le pont à poutres, puis « Afficher ».'; return; }
  if (poutres.continu) { info.textContent = 'Vue 3D du grillage : travées indépendantes seulement (le tablier continu n\'a pas de grillage).'; $('#g3d-scene').hidden = true; return; }
  const o = lire(); $('#g3d-pos').style.display = o.cas === 'TS' ? '' : 'none';
  let T, res;
  try {
    if (!etat || etat.r !== poutres || etat.L !== o.L) etat = { r: poutres, L: o.L, T: grillageTravee(poutres, o.L) };
    T = etat.T;
    const { y1, y2 } = T.inp.roadway, xT = T.L * o.xr / 100, yT = y1 + 1.5 + (y2 - y1 - 3) * o.yr / 100;
    res = casGrillage(T, { cas: o.cas, x: xT, y: yT }); res.xT = xT; res.yT = yT;
  } catch (e) { info.textContent = 'Vue 3D du grillage : ' + e.message; return; }
  const S = sceneGrillage(T, res, { grandeur: o.grandeur, amplification: o.amplification });
  $('#g3d-scene').hidden = false;
  try { if (!R) { R = new Rendu($('#g3d-canvas')); R.dist0 = 1.35; } } catch (e) { info.textContent = 'Vue 3D : ' + e.message; $('#g3d-scene').hidden = true; return; }
  // poutres (M, T, w) : vue de dessous pour voir les âmes ; hourdis (m_y) : vue de dessus — à chaque changement de grandeur
  const vue = GRANDEURS_GRILLAGE[o.grandeur].sur === 'hourdis' ? 0.62 : -0.45;
  if (R.pitch0 !== vue) { R.pitch0 = vue; R.cam.pitch = vue; }
  R.charger(S); Object.assign(etat, { S, o, res }); R.dessiner(o);
  const G = S.G, d = o.grandeur === 'w' ? 1 : 0, Rs = res.R;
  $('#g3d-leg-bar').style.background = gradientCSS(G.symetrique);
  $('#g3d-leg-min').textContent = fr(S.vmin * G.echelle, d); $('#g3d-leg-max').textContent = fr(S.vmax * G.echelle, d); $('#g3d-leg-t').textContent = `${G.titre} [${G.unite}]`;
  const nom = { G: 'charges permanentes nominales', TS: `tandem TS (2 × 300 kN) en x = ${fr(res.xT, 1)} m, y = ${fr(res.yT, 1)} m`, UDL: 'charge répartie 9 kN/m² sur la chaussée' }[o.cas];
  const g = T.g, im = g.m / 2, Mmid = Array.from({ length: g.n }, (_, k) => res.M[im * g.n + k]);
  info.innerHTML = `Travée de ${fr(T.L, 2)} m, grillage de ${g.n} poutres × ${g.m} éléments${T.ents.length ? ` et ${T.ents.length} entretoise(s) intermédiaire(s)` : ''}, E_cm = ${fr(g.E / 1000)} MPa (C${T.fck}) — ${nom} : charge ${fr(res.total)} kN, réactions ${fr(Rs.reduce((t, a) => t + a.R, 0))} kN (max ${fr(Math.max(...Rs.map(a => a.R)))} kN) ; moments de mi-travée ${Mmid.map(v => fr(v)).join(' / ')} kN·m ; flèche maximale ${fr(Math.max(...Array.from(res.w)) * 1000, 1)} mm, dessinée × ${fr(S.amp)}. Grillage linéaire sur section brute homogénéisée (ni fluage ni fissuration) : à lire comme une répartition, les justifications restent celles du tableau.`;
}

function survol(ev) {
  if (!R || !etat || !etat.S) return;
  const r = R.canvas.getBoundingClientRect(), p = R.pointer(ev.clientX - r.left, ev.clientY - r.top), tip = $('#g3d-tip');
  if (p == null) { tip.hidden = true; return; }
  const S = etat.S, { i, k, p: q } = S.ref[p], res = etat.res, g = etat.T.g, a = res.R.find(x => x.i === i && x.k === k);
  tip.hidden = false; tip.style.left = `${ev.clientX - r.left + 12}px`; tip.style.top = `${ev.clientY - r.top + 12}px`;
  tip.innerHTML = `poutre ${k + 1}, x = ${fr(g.xs[i], 2)} m<br>w = ${fr(res.w[q] * 1000, 2)} mm<br>M = <b>${fr(res.M[q])}</b> kN·m ; T = ${fr(res.T[q])} kN·m<br>m_y (hourdis) = ${fr(res.my[q], 1)} kN·m/m${a ? `<br>appareil : R = <b>${fr(a.R)}</b> kN` : ''}`;
}

/** Nouveau résultat du pont à poutres : liste des portées ; la vue déjà affichée est recalculée. */
export function renderVue3DPoutres(r) {
  poutres = r; if (!$('#g3d-box')) return;
  const sel = $('#g3d-L'), Ls = r && !r.continu ? [...new Set(r.inp.spans)] : [];
  sel.innerHTML = Ls.map(L => `<option value="${L}">${fr(L, 2)} m</option>`).join('');
  const shown = etat && etat.S; etat = null; if (R) R.cam.dist = null;
  if (shown) calculer(); else $('#g3d-info').textContent = r && r.continu ? 'Vue 3D du grillage : travées indépendantes seulement.' : '« Afficher » construit le grillage de la travée choisie (une fraction de seconde).';
}

export function initVue3DPoutres() {
  if (!$('#g3d-box')) return;
  const siAffiche = () => { if (etat && etat.S) calculer(); };
  for (const id of ['#g3d-L', '#g3d-cas', '#g3d-gr', '#g3d-x', '#g3d-y', '#g3d-amp']) $(id).addEventListener('input', siAffiche);
  for (const id of ['#g3d-maillage', '#g3d-reac']) $(id).addEventListener('change', () => { if (R && etat && etat.S) R.dessiner(lire()); });
  $('#g3d-go').addEventListener('click', calculer);
  $('#g3d-png').addEventListener('click', () => { if (!R) return; const a = document.createElement('a'); a.href = R.canvas.toDataURL('image/png'); a.download = 'grillage-3d.png'; a.click(); });
  gestes($('#g3d-canvas'), () => { if (R && etat && etat.S) R.dessiner(lire()); }, () => R, survol, () => $('#g3d-tip'));
  window.addEventListener('resize', () => { if (R && etat && etat.S) R.dessiner(lire()); });
}
