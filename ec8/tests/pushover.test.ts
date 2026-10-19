import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { materiauxProbables, momentCourbure, notePushover, pushover, sigmaBeton } from "../src/moteur/pushover.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Pile, Projet } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

test("loi de Mander : pic fcc à εc1, béton non confiné fcm à 0,002", () => {
  const m = materiauxProbables(25, 500, "B");
  assert.ok(Math.abs(sigmaBeton(0.002, m) - 33) < 1e-9);
  const c = materiauxProbables(25, 500, "B", 0.01);
  assert.ok(c.fcc > c.fcm && c.epsCu > 0.004);
  assert.ok(Math.abs(sigmaBeton(c.epsC1, c) - c.fcc) < 1e-6);
});

test("moment de plastification d'une section rectangulaire sans effort normal ≈ As/2 · fym · (d − d')", () => {
  const s = { forme: "rectangulaire" as const, h: 1, b: 1, As: 0.004, db: 0.02, enrobage: 0.04 };
  const m = materiauxProbables(30, 500, "B");
  const r = momentCourbure(s, m, 0);
  const bras = 1 - 2 * 0.05;
  const approx = (0.004 / 2) * m.fym * bras;
  assert.ok(Math.abs(r.premiere.M / approx - 1) < 0.08, `${r.premiere.M} / ${approx}`);
  assert.ok(r.My >= r.premiere.M && r.ultime.phi > 5 * r.phiY);
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

test("poussée : branche élastique = raideur des fûts fissurés, courbe croissante, rotules au-delà de dy", () => {
  const p = variante();
  const r = pushover(p, actionSismique(p), "x");
  const c = r.capacites[0]!;
  const e1 = r.etats[1]!;
  const kEff = r.capacites.reduce((s, x) => s + x.nFuts * ((3 * x.mphi.My) / x.mphi.phiY / x.L ** 3 - x.N / x.L), 0); // P-Δ compris
  assert.ok(Math.abs(e1.V / e1.D / kEff - 1) < 0.02, `${e1.V / e1.D} / ${kEff}`);
  // croissante jusqu'à la plastification ; au-delà, l'effet P-Δ peut faire décroître V
  for (let k = 1; k < r.etats.length && r.etats[k]!.D <= c.deltaY; k++) assert.ok(r.etats[k]!.V >= r.etats[k - 1]!.V - 1e-9);
  assert.ok(Math.abs(c.deltaPd - c.deltaY - c.thetaPd * c.L) < 1e-12);
  assert.ok(r.ultime && r.ultime.D > c.deltaY);
  const ids = new Set(REFERENTIEL.map((x) => x.id));
  for (const s of notePushover([r])) for (const l of s.lignes) for (const ref of l.references) assert.ok(ids.has(ref), `${l.id} : ${ref}`);
});

test("déplacement cible : multimodale q = 1 avec Jeff, proche de la méthode N2 quand le pont reste élastique", () => {
  const p = variante();
  const r = pushover(p, actionSismique(p), "x");
  assert.ok(r.cible.dT > 0);
  if (r.cible.n2.qu <= 1) assert.ok(Math.abs(r.cible.n2.dt / r.cible.dT - 1) < 0.15, `${r.cible.n2.dt} / ${r.cible.dT}`);
  assert.ok(r.capacites.every((c) => c.facteurInertie > 0.05 && c.facteurInertie < 1));
});
