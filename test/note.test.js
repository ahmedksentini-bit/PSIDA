/**
 * Note de calcul au format SETRA : chaîne complète (src/pipeline.js) sur l'exemple PSIDA.EL 1984 et comparaison des
 * moments extrêmes pondérés du tableau « moments fléchissants » de la note commentée (t·m → kN·m × 10).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults, PSIDAEL_EXAMPLE } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { buildNote, noteToHTML, noteToDocx } from '../web/note.js';
import * as docx from '../web/vendor/docx.js';

const num = s => Number(String(s).replace(/\s| /g, '').replace(',', '.'));
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PSIDA ${b}, note ${a}`);

const d = { ...formDefaults(), ...PSIDAEL_EXAMPLE };
for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
const st = compute(parseData(d));

test('Note Fascicule 61 : moments extrêmes pondérés de la note PSIDA.EL (ELS / ELU, tassements, A, B, C.E.)', () => {
  const note = buildNote(st, { ref: 'F61' });
  const tabs = note.blocks.filter(b => b.t === 'table' && b.head[2] === 'Charge perm.');
  assert.equal(tabs.length, 4, 'un tableau par travée');
  const row = (t, sec, k = 0) => { const T = tabs[t]; const i = T.rows.findIndex(r => r[0].startsWith(sec)); return T.rows[i + k]; };
  // colonnes : section, x, CP, tassements, A, B, C.E., trottoirs, ELS, ELU, As
  const r25 = row(1, '0,50');
  rel(num(r25[4]), 1556.8, 2e-3, 'A 0,5 L travée 2'); rel(num(r25[5]), 1550.3, 3e-3, 'B 0,5 L travée 2'); rel(num(r25[6]), 2326.1, 3e-3, 'Mc120 0,5 L travée 2');
  rel(num(r25[8]), 3624.1, 2e-3, 'ELS max 0,5 L travée 2'); rel(num(r25[9]), 5079.0, 4e-3, 'ELU max 0,5 L travée 2');
  const r14 = row(0, '0,40');
  rel(num(r14[3]), 200.5, 3e-3, 'tassements 0,4 L'); rel(num(r14[8]), 2916.3, 5e-3, 'ELS max 0,4 L'); rel(num(r14[9]), 4216.4, 5e-3, 'ELU max 0,4 L');
  const p1 = row(0, '1,00', 1);
  rel(num(p1[3]), -501.4, 2e-3, 'tassements appui 2'); rel(num(p1[6]), -1699.0, 3e-3, 'Mc120 appui 2');
  rel(num(p1[8]), -3927.1, 2e-3, 'ELS min appui 2'); rel(num(p1[9]), -5958.1, 2e-3, 'ELU min appui 2');
  // positions des surcharges : la travée 1 à 0,4 L est gouvernée par Bt (note : « BT DG 3,90 »)
  const pos = note.blocks.find(b => b.t === 'table' && b.head[3] && b.head[3].startsWith('Surcharge B'));
  assert.ok(pos.rows.find(r => r[0].startsWith('0,40'))[3].startsWith('Bt'), 'Bt gouverne à 0,4 L');
});

test('Note : rendu HTML et Word (.docx), référentiel Eurocodes', async () => {
  for (const ref of ['F61', 'EC']) {
    const note = buildNote(st, { ref });
    const html = noteToHTML(note);
    assert.ok(html.includes('<table') && html.includes('Commentaire'), 'HTML');
    const buf = await noteToDocx(note, docx, { asBuffer: true });
    assert.ok(buf.length > 5000 && buf[0] === 0x50 && buf[1] === 0x4b, 'docx (archive zip)');
  }
});
