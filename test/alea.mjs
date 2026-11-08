/**
 * Tirages pseudo-aléatoires reproductibles pour les tests d'invariants (test/invariants_*.test.js).
 * Générateur mulberry32 à graine fixe ; la graine de chaque tirage est rappelée dans le message d'un échec.
 *   INVARIANTS_LONG=1 : dix fois plus de tirages ;  INVARIANTS_GRAINE=n : graine de départ (défaut 20261108).
 */
export const LONG = process.env.INVARIANTS_LONG === '1';
export const GRAINE0 = Number(process.env.INVARIANTS_GRAINE || 20261108);

export function rng(graine) {
  let a = graine >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    u: next,
    entre: (a1, b1) => a1 + (b1 - a1) * next(),
    entier: (a1, b1) => a1 + Math.floor((b1 - a1 + 1) * next()),
    choix: t => t[Math.floor(t.length * next())],
    arrondi: (v, pas) => Math.round(v / pas) * pas,
  };
}

/** Lance f(r, contexte) sur n tirages (×10 en mode long) ; un échec rappelle la graine du tirage pour le rejouer. */
export function tirages(n, f, { graine = GRAINE0 } = {}) {
  const N = LONG ? 10 * n : n;
  for (let i = 0; i < N; i++) {
    const g = graine + i, r = rng(g), ctx = { graine: g, i };
    try { f(r, ctx); } catch (e) { e.message = `[tirage ${i}, graine ${g}${ctx.desc ? ` — ${ctx.desc}` : ''}] ${e.message}`; throw e; }
  }
}

/** Écart relatif borné par une référence d'échelle (évite la division par un résultat voisin de zéro). */
export const ecart = (a, b, echelle = Math.max(Math.abs(a), Math.abs(b), 1e-12)) => Math.abs(a - b) / echelle;

/** Parcourt récursivement un objet de résultats et renvoie les chemins des nombres non finis (NaN, ±Infinity). */
export function nonFinis(o, chemin = '', vus = new Set(), out = [], prof = 0) {
  if (out.length > 20 || prof > 12) return out;
  if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(`${chemin} = ${o}`); return out; }
  if (!o || typeof o !== 'object' || vus.has(o)) return out;
  vus.add(o);
  if (ArrayBuffer.isView(o)) { for (let i = 0; i < o.length; i++) if (!Number.isFinite(o[i])) { out.push(`${chemin}[${i}] = ${o[i]}`); break; } return out; }
  for (const [k, v] of Object.entries(o)) { if (typeof v === 'function') continue; nonFinis(v, chemin ? `${chemin}.${k}` : k, vus, out, prof + 1); }
  return out;
}
