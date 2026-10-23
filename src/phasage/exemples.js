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

import { poutreEtHourdis, caisson } from './sections.js';

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
export const FORME_POUTRE = { H: 1.40, bt: 0.80, ht: 0.15, bw: 0.20, bb: 0.65, hb: 0.25, bh: 2.50, hd: 0.25 };

export function lirePhasage(d = {}) {
  const D = DEFAUTS_POUTRES, G = FORME_POUTRE;
  const parDim = d.ph_geo !== 'valeurs';
  const forme = { H: num(d.ph_H, G.H), bt: num(d.ph_bt, G.bt), ht: num(d.ph_ht, G.ht), bw: num(d.ph_bw, G.bw), bb: num(d.ph_bb, G.bb), hb: num(d.ph_hb, G.hb), bh: num(d.ph_bh, G.bh), hd: num(d.ph_hd, G.hd) };
  const S = parDim ? poutreEtHourdis(forme) : null;
  const out = lireValeurs(d, D);
  if (S) { Object.assign(out.poutre, { A: S.poutre.A, I: S.poutre.I }); Object.assign(out.hourdis, { A: S.hourdis.A, I: S.hourdis.I, e: S.hourdis.e }); out.forme = { ...forme, yG: S.poutre.yG }; }
  return out;
}

function lireValeurs(d, D) {
  return {
    n: Math.max(1, Math.round(num(d.ph_n, D.n))), L: num(d.ph_L, D.L), nb: Math.max(4, Math.round(num(d.ph_nb, D.nb))),
    poutre: { A: num(d.ph_pA, D.poutre.A), I: num(d.ph_pI, D.poutre.I), fck: num(d.ph_pfck, D.poutre.fck), RH: num(d.ph_RH, D.poutre.RH), h0: num(d.ph_ph0, D.poutre.h0), ciment: d.ph_pcim || D.poutre.ciment },
    hourdis: { A: num(d.ph_hA, D.hourdis.A), I: num(d.ph_hI, D.hourdis.I), e: num(d.ph_he, D.hourdis.e), fck: num(d.ph_hfck, D.hourdis.fck), RH: num(d.ph_RH, D.hourdis.RH), h0: num(d.ph_hh0, D.hourdis.h0), ciment: d.ph_hcim || D.hourdis.ciment },
    gBeton: num(d.ph_gb, D.gBeton), gSup: num(d.ph_gsup, D.gSup),
    cable: { Ap: num(d.ph_Ap, D.cable.Ap * 1e4) / 1e4, P: num(d.ph_P, D.cable.P), eMi: num(d.ph_eMi, D.cable.eMi), eAbout: num(d.ph_eAb, D.cable.eAbout), classe: Math.round(num(d.ph_classe, 2)), rho1000: num(d.ph_rho, 2.5),
      ...(d.ph_pinst === 'calcul' ? { P0: num(d.ph_P0, 4000), mu: num(d.ph_mu, 0.19), k: num(d.ph_k, 0.007), g: num(d.ph_g, 6) / 1000, tension: d.ph_tens || 'deux' } : {}) },
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
    nom: `câble T${s + 1}`, Ap: C.Ap, ...(C.P0 != null ? { P0: C.P0, mu: C.mu, k: C.k, g: C.g, tension: C.tension } : { P: C.P }), phase: 0, classe: C.classe, rho1000: C.rho1000,
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

/* ======================================================================================================================
 * Fléaux construits par encorbellements successifs (Bulletin technique Sétra n° 7, 1972) : trois travées a – 2a – a,
 * deux fléaux symétriques sur les piles P1 et P2, bétonnés voussoir par voussoir avec un équipage mobile, câbles de fléau
 * tendus après chaque paire de voussoirs, clavage central et clavage des travées de rive sur les culées, câbles de
 * continuité, superstructures.
 * Hauteur variable : h(ξ) = h_c + (h_p − h_c)(1 − ξ)², ξ = 0 sur pile, 1 en bout de fléau ; inertie I = I_c (h/h_c)^{5/2}
 * (hypothèse du programme MCP du Sétra, BT n° 7 § 2.222) ; aire interpolée de même entre A_p et A_c. La ligne des nœuds
 * est droite (le c.d.g. réel suit la hauteur : les excentrements des câbles sont comptés depuis le c.d.g. local).
 * ==================================================================================================================== */
export const DEFAUTS_FLEAU = {
  a: 40, nv: 8, l0: 8, hp: 4.0, hc: 2.0, Ac: 6.0, Ap: 9.0, Ic: 4.2, vh: 0.42,
  fck: 40, RH: 70, h0: 400, ciment: 'R', gBeton: 25, gSup: 60, Qeq: 400,
  cable: { Ap: 0.0021, P0: 3000, mu: 0.19, k: 0.007, g: 0.006, enrob: 0.15, classe: 2, rho1000: 2.5 },
  continuite: { n: 2, nv: 4, Ap: 0.0021, P0: 3000 },
  dates: { cycle: 7, durc: 3, clavage: 90, continuite: 95, superstructures: 120, fin: 36500 },
  parDecade: 6,
};

export const FORME_CAISSON = { B: 12, ts: 0.25, Bi: 6.5, tip: 0.60, tic: 0.22, bw: 0.45 };

export function lireFleau(d = {}) {
  const out = lireFleauValeurs(d), G = FORME_CAISSON;
  if (d.fl_geo !== 'valeurs') {
    const c = { B: num(d.fl_B, G.B), ts: num(d.fl_ts, G.ts), Bi: num(d.fl_Bi, G.Bi), tip: num(d.fl_tip, G.tip), tic: num(d.fl_tic, G.tic), bw: num(d.fl_bw, G.bw) };
    const sp = caisson({ ...c, ti: c.tip }, out.hp), sc = caisson({ ...c, ti: c.tic }, out.hc);
    Object.assign(out, { caisson: c, Ap: sp.A, Ac: sc.A, Ic: sc.I, vh: sc.v / out.hc });
  }
  return out;
}

function lireFleauValeurs(d = {}) {
  const D = DEFAUTS_FLEAU;
  return {
    a: num(d.fl_a, D.a), nv: Math.max(1, Math.round(num(d.fl_nv, D.nv))), l0: num(d.fl_l0, D.l0),
    hp: num(d.fl_hp, D.hp), hc: num(d.fl_hc, D.hc), Ac: num(d.fl_Ac, D.Ac), Ap: num(d.fl_Ap, D.Ap), Ic: num(d.fl_Ic, D.Ic), vh: num(d.fl_vh, D.vh),
    fck: num(d.fl_fck, D.fck), RH: num(d.fl_RH, D.RH), h0: num(d.fl_h0, D.h0), ciment: d.fl_cim || D.ciment,
    gBeton: num(d.fl_gb, D.gBeton), gSup: num(d.fl_gsup, D.gSup), Qeq: num(d.fl_Qeq, D.Qeq),
    cable: { Ap: num(d.fl_cAp, D.cable.Ap * 1e4) / 1e4, P0: num(d.fl_cP0, D.cable.P0), mu: num(d.fl_mu, D.cable.mu), k: num(d.fl_k, D.cable.k), g: num(d.fl_g, D.cable.g * 1000) / 1000, enrob: num(d.fl_enr, D.cable.enrob), classe: 2, rho1000: 2.5 },
    continuite: { n: Math.max(0, Math.round(num(d.fl_ccn, D.continuite.n))), nv: Math.max(1, Math.round(num(d.fl_ccv, D.continuite.nv))), Ap: num(d.fl_ccAp, D.continuite.Ap * 1e4) / 1e4, P0: num(d.fl_ccP0, D.continuite.P0) },
    dates: { cycle: num(d.fl_cyc, D.dates.cycle), durc: num(d.fl_dur, D.dates.durc), clavage: num(d.fl_tcl, D.dates.clavage), continuite: num(d.fl_tcc, D.dates.continuite), superstructures: num(d.fl_tsup, D.dates.superstructures), fin: num(d.fl_tfin, D.dates.fin) },
    parDecade: D.parDecade,
  };
}

export function fleaux(p = DEFAUTS_FLEAU) {
  const { a, nv, l0, hp, hc, Ac, Ap: Apile, Ic, vh, cable: C, dates: T } = p;
  const lv = (a - l0 / 2) / nv;
  if (!(lv > 0)) throw new Error('voussoir sur pile plus long que le fléau');
  const tFinFleau = nv * T.cycle + T.durc;
  if (!(T.cycle > T.durc)) throw new Error('le cycle de bétonnage doit dépasser l’âge au décoffrage');
  if (!(T.clavage >= tFinFleau && T.continuite >= T.clavage && T.superstructures >= T.continuite && T.fin >= T.superstructures)) throw new Error(`dates incohérentes : le dernier voussoir est activé à ${tFinFleau} j ; il faut clavage ≥ ${tFinFleau} j, puis continuité, superstructures et fin croissants`);
  const h = xi => hc + (hp - hc) * (1 - xi) ** 2;
  // caisson défini par ses dimensions : section exacte à chaque hauteur (hourdis inférieur d'épaisseur parabolique) ;
  // sinon aire interpolée et I ∝ h^{5/2} (BT n° 7 § 2.222), c.d.g. à v/h constant
  const K = p.caisson, sec = xi => caisson({ ...K, ti: K.tic + (K.tip - K.tic) * (1 - xi) ** 2 }, h(xi));
  const Ax = xi => (K ? sec(xi).A : Ac + (Apile - Ac) * (1 - xi) ** 2), Ix = xi => (K ? sec(xi).I : Ic * (h(xi) / hc) ** 2.5);
  const vx = xi => (K ? sec(xi).v : vh * h(xi));
  const eHaut = xi => vx(xi) - C.enrob, eBas = xi => -(h(xi) - vx(xi) - C.enrob);
  const noeuds = [], barres = [], betons = {};
  // distances depuis l'axe de pile des nœuds d'un demi-fléau : l0/2, puis + lv
  const r = [0, l0 / 2]; for (let k = 1; k <= nv; k++) r.push(l0 / 2 + k * lv);
  const piles = [a, 3 * a], F = [];
  for (let f = 0; f < 2; f++) {
    const xp = piles[f], ids = { G: [], D: [], pile: null };
    ids.pile = noeuds.length; noeuds.push([xp, 0]);
    for (let k = 1; k < r.length; k++) { ids.G.push(noeuds.length); noeuds.push([xp - r[k], 0]); }
    for (let k = 1; k < r.length; k++) { ids.D.push(noeuds.length); noeuds.push([xp + r[k], 0]); }
    // barres : VSP (k = 0) puis voussoirs k = 1..nv, côté gauche (de la pile vers le bout) et côté droit
    const bG = [], bD = [];
    for (let k = 0; k <= nv; k++) {
      const xi = (r[k] + r[k + 1]) / 2 / a, cle = `V${k}`;
      betons[cle] = { fck: p.fck, RH: p.RH, h0: p.h0, ciment: p.ciment, tCoulage: k === 0 ? 0 : (k - 1) * T.cycle + T.cycle };
      const ni = k === 0 ? ids.pile : ids.G[k - 1], nj = ids.G[k], mi = k === 0 ? ids.pile : ids.D[k - 1], mj = ids.D[k];
      bG.push(barres.length); barres.push({ i: nj, j: ni, A: Ax(xi), I: Ix(xi), beton: cle, nom: `F${f + 1} G${k}`, xi0: r[k + 1] / a, xi1: r[k] / a });
      bD.push(barres.length); barres.push({ i: mi, j: mj, A: Ax(xi), I: Ix(xi), beton: cle, nom: `F${f + 1} D${k}`, xi0: r[k] / a, xi1: r[k + 1] / a });
    }
    F.push({ ids, bG, bD, xp });
  }
  const w = k => barres[F[0].bG[k]].A * p.gBeton;
  // câble de fléau k : du bout gauche du voussoir k au bout droit, par-dessus la pile (excentrement en fibre supérieure)
  const segFleau = (f, k) => {
    const s = [];
    for (let q = k; q >= 0; q--) { const b = barres[F[f].bG[q]]; s.push({ barre: F[f].bG[q], ei: eHaut(b.xi0), ej: eHaut(b.xi1) }); }
    for (let q = 0; q <= k; q++) { const b = barres[F[f].bD[q]]; s.push({ barre: F[f].bD[q], ei: eHaut(b.xi0), ej: eHaut(b.xi1) }); }
    return s;
  };
  const phases = [], cables = [];
  const tension = (k, iPh) => { for (let f = 0; f < 2; f++) cables.push({ nom: `fléau F${f + 1}-${k}`, Ap: C.Ap, P0: C.P0, mu: C.mu, k: C.k, g: C.g, tension: 'deux', classe: C.classe, rho1000: C.rho1000, phase: iPh, segments: segFleau(f, k) }); };
  const bout = (f, cote, k) => (k === 0 ? (cote === 'G' ? F[f].ids.G[0] : F[f].ids.D[0]) : (cote === 'G' ? F[f].ids.G[k] : F[f].ids.D[k]));
  // phase 0 : voussoirs sur pile, encastrement provisoire sur pile
  phases.push({ t: T.durc, nom: 'Voussoirs sur pile (encastrement provisoire)', activer: [...F[0].bG.slice(0, 1), ...F[0].bD.slice(0, 1), ...F[1].bG.slice(0, 1), ...F[1].bD.slice(0, 1)],
    appuis: [{ n: F[0].ids.pile, ddl: ['ux', 'uy', 'rz'] }, { n: F[1].ids.pile, ddl: ['ux', 'uy', 'rz'] }],
    charges: [...F[0].bG.slice(0, 1), ...F[0].bD.slice(0, 1), ...F[1].bG.slice(0, 1), ...F[1].bD.slice(0, 1)].map(b => ({ barre: b, w: w(0) })),
    nodales: p.Qeq ? [0, 1].flatMap(f => [{ n: bout(f, 'G', 0), F: [0, -p.Qeq, 0] }, { n: bout(f, 'D', 0), F: [0, -p.Qeq, 0] }]) : [] });
  tension(0, 0);
  for (let k = 1; k <= nv; k++) {
    const tc = k * T.cycle, W = w(k) * lv;
    // béton frais porté par l'équipage, au bout du voussoir k − 1 : force W et moment W·lv/2
    const frais = sgn => [0, 1].flatMap(f => [{ n: bout(f, 'G', k - 1), F: [0, -W * sgn, W * lv / 2 * sgn] }, { n: bout(f, 'D', k - 1), F: [0, -W * sgn, -W * lv / 2 * sgn] }]);
    phases.push({ t: tc, nom: `Bétonnage des voussoirs ${k}`, nodales: frais(1) });
    const eq = p.Qeq ? [0, 1].flatMap(f => [{ n: bout(f, 'G', k - 1), F: [0, p.Qeq, 0] }, { n: bout(f, 'D', k - 1), F: [0, p.Qeq, 0] }, ...(k < nv ? [{ n: bout(f, 'G', k), F: [0, -p.Qeq, 0] }, { n: bout(f, 'D', k), F: [0, -p.Qeq, 0] }] : [])]) : [];
    phases.push({ t: tc + T.durc, nom: `Voussoirs ${k} : décoffrage, câbles de fléau, avancement de l'équipage${k === nv ? ' (dépose)' : ''}`,
      activer: [0, 1].flatMap(f => [F[f].bG[k], F[f].bD[k]]), nodales: [...frais(-1), ...eq], charges: [0, 1].flatMap(f => [F[f].bG[k], F[f].bD[k]]).map(b => ({ barre: b, w: w(k) })) });
    tension(k, phases.length - 1);
  }
  // clavages : central (bouts D de F1 et G de F2) et culées sous les bouts extrêmes ; pose sur appareils d'appui
  phases.push({ t: T.clavage, nom: 'Clavages (central et sur culées), pose sur appareils d’appui', liaisons: [{ a: F[0].ids.D[nv], b: F[1].ids.G[nv], ddl: ['ux', 'uy', 'rz'] }],
    appuis: [{ n: F[0].ids.G[nv], ddl: ['uy'] }, { n: F[1].ids.D[nv], ddl: ['uy'] }], retirerAppuis: [{ n: F[0].ids.pile, ddl: ['rz'] }, { n: F[1].ids.pile, ddl: ['ux', 'rz'] }] });
  // câbles de continuité (fibre inférieure) dans la travée centrale, sur les nv voussoirs de part et d'autre de la clé
  const iCont = phases.length;
  phases.push({ t: T.continuite, nom: 'Câbles de continuité de la travée centrale' });
  const cc = p.continuite;
  for (let q = 0; q < cc.n; q++) {
    const segs = [];
    for (let k = nv - cc.nv + 1; k <= nv; k++) { const b = barres[F[0].bD[k]]; segs.push({ barre: F[0].bD[k], ei: eBas(b.xi0), ej: eBas(b.xi1) }); }
    for (let k = nv; k >= nv - cc.nv + 1; k--) { const b = barres[F[1].bG[k]]; segs.push({ barre: F[1].bG[k], ei: eBas(b.xi0), ej: eBas(b.xi1) }); }
    cables.push({ nom: `continuité ${q + 1}`, Ap: cc.Ap, P0: cc.P0, mu: C.mu, k: C.k, g: C.g, tension: 'deux', classe: C.classe, rho1000: C.rho1000, phase: iCont, segments: segs });
  }
  phases.push({ t: T.superstructures, nom: 'Superstructures', charges: barres.map((_, i) => ({ barre: i, w: p.gSup })) });
  return {
    modele: { noeuds, barres: barres.map(({ xi0, xi1, ...b }) => b), betons, phases, cables, tFin: T.fin, parDecade: p.parDecade || 6 },
    reperes: { F, nv, a, lv, l0, eHaut, eBas, h },
  };
}

/** Moments de la section aux points remarquables d'un calcul de fléaux : sur piles (côté travée centrale) et à la clé. */
export function momentsFleau(pasCalc, R) {
  const { F, nv } = R, b = pasCalc.barres;
  const surPile = f => { const r = b[F[f].bD[0]]; return r ? r.Mi : null; };
  const cle = () => { const r = b[F[0].bD[nv]]; return r ? r.Mj : null; };
  const rive = () => { const r = b[F[0].bG[Math.floor(nv / 2)]]; return r ? r.Mi : null; };
  return { P1: surPile(0), P2: surPile(1), cle: cle(), rive: rive() };
}

/** Diagramme du moment le long de l'ouvrage (barres actives). */
export function diagrammeFleau(pasCalc, R, modele, m = 3) {
  const pts = [];
  modele.barres.forEach((bb, k) => {
    const r = pasCalc.barres[k]; if (!r) return;
    const [xi] = modele.noeuds[bb.i], [xj] = modele.noeuds[bb.j], L = Math.abs(xj - xi);
    for (let q = 0; q <= m; q++) pts.push([xi + (xj - xi) * q / m, r.M(L * q / m)]);
  });
  return pts.sort((u, v) => u[0] - v[0]);
}

/**
 * Contre-flèches de construction des fléaux (fléau 1, joints de voussoirs côté gauche et côté droit).
 * Le coffrage du voussoir k est réglé sur le bout du voussoir k − 1 juste avant son bétonnage (instant de réglage) ; le
 * joint j qui le termine suit ensuite rigidement ce bout (équipage supposé indéformable) jusqu'au décoffrage, puis se
 * déplace avec la structure. Son déplacement vertical total depuis le réglage vaut
 *     δⱼ = [v_{k−1} + θ_{k−1}·dⱼ](décoffrage) − [v_{k−1} + θ_{k−1}·dⱼ](réglage) + vⱼ(t_fin)
 * (vⱼ est nul avant l'activation dans le modèle : les nœuds d'un voussoir non bétonné n'ont pas de raideur). La
 * contre-flèche à donner au coffrage est −δⱼ pour que le profil final soit le profil théorique. Les voussoirs sur pile
 * (réglés à t = 0, pile encastrée) prennent −vⱼ(t_fin). Décomposition : construction jusqu'au clavage, puis après.
 */
export function contreflechesFleau(r, modele, R) {
  const { F, nv } = R, f = F[0], N = modele.noeuds;
  const v = (pas, n) => pas.u[3 * n + 1], th = (pas, n) => pas.u[3 * n + 2];
  const iBet = k => modele.phases.findIndex(ph => ph.nom === `Bétonnage des voussoirs ${k}`);
  const iCl = modele.phases.findIndex(ph => /Clavages/.test(ph.nom));
  const kAvCl = r.finPhase[iCl - 1], fin = r.final;
  const out = [];
  for (const cote of ['G', 'D']) for (let k = 0; k <= nv; k++) {
    const nj = f.ids[cote][k], x = N[nj][0];
    let rig = 0, rigCl = 0;
    if (k >= 1) {
      const ni = f.ids[cote][k - 1], d = N[nj][0] - N[ni][0], ib = iBet(k);
      const set = r.pas[r.finPhase[ib - 1]], act = r.pas[r.finPhase[ib]];   // avant bétonnage ; fin de la phase de bétonnage (avant décoffrage)
      rig = (v(act, ni) + th(act, ni) * d) - (v(set, ni) + th(set, ni) * d);
      rigCl = rig;
    }
    const dCons = rigCl + v(r.pas[kAvCl], nj), dTot = rig + v(fin, nj);
    out.push({ cote, k, x, construction: dCons, apres: dTot - dCons, total: dTot, contrefleche: -dTot });
  }
  return out.sort((a, b) => a.x - b.x);
}

/** Flèches à mi-travée des poutres rendues continues (vers le bas positives) à un pas donné. */
export function flechesPoutres(pasCalc, R) {
  const { n, nb, debut } = R;
  return Array.from({ length: n }, (_, s) => -pasCalc.u[3 * (debut[s] + nb / 2) + 1]);
}
