// Pont mixte : fatigue des armatures de la dalle (FLM4, Miner) et flexion locale de la dalle
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMixte } from '../web/phasage_view.js';
import { FLM4, cyclesAdmissibles, ACIER_FATIGUE, fatigueArmatures } from '../src/mixte/fatigue_armatures.js';
import { hourdisLocal } from '../src/beams/hourdis.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);

test('FLM4 : parts du trafic (somme 1 par composition), courbe S-N des barres droites', () => {
  for (const t of ['longue', 'moyenne', 'locale']) near(FLM4.reduce((s, c) => s + c.part[t], 0), 1, 1e-12, t);
  const r = ACIER_FATIGUE.dRsk / ACIER_FATIGUE.gS;
  near(cyclesAdmissibles(r), 1e6, 1e-9, 'N* au coude');
  near(cyclesAdmissibles(r / 2), 1e6 * 2 ** 9, 1e-9, 'k₂ = 9 sous le coude');
  near(cyclesAdmissibles(2 * r), 1e6 / 2 ** 5, 1e-9, 'k₁ = 5 au-dessus');
});

test('fatigue des armatures : dommage = Σ n/N, proportionnel au trafic', () => {
  const M = computeMixte({ ph_type: 'mixte' }), F = M.v.fatigueArm, w = F.pire;
  near(w.D, w.cam.reduce((s, c) => s + c.n / c.N, 0), 1e-12, 'Miner');
  const F2 = fatigueArmatures(M, M.v, { Nobs: 2 * F.Nobs }); near(F2.pire.D, 2 * w.D, 1e-9, 'D ∝ N_obs');
  assert.ok(w.D < 1 && M.v.verifs.some(q => /Fatigue des armatures/.test(q.nom)));
  assert.ok(M.v.dalle && M.v.dalle.inf.As > 0 && M.v.dalle.sup.As > 0 && M.v.dalle.poinc.ok);
});

test('dalle sur poutres : largeur W imposée = n b₁ redonne le modèle du pont à poutres', () => {
  const base = { n: 2, b1: 6, hd: 0.28, bt: 0.7, eTab: 0.05, L: 40, roadway: { y1: -4, y2: 4 }, footways: [], lines: [], bands: [], fck: 35, fyk: 500, mil: 'aucune' };
  const a = hourdisLocal(base), b = hourdisLocal({ ...base, W: 12 });
  near(a.inf.As, b.inf.As, 1e-12, 'inf'); near(a.sup.As, b.sup.As, 1e-12, 'sup');
  const c = hourdisLocal({ ...base, W: 10.5 });
  assert.ok(c.modele.ys0[0] === -3 && c.modele.ys0[1] === 3, 'poutres à ± e/2');
});
