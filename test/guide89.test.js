/**
 * Conformité des règles codées au guide SETRA « Ponts-dalles – guide de conception » (juillet 1989).
 * Chaque assertion cite la page du guide. Les écarts relevés (élancement PSI.DP à 2 travées, travée de rive retenue
 * pour l'abaque DA à 5 travées, n du minimum transversal) sont décrits dans le rapport de revue et ne sont pas testés ici.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE89, coefBeton, domaineEmploi, epaisseurAbaqueDA, epaisseurAbaqueDP, longueurAbout, minTransversalGuide } from '../src/conception.js';
import { zonage } from '../src/zonage.js';
import { STANDARD_BEARINGS, checkBearing } from '../src/bearings.js';
import { mechanicalSkew } from '../src/skew.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} : attendu ${b}, obtenu ${a}`);

test('guide 1989 — domaine d\'emploi et élancements (p. 10-11)', () => {
  assert.deepEqual(GUIDE89.DA.portees12, [7, 15]); assert.deepEqual(GUIDE89.DA.portees3, [6, 18]);
  assert.deepEqual(GUIDE89.DA.elancement, { 1: 20, 2: 26, 3: 28 });
  assert.deepEqual(GUIDE89.DP.portees, [14, 25]); assert.equal(GUIDE89.DP.porteeMax, 30); assert.equal(GUIDE89.DP.encorbellementsConseilles, 20);
  assert.deepEqual(GUIDE89.DP.elancement[1], [22, 25]);
  assert.deepEqual(GUIDE89.DP.elancement[3], { rect: 33, enc: 28 });
  assert.equal(GUIDE89.DP.longueurCablesFilants, 80);                     // p. 28
  // plage commune DA / DP 14–18 m (p. 11)
  assert.deepEqual(domaineEmploi([10, 16, 16, 10]).types, ['DA', 'DP']);
});

test('guide 1989 — travure, ouvertures, coupe, descente de charges (p. 13-33)', () => {
  assert.equal(GUIDE89.travure.rMin, 0.5); assert.equal(GUIDE89.travure.rMinBiais, 0.6); assert.equal(GUIDE89.travure.rMax, 0.85); // p. 13, 25
  assert.equal(GUIDE89.travure.nombreOr, 0.618); assert.equal(GUIDE89.travure.hauteurMax4Travees, 8);                           // p. 26, 15
  assert.deepEqual([GUIDE89.largeur.min, GUIDE89.largeur.max, GUIDE89.largeur.demiTabliers], [5.5, 16, 15]);                    // p. 33
  assert.deepEqual(GUIDE89.poidsPropre, [1.2, 2.0]); assert.deepEqual(GUIDE89.reactions, { culee: 20, pile: 70 });              // p. 21
  assert.deepEqual(GUIDE89.tassements.sansRenfort, [0.02, 0.03]);                                                               // p. 22
  assert.equal(GUIDE89.biais.phiMecMin, 70); assert.equal(GUIDE89.biais.option1DA, 80); assert.equal(GUIDE89.biais.option1DP, 70); // p. 36, 79
  assert.equal(GUIDE89.biais.angleMinFers, 60); assert.equal(GUIDE89.biais.deblaiFaible, 75);                                   // p. 78, 17
});

test('guide 1989 — épaisseurs : coefficients de béton et exemples des abaques (p. 58, 64)', () => {
  assert.equal(coefBeton(25), 1); assert.equal(coefBeton(30), 0.87); assert.equal(coefBeton(35), 0.81);
  close(epaisseurAbaqueDA([8, 15, 15, 8]).h25, 0.56, 0.01, 'DA 8-15-15-8 (exemple p. 64)');
  // PSI.DP à larges encorbellements 20-25-20 : 0,93 m lu sur la courbe ℓ = 25 à θℓ = 20 ; l'outil ne lit que le plateau
  // (0,912) et signale la majoration de 0,02 à 0,04 m pour θ voisin de 0,8–1
  const dp = epaisseurAbaqueDP([20, 25, 20], true);
  close(dp.h, 0.912, 0.005, 'plateau DP3N ℓ = 25'); close(dp.h + 0.02, 0.93, 0.005, 'plateau + 0,02 m (θ = 0,8) ≈ 0,93');
});

test('guide 1989 — abouts (p. 69) et minimum transversal (p. 80)', () => {
  close(longueurAbout({ type: 'DA', D: 0.025 }), 0.475, 1e-12, 'BA 0,1 + 15 D');
  close(longueurAbout({ type: 'DP', psi: 80 }), 0.5 * (1 + 1 / Math.tan(72 * Math.PI / 180)), 1e-12, 'BP 0,5 (1 + |cotg ψ|)');
  close(minTransversalGuide({ width: 12, spans: [15], h: 0.75 }).rho, 1.04e-3, 1e-12, '1,3 n ‰');
  close(minTransversalGuide({ width: 40, spans: [15], h: 0.75 }).rho, 2e-3, 1e-12, 'plafond 2 ‰');
  close(minTransversalGuide({ width: 12, spans: [15], h: 0.75, psi: 80 }).k, 1 / Math.sin(80 * Math.PI / 200), 1e-12, '× 1/sin ψ');
});

test('guide 1989 — zonage : chevêtres, bords libres, angles (p. 80-85)', () => {
  const psi = 80, a = 3, s = Math.sin(psi * Math.PI / 200);
  const z = zonage({ spans: [10, 15, 10], overhangs: [0.5, 0.5], width: 12, h: 0.7, psi, bearingPitch: a });
  const ch = z.zones.filter(q => q.kind === 'chevetre'), ex = z.zones.filter(q => q.kind === 'extension');
  close(ch[0].x2 - ch[0].x1, 0.5 + a / (3 * s), 1e-12, 'chevêtre pile-culée = about + a/(3 sin ψ)');
  close(ex[0].x2 - ex[0].x1, 2 * a / (3 * s), 1e-12, 'extension 2a/(3 sin ψ)');
  close(ch[1].x2 - ch[1].x1, 2 * a / (3 * s), 1e-12, 'chevêtre sur appui intermédiaire (« id »)');
  close(z.rhoEdge, 0.9e-3, 1e-15, 'bords libres 0,9 ‰');
  // angles : 1,2 ‰ orthogonal, 2,4 ‰ à 60°, 4,1 ‰ à 45° (exemples du guide ; formule imprimée sin²α à lire sin²(α/2))
  const rc = ang => zonage({ spans: [10], width: 8, h: 0.5, psi, bearingPitch: 2, angleFers: ang }).rhoCorner * 1000;
  close(rc(90), 1.2, 1e-9, '90°'); close(rc(60), 2.4, 1e-9, '60°'); close(rc(45), 4.1, 0.01, '45°');
});

test('guide 1989 — appareils d\'appui (§ 3.6, p. 93-97)', () => {
  // tableau NF T 47.815 (p. 97) : dimensions, feuillet + frette, nombres de feuillets
  const T = [
    [100, 150, 8, 2, [2]], [100, 200, 8, 2, [2]], [150, 200, 8, 2, [2, 3]], [150, 250, 8, 2, [2, 3]], [150, 300, 8, 2, [2, 3]],
    [200, 250, 8, 2, [3, 4]], [200, 300, 8, 2, [3, 4]], [200, 350, 8, 2, [3, 4]], [200, 400, 8, 2, [3, 4]],
    [250, 300, 10, 3, [3, 4]], [250, 400, 10, 3, [3, 4]], [300, 400, 10, 3, [3, 4, 5]], [300, 500, 10, 3, [3, 4, 5]], [300, 600, 10, 3, [3, 4, 5]],
    [350, 450, 12, 3, [3, 4, 5]], [400, 500, 12, 3, [4, 5, 6]], [400, 600, 12, 3, [4, 5, 6]], [450, 600, 12, 3, [4, 5, 6, 7]], [500, 600, 12, 3, [5, 6, 7, 8]],
    [600, 600, 15, 5, [4, 5, 6, 7]], [600, 700, 15, 5, [4, 5, 6, 7]], [700, 700, 15, 5, [5, 6, 7]],
  ];
  assert.deepEqual(STANDARD_BEARINGS.map(b => [b.a, b.b, b.t, b.ts, b.ns]), T);
  // conditions : σ ≤ min(15, G ab/(t(a+b))), u_g/T ≤ 0,5, u_g/T + H/(G2 ab) ≤ 0,7, T ≤ a/5, t·T ≥ α a²/3, f = 0,10 + 0,6/σ
  const bd = STANDARD_BEARINGS.find(b => b.a === 300 && b.b === 400), n = 4;
  const r = checkBearing(bd, n, { Pmax: 1000, Pmin: 400, H: 10, ug: 0.01, alpha: 0.005 });
  const a = 0.3, b = 0.4, t = 0.01, Tt = n * t;
  close(r.sigLim, Math.min(15, 0.8 * a * b / (t * (a + b))), 1e-12, 'σ limite');
  close(r.Tmax, a / 5, 1e-12, 'non-déversement'); close(r.rotLim, 3 * t * Tt / (a * a), 1e-12, 'rotation');
  close(r.dist2, 0.01 / Tt + 10 / (1600 * a * b), 1e-12, 'distorsion en charge'); close(r.f, 0.10 + 0.6 / r.sigMin, 1e-12, 'frottement');
});

test('guide 1989 — biais mécanique (p. 76-77)', () => {
  close(mechanicalSkew({ psi: 80, Be: 7.913, L: 9.75 }), 86.574, 1e-3, 'ψ + (100 − ψ)(1 − n/2)²');
  assert.equal(mechanicalSkew({ psi: 60, Be: 30, L: 10 }), 60, 'n ≥ 2 : φ = ψ');
});
