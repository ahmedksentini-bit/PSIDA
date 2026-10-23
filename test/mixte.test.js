/**
 * Ponts mixtes (src/mixte) : propriétés de section recoupées par des calculs indépendants, moment plastique par
 * équilibre fermé, classes des parois (EN 1993-1-1 tableau 5.2), largeur efficace (EN 1994-2 § 5.4.1.2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proprietes, momentPlastique, classeSection, fyEpaisseur, largeurEfficace, longueursEquivalentes, equivalence } from '../src/mixte/section.js';

const proche = (a, b, tol, lab) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${lab} : ${a} ≠ ${b}`);
// poutre symétrique (tôles ≤ 16 mm : f_y = 355 MPa), dalle 3,0 × 0,25 m, sans gousset
const G = { bfi: 0.5, tfi: 0.016, hw: 1.2, tw: 0.012, bfs: 0.5, tfs: 0.016, hg: 0, beff: 3.0, hc: 0.25, Asup: 0, Ainf: 0, fck: 35, nuance: 'S355' };

test('Épaisseurs et limites d’élasticité (EN 10025-2) ; coefficients d’équivalence (EN 1994-2 § 5.4.2.2)', () => {
  assert.deepEqual([16, 20, 40, 41, 63, 70].map(t => fyEpaisseur('S355', t)), [355, 345, 345, 335, 335, 325]);
  const n = equivalence(34000, 2);
  proche(n.n0, 210000 / 34000, 1e-12, 'n0'); proche(n.permanent, n.n0 * (1 + 1.1 * 2), 1e-12, 'nL permanent'); proche(n.retrait, n.n0 * 2.1, 1e-12, 'nL retrait');
});

test('Propriétés élastiques : acier seul, mixte (n), fissurée — section transformée calculée à part', () => {
  const H = 1.232, Aa = 2 * 0.5 * 0.016 + 1.2 * 0.012, Ia = 0.012 * 1.2 ** 3 / 12 + 2 * (0.5 * 0.016 ** 3 / 12 + 0.008 * (0.6 + 0.008) ** 2);
  const a = proprietes(G, 'acier'); proche(a.A, Aa, 1e-12, 'A'); proche(a.yG, H / 2, 1e-12, 'yG'); proche(a.I, Ia, 1e-12, 'I');
  const n = 6.5, Ac = 3 * 0.25 / n, yc = H + 0.125, A = Aa + Ac, yG = (Aa * H / 2 + Ac * yc) / A;
  const I = Ia + Aa * (H / 2 - yG) ** 2 + 3 * 0.25 ** 3 / 12 / n + Ac * (yc - yG) ** 2;
  const m = proprietes(G, 'mixte', n); proche(m.yG, yG, 1e-12, 'yG mixte'); proche(m.I, I, 1e-12, 'I mixte');
  const g2 = { ...G, Asup: 0.003, csup: 0.05 }, f = proprietes(g2, 'fissuree'), ys = H + 0.25 - 0.05;
  proche(f.yG, (Aa * H / 2 + 0.003 * ys) / (Aa + 0.003), 1e-12, 'yG fissurée');
});

test('Moment plastique positif (axe neutre dans la dalle) et négatif (axe neutre dans l’âme) : équilibres fermés', () => {
  // positif : tout l'acier tendu, F = A_a f_y ; hauteur de béton comprimé z = F / (0,85 f_ck/1,5 · b)
  const Aa = 2 * 0.5 * 0.016 + 1.2 * 0.012, F = Aa * 355e3, fcd = 0.85 * 35 / 1.5 * 1000, z = F / (fcd * 3);
  assert.ok(z < 0.25);
  const Mp = momentPlastique(G, 1); proche(Mp.M, F * (1.232 + 0.25 - z / 2 - 1.232 / 2), 1e-6, 'M_pl+'); proche(Mp.yp, 1.232 + 0.25 - z, 1e-6, 'axe neutre');
  // négatif : armatures A_s tendues + acier ; axe neutre yp dans l'âme : F_s + f_y [b t + t_w (H − t − yp)] = f_y [b t + t_w (yp − t)]
  const g = { ...G, Asup: 0.006, csup: 0.05 }, Fs = 0.006 * 500e3 / 1.15, fy = 355e3;
  const yp = (Fs / fy + 0.012 * (1.232 - 0.016) + 0.012 * 0.016) / (2 * 0.012);
  const Mn = momentPlastique(g, -1); proche(Mn.yp, yp, 1e-6, 'axe neutre négatif');
  // moment autour de yp
  const t = 0.016, M = Fs * (1.432 - yp) + fy * 0.5 * t * (1.232 - t / 2 - yp) + fy * 0.012 * (1.232 - t - yp) ** 2 / 2
    + fy * 0.012 * (yp - t) ** 2 / 2 + fy * 0.5 * t * (yp - t / 2);
  proche(Mn.M, M, 1e-6, 'M_pl−');
});

test('Classes des parois (EN 1993-1-1 tableau 5.2) et largeur efficace (EN 1994-2 § 5.4.1.2)', () => {
  // moment positif, axe neutre dans la dalle : âme entièrement tendue, semelle supérieure connectée → classe 1
  assert.equal(classeSection(G, 1).classe, 1);
  // moment négatif : âme mince (c/t = 100) → classe 4 ; âme épaisse (c/t = 30) → classe 1
  assert.equal(classeSection({ ...G, Asup: 0.006 }, -1).ame, 4);
  assert.equal(classeSection({ ...G, Asup: 0.006, tw: 0.040 }, -1).ame, 1);
  // semelle inférieure comprimée : c/t = (0,5 − 0,012)/2/0,016 = 15,25 > 14ε → classe 4
  assert.equal(classeSection({ ...G, Asup: 0.006, tw: 0.040 }, -1).semelle, 4);
  const Le = longueursEquivalentes([60, 80, 60]);
  assert.deepEqual(Le.travees.map(v => +v.toFixed(6)), [51, 56, 51]); assert.deepEqual(Le.appuis, [35, 35]);
  const b = largeurEfficace({ b0: 0.4, b1: 3.0, b2: 2.5, Le: 16 }); proche(b.beff, 0.4 + 2 + 2, 1e-12, 'b_eff plafonné à Le/8');
});

// ---------------------------------------------------------------- pont bipoutre par phases
import { calculPhasage } from '../src/phasage/phasage.js';
import { bipoutre, DEFAUTS_BIPOUTRE, lireBipoutre } from '../src/mixte/bipoutre.js';
import { betonEC2 } from '../src/phasage/fluage.js';

test('Bipoutre : charpente seule (section constante) = poutre continue — équation des trois moments ; équilibre des plots', () => {
  const p = { ...lireBipoutre({}), appui: { ...DEFAUTS_BIPOUTRE.travee }, fissuration: false };
  const { modele, reperes: R } = bipoutre(p), r = calculPhasage(modele);
  const k0 = r.finPhase[0] - 0, pas0 = r.pas[r.pas.findIndex(q => q.phase === 0)];
  // w uniforme, travées L1, L2, L3, EI constant : 2(L1+L2) M1 + L2 M2 = −w(L1³+L2³)/4 ; L2 M1 + 2(L2+L3) M2 = −w(L2³+L3³)/4
  const [L1, L2, L3] = p.L, w = R.aT.A * p.gAcier * p.majAcier;
  const a = 2 * (L1 + L2), b = L2, c = L2, d = 2 * (L2 + L3), r1 = -w * (L1 ** 3 + L2 ** 3) / 4, r2 = -w * (L2 ** 3 + L3 ** 3) / 4;
  const M1 = (r1 * d - b * r2) / (a * d - b * c);
  const kE = R.iAcier[p.nb - 1], bb = modele.barres[kE], Lb = modele.noeuds[bb.j][0] - modele.noeuds[bb.i][0];
  assert.ok(Math.abs(pas0.barres[kE].M(Lb) - M1) <= 1e-6 * Math.abs(M1), `M sur P1 : ${pas0.barres[kE].M(Lb)} ≠ ${M1}`);
  void k0;
  // fin de calcul : somme des réactions = poids total (acier + plots + superstructures)
  const poids = modele.phases.flatMap(ph => ph.charges || []).reduce((s0, c0) => { const q = modele.barres[c0.barre]; return s0 + c0.w * (modele.noeuds[q.j][0] - modele.noeuds[q.i][0]); }, 0);
  const R0 = r.final.reactions.filter((_, i) => i % 3 === 1).reduce((s0, v) => s0 + v, 0);
  assert.ok(Math.abs(R0 - poids) < 1e-6 * poids, `réactions ${R0} ≠ poids ${poids}`);
});

test('Bipoutre : retrait de la dalle (travée isostatique) — moteur ≈ méthode n_L de l’EN 1994-2 § 5.4.2.2 (ψ_L = 0,55)', () => {
  const p = { ...lireBipoutre({}), L: [40], fissuration: false, gSup: 0 };
  const { modele, reperes: R } = bipoutre(p);
  for (const ph of modele.phases) ph.charges = [];   // retrait seul
  for (const [k, b] of Object.entries(modele.betons)) if (k.startsWith('D')) modele.betons[k] = { ...b, tCoulage: b.tCoulage };
  const r = calculPhasage(modele), k = R.iDalle[p.nb / 2 - 1], N = r.final.barres[k].N;
  // EN 1994-2 : effort de retrait N_cs = ε_cs (E_a/n_L) A_c appliqué au c.d.g. de la dalle de la section mixte (n_L)
  const plotT = Object.keys(modele.betons).find(q => q.startsWith('D')), bc = betonEC2(modele.betons[plotT]);
  const t0 = 1, tf = p.dates.fin - modele.betons[plotT].tCoulage, ecs = bc.retrait(tf) - bc.retrait(t0);
  const phi = bc.phi(tf, t0), n0 = 210000 / bc.Ecm, nL = n0 * (1 + 0.55 * phi);
  const Ac = R.beffTravee[0] * p.hc, Ncs = -ecs * 210000e3 / nL * Ac;   // traction de retenue (kN, positif)
  // redistribution dans la section mixte homogénéisée à n_L : effort résiduel de la dalle = N_cs (1 − A_c/n_L/A − A_c/n_L·z²/I)
  const Aa = R.aT.A, Ia = R.aT.I, zc = modele.barres[k].e, Acn = Ac / nL;
  const A = Aa + Acn, yG = Acn * zc / A, I = Ia + Aa * yG ** 2 + Acn * (zc - yG) ** 2;
  const Nd = Ncs * (1 - Acn / A - Acn * (zc - yG) ** 2 / I);
  assert.ok(N > 0, 'dalle tendue par son retrait gêné');
  assert.ok(Math.abs(N - Nd) <= 0.08 * Nd, `N moteur ${N.toFixed(0)} kN, méthode n_L ${Nd.toFixed(0)} kN`);
});
