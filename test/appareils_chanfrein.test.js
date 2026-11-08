/**
 * Pont-dalle : alerte « appareil de rive sous le chanfrein » (guide Ponts-dalles 1989, § 3.6.1 : appareil sur bossage
 * horizontal sous la sous-face pleine, 5 cm de débord). Règle : |y| + b/2 + 5 cm ≤ b_dalle − joue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appareilsSousChanfrein, bearingOrdinates } from '../src/bearings.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { recommandations } from '../src/recommandations.js';

test('règle géométrique : 2b = 7 m, 2 appareils, joue 1,5 m → alerte (y = ±2,06 > 2,0) ; joue 1 m → aucune', () => {
  const y = Math.max(...bearingOrdinates({ width: 7, n: 2 }));
  assert.ok(Math.abs(y - 7 / 1.7 / 2) < 1e-12 && y > 2.0);
  const rows = [{ sel: { bd: { a: 300, b: 400 } } }, { sel: { bd: { a: 300, b: 400 } } }];
  const ko = appareilsSousChanfrein({ width: 7, n: 2, chamfer: { joue: 1.5, hEdge: 0.4 }, rows });
  assert.equal(ko.length, 2);
  assert.ok(Math.abs(ko[0].bord - (y + 0.2 + 0.05)) < 1e-12 && ko[0].limite === 2);
  assert.deepEqual(appareilsSousChanfrein({ width: 7, n: 2, chamfer: { joue: 1.0, hEdge: 0.4 }, rows }), []);
  assert.deepEqual(appareilsSousChanfrein({ width: 7, n: 2, chamfer: undefined, rows }), [], 'sans chanfrein');
});

test('exemple fil rouge avec chanfreins de 1 m : aucune alerte', () => {
  const st = compute(parseData({ ...formDefaults(), hEdge: '0.40', joue: '1' }));
  assert.ok(Array.isArray(st.bearings.chanfrein));
  assert.equal(st.bearings.chanfrein.length, 0);
});

test('tablier de 7 m, 2 appareils par ligne, chanfreins de 1,5 m : depuis 0.99.48, appareils sous la nervure, aucune alerte', () => {
  const st = compute(parseData({ ...formDefaults(), width: '7', roadway: '-2.5, 2.5', footways: '', nBearings: '2', hEdge: '0.40', joue: '1.5' }));
  assert.equal(st.bearings.chanfrein.length, 0);
});

test('nervure étroite et 4 appareils par ligne (7 m, chanfreins de 1,5 m) : alerte et recommandation', () => {
  const st = compute(parseData({ ...formDefaults(), width: '7', roadway: '-2.5, 2.5', footways: '', nBearings: '4', hEdge: '0.40', joue: '1.5' }));
  assert.ok(st.bearings.chanfrein.length >= 1, 'appareils de 400 mm des piles : bord à 2,01 > 2,00 m');
  const { items } = recommandations(st);
  const it = items.find(x => /chanfreins/.test(x.verification || ''));
  assert.ok(it, 'recommandation présente');
  assert.ok(it.actions.some(a => a.champ === 'joue'));
});
