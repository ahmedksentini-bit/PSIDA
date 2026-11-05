/**
 * Cadre ou portique sous remblai portant une route : charges de trafic de l'EN 1991-2 appliquées par mètre linéaire
 * d'ouvrage (point d'extension `chargesExploitation` de calculPicf).
 *  - LM1 (4.3.2) : tandems TS de deux essieux espacés de 1,20 m, roues 0,40 × 0,40 m espacées de 2,00 m en travers, α_Qi Q_ik
 *    par essieu (300 / 200 / 100 kN), sur des voies conventionnelles de 3 m (4.2.3) ; UDL α_qi q_ik (9 kN/m² sur la voie 1,
 *    2,5 kN/m² ailleurs) ; tandems de voies voisines placés au plus près (roues à 1,00 m l'une de l'autre) ;
 *  - LM2 (4.3.3) : essieu unique β_Q · 400 kN, roues 0,35 m (sens de circulation) × 0,60 m espacées de 2,00 m (groupe gr1b) ;
 *  - diffusion (4.9.1 (1) NOTE 2 et 4.3.6) : 30° sur la verticale dans le remblai, 45° dans la traverse jusqu'à son feuillet
 *    moyen — demi-élargissement d = H_r tg 30° + e_t/2 (angle modifiable) ;
 *  - passage au mètre linéaire : la bande de 1 m la plus chargée (somme des empreintes diffusées qui la recoupent) est
 *    appliquée au cadre ; le groupe d'essieux est déplacé le long de la traverse (balayage), l'UDL suit les travées chargées ;
 *  - coefficients partiels (EN 1990 annexe A2, tableau A2.4(B)) : γ_Q = 1,35 à l'ELU, 1,00 à l'ELS caractéristique ; pas de
 *    coefficient dynamique (compris dans les valeurs du LM1 / LM2) ; véhicule militaire Mc120 en option (gr5, Fascicule 61 avec
 *    son coefficient dynamique, γ = 1,35 / 1,00) ;
 *  - surcharge sur remblai pour la poussée : PSREM saisie (par défaut 10 kN/m², usage courant pour l'UDL + TS équivalents).
 * Deux sens de circulation : parallèle à la portée de la traverse (route qui franchit l'ouvrage, cas courant) ou parallèle à
 * l'axe de l'ouvrage. Unités du module cadre : m, t, t/m² (1 t = 10 kN).
 */
import * as C from './cadre.js';
import * as F61 from './charges61.js';
import { jeuSegments } from './rail.js';
import { EC_ALPHA } from '../loads_ec.js';

export const KN_PAR_T = 10;
export const ROUTE_EC_DEFAUT = { alpha: 'FR2', angle: 30, sens: 'portee', lm2: true, mc120: false, ecartRoues: 1.0 };
export const TS = { axes: 1.2, roues: 2.0, u: 0.40, v: 0.40, Q: [300, 200, 100], q1: 9, qi: 2.5 };
export const LM2 = { Q: 400, roues: 2.0, ux: 0.35, uy: 0.60 };

/** Voies conventionnelles (EN 1991-2, tableau 4.1). */
export function voiesEC(w) {
  if (!(w > 0)) return { n: 1, wl: 3, wr: 0 };
  if (w < 5.4) return { n: 1, wl: 3, wr: Math.max(0, w - 3) };
  if (w < 6) return { n: 2, wl: w / 2, wr: 0 };
  const n = Math.floor(w / 3 + 1e-9); return { n, wl: 3, wr: w - 3 * n };
}

const positions = (debut, fin, pas = 0.25, nmin = 9, nmax = 41) => {
  const nb = Math.min(Math.max(Math.ceil((fin - debut) / pas) + 1, nmin), nmax);
  return Array.from({ length: nb }, (_, k) => debut + (fin - debut) * k / (nb - 1));
};

/**
 * Bande de 1 m (perpendiculaire à la portée) la plus chargée par un ensemble d'empreintes diffusées : roues
 * [{ x, y, P [t], bx, by }] → segments [x0, x1, q] le long de la portée. La bande retenue maximise l'effort total.
 */
export function bandeLaPlusChargee(roues) {
  const cand = new Set();
  for (const r of roues) { cand.add(r.y - r.by / 2 + 1e-6); cand.add(r.y + r.by / 2 - 1e-6); cand.add(r.y); }
  let best = null, bestF = -1;
  for (const y of cand) {
    const segs = [], F = roues.reduce((s, r) => {
      if (Math.abs(y - r.y) > r.by / 2 + 1e-9) return s;
      const q = r.P / (r.bx * r.by); segs.push([r.x - r.bx / 2, r.x + r.bx / 2, q]); return s + q * r.bx;
    }, 0);
    if (F > bestF + 1e-12) { bestF = F; best = { y, segs, F }; }
  }
  return best || { y: 0, segs: [], F: 0 };
}

/**
 * Fournisseur de systèmes d'exploitation EN 1991-2 pour calculPicf, et éléments de note.
 * @param {object} geom géométrie (geometrieCadre) ; @param {object} g cadre ; @param {object} oIn options (ROUTE_EC_DEFAUT) ;
 * @param {object} h hypothèses du cadre (largeurChargeable, classe, rhoB, rhoR) ; @param {number} poids poids G (t) pour Mc120
 */
export function chargesRoutieresEC(geom, g, oIn = {}, h = {}, poids = 0) {
  const o = { ...ROUTE_EC_DEFAUT, ...oIn };
  const al = EC_ALPHA[o.alpha] || EC_ALPHA.recommended, aQ = al.aQ, aq1 = al.aq1, aq2 = al.aq2 ?? 1;
  const betaQ = al.betaQ ?? aQ[0];
  const Ltot = C.largeurCalc(g), Hr = geom.Hr, et = geom.et;
  const d = Hr * Math.tan(o.angle * Math.PI / 180) + et / 2;               // demi-élargissement (m)
  const w = h.largeurChargeable > 0 ? h.largeurChargeable : (geom.L > 0 ? geom.L : 3), V = voiesEC(w);
  const nTS = Math.min(V.n, 3), pistes = o.sens === 'axe' ? 'x' : 'y';    // direction dans laquelle les voies se juxtaposent
  const bxTS = TS.u + 2 * d, byTS = TS.v + 2 * d;

  /** Roues des tandems pour un ordre de voies (indices de 0 à nTS−1), groupe placé à l'abscisse x0 le long de la portée. */
  const rouesTS = (ordre, x0) => {
    const R = [];
    ordre.forEach((iv, k) => {
      const P = aQ[iv] * TS.Q[iv] / 2 / KN_PAR_T;                         // une roue (t)
      // voies conventionnelles de 3 m juxtaposées ; tandems de voies voisines rapprochés (roues à ecartRoues l'une de l'autre)
      const off = k * (TS.roues + o.ecartRoues), roue = [off, off + TS.roues];
      for (const a of [0, TS.axes]) for (const r of roue) {
        if (pistes === 'y') R.push({ x: x0 + a, y: r, P, bx: bxTS, by: byTS });   // circulation le long de la portée
        else R.push({ x: x0 + r, y: a, P, bx: bxTS, by: byTS });                 // circulation le long de l'axe de l'ouvrage
      }
    });
    return R;
  };
  const ordres = [[0]];
  if (nTS >= 2) ordres.push([0, 1], [1, 0]);
  if (nTS >= 3) ordres.push([1, 0, 2], [0, 1, 2]);
  const etendueTS = ordre => (pistes === 'y' ? TS.axes : (ordre.length - 1) * (TS.roues + o.ecartRoues) + TS.roues) + bxTS;

  // UDL : bande de 1 m la plus chargée en voie 1 (α_q1 q_1k), ou, voies juxtaposées le long de la portée, voie 1 suivie
  // des autres voies (α_qi q_ik) sur 3 m chacune
  const qUDL1 = aq1 * TS.q1 / KN_PAR_T, qUDLi = aq2 * TS.qi / KN_PAR_T;

  // LM2
  const PL2 = betaQ * LM2.Q / 2 / KN_PAR_T, bxL2 = (pistes === 'y' ? LM2.ux : LM2.uy) + 2 * d, byL2 = (pistes === 'y' ? LM2.uy : LM2.ux) + 2 * d;
  const rouesLM2 = x0 => (pistes === 'y' ? [0, LM2.roues].map(r => ({ x: x0, y: r, P: PL2, bx: bxL2, by: byL2 }))
    : [0, LM2.roues].map(r => ({ x: x0 + r, y: 0, P: PL2, bx: bxL2, by: byL2 })));
  const etendueL2 = (pistes === 'y' ? 0 : LM2.roues) + bxL2;

  // Mc120 (option, gr5) : Fascicule 61 avec coefficient dynamique
  const mc = F61.diffuserChenille(F61.EMPREINTES.Mc120, Hr, et), dMc = F61.coefDynamique(Ltot, poids, 110.0, h.classe || 1), qMc = mc.q * dMc;

  const fr = (x, n = 2) => x.toFixed(n).replace('.', ',');
  const sTS = bandeLaPlusChargee(rouesTS(ordres[ordres.length - 1], 0));
  const qTSmax = Math.max(...sTS.segs.map(s => s[2]), 0);

  const fournisseur = ({ pattern, quoi }) => {
    const L = [];
    const travees = []; { let x = 0; for (let i = 0; i < geom.n; i++) { const lc = C.portee(g, i); if (pattern[i]) travees.push([x, x + lc]); x += lc; } }
    const udlSegs = (ordre, x0) => {
      if (pistes === 'y') return travees.map(([a, b]) => [a, b, qUDL1]);
      // voies juxtaposées le long de la portée : chaque voie de l'ordre sur 3 m (α_qi q_ik), 2,5 kN/m² ailleurs
      const voies = ordre.map((iv, k) => { const off = k * (TS.roues + o.ecartRoues); return [x0 + off - 0.5, x0 + off + TS.roues + 0.5, iv === 0 ? qUDL1 : qUDLi]; });
      const out = [];
      for (const [a, b] of travees) {
        let cur = a;
        for (const [u0, v0, q] of voies.slice().sort((p1, p2) => p1[0] - p2[0])) {
          const u = Math.max(a, u0), v = Math.min(b, v0);
          if (!(v > u)) continue;
          if (u > cur) out.push([cur, u, qUDLi]);
          out.push([u, v, q]); cur = Math.max(cur, v);
        }
        if (b > cur) out.push([cur, b, qUDLi]);
      }
      return out;
    };
    const jeuxLM1 = [];
    for (const ordre of ordres) {
      const ext = etendueTS(ordre);
      for (const x0 of positions(-ext + bxTS / 2, Ltot - bxTS / 2 + 1e-9)) {
        const b = bandeLaPlusChargee(rouesTS(ordre, x0));
        const segs = b.segs.map(([a, c, q]) => [Math.max(a, 0), Math.min(c, Ltot), q]).filter(([a, c]) => c > a);
        jeuxLM1.push(jeuSegments(g, [...udlSegs(ordre, x0), ...segs]));
      }
    }
    L.push({ sys: 'LM1', q: qTSmax, nature: 'civil', gS: 1.0, gU: 1.35, jeux: jeuxLM1, bande: etendueTS(ordres[ordres.length - 1]),
      libelle: `LM1 (TS + UDL) — ${quoi} (TS diffusé ${fr(qTSmax, 3)} t/m² au plus, UDL ${fr(qUDL1, 3)} t/m², ${jeuxLM1.length} positions)` });
    if (o.lm2) {
      const jeux = positions(-etendueL2 + bxL2 / 2, Ltot - bxL2 / 2 + 1e-9).map(x0 => {
        const b = bandeLaPlusChargee(rouesLM2(x0));
        return jeuSegments(g, b.segs.map(([a, c, q]) => [Math.max(a, 0), Math.min(c, Ltot), q]).filter(([a, c]) => c > a));
      });
      L.push({ sys: 'LM2', q: PL2 / (bxL2 * byL2), nature: 'civil', gS: 1.0, gU: 1.35, jeux, bande: etendueL2,
        libelle: `LM2 (gr1b) — essieu ${fr(betaQ * LM2.Q, 0)} kN, ${fr(PL2 / (bxL2 * byL2), 3)} t/m² par roue (${jeux.length} positions)` });
    }
    if (o.mc120 && pattern.every(Boolean)) L.push({ sys: 'Mc120', q: qMc, nature: 'militaire', gS: 1.0, gU: 1.35, emprise: mc.V,
      libelle: `Mc120 (gr5, Fascicule 61) — ${fr(qMc, 3)} t/m² sur ${fr(mc.V)} m` });
    return L;
  };

  const derivations = [
    { sys: 'TS (LM1)', empreinte: `roues ${fr(TS.u)} × ${fr(TS.v)} m, essieux de ${TS.Q.slice(0, nTS).map((Q, i) => fr(aQ[i] * Q, 0)).join(' / ')} kN espacés de ${fr(TS.axes)} m, roues à ${fr(TS.roues)} m`, H: Hr, e: et, pente: Math.tan(o.angle * Math.PI / 180), s: 2 * d, U: byTS, V: bxTS, qBrute: aQ[0] * TS.Q[0] / 2 / KN_PAR_T / (bxTS * byTS), delta: 1, coef: 1, q: qTSmax, portee: C.portee(g, 0), couverture: Hr },
    { sys: 'UDL (LM1)', empreinte: `${fr(aq1 * TS.q1, 2)} kN/m² sur la voie 1, ${fr(aq2 * TS.qi, 2)} kN/m² ailleurs`, H: Hr, e: et, pente: 0, s: 0, U: 0, V: 0, qBrute: qUDL1, delta: 1, coef: 1, q: qUDL1, portee: C.portee(g, 0), couverture: Infinity },
    ...(o.lm2 ? [{ sys: 'LM2', empreinte: `essieu β_Q · 400 = ${fr(betaQ * LM2.Q, 0)} kN, roues 0,35 × 0,60 m à 2,00 m`, H: Hr, e: et, pente: Math.tan(o.angle * Math.PI / 180), s: 2 * d, U: byL2, V: bxL2, qBrute: PL2 / (bxL2 * byL2), delta: 1, coef: 1, q: PL2 / (bxL2 * byL2), portee: C.portee(g, 0), couverture: Hr }] : []),
  ];
  const notes = [
    `Charges routières EN 1991-2 (${al.label || o.alpha}) : ${V.n} voie(s) conventionnelle(s) pour une largeur chargeable de ${fr(w)} m${h.largeurChargeable > 0 ? '' : ' (longueur de l\'ouvrage, faute de largeur chargeable saisie)'} ; tandems ${TS.Q.slice(0, nTS).map((Q, i) => fr(aQ[i] * Q, 0)).join(' / ')} kN par essieu, UDL ${fr(aq1 * TS.q1, 2)} kN/m² (voie 1) ; LM2 ${o.lm2 ? `β_Q · 400 = ${fr(betaQ * LM2.Q, 0)} kN` : 'non examiné'}${o.mc120 ? ' ; Mc120 (gr5) avec le coefficient dynamique du Fascicule 61' : ''}.`,
    `Diffusion (EN 1991-2, 4.9.1 et 4.3.6) : ${fr(o.angle, 0)}° sur la verticale dans ${fr(Hr)} m de remblai, 45° dans la traverse jusqu'à son feuillet moyen — demi-élargissement d = ${fr(d, 3)} m, empreinte d'une roue TS ${fr(bxTS)} × ${fr(byTS)} m. Circulation ${pistes === 'y' ? 'parallèle à la portée de la traverse (route franchissant l\'ouvrage)' : 'parallèle à l\'axe de l\'ouvrage'} ; tandems de voies voisines rapprochés à ${fr(o.ecartRoues)} m entre roues ; bande de 1 m la plus chargée appliquée au calcul par mètre linéaire, groupe d'essieux balayé le long de la traverse.`,
    'Coefficients partiels (EN 1990, tableau A2.4(B)) : γ_Q = 1,35 à l\'ELU, 1,00 à l\'ELS caractéristique ; pas de coefficient dynamique (compris dans le LM1 et le LM2). Un seul groupe à la fois (gr1a, gr1b, gr5).',
  ];
  return { fournisseur, derivations, notes, d, bxTS, byTS, qTSmax, qUDL1, voies: V, betaQ };
}
