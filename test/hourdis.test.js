// Hourdis des ponts à poutres (plaque DKT, surfaces d'influence) et entretoises d'about (vérinage) — recoupements
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourdisLocal } from '../src/beams/hourdis.js';
import { poutreContinue, entretoiseVerinage } from '../src/beams/entretoise.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);

test('hourdis sous charge uniforme = poutre continue à 3 travées + consoles (équation des trois moments)', () => {
  // 4 poutres à 3 m, consoles de 1,5 m, plaque uniforme (tables négligeables), q = 25 × 0,25 = 6,25 kPa
  const r = hourdisLocal({ n: 4, b1: 3, hd: 0.25, bt: 1e-4, eTab: 0, L: 33, roadway: { y1: -4, y2: 4 }, footways: [], lines: [], bands: [], fck: 30, fyk: 500 });
  const q = 6.25, l = 3, MA = -q * 1.5 ** 2 / 2, MB = (-q * l * l / 2 - MA) / 5;   // M_A + 4 M_B + M_C = −q l²/2, M_B = M_C
  const G = nom => r.cibles.find(c => c.nom.startsWith(nom)).G;
  near(G('panneau 2–3'), q * l * l / 8 + MB, 0.01, 'mi-travée centrale');
  near(G('panneau 1–2'), q * l * l / 8 + (MA + MB) / 2, 0.02, 'mi-travée de rive');
  near(G('nu de la table 2'), MB, 0.08, 'appui intérieur (lissage des moments nodaux)');
});

test('hourdis : console de rive avec corniche = statique (bras de levier réel conservé)', () => {
  const r = hourdisLocal({ n: 4, b1: 3.28, hd: 0.30, bt: 1.5, eTab: 0.15, L: 33, roadway: { y1: -4, y2: 4 }, footways: [], lines: [{ g: 18, e: -6.87 }, { g: 18, e: 6.87 }], bands: [], fck: 30, fyk: 500 });
  const c = r.cibles.find(q => q.nom === 'nu de la table 1 (gauche)'), a = 6.56 - 4.92 - 0.75;
  const M = -(25 * 0.30 * a * a / 2 + 18 * (6.87 - 4.92 - 0.75));
  near(c.G, M, 0.08, 'moment d\'encastrement de la console');
  // symétrie
  near(r.cibles.find(q => q.nom === 'nu de la table 4 (droite)').G, c.G, 1e-6, 'symétrie');
  assert.ok(r.inf.As > 0 && r.sup.As > 0 && r.poinc.ok);
  // effets locaux des roues dans le panneau central : du même ordre que P/4 (≈ 40 kN·m/m pour 150 kN)
  const pc = r.cibles.find(q => q.nom === 'panneau 2–3');
  assert.ok(pc.TS > 20 && pc.TS < 60, `TS ${pc.TS}`);
  assert.ok(pc.f61.dB > 1 && pc.f61.dB < 1.4);
});

test('poutre continue : isostatique et deux travées sous charge répartie', () => {
  let r = poutreContinue([0, 2], [0, 2], [{ x: 1, P: 100 }]);
  near(Math.max(...r.M), 50, 1e-9, 'PL/4'); near(r.R[0], 50, 1e-9, 'réaction');
  r = poutreContinue([0, 4], [0, 2, 4], [], 10);
  near(Math.min(...r.M), -5, 1e-6, '−wL²/8'); near(r.R[1], 25, 1e-6, '5wL/4');
});

test('entretoise : vérins de part et d\'autre de chaque poutre, réactions = charges', () => {
  const RG = [900, 800, 800, 900], e = entretoiseVerinage({ ys: [-4.92, -1.64, 1.64, 4.92], RG, dv: 0.6, verinsRive: true, he: 1.6, te: 0.25, hd: 0.3, fck: 35, fyk: 500 });
  const tot = e.R.reduce((a, b) => a + b, 0), att = 1.35 * (RG.reduce((a, b) => a + b, 0) + 25 * 0.25 * 1.6 * (e.pts.at(-1) - e.pts[0]));
  near(tot, att, 1e-6, 'équilibre');
  assert.equal(e.appuis.length, 8);
  // sans vérins extérieurs, la poutre de rive est portée en console : moment négatif plus fort
  const e2 = entretoiseVerinage({ ys: [-4.92, -1.64, 1.64, 4.92], RG, dv: 0.6, verinsRive: false, he: 1.6, te: 0.25, hd: 0.3, fck: 35, fyk: 500 });
  assert.ok(e2.Mneg < e.Mneg);
});
