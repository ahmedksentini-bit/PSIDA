/**
 * Note de calcul imprimable (HTML autonome ouvert dans un nouvel onglet → impression / PDF par le navigateur).
 * Les graphiques Plotly sont rendus en PNG (Plotly.toImage) et incorporés en data: URI ; les schémas SVG sont repris tels quels.
 */
import { elevationSVG, crossSectionSVG } from './svg.js';
import { tableK } from '../src/guyon.js';

const cm = v => (v * 1e4).toFixed(1);
const f0 = v => v.toFixed(0), f1 = v => v.toFixed(1), f3 = v => v.toFixed(3);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function img(div, title) {
  try { const url = await Plotly.toImage(div, { format: 'png', width: 1100, height: 440, scale: 2 }); return `<figure><img src="${url}" alt="${esc(title)}"><figcaption>${esc(title)}</figcaption></figure>`; }
  catch (e) { return `<p class="small">(graphique « ${esc(title)} » non disponible)</p>`; }
}

function tableCase(deck, keys, res, title) {
  const f = deck.transverseFactors(res);
  let h = `<h4>${esc(title)}</h4><table><thead><tr><th>Section</th><th>M max</th><th>M min</th><th>K</th>${deck.ys.map(y => `<th>y = ${y}</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) {
    h += `<tr><td>${k.label}</td><td>${f1(res.Mmax[k.idx])}</td><td>${f1(res.Mmin[k.idx])}</td><td>${f3(f.K[k.idx])}</td>${res.mxMax[k.idx].map(v => `<td>${f1(v)}</td>`).join('')}</tr>`;
    h += `<tr><td class="sub">m_x min</td><td></td><td></td><td></td>${res.mxMin[k.idx].map(v => `<td>${f1(v)}</td>`).join('')}</tr>`;
  }
  h += `</tbody></table><p class="small">R max = ${res.Rmax.map(f0).join(' / ')} kN ; R min = ${res.Rmin.map(f0).join(' / ')} kN${res.delta ? ' ; δ = ' + res.delta.map(f3).join(' / ') : ''}</p>`;
  return h;
}

export async function buildReport(st) {
  const { p, deck, keys, perm, ec, f61, thermal, settle, design, trans, transDesign } = st;
  const g = deck.g;
  const date = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const figs = {
    M: await img(document.querySelector('#plot-M'), 'Enveloppes des moments fléchissants (poutre entière)'),
    V: await img(document.querySelector('#plot-V'), 'Enveloppes des efforts tranchants (poutre entière)'),
    R: await img(document.querySelector('#plot-R'), "Réactions d'appui"),
    K: await img(document.querySelector('#plot-K'), 'Coefficients K de Guyon-Massonnet'),
    f: await img(document.querySelector('#plot-f'), 'Facteur de répartition transversale f(y)'),
    As: await img(document.querySelector('#plot-As'), 'Ferraillage longitudinal A_s(x)'),
    my: await img(document.querySelector('#plot-my'), 'Moments transversaux m_y(y)'),
  };
  const dEC = design.EC, dB = design.F61, tEC = transDesign.EC, tB = transDesign.F61;
  let h = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Note de calcul — pont-dalle</title>
<style>
 body{font:12.5px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2433;margin:0;padding:28px 36px;max-width:1100px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;border-bottom:1px solid #999;padding-bottom:3px;margin:26px 0 10px;page-break-after:avoid} h3{font-size:14px;margin:16px 0 6px} h4{font-size:13px;margin:12px 0 4px}
 table{border-collapse:collapse;width:100%;font-size:11px;margin:4px 0 10px;page-break-inside:avoid} th,td{border:1px solid #cfd4dc;padding:2px 5px;text-align:right;white-space:nowrap} th:first-child,td:first-child{text-align:left} thead th{background:#eef1f5}
 td.sub{color:#5b6478;padding-left:16px} .small{font-size:11px;color:#5b6478} figure{margin:10px 0;page-break-inside:avoid} figure img{width:100%;border:1px solid #e3e6eb} figcaption{font-size:11px;color:#5b6478;text-align:center}
 .svg svg{width:100%;height:auto} .meta{color:#5b6478;font-size:12px;margin-bottom:14px} .box{border:1px solid #cfd4dc;border-radius:6px;padding:8px 12px;margin:8px 0;background:#fafbfc}
 @media print{ body{padding:0} h2{page-break-before:auto} .noprint{display:none} }
</style></head><body>
<div class="noprint" style="margin-bottom:12px"><button onclick="window.print()" style="padding:8px 14px;font:inherit">Imprimer / enregistrer en PDF</button></div>
<h1>Note de calcul — pont-dalle en béton armé (PSI-DA)</h1>
<div class="meta">Calcul manuel assisté — moteur PSIDA v${esc(st.version || '0.4')} · ${date} · référentiels : Eurocodes (EN 1990/1991-2/1992) et Fascicule 61 titre II + BAEL 91</div>`;

  // 1. Données
  h += `<h2>1. Données</h2><div class="box">
<b>Géométrie</b> : ${deck.spans.length} travée(s) de ${deck.spans.join(' / ')} m${(g.overhangs || [0, 0]).some(v => v > 0) ? ', abouts ' + g.overhangs.join(' / ') + ' m' : ''} ; dalle de largeur 2b = ${2 * deck.b} m, épaisseur h = ${deck.h} m (aire ${deck.area.toFixed(3)} m²${g.chamfer ? ', chanfreins : hauteur au bord ' + g.chamfer.hEdge + ' m, joue ' + g.chamfer.joue + ' m' : ''}) ; chaussée y ∈ [${g.roadway.y1} ; ${g.roadway.y2}] m${(g.footways || []).length ? ' ; trottoirs ' + g.footways.map(f => `[${f.y1} ; ${f.y2}]`).join(', ') : ''}.<br>
<b>Charges permanentes</b> : béton ${deck.gammaC} kN/m³ ; ${(g.lines || []).map(l => `${l.g} kN/m en y = ${l.e}${l.kmin !== 1 || l.kmax !== 1 ? ` (k ${l.kmin}/${l.kmax})` : ''}`).join(' ; ') || 'pas de charge linéaire'} ; ${(g.bands || []).map(b => `${b.q} kN/m² sur [${b.y1} ; ${b.y2}]${b.kmin !== 1 || b.kmax !== 1 ? ` (k ${b.kmin}/${b.kmax})` : ''}`).join(' ; ') || 'pas de charge surfacique'} ; g total = ${f1(perm.gTotal)} kN/m.<br>
<b>Trafic</b> : Eurocode ${ec.alpha.label}, ${ec.lanes.n} voie(s) de ${ec.lanes.wl.toFixed(2)} m (aire résiduelle ${ec.lanes.wr.toFixed(2)} m) ; Fascicule 61 classe ${f61.classe}, L_c = ${f61.Lc.toFixed(2)} m, ${f61.nv} voie(s) de ${f61.v.toFixed(2)} m.<br>
<b>Autres actions</b> : ${thermal ? `gradient thermique ${p.dT[0]} / ${p.dT[1]} °C (EI = ${(thermal.EI / 1e6).toFixed(3)}·10⁶ kN·m²), tassements aléatoires δ = ${p.delta} m (module différé E/(1+${p.phiFluage}))` : 'sans température ni tassements'}.<br>
<b>Matériaux</b> : C${dEC.mat.fck}/${dEC.mat.fck + 10} (fcd ${f1(dEC.mat.fcd)} MPa, fctm ${dEC.mat.fctm.toFixed(2)} MPa, Ecm ${f0(dEC.mat.Ecm)} MPa), B${dEC.mat.fyk} (fyd ${f0(dEC.mat.fyd)} MPa) ; BAEL : fc28 = ${dB.mat.fc28} MPa, fe = ${dB.mat.fe} MPa, fissuration ${dB.mat.fissuration} ; enrobage à l'axe c = ${p.mat.c} m, φ = ${p.mat.phi * 1000} / ${p.mat.phiT * 1000} mm, wk ≤ ${p.mat.wkMax} mm, revêtement ${p.mat.tRev} m.<br>
<b>Modèle</b> : poutre continue à EI constant (lignes d'influence sur 100 positions par travée) ; répartition transversale de Guyon-Massonnet recalculée (dalle isotrope, ν = ${deck.nu}, α = ${deck.alphaTorsion}), θ = b/L_eq avec L_eq = distance entre points de moment nul de la travée seule chargée ; arrangements transversaux balayés par pas de ${deck.laneStep} m.
</div>`;

  // 2. Modèle
  h += `<h2>2. Modèle de calcul</h2><div class="svg">${elevationSVG(deck, keys)}</div><div class="svg">${crossSectionSVG({ deck, loads: [], title: 'Coupe transversale', note: '' })}</div>
<table><thead><tr><th>Travée</th><th>L [m]</th><th>L_eq [m]</th><th>θ = b/L_eq</th></tr></thead><tbody>${deck.spans.map((L, j) => `<tr><td>${j + 1}</td><td>${L}</td><td>${f3(deck.Leq[j])}</td><td>${f3(deck.b / deck.Leq[j])}</td></tr>`).join('')}</tbody></table>`;

  // 3. Permanent
  h += `<h2>3. Charges permanentes</h2><table><thead><tr><th>Section</th><th>M nominal [kN·m]</th><th>M min</th><th>M max</th>${deck.ys.map(y => `<th>m_x(y = ${y})</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) h += `<tr><td>${k.label}</td><td>${f1(perm.M[k.idx])}</td><td>${f1(perm.Mmin[k.idx])}</td><td>${f1(perm.Mmax[k.idx])}</td>${perm.mx[k.idx].map(v => `<td>${f1(v)}</td>`).join('')}</tr>`;
  h += `</tbody></table><p class="small">Réactions nominales : ${perm.R.map(f0).join(' / ')} kN. Moments de la poutre entière en kN·m, par mètre de largeur en kN·m/m (K = 1 pour le poids propre, K(e, y) pour les charges excentrées).</p>`;

  // 4. Trafic
  h += `<h2>4. Charges d'exploitation (valeurs caractéristiques)</h2><h3>4.1 Eurocodes — EN 1991-2</h3>`;
  for (const [t, r] of [['LM1 – TS', ec.TS], ['LM1 – UDL', ec.UDL], ['gr1a = TS + UDL + trottoirs 3 kN/m²', ec.gr1a], ['gr1b = LM2', ec.gr1b], ['gr3 = trottoirs 5 kN/m²', ec.gr3]]) h += tableCase(deck, keys, r, t);
  h += `<h3>4.2 Fascicule 61 titre II (δ inclus pour B et Mc)</h3>`;
  for (const [t, r] of [['A(l)', f61.A], ['Bc', f61.Bc], ...(f61.Bt ? [['Bt', f61.Bt]] : []), ['Mc120', f61.Mc120], ['D240', f61.D240], ['Trottoirs 1,5 kN/m²', f61.trottoir]]) h += tableCase(deck, keys, r, t);
  h += figs.M + figs.V + figs.R;

  // 5. Répartition transversale
  h += `<h2>5. Répartition transversale (Guyon-Massonnet)</h2>`;
  deck.spans.forEach((L, j) => {
    const es = [0, 0.25, 0.5, 0.75, 1].map(r => r * deck.b);
    const T = tableK({ b: deck.b, L: deck.Leq[j], es, ys: deck.ys, nu: deck.nu, alpha: deck.alphaTorsion });
    h += `<h4>Travée ${j + 1} — θ = ${f3(deck.b / deck.Leq[j])}</h4><table><thead><tr><th>e \\ y</th>${deck.ys.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>${T.map((row, i) => `<tr><td>e = ${es[i].toFixed(2)}</td>${row.map(v => `<td>${f3(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });
  h += figs.K + figs.f;

  // 6. Thermique, tassements
  if (thermal) {
    h += `<h2>6. Gradient thermique et tassements d'appui</h2><table><thead><tr><th>Section</th><th>T échauffement [kN·m]</th><th>T refroidissement</th><th>Ta ±</th></tr></thead><tbody>`;
    for (const k of keys) h += `<tr><td>${k.label}</td><td>${f1(thermal.heat.M[k.idx])}</td><td>${f1(thermal.cool.M[k.idx])}</td><td>${f1(settle.Mmax[k.idx])}</td></tr>`;
    h += `</tbody></table><p class="small">Courbure imposée κ = α·ΔT/h sur toutes les travées ; tassements : δ et −δ sur deux appuis adjacents, enveloppe des paires, module différé.</p>`;
  }

  // 7. Ferraillage longitudinal
  h += `<h2>7. Combinaisons et ferraillage longitudinal</h2><p class="small">Eurocodes : ELU = 1,35 G + 1,35 Q ; ELS caractéristique = G + Ta + max(T + ψ₀Q ; 0,6 T + Q_LM1 ; Q_LM2) ; ELS fréquent = G + max(0,6 T ; 0,5 T + ψ₁Q_LM1 ; 0,75 Q_LM2) ; ELS quasi-permanent = G + Ta + 0,5 T. BAEL : ELU = 1,35 G + 1,6 (A ou B) + 1,6 Tr ou 1,35 G + 1,35 (Mc ou D) ; ELS = G + Ta + 0,6 T + 1,2 (A ou B) + Tr ou G + Ta + 0,6 T + (Mc ou D). Hauteur utile d = h − c = ${f3(dEC.d)} m. Moments en kN·m/m (fibre la plus sollicitée), aciers en cm²/m.</p>
<h3>7.1 Eurocodes (EC2) — σs ≤ ${dEC.mat.sigSlim} MPa (ELS car., fatigue simplifiée), σc ≤ ${f1(dEC.mat.sigCcar)} MPa, wk ≤ ${p.mat.wkMax} mm (ELS fréquent)</h3>
<table><thead><tr><th>Section</th><th>Face</th><th>y</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>M QP</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>min</th><th>A_s</th><th>σs</th><th>σc</th></tr></thead><tbody>`;
  for (const k of keys) for (const face of ['bot', 'top']) { const arr = dEC[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dEC.perFibre[k.idx][iy][face];
    h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${deck.ys[iy]}</td><td>${f0(f.Mu)}</td><td>${f0(f.Mcar)}</td><td>${f0(f.Mfre)}</td><td>${f0(f.Mqp)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(Math.max(f.as921, f.as732, f.perFace))}</td><td><b>${cm(f.As)}</b></td><td>${f0(f.sigS)}</td><td>${f1(f.sigC)}</td></tr>`; }
  h += `</tbody></table><p class="small">Minimums : 9.2.1.1 ×1,2 = ${cm(dEC.mins.as921)} cm²/m (fibre tendue à l'ELS car.), 7.3.2 = ${cm(dEC.mins.as732)} (fibre tendue à l'ELS QP), 3 cm²/m par face. Effort tranchant V_Ed/V_Rd,c : ${keys.map(k => `${k.label} ${dEC.shear[k.idx].ratio.toFixed(2)}`).join(' ; ')}. Poinçonnement : LM1 vEd ${dEC.punch.LM1.vEd.toFixed(3)} / vRd,c ${dEC.punch.LM1.vRdc.toFixed(3)} MPa ; LM2 ${dEC.punch.LM2.vEd.toFixed(3)} MPa.</p>
<h3>7.2 Fascicule 61 + BAEL 91 — σ̄s = ${isFinite(dB.mat.sigSbar) ? f0(dB.mat.sigSbar) + ' MPa' : '—'}, σ̄bc = ${f1(dB.mat.sigBbar)} MPa</h3>
<table><thead><tr><th>Section</th><th>Face</th><th>y</th><th>M ELU</th><th>M ELS</th><th>ELU</th><th>ELS</th><th>min</th><th>A_s</th><th>σs</th><th>σb</th></tr></thead><tbody>`;
  for (const k of keys) for (const face of ['bot', 'top']) { const arr = dB[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dB.perFibre[k.idx][iy][face];
    h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${deck.ys[iy]}</td><td>${f0(f.Mu)}</td><td>${f0(f.Ms)}</td><td>${cm(f.AsELU)}</td><td>${cm(f.AsELS)}</td><td>${cm(Math.max(f.nonFrag, f.dalle))}</td><td><b>${cm(f.As)}</b></td><td>${f0(f.sigS)}</td><td>${f1(f.sigB)}</td></tr>`; }
  h += `</tbody></table><p class="small">τu/τ̄u : ${keys.map(k => `${k.label} ${dB.shear[k.idx].ratio.toFixed(2)}`).join(' ; ')}. Poinçonnement Br : ${dB.punch.Br.Qu.toFixed(3)} / ${dB.punch.Br.QuLim.toFixed(3)} MN.</p>` + figs.As;

  // 8. Transversal
  h += `<h2>8. Flexion transversale et aciers transversaux</h2><p class="small">Dalle isostatique équivalente, charges diffusées au feuillet moyen, séries de Fourier ; d = ${f3(tEC.d)} m.</p>
<table><thead><tr><th>Travée</th><th>Face</th><th>y</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>non sect.</th><th>A_s,y (EC2)</th><th>M ELS BAEL</th><th>A_s,y (BAEL)</th></tr></thead><tbody>`;
  tEC.spans.forEach((sp, j) => { for (const face of ['bot', 'top']) { const f = sp[face], fb = tB.spans[j][face];
    h += `<tr><td>Travée ${sp.j + 1}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${f.y}</td><td>${f1(f.Mu)}</td><td>${f1(f.Mcar)}</td><td>${f1(f.Mfre)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(f.nonSec)}</td><td><b>${cm(f.As)}</b></td><td>${f1(fb.Ms)}</td><td><b>${cm(fb.As)}</b></td></tr>`; } });
  h += `</tbody></table>` + figs.my;

  // 9. Références
  h += `<h2>9. Hypothèses et références</h2><p class="small">H1 dalle isotrope de largeur totale, ν = ${deck.nu} ; H2 poutre continue à EI constant ; H3 premier harmonique, L_eq de la travée seule chargée (« méthode des moments ») ; H4 arrangement transversal le plus défavorable par fibre, files indépendantes longitudinalement ; H5 poids propre K = 1, charges excentrées K(e, y) ; H6 ouvrage droit ; H7 flexion transversale sur dalle isostatique équivalente. Vérifications : 32 tests unitaires dont la note CHAMOA-PSIDA (Cerema, ch. 4) : moments permanents, travée équivalente, gradient thermique et tassements à 10⁻³, moment de calcul LM1 à 1 %, aciers de flexion à 1 %.</p>
<p class="small">Références : EN 1990 (A2), EN 1991-1-5, EN 1991-2, EN 1992-1-1, EN 1992-2 et annexes nationales ; Fascicule 61 titre II ; BAEL 91 ; SETRA, Ponts-dalles – guide de conception (1989) ; Cerema, CHAMOA-P PSIDA – guide technique ; Bareš & Massonnet (1966) ; Pücher (1977) ; Hambly (1991) ; Calgaro & Virlogeux.</p>
</body></html>`;
  return h;
}
