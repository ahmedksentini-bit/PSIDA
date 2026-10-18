/**
 * Culées : mur garde-grève, murs en retour suspendus, poussée des terres sur le mur de front ou les colonnes d'une culée
 * enterrée, descente de charges. Règles du dossier pilote SETRA PP73 pièce 1.3.2 (« Calculs complémentaires —
 * ferraillages types »), relues sur le texte (§ 2.3 garde-grève, § 3.4 murs en retour, § 2.2.2.4 murettes).
 * Unités : m, kN, kN·m.
 */

/** Coefficient de poussée active de Rankine (talus horizontal, mur lisse) et au repos de Jaky. */
export const Ka = phiDeg => Math.tan(Math.PI / 4 - (phiDeg * Math.PI / 180) / 2) ** 2;
export const K0 = phiDeg => 1 - Math.sin(phiDeg * Math.PI / 180);

/**
 * Épaisseur du garde-grève, ferraillages types PP73 1.3.2 § 2.3.1 (h < 3 m, dalle de transition indépendante, joint non
 * poussant) : 0,20 m (h ≤ 1 m), 0,10 + 0,10 h (1 < h ≤ 2 m), 0,30 m (2 < h ≤ 3 m) ; au-delà de 3 m : hors domaine (calcul).
 */
export function gardeGreveThickness(h, dalleSurGG = false) {
  const e = h <= 1 ? 0.20 : h <= 2 ? 0.10 + 0.10 * h : 0.30;
  return dalleSurGG ? Math.max(0.30, e) : e;     // PP73 1.1.3 § 2.4.3.2 : 0,30 m si la dalle de transition s'appuie sur le garde-grève
}

/**
 * Moments d'encastrement du garde-grève par mètre (PP73 1.3.2, Fascicule 61) [kN·m/m] :
 *   poussée des terres M_t = K γ h³/6 ;
 *   poussée d'une charge locale (essieu Bc derrière le mur, roues de 60 kN, diffusion à 45°) :
 *     M_p = 12 K'/(0,75 + 2h) ∫₀ʰ (h − x)/(0,25 + x) dx [t·m/m], K' = K·bc·δ ;
 *   freinage d'une roue de 60 kN au contact : M_f = 6 h/(0,25 + 2h) [t·m/m].
 * PP73 1.3.2 § 2.3.2.2 inclut γ = 1,2 dans K (K = i γ δ b_c = 0,396) : ici γ est appliqué dans la combinaison, ce qui
 * redonne le tableau du § 2.3.3 (total 3,8 à 9,9 t·m/m pour h = 0,5 à 3 m). Pondérations : ELS 1,0 M_t + 1,2 (M_p + M_f)
 * (sollicitations du 1er genre de PP73) ; ELU 1,35 M_t + 1,6 (M_p + M_f) (transposition BAEL).
 * Moment de sens opposé (face avant, freinage minoré de la poussée) : M' = −3,2 t·m/m quelle que soit h (§ 2.3.3).
 * Domaine des ferraillages types : h ≤ 3 m.
 */
export function gardeGreve({ h, K = 0.33, gamma = 20, bc = 1.1, delta = 1, dalleSurGG = false }) {
  const Mt = K * gamma * h ** 3 / 6;
  const integ = (h + 0.25) * Math.log((0.25 + h) / 0.25) - h;            // ∫₀ʰ (h − x)/(0,25 + x) dx
  const Mp = 10 * 12 * K * bc * delta / (0.75 + 2 * h) * integ;
  const Mf = 10 * 6 * h / (0.25 + 2 * h);
  return { Mt, Mp, Mf, ELS: Mt + 1.2 * (Mp + Mf), ELU: 1.35 * Mt + 1.6 * (Mp + Mf), Mrev: 32, Mapprox: 25 * (h + 1), e: gardeGreveThickness(h, dalleSurGG), horsDomaine: h > 3 };
}

/**
 * Mur en retour suspendu, PP73 1.3.2 § 3.4 : longueur ℓ, hauteur h à l'encastrement, épaisseur e ; poids propre (surface
 * triangulaire ℓh/2), superstructures 0,3 t/m, charges concentrées à 1 m de l'extrémité théorique : 4 tf verticale et
 * 2 tf horizontale ; poussée uniforme (h/3 + 0,5) t/m² sur ℓh/2 (γ = 2 t/m³, p = 1 t/m², K₀ = 0,5) ;
 *   T = 2,5 (ℓh/2) e + 0,3 ℓ + 4, M_V = 2,5 (ℓ²h/6) e + 0,3 ℓ²/2 + 4 (ℓ − 1) ;
 *   H = (h/3 + 0,5) ℓh/2 + 2, M_H = (h/3 + 0,5) ℓ²h/6 + 2 (ℓ − 1) — M_V et M_H non concomitants.
 * Épaisseur approchée e = (ℓ + 2)/20 pour 2 ≤ ℓ ≤ 6 m, minimum 0,20 m ; aciers ≥ 2 cm²/ml par face et par direction.
 * Murettes de piles-culées noyées (ℓ ≤ 2,5 m, § 2.2.2.4) : 5 tf verticale ou 3 tf horizontale à 1 m de l'extrémité.
 */
export function murEnRetour({ L, h, e = null }) {
  const ee = e ?? Math.max(0.20, (L + 2) / 20);
  const murette = L <= 2.5, PV = murette ? 50 : 40, PH = murette ? 30 : 20, arm = Math.max(0, L - 1);
  const Tv = 25 * ee * L * h / 2 + 3 * L + PV, Mv = 25 * ee * L ** 2 * h / 6 + 3 * L ** 2 / 2 + PV * arm;
  const p = 10 * (h / 3 + 0.5), Th = p * L * h / 2 + PH, Mh = p * L ** 2 * h / 6 + PH * arm;
  return { e: ee, Tv, Mv, Th, Mh, murette, Amin: 2e-4, horsDomaine: L > 6 };
}

/**
 * Poussée des terres et de la surcharge de remblai sur un écran de hauteur H et de largeur B (mur de front), ou sur des
 * colonnes (largeur fictive b_f = min(3D ; entraxe) par colonne) : résultantes et moments à la base [kN, kN·m].
 */
export function earthPressure({ H, B, K = 0.33, gamma = 20, q = 10 }) {
  const Pg = K * gamma * H ** 2 / 2 * B, Pq = K * q * H * B;
  return { Pg, Pq, Mg: Pg * H / 3, Mq: Pq * H / 2 };
}

/**
 * Dalle de transition (guide SETRA 1984, pratique) : longueur min(6 ; max(3 ; 0,6 H_r)), réaction linéique sur le corbeau
 * (demi-poids de la dalle, du remblai et de la chaussée + roue Bc de 60 kN répartie). TODO_VERIF
 */
export function dalleTransition({ Hr, e = 0.30, hRemblai = 0.6, gamma = 20 }) {
  const L = Math.min(6, Math.max(3, 0.6 * Hr));
  const g = 25 * e + gamma * hRemblai;
  return { L, Rg: g * L / 2, Rq: 60 / 1.0 };
}

/**
 * Poussée sur une pile-culée apparente, PP73 1.3.2 § 3.1.3.1 a : uniquement sur la partie supérieure (voile frontal,
 * chevêtre, garde-grève) de hauteur h₁, la poussée sur la partie inférieure des poteaux étant négligée (compensée par la
 * butée du talus) : Q = i h₁ (p + γ h₀ + 0,5 γ h₁) L, i = 1/3 (cas courants), p = 1,5 t/m², appliquée aux 6/10 de h₁
 * depuis le haut. Renvoie les parts « terres » (G) et « surcharge » (Q) et leur bras au-dessus de la base des colonnes.
 */
export function earthPressureUpper({ h1, Htot, L, i = 1 / 3, gamma = 20, p = 15, h0 = 0 }) {
  const Pg = i * h1 * (gamma * h0 + 0.5 * gamma * h1) * L, Pq = i * h1 * p * L, arm = Htot - 0.6 * h1;
  return { Pg, Pq, Mg: Pg * arm, Mq: Pq * arm, arm, h1, i, p };
}

/**
 * Pile-culée sans tablier (PP73 1.3.2 § 3.1.4.6) : remblai mis en place avant la pose du tablier — poids propre seul
 * (favorable, γ = 1), poussée des terres et surcharge de remblai défavorables.
 */
export function videCombos({ W, ep, code }) {
  const gq = code === 'BAEL' ? [1.605, 1.2] : [1.5, 1.0];
  return [
    { label: 'ELU à vide (sans tablier) : 1,0 G + 1,35 poussée + γ_Q surcharge', ls: 'ELU', N: 0, H: 0, Hy: 0, Nb: W, Hb: 1.35 * ep.Pg + gq[0] * ep.Pq, Mb: 1.35 * ep.Mg + gq[0] * ep.Mq, vide: true },
    { label: 'ELS à vide (sans tablier) : G + poussée + surcharge', ls: 'ELS', N: 0, H: 0, Hy: 0, Nb: W, Hb: ep.Pg + gq[1] * ep.Pq, Mb: ep.Mg + gq[1] * ep.Mq, vide: true },
  ];
}
