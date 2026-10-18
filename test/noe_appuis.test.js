/**
 * Appuis et fondations — note de calcul du Pont de Noé (COMETE/ICI, A.P.D. mai 2012, programme PSH) : 4 travées isostatiques
 * de 33 m, lignes C1 (x = 0), P2, P3, P4, C5 (x = 132 m). Valeurs de la note en t et t·m (souplesses en m/t).
 * Formules NF P 94-261 (tableau des k_p : guide Cerema 2015, tab. 11).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neopreneFlexibility, horizontalDistribution, brakingF61Deck, headCombinationsBAEL } from '../src/supports/actions.js';
import { descendLoads, buckling, designShaft, minimumSteelPier } from '../src/supports/pier.js';
import { pileCapTwoRows, sigmaSBAEL, pileGroupForces, menardReaction, pileCapStrutTie, pileMinSteel, kp261, KP_261, iDeltaCohesive, iDeltaFrictional, shallowFooting, lateralPile } from '../src/supports/foundation.js';
import { gardeGreve, gardeGreveThickness, murEnRetour, Ka } from '../src/supports/abutment.js';
import { requiredSteelNM } from '../src/supports/section_nm.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : réf ${b}, outil ${a.toFixed(4)}`);
const xs = [0, 33, 66, 99, 132];
const sNeo = { inst: 10 * neopreneFlexibility({ n: 4, a: 0.4, b: 0.4, Te: 0.053, G: 1.8 }), diff: 10 * neopreneFlexibility({ n: 4, a: 0.4, b: 0.4, Te: 0.053, G: 0.9 }) };
const sApp = [[0.1016, 0.2137], [0.4927, 0.9818], [0.5437, 1.09], [0.5437, 1.09], [0.5437, 1.09]].map(([i, d]) => ({ inst: i * 1e-3, diff: d * 1e-3 }));
const dist = horizontalDistribution(xs.map((x, i) => ({ x, sNeo, sApp: sApp[i] })));

test('Noé — souplesses des appareils, rigidités des lignes et centre de déformation', () => {
  rel(sNeo.inst, 0.4601e-3, 1e-3, 's néoprène instantané'); rel(sNeo.diff, 0.9201e-3, 1e-3, 's néoprène différé');
  [1780, 1050, 996, 996, 996].forEach((k, i) => rel(dist.K.inst[i], k, 1e-3, `K_inst ligne ${i + 1}`));
  [882, 526, 497, 497, 497].forEach((k, i) => rel(dist.K.diff[i], k, 2e-3, `K_diff ligne ${i + 1}`));
  rel(dist.x0.inst, 56.80, 1e-3, 'x0 instantané'); rel(dist.x0.diff, 56.905, 1e-3, 'x0 différé');
});

test('Noé — freinage et déformations imposées réparties', () => {
  dist.braking(30).forEach((h, i) => rel(h, [9.179, 5.411, 5.136, 5.136, 5.136][i], 2e-3, `freinage Bc ligne ${i + 1}`));
  // A(l) : la note prend a1 = 0,75 (erreur : 2 voies → a1 = 1) ; on reproduit sa valeur avec ses coefficients
  rel(brakingF61Deck({ Ltot: 132, Lc: 8, a1: 0.75, a2: 0.875 }).A, 14.038 * 10, 2e-3, 'freinage A(l) total [kN]');
  const cases = [[3e-4, 'diff', [15.063, 3.774, -1.354, 6.279, 11.204]], [3.5e-4, 'diff', [17.573, 4.403, -1.580, 7.325, 13.071]],
    [2.5e-4, 'diff', [12.552, 3.145, -1.128, 5.232, 9.337]], [1e-4, 'inst', [10.113, 2.498, -0.916, 4.204, 7.491]]];
  // convention H = K ε (x₀ − x) (positif vers les x croissants) ; la note imprime P4 et C5 en valeur absolue (signe de P3 conservé)
  for (const [eps, kind, ref] of cases) dist.imposed(eps, kind).H.forEach((h, i) => rel(i >= 3 ? -h : h, ref[i], 1e-2, `ε ${eps} ${kind} ligne ${i + 1}`));
  rel(dist.imposed(3e-4).disp[0], 1.39e-2, 5e-3, 'déplacement TLD appareil C1');
});

test('Noé — pile P3 : combinaisons en tête (C1/C8), descente en pied, flambement, ferraillage', () => {
  const RF = dist.imposed(3.5e-4).H[2] + dist.imposed(2.5e-4).H[2], TLD = dist.imposed(3e-4).H[2];
  const comb = headCombinationsBAEL({ G: { N: 255 }, Q: [{ label: 'A(l)', N: 71.20, H: 2.403, gU: 1.605, gS: 1.2 }], RF: { H: RF }, TLD: { H: TLD } });
  const elu = comb.find(c => c.label === 'ELU A(l)'), els = comb.find(c => c.label === 'ELS A(l)');
  rel(elu.Ninst, 114.28, 1e-3, 'N inst ELU'); rel(elu.Nsus, 344.25, 1e-4, 'N soutenu ELU');
  rel(elu.Hinst, 3.86, 2e-3, 'T inst ELU'); rel(elu.Hsus, -4.71, 3e-3, 'T soutenu ELU');
  rel(els.Ninst, 85.44, 1e-3, 'N inst ELS'); rel(els.Hinst, 2.88, 3e-3, 'T inst ELS'); rel(els.Hsus, -3.52, 3e-3, 'T soutenu ELS');
  rel(elu.N, 458.53, 1e-4, 'N tête ELU');
  // PSH : T = −0,85 t ; M = T × (H_f + h_c) = × 19,5 puis × 20,5 en sous-face (bras de la note) ; poids de semelle de la note 57,8 t
  const d = descendLoads({ N: 458.53, H: -0.85, Hf: 18.5, hc: 1.0, Wchev: 69.84, Wfut: 589.69, Wsem: 57.84, hs: 1.0 });
  rel(d.base.N, 1348.89, 1e-4, 'N haut de semelle'); rel(d.base.M, -16.58, 2e-3, 'M haut de semelle');
  rel(d.found.N, 1426.98, 1e-4, 'N bas de semelle'); rel(d.found.M, -17.43, 1e-3, 'M bas de semelle');
  rel(pileGroupForces({ N: 1426.98, M: 0, xs: [-3.5, 0, 3.5] }).N[1], 475.66, 1e-4, 'N pieu P3');
  const bk = buckling({ Lf: 37, h: 1.5, Ev: 10819 });
  rel(bk.lambda, 85.44, 1e-3, 'λ fût P3'); rel(bk.sigCr, 14.60, 5e-3, 'σ_cr fût P3');
  const sh = designShaft({ shape: { b: 8.5, h: 1.5, c: 0.06 }, code: 'BAEL', fck: 25, fyk: 400, Hf: 18.5, combos: [{ label: 'ELU', N: 14269.8, M: 174.3 }] });
  assert.equal(sh.AsReq, 0, 'A théorique nulle'); rel(sh.As, 0.002 * 8.5 * 1.5, 1e-9, 'A_min 0,2 % B');
  rel(buckling({ Lf: 6, h: 0.8, Ev: 10819 }).lambda, 25.98, 1e-3, 'λ voile de culée');
});

test('Noé — culée C1 : descente, pieux (2 files de 4), bielles', () => {
  const d = descendLoads({ N: 211.29, H: 59.31, Hf: 3.0, hc: 1.45, Wchev: 91.71, Wfut: 59.67, Wsem: 137.69, hs: 1.0 });
  rel(d.base.N, 415.66, 1e-4, 'N haut de semelle'); rel(d.base.M, 263.93, 1e-4, 'M haut de semelle');
  rel(d.found.N, 601.55, 1e-4, 'N bas de semelle'); rel(d.found.M, 323.24, 1e-4, 'M bas de semelle');
  const pg = pileGroupForces({ N: 601.55, M: 323.24, xs: [-1.5, -1.5, -1.5, -1.5, 1.5, 1.5, 1.5, 1.5], Mhead: 3.14 });
  rel(pg.N[0], 50.35, 1e-3, 'N pieux file 1'); rel(pg.N[7], 100.04, 1e-3, 'N pieux file 2');
  // bielles (PP73 1.3.2 § 4.3.2) : R = réaction la plus élevée d'un pieu du couple (100,04 t), σ̄_s = 165 MPa → 82,97 cm²
  // par couple (la note applique la charge totale 601,6 t → 501,5 cm²) ; bielles à 36° < 45° : hors du domaine de la méthode
  rel(pileCapStrutTie({ R: 1000.4, l: 3.0, b: 0.8, h: 0.95, sigS: 165 }) * 1e4, 82.97, 1e-3, 'A1 par couple [cm²]');
  const t = pileCapTwoRows({ RU: 1000.4, RS: 1000.4, l: 3.0, b: 0.8, hs: 1.05, D: 0.8, fsu: 165, sigSels: 165 });
  assert.equal(t.thetaOk, false); rel(t.theta, 36.2, 3e-3, 'angle des bielles');
});

test('Noé — module de réaction de Ménard, minimum des pieux', () => {
  rel(menardReaction({ EM: 1800, alpha: 0.66, B: 1.2 }).k, 6756, 1e-3, 'k Ø 1,20');
  rel(menardReaction({ EM: 1800, alpha: 0.66, B: 0.8 }).k, 9120, 1e-3, 'k Ø 0,80');
  rel(sigmaSBAEL({ fe: 400, fc28: 25, fiss: 'FP' }), 201.6, 1e-3, 'σ̄_s FP Noé'); rel(sigmaSBAEL({ fe: 400, fc28: 25 }), 161.3, 1e-3, 'σ̄_s FTP Noé');
  rel(pileMinSteel({ D: 1.2 }) * 1e4, 56.55, 1e-3, 'A_min Ø 1,20'); rel(pileMinSteel({ D: 0.8 }) * 1e4, 25.13, 1e-3, 'A_min Ø 0,80');
});

test('NF P 94-261 — k_p,max (D_e/B = 2) du tableau D.2.3 et i_δ', () => {
  const kmax = { argile: [1.022, 1.123], sable: [1.393, 1.580], craie: [1.517, 1.768], marne: [1.399, 1.598] };
  for (const s of Object.keys(kmax)) {
    rel(kp261({ soil: s, De: 2, B: 1, L: 1e9 }), kmax[s][0], 1e-3, `${s} filante`);
    rel(kp261({ soil: s, De: 2, B: 1, L: 1 }), kmax[s][1], 1e-3, `${s} carrée`);
  }
  rel(iDeltaFrictional(Math.PI / 8, 0), (1 - 0.5) ** 2, 1e-9, 'i_δ frottant D_e = 0 : (1 − δ/45°)²');
  rel(iDeltaFrictional(Math.PI / 8, 50), iDeltaCohesive(Math.PI / 8), 1e-9, 'i_δ frottant D_e/B → ∞');
  const f = shallowFooting({ code: 'EC', B: 3, L: 10, D: 1, V: 6000, H: 300, M: 1500, classe: 'sable-B', ple: 1.0 });
  rel(f.Bp, 2.5, 1e-9, 'B′ Meyerhof'); assert.ok(f.ratioV > 0 && f.ratioV < 2 && f.excOk);
});

test('Section N-M, pieu latéral, culée (cohérence)', () => {
  // flexion simple : rectangle 1 × 0,5 m, 300 kN·m → section ≈ deux fois une section de flexion simple (≈ 20 cm² par nappe)
  const r = requiredSteelNM({ b: 1, h: 0.5, c: 0.05 }, { code: 'BAEL', fck: 25, fyk: 400 }, 0, 300);
  assert.ok(r.As * 1e4 > 35 && r.As * 1e4 < 45, `As ${r.As * 1e4}`);
  // pieu long : y₀ = 2H λ/(k D), λ = (k D/(4EI))^(1/4) (tête libre, Hetényi)
  const D = 1.2, E = 30000, k = 67560, H = 100, I = Math.PI * D ** 4 / 64, lam = (k * D / (4 * E * 1000 * I)) ** 0.25;
  const lp = lateralPile({ L: 30, D, E, k, H });
  rel(lp.y0, 2 * H * lam / (k * D), 2e-2, 'y₀ pieu long (Hetényi)');
  rel(lp.Mmax, 0.3224 * H / lam, 3e-2, 'M_max pieu long (0,3224 H/λ)');
  // PP73 1.3.2 § 2.3.1 : 0,20 m (h ≤ 1), 0,10 + 0,10 h (1 à 2 m), 0,30 m (2 à 3 m)
  assert.equal(gardeGreveThickness(0.8), 0.20); assert.equal(gardeGreveThickness(1.5), 0.10 + 0.15); assert.equal(gardeGreveThickness(2.5), 0.30);
  const gg = gardeGreve({ h: 1.5, K: Ka(30) });
  assert.ok(gg.ELU > gg.ELS && gg.Mp > 0 && gg.Mf > 0);
  // PP73 1.3.2 § 3.4 (ℓ = 4 m) : e = (ℓ + 2)/20 = 0,30 m ; charges à 1 m de l'extrémité : M_H = (h/3 + 0,5) ℓ²h/6 + 2 (ℓ − 1) [t·m]
  const mr = murEnRetour({ L: 4, h: 5 }); assert.ok(Math.abs(mr.e - 0.30) < 1e-12 && mr.Mh > mr.Th);
  rel(mr.Mh, 10 * ((5 / 3 + 0.5) * 16 * 5 / 6 + 2 * 3), 1e-12, 'M_H PP73');
  assert.equal(murEnRetour({ L: 2, h: 2 }).e, 0.20); assert.ok(murEnRetour({ L: 2, h: 2 }).murette);
  assert.ok(minimumSteelPier({ code: 'EC', Ac: 1, perimeter: 4, Ned: 10000 }).min > 0.002);
});

test('Chaîne complète : appuis calculés depuis le tablier, chapitre de la note (BAEL et EC, toutes variantes)', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const { buildNote } = await import('../web/note.js');
  for (const v of [{}, { ap_pileType: 'colonnes', ap_hc: '0.9', ap_culType: 'enterree', ap_found: 'pieux' }]) {
    const st = compute(parseData({ ...formDefaults(), ...v }));
    assert.equal(st.supportsError, null);
    const s = st.supports;
    assert.equal(s.lines.length, st.deck.spans.length + 1);
    // symétrie de l'ouvrage symétrique : efforts horizontaux imposés opposés, x₀ au milieu
    rel(s.distB.x0.diff, 23, 1e-9, 'x0 ouvrage symétrique');
    for (const L of s.lines) for (const code of ['BAEL', 'EC']) {
      const r = L[code];
      assert.ok(r.base.every(b => Number.isFinite(b.Nb) && Number.isFinite(b.Mb)), `${L.kind} ${code} efforts finis`);
      assert.ok(Number.isFinite(r.shaft.As), `${L.kind} ${code} A_s fût`);
      assert.ok(Number.isFinite(r.found.type === 'pieux' ? r.found.As : r.found.AsLong), `${L.kind} ${code} fondation`);
    }
    for (const ref of ['F61', 'EC']) {
      const note = buildNote(st, { ref });
      assert.ok(note.blocks.some(b => b.t === 'h1' && /Appuis et fondations/.test(b.text)), `chapitre appuis ${ref}`);
    }
  }
});

test('Export Pont EC8 (ouvpara) : projet v1 complet et cohérent avec le tablier', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const { toPontEC8 } = await import('../src/ec8export.js');
  const st = compute(parseData({ ...formDefaults(), ap_pileType: 'colonnes', ap_culType: 'enterree', ap_zone: '4' }));
  const j = toPontEC8(st, { site: st.p.supports.ec8 });
  assert.equal(j.version, 1); assert.equal(j.site.zone, 4);
  assert.deepEqual(j.tablier.travees, st.deck.spans);
  assert.equal(j.appuis.length, st.deck.spans.length + 1);
  assert.equal(j.appuis[1].futs.forme, 'circulaire'); assert.equal(j.appuis[0].type, 'culee');
  rel(j.appuis[1].chargesPermanentes.Nmax, st.perm.Rmax[1] / 1000, 1e-12, 'N permanent pile (MN)');
  for (const a of j.appuis) assert.ok(a.appareils.a > 0 && a.appareils.nbFeuillets > 0);
});

test('Séisme (moteur Pont EC8 intégré) et chocs : combinaisons accidentelles des appuis', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const { supportsBlocks } = await import('../web/supports_view.js');
  const st = compute(parseData({ ...formDefaults(), ap_seisme: 'on', ap_zone: '4', ap_choc: 'autoroute', ap_found: 'pieux' }));
  const s = st.supports;
  assert.ok(s.seisme && !s.seisme.error, 'séisme calculé');
  // la somme des efforts longitudinaux par appui (cas X + 0,3 Y) restitue l'effort total
  rel(s.seisme.efforts.appuis.reduce((a, p) => a + p.cas[0].Fx, 0), s.seisme.F.x, 1e-6, 'ΣF_x = F');
  const pile = s.lines[1].BAEL;
  assert.ok(pile.base.some(b => /choc véhicule/.test(b.label) && Math.abs(b.Hb - 1000) < 1e-9), 'choc 1000 kN');
  assert.ok(pile.shaft.rows.some(r => r.acc), 'combinaisons accidentelles dans le ferraillage du fût');
  assert.ok(Number.isFinite(pile.found.capRatio.ACC) && pile.found.capRatio.ACC > 0);
  assert.ok(supportsBlocks(s, 'EC').some(b => b.t === 'h2' && /Séisme/.test(b.text)));
});

test('Appuis seuls (tablier quelconque) : réactions saisies, séisme, note', async () => {
  const { parseStandalone, computeStandalone } = await import('../src/supports/standalone.js');
  const { parseSupports } = await import('../src/pipeline.js');
  const { supportsNote, blocksToHTML } = await import('../web/supports_view.js');
  const d = { ss_spans: '33,33,33,33', ss_width: '10', ss_h: '2', ss_area: '4.5', ss_super: '45', ss_Lc: '8', ss_nb: '4', ss_bearing: '400×400×4(12+3)',
    ss_lines: ['1275;1275;710;650;900;50;900;600', ...Array(3).fill('2550;2550;1100;900;1300;80;1300;1000'), '1275;1275;710;650;900;50;900;600'].join('\n'),
    ap_pileH: '18.5', ap_pileB: '1.5', ap_pileLv: '8.5', ap_found: 'pieux', ap_nFiles: '1', ap_nPile: '3', ap_pileD: '1.2', ap_Lpile: '30', ap_seisme: 'on' };
  const st = computeStandalone(parseStandalone(d), parseSupports(d));
  // appareils 4 × 400 × 400 × 4(12 + 3) sur culée rigide : K = 1/s_néoprène = 2173 t/m (note Noé : souplesse 0,4601·10⁻³ m/t)
  rel(st.supports.distB.K.inst[0], 21735, 1e-3, 'K culée = K néoprène');
  assert.ok(st.supports.seisme && !st.supports.seisme.error);
  const note = supportsNote(st.supports, { ref: 'F61', standalone: true, spans: st.deck.spans });
  assert.ok(note.blocks.length > 10 && blocksToHTML(note.blocks).includes('Fondations'));
  assert.throws(() => computeStandalone(parseStandalone({ ...d, ss_lines: '1;1;1;1;1;1;1;1' }), parseSupports(d)), /lignes d'appui attendues/);
});

test('Profil pressiométrique par couches : p*_le, D_e, couche d\'assise et pieux', async () => {
  const { soilProfile, shallowFooting, pileCapacity } = await import('../src/supports/foundation.js');
  const prof = soilProfile([{ z0: 0, z1: 2, classe: 'argile-B', pl: 0.8, EM: 6, alpha: 0.67 }, { z0: 2, z1: 8, classe: 'sable-B', pl: 1.2, EM: 12, alpha: 0.33 }, { z0: 8, z1: 40, classe: 'marne-A', pl: 2.5, EM: 30, alpha: 0.67 }]);
  // F62 E.2 : moyenne géométrique sur [D ; D + 1,5 B] = [1 ; 5,5] m → exp[(1 ln 0,8 + 3,5 ln 1,2)/4,5]
  const f = shallowFooting({ code: 'BAEL', B: 3, L: 13, D: 1, V: 5000, ls: 'ELU', profile: prof });
  rel(f.ple, Math.exp((Math.log(0.8) + 3.5 * Math.log(1.2)) / 4.5), 1e-3, 'p*_le F62');
  rel(f.De, 0.8 / f.ple, 1e-3, 'D_e = ∫₀¹ p*_l dz / p*_le'); assert.equal(f.classe, 'argile-B');
  // pieu de 12 m sous une semelle à 1 m : pointe à 13 m dans la marne
  const c = pileCapacity({ code: 'BAEL', type: 'fore-boue', D: 0.8, Lpile: 12, profile: prof, Dhead: 1 });
  assert.ok(c.applicable); assert.equal(c.detail.porteuse.classe, 'marne-A');
});

test('Un profil pressiométrique par ligne d\'appui', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute, parseProfiles } = await import('../src/pipeline.js');
  const prof = parseProfiles('[SP1]\n0 2 argile-B 0.8 6 0.67\n2 40 sable-B 1.2 12 0.33\n[SP2]\n0 40 marne-A 2.5 30 0.67');
  assert.deepEqual(prof.map(p => [p.name, p.layers.length]), [['SP1', 2], ['SP2', 1]]);
  const st = compute(parseData({ ...formDefaults(), ap_profil: '[SP1]\n0 2 argile-B 0.8 6 0.67\n2 40 sable-B 1.2 12 0.33\n[SP2]\n0 40 marne-A 2.5 30 0.67', ap_profAssign: 'SP1, SP2, SP2, SP1' }));
  const L = st.supports.lines;
  assert.deepEqual(L.map(l => l.profile), ['SP1', 'SP2', 'SP2', 'SP1']);
  const c = L[0].EC.found.checks[0], p = L[1].EC.found.checks[0];
  assert.equal(c.classe, 'argile-B'); assert.equal(p.classe, 'marne-A'); assert.ok(p.ple > c.ple);
});

test('PP73 : pile-culée apparente, culée à vide, chevêtre de culée (charges, torsion), paroi fléchie, 2 % des colonnes', async () => {
  const { earthPressureUpper, videCombos, gardeGreveThickness } = await import('../src/supports/abutment.js');
  const { chevetreTorsion } = await import('../src/supports/pier.js');
  const { paroiFlechie } = await import('../src/supports/foundation.js');
  // § 3.1.3.1 : Q = i h₁ (p + γ h₀ + 0,5 γ h₁) L, i = 1/3, p = 1,5 t/m², à 0,6 h₁ du haut
  const e = earthPressureUpper({ h1: 3, Htot: 8, L: 10 });
  rel(e.Pg + e.Pq, (1 / 3) * 3 * (15 + 0.5 * 20 * 3) * 10, 1e-12, 'Q pile-culée apparente');
  rel(e.arm, 8 - 1.8, 1e-12, 'bras');
  const v = videCombos({ W: 1000, ep: e, code: 'BAEL' });
  assert.equal(v[0].Nb, 1000); rel(v[0].Mb, 1.35 * e.Mg + 1.605 * e.Mq, 1e-12, 'ELU à vide');
  assert.equal(gardeGreveThickness(0.8, true), 0.30, 'dalle sur le garde-grève : 0,30 m');
  // § 2.2.4 : M_gh = 2,5 (h_g + 0,5 h_c + 1) e [t·m], C = M/2
  const t = chevetreTorsion({ hg: 1.5, hc: 1.0, b: 1.2, e: 3.5, code: 'BAEL' });
  rel(t.Mgh, 10 * 2.5 * (1.5 + 0.5 + 1) * 3.5, 1e-12, 'M_gh'); rel(t.Tu, 1.35 * t.Mgh / 2, 1e-12, 'T_u');
  rel(t.b0, 1.0 / 6, 1e-12, 'paroi b₀ = a/6');
  const tE = chevetreTorsion({ hg: 1.5, hc: 1.0, b: 1.2, e: 3.5, code: 'EC', V: 300 });
  assert.ok(tE.ratio > 0 && tE.Al > 0);
  // paroi fléchie (BAEL E.5, Perchat C 2 314 § 2.7.3) : plusieurs travées z = 0,2 (l + 1,5 h) pour 1/2 ≤ h/l ≤ 1, 0,5 l au-delà ;
  // deux appuis 0,2 (l + 2h) et 0,6 l ; l = min(l_axes ; 1,15 l_nus) ; poutre si h/l < 1/2
  rel(paroiFlechie({ l: 4, hs: 1, Hwall: 2, Mt: 100, Ma: 100, fsu: 348 }).z, 0.2 * (4 + 4.5), 1e-12, 'z');
  rel(paroiFlechie({ l: 4, hs: 1, Hwall: 2, Mt: 100, Ma: 100, fsu: 348, travees: 1 }).z, 0.2 * (4 + 6), 1e-12, 'z deux appuis');
  rel(paroiFlechie({ l: 4, hs: 1, Hwall: 6, Mt: 100, Ma: 100, fsu: 348 }).z, 2, 1e-12, 'z = 0,5 l');
  rel(paroiFlechie({ l: 4, lNu: 3, hs: 1, Hwall: 6, Mt: 1, Ma: 1, fsu: 348 }).l, 3.45, 1e-12, 'l = 1,15 l_nus');
  assert.equal(paroiFlechie({ l: 7, hs: 1, Hwall: 2, Mt: 1, Ma: 1, fsu: 348 }).applicable, false, 'h/l = 0,43 < 1/2');
  // intégration
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const S = compute(parseData({ ...formDefaults(), ap_culType: 'apparente', ap_found: 'pieux', ap_nFiles: '1', ap_pileD: '0.8' })).supports;
  const C = S.lines[0].BAEL;
  assert.match(C.earth.mode, /partie haute/);
  assert.equal(C.base.filter(b => b.vide).length, 2);
  assert.ok(C.torsion && C.cap.qDalle > 150);
  rel(C.shaft.mins.min, 0.02 * Math.PI * 0.8 ** 2 / 4, 1e-9, '2 % par colonne de pile-culée');
  assert.ok(S.lines[1].BAEL.found.capBeam.paroi.applicable, 'voile sur une file : paroi fléchie');
});
