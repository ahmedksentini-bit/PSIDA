/** v0.99.30 : dalle de transition (calcul, plan, nomenclature), contre-flèche des dalles armées, profil en long parabolique, calepinage des corniches. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseData, compute } from '../src/pipeline.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { EXEMPLES, donnees } from '../tools/exemples.mjs';
import { enveloppeConvoi, intensite, calculDalleTransition, epaisseurDalleTransition } from '../src/supports/dalle_transition.js';
import { planDalleTransition, dalleTransitionCulee, reperesDalleTransition, culeesAvecDalle } from '../src/plans/dalle_transition.js';
import { geometrieAppui } from '../src/plans/appuis.js';
import { controlesPlans } from '../src/plans/controles.js';
import { flecheLongTermeBA } from '../src/fleche_ba.js';
import { nivellementTablier, planImplantation } from '../src/plans/implantation.js';
import { calepinageCorniches, planEquipements, EQ_DEFAUTS } from '../src/plans/equipements.js';
import { feuilleSVG } from '../src/plans/svg.js';

const st = compute(parseData(formDefaults()));
const biais = compute(parseData(donnees(EXEMPLES[1])));

test('Enveloppe d\'un convoi sur poutre isostatique : PL/4, deux charges 2P(L/2 − a/4)²/L, tranchant à d avec β', () => {
  const L = 4.7;
  const r1 = enveloppeConvoi(L, u => [{ x: u, a: 0.001, P: 100 }]);
  assert.ok(Math.abs(r1.M - 100 * L / 4) < 0.5);
  assert.ok(Math.abs(r1.V - 100) < 1.5);                               // sans section à d : réaction (pas de 5 cm)
  const r2 = enveloppeConvoi(L, u => [{ x: u, a: 0.001, P: 100 }, { x: u + 1.2, a: 0.001, P: 100 }]);
  assert.ok(Math.abs(r2.M - 200 * (L / 2 - 0.3) ** 2 / L) < 1);
  const r3 = enveloppeConvoi(L, u => [{ x: u, a: 0.001, P: 100 }], { d: 0.25 });
  assert.ok(Math.abs(r3.V - 100 * (L - 0.5) / L) < 1.5);                 // charge à 2d : β = 1
});

test('Intensité transversale : charges voisines regroupées (Heft 240), bords tronqués', () => {
  // une roue au milieu d'une large dalle : F / (t + Δb)
  assert.ok(Math.abs(intensite(20, [{ y: 0, F: 100 }], 1, 1, 10) - 50) < 1e-9);
  // deux roues dont les largeurs se recouvrent : un seul groupe de largeur (Δy + t) + Δb
  assert.ok(Math.abs(intensite(20, [{ y: 0, F: 100 }, { y: 1, F: 100 }], 1, 1, 10) - 200 / 3) < 1e-9);
  // roues éloignées : pas de cumul
  assert.ok(Math.abs(intensite(20, [{ y: 0, F: 100 }, { y: 5, F: 100 }], 1, 1, 5) - 50) < 1e-9);
  // roue au bord : largeur tronquée
  assert.ok(Math.abs(intensite(20, [{ y: 0.5, F: 100 }], 1, 1, 0) - 100 / 1.5) < 1e-9);
});

test('Dalle de transition 5 m × 0,30 : HA20 e = 0,10 en nappe inférieure (comme le plan OA68 FER-30), tranchant sans armatures', () => {
  const K = calculDalleTransition({ L: 5, e: 0.30, B: 11.36, hc0: 0.30, fck: 30, fyk: 500, cSup: 0.05, cInf: 0.07 });
  assert.equal(K.Lc, 4.7);
  assert.equal(K.inf.phi, 20); assert.equal(K.inf.s, 0.10);
  assert.ok(K.okAs && K.okV, `${K.V.ELU} ≤ ${K.VRdc}`);
  assert.ok(K.rep.As >= 0.2 * K.inf.As - 1e-12);
  assert.ok(K.M.ELU > 1.35 * K.M.G && K.M.TS > 0 && K.M.LM2 > 0);
  // 6 m : l'épaisseur est portée au-delà de 0,30 m (calcul de plaque compris)
  const E6 = epaisseurDalleTransition({ L: 6, B: 11.36, hc0: 0.30, fck: 30, fyk: 500, cSup: 0.05, cInf: 0.07 });
  assert.ok(E6.e > 0.30); assert.ok(E6.K.okAs && E6.K.okV);
});

test('Plan de la dalle de transition : culées C0 et Cn, repères, barres ≤ 12 m, feuille valide, contrôles', () => {
  assert.deepEqual(culeesAvecDalle(st), [0, st.deck.beam.x0.length - 1]);
  const A = geometrieAppui(st, 0);
  assert.ok(A.dalle.B < A.width && A.dalle.e >= 0.30);
  const F = planDalleTransition(st, 0, {});
  assert.ok(F.valide().ok); assert.ok(!F.deborde);
  const marks = F.dalleTransition.marks;
  assert.equal(marks.length, 10);
  assert.ok(marks.find(m => m.pos === "cbT").prov >= marks.find(m => m.pos === "cbT").req);
  assert.ok(marks.every(m => m.L <= 12000));
  assert.ok(marks.find(m => m.pos === 'gj') && marks.find(m => m.pos === 'ch'));
  assert.ok(F.masse > 0);
  const svg = feuilleSVG(F);
  assert.match(svg, /DALLE DE TRANSITION/); assert.match(svg, /COUPE A-A/); assert.match(svg, /polystyrène/);
  const C = controlesPlans(st).filter(r => /^Dalle de transition/.test(r.objet));
  assert.equal(C.length, 8); assert.ok(C.every(r => r.ok));
});

test('Dalle de transition biaise : bords parallèles au garde-grève allongés de 1/sin ψ, barres trop longues en pièces', () => {
  const i = biais.deck.beam.x0.length - 1, D = dalleTransitionCulee(biais, i);
  assert.ok(D && D.psi < 100);
  assert.ok(Math.abs(D.Bk - D.B / Math.sin(D.psi * Math.PI / 200)) < 1e-9);
  const marks = reperesDalleTransition(D), t = marks.find(m => m.pos === 'infT');
  assert.ok(marks.every(m => m.L <= 12000));
  if (D.Bk - 2 * D.c > 12) assert.ok(t.pieces >= 2);
  assert.ok(planDalleTransition(biais, i, {}).valide().ok);
});

test('Contre-flèche d\'une dalle armée : courbure fissurée ≥ non fissurée, I_II ≤ I_I, flèche nulle aux appuis, positive vers le haut', () => {
  const F = flecheLongTermeBA(st);
  assert.ok(F && F.wMax > 0);
  // v0.99.37 : état I homogénéisé (aciers compris) → |κ| ≥ |κ_I| partout ; flèche retenue ≥ non fissurée
  F.sections.forEach(s => assert.ok(Math.abs(s.kappa) >= Math.abs(s.kI) - 1e-12));
  F.w.forEach((w, k) => assert.ok(w >= F.wNonFissure[k] - 1e-12 && w >= F.wCalc[k] - 1e-12));
  const x0 = st.deck.beam.x0;
  for (const x of x0) { const k = F.xs.findIndex(v => Math.abs(v - x) < 1e-9); assert.ok(Math.abs(F.w[k]) < 1e-9); }
  const N = nivellementTablier(st);
  assert.equal(N.mode, 'BA'); assert.ok(N.contreFleche);
  const mi = N.stations.filter(s => /2\/4/.test(s.nom));
  assert.ok(mi.every(s => s.cf > 0));
  assert.ok(Math.abs(Math.max(...N.stations.map(s => s.cf)) - F.wMax) < 0.01);
});

test('Profil en long parabolique : flèche L²/8R à mi-travée entre les cotes des appuis', () => {
  const base = { ...formDefaults(), niv_actif: 'on', niv_zCh: '100;100.5;101;101.2' };
  const N0 = nivellementTablier(compute(parseData(base))), N1 = nivellementTablier(compute(parseData({ ...base, niv_R: '2000' })));
  assert.equal(N1.R, 2000); assert.equal(N0.R, null);
  const L = st.deck.beam.x0[2] - st.deck.beam.x0[1], k = N1.stations.findIndex(s => s.nom === 'T2 — 2/4');
  assert.ok(Math.abs(N1.stations[k].z - N0.stations[k].z - L * L / (8 * 2000)) < 1e-9);
  const ap = N1.stations.filter(s => !/—/.test(s.nom)), ap0 = N0.stations.filter(s => !/—/.test(s.nom));
  ap.forEach((s, j) => assert.ok(Math.abs(s.z - ap0[j].z) < 1e-12));
  const P = planImplantation(compute(parseData({ ...base, niv_R: '-1500' })), {}, {});
  assert.ok(P.notes.some(n => n.lignes.join(' ').includes('rentrant')));
});

test('Calepinage des corniches préfabriquées : éléments + joints = longueur de rive ; abouts biais', () => {
  for (const s of [st, biais]) {
    const C = calepinageCorniches(s, EQ_DEFAUTS);
    for (const R of C.rives) {
      const nEl = R.nc + (R.Lend ? 2 : 0), tot = R.nc * C.Le + (R.Lend ? 2 * R.Lend : 0) + (nEl - 1) * C.j;
      assert.ok(Math.abs(tot - R.Lr) < 1e-9);
      if (R.Lend) assert.ok(R.Lend >= C.Le / 2 - 1e-9 && R.Lend <= C.pas + 1e-9);
    }
    assert.equal(C.nombre, C.types.reduce((S, t) => S + t.nombre, 0));
  }
  assert.ok(calepinageCorniches(biais, EQ_DEFAUTS).types.some(t => t.delta > 0));
  assert.equal(calepinageCorniches(st, { ...EQ_DEFAUTS, corn: 'cip' }), null);
  const F = planEquipements(st, EQ_DEFAUTS, {});
  assert.ok(F.tableaux.some(t => /CALEPINAGE/.test(t.titre)));
});

test('v0.99.31 — corbeau (EC2 J.3) et trafic de la dalle dans les efforts d\'ensemble de la culée', async () => {
  const { corbeauDalle } = await import('../src/supports/dalle_transition.js');
  const K = corbeauDalle({ FEd: 260, ac: 0.15, hc: 0.40, c: 0.05, phi: 12, fck: 30, fyk: 500 });
  const d = 0.40 - 0.05 - 0.006, z0 = 0.8 * d;
  assert.ok(Math.abs(K.Ft - (260 * 0.15 / z0 + 52)) < 1e-9);
  assert.ok(Math.abs(K.As - K.Ft / (500 / 1.15 * 1000)) < 1e-12);
  assert.ok(Math.abs(K.lien - 0.5 * K.As) < 1e-12 && K.ok);
  const D = dalleTransitionCulee(st, 0);
  assert.ok(D.Kc.tirant.As >= D.Kc.As - 1e-12 && D.Kc.cadres.As >= D.Kc.lien - 1e-12);
  // trafic ajouté par la dalle (EC) : UDL de la dalle + excédent du TS sur la dalle par rapport au TS sur le tablier
  const q = st.supports.lines[0].EC.dalleQ;
  assert.ok(q && q.N >= q.forfait && q.N >= q.dN);
  assert.ok(Math.abs(q.dN - (q.RU + Math.max(0, q.RTSs - q.RTSd))) < 1e-9);
  assert.equal(st.supports.lines[0].BAEL.dalleQ, undefined);
  assert.match(feuilleSVG(planDalleTransition(st, 0, {})), /Corbeau/);
});

test('v0.99.36 — dalle de transition en plaque : contrôle sous charge uniforme, moments transversaux, moment principal = max(bandes, plaque)', async () => {
  const { plaqueDalleTransition, calculDalleTransition, epaisseurDalleTransition } = await import('../src/supports/dalle_transition.js');
  // charge uniforme seule (trafic nul) sur une dalle très large : m_x = g L_c²/8, m_y = ν m_x au centre
  const U = plaqueDalleTransition({ L: 5, e: 0.30, B: 40, hc0: 0.30, aQ: [0, 0, 0], aq1: 0 });
  const r = U.res.find(q => Math.abs(q.y - 20) < 0.6 && Math.abs(q.s - U.Lc / 2) < 0.2);
  assert.ok(Math.abs(r.G.mx / (U.g * U.Lc ** 2 / 8) - 1) < 0.01);
  assert.ok(Math.abs(r.G.my / (0.2 * U.g * U.Lc ** 2 / 8) - 1) < 0.02);
  // trafic : la plaque donne au moins autant que les bandes à mi-portée ; aciers transversaux ≥ 20 % des principaux
  const P = plaqueDalleTransition({ L: 5, e: 0.35, B: 11.36, w: 10, hc0: 0.30 });
  const K = calculDalleTransition({ L: 5, e: 0.35, B: 11.36, w: 10, hc0: 0.30, fck: 30, fyk: 500, cSup: 0.05, cInf: 0.07, plaque: P });
  assert.ok(K.M.Q >= K.M.bandes - 1e-9 && K.M.Q >= K.M.plaque - 1e-9);
  assert.ok(K.transv && K.rep.As >= Math.max(0.2 * K.inf.As, K.transv.inf.requis) - 1e-12);
  assert.ok(P.inf.ELU > 0 && P.sup.ELU < 0);
  // biais : plaque en parallélogramme, résultats finis
  const Pb = plaqueDalleTransition({ L: 4, e: 0.30, B: 11.36, w: 10, psi: 70, hc0: 0.30 });
  assert.ok(Number.isFinite(Pb.inf.ELU) && Pb.mxMax.Q > 0);
  // épaisseur : 0,30 m jusqu'à 4 m, portée au-delà sous LM1 (plaque)
  assert.equal(epaisseurDalleTransition({ L: 4, B: 11.36, w: 10, hc0: 0.30, pente: 0.05, fck: 30, fyk: 500, cSup: 0.05, cInf: 0.07 }).e, 0.30);
  assert.ok(epaisseurDalleTransition({ L: 5, B: 11.36, w: 10, hc0: 0.30, pente: 0.05, fck: 30, fyk: 500, cSup: 0.05, cInf: 0.07 }).e >= 0.35);
});
