/**
 * Aide à la conception : règles du guide SETRA « Ponts-dalles » (1989) et recherche d'épaisseur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domaineEmploi, epaisseurGuide, proposerTravures, verifierTravure, verifierBiais, longueurAbout, minTransversalGuide, aideConception, rechercheEpaisseur, coefBeton } from '../src/conception.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : attendu ${b}, obtenu ${a}`);

test('domaine d\'emploi (§ 1.2) : DA ≤ 15 m (1–2 travées) / ≤ 18 m (≥ 3), DP 14–25 m, encorbellements > 20 m', () => {
  assert.equal(domaineEmploi([12]).recommande, 'DA');
  assert.equal(domaineEmploi([16, 16]).recommande, 'DP');
  assert.equal(domaineEmploi([12, 17, 12]).recommande, 'DA');
  assert.deepEqual(domaineEmploi([14, 22, 14]).types, ['DP à encorbellements']);
  assert.equal(domaineEmploi([20, 32, 20]).recommande, 'autre');
  assert.equal(domaineEmploi([5]).level, 'info', 'portée très courte : cadre/portique');
});

test('épaisseur indicative : abaques numérisés (§ 3.1.2, § 3.1.3) et coefficient de classe de béton', async () => {
  const { epaisseurAbaqueDA, epaisseurAbaqueDP } = await import('../src/conception.js');
  assert.equal(coefBeton(25), 1); assert.equal(coefBeton(30), 0.87); assert.equal(coefBeton(35), 0.81);
  // exemple du guide (§ 3.1.3) : 4 travées 8-15-15-8 m, B25 → 0,56 m d'après l'abaque p. 67
  rel(epaisseurAbaqueDA([8, 15, 15, 8]).h25, 0.56, 0.01, 'h 8-15-15-8');
  rel(epaisseurGuide({ spans: [8, 15, 15, 8], fck: 25 }).h, 0.56, 0.01, 'epaisseurGuide = abaque');
  rel(epaisseurGuide({ spans: [8, 15, 15, 8], fck: 35 }).h, 0.56 * 0.81, 0.01, 'B35 × 0,81');
  // 4 travées : minimum vers θ ≈ 0,83 puis la travée de rive gouverne (p. 67)
  const h = u => epaisseurAbaqueDA([u, 15, 15, u]).h25;
  assert.ok(h(12.5) < h(8) && h(8) < h(15), 'forme de la courbe ℓ = 15 m');
  rel(h(15), 0.609, 0.01, 'θ = 1 : 0,61 m');
  // 3 travées p. 66 : ℓ = 15, rive 10 → 0,515 ; travée indépendante p. 65 : 12 m → 0,53 ; 2 travées égales 13 m → 0,56
  rel(epaisseurAbaqueDA([10, 15, 10]).h25, 0.515, 0.01, '3 travées'); rel(epaisseurAbaqueDA([12]).h25, 0.531, 0.01, '1 travée');
  rel(epaisseurAbaqueDA([13, 13]).h25, 0.558, 0.01, '2 travées');
  // interpolation entre courbes et prolongement signalé
  const mid = epaisseurAbaqueDA([10, 14.5, 14.5, 10]).h25; assert.ok(mid > h(10) - 0.04 && mid < h(10), 'interpolation en ℓ');
  assert.ok(epaisseurAbaqueDA([14.6, 20.8, 14.6]).extrap, 'ℓ > 19 m : prolongement');
  assert.ok(epaisseurAbaqueDA([9, 14, 15, 13, 8]).note.includes('5 travées'));
  // PSI.DP : plateaux des abaques p. 59–61
  rel(epaisseurAbaqueDP([15, 22, 15]).h, 0.635, 0.01, 'DP3 ℓ = 22'); rel(epaisseurAbaqueDP([15, 22, 15], true).h, 0.832, 0.01, 'DP3N');
  rel(epaisseurAbaqueDP([20, 20]).h, 0.692, 0.01, 'DP2 ℓ = 20'); rel(epaisseurGuide({ spans: [15, 22, 15], type: 'DP' }).hElancement, 22 / 33, 1e-9, 'élancement 1/33');
});

test('propositions de travure : somme exacte, rives à 0,7, décroissance vers les culées', () => {
  const tv = proposerTravures({ Ltot: 50, r: 0.7, fck: 35 });
  for (const v of tv) rel(v.spans.reduce((a, b) => a + b, 0), 50, 1e-9, `somme ${v.n} travées`);
  const t3 = tv.find(v => v.n === 3), t4 = tv.find(v => v.n === 4), t5 = tv.find(v => v.n === 5);
  rel(t3.spans[0] / t3.spans[1], 0.7, 0.02, 'r 3 travées'); rel(t4.spans[0] / t4.spans[1], 0.7, 0.02, 'r 4 travées');
  assert.ok(t5.spans[0] < t5.spans[1] && t5.spans[1] < t5.spans[2], '5 travées croissantes vers le milieu');
  assert.equal(t4.type, 'DA'); assert.equal(t3.type, 'DP'); assert.equal(tv.find(v => v.n === 1).ok, false, '50 m en une travée : hors domaine');
  // biais prononcé : r ≥ 0,6 (§ 2.1.1)
  const tb = proposerTravures({ Ltot: 50, r: 0.5, psi: 60 });
  rel(tb.find(v => v.n === 3).spans[0] / tb.find(v => v.n === 3).spans[1], 0.6, 0.02, 'r min biais');
});

test('vérification d\'une travure (§ 2.1.1) : rapports de rive 0,5–0,85', () => {
  const warn = items => items.filter(i => i.level === 'warn').length;
  assert.equal(warn(verifierTravure({ spans: [10, 15, 15, 10] })), 0);
  assert.equal(warn(verifierTravure({ spans: [6, 15, 15, 6] })), 2, 'rives trop courtes (0,4)');
  assert.equal(warn(verifierTravure({ spans: [14, 15, 14] })), 2, 'rives trop longues (0,93)');
  assert.equal(warn(verifierTravure({ spans: [8, 15, 15, 8], psi: 60 })), 2, 'biais prononcé : 0,53 < 0,6');
  assert.equal(warn(verifierTravure({ spans: [10, 22] })), 1, '2 travées dissymétriques 0,45');
});

test('biais (§ 2.4, § 3.4) : validité Guyon, options de ferraillage, minimum transversal, abouts', () => {
  const ok = verifierBiais({ spans: [10, 15, 15, 10], width: 12, h: 0.75, I: 0.43076814, psi: 80 });
  rel(ok.phiMec[0], 82.5322, 1e-4, 'φ travée 1'); assert.equal(ok.items[0].level, 'ok');
  assert.ok(ok.items[1].text.includes('option 1'), 'ψ = 80 gr BA → option 1');
  const bad = verifierBiais({ spans: [8, 8], width: 10, h: 0.5, psi: 55 });
  assert.equal(bad.items[0].level, 'warn', 'φ < 70 gr : Guyon non valable');
  assert.ok(bad.items[1].text.includes('option 2'));
  const mt = minTransversalGuide({ width: 12, spans: [10, 15, 15, 10], h: 0.75, psi: 80 });
  // § 3.4.3 travée par travée : rives de 10 m → 1,56 ‰, travées de 15 m → 1,04 ‰ (guide p. 80, note PSIDP.EL)
  rel(mt.rhoBase, 1.56e-3, 1e-3, '1,3 η ‰ (travée la plus courte)'); rel(mt.perSpan[1] / mt.k, 1.04e-3, 1e-3, '1,3 η ‰ travée de 15 m'); rel(mt.k, 1 / Math.sin(0.4 * Math.PI), 1e-9, '1/sin ψ');
  rel(minTransversalGuide({ width: 20, spans: [10], h: 0.5, psi: 100 }).rho, 2e-3, 1e-9, 'plafond 2 ‰');
  rel(longueurAbout({ type: 'DA', D: 0.025 }), 0.475, 1e-9, 'about BA 0,1 + 15 D');
  rel(longueurAbout({ type: 'DP', psi: 50 }), 1.0, 1e-9, 'about BP 0,5 (1 + cot 50 gr)');
});

test('synthèse aideConception : sections, travures et recherche d\'épaisseur (exemple CHAMOA, 2 pas)', async () => {
  const deckInput = { spans: [10, 15, 15, 10], width: 12, h: 0.75, area: 8.91, overhangs: [0.5, 0.5], roadway: { y1: -5, y2: 5 },
    footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }], lines: [{ g: 10, e: -5.85, kmin: 0.8, kmax: 1.2 }, { g: 10, e: 5.85, kmin: 0.8, kmax: 1.2 }],
    bands: [{ q: 0.66, y1: -6, y2: 6, kmin: 0.8, kmax: 1.2 }, { q: 1.92, y1: -5, y2: 5, kmin: 0.8, kmax: 1.4 }, { q: 0.72, y1: -6, y2: -5 }, { q: 0.72, y1: 5, y2: 6 }],
    ys: [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6], nu: 0.2 };
  const aid = aideConception({ spans: deckInput.spans, width: 12, h: 0.75, fck: 35, psi: 80, overhangs: [0.5, 0.5], D: 0.025, I: 0.43076814 });
  assert.equal(aid.type, 'DA'); assert.equal(aid.Ltot, 50); assert.equal(aid.travures.length, 5);
  assert.ok(aid.sections.length >= 6 && aid.sections.every(s => s.items.length > 0));
  const r = await rechercheEpaisseur({ deckInput, alpha: 'FR2', mat: { fck: 35, fyk: 500, c: 0.03, phi: 0.02, wkMax: 0.3 }, withTherm: false }, { hMin: 0.49, hMax: 0.55, step: 0.02, rhoMax: 0.01 });
  assert.equal(r.rows.length, 2, 'arrêt à la première épaisseur vérifiée');
  assert.ok(r.rows[0].rhoTop > 0.01 && !r.rows[0].ok, '0,49 m : ρ > 1 %');
  assert.equal(r.hOK, 0.51, '0,51 m vérifiée sans température (ρ ≈ 0,97 %, pas d\'aciers comprimés, poinçonnement OK)');
  assert.ok(r.rows[1].stirrups && r.rows[1].vMax < 1, 'V_Ed > V_Rd,c (étriers) mais < V_Rd,max');
});
