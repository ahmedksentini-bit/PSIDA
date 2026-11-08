/** Exemples traités du manuel : calcul de bout en bout sans erreur ni vérification en défaut (non-régression). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXEMPLES, donnees } from '../tools/exemples.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { recommandations } from '../src/recommandations.js';

for (const k of [0, 2]) {   // exemples 1 (courbe, dévers, nivellement, plaque) et 3 (précontrainte) ; 2 et 4 : tools/exemples.mjs
  test(EXEMPLES[k].nom, () => {
    const st = compute(parseData(donnees(EXEMPLES[k])));
    assert.equal(st.supportsError, null); assert.equal(st.psidpError, null); assert.equal(st.rebarError, null);
    // Exemple 3 (2b = 12 m, encorbellements de 2,5 m) : depuis la version 0.99.48, appareils sous la nervure
    // (PSI-DA 68 § 2.4.1, réduction de l'entraxe à l'intrados) — plus aucune recommandation, alerte chanfrein comprise.
    const all = recommandations(st).items;
    assert.equal(all.length, 0, all.map(i => `${i.lieu} | ${i.verification} | ${i.constat}`).join('\n'));
    assert.equal((st.bearings.chanfrein || []).length, 0, 'appareils de rive sous les encorbellements');
  });
}

test('Coefficient K des sections à moment de poutre presque nul (abouts) : pas de division par un moment résiduel', () => {
  const st = compute(parseData({ ...donnees(EXEMPLES[2]), bp_actif: '', overhangs: '0.5, 0.5', typeDalle: 'auto' }));
  const K = st.deck.transverseFactors(st.f61.Bc).K;
  assert.ok(Math.max(...K) < 3, `K max = ${Math.max(...K)}`);
});
