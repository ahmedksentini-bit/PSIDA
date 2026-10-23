// Ouvrage terminé des ponts construits par phases (poutres rendues continues, fléaux) — recoupements
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resistanceCouches } from '../src/phasage/acheve.js';
import { computePhasage } from '../web/phasage_view.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);
const FORM_P = { ph_type: 'poutres', ph_P: '4300', ph_Ap: '33', ph_nP: '4', ph_Lr: '8', ph_trott: '1' };
const FORM_F = { ph_type: 'fleau', fl_ccn: '10', fl_ccv: '6', fl_ccAp: '28.5', fl_ccP0: '4000', fl_crn: '6', fl_crv: '4', fl_Lr: '10' };

test('résistance d\'une section rectangulaire armée : M = A_s f_yd (d − 0,4 x)', () => {
  const r = resistanceCouches([{ b: 1, y0: 0, y1: 1, fcd: 20 }], [], [{ A: 0.003, y: 0.05 }], 1);
  const x = 0.003 * 435 / (0.8 * 1 * 20);
  near(r.M, 0.003 * 435 * 1000 * (0.95 - 0.4 * x), 1e-4, 'M_Rd');
  // moment négatif : armatures en fibre supérieure, même résultat par symétrie
  near(resistanceCouches([{ b: 1, y0: 0, y1: 1, fcd: 20 }], [], [{ A: 0.003, y: 0.95 }], -1).M, r.M, 1e-6, 'symétrie');
});

test('poutres rendues continues : vérifications, effets hyperstatiques linéaires entre appuis, thermique constant en travée centrale', () => {
  const out = computePhasage(FORM_P), v = out.acheve;
  assert.ok(v.ok, v.verifs.filter(q => !q.ok).map(q => q.nom).join(', '));
  const L = out.p.L, S = v.sections, at = x => S.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  // moment hyperstatique de la précontrainte (ELU, γ_P = 1) : linéaire dans chaque travée (efforts de liaison seuls)
  for (const k of [0, 1]) { const m = at(L * 1.5).Mhyp[k], a = at(L).Mhyp[k], b = at(2 * L).Mhyp[k]; near(m, (a + b) / 2, 0.02, `M_hyp linéaire (pas ${k})`); }
  // gradient thermique : moment hyperstatique constant dans la travée centrale (trois travées égales)
  near(at(1.5 * L).MT[0], at(L).MT[0], 1e-6, 'M_T constant');
  // réactions permanentes = poids du modèle × nombre de poutres
  const poids = out.modele.phases.flatMap(ph => ph.charges || []).reduce((s, c) => { const b = out.modele.barres[c.barre]; return s + c.w * (out.modele.noeuds[b.j][0] - out.modele.noeuds[b.i][0]); }, 0);
  near(v.reactions.reduce((s, q) => s + q.G, 0), poids * v.nP, 1e-6, 'équilibre');
  assert.ok(v.eta.TS > 1 && v.eta.TS < 2, 'coefficient de Guyon de la poutre de rive');
});

test('fléaux : vérifications, effet Résal près des piles, réactions = poids', () => {
  const out = computePhasage(FORM_F), v = out.acheve;
  assert.ok(v.ok, v.verifs.filter(q => !q.ok).map(q => q.nom).join(', '));
  assert.ok(v.elu.some(e => e.VRes > 100), 'membrure inférieure inclinée : réduction de V');
  const poids = out.modele.phases.flatMap(ph => ph.charges || []).reduce((s, c) => { const b = out.modele.barres[c.barre]; return s + c.w * Math.abs(out.modele.noeuds[b.j][0] - out.modele.noeuds[b.i][0]); }, 0);
  near(v.reactions.reduce((s, q) => s + q.G, 0), poids, 2e-3, 'équilibre (béton des voussoirs et superstructures)');
});
