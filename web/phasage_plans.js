/**
 * Onglet « Tablier par phases » — carte « Plans » : feuilles propres au type d'ouvrage calculé (charpente du pont mixte ;
 * coffrage et câblage des poutres rendues continues et des fléaux) ; aperçu, DXF et PDF. Le cartouche reprend les champs
 * de la carte des plans (onglet Ferraillage).
 */
import { planCharpenteElevation, planCharpenteCoupes } from '../src/plans/charpente.js';
import { planFleauCoffrage, planFleauCablage, planContinuesCoffrage, planContinuesCablage } from '../src/plans/ouvrages_phases.js';
import { feuilleSVG } from '../src/plans/svg.js';
import { feuilleDXF, octetsCp1252 } from '../src/plans/dxf.js';
import { cartouche } from './plans_view.js';

const $ = s => document.querySelector(s);
export const PLANS_PHASAGE = {
  mixte: { txt: 'Charpente : élévation d\'une poutre (zones de PRS, épaisseurs, montants, entretoises, joints de chantier des tronçons), vue en plan, tôles par tronçon ; coupes courante et sur appui, connexion (espacements des goujons par zone), quantités (masse, ratio, surface à protéger), notes d\'exécution.',
    plans: [{ k: 'ch1', titre: 'Charpente : élévation et vue en plan', num: 'MX-CH-01', f: planCharpenteElevation, nom: 'PONT MIXTE' }, { k: 'ch2', titre: 'Charpente : coupes, connexion, quantités', num: 'MX-CH-02', f: planCharpenteCoupes, nom: 'PONT MIXTE' }] },
  fleau: { txt: 'Coffrage des voussoirs (élévation du fléau, coupes sur pile et à la clé, tableau des voussoirs avec contre-flèches de réglage) et câblage (câbles de fléau par paire de voussoirs, continuité centrale et de rive, familles de câbles).',
    plans: [{ k: 'cof', titre: 'Coffrage des voussoirs', num: 'FL-COF-01', f: planFleauCoffrage, nom: 'PONT PAR ENCORBELLEMENTS' }, { k: 'cab', titre: 'Câblage du fléau', num: 'FL-CAB-01', f: planFleauCablage, nom: 'PONT PAR ENCORBELLEMENTS' }] },
  poutres: { txt: 'Coffrage d\'une poutre et détail du clavage sur appui ; câblage (tracé parabolique, ordonnées, précontrainte, armatures de continuité du hourdis).',
    plans: [{ k: 'cof', titre: 'Coffrage et clavage', num: 'PC-COF-01', f: planContinuesCoffrage, nom: 'POUTRES RENDUES CONTINUES' }, { k: 'cab', titre: 'Câblage et continuité', num: 'PC-CAB-01', f: planContinuesCablage, nom: 'POUTRES RENDUES CONTINUES' }] },
};
const liste = r => (r && PLANS_PHASAGE[r.type]) || null;
const feuille = (r, k) => { const P = liste(r).plans.find(p => p.k === k); return P.f(r, cartouche(P.num), { nom: P.nom }); };
function telecharger(blob, nom) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

export function renderPhasagePlans(r) {
  const card = $('#ph-plans'); if (!card) return;
  const L = liste(r); card.hidden = !L || (r.type === 'mixte' && !r.v) || (r.type === 'poutres' && !r.p.forme) || (r.type === 'fleau' && !r.p.caisson);
  $('#ph-plan-apercu').innerHTML = '';
  if (!L) return;
  $('#ph-plans-txt').textContent = L.txt + ' Le cartouche reprend les champs de la carte « Plans d\'exécution » de l\'onglet Ferraillage.';
  $('#ph-plan-type').innerHTML = L.plans.map(p => `<option value="${p.k}">${p.titre}</option>`).join('');
}

export function initPhasagePlans(getRes) {
  if (!$('#ph-plans')) return;
  const avec = fn => async () => {
    const r = getRes(); if (!liste(r)) return;
    try { await fn(r); } catch (e) { $('#ph-plan-apercu').innerHTML = `<p class="small"><span class="badge warn">ATTENTION</span> ${e.message}</p>`; console.error(e); }
  };
  $('#ph-plan-type').addEventListener('change', () => { $('#ph-plan-apercu').innerHTML = ''; });
  $('#ph-plan-voir').addEventListener('click', avec(r => {
    const url = URL.createObjectURL(new Blob([feuilleSVG(feuille(r, $('#ph-plan-type').value))], { type: 'image/svg+xml' }));
    $('#ph-plan-apercu').innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Ouvrir le plan en grand"><img src="${url}" alt="plan" style="width:100%"></a>`;
  }));
  const num = (r, k) => liste(r).plans.find(p => p.k === k).num;
  $('#ph-plan-dxf').addEventListener('click', avec(r => { const k = $('#ph-plan-type').value; telecharger(new Blob([octetsCp1252(feuilleDXF(feuille(r, k)))], { type: 'application/dxf' }), `${num(r, k)}.dxf`); }));
  const pdf = tous => avec(async r => {
    const { feuillesPDFBlob } = await import('./plans_pdf.js');
    const ks = tous ? liste(r).plans.map(p => p.k) : [$('#ph-plan-type').value];
    telecharger(await feuillesPDFBlob(ks.map(k => feuille(r, k)), { titre: 'Plans' }), tous ? 'plans-tablier.pdf' : `${num(r, ks[0])}.pdf`);
  });
  $('#ph-plan-pdf').addEventListener('click', pdf(false));
  $('#ph-plan-pdf-tous').addEventListener('click', pdf(true));
}
