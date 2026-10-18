// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/tassement-pieu.js) — module testé de fond.ksr-infra.org.
// Tassement d'un pieu isolé.
//  · évaluation forfaitaire (LCPC-Sétra 1985, rappelée par le guide Cerema) :
//    sous 0,7 Rc;cr, s ≈ 0,006 B (pieux forés) ou 0,009 B (pieux battus) ;
//  · estimation prudente (NF P94-262 L.2) : s = k B/100 + el, k = 2 ;
//  · lois de transfert de Frank et Zhao, à partir de EM, qs et qb.
//
// Unités : z, B, D en m · EM en MPa · qs, qb en kPa · E du pieu en MPa · Q en kN.

/** Coefficients de Frank et Zhao (guide Cerema, tableau 20), en kPa/m. */
export function coefficientsFrankZhao({ EM, B, sol = "fin" }) {
  const E = EM * 1000;
  return sol === "fin" ? { kt: (2 * E) / B, kq: (11 * E) / B } : { kt: (0.8 * E) / B, kq: (4.8 * E) / B };
}

/** Loi trilinéaire : pente k jusqu'à qlim/2, puis k/5 jusqu'à qlim, puis palier. */
export function loiFrankZhao(s, k, qlim) {
  const s1 = qlim / (2 * k);
  const s2 = s1 + (qlim / 2) / (k / 5);
  const sa = Math.abs(s), signe = Math.sign(s) || 1;
  if (sa <= s1) return signe * k * sa;
  if (sa <= s2) return signe * (qlim / 2 + (k / 5) * (sa - s1));
  return signe * qlim;
}

/**
 * Courbe charge–enfoncement d'un pieu par la méthode des fonctions de
 * transfert. couches : [{ z0, z1, EM, qs, sol }] ; pointe : { EM, qb, sol }.
 * Ep : module du matériau du pieu (MPa). On se donne le déplacement de la
 * pointe, on remonte le pieu tranche par tranche (équilibre + raccourcissement
 * élastique), et l'on obtient le couple (Q tête, s tête).
 */
export function courbeChargement({ B, D, Ep, couches, pointe, n = 100, points = 40 }) {
  const Ab = (Math.PI * B * B) / 4, P = Math.PI * B, EA = Ep * 1000 * Ab;
  const h = D / n;
  const tri = [...couches].sort((a, b) => a.z0 - b.z0);
  const couche = (z) => tri.find((c) => z >= c.z0 && z < c.z1) ?? tri[tri.length - 1];
  const { kq } = coefficientsFrankZhao({ EM: pointe.EM, B, sol: pointe.sol });
  const tete = (sb) => {
    let N = Ab * loiFrankZhao(sb, kq, pointe.qb);
    let s = sb;
    for (let i = n - 1; i >= 0; i--) {
      const zc = (i + 0.5) * h;
      const c = couche(zc);
      const { kt } = coefficientsFrankZhao({ EM: c.EM, B, sol: c.sol });
      // deux passes : déplacement au milieu de la tranche estimé puis corrigé
      let F = P * h * loiFrankZhao(s, kt, c.qs);
      let sMil = s + ((N + F / 2) * h) / (2 * EA);
      F = P * h * loiFrankZhao(sMil, kt, c.qs);
      const Nhaut = N + F;
      s += (((N + Nhaut) / 2) * h) / EA;
      N = Nhaut;
    }
    return { Q: N, s };
  };
  // Déplacement de pointe maximal : palier de pointe largement atteint.
  const sbMax = 3 * pointe.qb / kq * 1.5 + 0.05 * B;
  const courbe = [{ Q: 0, s: 0, sb: 0 }];
  for (let i = 1; i <= points; i++) {
    const sb = (sbMax * i) / points;
    courbe.push({ ...tete(sb), sb });
  }
  const pour = (Q) => {
    if (Q <= 0) return 0;
    let lo = 0, hi = sbMax;
    if (tete(hi).Q < Q) return null;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (tete(mid).Q < Q) lo = mid; else hi = mid;
    }
    return tete((lo + hi) / 2).s;
  };
  return { courbe, tassementSous: pour, Qmax: courbe[courbe.length - 1].Q };
}

/** Estimation forfaitaire sous 0,7 Rc;cr (extrêmes entre parenthèses). */
export function tassementForfaitaire({ B, mise = "fore" }) {
  return mise === "fore"
    ? { s: 0.006 * B, min: 0.003 * B, max: 0.010 * B }
    : { s: 0.009 * B, min: 0.008 * B, max: 0.012 * B };
}

/** Estimation prudente (NF P94-262 formules L.2.3 et L.2.4) : s = k B/100 + el, k = 2. */
export const tassementPrudent = ({ B, el = 0, k = 2 }) => (k * B) / 100 + el;
