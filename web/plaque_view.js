/**
 * Onglet Tablier, méthode « plaque » : description du modèle, cartes des champs sous charges permanentes, surfaces
 * d'influence, comparaison avec Guyon-Massonnet (premier passage du calcul).
 */
import { permanentPlaque } from '../src/plate/deck.js';
import { CONFIG, theme } from './plots.js';

const f0 = v => (Number.isFinite(v) ? v.toFixed(0) : '–'), f2 = v => (Number.isFinite(v) ? v.toFixed(2) : '–'), cm = v => (v * 1e4).toFixed(1);

/** Champs nominaux sous charges permanentes (somme des composantes), mis en cache sur l'état. */
function champsPermanents(st) {
  if (st._champsPlaque) return st._champsPlaque;
  const M = st.deck.plaque.M, r = permanentPlaque(M), n = M.P.n;
  const sum = k => { const out = new Float64Array(n); for (const f of r.fichiers) { const a = k === 'w' ? f.w : f.champ[k]; for (let p = 0; p < n; p++) out[p] += a[p]; } return out; };
  return (st._champsPlaque = { w: sum('w'), mx: sum('mx'), my: sum('my'), mxy: sum('mxy') });
}

function carte(div, M, champ, { titre, unite, echelle = 1, symetrique = false }) {
  const { P, ys, deck } = M, { ink, grid } = theme(), cot = M.cot || 0;
  // ouvrage biais : la grille (s, y) est rééchantillonnée sur une grille régulière en x (x = s + y·cot ψ), vide hors dalle
  const sx = M.xs, h = Math.min(...sx.slice(1).map((v, k) => v - sx[k])), xMin = sx[0] + Math.min(0, -deck.b * cot), xMax = sx[sx.length - 1] + Math.max(0, deck.b * cot);
  const xs = cot ? Array.from({ length: Math.round((xMax - xMin) / h) + 1 }, (_, m) => xMin + m * h) : sx;
  const val = (j, x) => {
    const t = x - ys[j] * cot;
    if (t < sx[0] - 1e-9 || t > sx[sx.length - 1] + 1e-9) return null;
    let k = 0; while (k < sx.length - 2 && sx[k + 1] < t) k++;
    const r = Math.min(1, Math.max(0, (t - sx[k]) / (sx[k + 1] - sx[k])));
    return (champ[P.idx(k, j)] * (1 - r) + champ[P.idx(k + 1, j)] * r) * echelle;
  };
  const z = ys.map((_, j) => (cot ? xs.map(x => val(j, x)) : xs.map((_, i) => champ[P.idx(i, j)] * echelle)));
  const vmax = Math.max(...z.flat().filter(v => v !== null).map(Math.abs));
  const data = [{ type: 'heatmap', x: xs, y: ys, z, colorscale: symetrique ? 'RdBu' : 'Viridis', reversescale: symetrique, zmid: symetrique ? 0 : undefined, zmin: symetrique ? -vmax : undefined, zmax: symetrique ? vmax : undefined, colorbar: { title: unite, thickness: 12 }, hovertemplate: 'x = %{x:.2f} m<br>y = %{y:.2f} m<br>%{z:.1f} ' + unite + '<extra></extra>' },
    { type: 'scatter', mode: 'markers', x: P.appuis.map(a => sx[a.i] + ys[a.j] * cot), y: P.appuis.map(a => ys[a.j]), marker: { symbol: 'square', size: 7, color: ink, line: { color: '#fff', width: 1 } }, name: 'appareils', hovertemplate: 'appareil<extra></extra>' }];
  const layout = { title: { text: titre, font: { size: 14 } }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: ink, size: 12 }, margin: { l: 55, r: 10, t: 40, b: 45 },
    xaxis: { title: { text: 'x [m]' }, gridcolor: grid }, yaxis: { title: { text: 'y [m]' }, gridcolor: grid, scaleanchor: 'x', scaleratio: 1 }, showlegend: false, height: Math.max(260, 120 + 520 * (2 * deck.b) / (xs[xs.length - 1] - xs[0])) };
  Plotly.newPlot(div, data, layout, CONFIG);
}

export function renderPlaque(st) {
  const card = document.getElementById('card-plaque');
  if (!card) return;
  const PL = st.deck.plaque;
  card.hidden = !PL;
  if (!PL) return;
  const M = PL.M, P = M.P, G = st.guyon;
  const kv = P.appuis.filter(a => a.rang === 0).map(a => a.k);
  let h = `<p class="small">Dalle de Kirchhoff d'épaisseur variable (chanfreins), bords libres sur les quatre côtés, abouts compris, appuyée sur ${M.nb} appareils par ligne (entraxe ${f2(M.a)} m) modélisés en ressorts verticaux de raideur ${kv.map(k => (Number.isFinite(k) ? (k / 1000).toFixed(0) + ' MN/m' : 'rigide')).join(' / ')} (élastomère fretté choisi au premier passage, guide Sétra 2007). ${M.moteur === 'df' ? 'Différences finies énergétiques' : 'Éléments finis de plaque mince DKT (Batoz, Bathe et Ho, 1980), 3 degrés de liberté par nœud,'} sur une grille de ${P.nx} × ${P.ny} = ${P.n} nœuds (pas ≤ ${f2(M.h)} m, lignes d'appui, sections et fibres sur la grille${M.cot ? `, mailles en parallélogrammes suivant le biais ψ = ${f0(M.psi)} gr` : ''}) ; E = ${f0(M.E)} MPa, ν = ${M.nu}. Surfaces d'influence par réciprocité de Maxwell-Betti (${PL.cibles.length} grandeurs : m_x, m_y, m_xy aux sections × fibres, réactions des appareils, moyennes de m_y et m_xy sur les bandes de chevêtre) ; enveloppes de trafic en long avec les mêmes convois et arrangements que le modèle poutre. Dimensionnement sur les moments de Wood-Armer ${M.alphaT < 100 ? `pour armatures biaises (aciers transversaux à α = ${f0(M.alphaT)} gr de l'axe : m_x* = m_x − 2 m_xy cot α + m_y cot²α ± |t|, m_α* = m_y/sin²α ± |t|, t = (m_xy − m_y cot α)/sin α)` : '(m_x ± |m_xy|, m_y ± |m_xy|)'}${M.cot ? ' ; m_x, m_y et m_xy des tableaux sont dans ce repère des armatures' : ''}.</p>`;
  if (G) {
    const keys = st.keys;
    const row = (lab, a, b, fmt = f0) => `<tr><td>${lab}</td><td>${fmt(b)}</td><td>${fmt(a)}</td><td>${Number.isFinite(a / b) ? ((a / b - 1) * 100).toFixed(0) + ' %' : '–'}</td></tr>`;
    h += `<h3>Comparaison avec Guyon-Massonnet (premier passage)</h3><table><thead><tr><th>Grandeur</th><th>Guyon-Massonnet</th><th>Plaque</th><th>Écart</th></tr></thead><tbody>`;
    for (const k of keys) {
      const s = k.idx, sgn = k.kind === 'support' ? 'mxMin' : 'mxMax', pick = arr => (sgn === 'mxMin' ? Math.min(...arr) : Math.max(...arr));
      h += row(`${k.label} — m_x LM1 ${sgn === 'mxMin' ? 'min' : 'max'} [kN·m/m]`, pick(st.ec.LM1[sgn][s]), pick(G.ec.LM1[sgn][s]));
    }
    h += row('A_s longitudinal inférieur max [cm²/m]', Math.max(...st.design.EC.envBot) * 1e4, Math.max(...G.design.EC.envBot) * 1e4, f2);
    h += row('A_s longitudinal supérieur max, courant [cm²/m]', Math.max(...st.design.EC.envTop) * 1e4, Math.max(...G.design.EC.envTop) * 1e4, f2);
    st.transDesign.EC.spans.forEach((sp, j) => { h += row(`A_s transversal inférieur travée ${j + 1} [cm²/m]`, sp.bot.As * 1e4, G.transDesign.EC.spans[j].bot.As * 1e4, f2); });
    st.bearings.rows.forEach((r, i) => { h += row(`Appareil le plus chargé, ligne ${i} (ELS car.) [kN]`, r.Pmax, r.PSIDA ? r.PSIDA.Pmax : NaN); });
    st.chevetres.forEach(cv => { if (cv.annexe4) h += row(`Chevêtre ligne ${cv.i}, bande ① sup. [kN·m/m] (annexe 4)`, cv.bands.top[0].m, Math.max(cv.annexe4.mc, cv.annexe4.me_neg)); });
    if (st.rebar && G.rebar) h += row('Masse d\'acier passif [t]', st.rebar.totalMass / 1000, G.rebar.totalMass / 1000, f2);
    h += `</tbody></table>`;
  }
  const ra = st.design.EC.renfortsAppareils || [];
  if (ra.length) h += `<p class="small">Pointes de moment au droit des appareils des piles (annexe 4 § 7 du guide PSIDP-EL) : ferraillage supérieur courant dimensionné sur ± 0,2 L au plus grand de la moyenne sur la largeur et des fibres hors bandes ① (${ra.map(r => `P${r.support} : ${cm(r.uniforme)} cm²/m`).join(', ')}), pointe reprise par renforts locaux de ${ra.map(r => `${cm(r.As)} cm²/m`).join(', ')} sur ${f2(ra[0].width)} m centrés sur chaque appareil.</p>`;
  h += `<p class="small">Limites de la version : gradient thermique et tassements d'appui traités par le modèle poutre (m_x uniforme, ν·m_x transversal de Guyon) ; enveloppes de m_x, m_y et m_xy non concomitantes (Wood-Armer majorant). Calcul en ${st.dt.toFixed(0)} s.</p>`;
  document.getElementById('plaque-info').innerHTML = h;
  const sel = document.getElementById('plaque-champ');
  const draw = () => {
    const c = champsPermanents(st), v = sel.value;
    const opt = { w: { titre: 'Flèche sous charges permanentes (module instantané, nominal) [mm]', unite: 'mm', echelle: -1000 }, mx: { titre: 'm_x sous charges permanentes [kN·m/m]', unite: 'kN·m/m', symetrique: true }, my: { titre: 'm_y sous charges permanentes [kN·m/m]', unite: 'kN·m/m', symetrique: true }, mxy: { titre: 'm_xy sous charges permanentes [kN·m/m]', unite: 'kN·m/m', symetrique: true } }[v];
    carte(document.getElementById('plot-plaque'), M, c[v], opt);
  };
  sel.onchange = draw; draw();
  // surface d'influence d'une grandeur choisie
  const sSec = document.getElementById('plaque-is-sec'), sFib = document.getElementById('plaque-is-fib'), sG = document.getElementById('plaque-is-g');
  sSec.innerHTML = st.keys.map(k => `<option value="${k.idx}">${k.label}</option>`).join('');
  sFib.innerHTML = st.deck.ys.map((y, i) => `<option value="${i}">y = ${y} m</option>`).join('');
  sFib.value = String(Math.floor(st.deck.ys.length / 2));
  const drawIS = () => {
    const k = PL.indice(sG.value, +sSec.value, +sFib.value), eta = PL.surface(k);
    carte(document.getElementById('plot-plaque-is'), M, eta, { titre: `Surface d'influence de ${sG.value} — ${sSec.selectedOptions[0].text}, ${sFib.selectedOptions[0].text} [kN·m/m par kN]`, unite: '', symetrique: true });
  };
  sSec.onchange = sFib.onchange = sG.onchange = drawIS; drawIS();
}
