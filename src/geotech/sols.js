// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/sols.js) — module testé de fond.ksr-infra.org (170 tests).
// Classifications des sols pour le calcul des fondations.
//
// Deux référentiels, deux découpages — et ils ne se recouvrent pas exactement :
//  · Fascicule 62 titre V (annexe E.1, § 3) : cinq familles, chacune en classes
//    A, B, C selon la résistance (pl, qc) ;
//  · NF P94-261 / NF P94-262 (annexes A et B) : catégories conventionnelles sans
//    lettre de résistance ; la résistance entre par pl* ou qc dans les formules,
//    et une catégorie « sols intermédiaires » apparaît.
// Le passage de l'un à l'autre est un choix d'ingénieur, pas une table : un
// sable argileux reste « sable » ou devient « intermédiaire » selon sa nature
// dominante. Les deux sont donc saisis séparément.

import { horsDomaine } from "./outils.js";

/** Fascicule 62 titre V, annexe E.1, § 3 — fourchettes indicatives de pl et qc (MPa). */
export const CLASSES_F62 = {
  "argile-A": { famille: "argile", lettre: "A", nom: "Argiles et limons mous", pl: [0, 0.7], qc: [0, 3], cohérent: true },
  "argile-B": { famille: "argile", lettre: "B", nom: "Argiles et limons fermes", pl: [1.2, 2.0], qc: [3, 6], cohérent: true },
  "argile-C": { famille: "argile", lettre: "C", nom: "Argiles très fermes à dures", pl: [2.5, Infinity], qc: [6, Infinity], cohérent: true },
  "sable-A": { famille: "sable", lettre: "A", nom: "Sables et graves lâches", pl: [0, 0.5], qc: [0, 5], cohérent: false },
  "sable-B": { famille: "sable", lettre: "B", nom: "Sables et graves moyennement compacts", pl: [1.0, 2.0], qc: [8, 15], cohérent: false },
  "sable-C": { famille: "sable", lettre: "C", nom: "Sables et graves compacts", pl: [2.5, Infinity], qc: [20, Infinity], cohérent: false },
  "craie-A": { famille: "craie", lettre: "A", nom: "Craies molles", pl: [0, 0.7], qc: [0, 5], cohérent: true },
  "craie-B": { famille: "craie", lettre: "B", nom: "Craies altérées", pl: [1.0, 2.5], qc: [5, Infinity], cohérent: true },
  "craie-C": { famille: "craie", lettre: "C", nom: "Craies compactes", pl: [3.0, Infinity], qc: null, cohérent: true },
  "marne-A": { famille: "marne", lettre: "A", nom: "Marnes et marno-calcaires tendres", pl: [1.5, 4.0], qc: null, cohérent: true },
  "marne-B": { famille: "marne", lettre: "B", nom: "Marnes et marno-calcaires compacts", pl: [4.5, Infinity], qc: null, cohérent: true },
  "roche-A": { famille: "roche", lettre: "A", nom: "Roches altérées", pl: [2.5, 4.0], qc: null, cohérent: true },
  "roche-B": { famille: "roche", lettre: "B", nom: "Roches fragmentées", pl: [4.5, Infinity], qc: null, cohérent: true },
};

/**
 * Catégories conventionnelles NF P94-261 / NF P94-262. Pour les tableaux
 * pressiométriques des pieux, les sols intermédiaires rejoignent la colonne
 * de leur nature dominante ; d'où les deux entrées « intermédiaire ».
 */
export const CATEGORIES_EC7 = {
  "argile": { nom: "Argiles, limons (CaCO₃ < 30 %)", colPMT: "argile", colCPT: "argile", superficielle: "argile" },
  "intermediaire-argileux": { nom: "Sols intermédiaires à dominante argileuse", colPMT: "argile", colCPT: "intermediaire", superficielle: "argile" },
  "intermediaire-sableux": { nom: "Sols intermédiaires à dominante sableuse", colPMT: "sable", colCPT: "intermediaire", superficielle: "sable" },
  "sable": { nom: "Sables et graves", colPMT: "sable", colCPT: "sable", superficielle: "sable" },
  "craie": { nom: "Craies", colPMT: "craie", colCPT: "craie", superficielle: "craie" },
  "marne": { nom: "Marnes et calcaires marneux", colPMT: "marne", colCPT: "marne", superficielle: "marne" },
  "roche": { nom: "Roches altérées ou fragmentées", colPMT: "roche", colCPT: "roche", superficielle: "roche" },
};

/**
 * Proposition de classe F62 à partir de la famille et de la pression limite.
 * Les fourchettes du tableau ne sont pas jointives (0,7 à 1,2 MPa pour les
 * argiles, par exemple) : entre deux classes, on retient la plus basse — et on
 * le dit. Le classement final reste un jugement sur la nature du sol.
 */
export function proposerClasseF62(famille, pl) {
  const candidates = Object.entries(CLASSES_F62).filter(([, c]) => c.famille === famille);
  if (!candidates.length) return horsDomaine(`famille « ${famille} » inconnue`);
  for (let i = 0; i < candidates.length; i++) {
    const [cle, c] = candidates[i];
    if (pl <= c.pl[1]) {
      // Sous la borne haute de cette classe : dedans, ou dans le trou qui la
      // précède — auquel cas on garde la classe inférieure, par prudence.
      if (pl >= c.pl[0] || i === 0) return { cle, ...c, entre: false };
      const [cleBas, bas] = candidates[i - 1];
      return { cle: cleBas, ...bas, entre: true };
    }
    // Entre cette classe et la suivante (trou du tableau) : classe inférieure.
    const suivante = candidates[i + 1];
    if (suivante && pl < suivante[1].pl[0]) return { cle, ...c, entre: true };
  }
  const [cle, c] = candidates[candidates.length - 1];
  return { cle, ...c, entre: false };
}

/**
 * Coefficient rhéologique α de Ménard (F62 annexe C.5 art. 3.1 ; NF P94-261
 * tableau H.2.1.1.1 corrigé par le guide Cerema ; NF P94-262 tableau I.1.3.1).
 * Il se lit sur le rapport EM/pl : un sol surconsolidé a un grand EM/pl.
 */
export const ALPHA_MENARD = {
  tourbe: [{ etat: "normalement consolidé", rapport: [0, Infinity], alpha: 1 }],
  argile: [
    { etat: "sous-consolidé, altéré, remanié", rapport: [7, 9], alpha: 1 / 2 },
    { etat: "normalement consolidé", rapport: [9, 16], alpha: 2 / 3 },
    { etat: "surconsolidé", rapport: [16, Infinity], alpha: 1 },
  ],
  limon: [
    { etat: "sous-consolidé, altéré, remanié", rapport: [5, 8], alpha: 1 / 2 },
    { etat: "normalement consolidé", rapport: [8, 14], alpha: 1 / 2 },
    { etat: "surconsolidé", rapport: [14, Infinity], alpha: 2 / 3 },
  ],
  sable: [
    { etat: "lâche", rapport: [5, 7], alpha: 1 / 3 },
    { etat: "normalement serré", rapport: [7, 12], alpha: 1 / 3 },
    { etat: "très serré", rapport: [12, Infinity], alpha: 1 / 2 },
  ],
  grave: [
    { etat: "normalement serré", rapport: [6, 10], alpha: 1 / 4 },
    { etat: "très serré", rapport: [10, Infinity], alpha: 1 / 3 },
  ],
};
export const ALPHA_ROCHER = {
  "très peu fracturé": 2 / 3,
  "normalement fracturé": 1 / 2,
  "très fracturé": 1 / 3,
  "très altéré": 2 / 3,
};

/** α d'après la nature du sol et le rapport EM/pl (bornes des tableaux incluses vers le haut). */
export function alphaMenard(nature, EM, pl) {
  const lignes = ALPHA_MENARD[nature];
  if (!lignes) return horsDomaine(`nature « ${nature} » absente du tableau de α`);
  const r = EM / pl;
  let choisie = lignes[0];
  for (const l of lignes) if (r >= l.rapport[0]) choisie = l;
  const dans = r >= lignes[0].rapport[0];
  return { alpha: choisie.alpha, etat: choisie.etat, rapport: r, dansTableau: dans };
}

/**
 * Contrainte horizontale totale au repos et pression limite nette
 * (F62 annexe E.1, § 2.2,1) : p0 = u + K0·σ'v0, pl* = pl − p0, K0 ≈ 0,5.
 * Entrées en kPa, sorties en kPa.
 */
export function pressionNette({ pl, sigmaV0eff, u = 0, K0 = 0.5 }) {
  const p0 = u + K0 * sigmaV0eff;
  return { p0, plNette: pl - p0 };
}

/** Contrainte verticale effective à la profondeur z, profil de poids volumiques et nappe. */
export function sigmaV0({ couches, z, zNappe = Infinity }) {
  // couches : [{ z0, z1, gamma, gammaSat? }] ; sous la nappe, on déjauge.
  let total = 0, u = 0;
  for (const c of couches) {
    const a = c.z0, b = Math.min(c.z1, z);
    if (b <= a) continue;
    const gs = c.gammaSat ?? c.gamma;
    const hSec = Math.max(0, Math.min(b, zNappe) - a);
    const hSat = (b - a) - hSec;
    total += c.gamma * hSec + gs * hSat;
  }
  if (z > zNappe) u = 10 * (z - zNappe);
  return { sigmaV: total, u, sigmaVeff: total - u };
}

/**
 * Profondeur de reconnaissance recommandée sous le niveau d'assise (NF EN
 * 1997-2 annexe B.3, informative) : semelle, za ≥ 6 m et 3 bF (bF petit côté
 * de la semelle) ; radier ou fondations rapprochées, za ≥ 1,5 bB (bB petit
 * côté de l'ouvrage) ; pieux, sous la pointe, za ≥ bg, 5 m et 3 DF (bg petit
 * côté du rectangle circonscrit au groupe, DF diamètre de la base).
 */
export function profondeurReconnaissance({ type, b, DF = 0 }) {
  const criteres = type === "semelle" ? [["6 m", 6], ["3 bF", 3 * b]]
    : type === "radier" ? [["1,5 bB", 1.5 * b]]
      : [["bg", b], ["5 m", 5], ["3 DF", 3 * DF]];
  const za = Math.max(...criteres.map(([, v]) => v));
  return { za, criteres, gouvernant: criteres.find(([, v]) => v === za)[0] };
}
