// Étape 3 : action sismique de calcul (arrêté du 26/10/2011, NF EN 1998-1 et -2).

import { derives } from "../projet/geometrie.ts";
import type { Projet } from "../projet/types.ts";
import { BETA, TE_TF } from "../referentiel/action.ts";
import { AGR, GAMMA_I, groupeDeZone, PARAMETRE_SOL_S, PERIODES_HORIZONTALES, SPECTRE_VERTICAL, type ZoneSoumise } from "../referentiel/nationaux.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";
import { valeur, type FormeSpectre } from "./spectres.ts";

export interface ActionSismique {
  soumis: boolean;
  /** Zone retenue pour le calcul (zone 1 traitée comme zone 2 à titre indicatif). */
  zoneCalcul: ZoneSoumise;
  gammaI: number;
  agr: number;
  ag: number;
  S: number;
  ST: number;
  TB: number;
  TC: number;
  TD: number;
  xi: number;
  eta: number;
  dg: number;
  TE: number;
  TF: number;
  avg: number;
  vertical: { TB: number; TC: number; TD: number; rapport: number };
  q: { longitudinal: number; transversal: number; vertical: number };
  beta: number;
  faibleSismicite: { applicable: boolean; motif: string };
  spectres: {
    elastiqueH: FormeSpectre;
    calculLong: FormeSpectre;
    calculTrans: FormeSpectre;
    elastiqueV: FormeSpectre;
  };
  plateaux: { Se: number; SdLong: number; SdTrans: number; Sve: number };
  note: SectionNote[];
}

export function actionSismique(p: Projet): ActionSismique {
  const { site, comportement } = p;
  const G = p.options.g;
  const soumis = site.zone !== 1 && site.categorie !== "I";
  const zoneCalcul: ZoneSoumise = site.zone === 1 ? 2 : site.zone;
  const categorie = site.categorie === "I" ? "II" : site.categorie;
  const groupe = groupeDeZone(zoneCalcul);

  const gammaI = GAMMA_I.valeurs[categorie];
  const agr = AGR.valeurs[zoneCalcul];
  const ag = gammaI * agr;
  const S = PARAMETRE_SOL_S.valeurs[groupe][site.classeSol];
  const { TB, TC, TD } = PERIODES_HORIZONTALES.valeurs[groupe][site.classeSol];
  const ST = site.ST;
  const xi = comportement.amortissement;
  const eta = Math.max(Math.sqrt(10 / (5 + xi)), 0.55);
  const dg = 0.025 * ag * S * ST * TC * TD;
  const { TE, TF } = TE_TF.valeurs[site.classeSol];
  const vertical = SPECTRE_VERTICAL.valeurs[groupe];
  const avg = vertical.rapport * ag;
  const q = { longitudinal: comportement.qLongitudinal, transversal: comportement.qTransversal, vertical: 1 };
  const beta = BETA.valeur;
  const plateauOrigine = comportement.plateauOrigine;

  const elastiqueH: FormeSpectre = { amplitude: ag * S * ST, TB, TC, TD, plateau: 2.5 * eta, depart: 1, plateauOrigine };
  const calcul = (qd: number): FormeSpectre => ({
    amplitude: ag * S * ST,
    TB,
    TC,
    TD,
    plateau: 2.5 / qd,
    depart: 2 / 3,
    plancher: beta * ag,
    plateauOrigine,
  });
  const elastiqueV: FormeSpectre = { amplitude: avg * ST, TB: vertical.TB, TC: vertical.TC, TD: vertical.TD, plateau: 3 * eta, depart: 1, plateauOrigine };
  const spectres = { elastiqueH, calculLong: calcul(q.longitudinal), calculTrans: calcul(q.transversal), elastiqueV };
  const plateaux = {
    Se: valeur(elastiqueH, TB),
    SdLong: valeur(spectres.calculLong, TB),
    SdTrans: valeur(spectres.calculTrans, TB),
    Sve: valeur(elastiqueV, vertical.TB),
  };

  // Méthode simplifiée des zones à sismicité faible (AN EC8-2, 2.3.7(1)).
  const d = derives(p);
  const surfaceBreche = d.longueur * p.tablier.largeur;
  const agSsurG = (ag * S) / G;
  const categoriePetite = site.categorie === "I" || site.categorie === "II";
  const faibleSismicite = categoriePetite && surfaceBreche < 150 && agSsurG <= 0.15
    ? {
        applicable: true,
        motif: `Catégorie ${site.categorie}, surface de brèche ${nombre(surfaceBreche, 0)} m² < 150 m² et ag·S = ${nombre(agSsurG, 3)} g ≤ 0,15 g : méthode statique équivalente admise avec une accélération uniforme ag·S.`,
      }
    : {
        applicable: false,
        motif: categoriePetite
          ? `${surfaceBreche >= 150 ? `Surface de brèche ${nombre(surfaceBreche, 0)} m² ≥ 150 m²` : ''}${surfaceBreche >= 150 && agSsurG > 0.15 ? ' et ' : ''}${agSsurG > 0.15 ? `ag·S = ${nombre(agSsurG, 3)} g > 0,15 g` : ''} : méthode simplifiée non admise (AN avril 2013 : conditions cumulatives).`
          : `Catégorie ${site.categorie} : méthode simplifiée réservée aux catégories I et II.`,
      };

  const lignesClassification: LigneNote[] = [
    {
      id: "soumission",
      titre: "Application des règles parasismiques",
      resultat: { symbole: `\\text{Zone ${site.zone}, catégorie ${site.categorie}}`, valeur: soumis ? "soumis" : "non soumis" },
      references: ["exemption", "champ_application"],
      commentaire: soumis
        ? "Pont nouveau définitif de catégorie II à IV en zone 2 à 5 : règles de l'article 4 applicables."
        : "Pont non soumis aux règles parasismiques ; le calcul est mené à titre indicatif avec les paramètres de la zone 2 et de la catégorie II.",
      niveau: soumis ? undefined : "alerte",
    },
    {
      id: "gamma_I",
      titre: "Coefficient d'importance",
      resultat: { symbole: "\\gamma_I", valeur: gammaI, decimales: 2 },
      references: ["gamma_I", "categories_importance"],
      commentaire: `Catégorie d'importance ${categorie}.`,
    },
  ];

  const lignesAcceleration: LigneNote[] = [
    {
      id: "agr",
      titre: "Accélération de référence au rocher",
      resultat: { symbole: "a_{gR}", valeur: agr, unite: "m/s²", decimales: 2 },
      references: ["agr"],
      commentaire: `Zone de sismicité ${zoneCalcul}.`,
    },
    {
      id: "ag",
      titre: "Accélération horizontale de calcul au rocher",
      formule: "a_g = \\gamma_I \\cdot a_{gR}",
      application: `${tex(gammaI, 2)} \\times ${tex(agr, 2)}`,
      resultat: { symbole: "a_g", valeur: ag, unite: "m/s²", decimales: 3 },
      references: ["ag"],
      commentaire: `Soit ${nombre(ag / G, 3)} g.`,
    },
    {
      id: "avg",
      titre: "Accélération verticale de calcul",
      formule: `a_{vg} = ${tex(vertical.rapport, 2)}\\,a_g`,
      application: `${tex(vertical.rapport, 2)} \\times ${tex(ag, 3)}`,
      resultat: { symbole: "a_{vg}", valeur: avg, unite: "m/s²", decimales: 3 },
      references: ["avg", "spectre_vertical"],
    },
  ];

  const lignesSite: LigneNote[] = [
    {
      id: "sol",
      titre: "Paramètres du spectre horizontal",
      resultat: { symbole: `\\text{sol } ${site.classeSol}`, valeur: `S = ${nombre(S, 2)} ; TB = ${nombre(TB, 2)} s ; TC = ${nombre(TC, 2)} s ; TD = ${nombre(TD, 2)} s` },
      references: ["S", "periodes_horizontales", "classes_sol"],
      commentaire: groupe === "zone_5" ? "Valeurs de la zone 5." : "Valeurs des zones 2 à 4.",
    },
    {
      id: "ST",
      titre: "Coefficient d'amplification topographique",
      resultat: { symbole: "S_T", valeur: ST, decimales: 2 },
      references: ["ST"],
    },
    {
      id: "faible_sismicite",
      titre: "Méthode simplifiée des zones à sismicité faible",
      formule: "\\dfrac{a_g\\,S}{g} \\le 0{,}15 \\ \\text{et}\\ L \\cdot B < 150\\ \\text{m}^2",
      application: `\\dfrac{${tex(ag, 3)} \\times ${tex(S, 2)}}{${tex(G, 2)}} = ${tex(agSsurG, 3)}, \\qquad ${tex(d.longueur, 2)} \\times ${tex(p.tablier.largeur, 2)} = ${tex(surfaceBreche, 0)}\\ \\text{m}^2`,
      resultat: { symbole: "\\text{méthode simplifiée}", valeur: faibleSismicite.applicable ? "admise" : "non admise" },
      references: ["faible_sismicite_methode_simplifiee"],
      commentaire: faibleSismicite.motif,
      niveau: "info",
    },
  ];

  const lignesAmortissement: LigneNote[] = [
    {
      id: "eta",
      titre: "Correction de l'amortissement",
      formule: "\\eta = \\sqrt{\\dfrac{10}{5 + \\xi}} \\ge 0{,}55",
      application: `\\sqrt{\\dfrac{10}{5 + ${tex(xi, 1)}}}`,
      resultat: { symbole: "\\eta", valeur: eta, decimales: 3 },
      references: ["eta", "amortissement_materiaux"],
      commentaire: `Amortissement retenu ξ = ${nombre(xi, 1)} %.`,
    },
  ];

  const commentairePlateau = plateauOrigine
    ? "Plateau prolongé jusqu'à T = 0, comme le recommande le guide Cerema."
    : "Forme de l'EN 1998-1 : branche croissante de 0 à TB.";

  const lignesHorizontal: LigneNote[] = [
    {
      id: "Se_plateau",
      titre: "Plateau du spectre élastique horizontal",
      formule: "S_e(T_B \\le T \\le T_C) = a_g\\,S\\,S_T \\cdot 2{,}5\\,\\eta",
      application: `${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times 2{,}5 \\times ${tex(eta, 3)}`,
      resultat: { symbole: "S_e", valeur: plateaux.Se, unite: "m/s²", decimales: 3 },
      references: ["Se", "plateau_origine"],
      commentaire: commentairePlateau,
    },
    {
      id: "Se_0",
      titre: "Valeur à période nulle",
      formule: plateauOrigine ? "S_e(0) = S_e(T_B)" : "S_e(0) = a_g\\,S\\,S_T",
      resultat: { symbole: "S_e(0)", valeur: valeur(elastiqueH, 0), unite: "m/s²", decimales: 3 },
      references: plateauOrigine ? ["plateau_origine"] : ["Se"],
    },
    {
      id: "dg",
      titre: "Déplacement de calcul du sol",
      formule: "d_g = 0{,}025\\,a_g\\,S\\,S_T\\,T_C\\,T_D",
      application: `0{,}025 \\times ${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times ${tex(TC, 2)} \\times ${tex(TD, 2)}`,
      resultat: { symbole: "d_g", valeur: dg, unite: "m", decimales: 4 },
      references: ["dg"],
    },
    {
      id: "SDe",
      titre: "Spectre élastique en déplacement",
      formule: "S_{De}(T) = S_e(T)\\left(\\dfrac{T}{2\\pi}\\right)^2 \\quad (T \\le 4\\ \\text{s})",
      resultat: { symbole: "T_E,\\ T_F", valeur: `${nombre(TE, 1)} s ; ${nombre(TF, 1)} s` },
      references: ["SDe", "TE_TF", "SDe_longues_periodes"],
      commentaire: "Au-delà de 4 s : annexe A de l'EN 1998-1 (informative).",
    },
  ];

  const ligneCalcul = (direction: "longitudinal" | "transversal", qd: number, plateau: number): LigneNote => ({
    id: `Sd_${direction}`,
    titre: `Plateau du spectre de calcul, direction ${direction}e`,
    formule: "S_d(T_B \\le T \\le T_C) = a_g\\,S\\,S_T\\,\\dfrac{2{,}5}{q}",
    application: `${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times \\dfrac{2{,}5}{${tex(qd, 2)}}`,
    resultat: { symbole: `S_{d,${direction === "longitudinal" ? "x" : "y"}}`, valeur: plateau, unite: "m/s²", decimales: 3 },
    references: ["Sd", "q_max", "plateau_origine"],
    commentaire:
      qd === 1
        ? "q = 1 : le spectre de calcul se confond avec le spectre élastique (η = 1)."
        : qd <= 1.5
          ? `q = ${nombre(qd, 2)} : conception à ductilité limitée.`
          : `q = ${nombre(qd, 2)} > 1,5 : conception ductile, hors du périmètre de la V1.`,
    niveau: qd > 1.5 ? "alerte" : undefined,
  });

  const lignesCalcul: LigneNote[] = [
    ligneCalcul("longitudinal", q.longitudinal, plateaux.SdLong),
    ligneCalcul("transversal", q.transversal, plateaux.SdTrans),
    {
      id: "plancher",
      titre: "Limite inférieure du spectre de calcul",
      formule: "S_d(T \\ge T_C) \\ge \\beta\\,a_g",
      application: `${tex(beta, 2)} \\times ${tex(ag, 3)}`,
      resultat: { symbole: "\\beta\\,a_g", valeur: beta * ag, unite: "m/s²", decimales: 3 },
      references: ["beta", "Sd"],
    },
  ];

  const lignesVertical: LigneNote[] = [
    {
      id: "vertical_parametres",
      titre: "Paramètres du spectre vertical",
      resultat: { symbole: "T_B,\\ T_C,\\ T_D", valeur: `${nombre(vertical.TB, 2)} s ; ${nombre(vertical.TC, 2)} s ; ${nombre(vertical.TD, 2)} s` },
      references: ["spectre_vertical", "sol_composante_verticale"],
      commentaire: "Indépendants de la classe de sol.",
    },
    {
      id: "q_vertical",
      titre: "Coefficient de comportement vertical",
      resultat: { symbole: "q_z", valeur: 1, decimales: 1 },
      references: ["q_vertical"],
    },
    {
      id: "Sve_plateau",
      titre: "Plateau du spectre élastique vertical",
      formule: "S_{ve}(T_B \\le T \\le T_C) = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
      application: `${tex(avg, 3)} \\times ${tex(ST, 2)} \\times 3{,}0 \\times ${tex(eta, 3)}`,
      resultat: { symbole: "S_{ve}", valeur: plateaux.Sve, unite: "m/s²", decimales: 3 },
      references: ["Sve", "plateau_origine"],
      commentaire: "À considérer au moins pour les appareils d'appui et les attelages ; pour les tabliers précontraints ; et, en zones 4 et 5, pour les piles sous conditions.",
    },
  ];

  const note: SectionNote[] = [
    { id: "classification", titre: "Classification", lignes: lignesClassification },
    { id: "accelerations", titre: "Accélérations de calcul", lignes: lignesAcceleration },
    { id: "site", titre: "Sol et site", lignes: lignesSite },
    { id: "amortissement", titre: "Amortissement", lignes: lignesAmortissement },
    { id: "horizontal", titre: "Spectre élastique horizontal", lignes: lignesHorizontal },
    { id: "calcul", titre: "Spectres de calcul", lignes: lignesCalcul },
    { id: "vertical", titre: "Spectre vertical", lignes: lignesVertical },
  ];

  return {
    soumis,
    zoneCalcul,
    gammaI,
    agr,
    ag,
    S,
    ST,
    TB,
    TC,
    TD,
    xi,
    eta,
    dg,
    TE,
    TF,
    avg,
    vertical,
    q,
    beta,
    faibleSismicite,
    spectres,
    plateaux,
    note,
  };
}
