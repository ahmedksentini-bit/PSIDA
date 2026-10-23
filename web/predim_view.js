/**
 * Onglet « Tablier par phases » — bouton « Prédimensionner » : valeurs des règles du Sétra pour le type d'ouvrage choisi
 * (poutres rendues continues, fléaux, bipoutre mixte), écrites dans le formulaire, puis affinage par le calcul complet
 * (src/phasage/predim.js). Le tableau des règles et le journal des renforcements restent affichés sous le bouton.
 */
import { predimContinues, predimFleau, predimMixte, affiner } from '../src/phasage/predim.js';
import { computePhasage, computeMixte } from './phasage_view.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const lire = () => Object.fromEntries(new FormData($('#f')).entries());
const n = (v, d) => (String(v ?? '').trim() === '' || !Number.isFinite(+v) ? d : +v);

/** Propositions des règles pour le formulaire courant. */
export function proposer(d) {
  const t = d.ph_type || 'poutres';
  if (t === 'poutres') return { t, ...predimContinues({ L: n(d.ph_L, 25), bh: n(d.ph_bh, 2.5), gSup: n(d.ph_gsup, 8), fck: n(d.ph_pfck, 40) }) };
  if (t === 'fleau') return { t, ...predimFleau({ a: n(d.fl_a, 40), B: n(d.fl_B, 12), gSup: n(d.fl_gsup, 40), P0: n(d.fl_cP0, 3000), Lr: n(d.fl_Lr, 10) }) };
  const L = String(d.mx_L || '45, 60, 45').split(/[;,\s]+/).map(Number).filter(v => v > 0);
  return { t, ...predimMixte({ L, B: n(d.mx_B, 10.5), gSup: n(d.mx_gsup, 13.5), Lr: n(d.mx_Lr, 8.5), np: n(d.mx_np, 2) }) };
}

function ecrire(champs) {
  for (const [k, v] of Object.entries(champs)) { const e = document.querySelector(`[name="${k}"]`); if (e) e.value = String(v); }
  $('#f').dispatchEvent(new Event('change', { bubbles: true }));
}

function tableau(P, r) {
  const virg = t => String(t).replace(/(\d)\.(\d)/g, '$1,$2');   // décimales à la française
  const lignes = P.lignes.map(l => `<tr><td>${esc(l.grandeur)}</td><td>${esc(virg(l.valeur))}</td><td class="small">${esc(l.regle)}</td><td class="small">${esc(l.ref)}</td></tr>`).join('');
  const j = r && r.journal.length ? `<p class="small"><b>Affinage par le calcul</b> (${r.journal.length} essai${r.journal.length > 1 ? 's' : ''}) :</p><ul class="small">${r.journal.map(q => `<li>essai ${q.essai} — en défaut : ${esc(q.defauts.join(' ; '))} → ${esc(q.modifie.join(', '))}</li>`).join('')}</ul>` : '';
  const fin = !r ? '' : r.ok ? '<p class="small"><span class="badge ok">OK</span> toutes les vérifications de l\'ouvrage terminé sont satisfaites avec les valeurs écrites dans le formulaire.</p>'
    : `<p class="small"><span class="badge warn">ATTENTION</span> critères restant en défaut (sans levier géométrique automatique, à traiter par le projeteur) : ${esc(r.restants.map(q => q.nom).join(' ; '))}.</p>`;
  return `<table><thead><tr><th>Grandeur</th><th>Proposition</th><th>Règle</th><th>Référence</th></tr></thead><tbody>${lignes}</tbody></table>${j}${fin}`;
}

export function initPredim({ apres } = {}) {
  const b = $('#btn-predim'), out = $('#predim-out'); if (!b || !out) return;
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const d = lire(), P = proposer(d);
      ecrire(P.champs);
      out.hidden = false; out.innerHTML = tableau(P) + '<p class="small" id="predim-etat">Affinage par le calcul…</p>';
      const compute = P.t === 'mixte' ? computeMixte : computePhasage;
      const r = await affiner(P.t, P.champs, { ...lire() }, compute, { pause: true, maxIt: 30, onPas: (it, rest) => { const e = $('#predim-etat'); if (e) e.textContent = `Affinage par le calcul : essai ${it + 1}, ${rest.length} vérification(s) en défaut…`; } });
      ecrire(r.champs);
      out.innerHTML = tableau(P, r);
      if (apres) apres();
    } catch (e) { out.hidden = false; out.innerHTML = `<p class="small"><span class="badge warn">ATTENTION</span> ${esc(e.message)}</p>`; console.error(e); }
    b.disabled = false;
  });
}
