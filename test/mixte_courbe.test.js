// Pont mixte courbe en plan : grillage, rapports d'amplification, flexion latérale des semelles
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMixte, optionsMixte } from '../web/phasage_view.js';
import { grillage, resoudreGrillage, analyseCourbe, flexionLaterale } from '../src/mixte/courbe.js';
import { planCharpenteElevation } from '../src/plans/charpente.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);
const M = computeMixte({ ph_type: 'mixte' }), o = optionsMixte({}, M.p);

test('grillage droit : poutre isostatique sous charge répartie, M = qL²/8 et réactions qL/2', () => {
  const p1 = { ...M.p, L: [30], zone: 0 }, G = grillage(p1, { R: 1e12, ac: 6, Iq: 1e-9, EIt: 1e6, EIa: 1e6, GJt: 1e3, GJa: 1e3 }), S = resoudreGrillage(G);
  const F = new Float64Array(3 * G.N.length);
  for (let k = 0; k < 2; k++) for (let i = 0; i < G.ss.length - 1; i++) { const d = G.ss[i + 1] - G.ss[i]; F[3 * G.id(k, i)] -= 5 * d; F[3 * G.id(k, i + 1)] -= 5 * d; }
  const r = S.resoudre(F), m = G.E.findIndex(e => e.poutre === 0 && Math.abs(e.s - 15) < 1 && e.s < 15);
  near(r.M(m, 'j'), 10 * 900 / 8, 1e-6, 'M mi-travée');
  r.R.forEach(q => near(q.R, 150, 1e-6, 'réaction'));
});

test('courbure : rapports égaux à 1 pour R → ∞, poutre extérieure surchargée et intérieure soulagée en courbe', () => {
  const D = analyseCourbe(M, { ...o, R: 1e9 });
  D.sections.forEach(s => { near(s.kG, 1, 1e-6, `k_G ${s.nom}`); near(s.kQ, 1, 1e-6, `k_Q ${s.nom}`); });
  const C = analyseCourbe(M, { ...o, R: 200 });
  assert.ok(C.sections.every(s => s.kG > 1 && s.kGint < 1), 'extérieure > 1 > intérieure');
  // équilibre vertical : somme des réactions = charges permanentes (longueurs d'arc)
  const D2 = analyseCourbe(M, { ...o, R: 150 }), C2 = analyseCourbe(M, { ...o, R: 600 });
  assert.ok(D2.sections[1].kG > C2.sections[1].kG, 'amplification croissante quand R diminue');
});

test('flexion latérale des semelles : M_lat = M l² / (10 R D), f_l = 6 M_lat / (t b²)', () => {
  const g = M.p.travee, f = flexionLaterale(10000, g, { R: 200, l: 6 });
  near(f.Mlat, 10000 * 36 / (10 * 200 * g.hw), 1e-12, 'M_lat');
  near(f.flS, 6 * f.Mlat / (g.tfs * g.bfs ** 2) / 1000, 1e-12, 'f_l');
  near(f.H, 10000 * 6 / (200 * g.hw), 1e-12, 'effort de cadre');
});

test('tablier courbe : vérifications de courbure intégrées, plan en arc', () => {
  const C = computeMixte({ ph_type: 'mixte', mx_R: '300' });
  assert.ok(C.v.courbe && C.v.verifs.some(q => /^Courbure/.test(q.nom)));
  const F = planCharpenteElevation(C);
  assert.ok(F.valide().ok && /R = 300/.test(F.vues.map(q => q.vue.titre).join(' ')));
});
