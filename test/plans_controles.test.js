/** v0.99.29 : notes de durabilité par partie et contrôles automatiques des plans (relecture des plans A640). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { controlesPlans } from '../src/plans/controles.js';
import { bordereau, longueurCoupe } from '../src/plans/bordereau.js';
import { reperesAppui } from '../src/plans/ferraillageAppuis.js';
import { planCoffrage } from '../src/plans/coffrage.js';
import { planCoffrageAppui } from '../src/plans/appuis.js';
import { planFerraillageAppui } from '../src/plans/ferraillageAppuis.js';
import { texteRecouvrements, notesDurabiliteTablier } from '../src/plans/notes_durabilite.js';

const st = compute(parseData({ ...formDefaults(), cover: '0.055', ap_zone: '1' }));

test('Contrôles des plans : tout OK sur l\'exemple par défaut (barres ≤ 12 m après découpage, enrobages = c_nom)', () => {
  const C = controlesPlans(st);
  assert.ok(C.length >= 10);
  assert.deepEqual(C.filter(c => !c.ok).map(c => `${c.objet} : ${c.controle}`), []);
  assert.ok(bordereau(st).every(l => l.code === '99' || l.L <= 12000));
  for (const i of [0, 1]) for (const q of reperesAppui(st, i).marks) if (q.code !== '99') assert.ok(longueurCoupe(q.code, q.dims, q.phi) <= 12000 + 1e-6, `appui ${i} repère ${q.mark}`);
});

test('Contrôles des plans : enrobage insuffisant et béton trop faible détectés', () => {
  const s2 = compute(parseData({ ...formDefaults(), cover: '0.03', ap_zone: '1', fck: '25' }));
  const C = controlesPlans(s2), non = C.filter(c => !c.ok).map(c => c.controle);
  assert.ok(non.includes('Axe des aciers extérieurs')); assert.ok(non.includes('Classe de béton (durabilité)'));
});

test('Notes par partie : expositions, c_nom, axe des aciers, recouvrements en Ø ; pieux 75 mm', () => {
  const N = notesDurabiliteTablier(st);
  assert.match(N[0], /classes d'exposition XC4/); assert.match(N[1], /c_nom = 45 mm/); assert.match(N[1], /5,5 cm/);
  assert.doesNotMatch(JSON.stringify(planCoffrage(st, {})), /à préciser au CCTP/);
  assert.match(JSON.stringify(planCoffrageAppui(st, 0, {})), /pieux 75 mm|semelles \d+ mm/);
  assert.match(JSON.stringify(planFerraillageAppui(st, 0, {})), /l₀ = \d+ Ø/);
  assert.match(texteRecouvrements([12, 16], { fck: 30, fyk: 500 }), /^\d+ Ø \(HA12 à HA16\)$|^\d+ Ø \(HA12\), \d+ Ø \(HA16\)$/);
});
