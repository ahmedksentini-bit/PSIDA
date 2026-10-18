/** Onglet « Calcul sismique » : efforts reçus de Pont EC8 (iframe) repris par « Appuis et fondations ». */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Efforts de l\'onglet sismique : reprise, contrôle des lignes et des travées', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const { seismicActions, externalSeismic } = await import('../src/supports/index.js');
  const d = { ...formDefaults(), ap_seisme: 'on' };
  const auto = compute(parseData(d)).supports;
  assert.ok(auto.seisme && !auto.seisme.error && auto.seisme.source !== 'onglet');
  // message de l'onglet (même format que psida.ts) : efforts du moteur Pont EC8, travées du projet
  const spans = auto.xs.slice(1).map((x, i) => x - auto.xs[i]);
  const msg = { ...auto.seisme, nom: 'essai', travees: spans, q: { long: 1.5, trans: 1.5 }, site: { zone: 4, categorie: 'III', classeSol: 'C' }, date: new Date().toISOString() };
  const p = parseData({ ...d, ap_seismeSrc: 'onglet' }); p.supports.seisme.externe = msg;
  const S = compute(p).supports;
  assert.equal(S.seisme.source, 'onglet');
  const acc = S.lines[1].EC.base.filter(b => b.ls === 'ACC');
  assert.equal(acc.length, 6, '3 cas × (±Z)');
  assert.match(externalSeismic(null, 4).error, /aucun effort/);
  assert.match(externalSeismic(msg, 5).error, /lignes d'appui/);
  assert.match(externalSeismic({ ...msg, travees: [20, 20, 20] }, auto.xs.length, spans).error, /travées/);
  const { supportsNote, blocksToHTML } = await import('../web/supports_view.js');
  assert.ok(blocksToHTML(supportsNote(S, { ref: 'EC', spans }).blocks).includes('Pont EC8 complet'));
  assert.equal(typeof seismicActions, 'function');
});
