/**
 * Recommandations de l'onglet « Ponts à poutres » (VIPP, PRAD, poutres BA, vérification simplifiée BP) : chaque « NON »
 * reçoit une indication « → à modifier », et la valeur recommandée, appliquée, fait passer la vérification (recalcul par
 * computePoutres, le calcul de l'onglet).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { recommandationsPoutres, evaluerPoutres, indicationsParCible, cleCible } from '../src/reco/poutres.js';
import { beamsBlocks } from '../web/beams_view.js';

// valeurs par défaut du formulaire (Pont de Noé : 4 poutres VIPP de 33 m), une seule travée
const BASE = { pt_spans: '33', pt_type: 'BP', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_geo: 'dims', pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56',
  pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '1.79 sur -6.56,6.56', pt_ret: '0', pt_mil: 'Mc120', pt_fck: '40', pt_fckh: '30', pt_fyk: '500', pt_vrive: 1,
  pt_expo: 'XC', pr_nt: '20', pr_nsup: '2', pr_type: 'T15S', pr_cbas: '0.05', pr_e: '0.05', pr_g1n: '4', pr_g1L: '2.0', pr_g2n: '4', pr_g2L: '4.0', pr_rel: '1', pr_dT: '45', pr_hetuv: '16', pr_about: '0.30' };
const calc = d => computePoutres(parsePoutres(d));
const vippOk = o => o.spans.every(s => s.beams.every(b => b.vipp.ok));
const action = (it, champ) => it.actions.find(a => a.champ === champ && a.valeurChamp != null);
const ensemble = it => it.actions.find(a => a.champs);

/** Chaque ligne « NON » (tableaux, paragraphes) reçoit une indication, et seulement elles ; la note n'en reçoit pas. */
function indicationsSousLesNon(out, rec) {
  const B = beamsBlocks(out, { reco: rec });
  for (const b of B) {
    if (b.t === 'table' && b.hints) b.rows.forEach((row, i) => { if (row.includes('NON')) assert.ok(b.hints[i], `ligne « ${row[0]} » du tableau « ${b.head[0]} » : indication`); });
    if (b.t === 'table' && !b.hints) assert.ok(!b.rows.some(r => r.includes('NON')) || /Verdict/.test(b.head.join()), `tableau « ${b.head.join(' | ').slice(0, 60)} » sans indications`);
    if (b.t === 'p' && /^ATTENTION|: NON\.?$/.test(b.text)) assert.ok(b.hint, `paragraphe « ${b.text.slice(0, 60)} » : indication`);
  }
  assert.ok(!beamsBlocks(out).some(b => b.hint || b.hints), 'la note de calcul ne reçoit pas d\'indication');
}

test('VIPP sous-câblée (3 câbles) : n₂ pour la traction en construction, n_c = 4 ensemble ; appliqué, tout passe', async () => {
  const d = { ...BASE, pt_nc: '3' }, out = calc(d), rec = await recommandationsPoutres(out, d);
  assert.ok(!vippOk(out));
  indicationsSousLesNon(out, rec);
  assert.deepEqual(rec.synthese.champs, { pt_nc: '4' });
  const ct = rec.items.find(i => /^Construction : traction/.test(i.verification));
  assert.match(ct.regle, /f_ctm\(t\)/);
  const n2 = action(ct, 'pt_n2').valeurChamp;
  assert.ok(evaluerPoutres({ ...d, pt_n2: n2 }).spans[0].beams.every(b => b.vipp.verifs.filter(q => /^Construction : traction/.test(q.nom)).every(q => q.ok)), 'n₂ appliqué : traction en construction OK');
  const bpel = rec.items.find(i => /^BPEL.*traction/.test(i.verification));
  assert.equal(action(bpel, 'pt_nc').valeurChamp, '4');
  const out2 = calc({ ...d, ...rec.synthese.champs });
  assert.ok(vippOk(out2), 'ensemble appliqué : toutes les poutres OK');
  assert.equal((await recommandationsPoutres(out2, { ...d, ...rec.synthese.champs })).items.length, 0);
});

test('PRAD de 33 m (20 torons) : torons, torons supérieurs et béton cherchés ensemble, valeurs minimales', async () => {
  const d = { ...BASE, pt_type: 'PRAD' }, out = calc(d), rec = await recommandationsPoutres(out, d);
  assert.ok(!vippOk(out));
  indicationsSousLesNon(out, rec);
  const S = rec.synthese.champs;
  assert.ok(+S.pr_nt > 20, 'plus de torons');
  const dec = rec.items.find(i => /^Décompression/.test(i.verification));
  assert.deepEqual(ensemble(dec).champs, S);
  assert.ok(vippOk(calc({ ...d, ...S })), 'ensemble appliqué : toutes les poutres OK');
  // descente : chaque valeur est minimale (un pas de moins, une vérification repasse « NON »)
  const pas = { pr_nt: 1, pr_nsup: 1, pt_fck: 5 };
  for (const [k, v] of Object.entries(S)) {
    const o = evaluerPoutres({ ...d, ...S, [k]: String(+v - pas[k]) });
    assert.ok(o.spans[0].beams.some(b => !b.vipp.ok), `${k} = ${v} − ${pas[k]} suffirait`);
  }
});

test('VIPP, effort tranchant : âme sur appui (blochet) et âme courante, chacune pour sa zone', async () => {
  const d = { ...BASE, pt_b0a: '0.20', pt_b0v: '0.16', pt_fck: '35' }, out = calc(d), rec = await recommandationsPoutres(out, d);
  indicationsSousLesNon(out, rec);
  const A = rec.items.find(i => /dans le blochet/.test(i.verification)), C = rec.items.find(i => /en section courante/.test(i.verification));
  assert.match(A.regle, /EN 1992-1-1 § 6\.2\.3/);
  const b0a = action(A, 'pt_b0a').valeurChamp, b0v = action(C, 'pt_b0v').valeurChamp, Lb = 4;
  const dans = (o, x0) => o.spans[0].beams.every(b => b.vipp.tranchant.every(t => t.ok || (x0 ? t.x > Lb : t.x <= Lb)));
  assert.ok(dans(evaluerPoutres({ ...d, pt_b0a: b0a }), true), 'blochet élargi : effort tranchant OK dans le blochet');
  assert.ok(!dans(evaluerPoutres({ ...d, pt_b0a: String(+b0a - 0.05) }), true), 'âme sur appui minimale');
  assert.ok(dans(evaluerPoutres({ ...d, pt_b0v: b0v }), false), 'âme élargie : effort tranchant OK en section courante');
  assert.ok(vippOk(calc({ ...d, ...rec.synthese.champs })), 'ensemble appliqué : toutes les poutres OK');
});

test('σ_p0 imposée trop haute : champ vidé (tension réduite par le moteur) ou valeur cherchée', async () => {
  const d = { ...BASE, pt_sp0: '1480' }, out = calc(d), rec = await recommandationsPoutres(out, d);
  const it = rec.items.find(i => /^Contrainte initiale/.test(i.verification));
  assert.equal(action(it, 'pt_sp0').valeurChamp, '');
  const v = it.actions.filter(a => a.champ === 'pt_sp0' && a.valeurChamp)[0].valeurChamp;
  for (const s of ['', v]) assert.ok(evaluerPoutres({ ...d, pt_sp0: s }).spans[0].beams[0].vipp.verifs.find(q => /^Contrainte initiale/.test(q.nom)).ok, `σ_p0 = « ${s} »`);
  assert.ok(!evaluerPoutres({ ...d, pt_sp0: String(+v + 10) }).spans[0].beams[0].vipp.verifs.find(q => /^Contrainte initiale/.test(q.nom)).ok, 'valeur maximale');
});

test('Poutres BA à âme trop mince et poutres BP sous-précontraintes (vérification simplifiée)', async () => {
  const d = { ...BASE, pt_type: 'BA', pt_geo: 'rect', pt_parts: '0.6 0.25 ; 0.25 1.47 ; 1.0 0.3', pt_b0: '0.15' }, out = calc(d), rec = await recommandationsPoutres(out, d);
  indicationsSousLesNon(out, rec);
  const it = rec.items.find(i => /V_Rd,max/.test(i.verification)), b0 = action(it, 'pt_b0').valeurChamp;
  const okV = o => o.spans[0].beams.every(b => b.BA.travee.every(t => t.V.ok));
  assert.ok(okV(calc({ ...d, pt_b0: b0 })) && !okV(evaluerPoutres({ ...d, pt_b0: String(+b0 - 0.05) })), `b₀ = ${b0} m minimal`);

  const p = { ...BASE, pt_geo: 'valeurs', pt_A: '2.047', pt_I: '1.006057', pt_K: '0.036412', pt_v: '0.65', pt_vp: '1.67', pt_H: '2.32', pt_P: '4000', pt_e0: '-1.46' };
  const op = calc(p), rp = await recommandationsPoutres(op, p);
  indicationsSousLesNon(op, rp);
  const P = action(rp.items[0], 'pt_P').valeurChamp, okP = o => o.spans[0].beams.every(b => b.BP.BPEL.ok && b.BP.EC.ok);
  assert.ok(okP(calc({ ...p, pt_P: P })) && !okP(evaluerPoutres({ ...p, pt_P: String(+P - 100) })), `P∞ = ${P} kN minimal`);
  assert.match(rp.items[0].constat, /P_min \(Guyon\)/);
});

test('Budget de calcul épuisé : la recherche est laissée au bouton « Calculer » du panneau (même résultat)', async () => {
  const { candidats, dichotomie } = await import('../src/recommandations.js');
  const p = { ...BASE, pt_geo: 'valeurs', pt_A: '2.047', pt_I: '1.006057', pt_K: '0.036412', pt_v: '0.65', pt_vp: '1.67', pt_H: '2.32', pt_P: '4000', pt_e0: '-1.46' };
  const op = calc(p), a = (await recommandationsPoutres(op, p, { budget: 0 })).items[0].actions.find(x => x.champ === 'pt_P');
  assert.ok(a.chercher && a.chercher.calcul === 'poutres' && a.valeurChamp == null);
  assert.ok(indicationsParCible((await recommandationsPoutres(op, p, { budget: 0 })).items).get(cleCible({ si: 0, type: 'BP', k: 0 })), 'indication même sans valeur');
  const c = a.chercher, v = await dichotomie(candidats(c), x => c.verifie(evaluerPoutres({ ...p, ...c.base, [c.champ]: String(x) })));   // comme solveReco (web/app.js)
  assert.equal(String(v), action((await recommandationsPoutres(op, p)).items[0], 'pt_P').valeurChamp);
});

test('evaluerPoutres (essais des recherches) reproduit computePoutres sans le hourdis', () => {
  const d = { ...BASE, pt_type: 'PRAD', pt_spans: '30, 25' }, a = calc(d), b = evaluerPoutres(d, { exact: true });
  const cle = v => JSON.stringify({ verifs: v.verifs, elu: v.elu, tranchant: v.tranchant, P: v.Ptot, al: v.trace.alerte });
  a.spans.forEach((s, si) => s.beams.forEach((x, k) => assert.equal(cle(b.spans[si].beams[k].vipp), cle(x.vipp), `travée ${si}, poutre ${k + 1}`)));
  const ba = { ...BASE, pt_type: 'BA', pt_geo: 'rect', pt_parts: '0.6 0.25 ; 0.25 1.47 ; 1.0 0.3' };
  assert.equal(JSON.stringify(evaluerPoutres(ba, { exact: true }).spans[0].beams.map(x => x.BA)), JSON.stringify(calc(ba).spans[0].beams.map(x => x.BA)));
});
