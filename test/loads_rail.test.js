// Socle ferroviaire EN 1991-2 : valeurs recalculées à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/loads_rail.js';

const proche = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('LM71 et α : essieux, répartie, charge uniforme du groupe', () => {
  const m = R.lm71(1.33);
  assert.equal(m.essieux.length, 4);
  proche(m.essieux[3].x, 4.8); proche(m.essieux[0].Q, 332.5);
  proche(m.qGroupe, 1.33 * 250 / 1.6);          // 207,8 kN/m
  proche(m.qv, 106.4); proche(m.longueurGroupe, 6.4);
  assert.ok(R.estAlphaNormalise(1.33)); assert.ok(!R.estAlphaNormalise(1.2));
});

test('SW/0 prend α, SW/2 non ; train à vide 10 kN/m', () => {
  proche(R.sw('SW/0', 1.21).q, 133 * 1.21);
  proche(R.sw('SW/2', 1.21).q, 150);
  proche(R.sw('SW/2').longueurMotif, 57);         // 2 × 25 + 7
  proche(R.sw('SW/0').longueurMotif, 35.3);
  assert.equal(R.TRAIN_VIDE.qv, 10);
  assert.throws(() => R.sw('SW/1'));
});

test('Excentrement r/18, répartition 1/4-1/2-1/4, diffusion 4:1, surcharge sur remblai', () => {
  proche(R.excentrement(), 0.0833, 1e-4);
  // rapport des roues 1,25:1 ⇒ e = (1,25 − 1)/2,25 × r/2
  proche(R.excentrement(1.5), 0.25 / 2.25 * 0.75, 1e-9);
  const t = R.repartitionTraverses(250, 0.6);
  assert.deepEqual(t.map(x => x.Q), [62.5, 125, 62.5]);
  const d = R.diffusionBallast({ longueurTraverse: 2.6, ballast: 0.4, longueur: 6.4 });
  proche(d.largeur, 2.8); proche(d.longueur, 6.6);
  const s = R.surchargeRemblai(1, true);
  proche(s.lm71, 250 / 1.6 / 3, 1e-9);            // 52,08 kN/m²
  proche(s.sw2, 50); proche(s.q, 52.083);
  proche(R.surchargeRemblai(0.75, true).q, 50);  // SW/2 gouverne quand α < 0,96
});

test('Φ2, Φ3, bornes et réduction de couverture', () => {
  // LΦ = 10 m : √10 = 3,1623 ; Φ3 = 2,16/2,9623 + 0,73 = 1,4592 ; Φ2 = 1,44/2,9623 + 0,82 = 1,3061
  proche(R.phi3(10), 1.4592); proche(R.phi2(10), 1.3061);
  assert.equal(R.phi3(1), 2.00); assert.equal(R.phi2(1), 1.67);
  assert.equal(R.phi3(1000), 1.00);
  // LΦ = 3,60 m (consoles e ≤ 0,50 m, abouts) : Φ3 = 2,00 — cohérent avec le tableau 6.2
  proche(R.phi3(3.6), 2.0, 5e-3);
  const c = R.coefficientDynamique({ LPhi: 10, h: 1.8 });
  assert.equal(c.nom, 'Φ3'); proche(c.phi, 1.4592 - 0.08);
  proche(R.coefficientDynamique({ LPhi: 10, h: 9 }).phi, 1.0);
  assert.throws(() => R.coefficientDynamique({ LPhi: 0 }));
});

test('Longueur déterminante (tableau 6.2)', () => {
  proche(R.longueurDeterminante('simple', { portee: 18 }).LPhi, 18);
  // deux travées de 24 m : 1,2 × 24 = 28,8 m (exemple MIDAS « Train Load Analysis EN 1991-2 »)
  proche(R.longueurDeterminante('continue', { portees: [24, 24] }).LPhi, 28.8);
  // 3 travées 20/30/20 : 1,3 × 23,33 = 30,33 ≥ 30
  proche(R.longueurDeterminante('continue', { portees: [20, 30, 20] }).LPhi, 30.333);
  // travées très inégales : max Li gouverne
  proche(R.longueurDeterminante('continue', { portees: [10, 40] }).LPhi, 40);
  assert.equal(R.kContinu(7), 1.5);
  proche(R.longueurDeterminante('arc', { portee: 60 }).LPhi, 30);
  proche(R.longueurDeterminante('dalle_entretoises', { espacement: 3, LPhiPrincipal: 5 }).LPhi, 5);
  assert.equal(R.longueurDeterminante('console', { e: 0.8 }).etudeSpecifique, true);
  proche(R.longueurDeterminante('about', {}).LPhi, 3.6);
  assert.throws(() => R.longueurDeterminante('pont-levis'));
});

test('Force centrifuge et coefficient f', () => {
  assert.equal(R.facteurF(120, 100), 1); assert.equal(R.facteurF(200, 2.5), 1);
  // V = 160, Lf = 150 : 1 − 0,04 × (5,0875 + 1,75) × (1 − √(2,88/150)) = 0,7644
  proche(R.facteurF(160, 150), 0.7644, 1e-4);
  proche(R.facteurF(160, 1e4), R.facteurF(160, 150), 1e-12);
  // V = 300, Lf = 150 : 1 − 0,18 × 4,4633 × 0,86144 = 0,308 → plancher 0,35
  assert.equal(R.facteurF(300, 150), 0.35); assert.equal(R.facteurF(350, 150), 0.35);
  // α·LM71 à 100 km/h, r = 600 m : V²/(127 r) = 0,13123 ; Qt = 0,13123 × 250 = 32,81 kN
  const c = R.forceCentrifuge({ V: 100, r: 600, Qv: 250, qv: 80 });
  proche(c.Qt, 32.808); proche(c.qt, 10.499); assert.equal(c.hauteur, 1.8);
  assert.equal(R.forceCentrifuge({ V: 100, r: 0, Qv: 250 }).Qt, 0);
  // tableau 6.7 (NF EN 1991-2) : f lu dans le tableau, au centième
  for (const [V, Lf, t] of [[160, 10, 0.87], [200, 10, 0.78], [250, 20, 0.60], [300, 6, 0.75], [200, 100, 0.61], [300, 50, 0.39], [250, 150, 0.44]])
    proche(R.facteurF(V, Lf), t, 0.006);
  // tableau 6.8 : V > 120 km/h → (7)b à V avec α = 1 et f, (7)a à 120 km/h avec α et f = 1, et le cas sans centrifuge
  let k = R.casCentrifuge(160, 1.33, 150);
  assert.equal(k.length, 3);
  assert.deepEqual([k[0].V, k[0].alpha, k[0].verticale], [160, 1, 1]); proche(k[0].f, 0.7644, 1e-4); assert.ok(k[0].horsDomaine);
  assert.deepEqual([k[1].V, k[1].alpha, k[1].f, k[1].verticale], [120, 1.33, 1, 1.33]);
  assert.ok(k[2].sansCentrifuge); assert.equal(k[2].verticale, 1.33);
  k = R.casCentrifuge(160, 0.91, 150);   // α < 1 : centrifuge à V avec α = 1 (note c), verticale associée α
  assert.deepEqual([k[0].alpha, k[0].verticale, k[0].verticaleFavorable], [1, 0.91, 0.455]); assert.ok(!k[0].horsDomaine);
  assert.deepEqual([k[1].V, k[1].alpha], [120, 0.91]);
  k = R.casCentrifuge(100, 1.33);
  assert.equal(k.length, 2); assert.deepEqual([k[0].V, k[0].alpha, k[0].f], [100, 1.33, 1]);
  k = R.casCentrifuge(160, 1.33, 150, { modele: 'SW/2' });
  assert.deepEqual([k[0].V, k[0].alpha, k[0].f], [80, 1, 1]);
});

test('Lacet, démarrage et freinage', () => {
  assert.equal(R.effortLacet(1), 100); assert.equal(R.effortLacet(0.83), 100); proche(R.effortLacet(1.33), 133);
  let f = R.demarrageFreinage(20, { alpha: 1 });
  assert.equal(f.demarrage, 660); assert.equal(f.freinage, 400);
  f = R.demarrageFreinage(50, { alpha: 1.33 });
  proche(f.demarrage, 1330); proche(f.freinage, 1330);   // 1000 × 1,33 ; 20 × 50 × 1,33
  f = R.demarrageFreinage(400, { alpha: 1 });
  assert.equal(f.demarrage, 1000); assert.equal(f.freinage, 6000); assert.ok(f.auDela300);
  f = R.demarrageFreinage(100, { modele: 'SW/2', alpha: 1.33 });
  assert.equal(f.demarrage, 1000); assert.equal(f.freinage, 3500);
});

test('Groupes de charges, γ et ψ', () => {
  const g1 = R.groupesApplicables({ nbVoies: 1 });
  assert.deepEqual(g1.map(g => g.id), ['gr11', 'gr12', 'gr13', 'gr14', 'gr15']);
  assert.ok(R.groupesApplicables({ nbVoies: 1, sw2: true }).some(g => g.id === 'gr17'));
  const g2 = R.groupesApplicables({ nbVoies: 2, sw2: true });
  // deux voies : gr11 à gr27 sauf gr15 (légende du tableau 6.11)
  assert.deepEqual(g2.map(g => g.id), ['gr11', 'gr12', 'gr13', 'gr14', 'gr16', 'gr17', 'gr21', 'gr22', 'gr23', 'gr24', 'gr26', 'gr27']);
  assert.equal(g2.find(g => g.id === 'gr26').vert.autreVoie, 'LM71');
  const g3 = R.groupesApplicables({ nbVoies: 3 });
  assert.equal(g3.at(-1).id, 'gr31'); assert.ok(!g3.some(g => g.id === 'gr15')); assert.ok(g3.some(g => g.id === 'gr11'));
  const eff = { vertical: 1000, longitudinal: 200, centrifuge: 80, lacet: 30 };
  const gr11 = g1[0], gr13 = g1[2];
  proche(R.valeurGroupe(gr11, eff).total, 1000 + 200 + 40 + 15);
  // vertical favorable : gr13 → 0,5 ; composantes non dominantes favorables → 0
  proche(R.valeurGroupe(gr13, eff, { vertical: true, centrifuge: true }).total, 500 + 200 + 0 + 15);
  proche(R.valeurGroupe(gr11, eff, { vertical: true }).total, 1255);  // gr11 : pas de réduction du vertical
  // note (5) : le freinage de gr11 vaut 1 mais n'est pas dominant → nul s'il est favorable ; celui de gr13 est dominant
  proche(R.valeurGroupe(gr11, eff, { longitudinal: true }).total, 1000 + 0 + 40 + 15);
  proche(R.valeurGroupe(gr13, eff, { longitudinal: true }).total, 1000 + 200 + 40 + 15);
  const gr14 = g1[3];
  proche(R.valeurGroupe(gr14, eff, { centrifuge: true, lacet: true, longitudinal: true }).total, 1000 + 0 + 80 + 30);
  assert.equal(R.gammaGroupe('gr11'), 1.45); assert.equal(R.gammaGroupe('gr27'), 1.20);
  assert.equal(R.GAMMA['SW/2'], 1.20); assert.equal(R.GAMMA.autres, 1.50);
  assert.deepEqual(R.psi('gr11'), { psi0: 0.8, psi1: 0.8, psi2: 0 });
  assert.equal(R.psi('gr24').psi1, 0.7); assert.equal(R.psi('gr31').psi1, 0.6);
  assert.equal(R.psi('LM71', 3).psi1, 0.6); assert.equal(R.psi('SW/2').psi0, 0);
  assert.deepEqual(R.A_CONFIRMER, []);
  // tableau A2.3 : poussée des terres due au trafic, ψ1 selon le nombre de voies (note 1) ; composantes horizontales = verticale associée
  assert.deepEqual(R.psi('poussee_trafic', 2), { psi0: 0.8, psi1: 0.7, psi2: 0 });
  assert.deepEqual(R.psi('freinage', 3), R.psi('LM71', 3)); assert.deepEqual(R.psi('centrifuge', 1, { associee: 'SW/2' }), R.psi('SW/2'));
  assert.equal(R.psi('gr17').psi1, 0.8); assert.deepEqual(R.psi('temperature'), { psi0: 0.6, psi1: 0.6, psi2: 0.5 });
  assert.deepEqual(R.psi('HSLM'), { psi0: 1, psi1: 1, psi2: 0 });
  assert.match(R.notesReferentiel({ alpha: 1 })[0], /gestionnaire du réseau/);
});

test('Cadre sous rail : SW/2 ne prend pas α, SW/0 et LM71 si', async () => {
  const { chargesFerroviaires } = await import('../src/cadre/rail.js');
  const geom = { n: 1, B: 4, H: 3, Hr: 1, et: 0.4 }, g = { ouv: [4], h: 3, et: 0.4, er: 0.4, ep: 0.4, ei: 0.4 };
  const d = a => Object.fromEntries(chargesFerroviaires(geom, g, { alpha: a, sw2: true }).derivations.map(x => [x.sys, x.q]));
  const d1 = d(1), d2 = d(1.33);
  proche(d2['SW/2'], d1['SW/2'], 1e-12);
  proche(d2['SW/0'] / d1['SW/0'], 1.33, 1e-9);
  proche(d2.LM71 / d1.LM71, 1.33, 1e-9);
});

test('Superstructure de voie (EN 1991-1-1 tableau A.6, § 5.2.3)', () => {
  // deux voies à ± 2,10 m, ballast 0,30 m sous traverses de 2,60 × 0,22 m, béton : calcul à la main
  const S = R.superstructureVoie({ voies: [-2.1, 2.1], ballast: 0.30, hTraverse: 0.22, longueurTraverse: 2.60 });
  // lit B = 2,60 + 2 × 0,50 = 3,60 m ; bande de −2,1 − 1,8 = −3,9 à +3,9 m ; q = 20 × 0,52 = 10,4 kN/m², k 0,7/1,3
  assert.equal(S.bandes.length, 1); proche(S.bandes[0].q, 10.4); proche(S.bandes[0].y1, -3.9); proche(S.bandes[0].y2, 3.9);
  assert.deepEqual([S.bandes[0].kmin, S.bandes[0].kmax], [0.7, 1.3]);
  // par voie : 1,2 + 4,8 − 20 × 4,8/25 = 6,0 − 3,84 = 2,16 kN/m à l'axe, valeur nominale
  assert.equal(S.lignes.length, 2); proche(S.lignes[0].g, 2.16); assert.equal(S.lignes[1].e, 2.1); assert.equal(S.lignes[0].kmax, 1);
  // une voie, ballast basaltique, traverses bois, lit imposé de 4 m, tablier de ± 1,8 m : bande bornée, volume bois non déduit
  const T = R.superstructureVoie({ voies: [0], ballast: 0.35, hTraverse: 0.15, longueurTraverse: 2.60, largeurBallast: 4, typeBallast: 'basaltique', typeTraverse: 'bois', limites: [-1.8, 1.8] });
  proche(T.bandes[0].q, 26 * 0.5); proche(T.bandes[0].y1, -1.8); proche(T.lignes[0].g, 1.2 + 1.9); assert.ok(T.detail.traversesBois);
});
