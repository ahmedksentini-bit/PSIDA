/**
 * Pertes instantanées de précontrainte d'un câble post-tendu (NF EN 1992-1-1 § 5.10.5) :
 *  - frottement (§ 5.10.5.2) : P(x) = P₀ e^{−μ(θ + k x)}, θ = somme des déviations angulaires depuis l'ancrage actif,
 *    k = déviation parasite par mètre (rad/m) ;
 *  - recul d'ancrage g (§ 5.10.5.3) : le diagramme de tension est réfléchi autour d'un niveau P* tel que l'aire de la
 *    perte égale E_p A_p g :  2 ∫ max(P(x) − P*, 0) dx = E_p A_p g  (si la zone d'influence λ dépasse le câble, toute la
 *    longueur est affectée : P'(x) = 2P* − P(x)) ;
 *  - mise en tension par une extrémité ou par les deux (le plus grand des deux diagrammes, chacun avec son recul).
 * Le raccourcissement élastique dû à la mise en tension d'autres câbles (§ 5.10.5.1) est pris en compte par le calcul
 * par phases lui-même dès que les câbles sont tendus à des phases différentes.
 *
 * Géométrie : suite de segments rectilignes (longueur Lᵢ, inclinaison αᵢ dans le plan de la poutre, rad). Résultat : force
 * moyenne de chaque segment et diagramme détaillé.
 */

/** Diagramme de frottement depuis l'extrémité gauche : abscisses curvilignes et forces aux nœuds de discrétisation. */
function frottement(segs, P0, mu, k, nSub = 20) {
  const xs = [0], Ps = [P0];
  let x = 0, theta = 0;
  segs.forEach((s, i) => {
    if (i > 0) theta += Math.abs(s.alpha - segs[i - 1].alpha);
    for (let q = 1; q <= nSub; q++) { const xx = x + s.L * q / nSub; xs.push(xx); Ps.push(P0 * Math.exp(-mu * (theta + k * xx))); }
    x += s.L;
  });
  return { xs, Ps };
}

/** Recul d'ancrage : niveau P* par dichotomie, diagramme après recul et longueur d'influence λ. */
function recul({ xs, Ps }, EpAp, g) {
  if (!(g > 0)) return { Ps: Ps.slice(), lambda: 0, Pstar: null };
  const aire = Pst => { let a = 0; for (let i = 1; i < xs.length; i++) { const f0 = Math.max(Ps[i - 1] - Pst, 0), f1 = Math.max(Ps[i] - Pst, 0); a += (f0 + f1) / 2 * (xs[i] - xs[i - 1]); } return 2 * a; };
  const cible = EpAp * g;
  let lo = Ps[Ps.length - 1] - Ps[0], hi = Ps[0];
  while (aire(lo) < cible) lo -= Math.abs(Ps[0]);   // λ au-delà du câble : niveau sous P(L)
  for (let it = 0; it < 200; it++) { const m = (lo + hi) / 2; if (aire(m) > cible) lo = m; else hi = m; }
  const Pst = (lo + hi) / 2, out = Ps.map(P => (P > Pst ? 2 * Pst - P : P));
  let lambda = xs[xs.length - 1];
  for (let i = 1; i < xs.length; i++) if (Ps[i] <= Pst) { lambda = xs[i - 1] + (xs[i] - xs[i - 1]) * (Ps[i - 1] - Pst) / ((Ps[i - 1] - Ps[i]) || 1); break; }
  return { Ps: out, lambda, Pstar: Pst };
}

/**
 * c = { P0 (kN, force au vérin), mu (0,19 : torons dans gaine métallique, tableau 5.1), k (rad/m, 0,005 à 0,01),
 *       g (m, recul d'ancrage, 0,006 par défaut), Ep (MPa), Ap (m²), tension: 'gauche'|'droite'|'deux' }
 * segs = [{ L, alpha }]. Renvoie { P: [force moyenne par segment], x, avant, apres, lambda: [λ gauche, λ droite] }.
 */
export function pertesInstantanees(c, segs) {
  const mu = c.mu ?? 0.19, k = c.k ?? 0.007, g = c.g ?? 0.006, EpAp = (c.Ep ?? 195000) * 1000 * c.Ap, P0 = c.P0;
  const Ltot = segs.reduce((s, q) => s + q.L, 0);
  const G = frottement(segs, P0, mu, k), RG = recul(G, EpAp, g);
  let avant = G.Ps.slice(), apres = RG.Ps.slice(), lam = [RG.lambda, 0];
  if (c.tension === 'droite' || c.tension === 'deux') {
    const inv = segs.slice().reverse().map(s => ({ L: s.L, alpha: -s.alpha }));
    const D = frottement(inv, P0, mu, k), RD = recul(D, EpAp, g);
    const dAv = D.Ps.slice().reverse(), dAp = RD.Ps.slice().reverse();
    lam[1] = RD.lambda;
    if (c.tension === 'droite') { avant = dAv; apres = dAp; lam[0] = 0; }
    else { avant = avant.map((v, i) => Math.max(v, dAv[i])); apres = apres.map((v, i) => Math.max(v, dAp[i])); }
  }
  // force moyenne par segment (trapèzes sur les sous-divisions)
  const P = [], nSub = 20;
  segs.forEach((s, i) => { let a = 0; for (let q = 0; q < nSub; q++) a += (apres[i * nSub + q] + apres[i * nSub + q + 1]) / 2; P.push(a / nSub); });
  return { P, x: G.xs, avant, apres, lambda: lam, L: Ltot };
}
