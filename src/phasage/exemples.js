/**
 * Modèles types pour le calcul par phases (onglet « Phasage »).
 *
 * poutresContinues(p) — tablier à poutres préfabriquées précontraintes rendues continues (une poutre et sa largeur de
 * hourdis) : les travées sont posées isostatiques, la poutre est précontrainte (post-tension) au jeune âge, le hourdis
 * est coulé sur les poutres puis les travées sont clavées sur appuis (liaison en rotation et en déplacement axial), enfin
 * les superstructures sont posées. Le fluage et le retrait différentiel (hourdis jeune sur poutre âgée) créent dans le
 * temps des moments de continuité sur appuis : c'est le cas d'école de l'adaptation par fluage.
 *
 * Chaque travée est maillée en nb barres pour la poutre et nb barres pour le hourdis (sections composées par barres
 * décalées). Aux appuis intermédiaires, les extrémités des travées sont deux nœuds distincts superposés, réunis au clavage.
 */

const num = (v, d) => (Number.isFinite(+v) && String(v).trim() !== '' ? +v : d);

export const DEFAUTS_POUTRES = {
  n: 3, L: 25, nb: 10,
  poutre: { A: 0.55, I: 0.17, fck: 40, RH: 70, h0: 250, ciment: 'R' },
  hourdis: { A: 0.625, I: 0.00326, e: 0.825, fck: 30, RH: 70, h0: 250, ciment: 'N' },
  gBeton: 25, gSup: 8,
  cable: { Ap: 0.0030, P: 3500, eMi: -0.45, eAbout: 0, classe: 2, rho1000: 2.5 },
  dates: { tension: 7, hourdis: 60, continuite: 90, superstructures: 120, fin: 36500 },
  parDecade: 8,
};

/** Lecture des champs ph_* du formulaire (valeurs par défaut sinon). */
export function lirePhasage(d = {}) {
  const D = DEFAUTS_POUTRES;
  return {
    n: Math.max(1, Math.round(num(d.ph_n, D.n))), L: num(d.ph_L, D.L), nb: Math.max(4, Math.round(num(d.ph_nb, D.nb))),
    poutre: { A: num(d.ph_pA, D.poutre.A), I: num(d.ph_pI, D.poutre.I), fck: num(d.ph_pfck, D.poutre.fck), RH: num(d.ph_RH, D.poutre.RH), h0: num(d.ph_ph0, D.poutre.h0), ciment: d.ph_pcim || D.poutre.ciment },
    hourdis: { A: num(d.ph_hA, D.hourdis.A), I: num(d.ph_hI, D.hourdis.I), e: num(d.ph_he, D.hourdis.e), fck: num(d.ph_hfck, D.hourdis.fck), RH: num(d.ph_RH, D.hourdis.RH), h0: num(d.ph_hh0, D.hourdis.h0), ciment: d.ph_hcim || D.hourdis.ciment },
    gBeton: num(d.ph_gb, D.gBeton), gSup: num(d.ph_gsup, D.gSup),
    cable: { Ap: num(d.ph_Ap, D.cable.Ap * 1e4) / 1e4, P: num(d.ph_P, D.cable.P), eMi: num(d.ph_eMi, D.cable.eMi), eAbout: num(d.ph_eAb, D.cable.eAbout), classe: Math.round(num(d.ph_classe, 2)), rho1000: num(d.ph_rho, 2.5) },
    dates: { tension: num(d.ph_t1, D.dates.tension), hourdis: num(d.ph_t2, D.dates.hourdis), continuite: num(d.ph_t3, D.dates.continuite), superstructures: num(d.ph_t4, D.dates.superstructures), fin: num(d.ph_t5, D.dates.fin) },
    parDecade: D.parDecade,
  };
}

/** Modèle de calcul (format de calculPhasage) et repères utiles à l'affichage. */
export function poutresContinues(p = DEFAUTS_POUTRES) {
  const { n, L, nb, poutre: P, hourdis: H, cable: C, dates: T } = p;
  if (!(T.tension <= T.hourdis && T.hourdis <= T.continuite && T.continuite <= T.superstructures && T.superstructures <= T.fin)) throw new Error('les dates des phases doivent être croissantes : tension ≤ hourdis ≤ continuité ≤ superstructures ≤ fin');
  if (n < 2 && T.continuite) { /* une seule travée : pas de clavage, le calcul reste valable */ }
  const noeuds = [], debut = [], fin = [];
  for (let s = 0; s < n; s++) {
    debut.push(noeuds.length);
    for (let k = 0; k <= nb; k++) noeuds.push([s * L + k * L / nb, 0]);
    fin.push(noeuds.length - 1);
  }
  const barres = [], iP = [], iH = [];
  for (let s = 0; s < n; s++) for (let k = 0; k < nb; k++) { iP.push(barres.length); barres.push({ i: debut[s] + k, j: debut[s] + k + 1, A: P.A, I: P.I, e: 0, beton: 'P', nom: `poutre T${s + 1}` }); }
  for (let s = 0; s < n; s++) for (let k = 0; k < nb; k++) { iH.push(barres.length); barres.push({ i: debut[s] + k, j: debut[s] + k + 1, A: H.A, I: H.I, e: H.e, beton: 'H', nom: `hourdis T${s + 1}` }); }
  // câble parabolique par travée : e(x) = e_about + (e_mi − e_about)·4ξ(1 − ξ), segments rectilignes par barre
  const ex = xi => C.eAbout + (C.eMi - C.eAbout) * 4 * xi * (1 - xi);
  const cables = Array.from({ length: n }, (_, s) => ({
    nom: `câble T${s + 1}`, Ap: C.Ap, P: C.P, phase: 0, classe: C.classe, rho1000: C.rho1000,
    segments: Array.from({ length: nb }, (_, k) => ({ barre: iP[s * nb + k], ei: ex(k / nb), ej: ex((k + 1) / nb) })),
  }));
  const appuis = [{ n: debut[0], ddl: ['ux', 'uy'] }, { n: fin[0], ddl: ['uy'] }];
  for (let s = 1; s < n; s++) appuis.push({ n: debut[s], ddl: ['ux', 'uy'] }, { n: fin[s], ddl: ['uy'] });
  const charge = (idx, w) => idx.map(barre => ({ barre, w }));
  const phases = [
    { t: T.tension, nom: 'Poutres posées isostatiques, précontraintes', activer: iP, appuis, charges: charge(iP, P.A * p.gBeton) },
    { t: T.hourdis, nom: 'Coulage du hourdis (porté par les poutres seules)', charges: charge(iP, H.A * p.gBeton) },
    { t: T.hourdis, nom: 'Hourdis durci : section composée', activer: iH },
  ];
  if (n > 1) phases.push({
    t: T.continuite, nom: 'Clavage sur appuis : continuité', retirerAppuis: Array.from({ length: n - 1 }, (_, s) => ({ n: debut[s + 1], ddl: ['ux'] })),
    liaisons: Array.from({ length: n - 1 }, (_, s) => ({ a: fin[s], b: debut[s + 1], ddl: ['ux', 'rz'] })),
  });
  phases.push({ t: T.superstructures, nom: 'Superstructures', charges: charge(iH, p.gSup) });
  return {
    modele: { noeuds, barres, phases, cables, tFin: T.fin, parDecade: p.parDecade || 8,
      betons: { P: { fck: P.fck, RH: P.RH, h0: P.h0, ciment: P.ciment, tCoulage: 0 }, H: { fck: H.fck, RH: H.RH, h0: H.h0, ciment: H.ciment, tCoulage: T.hourdis } } },
    reperes: { n, L, nb, iP, iH, debut, fin },
  };
}

/**
 * Moments de la section composée aux points remarquables : sur chaque appui intermédiaire (extrémité droite de la travée
 * s) et à mi-travée. Rapportés au centre de gravité de la poutre (ligne des nœuds).
 */
export function momentsRemarquables(pasCalc, R, resultante) {
  const { n, nb, iP, iH, L } = R, out = { appuis: [], travees: [] };
  for (let s = 0; s < n; s++) {
    const kMid = s * nb + nb / 2 - (nb % 2 ? 0.5 : 1);   // barre qui finit à mi-travée (nb pair)
    const k0 = Math.floor(kMid);
    out.travees.push(resultante(pasCalc, [iP[k0], iH[k0]], L / nb).M);
    if (s < n - 1) { const kE = s * nb + nb - 1; out.appuis.push(resultante(pasCalc, [iP[kE], iH[kE]], L / nb).M); }
  }
  return out;
}

/** Diagramme du moment de la section composée le long du tablier : [[x, M], …]. */
export function diagramme(pasCalc, R, resultante, m = 4) {
  const { n, nb, iP, iH, L } = R, pts = [];
  for (let s = 0; s < n; s++) for (let k = 0; k < nb; k++) for (let q = 0; q <= m; q++) {
    if (q === 0 && k > 0) continue;
    const x = q * L / nb / m; pts.push([s * L + k * L / nb + x, resultante(pasCalc, [iP[s * nb + k], iH[s * nb + k]], x).M]);
  }
  return pts;
}
