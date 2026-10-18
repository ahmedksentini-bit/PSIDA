// Modèle de calcul (masses, raideurs, amortissement) et méthodes d'analyse
// monomodales des ponts courants.

import type { EntreeReferentiel, Formule, ParametreTable, Regle } from "./types.ts";

// --- Masses -----------------------------------------------------------------

export const MASSES: Regle = {
  id: "masses_sismiques",
  type: "regle",
  etape: "modele",
  libelle: "Masses à prendre en compte",
  enonce:
    "Masses permanentes avec leur valeur moyenne, mobilisées dans toutes les directions, augmentées de ψ2,1 fois les charges de trafic (pont chargé sur toute sa longueur, valeurs non pondérées). Tablier sur appareils glissants ou en élastomère : masse des piles traitée séparément (inertie propre). Tablier bloqué sur la pile : ajouter au tablier la moitié supérieure de la pile. Masses en kg ou t, efforts en N ou kN (g = 9,81 m/s²).",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.2", page: "42" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.2 et §5.5", page: "95, 127" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.1.2(1)P à (4)P (masses permanentes moyennes = caractéristiques, ψ2,1·Qk,1) ; la moitié supérieure des piles n'est ajoutée qu'en 4.2.2.3(2)P (tablier rigide). Le traitement séparé des piles sous appareils glissants ou en élastomère est du guide.",
};

// --- Raideurs ---------------------------------------------------------------

export const INERTIES_PILES: Regle = {
  id: "inerties_piles",
  type: "regle",
  etape: "modele",
  libelle: "Inertie des piles en béton armé à retenir",
  enonce:
    "Conception élastique (q = 1) ou à ductilité limitée (q ≤ 1,5) : inerties brutes non fissurées (inertie fissurée sécante également admise). Ponts sur appareils en élastomère fretté : inerties brutes en général. Conception ductile : inertie effective fissurée (annexe C).",
  references: [
    { source: "NF_EN_1998_2", localisation: "2.3.6.1 et annexe C", page: "31" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §1.5 et §4.3", page: "63, 96-99" },
  ],
  statut: "via_guide",
};

export const RAIDEUR_FUT: Formule = {
  id: "raideur_fut",
  type: "formule",
  etape: "modele",
  libelle: "Raideur horizontale d'un fût de pile",
  latex: "K = \\dfrac{3\\,E\\,I}{h^3}\\ \\ \\text{(console : encastré en pied, libre en rotation en tête)}, \\qquad K = \\dfrac{12\\,E\\,I}{h^3}\\ \\ \\text{(encastré en pied et en tête)}",
  variables: [
    { symbole: "E", description: "module d'élasticité du béton", unite: "MPa" },
    { symbole: "I", description: "inertie de flexion du fût dans la direction considérée", unite: "m⁴" },
    { symbole: "h", description: "hauteur du fût", unite: "m" },
  ],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.2", page: "97-98" }],
  statut: "via_guide",
  note: "Voile sollicité dans son plan : ajouter en série la raideur en cisaillement K = G·Sr / h.",
};

export const RAIDEUR_ELASTOMERE: Formule = {
  id: "raideur_elastomere",
  type: "formule",
  etape: "modele",
  libelle: "Raideur horizontale des appareils d'appui en élastomère fretté",
  latex: "K_b = n\\,\\dfrac{G_b\\,A_b}{T_e}",
  variables: [
    { symbole: "n", description: "nombre d'appareils sur la ligne d'appui", unite: "-" },
    { symbole: "G_b", description: "module de cisaillement dynamique", unite: "MPa" },
    { symbole: "A_b", description: "surface en plan d'un appareil (a × b)", unite: "m²" },
    { symbole: "T_e", description: "épaisseur totale d'élastomère d'un appareil", unite: "m" },
  ],
  conditions: ["Raideurs verticale et en rotation prises infinie et nulle dans le modèle simplifié."],
  references: [
    { source: "NF_EN_1998_2", localisation: "expression A_b·G_b/t_e", page: "92" },
    { source: "NF_EN_1337_3", localisation: "5.3.3.7, tableau 4", etat: "citee_par_guide" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.4, tableau 18", page: "110" },
  ],
  statut: "via_guide",
};

export const RAIDEUR_SERIE: Formule = {
  id: "raideur_ligne_appui",
  type: "formule",
  etape: "modele",
  libelle: "Raideur d'une ligne d'appui (éléments en série) et raideur totale (appuis en parallèle)",
  latex: "\\dfrac{1}{K_i} = \\sum_j \\dfrac{1}{K_{ij}} = \\dfrac{1}{K_{fondation}} + \\dfrac{1}{K_{fût}} + \\dfrac{1}{K_b}, \\qquad K = \\sum_i K_i",
  variables: [
    { symbole: "K_{ij}", description: "raideur de la partie j de l'appui i (fondation, fût, appareils)", unite: "MN/m" },
    { symbole: "K", description: "raideur totale de l'ouvrage dans la direction étudiée", unite: "MN/m" },
  ],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3", page: "96-98" }],
  statut: "via_guide",
};

export const RAIDEUR_TORSION_TABLIER: ParametreTable<{ profils_ouverts_et_dalles: number; caissons_precontraints: number; caissons_beton_arme: number }> = {
  id: "raideur_torsion_tablier",
  type: "table",
  etape: "modele",
  libelle: "Rigidité de torsion des tabliers en béton sous séisme (fraction de la rigidité brute)",
  symbole: "J_{eff} / J_{brut}",
  unite: "-",
  cles: ["type de tablier"],
  valeurs: { profils_ouverts_et_dalles: 0, caissons_precontraints: 0.5, caissons_beton_arme: 0.3 },
  references: [
    { source: "NF_EN_1998_2", localisation: "2.3.6.1", page: "31" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.1", page: "96" },
  ],
  statut: "via_guide",
};

export const INERTIE_EFFECTIVE: Formule = {
  id: "inertie_effective",
  type: "formule",
  etape: "modele",
  libelle: "Inertie effective des éléments ductiles en béton armé (conception ductile)",
  latex: "J_{eff} = 0{,}08\\,J_{un} + J_{cr}\\ \\ \\text{(méthode 1)}, \\qquad E_c\\,J_{eff} = 1{,}2\\,\\dfrac{M_{Rd}}{\\varphi_y}\\ \\ \\text{(méthode 2)}, \\qquad J_{cr} = \\dfrac{M_y}{E_c\\,\\varphi_y}",
  variables: [
    { symbole: "J_{un}", description: "inertie de la section brute non fissurée", unite: "m⁴" },
    { symbole: "J_{cr}", description: "inertie fissurée à la limite élastique", unite: "m⁴" },
    { symbole: "\\varphi_y", description: "courbure à la limite élastique", unite: "1/m" },
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "annexe C (informative) ; E.3.2(3)", page: "112" },
    { source: "NF_EN_1998_2_NA", localisation: "AN 4", page: "12" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.3", page: "100" },
  ],
  statut: "via_guide",
  note: "Méthode 1 limitée à la zone effectivement fissurée (AN). Hors V1 (conception ductile).",
};

export const BORNES_G: Regle = {
  id: "bornes_G_elastomere",
  type: "regle",
  etape: "modele",
  libelle: "Bornes du module G des élastomères : deux analyses",
  enonce:
    "Analyse avec les propriétés limites inférieures (LBDP : Gb,min = Gb) pour les déplacements maximaux, et supérieures (UBDP : Gb,max = 1,2·Gb si Tmin,b ≥ 0 °C, sinon valeur à Tmin,b) pour les efforts maximaux. Dispense de la fourchette si UBDP et LBDP modifient les déplacements de moins de ±15 %.",
  references: [
    { source: "NF_EN_1998_2", localisation: "7.5.2.4(3)P, (4) et (6) ; valeur 1,2 Gb : amendement A1", page: "96" },
    { source: "NF_EN_1998_2_NA", localisation: "J.1(2) : Tmin,b", page: "11" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.4", page: "111" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 7.5.2.4(3)P (analyses UBDP et LBDP), (4) (±15 %, propriétés nominales admises) et (6) sont présents ; mais l'édition 2005 donne Gb,max = 1,5·Gb pour Tmin,b ≥ 0 °C. La valeur 1,2·Gb, retenue par le guide, vient de l'amendement A1 (non consulté) : appliquer 1,5·Gb si le marché vise l'EN 2005 sans A1.",
};

// --- Amortissement ----------------------------------------------------------

export const AMORTISSEMENT_MATERIAUX: ParametreTable<Record<string, number>> = {
  id: "amortissement_materiaux",
  type: "table",
  etape: "modele",
  libelle: "Amortissement visqueux équivalent par matériau",
  symbole: "\\xi",
  unite: "-",
  cles: ["matériau"],
  valeurs: {
    "Acier soudé": 0.02,
    "Acier boulonné": 0.04,
    "Béton armé": 0.05,
    "Béton précontraint": 0.02,
    "Élastomère fretté à faible amortissement": 0.05,
  },
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.3", page: "43" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.4", page: "114" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.1.3(1) donne acier soudé 0,02, boulonné 0,04, BA 0,05, BP 0,02 ; l'élastomère à faible amortissement (0,05) est en 7.5.2.4(5) et 7.5.1(3).",
};

export const AMORTISSEMENT_GLOBAL: Formule = {
  id: "amortissement_global",
  type: "formule",
  etape: "modele",
  libelle: "Amortissement global au prorata des énergies de déformation",
  latex: "\\xi = \\dfrac{\\sum_k \\xi_k\\,E_k}{\\sum_k E_k}, \\qquad E_k = \\tfrac{1}{2}\\,V_k\\,d_k",
  variables: [
    { symbole: "\\xi_k", description: "amortissement de l'élément k", unite: "-" },
    { symbole: "E_k", description: "énergie de déformation de l'élément k", unite: "MJ" },
  ],
  conditions: [
    "Souplesse provenant entièrement d'élastomères à faible amortissement : ξ = 5 %.",
    "Simplification admise : retenir le taux le plus faible.",
  ],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.4", page: "103, 114" }],
  statut: "via_guide",
};

// --- Méthodes d'analyse -----------------------------------------------------

export const CONDITIONS_MONOMODAL: Regle = {
  id: "conditions_monomodal",
  type: "regle",
  etape: "analyse",
  libelle: "Domaine de la méthode du mode fondamental",
  enonce:
    "Masse modale du mode fondamental ≥ 90 % de la masse totale (ou ≥ 70 % en majorant les effets par M/ΣMi). Longitudinal : tablier continu à peu près rectiligne, masse des piles < 20 % de celle du tablier. Transversal : excentricité centre de raideur / centre de masse ≤ 5 % de la longueur. Biais : angle > 78 grades et raideurs à ±10 % du pont droit. Courbure : angle balayé < 25°. Exclus : arcs, béquilles, ponts à câbles, encorbellements.",
  references: [
    { source: "NF_EN_1998_2", localisation: "4.2.2.2(1) a) à c) ; 4.2.1.2(2)-(3) pour les masses modales", page: "51" },
    { source: "NF_EN_1998_2", localisation: "4.1.5(1)P (biais)", page: "44" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.3.1", page: "116-118" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.2.2.1 est la définition, le domaine d'application est en 4.2.2.2 (masse des piles < 20 % du tablier, eo ≤ 5 % L) ; les seuils de masse modale 90 % / 70 % sont en 4.2.1.2 (analyse multimodale). 4.1.5(1)P impose la torsion pour φ > 20° et pour B/L > 2,0, sans fixer de domaine de validité de la méthode. Angle balayé < 25°, exclusions (arcs, béquilles…) et raideurs à ±10 % du pont droit sont du guide.",
};

export const TABLIER_RIGIDE: Formule = {
  id: "tablier_rigide",
  type: "formule",
  etape: "analyse",
  libelle: "Méthode du mode fondamental, modèle à tablier rigide",
  latex:
    "K = \\sum_i K_i, \\qquad T = 2\\pi\\sqrt{\\dfrac{M}{K}}, \\qquad F = M\\,S_d(T), \\qquad F_i = \\dfrac{K_i}{K}\\,F, \\qquad d = \\dfrac{T^2}{4\\pi^2}\\,S_e(T)",
  variables: [
    { symbole: "M", description: "masse sismique du tablier (avec la part des piles le cas échéant)", unite: "kg" },
    { symbole: "K", description: "raideur totale des appuis dans la direction étudiée", unite: "N/m" },
    { symbole: "F_i", description: "effort repris par l'appui i", unite: "N" },
  ],
  conditions: [
    "Longitudinal : tablier continu.",
    "Transversal : tablier rigide si L/B ≤ 4 ou si l'écart de déplacement transversal Δd/da ≤ 0,20.",
    "Avec q = 1, Sd(T) = Se(T).",
  ],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.2.2.3(1) (4.11), (2)P (4.12)-(4.13), (3)", page: "51" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.3.2", page: "119-121" },
  ],
  statut: "via_guide",
};

export const CENTRE_RAIDEUR: Formule = {
  id: "centre_raideur",
  type: "formule",
  etape: "analyse",
  libelle: "Centre de raideur et excentricité",
  latex: "\\bar{x}_K = \\dfrac{\\sum_i x_i\\,K_i}{\\sum_i K_i}, \\qquad e_0 = \\left|\\bar{x}_K - \\bar{x}_M\\right|",
  variables: [
    { symbole: "x_i", description: "abscisse de l'appui i le long du tablier", unite: "m" },
    { symbole: "\\bar{x}_M", description: "abscisse du centre de masse", unite: "m" },
  ],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.3.1", page: "117" }],
  statut: "via_guide",
};

export const TORSION_EXCENTRICITE: Formule = {
  id: "torsion_excentricite",
  type: "formule",
  etape: "analyse",
  libelle: "Moment de torsion d'axe vertical",
  latex: "M_t = \\pm\\,e\\,F, \\qquad e = e_0 + e_a, \\qquad e_a = 0{,}05\\,L\\ \\ \\text{(séisme transversal)}\\ \\text{ou}\\ 0{,}05\\,B\\ \\ \\text{(longitudinal, guide)}",
  variables: [
    { symbole: "e_0", description: "excentricité entre centre de raideur et centre de masse", unite: "m" },
    { symbole: "e_a", description: "excentricité accidentelle", unite: "m" },
  ],
  conditions: ["Ponts biais (φ > 20°, soit un angle de biais < 78 grades) et ponts à B/L > 2,0 (EN 4.1.5(1)P) ; critère du guide pour le biais : angle < 78 grades et B/L > 0,5. Excentricité globale e = ea + ed = 0,08 fois la dimension perpendiculaire à l'excitation (4.1.5(3)P, (4.1))."],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.2.2.5 ; 4.1.5 (biais)", page: "53" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.3.4", page: "125" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.2.2.5(1) (4.16) ne traite que de la direction transversale : e = eo + 0,05·L ; le terme 0,05·B en longitudinal est du guide. 4.1.5(1)P vise deux familles distinctes, ponts biais (φ > 20°) et ponts larges (B/L > 2,0), et non leur cumul avec B/L > 0,5.",
};

export const RAYLEIGH: Formule = {
  id: "rayleigh",
  type: "formule",
  etape: "analyse",
  libelle: "Méthode du mode fondamental, tablier flexible (quotient de Rayleigh)",
  latex:
    "T = 2\\pi\\sqrt{\\dfrac{\\sum_i M_i\\,d_i^2}{g\\sum_i M_i\\,d_i}}, \\qquad F_i = \\dfrac{4\\pi^2}{g\\,T^2}\\,S_d(T)\\,d_i\\,M_i, \\qquad M_{ms} = \\dfrac{\\left(\\sum_i M_i\\,d_i\\right)^2}{\\sum_i M_i\\,d_i^2}",
  variables: [
    { symbole: "M_i", description: "masse du tronçon i (et demi-pile bloquée)", unite: "kg" },
    { symbole: "d_i", description: "déplacement du nœud i sous les forces g·Mi appliquées dans la direction étudiée", unite: "m" },
    { symbole: "M_{ms}", description: "masse modale sismique", unite: "kg" },
  ],
  conditions: ["Vérifier a posteriori Mms ≥ 0,9·Mtot (tablier et piles), ou Mms ≥ 0,7·Mtot en majorant les effets par Mtot/Mms."],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.2.2.4 (tel qu'imprimé)", page: "52" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.1 et §5.3.3", page: "93, 121-123" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.2.2.4 (tablier flexible) est bien le numéro exact, 4.2.2.3 étant le tablier rigide ; (4.14) et (4.15) conformes avec Sd(T). La vérification Mms ≥ 0,9 (ou 0,7)·Mtot reprend les seuils de 4.2.1.2. Le guide imprime Se(T), confondu avec Sd(T) pour q = 1.",
};

export const PILE_INDEPENDANTE: Formule = {
  id: "pile_independante",
  type: "formule",
  etape: "analyse",
  libelle: "Modèle de la pile indépendante",
  latex: "T_i = 2\\pi\\sqrt{\\dfrac{M_i}{K_i}}, \\qquad F_i = M_i\\,S_d(T_i)",
  variables: [{ symbole: "M_i", description: "masse affectée à la pile i", unite: "kg" }],
  conditions: ["Admis si 0,90 ≤ Ti/Ti+1 ≤ 1,10 pour toutes les piles adjacentes ; sinon redistribuer les masses."],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.2.2.6(1) (4.17)-(4.18), (2) (4.19)", page: "53" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.3.3", page: "123" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.2.2.6 limite ce modèle à la direction transversale et à une première approximation pour des analyses préliminaires ; bornes 0,90 et 1,10 incluses.",
};

export const PERIODE_PILE_CONSOLE: Formule = {
  id: "periode_pile_console",
  type: "formule",
  etape: "analyse",
  libelle: "Période propre d'une pile en console (tablier glissant ou sur élastomère)",
  latex: "T = 1{,}784\\sqrt{\\dfrac{\\rho\\,A\\,L^4}{E\\,I}}, \\qquad I_{éq} = \\dfrac{F\\,L^3}{3\\,E\\,d}",
  variables: [
    { symbole: "\\rho\\,A", description: "masse linéique de la pile", unite: "kg/m" },
    { symbole: "L", description: "hauteur de la pile", unite: "m" },
    { symbole: "I_{éq}", description: "inertie de la console équivalente (flèche d en tête sous F)", unite: "m⁴" },
  ],
  conditions: ["Liaison fixe tablier-pile : intégrer la moitié supérieure de la pile à la masse du tablier, sans calcul séparé."],
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.5", page: "127-128" }],
  statut: "via_guide",
};

export const SECOND_ORDRE: Formule = {
  id: "second_ordre_moment",
  type: "formule",
  etape: "analyse",
  libelle: "Moment additionnel du second ordre en tête d'appui",
  latex: "\\Delta M = \\dfrac{1 + q}{2}\\,d_{Ed}\\,N_{Ed}",
  variables: [
    { symbole: "d_{Ed}", description: "déplacement sismique de calcul", unite: "m" },
    { symbole: "N_{Ed}", description: "effort normal concomitant", unite: "MN" },
  ],
  conditions: ["À évaluer pour les piles hautes si ΔM dépasse 5 % du moment du premier ordre."],
  references: [
    { source: "NF_EN_1998_2", localisation: "5.4", page: "60" },
    { source: "NF_EN_1998_2_NA", localisation: "5.4(1)", page: "10" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.5", page: "129" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : (5.3) est la méthode recommandée en note de 5.4(1) (choix national) ; dEd = déplacement transversal relatif des extrémités de l'élément ductile. Le seuil de 5 % est du guide (l'EN parle d'effet défavorable significatif).",
};

export const REACTIONS_VERTICALES: Formule = {
  id: "reactions_verticales",
  type: "formule",
  etape: "analyse",
  libelle: "Réactions d'appui forfaitaires sous séisme vertical (ouvrage courant régulier)",
  latex: "R_i = \\pm\\,a\\,b\\,\\mu\\,L, \\qquad a = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
  variables: [
    { symbole: "a", description: "accélération du plateau du spectre vertical", unite: "m/s²" },
    { symbole: "b", description: "réaction normalisée (tableau 22 du guide, selon le nombre de travées et Ψ)", unite: "-" },
    { symbole: "\\mu", description: "masse linéique du tablier", unite: "kg/m" },
    { symbole: "L", description: "portée de la travée principale (travées de rive ΨL)", unite: "m" },
  ],
  conditions: ["Réactions vers le haut et vers le bas, cumulées aux charges permanentes et combinées au séisme horizontal."],
  references: [
    { source: "NF_EN_1998_2", localisation: "4.1.7(3)P (effets verticaux sur les appareils d'appui)", page: "47" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.3.5, tableau 22", page: "124" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : 4.1.7(3)P impose seulement de considérer les effets verticaux sur appareils et attelages, 4.1.7(4) admet le mode fondamental avec le modèle à tablier flexible ; la formule Ri = ±a·b·μ·L et ses coefficients sont du guide.",
};

type LigneB = { "Ψ = 0,5": number; "Ψ = 0,6": number; "Ψ = 0,7": number; "Ψ = 0,8": number; "Ψ = 0,9": number; "Ψ = 1,0": number };
const ligne = (v: [number, number, number, number, number, number]): LigneB => ({
  "Ψ = 0,5": v[0],
  "Ψ = 0,6": v[1],
  "Ψ = 0,7": v[2],
  "Ψ = 0,8": v[3],
  "Ψ = 0,9": v[4],
  "Ψ = 1,0": v[5],
});

export const TABLEAU_B_VERTICAL: ParametreTable<Record<string, Record<string, LigneB>>> = {
  id: "b_reactions_verticales",
  type: "table",
  etape: "analyse",
  libelle: "Réactions verticales normalisées b (une travée : b = 0,41)",
  symbole: "b",
  unite: "-",
  cles: ["nombre de travées", "réaction"],
  valeurs: {
    "2 travées": { R1: ligne([0.22, 0.24, 0.29, 0.33, 0.34, 0.31]), R2: ligne([0.57, 0.49, 0.52, 0.63, 0.78, 0.89]), R3: ligne([0.33, 0.31, 0.28, 0.25, 0.25, 0.31]) },
    "3 travées": { R1: ligne([0.22, 0.24, 0.26, 0.26, 0.24, 0.25]), R2: ligne([0.45, 0.48, 0.58, 0.69, 0.75, 0.75]) },
    "4 travées et plus": {
      "R1 (culée)": ligne([0.19, 0.25, 0.29, 0.27, 0.22, 0.24]),
      "R2 (1re pile)": ligne([0.38, 0.42, 0.57, 0.7, 0.69, 0.64]),
      "Ri (piles intermédiaires)": ligne([0.71, 0.62, 0.54, 0.64, 0.82, 0.9]),
    },
  },
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §5.3.5, tableau 22", page: "124" }],
  statut: "via_guide",
  note: "Ψ = rapport travée de rive / travée principale.",
};


// --- Matériaux et module des élastomères ----------------------------------------

export const ECM: Formule = {
  id: "Ecm",
  type: "formule",
  etape: "modele",
  libelle: "Module d'élasticité instantané du béton",
  latex: "E_{cm} = 22\\left(\\dfrac{f_{cm}}{10}\\right)^{0{,}3}\\ \\text{GPa}, \\qquad f_{cm} = f_{ck} + 8\\ \\text{MPa}",
  variables: [
    { symbole: "f_{ck}", description: "résistance caractéristique en compression", unite: "MPa" },
    { symbole: "f_{cm}", description: "résistance moyenne en compression", unite: "MPa" },
  ],
  references: [
    { source: "NF_EN_1992", localisation: "1-1, 3.1.3, tableau 3.1", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "annexe 1 §1.3.1", page: "242" },
  ],
  statut: "via_guide",
  note: "Le guide retient le module instantané pour les raideurs sous séisme (annexe 1 §2.2.3).",
};

export const TMIN_B: Formule = {
  id: "Tmin_b",
  type: "formule",
  etape: "modele",
  libelle: "Température minimale des appareils en situation sismique",
  latex: "T_{min,b} = T_0 - \\psi_2\\,(T_0 - T_{min}) + \\Delta T_1, \\qquad \\psi_2 = 0{,}5",
  variables: [
    { symbole: "T_0", description: "température d'origine (EN 1991-1-5 annexe A)", unite: "°C" },
    { symbole: "T_{min}", description: "température minimale de l'air sous abri (EN 1991-1-5 et AN, 6.1.3.2)", unite: "°C" },
    { symbole: "\\Delta T_1", description: "7,5 (béton), 5,0 (mixte), −2,5 (acier)", unite: "°C" },
  ],
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "J.1(2), tableau J.1 N", page: "11-12" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.4 ; annexe 1 §2.2.2", page: "111, 248" },
  ],
  statut: "verifie",
};

export const LAMBDA_U: Formule = {
  id: "lambda_U",
  type: "formule",
  etape: "modele",
  libelle: "Module des élastomères en propriétés limites supérieures (Tmin,b < 0 °C)",
  latex: "\\lambda_{U,fi} = 1 + (\\lambda_{max,fi} - 1)\\,\\psi_{fi}, \\qquad G_{b,max} = \\lambda_{U,f1}\\,\\lambda_{U,f2}\\,G_b",
  variables: [
    { symbole: "\\lambda_{max,f1}", description: "facteur de vieillissement (tableau JJ.1)", unite: "-" },
    { symbole: "\\lambda_{max,f2}", description: "facteur de température (tableau JJ.2)", unite: "-" },
    { symbole: "\\psi_{fi}", description: "coefficient de combinaison (0,70 pour un pont de catégorie III dans l'exemple)", unite: "-" },
  ],
  conditions: ["Tmin,b ≥ 0 °C : Gb,max = 1,2·Gb."],
  references: [
    { source: "NF_EN_1998_2", localisation: "7.5.2.4(6) (A1), annexe J, tableaux JJ.1 et JJ.2", page: "135" },
    { source: "NF_EN_1998_2_NA", localisation: "J.2(1) : coefficients λ recommandés", page: "12" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 §4.3.4 ; annexe 1 §2.2.2", page: "111, 249" },
  ],
  statut: "via_guide",
  note: "EN 1998-2:2005 : annexe J (J.4), (J.5) et tableau J.2, annexe JJ (tableaux JJ.1 : λmax = 1,1 ; JJ.2 : 1,0 / 1,3 / 1,4 / 1,5 à 20 / 0 / −10 / −30 °C) conformes. ψfi du tableau J.2 par classe d'importance de l'EN : III → 0,90, II → 0,70, I → 0,60 ; le 0,70 du guide correspond à la classe II de l'EN (correspondance avec les catégories françaises par l'AN). La règle Gb,max = 1,2·Gb diffère de l'EN 2005 (1,5·Gb) : elle vient de l'amendement A1, via le guide.",
};

export const CULEE_RIGIDE: Regle = {
  id: "culee_rigide",
  type: "regle",
  etape: "modele",
  libelle: "Raideur propre des culées",
  enonce:
    "Dans l'exemple du guide, la culée est supposée infiniment rigide en longitudinal (raideur de l'appui = raideur des appareils) ; en transversal, sa raideur est celle des poteaux encastrés en pied et en tête (12EI/h³ par poteau). Les fondations sont supposées infiniment rigides.",
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "annexe 1 §1.2.3, §2.2.3 et §2.3", page: "242, 249, 250" }],
  statut: "via_guide",
};

export const MODELE: EntreeReferentiel[] = [
  ECM,
  TMIN_B,
  LAMBDA_U,
  CULEE_RIGIDE,
  MASSES,
  INERTIES_PILES,
  RAIDEUR_FUT,
  RAIDEUR_ELASTOMERE,
  RAIDEUR_SERIE,
  RAIDEUR_TORSION_TABLIER,
  INERTIE_EFFECTIVE,
  BORNES_G,
  AMORTISSEMENT_MATERIAUX,
  AMORTISSEMENT_GLOBAL,
  CONDITIONS_MONOMODAL,
  TABLIER_RIGIDE,
  CENTRE_RAIDEUR,
  TORSION_EXCENTRICITE,
  RAYLEIGH,
  PILE_INDEPENDANTE,
  PERIODE_PILE_CONSOLE,
  SECOND_ORDRE,
  REACTIONS_VERTICALES,
  TABLEAU_B_VERTICAL,
];
