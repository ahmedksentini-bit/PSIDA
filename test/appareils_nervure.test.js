/**
 * Implantation des appareils d'une dalle à encorbellements (PSI-DA 68 § 2.4.1) : entraxe E/sinψ/(n − 0,1) avec E largeur
 * de la dalle rectangulaire de même inertie (12 I/h³), réduit à E1/sinψ/(n − 0,6), E1 largeur de l'intrados (nervure), si
 * cette valeur est plus faible ; annexe 4 du guide PSIDP-EL : B = largeur de la dalle équivalente pour les chevêtres.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { largeursAppui, bearingSpacing, bearingOrdinates } from '../src/bearings.js';
import { EXEMPLES, donnees } from '../tools/exemples.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { formDefaults } from '../tools/formdefaults.mjs';

const close = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m} : ${a} au lieu de ${b}`);

test('largeur équivalente : rectangle → 2b ; encorbellements → 12 I/h³ calculé à la main', () => {
  assert.deepEqual(largeursAppui({ width: 12, h: 0.7 }), { E: 12, E1: null });
  // nervure 7 × 0,95 + deux encorbellements de 2,5 m de 0,95 à 0,35 m (dessus plan) : inertie par décomposition
  const h = 0.95, hE = 0.35, j = 2.5, bn = 7;
  const parts = [{ A: bn * h, z: -h / 2, I: bn * h ** 3 / 12 }];
  // encorbellement = rectangle j × hE + triangle j × (h − hE) sous lui
  for (let k = 0; k < 2; k++) {
    parts.push({ A: j * hE, z: -hE / 2, I: j * hE ** 3 / 12 });
    const t = h - hE; parts.push({ A: j * t / 2, z: -hE - t / 3, I: j * t ** 3 / 36 });
  }
  const A = parts.reduce((s, p) => s + p.A, 0), zG = parts.reduce((s, p) => s + p.A * p.z, 0) / A;
  const I = parts.reduce((s, p) => s + p.I + p.A * (p.z - zG) ** 2, 0);
  const r = largeursAppui({ width: 12, h, chamfer: { hEdge: hE, joue: j } });
  close(r.E, 12 * I / h ** 3, 2e-4, 'E'); assert.equal(r.E1, 7);
});

test('entraxe : réduit à l\'intrados quand il est plus faible ; rectangle inchangé', () => {
  assert.equal(bearingSpacing({ width: 12, n: 4 }), 12 / 3.9);
  const ch = { hEdge: 0.35, joue: 2.5 };
  close(bearingSpacing({ width: 12, h: 0.95, chamfer: ch, n: 4 }), 7 / 3.4, 1e-12, 'n = 4');
  close(bearingSpacing({ width: 12, h: 0.95, chamfer: ch, n: 2 }), 7 / 1.4, 1e-12, 'n = 2');
  const s = Math.sin(70 * Math.PI / 200);
  close(bearingSpacing({ width: 12, h: 0.95, chamfer: ch, n: 4, psi: 70 }), 7 / s / 3.4, 1e-12, 'biais');
  const y = Math.max(...bearingOrdinates({ width: 12, h: 0.95, chamfer: ch, n: 4 }));
  close(y, 1.5 * 7 / 3.4, 1e-12, 'appareil de rive'); assert.ok(y + 0.2 + 0.05 < 3.5, 'sous la nervure (±3,50 m)');
});

test('exemple 3 du manuel : appareils sous la nervure, chevêtres sur la dalle équivalente, pas d\'alerte', () => {
  const st = compute(parseData(donnees(EXEMPLES[2])));
  assert.equal(st.bearings.chanfrein.length, 0);
  const c = st.chevetres[0], E = largeursAppui({ width: 12, h: st.deck.h, chamfer: st.deck.g.chamfer }).E;
  close(c.a, 7 / 3.4, 1e-9, 'entraxe'); close(c.B, E, 1e-9, 'B = E'); close(c.c, (E - 3 * c.a) / 2, 1e-9, 'c');
});

test('fil rouge sans encorbellement : entraxe 12/3,9 inchangé', () => {
  const st = compute(parseData(formDefaults()));
  close(st.chevetres[0].a, 12 / 3.9, 1e-12, 'entraxe'); assert.equal(st.chevetres[0].B, 12);
});
