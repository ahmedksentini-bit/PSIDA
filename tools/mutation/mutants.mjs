/**
 * Mutants d'un module : opérateurs arithmétiques (+ ↔ −, × ↔ ÷), signe unaire supprimé, comparaisons aux bornes
 * (< ↔ <=, > ↔ >=, === ↔ !==), && ↔ ||, Math.max ↔ Math.min, constantes numériques (× 1,1, ou + 1 pour un entier).
 * Le contenu des chaînes, des gabarits (messages et formatage) et des commentaires n'est jamais muté.
 */
import { jetons } from './jetons.mjs';

const ARITH = { '+': '-', '-': '+', '*': '/', '/': '*' };
const COMP = { '<': '<=', '<=': '<', '>': '>=', '>=': '>', '===': '!==', '!==': '===', '==': '!=', '!=': '==' };
const LOG = { '&&': '||', '||': '&&' };

function estOperande(t) {
  if (!t) return false;
  if (t.type === 'nombre' || t.type === 'chaine' || t.type === 'gabarit' || t.type === 'regex') return true;
  if (t.type === 'nom') return !['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await', 'else', 'do'].includes(t.valeur);
  return t.valeur === ')' || t.valeur === ']';
}

export function mutants(src) {
  const T = jetons(src).filter(t => t.type !== 'commentaire');
  const L = [];
  const ligne = pos => src.slice(0, pos).split('\n').length;
  const ajout = (t, remplacement, operateur) => L.push({ debut: t.debut, fin: t.fin, original: t.valeur, remplacement, operateur, ligne: ligne(t.debut) });
  for (let k = 0; k < T.length; k++) {
    const t = T[k], av = T[k - 1], ap = T[k + 1];
    if (t.type === 'ponct') {
      const v = t.valeur;
      if (ARITH[v]) {
        const binaire = estOperande(av);
        if (binaire) {
          // concaténation de chaînes : pas un calcul
          if (v === '+' && (av.type === 'chaine' || av.type === 'gabarit' || (ap && (ap.type === 'chaine' || ap.type === 'gabarit')))) continue;
          ajout(t, ARITH[v], 'arith');
        } else if (v === '-' && ap && (ap.type === 'nom' || ap.type === 'nombre' || ap.valeur === '(')) {
          // -x → x ; -1 n'est pas muté ici (la constante l'est)
          if (ap.type !== 'nombre') ajout(t, '', 'signe');
        }
      } else if (COMP[v]) ajout(t, COMP[v], 'comparaison');
      else if (LOG[v]) ajout(t, LOG[v], 'logique');
    } else if (t.type === 'nom' && (t.valeur === 'max' || t.valeur === 'min') && av && av.valeur === '.' && T[k - 2] && T[k - 2].valeur === 'Math') {
      ajout(t, t.valeur === 'max' ? 'min' : 'max', 'maxmin');
    } else if (t.type === 'nombre') {
      if (/^0[xXbB]|n$/.test(t.valeur)) continue;
      const v = Number(t.valeur.replace(/_/g, ''));
      if (!Number.isFinite(v) || v === 0) continue;
      // indices de tableau et clés d'objet : peu significatifs, mais gardés (le test doit les attraper aussi)
      if (ap && ap.valeur === ':' && av && (av.valeur === '{' || av.valeur === ',')) continue; // clé numérique d'objet
      const r = Number.isInteger(v) && !/[.eE]/.test(t.valeur) ? String(v + 1) : String(+(v * 1.1).toPrecision(12));
      ajout(t, r, 'constante');
    }
  }
  return L.map((m, i) => ({ id: i, ...m }));
}

export const appliquer = (src, m) => src.slice(0, m.debut) + m.remplacement + src.slice(m.fin);
