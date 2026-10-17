/**
 * Ouvrages biais — géométrie (guide SETRA « Ponts-dalles, guide de conception », 1989) et moments dans les
 * directions d'armatures (annexe 12A du BPEL telle qu'appliquée par CHAMOA ; généralisation de Wood-Armer).
 *
 * Conventions : ψ = angle de biais géométrique (grades) entre l'axe longitudinal (bords libres) et les lignes
 * d'appui (100 gr = ouvrage droit). Les portées sont mesurées le long de l'axe (longueurs biaises), la largeur
 * 2b perpendiculairement aux bords libres (largeur droite). Angles internes en radians.
 */

const GR = Math.PI / 200; // 1 grade en radians

/**
 * Angle de biais mécanique φ (grades) — relation empirique du guide (§ 3.4.1), reproduite par CHAMOA :
 *   φ = ψ + (100 − ψ)·(1 − n/2)²  si n < 2,   φ = ψ sinon,
 * n = largeur biaise / portée biaise, la largeur biaise étant Be/sin ψ avec Be la largeur de la dalle
 * rectangulaire équivalente (Be = 12 I/h³ ; = 2b pour une section rectangulaire).
 * Vérifié sur la note CHAMOA (ψ = 80 gr, Be = 12,253 m) : 82,53 gr (L = 10 m) et 86,51 gr (L = 15 m).
 */
export function mechanicalSkew({ psi, Be, L }) {
  if (psi >= 100) return 100;
  const n = (Be / Math.sin(psi * GR)) / L;
  return n < 2 ? psi + (100 - psi) * Math.pow(1 - n / 2, 2) : psi;
}

/** Largeur rectangulaire équivalente Be = 12 I / h³ (CHAMOA) ; 2b si I n'est pas connu. */
export function equivalentWidth({ width, h, I = null }) {
  return I ? 12 * I / Math.pow(h, 3) : width;
}

/**
 * Moments dans les directions d'armatures — annexe 12A du BPEL / dossier CED 66, calcul « après fissuration »
 * tel que l'applique CHAMOA (§ 3.4 du guide technique), reproduit ici exactement sur les 11 valeurs M_APF de
 * la note commentée (ch. 4.3).
 *
 * Hypothèse CHAMOA : le moment longitudinal MX (ST1, direction biaise géométrique, par mètre) et le moment
 * transversal MY (Guyon, par mètre) sont les moments principaux, la direction de MX étant tournée de
 * δ = 100 − φ_mec (grades) de l'axe longitudinal vers la normale aux lignes d'appui. Le tenseur (Mxx, Myy, Mxy)
 * est ensuite décomposé sur les deux directions d'armatures n₁ (longitudinale) et n₂ (transversale, angle ψ₂
 * avec n₁) et sur la bissectrice c des deux familles, le béton n'y travaillant qu'en compression :
 *   M = M₁ n₁⊗n₁ + M₂ n₂⊗n₂ + Mb c⊗c,   Mb ≤ 0 pour la nappe inférieure (Mb ≥ 0 pour la nappe supérieure).
 * Pour des aciers longitudinaux parallèles aux bords libres et transversaux parallèles aux lignes d'appui
 * (ψ₂ = ψ, option par défaut de CHAMOA), la solution est linéaire :
 *   M_APF = Myy / (1 − cos ψ) + Mxy' / sin ψ,  Myy = MX sin²δ + MY cos²δ,  Mxy' = (MX − MY) sin δ cos δ.
 * Exemple CHAMOA travée 1 (φ = 82,53 gr, ψ = 80 gr) : MX = 435,08, MY = 114,89 → 288,10 kN·m/m.
 * CHAMOA ne corrige pas les aciers longitudinaux (M₁ n'est pas utilisé : « aucune autre correction du fait du
 * biais réel ») ; pour les moments transversaux négatifs (nappe supérieure), la note prend MX = 0.
 *
 * @param {{MX:number, MY:number, phiMec:number, psi:number, psi2?:number, face?:'bot'|'top'}} p
 *   psi2 : angle (grades) entre aciers longitudinaux et transversaux (défaut ψ : parallèles aux lignes d'appui ;
 *   100 : perpendiculaires aux bords libres). face : nappe dimensionnée (signe admissible de Mb).
 * @returns {{M1:number, M2:number, Mb:number, Mxx:number, Myy:number, Mxy:number, delta:number}}
 */
export function annexe12A({ MX, MY, phiMec, psi, psi2 = psi, face = 'bot' }) {
  const delta = (100 - phiMec) * GR, a2 = psi2 * GR;
  // tenseur dans le repère (x bords libres, y normale) : MX tourné de −δ (vers la normale aux lignes d'appui, situées à +ψ)
  const s = Math.sin(-delta), c = Math.cos(-delta);
  const Mxx = MX * c * c + MY * s * s, Myy = MX * s * s + MY * c * c, Mxy = (MX - MY) * s * c;
  const solve = tc => {
    // M = M1 n1n1 + M2 n2n2 + Mb cc, composantes xx, xy, yy
    const n = t => [Math.cos(t) ** 2, Math.cos(t) * Math.sin(t), Math.sin(t) ** 2];
    const A = [n(0), n(a2), n(tc)]; // colonnes
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const M = [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
    const rhs = [Mxx, Mxy, Myy], D = det3(M);
    const col = (k) => det3(M.map((row, i) => row.map((v, j) => (j === k ? rhs[i] : v))));
    return { M1: col(0) / D, M2: col(1) / D, Mb: col(2) / D };
  };
  const acute = solve(a2 / 2), obtuse = solve(a2 / 2 + Math.PI / 2);
  const admissible = face === 'bot' ? r => r.Mb <= 1e-9 : r => r.Mb >= -1e-9;
  let r;
  if (admissible(acute) && admissible(obtuse)) r = Math.abs(acute.M2) >= Math.abs(obtuse.M2) ? acute : obtuse;
  else r = admissible(acute) ? acute : obtuse;
  return { ...r, Mxx, Myy, Mxy, delta };
}

/**
 * Moments de dimensionnement pour des armatures obliques (généralisation de Wood-Armer, Armer 1968,
 * reprise dans Hambly, Bridge Deck Behaviour) : armatures 1 selon x et armatures 2 faisant l'angle α
 * avec x ; moments de plaque Mx, My, Mxy par mètre (convention plaque : fibre inférieure tendue > 0).
 * Contrairement à l'annexe 12A (bissectrice imposée), la direction de la compression du béton est ici optimisée.
 * @param {{Mx:number, My:number, Mxy?:number, alphaDeg:number}} m
 */
export function armerSkew({ Mx, My, Mxy = 0, alphaDeg }) {
  const a = alphaDeg * Math.PI / 180, s = Math.sin(a), c = Math.cos(a), cot = c / s;
  const A = Mx + 2 * Mxy * cot + My * cot * cot;   // moment « x » transformé
  const B = My / (s * s);
  const T = (Mxy + My * cot) / s;                 // terme de couplage
  // nappe inférieure
  let bx = A + Math.abs(T), ba = B + Math.abs(T);
  if (bx < 0) { bx = 0; ba = A !== 0 ? B + Math.abs(T * T / A) : B; }
  else if (ba < 0) { ba = 0; bx = My !== 0 ? A + Math.abs((Mxy + My * cot) * (Mxy + My * cot) / My) : A; }
  // nappe supérieure (moments négatifs)
  let tx = A - Math.abs(T), ta = B - Math.abs(T);
  if (tx > 0) { tx = 0; ta = A !== 0 ? B - Math.abs(T * T / A) : B; }
  else if (ta > 0) { ta = 0; tx = My !== 0 ? A - Math.abs((Mxy + My * cot) * (Mxy + My * cot) / My) : A; }
  return { bot: { Mx: Math.max(bx, 0), Ma: Math.max(ba, 0) }, top: { Mx: Math.min(tx, 0), Ma: Math.min(ta, 0) } };
}
