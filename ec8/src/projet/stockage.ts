// Lecture et écriture d'un projet : sauvegarde locale du navigateur et fichier JSON.

import type { Projet } from "./types.ts";

const CLE = "pont-ec8:projet:v1";

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Contrôle de forme minimal d'un projet importé ; les contrôles de cohérence restent ceux de valider(). */
export function lireProjet(v: unknown): Projet {
  if (!estObjet(v) || v.version !== 1) throw new Error("Ce fichier n'est pas un projet Pont EC8 (version 1).");
  for (const cle of ["site", "materiaux", "tablier", "options"]) {
    if (!estObjet(v[cle])) throw new Error(`Section « ${cle} » absente ou invalide.`);
  }
  const tablier = v.tablier as Record<string, unknown>;
  if (!Array.isArray(tablier.travees) || !tablier.travees.every((t) => typeof t === "number")) {
    throw new Error("Liste des travées absente ou invalide.");
  }
  if (!Array.isArray(v.appuis) || !v.appuis.every((a) => estObjet(a) && (a.type === "pile" || a.type === "culee"))) {
    throw new Error("Liste des appuis absente ou invalide.");
  }
  // Projets enregistrés avant l'ajout du comportement (étape 3) : valeurs par défaut.
  if (!estObjet(v.comportement)) {
    v.comportement = { qLongitudinal: 1, qTransversal: 1, amortissement: 5, plateauOrigine: true };
  }
  if (!estObjet(v.elastomeres)) v.elastomeres = { T0: 10, Tmin: -20, lambdaMaxF1: 1.1, lambdaMaxF2: 1.1, psiFi: 0.7 };
  const el = v.elastomeres as Record<string, unknown>;
  if (typeof el.gammaIS !== "number") el.gammaIS = 1.5;
  if (typeof el.Kf !== "number") el.Kf = 0.6;
  if (!estObjet(v.service)) v.service = { retraitFluage: 0.0004, deltaT: 40, alpha: 1e-5 };
  if (typeof tablier.chargeTrafic !== "number") tablier.chargeTrafic = 0;
  for (const a of v.appuis as Record<string, unknown>[]) {
    if (a.type === "culee" && !estObjet(a.rigide)) a.rigide = { longitudinal: true, transversal: false };
    const ap = a.appareils as Record<string, unknown> | undefined;
    if (ap && ap.type === "elastomere") {
      if (typeof ap.enrobageLateral !== "number") ap.enrobageLateral = 0.005;
      if (ap.fixation !== "frottement" && ap.fixation !== "mecanique") ap.fixation = "mecanique";
    }
  }
  return v as unknown as Projet;
}

export function chargerLocal(): Projet | null {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? lireProjet(JSON.parse(brut)) : null;
  } catch {
    return null;
  }
}

export function enregistrerLocal(p: Projet): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(p));
  } catch {
    // Stockage indisponible (navigation privée, quota) : la saisie reste en mémoire.
  }
}

export function telechargerProjet(p: Projet): void {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `${p.nom.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "projet"}.json`;
  lien.click();
  URL.revokeObjectURL(url);
}

export async function importerFichier(fichier: File): Promise<Projet> {
  return lireProjet(JSON.parse(await fichier.text()));
}
