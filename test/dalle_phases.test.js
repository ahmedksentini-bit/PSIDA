/** Pont-dalle coulé par phases successives (src/phasage/dalle_phases.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { donneesDallePhases, dallePhases, modeleDallePhases } from '../src/phasage/dalle_phases.js';

const stBA = compute(parseData(formDefaults())), stBP = compute(parseData({ ...formDefaults(), bp_actif: 'on' }));

test('béton armé : décintrement unique ≈ coulé d\'une traite ; décintrement par phase : adaptation par fluage', async () => {
  const { p } = await donneesDallePhases(stBA, { decintrement: 'final' });
  const Rf = dallePhases(p), Mref = Math.max(...Rf.sections.map(s => Math.abs(s.Mmono)));
  for (const s of Rf.sections) assert.ok(Math.abs(s.dM) < 0.03 * Mref, `${s.nom} : écart ${s.dM}`);
  const Rp = dallePhases({ ...p, decintrement: 'phase' });
  // sur les piles, le fluage rapproche le moment de celui de l'ouvrage coulé d'une traite (sans l'atteindre)
  for (const s of Rp.sections.filter(z => z.type === 'pile')) {
    assert.ok(Math.abs(s.M - s.Mmono) < Math.abs(s.MfinTravaux - s.Mmono), `${s.nom} : ${s.MfinTravaux} → ${s.M} (référence ${s.Mmono})`);
  }
  // reprises près du point de moment nul : moment faible devant celui des piles
  for (const s of Rp.sections.filter(z => z.type === 'reprise')) assert.ok(Math.abs(s.M) < 0.3 * Mref);
});

test('béton précontraint : familles couplées, vérification des coupleurs (EN 1992-2 § 8.10.4)', async () => {
  const { p, q } = await donneesDallePhases(stBP, {});
  assert.ok(p.cable && q);
  const M = modeleDallePhases(p).modele;
  assert.equal(M.cables.length, p.spans.length);
  assert.deepEqual(M.cables.map(c => c.tension), ['deux', ...Array(p.spans.length - 1).fill('droite')]);
  const R = dallePhases(p, q);
  const c = R.verifs.filter(v => /compression résiduelle/.test(v.nom));
  assert.equal(c.length, p.spans.length - 1);
  for (const v of c) assert.equal(v.ok, v.val <= -3);
  const kh = p.h <= 0.3 ? 1 : p.h >= 0.8 ? 0.65 : 1 - 0.35 * (p.h - 0.3) / 0.5;
  assert.ok(Math.abs(R.AsMin - 0.4 * kh * R.fctm * p.A / 2 / 500) < 1e-12);
  // l'effort normal de précontrainte comprime toutes les sections
  for (const s of R.sections) assert.ok(s.N < 0);
});
