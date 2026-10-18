import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { deplacement, echantillonner, valeur, type FormeSpectre } from "../src/moteur/spectres.ts";
import { validerActionExemple } from "../src/moteur/validation-exemple.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Projet } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

const proche = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const copie = (): Projet => structuredClone(EXEMPLE_PONT_DALLE);

test("exemple du guide : tous les points de contrôle de l'action sismique sont conformes", () => {
  for (const c of validerActionExemple()) {
    assert.ok(c.conforme, `${c.point.id} : calculé ${c.calcule}, guide ${c.point.guide} (p. ${c.point.page})`);
  }
});

test("exemple du guide : valeurs exactes", () => {
  const a = actionSismique(EXEMPLE_PONT_DALLE);
  proche(a.ag, 1.92);
  proche(a.avg, 1.728);
  proche(a.plateaux.Se, 7.2);
  proche(a.plateaux.SdTrans, 4.8);
  proche(a.plateaux.Sve, 5.184);
  proche(a.dg, 0.025 * 1.92 * 1.5 * 0.4 * 2.0);
  proche(a.beta * a.ag, 0.384);
  assert.equal(a.soumis, true);
  assert.equal(a.faibleSismicite.applicable, false);
});

const forme = (f: Partial<FormeSpectre> = {}): FormeSpectre => ({
  amplitude: 2.88,
  TB: 0.06,
  TC: 0.4,
  TD: 2.0,
  plateau: 2.5,
  depart: 1,
  plateauOrigine: false,
  ...f,
});

test("spectre élastique : quatre branches de l'EN 1998-1", () => {
  const f = forme();
  proche(valeur(f, 0), 2.88); // ag·S
  proche(valeur(f, 0.03), 2.88 * (1 + 0.5 * (2.5 - 1))); // mi-branche montante
  proche(valeur(f, 0.2), 7.2);
  proche(valeur(f, 0.8), 7.2 * 0.4 / 0.8);
  proche(valeur(f, 3), (7.2 * 0.4 * 2.0) / 9);
});

test("spectre : continuité aux périodes de coin", () => {
  const f = forme();
  for (const T of [f.TB, f.TC, f.TD]) proche(valeur(f, T - 1e-9), valeur(f, T + 1e-9), 1e-6);
});

test("spectre : plateau prolongé jusqu'à l'origine", () => {
  proche(valeur(forme({ plateauOrigine: true }), 0), 7.2);
});

test("spectre de calcul : départ à 2/3 et plancher β·ag", () => {
  const sd = forme({ plateau: 2.5 / 1.5, depart: 2 / 3, plancher: 0.384 });
  proche(valeur(sd, 0), 2.88 * (2 / 3));
  proche(valeur(sd, 0.2), 4.8);
  proche(valeur(sd, 4), 0.384); // branche en 1/T² : 4,8 × 0,4 × 2 / 16 = 0,24 < 0,384, le plancher s'applique
  assert.ok(valeur(sd, 2.5) >= 0.384);
});

test("spectre en déplacement : SDe = Se·(T/2π)²", () => {
  const f = forme();
  proche(deplacement(f, 1), valeur(f, 1) / (4 * Math.PI ** 2));
});

test("échantillonnage : inclut les périodes de coin et croît", () => {
  const pts = echantillonner(forme());
  const Ts = pts.map(([T]) => T);
  for (const T of [0.06, 0.4, 2.0]) assert.ok(Ts.includes(T));
  for (let i = 1; i < Ts.length; i++) assert.ok((Ts[i] ?? 0) > (Ts[i - 1] ?? 0));
});

test("amortissement : η = 1 à 5 %, plancher 0,55", () => {
  const p = copie();
  p.comportement.amortissement = 5;
  proche(actionSismique(p).eta, 1);
  p.comportement.amortissement = 50;
  proche(actionSismique(p).eta, 0.55);
});

test("zone 5 : paramètres des Antilles", () => {
  const p = copie();
  p.site.zone = 5;
  const a = actionSismique(p);
  proche(a.agr, 3.0);
  proche(a.S, 1.15);
  proche(a.TC, 0.6);
  proche(a.avg, 0.8 * a.ag);
});

test("catégorie II, faible sismicité : méthode simplifiée admise si L·B < 150 m² ET ag·S ≤ 0,15 g (AN 2013, 2.3.7(1))", () => {
  const p = copie();
  p.site.zone = 2;
  p.site.categorie = "II";
  p.site.classeSol = "A";
  // brèche de l'exemple (> 150 m²) : conditions cumulatives depuis l'AN d'avril 2013, méthode non admise
  assert.equal(actionSismique(p).faibleSismicite.applicable, false);
  // petite brèche : 12 m × 10 m = 120 m² < 150 m², ag·S = 0,7 m/s² < 0,15 g
  p.tablier.travees = [12];
  p.tablier.largeur = 10;
  assert.equal(actionSismique(p).faibleSismicite.applicable, true);
});

test("note de calcul : toutes les références existent dans le référentiel", () => {
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  for (const section of actionSismique(EXEMPLE_PONT_DALLE).note) {
    for (const ligne of section.lignes) {
      assert.ok(ligne.references.length > 0, `${ligne.id} sans référence`);
      for (const r of ligne.references) assert.ok(ids.has(r), `${ligne.id} : référence inconnue ${r}`);
    }
  }
});
