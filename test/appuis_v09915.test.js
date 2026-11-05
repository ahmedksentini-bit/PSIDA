/** v0.99.15 : massif en gros béton sous semelle, souffle de joint sismique, réactions d'appareils imposées. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { souffleJoints } from '../src/plans/equipements.js';

const prof = '[SP1]\n0 3 argile-A 0.3 3 0.67\n3 40 marne-A 2.5 30 0.67';

test('Gros béton : portance vérifiée à la base du massif (B + 2 d, D + h), contact semelle / massif en béton non armé', () => {
  const d = { ...formDefaults(), ap_found: 'superficielle', ap_B: '4', ap_profil: prof, ap_profAssign: '' };
  const f0 = compute(parseData(d)).supports.lines[1].EC.found;
  const f = compute(parseData({ ...d, ap_gbH: '2' })).supports.lines[1].EC.found;
  assert.equal(f0.gb, undefined);
  assert.ok(f.gb, 'massif décrit');
  assert.equal(f.gb.deb, 1, 'débord par défaut h/2');
  assert.equal(f.gb.B, 6); assert.equal(f.gb.D, f0.scour ? f.gb.D : 3);
  assert.ok(Math.abs(f.gb.W - 23 * 6 * f.gb.L * 2) < 1e-6, 'poids γ B′ L′ h');
  assert.ok(f.worstV < f0.worstV, 'assise dans la marne : taux de portance réduit');
  // contact : V/((B − 2e) L) ≤ 0,8 f_ck/1,5
  const k = f.gb.contact.find(x => x.ls === 'ELU');
  assert.ok(Math.abs(k.fcd - 0.8 * 15 / 1.5) < 1e-12);
  assert.ok(Math.abs(k.sig - k.V / ((4 - 2 * k.e) * f.L) / 1000) < 1e-9);
  assert.ok(f.gb.debOk && f.gb.ratio < 1 && f.gb.ratioH < 1);
});

test('Souffle de joint : max(service 2 v_T + v_RF ; souffle sismique retenu par Pont EC8)', () => {
  const st = compute(parseData({ ...formDefaults(), ap_seisme: 'on', ap_zone: '5', ap_catEC8: 'III' }));
  const J = souffleJoints(st, {}), js = st.supports.seisme.joints;
  assert.equal(js.length, 2);
  for (const [k, j] of J.entries()) {
    assert.ok(Math.abs(j.Wservice - (2 * j.vT + j.vRF)) < 1e-12);
    assert.equal(j.Wseisme, js[k].souffleRetenu);
    assert.equal(j.W, Math.max(j.Wservice, j.Wseisme));
    assert.equal(j.gouverne, 'séisme');
    assert.match(j.type, /cantilever|bande|modulaire/);
  }
  const s0 = souffleJoints(compute(parseData(formDefaults())), {});
  assert.ok(s0.every(j => j.Wseisme == null && j.gouverne === 'service' && j.W === j.Wservice));
});

test('Appareils : réactions par appareil imposées vérifiées avec les déplacements et rotations PSIDA', () => {
  const st = compute(parseData({ ...formDefaults(), ap_brgReac: 'C0: 900 150 ; 3000 1200' }));
  const L = st.supports.lines, b1 = L[1].EC.brg, I = b1.imposed;
  assert.equal(I.max, 3000); assert.equal(I.min, 1200);
  const mx = b1.rows.filter(r => !r.minimal);
  assert.ok(I.psida.max > 0 && I.rows.length === mx.length + 1 && I.slide);
  for (const [k, r] of mx.entries()) assert.ok(I.rows[k].Fz === 3000 && I.rows[k].alpha === r.alpha && I.rows[k].vSlow === r.vSlow && I.rows[k].Hx === r.Hx, 'combinaisons concomitantes PSIDA');
  // réaction démesurée : non conforme, proposition plus grande vérifiant aussi la réaction imposée
  assert.equal(L[0].EC.brg.imposed.max, 900, 'préfixe « C0: » accepté');
  assert.equal(L[2].EC.brg.imposed, undefined, 'ligne sans entrée : réactions PSIDA seules');
  assert.ok(L.every(x => x.liaison !== 'glissant'), 'pas de bascule automatique en appareil glissant');
  const b3 = compute(parseData({ ...formDefaults(), ap_brgReac: '; P1: 6000 1500' })).supports.lines[1].EC.brg;
  assert.equal(b3.imposed.ok, false); assert.equal(b3.ok, true, 'vérification seule : pas de remplacement automatique');
  assert.equal(b3.label, b1.label);
  assert.ok(b3.imposed.proposal && b3.imposed.proposal.bd.a * b3.imposed.proposal.bd.b > b3.g.a * b3.g.b - 1e-12, 'proposition plus grande');
});
