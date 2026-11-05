/**
 * Cadres sous charges routières de l'EN 1991-2 (LM1, LM2) — contrôle sur la note SCIA du PIGR-1 (4,00 × 3,00 m, e = 0,45 m,
 * remblai 0,62 à 1,36 m ; autoroute Tunis–Jelma, lot 5, note indice D du 18/03/2026) : diffusion d = H tg 30° + e/2, empreintes
 * et pressions des roues TS et LM2, nombre de voies ; le calcul par mètre linéaire (bande la plus chargée, sans répartition
 * transversale) majore le modèle de plaque SCIA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiesEC, bandeLaPlusChargee, chargesRoutieresEC } from '../src/cadre/routeEC.js';
import { calculPicf, cadreDe, geometrieCadre } from '../src/cadre/picf.js';
import { parseCadre } from '../src/cadre/run.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} : attendu ${b}, obtenu ${a}`);
const GEOM = { n: 1, B: 4.0, H: 3.0, L: 16.02, et: 0.45, er: 0.45, ep: 0.45, ei: 0.45, Hr: 1.36 };

test('EN 1991-2 — voies conventionnelles, bande de 1 m la plus chargée', () => {
  assert.deepEqual(voiesEC(4), { n: 1, wl: 3, wr: 1 }); assert.deepEqual(voiesEC(5.6), { n: 2, wl: 2.8, wr: 0 });
  const v = voiesEC(12.6); assert.equal(v.n, 4); near(v.wr, 0.6, 1e-9, 'aire résiduelle');
  // deux roues de 10 t diffusées sur 2 × 2 m, à 1,5 m l'une de l'autre : la bande commune porte les deux
  const b = bandeLaPlusChargee([{ x: 0, y: 0, P: 10, bx: 2, by: 2 }, { x: 0, y: 1.5, P: 10, bx: 2, by: 2 }]);
  near(b.F, 10, 1e-9, 'effort de la bande (2 × 10/(2 × 2) × 2)'); assert.equal(b.segs.length, 2);
});

test('PIGR-1 — diffusion et pressions des roues (note : d = 1,01 m, 2,42 m, 23,06 kN/m² ; LM2 6,21 m²)', () => {
  const geom = geometrieCadre(GEOM), g = cadreDe(geom);
  const R = chargesRoutieresEC(geom, g, { alpha: 'FR2' }, { largeurChargeable: 12 });
  near(R.d, 1.36 * Math.tan(Math.PI / 6) + 0.225, 1e-12, 'd'); near(R.d, 1.01, 0.001, 'd (note)');
  near(R.bxTS, 2.42, 0.001, 'empreinte TS'); near(R.qTSmax * 10, 23.06, 0.05, 'roue TS 135 kN diffusée [kN/m²]');
  near(R.qUDL1 * 10, 6.3, 1e-9, 'UDL voie 1 (0,7 × 9)');
  // LM2 : β_Q = 0,80 (annexe nationale citée par la note, qui retient 0,9 × 400 = 360 kN) → 320 kN, 160 kN par roue sur 6,21 m²
  near(R.betaQ, 0.8, 1e-12, 'β_Q'); const L2 = R.derivations.find(d => d.sys === 'LM2');
  near(L2.U * L2.V, 6.21, 0.01, 'empreinte LM2'); near(L2.q * 10, 160 / 6.21, 0.05, 'pression LM2');
  assert.equal(R.voies.n, 4);
});

test('PIGR-1 — calcul complet EN 1992 sous LM1 / LM2 : enveloppe du modèle de plaque SCIA', () => {
  const hyp = { code: 'EC2', fc28: 30, fe: 500, sigmaS: 300, enrobage: 0.045, K0max: 0.5, K0min: 0.25, psrem: 1.0, remblaiMin: 1.0, remblaiMax: 1.0, sol: 'rigide', largeurChargeable: 12 };
  const r = calculPicf(GEOM, hyp, { usage: { franchie: 'route', portee: 'routeEC' }, routeEC: { alpha: 'FR2' } });
  assert.ok(r.routeEC && r.derivations.some(d => d.sys === 'TS (LM1)'));
  assert.ok(r.cas.some(c => /^LM1/.test(c.nom)) && r.cas.some(c => /^LM2/.test(c.nom)));
  assert.ok(!r.cas.some(c => /^(Bc|Bt|A\(l\))/.test(c.nom)), 'pas de charges du Fascicule 61');
  const mid = r.sections.find(s => s.barre === 'Traverse 1' && s.ou === 'Mi-portée');
  // SCIA (plaque, plot de 16,02 m) : M_ELU = 174 kN·m/m à mi-portée de la traverse ; mètre linéaire sans répartition : plus
  assert.ok(mid.Mmax * 10 > 174 && mid.Mmax * 10 < 260, `M traverse ${mid.Mmax * 10}`);
  // formulaire : choix « route (EN 1991-2) »
  const inp = parseCadre({ cf_portee: 'routeEC', cf_B: '4', cf_H: '3', cf_Hr: '1.36', cf_et: '0.45', cf_er: '0.45', cf_ep: '0.45', cf_ecAlpha: 'FR1', cf_ecLm2: 'non' });
  assert.equal(inp.opts.usage.portee, 'routeEC'); assert.equal(inp.opts.routeEC.alpha, 'FR1'); assert.equal(inp.opts.routeEC.lm2, false);
});
