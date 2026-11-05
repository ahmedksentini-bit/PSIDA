/** v0.99.17 : ponts à poutres — biais (AASHTO LRFD), diagrammes le long de la poutre, déversement en phase de pose (Mast). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { biaisPoutres } from '../src/beams/biais.js';
import { z0Mast, inertieVerticale, ksEN1337, deversementPoutre } from '../src/beams/deversement.js';
import { beamsBlocks } from '../web/beams_view.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);

test('biais : F_V = 1 + 0,20 (L t_s³/K_g)^0,3 tan θ, θ = (100 − ψ) 0,9°, r_M à partir de 30°', () => {
  const b = biaisPoutres({ psi: 60, L: 33, ts: 0.30, S: 3.28, Kg: 1.0 });
  near(b.theta, 36, 1e-12, 'θ');
  near(b.Fv, 1 + 0.2 * (33 * 0.027 / 1) ** 0.3 * Math.tan(36 * Math.PI / 180), 1e-12, 'F_V');
  near(b.rM, 1 - 0.25 * (1 / (33 * 0.027)) ** 0.25 * Math.sqrt(3.28 / 33) * Math.tan(36 * Math.PI / 180) ** 1.5, 1e-12, 'r_M');
  assert.equal(biaisPoutres({ psi: 80, L: 33, ts: 0.3, S: 3, Kg: 1 }).rM, 1, 'θ < 30° : pas de réduction');
  const ext = biaisPoutres({ psi: 20, L: 33, ts: 0.3, S: 3, Kg: 1 });
  assert.equal(ext.theta, 60); assert.ok(ext.notes.length === 2);
  assert.equal(biaisPoutres({ psi: 100, L: 33, ts: 0.3, S: 3, Kg: 1 }).Fv, 1);
});

test('biais dans l\'onglet poutres : V et R du trafic des poutres de rive × F_V à l\'appui, intérieures et G inchangées', () => {
  const r0 = computePoutres(parsePoutres(formDefaults())), r = computePoutres(parsePoutres({ ...formDefaults(), pt_biais: '60' }));
  const s0 = r0.spans[0], s = r.spans[0], F = s.skew.Fv;
  assert.ok(F > 1.1 && s.skew.Kg > 0 && /dimensions/.test(r.inp.KgSource));
  const n = s.beams.length;
  near(s.beams[0].V0.gr1a, F * s0.beams[0].V0.gr1a, 1e-9, 'rive : V0 gr1a × F_V');
  near(s.beams[n - 1].V0.gr1a, F * s0.beams[n - 1].V0.gr1a, 1e-9, 'autre rive');
  near(s.beams[1].V0.gr1a, s0.beams[1].V0.gr1a, 1e-12, 'poutre intérieure inchangée');
  near(s.beams[0].V0.G, s0.beams[0].V0.G, 1e-12, 'permanentes inchangées');
  near(s.beams[0].mid.gr1a, s0.beams[0].mid.gr1a, 1e-12, 'moments inchangés');
  near(r.lines[1].UDL, r0.lines[1].UDL, 1e-12, 'réaction de ligne inchangée');
  assert.ok(r.appareils.lignes[0].elu > r0.appareils.lignes[0].elu, 'appareil le plus chargé majoré');
  assert.match(r.appareils.texte, /^\d+ \d+( ; \d+ \d+)+$/);
});

test('déversement : z₀ de Mast, I_y du contour, K_s de la NF EN 1337-3', () => {
  near(z0Mast({ w: 10, L: 30, a: 0, E: 3e7, Iy: 0.04 }), 10 * 30 ** 4 / (120 * 3e7 * 0.04), 1e-12, 'z₀ (a = 0) = w L⁴/(120 E I_y)');
  assert.ok(z0Mast({ w: 10, L: 30, a: 3, E: 3e7, Iy: 0.04 }) < z0Mast({ w: 10, L: 30, a: 0, E: 3e7, Iy: 0.04 }));
  near(inertieVerticale([[-0.5, 0], [0.5, 0], [0.5, 2], [-0.5, 2]]), 2 * 1 ** 3 / 12, 1e-12, 'rectangle 1 × 2');
  assert.equal(ksEN1337(1), 86.2); near(ksEN1337(1.1), (86.2 + 80.4) / 2, 1e-12, 'interpolation');
  const d = deversementPoutre({ L: 30, w: 15, A: 0.6, I: 0.25, Iy: 0.03, vs: 0.8, vi: 0.7, bt: 1.2, P: 3000, e: 0.5, fckT: 30, fctmT: 2.9, E: 32000, a: 1 });
  const Lv = d.levage, ei = (2 / 3) * 30 / 960 + 0.006;
  near(d.ei, ei, 1e-12, 'e_i');
  near(Lv.FSc, 1 / (Lv.z0 / Lv.yr + ei / Lv.yr / Lv.thetaMax), 1e-12, 'FS_c');
  near(Lv.FSf, Math.max(Lv.FSc, Lv.yr * 0.4 / (2 * Lv.z0 * 0.4 + ei)), 1e-12, 'FS_f');
});

test('VIPP par défaut : déversement vérifié, diagrammes M et V dans la note, champ biais', () => {
  const r = computePoutres(parsePoutres(formDefaults())), D = r.spans[0].deversement;
  assert.ok(D && D.ok && D.levage.FSc > 1.5 && D.pose.FSr > 1.5 && D.ec2.ok);
  const B = beamsBlocks(r);
  assert.ok(B.filter(b => b.t === 'svg').length >= 3, 'contraintes, moments, effort tranchant');
  assert.ok(B.some(b => b.t === 'h2' && /déversement/.test(b.text)));
  assert.ok(!B.some(b => b.t === 'h2' && /^Biais/.test(b.text)), 'pas de section biais pour un pont droit');
});
