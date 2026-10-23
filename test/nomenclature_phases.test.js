import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePhasage } from '../web/phasage_view.js';
import { nomenclatureContinues, nomenclatureVoussoir, planNomenclatureContinues, planNomenclatureVoussoir } from '../src/plans/nomenclature_phases.js';
import { areaOf } from '../src/rebar.js';

const pc = computePhasage({ ph_type: 'poutres', ph_P: '4300', ph_Ap: '33' });
const fl = computePhasage({ ph_type: 'fleau', fl_ccn: '10', fl_ccv: '6', fl_ccAp: '28.5', fl_ccP0: '4000', fl_crn: '6', fl_crv: '4', fl_Lr: '10' });

test('poutres continues : talon et continuité couvrent les sections de l\'ouvrage terminé', () => {
  const N = nomenclatureContinues(pc), elu = pc.acheve.elu, rep = d => N.lignes.find(l => l.desig.startsWith(d));
  const talon = rep('talon'), nT = +talon.desig.match(/(\d+) HA25/)[1];
  assert.ok(nT * areaOf(25) >= Math.max(...elu.map(e => e.AsInf)) - 1e-9);
  const cont = rep('continuité'), m = cont.desig.match(/(\d+) HA(\d+)/);
  assert.ok(+m[1] * areaOf(+m[2]) >= Math.max(...elu.map(e => e.AsCont)) - 1e-9);
  assert.ok(N.R.masse > 0 && N.ratio > 30 && N.ratio < 250, `ratio ${N.ratio}`);
  // masse = somme des lignes
  assert.ok(Math.abs(N.R.masse - N.lignes.reduce((s, l) => s + l.masse, 0)) < 1e-6 * N.R.masse);
});

test('voussoir courant : le cadre d\'âme couvre un brin d\'étrier de l\'effort tranchant', () => {
  const N = nomenclatureVoussoir(fl), ext = N.lignes.find(l => l.desig.startsWith('cadres face extérieure')), m = ext.desig.match(/HA(\d+) \/ ([\d,]+)/);
  const As = areaOf(+m[1]) / (+m[2].replace(',', '.') / 100);
  assert.ok(As >= N.AswCle / 4 - 1e-9);
  assert.ok(N.lignes.every(l => l.L > 0 && l.nombre > 0));
  assert.ok(N.ratio > 60 && N.ratio < 400, `ratio ${N.ratio}`);
});

test('feuilles de nomenclature valides', () => {
  for (const F of [planNomenclatureContinues(pc), planNomenclatureVoussoir(fl)]) assert.deepEqual(F.valide().problemes, []);
});
