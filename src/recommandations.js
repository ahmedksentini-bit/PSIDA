/**
 * Recommandations : pour chaque vérification non satisfaite des résultats, le constat et des actions sur les données.
 *
 * Un élément : { domaine, lieu, verification, constat, regle, actions: [action] } ; une action :
 *   { texte, champ?: nom du champ du formulaire, libelleChamp?, unite?, valeur?: valeur proposée (affichage),
 *     valeurChamp?: valeur écrite dans le champ, chercher?: { champ, min, max, pas, calcul: 'appuis' | 'complet',
 *     vers: 'haut' | 'bas', ecrire?: (v, ancien) → texte du champ, verifie: st → booléen } }
 * « chercher » décrit une recherche de la plus petite modification qui satisfait la vérification, les autres données
 * restant inchangées (dichotomie sur une grandeur supposée monotone ; exécutée à la demande par l'interface, qui
 * relance le calcul des appuis — quelques centièmes de seconde — ou le calcul complet).
 * Les règles sont rangées par domaine (règles*.js) ; ce module les rassemble.
 */
import { reglesTablier } from './reco/tablier.js';
import { reglesAppuis } from './reco/appuis.js';

export function recommandations(st) {
  const items = [];
  for (const regle of [...reglesTablier, ...reglesAppuis]) {
    try { for (const it of regle(st) || []) items.push(it); } catch (e) { items.push({ domaine: 'Recommandations', lieu: '', verification: 'règle en erreur', constat: e.message, actions: [] }); }
  }
  return { items };
}

/** Valeurs candidates d'une recherche (grille régulière), dans l'ordre de modification croissante. */
export function candidats({ min, max, pas, vers = 'haut', depart }) {
  const out = [];
  if (vers === 'haut') for (let v = Math.max(min, depart); v <= max + 1e-9; v += pas) out.push(+v.toFixed(6));
  else for (let v = Math.min(max, depart); v >= min - 1e-9; v -= pas) out.push(+v.toFixed(6));
  return out;
}

/**
 * Plus petite modification satisfaisante par dichotomie sur la liste des candidats (verifie supposée monotone :
 * fausse puis vraie). evalue(v) → booléen (asynchrone possible). Renvoie la valeur ou null.
 */
export async function dichotomie(vals, evalue) {
  if (!vals.length) return null;
  if (!(await evalue(vals[vals.length - 1]))) return null;
  let lo = -1, hi = vals.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await evalue(vals[mid])) hi = mid; else lo = mid; }
  return vals[hi];
}

/** Arrondi d'affichage. */
export const fx = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : v === Infinity ? '∞' : '–');
