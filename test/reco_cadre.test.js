/**
 * Recommandations des cadres (PICF) et portiques (PIPO) : chaque « NON » reçoit une indication « → à modifier », et la
 * valeur recommandée, appliquée, fait passer la vérification.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCadre, computeCadre } from '../src/cadre/run.js';
import { recommandationsCadre, indicationsParCible, cleCible } from '../src/reco/cadre.js';
import { cadreBlocks } from '../web/cadre_view.js';

const calc = d => computeCadre(parseCadre(d));
const valeur = (it, champ) => it.actions.find(a => a.champ === champ && a.valeurChamp != null)?.valeurChamp;
const SOL_FAIBLE = '0.5 6 0.6 argile\n1.5 7 0.7 argile\n3 8 0.8 argile\n6 10 1.0 argile';

test('PICF 1 × 6,00 × 4,00, épaisseurs imposées trop faibles : épaisseurs cherchées ensemble, toutes les sections passent', () => {
  const d = { cf_type: 'picf', cf_n: '1', cf_B: '6', cf_H: '4', cf_L: '15', cf_Hr: '3', cf_et: '0.35', cf_er: '0.35', cf_ep: '0.30', cf_hEau: '1.5' };
  const out = calc(d), R = recommandationsCadre(out, d), ind = indicationsParCible(R.items);
  const ko = out.blocs[0].sections.filter(s => s.echec);
  assert.ok(ko.length > 5, 'cas en échec');
  for (const s of ko) assert.ok(ind.get(cleCible({ bloc: 0, type: 'section', barre: s.barre, ou: s.ou })), `${s.barre} ${s.ou} : indication`);
  assert.ok(R.items.every(i => i.regle !== undefined && i.actions.length));
  const tr = R.items.find(i => i.lieu === 'Traverse');
  assert.match(tr.constat, /τ_u = .* > τ_lim/); assert.match(tr.regle, /BAEL 91 A\.5\.2,2/);
  assert.ok(R.synthese && +R.synthese.champs.cf_et > 0.35 && +R.synthese.champs.cf_er > 0.35);
  // l'ensemble appliqué : plus aucune section « NON », plus aucune recommandation de section
  const out2 = calc({ ...d, ...R.synthese.champs });
  assert.ok(out2.blocs.every(r => r.sections.every(s => !s.echec)));
  assert.ok(!recommandationsCadre(out2, { ...d, ...R.synthese.champs }).items.some(i => /sections/.test(i.domaine)));
  // descente : chaque épaisseur proposée est minimale (5 cm de moins, au moins une section repasse « NON »)
  for (const [k, v] of Object.entries(R.synthese.champs)) {
    const o = calc({ ...d, ...R.synthese.champs, [k]: String(+(+v - 0.05).toFixed(2)) });
    assert.ok(o.blocs.some(r => r.sections.some(s => s.echec)), `${k} = ${v} − 0,05 suffirait`);
  }
});

test('PIPO sur sol faible, gabarit insuffisant : largeur des semelles et hauteur intérieure', () => {
  const d = { cf_type: 'pipo', cf_appui: 'encastre', cf_n: '1', cf_B: '8', cf_H: '5.5', cf_L: '14', cf_Hr: '0.8', cf_franchie: 'route', cf_gabH: '5.6', cf_solSrc: 'pressio', cf_profil: SOL_FAIBLE, cf_et: '0.6', cf_ep: '0.4' };
  const out = calc(d), R = recommandationsCadre(out, d), ind = indicationsParCible(R.items), r = out.blocs[0];
  assert.ok(!r.portance.ok && !r.gabarit.ok);
  for (const v of r.portance.synthese.filter(x => !x.ok)) assert.equal(ind.get(cleCible({ bloc: 0, type: 'portance', fondation: v.fondation, etat: v.etat }))?.champ, 'cf_Bsem');
  r.reserves.forEach((x, i) => assert.ok(ind.get(cleCible({ bloc: 0, type: 'reserve', index: i })), `réserve ${i} : indication`));
  const por = R.items.find(i => /^Portance/.test(i.verification)), Bs = valeur(por, 'cf_Bsem');
  assert.ok(+Bs > 1.2);
  assert.ok(calc({ ...d, cf_Bsem: Bs }).blocs[0].portance.ok, 'semelles élargies : portance OK');
  assert.ok(!calc({ ...d, cf_Bsem: String(+Bs - 0.05) }).blocs[0].portance.ok, 'largeur minimale');
  const gab = R.items.find(i => i.verification === 'Gabarit libre');
  assert.equal(valeur(gab, 'cf_H'), '5.9');
  assert.ok(calc({ ...d, cf_H: '5.9' }).blocs[0].gabarit.ok);
});

test('Réserves : flottaison, biais, radier rigide ; choc sur un piédroit', () => {
  const d = { cf_type: 'picf', cf_n: '1', cf_B: '3', cf_H: '2.5', cf_L: '15', cf_Hr: '0.6', cf_hEau: '1', cf_hNappe: '3.5', cf_biais: '60', cf_sol: 'rigide' };
  const out = calc(d), R = recommandationsCadre(out, d);
  assert.equal(out.blocs[0].reserves.length, 3);
  const flo = R.items.find(i => /Soulèvement/.test(i.verification)), bia = R.items.find(i => i.lieu === 'Biais'), sol = R.items.find(i => /ESOL/.test(i.verification));
  assert.ok(calc({ ...d, cf_er: valeur(flo, 'cf_er') }).blocs[0].flottaison.ok);
  assert.ok(calc({ ...d, cf_Hr: valeur(flo, 'cf_Hr') }).blocs[0].flottaison.ok);
  assert.equal(valeur(bia, 'cf_biais'), '70');
  assert.ok(!calc({ ...d, cf_biais: '70' }).blocs[0].reserves.some(x => /^Biais/.test(x)));
  assert.ok(!calc({ ...d, cf_sol: valeur(sol, 'cf_sol') }).blocs[0].reserves.some(x => /radier rigide/.test(x)));

  const c = { cf_type: 'picf', cf_B: '6', cf_H: '5', cf_L: '12', cf_Hr: '1', cf_franchie: 'route', cf_gabH: '4.5', cf_et: '0.6', cf_er: '0.6', cf_ep: '0.4', cf_chocF: '1500' };
  const oc = calc(c), Rc = recommandationsCadre(oc, c), ch = Rc.items.find(i => /^Choc/.test(i.verification));
  assert.ok(!oc.blocs[0].choc.ok && ch);
  assert.equal(indicationsParCible(Rc.items).get(cleCible({ bloc: 0, type: 'reserve', index: 0 }))?.champ, 'cf_ep');
  assert.ok(calc({ ...c, cf_ep: valeur(ch, 'cf_ep') }).blocs[0].choc.ok);
});

test('Interface : indications « → à modifier » sous chaque NON des tableaux ; la note n\'en reçoit pas', () => {
  const d = { cf_type: 'picf', cf_n: '1', cf_B: '6', cf_H: '4', cf_L: '15', cf_Hr: '3', cf_et: '0.35', cf_er: '0.35', cf_ep: '0.30', cf_hEau: '1.5' };
  const out = calc(d), rec = recommandationsCadre(out, d);
  const tab = cadreBlocks(out, { reco: rec }).find(b => b.t === 'table' && b.head.includes('Verdict') && b.hints);
  tab.rows.forEach((row, i) => assert.equal(!!tab.hints[i], row[row.length - 1] === 'NON', `ligne ${i}`));
  assert.ok(!cadreBlocks(out).some(b => b.hints || b.hint));
});

test('Budget de calcul épuisé : la recherche est laissée au bouton « Calculer » du panneau (même résultat)', async () => {
  const { candidats, dichotomie } = await import('../src/recommandations.js');
  const d = { cf_type: 'pipo', cf_appui: 'encastre', cf_n: '1', cf_B: '8', cf_H: '5.5', cf_L: '14', cf_Hr: '0.8', cf_franchie: 'route', cf_gabH: '5.2', cf_solSrc: 'pressio', cf_profil: SOL_FAIBLE, cf_et: '0.6', cf_ep: '0.4' };
  const out = calc(d), a = recommandationsCadre(out, d, { budget: 0 }).items.find(i => /^Portance/.test(i.verification)).actions.find(x => x.champ === 'cf_Bsem');
  assert.ok(a.chercher && a.chercher.calcul === 'cadre' && a.valeurChamp == null);
  const c = a.chercher, v = await dichotomie(candidats(c), x => c.verifie(calc({ ...d, ...c.base, [c.champ]: String(x) })));   // comme solveReco (web/app.js)
  assert.equal(String(v), valeur(recommandationsCadre(out, d).items.find(i => /^Portance/.test(i.verification)), 'cf_Bsem'));
});
