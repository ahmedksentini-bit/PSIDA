/**
 * Charges ferroviaires — socle commun à tous les ouvrages portant une voie (EN 1991-2:2003, section 6 ; EN 1990/A1:2005,
 * annexe A2). Unités : kN, m, km/h. Aucune dépendance : chaque module d'ouvrage (cadre, dalle, poutres, appuis) convertit
 * dans ses propres unités et applique ses propres règles de diffusion.
 *
 * Toutes les valeurs sont les VALEURS RECOMMANDÉES de l'EN 1991-2 et de l'EN 1990 annexe A2 ; elles sont modifiables
 * (paramètres de chaque fonction) et doivent être confirmées par le référentiel du gestionnaire du réseau (annexe
 * nationale, spécification de ligne). Chaque constante porte sa source :
 *  - [EN]   valeur vérifiée sur l'EN 1991-2 / l'EN 1990 A2, ou sur un texte qui la reproduit (UIC 776-1, 5ᵉ éd. 2006,
 *           dont la section 6 de l'EN 1991-2 est issue ; corrigendum EN 1990/A1/AC) ;
 *  - [À CONFIRMER] valeur reprise de la norme sans qu'un texte accessible ait permis de la recouper ici : à relire sur
 *           l'exemplaire de la norme avant toute production (signalée dans `A_CONFIRMER`).
 */

export const MENTION = 'Valeurs recommandées de l\'EN 1991-2 — à confirmer par le référentiel du gestionnaire du réseau.';

// ---------------------------------------------------------------------------------------------------------------------
// Modèles de charges verticales
// ---------------------------------------------------------------------------------------------------------------------

/** Coefficient α des charges classifiées (6.3.2(3)P) [EN]. α = 1,00 recommandé par défaut ; 1,33 usuel sur lignes fret/internationales. */
export const ALPHAS = [0.75, 0.83, 0.91, 1.00, 1.10, 1.21, 1.33, 1.46];
export const estAlphaNormalise = a => ALPHAS.some(x => Math.abs(x - a) < 1e-9);

/** LM71 (6.3.2, fig. 6.1) [EN] : 4 essieux de 250 kN espacés de 1,60 m, 80 kN/m illimité de part et d'autre (hors 6,40 m). */
export const LM71 = { P: 250, n: 4, a: 1.6, qv: 80 };
/** SW/0, SW/2 (6.3.3, tableau 6.1) [EN] : q (kN/m) sur deux longueurs a (m) séparées de c (m). */
export const SW = { 'SW/0': { q: 133, a: 15, c: 5.3 }, 'SW/2': { q: 150, a: 25, c: 7.0 } };
/** Train à vide (6.3.4) [EN] : 10,0 kN/m, pour la stabilité transversale des tabliers à une voie. Ni α ni Φ. */
export const TRAIN_VIDE = { qv: 10 };

/** LM71 multiplié par α : essieux (x depuis le premier essieu), répartie au-delà, et charge uniforme équivalente du groupe. */
export function lm71(alpha = 1) {
  const essieux = Array.from({ length: LM71.n }, (_, i) => ({ x: i * LM71.a, Q: alpha * LM71.P }));
  const longueurGroupe = LM71.n * LM71.a;                                  // 6,40 m
  return { alpha, essieux, longueurGroupe, qGroupe: alpha * LM71.P / LM71.a, qv: alpha * LM71.qv };
}

/**
 * SW/0 ou SW/2. α s'applique à SW/0 (6.3.2(4), « SW/0 pour les ponts continus ») mais PAS à SW/2, modèle des trafics
 * lourds défini indépendamment de α [EN].
 */
export function sw(type, alpha = 1) {
  const s = SW[type];
  if (!s) throw new Error(`modèle ${type} inconnu (SW/0 ou SW/2)`);
  const k = type === 'SW/0' ? alpha : 1;
  return { type, q: k * s.q, a: s.a, c: s.c, longueurMotif: 2 * s.a + s.c, alphaApplique: k };
}

/**
 * Excentrement des charges verticales (6.3.5) [EN] : rapport des charges de roue 1,25:1,00 sur une même voie, soit un
 * excentrement e = r/18 avec r l'écartement des charges de roue (1,50 m pour la voie normale) → e = 0,083 m.
 */
export const excentrement = (r = 1.50) => r / 18;

/**
 * Répartition longitudinale d'une charge d'essieu par le rail (6.3.6.1, fig. 6.4) [EN] : Q/4, Q/2, Q/4 sur trois
 * traverses consécutives d'espacement a.
 */
export const repartitionTraverses = (Q, a = 0.60) => [{ x: -a, Q: Q / 4 }, { x: 0, Q: Q / 2 }, { x: a, Q: Q / 4 }];

/**
 * Diffusion sous la traverse de voie, à 4:1 dans le ballast (6.3.6.2 longitudinal et 6.3.6.3 transversal, voie ballastée
 * sans dévers) [EN], puis au gré de chaque ouvrage (remblai, béton). Rend les dimensions au plan de référence (dessus du
 * tablier) : `largeur` transversale = longueur de traverse + 2 × ballast/4 ; `longueur` = longueur chargée + 2 × ballast/4.
 */
export function diffusionBallast({ longueurTraverse = 2.60, ballast = 0.30, longueur = 0, pente = 4 } = {}) {
  const s = 2 * ballast / pente;
  return { largeur: longueurTraverse + s, longueur: longueur + s, elargissement: s };
}

/**
 * Charge verticale équivalente sur les remblais et pour la poussée des terres (6.3.6.4) [EN] : α·LM71 (et SW/2 si
 * requis) réparti sur 3,00 m de large à 0,70 m sous le plan de roulement, sans coefficient dynamique. kN/m².
 * Le groupe d'essieux LM71 est pris uniforme sur 6,40 m (250 kN / 1,60 m).
 */
export function surchargeRemblai(alpha = 1, avecSW2 = false, largeur = 3.0) {
  const lm = alpha * LM71.P / LM71.a / largeur;                 // 52,1 kN/m² pour α = 1
  const lmReparti = alpha * LM71.qv / largeur;                  // 26,7 kN/m² hors groupe d'essieux
  const sw2 = SW['SW/2'].q / largeur;                           // 50,0 kN/m², sans α
  return { q: avecSW2 ? Math.max(lm, sw2) : lm, lm71: lm, lm71Reparti: lmReparti, sw2, profondeur: 0.70, largeur };
}

// ---------------------------------------------------------------------------------------------------------------------
// Coefficient dynamique
// ---------------------------------------------------------------------------------------------------------------------

/** Φ2 (voie soigneusement entretenue) et Φ3 (entretien normal), éq. (6.4) et (6.5) [EN]. Φ3 par défaut (6.4.5.2(3)). */
export const phi2 = L => Math.min(Math.max(1.44 / (Math.sqrt(L) - 0.2) + 0.82, 1.00), 1.67);
export const phi3 = L => Math.min(Math.max(2.16 / (Math.sqrt(L) - 0.2) + 0.73, 1.00), 2.00);
/** Réduction pour une couverture h > 1,00 m (dessus du tablier → dessus des traverses), éq. (6.6) [EN] : Φ − (h − 1)/10 ≥ 1. */
export const reductionCouverture = (phi, h) => h > 1.0 ? Math.max(phi - (h - 1.0) / 10, 1.0) : phi;

/** Coefficient dynamique complet : Φ2 ou Φ3 selon l'entretien, réduit pour la couverture. */
export function coefficientDynamique({ LPhi, entretien = 'normal', h = 0 }) {
  if (!(LPhi > 0)) throw new Error('longueur déterminante LΦ > 0 requise');
  const brut = entretien === 'soigne' ? phi2(LPhi) : phi3(LPhi);
  return { LPhi, entretien, nom: entretien === 'soigne' ? 'Φ2' : 'Φ3', brut, h, phi: reductionCouverture(brut, h) };
}

/** Coefficient k des poutres continues sur n travées (tableau 6.2, cas 5.2) [EN] : 1,2 / 1,3 / 1,4 / 1,5 (n ≥ 5). */
export const kContinu = n => n <= 1 ? 1.0 : n === 2 ? 1.2 : n === 3 ? 1.3 : n === 4 ? 1.4 : 1.5;

/**
 * Longueur déterminante LΦ (tableau 6.2). Cas retenus (numérotation UIC 776-1, tableau 2, identique au fond à l'EN) :
 *  - 'simple'    poutres et dalles isostatiques : LΦ = portée [EN] ;
 *  - 'continue'  poutres et dalles continues sur n travées : LΦ = k·Lm ≥ max Li [EN] ; `portees` = longueurs de calcul.
 *                Portiques et cadres : même règle sur les longueurs des barres (piédroits compris) [EN] ;
 *  - 'arc'       arc unique, arc raidi, bow-string : demi-portée [EN] ;
 *  - 'voutes'    suite de voûtes à tympans pleins retenant un remblai : 2 × ouverture libre [EN] ;
 *  - 'suspentes' : 4 × espacement longitudinal des suspentes [EN] ;
 *  - 'dalle_transversale'  dalle sous ballast portant transversalement : 3 × portée de la dalle [EN] ;
 *  - 'dalle_entretoises'   dalle continue sur entretoises : 2 × espacement des entretoises [EN] ;
 *  - 'console'   console longitudinale de dalle portant la voie : 3,60 m si e ≤ 0,50 m, sinon étude spécifique [EN] ;
 *  - 'about'     entretoises d'about et chevêtres de dalle : 3,60 m [EN] ;
 *  - 'appui'     piles, palées, appareils d'appui, ancrages : LΦ des éléments portés [EN].
 * Les cas locaux (dalle, console, about) sont plafonnés à la LΦ des poutres principales si elle est fournie (`LPhiPrincipal`).
 */
export function longueurDeterminante(cas, p = {}) {
  const plafond = x => p.LPhiPrincipal > 0 ? Math.min(x, p.LPhiPrincipal) : x;
  switch (cas) {
    case 'simple': return { cas, LPhi: p.portee, regle: 'portée' };
    case 'continue': {
      const L = p.portees || [], n = L.length;
      if (!n) throw new Error('portées requises');
      const Lm = L.reduce((s, x) => s + x, 0) / n, k = kContinu(n), Lmax = Math.max(...L);
      return { cas, LPhi: Math.max(k * Lm, Lmax), k, Lm, n, regle: `k·Lm = ${k}×${Lm.toFixed(2)} ≥ max Li` };
    }
    case 'arc': return { cas, LPhi: p.portee / 2, regle: 'demi-portée' };
    case 'voutes': return { cas, LPhi: 2 * p.ouverture, regle: '2 × ouverture libre' };
    case 'suspentes': return { cas, LPhi: 4 * p.espacement, regle: '4 × espacement des suspentes' };
    case 'dalle_transversale': return { cas, LPhi: plafond(3 * p.portee), regle: '3 × portée de la dalle' };
    case 'dalle_entretoises': return { cas, LPhi: plafond(2 * p.espacement), regle: '2 × espacement des entretoises' };
    case 'console':
      if (p.e > 0.5) return { cas, LPhi: null, etudeSpecifique: true, regle: 'console > 0,50 m : étude spécifique' };
      return { cas, LPhi: plafond(3.6), regle: 'console e ≤ 0,50 m : 3,60 m' };
    case 'about': return { cas, LPhi: plafond(3.6), regle: 'entretoise d\'about : 3,60 m' };
    case 'appui': return { cas, LPhi: p.LPhiPorte, regle: 'LΦ des éléments portés' };
    default: throw new Error(`cas de longueur déterminante inconnu : ${cas}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Forces horizontales
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Coefficient réducteur f de la force centrifuge (6.5.1(8), éq. 6.19) [EN, recoupé UIC 776-1 § 2.5.1] :
 *   f = 1 − (V − 120)/1000 · (814/V + 1,75) · (1 − √(2,88/Lf)),  f = 1 si V ≤ 120 km/h ou Lf ≤ 2,88 m ;
 *   V plafonnée à 300 km/h, Lf (longueur d'influence de la partie chargée de la voie en courbe) à 150 m, f ≥ 0,35.
 * f ne s'applique qu'à LM71 et SW/0 ; SW/2 et le train à vide : f = 1.
 */
export function facteurF(V, Lf) {
  if (V <= 120 || Lf <= 2.88) return 1.0;
  const v = Math.min(V, 300), l = Math.min(Lf, 150);
  return Math.max(1 - (v - 120) / 1000 * (814 / v + 1.75) * (1 - Math.sqrt(2.88 / l)), 0.35);
}

/**
 * Force centrifuge (6.5.1(4), éq. 6.17-6.18) [EN] : Qtk = V²/(127 r) · f · Qvk ; qtk = V²/(127 r) · f · qvk.
 * Horizontale, perpendiculaire à l'axe de la voie, à 1,80 m au-dessus du plan de roulement (6.5.1(2), valeur
 * recommandée). Ni Φ. Qv, qv : charges verticales du modèle, α déjà appliqué selon le cas de charge (casCentrifuge).
 */
export function forceCentrifuge({ V, r, f = 1, Qv = 0, qv = 0 }) {
  if (!(r > 0)) return { Qt: 0, qt: 0, rapport: 0, hauteur: 1.80 };
  const k = V * V / (127 * r);
  return { Qt: k * f * Qv, qt: k * f * qv, rapport: k * f, hauteur: 1.80 };
}

/**
 * Cas de charge de la force centrifuge selon α et la vitesse de ligne (6.5.1(5)-(10), tableau 6.7) [À CONFIRMER] :
 *  - V ≤ 120 km/h : V, α, f = 1 ;
 *  - V > 120 km/h et α > 1 : (a) V, α = 1, f ; (b) 120 km/h, α, f = 1 ;
 *  - V > 120 km/h et α ≤ 1 : V, α, f.
 * Chaque cas porte le multiplicateur de la charge verticale associée (α·f) ; Φ s'applique à la verticale seulement.
 */
export function casCentrifuge(Vmax, alpha = 1, Lf = Infinity) {
  if (Vmax <= 120) return [{ V: Vmax, alpha, f: 1, verticale: alpha }];
  const f = facteurF(Vmax, Lf);
  if (alpha > 1) return [{ V: Vmax, alpha: 1, f, verticale: f }, { V: 120, alpha, f: 1, verticale: alpha }];
  return [{ V: Vmax, alpha, f, verticale: alpha * f }];
}

/**
 * Effort de lacet (6.5.2) [EN] : Qsk = 100 kN, horizontal, au sommet du rail, perpendiculaire à l'axe de la voie, toujours
 * associé à une charge verticale. Multiplié par α seulement si α ≥ 1 ; ni Φ ni f.
 */
export const effortLacet = (alpha = 1) => 100 * Math.max(alpha, 1);

/**
 * Démarrage et freinage (6.5.3) [EN] : au niveau des rails, uniformes sur la longueur d'influence La,b ; ni Φ ni f.
 *  - démarrage : 33 kN/m · La,b ≤ 1000 kN (LM71, SW/0, SW/2) ;
 *  - freinage : 20 kN/m · La,b ≤ 6000 kN (LM71, SW/0) ; 35 kN/m · La,b sans plafond (SW/2).
 * α s'applique à LM71 et SW/0 (6.5.3(4)), pas à SW/2. Au-delà de La,b = 300 m, exigences complémentaires de l'annexe
 * nationale (6.5.3(5)) : signalées par `auDela300`.
 */
export function demarrageFreinage(Lab, { modele = 'LM71', alpha = 1 } = {}) {
  const k = modele === 'SW/2' ? 1 : alpha;
  const demarrage = k * Math.min(33 * Lab, 1000);
  const freinage = modele === 'SW/2' ? 35 * Lab : k * Math.min(20 * Lab, 6000);
  return { demarrage, freinage, max: Math.max(demarrage, freinage), hauteur: 0, auDela300: Lab > 300, modele };
}

// ---------------------------------------------------------------------------------------------------------------------
// Groupes de charges (EN 1991-2, tableau 6.11) [À CONFIRMER] et coefficients de l'EN 1990, annexe A2
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Groupes de charges pour une voie chargée (gr11-gr17) ; pour deux voies, gr21-gr27 appliquent les mêmes coefficients
 * sur chacune des deux voies ; pour trois voies et plus, gr31 applique 0,75 à toutes les composantes de toutes les voies.
 * `vert` : modèle vertical et coefficient ; `lf` démarrage/freinage ; `cf` centrifuge ; `lac` lacet.
 * Notes du tableau : (4) le coefficient vertical de gr13/gr14 peut descendre à 0,5 s'il est favorable, jamais à 0 ;
 * (5) les composantes non dominantes (≠ 1) sont prises nulles quand elles sont favorables.
 */
export const GROUPES_1V = {
  gr11: { vert: { modele: 'LM71', k: 1 }, lf: 1, cf: 0.5, lac: 0.5, libelle: 'Vertical max 1 avec longitudinal max' },
  gr12: { vert: { modele: 'LM71', k: 1 }, lf: 0.5, cf: 1, lac: 1, libelle: 'Vertical max 2 avec transversal max' },
  gr13: { vert: { modele: 'LM71', k: 1, kFavorable: 0.5 }, lf: 1, cf: 0.5, lac: 0.5, libelle: 'Longitudinal max' },
  gr14: { vert: { modele: 'LM71', k: 1, kFavorable: 0.5 }, lf: 0.5, cf: 1, lac: 1, libelle: 'Transversal max' },
  gr15: { vert: { modele: 'train_vide', k: 1 }, lf: 0, cf: 1, lac: 1, libelle: 'Stabilité transversale avec train à vide' },
  gr16: { vert: { modele: 'SW/2', k: 1 }, lf: 1, cf: 0.5, lac: 0.5, libelle: 'SW/2 avec longitudinal max' },
  gr17: { vert: { modele: 'SW/2', k: 1 }, lf: 0.5, cf: 1, lac: 1, libelle: 'SW/2 avec transversal max' },
};

/** Liste des groupes applicables : nbVoies (1, 2 ou ≥ 3), SW/2 requis, train à vide (tabliers à une voie seulement). */
export function groupesApplicables({ nbVoies = 1, sw2 = false, trainVide = nbVoies === 1 } = {}) {
  const base = Object.entries(GROUPES_1V).filter(([id]) => (sw2 || !['gr16', 'gr17'].includes(id)) && (trainVide || id !== 'gr15'));
  const out = [];
  if (nbVoies <= 1) for (const [id, g] of base) out.push({ id, voies: 1, ...g });
  else {
    // deux voies chargées : gr21-gr24 = LM71 sur les deux voies ; gr26/gr27 = SW/2 sur une voie, LM71 sur l'autre
    for (const [id, g] of base) if (id !== 'gr15') {
      const v = g.vert.modele === 'SW/2' ? { ...g.vert, autreVoie: 'LM71' } : g.vert;
      out.push({ id: id.replace('gr1', 'gr2'), voies: 2, ...g, vert: v });
    }
    if (nbVoies >= 3) out.push({ id: 'gr31', voies: nbVoies, vert: { modele: 'LM71', k: 0.75 }, lf: 0.75, cf: 0.75, lac: 0.75, libelle: 'Cas complémentaires (≥ 3 voies)' });
  }
  return out;
}

/**
 * Valeur d'un groupe à partir des effets caractéristiques de chaque composante (déjà multipliés par α, Φ, f selon les
 * règles ci-dessus) : { vertical, longitudinal, centrifuge, lacet }. `favorable` : composantes favorables à l'effet
 * étudié (notes (4) et (5) du tableau 6.11). Rend l'effet combiné et le détail.
 */
export function valeurGroupe(groupe, effets, favorable = {}) {
  const kv = favorable.vertical ? (groupe.vert.kFavorable ?? groupe.vert.k) : groupe.vert.k;
  const k = (c, x) => (favorable[c] && x !== 1 ? 0 : x);
  const detail = {
    vertical: kv * (effets.vertical || 0),
    longitudinal: k('longitudinal', groupe.lf) * (effets.longitudinal || 0),
    centrifuge: k('centrifuge', groupe.cf) * (effets.centrifuge || 0),
    lacet: k('lacet', groupe.lac) * (effets.lacet || 0),
  };
  return { id: groupe.id, total: detail.vertical + detail.longitudinal + detail.centrifuge + detail.lacet, detail };
}

/**
 * Coefficients partiels du trafic ferroviaire (EN 1990, tableau A2.4(B), ensemble B) [EN, corrigendum EN 1990/A1/AC] :
 * 1,45 pour LM71, SW/0, HSLM, trains réels et groupes 11 à 31 ; 1,20 pour SW/2 et les groupes 16, 17, 26, 27 ;
 * 0 si favorable ; 1,50 pour les autres actions dues au trafic. Ensemble A (équilibre, A2.4(A)) : 1,45. Ensemble C : 1,25.
 * ELS : 1,00.
 */
export const GAMMA = { LM71: 1.45, 'SW/0': 1.45, HSLM: 1.45, 'SW/2': 1.20, groupe: 1.45, groupeSW2: 1.20, autres: 1.50, equilibre: 1.45, ensembleC: 1.25, ELS: 1.00, favorable: 0 };
export const gammaGroupe = id => (['gr16', 'gr17', 'gr26', 'gr27'].includes(id) ? GAMMA.groupeSW2 : GAMMA.groupe);

/**
 * Coefficients ψ des ponts ferroviaires (EN 1990, tableau A2.3) [À CONFIRMER, sauf ψ1 selon le nombre de voies : EN] :
 * groupes gr11-gr17 : ψ0 0,80, ψ1 0,80, ψ2 0 ; gr21-gr27 : ψ1 0,70 ; gr31 : ψ1 0,60.
 * Composantes isolées : LM71 et SW/0 ψ0 0,80, ψ1 0,80/0,70/0,60 (1/2/≥3 voies), ψ2 0 ; SW/2 0 / 1,00 / 0 ;
 * train à vide ψ0 1,00 ; lacet 1,00 / 0,80 / 0 ; démarrage-freinage et centrifuge : ceux de la charge verticale associée ;
 * poussée due à la surcharge de trafic 0,80 / 0,50 / 0. Pour les déformations en combinaison quasi permanente,
 * ψ2 = 1,00 pour le trafic ferroviaire (note 4 du tableau). Valeur minimale de la charge verticale favorable concomitante
 * à la force centrifuge, au démarrage ou au freinage : 0,5·LM71 (note 5).
 */
export function psi(action, nbVoies = 1) {
  const p1 = nbVoies <= 1 ? 0.80 : nbVoies === 2 ? 0.70 : 0.60;
  if (/^gr/.test(action)) return { psi0: 0.80, psi1: action === 'gr31' ? 0.60 : /^gr2/.test(action) ? 0.70 : 0.80, psi2: 0 };
  switch (action) {
    case 'LM71': case 'SW/0': return { psi0: 0.80, psi1: p1, psi2: 0 };
    case 'SW/2': return { psi0: 0, psi1: 1.00, psi2: 0 };
    case 'train_vide': return { psi0: 1.00, psi1: null, psi2: null };
    case 'lacet': return { psi0: 1.00, psi1: 0.80, psi2: 0 };
    case 'poussee_trafic': return { psi0: 0.80, psi1: 0.50, psi2: 0 };
    default: throw new Error(`ψ inconnu pour ${action}`);
  }
}

/** Valeurs reprises sans recoupement d'un texte accessible : à relire sur l'exemplaire de la norme. */
export const A_CONFIRMER = [
  'EN 1991-2, tableau 6.11 : coefficients des groupes gr11 à gr31 et leurs notes (4) et (5).',
  'EN 1991-2, 6.5.1 et tableau 6.7 : cas de charge de la force centrifuge selon α et la vitesse (α > 1 et V > 120 km/h).',
  'EN 1990, tableau A2.3 : coefficients ψ0 et ψ2 des groupes et des composantes isolées.',
  'Hauteur d\'application de la force centrifuge (1,80 m) et α : paramètres d\'annexe nationale.',
];

/** Notes standard à reporter dans les notes de calcul. */
export function notesReferentiel({ alpha = 1, entretien = 'normal' } = {}) {
  return [
    MENTION,
    `α = ${alpha.toFixed(2).replace('.', ',')}${estAlphaNormalise(alpha) ? '' : ' (hors liste 6.3.2(3)P)'} ; coefficient dynamique ${entretien === 'soigne' ? 'Φ2 (voie soigneusement entretenue)' : 'Φ3 (entretien normal, valeur par défaut de l\'EN 1991-2)'}.`,
  ];
}
