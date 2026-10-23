// Poutres PRAD (pré-tension) : pertes au relâchement, transmission, gainage, chaîne complète et plans
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { betonEC2 } from '../src/phasage/fluage.js';
import { planToronsPRAD } from '../src/plans/prad.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);
const PRAD = { pt_geo: 'dims', pt_spans: '25', pt_n: '6', pt_b1: '2.2', pt_hd: '0.22', pt_road: '-5, 5', pt_foot: '-6.6,-5 ; 5,6.6', pt_lines: '10 @ -6.5 ; 10 @ 6.5', pt_bands: '1.79 sur -5,5', pt_type: 'PRAD', pt_fck: '50',
  pt_hp: '1.10', pt_bt: '1.00', pt_hte: '0.10', pt_pt: '0.10', pt_gt: '0.10', pt_b0v: '0.18', pt_bta: '0.70', pt_hpi: '0.20', pt_tpan: '1.0', pt_b0a: '0.18', pt_Lb: '0', pt_t1: '1', pt_t2: '30', pt_t3: '60',
  pr_nt: '24', pr_nsup: '2', pr_g1n: '4', pr_g1L: '2', pr_g2n: '4', pr_g2L: '4', pr_dT: '45', pr_hetuv: '16' };
const r = computePoutres(parsePoutres(PRAD)), b = r.spans[0].beams.reduce((a, q) => (q.vipp.elu.at(-1).MEd > a.vipp.elu.at(-1).MEd ? q : a)), v = b.vipp, pr = v.prad;

test('PRAD : tension sur banc, pertes au relâchement, longueur de transmission (EN 1992-1-1 § 5.10, 8.10.2)', () => {
  near(pr.sigPi, Math.min(0.8 * 1860, 0.9 * 1640), 1e-12, 'σ_pi');
  near(pr.dTh, 0.5 * 195000 * 1e-5 * 45, 1e-12, 'étuvage');
  near(pr.sigPm0, pr.sigPi - pr.dRel - pr.dTh - pr.sigEl, 1e-12, 'σ_pm0');
  // raccourcissement élastique : E_p σ_c / E_cm(t) avec σ_c au c.d.g. des torons sous P_m0 et le poids propre
  const P = v.S.poutre, Pm0 = pr.sigPm0 * pr.Ap * 1000, Mg = P.A * 25 * 25 * 25 / 8, e = pr.e;
  const sc = (Pm0 / P.A + Pm0 * e * e / P.I - Mg * e / P.I) / 1000;
  near(pr.sigEl, 195000 * sc / pr.Ecm, 1e-6, 'Δσ_el');
  const tEq = 1 + (16 / 24) * (Math.exp(-4000 / (273 + 65) + 13.65) - 1), fctd = 0.7 * betonEC2({ fck: 50 }).fctmT(tEq) / 1.5;
  near(pr.lpt, 1.0 * 0.19 * 0.0157 * pr.sigPm0 / (3.2 * fctd), 1e-9, 'l_pt');
  assert.ok(v.ancrage.lbpd > pr.lpt2, 'l_bpd > l_pt2');
});

test('PRAD : gainage — groupes appliqués au-delà de L_g + l_pt/2, chaîne vérifiée', () => {
  const C = v.modele.cables, nb = v.modele.barres.length / 2;
  assert.equal(C[0].segments.length, nb, 'groupe adhérent sur toute la longueur');
  assert.ok(C[1].segments.length < nb && C[2].segments.length < C[1].segments.length, 'groupes gainés raccourcis');
  assert.ok(v.modele.phases[0].nom.startsWith('Relâchement'));
  assert.ok(v.ok, [...v.verifs.filter(q => !q.ok).map(q => q.nom), ...v.elu.filter(q => !q.ok).map(q => 'ELU ' + q.x)].join(', '));
  assert.ok(v.tranchant.every(t => t.Vpd === 0 && t.bwn === t.bw), 'torons rectilignes, âme pleine');
  assert.ok(v.conception.some(d => /1\/18 à 1\/20/.test(d.texte)));
});

test('PRAD : plan des torons', () => {
  const F = planToronsPRAD(v);
  assert.ok(F.valide().ok, F.valide().problemes.join(' ; '));
});
