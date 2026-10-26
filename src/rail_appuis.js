/**
 * Appuis des ponts-rails (lot 5) — actions ferroviaires transmises aux appareils d'appui, aux appuis et aux fondations,
 * et réponse combinée voie-ouvrage par la méthode simplifiée.
 *
 * Références (relues sur la NF EN 1991-2 et la NF EN 1990/A1) :
 *  - EN 1991-2 § 6.3.6.4 (surcharge sur remblai : LM71 × α, et SW/2, sur 3,00 m à 0,70 m sous le plan de roulement, sans
 *    coefficient dynamique) ; § 6.4.5.4(2) (poteaux d'élancement < 30, culées, fondations, murs de soutènement, pressions
 *    au sol : calcul possible sans effets dynamiques) ; tableau 6.2 cas 6 (appareils d'appui, chevêtres, poteaux : L_Φ
 *    des éléments portés) ;
 *  - § 6.5.1 et tableau 6.8 (force centrifuge), § 6.5.2 (lacet), § 6.5.3 (démarrage et freinage ; note 1 du (2) : SW/0 et
 *    SW/2 sur leurs seules parties chargées ; (9) : deux voies) ;
 *  - § 6.5.4 (réponse combinée voie-ouvrage) : 6.5.4.5.1 (contraintes additionnelles admissibles dans le rail 72 / 92 MPa,
 *    domaine de validité), 6.5.4.5.2 (δ_B, δ_H, δ_V), 6.5.4.6.1 (méthode simplifiée : conditions (1), limites de validité
 *    (2), coefficient ξ du tableau 6.9, forces F_Tk (6.26 à 6.29) et F_Qk (6.30, 6.31)) ; annexe G.2(3) (k = 20 à 40 kN/m
 *    pour une voie non chargée) ;
 *  - EN 1990/A1 A2 : tableau 6.11 de l'EN 1991-2 (groupes), tableaux A2.3 (ψ) et A2.4(B) (γ) — module loads_rail.js ;
 *  - EN 1998-2 § 4.1.2(4)P : ψ2,1 = 0,3 pour les ponts ferroviaires (valeur recommandée, reprise par l'annexe nationale
 *    française selon le référentiel de Pont EC8 ; annexe nationale britannique : « For rail bridges ψ2,1 = 0,3 »).
 * Toutes les valeurs sont les valeurs recommandées : MENTION de loads_rail.js.
 * Unités : kN, m, km/h ; déplacements en mm.
 */
import { LM71, SW, longueurChargee, demarrageFreinage, casCentrifuge, effortLacet, groupesApplicables, gammaGroupe, psi as psiRail, surchargeRemblai, MENTION } from './loads_rail.js';

export { MENTION };

/** Critères de dimensionnement de la réponse combinée voie-ouvrage (EN 1991-2 § 6.5.4.5 et 6.5.4.6.1). */
export const CRITERES_INTERACTION = {
  sigmaCompression: 72, sigmaTraction: 92,      // 6.5.4.5.1(1) [MPa]
  deltaB: { lrs: 5, joints: 30 },               // 6.5.4.5.2(1) [mm]
  deltaH: { interaction: 8, sansInteraction: 10 }, // 6.5.4.5.2(2) [mm]
  simplifiee: { deltaB: 5, deltaH: 5, LT: 40 }, // 6.5.4.6.1(1) [mm, mm, m]
  rayonMin: 1500, ballastMin: 0.30,             // 6.5.4.5.1(2) [m]
  dTD: 35, dTR: 50, dTdiff: 20,                 // 6.5.4.6.1(2), éq. (6.25) [K]
};
/** Résistance plastique au cisaillement longitudinal de la voie, kN/m (6.5.4.6.1(2), annexe G.2(3)). */
export const K_VOIE = { nonChargeeMin: 20, nonChargeeMax: 40, chargee: 60 };
/** ψ2,1 des charges de trafic ferroviaire concomitantes au séisme (EN 1998-2 § 4.1.2(4)P, valeur recommandée). */
export const PSI21_FERROVIAIRE = 0.3;

const MODELES_VOIE = continu => (continu ? ['LM71', 'SW/0'] : ['LM71']);

export { longueurChargee };

/** Démarrage et freinage d'une voie chargée par un modèle, sur la longueur d'influence L (§ 6.5.3(2), (4)). */
export function longitudinalVoie(modele, L, alpha = 1) {
  const Lab = longueurChargee(modele, L), d = demarrageFreinage(Lab, { modele, alpha });
  return { modele, Lab, Qla: d.demarrage, Qlb: d.freinage, auDela300: d.auDela300 };
}

/**
 * Effort longitudinal total sur l'ouvrage (§ 6.5.3) :
 *  - une voie (LM71, SW/0 sur ouvrage continu) : max(Q_la ; Q_lb) ;
 *  - SW/2 sur une voie : max(Q_la ; Q_lb) de SW/2 (35 kN/m sans plafond pour le freinage, sans α) ;
 *  - deux voies (6.5.3(9)P) : freinage sur une voie avec démarrage sur l'autre, Q_lb + Q_la (sens de circulation
 *    opposés, défaut) ; mêmes sens autorisés : soit le démarrage, soit le freinage sur les deux voies, max(2 Q_la ; 2 Q_lb) ;
 *  - SW/2 sur une voie, LM71 sur l'autre : même règle avec les valeurs de chaque voie.
 * Les deux efforts d'une combinaison à deux voies sont de même sens sur l'ouvrage (le plus défavorable).
 */
export function effortsLongitudinaux({ L, alpha = 1, continu = false, sw2 = false, memeSens = false }) {
  const mods = MODELES_VOIE(continu).map(m => longitudinalVoie(m, L, alpha));
  const voie = { Qla: Math.max(...mods.map(m => m.Qla)), Qlb: Math.max(...mods.map(m => m.Qlb)), detail: mods };
  const s2 = sw2 ? longitudinalVoie('SW/2', L, 1) : null;
  const paire = (A, B) => (memeSens ? Math.max(A.Qla + B.Qla, A.Qlb + B.Qlb) : Math.max(A.Qlb + B.Qla, A.Qla + B.Qlb));
  return {
    L, alpha, memeSens, voie, voieSW2: s2,
    une: Math.max(voie.Qla, voie.Qlb),
    deux: paire(voie, voie),
    sw2Seul: s2 ? Math.max(s2.Qla, s2.Qlb) : 0,
    sw2b: s2 ? paire(s2, voie) : 0,
    auDela300: L > 300,
  };
}

/** Charge verticale totale d'un modèle sur une longueur L [kN] (α = 1) : sert au calcul de la force centrifuge totale. */
export function chargeVerticaleTotale(modele, L) {
  if (!(L > 0)) return 0;
  if (modele === 'LM71') {
    const n = Math.min(LM71.n, 1 + Math.floor(L / LM71.a + 1e-9));
    return n * LM71.P + LM71.qv * Math.max(0, L - LM71.n * LM71.a);
  }
  return SW[modele].q * longueurChargee(modele, L);
}

/**
 * Efforts transversaux par voie (§ 6.5.1, 6.5.2) sur une longueur chargée L :
 *  - force centrifuge Q_t = V²/(127 r) · f · α_c · Q_v (éq. 6.17-6.18) : cas du tableau 6.8 (casCentrifuge) — V > 120 km/h :
 *    à V avec α_c = 1 et f(V, L_f = L), et à 120 km/h avec α_c = α et f = 1 ; enveloppe ; Q_v = LM71 (et SW/0 sur ouvrage
 *    continu) sur L ; SW/2 : f = 1, sans α, à min(V ; 80 km/h) (6.5.1(5) note 2) ;
 *  - lacet 100 kN × α si α ≥ 1 (SW/2 : 100 kN), sans Φ ni f.
 * Ni Φ ni majoration (6.5.1(3)P, 6.5.2(2)P).
 */
export function effortsTransversaux({ L, alpha = 1, continu = false, V = 0, rayon = 0, sw2 = false, VSW2 = 80 }) {
  const out = { L, lacet: effortLacet(alpha), lacetSW2: effortLacet(1), centrifuge: 0, centrifugeSW2: 0, cas: [] };
  if (!(V > 0 && rayon > 0)) return out;
  const W = Math.max(...MODELES_VOIE(continu).map(m => chargeVerticaleTotale(m, L)));
  for (const c of casCentrifuge(V, alpha, L).filter(c => !c.sansCentrifuge)) {
    const F = c.V * c.V / (127 * rayon) * c.f * c.alpha * W;
    out.cas.push({ ...c, W, F });
    out.centrifuge = Math.max(out.centrifuge, F);
  }
  if (sw2) { const Vs = Math.min(V, VSW2); out.centrifugeSW2 = Vs * Vs / (127 * rayon) * chargeVerticaleTotale('SW/2', L); out.VSW2 = Vs; }
  return out;
}

/** Coefficient de réduction ξ (tableau 6.9) ; null hors domaine (longueur totale > 40 m). Portiques et cadres : 1 (note). */
export function coefficientXi({ Ltot, dilatation = 'continue', portique = false }) {
  if (portique) return 1;
  if (!(Ltot <= 40 + 1e-9)) return null;
  return dilatation === 'deux' ? 1.0 : dilatation === 'une' ? 0.7 : 0.6;
}

/**
 * Force longitudinale F_Tk par voie due à la température, sur les appareils d'appui fixes (§ 6.5.4.6.1(4)) :
 *  - longs rails soudés aux deux extrémités, point fixe à une extrémité : ± 0,6 k L_T (6.26) ; point fixe à L1 d'une
 *    extrémité et L2 de l'autre : ± 0,6 k (L2 − L1) (6.27) — la seconde formule contient la première (L1 = 0) ;
 *  - longs rails soudés à l'extrémité fixe, dispositif de dilatation à l'extrémité libre : ± 20 L_T ≤ 1 100 kN (6.28) ;
 *  - dispositifs de dilatation aux deux extrémités : 0 (6.29).
 * k : voie non chargée, 20 à 40 kN/m (annexe G.2(3)) — 40 kN/m par défaut (borne défavorable pour les appuis).
 */
export function forceThermiqueVoie({ dilatation = 'continue', k = K_VOIE.nonChargeeMax, LT, L1 = 0, L2 = null }) {
  if (dilatation === 'deux') return { F: 0, eq: '(6.29)' };
  if (dilatation === 'une') return { F: Math.min(20 * LT, 1100), eq: '(6.28)' };
  const l2 = L2 ?? LT;
  return { F: 0.6 * k * Math.abs(l2 - L1), eq: L1 > 1e-9 ? '(6.27)' : '(6.26)' };
}

/**
 * Force longitudinale F_Qk par voie due à la déformation du tablier sous les charges verticales, sur les appareils fixes
 * (§ 6.5.4.6.1(5)) : ± 20 L (6.30), L longueur de la première travée contiguë à l'appareil fixe ; dispositifs de
 * dilatation aux deux extrémités : 0 (6.31). Le texte français attache (6.30) au cas « longs rails soudés aux deux
 * extrémités, appareils fixes à une extrémité » complété de « dispositifs de dilatation à l'autre » : (6.30) est retenue
 * dès que le rail est continu à l'extrémité fixe (côté de la sécurité).
 */
export function forceDeformationVoie({ dilatation = 'continue', L }) {
  if (dilatation === 'deux') return { F: 0, eq: '(6.31)' };
  return { F: 20 * L, eq: '(6.30)' };
}

/**
 * Conditions de la méthode simplifiée (§ 6.5.4.6.1(1) et (2)) : si elles sont toutes remplies, la vérification des
 * contraintes dans les rails n'est pas nécessaire et les forces sur les appareils fixes s'obtiennent par ξ, F_Tk et F_Qk.
 * @param {object} o { tablierUnique, LT, deltaB [mm], deltaH [mm], voieConforme (rail UIC 60 ≥ 900 MPa déclaré),
 *   traverses ('beton' | 'bois'), ballast [m], rayon [m] (0 = alignement), alpha, sw2, alphaSousSW2 (α·LM71 ≤ SW/2),
 *   dTD, dTR [K] }
 */
export function methodeSimplifiee(o) {
  const C = CRITERES_INTERACTION, cond = [];
  const add = (id, texte, ok, ref, valeur = '') => cond.push({ id, texte, ok, ref, valeur });
  add('unique', 'tablier unique (travée indépendante ou travées continues)', !!o.tablierUnique, '6.5.4.6(2), 6.5.4.6.1(1)');
  add('LT', `longueur de dilatation L_T ≤ ${C.simplifiee.LT} m`, o.LT <= C.simplifiee.LT + 1e-9, '6.5.4.6.1(1)', o.LT);
  add('deltaB', `δ_B ≤ ${C.simplifiee.deltaB} mm sous le démarrage et le freinage (classifiés)`, o.deltaB <= C.simplifiee.deltaB + 1e-9, '6.5.4.6.1(1)', o.deltaB);
  add('deltaH', `δ_H ≤ ${C.simplifiee.deltaH} mm sous les charges verticales de trafic`, o.deltaH != null && o.deltaH <= C.simplifiee.deltaH + 1e-9, '6.5.4.6.1(1)', o.deltaH);
  add('rail', 'rail UIC 60, résistance à la traction ≥ 900 MPa (déclaré)', !!o.voieConforme, '6.5.4.5.1(2)');
  add('rayon', `voie en alignement ou en courbe de rayon ≥ ${C.rayonMin} m`, !(o.rayon > 0) || o.rayon >= C.rayonMin, '6.5.4.5.1(2)', o.rayon || null);
  add('traverses', 'traverses lourdes en béton (espacement ≤ 65 cm supposé)', o.traverses !== 'bois', '6.5.4.5.1(2)');
  add('ballast', `au moins ${Math.round(C.ballastMin * 100)} cm de ballast compacté sous les traverses`, o.ballast >= C.ballastMin - 1e-9, '6.5.4.5.1(2)', o.ballast);
  add('alpha', 'LM71 avec α = 1, ou effets de α·LM71 ≤ effets de SW/2', o.alpha <= 1 + 1e-9 || !!o.alphaSousSW2, '6.5.4.6.1(2) et note', o.alpha);
  add('dT', `ΔT_D ≤ ${C.dTD} K, ΔT_R ≤ ${C.dTR} K, |ΔT_D − ΔT_R| ≤ ${C.dTdiff} K`, o.dTD <= C.dTD + 1e-9 && o.dTR <= C.dTR + 1e-9 && Math.abs(o.dTD - o.dTR) <= C.dTdiff + 1e-9, '6.5.4.6.1(2), éq. (6.25)', `${o.dTD} / ${o.dTR}`);
  return { conditions: cond, applicable: cond.every(c => c.ok) };
}

/** Limite de δ_B selon les dispositifs de dilatation des rails (§ 6.5.4.5.2(1)P). */
export const limiteDeltaB = dilatation => (dilatation === 'deux' ? CRITERES_INTERACTION.deltaB.joints : CRITERES_INTERACTION.deltaB.lrs);

const VERT = { gr11: 'rail1', gr12: 'rail1', gr13: 'rail1', gr14: 'rail1', gr16: 'sw2', gr17: 'sw2', gr21: 'rail2', gr22: 'rail2', gr23: 'rail2', gr24: 'rail2', gr26: 'sw2b', gr27: 'sw2b' };
const LIB = {
  gr11: 'gr11 — vertical max 1, longitudinal max', gr12: 'gr12 — vertical max 2, transversal max', gr13: 'gr13 — longitudinal max', gr14: 'gr14 — transversal max',
  gr16: 'gr16 — SW/2, longitudinal max', gr17: 'gr17 — SW/2, transversal max',
  gr21: 'gr21 — 2 voies, vertical max 1, longitudinal max', gr22: 'gr22 — 2 voies, vertical max 2, transversal max', gr23: 'gr23 — 2 voies, longitudinal max', gr24: 'gr24 — 2 voies, transversal max',
  gr26: 'gr26 — SW/2 + LM71, longitudinal max', gr27: 'gr27 — SW/2 + LM71, transversal max',
};

/**
 * Groupes de charges ferroviaires pour les appuis (tableau 6.11) : composante verticale (référence de la réaction
 * calculée sur le tablier : rail1, rail2, sw2, sw2b), efforts horizontaux totaux sur l'ouvrage avec les coefficients du
 * groupe (lf : démarrage-freinage, cf : centrifuge, lac : lacet), γ (A2.4(B)) et ψ (A2.3). Le train à vide (gr15) et gr31
 * (trois voies et plus) ne sont pas traités.
 * @param {object} o { nV, sw2, long (effortsLongitudinaux), trans (effortsTransversaux), xi (réduction des efforts de
 *   démarrage-freinage transmis aux appareils, 1 sans réduction), FQ (F_Qk par voie) }
 */
export function groupesAppuis({ nV = 1, sw2 = false, long, trans, xi = 1, FQ = 0 }) {
  return groupesApplicables({ nbVoies: nV, sw2, trainVide: false }).filter(g => VERT[g.id]).map(g => {
    const deux = g.voies === 2, avecSW2 = g.vert.modele === 'SW/2';
    const Hl = deux ? (avecSW2 ? long.sw2b : long.deux) : (avecSW2 ? long.sw2Seul : long.une);
    const C = avecSW2 ? trans.centrifugeSW2 + (deux ? trans.centrifuge : 0) : trans.centrifuge * (deux ? 2 : 1);
    const lac = avecSW2 ? trans.lacetSW2 + (deux ? trans.lacet : 0) : trans.lacet * (deux ? 2 : 1);
    const nVoies = deux ? 2 : 1, ps = psiRail(g.id, nVoies);
    return { id: g.id, vertId: VERT[g.id], label: LIB[g.id] || g.id, voies: nVoies, lf: g.lf, cf: g.cf, lac: g.lac, dom: g.dom, kFavorable: g.vert.kFavorable ?? 1,
      gamma: gammaGroupe(g.id), psi0: ps.psi0, psi1: ps.psi1, psi2: ps.psi2,
      Hlong: g.lf * Hl, H: g.lf * Hl * xi + nVoies * FQ, Hy: g.cf * C + g.lac * lac, FQ: nVoies * FQ };
  });
}

/**
 * Combinaisons en tête d'appui sous trafic ferroviaire (EN 1990/A1 A2, approche 2, ensemble B) — mêmes structures que
 * headCombinationsEC (supports/actions.js), avec le γ de chaque groupe (1,45 ; 1,20 pour les groupes SW/2) :
 *  - groupe dominant : ELU 1,35 G + P + γ_g Q_g + 1,35 (retrait + fluage) + 1,5 ψ0,T (T + F_T) ;
 *    ELS caractéristique G + P + Q_g + retrait + fluage + ψ0,T (T + F_T) ;
 *  - température dominante : ELU 1,35 G + P + 1,35 (retrait + fluage) + 1,5 (T + F_T) + γ ψ0 Q ; ELS idem à 1,0.
 * F_T : effort d'interaction voie-ouvrage dû à la température (F_Tk), action thermique (γ = 1,5, ψ0 = 0,6, tableaux A2.3
 * et A2.4(B)). Efforts horizontaux cumulés en valeur absolue (sens le plus défavorable).
 * @param {object} a { G {N, P}, Q:[{label, N, H, Hy, gamma, psi0}], RF {H}, T {H}, FT {H}, psi0T }
 */
export function combinaisonsTeteRail({ G, Q = [], RF = { H: 0 }, T = { H: 0 }, FT = { H: 0 }, psi0T = 0.6 }) {
  const rf = Math.abs(RF.H), t = Math.abs(T.H) + Math.abs(FT.H), out = [];
  for (const q of Q) {
    out.push({ label: `ELU ${q.label}`, ls: 'ELU', Nsus: 1.35 * G.N + (G.P || 0), Ninst: q.gamma * q.N, Hinst: q.gamma * Math.abs(q.H), Hsus: 1.35 * rf + 1.5 * psi0T * t, ...(q.Hy ? { Hy: q.gamma * Math.abs(q.Hy) } : {}) });
    out.push({ label: `ELS car. ${q.label}`, ls: 'ELS', Nsus: G.N + (G.P || 0), Ninst: q.N, Hinst: Math.abs(q.H), Hsus: rf + psi0T * t, ...(q.Hy ? { Hy: Math.abs(q.Hy) } : {}) });
  }
  const q0 = Q.reduce((m, q) => (!m || q.N > m.N ? q : m), null) || { N: 0, H: 0, Hy: 0, gamma: 1.45, psi0: 0.8 };
  out.push({ label: 'ELU température', ls: 'ELU', Nsus: 1.35 * G.N + (G.P || 0), Ninst: q0.gamma * q0.psi0 * q0.N, Hinst: q0.gamma * q0.psi0 * Math.abs(q0.H), Hsus: 1.35 * rf + 1.5 * t });
  out.push({ label: 'ELS car. température', ls: 'ELS', Nsus: G.N + (G.P || 0), Ninst: q0.psi0 * q0.N, Hinst: q0.psi0 * Math.abs(q0.H), Hsus: rf + t });
  for (const c of out) { c.N = c.Nsus + c.Ninst; c.H = c.Hsus + c.Hinst; }
  return out;
}

/**
 * Surcharge de remblai derrière une culée (§ 6.3.6.4) : α·LM71 (et SW/2 si requis) réparti sur 3,00 m de large par voie à
 * 0,70 m sous le plan de roulement, sans coefficient dynamique. Pour le mur de front de largeur W : charge équivalente
 * répartie sur la largeur, q_eq = q · min(W ; 3 n_V)/W (même résultante — hypothèse PSIDA). γ : 1,45 (LM71), 1,20 si
 * SW/2 gouverne ; ψ0 = 0,8 (tableau A2.3, « poussée des terres horizontale due aux charges de trafic »).
 */
export function surchargeCulee({ alpha = 1, sw2 = false, nV = 1, largeur }) {
  const s = surchargeRemblai(alpha, sw2);
  const qBande = s.q, sw2Gouverne = sw2 && s.sw2 > s.lm71 + 1e-9;
  const W = largeur > 0 ? largeur : 3 * nV, qEq = qBande * Math.min(W, 3 * nV) / W;
  return { qBande, qEq, largeurBandes: 3 * nV, gamma: sw2Gouverne ? 1.20 : 1.45, psi0: 0.8, profondeur: s.profondeur, lm71: s.lm71, sw2: s.sw2, sw2Gouverne };
}

/**
 * Élancement d'un fût console (longueur de flambement 2H, rayon de giration i = b/√12 pour un voile dans le sens
 * longitudinal, D/4 pour une colonne) : effets dynamiques pris pour les fûts d'élancement ≥ 30 (§ 6.4.5.4(2)).
 */
export function elancementFut({ H, b = null, D = null }) {
  const i = D ? D / 4 : b / Math.sqrt(12);
  return 2 * H / i;
}
