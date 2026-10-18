/**
 * Modèle PSH (src/supports/psh.js) comparé à la sortie du programme PSH (SETRA/CETE de l'Ouest, v. 1.11) de la pile P3 du
 * Pont de Noé (note des appuis, A.P.D. mai 2012) : 3 pieux Ø 1,20 m sur une file, L = 30 m, pied libre, tête encastrée ;
 * sol E_M = 1800 t/m², α = 0,66 → k_i = 6756 t/m³ ; fût 1,50 × 8,50 m, H = 18,50 m ; chevêtre 1,00 m (11,64 × 2,40) ;
 * semelle 1,50 m ; E béton 3,281·10⁶ (instantané) / 1,104·10⁶ t/m² (soutenu). Unités de la note : t, m.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winklerPile, pileGroup, headFlexibility, pileProfile, pileCapFiles, pileShear } from '../src/supports/psh.js';
import { menardReaction } from '../src/supports/foundation.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : réf ${b}, outil ${a}`);
const seg = E => [{ h: 18.5, E, A: 1.5 * 8.5, I: 8.5 * 1.5 ** 3 / 12 }, { h: 1.0, E, A: 11.64 * 2.4, I: 11.64 * 2.4 ** 3 / 12 }];
const model = E => { const wp = winklerPile({ L: 30, D: 1.2, E, k: 6756 }); return { wp, g: pileGroup([0, 0, 0].map(x => ({ x })), wp) }; };

test('PSH Noé P3 — module de Ménard k_i = 6756 t/m³', () => {
  rel(menardReaction({ EM: 1800, alpha: 0.66, B: 1.2 }).k, 6756, 2e-4, 'k_i');
});

test('PSH Noé P3 — matrices de souplesse de la tête d\'appui (instantanée et soutenue)', () => {
  const ref = { 3.281e6: [3.148e-6, 5.957e-6, 1.039e-4, 2.104e-3], 1.104e6: [9.356e-6, 1.517e-5, 2.489e-4, 4.821e-3] };
  for (const [E, r] of Object.entries(ref)) {
    const { g } = model(+E), F = headFlexibility({ group: g, segments: seg(+E), hs: 1.5 });
    rel(F[0][0], r[0], 0.01, `w/N (E = ${E})`); rel(F[1][1], r[1], 0.01, `θ/M (E = ${E})`);
    rel(F[1][2], r[2], 0.02, `θ/T (E = ${E})`); rel(F[2][2], r[3], 0.04, `u/T (E = ${E})`);
    assert.ok(Math.abs(F[1][2] - F[2][1]) < 1e-12, 'symétrie');
  }
});

test('PSH Noé P3 — cas C1/C8 ELU : efforts en tête de pieu et profil le long du pieu', () => {
  const mi = model(3.281e6), ms = model(1.104e6), lev = 21, Vs = 1426.98 - 114.28;
  const ri = mi.g.respond(114.28, 3.86 * lev, 3.86), rs = ms.g.respond(Vs, -4.71 * lev, -4.71);
  const p = k => ri.piles[0][k] + rs.piles[0][k];
  rel(p('N'), 475.66, 1e-4, 'N par pieu'); rel(p('T'), -0.28, 0.03, 'T tête');
  rel(p('a'), 1.08e-2, 0.01, 'déplacement axial'); rel(p('t'), -6.13e-4, 0.03, 'y tête'); rel(-p('phi'), -5.26e-4, 0.03, 'rotation');
  const pi = pileProfile(mi.wp, ri.piles[0].t, ri.piles[0].phi), ps = pileProfile(ms.wp, rs.piles[0].t, rs.piles[0].phi);
  const at = z => { const j = pi.findIndex(q => Math.abs(q.z - z) < 1e-6); return { M: pi[j].M + ps[j].M, T: pi[j].T + ps[j].T, p: pi[j].p + ps[j].p }; };
  // sortie PSH : z = 0 : M −5,81, p −4,14 ; z = 4 : M 3,76, T 1,21 ; z = 6 : M 4,09 ; z = 8 : M 2,15 ; z = 2 : T 3,30
  rel(at(0).M, -5.81, 0.03, 'M(0)'); rel(at(0).p, -4.14, 0.03, 'p(0)'); rel(at(4).M, 3.76, 0.03, 'M(4)'); rel(at(6).M, 4.09, 0.03, 'M(6)');
  rel(at(8).M, 2.15, 0.03, 'M(8)'); rel(at(2).T, 3.30, 0.03, 'T(2)'); rel(at(4).T, 1.21, 0.03, 'T(4)'); rel(at(0).T, -0.28, 0.15, 'T(0)');
});

test('Groupe sur deux files : têtes articulées → N = V/n ± M x/Σx² ; têtes encastrées : moment partagé ; pieux inclinés', () => {
  const wp = winklerPile({ L: 15, D: 0.8, E: 3e7, k: 1e4 });
  const piles = [-1.2, -1.2, 1.2, 1.2].map(x => ({ x }));
  const r = pileGroup(piles, wp, { head: 'articule' }).respond(4000, 800, 0);
  const re = pileGroup(piles, wp).respond(4000, 800, 0);
  rel(re.piles.reduce((a, p) => a + p.N * p.x - p.M, 0), 800, 1e-6, 'équilibre des moments (têtes encastrées)');
  rel(r.piles[0].N, 1000 - 800 * 1.2 / (4 * 1.44), 1e-6, 'N file gauche'); rel(r.piles[2].N, 1000 + 800 * 1.2 / (4 * 1.44), 1e-6, 'N file droite');
  // pieux inclinés de ±10° : l'effort horizontal est repris surtout par les efforts axiaux
  const wi = pileGroup(piles.map(p => ({ ...p, omega: Math.sign(p.x) * 10 * Math.PI / 180 })), wp).respond(4000, 0, 400);
  const wv = pileGroup(piles, wp).respond(4000, 0, 400);
  assert.ok(Math.max(...wi.piles.map(p => Math.abs(p.T))) < 0.85 * Math.abs(wv.piles[0].T), 'effort transversal des pieux réduit par l\'inclinaison (pieux écartés vers le bas)');
  const Hsum = wi.piles.reduce((a, p) => a + p.N * Math.sin(p.omega) + p.T * Math.cos(p.omega), 0);
  rel(Hsum, 400, 1e-6, 'équilibre horizontal');
});

test('Semelle sur files de pieux (bielles généralisées) et effort tranchant des pieux', () => {
  // deux files symétriques : tirant par pieu R (l/2 − b/4)/h comme PP73 (A₁ par couple)
  const c = pileCapFiles({ files: [{ x: -1.2, R: 1000 }, { x: 1.2, R: 1000 }], b: 1.0, hs: 1.5, cover: 0.1, fsu: 348 });
  rel(c.tieMax, 1000 * (1.2 - 0.25) / 1.4, 1e-12, 'tirant');
  const c3 = pileCapFiles({ files: [{ x: -2.4, R: 900 }, { x: 0, R: 1200 }, { x: 2.4, R: 900 }], b: 1.0, hs: 1.6, fsu: 348 });
  assert.ok(c3.rows[1].inside && c3.rows[0].tie > 0 && c3.Mface === 900 * (2.4 - 0.5));
  const s = pileShear({ V: 300, D: 1.0, code: 'BAEL', fck: 25 });
  rel(s.d, 0.5 + 2 * 0.43 / Math.PI, 1e-12, 'hauteur utile d = D/2 + 2 r_s/π'); assert.ok(s.ok);
  assert.ok(pileShear({ V: 300, D: 1.0, code: 'EC', fck: 25, As: 0.005 }).VRdc > 0);
});
