/**
 * Découpage minimal d'un source JavaScript en jetons, suffisant pour la mutation : commentaires, chaînes, gabarits
 * (avec leurs ${…} imbriqués, gardés en un seul jeton), expressions régulières, nombres, noms et ponctuation.
 * Chaque jeton porte son type, sa valeur et ses positions [debut, fin[ dans le texte.
 */
const PONCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
  '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const MOTS_AVANT_EXPR = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

export function jetons(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const dernierSignifiant = () => { for (let k = out.length - 1; k >= 0; k--) if (out[k].type !== 'commentaire') return out[k]; return null; };
  const regexPossible = () => {
    const p = dernierSignifiant();
    if (!p) return true;
    if (p.type === 'nombre' || p.type === 'chaine' || p.type === 'gabarit' || p.type === 'regex') return false;
    if (p.type === 'nom') return MOTS_AVANT_EXPR.has(p.valeur);
    return !(p.valeur === ')' || p.valeur === ']' || p.valeur === '}');
  };
  // lit une chaîne simple ou double à partir de j (guillemet ouvrant), renvoie l'index après la fermeture
  const finChaine = (j) => { const q = src[j]; j++; while (j < n && src[j] !== q) { if (src[j] === '\\') j++; j++; } return j + 1; };
  // gabarit : à partir du ` ouvrant, gère ${ … } avec accolades, chaînes et gabarits imbriqués
  const finGabarit = (j) => {
    j++;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') return j + 1;
      if (c === '$' && src[j + 1] === '{') {
        j += 2; let prof = 1;
        while (j < n && prof > 0) {
          const d = src[j];
          if (d === '{') prof++;
          else if (d === '}') prof--;
          else if (d === '"' || d === "'") { j = finChaine(j); continue; }
          else if (d === '`') { j = finGabarit(j); continue; }
          else if (d === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue; }
          else if (d === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j + 2) + 2; continue; }
          j++;
        }
        continue;
      }
      j++;
    }
    return j;
  };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); const f = j < 0 ? n : j; out.push({ type: 'commentaire', valeur: src.slice(i, f), debut: i, fin: f }); i = f; continue; }
    if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2) + 2; out.push({ type: 'commentaire', valeur: src.slice(i, f), debut: i, fin: f }); i = f; continue; }
    if (c === '"' || c === "'") { const f = finChaine(i); out.push({ type: 'chaine', valeur: src.slice(i, f), debut: i, fin: f }); i = f; continue; }
    if (c === '`') { const f = finGabarit(i); out.push({ type: 'gabarit', valeur: src.slice(i, f), debut: i, fin: f }); i = f; continue; }
    if (c === '/' && regexPossible()) {
      let j = i + 1, classe = false;
      while (j < n) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '[') classe = true; else if (d === ']') classe = false; else if (d === '/' && !classe) break; j++; }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      out.push({ type: 'regex', valeur: src.slice(i, j), debut: i, fin: j }); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const m = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/.exec(src.slice(i));
      out.push({ type: 'nombre', valeur: m[0], debut: i, fin: i + m[0].length }); i += m[0].length; continue;
    }
    if (/[A-Za-z_$À-￿]/.test(c)) {
      const m = /^[A-Za-z_$À-￿][\w$À-￿]*/.exec(src.slice(i));
      out.push({ type: 'nom', valeur: m[0], debut: i, fin: i + m[0].length }); i += m[0].length; continue;
    }
    const p = PONCT.find(s => src.startsWith(s, i)) || c;
    out.push({ type: 'ponct', valeur: p, debut: i, fin: i + p.length }); i += p.length;
  }
  return out;
}
