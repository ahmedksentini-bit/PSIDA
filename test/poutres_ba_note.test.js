/**
 * Pont à poutres BA de 15 m (note de calcul « Notes de calcul pont BA », GenieCivilPDF : 4 poutres d'entraxe 2,40 m,
 * hourdis 22 cm, poutre 0,90 m, Fascicule 61 1re classe, BAEL 91) — recoupement des grandeurs que la note établit
 * correctement, et écarts documentés (α de Guyon-Massonnet > 1, b_c omis sur Bc, σ̄_s = 240 MPa au lieu de 215,6 MPa).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { tBeamSLS, limitesELS, etriersBAEL } from '../src/beams/design.js';
import { beamsBlocks } from '../web/beams_view.js';

const T = 9.81, near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PSIDA ${a.toFixed(3)}, note ${b}`);
const D15 = { ...formDefaults(), pt_type: 'BA', pt_geo: 'rect', pt_spans: '15', pt_n: '4', pt_b1: '2.40', pt_hd: '0.22',
  pt_parts: '0.40 0.20 ; 0.35 0.10 ; 0.30 0.60', pt_road: '-3.75, 3.75', pt_foot: '-5,-3.75 ; 3.75,5',
  pt_lines: '3.77 @ -4.9 ; 3.77 @ 4.9 ; 1.30 @ -4.6 ; 1.30 @ 4.6 ; 4.08 @ -4.3 ; 4.08 @ 4.3 ; 0.90 @ -3.85 ; 0.90 @ 3.85 ; 0.50 @ -4.95 ; 0.50 @ 4.95 ; 1.0 @ -4.9 ; 1.0 @ 4.9',
  pt_bands: '0.66 sur -3.75,3.75', pt_fck: '30', pt_fyk: '400', pt_b0: '0.30', pt_cover: '0.08', pt_mil: 'Mc120', pt_ret: '0', pt_extra: String(3.78 * T / 15) };
const r = computePoutres(parsePoutres(D15)), s = r.spans[0], rive = s.beams[0], inter = s.beams[1];
const tot = id => rive.mid[id] * s.beams.length / rive.eta[id] / T;   // moment total de la travée M = M_k n/η_k [t·m]

test('note BA 15 m : charges permanentes, A(l), δ, moments totaux de la travée', () => {
  near(rive.mid.G / T, 89.07, 0.01, 'G poutre de rive [t·m]');
  near(tot('A'), 307.97, 0.03, 'A(l) sur 7,50 m, a₁ = 1, a₂ = 3,5/3,75 [t·m]');
  near(s.deltaB, 1.20, 0.01, 'δ_B'); near(s.deltaC, 1.18, 0.005, 'δ_Mc120');
  near(tot('Mc120'), 328.63 * s.deltaC, 0.025, 'Mc120 δ inclus [t·m] (chenilles discrétisées par PSIDA : + 2 %)');
  // la note omet b_c = 1,10 sur le moment de Bc (189,7 t·m pour deux files de deux camions)
  near(tot('Bc') / s.deltaB / 1.10, 189.7, 0.02, 'Bc sans δ ni b_c [t·m]');
});

test('note BA 15 m : Guyon-Massonnet (α de la note > 1, impossible) et effet sur la poutre de rive', () => {
  assert.ok(s.alpha > 0.15 && s.alpha < 0.35, `α = ${s.alpha}`);     // note : α = 1,107 (inerties de torsion fausses)
  near(s.theta, 0.78, 0.06, 'θ');
  assert.ok(rive.eta.Mc120 > 1.28 + 0.1, 'K Mc120 de rive au-dessus de la valeur de la note (1,28)');
});

test('note BA 15 m : armatures à l\'ELS (fissuration préjudiciable) et effort tranchant BAEL', () => {
  const l = limitesELS({ code: 'BAEL', fck: 30, fyk: 400, fiss: 'prej' });
  near(l.sigS, 215.56, 0.001, 'σ̄_s = 110 √(1,6 × 2,4)');
  // avec le moment de service de la note (218,43 t·m) : A_s = 105 cm² (section en T exacte) ; la note annonce 93,8 cm²
  // (σ_s = 240 MPa en fait) et retient 12 HA32 = 96,5 cm² < 105 cm²
  const As = tBeamSLS({ M: 218.43 * T, beff: 2.4, hf: 0.22, b0: 0.30, d: 1.04, sigS: l.sigS, sigC: l.sigC }).As * 1e4;
  near(As, 105.0, 0.01, 'A_s ELS poutre de rive [cm²]');
  assert.ok(As > 96.5, '12 HA32 insuffisants');
  near(218.43 * 10 / (0.97 * 240e3) * 1e4, 93.8, 0.01, 'valeur de la note (1 t = 10 kN, 240 MPa)');
  // PSIDA : l'ELS gouverne
  assert.ok(rive.BA.ELS.BAEL.As > rive.BA.BAEL.As && rive.BA.retenu.BAEL === rive.BA.ELS.BAEL.As);
  // effort tranchant : V_u de la note (69,2 t) suppose une répartition égale entre les 4 poutres
  const V = etriersBAEL({ Vu: 69.2 * T, b0: 0.30, d: 1.04, fc28: 30, fe: 400 });
  near(V.tau, 2.18, 0.01, 'τ_u de la note'); near(V.tauLim, 3.0, 1e-9, 'τ̄_u FP');
  assert.ok(rive.BA.cisaillementBAEL.Vu > 1.3 * 69.2 * T, 'V_u de rive PSIDA (bras de levier) nettement supérieur');
  assert.ok(beamsBlocks(r).some(b => b.t === 'table' && b.head.some(h => /A_s ELS BAEL/.test(h))));
});
