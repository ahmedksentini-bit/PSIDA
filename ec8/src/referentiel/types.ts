// Types du référentiel : chaque valeur, règle ou formule utilisée par le moteur
// de calcul porte ses références (document, localisation, page) et un statut de
// vérification. Le référentiel ne contient jamais de texte reproduit des normes :
// seulement des valeurs, des formules, des numéros de clause et des paraphrases.

export type IdSource =
  | "ARRETE_2011"
  | "DECRET_2010_1254"
  | "DECRET_2010_1255"
  | "NF_EN_1990"
  | "NF_EN_1998_1"
  | "NF_EN_1998_1_NA"
  | "NF_EN_1998_2"
  | "NF_EN_1998_2_NA"
  | "NF_EN_1998_5"
  | "NF_EN_1998_5_NA"
  | "NF_EN_1337_3"
  | "NF_EN_15129"
  | "NF_EN_1992"
  | "GUIDE_CEREMA_2015";

export type NatureSource = "reglementaire" | "norme" | "annexe_nationale" | "guide";

/** Ce dont on dispose pour vérifier les références. */
export type Disponibilite =
  | "fourni" // document fourni et lu
  | "public" // texte officiel en accès libre
  | "projet" // seul un projet de la norme (prEN) a été fourni et lu
  | "non_fourni"; // texte non consulté : références prises via le guide

export interface Source {
  id: IdSource;
  /** Désignation courte affichée dans les notes de calcul. */
  abrege: string;
  titre: string;
  edition: string;
  nature: NatureSource;
  disponibilite: Disponibilite;
  url?: string;
  remarque?: string;
}

/**
 * - `verifie` : lu sur la source primaire (annexe nationale fournie, texte officiel).
 * - `via_guide` : reproduit ou cité par le guide Cerema ; source primaire non consultée.
 * - `a_verifier` : non confirmé, à contrôler avant usage en production.
 */
export type Statut = "verifie" | "via_guide" | "a_verifier";

/**
 * Degré de confirmation de la localisation (clause, article, équation) d'une référence :
 * - `lue` : localisation lue dans le document lui-même (valeur par défaut) ;
 * - `citee_par_guide` : localisation imprimée par le guide Cerema, document non consulté ;
 * - `citee_par_an` : numéro de clause confirmé par l'annexe nationale (qui le cite), texte de la norme non consulté ;
 * - `lue_projet` : localisation lue dans le projet de norme (prEN) fourni ; à recouper sur l'édition publiée ;
 * - `a_confirmer` : localisation attendue mais citée par aucun document consulté.
 */
export type EtatReference = "lue" | "lue_projet" | "citee_par_guide" | "citee_par_an" | "a_confirmer";

export interface Reference {
  source: IdSource;
  /** Ex. « art. 4 II a) », « 4.1.8(2) », « 3.2.2.2(1)P, éq. (3.3) ». */
  localisation: string;
  /** Page dans le document source, quand elle est connue. */
  page?: string;
  etat?: EtatReference;
}

/** Étapes de la chaîne de calcul, dans l'ordre où la note de calcul les présente. */
export type Etape =
  | "classification"
  | "action_sismique"
  | "comportement"
  | "modele"
  | "analyse"
  | "combinaisons"
  | "deplacements"
  | "verif_appareils_appui"
  | "verif_repos_appui"
  | "verif_piles"
  | "verif_culees"
  | "verif_fondations"
  | "dispositions_constructives";

interface ElementReferentiel {
  id: string;
  etape: Etape;
  libelle: string;
  /** La première référence est la source qui fait foi ; les suivantes la confirment ou la commentent. */
  references: Reference[];
  statut: Statut;
  note?: string;
}

/** Valeur numérique scalaire (coefficient, borne, limite). */
export interface ParametreScalaire extends ElementReferentiel {
  type: "scalaire";
  /** Symbole en LaTeX. */
  symbole: string;
  unite: string;
  valeur: number;
}

/** Valeurs indexées par une ou deux clés (zone, catégorie, classe de sol…). */
export interface ParametreTable<V> extends ElementReferentiel {
  type: "table";
  symbole: string;
  unite: string;
  /** Libellés des clés, dans l'ordre d'indexation. */
  cles: string[];
  valeurs: V;
}

/** Choix national ou règle sans valeur numérique (option retenue, interdiction, statut d'annexe). */
export interface Regle extends ElementReferentiel {
  type: "regle";
  enonce: string;
}

export interface Variable {
  symbole: string;
  description: string;
  unite: string;
}

export interface Formule extends ElementReferentiel {
  type: "formule";
  /** Expression en LaTeX, rendue par KaTeX. */
  latex: string;
  variables: Variable[];
  /** Domaine de validité, bornes, cas d'exclusion. */
  conditions?: string[];
}

export type Parametre = ParametreScalaire | ParametreTable<unknown>;
export type EntreeReferentiel = Parametre | Regle | Formule;

export const ETAPES: { id: Etape; titre: string }[] = [
  { id: "classification", titre: "Classification et champ d'application" },
  { id: "action_sismique", titre: "Action sismique" },
  { id: "comportement", titre: "Comportement et coefficient q" },
  { id: "modele", titre: "Modèle : masses, raideurs, amortissement" },
  { id: "analyse", titre: "Méthodes d'analyse" },
  { id: "combinaisons", titre: "Combinaisons" },
  { id: "deplacements", titre: "Déplacements" },
  { id: "verif_appareils_appui", titre: "Vérification des appareils d'appui" },
  { id: "verif_repos_appui", titre: "Repos d'appui, butées et joints" },
  { id: "verif_piles", titre: "Vérification des piles" },
  { id: "verif_culees", titre: "Vérification des culées" },
  { id: "verif_fondations", titre: "Vérification des fondations" },
  { id: "dispositions_constructives", titre: "Dispositions constructives" },
];
