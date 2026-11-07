/** v0.99.26 : enrobages (VIPP, appuis, gaines), réactions sous biais (Guyon), grillage de poutres, précontrainte sur la plaque. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durabilite, durabilitePrecontrainte } from '../src/durabilite.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { grillagePoutres } from '../src/beams/grillage.js';
import { beamDeck } from '../src/beams/index.js';
import { EXEMPLES, donnees } from '../tools/exemples.mjs';

const VREF = { pt_geo: 'dims', pt_spans: '33', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56', pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '1.79 sur -6.56,6.56', pt_type: 'BP', pt_fck: '40' };

test('Tableau 4.5N (précontrainte) et c_min,b des gaines (Ø, 80 mm au plus) et des torons (1,5 Ø)', () => {
  // S4 (50 ans, C30) : ligne S4 du tableau 4.5N = 10, 25, 35, 40, 45, 50, 55
  const v = ['X0', 'XC1', 'XC3', 'XC4', 'XD1', 'XD2', 'XD3'].map(e => durabilite({ expo: e, fck: 25, vie: 50, precontrainte: true }).cminDur);
  assert.deepEqual(v, [10, 25, 35, 40, 45, 50, 55]);
  const g = durabilitePrecontrainte({ expo: 'XC4', fck: 40, vie: 100, gaine: 80 });
  assert.equal(g.S, 5); assert.equal(g.cminDur, 45); assert.equal(g.cminB, 80); assert.equal(g.cnom, 90);
  assert.equal(durabilitePrecontrainte({ expo: 'XC4', fck: 40, vie: 100, gaine: 100 }).cminB, 80);
  const t = durabilitePrecontrainte({ expo: 'XC4', fck: 40, vie: 100, toron: 15.7 });
  assert.ok(Math.abs(t.cminB - 23.55) < 1e-9); assert.equal(t.cnom, 55); assert.equal(t.mode, 'pre');
});

test('VIPP : enrobage des gaines (âme de 20 cm, 12T15S : 60 mm < 90 mm), relèvement b₀ = 26 cm ; plans à c_nom', async () => {
  const r = computePoutres(parsePoutres({ ...formDefaults(), ...VREF }));
  assert.equal(r.durab.fck, 40);
  const G = r.durabP, ame = G.items.find(q => q.k === 'ame');
  assert.equal(G.cnom, 90); assert.ok(Math.abs(ame.mm - 60) < 1e-6); assert.equal(ame.ok, false);
  assert.ok(Math.abs(G.bwMin - 0.26) < 1e-9);
  assert.ok(G.items.find(q => q.k === 'bas').ok);
  const r2 = computePoutres(parsePoutres({ ...formDefaults(), ...VREF, pt_b0v: '0.26' }));
  assert.ok(r2.durabP.items.find(q => q.k === 'ame').ok);
  const { ctxDurabilite } = await import('../web/poutres_plans.js');
  const ctx = ctxDurabilite(r);
  assert.equal(ctx.c, 0.045); assert.equal(ctx.cGaine, 90); assert.equal(ctx.okGaine, false);
  const { planFerraillageVIPP } = await import('../src/plans/vipp.js');
  const F = planFerraillageVIPP(r.spans[0].beams[0].vipp, {}, { ctx });
  assert.match(JSON.stringify(F), /enrobage 4,5 cm = c_nom/);
  // PRAD : torons à 5 cm de la sous-face (axe) : 42 mm < 55 mm
  const p = computePoutres(parsePoutres({ ...formDefaults(), ...VREF, pt_type: 'PRAD', pt_spans: '25' }));
  assert.equal(p.durabP.D.mode, 'pre'); assert.equal(p.durabP.cnom, 55);
  assert.equal(p.durabP.items.find(q => q.k === 'bas').ok, false);
});

test('Appuis : durabilité (C30/37 en XC4, enrobage 50 mm), pieux au contact du sol (k₂ = 75 mm → axe à 8,5 cm)', () => {
  const st = compute(parseData({ ...formDefaults(), cover: '0.055', ap_zone: '1' }));
  const D = st.supports.durab;
  assert.equal(D.elev.cnom, 50); assert.ok(D.okElev && D.okFond && D.okBeton);
  assert.equal(D.cnomPieu, 75); assert.ok(Math.abs(D.cAxePieu - 0.085) < 1e-12);
  const st2 = compute(parseData({ ...formDefaults(), cover: '0.055', ap_zone: '1', ap_fck: '25', ap_c: '0.04' }));
  assert.equal(st2.supports.durab.elev.okBeton, false); assert.equal(st2.supports.durab.okElev, false);
});

test('PSI-DP Eurocodes : enrobage des gaines c_nom,p par défaut ; BPEL : Ø gaine, sans vérification', () => {
  const ec = compute(parseData({ ...donnees(EXEMPLES[2]), bp_reg: 'EC2' })).psidp;
  assert.equal(ec.durabGaine.cnom, 90); assert.equal(ec.durabGaine.enrobage, 90); assert.ok(ec.durabGaine.ok);
  assert.equal(compute(parseData(donnees(EXEMPLES[2]))).psidp.durabGaine, null);
});

test('Biais (Guyon) : concentration à l\'angle obtus lue sur la plaque, κ_max ≥ 1 et κ_min ≤ 1 ; ouvrage droit sans correction', () => {
  const st = compute(parseData({ ...donnees(EXEMPLES[1]), methodeTablier: 'guyon' }));
  const k = st.bearings.kBiais;
  assert.equal(k.length, 5);
  assert.ok(k.every(q => q.kMax >= 1 && q.kMin <= 1));
  assert.ok(k[1].kMax > 1.05, `pile : κ_max = ${k[1].kMax}`);
  assert.ok(Math.abs(st.bearings.rows[1].kBiais.kMax - k[1].kMax) < 1e-12);
  const d = compute(parseData({ ...donnees(EXEMPLES[1]), methodeTablier: 'guyon', psi: '100' }));
  assert.equal(d.bearings.kBiais, undefined);
});

test('Grillage : dalle isotrope (α = 1) ≈ Guyon-Massonnet à 3 % ; entretoises rigides sans torsion = Courbon', () => {
  const n = 10, b1 = 1, h = 0.5, L = 12, beam = { A: b1 * h, I: b1 * h ** 3 / 12, K: b1 * h ** 3 / 6, H: h };
  const S = beamDeck({ spans: [L], n, b1, hd: h, beam, roadway: { y1: -4, y2: 4 }, footways: [], lines: [], bands: [], levier: false }).bySpan.get(L);
  const g = grillagePoutres({ n, b1, L, Ip: beam.I, Kp: beam.K, hd: h, m: 24 });
  for (const e of [-4.5, -2.5, 0]) {
    const a = g.Kbar(e, e), b = S.deck.Kbar(S.deck.Leq[0], e, e);
    a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < 0.035 * Math.max(1, b[k]), `e = ${e}, poutre ${k} : ${v} / ${b[k]}`));
  }
  const ys = [-4.92, -1.64, 1.64, 4.92], S2 = ys.reduce((t, y) => t + y * y, 0);
  const gc = grillagePoutres({ n: 4, b1: 3.28, L: 33, Ip: 1, Kp: 1e-9, hd: 1e-3, m: 20, entretoises: Array.from({ length: 19 }, (_, i) => ({ x: 33 * (i + 1) / 20, I: 1e6, K: 0 })) });
  gc.Kbar(-4.92, -4.92).forEach((v, k) => assert.ok(Math.abs(v - 4 * (0.25 - 4.92 * ys[k] / S2)) < 2e-3));
});

test('Grillage dans le tablier à poutres : coefficients et comparaison à Guyon ; entretoises BA dans le grillage', () => {
  const r = computePoutres(parsePoutres({ ...formDefaults(), ...VREF, pt_repart: 'grillage' })), G = r.spans[0].grillage;
  assert.equal(G.reference, 'Guyon-Massonnet'); assert.equal(G.comparaison.length, 4);
  const rive = G.comparaison[0];
  assert.ok(rive.grillage[0] > rive.reference[0], 'grillage : poutre de rive plus chargée que Guyon (4 poutres discrètes)');
  assert.ok(Math.abs(rive.grillage.reduce((t, v) => t + v, 0) - 4) < 1e-6);
  const r0 = computePoutres(parsePoutres({ ...formDefaults(), ...VREF }));
  assert.equal(r0.spans[0].grillage, null);
  const ba = computePoutres(parsePoutres({ ...formDefaults(), pt_type: 'BA', pt_geo: 'rect', pt_spans: '15', pt_n: '4', pt_b1: '2.40', pt_hd: '0.22', pt_entInt: '2', pt_repart: 'grillage' }));
  const Gb = ba.spans[0].grillage;
  assert.equal(Gb.reference, 'Courbon'); assert.equal(Gb.ents.length, 2);
  assert.deepEqual(Gb.ents.map(e => e.x), [5, 10]);
});

test('Précontrainte sur la plaque : réactions hyperstatiques par appareil, somme par ligne ≈ poutre', () => {
  const st = compute(parseData({ ...formDefaults(), cover: '0.055', ap_zone: '1', spans: '14, 18, 14', width: '9', h: '0.75', roadway: '-3.5, 3.5', footways: '-4.5,-3.5 ; 3.5,4.5', lines: '', bands: '', ys: '-4.5, -3, -1.5, 0, 1.5, 3, 4.5', typeDalle: 'DP', bp_actif: 'on', methodeTablier: 'plaque' }));
  assert.equal(st.psidpError, null); assert.equal(st.supportsError, null);
  const pp = st.psidp.plaque;
  assert.equal(pp.etats.length, 9);
  for (const c of pp.controle) assert.ok(Math.abs(c.plaque - c.poutre) <= 0.05 * Math.abs(c.poutre) + 2, `${c.plaque} / ${c.poutre}`);
  // répartition non uniforme : l'appareil central des piles reprend l'essentiel de la réaction hyperstatique
  const P1 = pp.ES[1];
  assert.ok(Math.abs(P1[1]) > 3 * Math.abs(P1[0]));
});
