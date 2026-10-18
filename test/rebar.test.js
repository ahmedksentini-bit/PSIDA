/** Plan de ferraillage : choix des barres, ancrages, épure décalée, couverture des aciers requis, métré. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA } from '../src/loads_ec.js';
import { designEC, designTransverseEC } from '../src/design.js';
import { TransverseModel } from '../src/transverse.js';
import { rebarPlan, anchorage, chooseBars, shiftedEnvelope, areaOf } from '../src/rebar.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : attendu ${b}, obtenu ${a}`);

test('ancrage EC2 8.4 et choix des barres', () => {
  // C35 : fctd = 0,7·0,3·35^(2/3)/1,5 = 1,498 ; fbd = 2,25 fctd = 3,37 MPa ; l_b,rqd HA20 = 0,02/4 × 434,8/3,37 = 0,645 m
  const a = anchorage(20, { fck: 35, fyk: 500 });
  rel(a.fbd, 2.25 * 0.7 * 0.3 * Math.pow(35, 2 / 3) / 1.5, 1e-9, 'f_bd'); rel(a.lbd, 0.645, 0.01, 'l_bd HA20'); rel(a.l0, 1.5 * a.lbd, 1e-9, 'l₀ = 1,5 l_bd');
  rel(anchorage(20, { top: true, h: 0.75 }).lbd, a.lbd / 0.7, 1e-9, 'nappe supérieure η₁ = 0,7');
  const c = chooseBars(20e-4, { phiMin: 12, sMax: 0.25 });
  assert.ok(c.As >= 20e-4 && c.s <= 0.25); rel(areaOf(20) / 0.15, 20.94e-4, 1e-3, 'HA20 e=15');
  assert.deepEqual(shiftedEnvelope([0, 1, 2, 3], [0, 5, 0, 0], 1), [5, 5, 5, 0]);
  // pas de sections (0,9 m) supérieur à a_l (0,65 m) : bornes x ± a_l interpolées, sinon le décalage serait sans effet
  assert.deepEqual(shiftedEnvelope([0, 0.9, 1.8], [0, 9, 0], 0.65).map(v => +v.toFixed(9)), [6.5, 9, 6.5]);
});

test('plan de ferraillage de l\'exemple CHAMOA : couverture, 50 % sur appuis, espacements, métré', () => {
  const deck = new SlabDeck({ spans: [10, 15, 15, 10], width: 12, h: 0.75, area: 8.91, overhangs: [0.5, 0.5], roadway: { y1: -5, y2: 5 },
    footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }], bands: [{ q: 1.92, y1: -5, y2: 5, kmin: 0.8, kmax: 1.4 }], ys: [-6, -3, 0, 3, 6], nu: 0.2 });
  const perm = deck.permanent(), ec = deck.eurocode({ alpha: EC_ALPHA.FR2 });
  const d = designEC(deck, perm, ec, { fck: 35, fyk: 500, c: 0.03, phi: 0.02 });
  const tr = new TransverseModel(deck, { nHarm: 3 }).run({ alpha: EC_ALPHA.FR2 });
  const td = designTransverseEC(deck, tr, d, { fck: 35, fyk: 500, c: 0.03, phi: 0.016, phiLong: 0.02 });
  const r = rebarPlan({ deck, design: d, trans: td, opt: { fck: 35, fyk: 500 } });
  assert.equal(r.deficits.length, 0, 'aciers mis en place ≥ requis partout');
  r.check.forEach(q => { assert.ok(q.provBot + 1e-9 >= q.shBot || q.x < 0.8 || q.x > 49.2, `épure décalée inf à x = ${q.x}`); });
  for (const sp of r.spansBot) {
    const full = areaOf(sp.filante.phi) / sp.filante.s + (sp.renfort ? areaOf(sp.renfort.phi) / sp.renfort.s : 0);
    assert.ok(areaOf(sp.filante.phi) / sp.filante.s >= 0.5 * sp.peak - 1e-9, '≥ 50 % des aciers de travée filants (EC2 9.3.1.2)');
    assert.ok(full >= sp.peak - 1e-9);
    assert.ok(sp.filante.s <= r.sMaxMain + 1e-9 && (sp.renfort ? sp.filante.s / 2 : sp.filante.s) <= r.sMaxPeak + 1e-9, 'espacements 9.3.1.1(3)');
  }
  assert.ok(r.filTop.pieces >= 5, 'filantes supérieures de 51 m en éléments ≤ 12 m');
  assert.equal(r.transMarks.length, 8, 'transversaux inf/sup par travée');
  assert.ok(r.ratio > 60 && r.ratio < 180, `ratio d'acier ${r.ratio.toFixed(0)} kg/m³ plausible`);
  const m1 = r.marks[0]; rel(m1.mass, m1.count * m1.totalLen * 7850 * areaOf(m1.phi), 1e-9, 'masse = n × L × 7850 × A');
});
