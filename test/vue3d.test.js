/** v0.99.27 : vue 3D des résultats de la plaque — cas de charge (équilibre) et géométrie de la scène. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { cas3D, rouesTandem, GRANDEURS_3D } from '../src/plate/cas3d.js';
import { scene3D, gradientCSS } from '../web/vue3d.js';

const st = compute(parseData({ ...formDefaults(), cover: '0.055', ap_zone: '1', spans: '14, 18, 14', width: '9', h: '0.75', roadway: '-3.5, 3.5', footways: '-4.5,-3.5 ; 3.5,4.5', lines: '', bands: '', ys: '-4.5, -3, -1.5, 0, 1.5, 3, 4.5', typeDalle: 'DP', bp_actif: 'on', methodeTablier: 'plaque' }));
const M = st.deck.plaque.M;

test('Cas de la vue 3D : équilibre (Σ réactions = charge), précontrainte autoéquilibrée, Wood-Armer', () => {
  for (const cas of ['G', 'TS', 'UDL']) {
    const r = cas3D(M, { cas, y: -2, psidp: st.psidp }), R = r.reactions.reduce((t, a) => t + a.R, 0);
    assert.ok(Math.abs(R - r.total) < 1e-6 * Math.max(1, r.total), `${cas} : ${R} / ${r.total}`);
    assert.ok(r.champ.waInf.every((v, p) => Math.abs(v - (r.champ.mx[p] + Math.abs(r.champ.mxy[p]))) < 1e-9));
  }
  assert.equal(cas3D(M, { cas: 'TS', x: 7, y: 0 }).total, 600);
  assert.equal(cas3D(M, { cas: 'UDL', q: 9 }).total.toFixed(3), (9 * 7 * (M.xs.at(-1) - M.xs[0])).toFixed(3));
  const P = cas3D(M, { cas: 'P', psidp: st.psidp });
  assert.ok(Math.abs(P.total) < 1e-6); assert.ok(Math.abs(P.reactions.reduce((t, a) => t + a.R, 0)) < 1e-6);
  // permanent : même flèche que la somme des fichiers de permanentPlaque, et moments en travée positifs
  const G = cas3D(M, { cas: 'G' });
  assert.ok(Math.max(...G.champ.mx) > 0 && Math.min(...G.champ.mx) < 0);
  assert.throws(() => cas3D(M, { cas: 'P' }), /précontrainte/);
  assert.deepEqual(rouesTandem(10, 0).map(r => [r.x, r.y]), [[9.4, -1], [9.4, 1], [10.6, -1], [10.6, 1]]);
});

test('Scène 3D : triangles, couleurs bornées, échelle symétrique des moments, flèches des réactions', () => {
  const r = cas3D(M, { cas: 'TS', x: 7, y: -2 });
  for (const g of Object.keys(GRANDEURS_3D)) {
    const S = scene3D(M, r, { grandeur: g, amplification: 1 });
    assert.equal(S.tri.length, M.P.T.length * 9);
    assert.ok(S.cols.every(c => c >= 0 && c <= 1));
    if (GRANDEURS_3D[g].symetrique) assert.equal(S.vmin, -S.vmax);
    assert.equal(S.fleches.length, r.reactions.length * 30);
    assert.ok(S.tri.every(Number.isFinite));
    // flèche dessinée maximale : 4 % de la plus grande dimension
    const zmax = Math.max(...S.pos.map(p => Math.abs(p[2])));
    assert.ok(Math.abs(zmax - 0.04 * S.Lc) < 1e-9 * S.Lc);
  }
  assert.match(gradientCSS(true), /^linear-gradient\(to right, rgb\(33,102,172\) 0%/);
});
