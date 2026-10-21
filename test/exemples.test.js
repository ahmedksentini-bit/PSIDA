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
    const items = recommandations(st).items;
    assert.equal(items.length, 0, items.map(i => `${i.lieu} | ${i.verification} | ${i.constat}`).join('\n'));
  });
}

test('Coefficient K des sections à moment de poutre presque nul (abouts) : pas de division par un moment résiduel', () => {
  const st = compute(parseData({ ...donnees(EXEMPLES[2]), bp_actif: '', overhangs: '0.5, 0.5', typeDalle: 'auto' }));
  const K = st.deck.transverseFactors(st.f61.Bc).K;
  assert.ok(Math.max(...K) < 3, `K max = ${Math.max(...K)}`);
});
