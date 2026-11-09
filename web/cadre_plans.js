/**
 * Onglet « Cadres et portiques » — carte « Plans d'exécution » : coffrage et ferraillage de chaque bloc (PICF) ou du
 * portique (PIPO), aperçu, DXF et PDF. Le cartouche reprend les champs de la carte des plans (onglet Ferraillage).
 */
import { planCoffrageCadre, planFerraillageCadre, planFerraillagePlanCadre, planFaconnageCadre } from '../src/plans/cadre.js';
import { planMursAile } from '../src/plans/murs_aile.js';
import { feuilleSVG } from '../src/plans/svg.js';
import { feuilleDXF, octetsCp1252 } from '../src/plans/dxf.js';
import { cartouche } from './plans_view.js';

const $ = s => document.querySelector(s);
const val = n => { const e = document.querySelector(`[name="${n}"]`); return e ? e.value.trim() : ''; };

/** Clés des plans du bloc i : 'cof-i' coffrage, 'fer-i' coupes et détails, 'fpl-i' vues en plan, 'fac-i' façonnage ; 'ail-0' murs en aile. */
export function plansCadre(cadre) {
  if (!cadre || !cadre.blocs) return [];
  const ailes = cadre.inp && cadre.inp.opts && cadre.inp.opts.ailes && cadre.inp.opts.ailes.actif !== false ? [{ k: 'ail-0', t: 'ail', i: 0, titre: 'Murs en aile — coffrage et ferraillage' }] : [];
  const T = { cof: 'coffrage', fer: 'ferraillage — coupe et détails', fpl: 'ferraillage — vues en plan et coupe longitudinale', fac: 'nomenclature et façonnage' };
  return [...cadre.blocs.flatMap((b, i) => Object.keys(T).map(t => ({ k: `${t}-${i}`, t, i, titre: `${cadre.blocs.length > 1 ? `Bloc ${i + 1} (${cadre.split.blocs[i].label}) — ` : ''}${T[t]}` }))), ...ailes];
}
function numero(cadre, t, i) {
  if (t === 'ail') return val('cf_num_ail') || 'OH-AIL-01';
  // feuilles de ferraillage : numéro saisi, puis suivants (OH-FER-01, -02, -03)
  const suivant = (s, d) => (d ? s.replace(/(\d+)(?!.*\d)/, q => String(+q + d).padStart(q.length, '0')) : s);
  const base = t === 'cof' ? (val('cf_num_cof') || 'OH-COF-01') : suivant(val('cf_num_fer') || 'OH-FER-01', { fer: 0, fpl: 1, fac: 2 }[t]);
  return cadre.blocs.length > 1 ? `${base}-B${i + 1}` : base;
}
export function feuilleCadre(cadre, k) {
  const [t, si] = k.split('-'), i = +si, res = cadre.blocs[i];
  if (t === 'ail') return planMursAile(cadre, cartouche(numero(cadre, t, i)));
  const bloc = cadre.blocs.length > 1 ? `bloc ${i + 1}` : '';
  const f = { cof: planCoffrageCadre, fer: planFerraillageCadre, fpl: planFerraillagePlanCadre, fac: planFaconnageCadre }[t];
  return f(res, cartouche(numero(cadre, t, i)), { bloc });
}
function telecharger(blob, nom) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const nomFichier = (cadre, k, ext) => { const [t, i] = k.split('-'); return `${numero(cadre, t, +i).replace(/[^\w.-]+/g, '_')}.${ext}`; };

export function renderCadrePlans(cadre) {
  const sel = $('#cf-plan-type'); if (!sel) return;
  const L = plansCadre(cadre), prev = sel.value;
  sel.innerHTML = L.map(p => `<option value="${p.k}">${p.titre}</option>`).join('');
  if (L.some(p => p.k === prev)) sel.value = prev;
  $('#cf-plans').hidden = !L.length; $('#cf-plan-apercu').innerHTML = '';
}

export function initCadrePlans(getCadre) {
  if (!$('#cf-plans')) return;
  const avec = f => async () => {
    const c = getCadre(); if (!c) return;
    const b = document.activeElement; if (b) b.disabled = true;
    try { await f(c); } catch (e) { $('#cf-plan-apercu').innerHTML = `<p class="small"><span class="badge warn">ATTENTION</span> ${e.message}</p>`; console.error(e); } finally { if (b) b.disabled = false; }
  };
  $('#cf-plan-type').addEventListener('change', () => { $('#cf-plan-apercu').innerHTML = ''; });
  $('#cf-plan-voir').addEventListener('click', avec(c => {
    const k = $('#cf-plan-type').value, F = feuilleCadre(c, k);
    const url = URL.createObjectURL(new Blob([feuilleSVG(F)], { type: 'image/svg+xml' }));
    $('#cf-plan-apercu').innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Ouvrir le plan en grand dans un nouvel onglet"><img src="${url}" alt="plan" style="width:100%"></a>`;
  }));
  $('#cf-plan-dxf').addEventListener('click', avec(c => {
    const k = $('#cf-plan-type').value;
    telecharger(new Blob([octetsCp1252(feuilleDXF(feuilleCadre(c, k)))], { type: 'application/dxf' }), nomFichier(c, k, 'dxf'));
  }));
  const pdf = tous => avec(async c => {
    const { feuillesPDFBlob } = await import('./plans_pdf.js');
    const ks = tous ? plansCadre(c).map(p => p.k) : [$('#cf-plan-type').value];
    const blob = await feuillesPDFBlob(ks.map(k => feuilleCadre(c, k)), { titre: `${c.inp.geom.nom || 'Cadre'} — plans`, auteur: val('plan_etabli') });
    telecharger(blob, tous ? `${(c.inp.geom.nom || 'cadre').replace(/[^\w.-]+/g, '_')}-plans.pdf` : nomFichier(c, ks[0], 'pdf'));
  });
  $('#cf-plan-pdf').addEventListener('click', pdf(false));
  $('#cf-plan-pdf-tous').addEventListener('click', pdf(true));
}
