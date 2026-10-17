/**
 * Culées : mur garde-grève, murs en retour suspendus, poussée des terres sur le mur de front ou les colonnes d'une culée
 * enterrée, descente de charges. Règles de pratique du dossier pilote SETRA PP73 (pièce 1.3.2) et du Fascicule 61 —
 * formules usuelles reproduites de la littérature de pratique (TODO_VERIF : à relire sur le texte de PP73).
 * Unités : m, kN, kN·m.
 */

/** Coefficient de poussée active de Rankine (talus horizontal, mur lisse) et au repos de Jaky. */
export const Ka = phiDeg => Math.tan(Math.PI / 4 - (phiDeg * Math.PI / 180) / 2) ** 2;
export const K0 = phiDeg => 1 - Math.sin(phiDeg * Math.PI / 180);

/** Épaisseur conseillée du garde-grève (PP73) : 0,30 m (h ≤ 1 m), h/8 + 0,175 (1 < h ≤ 2 m), 0,40 m au-delà. TODO_VERIF */
export function gardeGreveThickness(h) { return h <= 1 ? 0.30 : h <= 2 ? h / 8 + 0.175 : 0.40; }

/**
 * Moments d'encastrement du garde-grève par mètre (PP73 1.3.2, Fascicule 61) [kN·m/m] :
 *   poussée des terres M_t = K γ h³/6 ;
 *   poussée d'une charge locale (essieu Bc derrière le mur, roues de 60 kN, diffusion à 45°) :
 *     M_p = 12 K'/(0,75 + 2h) ∫₀ʰ (h − x)/(0,25 + x) dx [t·m/m], K' = K·bc·δ ;
 *   freinage d'une roue de 60 kN au contact : M_f = 6 h/(0,25 + 2h) [t·m/m].
 * Pondérations : ELS 1,0 M_t + 1,2 (M_p + M_f) ; ELU 1,35 M_t + 1,6 (M_p + M_f). TODO_VERIF
 */
export function gardeGreve({ h, K = 0.33, gamma = 20, bc = 1.1, delta = 1 }) {
  const Mt = K * gamma * h ** 3 / 6;
  const integ = (h + 0.25) * Math.log((0.25 + h) / 0.25) - h;            // ∫₀ʰ (h − x)/(0,25 + x) dx
  const Mp = 10 * 12 * K * bc * delta / (0.75 + 2 * h) * integ;
  const Mf = 10 * 6 * h / (0.25 + 2 * h);
  return { Mt, Mp, Mf, ELS: Mt + 1.2 * (Mp + Mf), ELU: 1.35 * Mt + 1.6 * (Mp + Mf), e: gardeGreveThickness(h) };
}

/**
 * Mur en retour suspendu (PP73) de longueur L et de hauteur h à l'encastrement, épaisseur e : charges conventionnelles
 * (poids propre, superstructures 3 kN/m, 40 kN verticaux et 20 kN horizontaux à l'extrémité, poussée uniforme
 * (h/3 + 0,5) t/m² sur la surface L·h/2). TODO_VERIF
 */
export function murEnRetour({ L, h, e = null }) {
  const ee = e ?? Math.max(0.30, (L + 2) / 20);
  const Tv = 25 * ee * L * h / 2 + 3 * L + 40, Mv = 25 * ee * L ** 2 * h / 6 + 3 * L ** 2 / 2 + 40 * L;
  const p = 10 * (h / 3 + 0.5), Th = p * L * h / 2 + 20, Mh = p * L ** 2 * h / 6 + 20 * L;
  return { e: ee, Tv, Mv, Th, Mh };
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
