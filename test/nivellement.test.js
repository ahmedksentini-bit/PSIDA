/** Plan de nivellement : cotes → hauteurs, semelles, pieux par ligne ; fondations mixtes ; bossages sous dévers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { toPontEC8 } from '../src/ec8export.js';

const cotes = { niv_actif: 'on', niv_zCh: '105.00; 105.40; 105.80; 106.20', niv_zTN: '100.0; 98.5; 96.5; 101.0', niv_zDS: '100.5; 98.0; 95.5; 101.2', niv_zSS: '99.5; 97.0; 94.3; 100.2', niv_zPP: ';; 80; ', niv_type: ';; pieux; ', niv_B: '; 3.5; ; ', niv_devers: '2.5', niv_profil: 'toit', niv_hBos: '0.10' };

test('Cotes → dimensions par ligne, reprises par le calcul des appuis', () => {
  const d = { ...formDefaults(), ...cotes }, st = compute(parseData(d));
  assert.ok(!st.supportsError, st.supportsError);
  const N = st.supports.niv, L1 = N.lignes[1], L2 = N.lignes[2];
  const tRev = st.p.mat.tRev, h = st.deck.h;
  assert.ok(Math.abs(L1.zSF - (105.4 - tRev - h)) < 1e-9);
  // tête d'appui sous l'appareil le plus bas (toit : appareils de rive), puis hauteur de fût
  const hApp = st.bearings.rows[1].sel.hTot / 1000, yMax = Math.max(...L1.appareils.map(a => Math.abs(a.y)));
  assert.ok(Math.abs(L1.zT - (L1.zSF - 0.025 * yMax - hApp - 0.10)) < 1e-9);
  assert.ok(Math.abs(L1.H - (L1.zT - 98.0)) < 1e-9);
  assert.ok(Math.abs(L2.hs - 1.2) < 1e-9 && Math.abs(L2.De - 2.2) < 1e-9 && Math.abs(L2.Lpile - 14.3) < 1e-9);
  // bossages : minimum sous l'appareil le plus bas, plus hauts au faîte du toit
  const bos = L1.appareils.map(a => a.hBossage);
  assert.ok(Math.abs(Math.min(...bos) - 0.10) < 1e-12 && Math.max(...bos) > 0.10);
  // calcul des appuis : semelle de P1 élargie, P2 sur pieux, les autres sur semelles (fondations mixtes)
  const ty = st.supports.lines.map(l => l.EC.found.type);
  assert.deepEqual(ty, ['superficielle', 'superficielle', 'pieux', 'superficielle']);
  assert.equal(st.supports.lines[1].EC.found.B, 3.5);
  assert.ok(Math.abs(st.supports.lines[2].EC.found.Lpile - 14.3) < 1e-9);
  // export Pont EC8 : hauteur des fûts de chaque pile
  const pj = toPontEC8(st, {});
  assert.ok(Math.abs(pj.appuis[1].futs.hauteur - L1.H) < 1e-9 && Math.abs(pj.appuis[2].futs.hauteur - L2.H) < 1e-9);
});

test('Sans plan de nivellement : résultats inchangés', () => {
  const a = compute(parseData(formDefaults())), b = compute(parseData({ ...formDefaults(), niv_zCh: '1;2;3;4' }));
  assert.equal(a.supports.lines[1].EC.found.worstV, b.supports.lines[1].EC.found.worstV);
  assert.equal(b.supports.niv.actif, false);
});
