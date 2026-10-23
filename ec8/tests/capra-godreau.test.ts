// Corrections tirées de Capra et Godreau, « Ouvrages d'art en zone sismique » (2015) : non-glissement des élastomères
// (EN 1337-3 5.3.3.6), appareils fixes (EN 1998-2 6.6.2.1), inertie propre des fûts (EN 1998-2 4.1.2).
import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { analyse } from "../src/moteur/analyse.ts";
import { exporterEfforts, inertieFuts } from "../src/moteur/export-efforts.ts";
import { modele } from "../src/moteur/modele.ts";
import { valeur } from "../src/moteur/spectres.ts";
import { verifierAppuis } from "../src/moteur/verif-appuis.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Pile } from "../src/projet/types.ts";

const nb = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

test("non-glissement des élastomères : μ = 0,1 + 1,5 K_f/σ_m (EN 1337-3 5.3.3.6)", () => {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  const a = actionSismique(p), m = modele(p), r = analyse(p, a, m);
  const v = verifierAppuis(p, a, m, r);
  const lignes = v.note.flatMap((s) => s.lignes).filter((l) => l.id.endsWith("_glissement"));
  assert.ok(lignes.length > 0);
  for (const l of lignes) {
    assert.match(l.formule ?? "", /1\{,\}5/);
    const N = nb(/NEd,min = \(Nmin − 0,3 Rv\)\/n = ([\d\s,−-]+) kN/.exec(l.commentaire ?? "")![1]!) / 1000;
    const sigma = nb(/σm = ([\d,]+) MPa/.exec(l.commentaire ?? "")![1]!);
    const R = l.resultat!.valeur as number;
    if (N > 0) assert.ok(Math.abs(R - (0.1 + (1.5 * p.elastomeres.Kf) / sigma) * N) < 0.02 * R + 1e-3, `${l.id} : R = ${R}`);
  }
});

test("appareils fixes : effort de calcul max(1,3 ; q)·F_Ed en ductilité limitée (EN 1998-2 6.6.2.1)", () => {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  const i = p.appuis.findIndex((ap) => ap.type === "pile");
  (p.appuis[i] as Pile).appareils = { type: "fixe", nombre: 2, a: 0.6, b: 0.6, hauteur: 0.15 } as never;
  const run = (q: number) => {
    p.comportement.qLongitudinal = q; p.comportement.qTransversal = q;
    const a = actionSismique(p), m = modele(p), r = analyse(p, a, m);
    const c = verifierAppuis(p, a, m, r).criteres.find((x) => x.id === `${p.appuis[i]!.id}_rigides`)!;
    const F = Math.max(r.directions.x.ubdp.appuis[i]?.F ?? 0, r.directions.y.ubdp.appuis[i]?.F ?? 0);
    return { c, F };
  };
  const r1 = run(1);
  assert.ok(Math.abs((r1.c.valeur as number) - 1.3 * r1.F) < 1e-9);
  const r2 = run(1.5);
  assert.ok(Math.abs((r2.c.valeur as number) - 1.5 * r2.F) < 1e-9, "q = 1,5 > 1,3 : effort × q");
  assert.match(r2.c.libelle, /× q/);
});

test("inertie propre des fûts : F = m (a₀ + a_H)/2, M = m H (a₀ + 2 a_H)/6, transmise dans l'export des efforts", () => {
  const p = structuredClone(EXEMPLE_PONT_DALLE);
  const a = actionSismique(p), m = modele(p), r = analyse(p, a, m);
  const T = { x: r.directions.x.lbdp.T, y: r.directions.y.lbdp.T };
  const f = inertieFuts(p, a, T);
  const i = p.appuis.findIndex((ap) => ap.type === "pile"), fi = f[i]!;
  assert.ok(fi && f.every((x, k) => (p.appuis[k]!.type === "pile") === !!x));
  const pile = p.appuis[i] as Pile;
  assert.ok(Math.abs(fi.x.a0 - a.ag * a.S * (a.ST ?? 1)) < 1e-12, "pied : mouvement du sol a_g S");
  assert.ok(fi.x.aH >= valeur(a.spectres.calculLong, T.x) - 1e-12, "tête : au moins S_d(T₁)");
  assert.ok(Math.abs(fi.x.F - (fi.masse * (fi.x.a0 + fi.x.aH)) / 2000) < 1e-12);
  assert.ok(Math.abs(fi.x.M - (fi.masse * pile.futs.hauteur * (fi.x.a0 + 2 * fi.x.aH)) / 6000) < 1e-12);
  const e = exporterEfforts(p, a, r);
  const ap = e.appuis[i]!;
  assert.ok(ap.inertieFut && Math.abs(ap.cas[0]!.fut!.Fx - 1000 * fi.x.F) < 1e-6 && Math.abs(ap.cas[1]!.fut!.Fx - 300 * fi.x.F) < 1e-6);
  assert.ok(!e.appuis.find((x) => x.type === "culee")!.inertieFut);
  assert.ok(e.remarques.some((t) => /Inertie propre des fûts ajoutée/.test(t)));
});
