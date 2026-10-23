/**
 * Pont mixte : fatigue des armatures longitudinales de la dalle sur appui (zones fissurées), par la règle de Miner.
 *
 *  - modèle de charge de fatigue FLM4 (EN 1991-2 § 4.6.5, tableau 4.7) : cinq camions équivalents, composition du trafic
 *    « longue distance », « moyenne distance » ou « local » (tableau 4.7 : 20/5/50/15/10 %, 40/10/30/15/5 %,
 *    80/5/5/5/5 %), N_obs poids lourds par an sur la voie lente (tableau 4.5), durée d'utilisation de projet 100 ans ;
 *    charges d'essieux de la poutre étudiée = charges du camion × coefficient de répartition de la voie lente (le même que
 *    pour FLM3) ;
 *  - étendue de contrainte de l'armature pour un passage : (M_max − M_min) z / I₂ sur la section fissurée (acier +
 *    armatures, EN 1994-2 § 6.8.5.4 (1) et (2)), M_max et M_min étant les extrêmes de la ligne d'influence parcourue par
 *    le camion (0 compris, avant et après le passage) — le raidissement en traction s'élimine lorsque les deux états
 *    tendent la dalle ;
 *  - courbe S-N des barres droites (EN 1992-1-1 tableau 6.3N) : N* = 10⁶, Δσ_Rsk = 162,5 MPa, k₁ = 5, k₂ = 9 ;
 *    γ_F,fat = 1,0, γ_S,fat = 1,15 (§ 2.4.2.3, tableau 2.1N) ;
 *  - dommage D_Ed = Σ n_i / N_i ≤ 1 (§ 6.8.4 (1), éq. 6.70) ; étendue équivalente Δσ_s,equ(N*) = Δσ_Rsk (D)^{1/k}
 *    rapportée à N* pour l'affichage.
 * Unités : m, kN, kN·m, MPa.
 */
import { proprietes, couches } from './section.js';
import { sectionZone } from './verifs.js';
import { valeur } from './trafic.js';

/** Camions équivalents FLM4 : entraxes (m, depuis le premier essieu) et charges d'essieux (kN) ; parts du trafic. */
export const FLM4 = [
  { d: [0, 4.5], P: [70, 130], part: { longue: 0.20, moyenne: 0.40, locale: 0.80 } },
  { d: [0, 4.2, 5.5], P: [70, 120, 120], part: { longue: 0.05, moyenne: 0.10, locale: 0.05 } },
  { d: [0, 3.2, 8.4, 9.7, 11.0], P: [70, 150, 90, 90, 90], part: { longue: 0.50, moyenne: 0.30, locale: 0.05 } },
  { d: [0, 3.4, 9.4, 11.2], P: [70, 140, 90, 90], part: { longue: 0.15, moyenne: 0.15, locale: 0.05 } },
  { d: [0, 4.8, 8.4, 12.8, 14.1], P: [70, 130, 90, 80, 80], part: { longue: 0.10, moyenne: 0.05, locale: 0.05 } },
];
export const ACIER_FATIGUE = { Nstar: 1e6, dRsk: 162.5, k1: 5, k2: 9, gF: 1.0, gS: 1.15 };

/** Nombre de cycles admissibles sous une étendue Δσ (MPa) : courbe bilinéaire divisée par γ_S,fat. */
export function cyclesAdmissibles(ds, A = ACIER_FATIGUE) {
  const r = A.dRsk / A.gS, s = A.gF * ds;
  if (s <= 0) return Infinity;
  return A.Nstar * (r / s) ** (s >= r ? A.k1 : A.k2);
}

/** Extrêmes du moment sous le passage d'un camion (deux sens) sur la ligne d'influence eta (nœuds xs). */
function passage(xs, eta, cam, f) {
  let mx = 0, mn = 0; const len = cam.d[cam.d.length - 1], x0 = xs[0] - len, x1 = xs[xs.length - 1] + len;
  for (const sens of [1, -1]) for (let x = x0; x <= x1; x += 0.25) {
    let m = 0; cam.d.forEach((d, k) => { m += f * cam.P[k] * valeur(xs, eta, sens > 0 ? x + d : x - d); });
    mx = Math.max(mx, m); mn = Math.min(mn, m);
  }
  return { mx, mn };
}

/**
 * M = résultat de computeMixte (p, reperes) ; v = vérifications de la structure achevée (PC, xs, CH, n0) ;
 * o = { Nobs (poids lourds / an / voie lente), trafic ('longue' | 'moyenne' | 'locale'), ans (100) }.
 */
export function fatigueArmatures(M, v, o = {}) {
  const { p, reperes: R } = M, Nobs = o.Nobs ?? v.Nobs ?? 5e5, trafic = o.trafic || 'longue', ans = o.ans ?? 100, f = v.CH.fatigue;
  const xsC = M.modele.noeuds.map(q => q[0]), lignes = [];
  for (let i = 0; i < xsC.length; i++) {
    const e = Math.max(0, i - 1), inf = R.info[2 * e]; if (!inf.fiss) continue;
    const G = sectionZone(p, inf.zoneAppui, inf.beff, inf.As), P = proprietes(G, 'fissuree', v.n0), C = couches(G), yR = C.armatures[0].y;
    const x = xsC[i], eta = v.PC.ligneM(x);
    let D = 0; const cam = FLM4.map(c => {
      const { mx, mn } = passage(v.xs, eta, c, f), dM = mx - mn, ds = dM * (yR - P.yG) / P.I / 1000, n = Nobs * ans * c.part[trafic], N = cyclesAdmissibles(ds);
      D += n / N; return { dM, ds, n, N };
    });
    lignes.push({ x, D, cam, ds: Math.max(...cam.map(c => c.ds)), dsEqu: ACIER_FATIGUE.dRsk / ACIER_FATIGUE.gS * D ** (1 / ACIER_FATIGUE.k2) });
  }
  const w = lignes.length ? lignes.reduce((a, b) => (b.D > a.D ? b : a)) : null;
  const verifs = w ? [{ nom: `Fatigue des armatures de la dalle sur appui (FLM4, trafic ${trafic === 'longue' ? 'longue distance' : trafic === 'moyenne' ? 'moyenne distance' : 'local'}, ${ans} ans) : dommage D_Ed`, val: w.D, lim: 1, ok: w.D <= 1, ref: 'EN 1992-1-1 § 6.8.4 (éq. 6.70), tableau 6.3N ; EN 1994-2 § 6.8.5.4 ; EN 1991-2 § 4.6.5', x: w.x }] : [];
  return { lignes, pire: w, verifs, Nobs, trafic, ans, f, ok: verifs.every(q => q.ok) };
}
