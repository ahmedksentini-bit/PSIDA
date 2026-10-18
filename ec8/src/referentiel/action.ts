// Action sismique : accélérations, spectres et paramètres de site.
// Pages du guide = pagination imprimée du livre.

import type { ClasseSol } from "./nationaux.ts";
import type { EntreeReferentiel, Formule, ParametreScalaire, ParametreTable, Regle } from "./types.ts";

export const AG: Formule = {
  id: "ag",
  type: "formule",
  etape: "action_sismique",
  libelle: "Accélération horizontale de calcul au rocher",
  latex: "a_g = \\gamma_I \\cdot a_{gR}",
  variables: [
    { symbole: "\\gamma_I", description: "coefficient d'importance", unite: "-" },
    { symbole: "a_{gR}", description: "accélération maximale de référence au rocher", unite: "m/s²" },
  ],
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II b)" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.2", page: "73" },
  ],
  statut: "verifie",
};

export const AVG: Formule = {
  id: "avg",
  type: "formule",
  etape: "action_sismique",
  libelle: "Accélération verticale de calcul",
  latex: "a_{vg} = 0{,}90\\,a_g \\ \\text{(zones 2 à 4)}, \\qquad a_{vg} = 0{,}80\\,a_g \\ \\text{(zone 5)}",
  variables: [{ symbole: "a_g", description: "accélération horizontale de calcul au rocher", unite: "m/s²" }],
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II e)" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.2", page: "73" },
  ],
  statut: "via_guide",
};

export const ETA: Formule = {
  id: "eta",
  type: "formule",
  etape: "action_sismique",
  libelle: "Coefficient de correction de l'amortissement",
  latex: "\\eta = \\sqrt{\\dfrac{10}{5 + \\xi}} \\ge 0{,}55",
  variables: [{ symbole: "\\xi", description: "coefficient d'amortissement visqueux", unite: "%" }],
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.2(3), éq. (3.6)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "79" },
  ],
  statut: "via_guide",
  note: "η = 1 pour ξ = 5 %.",
};

export const SE: Formule = {
  id: "Se",
  type: "formule",
  etape: "action_sismique",
  libelle: "Spectre de réponse élastique horizontal",
  latex:
    "S_e(T) = a_g\\,S\\,S_T \\times \\begin{cases} 1 + \\dfrac{T}{T_B}\\,(2{,}5\\,\\eta - 1) & 0 \\le T \\le T_B \\\\[4pt] 2{,}5\\,\\eta & T_B \\le T \\le T_C \\\\[4pt] 2{,}5\\,\\eta\\,\\dfrac{T_C}{T} & T_C \\le T \\le T_D \\\\[4pt] 2{,}5\\,\\eta\\,\\dfrac{T_C\\,T_D}{T^2} & T_D \\le T \\le 4\\ \\text{s} \\end{cases}",
  variables: [
    { symbole: "T", description: "période de vibration d'un oscillateur linéaire à un degré de liberté", unite: "s" },
    { symbole: "S", description: "paramètre de sol", unite: "-" },
    { symbole: "S_T", description: "coefficient d'amplification topographique", unite: "-" },
    { symbole: "T_B,\\,T_C,\\,T_D", description: "périodes de coin du spectre", unite: "s" },
  ],
  conditions: ["Valable pour T ≤ 4 s ; au-delà, utiliser le spectre en déplacement."],
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.2(1)P, éq. (3.2) à (3.5)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "79" },
  ],
  statut: "via_guide",
  note: "Le guide intègre S_T dans l'expression ; l'EN 1998-1 l'écrit sans S_T, introduit par l'EN 1998-5 annexe A.",
};

export const SVE: Formule = {
  id: "Sve",
  type: "formule",
  etape: "action_sismique",
  libelle: "Spectre de réponse élastique vertical",
  latex:
    "S_{ve}(T) = a_{vg}\\,S_T \\times \\begin{cases} 1 + \\dfrac{T}{T_B}\\,(3{,}0\\,\\eta - 1) & 0 \\le T \\le T_B \\\\[4pt] 3{,}0\\,\\eta & T_B \\le T \\le T_C \\\\[4pt] 3{,}0\\,\\eta\\,\\dfrac{T_C}{T} & T_C \\le T \\le T_D \\\\[4pt] 3{,}0\\,\\eta\\,\\dfrac{T_C\\,T_D}{T^2} & T_D \\le T \\le 4\\ \\text{s} \\end{cases}",
  variables: [
    { symbole: "a_{vg}", description: "accélération verticale de calcul", unite: "m/s²" },
    { symbole: "T_B,\\,T_C,\\,T_D", description: "périodes de coin du spectre vertical (indépendantes du sol)", unite: "s" },
  ],
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.3(1)P, éq. (3.8) à (3.11)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "81" },
  ],
  statut: "via_guide",
  note: "Composante verticale : q = 1, on utilise ce spectre élastique (voir q_vertical).",
};

export const SD: Formule = {
  id: "Sd",
  type: "formule",
  etape: "action_sismique",
  libelle: "Spectre de calcul horizontal pour l'analyse élastique",
  latex:
    "S_d(T) = a_g\\,S\\,S_T \\times \\begin{cases} \\dfrac{2}{3} + \\dfrac{T}{T_B}\\left(\\dfrac{2{,}5}{q} - \\dfrac{2}{3}\\right) & 0 \\le T \\le T_B \\\\[6pt] \\dfrac{2{,}5}{q} & T_B \\le T \\le T_C \\\\[6pt] \\dfrac{2{,}5}{q}\\,\\dfrac{T_C}{T} & T_C \\le T \\le T_D \\\\[6pt] \\dfrac{2{,}5}{q}\\,\\dfrac{T_C\\,T_D}{T^2} & T_D \\le T \\le 4\\ \\text{s} \\end{cases} \\qquad S_d(T) \\ge \\beta\\,a_g \\ \\text{pour}\\ T \\ge T_C",
  variables: [
    { symbole: "q", description: "coefficient de comportement", unite: "-" },
    { symbole: "\\beta", description: "coefficient de limite inférieure du spectre de calcul", unite: "-" },
  ],
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.5(4)P, éq. (3.13) à (3.16)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "82" },
  ],
  statut: "via_guide",
  note: "η n'apparaît pas : il est intégré implicitement dans q.",
};

export const BETA: ParametreScalaire = {
  id: "beta",
  type: "scalaire",
  etape: "action_sismique",
  libelle: "Limite inférieure du spectre de calcul horizontal",
  symbole: "\\beta",
  unite: "-",
  valeur: 0.2,
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.5(4)P, note", etat: "a_confirmer" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.2.5(4)P", page: "7" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "82" },
  ],
  statut: "via_guide",
  note: "L'AN de l'EN 1998-1 renvoie aux AN des autres parties pour les ouvrages autres que les bâtiments ; l'AN de l'EN 1998-2 ne fixe pas β. Le guide retient la valeur recommandée 0,2.",
};

export const SDE: Formule = {
  id: "SDe",
  type: "formule",
  etape: "action_sismique",
  libelle: "Spectre de réponse élastique en déplacement",
  latex: "S_{De}(T) = S_e(T)\\left(\\dfrac{T}{2\\pi}\\right)^2",
  variables: [{ symbole: "S_e(T)", description: "spectre élastique horizontal en accélération", unite: "m/s²" }],
  conditions: ["Valable pour T ≤ 4 s."],
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.2(5), éq. (3.7)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "84" },
  ],
  statut: "via_guide",
};

export const SDE_LONGUES_PERIODES: Formule = {
  id: "SDe_longues_periodes",
  type: "formule",
  etape: "action_sismique",
  libelle: "Spectre élastique en déplacement aux longues périodes",
  latex:
    "S_{De}(T) = \\begin{cases} 0{,}025\\,a_g\\,S\\,S_T\\,T_C\\,T_D \\left[2{,}5\\,\\eta + \\dfrac{T - T_E}{T_F - T_E}\\,(1 - 2{,}5\\,\\eta)\\right] & T_E \\le T \\le T_F \\\\[6pt] d_g & T \\ge T_F \\end{cases}",
  variables: [{ symbole: "T_E,\\,T_F", description: "périodes de coin du spectre en déplacement", unite: "s" }],
  references: [
    { source: "NF_EN_1998_1", localisation: "annexe A (informative)", etat: "citee_par_guide" },
    { source: "NF_EN_1998_1_NA", localisation: "AN 2", page: "18" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "84" },
  ],
  statut: "via_guide",
  note: "Annexe informative. Le guide ne précise pas la branche entre 4 s et T_E (à vérifier).",
};

export const TE_TF: ParametreTable<Record<ClasseSol, { TE: number; TF: number }>> = {
  id: "TE_TF",
  type: "table",
  etape: "action_sismique",
  libelle: "Périodes de coin du spectre en déplacement",
  symbole: "T_E,\\ T_F",
  unite: "s",
  cles: ["classe de sol"],
  valeurs: {
    A: { TE: 4.5, TF: 10 },
    B: { TE: 5.0, TF: 10 },
    C: { TE: 6.0, TF: 10 },
    D: { TE: 6.0, TF: 10 },
    E: { TE: 6.0, TF: 10 },
  },
  references: [
    { source: "NF_EN_1998_1", localisation: "annexe A, tableau A.1", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5, tableau 14", page: "84" },
  ],
  statut: "via_guide",
};

export const DG: Formule = {
  id: "dg",
  type: "formule",
  etape: "action_sismique",
  libelle: "Déplacement de calcul du sol",
  latex: "d_g = 0{,}025\\,a_g\\,S\\,S_T\\,T_C\\,T_D",
  variables: [
    { symbole: "a_g", description: "accélération horizontale de calcul au rocher", unite: "m/s²" },
    { symbole: "T_C,\\,T_D", description: "périodes de coin du spectre horizontal", unite: "s" },
  ],
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.4(1), éq. (3.12)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "84" },
  ],
  statut: "via_guide",
  note: "Le guide inclut S_T, absent de l'expression de l'EN 1998-1.",
};

export const VS30: Formule = {
  id: "vs30",
  type: "formule",
  etape: "action_sismique",
  libelle: "Vitesse moyenne des ondes de cisaillement sur les 30 m supérieurs",
  latex: "v_{s,30} = \\dfrac{30}{\\displaystyle\\sum_{i=1}^{N} \\frac{h_i}{v_i}}",
  variables: [
    { symbole: "h_i", description: "épaisseur de la couche i (sur les 30 premiers mètres)", unite: "m" },
    { symbole: "v_i", description: "vitesse des ondes de cisaillement dans la couche i", unite: "m/s" },
  ],
  references: [
    { source: "NF_EN_1998_1", localisation: "3.1.2(3), éq. (3.1)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.3", page: "75" },
  ],
  statut: "via_guide",
};

export const CLASSES_SOL: ParametreTable<Record<ClasseSol, { vs30: string; NSPT: string; cu: string }>> = {
  id: "classes_sol",
  type: "table",
  etape: "action_sismique",
  libelle: "Classes de sol : bornes de vs,30, NSPT et cu",
  symbole: "v_{s,30},\\ N_{SPT},\\ c_u",
  unite: "m/s, coups/30 cm, kPa",
  cles: ["classe de sol"],
  valeurs: {
    A: { vs30: "> 800", NSPT: "—", cu: "—" },
    B: { vs30: "360 – 800", NSPT: "> 50", cu: "> 250" },
    C: { vs30: "180 – 360", NSPT: "15 – 50", cu: "70 – 250" },
    D: { vs30: "< 180", NSPT: "< 15", cu: "< 70" },
    E: { vs30: "alluvions C ou D de 5 à 20 m sur un substratum à vs > 800", NSPT: "—", cu: "—" },
  },
  references: [
    { source: "NF_EN_1998_1", localisation: "3.1.2, tableau 3.1", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.3, tableau 8", page: "74" },
  ],
  statut: "via_guide",
  note: "Classes S1 (argiles molles, vases) et S2 (sols liquéfiables, argiles sensibles) : études particulières. Le guide ajoute des valeurs indicatives pressiométriques et pénétrométriques.",
};

export const CLASSE_DEFAVORABLE: Regle = {
  id: "classe_sol_defavorable",
  type: "regle",
  etape: "action_sismique",
  libelle: "Doute sur la classe de sol ou sols différents sous les appuis",
  enonce:
    "Retenir la situation la plus défavorable : classe déclassée ou enveloppe des spectres, et une action unique correspondant au sol le plus défavorable sous tous les appuis.",
  references: [
    { source: "NF_EN_1998_2", localisation: "3.2.2.1 et 3.3(4)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.3 et §3.4", page: "76, 91" },
  ],
  statut: "via_guide",
  note: "L'existence de la clause 3.2.2.1 imprimée par le guide reste à confirmer.",
};

export const ST: Regle = {
  id: "ST",
  type: "regle",
  etape: "action_sismique",
  libelle: "Coefficient d'amplification topographique S_T",
  enonce:
    "Pentes de hauteur > 30 m et d'inclinaison > 15° : S_T ≥ 1,2 pour un versant ou une pente isolée près de la crête ; S_T ≥ 1,4 pour une butte à crête étroite de pente moyenne > 30° (≥ 1,2 si < 30°) ; majoration de 20 % en présence d'une couche lâche en surface ; variation linéaire depuis la base, où S_T = 1. Sinon S_T = 1. S_T multiplie l'accélération de calcul.",
  references: [
    { source: "NF_EN_1998_5", localisation: "annexe A", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.4", page: "78" },
  ],
  statut: "via_guide",
};

export const PLATEAU_ORIGINE: Regle = {
  id: "plateau_origine",
  type: "regle",
  etape: "action_sismique",
  libelle: "Prolongement du plateau des spectres jusqu'à T = 0",
  enonce:
    "Le guide recommande de prolonger le plateau des spectres (élastiques, de calcul et vertical) jusqu'à l'origine, pour couvrir les incertitudes sur les périodes propres (fondations supposées rigides, inerties brutes non fissurées).",
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5 ; annexe 1 §1.7.3", page: "83, 246" }],
  statut: "via_guide",
  note: "Recommandation du guide, plus sévère que la forme de l'EN 1998-1 pour T < T_B.",
};

export const ACTION: EntreeReferentiel[] = [
  PLATEAU_ORIGINE,
  AG,
  AVG,
  ETA,
  SE,
  SVE,
  SD,
  BETA,
  SDE,
  SDE_LONGUES_PERIODES,
  TE_TF,
  DG,
  VS30,
  CLASSES_SOL,
  CLASSE_DEFAVORABLE,
  ST,
];
