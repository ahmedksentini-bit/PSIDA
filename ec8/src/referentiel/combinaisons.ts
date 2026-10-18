// Combinaisons des directions, combinaison sismique et variabilité spatiale.

import type { ClasseSol } from "./nationaux.ts";
import type { EntreeReferentiel, Formule, ParametreTable, Regle } from "./types.ts";

export const COMBINAISON_100_30_30: Formule = {
  id: "combinaison_100_30_30",
  type: "formule",
  etape: "combinaisons",
  libelle: "Combinaison des trois composantes du séisme (règle 100 % / 30 % / 30 %)",
  latex: "E = \\pm E_1 \\pm 0{,}3\\,E_2 \\pm 0{,}3\\,E_3",
  variables: [{ symbole: "E_1,\\,E_2,\\,E_3", description: "effets du séisme dans chacune des trois directions, la direction 1 étant prépondérante", unite: "" }],
  conditions: ["24 combinaisons : 3 permutations de la direction prépondérante × 2³ signes."],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.2.1.4(2)", page: "50" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.2", page: "89" },
  ],
  statut: "via_guide",
};

export const COMBINAISON_SRSS: Formule = {
  id: "combinaison_srss",
  type: "formule",
  etape: "combinaisons",
  libelle: "Combinaison quadratique des trois composantes du séisme",
  latex: "E = \\sqrt{E_1^2 + E_2^2 + E_3^2}",
  variables: [{ symbole: "E_1,\\,E_2,\\,E_3", description: "effets du séisme dans chacune des trois directions", unite: "" }],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.2.1.4(1)", page: "50" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.2", page: "90" },
  ],
  statut: "via_guide",
};

export const COMBINAISON_SISMIQUE: Formule = {
  id: "combinaison_sismique",
  type: "formule",
  etape: "combinaisons",
  libelle: "Combinaison des actions dans la situation sismique de calcul",
  latex: "E_d = G_k \\ \\text{“+”}\\ P_k \\ \\text{“+”}\\ A_{Ed} \\ \\text{“+”}\\ \\psi_{2,1}\\,Q_{1k} \\ \\text{“+”}\\ Q_2",
  variables: [
    { symbole: "G_k", description: "actions permanentes (valeur caractéristique)", unite: "" },
    { symbole: "P_k", description: "précontrainte (valeur caractéristique)", unite: "" },
    { symbole: "A_{Ed}", description: "action sismique de calcul", unite: "" },
    { symbole: "Q_{1k}", description: "charges de trafic (valeur caractéristique)", unite: "" },
    { symbole: "Q_2", description: "valeur quasi permanente des actions de longue durée (poussée des terres, flottabilité…)", unite: "" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "5.5", page: "60" },
    { source: "NF_EN_1990", localisation: "6.4.3.4 et annexe A2", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.3", page: "90" },
  ],
  statut: "via_guide",
  note: "« + » signifie « combiné à ».",
};

export const COMBINAISON_EQUIPEMENTS: Formule = {
  id: "combinaison_equipements",
  type: "formule",
  etape: "combinaisons",
  libelle: "Combinaison sismique pour les appareils d'appui et les joints",
  latex:
    "E_d = G_k \\ \\text{“+”}\\ P_k \\ \\text{“+”}\\ A_{Ed} \\ \\text{“+”}\\ \\psi_{2,1}\\,Q_{1k} \\ \\text{“+”}\\ Q_2 \\ \\text{“+”}\\ 0{,}5\\,S_{Th} \\ \\text{“+”}\\ S_{diff}",
  variables: [
    { symbole: "S_{Th}", description: "effets de la variation uniforme de température", unite: "" },
    { symbole: "S_{diff}", description: "effets des déformations différées (retrait, fluage)", unite: "" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "2.3.6.3(2)", page: "33" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.3", page: "91" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 2.3.6.3(2)P combine des déplacements ; la prise en compte des déformations imposées dans la combinaison d'actions relève de 5.5(3)P (ponts sur élastomère fretté). Le 0,5 sur STh est le ψ2 de l'EN 1990.",
};

export const LG: ParametreTable<Record<ClasseSol, number>> = {
  id: "Lg",
  type: "table",
  etape: "combinaisons",
  libelle: "Distance au-delà de laquelle les mouvements du sol sont indépendants",
  symbole: "L_g",
  unite: "m",
  cles: ["classe de sol"],
  valeurs: { A: 600, B: 500, C: 400, D: 300, E: 500 },
  references: [
    { source: "NF_EN_1998_2", localisation: "3.3(6), note 1", page: "40" },
    { source: "NF_EN_1998_2_NA", localisation: "3.3(6) note 1", page: "10" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.4, tableau 15", page: "91" },
  ],
  statut: "via_guide",
  note: "L'AN retient les valeurs recommandées de l'EN.",
};

export const L_LIM: Formule = {
  id: "L_lim",
  type: "formule",
  etape: "combinaisons",
  libelle: "Longueur de tablier continu au-delà de laquelle la variabilité spatiale est à considérer",
  latex: "L_{lim} = \\dfrac{L_g}{1{,}5}",
  variables: [{ symbole: "L_g", description: "distance d'indépendance des mouvements du sol", unite: "m" }],
  references: [
    { source: "NF_EN_1998_2", localisation: "3.3", page: "38" },
    { source: "NF_EN_1998_2_NA", localisation: "3.3(1)P", page: "9-10" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.4", page: "91" },
  ],
  statut: "via_guide",
  note: "Le guide arrondit Llim à 400, 330, 270, 200 et 330 m.",
};

export const DEPLACEMENTS_DIFFERENTIELS: Formule = {
  id: "deplacements_differentiels",
  type: "formule",
  etape: "combinaisons",
  libelle: "Déplacements différentiels imposés aux appuis (deux séries appliquées séparément)",
  latex:
    "d_{1i} = \\dfrac{L_i}{L_g}\\,d_g\\sqrt{2} \\le d_g\\sqrt{2}, \\qquad d_{2i} = \\pm\\dfrac{1}{2}\\,\\beta_r\\,\\dfrac{d_g\\sqrt{2}}{L_g}\\,L_{av,i}",
  variables: [
    { symbole: "L_i", description: "distance de l'appui i à l'appui de référence", unite: "m" },
    { symbole: "L_{av,i}", description: "moyenne des distances de l'appui i aux appuis adjacents", unite: "m" },
    { symbole: "\\beta_r", description: "0,5 si les trois appuis sont sur le même sol, 1,0 sinon", unite: "-" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "3.3(6)", page: "39" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.4", page: "92" },
  ],
  statut: "via_guide",
};

export const COMBINAISON_VARIABILITE: Formule = {
  id: "combinaison_variabilite",
  type: "formule",
  etape: "combinaisons",
  libelle: "Cumul de la réponse vibratoire et des déplacements différentiels",
  latex: "A_{Ed} = \\sqrt{A_{vib}^2 + A_{dépl\\,diff}^2}",
  variables: [
    { symbole: "A_{vib}", description: "effets de la réponse inertielle", unite: "" },
    { symbole: "A_{dépl\\,diff}", description: "effets des déplacements différentiels", unite: "" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "3.3", page: "41" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.4", page: "91-92" },
  ],
  statut: "a_verifier",
  note: "EN 1998-2:2005 : 3.3(7) impose le cumul quadratique de la réponse inertielle et des déplacements différentiels ; ce que 3.3(6) dispense de combiner, ce sont les deux ensembles A et B entre eux.",
};

export const COMPOSANTE_VERTICALE: Regle = {
  id: "composante_verticale_a_considerer",
  type: "regle",
  etape: "analyse",
  libelle: "Quand considérer la composante verticale",
  enonce:
    "Zones 2 et 3 : tabliers en béton précontraint (composante ascendante, à vide), appareils d'appui et attelages. Zones 4 et 5 : en plus, piles très fléchies sous les actions permanentes du tablier, ou pont à moins de 5 km d'une faille active.",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.7 ; 4.1.7(2)P pour le béton précontraint", page: "47" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 3 §4.4 ; ch. 4 §3.2", page: "53, 90" },
  ],
  statut: "via_guide",
};

export const COMBINAISONS: EntreeReferentiel[] = [
  COMBINAISON_100_30_30,
  COMBINAISON_SRSS,
  COMBINAISON_SISMIQUE,
  COMBINAISON_EQUIPEMENTS,
  LG,
  L_LIM,
  DEPLACEMENTS_DIFFERENTIELS,
  COMBINAISON_VARIABILITE,
  COMPOSANTE_VERTICALE,
];
