/**
 * Précontrainte longitudinale selon l'EN 1992-1-1 (règles des pertes « EC2 ») — calage sur la note de calcul du tablier EC6
 * (A640-NDC-SOR-L5-EXE-GC-OAS-NOC-0502-A, autoroute Tunis–Jelma, lot 5 ; modèle SCIA) : dalle précontrainte 2 travées
 * 23,13 + 25,76 m (biais 120 gr), 27 câbles 12T15S, B = 11,499 m², I = 0,7991 m⁴, v = 0,5207 m. Tracé (§ 18) et contrainte
 * « finale » des câbles (annexe 13) repris de la note ; valeurs de référence : recalcul manuel indépendant (tableur) des
 * pertes différées (5.46), du moment hyperstatique et des contraintes ELS, la note SCIA ne comptant aucune perte différée.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relaxationEC2, cablePoints } from '../src/psidp/prestress.js';
import { concreteEC2, parsePairs } from '../src/psidp/index.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { psidpBlocks } from '../web/psidp_view.js';

const NOTE = JSON.parse(readFileSync(new URL('./data/ec6_note.json', import.meta.url), 'utf8'));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} : attendu ${b}, obtenu ${a}`);

test('EN 1992-1-1 — relaxation (3.29), résistances au jeune âge (3.1.2), table de points', () => {
  // classe 2, ρ1000 = 2,5 %, σ_pi = 1 400 MPa, f_pk = 1 860 MPa, 500 000 h : 0,66 · 2,5 · e^(9,1 μ) · 500^(0,75(1−μ)) · 10⁻⁵ σ
  near(relaxationEC2(1400, { fpk: 1860, rho1000: 2.5, cls: 2 }), 69.0, 0.3, 'Δσ_pr classe 2');
  assert.equal(relaxationEC2(900, { fpk: 1860 }), 0, 'μ < 0,5 : pas de relaxation');
  assert.ok(relaxationEC2(1400, { fpk: 1860, rho1000: 8, cls: 1 }) > relaxationEC2(1400, { fpk: 1860, rho1000: 2.5, cls: 2 }));
  // C35/45 à 5 jours, ciment N : β_cc = e^(0,25(1 − √(28/5))) = 0,7106 ; f_cm(t) = 30,56 MPa ; f_ck(t) = 22,56 MPa (note : 22,57)
  const c = concreteEC2(35, 5, 'N');
  near(c.fctm, 3.21, 0.005, 'f_ctm'); near(c.Ecm, 34077, 1, 'E_cm'); near(c.bcc, 0.7106, 1e-3, 'β_cc'); near(c.fckt, 22.56, 0.02, 'f_ck(t)');
  near(concreteEC2(35, 5, 'N', 22.57).fckt, 22.57, 1e-9, 'f_ck(t) imposé (note : 22,57 MPa à 5 j)');
  assert.deepEqual(parsePairs('0 1,5 ; 2.5 3\n4, 5'), [[0, 1.5], [2.5, 3], [4, 5]]);
  // spline : passe par les points, pente continue, rayon minimal fini
  const g = cablePoints([23.13, 25.76], NOTE.points_inf.map(([x, z]) => [x, z - 0.4793]));
  for (const [x, z] of NOTE.points_inf) if (x >= 0 && x <= 48.89) near(g.z(x), z - 0.4793, 1e-9, `z(${x})`);
  near(g.slope(23.1311 - 1e-6), g.slope(23.1311 + 1e-6), 1e-6, 'pente continue sur la pile');
  assert.ok(g.checks().Rmin > 20 && g.checks().Rmin < 200, `R_min ${g.checks().Rmin}`);
});

const EC6 = () => ({ ...formDefaults(),
  spans: NOTE.spans.join(', '), width: '13.6', h: '1.00', area: '11.499', overhangs: '0, 0', hEdge: '0.20', joue: '1.5', roadway: '-6.3, 6.3', footways: '',
  lines: '5.3 k 0.95/1.05 @ -6.6 ; 5.3 k 0.95/1.05 @ 6.6 ; 0.65 k 0.95/1.05 @ -6.4 ; 0.65 k 0.95/1.05 @ 6.4 ; 0.36 k 0.95/1.05 @ -6.75 ; 0.36 k 0.95/1.05 @ 6.75 ; 7.5 k 0.95/1.05 @ 0',
  bands: '1.68 sur -6.3,6.3 k 0.8/1.4 ; 0.088 sur -6.8,6.8 k 0.95/1.05 ; 6.75 sur -6.8,-6.3 k 0.95/1.05 ; 6.75 sur 6.3,6.8 k 0.95/1.05',
  ys: '-6.8,-5.3,-3,-1.5,0,1.5,3,5.3,6.8', EI: '34100, 0.7991', fck: '35', fyk: '500', psi: '80', dT: '10.8, -6', delta: '0.01', phiFluage: '2', tRev: '0.074', alpha: 'FR2',
  withTherm: 'on', nBearings: '4', tassProb: NOTE.tassProb_mm.join(', '),
  bp_actif: 'on', bp_reg: 'EC2', bp_n: '27', bp_unite: '12', bp_f: '0.17', bp_k: '0.007', bp_g: '6', bp_Ep: '195000', bp_sigma0: '1476', bp_fprg: '1860', bp_fpeg: '1640', bp_rho1000: '2.5',
  bp_j: '5', bp_fcj: '22.57', bp_phiC: '2', bp_epsCs: '0.00032', bp_decomp: 'qp', bp_ptsRef: 'inf',
  bp_pts: NOTE.points_inf.map(([x, z]) => `${x} ${z}`).join(' ; '), bp_sigx: NOTE.sigma_finale.map(([x, s]) => `${x} ${s}`).join(' ; '),
  bp_secB: '11.499', bp_secI: '0.7991', bp_secV: '0.5207' });

test('Tassements probables par appui : M_pile = −3 E I_v δ/(L1 L2), cumulés à l\'aléatoire', () => {
  const st = compute(parseData({ ...EC6(), bp_actif: '' }));
  const L1 = 23.13, L2 = 25.76, d = 8.1e-3 - (25.1e-3 * L2 + 22.1e-3 * L1) / (L1 + L2);   // pile plus haute que la corde
  const kPile = st.deck.beam.sections.findIndex(s => Math.abs(s.x - L1) < 1e-6);
  near(st.settle.prob.M[kPile], 3 * 34100e3 * 0.7991 / 3 * d / (L1 * L2), 1, 'moment de tassement probable sur pile (E/(1+φ), φ = 2)');
  near(st.settle.Mmin[kPile], st.settle.prob.M[kPile] - st.settle.Mmax[kPile] + st.settle.prob.M[kPile], 1e-6, 'enveloppe probable ± aléatoire');
  const st0 = compute(parseData({ ...EC6(), bp_actif: '', tassProb: '' }));
  assert.equal(st0.settle.prob, null); near(st0.settle.Mmax[kPile], -st0.settle.Mmin[kPile], 1e-9, 'aléatoire seul : symétrique');
});

test('Note EC6 — pertes différées EN 1992-1-1 (5.46), hyperstatique, contraintes ELS et décompression', () => {
  const st = compute(parseData(EC6()));
  assert.equal(st.psidpError, null, st.psidpError);
  const dp = st.psidp, r = dp.r, L1 = 23.13;
  assert.ok(dp.isEC2 && r.imposed && dp.sec.imposee && dp.points.length === 51);
  // contrainte imposée : σ_pi = « contrainte finale » SCIA ; P0 moyen ≈ 68,0 MN
  near(r.at(r.spi, 0.4 * L1) / 1000, 1395, 1, 'σ_pi 0,4 L1');
  near(r.MT.moy.F.reduce((a, v) => a + v, 0) / r.MT.moy.F.length / 1000, 68.0, 0.15, 'P0 moyen [MN]');
  // pertes différées (recalcul manuel : 192 / 180 / 172 MPa, 12 à 14 %) ; P∞ moyen 59,3 MN au lieu des 68 MN de la note
  for (const [x, v] of [[0.4 * L1, 192], [L1, 180], [L1 + 0.6 * 25.76, 172]]) near(r.at(r.delayed.dSd, x) / 1000, v, 2, `Δσ_c+s+r x = ${x.toFixed(2)}`);
  near(r.ES.moy.F.reduce((a, v) => a + v, 0) / r.ES.moy.F.length / 1000, 59.3, 0.3, 'P∞ moyen [MN]');
  // moment hyperstatique sur pile : 8 170 kN·m (P0) et 7 110 kN·m (P∞) — recalcul manuel
  near(r.MT.moy.hyp.X[1], 8170, 40, 'M_hyp P0'); near(r.ES.moy.hyp.X[1], 7109, 40, 'M_hyp P∞');
  near(r.ES.max.F[10] / r.ES.moy.F[10], 1.1, 1e-9, 'P_k,sup'); near(r.ES.min.F[10] / r.ES.moy.F[10], 0.9, 1e-9, 'P_k,inf');
  const E = Object.fromEntries(dp.c.extremes.map(e => [e.lab, e]));
  const car = E['Temps infini (P_m∞) — caractéristique'], qp = E['Temps infini (P_m∞) — quasi permanente'], mt = E['Mise en tension (poids propre, P_k,sup / P_k,inf à t0)'];
  // traction caractéristique ≈ −4 MPa > f_ctm = 3,21 MPa (l'annexe 6 de la note donne déjà 3,3 MPa, son texte retient 2,8) : fissuration à maîtriser
  assert.ok(car.hors < -3.5e3 && car.hors > -4.6e3 && !car.ok, `traction caractéristique ${car.hors}`);
  assert.ok(car.cmax < 0.6 * 35e3, 'compression caractéristique ≤ 0,6 f_ck');
  // décompression quasi permanente (XC4) vérifiée ; compression quasi permanente ≤ 0,45 f_ck
  assert.ok(qp.ok && qp.enc > 0 && qp.cmax < 0.45 * 35e3, `QP : enc ${qp.enc}, c ${qp.cmax}`);
  // mise en tension à 5 jours (f_ck(t) = 22,57 MPa) : compression ≈ 16 MPa > 0,6 f_ck(t) = 13,5 MPa avec P_k,sup
  near(mt.cLim / 1000, 13.54, 0.01, '0,6 f_ck(t)'); assert.ok(mt.cmax > mt.cLim && !mt.ok, `mise en tension ${mt.cmax}`);
  // ELU et effort tranchant vérifiés sans armatures d'effort tranchant (σ_cp compté)
  assert.ok(dp.c.elu.every(q => q.min.ok && q.max.ok), 'ELU');
  assert.ok(dp.c.shear.length === 4 && dp.c.shear.every(q => q.ok && !q.need), 'tranchant');
  // raccourcissements transmis aux appuis : élastique σ_m/E_cm(t), fluage φ σ_m/E_cm, retrait ε_cs
  near(dp.shorten.fl / (2 * dp.shorten.sigm / dp.ec2.Ecm), 1, 1e-9, 'fluage'); near(dp.shorten.r, 3.2e-4, 1e-12, 'retrait');
  // présentation : blocs EC2 (titres, points, tranchant)
  const B = psidpBlocks(dp), txt = JSON.stringify(B);
  assert.ok(txt.includes('EN 1992-1-1 § 5.10.2.2') && txt.includes('spline cubique') && txt.includes('6.2.2'));
});
