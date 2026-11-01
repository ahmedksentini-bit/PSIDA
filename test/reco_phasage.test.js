/**
 * Recommandations de l'onglet « Phasage » (poutres rendues continues, fléaux, pont mixte) : chaque « NON » reçoit une
 * indication « → à modifier », les valeurs sont cherchées par recalcul complet et, appliquées, font passer les
 * vérifications. Chaque calcul complet prend quelques secondes : les cas ne mettent en défaut qu'une à trois familles.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePhasage, phasageBlocks } from '../web/phasage_view.js';
import { recommandationsPhasage, verifsPhasage, indicationsParCible, cleCible, chercherPhasage, erreursCalcul } from '../src/reco/phasage.js';

// valeurs par défaut du formulaire (index.html), comme un lien partagé ou un projet enregistré
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), DEF = {};
for (const m of html.matchAll(/<input name="((?:ph|fl|mx)_[A-Za-z0-9]+)" value="([^"]*)"/g)) DEF[m[1]] = m[2];
for (const m of html.matchAll(/<select name="((?:ph|fl|mx)_[A-Za-z0-9]+)"><option(?: value="([^"]*)")?>([^<]*)/g)) DEF[m[1]] = m[2] ?? m[3];
const donnees = o => ({ ...DEF, ...o });
const non = out => verifsPhasage(out).filter(v => !v.ok);
const budget = 600000;
// calculs partagés entre les tests (un calcul complet prend quelques secondes)
const memo = new Map();
const calcule = (o, opts = {}) => {
  const k = JSON.stringify([o, opts]);
  if (!memo.has(k)) { const d = donnees(o), out = computePhasage(d); memo.set(k, { d, out, R: recommandationsPhasage(out, d, { budget, ...opts }) }); }
  return memo.get(k);
};

/** Chaque « NON » a son indication, et l'ensemble recommandé, recalculé, ne laisse plus de « NON ». */
function verifierEnsemble(d, R, out) {
  const ind = indicationsParCible(R.items);
  for (const v of non(out)) assert.ok(ind.get(cleCible({ type: v.type, index: v.index })), `${v.nom} : indication`);
  assert.ok(R.items.every(i => i.actions.length && i.regle !== undefined));
  const o2 = computePhasage({ ...d, ...R.modifs });
  assert.deepEqual(non(o2).map(v => v.nom), [], 'plus aucun « NON » avec les valeurs recommandées');
  return o2;
}

test('Poutres continues, précontrainte trop faible : P (et A_p) cherchés par recalcul complet, valeur minimale', () => {
  const { d, out, R } = calcule({ ph_type: 'poutres', ph_P: '3200' }, { variantes: false });
  assert.ok(non(out).some(v => /^Décompression/.test(v.nom)) && non(out).some(v => /^Fréquente : traction/.test(v.nom)));
  const it = R.items.find(i => /^Décompression/.test(i.verification));
  assert.match(it.regle, /7\.101N/); assert.equal(it.famille, 'precontrainte');
  assert.equal(R.modifs.ph_P, '4100'); assert.ok(+R.modifs.ph_Ap >= 33);
  assert.ok(it.actions[0].verifie, 'la vérification passe avec la valeur proposée');
  verifierEnsemble(d, R, out);
  // minimalité : 100 kN de moins, la précontrainte ne suffit plus
  assert.ok(non(computePhasage({ ...d, ...R.modifs, ph_P: '4000' })).length > 0);
});

test('Poutres continues, compression au jeune âge : mise en tension retardée (phases seules recalculées)', () => {
  const d = donnees({ ph_type: 'poutres', ph_eMi: '-0.60', ph_P: '5200', ph_Ap: '40' }), out = computePhasage(d), R = recommandationsPhasage(out, d, { budget });
  const v = non(out).find(q => q.type === 'phase');
  assert.ok(v && /compression/.test(v.nom) && v.age < 28);
  const it = R.items.find(i => i.cibles.some(c => c.type === 'phase'));
  assert.equal(it.famille, 'jeune-age'); assert.equal(it.actions[0].champ, 'ph_t1');
  assert.ok(+R.modifs.ph_t1 > 7 && +R.modifs.ph_t1 <= 28);
  verifierEnsemble(d, R, out);
  // variante : béton de la poutre plus résistant, cherché seul, qui suffit aussi
  const va = it.actions.find(a => a.champ === 'ph_pfck' && a.valeurChamp);
  assert.ok(va && !non(computePhasage({ ...d, ph_pfck: va.valeurChamp })).some(q => q.type === 'phase'));
});

test('Fléaux : câbles de fléau insuffisants (contraintes des phases, décompression, traction au VSP)', () => {
  const { d, out, R } = calcule({ ph_type: 'fleau', fl_cn: '1' });
  const fams = new Set(R.items.map(i => i.famille));
  assert.ok(fams.has('cables-fleau') && fams.has('vsp-traction'));
  assert.equal(R.modifs.fl_cn, '2');
  // la traction au VSP passe avec les câbles cherchés pour les autres vérifications
  const vsp = R.items.find(i => i.famille === 'vsp-traction');
  assert.ok(vsp.cibles.some(c => c.type === 'deseq') && vsp.actions[0].verifie && vsp.actions[0].champs.fl_cn === '2');
  verifierEnsemble(d, R, out);
});

test('Fléaux : compression, diaphragme et appareils d\'appui ; variante cherchée seule ; indications du voussoir sur pile', () => {
  const d = donnees({ ph_type: 'fleau', fl_ediaph: '0.04', fl_tip: '0.15', fl_fck: '35' }), out = computePhasage(d), R = recommandationsPhasage(out, d, { budget });
  const fams = new Set(R.items.map(i => i.famille));
  for (const f of ['compression', 'diaphragme', 'appareil']) assert.ok(fams.has(f), f);
  // le béton cherché pour la compression fait aussi passer le diaphragme (ν f_cd / 2) et l'appareil (f_cd)
  assert.ok(+R.modifs.fl_fck > 35);
  const dia = R.items.find(i => i.famille === 'diaphragme');
  assert.ok(dia.actions[0].verifie && dia.actions[0].champs.fl_fck === R.modifs.fl_fck);
  // variante : épaisseur du diaphragme cherchée seule (f_ck inchangé), qui suffit au diaphragme
  const va = dia.actions.find(a => a.champ === 'fl_ediaph' && a.valeurChamp);
  assert.ok(va && +va.valeurChamp > 0.04);
  const ov = computePhasage({ ...d, fl_ediaph: va.valeurChamp });
  assert.ok(ov.vsp.diaphragme.tau <= ov.vsp.diaphragme.tauLim);
  assert.ok(computePhasage({ ...d, fl_ediaph: String(+(+va.valeurChamp - 0.05).toFixed(2)) }).vsp.diaphragme.tau > ov.vsp.diaphragme.tauLim, 'épaisseur minimale');
  const ind = indicationsParCible(R.items);
  assert.ok(ind.get('vsp|diaphragme') && ind.get('vsp|appareil'));
  verifierEnsemble(d, R, out);
});

test('Pont mixte : armatures minimales sur appui et connexion (goujons par rangée)', () => {
  const d = donnees({ ph_type: 'mixte', mx_rhoa: '0.5', mx_gd: '16', mx_gh: '80', mx_gn: '1' }), out = computePhasage(d), R = recommandationsPhasage(out, d, { budget, variantes: false });
  const arm = R.items.find(i => /^Armatures minimales/.test(i.verification)), cx = R.items.find(i => /^Connexion/.test(i.verification));
  assert.equal(arm.actions[0].champ, 'mx_rhoa'); assert.equal(cx.actions[0].champ, 'mx_gn');
  assert.match(arm.regle, /7\.4\.2/); assert.match(cx.regle, /6\.6\.3\.1/);
  verifierEnsemble(d, R, out);
  // minimalité de chaque valeur (l'autre étant appliquée)
  assert.ok(non(computePhasage({ ...d, ...R.modifs, mx_gn: String(+R.modifs.mx_gn - 1) })).some(v => /^Connexion/.test(v.nom)));
  assert.ok(non(computePhasage({ ...d, ...R.modifs, mx_rhoa: String(+(+R.modifs.mx_rhoa - 0.1).toFixed(1)) })).some(v => /^Armatures minimales/.test(v.nom)));
});

test('Un levier par famille : poinçonnement du hourdis, ELS de l\'acier sur appui (semelle la plus sollicitée), tablier courbe', () => {
  for (const [cas, champ] of [[{ ph_type: 'poutres', ph_hd: '0.10' }, 'ph_hd'], [{ ph_type: 'mixte', mx_atfs: '30', mx_abfs: '0.5' }, 'mx_atfs'], [{ ph_type: 'mixte', mx_R: '300' }, 'mx_atfs']]) {
    const { d, out, R } = calcule(cas, { variantes: false });
    assert.equal(non(out).length, 1, JSON.stringify(cas));
    assert.equal(R.items[0].actions[0].champ, champ, JSON.stringify(cas));
    verifierEnsemble(d, R, out);
  }
});

test('Interface : indications « → à modifier » sous chaque NON des tableaux ; la note n\'en reçoit pas ; sections par valeurs', () => {
  const { out, R: rec } = calcule({ ph_type: 'poutres', ph_P: '3200' }, { variantes: false });
  const B = phasageBlocks(out, { reco: rec }), tabs = B.filter(b => b.t === 'table' && b.hints);
  assert.ok(tabs.length >= 2);
  for (const t of tabs) t.rows.forEach((row, i) => assert.equal(!!t.hints[i], row[t.hintCol ?? row.length - 1] === 'NON', `ligne ${i} : ${row[0]}`));
  assert.match(B[0].text, /non satisfaite/);
  assert.ok(!phasageBlocks(out).some(b => b.hints || b.hint));
  // sections saisies par leurs valeurs : vérifications non faites → « par leurs dimensions »
  const dv = donnees({ ph_type: 'poutres', ph_geo: 'valeurs' }), ov = computePhasage(dv), Rv = recommandationsPhasage(ov, dv);
  assert.equal(Rv.items.length, 1); assert.equal(Rv.items[0].actions[0].valeurChamp, 'dimensions');
  assert.ok(phasageBlocks(ov, { reco: Rv }).some(b => b.hint && b.hint.champ === 'ph_geo'));
});

test('Budget épuisé : la recherche est laissée au bouton « Calculer » (même valeur, sans fonction dans l\'objet)', () => {
  const { d, out } = calcule({ ph_type: 'fleau', fl_cn: '1' }), R = recommandationsPhasage(out, d, { budget: 0 });
  const a = R.items.find(i => i.famille === 'cables-fleau').actions.find(x => x.chercher);
  assert.ok(a && a.chercher.calcul === 'phasage' && a.valeurChamp == null);
  assert.deepEqual(JSON.parse(JSON.stringify(a.chercher)), a.chercher, 'clonable (Web Worker)');
  assert.equal(chercherPhasage(d, a.chercher).champ, '2');
});

// ---------------------------------------------------------------------------------------- revue de la PR n° 12

/** Calcul dont l'ouvrage terminé échoue (exception attrapée → acheveErreur, lignes absentes) pour 2 câbles de fléau. */
const echecSimule = (d, o) => {
  const r = computePhasage(d, o);
  if (r.acheve && +d.fl_cn === 2) { delete r.acheve; delete r.vsp; r.acheveErreur = 'échec simulé'; }
  return r;
};

test('Revue 1 : un essai dont un calcul requis a échoué n\'est jamais une correction suffisante (recherche et « Calculer »)', () => {
  const { d, out } = calcule({ ph_type: 'fleau', fl_cn: '1' });
  assert.deepEqual(erreursCalcul(echecSimule({ ...d, fl_cn: '2' })), ['acheveErreur']);
  // phases seules (acheve omis volontairement) : pas d'erreur
  assert.deepEqual(erreursCalcul(computePhasage({ ...d, fl_cn: '2' }, { acheve: false, annexes: false })), []);
  // sans le contrôle, 2 câbles (phases satisfaites, ouvrage terminé absent) passaient pour une correction suffisante
  const R = recommandationsPhasage(out, d, { budget, variantes: false, calcul: echecSimule });
  assert.equal(R.trace[0], 'cables-fleau → fl_cn = 3');
  assert.notEqual(R.modifs.fl_cn, '2');
  assert.equal(chercherPhasage(d, { levier: 'cn', famille: 'cables-fleau', base: {} }, { calcul: echecSimule }).champ, '3');
});

test('Revue 2 : l\'échéance est testée avant chaque essai ; au-delà, recherche laissée à « Calculer »', () => {
  const d = donnees({ ph_type: 'fleau', fl_cn: '1', fl_crn: '0' }), out = computePhasage(d), appels = [], t0 = Date.now(), b = 1000;
  const R = recommandationsPhasage(out, d, { budget: b, calcul: (dd, o) => { appels.push(Date.now() - t0); return computePhasage(dd, o); } });
  assert.ok(R.epuise);
  // seuls les calculs obligatoires (état d'ensemble, calcul final) peuvent commencer après l'échéance
  assert.ok(appels.filter(t => t > b).length <= 2, `appels : ${appels.join(', ')}`);
  assert.ok(R.items.some(i => i.actions.some(a => a.chercher)), 'recherche laissée au bouton « Calculer »');
});

test('Revue 3 : la synthèse n\'est déclarée réussie que sans aucun échec restant (famille bloquée comprise)', () => {
  const bloque = (d, o) => { const r = computePhasage(d, o); if (r.acheve) r.acheve.verifs.push({ nom: 'Critère simulé sans levier', val: 1, lim: 0, ok: false, ref: 'test', x: 80 }); return r; };
  const d = donnees({ ph_type: 'fleau', fl_cn: '1', fl_crn: '0' }), out = bloque(d), R = recommandationsPhasage(out, d, { budget, variantes: false, calcul: bloque });
  assert.ok(R.bloques.includes('autre'));
  assert.ok(R.synthese, 'deux paramètres cherchés ensemble');
  assert.equal(R.synthese.ok, false);
  const intro = phasageBlocks(out, { reco: R })[0];
  assert.match(intro.hint.texte, /restent à « NON »/);
});

test('Revue 4 : « Calculer » renvoie les valeurs de base avec celle du levier', () => {
  const { d } = calcule({ ph_type: 'fleau', fl_cn: '1' });
  const r = chercherPhasage(d, { levier: 'cn', famille: 'cables-fleau', base: { fl_ccn: '12' } });
  assert.equal(r.champs.fl_ccn, '12'); assert.equal(r.champs.fl_cn, r.champ);
  assert.ok(!non(computePhasage({ ...d, ...r.champs })).some(v => /\b(sup)\)|fibre sup/.test(v.nom)));
});
