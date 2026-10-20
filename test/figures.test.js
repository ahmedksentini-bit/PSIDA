/** Schémas dans la représentation du guide SETRA 1989 (onglet Projet, note) et figures de la note globale. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guideElevationSVG, guideCrossSectionSVG } from '../web/guide_schema.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { buildNote } from '../web/note.js';
import { supportsBlocks } from '../web/supports_view.js';

const g = { spans: [14, 18, 14], h: 0.75, width: 12, overhangs: [0.6, 0.6], roadway: { y1: -4, y2: 4 }, footways: [{ y1: -6, y2: -4.5 }, { y1: 4.5, y2: 6 }], chamfer: { hEdge: 0.35, joue: 2.5 }, tirantAir: 5,
  lines: [{ g: 5, e: -5.9, kmin: 1, kmax: 1 }, { g: 6.5, e: 5.3, kmin: 0.8, kmax: 1.2 }], bands: [{ q: 2.6, y1: -4, y2: 4, kmin: 1, kmax: 1 }], ys: [-6, -3, 0, 3, 6] };

test('Élévation au trait : culées remblayées, enterrées, apparentes ; semelles et pieux ; cotes', () => {
  for (const culee of ['remblayee', 'enterree', 'apparente']) for (const found of ['superficielle', 'pieux']) {
    const s = guideElevationSVG(g, { pile: { type: culee === 'remblayee' ? 'voile' : 'colonnes', H: [6, 7], b: 0.6, D: 0.8, hc: 0.9 }, culee: { type: culee, Hm: 4, em: 0.8, hc: 1, lc: 1.6, hv: 1 }, found: { type: found, B: 3, hs: 1, De: 1, pileD: 0.8, Lpile: 15, nFiles: 2, sPile: 2.4 } });
    assert.match(s, /^<svg viewBox="0 0 1000 \d+"/);
    assert.ok(!/NaN|undefined/.test(s), `${culee}/${found} : valeurs invalides`);
    for (const t of ['C0', 'P1', 'P2', 'C3', '14 m', '18 m', '46 m entre appuis extrêmes', 'point fixe', 'H = 7 m']) assert.ok(s.includes(t), `${culee}/${found} : ${t}`);
  }
  assert.match(guideElevationSVG({ spans: [] }), /Saisir les portées/);
});

test('Coupe transversale : encorbellements tramés, charges saisies, voies, cotes', () => {
  const s = guideCrossSectionSVG(g);
  assert.ok(!/NaN|undefined/.test(s));
  for (const t of ['2b = 12 m', 'chaussée 8 m', '2,5 m', 'q = 2,6 kN/m²', 'g = 6,5 kN/m @ y = 5,3 (k 0.8/1.2)', 'url(#g89enc)', 'trottoir', 'voies EN 1991-2']) assert.ok(s.includes(t), t);
  const r = guideCrossSectionSVG({ ...g, chamfer: null }, { loads: false });
  assert.ok(!r.includes('kN/m') && !r.includes('g89enc"/>') && r.includes('2b = 12 m'));
});

test('Note globale et onglet Appuis : figures du tablier et des appuis', () => {
  for (const found of ['superficielle', 'pieux']) {
    const d = { ...formDefaults(), ap_found: found, ap_eau: 'on' };
    const st = compute(parseData(d));
    for (const ref of ['F61', 'EC']) {
      const svgs = buildNote(st, { ref }).blocks.filter(b => b.t === 'svg');
      const caps = svgs.map(b => b.caption).join(' | ');
      for (const k of ['guide SETRA', 'Coupe transversale', 'Lignes d\'influence', 'Enveloppes des moments', 'Enveloppes des efforts tranchants', 'Réactions d\'appui', 'Sections d\'acier', 'Plan de ferraillage', 'Raideurs des lignes', 'fût, chevêtre, semelle']) assert.ok(caps.includes(k), `${found}/${ref} : ${k}`);
      assert.ok(caps.includes(found === 'pieux' ? 'pieu le plus sollicité' : 'contraintes sous la semelle'), `${found}/${ref} : figure de fondation`);
      for (const b of svgs) assert.ok(!/NaN/.test(b.svg), `${b.caption} : NaN`);
    }
    assert.ok(supportsBlocks(st.supports, 'EC').filter(b => b.t === 'svg').length >= 4);
    assert.equal(supportsBlocks(st.supports, 'EC', { noFigures: true }).filter(b => b.t === 'svg' && /fût, chevêtre/.test(b.caption)).length, 0);
  }
});

test('Chapitre sismique : spectres de réponse, spectre en déplacement, efforts par appui ; LaTeX sans % non échappé', async () => {
  const { seismicBlocks } = await import('../web/seismic_note.js');
  const st = compute(parseData({ ...formDefaults(), ap_seisme: 'on' }));
  const B = seismicBlocks(st.supports.seisme);
  const caps = B.filter(b => b.t === 'svg').map(b => b.caption).join(' | ');
  for (const k of ['Spectres de réponse', 'Spectre élastique en déplacement', 'Efforts sismiques par appui']) assert.ok(caps.includes(k), k);
  assert.ok(/T_x LBDP = /.test(B.find(b => /Spectres de réponse/.test(b.caption || '')).svg), 'périodes marquées sur le spectre');
  for (const b of B.filter(b => b.t === 'math')) assert.ok(!/(^|[^\\])%/.test(b.tex), `% non échappé : ${b.tex}`);
  assert.ok(!B.some(b => b.t === 'math' && /^\s*:/.test(b.tex)), 'deux-points orphelin');
});

test('Fondations : Ménard, bulbe de Boussinesq et plans de ferraillage tracés à partir des résultats', async () => {
  const { boussinesqRect, pileBars, pileHoops } = await import('../web/fond_plans.js');
  // Boussinesq-Newmark : 0,25 q sous le coin d'un grand rectangle, centre d'une semelle 4 × 13 à z = 2 m ≈ 0,81 q
  assert.ok(Math.abs(boussinesqRect(0, 1e-3, 4, 13) - 1) < 1e-3);
  assert.ok(Math.abs(boussinesqRect(0, 2, 4, 13) - 0.81) < 0.01);
  assert.ok(Math.abs(boussinesqRect(2, 1e-3, 4, 1e4) - 0.5) < 1e-2);
  // pieu Ø 0,80 : minimum 25,1 cm² → 8 HA20 ; cerces 8 cm²/m (deux brins) → HA12 e = 25 ou équivalent plus léger
  const lb = pileBars(25.1e-4, 0.8); assert.deepEqual([lb.n, lb.phi], [8, 20]);
  const hp = pileHoops(8e-4, 20); assert.ok(hp.As >= 8e-4 && hp.phi >= 10);
  for (const found of ['superficielle', 'pieux']) {
    const st = compute(parseData({ ...formDefaults(), ap_found: found }));
    for (const ref of ['F61', 'EC']) {
      const svgs = supportsBlocks(st.supports, ref).filter(b => b.t === 'svg');
      const caps = svgs.map(b => b.caption).join(' | ');
      const att = found === 'superficielle' ? ['découpage de Ménard', 'bulbe des contraintes', 'plan de ferraillage de la semelle'] : ['plan de ferraillage d\'un pieu', 'semelle sur deux files de pieux'];
      for (const k of att) assert.ok(caps.includes(k), `${found}/${ref} : ${k}`);
      for (const b of svgs) assert.ok(!/NaN|undefined|Infinity/.test(b.svg), `${b.caption} : valeur invalide`);
    }
  }
});

test('Chevêtres incorporés : barres par bande dans la nomenclature et sur la coupe sur appui', async () => {
  const { crossRebarSVG } = await import('../web/rebarplan.js');
  const st = compute(parseData(formDefaults()));
  const ch = st.rebar.chevMarks, cb = st.rebar.chevBands;
  assert.equal(cb.length, 5 * st.chevetres.length, 'cinq bandes par ligne d\'appui');
  // annexe 4 § 6.2 : section « au moins » égale à celle de la bande, en enveloppe avec les transversaux courants
  for (const q of cb) assert.ok(q.Acour + (q.mark ? q.mark.As ?? (q.mark.provided - q.Acour) : 0) + 1e-9 >= q.req, `${q.support} ${q.band}`);
  for (const m of ch) { assert.ok(m.provided + 1e-9 >= m.req && m.count >= 1 && m.len > 0, m.label); assert.ok(st.rebar.marks.includes(m)); }
  assert.ok(ch.length >= 1, 'au moins un complément sur pile');
  const s = crossRebarSVG(st.deck, st.rebar, st.deck.beam.x0[1], 'Coupe — appui P1');
  assert.ok(s.includes('Chevêtre incorporé') && !/NaN|undefined/.test(s));
  assert.ok(!crossRebarSVG(st.deck, st.rebar, st.deck.beam.x0[0] + st.deck.spans[0] / 2, 'mi-travée').includes('Chevêtre incorporé'));
});
