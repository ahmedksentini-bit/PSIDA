// Travées indépendantes (tablier.continuite = « isostatique ») : modèle dynamique à travées séparées.
import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { analyse } from "../src/moteur/analyse.ts";
import { modele } from "../src/moteur/modele.ts";
import { reponseDirection } from "../src/moteur/multimodal.ts";
import { verifierAppuis } from "../src/moteur/verif-appuis.ts";
import { exporterEfforts } from "../src/moteur/export-efforts.ts";
import { derives } from "../src/projet/geometrie.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Pile, Projet } from "../src/projet/types.ts";

const relatif = (a: number, b: number, tol: number, msg = "") => assert.ok(Math.abs(a / b - 1) <= tol, `${msg} ${a} ≠ ${b} (tolérance ${100 * tol} %)`);

/** Trois travées indépendantes ; piles très raides, culées rigides : chaque travée est un oscillateur simple. */
function projetIso(): Projet {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  p.tablier.continuite = "isostatique";
  p.tablier.travees = [12, 20, 12];
  for (const ap of p.appuis) {
    ap.butees = { transversales: false, longitudinales: false };
    if (ap.type === "culee") ap.rigide = { longitudinal: true, transversal: true };
    else {
      const pile = ap as Pile;
      pile.futs = { ...pile.futs, long: 6, trans: 10, hauteur: 3 };
      pile.appareils = { ...EXEMPLE_PONT_DALLE.appuis[0]!.appareils, nombre: 8 } as Pile["appareils"]; // deux rangées de 4
    }
  }
  return p;
}

test("travées indépendantes : chaque travée oscille sur ses deux rangées d'appareils", () => {
  const p = projetIso(), a = actionSismique(p), m = modele(p);
  const kRang = m.directions.x.appuis[0]!.kAppareils.lbdp; // culée : une rangée de 4 appareils (MN/m)
  relatif(m.directions.x.appuis[1]!.kAppareils.lbdp, 2 * kRang, 1e-9, "pile : deux rangées");
  const mu = derives(p).masseLineique; // t/m
  const R = reponseDirection(p, a, m, "x", "lbdp");
  const T = R.modes.filter((x) => x.part > 0.05).map((x) => x.T);
  for (const L of [12, 20]) {
    const attendu = 2 * Math.PI * Math.sqrt((mu * L) / (2 * kRang * 1000));
    assert.ok(T.some((t) => Math.abs(t / attendu - 1) < 0.01), `T = ${attendu} attendu parmi ${T.join(", ")}`);
  }
  // effort sur une pile = somme des deux rangées ; joints : déplacement relatif des abouts de travées de périodes différentes
  const r = analyse(p, a, m);
  const P1 = r.directions.x.lbdp.appuis[1]!;
  assert.ok(P1.dJoint !== undefined && P1.dJoint > 0.001, `ouverture du joint ${P1.dJoint}`);
  assert.equal(r.conditions.find((c) => c.id === "tablier_continu")!.respectee, true);
  assert.match(r.conditions[0]!.libelle, /Travées indépendantes/);
});

test("travées indépendantes : réactions verticales par travée, repos d'appui sur pile, efforts exportés", () => {
  const p = projetIso(), a = actionSismique(p), m = modele(p), r = analyse(p, a, m);
  const mu = m.masses.masseLineique, aV = a.plateaux.Sve;
  relatif(r.vertical.reactions[1]!.R, (aV * 0.41 * mu * (12 + 20)) / 1000, 1e-9, "pile P1 : deux travées");
  relatif(r.vertical.reactions[0]!.R, (aV * 0.41 * mu * 12) / 1000, 1e-9, "culée : une travée");
  // recouvrement insuffisant sur P1 : critère non vérifié, suffisant sur P2 : vérifié
  (p.appuis[1] as Pile).reposDisponible = 0.2;
  (p.appuis[2] as Pile).reposDisponible = 1.0;
  const v = verifierAppuis(p, a, m, r);
  const c1 = v.criteres.find((c) => c.id === "P1_repos")!, c2 = v.criteres.find((c) => c.id === "P2_repos")!;
  assert.equal(c1.etat, "non_verifie");
  assert.equal(c2.etat, "ok");
  const rp = v.repos.find((x) => x.id === "P1")!;
  relatif(rp.lov, 0.4 + rp.deg + rp.des, 1e-9, "lov = lm + deg + des (dE,tête inclus dans des)");
  const e = exporterEfforts(p, a, r);
  assert.match(e.remarques[0]!, /Travées indépendantes/);
  relatif(e.appuis[1]!.cas[0]!.Fx, r.directions.x.ubdp.appuis[1]!.F * 1000, 1e-9, "Fx exporté");
});
