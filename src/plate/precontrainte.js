/**
 * Précontrainte de la dalle appliquée au modèle de plaque : réactions hyperstatiques par appareil d'appui.
 *
 * Le calcul PSI-DP (src/psidp/prestress.js) donne, pour chaque état (mise en tension M.T, mise en service M.S, service
 * E.S ; valeurs moyenne, P1 et P2), la force F(x) et l'excentricité z(x) du câble moyen sur la largeur, d'où le moment
 * isostatique M₀ = F z (poutre entière) et les réactions hyperstatiques de chaque ligne d'appui. Sur la plaque, la
 * précontrainte est remplacée par son système de charges équivalentes, autoéquilibré (câbles répartis uniformément en
 * travers) : forces de déviation P_k = −Δ(dM₀/dx) aux nœuds du câble, efforts d'ancrage −M₀′ et couples M₀ aux deux abouts
 * (couple de forces ± M₀/δ, δ = maille). Les réactions des appareils sous ce système sont les réactions hyperstatiques
 * de précontrainte, réparties entre les appareils par la plaque (comme le programme MRB-EL du SETRA, 1995, qui édite les
 * « réactions d'appui dues aux actions de la précontrainte seule ») ; leur somme par ligne redonne le calcul de poutre.
 * Ouvrages droits et biais (ouvrages courbes : non traité, la répartition reste uniforme).
 */

export function precontraintePlaque(Mpl, r, { b }) {
  const P = Mpl.P, ys = P.ys, W = 2 * b, xs = r.xs, z = r.z, nX = xs.length;
  // poids des nœuds en travers (largeurs tributaires)
  const wy = ys.map((y, j) => ((j < ys.length - 1 ? ys[j + 1] : y) - (j > 0 ? ys[j - 1] : y)) / 2 / W);
  const cot = Mpl.cot || 0, dx = Math.max(...P.xs.slice(1).map((x, i) => x - P.xs[i])) || 0.5;
  const ligne = (F, x, Pk) => { for (let j = 0; j < ys.length; j++) P.chargePonctuelle(F, { x: x + ys[j] * cot, y: ys[j], P: Pk * wy[j] }); };
  const etat = Fc => {
    const M0 = xs.map((x, i) => Fc[i] * z[i]), s = xs.slice(1).map((x, i) => (M0[i + 1] - M0[i]) / (x - xs[i]));
    const F = P.vecteur();
    // forces de déviation (charges vers le bas positives : q = −M₀″)
    for (let k = 1; k < nX - 1; k++) ligne(F, xs[k], -(s[k] - s[k - 1]));
    // abouts : effort tranchant d'ancrage et couple M₀ (couple de forces sur une maille)
    const d = Math.min(dx, (xs[nX - 1] - xs[0]) / 10);
    ligne(F, xs[0], -s[0] - M0[0] / d); ligne(F, xs[0] + d, M0[0] / d);
    ligne(F, xs[nX - 1], s[nX - 2] - M0[nX - 1] / d); ligne(F, xs[nX - 1] - d, M0[nX - 1] / d);
    const R = P.reactions(P.resoudre(F)), nL = Math.max(...R.map(a => a.ligne)) + 1;
    // réactions vers le haut positives (convention des réactions hyperstatiques de la poutre)
    return Array.from({ length: nL }, (_, i) => R.filter(a => a.ligne === i).sort((u, v) => u.rang - v.rang).map(a => a.R));
  };
  const etats = [];
  for (const ph of ['MT', 'MS', 'ES']) for (const k of ['moy', 'max', 'min']) { const e = r[ph] && r[ph][k]; if (e) etats.push({ ph, k, Rapp: etat(e.F), Rpoutre: e.hyp.R }); }
  const nL = etats[0].Rapp.length;
  const max = Array.from({ length: nL }, (_, i) => Math.max(...etats.flatMap(e => e.Rapp[i]))), min = Array.from({ length: nL }, (_, i) => Math.min(...etats.flatMap(e => e.Rapp[i])));
  // contrôle : somme par ligne (plaque) / réaction hyperstatique de la poutre
  const ES = etats.find(e => e.ph === 'ES' && e.k === 'moy') || etats[0];
  const controle = ES.Rapp.map((row, i) => ({ plaque: row.reduce((t, v) => t + v, 0), poutre: ES.Rpoutre[i] || 0 }));
  return { etats, max, min, controle, ES: ES.Rapp };
}
