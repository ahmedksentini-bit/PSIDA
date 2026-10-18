// Spectres de réponse de l'EN 1998-1 (§3.2.2.2, 3.2.2.3, 3.2.2.5), avec l'option
// du guide Cerema de prolonger le plateau jusqu'à T = 0.

export interface FormeSpectre {
  /** Amplitude : ag·S·ST (horizontal) ou avg·ST (vertical), en m/s². */
  amplitude: number;
  TB: number;
  TC: number;
  TD: number;
  /** Coefficient du plateau : 2,5·η (élastique horizontal), 3,0·η (vertical), 2,5/q (calcul). */
  plateau: number;
  /** Coefficient à T = 0 : 1 (élastique) ou 2/3 (calcul). */
  depart: number;
  /** Plancher absolu β·ag appliqué pour T ≥ TC (spectre de calcul), en m/s². */
  plancher?: number;
  plateauOrigine: boolean;
}

/** Valeur du spectre (m/s²) pour la période T (s). Au-delà de 4 s, la branche en 1/T² est prolongée. */
export function valeur(f: FormeSpectre, T: number): number {
  if (!(T >= 0)) return Number.NaN;
  let k: number;
  if (T <= f.TB) k = f.plateauOrigine ? f.plateau : f.depart + (T / f.TB) * (f.plateau - f.depart);
  else if (T <= f.TC) k = f.plateau;
  else if (T <= f.TD) k = (f.plateau * f.TC) / T;
  else k = (f.plateau * f.TC * f.TD) / (T * T);
  const v = f.amplitude * k;
  return f.plancher !== undefined && T >= f.TC ? Math.max(v, f.plancher) : v;
}

/** Spectre élastique en déplacement SDe(T) = Se(T)·(T/2π)², en m (EN 1998-1 éq. 3.7). */
export const deplacement = (f: FormeSpectre, T: number): number => valeur(f, T) * (T / (2 * Math.PI)) ** 2;

/** Échantillonnage pour le tracé, en incluant exactement les périodes de coin. */
export function echantillonner(f: FormeSpectre, Tmax = 4, pas = 0.01, fn: (f: FormeSpectre, T: number) => number = valeur): [number, number][] {
  const Ts = new Set<number>();
  for (let T = 0; T <= Tmax + 1e-9; T += pas) Ts.add(Math.round(T * 1e6) / 1e6);
  for (const T of [f.TB, f.TC, f.TD]) if (T <= Tmax) Ts.add(T);
  if (f.plancher !== undefined) {
    // Période où la branche décroissante rejoint le plancher β·ag.
    const k = f.amplitude * f.plateau;
    const T1 = (k * f.TC) / f.plancher;
    const T2 = Math.sqrt((k * f.TC * f.TD) / f.plancher);
    for (const T of [T1, T2]) if (T > f.TC && T <= Tmax) Ts.add(T);
  }
  return [...Ts].sort((a, b) => a - b).map((T) => [T, fn(f, T)]);
}
