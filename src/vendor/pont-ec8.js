// Moteur de Pont EC8 (dépôt ahmedksentini-bit/ouvpara, commit 4856858) — EN 1998-2, méthode du mode fondamental, guide Cerema 2015.
// Paquet ES produit par esbuild depuis src/projet, src/moteur et src/referentiel (TypeScript) ; ne pas modifier ici.
// src/projet/stockage.ts
var estObjet = (v) => typeof v === "object" && v !== null;
function lireProjet(v) {
  if (!estObjet(v) || v.version !== 1) throw new Error("Ce fichier n'est pas un projet Pont EC8 (version 1).");
  for (const cle of ["site", "materiaux", "tablier", "options"]) {
    if (!estObjet(v[cle])) throw new Error(`Section \xAB ${cle} \xBB absente ou invalide.`);
  }
  const tablier = v.tablier;
  if (!Array.isArray(tablier.travees) || !tablier.travees.every((t) => typeof t === "number")) {
    throw new Error("Liste des trav\xE9es absente ou invalide.");
  }
  if (!Array.isArray(v.appuis) || !v.appuis.every((a) => estObjet(a) && (a.type === "pile" || a.type === "culee"))) {
    throw new Error("Liste des appuis absente ou invalide.");
  }
  if (!estObjet(v.comportement)) {
    v.comportement = { qLongitudinal: 1, qTransversal: 1, amortissement: 5, plateauOrigine: true };
  }
  if (!estObjet(v.elastomeres)) v.elastomeres = { T0: 10, Tmin: -20, lambdaMaxF1: 1.1, lambdaMaxF2: 1.1, psiFi: 0.7 };
  const el = v.elastomeres;
  if (typeof el.gammaIS !== "number") el.gammaIS = 1.5;
  if (typeof el.Kf !== "number") el.Kf = 0.6;
  if (!estObjet(v.service)) v.service = { retraitFluage: 4e-4, deltaT: 40, alpha: 1e-5 };
  if (typeof tablier.chargeTrafic !== "number") tablier.chargeTrafic = 0;
  for (const a of v.appuis) {
    if (a.type === "culee" && !estObjet(a.rigide)) a.rigide = { longitudinal: true, transversal: false };
    const ap = a.appareils;
    if (ap && ap.type === "elastomere") {
      if (typeof ap.enrobageLateral !== "number") ap.enrobageLateral = 5e-3;
      if (ap.fixation !== "frottement" && ap.fixation !== "mecanique") ap.fixation = "mecanique";
    }
  }
  return v;
}

// src/projet/geometrie.ts
var somme = (v) => v.reduce((a, b) => a + b, 0);
var m = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
var positionsAppuis = (travees) => {
  const x = [0];
  for (const t of travees) x.push((x.at(-1) ?? 0) + t);
  return x;
};
function epaisseurElastomere(a) {
  return a.type === "elastomere" ? a.nbFeuillets * a.ti + 2 * a.enrobage : null;
}
function derives(p) {
  const positions = positionsAppuis(p.tablier.travees);
  const longueur = somme(p.tablier.travees);
  const beton = p.tablier.aire * p.materiaux.beton.masseVolumique * p.options.g;
  const total = beton + p.tablier.superstructures;
  const masseLineique = total / p.options.g;
  const { zone, categorie } = p.site;
  const soumis = zone === 1 ? { soumis: false, motif: "Zone de sismicit\xE9 1 : pont non soumis aux r\xE8gles parasismiques (arr\xEAt\xE9 du 26/10/2011, art. 3)." } : categorie === "I" ? { soumis: false, motif: "Cat\xE9gorie d'importance I : pont non soumis aux r\xE8gles parasismiques (arr\xEAt\xE9 du 26/10/2011, art. 3)." } : { soumis: true, motif: `Zone ${zone}, cat\xE9gorie ${categorie} : r\xE8gles de l'Eurocode 8 applicables (arr\xEAt\xE9 du 26/10/2011, art. 3 et 4).` };
  return {
    positions,
    longueur,
    longueurTablier: longueur + 2 * p.tablier.debordAbout,
    poidsLineique: { beton, superstructures: p.tablier.superstructures, total },
    masseLineique,
    masseTablier: masseLineique * longueur,
    soumis
  };
}

// src/projet/validation.ts
var fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
function positifs(cible, valeurs, sortie) {
  for (const [nom, v] of Object.entries(valeurs)) {
    if (!Number.isFinite(v) || v <= 0) sortie.push({ niveau: "erreur", cible, message: `${nom} doit \xEAtre un nombre strictement positif.` });
  }
}
function controlerAppareils(appui, a, sortie) {
  if (!Number.isInteger(a.nombre) || a.nombre < 1) {
    sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre d'appareils d'appui doit \xEAtre un entier au moins \xE9gal \xE0 1." });
  }
  positifs(appui.id, { "La dimension a de l'appareil": a.a, "La dimension b de l'appareil": a.b }, sortie);
  if (a.type === "elastomere") {
    positifs(appui.id, { "L'\xE9paisseur d'un feuillet": a.ti, "Le module Gg": a.Gg }, sortie);
    if (!Number.isInteger(a.nbFeuillets) || a.nbFeuillets < 1) {
      sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre de feuillets doit \xEAtre un entier au moins \xE9gal \xE0 1." });
    }
    const tq = epaisseurElastomere(a) ?? 0;
    if (tq > 0 && Math.min(a.a, a.b) / tq < 3) {
      sortie.push({ niveau: "alerte", cible: appui.id, message: `Appareil tr\xE8s \xE9lanc\xE9 : \xE9paisseur d'\xE9lastom\xE8re ${fr.format(tq)} m pour un c\xF4t\xE9 de ${fr.format(Math.min(a.a, a.b))} m.` });
    }
    if (a.Gg < 0.7 || a.Gg > 1.2) {
      sortie.push({ niveau: "alerte", cible: appui.id, message: `Module Gg inhabituel (${fr.format(a.Gg)} MPa) ; valeur conventionnelle courante : 0,9 MPa.` });
    }
  } else {
    positifs(appui.id, { "La hauteur de l'appareil": a.hauteur }, sortie);
  }
}
function valider(p) {
  const sortie = [];
  const { tablier, appuis, site } = p;
  if (site.zone === 1 || site.categorie === "I") {
    sortie.push({
      niveau: "info",
      cible: "site",
      message: "Zone 1 ou cat\xE9gorie I : le pont n'est pas soumis aux r\xE8gles parasismiques (arr\xEAt\xE9 du 26/10/2011, art. 3). Le calcul reste possible \xE0 titre indicatif."
    });
  }
  if (!(site.ST >= 1)) sortie.push({ niveau: "erreur", cible: "site", message: "Le coefficient topographique S_T doit \xEAtre au moins \xE9gal \xE0 1." });
  const c = p.comportement;
  for (const [nom, q] of [["longitudinal", c.qLongitudinal], ["transversal", c.qTransversal]]) {
    if (!(q >= 1)) sortie.push({ niveau: "erreur", cible: "comportement", message: `Le coefficient de comportement ${nom} doit \xEAtre au moins \xE9gal \xE0 1.` });
    else if (q > 1.5) {
      sortie.push({ niveau: "alerte", cible: "comportement", message: `q ${nom} = ${fr.format(q)} > 1,5 : conception ductile, hors du p\xE9rim\xE8tre de la V1 (dimensionnement en capacit\xE9 non trait\xE9).` });
    }
  }
  const surElastomeres = appuis.length > 0 && appuis.every((a) => a.appareils.type === "elastomere");
  if (surElastomeres && c.qLongitudinal > 1) {
    sortie.push({ niveau: "alerte", cible: "comportement", message: "Tablier enti\xE8rement sur appareils en \xE9lastom\xE8re : le guide retient q = 1 dans la direction longitudinale." });
  }
  if (surElastomeres && c.qTransversal > 1 && !appuis.some((a) => a.butees.transversales)) {
    sortie.push({ niveau: "alerte", cible: "comportement", message: "Aucun blocage transversal : avec des appareils en \xE9lastom\xE8re seuls, le guide retient q = 1 dans la direction transversale." });
  }
  if (!(c.amortissement > 0 && c.amortissement <= 30)) {
    sortie.push({ niveau: "erreur", cible: "comportement", message: "L'amortissement doit \xEAtre compris entre 0 et 30 %." });
  }
  positifs("mat\xE9riaux", { "fck": p.materiaux.beton.fck, "La masse volumique du b\xE9ton": p.materiaux.beton.masseVolumique, "fyk": p.materiaux.acier.fyk }, sortie);
  if (!(p.options.g > 9 && p.options.g < 11)) sortie.push({ niveau: "erreur", cible: "options", message: "g doit \xEAtre compris entre 9 et 11 m/s\xB2." });
  if (tablier.travees.length < 1) sortie.push({ niveau: "erreur", cible: "tablier", message: "Le tablier doit comporter au moins une trav\xE9e." });
  tablier.travees.forEach((t, i) => {
    if (!(t > 0)) sortie.push({ niveau: "erreur", cible: "tablier", message: `La port\xE9e de la trav\xE9e ${i + 1} doit \xEAtre strictement positive.` });
  });
  positifs("tablier", { "La largeur du tablier": tablier.largeur, "L'\xE9paisseur du tablier": tablier.epaisseur, "L'aire de la section": tablier.aire }, sortie);
  if (tablier.aire > tablier.largeur * tablier.epaisseur * 1.001) {
    sortie.push({ niveau: "alerte", cible: "tablier", message: "L'aire de la section d\xE9passe largeur \xD7 \xE9paisseur." });
  }
  if (tablier.superstructures < 0) sortie.push({ niveau: "erreur", cible: "tablier", message: "Le poids des superstructures ne peut pas \xEAtre n\xE9gatif." });
  if (tablier.debordAbout < 0) sortie.push({ niveau: "erreur", cible: "tablier", message: "Le d\xE9bord d'about ne peut pas \xEAtre n\xE9gatif." });
  if (appuis.length !== tablier.travees.length + 1) {
    sortie.push({ niveau: "erreur", cible: "appuis", message: `Il faut ${tablier.travees.length + 1} appuis pour ${tablier.travees.length} trav\xE9e(s) ; ${appuis.length} sont d\xE9finis.` });
  }
  appuis.forEach((appui, i) => {
    const extremite = i === 0 || i === appuis.length - 1;
    if (extremite && appui.type !== "culee") sortie.push({ niveau: "erreur", cible: appui.id, message: "Les appuis d'extr\xE9mit\xE9 doivent \xEAtre des cul\xE9es." });
    if (!extremite && appui.type !== "pile") sortie.push({ niveau: "erreur", cible: appui.id, message: "Les appuis interm\xE9diaires doivent \xEAtre des piles." });
  });
  const ids = appuis.map((a) => a.id);
  if (new Set(ids).size !== ids.length) sortie.push({ niveau: "erreur", cible: "appuis", message: "Deux appuis portent le m\xEAme nom." });
  for (const appui of appuis) {
    controlerAppareils(appui, appui.appareils, sortie);
    if (appui.type === "pile") {
      const { futs, semelle } = appui;
      positifs(appui.id, { "La hauteur des f\xFBts": futs.hauteur, "La dimension longitudinale des f\xFBts": futs.long, "La dimension transversale des f\xFBts": futs.trans }, sortie);
      positifs(appui.id, { "La semelle (longueur)": semelle.long, "La semelle (largeur)": semelle.trans, "La semelle (\xE9paisseur)": semelle.epaisseur }, sortie);
      if (!Number.isInteger(futs.nombre) || futs.nombre < 1) sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre de f\xFBts doit \xEAtre un entier au moins \xE9gal \xE0 1." });
      const largeurFuts = (futs.nombre - 1) * futs.entraxe + (futs.forme === "circulaire" ? futs.long : futs.trans);
      if (futs.nombre > 1 && futs.entraxe < (futs.forme === "circulaire" ? futs.long : futs.trans)) {
        sortie.push({ niveau: "erreur", cible: appui.id, message: "L'entraxe des f\xFBts est inf\xE9rieur \xE0 leur largeur : les f\xFBts se chevauchent." });
      }
      if (largeurFuts > tablier.largeur) sortie.push({ niveau: "alerte", cible: appui.id, message: `Les f\xFBts (${fr.format(largeurFuts)} m) d\xE9bordent de la largeur du tablier.` });
      if (semelle.long < futs.long || semelle.trans < largeurFuts) sortie.push({ niveau: "alerte", cible: appui.id, message: "La semelle ne couvre pas l'emprise des f\xFBts." });
      if (appui.appareils.a > futs.long) sortie.push({ niveau: "alerte", cible: appui.id, message: "Les appareils d'appui d\xE9bordent de l'\xE9paisseur des f\xFBts." });
      if (appui.appareils.nombre % futs.nombre !== 0) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "Le nombre d'appareils n'est pas un multiple du nombre de f\xFBts : r\xE9partition uniforme sur la largeur." });
      }
      if (futs.hauteur / Math.min(futs.long, futs.forme === "circulaire" ? futs.long : futs.trans) > 25) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "F\xFBts tr\xE8s \xE9lanc\xE9s : v\xE9rifier la pertinence de la m\xE9thode du mode fondamental et les effets du second ordre." });
      }
    } else {
      const { poteaux, sommier, semelle } = appui;
      positifs(appui.id, { "La hauteur des poteaux": poteaux.hauteur, "Le c\xF4t\xE9 des poteaux": poteaux.cote, "Le sommier (longueur)": sommier.long, "Le sommier (hauteur)": sommier.haut, "Le sommier (largeur)": sommier.trans }, sortie);
      positifs(appui.id, { "La semelle (longueur)": semelle.long, "La semelle (largeur)": semelle.trans, "La semelle (\xE9paisseur)": semelle.epaisseur }, sortie);
      if (!Number.isInteger(poteaux.nombre) || poteaux.nombre < 1) sortie.push({ niveau: "erreur", cible: appui.id, message: "Le nombre de poteaux doit \xEAtre un entier au moins \xE9gal \xE0 1." });
      if (poteaux.nombre > 1 && poteaux.entraxe < poteaux.cote) sortie.push({ niveau: "erreur", cible: appui.id, message: "L'entraxe des poteaux est inf\xE9rieur \xE0 leur c\xF4t\xE9." });
      const faceGardeGreve = sommier.long - poteaux.cote / 2 - sommier.debordAvant - appui.gardeGreve.retrait - appui.gardeGreve.epaisseur;
      if (appui.excentrementAppui + appui.appareils.a / 2 > faceGardeGreve) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "L'appareil d'appui empi\xE8te sur le mur garde-gr\xE8ve." });
      }
      if (appui.excentrementAppui + tablier.debordAbout >= faceGardeGreve) {
        sortie.push({ niveau: "alerte", cible: appui.id, message: "Le tablier touche le mur garde-gr\xE8ve : r\xE9duire le d\xE9bord d'about ou reculer le garde-gr\xE8ve." });
      }
    }
  }
  return sortie;
}

// src/referentiel/action.ts
var BETA = {
  id: "beta",
  type: "scalaire",
  etape: "action_sismique",
  libelle: "Limite inf\xE9rieure du spectre de calcul horizontal",
  symbole: "\\beta",
  unite: "-",
  valeur: 0.2,
  references: [
    { source: "NF_EN_1998_1", localisation: "3.2.2.5(4)P, note", etat: "a_confirmer" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.2.5(4)P", page: "7" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 \xA72.5", page: "82" }
  ],
  statut: "via_guide",
  note: "L'AN de l'EN 1998-1 renvoie aux AN des autres parties pour les ouvrages autres que les b\xE2timents ; l'AN de l'EN 1998-2 ne fixe pas \u03B2. Le guide retient la valeur recommand\xE9e 0,2."
};
var TE_TF = {
  id: "TE_TF",
  type: "table",
  etape: "action_sismique",
  libelle: "P\xE9riodes de coin du spectre en d\xE9placement",
  symbole: "T_E,\\ T_F",
  unite: "s",
  cles: ["classe de sol"],
  valeurs: {
    A: { TE: 4.5, TF: 10 },
    B: { TE: 5, TF: 10 },
    C: { TE: 6, TF: 10 },
    D: { TE: 6, TF: 10 },
    E: { TE: 6, TF: 10 }
  },
  references: [
    { source: "NF_EN_1998_1", localisation: "annexe A, tableau A.1", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 \xA72.5, tableau 14", page: "84" }
  ],
  statut: "via_guide"
};

// src/referentiel/nationaux.ts
var groupeDeZone = (zone) => zone === 5 ? "zone_5" : "zones_2_a_4";
var GAMMA_I = {
  id: "gamma_I",
  type: "table",
  etape: "classification",
  libelle: "Coefficient d'importance",
  symbole: "\\gamma_I",
  unite: "-",
  cles: ["cat\xE9gorie d'importance"],
  valeurs: { II: 1, III: 1.2, IV: 1.4 },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 I, tableau" },
    { source: "NF_EN_1998_2_NA", localisation: "2.1(6)", page: "6" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction \xA72.2.3", page: "12" }
  ],
  statut: "via_guide"
};
var AGR = {
  id: "agr",
  type: "table",
  etape: "action_sismique",
  libelle: "Acc\xE9l\xE9ration maximale de r\xE9f\xE9rence au rocher (sol de classe A)",
  symbole: "a_{gR}",
  unite: "m/s\xB2",
  cles: ["zone de sismicit\xE9"],
  valeurs: { 2: 0.7, 3: 1.1, 4: 1.6, 5: 3 },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II a)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.1(2)", page: "6" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction \xA72.2.3", page: "12" }
  ],
  statut: "via_guide"
};
var PARAMETRE_SOL_S = {
  id: "S",
  type: "table",
  etape: "action_sismique",
  libelle: "Param\xE8tre de sol (composantes horizontales)",
  symbole: "S",
  unite: "-",
  cles: ["groupe de zones", "classe de sol"],
  valeurs: {
    zones_2_a_4: { A: 1, B: 1.35, C: 1.5, D: 1.6, E: 1.8 },
    zone_5: { A: 1, B: 1.2, C: 1.15, D: 1.35, E: 1.4 }
  },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II c)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.1.2(1) et 3.2.2.2(2)P", page: "6-7" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction \xA72.2.3", page: "12" }
  ],
  statut: "via_guide",
  note: "La classe de sol est d\xE9finie au tableau 3.1 de NF EN 1998-1."
};
var PERIODES_HORIZONTALES = {
  id: "periodes_horizontales",
  type: "table",
  etape: "action_sismique",
  libelle: "P\xE9riodes de coin du spectre \xE9lastique horizontal",
  symbole: "T_B,\\ T_C,\\ T_D",
  unite: "s",
  cles: ["groupe de zones", "classe de sol"],
  valeurs: {
    zones_2_a_4: {
      A: { TB: 0.03, TC: 0.2, TD: 2.5 },
      B: { TB: 0.05, TC: 0.25, TD: 2.5 },
      C: { TB: 0.06, TC: 0.4, TD: 2 },
      D: { TB: 0.1, TC: 0.6, TD: 1.5 },
      E: { TB: 0.08, TC: 0.45, TD: 1.25 }
    },
    zone_5: {
      A: { TB: 0.15, TC: 0.4, TD: 2 },
      B: { TB: 0.15, TC: 0.5, TD: 2 },
      C: { TB: 0.2, TC: 0.6, TD: 2 },
      D: { TB: 0.2, TC: 0.8, TD: 2 },
      E: { TB: 0.15, TC: 0.5, TD: 2 }
    }
  },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II d)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.2.2(2)P", page: "7" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction \xA72.2.3", page: "13" }
  ],
  statut: "via_guide"
};
var SPECTRE_VERTICAL = {
  id: "spectre_vertical",
  type: "table",
  etape: "action_sismique",
  libelle: "Param\xE8tres du spectre \xE9lastique vertical",
  symbole: "a_{vg}/a_g,\\ T_B,\\ T_C,\\ T_D",
  unite: "-, s",
  cles: ["groupe de zones"],
  valeurs: {
    zones_2_a_4: { rapport: 0.9, TB: 0.03, TC: 0.2, TD: 2.5 },
    zone_5: { rapport: 0.8, TB: 0.15, TC: 0.4, TD: 2 }
  },
  references: [
    { source: "ARRETE_2011", localisation: "art. 4 II e)" },
    { source: "NF_EN_1998_1_NA", localisation: "3.2.2.3(1)P", page: "7" },
    { source: "GUIDE_CEREMA_2015", localisation: "Introduction \xA72.2.3", page: "13" }
  ],
  statut: "via_guide"
};
var PSI_21 = {
  id: "psi_21",
  type: "table",
  etape: "modele",
  libelle: "Coefficient \u03C82,1 des charges de trafic concomitantes au s\xE9isme (masses et combinaison)",
  symbole: "\\psi_{2,1}",
  unite: "-",
  cles: ["type de pont et de trafic"],
  valeurs: { cas_general: 0, routier_trafic_intense: 0.2, ferroviaire_trafic_intense: 0.3 },
  references: [
    { source: "NF_EN_1998_2_NA", localisation: "4.1.2(4)P", page: "7" },
    { source: "NF_EN_1998_2", localisation: "4.1.2(4)P, valeurs recommand\xE9es", etat: "a_confirmer" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 \xA73.3 et \xA74.2", page: "91, 95" }
  ],
  statut: "via_guide",
  note: "L'AN retient les valeurs recommand\xE9es de l'EN ; leurs valeurs num\xE9riques sont reprises du guide. 0,2 vise les ponts routiers urbains \xE0 trafic intense (LM1)."
};
var TEMPERATURE_MIN_ISOLATEUR = {
  id: "delta_T1_isolateur",
  type: "table",
  etape: "verif_appareils_appui",
  libelle: "\u0394T1 pour la temp\xE9rature minimale d'un isolateur, Tmin,b = T0 \u2212 \u03C82(T0 \u2212 Tmin) + \u0394T1 avec \u03C82 = 0,50",
  symbole: "\\Delta T_1",
  unite: "\xB0C",
  cles: ["mat\xE9riau du tablier"],
  valeurs: { beton: 7.5, mixte: 5, acier: -2.5 },
  references: [{ source: "NF_EN_1998_2_NA", localisation: "J.1(2), tableau J.1 N", page: "9" }],
  statut: "verifie",
  note: "Tmin selon EN 1991-1-5 6.1.3.2 (probabilit\xE9 annuelle de d\xE9passement 0,02)."
};

// src/moteur/note.ts
var formats = /* @__PURE__ */ new Map();
function nombre(v, decimales = 3) {
  let f = formats.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimales });
    formats.set(decimales, f);
  }
  return f.format(v);
}
function tex(v, decimales = 3) {
  return nombre(v, decimales).replace(",", "{,}").replace(/ | /g, "\\,");
}

// src/moteur/spectres.ts
function valeur(f, T) {
  if (!(T >= 0)) return Number.NaN;
  let k;
  if (T <= f.TB) k = f.plateauOrigine ? f.plateau : f.depart + T / f.TB * (f.plateau - f.depart);
  else if (T <= f.TC) k = f.plateau;
  else if (T <= f.TD) k = f.plateau * f.TC / T;
  else k = f.plateau * f.TC * f.TD / (T * T);
  const v = f.amplitude * k;
  return f.plancher !== void 0 && T >= f.TC ? Math.max(v, f.plancher) : v;
}

// src/moteur/action.ts
function actionSismique(p) {
  const { site, comportement } = p;
  const G = p.options.g;
  const soumis = site.zone !== 1 && site.categorie !== "I";
  const zoneCalcul = site.zone === 1 ? 2 : site.zone;
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
  const elastiqueH = { amplitude: ag * S * ST, TB, TC, TD, plateau: 2.5 * eta, depart: 1, plateauOrigine };
  const calcul = (qd) => ({
    amplitude: ag * S * ST,
    TB,
    TC,
    TD,
    plateau: 2.5 / qd,
    depart: 2 / 3,
    plancher: beta * ag,
    plateauOrigine
  });
  const elastiqueV = { amplitude: avg * ST, TB: vertical.TB, TC: vertical.TC, TD: vertical.TD, plateau: 3 * eta, depart: 1, plateauOrigine };
  const spectres = { elastiqueH, calculLong: calcul(q.longitudinal), calculTrans: calcul(q.transversal), elastiqueV };
  const plateaux = {
    Se: valeur(elastiqueH, TB),
    SdLong: valeur(spectres.calculLong, TB),
    SdTrans: valeur(spectres.calculTrans, TB),
    Sve: valeur(elastiqueV, vertical.TB)
  };
  const d = derives(p);
  const surfaceBreche = d.longueur * p.tablier.largeur;
  const agSsurG = ag * S / G;
  const categoriePetite = site.categorie === "I" || site.categorie === "II";
  const faibleSismicite = categoriePetite && (surfaceBreche < 150 || agSsurG <= 0.15) ? {
    applicable: true,
    motif: `Cat\xE9gorie ${site.categorie} et ${surfaceBreche < 150 ? `surface de br\xE8che ${nombre(surfaceBreche, 0)} m\xB2 < 150 m\xB2` : `ag\xB7S = ${nombre(agSsurG, 3)} g \u2264 0,15 g`} : m\xE9thode statique \xE9quivalente admise avec une acc\xE9l\xE9ration uniforme ag\xB7S.`
  } : {
    applicable: false,
    motif: categoriePetite ? `Surface de br\xE8che ${nombre(surfaceBreche, 0)} m\xB2 \u2265 150 m\xB2 et ag\xB7S = ${nombre(agSsurG, 3)} g > 0,15 g : m\xE9thode simplifi\xE9e non admise.` : `Cat\xE9gorie ${site.categorie} : m\xE9thode simplifi\xE9e r\xE9serv\xE9e aux cat\xE9gories I et II.`
  };
  const lignesClassification = [
    {
      id: "soumission",
      titre: "Application des r\xE8gles parasismiques",
      resultat: { symbole: `\\text{Zone ${site.zone}, cat\xE9gorie ${site.categorie}}`, valeur: soumis ? "soumis" : "non soumis" },
      references: ["exemption", "champ_application"],
      commentaire: soumis ? "Pont nouveau d\xE9finitif de cat\xE9gorie II \xE0 IV en zone 2 \xE0 5 : r\xE8gles de l'article 4 applicables." : "Pont non soumis aux r\xE8gles parasismiques ; le calcul est men\xE9 \xE0 titre indicatif avec les param\xE8tres de la zone 2 et de la cat\xE9gorie II.",
      niveau: soumis ? void 0 : "alerte"
    },
    {
      id: "gamma_I",
      titre: "Coefficient d'importance",
      resultat: { symbole: "\\gamma_I", valeur: gammaI, decimales: 2 },
      references: ["gamma_I", "categories_importance"],
      commentaire: `Cat\xE9gorie d'importance ${categorie}.`
    }
  ];
  const lignesAcceleration = [
    {
      id: "agr",
      titre: "Acc\xE9l\xE9ration de r\xE9f\xE9rence au rocher",
      resultat: { symbole: "a_{gR}", valeur: agr, unite: "m/s\xB2", decimales: 2 },
      references: ["agr"],
      commentaire: `Zone de sismicit\xE9 ${zoneCalcul}.`
    },
    {
      id: "ag",
      titre: "Acc\xE9l\xE9ration horizontale de calcul au rocher",
      formule: "a_g = \\gamma_I \\cdot a_{gR}",
      application: `${tex(gammaI, 2)} \\times ${tex(agr, 2)}`,
      resultat: { symbole: "a_g", valeur: ag, unite: "m/s\xB2", decimales: 3 },
      references: ["ag"],
      commentaire: `Soit ${nombre(ag / G, 3)} g.`
    },
    {
      id: "avg",
      titre: "Acc\xE9l\xE9ration verticale de calcul",
      formule: `a_{vg} = ${tex(vertical.rapport, 2)}\\,a_g`,
      application: `${tex(vertical.rapport, 2)} \\times ${tex(ag, 3)}`,
      resultat: { symbole: "a_{vg}", valeur: avg, unite: "m/s\xB2", decimales: 3 },
      references: ["avg", "spectre_vertical"]
    }
  ];
  const lignesSite = [
    {
      id: "sol",
      titre: "Param\xE8tres du spectre horizontal",
      resultat: { symbole: `\\text{sol } ${site.classeSol}`, valeur: `S = ${nombre(S, 2)} ; TB = ${nombre(TB, 2)} s ; TC = ${nombre(TC, 2)} s ; TD = ${nombre(TD, 2)} s` },
      references: ["S", "periodes_horizontales", "classes_sol"],
      commentaire: groupe === "zone_5" ? "Valeurs de la zone 5." : "Valeurs des zones 2 \xE0 4."
    },
    {
      id: "ST",
      titre: "Coefficient d'amplification topographique",
      resultat: { symbole: "S_T", valeur: ST, decimales: 2 },
      references: ["ST"]
    },
    {
      id: "faible_sismicite",
      titre: "M\xE9thode simplifi\xE9e des zones \xE0 sismicit\xE9 faible",
      formule: "\\dfrac{a_g\\,S}{g} \\le 0{,}15 \\ \\text{ou}\\ L \\cdot B < 150\\ \\text{m}^2",
      application: `\\dfrac{${tex(ag, 3)} \\times ${tex(S, 2)}}{${tex(G, 2)}} = ${tex(agSsurG, 3)}, \\qquad ${tex(d.longueur, 2)} \\times ${tex(p.tablier.largeur, 2)} = ${tex(surfaceBreche, 0)}\\ \\text{m}^2`,
      resultat: { symbole: "\\text{m\xE9thode simplifi\xE9e}", valeur: faibleSismicite.applicable ? "admise" : "non admise" },
      references: ["faible_sismicite_methode_simplifiee"],
      commentaire: faibleSismicite.motif,
      niveau: "info"
    }
  ];
  const lignesAmortissement = [
    {
      id: "eta",
      titre: "Correction de l'amortissement",
      formule: "\\eta = \\sqrt{\\dfrac{10}{5 + \\xi}} \\ge 0{,}55",
      application: `\\sqrt{\\dfrac{10}{5 + ${tex(xi, 1)}}}`,
      resultat: { symbole: "\\eta", valeur: eta, decimales: 3 },
      references: ["eta", "amortissement_materiaux"],
      commentaire: `Amortissement retenu \u03BE = ${nombre(xi, 1)} %.`
    }
  ];
  const commentairePlateau = plateauOrigine ? "Plateau prolong\xE9 jusqu'\xE0 T = 0, comme le recommande le guide Cerema." : "Forme de l'EN 1998-1 : branche croissante de 0 \xE0 TB.";
  const lignesHorizontal = [
    {
      id: "Se_plateau",
      titre: "Plateau du spectre \xE9lastique horizontal",
      formule: "S_e(T_B \\le T \\le T_C) = a_g\\,S\\,S_T \\cdot 2{,}5\\,\\eta",
      application: `${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times 2{,}5 \\times ${tex(eta, 3)}`,
      resultat: { symbole: "S_e", valeur: plateaux.Se, unite: "m/s\xB2", decimales: 3 },
      references: ["Se", "plateau_origine"],
      commentaire: commentairePlateau
    },
    {
      id: "Se_0",
      titre: "Valeur \xE0 p\xE9riode nulle",
      formule: plateauOrigine ? "S_e(0) = S_e(T_B)" : "S_e(0) = a_g\\,S\\,S_T",
      resultat: { symbole: "S_e(0)", valeur: valeur(elastiqueH, 0), unite: "m/s\xB2", decimales: 3 },
      references: plateauOrigine ? ["plateau_origine"] : ["Se"]
    },
    {
      id: "dg",
      titre: "D\xE9placement de calcul du sol",
      formule: "d_g = 0{,}025\\,a_g\\,S\\,S_T\\,T_C\\,T_D",
      application: `0{,}025 \\times ${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times ${tex(TC, 2)} \\times ${tex(TD, 2)}`,
      resultat: { symbole: "d_g", valeur: dg, unite: "m", decimales: 4 },
      references: ["dg"]
    },
    {
      id: "SDe",
      titre: "Spectre \xE9lastique en d\xE9placement",
      formule: "S_{De}(T) = S_e(T)\\left(\\dfrac{T}{2\\pi}\\right)^2 \\quad (T \\le 4\\ \\text{s})",
      resultat: { symbole: "T_E,\\ T_F", valeur: `${nombre(TE, 1)} s ; ${nombre(TF, 1)} s` },
      references: ["SDe", "TE_TF", "SDe_longues_periodes"],
      commentaire: "Au-del\xE0 de 4 s : annexe A de l'EN 1998-1 (informative)."
    }
  ];
  const ligneCalcul = (direction, qd, plateau) => ({
    id: `Sd_${direction}`,
    titre: `Plateau du spectre de calcul, direction ${direction}e`,
    formule: "S_d(T_B \\le T \\le T_C) = a_g\\,S\\,S_T\\,\\dfrac{2{,}5}{q}",
    application: `${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times \\dfrac{2{,}5}{${tex(qd, 2)}}`,
    resultat: { symbole: `S_{d,${direction === "longitudinal" ? "x" : "y"}}`, valeur: plateau, unite: "m/s\xB2", decimales: 3 },
    references: ["Sd", "q_max", "plateau_origine"],
    commentaire: qd === 1 ? "q = 1 : le spectre de calcul se confond avec le spectre \xE9lastique (\u03B7 = 1)." : qd <= 1.5 ? `q = ${nombre(qd, 2)} : conception \xE0 ductilit\xE9 limit\xE9e.` : `q = ${nombre(qd, 2)} > 1,5 : conception ductile, hors du p\xE9rim\xE8tre de la V1.`,
    niveau: qd > 1.5 ? "alerte" : void 0
  });
  const lignesCalcul = [
    ligneCalcul("longitudinal", q.longitudinal, plateaux.SdLong),
    ligneCalcul("transversal", q.transversal, plateaux.SdTrans),
    {
      id: "plancher",
      titre: "Limite inf\xE9rieure du spectre de calcul",
      formule: "S_d(T \\ge T_C) \\ge \\beta\\,a_g",
      application: `${tex(beta, 2)} \\times ${tex(ag, 3)}`,
      resultat: { symbole: "\\beta\\,a_g", valeur: beta * ag, unite: "m/s\xB2", decimales: 3 },
      references: ["beta", "Sd"]
    }
  ];
  const lignesVertical = [
    {
      id: "vertical_parametres",
      titre: "Param\xE8tres du spectre vertical",
      resultat: { symbole: "T_B,\\ T_C,\\ T_D", valeur: `${nombre(vertical.TB, 2)} s ; ${nombre(vertical.TC, 2)} s ; ${nombre(vertical.TD, 2)} s` },
      references: ["spectre_vertical", "sol_composante_verticale"],
      commentaire: "Ind\xE9pendants de la classe de sol."
    },
    {
      id: "q_vertical",
      titre: "Coefficient de comportement vertical",
      resultat: { symbole: "q_z", valeur: 1, decimales: 1 },
      references: ["q_vertical"]
    },
    {
      id: "Sve_plateau",
      titre: "Plateau du spectre \xE9lastique vertical",
      formule: "S_{ve}(T_B \\le T \\le T_C) = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
      application: `${tex(avg, 3)} \\times ${tex(ST, 2)} \\times 3{,}0 \\times ${tex(eta, 3)}`,
      resultat: { symbole: "S_{ve}", valeur: plateaux.Sve, unite: "m/s\xB2", decimales: 3 },
      references: ["Sve", "plateau_origine"],
      commentaire: "\xC0 consid\xE9rer au moins pour les appareils d'appui et les attelages ; pour les tabliers pr\xE9contraints ; et, en zones 4 et 5, pour les piles sous conditions."
    }
  ];
  const note = [
    { id: "classification", titre: "Classification", lignes: lignesClassification },
    { id: "accelerations", titre: "Acc\xE9l\xE9rations de calcul", lignes: lignesAcceleration },
    { id: "site", titre: "Sol et site", lignes: lignesSite },
    { id: "amortissement", titre: "Amortissement", lignes: lignesAmortissement },
    { id: "horizontal", titre: "Spectre \xE9lastique horizontal", lignes: lignesHorizontal },
    { id: "calcul", titre: "Spectres de calcul", lignes: lignesCalcul },
    { id: "vertical", titre: "Spectre vertical", lignes: lignesVertical }
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
    note
  };
}

// src/moteur/modele.ts
var inverse = (k) => k === Infinity ? 0 : k === 0 ? Infinity : 1 / k;
var serie = (...ks) => inverse(ks.reduce((s, k) => s + inverse(k), 0));
var fmtK = (k, d = 2) => k === Infinity ? "\\infty" : tex(k, d);
var txtK = (k) => k === Infinity ? "rigide" : `${nombre(k, 2)} MN/m`;
function inerties(appui) {
  const { forme, long, trans } = appui.futs;
  if (forme === "circulaire") {
    const I = Math.PI * long ** 4 / 64;
    return { Ix: I, Iy: I, aire: Math.PI * long ** 2 / 4 };
  }
  return { Ix: trans * long ** 3 / 12, Iy: long * trans ** 3 / 12, aire: long * trans };
}
function modele(p) {
  const d = derives(p);
  const fck = p.materiaux.beton.fck;
  const Ecm = 22 * ((fck + 8) / 10) ** 0.3 * 1e3;
  const E = Ecm;
  const ligneEcm = {
    id: "Ecm",
    titre: "Module d'\xE9lasticit\xE9 instantan\xE9 du b\xE9ton",
    formule: "E_{cm} = 22\\left(\\dfrac{f_{ck} + 8}{10}\\right)^{0{,}3}",
    application: `22\\left(\\dfrac{${tex(fck, 0)} + 8}{10}\\right)^{0{,}3} \\times 1000`,
    resultat: { symbole: "E_{cm}", valeur: Ecm, unite: "MPa", decimales: 0 },
    references: ["Ecm"]
  };
  const psi21 = PSI_21.valeurs[p.site.trafic];
  const masseTablier = d.masseTablier;
  const masseTrafic = psi21 * p.tablier.chargeTrafic * d.longueur / p.options.g;
  const piles = p.appuis.filter((a) => a.type === "pile").map((pile) => {
    const masseFuts = pile.futs.nombre * inerties(pile).aire * pile.futs.hauteur * p.materiaux.beton.masseVolumique;
    return { id: pile.id, masseFuts, ajoutTablier: pile.appareils.type === "fixe" ? masseFuts / 2 : 0 };
  });
  const ajoutPiles = piles.reduce((s, x) => s + x.ajoutTablier, 0);
  const M = masseTablier + masseTrafic + ajoutPiles;
  const lignesMasses = [
    {
      id: "masse_tablier",
      titre: "Masse du tablier",
      formule: "M_{tablier} = \\dfrac{\\rho\\,A\\,g + g_{sup}}{g}\\,L",
      application: `\\dfrac{${tex(p.materiaux.beton.masseVolumique, 2)} \\times ${tex(p.tablier.aire, 3)} \\times ${tex(p.options.g, 2)} + ${tex(p.tablier.superstructures, 2)}}{${tex(p.options.g, 2)}} \\times ${tex(d.longueur, 3)}`,
      resultat: { symbole: "M_{tablier}", valeur: masseTablier, unite: "t", decimales: 1 },
      references: ["masses_sismiques"],
      commentaire: `Masse lin\xE9ique ${nombre(d.masseLineique, 3)} t/m, compt\xE9e entre les axes d'appui des cul\xE9es.`
    },
    {
      id: "masse_trafic",
      titre: "Part des charges de trafic",
      formule: "M_{trafic} = \\psi_{2,1}\\,\\dfrac{q_{trafic}\\,L}{g}",
      application: `${tex(psi21, 1)} \\times \\dfrac{${tex(p.tablier.chargeTrafic, 1)} \\times ${tex(d.longueur, 3)}}{${tex(p.options.g, 2)}}`,
      resultat: { symbole: "M_{trafic}", valeur: masseTrafic, unite: "t", decimales: 1 },
      references: ["psi_21"]
    }
  ];
  if (ajoutPiles > 0) {
    lignesMasses.push({
      id: "masse_piles",
      titre: "Demi-masse des piles sous appareils fixes",
      resultat: { symbole: "\\sum \\tfrac{1}{2} M_{f\xFBts}", valeur: ajoutPiles, unite: "t", decimales: 1 },
      references: ["masses_sismiques"],
      commentaire: piles.filter((x) => x.ajoutTablier > 0).map((x) => `${x.id} : ${nombre(x.ajoutTablier, 1)} t`).join(" ; ")
    });
  }
  lignesMasses.push({
    id: "masse_sismique",
    titre: "Masse sismique",
    formule: "M = M_{tablier} + M_{trafic}" + (ajoutPiles > 0 ? " + \\sum \\tfrac{1}{2} M_{f\xFBts}" : ""),
    resultat: { symbole: "M", valeur: M, unite: "t", decimales: 1 },
    references: ["masses_sismiques"],
    commentaire: `Masse propre des f\xFBts (trait\xE9e s\xE9par\xE9ment pour les piles sur appareils souples) : ${piles.map((x) => `${x.id} ${nombre(x.masseFuts, 1)} t`).join(", ") || "aucune pile"}.`
  });
  const elastomere = p.appuis.find((a) => a.appareils.type === "elastomere")?.appareils;
  let elastomeres = null;
  const lignesG = [];
  if (elastomere && elastomere.type === "elastomere") {
    const Gg = elastomere.Gg;
    const Gb = 1.1 * Gg;
    const materiau = p.tablier.type === "mixte" ? "mixte" : "beton";
    const dT1 = TEMPERATURE_MIN_ISOLATEUR.valeurs[materiau];
    const { T0, Tmin, lambdaMaxF1, lambdaMaxF2, psiFi } = p.elastomeres;
    const Tminb = T0 - 0.5 * (T0 - Tmin) + dT1;
    const lambdaU1 = 1 + (lambdaMaxF1 - 1) * psiFi;
    const lambdaU2 = 1 + (lambdaMaxF2 - 1) * psiFi;
    const regle = Tminb >= 0 ? "1,2 Gb" : "\u03BB";
    const GbMax = regle === "1,2 Gb" ? 1.2 * Gb : lambdaU1 * lambdaU2 * Gb;
    elastomeres = { Gg, Gb, Tminb, lambdaU1, lambdaU2, GbMax, regle, G: { lbdp: Gb, ubdp: GbMax } };
    lignesG.push(
      {
        id: "Gb",
        titre: "Module de cisaillement nominal",
        formule: "G_b = 1{,}1\\,G_g",
        application: `1{,}1 \\times ${tex(Gg, 2)}`,
        resultat: { symbole: "G_b", valeur: Gb, unite: "MPa", decimales: 3 },
        references: ["module_G_elastomere"],
        commentaire: "Propri\xE9t\xE9s limites inf\xE9rieures (LBDP) : Gb,min = Gb."
      },
      {
        id: "Tminb",
        titre: "Temp\xE9rature minimale des appareils",
        formule: "T_{min,b} = T_0 - \\psi_2\\,(T_0 - T_{min}) + \\Delta T_1",
        application: `${tex(T0, 1)} - 0{,}5 \\times (${tex(T0, 1)} - (${tex(Tmin, 1)})) + ${tex(dT1, 1)}`,
        resultat: { symbole: "T_{min,b}", valeur: Tminb, unite: "\xB0C", decimales: 2 },
        references: ["Tmin_b", "delta_T1_isolateur"],
        commentaire: `Tablier ${materiau === "mixte" ? "mixte" : "en b\xE9ton"} : \u0394T1 = ${nombre(dT1, 1)} \xB0C.`
      }
    );
    if (regle === "\u03BB") {
      lignesG.push(
        {
          id: "lambdaU",
          titre: "Facteurs de modification (vieillissement et temp\xE9rature)",
          formule: "\\lambda_{U,fi} = 1 + (\\lambda_{max,fi} - 1)\\,\\psi_{fi}",
          application: `1 + (${tex(lambdaMaxF1, 2)} - 1) \\times ${tex(psiFi, 2)}`,
          resultat: { symbole: "\\lambda_{U,f1}", valeur: lambdaU1, decimales: 4 },
          references: ["lambda_U"],
          commentaire: `\u03BBU,f2 = ${nombre(lambdaU2, 4)} (\u03BBmax,f2 = ${nombre(lambdaMaxF2, 2)}).`
        },
        {
          id: "GbMax",
          titre: "Module en propri\xE9t\xE9s limites sup\xE9rieures (UBDP)",
          formule: "G_{b,max} = \\lambda_{U,f1}\\,\\lambda_{U,f2}\\,G_b",
          application: `${tex(lambdaU1, 4)} \\times ${tex(lambdaU2, 4)} \\times ${tex(Gb, 3)}`,
          resultat: { symbole: "G_{b,max}", valeur: GbMax, unite: "MPa", decimales: 3 },
          references: ["lambda_U", "bornes_G_elastomere"],
          commentaire: "Tmin,b < 0 \xB0C : facteurs \u03BB des tableaux JJ.1 et JJ.2."
        }
      );
    } else {
      lignesG.push({
        id: "GbMax",
        titre: "Module en propri\xE9t\xE9s limites sup\xE9rieures (UBDP)",
        formule: "G_{b,max} = 1{,}2\\,G_b",
        application: `1{,}2 \\times ${tex(Gb, 3)}`,
        resultat: { symbole: "G_{b,max}", valeur: GbMax, unite: "MPa", decimales: 3 },
        references: ["bornes_G_elastomere"],
        commentaire: "Tmin,b \u2265 0 \xB0C."
      });
    }
  }
  const lignes = { x: [], y: [] };
  const raideurAppui = (appui, dir) => {
    const nomDir = dir === "x" ? "longitudinal" : "transversal";
    let kSupport;
    let descSupport;
    if (appui.type === "pile") {
      const { Ix, Iy } = inerties(appui);
      const I = dir === "x" ? Ix : Iy;
      const { nombre: n, hauteur: h } = appui.futs;
      kSupport = n * 3 * E * I / h ** 3;
      descSupport = `${n} f\xFBt(s) en console`;
      lignes[dir].push({
        id: `${appui.id}_${dir}_futs`,
        titre: `${appui.id} \u2014 raideur des f\xFBts (${nomDir})`,
        formule: "k_{f\xFBts} = n\\,\\dfrac{3\\,E\\,I}{h^3}",
        application: `${n} \\times \\dfrac{3 \\times ${tex(E, 0)} \\times ${tex(I, 5)}}{${tex(h, 2)}^3}`,
        resultat: { symbole: "k_{f\xFBts}", valeur: kSupport, unite: "MN/m", decimales: 2 },
        references: ["raideur_fut", "inerties_piles", "Ecm"],
        commentaire: "F\xFBts encastr\xE9s en pied (fondation rigide), libres en rotation en t\xEAte."
      });
    } else {
      const c = appui;
      const rigide = dir === "x" ? c.rigide.longitudinal : c.rigide.transversal;
      const { nombre: n, cote, hauteur: h } = c.poteaux;
      const I = cote ** 4 / 12;
      if (rigide) {
        kSupport = Infinity;
        descSupport = "cul\xE9e suppos\xE9e rigide";
        lignes[dir].push({
          id: `${appui.id}_${dir}_culee`,
          titre: `${appui.id} \u2014 raideur propre de la cul\xE9e (${nomDir})`,
          resultat: { symbole: "k_{cul\xE9e}", valeur: "infinie (cul\xE9e suppos\xE9e rigide)" },
          references: ["culee_rigide"]
        });
      } else {
        const coef = dir === "y" ? 12 : 3;
        kSupport = n * coef * E * I / h ** 3;
        descSupport = dir === "y" ? `${n} poteau(x) encastr\xE9s en pied et en t\xEAte` : `${n} poteau(x) en console`;
        lignes[dir].push({
          id: `${appui.id}_${dir}_culee`,
          titre: `${appui.id} \u2014 raideur des poteaux (${nomDir})`,
          formule: `k_{cul\xE9e} = n\\,\\dfrac{${coef}\\,E\\,I}{h^3}`,
          application: `${n} \\times \\dfrac{${coef} \\times ${tex(E, 0)} \\times ${tex(I, 5)}}{${tex(h, 2)}^3}`,
          resultat: { symbole: "k_{cul\xE9e}", valeur: kSupport, unite: "MN/m", decimales: 2 },
          references: ["raideur_fut", "culee_rigide", "Ecm"],
          commentaire: dir === "y" ? "Poteaux bloqu\xE9s en rotation par le sommier et la longrine." : "Poteaux en console."
        });
      }
    }
    const a = appui.appareils;
    const bloque = dir === "x" ? appui.butees.longitudinales : appui.butees.transversales;
    let kApp;
    let descApp;
    if (bloque || a.type === "fixe") {
      kApp = { lbdp: Infinity, ubdp: Infinity };
      descApp = bloque ? "but\xE9es de blocage" : "appareils fixes";
      lignes[dir].push({
        id: `${appui.id}_${dir}_appareils`,
        titre: `${appui.id} \u2014 liaison tablier-appui (${nomDir})`,
        resultat: { symbole: "k_{appareils}", valeur: `infinie (${descApp})` },
        references: bloque ? ["butees"] : ["appareils_fixes"]
      });
    } else if (a.type === "glissant") {
      kApp = { lbdp: 0, ubdp: 0 };
      descApp = "appareils glissants (frottement n\xE9glig\xE9)";
      lignes[dir].push({
        id: `${appui.id}_${dir}_appareils`,
        titre: `${appui.id} \u2014 liaison tablier-appui (${nomDir})`,
        resultat: { symbole: "k_{appareils}", valeur: "nulle (appareils glissants, frottement n\xE9glig\xE9)" },
        references: ["masses_sismiques"]
      });
    } else if (a.type === "elastomere") {
      const Tq = epaisseurElastomere(a) ?? 0;
      const G = elastomeres?.G ?? { lbdp: 1.1 * a.Gg, ubdp: 1.1 * a.Gg };
      kApp = { lbdp: a.nombre * G.lbdp * a.a * a.b / Tq, ubdp: a.nombre * G.ubdp * a.a * a.b / Tq };
      descApp = `${a.nombre} \xE9lastom\xE8re(s)`;
      lignes[dir].push({
        id: `${appui.id}_${dir}_appareils`,
        titre: `${appui.id} \u2014 raideur des appareils en \xE9lastom\xE8re (${nomDir})`,
        formule: "k_{appareils} = n\\,\\dfrac{G\\,a\\,b}{T_q}",
        application: `${a.nombre} \\times \\dfrac{${tex(G.lbdp, 3)} \\times ${tex(a.a, 3)} \\times ${tex(a.b, 3)}}{${tex(Tq, 3)}}`,
        resultat: { symbole: "k_{appareils}^{LBDP}", valeur: kApp.lbdp, unite: "MN/m", decimales: 3 },
        references: ["raideur_elastomere", "module_G_elastomere"],
        commentaire: `UBDP (G = ${nombre(G.ubdp, 3)} MPa) : ${nombre(kApp.ubdp, 3)} MN/m.`
      });
    } else {
      kApp = { lbdp: Infinity, ubdp: Infinity };
      descApp = "liaison rigide";
    }
    const kTotal = { lbdp: serie(kSupport, kApp.lbdp), ubdp: serie(kSupport, kApp.ubdp) };
    lignes[dir].push({
      id: `${appui.id}_${dir}_total`,
      titre: `${appui.id} \u2014 raideur de l'appui (${nomDir})`,
      formule: "k_{appui} = \\left(\\dfrac{1}{k_{support}} + \\dfrac{1}{k_{appareils}}\\right)^{-1}",
      application: `\\left(\\dfrac{1}{${fmtK(kSupport)}} + \\dfrac{1}{${fmtK(kApp.lbdp)}}\\right)^{-1}`,
      resultat: { symbole: "k_{appui}^{LBDP}", valeur: kTotal.lbdp === Infinity ? "rigide" : kTotal.lbdp, unite: kTotal.lbdp === Infinity ? void 0 : "MN/m", decimales: 3 },
      references: ["raideur_ligne_appui"],
      commentaire: `UBDP : ${txtK(kTotal.ubdp)}.`
    });
    return { id: appui.id, type: appui.type, kSupport, kAppareils: kApp, kTotal, part: { lbdp: 0, ubdp: 0 }, description: `${descSupport} ; ${descApp}` };
  };
  const directions = {};
  for (const dir of ["x", "y"]) {
    const appuis = p.appuis.map((a) => raideurAppui(a, dir));
    const K = {
      lbdp: appuis.reduce((s, a) => s + a.kTotal.lbdp, 0),
      ubdp: appuis.reduce((s, a) => s + a.kTotal.ubdp, 0)
    };
    for (const a of appuis) {
      for (const b of ["lbdp", "ubdp"]) {
        a.part[b] = K[b] === Infinity ? a.kTotal[b] === Infinity ? 1 / appuis.filter((x) => x.kTotal[b] === Infinity).length : 0 : K[b] > 0 ? a.kTotal[b] / K[b] : 0;
      }
    }
    lignes[dir].push({
      id: `K_${dir}`,
      titre: `Raideur totale de l'ouvrage (${dir === "x" ? "longitudinal" : "transversal"})`,
      formule: "K = \\sum_i k_{appui,i}",
      application: appuis.map((a) => fmtK(a.kTotal.lbdp)).join(" + "),
      resultat: { symbole: "K^{LBDP}", valeur: K.lbdp === Infinity ? "rigide (au moins un appui bloqu\xE9 sur un support rigide)" : K.lbdp, unite: K.lbdp === Infinity ? void 0 : "MN/m", decimales: 2 },
      references: ["raideur_ligne_appui", "tablier_rigide"],
      commentaire: `UBDP : ${txtK(K.ubdp)}.`,
      niveau: K.lbdp === Infinity ? "info" : void 0
    });
    directions[dir] = { appuis, K };
  }
  const xiBeton = 0.05;
  const energies = directions.x.appuis.filter((a) => a.kTotal.lbdp > 0 && a.kTotal.lbdp < Infinity).flatMap((a) => {
    const F = a.kTotal.lbdp;
    const parts = [];
    if (a.kSupport < Infinity) parts.push({ xi: xiBeton, E: F * F / (2 * a.kSupport) });
    if (a.kAppareils.lbdp < Infinity && a.kAppareils.lbdp > 0) parts.push({ xi: 0.05, E: F * F / (2 * a.kAppareils.lbdp) });
    return parts;
  });
  const sommeE = energies.reduce((s, e) => s + e.E, 0);
  const xi = sommeE > 0 ? 100 * energies.reduce((s, e) => s + e.xi * e.E, 0) / sommeE : 5;
  const ecartSaisie = p.comportement.amortissement - xi;
  const lignesAmortissement = [
    {
      id: "xi",
      titre: "Amortissement global (direction longitudinale)",
      formule: "\\xi = \\dfrac{\\sum_k \\xi_k\\,E_k}{\\sum_k E_k}",
      resultat: { symbole: "\\xi", valeur: xi, unite: "%", decimales: 1 },
      references: ["amortissement_global", "amortissement_materiaux"],
      commentaire: Math.abs(ecartSaisie) > 0.5 ? `L'amortissement saisi dans l'action sismique (${nombre(p.comportement.amortissement, 1)} %) diff\xE8re de cette valeur.` : "B\xE9ton arm\xE9 et \xE9lastom\xE8re \xE0 faible amortissement : 5 %. Coh\xE9rent avec la valeur saisie dans l'action sismique.",
      niveau: Math.abs(ecartSaisie) > 0.5 ? "alerte" : void 0
    }
  ];
  const note = [
    { id: "materiaux", titre: "Mat\xE9riau", lignes: [ligneEcm] },
    { id: "masses", titre: "Masses", lignes: lignesMasses }
  ];
  if (lignesG.length) note.push({ id: "elastomeres", titre: "Module des \xE9lastom\xE8res", lignes: lignesG });
  note.push(
    { id: "raideurs_x", titre: "Raideurs longitudinales", lignes: lignes.x },
    { id: "raideurs_y", titre: "Raideurs transversales", lignes: lignes.y },
    { id: "amortissement", titre: "Amortissement", lignes: lignesAmortissement }
  );
  return {
    Ecm,
    masses: { masseLineique: d.masseLineique, tablier: masseTablier, trafic: masseTrafic, psi21, M, piles },
    elastomeres,
    directions,
    amortissement: { xi, ecartSaisie },
    note
  };
}

// src/referentiel/modele.ts
var ligne = (v) => ({
  "\u03A8 = 0,5": v[0],
  "\u03A8 = 0,6": v[1],
  "\u03A8 = 0,7": v[2],
  "\u03A8 = 0,8": v[3],
  "\u03A8 = 0,9": v[4],
  "\u03A8 = 1,0": v[5]
});
var TABLEAU_B_VERTICAL = {
  id: "b_reactions_verticales",
  type: "table",
  etape: "analyse",
  libelle: "R\xE9actions verticales normalis\xE9es b (une trav\xE9e : b = 0,41)",
  symbole: "b",
  unite: "-",
  cles: ["nombre de trav\xE9es", "r\xE9action"],
  valeurs: {
    "2 trav\xE9es": { R1: ligne([0.22, 0.24, 0.29, 0.33, 0.34, 0.31]), R2: ligne([0.57, 0.49, 0.52, 0.63, 0.78, 0.89]), R3: ligne([0.33, 0.31, 0.28, 0.25, 0.25, 0.31]) },
    "3 trav\xE9es": { R1: ligne([0.22, 0.24, 0.26, 0.26, 0.24, 0.25]), R2: ligne([0.45, 0.48, 0.58, 0.69, 0.75, 0.75]) },
    "4 trav\xE9es et plus": {
      "R1 (cul\xE9e)": ligne([0.19, 0.25, 0.29, 0.27, 0.22, 0.24]),
      "R2 (1re pile)": ligne([0.38, 0.42, 0.57, 0.7, 0.69, 0.64]),
      "Ri (piles interm\xE9diaires)": ligne([0.71, 0.62, 0.54, 0.64, 0.82, 0.9])
    }
  },
  references: [{ source: "GUIDE_CEREMA_2015", localisation: "ch. 4 \xA75.3.5, tableau 22", page: "124" }],
  statut: "via_guide",
  note: "\u03A8 = rapport trav\xE9e de rive / trav\xE9e principale."
};

// src/moteur/analyse.ts
var BORNES = ["lbdp", "ubdp"];
function interpoler(ligne2, psi) {
  const pts = Object.entries(ligne2).map(([k, v]) => [Number(k.replace("\u03A8 = ", "").replace(",", ".")), v]).sort((a, b) => a[0] - b[0]);
  const p = Math.min(Math.max(psi, pts[0]?.[0] ?? 0.5), pts.at(-1)?.[0] ?? 1);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] ?? [0, 0];
    const [x1, y1] = pts[i] ?? [0, 0];
    if (p <= x1) return y0 + (p - x0) / (x1 - x0) * (y1 - y0);
  }
  return pts.at(-1)?.[1] ?? NaN;
}
function analyse(p, a, m2) {
  const d = derives(p);
  const M = m2.masses.M;
  const L = d.longueur;
  const positions = d.positions;
  const notes = { conditions: [], x: [], y: [], vertical: [], combinaisons: [] };
  const massePiles = m2.masses.piles.reduce((s, x) => s + x.masseFuts, 0);
  const rapportMasse = massePiles / M;
  const LsurB = L / p.tablier.largeur;
  const conditions = [
    {
      id: "tablier_continu",
      libelle: "Tablier continu, droit et \xE0 peu pr\xE8s rectiligne",
      valeur: `${p.tablier.travees.length} trav\xE9e(s), pont droit`,
      respectee: true,
      references: ["conditions_monomodal"]
    },
    {
      id: "masse_piles",
      libelle: "Masse des piles < 20 % de celle du tablier (longitudinal)",
      valeur: `${nombre(100 * rapportMasse, 1)} %`,
      respectee: rapportMasse < 0.2,
      references: ["conditions_monomodal"]
    },
    {
      id: "L_sur_B",
      libelle: "Tablier rigide en transversal : L/B \u2264 4",
      valeur: `L/B = ${nombre(LsurB, 2)}`,
      respectee: LsurB <= 4,
      references: ["tablier_rigide"]
    }
  ];
  const appuisY = m2.directions.y.appuis;
  const infinis = appuisY.filter((x) => x.kTotal.lbdp === Infinity);
  const xK = infinis.length ? infinis.reduce((s, x) => s + (positions[p.appuis.findIndex((ap) => ap.id === x.id)] ?? 0), 0) / infinis.length : appuisY.reduce((s, x, i) => s + (positions[i] ?? 0) * x.kTotal.lbdp, 0) / Math.max(m2.directions.y.K.lbdp, 1e-12);
  const e0 = Math.abs(xK - L / 2);
  const torsionAppliquee = e0 > 0.05 * L;
  conditions.push({
    id: "excentricite",
    libelle: "Excentricit\xE9 centre de raideur / centre de masse \u2264 5 % de L (sinon torsion)",
    valeur: `e0 = ${nombre(e0, 2)} m ; 5 % L = ${nombre(0.05 * L, 2)} m`,
    respectee: !torsionAppliquee,
    references: ["conditions_monomodal", "centre_raideur", "torsion_excentricite"]
  });
  for (const c of conditions) {
    notes.conditions.push({
      id: c.id,
      titre: c.libelle,
      resultat: { symbole: "", valeur: `${c.valeur} \u2014 ${c.respectee ? "respect\xE9e" : "non respect\xE9e"}` },
      references: c.references,
      niveau: c.respectee ? void 0 : "alerte",
      commentaire: c.respectee ? void 0 : c.id === "excentricite" ? "Moment de torsion ajout\xE9 aux efforts transversaux." : c.id === "L_sur_B" ? "Tablier flexible : la m\xE9thode de Rayleigh (non trait\xE9e en V1) serait plus appropri\xE9e ; r\xE9sultats indicatifs." : "Hors domaine de la m\xE9thode du mode fondamental : r\xE9sultats indicatifs."
    });
  }
  const spectreDe = (dir) => dir === "x" ? a.spectres.calculLong : a.spectres.calculTrans;
  const qDe = (dir) => dir === "x" ? a.q.longitudinal : a.q.transversal;
  const directions = {};
  for (const dir of ["x", "y"]) {
    const nomDir = dir === "x" ? "longitudinale" : "transversale";
    const q = qDe(dir);
    directions[dir] = {};
    for (const borne of BORNES) {
      const K = m2.directions[dir].K[borne];
      const T = K === Infinity ? 0 : 2 * Math.PI * Math.sqrt(M / (K * 1e3));
      const Sd = valeur(spectreDe(dir), T);
      const F = M * Sd / 1e3;
      const dEe = K === Infinity || K === 0 ? 0 : F / K;
      const T0 = 1.25 * a.TC;
      const muD = T < 0.033 ? 1 : T >= T0 ? q : Math.min((q - 1) * (T0 / T) + 1, 5 * q - 4);
      const dE = a.eta * muD * dEe;
      const appuis = m2.directions[dir].appuis.map((ap, i) => {
        const Fi = ap.part[borne] * F;
        return {
          id: ap.id,
          x: positions[i] ?? 0,
          F: Fi,
          part: ap.part[borne],
          torsion: 0,
          dTete: ap.kSupport === Infinity ? 0 : Fi / ap.kSupport * a.eta * muD,
          dAppareils: ap.kAppareils[borne] === Infinity || ap.kAppareils[borne] === 0 ? 0 : Fi / ap.kAppareils[borne] * a.eta * muD
        };
      });
      if (dir === "y" && torsionAppliquee) {
        const e = e0 + 0.05 * L;
        const Mt = e * F;
        const finis = m2.directions.y.appuis.map((ap, i) => ({ k: ap.kTotal[borne], dx: (positions[i] ?? 0) - xK }));
        const J = finis.reduce((s, x) => s + (Number.isFinite(x.k) ? x.k * x.dx * x.dx : 0), 0);
        appuis.forEach((ap, i) => {
          const f = finis[i];
          if (!f || !Number.isFinite(f.k) || J === 0) return;
          ap.torsion = Mt * f.k * Math.abs(f.dx) / J;
          ap.F += ap.torsion;
        });
      }
      directions[dir][borne] = { K, T, Sd, F, dEe, muD, dE, appuis };
    }
    const L_ = directions[dir].lbdp;
    const U = directions[dir].ubdp;
    const etiquette = (b) => m2.elastomeres ? b === "lbdp" ? "^{LBDP}" : "^{UBDP}" : "";
    for (const borne of m2.elastomeres ? BORNES : ["lbdp"]) {
      const r = directions[dir][borne];
      const K = r.K;
      notes[dir].push(
        {
          id: `T_${dir}_${borne}`,
          titre: `P\xE9riode propre ${nomDir}${m2.elastomeres ? ` (${borne.toUpperCase()})` : ""}`,
          formule: "T = 2\\pi\\sqrt{\\dfrac{M}{K}}",
          application: K === Infinity ? "K \\to \\infty" : `2\\pi\\sqrt{\\dfrac{${tex(M * 1e3, 0)}}{${tex(K * 1e6, 0)}}}`,
          resultat: { symbole: `T${etiquette(borne)}`, valeur: r.T, unite: "s", decimales: 3 },
          references: ["tablier_rigide"],
          commentaire: K === Infinity ? "Tablier bloqu\xE9 sur un appui rigide : p\xE9riode nulle." : void 0
        },
        {
          id: `Sd_${dir}_${borne}`,
          titre: `Acc\xE9l\xE9ration spectrale (q = ${nombre(q, 2)})`,
          resultat: { symbole: `S_d(T)${etiquette(borne)}`, valeur: r.Sd, unite: "m/s\xB2", decimales: 3 },
          references: ["Sd"],
          commentaire: r.T < a.TB ? "T < TB." : r.T <= a.TC ? "Plateau du spectre (TB \u2264 T \u2264 TC)." : r.T <= a.TD ? "Branche en 1/T (TC \u2264 T \u2264 TD)." : "Branche en 1/T\xB2 (T > TD)."
        },
        {
          id: `F_${dir}_${borne}`,
          titre: "Effort sismique total",
          formule: "F = M\\,S_d(T)",
          application: `${tex(M, 1)}\\ \\text{t} \\times ${tex(r.Sd, 3)}`,
          resultat: { symbole: `F${etiquette(borne)}`, valeur: r.F, unite: "MN", decimales: 3 },
          references: ["tablier_rigide"]
        },
        {
          id: `d_${dir}_${borne}`,
          titre: "D\xE9placement sismique du tablier",
          formule: "d_E = \\eta\\,\\mu_d\\,d_{Ee}, \\qquad d_{Ee} = \\dfrac{F}{K}",
          application: K === Infinity ? "0" : `${tex(a.eta, 3)} \\times ${tex(r.muD, 3)} \\times \\dfrac{${tex(r.F, 3)}}{${tex(K, 2)}}`,
          resultat: { symbole: `d_E${etiquette(borne)}`, valeur: r.dE * 100, unite: "cm", decimales: 2 },
          references: ["mu_d", "tablier_rigide"],
          commentaire: `\u03BCd = ${nombre(r.muD, 3)}${q === 1 ? " (q = 1)" : ""}.`
        }
      );
    }
    for (const ap of U.appuis) {
      const apL = L_.appuis.find((x) => x.id === ap.id);
      notes[dir].push({
        id: `F_${dir}_${ap.id}`,
        titre: `${ap.id} \u2014 effort ${dir === "x" ? "longitudinal" : "transversal"} transmis par le tablier`,
        formule: "F_i = \\dfrac{k_i}{K}\\,F" + (ap.torsion > 0 ? " + \\dfrac{M_t\\,k_i\\,|x_i - x_K|}{\\sum k_j (x_j - x_K)^2}" : ""),
        application: `${tex(ap.part, 4)} \\times ${tex(U.F, 3)}` + (ap.torsion > 0 ? ` + ${tex(ap.torsion, 3)}` : ""),
        resultat: { symbole: `F_{${ap.id}}${etiquette("ubdp")}`, valeur: ap.F, unite: "MN", decimales: 3 },
        references: ap.torsion > 0 ? ["tablier_rigide", "torsion_excentricite"] : ["tablier_rigide"],
        commentaire: `D\xE9placement de la t\xEAte d'appui${m2.elastomeres ? " (LBDP)" : ""} : ${nombre((apL?.dTete ?? 0) * 100, 2)} cm ; distorsion des appareils : ${nombre((apL?.dAppareils ?? 0) * 100, 2)} cm.`
      });
    }
  }
  const t = p.tablier.travees;
  const n = t.length;
  const Lp = Math.max(...t);
  const psi = n >= 2 ? (t[0] ?? 0) / Lp : 1;
  const egal = (u, v) => Math.abs(u - v) <= 0.05 * Math.max(u, v);
  const regulier = n === 1 || egal(t[0] ?? 0, t[n - 1] ?? 0) && t.slice(1, -1).every((x) => egal(x, Lp)) && psi >= 0.5 - 1e-9 && psi <= 1 + 1e-9;
  const aV = a.plateaux.Sve;
  const mu = m2.masses.masseLineique;
  const reactions = [];
  let motif = "";
  if (!regulier) {
    motif = "Trav\xE9es de rive in\xE9gales, trav\xE9es interm\xE9diaires diff\xE9rentes ou \u03A8 hors de [0,5 ; 1] : m\xE9thode forfaitaire non applicable.";
  } else {
    const tab = TABLEAU_B_VERTICAL.valeurs;
    const bDe = (i) => {
      if (n === 1) return 0.41;
      const culee = i === 0 || i === n;
      if (n === 2) return culee ? interpoler(i === 0 ? tab["2 trav\xE9es"]?.R1 ?? {} : tab["2 trav\xE9es"]?.R3 ?? {}, psi) : interpoler(tab["2 trav\xE9es"]?.R2 ?? {}, psi);
      if (n === 3) return interpoler((culee ? tab["3 trav\xE9es"]?.R1 : tab["3 trav\xE9es"]?.R2) ?? {}, psi);
      const g = tab["4 trav\xE9es et plus"] ?? {};
      if (culee) return interpoler(g["R1 (cul\xE9e)"] ?? {}, psi);
      if (i === 1 || i === n - 1) return interpoler(g["R2 (1re pile)"] ?? {}, psi);
      return interpoler(g["Ri (piles interm\xE9diaires)"] ?? {}, psi);
    };
    p.appuis.forEach((ap, i) => {
      const b = bDe(i);
      reactions.push({ id: ap.id, b, R: aV * b * mu * Lp / 1e3 });
    });
    motif = `${n} trav\xE9e(s), \u03A8 = ${nombre(psi, 3)}.`;
  }
  notes.vertical.push({
    id: "a_vertical",
    titre: "Acc\xE9l\xE9ration du plateau vertical",
    formule: "a = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
    resultat: { symbole: "a", valeur: aV, unite: "m/s\xB2", decimales: 3 },
    references: ["reactions_verticales", "Sve"]
  });
  for (const r of reactions) {
    notes.vertical.push({
      id: `Rv_${r.id}`,
      titre: `${r.id} \u2014 r\xE9action verticale sous s\xE9isme vertical`,
      formule: "R_i = \\pm\\,a\\,b\\,\\mu\\,L",
      application: `${tex(aV, 3)} \\times ${tex(r.b, 3)} \\times ${tex(mu, 3)}\\ \\text{t/m} \\times ${tex(Lp, 3)}`,
      resultat: { symbole: `R_{${r.id}}`, valeur: r.R, unite: "MN", decimales: 3 },
      references: ["reactions_verticales", "b_reactions_verticales"]
    });
  }
  if (!regulier) {
    notes.vertical.push({ id: "vertical_na", titre: "M\xE9thode forfaitaire", resultat: { symbole: "", valeur: "non applicable" }, references: ["reactions_verticales"], commentaire: motif, niveau: "alerte" });
  }
  const combinaisons = p.appuis.map((ap, i) => {
    const Fx = directions.x.ubdp.appuis[i]?.F ?? 0;
    const Fy = directions.y.ubdp.appuis[i]?.F ?? 0;
    const Fz = reactions[i]?.R ?? 0;
    return {
      id: ap.id,
      cas: [
        { nom: "X + 0,3 Y + 0,3 Z", Fx, Fy: 0.3 * Fy, Fz: 0.3 * Fz },
        { nom: "0,3 X + Y + 0,3 Z", Fx: 0.3 * Fx, Fy, Fz: 0.3 * Fz },
        { nom: "0,3 X + 0,3 Y + Z", Fx: 0.3 * Fx, Fy: 0.3 * Fy, Fz }
      ]
    };
  });
  for (const c of combinaisons) {
    notes.combinaisons.push({
      id: `comb_${c.id}`,
      titre: `${c.id} \u2014 combinaisons des directions (\xB1 sur chaque terme)`,
      formule: "E = \\pm E_1 \\pm 0{,}3\\,E_2 \\pm 0{,}3\\,E_3",
      resultat: {
        symbole: "(F_x ; F_y ; F_z)",
        valeur: c.cas.map((k) => `${k.nom} : (${nombre(k.Fx, 3)} ; ${nombre(k.Fy, 3)} ; ${nombre(k.Fz, 3)}) MN`).join(" \u2014 ")
      },
      references: ["combinaison_100_30_30"],
      commentaire: m2.elastomeres ? "Efforts horizontaux en propri\xE9t\xE9s limites sup\xE9rieures (UBDP)." : void 0
    });
  }
  const note = [
    { id: "conditions", titre: "Conditions d'application", lignes: notes.conditions },
    { id: "longitudinal", titre: "Direction longitudinale", lignes: notes.x },
    { id: "transversal", titre: "Direction transversale", lignes: notes.y },
    { id: "vertical", titre: "Composante verticale", lignes: notes.vertical },
    { id: "combinaisons", titre: "Combinaison des directions", lignes: notes.combinaisons }
  ];
  return {
    M,
    directions,
    torsion: { e0, L, appliquee: torsionAppliquee },
    vertical: { applicable: regulier, motif, a: aV, mu, L: Lp, psi, reactions },
    conditions,
    combinaisons,
    note
  };
}

// src/referentiel/combinaisons.ts
var LG = {
  id: "Lg",
  type: "table",
  etape: "combinaisons",
  libelle: "Distance au-del\xE0 de laquelle les mouvements du sol sont ind\xE9pendants",
  symbole: "L_g",
  unite: "m",
  cles: ["classe de sol"],
  valeurs: { A: 600, B: 500, C: 400, D: 300, E: 500 },
  references: [
    { source: "NF_EN_1998_2", localisation: "3.3(6), note 1", etat: "a_confirmer" },
    { source: "NF_EN_1998_2_NA", localisation: "3.3(6) note 1", page: "7" },
    { source: "GUIDE_CEREMA_2015", localisation: "ch. 4 \xA73.4, tableau 15", page: "91" }
  ],
  statut: "via_guide",
  note: "L'AN retient les valeurs recommand\xE9es de l'EN."
};

// src/moteur/verif-appuis.ts
function reactionsPoutreContinue(travees, q) {
  const n = travees.length;
  if (n === 1) return [q * (travees[0] ?? 0) / 2, q * (travees[0] ?? 0) / 2];
  const m2 = n - 1;
  const a = new Array(m2).fill(0);
  const b = new Array(m2).fill(0);
  const c = new Array(m2).fill(0);
  const dd = new Array(m2).fill(0);
  for (let i = 1; i <= m2; i++) {
    const Li = travees[i - 1] ?? 0;
    const Lj = travees[i] ?? 0;
    a[i - 1] = Li;
    b[i - 1] = 2 * (Li + Lj);
    c[i - 1] = Lj;
    dd[i - 1] = -q * (Li ** 3 + Lj ** 3) / 4;
  }
  for (let i = 1; i < m2; i++) {
    const w = (a[i] ?? 0) / (b[i - 1] ?? 1);
    b[i] = (b[i] ?? 0) - w * (c[i - 1] ?? 0);
    dd[i] = (dd[i] ?? 0) - w * (dd[i - 1] ?? 0);
  }
  const M = new Array(m2).fill(0);
  M[m2 - 1] = (dd[m2 - 1] ?? 0) / (b[m2 - 1] ?? 1);
  for (let i = m2 - 2; i >= 0; i--) M[i] = ((dd[i] ?? 0) - (c[i] ?? 0) * (M[i + 1] ?? 0)) / (b[i] ?? 1);
  const Mt = [0, ...M, 0];
  return Array.from({ length: n + 1 }, (_, i) => {
    let R = 0;
    if (i > 0) {
      const L = travees[i - 1] ?? 0;
      R += q * L / 2 + ((Mt[i - 1] ?? 0) - (Mt[i] ?? 0)) / L;
    }
    if (i < n) {
      const L = travees[i] ?? 0;
      R += q * L / 2 + ((Mt[i + 1] ?? 0) - (Mt[i] ?? 0)) / L;
    }
    return R;
  });
}
var vect = (x, y) => Math.hypot(x, y);
function verifierAppuis(p, a, m2, r) {
  const d = derives(p);
  const positions = d.positions;
  const criteres = [];
  const lignes = [];
  const lignesRepos = [];
  const lignesJoints = [];
  const { gammaIS, Kf } = p.elastomeres;
  const { retraitFluage, deltaT, alpha } = p.service;
  const kx = m2.directions.x.appuis.map((x) => x.kTotal.lbdp);
  const infinis = kx.map((k, i) => k === Infinity ? positions[i] ?? 0 : null).filter((x) => x !== null);
  const x0 = infinis.length ? infinis.reduce((s, x) => s + x, 0) / infinis.length : kx.reduce((s, k, i) => s + k * (positions[i] ?? 0), 0) / Math.max(m2.directions.x.K.lbdp, 1e-12);
  const reactionsG = reactionsPoutreContinue(p.tablier.travees, d.poidsLineique.total / 1e3);
  if (!r.vertical.applicable) {
    criteres.push({
      id: "vertical_absent",
      appui: "\u2014",
      libelle: "S\xE9isme vertical non pris en compte dans les appareils (m\xE9thode forfaitaire non applicable \xE0 cet ouvrage)",
      valeur: 0,
      limite: null,
      unite: "",
      etat: "info",
      commentaire: r.vertical.motif,
      references: ["reactions_verticales", "composante_verticale_a_considerer"]
    });
  }
  const Rv = r.vertical.reactions;
  const appareils = p.appuis.map((appui, i) => {
    const xi = positions[i] ?? 0;
    const distance = Math.abs(xi - x0);
    const dT = alpha * deltaT * distance;
    const dDiff = retraitFluage * distance;
    const rx = r.directions.x.lbdp.appuis[i];
    const ry = r.directions.y.lbdp.appuis[i];
    const dbd = rx?.dAppareils ?? 0;
    const dbdY = ry?.dAppareils ?? 0;
    const cp = appui.chargesPermanentes;
    const permanentes = cp ? { ...cp, source: "saisie" } : { Nmax: reactionsG[i] ?? 0, Nmin: reactionsG[i] ?? 0, rotation: 0, source: "poutre continue" };
    const rv = Rv[i]?.R ?? 0;
    const app = appui.appareils;
    const dEd = gammaIS * dbd + 0.5 * dT + dDiff;
    const base = { id: appui.id, type: appui.type, elastomere: app.type === "elastomere", permanentes, service: { distance, dT, dDiff }, dbd, dEd, combinaisons: [] };
    lignes.push({
      id: `${appui.id}_service`,
      titre: `${appui.id} \u2014 d\xE9placements de service`,
      formule: "d_T = \\alpha\\,\\Delta T\\,|x - x_0|, \\qquad d_{diff} = \\varepsilon_{diff}\\,|x - x_0|",
      application: `${tex(alpha * 1e5, 2)}\\cdot 10^{-5} \\times ${tex(deltaT, 1)} \\times ${tex(distance, 3)}, \\quad ${tex(retraitFluage * 1e4, 2)}\\cdot 10^{-4} \\times ${tex(distance, 3)}`,
      resultat: { symbole: "d_T ;\\ d_{diff}", valeur: `${nombre(dT * 100, 2)} cm ; ${nombre(dDiff * 100, 2)} cm` },
      references: ["deplacements_service"],
      commentaire: `Point fixe x0 = ${nombre(x0, 3)} m (centre des raideurs longitudinales). Charges permanentes : ${permanentes.source === "saisie" ? "calcul de service saisi" : "poutre continue (estimation)"} \u2014 Nmax = ${nombre(permanentes.Nmax, 3)} MN, Nmin = ${nombre(permanentes.Nmin, 3)} MN, rotation ${nombre(permanentes.rotation * 1e3, 2)}\xB710\u207B\xB3 rad.`,
      niveau: permanentes.source === "poutre continue" ? "info" : void 0
    });
    if (app.type !== "elastomere") {
      criteres.push({
        id: `${appui.id}_rigides`,
        appui: appui.id,
        libelle: app.type === "fixe" ? "Appareils fixes : dimensionnement en capacit\xE9 (sur-r\xE9sistance \u2265 1,3) par le fabricant" : "Appareils glissants : course \u2265 d\xE9placement major\xE9, \xE0 justifier par le fabricant",
        valeur: app.type === "fixe" ? 1.3 * Math.max(rx?.F ?? 0, ry?.F ?? 0) : dEd,
        limite: null,
        unite: app.type === "fixe" ? "MN" : "m",
        etat: "info",
        references: ["appareils_fixes"]
      });
      return base;
    }
    const e = app;
    const Tq = epaisseurElastomere(e) ?? 0;
    const ap = e.a - 2 * e.enrobageLateral;
    const bp = e.b - 2 * e.enrobageLateral;
    const Ap = ap * bp;
    const S = Ap / (2 * e.ti * (ap + bp));
    const vx = dT + dDiff;
    const Ar = Ap * (1 - vx / ap);
    const G = m2.elastomeres?.Gb ?? 1.1 * e.Gg;
    const EcPrime = 3 * G * (1 + 2 * S * S);
    const sommeTi3 = e.nbFeuillets * e.ti ** 3 + 2 * e.enrobage ** 3;
    const alphaA = permanentes.rotation + 3e-3;
    const alphaB = 3e-3;
    const epsA = (ap * ap * alphaA + bp * bp * alphaB) * e.ti / (2 * sommeTi3);
    const n = e.nombre;
    const service = 0.5 * dT + dDiff;
    const combos = [
      { nom: "X + 0,3 Y + 0,3 Z", N: (permanentes.Nmax + 0.3 * rv) / n, dEd: vect(gammaIS * dbd + service, 0.3 * gammaIS * dbdY) },
      { nom: "0,3 X + Y + 0,3 Z", N: (permanentes.Nmax + 0.3 * rv) / n, dEd: vect(0.3 * gammaIS * dbd + service, gammaIS * dbdY) },
      { nom: "0,3 X + 0,3 Y + Z", N: (permanentes.Nmax + rv) / n, dEd: vect(0.3 * gammaIS * dbd + service, 0.3 * gammaIS * dbdY) }
    ];
    const combinaisons = combos.map((c) => {
      const epsC = 6 * S * c.N / (Ar * EcPrime);
      const epsQ = c.dEd / Tq;
      return { ...c, epsC, epsQ, epsA, epsT: epsC + epsQ + epsA };
    });
    const pire = combinaisons.reduce((x, y) => y.epsT > x.epsT ? y : x);
    const pireQ = combinaisons.reduce((x, y) => y.epsQ > x.epsQ ? y : x);
    const Pcr = 1.3 * G * Ar * ap * S / Tq;
    lignes.push(
      {
        id: `${appui.id}_S`,
        titre: `${appui.id} \u2014 coefficient de forme et aire r\xE9duite`,
        formule: "S = \\dfrac{a'b'}{2\\,t_i\\,(a' + b')}, \\quad A_r = A'\\left(1 - \\dfrac{v_x}{a'}\\right), \\quad E'_c = 3G(1 + 2S^2)",
        application: `S = \\dfrac{${tex(ap, 3)} \\times ${tex(bp, 3)}}{2 \\times ${tex(e.ti, 3)} \\times ${tex(ap + bp, 3)}}, \\quad A_r = ${tex(Ap, 4)}\\left(1 - \\dfrac{${tex(vx, 4)}}{${tex(ap, 3)}}\\right), \\quad E'_c = 3 \\times ${tex(G, 3)} \\times (1 + 2 \\times ${tex(S, 2)}^2)`,
        resultat: { symbole: "S ;\\ A_r ;\\ E'_c", valeur: `${nombre(S, 2)} ; ${nombre(Ar, 4)} m\xB2 ; ${nombre(EcPrime, 0)} MPa` },
        references: ["elastomere_coef_forme", "elastomere_eps_c_E"]
      },
      {
        id: `${appui.id}_dEd`,
        titre: `${appui.id} \u2014 d\xE9placement total de calcul (longitudinal)`,
        formule: "d_{Ed} = \\gamma_{IS}\\,d_{bd} + 0{,}5\\,d_T + d_{diff}",
        application: `${tex(gammaIS, 2)} \\times ${tex(dbd, 4)} + 0{,}5 \\times ${tex(dT, 4)} + ${tex(dDiff, 4)}`,
        resultat: { symbole: "d_{Ed}", valeur: dEd, unite: "m", decimales: 4 },
        references: ["dEd_appuis", "gamma_IS"],
        commentaire: `dbd = distorsion sismique LBDP des appareils (${nombre(dbd * 100, 2)} cm). Combinaisons : r\xE9sultante avec la composante transversale.`
      },
      {
        id: `${appui.id}_epsT`,
        titre: `${appui.id} \u2014 distorsion totale (combinaison ${pire.nom})`,
        formule: "\\varepsilon_{t,d} = K_L\\,(\\varepsilon_{c,E} + \\varepsilon_{q,max} + \\varepsilon_{\\alpha,d}), \\quad \\varepsilon_{c,E} = \\dfrac{6\\,S\\,N_{Ed}}{A_r\\,E'_c}, \\quad \\varepsilon_{q} = \\dfrac{d_{Ed}}{T_q}, \\quad \\varepsilon_{\\alpha,d} = \\dfrac{(a'^2\\alpha_a + b'^2\\alpha_b)\\,t_i}{2\\sum t_i^3}",
        application: `${tex(pire.epsC, 3)} + ${tex(pire.epsQ, 3)} + ${tex(pire.epsA, 3)}`,
        resultat: { symbole: "\\varepsilon_{t,d}", valeur: pire.epsT, decimales: 3 },
        references: ["elastomere_distorsion_totale", "elastomere_eps_c_E", "elastomere_eps_q_max", "elastomere_eps_alpha_d"],
        commentaire: `NEd = ${nombre(pire.N * 1e3, 0)} kN par appareil ; \u03B1a = ${nombre(alphaA * 1e3, 2)}\xB710\u207B\xB3 rad (rotation permanente + 0,003), \u03B1b = 3\xB710\u207B\xB3 rad.`
      }
    );
    const ok = (cond) => cond ? "ok" : "non_verifie";
    criteres.push(
      { id: `${appui.id}_epsq`, appui: appui.id, libelle: `Distorsion de cisaillement \u03B5q,max (${pireQ.nom})`, valeur: pireQ.epsQ, limite: 2, unite: "", etat: ok(pireQ.epsQ <= 2), references: ["elastomere_limites_eps_q", "elastomere_eps_q_max"], commentaire: "Limite conseill\xE9e 2,0 (NF EN 15129 : 2,5)." },
      { id: `${appui.id}_epst`, appui: appui.id, libelle: `Distorsion totale \u03B5t,d (${pire.nom})`, valeur: pire.epsT, limite: 7, unite: "", etat: ok(pire.epsT <= 7), references: ["elastomere_distorsion_totale"] }
    );
    let flambeOk = true;
    let flambeTexte = "";
    for (const c of combinaisons) {
      const rapport = c.dEd / ap;
      let okC;
      if (c.N < Pcr / 4) okC = rapport <= 0.7;
      else if (c.N < Pcr / 2) okC = 1 - 2 * c.N / Pcr >= 0.7 * rapport;
      else okC = false;
      if (!okC) flambeOk = false;
      flambeTexte += `${c.nom} : N = ${nombre(c.N * 1e3, 0)} kN, dEd/a' = ${nombre(rapport, 2)} ; `;
    }
    const Nmax = Math.max(...combinaisons.map((c) => c.N));
    criteres.push({
      id: `${appui.id}_flambement`,
      appui: appui.id,
      libelle: "Flambement : NEd,max < Pcr/4 et dEd/a' \u2264 0,7 (ou crit\xE8re interm\xE9diaire)",
      valeur: Nmax * 1e3,
      limite: Pcr / 4 * 1e3,
      unite: "kN",
      etat: ok(flambeOk),
      references: ["elastomere_flambement"],
      commentaire: `Pcr = ${nombre(Pcr * 1e3, 0)} kN. ${flambeTexte}`
    });
    lignes.push({
      id: `${appui.id}_Pcr`,
      titre: `${appui.id} \u2014 charge critique de flambement`,
      formule: "P_{cr} = \\lambda\\,G\\,A_r\\,\\dfrac{a'\\,S}{T_q}, \\quad \\lambda = 1{,}3",
      application: `1{,}3 \\times ${tex(G, 3)} \\times ${tex(Ar, 4)} \\times \\dfrac{${tex(ap, 3)} \\times ${tex(S, 2)}}{${tex(Tq, 3)}}`,
      resultat: { symbole: "P_{cr}", valeur: Pcr * 1e3, unite: "kN", decimales: 0 },
      references: ["elastomere_flambement"]
    });
    const NminApp = (permanentes.Nmin - 0.3 * rv) / n;
    const sigmaM = NminApp / Ap;
    const khdyn = (m2.directions.x.appuis[i]?.kAppareils.lbdp ?? 0) / n;
    const khstat = e.a * e.b * e.Gg / Tq;
    const F = gammaIS * dbd * khdyn + (0.5 * dT + dDiff) * khstat;
    const R = NminApp > 0 ? (0.1 + Kf / sigmaM) * NminApp : 0;
    const glisseOk = F <= R;
    criteres.push({
      id: `${appui.id}_glissement`,
      appui: appui.id,
      libelle: "Non-glissement : Fxy,Ed \u2264 (0,1 + Kf/\u03C3m)\xB7NEd,min",
      valeur: F,
      limite: R,
      unite: "MN",
      etat: glisseOk ? "ok" : e.fixation === "mecanique" ? "info" : "non_verifie",
      references: ["elastomere_glissement", "elastomere_effort_glissement"],
      commentaire: glisseOk ? void 0 : e.fixation === "mecanique" ? "Frottement insuffisant : la fixation m\xE9canique pr\xE9vue reprend l'effort (taquets ou boulonnage \xE0 justifier)." : "Frottement insuffisant : fixation m\xE9canique (anti-cheminement) n\xE9cessaire."
    });
    lignes.push({
      id: `${appui.id}_glissement`,
      titre: `${appui.id} \u2014 non-glissement`,
      formule: "F_{xy,Ed} = \\gamma_{IS}\\,d_{bd}\\,k_{h,dyn} + (0{,}5\\,d_T + d_{diff})\\,k_{h,stat} \\le \\left(0{,}1 + \\dfrac{K_f}{\\sigma_m}\\right) N_{Ed,min}",
      application: `${tex(gammaIS, 2)} \\times ${tex(dbd, 4)} \\times ${tex(khdyn, 3)} + ${tex(0.5 * dT + dDiff, 4)} \\times ${tex(khstat, 3)} = ${tex(F, 3)} \\ \\text{vs}\\ \\left(0{,}1 + \\dfrac{${tex(Kf, 2)}}{${tex(sigmaM, 2)}}\\right) \\times ${tex(NminApp, 3)}`,
      resultat: { symbole: "R", valeur: R, unite: "MN", decimales: 3 },
      references: ["elastomere_glissement", "elastomere_effort_glissement"],
      commentaire: `NEd,min = (Nmin \u2212 0,3 Rv)/n = ${nombre(NminApp * 1e3, 0)} kN ; \u03C3m = ${nombre(sigmaM, 2)} MPa${sigmaM < 3 ? " (< 3 MPa)" : ""}.`,
      niveau: glisseOk ? void 0 : "alerte"
    });
    const ductile = Math.max(a.q.longitudinal, a.q.transversal) > 1.5;
    const seuil = ductile ? 0.8 : 0.5;
    const rapportV = permanentes.Nmin > 0 ? rv / permanentes.Nmin : Infinity;
    criteres.push({
      id: `${appui.id}_soulevement`,
      appui: appui.id,
      libelle: `R\xE9action verticale sismique / r\xE9action permanente minimale \u2264 ${nombre(seuil, 1)} (sinon dispositifs anti-soul\xE8vement)`,
      valeur: rapportV,
      limite: seuil,
      unite: "",
      etat: rapportV <= seuil ? "ok" : "non_verifie",
      references: ["anti_soulevement"],
      commentaire: `Rv = ${nombre(rv, 3)} MN ; Nmin = ${nombre(permanentes.Nmin, 3)} MN. ${permanentes.Nmin - rv > 0 ? "Pas de soul\xE8vement d'appareil (Nmin \u2212 Rv > 0)." : "Soul\xE8vement des appareils !"}`
    });
    return { ...base, S, Ar, EcPrime, Pcr, combinaisons, glissement: { F, R, Nmin: NminApp, sigmaM } };
  });
  const Lg = LG.valeurs[p.site.classeSol];
  const epsE = 2 * a.dg / Lg;
  const repos = [];
  const joints = [];
  const dE = r.directions.x.lbdp.dE;
  [0, p.appuis.length - 1].forEach((i) => {
    const appui = p.appuis[i];
    if (!appui || appui.type !== "culee") return;
    const c = appui;
    const v = appareils[i];
    if (!v) return;
    const Leff = v.service.distance;
    const deg = Math.min(epsE * Leff, 2 * a.dg);
    const des = dE + v.service.dDiff + 0.5 * v.service.dT;
    const lm = 0.4;
    const lov = lm + deg + des;
    const disponible = c.excentrementAppui + c.poteaux.cote / 2 + c.sommier.debordAvant + p.tablier.debordAbout;
    repos.push({ id: c.id, lm, deg, des, lov, disponible, Leff });
    criteres.push({
      id: `${c.id}_repos`,
      appui: c.id,
      libelle: "Longueur de repos d'appui : lov = lm + deg + des \u2264 recouvrement disponible",
      valeur: lov,
      limite: disponible,
      unite: "m",
      etat: lov <= disponible ? "ok" : "non_verifie",
      references: ["lov_repos_appui", "Lg"]
    });
    lignesRepos.push({
      id: `${c.id}_lov`,
      titre: `${c.id} \u2014 longueur minimale de repos d'appui`,
      formule: "l_{ov} = l_m + d_{eg} + d_{es}, \\quad d_{eg} = \\dfrac{2\\,d_g}{L_g}\\,L_{eff} \\le 2\\,d_g, \\quad d_{es} = d_E + d_{diff} + 0{,}5\\,d_T",
      application: `0{,}40 + \\dfrac{2 \\times ${tex(a.dg, 4)}}{${tex(Lg, 0)}} \\times ${tex(Leff, 3)} + (${tex(dE, 4)} + ${tex(v.service.dDiff, 4)} + 0{,}5 \\times ${tex(v.service.dT, 4)})`,
      resultat: { symbole: "l_{ov}", valeur: lov, unite: "m", decimales: 3 },
      references: ["lov_repos_appui", "Lg", "dg"],
      commentaire: `Leff = distance au point fixe (aucune liaison rigide). Recouvrement disponible (nu du sommier \u2192 extr\xE9mit\xE9 du tablier) : ${nombre(disponible, 2)} m.`
    });
    const souffle = 2 * dE + 2 * v.service.dT + v.service.dDiff;
    const service = v.service.dDiff + 0.5 * v.service.dT;
    const cat = p.site.categorie;
    const regle = cat === "I" || cat === "II" ? "Cat\xE9gorie II : s\xE9isme pouvant \xEAtre ignor\xE9 pour le joint (about et cul\xE9e non endommag\xE9s)." : dE <= 0.02 ? "dE \u2264 2 cm : joint dimensionn\xE9 au s\xE9isme ultime." : "dE > 2 cm : souffle = souffle de service + 0,4 \xD7 souffle sismique (s\xE9isme de service), garde-gr\xE8ve fusible au-del\xE0.";
    const souffleRetenu = cat === "I" || cat === "II" ? 2 * v.service.dT + v.service.dDiff : dE <= 0.02 ? souffle : 2 * service + 0.4 * 2 * dE;
    const faceGG = c.sommier.long - c.poteaux.cote / 2 - c.sommier.debordAvant - c.gardeGreve.retrait - c.gardeGreve.epaisseur;
    const jeuGardeGreve = faceGG - c.excentrementAppui - p.tablier.debordAbout;
    const dEdJoint = dE + v.service.dDiff + 0.5 * v.service.dT;
    joints.push({ id: c.id, dE, dG: v.service.dDiff, dT: v.service.dT, souffle, souffleRetenu, regle, jeuGardeGreve, dEd: dEdJoint });
    lignesJoints.push(
      {
        id: `${c.id}_souffle`,
        titre: `${c.id} \u2014 souffle sismique total du joint`,
        formule: "\\text{souffle} = 2\\,d_E + 2\\,d_T + d_G",
        application: `2 \\times ${tex(dE * 100, 2)} + 2 \\times ${tex(v.service.dT * 100, 2)} + ${tex(v.service.dDiff * 100, 2)}`,
        resultat: { symbole: "\\text{souffle}", valeur: souffle * 100, unite: "cm", decimales: 1 },
        references: ["souffle_joint", "joints_chaussee"],
        commentaire: `${regle} Souffle retenu : ${nombre(souffleRetenu * 100, 1)} cm.`
      },
      {
        id: `${c.id}_jeu`,
        titre: `${c.id} \u2014 jeu entre tablier et garde-gr\xE8ve`,
        resultat: { symbole: "\\text{jeu}", valeur: jeuGardeGreve * 100, unite: "cm", decimales: 1 },
        references: ["joints_chaussee", "pE_pT"],
        commentaire: jeuGardeGreve >= dEdJoint ? "Jeu suffisant pour le d\xE9placement sismique de calcul." : `Jeu inf\xE9rieur au d\xE9placement de calcul (${nombre(dEdJoint * 100, 1)} cm) : choc du tablier sur le garde-gr\xE8ve, \xE0 rendre fusible (v\xE9rification \xE0 l'\xE9tape 6c).`,
        niveau: jeuGardeGreve >= dEdJoint ? void 0 : "info"
      }
    );
    criteres.push({
      id: `${c.id}_garde_greve`,
      appui: c.id,
      libelle: "Jeu tablier / garde-gr\xE8ve \u2265 d\xE9placement sismique de calcul (sinon garde-gr\xE8ve fusible)",
      valeur: jeuGardeGreve,
      limite: dEdJoint,
      unite: "m",
      etat: jeuGardeGreve >= dEdJoint ? "ok" : "info",
      references: ["joints_chaussee"]
    });
  });
  const note = [
    { id: "appareils", titre: "Appareils d'appui", lignes },
    { id: "repos", titre: "Repos d'appui", lignes: lignesRepos },
    { id: "joints", titre: "Joints et garde-gr\xE8ve", lignes: lignesJoints }
  ];
  return { appareils, criteres, repos, joints, note };
}

// src/moteur/export-efforts.ts
function exporterEfforts(p, a, r) {
  const kN = (v) => v * 1e3;
  return {
    format: "pont-ec8-efforts",
    version: 1,
    projet: p.nom,
    unites: { force: "kN", longueur: "m" },
    q: { x: a.q.longitudinal, y: a.q.transversal },
    periodes: { x: r.directions.x.lbdp.T, y: r.directions.y.lbdp.T },
    masse: r.M,
    appuis: p.appuis.map((ap, i) => {
      const c = r.combinaisons[i];
      const lx = r.directions.x.lbdp.appuis[i], ly = r.directions.y.lbdp.appuis[i];
      return {
        id: ap.id,
        x: lx?.x ?? 0,
        type: ap.type,
        cas: (c?.cas ?? []).map((k) => ({ nom: k.nom, Fx: kN(k.Fx), Fy: kN(k.Fy), Fz: kN(k.Fz) })),
        dTete: { x: lx?.dTete ?? 0, y: ly?.dTete ?? 0 },
        dAppareils: { x: lx?.dAppareils ?? 0, y: ly?.dAppareils ?? 0 }
      };
    }),
    remarques: [
      "Efforts horizontaux transmis par le tablier en t\xEAte d'appui, propri\xE9t\xE9s limites sup\xE9rieures (UBDP), combinaison des directions 100/30/30 (EN 1998-2 4.2.1.4).",
      "R\xE9actions verticales sismiques forfaitaires (guide Cerema 2015) ; nulles si la m\xE9thode n'est pas applicable.",
      "Inertie propre des f\xFBts non comprise : \xE0 ajouter au pied des appuis si elle n'est pas n\xE9gligeable."
    ]
  };
}
export {
  actionSismique,
  analyse,
  exporterEfforts,
  lireProjet,
  modele,
  valider,
  verifierAppuis
};
