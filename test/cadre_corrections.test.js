/**
 * Cadres : corrections postérieures au portage BVTrace — niveaux de la nappe et sous-pression à la sous-face du radier,
 * alternative « à sec » des situations hydrauliques, S du coefficient dynamique (Fascicule 61 art. 5.5), choc sur un piédroit
 * dont la section n'a pas de disposition au catalogue, hauteur de la poussée sismique documentée.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculPicf } from '../src/cadre/picf.js';
import { sousPression, flottaison, chargesEau } from '../src/cadre/hydro.js';
import { chargeFileBc, poidsSystemeB, nombreVoies, coefDynamique } from '../src/cadre/charges61.js';
import { largeurCalc, hauteurCalc } from '../src/cadre/cadre.js';

const proche = (a, b, tol = 1e-9, lab = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${lab} : ${a} ≠ ${b}`);
const G = { ouv: [3, 3], h: 2.5, et: 0.3, er: 0.35, ep: 0.3, ei: 0.25 };

test('Nappe : sous-pression à la sous-face du radier (h + e_r), poussée au-dessus du feuillet moyen (h + e_r/2)', () => {
  proche(sousPression(G, 1.5), 1.5 + 0.35, 1e-12, 'sous-face');
  proche(sousPression(G, 1.5, true), 1.5 + 0.175, 1e-12, 'ancienne convention');
  const s = chargesEau(G, 'videNappe', 0, 1.5);
  proche(s.gB, 1.5 + 0.175, 1e-12, 'poussée au nœud bas');
  proche(s.up, 1.85, 1e-12, 'charge sur le radier');
  const H = 1.2, f = flottaison(G, G.h, H, 1.5, 2.5, 2.0), Lext = largeurCalc(G) + G.ep;
  proche(f.up, 1.85 * Lext, 1e-12, 'sous-pression totale');
  assert.ok(f.fs < flottaison(G, G.h, H, 1.5, 2.5, 2.0, true).fs, 'la correction réduit le coefficient de flottaison');
  // nappe au-dessus de la traverse : pression de tête = ρ (h_w − h_c), h_w compté depuis le feuillet moyen du radier
  const s2 = chargesEau(G, 'videNappe', 0, 4);
  proche(s2.gH, 4 + 0.175 - hauteurCalc(G), 1e-12, 'pression en tête');
});

test('Situations hydrauliques : « à sec, nappe basse » est une alternative du groupe eau (enveloppe jamais réduite)', () => {
  const geom = { n: 2, B: 3, H: 2.5, L: 15, et: 0.3, er: 0.35, ep: 0.3, ei: 0.25, Hr: 1.2 };
  const sec = calculPicf(geom, { sol: 'winkler', nature: 'argile', etat: 'normal' });
  const eau = calculPicf(geom, { sol: 'winkler', nature: 'argile', etat: 'normal', hEau: 1.0 });
  assert.ok(eau.cas.some(c => c.nom === 'Eau — à sec, nappe basse' && c.groupe === 'eau'));
  eau.effets.forEach((e, i) => {
    const s = sec.effets[i];
    assert.ok(e.Mels >= s.Mels - 1e-9 && e.mels <= s.mels + 1e-9, `${e.barre} ${e.ou} : ELS`);
    assert.ok(e.Melu >= s.Melu - 1e-9 && e.melu <= s.melu + 1e-9, `${e.barre} ${e.ou} : ELU`);
  });
  assert.ok(!calculPicf(geom, { hEau: 1.0, compat: 'bvtrace' }).cas.some(c => c.nom.includes('à sec')));
});

test('Coefficient dynamique : S = poids d\'essieux B plaçable (b_c selon le nombre de files, Bt deux voies au plus)', () => {
  assert.equal(chargeFileBc(1.4), 12); assert.equal(chargeFileBc(1.5), 24); assert.equal(chargeFileBc(6.9), 30); assert.equal(chargeFileBc(17), 60);
  assert.equal(nombreVoies(7), 2); assert.equal(nombreVoies(5.5), 2); assert.equal(nombreVoies(15), 5);
  proche(poidsSystemeB(6.9, 2, 1).S, 66, 1e-12, '2 voies, 1re classe : 2 files Bc × 30 t × 1,10');
  proche(poidsSystemeB(6.9, 5, 1).S, 105, 1e-12, '5 voies : 5 × 30 × 0,70');
  const bt = poidsSystemeB(1.5, 1, 1); assert.equal(bt.systeme, 'Bt'); proche(bt.S, 32, 1e-12, 'une voie courte : tandem Bt');
  const geom = { n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 1.5 };
  const r7 = calculPicf(geom, { largeurChargeable: 7 }), r = calculPicf(geom, {});
  const Dext = 3 + 0.3 + 0.3, larg = 3.3;
  proche(poidsSystemeB(Dext, 2, 1).S, 64, 1e-12, '3,60 m de couverture, 2 voies : deux tandems Bt');
  proche(r7.deltaB, coefDynamique(larg, r7.poids, 64, 1), 1e-12, 'δ_B, 2 voies');
  proche(r.deltaB, coefDynamique(larg, r.poids, poidsSystemeB(Dext, 5, 1).S, 1), 1e-12, 'δ_B, largeur chargeable = longueur');
  assert.ok(r.alertes.some(a => a.includes('art. 5.5') && a.includes('S_B')));
});

test('Choc sur un piédroit sans disposition au catalogue : comparé à la section requise, plus à zéro', () => {
  const r = calculPicf({ n: 1, B: 9, H: 5.2, L: 12, Hr: 1 }, {}, { ouvert: 'encastre', usage: { franchie: 'route', portee: 'route' }, gabarit: { hauteur: 4.75 } });
  const sd = r.choc.verifs.filter(v => v.sansDisposition);
  assert.ok(sd.length > 0, 'le cas de la vidéo a bien une section sans disposition');
  for (const v of sd) { assert.ok(v.asFournie > 0); assert.ok(v.okFlexion, `${v.barre} ${v.ou}`); }
  assert.ok(r.choc.verifs.every(v => v.asFournie > 0));
  assert.ok(r.alertes.some(a => a.startsWith('Choc : en ')));
});

test('Séisme, approche A : hauteur H de E.9 et hauteur chargée h_c écrites dans la note', () => {
  const r = calculPicf({ n: 1, B: 3, H: 2.5, L: 15, e: 0.3, Hr: 1.5 }, {}, { seisme: { actif: true, zone: 3, categorie: 'III', classeSol: 'B', approche: 'A' } });
  assert.ok(r.alertes.some(a => a.includes('de la surface du remblai à la base de l\'ouvrage') && a.includes('h_c =')));
});
