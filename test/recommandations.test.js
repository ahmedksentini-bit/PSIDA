/** Recommandations : règles sur l'exemple, recherche de la valeur qui suffit, disparition après application. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { computeSupports } from '../src/supports/index.js';
import { recommandations, candidats, dichotomie } from '../src/recommandations.js';

test('Dichotomie : plus petite valeur satisfaisante d\'une grille', async () => {
  const vals = candidats({ min: 1, max: 5, pas: 0.1, vers: 'haut', depart: 1 });
  assert.equal(await dichotomie(vals, v => v >= 2.34), 2.4);
  assert.equal(await dichotomie(vals, () => false), null);
});

test('Exemple : semelles de culée et appareils signalés, largeur de semelle trouvée et vérifiée', async () => {
  const d = formDefaults(), st = compute(parseData(d));
  st._recoRef = 'BAEL';
  const { items } = recommandations(st);
  assert.ok(items.some(i => i.domaine === 'Fondations superficielles' && /Culée/.test(i.lieu)));
  assert.ok(!items.some(i => /Aciers mis en place/.test(i.verification)), 'plus de fausse alerte aux extrémités');
  const it = items.find(i => i.domaine === 'Fondations superficielles' && i.verification === 'Portance');
  const a = it.actions.find(x => x.champ === 'ap_B' && x.chercher), c = a.chercher;
  const essai = v => { const dd = { ...d, ap_B: String(v) }, p = parseData(dd); return c.verifie({ ...st, p, supports: computeSupports({ p, deck: st.deck, perm: st.perm, f61: st.f61, ec: st.ec, bearings: st.bearings, psidp: st.psidp, thermal: st.thermal }, p.supports) }); };
  const B = await dichotomie(candidats(c), essai);
  assert.ok(B > 3 && B < 6, `B = ${B}`);
  // appliqué : la portance de cette ligne n'est plus signalée
  const st2 = compute(parseData({ ...d, ap_B: String(B) })); st2._recoRef = 'BAEL';
  assert.ok(!recommandations(st2).items.some(i => i.lieu === it.lieu && i.verification === 'Portance'));
});

test('Avertissements PP73 traduits en valeurs cibles', () => {
  const d = formDefaults(); Object.assign(d, { ap_pileType: 'colonnes', ap_D: '0.5', ap_B: '1.2' });
  const st = compute(parseData(d)); st._recoRef = 'EC';
  const { items } = recommandations(st);
  const col = items.find(i => /colonnes Ø/.test(i.constat)), sem = items.find(i => /semelle B = 1.2/.test(i.constat));
  assert.equal(col.actions[0].champ, 'ap_D'); assert.equal(col.actions[0].valeurChamp, '0.6');
  assert.equal(sem.actions[0].champ, 'ap_B'); assert.equal(sem.actions[0].valeurChamp, '1.5');
});
