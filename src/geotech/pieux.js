// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/pieux.js) — module testé de fond.ksr-infra.org (170 tests).
// Portance axiale d'un pieu isolé.
//  · Fascicule 62 titre V : annexes C.2 (principes), C.3 (pressiomètre),
//    C.4 (pénétromètre), article C.4.1 (justifications) ;
//  · NF P94-262 (Eurocode 7) : annexes F (pressiomètre) et G (pénétromètre),
//    procédures « modèle de terrain » et « pieu modèle », d'après le guide
//    Cerema « Eurocode 7 – Application aux fondations profondes » (2014).
//
// Unités : B, D, z en m · pl*, qc en MPa · qs, qb en kPa · résistances en kN.

import { horsDomaine, integrer } from "./outils.js";
import { CATEGORIES_EC7 } from "./sols.js";

// ─────────────────────────── Géométrie de la section ──────────────────────

/** Section et périmètre d'un pieu circulaire (ou carré si forme = "carre"). */
export function section({ B, forme = "circulaire" }) {
  if (forme === "carre") return { Ab: B * B, P: 4 * B };
  return { Ab: (Math.PI * B * B) / 4, P: Math.PI * B };
}

// ─────────────────────── Paramètres équivalents sous la pointe ─────────────

/**
 * Intervalle d'étude sous la pointe (F62 annexe E.2 § 2.2 et 3 ; NF P94-262
 * formules F.4.2.3 à F.4.2.5) : [D − b ; D + 3a], a = max(B/2 ; 0,5 m),
 * b = min(a ; h), h hauteur du pieu dans la formation porteuse.
 */
export function intervallePointe({ B, D, h }) {
  const a = Math.max(B / 2, 0.5);
  const b = Math.min(a, h);
  return { a, b, z0: D - b, z1: D + 3 * a };
}

/** ple* = moyenne arithmétique de pl* sur [D − b ; D + 3a] (échelle linéaire). */
export function pleProfond({ plFn, ruptures = [], B, D, h }) {
  const I = intervallePointe({ B, D, h });
  const ple = integrer(plFn, I.z0, I.z1, ruptures) / (I.z1 - I.z0);
  return { ple, ...I };
}

/** qce = moyenne de qc écrêté à 1,3 qcm sur [D − b ; D + 3a]. */
export function qceProfond({ qcFn, ruptures = [], B, D, h }) {
  const I = intervallePointe({ B, D, h });
  const L = I.z1 - I.z0;
  const qcm = integrer(qcFn, I.z0, I.z1, ruptures) / L;
  const qce = integrer((z) => Math.min(qcFn(z), 1.3 * qcm), I.z0, I.z1, ruptures) / L;
  return { qce, qcm, ...I };
}

/**
 * Encastrement effectif de la NF P94-262 (formules F.4.2.6 et G.4.2.6) :
 * Def = (1/ref) ∫ f(z) dz sur [D − hD ; D], hD = min(10 B ; D).
 */
export function encastrementEffectif({ fn, ruptures = [], B, D, reference }) {
  const hD = Math.min(10 * B, D);
  return { Def: integrer(fn, D - hD, D, ruptures) / reference, hD };
}

// ═══════════════════════════ FASCICULE 62 ════════════════════════════════

/** Types de pieux du Fascicule 62 (lignes du tableau II de l'annexe C.3). */
export const PIEUX_F62 = {
  "fore-simple": { nom: "Foré simple", refoulement: false, cpt: "fore" },
  "fore-boue": { nom: "Foré boue", refoulement: false, cpt: "fore" },
  "fore-tube-recupere": { nom: "Foré tubé (tube récupéré)", refoulement: false, cpt: "fore-tube-recupere" },
  "fore-tube-perdu": { nom: "Foré tubé (tube perdu)", refoulement: false, cpt: null },
  "puits": { nom: "Puits", refoulement: false, cpt: null },
  "metal-battu-ferme": { nom: "Métal battu fermé", refoulement: true, cpt: "metal-battu-ferme" },
  "battu-prefabrique": { nom: "Battu préfabriqué béton", refoulement: true, cpt: "battu-prefabrique" },
  "battu-moule": { nom: "Battu moulé", refoulement: true, cpt: null },
  "battu-enrobe": { nom: "Battu enrobé", refoulement: true, cpt: null },
  "injecte-bp": { nom: "Injecté basse pression", refoulement: false, cpt: null },
  "injecte-hp": { nom: "Injecté haute pression", refoulement: false, cpt: null },
  // Annexe C.2, article 6 : calculés comme un pieu refoulant (pointe) et un
  // métal battu fermé (frottement), puis réduits par ρp et ρs.
  "tube-ouvert": { nom: "Tubulaire métallique battu ouvert", refoulement: true, rho: { argile: [0.5, 1.0], sable: [0.5, 1.0] }, comme: "metal-battu-ferme", cpt: "metal-battu-ferme" },
  "profile-H": { nom: "Profilé H battu", refoulement: true, rho: { argile: [0.5, 1.0], sable: [0.75, 1.0] }, comme: "metal-battu-ferme", cpt: "metal-battu-ferme" },
  "palplanche": { nom: "Palplanche battue", refoulement: true, rho: { argile: [0.5, 1.0], sable: [0.3, 0.5] }, comme: "metal-battu-ferme", cpt: "metal-battu-ferme" },
};

/** Annexe C.3, tableau I : kp [sans refoulement, avec refoulement]. */
export const KP_PIEU_F62 = {
  "argile-A": [1.1, 1.4], "argile-B": [1.2, 1.5], "argile-C": [1.3, 1.6],
  "sable-A": [1.0, 4.2], "sable-B": [1.1, 3.7], "sable-C": [1.2, 3.2],
  "craie-A": [1.1, 1.6], "craie-B": [1.4, 2.2], "craie-C": [1.8, 2.6],
  "marne-A": [1.8, 2.6], "marne-B": [1.8, 2.6],
  // Roches altérées : 1,1 à 1,8 / 1,8 à 3,2, « valeur de la formation meuble
  // à laquelle le matériau s'apparente le plus ». Borne basse par défaut.
  "roche-A": [1.1, 1.8], "roche-B": [1.1, 1.8],
};

/** Annexe C.4, tableau I : kc [sans refoulement, avec refoulement]. */
export const KC_PIEU_F62 = {
  "argile-A": [0.40, 0.55], "argile-B": [0.40, 0.55], "argile-C": [0.40, 0.55],
  "sable-A": [0.15, 0.50], "sable-B": [0.15, 0.50], "sable-C": [0.15, 0.50],
  "craie-A": [0.20, 0.30], "craie-B": [0.30, 0.45],
};

/**
 * Courbes de frottement Q1 à Q7 (annexe C.3, commentaire de l'article 3),
 * pl en MPa, qs en kPa.
 *   Q1–Q4 : qs = qsn (pl/pn)(2 − pl/pn) si pl ≤ pn, qsn sinon ;
 *           qsn = 0,04 n MPa, pn = 1 + 0,5 n MPa ; bornées par Q5 ;
 *   Q5 : min[(pl − 0,2)/9 ; (pl + 3,3)/32] pour pl ≥ 0,2 MPa ;
 *   Q6 : min[(pl + 0,4)/10 ; (pl + 4)/30] ;  Q7 : (pl + 0,4)/10.
 */
export function courbeQ(n, pl) {
  const q5 = pl >= 0.2 ? Math.min((pl - 0.2) / 9, (pl + 3.3) / 32) : 0;
  let qs;
  if (n <= 4) {
    const qsn = 0.04 * n, pn = 1 + 0.5 * n, r = pl / pn;
    qs = Math.min(r <= 1 ? qsn * r * (2 - r) : qsn, q5);
  } else if (n === 5) qs = q5;
  else if (n === 6) qs = Math.min((pl + 0.4) / 10, (pl + 4) / 30);
  else qs = (pl + 0.4) / 10;
  return Math.max(qs, 0) * 1000;
}

// Tableau II de l'annexe C.3. Colonnes : classes F62 ; « roche » pour les
// roches. Valeur : n° de courbe ; [n, n', note] quand une note du tableau
// permet une autre courbe (R : réalésage et rainurage en fin de forage ;
// L : pieu de plus de 30 m ; S : forage à sec, tube non louvoyé) ;
// null : case vide (« – ») ; "etude" : note (4), craies — étude spécifique.
const C = (argA, argB, argC, sabA, sabB, sabC, crA, crB, crC, marA, marB, roche) => ({
  "argile-A": argA, "argile-B": argB, "argile-C": argC,
  "sable-A": sabA, "sable-B": sabB, "sable-C": sabC,
  "craie-A": crA, "craie-B": crB, "craie-C": crC,
  "marne-A": marA, "marne-B": marB, "roche-A": roche, "roche-B": roche,
});
export const QS_PMT_F62 = {
  "fore-simple": C(1, [1, 2, "R"], [2, 3, "R"], null, null, null, 1, 3, [4, 5, "R"], 3, [4, 5, "R"], 6),
  "fore-boue": C(1, [1, 2, "R"], [1, 2, "R"], 1, [2, 1, "L"], [3, 2, "L"], 1, 3, [4, 5, "R"], 3, [4, 5, "R"], 6),
  "fore-tube-recupere": C(1, [1, 2, "S"], [1, 2, "S"], 1, [2, 1, "L"], [3, 2, "L"], 1, 2, [3, 4, "S"], 3, 4, null),
  "fore-tube-perdu": C(1, 1, 1, 1, 1, 2, "etude", "etude", "etude", 2, 3, null),
  "puits": C(1, 2, 3, null, null, null, 1, 2, 3, 4, 5, 6),
  "metal-battu-ferme": C(1, 2, 2, 2, 2, 3, "etude", "etude", "etude", 3, 4, 4),
  "battu-prefabrique": C(1, 2, 2, 3, 3, 3, "etude", "etude", "etude", 3, 4, 4),
  "battu-moule": C(1, 2, 2, 2, 2, 3, 1, 2, 3, 3, 4, null),
  "battu-enrobe": C(1, 2, 2, 3, 3, 4, "etude", "etude", "etude", 3, 4, null),
  "injecte-bp": C(1, 2, 2, 3, 3, 3, 2, 3, 4, 5, 5, null),
  "injecte-hp": C(null, 4, 5, 5, 5, 6, null, 5, 6, 6, 6, 7),
};

export const NOTES_QS_F62 = {
  R: "réalésage et rainurage en fin de forage",
  L: "pieu de grande longueur (plus de 30 m)",
  S: "forage à sec, tube non louvoyé",
};

/** Choix de la courbe Q pour un type de pieu et une classe de sol (tableau II). */
export function choixCourbeF62(type, classe, options = []) {
  const t = PIEUX_F62[type];
  if (!t) return horsDomaine(`type de pieu « ${type} » inconnu`);
  const ligne = QS_PMT_F62[t.comme ?? type];
  const cellule = ligne?.[classe];
  if (cellule === undefined) return horsDomaine(`classe « ${classe} » absente du tableau II`);
  if (cellule === null) return horsDomaine(`case vide du tableau II (${t.nom}, ${classe}) : le marché fixe qs`);
  if (cellule === "etude") return horsDomaine("craies : le frottement peut être très faible, étude spécifique (note 4 du tableau II)");
  if (Array.isArray(cellule)) {
    const [n, alt, note] = cellule;
    return options.includes(note)
      ? { applicable: true, n: alt, note: NOTES_QS_F62[note] }
      : { applicable: true, n, variante: { n: alt, note: NOTES_QS_F62[note], code: note } };
  }
  return { applicable: true, n: cellule };
}

// Annexe C.4, tableau II : [β, qsmax (kPa)] ; β = null (« – ») : qs = qsmax ;
// qsmax = null : pas de plafond. Deux variantes pour certaines argiles.
export const QS_CPT_F62 = {
  "fore": {
    "argile-A": [null, 15], "argile-B": [[null, 40], [75, 80, "R"]], "argile-C": [[null, 40], [null, 80, "R"]],
    "sable-A": [200, null], "sable-B": [200, null], "sable-C": [200, 120],
    "craie-A": [125, 40], "craie-B": [80, 120],
  },
  "fore-tube-recupere": {
    "argile-A": [null, 15], "argile-B": [[100, 40], [100, 60, "S"]], "argile-C": [[null, 40], [100, 80, "S"]],
    "sable-A": [250, null], "sable-B": [250, 40], "sable-C": [300, 120],
    "craie-A": [125, 40], "craie-B": [100, 80],
  },
  "metal-battu-ferme": {
    "argile-A": [null, 15], "argile-B": [120, 40], "argile-C": [150, 80],
    "sable-A": [300, null], "sable-B": [300, null], "sable-C": [300, 120],
  },
  "battu-prefabrique": {
    "argile-A": [null, 15], "argile-B": [75, 80], "argile-C": [null, 80],
    "sable-A": [150, null], "sable-B": [150, null], "sable-C": [150, 120],
  },
};

/** qs (kPa) à partir de qc (MPa), Fascicule 62 annexe C.4 article 3. */
export function qsPenetroF62(type, classe, qc, options = []) {
  const t = PIEUX_F62[type];
  const ligne = t && QS_CPT_F62[t.cpt];
  if (!ligne) return horsDomaine(`type de pieu absent du tableau II de l'annexe C.4 : le marché fixe qs`);
  let cellule = ligne[classe];
  if (!cellule) return horsDomaine(classe.startsWith("craie")
    ? "craies : frottement éventuellement très faible, étude spécifique (note 3)"
    : `classe « ${classe} » absente du tableau II de l'annexe C.4`);
  if (Array.isArray(cellule[0])) {
    const alt = cellule[1];
    cellule = options.includes(alt[2]) ? alt : cellule[0];
  }
  const [beta, qsmax] = cellule;
  if (qc < 1) return { applicable: true, qs: 0, motif: "qc < 1 MPa : frottement négligé" };
  let qs = beta === null ? qsmax : (qc * 1000) / beta;
  if (qsmax !== null) qs = Math.min(qs, qsmax);
  return { applicable: true, qs, beta, qsmax };
}

/** Coefficients de sécurité du Fascicule 62 (article C.4.1) : Qmax et Qmin. */
export function limitesF62({ Qu, Qc, Qtu, Qtc }) {
  return {
    ELU: { Qmax: Qu / 1.4, Qmin: -Qtu / 1.4 },
    ELU_acc: { Qmax: Qu / 1.2, Qmin: -Qtu / 1.3 },
    ELS_rare: { Qmax: Qc / 1.1, Qmin: -Qtc / 1.4 },
    ELS_QP: { Qmax: Qc / 1.4, Qmin: 0 },
  };
}

/**
 * Portance d'un pieu au Fascicule 62.
 * couches : [{ z0, z1, classe, pl (MPa), qc (MPa), options: ["R"|"L"|"S"] }]
 * zf : cote du haut de la zone de frottement (0 par défaut) ; h : hauteur
 * dans la couche porteuse (déduite des couches si absente).
 */
export function pieuF62({ methode = "pressio", type, B, D, forme = "circulaire", couches, zf = 0, h = null, options = [] }) {
  const t = PIEUX_F62[type];
  if (!t) return horsDomaine(`type de pieu « ${type} » inconnu`);
  const tri = [...couches].sort((a, b) => a.z0 - b.z0);
  const couche = (z) => tri.find((c) => z >= c.z0 && z < c.z1) ?? tri[tri.length - 1];
  const ruptures = [...new Set(tri.flatMap((c) => [c.z0, c.z1]))];
  const porteuse = couche(D - 1e-9);
  const hP = h ?? D - porteuse.z0;
  const { Ab, P } = section({ B, forme });
  const famille = porteuse.classe.split("-")[0];
  const rho = t.rho ? t.rho[famille === "argile" ? "argile" : famille === "sable" ? "sable" : null] : [1, 1];
  if (!rho) return horsDomaine("annexe C.2 art. 6 : tubes ouverts, H et palplanches traités seulement dans les argiles et les sables");

  // Pointe
  let kPointe, qEquiv, detailPointe;
  if (methode === "pressio") {
    const k = KP_PIEU_F62[porteuse.classe];
    if (!k) return horsDomaine(`classe ${porteuse.classe} absente du tableau I de l'annexe C.3`);
    kPointe = k[t.refoulement ? 1 : 0];
    detailPointe = pleProfond({ plFn: (z) => couche(z).pl, ruptures, B, D, h: hP });
    qEquiv = detailPointe.ple;
  } else {
    const k = KC_PIEU_F62[porteuse.classe];
    if (!k) return horsDomaine(`classe ${porteuse.classe} absente du tableau I de l'annexe C.4`);
    kPointe = k[t.refoulement ? 1 : 0];
    detailPointe = qceProfond({ qcFn: (z) => couche(z).qc, ruptures, B, D, h: hP });
    qEquiv = detailPointe.qce;
  }
  const qu = kPointe * qEquiv * 1000;
  const Qpu = rho[0] * Ab * qu;

  // Frottement, couche par couche
  const lignes = [];
  let Qsu = 0;
  for (const c of tri) {
    const a = Math.max(c.z0, zf), b = Math.min(c.z1, D);
    if (b <= a) continue;
    let qs, courbe = null, remarque = null;
    const opts = [...options, ...(c.options ?? [])];
    if (methode === "pressio") {
      const ch = choixCourbeF62(type, c.classe, opts);
      if (!ch.applicable) return { ...ch, couche: c };
      courbe = ch.n;
      qs = courbeQ(ch.n, c.pl);
      remarque = ch.note ?? null;
    } else {
      const r = qsPenetroF62(type, c.classe, c.qc, opts);
      if (!r.applicable) return { ...r, couche: c };
      qs = r.qs;
      remarque = r.motif ?? null;
    }
    const Q = rho[1] * P * qs * (b - a);
    Qsu += Q;
    lignes.push({ z0: a, z1: b, classe: c.classe, qs, courbe, Q, remarque });
  }
  const Qu = Qpu + Qsu;
  const Qc = (t.refoulement ? 0.7 : 0.5) * Qpu + 0.7 * Qsu;
  const Qtu = Qsu, Qtc = 0.7 * Qsu;
  return {
    applicable: true, referentiel: "F62", methode, type: t.nom, refoulement: t.refoulement,
    Ab, P, porteuse, h: hP, kPointe, qEquiv, detailPointe, qu, Qpu, lignes, Qsu, Qu, Qc, Qtu, Qtc,
    rho, limites: limitesF62({ Qu, Qc, Qtu, Qtc }),
    flottant: 0.7 * Qsu > (t.refoulement ? 0.7 : 0.5) * Qpu,
  };
}

// ═══════════════════════════ NF P94-262 ═══════════════════════════════════

/** Annexe A de la NF P94-262 : 8 classes, 20 catégories. */
export const CATEGORIES_PIEUX_EC7 = [
  { cat: 1, abr: "FS", nom: "Foré simple (pieux et barrettes)", classe: 1, refoulement: false, longs: true },
  { cat: 2, abr: "FB", nom: "Foré boue (pieux et barrettes)", classe: 1, refoulement: false, longs: true },
  { cat: 3, abr: "FTP", nom: "Foré tubé (virole perdue)", classe: 1, refoulement: false },
  { cat: 4, abr: "FTR", nom: "Foré tubé (virole récupérée)", classe: 1, refoulement: false },
  { cat: 5, abr: "FSR, FBR, PU", nom: "Foré simple ou boue avec rainurage, ou puits", classe: 1, refoulement: false, longs: true },
  { cat: 6, abr: "FTC, FTCD", nom: "Foré tarière creuse simple ou double rotation", classe: 2, refoulement: false },
  { cat: 7, abr: "VM", nom: "Vissé moulé", classe: 3, refoulement: true },
  { cat: 8, abr: "VT", nom: "Vissé tubé", classe: 3, refoulement: true },
  { cat: 9, abr: "BPF, BPR", nom: "Battu béton préfabriqué ou précontraint", classe: 4, refoulement: true },
  { cat: 10, abr: "BE", nom: "Battu enrobé (béton, mortier, coulis)", classe: 4, refoulement: true },
  { cat: 11, abr: "BM", nom: "Battu moulé", classe: 4, refoulement: true },
  { cat: 12, abr: "BAF", nom: "Battu acier fermé", classe: 4, refoulement: true },
  { cat: 13, abr: "BAO", nom: "Battu acier ouvert", classe: 5, refoulement: true, vibro: true },
  { cat: 14, abr: "HB", nom: "Profilé H battu", classe: 6, refoulement: true, vibro: true },
  { cat: 15, abr: "HBi", nom: "Profilé H battu injecté", classe: 6, refoulement: true },
  { cat: 16, abr: "PP", nom: "Palplanches battues", classe: 7, refoulement: true, vibro: true },
  { cat: 17, abr: "M1", nom: "Micropieu type I", classe: "1bis", refoulement: false, micropieu: true },
  { cat: 18, abr: "M2", nom: "Micropieu type II", classe: "1bis", refoulement: false, micropieu: true },
  { cat: 19, abr: "PIGU, MIGU", nom: "Pieu ou micropieu injecté mode IGU (type III)", classe: 8, refoulement: false },
  { cat: 20, abr: "PIRS, MIRS", nom: "Pieu ou micropieu injecté mode IRS (type IV)", classe: 8, refoulement: false },
];
export const categoriePieu = (cat) => CATEGORIES_PIEUX_EC7.find((c) => c.cat === Number(cat));

const COL_PMT = ["argile", "sable", "craie", "marne", "roche"];
const COL_CPT = ["argile", "intermediaire", "sable", "craie", "marne", "roche"];
const classeLigne = (classe) => (classe === "1bis" ? 1 : classe);

/** Tableau F.4.2.1 : kpmax par classe de pieu. */
export const KPMAX_EC7 = {
  1: [1.15, 1.1, 1.45, 1.45, 1.45], 2: [1.3, 1.65, 1.6, 1.6, 2.0], 3: [1.55, 3.2, 2.35, 2.10, 2.10],
  4: [1.35, 3.1, 2.30, 2.30, 2.30], 5: [1.0, 1.9, 1.4, 1.4, 1.2], 6: [1.20, 3.10, 1.7, 2.2, 1.5],
  7: [1.0, 1.0, 1.0, 1.0, 1.2], 8: [1.15, 1.1, 1.45, 1.45, 1.45],
};
/** Tableau G.4.2.1 : kcmax par classe de pieu. */
export const KCMAX_EC7 = {
  1: [0.4, 0.3, 0.2, 0.3, 0.3, 0.3], 2: [0.45, 0.3, 0.25, 0.3, 0.3, 0.3], 3: [0.5, 0.5, 0.5, 0.4, 0.35, 0.35],
  4: [0.45, 0.4, 0.4, 0.4, 0.4, 0.4], 5: [0.35, 0.3, 0.25, 0.15, 0.15, 0.15], 6: [0.4, 0.4, 0.4, 0.35, 0.2, 0.2],
  7: [0.35, 0.15, 0.15, 0.15, 0.15, 0.15], 8: [0.45, 0.3, 0.2, 0.3, 0.3, 0.25],
};
/** Valeur de kc pour Def = 0 (formules du guide, § 2.1 du chapitre 3). */
const KC0_EC7 = { argile: 0.3, intermediaire: 0.2, sable: 0.1, craie: 0.15, marne: 0.15, roche: 0.15 };

/** Tableaux F.5.2.2 et G.5.2.2 : fsol = (a X + b)(1 − e^(−c X)), X = pl* ou qc (MPa). */
export const FSOL_PMT = { a: [0.003, 0.01, 0.007, 0.008, 0.01], b: [0.04, 0.06, 0.07, 0.08, 0.08], c: [3.5, 1.2, 1.3, 3, 3] };
export const FSOL_CPT = { a: [0.0018, 0.0015, 0.0012, 0.0015, 0.0015, 0.0015], b: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1], c: [0.4, 0.25, 0.15, 0.25, 0.25, 0.25] };

const n = null;
/** Tableau F.5.2.1 : αpieu-sol (pressiomètre), catégories 1 à 20. */
export const ALPHA_PMT = {
  1: [1.1, 1, 1.8, 1.5, 1.6], 2: [1.25, 1.4, 1.8, 1.5, 1.6], 3: [0.7, 0.6, 0.5, 0.9, n], 4: [1.25, 1.4, 1.7, 1.4, n],
  5: [1.3, n, n, n, n], 6: [1.5, 1.8, 2.1, 1.6, 1.6], 7: [1.9, 2.1, 1.7, 1.7, n], 8: [0.6, 0.6, 1.0, 0.7, n],
  9: [1.1, 1.4, 1.0, 0.9, n], 10: [2.0, 2.1, 1.9, 1.6, n], 11: [1.2, 1.4, 2.1, 1.0, n], 12: [0.8, 1.2, 0.4, 0.9, n],
  13: [1.2, 0.7, 0.5, 1.0, 1.0], 14: [1.1, 1.0, 0.4, 1.0, 0.9], 15: [2.7, 2.9, 2.4, 2.4, 2.4], 16: [0.9, 0.8, 0.4, 1.2, 1.2],
  17: [n, n, n, n, n], 18: [n, n, n, n, n], 19: [2.7, 2.9, 2.4, 2.4, 2.4], 20: [3.4, 3.8, 3.1, 3.1, 3.1],
};
/** Tableau F.5.2.3 : qsmax (kPa), pressiomètre. */
export const QSMAX_PMT = {
  1: [90, 90, 200, 170, 200], 2: [90, 90, 200, 170, 200], 3: [50, 50, 50, 90, n], 4: [90, 90, 170, 170, n],
  5: [90, n, n, n, n], 6: [90, 170, 200, 200, 200], 7: [130, 200, 170, 170, n], 8: [50, 90, 90, 90, n],
  9: [130, 130, 90, 90, n], 10: [170, 260, 200, 200, n], 11: [90, 130, 260, 200, n], 12: [90, 90, 50, 90, n],
  13: [90, 50, 50, 90, 90], 14: [90, 130, 50, 90, 90], 15: [200, 380, 320, 320, 320], 16: [90, 50, 50, 90, 90],
  17: [n, n, n, n, n], 18: [n, n, n, n, n], 19: [200, 380, 320, 320, 320], 20: [200, 440, 440, 440, 500],
};
/**
 * Tableau G.5.2.1 : αpieu-sol (pénétromètre). Pour la catégorie 4 dans les
 * marnes, le guide Cerema imprime « 0,13 » : coquille manifeste (toutes les
 * valeurs voisines sont de l'ordre de 0,93 × la valeur pressiométrique,
 * ici 1,4) ; on retient 1,30.
 */
export const ALPHA_CPT = {
  1: [0.55, 0.65, 0.70, 0.80, 1.40, 1.50], 2: [0.65, 0.80, 1.00, 0.80, 1.40, 1.50], 3: [0.35, 0.40, 0.40, 0.25, 0.85, n],
  4: [0.65, 0.80, 1.00, 0.75, 1.30, n], 5: [0.70, 0.85, n, n, n, n], 6: [0.75, 0.90, 1.25, 0.95, 1.50, 1.50],
  7: [0.95, 1.15, 1.45, 0.75, 1.60, n], 8: [0.30, 0.35, 0.40, 0.45, 0.65, n], 9: [0.55, 0.65, 1.00, 0.45, 0.85, n],
  10: [1.00, 1.20, 1.45, 0.85, 1.50, n], 11: [0.60, 0.70, 1.00, 0.95, 0.95, n], 12: [0.40, 0.50, 0.85, 0.20, 0.85, n],
  13: [0.60, 0.70, 0.50, 0.25, 0.95, 0.95], 14: [0.55, 0.65, 0.70, 0.20, 0.95, 0.85], 15: [1.35, 1.60, 2.00, 1.10, 2.25, 2.25],
  16: [0.45, 0.55, 0.55, 0.20, 1.25, 1.15], 17: [n, n, n, n, n, n], 18: [n, n, n, n, n, n],
  19: [1.35, 1.60, 2.00, 1.10, 2.25, 2.25], 20: [1.70, 2.05, 2.65, 1.40, 2.90, 2.90],
};
/** Tableau G.5.2.3 : qsmax (kPa), pénétromètre. */
export const QSMAX_CPT = {
  1: [90, 90, 90, 200, 170, 200], 2: [90, 90, 90, 200, 170, 200], 3: [50, 50, 50, 50, 90, n], 4: [90, 90, 90, 170, 170, n],
  5: [90, 90, n, n, n, n], 6: [90, 90, 170, 200, 200, 200], 7: [130, 130, 200, 170, 170, n], 8: [50, 50, 90, 90, 90, n],
  9: [130, 130, 130, 90, 90, n], 10: [170, 170, 260, 200, 200, n], 11: [90, 90, 130, 260, 200, n], 12: [90, 90, 90, 50, 90, n],
  13: [90, 90, 50, 50, 90, 90], 14: [90, 90, 130, 50, 90, 90], 15: [200, 200, 380, 320, 320, 320], 16: [90, 50, 50, 50, 90, 90],
  17: [n, n, n, n, n, n], 18: [n, n, n, n, n, n], 19: [200, 380, 380, 320, 320, 320], 20: [200, 200, 440, 440, 440, 500],
};

const colonne = (methode, categorieSol) => {
  const c = CATEGORIES_EC7[categorieSol];
  if (!c) return -1;
  return methode === "pressio" ? COL_PMT.indexOf(c.colPMT) : COL_CPT.indexOf(c.colCPT);
};

/** fsol (MPa) pour une catégorie de sol et X = pl* ou qc (MPa). */
export function fsol(methode, categorieSol, X) {
  const j = colonne(methode, categorieSol);
  const t = methode === "pressio" ? FSOL_PMT : FSOL_CPT;
  return (t.a[j] * X + t.b[j]) * (1 - Math.exp(-t.c[j] * X));
}

/** qs (kPa) = min(αpieu-sol · fsol ; qsmax), avec les abattements (#) et (##). */
export function qsEC7({ methode, cat, sol, X, vibrofonce = false, hauteurSurPointe = 0 }) {
  const j = colonne(methode, sol);
  if (j < 0) return horsDomaine(`catégorie de sol « ${sol} » inconnue`);
  const alpha = (methode === "pressio" ? ALPHA_PMT : ALPHA_CPT)[cat]?.[j];
  const qsmax = (methode === "pressio" ? QSMAX_PMT : QSMAX_CPT)[cat]?.[j];
  if (alpha == null || qsmax == null) {
    return horsDomaine(Number(cat) === 17 || Number(cat) === 18
      ? "micropieux de type I ou II : pas de valeur semi-empirique, essais de chargement nécessaires"
      : `case vide du tableau ${methode === "pressio" ? "F.5.2.1" : "G.5.2.1"} pour cette catégorie de pieu et ce sol`);
  }
  const f = fsol(methode, sol, X) * 1000;
  let qs = Math.min(alpha * f, qsmax);
  const pc = categoriePieu(cat);
  const reductions = [];
  if (vibrofonce && pc?.vibro) { qs *= 0.7; reductions.push("vibrofonçage : −30 %"); }
  if (pc?.longs && hauteurSurPointe >= 25) { qs *= 0.5; reductions.push("à plus de 25 m au-dessus de la pointe : −50 %"); }
  return { applicable: true, qs, alpha, fsol: f, qsmax, plafonne: alpha * f > qsmax, reductions };
}

/** Coefficients de modèle γR;d1 (compression, traction) et de méthode γR;d2 (tableaux F.2.1 et G.2.1). */
export function coefficientsModele({ methode, cat, craie = false }) {
  const pc = categoriePieu(cat);
  const speciale = [10, 15, 17, 18, 19, 20].includes(Number(cat));
  let comp, trac;
  if (speciale) { comp = 2.0; trac = 2.0; }
  else if (craie && pc.classe !== "1bis" && pc.classe !== 8) { comp = methode === "pressio" ? 1.4 : 1.45; trac = methode === "pressio" ? 1.7 : 1.75; }
  else { comp = methode === "pressio" ? 1.15 : 1.18; trac = methode === "pressio" ? 1.4 : 1.45; }
  return { gRd1c: comp, gRd1t: trac, gRd2: 1.1 };
}

/** Facteurs partiels sur les résistances (tableaux C.2.3.1, C.2.3.2, 14.2.1.1, 14.2.1.2). */
export const GAMMAS_PIEU_EC7 = {
  ELU: { gt: 1.1, gb: 1.1, gs: 1.1, gst: 1.15 },
  ELU_acc: { gt: 1.0, gb: 1.0, gs: 1.0, gst: 1.05 },
  ELS_car: { gcr: 0.9, gscr: 1.1 },
  ELS_QP: { gcr: 1.1, gscr: 1.5 },
};

/**
 * Facteurs de corrélation ξ (NF P94-262 tableaux C.2.4.1 et C.2.4.2,
 * formule E.2.1) : ξ = 1 + (ξ' − 1) √(S/Sref), Sref = 2500 m².
 * type "sondages" (ξ3, ξ4) ou "essais" (ξ1, ξ2). S est borné à
 * [100 ; 2500] m² pour les sondages et [625 ; 2500] m² pour les essais.
 */
/**
 * Surface d'investigation (NF P94-262 E.2) : rectangle L × l englobant appuis et
 * sondages, élancement L/l ≤ 2 (on élargit l si besoin), S dans [Smin ; 2500] m².
 */
export function surfaceInvestigation({ L, l, type = "sondages" }) {
  const grand = Math.max(L, l), petit = Math.min(L, l);
  const lRet = Math.max(petit, grand / 2);
  const Smin = type === "sondages" ? 100 : 625;
  return { L: grand, l: lRet, S: Math.min(Math.max(grand * lRet, Smin), 2500), elargie: lRet > petit };
}

const XI_SONDAGES = [[1, 1.40, 1.40], [2, 1.35, 1.27], [3, 1.33, 1.23], [4, 1.31, 1.20], [5, 1.29, 1.15], [7, 1.27, 1.12], [10, 1.25, 1.08]];
const XI_ESSAIS = [[1, 1.40, 1.40], [2, 1.30, 1.20], [3, 1.20, 1.05], [4, 1.10, 1.00], [5, 1.00, 1.00]];

export function facteursCorrelation({ N, S, type = "sondages", raide = false }) {
  const table = type === "sondages" ? XI_SONDAGES : XI_ESSAIS;
  let ligne = table[0];
  for (const l of table) if (N >= l[0]) ligne = l; // valeur de N inférieure, par sécurité
  const Smin = type === "sondages" ? 100 : 625;
  const Sb = Math.min(Math.max(S, Smin), 2500);
  const f = Math.sqrt(Sb / 2500);
  let xiMoy = 1 + (ligne[1] - 1) * f;
  let xiMin = 1 + (ligne[2] - 1) * f;
  if (raide) { xiMoy = Math.max(xiMoy / 1.1, 1); xiMin = xiMin / 1.1; }
  return { xiMoy, xiMin, xiPrime: [ligne[1], ligne[2]], Sretenue: Sb };
}

/**
 * Valeurs limites d'un pieu à la NF P94-262 pour UN profil (couches ou points).
 * couches : [{ z0, z1, sol (catégorie EC7), pl, qc }]. Retourne Rb, Rs,
 * le détail de la pointe (ple* ou qce, Def, k) et du frottement.
 */
export function valeursLimitesEC7({ methode = "pressio", cat, B, D, forme = "circulaire", couches, zf = 0, h = null, vibrofonce = false, micropieu = null, sectionDonnee = null }) {
  const pc = categoriePieu(cat);
  if (!pc) return horsDomaine(`catégorie de pieu ${cat} inconnue (1 à 20)`);
  const tri = [...couches].sort((a, b) => a.z0 - b.z0);
  const couche = (z) => tri.find((c) => z >= c.z0 && z < c.z1) ?? tri[tri.length - 1];
  const ruptures = [...new Set(tri.flatMap((c) => [c.z0, c.z1]))];
  const porteuse = couche(D - 1e-9);
  const hP = h ?? D - porteuse.z0;
  const { Ab, P } = sectionDonnee ?? section({ B, forme });
  const cle = methode === "pressio" ? "pl" : "qc";
  const fn = (z) => couche(z)[cle];
  const estMicropieu = micropieu ?? Boolean(pc.micropieu);

  // Pointe
  const colP = colonne(methode, porteuse.sol);
  if (colP < 0) return horsDomaine(`catégorie de sol « ${porteuse.sol} » inconnue`);
  const ligne = classeLigne(pc.classe);
  let kmax = (methode === "pressio" ? KPMAX_EC7 : KCMAX_EC7)[ligne][colP];
  const pointe = methode === "pressio" ? pleProfond({ plFn: fn, ruptures, B, D, h: hP }) : qceProfond({ qcFn: fn, ruptures, B, D, h: hP });
  const ref = methode === "pressio" ? pointe.ple : pointe.qce;
  const { Def, hD } = encastrementEffectif({ fn, ruptures, B, D, reference: ref });
  const DefB = Def / B;
  if (vibrofonce && pc.vibro) kmax /= 2;
  let k;
  if (DefB >= 5) k = kmax;
  else if (methode === "pressio") k = 1 + ((kmax - 1) * DefB) / 5;
  else {
    const k0 = KC0_EC7[CATEGORIES_EC7[porteuse.sol].colCPT];
    k = k0 + ((kmax - k0) * DefB) / 5;
  }
  const qb = k * ref * 1000;
  const Rb = estMicropieu ? 0 : Ab * qb;

  // Frottement
  const lignes = [];
  let Rs = 0;
  // On découpe aux couches et au niveau « 25 m au-dessus de la pointe » (##).
  const coupes = [...ruptures, D - 25].filter((z) => z > zf && z < D);
  const bornes = [zf, ...coupes.sort((a, b) => a - b), D];
  for (let i = 0; i < bornes.length - 1; i++) {
    const a = bornes[i], b = bornes[i + 1];
    if (b - a < 1e-9) continue;
    const c = couche((a + b) / 2);
    const r = qsEC7({ methode, cat, sol: c.sol, X: c[cle], vibrofonce, hauteurSurPointe: D - (a + b) / 2 });
    if (!r.applicable) return { ...r, couche: c };
    const R = P * r.qs * (b - a);
    Rs += R;
    lignes.push({ z0: a, z1: b, sol: c.sol, X: c[cle], ...r, R });
  }
  const avertissements = [];
  const encMin = B > 0.5 ? 1.5 : 3 * B;
  if (hP < Math.min(encMin, 3 * B) - 1e-9 && hP < encMin - 1e-9)
    avertissements.push(`encastrement dans la couche porteuse ${hP.toFixed(2)} m < ${encMin.toFixed(2)} m recommandés (F.4.2 (5) NOTE 1)`);
  if (estMicropieu) avertissements.push("micropieu : terme de pointe non pris en compte (note b)");
  return {
    applicable: true, referentiel: "EC7", methode, categorie: pc, Ab, P, porteuse, h: hP,
    pointe: { ...pointe, Def, hD, DefB, kmax, k, qb }, Rb, lignes, Rs, Rc: Rb + Rs, Rt: Rs,
    refoulement: pc.refoulement, craie: CATEGORIES_EC7[porteuse.sol].colPMT === "craie", avertissements,
  };
}

/** Valeurs de calcul à partir des valeurs caractéristiques (chapitre 4, § 4 du guide). */
export function valeursCalculEC7({ Rbk, Rsk, Rck, Rtk, Rccrk, Rtcrk }) {
  const g = GAMMAS_PIEU_EC7;
  return {
    ELU: { Rcd: Rck / g.ELU.gt, RcdSepare: Rbk / g.ELU.gb + Rsk / g.ELU.gs, Rtd: Rtk / g.ELU.gst },
    ELU_acc: { Rcd: Rck / g.ELU_acc.gt, RcdSepare: Rbk / g.ELU_acc.gb + Rsk / g.ELU_acc.gs, Rtd: Rtk / g.ELU_acc.gst },
    ELS_car: { Rccrd: Rccrk / g.ELS_car.gcr, Rtcrd: Rtcrk / g.ELS_car.gscr },
    ELS_QP: { Rccrd: Rccrk / g.ELS_QP.gcr, Rtcrd: Rtcrk / g.ELS_QP.gscr },
  };
}

/**
 * Procédure « modèle de terrain » : qb;k = qb/(γR;d1 γR;d2), qs;k idem, puis
 * Rc;k = Rb;k + Rs;k, Rt;k = Rs;k ; charges de fluage 0,5/0,7 Rb;k + 0,7 Rs;k.
 */
export function modeleTerrain(limites) {
  if (!limites.applicable) return limites;
  const { gRd1c, gRd1t, gRd2 } = coefficientsModele({ methode: limites.methode, cat: limites.categorie.cat, craie: limites.craie });
  const Rbk = limites.Rb / (gRd1c * gRd2);
  const Rsk = limites.Rs / (gRd1c * gRd2);
  const Rtk = limites.Rs / (gRd1t * gRd2);
  const Rck = Rbk + Rsk;
  const Rccrk = (limites.refoulement ? 0.7 : 0.5) * Rbk + 0.7 * Rsk;
  const Rtcrk = 0.7 * Rtk;
  return {
    ...limites, procedure: "modèle de terrain", gRd1c, gRd1t, gRd2,
    Rbk, Rsk, Rck, Rtk, Rccrk, Rtcrk,
    calcul: valeursCalculEC7({ Rbk, Rsk, Rck, Rtk, Rccrk, Rtcrk }),
  };
}

/**
 * Procédure « pieu modèle » (formules 9.2.3.1 et 10.2.3.1) à partir de N
 * calculs de sondages : Rc;k = min[(Rc)moy/ξ3 ; (Rc)min/ξ4] / γR;d1.
 */
export function pieuModele({ resultats, S, raide = false }) {
  const ok = resultats.filter((r) => r.applicable);
  if (!ok.length) return horsDomaine("aucun sondage exploitable");
  const N = ok.length;
  const { methode, categorie, craie, refoulement } = ok[0];
  const { gRd1c, gRd1t } = coefficientsModele({ methode, cat: categorie.cat, craie });
  const { xiMoy, xiMin, xiPrime, Sretenue } = facteursCorrelation({ N, S, type: "sondages", raide });
  const moy = (k) => ok.reduce((s, r) => s + r[k], 0) / N;
  const min = (k) => Math.min(...ok.map((r) => r[k]));
  const RcMoy = moy("Rc"), RcMin = min("Rc"), RtMoy = moy("Rt"), RtMin = min("Rt");
  const moyenneGouverne = RcMoy / xiMoy <= RcMin / xiMin;
  const Rck = Math.min(RcMoy / xiMoy, RcMin / xiMin) / gRd1c;
  const Rtk = Math.min(RtMoy / xiMoy, RtMin / xiMin) / gRd1t;
  // Formules 9.2.3.5 et 9.2.3.6 : on répartit Rc;k entre pointe et frottement
  // au prorata des moyennes, Rb;k/Rc;k = (Rb)moy/(Rc)moy, puis charge de fluage
  // 0,5 (ou 0,7) Rb;k + 0,7 Rs;k. C'est la forme appliquée dans l'exemple 1 du
  // guide Cerema ; la variante « 0,5 Rc;k + 0,2 Rt;k » du texte du guide lui
  // est équivalente quand Rt;k = Rs;k.
  const partPointe = moy("Rb") / RcMoy;
  const Rbk = Rck * partPointe, Rsk = Rck - Rbk;
  const Rccrk = (refoulement ? 0.7 : 0.5) * Rbk + 0.7 * Rsk;
  const Rtcrk = 0.7 * Rtk;
  return {
    applicable: true, procedure: "pieu modèle", N, xiMoy, xiMin, xiPrime, Sretenue, gRd1c, gRd1t,
    RcMoy, RcMin, RtMoy, RtMin, moyenneGouverne, Rbk, Rsk, Rck, Rtk, Rccrk, Rtcrk,
    calcul: valeursCalculEC7({ Rbk, Rsk, Rck, Rtk, Rccrk, Rtcrk }),
  };
}
