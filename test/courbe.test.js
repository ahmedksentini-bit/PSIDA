/** Ouvrage courbe : lecture du DXF (axe + lignes d'appui), plaque sur l'axe courbe, force centrifuge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireDXF, ecrireDXF } from '../src/geom/dxf.js';
import { Axe, stationsAppuis } from '../src/geom/axe.js';
import { forceCentrifuge, qvEC } from '../src/geom/centrifuge.js';
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

test('Ligne d\'appui biaise sur un ouvrage courbe : refusée avec un message explicite', () => {
  const ref = Axe.depuisEntites(lireDXF(dxfCourbe()).entites.filter(e => e.calque === 'AXE'));
  const lig = [2, 16, 34, 48].map(s => { const p = ref.pointDeporte(s, 0), t = ref.tangente(s), n = ref.normale(s), u = [0.5 * t[0] + n[0], 0.5 * t[1] + n[1]]; return { type: 'LINE', calque: 'APPUIS', a: [p[0] - 6 * u[0], p[1] - 6 * u[1]], b: [p[0] + 6 * u[0], p[1] + 6 * u[1]] }; });
  const ent = lireDXF(dxfCourbe()).entites.filter(e => e.calque === 'AXE');
  const st = stationsAppuis(Axe.depuisEntites(ent), lig.map(l => ({ type: 'ligne', a: l.a, b: l.b })));
  st.forEach(s => assert.ok(Math.abs(s.psi - 100) > 10));
  const dxf = dxfCourbe().replace(/0\nENDSEC[\s\S]*$/, '') + lig.map(l => `0\nLINE\n8\nBIAIS\n10\n${l.a[0]}\n20\n${l.a[1]}\n11\n${l.b[0]}\n21\n${l.b[1]}`).join('\n') + '\n0\nENDSEC\n0\nEOF\n';
  assert.throws(() => analyserDXF(dxf, { calqueAxe: 'AXE', calqueAppuis: 'BIAIS' }), /non radiale/);
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
});
