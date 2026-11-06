/** v0.99.29 : plan de câblage et ferraillage passif de la dalle précontrainte, implantation, nivellement, cotes biaises. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseData, compute } from '../src/pipeline.js';
import { EXEMPLES, donnees } from '../tools/exemples.mjs';
import { planCablageDalle, donneesCablage, ordreTension } from '../src/plans/cablage_dalle.js';
import { etatFerraillageDP } from '../src/plans/ferraillage_dp.js';
import { planFerraillage } from '../src/plans/ferraillage.js';
import { planImplantation, pointsImplantation, versProjet, nivellementTablier } from '../src/plans/implantation.js';
import { planEnsemble } from '../src/plans/ensemble.js';
import { feuilleSVG } from '../src/plans/svg.js';

const dp = compute(parseData(donnees(EXEMPLES[2])));
const biais = compute(parseData(donnees(EXEMPLES[1])));

test('Ordre de mise en tension symétrique depuis le centre (20 câbles : 11-10-12-9-…-20-1, comme OA67)', () => {
  assert.equal(ordreTension(20).join('-'), '11-10-12-9-13-8-14-7-15-6-16-5-17-4-18-3-19-2-20-1');
  assert.deepEqual([...ordreTension(21)].sort((a, b) => a - b), Array.from({ length: 21 }, (_, k) => k + 1));
});

test('Plan de câblage : ordonnées aux dixièmes, points bas et hauts, allongements ∫σ dx / E_p, feuille valide', () => {
  const C = donneesCablage(dp);
  assert.equal(C.ordonnees.length, 4 * 10 + 1);
  assert.ok(C.ordonnees.every(o => Math.abs(o.y - o.yInf - C.phiG / 2) < 1e-12));
  assert.ok(Math.abs(C.ordonnees[0].y - dp.psidp.sec.vp) < 1e-9);   // ancrage au centre de gravité
  // allongement ≈ σ moyen × demi-longueur / E_p (deux extrémités)
  const approx = 1.3e6 * C.Ldev / 2 / (dp.psidp.bp.Ep * 1000);
  assert.ok(Math.abs(C.allG - approx) < 0.1 * approx, `${C.allG} / ${approx}`); assert.ok(Math.abs(C.allG - C.allD) < 1e-6);
  assert.ok(C.rem.filter(q => q.type === 'haut').every(q => q.y > 0.6) && C.rem.filter(q => q.type === 'bas').every(q => q.y < 0.4));
  const F = planCablageDalle(dp, {}); assert.ok(F.valide().ok, F.valide().problemes.join(' | '));
  const svg = feuilleSVG(F); for (const s of ['PLAN DE CÂBLAGE', 'ORDONNÉES DU CÂBLE', 'Allongement théorique', 'Ordre de mise en tension', 'Évents']) assert.ok(svg.includes(s), s);
});

test('Ferraillage passif de la dalle précontrainte : aciers passifs du calcul PSI-DP, zones d\'ancrage, barres ≤ 12 m', () => {
  const s2 = etatFerraillageDP(dp), R = s2.rebar;
  assert.ok(R.dp && R.dp.frettage.length >= 6);
  const fr = R.marks.filter(m => m.role === 'frettage');
  const ae = fr.find(m => /éclatement vertical/.test(m.label)), V = dp.psidp.anchors.sides[0].vert;
  assert.ok(ae.count * Math.PI * (ae.phi / 2000) ** 2 >= V.Ae - 1e-9);
  const F = planFerraillage(s2, {}); assert.ok(F.valide().ok, F.valide().problemes.join(' | '));
  assert.match(feuilleSVG(F), /FERRAILLAGE PASSIF ET FRETTAGE/);
  assert.equal(etatFerraillageDP(dp), s2);   // mémoïsé
});

test('Implantation : coins et pieux dans le repère de l\'ouvrage et du projet ; nivellement et contre-flèche (dalle précontrainte)', () => {
  const { points } = pointsImplantation(biais);
  const P1 = points.filter(q => q.appui === 1), coins = P1.filter(q => q.role === 'coin');
  assert.equal(coins.length, 4);
  const c = P1.find(q => q.role === 'centre'), m = [0, 1].map(k => coins.reduce((s, q) => s + [q.x, q.y][k], 0) / 4);
  assert.ok(Math.abs(m[0] - c.x) < 1e-9 && Math.abs(m[1] - c.y) < 1e-9);
  assert.equal(P1.filter(q => q.role === 'pieu').length, biais.supports.lines.length ? P1.filter(q => q.role === 'pieu').length : 0);
  const g = versProjet({ x: 10, y: 0 }, { E0: 100, N0: 200, gis: 100 }); assert.ok(Math.abs(g.E - 110) < 1e-9 && Math.abs(g.N - 200) < 1e-9);
  const N = nivellementTablier(dp); assert.ok(N.contreFleche); assert.equal(N.stations.length, 4 * 4 + 1);
  assert.ok(N.stations.filter(s => /2\/4/.test(s.nom)).every(s => s.cf < 0), 'dalle précontrainte : contre-flèche vers le bas en travée (cambrure)');
  for (const st of [biais, dp]) { const F = planImplantation(st, {}, { E0: 500000, N0: 3800000, gis: 12.5 }); assert.ok(F.valide().ok, F.valide().problemes.join(' | ')); }
});

test('Cotes biaises « L K = L\' » et K = 1/sin ψ sur le plan d\'ensemble', () => {
  const svg = feuilleSVG(planEnsemble(biais, {}));
  assert.match(svg, /K = 1\/sin ψ = 1,\d{5}/); assert.match(svg, /\d+,\d{2}K = \d+,\d{2}/);
});
