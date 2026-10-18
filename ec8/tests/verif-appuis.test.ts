import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { analyse } from "../src/moteur/analyse.ts";
import { modele } from "../src/moteur/modele.ts";
import { validerAppuisExemple } from "../src/moteur/validation-exemple.ts";
import { reactionsPoutreContinue, verifierAppuis } from "../src/moteur/verif-appuis.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Projet } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

const proche = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const calculer = (p: Projet) => {
  const a = actionSismique(p);
  const m = modele(p);
  return verifierAppuis(p, a, m, analyse(p, a, m));
};

test("exemple du guide : points de contrôle 6a conformes ou écarts expliqués", () => {
  for (const c of validerAppuisExemple()) assert.ok(c.conforme, `${c.point.id} : calculé ${c.calcule}, guide ${c.point.guide} (p. ${c.point.page})`);
});

test("poutre continue : deux travées égales → 3/8, 10/8, 3/8 de qL", () => {
  const R = reactionsPoutreContinue([10, 10], 1);
  proche(R[0] ?? NaN, 3.75);
  proche(R[1] ?? NaN, 12.5);
  proche(R[2] ?? NaN, 3.75);
});

test("poutre continue : équilibre global", () => {
  const R = reactionsPoutreContinue([9.715, 16.191, 9.715], 0.23075);
  proche(R.reduce((s, x) => s + x, 0), 0.23075 * 35.621);
});

test("sans charges permanentes saisies : estimation par poutre continue signalée", () => {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  for (const a of p.appuis) delete a.chargesPermanentes;
  const v = calculer(p);
  assert.equal(v.appareils[1]?.permanentes.source, "poutre continue");
  proche(v.appareils[1]?.permanentes.Nmax ?? NaN, reactionsPoutreContinue(p.tablier.travees, 0.23075)[1] ?? NaN);
});

test("glissement : fixation par frottement seul → non vérifié", () => {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  for (const a of p.appuis) if (a.appareils.type === "elastomere") a.appareils.fixation = "frottement";
  const c = calculer(p).criteres.find((x) => x.id === "C0_glissement");
  assert.equal(c?.etat, "non_verifie");
});

test("repos d'appui : recouvrement disponible = excentrement + demi-poteau + débord du sommier + débord d'about", () => {
  const r = calculer(EXEMPLE_PONT_DALLE).repos[0];
  proche(r?.disponible ?? NaN, 0.5 + 0.4 + 0.2 + 0.25);
});

test("note 6a : références connues", () => {
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  for (const s of calculer(EXEMPLE_PONT_DALLE).note) for (const l of s.lignes) for (const r of l.references) assert.ok(ids.has(r), `${l.id} : ${r}`);
  for (const c of calculer(EXEMPLE_PONT_DALLE).criteres) for (const r of c.references) assert.ok(ids.has(r), `${c.id} : ${r}`);
});
