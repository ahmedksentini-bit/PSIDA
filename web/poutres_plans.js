/**
 * Onglet « Tablier à poutres » — carte « Plans de la poutre » : coffrage, câblage et ferraillage de principe de la poutre
 * VIPP la plus sollicitée ; aperçu, DXF et PDF. Le cartouche reprend les champs de la carte des plans (onglet Ferraillage).
 */
import { planCoffrageVIPP, planCablageVIPP, planFerraillageVIPP } from '../src/plans/vipp.js';
import { feuilleSVG } from '../src/plans/svg.js';
import { feuilleDXF, octetsCp1252 } from '../src/plans/dxf.js';
import { cartouche } from './plans_view.js';

const $ = s => document.querySelector(s);
const PLANS = [{ k: 'cof', titre: 'Coffrage de la poutre', num: 'VIPP-COF-01', f: planCoffrageVIPP }, { k: 'cab', titre: 'Câblage', num: 'VIPP-CAB-01', f: planCablageVIPP }, { k: 'fer', titre: 'Ferraillage de principe', num: 'VIPP-FER-01', f: planFerraillageVIPP }];

/** Poutre détaillée : la plus sollicitée (moment ELU à mi-travée) de la plus longue travée. */
export function poutreVIPP(r) {
  if (!r || !r.spans) return null;
  const sp = r.spans.reduce((a, q) => (q.L > a.L ? q : a));
  if (!sp.beams[0].vipp) return null;
  return sp.beams.reduce((a, b) => (b.vipp.elu.at(-1).MEd > a.vipp.elu.at(-1).MEd ? b : a)).vipp;
}
const feuille = (v, k) => { const P = PLANS.find(p => p.k === k); return P.f(v, cartouche(P.num), { nom: `POUTRE VIPP ${v.L.toFixed(2).replace('.', ',')} m` }); };
function telecharger(blob, nom) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

export function renderPoutresPlans(r) {
  const card = $('#pt-plans'); if (!card) return;
  const v = poutreVIPP(r); card.hidden = !v; $('#pt-plan-apercu').innerHTML = '';
}

export function initPoutresPlans(getRes) {
  if (!$('#pt-plans')) return;
  $('#pt-plan-type').innerHTML = PLANS.map(p => `<option value="${p.k}">${p.titre}</option>`).join('');
  const avec = fn => async () => {
    const v = poutreVIPP(getRes()); if (!v) return;
    try { await fn(v); } catch (e) { $('#pt-plan-apercu').innerHTML = `<p class="small"><span class="badge warn">ATTENTION</span> ${e.message}</p>`; console.error(e); }
  };
  $('#pt-plan-type').addEventListener('change', () => { $('#pt-plan-apercu').innerHTML = ''; });
  $('#pt-plan-voir').addEventListener('click', avec(v => {
    const url = URL.createObjectURL(new Blob([feuilleSVG(feuille(v, $('#pt-plan-type').value))], { type: 'image/svg+xml' }));
    $('#pt-plan-apercu').innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Ouvrir le plan en grand"><img src="${url}" alt="plan" style="width:100%"></a>`;
  }));
  $('#pt-plan-dxf').addEventListener('click', avec(v => { const k = $('#pt-plan-type').value; telecharger(new Blob([octetsCp1252(feuilleDXF(feuille(v, k)))], { type: 'application/dxf' }), `${PLANS.find(p => p.k === k).num}.dxf`); }));
  const pdf = tous => avec(async v => {
    const { feuillesPDFBlob } = await import('./plans_pdf.js');
    const ks = tous ? PLANS.map(p => p.k) : [$('#pt-plan-type').value];
    telecharger(await feuillesPDFBlob(ks.map(k => feuille(v, k)), { titre: 'Poutre VIPP — plans' }), tous ? 'poutre-vipp-plans.pdf' : `${PLANS.find(p => p.k === ks[0]).num}.pdf`);
  });
  $('#pt-plan-pdf').addEventListener('click', pdf(false));
  $('#pt-plan-pdf-tous').addEventListener('click', pdf(true));
}
