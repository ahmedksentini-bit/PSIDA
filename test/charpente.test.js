// Pont mixte : charpente pendant le bétonnage (déversement de semelle, déversement d'ensemble) et plans de charpente
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMixte } from '../web/phasage_view.js';
import { deversementSemelle, momentGlobal } from '../src/mixte/betonnage.js';
import { proprietes } from '../src/mixte/section.js';
import { charpente, profileEntretoise, planCharpenteElevation, planCharpenteCoupes } from '../src/plans/charpente.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);
const g = { bfi: 1.0, tfi: 0.05, hw: 2.3, tw: 0.02, bfs: 0.7, tfs: 0.04, hg: 0.05, hc: 0.28, nuance: 'S355' };
const M = computeMixte({ ph_type: 'mixte' });

test('déversement de semelle : sans raideur de cadre, N_cr = Euler de la semelle comprimée', () => {
  const D = deversementSemelle(g, 'sup', { Lsp: 20, ac: 6, Iv: 1e-12, Iq: 1, entraxe: 6 });
  near(D.Ncr, Math.PI ** 2 * 210e6 * D.Iz / 400, 1e-3, 'Euler');
  const D2 = deversementSemelle(g, 'sup', { Lsp: 20, ac: 6, Iv: 4e-4, Iq: 1.8e-3, entraxe: 6 });
  assert.ok(D2.Ncr > D.Ncr && D2.chi > D.chi, 'les cadres raidissent');
});

test('déversement d\'ensemble (Yura 2008) : M_gs = π² s E √(I_eff I_x) / L²', () => {
  const sym = { ...g, bfi: 0.7, tfi: 0.04 }, P = proprietes(sym, 'acier'), Iy = 0.04 * 0.7 ** 3 / 12;
  near(momentGlobal(sym, 6, 50).Mgs, Math.PI ** 2 * 6 * 210e6 * Math.sqrt(2 * Iy * P.I) / 2500, 1e-9, 'section symétrique : I_eff = 2 I_y,semelle');
});

test('bétonnage : vérifications présentes, charges de chantier défavorables', () => {
  const b = M.v.betonnage;
  assert.equal(b.verifs.length, 3);
  assert.ok(b.etapes.length === 1 + M.reperes.plots.length);
  const M0 = computeMixte({ ph_type: 'mixte', mx_qc: '0' }).v.betonnage, M3 = computeMixte({ ph_type: 'mixte', mx_qc: '3' }).v.betonnage;
  assert.ok(M3.pires.res.taux > M0.pires.res.taux, 'q_c augmente la contrainte');
  assert.ok(M.v.verifs.some(q => /^Bétonnage/.test(q.nom)), 'dans la synthèse');
});

test('charpente : tronçons ≤ 24 m, joints aux changements de PRS, masses cohérentes', () => {
  const C = charpente(M);
  assert.ok(C.troncons.every(t => t.l <= 24 + 1e-9));
  for (const z of C.zones.slice(1)) assert.ok(C.joints.some(x => Math.abs(x - z.x0) < 1e-9), `joint en ${z.x0}`);
  near(C.troncons.reduce((s, t) => s + t.l, 0), C.Lt, 1e-12, 'longueur');
  const t = C.troncons[0], G = t.g;
  near(t.masse, (G.bfi * G.tfi + G.hw * G.tw + G.bfs * G.tfs) * t.l * 7850, 1e-12, 'masse d\'un tronçon');
  assert.ok(C.ratio > 120 && C.ratio < 450, `ratio ${C.ratio}`);
  assert.ok(profileEntretoise(1.8e-3)[1] * 1e-8 >= 1.8e-3);
  for (const F of [planCharpenteElevation(M), planCharpenteCoupes(M)]) assert.ok(F.valide().ok, F.valide().problemes.join(' ; '));
});
