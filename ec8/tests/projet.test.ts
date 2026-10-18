import { test } from "node:test";
import assert from "node:assert/strict";

import { changerNombreTravees, changerTypeAppareils } from "../src/projet/edition.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import { derives, epaisseurElastomere, hauteurAppareil, maquette } from "../src/projet/geometrie.ts";
import { lireProjet } from "../src/projet/stockage.ts";
import type { Projet } from "../src/projet/types.ts";
import { aDesErreurs, valider } from "../src/projet/validation.ts";

const proche = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const copie = (): Projet => structuredClone(EXEMPLE_PONT_DALLE);

test("exemple du guide : positions des appuis et longueur", () => {
  const d = derives(EXEMPLE_PONT_DALLE);
  proche(d.longueur, 35.621);
  d.positions.forEach((x, i) => proche(x, [0, 9.715, 25.906, 35.621][i] ?? NaN));
});

test("exemple du guide : poids et masse du tablier (guide p. 243)", () => {
  const d = derives(EXEMPLE_PONT_DALLE);
  proche(d.poidsLineique.beton, 183.75); // kN/m
  proche(d.poidsLineique.total, 230.75); // kN/m
  proche(d.masseLineique, 23.075); // t/m
  assert.equal(Math.round(d.masseTablier), 822); // t
});

test("exemple du guide : épaisseur d'élastomère Tq = 0,06 m (guide p. 249)", () => {
  const culee = EXEMPLE_PONT_DALLE.appuis[0];
  assert.ok(culee);
  proche(epaisseurElastomere(culee.appareils) ?? NaN, 0.06);
  proche(hauteurAppareil(culee.appareils), 0.06 + 4 * 0.003 + 2 * 0.018);
});

test("exemple du guide : soumis aux règles parasismiques", () => {
  assert.equal(derives(EXEMPLE_PONT_DALLE).soumis.soumis, true);
});

test("exemple du guide : saisie sans erreur ni alerte", () => {
  const problemes = valider(EXEMPLE_PONT_DALLE).filter((p) => p.niveau !== "info");
  assert.deepEqual(problemes, []);
});

test("maquette : 16 appareils, 4 fûts, 4 poteaux, fondations posées à Z = 0", () => {
  const { solides, bornes, zTablier } = maquette(EXEMPLE_PONT_DALLE);
  const compte = (role: string) => solides.filter((s) => s.role === role).length;
  assert.equal(compte("appareil"), 16);
  assert.equal(compte("fut"), 4);
  assert.equal(compte("poteau"), 4);
  assert.equal(compte("semelle"), 4);
  proche(bornes.min[2], 0);
  const basSemelles = Math.min(...solides.map((s) => s.centre[2] - s.dims[2] / 2));
  proche(basSemelles, 0);
  const tablier = solides.find((s) => s.role === "tablier");
  assert.ok(tablier);
  proche(tablier.centre[2] + tablier.dims[2] / 2, zTablier);
});

test("maquette : appareils sous le tablier et sur les fûts, deux par fût", () => {
  const { solides } = maquette(EXEMPLE_PONT_DALLE);
  const tablier = solides.find((s) => s.role === "tablier");
  assert.ok(tablier);
  const sousFace = tablier.centre[2] - tablier.dims[2] / 2;
  for (const a of solides.filter((s) => s.role === "appareil")) proche(a.centre[2] + a.dims[2] / 2, sousFace);
  const ysP1 = solides.filter((s) => s.appui === "P1" && s.role === "appareil").map((s) => s.centre[1]);
  ysP1.forEach((y, i) => proche(y, [-3.225, -1.975, 1.975, 3.225][i] ?? NaN));
});

test("validation : nombre d'appuis incohérent avec les travées", () => {
  const p = copie();
  p.tablier.travees.push(12);
  assert.ok(aDesErreurs(valider(p)));
});

test("validation : fûts qui se chevauchent", () => {
  const p = copie();
  const pile = p.appuis[1];
  assert.ok(pile && pile.type === "pile");
  pile.futs.entraxe = 2.0;
  assert.ok(valider(p).some((x) => x.niveau === "erreur" && x.cible === "P1"));
});

test("validation : zone 1 signalée comme non soumise", () => {
  const p = copie();
  p.site.zone = 1;
  assert.equal(derives(p).soumis.soumis, false);
  assert.ok(valider(p).some((x) => x.niveau === "info" && x.cible === "site"));
});

test("import : rejette un fichier qui n'est pas un projet", () => {
  assert.throws(() => lireProjet({ version: 2 }));
  assert.throws(() => lireProjet({ ...copie(), appuis: [{ type: "mur" }] }));
  assert.deepEqual(lireProjet(JSON.parse(JSON.stringify(EXEMPLE_PONT_DALLE))), EXEMPLE_PONT_DALLE);
});

test("édition : ajouter et retirer des travées renumérote les appuis", () => {
  const plus = changerNombreTravees(EXEMPLE_PONT_DALLE, 5);
  assert.deepEqual(plus.appuis.map((a) => a.id), ["C0", "P1", "P2", "P3", "P4", "C5"]);
  assert.deepEqual(plus.tablier.travees, [9.715, 16.191, 9.715, 9.715, 9.715]);
  assert.ok(!aDesErreurs(valider(plus)));
  const moins = changerNombreTravees(plus, 1);
  assert.deepEqual(moins.appuis.map((a) => a.id), ["C0", "C1"]);
  assert.deepEqual(moins.tablier.travees, [9.715]);
  assert.ok(!aDesErreurs(valider(moins)));
});

test("édition : changer le type d'appareil conserve le nombre et les dimensions en plan", () => {
  const culee = EXEMPLE_PONT_DALLE.appuis[0];
  assert.ok(culee);
  const fixe = changerTypeAppareils(culee.appareils, "fixe");
  assert.equal(fixe.type, "fixe");
  assert.equal(fixe.nombre, 4);
  assert.equal(fixe.a, 0.3);
  const retour = changerTypeAppareils(fixe, "elastomere");
  assert.equal(retour.type, "elastomere");
  assert.equal(retour.b, 0.35);
});
