// Pont mixte, structure achevée : lignes d'influence, répartition, thermique, âme efficace, voilement, goujons — recoupements
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PoutreContinue, enveloppe, repartition, chargesPoutre } from '../src/mixte/trafic.js';
import { sectionEfficace, cisaillement, verifierMixte } from '../src/mixte/verifs.js';
import { computeMixte } from '../web/phasage_view.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);
const xs = Array.from({ length: 81 }, (_, i) => i * 0.25), P2 = new PoutreContinue(xs, new Array(80).fill(1e6), [0, 10, 20]);

test('poutre continue à deux travées : lignes d\'influence (tables classiques) et courbure imposée', () => {
  near(enveloppe(xs, P2.ligneM(10), { q: 1 }).min, -12.5, 0.005, 'M_appui = −qL²/8 (deux travées chargées)');
  near(P2.ligneM(5)[20], 0.203125 * 10, 1e-6, 'η M(L/2) sous charge à L/2 : 13/64 L');
  near(P2.ligneR(1)[20], 0.6875, 1e-6, 'réaction centrale, charge à L/2 : 11/16');
  near(enveloppe(xs, P2.ligneV(0, 'd'), { q: 1 }).max, 0.4375 * 10, 0.002, 'V à l\'about (travée seule chargée) : 7/16 qL');
  // courbure imposée uniforme κ : M_appui = −3/2 EI κ (signe : la courbure positive tend le bas)
  near(P2.momentsCourbure(new Array(80).fill(1e-5))[40], -1.5 * 1e6 * 1e-5, 1e-6, 'moment hyperstatique');
});

test('répartition transversale : levier (bipoutre) et Courbon', () => {
  const lev = repartition([-3, 3], 1);
  near(lev(0), 0.5, 1e-12, 'axe'); near(lev(3), 1, 1e-12, 'sur la poutre'); near(lev(4.5), 1.25, 1e-12, 'console');
  const co = repartition([-4.5, -1.5, 1.5, 4.5], 3);
  near(co(4.5), 0.25 + 4.5 * 4.5 / 45, 1e-12, 'Courbon');
  const C = chargesPoutre([-3, 3], 1, { y1: -4.25, y2: 4.25 });
  near(C.Q, 300 * (0.5 + 2.75 / 6) + 200 * (0.5 - 0.25 / 6), 1e-9, 'tandems équivalents');
});

test('âme efficace EN 1993-1-5 § 4.4 : λ̄_p et ρ recoupés à la main', () => {
  // section symétrique en moment négatif, sans armatures : âme en flexion (ψ ≈ −1), k_σ(ψ) puis ρ = (λ̄ − 0,055 (3 + ψ))/λ̄²
  const G = { bfi: 0.6, tfi: 0.04, hw: 2.0, tw: 0.012, bfs: 0.6, tfs: 0.04, hg: 0, hc: 0.25, beff: 3, Asup: 0, Ainf: 0, nuance: 'S355', fck: 35 };
  const e = sectionEfficace(G, -1, 'fissuree', 6), lam = 2.0 / 0.012 / (28.4 * Math.sqrt(235 / 355) * Math.sqrt(e.k));
  near(e.lam, lam, 1e-9, 'λ̄_p');
  assert.ok(e.classe4 && e.rho < 1 && e.I < e.brut.I);
  near(e.rho, (lam - 0.055 * (3 + e.psi)) / lam ** 2, 1e-9, 'ρ');
});

test('voilement par cisaillement EN 1993-1-5 § 5.3 : χ_w = 0,83/λ̄_w', () => {
  const g = { hw: 2.3, tw: 0.020 }, a = 6, r = cisaillement(g, 345, a);
  const kt = 5.34 + 4 * (2.3 / 6) ** 2, lam = 2.3 / (37.4 * 0.020 * Math.sqrt(235 / 345) * Math.sqrt(kt));
  near(r.lam, lam, 1e-9, 'λ̄_w'); near(r.chi, 0.83 / lam, 1e-9, 'χ_w');
  near(r.Vb, 0.83 / lam * 345 * 2.3 * 0.020 / Math.sqrt(3) / 1.1 * 1000, 1e-9, 'V_bw,Rd');
});

test('pont mixte par défaut (45-60-45 m) : toutes les vérifications satisfaites, réactions = poids', () => {
  const M = computeMixte({ ph_type: 'mixte' }), v = M.v;
  assert.ok(v.ok, v.verifs.filter(q => !q.ok).map(q => q.nom).join(', '));
  // goujons Ø22 × 200, f_u = 450 : P_Rd = min(0,8 f_u π d²/4 ; 0,29 d² √(f_ck E_cm))/1,25
  const Ecm = 22000 * (43 / 10) ** 0.3, PRd = Math.min(0.8 * 450 * Math.PI * 0.022 ** 2 / 4, 0.29 * 0.022 ** 2 * Math.sqrt(35 * Ecm)) / 1.25 * 1000;
  near(v.PRd, PRd, 1e-9, 'P_Rd');
  // somme des réactions permanentes = poids du tablier (n poutres) : comparaison avec la somme des charges du modèle
  const poids = M.modele.phases.flatMap(ph => ph.charges || []).reduce((s, c) => { const b = M.modele.barres[c.barre], L = M.modele.noeuds[b.j][0] - M.modele.noeuds[b.i][0]; return s + c.w * L; }, 0) * M.p.nPoutres;
  near(v.reactions.reduce((s, q) => s + q.G, 0), poids, 1e-6, 'équilibre vertical');
  // trafic : sur la pile, ∑η tandem ≈ 2 (deux essieux près de l'appui)
  assert.ok(v.reactions[1].infTS > 1.9 && v.reactions[1].infTS <= 2.01);
});
