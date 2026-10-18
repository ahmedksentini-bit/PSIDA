// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/tassements.js) — module testé de fond.ksr-infra.org.
// Tassements et module de réaction des fondations superficielles.
//  · méthode pressiométrique de Ménard : Fascicule 62 annexe F.2, § 3 ;
//    NF P94-261 annexe H (même formule, pondération de Ed retouchée) ;
//  · méthode pénétrométrique de Schmertmann : NF P94-261 annexe I ;
//  · méthode élastique (abaques de Giroud) et œdométrique : annexe J
//    et Fascicule 62 annexe F.2, § 2 ;
//  · module de réaction : Fascicule 62 annexe F.3 (repris par le guide Cerema).
//
// Unités : contraintes en kPa, modules en MPa à l'entrée, tassements en mm à la sortie.

import { horsDomaine, interpoler, moyenneHarmonique, integrer } from "./outils.js";

export const B0 = 0.6; // largeur de référence de Ménard (m)

/** Coefficients de forme λc, λd (F62 annexe F.2 ; NF P94-261 tableau H.2.1.1.3). */
const TABLE_LAMBDA = [[1, 1.10, 1.12], [2, 1.20, 1.53], [3, 1.30, 1.78], [5, 1.40, 2.14], [20, 1.50, 2.65]];

export function lambdas({ forme, B, L = B }) {
  if (forme === "circulaire") return { lc: 1, ld: 1, rapport: "cercle" };
  const r = forme === "filante" ? 20 : Math.max(L / B, 1);
  return {
    lc: interpoler(TABLE_LAMBDA.map(([x, c]) => [x, c]), r),
    ld: interpoler(TABLE_LAMBDA.map(([x, , d]) => [x, d]), r),
    rapport: r,
  };
}

/**
 * Modules équivalents des 16 tranches d'épaisseur B/2 sous la semelle :
 * Ei = moyenne harmonique de EM dans la tranche i (profil par couches).
 * Renvoie aussi les regroupements E3,5, E6,8 et E9,16.
 */
export function tranchesMenard({ profilEM, D, B, n = 16 }) {
  const h = B / 2;
  const E = [];
  for (let i = 0; i < n; i++) {
    const z0 = D + i * h, z1 = z0 + h;
    const inv = integrer((z) => 1 / profilEM.fn(z), z0, z1, profilEM.ruptures) / h;
    E.push(1 / inv);
  }
  return { E, ...regrouper(E) };
}

/** E3,5, E6,8, E9,16 : moyennes harmoniques des tranches correspondantes. */
export function regrouper(E) {
  const mh = (a, b) => (E.length >= b ? moyenneHarmonique(E.slice(a - 1, b)) : null);
  return { E1: E[0], E2: E[1], E35: mh(3, 5), E68: mh(6, 8), E916: mh(9, 16) };
}

/**
 * Module déviatorique Ed.
 *  EC7 (formule H.2.1.2.4) : 1/Ed = 0,25/E1 + 0,3/E2 + 0,25/E3,5 + 0,1/E6,8 + 0,1/E9,16
 *  F62 (annexe F.2)       : 4/Ed = 1/E1 + 1/(0,85 E2) + 1/E3,5 + 1/(2,5 E6,8) + 1/(2,5 E9,16)
 * Profondeur connue : 16 tranches (8 B), 8 tranches (4 B) ou 5 tranches (2,5 B).
 * Moins de tranches connues ⇒ on suppose le sol plus raide en dessous (formules
 * H.2.1.2.6 et H.2.1.2.7 ; « 3,6/Ed » et « 3,2/Ed » au Fascicule 62).
 */
export function moduleEd({ E1, E2, E35, E68 = null, E916 = null, referentiel = "EC7" }) {
  if (referentiel === "EC7") {
    if (E916) return 1 / (0.25 / E1 + 0.3 / E2 + 0.25 / E35 + 0.1 / E68 + 0.1 / E916);
    if (E68) return 1 / (0.25 / E1 + 0.3 / E2 + 0.25 / E35 + 0.2 / E68);
    return 1 / (0.25 / E1 + 0.3 / E2 + 0.45 / E35);
  }
  if (E916) return 4 / (1 / E1 + 1 / (0.85 * E2) + 1 / E35 + 1 / (2.5 * E68) + 1 / (2.5 * E916));
  if (E68) return 3.6 / (1 / E1 + 1 / (0.85 * E2) + 1 / E35 + 1 / (2.5 * E68));
  return 3.2 / (1 / E1 + 1 / (0.85 * E2) + 1 / E35);
}

/**
 * Tassement final de Ménard : sf = sc + sd,
 *   sc = α/(9 Ec) · (q' − σ'v0) · λc · B
 *   sd = 2/(9 Ed) · (q' − σ'v0) · B0 · (λd B/B0)^α
 * q', σ'v0 en kPa ; Ec, Ed en MPa ; B en m. Tassements en mm.
 */
export function tassementMenard({ forme, B, L = B, q, sigmaV0 = 0, alpha, Ec, Ed }) {
  const dq = q - sigmaV0;
  if (dq <= 0) return { applicable: true, sc: 0, sd: 0, sf: 0, dq, lc: 1, ld: 1, remarque: "surcharge nette nulle ou négative" };
  const { lc, ld } = lambdas({ forme, B, L });
  const sc = (alpha / (9 * Ec * 1000)) * dq * lc * B;
  const sd = (2 / (9 * Ed * 1000)) * dq * B0 * (ld * B / B0) ** alpha;
  return { applicable: true, sc: sc * 1000, sd: sd * 1000, sf: (sc + sd) * 1000, dq, lc, ld };
}

/**
 * Module de réaction vertical (F62 annexe F.3 ; guide Cerema tableau 26) :
 *   1/kv = α B λc/(9 Ec) + 2 B0/(9 Ed) · (λd B/B0)^α ;  ki = 2 kv.
 * Sortie en kN/m³ (kPa/m) ; modules en MPa.
 */
export function moduleReaction({ forme, B, L = B, alpha, Ec, Ed }) {
  const { lc, ld } = lambdas({ forme, B, L });
  const inv = (alpha * B * lc) / (9 * Ec * 1000) + ((2 * B0) / (9 * Ed * 1000)) * (ld * B / B0) ** alpha;
  const kv = 1 / inv;
  return { kv, ki: 2 * kv, lc, ld };
}

/**
 * Condition de rigidité de la semelle pour utiliser k (F62 F.3, § 5) :
 * B ≤ 2 L0 avec L0 = (4 E I / (k B))^¼, soit B ≤ 2 (h³ E / (3 k))^¼ par mètre.
 * E en MPa, h en m, k en kN/m³.
 */
export function rigiditeSemelle({ B, h, E, k }) {
  const L0 = ((h ** 3 * E * 1000) / (3 * k)) ** 0.25;
  return { L0, ok: B <= 2 * L0, limite: 2 * L0 };
}

/**
 * Méthode de Schmertmann (NF P94-261 annexe I ; guide Cerema § 5.3).
 * forme : "carree" (circulaire) ou "filante" (L > 10 B). Les couches sont
 * repérées depuis la base de la semelle : [{ z0, z1, qc }], qc en MPa.
 *   E = 2,5 qc (carrée) ou 3,5 qc (filante) ;
 *   s = C1 C2 (q' − σ'v0) ∫ Iz /(C3 E) dz ;
 *   C1 = 1 − 0,5 σ'v0/(q' − σ'v0) ; C2 = 1 + 0,2 log(t/0,1) ; C3 = 1,25 ou 1,75 ;
 *   Izp = 0,5 + 0,1 √[(q' − σ'v0)/σ'vp], σ'vp au pic (B/2 ou B sous la base).
 */
export function schmertmann({ forme, B, q, sigmaV0, sigmaVp, t = 1, couches }) {
  const dq = q - sigmaV0;
  if (q < 1.5 * sigmaV0) return horsDomaine("q' < 1,5 σ'v0 : la méthode donnerait un tassement négatif (NF P94-261 § I)");
  const filante = forme === "filante";
  const C1 = 1 - (0.5 * sigmaV0) / dq;
  const C2 = 1 + 0.2 * Math.log10(t / 0.1);
  const C3 = filante ? 1.75 : 1.25;
  const kE = filante ? 3.5 : 2.5;
  const zp = filante ? B : B / 2;
  const zf = filante ? 4 * B : 2 * B;
  const I0 = filante ? 0.2 : 0.1;
  const Izp = 0.5 + 0.1 * Math.sqrt(dq / sigmaVp);
  const Iz = (z) => (z <= zp ? I0 + ((Izp - I0) * z) / zp : Math.max(0, (Izp * (zf - z)) / (zf - zp)));
  const detail = [];
  let somme = 0; // en m/MPa
  for (const c of couches) {
    const a = Math.max(c.z0, 0), b = Math.min(c.z1, zf);
    if (b <= a) continue;
    const E = kE * c.qc;
    const aireIz = integrer(Iz, a, b, [zp]);
    somme += aireIz / (C3 * E);
    detail.push({ ...c, E, aireIz });
  }
  const s = C1 * C2 * (dq / 1000) * somme; // m
  return { applicable: true, s: s * 1000, C1, C2, C3, Izp, zp, zf, detail };
}

/** Abaques de Giroud (NF P94-261 tableau J.3.1) : coefficient cf. */
const CF_RIGIDE = [[1, 0.88], [2, 1.21], [3, 1.43], [5, 1.72], [10, 2.18]];
const CF_SOUPLE_CENTRE = [[1, 1.12], [2, 1.53], [3, 1.78], [5, 2.10], [10, 2.58]];
const CF_SOUPLE_BORD = [[1, 0.56], [2, 0.76], [3, 0.89], [5, 1.05], [10, 1.27]];

export function coefficientCf({ forme, B, L = B, rigidite = "rigide", point = "centre" }) {
  if (forme === "circulaire") return rigidite === "rigide" ? 0.79 : point === "centre" ? 1.0 : 0.64;
  const r = Math.max(L / B, 1);
  if (rigidite === "rigide") return interpoler(CF_RIGIDE, r);
  return interpoler(point === "centre" ? CF_SOUPLE_CENTRE : CF_SOUPLE_BORD, r);
}

/** Tassement élastique (formule J.3.1) : s = (1 − ν²) q B cf / E. q kPa, E MPa. */
export function tassementElastique({ q, B, E, nu = 0.33, cf }) {
  return { s: ((1 - nu * nu) * q * B * cf) / (E * 1000) * 1000, cf };
}

/**
 * Tassement de consolidation d'une couche (NF P94-261 formules J.4.2.3.x ;
 * F62 annexe F.2 § 2.3) : branche surconsolidée en Cs, normalement
 * consolidée en Cc. Contraintes en kPa, H en m, résultat en mm.
 */
export function tassementOedometrique({ H, e0, Cc, Cs = 0, sigmaV0, sigmaP = sigmaV0, dSigma }) {
  const s1 = sigmaV0 + dSigma;
  let s;
  if (s1 <= sigmaP) s = (H / (1 + e0)) * Cs * Math.log10(s1 / sigmaV0);
  else s = (H / (1 + e0)) * (Cs * Math.log10(Math.max(sigmaP, sigmaV0) / sigmaV0) + Cc * Math.log10(s1 / Math.max(sigmaP, sigmaV0)));
  return { s: s * 1000, domaine: s1 <= sigmaP ? "surconsolidé" : "normalement consolidé" };
}

/**
 * Supplément de contrainte verticale sous l'axe d'une fondation (Boussinesq),
 * charge uniforme q (kPa) à la surface d'un massif élastique homogène.
 */
export function boussinesqAxe({ forme, B, L = B, q, z }) {
  if (z <= 0) return q;
  if (forme === "circulaire") {
    const R = B / 2;
    return q * (1 - (1 / (1 + (R / z) ** 2)) ** 1.5);
  }
  if (forme === "filante") {
    const th = Math.atan(B / (2 * z));
    return (q / Math.PI) * (2 * th + Math.sin(2 * th));
  }
  // Rectangle : quatre coins de a × b = (B/2) × (L/2).
  const a = B / 2, b = L / 2;
  const R1 = Math.hypot(a, z), R2 = Math.hypot(b, z), R3 = Math.sqrt(a * a + b * b + z * z);
  const coin = (1 / (2 * Math.PI)) * (Math.atan((a * b) / (z * R3)) + ((a * b * z) / R3) * (1 / (R1 * R1) + 1 / (R2 * R2)));
  return 4 * q * coin;
}
