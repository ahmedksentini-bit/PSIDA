// Contrôles de cohérence de la saisie. Une erreur bloque les calculs ;
// une alerte signale une géométrie inhabituelle ; une information éclaire un choix.

import { epaisseurElastomere } from "./geometrie.ts";
import type { Appui, LigneAppareils, Projet } from "./types.ts";

export type Niveau = "erreur" | "alerte" | "info";

export interface Probleme {
  niveau: Niveau;
  /** Élément concerné : « tablier », « P1 », « site »… */
  cible: string;
  message: string;
}

const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

function positifs(cible: string, valeurs: Record<string, number>, sortie: Probleme[]) {
  for (const [nom, v] of Object.entries(valeurs)) {
    if (!Number.isFinite(v) || v <= 0) sortie.push({ niveau: "erreur", cible, message: `${nom} doit être un nombre strictement positif.` });
  }
}

function controlerAppareils(appui: Appui, a: LigneAppareils, sortie: Probleme[]) {
  if (!Number.isInteger(a.nombre) || a.nombre < 1) {
    sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre d'appareils d'appui doit être un entier au moins égal à 1." });
  }
  positifs(appui.id, { "La dimension a de l'appareil": a.a, "La dimension b de l'appareil": a.b }, sortie);
  if (a.type === "elastomere") {
    positifs(appui.id, { "L'épaisseur d'un feuillet": a.ti, "Le module Gg": a.Gg }, sortie);
    if (!Number.isInteger(a.nbFeuillets) || a.nbFeuillets < 1) {
      sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre de feuillets doit être un entier au moins égal à 1." });
    }
    const tq = epaisseurElastomere(a) ?? 0;
    if (tq > 0 && Math.min(a.a, a.b) / tq < 3) {
      sortie.push({ niveau: "alerte", cible: appui.id, message: `Appareil très élancé : épaisseur d'élastomère ${fr.format(tq)} m pour un côté de ${fr.format(Math.min(a.a, a.b))} m.` });
    }
    if (a.Gg < 0.7 || a.Gg > 1.2) {
      sortie.push({ niveau: "alerte", cible: appui.id, message: `Module Gg inhabituel (${fr.format(a.Gg)} MPa) ; valeur conventionnelle courante : 0,9 MPa.` });
    }
  } else {
    positifs(appui.id, { "La hauteur de l'appareil": a.hauteur }, sortie);
  }
}

export function valider(p: Projet): Probleme[] {
  const sortie: Probleme[] = [];
  const { tablier, appuis, site } = p;

  // Site
  if (site.zone === 1 || site.categorie === "I") {
    sortie.push({
      niveau: "info",
      cible: "site",
      message: "Zone 1 ou catégorie I : le pont n'est pas soumis aux règles parasismiques (arrêté du 26/10/2011, art. 3). Le calcul reste possible à titre indicatif.",
    });
  }
  if (!(site.ST >= 1)) sortie.push({ niveau: "erreur", cible: "site", message: "Le coefficient topographique S_T doit être au moins égal à 1." });

  // Comportement
  const c = p.comportement;
  for (const [nom, q] of [["longitudinal", c.qLongitudinal], ["transversal", c.qTransversal]] as const) {
    if (!(q >= 1)) sortie.push({ niveau: "erreur", cible: "comportement", message: `Le coefficient de comportement ${nom} doit être au moins égal à 1.` });
    else if (q > 1.5) {
      sortie.push({ niveau: "alerte", cible: "comportement", message: `q ${nom} = ${fr.format(q)} > 1,5 : conception ductile, hors du périmètre de la V1 (dimensionnement en capacité non traité).` });
    }
  }
  const surElastomeres = appuis.length > 0 && appuis.every((a) => a.appareils.type === "elastomere");
  if (surElastomeres && c.qLongitudinal > 1) {
    sortie.push({ niveau: "alerte", cible: "comportement", message: "Tablier entièrement sur appareils en élastomère : le guide retient q = 1 dans la direction longitudinale." });
  }
  if (surElastomeres && c.qTransversal > 1 && !appuis.some((a) => a.butees.transversales)) {
    sortie.push({ niveau: "alerte", cible: "comportement", message: "Aucun blocage transversal : avec des appareils en élastomère seuls, le guide retient q = 1 dans la direction transversale." });
  }
  if (!(c.amortissement > 0 && c.amortissement <= 30)) {
    sortie.push({ niveau: "erreur", cible: "comportement", message: "L'amortissement doit être compris entre 0 et 30 %." });
  }

  // Matériaux et options
  positifs("matériaux", { "fck": p.materiaux.beton.fck, "La masse volumique du béton": p.materiaux.beton.masseVolumique, "fyk": p.materiaux.acier.fyk }, sortie);
  if (!(p.options.g > 9 && p.options.g < 11)) sortie.push({ niveau: "erreur", cible: "options", message: "g doit être compris entre 9 et 11 m/s²." });

  // Tablier
  if (tablier.travees.length < 1) sortie.push({ niveau: "erreur", cible: "tablier", message: "Le tablier doit comporter au moins une travée." });
  tablier.travees.forEach((t, i) => {
    if (!(t > 0)) sortie.push({ niveau: "erreur", cible: "tablier", message: `La portée de la travée ${i + 1} doit être strictement positive.` });
  });
  positifs("tablier", { "La largeur du tablier": tablier.largeur, "L'épaisseur du tablier": tablier.epaisseur, "L'aire de la section": tablier.aire }, sortie);
  if (tablier.aire > tablier.largeur * tablier.epaisseur * 1.001) {
    sortie.push({ niveau: "alerte", cible: "tablier", message: "L'aire de la section dépasse largeur × épaisseur." });
  }
  if (tablier.superstructures < 0) sortie.push({ niveau: "erreur", cible: "tablier", message: "Le poids des superstructures ne peut pas être négatif." });
  if (tablier.debordAbout < 0) sortie.push({ niveau: "erreur", cible: "tablier", message: "Le débord d'about ne peut pas être négatif." });
  for (const [cle, nom] of [["inertieVerticale", "L'inertie de flexion verticale"], ["inertieTransversale", "L'inertie de flexion transversale"]] as const) {
    const v = tablier[cle];
    if (v !== undefined && !(v > 0)) sortie.push({ niveau: "erreur", cible: "tablier", message: `${nom} du tablier doit être strictement positive (laisser vide pour la valeur par défaut).` });
  }

  // Appuis
  if (appuis.length !== tablier.travees.length + 1) {
    sortie.push({ niveau: "erreur", cible: "appuis", message: `Il faut ${tablier.travees.length + 1} appuis pour ${tablier.travees.length} travée(s) ; ${appuis.length} sont définis.` });
  }
  appuis.forEach((appui, i) => {
    const extremite = i === 0 || i === appuis.length - 1;
    if (extremite && appui.type !== "culee") sortie.push({ niveau: "erreur", cible: appui.id, message: "Les appuis d'extrémité doivent être des culées." });
    if (!extremite && appui.type !== "pile") sortie.push({ niveau: "erreur", cible: appui.id, message: "Les appuis intermédiaires doivent être des piles." });
  });
  const ids = appuis.map((a) => a.id);
  if (new Set(ids).size !== ids.length) sortie.push({ niveau: "erreur", cible: "appuis", message: "Deux appuis portent le même nom." });

  for (const appui of appuis) {
    controlerAppareils(appui, appui.appareils, sortie);
    if (appui.type === "pile") {
      const { futs, semelle } = appui;
      positifs(appui.id, { "La hauteur des fûts": futs.hauteur, "La dimension longitudinale des fûts": futs.long, "La dimension transversale des fûts": futs.trans }, sortie);
      positifs(appui.id, { "La semelle (longueur)": semelle.long, "La semelle (largeur)": semelle.trans, "La semelle (épaisseur)": semelle.epaisseur }, sortie);
      if (!Number.isInteger(futs.nombre) || futs.nombre < 1) sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre de fûts doit être un entier au moins égal à 1." });
      const largeurFuts = (futs.nombre - 1) * futs.entraxe + (futs.forme === "circulaire" ? futs.long : futs.trans);
      if (futs.nombre > 1 && futs.entraxe < (futs.forme === "circulaire" ? futs.long : futs.trans)) {
        sortie.push({ niveau: "erreur", cible: appui.id, message: "L'entraxe des fûts est inférieur à leur largeur : les fûts se chevauchent." });
      }
      if (largeurFuts > tablier.largeur) sortie.push({ niveau: "alerte", cible: appui.id, message: `Les fûts (${fr.format(largeurFuts)} m) débordent de la largeur du tablier.` });
      if (semelle.long < futs.long || semelle.trans < largeurFuts) sortie.push({ niveau: "alerte", cible: appui.id, message: "La semelle ne couvre pas l'emprise des fûts." });
      if (appui.appareils.a > futs.long) sortie.push({ niveau: "alerte", cible: appui.id, message: "Les appareils d'appui débordent de l'épaisseur des fûts." });
      if (appui.appareils.nombre % futs.nombre !== 0) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "Le nombre d'appareils n'est pas un multiple du nombre de fûts : répartition uniforme sur la largeur." });
      }
      if (appui.armatures) {
        const { As, db, enrobage, rhoW } = appui.armatures;
        if (!(As > 0) || !(db > 0) || !(enrobage > 0)) sortie.push({ niveau: "erreur", cible: appui.id, message: "Armatures des fûts : As, le diamètre des barres et l'enrobage doivent être strictement positifs." });
        if (rhoW !== undefined && !(rhoW >= 0)) sortie.push({ niveau: "erreur", cible: appui.id, message: "Le taux d'armatures transversales ρw ne peut pas être négatif." });
        if (enrobage > 0 && 2 * enrobage >= Math.min(futs.long, futs.forme === "circulaire" ? futs.long : futs.trans)) sortie.push({ niveau: "erreur", cible: appui.id, message: "L'enrobage des armatures dépasse la demi-épaisseur du fût." });
      }
      if (appui.facteurInertie !== undefined && !(appui.facteurInertie > 0 && appui.facteurInertie <= 1)) sortie.push({ niveau: "erreur", cible: appui.id, message: "Le facteur d'inertie effective des fûts doit être compris entre 0 et 1." });
      if (futs.hauteur / Math.min(futs.long, futs.forme === "circulaire" ? futs.long : futs.trans) > 25) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "Fûts très élancés : vérifier la pertinence de la méthode du mode fondamental et les effets du second ordre." });
      }
    } else {
      const { poteaux, sommier, semelle } = appui;
      positifs(appui.id, { "La hauteur des poteaux": poteaux.hauteur, "Le côté des poteaux": poteaux.cote, "Le sommier (longueur)": sommier.long, "Le sommier (hauteur)": sommier.haut, "Le sommier (largeur)": sommier.trans }, sortie);
      positifs(appui.id, { "La semelle (longueur)": semelle.long, "La semelle (largeur)": semelle.trans, "La semelle (épaisseur)": semelle.epaisseur }, sortie);
      if (!Number.isInteger(poteaux.nombre) || poteaux.nombre < 1) sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre de poteaux doit être un entier au moins égal à 1." });
      if (poteaux.nombre > 1 && poteaux.entraxe < poteaux.cote) sortie.push({ niveau: "erreur", cible: appui.id, message: "L'entraxe des poteaux est inférieur à leur côté." });
      // Distance de l'axe des poteaux à la face avant du garde-grève (sommier placé selon son débord avant).
      const faceGardeGreve =
        sommier.long - poteaux.cote / 2 - sommier.debordAvant - appui.gardeGreve.retrait - appui.gardeGreve.epaisseur;
      if (appui.excentrementAppui + appui.appareils.a / 2 > faceGardeGreve) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "L'appareil d'appui empiète sur le mur garde-grève." });
      }
      if (appui.excentrementAppui + tablier.debordAbout >= faceGardeGreve) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "Le tablier touche le mur garde-grève : réduire le débord d'about ou reculer le garde-grève." });
      }
    }
  }
  return sortie;
}

export const aDesErreurs = (problemes: Probleme[]) => problemes.some((p) => p.niveau === "erreur");
