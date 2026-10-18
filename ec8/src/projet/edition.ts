// Opérations d'édition qui touchent plusieurs parties du projet à la fois.

import type { AppareilsElastomere, Appui, Culee, LigneAppareils, Pile, Projet } from "./types.ts";

export const CLASSES_BETON: { classe: string; fck: number }[] = [
  { classe: "C25/30", fck: 25 },
  { classe: "C30/37", fck: 30 },
  { classe: "C35/45", fck: 35 },
  { classe: "C40/50", fck: 40 },
  { classe: "C45/55", fck: 45 },
  { classe: "C50/60", fck: 50 },
];

const elastomereParDefaut = (a: number, b: number): LigneAppareils => ({
  type: "elastomere",
  nombre: 4,
  a,
  b,
  nbFeuillets: 3,
  ti: 0.012,
  enrobage: 0.006,
  ts: 0.003,
  plaqueExterieure: 0,
  Gg: 0.9,
  enrobageLateral: 0.005,
  fixation: "mecanique",
});

export const pileParDefaut = (id: string): Pile => ({
  type: "pile",
  id,
  futs: { forme: "rectangulaire", nombre: 2, long: 0.8, trans: 2.5, entraxe: 5.2, hauteur: 6 },
  semelle: { long: 5, trans: 11, epaisseur: 1 },
  appareils: elastomereParDefaut(0.4, 0.4),
  butees: { transversales: false, longitudinales: false },
});

export const culeeParDefaut = (id: string): Culee => ({
  type: "culee",
  id,
  poteaux: { nombre: 2, cote: 0.8, entraxe: 6, hauteur: 4 },
  sommier: { long: 2, haut: 1, trans: 12, debordAvant: 0.2 },
  gardeGreve: { hauteur: 0.8, epaisseur: 0.3, retrait: 0.2 },
  longrine: null,
  semelle: { long: 3, trans: 10, epaisseur: 0.8 },
  excentrementAppui: 0.5,
  rigide: { longitudinal: true, transversal: false },
  appareils: elastomereParDefaut(0.3, 0.4),
  butees: { transversales: true, longitudinales: false },
});

/** Renomme les appuis C0, P1…Pn−1, Cn selon leur rang. */
export function renumeroter(appuis: Appui[]): Appui[] {
  const n = appuis.length - 1;
  return appuis.map((a, i) => ({ ...a, id: a.type === "culee" ? `C${i === 0 ? 0 : n}` : `P${i}` }));
}

/**
 * Ajuste le nombre de travées : les nouvelles travées reprennent la portée de la dernière,
 * les nouvelles piles copient la dernière pile existante. Les culées sont conservées.
 */
export function changerNombreTravees(p: Projet, n: number): Projet {
  const nombre = Math.max(1, Math.min(20, Math.round(n)));
  const travees = p.tablier.travees.slice(0, nombre);
  while (travees.length < nombre) travees.push(travees.at(-1) ?? 20);

  const debut = p.appuis[0]?.type === "culee" ? p.appuis[0] : culeeParDefaut("C0");
  const fin = p.appuis.at(-1)?.type === "culee" ? (p.appuis.at(-1) as Culee) : culeeParDefaut("C1");
  const piles = p.appuis.filter((a): a is Pile => a.type === "pile").slice(0, nombre - 1);
  while (piles.length < nombre - 1) {
    const modele = piles.at(-1);
    piles.push(modele ? structuredClone(modele) : pileParDefaut("P"));
  }
  return { ...p, tablier: { ...p.tablier, travees }, appuis: renumeroter([debut, ...piles, fin]) };
}

/** Change le type des appareils d'une ligne en conservant nombre et dimensions en plan. */
export function changerTypeAppareils(a: LigneAppareils, type: LigneAppareils["type"]): LigneAppareils {
  if (type === a.type) return a;
  if (type === "elastomere") return { ...(elastomereParDefaut(a.a, a.b) as AppareilsElastomere), nombre: a.nombre };
  return { type, nombre: a.nombre, a: a.a, b: a.b, hauteur: a.type === "elastomere" ? 0.1 : a.hauteur };
}
