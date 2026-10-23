// Calcul par phases : corrections v0.99 (prédimensionnement, joint de clavage, fluage non linéaire, effet Résal,
// adaptation par fluage du fléau, tablier mixte courbe, hourdis)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predimContinues, predimFleau, affiner } from '../src/phasage/predim.js';
import { computePhasage, computeMixte, phasageBlocks } from '../web/phasage_view.js';
import { contraintesPhases } from '../src/phasage/contraintes.js';
import { nomenclatureContinues } from '../src/plans/nomenclature_phases.js';
import { areaOf } from '../src/rebar.js';

const S = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));

test('prédimensionnement : sections « par leurs dimensions » et hauteur totale réellement écrite', () => {
  const c = predimContinues({ L: 25 }), f = predimFleau({ a: 40 });
  assert.equal(c.champs.ph_geo, 'dimensions');
  assert.equal(f.champs.fl_geo, 'dimensions');
  const h = c.lignes.find(l => /^Hauteur totale/.test(l.grandeur));
  assert.ok(h.valeur.startsWith((c.champs.ph_H + c.champs.ph_hd).toFixed(2)), h.valeur);
});

test('prédimensionnement des poutres continues : les contraintes de construction comptent (mise en tension retardée)', async () => {
  const base = { ph_type: 'poutres', ph_t1: '7' }, P = predimContinues({ L: 25 });
  const r = await affiner('poutres', P.champs, base, computePhasage, { maxIt: 8 });
  // à 7 j la compression dépasse 0,6 f_ck(t) : l'affinage la détecte et retarde la mise en tension
  assert.ok(r.journal.some(j => j.defauts.some(n => /^Construction : poutre, compression/.test(n))), JSON.stringify(r.journal));
  assert.ok(+r.champs.ph_t1 > 7, `ph_t1 = ${r.champs.ph_t1}`);
  if (r.ok) {
    const C = contraintesPhases(r.out.r, r.out.modele, r.out.reperes.fibres, r.out.p.dates.superstructures);
    assert.ok(C.verifs.every(q => q.ok), 'déclaré OK : contraintes de construction satisfaites');
  }
});

test('poutres continues : joint de clavage vérifié sans câble ; armatures sur appui ≥ celles du joint', () => {
  const o = computePhasage({ ph_type: 'poutres', ...S(predimContinues({ L: 25 }).champs), ph_t1: '14' });
  const j = o.acheve.verifs.find(q => /^Joint de clavage/.test(q.nom));
  assert.ok(j && j.val > 0, 'vérification du joint présente');
  const sup = o.acheve.elu.filter(e => e.AsJoint != null);
  assert.equal(sup.length, o.p.n - 1, 'un joint par appui intermédiaire');
  for (const e of sup) assert.ok(e.AsCont >= e.AsJoint - 1e-12);
});

test('fluage non linéaire signalé au-delà de 0,45 f_ck(t) (EN 1992-1-1 § 3.1.4 (4))', () => {
  const o = computePhasage({ ph_type: 'poutres', ...S(predimContinues({ L: 25 }).champs), ph_t1: '14' });
  const C = contraintesPhases(o.r, o.modele, o.reperes.fibres, o.p.dates.superstructures);
  assert.ok(C.nonLineaire && C.nonLineaire.k > 0.45, 'k_σ > 0,45');
  assert.ok(Math.abs(C.nonLineaire.facteur - Math.exp(1.5 * (C.nonLineaire.k - 0.45))) < 1e-12);
  const txt = phasageBlocks(o).map(b => b.text || '').join(' ');
  assert.ok(/fluage non linéaire/.test(txt));
});

test('fléau : effet Résal avec le moment concomitant minimal ; adaptation par fluage isolée (charges seules)', () => {
  const pf = predimFleau({ a: 40 });
  const o = computePhasage({ ph_type: 'fleau', fl_a: '40', fl_Lr: '10', fl_ccAp: '28.5', fl_ccP0: '4000', ...S(pf.champs) });
  const v = o.acheve;
  for (const e of v.elu) assert.ok(e.VRes >= 0 && e.VRes <= e.VEd0 + 1e-9);
  assert.ok(v.r0 && !Object.keys(v).includes('r0'), 'calcul sans câbles conservé, non énumérable');
  const B = phasageBlocks(o), tab = B.find(b => b.t === 'table' && b.head.some(h => /charges seules/.test(h)));
  assert.ok(tab, 'colonnes « charges seules »');
  // sous les seules charges, le fluage réduit |M| sur pile et augmente le moment à la clé (rapprochement de l'état sur cintre)
  const num = s => +String(s).replace(/\s/g, '').replace(',', '.');
  const ap = tab.rows.find(r => r[0] === 'après superstructures'), fin = tab.rows[tab.rows.length - 1];
  assert.ok(Math.abs(num(fin[4])) < Math.abs(num(ap[4])), 'pile : |M| des charges diminue');
  assert.ok(num(fin[5]) > num(ap[5]), 'clé : M des charges augmente');
  assert.ok(B.some(b => b.t === 'p' && /isolent l'adaptation par fluage/.test(b.text)));
});

test('pont mixte courbe : pas de flexion latérale sur la semelle supérieure connectée à la dalle', () => {
  const C = computeMixte({ ph_type: 'mixte', mx_L: '30, 40, 30', mx_R: '300' });
  const sec = C.v.sections;
  C.v.courbe.lignes.forEach((l, i) => {
    const sf = sec[i].sEluFib;
    assert.ok(Math.abs(l.tot - Math.max(sf.inf * l.k + l.flI, sf.sup * l.k)) < 1e-6, `section ${i}`);
  });
});

test('hourdis des poutres continues : nomenclature alignée sur la proposition du tableau de flexion locale', () => {
  const o = computePhasage({ ph_type: 'poutres', ...S(predimContinues({ L: 25 }).champs), ph_t1: '14' });
  const N = JSON.stringify(nomenclatureContinues(o));
  const prop = As => { for (const phi of [10, 12, 14, 16, 20, 25]) { const s = Math.min(Math.floor(areaOf(phi) / As / 0.025 + 1e-9) * 0.025, 0.25); if (s >= 0.10 - 1e-9) return { phi, s }; } return null; };
  for (const nappe of ['inférieures', 'supérieures']) {
    const m = N.match(new RegExp(`transversales ${nappe} HA(\\d+) / ([\\d,]+) \\(([\\d,]+) cm²/m`));
    assert.ok(m, nappe);
    const q = prop(+m[3].replace(',', '.') * 1e-4);
    assert.equal(+m[1], q.phi, nappe); assert.ok(Math.abs(+m[2].replace(',', '.') - q.s * 100) < 1e-6, nappe);
  }
});
