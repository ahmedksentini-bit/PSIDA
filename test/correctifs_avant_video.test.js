// Correctifs avant l'enregistrement de la vidéo : tête de voile élargie pour la diffusion sous les appareils, appareil
// glissant quand aucun élastomère ne vérifie la NF EN 1337-3, avertissement « fondations profondes », graduations bornées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseSupports } from '../src/pipeline.js';
import { parseStandalone, computeStandalone } from '../src/supports/standalone.js';
import { computePhasage, computeMixte } from '../web/phasage_view.js';
import { champsAppuisPhasage } from '../web/transfert_appuis.js';
import { lineChart, barChart, etendueTracable } from '../web/note_figures.js';
import { toPontEC8 } from '../src/ec8export.js';

const d0 = { ...formDefaults() };
const calc = (ch, extra = {}) => { const d = { ...d0, ...ch, ...extra }; return computeStandalone(parseStandalone(d), parseSupports(d)); };

test('mixte : tête de voile élargie pour que la diffusion sous les grands appareils passe', () => {
  const st = calc(champsAppuisPhasage(computeMixte({ ph_type: 'mixte' })));
  const S = st.supports;
  assert.equal(S.sp.pile.bTopAuto, 'diffusion');
  assert.ok(S.sp.pile.bTop > S.sp.pile.b);
  for (const L of S.lines.filter(l => l.kind === 'pile')) for (const k of ['EC', 'BAEL']) assert.ok(L[k].headChk.pressDiff.ok, `${k} ligne ${L.i}`);
  // tête donnée par l'utilisateur : jamais modifiée
  const st2 = calc(champsAppuisPhasage(computeMixte({ ph_type: 'mixte' })), { ap_pileBtop: '0.6' });
  assert.equal(st2.supports.sp.pile.bTop, 0.6);
});

test('fléau : appareil glissant quand aucun élastomère ne vérifie la NF EN 1337-3 ; fondations profondes conseillées', () => {
  const st = calc(champsAppuisPhasage(computePhasage({ ph_type: 'fleau' })));
  const S = st.supports, glis = S.lines.filter(l => l.appareilGlissant);
  // les lignes passées en glissant ne portent plus d'élastomère et le disent ; une ligne au moins reste tenue
  for (const L of glis) {
    assert.equal(L.liaison, 'glissant');
    assert.ok(L.warnings.some(w => /appareil glissant guidé retenu/.test(w)));
  }
  assert.ok(glis.length >= 1);
  // export Pont EC8 : appareils glissants guidés (bloqués en travers), les autres sans butée
  const pr = toPontEC8({ ...st, supports: S });
  pr.appuis.forEach((a, i) => assert.equal(a.butees.transversales, (S.bearingsRetenus || st.bearings).rows[i].liaison === 'glissant', a.id));
  assert.ok(S.lines.some(l => l.liaison !== 'glissant'));
  for (const L of S.lines) for (const k of ['EC']) { const b = L[k].brg; if (b && !b.error) assert.ok(b.ok || b.proposal || (L[k].brg.rows || []).length, 'élastomère non conforme laissé en place'); }
  // semelle superficielle en échec : avertissement explicite
  for (const L of S.lines) {
    const f = L.EC.found;
    if (f.type === 'superficielle' && (f.worstH > 1 || f.worstV > 1 || !f.excOk)) assert.ok(L.warnings.some(w => /fondations profondes/.test(w)));
  }
});

test('graduations : valeurs énormes, non finies ou étendue négligeable sans boucle sans fin', () => {
  assert.equal(etendueTracable(NaN, 1), null);
  assert.equal(etendueTracable(0, 1e20), null);
  assert.deepEqual(etendueTracable(5, 5), [4, 6]);
  const [a, b] = etendueTracable(1e10, 1e10 + 1e-3); assert.ok(b - a > 1e8);
  const t0 = Date.now();
  assert.equal(lineChart({ series: [{ points: [[0, 1e20], [1, 1e20 + 1e4]] }] }), '');
  assert.ok(lineChart({ series: [{ points: [[0, 1e10], [1, 1e10 + 1e-3]] }], includeZero: false }).startsWith('<svg'));
  assert.equal(barChart({ cats: ['a'], series: [{ values: [1e15], libelle: 'x' }] }), '');
  assert.ok(barChart({ cats: ['a', 'b'], series: [{ values: [3, 5], libelle: 'x' }] }).includes('<rect'));
  assert.ok(Date.now() - t0 < 2000);
});
