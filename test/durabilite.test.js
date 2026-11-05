/**
 * Durabilité (EN 1992-1-1 § 4.4.1, tableaux 4.3N, 4.4N, E.1N ; NF EN 206/CN) : classe de béton minimale et enrobage
 * nominal, appliqués au pont-dalle, aux poutres BA (plans) et aux cadres. Cas du cadre PIGR1 de la note d'autoroute :
 * C25/30 en XC4 / XA2, enrobage 45 mm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durabilite, lireExpositions } from '../src/durabilite.js';
import { formDefaults } from '../tools/formdefaults.mjs';

test('Tableaux 4.3N / 4.4N / E.1N et NF EN 206/CN', () => {
  assert.deepEqual(lireExpositions('xc4/XA2'), ['XC4', 'XA2']);
  // 100 ans, XC4, C30/37 : S4 + 2 = S6 → c_min,dur 40, c_nom 50
  let D = durabilite({ expo: 'XC4', fck: 30, phi: 16, vie: 100 });
  assert.equal(D.S, 6); assert.equal(D.cminDur, 40); assert.equal(D.cnom, 50); assert.ok(D.okBeton);
  // C40/50 en XC4 : −1 ; dalle : −1 → S4, 30 mm
  D = durabilite({ expo: 'XC4', fck: 40, phi: 16, vie: 100, dalle: true }); assert.equal(D.S, 4); assert.equal(D.cminDur, 30);
  // XD3 : colonne la plus sévère ; 50 ans → S4 → 45 mm, béton C35/45
  D = durabilite({ expo: 'XC4, XD3', fck: 30, phi: 16, vie: 50 }); assert.equal(D.cminDur, 45); assert.equal(D.fckMin, 35); assert.equal(D.okBeton, false);
  // c_min,b = φ prépondérant
  D = durabilite({ expo: 'XC1', fck: 30, phi: 32, vie: 50 }); assert.equal(D.cmin, 32);
  // PIGR1 : C25/30, XC4 / XA2 — C30/37 au moins (EC2 E.1N), C35/45 (NF EN 206/CN, à cause de XA2) ; c_nom = 50 mm > 45 mm
  const P = durabilite({ expo: 'XC4/XA2', fck: 25, phi: 16, vie: 100 }), Pc = durabilite({ expo: 'XC4/XA2', fck: 25, phi: 16, vie: 100, ref: 'CN' });
  assert.equal(P.fckMin, 30); assert.equal(Pc.fckMin, 35); assert.equal(P.cnom, 50); assert.ok(!P.okBeton && !Pc.okBeton);
  assert.equal(durabilite({ expo: 'XC4', fck: 25, ref: 'CN' }).okBeton, true);   // NF EN 206/CN : C25/30 admis en XC4 (50 ans)
});

test('Applications : dalle (enrobage à l\'axe), cadre (au nu), poutres BA (plans à c_nom, lits et hauteur utile)', async () => {
  const { parseData, compute } = await import('../src/pipeline.js');
  const st = compute(parseData({ ...formDefaults(), cover: '0.03' }));
  // dalle à c = 3 cm à l'axe (ancienne valeur par défaut), Ø20 → 20 mm au nu < c_nom = 45 mm (S5) : signalé, recommandation 5,5 cm à l'axe
  assert.equal(st.durab.okEnrobage, false); assert.equal(st.durab.cnom, 45);
  const { reglesTablier } = await import('../src/reco/tablier.js');
  const it = reglesTablier.flatMap(f => f(st)).find(i => /Durabilité/.test(i.verification));
  assert.equal(it.actions[0].champ, 'cover'); assert.equal(it.actions[0].valeurChamp, '0.055');
  const { parseCadre, computeCadre } = await import('../src/cadre/run.js');
  const o = computeCadre(parseCadre({ ...formDefaults(), cf_fc28: '25', cf_enrob: '0.045', cf_expoDur: 'XC4/XA2' }));
  assert.ok(!o.durab.okBeton && !o.durab.okEnrobage);
  const { recommandationsCadre } = await import('../src/reco/cadre.js');
  const { cadreBlocks } = await import('../web/cadre_view.js');
  const rec = recommandationsCadre(o, { ...formDefaults(), cf_fc28: '25', cf_enrob: '0.045', cf_expoDur: 'XC4/XA2' }, { budget: 0 });
  const tab = cadreBlocks(o, { reco: rec }).find(b => b.t === 'table' && b.rows[0] && b.rows[0][0] === 'Classe de résistance du béton');
  tab.rows.forEach((row, i) => assert.equal(!!tab.hints[i], row[3] === 'NON'));
});

test('Séisme non coché en zone 2 à 5, catégorie II à IV : alerte et recommandation ; zone 1 : rien', async () => {
  const { parseData, compute } = await import('../src/pipeline.js');
  const { recommandations } = await import('../src/recommandations.js');
  const st = compute(parseData({ ...formDefaults(), cover: '0.055' }));
  assert.deepEqual([st.supports.alerteSeisme.zone, st.supports.alerteSeisme.categorie], [3, 'III']);
  assert.ok(recommandations(st).items.some(i => i.verification === 'Combinaison sismique'));
  const st1 = compute(parseData({ ...formDefaults(), cover: '0.055', ap_zone: '1' }));
  assert.equal(st1.supports.alerteSeisme, null);
});

test('Anti-cheminement : F_Ed = 1,35 F_xy, coutures A_s = F_Ed/(0,7 f_yd), surface F_Ed/f_cd', async () => {
  const { antiCheminement } = await import('../src/supports/bearings1337.js');
  const a = antiCheminement({ Fxy: 200, fck: 30, fyk: 500 });
  assert.ok(Math.abs(a.FEd - 270) < 1e-9);
  assert.ok(Math.abs(a.As - 270 / (0.7 * 500 / 1.15 * 1000)) < 1e-12);   // 8,87 cm²
  assert.equal(a.nHA16, 5); assert.ok(Math.abs(a.Acontact - 270 / 20000) < 1e-12);
});
