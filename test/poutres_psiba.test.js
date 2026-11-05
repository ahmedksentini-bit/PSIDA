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
  [-70.608, -79.301, -74.583].forEach((m, k) => near(r.appuis[k].beams[0].Mcomp.A / 10, m, 0.04, `M_A appui ${k + 2}`));   // 1 t = 10 kN (Fascicule 61)
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

// (charges de trafic : 1 t = 10 kN dans la note, comme dans le Fascicule 61)
const T10 = 10;
// entretoises intermédiaires : note PSI-BA, travée 4 (1 entretoise, λ = 7,225 m), « coefficients longitudinaux » et efforts
// par système (t, t·m, δ compris) au droit de la poutre de rive (y = −4,00) et à −3,75 / −3,50 m du centre
test('PSI-BA : entretoises intermédiaires — coefficients longitudinaux et efforts par système (Courbon)', async () => {
  const { coefficientsLongitudinaux } = await import('../src/beams/entretoise_int.js');
  const c = coefficientsLongitudinaux(7.225);
  // hors δ : Bc 14,708/1,187 = 12,39 t par file ; Mc120 102,511 t pour deux chenilles = 86,8 t hors δ ; A(l) λ = 7,225 m ; trottoirs 3,251 t
  near(c.Bc / T10, 14.708 / 1.1866, 0.005, 'Bc hors δ'); near(2 * c.Mc / T10, 102.511 / 1.181, 0.01, 'Mc120 hors δ'); near(c.trott / T10, 3.251, 0.02, 'trottoirs');
  const r4 = computePoutres(parsePoutres({ ...DP, pt_entInt: '1, 2, 2, 1', pt_beInt: '0.38' })), E = r4.entInt;
  assert.ok(E && !E.erreur && E.travee === 3 && Math.abs(E.lam - 7.225) < 1e-9, 'travée 4, entretoises les plus espacées');
  const V = E.tranchants.find(q => q.poutre === 0), M = y => E.moments.find(q => Math.abs(q.y - y) < 1e-6);
  // PSIDA : δ un peu plus fort (poids du tablier pris sur la section des poutres), poutres de rive et centrale de même inertie
  for (const [o, ref, nom] of [[V.F61.Bc.max, 31.10, 'V Bc'], [V.F61.Bt.max, 35.71, 'V Bt'], [V.F61.Mc120.max, 54.76, 'V Mc120'], [V.F61.A.max, 26.10, 'V A(l)'],
    [M(-3.5).F61.Bc.max, 15.55, 'M(−3,50) Bc'], [M(-3.5).F61.Mc120.max, 25.43, 'M(−3,50) Mc120'], [M(-3.5).F61.Bt.max, 17.66, 'M(−3,50) Bt'], [M(-3.5).F61.A.max, 12.72, 'M(−3,50) A(l)'],
    [M(-3.75).F61.Bc.max, 7.78, 'M(−3,75) Bc'], [M(-3.75).F61.Mc120.max, 13.57, 'M(−3,75) Mc120']]) near(o / T10, ref, 0.07, nom);
  // moment au droit de la poutre centrale : note 55,39 t·m (G + max Q) ; maximum vers −1,75 m (note 66,47 t·m avec G = −5,5 t·m environ)
  near(M(0).max.PSIBA / T10, 55.39, 0.02, 'M(0) G + max Q');
  const yMax = E.moments.reduce((a, q) => (q.max.PSIBA > a.max.PSIBA ? q : a)).y;
  assert.ok(yMax <= -1 && yMax >= -2.25, `section du moment maximal ${yMax}`);
  // dimensionnement : 0,38 m suffit (épaisseur optimisée de la note : 0,38 m) ; 0,30 m ne passe pas en BAEL et reçoit une indication
  assert.ok(E.ok && E.BAEL.inf.As > 0 && E.BAEL.barresInf && E.BAEL.suspente > 0);
  const r3 = computePoutres(parsePoutres({ ...DP, pt_entInt: '1, 2, 2, 1', pt_beInt: '0.30' }));
  assert.ok(!r3.entInt.ok && r3.entInt.bNec > 0.30 && r3.entInt.bNec < 0.38);
  const { recommandationsPoutres } = await import('../src/reco/poutres.js');
  const rec = await recommandationsPoutres(r3, { ...DP, pt_entInt: '1, 2, 2, 1', pt_beInt: '0.30' }, { budget: 0 });
  const it = rec.items.find(i => i.domaine === 'Entretoises intermédiaires'), a = it.actions[0];
  assert.equal(a.champ, 'pt_beInt');
  assert.ok(computePoutres(parsePoutres({ ...DP, pt_entInt: '1, 2, 2, 1', pt_beInt: a.valeurChamp })).entInt.ok, 'l\'épaisseur proposée suffit');
  const tab = beamsBlocks(r3, { reco: rec }).find(b => b.t === 'table' && b.head[0] === 'Entretoise intermédiaire — vérification');
  tab.rows.forEach((row, i) => assert.equal(!!tab.hints[i], row[row.length - 1] === 'NON'));
});

test('Entretoises intermédiaires en travée indépendante, sans entretoise : pas de calcul', () => {
  const D1 = { ...DP, pt_spans: '15', pt_continu: 'non', pt_entInt: '1' }, r1 = computePoutres(parsePoutres(D1));
  assert.ok(r1.entInt && !r1.entInt.erreur && Math.abs(r1.entInt.lam - 7.5) < 1e-9 && r1.entInt.moments.length > 10);
  // symétrie de l'enveloppe (tablier symétrique)
  const m = r1.entInt.moments; near(m[0].max.ELU_F61 + 1, m[m.length - 1].max.ELU_F61 + 1, 0.01, 'symétrie');
  assert.equal(computePoutres(parsePoutres({ ...D1, pt_entInt: '0' })).entInt, null);
});
