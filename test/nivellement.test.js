/** Plan de nivellement : cotes → hauteurs, semelles, pieux par ligne ; fondations mixtes ; bossages sous dévers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';
import { toPontEC8 } from '../src/ec8export.js';

const cotes = { niv_actif: 'on', niv_zCh: '105.00; 105.40; 105.80; 106.20', niv_zTN: '100.0; 98.5; 96.5; 101.0', niv_zDS: '100.5; 98.0; 95.5; 101.2', niv_zSS: '99.5; 97.0; 94.3; 100.2', niv_zPP: ';; 80; ', niv_type: ';; pieux; ', niv_B: '; 3.5; ; ', devers: '2.5', devProfil: 'toit', devMode: 'inclinee', niv_hBos: '0.10' };

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

test('Pente du profil en long : composante G·sin α répartie entre les appuis, appareils plus déformés', () => {
  const plat = { ...formDefaults(), ...cotes, overhangs: '0, 0', niv_zCh: '105; 105; 105; 105' }, pente = { ...plat, niv_zCh: '105.00; 105.56; 106.28; 106.84' };   // 4 %
  const A = compute(parseData(plat)), B = compute(parseData(pente));
  assert.equal(A.supports.pente, null);
  const P = B.supports.pente, L = B.deck.spans, g = B.perm.gTotal;
  const Hth = L.reduce((a, Lj, j) => a + g * Lj * Math.sin(Math.atan(P.sl[j])), 0);
  assert.ok(Math.abs(P.H - Hth) < 1e-6 && Math.abs(P.sl[0] - 0.04) < 1e-9);
  assert.ok(Math.abs(P.E.reduce((a, v) => a + v, 0) - P.H) < 1e-6);
  // déplacement lent des appareils augmenté sur une ligne
  assert.ok(B.supports.lines.some((l, i) => (l.EC.brg?.vRF ?? 0) > (A.supports.lines[i].EC.brg?.vRF ?? 0) + 1e-6));
});

test('Niveaux d\'eau par appui : la pile entre dans l\'eau avec ses cotes de PHE et de lit', () => {
  const d = { ...formDefaults(), ...cotes, ap_eau: 'on', niv_zPHE: '; 101.0; ; ', niv_zLit: '; 98.5; ; ' };
  const st = compute(parseData(d)), W = st.supports.water;
  assert.ok(W[1] && !W[2], 'P1 dans l\'eau, P2 hors de l\'eau');
  assert.ok(Math.abs(st.supports.niv.lignes[1].hEau - 2.5) < 1e-9 && Math.abs(st.supports.niv.lignes[1].dBed - 0.5) < 1e-9);
});
