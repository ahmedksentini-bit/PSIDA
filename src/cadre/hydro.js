/**
 * Situations hydrauliques d'un cadre (portage de BVTrace CulvertHydrostatics.cs) : eau intérieure, nappe extérieure,
 * sous-pression, et vérification au soulèvement (coefficient 1,10 sur le poids mobilisable). Unités : m, t.
 *
 * Niveaux de référence : la nappe (champ « Nappe au-dessus du radier ») et l'eau intérieure sont mesurées depuis la face
 * SUPÉRIEURE du radier (fil d'eau). Le modèle de barres est aux feuillets moyens, e_r/2 plus bas :
 *  - poussée de la nappe sur les piédroits : hauteur d'eau h + e_r/2 au-dessus du nœud bas (feuillet moyen du radier) ;
 *  - sous-pression : elle s'exerce sur la SOUS-FACE du radier, sous h + e_r d'eau, pour la flexion du radier comme pour
 *    la flottaison (le portage initial de BVTrace prenait h + e_r/2, soit la pression au feuillet moyen : non conservatif
 *    pour la flottaison). L'option `compat = true` reproduit l'ancienne convention (recoupement avec BVTrace seulement).
 * Poussée de l'eau sur un piédroit : trapèze entre le nœud bas et le nœud haut (ρ·min(h_w, h_c) en pied, ρ·max(0, h_w − h_c)
 * en tête). Quand la nappe s'arrête sous la traverse, la répartition réelle est un triangle tronqué : le trapèze en garde la
 * pression de pied mais en majore la résultante (ρ h_w h_c / 2 au lieu de ρ h_w² / 2), simplification héritée du programme.
 */
import { nCell, hauteurCalc, largeurCalc, epVoile, poussee } from './cadre.js';

export const RHO_EAU = 1.0;
export const SECURITE_SOULEVEMENT = 1.10;
export const SITUATIONS = { interieure: 'en eau, nappe basse', videNappe: 'VIDE, nappe haute', pleineNappe: 'en eau, nappe haute' };
const fr = (x, d = 1) => x.toFixed(d).replace('.', ',');

/** Sous-pression (t/m²) à la sous-face du radier, nappe mesurée au-dessus de sa face supérieure. */
export const sousPression = (g, hNappe, compat = false) => RHO_EAU * (Math.max(0, hNappe) + (compat ? g.er / 2 : (g.er || 0)));
export const eauInterieure = h => RHO_EAU * Math.max(0, h);

/** Jeu de charges hydrostatiques d'une situation (poussées nettes vers l'intérieur, charge sur radier). */
export function chargesEau(g, situation, hInt, hNappe, gaucheExt = true, droiteExt = true, compat = false) {
  const n = nCell(g), hc = hauteurCalc(g);
  const hi = situation === 'videNappe' ? 0 : Math.min(Math.max(hInt, 0), hc);
  const he = situation === 'interieure' ? 0 : Math.max(0, hNappe), hw = he > 0 && !compat ? he + (g.er || 0) / 2 : he;   // nappe au-dessus du nœud bas
  const pEB = RHO_EAU * Math.min(hw, hc), pEH = RHO_EAU * Math.max(0, hw - hc), pIB = RHO_EAU * hi;
  const bas = pEB - pIB, haut = pEH;
  const s = poussee(n, gaucheExt ? bas : -pIB, gaucheExt ? haut : 0, droiteExt ? bas : -pIB, droiteExt ? haut : 0);
  s.up = (he > 0 ? sousPression(g, he, compat) : 0) - eauInterieure(hi);
  return s;
}

/** Soulèvement : sous-pression à la sous-face du radier, sur la largeur extérieure, contre poids du béton et du remblai (t/ml). */
export function flottaison(g, h, H, hNappe, rhoB, rhoR, compat = false) {
  const Lext = largeurCalc(g) + g.ep, up = sousPression(g, hNappe, compat) * Lext;
  let aire = g.et * Lext + g.er * Lext;
  for (let j = 0; j <= nCell(g); j++) aire += epVoile(g, j) * h;
  const poids = rhoB * aire + rhoR * H * Lext, fs = up > 1e-9 ? poids / up : Infinity, ok = fs >= SECURITE_SOULEVEMENT;
  let message;
  if (up <= 1e-9) message = 'Aucune nappe déclarée : pas de vérification de flottabilité.';
  else if (ok) message = `Soulèvement : sous-pression ${fr(up)} t/ml contre un poids mobilisable de ${fr(poids)} t/ml — coefficient ${fr(fs, 2)} ≥ ${fr(SECURITE_SOULEVEMENT, 2)}.`;
  else {
    const def = SECURITE_SOULEVEMENT * up - poids, dj = Math.max(rhoB - RHO_EAU, 0.1), sur = def / (dj * Math.max(Lext, 1e-9));
    message = `SOULÈVEMENT NON VÉRIFIÉ : sous-pression ${fr(up)} t/ml pour un poids mobilisable de ${fr(poids)} t/ml — coefficient ${fr(fs, 2)} < ${fr(SECURITE_SOULEVEMENT, 2)}. Il manque ${fr(def)} t/ml. REMÈDE : épaissir le radier d'environ ${fr(sur, 2)} m (le béton ajouté est déjaugé, il ne pèse que ${fr(dj)} t/m³), ou prévoir un lestage équivalent, ou rabattre la nappe par un drainage pérenne. Le frottement latéral et les terres sur des semelles débordantes ne sont pas comptés : les mobiliser demanderait une géométrie et une étude géotechnique.`;
  }
  return { up, poids, fs, ok, message };
}
