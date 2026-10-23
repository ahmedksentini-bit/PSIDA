// Pont à poutres VIPP : section par dimensions, câblage, chaîne par phases, ELU, effort tranchant — recoupements
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proprietesPolygone, sectionVIPP, FORME_VIPP, contourVIPP, largeurEfficaceT } from '../src/beams/vipp_section.js';
import { beamSection } from '../src/beams/index.js';
import { chaineVIPP, DEFAUTS_VIPP, traceCables, momentResistant } from '../src/beams/vipp.js';
import { etriersEC2 } from '../src/beams/design.js';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { betonEC2 } from '../src/phasage/fluage.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);

test('polygone : section en I à rectangles = beamSection (talon sans pan, sans goussets)', () => {
  // talon 0,6 × 0,25 ; âme 0,25 × 1,47 ; table 1,0 × 0,3
  const pts = [[0, 0], [0.3, 0], [0.3, 0.25], [0.125, 0.25], [0.125, 1.72], [0.5, 1.72], [0.5, 2.02], [0, 2.02], [-0.5, 2.02], [-0.5, 1.72], [-0.125, 1.72], [-0.125, 0.25], [-0.3, 0.25], [-0.3, 0]];
  const P = proprietesPolygone(pts), R = beamSection({ parts: [{ b: 0.6, h: 0.25 }, { b: 0.25, h: 1.47 }, { b: 1.0, h: 0.3 }] });
  near(P.A, R.A, 1e-12, 'A'); near(P.yG, R.vp, 1e-12, 'yG'); near(P.I, R.I, 1e-12, 'I');
});

test('contour VIPP : hauteurs du pan et du gousset, aire par décomposition', () => {
  const f = { ...FORME_VIPP, hp: 1.75, bt: 1.5, hte: 0.10, pt: 0.10, gt: 0.15, b0: 0.20, bta: 0.70, hpi: 0.15, tpan: 1.25 };
  const C = contourVIPP(f);
  near(C.yPan, 0.15 + 1.25 * 0.25, 1e-12, 'haut du pan');
  near(C.yTab, 1.75 - 0.10 - 0.10 * (0.75 - 0.10 - 0.15), 1e-12, 'sous-face de table');
  // aire à la main : pied + pan (trapèze) + âme + goussets + table (trapèzes) 
  const A = 0.70 * 0.15 + (0.70 + 0.20) / 2 * (C.yPan - 0.15) + 0.20 * (C.yGou - C.yPan) + (0.20 + 0.50) / 2 * 0.15
    + 0.50 * (1.75 - C.yTab) + 2 * (0.50 * (1.75 - C.yTab + 0.10) / 2);
  near(proprietesPolygone(C.pts).A, A, 1e-12, 'aire');
});

test('largeur efficace EN 1992-1-1 § 5.3.2.1', () => {
  near(largeurEfficaceT({ b1: 3.28, bw: 1.5, l0: 33 }), 3.28, 1e-12, 'pleine largeur');
  // l0 = 8 m : b_eff,i = min(0,2·0,89 + 0,8 ; 1,6 ; 0,89) = 0,89 → pleine ; b1 = 6 m : bi = 2,25 → 0,2·2,25 + 0,8 = 1,25
  near(largeurEfficaceT({ b1: 6, bw: 1.5, l0: 8 }), 1.5 + 2 * 1.25, 1e-12, 'réduite');
});

const NOE = { pt_geo: 'dims', pt_spans: '33', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56', pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '1.79 sur -6.56,6.56', pt_type: 'BP', pt_fck: '40' };

test('chaîne VIPP : contrainte à la mise en tension = P/A + P e v/I − M v/I (câble 1, poutre seule)', () => {
  const inp = parsePoutres({ ...NOE, pt_nc: '1', pt_n2: '0' }), r = computePoutres(inp), v = r.spans[0].beams[0].vipp;
  const pas = v.out.pas[v.out.finPhase[0]], P = v.S.poutre, L = 33, nb = 20;
  const N = pas.cables.find(q => q && q.seg === nb / 2 - 1).N;   // segment juste avant mi-travée
  const N2 = pas.cables.find(q => q && q.seg === nb / 2).N, Nm = (N + N2) / 2;
  const e = v.trace.cab[0].ym - P.yG, M = v.charges.wP * L * L / 8;
  const attendu = (-Nm / P.A + (M + Nm * e) * P.yG / P.I) / 1000;      // fibre inférieure, traction positive
  const r0 = pas.barres[v.modele.barres.findIndex(b => b.beton === 'P') + nb / 2];
  near((r0.N / P.A + r0.M(0) * P.yG / P.I) / 1000, attendu, 0.01, 'σ inf. moteur ≈ formule de RDM');
});

test('pertes : frottement + recul identiques au module de précontrainte ; raccourcissement élastique ≈ (E_p/E_cm(t)) Δσ_c', () => {
  const inp = parsePoutres({ ...NOE, pt_nc: '2', pt_n2: '0', pt_parlit: '2' }), v = computePoutres(inp).spans[0].beams[0].vipp;
  const nb = 20, seg = nb / 2 - 1, P1a = v.out.pas[v.out.finPhase[0]].cables.find(q => q && q.cable === 0 && q.seg === seg).N;
  const P1b = v.out.pas[v.out.pas.findIndex(pp => pp.phase === 1)].cables.find(q => q && q.cable === 0 && q.seg === seg).N;
  // Δσ_c au niveau du câble 1 dû à la mise en tension du câble 2 (force P2, même excentricité, lit commun)
  const P = v.S.poutre, e = v.trace.cab[0].ym - P.yG, P2 = v.pertes[1].Pinst, dsc = P2 / P.A + P2 * e * e / P.I;   // kPa
  const bP = betonEC2({ fck: 40, h0: P.h0, ciment: 'R' }), perte = 195000 / bP.E(7) * dsc / 1000 * v.trace.u.Ap * 1000;
  near(P1a - P1b, perte, 0.05, 'perte élastique du câble 1');
  // frottement : force moyenne du segment de mi-travée < P0, cohérente avec λ
  assert.ok(v.pertes[0].Pinst < v.P0 && v.pertes[0].Pinst > 0.9 * v.P0);
});

test('ELU : moment résistant d\'une table rectangulaire = A_p f_pd (d − 0,4 x)', () => {
  const S = sectionVIPP(FORME_VIPP, { b1: 3.0, hd: 0.25, beff: 3.0 });
  const Ap = 0.0036, d = 1.75 + 0.25 - 0.15, fpd = 1640 / 1.15, fcd = 0.85 * 30 / 1.5;
  const r = momentResistant({ S, cables: [{ Ap, d, epm: 0.006 }], As: 0, ds: d, fcdP: 0.85 * 40 / 1.5, fcdH: fcd, fpd });
  const x = Ap * fpd / (0.8 * 3.0 * fcd);   // axe neutre dans le hourdis
  assert.ok(0.8 * x < 0.25);
  near(r.M, Ap * fpd * 1000 * (d - 0.4 * x), 2e-3, 'M_Rd');
});

test('étriers EN 1992-1-1 § 6.2.3 : cot θ = 2,5 si V_Rd,max suffit, sinon réduit', () => {
  const a = etriersEC2({ VEd: 500, bw: 0.2, z: 1.6, fck: 40, fyk: 500 });
  near(a.cot, 2.5, 1e-12, 'cot θ'); near(a.AswCalc, 500 / (1.6 * 434.78 * 1000 * 2.5), 1e-4, 'A_sw/s');
  const fcd = 0.85 * 40 / 1.5, nu1 = 0.6 * (1 - 40 / 250), Vmax1 = 0.2 * 1.6 * nu1 * fcd * 1000 / 2;
  const b = etriersEC2({ VEd: 0.9 * Vmax1, bw: 0.2, z: 1.6, fck: 40, fyk: 500 });
  assert.ok(b.cot < 2.5 && b.cot > 1 && b.ok && b.VRdmax >= 0.9 * Vmax1 - 1e-6);
  assert.equal(etriersEC2({ VEd: 1.1 * Vmax1, bw: 0.2, z: 1.6, fck: 40, fyk: 500 }).ok, false);
});

test('pont VIPP par défaut (33 m, 4 poutres) : toutes les vérifications satisfaites, pertes 15 à 30 %, ratio ≈ 40 kg/m³', () => {
  const r = computePoutres(parsePoutres(NOE));
  for (const b of r.spans[0].beams) {
    const v = b.vipp;
    assert.ok(v.ok, `poutre ${b.k + 1} : ${v.verifs.filter(q => !q.ok).map(q => q.nom).join(', ')}`);
    const pertes = 1 - v.Ptot.inf / v.Ptot.P0;
    assert.ok(pertes > 0.15 && pertes < 0.30, `pertes ${pertes}`);
    assert.ok(v.quantites.ratioP > 30 && v.quantites.ratioP < 50);
    assert.ok(v.fleches.infini < 0, 'contre-flèche sous permanentes');
    assert.ok(v.tranchant[0].Vpd > 0.25 * v.tranchant[0].VEd0, 'les câbles relevés reprennent une large part de V à l\'appui');
  }
  // traçé : aucune alerte d'encombrement avec les valeurs par défaut
  assert.deepEqual(r.spans[0].beams[0].vipp.trace.alerte, []);
});

test('encombrement des gaines (EN 1992-1-1 § 8.10.1.3) signalé', () => {
  const t = traceCables({ ...DEFAUTS_VIPP.cables, ev: 0.10, parLit: 5 }, 33, FORME_VIPP);
  assert.ok(t.alerte.length >= 2);
});

test('projets antérieurs : section par valeurs inchangée (pas de chaîne VIPP)', () => {
  const r = computePoutres(parsePoutres({ ...NOE, pt_geo: undefined, pt_A: '2.047', pt_I: '1.006057', pt_K: '0.036412', pt_v: '0.65', pt_vp: '1.67', pt_H: '2.32', pt_P: '6500', pt_e0: '-1.46' }));
  assert.equal(r.inp.geo, 'valeurs'); assert.ok(!r.spans[0].beams[0].vipp && r.spans[0].beams[0].BP);
});

test('plans de la poutre : trois feuilles valides (mise en page sans chevauchement), allongements théoriques', async () => {
  const { planCoffrageVIPP, planCablageVIPP, planFerraillageVIPP } = await import('../src/plans/vipp.js');
  const { feuilleDXF } = await import('../src/plans/dxf.js');
  const v = computePoutres(parsePoutres(NOE)).spans[0].beams[0].vipp;
  for (const fn of [planCoffrageVIPP, planCablageVIPP, planFerraillageVIPP]) {
    const F = fn(v, { numero: 'X' });
    assert.deepEqual(F.valide().problemes, []);
    assert.ok(feuilleDXF(F).length > 1000);
  }
  // allongement ≈ P_moyen L / (E_p A_p) : 246 mm pour 2 657 kN au vérin sur 33 m (frottement compris)
  const F = planCablageVIPP(v, {}), t = F.tableaux.find(q => q.titre.startsWith('CÂBLES'));
  const al = +t.lignes[0][5];
  assert.ok(al > 230 && al < 260, `allongement ${al}`);
});
