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

test('Plan de coffrage : coupes transversales, quantités, DXF et SVG lisibles', () => {
  const F = planCoffrage(st, { projet: 'Essai', numero: 'X-01' });
  assert.ok(['A3', 'A2'].includes(F.format)); assert.equal(F.vues.length, 2);
  const Q = quantitesCoffrage(st);
  // dalle rectangulaire 12 × 0,70 sans chanfreins, longueur 46 + 2 × 0,50 m (abouts) : 394,8 m³
  assert.ok(Math.abs(Q.beton - 12 * 0.7 * 47) < 1e-6, `béton ${Q.beton}`);
  const dxf = feuilleDXF(F), D = lireDXF(dxf);
  assert.deepEqual(D.sections, ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']);
  assert.deepEqual(D.fin, ['0', 'EOF']);
  assert.equal(D.compte('BLOCK'), 2); assert.equal(D.compte('INSERT'), 2);
  assert.equal(D.compte('POLYLINE'), D.compte('SEQEND'));
  const oct = octetsCp1252(dxf); assert.ok(oct.every(b => b < 256));
  assert.ok(!/[^\x00-\xff]/.test(dxf.replace(/[€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '')), 'caractère hors ANSI 1252 non échappé');
  const svg = feuilleSVG(F);
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('TABLIER — COFFRAGE') && svg.includes('Essai'));
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
  assert.ok(planCoffrage(s3).vues.length === 2);
  assert.throws(() => planFerraillage(s3), /dalle armée/);
});

test('Ouvrage courbe (exemple 1) : contour courbe, rayon indiqué, niveaux du nivellement', () => {
  const s1 = compute(parseData(donnees(EXEMPLES[0])));
  const F = planEnsemble(s1), svg = feuilleSVG(F);
  assert.ok(/rayon minimal/.test(svg));
  assert.ok(/\+?10[0-9],[0-9]{2}/.test(svg), 'niveaux NGF');
  const plan = F.vues[0].vue, contour = plan.ents.find(e => e.t === 'poly' && e.ferme && e.calque === 'COFFRAGE');
  assert.ok(contour.pts.length > 40);
});

test('Outils de dessin : hachures et choix d\'échelle', () => {
  const h = hachuresPoly([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
  assert.ok(h.length >= 9 && h.every(([a, b]) => a[0] >= -1e-9 && b[0] <= 10 + 1e-9));
  assert.equal(echelleQuiTient([46, 12], [780, 220]), 75);
});

import { planCoffrageAppui, geometrieAppui, quantitesAppui } from '../src/plans/appuis.js';
import { planEnsemble } from '../src/plans/ensemble.js';
import { planNivellement, niveauxAppui } from '../src/plans/nivellement.js';

test('Appuis : un plan de coffrage par ligne, géométrie et quantités cohérentes', () => {
  for (let i = 0; i < st.deck.beam.x0.length; i++) {
    const A = geometrieAppui(st, i), F = planCoffrageAppui(st, i, { numero: 'A-' + i });
    assert.equal(F.vues.length, 4);
    assert.ok(['A3', 'A2', 'A1'].includes(F.format));
    // niveaux : tête − chevêtre − fût (ou mur) = dessus de semelle ; semelle d'épaisseur h_s
    const Hc = A.kind === 'pile' ? A.H : A.Hm;
    assert.ok(Math.abs(A.zT - A.hc - Hc - A.zDS) < 1e-9 && Math.abs(A.zDS - A.zSS - A.hs) < 1e-9);
    const Q = quantitesAppui(A);
    assert.ok(Math.abs(Q.lignes[0][1] - A.B * A.Lf * A.hs) < 1e-9);
    const D = lireDXF(feuilleDXF(F));
    assert.deepEqual(D.fin, ['0', 'EOF']); assert.equal(D.compte('BLOCK'), 4);
    assert.ok(feuilleSVG(F).includes(`${A.kind === 'culee' ? 'CULÉE' : 'PILE'} ${A.nom}`));
  }
});

test('Appuis de l\'exemple 1 : niveaux du plan de nivellement, pile sur pieux', () => {
  const s1 = compute(parseData(donnees(EXEMPLES[0])));
  const A = geometrieAppui(s1, 2), L = s1.supports.niv.lignes[2];
  assert.ok(A.pieux && A.niv);
  assert.ok(Math.abs(A.zDS - L.zDS) < 1e-6 && Math.abs(A.zSS - L.zSS) < 1e-6);
  const Q = quantitesAppui(A);
  assert.equal(Q.pieux.n, A.nF * A.nP);
  assert.ok(/pointe/.test(feuilleSVG(planCoffrageAppui(s1, 2))));
});

import { planEquipements, lireEquipements, familleJoint, controleCharges, souffleJoints, bordGeom, metreEquipements } from '../src/plans/equipements.js';
import { geometrie } from '../src/plans/geometrie.js';

test('Équipements : familles de joints selon le souffle (Cerema 2016, § 1.3.2)', () => {
  assert.match(familleJoint(0.008), /sous revêtement/);
  assert.match(familleJoint(0.015), /revêtement amélioré/);
  assert.match(familleJoint(0.045), /lèvres/);
  assert.match(familleJoint(0.120), /cantilever/);
});

test('Équipements : géométrie, poids, souffle, métré et feuille dédiée', () => {
  const eq = lireEquipements(formDefaults()), G = geometrie(st);
  const B = bordGeom(G, eq, 1);
  // trottoir côté chaussée, barrière en rive : la barrière assure la fonction de garde-corps, pas de garde-corps séparé
  assert.ok(B.corniche && B.longrine && B.dispositif && B.dispositif.mixte && !B.gardeCorps && B.bordure && B.caniveau);
  // corniche et contre-corniche arasées au même niveau fini
  assert.ok(Math.abs(Math.max(...B.corniche.poly.map(p => p[1])) - B.longrine.top) < 1e-9);
  // trottoir derrière la barrière : garde-corps en rive, alerte si la largeur libre est inférieure à 1,40 m
  const Bb = bordGeom(G, { ...eq, drPos: 'bordure' }, 1);
  assert.ok(Bb.gardeCorps && Bb.longrine.aBordure && !Bb.dispositif.mixte && Bb.alertes.some(t => /1,40/.test(t)));
  // corniche : aire du profil en L = L·t + e·(H − t)
  const C = controleCharges(st, eq);
  const corn = C[0].P.lignes.find(l => l[0] === 'Corniche')[1];
  { const T = B.hFini, nom = 25 * (eq.cornL * T + eq.cornE * T + eq.cornE * (eq.cornH - T)); assert.ok(corn < nom && corn > 0.93 * nom, `corniche ${corn} / ${nom}`); }   // profil réel : chanfreins et larmier;
  assert.ok(C[0].saisi > 0 && C[0].ecart != null);
  const J = souffleJoints(st, eq);
  assert.ok(J.every(j => j.W > 0 && Math.abs(j.W - (2 * j.vT + j.vRF)) < 1e-12));
  const M = metreEquipements(st, eq, G), L = G.uB - G.uA;
  assert.ok(Math.abs(M.find(m => m[0] === 'Corniches')[2] - 2 * L) < 1e-9);
  const F = planEquipements(st, eq, { numero: 'E-1' });
  assert.equal(F.vues.length, 6);   // détails A et B, joint, gargouille, corniche type, schéma d'évacuation
  assert.ok(feuilleSVG(F).includes('FERRAILLAGE TYPE'));
  const svg = feuilleSVG(F), D = lireDXF(feuilleDXF(F));
  assert.ok(svg.includes('TABLIER — ÉQUIPEMENTS') && /joint à revêtement amélioré|joint à lèvres|sous revêtement/.test(svg));
  assert.deepEqual(D.fin, ['0', 'EOF']);
  assert.ok(D.paires.some(p => p[0] === '2' && p[1] === 'EQUIPEMENTS'));
  // coffrage avec équipements : calque EQUIPEMENTS dans les coupes
  const Fc = planCoffrage(st, {}, eq);
  assert.ok(Fc.vues.some(p => p.vue.ents.some(e => e.calque === 'EQUIPEMENTS')));
});

import { plaqueTablier } from '../src/plate/deck.js';
import { statsMaillage, maillageSVG, maillageDXF } from '../web/maillage_view.js';

test('Maillage du modèle en plaque : comptes, SVG et DXF', () => {
  const M = plaqueTablier(st.deck, { h: 0.5, nb: st.bearings.nb, psi: 100, kv: Infinity });
  const S = statsMaillage(M);
  assert.equal(S.noeuds, S.nx * S.ny); assert.equal(S.triangles, 2 * (S.nx - 1) * (S.ny - 1)); assert.equal(S.ddl, 3 * S.noeuds);
  // arêtes d'une grille triangulée : horizontales + verticales + diagonales
  assert.equal(S.aretes, (S.nx - 1) * S.ny + S.nx * (S.ny - 1) + (S.nx - 1) * (S.ny - 1));
  assert.equal(S.appuis, st.bearings.nb * st.deck.beam.x0.length);
  assert.ok(maillageSVG(M, { numeros: true }).includes('>' + S.noeuds + '<'));
  const D = maillageDXF(M);
  assert.equal((D.match(/\r\nLINE\r\n/g) || []).length, S.aretes);
  assert.equal((D.match(/\r\nCIRCLE\r\n/g) || []).length, S.appuis);
});

import { planFerraillageAppui, reperesAppui } from '../src/plans/ferraillageAppuis.js';

test('Ferraillage des appuis : repères, minimums PP 73, bordereau et feuille', () => {
  const v = compute(parseData({ ...formDefaults(), ap_pileType: 'colonnes', ap_hc: '1.0', ap_culType: 'enterree', ap_found: 'pieux' }));
  for (const s of [st, v]) for (let i = 0; i < 2; i++) {
    const { A, marks } = reperesAppui(s, i);
    assert.ok(marks.length >= 5);
    for (const m of marks) { assert.ok(m.L > 0 && m.nombre > 0 && m.masse > 0, `${m.label}`); if (m.req != null && m.prov != null && Number.isFinite(m.req)) assert.ok(m.prov >= m.req - 1e-9, `${m.label} : ${m.prov} < ${m.req}`); }
    // colonnes : au moins 20 cm² par colonne (PP73 1.3.2 § 1.1.2)
    const col = marks.find(m => m.pos === 'verC'); if (col) assert.ok(col.prov >= 20e-4 - 1e-9);
    // chevêtre / sommier : 0,5 % au moins pour l'ensemble des nappes (§ 2.2.5.1)
    const sup = marks.find(m => m.pos === 'chevSup'), inf = marks.find(m => m.pos === 'chevInf');
    if (sup && A.kind === 'pile' && A.lc) assert.ok(sup.prov + inf.prov >= 0.005 * A.lc * A.hc - 1e-9);
    const F = planFerraillageAppui(s, i, { numero: 'F-' + i });
    assert.ok(F.masse > 0 && F.vues.length >= 3);
    const D = lireDXF(feuilleDXF(F)); assert.deepEqual(D.fin, ['0', 'EOF']);
    assert.ok(feuilleSVG(F).includes('PLAN DE FERRAILLAGE'));
  }
});

import { planEquipements as planEq2, lireEquipements as lireEq2 } from '../src/plans/equipements.js';

test('Mise en page automatique : plus petit format, vues sans chevauchement, échelles graphiques', () => {
  const app = compute(parseData({ ...formDefaults(), ap_pileType: 'colonnes', ap_hc: '1.0', ap_culType: 'apparente', ap_culHv: '1.5' }));
  const feuilles = [planCoffrage(st, {}), planFerraillage(st, {}), planEq2(st, lireEq2(formDefaults()), {}), planCoffrageAppui(st, 0, {}), planFerraillageAppui(st, 1, {}), planFerraillageAppui(app, 0, {})];
  for (const F of feuilles) {
    const V = F.valide(); assert.ok(V.ok, F.titre + ' : ' + V.problemes.join(' | '));
    assert.ok(!F.deborde, F.titre + ' : bordereau hors cadre');
    assert.ok(['A3', 'A2', 'A1', 'A0'].includes(F.format));
    // une échelle graphique par vue (deux pour une vue à échelles dilatées) : libellés « 0 » et « m »
    const svg = feuilleSVG(F), nb = F.vues.reduce((s, p) => s + (p.vue.echelleV ? 2 : 1), 0);
    assert.ok((svg.match(/>\d+(,\d+)? m</g) || []).length >= nb, F.titre + ' : échelles graphiques');
  }
  // le coffrage des appuis de l'exemple tient en A2 (au 1/75 au moins)
  assert.equal(feuilles[3].format, 'A2'); assert.ok(feuilles[3].vues[0].vue.echelle <= 75);
  // culée apparente : voile frontal, frettes et aciers d'éclatement sous appareils, sections suffisantes
  const { marks } = reperesAppui(app, 0);
  for (const p of ['vfV', 'vfH', 'fret', 'eclP', 'eclL']) assert.ok(marks.some(m => m.pos === p), p);
  const R = app.supports.lines[0].EC.headChk.split;
  assert.ok(marks.find(m => m.pos === 'fret').prov >= R.As - 1e-12);
  assert.ok(marks.find(m => m.pos === 'eclP').prov >= R.planes[0].Ae - 1e-12);
  assert.ok(marks.find(m => m.pos === 'eclL').prov >= R.planes[1].Ae - 1e-12);
});

test('Plan d\'ensemble, tableau de nivellement, cartouche en bande et format imposé', () => {
  const E = planEnsemble(st, { phase: 'APD', lot: '5', maitreOuvrage: 'Direction X ; Service Y', bureau: 'BET Z' });
  assert.equal(E.vues.length, 2); assert.ok(E.valide().ok, E.valide().problemes.join(' | '));
  assert.equal(E.format, 'A3');
  // vue en plan alignée sur la coupe longitudinale : même échelle, axes des appuis aux mêmes abscisses
  const [p, c] = E.vues; assert.equal(p.vue.echelle, c.vue.echelle);
  const svg = feuilleSVG(E);
  for (const s of ['PHASE', 'APD', 'Direction X', 'Service Y', 'BET Z', 'NOTA :', 'C0', 'P1', 'CARACTÉRISTIQUES']) assert.ok(svg.includes(s), s);
  assert.ok(/stroke-dasharray/.test(svg), 'cadres tiretés');
  // format imposé
  assert.equal(planEnsemble(st, { format: 'A1' }).format, 'A1');
  // nivellement : une ligne par appui, niveaux décroissants de la chaussée au fond de semelle
  const N = planNivellement(st, {}); assert.equal(N.tableaux[0].lignes.length, st.deck.beam.x0.length);
  for (let i = 0; i < st.deck.beam.x0.length; i++) {
    const z = Object.fromEntries(niveauxAppui(geometrieAppui(st, i)).map(([, s, v]) => [s, v]));
    assert.ok(z.Zch > z.Zsf && z.Zsf > z.Zb && z.Zb > z.Zc && z.Zc > z.Zs && z.Zs > z.Zf);
  }
  // le garde-grève ne recouvre jamais le bossage, même avec un about nul
  const A = geometrieAppui(compute(parseData({ ...formDefaults(), overhangs: '0, 0' })), 0); assert.ok(-A.xGGav >= A.ap.a / 2 + 0.05 + 0.10 - 1e-9);
});

test('Pile marteau : fût unique, chevêtre en console, quantités et vue suivant F', () => {
  const m = compute(parseData({ ...formDefaults(), ap_pileType: 'marteau' }));
  const A = geometrieAppui(m, 1);
  assert.ok(A.marteau && A.nCol === 1 && A.hcEnd < A.hc);
  const Q = quantitesAppui(A), ch = Q.lignes.find(l => /console/.test(l[0]))[1];
  assert.ok(ch < A.width * A.lc * A.hc && ch > A.width * A.lc * A.hcEnd);
  const F = planCoffrageAppui(m, 1, {}), svg = feuilleSVG(F);
  assert.ok(svg.includes('VUE SUIVANT F') && F.valide().ok);
  const R = planFerraillageAppui(m, 1, {}); assert.ok(R.masse > 0 && R.valide().ok);
});

test('Anti-cheminement : détail et note quand σ_min < 2 MPa', () => {
  const s2 = compute(parseData(formDefaults()));
  const sel = s2.bearings.rows[1].sel; sel.antiCheminement = true; sel.sigMin = 1.6;
  const F = planCoffrageAppui(s2, 1, {}), svg = feuilleSVG(F);
  assert.ok(svg.includes('DISPOSITIF ANTI-CHEMINEMENT') && /dispositif nécessaire/.test(svg) && F.valide().ok);
  assert.ok(/dispositif non nécessaire/.test(feuilleSVG(planCoffrageAppui(compute(parseData(formDefaults())), 1, {}))));
});

import { planRetenueTypes } from '../src/plans/retenue.js';
test('Dispositifs de retenue : plans types (raccordement, extrémités, queue de carpe aval seulement)', () => {
  const F = planRetenueTypes(st, lireEquipements(formDefaults()), {}), svg = feuilleSVG(F);
  assert.equal(F.vues.length, 5); assert.ok(F.valide().ok, F.valide().problemes.join(' | '));
  for (const t of ['RACCORDEMENT', 'ENFOUIE', 'ABAISSÉE', 'AVAL UNIQUEMENT', 'Interdite en extrémité amont']) assert.ok(svg.includes(t), t);
});
