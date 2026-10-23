// Choix automatique de la méthode des efforts : mode fondamental dans son domaine, multimodale sinon (EN 1998-2 4.2.2.2-4.2.2.3).
import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { analyse, methodeRetenue } from "../src/moteur/analyse.ts";
import { modele } from "../src/moteur/modele.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";

const calc = (p: typeof EXEMPLE_PONT_DALLE) => analyse(p, actionSismique(p), modele(p));

test("tablier large (L/B ≤ 4) : mode fondamental ; tablier étroit (L/B > 4) : multimodale d'office", () => {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  delete p.options.methodeEfforts;
  const L = p.tablier.travees.reduce((s, x) => s + x, 0);
  p.tablier.largeur = L / 3.5;
  const r1 = calc(p);
  if (r1.conditions.every((c) => c.respectee || c.id === "excentricite")) assert.equal(methodeRetenue(p, r1).methode, "mode_fondamental");
  p.tablier.largeur = L / 4.2;
  const r2 = calc(p), m2 = methodeRetenue(p, r2);
  assert.equal(r2.conditions.find((c) => c.id === "L_sur_B")?.respectee, false);
  assert.equal(m2.methode, "multimodale");
  assert.match(m2.motif ?? "", /L\/B/);
});

test("une méthode choisie explicitement est respectée, même hors domaine", () => {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  p.tablier.largeur = p.tablier.travees.reduce((s, x) => s + x, 0) / 5;
  p.options.methodeEfforts = "mode_fondamental";
  assert.deepEqual(methodeRetenue(p, calc(p)), { methode: "mode_fondamental", motif: null });
});
