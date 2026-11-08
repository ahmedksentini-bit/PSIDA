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
    // Défaut documenté (non corrigé, docs/validation/invariants.md, point ouvert n° 4) : l'entraxe des appareils
    // 2b/(n − 0,1) est pris sur toute la largeur de la dalle, encorbellements compris ; l'exemple 3 (2b = 12 m, joues de
    // 2,5 m) a donc ses appareils de rive sous les encorbellements, ce que l'alerte de la version 0.99.45 signale.
    const CHANFREIN = 'Position des appareils de rive (chanfreins)';
    const all = recommandations(st).items, items = all.filter(i => i.verification !== CHANFREIN);
    assert.equal(items.length, 0, items.map(i => `${i.lieu} | ${i.verification} | ${i.constat}`).join('\n'));
    if (k === 2) assert.ok(all.some(i => i.verification === CHANFREIN), 'le défaut est corrigé : retirer le filtre ci-dessus et mettre à jour la note de validation');
  });
}

test('Coefficient K des sections à moment de poutre presque nul (abouts) : pas de division par un moment résiduel', () => {
  const st = compute(parseData({ ...donnees(EXEMPLES[2]), bp_actif: '', overhangs: '0.5, 0.5', typeDalle: 'auto' }));
  const K = st.deck.transverseFactors(st.f61.Bc).K;
  assert.ok(Math.max(...K) < 3, `K max = ${Math.max(...K)}`);
});
