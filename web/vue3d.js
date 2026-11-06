/**
 * Onglet Tablier — « Vue 3D des résultats de la plaque » : déformée amplifiée et carte en couleurs d'une grandeur
 * (w, m_x, m_y, m_xy, Wood-Armer) sur le maillage DKT, réactions des appareils en flèches, valeur au survol (au toucher).
 * WebGL 1 natif, sans bibliothèque : fonctionne hors ligne. Rotation : glisser ; zoom : molette ou pincement ;
 * déplacement : clic droit, Maj + glisser ou deux doigts ; double-clic : vue initiale.
 * Cas de charge et grandeurs : src/plate/cas3d.js. Modèle : celui du calcul en plaque, sinon l'aperçu de l'onglet Maillage.
 */
import { cas3D, GRANDEURS_3D } from '../src/plate/cas3d.js';
import { modeleMaillage } from './maillage_view.js';

const $ = s => document.querySelector(s);
const fr = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');

// ---------------------------------------------------------------- palettes (interpolation linéaire en sRGB)
const DIVERGENTE = [[33, 102, 172], [103, 169, 207], [209, 229, 240], [247, 247, 247], [253, 219, 199], [239, 138, 98], [178, 24, 43]];
const SEQUENTIELLE = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
function couleur(pal, t) {
  t = Math.min(1, Math.max(0, t)); const u = t * (pal.length - 1), k = Math.min(pal.length - 2, Math.floor(u)), r = u - k;
  return pal[k].map((c, i) => (c + (pal[k + 1][i] - c) * r) / 255);
}
export function gradientCSS(sym) { const pal = sym ? DIVERGENTE : SEQUENTIELLE; return `linear-gradient(to right, ${pal.map((c, i) => `rgb(${c.join(',')}) ${(100 * i / (pal.length - 1)).toFixed(0)}%`).join(', ')})`; }

// ---------------------------------------------------------------- matrices 4×4 (colonnes, comme WebGL)
const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
const perspective = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; };
function regarder(eye, c, up) {
  const z = norm(sub(eye, c)), x = norm(cross(up, z)), y = cross(z, x), o = new Float32Array(16);
  o.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  return o;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/**
 * Géométrie de la scène (testable sans WebGL) : positions, couleurs et normales des triangles, arêtes, flèches des
 * réactions, bornes de la grandeur.
 */
export function scene3D(M, res, { grandeur = 'mx', amplification = 1 } = {}) {
  const P = M.P, G = GRANDEURS_3D[grandeur], val = res.champ[grandeur], n = P.n;
  const pts = Array.from({ length: n }, (_, p) => P.Pt(P.iOf(p), P.jOf(p)));
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [x, y] of pts) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  const Lc = Math.max(xmax - xmin, ymax - ymin), wmax = Math.max(...Array.from(res.w, Math.abs)) || 1;
  const amp = amplification * 0.04 * Lc / wmax;     // flèche maximale dessinée : 4 % de la plus grande dimension × curseur
  let vmin = Infinity, vmax = -Infinity; for (let p = 0; p < n; p++) { vmin = Math.min(vmin, val[p]); vmax = Math.max(vmax, val[p]); }
  if (G.symetrique) { const a = Math.max(Math.abs(vmin), Math.abs(vmax)) || 1; vmin = -a; vmax = a; } else if (vmax - vmin < 1e-12) vmax = vmin + 1;
  const pal = G.symetrique ? DIVERGENTE : SEQUENTIELLE, cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const pos = Array.from({ length: n }, (_, p) => [pts[p][0] - cx, pts[p][1] - cy, -res.w[p] * amp]);
  const col = Array.from({ length: n }, (_, p) => couleur(pal, (val[p] - vmin) / (vmax - vmin)));
  const T = P.T, nt = T.length, tri = new Float32Array(nt * 9), cols = new Float32Array(nt * 9), nors = new Float32Array(nt * 9);
  const aretes = new Map();
  T.forEach((t, e) => {
    const [a, b, c] = t.ids, A = pos[a], B = pos[b], C = pos[c], nn = norm(cross(sub(B, A), sub(C, A)));
    [a, b, c].forEach((p, s) => { tri.set(pos[p], e * 9 + s * 3); cols.set(col[p], e * 9 + s * 3); nors.set(nn, e * 9 + s * 3); });
    for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = u < v ? `${u},${v}` : `${v},${u}`; if (!aretes.has(k)) aretes.set(k, [u, v]); }
  });
  const lignes = new Float32Array(aretes.size * 6); let k = 0;
  for (const [u, v] of aretes.values()) { lignes.set(pos[u], k); lignes.set(pos[v], k + 3); k += 6; }
  // réactions : flèche verticale sous l'appareil, longueur ∝ |R| (15 % de L pour la plus forte), pointe vers le haut si R > 0
  const Rmax = Math.max(...res.reactions.map(a => Math.abs(a.R)), 1e-9), fl = [], fc = [];
  for (const a of res.reactions) {
    const p = P.idx(a.i, a.j), [x, y, z] = pos[p], l = 0.15 * Lc * Math.abs(a.R) / Rmax, h = Math.min(0.3 * l, 0.012 * Lc), s = a.R >= 0 ? 1 : -1;
    const bas = z - l - 0.01 * Lc, haut = z - 0.01 * Lc, pointe = s > 0 ? haut : bas, base = pointe - s * h;
    fl.push(x, y, bas, x, y, haut, x, y, pointe, x - h * 0.6, y, base, x, y, pointe, x + h * 0.6, y, base, x, y, pointe, x, y - h * 0.6, base, x, y, pointe, x, y + h * 0.6, base);
    const c = s > 0 ? [0.86, 0.15, 0.15] : [0.15, 0.39, 0.92]; for (let q = 0; q < 10; q++) fc.push(...c);
  }
  // roues du tandem : petites croix au niveau de la surface
  const roues = (res.roues || []).map(r => [r.x + r.y * (M.P.cot || 0) - cx, r.y - cy]);
  return { tri, cols, nors, lignes, fleches: new Float32Array(fl), flechesCol: new Float32Array(fc), pos, val, vmin, vmax, amp, Lc, n, nt, G, roues, reactions: res.reactions, cx, cy };
}

// ---------------------------------------------------------------- rendu WebGL
const VS = `attribute vec3 p; attribute vec3 c; attribute vec3 nn; uniform mat4 mvp; uniform float eclaire; varying vec3 vc;
void main(){ gl_Position = mvp * vec4(p, 1.0); float l = abs(dot(normalize(nn), normalize(vec3(0.35, -0.45, 0.82))));
  vc = eclaire > 0.5 ? c * (0.62 + 0.38 * l) : c; }`;
const FS = `precision mediump float; varying vec3 vc; uniform float alpha; void main(){ gl_FragColor = vec4(vc, alpha); }`;

class Rendu {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL indisponible dans ce navigateur');
    this.gl = gl; this.canvas = canvas;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    this.pr = pr; this.loc = { p: gl.getAttribLocation(pr, 'p'), c: gl.getAttribLocation(pr, 'c'), nn: gl.getAttribLocation(pr, 'nn'), mvp: gl.getUniformLocation(pr, 'mvp'), alpha: gl.getUniformLocation(pr, 'alpha'), eclaire: gl.getUniformLocation(pr, 'eclaire') };
    this.buf = {}; this.cam = { yaw: -0.55, pitch: 0.62, dist: null, cx: 0, cy: 0 };
  }
  tampon(nom, data) { const gl = this.gl; if (!this.buf[nom]) this.buf[nom] = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf[nom]); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); }
  charger(S) {
    this.S = S;
    this.tampon('tri', S.tri); this.tampon('cols', S.cols); this.tampon('nors', S.nors); this.tampon('lignes', S.lignes);
    this.tampon('fleches', S.fleches); this.tampon('flechesCol', S.flechesCol);
    this.tampon('noir', new Float32Array(Math.max(S.lignes.length, 3)).fill(0.15));
    const croix = []; for (const [x, y] of S.roues) { const d = 0.012 * S.Lc; croix.push(x - d, y, 0.003 * S.Lc, x + d, y, 0.003 * S.Lc, x, y - d, 0.003 * S.Lc, x, y + d, 0.003 * S.Lc); }
    this.tampon('roues', new Float32Array(croix.length ? croix : [0, 0, 0])); this.nRoues = croix.length / 3;
    this.tampon('noirR', new Float32Array(Math.max(croix.length, 3)).fill(0.05));
    if (this.cam.dist == null) this.cam.dist = 1.05 * S.Lc;
  }
  matrice() {
    const { yaw, pitch, dist, cx, cy } = this.cam, c = [cx, cy, 0];
    const eye = [c[0] + dist * Math.cos(pitch) * Math.cos(yaw), c[1] + dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch)];
    const asp = this.canvas.width / this.canvas.height, Lc = this.S.Lc;
    return mul(perspective(0.75, asp, Math.max(0.01, dist - 2 * Lc), dist + 2 * Lc), regarder(eye, c, [0, 0, 1]));
  }
  dessiner({ maillage = true, reactions = true } = {}) {
    const gl = this.gl, L = this.loc, S = this.S; if (!S) return;
    const dpr = window.devicePixelRatio || 1, w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.useProgram(this.pr);
    this.mvp = this.matrice(); gl.uniformMatrix4fv(L.mvp, false, this.mvp);
    const attr = (loc, nom) => { if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, this.buf[nom]); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); };
    gl.uniform1f(L.alpha, 1); gl.uniform1f(L.eclaire, 1);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    attr(L.p, 'tri'); attr(L.c, 'cols'); attr(L.nn, 'nors'); gl.drawArrays(gl.TRIANGLES, 0, S.nt * 3);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.uniform1f(L.eclaire, 0);
    if (L.nn >= 0) { gl.disableVertexAttribArray(L.nn); gl.vertexAttrib3f(L.nn, 0, 0, 1); }
    if (maillage) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(L.alpha, 0.28); attr(L.p, 'lignes'); attr(L.c, 'noir'); gl.drawArrays(gl.LINES, 0, S.lignes.length / 3); gl.disable(gl.BLEND); gl.uniform1f(L.alpha, 1); }
    if (reactions && S.fleches.length) { attr(L.p, 'fleches'); attr(L.c, 'flechesCol'); gl.drawArrays(gl.LINES, 0, S.fleches.length / 3); }
    if (this.nRoues) { attr(L.p, 'roues'); attr(L.c, 'noirR'); gl.drawArrays(gl.LINES, 0, this.nRoues); }
  }
  /** Nœud le plus proche d'un point de l'écran (pixels CSS), à moins de 24 px. */
  pointer(px, py) {
    const S = this.S, m = this.mvp, W = this.canvas.clientWidth, H = this.canvas.clientHeight; if (!S || !m) return null;
    let best = null, bd = 24 * 24;
    for (let p = 0; p < S.n; p++) {
      const [x, y, z] = S.pos[p], cw = m[3] * x + m[7] * y + m[11] * z + m[15]; if (cw <= 0) continue;
      const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw + 1) / 2 * W, sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw) / 2 * H;
      const d = (sx - px) ** 2 + (sy - py) ** 2; if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

// ---------------------------------------------------------------- interface
let R = null, etat = null, dernier = null;

function lire() {
  return { cas: $('#v3d-cas').value, grandeur: $('#v3d-gr').value, amplification: +$('#v3d-amp').value, maillage: $('#v3d-maillage').checked, reactions: $('#v3d-reac').checked, xr: +$('#v3d-x').value, yr: +$('#v3d-y').value };
}

function calculer(st) {
  const box = $('#vue3d-box'); if (!box) return;
  const info = $('#v3d-info'), md = st && st.deck ? modeleMaillage(st) : null;
  if (!md) { info.innerHTML = 'Tablier calculé par Guyon-Massonnet : construisez le maillage (carte « Maillage du modèle en plaque ») pour voir la plaque en 3D (appareils rigides).'; $('#v3d-scene').hidden = true; return; }
  const M = md.M, o = lire(), deck = st.deck;
  const opP = $('#v3d-cas option[value="P"]'); if (opP) opP.disabled = !(st.psidp && st.psidp.r && !M.geo);
  if (o.cas === 'P' && opP && opP.disabled) { $('#v3d-cas').value = 'G'; o.cas = 'G'; }
  $('#v3d-pos').style.display = o.cas === 'TS' ? '' : 'none';
  const xA = M.xs[0], xB = M.xs[M.xs.length - 1], { y1, y2 } = deck.g.roadway, xT = xA + (xB - xA) * o.xr / 100, yT = y1 + 1.5 + (y2 - y1 - 3) * o.yr / 100;
  let res;
  const cle = `${o.cas}|${o.cas === 'TS' ? `${xT.toFixed(2)},${yT.toFixed(2)}` : ''}`;
  try { res = dernier && dernier.M === M && dernier.cle === cle ? dernier.res : cas3D(M, { cas: o.cas, x: xT, y: yT, psidp: st.psidp }); } catch (e) { info.textContent = 'Vue 3D : ' + e.message; return; }
  dernier = { M, cle, res };
  const S = scene3D(M, res, { grandeur: o.grandeur, amplification: o.amplification });
  $('#v3d-scene').hidden = false;
  try { if (!R) R = new Rendu($('#v3d-canvas')); } catch (e) { info.textContent = 'Vue 3D : ' + e.message; $('#v3d-scene').hidden = true; return; }
  R.charger(S); etat = { S, o, res, st, M };
  R.dessiner(o);
  const G = S.G, ech = G.echelle, d = o.grandeur === 'w' ? 1 : 0, Rs = res.reactions;
  $('#v3d-leg-bar').style.background = gradientCSS(G.symetrique);
  $('#v3d-leg-min').textContent = fr(S.vmin * ech, d); $('#v3d-leg-max').textContent = fr(S.vmax * ech, d);
  $('#v3d-leg-t').textContent = `${G.titre} [${G.unite}]`;
  const nom = { G: 'charges permanentes nominales', TS: `tandem TS (2 × 300 kN) en x = ${fr(xT, 1)} m, y = ${fr(yT, 1)} m`, UDL: 'charge répartie 9 kN/m² sur la chaussée', P: 'précontrainte (E.S, valeur moyenne)' }[o.cas];
  info.innerHTML = `${md.calcul ? '<span class="badge ok">CALCUL</span>' : '<span class="badge warn">APERÇU</span>'} ${nom} : charge totale ${fr(res.total)} kN, réactions ${fr(Rs.reduce((t, a) => t + a.R, 0))} kN (max ${fr(Math.max(...Rs.map(a => a.R)))}, min ${fr(Math.min(...Rs.map(a => a.R)))} kN) ; flèche maximale ${fr(Math.max(...Array.from(res.w)) * 1000, 2)} mm, dessinée × ${fr(S.amp, 0)}. Flèches : <span style="color:#dc2626">rouges</span> réactions vers le haut, <span style="color:#2563eb">bleues</span> vers le bas (soulèvement).`;
}

function survol(ev) {
  if (!R || !etat) return;
  const r = R.canvas.getBoundingClientRect(), p = R.pointer(ev.clientX - r.left, ev.clientY - r.top), tip = $('#v3d-tip');
  if (p == null) { tip.hidden = true; return; }
  const S = etat.S, P = etat.M.P, [x, y] = P.Pt(P.iOf(p), P.jOf(p)), G = S.G;
  const ap = S.reactions.find(a => P.idx(a.i, a.j) === p);
  tip.hidden = false; tip.style.left = `${ev.clientX - r.left + 12}px`; tip.style.top = `${ev.clientY - r.top + 12}px`;
  tip.innerHTML = `x = ${fr(x, 2)} m, y = ${fr(y, 2)} m<br>${G.titre} : <b>${fr(S.val[p] * G.echelle, etat.o.grandeur === 'w' ? 2 : 1)}</b> ${G.unite}${etat.o.grandeur === 'w' ? '' : `<br>w = ${fr(etat.res.w[p] * 1000, 2)} mm`}${ap ? `<br>appareil (ligne ${ap.ligne}) : R = <b>${fr(ap.R)}</b> kN` : ''}`;
}

function gestes(canvas, redessiner) {
  const pts = new Map(); let pan = false, d0 = null, last = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pan = e.button === 2 || e.shiftKey; last = null; d0 = null; });
  canvas.addEventListener('pointerup', e => { pts.delete(e.pointerId); d0 = null; last = null; });
  canvas.addEventListener('pointercancel', e => { pts.delete(e.pointerId); d0 = null; last = null; });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) { survol(e); return; }
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (!R || !R.S) return;
    const c = R.cam, dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (d0) c.dist = Math.min(8 * R.S.Lc, Math.max(0.15 * R.S.Lc, c.dist * d0 / d));
      if (last) deplacer(c, m[0] - last[0], m[1] - last[1]);
      d0 = d; last = m;
    } else if (pan) deplacer(c, dx, dy);
    else { c.yaw -= dx * 0.008; c.pitch = Math.min(1.55, Math.max(-0.2, c.pitch + dy * 0.008)); }
    redessiner();
  });
  const deplacer = (c, dx, dy) => { const k = c.dist / canvas.clientHeight * 0.9, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw); c.cx += k * (dx * sy + dy * cy * Math.sin(c.pitch)); c.cy += k * (-dx * cy + dy * sy * Math.sin(c.pitch)); };
  canvas.addEventListener('wheel', e => { if (!R || !R.S) return; e.preventDefault(); R.cam.dist = Math.min(8 * R.S.Lc, Math.max(0.15 * R.S.Lc, R.cam.dist * Math.exp(e.deltaY * 0.0012))); redessiner(); }, { passive: false });
  canvas.addEventListener('dblclick', () => { if (!R || !R.S) return; Object.assign(R.cam, { yaw: -0.55, pitch: 0.62, dist: 1.05 * R.S.Lc, cx: 0, cy: 0 }); redessiner(); });
  canvas.addEventListener('pointerleave', () => { $('#v3d-tip').hidden = true; });
}

/** Nouveau calcul : la vue déjà affichée est recalculée ; sinon, simple invitation (rien n'est résolu tant qu'on n'a pas demandé). */
export function renderVue3D(st) {
  if (!$('#vue3d-box')) return;
  dernier = null;
  if (etat) { if (R) R.cam.dist = null; calculer(st); return; }
  const md = st && st.deck ? modeleMaillage(st) : null;
  $('#v3d-info').innerHTML = md ? `Modèle ${md.calcul ? 'du calcul en plaque' : 'de l\'aperçu (appareils rigides)'} disponible : « Afficher » lance la résolution du cas choisi (une fraction de seconde).` : 'Tablier calculé par Guyon-Massonnet : construisez le maillage (carte « Maillage du modèle en plaque ») pour voir la plaque en 3D (appareils rigides).';
}

export function initVue3D(getState) {
  const box = $('#vue3d-box'); if (!box) return;
  const recalc = () => { const st = getState(); if (st && st.deck) calculer(st); };
  const siAffiche = () => { if (etat) recalc(); };
  for (const id of ['#v3d-cas', '#v3d-gr', '#v3d-x', '#v3d-y', '#v3d-amp']) $(id).addEventListener('input', siAffiche);
  document.addEventListener('maillage:construit', () => { const st = getState(); if (st && st.deck) renderVue3D(st); });
  for (const id of ['#v3d-maillage', '#v3d-reac']) $(id).addEventListener('change', () => { if (R && etat) R.dessiner(lire()); });
  $('#v3d-go').addEventListener('click', recalc);
  $('#v3d-png').addEventListener('click', () => { if (!R) return; const a = document.createElement('a'); a.href = R.canvas.toDataURL('image/png'); a.download = 'plaque-3d.png'; a.click(); });
  gestes($('#v3d-canvas'), () => { if (R && etat) R.dessiner(lire()); });
  window.addEventListener('resize', () => { if (R && etat) R.dessiner(lire()); });
}
