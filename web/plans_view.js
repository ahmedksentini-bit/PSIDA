/**
 * Onglet Ferraillage — carte « Plans d'exécution » : plan de coffrage et plan de ferraillage du tablier, aperçu,
 * téléchargement DXF (R12, mm, calques normalisés) et PDF vectoriel. Les champs du cartouche sont des champs du
 * formulaire (enregistrés avec le projet).
 */
import { planCoffrage } from '../src/plans/coffrage.js';
import { planFerraillage } from '../src/plans/ferraillage.js';
import { planCoffrageAppui, appuisDisponibles } from '../src/plans/appuis.js';
import { planEnsemble } from '../src/plans/ensemble.js';
import { planNivellement } from '../src/plans/nivellement.js';
import { planRetenueTypes } from '../src/plans/retenue.js';
import { planFerraillageAppui } from '../src/plans/ferraillageAppuis.js';
import { planEquipements, lireEquipements, controleCharges, souffleJoints, bordGeom } from '../src/plans/equipements.js';
import { geometrie } from '../src/plans/geometrie.js';
import { feuilleSVG } from '../src/plans/svg.js';
import { feuilleDXF, octetsCp1252 } from '../src/plans/dxf.js';

const $ = s => document.querySelector(s);
const val = n => { const e = document.querySelector(`[name="${n}"]`); return e ? e.value.trim() : ''; };

export function cartouche(numero) {
  const d = new Date();
  return {
    maitreOuvrage: val('plan_mo'), projet: val('plan_projet'), ouvrage: val('plan_ouvrage'), numero,
    indice: val('plan_indice') || 'A', date: val('plan_date') || d.toLocaleDateString('fr-FR'),
    etabli: val('plan_etabli'), verifie: val('plan_verifie'), modification: val('plan_modif') || 'Première émission',
    approuve: val('plan_approuve'), bureau: val('plan_be'), bureauAdresse: val('plan_be_adr'), phase: val('plan_phase'), lot: val('plan_lot'),
    format: val('plan_format') || 'auto',
  };
}

/** Paramètres des équipements (champs eq_* du formulaire ; hauteur du dispositif par défaut : onglet Dispositifs de retenue). */
function equipements() {
  const d = {}; document.querySelectorAll('[name^="eq_"], [name="dr_hDR"]').forEach(e => { d[e.name] = e.value; });
  return lireEquipements(d);
}
const PLANS = {
  ensemble: { titre: 'Vue en plan et coupe longitudinale', fichier: 'ensemble', num: () => val('plan_num_ens') || 'OA-ENS-01', faire: (st, c) => planEnsemble(st, c, equipements()) },
  coffrage: { titre: 'Coffrage : coupes transversales et détails', fichier: 'coffrage', num: () => val('plan_num_cof') || 'TAB-COF-01', faire: (st, c) => planCoffrage(st, c, equipements()) },
  nivellement: { titre: 'Tableau de dimensionnement et nivellement des appuis', fichier: 'nivellement', num: () => val('plan_num_niv') || 'APP-NIV-01', faire: (st, c) => planNivellement(st, c) },
  retenue: { titre: 'Dispositifs de retenue : plans types', fichier: 'retenue', num: () => val('plan_num_ret') || 'TAB-EQU-02', faire: (st, c) => planRetenueTypes(st, equipements(), c) },
  equipements: { titre: 'Équipements', fichier: 'equipements', num: () => val('plan_num_eq') || 'TAB-EQU-01', faire: (st, c) => planEquipements(st, equipements(), c) },
  ferraillage: { titre: 'Plan de ferraillage', fichier: 'ferraillage', num: () => val('plan_num_fer') || 'TAB-FER-01', faire: (st, c) => planFerraillage(st, c) },
};

/** Plan par clé : 'coffrage', 'ferraillage', 'appui-i' (coffrage de la ligne d'appui i). */
function plan(st, k) {
  if (PLANS[k]) return PLANS[k];
  const i = +k.split('-')[1], nom = i === 0 ? 'C0' : i === st.deck.beam.x0.length - 1 ? `C${i}` : `P${i}`;
  if (k.startsWith('appuiF-')) return { titre: `Appui ${nom} — ferraillage`, fichier: null, num: () => `${val('plan_num_appF') || 'APP-FER'}-${nom}`, faire: (s, c) => planFerraillageAppui(s, i, c) };
  return { titre: `Appui ${nom} — coffrage`, fichier: null, num: () => `${val('plan_num_app') || 'APP-COF'}-${nom}`, faire: (s, c) => planCoffrageAppui(s, i, c) };
}
function feuille(st, k) { const P = plan(st, k); return P.faire(st, cartouche(P.num())); }
function telecharger(blob, nom) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const nomFichier = (st, k, ext) => { const P = plan(st, k); return `${P.num().replace(/[^\w.-]+/g, '_')}${P.fichier ? '-' + P.fichier : ''}.${ext}`; };

/** Plans disponibles pour l'état de calcul : le ferraillage seulement pour une dalle armée calculée. */
export function plansDisponibles(st) {
  if (!st || !st.deck) return [];
  return [...(appuisDisponibles(st).length ? ['ensemble'] : []), ...(st.rebar && st.rebar.marks ? ['coffrage', 'ferraillage'] : ['coffrage']), 'equipements', 'retenue', ...(appuisDisponibles(st).length ? ['nivellement'] : []), ...appuisDisponibles(st).flatMap(i => [`appui-${i}`, `appuiF-${i}`])];
}

export function renderPlans(st) {
  const box = $('#plans-box'); if (!box) return;
  const dispo = plansDisponibles(st);
  const sel = $('#plan-type'), prev = sel.value;
  sel.innerHTML = dispo.map(k => `<option value="${k}">${k === 'ensemble' ? 'Ouvrage — ' + PLANS[k].titre.toLowerCase() : k === 'nivellement' ? 'Appuis — ' + PLANS[k].titre.toLowerCase().replace(' des appuis', '') : PLANS[k] ? 'Tablier — ' + PLANS[k].titre.toLowerCase() : plan(st, k).titre}</option>`).join('');
  if (dispo.includes(prev)) sel.value = prev;
  const msg = [];
  if (!dispo.includes('ferraillage')) msg.push('Dalle précontrainte ou ferraillage indisponible : seul le plan de coffrage du tablier est proposé (le câblage et les aciers passifs sont dans l\'onglet Précontrainte).');
  if (st.rail) msg.push('<span class="badge warn">PONT-RAIL</span> Les plans de coffrage, d\'ensemble et d\'équipements sont établis pour un tablier routier (chaussée, trottoirs, joints de chaussée, dispositifs de retenue, gargouilles) : à adapter à la voie ferrée (ballast, garde-ballast, caniveaux, pistes) ; le plan de ferraillage du tablier reste valable.');
  if (!dispo.some(k => k.startsWith('appui-'))) msg.push('Plans des appuis : calcul des appuis indisponible (voir l\'onglet Appuis et fondations).');
  $('#plans-info').innerHTML = msg.join(' ');
  infoEquipements(st);
  $('#plan-apercu').innerHTML = '';
}

function apercu(st) {
  const k = $('#plan-type').value; if (!k) return;
  try {
    const F = feuille(st, k);
    // image isolée des styles de la page (les règles CSS des schémas ne s'appliquent pas au plan)
    const url = URL.createObjectURL(new Blob([feuilleSVG(F)], { type: 'image/svg+xml' }));
    $('#plan-apercu').innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Ouvrir le plan en grand dans un nouvel onglet"><img src="${url}" alt="${plan(st, k).titre}"></a>`;
  } catch (e) { $('#plan-apercu').innerHTML = `<p class="small"><span class="badge warn">ATTENTION</span> ${e.message}</p>`; }
}

/** Contrôle rapide : poids des équipements / charges linéaires saisies, souffle et famille des joints. */
function infoEquipements(st) {
  const box = $('#eq-info'); if (!box || !st || !st.deck) return;
  try {
    const eq = equipements(), C = controleCharges(st, eq), J = souffleJoints(st, eq);
    const f = x => x.toFixed(2).replace('.', ',');
    const cote = c => `côté ${c.sg > 0 ? 'y > 0' : 'y < 0'} : équipements ${f(c.P.total)} kN/m, charges saisies ${f(c.saisi)} kN/m${c.ecart != null ? ` (${c.ecart >= 0 ? '+' : ''}${(c.ecart * 100).toFixed(0)} %)` : ''}`;
    const alerte = C.some(c => c.ecart != null && Math.abs(c.ecart) > 0.10);
    const G = geometrie(st), al = [...new Set([1, -1].flatMap(sg => bordGeom(G, eq, sg).alertes || []))];
    box.innerHTML = `${alerte || al.length ? '<span class="badge warn">ATTENTION</span> ' : '<span class="badge ok">OK</span> '}${C.map(cote).join(' ; ')}. Joints : ${J.map(j => `${j.i === 0 ? 'C0' : 'C' + j.i} ${j.W != null ? (j.W * 1000).toFixed(0) + ' mm' : '—'}, ${j.type}`).join(' ; ')}.${al.map(t => ' ' + t).join('')}`;
  } catch (e) { box.textContent = 'Équipements : ' + e.message; }
}

export function initPlans(getState) {
  if (!$('#plans-box')) return;
  const avec = f => async () => {
    const st = getState(); if (!st || !st.deck) return;
    const bouton = document.activeElement; if (bouton) bouton.disabled = true;
    try { await f(st); } catch (e) { alert('Plans : ' + e.message); console.error(e); } finally { if (bouton) bouton.disabled = false; }
  };
  $('#plan-voir').addEventListener('click', avec(st => apercu(st)));
  document.querySelectorAll('.eq-box input, .eq-box select').forEach(e => e.addEventListener('change', () => { const st = getState(); if (st && st.deck) infoEquipements(st); }));
  $('#plan-type').addEventListener('change', () => { $('#plan-apercu').innerHTML = ''; });
  $('#plan-dxf').addEventListener('click', avec(st => {
    const k = $('#plan-type').value, F = feuille(st, k);
    telecharger(new Blob([octetsCp1252(feuilleDXF(F))], { type: 'application/dxf' }), nomFichier(st, k, 'dxf'));
  }));
  const pdf = tous => avec(async st => {
    const { feuillesPDFBlob } = await import('./plans_pdf.js');
    const ks = tous ? plansDisponibles(st) : [$('#plan-type').value];
    const blob = await feuillesPDFBlob(ks.map(k => feuille(st, k)), { titre: `${val('plan_ouvrage') || 'Ouvrage'} — plans`, auteur: val('plan_etabli') });
    telecharger(blob, tous ? `${(val('plan_ouvrage') || 'ouvrage').replace(/[^\w.-]+/g, '_')}-plans.pdf` : nomFichier(st, ks[0], 'pdf'));
  });
  $('#plan-pdf').addEventListener('click', pdf(false));
  $('#plan-pdf-tous').addEventListener('click', pdf(true));
}
