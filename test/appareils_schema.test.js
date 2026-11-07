/**
 * Schémas de coupe transversale (saisie et guide) : les appareils d'appui sont dessinés aux ordonnées du calcul
 * (entraxe 2b / (n − 0,1)), et non à 1 m du bord libre, c'est-à-dire sous un chanfrein de 1 m.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearingOrdinates, bearingSpacing } from '../src/bearings.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';

test('ordonnées des appareils : 12 m, 4 appareils → ±1,54 et ±4,62 m', () => {
  const y = bearingOrdinates({ width: 12, n: 4 });
  const e = 12 / 3.9;
  assert.deepEqual(y.map(v => +v.toFixed(3)), [-1.5 * e, -0.5 * e, 0.5 * e, 1.5 * e].map(v => +v.toFixed(3)));
  assert.ok(Math.abs(bearingSpacing({ width: 12, psi: 70, n: 4 }) * Math.sin(70 * Math.PI / 200) - e) < 1e-12, 'indépendant du biais en travers');
});

test('exemple avec chanfreins (h_rive = 0,40, joue = 1 m, § 5) : appareils de rive sous la sous-face pleine, hors du chanfrein', () => {
  const st = compute(parseData({ ...formDefaults(), hEdge: '0.40', joue: '1' }));
  const g = st.deck.g, b = st.deck.b, n = st.bearings.nb;
  const y = bearingOrdinates({ width: 2 * b, n });
  const ch = g.chamfer;
  assert.ok(ch && ch.joue > 0);
  assert.ok(Math.max(...y) < b - ch.joue, `appareil de rive en y = ${Math.max(...y)} < ${b - ch.joue}`);
});
