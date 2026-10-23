/**
 * Calcul par phases d'une ossature plane en béton, avec fluage et retrait : méthode pas à pas (Bažant, 1972 ; Ghali,
 * Favre et Elbadry, « Concrete Structures: Stresses and Deformations », ch. 5 ; guide Sétra « Calcul des effets différés »).
 *
 * Principe. Chaque barre est décrite par ses déformations naturelles d = (Δ, θ̄ᵢ, θ̄ⱼ) — allongement et rotations des
 * extrémités par rapport à la corde — et ses efforts naturels q = (N, Mᵢ, Mⱼ), liés par q = E·k₁·d (k₁ : raideur naturelle
 * pour E = 1). Le temps est découpé en pas t₀ < t₁ < … ; l'incrément d'efforts du pas n, δₙ = k₁⁻¹ Δqₙ (homogène à
 * une déformation × module), est supposé appliqué à t_{n−½}. Le principe de superposition (béton viscoélastique
 * linéaire vieillissant) donne la déformation à tₙ :
 *     d(tₙ) = Σₖ δₖ J(tₙ, t_{k−½}) + d_retrait(tₙ)
 * Au pas n, la structure est donc résolue avec le module effectif Eₙ = 1 / J(tₙ, t_{n−½}) de chaque barre, sous les
 * charges du pas et sous les déformations imposées
 *     Δd_impₙ = Σ_{k<n} δₖ [J(tₙ, t_{k−½}) − J(t_{n−1}, t_{k−½})] + Δd_retraitₙ
 * (fluage des incréments antérieurs et retrait du pas). Un changement de schéma (barre activée, appui ajouté ou retiré,
 * liaison créée) se fait à un instant de phase, par un pas de durée nulle (J(t, t) = 1 / E_c(t)) : une barre ou une
 * liaison mise en place n'est sollicitée que par les incréments postérieurs ; un appui retiré restitue sa réaction.
 *
 * Unités : m, kN, kN·m ; modules des bétons en MPa (convertis en kPa), temps en jours depuis l'origine du chantier.
 * Conventions : axes globaux x vers la droite, y vers le haut ; charges réparties w (kN/m) verticales, positives vers le
 * bas ; moment fléchissant M(x) positif quand il tend la fibre inférieure (y local négatif) ; N positif en traction.
 */
import { solve } from '../linalg.js';
import { loiBeton } from './fluage.js';
import { pertesInstantanees } from './precontrainte.js';

const DDL = { ux: 0, uy: 1, rz: 2 };

/**
 * Perte par relaxation de l'acier (MPa) après d jours, NF EN 1992-1-1 § 3.3.2 (7), sous la contrainte initiale σ_pi :
 * classe 1 (fils, torons ordinaires, 3.28), classe 2 (basse relaxation, 3.29), classe 3 (barres, 3.30) ; μ = σ_pi/f_pk,
 * ρ1000 en %. Le multiplicateur `relax` (1 par défaut) permet de réduire la relaxation (0,8, § 5.10.6 (1) b).
 */
export function relaxation(c, sigmaPi) {
  const fpk = c.fpk ?? 1860, rho = c.rho1000 ?? 2.5, cl = c.classe ?? 2, mu = sigmaPi / fpk, f = c.relax ?? 1;
  const [a, b] = cl === 1 ? [5.39, 6.7] : cl === 3 ? [1.98, 8] : [0.66, 9.1];
  return d => (d > 0 ? f * sigmaPi * a * rho * Math.exp(b * mu) * ((d * 24) / 1000) ** (0.75 * (1 - mu)) * 1e-5 : 0);
}

/** Instants de calcul entre deux phases : progression géométrique depuis l'instant de début (pas par décade). */
export function instants(ta, tb, parDecade = 8, premier = 0.1) {
  const out = [], r = 10 ** (1 / parDecade);
  if (!(tb > ta)) return out;
  let tau = Math.min(premier, (tb - ta));
  while (ta + tau < tb - 1e-9) { out.push(ta + tau); tau *= r; }
  out.push(tb);
  return out;
}

/**
 * Calcul par phases.
 * modele = {
 *   noeuds : [[x, y], …],
 *   betons : { clé: { loi?: 'ec2'|'dischinger'|'elastique', fck, RH, h0, ciment, ts, E, phiInf, T, epsInf, tCoulage (j) } },
 *   barres : [{ i, j, A (m²), I (m⁴), beton: clé, e? (décalage du centre de gravité, m, + vers y local), nom? }],
 *            (section composée : une barre par partie — poutre préfabriquée, hourdis… — sur les mêmes nœuds, chacune
 *             avec son béton, son décalage et sa phase d'activation ; maillage fin, l'effort normal étant constant par barre)
 *   phases : [{ t (j), nom?, activer?: [indices de barres], appuis?: [{ n, ddl: ['ux','uy','rz'] }],
 *               retirerAppuis?: [{ n, ddl }], liaisons?: [{ a, b, ddl: ['ux','uy','rz'], k? }],
 *               charges?: [{ barre, w }], nodales?: [{ n, F: [Fx, Fy, M] }] }],
 *   cables?: [{ nom?, Ap (m²), Ep (MPa, 195 000), fpk (1 860), rho1000 (2,5 %), classe (2), relax (1),
 *               phase (indice de la phase de mise en tension), P (kN, après pertes instantanées : nombre ou tableau par
 *               segment) — ou P0 (force au vérin) avec mu, k, g, tension ('gauche'|'droite'|'deux') : pertes par frottement
 *               et recul d'ancrage calculées (precontrainte.js), segments: [{ barre, ei, ej }] (excentrements par rapport à la ligne moyenne, m, + vers y local) }],
 *   tFin (j), parDecade?
 * }
 * Câbles : post-tension, force P appliquée au béton seul puis câble injecté (adhérent) ; il suit ensuite les
 * déformations différées du béton (pertes par retrait et fluage) et relaxe (§ 3.3.2). Segment rectiligne excentré relié
 * aux nœuds de la barre par des bras rigides : allongement Δ_s = b·u, b = [−c, −s, c·eᵢ, c, s, −c·eⱼ] (c, s : cosinus
 * et sinus de l'inclinaison du segment sur la barre).
 * Renvoie { pas: [{ t, phase, barres: [{ N, Vi, Mi, Vj, Mj, Mmi }], cables: [{ cable, seg, N, P0, perte }], u, reactions }], phases: [indices de pas en fin de
 * phase (juste avant la suivante)], final, barre(k, t) }.
 */
/** Efforts de la section composée (somme des parties actives) rapportés à la ligne des nœuds : N, M = Σ (Mₖ − Nₖ eₖ). */
export function resultante(pasCalc, indices, x) {
  let N = 0, M = 0;
  for (const k of indices) { const r = pasCalc.barres[k]; if (!r) continue; N += r.N; M += r.M(x) - r.N * r.e; }
  return { N, M };
}

export function calculPhasage(modele) {
  const { noeuds, barres, phases } = modele, nn = noeuds.length, nd = 3 * nn;
  const lois = Object.fromEntries(Object.entries(modele.betons).map(([k, o]) => [k, { ...loiBeton(o), tC: o.tCoulage ?? 0 }]));
  const B = barres.map((b, k) => {
    const [xi, yi] = noeuds[b.i], [xj, yj] = noeuds[b.j], L = Math.hypot(xj - xi, yj - yi), c = (xj - xi) / L, s = (yj - yi) / L;
    const loi = lois[b.beton]; if (!loi) throw new Error(`barre ${k} : béton « ${b.beton} » inconnu`);
    return { ...b, k, L, c, s, loi, actif: false, hist: [], q: [0, 0, 0], feq: [0, 0, 0, 0, 0, 0], wTot: 0, dSh: 0 };
  });
  // âge du béton (j) et fonction de fluage en 1/kPa
  const J = (b, t, tau) => b.loi.J(Math.max(t - b.loi.tC, 1e-3), Math.max(tau - b.loi.tC, 1e-3)) / 1000;
  const retrait = (b, t) => b.loi.retrait(Math.max(t - b.loi.tC, 0));
  const k1 = b => [[b.A / b.L, 0, 0], [0, 4 * b.I / b.L, 2 * b.I / b.L], [0, 2 * b.I / b.L, 4 * b.I / b.L]];
  // matrice B (local) : d = Bm · u_local, u_local = [ui, vi, θi, uj, vj, θj]
  const Bm = b => [[-1, 0, 0, 1, 0, 0], [0, 1 / b.L, 1, 0, -1 / b.L, 0], [0, 1 / b.L, 0, 0, -1 / b.L, 1]];
  const T6 = b => { const { c, s } = b; const R = [[c, s, 0], [-s, c, 0], [0, 0, 1]]; const T = Array.from({ length: 6 }, () => Array(6).fill(0)); for (let a = 0; a < 3; a++) for (let e = 0; e < 3; e++) { T[a][e] = R[a][e]; T[a + 3][e + 3] = R[a][e]; } return T; };
  const mul = (A, x) => A.map(r => r.reduce((s, v, i) => s + v * x[i], 0));
  const tmul = (A, x) => A[0].map((_, j) => A.reduce((s, r, i) => s + r[j] * x[i], 0));
  const ddl = b => [3 * b.i, 3 * b.i + 1, 3 * b.i + 2, 3 * b.j, 3 * b.j + 1, 3 * b.j + 2];
  // barre décalée (partie d'une section composée) : centre de gravité à e de la ligne des nœuds (y local), bras rigides :
  // u_partie = u − e·θ, v_partie = v, θ_partie = θ  →  d = B₀ · O · u_local
  const Om = e => { const O = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, c) => (a === c ? 1 : 0))); O[0][2] = -e; O[3][5] = -e; return O; };
  const mm = (A, Bx) => A.map(r => Bx[0].map((_, j) => r.reduce((s0, v, k) => s0 + v * Bx[k][j], 0)));
  for (const b of B) { b.e = b.e || 0; b.Bm0 = Bm(b); b.O = Om(b.e); b.Bm = mm(b.Bm0, b.O); b.T = T6(b); b.k1 = k1(b); b.dofs = ddl(b); }

  // câbles de précontrainte : un segment rectiligne par barre, excentrements e_i, e_j (m, positifs vers y local)
  const S = [];
  const instant = [];
  (modele.cables || []).forEach((c, ic) => {
    const Ep = (c.Ep ?? 195000) * 1000, segs = c.segments || [];
    // force au vérin P0 donnée : pertes par frottement et recul d'ancrage (§ 5.10.5.2 et 5.10.5.3)
    if (c.P == null && c.P0 != null) {
      const geo = segs.map(g => { const b = B[g.barre], ei = g.ei ?? 0, ej = g.ej ?? ei; return { L: Math.hypot(b.L, ej - ei), alpha: Math.atan2(b.s, b.c) + Math.atan((ej - ei) / b.L) }; });
      const pi = pertesInstantanees(c, geo);
      c = { ...c, P: pi.P }; instant[ic] = pi;
    }
    segs.forEach((g, is) => {
      const b = B[g.barre], dL = (g.ej ?? g.ei ?? 0) - (g.ei ?? 0), Ls = Math.hypot(b.L, dL), ca = b.L / Ls, sa = dL / Ls;
      const ei = g.ei ?? 0, ej = g.ej ?? ei;
      const bl = [-ca, -sa, ca * ei, ca, sa, -ca * ej], bg = tmul(b.T, bl);
      const P = Array.isArray(c.P) ? c.P[is] : c.P;
      S.push({ cable: ic, seg: is, b, bg, Ls, k: Ep * c.Ap / Ls, Ep, Ap: c.Ap, P, N: 0, actif: false, t0: null,
        relax: relaxation(c, P / c.Ap / 1000), phase: c.phase ?? 0, nom: c.nom || `câble ${ic + 1}` });
    });
  });

  const appuis = new Set(), reac = new Float64Array(nd), u = new Float64Array(nd), liaisons = [];
  const pas = [], finPhase = [];

  /** Résout un pas : Eₙ et τ par barre, charges nodales F (global), déformations imposées par barre. */
  function resoudre(t, tPrev, F, chargesPas) {
    const K = Array.from({ length: nd }, () => new Float64Array(nd)), R = Float64Array.from(F);
    const tau = tPrev < t ? tMid(tPrev, t) : t;
    const etat = [];
    for (const b of B) {
      if (!b.actif) { etat.push(null); continue; }
      const En = 1 / J(b, t, tau);
      // déformations imposées : fluage des incréments antérieurs + retrait du pas
      const dImp = [0, 0, 0];
      if (tPrev < t) for (const h of b.hist) { const f = J(b, t, h.tau) - J(b, tPrev, h.tau); for (let a = 0; a < 3; a++) dImp[a] += h.delta[a] * f; }
      const dsh = (retrait(b, t) - retrait(b, Math.max(tPrev, b.tAct))) * b.L; dImp[0] += tPrev < t ? dsh : 0;
      const kn = b.k1.map(r => r.map(v => v * En));
      // raideur locale B^T kn B, puis globale T^T k T
      const kl = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, e) => { let s = 0; for (let p = 0; p < 3; p++) for (let r = 0; r < 3; r++) s += b.Bm[p][a] * kn[p][r] * b.Bm[r][e]; return s; }));
      const kg = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, e) => { let s = 0; for (let p = 0; p < 6; p++) for (let r = 0; r < 6; r++) s += b.T[p][a] * kl[p][r] * b.T[r][e]; return s; }));
      for (let a = 0; a < 6; a++) for (let e = 0; e < 6; e++) K[b.dofs[a]][b.dofs[e]] += kg[a][e];
      // charges équivalentes : déformations imposées (+ Bᵀ kn d_imp) et charges réparties du pas
      const fImp = tmul(b.Bm, mul(kn, dImp));
      const w = chargesPas.get(b.k) || 0, qx = -w * b.s, qy = -w * b.c, L = b.L;
      const feq = [qx * L / 2, qy * L / 2, qy * L * L / 12, qx * L / 2, qy * L / 2, -qy * L * L / 12];
      const fg = tmul(b.T, fImp.map((v, a) => v + tmul(b.O, feq)[a]));
      for (let a = 0; a < 6; a++) R[b.dofs[a]] += fg[a];
      etat.push({ En, dImp, kn, feq, w });
    }
    const etatS = S.map(sg => {
      if (!sg.actif) return null;
      for (let a = 0; a < 6; a++) for (let e = 0; e < 6; e++) K[sg.b.dofs[a]][sg.b.dofs[e]] += sg.k * sg.bg[a] * sg.bg[e];
      // relaxation de l'acier entre tPrev et t : allongement imposé Δσ_pr·L_s/E_p (la force baisse à longueur constante)
      const dImp = tPrev < t ? (sg.relax(t - sg.t0) - sg.relax(tPrev - sg.t0)) / sg.Ep * 1000 * sg.Ls : 0;
      if (dImp) for (let a = 0; a < 6; a++) R[sg.b.dofs[a]] += sg.k * dImp * sg.bg[a];
      return { dImp };
    });
    for (const l of liaisons) for (const d of l.ddl) {
      const a = 3 * l.a + DDL[d], c = 3 * l.b + DDL[d];
      K[a][a] += l.k; K[c][c] += l.k; K[a][c] -= l.k; K[c][a] -= l.k;
    }
    // DDL bloqués : appuis, et nœuds sans raideur (barres non encore activées)
    const raide = new Uint8Array(nd);
    for (const b of B) if (b.actif) for (const d of b.dofs) raide[d] = 1;
    for (const l of liaisons) for (const d of l.ddl) { raide[3 * l.a + DDL[d]] = 1; raide[3 * l.b + DDL[d]] = 1; }
    const libres = [];
    for (let d = 0; d < nd; d++) if (!appuis.has(d) && raide[d]) libres.push(d);
    const Kf = libres.map(i => libres.map(j => K[i][j])), Rf = libres.map(i => R[i]);
    const xf = libres.length ? solve(Kf, Rf) : [];
    const du = new Float64Array(nd); libres.forEach((d, i) => { du[d] = xf[i]; });
    // réactions : K du − R aux DDL bloqués
    for (const d of appuis) { let s = -R[d]; for (let e = 0; e < nd; e++) s += K[d][e] * du[e]; reac[d] += s; }
    for (let d = 0; d < nd; d++) u[d] += du[d];
    S.forEach((sg, k) => { const e = etatS[k]; if (!e) return; let dd = 0; for (let a = 0; a < 6; a++) dd += sg.bg[a] * du[sg.b.dofs[a]]; sg.N += sg.k * (dd - e.dImp); });
    // incréments d'efforts naturels des barres : δₙ = Eₙ (B Δu_local − Δd_imp)
    B.forEach((b, k) => {
      const e = etat[k]; if (!e) return;
      const ul = mul(b.T, b.dofs.map(d => du[d])), dd = mul(b.Bm, ul);
      const delta = dd.map((v, a) => e.En * (v - e.dImp[a]));
      b.hist.push({ tau, delta });
      const dq = mul(b.k1, delta); for (let a = 0; a < 3; a++) b.q[a] += dq[a];
      for (let a = 0; a < 6; a++) b.feq[a] += e.feq[a];
      b.wTot += e.w;
    });
  }
  const tMid = (a, b) => a + (b - a) / 2;

  function photographie(t, iPhase) {
    pas.push({
      t, phase: iPhase, u: Array.from(u), reactions: Array.from(reac),
      cables: S.map(sg => (sg.actif ? { cable: sg.cable, seg: sg.seg, N: sg.N, P0: sg.P, perte: 1 - sg.N / sg.P } : null)),
      barres: B.map(b => {
        if (!b.actif) return null;
        // efforts aux extrémités (sur la barre, repère local) : f = Bᵀ q − f_eq
        const f = tmul(b.Bm0, b.q).map((v, a) => v - b.feq[a]);   // au centre de gravité de la barre
        const qy = -b.wTot * b.c, L = b.L;
        const Mx = x => -f[2] + f[1] * x + qy * x * x / 2;
        return { N: b.q[0], Vi: f[1], Mi: Mx(0), Vj: -f[4], Mj: Mx(L), Mmi: Mx(L / 2), M: Mx, e: b.e };
      }),
    });
  }

  let tCour = phases.length ? phases[0].t : 0;
  phases.forEach((ph, iPh) => {
    // fluage et retrait jusqu'à l'instant de la phase
    if (ph.t < tCour - 1e-9) throw new Error(`phase ${iPh} : instant antérieur à la phase précédente`);
    if (iPh > 0) {
      let tp = tCour;
      for (const t of instants(tCour, ph.t, modele.parDecade || 8)) { resoudre(t, tp, new Float64Array(nd), new Map()); tp = t; photographie(t, iPh - 1); }
      finPhase.push(pas.length - 1);
    }
    tCour = ph.t;
    // changements de schéma et chargements de la phase (pas instantané)
    for (const k of ph.activer || []) { B[k].actif = true; B[k].tAct = ph.t; }
    for (const a of ph.appuis || []) for (const d of a.ddl) appuis.add(3 * a.n + DDL[d]);
    const F = new Float64Array(nd);
    for (const a of ph.retirerAppuis || []) for (const d of a.ddl) { const g = 3 * a.n + DDL[d]; if (appuis.delete(g)) { F[g] -= reac[g]; reac[g] = 0; } }
    for (const l of ph.liaisons || []) {
      const k = l.k ?? 1e3 * Math.max(...B.filter(b => b.actif).map(b => 30e6 * b.I / b.L), 1e6);
      liaisons.push({ a: l.a, b: l.b, ddl: l.ddl, k });
    }
    for (const nf of ph.nodales || []) nf.F.forEach((v, a) => { F[3 * nf.n + a] += v; });
    const ch = new Map(); for (const c of ph.charges || []) ch.set(c.barre, (ch.get(c.barre) || 0) + c.w);
    // mise en tension (post-tension) : la force P (après pertes instantanées) agit sur le béton seul, puis le câble est
    // injecté — il devient adhérent, avec sa force P, et suit ensuite les déformations du béton
    const tendus = S.filter(sg => sg.phase === iPh && !sg.actif);
    for (const sg of tendus) for (let a = 0; a < 6; a++) F[sg.b.dofs[a]] -= sg.bg[a] * sg.P;
    resoudre(ph.t, ph.t, F, ch);
    for (const sg of tendus) { sg.actif = true; sg.N = sg.P; sg.t0 = ph.t; }
    photographie(ph.t, iPh);
  });
  // phase finale : jusqu'à tFin
  let tp = tCour;
  for (const t of instants(tCour, modele.tFin ?? tCour, modele.parDecade || 8)) { resoudre(t, tp, new Float64Array(nd), new Map()); tp = t; photographie(t, phases.length - 1); }
  finPhase.push(pas.length - 1);
  return { pas, finPhase, final: pas[pas.length - 1], barres: B.map(b => ({ nom: b.nom, L: b.L, i: b.i, j: b.j })), pertesInstantanees: instant };
}
