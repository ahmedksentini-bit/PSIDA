// Déplacements de calcul, appareils d'appui, repos d'appui, butées et joints.

import type { EntreeReferentiel, Formule, ParametreScalaire, ParametreTable, Regle } from "./types.ts";

// --- Déplacements -----------------------------------------------------------

export const D_ED_APPUIS: Formule = {
  id: "dEd_appuis",
  type: "formule",
  etape: "deplacements",
  libelle: "Déplacement total de calcul des organes d'appui",
  latex: "d_{Ed} = \\gamma_{IS}\\,d_E + d_G + \\psi_2\\,d_T + d_{diff}, \\qquad \\psi_2 = 0{,}5",
  variables: [
    { symbole: "d_E", description: "déplacement sismique de calcul (η·μd·dEe, ou dEe si q = 1)", unite: "m" },
    { symbole: "\\gamma_{IS}", description: "coefficient de fiabilité des dispositifs", unite: "-" },
    { symbole: "d_G", description: "déplacement dû aux actions permanentes et quasi permanentes", unite: "m" },
    { symbole: "d_T", description: "déplacement dû aux actions thermiques", unite: "m" },
    { symbole: "d_{diff}", description: "déplacement dû aux déformations différées (retrait, fluage)", unite: "m" },
  ],
  conditions: ["Combiner avec les signes les plus défavorables.", "Ajouter les effets du second ordre s'ils sont significatifs."],
  references: [
    { source: "NF_EN_1998_2", localisation: "6.6.2.2", etat: "citee_par_guide" },
    { source: "NF_EN_15129", localisation: "8.2.1.2.11(2)", etat: "citee_par_guide" },
    { source: "NF_EN_1990", localisation: "annexe A2, tableaux A2.1 à A2.3 (ψ2)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.1", page: "194" },
  ],
  statut: "via_guide",
};

export const BORNE_DEPLACEMENT_ELASTIQUE: Regle = {
  id: "borne_deplacement_elastique",
  type: "regle",
  etape: "deplacements",
  libelle: "Borne des déplacements obtenus avec q",
  enonce: "Les déplacements déduits d'un calcul avec q > 1 restent bornés par ceux du calcul élastique (q = 1).",
  references: [
    { source: "NF_EN_1998_1", localisation: "4.3.4", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §1 et §5.1", page: "170, 194" },
  ],
  statut: "via_guide",
};

export const DEPLACEMENTS_NON_CRITIQUES: ParametreTable<{ pE: number; pT: number }> = {
  id: "pE_pT",
  type: "table",
  etape: "deplacements",
  libelle: "Fractions des déplacements sismique et thermique pour les éléments non critiques (joints, murs en retour)",
  symbole: "p_E,\\ p_T",
  unite: "-",
  cles: ["fraction"],
  valeurs: { pE: 0.4, pT: 0.5 },
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "2.3.6.3(5)", page: "6" },
    { source: "NF_EN_1998_2", localisation: "2.3.6.3(5)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §6.1", page: "203" },
  ],
  statut: "via_guide",
  note: "L'AN retient les valeurs recommandées ; leurs valeurs numériques sont reprises du guide.",
};

// --- Appareils d'appui -------------------------------------------------------

export const GAMMA_IS: ParametreTable<{ cas_general: number; faible_action_ou_butees: number }> = {
  id: "gamma_IS",
  type: "table",
  etape: "verif_appareils_appui",
  libelle: "Coefficient de fiabilité des dispositifs (déplacements des systèmes d'isolation)",
  symbole: "\\gamma_{IS}",
  unite: "-",
  cles: ["cas"],
  valeurs: { cas_general: 1.5, faible_action_ou_butees: 1.0 },
  references: [
    { source: "NF_EN_15129", localisation: "8.2.1.2.11(2)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §1 et §5.4.4", page: "171, 194" },
  ],
  statut: "via_guide",
  note: "γIS = 1,0 pour un élastomère à faible amortissement sous faible action sismique, ou complété par des butées de sécurité. Les appareils en élastomère fretté classiques relèvent de cette famille.",
};

export const ELASTOMERE_CLASSEMENT: Regle = {
  id: "elastomere_classement",
  type: "regle",
  etape: "verif_appareils_appui",
  libelle: "Élastomères à faible amortissement et faible action sismique",
  enonce:
    "Faible amortissement : ξ ≤ 0,06 (sinon fort amortissement, justifié selon NF EN 15129 8.2.3.3). Faible action sismique : l'effet du séisme (déplacement ou effort) est inférieur à l'effet total des autres actions de la situation sismique. Élastomère à faible amortissement sous faible action sismique : justification NF EN 1337-3 complétée par NF EN 15129 8.2.1.2.11.",
  references: [
    { source: "NF_EN_15129", localisation: "8.2.1.1 et 8.2.3.1", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "195" },
  ],
  statut: "via_guide",
};

export const MODULE_G_ELASTOMERE: Formule = {
  id: "module_G_elastomere",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Module de cisaillement dynamique des élastomères à faible amortissement",
  latex: "G_b = 1{,}1\\,G_g = 1{,}1 \\times 0{,}9 = 1{,}0\\ \\text{MPa}",
  variables: [
    { symbole: "G_g", description: "module de cisaillement conventionnel (statique)", unite: "MPa" },
    { symbole: "G_b", description: "module de cisaillement dynamique nominal", unite: "MPa" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "7.5.2.4(5)", etat: "citee_par_guide" },
    { source: "NF_EN_1337_3", localisation: "4.3.1.1", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.4 ; ch. 5 §5.4", page: "111, 196" },
  ],
  statut: "via_guide",
  note: "Valeurs de calcul encadrées par les bornes inférieure (LBDP) et supérieure (UBDP) : voir le modèle.",
};

export const DISTORSION_TOTALE: Formule = {
  id: "elastomere_distorsion_totale",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Distorsion totale d'un appareil en élastomère sous séisme",
  latex: "\\varepsilon_{t,d} = K_L\\,(\\varepsilon_{c,E} + \\varepsilon_{q,max} + \\varepsilon_{\\alpha,d}) \\le \\dfrac{7}{\\gamma_m}, \\qquad \\gamma_m = 1{,}0",
  variables: [
    { symbole: "K_L", description: "facteur de type de chargement (1,0 usuellement)", unite: "-" },
    { symbole: "\\varepsilon_{c,E}", description: "distorsion due à la compression", unite: "-" },
    { symbole: "\\varepsilon_{q,max}", description: "distorsion due au déplacement horizontal", unite: "-" },
    { symbole: "\\varepsilon_{\\alpha,d}", description: "distorsion due à la rotation", unite: "-" },
  ],
  references: [
    { source: "NF_EN_15129", localisation: "8.2.3.4.2", etat: "citee_par_guide" },
    { source: "NF_EN_1337_3", localisation: "annexe C", etat: "citee_par_guide" },
    { source: "NF_EN_1998_2_NA", localisation: "7.6.2(5) : γm = 1,00", page: "9" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "196" },
  ],
  statut: "via_guide",
};

export const DISTORSION_COMPRESSION: Formule = {
  id: "elastomere_eps_c_E",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Distorsion due à la compression",
  latex: "\\varepsilon_{c,E} = \\dfrac{6\\,S\\,N_{Ed,max}}{A_r\\,E'_c}, \\qquad E'_c = 3\\,G\\,(1 + 2\\,S^2)",
  variables: [
    { symbole: "S", description: "coefficient de forme du feuillet le plus épais", unite: "-" },
    { symbole: "N_{Ed,max}", description: "effort normal maximal en situation sismique", unite: "MN" },
    { symbole: "A_r", description: "surface en plan réduite par le déplacement", unite: "m²" },
  ],
  conditions: ["E'c valable pour les appareils rectangulaires et circulaires (annulaires : voir NF EN 15129)."],
  references: [
    { source: "NF_EN_15129", localisation: "8.2.3.1", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "196" },
  ],
  statut: "via_guide",
};

export const DISTORSION_HORIZONTALE: Formule = {
  id: "elastomere_eps_q_max",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Distorsion due au déplacement horizontal",
  latex: "\\varepsilon_{q,max} = \\dfrac{d_{Ed}}{T_q}",
  variables: [
    { symbole: "d_{Ed}", description: "déplacement total de calcul (part sismique majorée par γIS)", unite: "m" },
    { symbole: "T_q", description: "épaisseur totale d'élastomère", unite: "m" },
  ],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "196" }],
  statut: "via_guide",
};

export const DISTORSION_ROTATION: Formule = {
  id: "elastomere_eps_alpha_d",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Distorsion due à la rotation",
  latex: "\\varepsilon_{\\alpha,d} = \\dfrac{(a'^2\\,\\alpha_{a,d} + b'^2\\,\\alpha_{b,d})\\,t_i}{2\\,\\sum t_i^3}",
  variables: [
    { symbole: "a',\\,b'", description: "dimensions effectives en plan", unite: "m" },
    { symbole: "\\alpha_{a,d},\\,\\alpha_{b,d}", description: "rotations de calcul (≥ 0,003 rad dans chaque direction)", unite: "rad" },
    { symbole: "t_i", description: "épaisseur d'un feuillet d'élastomère", unite: "m" },
  ],
  references: [
    { source: "NF_EN_1337_3", localisation: "5.3.3.4", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "196" },
  ],
  statut: "via_guide",
};

export const LIMITES_DISTORSION_HORIZONTALE: ParametreTable<{ service: number; ultime_NF_EN_15129: number; ultime_conseille: number }> = {
  id: "elastomere_limites_eps_q",
  type: "table",
  etape: "verif_appareils_appui",
  libelle: "Distorsion horizontale maximale",
  symbole: "\\varepsilon_{q,max}",
  unite: "-",
  cles: ["niveau de séisme"],
  valeurs: { service: 1.0, ultime_NF_EN_15129: 2.5, ultime_conseille: 2.0 },
  references: [
    { source: "NF_EN_15129", localisation: "8.2.3.4.1", etat: "citee_par_guide" },
    { source: "NF_EN_1998_2", localisation: "7.6.2(6)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "197" },
  ],
  statut: "via_guide",
  note: "Le guide conseille de se limiter à 2,0 (valeur de l'EN 1998-2) bien que la NF EN 15129 admette 2,5.",
};

export const FAIBLE_ACTION_DISTORSION: Formule = {
  id: "elastomere_faible_action",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Élastomère à faible amortissement sous faible action sismique",
  latex: "\\varepsilon_{q,d} = \\dfrac{d_{Ed}}{T_q} \\le 2{,}0 \\quad (d_{Ed}\\ \\text{sans}\\ \\gamma_{IS})",
  variables: [{ symbole: "d_{Ed}", description: "déplacement total de calcul, sans coefficient de fiabilité", unite: "m" }],
  conditions: ["Autres critères : ceux de la NF EN 1337-3 pour les actions non sismiques."],
  references: [
    { source: "NF_EN_15129", localisation: "8.2.1.1 et 8.2.1.2.11", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "198" },
  ],
  statut: "via_guide",
};

export const FLAMBEMENT_ELASTOMERE: Formule = {
  id: "elastomere_flambement",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Stabilité au flambement d'un appareil en élastomère",
  latex:
    "\\begin{cases} \\dfrac{d_{Ed}}{a'} \\le 0{,}7 & N_{Ed,max} < P_{cr}/4 \\\\[6pt] 1 - \\dfrac{2\\,N_{Ed,max}}{P_{cr}} \\ge 0{,}7\\,\\dfrac{d_{Ed}}{a'} & P_{cr}/4 \\le N_{Ed,max} < P_{cr}/2 \\end{cases} \\qquad P_{cr} = \\lambda\\,G\\,A_r\\,\\dfrac{a'\\,S}{T_q}",
  variables: [
    { symbole: "P_{cr}", description: "charge critique de flambement (S > 5)", unite: "MN" },
    { symbole: "\\lambda", description: "1,3 pour un appareil rectangulaire, 1,1 pour un appareil circulaire", unite: "-" },
  ],
  conditions: ["Dans tous les cas N_Ed,max < Pcr/2.", "Hors élastomères à noyau de plomb."],
  references: [
    { source: "NF_EN_15129", localisation: "8.2.3.4", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "197" },
  ],
  statut: "a_verifier",
  note: "La formule imprime S et A_R, le texte parle de S' et Ar : notation à confirmer.",
};

export const GLISSEMENT_ELASTOMERE: Formule = {
  id: "elastomere_glissement",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Non-glissement d'un appareil en élastomère",
  latex: "F_{xy,d} \\le \\left(0{,}1 + \\dfrac{K_f}{\\sigma_m}\\right) N_{Ed,min}, \\qquad \\sigma_m = \\dfrac{N_{Ed,min}}{A_r} \\ge 3{,}0\\ \\text{MPa}",
  variables: [
    { symbole: "F_{xy,d}", description: "effort horizontal résultant de calcul", unite: "MN" },
    { symbole: "N_{Ed,min}", description: "effort normal minimal (séisme vertical ascendant)", unite: "MN" },
    { symbole: "K_f", description: "coefficient de frottement (non chiffré par le guide)", unite: "MPa" },
  ],
  references: [
    { source: "NF_EN_1337_3", localisation: "5.3.3.6", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "197" },
  ],
  statut: "a_verifier",
  note: "Kf à reprendre de la NF EN 1337-3 (de mémoire 0,6 sur béton, 0,2 sur autres surfaces : à confirmer). La NF EN 15129 ne prévoit pas cette vérification.",
};

export const ANTI_SOULEVEMENT: ParametreTable<{ ductile: number; ductilite_limitee: number }> = {
  id: "anti_soulevement",
  type: "table",
  etape: "verif_appareils_appui",
  libelle: "Seuil de réaction sismique ascendante imposant des dispositifs anti-soulèvement (fraction de la réaction de compression permanente)",
  symbole: "R_{E,v} / R_G",
  unite: "-",
  cles: ["comportement"],
  valeurs: { ductile: 0.8, ductilite_limitee: 0.5 },
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "6.6.3.2(1)P", page: "8" },
    { source: "NF_EN_1998_2", localisation: "6.6.3.2", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.1", page: "195" },
  ],
  statut: "via_guide",
  note: "Aucun soulèvement d'un appareil individuel n'est admis en situation sismique de calcul.",
};

export const APPAREILS_FIXES: Regle = {
  id: "appareils_fixes",
  type: "regle",
  etape: "verif_appareils_appui",
  libelle: "Appareils d'appui fixes",
  enonce:
    "Dimensionner en capacité avec une sur-résistance d'au moins 1,3 (approche recommandée : F_C = f(1,3·M_Rd,pile) ≤ F_Rd, soit F_C = 1,3·F_Ed ≤ F_Rd en ductilité limitée), ou à défaut pour q·F_Ed ≤ F_Rd. Sans sur-résistance : attelages sismiques et remplacement aisé.",
  references: [
    { source: "NF_EN_1998_2", localisation: "6.5.2 et 6.6.2.1", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §3.2 et §5.2", page: "180, 185, 195" },
  ],
  statut: "via_guide",
};

// --- Repos d'appui, butées, joints ---------------------------------------------

export const LONGUEUR_APPUI_MINIMALE: Formule = {
  id: "lov_repos_appui",
  type: "formule",
  etape: "verif_repos_appui",
  libelle: "Longueur minimale de repos d'appui",
  latex:
    "l_{ov} = l_m + d_{eg} + d_{es}, \\qquad l_m \\ge 400\\ \\text{mm}, \\qquad d_{eg} = \\varepsilon_e\\,L_{eff} \\le 2\\,d_g, \\quad \\varepsilon_e = \\dfrac{2\\,d_g}{L_g}",
  variables: [
    { symbole: "l_m", description: "longueur d'appui transmettant la réaction verticale", unite: "m" },
    { symbole: "d_{eg}", description: "déplacement relatif dû à la variabilité spatiale du mouvement du sol", unite: "m" },
    { symbole: "d_{es}", description: "déplacement sismique du support : dEd, ou dEd + s pour des attelages avec jeu s", unite: "m" },
    { symbole: "L_{eff}", description: "distance du joint à la connexion rigide la plus proche (ou au centre d'un groupe de plus de deux piles)", unite: "m" },
  ],
  conditions: [
    "Pont à moins de 5 km d'une faille active de magnitude > 6,5 : doubler deg, sauf étude sismologique.",
    "Joint intermédiaire entre deux tronçons : lov = √(lov,1² + lov,2²).",
    "Appui sur pile intermédiaire : ajouter le déplacement sismique dE en tête de pile.",
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "6.6.4", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.5", page: "199" },
  ],
  statut: "via_guide",
  note: "Le guide note εe ce que l'EN 1998-2 note εg.",
};

export const BUTEES: Regle = {
  id: "butees",
  type: "regle",
  etape: "verif_repos_appui",
  libelle: "Butées de sécurité et de blocage",
  enonce:
    "Avec des appareils en élastomère : butées de blocage transversales aux culées (jeu de 1 à 2 cm) et butées de sécurité si la portée dépasse 40 m. Jeu d'une butée de sécurité : d = dG + 0,5·dTh + ddiff + dE. Efforts des butées de sécurité : 75 % de l'effort sismique, ou raideur sécante dont l'énergie vaut 1,5 fois celle au déplacement dEd. Butées de blocage : jeu ≤ 15 mm, dimensionnées en capacité.",
  references: [
    { source: "NF_EN_1998_2", localisation: "6.6.1 (inspiration de l'approche énergétique)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.6", page: "200-202" },
  ],
  statut: "via_guide",
};

export const ATTELAGES: Formule = {
  id: "attelages_travees_independantes",
  type: "formule",
  etape: "verif_repos_appui",
  libelle: "Effort forfaitaire des attelages entre travées indépendantes",
  latex: "F = 1{,}5\\,a_g\\,S\\,S_T\\,M_d",
  variables: [{ symbole: "M_d", description: "masse de la travée attelée (G non pondéré)", unite: "t" }],
  conditions: ["En capacité s'ils reprennent tout l'effort sismique."],
  references: [
    { source: "NF_EN_1998_2", localisation: "6.6.3.1", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.7", page: "202" },
  ],
  statut: "via_guide",
};

export const JOINTS_CHAUSSEE: Regle = {
  id: "joints_chaussee",
  type: "regle",
  etape: "verif_repos_appui",
  libelle: "Joints de chaussée selon la catégorie d'importance",
  enonce:
    "Catégorie II : le séisme peut être ignoré pour les joints, sans endommager l'about ni la culée. Catégorie III : si |dE| ≤ 2 cm, joints dimensionnés au séisme ultime ; sinon souffle total = souffle de service + 0,4 × souffle sismique (0,2 si une sur-ouverture n'entraîne que des dégâts légers), avec souffle de service = déformations différées + 0,5 × thermique. Catégorie IV : règles de la catégorie III, avec option de joints intacts sous séisme ultime.",
  references: [
    { source: "NF_EN_1998_2", localisation: "2.3.6.3(5) (pE = 0,4)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §6.1", page: "203-204" },
  ],
  statut: "via_guide",
};

export const KL: ParametreScalaire = {
  id: "rotation_minimale_elastomere",
  type: "scalaire",
  etape: "verif_appareils_appui",
  libelle: "Rotation de calcul minimale d'un appareil en élastomère, dans chaque direction",
  symbole: "\\alpha_{min}",
  unite: "rad",
  valeur: 0.003,
  references: [
    { source: "NF_EN_1337_3", localisation: "5.3.3.4", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §5.4", page: "196" },
  ],
  statut: "via_guide",
};


export const COEF_FORME: Formule = {
  id: "elastomere_coef_forme",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Coefficient de forme et aire réduite d'un appareil en élastomère",
  latex: "S = \\dfrac{a'\\,b'}{2\\,t_i\\,(a' + b')}, \\qquad A_r = A'\\left(1 - \\dfrac{v_x}{a'} - \\dfrac{v_y}{b'}\\right)",
  variables: [
    { symbole: "a',\\,b'", description: "dimensions en plan des frettes (a − 2c, b − 2c)", unite: "m" },
    { symbole: "A'", description: "aire des frettes a'·b'", unite: "m²" },
    { symbole: "v_x,\\,v_y", description: "déplacements dus à la température et aux actions différées", unite: "m" },
  ],
  references: [
    { source: "NF_EN_15129", localisation: "8.2.3.3.2", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "annexe 1 §4.2", page: "256" },
  ],
  statut: "via_guide",
};

export const DEPLACEMENTS_SERVICE: Formule = {
  id: "deplacements_service",
  type: "formule",
  etape: "deplacements",
  libelle: "Déplacements de service d'un appui (température, retrait et fluage)",
  latex: "d_T = \\alpha\\,\\Delta T\\,|x - x_0|, \\qquad d_{diff} = \\varepsilon_{diff}\\,|x - x_0|",
  variables: [
    { symbole: "x_0", description: "point fixe : centre des raideurs longitudinales", unite: "m" },
    { symbole: "\\Delta T", description: "variation de température pour les appareils d'appui (EN 1991-1-5, supplément compris)", unite: "°C" },
    { symbole: "\\varepsilon_{diff}", description: "raccourcissement relatif dû au retrait et au fluage", unite: "-" },
  ],
  references: [
    { source: "NF_EN_1990", localisation: "EN 1991-1-5, 6.1.3.3 (supplément pour appareils d'appui)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "annexe 1 §1.4 et §4.1", page: "243, 256" },
  ],
  statut: "via_guide",
  note: "Exemple du guide : ΔT = 42 °C (contraction 32 °C + supplément de 10 °C), εdiff = 4,9·10⁻⁴.",
};

export const GLISSEMENT_EFFORT: Formule = {
  id: "elastomere_effort_glissement",
  type: "formule",
  etape: "verif_appareils_appui",
  libelle: "Effort horizontal de calcul d'un appareil pour la vérification au glissement",
  latex: "F_{xy,Ed} = \\gamma_{IS}\\,d_{bd}\\,k_{h,dyn} + (0{,}5\\,v_{T} + v_{diff})\\,k_{h,stat}, \\qquad k_{h,stat} = \\dfrac{A\\,G_g}{T_q}",
  variables: [
    { symbole: "d_{bd}", description: "distorsion sismique de l'appareil (LBDP)", unite: "m" },
    { symbole: "k_{h,dyn}", description: "raideur dynamique d'un appareil (LBDP)", unite: "MN/m" },
    { symbole: "N_{Ed,min}", description: "effort normal minimal par appareil (séisme vertical ascendant, 0,3 Rv)", unite: "MN" },
  ],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "annexe 1 §4.2", page: "258" }],
  statut: "via_guide",
};

export const REACTIONS_PERMANENTES: Regle = {
  id: "reactions_permanentes",
  type: "regle",
  etape: "verif_appareils_appui",
  libelle: "Réactions et rotations permanentes des appuis",
  enonce:
    "À reprendre d'un calcul de service (ELS quasi permanent : G + effets différés ± 0,5 T), comme le fait le guide avec CHAMOA-P. À défaut, le moteur estime les réactions par une poutre continue sous la charge permanente uniforme (théorème des trois moments) ; la rotation est alors prise nulle, la rotation minimale de 0,003 rad restant ajoutée.",
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "annexe 1 §1.4.4 et §4.1", page: "244, 256" }],
  statut: "via_guide",
};

export const SOUFFLE_JOINT: Formule = {
  id: "souffle_joint",
  type: "formule",
  etape: "verif_repos_appui",
  libelle: "Souffle sismique total d'un joint de chaussée",
  latex: "d_{Ed} = d_E + d_G + 0{,}5\\,d_T, \\qquad \\text{souffle} = 2\\,d_E + 2\\,d_T + d_G",
  variables: [
    { symbole: "d_E", description: "déplacement sismique de calcul du tablier", unite: "m" },
    { symbole: "d_G", description: "déplacement différé (retrait et fluage)", unite: "m" },
    { symbole: "d_T", description: "déplacement thermique", unite: "m" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "2.3.6.3", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "annexe 1 §8", page: "275" },
  ],
  statut: "via_guide",
};

export const APPUIS: EntreeReferentiel[] = [
  COEF_FORME,
  DEPLACEMENTS_SERVICE,
  GLISSEMENT_EFFORT,
  REACTIONS_PERMANENTES,
  SOUFFLE_JOINT,
  D_ED_APPUIS,
  BORNE_DEPLACEMENT_ELASTIQUE,
  DEPLACEMENTS_NON_CRITIQUES,
  GAMMA_IS,
  ELASTOMERE_CLASSEMENT,
  MODULE_G_ELASTOMERE,
  DISTORSION_TOTALE,
  DISTORSION_COMPRESSION,
  DISTORSION_HORIZONTALE,
  DISTORSION_ROTATION,
  KL,
  LIMITES_DISTORSION_HORIZONTALE,
  FAIBLE_ACTION_DISTORSION,
  FLAMBEMENT_ELASTOMERE,
  GLISSEMENT_ELASTOMERE,
  ANTI_SOULEVEMENT,
  APPAREILS_FIXES,
  LONGUEUR_APPUI_MINIMALE,
  BUTEES,
  ATTELAGES,
  JOINTS_CHAUSSEE,
];
