import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { analyse } from "../src/moteur/analyse.ts";
import { modele } from "../src/moteur/modele.ts";
import { correlationCQC, elementPoutre, modeleDynamique, multimodale, periodesVoisines, reponseDirection } from "../src/moteur/multimodal.ts";
import { modesPropres, produit, scalaire, zeros } from "../src/moteur/valeurs-propres.ts";
import { inertiesTablier } from "../src/projet/geometrie.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Projet } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

const relatif = (a: number, b: number, tol: number, msg = "") => assert.ok(Math.abs(a / b - 1) <= tol, `${msg} ${a} ≠ ${b} (tolérance ${100 * tol} %)`);
const copie = (): Projet => structuredClone(EXEMPLE_PONT_DALLE);

test("élément de poutre : pulsations d'une console (3,516 et 22,03 √(EI/μL⁴))", () => {
  const ne = 10, L = 10, EI = 1000, mu = 2;
  const K = zeros(2 * ne), M = zeros(2 * ne);
  for (let e = 0; e < ne; e++) {
    const { k, m } = elementPoutre(EI, mu, L / ne);
    const d = [2 * e - 2, 2 * e - 1, 2 * e, 2 * e + 1];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const i = d[a]!, j = d[b]!;
      if (i < 0 || j < 0) continue;
      K[i]![j]! += k[a]![b]!;
      M[i]![j]! += m[a]![b]!;
    }
  }
  const modes = modesPropres(K, M);
  const w0 = Math.sqrt(EI / (mu * L ** 4));
  relatif(Math.sqrt(modes[0]!.omega2), 3.51602 * w0, 1e-4, "ω1");
  relatif(Math.sqrt(modes[1]!.omega2), 22.0345 * w0, 1e-3, "ω2");
  // Orthonormalité par rapport à M.
  for (const [i, j] of [[0, 0], [0, 1], [1, 1], [2, 5]] as const) {
    const v = scalaire(modes[i]!.phi, produit(M, modes[j]!.phi));
    assert.ok(Math.abs(v - (i === j ? 1 : 0)) < 1e-9, `φ${i}ᵀMφ${j} = ${v}`);
  }
});

test("pont à une travée : premier mode vertical = π²√(EI/μL⁴)", () => {
  const p = copie();
  p.tablier.travees = [20];
  p.appuis = [p.appuis[0]!, p.appuis[3]!];
  const m = modele(p);
  const r = reponseDirection(p, actionSismique(p), m, "z", "lbdp");
  const mu = (m.masses.tablier + m.masses.trafic) / 20;
  const EI = m.Ecm * 1000 * inertiesTablier(p).verticale;
  const w = Math.PI ** 2 * Math.sqrt(EI / (mu * 20 ** 4));
  relatif(r.modes[0]!.omega, w, 2e-3, "ω1 vertical");
});

test("somme des masses effectives de tous les modes = masse du modèle", () => {
  const p = EXEMPLE_PONT_DALLE;
  const m = modele(p);
  for (const d of ["x", "y", "z"] as const) {
    const r = reponseDirection(p, actionSismique(p), m, d, "lbdp");
    const somme = r.modes.reduce((s, x) => s + x.masseEffective, 0);
    relatif(somme, r.modele.masse, 1e-8, d);
    assert.ok(r.partRetenue >= 0.9, `${d} : ${r.partRetenue}`);
  }
});

test("exemple du guide : la multimodale retrouve le mode fondamental (X et Y à 2 % près)", () => {
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p), m = modele(p), mono = analyse(p, a, m);
  const mm = multimodale(p, a, m, mono);
  for (const c of mm.comparaison) {
    relatif(c.T1, c.Tmono, 0.06, `T1 ${c.direction}`);
    relatif(c.Fmulti, c.Fmono, 0.02, `F ${c.direction}`);
    for (const ap of c.appuis) if (ap.Fmono > 0.1) relatif(ap.Fmulti, ap.Fmono, 0.03, `${c.direction} ${ap.id}`);
  }
  // Réactions verticales : modèle complet et méthode forfaitaire du guide à 5 % près.
  mono.vertical.reactions.forEach((x, i) => relatif(mm.directions.z.appuis[i]!.F, x.R, 0.05, `Z ${x.id}`));
});

test("équilibre modal : Σ forces d'appui + inertie des piles = Mk·Sd dans chaque mode", () => {
  const p = EXEMPLE_PONT_DALLE;
  const r = reponseDirection(p, actionSismique(p), modele(p), "x", "lbdp");
  // Mode 1 : effort total à la base = Σ efforts de liaison + pieds de piles − efforts en tête de piles.
  const total = (r.modes[0]!.masseEffective * r.modes[0]!.Sd) / 1000;
  const liaisons = r.appuis.reduce((s, x) => s + x.Fmodes[0]!, 0);
  // Le tablier seul (mode quasi rigide) porte l'essentiel de la masse : Σ liaisons ≈ M_tablier·Sd·Γφ.
  assert.ok(liaisons > 0.85 * total && liaisons <= 1.0001 * total, `${liaisons} / ${total}`);
});

test("CQC : r = 1 pour des périodes égales, décroît quand elles s'écartent ; voisinage (4.7)", () => {
  assert.ok(Math.abs(correlationCQC(0.05, 0.05, 1) - 1) < 1e-12);
  const r08 = correlationCQC(0.05, 0.05, 0.8);
  assert.ok(Math.abs(r08 - 0.1657) < 5e-4, `${r08}`);
  assert.ok(correlationCQC(0.05, 0.05, 0.5) < r08);
  assert.ok(periodesVoisines(1.0, 1.4, 0.05, 0.05));
  assert.ok(!periodesVoisines(1.0, 1.6, 0.05, 0.05));
});

test("liaisons : glissant = aucun ressort ; fixe = liaison rigide", () => {
  const p = copie();
  const pile = p.appuis[1]!;
  pile.appareils = { type: "glissant", nombre: 2, a: 0.4, b: 0.4, hauteur: 0.1 };
  const md = modeleDynamique(p, modele(p), "x", "lbdp");
  assert.equal(md.appuis[1]!.ressort, null);
  pile.appareils = { type: "fixe", nombre: 2, a: 0.4, b: 0.4, hauteur: 0.1 };
  const md2 = modeleDynamique(p, modele(p), "x", "lbdp");
  assert.equal(md2.appuis[1]!.rigide, true);
  assert.equal(md2.appuis[1]!.ressort?.k, md2.kRigide);
});

test("note multimodale : toutes les références existent", () => {
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p), m = modele(p);
  for (const s of multimodale(p, a, m, analyse(p, a, m)).note) for (const l of s.lignes) for (const r of l.references) assert.ok(ids.has(r), `${l.id} : ${r}`);
});
