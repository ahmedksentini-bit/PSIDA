/**
 * Confrontation de PSIDA à l'exemple JRC EUR 25193 (« Bridge Design to Eurocodes – Worked examples », JRC, 2012) :
 * pont mixte bipoutre 60 + 80 + 60 m, dalle de 12 m, C35/45, S355. Valeurs de référence reprises du rapport et des
 * supports de présentation du JRC (Malakatas, Davaine, Kolias) ; détail et écarts : docs/validation/jrc_eur25193.md.
 * Les tolérances couvrent les arrondis d'affichage du rapport ; aucune n'est élargie pour masquer un écart.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notionalLanes, lm1, COMBI, gradientEN1991_1_5 } from '../src/loads_ec.js';
import { brakingEC } from '../src/bearings.js';
import { IMPACT_VEHICULE } from '../src/supports/index.js';
import { EC_COMBI } from '../src/combinations.js';
import { chargesPoutre } from '../src/mixte/poutre_continue.js';
import { longueursEquivalentes, largeurEfficace, equivalence, momentPlastique, fyEpaisseur, proprietes } from '../src/mixte/section.js';
import { cisaillement, resistanceGoujon, lambdaFatigue, kcFissuration, raidissementTraction } from '../src/mixte/verifs.js';
import { betonEC2 } from '../src/phasage/fluage.js';

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PSIDA ${a}, JRC ${b} (tolérance ${tol * 100} %)`);

test('JRC ch. 3 : voies conventionnelles et LM1 sur une chaussée de 11 m (α = 1)', () => {
  assert.deepEqual(notionalLanes(11), { n: 3, wl: 3, wr: 2 });
  const L = lm1(3);
  assert.deepEqual(L.lanes.map(l => [l.Q, l.q]), [[300, 9], [200, 2.5], [100, 2.5]]);
  assert.equal(L.qr, 2.5);
});

test('JRC ch. 3 : freinage Q_lk = 0,6 × 2 × 300 + 0,1 × 9 × 3 × L ≤ 900 kN', () => {
  const ref = { 60: 522, 80: 577, 120: 685, 140: 739, 200: 900 };   // le support arrondit 576 / 684 / 738 à l'unité supérieure
  for (const [L, Q] of Object.entries(ref)) proche(brakingEC({ L: +L }), Q, 0.002, `Q_lk(${L} m)`);
});

test('JRC ch. 3 : chocs de véhicules sur les appuis (EN 1991-1-7 tableau 4.1, valeurs recommandées)', () => {
  const ref = { autoroute: [1000, 500], rurale: [750, 375], urbaine: [500, 250], parking: [150, 75] };
  for (const [k, [x, y]] of Object.entries(ref)) assert.deepEqual([IMPACT_VEHICULE[k].Fdx, IMPACT_VEHICULE[k].Fdy], [x, y], k);
});

test('JRC ch. 2-3 : coefficients partiels et ψ (EN 1990 A2) du trafic et de la température', () => {
  assert.equal(COMBI.gammaG, 1.35); assert.equal(COMBI.gammaQ, 1.35);
  assert.deepEqual([COMBI.psi0.TS, COMBI.psi1.TS, COMBI.psi2.TS], [0.75, 0.75, 0]);
  assert.deepEqual([COMBI.psi0.UDL, COMBI.psi1.UDL, COMBI.psi2.UDL], [0.40, 0.40, 0]);
  assert.deepEqual([EC_COMBI.psi0T, EC_COMBI.psi1T, EC_COMBI.psi2T], [0.6, 0.6, 0.5]);
});

test('JRC ch. 3 : gradient d\'une dalle béton (tableaux 6.1 et 6.2, type 3)', () => {
  const ref = [[0, 0.8, 1.1], [0.05, 1.0, 1.0], [0.10, 0.7, 1.0], [0.15, 0.5, 1.0]];
  for (const [t, kh, kc] of ref) { const g = gradientEN1991_1_5(t); proche(g.heat, 15 * kh, 1e-9, `ΔT_M,heat (t = ${t})`); proche(-g.cool, 8 * kc, 1e-9, `ΔT_M,cool (t = ${t})`); }
});

test('JRC ch. 4 : répartition transversale de LM1 entre les deux poutres (règle du levier)', () => {
  const C = chargesPoutre([-3.5, 3.5], 0, { y1: -5.5, y2: 5.5 });
  proche(C.Q, 471.4, 1e-3, 'TS : R1 par essieu');
  proche(600 - C.Q, 128.6, 1e-3, 'TS : R2 = 600 − R1');
  proche(C.q, 35.36, 1e-3, 'UDL : R1');
  proche(42 - C.q, 6.64, 1e-3, 'UDL : R2 = 42 − R1');
});

test('JRC ch. 4 : longueurs équivalentes et largeur efficace de la dalle', () => {
  const Le = longueursEquivalentes([60, 80, 60]);
  assert.deepEqual(Le.travees.map(v => +v.toFixed(9)), [51, 56, 51]); assert.deepEqual(Le.appuis, [35, 35]);
  for (const le of [...Le.travees, ...Le.appuis]) proche(largeurEfficace({ b0: 0.75, b1: 3.125, b2: 2.125, Le: le }).beff, 6.0, 1e-12, `b_eff (L_e = ${le})`);
});

test('JRC ch. 4 : coefficients d\'équivalence n₀ et n_L (EN 1994-2 § 5.4.2.2)', () => {
  const b = betonEC2({ fck: 35, RH: 80, h0: 500, ciment: 'N' }), n0 = 210000 / b.Ecm;
  proche(n0, 6.162, 1e-3, 'n₀ = E_a/E_cm');
  // φ du JRC → n_L (formule seule, sans hypothèse sur h₀) : dalle, déformations imposées, retrait, superstructures
  const E = phi => equivalence(b.Ecm, phi);
  proche(E(1.394).permanent, 15.61, 1e-3, 'n_L dalle (ψ_L = 1,1)');
  proche(E(1.291).deformationsImposees, 18.09, 1e-3, 'n_L déformations imposées (ψ_L = 1,5)');
  proche(E(2.677).retrait, 15.24, 1e-3, 'n_L retrait (ψ_L = 0,55)');
  proche(E(1.179).permanent, 14.15, 1e-3, 'n_L superstructures (ψ_L = 1,1)');
  // φ(t, t₀) de l'EN 1992-1-1 annexe B : h₀ non publié dans les supports accessibles ; avec h₀ = 500 mm, ciment N, t = 100 ans
  for (const [t0, phi] of [[35.25, 1.394], [49.25, 1.291], [1, 2.677], [79.25, 1.179]]) proche(b.phi(36500 + t0, t0), phi, 0.01, `φ(∞, ${t0} j)`);
});

test('JRC ch. 6 : moment plastique de la section B (mi-travée P1-P2, géométrie reconstituée)', () => {
  // semelles 1000 × 40 et 1200 × 40, âme 2720 × 18 (A_a = 0,137 m², F_a = 47,25 MN) ; dalle A_c = 1,948 m² sur b_eff = 6 m,
  // face supérieure à 0,40 m au-dessus de la semelle (épaisseur au droit de la poutre)
  const hc = 1.948 / 6.0, g = { bfi: 1.2, tfi: 0.04, hw: 2.72, tw: 0.018, bfs: 1.0, tfs: 0.04, hg: 0.40 - hc, beff: 6.0, hc, Asup: 0, Ainf: 0, fck: 35, nuance: 'S355' };
  proche(proprietes(g, 'acier').A * 345, 47.25, 2e-3, 'F_a = A_a f_y (MN)');
  const r = momentPlastique(g, 1);
  proche(-r.forces.find(f => f.y > 2.8 + 0.05).F / 1000, 38.65, 1e-3, 'F_c = 0,85 f_ck/γ_c A_c (MN)');
  proche(2.8 - r.yp, 0.0125, 0.01, 'axe neutre plastique sous le dessus de la semelle (m)');
  proche(r.M / 1000, 79.6, 0.01, 'M_pl,Rd (MN·m)');
});

test('JRC ch. 6 : effort tranchant de la section A (appui P1, h_w = 2560, t_w = 26, a = 8 m)', () => {
  const r = cisaillement({ hw: 2.56, tw: 0.026 }, 345, 8), rR = cisaillement({ hw: 2.56, tw: 0.026 }, 345, 8, { montantRigide: true });
  proche(r.Vpl / 1000, 15.9, 2e-3, 'V_pl,a,Rd (MN)');
  proche(r.tauCr, 112.6, 2e-3, 'τ_cr (MPa)');
  proche(r.lam, 1.33, 3e-3, 'λ̄_w');
  proche(rR.chi, 0.675, 2e-3, 'χ_w (montant rigide)');
  proche(rR.Vb / 1000, 8.14, 2e-3, 'V_bw,Rd (MN, montant rigide)');
  assert.ok(r.Vb < rR.Vb, 'par défaut (montant non rigide) PSIDA reste du côté de la sécurité');
});

test('JRC ch. 6 : f_y selon l\'épaisseur des semelles (40, 55, 80, 120 mm)', () => {
  assert.deepEqual([40, 55, 80, 120].map(t => fyEpaisseur('S355', t)), [345, 335, 325, 295]);
});

test('JRC ch. 6 : goujon Ø 22 × 200 (f_u = 450 MPa) : P_Rd = 0,1095 MN', () => {
  proche(resistanceGoujon({ d: 0.022, h: 0.2, fu: 450, fck: 35, Ecm: 34000 }) / 1000, 0.1095, 1e-3, 'P_Rd');
});

test('JRC ch. 6 : fatigue, λ₁ et λ_max (EN 1993-2 § 9.5.2)', () => {
  const m80 = lambdaFatigue({ L: 80 }), m60 = lambdaFatigue({ L: 60 }), a70 = lambdaFatigue({ zoneAppui: true, L: 70 });
  proche(m80.lam1, 1.85, 1e-9, 'λ₁ mi-travée L = 80 m'); proche(m80.lamMax, 2.0, 1e-9, 'λ_max mi-travée');
  proche(m60.lam1, 2.05, 1e-9, 'λ₁ mi-travée L = 60 m');
  proche(a70.lam1, 2.10, 1e-9, 'λ₁ sur appui, L = (60 + 80)/2'); proche(a70.lamMax, 2.52, 1e-9, 'λ_max sur appui L = 70 m');
  // avec le λ₂ = 0,848 du JRC (non reconstituable : voir la note), λ = λ₁ λ₂ retrouve 1,568 / 1,738 / 1,780
  proche(m80.lam1 * 0.848, 1.568, 1e-3, 'λ L = 80 m'); proche(m60.lam1 * 0.848, 1.738, 1e-3, 'λ L = 60 m'); proche(a70.lam1 * 0.848, 1.780, 1e-3, 'λ appui');
});

test('JRC ch. 6 : k_c de l\'armature minimale (z₀ = 0,764 et 0,406 m, h_c = 0,307 m)', () => {
  proche(1 / (1 + 0.307 / (2 * 0.764)) + 0.3, 1.13, 3e-3, 'k_c brut P1'); assert.equal(kcFissuration(0.307, 0.764), 1);
  proche(1 / (1 + 0.307 / (2 * 0.406)) + 0.3, 1.02, 6e-3, 'k_c brut mi-travée'); assert.equal(kcFissuration(0.307, 0.406), 1);
});

test('Raidissement en traction : α_st = A I / (A_a I_a) de la section fissurée sur la charpente (EN 1994-1-1 § 7.4.3)', () => {
  const G = { bfi: 1.2, tfi: 0.12, hw: 2.56, tw: 0.026, bfs: 1.0, tfs: 0.12, hg: 0.08, beff: 6.0, hc: 0.32, Asup: 0.6 * 0.0238, Ainf: 0.4 * 0.0238, fck: 35, nuance: 'S355' };
  const P = proprietes(G, 'fissuree'), Pa = proprietes(G, 'acier'), r = raidissementTraction(G, 0.0122, 35);
  proche(r.ast, P.A * P.I / (Pa.A * Pa.I), 1e-12, 'α_st');
  assert.ok(r.ast > 1 && r.ast < 1.5, `α_st = ${r.ast} : ordre de grandeur du JRC (1,23 à P1)`);
  proche(r.dSig, 0.4 * 0.3 * 35 ** (2 / 3) / (r.ast * 0.0122), 1e-12, 'Δσ_s');
});

test('Correctifs relevés par la confrontation : λ_max sur appui et f_y au-delà de 100 mm', () => {
  // N_obs = 2·10⁶ : λ₁ λ₂ = 2,10 × 1,223 = 2,57 > λ_max = 2,52 sur appui (L = 70 m) ; l'ancien plafond uniforme de 2,0 sous-estimait λ
  const a = lambdaFatigue({ zoneAppui: true, L: 70, Nobs: 2e6 });
  proche(a.lam, 2.52, 1e-9, 'λ plafonné par λ_max(appui, 70 m)');
  assert.deepEqual([100, 101, 150, 151, 200, 250].map(t => fyEpaisseur('S355', t)), [315, 295, 295, 285, 285, 275]);
  assert.deepEqual([120, 120].map((t, i) => fyEpaisseur(['S235', 'S275'][i], t)), [195, 225]);
});
