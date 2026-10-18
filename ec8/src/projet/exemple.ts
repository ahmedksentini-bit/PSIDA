// Pont dalle de l'annexe 1 du guide Cerema 2015 (p. 241 à 277), cas de validation.

import type { AppareilsElastomere, Culee, Pile, Projet } from "./types.ts";

const appareilsCulee: AppareilsElastomere = {
  type: "elastomere",
  nombre: 4,
  a: 0.3,
  b: 0.35,
  nbFeuillets: 3,
  ti: 0.012,
  enrobage: 0.012,
  ts: 0.003,
  plaqueExterieure: 0.018,
  Gg: 0.9,
  enrobageLateral: 0.005,
  fixation: "mecanique",
};

const appareilsPile: AppareilsElastomere = { ...appareilsCulee, a: 0.4, b: 0.4 };

const culee = (id: string): Culee => ({
  type: "culee",
  id,
  poteaux: { nombre: 2, cote: 0.8, entraxe: 6.2, hauteur: 4.0 },
  sommier: { long: 2.0, haut: 1.0, trans: 12.6, debordAvant: 0.2 },
  gardeGreve: { hauteur: 0.8, epaisseur: 0.4, retrait: 0.2 },
  longrine: { long: 1.0, haut: 0.8, trans: 7.8 },
  semelle: { long: 3.0, trans: 10.0, epaisseur: 0.8 },
  excentrementAppui: 0.5,
  rigide: { longitudinal: true, transversal: false },
  appareils: appareilsCulee,
  butees: { transversales: true, longitudinales: false },
  // Réactions ELS QP (Gk + Sdiff ± 0,5 Tk) et rotations du guide, calculées avec CHAMOA-P (p. 244 et 256).
  chargesPermanentes: { Nmax: 0.987, Nmin: 0.813, rotation: 0.00062 },
});

const pile = (id: string): Pile => ({
  type: "pile",
  id,
  futs: { forme: "rectangulaire", nombre: 2, long: 0.8, trans: 2.5, entraxe: 5.2, hauteur: 5.5 },
  semelle: { long: 5.3, trans: 12.0, epaisseur: 1.0 },
  appareils: appareilsPile,
  butees: { transversales: false, longitudinales: false },
  chargesPermanentes: { Nmax: 3.605, Nmin: 3.265, rotation: 0.00093 },
});

export const EXEMPLE_PONT_DALLE: Projet = {
  version: 1,
  nom: "Pont dalle — exemple du guide Cerema",
  description:
    "Annexe 1 du guide « Ponts en zone sismique » (Cerema, 2015) : pont dalle en béton armé à trois travées. Débord d'about et position du garde-grève estimés (non cotés par le guide). g = 10 m/s² reproduit la masse de 822 t du guide.",
  site: {
    commune: "Chambéry (73)",
    zone: 4,
    categorie: "III",
    classeSol: "C",
    ST: 1.0,
    trafic: "cas_general",
  },
  materiaux: {
    beton: { classe: "C35/45", fck: 35, masseVolumique: 2.5 },
    acier: { fyk: 500, classeDuctilite: "B" },
  },
  tablier: {
    type: "dalle_ba",
    travees: [9.715, 16.191, 9.715],
    largeur: 12.25,
    epaisseur: 0.6,
    aire: 7.35,
    superstructures: 47,
    debordAbout: 0.25,
    chargeTrafic: 0,
  },
  appuis: [culee("C0"), pile("P1"), pile("P2"), culee("C3")],
  comportement: { qLongitudinal: 1, qTransversal: 1.5, amortissement: 5, plateauOrigine: true },
  elastomeres: { T0: 10, Tmin: -30, lambdaMaxF1: 1.1, lambdaMaxF2: 1.1, psiFi: 0.7, gammaIS: 1.5, Kf: 0.6 },
  service: { retraitFluage: 0.00049, deltaT: 42, alpha: 1e-5 },
  options: { g: 10 },
};
