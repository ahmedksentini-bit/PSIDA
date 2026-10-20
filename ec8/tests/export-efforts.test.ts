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

test("méthodes d'efforts : multimodale, temporel linéaire, pont isolé, et effets pour les fondations (EN 1998-2 5.8.2)", async () => {
  const { multimodale } = await import("../src/moteur/multimodal.ts");
  const { pontIsole, ISOLATION_DEFAUT } = await import("../src/moteur/isolation.ts");
  const { temporelLineaire } = await import("../src/moteur/temporel.ts");
  const { effetsFondations, gamma0 } = await import("../src/moteur/export-efforts.ts");
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p), m = modele(p), r = analyse(p, a, m);
  // multimodale : appel historique (4e argument = résultat multimodal)
  const mm = multimodale(p, a, m, r);
  const e1 = exporterEfforts(p, a, r, mm);
  assert.equal(e1.methode, "multimodale");
  // pont isolé : efforts UBDP par ligne, q = 1 ; fondations = AEd
  const iso = { x: pontIsole(p, a, ISOLATION_DEFAUT, "x"), y: pontIsole(p, a, ISOLATION_DEFAUT, "y") };
  const e2 = exporterEfforts(p, a, r, { isole: iso }, "pont_isole");
  assert.equal(e2.methode, "pont_isole");
  e2.appuis.forEach((ap, i) => {
    assert.ok(Math.abs(ap.cas[0]!.Fx - 1000 * iso.x.UBDP.lignes[i]!.F) < 1e-9);
    assert.ok(Math.abs(ap.casFondations![0]!.Fx - ap.cas[0]!.Fx) < 1e-9, "isolé : fondations = AEd (q = 1)");
  });
  // temporel linéaire : moyennes sur 7 accélérogrammes (réduit pour le test : 3 accélérogrammes → maximum)
  const th = temporelLineaire(p, a, m, r, { nombre: 3, dt: 0.01, montee: 2, stationnaire: 8, descente: 6, graine: 1998, iterations: 4 });
  const e3 = exporterEfforts(p, a, r, { temporel: th }, "temporel_lineaire");
  e3.appuis.forEach((ap, i) => assert.ok(Math.abs(ap.cas[0]!.Fx - 1000 * th.directions.x.ubdp.moyennes[i]!.Fmax) < 1e-9));
  // ductilité limitée : fondations = AEd × q
  const e0 = exporterEfforts(p, a, r);
  const qx = a.q.longitudinal;
  if (qx <= 1.5) e0.appuis.forEach((ap) => assert.ok(Math.abs(ap.casFondations![0]!.Fx - qx * ap.cas[0]!.Fx) < 1e-6));
  // comportement ductile : capacité des piles bornée par V_E et q·V_E ; culées au prorata (G.4)
  const pd = structuredClone(p); pd.comportement.qLongitudinal = 3; pd.comportement.qTransversal = 3;
  const ad = actionSismique(pd), md = modele(pd), rd = analyse(pd, ad, md);
  const VE = pd.appuis.map((_, i) => rd.directions.x.ubdp.appuis[i]!.F);
  const det = effetsFondations(pd, md, "x", ad.q.longitudinal, VE, false);
  det.forEach((d, i) => { assert.ok(d.VC >= d.VE - 1e-12 && d.VC <= ad.q.longitudinal * d.VE + 1e-12, `${i}`); if (pd.appuis[i]!.type === "pile") assert.ok(d.MRd! > 0 && d.gamma0! >= 1.35); });
  // 5.3(8)P : appareils en élastomère, V_b = 1,3 K_b d_b ; culées sur élastomères : V_b ; piles : min(V_C ; V_b)
  const dApp = pd.appuis.map((_, i) => rd.directions.x.lbdp.appuis[i]!.dAppareils);
  const d8 = effetsFondations(pd, md, "x", ad.q.longitudinal, VE, false, dApp);
  d8.forEach((d, i) => {
    const k = md.directions.x.appuis[i]!.kAppareils.lbdp;
    if (!md.elastomeres || !Number.isFinite(k) || dApp[i]! <= 0) return;
    assert.ok(Math.abs(d.Vappareils! - 1.3 * k * dApp[i]!) < 1e-12);
    const attendu = pd.appuis[i]!.type === "pile" ? Math.min(d.VCbrut!, d.Vappareils!) : d.Vappareils!;
    assert.ok(Math.abs(d.VC - Math.min(Math.max(attendu, d.VE), ad.q.longitudinal * d.VE)) < 1e-12, `${i}`);
  });
  assert.equal(gamma0(0.05), 1.35);
  assert.ok(Math.abs(gamma0(0.3) - 1.35 * 1.08) < 1e-12);
});
