/**
 * Cadres et portiques : compression du béton à l'ELS (BAEL 91 A.4.5,2 ; EN 1992-1-1 § 7.2(2) et (3)), absente du
 * module porté de BVTrace jusqu'à la version 0.99.44 (point ouvert n° 2 de docs/validation/invariants.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sigmaBetonEls } from '../src/cadre/sections.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseCadre, computeCadre } from '../src/cadre/run.js';

test('σ_bc d\'une section fissurée de 1 m (n = 15) : calcul à la main', () => {
  // M = 10 t·m/ml = 0,1 MN·m, d = 0,45 m, A_s = 20 cm²/ml : n A = 0,03 m², x = −0,03 + √(0,03² + 2 × 0,03 × 0,45)
  const nA = 0.03, x = -nA + Math.sqrt(nA * nA + 2 * nA * 0.45), I = x ** 3 / 3 + nA * (0.45 - x) ** 2, ref = 0.1 * x / I;
  assert.ok(Math.abs(sigmaBetonEls(10, 0.45, 20) - ref) < 1e-12);
  assert.ok(Math.abs(ref - 3.609) < 5e-3, `≈ 3,61 MPa (${ref})`);
  assert.equal(sigmaBetonEls(0, 0.45, 20), 0);
  assert.ok(sigmaBetonEls(10, 0.45, 40) < sigmaBetonEls(10, 0.45, 20), 'plus d\'aciers tendus, moins de compression');
  assert.ok(sigmaBetonEls(10, 0.55, 20) < sigmaBetonEls(10, 0.45, 20), 'plus de hauteur utile, moins de compression');
});

test('cadre par défaut (BAEL) : σ_bc vérifiée sur toutes les sections, ouvrage inchangé', () => {
  const b = computeCadre(parseCadre(formDefaults())).blocs[0];
  assert.ok(b.sections.every(s => s.beton && Number.isFinite(s.beton.sig) && s.beton.ok && s.beton.lim === 15));
  assert.equal(b.ok, true);
});

test('Eurocode 2 : contrainte caractéristique (0,6 f_ck) et quasi permanente (0,45 f_ck, permanents seuls)', () => {
  const b = computeCadre(parseCadre({ ...formDefaults(), cf_code: 'EC2' })).blocs[0];
  for (const s of b.sections) {
    assert.ok(Number.isFinite(s.beton.sigQp) && s.beton.limQp === 0.45 * 25);
    assert.ok(s.beton.sigQp <= s.beton.sig + 1e-9, `${s.barre} ${s.ou} : quasi permanent ≤ caractéristique`);
  }
});

test('σ_bc gouverne : portique 1,98 × 5,33 m sous 4,73 m de remblai — sections en échec, alerte et recommandation', async () => {
  const d = { ...formDefaults(), cf_type: 'pipo', cf_n: '1', cf_B: '1.98', cf_H: '5.33', cf_Hr: '4.73', cf_biais: '100', cf_code: 'BAEL' };
  const out = computeCadre(parseCadre(d)), b = out.blocs[0];
  const ko = b.sections.filter(s => !s.beton.ok);
  assert.ok(ko.length > 0 && ko.every(s => s.echec && s.beton.sig > 15));
  assert.ok(b.alertes.some(a => /σ_bc = .* > 0,6 f_c28/.test(a)));
  const { recommandationsCadre } = await import('../src/reco/cadre.js');
  const items = recommandationsCadre(out, d, { budget: 200 });
  assert.ok(JSON.stringify(items).includes('béton trop comprimé à l\'ELS'));
});
