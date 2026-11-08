/**
 * Invariants sur des sections et des ouvrages tirés au hasard (complément) : sections EC2 et BAEL (monotonie, continuité,
 * équilibre de la section fissurée), cadres et portiques (aucune sortie non finie), ponts à poutres (idem).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tirages, ecart, nonFinis } from './alea.mjs';
import { materialsEC2, flexureULS, flexureSLS, crackedSection } from '../src/section_ec2.js';
import { materialsBAEL, flexureELU, flexureELS } from '../src/section_bael.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseCadre, computeCadre } from '../src/cadre/run.js';
import { parsePoutres, computePoutres } from '../src/beams/run.js';

test('sections EC2 et BAEL — aciers croissants avec le moment, décroissants avec la hauteur utile, sans saut au passage aux aciers comprimés', () => {
  tirages(200, (r, ctx) => {
    const h = r.entre(0.3, 1.4), d = h - r.entre(0.04, 0.08), fck = r.choix([25, 30, 35, 40, 45]), fyk = r.choix([400, 500]);
    const ec = materialsEC2({ fck, fyk }), ba = materialsBAEL({ fc28: fck, fe: fyk, fissuration: r.choix(['prejudiciable', 'tres prejudiciable']) });
    // domaine : moments dont les aciers restent sous 6 % de b·d (au-delà du taux maximal de 4 % de l'EC2 § 9.2.1.1(3),
    // donc y compris les sections à aciers comprimés de l'ELS depuis la 0.99.47)
    const Mmax = 0.5 * d * d * ec.fcd;
    let M = r.entre(0.01, 1) * Mmax;
    const rho = m => Math.max(...[flexureSLS(m, { d }, ec), flexureELS(m, { d }, ba), flexureULS(m, { d }, ec)].map(x => x.As + (x.As2 || 0)));
    for (let k = 0; k < 40 && Math.max(rho(M), rho(1.2 * M)) > 0.06 * d; k++) M *= 0.8;
    const dM = 1e-4 * Mmax;
    ctx.desc = JSON.stringify({ h, d, fck, fyk, M });
    for (const [nom, f] of [['ELU EC2', m => flexureULS(m, { d }, ec).As], ['ELS EC2', m => flexureSLS(m, { d }, ec).As], ['ELU BAEL', m => flexureELU(m, { d }, ba).As], ['ELS BAEL', m => flexureELS(m, { d }, ba).As]]) {
      const a = f(M), b = f(M + dM), c = f(M * 1.2);
      assert.ok(Number.isFinite(a) && a > 0, `${nom} : As = ${a}`);
      assert.ok(b >= a - 1e-12 && c > a, `${nom} : As non croissant (${a} → ${b} → ${c})`);
      assert.ok(b - a < 50 * dM / (0.5 * d * fyk), `${nom} : saut d'aciers sous +10⁻⁴ de M (${a} → ${b})`);
    }
    assert.ok(flexureULS(M, { d: d * 1.05 }, ec).As < flexureULS(M, { d }, ec).As, 'ELU EC2 : plus de hauteur utile, moins d\'aciers');
    // section fissurée : équilibre des efforts (béton comprimé = acier tendu) et moment résistant = M
    const As = flexureSLS(M, { d }, ec).As, cs = crackedSection(M, { d, As }, ec);
    if (cs && Number.isFinite(cs.x)) {
      const C = 0.5 * cs.sigC * cs.x, T = cs.sigS * As;
      assert.ok(ecart(C, T, Math.max(C, T, 1e-9)) < 2e-3, `section fissurée : C = ${C}, T = ${T}`);
    }
  });
});

// Défaut corrigé en 0.99.47 (voir docs/validation/invariants.md) : quand la contrainte du béton gouverne l'ELS,
// flexureSLS (EC2) et flexureELS (BAEL) choisissaient la solution par une borne arbitraire et A_s tendu pouvait DIMINUER
// quand M augmentait (graine 20261140 : 249 cm²/m → 159 cm²/m + A_s2 pour M × 1,2). Ils passent désormais par le moment
// limite du béton M_rb : A_s et A_s2 sont continus et croissants en M.
test('sections — ELS au-delà du moment limite du béton : A_s et A_s2 croissants (graine 20261140)', () => {
  const ec = materialsEC2({ fck: 25, fyk: 500 }), d = 0.6446, M = 1.5743, a = flexureSLS(M, { d }, ec), b = flexureSLS(1.2 * M, { d }, ec);
  assert.ok(b.As > a.As && b.As2 > a.As2, `A_s ${a.As} → ${b.As}, A_s2 ${a.As2} → ${b.As2}`);
  assert.ok(Math.abs(b.sigC - ec.sigCcar) < 1e-6 && Math.abs(b.sigS - ec.sigSlim) < 1e-6, 'les deux contraintes limites sont atteintes');
});

test('sections — ELS EC2 et BAEL : continuité et monotonie de A_s et A_s2 de part et d\'autre de M_rb (tirages)', () => {
  tirages(150, (r, ctx) => {
    const h = r.entre(0.3, 1.4), d = h - r.entre(0.04, 0.08), fck = r.choix([25, 30, 35, 40]), fyk = r.choix([400, 500]);
    const ec = materialsEC2({ fck, fyk }), ba = materialsBAEL({ fc28: fck, fe: fyk, fissuration: r.choix(['prejudiciable', 'tres prejudiciable']) });
    for (const [nom, f] of [['ELS EC2', m => flexureSLS(m, { d }, ec)], ['ELS BAEL', m => flexureELS(m, { d }, ba)]]) {
      const Mrb = f(1e-3).Mrb, k = r.entre(0.3, 2.5);
      ctx.desc = JSON.stringify({ h, d, fck, fyk, nom, k });
      const pts = [0.98, 0.999, 1, 1.001, 1.02, k, k * 1.1].sort((x, y) => x - y).map(c => f(c * Mrb));
      for (let i = 1; i < pts.length; i++) {
        assert.ok(pts[i].As >= pts[i - 1].As - 1e-12 && pts[i].As2 >= pts[i - 1].As2 - 1e-12, `${nom} : décroissance (${pts[i - 1].As} → ${pts[i].As}, ${pts[i - 1].As2} → ${pts[i].As2})`);
      }
      const g = f(0.9999999 * Mrb), e = f(1.0000001 * Mrb);
      assert.ok(Math.abs(e.As - g.As) < 1e-6 && e.As2 < 1e-6, `${nom} : saut en M_rb (${g.As} → ${e.As}, A_s2 ${e.As2})`);
    }
  });
});

/** Cadre (PICF) ou portique (PIPO) tiré au hasard dans le domaine des dossiers pilotes. */
function cadre(r) {
  const type = r.choix(['picf', 'picf', 'pipo']);
  return {
    ...formDefaults(),
    cf_type: type, cf_n: String(type === 'pipo' ? 1 : r.entier(1, 3)), cf_B: r.entre(1.5, type === 'pipo' ? 12 : 6).toFixed(2), cf_H: r.entre(1.5, 6).toFixed(2),
    cf_L: r.entre(8, 30).toFixed(1), cf_Hr: r.entre(0.3, 5).toFixed(2), cf_biais: String(r.u() < 0.6 ? 100 : r.entier(60, 99)),
    cf_hEau: r.entre(0, 1.5).toFixed(2), cf_code: r.choix(['BAEL', 'EC2']), cf_fc28: String(r.choix([25, 30, 35])),
    ...(type === 'pipo' ? { cf_appui: r.choix(['encastre', 'articule']) } : {}),
  };
}

test('cadres et portiques — aucune sortie non finie, aciers et métré positifs', () => {
  tirages(40, (r, ctx) => {
    const d = cadre(r);
    ctx.desc = ['cf_type', 'cf_n', 'cf_B', 'cf_H', 'cf_Hr', 'cf_biais', 'cf_code'].map(k => `${k}=${d[k]}`).join(' ');
    const out = computeCadre(parseCadre(d));
    for (const b of out.blocs) {
      // une section surarmée à l'ELU (μ > μ_lim) rend volontairement As = NaN avec le drapeau « surarme » et une alerte
      // dans la note : c'est un refus motivé, pas une sortie non finie inattendue
      const sur = b.sections.flatMap((sc, i) => ['eluMax', 'eluMin'].filter(k => sc[k] && sc[k].surarme).map(k => `sections.${i}.${k}.`));
      const nf = nonFinis({ effets: b.effets, sections: b.sections, metre: b.metre, gouvernante: b.gouvernante, poids: b.poids, deltaB: b.deltaB }).filter(c => !sur.some(p => c.startsWith(p)));
      assert.deepEqual(nf, [], `sorties non finies : ${nf.join(' ; ')}`);
      if (sur.length) assert.ok(b.alertes.some(a => /aciers comprimés|μ =/.test(a)), `section surarmée sans alerte : ${sur.join(', ')}`);
      assert.ok(b.metre.acier > 0 && b.metre.beton > 0, `métré : ${JSON.stringify(b.metre)}`);
    }
  });
});

test('ponts à poutres (VIPP, PRAD, poutres BA) — aucune sortie non finie', () => {
  tirages(3, (r, ctx) => {
    const type = r.choix(['BP', 'PRAD', 'BA']), n = r.entier(3, 7), L = type === 'PRAD' ? r.entier(10, 25) : type === 'BA' ? r.entier(10, 22) : r.entier(25, 40);   // BP : VIPP
    const b1 = r.entre(1.6, 3.3).toFixed(2), half = n * +b1 / 2;
    const d = { ...formDefaults(), pt_type: type, pt_spans: String(L), pt_n: String(n), pt_b1: b1, pt_road: `${(-half + 1).toFixed(2)}, ${(half - 1).toFixed(2)}`, pt_foot: '', pt_lines: `5 @ ${(-half + 0.1).toFixed(2)} ; 5 @ ${(half - 0.1).toFixed(2)}`, pt_bands: `2.4 sur ${(-half + 1).toFixed(2)},${(half - 1).toFixed(2)}`, pt_biais: String(r.u() < 0.6 ? 100 : r.entier(70, 99)) };
    ctx.desc = `${type} ${n} × ${L} m, entraxe ${b1}, biais ${d.pt_biais}`;
    const res = computePoutres(parsePoutres(d));
    const nf = nonFinis({ spans: res.spans.map(s => ({ beams: s.beams.map(b => ({ M: b.M, V: b.V, R: b.R, ...(b.design ? { design: b.design } : {}) })) })), appareils: res.appareils });
    assert.deepEqual(nf, [], `sorties non finies : ${nf.join(' ; ')}`);
  });
});

test('non-régression — cadre : α de l\'ELS BAEL fini au-delà du domaine de la formule de BVTrace (k = 90 μ/σ_s ≥ 4,5)', async () => {
  const { alphaEls, elsBael } = await import('../src/cadre/sections.js');
  for (const k of [4.6, 5, 6, 10, 50]) {
    const a = alphaEls(k * 200 / 90, 200);
    assert.ok(Number.isFinite(a) && a > 0 && a < 1, `k = ${k} : α = ${a}`);
    assert.ok(Math.abs(a * a * (3 - a) - k * (1 - a)) < 1e-9, `k = ${k} : α n'est pas racine`);
  }
  assert.equal(alphaEls(0.5 * 200 / 90, 200), (() => { const k = 0.5, a1 = Math.sqrt(k * 0.2), a2 = Math.sqrt(k * (1 - a1) / (3 - a1)); return Math.sqrt(k * (1 - a2) / (3 - a2)); })(), 'formule de BVTrace inchangée dans son domaine');
  assert.ok(Number.isFinite(elsBael(60, 0.142, 200, 25, 500).as));
  // portique de 1,98 × 5,33 m sous 4,73 m de remblai, pièces de 0,20 m (BAEL) : plus de « As = NaN » ni de métré NaN
  const out = computeCadre(parseCadre({ ...formDefaults(), cf_type: 'pipo', cf_n: '1', cf_B: '1.98', cf_H: '5.33', cf_Hr: '4.73', cf_biais: '100', cf_code: 'BAEL' })), b = out.blocs[0];
  assert.ok(Number.isFinite(b.metre.acier) && b.metre.acier > 0, `métré : ${JSON.stringify(b.metre)}`);
  assert.ok(!b.alertes.some(a => /NaN/.test(a)), 'alerte avec NaN');
  assert.equal(b.ok, false, 'l\'ouvrage reste signalé insuffisant');
});
