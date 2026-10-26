/**
 * Appuis des ponts-rails (lot 5) : contrôles indépendants, valeurs calculées à la main sur les formules de la NF EN 1991-2
 * (§ 6.3.6.4, 6.4.5.4(2), 6.5.1 à 6.5.4) et de la NF EN 1990/A1 (tableaux A2.3, A2.4(B)). Aucune valeur n'est relue
 * dans le code testé : chaque attendu est écrit sous forme de calcul.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as RA from '../src/rail_appuis.js';
import { parseData, compute, parseSupports } from '../src/pipeline.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseStandalone, computeStandalone } from '../src/supports/standalone.js';
import { supportsBlocks } from '../web/supports_view.js';
import { toPontEC8 } from '../src/ec8export.js';

const proche = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);

test('Longueurs chargées de SW/0 et SW/2 (note 1 du § 6.5.3(2))', () => {
  // SW/0 : 2 × 15 m séparés de 5,3 m ; SW/2 : 2 × 25 m séparés de 7 m
  assert.equal(RA.longueurChargee('SW/0', 10), 10);
  assert.equal(RA.longueurChargee('SW/0', 18), 15);           // entre a et a + c
  proche(RA.longueurChargee('SW/0', 30), 30 - 5.3);            // L − c
  assert.equal(RA.longueurChargee('SW/0', 50), 30);            // 2a
  assert.equal(RA.longueurChargee('SW/2', 28), 25);
  assert.equal(RA.longueurChargee('SW/2', 60), 50);
  assert.equal(RA.longueurChargee('LM71', 60), 60);
});

test('Démarrage et freinage : une voie, deux voies, SW/2 (§ 6.5.3(2), (4), (9))', () => {
  // travée de 15 m, α = 1,21 : Q_la = 33 × 15 × 1,21 ; Q_lb = 20 × 15 × 1,21
  let l = RA.effortsLongitudinaux({ L: 15, alpha: 1.21 });
  proche(l.voie.Qla, 33 * 15 * 1.21); proche(l.voie.Qlb, 20 * 15 * 1.21); proche(l.une, 33 * 15 * 1.21);
  // α = 1, deux voies : sens opposés → freinage + démarrage = 300 + 495 ; même sens → 2 × 495
  l = RA.effortsLongitudinaux({ L: 15, alpha: 1, sw2: true });
  proche(l.deux, 20 * 15 + 33 * 15);
  proche(RA.effortsLongitudinaux({ L: 15, alpha: 1, memeSens: true }).deux, 2 * 33 * 15);
  // SW/2 sur 30 m : longueur chargée 25 m ; démarrage 33 × 25 = 825, freinage 35 × 25 = 875 (sans α, sans plafond)
  l = RA.effortsLongitudinaux({ L: 30, alpha: 1.33, sw2: true });
  proche(l.voieSW2.Lab, 25); proche(l.sw2Seul, 35 * 25);
  // SW/2 + LM71 × 1,33 (sens opposés) : max(875 + 33 × 30 × 1,33 ; 825 + 20 × 30 × 1,33)
  proche(l.sw2b, Math.max(875 + 33 * 30 * 1.33, 825 + 20 * 30 * 1.33));
  // plafonds : démarrage 1 000 kN, freinage 6 000 kN (× α)
  proche(RA.effortsLongitudinaux({ L: 100, alpha: 1 }).une, 2000);   // freinage 20 × 100 > démarrage plafonné à 1 000
  proche(RA.effortsLongitudinaux({ L: 40, alpha: 1 }).une, 1000);    // 33 × 40 = 1 320 → 1 000 ; freinage 800
});

test('Force centrifuge et lacet (§ 6.5.1, tableau 6.8 ; § 6.5.2)', () => {
  // LM71 sur 20 m : 4 × 250 + 80 × (20 − 6,4) = 2 088 kN
  proche(RA.chargeVerticaleTotale('LM71', 20), 4 * 250 + 80 * 13.6);
  proche(RA.chargeVerticaleTotale('LM71', 3), 2 * 250);               // deux essieux sur 3 m
  // V = 100 km/h ≤ 120, r = 800 m, α = 1,21 : Q_t = V²/(127 r) × α × W, f = 1
  let t = RA.effortsTransversaux({ L: 20, alpha: 1.21, V: 100, rayon: 800 });
  proche(t.centrifuge, 100 * 100 / (127 * 800) * 1.21 * 2088);
  proche(t.lacet, 121);
  // V = 160 km/h : cas (7)b à 160 km/h, α = 1, f(160 ; 20) ; cas (7)a à 120 km/h, α = 1,21, f = 1 ; enveloppe
  const f = 1 - (160 - 120) / 1000 * (814 / 160 + 1.75) * (1 - Math.sqrt(2.88 / 20));
  t = RA.effortsTransversaux({ L: 20, alpha: 1.21, V: 160, rayon: 800 });
  proche(t.centrifuge, Math.max(160 * 160 / (127 * 800) * f * 2088, 120 * 120 / (127 * 800) * 1.21 * 2088));
  // SW/2 : à min(V ; 80) km/h, f = 1, 150 kN/m sur la longueur chargée
  t = RA.effortsTransversaux({ L: 20, alpha: 1, V: 160, rayon: 800, sw2: true });
  proche(t.centrifugeSW2, 80 * 80 / (127 * 800) * 150 * 20);
  assert.equal(RA.effortsTransversaux({ L: 20, alpha: 0.83 }).lacet, 100);   // α < 1 : lacet non réduit
});

test('Interaction voie-ouvrage : ξ, F_Tk, F_Qk et conditions de la méthode simplifiée (§ 6.5.4.6.1)', () => {
  assert.equal(RA.coefficientXi({ Ltot: 35, dilatation: 'continue' }), 0.60);
  assert.equal(RA.coefficientXi({ Ltot: 35, dilatation: 'une' }), 0.70);
  assert.equal(RA.coefficientXi({ Ltot: 35, dilatation: 'deux' }), 1.00);
  assert.equal(RA.coefficientXi({ Ltot: 45 }), null);
  assert.equal(RA.coefficientXi({ Ltot: 45, portique: true }), 1);
  // F_Tk = 0,6 k L_T (6.26) ; point fixe intermédiaire : 0,6 k (L2 − L1) (6.27) ; dilatation à l'extrémité libre : 20 L_T ≤ 1 100
  proche(RA.forceThermiqueVoie({ k: 40, LT: 30 }).F, 0.6 * 40 * 30);
  proche(RA.forceThermiqueVoie({ k: 20, LT: 25, L1: 10, L2: 25 }).F, 0.6 * 20 * 15);
  proche(RA.forceThermiqueVoie({ dilatation: 'une', LT: 30 }).F, 600);
  proche(RA.forceThermiqueVoie({ dilatation: 'une', LT: 60 }).F, 1100);
  assert.equal(RA.forceThermiqueVoie({ dilatation: 'deux', LT: 30 }).F, 0);
  proche(RA.forceDeformationVoie({ L: 12 }).F, 240); assert.equal(RA.forceDeformationVoie({ dilatation: 'deux', L: 12 }).F, 0);
  const base = { tablierUnique: true, LT: 30, deltaB: 4, deltaH: 2, voieConforme: true, traverses: 'beton', ballast: 0.30, rayon: 0, alpha: 1, dTD: 35, dTR: 50 };
  assert.ok(RA.methodeSimplifiee(base).applicable);
  for (const [k, v] of [['LT', 41], ['deltaB', 5.5], ['deltaH', 6], ['rayon', 1200], ['ballast', 0.25], ['traverses', 'bois'], ['alpha', 1.21], ['tablierUnique', false], ['dTD', 25]])
    assert.ok(!RA.methodeSimplifiee({ ...base, [k]: v }).applicable, `condition ${k}`);   // ΔT_D = 25 : |25 − 50| > 20 K
  assert.ok(RA.methodeSimplifiee({ ...base, alpha: 1.21, alphaSousSW2: true }).applicable);
  assert.equal(RA.limiteDeltaB('continue'), 5); assert.equal(RA.limiteDeltaB('deux'), 30);
});

test('Groupes aux appuis (tableau 6.11) et combinaisons en tête (EN 1990 A2)', () => {
  const long = RA.effortsLongitudinaux({ L: 15, alpha: 1 }), trans = RA.effortsTransversaux({ L: 15, alpha: 1, V: 100, rayon: 1000 });
  const G = RA.groupesAppuis({ nV: 2, long, trans, xi: 0.6, FQ: 300 });
  const g = id => G.find(x => x.id === id);
  // gr11 : démarrage-freinage × 1 × ξ + F_Qk ; centrifuge et lacet × 0,5
  proche(g('gr11').H, 495 * 0.6 + 300); proche(g('gr11').Hy, 0.5 * trans.centrifuge + 0.5 * 100);
  // gr22 : deux voies, longitudinal × 0,5, transversal × 1 sur les deux voies ; F_Qk de deux voies
  proche(g('gr22').H, 0.5 * 795 * 0.6 + 2 * 300); proche(g('gr22').Hy, 2 * trans.centrifuge + 2 * 100);
  assert.equal(g('gr21').gamma, 1.45); assert.equal(g('gr21').psi1, 0.7); assert.equal(g('gr11').psi1, 0.8);
  assert.ok(!G.some(x => x.id === 'gr15'));
  // ELU : 1,35 G + 1,45 Q + 1,35 RF + 1,5 × 0,6 (T + F_T) ; température dominante : 1,35 G + 1,5 (T + F_T) + 1,45 × 0,8 Q
  const C = RA.combinaisonsTeteRail({ G: { N: 1000, P: 0 }, Q: [{ label: 'q', N: 500, H: 100, Hy: 20, gamma: 1.45, psi0: 0.8 }], RF: { H: 10 }, T: { H: 20 }, FT: { H: 30 } });
  const elu = C.find(c => c.label === 'ELU q'), tmp = C.find(c => c.label === 'ELU température');
  proche(elu.N, 1.35 * 1000 + 1.45 * 500); proche(elu.H, 1.45 * 100 + 1.35 * 10 + 1.5 * 0.6 * 50); proche(elu.Hy, 1.45 * 20);
  proche(tmp.N, 1.35 * 1000 + 1.45 * 0.8 * 500); proche(tmp.H, 1.35 * 10 + 1.5 * 50 + 1.45 * 0.8 * 100);
  proche(C.find(c => c.label === 'ELS car. q').H, 100 + 10 + 0.6 * 50);
});

test('Surcharge de remblai (§ 6.3.6.4) et élancement des fûts (§ 6.4.5.4(2))', () => {
  // LM71 × 1 : 250/1,6/3 = 52,08 kN/m² sur 3 m ; mur de 10 m, une voie : q_eq = 52,08 × 3/10
  let s = RA.surchargeCulee({ alpha: 1, nV: 1, largeur: 10 });
  proche(s.qBande, 250 / 1.6 / 3); proche(s.qEq, 250 / 1.6 / 3 * 3 / 10); assert.equal(s.gamma, 1.45);
  // α = 0,83 avec SW/2 : 43,2 < 50 kN/m² (150/3) → SW/2 gouverne, γ = 1,20
  s = RA.surchargeCulee({ alpha: 0.83, sw2: true, nV: 2, largeur: 5 });
  proche(s.qBande, 50); proche(s.qEq, 50 * 5 / 5); assert.equal(s.gamma, 1.20);
  proche(RA.elancementFut({ H: 6, b: 0.8 }), 12 / (0.8 / Math.sqrt(12)));
  proche(RA.elancementFut({ H: 6, D: 1.0 }), 12 / 0.25);
});

/** Travée indépendante de 15 m (appuis seuls) : une voie LM71 × α, appareils fixes sur la culée C0, glissants sur C1. */
function appuisSeuls15(alpha, extra = {}) {
  const d = formDefaults();
  const R71 = 1000;   // réaction caractéristique d'une voie, sans Φ (valeur d'essai)
  const rail = { params: { alpha, nV: 1, sw2: false, V: 0, rayon: 0, memeSens: false, dilatation: 'continue', kVoie: 40, voieConforme: true, dTR: 50, ballast: 0.3, traverses: 'beton' },
    phi: [1.3, 1.3], R71: [R71, R71], RSW2: [0, 0], extremites: [{ appui: 'C0', deltaH: 0.5, deltaV: 0.2, deltaVlim: 3, okV: true }, { appui: 'C1', deltaH: 0.5, deltaV: 0.2, deltaVlim: 3, okV: true }] };
  const D = { ...d, ss_spans: '15', ss_width: '6', ss_Lc: '5', ss_h: '1.2', ss_area: '4', ss_super: '40', ss_nb: '2', ss_bearing: 'auto', ss_iso: 'isostatique', ss_type: 'poutres',
    ss_lines: '1500 ; 1500 ; 0 ; 0 ; 0 ; 0 ; 0 ; 0\n1500 ; 1500 ; 0 ; 0 ; 0 ; 0 ; 0 ; 0', ss_liaisons: 'fixe, glissant', ss_rail: JSON.stringify(rail), ...extra };
  return computeStandalone(parseStandalone(D), parseSupports(D));
}

test('Travée de 15 m, α = 1,21, appareils fixes sur une culée : démarrage-freinage repris par la culée fixe', () => {
  const st = appuisSeuls15(1.21);
  const r = st.supports.rail;
  // longueur d'influence 15 m ; Q_la = 33 × 15 × 1,21 = 598,95 kN (> Q_lb = 363 kN), entièrement sur la ligne fixe
  proche(r.Lh, 15); proche(r.long.une, 33 * 15 * 1.21);
  // α = 1,21 > 1 sans SW/2 : méthode simplifiée hors domaine → ξ = 1, pas de F_Tk ni F_Qk
  assert.ok(!r.simp.applicable); assert.equal(r.xi, 1);
  const g11 = r.groupes.find(g => g.id === 'gr11');
  proche(g11.parLigne[0].H, 33 * 15 * 1.21, 1e-9); proche(g11.parLigne[1].H, 0, 1e-9);
  // réactions : culées sans Φ (1 000 kN), appareils avec Φ (1 300 kN)
  proche(g11.parLigne[0].N, 1000); proche(g11.parLigne[0].Nphi, 1300);
  // combinaison ELU gr11 en tête de C0 : N = 1,35 × 1 500 + 1,45 × 1 000 ; H ≥ 1,45 × 598,95
  const c = st.supports.lines[0].EC.base.find(b => b.label === `ELU ${g11.label}`);
  proche(c.N, 1.35 * 1500 + 1.45 * 1000); assert.ok(c.H >= 1.45 * 33 * 15 * 1.21 - 1e-6);
  // Eurocodes seuls ; ψ2,1 = 0,3 et 80 α kN/m par voie pour le séisme
  assert.equal(st.supports.lines[0].BAEL, null);
  const j = toPontEC8(st, { site: st.supports.sp.ec8 });
  assert.equal(j.site.trafic, 'ferroviaire_trafic_intense'); proche(j.tablier.chargeTrafic, 80 * 1.21);
  const B = supportsBlocks(st.supports, 'F61');
  assert.ok(B.some(b => b.t === 'h2' && /Actions ferroviaires transmises aux appuis/.test(b.text)));
  assert.ok(!B.some(b => b.t === 'comment' && /A\(l\) ou Bc/.test(b.text)));
});

test('Méthode simplifiée applicable : ξ = 0,6, F_Tk et F_Qk sur la ligne fixe', () => {
  // α = 1 : domaine de la méthode ; δ_B sur une culée fixe sur pieux
  const st = appuisSeuls15(1, { ap_found: 'pieux', ap_Lpile: '15', ap_B: '4', ap_hs: '1.2' });
  const r = st.supports.rail;
  assert.ok(r.simp.applicable, r.simp.conditions.filter(c => !c.ok).map(c => c.id).join());
  assert.ok(r.dB <= 5); assert.equal(r.xi, 0.6);
  proche(r.L2 - r.L1, 15);
  // L_T et F_Tk = 0,6 k (L2 − L1), point fixe sur la culée C0 (L1 = 0) ; F_Qk = 20 × 15
  proche(r.FT.F, 0.6 * 40 * (r.L2 - r.L1)); proche(r.FQ.F, 20 * 15);
  const g11 = r.groupes.find(g => g.id === 'gr11');
  proche(g11.H, 0.6 * 33 * 15 + 20 * 15);
});

test('Pont-dalle sous rail : appuis calculés, efforts répartis selon les raideurs, mode routier sans données ferroviaires', () => {
  const d = { ...formDefaults(), trafic: 'ferroviaire', rail_n: '2', rail_alpha: '1', rail_V: '100', rail_r: '1500', methodeTablier: 'guyon' };
  const st = compute(parseData(d));
  assert.equal(st.supportsError, null);
  const r = st.supports.rail, K = st.supports.distE.K.inst, S = K.reduce((a, b) => a + b, 0);
  for (const g of r.groupes) {
    proche(g.parLigne.reduce((a, q) => a + q.H, 0), g.H, 1e-9);                      // somme des parts = total
    g.parLigne.forEach((q, i) => proche(q.H, g.H * K[i] / S, 1e-9));                 // au prorata des raideurs instantanées
  }
  // réactions avec et sans Φ : rapport Φ du tablier
  const g = r.groupes[0];
  proche(g.parLigne[0].Nphi / g.parLigne[0].N, st.rail.phi);                         // culée : sans Φ (§ 6.4.5.4(2))
  g.parLigne.forEach((q, i) => { if (i > 0 && i < g.parLigne.length - 1) proche(q.N, q.phi ? q.Nphi : q.Nphi / st.rail.phi); });
  // mode routier : ni données ferroviaires ni référentiel imposé
  const st0 = compute(parseData({ ...formDefaults(), methodeTablier: 'guyon' }));
  assert.equal(st0.supports.rail, undefined); assert.ok(st0.supports.lines[0].BAEL);
});
