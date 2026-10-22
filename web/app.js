import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA, notionalLanes, lm1 } from '../src/loads_ec.js';
import { voiesF61, classePont, MC120, D240 } from '../src/loads_f61.js';
import { elevationSVG, crossSectionSVG } from './svg.js';
import { envelopePlot, shearPlot, reactionPlot, kPlot, transversePlot, factorPlot, influencePlot, surfacePlot, asPlot, myPlot, abaquePlot } from './plots.js';
import * as ABAQUES from '../src/abaques1989.js';
import { designEC, designBAEL, designTransverseEC, designTransverseBAEL } from '../src/design.js';
import { TransverseModel } from '../src/transverse.js';
import { buildReport } from './report.js';
import { buildNote, noteToHTML, noteToDocx } from './note.js';
import { aideConception, rechercheEpaisseur } from '../src/conception.js';
import { designBearings, inequalityCoefficients, inequalityWheels, bearingSpacing, endRotations } from '../src/bearings.js';
import { chevetresEC } from '../src/chevetre.js';
import { renderPlaque } from './plaque_view.js';
import { majBouton as majReco, ouvrir as ouvrirReco } from './recommandations_view.js';
import { initNivellement } from './nivellement_view.js';
import { initTrace, planSVG as planTrace } from './trace_view.js';
import { Axe } from '../src/geom/axe.js';
import { candidats, dichotomie } from '../src/recommandations.js';
import { computeSupports } from '../src/supports/index.js';
import { applyHelp, readGeometry, elevationInputSVG, crossSectionInputSVG, planSVG, summaryHTML, zoningPlanSVG } from './schema.js';
import { parseAxles, vehicleEnvelope, provisionalProfile, ANNEX_A_VEHICLES, dynLM3 } from '../src/vehicles.js';
import { designSingleActionEC } from '../src/design.js';
import { zonage } from '../src/zonage.js';
import { cantileverMoments, cantileverDesign } from '../src/cantilever.js';
import { flm3Envelope, fatigueCheck } from '../src/fatigue.js';
import { rebarPlan } from '../src/rebar.js';
import { parseData, compute, computeConceptOnly, conceptInput, parseVehicle } from '../src/pipeline.js';
import { longitudinalRebarSVG, crossRebarSVG, scheduleHTML, providedPlot } from './rebarplan.js';
import { initPlans, renderPlans } from './plans_view.js';
import { initMaillage, renderMaillage } from './maillage_view.js';
import { supportsBlocks, blocksToHTML, supportsNote } from './supports_view.js';
import { parseStandalone, computeStandalone } from '../src/supports/standalone.js';
import { parseSupports } from '../src/pipeline.js';
import { psidpBlocks } from './psidp_view.js';
import { agrementList } from '../src/psidp/agrements.js';
import { guideElevationSVG, guideCrossSectionSVG } from './guide_schema.js';
import { toPontEC8 } from '../src/ec8export.js';
import { parsePoutres, computePoutres, linesToStandaloneText } from '../src/beams/run.js';
import { enhanceForm } from './fields.js';
import { beamsBlocks } from './beams_view.js';
import { cadreBlocks, cadreNote } from './cadre_view.js';
import { parseCadre, computeCadre } from '../src/cadre/run.js';
import { parseDDR, ddrHTML } from './ddr_view.js';

const $ = s => document.querySelector(s);

// --- onglets (adresse #projet, #tablier… comme Pont EC8) ---------------------------------------------------------------
// onglets : web/tabs.js (script classique chargé avant ce module)
const T = window.psidaTabs;
const goTab = (id, push) => T.goTab(id, push);
const hashData = () => T.hashData();
function setMode(mode) { document.body.dataset.mode = mode; }

const nums = s => s.split(/[,;\s]+/).filter(Boolean).map(Number);
const pairs = s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => nums(t));
const fmt = v => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
const cell = v => `<td class="${v < -0.05 ? 'neg' : ''}">${fmt(v)}</td>`;

let state = null, lastSearch = null;

// « 10 @ -5.85 k 0.8/1.2 » → { g, e, kmin, kmax } ; « 1.92 sur -5,5 k 0.8/1.4 » → { q, y1, y2, kmin, kmax }
function parseForm(form) { const p = parseData(Object.fromEntries(new FormData(form).entries())); withEC8(p.supports); return p; }
// --- onglet « Calcul sismique » (Pont EC8 en iframe) : efforts reçus, envoi du projet ---
let ec8Data = null, ec8Pending = null;
let ec8Used = null; // efforts sismiques (JSON) repris par le dernier calcul
function withEC8(sup) { if (sup && sup.seisme) sup.seisme.externe = ec8Data; ec8Used = ec8Data ? JSON.stringify(ec8Data.efforts) : null; return sup; }

// --- résultats périmés : bandeau dès qu'une donnée change après un calcul, ou que de nouveaux efforts sismiques arrivent ---
function markStale(msg) {
  if (!state) return;
  const el = $('#stale'); if (!el) return;
  // structure créée une fois : la recréer pendant un clic (blur → change) ferait perdre ce clic
  if (!el.querySelector('[data-stale-run]')) el.innerHTML = '<span data-stale-msg></span><button type="button" data-stale-run>Relancer le calcul</button>';
  el.querySelector('[data-stale-msg]').textContent = msg;
  el.hidden = false;
}
function clearStale() { const el = $('#stale'); if (el) el.hidden = true; }

const badge = lv => `<span class="badge ${lv}">${lv === 'ok' ? 'OK' : lv === 'warn' ? 'ATTENTION' : 'INFO'}</span>`;

function renderConception(st) {
  const c = st.concept;
  let h = '';
  for (const s of c.sections) h += `<h3>${s.title}</h3><ul class="checks">${s.items.map(it => `<li>${badge(it.level)}${it.text}</li>`).join('')}</ul>`;
  h += `<p class="small">Règles et ordres de grandeur du guide SETRA « Ponts-dalles – guide de conception » (1989) ; les paragraphes cités renvoient à ce guide. Le guide a été rédigé pour les charges du Fascicule 61 : les élancements indicatifs ne dispensent pas de la vérification (recherche d'épaisseur ci-dessous, puis calcul complet).</p>`;
  $('#concept').innerHTML = h;
  if (c.type === 'DA' && c.epaisseur.abaque) abaquePlot($('#plot-abaque'), st.deck.spans, c.epaisseur.abaque, c.epaisseur.k || 1, ABAQUES);
  else Plotly.purge($('#plot-abaque'));
  // appareils d'appui
  $('#concept-bearings').innerHTML = st.bearings ? bearingsTable(st) + (st.chevetres ? chevetresTable(st) : '') : '<p class="small">Disponible après le calcul complet (réactions ELS caractéristiques avec trafic).</p>';
  // variantes de travure
  const tv = c.travures;
  let t = `<p class="small">Longueur entre appuis extrêmes L = ${c.Ltot.toFixed(1)} m ; rives à 0,7 fois la travée adjacente (§ 2.1.1), travées décroissantes vers les culées ; épaisseur indicative par l'élancement du guide (B${st.p.mat.fck}). « Adopter » recopie la travure (et l'épaisseur indicative) dans le formulaire.</p>
  <table><thead><tr><th>Travées</th><th>Portées [m]</th><th>Type</th><th>h indicatif [m]</th><th>Emploi type (guide § 1.2)</th><th></th></tr></thead><tbody>`;
  tv.forEach((v, i) => { t += `<tr><td>${v.n}</td><td>${v.spans.join(' – ')}</td><td>${v.ok ? 'PSI.' + v.type : 'hors domaine pont-dalle'}</td><td>${v.ok ? v.hGuide.toFixed(2) : '—'}</td><td style="white-space:normal;text-align:left">${v.usage}</td><td><button type="button" class="mini" data-adopt="${i}" ${v.ok ? '' : 'disabled'}>Adopter</button></td></tr>`; });
  t += `</tbody></table>`;
  $('#concept-travures').innerHTML = t;
  // bornes par défaut de la recherche d'épaisseur
  const Lmax = Math.max(...st.deck.spans);
  const r2 = v => (Math.round(v / 0.02) * 0.02).toFixed(2);
  if (!$('#hs-min').value) $('#hs-min').value = r2(Math.max(0.3, Lmax / 32));
  if (!$('#hs-max').value) $('#hs-max').value = r2(Math.max(st.deck.h, Lmax / 14));
}

function bearingsTable(st) {
  const b = st.bearings;
  let h = `<p class="small">Règles du § 3.6.1 (bulletin technique n° 4 du SETRA) : σ = P/(ab) ≤ min(15 MPa ; G·ab/(t(a+b))) avec G = ${b.G1} MPa ; u_g/T ≤ 0,5 ; u_g/T + H/(G₂ab) ≤ 0,7 (G₂ = ${b.G2} MPa) ; T ≤ min(a, b)/5 ; t·T ≥ α·a²/3. Réactions ELS caractéristiques (G + trafic + T + Ta) ; réaction de l'appareil le plus chargé = [k_CP·R_G + k_Q·(R − R_G)]/${b.nb} avec les coefficients d'inégalité de répartition de PSI-DA 68 § 2.4.2 (entraxe × sin ψ = ${b.ineq ? b.ineq.e.toFixed(2) + ' m' : '—'} ; k_CP = ${b.ineq ? b.ineq.CP.toFixed(3) : '1'}, k_A (UDL) = ${b.ineq ? b.ineq.A.toFixed(3) : '1'}, k_B (TS) = ${b.ineq ? b.ineq.B.toFixed(3) : '1'}, k_Q pondéré par les réactions UDL/TS) ; u_g = (ε + α_T·ΔT)·distance au point fixe (ε = ${b.epsSlow}, ΔT = ${b.dT} °C, point fixe à x = ${b.xf.toFixed(1)} m) ; H = freinage EN 1991-2 § 4.4.1 = ${b.H.toFixed(0)} kN réparti sur ${b.nb * b.nLines} appareils ; α = ${(b.alpha0 * 1000).toFixed(0)} mrad de défaut de pose + rotation sous charges permanentes (module différé) + rotation sous gr1a (ligne d'influence de rotation). Sélection : plus petit appareil entièrement enrobé de la gamme standard du guide (NF T 47.815), ou appareil imposé dans le formulaire (culées, piles).</p>
  <table class="brg"><thead><tr><th>Ligne d'appui</th><th>Réactions [kN]</th><th>Déplacement, effort, rotation</th><th>Appareil retenu</th><th>Vérifications (valeur ≤ limite)</th><th>Observations</th></tr></thead><tbody>`;
  const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2);
  for (const r of b.rows) {
    const s = r.sel;
    h += `<tr><td><b>${r.i === 0 || r.i === b.rows.length - 1 ? 'Culée C' : 'Pile P'}${r.i}</b><br><span class="small">x = ${f1(r.x)} m</span></td>
      <td class="chk">ligne : ${r.Rmax.toFixed(0)} / ${r.Rmin.toFixed(0)}${r.uplift ? ' (soulèvement)' : ''}<br>appareil : <b>${r.Pmax.toFixed(0)}</b> / ${r.Pmin.toFixed(0)}<br><span class="small">k_CP ${f2(r.kCP)} ; k_Q ${f2(r.kQ)}</span></td>
      <td>u_g = ${f1(r.ug * 1000)} mm<br>H = ${f1(r.Hb)} kN<br>α = ${f1(r.alpha * 1000)} mrad</td>`;
    if (s) {
      const obs = [];
      if (s.antiCheminement) obs.push(`σ_min = ${f1(s.sigMin)} MPa &lt; 2 MPa : risque de cheminement, prévoir un dispositif anti-cheminement (taquets) ou augmenter la charge permanente par appareil (moins d'appareils)`);
      if (s.glissement) obs.push(`H &gt; f·P_min (f = ${f2(s.f)}) : risque de glissement, bloquer l'appareil`);
      if (s.glissantNecessaire) obs.push(`u_g &gt; min(a, b)/10 : appareil glissant élastomère + PTFE (§ 3.6.2)`);
      if (s.imposed && !s.ok) obs.unshift(`appareil imposé ne vérifiant pas : ${Object.entries(s.checks).filter(([, v]) => !v).map(([k]) => ({ compression: 'compression', distorsionVide: 'distorsion u_g/T', distorsionCharge: 'distorsion sous charge', deversement: 'épaisseur T ≤ a/5', rotation: 'rotation' })[k]).join(', ')}`);
      h += `<td><b>${s.label}</b>${s.imposed ? ' <span class="small">(imposé)</span>' : ''}<br><span class="small">hauteur ${s.hTot} mm</span></td>
      <td class="chk">σ = ${f1(s.sig)} ≤ ${f1(s.sigLim)} MPa<br>u_g/T = ${f2(s.dist1)} ≤ 0,5<br>u_g/T + H/(G₂ab) = ${f2(s.dist2)} ≤ 0,7<br>T = ${(s.T * 1000).toFixed(0)} ≤ a/5 = ${(s.Tmax * 1000).toFixed(0)} mm<br>α = ${f1(r.alpha * 1000)} ≤ ${f1(s.rotLim * 1000)} mrad<br>σ_min = ${f1(s.sigMin)} ${s.antiCheminement ? '<b class="ko">&lt; 2</b>' : '≥ 2'} MPa</td>
      <td>${obs.length ? obs.map(o => `<div class="obs">${o}</div>`).join('') : '<span class="badge ok">OK</span>'}</td></tr>`;
    } else h += `<td colspan="3"><span class="badge warn">ATTENTION</span>aucun appareil standard ne convient : augmenter le nombre d'appareils par ligne, appareils sur mesure ou à pot d'élastomère (§ 3.7)</td></tr>`;
  }
  h += `</tbody></table><p class="small">Désignation a×b×n(t+ts) : dimensions efficaces en plan [mm], n feuillets d'élastomère de t mm et frettes de ts mm (hauteur totale avec frettes entre parenthèses). Les appareils sont supposés identiques sur une ligne et libres (pas de point fixe mécanique) ; prévoir bossages, taquets et 5 cm minimum au bord (figure § 3.6.1). Prédimensionnement à confirmer selon la norme en vigueur (NF EN 1337-3).</p>`;
  return h;
}

function chevetresTable(st) {
  const cm = v => (v * 1e4).toFixed(1), f0 = v => v.toFixed(0), f2 = v => v.toFixed(2);
  let h = `<h3>Chevêtres incorporés et réaction par appareil (annexe 4 du guide PSIDP-EL)</h3><p class="small">ELU fondamental 1,35 G + 1,35 LM1. Ligne d'appui de longueur B = 2b/sin ψ, ${st.chevetres[0].n} appareils à a = ${f2(st.chevetres[0].a)} m (le long de la ligne), consoles c = ${f2(st.chevetres[0].c)} m. Charges de type 1 (permanentes et trafic éloigné) réparties comme une charge uniforme, de type 2 (trafic à moins de d de la ligne) comme sur une poutre sur appuis : d = max[a + c ; (a + e)/2 ; min(B/2 ; L)], ζ_UDL = (d/L)(2 − d/L), ζ_TS = (1 − d/2L)·P_d/S_q. Moments du chevêtre par poutre continue sur les appareils (consoles c), moments locaux m_c⁻ = M_c⁻/(1,5 c), m_e = 1,5 M_e/e ; ferraillage par bandes (§ 6.2), section minimale en enveloppe avec le ferraillage courant de la dalle, d = ${f2(st.chevetres[0].dEff)} m. Culées : adaptation de la règle (L = about + demi-travée de rive).</p>
  <table><thead><tr><th>Ligne</th><th>L [m]</th><th>d [m]</th><th>ζ TS / UDL</th><th>R rive / centre ELU [kN]</th><th>R moyen [kN]</th><th>M_c⁻ / M_e⁻ / M_e⁺ [kN·m]</th><th>m_c⁻ / m_e⁻ / m_e⁺ [kN·m/m]</th><th>Face sup. ① / ② / ③ [cm²/m]</th><th>Face inf. ①' / ②' [cm²/m]</th></tr></thead><tbody>`;
  if (st.chevetres[0].plaque) h += `<p class="small"><span class="badge ok">PLAQUE</span> Tablier calculé en plaque : réactions R et moments des bandes lus sur la plaque (moyenne de m_y de Wood-Armer sur chaque bande, ① pleine, ② et ③ en anneaux, ELU 1,35 G + 1,35 gr1a) ; d et ζ restent ceux du guide, pour mémoire (valeurs du guide dans l'onglet Tablier, comparaison).</p>`;
  for (const r of st.chevetres) {
    h += `<tr><td>${r.i === 0 || r.i === st.chevetres.length - 1 ? 'Culée C' : 'Pile P'}${r.i}</td><td>${f2(r.L)}</td><td>${f2(r.d)}</td><td>${r.zetas.map(f2).join(' / ')}</td><td>${f0(r.R1)} / ${f0(r.R2)}</td><td>${f0(r.Rmoy)}</td><td>${f0(r.Mc)} / ${f0(r.Me_neg)} / ${f0(r.Me_pos)}</td><td>${f0(r.mc)} / ${f0(r.me_neg)} / ${f0(r.me_pos)}</td><td>${r.bands.top.map((b, k) => `${'①②③'[k]} ${cm(b.As)} <span class="small">(${f2(b.width)} m)</span>`).join('<br>')}</td><td>${r.bands.bot.map((b, k) => `${'①②'[k]}' ${cm(b.As)} <span class="small">(${f2(b.width)} m)</span>`).join('<br>')}</td></tr>`;
  }
  return h + `</tbody></table><p class="small">Largeurs des bandes mesurées perpendiculairement à la ligne d'appui, centrées sur elle : ① 2/3·max(c, a, e), ② max(2c, a, e), ③ 2·max(a, e, c) (face supérieure) ; ①' 2/3·max(a, e), ②' 2·max(a, e) (face inférieure). Sections minimales à mettre en place dans chaque bande, en enveloppe avec le ferraillage courant en travée (guide PSIDP-EL, annexe 4, § 6.2 : « au moins » ; bandes ③ et ②' : enveloppe de la section en travée et de celle du tiers du moment). Les transversaux courants comptent ; le complément éventuel, parallèle à la ligne d'appui, figure dans la nomenclature et sur les coupes sur appui de l'onglet Ferraillage.</p>`;
}

async function runThicknessSearch() {
  if (!state) return;
  const btn = $('#btn-hsearch'); btn.disabled = true; btn.textContent = 'Recherche…';
  const out = $('#hsearch');
  const hMin = +$('#hs-min').value, hMax = +$('#hs-max').value, step = +$('#hs-step').value || 0.02;
  const rhoMax = state.p.concept.rhoMax;
  const cm = v => (v * 1e4).toFixed(1);
  let rowsHtml = '';
  out.innerHTML = `<p class="small">Critères : pas d'aciers comprimés (x/d ≤ 0,45 à l'ELU, σc ≤ 0,6 fck à l'ELS caractéristique), taux d'armatures par face ≤ ${(rhoMax * 100).toFixed(1)} %, V_Ed ≤ V_Rd,max, poinçonnement sous roue. Chaîne Eurocodes complète (permanent + LM1/LM2 + gradient/tassements si cochés) à chaque pas, ≈ 1 s par épaisseur.</p><table><thead><tr><th>h [m]</th><th>L_max/h</th><th>A_s inf max</th><th>A_s sup max</th><th>ρ max [%]</th><th>σc [MPa]</th><th>x/d</th><th>V_Ed/V_Rd,c</th><th>V_Ed/V_Rd,max</th><th>Poinç.</th><th>Verdict</th></tr></thead><tbody id="hs-rows"></tbody></table>`;
  const Lmax = Math.max(...state.deck.spans);
  try {
    lastSearch = null;
    const r = await rechercheEpaisseur(state.p, { hMin, hMax, step, rhoMax, onStep: async row => {
      rowsHtml += `<tr><td><b>${row.h.toFixed(2)}</b></td><td>${(Lmax / row.h).toFixed(1)}</td><td>${cm(row.asBot)}</td><td>${cm(row.asTop)}</td><td>${(Math.max(row.rhoBot, row.rhoTop) * 100).toFixed(2)}</td><td>${row.sigC.toFixed(1)}</td><td>${row.xd.toFixed(2)}</td><td>${row.vRatio.toFixed(2)}${row.stirrups ? ' (étriers)' : ''}</td><td>${row.vMax.toFixed(2)}</td><td>${row.punchOK ? 'OK' : 'NON'}</td><td>${row.ok ? badge('ok') + 'vérifiée' : badge('warn') + row.crit.join(', ')}</td></tr>`;
      $('#hs-rows').innerHTML = rowsHtml;
      await new Promise(res => setTimeout(res, 0));
    } });
    lastSearch = r;
    out.insertAdjacentHTML('beforeend', r.hOK ? `<p><b>Épaisseur minimale vérifiée : h = ${r.hOK.toFixed(2)} m</b> (L_max/h = ${(Lmax / r.hOK).toFixed(1)}). Les épaisseurs supérieures réduisent les aciers ; le tranchant V_Ed > V_Rd,c appelle des étriers (pratique courante des dalles PSI.DA, guide § 3.4.2) tant que V_Ed ≤ V_Rd,max.</p>` : `<p><b>Aucune épaisseur vérifiée dans l'intervalle</b> : augmenter h max, le taux d'armatures admis ou revoir la travure.</p>`);
  } catch (e) { out.insertAdjacentHTML('beforeend', `<pre class="small">${e.stack || e}</pre>`); }
  finally { btn.disabled = false; btn.textContent = 'Rechercher'; }
}

/** Charges à dessiner sur la coupe pour un cas (arrangement représentatif, voies depuis le bord y1). */
function caseLoads(st, id) {
  const { deck, ec, f61 } = st;
  const { y1, y2 } = deck.g.roadway;
  const out = [];
  if (['TS', 'UDL', 'LM1', 'gr1a', 'gr3'].includes(id)) {
    const nl = ec.lanes, m1 = ec.lm1;
    m1.lanes.forEach((ln, i) => {
      const e1 = y1 + i * nl.wl, e2 = e1 + nl.wl, e = (e1 + e2) / 2;
      if (id !== 'TS' && id !== 'gr3' && ln.q > 0) out.push({ kind: 'band', e1, e2, label: `voie ${ln.i} : ${ln.q.toFixed(1)} kN/m²` });
      if (id !== 'UDL' && id !== 'gr3' && ln.Q > 0) { out.push({ kind: 'wheel', e: e - 1 }); out.push({ kind: 'wheel', e: e + 1 }); }
    });
    if (id !== 'TS' && id !== 'gr3' && nl.wr > 0) out.push({ kind: 'band', e1: y1 + nl.n * nl.wl, e2: y2, label: `résiduel ${m1.qr.toFixed(1)}` });
    if (id === 'gr1a' || id === 'gr3') for (const fw of deck.g.footways || []) out.push({ kind: 'band', e1: fw.y1, e2: fw.y2, label: id === 'gr3' ? '5 kN/m²' : '3 kN/m²', color: '#2a8f6a' });
  } else if (id === 'gr1b') {
    const e = y1 + 1 + 0.175; out.push({ kind: 'wheel', e: e - 1, w: 0.35 }); out.push({ kind: 'wheel', e: e + 1, w: 0.35 });
  } else if (id === 'A') {
    for (let i = 0; i < f61.nv; i++) { const yc1 = y1 + (f61.Lr - f61.Lc) / 2; out.push({ kind: 'band', e1: yc1 + i * f61.v, e2: yc1 + (i + 1) * f61.v, label: `voie ${i + 1}` }); }
  } else if (id === 'Bc' || id === 'Bt') {
    const yc1 = y1 + (f61.Lr - f61.Lc) / 2, nf = id === 'Bt' ? Math.min(f61.nv, 2) : Math.min(f61.nv, 5);
    for (let i = 0; i < nf; i++) { const e = yc1 + 2.5 * i + 1.25; out.push({ kind: 'band', e1: e - 1.25, e2: e + 1.25, label: `file ${i + 1}`, opacity: 0.12 }); out.push({ kind: 'wheel', e: e - 1, w: 0.25 }); out.push({ kind: 'wheel', e: e + 1, w: 0.25 }); }
  } else if (id === 'Mc120') {
    const e = (y1 + y2) / 2, h = MC120.trackSpacing / 2;
    out.push({ kind: 'band', e1: e - h - 0.5, e2: e - h + 0.5, label: 'chenille' }); out.push({ kind: 'band', e1: e + h - 0.5, e2: e + h + 0.5, label: 'chenille' });
  } else if (id === 'D240') {
    const e = (y1 + y2) / 2; out.push({ kind: 'band', e1: e - D240.width / 2, e2: e + D240.width / 2, label: 'D240 — 3,20 m' });
  } else if (id === 'trott') {
    for (const fw of deck.g.footways || []) out.push({ kind: 'band', e1: fw.y1, e2: fw.y2, label: '1,5 kN/m²', color: '#2a8f6a' });
  }
  return out;
}

function tableEnv(st, res, title, withFactor = true) {
  const { deck, keys } = st;
  const f = withFactor ? deck.transverseFactors(res) : null;
  let h = `<details><summary>${title}</summary><table><thead><tr><th>Section</th><th>M max [kN·m]</th><th>M min</th>${withFactor ? '<th>K</th>' : ''}${deck.ys.map(y => `<th>y=${y}</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) {
    h += `<tr><td>${k.label}</td>${cell(res.Mmax[k.idx])}${cell(res.Mmin[k.idx])}${withFactor ? `<td>${f.K[k.idx].toFixed(3)}</td>` : ''}${res.mxMax[k.idx].map(cell).join('')}</tr>`;
    h += `<tr><td class="small">&nbsp;&nbsp;m_x min</td><td></td><td></td>${withFactor ? '<td></td>' : ''}${res.mxMin[k.idx].map(cell).join('')}</tr>`;
  }
  h += `</tbody></table><p class="small">R max = ${res.Rmax.map(v => v.toFixed(0)).join(' / ')} kN ; R min = ${res.Rmin.map(v => v.toFixed(0)).join(' / ')} kN${res.delta ? ' ; δ = ' + res.delta.map(v => v.toFixed(3)).join(' / ') : ''}. K = facteur de répartition transversale maximal de la section (équivalent du KTRANS de CHAMOA).</p></details>`;
  return h;
}

function renderStatic(st) {
  const { deck, keys, perm, ec, f61, p } = st;
  $('#model-info').innerHTML = `Portées équivalentes L_eq = ${deck.Leq.map(v => v.toFixed(3)).join(' / ')} m — θ = b/L_eq = ${deck.Leq.map(L => (deck.b / L).toFixed(3)).join(' / ')} — ν = ${deck.nu}.<br>
    Eurocode : ${ec.lanes.n} voie(s) de ${ec.lanes.wl.toFixed(2)} m, aire résiduelle ${ec.lanes.wr.toFixed(2)} m, ${ec.alpha.label}, ${ec.nArrangements} arrangements transversaux.
    Fascicule 61 : classe ${f61.classe}, Lc = ${f61.Lc.toFixed(2)} m, ${f61.nv} voie(s) de ${f61.v.toFixed(2)} m. Charges permanentes g = ${perm.gTotal.toFixed(1)} kN/m. Calcul en ${st.dt.toFixed(1)} s.`;
  $('#elevation').innerHTML = elevationSVG(deck, keys);
  // sélecteurs
  const sel = $('#case-select');
  sel.innerHTML = st.cases.map(c => `<option value="${c.id}">${c.ref === 'EC' ? 'EC — ' : 'F61 — '}${c.label}</option>`).join('');
  sel.value = 'LM1';
  const selSec = $('#section-select');
  selSec.innerHTML = keys.map((k, i) => `<option value="${i}">${k.label}</option>`).join('');
  const selSpan = $('#span-select');
  selSpan.innerHTML = deck.spans.map((L, j) => `<option value="${j}">Travée ${j + 1} (${L} m, L_eq ${deck.Leq[j].toFixed(2)} m)</option>`).join('');
  // enveloppes longitudinales : permanent + cas principaux
  const main = st.cases.filter(c => ['LM1', 'gr1b', 'A', 'Bc', 'Mc120', 'D240'].includes(c.id));
  envelopePlot($('#plot-M'), deck, perm, main, { invert: p.chamoaSign });
  shearPlot($('#plot-V'), deck, perm, main);
  reactionPlot($('#plot-R'), deck, perm, main);
  kPlot($('#plot-K'), deck, 0);
  // tableaux
  let h = `<details open><summary>Charges permanentes (g = ${perm.gTotal.toFixed(1)} kN/m)</summary><table><thead><tr><th>Section</th><th>M [kN·m]</th>${deck.ys.map(y => `<th>y=${y}</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) h += `<tr><td>${k.label}</td>${cell(perm.M[k.idx])}${perm.mx[k.idx].map(cell).join('')}</tr>`;
  h += `</tbody></table><p class="small">Réactions : ${perm.R.map(v => v.toFixed(0)).join(' / ')} kN</p></details>`;
  h += `<h3>Eurocodes — EN 1991-2 (valeurs caractéristiques)</h3>` + st.cases.filter(c => c.ref === 'EC').map(c => tableEnv(st, c.res, c.label)).join('');
  h += `<h3>Fascicule 61 titre II (valeurs caractéristiques, δ inclus pour B et Mc)</h3>` + st.cases.filter(c => c.ref === 'F61').map(c => tableEnv(st, c.res, c.label)).join('');
  $('#tables').innerHTML = h;
  $('#trans-span').innerHTML = deck.spans.map((L, j) => `<option value="${j}">Travée ${j + 1} (${L} m)</option>`).join('');
  renderConception(st); renderCase(st); renderSection(st); renderDesign(st); renderTransverse(st); renderExtra(st); renderRebar(st); renderPlans(st); renderSupports(st); renderPrecontrainte(st);
  try { renderMaillage(st); } catch (e) { const el = document.getElementById('maillage-info'); if (el) el.textContent = 'Maillage : ' + e.message; }
  try { renderPlaque(st); } catch (e) { const el = document.getElementById('plaque-info'); if (el) el.textContent = 'Affichage de la plaque impossible : ' + e.message; }
  st._recoRef = ($('#supports-ref') && $('#supports-ref').value === 'F61') ? 'BAEL' : 'EC';
  majReco(st);
  try { NIV.refresh(); } catch (e) { /* plan de nivellement indisponible */ }
}

// --- recommandations : écrire une valeur, montrer un champ, chercher la valeur qui suffit ---
function setField(name, value) {
  const f = $('#f'), el = f.elements[name];
  if (!el) return;
  if (el instanceof RadioNodeList) { for (const r of el) r.checked = r.value === value; }
  else if (el.type === 'checkbox') el.checked = !!value;
  else el.value = value;
  if (FORM_UI && FORM_UI.refresh) FORM_UI.refresh();
  (el.length && !el.tagName ? el[0] : el).dispatchEvent(new Event('input', { bubbles: true }));
  (el.length && !el.tagName ? el[0] : el).dispatchEvent(new Event('change', { bubbles: true }));
}
function goField(name) {
  const el = $('#f').elements[name]; if (!el) return;
  const node = el.tagName ? el : el[0];
  const tab = node.closest('section.tab'); if (tab) goTab(tab.id.replace(/^tab-/, ''));
  const d = node.closest('details'); if (d) d.open = true;
  const vis = node.closest('label') || node;
  setTimeout(() => { vis.scrollIntoView({ behavior: 'smooth', block: 'center' }); vis.classList.add('reco-flash'); setTimeout(() => vis.classList.remove('reco-flash'), 2500); try { node.focus({ preventScroll: true }); } catch {} }, 60);
}
/** Recherche de la plus petite modification d'un champ qui satisfait la vérification (calcul des appuis seul, ou complet). */
async function solveReco(a) {
  const c = a.chercher, f = $('#f'), el = f.elements[c.champ];
  if (!el) throw new Error(`champ ${c.champ} introuvable`);
  const ancien = el.value, base = state;
  const vals = candidats({ min: c.min, max: c.max, pas: c.pas, vers: c.vers, depart: c.depart ?? (c.vers === 'haut' ? c.min : c.max) });
  const essai = async v => {
    el.value = String(v);
    try {
      const p = parseForm(f);
      if (c.calcul === 'appuis') {
        const sup = computeSupports({ p, deck: base.deck, perm: base.perm, f61: base.f61, ec: base.ec, bearings: base.bearings, psidp: base.psidp, thermal: base.thermal }, p.supports);
        return !!c.verifie({ ...base, p, supports: sup });
      }
      if (p.methodeTablier === 'plaque') p.methodeTablier = 'guyon';   // recherche en Guyon-Massonnet (rapide), à confirmer par le calcul en plaque
      await new Promise(r => setTimeout(r, 0));
      return !!c.verifie(compute(p));
    } catch { return false; } finally { el.value = ancien; }
  };
  const v = await dichotomie(vals, essai);
  if (v == null) return null;
  return { champ: String(v), affiche: String(v).replace('.', ','), detail: c.calcul === 'complet' ? 'calcul complet relancé pour chaque essai' : 'calcul des appuis relancé pour chaque essai' };
}
document.addEventListener('change', ev => { if (ev.target && ev.target.id === 'supports-ref' && state && state.supports) { state._recoRef = ev.target.value === 'F61' ? 'BAEL' : 'EC'; majReco(state); } });
$('#btn-reco').addEventListener('click', () => { if (state) ouvrirReco(state, { form: $('#f'), onApply: setField, goField, solve: solveReco }); });

function renderPrecontrainte(st) {
  const box = $('#bp-out'); if (!box) return;
  try { box.innerHTML = blocksToHTML(psidpBlocks(st.psidp, { error: st.psidpError })); } catch (e) { box.innerHTML = `<p class="small">Affichage impossible : ${e.message}</p>`; }
}

function renderRebar(st) {
  const { deck, rebar } = st;
  if (!rebar) { $('#rebar-info').innerHTML = st.psidp && !st.rebarError ? 'Dalle précontrainte : le ferraillage passif (aciers minimaux, armatures complémentaires, zones d\'about) est donné dans l\'onglet Précontrainte ; le plan de ferraillage de dalle armée ne s\'applique pas.' : `<span class="badge warn">ATTENTION</span> ${st.rebarError || 'plan de ferraillage indisponible'}.`; for (const id of ['#rebar-long', '#rebar-cross', '#rebar-schedule']) $(id).innerHTML = ''; return; }
  $('#rebar-info').innerHTML = `Ferraillage établi sur l'enveloppe des aciers requis (profil${rebar.governing.length > 1 ? 's' : ''} ${rebar.governing.join(', ')}) : épure décalée a_l = d = ${rebar.al.toFixed(3)} m, au moins 50 % des aciers inférieurs prolongés sur appuis (filantes + renforts intercalés), espacements ≤ ${(rebar.sMaxMain * 100).toFixed(0)} cm (≤ ${(rebar.sMaxPeak * 100).toFixed(0)} cm aux moments maximaux, renforts compris), ancrages et recouvrements EC2 8.4 / 8.7 (α₆ = 1,5, barres de 12 m au plus). ${rebar.deficits.length ? `<span class="badge warn">ATTENTION</span> ${rebar.deficits.length} section(s) où les aciers mis en place sont inférieurs aux aciers requis.` : '<span class="badge ok">OK</span> aciers mis en place ≥ aciers requis dans toutes les sections.'} Total ${(rebar.totalMass / 1000).toFixed(1)} t, soit ${rebar.ratio.toFixed(0)} kg/m³.`;
  $('#rebar-long').innerHTML = longitudinalRebarSVG(deck, rebar);
  const opts = [];
  deck.spans.forEach((L, j) => { opts.push({ x: deck.beam.x0[j] + L / 2, label: `mi-travée ${j + 1}` }); if (j < deck.spans.length - 1) opts.push({ x: deck.beam.x0[j + 1], label: `appui P${j + 1}` }); });
  const sel = $('#rebar-x'); const prev = sel.value;
  sel.innerHTML = opts.map(o => `<option value="${o.x}">${o.label} (x = ${o.x.toFixed(2)})</option>`).join('');
  if (prev && opts.some(o => String(o.x) === prev)) sel.value = prev;
  const x = +sel.value; const o = opts.find(q => q.x === x);
  $('#rebar-cross').innerHTML = crossRebarSVG(deck, rebar, x, `Coupe transversale — ${o ? o.label : ''}`);
  providedPlot($('#plot-rebar'), deck, rebar);
  $('#rebar-schedule').innerHTML = scheduleHTML(rebar);
}

function renderSupports(st) {
  const box = $('#supports-tables');
  if (!st.supports) { box.innerHTML = `<p class="small">Calcul des appuis indisponible${st.supportsError ? ` : ${st.supportsError}` : ''}.</p>`; return; }
  box.innerHTML = blocksToHTML(supportsBlocks(st.supports, $('#supports-ref').value));
}

function renderExtra(st) {
  const { deck, keys, extra, design } = st;
  const cm = v => (v * 1e4).toFixed(1), f0 = v => v.toFixed(0), f1 = v => v.toFixed(1);
  let h = '';
  const sectionTable = (title, dz, note) => {
    let t = `<h3>${title}</h3><p class="small">${note}</p><table><thead><tr><th>Section</th><th>M car. poutre [kN·m]</th><th>M ELU/m</th><th>M car./m</th><th>A_s inf [cm²/m]</th><th>A_s sup</th><th>A_s inf profil définitif</th><th>A_s sup définitif</th><th>Retenu inf / sup</th></tr></thead><tbody>`;
    for (const k of keys) {
      const s = k.idx; const ib = dz.bot[s].indexOf(Math.max(...dz.bot[s])), it = dz.top[s].indexOf(Math.max(...dz.top[s]));
      const mcar = Math.abs(dz.beamCAR.max[s]) > Math.abs(dz.beamCAR.min[s]) ? dz.beamCAR.max[s] : dz.beamCAR.min[s];
      const Mu = k.kind === 'support' ? dz.comb.ELU.min[s][it] : dz.comb.ELU.max[s][ib], Mc = k.kind === 'support' ? dz.comb.CAR.min[s][it] : dz.comb.CAR.max[s][ib];
      t += `<tr><td>${k.label}</td><td>${f0(mcar)}</td><td>${f0(Mu)}</td><td>${f0(Mc)}</td><td>${cm(dz.envBot[s])}</td><td>${cm(dz.envTop[s])}</td><td>${cm(design.EC.envBot[s])}</td><td>${cm(design.EC.envTop[s])}</td><td><b>${cm(Math.max(dz.envBot[s], design.EC.envBot[s]))} / ${cm(Math.max(dz.envTop[s], design.EC.envTop[s]))}</b>${dz.envTop[s] > design.EC.envTop[s] * 1.001 || dz.envBot[s] > design.EC.envBot[s] * 1.001 ? ' <span class="badge warn">gouverne</span>' : ''}</td></tr>`;
    }
    return t + `</tbody></table>`;
  };
  if (extra.chantier) {
    const c = extra.chantier;
    h += `<p class="small">Profil provisoire : poids propre + ${c.perm.files.slice(1).map(f => `${f.label} ${f.q.toFixed(1)} kN/m`).join(' + ') || 'aucune charge provisoire'} ; engins ${c.vehicles.map(v => `${v.label} (× ${v.factor})`).join(', ') || 'aucun'} circulant seuls sur la chaussée [${c.roadway.y1} ; ${c.roadway.y2}] moins ${c.neutral} m de chaque côté (roues dans la largeur chargeable), gradient et tassements comme en service. Combinaisons : ELU 1,35 G + 1,35 Q ; ELS car. G + Ta + 0,6 T + Q (pratique CHAMOA). Les tombereaux 23/34 m³ de la circulaire « delta 70 » ne sont pas prédéfinis (données non disponibles) : les saisir comme engins.</p>`;
    h += sectionTable('Phase de chantier (profil provisoire)', c.design, `Moments par mètre à la fibre la plus sollicitée ; comparaison avec le profil définitif et enveloppe retenue.`);
  }
  if (extra.lm3) {
    const l = extra.lm3, v = l.vehicle;
    h += sectionTable(`Convoi exceptionnel LM3 seul — ${v.label}`, l.design, `${v.axles.length} essieux de ${v.axles[0].P} kN (${v.axles.map(a => a.x).join(' / ')} m), largeur ${v.width} m, ${v.wheels} roues à ${v.wheelSpacing} m ; coefficient d'incertitude ${v.unc}, dynamique ${v.dyn.toFixed(3)} (${st.p.extra.lm3Speed === 'rapide' ? '1 + 0,7/(1 + 0,2 L_min), annexe nationale' : 'au pas'}) ; convoi seul, bandes de 1 m neutralisées, K aux sections clés : ${keys.map(k => l.K[k.idx].toFixed(2)).join(' / ')}. Combinaison LM3 seul : ELU 1,35 (G + Q), ELS car. G + Ta + 0,6 T + Q. Disposition transversale des roues simplifiée (roues réparties sur la largeur du convoi, impacts ponctuels) : effets longitudinaux seulement ; pour les effets locaux, reprendre la figure A.1 de l'EN 1991-2 (impacts de 1,20 × 0,15 m).`);
  }
  if (extra.cantilever) {
    const { mom, design: cd } = extra.cantilever;
    h += `<h3>Encorbellement (console de ${mom.Lc} m, h ${mom.hr} → ${mom.ht} m)</h3><p class="small">Moments d'encastrement par mètre : poids propre ${f1(mom.G.mG)} + superstructures ${f1(mom.G.mSup)} kN·m/m ; trottoir ${f1(mom.footway.seul)} (5 kN/m²) / ${f1(mom.footway.avecLM1)} (3 kN/m²)${mom.ts ? ` ; tandem TS ${f1(mom.ts.m)} (2 × ${mom.ts.Q} kN à ${mom.ts.xQ.toFixed(2)} m, b_eff = ${mom.ts.beff.toFixed(2)} m), LM2 ${f1(mom.lm2.m)}, UDL ${f1(mom.udl.m)}` : ' ; pas de chaussée sur l\'encorbellement'} ; cas dimensionnant : ${mom.governing}. ELU ${f1(mom.ELU)}, ELS car. ${f1(mom.CAR)}, ELS fréq. ${f1(mom.FREQ)} kN·m/m ; V_ELU ${f1(mom.VELU)} kN/m. Aciers supérieurs d'encastrement (EC2, d = ${cd.d.toFixed(3)} m) : ELU ${cm(cd.AsULS)}, ELS ${cm(cd.AsSLS)} (σs ${f0(cd.sigS)} MPa), wk ${cm(cd.AsWk)}, min ${cm(Math.max(cd.as921, cd.perFace))} → <b>${cm(cd.As)} cm²/m</b>. Diffusion des roues à 45° (revêtement + feuillet moyen, puis en plan jusqu'à l'encastrement) ; CHAMOA § 4.2 et annexe 3 du guide PSIDP.EL pour le calcul détaillé.</p>`;
  }
  if (extra.fatigue) {
    const f = extra.fatigue;
    h += `<h3>Fatigue des armatures (EN 1992-2 annexe NN, FLM3)</h3><p class="small">λ_s = φ_fat · λ_s,1 · λ_s,2 · λ_s,3 · λ_s,4 = ${f.phiFat} × ${f.lambda1} × ${f.lambda2.toFixed(3)} × ${f.lambda3.toFixed(3)} × ${f.lambda4.toFixed(3)} = <b>${f.lambdaS.toFixed(3)}</b> (Q̄ trafic ${f.trafic}, N_obs = ${f.Nobs.toExponential(2)}/an, ${f.nYears} ans, k₂ = ${f.k2}) ; FLM3 sur la voie lente au bord de la chaussée, essieux × 1,75 sur appuis et × 1,40 en travée (NN.2.1) ; contraintes en section fissurée avec les aciers du profil définitif ; critère γ_F,fat Δσ_s,equ ≤ Δσ_Rsk(10⁶)/γ_s,fat = ${f.dSigRsk}/${f.gammaS} = ${(f.dSigRsk / f.gammaS).toFixed(1)} MPa.</p>
    <table><thead><tr><th>Section</th><th>Face / y</th><th>A_s [cm²/m]</th><th>m_G [kN·m/m]</th><th>ΔM FLM3 × k</th><th>σs min → max [MPa]</th><th>Δσ_s,Ec</th><th><b>Δσ_s,equ</b></th><th>Limite</th><th>Taux</th></tr></thead><tbody>`;
    for (const r of f.rows) h += `<tr><td>${r.label}</td><td>${r.face === 'bot' ? 'inf' : 'sup'} / ${r.y}</td><td>${cm(r.As)}</td><td>${f1(r.mG)}</td><td>${f1(r.dM)}</td><td>${f0(r.sigLo)} → ${f0(r.sigHi)}</td><td>${f1(r.dSigEc)}</td><td><b>${f1(r.dSigEqu)}</b></td><td>${f1(r.lim)}</td><td>${r.ratio.toFixed(2)} ${r.ok ? badge('ok') : badge('warn')}</td></tr>`;
    h += `</tbody></table><p class="small">λ_s,1 se lit sur la figure NN.1 selon la portée et la zone (valeur saisie) ; φ_fat = 1,3 à moins de 6 m d'un joint de chaussée (EN 1991-2 § 4.6.1). Cette vérification complète le critère simplifié σs ≤ 300 MPa sous ELS caractéristique.</p>`;
  }
  $('#extra-tables').innerHTML = h || '<p class="small">Activer la phase de chantier, un convoi LM3 ou un encorbellement dans le formulaire.</p>';
  // zonage
  const z = extra.zonage;
  $('#zoning-plan').innerHTML = zoningPlanSVG({ spans: deck.spans, width: 2 * deck.b, overhangs: deck.g.overhangs || [0, 0], psi: st.p.concept.psi, h: deck.h }, z);
  let zt = `<p class="small">Entraxe des appareils d'appui retenu a = ${z.pitch.toFixed(2)} m, ψ = ${st.p.concept.psi} gr (sin ψ = ${z.sinPsi.toFixed(3)}), option de ferraillage ${z.option} (angle entre familles ${z.alpha.toFixed(0)}°).</p><table><thead><tr><th>Zone</th><th>x début [m]</th><th>x fin [m]</th><th>Longueur [m]</th><th>Définition (§ 3.4.4)</th></tr></thead><tbody>`;
  for (const zz of z.zones) zt += `<tr><td>${zz.kind === 'chevetre' ? 'Chevêtre' : 'Extension'} ${zz.support}</td><td>${zz.x1.toFixed(2)}</td><td>${zz.x2.toFixed(2)}</td><td>${(zz.x2 - zz.x1).toFixed(2)}</td><td style="white-space:normal;text-align:left">${zz.text}</td></tr>`;
  zt += `</tbody></table><ul class="checks">${z.rules.map(r => `<li>${badge(r.level)}${r.text}</li>`).join('')}</ul>`;
  $('#zoning-tables').innerHTML = zt;
}

function renderCase(st) {
  const id = $('#case-select').value;
  const c = st.cases.find(x => x.id === id);
  const note = c.ref === 'EC' ? 'Arrangement représentatif (voies depuis le bord gauche) ; le calcul balaie toutes les positions.' : 'Arrangement représentatif ; le calcul balaie toutes les positions.';
  $('#cross').innerHTML = crossSectionSVG({ deck: st.deck, loads: caseLoads(st, id), title: `Coupe transversale — ${c.label}`, note });
  transversePlot($('#plot-mx'), st.deck, st.keys, st.perm, c.res, c.label);
  factorPlot($('#plot-f'), st.deck, st.keys, st.deck.transverseFactors(c.res), c.label);
  surfacePlot($('#plot-3d'), st.deck, c.res, $('#surface-which').value, `m_x(x, y) ${$('#surface-which').value === 'mxMax' ? 'max' : 'min'} — ${c.label} [kN·m/m]`);
}

function renderDesign(st) {
  const ref = $('#design-ref').value, dz = st.design[ref];
  const { deck, keys } = st;
  asPlot($('#plot-As'), deck, dz, ref === 'EC' ? 'Eurocodes (EC2)' : 'Fascicule 61 + BAEL 91');
  const cm = v => (v * 1e4).toFixed(1);
  let h = '';
  if (ref === 'EC') {
    h += `<p class="small">C${dz.mat.fck}/${dz.mat.fck + 10}, B${dz.mat.fyk} : fcd = ${dz.mat.fcd.toFixed(1)} MPa, fyd = ${dz.mat.fyd.toFixed(0)} MPa, fctm = ${dz.mat.fctm.toFixed(2)} MPa, αe = ${dz.mat.alphaE} ; d = h − c = ${dz.d.toFixed(3)} m ; σs ≤ ${dz.mat.sigSlim} MPa (ELS car., fatigue simplifiée), σc ≤ ${dz.mat.sigCcar.toFixed(1)} MPa, wk ≤ ${st.p.mat.wkMax} mm (ELS fréquent, φ ${(st.p.mat.phi * 1000).toFixed(0)}) ; minimums : 9.2.1.1 ×1,2 = ${cm(dz.mins.as921)}, 7.3.2 = ${cm(dz.mins.as732)}, 3 cm²/m par face.${deck.g.chamfer ? ' Chanfreins pris en compte en compression par l\'intrados.' : ''}</p>`;
    h += `<table><thead><tr><th>Section</th><th>Face</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>M QP</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>min</th><th><b>A_s</b></th><th>σs</th><th>σc</th><th>x/d</th></tr></thead><tbody>`;
    for (const k of keys) {
      for (const face of ['bot', 'top']) {
        const arr = dz[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dz.perFibre[k.idx][iy][face];
        h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'} (y = ${deck.ys[iy]})</td><td>${f.Mu.toFixed(0)}</td><td>${f.Mcar.toFixed(0)}</td><td>${f.Mfre.toFixed(0)}</td><td>${f.Mqp.toFixed(0)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(Math.max(f.as921, f.as732, f.perFace))}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td><td>${f.sigC.toFixed(1)}</td><td>${f.xOverD.toFixed(2)}</td></tr>`;
      }
    }
    h += `</tbody></table><p class="small">Moments en kN·m/m (fibre la plus sollicitée), aciers en cm²/m. Effort tranchant par mètre (V_Ed avec facteur K du cas LM1) / V_Rd,c : ` + keys.map(k => `${k.label} : ${dz.shear[k.idx].ratio.toFixed(2)}${dz.shear[k.idx].AswS > 0 ? ' → étriers A_sw/s = ' + (dz.shear[k.idx].AswS * 1e4).toFixed(1) + ' cm²/m par m' : ''}`).join(' ; ') + `. Poinçonnement : LM1 vEd = ${dz.punch.LM1.vEd.toFixed(3)} / vRd,c = ${dz.punch.LM1.vRdc.toFixed(3)} MPa (${dz.punch.LM1.ok ? 'OK' : 'NON'}) ; LM2 vEd = ${dz.punch.LM2.vEd.toFixed(3)} MPa (${dz.punch.LM2.ok ? 'OK' : 'NON'}). Aciers transversaux minimaux (EC2 9.3.1.1 : 20 % des longitudinaux) : inf ${cm(dz.transverseMin.bot)}, sup ${cm(dz.transverseMin.top)} cm²/m — à compléter par les moments transversaux m_y.</p>`;
  } else {
    h += `<p class="small">fc28 = ${dz.mat.fc28} MPa, fe = ${dz.mat.fe} MPa : fbu = ${dz.mat.fbu.toFixed(2)} MPa, fsu = ${dz.mat.fsu.toFixed(0)} MPa, μ_lim = ${dz.mat.muL.toFixed(3)} ; ELS fissuration ${dz.mat.fissuration} : σ̄s = ${isFinite(dz.mat.sigSbar) ? dz.mat.sigSbar.toFixed(0) + ' MPa' : '—'}, σ̄bc = ${dz.mat.sigBbar.toFixed(1)} MPa, n = 15 ; d = ${dz.d.toFixed(3)} m ; non-fragilité ${cm(dz.mins.nonFrag)}, dalle ${cm(dz.mins.dalle)} cm²/m.</p>`;
    h += `<table><thead><tr><th>Section</th><th>Face</th><th>M ELU</th><th>M ELS</th><th>ELU</th><th>ELS</th><th>min</th><th><b>A_s</b></th><th>σs</th><th>σb</th><th>α</th></tr></thead><tbody>`;
    for (const k of keys) {
      for (const face of ['bot', 'top']) {
        const arr = dz[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dz.perFibre[k.idx][iy][face];
        h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'} (y = ${deck.ys[iy]})</td><td>${f.Mu.toFixed(0)}</td><td>${f.Ms.toFixed(0)}</td><td>${cm(f.AsELU)}</td><td>${cm(f.AsELS)}</td><td>${cm(Math.max(f.nonFrag, f.dalle))}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td><td>${f.sigB.toFixed(1)}</td><td>${f.alpha.toFixed(3)}</td></tr>`;
      }
    }
    h += `</tbody></table><p class="small">Moments en kN·m/m, aciers en cm²/m. τu / τ̄u (dalles sans armatures d'âme, A.5.2.2) : ` + keys.map(k => `${k.label} : ${dz.shear[k.idx].ratio.toFixed(2)}${dz.shear[k.idx].AtS > 0 ? ' → A_t/s_t = ' + (dz.shear[k.idx].AtS * 1e4).toFixed(1) + ' cm²/m par m' : ''}`).join(' ; ') + `. Poinçonnement (A.5.2.42) : Br Qu = ${dz.punch.Br.Qu.toFixed(3)} / ${dz.punch.Br.QuLim.toFixed(3)} MN (${dz.punch.Br.ok ? 'OK' : 'NON'}). Armatures de répartition ≥ A_s/4 : inf ${cm(dz.transverseMin.bot)}, sup ${cm(dz.transverseMin.top)} cm²/m.</p>`;
  }
  $('#design-tables').innerHTML = h;
}

function renderTransverse(st) {
  const j = +$('#trans-span').value, ref = $('#trans-ref').value;
  const dz = st.transDesign[ref], sp = dz.spans[j];
  const extra = ref === 'EC' ? [{ name: 'ELS caractéristique max', y: sp.comb.CARmax }, { name: 'ELS caractéristique min', y: sp.comb.CARmin }] : [{ name: 'ELS max', y: sp.comb.ELSmax }, { name: 'ELS min', y: sp.comb.ELSmin }];
  myPlot($('#plot-my'), st.deck, ref === 'EC' ? st.trans : (st.transF || st.trans), j, extra);
  const cm = v => (v * 1e4).toFixed(1);
  const setra = ref !== 'EC' ? ` Fascicule 61 (pratique SETRA) : ${(st.p.concept.psi || 100) < 100 ? 'dalle droite équivalente au biais mécanique (largeur 2b/sin φ, portée L_eq·sin φ, PSI-DA 68 § 2.5.2.1.2) ; ' : ''}trottoirs à la charge locale 4,5 kN/m² (un ou deux trottoirs)${st.transELU ? ' ; ELU calculé avec ν = 0 (fissuration peu nuisible, béton fissuré)' : ''}.` : '';
  let h = `<p class="small">Dalle isostatique équivalente (L_eq, bords libres, ν = ${st.deck.nu}), charges diffusées à 45° jusqu'au feuillet moyen (contact + 2·${st.p.mat.tRev} + h), séries de Fourier (15 harmoniques), charges roulantes centrées sur x = L_eq/2, enveloppe sur les positions transversales ; thermique et tassements : m_y = ν·m_x. Hauteur utile transversale d = h − c − φ_long = ${dz.d.toFixed(3)} m.${setra}</p>`;
  if (dz.skew) {
    h += `<p class="small"><b>Ouvrage biais (ψ = ${dz.skew.psi} gr)</b> : les aciers transversaux sont ${dz.skew.psi2 < 100 ? 'parallèles aux lignes d\'appui' : 'perpendiculaires aux bords libres'} et dimensionnés avec le moment dans leur direction M_APF (annexe 12A du BPEL, pratique CHAMOA § 3.4, reproduite exactement sur la note) : moments principaux MX (longitudinal maximal de la travée) et MY (transversal maximal, non concomitants) tournés du biais mécanique φ, béton comprimé sur la bissectrice des deux familles ; nappe supérieure avec MX = 0. Be = ${dz.skew.Be.toFixed(2)} m. Les aciers sont donnés par mètre perpendiculaire aux aciers${dz.skew.psi2 < 100 ? ` ; par mètre d'axe de l'ouvrage, multiplier par sin ψ = ${dz.skew.sinPsi.toFixed(3)}` : ''}.</p>
    <table><thead><tr><th>Travée</th><th>φ_mec [gr]</th><th>MX car. [kN·m/m]</th><th>MY car.</th><th><b>M_APF car.</b></th><th>MX ELU</th><th>MY ELU</th><th><b>M_APF ELU</b></th><th>MY min car.</th><th>M_APF min car.</th></tr></thead><tbody>`;
    dz.spans.forEach(sp2 => { const k = sp2.skew; const c = ref === 'EC' ? 'CAR' : 'ELS'; h += `<tr><td>Travée ${sp2.j + 1}</td><td>${k.phiMec.toFixed(2)}</td><td>${k.max[c].MX.toFixed(1)}</td><td>${k.max[c].MY.toFixed(1)}</td><td><b>${k.max[c].M.toFixed(1)}</b></td><td>${k.max.ELU.MX.toFixed(1)}</td><td>${k.max.ELU.MY.toFixed(1)}</td><td><b>${k.max.ELU.M.toFixed(1)}</b></td><td>${k.min[c].MY.toFixed(1)}</td><td>${k.min[c].M.toFixed(1)}</td></tr>`; });
    h += `</tbody></table>`;
  }
  if (ref === 'EC') {
    h += `<table><thead><tr><th>Travée</th><th>Face</th><th>y</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>non sect.</th><th>min 1989</th><th><b>A_s,y</b></th><th>σs</th></tr></thead><tbody>`;
    dz.spans.forEach(sp2 => { for (const face of ['bot', 'top']) { const f = sp2[face]; h += `<tr><td>Travée ${sp2.j + 1}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${f.y}</td><td>${f.Mu.toFixed(1)}</td><td>${f.Mcar.toFixed(1)}</td><td>${f.Mfre.toFixed(1)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(f.nonSec)}</td><td>${f.minGuide !== undefined ? cm(f.minGuide) : '—'}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td></tr>`; } });
    h += `</tbody></table><p class="small">Non sectionnel (EC2 9.3.1.1 et pratique CHAMOA) : A_s,trans,inf ≥ 0,2 A_s,long,inf ; A_s,trans,sup ≥ max(0,2 A_s,long,sup ; 0,5 A_s,trans,inf) ; « min 1989 » : 1,3 n ‰ ≤ 2 ‰ de b·h (n = largeur/portée, × 1/sin ψ si parallèles aux lignes d'appui), guide SETRA § 3.4.3. Le critère wk (7.3.4) impose un espacement ≤ 5(c + φ/2), d'où un minimum lié au diamètre choisi (φ transversal ${(st.p.mat.phiT * 1000).toFixed(0)} mm).${dz.skew ? ' Moments M ELU / car. / fréq. = M_APF (direction des aciers).' : ''}</p>`;
  } else {
    h += `<table><thead><tr><th>Travée</th><th>Face</th><th>y</th><th>M ELU</th><th>M ELS</th><th>ELU</th><th>ELS</th><th>répartition</th><th>min 1989</th><th><b>A_s,y</b></th><th>σs</th></tr></thead><tbody>`;
    dz.spans.forEach(sp2 => { for (const face of ['bot', 'top']) { const f = sp2[face]; h += `<tr><td>Travée ${sp2.j + 1}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${f.y}</td><td>${f.Mu.toFixed(1)}</td><td>${f.Ms.toFixed(1)}</td><td>${cm(f.AsELU)}</td><td>${cm(f.AsELS)}</td><td>${cm(f.nonSec)}</td><td>${f.minGuide !== undefined ? cm(f.minGuide) : '—'}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td></tr>`; } });
    h += `</tbody></table><p class="small">Armatures de répartition BAEL B.7.4 : ≥ A_s,long/3 (charges concentrées) ; « min 1989 » : guide SETRA § 3.4.3.${dz.skew ? ' Moments ELU / ELS = M_APF (direction des aciers).' : ''}</p>`;
  }
  $('#trans-tables').innerHTML = h;
}

function renderSection(st) {
  const k = st.keys[+$('#section-select').value];
  const sup = k.kind === 'support' ? k.span + 1 : (k.span === 0 ? 1 : k.span);
  influencePlot($('#plot-IL'), st.deck, k.idx, Math.min(sup, st.deck.spans.length));
}

/** Toutes les données du formulaire, cases à cocher comprises (0 ou 1 : FormData omet les cases décochées). */
function formSnapshot(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  for (const el of form.querySelectorAll('input[type=checkbox][name]')) d[el.name] = el.checked ? 1 : 0;
  return d;
}
/** Affecte des données au formulaire (lien partagé, projet ouvert) : les éditeurs et blocs conditionnels se redessinent. */
function applyData(form, d) {
  for (const [k, v] of Object.entries(d)) {
    const el = form.elements[k]; if (!el) continue;
    if (el.type === 'checkbox') el.checked = v === true || v === 'on' || !!+v; else el.value = v;
  }
  if (d.bp_agrement && $('#bp-agrement')) { $('#bp-agrement').value = d.bp_agrement; fillUnits(d.bp_unite); }
  try { if (typeof TRACE !== 'undefined') TRACE.refresh(); } catch (e) { /* vue du tracé indisponible */ }
}
function formToHash(form) {
  const d = formSnapshot(form);
  try { history.replaceState(null, '', `#${T.current()}/d=` + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(d)))))); } catch (e) { /* ignore */ }
}
// procédés de précontrainte (agréments) : listes déroulantes de l'onglet Précontrainte
const AGR = agrementList();
function fillUnits(keep) {
  const a = AGR.find(x => x.id === $('#bp-agrement').value) || AGR[0], sel = $('#bp-unite'), prev = keep ?? sel.value;
  const nPrev = (AGR.flatMap(x => x.unites).find(u => u.id === prev) || { torons: 12 }).torons;
  sel.innerHTML = a.unites.map(u => `<option value="${u.id}">${u.nom}</option>`).join('');
  // même unité si elle existe dans le procédé, sinon même nombre de torons, sinon 12 torons
  const same = a.unites.find(u => u.id === prev) || a.unites.find(u => u.torons === nPrev) || a.unites.find(u => u.torons === 12) || a.unites[0];
  sel.value = same.id;
}
if ($('#bp-agrement')) {
  $('#bp-agrement').innerHTML = AGR.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
  fillUnits('12');
  $('#bp-agrement').addEventListener('change', () => fillUnits());
}
function hashToForm(form) {
  const h = hashData();
  if (!h) return false;
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(h)))));
    applyData(form, d);
    return true;
  } catch (e) { return false; }
}

/** Schémas « ce que vous saisissez » : mis à jour à chaque modification du formulaire. */
function renderScheme() {
  try {
    const g = readGeometry($('#f'));
    $('#scheme-summary').innerHTML = summaryHTML(g);
    let sp = null; try { sp = parseSupports(Object.fromEntries(new FormData($('#f')).entries())); } catch { sp = null; }
    $('#scheme-elevation').innerHTML = guideElevationSVG(g, sp);
    $('#scheme-cross').innerHTML = guideCrossSectionSVG(g);
    // ouvrage courbe : vue en plan du tracé importé (axe, bords, lignes d'appui avec leur biais propre)
    const tr = $('#f').elements.trace && $('#f').elements.trace.value;
    let planCourbe = null;
    if (tr) try { const o = JSON.parse(tr); if (o.stations) planCourbe = `<p class="small"><strong>Vue en plan — ouvrage courbe</strong> (tracé ${o.source || 'DXF'} ; lignes d'appui ${o.psiLignes ? 'biaises, ψ = ' + o.psiLignes.join(' / ') + ' gr' : 'radiales'})</p>` + planTrace(new Axe(o.segments), o.stations.map((s, k) => ({ s, psi: o.psiLignes ? o.psiLignes[k] : 100 })), g.width / 2); } catch { planCourbe = null; }
    $('#scheme-plan').innerHTML = planCourbe || planSVG(g);
    { const k = hlKey; hlKey = null; highlightScheme(k); }
  } catch (e) { $('#scheme-summary').innerHTML = `<p class="small">Schéma indisponible : ${e.message}</p>`; }
}
// survol ou saisie d'un champ : l'élément correspondant des schémas clignote en bleu
let hlKey = null;
function highlightScheme(name) {
  if (name === hlKey) return; hlKey = name;
  document.querySelectorAll('#scheme-card g.hl').forEach(e => e.classList.remove('hl'));
  if (!name) return;
  document.querySelectorAll('#scheme-card g[data-k]').forEach(e => { if (e.dataset.k.split(' ').includes(name)) e.classList.add('hl'); });
}
const fieldName = t => { const el = t && t.closest ? t.closest('label, .fld') : null; const inp = el ? el.querySelector('input, select, textarea') : (t && t.name ? t : null); return inp ? inp.name : null; };
$('#f').addEventListener('mouseover', ev => { const n = fieldName(ev.target); if (n) highlightScheme(n); });
$('#f').addEventListener('mouseout', ev => { if (!ev.relatedTarget || !fieldName(ev.relatedTarget)) highlightScheme(document.activeElement && document.activeElement.name && $('#f').contains(document.activeElement) ? document.activeElement.name : null); });
$('#f').addEventListener('focusin', ev => { const n = fieldName(ev.target); if (n) highlightScheme(n); });
$('#f').addEventListener('focusout', () => highlightScheme(null));
let schemeTimer = null;
const scheduleScheme = () => { clearTimeout(schemeTimer); schemeTimer = setTimeout(renderScheme, 150); };
$('#f').addEventListener('input', scheduleScheme);
$('#f').addEventListener('change', scheduleScheme);
// toute donnée nommée du formulaire (hors indice de danger, recalculé en direct) rend les résultats périmés
const onDataEdit = ev => { const t = ev.target; if (t && t.name && !t.closest('#tab-retenue') && !t.closest('#plans-box')) markStale('Données modifiées depuis le dernier calcul : les résultats affichés ne sont plus à jour.'); };
$('#f').addEventListener('input', onDataEdit);
$('#f').addEventListener('change', onDataEdit);
$('#stale').addEventListener('click', ev => {
  if (!ev.target.closest('[data-stale-run]')) return;
  if (state && state.standalone) $('#btn-standalone').click(); else $('#f').requestSubmit($('#btn-calc'));
});
const FORM_UI = enhanceForm($('#f')); // saisie valeur par valeur des champs multi-valeurs (avant la lecture d'un lien partagé)
const NIV = initNivellement($('#f'), () => state);
const TRACE = initTrace($('#f'), { setField });
// manuel d'utilisation : PDF publié avec le site (docs/manuel), paramètre de version pour ne pas servir un ancien PDF en cache
const MANUEL = { version: '0.79', url: 'docs/manuel/PSIDA_Manuel.pdf' };
$('#btn-manuel').addEventListener('click', () => window.open(`${MANUEL.url}?v=${MANUEL.version}`, '_blank', 'noopener'));
$('#f').addEventListener('change', ev => { if (ev.target.name === 'niv_actif') NIV.refresh(); });
applyHelp($('#f'), $('#help-list'));
renderScheme();

// calcul en plaque (≈ 30 s, fil principal) : bandeau d'attente affiché avant de bloquer la page
function busy(on) {
  let el = document.getElementById('busy');
  if (!el) { el = document.createElement('div'); el.id = 'busy'; el.className = 'busy'; el.innerHTML = '<div><strong>Calcul du tablier en plaque…</strong><br><span class="small">surfaces d\'influence et enveloppes de trafic (environ 40 s ; la page ne répond pas pendant le calcul)</span></div>'; document.body.appendChild(el); }
  el.hidden = !on;
}
const afterPaint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
$('#f').addEventListener('submit', async ev => {
  ev.preventDefault();
  setMode('full');
  if (T.current() === 'projet' || T.current() === 'conception') goTab('tablier');
  const p = parseForm(ev.target), plaque = p.methodeTablier === 'plaque';
  if (plaque) { busy(true); await afterPaint(); }
  try { state = compute(p); renderStatic(state); clearStale(); $('#error').textContent = ''; formToHash(ev.target); goTab(T.current()); }
  catch (e) { $('#error').textContent = e.stack || String(e); }
  finally { if (plaque) busy(false); }
});
$('#btn-concept').addEventListener('click', () => {
  setMode('concept'); goTab('conception');
  try { state = computeConceptOnly(parseForm($('#f'))); $('#hsearch').innerHTML = ''; renderConception(state); clearStale(); $('#error').textContent = ''; formToHash($('#f')); }
  catch (e) { $('#error').textContent = e.stack || String(e); }
  $('#concept-card').scrollIntoView({ behavior: 'smooth' });
});
$('#concept-travures').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-adopt]');
  if (!b || !state) return;
  const v = state.concept.travures[+b.dataset.adopt];
  const f = $('#f');
  f.spans.value = v.spans.join(', '); f.h.value = v.hGuide.toFixed(2); f.area.value = ''; f.EI.value = f.EI.value.split(',')[0] + ',';
  $('#hs-min').value = ''; $('#hs-max').value = '';
  renderScheme();
  $('#btn-concept').click();
});
$('#btn-hsearch').addEventListener('click', runThicknessSearch);
$('#btn-concept2').addEventListener('click', () => $('#btn-concept').click());
$('#rebar-x').addEventListener('change', () => state && state.rebar && renderRebar(state));
initPlans(() => state);
initMaillage(() => state);
// --- projet : enregistrer / ouvrir un fichier .json (toutes les données, et les efforts reçus de l'onglet sismique) ---
const PROJ_FORMAT = 'psida-projet';
const DEFAULTS = formSnapshot($('#f')); // valeurs à l'ouverture : complètent un projet enregistré par une version antérieure
let projName = null;
function setProjName(n) { projName = n; $('#proj-name').textContent = n ? n.replace(/\.json$/i, '') : ''; $('#proj-name').title = n || ''; }
async function saveProject() {
  const form = $('#f');
  const spans = String(form.spans.value || '').split(/[,;\s]+/).filter(Boolean).join('-');
  const name = projName || `projet-psida-${spans || 'ouvrage'}.json`;
  const file = { format: PROJ_FORMAT, version: '0.79', date: new Date().toISOString(), data: formSnapshot(form) };
  if (ec8Data) file.ec8 = ec8Data;
  const txt = JSON.stringify(file, null, 1);
  if (window.showSaveFilePicker) { // Chrome, Edge : choix du nom et du dossier
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Projet PSIDA', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable(); await w.write(txt); await w.close(); setProjName(h.name); return;
    } catch (e) { if (e.name === 'AbortError') return; /* sinon : téléchargement ci-dessous */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  setProjName(name);
}
/** Lit un projet enregistré (ou un objet de données brut) et relance le calcul. */
function loadProject(text, name) {
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('le fichier n\'est pas un JSON valide'); }
  const d = j && j.format === PROJ_FORMAT ? j.data : j;
  if (!d || typeof d !== 'object' || !('spans' in d)) throw new Error('ce fichier n\'est pas un projet PSIDA');
  applyData($('#f'), { ...DEFAULTS, ...d });
  ec8Data = j.ec8 || null; ec8Status();
  setProjName(name); renderScheme(); $('#error').textContent = '';
  $('#f').requestSubmit();
}
$('#btn-save').addEventListener('click', saveProject);
$('#btn-open').addEventListener('click', () => $('#file-open').click());
$('#file-open').addEventListener('change', ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  f.text().then(t => loadProject(t, f.name)).catch(e => { $('#error').textContent = `Ouverture de « ${f.name} » impossible : ${e.message}`; });
});
document.addEventListener('keydown', ev => { // Ctrl+S, Ctrl+O
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
  const k = ev.key.toLowerCase();
  if (k === 's') { ev.preventDefault(); saveProject(); } else if (k === 'o') { ev.preventDefault(); $('#file-open').click(); }
});

// --- schémas explicatifs : miniatures (button.thumb[data-zoom]) agrandies dans une boîte de dialogue ---
{
  const dlg = $('#zoom'); let group = [], cur = 0;
  const show = i => {
    cur = (i + group.length) % group.length; const t = group[cur];
    $('#zoom-img').src = t.dataset.zoom; $('#zoom-img').alt = t.querySelector('img')?.alt || '';
    $('#zoom-cap').textContent = t.dataset.cap || ''; $('#zoom-count').textContent = group.length > 1 ? `${cur + 1} / ${group.length}` : '';
    $('#zoom-prev').hidden = $('#zoom-next').hidden = group.length < 2;
  };
  document.addEventListener('click', ev => {
    const t = ev.target.closest && ev.target.closest('button.thumb[data-zoom]');
    if (!t || !dlg) return;
    ev.preventDefault();
    const box = t.closest('.thumbs'); group = box ? [...box.querySelectorAll('button.thumb[data-zoom]')] : [t];
    show(group.indexOf(t)); if (!dlg.open) dlg.showModal();
  });
  if (dlg) {
    $('#zoom-close').addEventListener('click', () => dlg.close());
    $('#zoom-prev').addEventListener('click', () => show(cur - 1));
    $('#zoom-next').addEventListener('click', () => show(cur + 1));
    $('#zoom-img').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', ev => { if (ev.target === dlg) dlg.close(); });   // clic sur le fond
    dlg.addEventListener('keydown', ev => { if (ev.key === 'ArrowLeft') show(cur - 1); else if (ev.key === 'ArrowRight') show(cur + 1); });
  }
}
if (hashToForm($('#f'))) $('#f').requestSubmit();
$('#case-select').addEventListener('change', () => state && renderCase(state));
$('#surface-which').addEventListener('change', () => state && renderCase(state));
$('#section-select').addEventListener('change', () => state && renderSection(state));
$('#design-ref').addEventListener('change', () => state && renderDesign(state));
// Les boutons de note / rapport du tablier exigent le calcul complet : si l'état courant vient d'un autre mode
// (conception seule, appuis seuls, poutres), le calcul complet est relancé à partir du formulaire.
function ensureFull() {
  if (state && state.design && !state.conceptOnly) return true;
  try { setMode('full'); state = compute(parseForm($('#f'))); renderStatic(state); clearStale(); $('#error').textContent = ''; return true; }
  catch (e) { $('#error').textContent = 'Calcul complet impossible : ' + (e.stack || String(e)); return false; }
}
$('#btn-report').addEventListener('click', async () => {
  if (!ensureFull()) return;
  const btn = $('#btn-report'); btn.disabled = true; btn.textContent = 'Préparation de la note…';
  try {
    const html = await buildReport({ ...state, version: '0.79', hSearch: lastSearch, ddr: parseDDR(Object.fromEntries(new FormData($('#f')).entries())) });
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { const aEl = document.createElement('a'); aEl.href = url; aEl.download = 'note-de-calcul-pont-dalle.html'; aEl.click(); }
  } catch (e) { $('#error').textContent = e.stack || String(e); }
  finally { btn.disabled = false; btn.textContent = 'Rapport de synthèse'; }
});
// Note de calcul au format SETRA : figures Plotly rendues en PNG, modèle de document commun HTML / Word
async function noteFigures() {
  const out = {};
  for (const [key, sel, caption] of [['M', '#plot-M', 'Enveloppes des moments fléchissants'], ['R', '#plot-R', "Réactions d'appui"], ['K', '#plot-K', 'Coefficients K de Guyon-Massonnet'], ['my', '#plot-my', 'Moments transversaux m_y(y)'], ['As', '#plot-As', 'Ferraillage longitudinal']]) {
    const div = $(sel);
    if (!div || !div.data) continue;
    try { out[key] = { dataUrl: await Plotly.toImage(div, { format: 'png', width: 1100, height: 440, scale: 2 }), w: 1100, h: 440, caption }; } catch (e) { /* figure ignorée */ }
  }
  return out;
}
// Figures SVG (sondages) → PNG pour la note Word
async function svgToImg(note) {
  const out = [];
  for (const b of note.blocks) {
    if (b.t !== 'svg') { out.push(b); continue; }
    try {
      const vb = (b.svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || [0, 640, 480]).slice(1).map(Number);
      const img = new Image(); const url = URL.createObjectURL(new Blob([b.svg], { type: 'image/svg+xml' }));
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas'); c.width = vb[0] * 2; c.height = vb[1] * 2;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      out.push({ t: 'img', dataUrl: c.toDataURL('image/png'), w: vb[0], h: vb[1], caption: b.caption });
    } catch (e) { out.push({ t: 'p', text: `(figure « ${b.caption || ''} » non disponible)` }); }
  }
  return { ...note, blocks: out };
}
async function makeNote() {
  const ref = $('#note-ref').value;
  return buildNote({ ...state, version: '0.79', ddr: parseDDR(Object.fromEntries(new FormData($('#f')).entries())) }, { ref, figures: await noteFigures(), project: { name: (location.hash ? 'Projet' : 'Ouvrage') } });
}
$('#btn-note').addEventListener('click', async () => {
  if (!ensureFull()) return;
  const btn = $('#btn-note'); btn.disabled = true;
  try {
    const html = noteToHTML(await makeNote());
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) { const aEl = document.createElement('a'); aEl.href = url; aEl.download = 'note-de-calcul.html'; aEl.click(); }
  } catch (e) { $('#error').textContent = e.stack || String(e); } finally { btn.disabled = false; }
});
$('#btn-note-docx').addEventListener('click', async () => {
  if (!ensureFull()) return;
  const btn = $('#btn-note-docx'); btn.disabled = true; btn.textContent = 'Préparation…';
  try {
    const docx = await import('./vendor/docx.js');
    const blob = await noteToDocx(await svgToImg(await makeNote()), docx);
    const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob); aEl.download = `note-de-calcul-${$('#note-ref').value}.docx`; aEl.click();
  } catch (e) { $('#error').textContent = e.stack || String(e); } finally { btn.disabled = false; btn.textContent = 'Note de calcul (Word)'; }
});
$('#trans-span').addEventListener('change', () => state && renderTransverse(state));
$('#supports-ref').addEventListener('change', () => state && renderSupports(state));
// indice de danger : recalcul en direct à chaque saisie de l'onglet « Dispositifs de retenue »
function renderDDR() {
  try { $('#ddr-out').innerHTML = ddrHTML(parseDDR(Object.fromEntries(new FormData($('#f')).entries()))); }
  catch (e) { $('#ddr-out').innerHTML = `<p class="small">Calcul impossible : ${e.message}</p>`; }
}
$('#tab-retenue').addEventListener('input', renderDDR); $('#tab-retenue').addEventListener('change', renderDDR);
renderDDR();
let cadre = null;
const runCadre = () => {
  try {
    cadre = computeCadre(parseCadre(Object.fromEntries(new FormData($('#f')).entries())));
    $('#cadre-tables').innerHTML = blocksToHTML(cadreBlocks(cadre));
    $('#card-cadre').hidden = false; $('#cadre-empty').hidden = true; $('#error').textContent = '';
  } catch (e) { cadre = null; $('#error').textContent = e.stack || String(e); }
};
$('#btn-cadre').addEventListener('click', runCadre);
$('#btn-cadre-note').addEventListener('click', () => {
  if (!cadre) runCadre(); if (!cadre) return;
  const url = URL.createObjectURL(new Blob([noteToHTML(cadreNote(cadre, { version: '0.79' }))], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) { const aEl = document.createElement('a'); aEl.href = url; aEl.download = 'note-cadre.html'; aEl.click(); }
});
$('#btn-cadre-docx').addEventListener('click', async () => {
  if (!cadre) runCadre(); if (!cadre) return;
  try {
    const docx = await import('./vendor/docx.js');
    const blob = await noteToDocx(await svgToImg(cadreNote(cadre, { version: '0.79' })), docx);
    const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob); aEl.download = `note-cadre-${cadre.inp.geom.nom || 'ouvrage'}.docx`; aEl.click();
  } catch (e) { $('#error').textContent = e.stack || String(e); }
});
let poutres = null;
$('#btn-poutres').addEventListener('click', () => {
  try {
    poutres = computePoutres(parsePoutres(Object.fromEntries(new FormData($('#f')).entries())));
    $('#poutres-tables').innerHTML = blocksToHTML(beamsBlocks(poutres));
    $('#card-poutres').hidden = false; $('#poutres-empty').hidden = true; $('#error').textContent = '';
  } catch (e) { $('#error').textContent = e.stack || String(e); }
});
$('#btn-poutres-appuis').addEventListener('click', () => {
  if (!poutres) $('#btn-poutres').click();
  if (!poutres) return;
  const f = $('#f'), inp = poutres.inp;
  f.ss_spans.value = inp.spans.join(', '); f.ss_width.value = (inp.n * inp.b1).toFixed(2);
  f.ss_Lc.value = (inp.roadway.y2 - inp.roadway.y1).toFixed(2); f.ss_h.value = String(poutres.sec.H || inp.beam.H || 2);
  f.ss_area.value = (inp.n * poutres.sec.A).toFixed(3); f.ss_lines.value = linesToStandaloneText(poutres.lines);
  $('#btn-standalone').click();
});
$('#btn-standalone').addEventListener('click', () => {
  setMode('supports'); goTab('appuis');
  try {
    const d = Object.fromEntries(new FormData($('#f')).entries());
    state = computeStandalone(parseStandalone(d), withEC8(parseSupports(d))); clearStale();
    renderSupports(state); $('#error').textContent = '';
    $('#card-supports').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { $('#error').textContent = e.stack || String(e); }
});
const supNote = () => supportsNote(state.supports, { ref: $('#supports-ref').value, version: '0.79', standalone: !!state.standalone, spans: state.deck.spans });
$('#btn-sup-note').addEventListener('click', () => {
  if (!state || !state.supports) { $('#error').textContent = 'Lancer d\'abord le calcul.'; return; }
  const url = URL.createObjectURL(new Blob([noteToHTML(supNote())], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) { const aEl = document.createElement('a'); aEl.href = url; aEl.download = 'note-appuis.html'; aEl.click(); }
});
$('#btn-sup-docx').addEventListener('click', async () => {
  if (!state || !state.supports) { $('#error').textContent = 'Lancer d\'abord le calcul.'; return; }
  try {
    const docx = await import('./vendor/docx.js');
    const blob = await noteToDocx(await svgToImg(supNote()), docx);
    const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob); aEl.download = `note-appuis-${$('#supports-ref').value}.docx`; aEl.click();
  } catch (e) { $('#error').textContent = e.stack || String(e); }
});
$('#btn-ec8').addEventListener('click', () => {
  if (!state || !state.supports) { $('#error').textContent = 'Lancer d\'abord le calcul complet.'; return; }
  try {
    const sp = state.supports.sp, j = toPontEC8(state, { site: sp.ec8, q: sp.seisme.q });
    const aEl = document.createElement('a');
    aEl.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }));
    aEl.download = `pont-ec8-${state.deck.spans.join('-')}.json`; aEl.click();
  } catch (e) { $('#error').textContent = e.stack || String(e); }
});
$('#trans-ref').addEventListener('change', () => state && renderTransverse(state));
$('#span-select').addEventListener('change', () => state && kPlot($('#plot-K'), state.deck, +$('#span-select').value));
// Exemple de la note commentée PSIDA.EL (SETRA 1984, réimpr. 1990) : rectangle équivalent 7,913 × 0,52 m, I = 0,09272 m⁴,
// superstructures QSUP 42,5 kN/m (min 25,5), trottoirs 1,5 kN/m², classe 1, Ei = 38 032 MPa (tassements : Ei/3), biais 80 gr.
$('#btn-psidael').addEventListener('click', () => {
  const f = $('#f');
  f.spans.value = '9.75, 13.93, 13.93, 9.75'; f.width.value = 7.913; f.h.value = 0.52; f.area.value = 4.1256; f.overhangs.value = '0.35, 0.35';
  f.roadway.value = '-3, 3'; f.footways.value = '-3.9565,-3 ; 3,3.9565'; f.lines.value = '';
  f.bands.value = '5.371 sur -3.9565,3.9565 k 0.6/1.0'; f.ys.value = '-3.9565, -3, -1.978, 0, 1.978, 3, 3.9565';
  f.Leq.value = ''; f.leqMethod.value = 'fleches'; f.alpha.value = 'FR2'; f.nRetenue.value = 0; f.classe.value = '1'; f.mil.value = 'Mc120'; f.nu.value = 0; f.chamoaSign.checked = true;
  f.hEdge.value = ''; f.joue.value = ''; f.EI.value = '38032, 0.09272'; f.withTherm.checked = true; f.dT.value = '0, 0'; f.delta.value = 0.01; f.phiFluage.value = 2; f.fck.value = 30.6; f.fyk.value = 400; f.cover.value = 0.025; f.fiss.value = 'peu nuisible';
  f.psi.value = 80; f.tirantAir.value = ''; f.typeDalle.value = 'auto'; f.Dabout.value = 25; f.rhoMax.value = 1.0; f.transDir.value = 'appuis'; f.nBearings.value = ''; f.xFixed.value = ''; f.epsSlow.value = 0.00025; f.dTu.value = 30;
  f.withChantier.checked = false; f.lm3.value = ''; f.cant.value = ''; f.fatLambda1.value = 1.0; f.fatCat.value = '2'; f.bearingPitch.value = '';
  $('#hs-min').value = ''; $('#hs-max').value = '';
  renderScheme();
});
$('#btn-chamoa').addEventListener('click', () => {
  const f = $('#f');
  f.spans.value = '10, 15, 15, 10'; f.width.value = 12; f.h.value = 0.75; f.area.value = 8.91; f.overhangs.value = '0.5, 0.5';
  f.roadway.value = '-5, 5'; f.footways.value = '-6,-5 ; 5,6'; f.lines.value = '10 @ -5.85 k 0.8/1.2 ; 10 @ 5.85 k 0.8/1.2';
  f.bands.value = '0.66 sur -6,6 k 0.8/1.2 ; 1.92 sur -5,5 k 0.8/1.4 ; 0.72 sur -6,-5 ; 0.72 sur 5,6'; f.ys.value = '-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6';
  f.Leq.value = ''; f.leqMethod.value = 'moments'; f.alpha.value = 'FR2'; f.nRetenue.value = 0; f.classe.value = ''; f.mil.value = 'Mc120+D240'; f.nu.value = 0.2; f.chamoaSign.checked = true;
  f.hEdge.value = 0.40; f.joue.value = 1.0; f.EI.value = '34077, 0.43077'; f.withTherm.checked = true; f.fck.value = 35; f.fyk.value = 500; f.cover.value = 0.03;
  f.psi.value = 80; f.tirantAir.value = ''; f.typeDalle.value = 'auto'; f.Dabout.value = 25; f.rhoMax.value = 1.0; f.transDir.value = 'appuis'; f.nBearings.value = ''; f.xFixed.value = ''; f.epsSlow.value = 0.00025; f.dTu.value = 30;
  f.withChantier.checked = true; f.chRoadway.value = '-4, 4'; f.chNeutral.value = 1; f.chRemblai.value = '0.5 sur -5,5'; f.chEnrobe.value = '0.2 sur -4,4'; f.chVehicles.value = 'Véhicule spécial : 100@1 ; 100@9 | w=3 e=2 dyn=1.5';
  f.lm3.value = 'VS 1200/200'; f.lm3Speed.value = 'rapide'; f.cant.value = ''; f.fatLambda1.value = 1.0; f.fatCat.value = '2'; f.bearingPitch.value = '';
  $('#hs-min').value = ''; $('#hs-max').value = '';
  renderScheme();
});

// Onglet « Calcul sismique » : Pont EC8 complet dans une iframe (même origine), échanges par postMessage.
const ec8Frame = () => $('#ec8-frame');
function ec8Post(projet) {
  const fr = ec8Frame();
  if (!fr.getAttribute('src') || !fr.contentWindow) { ec8Pending = projet; goTab('seisme'); return; }
  fr.contentWindow.postMessage({ source: 'psida', type: 'projet', projet }, location.origin);
}
function ec8Status() {
  const el = $('#ec8-status'); if (!el) return;
  if (!ec8Data) { el.textContent = 'Aucun effort reçu.'; return; }
  const a = ec8Data.efforts.appuis.length;
  el.textContent = `Efforts reçus (${new Date(ec8Data.date).toLocaleTimeString('fr-FR')}) : « ${ec8Data.nom} », ${a} lignes d'appui, T = ${ec8Data.T.x.toFixed(2)} / ${ec8Data.T.y.toFixed(2)} s, F = ${Math.round(ec8Data.F.x)} / ${Math.round(ec8Data.F.y)} kN${ec8Data.problemes.length ? ` — ${ec8Data.problemes.length} alerte(s)` : ''}.`;
}
window.addEventListener('message', ev => {
  if (ev.origin !== location.origin || !ev.data || ev.data.source !== 'pont-ec8') return;
  if (ev.data.type === 'pret' && ec8Pending) { const p = ec8Pending; ec8Pending = null; ec8Post(p); }
  else if (ev.data.type === 'efforts') {
    ec8Data = ev.data; ec8Status();
    const f = $('#f');
    if (state && f.ap_seisme && f.ap_seisme.checked && f.ap_seismeSrc && f.ap_seismeSrc.value === 'onglet' && JSON.stringify(ev.data.efforts) !== ec8Used)
      markStale('Nouveaux efforts reçus de l\'onglet « Calcul sismique » : relancer le calcul pour les reporter dans les appuis et fondations.');
  }
  else if (ev.data.type === 'erreur') { $('#ec8-status').textContent = 'Pont EC8 : ' + ev.data.message; }
});
$('#btn-ec8-send').addEventListener('click', () => {
  if (!state || !state.supports || !state.supports.sp) { $('#ec8-status').textContent = 'Lancer d\'abord un calcul avec appuis (Calculer, appuis seuls ou ponts à poutres → appuis).'; return; }
  try {
    const sp = state.supports.sp;
    ec8Post(toPontEC8(state, { nom: `PSIDA — ${state.deck.spans.join(' + ')} m`, site: sp.ec8, q: sp.seisme.q }));
    $('#ec8-status').textContent = 'Projet PSIDA envoyé.';
  } catch (e) { $('#ec8-status').textContent = 'Envoi impossible : ' + e.message; }
});
$('#btn-ec8-apply').addEventListener('click', () => {
  if (!ec8Data) { $('#ec8-status').textContent = 'Aucun effort reçu : envoyer le projet ou modifier le projet de l\'onglet.'; return; }
  const f = $('#f'); f.ap_seisme.checked = true; f.ap_seismeSrc.value = 'onglet';
  if (state && state.standalone) $('#btn-standalone').click(); else f.requestSubmit();
  goTab('appuis');
});
ec8Status();
