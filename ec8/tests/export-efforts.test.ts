import { test } from "node:test";
import assert from "node:assert/strict";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import { actionSismique } from "../src/moteur/action.ts";
import { modele } from "../src/moteur/modele.ts";
import { analyse } from "../src/moteur/analyse.ts";
import { exporterEfforts } from "../src/moteur/export-efforts.ts";

test("export des efforts par appui pour PSIDA : kN, un enregistrement par appui, 3 cas 100/30/30", () => {
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p), m = modele(p), r = analyse(p, a, m);
  const e = exporterEfforts(p, a, r);
  assert.equal(e.format, "pont-ec8-efforts");
  assert.equal(e.appuis.length, p.appuis.length);
  for (const [i, ap] of e.appuis.entries()) {
    assert.equal(ap.cas.length, 3);
    assert.ok(Math.abs(ap.cas[0]!.Fx - 1000 * (r.directions.x.ubdp.appuis[i]?.F ?? 0)) < 1e-9);
    assert.ok(Math.abs(ap.cas[1]!.Fy - 1000 * (r.directions.y.ubdp.appuis[i]?.F ?? 0)) < 1e-9);
  }
  const somme = e.appuis.reduce((s, ap) => s + ap.cas[0]!.Fx, 0);
  assert.ok(Math.abs(somme - 1000 * r.directions.x.ubdp.F) < 1e-6);
});
