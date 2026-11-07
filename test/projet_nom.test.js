/** v0.99.39 : nom du fichier d'un projet enregistré, avec la date et l'heure. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomAvecHorodatage, horodatage } from '../web/projet_nom.js';

test('Enregistrement : date et heure ajoutées au nom, horodatage précédent remplacé', () => {
  const d = new Date(2026, 10, 7, 9, 54, 12);
  assert.equal(horodatage(d), '2026-11-07_09h54');
  assert.equal(nomAvecHorodatage('projet-psida-14-18-14.json', d), 'projet-psida-14-18-14_2026-11-07_09h54.json');
  assert.equal(nomAvecHorodatage('OA67_2026-10-01_17h05.json', d), 'OA67_2026-11-07_09h54.json');
  assert.equal(nomAvecHorodatage('OA67_2026-10-01_17h05 (1).json', d), 'OA67_2026-11-07_09h54.json');
  assert.equal(nomAvecHorodatage(null, d), 'projet-psida_2026-11-07_09h54.json');
});
