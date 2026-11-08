/**
 * Invariants physiques sur des ouvrages tirés au hasard (3/3) : chaîne complète du pont-dalle (parseData → compute),
 * Eurocodes et Fascicule 61 — aucune sortie non finie, équilibre des permanents, symétrie, monotonie, continuité.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tirages, ecart, nonFinis } from './alea.mjs';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';

const fx = (v, d = 2) => String(+v.toFixed(d));

/** Pont-dalle armé tiré dans le domaine d'emploi du guide (1 à 4 travées de 8 à 22 m, largeur 7 à 15 m, biais 70 à 100 gr). */
function dalle(r, { symetrique = false, droit = false } = {}) {
  const n = r.entier(1, 4), Lc = r.entre(8, 22);
  let spans = Array.from({ length: n }, (_, j) => r.arrondi(Lc * (n > 1 && (j === 0 || j === n - 1) ? r.entre(0.6, 0.85) : r.entre(0.9, 1)), 0.5));
  if (symetrique) spans = spans.map((L, j) => spans[Math.min(j, n - 1 - j)]);
  const W = r.arrondi(r.entre(7, 15), 0.5), b = W / 2, f = r.choix([0, 1, 1.25]), a0 = r.arrondi(r.entre(0.3, 0.8), 0.05);
  const h = Math.max(0.45, r.arrondi(Math.max(...spans) / r.entre(20, 26), 0.05));
  const d = {
    ...formDefaults(),
    spans: spans.join(', '), width: fx(W), h: fx(h), overhangs: `${fx(a0)}, ${fx(symetrique ? a0 : r.arrondi(r.entre(0.3, 0.8), 0.05))}`,
    roadway: `${fx(-b + f)}, ${fx(b - f)}`, footways: f > 0 ? `${fx(-b)},${fx(-b + f)} ; ${fx(b - f)},${fx(b)}` : '',
    lines: `5 @ ${fx(-(b - 0.15))} ; 5 @ ${fx(b - 0.15)}`, bands: `${fx(r.entre(2, 3))} sur ${fx(-b + f)},${fx(b - f)}`,
    ys: Array.from({ length: 9 }, (_, i) => fx(-b + W * i / 8, 3)).join(', '),
    psi: droit || symetrique ? '100' : fx(r.u() < 0.5 ? 100 : r.arrondi(r.entre(70, 100), 1), 0),
    EI: '', withTherm: 'on',
  };
  return d;
}

const calc = d => compute(parseData(d));
/** Aciers « calculés » d'une face (ELU, ELS, ouverture des fissures), hors minimums : les minimums de l'EC2 (§ 9.2.1.1,
 * § 7.3.2) et du BAEL (non-fragilité) s'appliquent dès que la face est tendue, si bien que l'enveloppe complète saute par
 * construction quand un moment change de signe — règle normative, pas un défaut. */
const calcule = (ref, f) => (ref === 'EC' ? Math.max(f.AsULS, f.AsSLS, f.AsWk) : Math.max(f.AsELU, f.AsELS));
const enveloppeCalculee = (D, ref, face) => D[ref].perFibre.map(fs => Math.max(...fs.map(f => calcule(ref, f[face]))));
const Ltot = d => d.spans.split(',').reduce((a, v) => a + +v, 0) + d.overhangs.split(',').reduce((a, v) => a + +v, 0);
const essentiels = st => ({ perm: st.perm, ec: st.ec, f61: st.f61, cases: st.cases.map(c => c.res), thermal: st.thermal, settle: st.settle, design: st.design, transDesign: st.transDesign, bearings: st.bearings, rebar: st.rebar, concept: st.concept });

test('pont-dalle (chaîne complète) — aucune sortie non finie ; ΣR des permanents = g × longueur ; aciers positifs', () => {
  tirages(6, (r, ctx) => {
    const d = dalle(r);
    ctx.desc = `travées ${d.spans}, 2b ${d.width}, h ${d.h}, ψ ${d.psi}`;
    const st = calc(d);
    for (const k of ['supportsError', 'psidpError']) assert.ok(!st[k], `${k} : ${st[k]}`);
    // une dalle trop mince pour sa travure peut demander des aciers hors des dispositions courantes : PSIDA le dit (refus
    // motivé du plan de ferraillage), ce qui est le comportement attendu ; toute autre erreur est un défaut
    assert.ok(!st.rebarError || /hors des dispositions courantes/.test(st.rebarError), `rebarError : ${st.rebarError}`);
    const nf = nonFinis(essentiels(st)).filter(c => !(st.rebarError && c.startsWith('rebar')));
    assert.deepEqual(nf, [], `sorties non finies : ${nf.join(' ; ')}`);
    const SR = st.perm.R.reduce((a, v) => a + v, 0);
    assert.ok(ecart(SR, st.perm.gTotal * Ltot(d)) < 1e-6, `ΣR = ${SR}, g L = ${st.perm.gTotal * Ltot(d)}`);
    for (const ref of ['EC', 'F61']) for (const fib of ['envBot', 'envTop']) st.design[ref][fib].forEach((As, k) => assert.ok(As >= 0, `${ref} ${fib}[${k}] = ${As}`));
  });
});

test('pont-dalle — ouvrage et chargement symétriques : permanents, enveloppes de trafic et aciers symétriques', () => {
  tirages(2, (r, ctx) => {
    const d = dalle(r, { symetrique: true });
    ctx.desc = `travées ${d.spans}, 2b ${d.width}`;
    const st = calc(d), bm = st.deck.beam, n = bm.n;
    const miroir = k => { const s = bm.sections[k]; return bm.sectionIndex(n - 1 - s.span, 1 - s.frac); };
    const sM = Math.max(...st.perm.M.map(Math.abs));
    st.perm.M.forEach((M, k) => assert.ok(ecart(M, st.perm.M[miroir(k)], sM) < 1e-6, `G : M[${k}] = ${M} ≠ ${st.perm.M[miroir(k)]}`));
    st.perm.R.forEach((R, i) => assert.ok(ecart(R, st.perm.R[n - i], Math.max(...st.perm.R)) < 1e-6, `G : R${i} ≠ R${n - i}`));
    const LM1 = st.ec.LM1, sL = Math.max(...LM1.Mmax.map(Math.abs));
    LM1.Mmax.forEach((M, k) => assert.ok(ecart(M, LM1.Mmax[miroir(k)], sL) < 1e-3, `LM1 : Mmax[${k}] = ${M} ≠ ${LM1.Mmax[miroir(k)]}`));
    for (const ref of ['EC', 'F61']) for (const fib of ['envBot', 'envTop']) {
      const A = st.design[ref][fib], sA = Math.max(...A);
      A.forEach((As, k) => assert.ok(ecart(As, A[miroir(k)], sA) < 2e-3, `${ref} ${fib}[${k}] = ${As} ≠ ${A[miroir(k)]}`));
    }
  });
});

test('pont-dalle — monotonie : un revêtement plus lourd augmente les moments permanents et les aciers calculés des faces qu\'il tend', () => {
  tirages(2, (r, ctx) => {
    const d = dalle(r, { droit: true }), q = +d.bands.split(' sur ')[0], d2 = { ...d, bands: d.bands.replace(/^[\d.]+/, fx(q + 1.5)) };
    ctx.desc = `travées ${d.spans}, 2b ${d.width}, revêtement ${q} → ${q + 1.5} kN/m²`;
    const A = calc(d), B = calc(d2);
    assert.ok(B.perm.gTotal > A.perm.gTotal);
    assert.ok(Math.max(...B.perm.M) >= Math.max(...A.perm.M) && Math.min(...B.perm.M) <= Math.min(...A.perm.M));
    // face inférieure là où le permanent tend nettement la face inférieure, face supérieure là où il la tend nettement
    // (|M_G| ≥ 25 % du maximum de ce signe). Ailleurs la monotonie n'est pas due : un permanent plus lourd soulage la face
    // opposée, et près d'un point de moment nul le revêtement minimal (k_min) des travées voisines peut l'emporter sur le
    // revêtement maximal (k_max) de la travée (moment inférieur près d'un appui : −0,2 % observé, graine 20261109)
    for (const ref of ['EC', 'F61']) for (const [face, signe] of [['bot', 1], ['top', -1]]) {
      const a = enveloppeCalculee(A.design, ref, face), b = enveloppeCalculee(B.design, ref, face), s = Math.max(...a);
      const seuil = 0.25 * Math.max(0, ...A.perm.M.map(M => signe * M));
      a.forEach((As, k) => { if (signe * A.perm.M[k] >= seuil && seuil > 0) assert.ok(b[k] >= As - 1e-6 * s, `${ref} ${face}[${k}] (M_G = ${A.perm.M[k]}) : ${As} → ${b[k]} (diminue)`); });
    }
  });
});

test('pont-dalle — continuité : une portée allongée de 10⁻³ ne fait pas sauter les aciers calculés ni les réactions', () => {
  tirages(2, (r, ctx) => {
    const d = dalle(r), sp = d.spans.split(',').map(Number), j = r.entier(0, sp.length - 1);
    sp[j] = +(sp[j] * 1.001).toFixed(4);
    const d2 = { ...d, spans: sp.join(', ') };
    ctx.desc = `travées ${d.spans} → ${d2.spans}, 2b ${d.width}, ψ ${d.psi}`;
    const A = calc(d), B = calc(d2);
    for (const ref of ['EC', 'F61']) for (const face of ['bot', 'top']) {
      const a = enveloppeCalculee(A.design, ref, face), b = enveloppeCalculee(B.design, ref, face), s = Math.max(...a, 1e-9);
      a.forEach((As, k) => assert.ok(Math.abs(b[k] - As) < 0.02 * s, `${ref} ${face}[${k}] : ${As} → ${b[k]}`));
    }
    const ra = A.perm.R, rb = B.perm.R, s = Math.max(...ra);
    ra.forEach((R, i) => assert.ok(Math.abs(rb[i] - R) < 0.01 * s, `R${i} : ${R} → ${rb[i]}`));
  });
});
