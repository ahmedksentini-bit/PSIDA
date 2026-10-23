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

test('poutres continues : hourdis calculé (plaque) et repris par la nomenclature', () => {
  const H = pc.acheve.hourdis;
  assert.ok(H && H.inf.As > 0 && H.poinc.ok);
  const N = nomenclatureContinues(pc), t = N.lignes.find(l => l.desig.startsWith('transversales inférieures')), m = t.desig.match(/HA(\d+) \/ ([\d,]+)/);
  assert.ok(areaOf(+m[1]) / (+m[2].replace(',', '.') / 100) >= H.inf.As - 1e-9);
});

test('pont mixte : nomenclature de la dalle', async () => {
  const { computeMixte } = await import('../web/phasage_view.js');
  const { nomenclatureDalleMixte, planNomenclatureDalleMixte } = await import('../src/plans/nomenclature_phases.js');
  const mx = computeMixte({ ph_type: 'mixte' }), N = nomenclatureDalleMixte(mx);
  const t = N.lignes.find(l => l.desig.startsWith('nappe inférieure HA')), m = t.desig.match(/HA(\d+) \/ ([\d,]+)/);
  assert.ok(areaOf(+m[1]) / (+m[2].replace(',', '.') / 100) >= mx.v.dalle.inf.As - 1e-9);
  assert.equal(N.lignes.filter(l => l.element === 'sur appui').length, 2 * (mx.p.L.length - 1));
  assert.ok(N.ratio > 100 && N.ratio < 350, `ratio ${N.ratio}`);
  assert.deepEqual(planNomenclatureDalleMixte(mx).valide().problemes, []);
});

test('fléau : voussoir sur pile (torsion, diaphragme, appareils, ancrages) et nomenclature', async () => {
  const { couplesTrafic } = await import('../src/phasage/voussoir_pile.js');
  const { nomenclatureVoussoirPile, planNomenclatureVoussoirPile } = await import('../src/plans/nomenclature_phases.js');
  // chaussée de 9 m : trois voies de 3 m, excentrements 3, 0, −3 m ; seules les voies du côté chargé comptent
  const C = couplesTrafic(9);
  assert.equal(C.n, 3);
  assert.ok(Math.abs(C.TTS - 2 * 300 * 3) < 1e-9 && Math.abs(C.tU - 9 * 3 * 3) < 1e-9);
  const V = fl.vsp, T = V.torsion, D = V.diaphragme, A = V.appareil;
  assert.ok(Math.abs(T.TEd - 1.35 * (T.TTS + T.tU * (T.Lg + T.Ld) / 2)) < 1e-6);
  assert.ok(Math.abs(T.q - T.TEd / (2 * T.Omega)) < 1e-9);
  assert.ok(D.AsFace >= T.q / (500 / 1.15 * 1000) / 2 - 1e-12 && D.AsFace >= D.AsMinFace - 1e-12);
  assert.ok(Math.abs(A.T - Math.max(0.25 * (A.bx - A.a) / A.bx, 0.25 * (A.by - A.a) / A.by) * A.RELU) < 1e-6);
  assert.ok(V.bossage && Math.abs(V.bossage.tieBack - 0.25 * 1.2 * V.bossage.P) < 1e-9);
  const N = nomenclatureVoussoirPile(fl);
  assert.ok(N.R.masse > 0 && N.lignes.some(l => l.element === 'bossages'));
  assert.deepEqual(planNomenclatureVoussoirPile(fl).valide().problemes, []);
});
