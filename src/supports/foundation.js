/**
 * Fondations des appuis : semelles superficielles (portance pressiométrique, excentrement, glissement), semelles sur
 * pieux (méthode des bielles), groupe de pieux (efforts en tête), module de réaction de Ménard, portance des pieux,
 * ferraillage minimal des pieux.
 *
 * Références : Fascicule 62 titre V (1993) ; NF P 94-261 (2013) et guide Cerema 2015 (tableau des k_p, facteurs partiels) ;
 * NF P 94-262 ; SETRA FOND 72 et PP73 (bielles) ; note des appuis du Pont de Noé (reproduite : Ménard, pieux, bielles).
 * Les valeurs marquées TODO_VERIF sont à relire sur les textes (non accessibles lors de l'écriture).
 * Unités : m, kN, kPa (kN/m²), MPa.
 */

import { kpF62, kpEC7, KP_EC7, idbF62, idEC7, pleF62, pleEC7, hrEC7, De as DeProfil, diagramme, surfaceComprimeeF62, portanceF62, excentrementEC7, portanceEC7, glissementF62, glissementEC7 } from '../geotech/superficielles.js';
import { pieuF62, valeursLimitesEC7, modeleTerrain } from '../geotech/pieux.js';
import { CLASSES_F62 } from '../geotech/sols.js';
import { converseLabarre, efficaciteCoherentF62, efficaciteEC7, verifGroupeF62, verifGroupeEC7 } from '../geotech/groupes.js';
export { converseLabarre, efficaciteCoherentF62, efficaciteEC7, verifGroupeF62, verifGroupeEC7 };

/** Famille F62 (« sable-B ») → catégorie NF P 94-261/262 (« sable »). */
export const categoryOf = classe => String(classe || 'sable-B').split('-')[0];
export const isCohesive = classe => (CLASSES_F62[classe] ? CLASSES_F62[classe].cohérent : false);

/**
 * Profil pressiométrique par couches (profondeurs depuis le terrain naturel) :
 * [{ z0, z1, classe (F62 : « sable-B »…), pl (p*_l, MPa), EM (MPa), alpha (Ménard) }]. Couche la plus profonde prolongée.
 */
export function soilProfile(layers) {
  const L = [...layers].sort((a, b) => a.z0 - b.z0).map(l => ({ ...l, sol: l.sol || categoryOf(l.classe) }));
  if (!L.length) throw new Error('Profil pressiométrique vide.');
  const at = z => L.find(l => z >= l.z0 && z < l.z1) ?? (z < L[0].z0 ? L[0] : L[L.length - 1]);
  return { layers: L, at, fn: z => Math.max(at(z).pl, 1e-3), ruptures: [...new Set(L.flatMap(l => [l.z0, l.z1]))] };
}

/** k_p NF P 94-261 (tableau D.2.3, interpolation en B/L, D_e/B plafonné à 2) — module geotech du dépôt « fondation ». */
export const KP_261 = KP_EC7;
export function kp261({ soil = 'sable', De, B, L }) {
  return kpEC7({ categorie: soil.replace(/s$/, ''), B, L, forme: B / L >= 1 - 1e-9 ? 'carree' : 'rectangulaire', De }).k;
}
/** i_δ NF P 94-261 (D.2.4.1 à D.2.4.3), δ en radians. */
export const iDeltaCohesive = delta => idEC7({ sol: 'coherent', delta: delta * 180 / Math.PI, B: 1, De: 0 }).i;
export const iDeltaFrictional = (delta, DeB) => idEC7({ sol: 'frottant', delta: delta * 180 / Math.PI, B: 1, De: DeB }).i;

/**
 * Semelle superficielle rectangulaire B × L sous (V, H, M_B) [kN, kN·m], excentrement selon B.
 * EC (NF P 94-261, guide Cerema 2015) : k_p (D.2.3), i_δ (D.2.4), surface effective A' = A(1 − 2e/B), R_v;d = A' i_e q_net/(γ_R;v γ_R;d;v)
 *   avec γ_R;v = 1,4 (ELU) / 2,3 (ELS), γ_R;d;v = 1,2, R₀ = A q₀ déduit ; excentrement 1 − 2e/B ≥ 1/15 (ELU), 1/2 (ELS car.) ;
 *   glissement (ELU) R_h;d = V tan φ'/(γ_R;h γ_R;d;h), γ_R;h = 1,1, γ_R;d;h = 1,1.
 * BAEL (Fascicule 62 titre V, annexes B.1, B.2, F.1) : k_p = k₀[1 + a(0,6 + 0,4 B/L) D_e/B] selon la classe de sol,
 *   q'_ref = (3 q_max + q_min)/4 ≤ i_δβ k_p p*_le/γ_q + q'₀, γ_q = 2 (ELU) / 3 (ELS rares) ; surface comprimée ≥ 10 % (ELU),
 *   75 % (ELS rares) ; glissement H ≤ V tan φ'/1,2 + c' A'/1,5.
 * @param {object} p classe F62 du sol (« sable-B »…), ple p*_le [MPa], q0 contrainte effective au niveau de la base [kPa]
 */
export function shallowFooting({ code = 'EC', B, L, D = 1, V, H = 0, M = 0, ls = 'ELU', classe = 'sable-B', soil = null, ple, De = null, q0 = null, phi = 30, c = 0, gamma = 20, profile = null, dAff = 0 }) {
  // dAff : profondeur affouillée sous le terrain naturel (crue) — encastrement et surcharge des terres comptés sous ce niveau
  const dA = Math.min(Math.max(0, dAff), D), e = V > 0 ? Math.abs(M) / V : 0, q0v = q0 ?? gamma * (D - dA);
  // profil pressiométrique : p*_le moyenne géométrique sur [D ; D + 1,5 B] (F62 E.2) ou [D ; D + h_r] (NF P 94-261 D.2.2,
  // h_r selon l'excentrement), D_e = (1/p*_le) ∫₀ᴰ p*_l dz, classe de la couche d'assise
  let cl = soil && !classe ? soil : classe, DeV = Math.max(0, (De ?? D) - dA);
  if (profile) {
    const hr = code === 'EC' ? hrEC7({ forme: 'rectangulaire', B, L, eB: e, etat: ls === 'ELS' ? 'ELS' : 'ELU' }) : 1.5 * B;
    ple = code === 'EC' ? pleEC7({ profil: profile, D, hr }).ple : pleF62({ profil: profile, D, B }).ple;
    DeV = dA < D ? DeProfil({ profil: profile, d: dA, D, reference: ple }) : 0;
    cl = profile.at(D + 1e-6).classe;
  }
  const delta = V > 0 ? Math.atan(Math.abs(H) / V) * 180 / Math.PI : 0;
  const sol = isCohesive(cl) ? 'coherent' : 'frottant';
  const forme = 'rectangulaire';
  if (code === 'EC') {
    const kp = kpEC7({ categorie: categoryOf(cl), B, L, forme, De: DeV }).k;
    const id = idEC7({ sol, delta, B, De: DeV }).i;
    const qnet = kp * ple * 1000 * id;
    const ex = excentrementEC7({ forme, B, L, eB: e });
    const etat = ls === 'ELU' ? 'ELU' : ls === 'ACC' ? 'ELU_acc' : 'ELS_car';
    const exEtat = ls === 'ACC' ? 'ELU' : etat;
    if (!ex.applicable) return { e, kp, idelta: id, qnet, ratioV: Infinity, ratioH: Infinity, excOk: false, motif: ex.motif };
    const pv = portanceEC7({ A: B * L, ie: ex.ie, qnet, q0: q0v, Vd: V, etat });
    const gl = ls !== 'ELS' ? glissementEC7({ Vd: V, Hd: Math.abs(H), phiCrit: phi, etat: ls === 'ACC' ? 'ELU_acc' : 'ELU' }) : null;
    return { e, ple, De: DeV, classe: cl, Bp: ex.Bprime, Ap: ex.Aprime, kp, idelta: id, qnet, Rvd: pv.Rvd, R0: pv.R0, ratioV: pv.taux, Rhd: gl ? gl.Rhd : null, ratioH: gl ? gl.taux : 0, excOk: ex[exEtat].ok, crit: ex.critere };
  }
  const kp = kpF62({ classe: cl, B, L, forme, De: Math.min(DeV, 2.5 * B) }).k;   // F62 B.1 : D_e/B ≤ 2,5 (au-delà : semi-profonde)
  const idb = idbF62({ sol, delta, B, De: DeV }).i;
  const dg = diagramme({ forme, B, L, V, e });
  if (!dg.applicable) return { e, kp, idelta: idb, ratioV: Infinity, ratioH: Infinity, excOk: false, compressed: 0, motif: dg.motif };
  const etat = ls === 'ELU' ? 'ELU' : ls === 'ACC' ? 'ELU_acc' : 'ELS_rare';
  const pf = portanceF62({ qnette: kp * ple * 1000, q0: q0v, idb, qref: dg.qrefTrapeze, etat });
  const sc = surfaceComprimeeF62({ B, e, etat: ls === 'ACC' ? 'ELU' : etat });
  const gl = ls !== 'ELS' ? glissementF62({ Vd: V, Hd: Math.abs(H), phi, c, Aprime: dg.Bc * L }) : null;   // glissement vérifié à l'ELU
  return { e, ple, De: DeV, classe: cl, kp, idelta: idb, qmax: dg.qmax, qmin: dg.qmin, qref: dg.qrefTrapeze, qadm: pf.qadm, ratioV: pf.taux, Rhd: gl ? gl.R : null, ratioH: gl ? gl.taux : 0, compressed: dg.fraction, excOk: sc.ok };
}

/**
 * Semelle sur deux files de pieux, méthode des bielles (PP73 pièce 1.3.2 § 4.3.2) : tirant inférieur PAR COUPLE de pieux
 * situés de part et d'autre du fût de largeur b, entraxe l, hauteur utile h : A₁ = R/σ̄_a · (l/2 − b/4)/h, R = réaction la
 * plus élevée des deux pieux du couple. (La note du Pont de Noé applique la charge totale de la semelle, 601,6 t, au lieu
 * de la réaction d'un pieu, 100,04 t : 501,5 cm² au lieu de 82,97 cm² par couple.)
 */
export function pileCapStrutTie({ R, l, b, h, sigS }) { return R / (sigS * 1000) * (l / 2 - b / 4) / h; }

/** Contrainte limite des aciers BAEL 91 A.4.5,33/34 : FP min(2/3 f_e ; max(0,5 f_e ; 110 √(η f_tj))), FTP 0,8 × FP [MPa]. */
export function sigmaSBAEL({ fe = 400, fc28 = 25, eta = 1.6, fiss = 'FTP' }) {
  const ft = 0.6 + 0.06 * fc28, fp = Math.min(2 / 3 * fe, Math.max(0.5 * fe, 110 * Math.sqrt(eta * ft)));
  return fiss === 'FTP' ? 0.8 * fp : fp;
}

/**
 * Semelle sur deux files de pieux (PP73 1.3.2 ch. 4) : tirant par couple à l'ELU (f_su) et à l'ELS (σ̄_s), domaine de la
 * méthode (bielles inclinées à 45° au moins : h ≥ l/2 − b/4 ; sinon calcul en dalle, § 4.7.4), hauteur minimale
 * max(0,60 m ; 1,4 Ø) (pratique), A₁ réparti sur une bande Ø + h_s au droit des pieux, armatures de répartition A'₁ et
 * longitudinales A₂ ≥ 1/3 de la densité de A₁, ancrage aux pieux de rive ≥ 0,8 R/σ̄, poinçonnement du pieu d'angle
 * R ≤ (2/3)(h + Ø) h σ₂₈ (σ₂₈ = 2 MPa).
 */
export function pileCapTwoRows({ RU, RS, l, b, hs, D, fsu, sigSels, cover = 0.10 }) {
  const h = hs - cover, arm = l / 2 - b / 4;
  const A1U = pileCapStrutTie({ R: RU, l, b, h, sigS: fsu }), A1S = pileCapStrutTie({ R: RS, l, b, h, sigS: sigSels });
  const A1 = Math.max(A1U, A1S), band = D + hs, dens = A1 / band;
  const theta = Math.atan2(h, arm) * 180 / Math.PI, hmin = Math.max(0.6, 1.4 * D);
  const Rpunch = (2 / 3) * (h + D) * h * 2000;
  return { h, A1U, A1S, A1, band, dens, A1prime: dens / 3, A2: dens / 3, Aanchor: 0.8 * RS / (sigSels * 1000), theta, thetaOk: theta >= 45 - 1e-9, hmin, hOk: hs >= hmin - 1e-9, Rpunch, punchOk: RS <= Rpunch };
}

/** Semelle superficielle par bielles (BAEL / DTU 13.12) : A = N (B − b)/(8 d f_su) par direction (charge centrée ; domaine d ≥ (B − b)/4, e ≤ B/6) ; minimum 0,12 % par nappe (PP73 1.1.1). */
export function footingStrutTie({ N, B, b, d, fsu }) { return N * (B - b) / (8 * d * fsu * 1000); }

/**
 * Efforts dans les pieux d'un groupe sous semelle rigide : N_k = N/n ± (M − n·M_tête)·x_k/Σx², H partagé également.
 * @param {number[]} xs abscisses des pieux par rapport au centre de la semelle (une valeur par pieu)
 */
export function pileGroupForces({ N, M, H = 0, xs, Mhead = 0 }) {
  const n = xs.length, sx2 = xs.reduce((a, x) => a + x * x, 0);
  const Mr = M - n * Mhead;
  return { N: xs.map(x => N / n + (sx2 > 0 ? Mr * x / sx2 : 0)), H: H / n };
}

/**
 * Module de réaction frontal de Ménard (Fascicule 62 V annexe C.5 ; NF P 94-262 annexe I) : B₀ = 0,60 m,
 * E_s = 12 E_M / [(4/3)(B₀/B)(2,65 B/B₀)^α + α] (B ≥ B₀), 12 E_M / [(4/3)(2,65)^α + α] (B < B₀) ; k = E_s/B.
 * Noé : E_M = 1800 t/m², α = 0,66 → k = 6756 t/m³ (Ø 1,20) et 9120 t/m³ (Ø 0,80).
 */
export function menardReaction({ EM, alpha, B, B0 = 0.6 }) {
  const Es = B >= B0 ? 12 * EM / ((4 / 3) * (B0 / B) * (2.65 * B / B0) ** alpha + alpha) : 12 * EM / ((4 / 3) * 2.65 ** alpha + alpha);
  // Es ci-dessus = module de courte durée (2 × E_s du F62 C.5 : 18 E_M/[4(B₀/B)(2,65 B/B₀)^α + 3α]) ; longue durée : moitié
  return { Es, k: Es / B, kLong: Es / (2 * B) };
}

/**
 * Béton des pieux (Fascicule 62 titre V C.5.4 ; BAEL annexe) : f_c = min(f_cj ; f_c28 ; f_lim)/(k₁ k₂),
 * k₁ = 1,20 foré simple ou boue, 1,10 foré tubé bétonné à sec, 1,15 préfabriqué battu (f_lim 30 MPa, 25 sinon) ;
 * k₂ = 1,05 si D/L < 1/20, 1,30 − D/2 si D < 0,60 m, 1,35 − D/2 si les deux, 1,00 sinon ; E_i = 11 000 f_c^(1/3).
 */
export function pileConcrete({ fc28 = 25, D, L, type = 'fore-boue' }) {
  const prefab = /battu|metal/.test(type), tube = /tube/.test(type);
  const k1 = prefab ? 1.15 : tube ? 1.10 : 1.20, flim = prefab ? 30 : 25;
  const slim = D / L < 1 / 20, small = D < 0.6;
  const k2 = slim && small ? 1.35 - D / 2 : small ? 1.30 - D / 2 : slim ? 1.05 : 1.0;
  const fc = Math.min(fc28, flim) / (k1 * k2);
  return { k1, k2, fc, Ei: 11000 * fc ** (1 / 3) };
}

/**
 * Pieu sous effort horizontal et moment en tête (poutre de Winkler, différences finies), tête libre ou encastrée, pied libre.
 * @returns {{y0, theta0, Mmax, M, z, flexHead}} déplacement et rotation en tête, moment maximal, profil des moments
 */
export function lateralPile({ L, D, E, k, H, M0 = 0, n = 200, fixedHead = false }) {
  // k [kN/m³] constant ou fonction de la profondeur z sous la tête (sol en couches) → ressort linéique k·D [kN/m²]
  const I = Math.PI * D ** 4 / 64, EI = E * 1000 * I, h = L / n, kOf = typeof k === 'function' ? k : () => k;
  // inconnues y_0..y_n ; EI y'''' + k D y = 0 ; conditions : tête M = −EI y'' = M0 (ou y' = 0), V = −EI y''' = H ; pied M = V = 0
  const N = n + 1, A = Array.from({ length: N + 4 }, () => new Float64Array(N + 4)), rhs = new Float64Array(N + 4);
  const idx = i => i + 2; // nœuds fictifs −2, −1, n+1, n+2
  for (let i = 0; i <= n; i++) {
    const r = idx(i);
    A[r][idx(i - 2)] += EI / h ** 4; A[r][idx(i - 1)] += -4 * EI / h ** 4; A[r][idx(i)] += 6 * EI / h ** 4 + kOf(i * h) * D; A[r][idx(i + 1)] += -4 * EI / h ** 4; A[r][idx(i + 2)] += EI / h ** 4;
  }
  // tête : V = −EI y''' = H (signe : H pousse vers +y), M : −EI y'' = M0 ou y' = 0
  A[0][idx(-2)] = -1; A[0][idx(-1)] = 2; A[0][idx(1)] = -2; A[0][idx(2)] = 1; rhs[0] = -2 * h ** 3 * H / EI * -1;
  if (fixedHead) { A[1][idx(-1)] = -1; A[1][idx(1)] = 1; rhs[1] = 0; } else { A[1][idx(-1)] = 1; A[1][idx(0)] = -2; A[1][idx(1)] = 1; rhs[1] = -M0 * h ** 2 / EI; }
  // pied : y'' = 0, y''' = 0
  A[N + 2][idx(n - 1)] = 1; A[N + 2][idx(n)] = -2; A[N + 2][idx(n + 1)] = 1;
  A[N + 3][idx(n - 2)] = -1; A[N + 3][idx(n - 1)] = 2; A[N + 3][idx(n + 1)] = -2; A[N + 3][idx(n + 2)] = 1;
  // élimination de Gauss avec pivot partiel
  const m = N + 4, Mx = A.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[p][c])) p = r;
    [Mx[c], Mx[p]] = [Mx[p], Mx[c]];
    const pv = Mx[c][c]; if (Math.abs(pv) < 1e-30) continue;
    for (let r = 0; r < m; r++) { if (r === c) continue; const f = Mx[r][c] / pv; if (f) for (let k2 = c; k2 <= m; k2++) Mx[r][k2] -= f * Mx[c][k2]; }
  }
  const y = Array.from({ length: m }, (_, i) => Mx[i][m] / Mx[i][i]);
  const yy = i => y[idx(i)];
  const Mz = Array.from({ length: n + 1 }, (_, i) => -EI * (yy(i - 1) - 2 * yy(i) + yy(i + 1)) / h ** 2);
  return { y0: yy(0), theta0: (yy(1) - yy(-1)) / (2 * h), M: Mz, z: Mz.map((_, i) => i * h), Mmax: Math.max(...Mz.map(Math.abs)), flexHead: H ? yy(0) / H : null };
}

/** Section minimale d'armatures des pieux forés : BAEL/DTU 13.2 0,5 % ; NF EN 1536 : 0,5 % (A ≤ 0,5 m²), 25 cm² (≤ 1 m²), 0,25 % au-delà. */
export function pileMinSteel({ D, code = 'BAEL' }) {
  const A = Math.PI * D ** 2 / 4;
  if (code === 'BAEL') return 0.005 * A;
  return A <= 0.5 ? 0.005 * A : A <= 1 ? 25e-4 : 0.0025 * A;
}

/** Types de pieux : Fascicule 62 (annexe C.3) ↔ catégorie NF P 94-262 (annexe A). */
export const PILE_TYPES = {
  'fore-simple': { cat: 1, label: 'foré simple' }, 'fore-boue': { cat: 2, label: 'foré boue' },
  'fore-tube-perdu': { cat: 3, label: 'foré tubé (virole perdue)' }, 'fore-tube-recupere': { cat: 4, label: 'foré tubé (virole récupérée)' },
  'battu-prefabrique': { cat: 9, label: 'battu béton préfabriqué' }, 'battu-moule': { cat: 11, label: 'battu moulé' }, 'metal-battu-ferme': { cat: 12, label: 'battu acier fermé' },
};

/**
 * Portance axiale d'un pieu par la méthode pressiométrique (sol homogène p*_l sur toute la hauteur, ou couches) :
 * Fascicule 62 titre V annexe C.3 (k_p, courbes Q1 à Q7, Q_c = 0,5 Q_pu + 0,7 Q_su — 0,7 pour les pieux refoulants ;
 * Q ≤ Q_u/1,4 ELU, Q_c/1,1 ELS rares, traction Q_tu/1,4, Q_tc/1,4) ; NF P 94-262 (modèle de terrain : k_p(D_ef/B), α f_sol,
 * γ_R;d1 γ_R;d2, puis γ_t = 1,1 à l'ELU et charge de fluage/0,9 à l'ELS caractéristique).
 */
export function pileCapacity({ code = 'EC', type = 'fore-simple', D, Lpile, classe = 'sable-B', ple, layers = null, profile = null, Dhead = 0 }) {
  // profil : couches depuis le terrain naturel, pieu de la tête (profondeur Dhead, sous la semelle) à la pointe Dhead + L ;
  // le frottement est compté à partir de la tête (zf = Dhead)
  const couches = profile ? profile.layers.map(l => ({ ...l, z1: l === profile.layers[profile.layers.length - 1] ? Math.max(l.z1, Dhead + Lpile + 10) : l.z1 }))
    : layers ?? [{ z0: 0, z1: Lpile + 10, classe, sol: categoryOf(classe), pl: ple }];
  const Dtip = (profile ? Dhead : 0) + Lpile, zf = profile ? Dhead : 0;
  if (code === 'EC') {
    const lim = valeursLimitesEC7({ methode: 'pressio', cat: (PILE_TYPES[type] || PILE_TYPES['fore-simple']).cat, B: D, D: Dtip, couches, zf });
    if (!lim.applicable) return { applicable: false, motif: lim.motif };
    const mt = modeleTerrain(lim);
    return { applicable: true, Rb: lim.Rb, Rs: lim.Rs, Rcd: mt.calcul.ELU.Rcd, RcdAcc: mt.calcul.ELU_acc.Rcd, Rcrd: mt.calcul.ELS_car.Rccrd, Rtd: mt.calcul.ELU.Rtd, detail: mt };
  }
  const r = pieuF62({ methode: 'pressio', type, B: D, D: Dtip, couches, zf });
  if (!r.applicable) return { applicable: false, motif: r.motif };
  return { applicable: true, Rb: r.Qpu, Rs: r.Qsu, Rcd: r.limites.ELU.Qmax, RcdAcc: r.limites.ELU_acc.Qmax, Rcrd: r.limites.ELS_rare.Qmax, Rtd: -r.limites.ELU.Qmin, detail: r };
}
