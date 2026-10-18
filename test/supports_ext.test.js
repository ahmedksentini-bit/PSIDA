/**
 * Appuis — compléments v0.35 : gradient thermique sur les appareils, fiche minimale des pieux, voile d'épaisseur variable,
 * excentricités du second ordre dans les pieux (option), pile de joint (pile double).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { pileCapacity, minPileLength } from '../src/supports/foundation.js';

const base = { ...formDefaults(), spans: '18, 24, 18', h: '0.85', ap_found: 'pieux' };
const run = (o = {}) => { const st = compute(parseData({ ...base, ...o })); assert.equal(st.supportsError, null); return st; };

test('appareils : gradient thermique N_θ dans les combinaisons max (× 0,78 BAEL) et min (× 1)', () => {
  const st = run(), b = st.supports.lines[0].BAEL.brg, nb = b.nb;
  assert.ok(b.Ntheta && b.Ntheta.max > 0 && b.Ntheta.min < 0);
  assert.ok(Math.abs(b.Ntheta.max - st.thermal.Rmax[0] / nb) < 1e-9);
  const mn = b.rows.find(r => /N_θ \(min\)/.test(r.label));
  assert.ok(mn, 'combinaison minimale avec le gradient');
});

test('fiche minimale des pieux : la portance couvre la charge à la fiche trouvée, pas au pas précédent', () => {
  const st = run(), f = st.supports.lines[1].BAEL.found, fi = f.fiche, p = st.supports.sp, prof = st.supports.profiles[0];
  assert.ok(fi && !fi.error && fi.governing > 0 && fi.governing <= fi.Lretenu);
  const cap = L => pileCapacity({ code: 'BAEL', type: p.found.pileType, D: p.found.pileD, Lpile: L, profile: prof, Dhead: p.found.De });
  assert.ok(cap(fi.ELU).Rcd >= f.NmaxU && cap(fi.ELU - fi.step).Rcd < f.NmaxU);
  assert.ok(cap(fi.ELS).Rcrd >= f.NmaxS);
  assert.ok(cap(fi.QP).Rqp >= fi.NqpP && cap(fi.QP - fi.step).Rqp < fi.NqpP);
  // charge nulle : pas de fiche demandée
  assert.equal(minPileLength({ code: 'BAEL', type: p.found.pileType, D: p.found.pileD, profile: prof, loads: { ELU: 0 } }).ELU, null);
});

test('voile d\'épaisseur variable : poids moyen, élancement sur la plus faible épaisseur, raideur entre les deux voiles constants', () => {
  const s0 = run({ ap_pileB: '0.8' }), s1 = run({ ap_pileB: '0.8', ap_pileBtop: '0.5' }), s2 = run({ ap_pileB: '0.5' });
  const L = s => s.supports.lines[1];
  assert.ok(L(s1).BAEL.shaft.buckling.lambda > L(s0).BAEL.shaft.buckling.lambda);
  assert.ok(Math.abs(L(s1).BAEL.shaft.buckling.lambda - L(s2).BAEL.shaft.buckling.lambda) < 1e-9, 'λ sur 0,5 m');
  const K = s => L(s).K.BAEL.inst;
  assert.ok(K(s1) < K(s0) && K(s1) > K(s2), `K ${K(s2)} < ${K(s1)} < ${K(s0)}`);
});

test('pieux : option excentricités additionnelle et du second ordre (l_f = 2 l₀)', () => {
  const s0 = run(), s1 = run({ ap_pieuSO: 'on' });
  const f1 = s1.supports.lines[1].BAEL.found;
  assert.equal(s0.supports.lines[1].BAEL.found.pileSO, null);
  assert.ok(f1.pileSO.lf > 0 && f1.pileSO.ea >= 0.02 && f1.pileSO.e2max > f1.pileSO.e2min);
  assert.ok(f1.AsReq >= s0.supports.lines[1].BAEL.found.AsReq);
});

test('pile de joint : calculée en pile, réactions du tablier adjacent ajoutées (r_G = r_Q = 1 : doublées)', () => {
  const s0 = run(), s1 = run({ ap_joint: 'debut' }), s2 = run({ ap_joint: 'debut', ap_jointG: '0.5', ap_jointQ: '0', ap_jointH: '0' });
  const L0 = s0.supports.lines[0], L1 = s1.supports.lines[0], L2 = s2.supports.lines[0];
  assert.equal(L0.kind, 'culee'); assert.equal(L1.kind, 'pile'); assert.ok(L1.joint);
  const els = L => L.head.F61.find(c => c.label === 'ELS A(l) + trottoirs');
  const G = s0.perm.Rmax[0], hyp = 0;
  assert.ok(Math.abs(els(L1).Nsus - 2 * G - hyp) < 1e-6);
  assert.ok(Math.abs(els(L2).Nsus - 1.5 * G) < 1e-6 && Math.abs(els(L2).Ninst - 1.2 * (els(L1).Ninst / 1.2) / 2) < 1e-6);
  assert.equal(s1.supports.lines[3].kind, 'culee');
  assert.ok(L1.warnings.some(w => /pile de joint/.test(w)));
});
