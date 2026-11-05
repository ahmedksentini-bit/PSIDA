/**
 * Ponts à poutres BA à travées continues (dossier Sétra PSI-BA 77) : exemple d'application des pièces III à V — 4 travées
 * continues de 11,66 / 18,80 / 18,80 / 14,45 m, 3 poutres à 4,00 m, entretoises intermédiaires (méthode de Courbon).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { ContinuousBeam } from '../src/beam.js';
import { beamsBlocks } from '../web/beams_view.js';

const T = 9.81, near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PSIDA ${a.toFixed(3)}, note ${b}`);
const DP = { ...formDefaults(), pt_type: 'BA', pt_geo: 'rect', pt_spans: '11.66, 18.80, 18.80, 14.45', pt_continu: 'oui', pt_entInt: '2', pt_n: '3', pt_b1: '4.00', pt_hd: '0.20',
  pt_parts: '0.38 0.76', pt_road: '-3.75, 3.75', pt_foot: '-5,-3.75 ; 3.75,5', pt_lines: '', pt_bands: '', pt_fck: '30', pt_fyk: '400', pt_b0: '0.38', pt_cover: '0.10', pt_mil: 'Mc120', pt_ret: '0', pt_tePile: '0.50' };
const r = computePoutres(parsePoutres(DP));

test('PSI-BA : moments sur piles de la poutre continue sous les charges permanentes de la note (poutre 1)', () => {
  // charges permanentes de la poutre 1 (note, « charges et surcharges ») : 3,691 / 3,812 / 3,812 / 3,671 t/m
  const B = new ContinuousBeam([11.66, 18.8, 18.8, 14.45], { nGrid: 400, nSec: 20 }), w = [3.691, 3.812, 3.812, 3.671];
  const M = i => { const IL = B.ILM[B.supportSectionIndex(i)]; let m = 0; for (let p = 1; p < B.positions.length; p++) { const j = B.positions[p].j; if (j > 3) continue; m += w[Math.min(Math.max(j, 0), 3)] * (IL[p] + IL[p - 1]) / 2 * (B.positions[p].x - B.positions[p - 1].x); } return m; };
  near(M(1), -90.942, 0.001, 'appui 2'); near(M(2), -119.933, 0.001, 'appui 3'); near(M(3), -102.950, 0.001, 'appui 4');
});

test('PSI-BA : tablier continu, Courbon, moments négatifs de A(l) et réduction au nu de l\'entretoise', () => {
  assert.ok(r.continu && r.spans.length === 4 && r.appuis.length === 3);
  // Courbon : A(l) sur toute la chaussée (excentrement nul) → K = 1 pour toutes les poutres
  for (const s of r.spans) for (const b of s.beams) near(b.eta.A, 1, 0.01, 'K de A(l)');
  // Bc excentré : la poutre de rive reçoit plus que le tiers
  assert.ok(r.spans[1].beams[0].eta.Bc > 1.1);
  // moments sur piles de A(l), poutre 1 : note −70,61 / −79,30 / −74,58 t·m (A(l) par arrangement de travées chargées)
  [-70.608, -79.301, -74.583].forEach((m, k) => near(r.appuis[k].beams[0].Mcomp.A / T, m, 0.07, `M_A appui ${k + 2}`));
  // l'appui 3 (entre les deux grandes travées) est le plus sollicité, comme dans la note
  const g = r.appuis.map(a => Math.max(a.beams[0].goussetNecessaire, a.beams[0].compressionNecessaire));
  assert.ok(g[1] > g[0] && g[1] > g[2], `goussets nécessaires ${g}`);
  // réduction au nu : |M_nu| < |M_axe| (PSI-BA : −166,43 → −153,68 t·m pour V = 51,0 t et e = 0,50 m)
  for (const a of r.appuis) for (const q of a.beams) assert.ok(q.Mnu.ELU_F61 > q.Maxe.ELU_F61 && q.Mnu.ELU_F61 < 0);
  // réactions : somme des réactions G = poids total du tablier
  const P = r.lines.reduce((s, l) => s + l.G, 0), W = r.bd.bySpan.get('continu').deck.permanentFiles().reduce((s, f) => s + f.q, 0) * (11.66 + 18.8 + 18.8 + 14.45);
  near(P, W, 0.01, 'équilibre des réactions permanentes');
});

test('PSI-BA : note (tableau des appuis, enveloppe) et plans avec armatures supérieures sur appuis', async () => {
  const B = beamsBlocks(r);
  assert.ok(B.some(b => b.t === 'h2' && /appuis intermédiaires/.test(b.text)));
  assert.ok(B.some(b => b.t === 'svg' && /tablier continu/.test(b.svg)));
  const { donneesBA, planFerraillageBA, planCoffrageBA } = await import('../src/plans/poutres_ba.js');
  const D = donneesBA(r);
  assert.equal(D.superieures.length, 2, 'travée centrale : deux appuis intermédiaires');
  for (const q of D.superieures) { assert.ok(q.n * Math.PI * (q.phi / 1000) ** 2 / 4 >= q.As - 1e-9); assert.ok(q.groupes[0].L >= q.groupes[1].L); }
  for (const fn of [planCoffrageBA, planFerraillageBA]) assert.deepEqual(fn(D, {}).valide().problemes, []);
  // gousset suffisant : toutes les vérifications sur appui passent
  const r2 = computePoutres(parsePoutres({ ...DP, pt_bgous: '1.00' }));
  assert.ok(r2.appuis.every(a => a.beams.every(q => q.cisaillementBAEL.ok && q.ELS.BAEL.okC && q.ELS.EC.okC)));
});
