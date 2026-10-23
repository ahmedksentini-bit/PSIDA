// Correctifs finaux v0.99 : critère σ_m,min de la NF EN 1337-3 dans le choix automatique des appareils, méthode sismique
// automatique (mode fondamental dans son domaine, multimodale sinon).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectBearing } from '../src/bearings.js';
import * as EC8 from '../src/vendor/pont-ec8.js';

test('selectBearing : sigMinPerm satisfait → même appareil ; non satisfaisable → plus petit appareil signalé « à ancrer »', () => {
  const loads = { Pmax: 900, Pmin: 450, H: 10, ug: 0.01, alpha: 0.004 };
  const a = selectBearing(loads), b = selectBearing(loads, { sigMinPerm: 3 });
  assert.ok(a && b);
  assert.equal(b.label, a.label);
  assert.ok(b.sigPerm >= 3 && !b.ancrageNecessaire);
  const faible = selectBearing({ ...loads, Pmin: 30 }, { sigMinPerm: 3 });
  assert.equal(faible.label, a.label);
  assert.equal(faible.ancrageNecessaire, true);
  assert.ok(faible.sigPerm < 3);
});

test('moteur Pont EC8 embarqué : methodeRetenue exportée, multimodale d\'office pour un tablier étroit', () => {
  assert.equal(typeof EC8.methodeRetenue, 'function');
  const r = { conditions: [{ id: 'L_sur_B', respectee: false, libelle: 'Tablier rigide en transversal', valeur: 'L/B = 4,2' }] };
  assert.equal(EC8.methodeRetenue({ options: {} }, r).methode, 'multimodale');
  assert.equal(EC8.methodeRetenue({ options: { methodeEfforts: 'mode_fondamental' } }, r).methode, 'mode_fondamental');
  assert.equal(EC8.methodeRetenue({ options: {} }, { conditions: [{ id: 'excentricite', respectee: false }] }).methode, 'mode_fondamental');
});
