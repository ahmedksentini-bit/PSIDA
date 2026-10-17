import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA } from '../src/loads_ec.js';
import { TransverseModel } from '../src/transverse.js';
import { designEC, designTransverseEC } from '../src/design.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} attendu ${b}, obtenu ${a}`);

test('flexion transversale : symétrie, bords libres, ordres de grandeur, couplage ν', () => {
  const ys = [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6];
  const mk = nu => new SlabDeck({ spans: [10, 15, 15, 10], width: 12, h: 0.772, area: 8.91, overhangs: [0.5, 0.5], roadway: { y1: -5, y2: 5 },
    footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }], lines: [{ g: 10, e: -5.85 }, { g: 10, e: 5.85 }], bands: [{ q: 2.6, y1: -5, y2: 5 }], ys, nu });
  const deck = mk(0.2);
  const tm = new TransverseModel(deck, { tRev: 0.08, nHarm: 15 });
  const tr = tm.run({ alpha: EC_ALPHA.FR2, f61opt: { nRetenue: 0 } });
  const sp = tr.spans[0];
  // bords libres : m_y = 0
  close(sp.perm.my[0], 0, 1e-6, 'bord'); close(sp.ec.TS.myMax[8], 0, 1e-6, 'bord TS');
  // symétrie du permanent et des enveloppes
  for (let i = 0; i < 9; i++) { close(sp.perm.my[i], sp.perm.my[8 - i], 1e-6, 'sym perm'); close(sp.ec.TS.myMax[i], sp.ec.TS.myMax[8 - i], 1e-6, 'sym TS'); }
  // ordres de grandeur (exemple CHAMOA : permanent ossature seule 24 kN·m/m au centre, ici 36 avec superstructures)
  assert.ok(sp.perm.my[4] > 20 && sp.perm.my[4] < 60, 'perm centre ' + sp.perm.my[4]);
  assert.ok(sp.ec.TS.myMax[4] > 40 && sp.ec.TS.myMax[4] < 120, 'TS centre ' + sp.ec.TS.myMax[4]);
  assert.ok(sp.ec.TS.myMin[4] <= 0, 'TS min ≤ 0');
  // ν = 0 : le permanent uniforme ne donne qu'un faible moment transversal (effet des bords)
  const deck0 = mk(0);
  const tr0 = new TransverseModel(deck0, { nHarm: 15 }).run({ alpha: EC_ALPHA.FR2 });
  assert.ok(Math.abs(tr0.spans[0].perm.my[4]) < 0.3 * sp.perm.my[4], 'ν = 0 réduit fortement le permanent');
  // travée 2 (L_eq plus grand) : moments plus élevés
  assert.ok(tr.spans[1].ec.TS.myMax[4] > sp.ec.TS.myMax[4], 'L_eq ↑ ⇒ m_y ↑');
});

test('aciers transversaux EC2 : non sectionnel ≥ 20 % des longitudinaux, sup ≥ 50 % inf, wk et φ', () => {
  const ys = [-6, -3, 0, 3, 6];
  const deck = new SlabDeck({ spans: [12, 16, 12], width: 12, h: 0.7, roadway: { y1: -5, y2: 5 }, footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }], ys, nu: 0.2, nGrid: 60, nSec: 10 });
  const perm = deck.permanent(), ec = deck.eurocode();
  const tr = new TransverseModel(deck, { nHarm: 11 }).run({ alpha: EC_ALPHA.recommended });
  const dL = designEC(deck, perm, ec, { fck: 30, fyk: 500, c: 0.04 });
  const dT = designTransverseEC(deck, tr, dL, { fck: 30, fyk: 500, c: 0.04, phi: 0.016, phiLong: 0.02 });
  for (const sp of dT.spans) {
    assert.ok(sp.bot.As >= 0.2 * sp.asLongBot - 1e-12, 'inf ≥ 0,2 long');
    assert.ok(sp.top.As >= 0.5 * sp.bot.As - 1e-12 && sp.top.As >= 0.2 * sp.asLongTop - 1e-12, 'sup ≥ 0,5 inf et 0,2 long sup');
    assert.ok(sp.bot.As >= sp.bot.flex, 'As ≥ flexion');
  }
  close(dT.d, 0.7 - 0.04 - 0.02, 1e-12, 'd transversal');
});
