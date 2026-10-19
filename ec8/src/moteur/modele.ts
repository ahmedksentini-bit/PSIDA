// Étape 4 : masses, module des élastomères, raideurs des appuis et amortissement.
// Unités : t, MN/m, MPa, m. Fondations supposées infiniment rigides (V1).

import { derives, epaisseurElastomere } from "../projet/geometrie.ts";
import type { Appui, Culee, Pile, Projet } from "../projet/types.ts";
import { PSI_21, TEMPERATURE_MIN_ISOLATEUR } from "../referentiel/nationaux.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";

export type Direction = "x" | "y";
export type Borne = "lbdp" | "ubdp";
type ParBorne = Record<Borne, number>;

export interface RaideurAppui {
  id: string;
  type: Appui["type"];
  /** Raideur propre de l'appui (fûts ou poteaux), Infinity si supposé rigide. */
  kSupport: number;
  /** Raideur de la ligne d'appareils, Infinity si bloquée, 0 si libre. */
  kAppareils: ParBorne;
  kTotal: ParBorne;
  /** Part de la raideur totale de l'ouvrage. */
  part: ParBorne;
  description: string;
}

export interface Modele {
  Ecm: number;
  masses: {
    masseLineique: number;
    tablier: number;
    trafic: number;
    psi21: number;
    /** Masse sismique du tablier (y compris demi-piles des appuis fixes). */
    M: number;
    piles: { id: string; masseFuts: number; ajoutTablier: number }[];
  };
  elastomeres: {
    Gg: number;
    Gb: number;
    Tminb: number;
    lambdaU1: number;
    lambdaU2: number;
    GbMax: number;
    regle: "1,2 Gb" | "λ";
    G: ParBorne;
  } | null;
  directions: Record<Direction, { appuis: RaideurAppui[]; K: ParBorne }>;
  amortissement: { xi: number; ecartSaisie: number };
  note: SectionNote[];
}

const inverse = (k: number) => (k === Infinity ? 0 : k === 0 ? Infinity : 1 / k);
const serie = (...ks: number[]) => inverse(ks.reduce((s, k) => s + inverse(k), 0));
const fmtK = (k: number, d = 2) => (k === Infinity ? "\\infty" : tex(k, d));
const txtK = (k: number) => (k === Infinity ? "rigide" : `${nombre(k, 2)} MN/m`);

export function inerties(appui: Pile): { Ix: number; Iy: number; aire: number } {
  const { forme, long, trans } = appui.futs;
  if (forme === "circulaire") {
    const I = (Math.PI * long ** 4) / 64;
    return { Ix: I, Iy: I, aire: (Math.PI * long ** 2) / 4 };
  }
  // Ix : flexion sous séisme longitudinal (épaisseur selon X) ; Iy : séisme transversal.
  return { Ix: (trans * long ** 3) / 12, Iy: (long * trans ** 3) / 12, aire: long * trans };
}

export function modele(p: Projet): Modele {
  const d = derives(p);
  const fck = p.materiaux.beton.fck;
  const Ecm = 22 * ((fck + 8) / 10) ** 0.3 * 1000; // MPa
  const E = Ecm; // MN/m² ; avec des longueurs en m, k en MN/m
  const ligneEcm: LigneNote = {
    id: "Ecm",
    titre: "Module d'élasticité instantané du béton",
    formule: "E_{cm} = 22\\left(\\dfrac{f_{ck} + 8}{10}\\right)^{0{,}3}",
    application: `22\\left(\\dfrac{${tex(fck, 0)} + 8}{10}\\right)^{0{,}3} \\times 1000`,
    resultat: { symbole: "E_{cm}", valeur: Ecm, unite: "MPa", decimales: 0 },
    references: ["Ecm"],
  };

  // --- Masses ---------------------------------------------------------------
  const psi21 = PSI_21.valeurs[p.site.trafic];
  const masseTablier = d.masseTablier;
  const masseTrafic = (psi21 * p.tablier.chargeTrafic * d.longueur) / p.options.g;
  const piles = p.appuis
    .filter((a): a is Pile => a.type === "pile")
    .map((pile) => {
      const masseFuts = pile.futs.nombre * inerties(pile).aire * pile.futs.hauteur * p.materiaux.beton.masseVolumique;
      return { id: pile.id, masseFuts, ajoutTablier: pile.appareils.type === "fixe" ? masseFuts / 2 : 0 };
    });
  const ajoutPiles = piles.reduce((s, x) => s + x.ajoutTablier, 0);
  const M = masseTablier + masseTrafic + ajoutPiles;

  const lignesMasses: LigneNote[] = [
    {
      id: "masse_tablier",
      titre: "Masse du tablier",
      formule: "M_{tablier} = \\dfrac{\\rho\\,A\\,g + g_{sup}}{g}\\,L",
      application: `\\dfrac{${tex(p.materiaux.beton.masseVolumique, 2)} \\times ${tex(p.tablier.aire, 3)} \\times ${tex(p.options.g, 2)} + ${tex(p.tablier.superstructures, 2)}}{${tex(p.options.g, 2)}} \\times ${tex(d.longueur, 3)}`,
      resultat: { symbole: "M_{tablier}", valeur: masseTablier, unite: "t", decimales: 1 },
      references: ["masses_sismiques"],
      commentaire: `Masse linéique ${nombre(d.masseLineique, 3)} t/m, comptée entre les axes d'appui des culées.`,
    },
    {
      id: "masse_trafic",
      titre: "Part des charges de trafic",
      formule: "M_{trafic} = \\psi_{2,1}\\,\\dfrac{q_{trafic}\\,L}{g}",
      application: `${tex(psi21, 1)} \\times \\dfrac{${tex(p.tablier.chargeTrafic, 1)} \\times ${tex(d.longueur, 3)}}{${tex(p.options.g, 2)}}`,
      resultat: { symbole: "M_{trafic}", valeur: masseTrafic, unite: "t", decimales: 1 },
      references: ["psi_21"],
    },
  ];
  if (ajoutPiles > 0) {
    lignesMasses.push({
      id: "masse_piles",
      titre: "Demi-masse des piles sous appareils fixes",
      resultat: { symbole: "\\sum \\tfrac{1}{2} M_{fûts}", valeur: ajoutPiles, unite: "t", decimales: 1 },
      references: ["masses_sismiques"],
      commentaire: piles.filter((x) => x.ajoutTablier > 0).map((x) => `${x.id} : ${nombre(x.ajoutTablier, 1)} t`).join(" ; "),
    });
  }
  lignesMasses.push({
    id: "masse_sismique",
    titre: "Masse sismique",
    formule: "M = M_{tablier} + M_{trafic}" + (ajoutPiles > 0 ? " + \\sum \\tfrac{1}{2} M_{fûts}" : ""),
    resultat: { symbole: "M", valeur: M, unite: "t", decimales: 1 },
    references: ["masses_sismiques"],
    commentaire: `Masse propre des fûts (traitée séparément pour les piles sur appareils souples) : ${piles.map((x) => `${x.id} ${nombre(x.masseFuts, 1)} t`).join(", ") || "aucune pile"}.`,
  });

  // --- Module des élastomères ----------------------------------------------------
  const elastomere = p.appuis.find((a) => a.appareils.type === "elastomere")?.appareils;
  let elastomeres: Modele["elastomeres"] = null;
  const lignesG: LigneNote[] = [];
  if (elastomere && elastomere.type === "elastomere") {
    const Gg = elastomere.Gg;
    const Gb = 1.1 * Gg;
    const materiau = p.tablier.type === "mixte" ? "mixte" : "beton";
    const dT1 = TEMPERATURE_MIN_ISOLATEUR.valeurs[materiau];
    const { T0, Tmin, lambdaMaxF1, lambdaMaxF2, psiFi } = p.elastomeres;
    const Tminb = T0 - 0.5 * (T0 - Tmin) + dT1;
    const lambdaU1 = 1 + (lambdaMaxF1 - 1) * psiFi;
    const lambdaU2 = 1 + (lambdaMaxF2 - 1) * psiFi;
    const regle = Tminb >= 0 ? "1,2 Gb" : "λ";
    const GbMax = regle === "1,2 Gb" ? 1.2 * Gb : lambdaU1 * lambdaU2 * Gb;
    elastomeres = { Gg, Gb, Tminb, lambdaU1, lambdaU2, GbMax, regle, G: { lbdp: Gb, ubdp: GbMax } };
    lignesG.push(
      {
        id: "Gb",
        titre: "Module de cisaillement nominal",
        formule: "G_b = 1{,}1\\,G_g",
        application: `1{,}1 \\times ${tex(Gg, 2)}`,
        resultat: { symbole: "G_b", valeur: Gb, unite: "MPa", decimales: 3 },
        references: ["module_G_elastomere"],
        commentaire: "Propriétés limites inférieures (LBDP) : Gb,min = Gb.",
      },
      {
        id: "Tminb",
        titre: "Température minimale des appareils",
        formule: "T_{min,b} = T_0 - \\psi_2\\,(T_0 - T_{min}) + \\Delta T_1",
        application: `${tex(T0, 1)} - 0{,}5 \\times (${tex(T0, 1)} - (${tex(Tmin, 1)})) + ${tex(dT1, 1)}`,
        resultat: { symbole: "T_{min,b}", valeur: Tminb, unite: "°C", decimales: 2 },
        references: ["Tmin_b", "delta_T1_isolateur"],
        commentaire: `Tablier ${materiau === "mixte" ? "mixte" : "en béton"} : ΔT1 = ${nombre(dT1, 1)} °C.`,
      },
    );
    if (regle === "λ") {
      lignesG.push(
        {
          id: "lambdaU",
          titre: "Facteurs de modification (vieillissement et température)",
          formule: "\\lambda_{U,fi} = 1 + (\\lambda_{max,fi} - 1)\\,\\psi_{fi}",
          application: `1 + (${tex(lambdaMaxF1, 2)} - 1) \\times ${tex(psiFi, 2)}`,
          resultat: { symbole: "\\lambda_{U,f1}", valeur: lambdaU1, decimales: 4 },
          references: ["lambda_U"],
          commentaire: `λU,f2 = ${nombre(lambdaU2, 4)} (λmax,f2 = ${nombre(lambdaMaxF2, 2)}).`,
        },
        {
          id: "GbMax",
          titre: "Module en propriétés limites supérieures (UBDP)",
          formule: "G_{b,max} = \\lambda_{U,f1}\\,\\lambda_{U,f2}\\,G_b",
          application: `${tex(lambdaU1, 4)} \\times ${tex(lambdaU2, 4)} \\times ${tex(Gb, 3)}`,
          resultat: { symbole: "G_{b,max}", valeur: GbMax, unite: "MPa", decimales: 3 },
          references: ["lambda_U", "bornes_G_elastomere"],
          commentaire: "Tmin,b < 0 °C : facteurs λ des tableaux JJ.1 et JJ.2.",
        },
      );
    } else {
      lignesG.push({
        id: "GbMax",
        titre: "Module en propriétés limites supérieures (UBDP)",
        formule: "G_{b,max} = 1{,}2\\,G_b",
        application: `1{,}2 \\times ${tex(Gb, 3)}`,
        resultat: { symbole: "G_{b,max}", valeur: GbMax, unite: "MPa", decimales: 3 },
        references: ["bornes_G_elastomere"],
        commentaire: "Tmin,b ≥ 0 °C.",
      });
    }
  }

  // --- Raideurs -------------------------------------------------------------
  const lignes: Record<Direction, LigneNote[]> = { x: [], y: [] };

  const raideurAppui = (appui: Appui, dir: Direction): RaideurAppui => {
    const nomDir = dir === "x" ? "longitudinal" : "transversal";
    let kSupport: number;
    let descSupport: string;
    if (appui.type === "pile") {
      const { Ix, Iy } = inerties(appui);
      const I = dir === "x" ? Ix : Iy;
      const { nombre: n, hauteur: h } = appui.futs;
      kSupport = (n * 3 * E * I) / h ** 3;
      descSupport = `${n} fût(s) en console`;
      lignes[dir].push({
        id: `${appui.id}_${dir}_futs`,
        titre: `${appui.id} — raideur des fûts (${nomDir})`,
        formule: "k_{fûts} = n\\,\\dfrac{3\\,E\\,I}{h^3}",
        application: `${n} \\times \\dfrac{3 \\times ${tex(E, 0)} \\times ${tex(I, 5)}}{${tex(h, 2)}^3}`,
        resultat: { symbole: "k_{fûts}", valeur: kSupport, unite: "MN/m", decimales: 2 },
        references: ["raideur_fut", "inerties_piles", "Ecm"],
        commentaire: "Fûts encastrés en pied (fondation rigide), libres en rotation en tête.",
      });
    } else {
      const c = appui as Culee;
      const rigide = dir === "x" ? c.rigide.longitudinal : c.rigide.transversal;
      const { nombre: n, cote, hauteur: h } = c.poteaux;
      const I = cote ** 4 / 12;
      if (rigide) {
        kSupport = Infinity;
        descSupport = "culée supposée rigide";
        lignes[dir].push({
          id: `${appui.id}_${dir}_culee`,
          titre: `${appui.id} — raideur propre de la culée (${nomDir})`,
          resultat: { symbole: "k_{culée}", valeur: "infinie (culée supposée rigide)" },
          references: ["culee_rigide"],
        });
      } else {
        const coef = dir === "y" ? 12 : 3;
        kSupport = (n * coef * E * I) / h ** 3;
        descSupport = dir === "y" ? `${n} poteau(x) encastrés en pied et en tête` : `${n} poteau(x) en console`;
        lignes[dir].push({
          id: `${appui.id}_${dir}_culee`,
          titre: `${appui.id} — raideur des poteaux (${nomDir})`,
          formule: `k_{culée} = n\\,\\dfrac{${coef}\\,E\\,I}{h^3}`,
          application: `${n} \\times \\dfrac{${coef} \\times ${tex(E, 0)} \\times ${tex(I, 5)}}{${tex(h, 2)}^3}`,
          resultat: { symbole: "k_{culée}", valeur: kSupport, unite: "MN/m", decimales: 2 },
          references: ["raideur_fut", "culee_rigide", "Ecm"],
          commentaire: dir === "y" ? "Poteaux bloqués en rotation par le sommier et la longrine." : "Poteaux en console.",
        });
      }
    }

    // Appareils d'appui
    const a = appui.appareils;
    const bloque = dir === "x" ? appui.butees.longitudinales : appui.butees.transversales;
    let kApp: ParBorne;
    let descApp: string;
    if (bloque || a.type === "fixe") {
      kApp = { lbdp: Infinity, ubdp: Infinity };
      descApp = bloque ? "butées de blocage" : "appareils fixes";
      lignes[dir].push({
        id: `${appui.id}_${dir}_appareils`,
        titre: `${appui.id} — liaison tablier-appui (${nomDir})`,
        resultat: { symbole: "k_{appareils}", valeur: `infinie (${descApp})` },
        references: bloque ? ["butees"] : ["appareils_fixes"],
      });
    } else if (a.type === "glissant") {
      kApp = { lbdp: 0, ubdp: 0 };
      descApp = "appareils glissants (frottement négligé)";
      lignes[dir].push({
        id: `${appui.id}_${dir}_appareils`,
        titre: `${appui.id} — liaison tablier-appui (${nomDir})`,
        resultat: { symbole: "k_{appareils}", valeur: "nulle (appareils glissants, frottement négligé)" },
        references: ["masses_sismiques"],
      });
    } else if (a.type === "elastomere") {
      const Tq = epaisseurElastomere(a) ?? 0;
      const G = elastomeres?.G ?? { lbdp: 1.1 * a.Gg, ubdp: 1.1 * a.Gg };
      kApp = { lbdp: (a.nombre * G.lbdp * a.a * a.b) / Tq, ubdp: (a.nombre * G.ubdp * a.a * a.b) / Tq };
      descApp = `${a.nombre} élastomère(s)`;
      lignes[dir].push({
        id: `${appui.id}_${dir}_appareils`,
        titre: `${appui.id} — raideur des appareils en élastomère (${nomDir})`,
        formule: "k_{appareils} = n\\,\\dfrac{G\\,a\\,b}{T_q}",
        application: `${a.nombre} \\times \\dfrac{${tex(G.lbdp, 3)} \\times ${tex(a.a, 3)} \\times ${tex(a.b, 3)}}{${tex(Tq, 3)}}`,
        resultat: { symbole: "k_{appareils}^{LBDP}", valeur: kApp.lbdp, unite: "MN/m", decimales: 3 },
        references: ["raideur_elastomere", "module_G_elastomere"],
        commentaire: `UBDP (G = ${nombre(G.ubdp, 3)} MPa) : ${nombre(kApp.ubdp, 3)} MN/m.`,
      });
    } else {
      kApp = { lbdp: Infinity, ubdp: Infinity };
      descApp = "liaison rigide";
    }

    const kTotal = { lbdp: serie(kSupport, kApp.lbdp), ubdp: serie(kSupport, kApp.ubdp) };
    lignes[dir].push({
      id: `${appui.id}_${dir}_total`,
      titre: `${appui.id} — raideur de l'appui (${nomDir})`,
      formule: "k_{appui} = \\left(\\dfrac{1}{k_{support}} + \\dfrac{1}{k_{appareils}}\\right)^{-1}",
      application: `\\left(\\dfrac{1}{${fmtK(kSupport)}} + \\dfrac{1}{${fmtK(kApp.lbdp)}}\\right)^{-1}`,
      resultat: { symbole: "k_{appui}^{LBDP}", valeur: kTotal.lbdp === Infinity ? "rigide" : kTotal.lbdp, unite: kTotal.lbdp === Infinity ? undefined : "MN/m", decimales: 3 },
      references: ["raideur_ligne_appui"],
      commentaire: `UBDP : ${txtK(kTotal.ubdp)}.`,
    });
    return { id: appui.id, type: appui.type, kSupport, kAppareils: kApp, kTotal, part: { lbdp: 0, ubdp: 0 }, description: `${descSupport} ; ${descApp}` };
  };

  const directions = {} as Modele["directions"];
  for (const dir of ["x", "y"] as const) {
    const appuis = p.appuis.map((a) => raideurAppui(a, dir));
    const K = {
      lbdp: appuis.reduce((s, a) => s + a.kTotal.lbdp, 0),
      ubdp: appuis.reduce((s, a) => s + a.kTotal.ubdp, 0),
    };
    for (const a of appuis) {
      for (const b of ["lbdp", "ubdp"] as const) {
        a.part[b] = K[b] === Infinity ? (a.kTotal[b] === Infinity ? 1 / appuis.filter((x) => x.kTotal[b] === Infinity).length : 0) : K[b] > 0 ? a.kTotal[b] / K[b] : 0;
      }
    }
    lignes[dir].push({
      id: `K_${dir}`,
      titre: `Raideur totale de l'ouvrage (${dir === "x" ? "longitudinal" : "transversal"})`,
      formule: "K = \\sum_i k_{appui,i}",
      application: appuis.map((a) => fmtK(a.kTotal.lbdp)).join(" + "),
      resultat: { symbole: "K^{LBDP}", valeur: K.lbdp === Infinity ? "rigide (au moins un appui bloqué sur un support rigide)" : K.lbdp, unite: K.lbdp === Infinity ? undefined : "MN/m", decimales: 2 },
      references: ["raideur_ligne_appui", "tablier_rigide"],
      commentaire: `UBDP : ${txtK(K.ubdp)}.`,
      niveau: K.lbdp === Infinity ? "info" : undefined,
    });
    directions[dir] = { appuis, K };
  }

  // --- Amortissement (au prorata des énergies, direction longitudinale, LBDP) ---
  const xiBeton = 0.05; // appuis en béton armé
  const energies = directions.x.appuis
    .filter((a) => a.kTotal.lbdp > 0 && a.kTotal.lbdp < Infinity)
    .flatMap((a) => {
      const F = a.kTotal.lbdp; // effort pour un déplacement unitaire du tablier
      const parts: { xi: number; E: number }[] = [];
      if (a.kSupport < Infinity) parts.push({ xi: xiBeton, E: (F * F) / (2 * a.kSupport) });
      if (a.kAppareils.lbdp < Infinity && a.kAppareils.lbdp > 0) parts.push({ xi: 0.05, E: (F * F) / (2 * a.kAppareils.lbdp) });
      return parts;
    });
  const sommeE = energies.reduce((s, e) => s + e.E, 0);
  const xi = sommeE > 0 ? (100 * energies.reduce((s, e) => s + e.xi * e.E, 0)) / sommeE : 5;
  const ecartSaisie = p.comportement.amortissement - xi;
  const lignesAmortissement: LigneNote[] = [
    {
      id: "xi",
      titre: "Amortissement global (direction longitudinale)",
      formule: "\\xi = \\dfrac{\\sum_k \\xi_k\\,E_k}{\\sum_k E_k}",
      resultat: { symbole: "\\xi", valeur: xi, unite: "%", decimales: 1 },
      references: ["amortissement_global", "amortissement_materiaux"],
      commentaire:
        Math.abs(ecartSaisie) > 0.5
          ? `L'amortissement saisi dans l'action sismique (${nombre(p.comportement.amortissement, 1)} %) diffère de cette valeur.`
          : "Béton armé et élastomère à faible amortissement : 5 %. Cohérent avec la valeur saisie dans l'action sismique.",
      niveau: Math.abs(ecartSaisie) > 0.5 ? "alerte" : undefined,
    },
  ];

  const note: SectionNote[] = [
    { id: "materiaux", titre: "Matériau", lignes: [ligneEcm] },
    { id: "masses", titre: "Masses", lignes: lignesMasses },
  ];
  if (lignesG.length) note.push({ id: "elastomeres", titre: "Module des élastomères", lignes: lignesG });
  note.push(
    { id: "raideurs_x", titre: "Raideurs longitudinales", lignes: lignes.x },
    { id: "raideurs_y", titre: "Raideurs transversales", lignes: lignes.y },
    { id: "amortissement", titre: "Amortissement", lignes: lignesAmortissement },
  );

  return {
    Ecm,
    masses: { masseLineique: d.masseLineique, tablier: masseTablier, trafic: masseTrafic, psi21, M, piles },
    elastomeres,
    directions,
    amortissement: { xi, ecartSaisie },
    note,
  };
}
