/**
 * Effets de l'eau d'un cours d'eau sur les piles : pression hydrodynamique du courant, embâcles, poussée d'Archimède et
 * affouillement local.
 *
 * — Courant (EN 1991-1-6 § 4.9, expression 4.1) : F_wa = ½ k_wa ρ_wa h b v_wa², k_wa = 1,44 (section carrée ou
 *   rectangulaire) ou 0,70 (section circulaire) ; h hauteur d'eau au droit de l'appui, b largeur de l'obstacle, v_wa
 *   vitesse moyenne sur la hauteur. Hypothèse PSIDA : pression triangulaire nulle au fond et maximale en surface
 *   (figure 4.1), résultante à 2h/3 au-dessus du lit.
 * — Embâcles (expression 4.2) : F_deb = k_deb A_deb v_wa², k_deb = 666 kg/m³ (valeur recommandée), A_deb aire de
 *   l'obstruction ; résultante au centre du radeau d'embâcles, sous la surface libre.
 * — Affouillement local (FHWA HEC-18, équation CSU) : y_s = 2,0 K₁ K₂ K₃ a^0,65 y₁^0,35 Fr^0,43, Fr = v/√(g y₁) ;
 *   K₁ forme de l'avant-bec (carré 1,1 ; arrondi, cylindre, groupe de cylindres 1,0 ; pointu 0,9 ; 1,0 si θ > 5°),
 *   K₂ = (cos θ + L/a sin θ)^0,65 (L/a ≤ 12), K₃ état du lit (eaux claires, fond plat, petites dunes 1,1 ; dunes moyennes
 *   1,1 à 1,2 ; grandes dunes 1,3) ; plafond y_s ≤ 2,4 a (Fr ≤ 0,8) ou 3,0 a (Fr > 0,8).
 * Unités : m, m/s, kN.
 */
const RHO_W = 1000, G = 9.81, K_DEB = 666;

export const NEZ = {
  carre: { label: 'avant-bec carré', K1: 1.1, kwa: 1.44 },
  rond: { label: 'avant-bec arrondi', K1: 1.0, kwa: 1.44 },
  cylindre: { label: 'cylindre', K1: 1.0, kwa: 0.70 },
  groupe: { label: 'groupe de cylindres', K1: 1.0, kwa: 0.70 },
  pointu: { label: 'avant-bec pointu', K1: 0.9, kwa: 1.44 },
};

/** Force du courant (kN) et sa hauteur d'application au-dessus du lit. */
export function currentForce({ h, b, v, kwa = 1.44 }) {
  if (!(h > 0 && b > 0 && v > 0)) return { F: 0, z: 0, p0: 0 };
  const F = 0.5 * kwa * RHO_W * h * b * v * v / 1000;
  return { F, z: 2 * h / 3, p0: 2 * F / (h * b) };     // p0 : pression en surface du diagramme triangulaire (kPa)
}

/** Force due aux embâcles (kN), radeau de hauteur hDeb et de largeur bDeb sous la surface libre. */
export function debrisForce({ h, v, hDeb, bDeb }) {
  if (!(hDeb > 0 && bDeb > 0 && v > 0)) return { F: 0, z: 0, A: 0 };
  const hd = Math.min(hDeb, h), A = hd * bDeb;
  return { F: K_DEB * A * v * v / 1000, z: h - hd / 2, A };
}

/** Affouillement local d'une pile (HEC-18, CSU). a largeur, L longueur de la pile, y1 hauteur d'eau, v vitesse, θ en degrés. */
export function localScour({ a, L = a, y1, v, theta = 0, nez = 'rond', K3 = 1.1 }) {
  if (!(a > 0 && y1 > 0 && v > 0)) return { ys: 0, Fr: 0, K1: 1, K2: 1, K3 };
  const Fr = v / Math.sqrt(G * y1);
  const K1 = theta > 5 ? 1.0 : (NEZ[nez] || NEZ.rond).K1;
  const t = theta * Math.PI / 180, La = Math.min(12, Math.max(1, L / a));
  const K2 = (Math.cos(t) + La * Math.sin(t)) ** 0.65;
  const ysCSU = 2.0 * K1 * K2 * K3 * a ** 0.65 * y1 ** 0.35 * Fr ** 0.43;
  const cap = (Fr <= 0.8 ? 2.4 : 3.0) * a;
  return { ys: Math.min(ysCSU, cap), ysCSU, cap, capped: ysCSU > cap, Fr, K1, K2, K3, La };
}

/**
 * Bilan pour une pile en rivière.
 * @param {object} w { h hauteur d'eau (PHE − lit), v, theta, nez, K3, hGen affouillement général + de contraction (m),
 *   hDeb, bDeb (embâcles) }
 * @param {object} pier { type 'voile' | 'colonnes', b épaisseur du voile, Lv longueur, D diamètre, nCol, entraxe des colonnes,
 *   Hf hauteur du fût, dBed profondeur de la face supérieure de la semelle sous le lit (D_e − h_s) }
 */
export function pierWater(w, pier) {
  const col = pier.type === 'colonnes';
  const nez = col ? (pier.nCol > 1 ? 'groupe' : 'cylindre') : (w.nez || 'rond');
  const t = (w.theta || 0) * Math.PI / 180;
  // largeur d'obstacle perpendiculaire au courant : voile a cos θ + L sin θ ; colonnes : n D (pas d'effet de masque, sécuritaire)
  const a = col ? pier.D : pier.b, L = col ? (pier.nCol - 1) * (pier.s || 0) + pier.D : pier.Lv;
  const bProj = col ? pier.nCol * pier.D : a * Math.cos(t) + L * Math.sin(t);
  const hw = Math.max(0, Math.min(w.h, pier.Hf - pier.dBed));       // hauteur mouillée du fût au-dessus du lit
  const cur = currentForce({ h: hw, b: bProj, v: w.v, kwa: (NEZ[nez] || NEZ.rond).kwa });
  const deb = debrisForce({ h: hw, v: w.v, hDeb: w.hDeb, bDeb: w.bDeb || bProj });
  const sc = localScour({ a, L: col ? pier.D : L, y1: w.h, v: w.v, theta: w.theta || 0, nez, K3: w.K3 ?? 1.1 });
  const dAff = sc.ys + (w.hGen || 0);
  // moment en pied de fût (face supérieure de semelle), bras = dBed + z
  const F = cur.F + deb.F, M = cur.F * (pier.dBed + cur.z) + deb.F * (pier.dBed + deb.z);
  // volume immergé du fût entre la semelle et le niveau des PHE (poussée d'Archimède, ρ g V)
  const Ashaft = col ? pier.nCol * Math.PI * pier.D ** 2 / 4 : pier.b * pier.Lv;
  const Vshaft = Ashaft * Math.min(pier.Hf, pier.dBed + w.h);
  return { nez, a, L, bProj, hw, cur, deb, F, M, zEq: F > 0 ? M / F : 0, scour: sc, dAff, Ushaft: 10 * Vshaft, Vshaft };
}
