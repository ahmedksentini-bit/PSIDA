/**
 * Renfort des tests (campagne de mutation, docs/validation/mutation.md) : fonctions élémentaires des fondations
 * (src/supports/foundation.js) contre des valeurs calculées à la main ou des solutions analytiques classiques.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pileCapStrutTie, sigmaSBAEL, pileCapTwoRows, footingStrutTie, footingCantilever, pileGroupForces, menardReaction,
  pileConcrete, lateralPile, pileMinSteel, paroiFlechie } from '../src/supports/foundation.js';

const proche = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg} : attendu ${b}, obtenu ${a}`);

test('BAEL A.4.5,33/34 : σ̄s (FP, FTP, valeurs par défaut fe = 400, fc28 = 25, η = 1,6)', () => {
  // f_t28 = 2,1 ; 110 √(1,6 × 2,1) = 201,63 ; FP = min(266,7 ; max(200 ; 201,63)) ; FTP = 0,8 FP
  proche(sigmaSBAEL({ fiss: 'FP' }), 110 * Math.sqrt(1.6 * 2.1), 1e-12, 'FP');
  proche(sigmaSBAEL({}), 0.8 * 110 * Math.sqrt(1.6 * 2.1), 1e-12, 'FTP');
  // fe = 500, fc28 = 30 : 110 √(1,6 × 2,4) = 215,6 < 0,5 fe = 250 → FP = 250
  proche(sigmaSBAEL({ fe: 500, fc28: 30, fiss: 'FP' }), 250, 1e-12, 'FP 500');
  // fe par défaut (400), fc28 = 16 : 110 √(1,6 × 1,56) = 173,8 < 0,5 fe = 200 → FP = 200
  proche(sigmaSBAEL({ fc28: 16, fiss: 'FP' }), 200, 1e-12, 'FP 0,5 fe');
  // fe = 235 : 2/3 fe = 156,7 gouverne
  proche(sigmaSBAEL({ fe: 235, fc28: 30, fiss: 'FP' }), 235 * 2 / 3, 1e-12, 'FP 235');
});

test('PP73 1.3.2 ch. 4 : tirant et semelle sur deux files de pieux', () => {
  proche(pileCapStrutTie({ R: 1000, l: 3, b: 1, h: 1.4, sigS: 400 }), 1000 / 400e3 * 1.25 / 1.4, 1e-12, 'A tirant');
  const r = pileCapTwoRows({ RU: 1000, RS: 700, l: 3, b: 1, hs: 1.5, D: 1, fsu: 434.8, sigSels: 200, nPiles: 4 });
  proche(r.h, 1.4, 1e-12, 'h'); proche(r.A1U, 1000 / 434.8e3 * 1.25 / 1.4, 1e-12, 'A1U'); proche(r.A1S, 700 / 200e3 * 1.25 / 1.4, 1e-12, 'A1S');
  proche(r.A1, r.A1S, 1e-12, 'A1'); proche(r.band, 2.5, 1e-12, 'bande'); proche(r.dens, r.A1S / 2.5, 1e-12, 'densité');
  proche(r.A1prime, r.A1S / 7.5, 1e-12, "A'1"); proche(r.A2, r.A1S / 7.5, 1e-12, 'A2');
  proche(r.Aanchor, 0.8 * 700 / 200e3, 1e-12, 'ancrage');
  proche(r.theta, Math.atan(1.4 / 1.25) * 180 / Math.PI, 1e-12, 'θ'); assert.equal(r.thetaOk, true);
  proche(r.hmin, 1.4, 1e-12, 'hmin'); assert.equal(r.hOk, true);
  proche(r.Rpunch, (2 / 3) * 2.4 * 1.4 * 2000, 1e-12, 'poinçonnement'); assert.equal(r.punchOk, true);
  // bielles trop plates (h < l/2 − b/4) : θ < 45°, poinçonnement non vérifiable
  const p = pileCapTwoRows({ RU: 1000, RS: 700, l: 4, b: 0.4, hs: 1.0, D: 0.5, fsu: 434.8, sigSels: 200, nPiles: 4 });
  assert.equal(p.thetaOk, false); assert.equal(p.punchOk, null); proche(p.hmin, 0.7, 1e-12, 'hmin 1,4 Ø'); assert.equal(p.hOk, true);
  assert.equal(pileCapTwoRows({ RU: 1000, RS: 700, l: 3, b: 1, hs: 1.5, D: 1, fsu: 434.8, sigSels: 200, nPiles: 2 }).punchOk, null);
  const mince = pileCapTwoRows({ RU: 1000, RS: 700, l: 3, b: 1, hs: 0.55, D: 0.3, fsu: 434.8, sigSels: 200 });
  assert.equal(mince.hOk, false); assert.equal(mince.hmin, 0.6);                                // hmin = 0,60 m
  // bielles exactement à 45° (h = l/2 − b/4 = 1,25 m) : domaine de la méthode atteint
  assert.equal(pileCapTwoRows({ RU: 1000, RS: 700, l: 3, b: 1, hs: 1.35, D: 1, fsu: 434.8, sigSels: 200 }).thetaOk, true);
});

test('Semelles superficielles : bielles et consoles (trapèze et triangle de contraintes)', () => {
  proche(footingStrutTie({ N: 2000, B: 3, b: 0.6, d: 0.7, fsu: 435 }), 2000 * 2.4 / (8 * 0.7 * 435e3), 1e-12, 'bielles');
  // e = 0,25 ≤ B/6 = 0,5 : trapèze ; x1 = 1,2 + 0,21 = 1,41 ; M1 = qmax x1²/2 + (qmin − qmax) x1³/(6B)
  const V = 1500, M = 375, B = 3, L = 2, b = 0.6, d = 0.6, fsu = 435;
  const r = footingCantilever({ V, M, B, L, b, d, fsu });
  const qmax = V / (B * L) * (1 + 6 * 0.25 / B), qmin = V / (B * L) * (1 - 6 * 0.25 / B), x1 = 1.41;
  proche(r.e, 0.25, 1e-12, 'e'); proche(r.qmax, qmax, 1e-12, 'qmax'); proche(r.qmin, qmin, 1e-12, 'qmin'); proche(r.c, B, 1e-12, 'c');
  const M1 = qmax * x1 ** 2 / 2 + (qmin - qmax) * x1 ** 3 / (6 * B);
  proche(r.M1, M1, 1e-5, 'M1'); proche(r.z, 0.54, 1e-12, 'z'); proche(r.As, M1 * L / (0.54 * fsu * 1000), 1e-5, 'As');
  proche(r.q1, qmax + (qmin - qmax) * x1 / B, 1e-12, 'q(x1)');
  // e = 0,8 > B/6 : triangle de longueur c = 3 (B/2 − e) = 2,1 ; qmax = 2V/(3 L (B/2 − e))
  const t = footingCantilever({ V, M: 1200, B, L, b, d, fsu });
  const c = 3 * (1.5 - 0.8), qm = 2 * V / (3 * L * 0.7);
  proche(t.c, c, 1e-12, 'c'); proche(t.qmax, qm, 1e-12, 'qmax triangle'); assert.equal(t.qmin, 0);
  proche(t.M1, qm * (x1 ** 2 / 2 - x1 ** 3 / (6 * c)), 1e-5, 'M1 triangle');
  proche(t.q1, qm * (1 - x1 / c), 1e-12, 'q(x1) triangle');
});

test('Groupe de pieux sous semelle rigide : N/n ± (M − n M_tête) x/Σx²', () => {
  const r = pileGroupForces({ N: 1200, M: 300, H: 100, xs: [-1.5, 1.5, -1.5, 1.5] });
  assert.deepEqual(r.N.map(v => +v.toFixed(9)), [250, 350, 250, 350]); assert.equal(r.H, 25);
  const m = pileGroupForces({ N: 1200, M: 300, xs: [-1.5, 1.5, -1.5, 1.5], Mhead: 10 });   // (300 − 40)·1,5/9
  proche(m.N[1], 300 + 260 * 1.5 / 9, 1e-12, 'moment en tête');
  assert.deepEqual(pileGroupForces({ N: 900, M: 50, xs: [0, 0, 0] }).N, [300, 300, 300]);
});

test('Ménard (F62 V annexe C.5) : k de la note de référence, 6756 et 9120 t/m³', () => {
  proche(menardReaction({ EM: 18000, alpha: 0.66, B: 1.2 }).k, 67560, 1e-3, 'Ø 1,20');
  proche(menardReaction({ EM: 18000, alpha: 0.66, B: 0.8 }).k, 91200, 1e-3, 'Ø 0,80');
  // B < B0 : E_s = 12 E_M/[(4/3) 2,65^α + α]
  const s = menardReaction({ EM: 10000, alpha: 0.5, B: 0.4 });
  proche(s.Es, 120000 / ((4 / 3) * Math.sqrt(2.65) + 0.5), 1e-12, 'B < B0'); proche(s.kLong, s.Es / 0.8, 1e-12, 'longue durée');
});

test('Béton des pieux (F62 V C.5.4) : k1, k2, f_c et E_i = 11 000 f_c^(1/3)', () => {
  let r = pileConcrete({ fc28: 25, D: 0.5, L: 20 });        // foré boue, D/L = 1/40 < 1/20 et D < 0,60 : k2 = 1,35 − D/2
  assert.equal(r.k1, 1.2); proche(r.k2, 1.1, 1e-12, 'k2'); proche(r.fc, 25 / 1.32, 1e-12, 'fc'); proche(r.Ei, 11000 * (25 / 1.32) ** (1 / 3), 1e-12, 'Ei');
  r = pileConcrete({ fc28: 30, D: 1.2, L: 15 });             // D/L = 0,08 : k2 = 1 ; f_lim = 25
  assert.equal(r.k2, 1); proche(r.fc, 25 / 1.2, 1e-12, 'fc flim');
  r = pileConcrete({ fc28: 25, D: 0.5, L: 5 });              // D < 0,60 seul : 1,30 − D/2
  proche(r.k2, 1.05, 1e-12, 'k2 petit Ø');
  r = pileConcrete({ fc28: 25, D: 0.8, L: 20 });             // élancé seul : 1,05
  proche(r.k2, 1.05, 1e-12, 'k2 élancé');
  r = pileConcrete({ fc28: 35, D: 0.8, L: 10, type: 'battu' }); // préfabriqué battu : k1 = 1,15, f_lim = 30
  assert.equal(r.k1, 1.15); proche(r.fc, 30 / 1.15, 1e-12, 'fc battu');
  assert.equal(pileConcrete({ fc28: 25, D: 0.8, L: 10, type: 'fore-tube' }).k1, 1.1);
});

test('Pieu de Winkler long : solution de Hetényi (tête libre et tête encastrée)', () => {
  const D = 1.2, E = 30000, k = 20000, H = 100, I = Math.PI * D ** 4 / 64, EI = E * 1000 * I;
  const lam = (k * D / (4 * EI)) ** 0.25;                     // λL ≈ 6,3 : pieu long
  const libre = lateralPile({ L: 30, D, E, k, H });
  proche(libre.y0, 2 * H * lam / (k * D), 2e-3, 'y0 tête libre');
  proche(libre.Mmax, 0.3224 * H / lam, 3e-3, 'Mmax tête libre');
  proche(libre.theta0, -2 * H * lam ** 2 / (k * D), 5e-3, 'rotation tête libre');
  proche(libre.flexHead, libre.y0 / H, 1e-12, 'souplesse');
  const enc = lateralPile({ L: 30, D, E, k, H, fixedHead: true });
  proche(enc.y0, H * lam / (k * D), 2e-3, 'y0 tête encastrée');
  proche(enc.Mmax, H / (2 * lam), 3e-3, 'M encastrement');
  // moment seul en tête libre : y0 = 2 M0 λ²/(k D)
  const m = lateralPile({ L: 30, D, E, k, H: 0, M0: 100 });
  proche(Math.abs(m.y0), 2 * 100 * lam ** 2 / (k * D), 3e-3, 'y0 sous M0');
  // module fonction de la profondeur : identique à la constante
  proche(lateralPile({ L: 30, D, E, k: () => k, H }).y0, libre.y0, 1e-12, 'k(z)');
});

test('Armatures minimales des pieux et paroi fléchie (BAEL annexe E.5)', () => {
  proche(pileMinSteel({ D: 1 }), 0.005 * Math.PI / 4, 1e-12, 'BAEL 0,5 %');
  proche(pileMinSteel({ D: 0.6, code: 'EC' }), 0.005 * Math.PI * 0.09, 1e-12, 'EN 1536 A ≤ 0,5');
  assert.equal(pileMinSteel({ D: 1, code: 'EC' }), 25e-4);
  proche(pileMinSteel({ D: 1.2, code: 'EC' }), 0.0025 * Math.PI * 0.36, 1e-12, 'EN 1536 A > 1');
  // h/l = 0,75, plusieurs travées : z = 0,2 (l + 1,5 h) ; une travée : 0,2 (l + 2 h)
  let r = paroiFlechie({ l: 4, hs: 1, Hwall: 2, Mt: 800, Ma: 600, fsu: 435 });
  assert.equal(r.applicable, true); proche(r.h, 3, 1e-12, 'h'); proche(r.z, 0.2 * (4 + 4.5), 1e-12, 'z multi');
  proche(r.ha, 3, 1e-12, 'ha'); proche(r.hTie, 0.45, 1e-12, 'tirant'); proche(r.Abot, 800 / (1.7 * 435e3), 1e-12, 'Abot'); proche(r.Atop, 600 / (1.7 * 435e3), 1e-12, 'Atop');
  proche(paroiFlechie({ l: 4, hs: 1, Hwall: 2, Mt: 1, Ma: 1, fsu: 435, travees: 1 }).z, 2, 1e-12, 'z une travée');
  // h > l : 0,5 l (multi) et 0,6 l (une travée) ; h_a = l
  r = paroiFlechie({ l: 2, hs: 1, Hwall: 2, Mt: 1, Ma: 1, fsu: 435 });
  proche(r.z, 1, 1e-12, 'z h > l'); proche(r.ha, 2, 1e-12, 'ha = l');
  proche(paroiFlechie({ l: 2, hs: 1, Hwall: 2, Mt: 1, Ma: 1, fsu: 435, travees: 1 }).z, 1.2, 1e-12, 'z h > l, une travée');
  // h/l < 1/2 : poutre ordinaire ; portée l = min(l ; 1,15 l_nu) ; voile négatif ignoré
  assert.equal(paroiFlechie({ l: 6, hs: 1, Hwall: 1, Mt: 1, Ma: 1, fsu: 435 }).applicable, false);
  proche(paroiFlechie({ l: 4, lNu: 3, hs: 1, Hwall: 2, Mt: 1, Ma: 1, fsu: 435 }).l, 3.45, 1e-12, 'portée de calcul');
  proche(paroiFlechie({ l: 4, hs: 2.5, Hwall: -1, Mt: 1, Ma: 1, fsu: 435 }).h, 2.5, 1e-12, 'voile négatif');
});
