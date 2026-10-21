/** Dévers transversal : dalle d'épaisseur variable (aire, inertie, aciers par fibre), revêtement variable, bossages. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionDevers, bandesRevetement, epaisseurDevers } from '../src/devers.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';

test('Section à sous-face horizontale, dévers en toit : aire 2bh − p b², inertie par intégration', () => {
  const dv = { p: 2.5, profil: 'toit', mode: 'dalle' }, b = 6, h = 0.7, s = sectionDevers(b, h, dv, 4000);
  assert.ok(Math.abs(s.A - (2 * b * h - 0.025 * b * b)) < 1e-6);
  // inertie : bornée par celles des rectangles d'épaisseur min et max
  assert.ok(s.I > 2 * b * (h - 0.15) ** 3 / 12 && s.I < 2 * b * h ** 3 / 12);
  assert.ok(Math.abs(epaisseurDevers(h, dv, 6) - 0.55) < 1e-12);
  assert.equal(epaisseurDevers(h, { ...dv, mode: 'inclinee' }, 6), h);
});

test('Revêtement variable : charge totale γ·p·(aire du triangle)', () => {
  const q = bandesRevetement({ p: 2.5, profil: 'toit', mode: 'revetement' }, { y1: -5, y2: 5 }, 50);
  const tot = q.reduce((a, b) => a + b.q * (b.y2 - b.y1), 0);
  assert.ok(Math.abs(tot - 24 * 0.025 * 25) < 1e-6);   // 2 versants × ½ × 5 × 0,125 m
});

test('Calcul complet : dalle à épaisseur variable (poids, aciers de rive) et revêtement variable (charges)', () => {
  const base = compute(parseData(formDefaults()));
  const dal = compute(parseData({ ...formDefaults(), devers: '2.5', devProfil: 'toit', devMode: 'dalle' }));
  const rev = compute(parseData({ ...formDefaults(), devers: '2.5', devProfil: 'toit', devMode: 'revetement' }));
  assert.ok(dal.perm.gTotal < base.perm.gTotal && rev.perm.gTotal > base.perm.gTotal);
  // fibre de rive plus mince : aciers inférieurs requis plus forts à moment égal (au signe près des moments)
  const s = base.deck.beam.sectionIndex(1, 0.5);
  assert.ok(dal.design.EC.perFibre[s][0].bot.Mu > 0);
  assert.ok(Number.isFinite(dal.design.EC.envBot[s]) && Number.isFinite(rev.design.EC.envBot[s]));
});
