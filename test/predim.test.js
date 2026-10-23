// Prédimensionnement des ouvrages par phases : règles du Sétra et affinage par le calcul complet
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predimContinues, predimFleau, predimMixte, affiner } from '../src/phasage/predim.js';
import { computePhasage, computeMixte } from '../web/phasage_view.js';

const S = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));

test('règles : élancements et épaisseurs des guides', () => {
  const c = predimContinues({ L: 30 }).champs;
  assert.ok(Math.abs((c.ph_H + c.ph_hd) - 30 / 18) <= 0.06, 'h ≈ L/18');
  assert.ok(c.ph_bt >= 0.6 * (c.ph_H + c.ph_hd) - 0.05 && c.ph_bb >= 0.6 && c.ph_bb <= 0.9);
  const f = predimFleau({ a: 50 }).champs;
  assert.ok(Math.abs(f.fl_hp - 100 / 17) <= 0.05 && Math.abs(f.fl_hc - Math.max(2.2, 100 / 35)) <= 0.05, 'h_p = L/17, h_c = L/35');
  assert.equal(f.fl_bw, 0.5, 'âmes 26 + L/5 = 46 cm, arrondi aux 5 cm supérieurs');
  assert.ok(f.fl_tcl >= f.fl_nv * 7 + 3, 'clavage après le dernier voussoir');
  const m = predimMixte({ L: [40, 50, 40], B: 12 }).champs;
  assert.ok(Math.abs(m.mx_e - 0.55 * 12) <= 0.06, 'entraxe 0,55 B');
  assert.ok(m.mx_ttfi >= 25 && m.mx_ttfi <= 150 && m.mx_atw >= m.mx_ttw);
});

test('poutres continues et fléau : les propositions passent les vérifications de l\'ouvrage terminé', () => {
  const pc = predimContinues({ L: 28 });
  const o = computePhasage({ ph_type: 'poutres', ph_L: '28', ph_nP: '4', ph_Lr: '8', ph_trott: '1', ...S(pc.champs) });
  assert.ok(o.acheve.ok, o.acheve.verifs.filter(q => !q.ok).map(q => q.nom).join(', '));
  const pf = predimFleau({ a: 45 });
  const f = computePhasage({ ph_type: 'fleau', fl_a: '45', fl_Lr: '10', fl_ccAp: '28.5', fl_ccP0: '4000', ...S(pf.champs) });
  assert.ok(f.acheve.ok, f.acheve.verifs.filter(q => !q.ok).map(q => q.nom).join(', '));
});

test('mixte : affinage par le calcul jusqu\'à satisfaire toutes les vérifications', async () => {
  const P = predimMixte({ L: [30, 40, 30] });
  const r = await affiner('mixte', P.champs, { ph_type: 'mixte', mx_L: '30, 40, 30' }, computeMixte, { maxIt: 20 });
  assert.ok(r.ok, r.restants.map(q => q.nom).join(', '));
  assert.ok(r.journal.length >= 1, 'au moins un renforcement');
  // seules des dimensions croissent
  for (const k of Object.keys(P.champs)) if (typeof P.champs[k] === 'number' && k !== 'mx_thw' && k !== 'mx_ahw') assert.ok(r.champs[k] >= P.champs[k] - 1e-9, k);
});
