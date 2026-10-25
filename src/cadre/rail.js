/**
 * Cadre ou portique portant une voie ferrée : charges ferroviaires de l'EN 1991-2 (section 6) appliquées par mètre
 * linéaire d'ouvrage.
 *  - LM71 (6.3.2) : quatre essieux de 250 kN espacés de 1,60 m et 80 kN/m de part et d'autre, multipliés par α ;
 *    sous traverses espacées de 0,60 à 0,90 m, les essieux sont remplacés par une charge uniforme équivalente
 *    (250 kN / 1,60 m) sur la longueur du groupe ;
 *  - SW/0 et SW/2 (6.3.3, tableau 6.1) : 133 kN/m sur 2 × 15 m séparés de 5,30 m ; 150 kN/m sur 2 × 25 m séparés de 7,00 m ;
 *  - coefficient dynamique Φ2 (voie soigneusement entretenue) ou Φ3 (entretien normal) (6.4.5.2), réduit pour une
 *    couverture h > 1,00 m : Φ − (h − 1,00)/10 ≥ 1,00, h mesurée du dessus de la traverse au dessus des traverses de voie ;
 *  - longueur déterminante LΦ (tableau 6.2) : cadre fermé traité comme une poutre continue sur ses barres (k = 1,2 à 1,5
 *    selon le nombre de travées), portique ouvert comme une poutre à trois travées ;
 *  - surcharge sur remblai (6.3.6.4) : modèle de charge réparti sur 3,00 m de largeur à 0,70 m sous le plan de roulement,
 *    sans coefficient dynamique — elle remplace la surcharge PSREM des charges routières dans la poussée ;
 *  - coefficients partiels (EN 1990 annexe A2, tableau A2.4(B)) : γQ = 1,45 pour LM71 et SW/0, 1,20 pour SW/2 à l'ELU ;
 *    1,00 à l'ELS (combinaison caractéristique).
 * Diffusion (HYPOTHÈSES, à adapter au référentiel du gestionnaire du réseau) : traverse de voie de longueur ℓt (2,60 m),
 * 4:1 dans le ballast sous traverse, 2:1 dans le remblai, 1:1 dans la traverse de l'ouvrage jusqu'à son feuillet moyen.
 * Unités du module cadre : m, t, t/m² (1 t = 10 kN). Constantes et Φ : socle commun src/loads_rail.js.
 */
import * as C from './cadre.js';

import { ALPHAS, LM71, SW, phi2, phi3, reductionCouverture, kContinu, GAMMA, sw as modeleSW } from '../loads_rail.js';

export { ALPHAS, LM71, SW, phi2, phi3, reductionCouverture };
export const GAMMA_RAIL = { LM71: GAMMA.LM71, 'SW/0': GAMMA['SW/0'], 'SW/2': GAMMA['SW/2'] };
export const KN_PAR_T = 10;

export const RAIL_DEFAUT = {
  alpha: 1.00, entretien: 'normal', longueurTraverse: 2.60, ballast: 0.30, hTraverseVoie: 0.22,
  sw0: true, sw2: false, LPhi: 0, pente: { ballast: 4, remblai: 2 },
};

/** Longueur déterminante LΦ d'un cadre (tableau 6.2 : cadre fermé = poutre continue sur ses barres ; portique = 3 travées). */
export function longueurDeterminante(g, ouvert = false) {
  const n = C.nCell(g), hc = C.hauteurCalc(g), L = [];
  for (let i = 0; i < n; i++) L.push(C.portee(g, i));
  L.push(hc, hc);
  if (!ouvert) for (let i = 0; i < n; i++) L.push(C.portee(g, i));
  const m = L.length, Lm = L.reduce((s, x) => s + x, 0) / m;
  return { LPhi: Math.max(kContinu(m) * Lm, Math.max(...L)), k: kContinu(m), Lm, m };
}

/** Largeurs de diffusion et intensités (t/m²) au feuillet moyen de la traverse. */
export function diffusionRail(r, Hr, et) {
  const sL = 2 * r.ballast / r.pente.ballast + 2 * Hr / r.pente.remblai + et;   // élargissement total (m)
  const bt = r.longueurTraverse + sL;                                          // largeur transversale (m)
  return { sL, bt };
}

/** Convertit une liste de segments globaux [x0, x1, q] (x depuis l'axe du piédroit gauche) en jeu de charges du cadre. */
export function jeuSegments(g, segs) {
  const n = C.nCell(g), v = new Array(n).fill(0), bandes = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const lc = C.portee(g, i), xa = x, xb = x + lc;
    for (const [a, b, q] of segs) {
      const u = Math.max(a, xa), w = Math.min(b, xb);
      if (!(w > u + 1e-9) || q === 0) continue;
      if (u <= xa + 1e-9 && w >= xb - 1e-9) v[i] += q;
      else bandes.push({ travee: i, x0: u - xa, l: w - u, q });
    }
    x = xb;
  }
  return C.jeu(n, { v, bandes });
}

/** Retire l'intervalle [a, b] d'une liste de segments. */
function soustraire(segs, a, b) {
  const out = [];
  for (const [x0, x1, q] of segs) {
    if (b <= x0 || a >= x1) { out.push([x0, x1, q]); continue; }
    if (a > x0) out.push([x0, a, q]);
    if (b < x1) out.push([b, x1, q]);
  }
  return out;
}

const positions = (debut, fin, pas = 0.25, nmin = 9, nmax = 41) => {
  const nb = Math.min(Math.max(Math.ceil((fin - debut) / pas) + 1, nmin), nmax);
  return Array.from({ length: nb }, (_, k) => debut + (fin - debut) * k / (nb - 1));
};

/**
 * Fabrique le fournisseur de systèmes d'exploitation pour calculPicf (option chargesExploitation) et les éléments de
 * note (dérivations, coefficient dynamique, surcharge sur remblai).
 */
export function chargesFerroviaires(geom, g, rIn = {}, ouvert = false) {
  const r = { ...RAIL_DEFAUT, ...rIn, pente: { ...RAIL_DEFAUT.pente, ...(rIn.pente || {}) } };
  const ld = longueurDeterminante(g, ouvert), LPhi = r.LPhi > 0 ? r.LPhi : ld.LPhi;
  const phiBrut = r.entretien === 'soigne' ? phi2(LPhi) : phi3(LPhi);
  const h = geom.Hr + r.ballast + r.hTraverseVoie, phi = reductionCouverture(phiBrut, h);
  const { sL, bt } = diffusionRail(r, geom.Hr, geom.et), Ltot = C.largeurCalc(g), a = r.alpha;
  const lBloc = LM71.n * LM71.a + sL;
  const q4 = a * LM71.n * LM71.P / lBloc / bt / KN_PAR_T * phi, qv = a * LM71.qv / bt / KN_PAR_T * phi;
  // α s'applique à SW/0, pas à SW/2 (EN 1991-2, 6.3.2(4))
  const sw = Object.fromEntries(Object.entries(SW).map(([k, s]) => [k, { ...s, qt: modeleSW(k, a).q / bt / KN_PAR_T * phi, l: s.a + sL }]));
  // Surcharge sur remblai (6.3.6.4) : LM71 ou SW/2 répartis sur 3,00 m, sans Φ. LM71 : 4 × 250 kN sur 6,40 m.
  const qRemblaiLM = a * LM71.n * LM71.P / (LM71.n * LM71.a) / 3.0 / KN_PAR_T, qRemblaiSW2 = SW['SW/2'].q / 3.0 / KN_PAR_T;
  const psrem = r.sw2 ? Math.max(qRemblaiLM, qRemblaiSW2) : qRemblaiLM;

  const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
  const derivations = [
    { sys: 'LM71', empreinte: `4 essieux de ${fr(a * LM71.P, 0)} kN (α = ${fr(a)}) espacés de 1,60 m → ${fr(a * LM71.P / LM71.a, 1)} kN/m sur 6,40 m, et ${fr(a * LM71.qv, 1)} kN/m au-delà`, H: geom.Hr, e: geom.et, pente: r.pente.remblai, s: sL, U: bt, V: lBloc, qBrute: q4 / phi, delta: phi, coef: 1, q: q4, portee: C.portee(g, 0), couverture: lBloc / C.portee(g, 0) },
    ...(r.sw0 && geom.n >= 1 ? [{ sys: 'SW/0', empreinte: `${fr(a * 133, 1)} kN/m sur 2 × 15 m séparés de 5,30 m`, H: geom.Hr, e: geom.et, pente: r.pente.remblai, s: sL, U: bt, V: sw['SW/0'].l, qBrute: sw['SW/0'].qt / phi, delta: phi, coef: 1, q: sw['SW/0'].qt, portee: C.portee(g, 0), couverture: Infinity }] : []),
    ...(r.sw2 ? [{ sys: 'SW/2', empreinte: '150 kN/m (sans α) sur 2 × 25 m séparés de 7,00 m', H: geom.Hr, e: geom.et, pente: r.pente.remblai, s: sL, U: bt, V: sw['SW/2'].l, qBrute: sw['SW/2'].qt / phi, delta: phi, coef: 1, q: sw['SW/2'].qt, portee: C.portee(g, 0), couverture: Infinity }] : []),
  ];

  /** Systèmes pour un schéma de travées chargées (la part uniforme qv de LM71 suit le schéma, le groupe d'essieux se déplace). */
  const fournisseur = ({ pattern, quoi }) => {
    const L = [];
    const travees = []; { let x = 0; for (let i = 0; i < geom.n; i++) { const lc = C.portee(g, i); if (pattern[i]) travees.push([x, x + lc, qv]); x += lc; } }
    const jeuxLM = positions(-lBloc, Ltot).map(b0 => {
      const b1 = b0 + lBloc, segs = soustraire(travees, b0, b1);
      if (b1 > 0 && b0 < Ltot) segs.push([Math.max(b0, 0), Math.min(b1, Ltot), q4]);
      return jeuSegments(g, segs);
    });
    L.push({ sys: 'LM71', q: q4, nature: 'civil', gS: 1.0, gU: GAMMA_RAIL.LM71, jeux: jeuxLM, bande: lBloc,
      libelle: `LM71 — ${quoi} (groupe d'essieux ${fr(q4, 3)} t/m² sur ${fr(lBloc)} m, ${fr(qv, 3)} t/m² au-delà, ${jeuxLM.length} positions)` });
    // SW/0 et SW/2 : modèles « continus », appliqués une fois (schéma « toutes travées ») en déplaçant le motif bloc-vide-bloc.
    if (pattern.every(Boolean)) for (const [k, on] of [['SW/0', r.sw0], ['SW/2', r.sw2]]) {
      if (!on) continue;
      const s = sw[k], motif = 2 * s.l + s.c;
      const jeux = positions(-motif, Ltot, 0.25, 9, 61).map(b0 => {
        const segs = [[b0, b0 + s.l, s.qt], [b0 + s.l + s.c, b0 + motif, s.qt]].map(([x0, x1, q]) => [Math.max(x0, 0), Math.min(x1, Ltot), q]).filter(([x0, x1]) => x1 > x0);
        return jeuSegments(g, segs);
      });
      L.push({ sys: k, q: s.qt, nature: 'civil', gS: 1.0, gU: GAMMA_RAIL[k], jeux, bande: s.l, libelle: `${k} — ${fr(s.qt, 3)} t/m² par blocs de ${fr(s.l)} m séparés de ${fr(s.c)} m (${jeux.length} positions)` });
    }
    return L;
  };

  const notes = [
    `Charges ferroviaires EN 1991-2 : α = ${fr(a)}, coefficient dynamique ${r.entretien === 'soigne' ? 'Φ2 (voie soigneusement entretenue)' : 'Φ3 (entretien normal)'} = ${fr(phiBrut, 3)} pour LΦ = ${fr(LPhi)} m${r.LPhi > 0 ? ' (saisie)' : ` (tableau 6.2 : ${ld.m} barres, k = ${fr(ld.k, 1)}, L_m = ${fr(ld.Lm)} m)`}, réduit à ${fr(phi, 3)} pour une couverture h = ${fr(h)} m (traverse de voie comprise).`,
    `Diffusion (hypothèse) : traverse de voie ${fr(r.longueurTraverse)} m, ballast ${fr(r.ballast)} m à ${r.pente.ballast}:1, remblai ${fr(geom.Hr)} m à ${r.pente.remblai}:1, traverse de l'ouvrage à 1:1 → largeur transversale ${fr(bt)} m, élargissement longitudinal ${fr(sL)} m. À confirmer par le référentiel du gestionnaire du réseau.`,
    `Surcharge sur remblai (EN 1991-2, 6.3.6.4) : ${fr(psrem, 2)} t/m² (${fr(psrem * KN_PAR_T, 1)} kN/m²), sans coefficient dynamique — elle remplace la surcharge PSREM dans la poussée K₀max.`,
    'Coefficients partiels ferroviaires (EN 1990, tableau A2.4(B)) : γQ = 1,45 pour LM71 et SW/0, 1,20 pour SW/2 à l\'ELU, 1,00 à l\'ELS. Freinage et démarrage non pris en compte dans ce calcul par mètre linéaire.',
  ];
  return { fournisseur, derivations, notes, phi, phiBrut, LPhi, psrem, bt, sL, q4, qv };
}
