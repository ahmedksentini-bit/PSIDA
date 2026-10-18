/**
 * Indice de danger (guide méthodologique Cerema, novembre 2021) : tableaux 1 à 18 et exemple construit à la main.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id11, id12, id13, id15, id21, id31, id32, coefK, niveauRetenue, indiceDanger, chocSurDispositif } from '../src/ddr/indice.js';

test('Sous-indices : bornes des tableaux 1, 4, 5, 7, 9, 11, 12, 16 et 18', () => {
  assert.deepEqual([299, 300, 1499, 1500, 9999, 10000, 59999, 60000].map(id11), [5, 6, 8, 10, 12, 14, 17, 19]);
  assert.deepEqual([Infinity, 1350, 900, 240, 200].map(R => id12({ R, Rm: 240, Rdn: 900 })), [0, 0, 1, 2, 4]);
  assert.deepEqual([3.9, 4, 6.9, 7, 10].map(id13), [0, 2, 2, 4, 6]);
  assert.deepEqual([9, 10, 19.9, 20, 80, 160].map(id15), [null, 1, 1, 2, 4, 5]);
  assert.deepEqual([1.9, 2, 4, 6].map(id21), [0, 1, 3, 5]);
  assert.deepEqual([999, 1000, 10000].map(id31), [0, 4, 8]); assert.deepEqual([0, 25, 26, 76].map(id32), [0, 3, 5, 8]);
  assert.equal(coefK(200, 'long'), 1.8); assert.equal(coefK(1200, 'moyen'), 1.8); assert.equal(coefK(6000, 'local'), 1.8); assert.equal(coefK(6000, 'moyen'), 2.6);
  assert.deepEqual([18, 19, 26, 27, 38, 39].map(i => niveauRetenue(i).niveau), ['N', 'H2 / L2', 'H2 / L2', 'H3 / L3', 'H3 / L3', 'H4b / L4b']);
});

test('Exemple : RN de 8 000 véh/j (12 % PL, moyenne distance) franchissant une autoroute de 40 000 véh/j', () => {
  // T15 = 10 000 → 14 ; R = 700 m sur une T100 (R_m 425, R_dn 1 300) → 2 ; pente 5 % → 2 ; pas de conflit ; L_F = 45 m → 3 ;
  // réseau prioritaire → 0 : ID1 = 21. Chute 7 m → ID2 = 5. Voie franchie 50 000 véh/j → 8 ; PL15 = 1 200 → K = 1,8 :
  // ID3 = 14,4. ID = 21 + 14,4 = 35,4 → 36 → H3.
  const r = indiceDanger({ T: 8000, PL: 960, typePL: 'moyen', R: 700, Rm: 425, Rdn: 1300, pente: 5, LF: 45, vh: 'prioritaire', hc: 7, Tfranchie: 40000, routeImportante: true });
  assert.equal(r.ID1, 21); assert.equal(r.ID2, 5); assert.equal(r.K, 1.8);
  assert.ok(Math.abs(r.ID3 - 14.4) < 1e-9); assert.equal(r.ID, 36); assert.equal(r.niveau, 'H3 / L3');
});

test('Cas particulier voie ferrée (H2 minimal) et effort de choc sur dispositif (EN 1991-2)', () => {
  const r = indiceDanger({ T: 400, PL: 10, typePL: 'local', LF: 15, hc: 3, trains: 4 });
  assert.equal(r.niveauIndice, 'N'); assert.equal(r.niveau, 'H2 / L2');
  const c = chocSurDispositif({ classe: 'C', hDR: 1.0, eDalle: 0.25, dEnc: 1.0 });
  assert.equal(c.F, 400); assert.ok(Math.abs(c.mHorizontal - 400 * (0.9 + 0.125) / 2.5) < 1e-9);
});
