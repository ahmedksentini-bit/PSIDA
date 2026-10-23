/**
 * Culées en situation sismique (NF EN 1998-2, 6.7 ; NF EN 1998-5, 7.3.2 et annexe E ; Capra et Godreau 2015, ch. 10).
 *
 * Les culées restent essentiellement élastiques : les efforts propres à la culée ne sont pas divisés par q.
 *  - Culée connectée au tablier de manière flexible (appareils en élastomère ou glissants, 6.7.2) : on additionne, en phase,
 *      F1 = M_C·a_g·S  inertie du corps de culée (mur de front, chevêtre et garde-grève, murs en retour) ;
 *      F2 = M_R·a_g·S  inertie du remblai situé sur le débord arrière de la semelle (appliquée à la fondation) ;
 *      F3            poussée des terres sismique de Mononobe-Okabe (annexe E), la culée pouvant se déplacer de quelques
 *                    centimètres : incrément dynamique ΔF = ½ γ H² [(1 ± k_v) K_AE − K_A] appliqué à mi-hauteur (E.4,
 *                    point d'application de l'incrément dynamique) ;
 *      F4            efforts des appareils (fournis par l'analyse du pont : élastomères à leur déformation de calcul).
 *  - Culée connectée de manière rigide (appareils fixes, butées, liaison monolithique, 6.7.3) : inertie de la culée avec
 *    a_g·S (q = 1) et incrément de poussée d'une structure rigide, qui ne peut pas mobiliser l'état actif :
 *    ΔP_d = (a_g/g)·S·γ·H² (annexe E.9), à mi-hauteur.
 * Hypothèses retenues dans PSIDA : k_h = a_g·S·S_T/g (r = 1, culée qui ne peut pas glisser librement), k_v = ±0,5 k_h ;
 * mur vertical (ψ = 90°), remblai horizontal (β = 0), frottement sol-mur nul en sismique (δ_d = 0 : effort horizontal,
 * valeur prudente pour la composante horizontale) ; φ'_d = atan(tan φ'/γ_φ'), γ_φ' = 1,25 (EN 1998-5 3.1(3)) ; terrain
 * au-dessus de la nappe. La partie dynamique n'est pas majorée de 30 % (culée monolithique ; à majorer sinon, 6.7.2 /
 * Capra et Godreau § 10.2).
 */

const rad = d => (d * Math.PI) / 180;

/**
 * Coefficient de poussée K de Mononobe-Okabe (EN 1998-5, E.4, cas β ≤ φ'_d − θ), angles en radians.
 * La version française imprimée de E.4 porte un signe − à remplacer par + dans sin(φ'_d + δ_d) (Capra et Godreau, § 10.4.2).
 */
export function kMononobeOkabe({ phiD, deltaD = 0, theta = 0, psi = Math.PI / 2, beta = 0 }) {
  const num = Math.sin(psi + phiD - theta) ** 2;
  if (beta > phiD - theta) return num / (Math.cos(theta) * Math.sin(psi) ** 2 * Math.sin(psi - theta - deltaD));
  const r = Math.sqrt((Math.sin(phiD + deltaD) * Math.sin(phiD - beta - theta)) / (Math.sin(psi - theta - deltaD) * Math.sin(psi + beta)));
  return num / (Math.cos(theta) * Math.sin(psi) ** 2 * Math.sin(psi - theta - deltaD) * (1 + r) ** 2);
}

/**
 * Poussée sismique d'un remblai sec sur un mur vertical de hauteur H et de largeur B.
 * @returns {{ phiD, KA, KAE, kvRetenu, F, Fstat, dF, z }} efforts en kN (γ en kN/m³), z : bras de levier de ΔF depuis le pied
 */
export function pousseeMononobeOkabe({ phi, gamma, H, B = 1, kh, kv = 0.5 * kh, gammaPhi = 1.25 }) {
  const phiD = Math.atan(Math.tan(rad(phi)) / gammaPhi);
  const KA = kMononobeOkabe({ phiD });
  // les deux sens de k_v : on retient le plus défavorable (1 ± k_v) K_AE
  const cas = [kv, -kv].map(v => { const theta = Math.atan(kh / (1 + v)); const K = kMononobeOkabe({ phiD, theta }); return { kv: v, theta, K, KE: (1 + v) * K }; });
  const pire = cas.reduce((a, c) => (c.KE > a.KE ? c : a));
  const F = 0.5 * gamma * pire.KE * H * H * B, Fstat = 0.5 * gamma * KA * H * H * B;
  return { phiD, KA, KAE: pire.K, kvRetenu: pire.kv, theta: pire.theta, F, Fstat, dF: Math.max(0, F - Fstat), z: H / 2 };
}

/** Incrément de poussée d'une structure rigide (EN 1998-5, E.9) : ΔP_d = k_h γ H² par mètre, à mi-hauteur. */
export const pousseeRigide = ({ gamma, H, B = 1, kh }) => ({ dF: kh * gamma * H * H * B, z: H / 2 });

/**
 * Efforts sismiques propres d'une culée (kN, kN·m au pied du mur), dans la direction longitudinale.
 * @param {object} p
 *   connexion 'flexible' | 'rigide' ; kh ; gamma, phi du remblai ; H hauteur de terre retenue (garde-grève compris), B largeur ;
 *   masses [{ W (kN), z (m, hauteur du centre de gravité au-dessus du pied du mur) }]
 */
export function culeeSismique({ connexion = 'flexible', kh, gamma, phi, H, B, masses = [] }) {
  const F1 = masses.reduce((s, m) => s + kh * m.W, 0), M1 = masses.reduce((s, m) => s + kh * m.W * m.z, 0);
  const p = connexion === 'rigide' ? { ...pousseeRigide({ gamma, H, B, kh }), methode: 'ΔP_d structure rigide (EN 1998-5 E.9)' }
    : { ...pousseeMononobeOkabe({ phi, gamma, H, B, kh }), methode: 'Mononobe-Okabe (EN 1998-5 annexe E)' };
  return { connexion, kh, kv: 0.5 * kh, F1, M1, F3: p.dF, M3: p.dF * p.z, poussee: p, H: F1 + p.dF, M: M1 + p.dF * p.z };
}

/** Inertie du remblai sur le débord arrière de la semelle (F2 = M_R a_g S), à appliquer à la fondation. */
export const inertieRemblaiTalon = ({ kh, gamma, debord, hauteur, L }) => ({ F2: kh * gamma * Math.max(0, debord) * hauteur * L, z: hauteur / 2 });
