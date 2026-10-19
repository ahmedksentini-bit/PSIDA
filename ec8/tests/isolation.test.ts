import { test } from "node:test";
import assert from "node:assert/strict";

import { actionSismique } from "../src/moteur/action.ts";
import { ISOLATION_DEFAUT, modeFondamentalIsole, notePontIsole, pontIsole, proprietes, temporelIsole } from "../src/moteur/isolation.ts";
import { valeur } from "../src/moteur/spectres.ts";
import { jeuAccelerogrammes } from "../src/moteur/temporel.ts";
import { EXEMPLE_PONT_DALLE } from "../src/projet/exemple.ts";
import type { Isolation } from "../src/projet/types.ts";
import { REFERENTIEL } from "../src/referentiel/index.ts";

test("bilinéaire LRB et pendule : K_e, F_0, d_y ; UBDP = λ_U × DP, LBDP = DP", () => {
  const lrb = proprietes(ISOLATION_DEFAUT, 1, "DP");
  assert.ok(Math.abs(lrb.Ke - 4) < 1e-12 && Math.abs(lrb.dy - 0.01 / 3.6) < 1e-12);
  const ub = proprietes(ISOLATION_DEFAUT, 1, "UBDP");
  assert.ok(Math.abs(ub.Kp / lrb.Kp - 1.3) < 1e-12 && Math.abs(ub.F0 / lrb.F0 - 1.1) < 1e-12);
  assert.deepEqual(proprietes(ISOLATION_DEFAUT, 1, "LBDP"), lrb);
  const fps = proprietes({ ...ISOLATION_DEFAUT, type: "pendule", R: 2.5, mu: 0.05 }, 0.8, "DP");
  assert.ok(Math.abs(fps.Kp - 0.32) < 1e-12 && Math.abs(fps.F0 - 0.04) < 1e-12);
});

test("mode fondamental : point fixe de l'itération, ξ_eff (7.5), T_eff (7.6) et tableau 7.1", () => {
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p);
  const mf = modeFondamentalIsole(p, a, ISOLATION_DEFAUT, "DP", "x");
  const ED = mf.lignes.reduce((s, l) => s + l.ED, 0);
  assert.ok(Math.abs(mf.xiEff - ED / (2 * Math.PI * mf.Keff * mf.dcd ** 2)) < 1e-3);
  assert.ok(Math.abs(mf.Teff - 2 * Math.PI * Math.sqrt(mf.Md / 1000 / mf.Keff)) < 1e-3);
  const eta = Math.sqrt(0.1 / (0.05 + mf.xiEff));
  const f = { ...a.spectres.elastiqueH, plateau: 2.5 * eta };
  if (mf.Teff >= a.TC && mf.Teff < a.TD) {
    const dC = (0.625 / Math.PI ** 2) * f.amplitude * eta * a.TC ** 2;
    assert.ok(Math.abs(mf.dcd / ((mf.Teff / a.TC) * dC) - 1) < 2e-3, `${mf.dcd}`);
  }
  assert.ok(Math.abs(mf.Vd / ((mf.Md / 1000) * valeur(f, mf.Teff)) - 1) < 2e-3);
});

test("pendule seul, frottement nul : T_eff = 2π √(R/g)", () => {
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p);
  const iso: Isolation = { ...ISOLATION_DEFAUT, type: "pendule", R: 2, mu: 1e-6, lambdaKp: 1, lambdaF0: 1 };
  const mf = modeFondamentalIsole(p, a, iso, "DP", "x");
  const T = 2 * Math.PI * Math.sqrt(2 / p.options.g);
  // la souplesse des piles allonge légèrement la période
  assert.ok(mf.Teff >= T * 0.999 && mf.Teff < T * 1.05, `${mf.Teff} / ${T}`);
});

test("pont isolé : vérifications, contrôle temporel proche du mode fondamental, références", () => {
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p);
  const r = pontIsole(p, a, ISOLATION_DEFAUT, "x");
  assert.ok(r.UBDP.Vd > r.LBDP.Vd && r.LBDP.dcd > r.UBDP.dcd);
  assert.ok(r.verif.total > 0 && r.verif.rappel.drm > 0);
  const jeu = jeuAccelerogrammes("x", a.spectres.elastiqueH, r.LBDP.Teff, { nombre: 3, dt: 0.01, montee: 2, stationnaire: 10, descente: 8, graine: 1998, iterations: 4 });
  const t = temporelIsole(p, a, ISOLATION_DEFAUT, "LBDP", "x", jeu, r.LBDP);
  // la linéarisation équivalente (7.5.4) est conservative : ρ_d < 1, borné à 0,80 par 7.5.5(7)
  assert.ok(t.rhoD > 0.5 && t.rhoD < 1.2, `${t.rhoD}`);
  const ids = new Set(REFERENTIEL.map((e) => e.id));
  for (const s of notePontIsole(ISOLATION_DEFAUT, r)) for (const l of s.lignes) for (const ref of l.references) assert.ok(ids.has(ref), `${l.id} : ${ref}`);
});
