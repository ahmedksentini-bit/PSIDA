/** Séisme des ouvrages autres que le pont-dalle : transfert vers « Appuis seuls », export Pont EC8, travées indépendantes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseSupports } from '../src/pipeline.js';
import { parseStandalone, computeStandalone, standaloneState } from '../src/supports/standalone.js';
import { horizontalDistributionIso } from '../src/supports/actions.js';
import { computePhasage, computeMixte } from '../web/phasage_view.js';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { champsAppuisPhasage, champsAppuisPoutres, superstructuresResiduelles } from '../web/transfert_appuis.js';

const d0 = { ...formDefaults(), ap_seisme: 'on' };
const calc = (ch, extra = {}) => { const d = { ...d0, ...ch, ...extra }; return computeStandalone(parseStandalone(d), parseSupports(d)); };
const Gtot = ch => ch.ss_lines.split('\n').reduce((a, l) => a + +l.split(';')[0], 0);

test('transfert : masse sismique = poids permanent (superstructures comptées une fois), nature et inerties du tablier', () => {
  assert.equal(superstructuresResiduelles(1000, 10, 2), 50);
  const cas = [
    ['poutres', champsAppuisPoutres(computePoutres(parsePoutres(formDefaults()))), 'poutres', 'isostatique'],
    ['continues', champsAppuisPhasage(computePhasage({ ph_type: 'poutres' })), 'poutres', undefined],
    ['fléau', champsAppuisPhasage(computePhasage({ ph_type: 'fleau' })), 'caisson', undefined],
    ['mixte', champsAppuisPhasage(computeMixte({ ph_type: 'mixte' })), 'mixte', undefined],
  ];
  for (const [nom, ch, type, cont] of cas) {
    const S = calc(ch).supports.seisme;
    assert.ok(!S.error, `${nom} : ${S.error}`);
    // la masse Pont EC8 est comptée entre axes des culées : écart < 2 % avec ΣG / g
    const r = S.M * 9.81 / Gtot(ch);
    assert.ok(r > 0.98 && r < 1.02, `${nom} : masse / poids = ${r}`);
    assert.equal(S.projet.tablier.type, type, nom);
    assert.equal(S.projet.tablier.continuite, cont, nom);
    assert.ok(S.projet.tablier.inertieVerticale > 0 && S.projet.tablier.inertieTransversale > 0, nom);
  }
});

test('fléau : multimodale (hors domaine du mode fondamental) et appareils à pot quand aucun élastomère ne convient', () => {
  const st = calc(champsAppuisPhasage(computePhasage({ ph_type: 'fleau' })));
  const S = st.supports.seisme;
  assert.equal(S.methode, 'multimodale');
  assert.equal(S.efforts.methode, 'multimodale');
  const L = st.bearings.rows.map(r => r.liaison);
  assert.deepEqual(L.slice(1, 3).sort(), ['fixe', 'glissant'], `liaisons des piles ${L}`);
  assert.equal(st.bearings.notes.length, 2);
  // l'appareil glissant ne reçoit pas d'effort horizontal
  const iG = L.indexOf('glissant');
  assert.equal(S.efforts.appuis[iG].cas[0].Fx, 0);
  assert.ok(st.supports.lines[iG].warnings.some(w => /pot glissants/.test(w)));
  // liaisons saisies : respectées ; nombre incohérent : erreur
  const st2 = calc(champsAppuisPhasage(computePhasage({ ph_type: 'fleau' })), { ss_liaisons: 'glissant, fixe, fixe, glissant' });
  assert.deepEqual(st2.bearings.rows.map(r => r.liaison), ['glissant', 'fixe', 'fixe', 'glissant']);
  assert.throws(() => standaloneState(parseStandalone({ ...d0, ss_liaisons: 'fixe, glissant' }), {}), /liaisons attendues/);
});

test('travées indépendantes : deux rangées d\'appareils par pile, repos d\'appui, répartition horizontale par travée', () => {
  const ch = champsAppuisPoutres(computePoutres(parsePoutres(formDefaults())));
  const st = calc(ch, { ap_pileType: 'colonnes', ap_hc: '1.0', ap_lc: '1.6' });
  assert.deepEqual(st.bearings.rows.map(r => r.nb), [4, 8, 8, 8, 4]);
  const S = st.supports.seisme;
  assert.equal(S.methode, 'travees_independantes');
  assert.equal(S.projet.appuis[1].reposDisponible, 0.775);
  // retrait d'un tablier à travées égales et appareils identiques : effort net nul sur les piles intermédiaires
  // une pile porte deux rangées d'appareils identiques à celle d'une culée : souplesse de la ligne divisée par deux
  const ln = (x, rangees) => ({ x, rangees, sNeo: { inst: 1e-3 / rangees, diff: 2e-3 / rangees }, sApp: { inst: 1e-4, diff: 1e-4 } });
  const D = horizontalDistributionIso([ln(0, 1), ln(30, 2), ln(60, 2), ln(90, 1)]);
  const H = D.imposed(3e-4).H;
  assert.ok(Math.abs(H[1]) < 1e-9 && Math.abs(H[2]) < 1e-9 && Math.abs(H[0] + H[3]) < 1e-9 && H[0] > 0);
  // freinage sur une travée : partagé à parts égales entre ses deux appuis (rangées et appuis identiques)
  const b = D.braking(1);
  assert.ok(Math.abs(b[0] - 0.5) < 1e-9 && Math.abs(b[1] - 0.5) < 1e-9);
});
