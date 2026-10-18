import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { analyse } from "../src/moteur/analyse.ts";
import { modele } from "../src/moteur/modele.ts";
import { validerAnalyseExemple } from "../src/moteur/validation-exemple.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Projet } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

const proche = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const copie = (): Projet => structuredClone(EXEMPLE_PONT_DALLE);
const calculer = (p: Projet) => analyse(p, actionSismique(p), modele(p));

test("exemple du guide : points de contrôle de l'analyse conformes ou écarts expliqués", () => {
  for (const c of validerAnalyseExemple()) assert.ok(c.conforme, `${c.point.id} : calculé ${c.calcule}, guide ${c.point.guide} (p. ${c.point.page})`);
});

test("équilibre : la somme des efforts d'appui égale l'effort total", () => {
  const r = calculer(EXEMPLE_PONT_DALLE);
  for (const d of ["x", "y"] as const) for (const b of ["lbdp", "ubdp"] as const) {
    const x = r.directions[d][b];
    proche(x.appuis.reduce((s, a) => s + a.F, 0), x.F, 1e-9);
  }
});

test("période : T = 2π√(M/K) et F = M·Sd(T)", () => {
  const p = EXEMPLE_PONT_DALLE;
  const m = modele(p);
  const r = analyse(p, actionSismique(p), m);
  proche(r.directions.x.lbdp.T, 2 * Math.PI * Math.sqrt((m.masses.M * 1000) / (m.directions.x.K.lbdp * 1e6)));
  proche(r.directions.x.lbdp.F, (m.masses.M * r.directions.x.lbdp.Sd) / 1000);
});

test("μd : q = 1,5 et T < 1,25 TC → (q − 1)·T0/T + 1", () => {
  const r = calculer(EXEMPLE_PONT_DALLE).directions.y.lbdp;
  proche(r.muD, 0.5 * (1.25 * 0.4) / r.T + 1);
});

test("excentricité : pile plus raide d'un côté → torsion ajoutée", () => {
  const p = copie();
  const c3 = p.appuis[3];
  assert.ok(c3 && c3.type === "culee");
  c3.butees.transversales = false;
  const r = calculer(p);
  assert.equal(r.torsion.appliquee, true);
  assert.ok((r.directions.y.ubdp.appuis[0]?.torsion ?? 0) > 0);
});

test("réactions verticales : non applicables si travées de rive inégales", () => {
  const p = copie();
  p.tablier.travees = [9, 16.191, 12];
  assert.equal(calculer(p).vertical.applicable, false);
});

test("note de l'analyse : références connues", () => {
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  for (const s of calculer(EXEMPLE_PONT_DALLE).note) for (const l of s.lignes) for (const r of l.references) assert.ok(ids.has(r), `${l.id} : ${r}`);
});
