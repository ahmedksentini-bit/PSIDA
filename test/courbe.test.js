/** Ouvrage courbe : lecture du DXF (axe + lignes d'appui), plaque sur l'axe courbe, force centrifuge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireDXF, ecrireDXF } from '../src/geom/dxf.js';
import { Axe, stationsAppuis } from '../src/geom/axe.js';
import { forceCentrifuge, qvEC, coefCentrifugeF61, forceCentrifugeF61 } from '../src/geom/centrifuge.js';
import { dxfCourbe } from '../tools/dxf_courbe.mjs';
import { analyserDXF } from '../web/trace_view.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { plaqueTablier, permanentPlaque, raideurAppareil } from '../src/plate/deck.js';

const proche = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m} : ${a} / ${b}`);

test('DXF d\'essai (exemples/ouvrage_courbe.dxf) : axe droite + arc R 60 m + droite, lignes d\'appui radiales à 2, 16, 34, 48 m', () => {
  const r = analyserDXF(readFileSync(new URL('../exemples/ouvrage_courbe.dxf', import.meta.url), 'utf8'));
  assert.equal(r.calqueAxe, 'AXE'); assert.equal(r.calqueAppuis, 'APPUIS');
  proche(r.axe.L, 56, 1e-9, 'longueur de l\'axe'); proche(r.rMin, 60, 1e-9, 'rayon');
  [2, 16, 34, 48].forEach((s, i) => { proche(r.stations[i].s, s, 1e-6, `station ${i}`); proche(r.stations[i].psi, 100, 1e-3, `ψ ${i}`); });
  assert.deepEqual(r.spans.map(L => +L.toFixed(6)), [14, 18, 14]);
  // l'arc : point à mi-arc à la distance R du centre (1010, 2060)
  const p = r.axe.point(28); proche(Math.hypot(p[0] - 1010, p[1] - 2060), 60, 1e-9, 'point de l\'arc');
  proche(r.axe.courbure(28), 1 / 60, 1e-12, 'courbure (virage à gauche)');
});

test('DXF : ARC, LINE et polyligne écrits à l\'envers ou en morceaux donnent le même axe', () => {
  const R = 60, c = [1010, 2060];
  const ent = [
    { type: 'LINE', calque: 'AXE', a: [1046, 2010], b: [1010 + R * Math.sin(0.6) + 10 * Math.cos(0.6), 2060 - R * Math.cos(0.6) + 10 * Math.sin(0.6)] },
    { type: 'ARC', calque: 'AXE', c, r: R, a0Deg: -90, a1Deg: -90 + 0.6 * 180 / Math.PI },
    { type: 'LINE', calque: 'AXE', a: [1010, 2000], b: [1000, 2000] },   // à l'envers
  ];
  ent[0].a = [c[0] + R * Math.sin(0.6), c[1] - R * Math.cos(0.6)];
  const d = lireDXF(ecrireDXF(ent));
  const ax = Axe.depuisEntites(d.entites);
  proche(ax.L, 56, 1e-9, 'longueur'); proche(ax.point(0)[0], 1000, 1e-9, 'origine');
  const ref = Axe.depuisEntites(lireDXF(dxfCourbe()).entites.filter(e => e.calque === 'AXE'));
  for (const s of [5, 20, 33, 50]) { const p = ax.pointDeporte(s, 3), q = ref.pointDeporte(s, 3); proche(Math.hypot(p[0] - q[0], p[1] - q[1]), 0, 1e-9, `s = ${s}`); }
});

test('Ligne d\'appui biaise sur un ouvrage courbe : angle signé avec la tangente', () => {
  const ref = Axe.depuisEntites(lireDXF(dxfCourbe()).entites.filter(e => e.calque === 'AXE'));
  const lig = [2, 16, 34, 48].map(s => { const p = ref.pointDeporte(s, 0), t = ref.tangente(s), n = ref.normale(s), u = [0.5 * t[0] + n[0], 0.5 * t[1] + n[1]]; return { type: 'LINE', calque: 'APPUIS', a: [p[0] - 6 * u[0], p[1] - 6 * u[1]], b: [p[0] + 6 * u[0], p[1] + 6 * u[1]] }; });
  const ent = lireDXF(dxfCourbe()).entites.filter(e => e.calque === 'AXE');
  const st = stationsAppuis(Axe.depuisEntites(ent), lig.map(l => ({ type: 'ligne', a: l.a, b: l.b })));
  st.forEach(s => proche(s.psi, Math.atan2(1, 0.5) * 200 / Math.PI, 1e-6, 'ψ signé'));
  const dxf = dxfCourbe().replace(/0\nENDSEC[\s\S]*$/, '') + lig.map(l => `0\nLINE\n8\nBIAIS\n10\n${l.a[0]}\n20\n${l.a[1]}\n11\n${l.b[0]}\n21\n${l.b[1]}`).join('\n') + '\n0\nENDSEC\n0\nEOF\n';
  const r = analyserDXF(dxf, { calqueAxe: 'AXE', calqueAppuis: 'BIAIS' });
  assert.ok(r.psiLignes.every(p => Math.abs(p - 70.5) < 0.05), String(r.psiLignes));
});

test('Rayon minimal sur la longueur du tablier seulement', () => {
  const ax = analyserDXF(dxfCourbe()).axe;
  assert.equal(ax.rayonMin(0, 9), Infinity); proche(ax.rayonMin(0, 11), 60, 1e-9, 'arc atteint'); proche(ax.rayonMin(), 60, 1e-9, 'tout l\'axe');
});

test('Force centrifuge EN 1991-2 tableau 4.3', () => {
  const Qv = qvEC([1, 1, 1], 3);
  assert.equal(Qv, 1200);
  assert.equal(forceCentrifuge({ r: 60, Qv }), 240);
  assert.equal(forceCentrifuge({ r: 400, Qv }), 120);
  assert.equal(forceCentrifuge({ r: 2000, Qv }), 0);
  assert.equal(forceCentrifuge({ r: Infinity, Qv }), 0);
  assert.equal(qvEC([0.9, 0.8, 0.8], 2), 2 * (0.9 * 300 + 0.8 * 200));
});

test('Forces centrifuges Fascicule 61 titre II art. 7 (système Bc)', () => {
  proche(coefCentrifugeF61(400), 0.2, 1e-12, 'continuité à 400 m'); proche(coefCentrifugeF61(800), 0.1, 1e-12, '80/R');
  proche(coefCentrifugeF61(60), 210 / 710, 1e-12, 'R = 60 m');
  const f = forceCentrifugeF61({ r: 60, nv: 3, bc: [1.2, 1.1, 0.95, 0.8, 0.7], delta: 1.1, Ltot: 46 });
  assert.equal(f.nf, 3); proche(f.F, 3 * 0.95 * 2 * 300 * 210 / 710 * 1.1, 1e-9, 'F');
});

test('Plaque sur axe courbe : équilibre, R → ∞ = ouvrage droit, appareils extérieurs plus chargés', () => {
  const st = compute(parseData(formDefaults()));
  const kv = st.bearings.rows.map(r => raideurAppareil(r.sel.bd, r.sel.n));
  const calc = R => {
    const deck = Object.create(st.deck);
    if (R) {
      const ax = Axe.depuisEntites(lireDXF(dxfCourbe({ R })).entites.filter(e => e.calque === 'AXE'));
      deck.g = { ...st.deck.g, trace: { segments: ax.seg, s0: 2 } };
    }
    return permanentPlaque(plaqueTablier(deck, { h: 0.25, E: st.p.E || 34000, nb: st.bearings.nb, kv }));
  };
  const d = calc(null), g = calc(1e6), c = calc(60);
  const tot = x => x.R.reduce((s, v) => s + v, 0);
  proche(tot(c) / tot(d), 1, 1e-6, 'poids total (∫ J dy = 2b)');
  d.Rapp.flat().forEach((v, k) => proche(g.Rapp.flat()[k] / v, 1, 1e-3, `appareil ${k}`));
  // virage à gauche : l'extérieur est du côté y < 0 (rang 0)
  for (const i of [0, 1, 2, 3]) { const r = c.Rapp[i]; assert.ok(r[0] > r[r.length - 1] * 1.03, `ligne ${i} : ${r.map(v => v.toFixed(0))}`); }
});

test('Calcul complet d\'un ouvrage courbe : tracé lu dans le formulaire, plaque imposée, force centrifuge dans gr2', () => {
  const r = analyserDXF(dxfCourbe());
  const f = { ...formDefaults(), trace: JSON.stringify({ segments: r.axe.seg, s0: r.stations[0].s, source: 'essai' }), spans: r.spans.join(', ') };
  const p = parseData(f);
  assert.equal(p.methodeTablier, 'plaque');
  const st = compute(p);
  assert.ok(st.deck.plaque && st.deck.plaque.M.geo, 'plaque sur axe courbe');
  assert.equal(st.supports.centrifuge.Qtk, 240);
  const L = st.supports.lines[1], c = L.EC.base.find(b => /centrifuge/.test(b.label) && b.ls === 'ELU');
  assert.ok(c && c.Hy > 0 && c.Myb > 0, 'effort transversal en tête et moment en pied');
  const sHy = st.supports.lines.reduce((s, L) => s + (L.EC.base.find(b => /centrifuge/.test(b.label) && b.ls === 'ELS') || { Hy: 0 }).Hy, 0);
  proche(sHy, 240, 1, 'somme des efforts centrifuges ELS sur les lignes');
  // répartition transversale : pile voile bien plus raide en travers qu'en long (I = b L_v³/12)
  const KL = st.supports.distE.K.inst, KT = st.supports.distTE.K.inst;
  assert.ok(KT[1] > 2 * KL[1] && KT[2] > 2 * KL[2], `raideurs P1/P2 : long ${KL.slice(1, 3)} / trans ${KT.slice(1, 3)}`);
  const parts = st.supports.lines.map(L => (L.EC.base.find(b => /centrifuge/.test(b.label) && b.ls === 'ELS') || { Hy: 0 }).Hy);
  proche(parts[1] / 240, KT[1] / KT.reduce((a, v) => a + v, 0), 1e-6, 'part de P1 = K_T,P1 / Σ K_T');
  // Fascicule 61 : combinaison Bc + centrifuge sans freinage
  const F = st.supports.centrifuge.F61, cb = L.BAEL.base.find(b => /centrifuge/.test(b.label) && b.ls === 'ELS');
  assert.ok(F.F > 0 && cb && cb.Hy > 0 && cb.Hinst === 0, 'Bc + centrifuge (F61)');
  const sF = st.supports.lines.reduce((s, L) => s + (L.BAEL.base.find(b => /centrifuge/.test(b.label) && b.ls === 'ELS') || { Hy: 0 }).Hy, 0);
  proche(sF, 1.2 * F.F, 1, 'somme F61 (γ = 1,2 à l\'ELS)');
});

test('Ouvrage courbe à lignes d\'appui biaises (parallèles) : ψ par ligne, lignes du DXF retrouvées par la transformation', async () => {
  const { geoTrace } = await import('../src/plate/deck.js');
  const txt = readFileSync(new URL('../exemples/ouvrage_courbe_biais.dxf', import.meta.url), 'utf8');
  const r = analyserDXF(txt);
  assert.deepEqual(r.psiLignes, [100, 93.6, 74.5, 61.8]);
  const s0 = r.stations[0].s, x0 = r.stations.map(s => s.s - s0);
  const G = geoTrace({ axe: r.axe, s0 }, { x0, psiL: r.stations.map(s => s.psi) });
  // les lignes d'appui du DXF sont verticales (X constant) : la transformation les retrouve
  x0.forEach((u, i) => { const X = G.pt(u, 0)[0]; for (const y of [-6, -3, 3, 6]) proche(G.pt(u, y)[0], X, 1e-9, `ligne ${i}, y = ${y}`); });
  // jacobien analytique = aire du parallélogramme élémentaire
  for (const [u, y] of [[5, 4], [25, -5], [40, 3]]) {
    const e = 1e-5, A = G.pt(u, y), Bu = G.pt(u + e, y), By = G.pt(u, y + e);
    const det = ((Bu[0] - A[0]) * (By[1] - A[1]) - (Bu[1] - A[1]) * (By[0] - A[0])) / (e * e);
    proche(G.J(u, y), det, 1e-4, `J(${u}, ${y})`);
  }
});

test('Transformation générale sur axe droit et biais uniforme = plaque biaise classique', () => {
  const st = compute(parseData({ ...formDefaults(), psi: '80' }));
  const kv = st.bearings.rows.map(r => raideurAppareil(r.sel.bd, r.sel.n));
  const opt = { h: 0.25, E: st.p.E || 34000, nb: st.bearings.nb, kv, psi: 80 };
  const ref = permanentPlaque(plaqueTablier(st.deck, opt));
  const deck = Object.create(st.deck);
  deck.g = { ...st.deck.g, trace: { segments: [{ type: 'ligne', a: [-50, 0], b: [150, 0] }], s0: 50, psiLignes: st.deck.beam.x0.map(() => 80) } };
  const g = permanentPlaque(plaqueTablier(deck, opt));
  ref.Rapp.flat().forEach((v, k) => proche(g.Rapp.flat()[k] / v, 1, 2e-3, `appareil ${k}`));
});

test('Plaque courbe biaise : équilibre, réactions positives', () => {
  const st = compute(parseData(formDefaults()));
  const kv = st.bearings.rows.map(r => raideurAppareil(r.sel.bd, r.sel.n));
  const r = analyserDXF(readFileSync(new URL('../exemples/ouvrage_courbe_biais.dxf', import.meta.url), 'utf8'));
  const deck = Object.create(st.deck);
  deck.g = { ...st.deck.g, trace: { segments: r.axe.seg, s0: r.stations[0].s, psiLignes: r.psiLignes } };
  const M = plaqueTablier(deck, { h: 0.25, E: st.p.E || 34000, nb: st.bearings.nb, kv });
  const c = permanentPlaque(M), d = permanentPlaque(plaqueTablier(st.deck, { h: 0.25, E: st.p.E || 34000, nb: st.bearings.nb, kv }));
  const tot = x => x.R.reduce((s, v) => s + v, 0);
  // poids : ∫ J dy n'est plus exactement 2b quand le biais varie (c′ y) → aire réelle de la dalle
  let aire = 0; const { xs, ys } = M; for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) aire += M.geo.J((xs[i] + xs[i - 1]) / 2, (ys[j] + ys[j - 1]) / 2) * (xs[i] - xs[i - 1]) * (ys[j] - ys[j - 1]);
  const aire0 = (xs[xs.length - 1] - xs[0]) * (ys[ys.length - 1] - ys[0]);
  proche(tot(c) / tot(d), aire / aire0, 2e-3, 'poids ∝ aire en plan');
  c.Rapp.flat().forEach((v, k) => assert.ok(v > 0, `appareil ${k} : ${v}`));
  assert.equal(M.lignes[3].psi, 61.8); assert.ok(M.lignes[3].a > M.lignes[0].a, 'entraxe le long d\'une ligne biaise plus grand');
});
