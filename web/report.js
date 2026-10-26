/**
 * Note de calcul imprimable (HTML autonome ouvert dans un nouvel onglet → impression / PDF par le navigateur).
 * Les graphiques Plotly sont rendus en PNG (Plotly.toImage) et incorporés en data: URI ; les schémas SVG sont repris tels quels.
 */
import { elevationSVG, crossSectionSVG } from './svg.js';
import { tableK } from '../src/guyon.js';
import { planSVG, zoningPlanSVG } from './schema.js';
import { longitudinalRebarSVG, crossRebarSVG, scheduleHTML } from './rebarplan.js';
import { supportsBlocks, waterBlocks, blocksToHTML } from './supports_view.js';
import { seismicBlocks } from './seismic_note.js';
import { ddrBlocks } from './ddr_view.js';
import { katexHead } from './note.js';

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
    abaque: document.querySelector('#plot-abaque')?.data ? await img(document.querySelector('#plot-abaque'), 'Abaque d\'épaisseur PSI.DA du guide SETRA 1989 (numérisé) et point du projet') : '',
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
</style>${katexHead(typeof location !== 'undefined' && /^https?:/.test(location.origin) ? location.origin + location.pathname.replace(/\/[^/]*$/, '') : '')}</head><body>
<div class="noprint" style="margin-bottom:12px"><button onclick="window.print()" style="padding:8px 14px;font:inherit">Imprimer / enregistrer en PDF</button></div>
<h1>Note de calcul — pont-dalle en béton armé (PSI-DA)</h1>
<div class="meta">Calcul manuel assisté — moteur PSIDA v${esc(st.version || '0.14')} · ${date} · référentiels : Eurocodes (EN 1990/1991-2/1992) et Fascicule 61 titre II + BAEL 91</div>`;

  // 1. Données
  h += `<h2>1. Données</h2><div class="box">
<b>Géométrie</b> : ${deck.spans.length} travée(s) de ${deck.spans.join(' / ')} m${(g.overhangs || [0, 0]).some(v => v > 0) ? ', abouts ' + g.overhangs.join(' / ') + ' m' : ''} ; dalle de largeur 2b = ${2 * deck.b} m, épaisseur h = ${deck.h} m (aire ${deck.area.toFixed(3)} m²${g.chamfer ? ', chanfreins : hauteur au bord ' + g.chamfer.hEdge + ' m, joue ' + g.chamfer.joue + ' m' : ''}) ; chaussée y ∈ [${g.roadway.y1} ; ${g.roadway.y2}] m${(g.footways || []).length ? ' ; trottoirs ' + g.footways.map(f => `[${f.y1} ; ${f.y2}]`).join(', ') : ''}.<br>
<b>Charges permanentes</b> : béton ${deck.gammaC} kN/m³ ; ${(g.lines || []).map(l => `${l.g} kN/m en y = ${l.e}${l.kmin !== 1 || l.kmax !== 1 ? ` (k ${l.kmin}/${l.kmax})` : ''}`).join(' ; ') || 'pas de charge linéaire'} ; ${(g.bands || []).map(b => `${b.q} kN/m² sur [${b.y1} ; ${b.y2}]${b.kmin !== 1 || b.kmax !== 1 ? ` (k ${b.kmin}/${b.kmax})` : ''}`).join(' ; ') || 'pas de charge surfacique'} ; g total = ${f1(perm.gTotal)} kN/m.<br>
<b>Trafic</b> : Eurocode ${ec.alpha.label}, ${ec.lanes.n} voie(s) de ${ec.lanes.wl.toFixed(2)} m (aire résiduelle ${ec.lanes.wr.toFixed(2)} m) ; Fascicule 61 classe ${f61.classe}, L_c = ${f61.Lc.toFixed(2)} m, ${f61.nv} voie(s) de ${f61.v.toFixed(2)} m.<br>
<b>Autres actions</b> : ${thermal ? `gradient thermique ${p.dT[0]} / ${p.dT[1]} °C (EI = ${(thermal.EI / 1e6).toFixed(3)}·10⁶ kN·m²), tassements aléatoires δ = ${p.delta} m (module différé E/(1+${p.phiFluage}))` : 'sans température ni tassements'}.<br>
<b>Matériaux</b> : C${dEC.mat.fck}/${dEC.mat.fck + 10} (fcd ${f1(dEC.mat.fcd)} MPa, fctm ${dEC.mat.fctm.toFixed(2)} MPa, Ecm ${f0(dEC.mat.Ecm)} MPa), B${dEC.mat.fyk} (fyd ${f0(dEC.mat.fyd)} MPa) ; BAEL : fc28 = ${dB.mat.fc28} MPa, fe = ${dB.mat.fe} MPa, fissuration ${dB.mat.fissuration} ; enrobage à l'axe c = ${p.mat.c} m, φ = ${p.mat.phi * 1000} / ${p.mat.phiT * 1000} mm, wk ≤ ${p.mat.wkMax} mm, revêtement ${p.mat.tRev} m.<br>
<b>Modèle</b> : poutre continue à EI constant (lignes d'influence sur 100 positions par travée) ; répartition transversale de Guyon-Massonnet recalculée (dalle isotrope, ν = ${deck.nu}, α = ${deck.alphaTorsion}), θ = b/L_eq avec L_eq = distance entre points de moment nul de la travée seule chargée ; arrangements transversaux balayés par pas de ${deck.laneStep} m.
</div>`;

  // 2. Conception
  if (st.concept) {
    const c = st.concept, lab = { ok: 'OK', info: 'info', warn: 'attention' };
    h += `<h2>2. Conception et prédimensionnement (guide SETRA « Ponts-dalles », 1989)</h2>`;
    for (const sec of c.sections) h += `<h4>${esc(sec.title)}</h4><ul class="small">${sec.items.map(it => `<li><b>[${lab[it.level]}]</b> ${esc(it.text)}</li>`).join('')}</ul>`;
    h += figs.abaque;
    h += `<h4>Variantes de travure pour L = ${c.Ltot.toFixed(1)} m entre appuis extrêmes</h4><table><thead><tr><th>Travées</th><th>Portées [m]</th><th>Type</th><th>h indicatif [m]</th></tr></thead><tbody>${c.travures.map(v => `<tr><td>${v.n}</td><td>${v.spans.join(' – ')}</td><td>${v.ok ? 'PSI.' + v.type : 'hors domaine'}</td><td>${v.ok ? v.hGuide.toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table>`;
    if (st.bearings) {
      const b = st.bearings;
      h += `<h4>Appareils d'appui en élastomère fretté (guide § 3.6, gamme NF T 47.815)</h4><p class="small">${b.nb} appareils par ligne ; P max = réaction de l'appareil le plus chargé avec les coefficients d'inégalité de répartition de PSI-DA 68 § 2.4.2${b.ineq ? ` (k_CP = ${b.ineq.CP.toFixed(3)}, k_A = ${b.ineq.A.toFixed(3)}, k_B = ${b.ineq.B.toFixed(3)})` : ''} ; point fixe à x = ${b.xf.toFixed(1)} m ; ε = ${b.epsSlow}, ΔT = ${b.dT} °C ; H = ${b.H.toFixed(0)} kN (freinage EN 1991-2) ; α = ${(b.alpha0 * 1000).toFixed(0)} mrad + rotation d'appui ; σ ≤ min(15 ; G ab/(t(a+b))), u_g/T ≤ 0,5, u_g/T + H/(G₂ab) ≤ 0,7, T ≤ min(a,b)/5, t·T ≥ α a²/3.</p>
<table><thead><tr><th>Ligne</th><th>x [m]</th><th>R max / min [kN]</th><th>P max / min [kN]</th><th>u_g [mm]</th><th>H [kN]</th><th>α [mrad]</th><th>Appareil</th><th>σ / σ_lim</th><th>u_g/T ; total</th><th>σ_min</th></tr></thead><tbody>${b.rows.map(r => `<tr><td>${r.i}</td><td>${r.x.toFixed(1)}</td><td>${f0(r.Rmax)} / ${f0(r.Rmin)}</td><td>${f0(r.Pmax)} / ${f0(r.Pmin)}</td><td>${f1(r.ug * 1000)}</td><td>${f1(r.Hb)}</td><td>${f1(r.alpha * 1000)}</td><td>${r.sel ? r.sel.label : 'aucun appareil standard'}</td><td>${r.sel ? f1(r.sel.sig) + ' / ' + f1(r.sel.sigLim) : ''}</td><td>${r.sel ? r.sel.dist1.toFixed(2) + ' ; ' + r.sel.dist2.toFixed(2) : ''}</td><td>${r.sel ? f1(r.sel.sigMin) + (r.sel.antiCheminement ? ' (anti-cheminement)' : '') + (r.sel.glissement ? ' (blocage)' : '') : ''}</td></tr>`).join('')}</tbody></table>`;
    }
    if (st.chevetres) {
      const cm = v => (v * 1e4).toFixed(1);
      h += `<h4>Chevêtres incorporés (guide PSIDP-EL, annexe 4)</h4><p class="small">ELU 1,35 G + 1,35 LM1 ; ligne d'appui de longueur 2b/sin ψ, consoles c = ${st.chevetres[0].c.toFixed(2)} m, entraxe a = ${st.chevetres[0].a.toFixed(2)} m ; charges de type 1 (réparties) et de type 2 (proches de la ligne, part ζ) ; moments locaux m_c⁻ = M_c⁻/(1,5 c), m_e = 1,5 M_e/e ; aciers par bandes en enveloppe avec le ferraillage courant (§ 6.2 : sections « au moins » ; seul le complément est ajouté).</p>
<table><thead><tr><th>Ligne</th><th>ζ TS / UDL</th><th>R rive / centre [kN]</th><th>m_c⁻ / m_e⁻ / m_e⁺ [kN·m/m]</th><th>Face sup. ①/②/③ [cm²/m]</th><th>Face inf. ①'/②' [cm²/m]</th></tr></thead><tbody>${st.chevetres.map(r => `<tr><td>${r.i}</td><td>${r.zetas.map(z => z.toFixed(2)).join(' / ')}</td><td>${f0(r.R1)} / ${f0(r.R2)}</td><td>${f0(r.mc)} / ${f0(r.me_neg)} / ${f0(r.me_pos)}</td><td>${r.bands.top.map(b => cm(b.As)).join(' / ')}</td><td>${r.bands.bot.map(b => cm(b.As)).join(' / ')}</td></tr>`).join('')}</tbody></table>`;
    }
    if (st.hSearch) h += `<h4>Recherche de l'épaisseur minimale vérifiée (Eurocodes)</h4><table><thead><tr><th>h [m]</th><th>A_s inf</th><th>A_s sup</th><th>ρ max [%]</th><th>σc</th><th>x/d</th><th>V_Ed/V_Rd,c</th><th>Verdict</th></tr></thead><tbody>${st.hSearch.rows.map(r => `<tr><td>${r.h.toFixed(2)}</td><td>${cm(r.asBot)}</td><td>${cm(r.asTop)}</td><td>${(Math.max(r.rhoBot, r.rhoTop) * 100).toFixed(2)}</td><td>${f1(r.sigC)}</td><td>${r.xd.toFixed(2)}</td><td>${r.vRatio.toFixed(2)}</td><td>${r.ok ? 'vérifiée' : esc(r.crit.join(', '))}</td></tr>`).join('')}</tbody></table>`;
  }

  // 3. Modèle
  h += `<h2>3. Modèle de calcul</h2><div class="svg">${elevationSVG(deck, keys)}</div><div class="svg">${crossSectionSVG({ deck, loads: [], title: 'Coupe transversale', note: '' })}</div>${p.concept && p.concept.psi < 100 ? `<div class="svg">${planSVG({ spans: deck.spans, width: 2 * deck.b, overhangs: g.overhangs || [0, 0], roadway: g.roadway, psi: p.concept.psi, transDir: p.concept.transversePerpendicular ? 'perp' : 'appuis' })}</div>` : ''}
<table><thead><tr><th>Travée</th><th>L [m]</th><th>L_eq [m]</th><th>θ = b/L_eq</th></tr></thead><tbody>${deck.spans.map((L, j) => `<tr><td>${j + 1}</td><td>${L}</td><td>${f3(deck.Leq[j])}</td><td>${f3(deck.b / deck.Leq[j])}</td></tr>`).join('')}</tbody></table>`;

  // 4. Permanent
  h += `<h2>4. Charges permanentes</h2><table><thead><tr><th>Section</th><th>M nominal [kN·m]</th><th>M min</th><th>M max</th>${deck.ys.map(y => `<th>m_x(y = ${y})</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) h += `<tr><td>${k.label}</td><td>${f1(perm.M[k.idx])}</td><td>${f1(perm.Mmin[k.idx])}</td><td>${f1(perm.Mmax[k.idx])}</td>${perm.mx[k.idx].map(v => `<td>${f1(v)}</td>`).join('')}</tr>`;
  h += `</tbody></table><p class="small">Réactions nominales : ${perm.R.map(f0).join(' / ')} kN. Moments de la poutre entière en kN·m, par mètre de largeur en kN·m/m (K = 1 pour le poids propre, K(e, y) pour les charges excentrées).</p>`;

  // 5. Trafic
  h += `<h2>5. Charges d'exploitation (valeurs caractéristiques)</h2><h3>5.1 Eurocodes — EN 1991-2</h3>`;
  for (const [t, r] of [['LM1 – TS', ec.TS], ['LM1 – UDL', ec.UDL], ['gr1a = TS + UDL + trottoirs 3 kN/m²', ec.gr1a], ['gr1b = LM2', ec.gr1b], ['gr3 = trottoirs 5 kN/m²', ec.gr3]]) h += tableCase(deck, keys, r, t);
  h += `<h3>5.2 Fascicule 61 titre II (δ inclus pour B et Mc)</h3>`;
  for (const [t, r] of [['A(l)', f61.A], ['Bc', f61.Bc], ...(f61.Bt ? [['Bt', f61.Bt]] : []), ['Mc120', f61.Mc120], ['D240', f61.D240], ['Trottoirs 1,5 kN/m²', f61.trottoir]].filter(([, r]) => r)) h += tableCase(deck, keys, r, t);
  h += figs.M + figs.V + figs.R;

  // 6. Répartition transversale
  h += `<h2>6. Répartition transversale (Guyon-Massonnet)</h2>`;
  deck.spans.forEach((L, j) => {
    const es = [0, 0.25, 0.5, 0.75, 1].map(r => r * deck.b);
    const T = tableK({ b: deck.b, L: deck.Leq[j], es, ys: deck.ys, nu: deck.nu, alpha: deck.alphaTorsion });
    h += `<h4>Travée ${j + 1} — θ = ${f3(deck.b / deck.Leq[j])}</h4><table><thead><tr><th>e \\ y</th>${deck.ys.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>${T.map((row, i) => `<tr><td>e = ${es[i].toFixed(2)}</td>${row.map(v => `<td>${f3(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });
  h += figs.K + figs.f;

  // 7. Thermique, tassements
  if (thermal) {
    h += `<h2>7. Gradient thermique et tassements d'appui</h2><table><thead><tr><th>Section</th><th>T échauffement [kN·m]</th><th>T refroidissement</th><th>Ta ±</th></tr></thead><tbody>`;
    for (const k of keys) h += `<tr><td>${k.label}</td><td>${f1(thermal.heat.M[k.idx])}</td><td>${f1(thermal.cool.M[k.idx])}</td><td>${f1(settle.Mmax[k.idx])}</td></tr>`;
    h += `</tbody></table><p class="small">Courbure imposée κ = α·ΔT/h sur toutes les travées ; tassements : δ et −δ sur deux appuis adjacents, enveloppe des paires, module différé.</p>`;
  }

  // 8. Ferraillage longitudinal
  h += `<h2>8. Combinaisons et ferraillage longitudinal</h2><p class="small">Eurocodes : ELU = 1,35 G + 1,35 Q ; ELS caractéristique = G + Ta + max(T + ψ₀Q ; 0,6 T + Q_LM1 ; Q_LM2) ; ELS fréquent = G + max(0,6 T ; 0,5 T + ψ₁Q_LM1 ; 0,75 Q_LM2) ; ELS quasi-permanent = G + Ta + 0,5 T. BAEL : ELU = 1,35 G + 1,6 (A ou B) + 1,6 Tr ou 1,35 G + 1,35 (Mc ou D) ; ELS = G + Ta + 0,6 T + 1,2 (A ou B) + Tr ou G + Ta + 0,6 T + (Mc ou D). Hauteur utile d = h − c = ${f3(dEC.d)} m. Moments en kN·m/m (fibre la plus sollicitée), aciers en cm²/m.</p>
<h3>8.1 Eurocodes (EC2) — σs ≤ ${dEC.mat.sigSlim} MPa (ELS car., fatigue simplifiée), σc ≤ ${f1(dEC.mat.sigCcar)} MPa, wk ≤ ${p.mat.wkMax} mm (ELS fréquent)</h3>
<table><thead><tr><th>Section</th><th>Face</th><th>y</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>M QP</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>min</th><th>A_s</th><th>σs</th><th>σc</th></tr></thead><tbody>`;
  for (const k of keys) for (const face of ['bot', 'top']) { const arr = dEC[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dEC.perFibre[k.idx][iy][face];
    h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${deck.ys[iy]}</td><td>${f0(f.Mu)}</td><td>${f0(f.Mcar)}</td><td>${f0(f.Mfre)}</td><td>${f0(f.Mqp)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(Math.max(f.as921, f.as732, f.perFace))}</td><td><b>${cm(f.As)}</b></td><td>${f0(f.sigS)}</td><td>${f1(f.sigC)}</td></tr>`; }
  h += `</tbody></table><p class="small">Minimums : 9.2.1.1 ×1,2 = ${cm(dEC.mins.as921)} cm²/m (fibre tendue à l'ELS car.), 7.3.2 = ${cm(dEC.mins.as732)} (fibre tendue à l'ELS QP), 3 cm²/m par face. Effort tranchant V_Ed/V_Rd,c : ${keys.map(k => `${k.label} ${dEC.shear[k.idx].ratio.toFixed(2)}`).join(' ; ')}. Poinçonnement : LM1 vEd ${dEC.punch.LM1.vEd.toFixed(3)} / vRd,c ${dEC.punch.LM1.vRdc.toFixed(3)} MPa ; LM2 ${dEC.punch.LM2.vEd.toFixed(3)} MPa.</p>
<h3>8.2 Fascicule 61 + BAEL 91 — σ̄s = ${isFinite(dB.mat.sigSbar) ? f0(dB.mat.sigSbar) + ' MPa' : '—'}, σ̄bc = ${f1(dB.mat.sigBbar)} MPa</h3>
<table><thead><tr><th>Section</th><th>Face</th><th>y</th><th>M ELU</th><th>M ELS</th><th>ELU</th><th>ELS</th><th>min</th><th>A_s</th><th>σs</th><th>σb</th></tr></thead><tbody>`;
  for (const k of keys) for (const face of ['bot', 'top']) { const arr = dB[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dB.perFibre[k.idx][iy][face];
    h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${deck.ys[iy]}</td><td>${f0(f.Mu)}</td><td>${f0(f.Ms)}</td><td>${cm(f.AsELU)}</td><td>${cm(f.AsELS)}</td><td>${cm(Math.max(f.nonFrag, f.dalle))}</td><td><b>${cm(f.As)}</b></td><td>${f0(f.sigS)}</td><td>${f1(f.sigB)}</td></tr>`; }
  h += `</tbody></table><p class="small">τu/τ̄u : ${keys.map(k => `${k.label} ${dB.shear[k.idx].ratio.toFixed(2)}`).join(' ; ')}. Poinçonnement Br : ${dB.punch.Br.Qu.toFixed(3)} / ${dB.punch.Br.QuLim.toFixed(3)} MN.</p>` + figs.As;

  // 9. Transversal
  h += `<h2>9. Flexion transversale et aciers transversaux</h2><p class="small">Dalle isostatique équivalente, charges diffusées au feuillet moyen, séries de Fourier ; d = ${f3(tEC.d)} m.${tEC.skew ? ` Ouvrage biais ψ = ${tEC.skew.psi} gr : aciers transversaux ${tEC.skew.psi2 < 100 ? 'parallèles aux lignes d\'appui' : 'perpendiculaires aux bords libres'}, moments M_APF dans la direction des aciers (annexe 12A du BPEL, pratique CHAMOA) à partir de MX (longitudinal maximal) et MY (transversal maximal) tournés du biais mécanique ; aciers par mètre perpendiculaire aux aciers (× sin ψ = ${tEC.skew.sinPsi.toFixed(3)} par mètre d'axe).` : ''}</p>`;
  if (tEC.skew) {
    h += `<table><thead><tr><th>Travée</th><th>φ_mec [gr]</th><th>MX car.</th><th>MY car.</th><th>M_APF car.</th><th>MX ELU</th><th>MY ELU</th><th>M_APF ELU</th><th>M_APF min car.</th></tr></thead><tbody>${tEC.spans.map(sp => `<tr><td>${sp.j + 1}</td><td>${sp.skew.phiMec.toFixed(2)}</td><td>${f1(sp.skew.max.CAR.MX)}</td><td>${f1(sp.skew.max.CAR.MY)}</td><td><b>${f1(sp.skew.max.CAR.M)}</b></td><td>${f1(sp.skew.max.ELU.MX)}</td><td>${f1(sp.skew.max.ELU.MY)}</td><td><b>${f1(sp.skew.max.ELU.M)}</b></td><td>${f1(sp.skew.min.CAR.M)}</td></tr>`).join('')}</tbody></table>`;
  }
  h += `
<table><thead><tr><th>Travée</th><th>Face</th><th>y</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>non sect.</th><th>A_s,y (EC2)</th><th>M ELS BAEL</th><th>A_s,y (BAEL)</th></tr></thead><tbody>`;
  tEC.spans.forEach((sp, j) => { for (const face of ['bot', 'top']) { const f = sp[face], fb = tB.spans[j][face];
    h += `<tr><td>Travée ${sp.j + 1}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${f.y}</td><td>${f1(f.Mu)}</td><td>${f1(f.Mcar)}</td><td>${f1(f.Mfre)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(f.nonSec)}</td><td><b>${cm(f.As)}</b></td><td>${f1(fb.Ms)}</td><td><b>${cm(fb.As)}</b></td></tr>`; } });
  h += `</tbody></table>` + figs.my;

  // 10. Modules complémentaires
  if (st.extra) {
    const x = st.extra, cm2 = v => cm(v);
    h += `<h2>10. Phase de chantier, convois LM3, encorbellement, fatigue, zonage</h2>`;
    const tab = (title, dz, note) => { let t = `<h3>${title}</h3><p class="small">${note}</p><table><thead><tr><th>Section</th><th>M car. poutre</th><th>M ELU/m</th><th>M car./m</th><th>A_s inf</th><th>A_s sup</th><th>Retenu inf / sup (max avec le profil définitif)</th></tr></thead><tbody>`;
      for (const k of keys) { const s2 = k.idx; const ib = dz.bot[s2].indexOf(Math.max(...dz.bot[s2])), it = dz.top[s2].indexOf(Math.max(...dz.top[s2])); const mc = Math.abs(dz.beamCAR.max[s2]) > Math.abs(dz.beamCAR.min[s2]) ? dz.beamCAR.max[s2] : dz.beamCAR.min[s2];
        t += `<tr><td>${k.label}</td><td>${f0(mc)}</td><td>${f0(k.kind === 'support' ? dz.comb.ELU.min[s2][it] : dz.comb.ELU.max[s2][ib])}</td><td>${f0(k.kind === 'support' ? dz.comb.CAR.min[s2][it] : dz.comb.CAR.max[s2][ib])}</td><td>${cm2(dz.envBot[s2])}</td><td>${cm2(dz.envTop[s2])}</td><td><b>${cm2(Math.max(dz.envBot[s2], dEC.envBot[s2]))} / ${cm2(Math.max(dz.envTop[s2], dEC.envTop[s2]))}</b></td></tr>`; }
      return t + `</tbody></table>`; };
    if (x.chantier) h += tab('Profil provisoire (phase de chantier)', x.chantier.design, esc(`Poids propre + ${x.chantier.perm.files.slice(1).map(f => `${f.label} ${f.q.toFixed(1)} kN/m`).join(' + ')} ; engins ${x.chantier.vehicles.map(v => `${v.label} (× ${v.factor})`).join(', ')} seuls sur [${x.chantier.roadway.y1} ; ${x.chantier.roadway.y2}] moins ${x.chantier.neutral} m ; ELU 1,35 G + 1,35 Q, ELS car. G + Ta + 0,6 T + Q.`));
    if (x.lm3) h += tab(`Convoi LM3 seul — ${x.lm3.vehicle.label}`, x.lm3.design, esc(`${x.lm3.vehicle.axles.length} essieux de ${x.lm3.vehicle.axles[0].P} kN, largeur ${x.lm3.vehicle.width} m, incertitude ${x.lm3.vehicle.unc}, dynamique ${x.lm3.vehicle.dyn.toFixed(3)}.`));
    if (x.cantilever) { const m = x.cantilever.mom, cd = x.cantilever.design; h += `<h3>Encorbellement (${m.Lc} m, h ${m.hr} → ${m.ht} m)</h3><p class="small">G ${f1(m.G.m)} ; trottoir ${f1(m.footway.seul)} / ${f1(m.footway.avecLM1)}${m.ts ? ` ; TS ${f1(m.ts.m)} (b_eff ${m.ts.beff.toFixed(2)} m), LM2 ${f1(m.lm2.m)}, UDL ${f1(m.udl.m)}` : ''} kN·m/m ; ${esc(m.governing)} ; ELU ${f1(m.ELU)}, ELS car. ${f1(m.CAR)}, fréq. ${f1(m.FREQ)} ; aciers supérieurs d'encastrement ${cm2(cd.As)} cm²/m (ELU ${cm2(cd.AsULS)}, ELS ${cm2(cd.AsSLS)}, wk ${cm2(cd.AsWk)}).</p>`; }
    if (x.fatigue) { const f = x.fatigue; h += `<h3>Fatigue des armatures (EN 1992-2 annexe NN, FLM3)</h3><p class="small">λ_s = ${f.phiFat} × ${f.lambda1} × ${f.lambda2.toFixed(3)} × ${f.lambda3.toFixed(3)} × ${f.lambda4.toFixed(3)} = ${f.lambdaS.toFixed(3)} ; essieux × 1,75 (appuis) / 1,40 (travées) ; limite ${(f.dSigRsk / f.gammaS).toFixed(1)} MPa.</p><table><thead><tr><th>Section</th><th>Face / y</th><th>A_s</th><th>ΔM × k</th><th>σs min → max</th><th>Δσ_s,equ</th><th>Taux</th></tr></thead><tbody>${f.rows.map(r => `<tr><td>${r.label}</td><td>${r.face === 'bot' ? 'inf' : 'sup'} / ${r.y}</td><td>${cm2(r.As)}</td><td>${f1(r.dM)}</td><td>${f0(r.sigLo)} → ${f0(r.sigHi)}</td><td>${f1(r.dSigEqu)}</td><td>${r.ratio.toFixed(2)} ${r.ok ? 'OK' : 'NON'}</td></tr>`).join('')}</tbody></table>`; }
    if (x.zonage) { const z = x.zonage; h += `<h3>Zonage du ferraillage (guide SETRA 1989 § 3.4.4 à 3.4.8)</h3><div class="svg">${zoningPlanSVG({ spans: deck.spans, width: 2 * deck.b, overhangs: g.overhangs || [0, 0], psi: p.concept.psi, h: deck.h }, z)}</div><table><thead><tr><th>Zone</th><th>x début</th><th>x fin</th><th>Longueur</th></tr></thead><tbody>${z.zones.map(zz => `<tr><td>${zz.kind === 'chevetre' ? 'Chevêtre' : 'Extension'} ${zz.support}</td><td>${zz.x1.toFixed(2)}</td><td>${zz.x2.toFixed(2)}</td><td>${(zz.x2 - zz.x1).toFixed(2)}</td></tr>`).join('')}</tbody></table><ul class="small">${z.rules.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul>`; }
  }

  // 11. Plan de ferraillage
  if (st.rebar) {
    const r = st.rebar, x0 = deck.beam.x0;
    const jm = deck.spans.indexOf(Math.max(...deck.spans));
    h += `<h2>11. Plan de ferraillage</h2><p class="small">Enveloppe des aciers requis (profils ${esc(r.governing.join(', '))}) ; épure décalée a_l = d = ${r.al.toFixed(3)} m ; ≥ 50 % des aciers inférieurs prolongés sur appuis ; ancrages et recouvrements EC2 8.4 / 8.7 ; barres de 12 m au plus. ${r.deficits.length ? `ATTENTION : ${r.deficits.length} section(s) en déficit.` : 'Aciers mis en place ≥ aciers requis dans toutes les sections.'}</p>
<div class="svg">${longitudinalRebarSVG(deck, r)}</div><div class="svg">${crossRebarSVG(deck, r, x0[jm] + deck.spans[jm] / 2, `Coupe transversale — mi-travée ${jm + 1}`)}</div>${deck.spans.length > 1 ? `<div class="svg">${crossRebarSVG(deck, r, x0[1], 'Coupe transversale — appui P1')}</div>` : ''}<h3>Nomenclature et métré</h3>${scheduleHTML(r)}`;
  }

  // 12. Références
  if (st.supports) {
    h += `<h2>11 bis. Appuis et fondations</h2><h3>Eurocodes</h3>${blocksToHTML(supportsBlocks(st.supports, 'EC', { noWater: true }))}${st.supports.rail ? '' : `<h3>Fascicule 61 / BAEL / Fascicule 62 titre V</h3>${blocksToHTML(supportsBlocks(st.supports, 'F61', { noWater: true }))}`}`;
    const wE = waterBlocks(st.supports, 'EC');
    if (wE.length) h += `<h2>11 ter. Piles en rivière — courant, embâcles, affouillement</h2><h3>Eurocodes</h3>${blocksToHTML(wE)}${st.supports.rail ? '' : `<h3>Fascicule 61 / BAEL / Fascicule 62 titre V</h3>${blocksToHTML(waterBlocks(st.supports, 'F61'))}`}`;
    h += `<h2>11 quater. Calcul sismique — EN 1998-2 (Pont EC8)</h2>${blocksToHTML(seismicBlocks(st.supports.sp.seisme.actif ? st.supports.seisme : null))}`;
  }
  if (st.ddr) h += `<h2>11 quinquies. Dispositifs de retenue — indice de danger</h2>${blocksToHTML(ddrBlocks(st.ddr))}`;
  h += `<h2>12. Hypothèses et références</h2><p class="small">H1 dalle isotrope de largeur totale, ν = ${deck.nu} ; H2 poutre continue à EI constant ; H3 premier harmonique, L_eq de la travée seule chargée (« méthode des moments ») ; H4 arrangement transversal le plus défavorable par fibre, files indépendantes longitudinalement ; H5 poids propre K = 1, charges excentrées K(e, y) ; H6 calcul longitudinal suivant les portées biaises sans correction (biais mécanique et annexe 12A dans le module biais) ; H7 flexion transversale sur dalle isostatique équivalente. Vérifications : 51 tests unitaires dont la note CHAMOA-PSIDA (Cerema, ch. 4) : moments permanents, travée équivalente, gradient thermique et tassements à 10⁻³, moment de calcul LM1 à 1 %, aciers de flexion à 1 %, biais mécanique et moments de l'annexe 12A à 10⁻⁴.</p>
<p class="small">Références : EN 1990 (A2), EN 1991-1-5, EN 1991-2, EN 1992-1-1, EN 1992-2 et annexes nationales ; Fascicule 61 titre II ; BAEL 91 ; SETRA, Ponts-dalles – guide de conception (1989) ; Cerema, CHAMOA-P PSIDA – guide technique ; Bareš & Massonnet (1966) ; Pücher (1977) ; Hambly (1991) ; Calgaro & Virlogeux.</p>
</body></html>`;
  return h;
}
