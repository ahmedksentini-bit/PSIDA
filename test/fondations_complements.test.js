/** Compléments fondations : palier de réaction, remblai sur pieux, frottement négatif, tassement, Blévot, rotation des semelles. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { blevot } from '../src/supports/psh.js';
import { soilProfile, negativeFrictionPiles, footingRotationStiffness } from '../src/supports/foundation.js';
import { frottementNegatif, K_TAN_DELTA } from '../src/geotech/frottement-negatif.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : réf ${b}, outil ${a}`);
const soft = '[SP1]\n0 6 argile-A 0.3 3 0.67\n6 40 marne-A 2.5 30 0.67';

test('Blévot (Perchat C 2 314 § 6.3.3) : sections à d = d_max (A_c = P₁/8, A_d = (P_u − P₁)/5,65 ; 3 pieux A_c = P_u/7,4)', () => {
  const b4 = blevot({ n: 4, Pu: 4000, a: 0.6, ap: 2.0, d: 2.0 - 0.3, B: 0.36, Bp: 0.2, fc28: 25, fsu: 348, fiss: 'FP' });
  rel(b4.dmax, 1.7, 1e-12, 'd_max = a\' − a/2'); rel(b4.Ac, 0.5 * 4000 / 8 / 348 / 1000, 1e-9, 'A_c'); rel(b4.Ad, 0.5 * 4000 / 5.657 / 348 / 1000, 1e-3, 'A_d');
  rel(b4.theta, Math.atan(Math.SQRT2) * 180 / Math.PI, 1e-9, 'θ');
  const b3 = blevot({ n: 3, Pu: 3000, a: 0.6, ap: 2.0, d: 0.825 * 1.7, B: 0.36, Bp: 0.2, fc28: 25, fsu: 348, fiss: 'FP' });
  rel(b3.Ac, 3000 / 7.425 / 348 / 1000, 1e-9, 'A_c 3 pieux'); assert.ok(b3.dOk);
  assert.ok(blevot({ n: 4, Pu: 4000, a: 0.6, ap: 2.0, d: 1.7, B: 0.36, Bp: 0.2, fc28: 25, fsu: 348, fiss: 'P' }).Ac > b4.Ac, 'majoration 10 %');
});

test('Frottement négatif : Combarieu (module de fond) appliqué aux couches compressibles du sondage', () => {
  const prof = soilProfile([{ z0: 0, z1: 6, classe: 'argile-A', pl: 0.3, EM: 3, alpha: 0.67 }, { z0: 6, z1: 40, classe: 'marne-A', pl: 2.5, EM: 30, alpha: 0.67 }]);
  const r = negativeFrictionPiles({ profile: prof, D: 0.8, type: 'fore-boue', hRemb: 6, gamma: 20, Dhead: 0, dFile: 2.4, nFiles: 1 });
  const ref = frottementNegatif({ R: 0.4, q: 120, couches: [{ z0: 0, z1: 6, gamma: 20, Kt: K_TAN_DELTA['argile-molle'].fore }], h2: 6 });
  rel(r.iso.Fn, ref.Fn, 1e-9, 'G_sn pieu isolé'); assert.equal(r.h2, 6);
  assert.ok(r.grp && r.Fn > 0 && r.Fn <= r.iso.Fn + 1e-9);
  assert.equal(negativeFrictionPiles({ profile: prof, D: 0.8, type: 'fore-boue', hRemb: 0, Dhead: 0, dFile: 2.4 }).applicable, false);
});

test('Intégration : palier de réaction, remblai sur pieux, frottement négatif, tassement, Blévot', () => {
  // choc de bateau sur sol mou : palier B p*_f atteint
  const st = compute(parseData({ ...formDefaults(), ap_found: 'pieux', ap_bateau: 'Vb', ap_profil: soft, ap_profAssign: '' }));
  const f = st.supports.lines[1].EC.found, acc = f.rows.find(r => r.ls === 'ACC');
  assert.ok(acc.psh.plast.nodes > 0 && acc.psh.plast.ratio <= 1.02, 'palier atteint puis respecté');
  assert.ok(f.plast.nodes > 0);
  // culées : remblai traversé, frottement négatif, tassement
  const p = parseData({ ...formDefaults(), ap_found: 'pieux', ap_fn: 'on', ap_profil: soft, ap_profAssign: '' });
  const p0 = parseData({ ...formDefaults(), ap_found: 'pieux', ap_profil: soft, ap_profAssign: '' });
  p.supports.found.remblai.h = 2;
  const S = compute(p).supports, S0 = compute(p0).supports;
  const C = S.lines[0].EC.found, C0 = S0.lines[0].EC.found;
  assert.ok(C.earth && Math.max(...C.rows.map(r => r.Mmax)) > Math.max(...C0.rows.map(r => r.Mmax)), 'poussée du remblai sur les pieux');
  assert.ok(C.negFr.applicable && C.negFr.NfnU > 0 && C.negFr.capFn.applicable);
  assert.ok(C.settle && C.settle.total > 0 && Number.isFinite(C.settle.raft.s));
  // poteau unique sur 4 pieux : Blévot
  const B = compute(parseData({ ...formDefaults(), ap_found: 'pieux', ap_pileType: 'colonnes', ap_nCol: '1', ap_D: '1.2', ap_nFiles: '2', ap_nPile: '2', ap_hs: '1.6' })).supports;
  assert.ok(B.lines[1].BAEL.found.blev && B.lines[1].BAEL.found.blev.Ac > 0);
});

test('Semelles superficielles : rotation sur le sol dans la répartition des efforts horizontaux', () => {
  const prof = soilProfile([{ z0: 0, z1: 40, classe: 'sable-B', pl: 1.2, EM: 12, alpha: 0.33 }]);
  const r = footingRotationStiffness({ profile: prof, B: 3, L: 12, D: 1 });
  rel(r.Ktheta.inst, r.ki * 12 * 27 / 12, 1e-12, 'K_θ = k_i L B³/12'); rel(r.ki, 2 * r.kv, 1e-12, 'k_i = 2 k_v');
  const S = compute(parseData(formDefaults())).supports;
  assert.ok(S.footRot && S.lines.every((L, i) => S.footRot[i].EC.Ktheta.diff > 0));
});
