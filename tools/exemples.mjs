/**
 * Exemples traités du manuel (partie « Exemples traités ») : quatre projets complets, enregistrés dans exemples/ au format
 * d'un projet PSIDA (bouton « Ouvrir »), avec leurs DXF de tracé. `node tools/exemples.mjs` régénère les fichiers.
 */
import { writeFileSync } from 'node:fs';
import { formDefaults } from './formdefaults.mjs';
import { dxfClothoides, dxfCourbe } from './dxf_courbe.mjs';
import { analyserDXF } from '../web/trace_view.js';

const trace = (txt, nom) => {
  const r = analyserDXF(txt);
  return { spans: r.spans.map(L => +L.toFixed(3)).join(', '), psi: String(Math.round(r.psiMin)), methodeTablier: 'plaque',
    trace: JSON.stringify({ segments: r.axe.seg.map(({ s0, L, ...g }) => g), s0: r.stations[0].s, source: nom, stations: r.stations.map(s => +s.s.toFixed(4)), ...(r.psiLignes.some(p => p !== 100) ? { psiLignes: r.psiLignes } : {}) }) };
};

// --- Exemple 1 : pont-dalle armé courbe (clothoïdes + arc R = 120 m), dévers unique rattrapé par la dalle, plan de nivellement
const dxf1 = dxfClothoides({ forme: 'poly', pas: 1, R: 120, Lc: 30, La: 20, L1: 10, L2: 10, stations: [15, 29, 47, 61], lAppui: 13 });
const ex1 = { nom: 'Exemple 1 — Pont-dalle armé courbe, dévers unique, plan de nivellement', dxf: ['exemple1_trace.dxf', dxf1], data: {
  ...trace(dxf1, 'exemple1_trace.dxf'),
  width: '11', h: '0.75', roadway: '-4.5, 4.5', footways: '-5.5,-4.5 ; 4.5,5.5', lines: '5 @ -5.4 ; 5 @ 5.4 ; 6.5 @ -4.8 ; 6.5 @ 4.8 ; 5 @ -5 ; 5 @ 5', bands: '2.6 sur -4.5,4.5',
  ys: '-5.5, -4, -2.5, -1, 0, 1, 2.5, 4, 5.5', devers: '2.5', devProfil: 'unique', devMode: 'dalle',
  niv_actif: 'on', niv_zCh: '100.30; 100.60; 101.00; 101.30', niv_zTN: '98.80; 96.20; 95.80; 99.00', niv_zDS: '97.40; 94.80; 94.20; 97.60',
  niv_zSS: '96.40; 93.80; 93.00; 96.60', niv_zPP: '; ; 80.00; ', niv_type: 'superficielle; superficielle; pieux; superficielle', niv_B: '3.5; 4.0; 4.0; 3.5', overhangs: '0.5, 0.5',
} };

// --- Exemple 2 : pont-dalle armé biais 70 gr, 4 travées, piles en rivière sur pieux
const ex2 = { nom: 'Exemple 2 — Pont-dalle biais (70 gr) sur rivière, fondations sur pieux', data: {
  spans: '12, 16, 16, 12', width: '10', h: '0.75', overhangs: '0.5, 0.5', psi: '70', methodeTablier: 'plaque', roadway: '-4, 4', footways: '-5,-4 ; 4,5',
  lines: '5 @ -4.9 ; 5 @ 4.9 ; 6.5 @ -4.3 ; 6.5 @ 4.3', bands: '2.6 sur -4,4', ys: '-5, -3.5, -2, -1, 0, 1, 2, 3.5, 5',
  ap_eau: 'on', ap_hEau: '3.5', ap_vEau: '2.5', ap_eauLignes: '2, 3, 4', ap_hGen: '1.0', ap_found: 'pieux', ap_pileH: '7', ap_Lpile: '18', ap_B: '4.0', ap_hs: '1.3', brgCul: '300×400×5(10+3)',
  ap_profAssign: 'SP1, SP1, SP2, SP2, SP1',
} };

// --- Exemple 3 : pont-dalle précontraint 4 travées 18 + 25 + 25 + 18 m (PSI-DP)
const ex3 = { nom: 'Exemple 3 — Pont-dalle précontraint 18 + 25 + 25 + 18 m', data: {
  spans: '18, 25, 25, 18', width: '12', h: '0.95', overhangs: '0.5, 0.5', hEdge: '0.35', joue: '2.5', typeDalle: 'DP', bp_actif: 'on', methodeTablier: 'guyon', ap_pileH: '8', ap_B: '5.0', ap_hs: '1.2', ap_De: '1.5', ap_bosFck: '35',
  ap_profAssign: 'SP1, SP1, SP2, SP2, SP1',
} };

// --- Exemple 4 : pont-dalle précontraint courbe (R = 150 m) à lignes d'appui parallèles (franchissement d'une voie droite)
const dxf4 = dxfCourbe({ R: 150, Larc: 70, L1: 10, L2: 10, stations: [12, 32, 58, 78], lAppui: 14, parallele: Math.PI / 2 });
const ex4 = { nom: 'Exemple 4 — Pont-dalle précontraint courbe et biais', dxf: ['exemple4_trace.dxf', dxf4], data: {
  ...trace(dxf4, 'exemple4_trace.dxf'), width: '12', h: '1.00', overhangs: '0.75, 0.75', hEdge: '0.35', joue: '2.5', typeDalle: 'DP', bp_actif: 'on', ap_pileH: '7', brgPile: '450×600×4(12+3)', ap_B: '5.0', ap_hs: '1.2', ap_De: '1.5', ap_bosFck: '35',
} };

export const EXEMPLES = [ex1, ex2, ex3, ex4];
export const donnees = ex => ({ ...formDefaults(), ...ex.data });

if (process.argv[1] && process.argv[1].endsWith('exemples.mjs')) {
  EXEMPLES.forEach((ex, k) => {
    writeFileSync(`exemples/exemple${k + 1}.json`, JSON.stringify({ format: 'psida-projet', nom: ex.nom, data: donnees(ex) }, null, 1));
    if (ex.dxf) writeFileSync(`exemples/${ex.dxf[0]}`, ex.dxf[1]);
  });
  console.log('exemples écrits');
}
