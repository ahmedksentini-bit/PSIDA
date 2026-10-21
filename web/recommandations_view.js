/**
 * Panneau « Recommandations » : pour chaque vérification non satisfaite, le constat (valeur, limite, règle) et les
 * actions proposées (paramètre à modifier, valeur cible calculée quand c'est possible) ; « Appliquer » écrit la valeur
 * dans le formulaire (les résultats deviennent périmés jusqu'au prochain calcul), « Voir » ouvre l'onglet du champ.
 */
import { recommandations } from '../src/recommandations.js';

/** Libellé du champ lu dans le formulaire (texte de son <label>, sans les valeurs des listes). */
function libelle(form, name) {
  const el = form.elements[name]; if (!el) return name;
  const node = el.tagName ? el : el[0], lab = node.closest('label');
  if (!lab) return name;
  const c = lab.cloneNode(true); c.querySelectorAll('select, input, textarea, .fx, button').forEach(x => x.remove());
  return c.textContent.replace(/\s+/g, ' ').trim() || name;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let dernier = null;

/** Met à jour le compteur du bouton d'en-tête. */
export function majBouton(st) {
  const b = document.getElementById('btn-reco');
  if (!b) return;
  if (!st) { b.hidden = true; return; }
  try { dernier = { ...recommandations(st), st }; } catch (e) { dernier = { items: [], erreur: e.message, st }; }
  const n = dernier.items.length;
  b.hidden = false;
  b.classList.toggle('ok', n === 0);
  b.innerHTML = n ? `Recommandations <span class="reco-n">${n}</span>` : 'Recommandations <span class="reco-n ok">✓</span>';
  b.title = n ? `${n} vérification(s) non satisfaite(s) : que changer ?` : 'Toutes les vérifications sont satisfaites';
}

/** Ouvre le panneau. form : formulaire principal ; onApply(name, value) : écrit la valeur ; goField(name) : montre le champ. */
export function ouvrir(st, { form, onApply, goField, solve }) {
  const rec = dernier && dernier.st === st ? dernier : (dernier = { ...recommandations(st), st });
  let dlg = document.getElementById('reco-dlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'reco-dlg'; dlg.className = 'reco'; document.body.appendChild(dlg); }
  const parDomaine = new Map();
  for (const it of rec.items) { if (!parDomaine.has(it.domaine)) parDomaine.set(it.domaine, []); parDomaine.get(it.domaine).push(it); }
  let h = `<div class="reco-tete"><h2>Recommandations</h2><button type="button" class="secondary" data-close>Fermer</button></div>`;
  if (rec.erreur) h += `<p class="small">Recommandations indisponibles : ${esc(rec.erreur)}</p>`;
  if (!rec.items.length) h += `<p><span class="badge ok">OK</span> Aucune vérification non satisfaite dans les résultats affichés.</p>`;
  else h += `<p class="small">${rec.items.length} vérification(s) non satisfaite(s). Pour chacune : ce qui ne passe pas, puis les paramètres à modifier, du plus efficace au plus coûteux. « Calculer » cherche la valeur qui suffit (les autres données restant inchangées) ; « Appliquer » l'écrit dans le formulaire, puis relancez le calcul.</p>`;
  let k = 0;
  for (const [dom, items] of parDomaine) {
    h += `<h3>${esc(dom)}</h3>`;
    for (const it of items) {
      h += `<div class="reco-item"><div class="reco-constat"><span class="badge warn">${esc(it.lieu || '')}</span> <strong>${esc(it.verification)}</strong> — ${esc(it.constat)}${it.regle ? ` <span class="small">(${esc(it.regle)})</span>` : ''}</div><ol class="reco-actions">`;
      for (const a of it.actions) {
        const id = `reco-a${k++}`;
        a._id = id;
        const champ = a.champ ? ` <span class="small">[« ${esc(a.libelleChamp || libelle(form, a.champ))} » : ${esc(form.elements[a.champ] ? (form.elements[a.champ].value === '' ? 'vide' : form.elements[a.champ].value) : '')}]</span>` : '';
        h += `<li id="${id}">${esc(a.texte)}${champ}`;
        if (a.valeur != null) h += ` → <strong>${esc(a.valeur)}</strong>${a.unite ? ' ' + esc(a.unite) : ''}`;
        if (a.chercher) h += ` <button type="button" class="mini" data-solve="${id}">Calculer</button>`;
        if (a.champ && a.valeur != null) h += ` <button type="button" class="mini" data-apply="${id}">Appliquer</button>`;
        if (a.champ) h += ` <button type="button" class="mini secondary" data-go="${id}">Voir</button>`;
        h += `<span class="reco-res small"></span></li>`;
      }
      h += `</ol></div>`;
    }
  }
  dlg.innerHTML = h;
  const find = id => rec.items.flatMap(i => i.actions).find(a => a._id === id);
  dlg.onclick = async ev => {
    const t = ev.target;
    if (t.matches('[data-close]')) { dlg.close(); return; }
    if (t.dataset.go) { const a = find(t.dataset.go); dlg.close(); goField(a.champ); return; }
    if (t.dataset.apply) { const a = find(t.dataset.apply); onApply(a.champ, a.valeurChamp ?? a.valeur); t.textContent = 'Appliqué ✓'; t.disabled = true; return; }
    if (t.dataset.solve) {
      const a = find(t.dataset.solve), li = document.getElementById(t.dataset.solve), out = li.querySelector('.reco-res');
      t.disabled = true; out.textContent = ' calcul…';
      await new Promise(r => setTimeout(r, 20));
      try {
        const r = await solve(a);
        if (r == null) out.textContent = ' aucune valeur ne suffit dans la plage explorée : changer de solution (voir les autres actions).';
        else {
          a.valeur = r.affiche; a.valeurChamp = r.champ; out.innerHTML = ` → <strong>${esc(r.affiche)}</strong>${a.unite ? ' ' + esc(a.unite) : ''} suffit${r.detail ? ` (${esc(r.detail)})` : ''} `;
          if (a.champ) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mini'; b.textContent = 'Appliquer'; b.onclick = () => { onApply(a.champ, a.valeurChamp); b.textContent = 'Appliqué ✓'; b.disabled = true; }; out.appendChild(b); }
        }
      } catch (e) { out.textContent = ' ' + e.message; }
      t.disabled = false;
    }
  };
  if (!dlg.open) dlg.showModal();
}
