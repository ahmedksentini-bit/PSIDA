/**
 * Choix des performances d'un dispositif de retenue (DR) en bord libre d'ouvrage d'art — méthode de calcul de l'indice
 * de danger du guide méthodologique Cerema « Choix des performances d'un dispositif de retenue sur ouvrage d'art —
 * Méthode de calcul de l'indice de danger » (novembre 2021, remplace le guide technique GC SETRA de 2002).
 *
 *   ID = ID1 + max(ID2 ; ID3), arrondi à l'entier supérieur (§ 2.2.2.6)
 *   ID1 = ID1.1 + … + ID1.6 (probabilité de sortie de chaussée) ; ID2 = max(ID2.1 ; ID2.2) (conséquences pour les occupants) ;
 *   ID3 = K × max(ID3.1 ; … ; ID3.4) (conséquences pour les tiers), K selon le trafic poids lourds et son type.
 *   Niveau minimal (tableau 18) : ID < 19 → N ; 19–26 → H2/L2 ; 27–38 → H3/L3 ; ≥ 39 → H4b/L4b.
 * Les trafics sont les trafics à 15 ans : T15 = 1,25 × trafic actuel (sauf ouvrage provisoire).
 */

const pick = (rows, v) => { for (const [lim, val] of rows) if (v < lim) return val; return rows[rows.length - 1][1]; };

/** Tableau 1 : ID1.1 selon T15 (véh/j, deux sens). */
export const id11 = T15 => (T15 < 1 ? 0 : pick([[300, 5], [500, 6], [800, 7], [1500, 8], [3000, 10], [5000, 11], [10000, 12], [15000, 14], [30000, 15], [60000, 17], [Infinity, 19]], T15));

/** Tableaux 2 et 3 : rayons R_m et R_dn (m) par référentiel / configuration. */
export const RAYONS = {
  'ARP R60': [120, 600], 'ARP R80': [240, 900], 'ARP T80': [240, 900], 'ARP T100': [425, 1300],
  'ICTAAL L1': [600, 1000], 'ICTAAL L2': [400, 650], 'ICTAAL relief difficile': [240, 650],
  'VSA 70': [200, 200], 'VSA 90': [240, 370], 'VSA 90 dévers 5 %': [255, 370], 'VSA 110': [400, 650], 'VSA 110 dévers 5 %': [420, 650],
  'Route 2×1 voie': [240, 400], 'Route 2×1 voie, créneau de dépassement': [400, 650],
  'Branche ICTAAL 110 (2 voies)': [400, 650], 'Branche ICTAAL 90': [240, 370], 'Branche ICTAAL 70 (1 voie)': [125, 300],
  'Branche VSA cat. A': [125, 185], 'Branche VSA cat. B': [54, 75], 'Bretelle VSA cat. C': [20, 75], 'Branche VSA 70': [25, 25],
};

/** Tableau 4 : ID1.2 (tracé en plan, point le plus défavorable à ± 50 m de l'ouvrage) ; R = Infinity en alignement droit. */
export function id12({ R, Rm, Rdn, existant = false }) {
  if (!(R < Infinity)) return 0;
  if (R >= 1.5 * Rdn) return 0;
  if (R >= Rdn) return 1;
  if (R >= Rm) return 2;
  return 4;                          // R < R_m : cas d'un ouvrage existant (non admis pour un ouvrage neuf)
}

/** Tableau 5 : ID1.3 (pente moyenne sur 300 m incluant une extrémité de l'ouvrage, en %) : 0 sous 4 %, +2 par tranche de 3 % au-delà. */
export const id13 = p => (Math.abs(p) < 4 ? 0 : 2 * (Math.floor((Math.abs(p) - 4) / 3 + 1e-12) + 1));

/** Tableau 6 : ID1.4 — point de conflit (carrefour, bretelle) dans la distance d'arrêt. */
export const id14 = conflit => (conflit ? 2 : 0);

/** Tableau 7 : ID1.5 — longueur de franchissement L_F (m) ; L_F < 10 m : hors méthode (obstacle). */
export const id15 = LF => (LF < 10 ? null : pick([[20, 1], [40, 2], [80, 3], [160, 4], [Infinity, 5]], LF));

/** Tableau 8 : ID1.6 — viabilité hivernale : 'prioritaire' (ou sans risque) 0, 'secondaire' 1, 'non traite' 2. */
export const id16 = vh => ({ prioritaire: 0, secondaire: 1, 'non traite': 2 })[vh] ?? 0;

/** Tableau 9 : ID2.1 — hauteur de chute h_c (m) au point le plus défavorable (au-dessus de l'eau : niveau moyen annuel). */
export const id21 = hc => pick([[2, 0], [4, 1], [6, 3], [Infinity, 5]], hc);
/** Tableau 10 : ID2.2 — hauteur d'eau P (m) au niveau moyen annuel. */
export const id22 = P => (P >= 2 ? 5 : 0);

/** Tableau 11 : ID3.1 — trafic de la voie franchie (véh/j, un sens si sens unique, deux sens sinon). */
export const id31 = T => (T < 1000 ? 0 : T < 10000 ? 4 : 8);
/** Tableau 12 : ID3.2 — trains réguliers par jour (deux sens). */
export const id32 = N => (N < 1 ? 0 : N <= 25 ? 3 : N <= 75 ? 5 : 8);
/** Tableau 13 : ID3.3 — habitations dans la zone de chute : 'aucune' 0, 'faible' (1 à 10 habitants) 4, 'forte' 8. */
export const id33 = h => ({ aucune: 0, faible: 4, forte: 8 })[h] ?? 0;
/** Tableau 14 : ID3.4 — zones sensibles : 'aucune' 0, 'sensible' 4, 'tres sensible' 8. */
export const id34 = z => ({ aucune: 0, sensible: 4, 'tres sensible': 8 })[z] ?? 0;

/** Tableaux 15 et 16 : coefficient K selon le trafic PL à 15 ans (PL/j) et le type de trafic. */
export function coefK(PL15, type = 'moyen') {
  const col = PL15 < 300 ? 0 : PL15 < 1000 ? 1 : PL15 < 5000 ? 2 : 3;
  return { local: [1, 1, 1, 1.8], moyen: [1, 1.8, 1.8, 2.6], long: [1.8, 1.8, 2.6, 2.6] }[type][col];
}

/** Tableau 18 : niveau de retenue minimal recommandé. */
export function niveauRetenue(ID) {
  if (ID < 19) return { niveau: 'N', probleme: 'véhicules légers', bornes: [null, 18] };
  if (ID < 27) return { niveau: 'H2 / L2', probleme: 'poids lourds', bornes: [19, 26] };
  if (ID < 39) return { niveau: 'H3 / L3', probleme: 'poids lourds', bornes: [27, 38] };
  return { niveau: 'H4b / L4b', probleme: 'poids lourds', bornes: [39, null] };
}

/**
 * Indice de danger complet.
 * @param {object} d T (trafic actuel, véh/j), PL (poids lourds actuels, PL/j), typePL ('local'|'moyen'|'long'),
 *   provisoire, R, Rm, Rdn, existant, pente (%), conflit, LF (m), vh, hc (m), P (m), Tfranchie, trains, habitat, zone,
 *   pietons (piétons + cycles par jour), voieFerree, routeImportante (autoroute / RN / RD 1re cat. franchie, ouvrage neuf
 *   avec PL > 13 t ou engins agricoles), vitesse (km/h)
 */
export function indiceDanger(d) {
  const f = d.provisoire ? 1 : 1.25;
  const T15 = (d.T || 0) * f, PL15 = (d.PL || 0) * f;
  const s = {
    'ID1.1': id11(T15), 'ID1.2': id12({ R: d.R ?? Infinity, Rm: d.Rm ?? 0, Rdn: d.Rdn ?? 0, existant: d.existant }), 'ID1.3': id13(d.pente || 0),
    'ID1.4': id14(!!d.conflit), 'ID1.5': id15(d.LF ?? 10), 'ID1.6': id16(d.vh || 'prioritaire'),
    'ID2.1': id21(d.hc || 0), 'ID2.2': id22(d.P || 0),
    'ID3.1': id31((d.Tfranchie || 0) * f), 'ID3.2': id32(d.trains || 0), 'ID3.3': id33(d.habitat || 'aucune'), 'ID3.4': id34(d.zone || 'aucune'),
  };
  const alerts = [];
  if (s['ID1.5'] === null) { alerts.push('Longueur de franchissement L_F < 10 m : hors du domaine de la méthode (ouvrage traité comme un obstacle, § 2.2.2.2).'); s['ID1.5'] = 0; }
  if ((d.vitesse ?? 90) < 70) alerts.push('Vitesse limite < 70 km/h (milieu urbain ou périurbain) : méthode applicable avec précaution, certains sous-indices peuvent être écartés ; V85 à considérer (§ 2.2.2.2).');
  if (d.R < d.Rm && !d.existant) alerts.push('Rayon inférieur au rayon minimal R_m : non admis pour un ouvrage neuf.');
  const ID1 = s['ID1.1'] + s['ID1.2'] + s['ID1.3'] + s['ID1.4'] + s['ID1.5'] + s['ID1.6'];
  const ID2 = Math.max(s['ID2.1'], s['ID2.2']);
  const K = coefK(PL15, d.typePL || 'moyen');
  const ID3 = K * Math.max(s['ID3.1'], s['ID3.2'], s['ID3.3'], s['ID3.4']);
  const brut = ID1 + Math.max(ID2, ID3);
  const ID = Math.ceil(brut - 1e-9);
  const niv = niveauRetenue(ID);
  // § 2.2.3 : cas particuliers imposant un niveau minimal
  const ordre = ['N', 'H2 / L2', 'H3 / L3', 'H4b / L4b'];
  let niveau = niv.niveau;
  const special = [];
  if ((d.trains || 0) > 0 || d.voieFerree) { special.push('Franchissement d\'une voie ferrée : H2 au minimum quelle que soit la vitesse (exigence SNCF Réseau, § 2.2.3.1), sur l\'ouvrage et ses abords (50 m de part et d\'autre hors agglomération).'); if (ordre.indexOf(niveau) < 1) niveau = 'H2 / L2'; }
  if (d.routeImportante) { special.push('Franchissement d\'une autoroute, route nationale ou départementale de 1re catégorie (ouvrage neuf, trafic régulier de PL > 13 t, cars ou engins agricoles) : H2 au minimum (§ 2.2.3).'); if (ordre.indexOf(niveau) < 1) niveau = 'H2 / L2'; }
  const proche = [18, 26, 38].includes(ID);
  // § 2.3 : objectifs secondaires
  const sub = PL15 < 1 ? 0 : PL15 < 300 ? 1 : PL15 < 1000 ? 2 : PL15 < 5000 ? 3 : 4;
  const ID1VL = ID1 - sub;
  const secondaire = [];
  if (ID1VL > 15) secondaire.push(`Véhicules légers : ID1 − ${sub} = ${ID1VL} > 15 → privilégier un dispositif de classe de sévérité A (à défaut B) (§ 2.3.2).`);
  if (K >= 2.6 && ((d.trains || 0) > 0 || (d.Tfranchie || 0) * f >= 10000 || d.habitat === 'forte' || d.zone === 'tres sensible')) secondaire.push('Écran de retenue des chargements à envisager (K = 2,6 et franchissement d\'une voie ferrée, d\'une voie très circulée, d\'un habitat dense ou d\'une zone très sensible, § 2.3.1).');
  if ((d.pietons || 0) > 750) secondaire.push('Plus de 750 piétons et cycles par jour : dispositif de retenue en bord de chaussée (séparation des modes actifs), largeur de fonctionnement compatible avec l\'espace disponible (§ 2.3.3).');
  else secondaire.push('Sans dispositif séparé, le dispositif de bord libre doit aussi assurer la fonction de garde-corps pour piétons (XP P98-405) ; hauteur 1,00 m (jusqu\'à 1,40 m pour les cycles, 1,80 m pour les cavaliers) (§ 2.3.3).');
  return { T15, PL15, s, ID1, ID2, K, ID3, brut, ID, niveauIndice: niv.niveau, niveau, probleme: niv.probleme, proche, special, secondaire, alerts, ID1VL };
}

/**
 * Efforts sur le tablier dus à un choc de véhicule sur le dispositif de retenue (EN 1991-2 § 4.7.3.3, tableau 4.9(n),
 * valeurs recommandées) : force horizontale transversale de la classe choisie (A 100, B 200, C 400, D 600 kN) appliquée
 * 0,1 m sous le haut du dispositif (et au plus 1,0 m au-dessus de la chaussée) sur 0,5 m de longueur, avec la charge
 * verticale concomitante 0,75 α_Q1 Q_1k ; diffusion à 45° jusqu'à la section d'encastrement de l'encorbellement.
 * La classe à retenir dépend du dispositif choisi et de l'annexe nationale (à confirmer).
 */
export const CLASSES_CHOC = { A: 100, B: 200, C: 400, D: 600 };
export function chocSurDispositif({ classe = 'C', hDR = 1.0, eDalle = 0.25, dEnc = 1.0, alphaQ1 = 1 }) {
  const F = CLASSES_CHOC[classe], h = Math.min(hDR - 0.1, 1.0) + eDalle / 2;
  const larg = 0.5 + 2 * dEnc;                         // diffusion à 45° sur la distance à l'encastrement
  return { F, h, larg, mHorizontal: F * h / larg, Fv: 0.75 * alphaQ1 * 300, mVertical: 0.75 * alphaQ1 * 300 * dEnc / larg };
}
