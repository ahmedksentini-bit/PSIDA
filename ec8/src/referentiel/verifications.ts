// Vérifications de résistance (piles, culées, fondations) et dispositions
// constructives, pour une conception élastique ou à ductilité limitée (q ≤ 1,5).

import type { EntreeReferentiel, Formule, ParametreScalaire, ParametreTable, Regle } from "./types.ts";

// --- Coefficients -----------------------------------------------------------

export const GAMMA_M_SISMIQUE: ParametreTable<{ beton: number; armatures_acier: number; elastomere: number }> = {
  id: "gamma_M_sismique",
  type: "table",
  etape: "verif_piles",
  libelle: "Coefficients partiels des matériaux en situation sismique",
  symbole: "\\gamma_M",
  unite: "-",
  cles: ["matériau"],
  valeurs: { beton: 1.3, armatures_acier: 1.0, elastomere: 1.0 },
  references: [
    { source: "NF_EN_1998_1_NA", localisation: "5.2.4(3) note 2", page: "8" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §1", page: "170" },
  ],
  statut: "via_guide",
  note: "La clause de l'AN de l'EN 1998-1 vise les bâtiments en béton ; le guide l'étend aux ponts. γm = 1,00 pour l'élastomère : AN de l'EN 1998-2, 7.6.2(5).",
};

export const GAMMA_BD1: ParametreScalaire = {
  id: "gamma_Bd1",
  type: "scalaire",
  etape: "verif_piles",
  libelle: "Coefficient de sécurité supplémentaire contre la rupture fragile par effort tranchant (béton)",
  symbole: "\\gamma_{Bd1}",
  unite: "-",
  valeur: 1.25,
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "5.6.2(2)P b)", page: "8" },
    { source: "NF_EN_1998_2", localisation: "5.6.2(2)P", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §1", page: "170" },
  ],
  statut: "via_guide",
  note: "L'AN retient la valeur recommandée ; valeur numérique reprise du guide.",
};

export const GAMMA_0: Formule = {
  id: "gamma_0",
  type: "formule",
  etape: "verif_piles",
  libelle: "Coefficient de sur-résistance pour le dimensionnement en capacité",
  latex:
    "\\gamma_0 = 1{,}35\\ \\text{(béton)}, \\quad \\gamma_0 = 1{,}25\\ \\text{(acier)}; \\qquad \\eta_k > 0{,}1 : \\ \\gamma_0 \\times \\left[1 + 2\\,(\\eta_k - 0{,}1)^2\\right]",
  variables: [{ symbole: "\\eta_k", description: "effort normal réduit de la rotule en béton armé", unite: "-" }],
  conditions: ["Ne s'applique ni aux zones de rotules potentielles ni aux seuils des dispositifs élasto-plastiques, frottants ou fusibles."],
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "5.3(4)", page: "7" },
    { source: "NF_EN_1998_2", localisation: "5.3 et 5.3(4)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §2.3", page: "172-173" },
  ],
  statut: "via_guide",
  note: "Utilisé en conception ductile (hors V1) et pour les composants dimensionnés en capacité.",
};

export const GAMMA_RD_DISPOSITIFS: ParametreScalaire = {
  id: "gamma_Rd_dispositifs",
  type: "scalaire",
  etape: "verif_piles",
  libelle: "Sur-résistance des attaches et de la structure liées aux dispositifs (appareils en élastomère compris)",
  symbole: "\\gamma_{Rd}",
  unite: "-",
  valeur: 1.1,
  references: [
    { source: "NF_EN_15129", localisation: "4.3.2", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §2.3", page: "174" },
  ],
  statut: "via_guide",
};

// --- Piles ------------------------------------------------------------------

export const FLEXION_PILE_DL: Formule = {
  id: "flexion_pile_ductilite_limitee",
  type: "formule",
  etape: "verif_piles",
  libelle: "Flexion des piles en conception élastique ou à ductilité limitée",
  latex: "M_{Ed} \\le M_{Rd}\\left(\\dfrac{f_{ck}}{1{,}3}\\,;\\ \\dfrac{f_{yk}}{1{,}0}\\right)",
  variables: [
    { symbole: "M_{Ed}", description: "moment de calcul en situation sismique", unite: "MN·m" },
    { symbole: "M_{Rd}", description: "moment résistant (EC2) avec les coefficients partiels sismiques", unite: "MN·m" },
  ],
  conditions: ["q ≤ 1,5. Pas de coefficient de surcapacité."],
  references: [
    { source: "NF_EN_1998_2", localisation: "5.6.2", etat: "a_confirmer" },
    { source: "NF_EN_1992", localisation: "flexion composée (EC2)", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §3.1", page: "174" },
  ],
  statut: "via_guide",
};

export const TRANCHANT_PILE_DL: Formule = {
  id: "tranchant_pile_ductilite_limitee",
  type: "formule",
  etape: "verif_piles",
  libelle: "Effort tranchant des piles en conception à ductilité limitée",
  latex: "q\\,V_{Ed} \\le \\dfrac{1}{\\gamma_{Bd1}}\\,V_{Rd}\\left(\\dfrac{f_{ck}}{1{,}3}\\,;\\ \\dfrac{f_{yk}}{1{,}0}\\right), \\qquad \\gamma_{Bd1} = 1{,}25",
  variables: [
    { symbole: "q\\,V_{Ed}", description: "effort tranchant dont seule la part sismique est multipliée par q", unite: "MN" },
    { symbole: "V_{Rd}", description: "résistance à l'effort tranchant (EC2) avec les coefficients partiels sismiques", unite: "MN" },
  ],
  conditions: ["q ≤ 1,5."],
  references: [
    { source: "NF_EN_1998_2", localisation: "5.6.2(2)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §3.2", page: "174, 180" },
  ],
  statut: "via_guide",
};

export const STRUCTURE_DISPOSITIFS: Formule = {
  id: "structure_liee_dispositifs",
  type: "formule",
  etape: "verif_piles",
  libelle: "Piles, tablier et fondations liés à des appareils en élastomère ou à des dispositifs",
  latex:
    "\\gamma_{Rd}\\,M_{Ed}(\\gamma_{IS}) \\le M_{Rd}\\left(\\dfrac{f_{ck}}{1{,}3}\\,;\\ \\dfrac{f_{yk}}{1{,}0}\\right), \\qquad \\gamma_{Rd}\\,V_{Ed}(\\gamma_{IS}) \\le \\dfrac{1}{\\gamma_{Bd1}}\\,V_{Rd}, \\qquad q = 1",
  variables: [
    { symbole: "\\gamma_{Rd}", description: "sur-résistance (1,1)", unite: "-" },
    { symbole: "M_{Ed}(\\gamma_{IS})", description: "moment issu des efforts des dispositifs majorés par γIS", unite: "MN·m" },
  ],
  references: [
    { source: "NF_EN_15129", localisation: "4.3.2", etat: "citee_par_guide" },
    { source: "NF_EN_1998_2", localisation: "7.5.2.4", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §3.1, §3.2 et §3.4", page: "180-181, 184" },
  ],
  statut: "via_guide",
  note: "Cas courant des ponts sur appareils en élastomère fretté.",
};

export const MOMENT_SECTION_CIRCULAIRE: Formule = {
  id: "moment_section_circulaire",
  type: "formule",
  etape: "verif_piles",
  libelle: "Moment de calcul d'une pile circulaire (directions combinées)",
  latex: "M_{Ed} = \\sqrt{M_{Ed,long}^2 + (0{,}3\\,M_{Ed,trans})^2}",
  variables: [{ symbole: "M_{Ed,long},\\,M_{Ed,trans}", description: "moments dus au séisme longitudinal et transversal", unite: "MN·m" }],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §3.1", page: "175" }],
  statut: "via_guide",
};

export const COMBINAISON_PILE: Formule = {
  id: "combinaison_efforts_pile",
  type: "formule",
  etape: "verif_piles",
  libelle: "Cumul des efforts transmis par le tablier et de l'inertie propre d'une pile",
  latex:
    "\\text{tablier non fixé : } \\sqrt{S(F_{hp})^2 + S(F_{ht})^2} + 0{,}3\\sqrt{S(F_{vp})^2 + S(F_{vt})^2} \\\\[6pt] \\text{tablier fixé : } \\left[S(F_{hp}) + S(F_{ht})\\right] + 0{,}3\\left[S(F_{vp}) + S(F_{vt})\\right]",
  variables: [
    { symbole: "F_{ht},\\,F_{vt}", description: "efforts horizontal et vertical transmis par le tablier", unite: "MN" },
    { symbole: "F_{hp},\\,F_{vp}", description: "efforts d'inertie propre de la pile", unite: "MN" },
  ],
  conditions: ["Tablier non fixé : appareils en élastomère ou glissants. Tablier fixé : appareils fixes ou encastrement."],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §4.2", page: "189" }],
  statut: "via_guide",
};

export const BIAIS_MODERE: Regle = {
  id: "biais_modere_flexion",
  type: "regle",
  etape: "verif_piles",
  libelle: "Ouvrages courants à biais modéré",
  enonce: "Biais > 78 grades (70°) et piles de forme simple : flexion composée vérifiée dans deux plans perpendiculaires ; sinon flexion composée déviée.",
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §3.2 ; ch. 5 §4.2", page: "90, 187" }],
  statut: "via_guide",
};

// --- Culées -----------------------------------------------------------------

export const KH_KV_CULEES: Formule = {
  id: "kh_kv_culees",
  type: "formule",
  etape: "verif_culees",
  libelle: "Coefficients sismiques des culées et des terres",
  latex: "k_h = \\dfrac{a_g}{g}\\,\\dfrac{S\\,S_T}{r}, \\qquad k_v = \\pm 0{,}5\\,k_h",
  variables: [{ symbole: "r", description: "coefficient lié au déplacement admissible (r = 1 recommandé pour les forces d'inertie)", unite: "-" }],
  conditions: [
    "r > 1 admis pour la poussée dynamique des culées à liaison souple si le déplacement est possible avant défaillance : réputé satisfait si le corps de culée est dimensionné pour 1,30·ΔEd (ΔEd = Ed − E0).",
  ],
  references: [
    { source: "NF_EN_1998_5", localisation: "7.3.2.2", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §4.3", page: "189-190" },
  ],
  statut: "via_guide",
};

export const STABILITE_EXTERNE_CULEE: Formule = {
  id: "stabilite_externe_culee",
  type: "formule",
  etape: "verif_culees",
  libelle: "Stabilité externe d'une culée : cumul des efforts",
  latex:
    "\\left[S(F_{hc}) + S(E_d) + S(F_{he}) + S(F_{ht})\\right] + 0{,}3\\left[S(F_{vc}) + S(F_{ve}) + S(F_{vt})\\right]",
  variables: [
    { symbole: "F_{hc},\\,F_{vc}", description: "inertie du corps de culée", unite: "MN" },
    { symbole: "E_d", description: "poussée dynamique des terres (Mononobe-Okabe)", unite: "MN" },
    { symbole: "F_{he},\\,F_{ve}", description: "inertie des terres sur la semelle", unite: "MN" },
    { symbole: "F_{ht},\\,F_{vt}", description: "efforts transmis par le tablier (cumulés en phase)", unite: "MN" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "6.7.2", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §4.3", page: "191" },
  ],
  statut: "via_guide",
};

export const MONONOBE_OKABE: Formule = {
  id: "mononobe_okabe",
  type: "formule",
  etape: "verif_culees",
  libelle: "Poussée dynamique des terres (Mononobe-Okabe), état actif",
  latex:
    "E_d = \\tfrac{1}{2}\\,\\gamma^*\\,(1 \\pm k_v)\\,K\\,H^2 + E_{ws} + E_{wd} \\\\[8pt] K_{ad} = \\dfrac{\\sin^2(\\psi + \\phi_d - \\theta)}{\\cos\\theta\\,\\sin^2\\psi\\,\\sin(\\psi - \\theta - \\delta_{ad})\\left[1 + \\sqrt{\\dfrac{\\sin(\\phi_d + \\delta_{ad})\\,\\sin(\\phi_d - \\beta - \\theta)}{\\sin(\\psi - \\theta - \\delta_{ad})\\,\\sin(\\psi + \\beta)}}\\right]^2}\\quad (\\beta \\le \\phi_d - \\theta) \\\\[8pt] \\tan\\theta = \\dfrac{k_h}{1 \\pm k_v}, \\qquad \\phi_d = \\arctan\\dfrac{\\tan\\phi}{1{,}25}",
  variables: [
    { symbole: "\\gamma^*", description: "poids volumique du sol (γ si la nappe est sous le mur)", unite: "kN/m³" },
    { symbole: "\\psi", description: "inclinaison du parement côté terres sur l'horizontale", unite: "°" },
    { symbole: "\\beta", description: "inclinaison du talus", unite: "°" },
    { symbole: "\\delta_{ad}", description: "frottement sol-mur de calcul (pris nul en pratique)", unite: "°" },
    { symbole: "E_{ws},\\,E_{wd}", description: "poussées statique et hydrodynamique de l'eau", unite: "kN/m" },
  ],
  conditions: [
    "Remblais sans cohésion. Sur-poussée dynamique appliquée à mi-hauteur.",
    "β > φd − θ : Kad = sin²(ψ + φd − θ) / [cos θ · sin²ψ · sin(ψ − θ − δad)].",
    "Nappe au-dessus de la base : γ* et tan θ selon le tableau 24 du guide.",
  ],
  references: [
    { source: "NF_EN_1998_5", localisation: "annexe E", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.7, tableaux 23 et 24", page: "132-134" },
  ],
  statut: "via_guide",
  note: "Coefficient r : 1 pour les culées de ponts (tableau 23 du guide).",
};

// --- Fondations -------------------------------------------------------------

export const FONDATIONS_EFFETS: Regle = {
  id: "fondations_effets_actions",
  type: "regle",
  etape: "verif_fondations",
  libelle: "Effets des actions sur les fondations",
  enonce:
    "Conception à ductilité limitée (q ≤ 1,5) : efforts sismiques multipliés par q, soit q·MEd ≤ MRd(fck/1,3 ; fyk/1,0). Conception dissipative : effets de capacité avec sur-résistance, plafonnés aux effets élastiques (q = 1). Vérification préalable de la liquéfaction ; vérifications géotechniques selon l'EC7.",
  references: [
    { source: "NF_EN_1998_2", localisation: "5.8.1(1)P, 5.8.2(2)P et 5.3(2)", etat: "citee_par_guide" },
    { source: "NF_EN_1998_5", localisation: "5.3", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 5 §3.1 et §4.4", page: "174, 191" },
  ],
  statut: "via_guide",
};

// --- Dispositions constructives (ductilité limitée) ---------------------------

export const ZONES_CRITIQUES: Regle = {
  id: "zones_critiques_ductilite_limitee",
  type: "regle",
  etape: "dispositions_constructives",
  libelle: "Zones critiques en ductilité limitée",
  enonce:
    "Zone critique là où MRd < 1,3·MEd (MRd ≥ MEd restant imposé) : confinement et anti-flambement requis. Au-delà de 1,3·MEd, aucune disposition particulière.",
  references: [
    { source: "NF_EN_1998_2", localisation: "6.5", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 6 §4.1", page: "220" },
  ],
  statut: "via_guide",
};

export const CONFINEMENT_CONDITIONS: Regle = {
  id: "confinement_conditions",
  type: "regle",
  etape: "dispositions_constructives",
  libelle: "Confinement requis selon l'effort normal réduit",
  enonce:
    "ηk ≤ 0,08 : aucun confinement imposé. ηk > 0,08 : confinement si la ductilité en courbure admissible est inférieure à 7 (dispense si elle dépasse 7 avec εcu < 3,5 ‰, ou 2 ‰ pour les sections creuses). Piles creuses avec ηk < 0,20 : confinement non requis si l'anti-flambement est vérifié.",
  references: [
    { source: "NF_EN_1998_2", localisation: "6.2.1.1(2)P et 6.2.4", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 6 §4.3", page: "220-221" },
  ],
  statut: "via_guide",
};

export const OMEGA_WD: Formule = {
  id: "omega_wd",
  type: "formule",
  etape: "dispositions_constructives",
  libelle: "Rapport mécanique d'armatures de confinement",
  latex:
    "\\omega_{wd} = \\rho_w\\,\\dfrac{f_{yd}}{f_{cd}}, \\qquad \\rho_w = \\dfrac{A_{sw}}{s_L\\,b}\\ \\text{(rectangulaire)}, \\qquad \\rho_w = \\dfrac{4\\,A_{sp}}{D_{sp}\\,s_L}\\ \\text{(circulaire)}",
  variables: [
    { symbole: "A_{sw}", description: "section totale des cadres et épingles dans la direction considérée", unite: "m²" },
    { symbole: "s_L", description: "espacement longitudinal des armatures transversales", unite: "m" },
    { symbole: "b", description: "dimension du noyau perpendiculaire à la direction considérée", unite: "m" },
    { symbole: "A_{sp},\\,D_{sp}", description: "section d'une cerce et diamètre de la cerce", unite: "m², m" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "éq. (6.3)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 6 §4.3", page: "221" },
  ],
  statut: "via_guide",
};

export const OMEGA_W_REQ: Formule = {
  id: "omega_w_req",
  type: "formule",
  etape: "dispositions_constructives",
  libelle: "Confinement requis et confinement minimal",
  latex:
    "\\omega_{w,req} = \\dfrac{A_c}{A_{cc}}\\,\\lambda\\,\\eta_k + 0{,}13\\,\\dfrac{f_{yd}}{f_{cd}}\\,(\\rho_L - 0{,}01) \\\\[6pt] \\text{rectangulaire : } \\omega_{wd,r} \\ge \\max\\left(\\omega_{w,req}\\,;\\ \\tfrac{2}{3}\\,\\omega_{w,min}\\right), \\qquad \\text{circulaire : } \\omega_{wd,c} \\ge \\max\\left(1{,}4\\,\\omega_{w,req}\\,;\\ \\omega_{w,min}\\right)",
  variables: [
    { symbole: "A_{cc}", description: "aire du noyau de béton confiné", unite: "m²" },
    { symbole: "\\rho_L", description: "pourcentage d'armatures longitudinales", unite: "-" },
    { symbole: "\\lambda,\\,\\omega_{w,min}", description: "0,28 et 0,12 en ductilité limitée ; 0,37 et 0,18 en conception ductile", unite: "-" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "éq. (6.6), (6.7), (6.8) et tableau 6.1", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 6 §4.3 et §6", page: "221-222, 231" },
  ],
  statut: "via_guide",
};

export const ANTI_FLAMBEMENT: Formule = {
  id: "anti_flambement",
  type: "formule",
  etape: "dispositions_constructives",
  libelle: "Armatures transversales anti-flambement en zone critique",
  latex:
    "A_T \\ge \\dfrac{\\sum A_L\\,f_{ys}}{1{,}6\\,f_{yt}}\\,s_T, \\qquad s_L \\le \\delta\\,d_{bL}, \\quad 5 \\le \\delta = 2{,}5\\,\\dfrac{f_{tk}}{f_{yk}} + 2{,}25 \\le 6",
  variables: [
    { symbole: "\\sum A_L", description: "section des barres longitudinales tenues par l'armature transversale", unite: "m²" },
    { symbole: "s_T", description: "espacement transversal des brins", unite: "m" },
    { symbole: "d_{bL}", description: "diamètre des barres longitudinales", unite: "m" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "éq. (6.9) et (6.10)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 6 §4.4", page: "222" },
  ],
  statut: "via_guide",
  note: "Le guide cite aussi « 6.5.4.1P » pour l'expression (6.10) : numéro à confirmer.",
};

export const DISPOSITIONS_PILES_DL: Regle = {
  id: "dispositions_piles_ductilite_limitee",
  type: "regle",
  etape: "dispositions_constructives",
  libelle: "Piles en ductilité limitée : dispositions des zones critiques",
  enonce:
    "Armatures longitudinales : φ ≥ 10 mm, classe B, espacement ≤ 200 mm, recouvrements évités ou alternés. Armatures transversales : VRd > q·γBd1·VEd, φ ≥ 10 mm, classe B, sL ≤ δ·dbL, sT ≤ 200 mm. Pieux : q ≥ 1,3 évite en général les zones critiques.",
  references: [
    { source: "NF_EN_1998_2", localisation: "6.2.3(3)P (recouvrements)", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 6 §4 et §6", page: "220, 231" },
  ],
  statut: "via_guide",
};

export const VERIFICATIONS: EntreeReferentiel[] = [
  GAMMA_M_SISMIQUE,
  GAMMA_BD1,
  GAMMA_0,
  GAMMA_RD_DISPOSITIFS,
  FLEXION_PILE_DL,
  TRANCHANT_PILE_DL,
  STRUCTURE_DISPOSITIFS,
  MOMENT_SECTION_CIRCULAIRE,
  COMBINAISON_PILE,
  BIAIS_MODERE,
  KH_KV_CULEES,
  STABILITE_EXTERNE_CULEE,
  MONONOBE_OKABE,
  FONDATIONS_EFFETS,
  ZONES_CRITIQUES,
  CONFINEMENT_CONDITIONS,
  OMEGA_WD,
  OMEGA_W_REQ,
  ANTI_FLAMBEMENT,
  DISPOSITIONS_PILES_DL,
];
