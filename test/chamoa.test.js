/**
 * Benchmark contre la note de calculs commentée du guide technique CHAMOA-PSIDA (Sétra, juillet 2012,
 * chapitre 4) : PSIDA 10 – 15 – 15 – 10 m, abouts 0,50 m, dalle 12,00 × 0,75 m (section chanfreinée :
 * aire 8,91 m²), chaussée 10,00 m + trottoirs 1,00 m, classe de trafic 2, biais 80 gr (ignoré ici).
 *
 * Valeurs de référence (convention CHAMOA : moment positif = fibre supérieure tendue) :
 *  - poids propre g = 25 × 8,91 = 222,75 kN/m : M(C0) = 27,844 ; M(P1) = 3514,9 ; M(P2) = 4507,4 ;
 *    M(travée 1, x = 3,5) = −1285,5 ; M(travée 2, x = 7,5) = −2253,7 (tableau « profil provisoire »)
 *  - superstructures définitives : g_min = 39,14, g_max = 61,82 kN/m → M(C0) = 4,892 / 7,728
 *  - travée équivalente (méthode des moments) : Le = 8,9118 (10 m) et 11,1862 (15 m), x1/x2 = 2,0282 / 13,2144
 *  - LM1 caractéristique à P1 (ST1, KTRANS 1,30464 inclus) : 2834,2 kN·m → M_poutre = 2172 ; KTRANS
 *    travées 1 et 4 : 1,35827 ; travées 2 et 3 : 1,30464 ; facteurs par fibre (fichier Guyon, travée 1) :
 *    1,3676 (bord) … 1,1804 (axe).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousBeam } from '../src/beam.js';
import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA } from '../src/loads_ec.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : attendu ${b}, obtenu ${a} (tol ${(tol * 100).toFixed(1)} %)`);

const g = 25 * 8.91;

test('CHAMOA ch.4 — flexion longitudinale sous charges permanentes (ST1)', () => {
  const bm = new ContinuousBeam([10, 15, 15, 10], { nGrid: 100, nSec: 20, overhangs: [0.5, 0.5] });
  const { M, R } = bm.uniformLoad(g);
  rel(M[bm.supportSectionIndex(0)], -27.844, 1e-3, 'M C0');
  rel(M[bm.supportSectionIndex(1)], -3514.9, 1e-3, 'M P1');
  rel(M[bm.supportSectionIndex(2)], -4507.4, 1e-3, 'M P2');
  rel(M[bm.sectionIndex(0, 0.35)], 1285.5, 1e-3, 'M travée 1 (3,5 m)');
  rel(M[bm.sectionIndex(1, 0.5)], 2253.7, 1e-3, 'M travée 2 (7,5 m)');
  rel(R.reduce((a, c) => a + c, 0), g * 51, 1e-9, 'équilibre');
  const s = bm.uniformLoad(39.14); rel(s.M[bm.supportSectionIndex(0)], -4.892, 2e-3, 'superstructures min C0');
  const t = bm.uniformLoad(61.82); rel(t.M[bm.supportSectionIndex(0)], -7.728, 2e-3, 'superstructures max C0');
});

test('CHAMOA ch.4 — travée équivalente (méthode des moments)', () => {
  const bm = new ContinuousBeam([10, 15, 15, 10], { nGrid: 100, nSec: 20, overhangs: [0.5, 0.5] });
  const Le = bm.equivalentSpans();
  rel(Le[0], 8.9118, 1e-3, 'Le travée 1'); rel(Le[1], 11.1862, 1e-3, 'Le travée 2');
  rel(Le[2], 11.1862, 1e-3, 'Le travée 3'); rel(Le[3], 8.9118, 1e-3, 'Le travée 4');
});

test('CHAMOA ch.4 — LM1 classe 2 : moment de poutre, facteur de répartition KTRANS et moment de calcul à P1', () => {
  const ys = [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6];
  const deck = new SlabDeck({ spans: [10, 15, 15, 10], width: 12, h: 0.75, area: 8.91, overhangs: [0.5, 0.5],
    roadway: { y1: -5, y2: 5 }, footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }], ys, nu: 0.2 });
  const ec = deck.eurocode({ alpha: EC_ALPHA.FR2 });
  const P1 = deck.beam.supportSectionIndex(1), T1 = deck.beam.sectionIndex(0, 0.35), T2 = deck.beam.sectionIndex(1, 0.5);
  // moment de poutre entière (ST1 sans KTRANS) : 2834,2 / 1,30464 = 2172,4
  rel(ec.LM1.Mmin[P1], -2834.2 / 1.30464, 0.02, 'M LM1 à P1');
  const f = deck.transverseFactors(ec.LM1);
  rel(f.K[P1], 1.30464, 0.02, 'KTRANS P1 (barre 2)');
  rel(f.K[T1], 1.35827, 0.03, 'KTRANS travée 1');
  rel(f.K[T2], 1.30464, 0.03, 'KTRANS travée 2');
  // moment de calcul par mètre à P1 (CHAMOA : 2834,2 / 12 = 236,2 kN·m/m)
  rel(f.K[P1] * ec.LM1.Mmin[P1] / 12, -236.2, 0.02, 'm_x de calcul à P1');
  // profil par fibre (fichier Guyon, travée 1) : le bord est reproduit à 3 %, l'axe est plus bas (hypothèse H4)
  rel(f.fMax[T1][0], 1.3676, 0.03, 'facteur fibre de bord travée 1');
  assert.ok(f.fMax[T1][4] > 1.05 && f.fMax[T1][4] < 1.1804, 'facteur fibre d\'axe travée 1 entre 1,05 et 1,18');
  // symétrie
  f.fMax[T1].forEach((v, i) => assert.ok(Math.abs(v - f.fMax[T1][8 - i]) < 1e-6, 'symétrie'));
});
