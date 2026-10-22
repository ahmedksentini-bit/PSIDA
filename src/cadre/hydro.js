/**
 * Situations hydrauliques d'un cadre (portage de BVTrace CulvertHydrostatics.cs) : eau intérieure, nappe extérieure,
 * sous-pression, et vérification au soulèvement (coefficient 1,10 sur le poids mobilisable). Unités : m, t.
 */
import { nCell, hauteurCalc, largeurCalc, epVoile, poussee } from './cadre.js';

export const RHO_EAU = 1.0;
export const SECURITE_SOULEVEMENT = 1.10;
export const SITUATIONS = { interieure: 'en eau, nappe basse', videNappe: 'VIDE, nappe haute', pleineNappe: 'en eau, nappe haute' };
const fr = (x, d = 1) => x.toFixed(d).replace('.', ',');

export const sousPression = (g, hNappe) => RHO_EAU * (Math.max(0, hNappe) + g.er / 2);
export const eauInterieure = h => RHO_EAU * Math.max(0, h);

/** Jeu de charges hydrostatiques d'une situation (poussées nettes vers l'intérieur, charge sur radier). */
export function chargesEau(g, situation, hInt, hNappe, gaucheExt = true, droiteExt = true) {
  const n = nCell(g), hc = hauteurCalc(g);
  const hi = situation === 'videNappe' ? 0 : Math.min(Math.max(hInt, 0), hc);
  const he = situation === 'interieure' ? 0 : Math.max(0, hNappe);
  const pEB = RHO_EAU * Math.min(he, hc), pEH = RHO_EAU * Math.max(0, he - hc), pIB = RHO_EAU * hi;
  const bas = pEB - pIB, haut = pEH;
  const s = poussee(n, gaucheExt ? bas : -pIB, gaucheExt ? haut : 0, droiteExt ? bas : -pIB, droiteExt ? haut : 0);
  s.up = (he > 0 ? sousPression(g, he) : 0) - eauInterieure(hi);
  return s;
}

/** Soulèvement : sous-pression sur la largeur extérieure contre poids du béton et du remblai (t/ml). */
export function flottaison(g, h, H, hNappe, rhoB, rhoR) {
  const Lext = largeurCalc(g) + g.ep, up = sousPression(g, hNappe) * Lext;
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
