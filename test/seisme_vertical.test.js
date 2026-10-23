/** Séisme vertical sur les tabliers précontraints construits par phases (EN 1998-2 § 4.1.7(2)P). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePhasage } from '../web/phasage_view.js';

test('séisme vertical : période de Rayleigh, forces équivalentes, vérifications (poutres continues et fléau)', () => {
  for (const t of ['poutres', 'fleau']) {
    const o = computePhasage({ ph_type: t, ap_seisme: 'on', ap_zone: '3' }), S = o.acheve.seismeV;
    assert.ok(S && S.T > 0.05 && S.T < 2, `${t} : T = ${S && S.T}`);
    // modes jusqu'à 90 % de la masse (EN 1998-2 § 4.2.1.2)
    assert.ok(S.participation >= 0.9 - 1e-9 && S.participation <= 1 + 1e-9, `${t} : participation ${S.participation}`);
    // Rayleigh sur la déformée statique : borne inférieure de la période fondamentale, et T_R ≤ 2π √(d_max/g)
    const T1 = Math.max(...S.modes.map(m => m.T));
    assert.ok(S.TR <= T1 * 1.001, `${t} : T_R ${S.TR} > T1 ${T1}`);
    assert.ok(S.TR <= 2 * Math.PI * Math.sqrt(S.fleche / 9.81) * 1.001);
    // effort vertical total ≤ W × plateau / g
    assert.ok(S.FEtot <= S.W * Math.max(...S.modes.map(m => m.Sv)) / 9.81 * 1.001);
    const v = o.acheve.verifs.filter(q => /^Séisme vertical/.test(q.nom));
    assert.equal(v.length, 3, t);
    // armatures passives retenues : au moins celles de la situation sismique
    for (const e of o.acheve.elu) assert.ok(e.AsInf >= e.sis.AsInfE - 1e-12 && e.AsCont >= e.sis.AsContE - 1e-12);
  }
  // séisme non coché ou zone 1 : pas de calcul
  assert.equal(computePhasage({ ph_type: 'fleau' }).acheve.seismeV, null);
  assert.equal(computePhasage({ ph_type: 'fleau', ap_seisme: 'on', ap_zone: '1' }).acheve.seismeV, null);
  // l'action croît avec la zone
  const z3 = computePhasage({ ph_type: 'fleau', ap_seisme: 'on', ap_zone: '3' }).acheve.seismeV, z4 = computePhasage({ ph_type: 'fleau', ap_seisme: 'on', ap_zone: '4' }).acheve.seismeV;
  assert.ok(z4.MEzMax > z3.MEzMax);
});

test('séisme vertical : travée isostatique (modes sinusoïdaux) et chaîne VIPP', async () => {
  const { momentVerticalIsostatique } = await import('../src/seisme_vertical.js');
  const m = 5, EI = 2e7, L = 30, S = () => 3;   // spectre plat : M(L/2) = (4/π³) m S L² × √(1 + 1/3⁶ + 1/5⁶)
  const R = momentVerticalIsostatique({ m, EI, L, spectreV: S });
  assert.ok(Math.abs(R.modes[0].T - 2 * Math.PI / ((Math.PI / L) ** 2 * Math.sqrt(EI / m))) < 1e-12);
  const M1 = 4 * m * 3 * L * L / Math.PI ** 3;
  assert.ok(Math.abs(R.M(L / 2) - M1 * Math.sqrt(1 + 1 / 3 ** 6 + 1 / 5 ** 6)) < 1e-9 * M1);
  // masse modale du premier mode : 8/π² ≈ 81 % de la masse de la travée
  assert.ok(Math.abs(R.modes[0].Meff / (m * L) - 8 / Math.PI ** 2) < 1e-12);
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parsePoutres, computePoutres } = await import('../src/beams/run.js');
  const P = computePoutres(parsePoutres({ ...formDefaults(), ap_seisme: 'on', ap_zone: '3' })), v = P.spans[0].beams.find(b => b.vipp).vipp;
  assert.ok(v.seismeV && v.seismeV.MEzMax > 0 && v.verifs.filter(q => /^Séisme vertical/.test(q.nom)).length === 2);
  assert.equal(computePoutres(parsePoutres(formDefaults())).spans[0].beams.find(b => b.vipp).vipp.seismeV, null);
});
