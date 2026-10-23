/**
 * Pont mixte : actions variables sur la structure achevée (NF EN 1994-2 § 5.4).
 *
 *  - poutre continue d'inertie variable (éléments de Bernoulli) : section mixte non fissurée (n₀) en travée, fissurée
 *    (acier + armatures) sur 15 % de part et d'autre des appuis intermédiaires (§ 5.4.2.3) ;
 *  - lignes d'influence (réactions par éléments finis, moments et efforts tranchants par la statique) et enveloppes :
 *    UDL sur les parties défavorables, tandem TS (deux essieux à 1,20 m) au plus défavorable (EN 1991-2 § 4.3.2) ;
 *  - répartition transversale entre poutres : règle du levier pour un bipoutre (entretoises souples, pratique Sétra),
 *    Courbon (entretoisement rigide) pour 3 poutres et plus ; voies conventionnelles placées au plus défavorable pour la
 *    poutre étudiée (EN 1991-2 § 4.2.4) ;
 *  - écart de température dalle – acier ±10 K (EN 1991-1-5 § 6.1.4.3 ; EN 1994-2 § 5.4.2.5) : effets isostatiques et
 *    hyperstatiques (courbure imposée dans les zones non fissurées) ;
 *  - modèle de charge de fatigue FLM3 (EN 1991-2 § 4.6.4 : 4 essieux de 120 kN, 1,20 + 6,00 + 1,20 m).
 * Unités : m, kN, kN·m ; EI en kN·m².
 */
import { solve } from '../linalg.js';
import { lm1, notionalLanes, EC_ALPHA } from '../loads_ec.js';

/** Poutre continue : nœuds xs, EI par élément, appuis (abscisses). Lignes d'influence des réactions (charge unité
 *  descendante en chaque nœud), puis M(x) et V(x) par la statique. */
export class PoutreContinue {
  constructor(xs, EI, appuisX) {
    this.xs = xs; this.EI = EI; this.appX = appuisX;
    const n = xs.length, N = 2 * n, K = Array.from({ length: N }, () => new Float64Array(N));
    for (let e = 0; e < n - 1; e++) {
      const L = xs[e + 1] - xs[e], k = EI[e] / L ** 3, d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      const ke = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[d[a]][d[b]] += k * ke[a][b];
    }
    this.iApp = appuisX.map(x => xs.findIndex(p => Math.abs(p - x) < 1e-6));
    this.big = 1e6 * Math.max(...EI) / Math.min(...xs.slice(1).map((x, i) => x - xs[i])) ** 3;
    for (const i of this.iApp) K[2 * i][2 * i] += this.big;
    this.K = K.map(r => Array.from(r)); this.n = n;
    this.R = null;
  }
  /** Réactions (vers le haut) sous un vecteur de forces nodales F (2n, verticales vers le bas sur les ddl pairs). */
  reactions(F) { const u = solve(this.K.map(r => r.slice()), F); return this.iApp.map(i => this.big * u[2 * i]); }
  /** Lignes d'influence des réactions : RI[j][m] = réaction de l'appui j pour une charge unité au nœud m. */
  influenceReactions() {
    if (this.R) return this.R;
    const n = this.n, R = this.appX.map(() => new Float64Array(n));
    // une factorisation par résolution : n résolutions denses (n ≤ ~200 nœuds)
    for (let m = 0; m < n; m++) { const F = new Array(2 * n).fill(0); F[2 * m] = 1; const r = this.reactions(F); r.forEach((v, j) => { R[j][m] = v; }); }
    return (this.R = R);
  }
  /** Ligne d'influence du moment en x (moment positif : fibre inférieure tendue). */
  ligneM(x) {
    const R = this.influenceReactions(), xs = this.xs;
    return Float64Array.from(xs, (xm, m) => this.appX.reduce((s, xa, j) => s + (xa < x ? R[j][m] * (x - xa) : 0), 0) - (xm < x ? x - xm : 0));
  }
  /** Ligne d'influence de l'effort tranchant juste à droite (cote 'd') ou à gauche ('g') de la section x (positif : vers le
   *  haut à gauche de la coupure). Au nœud de la coupure, la ligne prend sa limite du côté considéré (saut unité). */
  ligneV(x, cote = 'd') {
    const R = this.influenceReactions(), xs = this.xs, e = 1e-9;
    return Float64Array.from(xs, (xm, m) => {
      if (cote === 'd') return this.appX.reduce((s, xa, j) => s + (xa <= x + e ? R[j][m] : 0), 0) - (xm < x - e ? 1 : 0);
      return this.appX.reduce((s, xa, j) => s + (xa < x - e ? R[j][m] : 0), 0) - (xm <= x + e ? 1 : 0);
    });
  }
  ligneR(j) { return this.influenceReactions()[j]; }
  /** Moments sous une courbure imposée κ (1/m) par élément (écart thermique, retrait) : efforts hyperstatiques seuls. */
  momentsCourbure(kappa) {
    const n = this.n, F = new Array(2 * n).fill(0);
    for (let e = 0; e < n - 1; e++) { const m = this.EI[e] * kappa[e]; F[2 * e + 1] += m; F[2 * e + 3] -= m; }
    const R = this.reactions(F);
    return this.xs.map(x => this.appX.reduce((s, xa, j) => s + (xa < x ? R[j] * (x - xa) : 0), 0));
  }
}

/** Valeur d'une ligne d'influence en x (interpolation linéaire entre nœuds). */
export function valeur(xs, eta, x) {
  if (x <= xs[0] || x >= xs[xs.length - 1]) return 0;
  let k = 0; while (k < xs.length - 2 && xs[k + 1] < x) k++;
  return eta[k] + (eta[k + 1] - eta[k]) * (x - xs[k]) / (xs[k + 1] - xs[k]);
}

/** Enveloppe d'une ligne d'influence sous une charge répartie q (parties de même signe) et un convoi d'essieux. */
export function enveloppe(xs, eta, { q = 0, essieux = [] } = {}) {
  let pos = 0, neg = 0;
  for (let i = 1; i < xs.length; i++) { const dx = xs[i] - xs[i - 1], a = eta[i - 1], b = eta[i]; if (a >= 0 && b >= 0) pos += (a + b) / 2 * dx; else if (a <= 0 && b <= 0) neg += (a + b) / 2 * dx; else { const t = a / (a - b), dxa = t * dx; if (a > 0) { pos += a * dxa / 2; neg += b * (dx - dxa) / 2; } else { neg += a * dxa / 2; pos += b * (dx - dxa) / 2; } } }
  let cMax = 0, cMin = 0;
  if (essieux.length) {
    const len = Math.max(...essieux.map(e => e.d)), x0 = xs[0] - len, x1 = xs[xs.length - 1];
    const sens = [essieux, essieux.map(e => ({ d: len - e.d, P: e.P }))];
    for (const ess of sens) for (let x = x0; x <= x1 + 1e-9; x += 0.1) { const v = ess.reduce((s, e) => s + e.P * valeur(xs, eta, x + e.d), 0); cMax = Math.max(cMax, v); cMin = Math.min(cMin, v); }
    // essieu exactement sur un nœud (pointes de la ligne d'influence)
    for (const ess of sens) for (const xn of xs) for (const e0 of ess) { const v = ess.reduce((s, e) => s + e.P * valeur(xs, eta, xn + e.d - e0.d), 0); cMax = Math.max(cMax, v); cMin = Math.min(cMin, v); }
  }
  return { max: q * pos + cMax, min: q * neg + cMin, pos, neg };
}

/**
 * Coefficients de répartition transversale de la poutre k pour une charge à l'abscisse transversale y (y = 0 : axe ;
 * poutres à y_k) : règle du levier entre les deux poutres encadrantes (bipoutre), Courbon sinon. Une charge hors des
 * poutres de rive est reportée en console (levier prolongé).
 */
export function repartition(ys, k, { methode = null } = {}) {
  const n = ys.length, m = methode || (n === 2 ? 'levier' : 'courbon');
  if (m === 'courbon') { const S2 = ys.reduce((s, y) => s + y * y, 0); return y => 1 / n + y * ys[k] / S2; }
  return y => {
    let j = 0; while (j < n - 2 && y > ys[j + 1]) j++;
    const a = ys[j], b = ys[j + 1], t = (y - a) / (b - a);
    return k === j ? 1 - t : k === j + 1 ? t : 0;
  };
}

/**
 * Charges équivalentes de la poutre k (LM1, trottoirs, FLM3) : voies conventionnelles de 3 m placées depuis le bord de
 * chaussée le plus favorable à la poutre, numérotées par effet décroissant (EN 1991-2 § 4.2.4), voies défavorables seules.
 * chaussee = { y1, y2 } ; trottoirs [{ y1, y2 }]. Renvoie { Q (kN par essieu de tandem équivalent), q (kN/m), qTrott
 * (kN/m, 3 kN/m² en gr1a), fatigue (fraction d'un essieu FLM3 dans l'axe de la voie lente) }.
 */
export function chargesPoutre(ys, k, chaussee, trottoirs = [], { alpha = EC_ALPHA.recommended } = {}) {
  const eta = repartition(ys, k), w = chaussee.y2 - chaussee.y1, nl = notionalLanes(w).n, wl = notionalLanes(w).wl;
  const L1 = lm1(nl, alpha);
  // deux placements : voies depuis le bord gauche ou depuis le bord droit ; on garde le plus défavorable
  let best = null;
  for (const sens of [1, -1]) {
    const voies = Array.from({ length: nl }, (_, i) => { const yc = sens > 0 ? chaussee.y1 + wl * (i + 0.5) : chaussee.y2 - wl * (i + 0.5); return { yc, eta: eta(yc) }; });
    voies.sort((a, b) => b.eta - a.eta);
    let Q = 0, q = 0;
    voies.forEach((v, i) => { if (v.eta <= 0) return; const ln = L1.lanes[i]; Q += ln.Q * v.eta; q += ln.q * wl * v.eta; });
    // aire résiduelle : moyenne du coefficient sur la largeur restante (côté défavorable)
    const wr = w - nl * wl;
    if (wr > 1e-6) { const yr = sens > 0 ? chaussee.y2 - wr / 2 : chaussee.y1 + wr / 2, er = eta(yr); if (er > 0) q += L1.qr * wr * er; }
    const r = { Q, q, voies };
    if (!best || Q + 10 * q > best.Q + 10 * best.q) best = r;
  }
  const qTrott = trottoirs.reduce((s, t) => { const e = eta((t.y1 + t.y2) / 2); return s + (e > 0 ? 3 * (t.y2 - t.y1) * e : 0); }, 0);
  const qTrott5 = trottoirs.reduce((s, t) => { const e = eta((t.y1 + t.y2) / 2); return s + (e > 0 ? 5 * (t.y2 - t.y1) * e : 0); }, 0);
  // voie lente pour la fatigue : la plus chargeante pour la poutre (première voie), FLM3 dans son axe
  const fatigue = best.voies[0] ? Math.max(best.voies[0].eta, 0) : 0;
  return { ...best, qTrott, qTrott5, fatigue, nl, wl };
}

export const FLM3 = [{ d: 0, P: 120 }, { d: 1.2, P: 120 }, { d: 7.2, P: 120 }, { d: 8.4, P: 120 }];
