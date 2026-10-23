/**
 * Poutres précontraintes par adhérence (PRAD, pré-tension sur banc) de pont à travées indépendantes.
 *
 * Même chaîne que les VIPP (src/beams/vipp.js : calcul par phases, ELS, ELU, effort tranchant, flèches), avec :
 *  - torons rectilignes T15S (150 mm²) ou T13S (100 mm²) en lits dans le talon (entraxe ≥ 5 cm : EN 1992-1-1 § 8.10.1.2,
 *    distance libre ≥ max(2φ ; d_g + 5 mm ; 20 mm)) et, éventuellement, torons supérieurs dans la table (tractions au
 *    relâchement) ;
 *  - tension sur banc σ_pi = min(0,8 f_pk ; 0,9 f_p0,1k) (§ 5.10.2.1) ; pertes avant et au relâchement : relaxation sur
 *    banc (§ 3.3.2), étuvage éventuel 0,5 E_p α_c (T_max − T₀) (§ 10.5.2 (2)), raccourcissement élastique
 *    Δσ_el = E_p σ_c / E_cm(t) au niveau du c.d.g. des torons (§ 5.10.4), itéré ;
 *  - longueur de transmission l_pt = α₁ α₂ φ σ_pm0 / f_bpt, f_bpt = η_p1 η₁ f_ctd(t) (§ 8.10.2.2 : η_p1 = 3,2 pour les
 *    torons à 7 fils, η₁ = 1, α₁ = 1 relâchement progressif ou 1,25 brutal, α₂ = 0,19) ; valeurs de calcul
 *    l_pt1 = 0,8 l_pt, l_pt2 = 1,2 l_pt ; longueur d'ancrage l_bpd = l_pt2 + α₂ φ (σ_pd − σ_pm∞) / f_bpd,
 *    f_bpd = η_p2 η₁ f_ctd (η_p2 = 1,2, § 8.10.2.3) ;
 *  - gainage : groupes de torons non adhérents sur une longueur L_g depuis l'about, pour limiter les tractions de la fibre
 *    supérieure au relâchement (dossier Sétra PRAD 73, § 1.1 et 1.5) ; dans le calcul par phases, la force d'un groupe
 *    est appliquée au-delà de L_g + l_pt/2 (milieu de la transmission) ;
 *  - effort tranchant : âme pleine (pas de gaine), composante verticale nulle (torons rectilignes) ;
 *  - diagnostic : élancement 1/18 à 1/20 (dossier PRAD 73, § 1.3), hourdis ≥ 15 cm, abouts ≥ 30 cm de l'axe d'appui.
 * Unités : m, kN, MPa.
 */
import { betonEC2 } from '../phasage/fluage.js';
import { relaxation } from '../phasage/phasage.js';

export const TORONS = { T15S: { A: 150e-6, phi: 0.0157 }, T13S: { A: 100e-6, phi: 0.0129 } };
export const DEFAUTS_PRAD = { nt: 20, nsup: 0, type: 'T15S', cBas: 0.05, ev: 0.05, eh: 0.05, cote: 0.05, groupes: [{ n: 4, Lg: 2.0 }, { n: 4, Lg: 4.0 }], fpk: 1860, fp01k: 1640, Ep: 195000, dT: 0, alpha1: 1.0, about: 0.30, rho1000: 2.5, classe: 2 };

/** Positions des torons dans le talon : lits du bas vers le haut, n par lit d'après la largeur du talon. */
export function positionsTorons(a, f) {
  const T = TORONS[a.type] || TORONS.T15S, parLit = Math.max(2, Math.floor((f.bta - 2 * a.cote) / a.eh + 1e-9) + 1), pos = [];
  for (let k = 0; k < a.nt; k++) { const lit = Math.floor(k / parLit), i = k % parLit, nLit = Math.min(parLit, a.nt - lit * parLit); pos.push({ y: a.cBas + lit * a.ev, z: (i - (nLit - 1) / 2) * a.eh, lit }); }
  return { T, parLit, pos };
}

/**
 * Tracé des torons sous la forme attendue par la chaîne VIPP (un « câble » par groupe de gainage) : { u, cab, y, pente,
 * alerte, prad }. Les groupes gainés prennent des torons répartis dans tous les lits (c.d.g. voisin de celui de l'ensemble).
 */
/** t1 : âge équivalent du béton au relâchement (résistance, module) ; tRel : durée sur banc (relaxation, jours). */
export function traceTorons(a0, L, f, { fckP, t1, tRel = t1, Mg }, S) {
  const a = { ...DEFAUTS_PRAD, ...a0 }, { T, parLit, pos } = positionsTorons(a, f), alerte = [];
  const gr = (a.groupes || []).filter(g => g.n > 0 && g.Lg > 0), nG = gr.reduce((s, g) => s + g.n, 0);
  if (nG >= a.nt) throw new Error('PRAD : il faut au moins un groupe de torons adhérents sur toute la longueur');
  // répartition : torons de chaque groupe gainé répartis régulièrement parmi les positions (c.d.g. voisin de l'ensemble)
  // les torons d'angle du lit inférieur restent adhérents (pratique : on ne gaine jamais les angles)
  const ordre = pos.map((q, k) => k), attribue = new Array(a.nt).fill(0), libre = new Set(ordre.filter(k => !(pos[k].lit === 0 && (k === 0 || k === Math.min(parLit, a.nt) - 1))));
  if (nG > libre.size) throw new Error('PRAD : trop de torons gainés (les angles du lit inférieur restent adhérents)');
  const groupes = [{ n: a.nt - nG, Lg: 0 }, ...gr];
  groupes.slice(1).forEach((g, j) => { for (let i = 0; i < g.n; i++) { let k = Math.floor((i + 0.5) * a.nt / g.n + j) % a.nt; while (!libre.has(k)) k = (k + 1) % a.nt; libre.delete(k); attribue[k] = j + 1; } });
  // pertes avant et au relâchement
  const sigPi = Math.min(0.8 * a.fpk, 0.9 * a.fp01k), Ap = (a.nt + (a.nsup || 0)) * T.A, bet = betonEC2({ fck: fckP }), Ecm = bet.E(t1);
  const dRel = relaxation({ fpk: a.fpk, rho1000: a.rho1000, classe: a.classe }, sigPi)(Math.max(tRel, 0.5)), dTh = 0.5 * a.Ep * 1e-5 * (a.dT || 0);
  const nTot = a.nt + (a.nsup || 0), yP = (pos.reduce((s, q) => s + q.y, 0) + (a.nsup || 0) * (f.hp - a.cote)) / nTot, e = S.poutre.yG - yP;
  let sigEl = 0;
  for (let it = 0; it < 30; it++) { const P = (sigPi - dRel - dTh - sigEl) * Ap * 1000; const sc = (P / S.poutre.A + P * e * e / S.poutre.I - Mg * e / S.poutre.I) / 1000; sigEl = a.Ep * Math.max(sc, 0) / Ecm; }
  const sigPm0 = sigPi - dRel - dTh - sigEl;
  // transmission et ancrage (EN 1992-1-1 § 8.10.2)
  const fctdT = 0.7 * bet.fctmT(t1) / 1.5, fbpt = 3.2 * 1.0 * fctdT, lpt = a.alpha1 * 0.19 * T.phi * sigPm0 / fbpt;
  const fbpd = 1.2 * 1.0 * 0.7 * bet.fctmT(28) / 1.5;
  const cab = groupes.map((g, ig) => {
    const ks = ordre.filter(k => attribue[k] === ig), ym = ks.reduce((s, k) => s + pos[k].y, 0) / Math.max(ks.length, 1);
    const xDeb = ig ? Math.max(0, g.Lg + lpt / 2 - a.about) : 0;   // depuis l'axe d'appui (groupe adhérent : force dès l'appui)
    return { i: ig, ym, ya: ym, n: ks.length, Lg: g.Lg, xDeb, Ap: ks.length * T.A, P: ks.length * T.A * sigPm0 * 1000, torons: ks, zm: 0 };
  });
  if (cab.some((c, i) => i && c.n !== groupes[i].n)) alerte.push('répartition des torons gainés incomplète');
  if (a.eh - T.phi < Math.max(2 * T.phi, 0.02) - 1e-9) alerte.push(`entraxe horizontal ${(a.eh * 100).toFixed(1)} cm : distance libre < 2φ (EN 1992-1-1 § 8.10.1.2)`);
  const yHaut = Math.max(...pos.map(q => q.y)); if (yHaut > (S.poutre.contour.yPan || f.hpi) + 1e-9) alerte.push(`lit supérieur à ${yHaut.toFixed(2)} m : hors du talon (pan à ${S.poutre.contour.yPan.toFixed(2)} m)`);
  const gaine = groupes.slice(1).map((g, j) => ({ n: cab[j + 1].n, Lg: g.Lg, part: cab[j + 1].n / a.nt }));
  if (nG / a.nt > 0.5) alerte.push(`${Math.round(100 * nG / a.nt)} % de torons gainés : au-delà de la moitié, vérifier l'ancrage aux abouts`);
  // torons supérieurs (dans la table, adhérents sur toute la longueur) : reprise des tractions de la fibre supérieure
  if (a.nsup > 0) { const ys = f.hp - a.cote; cab.push({ i: cab.length, ym: ys, ya: ys, n: a.nsup, Lg: 0, xDeb: 0, Ap: a.nsup * T.A, P: a.nsup * T.A * sigPm0 * 1000, torons: [], zm: 0, sup: true }); }
  return {
    u: { Ap: T.A, phi: T.phi }, cab, y: cb => cb.ym, pente: () => 0, alerte,
    prad: { a, T, parLit, pos, attribue, sigPi, dRel, dTh, sigEl, sigPm0, Ecm, lpt, lpt1: 0.8 * lpt, lpt2: 1.2 * lpt, fbpt, fbpd, gaine, yP, e, Ap },
  };
}

/** Longueur d'ancrage l_bpd (§ 8.10.2.3) pour la contrainte σ_pd à atteindre et σ_pm∞. */
export const longueurAncrage = (pr, sigPd, sigPinf) => pr.lpt2 + 0.19 * pr.T.phi * Math.max(sigPd - sigPinf, 0) / pr.fbpd;

/** Diagnostic de conception (dossier Sétra PRAD 73). */
export function diagnosticPRAD({ L, f, hd, fck, pr }) {
  const D = [], H = f.hp + hd, add = (niveau, texte, ref) => D.push({ niveau, texte, ref });
  const r = L / H;
  if (L > 35) add('ATTENTION', `Portée ${L.toFixed(1)} m : au-delà du domaine courant des PRAD (portées moyennes, jusqu'à 30–35 m) ; VIPP à envisager.`, 'PRAD 73, présentation');
  else add('OK', `Portée ${L.toFixed(1)} m (portées moyennes).`, 'PRAD 73, présentation');
  if (L > 15) add('INFO', 'Au-delà de 15 m, flèches permanentes importantes : renformis et reprofilage à prévoir.', 'PRAD 73 § 1.3');
  if (r < 17 || r > 21) add('INFO', `Élancement h/L = 1/${r.toFixed(1)} : hors de la plage 1/18 à 1/20.`, 'PRAD 73 § 1.3'); else add('OK', `Élancement h/L = 1/${r.toFixed(1)} (1/18 à 1/20).`, 'PRAD 73 § 1.3');
  if (hd < 0.15) add('ATTENTION', `Hourdis ${(hd * 100).toFixed(0)} cm < 15 cm d'épaisseur résistante.`, 'PRAD 73 § 1.3');
  if (pr.a.about < 0.30) add('ATTENTION', `About ${(pr.a.about * 100).toFixed(0)} cm < 30 cm de l'axe d'appui.`, 'PRAD 73 § 1.3');
  add('INFO', `Longueur de transmission l_pt = ${pr.lpt.toFixed(2)} m (l_pt2 = ${pr.lpt2.toFixed(2)} m) ; ${pr.gaine.length ? pr.gaine.map(g => `${g.n} torons gainés sur ${g.Lg.toFixed(2)} m`).join(', ') : 'aucun toron gainé'}.`, 'EN 1992-1-1 § 8.10.2.2');
  if (fck < 40) add('INFO', `Béton C${fck} : les PRAD emploient des bétons à forte résistance au jeune âge (relâchement), souvent étuvés.`, 'PRAD 73 § 1.4.1');
  return D;
}
