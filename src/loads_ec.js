/**
 * Charges de trafic routier — EN 1991-2 (Eurocode 1 partie 2), modèles LM1, LM2, LM4,
 * voies conventionnelles, coefficients d'ajustement α (annexe nationale).
 *
 * Références : EN 1991-2:2003 §4.2.3 (voies conventionnelles, tableau 4.1), §4.3.2 (LM1,
 * tableau 4.2), §4.3.3 (LM2), §4.3.5 (LM4), §5.3.2.1 (charges sur trottoirs, q_fk) ;
 * NF EN 1991-2/NA (classes de trafic 1 et 2).
 *
 * Toutes les charges sont en kN, kN/m, kN/m². Les effets dynamiques sont inclus dans LM1/LM2.
 */

/** Coefficients d'ajustement α (EN 1991-2 §4.3.2(3)). */
export const EC_ALPHA = {
  /** Valeurs recommandées de l'EN (pays sans annexe nationale, ex. Tunisie) : toutes = 1. */
  recommended: { label: 'EN 1991-2 valeurs recommandées (α = 1)', aQ: [1, 1, 1], aq1: 1, aq2: 1, aqr: 1 },
  /** NF EN 1991-2/NA — 1ère classe de trafic (trafic lourd international). À vérifier sur l'annexe. */
  FR1: { label: 'NF EN 1991-2/NA classe 1', aQ: [1, 1, 1], aq1: 1, aq2: 1.2, aqr: 1.2 },
  /** NF EN 1991-2/NA — 2ème classe de trafic (ouvrages courants). À vérifier sur l'annexe. */
  FR2: { label: 'NF EN 1991-2/NA classe 2', aQ: [0.9, 0.8, 0.8], aq1: 0.7, aq2: 1.0, aqr: 1.0 },
};

/**
 * Voies conventionnelles (EN 1991-2 tableau 4.1).
 * @param {number} w largeur de chaussée entre bordures/dispositifs de retenue [m]
 * @returns {{n:number, wl:number, wr:number}} nombre de voies, largeur de voie, largeur de l'aire résiduelle
 */
export function notionalLanes(w) {
  if (w < 5.4) return { n: 1, wl: 3, wr: Math.max(0, w - 3) };
  if (w < 6) return { n: 2, wl: w / 2, wr: 0 };
  const n = Math.floor(w / 3);
  return { n, wl: 3, wr: w - 3 * n };
}

/**
 * Modèle LM1 par voie (tableau 4.2) avec coefficients α.
 * TS : tandem de 2 essieux espacés de 1,20 m, roues au pas de 2,00 m, surface d'impact 0,40 × 0,40 m.
 * UDL : charge uniformément répartie sur la voie (et sur l'aire résiduelle).
 * @param {number} nLanes nombre de voies conventionnelles
 * @param {object} alpha jeu de coefficients (EC_ALPHA.*)
 * @returns {{lanes:{i:number, Qk:number, qk:number, Q:number, q:number}[], qr:number}}
 *   Q = charge d'un essieu du tandem (kN), q = UDL (kN/m²), qr = UDL aire résiduelle (kN/m²)
 */
export function lm1(nLanes, alpha = EC_ALPHA.recommended) {
  const Qk = [300, 200, 100], qk = [9, 2.5, 2.5];
  const lanes = [];
  for (let i = 0; i < nLanes; i++) {
    const Q0 = i < 3 ? Qk[i] : 0, q0 = i === 0 ? qk[0] : 2.5;
    const aQ = i < 3 ? alpha.aQ[i] : 1, aq = i === 0 ? alpha.aq1 : alpha.aq2;
    lanes.push({ i: i + 1, Qk: Q0, qk: q0, Q: aQ * Q0, q: aq * q0 });
  }
  return { lanes, qr: alpha.aqr * 2.5 };
}

/** Géométrie du tandem TS : essieux (distance, charge) et roues (excentricité relative au centre de voie). */
export const TS_GEOM = { axleSpacing: 1.2, wheelTrack: 2.0, contact: { x: 0.4, y: 0.4 } };

/**
 * Modèle LM2 (§4.3.3) : essieu isolé 400·βQ kN, roues au pas de 2,00 m, impact 0,35 (transv.) × 0,60 (long.).
 * βQ = αQ1 (valeur recommandée).
 */
export function lm2(alpha = EC_ALPHA.recommended) {
  const beta = alpha.aQ[0];
  return { Q: 400 * beta, wheelTrack: 2.0, contact: { x: 0.6, y: 0.35 } };
}

/** LM4 : foule, 5 kN/m² (valeur caractéristique) ; charges sur trottoirs q_fk = 5 kN/m², valeur de combinaison avec gr1a : 3 kN/m². */
export const LM4 = { q: 5 };
export const FOOTWAY = { qfk: 5, qfkCombi: 3 };

/**
 * Groupes de charges (tableau 4.4a) utilisés pour les ponts-dalles :
 *  gr1a : LM1 (TS + UDL) + trottoirs 3 kN/m² (valeur de combinaison)
 *  gr1b : LM2 seul
 *  gr3  : trottoirs 5 kN/m² seuls
 *  gr5  : LM3 (convois spéciaux, annexe A) + LM1 fréquent sur les autres voies (non implémenté ici)
 */
export const GROUPS = ['gr1a', 'gr1b', 'gr3'];

/** Coefficients partiels et de combinaison usuels (EN 1990 A2) pour les charges routières. */
export const COMBI = {
  gammaG: 1.35, gammaGfav: 1.0, gammaQ: 1.35,
  psi0: { TS: 0.75, UDL: 0.40, footway: 0.40, gr1b: 0, gr3: 0 },
  psi1: { TS: 0.75, UDL: 0.40, footway: 0.40, gr1b: 0.75, gr3: 0 },
  psi2: { TS: 0, UDL: 0, footway: 0, gr1b: 0, gr3: 0 },
};
