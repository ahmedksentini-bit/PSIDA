/**
 * Modules complémentaires : engins de chantier / LM3 (véhicules généralisés), zonage (guide 1989 § 3.4.4–3.4.6),
 * encorbellements, fatigue λ_s (EN 1992-2 annexe NN).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA } from '../src/loads_ec.js';
import { designEC, designSingleActionEC } from '../src/design.js';
import { parseAxles, vehicleEnvelope, provisionalProfile, VEHICULE_SPECIAL_CHAMOA, vehicleAnnexA, dynLM3 } from '../src/vehicles.js';
import { zonage } from '../src/zonage.js';
import { cantileverMoments, cantileverDesign } from '../src/cantilever.js';
import { flm3Envelope, fatigueCheck, FLM3 } from '../src/fatigue.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : attendu ${b}, obtenu ${a}`);
const mkDeck = () => new SlabDeck({ spans: [10, 15, 15, 10], width: 12, h: 0.75, area: 8.91, overhangs: [0.5, 0.5], roadway: { y1: -5, y2: 5 },
  footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }], bands: [{ q: 1.92, y1: -5, y2: 5 }], ys: [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6], nu: 0.2 });

test('véhicules généralisés : véhicule spécial CHAMOA à P1 (note : 451 kN·m), profil provisoire, LM3 annexe A', () => {
  const deck = mkDeck(), P1 = deck.beam.supportSectionIndex(1);
  assert.deepEqual(parseAxles('100@1 ; 100@9'), [{ x: 1, P: 100 }, { x: 9, P: 100 }]);
  const r = vehicleEnvelope(deck, VEHICULE_SPECIAL_CHAMOA, { y1: -4, y2: 4, neutral: 1 });
  rel(r.Mmin[P1], -331, 0.01, 'moment de poutre 2 × 150 kN à 8 m');
  const K = deck.transverseFactors(r).K[P1];
  rel(r.Mmin[P1] * K, -451.05, 0.04, 'M × K à P1 (note CHAMOA 451, roues dans la largeur chargeable)');
  const pp = provisionalProfile(deck, { roadway: { y1: -4, y2: 4 }, neutral: 1, remblai: { h: 0.5, y1: -5, y2: 5 }, enrobe: { t: 0.2, y1: -4, y2: 4 }, vehicles: [VEHICULE_SPECIAL_CHAMOA] });
  rel(pp.perm.gTotal, 25 * 8.91 + 20 * 0.5 * 10 + 24 * 0.2 * 8, 1e-9, 'charges permanentes provisoires');
  assert.ok(pp.Q && pp.Q.Mmin[P1] < 0);
  const v = vehicleAnnexA(1200, 200);
  assert.equal(v.axles.length, 6); assert.equal(v.width, 3); rel(dynLM3(10), 1 + 0.7 / 3, 1e-9, 'coefficient dynamique L = 10');
  const d = designSingleActionEC(deck, pp.perm, pp.Q, { fck: 35, fyk: 500, c: 0.03, phi: 0.02 });
  assert.ok(d.envTop[P1] > 0 && d.comb.ELU.min[P1][0] < 0, 'aciers d\'appui du profil provisoire');
});

test('zonage (§ 3.4.4–3.4.6) : chevêtres, extensions, bords libres, angles', () => {
  const z = zonage({ spans: [10, 15, 15, 10], overhangs: [0.5, 0.5], width: 12, h: 0.75, psi: 80, bearingPitch: 3, optionFers: 1 });
  const c = 3 / (3 * Math.sin(0.4 * Math.PI)), e = 2 * c;
  const ch0 = z.zones.find(x => x.kind === 'chevetre' && x.support === 'C0'), p1 = z.zones.find(x => x.kind === 'chevetre' && x.support === 'P1');
  rel(ch0.x2 - ch0.x1, 0.5 + c, 1e-9, 'chevêtre C0 = about + a/(3 sin ψ)'); rel(p1.x2 - p1.x1, 2 * c, 1e-9, 'chevêtre P1 = ± a/(3 sin ψ)');
  assert.equal(z.zones.filter(x => x.kind === 'extension' && x.support === 'P1').length, 2);
  rel(z.zones.find(x => x.kind === 'extension' && x.support === 'C0').x2 - ch0.x2, e, 1e-9, 'extension = 2a/(3 sin ψ)');
  rel(z.rhoEdge, 0.9e-3, 1e-9); rel(z.rhoCorner, 0.6e-3 / Math.sin(36 * Math.PI / 180) ** 2, 1e-9, 'angles 0,6/sin²(α/2) avec α = 72°');
  rel(zonage({ spans: [10], width: 10, h: 0.5, bearingPitch: 3, angleFers: 60 }).rhoCorner, 2.4e-3, 1e-6, '2,4 ‰ à 60° (exemple du guide)');
  rel(zonage({ spans: [10], width: 10, h: 0.5, bearingPitch: 3, angleFers: 45 }).rhoCorner, 4.1e-3, 0.01, '4,1 ‰ à 45°');
});

test('encorbellement : moments d\'encastrement et aciers', () => {
  const m0 = cantileverMoments({ Lc: 2, hr: 0.3, ht: 0.3 });
  rel(m0.G.mG, 25 * 0.3 * 2 * 2 / 2, 1e-9, 'poids propre épaisseur constante γ h L²/2');
  const m = cantileverMoments({ Lc: 2.5, hr: 0.45, ht: 0.22, lines: [{ g: 10, e: 2.35 }], footway: { x1: 1.5, x2: 2.5 }, roadOverlap: 1.5, alphaQ1: 0.9 });
  rel(m.ts.xQ, 1.0, 1e-9, 'roue à 0,5 m du bord de chaussée'); rel(m.ts.beff, 0.4 + 2 * 0.08 + (0.45 + (0.22 - 0.45) * 0.5 / 2.5) + 1.2 + 2, 1e-9, 'b_eff tandem');
  assert.ok(m.ELU > m.CAR && m.CAR > m.FREQ && m.FREQ > m.QP);
  const d = cantileverDesign(m, { fck: 35, fyk: 500 }); assert.ok(d.As > 5e-4 && d.As < 30e-4);
});

test('fatigue (annexe NN) : λ_s et vérification FLM3 sur l\'exemple', () => {
  const deck = mkDeck(); const perm = deck.permanent(), ec = deck.eurocode({ alpha: EC_ALPHA.FR2 });
  const d = designEC(deck, perm, ec, { fck: 35, fyk: 500, c: 0.03, phi: 0.02 });
  assert.equal(FLM3.axles.length, 4); assert.equal(FLM3.axles[2].d, 7.2);
  const f = fatigueCheck(deck, flm3Envelope(deck), perm, d, deck.keySections(), { lambda1: 1.0, categorie: 2, trafic: 'longue' });
  rel(f.lambda2, Math.pow(0.25, 1 / 9), 1e-9, 'λ_s,2 = (0,5/2)^(1/9)'); rel(f.lambdaS, f.lambda2, 1e-9);
  assert.ok(f.rows.every(r => r.dSigEc > 0 && r.ok), 'étendues positives, vérifiées sur l\'exemple');
  assert.equal(f.rows.find(r => r.kind === 'support').factor, 1.75); assert.equal(f.rows.find(r => r.kind === 'span').factor, 1.4);
});
