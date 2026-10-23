/**
 * Fléaux en construction : moments de déséquilibre sur pile et clouage provisoire du voussoir sur pile (VSP).
 *
 * Cas de charge à chaque stade (après le voussoir k), d'après les règles usuelles de la construction par encorbellements
 * (AASHTO « Guide Specifications for Design and Construction of Segmental Concrete Bridges », § 7.4 ; reprises dans les
 * guides français) :
 *   DIFF  dissymétrie du poids propre : +2 % du poids d'un demi-fléau ;
 *   CLL   charges de chantier réparties : 0,48 kN/m² sur un demi-fléau, 0,24 kN/m² sur l'autre ;
 *   WUP   vent ascendant : 0,24 kN/m² sur un demi-fléau ;
 *   LAG   bétonnage dissymétrique : décalage d'un demi-voussoir entre les deux équipages ;
 *   AI    chute d'un équipage mobile (accidentel) : perte brutale de Q_eq en bout de fléau, effet dynamique 2 (AASHTO :
 *         réponse dynamique de 100 %).
 * Combinaisons : ELU de construction C1 = 1,35 DIFF + 1,5 (CLL + WUP) ; C2 = 1,35 (DIFF + LAG) + 1,5 CLL ;
 * accidentelle CA = DIFF + CLL + AI (EN 1990 § 6.4.3.3, γ = 1). Effort normal favorable : 0,9 (poids des deux demi-fléaux
 * et des équipages).
 * Clouage : deux files de cales sur la pile à l'entraxe d_c ; traction par file T = M/d_c − 0,9 N/2 reprise par des barres
 * de précontrainte verticales (Ø36, f_p0,1k = 950 MPa, A = 1 018 mm², F_d = A f_p0,1k / 1,15) ; compression des cales
 * R = N/2 + M/d_c + effort de blocage des barres.
 * Contraintes au VSP (section sur pile) : état du calcul par phases à la fin du stade + incrément du cas C1 caractéristique
 * (γ = 1) ; limites 0,6 f_ck(t) en compression (EN 1992-1-1 § 5.10.2.2 (5)) et f_ctm(t) en traction.
 * Unités : m, kN, kN·m, MPa (traction positive).
 */
import { betonEC2 } from './fluage.js';

export const BARRE_36 = { A: 1018e-6, fp01k: 950, Fd: 1018e-6 * 950 / 1.15 * 1000 };

export function desequilibreFleau(out, { dc = 3.0, Lmax = null } = {}) {
  const { p, modele, reperes: R, r } = out, F = R.F[0], N = modele.noeuds, B = p.caisson ? p.caisson.B : 12, Qeq = p.Qeq || 0;
  const xp = F.xp, bet = betonEC2({ fck: p.fck, RH: p.RH, h0: p.h0, ciment: p.ciment });
  const etapes = [];
  for (let k = 0; k <= R.nv; k++) {
    const iPh = k === 0 ? 0 : modele.phases.findIndex(ph => new RegExp(`^Voussoirs ${k} :`).test(ph.nom));
    if (iPh < 0) continue;
    // demi-fléau gauche actif : barres G0..Gk
    let W = 0, MG = 0;
    for (let q = 0; q <= k; q++) { const b = modele.barres[F.bG[q]], xa = N[b.i][0], xb = N[b.j][0], L = Math.abs(xb - xa), w = b.A * p.gBeton * L; W += w; MG += w * Math.abs((xa + xb) / 2 - xp); }
    const Lh = Math.abs(N[F.ids.G[k]][0] - xp), xTip = Lh;
    const bk = k > 0 ? modele.barres[F.bG[k]] : null, Wk = bk ? bk.A * p.gBeton * Math.abs(N[bk.j][0] - N[bk.i][0]) : 0, xk = bk ? Math.abs((N[bk.i][0] + N[bk.j][0]) / 2 - xp) : 0;
    const M = { DIFF: 0.02 * MG, CLL: (0.48 - 0.24) * B * Lh * Lh / 2, WUP: 0.24 * B * Lh * Lh / 2, LAG: k > 0 ? 0.5 * Wk * xk : 0, AI: 2 * Qeq * xTip };
    const Nv = 2 * W + 2 * Qeq;
    const comb = { C1: 1.35 * M.DIFF + 1.5 * (M.CLL + M.WUP), C2: 1.35 * (M.DIFF + M.LAG) + 1.5 * M.CLL, CA: M.DIFF + M.CLL + M.AI };
    const Md = Math.max(comb.C1, comb.C2, comb.CA), cas = Object.keys(comb).find(c => comb[c] === Md);
    const T = Math.max(0, Md / dc - 0.9 * Nv / 2), nb = Math.max(2, Math.ceil(T / BARRE_36.Fd - 1e-9)), Rc = Nv / 2 + Md / dc + nb * BARRE_36.Fd * 0.5;
    // contraintes au VSP : barre D0 du fléau 1 à la pile + incrément caractéristique C1 (γ = 1)
    const pas = r.pas[r.finPhase[iPh]], bi = F.bD[0], rb = pas.barres[bi], b = modele.barres[bi], f = R.fibres[bi], t = modele.phases[iPh].t;
    let sig = null;
    if (rb) {
      const Mk = M.DIFF + M.CLL + M.WUP, M0 = rb.M(0), N0 = rb.N;
      const s = (Mx, sgn) => ({ sup: (N0 / b.A - Mx * f.vs / b.I) / 1000, inf: (N0 / b.A + Mx * f.vi / b.I) / 1000 });
      const base = s(M0), plus = s(M0 - Mk), moins = s(M0 + Mk);   // le déséquilibre augmente ou réduit le moment négatif sur pile
      const fckt = bet.fckT(Math.max(t, 1)), fctmt = bet.fctmT(Math.max(t, 1));
      sig = { base, plus, moins, sMin: Math.min(plus.sup, plus.inf, moins.sup, moins.inf), sMax: Math.max(plus.sup, plus.inf, moins.sup, moins.inf), limC: -0.6 * fckt, limT: fctmt, t };
    }
    etapes.push({ k, nom: modele.phases[iPh].nom, t, W, Lh, Wk, M, comb, Md, cas, Nv, T, nb, Rc, sig });
  }
  const pire = etapes.reduce((a, e) => (e.Md > a.Md ? e : a));
  const verifs = [], add = (nom, val, lim, ok, ref) => verifs.push({ nom, val, lim, ok, ref, x: xp });
  add(`Clouage provisoire : ${pire.nb} barres Ø36 par file (stade ${pire.k}, ${pire.cas}) — traction par file [kN]`, pire.T, pire.nb * BARRE_36.Fd, pire.T <= pire.nb * BARRE_36.Fd + 1e-6, 'AASHTO Segmental Guide Spec. § 7.4 ; F_d = A f_p0,1k / 1,15');
  const ws = etapes.filter(e => e.sig);
  if (ws.length) {
    const wc = ws.reduce((a, e) => (e.sig.sMin / e.sig.limC > a.sig.sMin / a.sig.limC ? e : a));
    add(`Déséquilibre : compression au VSP (stade ${wc.k}, t = ${wc.sig.t.toFixed(0)} j)`, wc.sig.sMin, wc.sig.limC, wc.sig.sMin >= wc.sig.limC, 'EN 1992-1-1 § 5.10.2.2 (5) : 0,6 f_ck(t)');
    const wt = ws.reduce((a, e) => (e.sig.sMax / e.sig.limT > a.sig.sMax / a.sig.limT ? e : a));
    add(`Déséquilibre : traction au VSP (stade ${wt.k}, t = ${wt.sig.t.toFixed(0)} j)`, wt.sig.sMax, wt.sig.limT, wt.sig.sMax <= wt.sig.limT, 'f_ctm(t) (EN 1992-1-1 § 3.1.2) ; au-delà : armatures passives');
  }
  return { etapes, pire, dc, verifs, ok: verifs.every(v => v.ok) };
}
