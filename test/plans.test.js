/** Plans d'exécution du tablier : coffrage, ferraillage, bordereau ISO 4066, écritures DXF et SVG. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseData, compute } from '../src/pipeline.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { EXEMPLES, donnees } from '../tools/exemples.mjs';
import { planCoffrage, quantitesCoffrage } from '../src/plans/coffrage.js';
import { planFerraillage } from '../src/plans/ferraillage.js';
import { bordereau, recapitulatif, longueurCoupe, rayonCintrage } from '../src/plans/bordereau.js';
import { feuilleSVG } from '../src/plans/svg.js';
import { feuilleDXF, octetsCp1252 } from '../src/plans/dxf.js';
import { hachuresPoly, echelleQuiTient } from '../src/plans/dessin.js';

const st = compute(parseData(formDefaults()));

/** Lecture minimale d'un DXF : paires (code, valeur), sections, blocs, insertions. */
function lireDXF(txt) {
  const l = txt.split('\r\n'); assert.equal(l[l.length - 1], '');
  const paires = []; for (let i = 0; i + 1 < l.length - 1; i += 2) paires.push([l[i].trim(), l[i + 1]]);
  const sections = paires.filter((p, i) => p[0] === '0' && p[1] === 'SECTION').map((_, k) => k);
  const noms = []; paires.forEach((p, i) => { if (p[0] === '0' && p[1] === 'SECTION') noms.push(paires[i + 1][1]); });
  const compte = t => paires.filter(p => p[0] === '0' && p[1] === t).length;
  return { paires, sections: noms, compte, fin: paires[paires.length - 1] };
}

test('Codes de forme ISO 4066 : longueurs de coupe', () => {
  assert.equal(rayonCintrage(12), 24); assert.equal(rayonCintrage(25), 87.5);
  assert.equal(longueurCoupe('00', { A: 6000 }, 16), 6000);
  assert.equal(longueurCoupe('11', { A: 6000, B: 500 }, 16), 6000 + 500 - 0.5 * 32 - 16);
  assert.equal(longueurCoupe('21', { A: 200, B: 5000, C: 200 }, 12), 5400 - 24 - 24);
  assert.equal(longueurCoupe('51', { A: 600, B: 300, C: 100 }, 10), 2000 - 2.5 * 20 - 50);
});

test('Bordereau : tous les repères, masse proche du métré, récapitulatif cohérent', () => {
  const L = bordereau(st), R = recapitulatif(L), marks = st.rebar.marks;
  for (const m of marks) assert.ok(L.some(l => l.mark === m.mark), `repère ${m.mark} absent`);
  // nombre de pièces : même longueur totale de barres à ± 3 % près (retours et arrondis en plus)
  assert.ok(Math.abs(R.masse / st.rebar.totalMass - 1) < 0.03, `${R.masse} / ${st.rebar.totalMass}`);
  assert.ok(Math.abs(R.masse - L.reduce((s, l) => s + l.masse, 0)) < 1e-6);
  for (const l of L) { assert.ok(['00', '11', '21', '51'].includes(l.code)); assert.ok(l.L > 0 && l.nombre > 0 && l.L <= 12000 + 2 * 1000, `${l.repere} : L = ${l.L}`); }
});

test('Plan de coffrage : quatre vues, quantités, DXF et SVG lisibles', () => {
  const F = planCoffrage(st, { projet: 'Essai', numero: 'X-01' });
  assert.equal(F.format, 'A1'); assert.equal(F.vues.length, 4);
  const Q = quantitesCoffrage(st);
  // dalle rectangulaire 12 × 0,70 sans chanfreins, longueur 46 m : 386,4 m³
  assert.ok(Math.abs(Q.beton - 12 * 0.7 * 46) < 1e-6, `béton ${Q.beton}`);
  const dxf = feuilleDXF(F), D = lireDXF(dxf);
  assert.deepEqual(D.sections, ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']);
  assert.deepEqual(D.fin, ['0', 'EOF']);
  assert.equal(D.compte('BLOCK'), 4); assert.equal(D.compte('INSERT'), 4);
  assert.equal(D.compte('POLYLINE'), D.compte('SEQEND'));
  const oct = octetsCp1252(dxf); assert.ok(oct.every(b => b < 256));
  assert.ok(!/[^\x00-\xff]/.test(dxf.replace(/[€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '')), 'caractère hors ANSI 1252 non échappé');
  const svg = feuilleSVG(F);
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('TABLIER — PLAN DE COFFRAGE') && svg.includes('Essai'));
});

test('Plan de ferraillage : vues, bordereau dans la feuille, vue dilatée hors bloc DXF', () => {
  const F = planFerraillage(st, { numero: 'X-02' });
  assert.equal(F.vues.length, 2);
  assert.ok(F.vues[0].vue.echelleV && F.vues[0].vue.echelleV < F.vues[0].vue.echelle);
  assert.ok(F.tableaux.length === 2 && F.tableaux[0].lignes.length === bordereau(st).length);
  const D = lireDXF(feuilleDXF(F));
  assert.equal(D.compte('BLOCK'), 1, 'seules les vues à échelle unique sont en blocs');
  const svg = feuilleSVG(F);
  for (const m of st.rebar.marks) assert.ok(svg.includes(`>${m.mark}</text>`), `bulle ${m.mark}`);
});

test('Dalle précontrainte : coffrage seul, le plan de ferraillage passif est refusé', () => {
  const s3 = compute(parseData(donnees(EXEMPLES[2])));
  assert.ok(planCoffrage(s3).vues.length === 4);
  assert.throws(() => planFerraillage(s3), /dalle armée/);
});

test('Ouvrage courbe (exemple 1) : contour courbe, rayon indiqué, niveaux du nivellement', () => {
  const s1 = compute(parseData(donnees(EXEMPLES[0])));
  const F = planCoffrage(s1), svg = feuilleSVG(F);
  assert.ok(/rayon minimal/.test(svg));
  assert.ok(/\+100,[0-9]{2}/.test(svg), 'niveaux NGF');
  const plan = F.vues[0].vue, contour = plan.ents.find(e => e.t === 'poly' && e.ferme && e.calque === 'COFFRAGE');
  assert.ok(contour.pts.length > 40);
});

test('Outils de dessin : hachures et choix d\'échelle', () => {
  const h = hachuresPoly([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
  assert.ok(h.length >= 9 && h.every(([a, b]) => a[0] >= -1e-9 && b[0] <= 10 + 1e-9));
  assert.equal(echelleQuiTient([46, 12], [780, 220]), 75);
});
