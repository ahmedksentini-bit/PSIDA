/** v0.99.31 : murs en aile des cadres et portiques (guide Sétra 1992 § 2.8.1, mur en T renversé). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCadre, computeCadre } from '../src/cadre/run.js';
import { anglesEsthetiques, calculMurAile, mursEnAile, choixAile, aireHA } from '../src/cadre/murs_aile.js';
import { ailesCadre, reperesAiles, planMursAile } from '../src/plans/murs_aile.js';
import { feuilleSVG } from '../src/plans/svg.js';

const base = { cf_type: 'picf', cf_n: '1', cf_B: '3', cf_H: '2.5', cf_L: '15', cf_biais: '100', cf_Hr: '1.5' };
const cadre = d => computeCadre(parseCadre({ ...base, ...d }));

test('Proposition esthétique du guide (§ 2.8.1, en grades) : α = β = 13,743° pour L = 3 m, ouvrage droit', () => {
  const a = anglesEsthetiques(3, 90);
  assert.ok(Math.abs(a.alpha - 13.743) < 1e-9 && Math.abs(a.beta - 13.743) < 1e-9);
  const b = anglesEsthetiques(3, 63);                                    // 70 gr
  assert.ok(Math.abs(b.beta - 0.9 * 0.008 * (70 + 25) * 15.27) < 1e-9 && b.beta < b.alpha);
});

test('Ailes : quatre géométries distinctes, β au coin aigu, longueur = chute de l\'arête / pente + 0,20 m', () => {
  const geo = { W: 3.7, Lo: 3, L: 15, zT: 3.2, er: 0.35, biais: 63 };
  const R = mursEnAile(geo, { m: 1.5, ht: 0.30, hmin: 0.50, c: 0.05, h: { code: 'BAEL', fc28: 25, fe: 400, sigmaS: 201.6 } });
  assert.equal(R.ailes.length, 4);
  const aigus = R.ailes.filter(a => a.aigu);
  assert.equal(aigus.length, 2);
  for (const a of R.ailes) {
    assert.ok(Math.abs(a.theta - (a.aigu ? R.prop.beta : R.prop.alpha)) < 1e-9);
    assert.ok(Math.abs(a.Lw - ((a.zTop0 - (0.35 + 0.50)) / a.pente + 0.20)) < 1e-9);
  }
  // ouvrage droit, θ = 0 (prolongement des piédroits) : pente 1/m le long du mur
  const D = mursEnAile({ ...geo, biais: 90 }, { angle: 0, m: 1.5, c: 0.05, h: { code: 'BAEL', fc28: 25, fe: 400, sigmaS: 201.6 } });
  D.ailes.forEach(a => assert.ok(Math.abs(a.pente - 1 / 1.5) < 1e-12));
});

test('Mur en T renversé : moments de poussée, aciers, stabilité (≥ 1,5), tiers central, portance', () => {
  const h = { code: 'BAEL', fc28: 25, fe: 400, sigmaS: 201.6 };
  const K = calculMurAile(3.0, { Ka: 0.33, gamma: 20, q: 10, c: 0.05, es: 0.40, h });
  assert.ok(Math.abs(K.voile.Mg - 0.33 * 20 * 27 / 6) < 1e-9 && Math.abs(K.voile.Mq - 0.33 * 10 * 9 / 2) < 1e-9);
  assert.ok(K.voile.main.As >= K.voile.As - 1e-9 && K.voile.T.ok);
  assert.ok(K.voile.horiz.As >= 0.25 * K.voile.main.As - 1e-9);
  const S = K.semelle;
  assert.ok(S.FSr >= 1.5 && S.FSg >= 1.5 && Math.abs(S.ex) <= S.B / 6 + 1e-9 && K.ok);
  const Q = calculMurAile(3.0, { Ka: 0.33, gamma: 20, q: 10, c: 0.05, es: 0.40, h, qadm: 72 });
  assert.ok(Q.semelle.B > S.B && Q.semelle.qref <= 72 + 1e-9 && Q.ok);
  const E = calculMurAile(3.0, { Ka: 0.33, gamma: 20, q: 10, c: 0.05, es: 0.40, h: { code: 'EC2', fc28: 30, fe: 500, exposition: 'XC2-XC4' } });
  assert.ok(E.ok && E.voile.wk <= 0.30 + 1e-9);
  assert.equal(choixAile(aireHA(12, 0.20) - 0.01).phi, 12);
});

test('Plan des murs en aile : PICF droit, biais, portique, plusieurs cellules ; bordereau des quatre ailes', () => {
  for (const d of [{}, { cf_biais: '70' }, { cf_type: 'pipo', cf_H: '3.5', cf_code: 'EC2' }, { cf_n: '4', cf_B: '2.5' }]) {
    const c = cadre(d), F = planMursAile(c, {});
    assert.ok(F.valide().ok, JSON.stringify(d));
    const A = F.ailes, marks = A.marks;
    assert.ok(marks.length >= 7 && marks.every(m => m.L <= 12000 && m.nombre > 0));
    assert.ok(F.masse > 0);
    const svg = feuilleSVG(F);
    assert.match(svg, /MURS EN AILE/); assert.match(svg, /ÉLÉVATION DÉVELOPPÉE/); assert.match(svg, /COUPE A-A/);
  }
  // ouvrage droit : quatre ailes identiques, repères cumulés par quatre
  const A = ailesCadre(cadre({})), marks = reperesAiles(A);
  assert.ok(A.ailes.every(a => Math.abs(a.Lw - A.ailes[0].Lw) < 1e-9));
  assert.equal(marks.find(m => m.pos === 'uT').nombre % 4, 0);
  // portique : semelle du mur sous le terrain naturel
  const P = ailesCadre(cadre({ cf_type: 'pipo' }));
  assert.ok(P.geo.er >= P.calc.es - 1e-9);
  // murs non demandés
  assert.equal(ailesCadre(cadre({ cf_ailes: 'non' })), null);
});

test('v0.99.32 — abaque e_m des murs en aile (DT422 p. 75) et semelle de l\'épaisseur du mur à sa base', async () => {
  const { epaisseurAbaque, ABAQUE_EM } = await import('../src/cadre/murs_aile.js');
  // axe des murs en aile = axe des murs en retour + 0,50 m ; points numérisés
  assert.ok(Math.abs(epaisseurAbaque(6.5, 25, 'aile') - 0.363) < 1e-9);
  assert.ok(Math.abs(epaisseurAbaque(6.0, 25, 'retour') - 0.363) < 1e-9);
  assert.ok(Math.abs(epaisseurAbaque(8.0, 20, 'aile') - 0.545) < 1e-9);
  assert.ok(epaisseurAbaque(7, 20) > epaisseurAbaque(7, 25));
  assert.equal(epaisseurAbaque(7, 30), epaisseurAbaque(7, 25));          // au-delà de 25 MPa : courbe 25 MPa
  for (const T of Object.values(ABAQUE_EM)) for (let k = 1; k < T.length; k++) assert.ok(T[k][1] > T[k - 1][1]);
  const h = { code: 'BAEL', fc28: 25, fe: 400, sigmaS: 201.6 };
  const K = calculMurAile(7, { c: 0.05, es: 0.5, h, fruit: 0.0 });
  assert.ok(K.eB >= K.em - 1e-9 && K.em > K.eFruit);                     // l'abaque gouverne sans fruit
  const A = ailesCadre(cadre({}));
  assert.ok(Math.abs(A.calc.es - A.calc.eB) < 0.006);                    // semelle = épaisseur à la base
});
