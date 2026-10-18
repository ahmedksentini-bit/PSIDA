/**
 * Pont-dalle précontraint par post-tension (type PSI-DP) — moteur de précontrainte longitudinale, d'après la note modèle
 * SETRA PSIDP-EL 84-1 (dossier pilote PSI-DP, SETRA 1984-1985) et le BPEL 91 révisé 99 :
 *  - câble moyen défini par paraboles z = A x² + B x + C par tronçon (x local depuis l'appui gauche de la travée, z rapporté à
 *    la fibre moyenne de la section brute, positif vers le haut) ;
 *  - pertes instantanées : frottement σ(x) = σ_p0 exp(−f α − φ x) (BPEL 3.3,11), recul d'ancrage (3.3,12), raccourcissement
 *    élastique ½ (E_p/E_ij) σ̄_bj (3.3,13) ; tension par une ou deux extrémités ;
 *  - valeurs caractéristiques P1 = 1,02 σ_p0 − 0,8 Δσ, P2 = 0,98 σ_p0 − 1,2 Δσ (BPEL 4.1,2, classe II) ;
 *  - moments hyperstatiques par la méthode des forces (poutre continue à inertie constante) ;
 *  - pertes différées : relaxation (3.3,23), retrait (3.3,21), fluage K_fl E_p σ_b/E_i28 (3.3,22) avec σ_b réajusté par
 *    itération (C.P. moyennes + précontrainte finale moyenne, iso + hyper), terme rectangle (annexe 2 § 5) ; fraction r(j)
 *    à la mise en service.
 * Unités libres mais cohérentes (par exemple m, kN, kPa ; ou m, t, t/m² comme la note SETRA).
 */

const trapz = (xs, ys) => { let s = 0; for (let k = 1; k < xs.length; k++) s += 0.5 * (ys[k] + ys[k - 1]) * (xs[k] - xs[k - 1]); return s; };
const interp = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
};

/** Géométrie du câble moyen : z, pente et courbure en abscisse globale (origine à l'appui gauche). */
export function cableGeometry(spans, segs) {
  const x0 = [0]; spans.forEach(L => x0.push(x0[x0.length - 1] + L));
  if (!Array.isArray(segs) || segs.length !== spans.length) throw new Error('Câble : une liste de paraboles par travée est requise.');
  const find = x => {
    let j = 0; while (j < spans.length - 1 && x > x0[j + 1] + 1e-9) j++;
    const xl = Math.min(Math.max(x - x0[j], 0), spans[j]);
    const list = segs[j];
    let s = list[list.length - 1];
    for (const t of list) if (xl <= t.x1 + 1e-9) { s = t; break; }
    return { j, xl, s };
  };
  return {
    x0, Ltot: x0[x0.length - 1],
    z: x => { const { xl, s } = find(x); return s.A * xl * xl + s.B * xl + s.C; },
    slope: x => { const { xl, s } = find(x); return 2 * s.A * xl + s.B; },
    curv: x => { const { s } = find(x); return 2 * s.A; },
    span: x => find(x).j,
    /** Rayon minimal de courbure et continuité aux raccords (contrôles de saisie). */
    checks() {
      let Rmin = Infinity; const gaps = [];
      segs.forEach((list, j) => list.forEach((t, k) => {
        if (t.A) Rmin = Math.min(Rmin, 1 / (2 * Math.abs(t.A)));
        const nx = list[k + 1];
        if (nx) {
          const x = t.x1, z1 = t.A * x * x + t.B * x + t.C, z2 = nx.A * x * x + nx.B * x + nx.C, p1 = 2 * t.A * x + t.B, p2 = 2 * nx.A * x + nx.B;
          if (Math.abs(z1 - z2) > 2e-3 || Math.abs(p1 - p2) > 2e-3) gaps.push({ span: j + 1, x, dz: z2 - z1, dp: p2 - p1 });
        }
      }));
      return { Rmin, gaps };
    },
  };
}

/** Moments hyperstatiques sur appuis X_i (i = 1 … n−1) et M_hyp(x) linéaire, pour un moment isostatique M0(x) = F z. */
export function hyperstatic(spans, xs, M0) {
  const n = spans.length, x0 = [0]; spans.forEach(L => x0.push(x0[x0.length - 1] + L));
  if (n < 2) return { X: [0, 0], at: () => 0 };
  const m = n - 1, D = Array.from({ length: m }, () => new Array(m).fill(0)), d0 = new Array(m).fill(0);
  for (let a = 0; a < m; a++) {
    D[a][a] = (spans[a] + spans[a + 1]) / 3;
    if (a + 1 < m) { D[a][a + 1] = spans[a + 1] / 6; D[a + 1][a] = spans[a + 1] / 6; }
  }
  // d0_a = ∫ m_a M0 dx, m_a = x/L sur la travée a (à gauche de l'appui a+1), 1 − x/L sur la travée a+1
  for (let j = 0; j < n; j++) {
    const idx = []; for (let k = 0; k < xs.length; k++) if (xs[k] >= x0[j] - 1e-9 && xs[k] <= x0[j + 1] + 1e-9) idx.push(k);
    const X = idx.map(k => xs[k]), loc = X.map(x => (x - x0[j]) / spans[j]);
    if (j < m) d0[j] += trapz(X, idx.map((k, i) => loc[i] * M0[k]));
    if (j > 0) d0[j - 1] += trapz(X, idx.map((k, i) => (1 - loc[i]) * M0[k]));
  }
  // résolution tridiagonale (Thomas)
  const c = new Array(m).fill(0), dd = new Array(m).fill(0), sol = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    const a = i > 0 ? D[i][i - 1] : 0, b = D[i][i] - a * (i > 0 ? c[i - 1] : 0);
    c[i] = i + 1 < m ? D[i][i + 1] / b : 0; dd[i] = (-d0[i] - a * (i > 0 ? dd[i - 1] : 0)) / b;
  }
  for (let i = m - 1; i >= 0; i--) sol[i] = dd[i] - c[i] * (i + 1 < m ? sol[i + 1] : 0);
  const Xs = [0, ...sol, 0];
  const at = x => { let j = 0; while (j < n - 1 && x > x0[j + 1] + 1e-12) j++; const t = Math.min(Math.max((x - x0[j]) / spans[j], 0), 1); return Xs[j] * (1 - t) + Xs[j + 1] * t; };
  const V = spans.map((L, j) => (Xs[j + 1] - Xs[j]) / L);                 // tranchant hyperstatique par travée
  const R = x0.map((_, i) => (i < n ? V[i] : 0) - (i > 0 ? V[i - 1] : 0)); // réactions hyperstatiques
  return { X: Xs, at, V, R };
}

/**
 * Calcul complet de la précontrainte.
 * @param {object} p
 *  spans [m] ; sec { B, I, v, vp } section brute ;
 *  cable { n, Ap, phiG (Ø gaine), segs, sigma0, f, phi, g, Ep, rho1000 [%], mu0, fprg, ends 'both'|'left'|'right', friction 'dixiemes'|'continu' } ;
 *  mat { Eij, Ei28, epsR, Kfl, rj, kc (raccourcissement, ½ par défaut), k: [1,02 ; 0,8 ; 0,98 ; 1,2] } ;
 *  MGmean(x) moment des C.P. moyennes (pour le fluage) ; nPerSpan (multiple de 10).
 */
export function prestress(p) {
  const { spans, sec, cable: cb, mat } = p;
  const nPer = Math.max(10, Math.round((p.nPerSpan || 100) / 10) * 10);
  const geo = cableGeometry(spans, cb.segs), Lt = geo.Ltot;
  const xs = [], tenth = [];
  geo.x0.slice(0, -1).forEach((x, j) => { for (let k = 0; k < nPer; k++) { xs.push(x + spans[j] * k / nPer); if (k % (nPer / 10) === 0) tenth.push(xs.length - 1); } });
  xs.push(Lt); tenth.push(xs.length - 1);
  const N = xs.length, z = xs.map(geo.z), th = xs.map(geo.slope);
  const Ag = Math.PI * cb.phiG ** 2 / 4, Bn = sec.B - cb.n * Ag, In = z.map(zz => sec.I - cb.n * Ag * zz * zz);
  const nAp = cb.n * cb.Ap, s0 = cb.sigma0, ends = cb.ends || 'both';
  const k = mat.k || [1.02, 0.8, 0.98, 1.2];

  // ---- frottement (depuis la gauche et depuis la droite)
  const frictionFrom = fromLeft => {
    const order = fromLeft ? xs.map((_, i) => i) : xs.map((_, i) => N - 1 - i);
    const dist = order.map(i => (fromLeft ? xs[i] : Lt - xs[i]));
    const sig = new Array(N);
    if ((cb.friction || 'dixiemes') === 'dixiemes') {
      // convention du programme PSIDP : déviation cumulée sur la grille des dixièmes de travée, σ interpolée linéairement
      const tOrd = fromLeft ? tenth : [...tenth].reverse();
      let a = 0; const sT = [], dT = [];
      tOrd.forEach((i, q) => { if (q > 0) a += Math.abs(th[i] - th[tOrd[q - 1]]); const d = fromLeft ? xs[i] : Lt - xs[i]; dT.push(d); sT.push(s0 * Math.exp(-cb.f * a - cb.phi * d)); });
      order.forEach((i, q) => { sig[i] = interp(dT, sT, dist[q]); });
    } else {
      let a = 0;
      order.forEach((i, q) => { if (q > 0) a += Math.abs(th[i] - th[order[q - 1]]); sig[i] = s0 * Math.exp(-cb.f * a - cb.phi * dist[q]); });
    }
    return sig;
  };
  const sL = frictionFrom(true), sR = frictionFrom(false);

  // ---- recul d'ancrage : ∫₀^d 2[σ(x) − σ(d)] dx = g E_p
  const recoil = (sig, fromLeft) => {
    const dist = xs.map(x => (fromLeft ? x : Lt - x)), order = xs.map((_, i) => (fromLeft ? i : N - 1 - i));
    const dO = order.map(i => dist[i]), sO = order.map(i => sig[i]);
    const target = cb.g * cb.Ep;
    const G = d => { const sd = interp(dO, sO, d); let s = 0; for (let q = 1; q < dO.length && dO[q - 1] < d; q++) { const xa = dO[q - 1], xb = Math.min(dO[q], d), sa = sO[q - 1], sb = xb === dO[q] ? sO[q] : interp(dO, sO, xb); s += (xb - xa) * ((sa + sb) / 2 - sd) * 2; } return s; };
    let d;
    if (G(Lt) <= target) { d = Lt; }
    else { let lo = 0, hi = Lt; for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (G(mid) < target) lo = mid; else hi = mid; } d = (lo + hi) / 2; }
    const sd = interp(dO, sO, d), extra = d >= Lt ? (target - G(Lt)) / Lt : 0;   // recul « traversant » : décalage uniforme complémentaire
    const loss = dist.map((x, i) => (x <= d ? 2 * (sig[i] - sd) + extra : 0));
    return { d, loss, sd };
  };
  const rL = ends !== 'right' ? recoil(sL, true) : null, rR = ends !== 'left' ? recoil(sR, false) : null;
  const sFric = xs.map((_, i) => (ends === 'both' ? Math.max(sL[i], sR[i]) : ends === 'left' ? sL[i] : sR[i]));
  const sAfter = xs.map((_, i) => {
    const a = rL ? sL[i] - rL.loss[i] : -Infinity, b = rR ? sR[i] - rR.loss[i] : -Infinity;
    return ends === 'both' ? Math.max(a, b) : ends === 'left' ? a : b;
  });
  const lossRecoil = xs.map((_, i) => sFric[i] - sAfter[i]);

  const hyperOf = sig => { const F = sig.map(s => nAp * s); return { F, h: hyperstatic(spans, xs, F.map((f, i) => f * z[i])) }; };
  const sigmaB = (sig, MG) => { const { F, h } = hyperOf(sig); return xs.map((x, i) => F[i] / Bn + (F[i] * z[i] + h.at(x) + (MG ? MG(x) : 0)) * z[i] / In[i]); };

  // ---- raccourcissement élastique : σ̄_bj = moyenne le long du câble de σ_b sous la seule précontrainte initiale
  // (σ_b calculée avec la tension après raccourcissement : point fixe, deux itérations suffisent)
  let dSc = 0, sbj = 0;
  for (let it = 0; it < 4; it++) { sbj = trapz(xs, sigmaB(sAfter.map(s => s - dSc), null)) / Lt; dSc = (mat.kc ?? 0.5) * cb.Ep / mat.Eij * sbj; }
  const spi = sAfter.map(s => s - dSc), dSi = spi.map(s => s0 - s);

  // ---- pertes différées (fluage réajusté par itération)
  const dRho = spi.map(s => Math.max(0, 0.06 * cb.rho1000 * (s / cb.fprg - cb.mu0) * s));
  const dR = mat.epsR * cb.Ep, MG = p.MGmean || (() => 0);
  let sInf = spi.map((s, i) => s - dR - dRho[i]), dFl = null, rect = null, dSd = null;
  const hist = [];
  for (let it = 0; it < (p.iterations || 6); it++) {
    const sb = sigmaB(sInf, MG);
    dFl = sb.map(v => Math.max(0, mat.Kfl * cb.Ep * v / mat.Ei28));
    rect = spi.map((s, i) => -2 * dRho[i] * (dR + dFl[i]) / s);
    dSd = spi.map((s, i) => dR + dFl[i] + dRho[i] + rect[i]);
    const nw = spi.map((s, i) => s - dSd[i]);
    hist.push(Math.max(...nw.map((v, i) => Math.abs(v - sInf[i]))));
    sInf = nw;
  }

  // ---- états : mise en tension (M.T), mise en service (M.S), service définitif (E.S) ; moyen / max (P1) / min (P2)
  const phase = r => {
    const dS = dSi.map((d, i) => d + r * dSd[i]);
    const mk = sig => { const { F, h } = hyperOf(sig); return { sig, F, hyp: h, Mhyp: xs.map(x => h.at(x)) }; };
    return { dS, moy: mk(dS.map(d => s0 - d)), max: mk(dS.map(d => k[0] * s0 - k[1] * d)), min: mk(dS.map(d => k[2] * s0 - k[3] * d)) };
  };
  const MT = phase(0), MS = phase(mat.rj ?? 0.5), ES = phase(1);

  return {
    xs, z, th, Bn, In, Ag, nAp, geo, tenth,
    friction: { sL, sR, s: sFric }, recoil: { left: rL && { d: rL.d, sd: rL.sd }, right: rR && { d: rR.d, sd: rR.sd }, loss: lossRecoil },
    shortening: { sbj, dSc }, spi, dSi,
    delayed: { dRho, dR, dFl, rect, dSd, conv: hist },
    MT, MS, ES,
    /** Valeur d'un tableau aux nœuds en x (interpolation linéaire). */
    at: (arr, x) => interp(xs, arr, x),
    /** Abscisse globale du dixième f de la travée j. */
    xOf: (j, f) => geo.x0[j] + f * spans[j],
  };
}

/**
 * Flèche w(x) (positive vers le haut) d'une poutre continue à inertie constante sous son diagramme de moments réel M(x)
 * (moments hyperstatiques compris) : w″ = −M/EI intégrée deux fois sur chaque travée avec w = 0 aux appuis. Renvoie aussi
 * les rotations sur appuis (à gauche et à droite de chaque appui).
 */
export function deflection(xs, M, spans, EI) {
  const x0 = [0]; spans.forEach(L => x0.push(x0[x0.length - 1] + L));
  const w = new Array(xs.length).fill(0), rot = x0.map(() => ({ g: null, d: null }));
  for (let j = 0; j < spans.length; j++) {
    const idx = []; for (let k = 0; k < xs.length; k++) if (xs[k] >= x0[j] - 1e-9 && xs[k] <= x0[j + 1] + 1e-9) idx.push(k);
    const th = [0], ww = [0];
    for (let q = 1; q < idx.length; q++) {
      const a = idx[q - 1], b = idx[q], dx = xs[b] - xs[a];
      th.push(th[q - 1] + 0.5 * (M[a] + M[b]) / EI * dx);
      ww.push(ww[q - 1] + 0.5 * (th[q - 1] + th[q]) * dx);
    }
    const Lj = xs[idx[idx.length - 1]] - xs[idx[0]], c = -ww[ww.length - 1] / Lj;   // w(L) = 0 : rotation initiale c
    idx.forEach((k, q) => { w[k] = ww[q] + c * (xs[k] - xs[idx[0]]); });
    rot[j].d = c; rot[j + 1].g = th[th.length - 1] + c;
  }
  return { w, rot };
}
