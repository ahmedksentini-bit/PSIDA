import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { pushover } from "../src/moteur/pushover.ts";
import { jeuAccelerogrammes } from "../src/moteur/temporel.ts";
import { avancer, etatInitial, noteTemporelNL, temporelNonLineaire, type ParametresHysteresis } from "../src/moteur/temporel-nl.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Pile, Projet } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

function cycle(p: ParametresHysteresis, amplitudes: number[], pas = 1e-4) {
  const s = etatInitial(p);
  const pts: [number, number][] = [];
  let D = 0;
  for (const A of amplitudes) {
    for (const cible of [A, -A]) {
      const sgn = Math.sign(cible - D);
      while ((cible - D) * sgn > 1e-12) {
        D = sgn > 0 ? Math.min(cible, D + pas) : Math.max(cible, D - pas);
        pts.push([D, avancer(s, p, D)]);
      }
    }
  }
  return { s, pts };
}

test("Takeda modifié : plastification à Fy, décharge à k0 (dy/dmax)^0,5, recharge vers le pic opposé", () => {
  const p: ParametresHysteresis = { k0: 10, Fy: 1, k2: 0.5, beta: 0.5, loi: "takeda" };
  const { s, pts } = cycle(p, [0.05, 0.4]);
  // sur l'enveloppe à D = 0,4 : F = 1 + 0,5 × 0,3
  const iMax = pts.findIndex(([d]) => Math.abs(d - 0.4) < 1e-9);
  assert.ok(Math.abs(pts[iMax]![1] - 1.15) < 1e-6);
  // juste après le pic : pente de décharge k0 √(0,1/0,4) = 5
  const [d1, f1] = pts[iMax + 100]!;
  assert.ok(Math.abs((pts[iMax]![1] - f1) / (0.4 - d1) - 5) < 1e-6);
  // à la fin du cycle (D = −0,4) on est sur l'enveloppe négative, symétrique
  assert.ok(Math.abs(s.F + 1.15) < 1e-6 && s.plastifie);
  // l'aire de la boucle (énergie dissipée) est positive
  let E = 0;
  for (let i = 1; i < pts.length; i++) E += ((pts[i]![1] + pts[i - 1]![1]) / 2) * (pts[i]![0] - pts[i - 1]![0]);
  assert.ok(E > 0.2, `E = ${E}`);
});

test("bilinéaire cinématique : effort borné par les droites d'écrouissage", () => {
  const p: ParametresHysteresis = { k0: 10, Fy: 1, k2: 0.5, beta: 0.5, loi: "bilineaire" };
  const { pts } = cycle(p, [0.3]);
  for (const [d, f] of pts) assert.ok(f <= 1 + 0.5 * (d - 0.1) + 1e-9 && f >= -1 + 0.5 * (d + 0.1) - 1e-9);
});

function variante(): Projet {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  for (const ap of p.appuis) {
    if (ap.type === "pile") {
      ap.appareils = { type: "fixe", nombre: 2, a: 0.3, b: 0.3, hauteur: 0.1 };
      (ap as Pile).armatures = { As: 120, db: 20, enrobage: 0.05 };
    } else ap.appareils = { type: "glissant", nombre: 2, a: 0.3, b: 0.3, hauteur: 0.1 };
  }
  return p;
}

test("loi linéaire = oscillateur exact ; non linéaire proche des déplacements égaux ; références", () => {
  const p = variante();
  const a = actionSismique(p);
  const po = pushover(p, a, "x");
  const jeu = jeuAccelerogrammes("x", a.spectres.elastiqueH, po.cible.Teff, { nombre: 3, dt: 0.01, montee: 2, stationnaire: 10, descente: 8, graine: 1998, iterations: 4 });
  const lin = temporelNonLineaire(p, a, "x", jeu, { loi: "lineaire", borne: "lbdp", lambda: 1 }, po);
  assert.equal(lin.calcul.regle, "maximum");
  for (const r of lin.reponses) assert.ok(Math.abs(r.Dmax / r.DmaxLineaire - 1) < 0.01, `${r.Dmax} / ${r.DmaxLineaire}`);
  const tk = temporelNonLineaire(p, a, "x", jeu, { loi: "takeda", borne: "lbdp", lambda: 3 }, po);
  assert.ok(tk.calcul.piles.every((q) => q.mu > 1 && q.thetaP > 0));
  assert.ok(Math.abs(tk.calcul.Dmax / tk.calcul.DmaxLineaire - 1) < 0.35);
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  for (const s of noteTemporelNL(tk)) for (const l of s.lignes) for (const ref of l.references) assert.ok(ids.has(ref), `${l.id} : ${ref}`);
});
