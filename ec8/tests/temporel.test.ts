import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { analyse } from "../src/moteur/analyse.ts";
import { modele } from "../src/moteur/modele.ts";
import { accelerogramme, historique, jeuAccelerogrammes, OPTIONS_TEMPOREL, reponseOscillateur, spectreCible, temporelLineaire } from "../src/moteur/temporel.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

test("oscillateur : régime établi sous excitation sinusoïdale = solution exacte", () => {
  const dt = 0.01, n = 6000, w = 2 * Math.PI, r = 0.5, xi = 0.05;
  const ag = new Float64Array(n);
  for (let i = 0; i < n; i++) ag[i] = Math.sin(w * r * i * dt);
  const u = reponseOscillateur(ag, dt, w, xi);
  let m = 0;
  for (let i = 4000; i < n; i++) m = Math.max(m, Math.abs(u[i]!));
  const exact = 1 / (w * w) / Math.sqrt((1 - r * r) ** 2 + (2 * xi * r) ** 2);
  assert.ok(Math.abs(m / exact - 1) < 1e-3, `${m} ≠ ${exact}`);
});

test("accélérogramme reproductible : même graine, même signal", () => {
  const a = actionSismique(EXEMPLE_PONT_DALLE);
  const c = spectreCible(a.spectres.elastiqueH, false);
  const o = { ...OPTIONS_TEMPOREL, iterations: 3 };
  const x1 = accelerogramme(c, o, 42), x2 = accelerogramme(c, o, 42), x3 = accelerogramme(c, o, 43);
  assert.deepEqual(Array.from(x1.a.slice(0, 50)), Array.from(x2.a.slice(0, 50)));
  assert.notDeepEqual(Array.from(x1.a.slice(100, 150)), Array.from(x3.a.slice(100, 150)));
});

test("jeu d'accélérogrammes conforme à l'EN 1998-1 3.2.3.1.2(4)", () => {
  const a = actionSismique(EXEMPLE_PONT_DALLE);
  for (const [d, f, T1] of [["x", a.spectres.elastiqueH, 1.0], ["z", a.spectres.elastiqueV, 0.1]] as const) {
    const j = jeuAccelerogrammes(d, f, T1);
    assert.ok(j.controles.nombre && j.controles.pga.ok, `${d} PGA ${j.controles.pga.moyenne} < ${j.controles.pga.agS}`);
    assert.ok(j.controles.plage.ok, `${d} rapport ${j.controles.plage.rapportMin}`);
  }
});

test("exemple du guide : moyenne temporelle et multimodale spectrale à 12 % près", () => {
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p), m = modele(p);
  const th = temporelLineaire(p, a, m, analyse(p, a, m));
  for (const r of [th.directions.x.ubdp, th.directions.y.ubdp, th.directions.z]) {
    for (const x of r.moyennes) if (x.Fspectral > 0.05) assert.ok(Math.abs(x.F / x.Fspectral - 1) < 0.12, `${r.direction} ${x.id} : ${x.F} / ${x.Fspectral}`);
  }
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  for (const s of th.note) for (const l of s.lignes) for (const ref of l.references) assert.ok(ids.has(ref), `${l.id} : ${ref}`);
  const h = historique(p, a, m, "x", "lbdp", th.jeux.x.accelerogrammes[0]!);
  assert.equal(h.t.length, h.tablier.length);
  assert.ok(Math.max(...h.d[0]!.map(Math.abs)) > 0);
});
