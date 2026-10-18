// Navigation par l'adresse : #/<onglet>/<sous-onglet>/<ancre>.

export type OngletPrincipal = "projet" | "action" | "modele" | "analyse" | "verifications" | "referentiel";

export interface Route {
  onglet: OngletPrincipal;
  sous: string | null;
  ancre: string | null;
}

const ONGLETS: OngletPrincipal[] = ["projet", "action", "modele", "analyse", "verifications", "referentiel"];

export function lireRoute(): Route {
  const [, onglet = "", sous, ancre] = window.location.hash.split("/").map((s) => decodeURIComponent(s));
  return {
    onglet: (ONGLETS as string[]).includes(onglet) ? (onglet as OngletPrincipal) : "projet",
    sous: sous || null,
    ancre: ancre || null,
  };
}

export const lien = (onglet: OngletPrincipal, sous?: string | null, ancre?: string | null): string =>
  `#/${[onglet, sous, ancre].filter((x): x is string => !!x).map(encodeURIComponent).join("/")}`;

export function aller(onglet: OngletPrincipal, sous?: string | null, ancre?: string | null): void {
  const cible = lien(onglet, sous, ancre);
  if (window.location.hash !== cible) window.location.hash = cible;
}
