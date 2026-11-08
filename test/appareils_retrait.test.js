/**
 * Chevêtres incorporés : appareils de rive « en fort retrait » des bords libres (guide PSIDP-EL, annexe 4 § 1 : calcul
 * des chevêtres à corriger manuellement). Critère de PSIDA : c > 2a/3 (≈ 1,5 fois la console régulière c = 0,45 a de
 * PSI-DA 68 § 2.4.1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retraitRive } from '../src/chevetre.js';
import { EXEMPLES, donnees } from '../tools/exemples.mjs';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { recommandations } from '../src/recommandations.js';

const reco = st => recommandations(st).items.filter(i => /fort retrait/.test(i.verification));

test('critère : disposition régulière PSI-DA 68 (c = 0,45 a) non signalée ; c > 2a/3 signalé', () => {
  assert.equal(retraitRive({ a: 3, c: 0.45 * 3, n: 4 }).fort, false);
  assert.equal(retraitRive({ a: 3, c: 2.0, n: 4 }).fort, false, 'c = 2a/3 exactement : limite');
  assert.equal(retraitRive({ a: 3, c: 2.01, n: 4 }).fort, true);
});

test('exemple fil rouge (avec et sans chanfreins de 1 m) : aucune alerte', () => {
  for (const d of [formDefaults(), { ...formDefaults(), hEdge: '0.40', joue: '1' }]) {
    const st = compute(parseData(d));
    assert.ok(st.chevetres.every(r => r.retrait && !r.retrait.fort));
    assert.equal(reco(st).length, 0);
  }
});

test('exemple 3 (2b = 12 m, encorbellements de 2,5 m, Guyon-Massonnet) : alerte et recommandation « plaque »', () => {
  const st = compute(parseData(donnees(EXEMPLES[2])));
  assert.ok(st.chevetres.every(r => r.retrait.fort && r.retrait.c > r.retrait.limite));
  const R = reco(st);
  assert.equal(R.length, 1);
  assert.ok(R[0].actions.some(a => a.champ === 'methodeTablier' && a.valeur === 'plaque'));
});

test('exemple 4 (plaque) : retrait signalé pour information, sans recommandation (chevêtres lus sur la plaque)', () => {
  const st = compute(parseData(donnees(EXEMPLES[3])));
  assert.ok(st.chevetres[0].plaque);
  assert.ok(st.chevetres.every(r => r.retrait.fort));
  assert.equal(reco(st).length, 0);
});
