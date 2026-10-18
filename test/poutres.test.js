/**
 * Ponts à poutres — Pont de Noé (COMETE/ICI 2012), sortie PONTYPE/PAP : travée isostatique de 33 m, 4 poutres VIPP
 * d'entraxe 3,28 m, hourdis de 0,30 m, I poutre + hourdis = 1,006057 m⁴, K = 0,036412 m⁴ ; chaussée de 8 m (Lc = 8 m),
 * trottoirs de 2,56 m, classe 1 ; ossature 20,875 t/m, superstructures réparties 2,35 t/m, de rive 1,8 t/m par côté.
 * Valeurs de la note en t et t·m.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guyonParams, beamDeck, beamCombinations, beamSection, kTorsion } from '../src/beams/index.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : PAP ${b}, outil ${a.toFixed(4)}`);
const t = 10;
const NOE = { spans: [33], n: 4, b1: 3.28, hd: 0.30, beam: { A: 20.875 * t / 25 / 4, I: 1.006057, K: 0.036412, H: 2.32 },
  roadway: { y1: -4, y2: 4 }, footways: [{ y1: -6.56, y2: -4 }, { y1: 4, y2: 6.56 }],
  lines: [{ g: 1.8 * t, e: -6.87 }, { g: 1.8 * t, e: 6.87 }], bands: [{ q: 2.35 * t / 13.12, y1: -6.56, y2: 6.56 }], nRetenue: 0, mil: 'Mc120' };

test('Paramètres de Guyon-Massonnet du tablier à poutres : θ = 0,679, α = 0,148 (PAP)', () => {
  const gp = guyonParams({ n: 4, b1: 3.28, L: 33, Ip: 1.006057, Kp: 0.036412, hd: 0.30 });
  rel(gp.rhoP, 0.306725, 1e-5, 'ρ poutres'); rel(gp.gammaP, 0.005551, 1e-3, 'γ poutres'); rel(gp.rhoE, 0.00225, 1e-9, 'ρ hourdis');
  rel(gp.theta, 0.679, 1e-3, 'θ'); rel(gp.alpha, 0.148, 4e-3, 'α');
});

test('Efforts par poutre à mi-travée (poutres 1 et 2) : A, Bc, Mc120, trottoirs, charges permanentes, ELS/ELU', () => {
  const r = beamDeck(NOE), S = r.bySpan.get(33), mid = S.deck.beam.sectionIndex(0, 0.5), x0 = S.deck.beam.sectionIndex(0, 0);
  const REF = [{ G: 977.49, A: 201.44, Bc: 246.36, Mc120: 295.91, trott: 35.56, ELS: 1316.07, ELU: 1772.64, VBc: 33.64 },
    { G: 850.49, A: 293.89, Bc: 280.81, Mc120: 305.91, trott: 18.23, ELS: 1225.03, ELU: 1645.60, VBc: 38.35 }];
  const TOL = [{ G: 3e-3, A: 1e-3, Bc: 2e-2, Mc120: 5e-3, trott: 1e-2, ELS: 1e-2, ELU: 1e-2, VBc: 5e-3 },
    { G: 1.5e-2, A: 1e-3, Bc: 5e-3, Mc120: 5e-3, trott: 1e-2, ELS: 1e-2, ELU: 1e-2, VBc: 2.5e-2 }];
  for (const k of [0, 1]) {
    const b = S.beams[k], c = beamCombinations(b);
    for (const id of ['G', 'A', 'Bc', 'Mc120', 'trott']) rel(b[id].Mmax[mid] / t, REF[k][id], TOL[k][id], `poutre ${k + 1} M ${id}`);
    rel(c.ELS_F61[mid] / t, REF[k].ELS, TOL[k].ELS, `poutre ${k + 1} ELS`); rel(c.ELU_F61[mid] / t, REF[k].ELU, TOL[k].ELU, `poutre ${k + 1} ELU`);
    rel(b.Bc.Vmax[x0] / t, REF[k].VBc, TOL[k].VBc, `poutre ${k + 1} V Bc appui`);
  }
  rel(S.f61.deltaBc[0], 1.075, 1e-3, 'δB'); rel(S.f61.deltaMc[0], 1.071, 1e-3, 'δC');
});

test('Section poutre + hourdis et torsion par rectangles', () => {
  const s = beamSection({ parts: [{ b: 1, h: 1 }], hourdis: { b: 2, h: 0.5 } });
  rel(s.A, 2, 1e-12, 'A'); rel(s.vp, (1 * 0.5 + 1 * 1.25) / 2, 1e-12, "v'");
  rel(kTorsion(1, 1), 0.141, 1e-2, 'k carré ≈ 0,141');
});

test('Onglet poutres : calcul complet (BP et BA, géométrie par rectangles) et transmission aux appuis', async () => {
  const { parsePoutres, computePoutres, linesToStandaloneText } = await import('../src/beams/run.js');
  const { parseStandalone, computeStandalone } = await import('../src/supports/standalone.js');
  const { parseSupports } = await import('../src/pipeline.js');
  const d = { pt_spans: '33, 33', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_A: '2.047', pt_I: '1.006057', pt_K: '0.036412', pt_v: '0.65', pt_vp: '1.67', pt_H: '2.32',
    pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56', pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '1.79 sur -6.56,6.56', pt_P: '6500', pt_e0: '-1.46' };
  const r = computePoutres(parsePoutres(d));
  rel(r.spans[0].theta, 0.679, 1e-3, 'θ');
  assert.equal(r.lines.length, 3);
  rel(r.lines[1].G, 2 * r.lines[0].G, 1e-9, 'pile = 2 culées (permanentes)');
  assert.ok(r.lines[1].Bc > r.lines[0].Bc, 'Bc sur pile > sur culée');
  const ba = computePoutres(parsePoutres({ ...d, pt_type: 'BA', pt_parts: '0.6 0.25 ; 0.25 1.47 ; 1.0 0.3' }));
  assert.ok(ba.spans[0].beams.every(b => b.BA.EC.As > 0 && b.BA.BAEL.As > 0));
  const st = computeStandalone(parseStandalone({ ss_spans: '33, 33', ss_width: '13.12', ss_h: '2.32', ss_area: '8.19', ss_super: '0', ss_Lc: '8', ss_nb: '4', ss_bearing: 'auto', ss_lines: linesToStandaloneText(r.lines) }), parseSupports({}));
  assert.equal(st.supports.lines.length, 3);
});
