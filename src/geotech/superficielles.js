// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/superficielles.js) — module testé de fond.ksr-infra.org (170 tests).
// Fondations superficielles — Fascicule 62 titre V (partie B, annexes B.1, B.2,
// E.2, F.1) et NF P94-261 (Eurocode 7), telle qu'expliquée par le guide Cerema
// « Eurocode 7 – Application aux fondations superficielles » (2015).
//
// Unités : B, L, D, e en m · pl*, qc en MPa · contraintes q en kPa · V, H en kN
// (kN/m pour une semelle filante) · angles en degrés à l'entrée.

import { RAD, horsDomaine, integrer } from "./outils.js";

// ───────────────────────────── Géométrie ──────────────────────────────────

/** Aire de la semelle (m², ou m²/m pour une filante calculée au mètre). */
export function aire({ forme, B, L }) {
  if (forme === "filante") return B;
  if (forme === "circulaire") return (Math.PI * B * B) / 4;
  if (forme === "carree") return B * B;
  return B * L;
}

/** B/L conventionnel : 0 pour une filante, 1 pour une carrée ou circulaire. */
export function rapportBL({ forme, B, L }) {
  if (forme === "filante") return 0;
  if (forme === "carree" || forme === "circulaire") return 1;
  return Math.min(B / L, 1);
}

// ─────────────────────────── Excentrement ─────────────────────────────────

/**
 * Coefficient ie et surface effective A' (NF P94-261 annexe Q, guide Cerema
 * tableau 15), et critères de limitation de l'excentrement (tableaux 8 et 9).
 * e = M/V ; eB selon la largeur B, eL selon la longueur L.
 */
export function excentrementEC7({ forme, B, L = B, eB = 0, eL = 0 }) {
  const A = aire({ forme, B, L });
  const e = Math.abs(eB), f = Math.abs(eL);
  let ie, critere;
  if (forme === "circulaire") {
    const R = B / 2;
    if (e >= R) return horsDomaine("résultante hors de la semelle (e ≥ R)");
    ie = (2 * Math.acos(e / R)) / Math.PI - ((2 * e) / (Math.PI * R)) * Math.sqrt(1 - (e / R) ** 2);
    critere = 1 - (2 * e) / B;
  } else if (forme === "filante") {
    ie = 1 - (2 * e) / B;
    critere = ie;
  } else {
    ie = (1 - (2 * e) / B) * (1 - (2 * f) / L);
    critere = ie;
  }
  if (!(ie > 0)) return horsDomaine("résultante hors de la semelle : aucune surface comprimée");
  const limites = forme === "circulaire"
    ? { ELU: 3 / 40, ELS_car: 9 / 16, ELS_QP: 3 / 4 }
    : { ELU: 1 / 15, ELS_car: 1 / 2, ELS_QP: 2 / 3 };
  const verif = (lim) => ({ valeur: critere, limite: lim, ok: critere >= lim - 1e-12 });
  return {
    applicable: true, A, ie, Aprime: A * ie, critere,
    Bprime: forme === "circulaire" ? null : B - 2 * e,
    Lprime: forme === "rectangulaire" || forme === "carree" ? L - 2 * f : null,
    limites,
    ELU: verif(limites.ELU), ELS_car: verif(limites.ELS_car), ELS_QP: verif(limites.ELS_QP),
  };
}

/**
 * Diagramme des contraintes sous une semelle rigide (F62 B.2.2,1) : plan,
 * sol sans traction. Excentrement selon B seulement. Contraintes en kPa.
 * Renvoie qmax, qmin, la largeur comprimée, la fraction comprimée et q'ref
 * (F62 B.2.2,2) : q'ref = (3 q'max + q'min)/4 ; ou, modèle de Meyerhof,
 * la contrainte uniforme V/[(B − 2e) L].
 */
export function diagramme({ forme = "filante", B, L = 1, V, e = 0 }) {
  const Lc = forme === "filante" ? 1 : L;
  const ea = Math.abs(e);
  const A = B * Lc;
  let qmax, qmin, Bc;
  if (ea <= B / 6 + 1e-12) {
    qmax = (V / A) * (1 + (6 * ea) / B);
    qmin = (V / A) * (1 - (6 * ea) / B);
    Bc = B;
  } else {
    Bc = 3 * (B / 2 - ea);
    if (Bc <= 0) return horsDomaine("résultante hors de la semelle : diagramme impossible");
    qmax = (2 * V) / (Bc * Lc);
    qmin = 0;
  }
  const meyerhof = V / ((B - 2 * ea) * Lc);
  return {
    applicable: true, qmax, qmin, Bc, fraction: Bc / B,
    trapeze: ea <= B / 6 + 1e-12,
    qrefTrapeze: (3 * qmax + qmin) / 4,
    qrefMeyerhof: meyerhof,
  };
}

/**
 * Critères du Fascicule 62 sur la surface comprimée (B.3.2, B.3.3) :
 * ≥ 10 % sous combinaisons ultimes, ≥ 75 % sous combinaisons rares,
 * 100 % sous combinaisons fréquentes (et quasi permanentes).
 */
export const FRACTION_MIN_F62 = { ELU: 0.10, ELS_rare: 0.75, ELS_freq: 1, ELS_QP: 1 };

export function surfaceComprimeeF62({ B, e, etat }) {
  const d = diagramme({ B, V: 1, e });
  if (!d.applicable) return d;
  const min = FRACTION_MIN_F62[etat];
  return { applicable: true, fraction: d.fraction, minimum: min, ok: d.fraction >= min - 1e-9, eLimite: eLimiteF62(B, min) };
}

/** Excentrement maximal correspondant à une fraction comprimée donnée (semelle rectangulaire). */
export function eLimiteF62(B, fraction) {
  if (fraction >= 1) return B / 6;
  return B / 2 - (fraction * B) / 3;
}

// ────────────────────── Épaisseur hr et paramètres équivalents ─────────────

/** Épaisseur conventionnelle hr (guide Cerema tableau 10, formule corrigée). */
export function hrEC7({ forme, B, L = B, eB = 0, eL = 0, etat = "ELU" }) {
  if (etat !== "ELU") return 1.5 * B;
  if (forme === "circulaire") {
    return 1 - (2 * Math.abs(eB)) / B >= 9 / 16 ? 1.5 * B : (8 * B) / 3 - (16 * Math.abs(eB)) / 3;
  }
  if (forme === "filante") {
    return 1 - (2 * Math.abs(eB)) / B >= 1 / 2 ? 1.5 * B : 3 * B - 6 * Math.abs(eB);
  }
  const produit = (1 - (2 * Math.abs(eB)) / B) * (1 - (2 * Math.abs(eL)) / L);
  return produit >= 1 / 2 ? 1.5 * B : Math.min(3 * B - 6 * Math.abs(eB), 3 * L - 6 * Math.abs(eL), 1.5 * B);
}

/**
 * Pression limite nette équivalente : moyenne géométrique sur [z0, z1]
 * (NF P94-261 formule D.2.2 ; F62 annexe E.2, § 2.1,2), pondérée par les
 * épaisseurs : ln ple* = (1/h) ∫ ln pl*(z) dz.
 */
export function moyenneGeometrique({ fn, ruptures = [] }, z0, z1) {
  const h = z1 - z0;
  const ln = integrer((z) => Math.log(fn(z)), z0, z1, ruptures);
  return Math.exp(ln / h);
}

/** Moyenne arithmétique sur [z0, z1]. */
export function moyenneArithmetique({ fn, ruptures = [] }, z0, z1) {
  return integrer(fn, z0, z1, ruptures) / (z1 - z0);
}

/** ple* sous une semelle, EC7 : moyenne géométrique sur [D, D + hr]. */
export function pleEC7({ profil, D, hr }) {
  return { ple: moyenneGeometrique(profil, D, D + hr), z0: D, z1: D + hr };
}

/**
 * ple* sous une semelle, Fascicule 62 (annexe E.2, § 2.1) :
 *  · terrain non homogène : moyenne géométrique sur [D, D + 1,5 B] ;
 *  · terrain homogène à profil linéaire pl*(z) = a z + b : pl*(D + 2B/3).
 */
export function pleF62({ profil, D, B, lineaire = null }) {
  if (lineaire) return { ple: lineaire.a * (D + (2 * B) / 3) + lineaire.b, z0: D, z1: D + 1.5 * B, mode: "linéaire" };
  return { ple: moyenneGeometrique(profil, D, D + 1.5 * B), z0: D, z1: D + 1.5 * B, mode: "géométrique" };
}

/**
 * Résistance de pointe équivalente qce (EC7 formule E.2.2.1 ; F62 annexe E.2,
 * § 3) : moyenne de qc écrêté à 1,3 qcm, qcm étant la moyenne de qc lissé.
 */
export function qceMoyenneEcretee(profil, z0, z1) {
  const qcm = moyenneArithmetique(profil, z0, z1);
  const ecrete = { fn: (z) => Math.min(profil.fn(z), 1.3 * qcm), ruptures: profil.ruptures };
  return { qce: moyenneArithmetique(ecrete, z0, z1), qcm, z0, z1 };
}

export function qceEC7({ profil, D, hr }) {
  return qceMoyenneEcretee(profil, D, D + hr);
}

/** F62 : intervalle [D − b, D + 3a], a = max(B/2 ; 0,5 m), b = min(a ; h). */
export function qceF62({ profil, D, B, h = 0 }) {
  const a = B > 1 ? B / 2 : 0.5;
  const b = Math.min(a, h);
  return { ...qceMoyenneEcretee(profil, D - b, D + 3 * a), a, b };
}

/**
 * Hauteur d'encastrement équivalente (F62 annexe E.2, § 4 ; NF P94-261 C.2) :
 * De = (1/ref) ∫_d^D f(z) dz, f = pl* ou qc, ref = ple* ou qce.
 */
export function De({ profil, d = 0, D, reference }) {
  if (D <= d) return 0;
  return integrer(profil.fn, d, D, profil.ruptures) / reference;
}

// ───────────────────────── Facteurs de portance ───────────────────────────

/** Fascicule 62 annexe B.1 tableau I : kp = k0 [1 + a (0,6 + 0,4 B/L) De/B]. */
export const KP_F62 = {
  "argile-A": [0.8, 0.25], "craie-A": [0.8, 0.25],
  "argile-B": [0.8, 0.35], "argile-C": [0.8, 0.50],
  "sable-A": [1.0, 0.35], "sable-B": [1.0, 0.50], "sable-C": [1.0, 0.80],
  "craie-B": [1.3, 0.27], "craie-C": [1.3, 0.27],
  "marne-A": [1.0, 0.27], "marne-B": [1.0, 0.27], "roche-A": [1.0, 0.27], "roche-B": [1.0, 0.27],
};

/** Fascicule 62 annexe B.2 tableau I : kc = k0 [1 + a (0,6 + 0,4 B/L) De/B]. */
export const KC_F62 = {
  "argile-A": [0.32, 0.35], "argile-B": [0.32, 0.35], "argile-C": [0.32, 0.35],
  "sable-A": [0.14, 0.35], "sable-B": [0.11, 0.50], "sable-C": [0.08, 0.80],
  "craie-B": [0.17, 0.27],
};

function facteurF62(table, nom, { classe, B, L, forme, De }) {
  const ligne = table[classe];
  if (!ligne) return horsDomaine(`classe ${classe} absente du tableau de ${nom} du Fascicule 62`);
  const BL = rapportBL({ forme, B, L });
  const DeB = De / B;
  const [k0, a] = ligne;
  const k = k0 * (1 + a * (0.6 + 0.4 * BL) * DeB);
  return {
    applicable: true, k, k0, a, BL, DeB,
    avertissement: DeB >= 1.5 ? "De/B ≥ 1,5 : fondation semi-profonde (annexe D du Fascicule 62)" : null,
  };
}

export const kpF62 = (p) => facteurF62(KP_F62, "kp", p);
export const kcF62 = (p) => facteurF62(KC_F62, "kc", p);

/**
 * NF P94-261 tableaux D.2.3 (kp) et E.2.3 (kc) — guide Cerema tableaux 11 et 13 :
 * k = k0 + (a + b De/B)(1 − e^(−c De/B)), pour B/L = 0 (filante) et B/L = 1
 * (carrée ou circulaire), puis interpolation linéaire en B/L. Au-delà de
 * De/B = 2, k = kmax (fondation semi-profonde : hors du domaine du guide).
 */
export const KP_EC7 = {
  argile: { filante: { a: 0.2, b: 0.02, c: 1.3, k0: 0.8, kmax: 1.022 }, carree: { a: 0.3, b: 0.02, c: 1.5, k0: 0.8, kmax: 1.123 } },
  sable: { filante: { a: 0.3, b: 0.05, c: 2, k0: 1.0, kmax: 1.393 }, carree: { a: 0.22, b: 0.18, c: 5, k0: 1.0, kmax: 1.580 } },
  craie: { filante: { a: 0.28, b: 0.22, c: 2.8, k0: 0.8, kmax: 1.517 }, carree: { a: 0.35, b: 0.31, c: 3, k0: 0.8, kmax: 1.768 } },
  marne: { filante: { a: 0.2, b: 0.2, c: 3, k0: 0.8, kmax: 1.399 }, carree: { a: 0.2, b: 0.3, c: 3, k0: 0.8, kmax: 1.598 } },
};
KP_EC7.roche = KP_EC7.marne;

export const KC_EC7 = {
  argile: { filante: { a: 0.07, b: 0.007, c: 1.3, k0: 0.27, kmax: 0.348 }, carree: { a: 0.1, b: 0.007, c: 1.5, k0: 0.27, kmax: 0.378 } },
  sable: { filante: { a: 0.04, b: 0.006, c: 2, k0: 0.09, kmax: 0.141 }, carree: { a: 0.03, b: 0.02, c: 5, k0: 0.09, kmax: 0.160 } },
  craie: { filante: { a: 0.04, b: 0.03, c: 3, k0: 0.11, kmax: 0.210 }, carree: { a: 0.05, b: 0.04, c: 3, k0: 0.11, kmax: 0.240 } },
};
KC_EC7.marne = KC_EC7.craie;
KC_EC7.roche = KC_EC7.craie;

const loiEC7 = ({ a, b, c, k0 }, DeB) => k0 + (a + b * DeB) * (1 - Math.exp(-c * DeB));

function facteurEC7(table, nom, { categorie, B, L, forme, De }) {
  const lignes = table[categorie];
  if (!lignes) return horsDomaine(`catégorie « ${categorie} » absente du tableau de ${nom} de la NF P94-261`);
  const BL = rapportBL({ forme, B, L });
  const DeB = De / B;
  const x = Math.min(DeB, 2);
  const kFil = loiEC7(lignes.filante, x);
  const kCar = loiEC7(lignes.carree, x);
  return {
    applicable: true, k: kFil * (1 - BL) + kCar * BL, kFilante: kFil, kCarree: kCar, BL, DeB,
    parametres: lignes,
    avertissement: DeB > 1.5 ? "De/B > 1,5 : fondation semi-profonde, hors du domaine du guide Cerema" : null,
  };
}

export const kpEC7 = (p) => facteurEC7(KP_EC7, "kp", p);
export const kcEC7 = (p) => facteurEC7(KC_EC7, "kc", p);

// ─────────────── Inclinaison de la charge et proximité d'un talus ──────────

/** Fascicule 62 annexe F.1 : Φ1(δ) = (1 − δ/90)², δ en degrés. */
export const phi1 = (delta) => (1 - delta / 90) ** 2;

/** Φ2(δ) = (1 − δ/90)² (1 − e^(−De/B)) + [max(1 − δ/45 ; 0)]² e^(−De/B). */
export function phi2(delta, DeB) {
  const E = Math.exp(-DeB);
  return (1 - delta / 90) ** 2 * (1 - E) + Math.max(1 - delta / 45, 0) ** 2 * E;
}

/** Ψ(β, d/B) = 1 − 0,9 tanβ (2 − tanβ) [max(1 − d/8B ; 0)]² — Corté et Garnier. */
export function psiTalus(beta, dB) {
  const t = Math.tan(beta * RAD);
  return 1 - 0.9 * t * (2 - t) * Math.max(1 - dB / 8, 0) ** 2;
}

/**
 * Coefficient minorateur iδβ du Fascicule 62 (annexe F.1).
 * sol : "coherent" | "frottant" ; delta en degrés ; talus : { beta, d, sens }
 * avec sens = "exterieur" | "interieur" (inclinaison vers l'extérieur ou
 * l'intérieur du talus). La règle du talus n'existe que pour les sols
 * frottants à pente ≤ 1/1.
 */
export function idbF62({ sol, delta = 0, B, De = 0, talus = null }) {
  const DeB = De / B;
  if (!talus) {
    const i = sol === "coherent" ? phi1(delta) : phi2(delta, DeB);
    return { applicable: true, i, formule: sol === "coherent" ? "Φ1(δ)" : "Φ2(δ)" };
  }
  if (sol === "coherent") return horsDomaine("le Fascicule 62 (annexe F.1, § 3) ne traite le talus que pour les sols frottants");
  if (talus.beta > 45 + 1e-9) return horsDomaine("pente plus raide que 1/1 : hors du domaine de l'annexe F.1");
  const psi = psiTalus(talus.beta, talus.d / B);
  const betaP = 45 * (1 - Math.sqrt(psi));
  if (!delta) return { applicable: true, i: phi2(betaP, DeB), psi, betaPrime: betaP, formule: "Φ2(β′)" };
  if (talus.sens === "interieur") {
    const a = phi2(delta, DeB), b = phi2(Math.abs(betaP - delta), DeB);
    return { applicable: true, i: Math.min(a, b), psi, betaPrime: betaP, formule: "min[Φ2(δ) ; Φ2(|β′ − δ|)]" };
  }
  return { applicable: true, i: phi2(delta + betaP, DeB), psi, betaPrime: betaP, formule: "Φ2(δ + β′)" };
}

/**
 * iδ de la NF P94-261 (formules D.2.4.1 à D.2.4.4). δ en degrés en entrée
 * (converti en radians), sol : "coherent" | "frottant" | "mixte" ;
 * pour « mixte », c' (kPa), γ' (kN/m³) et φ' (degrés) sont requis.
 */
export function idEC7({ sol, delta, B, De = 0, c = 0, gamma = 20, phi = 30 }) {
  const d = Math.abs(delta) * RAD;
  const u = (2 * d) / Math.PI;
  const E = Math.exp(-De / B);
  const ic = (1 - u) ** 2;
  const ifr = d < Math.PI / 4 ? (1 - u) ** 2 - u * (2 - 3 * u) * E : (1 - u) ** 2 * (1 - E);
  if (sol === "coherent") return { applicable: true, i: ic, ic, iF: ifr };
  if (sol === "frottant") return { applicable: true, i: ifr, ic, iF: ifr };
  const expo = Math.exp((-0.6 * c) / (gamma * B * Math.tan(phi * RAD)));
  return { applicable: true, i: ifr + (ic - ifr) * (1 - expo), ic, iF: ifr };
}

/**
 * iβ de la NF P94-261 (formules D.2.5.1 à D.2.5.3). β en degrés, d distance
 * horizontale de l'arête inférieure de la semelle au talus.
 */
export function ibEC7({ sol, beta, d, B, De = 0, c = 0, gamma = 20, phi = 30 }) {
  if (beta >= 45 - 1e-12) return horsDomaine("talus d'inclinaison ≥ 45° : hors du domaine expérimental (centrifugeuse)");
  const b = beta * RAD, t = Math.tan(b);
  const ic = d < 8 * B ? 1 - (b / Math.PI) * (1 - d / (8 * B)) ** 2 : 1;
  const dEq = d + (t > 0 ? De / t : Infinity);
  const ifr = dEq < 8 * B ? 1 - 0.9 * t * (2 - t) * (1 - dEq / (8 * B)) ** 2 : 1;
  if (sol === "coherent") return { applicable: true, i: ic, ic, iF: ifr };
  if (sol === "frottant") return { applicable: true, i: ifr, ic, iF: ifr };
  const expo = Math.exp((-0.6 * c) / (gamma * B * Math.tan(phi * RAD)));
  return { applicable: true, i: ifr + (ic - ifr) * (1 - expo), ic, iF: ifr };
}

/**
 * Cumul talus + inclinaison (NF P94-261 D.2.6.1) : produit iβ·iδ si la charge
 * s'incline vers l'extérieur du talus ; sinon (effets antagonistes)
 * iδβ = min(iβ/iδ ; iδ).
 */
export function cumulEC7({ id, ib, sens = "exterieur" }) {
  if (sens === "interieur") return { i: Math.min(ib / id, id), formule: "min(iβ/iδ ; iδ)" };
  return { i: ib * id, formule: "iβ · iδ" };
}

// ─────────────────────────── Justifications ───────────────────────────────

/** Coefficients γq du Fascicule 62 (B.3.1) sur (q'u − q'0). */
export const GAMMA_Q_F62 = { ELU: 2, ELU_acc: 2, ELS_rare: 3 };

/**
 * Portance, Fascicule 62 : q'ref ≤ (q'u − q'0) iδβ / γq + q'0.
 * qnette = kp·ple* (ou kc·qce) en kPa ; q0 contrainte verticale effective
 * après travaux au niveau de la base, en kPa.
 */
export function portanceF62({ qnette, q0, idb = 1, qref, etat = "ELU" }) {
  const gq = GAMMA_Q_F62[etat];
  if (!gq) return horsDomaine(`état « ${etat} » non vérifié en portance par le Fascicule 62`);
  const qadm = (qnette * idb) / gq + q0;
  return { applicable: true, gammaQ: gq, qu: qnette + q0, qadm, qref, taux: qref / qadm, ok: qref <= qadm + 1e-9 };
}

/** γR;v de la NF P94-261 (guide Cerema tableau 19) et coefficient de modèle γR;d;v. */
export const GAMMA_RV_EC7 = { ELU: 1.4, ELU_acc: 1.2, ELS_car: 2.3, ELS_QP: 2.3 };
export const GAMMA_RDV_EC7 = { pressio: 1.2, penetro: 1.2 };

/**
 * Portance, EC7 : Vd − R0 ≤ Rv;d = A·ie·qnet / (γR;v γR;d;v), R0 = A·q0.
 * qnet en kPa, q0 en kPa, Vd en kN (kN/m pour une filante).
 */
export function portanceEC7({ A, ie = 1, qnet, q0 = 0, Vd, etat = "ELU", methode = "pressio" }) {
  const gRv = GAMMA_RV_EC7[etat];
  const gRdv = GAMMA_RDV_EC7[methode] ?? 1.2;
  if (!gRv) return horsDomaine(`état « ${etat} » non vérifié en portance par la NF P94-261`);
  const Rvd = (A * ie * qnet) / (gRv * gRdv);
  const R0 = A * q0;
  return { applicable: true, gammaRv: gRv, gammaRdv: gRdv, Rvd, R0, Vd, taux: (Vd - R0) / Rvd, ok: Vd - R0 <= Rvd + 1e-9 };
}

/**
 * Glissement, Fascicule 62 (B.3.4) : Hd ≤ Vd tanφ'/γg1 + c'·A'/γg2, avec
 * γg1 = 1,2 et γg2 = 1,5. A' surface comprimée (m² ou m²/m). c' est
 * plafonné à 75 kPa, comme le recommande le commentaire du fascicule.
 */
export function glissementF62({ Vd, Hd, phi, c = 0, Aprime }) {
  const cRet = Math.min(c, 75);
  const Rf = (Vd * Math.tan(phi * RAD)) / 1.2;
  const Rc = (cRet * Aprime) / 1.5;
  return { applicable: true, Rf, Rc, R: Rf + Rc, Hd, taux: Hd / (Rf + Rc), ok: Hd <= Rf + Rc + 1e-9, cPlafonnee: c > 75 };
}

/** γR;h (tableau 20 du guide) et coefficient de modèle γR;d;h = 1,1 (guide Cerema). */
export const GAMMA_RH_EC7 = { ELU: 1.1, ELU_acc: 1.0 };
export const GAMMA_RDH_EC7 = 1.1;

/**
 * Glissement, NF P94-261 (formules 10.1.3 et 10.1.4).
 *  · drainé : Rh;d = Vd tanδa;k / (γR;h γR;d;h), δa;k = φ'crit (coulé en
 *    place) ou 2/3 φ'crit (préfabriqué lisse) ; c' est négligée ;
 *  · non drainé : Rh;d = min[A' cu / (γR;h γR;d;h) ; 0,4 Vd].
 */
export function glissementEC7({ Vd, Hd, drainage = "draine", phiCrit = 30, prefabrique = false, cu = 0, Aprime = 0, etat = "ELU", Rpd = 0 }) {
  const gRh = GAMMA_RH_EC7[etat];
  if (!gRh) return horsDomaine(`état « ${etat} » : le glissement ne se vérifie qu'aux ELU`);
  let Rhd, detail;
  if (drainage === "non-draine") {
    const a = (Aprime * cu) / (gRh * GAMMA_RDH_EC7), b = 0.4 * Vd;
    Rhd = Math.min(a, b);
    detail = { termeCohesion: a, plafond: b };
  } else {
    const delta = prefabrique ? (2 / 3) * phiCrit : phiCrit;
    Rhd = (Vd * Math.tan(delta * RAD)) / (gRh * GAMMA_RDH_EC7);
    detail = { delta };
  }
  const R = Rhd + Rpd;
  return { applicable: true, gammaRh: gRh, gammaRdh: GAMMA_RDH_EC7, Rhd, Rpd, R, Hd, taux: Hd / R, ok: Hd <= R + 1e-9, ...detail };
}

// ─────────────────── Répartition des contraintes (EC7) ─────────────────────

/**
 * Contrainte de référence de la NF P94-261 annexe G pour une semelle filante :
 * trapèze (e < B/6) → σ = V/B + 3Ve/B² (aux 3/4 du bord décomprimé) ;
 * triangle (e ≥ B/6) → σ = V/(B − 2e), comme Meyerhof.
 */
export function contrainteReferenceEC7({ V, B, e }) {
  const ea = Math.abs(e);
  if (ea < B / 6) return { sigma: V / B + (3 * V * ea) / (B * B), forme: "trapèze" };
  return { sigma: V / (B - 2 * ea), forme: "triangle" };
}
