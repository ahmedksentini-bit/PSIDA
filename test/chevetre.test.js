/**
 * Annexe 4 du guide de calcul PSIDP-EL (SETRA 1985) : répartition des réactions entre appareils d'appui et chevêtres
 * incorporés ; coefficients d'inégalité de la note modèle PSIDP.EL (p. 52) ; valeurs du mémoire « programme PSI DA »
 * (ligne de 4 appareils à 2,40 m, c = 1,55 m, B = 10,30 m).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annexe4Shape, annexe4D, annexe4Reactions, chevetreMoments, chevetreMomentPSIDP } from '../src/chevetre.js';
import { inequalityCoefficients, bearingSpacing } from '../src/bearings.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : réf ${b}, outil ${a.toFixed(4)}`);

test('Annexe 4 — coefficients s(α), t(α), u et parts des appareils de rive et central (mémoire PSI DA)', () => {
  const g = { B: 10.30, n: 4, a: 2.40, c: 1.55 };
  const sh = annexe4Shape(g);
  rel(sh.s, -1.735, 1e-3, 's(α)'); rel(sh.t, 0.92927, 2e-4, 't(α)'); rel(sh.u, 0.12076, 2e-3, 'u');
  rel(annexe4D({ ...g, L: 13.68 }), 5.15, 1e-9, 'd = min(B/2, L)');
  // rapports rive/centre des réactions de la note : CP 1,155 / 0,906 ; A 0,462 / 0,348 (L = about + demi-travée = 13,68 m)
  const cp = annexe4Reactions({ ...g, L: 13.68, Sg: 1 });
  rel(cp.R1 / cp.R2, 1.155 / 0.906, 1e-3, 'CP rive/centre');
  const A = annexe4Reactions({ ...g, L: 13.68, Sg: 0, cases: [{ type: 'A', Sq: 1, k2: 2 * 4.25 }] });
  rel(A.R1 / A.R2, 0.462 / 0.348, 1e-3, 'A rive/centre');
  // § 8 : appareils latéraux très voisins des bords (λ ≤ 0,05) : u(α) = (α − 0,9)/(3,15 α + 0,018) ; courbe : u(0,10) ≈ −2,4
  rel(annexe4Shape({ B: 10, n: 4, a: 1, c: 0.4 }).u, (0.1 - 0.9) / (3.15 * 0.1 + 0.018), 1e-12, 'u bords libres');
  // 3 appareils : t₁ = 0,25 (1 + t), t₂ = 0,5 (1 − t) ; somme 2 t₁ + t₂ = 1
  const s3 = annexe4Shape({ B: 10.343, n: 3, a: 3.56, c: 1.61 });
  rel(2 * s3.rive + s3.central, 1, 1e-12, 'équilibre 3 appareils');
});

test('Annexe 4 — chevêtre : bandes de ferraillage et moments locaux (mémoire PSI DA)', () => {
  const g = { B: 10.30, n: 4, a: 2.40, c: 1.55, L: 13.68 };
  const ch = chevetreMoments({ ...g, Sg: 4000, cases: [{ type: 'A', Sq: 1300, k2: 8.5 }], simultaneous: false });
  ch.bands.top.map(b => b.width).forEach((w, i) => rel(w, [1.60, 3.10, 4.80][i], 1e-9, `largeur de bande ${i + 1}`));
  rel(ch.mc, ch.Mc / (1.5 * 1.55), 1e-12, 'm_c⁻ = M_c⁻/(1,5 c)');
  rel(0.605 / (1.5 * 1.55), 0.260, 2e-3, 'mémoire : m_c⁻ = 0,260 MN·m/m pour M_c⁻ = 0,605');
  // charge uniforme seule : console M_c⁻ = q c²/2
  const u = chevetreMoments({ ...g, Sg: 1030, cases: [] });
  rel(u.Mc, (1030 / 10.30) * 1.55 ** 2 / 2, 1e-6, 'console sous charge uniforme');
});

test('Note PSIDP.EL p. 52 — coefficients d\'inégalité de répartition (3 et 4 appareils) et moment de chevêtre', () => {
  const ref = { 3: { CP: 1.033, A: 1.354, B: 2.055, Mc: 1.822, e: 3.56 }, 4: { CP: 1.025, A: 1.344, B: 2.161, Mc: 1.662, e: 2.65 } };
  for (const n of [3, 4]) {
    rel(bearingSpacing({ width: 9.837, psi: 80, n }), ref[n].e, 2e-3, `entraxe ${n} appareils`);
    const k = inequalityCoefficients({ width: 9.837, chargeable: 7.5, n, psi: 80, nLanes: 2, h: 0.55, hRev: 0.08 });
    rel(k.CP, ref[n].CP, 2e-3, `CP ${n}`); rel(k.A, ref[n].A, 3e-3, `A ${n}`); rel(k.B, ref[n].B, 2e-3, `Bc ${n}`); rel(k.Mc, ref[n].Mc, 6e-3, `Mc120 ${n}`);
  }
  // |M| = R/e · ℓ/12 : 18,58 et 20,58 t·m/m pour R = 107,07 / 164,62 t, e = 1,71 / 1,77 m, ℓ = 3,56 / 2,65 m
  rel(chevetreMomentPSIDP({ R: 107.07, width: 1.71, spacing: 3.56 }), 18.58, 1e-3, 'chevêtre culée');
  rel(chevetreMomentPSIDP({ R: 164.62, width: 1.77, spacing: 2.65 }), 20.58, 3e-3, 'chevêtre pile');
});
