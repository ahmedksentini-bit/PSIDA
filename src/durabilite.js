/**
 * Durabilité : classe de résistance minimale selon la classe d'exposition et enrobage nominal (EN 1992-1-1 § 4.4.1).
 *
 *  - Classe de résistance minimale : EN 1992-1-1 annexe E, tableau E.1N (valeurs indicatives, « EC2 ») ou NF EN 206/CN
 *    (France, 50 ans : XC1–XC2 C20/25 ; XC3, XC4, XD1, XF1, XF2 C25/30 ; XD2, XS1, XS2, XF3, XF4, XA1 C30/37 ; XD3, XS3, XA2
 *    C35/45 ; XA3 C40/50). La classe retenue est la plus exigeante des classes d'exposition données.
 *  - Classe structurale (tableau 4.3N, valeurs recommandées) : S4 pour 50 ans ; +2 pour une durée d'utilisation de 100 ans ;
 *    −1 si la résistance atteint le seuil du tableau (X0, XC1 : C30/37 ; XC2/XC3 : C35/45 ; XC4, XD1, XD2/XS1 : C40/50 ;
 *    XD3/XS2/XS3 : C45/55) ; −1 pour un élément de géométrie de dalle ; −1 si une maîtrise particulière de la qualité est
 *    assurée ; bornée à S1–S6.
 *  - c_min,dur (tableau 4.4N, armatures de béton armé) ; c_min = max(c_min,b = φ ; c_min,dur ; 10 mm) ; c_nom = c_min + Δc_dev
 *    (10 mm recommandé, § 4.4.1.3). Les classes XF et XA n'interviennent que sur la classe de résistance.
 */

const ORDRE = ['X0', 'XC1', 'XC2', 'XC3', 'XC4', 'XD1', 'XD2', 'XD3', 'XS1', 'XS2', 'XS3', 'XF1', 'XF2', 'XF3', 'XF4', 'XA1', 'XA2', 'XA3'];
export const CLASSES_EXPOSITION = ORDRE;

const FCK_MIN = {
  EC2: { X0: 12, XC1: 20, XC2: 25, XC3: 30, XC4: 30, XD1: 30, XD2: 30, XD3: 35, XS1: 30, XS2: 35, XS3: 35, XF1: 30, XF2: 25, XF3: 30, XF4: 30, XA1: 30, XA2: 30, XA3: 35 },
  CN: { X0: 0, XC1: 20, XC2: 20, XC3: 25, XC4: 25, XD1: 25, XD2: 30, XD3: 35, XS1: 30, XS2: 30, XS3: 35, XF1: 25, XF2: 25, XF3: 30, XF4: 30, XA1: 30, XA2: 35, XA3: 40 },
};
const CUBE = { 12: 15, 16: 20, 20: 25, 25: 30, 30: 37, 35: 45, 40: 50, 45: 55, 50: 60, 55: 67, 60: 75 };
export const nomClasse = fck => `C${fck}/${CUBE[fck] ?? Math.round(fck * 1.22)}`;

// colonnes du tableau 4.4N : X0, XC1, XC2/XC3, XC4, XD1/XS1, XD2/XS2, XD3/XS3
const COL = { X0: 0, XC1: 1, XC2: 2, XC3: 2, XC4: 3, XD1: 4, XS1: 4, XD2: 5, XS2: 5, XD3: 6, XS3: 6 };
const T44 = [
  [10, 10, 10, 15, 20, 25, 30],   // S1
  [10, 10, 15, 20, 25, 30, 35],   // S2
  [10, 10, 20, 25, 30, 35, 40],   // S3
  [10, 15, 25, 30, 35, 40, 45],   // S4
  [15, 20, 30, 35, 40, 45, 50],   // S5
  [20, 25, 35, 40, 45, 50, 55],   // S6
];
// seuils de résistance du tableau 4.3N (réduction d'une classe), par colonne
const SEUIL = [30, 30, 35, 40, 40, 40, 45];

/** Liste de classes « XC4, XA2 » ou « XC4/XA2 » → classes reconnues, dans l'ordre normalisé. */
export function lireExpositions(txt) {
  const L = String(txt || '').toUpperCase().split(/[\s,;/+]+/).map(s => s.trim()).filter(Boolean);
  const ok = L.filter(s => ORDRE.includes(s));
  return ok.length ? [...new Set(ok)].sort((a, b) => ORDRE.indexOf(a) - ORDRE.indexOf(b)) : ['XC4'];
}

/**
 * @param {object} o { expo (texte ou liste), fck [MPa], phi [mm] (plus gros diamètre des barres extérieures), vie [ans],
 *   dalle (géométrie de dalle), qualite (maîtrise particulière), ref ('EC2' | 'CN'), dcDev [mm] }
 * @returns { expos, fckMin, classeMin, okBeton, S, cminDur, cmin, cnom [mm], colonne, detailsS }
 */
export function durabilite({ expo = 'XC4', fck = 30, phi = 16, vie = 100, dalle = false, qualite = false, ref = 'EC2', dcDev = 10 } = {}) {
  const expos = Array.isArray(expo) ? expo : lireExpositions(expo), T = FCK_MIN[ref] || FCK_MIN.EC2;
  let fckMin = 0, critique = null;
  for (const e of expos) if ((T[e] ?? 0) > fckMin) { fckMin = T[e]; critique = e; }
  // colonne la plus sévère du tableau 4.4N parmi les classes de corrosion
  const cols = expos.filter(e => e in COL).map(e => COL[e]), col = cols.length ? Math.max(...cols) : 0;
  const det = ['S4 (50 ans)'];
  let S = 4;
  if (vie >= 100) { S += 2; det.push('+2 (100 ans)'); }
  if (fck >= SEUIL[col]) { S -= 1; det.push(`−1 (béton ≥ ${nomClasse(SEUIL[col])})`); }
  if (dalle) { S -= 1; det.push('−1 (géométrie de dalle)'); }
  if (qualite) { S -= 1; det.push('−1 (maîtrise de la qualité)'); }
  S = Math.min(6, Math.max(1, S));
  const cminDur = T44[S - 1][col], cmin = Math.max(phi, cminDur, 10), cnom = cmin + dcDev;
  return { expos, ref, fckMin, classeMin: fckMin ? nomClasse(fckMin) : '—', critique, okBeton: fck >= fckMin, S, detailsS: det.join(' '), colonne: col, cminDur, cmin, cnom, dcDev, phi, fck, vie };
}

/** Texte court de la vérification (note, tableaux). */
export function texteDurabilite(D, { enrobage = null, objet = 'armatures extérieures' } = {}) {
  const r = D.ref === 'CN' ? 'NF EN 206/CN' : 'EN 1992-1-1 tableau E.1N';
  return `Durabilité (${D.expos.join(', ')}, ${D.vie} ans) : béton ${nomClasse(D.fck)} ${D.okBeton ? '≥' : '<'} ${D.classeMin} (${r}) ; classe structurale S${D.S} (${D.detailsS}) ; c_min,dur = ${D.cminDur} mm (tableau 4.4N), c_min = ${D.cmin} mm, c_nom = c_min + Δc_dev = ${D.cnom} mm${enrobage != null ? ` ; enrobage des ${objet} ${Math.round(enrobage)} mm ${enrobage >= D.cnom - 1e-6 ? '≥' : '<'} c_nom` : ''}.`;
}
