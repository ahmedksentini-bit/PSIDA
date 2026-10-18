// Coefficient de comportement q, régularité et déplacements associés.

import type { EntreeReferentiel, Formule, ParametreTable, Regle } from "./types.ts";

export const ETA_K: Formule = {
  id: "eta_k",
  type: "formule",
  etape: "comportement",
  libelle: "Effort normal réduit dans une pile en béton armé",
  latex: "\\eta_k = \\dfrac{N_{Ed}}{A_c\\,f_{ck}}",
  variables: [
    { symbole: "N_{Ed}", description: "effort normal dans la situation sismique de calcul", unite: "MN" },
    { symbole: "A_c", description: "aire de la section brute de béton", unite: "m²" },
    { symbole: "f_{ck}", description: "résistance caractéristique du béton en compression", unite: "MPa" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "5.3(4), expression (5.2) ; renvoi de 4.1.6(5)P", page: "58" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2", page: "64" },
  ],
  statut: "via_guide",
};

type LigneQ = { "ductilité limitée": number | string; "ductile (ηk < 0,3)": number | string };

export const Q_MAX: ParametreTable<Record<string, LigneQ>> = {
  id: "q_max",
  type: "table",
  etape: "comportement",
  libelle: "Valeurs maximales du coefficient de comportement q",
  symbole: "q",
  unite: "-",
  cles: ["élément ductile"],
  valeurs: {
    "Piles BA — verticales en flexion": { "ductilité limitée": 1.5, "ductile (ηk < 0,3)": "3,5 λ(αs)" },
    "Piles BA — béquilles inclinées fléchies": { "ductilité limitée": 1.2, "ductile (ηk < 0,3)": "2,1 λ(αs)" },
    "Piles acier — verticales en flexion": { "ductilité limitée": 1.5, "ductile (ηk < 0,3)": 3.5 },
    "Piles acier — béquilles inclinées fléchies": { "ductilité limitée": 1.2, "ductile (ηk < 0,3)": 2.0 },
    "Piles acier — contreventement normal": { "ductilité limitée": 1.5, "ductile (ηk < 0,3)": 2.5 },
    "Piles acier — contreventement excentré": { "ductilité limitée": "—", "ductile (ηk < 0,3)": 3.5 },
    "Culées liées rigidement au tablier — en général": { "ductilité limitée": 1.5, "ductile (ηk < 0,3)": 1.5 },
    "Culées liées rigidement — structures bloquées": { "ductilité limitée": 1.0, "ductile (ηk < 0,3)": 1.0 },
    Arcs: { "ductilité limitée": 1.2, "ductile (ηk < 0,3)": 2.0 },
  },
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6 ; 4.1.6(9) et (10) pour les structures bloquées", page: "46" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2, tableau 4", page: "65" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : tableau 4.1 en 4.1.6(3)P confirmé, valable pour ηk ≤ 0,30 (4.1.6(5)P).",
};

export const LAMBDA_ALPHA_S: Formule = {
  id: "lambda_alpha_s",
  type: "formule",
  etape: "comportement",
  libelle: "Facteur λ(αs) des piles en béton armé",
  latex:
    "\\alpha_s = \\dfrac{L_s}{h}, \\qquad \\lambda(\\alpha_s) = \\begin{cases} 1{,}0 & \\alpha_s \\ge 3 \\\\ \\sqrt{\\alpha_s / 3} & 1{,}0 \\le \\alpha_s < 3 \\end{cases}",
  variables: [
    { symbole: "L_s", description: "distance entre la rotule plastique et la section de moment nul", unite: "m" },
    { symbole: "h", description: "hauteur de la section dans le plan de flexion", unite: "m" },
  ],
  conditions: ["Piles rectangulaires à zone comprimée triangulaire : retenir la plus petite valeur de αs des deux directions."],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6", page: "46" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2", page: "65" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : tableau 4.1 : λ = √(αs/3) pour 3 > αs ≥ 1,0 seulement ; pour αs < 1,0 (pile très trapue), le tableau ne donne pas de valeur et le comportement ductile n'y est pas couvert ; λ = 1,0 pour αs ≥ 3.",
};

export const Q_REDUCTION_EFFORT_NORMAL: Formule = {
  id: "q_reduction_effort_normal",
  type: "formule",
  etape: "comportement",
  libelle: "Réduction de q des piles en béton armé fortement comprimées",
  latex:
    "q_r = \\begin{cases} q & \\eta_k < 0{,}3 \\\\[4pt] q - \\dfrac{\\eta_k - 0{,}3}{0{,}3}\\,(q - 1) \\ge 1{,}0 & 0{,}3 \\le \\eta_k < 0{,}6 \\\\[4pt] 1{,}0 & \\eta_k \\ge 0{,}6 \\end{cases}",
  variables: [
    { symbole: "\\eta_k", description: "effort normal réduit", unite: "-" },
    { symbole: "q", description: "valeur maximale du tableau pour ηk < 0,3", unite: "-" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6", page: "46" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2, tableau 4", page: "65" },
  ],
  statut: "a_verifier",
  note: "EN 1998-2:2005 : (4.2) qr = q − (ηk − 0,3)/0,3·(q − 1) ≥ 1,0, et qr = 1,0 pour ηk ≥ 0,6 : la forme retenue est celle de l'EN ; le guide a perdu le terme « q − ».",
};

export const Q_VERTICAL: Regle = {
  id: "q_vertical",
  type: "regle",
  etape: "comportement",
  libelle: "Coefficient de comportement vertical",
  enonce: "Pour la composante verticale, q = 1,0 : on utilise le spectre de réponse élastique vertical.",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6(12)P", page: "47" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "83" },
  ],
  statut: "via_guide",
};

export const Q_ELASTOMERE: Regle = {
  id: "q_elastomere",
  type: "regle",
  etape: "comportement",
  libelle: "Ponts sur appareils d'appui en élastomère fretté",
  enonce:
    "Ponts usuels sur élastomère fretté, à piles rigides et légères : comportement quasi élastique, q = 1, avec les dispositions constructives de ductilité limitée.",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6(11)P ; 7.3(2)P ; 7.5.1(3) ; 7.6.3(2)", page: "47" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2", page: "65" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 7.3(2)P et 7.6.3(2) admettent une réponse à ductilité limitée (q ≤ 1,5) des sous-structures ; q = 1 est le choix du guide, repris par l'annexe nationale de 2013 (7.3(2)P) pour les ponts courants à piles rigides sur appareils.",
};

export const Q_ROTULES_INACCESSIBLES: Regle = {
  id: "q_rotules_inaccessibles",
  type: "regle",
  etape: "comportement",
  libelle: "Rotules plastiques non accessibles",
  enonce:
    "Si les rotules plastiques ne sont pas accessibles pour inspection et réparation, multiplier les valeurs de q « ductile » du tableau 4.1 par 0,6 : q = max(0,6·q ; 1,0).",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6 ; accessibilité : 4.1.6(6) note", page: "46" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2 ; ch. 3 §7.1", page: "65, 61" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.1.6(6) : multiplier les valeurs « ductile » du tableau 4.1 par 0,6, sans qu'il soit nécessaire de descendre sous 1,0, soit q = max(0,6·q ; 1,0) ; la note définit seulement « accessible ».",
};

export const Q_STRUCTURES_BLOQUEES: Regle = {
  id: "q_structures_bloquees",
  type: "regle",
  etape: "comportement",
  libelle: "Structures bloquées",
  enonce:
    "q = 1,0 pour les structures très raides (période propre T ≤ 0,03 s), dont les tabliers liés rigidement aux deux culées enchâssées dans un sol naturel raide sur au moins 80 % de leur surface latérale ; sinon, si T > 0,03 s, q = 1,5. Cadres et murs de soutènement : q = 1 (guide ; EN 6.7.3(9) et 6.7.5).",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6(9) et (10)", page: "47" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2, tableau 4, note 3", page: "65" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.1.6(9) range aussi dans cette catégorie les culées liées de façon flexible au tablier ; 4.1.6(10) vise le tablier horizontal lié aux deux culées. Les cadres et ouvrages de soutènement sont ajoutés par le guide (culée enterrée à plus de 80 % : 6.7.3(9) ; murs : 6.7.5).",
};

export const Q_PLUSIEURS_TYPES: Regle = {
  id: "q_plusieurs_types",
  type: "regle",
  etape: "comportement",
  libelle: "Plusieurs types d'éléments ductiles dans une direction",
  enonce: "Retenir le q du type d'appuis qui contribue le plus à la résistance au séisme dans la direction considérée.",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.6(3)P", page: "45" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 2 §2.4 ; ch. 4 §1.2", page: "40, 65" },
  ],
  statut: "via_guide",
};

export const REGULARITE: Formule = {
  id: "regularite_rho",
  type: "formule",
  etape: "comportement",
  libelle: "Critère de comportement ductile régulier",
  latex: "r_i = q\\,\\dfrac{M_{Ed,i}}{M_{Rd,i}}, \\qquad \\rho = \\dfrac{r_{max}}{r_{min}} \\le \\rho_0 = 1{,}5",
  variables: [
    { symbole: "M_{Ed,i}", description: "moment de calcul maximal à la rotule de l'élément ductile i (situation sismique)", unite: "MN·m" },
    { symbole: "M_{Rd,i}", description: "moment résistant de calcul de cette section", unite: "MN·m" },
    { symbole: "r_i", description: "réduction de q demandée à l'élément i", unite: "-" },
  ],
  conditions: [
    "Les éléments dont la contribution cumulée à l'effort tranchant sismique total ne dépasse pas 20 % peuvent être exclus du calcul de rmin et rmax.",
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.8, expression (4.4)", page: "48" },
    { source: "NF_EN_1998_2_NA", localisation: "4.1.8(2)", page: "10" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2", page: "64" },
  ],
  statut: "via_guide",
  note: "ρ0 = 1,5 en France (valeur recommandée de l'EN : 2,0). Numéro d'expression (4.4) lu dans l'AN.",
};

export const Q_IRREGULIER: Formule = {
  id: "q_irregulier",
  type: "formule",
  etape: "comportement",
  libelle: "Coefficient de comportement réduit d'un pont irrégulier",
  latex: "q_r = q\\,\\dfrac{\\rho_0}{\\rho} \\ge 1{,}0",
  variables: [{ symbole: "\\rho", description: "rapport rmax / rmin", unite: "-" }],
  conditions: ["Alternative : analyse non linéaire."],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.8(4)P, expression (4.5)", page: "48" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.2", page: "64" },
  ],
  statut: "via_guide",
};

export const MU_D: Formule = {
  id: "mu_d",
  type: "formule",
  etape: "deplacements",
  libelle: "Déplacements sismiques de calcul en analyse linéaire avec q",
  latex:
    "d_E = \\pm\\,\\eta\\,\\mu_d\\,d_{Ee}, \\qquad \\mu_d = \\begin{cases} q & T \\ge T_0 = 1{,}25\\,T_C \\\\[4pt] (q - 1)\\,\\dfrac{T_0}{T} + 1 \\le 5q - 4 & T < T_0 \\end{cases}",
  variables: [
    { symbole: "d_{Ee}", description: "déplacement obtenu par l'analyse linéaire avec le spectre de calcul", unite: "m" },
    { symbole: "\\eta", description: "coefficient de correction de l'amortissement", unite: "-" },
    { symbole: "\\mu_d", description: "ductilité en déplacement", unite: "-" },
  ],
  conditions: ["Périodes très faibles (T < 0,033 s) : q = 1, donc μd = 1."],
  references: [
    { source: "NF_EN_1998_2", localisation: "2.3.6.1(6)P et 2.3.6.1(8)P", page: "32" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5 et §5.8", page: "82, 135" },
  ],
  statut: "via_guide",
  note: "Le guide énonce la règle en clair ; la forme produit est reconstituée.",
};

export const PLANCHER_BETA_DEPLACEMENTS: Regle = {
  id: "plancher_beta_deplacements",
  type: "regle",
  etape: "deplacements",
  libelle: "Structures très souples touchées par le plancher β·ag",
  enonce: "Tirer les déplacements du spectre élastique ou du spectre en déplacement, et non du spectre de calcul écrêté.",
  references: [
    { source: "NF_EN_1998_1", localisation: "4.3.4(1)P, expression (4.23)", page: "54-55" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §2.5", page: "82" },
  ],
  statut: "via_guide",
};

export const COMPORTEMENT: EntreeReferentiel[] = [
  ETA_K,
  Q_MAX,
  LAMBDA_ALPHA_S,
  Q_REDUCTION_EFFORT_NORMAL,
  Q_VERTICAL,
  Q_ELASTOMERE,
  Q_ROTULES_INACCESSIBLES,
  Q_STRUCTURES_BLOQUEES,
  Q_PLUSIEURS_TYPES,
  REGULARITE,
  Q_IRREGULIER,
  MU_D,
  PLANCHER_BETA_DEPLACEMENTS,
];
