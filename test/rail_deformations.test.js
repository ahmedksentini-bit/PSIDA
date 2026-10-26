/**
 * Ponts-rails, lot 4 : déformations, vibrations et décision d'analyse dynamique — contrôles indépendants.
 * Flèches et rotations recalculées ici par les formules de la résistance des matériaux (poutre sur appuis simples) et
 * balayage fin des positions de LM71, sans passer par beam.js ni par rail_deformations.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { coefKBand } from '../src/guyon.js';
import { limitesN0, n0DepuisFleche, vSurN0Lim, decisionAnalyseDynamique, amortissement, limiteGauche, limiteTransversale, deformationsRail, ecmDynamique, facteurConfort } from '../src/rail_deformations.js';
import { parseData, compute } from '../src/pipeline.js';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { buildNoteRail, railCardHTML } from '../web/note_rail.js';
import { poutresNote } from '../web/beams_view.js';

const proche = (a, b, tol = 1e-3, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const RAIL = { voies: [0], alpha: 1, entretien: 'normal', sw2: false, ballast: 0.30, longueurTraverse: 2.60, hTraverse: 0.22, V: 160, rayon: 0 };

/** Flèche à mi-portée d'une travée L sur appuis simples sous P = 1 en a (formule de RdM, EI = 1). */
const wMid = (a, L) => { const u = Math.min(a, L - a); return u <= 0 ? 0 : u * (3 * L * L - 4 * u * u) / 48; };
/** ∫ wMid sur [c, d] (forme fermée, EI = 1). */
const intMid = (c, d, L) => {
  const P = x => { x = Math.min(Math.max(x, 0), L / 2); return (3 * L * L * x * x / 2 - x ** 4) / 48; };
  const Q = (c1, d1) => (d1 <= c1 ? 0 : P(d1) - P(c1));
  // symétrie : [c, d] ∩ [0, L/2] directement, [c, d] ∩ [L/2, L] par x → L − x
  return Q(Math.max(c, 0), Math.min(d, L / 2)) + Q(Math.max(L - Math.min(d, L), 0), Math.min(L - Math.max(c, L / 2), L / 2));
};
/** LM71 (4 × P à 1,60 m, zone de 6,40 m ; q hors de la zone) : flèche maximale à mi-portée, balayage au centimètre. */
function lm71FlecheMain(L, P, q) {
  const tot = intMid(0, L, L); let best = 0;
  for (let i = 0; ; i++) {
    const s = -6.4 + i * 0.01; if (s > L) break;
    let v = 0; for (let k = 0; k < 4; k++) v += P * wMid(s + 0.8 + 1.6 * k, L);
    v += q * (tot - intMid(s, s + 6.4, L));
    if (v > best) best = v;
  }
  return best;
}

test('Figure 6.10 : limites de n₀ pour L = 10 et 20 m (éq. 6.1 et 6.2)', () => {
  // à la main : 94,76 × 10^−0,748 = 94,76 × 0,178649 = 16,929 Hz ; 80/10 = 8,000 Hz
  //             94,76 × 20^−0,748 = 94,76 × 0,106373 = 10,080 Hz ; 80/20 = 4,000 Hz (et 23,58 × 20^−0,592 = 4,005 : continuité)
  let l = limitesN0(10); proche(l.sup, 16.929, 1e-4); proche(l.inf, 8.0, 1e-9);
  l = limitesN0(20); proche(l.sup, 10.080, 1e-4); proche(l.inf, 4.0, 1e-9);
  proche(limitesN0(20.0001).inf, 4.005, 1e-3);
  assert.equal(limitesN0(3).domaine, false); assert.equal(limitesN0(120).domaine, false);
});

test('n₀ d\'une dalle isostatique de 15 m : éq. (6.3) et formule exacte de la poutre', () => {
  // dalle 9 m × 0,90 m, C35/45 : E_cm = 22 000 × (43/10)^0,3 = 34 077 MPa ; I = 9 × 0,9³/12 = 0,546750 m⁴ ;
  // g = 25 × 9 × 0,9 = 202,5 kN/m ; δ₀ = 5 g L⁴/(384 EI) = 5 × 202,5 × 50 625 / (384 × 34 077 000 × 0,54675) = 7,1572 mm ;
  // n₀ = 17,75/√7,1572 = 6,635 Hz ; exact : π/(2 L²) √(EI/m), m = 202,5/9,81 t/m → 6,636 Hz
  const E = ecmDynamique(35); proche(E, 34077, 1e-4);
  const EI = E * 1000 * 9 * 0.9 ** 3 / 12, g = 25 * 9 * 0.9;
  const d0 = 1000 * 5 * g * 15 ** 4 / (384 * EI); proche(d0, 7.1572, 1e-3);
  const n0 = n0DepuisFleche(d0); proche(n0, 6.635, 1e-3);
  proche(n0, Math.PI / (2 * 225) * Math.sqrt(EI / (g / 9.81)), 2e-3);
  // le module : même n₀ (dalle seule, sans superstructure)
  const deck = new SlabDeck({ spans: [15], width: 9, h: 0.9, roadway: { y1: -4.5, y2: 4.5 }, overhangs: [0, 0], lines: [], bands: [], footways: [], nGrid: 100, nSec: 20 });
  const D = deformationsRail(deck, deck.ferroviaire(RAIL), { EI, EIz: E * 1000 * 0.9 * 9 ** 3 / 12, gPerm: { nom: g, min: g, max: g }, eSup: 0.45, type: 'beton_arme', E });
  proche(D.n0.n0, 6.635, 1e-3);
  // L = 15 m : limites [80/15 ; 94,76 × 15^−0,748] = [5,333 ; 12,500] Hz → n₀ dedans, V = 160 km/h → analyse non requise
  proche(D.decision.limites.inf, 5.3333, 1e-4); proche(D.decision.limites.sup, 12.500, 1e-4);
  assert.equal(D.decision.requise, false);
  // ζ béton armé, L = 15 m : 1,5 + 0,07 × 5 = 1,85 % (tableau 6.6)
  proche(D.n0.zeta, 1.85, 1e-9);
});

test('Flèche LM71 à mi-portée d\'une travée de 15 m (RdM) et flèche sous la voie', () => {
  // flèche de la poutre (EI du tablier entier) : groupe centré, à la main
  //  essieux à a = 5,1 ; 6,7 ; 8,3 ; 9,9 m : Σ a(3L² − 4a²)/48 (a ≤ L/2) = 2 × [6,7 × 495,44 + 5,1 × 570,96]/48 = 259,640
  //  80 kN/m sur [0 ; 4,3] et [10,7 ; 15] : 2 × 80/48 × (3 × 225 × 4,3²/2 − 4,3⁴) = 19 661,6
  //  → EI·w = 250 × 259,640 + 19 661,6 = 84 571,6 kN·m³ ; le balayage indépendant donne le maximum (groupe centré)
  const L = 15, E = ecmDynamique(35), EI = E * 1000 * 9 * 0.9 ** 3 / 12;
  proche(250 * (2 * (6.7 * (675 - 4 * 6.7 ** 2) + 5.1 * (675 - 4 * 5.1 ** 2)) / 48) + 2 * 80 / 48 * (3 * 225 * 4.3 ** 2 / 2 - 4.3 ** 4), 84571.6, 1e-5);
  const wPoutre = lm71FlecheMain(L, 250, 80) / EI;
  proche(wPoutre * EI, 84571.6, 1e-4);
  const deck = new SlabDeck({ spans: [L], width: 9, h: 0.9, roadway: { y1: -4.5, y2: 4.5 }, overhangs: [0, 0], lines: [], bands: [], footways: [], nGrid: 100, nSec: 20 });
  const rail = deck.ferroviaire(RAIL), phi = rail.phi;
  const D = deformationsRail(deck, rail, { EI, gPerm: { nom: 202.5 }, eSup: 0.45, type: 'beton_arme', E });
  // flèche sous la voie (L/600) : Φ × K̄ × flèche de la poutre ; K̄ au rail (y = ±0,7175) de la bande b_w décalée de ±r/18
  const bw = rail.diffusion.bw, e = rail.ecc, Kr = y => Math.max(...[e, -e].map(s => coefKBand({ b: 4.5, L, e1: s - bw / 2, e2: s + bw / 2, y, nu: 0.2, alpha: 1 })));
  const attendu = phi * wPoutre * Kr(0.7175);
  proche(D.fleches[0].w, attendu, 2e-3, 'flèche sous la voie');
  assert.ok(D.fleches[0].ok); proche(D.fleches[0].lim, 0.025, 1e-12);
  // confort : α = 1, une voie : même valeur ici (α = 1, une seule voie)
  proche(D.confort[0].w, attendu, 2e-3, 'confort');
  assert.equal(D.confort[0].ok, null);   // L/δ de la figure A2.3 non saisi
  // avec L/δ lu (1 000) : une travée → × 0,7 → 700 ≥ 600
  const D2 = deformationsRail(deck, rail, { EI, gPerm: { nom: 202.5 }, eSup: 0.45, LdeltaFig: 1000, E });
  proche(D2.confort[0].LsurDlim, 700, 1e-12);
  assert.equal(facteurConfort({ nTravees: 3, continu: true }), 0.9); assert.equal(facteurConfort({ nTravees: 2, continu: false }), 0.7);
});

test('Rotation d\'extrémité et δH sous LM71 (RdM, travée de 15 m)', () => {
  // θ₀ sous P = 1 en a : (L − a)(L² − (L − a)²)/(6 L EI) ; balayage de LM71 (4 essieux + 80 kN/m hors zone) au centimètre
  const L = 15, EI = 3e7;
  const th = a => (a <= 0 || a >= L ? 0 : (L - a) * (L * L - (L - a) ** 2) / (6 * L));
  const ITh = (c, d) => { const Fp = x => { x = Math.min(Math.max(x, 0), L); const u = L - x; return -(L * L * u * u / 2 - u ** 4 / 4) / (6 * L); }; return Fp(d) - Fp(c); };
  let best = 0;
  for (let i = 0; ; i++) { const s = -6.4 + i * 0.01; if (s > L) break; let v = 0; for (let k = 0; k < 4; k++) v += 250 * th(s + 0.8 + 1.6 * k); v += 80 * (ITh(0, L) - ITh(s, s + 6.4)); best = Math.max(best, v); }
  const deck = new SlabDeck({ spans: [L], width: 9, h: 0.9, roadway: { y1: -4.5, y2: 4.5 }, overhangs: [0.5, 0.5], lines: [], bands: [], footways: [], nGrid: 100, nSec: 20 });
  const D = deformationsRail(deck, deck.ferroviaire(RAIL), { EI, gPerm: { nom: 200 }, eSup: 0.45 });
  // sans Φ, une voie (le module ajoute les abouts chargés : ils réduisent θ, le balayage manuel les ignore)
  assert.ok(D.extremites[0].theta <= best / EI * 1.0005, `${D.extremites[0].theta} > ${best / EI}`);
  proche(D.extremites[0].theta, best / EI, 3e-2);
  proche(D.extremites[0].deltaH, 1000 * D.extremites[0].theta * 0.45, 1e-9);
  assert.equal(D.extremites[0].deltaHlim, 10); assert.equal(D.extremites[0].deltaVlim, 3);
});

test('Organigramme de la figure 6.9 et tableaux F.1 / F.2', () => {
  // continu, V ≤ 200 → non requise (note 5, sous réserve d'A2.4.4)
  let d = decisionAnalyseDynamique({ V: 160, continu: true, L: 18 }); assert.equal(d.requise, false); assert.match(d.reserve, /A2\.4\.4/);
  // simple, n₀ sous la limite inférieure, n_T inconnue → indéterminé ; n_T ≤ 1,2 n₀ → requise
  d = decisionAnalyseDynamique({ V: 160, simple: true, L: 15, n0: 4 }); assert.equal(d.requise, null);
  d = decisionAnalyseDynamique({ V: 160, simple: true, L: 15, n0: 4, nT: 4.5 }); assert.equal(d.requise, true);
  // n₀ au-dessus de la limite supérieure → requise (note 7)
  d = decisionAnalyseDynamique({ V: 160, simple: true, L: 15, n0: 13 }); assert.equal(d.requise, true);
  // V = 220 km/h, L = 15 m (n₀ ≤ limite supérieure 12,50 Hz), n_T > 1,2 n₀, voie soigneusement entretenue, m = 12 t/m,
  // ζ = 1,5 % : F.1, ligne [15 ; 17,5), ζ tabulé ≤ 1,5 → 1 %, colonne [10 ; 13) → (v/n₀)lim = 5,33 m ;
  // v/n₀ = 61,11/12 = 5,09 m ≤ 5,33 → non requise ; n₀ = 11 Hz : 5,56 m > 5,33 → requise
  const t = vSurN0Lim({ L: 15, m: 12, zeta: 1.5 }); assert.equal(t.v, 5.33); assert.equal(t.tableau, 'F.1');
  d = decisionAnalyseDynamique({ V: 220, simple: true, L: 15, n0: 12, nT: 20, m: 12, zeta: 1.5, entretien: 'soigne', alpha: 1, repartition: 2.6 });
  assert.equal(d.requise, false, d.etapes.join(' | '));
  d = decisionAnalyseDynamique({ V: 220, simple: true, L: 15, n0: 11, nT: 20, m: 12, zeta: 1.5, entretien: 'soigne', alpha: 1 });
  assert.equal(d.requise, true);
  d = decisionAnalyseDynamique({ V: 220, simple: true, L: 15, n0: 12, nT: 20, m: 12, zeta: 1.5, entretien: 'normal', alpha: 1 });   // F(2) : Φ2 exigé
  assert.equal(d.requise, true);
  d = decisionAnalyseDynamique({ V: 220, simple: true, L: 15, n0: 14, nT: 20, m: 12, zeta: 1.5, entretien: 'soigne', alpha: 1 });   // n₀ > 12,50 Hz : F(2)
  assert.equal(d.requise, true);
  assert.equal(decisionAnalyseDynamique({ V: 250, continu: true, simple: false, L: 18 }).requise, true);
  // F.2 (5 m/s²), quelques cases relues : L ∈ [20 ; 25), ζ 1, m ∈ [15 ; 18) → 13,75 ; L ≥ 40, m ∈ [7 ; 9) → case vide
  assert.equal(vSurN0Lim({ L: 22, m: 16, zeta: 1, aMax: 5 }).v, 13.75);
  assert.equal(vSurN0Lim({ L: 45, m: 8, zeta: 1 }), null);
  assert.equal(vSurN0Lim({ L: 8, m: 6, zeta: 1 }), null);   // ζ = 1 % < plus petit ζ tabulé (2 %) pour L < 10 m
  // tableau 6.6 et limites A2.4.4
  proche(amortissement('precontraint', 25), 1.0, 1e-12); proche(amortissement('metal', 12), 1.5, 1e-12);
  assert.deepEqual([limiteGauche(100), limiteGauche(160), limiteGauche(250)], [4.5, 3.0, 1.5]);
  assert.deepEqual(limiteTransversale(160), { thetaH: 0.002, rayon: 6000 });
});

test('Branchement : pont-dalle et pont à poutres sous rail (interface, note), mode routier inchangé', () => {
  const d = { ...formDefaults(), trafic: 'ferroviaire', rail_n: '2', rail_entraxe: '4.2', rail_V: '160' };
  const st = compute(parseData(d));
  const D = st.rail.deformations;
  assert.ok(!D.erreur, D.erreur);
  assert.equal(D.fleches.length, st.deck.spans.length); assert.equal(D.decision.requise, false);
  assert.match(railCardHTML(st), /Déformations et vibrations/);
  const note = buildNoteRail(st, {});
  assert.ok(note.blocks.some(b => b.t === 'h2' && /Déformations et vibrations/.test(b.text)));
  assert.ok(!note.blocks.some(b => b.t === 'p' && /lot 4/.test(b.text)));
  // routier : pas de déformations ferroviaires
  const st0 = compute(parseData(formDefaults()));
  assert.equal(st0.rail, undefined);
  // pont à poutres sous rail
  const r = computePoutres(parsePoutres({ ...formDefaults(), pt_trafic: 'ferroviaire', pt_rail_n: '1', pt_rail_V: '160', pt_rail_about: '0.4' }));
  const Dp = r.spans[0].rail.deformations;
  assert.ok(!Dp.erreur, Dp.erreur); assert.ok(Dp.n0.n0 > 0); assert.ok(Dp.extremites[0].deltaV > 0);
  assert.ok(poutresNote(r).blocks.some(b => b.t === 'h2' && /Déformations et vibrations/.test(b.text)));
});
