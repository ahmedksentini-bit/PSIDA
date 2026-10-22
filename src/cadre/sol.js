/**
 * Sol de fondation des cadres (portage de BVTrace SoilModulus.cs et MarstonEffect.cs).
 *  - ESOL indicatif (annexe 2 du guide SETRA « Programme de calcul PICF-EL », 1991-1992) et raideur de Winkler sous un
 *    radier de largeur B : k = ESOL / (2B) ; module différé du béton Ev = 3700 ∛fc28 (BAEL).
 *  - Alourdissement de Marston (annexe 4 du même guide) : K = (eˣ − 1)/x, x = 2 kμ H/D, kμ = 0,1924, borné par K∞(p·r).
 */
export const NATURES = ['argile', 'limon', 'sable', 'sableGravier', 'roche'];
export const ETATS = ['surconsolide', 'normal', 'lache', 'tresAltere'];
const TABLE = {
  argile: { surconsolide: 80, normal: 55, lache: 30 },
  limon: { surconsolide: 70, normal: 50, lache: 15 },
  sable: { surconsolide: 180, normal: 150, lache: 30 },
  sableGravier: { surconsolide: 300, normal: 170 },
  roche: { surconsolide: 1600, normal: 1100, lache: 800, tresAltere: 160 },
};
export const T_PAR_M2_PAR_MPA = 101.9716;

export const esolIndicatif = (nature, etat) => TABLE[nature]?.[etat] ?? null;
export function libelleEtat(nature, etat) {
  if (nature === 'roche') return { surconsolide: 'très peu fracturée', normal: 'normale', lache: 'très fracturée' }[etat] || 'très altérée';
  return { surconsolide: 'surconsolidé ou très serré', normal: 'normalement consolidé ou serré', lache: 'sous-consolidé, altéré ou lâche' }[etat] || 'état sans objet pour un sol meuble';
}
export const libelleNature = n => ({ argile: 'argile', limon: 'limon', sable: 'sable', sableGravier: 'sable et gravier', roche: 'roche' }[n] || n);
export function kReaction(esolMPa, B) { if (!(B > 0)) throw new RangeError('largeur nulle'); return esolMPa / (2 * B); }
export const raideurT = (esolMPa, B) => kReaction(esolMPa, B) * T_PAR_M2_PAR_MPA;
export function moduleDiffereBeton(fc28) { if (!(fc28 > 0)) throw new RangeError('fc28 nul'); return 3700 * Math.cbrt(fc28); }

// ── Marston ───────────────────────────────────────────────────────────────────────────────────────
export const K_MU = 0.1924;
const ASYMPTOTE = [[0.10, 1.30], [0.30, 1.55], [0.50, 1.75], [0.70, 1.92], [1.00, 2.15], [2.00, 2.80]];
export function kInfini(pr) {
  if (pr <= ASYMPTOTE[0][0]) return ASYMPTOTE[0][1];
  for (let i = 1; i < ASYMPTOTE.length; i++) if (pr <= ASYMPTOTE[i][0]) {
    const [p0, k0] = ASYMPTOTE[i - 1], [p1, k1] = ASYMPTOTE[i];
    return k0 + (k1 - k0) * (pr - p0) / (p1 - p0);
  }
  return ASYMPTOTE[ASYMPTOTE.length - 1][1];
}
const f2 = x => x.toFixed(2).replace('.', ','), f3 = x => x.toFixed(3).replace('.', ',');
/** Coefficient d'alourdissement : H remblai, D et Hext dimensions EXTÉRIEURES réelles, fondation incompressible (r = 1) ou non (0,7). */
export function marston(H, D, Hext, incompressible = true) {
  if (!(D > 0)) return { K: 1, borne: false, message: 'Largeur extérieure inconnue : alourdissement non calculé, K = 1.' };
  if (!(Hext > 0)) return { K: 1, borne: false, message: 'Hauteur extérieure inconnue : alourdissement non calculé, K = 1.' };
  if (!(H > 0)) return { K: 1, borne: false, message: 'Aucun remblai sur l\'ouvrage : pas d\'effet Marston, K = 1.' };
  const hD = H / D, p = Hext / D, r = incompressible ? 1 : 0.7, pr = p * r, x = 2 * K_MU * hD;
  let K = x > 1e-12 ? (Math.exp(x) - 1) / x : 1;
  const kInf = kInfini(pr), borne = K > kInf;
  if (borne) K = kInf;
  let message = `K = ${f3(K)} — H_remb/D = ${f2(hD)}, p = ${f2(p)}, p·r = ${f2(pr)}, ${incompressible ? 'fondation incompressible (r = 1)' : 'fondation compressible (r = 0,7)'}.`;
  if (borne) message += ` Borné par l'asymptote K∞ = ${f2(kInf)}.`;
  if (hD > 1) message += ' Au-delà de H_remb/D = 1, la formule de projection complète MAJORE le coefficient (environ +4 % à H_remb/D = 2,7 d\'après les valeurs imprimées du guide) : l\'écart va dans le sens de la sécurité.';
  return { K, borne, message };
}
