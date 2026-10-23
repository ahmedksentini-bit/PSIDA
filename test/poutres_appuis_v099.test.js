// Ponts à poutres et appuis : contrainte initiale (EN 1992-1-1 § 5.10.3 (2)), pertes PRAD, effort tranchant à l'appui
// (règle des bras de levier), semelles et bossages dimensionnés, tête de pile élargie (travées indépendantes), effort
// sismique total = somme des efforts aux appuis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { parseSupports } from '../src/pipeline.js';
import { parseStandalone, computeStandalone } from '../src/supports/standalone.js';
import { champsAppuisPoutres } from '../web/transfert_appuis.js';
import { supportsBlocks } from '../web/supports_view.js';

const D = formDefaults();
const poutres = (extra = {}) => computePoutres(parsePoutres({ ...D, ...extra }));
const P0 = poutres();
const appuis = (extra = {}, P = P0) => {
  const d = { ...D, ...Object.fromEntries(Object.entries(champsAppuisPoutres(P)).map(([k, v]) => [k, String(v)])), ...extra };
  return computeStandalone(parseStandalone(d), parseSupports(d));
};

test('VIPP : contrainte initiale après frottement et recul ≤ min(0,75 f_pk ; 0,85 f_p0,1k), tension au vérin réduite au besoin', () => {
  const v = P0.spans[0].beams[0].vipp, lim = Math.min(0.75 * 1860, 0.85 * 1640);
  assert.equal(v.sigPm0Lim, lim);
  assert.ok(v.sigPm0Max <= lim + 0.5, `σ_pm0,max = ${v.sigPm0Max}`);
  assert.ok(v.sigP0Reduite && v.sigP0 < Math.min(0.8 * 1860, 0.9 * 1640));
  // maximum relu sur le diagramme du calcul par phases
  const m = Math.max(...v.out.pertesInstantanees.map(pi => Math.max(...pi.apres))) / v.trace.u.Ap / 1000;
  assert.ok(Math.abs(m - v.sigPm0Max) < 1e-6);
  assert.ok(v.verifs.some(x => /5\.10\.3 \(2\)/.test(x.ref) && x.ok));
  // tension imposée à 0,8 f_pk : vérification en défaut
  const w = poutres({ pt_sp0: '1476' }).spans[0].beams[0].vipp;
  assert.equal(w.sigP0Reduite, false);
  assert.ok(w.verifs.some(x => /5\.10\.3 \(2\)/.test(x.ref) && !x.ok));
});

test('PRAD : pertes comptées depuis la tension sur banc (synthèse = tableau des torons)', () => {
  const v = poutres({ pt_type: 'PRAD' }).spans[0].beams[0].vipp, pr = v.prad;
  const banc = v.trace.cab.reduce((s, cb) => s + cb.Ap * pr.sigPi * 1000, 0);
  assert.ok(Math.abs(v.Ptot.P0 - banc) < 1e-6);
  v.pertes.forEach((q, i) => assert.ok(Math.abs(q.Pinst - v.trace.cab[i].P) < 1e-6));
  const perte = 1 - v.Ptot.inf / v.Ptot.P0;
  assert.ok(perte > 0.08 && perte < 0.30, `pertes ${perte}`);
});

test('effort tranchant à l\'appui des poutres de rive : max(Guyon-Massonnet ; bras de levier), moments inchangés', () => {
  const S = P0.bd.bySpan.values().next().value, rive = S.beams[0], L = S.L;
  // permanentes de rive (corniche, dispositif de retenue en console) : la règle des bras de levier commande
  assert.ok(rive.G.etaL > rive.G.eta);
  assert.ok(Math.abs(rive.G.Vmax[0] - (S.perm.Vmax || S.perm.Vm)[0] * rive.G.etaV / 4) < 1e-6);
  // à mi-travée : Guyon-Massonnet seul
  const mid = S.deck.beam.sectionIndex(0, 0.5);
  assert.ok(Math.abs(rive.G.Vmax[mid] - (S.perm.Vmax || S.perm.Vm)[mid] * rive.G.eta / 4) < 1e-6 * Math.max(1, Math.abs(rive.G.Vmax[mid])));
  // somme des coefficients de levier = n (équilibre transversal) pour une charge répartie sur toute la largeur
  assert.ok(Math.abs(S.beams.reduce((s, b) => s + b.G.etaL, 0) - 4) < 0.05);
  // poutres intérieures : Guyon-Massonnet seul (pratique PAP)
  for (const id of ['G', 'gr1a', 'Bc']) assert.equal(S.beams[1][id].etaV, S.beams[1][id].eta);
  assert.ok(L > 0);
});

test('appuis du VIPP par défaut : semelles et bossages dimensionnés, tête de pile élargie, aucune vérification en défaut', () => {
  const st = appuis({ ap_seisme: 'on' }), S = st.supports;
  const aMax = Math.max(...st.bearings.rows.slice(1, -1).map(r => r.sel.bd.a / 1000));
  assert.ok(S.sp.pile.bTopAuto && S.sp.pile.bTop >= 2 * (aMax + 0.2) + 0.1 - 1e-9, `tête ${S.sp.pile.bTop} m`);
  for (const L of S.lines) for (const code of ['EC', 'BAEL']) {
    const f = L[code].found;
    assert.ok(f.Bauto, 'B dimensionnée');
    assert.ok(f.worstV <= 1 && f.worstH <= 1 && f.excOk, `${L.i} ${code}`);
    const h = L[code].headChk;
    assert.ok(h.debDim && [0.05, 0.10, 0.15, 0.20].some(d => Math.abs(d - h.deb) < 1e-9) && h.press.ok, `bossage ${L.i} ${code}`);
  }
  assert.ok(S.seisme.repos.every(q => q.etat === 'ok'));
  // effort total = somme des efforts aux appuis (comme l'onglet « Calcul sismique »)
  assert.ok(Math.abs(S.seisme.efforts.appuis.reduce((s, ap) => s + ap.cas[0].Fx, 0) - S.seisme.F.x) < 1e-6);
  assert.ok(S.seisme.Fglobal.x <= S.seisme.F.x + 1e-6);
});

test('semelle imposée trop étroite : motif affiché (résultante hors de la semelle), pas de valeurs indéfinies', () => {
  const st = appuis({ ap_B: '3' }), f = st.supports.lines[0].EC.found;
  assert.ok(!f.Bauto && f.checks.some(k => k.motif));
  const txt = JSON.stringify(supportsBlocks(st.supports, 'EC'));
  assert.ok(/résultante hors de la semelle/.test(txt));
  assert.ok(!/undefined/.test(txt));
});
