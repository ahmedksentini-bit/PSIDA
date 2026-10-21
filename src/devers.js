/**
 * Dévers transversal du tablier (pente p, en toit ou unique — y > 0 du côté haut) et façon de le rattraper :
 *  - 'inclinee' : dalle d'épaisseur constante inclinée avec la chaussée (aucun effet sur les calculs du tablier ; sous-face
 *    inclinée, bossages de hauteurs différentes sous les appareils d'une même ligne) ;
 *  - 'dalle' : face supérieure suivant le dévers, sous-face horizontale ; épaisseur h(y) = h + Δ(y), h à l'axe,
 *    Δ = −p|y| (toit) ou p·y (unique) : poids, inertie et aciers par fibre en tiennent compte ;
 *  - 'revetement' : dalle horizontale, revêtement d'épaisseur variable (charge supplémentaire γ_rev·t(y) sur la chaussée,
 *    t = 0 au point bas, en plus de l'épaisseur e_rev saisie).
 */
export const GAMMA_REV = 24;   // kN/m³ (enrobé)

/** Variation d'épaisseur ou de cote à l'ordonnée y (m) pour un dévers dv = { p (%), profil, mode }. */
export function deltaDevers(dv, y) {
  if (!dv || !(dv.p > 0)) return 0;
  const p = dv.p / 100;
  return dv.profil === 'unique' ? p * y : -p * Math.abs(y);
}

/** Épaisseur de dalle à l'ordonnée y pour le mode « dalle » (h à l'axe). */
export function epaisseurDevers(h, dv, y) { return dv && dv.mode === 'dalle' ? h + deltaDevers(dv, y) : h; }

/** Aire et inertie de flexion longitudinale de la section rectangulaire de largeur 2b à sous-face horizontale, h(y). */
export function sectionDevers(b, h, dv, n = 200) {
  let A = 0, Sz = 0, Iz = 0;
  for (let k = 0; k < n; k++) {
    const y = -b + (k + 0.5) * 2 * b / n, hy = epaisseurDevers(h, dv, y), dy = 2 * b / n;
    A += hy * dy; Sz += hy * hy / 2 * dy; Iz += hy ** 3 / 3 * dy;
  }
  const zG = Sz / A;
  return { A, I: Iz - A * zG * zG, zG };
}

/**
 * Revêtement d'épaisseur variable (mode « revetement ») : bandes de charge q_k [kN/m²] sur la chaussée [y1 ; y2],
 * épaisseur supplémentaire nulle au point bas ; nb bandes par versant.
 */
export function bandesRevetement(dv, { y1, y2 }, nb = 6) {
  if (!dv || dv.mode !== 'revetement' || !(dv.p > 0)) return [];
  const p = dv.p / 100, out = [];
  const t = dv.profil === 'unique' ? (y => p * (y - y1)) : (y => p * (Math.max(Math.abs(y1), Math.abs(y2)) - Math.abs(y)));
  const cuts = dv.profil === 'unique' ? [y1, y2] : (y1 < 0 && y2 > 0 ? [y1, 0, y2] : [y1, y2]);
  for (let s = 0; s < cuts.length - 1; s++) for (let k = 0; k < nb; k++) {
    const a = cuts[s] + (cuts[s + 1] - cuts[s]) * k / nb, c = cuts[s] + (cuts[s + 1] - cuts[s]) * (k + 1) / nb;
    const q = GAMMA_REV * t((a + c) / 2);
    if (q > 1e-6) out.push({ q, y1: a, y2: c, kmin: 0.8, kmax: 1.4, devers: true, label: 'Revêtement : rattrapage du dévers' });
  }
  return out;
}

/** Épaisseur de revêtement à l'axe (mode « revetement ») : e_rev + supplément de dévers. */
export function revetementAxe(dv, tRev, { y1, y2 }) {
  if (!dv || dv.mode !== 'revetement' || !(dv.p > 0)) return tRev;
  const p = dv.p / 100;
  return tRev + (dv.profil === 'unique' ? p * (0 - y1) : p * Math.max(Math.abs(y1), Math.abs(y2)));
}
