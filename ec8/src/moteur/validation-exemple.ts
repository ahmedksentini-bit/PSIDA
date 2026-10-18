// Points de contrôle de l'exemple du pont dalle (guide Cerema 2015, annexe 1).
// Un résultat est conforme s'il arrondit à la valeur imprimée par le guide.

import { EXEMPLE_PONT_DALLE } from "../projet/exemple.ts";
import { actionSismique, type ActionSismique } from "./action.ts";
import { analyse, type Analyse } from "./analyse.ts";
import { modele, type Modele } from "./modele.ts";
import { verifierAppuis, type VerifAppuis } from "./verif-appuis.ts";
import { valeur } from "./spectres.ts";

export interface PointDeControle<R = ActionSismique> {
  id: string;
  libelle: string;
  symbole: string;
  unite: string;
  /** Valeur imprimée par le guide. */
  guide: number;
  /** Décimales imprimées par le guide. */
  decimales: number;
  /** Page du livre. */
  page: string;
  calcule: (r: R) => number;
  remarque?: string;
  /** Écart relatif admis quand le guide arrondit une valeur intermédiaire (la remarque l'explique). */
  toleranceRelative?: number;
}

export const CONTROLES_ACTION: PointDeControle<ActionSismique>[] = [
  { id: "ag", libelle: "Accélération de calcul", symbole: "a_g", unite: "m/s²", guide: 1.92, decimales: 2, page: "245", calcule: (a) => a.ag },
  { id: "avg", libelle: "Accélération verticale", symbole: "a_{vg}", unite: "m/s²", guide: 1.73, decimales: 2, page: "245", calcule: (a) => a.avg },
  { id: "S", libelle: "Paramètre de sol", symbole: "S", unite: "-", guide: 1.5, decimales: 2, page: "245", calcule: (a) => a.S },
  { id: "TB", libelle: "TB horizontal", symbole: "T_B", unite: "s", guide: 0.06, decimales: 2, page: "245", calcule: (a) => a.TB },
  { id: "TC", libelle: "TC horizontal", symbole: "T_C", unite: "s", guide: 0.4, decimales: 2, page: "245", calcule: (a) => a.TC },
  { id: "TD", libelle: "TD horizontal", symbole: "T_D", unite: "s", guide: 2.0, decimales: 1, page: "245", calcule: (a) => a.TD },
  { id: "TBv", libelle: "TB vertical", symbole: "T_{B,v}", unite: "s", guide: 0.03, decimales: 2, page: "245", calcule: (a) => a.vertical.TB },
  { id: "TCv", libelle: "TC vertical", symbole: "T_{C,v}", unite: "s", guide: 0.2, decimales: 2, page: "245", calcule: (a) => a.vertical.TC },
  { id: "TDv", libelle: "TD vertical", symbole: "T_{D,v}", unite: "s", guide: 2.5, decimales: 1, page: "245", calcule: (a) => a.vertical.TD },
  { id: "eta", libelle: "Correction d'amortissement (ξ = 5 %)", symbole: "\\eta", unite: "-", guide: 1, decimales: 0, page: "246", calcule: (a) => a.eta },
  {
    id: "Se",
    libelle: "Plateau du spectre horizontal, q = 1",
    symbole: "S_e",
    unite: "m/s²",
    guide: 7.2,
    decimales: 1,
    page: "246, 252",
    calcule: (a) => a.plateaux.SdLong,
  },
  {
    id: "SdTrans",
    libelle: "Plateau du spectre de calcul transversal, q = 1,5",
    symbole: "S_{d,y}",
    unite: "m/s²",
    guide: 4.8,
    decimales: 1,
    page: "246, 250",
    calcule: (a) => a.plateaux.SdTrans,
  },
  {
    id: "Sve",
    libelle: "Plateau du spectre vertical",
    symbole: "S_{ve}",
    unite: "m/s²",
    guide: 5.18,
    decimales: 2,
    page: "124, 246",
    calcule: (a) => a.plateaux.Sve,
    remarque: "Valeur imprimée p. 124 (a = 0,9 × 1,2 × 1,6 × 3,0) ; lue sur la figure p. 246.",
  },
  {
    id: "Se0",
    libelle: "Spectre horizontal à T = 0, q = 1",
    symbole: "S_e(0)",
    unite: "m/s²",
    guide: 7.2,
    decimales: 1,
    page: "246",
    calcule: (a) => valeur(a.spectres.calculLong, 0),
    remarque: "Le texte recommande de prolonger le plateau jusqu'à l'origine ; la figure de la p. 246 trace pourtant la branche croissante de l'EN.",
  },
];

const arrondiGuide = "Le guide arrondit Gb = 1,1 × 0,9 = 0,99 à 1,0 MPa et Gb,max = 1,07² × Gb à 1,15 Gb ; le moteur garde les valeurs exactes.";

export const CONTROLES_MODELE: PointDeControle<Modele>[] = [
  { id: "M", libelle: "Masse sismique du tablier", symbole: "M", unite: "t", guide: 822, decimales: 0, page: "248", calcule: (m) => m.masses.M },
  { id: "Ecm", libelle: "Module instantané du béton C35/45", symbole: "E_{cm}", unite: "MPa", guide: 34077, decimales: 0, page: "242", calcule: (m) => m.Ecm },
  { id: "Gb", libelle: "Module nominal des élastomères", symbole: "G_b", unite: "MPa", guide: 1.0, decimales: 1, page: "248", calcule: (m) => m.elastomeres?.Gb ?? NaN, toleranceRelative: 0.011, remarque: arrondiGuide },
  { id: "Tminb", libelle: "Température minimale des appareils", symbole: "T_{min,b}", unite: "°C", guide: -2.5, decimales: 1, page: "248", calcule: (m) => m.elastomeres?.Tminb ?? NaN },
  { id: "lambdaU", libelle: "Facteur λU,f1", symbole: "\\lambda_{U,f1}", unite: "-", guide: 1.07, decimales: 2, page: "249", calcule: (m) => m.elastomeres?.lambdaU1 ?? NaN },
  { id: "kfuts", libelle: "Raideur longitudinale des fûts d'une pile", symbole: "k_{pile}", unite: "MN/m", guide: 131.126, decimales: 3, page: "249", calcule: (m) => m.directions.x.appuis[1]?.kSupport ?? NaN, remarque: "Le guide arrondit I = 0,1067 m⁴ (0,10667 exact)." },
  { id: "kappC_L", libelle: "Appareils sur culée, LBDP", symbole: "k_{app,C}^{L}", unite: "MN/m", guide: 7, decimales: 0, page: "249", calcule: (m) => m.directions.x.appuis[0]?.kAppareils.lbdp ?? NaN, toleranceRelative: 0.011, remarque: arrondiGuide },
  { id: "kappC_U", libelle: "Appareils sur culée, UBDP", symbole: "k_{app,C}^{U}", unite: "MN/m", guide: 8.05, decimales: 2, page: "249", calcule: (m) => m.directions.x.appuis[0]?.kAppareils.ubdp ?? NaN, toleranceRelative: 0.015, remarque: arrondiGuide },
  { id: "kappP_L", libelle: "Appareils sur pile, LBDP", symbole: "k_{app,P}^{L}", unite: "MN/m", guide: 10.67, decimales: 2, page: "249", calcule: (m) => m.directions.x.appuis[1]?.kAppareils.lbdp ?? NaN, toleranceRelative: 0.011, remarque: arrondiGuide },
  { id: "kappP_U", libelle: "Appareils sur pile, UBDP", symbole: "k_{app,P}^{U}", unite: "MN/m", guide: 12.27, decimales: 2, page: "249", calcule: (m) => m.directions.x.appuis[1]?.kAppareils.ubdp ?? NaN, toleranceRelative: 0.015, remarque: arrondiGuide },
  { id: "kP_L", libelle: "Appui pile, LBDP", symbole: "k_{P}^{L}", unite: "MN/m", guide: 9.86, decimales: 2, page: "249", calcule: (m) => m.directions.x.appuis[1]?.kTotal.lbdp ?? NaN, toleranceRelative: 0.011, remarque: arrondiGuide },
  { id: "kP_U", libelle: "Appui pile, UBDP", symbole: "k_{P}^{U}", unite: "MN/m", guide: 11.22, decimales: 2, page: "249", calcule: (m) => m.directions.x.appuis[1]?.kTotal.ubdp ?? NaN, toleranceRelative: 0.015, remarque: arrondiGuide },
  { id: "K_L", libelle: "Raideur longitudinale totale, LBDP", symbole: "K_x^{L}", unite: "MN/m", guide: 33.73, decimales: 2, page: "249", calcule: (m) => m.directions.x.K.lbdp, toleranceRelative: 0.011, remarque: arrondiGuide },
  { id: "K_U", libelle: "Raideur longitudinale totale, UBDP", symbole: "K_x^{U}", unite: "MN/m", guide: 38.53, decimales: 2, page: "249", calcule: (m) => m.directions.x.K.ubdp, toleranceRelative: 0.015, remarque: `${arrondiGuide} Le guide imprime aussi « 2 × 7 » au lieu de 2 × 8,05.` },
  { id: "kC_y", libelle: "Raideur transversale d'une culée (2 poteaux)", symbole: "k_{C,y}", unite: "MN/m", guide: 436.2, decimales: 1, page: "250", calcule: (m) => m.directions.y.appuis[0]?.kSupport ?? NaN, remarque: "Le guide utilise cette raideur d'une seule culée pour la période transversale ; le moteur additionne les deux culées et les piles (étape 5)." },
];

const remarqueGb = "Écart issu des raideurs (le guide arrondit Gb à 1,0 MPa et Gb,max à 1,15 Gb).";

export const CONTROLES_ANALYSE: PointDeControle<Analyse>[] = [
  { id: "Tx_L", libelle: "Période longitudinale, LBDP", symbole: "T_x^{L}", unite: "s", guide: 0.98, decimales: 2, page: "249", calcule: (r) => r.directions.x.lbdp.T, toleranceRelative: 0.01, remarque: remarqueGb },
  { id: "Tx_U", libelle: "Période longitudinale, UBDP", symbole: "T_x^{U}", unite: "s", guide: 0.92, decimales: 2, page: "249", calcule: (r) => r.directions.x.ubdp.T },
  { id: "Se_L", libelle: "Accélération spectrale, LBDP", symbole: "S_e(T_x^{L})", unite: "m/s²", guide: 2.94, decimales: 2, page: "250", calcule: (r) => r.directions.x.lbdp.Sd, toleranceRelative: 0.01, remarque: remarqueGb },
  { id: "Se_U", libelle: "Accélération spectrale, UBDP", symbole: "S_e(T_x^{U})", unite: "m/s²", guide: 3.14, decimales: 2, page: "250", calcule: (r) => r.directions.x.ubdp.Sd, toleranceRelative: 0.01, remarque: remarqueGb },
  { id: "Fx_U", libelle: "Effort longitudinal total, UBDP", symbole: "F_x^{U}", unite: "MN", guide: 2.58, decimales: 2, page: "250", calcule: (r) => r.directions.x.ubdp.F, toleranceRelative: 0.01, remarque: remarqueGb },
  { id: "Fx_C", libelle: "Effort longitudinal sur une culée, UBDP", symbole: "F_{x,C}", unite: "MN", guide: 0.539, decimales: 3, page: "250", calcule: (r) => r.directions.x.ubdp.appuis[0]?.F ?? NaN, toleranceRelative: 0.01, remarque: remarqueGb },
  { id: "Fx_P", libelle: "Effort longitudinal sur une pile, UBDP", symbole: "F_{x,P}", unite: "MN", guide: 0.751, decimales: 3, page: "250", calcule: (r) => r.directions.x.ubdp.appuis[1]?.F ?? NaN, toleranceRelative: 0.01, remarque: remarqueGb },
  { id: "dx_L", libelle: "Déplacement longitudinal du tablier, LBDP", symbole: "d_x^{L}", unite: "m", guide: 0.072, decimales: 3, page: "250", calcule: (r) => r.directions.x.lbdp.dE },
  { id: "dP_L", libelle: "Déplacement de la tête de pile, LBDP", symbole: "d_{P}", unite: "m", guide: 0.005, decimales: 3, page: "250", calcule: (r) => r.directions.x.lbdp.appuis[1]?.dTete ?? NaN },
  {
    id: "Ty",
    libelle: "Période transversale",
    symbole: "T_y",
    unite: "s",
    guide: 0.27,
    decimales: 2,
    page: "250",
    calcule: (r) => r.directions.y.lbdp.T,
    toleranceRelative: 0.35,
    remarque: "Le guide ne compte la raideur que d'une culée (436 MN/m) ; le moteur additionne les deux culées et les piles (893 MN/m). Les deux périodes sont sur le plateau du spectre : effort inchangé.",
  },
  {
    id: "Fy_C",
    libelle: "Effort transversal sur une culée (butée)",
    symbole: "F_{y,C}",
    unite: "MN",
    guide: 1.97,
    decimales: 2,
    page: "250",
    calcule: (r) => r.directions.y.lbdp.appuis[0]?.F ?? NaN,
    toleranceRelative: 0.03,
    remarque: "Le guide affecte M·Sd/2 à chaque culée ; le moteur répartit au prorata des raideurs, les piles reprenant 2,3 % de l'effort.",
  },
  { id: "Rv_C", libelle: "Réaction verticale sur culée", symbole: "R_{C}", unite: "MN", guide: 0.465, decimales: 3, page: "251", calcule: (r) => r.vertical.reactions[0]?.R ?? NaN },
  { id: "Rv_P", libelle: "Réaction verticale sur pile", symbole: "R_{P}", unite: "MN", guide: 0.93, decimales: 2, page: "251", calcule: (r) => r.vertical.reactions[1]?.R ?? NaN },
];

const rGb = "Le guide prend G = 1,0 MPa (Gb exact : 0,99 MPa).";
const rArrondi = "Le guide arrondit dEd à 0,120 m (0,1203 exact).";
const C = (v: VerifAppuis) => v.appareils[0];
const P = (v: VerifAppuis) => v.appareils[1];

export const CONTROLES_APPUIS: PointDeControle<VerifAppuis>[] = [
  { id: "dEd_C", libelle: "Déplacement de calcul des appareils, culée", symbole: "d_{Ed,C}", unite: "m", guide: 0.12, decimales: 3, page: "256", calcule: (v) => C(v)?.dEd ?? NaN },
  { id: "dEd_P", libelle: "Déplacement de calcul des appareils, pile", symbole: "d_{Ed,P}", unite: "m", guide: 0.105, decimales: 3, page: "256", calcule: (v) => P(v)?.dEd ?? NaN },
  { id: "S_C", libelle: "Coefficient de forme, culée", symbole: "S_C", unite: "-", guide: 6.52, decimales: 2, page: "256", calcule: (v) => C(v)?.S ?? NaN },
  { id: "S_P", libelle: "Coefficient de forme, pile", symbole: "S_P", unite: "-", guide: 8.13, decimales: 2, page: "256", calcule: (v) => P(v)?.S ?? NaN },
  { id: "Ar_C", libelle: "Aire réduite, culée", symbole: "A_{r,C}", unite: "m²", guide: 0.093, decimales: 3, page: "256", calcule: (v) => C(v)?.Ar ?? NaN },
  { id: "Ar_P", libelle: "Aire réduite, pile", symbole: "A_{r,P}", unite: "m²", guide: 0.149, decimales: 3, page: "256", calcule: (v) => P(v)?.Ar ?? NaN },
  { id: "Ec_C", libelle: "Module de compressibilité apparent, culée", symbole: "E'_{c,C}", unite: "MPa", guide: 258, decimales: 0, page: "256", calcule: (v) => C(v)?.EcPrime ?? NaN, toleranceRelative: 0.011, remarque: rGb },
  { id: "N_C", libelle: "Effort normal par appareil (X + 0,3 Z), culée", symbole: "N_{Ed,C}", unite: "MN", guide: 0.282, decimales: 3, page: "256", calcule: (v) => C(v)?.combinaisons[0]?.N ?? NaN },
  { id: "N_P", libelle: "Effort normal par appareil (X + 0,3 Z), pile", symbole: "N_{Ed,P}", unite: "MN", guide: 0.971, decimales: 3, page: "256", calcule: (v) => P(v)?.combinaisons[0]?.N ?? NaN },
  { id: "epsC_C", libelle: "Distorsion de compression, culée", symbole: "\\varepsilon_{c,E,C}", unite: "-", guide: 0.45, decimales: 2, page: "256", calcule: (v) => C(v)?.combinaisons[0]?.epsC ?? NaN, toleranceRelative: 0.035, remarque: `${rGb} L'application numérique du guide donne elle-même 0,46.` },
  { id: "epsC_P", libelle: "Distorsion de compression, pile", symbole: "\\varepsilon_{c,E,P}", unite: "-", guide: 0.79, decimales: 2, page: "256", calcule: (v) => P(v)?.combinaisons[0]?.epsC ?? NaN, toleranceRelative: 0.02, remarque: rGb },
  { id: "epsQ_C", libelle: "Distorsion de cisaillement, culée", symbole: "\\varepsilon_{q,C}", unite: "-", guide: 1.99, decimales: 2, page: "257", calcule: (v) => C(v)?.combinaisons[0]?.epsQ ?? NaN, toleranceRelative: 0.01, remarque: rArrondi },
  { id: "epsQ_P", libelle: "Distorsion de cisaillement, pile", symbole: "\\varepsilon_{q,P}", unite: "-", guide: 1.75, decimales: 2, page: "257", calcule: (v) => P(v)?.combinaisons[0]?.epsQ ?? NaN, toleranceRelative: 0.01, remarque: "Le guide arrondit dEd à 0,105 m." },
  { id: "epsA_C", libelle: "Distorsion de rotation, culée", symbole: "\\varepsilon_{\\alpha,C}", unite: "-", guide: 0.45, decimales: 2, page: "257", calcule: (v) => C(v)?.combinaisons[0]?.epsA ?? NaN },
  { id: "epsA_P", libelle: "Distorsion de rotation, pile", symbole: "\\varepsilon_{\\alpha,P}", unite: "-", guide: 0.73, decimales: 2, page: "257", calcule: (v) => P(v)?.combinaisons[0]?.epsA ?? NaN },
  { id: "epsT_C", libelle: "Distorsion totale, culée", symbole: "\\varepsilon_{t,C}", unite: "-", guide: 2.9, decimales: 1, page: "257", calcule: (v) => C(v)?.combinaisons[0]?.epsT ?? NaN },
  { id: "epsT_P", libelle: "Distorsion totale, pile", symbole: "\\varepsilon_{t,P}", unite: "-", guide: 3.27, decimales: 2, page: "257", calcule: (v) => P(v)?.combinaisons[0]?.epsT ?? NaN, toleranceRelative: 0.01, remarque: rGb },
  { id: "Pcr_C", libelle: "Charge critique de flambement, culée", symbole: "P_{cr,C}", unite: "kN", guide: 3814, decimales: 0, page: "257", calcule: (v) => (C(v)?.Pcr ?? NaN) * 1000, toleranceRelative: 0.011, remarque: rGb },
  { id: "Pcr_P", libelle: "Charge critique de flambement, pile", symbole: "P_{cr,P}", unite: "kN", guide: 10245, decimales: 0, page: "257", calcule: (v) => (P(v)?.Pcr ?? NaN) * 1000, toleranceRelative: 0.011, remarque: rGb },
  { id: "Nflamb_C", libelle: "Effort normal par appareil (Z dominant), culée", symbole: "N_{V,C}", unite: "kN", guide: 363, decimales: 0, page: "257", calcule: (v) => (C(v)?.combinaisons[2]?.N ?? NaN) * 1000 },
  { id: "Nflamb_P", libelle: "Effort normal par appareil (Z dominant), pile", symbole: "N_{V,P}", unite: "kN", guide: 1134, decimales: 0, page: "257", calcule: (v) => (P(v)?.combinaisons[2]?.N ?? NaN) * 1000 },
  { id: "Fxy_C", libelle: "Effort horizontal de glissement, culée", symbole: "F_{xy,C}", unite: "MN", guide: 0.207, decimales: 3, page: "258", calcule: (v) => C(v)?.glissement?.F ?? NaN, toleranceRelative: 0.01, remarque: "La raideur dynamique utilise Gb exact (0,99 MPa) ; le guide prend 1,0 MPa." },
  { id: "Fxy_P", libelle: "Effort horizontal de glissement, pile", symbole: "F_{xy,P}", unite: "MN", guide: 0.278, decimales: 3, page: "258", calcule: (v) => P(v)?.glissement?.F ?? NaN, toleranceRelative: 0.01, remarque: "La raideur dynamique utilise Gb exact (0,99 MPa) ; le guide prend 1,0 MPa." },
  { id: "Rg_C", libelle: "Résistance au glissement, culée", symbole: "R_{C}", unite: "MN", guide: 0.076, decimales: 3, page: "258", calcule: (v) => C(v)?.glissement?.R ?? NaN },
  { id: "Rg_P", libelle: "Résistance au glissement, pile", symbole: "R_{P}", unite: "MN", guide: 0.166, decimales: 3, page: "258", calcule: (v) => P(v)?.glissement?.R ?? NaN },
  {
    id: "souffle",
    libelle: "Souffle sismique total du joint",
    symbole: "\\text{souffle}",
    unite: "cm",
    guide: 17.5,
    decimales: 1,
    page: "275",
    calcule: (v) => (v.joints[0]?.souffle ?? NaN) * 100,
    toleranceRelative: 0.05,
    remarque: "Le guide prend dE = 7,6 cm, réévalué avec l'inertie fissurée des fûts (§3.2.3, étape 6b) ; le moteur utilise encore dE = 7,2 cm.",
  },
];

export type StatutComparaison = "conforme" | "ecart_explique" | "ecart";

export interface Comparaison<R = ActionSismique> {
  point: PointDeControle<R>;
  calcule: number;
  ecart: number;
  statut: StatutComparaison;
  conforme: boolean;
}

export function comparer<R>(points: PointDeControle<R>[], r: R): Comparaison<R>[] {
  return points.map((point) => {
    const calcule = point.calcule(r);
    const ecart = calcule - point.guide;
    const arrondi = Math.abs(ecart) <= 0.5 * 10 ** -point.decimales + 1e-9 || Math.abs(ecart) <= 0.002 * Math.abs(point.guide);
    const explique = !arrondi && point.toleranceRelative !== undefined && Math.abs(ecart) <= point.toleranceRelative * Math.abs(point.guide);
    const statut: StatutComparaison = arrondi ? "conforme" : explique ? "ecart_explique" : "ecart";
    return { point, calcule, ecart, statut, conforme: statut !== "ecart" };
  });
}

export const validerActionExemple = () => comparer(CONTROLES_ACTION, actionSismique(EXEMPLE_PONT_DALLE));
export const validerModeleExemple = () => comparer(CONTROLES_MODELE, modele(EXEMPLE_PONT_DALLE));
export const validerAnalyseExemple = () => {
  const p = EXEMPLE_PONT_DALLE;
  return comparer(CONTROLES_ANALYSE, analyse(p, actionSismique(p), modele(p)));
};
export const validerAppuisExemple = () => {
  const p = EXEMPLE_PONT_DALLE;
  const a = actionSismique(p);
  const m = modele(p);
  return comparer(CONTROLES_APPUIS, verifierAppuis(p, a, m, analyse(p, a, m)));
};
