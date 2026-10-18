// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/outils.js) — module testé de fond.ksr-infra.org (170 tests).
// Outils numériques communs aux solveurs. Aucun accès au DOM : ces modules
// tournent aussi bien dans la page que sous `node --test`.
//
// Conventions d'unités, tenues dans TOUS les solveurs :
//   longueurs en m · forces en kN · contraintes du sol en kPa
//   pl*, pf*, EM, qc en MPa (unités des rapports géotechniques)
//   angles en degrés à l'entrée des fonctions « publiques », convertis en interne.

export const RAD = Math.PI / 180;
export const GAMMA_W = 10; // kN/m³ — NF EN 1997-1/NA AN4.1 et Fascicule 62 A.4.2,52

/** Une méthode qui ne s'applique pas doit dire pourquoi (principe du site). */
export function horsDomaine(motif, extra = {}) {
  return { applicable: false, motif, ...extra };
}

/** Borne x dans [a, b]. */
export const borner = (x, a, b) => Math.min(Math.max(x, a), b);

/**
 * Intégrale de f sur [a, b] par Simpson composite, en coupant aux ruptures
 * (frontières de couches) pour qu'un profil constant par couche soit intégré
 * exactement.
 */
export function integrer(f, a, b, ruptures = [], n = 48) {
  if (!(b > a)) return 0;
  const pts = [a, ...ruptures.filter((r) => r > a && r < b), b].sort((x, y) => x - y);
  let somme = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const x0 = pts[k], x1 = pts[k + 1];
    // Milieu de segment : un profil par couches est constant à l'intérieur,
    // l'évaluation à l'extrémité exacte pourrait tomber dans la couche voisine.
    const h = (x1 - x0) / n;
    let s = f(x0 + 1e-9 * (x1 - x0)) + f(x1 - 1e-9 * (x1 - x0));
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(x0 + i * h);
    somme += (s * h) / 3;
  }
  return somme;
}

/** Moyenne harmonique pondérée : n / Σ(1/Xi), ou Σhi / Σ(hi/Xi). */
export function moyenneHarmonique(valeurs, poids = null) {
  const w = poids ?? valeurs.map(() => 1);
  const num = w.reduce((s, x) => s + x, 0);
  const den = valeurs.reduce((s, v, i) => s + w[i] / v, 0);
  return num / den;
}

/** Dichotomie sur une fonction monotone. */
export function dichotomie(f, a, b, iterations = 80) {
  let fa = f(a);
  for (let i = 0; i < iterations; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/** Interpolation linéaire dans un tableau [x, y] trié en x, bornée aux extrémités. */
export function interpoler(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/** Nombre au format français, chiffres significatifs. */
export const fr = (x, chiffres = 3) => Number.isFinite(x)
  ? Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: chiffres })
  : "—";

/** Nombre au format français, décimales fixes. */
export const frd = (x, decimales = 2) => Number.isFinite(x)
  ? Number(x).toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  : "—";

/**
 * Profil de sol par couches. Chaque couche : { z0, z1, ...propriétés }.
 * `valeur(z, cle)` renvoie la propriété de la couche contenant z (la couche
 * inférieure l'emporte à une frontière exacte, sauf au fond du profil).
 */
export function profilCouches(couches) {
  const tri = [...couches].sort((a, b) => a.z0 - b.z0);
  const ruptures = [...new Set(tri.flatMap((c) => [c.z0, c.z1]))].sort((a, b) => a - b);
  const couche = (z) => {
    for (const c of tri) if (z >= c.z0 && z < c.z1) return c;
    if (z >= tri[tri.length - 1].z1) return tri[tri.length - 1];
    return tri[0];
  };
  return {
    couches: tri,
    ruptures,
    base: tri[tri.length - 1].z1,
    couche,
    valeur: (z, cle) => couche(z)[cle],
    fn: (cle) => (z) => couche(z)[cle],
  };
}

/**
 * Profil de mesures ponctuelles [{ z, v }], interpolé linéairement entre les
 * points (échelle arithmétique) ou sur leurs logarithmes (échelle log, comme
 * le demande le Fascicule 62 pour la moyenne géométrique sous une semelle).
 */
export function profilPoints(points, { log = false } = {}) {
  const p = [...points].sort((a, b) => a.z - b.z);
  const table = p.map((q) => [q.z, log ? Math.log(q.v) : q.v]);
  const f = (z) => {
    const y = interpoler(table, z);
    return log ? Math.exp(y) : y;
  };
  return { fn: f, ruptures: p.map((q) => q.z), base: p[p.length - 1].z };
}
