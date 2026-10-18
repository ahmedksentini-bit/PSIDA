// Structure de la note de calcul produite par le moteur. Chaque ligne cite les
// entrées du référentiel par leur identifiant : les références (document, clause,
// page) restent définies en un seul endroit.

export interface Resultat {
  /** Symbole en LaTeX. */
  symbole: string;
  valeur: number | string;
  unite?: string;
  /** Nombre de décimales affichées pour une valeur numérique. */
  decimales?: number;
}

export interface LigneNote {
  id: string;
  titre: string;
  /** Expression symbolique (LaTeX). */
  formule?: string;
  /** Application numérique (LaTeX), sans le résultat. */
  application?: string;
  resultat?: Resultat;
  /** Identifiants d'entrées du référentiel. */
  references: string[];
  commentaire?: string;
  niveau?: "info" | "alerte";
}

export interface SectionNote {
  id: string;
  titre: string;
  lignes: LigneNote[];
}

const formats = new Map<number, Intl.NumberFormat>();

/** Nombre au format français, avec un nombre maximal de décimales. */
export function nombre(v: number, decimales = 3): string {
  let f = formats.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimales });
    formats.set(decimales, f);
  }
  return f.format(v);
}

/** Nombre au format LaTeX (virgule décimale, espaces fines pour les milliers). */
export function tex(v: number, decimales = 3): string {
  return nombre(v, decimales).replace(",", "{,}").replace(/ | /g, "\\,");
}
