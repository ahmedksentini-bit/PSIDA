/**
 * Charges de trafic routier — Fascicule 61 titre II (CPC, 1971, mod. 1981) :
 * classes de ponts, voies, système A(l), système B (Bc, Bt, Br), charges militaires Mc120,
 * convoi exceptionnel D240, coefficients de majoration dynamique.
 *
 * ⚠ Les tableaux a1, bc, bt sont reproduits de mémoire d'ingénieur : à relire contre le
 *   texte du Fascicule 61 titre II (art. 4 et 5) avant toute utilisation en production.
 *   Les valeurs marquées TODO_VERIF sont celles dont on est le moins sûr.
 */

/**
 * Classe du pont (art. 3) d'après la largeur roulable Lr [m] :
 *   1ère classe : Lr ≥ 7 m ; 2ème : 5,50 < Lr < 7 ; 3ème : Lr ≤ 5,50 m.
 * (Un pont peut être surclassé par le maître d'ouvrage : paramètre explicite possible.)
 */
export function classePont(Lr) {
  if (Lr >= 7) return 1;
  if (Lr > 5.5) return 2;
  return 3;
}

/**
 * Nombre et largeur des voies de circulation (art. 2) :
 *   Lc largeur chargeable = largeur roulable − 0,50 m par dispositif de retenue (glissière/barrière).
 *   n_v = E(Lc/3) (sauf 5 ≤ Lc < 6 m : 2 voies de Lc/2) ; largeur de voie v = Lc / n_v.
 */
export function voiesF61(Lc) {
  if (Lc >= 5 && Lc < 6) return { nv: 2, v: Lc / 2 };
  const nv = Math.max(1, Math.floor(Lc / 3));
  return { nv, v: Lc / nv };
}

/** Coefficient a1 (art. 4.2) selon la classe et le nombre de voies chargées (index 1..5). TODO_VERIF classes 2 et 3. */
export const A1 = {
  1: [1.0, 1.0, 0.9, 0.75, 0.7],
  2: [1.0, 0.9, 0.9, 0.75, 0.7],
  3: [0.9, 0.8, 0.8, 0.75, 0.7],
};
/** Largeur de référence v0 pour a2 = v0 / v (art. 4.2). */
export const V0 = { 1: 3.5, 2: 3.0, 3: 2.75 };

/**
 * Système A(l) (art. 4) : A(l) = 2,3 + 360/(l + 12) [kN/m²], l longueur chargée [m].
 * Charge à appliquer : q = a1 · a2 · A(l), avec a1·A(l) ≥ 4 − 0,002·l [kN/m²].
 * @returns {{A:number, a1:number, a2:number, q:number}} q en kN/m²
 */
export function chargeA(l, { classe = 1, nVoiesChargees = 1, v = 3.5 } = {}) {
  const A = 2.3 + 360 / (l + 12);
  const a1 = A1[classe][Math.min(nVoiesChargees, 5) - 1];
  const a2 = V0[classe] / v;
  const a1A = Math.max(a1 * A, 4 - 0.002 * l);
  return { A, a1, a2, q: a2 * a1A };
}

/**
 * Système Bc (art. 5.2) : camion de 300 kN (essieu avant 60 kN, deux essieux arrière de 120 kN),
 * distances 4,50 m et 1,50 m ; au plus 2 camions par file, distants de 4,50 m (arrière → avant) ;
 * largeur d'encombrement 2,50 m, voie des roues 2,00 m ; impact roue arrière 0,25 × 0,25 m, avant 0,20 × 0,20 m.
 * Coefficient bc selon la classe et le nombre de files (index 1..5). TODO_VERIF classes 2 et 3.
 */
export const BC = {
  axlesOneTruck: [{ d: 0, P: 60 }, { d: 4.5, P: 120 }, { d: 6.0, P: 120 }],
  pitchMin: 10.5, // pas minimal entre essieux avant de deux camions d'une même file (encombrement 10,50 m) ; espacement libre au-delà
  axlesTwoTrucks: [{ d: 0, P: 60 }, { d: 4.5, P: 120 }, { d: 6.0, P: 120 }, { d: 10.5, P: 60 }, { d: 15.0, P: 120 }, { d: 16.5, P: 120 }],
  wheelTrack: 2.0, width: 2.5,
  contactRear: { x: 0.25, y: 0.25 }, contactFront: { x: 0.2, y: 0.2 },
  bc: { 1: [1.2, 1.1, 0.95, 0.8, 0.7], 2: [1.0, 1.0, 0.95, 0.8, 0.7], 3: [1.0, 0.8, 0.8, 0.8, 0.7] },
};

/**
 * Système Bt (art. 5.3) : tandem de 2 essieux de 160 kN distants de 1,35 m, voie des roues 2,00 m,
 * impact 0,60 (transv.) × 0,25 (long.) ; au plus 2 tandems (ponts de 1ère et 2ème classe seulement).
 * bt = 1,0 (1ère classe), 0,9 (2ème classe).
 */
export const BT = {
  axles: [{ d: 0, P: 160 }, { d: 1.35, P: 160 }],
  // chaque tandem circule dans l'axe d'une bande longitudinale de 3 m (art. 5.3) — confirmé par la note
  // PSIDA.EL commentée (coefficient Bt 1,023 = moyenne des K aux roues ±0,5 et ±2,5 m de l'axe)
  wheelTrack: 2.0, width: 3.0, contact: { x: 0.25, y: 0.6 },
  bt: { 1: 1.0, 2: 0.9, 3: null },
};

/** Système Br (art. 5.4) : roue isolée de 100 kN, impact 0,60 (transv.) × 0,30 (long.). */
export const BR = { P: 100, contact: { x: 0.3, y: 0.6 } };

/**
 * Coefficient de majoration dynamique du système B (art. 5.5) et des charges militaires (art. 9) :
 *   δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4 G/S)
 * @param {number} L longueur de la travée (ou de l'élément) [m]
 * @param {number} G poids total de cette travée (charges permanentes) [kN]
 * @param {number} S poids total maximal des charges du système considéré sur cette travée [kN]
 */
export function deltaDyn(L, G, S) {
  return deltaDynRaw(L, G, S);
}

/**
 * S (art. 5.5) : poids total le plus élevé des essieux d'une file qu'il est possible de placer sur la
 * longueur L (fenêtre glissante sur le convoi). Ex. Bc 2 camions : 300 kN sur 9,75 m, 420 kN sur 13,93 m.
 */
export function maxAxleLoadOnLength(axles, L) {
  // (pour Bc : convoi de 2 camions au pas minimal, cas le plus chargé sur une longueur donnée)
  let best = 0;
  for (let i = 0; i < axles.length; i++) {
    let s = 0;
    for (let k = i; k < axles.length && axles[k].d - axles[i].d <= L + 1e-9; k++) s += axles[k].P;
    best = Math.max(best, s);
  }
  return best;
}

function deltaDynRaw(L, G, S) {
  return 1 + 0.4 / (1 + 0.2 * L) + 0.6 / (1 + 4 * G / S);
}

/**
 * Convoi militaire Mc120 (art. 9) : deux chenilles de 6,10 × 1,00 m, entraxe 3,30 m (largeur hors tout 4,30 m),
 * poids total 1100 kN → 550 kN par chenille → 90,16 kN/m par chenille. Un seul engin par voie, dans le sens
 * longitudinal un seul convoi à la fois (distance minimale entre convois ≥ 30,50 m).
 */
export const MC120 = { P: 1100, trackLength: 6.1, trackWidth: 1.0, trackSpacing: 3.3, qTrack: 550 / 6.1 };

/** Convoi exceptionnel D240 (art. 10) : 2400 kN uniformément répartis sur 18,60 × 3,20 m ; sans majoration dynamique. */
export const D240 = { P: 2400, length: 18.6, width: 3.2, q: 2400 / 18.6 };

/** Charges sur trottoirs (art. 6) : 1,50 kN/m² sur ponts routes (cumulables avec A et B), 4,50 kN/m² pour calcul local. */
export const TROTTOIR = { q: 1.5, qLocal: 4.5 };

/** Coefficients de pondération BAEL 91 (A.3.3) pour les combinaisons avec Fasc. 61 (ponts routes). */
export const COMBI_BAEL = {
  ELU: { G: 1.35, Gfav: 1.0, A: 1.6, B: 1.6, Mc: 1.35, D: 1.35, trottoir: 1.6 },
  ELS: { G: 1.0, A: 1.2, B: 1.2, Mc: 1.0, D: 1.0, trottoir: 1.0 },
};
