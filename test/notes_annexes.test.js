/** v0.99.34 : dalles de transition dans la note du pont, murs en aile dans la note du cadre. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseData, compute } from '../src/pipeline.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseCadre, computeCadre } from '../src/cadre/run.js';
import { dalleTransitionBlocks, mursAileBlocks } from '../web/notes_annexes.js';
import { buildNote, noteToHTML } from '../web/note.js';
import { cadreNote } from '../web/cadre_view.js';
import { dalleTransitionCulee } from '../src/plans/dalle_transition.js';
import { ailesCadre } from '../src/plans/murs_aile.js';

const st = compute(parseData(formDefaults()));

test('Note du pont : chapitre « Dalles de transition » par culée, chiffres identiques au plan APP-DT', () => {
  const B = dalleTransitionBlocks(st);
  assert.equal(B.filter(b => b.t === 'h2').length, 2);
  const D = dalleTransitionCulee(st, 0);
  const tab = B.find(b => b.t === 'table' && b.head[0] === 'Vérification');
  assert.ok(tab.rows[0][1].includes(`HA${D.K.inf.phi}`) && tab.rows.every(r => r[3] === 'OK'));
  for (const ref of ['F61', 'EC']) {
    const N = buildNote(st, { ref });
    assert.ok(N.blocks.some(b => b.t === 'h1' && /Dalles de transition/.test(b.text)));
    assert.match(noteToHTML(N, { base: '' }), /Dalle de transition — culée C0/);
  }
  // pont sans dalle de transition : pas de chapitre
  const s2 = compute(parseData({ ...formDefaults(), ap_dalleGG: 'non' }));
  assert.equal(dalleTransitionBlocks(s2).length, 0);
  assert.ok(!buildNote(s2, { ref: 'EC' }).blocks.some(b => b.t === 'h1' && /Dalles de transition/.test(b.text)));
});

test('Note du cadre : chapitre « Murs en aile » (implantation, surfaces vues, voile, semelle) et références renumérotées', () => {
  const c = computeCadre(parseCadre({ cf_type: 'picf', cf_biais: '70', cf_L: '15' }));
  const N = cadreNote(c), h1 = N.blocks.filter(b => b.t === 'h1').map(b => b.text);
  assert.deepEqual(h1, ['1. Calcul de structure', '2. Murs en aile', '3. Références']);
  const A = ailesCadre(c), B = mursAileBlocks(c);
  const t = B.find(b => b.t === 'table' && b.head[0] === 'Aile');
  assert.equal(t.rows.length, 4);
  assert.ok(t.rows.some(r => r[1].startsWith('aigu')) && t.rows.some(r => r[1].startsWith('obtus')));
  assert.ok(B.some(b => b.t === 'table' && b.rows.some(r => r[0] === 'Verdict' && (A.calc.ok ? /satisfaites/.test(r[1]) : /NON/.test(r[1])))));
  assert.ok(N.blocks.some(b => b.t === 'ref' && /Guide de conception, décembre 1992/.test(b.text)));
  // murs non demandés : chapitre absent
  const c2 = computeCadre(parseCadre({ cf_type: 'picf', cf_ailes: 'non' }));
  assert.deepEqual(cadreNote(c2).blocks.filter(b => b.t === 'h1').map(b => b.text), ['1. Calcul de structure', '2. Références']);
  // angle saisi
  assert.match(mursAileBlocks(computeCadre(parseCadre({ cf_type: 'picf', cf_aileAng: '30' })))[1].text, /angle saisi θ = 30/);
});
