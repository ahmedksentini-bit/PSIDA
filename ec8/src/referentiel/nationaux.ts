// Valeurs et choix nationaux : arrêté du 26/10/2011 et annexes nationales
// NF EN 1998-1/NA et NF EN 1998-2/NA. Les clauses des annexes nationales sont
// numérotées comme dans les EN (EN 1998-1:2004, EN 1998-2:2005).

import type { EntreeReferentiel, Formule, ParametreScalaire, ParametreTable, Regle } from "./types.ts";

export type Zone = 1 | 2 | 3 | 4 | 5;
export type ZoneSoumise = 2 | 3 | 4 | 5;
export type Categorie = "I" | "II" | "III" | "IV";
export type CategorieSoumise = "II" | "III" | "IV";
export type ClasseSol = "A" | "B" | "C" | "D" | "E";
export type GroupeZones = "zones_2_a_4" | "zone_5";

export interface Periodes {
  TB: number;
  TC: number;
  TD: number;
}

export interface SpectreVertical extends Periodes {
  /** Rapport avg / ag. */
  rapport: number;
}

export const groupeDeZone = (zone: ZoneSoumise): GroupeZones => (zone === 5 ? "zone_5" : "zones_2_a_4");

// --- Classification et champ d'application ---------------------------------

export const CHAMP_APPLICATION: Regle = {
  id: "champ_application",
  type: "regle",
  etape: "classification",
  libelle: "Ouvrages visés",
  enonce: "Ponts nouveaux définitifs, passerelles comprises, publics ou privés, et murs de soutènement qui leur sont solidaires.",
  references: [
    { source: "ARRETE_2011", localisation: "art. 1er" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "11" },
  ],
  statut: "verifie",
};

export const CATEGORIES_IMPORTANCE: Regle = {
  id: "categories_importance",
  type: "regle",
  etape: "classification",
  libelle: "Catégories d'importance des ponts",
  enonce:
    "I : pont privé ne desservant pas d'ERP. II : pont public, ou privé desservant un ERP, non classé III ou IV. III : pont public portant, franchissant ou longeant une autoroute, une route express, une voie à grande circulation ou une LGV ; ponts-canaux ; ponts des ports ; ponts d'aérodromes non classés IV. IV : ponts de pistes ou de voies d'aéronefs de code C à F ; ponts primordiaux pour la sécurité civile, la défense ou l'ordre public (classement préfectoral) ; pont II ou III dont l'endommagement menacerait un ouvrage de catégorie IV.",
  references: [
    { source: "ARRETE_2011", localisation: "art. 2" },
    { source: "NF_EN_1998_2_NA", localisation: "2.1(4)P", page: "9" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "11-12" },
  ],
  statut: "verifie",
  note: "L'AN renvoie à l'Administration française pour la définition des catégories.",
};

export const EXEMPTION: Regle = {
  id: "exemption",
  type: "regle",
  etape: "classification",
  libelle: "Ponts non soumis aux règles parasismiques",
  enonce:
    "Les ponts de catégorie II, III ou IV situés en zones 2 à 5 doivent appliquer les règles de l'article 4. Les ponts de catégorie I, ou situés en zone 1, n'y sont pas soumis.",
  references: [
    { source: "ARRETE_2011", localisation: "art. 3, al. 1 et 3" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "12" },
  ],
  statut: "verifie",
};

export const FONDATIONS_DEUX_ZONES: Regle = {
  id: "fondations_deux_zones",
  type: "regle",
  etape: "classification",
  libelle: "Pont fondé sur deux zones de sismicité",
  enonce: "Un pont dont les fondations sont dans deux zones de sismicité est considéré tout entier dans la zone la plus élevée.",
  references: [{ source: "ARRETE_2011", localisation: "art. 3, al. 2" }],
  statut: "verifie",
  note: "Alinéa non repris dans l'extrait de l'arrêté donné par le guide Cerema.",
};

export const REGLES_APPLICABLES: Regle = {
  id: "regles_applicables",
  type: "regle",
  etape: "classification",
  libelle: "Normes à appliquer",
  enonce: "NF EN 1998-2, NF EN 1998-1 et NF EN 1998-5, avec leurs annexes nationales.",
  references: [{ source: "ARRETE_2011", localisation: "art. 4 I" }],
  statut: "verifie",
};

export const SEISME_ACCIDENTEL: Regle = {
  id: "seisme_action_accidentelle",
  type: "regle",
  etape: "classification",
  libelle: "Nature de l'action sismique",
  enonce: "L'action sismique est une action accidentelle ; les exigences de 2.2.2(3) et 2.2.2(4) sont conservées.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "2.2.2(5)", page: "9" }],
  statut: "verifie",
};

export const GAMMA_I: ParametreTable<Record<CategorieSoumise, number>> = {
  id: "gamma_I",
  type: "table",
  etape: "classification",
  libelle: "Coefficient d'importance",
  symbole: "\\gamma_I",
  unite: "-",
  cles: ["catégorie d'importance"],
  valeurs: { II: 1.0, III: 1.2, IV: 1.4 },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 I, tableau" },
    { source: "NF_EN_1998_2_NA", localisation: "2.1(6)", page: "9" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "12" },
  ],
  statut: "via_guide",
};

// --- Action sismique --------------------------------------------------------

export const AGR: ParametreTable<Record<ZoneSoumise, number>> = {
  id: "agr",
  type: "table",
  etape: "action_sismique",
  libelle: "Accélération maximale de référence au rocher (sol de classe A)",
  symbole: "a_{gR}",
  unite: "m/s²",
  cles: ["zone de sismicité"],
  valeurs: { 2: 0.7, 3: 1.1, 4: 1.6, 5: 3.0 },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II a)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.1(2)", page: "6" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "12" },
  ],
  statut: "via_guide",
};

export const PARAMETRE_SOL_S: ParametreTable<Record<GroupeZones, Record<ClasseSol, number>>> = {
  id: "S",
  type: "table",
  etape: "action_sismique",
  libelle: "Paramètre de sol (composantes horizontales)",
  symbole: "S",
  unite: "-",
  cles: ["groupe de zones", "classe de sol"],
  valeurs: {
    zones_2_a_4: { A: 1.0, B: 1.35, C: 1.5, D: 1.6, E: 1.8 },
    zone_5: { A: 1.0, B: 1.2, C: 1.15, D: 1.35, E: 1.4 },
  },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II c)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.1.2(1) et 3.2.2.2(2)P", page: "6-7" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "12" },
  ],
  statut: "via_guide",
  note: "La classe de sol est définie au tableau 3.1 de NF EN 1998-1.",
};

export const SOL_ET_VERTICAL: Regle = {
  id: "sol_composante_verticale",
  type: "regle",
  etape: "action_sismique",
  libelle: "Composante verticale indépendante du sol",
  enonce: "La nature du sol n'est pas prise en compte pour la composante verticale de l'action sismique.",
  references: [{ source: "ARRETE_2011", localisation: "art. 4 II c)" }],
  statut: "verifie",
};

export const PERIODES_HORIZONTALES: ParametreTable<Record<GroupeZones, Record<ClasseSol, Periodes>>> = {
  id: "periodes_horizontales",
  type: "table",
  etape: "action_sismique",
  libelle: "Périodes de coin du spectre élastique horizontal",
  symbole: "T_B,\\ T_C,\\ T_D",
  unite: "s",
  cles: ["groupe de zones", "classe de sol"],
  valeurs: {
    zones_2_a_4: {
      A: { TB: 0.03, TC: 0.2, TD: 2.5 },
      B: { TB: 0.05, TC: 0.25, TD: 2.5 },
      C: { TB: 0.06, TC: 0.4, TD: 2.0 },
      D: { TB: 0.1, TC: 0.6, TD: 1.5 },
      E: { TB: 0.08, TC: 0.45, TD: 1.25 },
    },
    zone_5: {
      A: { TB: 0.15, TC: 0.4, TD: 2.0 },
      B: { TB: 0.15, TC: 0.5, TD: 2.0 },
      C: { TB: 0.2, TC: 0.6, TD: 2.0 },
      D: { TB: 0.2, TC: 0.8, TD: 2.0 },
      E: { TB: 0.15, TC: 0.5, TD: 2.0 },
    },
  },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II d)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.2.2(2)P", page: "7" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "13" },
  ],
  statut: "via_guide",
};

export const SPECTRE_VERTICAL: ParametreTable<Record<GroupeZones, SpectreVertical>> = {
  id: "spectre_vertical",
  type: "table",
  etape: "action_sismique",
  libelle: "Paramètres du spectre élastique vertical",
  symbole: "a_{vg}/a_g,\\ T_B,\\ T_C,\\ T_D",
  unite: "-, s",
  cles: ["groupe de zones"],
  valeurs: {
    zones_2_a_4: { rapport: 0.9, TB: 0.03, TC: 0.2, TD: 2.5 },
    zone_5: { rapport: 0.8, TB: 0.15, TC: 0.4, TD: 2.0 },
  },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II e)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.2.3(1)P", page: "7" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "13" },
  ],
  statut: "via_guide",
};

export const SOL_PAR_DEFAUT: Regle = {
  id: "classe_sol_par_defaut",
  type: "regle",
  etape: "action_sismique",
  libelle: "Classification du sol sans investigations complémentaires",
  enonce:
    "Paramètres de sol par défaut admis pour classer le sol (A à E) en cas de faible sismicité, ou pour les ouvrages de catégorie I ou II si le maître d'œuvre juge la reconnaissance suffisante (sauf prescription contraire de l'Administration). Des corrélations vs / pénétromètre / pressiomètre sont admises (EN 1998-5 4.2.2(6)).",
  references: [{ source: "NF_EN_1998_1_NA", localisation: "3.1.1(4)", page: "6" }],
  statut: "verifie",
};

// --- Comportement -----------------------------------------------------------

export const RHO_0: ParametreScalaire = {
  id: "rho_0",
  type: "scalaire",
  etape: "comportement",
  libelle: "Limite du rapport ρ au-delà de laquelle le comportement est irrégulier",
  symbole: "\\rho_0",
  unite: "-",
  valeur: 1.5,
  references: [{ source: "NF_EN_1998_2_NA", localisation: "4.1.8(2)", page: "10" }],
  statut: "verifie",
  note: "Borne de la partie gauche de l'expression (4.4) de l'EN 1998-2.",
};

// --- Modèle -----------------------------------------------------------------

export const PSI_21: ParametreTable<Record<"cas_general" | "routier_trafic_intense" | "ferroviaire_trafic_intense", number>> = {
  id: "psi_21",
  type: "table",
  etape: "modele",
  libelle: "Coefficient ψ2,1 des charges de trafic concomitantes au séisme (masses et combinaison)",
  symbole: "\\psi_{2,1}",
  unite: "-",
  cles: ["type de pont et de trafic"],
  valeurs: { cas_general: 0, routier_trafic_intense: 0.2, ferroviaire_trafic_intense: 0.3 },
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "4.1.2(4)P", page: "10" },
    { source: "NF_EN_1998_2", localisation: "4.1.2(4)P, valeurs recommandées", page: "42" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.3 et §4.2", page: "91, 95" },
  ],
  statut: "via_guide",
  note: "L'AN retient les valeurs recommandées de l'EN ; leurs valeurs numériques sont reprises du guide. 0,2 vise les ponts routiers urbains à trafic intense (LM1).",
};

export const ANNEXES_INFORMATIVES: Regle = {
  id: "annexes_informatives",
  type: "regle",
  etape: "modele",
  libelle: "Statut des annexes de l'EN 1998-2",
  enonce:
    "Les annexes A, B, C, D, E, F, H, JJ et K restent informatives. Pour l'annexe C (rigidité effective), la méthode simplifiée 1 est limitée à la zone effectivement fissurée.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "1.1.1(8), AN 2 à AN 10", page: "9, 12-13" }],
  statut: "verifie",
};

export const VARIABILITE_SPATIALE: Regle = {
  id: "variabilite_spatiale_choix",
  type: "regle",
  etape: "modele",
  libelle: "Variabilité spatiale de l'action sismique",
  enonce: "Longueur de tablier, distance d'indépendance et coefficient d'opposition : valeurs recommandées de l'EN 1998-2.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "3.3(1)P, 3.3(6) notes 1 et 2", page: "9-10" }],
  statut: "verifie",
};

// --- Analyse ----------------------------------------------------------------

export const FAIBLE_SISMICITE: Regle = {
  id: "faible_sismicite_methode_simplifiee",
  type: "regle",
  etape: "analyse",
  libelle: "Méthode simplifiée en faible sismicité",
  enonce:
    "Ponts de catégorie I et II dont la surface utile de brèche est inférieure à 150 m² et pour lesquels ag·S ≤ 0,15 g : méthode statique équivalente avec une accélération horizontale uniforme égale à ag·S, et dispositions constructives de ductilité limitée.",
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "2.3.7(1)", page: "9" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.2", page: "116" },
  ],
  statut: "verifie",
  note: "L'AN d'avril 2013 a remplacé « 150 m² ou 0,15 g » (édition d'octobre 2007) par « 150 m² et 0,15 g » ; les deux conditions sont donc cumulatives (catégories I et II).",
};

export const SECOND_ORDRE: Regle = {
  id: "second_ordre_choix",
  type: "regle",
  etape: "analyse",
  libelle: "Effets du second ordre en analyse linéaire",
  enonce: "Méthode simplifiée recommandée par l'EN 1998-2.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "5.4(1)", page: "10" }],
  statut: "verifie",
};

// --- Déplacements -----------------------------------------------------------

export const D_LIM_CULEES: ParametreTable<Partial<Record<Categorie, number | null>>> = {
  id: "d_lim_culees",
  type: "table",
  etape: "verif_culees",
  libelle: "Déplacement sismique de calcul maximal des culées liées rigidement au tablier (ponts-routes)",
  symbole: "d_{lim}",
  unite: "mm",
  cles: ["catégorie d'importance"],
  valeurs: { I: null, II: null, III: 50, IV: 50 },
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "6.7.3(7)", page: "11" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §4.3", page: "190" },
  ],
  statut: "verifie",
  note: "null = aucune limitation. Catégorie IV : l'AN ne la cite pas et le guide (p. 190) lui attribue 50 mm ; choix du projet validé le 17/10/2026 : 50 mm pour les catégories III et IV. Ponts-rails, ponts-canaux : valeurs fixées par projet.",
};

// --- Vérifications ----------------------------------------------------------

export const LONGUEUR_ROTULE_PLASTIQUE: Formule = {
  id: "Lp_rotule_plastique",
  type: "formule",
  etape: "verif_piles",
  libelle: "Longueur des rotules plastiques des éléments en béton",
  latex: "L_p = 0{,}10\\,L + 0{,}015\\,f_{yk}\\,d_{bL}",
  variables: [
    { symbole: "L", description: "distance entre la section de rotule et la section de moment nul", unite: "m" },
    { symbole: "f_{yk}", description: "limite d'élasticité caractéristique des armatures longitudinales", unite: "MPa" },
    { symbole: "d_{bL}", description: "diamètre des armatures longitudinales", unite: "m" },
  ],
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "2.3.5.3(1)", page: "9" },
    { source: "NF_EN_1998_2", localisation: "annexe E, E.3.2(5), expression (E.19)", page: "126" },
  ],
  statut: "verifie",
  note: "EN 1998-2:2005, E.3.2(5) : f_yk en MPa (valeur numérique), L et d_bL en m : pour f_yk = 500 MPa et d_bL = 0,025 m, 0,015 f_yk d_bL = 0,19 m.",
};

export const GAMMA_BD_OPTION: Regle = {
  id: "gamma_Bd_option",
  type: "regle",
  etape: "verif_piles",
  libelle: "γBd des éléments ductiles hors rotules plastiques",
  enonce: "Option 2 : 1 ≤ γBd = γBd1.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "5.6.3.3(1)P b)", page: "10" }],
  statut: "verifie",
};

export const DUCTILITE_LIMITEE_FAIBLE: Regle = {
  id: "ductilite_limitee_faible_sismicite",
  type: "regle",
  etape: "verif_piles",
  libelle: "Vérifications simplifiées des ponts à ductilité limitée en faible sismicité",
  enonce: "Règles recommandées par l'EN 1998-2.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "6.5.1(1)P", page: "10" }],
  statut: "verifie",
};

export const SPIRES_INTERDITES: Regle = {
  id: "spires_interdites",
  type: "regle",
  etape: "dispositions_constructives",
  libelle: "Type d'armatures de confinement",
  enonce: "Les spires hélicoïdales sont interdites dans les zones critiques.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "6.2.1.4(1)P", page: "10" }],
  statut: "verifie",
};

export const ELASTOMERE_FONCTIONNALITE: Regle = {
  id: "elastomere_fonctionnalite",
  type: "regle",
  etape: "verif_appareils_appui",
  libelle: "Appareils en élastomère pouvant être détériorés",
  enonce:
    "Le pont doit garder une fonctionnalité immédiate pour les circulations d'urgence : la transmission des charges verticales entre tablier et appui doit être maintenue.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "6.6.2.3(3)", page: "10" }],
  statut: "verifie",
};

export const ISOLATION_CHOIX: Regle = {
  id: "isolation_choix",
  type: "regle",
  etape: "verif_appareils_appui",
  libelle: "Ponts avec isolation sismique (hors V1)",
  enonce:
    "TD du spectre de calcul, γIS, δw, δb et coefficients λ : valeurs recommandées de l'EN 1998-2. γm = 1,00 pour les appareils d'appui en élastomère.",
  references: [{ source: "NF_EN_1998_2_NA", localisation: "7.4.1(1)P, 7.6.2(1)P, 7.6.2(5), 7.7.1(2), J.2(1)", page: "11-12" }],
  statut: "verifie",
};

export const TEMPERATURE_MIN_ISOLATEUR: ParametreTable<Record<"beton" | "mixte" | "acier", number>> = {
  id: "delta_T1_isolateur",
  type: "table",
  etape: "verif_appareils_appui",
  libelle: "ΔT1 pour la température minimale d'un isolateur, Tmin,b = T0 − ψ2(T0 − Tmin) + ΔT1 avec ψ2 = 0,50",
  symbole: "\\Delta T_1",
  unite: "°C",
  cles: ["matériau du tablier"],
  valeurs: { beton: 7.5, mixte: 5.0, acier: -2.5 },
  references: [{ source: "NF_EN_1998_2_NA", localisation: "J.1(2), tableau J.1 N", page: "11-12" }],
  statut: "verifie",
  note: "Tmin selon EN 1991-1-5 6.1.3.2 (probabilité annuelle de dépassement 0,02).",
};

// --- Fondations -------------------------------------------------------------

export const MAGNITUDE_LIQUEFACTION: ParametreTable<Partial<Record<ZoneSoumise, number>>> = {
  id: "magnitude_liquefaction",
  type: "table",
  etape: "verif_fondations",
  libelle: "Magnitude conventionnelle pour l'analyse de la liquéfaction (NF EN 1998-5 annexe B)",
  symbole: "M_s",
  unite: "-",
  cles: ["zone de sismicité"],
  valeurs: { 3: 5.5, 4: 6.0, 5: 7.5 },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 III" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction §2.2.3", page: "13" },
  ],
  statut: "via_guide",
  note: "Analyse de la liquéfaction non requise en zones 1 et 2.",
};

export const NATIONAUX: EntreeReferentiel[] = [
  CHAMP_APPLICATION,
  CATEGORIES_IMPORTANCE,
  EXEMPTION,
  FONDATIONS_DEUX_ZONES,
  REGLES_APPLICABLES,
  SEISME_ACCIDENTEL,
  GAMMA_I,
  AGR,
  PARAMETRE_SOL_S,
  SOL_ET_VERTICAL,
  PERIODES_HORIZONTALES,
  SPECTRE_VERTICAL,
  SOL_PAR_DEFAUT,
  RHO_0,
  PSI_21,
  ANNEXES_INFORMATIVES,
  VARIABILITE_SPATIALE,
  FAIBLE_SISMICITE,
  SECOND_ORDRE,
  D_LIM_CULEES,
  LONGUEUR_ROTULE_PLASTIQUE,
  GAMMA_BD_OPTION,
  DUCTILITE_LIMITEE_FAIBLE,
  SPIRES_INTERDITES,
  ELASTOMERE_FONCTIONNALITE,
  ISOLATION_CHOIX,
  TEMPERATURE_MIN_ISOLATEUR,
  MAGNITUDE_LIQUEFACTION,
];
