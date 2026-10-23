// Nomenclature des armatures d'une travée VIPP : découpe en pièces, longueurs de coupe, masses, feuille
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { nomenclatureVIPP, pieces, planNomenclatureVIPP } from '../src/plans/nomenclature_vipp.js';
import { longueurCoupe } from '../src/plans/bordereau.js';
import { anchorage, massPerM } from '../src/rebar.js';

const NOE = { pt_geo: 'dims', pt_spans: '33', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56', pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '1.79 sur -6.56,6.56', pt_type: 'BP', pt_fck: '40' };
const r = computePoutres(parsePoutres(NOE)), v = r.spans[0].beams[0].vipp;
const ctx = { n: 4, b1: 3.28, hourdis: r.hourdis, entretoise: r.entretoise };

test('pièces : n pièces de 12 m au plus, Σ longueurs = longueur hors tout + (n − 1) l₀', () => {
  assert.deepEqual(pieces(10, 25), { n: 1, Lp: 10, l0: 0 });
  const p = pieces(33.94, 25, 40), l0 = anchorage(25, { fck: 40 }).l0;
  assert.ok(p.Lp <= 12 + 1e-9 && p.n === Math.ceil((33.94 - l0) / (12 - l0)));
  assert.ok(Math.abs(p.n * p.Lp - (33.94 + (p.n - 1) * l0)) < 1e-9);
});

test('nomenclature : longueurs de coupe ISO 4066, masses = Σ L × nombre × masse linéique', () => {
  const N = nomenclatureVIPP(v, ctx);
  for (const l of N.lignes) {
    assert.ok(l.L >= longueurCoupe(l.code, { A: l.A, B: l.B || 0, C: l.C || 0 }, l.phi) - 1e-9 && l.L % 25 === 0, `coupe ${l.repere}`);
    assert.ok(Math.abs(l.masse - l.L / 1000 * l.nombre * massPerM(l.phi)) < 1e-6);
    assert.ok(l.L <= 12025, `barre ${l.repere} ≤ 12 m`);
  }
  const tot = N.lignes.reduce((s, l) => s + l.masse, 0);
  assert.ok(Math.abs(tot - N.R.masse) < 1e-6 && Math.abs(tot - (N.parElement.poutre + N.parElement.hourdis + N.parElement.entretoise)) < 1e-6);
  // talon : au moins A_s de l'ELU ; ratio de la poutre dans l'ordre de grandeur du guide Sétra (100 à 120 kg/m³)
  const talon = N.lignes[0], nb = +/(\d+) HA/.exec(talon.desig)[1];
  assert.ok(nb * Math.PI * 0.0125 ** 2 >= v.elu.at(-1).As - 1e-9);
  assert.ok(N.ratioPoutre > 60 && N.ratioPoutre < 180, `ratio ${N.ratioPoutre}`);
  assert.ok(N.lignes.some(l => l.element === 'hourdis') && N.lignes.some(l => l.element === 'entretoise'));
});

test('feuille de nomenclature : mise en page valide', () => {
  const F = planNomenclatureVIPP(v, {}, { ctx });
  assert.ok(F.valide().ok, F.valide().problemes.join(' ; '));
});
