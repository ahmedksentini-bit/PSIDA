/**
 * Module cadres et portiques (src/cadre) : recoupement avec le moteur C# de BVTrace (résultats de référence produits
 * par BVTrace.Core, fichier test/data/picf_bvtrace_ref.json), formules fermées, portique ouvert, charges ferroviaires.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculPicf, calculPicfBlocs } from '../src/cadre/picf.js';
import { resoudreCadre, vertical, portee, hauteurCalc } from '../src/cadre/cadre.js';
import { phi3, phi2, reductionCouverture, chargesFerroviaires } from '../src/cadre/rail.js';
import { parseCadre, computeCadre } from '../src/cadre/run.js';
import { cadreBlocks, cadreNote } from '../web/cadre_view.js';

const REF = JSON.parse(fs.readFileSync(new URL('./data/picf_bvtrace_ref.json', import.meta.url)));
// Recoupement BVTrace : `compat: 'bvtrace'` reproduit les conventions du portage d'origine (S_B = 76,8 t fixe, nappe et
// sous-pression au feuillet moyen, pas d'alternative « à sec ») ; les corrections ultérieures sont testées à part.
const CAS = {
  oh309: [{ n: 1, B: 7, H: 5, L: 20, e: 0.5, Hr: 3 }, { compat: 'bvtrace' }],
  bi_winkler: [{ n: 2, B: 3, H: 2.5, L: 15, et: 0.3, er: 0.35, ep: 0.3, ei: 0.25, Hr: 1.2 }, { sol: 'winkler', nature: 'argile', etat: 'normal', hEau: 1.0, hNappe: 1.5, compat: 'bvtrace' }],
  tri_ec2_biais: [{ n: 3, B: 2, H: 2, L: 12, biais: 75, et: 0.25, er: 0.25, ep: 0.25, ei: 0.2, Hr: 0.3 }, { code: 'EC2', hNappe: 2.8, qsupMin: 0.18, qsupMax: 0.34, compat: 'bvtrace' }],
  mono_faible: [{ n: 1, B: 4, H: 3, L: 10, e: 0.4, Hr: 0.6, gaucheExt: true, droiteExt: false }, { sol: 'winkler', esol: 40, hEau: 0.8, marston: false, incompressible: false, compat: 'bvtrace' }],
};
const proche = (a, b, tol = 1e-9, lab = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${lab} : ${a} ≠ ${b}`);

test('PICF : identique au moteur C# de BVTrace (cas, combinaisons, effets, sections, barres, métré)', () => {
  let n = 0;
  for (const r of REF) {
    if (r.id === 'blocs5') {
      const o = calculPicfBlocs({ n: 5, B: 3, H: 2.5, L: 12, e: 0.3, Hr: 2 }, { hNappe: 1, compat: 'bvtrace' });
      assert.equal(o.blocs.length, r.nb); o.blocs.forEach((b, i) => proche(b.gouvernante.asGouv, r.g[i], 1e-9, 'bloc')); n++;
      continue;
    }
    const [g, h] = CAS[r.id], o = calculPicf(g, h);
    proche(o.deltaB, r.deltaB); proche(o.deltaMc, r.deltaMc); proche(o.marstonK, r.marston);
    assert.equal(o.combos.length, r.ncomb); assert.equal(o.cas.length, r.ncas); assert.equal(o.reserves.length, r.reserves); assert.equal(o.statut, r.status);
    r.cas.forEach((c, i) => { const f = o.cas[i].frame; proche(f.traverses[0].MA, c.ta, 1e-9, 'cas'); proche(f.traverses[0].Mmid, c.tm, 1e-9); proche(f.radiers[0].MA, c.ra, 1e-9); proche(f.pG, c.pG, 1e-9); n += 4; });
    r.combos.forEach((c, i) => { proche(o.frames[i].traverses[0].Mmax, c.tmax, 1e-9, 'combo'); proche(o.frames[i].voiles[0].Mmid, c.w, 1e-9); n += 2; });
    r.effets.forEach((e, i) => { const f = o.effets[i]; proche(f.Mels, e.MomentSlsMax, 1e-9, e.Bar); proche(f.mels, e.MomentSlsMin); proche(f.Melu, e.MomentUlsMax); proche(f.melu, e.MomentUlsMin); proche(f.Vu, e.ShearUlsMax); proche(f.N, e.NormalSlsMinT); n += 6; });
    r.sections.forEach((s, i) => { const f = o.sections[i]; proche(f.d, s.EffectiveDepthM); proche(f.asMax.as, s.amax, 1e-9, s.Bar); proche(f.asMin.as, s.amin, 1e-9, s.Bar);
      assert.equal(f.barresMax.option?.label ?? null, s.bmax); assert.equal(f.barresMin.option?.label ?? null, s.bmin); assert.equal(!f.echec, s.ok); n += 6; });
    proche(o.metre.beton, r.metre.ConcreteM3); proche(o.metre.acier, r.metre.SteelKg);
    if (r.flot != null) proche(o.flottaison.fs, r.flot);
    assert.equal(o.balayages.length, r.sweeps.length);
  }
  assert.ok(n > 1500);
});

test('Cadre à une cellule, épaisseurs égales, charge uniforme : moment d\'angle −l²/12·(k+3)/(k²+4k+3)', () => {
  const g = { ouv: [3.0], h: 2.0, et: 0.3, er: 0.3, ep: 0.3, ei: 0.3 }, lc = portee(g, 0), k = hauteurCalc(g) / lc;
  const r = resoudreCadre(g, vertical(1, 1));
  proche(r.traverses[0].MA, -lc * lc / 12 * (k + 3) / (k * k + 4 * k + 3), 1e-9);
  proche(r.traverses[0].Mmid, lc * lc / 8 + r.traverses[0].MA, 1e-9);
});

test('Portique ouvert : pieds encastrés et articulés (pente-flèche), équilibre des réactions', () => {
  const g = { ouv: [10], h: 5.5, et: 0.6, ep: 0.6, ei: 0.6 }, L = portee(g, 0), h = hauteurCalc(g), I = 0.6 ** 3 / 12;
  for (const [mode, kc] of [['encastre', 4], ['articule', 3]]) {
    const r = resoudreCadre(g, vertical(1, 1), null, { ouvert: mode });
    const theta = L * L / 12 / (kc * I / h + 2 * I / L), Mc = kc * I / h * theta;
    proche(Math.abs(r.traverses[0].MA), Mc, 1e-6, mode);
    proche(r.reactions[0].V + r.reactions[1].V, L, 1e-9, 'ΣV');
    proche(r.reactions[0].H + r.reactions[1].H, 0, 1e-9, 'ΣH');
  }
});

test('Charges ferroviaires : Φ2, Φ3, réduction de couverture, surcharge sur remblai LM71', () => {
  proche(phi3(4.42), 2.16 / (Math.sqrt(4.42) - 0.2) + 0.73, 1e-12);
  assert.equal(phi3(1), 2.0); assert.equal(phi2(400), 1.0);
  proche(reductionCouverture(1.5, 2.0), 1.4, 1e-12); assert.equal(reductionCouverture(1.05, 3.0), 1.0);
  const geom = { n: 1, B: 4, H: 3, Hr: 1, et: 0.4 }, g = { ouv: [4], h: 3, et: 0.4, er: 0.4, ep: 0.4, ei: 0.4 };
  const c = chargesFerroviaires(geom, g, { alpha: 1.0 });
  proche(c.psrem, 1000 / 6.4 / 3 / 10, 1e-12);       // 52,1 kN/m² = 5,21 t/m²
  const r = calculPicf({ n: 1, B: 4, H: 3, L: 10, e: 0.4, Hr: 1 }, { sol: 'winkler', hEau: 1 }, { usage: { franchie: 'eau', portee: 'rail' } });
  assert.ok(r.cas.some(x => x.nom.startsWith('LM71')) && r.cas.some(x => x.nom.startsWith('SW/0')));
  assert.ok(!r.cas.some(x => /^(Bc|Bt|Mc120|A\(l\))/.test(x.nom)));
});

test('Voie franchie : gabarit et choc ; PIPO sans radier, réactions rendues', () => {
  const r = calculPicf({ n: 1, B: 7, H: 5.2, L: 15, e: 0.5, Hr: 1 }, { sol: 'winkler', nature: 'sable' }, { usage: { franchie: 'route' }, gabarit: { hauteur: 4.75, largeur: 7 } });
  assert.ok(r.gabarit.ok && r.choc && r.choc.F === 500);
  assert.ok(!r.reserves.some(x => /hydraulique/.test(x)));
  const sansGab = calculPicf({ n: 1, B: 7, H: 5.2, L: 15, e: 0.5, Hr: 1 }, { sol: 'winkler', nature: 'sable' }, { usage: { franchie: 'route' } });
  assert.ok(sansGab.reserves.some(x => /gabarit/i.test(x)));
  const p = calculPicf({ n: 1, B: 10, H: 5.5, L: 14, et: 0.6, ep: 0.6, Hr: 0.6 }, {}, { ouvert: 'encastre', usage: { franchie: 'route' }, gabarit: { hauteur: 4.75 } });
  assert.equal(p.cas[0].frame.radiers.length, 0);
  assert.ok(p.reactions.length === 2 && p.reactions[0].elu.Vmax > 0);
  assert.ok(!p.sections.some(s => s.barre.startsWith('Radier')));
});

test('Onglet : lecture du formulaire, calcul, blocs et note', () => {
  const out = computeCadre(parseCadre({ cf_type: 'picf', cf_n: '4', cf_B: '3', cf_H: '2.5', cf_L: '12', cf_Hr: '2', cf_hEau: '1' }));
  assert.equal(out.blocs.length, 2);
  const B = cadreBlocks(out); assert.ok(B.some(b => b.t === 'svg') && B.some(b => b.t === 'table'));
  const note = cadreNote(out, { version: 'test' }); assert.ok(note.blocks.length > 10);
  const p = computeCadre(parseCadre({ cf_type: 'pipo', cf_appui: 'articule', cf_franchie: 'rail', cf_portee: 'route', cf_B: '8', cf_H: '6', cf_Hr: '0.8', cf_gabH: '5.5', cf_chocF: '1500' }));
  assert.ok(p.blocs[0].choc && p.blocs[0].reactions);
});

test('Séisme : action, rapport de distorsion de Penzien, sections renforcées', async () => {
  const { actionSismique, rapportDistorsion, reductionG } = await import('../src/cadre/seisme.js');
  const a = actionSismique({ zone: 3, categorie: 'III', classeSol: 'C' });
  proche(a.ag, 1.2 * 1.1, 1e-12); proche(a.S, 1.5, 1e-12);
  proche(rapportDistorsion(3.51, 0.5), 4 * 0.5 * 3.51 / (1 + 3.51), 1e-12);      // exemple WSDOT/FHWA : R = 1,557
  proche(reductionG(0.15), 0.65, 1e-12);
  const sans = calculPicf({ n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 1.5 }, { sol: 'winkler', hEau: 1.5 });
  const avec = calculPicf({ n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 1.5 }, { sol: 'winkler', hEau: 1.5 }, { seisme: { actif: true, zone: 5, categorie: 'III', classeSol: 'C' } });
  assert.ok(avec.sisme.R > 1 && avec.sisme.ds > 0 && avec.sisme.verifs.length === sans.sections.length);
  assert.ok(avec.sections.some(s => s.sismeGouv) && avec.metre.acier > sans.metre.acier);
  const B = calculPicf({ n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 1.5 }, { sol: 'winkler', hEau: 1.5 }, { seisme: { actif: true, zone: 3, approche: 'B' } });
  assert.equal(B.sisme.parA, 0);
});

test('Sol d\'un cadre : ESOL depuis pressiomètre, pénétromètres statique et dynamique ; V_s depuis N', async () => {
  const { solDepuisProfil, vsImai } = await import('../src/cadre/solProfil.js');
  const p = solDepuisProfil('pressio', '0.5 10 1 sable\n2 10 1 sable', 3.6);
  const r = (3.6 + 0.3) / 7.2; proche(p.esol, 2 * 10 * (1 / (2 * (1 / 3) * 0.32)) * r * r * 3.6, 1e-12);   // guide PICF-EL annexe 2
  const c = solDepuisProfil('cpt', '0.5 4 sable', 3.6), d = solDepuisProfil('dpt', '0.5 4 sable 10', 3.6);
  proche(c.esol, d.esol, 1e-12);                       // sable : q_d/q_c = 1 par défaut
  proche(d.vs, vsImai(10), 1e-12); proche(vsImai(10), 96.9 * 10 ** 0.314, 1e-12);
  const d2 = solDepuisProfil('dpt', '0.5 4 sable', 3.6, { rapportQd: 2 });
  assert.ok(d2.esol < d.esol);
  const inp = parseCadre({ cf_solSrc: 'dpt', cf_profil: '0.5 4 sable 10\n1.5 5 sable 12', cf_hEau: '1', cf_sis: 'oui' });
  assert.ok(inp.hyp.esol > 0 && inp.opts.seisme.Vs > 0);
  const o = computeCadre(inp).blocs[0];
  assert.ok(o.alertes.some(a => /pénétromètre dynamique/.test(a)));
});

test('Assistant de saisie : coupe, plan et synthèse dessinés sans calcul', async () => {
  const S = await import('../web/cadre_schema.js');
  const { geometrieCadre } = await import('../src/cadre/picf.js');
  for (const d of [{ cf_L: '15' }, { cf_L: '12', cf_type: 'pipo', cf_franchie: 'route', cf_portee: 'rail', cf_gabH: '4.75', cf_sis: 'oui' }]) {
    const inp = parseCadre(d), geom = geometrieCadre(inp.opts.ouvert ? { ...inp.geom, er: 0 } : inp.geom); if (inp.opts.ouvert) geom.er = 0;
    const lu = { d, inp, geom, setra: { et: true, er: true, ep: true, ei: true } };
    const c = S.coupeCadreSVG(lu);
    assert.ok(c.includes('data-k="cf_B') && c.includes('data-k="cf_Hr') && c.includes('data-k="cf_portee'));
    assert.ok(S.planCadreSVG(lu).includes('data-k="cf_biais') && S.syntheseCadreHTML(lu).includes('<li>'));
  }
});

test('Portance (F62 et NF P94-261) et choix sismique de NF EN 1998-2 (6.7.3 / 6.7.4)', async () => {
  const { portanceCadre, resistanceNette } = await import('../src/cadre/portance.js');
  const R = resistanceNette({ type: 'pressio', texte: '0 1 1 argile\n10 1 1 argile', B: 3.6, forme: 'rectangulaire', L: 15, referentiel: 'EC7' });
  proche(R.qnet, 800 * R.k / 0.8, 1e-9); proche(R.k, 0.8, 1e-9);                 // argile, De = 0 : k_p = k₀ = 0,8
  const r = calculPicf({ n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 1.5 }, { sol: 'winkler', hEau: 1.5 });
  for (const ref of ['EC7', 'F62']) {
    const p = portanceCadre(r, { type: 'cpt', texte: '0.5 1.2 argile\n2 1.8 argile\n5 2.5 argile', referentiel: ref, D: 0.5 });
    assert.ok(p.synthese.length >= 2 && p.synthese.every(v => Number.isFinite(v.taux)));
    assert.ok(!p.verifs.some(v => /^Phas/.test(v.combinaison)));
  }
  const peu = calculPicf({ n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 1.0 }, { sol: 'winkler', hEau: 1 }, { seisme: { actif: true, zone: 4 } });
  const beaucoup = calculPicf({ n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 3.0 }, { sol: 'winkler', hEau: 1 }, { seisme: { actif: true, zone: 4 } });
  assert.equal(peu.sisme.approche, 'A'); assert.equal(beaucoup.sisme.approche, 'B');
  const a = beaucoup.sisme.action; proche(beaucoup.sisme.vg, a.S * a.Tc * a.ag / (2 * Math.PI), 1e-12);   // (6.18)
});

test('Plans du cadre : repères cohérents avec le calcul, feuilles valides, DXF et SVG', async () => {
  const { reperesCadre, planCoffrageCadre, planFerraillageCadre, quantitesCadre } = await import('../src/plans/cadre.js');
  const { feuilleSVG } = await import('../src/plans/svg.js');
  const { feuilleDXF } = await import('../src/plans/dxf.js');
  const { areaOf } = await import('../src/rebar.js');
  for (const [g, h, o] of [[{ n: 2, B: 3, H: 2.5, L: 15, et: 0.3, er: 0.35, ep: 0.3, ei: 0.25, Hr: 1.2 }, {}, {}],
    [{ n: 3, B: 2, H: 2, L: 12, biais: 75, et: 0.25, er: 0.25, ep: 0.25, ei: 0.2, Hr: 0.3 }, { code: 'EC2' }, {}],
    [{ n: 1, B: 8, H: 5, L: 12, e: 0.5, Hr: 1 }, {}, { ouvert: 'encastre' }]]) {
    const r = calculPicf(g, h, o), { marks } = reperesCadre(r);
    // chaque repère calculé fournit au moins la section demandée (tolérance d'arrondi)
    for (const m of marks) if (m.req != null && m.s) assert.ok(areaOf(m.phi) / m.s * 1e4 + 1e-6 >= (m.pos.endsWith('ChA') || m.pos.endsWith('ChM') ? m.req - (m.prov - areaOf(m.phi) / m.s * 1e4) : m.req) - 1e-6, `${m.label} : ${m.req}`);
    // toutes les barres tiennent dans une longueur commerciale
    for (const m of marks) assert.ok(m.L <= 12000 + 25, `${m.label} : L = ${m.L}`);
    // faces intérieures de la traverse : au moins la plus forte section positive des traverses
    const tInt = Math.min(...marks.filter(m => m.pos === 'trInt').map(m => m.prov));
    const reqT = Math.max(...r.sections.filter(s => s.barre.startsWith('Traverse')).map(s => s.asMax.as));
    assert.ok(tInt + 1e-6 >= reqT * 0.999 || marks.filter(m => m.pos === 'trInt').length > 1);
    const masse = marks.reduce((s, m) => s + m.masse, 0), Q = quantitesCadre(r, masse);
    const sb = Math.sin((g.biais ?? 90) * Math.PI / 180);   // l'avant-métré du calcul ne réduit pas la section biaise par sin φ
    assert.ok(Math.abs(Q.beton - r.metre.beton * sb) / r.metre.beton < 0.03, `béton ${Q.beton} / ${r.metre.beton}`);
    assert.ok(Q.ratio > 40 && Q.ratio < 250, `ratio ${Q.ratio}`);
    for (const F of [planCoffrageCadre(r, {}), planFerraillageCadre(r, {})]) {
      assert.ok(F.valide().ok, F.valide().problemes.join(' ; '));
      assert.ok(feuilleSVG(F).length > 1000); assert.match(feuilleDXF(F), /ACIERS|COFFRAGE/);
    }
  }
});
