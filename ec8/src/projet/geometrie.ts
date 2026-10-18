// Grandeurs déduites de la saisie et solides de la maquette 3D.
// Les solides sont exprimés dans le repère du pont (X longitudinal, Y transversal, Z vertical),
// origine X à l'axe d'appui de la culée de début, Z = 0 au point le plus bas des fondations.

import type { Appui, Culee, LigneAppareils, Pile, Projet } from "./types.ts";

export type Vec3 = [number, number, number];

export type Role = "tablier" | "fut" | "semelle" | "appareil" | "poteau" | "sommier" | "garde_greve" | "longrine";

export interface Solide {
  id: string;
  /** Identifiant de l'appui porteur, null pour le tablier. */
  appui: string | null;
  role: Role;
  forme: "boite" | "cylindre";
  centre: Vec3;
  /** Boîte : dX, dY, dZ. Cylindre (axe vertical) : diamètre, diamètre, hauteur. */
  dims: Vec3;
  libelle: string;
  typeAppareil?: LigneAppareils["type"];
}

export interface Maquette {
  solides: Solide[];
  /** Abscisses des axes d'appui. */
  positions: number[];
  /** Cote du dessus du tablier. */
  zTablier: number;
  bornes: { min: Vec3; max: Vec3 };
}

const somme = (v: number[]) => v.reduce((a, b) => a + b, 0);
const m = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const cote = (...v: number[]) => `${v.map((x) => m.format(x)).join(" × ")} m`;

export const positionsAppuis = (travees: number[]): number[] => {
  const x = [0];
  for (const t of travees) x.push((x.at(-1) ?? 0) + t);
  return x;
};

export function epaisseurElastomere(a: LigneAppareils): number | null {
  return a.type === "elastomere" ? a.nbFeuillets * a.ti + 2 * a.enrobage : null;
}

export function hauteurAppareil(a: LigneAppareils): number {
  if (a.type !== "elastomere") return a.hauteur;
  return a.nbFeuillets * a.ti + 2 * a.enrobage + (a.nbFeuillets + 1) * a.ts + 2 * a.plaqueExterieure;
}

export interface Derives {
  positions: number[];
  /** Longueur entre axes d'appui des culées (m). */
  longueur: number;
  /** Longueur hors tout du tablier (m). */
  longueurTablier: number;
  poidsLineique: { beton: number; superstructures: number; total: number };
  /** Masse linéique du tablier (t/m). */
  masseLineique: number;
  /** Masse du tablier entre axes d'appui des culées (t). */
  masseTablier: number;
  soumis: { soumis: boolean; motif: string };
}

export function derives(p: Projet): Derives {
  const positions = positionsAppuis(p.tablier.travees);
  const longueur = somme(p.tablier.travees);
  const beton = p.tablier.aire * p.materiaux.beton.masseVolumique * p.options.g;
  const total = beton + p.tablier.superstructures;
  const masseLineique = total / p.options.g;
  const { zone, categorie } = p.site;
  const soumis =
    zone === 1
      ? { soumis: false, motif: "Zone de sismicité 1 : pont non soumis aux règles parasismiques (arrêté du 26/10/2011, art. 3)." }
      : categorie === "I"
        ? { soumis: false, motif: "Catégorie d'importance I : pont non soumis aux règles parasismiques (arrêté du 26/10/2011, art. 3)." }
        : { soumis: true, motif: `Zone ${zone}, catégorie ${categorie} : règles de l'Eurocode 8 applicables (arrêté du 26/10/2011, art. 3 et 4).` };
  return {
    positions,
    longueur,
    longueurTablier: longueur + 2 * p.tablier.debordAbout,
    poidsLineique: { beton, superstructures: p.tablier.superstructures, total },
    masseLineique,
    masseTablier: masseLineique * longueur,
    soumis,
  };
}

/** Ordonnées réparties symétriquement autour de 0. */
const repartir = (n: number, pas: number): number[] => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pas);

function ordonneesAppareilsPile(pile: Pile): number[] {
  const { futs, appareils } = pile;
  const parFut = appareils.nombre / futs.nombre;
  const axesFuts = repartir(futs.nombre, futs.entraxe);
  if (Number.isInteger(parFut) && parFut >= 1) {
    return axesFuts.flatMap((y) => repartir(parFut, futs.trans / parFut).map((dy) => y + dy));
  }
  const largeur = (futs.nombre - 1) * futs.entraxe + futs.trans;
  return repartir(appareils.nombre, appareils.nombre > 1 ? (largeur - appareils.b) / (appareils.nombre - 1) : 0);
}

function ordonneesAppareilsCulee(culee: Culee): number[] {
  const n = culee.appareils.nombre;
  const utile = Math.max(culee.sommier.trans - 2, culee.appareils.b);
  return repartir(n, n > 1 ? (utile - culee.appareils.b) / (n - 1) : 0);
}

function solidesAppareils(appui: Appui, x: number, zAssise: number, ys: number[]): Solide[] {
  const a = appui.appareils;
  const h = hauteurAppareil(a);
  const nom = a.type === "elastomere" ? "Appareil en élastomère fretté" : a.type === "fixe" ? "Appareil fixe" : "Appareil glissant";
  return ys.map((y, i) => ({
    id: `${appui.id}.appareil.${i + 1}`,
    appui: appui.id,
    role: "appareil",
    forme: "boite",
    centre: [x, y, zAssise + h / 2],
    dims: [a.a, a.b, h],
    libelle: `${nom} ${i + 1} sur ${appui.id} — ${cote(a.a, a.b)}, hauteur ${m.format(h)} m`,
    typeAppareil: a.type,
  }));
}

function solidesPile(pile: Pile, x: number): Solide[] {
  const zAssise = -hauteurAppareil(pile.appareils);
  const { futs, semelle } = pile;
  const zPied = zAssise - futs.hauteur;
  const rond = futs.forme === "circulaire";
  const resultat: Solide[] = repartir(futs.nombre, futs.entraxe).map((y, i) => ({
    id: `${pile.id}.fut.${i + 1}`,
    appui: pile.id,
    role: "fut",
    forme: rond ? "cylindre" : "boite",
    centre: [x, y, zAssise - futs.hauteur / 2],
    dims: rond ? [futs.long, futs.long, futs.hauteur] : [futs.long, futs.trans, futs.hauteur],
    libelle: rond
      ? `Fût ${i + 1} de ${pile.id} — diamètre ${m.format(futs.long)} m, hauteur ${m.format(futs.hauteur)} m`
      : `Fût ${i + 1} de ${pile.id} — ${cote(futs.long, futs.trans)}, hauteur ${m.format(futs.hauteur)} m`,
  }));
  resultat.push({
    id: `${pile.id}.semelle`,
    appui: pile.id,
    role: "semelle",
    forme: "boite",
    centre: [x, 0, zPied - semelle.epaisseur / 2],
    dims: [semelle.long, semelle.trans, semelle.epaisseur],
    libelle: `Semelle de ${pile.id} — ${cote(semelle.long, semelle.trans, semelle.epaisseur)}`,
  });
  return [...resultat, ...solidesAppareils(pile, x, zAssise, ordonneesAppareilsPile(pile))];
}

function solidesCulee(culee: Culee, x: number, sens: 1 | -1): Solide[] {
  // sens = +1 si le remblai est du côté des X croissants (culée de fin), −1 sinon.
  const zAssise = -hauteurAppareil(culee.appareils);
  const { poteaux, sommier, gardeGreve, longrine, semelle } = culee;
  const xPoteaux = x - sens * culee.excentrementAppui;
  const avantSommier = xPoteaux - sens * (poteaux.cote / 2 + sommier.debordAvant);
  const arriereSommier = avantSommier + sens * sommier.long;
  const arriereGG = arriereSommier - sens * gardeGreve.retrait;
  const zBasSommier = zAssise - sommier.haut;
  const zPiedPoteaux = zBasSommier - poteaux.hauteur;
  const zBasLongrine = longrine ? zPiedPoteaux - longrine.haut : zPiedPoteaux;

  const resultat: Solide[] = [
    {
      id: `${culee.id}.sommier`,
      appui: culee.id,
      role: "sommier",
      forme: "boite",
      centre: [(avantSommier + arriereSommier) / 2, 0, zAssise - sommier.haut / 2],
      dims: [sommier.long, sommier.trans, sommier.haut],
      libelle: `Sommier de ${culee.id} — ${cote(sommier.long, sommier.trans, sommier.haut)}`,
    },
    {
      id: `${culee.id}.garde_greve`,
      appui: culee.id,
      role: "garde_greve",
      forme: "boite",
      centre: [arriereGG - (sens * gardeGreve.epaisseur) / 2, 0, zAssise + gardeGreve.hauteur / 2],
      dims: [gardeGreve.epaisseur, sommier.trans, gardeGreve.hauteur],
      libelle: `Mur garde-grève de ${culee.id} — épaisseur ${m.format(gardeGreve.epaisseur)} m, hauteur ${m.format(gardeGreve.hauteur)} m`,
    },
    ...repartir(poteaux.nombre, poteaux.entraxe).map(
      (y, i): Solide => ({
        id: `${culee.id}.poteau.${i + 1}`,
        appui: culee.id,
        role: "poteau",
        forme: "boite",
        centre: [xPoteaux, y, zBasSommier - poteaux.hauteur / 2],
        dims: [poteaux.cote, poteaux.cote, poteaux.hauteur],
        libelle: `Poteau ${i + 1} de ${culee.id} — ${cote(poteaux.cote, poteaux.cote)}, hauteur ${m.format(poteaux.hauteur)} m`,
      }),
    ),
  ];
  if (longrine) {
    resultat.push({
      id: `${culee.id}.longrine`,
      appui: culee.id,
      role: "longrine",
      forme: "boite",
      centre: [xPoteaux, 0, zPiedPoteaux - longrine.haut / 2],
      dims: [longrine.long, longrine.trans, longrine.haut],
      libelle: `Longrine de ${culee.id} — ${cote(longrine.long, longrine.trans, longrine.haut)}`,
    });
  }
  resultat.push({
    id: `${culee.id}.semelle`,
    appui: culee.id,
    role: "semelle",
    forme: "boite",
    centre: [xPoteaux, 0, zBasLongrine - semelle.epaisseur / 2],
    dims: [semelle.long, semelle.trans, semelle.epaisseur],
    libelle: `Semelle de ${culee.id} — ${cote(semelle.long, semelle.trans, semelle.epaisseur)}`,
  });
  return [...resultat, ...solidesAppareils(culee, x, zAssise, ordonneesAppareilsCulee(culee))];
}

export function maquette(p: Projet): Maquette {
  const positions = positionsAppuis(p.tablier.travees);
  const longueur = positions.at(-1) ?? 0;
  const { tablier } = p;
  const solides: Solide[] = [
    {
      id: "tablier",
      appui: null,
      role: "tablier",
      forme: "boite",
      centre: [longueur / 2, 0, tablier.epaisseur / 2],
      dims: [longueur + 2 * tablier.debordAbout, tablier.largeur, tablier.epaisseur],
      libelle: `Tablier — ${cote(longueur + 2 * tablier.debordAbout, tablier.largeur, tablier.epaisseur)}`,
    },
  ];
  p.appuis.forEach((appui, i) => {
    const x = positions[i];
    if (x === undefined) return;
    if (appui.type === "pile") solides.push(...solidesPile(appui, x));
    else solides.push(...solidesCulee(appui, x, i === 0 ? -1 : 1));
  });

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of solides) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k] ?? Infinity, (s.centre[k] ?? 0) - (s.dims[k] ?? 0) / 2);
      max[k] = Math.max(max[k] ?? -Infinity, (s.centre[k] ?? 0) + (s.dims[k] ?? 0) / 2);
    }
  }
  const dz = -min[2];
  for (const s of solides) s.centre = [s.centre[0], s.centre[1], s.centre[2] + dz];
  return {
    solides,
    positions,
    zTablier: tablier.epaisseur + dz,
    bornes: { min: [min[0], min[1], 0], max: [max[0], max[1], max[2] + dz] },
  };
}
