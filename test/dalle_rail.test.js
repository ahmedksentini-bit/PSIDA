/**
 * Pont-dalle sous rail (ponts-rails, lot 2) : contrôles indépendants du moteur.
 * Les lignes d'influence sont écrites ici sous forme analytique (poutre isostatique ; deux travées égales), et les
 * enveloppes LM71 / SW/0 recherchées par balayage fin des positions : rien n'est repris de beam.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlabDeck } from '../src/analysis.js';
import { combineRail } from '../src/combinations.js';
import { parseData, compute } from '../src/pipeline.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { buildNoteRail, railCardHTML } from '../web/note_rail.js';

const proche = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const dalle = (spans, h = 0.8) => new SlabDeck({ spans, width: 6, h, roadway: { y1: -3, y2: 3 }, overhangs: [0, 0], lines: [], bands: [], footways: [], nGrid: 100, nSec: 20 });
const RAIL = { voies: [0], alpha: 1, entretien: 'normal', sw2: false, ballast: 0.30, longueurTraverse: 2.60, hTraverse: 0.22 };

// --- lignes d'influence analytiques et intégrales -------------------------------------------------------------------
/** M à mi-travée d'une travée isostatique L : il(x) = x/2 (x ≤ L/2), (L − x)/2 ; primitive exacte. */
const isoMid = L => ({
  il: x => (x <= 0 || x >= L ? 0 : x <= L / 2 ? x / 2 : (L - x) / 2),
  I: (a, b) => { const P = x => { x = Math.min(Math.max(x, 0), L); return x <= L / 2 ? x * x / 4 : L * L / 8 - (L - x) * (L - x) / 4; }; return P(b) - P(a); },
});
/** M sur l'appui central de deux travées égales L : il(a) = −a(L² − a²)/(4L²) dans chaque travée (a depuis la culée). */
const deuxTravees = L => {
  const f = a => -a * (L * L - a * a) / (4 * L * L), Fp = a => -(L * L * a * a / 2 - a ** 4 / 4) / (4 * L * L);
  const P = x => { x = Math.min(Math.max(x, 0), 2 * L); return x <= L ? Fp(x) : 2 * Fp(L) - Fp(2 * L - x); };
  return { il: x => (x <= 0 || x >= 2 * L ? 0 : x <= L ? f(x) : f(2 * L - x)), I: (a, b) => P(b) - P(a) };
};
/** LM71 : 4 essieux P à 1,60 m (zone de 6,40 m), q sur les parties de même signe hors de la zone ; IL de signe constant. */
function lm71Main(ilf, xMax, P, q, signe) {
  const tot = ilf.I(0, xMax); let best = 0;
  for (let i = 0, s = -6.4; s <= xMax + 1e-9; i++, s = Math.round((-6.4 + i * 0.01) * 1e6) / 1e6) {
    let v = 0; for (let k = 0; k < 4; k++) v += P * ilf.il(s + 0.8 + 1.6 * k);
    v += q * (tot - ilf.I(s, s + 6.4));
    if (signe * v > signe * best) best = v;
  }
  return best;
}
function swMain(ilf, xMax, q, a, c, signe) {
  let best = 0;
  for (let i = 0, s = -(2 * a + c); s <= xMax + 1e-9; i++, s = Math.round((-(2 * a + c) + i * 0.01) * 1e6) / 1e6) { const v = q * (ilf.I(s, s + a) + ilf.I(s + a + c, s + 2 * a + c)); if (signe * v > signe * best) best = v; }
  return best;
}
const phi3 = L => Math.min(Math.max(2.16 / (Math.sqrt(L) - 0.2) + 0.73, 1), 2);

test('Travée indépendante de 15 m, une voie, Φ3 : moment à mi-travée LM71 (α = 1,00 puis 1,21)', () => {
  // à la main, ligne d'influence il(x) = x/2 puis (15 − x)/2, aire 15²/8 = 28,125 m² :
  //  - tant que le sommet reste entre les essieux 2 et 3, Σ il des essieux est constante : 2,95 + 3,75 + 2,95 + 2,15 = 11,80
  //    → 250 × 11,80 = 2 950 kN·m ;
  //  - la charge de 80 kN/m s'applique hors des 6,40 m du groupe : l'effet est maximal quand la zone du groupe couvre le
  //    moins d'aire, groupe décalé (essieu 2 sur la section) : zone 5,10 → 11,50 m, aire (7,5² − 5,1²)/4 + (7,5² − 3,5²)/4
  //    = 7,56 + 11,00 = 18,56 m² → 80 × (28,125 − 18,56) = 765,2 kN·m ;
  //  - M = 3 715,2 kN·m (groupe centré : 2 950 + 80 × 9,245 = 3 689,6 kN·m, moins défavorable) ; Φ3(15) = 1,31808.
  const M1 = 250 * 11.8 + 80 * (15 * 15 / 8 - ((7.5 ** 2 - 5.1 ** 2) / 4 + (7.5 ** 2 - 3.5 ** 2) / 4));
  proche(M1, 3715.2, 1e-6);
  proche(lm71Main(isoMid(15), 15, 250, 80, 1), M1, 1e-6);       // balayage indépendant : même maximum
  proche(phi3(15), 1.31808, 1e-5);
  // réaction d'appui : premier essieu sur l'appui, 80 kN/m au-delà de 5,60 m (zone 0,8 m avant l'essieu)
  //  250 × (1 + 0,89333 + 0,78667 + 0,68) + 80 × (15 − 5,6)²/30 = 840 + 235,6 = 1 075,6 kN
  const R1 = 250 * (1 + (15 - 1.6) / 15 + (15 - 3.2) / 15 + (15 - 4.8) / 15) + 80 * (15 - 5.6) ** 2 / 30;
  proche(R1, 1075.63, 1e-4);
  proche(lm71MainReaction(15), R1, 1e-6);
  for (const alpha of [1, 1.21]) {
    const d = dalle([15]), r = d.ferroviaire({ ...RAIL, alpha });
    assert.equal(r.continu, false); assert.deepEqual(r.vert, ['LM71']);
    proche(r.LPhi.LPhi, 15); proche(r.phi, phi3(15), 1e-9);
    const s = d.beam.sectionIndex(0, 0.5), G = r.groupes[0];
    proche(G.res.Mmax[s], alpha * M1 * phi3(15), 2e-4);
    proche(G.res.Rmax[0], alpha * R1 * phi3(15), 2e-4);
  }
});

/** Réaction d'appui d'une travée isostatique sous LM71 par balayage (il(x) = 1 − x/L). */
function lm71MainReaction(L) {
  const ilf = { il: x => (x < 0 || x > L ? 0 : 1 - x / L), I: (a, b) => { const P = x => { x = Math.min(Math.max(x, 0), L); return x - x * x / (2 * L); }; return P(b) - P(a); } };
  return lm71Main(ilf, L, 250, 80, 1);
}

test('Dalle continue 2 × 15 m : SW/0 pris en compte, L_Φ = 1,2 × 15 = 18 m, moment sur appui', () => {
  const d = dalle([15, 15]), r = d.ferroviaire(RAIL);
  assert.deepEqual(r.vert, ['LM71', 'SW/0']);
  proche(r.LPhi.LPhi, 18); proche(r.LPhi.k, 1.2);
  proche(r.phi, phi3(18), 1e-9); proche(r.phi, 1.26430, 1e-5);
  const ilf = deuxTravees(15);
  proche(ilf.I(0, 30), -2 * 15 * 15 / 16, 1e-9);           // aire de la ligne d'influence : −L²/8
  const mLM = lm71Main(ilf, 30, 250, 80, -1), mSW = swMain(ilf, 30, 133, 15, 5.3, -1);
  const sB = d.beam.supportSectionIndex(1), G = r.groupes.find(g => g.id === 'rail1');
  proche(G.res.Mmin[sB], Math.min(mLM, mSW) * r.phi, 2e-3);
  // SW/0 seul, motif calé sur la culée : travée 1 entière (−L²/16) + 9,70 m de la travée 2 → borne inférieure de l'effet
  proche(-133 * (15 * 15 / 16 + (225 * 9.7 ** 2 / 2 - 9.7 ** 4 / 4) / 900), -3107.5, 1e-4);
  assert.ok(mSW <= -3107.5 + 1e-6);
});

test('Bande de répartition : ℓ_t + 2·e_b/4 + h, excentricité r/18, bande tronquée au bord', () => {
  const d = dalle([12], 0.8), r = d.ferroviaire({ ...RAIL, ballast: 0.40, longueurTraverse: 2.60 });
  proche(r.diffusion.bw, 2.60 + 2 * 0.40 / 4 + 0.80, 1e-12);   // 3,60 m
  proche(r.ecc, 1.5 / 18, 1e-12);
  proche(r.couverture, 0.62, 1e-12);
  const r2 = d.ferroviaire({ ...RAIL, voies: [2.5] });           // dalle de 6 m : bande de 3,40 m débordante
  assert.ok(r2.avert.some(a => /déborde/.test(a)));
  // couverture > 1 m : Φ réduit de (h − 1)/10 (§ 6.4.5.4)
  const r3 = d.ferroviaire({ ...RAIL, ballast: 0.98, hTraverse: 0.22 });
  proche(r3.phi, phi3(12) - 0.02, 1e-9);
});

test('Deux voies et SW/2 : groupes gr11, gr21, gr16, gr26 avec leurs γ et ψ ; 2 voies = somme des deux voies', () => {
  const d = dalle([15], 0.8);
  const D = new SlabDeck({ ...d.g, width: 10, roadway: { y1: -5, y2: 5 } });
  const r = D.ferroviaire({ ...RAIL, voies: [-2, 2], sw2: true });
  assert.deepEqual(r.groupes.map(g => [g.id, g.ref, g.gamma, g.psi0, g.psi1]), [
    ['rail1', 'gr11', 1.45, 0.8, 0.8], ['rail2', 'gr21', 1.45, 0.8, 0.7], ['sw2', 'gr16', 1.2, 0.8, 0.8], ['sw2b', 'gr26', 1.2, 0.8, 0.7]]);
  const s = D.beam.sectionIndex(0, 0.5), g = id => r.groupes.find(x => x.id === id).res;
  proche(g('rail2').Mmax[s], 2 * g('rail1').Mmax[s], 1e-9);       // effets globaux : deux voies identiques
  // SW/2 sur 15 m : la charge couvre la travée → M = 150 · L²/8 · Φ
  proche(g('sw2').Mmax[s], 150 * 15 * 15 / 8 * r.phi, 1e-6);
  proche(g('sw2b').Mmax[s], g('sw2').Mmax[s] + g('rail1').Mmax[s], 1e-9);
});

test('Combinaisons des ponts-rails (combineRail) : valeurs à la main', () => {
  const m = v => ({ mxMax: [[v]], mxMin: [[-v / 2]] });
  const perm = { mxMax: [[100]], mxMin: [[100]] }, thermal = m(10);
  const groupes = [{ res: m(50), gamma: 1.45, psi0: 0.8, psi1: 0.8 }, { res: m(60), gamma: 1.2, psi0: 0.8, psi1: 0.7 }];
  const c = combineRail(perm, groupes, { thermal });
  proche(c.ELU.max[0][0], 1.35 * 100 + Math.max(1.45 * 50, 1.2 * 60));              // 207,5
  proche(c.CAR.max[0][0], 100 + Math.max(10 + 0.8 * 50, 6 + 50, 10 + 0.8 * 60, 6 + 60)); // 166
  proche(c.FREQ.max[0][0], 100 + Math.max(6, 5 + 0.8 * 50, 5 + 0.7 * 60));          // 147
  proche(c.QP.max[0][0], 105);
  proche(c.ELU.min[0][0], 1.0 * 100 + Math.min(1.45 * -25, 1.2 * -30));             // G favorable à 1,00
});

test('Actions horizontales : freinage, démarrage, lacet, force centrifuge (tableau 6.8)', () => {
  const d = dalle([15, 15]), r = d.ferroviaire({ ...RAIL, alpha: 1.21, V: 160, rayon: 800, sw2: true });
  const h = r.horizontal;
  proche(h.Ltot, 30);
  proche(h.demarrageFreinage.freinage, 1.21 * 20 * 30); proche(h.demarrageFreinage.demarrage, 1.21 * 33 * 30);   // 990 kN < 1 000 kN : pas de plafond
  proche(h.demarrageFreinageSW2.freinage, 35 * 30);
  proche(h.lacet, 121);
  // V = 160 km/h > 120 : cas (7)b à V avec α = 1 et f ; cas (7)a à 120 km/h avec α et f = 1
  const b = h.centrifuge.find(c => c.V === 160), a = h.centrifuge.find(c => c.V === 120);
  const f = 1 - (160 - 120) / 1000 * (814 / 160 + 1.75) * (1 - Math.sqrt(2.88 / 30));
  proche(b.f, f, 1e-9); proche(b.Qt, 160 ** 2 / (127 * 800) * f * 250, 1e-9);
  proche(a.Qt, 120 ** 2 / (127 * 800) * 1.21 * 250, 1e-9);
  assert.ok(r.avert.some(t => /6\.4\.4/.test(t)));
  const r2 = d.ferroviaire({ ...RAIL, V: 220 });
  assert.ok(r2.avert.some(t => /> 200 km\/h/.test(t)));
});

test('Chaîne complète en mode ferroviaire : tablier, transversal, note ; mode routier inchangé', () => {
  const base = formDefaults();
  assert.equal(parseData(base).rail, undefined);                   // routier : aucune donnée ferroviaire
  const d = { ...base, trafic: 'ferroviaire', rail_n: '1', rail_y: '0', spans: '12, 15, 12', width: '6', h: '0.85', roadway: '-3, 3', footways: '', lines: '6 @ -2.9 ; 6 @ 2.9', bands: '18 sur -2.5,2.5', ys: '-3, -1.5, 0, 1.5, 3', methodeTablier: 'guyon' };
  const st = compute(parseData(d));
  assert.ok(st.rail); assert.equal(st.f61, null); assert.equal(st.design.F61, null); assert.equal(st.transDesign.F61, null);
  assert.ok(st.design.EC.rail); assert.ok(st.design.EC.punch.sansObjet);
  assert.match(st.supportsError, /lot 5/);
  assert.ok(st.trans.spans.every(sp => sp.rail && !sp.ec));
  assert.ok(st.transDesign.EC.spans.every(sp => sp.bot.As > 0 && sp.top.As > 0));
  assert.ok(st.cases.some(c => c.id === 'rail1'));
  const note = buildNoteRail(st, {});
  assert.ok(note.blocks.some(b => b.t === 'h1' && /Charges ferroviaires/.test(b.text)));
  assert.ok(note.blocks.some(b => b.t === 'comment' && /gestionnaire du réseau/.test(b.text)));
  assert.match(railCardHTML(st), /tableau 6\.2/);
  // plaque demandée : repli sur Guyon-Massonnet signalé
  const st2 = compute(parseData({ ...d, methodeTablier: 'plaque' }));
  assert.ok(st2.rail.avert.some(t => /plaque/.test(t)));
});

test('Coupe transversale en mode ferroviaire : voies, ballast, traverses, bande b_w, sans mention routière', async () => {
  const { guideCrossSectionSVG } = await import('../web/guide_schema.js');
  const { parseRail } = await import('../src/pipeline.js');
  const base = { spans: [12, 16, 12], width: 9, h: 1, overhangs: [0.5, 0.5], roadway: { y1: -4.5, y2: 4.5 }, footways: [], lines: [], bands: [{ q: 17, y1: -4, y2: 4, kmin: 1, kmax: 1 }], ys: [-4.5, 0, 4.5] };
  const routier = guideCrossSectionSVG({ ...base, rail: null });
  assert.match(routier, /chaussée/); assert.match(routier, /classe/);
  const R = parseRail({ trafic: 'ferroviaire', rail_n: '2', rail_y: '0', rail_entraxe: '4.2', rail_alpha: '1.21', rail_entretien: 'normal', rail_ballast: '0.30', rail_traverse: '2.60', rail_hTrav: '0.22' });
  const svg = guideCrossSectionSVG({ ...base, rail: R });
  assert.doesNotMatch(svg, /chaussée|classe|voies? EN 1991-2 de|profil en toit/);
  for (const t of ['2 voies ferrées', 'α = 1,21', 'Φ3', 'ballast', 'traverse ℓt = 2,6 m', 'e_b = 0,3 m', 'entraxe 4,2 m', 'b_w = 3,75 m', '4:1', '45°', 'q = 17 kN/m²']) assert.ok(svg.includes(t), t);
  assert.equal((svg.match(/<g[\s>]/g) || []).length, (svg.match(/<\/g>/g) || []).length);
});
