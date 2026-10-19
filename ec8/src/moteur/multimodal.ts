// Analyse spectrale multimodale (EN 1998-2 4.2.1) : modèle dynamique discret du pont,
// modes propres, masses modales effectives, combinaison des réponses modales (SRSS ou CQC),
// puis comparaison avec la méthode du mode fondamental.
//
// Modèle (une direction à la fois) :
//  · X (longitudinal) : tablier indéformable axialement, un seul degré de liberté de translation ;
//  · Y (transversal) et Z (vertical) : tablier en poutre d'Euler-Bernoulli (8 éléments par travée),
//    inertie transversale ou verticale du tablier, masse répartie (matrice de masse cohérente) ;
//  · piles (X et Y) : fûts en console encastrés en pied (4 éléments), masse répartie, reliés au tablier
//    par la ligne d'appareils (ressort, liaison rigide ou aucune liaison si glissant) ;
//  · culées (X et Y) : ressort de raideur k_appui (série poteaux + appareils) entre le tablier et le sol ;
//  · Z : appuis verticalement indéformables (liaisons rigides au droit de chaque ligne d'appui).
// Les liaisons rigides sont des ressorts très raides (période propre de l'ordre de 2 ms) : la masse qui
// leur est directement liée apparaît dans des modes « rigides » (T < 0,033 s) que l'on peut retenir.
// Unités internes : kN, t, m, s (ω² = k/m en s⁻²) ; résultats en MN et m comme le reste du moteur.

import { derives, inertiesTablier } from "../projet/geometrie.ts";
import type { Pile, Projet } from "../projet/types.ts";
import type { ActionSismique } from "./action.ts";
import type { Analyse } from "./analyse.ts";
import { inerties, type Borne, type Modele } from "./modele.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";
import { valeur, type FormeSpectre } from "./spectres.ts";
import { modesPropres, zeros, type Matrice } from "./valeurs-propres.ts";

export type DirectionMM = "x" | "y" | "z";
export type Regle = "SRSS" | "CQC";

const T_RIGIDE = 0.002; // s : période visée pour une liaison « rigide »
/** Éléments par travée : 8 jusqu'à 6 travées, puis moins (au moins 4) pour garder un modèle de taille raisonnable. */
export const elementsTravee = (nTravees: number): number => Math.max(4, Math.min(8, Math.round(48 / Math.max(nTravees, 1))));
const ELEMENTS_PILE = 4;

interface Element {
  ddl: [number, number, number, number];
  k: Matrice;
  longueur: number;
}

interface Ressort {
  i: number; // ddl 1 (-1 : sol)
  j: number; // ddl 2 (-1 : sol)
  k: number; // kN/m
}

export interface ModeleDynamique {
  direction: DirectionMM;
  borne: Borne;
  n: number;
  K: Matrice;
  M: Matrice;
  /** Vecteur d'influence (1 sur les translations dans la direction étudiée). */
  r: number[];
  /** Masse mobilisable du modèle rᵀMr (t), hors pieds de piles encastrés. */
  masse: number;
  tablier: { x: number[]; ddl: number[] };
  piles: { id: string; appui: number; z: number[]; ddl: number[]; elements: Element[]; masse: number }[];
  appuis: { id: string; type: "pile" | "culee"; x: number; ressort: Ressort | null; ddlTablier: number; ddlTete: number; rigide: boolean; kSupport: number; kAppareils: number }[];
  /** Raideur retenue pour une liaison rigide (kN/m). */
  kRigide: number;
  inerties: { I: number; saisie: boolean } | null;
}

/** Matrices de rigidité et de masse cohérente d'un élément de poutre plane (w1, θ1, w2, θ2). */
export function elementPoutre(EI: number, mu: number, l: number): { k: Matrice; m: Matrice } {
  const a = EI / l ** 3;
  const k = [
    [12 * a, 6 * l * a, -12 * a, 6 * l * a],
    [6 * l * a, 4 * l * l * a, -6 * l * a, 2 * l * l * a],
    [-12 * a, -6 * l * a, 12 * a, -6 * l * a],
    [6 * l * a, 2 * l * l * a, -6 * l * a, 4 * l * l * a],
  ];
  const b = (mu * l) / 420;
  const m = [
    [156 * b, 22 * l * b, 54 * b, -13 * l * b],
    [22 * l * b, 4 * l * l * b, 13 * l * b, -3 * l * l * b],
    [54 * b, 13 * l * b, 156 * b, -22 * l * b],
    [-13 * l * b, -3 * l * l * b, -22 * l * b, 4 * l * l * b],
  ];
  return { k, m };
}

/** Construit le modèle dynamique de la direction étudiée. */
export function modeleDynamique(p: Projet, m: Modele, direction: DirectionMM, borne: Borne): ModeleDynamique {
  const d = derives(p);
  const E = m.Ecm * 1000; // kPa
  const rho = p.materiaux.beton.masseVolumique; // t/m³
  const muTablier = (m.masses.tablier + m.masses.trafic) / d.longueur; // t/m
  let n = 0;
  const nouveau = () => n++;
  const elements: { e: Element; m: Matrice }[] = [];
  const ressorts: Ressort[] = [];
  const r: number[] = [];
  const translation: number[] = [];

  // --- Tablier ------------------------------------------------------------------
  const xs: number[] = [0];
  const net = elementsTravee(p.tablier.travees.length);
  for (const t of p.tablier.travees) {
    const x0 = xs.at(-1) ?? 0;
    for (let k = 1; k <= net; k++) xs.push(x0 + (t * k) / net);
  }
  const ddlTablier: number[] = [];
  let inertiesTab: ModeleDynamique["inerties"] = null;
  let masseTablierX = 0;
  if (direction === "x") {
    const u = nouveau();
    translation.push(u);
    xs.forEach(() => ddlTablier.push(u));
    masseTablierX = muTablier * d.longueur;
  } else {
    const I = inertiesTablier(p);
    inertiesTab = direction === "y" ? { I: I.transversale, saisie: I.saisie.transversale } : { I: I.verticale, saisie: I.saisie.verticale };
    const rot: number[] = [];
    for (let k = 0; k < xs.length; k++) {
      const w = nouveau();
      translation.push(w);
      ddlTablier.push(w);
      rot.push(nouveau());
    }
    for (let k = 0; k + 1 < xs.length; k++) {
      const l = (xs[k + 1] ?? 0) - (xs[k] ?? 0);
      const el = elementPoutre(E * inertiesTab.I, muTablier, l);
      elements.push({ e: { ddl: [ddlTablier[k]!, rot[k]!, ddlTablier[k + 1]!, rot[k + 1]!], k: el.k, longueur: l }, m: el.m });
    }
  }

  // --- Appuis -------------------------------------------------------------------
  const indicesAppuis = d.positions.map((_, i) => i * net);
  const piles: ModeleDynamique["piles"] = [];
  const appuis: ModeleDynamique["appuis"] = [];
  const liaisonsRigides: { i: number; j: number }[] = [];
  const raideurs = direction === "z" ? null : m.directions[direction].appuis;
  p.appuis.forEach((ap, ia) => {
    const dT = ddlTablier[indicesAppuis[ia] ?? 0] ?? 0;
    const x = d.positions[ia] ?? 0;
    if (direction === "z") {
      liaisonsRigides.push({ i: dT, j: -1 });
      appuis.push({ id: ap.id, type: ap.type, x, ressort: null, ddlTablier: dT, ddlTete: -1, rigide: true, kSupport: Infinity, kAppareils: Infinity });
      return;
    }
    const ra = raideurs![ia]!;
    const kApp = ra.kAppareils[borne] * 1000;
    if (ap.type === "culee") {
      const kTot = ra.kTotal[borne] * 1000;
      const entree = { id: ap.id, type: ap.type, x, ressort: null as Ressort | null, ddlTablier: dT, ddlTete: -1, rigide: false, kSupport: ra.kSupport * 1000, kAppareils: kApp };
      if (kTot === Infinity) {
        entree.rigide = true;
        liaisonsRigides.push({ i: dT, j: -1 });
      } else if (kTot > 0) {
        entree.ressort = { i: dT, j: -1, k: kTot };
        ressorts.push(entree.ressort);
      }
      appuis.push(entree);
      return;
    }
    // Pile : fûts en console.
    const pile = ap as Pile;
    const { Ix, Iy, aire } = inerties(pile);
    const I = direction === "x" ? Ix : Iy;
    const nf = pile.futs.nombre;
    const h = pile.futs.hauteur;
    const EI = nf * E * I;
    const mu = nf * aire * rho;
    const z: number[] = [0];
    const ddlW: number[] = [-1];
    const ddlR: number[] = [-1];
    for (let k = 1; k <= ELEMENTS_PILE; k++) {
      z.push((h * k) / ELEMENTS_PILE);
      const w = nouveau();
      translation.push(w);
      ddlW.push(w);
      ddlR.push(nouveau());
    }
    const els: Element[] = [];
    for (let k = 0; k < ELEMENTS_PILE; k++) {
      const l = h / ELEMENTS_PILE;
      const el = elementPoutre(EI, mu, l);
      const e: Element = { ddl: [ddlW[k]!, ddlR[k]!, ddlW[k + 1]!, ddlR[k + 1]!], k: el.k, longueur: l };
      els.push(e);
      elements.push({ e, m: el.m });
    }
    const tete = ddlW[ELEMENTS_PILE]!;
    piles.push({ id: ap.id, appui: ia, z, ddl: ddlW, elements: els, masse: mu * h });
    const entree = { id: ap.id, type: ap.type, x, ressort: null as Ressort | null, ddlTablier: dT, ddlTete: tete, rigide: false, kSupport: (nf * 3 * E * I) / h ** 3, kAppareils: kApp };
    if (kApp === Infinity) {
      entree.rigide = true;
      liaisonsRigides.push({ i: dT, j: tete });
    } else if (kApp > 0) {
      entree.ressort = { i: dT, j: tete, k: kApp };
      ressorts.push(entree.ressort);
    }
    appuis.push(entree);
  });

  // --- Assemblage ---------------------------------------------------------------------
  const K = zeros(n);
  const M = zeros(n);
  for (const { e, m: me } of elements) {
    for (let a = 0; a < 4; a++) {
      const ia = e.ddl[a]!;
      if (ia < 0) continue;
      for (let b = 0; b < 4; b++) {
        const ib = e.ddl[b]!;
        if (ib < 0) continue;
        K[ia]![ib]! += e.k[a]![b]!;
        M[ia]![ib]! += me[a]![b]!;
      }
    }
  }
  if (direction === "x") M[0]![0]! += masseTablierX;
  for (let i = 0; i < n; i++) r.push(translation.includes(i) ? 1 : 0);
  let masse = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) masse += r[i]! * M[i]![j]! * r[j]!;
  const kRigide = masse * (2 * Math.PI / T_RIGIDE) ** 2;
  for (const l of liaisonsRigides) {
    const s: Ressort = { i: l.i, j: l.j, k: kRigide };
    ressorts.push(s);
    const ap = appuis.find((a) => a.rigide && a.ddlTablier === l.i && (l.j === -1 ? a.ddlTete === -1 : a.ddlTete === l.j) && !a.ressort);
    if (ap) ap.ressort = s;
  }
  for (const s of ressorts) {
    if (s.i >= 0) K[s.i]![s.i]! += s.k;
    if (s.j >= 0) K[s.j]![s.j]! += s.k;
    if (s.i >= 0 && s.j >= 0) {
      K[s.i]![s.j]! -= s.k;
      K[s.j]![s.i]! -= s.k;
    }
  }
  // Rotations sans masse ni raideur (ne se produit pas : tout ddl de rotation appartient à un élément).
  return { direction, borne, n, K, M, r, masse, tablier: { x: xs, ddl: ddlTablier }, piles, appuis, kRigide, inerties: inertiesTab };
}

/** Coefficient de corrélation CQC (EN 1998-2 éq. 4.9), amortissements ξi, ξj, rapport ρ = ωj/ωi. */
export function correlationCQC(xi: number, xj: number, rapport: number): number {
  const r = rapport;
  const num = 8 * Math.sqrt(xi * xj) * (xi + r * xj) * r ** 1.5;
  const den = (1 - r * r) ** 2 + 4 * xi * xj * r * (1 + r * r) + 4 * (xi * xi + xj * xj) * r * r;
  return den === 0 ? 1 : num / den;
}

/** Deux périodes sont « voisines » au sens de l'EN 1998-2 éq. 4.7. */
export function periodesVoisines(Ti: number, Tj: number, xi: number, xj: number): boolean {
  // 0,1/(0,1 + √ξiξj) ≤ Ti/Tj ≤ 1 + 10√ξiξj, appliqué au rapport de la plus courte à la plus longue.
  const rho = Math.min(Ti, Tj) / Math.max(Ti, Tj);
  return rho >= 0.1 / (0.1 + Math.sqrt(xi * xj)) - 1e-12;
}

export function combiner(valeurs: number[], omegas: number[], xi: number, regle: Regle): number {
  if (regle === "SRSS") return Math.sqrt(valeurs.reduce((s, v) => s + v * v, 0));
  let s = 0;
  for (let i = 0; i < valeurs.length; i++) {
    for (let j = 0; j < valeurs.length; j++) {
      const wi = omegas[i]!, wj = omegas[j]!;
      const rho = i === j ? 1 : correlationCQC(xi, xi, wj / wi);
      s += valeurs[i]! * rho * valeurs[j]!;
    }
  }
  return Math.sqrt(Math.max(s, 0));
}

export interface ModeCalcule {
  numero: number;
  T: number;
  omega: number;
  /** Facteur de participation Γ = φᵀMr (t^½). */
  gamma: number;
  /** Masse modale effective (t) et part de la masse du modèle. */
  masseEffective: number;
  part: number;
  cumul: number;
  Sd: number;
  retenu: boolean;
  /** Déformée normée (max |w| = 1) : tablier aux nœuds, piles du pied à la tête. */
  forme: { tablier: number[]; piles: number[][] };
}

export interface ReponseAppuiMM {
  id: string;
  type: "pile" | "culee";
  x: number;
  /** Effort transmis par le tablier à l'appui (MN) — réaction verticale en Z. */
  F: number;
  /** Déplacement du tablier au droit de l'appui (m), η·μd inclus en X et Y. */
  dTablier: number;
  dTete: number;
  dAppareils: number;
  /** Pied de pile : effort tranchant (MN) et moment (MN·m). */
  Vpied?: number;
  Mpied?: number;
  /** Valeurs modales de F (MN) pour l'affichage pédagogique. */
  Fmodes: number[];
}

export interface ReponseDirectionMM {
  direction: DirectionMM;
  borne: Borne;
  modele: { n: number; masse: number; kRigide: number; inertie: { I: number; saisie: boolean } | null; massePiles: number };
  /** Géométrie du modèle pour le tracé des déformées : abscisses des nœuds du tablier, piles (cotes des nœuds). */
  geometrie: {
    xTablier: number[];
    /** teteCulee : déplacement de la tête de culée rapporté à celui du tablier au droit de l'appui (k_appui / k_poteaux). */
    appuis: { id: string; type: "pile" | "culee"; x: number; teteCulee: number }[];
    piles: { id: string; x: number; z: number[] }[];
  };
  modes: ModeCalcule[];
  retenus: number;
  /** Somme des masses effectives des modes retenus / masse du modèle. */
  partRetenue: number;
  /** Part atteinte par les seuls modes de période ≥ 0,033 s. */
  partSouples: number;
  facteur: number;
  regle: Regle;
  voisins: [number, number][];
  xi: number;
  q: number;
  muD: number;
  eta: number;
  /** Effort transmis par le tablier à l'ensemble des appuis (MN) : combinaison des sommes modales des efforts de liaison. Comparable au F du mode fondamental. */
  Ftablier: number;
  /** Effort total à la base (MN), inertie des fûts comprise : combinaison des Mk·Sd modaux. */
  Ftotal: number;
  FtotalSRSS: number;
  FtotalCQC: number;
  appuis: ReponseAppuiMM[];
  alertes: string[];
}

export interface Multimodale {
  directions: Record<"x" | "y", Record<Borne, ReponseDirectionMM>> & { z: ReponseDirectionMM };
  comparaison: { direction: "x" | "y"; Tmono: number; T1: number; Fmono: number; Fmulti: number; FbaseMulti: number; appuis: { id: string; Fmono: number; Fmulti: number }[] }[];
  combinaisons: { id: string; cas: { nom: string; Fx: number; Fy: number; Fz: number }[] }[];
  note: SectionNote[];
}

/** Réponse spectrale multimodale dans une direction. */
export function reponseDirection(p: Projet, a: ActionSismique, m: Modele, direction: DirectionMM, borne: Borne): ReponseDirectionMM {
  const md = modeleDynamique(p, m, direction, borne);
  const spectre: FormeSpectre = direction === "x" ? a.spectres.calculLong : direction === "y" ? a.spectres.calculTrans : a.spectres.elastiqueV;
  const q = direction === "x" ? a.q.longitudinal : direction === "y" ? a.q.transversal : 1;
  const xi = p.comportement.amortissement / 100;
  const bruts = modesPropres(md.K, md.M);
  const modes: ModeCalcule[] = [];
  let cumul = 0;
  const translationsTablier = md.tablier.ddl;
  bruts.forEach((b, k) => {
    const omega = Math.sqrt(b.omega2);
    let gamma = 0;
    for (let i = 0; i < md.n; i++) {
      let s = 0;
      for (let j = 0; j < md.n; j++) s += md.M[i]![j]! * md.r[j]!;
      gamma += b.phi[i]! * s;
    }
    // Signe : facteur de participation positif.
    const signe = gamma < 0 ? -1 : 1;
    const phi = b.phi.map((v) => v * signe);
    gamma *= signe;
    const Meff = gamma * gamma;
    cumul += Meff;
    const T = omega > 0 ? (2 * Math.PI) / omega : Infinity;
    const tab = translationsTablier.map((i) => phi[i] ?? 0);
    const pil = md.piles.map((pl) => pl.ddl.map((i) => (i < 0 ? 0 : phi[i] ?? 0)));
    const max = Math.max(1e-300, ...tab.map(Math.abs), ...pil.flat().map(Math.abs));
    modes.push({
      numero: k + 1,
      T,
      omega,
      gamma,
      masseEffective: Meff,
      part: Meff / md.masse,
      cumul: cumul / md.masse,
      Sd: valeur(spectre, Number.isFinite(T) ? T : 10),
      retenu: false,
      forme: { tablier: tab.map((v) => v / max), piles: pil.map((l) => l.map((v) => v / max)) },
    });
    bruts[k]!.phi = phi;
  });

  // --- Modes significatifs (4.2.1.2) ---------------------------------------------------
  const alertes: string[] = [];
  const souples = modes.filter((x) => x.T >= 0.033);
  const partSouples = souples.reduce((s, x) => s + x.part, 0);
  let retenus = 0;
  let somme = 0;
  for (const x of modes) {
    if (somme >= 0.9 - 1e-9) break;
    x.retenu = true;
    retenus++;
    somme += x.part;
  }
  // Modes à masse effective négligeable intercalés : on les garde (ils ne changent rien), simple lecture.
  const facteur = 1;
  if (partSouples < 0.9) {
    alertes.push(
      `Les modes de période ≥ 0,033 s ne mobilisent que ${nombre(100 * partSouples, 1)} % de la masse : ` +
        (partSouples >= 0.7
          ? `l'EN 1998-2 4.2.1.2(3) admettrait de s'arrêter là en multipliant les effets par M/ΣMi = ${nombre(1 / partSouples, 3)} ; PSIDA complète plutôt par les modes « rigides » (T < 0,033 s), jusqu'à 90 %.`
          : "moins de 70 % : il faut retenir les modes « rigides » (T < 0,033 s), ce que fait PSIDA, jusqu'à 90 %."),
    );
  }

  // --- Combinaison des réponses modales (4.2.1.3) --------------------------------------------
  const ret = modes.filter((x) => x.retenu);
  const voisins: [number, number][] = [];
  for (let i = 0; i < ret.length; i++) for (let j = i + 1; j < ret.length; j++) {
    const a1 = ret[i]!, a2 = ret[j]!;
    if (a1.part > 1e-4 && a2.part > 1e-4 && Number.isFinite(a1.T) && periodesVoisines(a1.T, a2.T, xi, xi)) voisins.push([a1.numero, a2.numero]);
  }
  const regle: Regle = voisins.length ? "CQC" : "SRSS";
  const omegas = ret.map((x) => x.omega);

  // μd (2.3.6.3) avec la période du mode de plus grande masse effective.
  const dominant = ret.reduce((b, x) => (x.masseEffective > b.masseEffective ? x : b), ret[0] ?? modes[0]!);
  const T0 = 1.25 * a.TC;
  const Td = dominant?.T ?? 0;
  const muD = direction === "z" ? 1 : Td < 0.033 ? 1 : Td >= T0 ? q : Math.min((q - 1) * (T0 / Td) + 1, 5 * q - 4);
  const eta = direction === "z" ? 1 : a.eta;
  const ampD = eta * muD;

  // Vecteurs de déplacement modaux u_k = Γ Sd / ω² φ (m).
  const deplacements = ret.map((x) => {
    const phi = bruts[x.numero - 1]!.phi;
    const c = x.omega > 0 ? (x.gamma * x.Sd) / (x.omega * x.omega) : 0;
    return phi.map((v) => v * c);
  });
  const val = (u: number[], i: number) => (i < 0 ? 0 : u[i] ?? 0);
  const comb = (v: number[]) => facteur * combiner(v, omegas, xi, regle);

  const appuis: ReponseAppuiMM[] = md.appuis.map((ap) => {
    const Fm = deplacements.map((u) => (ap.ressort ? (ap.ressort.k * (val(u, ap.ressort.i) - val(u, ap.ressort.j))) / 1000 : 0));
    const dT = deplacements.map((u) => val(u, ap.ddlTablier));
    let dTete: number[];
    let dApp: number[];
    if (ap.type === "pile" && direction !== "z") {
      dTete = deplacements.map((u) => val(u, ap.ddlTete));
      dApp = dT.map((v, k) => v - (dTete[k] ?? 0));
    } else {
      dTete = Fm.map((F) => (Number.isFinite(ap.kSupport) && ap.kSupport > 0 ? (F * 1000) / ap.kSupport : 0));
      dApp = Fm.map((F) => (Number.isFinite(ap.kAppareils) && ap.kAppareils > 0 ? (F * 1000) / ap.kAppareils : 0));
    }
    const sortie: ReponseAppuiMM = {
      id: ap.id,
      type: ap.type,
      x: ap.x,
      F: comb(Fm),
      dTablier: ampD * comb(dT),
      dTete: ampD * comb(dTete),
      dAppareils: ampD * comb(dApp),
      Fmodes: Fm,
    };
    const pile = md.piles.find((pl) => pl.id === ap.id);
    if (pile) {
      const base = pile.elements[0]!;
      const efforts = deplacements.map((u) => {
        const ue = base.ddl.map((i) => val(u, i));
        const f = base.k.map((l) => l.reduce((s, v, j) => s + v * ue[j]!, 0));
        return { V: (f[0] ?? 0) / 1000, M: (f[1] ?? 0) / 1000 };
      });
      sortie.Vpied = comb(efforts.map((e) => e.V));
      sortie.Mpied = comb(efforts.map((e) => e.M));
    }
    return sortie;
  });
  const FtabModes = ret.map((_, k) => appuis.reduce((s, ap) => s + (ap.Fmodes[k] ?? 0), 0));
  const Ftablier = comb(FtabModes);
  const FtotModes = ret.map((x) => (x.masseEffective * x.Sd) / 1000);
  const FtotalSRSS = facteur * combiner(FtotModes, omegas, xi, "SRSS");
  const FtotalCQC = facteur * combiner(FtotModes, omegas, xi, "CQC");
  const massePiles = md.piles.reduce((s, x) => s + x.masse, 0);
  return {
    direction,
    borne,
    modele: { n: md.n, masse: md.masse, kRigide: md.kRigide, inertie: md.inerties, massePiles },
    geometrie: {
      xTablier: md.tablier.x,
      appuis: md.appuis.map((x) => ({
        id: x.id,
        type: x.type,
        x: x.x,
        teteCulee: x.type !== "culee" || !Number.isFinite(x.kSupport) || x.kSupport <= 0 ? 0 : x.rigide ? 1 : (x.ressort?.k ?? 0) / x.kSupport,
      })),
      piles: md.piles.map((pl) => ({ id: pl.id, x: md.appuis[pl.appui]?.x ?? 0, z: pl.z })),
    },
    modes,
    retenus,
    partRetenue: somme,
    partSouples,
    facteur,
    regle,
    voisins,
    xi,
    q,
    muD,
    eta,
    Ftablier,
    Ftotal: regle === "CQC" ? FtotalCQC : FtotalSRSS,
    FtotalSRSS,
    FtotalCQC,
    appuis,
    alertes,
  };
}

const NOMS: Record<DirectionMM, string> = { x: "longitudinale (X)", y: "transversale (Y)", z: "verticale (Z)" };

/** Analyse multimodale complète, comparaison au mode fondamental et note de calcul. */
export function multimodale(p: Projet, a: ActionSismique, m: Modele, mono: Analyse): Multimodale {
  const bornes: Borne[] = ["lbdp", "ubdp"];
  const dir = (d: "x" | "y") => Object.fromEntries(bornes.map((b) => [b, reponseDirection(p, a, m, d, b)])) as Record<Borne, ReponseDirectionMM>;
  const directions = { x: dir("x"), y: dir("y"), z: reponseDirection(p, a, m, "z", "lbdp") };

  const comparaison = (["x", "y"] as const).map((d) => {
    const mu = directions[d].ubdp, ml = directions[d].lbdp;
    const mo = mono.directions[d];
    const T1 = ml.modes.find((x) => x.retenu && x.part > 0.05)?.T ?? ml.modes[0]?.T ?? 0;
    return {
      direction: d,
      Tmono: mo.lbdp.T,
      T1,
      Fmono: mo.ubdp.F,
      Fmulti: mu.Ftablier,
      FbaseMulti: mu.Ftotal,
      appuis: mu.appuis.map((x, i) => ({ id: x.id, Fmono: mo.ubdp.appuis[i]?.F ?? 0, Fmulti: x.F })),
    };
  });

  const combinaisons = p.appuis.map((ap, i) => {
    const Fx = directions.x.ubdp.appuis[i]?.F ?? 0;
    const Fy = directions.y.ubdp.appuis[i]?.F ?? 0;
    const Fz = directions.z.appuis[i]?.F ?? 0;
    return {
      id: ap.id,
      cas: [
        { nom: "X + 0,3 Y + 0,3 Z", Fx, Fy: 0.3 * Fy, Fz: 0.3 * Fz },
        { nom: "0,3 X + Y + 0,3 Z", Fx: 0.3 * Fx, Fy, Fz: 0.3 * Fz },
        { nom: "0,3 X + 0,3 Y + Z", Fx: 0.3 * Fx, Fy: 0.3 * Fy, Fz },
      ],
    };
  });

  // --- Note de calcul ---------------------------------------------------------------------------
  const note: SectionNote[] = [];
  const lignesModele: LigneNote[] = [];
  const I = inertiesTablier(p);
  lignesModele.push(
    {
      id: "mm_modele",
      titre: "Modèle dynamique discret",
      resultat: { symbole: "", valeur: `tablier : ${elementsTravee(p.tablier.travees.length)} éléments de poutre par travée ; piles : ${ELEMENTS_PILE} éléments par fût, encastrés en pied ; masses cohérentes` },
      references: ["analyse_spectrale", "modele_dynamique"],
      commentaire: "Liaisons rigides (appareils fixes, butées, culées rigides, appuis en Z) représentées par des ressorts très raides (période propre de 2 ms).",
    },
    {
      id: "mm_inerties",
      titre: "Inerties du tablier",
      formule: "I_V = \\dfrac{A\\,e^2}{12}, \\qquad I_T = \\dfrac{A\\,B^2}{12}\\quad\\text{(par défaut)}",
      resultat: { symbole: "I_V ;\\ I_T", valeur: `${nombre(I.verticale, 4)} m⁴ ${I.saisie.verticale ? "(saisie)" : "(défaut)"} ; ${nombre(I.transversale, 2)} m⁴ ${I.saisie.transversale ? "(saisie)" : "(défaut)"}`, unite: "" },
      references: ["modele_dynamique"],
    },
    {
      id: "mm_equation",
      titre: "Modes propres",
      formule: "\\mathbf{K}\\,\\boldsymbol{\\varphi}_k = \\omega_k^2\\,\\mathbf{M}\\,\\boldsymbol{\\varphi}_k,\\quad T_k = \\dfrac{2\\pi}{\\omega_k},\\quad \\Gamma_k = \\boldsymbol{\\varphi}_k^{T}\\mathbf{M}\\,\\mathbf{r},\\quad M_k = \\Gamma_k^2\\ (\\boldsymbol{\\varphi}_k^T\\mathbf{M}\\boldsymbol{\\varphi}_k = 1)",
      resultat: { symbole: "", valeur: "Cholesky M = L Lᵀ puis Jacobi" },
      references: ["analyse_spectrale", "modes_significatifs"],
    },
  );
  note.push({ id: "mm_modele", titre: "Modèle dynamique", lignes: lignesModele });

  for (const [d, rep] of [["x", directions.x.lbdp], ["y", directions.y.lbdp], ["z", directions.z]] as const) {
    const repU = d === "z" ? directions.z : directions[d].ubdp;
    const lignes: LigneNote[] = [];
    lignes.push({
      id: `mm_${d}_masse`,
      titre: `Masse mobilisable du modèle (${NOMS[d]})`,
      formule: "M = \\mathbf{r}^T\\mathbf{M}\\,\\mathbf{r}",
      resultat: { symbole: "M", valeur: rep.modele.masse, unite: "t", decimales: 1 },
      references: ["modes_significatifs"],
      commentaire: `${rep.modele.n} degrés de liberté${rep.modele.massePiles > 0 ? ` ; masse des fûts de piles ${nombre(rep.modele.massePiles, 1)} t (hors pieds encastrés)` : ""}.`,
    });
    for (const x of rep.modes.filter((k) => k.retenu || k.numero <= 3)) {
      lignes.push({
        id: `mm_${d}_mode${x.numero}`,
        titre: `Mode ${x.numero}${x.retenu ? "" : " (non retenu)"}`,
        application: `T = ${tex(x.T, 3)}\\ \\text{s},\\ M_k = ${tex(x.masseEffective, 1)}\\ \\text{t},\\ S_d = ${tex(x.Sd, 3)}\\ \\text{m/s}^2`,
        resultat: { symbole: "M_k / M ;\\ \\sum", valeur: `${nombre(100 * x.part, 1)} % ; ${nombre(100 * x.cumul, 1)} %` },
        references: ["modes_significatifs"],
      });
    }
    lignes.push({
      id: `mm_${d}_critere`,
      titre: "Modes significatifs : ΣMk ≥ 90 % de M",
      resultat: { symbole: "\\sum M_k / M", valeur: `${nombre(100 * rep.partRetenue, 1)} % avec ${rep.retenus} mode(s)` },
      references: ["modes_significatifs"],
      commentaire: rep.alertes.join(" ") || `Modes de période ≥ 0,033 s : ${nombre(100 * rep.partSouples, 1)} % de la masse.`,
      niveau: rep.partSouples < 0.9 ? "info" : undefined,
    });
    lignes.push({
      id: `mm_${d}_regle`,
      titre: "Combinaison des réponses modales",
      formule: rep.regle === "SRSS" ? "E = \\sqrt{\\sum_k E_k^2}" : "E = \\sqrt{\\sum_i\\sum_j E_i\\,r_{ij}\\,E_j}",
      resultat: { symbole: "", valeur: rep.regle === "SRSS" ? "SRSS (périodes bien séparées)" : `CQC (périodes voisines : ${rep.voisins.map(([i, j]) => `${i}-${j}`).join(", ")})` },
      references: ["combinaison_modale"],
    });
    if (d !== "z") {
      lignes.push(
        {
          id: `mm_${d}_Ftab`,
          titre: "Effort transmis par le tablier aux appuis",
          formule: "F_{tablier} = \\text{comb}_k \\Big(\\sum_i F_{i,k}\\Big)",
          resultat: { symbole: "F_{tablier}^{UBDP}", valeur: repU.Ftablier, unite: "MN", decimales: 3 },
          references: ["combinaison_modale"],
          commentaire: "Grandeur comparable à l'effort F = M·Sd(T) du mode fondamental (masse du tablier seule).",
        },
        {
          id: `mm_${d}_F`,
          titre: "Effort total à la base (inertie des fûts comprise)",
          formule: "F_{base} = \\text{comb}_k\\,(M_k\\,S_d(T_k))",
          resultat: { symbole: "F_{base}^{UBDP}", valeur: repU.Ftotal, unite: "MN", decimales: 3 },
          references: ["combinaison_modale"],
          commentaire: `SRSS : ${nombre(repU.FtotalSRSS, 3)} MN ; CQC : ${nombre(repU.FtotalCQC, 3)} MN. μd = ${nombre(rep.muD, 3)} (mode dominant), η = ${nombre(rep.eta, 3)}.`,
        },
      );
    }
    for (const ap of repU.appuis) {
      const apL = rep.appuis.find((k) => k.id === ap.id);
      lignes.push({
        id: `mm_${d}_${ap.id}`,
        titre: `${ap.id} — ${d === "z" ? "réaction verticale sismique" : `effort ${d === "x" ? "longitudinal" : "transversal"} transmis par le tablier`}`,
        resultat: { symbole: `F_{${ap.id}}${d === "z" ? "" : "^{UBDP}"}`, valeur: ap.F, unite: "MN", decimales: 3 },
        references: ["combinaison_modale"],
        commentaire:
          d === "z"
            ? undefined
            : `Déplacement du tablier (LBDP) ${nombre((apL?.dTablier ?? 0) * 100, 2)} cm ; distorsion des appareils ${nombre((apL?.dAppareils ?? 0) * 100, 2)} cm` +
              (ap.Mpied !== undefined ? ` ; pied de pile : V = ${nombre(ap.Vpied ?? 0, 3)} MN, M = ${nombre(ap.Mpied, 3)} MN·m (UBDP).` : "."),
      });
    }
    note.push({ id: `mm_${d}`, titre: `Direction ${NOMS[d]}`, lignes });
  }
  const lignesComp: LigneNote[] = comparaison.map((c) => ({
    id: `mm_comp_${c.direction}`,
    titre: `Comparaison au mode fondamental — direction ${NOMS[c.direction]}`,
    resultat: { symbole: "T_1 ;\\ F", valeur: `T₁ = ${nombre(c.T1, 3)} s (mode fondamental : ${nombre(c.Tmono, 3)} s) ; effort transmis par le tablier ${nombre(c.Fmulti, 3)} MN (mode fondamental : ${nombre(c.Fmono, 3)} MN, écart ${nombre(100 * (c.Fmulti / c.Fmono - 1), 1)} %) ; effort total à la base ${nombre(c.FbaseMulti, 3)} MN` },
    references: ["tablier_rigide", "combinaison_modale"],
  }));
  note.push({ id: "mm_comparaison", titre: "Comparaison des méthodes", lignes: lignesComp });
  return { directions, comparaison, combinaisons, note };
}
