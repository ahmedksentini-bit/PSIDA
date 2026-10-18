import { test } from "node:test";
import assert from "node:assert/strict";

import { modele } from "../src/moteur/modele.ts";
import { validerModeleExemple } from "../src/moteur/validation-exemple.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Projet } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

const proche = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const copie = (): Projet => structuredClone(EXEMPLE_PONT_DALLE);

test("exemple du guide : points de contrôle du modèle conformes ou écarts expliqués", () => {
  for (const c of validerModeleExemple()) {
    assert.ok(c.conforme, `${c.point.id} : calculé ${c.calcule}, guide ${c.point.guide} (p. ${c.point.page})`);
  }
});

test("exemple du guide : raideurs exactes", () => {
  const m = modele(EXEMPLE_PONT_DALLE);
  const Gb = 0.99;
  const Ix = (2.5 * 0.8 ** 3) / 12;
  proche(m.directions.x.appuis[1]?.kSupport ?? NaN, (2 * 3 * m.Ecm * Ix) / 5.5 ** 3);
  proche(m.directions.x.appuis[0]?.kAppareils.lbdp ?? NaN, (4 * Gb * 0.3 * 0.35) / 0.06);
  assert.equal(m.directions.x.appuis[0]?.kSupport, Infinity); // culée rigide en longitudinal
  proche(m.elastomeres?.GbMax ?? NaN, 1.07 * 1.07 * Gb);
  // Transversal : butées de blocage sur culées, poteaux encastrés en pied et en tête.
  assert.equal(m.directions.y.appuis[0]?.kAppareils.lbdp, Infinity);
  proche(m.directions.y.appuis[0]?.kTotal.lbdp ?? NaN, (2 * 12 * m.Ecm * 0.8 ** 4) / 12 / 4 ** 3);
  proche(m.amortissement.xi, 5);
});

test("Tmin,b ≥ 0 : Gb,max = 1,2 Gb", () => {
  const p = copie();
  p.elastomeres.Tmin = 0;
  const m = modele(p);
  assert.ok((m.elastomeres?.Tminb ?? -1) >= 0);
  proche(m.elastomeres?.GbMax ?? NaN, 1.2 * 0.99);
});

test("appareils glissants : aucune raideur longitudinale ; fixes : demi-pile ajoutée à la masse", () => {
  const p = copie();
  const p1 = p.appuis[1];
  const p2 = p.appuis[2];
  assert.ok(p1 && p2);
  p1.appareils = { type: "glissant", nombre: 4, a: 0.4, b: 0.4, hauteur: 0.1 };
  p2.appareils = { type: "fixe", nombre: 4, a: 0.4, b: 0.4, hauteur: 0.1 };
  const m = modele(p);
  assert.equal(m.directions.x.appuis[1]?.kTotal.lbdp, 0);
  proche(m.directions.x.appuis[2]?.kTotal.lbdp ?? NaN, m.directions.x.appuis[2]?.kSupport ?? NaN);
  const futs = m.masses.piles.find((x) => x.id === "P2")?.masseFuts ?? NaN;
  proche(futs, 2 * 0.8 * 2.5 * 5.5 * 2.5);
  proche(m.masses.M, m.masses.tablier + futs / 2);
});

test("ψ2,1 : masse de trafic ajoutée", () => {
  const p = copie();
  p.site.trafic = "routier_trafic_intense";
  p.tablier.chargeTrafic = 100;
  const m = modele(p);
  proche(m.masses.trafic, (0.2 * 100 * 35.621) / 10);
});

test("note du modèle : références connues", () => {
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  for (const s of modele(EXEMPLE_PONT_DALLE).note) for (const l of s.lignes) for (const r of l.references) assert.ok(ids.has(r), `${l.id} : ${r}`);
});
