/** Note de calcul globale complète : appuis, piles en rivière, calcul sismique complet (Pont EC8), dispositifs de retenue. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { buildNote, noteToHTML, noteToDocx } from '../web/note.js';
import { parseDDR } from '../web/ddr_view.js';
import { supportsNote } from '../web/supports_view.js';
import { texToText } from '../web/seismic_note.js';
import * as docx from '../web/vendor/docx.js';

test('Note globale : chapitres eau, séisme (note Pont EC8 complète) et dispositifs de retenue, HTML et Word', async () => {
  const d = { ...formDefaults(), ap_seisme: 'on', ap_eau: 'on' };
  const st = compute(parseData(d));
  for (const ref of ['F61', 'EC']) {
    const note = buildNote({ ...st, ddr: parseDDR(d) }, { ref });
    const titles = note.blocks.filter(b => b.t === 'h1').map(b => b.text);
    assert.ok(titles.some(t => /Appuis et fondations/.test(t)));
    assert.ok(titles.some(t => /Piles en rivière/.test(t)), 'chapitre eau');
    assert.ok(titles.some(t => /Calcul sismique/.test(t)), 'chapitre séisme');
    assert.ok(titles.some(t => /Dispositifs de retenue/.test(t)), 'chapitre DDR');
    const iS = note.blocks.findIndex(b => b.t === 'h1' && /Calcul sismique/.test(b.text));
    const seis = note.blocks.slice(iS);
    assert.ok(seis.filter(b => b.t === 'math').length > 100, 'formules de la note Pont EC8');
    assert.ok(seis.some(b => b.t === 'h2' && /Vérifications — Appareils d'appui/.test(b.text)));
    assert.ok(seis.some(b => b.t === 'ref' && /Arrêté du 26\/10\/2011/.test(b.text)));
    // la section eau n'est plus dans le chapitre Appuis
    const iA = note.blocks.findIndex(b => b.t === 'h1' && /Appuis et fondations/.test(b.text)), iW = note.blocks.findIndex(b => b.t === 'h1' && /Piles en rivière/.test(b.text));
    assert.ok(!note.blocks.slice(iA, iW).some(b => b.t === 'h2' && /^Piles en rivière/.test(b.text)));
    const html = noteToHTML(note, { base: 'https://psida.ksr-infra.org' });
    assert.ok(html.includes('katex.min.js') && html.includes('class="math"') && html.includes('Indice de danger'));
    const buf = await noteToDocx(note, docx, { asBuffer: true });
    assert.ok(buf.length > 20000);
  }
  assert.equal(texToText('a_{vg} = 0{,}9 \\times 1{,}32 = \\boldsymbol{1{,}188}\\ \\text{m/s²}'), 'a_vg = 0,9 × 1,32 = 1,188 m/s²');
  // séisme non étudié : chapitre présent avec la mention
  const st2 = compute(parseData(formDefaults()));
  const n2 = buildNote(st2, { ref: 'EC' });
  assert.ok(n2.blocks.some(b => b.t === 'p' && /Séisme non étudié/.test(b.text)));
  // note « appuis et fondations » seule
  const sn = supportsNote(st.supports, { ref: 'EC', spans: st.deck.spans });
  assert.ok(sn.blocks.some(b => b.t === 'h1' && /Calcul sismique/.test(b.text)) && sn.blocks.some(b => b.t === 'h1' && /Piles en rivière/.test(b.text)));
});
