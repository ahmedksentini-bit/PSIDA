/**
 * Stabilité latérale (déversement) des poutres préfabriquées pendant le levage et une fois posées sur leurs appareils,
 * avant le coulage du hourdis et des entretoises — méthode de Mast (R. F. Mast, « Lateral stability of long prestressed
 * concrete beams », PCI Journal, part 1 1989 et part 2 1993 ; PCI Design Handbook 8e éd. § 8.10 ; guide PCI « Recommended
 * practice for lateral stability of precast, prestressed concrete bridge girders », CB-02-16, 2016). L'EN 1992-1-1 § 5.9
 * demande d'examiner le déversement des poutres préfabriquées au transport et au montage mais ne donne qu'un critère
 * d'élancement (5.40b), vérifié aussi.
 *
 * Poutre suspendue à deux points de levage à a des extrémités (élingues verticales) : elle tourne autour de l'axe des points
 * de levage, à y_r au-dessus du centre de gravité. Déplacement latéral du centre de gravité sous son poids appliqué
 * latéralement (poutre basculée de 1 rad) : z₀ = w/(12 E I_y L) [l⁵/10 − a² l³ + 3 a⁴ l + 6 a⁵/5], l = L − 2a.
 * Excentricité initiale e_i = ⅔ × flèche latérale de fabrication (L/960 par défaut, tolérance PCI) + écart des points de
 * levage (6 mm par défaut) ; basculement initial θ_i = e_i / y_r.
 * Fissuration : la poutre basculée de θ reçoit le moment latéral θ M_g, la contrainte au coin de la table vaut
 * σ_haut + θ M_g (b_t/2)/I_y ; θ_max = (f_r − σ_haut)/(M_g b_t/(2 I_y)) avec f_r = f_ctm(t) (prudent : Mast retient le
 * module de rupture 0,62 √f_ck) et σ_haut la contrainte de la fibre supérieure au milieu (traction positive).
 *   FS_c = 1 / (z₀/y_r + θ_i/θ_max) ≥ 1,0 ;  rupture : θ'_max = 0,4 rad, z₀' = z₀ (1 + 2,5 θ'_max),
 *   FS_f = y_r θ'_max / (z₀' θ'_max + e_i) ≥ 1,5 (FS_f pris au moins égal à FS_c).
 * Poutre posée sur ses deux appareils (axe de roulis au niveau des appareils, à y sous le centre de gravité) : raideur de
 * rotation des deux appareils K_θ (NF EN 1337-3 § 5.3.3.7 : M = G a'⁵ b' α /(n t³ K_s), a' dimension dans le sens du
 * basculement), r = K_θ / W, dévers des appareils α ; FS_c = r (θ_max − α)/(z₀ θ_max + e_i + y θ_max) ≥ 1,0 ;
 * renversement : θ'_max = (z_max − h_r α)/r, z_max = a'/2, FS_r = r (θ'_max − α)/(z₀' θ'_max + e_i + y θ'_max) ≥ 1,5.
 * Contraintes de levage : poids ×(1 ± 0,15) (effets dynamiques de manutention, hypothèse PSIDA), compression ≤ 0,6 f_ck(t),
 * traction ≤ f_ctm(t).
 * Unités : m, kN, kPa (contraintes en MPa dans les sorties).
 */

/** Inertie d'un polygone autour de l'axe vertical passant par son centre de gravité (contour symétrique ou non). */
export function inertieVerticale(pts) {
  let A = 0, Sx = 0, Iyy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length], c = x1 * y2 - x2 * y1;
    A += c / 2; Sx += (x1 + x2) * c / 6; Iyy += (x1 * x1 + x1 * x2 + x2 * x2) * c / 12;
  }
  if (A < 0) { A = -A; Sx = -Sx; Iyy = -Iyy; }
  const xG = Sx / A;
  return Iyy - A * xG * xG;
}

/** Coefficient K_s de la NF EN 1337-3 (tableau 4) en fonction de b/a. */
const KS = [[0.5, 137], [0.75, 100.7], [1, 86.2], [1.2, 80.4], [1.25, 79.3], [1.3, 78.4], [1.4, 76.7], [1.5, 75.3], [1.6, 74.1], [1.7, 73.1], [1.8, 72.2], [1.9, 71.5], [2, 70.8], [2.5, 68.3], [10, 61.9]];
export function ksEN1337(r) {
  if (r <= KS[0][0]) return KS[0][1];
  for (let k = 1; k < KS.length; k++) if (r <= KS[k][0]) { const [r0, v0] = KS[k - 1], [r1, v1] = KS[k]; return v0 + (v1 - v0) * (r - r0) / (r1 - r0); }
  return 60;
}

/** z₀ de Mast (poids latéral w, appuis ou points de levage à a des extrémités). */
export function z0Mast({ w, L, a = 0, E, Iy }) {
  const l = L - 2 * a;
  return w / (12 * E * Iy * L) * (l ** 5 / 10 - a * a * l ** 3 + 3 * a ** 4 * l + 6 * a ** 5 / 5);
}

/**
 * @param o { L longueur de la poutre, w poids linéique [kN/m], A, I (axe fort), Iy (axe faible), vs, vi [m], bt largeur de table,
 *   P force de précontrainte au levage [kN], e excentricité du câble sous le centre de gravité [m] (au milieu ; P_a, e_a à
 *   l'about, câbles relevés), fck, fckT, fctmT, Ecm(t) [MPa],
 *   a distance des points de levage aux extrémités, hLev hauteur des points de levage au-dessus de la fibre supérieure,
 *   balayage (flèche latérale de fabrication, défaut L/960), eLev (écart des points de levage, 6 mm),
 *   appareil { a (sens du basculement), b, n, t, G (0,9 MPa), h (hauteur totale) } , devers α [rad], dyn (0,15) }
 */
export function deversementPoutre(o) {
  const { L, w, A, I, Iy, vs, vi, bt, P = 0, e = 0, fckT, fctmT, E } = o;
  const a = o.a ?? Math.min(1.0, 0.05 * L), hLev = o.hLev ?? 0.20, dyn = o.dyn ?? 0.15;
  const Ek = E * 1000;                                              // kPa
  const sweep = o.balayage ?? L / 960, ei = (2 / 3) * sweep + (o.eLev ?? 0.006);
  const fr = fctmT * 1000;                                          // kPa
  const notes = [];
  // ---- levage
  const l = L - 2 * a, Mg = w * (l * l / 8 - a * a / 2);           // moment de poids propre au milieu, suspendue en a
  // contrainte (kPa, traction +) : fibre sup. −P/A + P e vs/I − M vs/I ; fibre inf. −P/A − P e vi/I + M vi/I (e > 0 câble sous G)
  const sSup = M => -P / A + P * e * vs / I - M * vs / I, sInf = M => -P / A - P * e * vi / I + M * vi / I;
  const Pa = o.Pa ?? P, ea = o.ea ?? e, Ma = -w * a * a / 2 * (1 + dyn);
  const sLev = fibre => (fibre === 'sup' ? -Pa / A + Pa * ea * vs / I - Ma * vs / I : -Pa / A - Pa * ea * vi / I + Ma * vi / I);
  const sigHaut = sSup(Mg);
  const yr = vs + hLev;
  const z0 = z0Mast({ w, L, a, E: Ek, Iy });
  const thetaI = ei / yr, thetaMax = Math.max(1e-6, (fr - sigHaut) / (Mg * (bt / 2) / Iy));
  const FSc = 1 / (z0 / yr + thetaI / thetaMax);
  const tp = 0.4, z0p = z0 * (1 + 2.5 * tp);
  const FSf = Math.max(FSc, yr * tp / (z0p * tp + ei));
  const levage = { a, yr, z0, ei, thetaI, thetaMax, sigHaut: sigHaut / 1000, Mg, FSc, FSf, okC: FSc >= 1.0, okF: FSf >= 1.5,
    contraintes: { supMin: Math.min(sSup(Mg * (1 + dyn)), sSup(Mg * (1 - dyn))) / 1000, supMax: Math.max(sSup(Mg * (1 + dyn)), sSup(Mg * (1 - dyn))) / 1000,
      infMin: Math.min(sInf(Mg * (1 + dyn)), sInf(Mg * (1 - dyn))) / 1000, infMax: Math.max(sInf(Mg * (1 + dyn)), sInf(Mg * (1 - dyn))) / 1000,
      // aux points de levage : moment du porte-à-faux, précontrainte d'about (force P_a, excentricité e_a des câbles relevés)
      supLev: sLev('sup') / 1000, infLev: sLev('inf') / 1000, limC: -0.6 * fckT, limT: fctmT } };
  const C = levage.contraintes;
  levage.okS = Math.min(C.supMin, C.infMin, C.supLev, C.infLev) >= C.limC - 1e-9 && Math.max(C.supMax, C.infMax, C.supLev, C.infLev) <= C.limT + 1e-9;
  if (thetaMax <= 1e-6) notes.push('levage : la fibre supérieure est déjà fissurée (σ_haut ≥ f_ctm) — revoir les points de levage ou la précontrainte de 1re famille');
  // ---- posée sur ses appareils (portée entre appareils ≈ L − 2 × about)
  let pose = null;
  const ap = o.appareil;
  if (ap && ap.a > 0 && ap.b > 0 && ap.n > 0 && ap.t > 0) {
    const G = (ap.G ?? 0.9) * 1000, ar = ap.a - 0.01, br = ap.b - 0.01;   // dimensions réduites (enrobage latéral 5 mm)
    const Ks = ksEN1337(br / ar), Kth = 2 * G * ar ** 5 * br / (ap.n * ap.t ** 3 * Ks);   // deux appareils, kN·m/rad
    const W = w * L, r = Kth / W, alpha = o.devers ?? 0, yb = vi + (ap.h ?? 0.05) / 2;
    const about = o.about ?? 0.40, Lp = L - 2 * about;
    const Mgp = w * (Lp * Lp / 8 - about * about / 2), sh = sSup(Mgp);
    const z0s = z0Mast({ w, L, a: about, E: Ek, Iy });
    const thM = Math.max(1e-6, (fr - sh) / (Mgp * (bt / 2) / Iy));
    const FSc2 = r * (thM - alpha) / (z0s * thM + ei + yb * thM);
    const thR = Math.max(1e-6, (ar / 2 - (ap.h ?? 0.05) * alpha) / r), z0sp = z0s * (1 + 2.5 * thR);
    const FSr = r * (thR - alpha) / (z0sp * thR + ei + yb * thR);
    pose = { Ks, Kth, r, alpha, yb, z0: z0s, thetaMax: thM, sigHaut: sh / 1000, FSc: FSc2, FSr, thetaR: thR, okC: FSc2 >= 1.0, okR: FSr >= 1.5 };
    if (FSr < 1.5) notes.push('poutre posée : coefficient de sécurité au renversement < 1,5 — étaiement ou contreventement provisoire des poutres (entretoisement, butons) jusqu\'au coulage des entretoises et du hourdis');
  }
  // EN 1992-1-1 § 5.9 (3), expression (5.40b), situations transitoires : effets du second ordre négligeables si
  // l₀t/b ≤ 70/(h/b)^⅓ et h/b ≤ 3,5 (l₀t distance des maintiens en torsion, b largeur de la table comprimée, h hauteur)
  const H = vs + vi, l0t = pose ? L - 2 * (o.about ?? 0.40) : L - 2 * a, ec2 = { l0t, rapport: l0t / bt, lim: 70 / (H / bt) ** (1 / 3), hb: H / bt };
  ec2.ok = ec2.rapport <= ec2.lim && ec2.hb <= 3.5;
  return { L, w, Iy, ei, sweep, levage, pose, ec2, notes, ok: levage.okC && levage.okF && levage.okS && (!pose || (pose.okC && pose.okR)) };
}
