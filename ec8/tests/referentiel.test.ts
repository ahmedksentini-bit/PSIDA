import { test } from "node:test";
import assert from "node:assert/strict";

import { REFERENTIEL } from "../src/referentiel/index.ts";
import { SOURCES } from "../src/referentiel/sources.ts";
import { ETAPES } from "../src/referentiel/types.ts";
import {
  AGR,
  GAMMA_I,
  PARAMETRE_SOL_S,
  PERIODES_HORIZONTALES,
  SPECTRE_VERTICAL,
  type ClasseSol,
  type GroupeZones,
} from "../src/referentiel/nationaux.ts";

const CLASSES: ClasseSol[] = ["A", "B", "C", "D", "E"];
const GROUPES: GroupeZones[] = ["zones_2_a_4", "zone_5"];

test("identifiants uniques", () => {
  const vus = new Set<string>();
  for (const e of REFERENTIEL) {
    assert.ok(!vus.has(e.id), `identifiant en double : ${e.id}`);
    vus.add(e.id);
  }
});

test("chaque entrée a au moins une référence vers une source connue", () => {
  for (const e of REFERENTIEL) {
    assert.ok(e.references.length > 0, `${e.id} : aucune référence`);
    for (const r of e.references) {
      assert.ok(SOURCES[r.source], `${e.id} : source inconnue ${r.source}`);
      assert.ok(r.localisation.trim().length > 0, `${e.id} : localisation vide`);
    }
  }
});

test("une entrée « vérifiée » s'appuie en premier sur un document consulté", () => {
  for (const e of REFERENTIEL) {
    if (e.statut !== "verifie") continue;
    const premiere = e.references[0];
    assert.ok(premiere, `${e.id} : aucune référence`);
    const dispo = SOURCES[premiere.source].disponibilite;
    assert.notEqual(dispo, "non_fourni", `${e.id} : marqué vérifié mais sa source primaire n'a pas été consultée`);
  }
});

test("une localisation dans un document non consulté n'est jamais marquée « lue »", () => {
  for (const e of REFERENTIEL) {
    for (const r of e.references) {
      const dispo = SOURCES[r.source].disponibilite;
      if (dispo === "projet") {
        assert.ok(r.etat && r.etat !== "lue", `${e.id} : ${r.source} ${r.localisation} n'a été lu que sur le projet (lue_projet)`);
        continue;
      }
      if (dispo !== "non_fourni") continue;
      assert.ok(r.etat && r.etat !== "lue" && r.etat !== "lue_projet", `${e.id} : ${r.source} ${r.localisation} doit être citee_par_guide, citee_par_an ou a_confirmer`);
    }
  }
});

test("une entrée « via guide » cite le guide Cerema avec sa page", () => {
  for (const e of REFERENTIEL) {
    if (e.statut !== "via_guide") continue;
    const guide = e.references.find((r) => r.source === "GUIDE_CEREMA_2015");
    assert.ok(guide, `${e.id} : statut via_guide sans référence au guide`);
    assert.ok(guide.page, `${e.id} : page du guide manquante`);
  }
});

test("chaque entrée appartient à une étape déclarée", () => {
  const etapes = new Set(ETAPES.map((e) => e.id));
  for (const e of REFERENTIEL) assert.ok(etapes.has(e.etape), `${e.id} : étape inconnue ${e.etape}`);
});

test("γI croît avec la catégorie d'importance", () => {
  const { II, III, IV } = GAMMA_I.valeurs;
  assert.ok(II < III && III < IV);
});

test("agr croît avec la zone de sismicité", () => {
  const v = AGR.valeurs;
  assert.ok(v[2] < v[3] && v[3] < v[4] && v[4] < v[5]);
});

test("tables de sol complètes et cohérentes (S ≥ 1, TB < TC < TD)", () => {
  for (const g of GROUPES) {
    for (const c of CLASSES) {
      assert.ok(PARAMETRE_SOL_S.valeurs[g][c] >= 1, `S(${g}, ${c}) < 1`);
      const { TB, TC, TD } = PERIODES_HORIZONTALES.valeurs[g][c];
      assert.ok(TB < TC && TC < TD, `périodes incohérentes pour ${g}, ${c}`);
    }
    const v = SPECTRE_VERTICAL.valeurs[g];
    assert.ok(v.TB < v.TC && v.TC < v.TD && v.rapport > 0 && v.rapport <= 1);
  }
  assert.equal(PARAMETRE_SOL_S.valeurs.zones_2_a_4.A, 1);
  assert.equal(PARAMETRE_SOL_S.valeurs.zone_5.A, 1);
});
