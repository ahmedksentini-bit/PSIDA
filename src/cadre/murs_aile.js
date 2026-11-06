/**
 * Murs en aile des cadres (PICF) et portiques (PIPO) : implantation, longueur, prédimensionnement et ferraillage.
 *
 * Géométrie (guide Sétra « Ponts-cadres et portiques — guide de conception », déc. 1992, § 2.8.1 et § 3.6.1, annexe 3 ;
 * règles reprises de BVTrace WingWallGeometry.cs, docs/context/ouvrages-tetes-murs.md) :
 *  - quatre ailes distinctes (amont gauche, amont droite, aval gauche, aval droite), enracinées aux coins extérieurs des
 *    têtes, joint de 2 cm avec le piédroit ; angle θ mesuré depuis l'axe de l'ouvrage (0 = prolongement du piédroit,
 *    90° = mur frontal), jamais converti en 90° − θ ;
 *  - proposition esthétique (§ 2.8.1, en grades) : α_g = 15 + 0,03 L², β_g = 0,008 (φ_g + 25) α_g, L ouverture droite
 *    totale, φ biais ; α au coin obtus de la tête, β au coin aigu (ouvrage droit : α = β) ; angle saisi sinon ;
 *  - arête supérieure 0,20 m sous la trace du talus (pente 1/m, m = 3/2 par défaut) ; à l'enracinement, trace au niveau
 *    du dessus de la traverse + h_t ; le talus descend perpendiculairement aux têtes ; longueur = chute de l'arête jusqu'à
 *    h_min au-dessus du terrain naturel (dessus du radier) / pente le long du mur, + 0,20 m de dépassement du pied ;
 *  - épaisseur en tête ≥ 0,25 m, à la base e = (e_t + f h)/(1 + f) (f fruit), épaissie par pas de 5 cm si la flexion ou
 *    l'effort tranchant l'imposent ; mur en T renversé, semelle au niveau de la sous-face du radier.
 *
 * Calcul (par mètre, section d'enracinement, la plus haute ; armatures et semelle constantes sur toute la longueur) :
 *  - poussée active K_a γ h et surcharge q de remblai : M = K_a γ h³/6 + K_a q h²/2, V = K_a γ h²/2 + K_a q h ;
 *    ELU 1,35 G + 1,5 Q, ELS G + Q ; BAEL 91 (ELU, ELS σ̄_s, non-fragilité, τ_u ≤ 0,07 f_c28/γ_b) ou EN 1992-1-1 (ELU,
 *    minimum, w_k, V_Rd,c) — fonctions de src/cadre/sections.js (t·m/ml, cm²/ml) ;
 *  - semelle de largeur B (talon b, patin a) : renversement ΣM_stab / ΣM_renv ≥ 1,5 (surcharge sur le talon non comptée),
 *    glissement N tan φ / H ≥ 1,5, résultante dans le tiers central sous G + Q, contrainte de référence
 *    (3σ_max + σ_min)/4 ≤ q_adm si q_adm est saisi ; B augmenté par pas de 10 cm ; talon et patin en console sous la
 *    réaction du sol (ELU) ;
 *  - répartition : horizontales ≥ max(25 % des verticales ; 0,1 % de la section par moitié sur chaque face)
 *    (EN 1992-1-1 § 9.6.3 ; BAEL A.8.2,41 : ¼) ; parement avant ≥ minimum.
 * Unités : m, kN ; aciers en cm²/ml.
 */
import { eluBael, elsBael, minimumBael, tranchantBael, eluEc2, minimumEc2, tranchantEc2, fissureEc2 } from './sections.js';

const RAD = Math.PI / 180;
const PHIS = [10, 12, 14, 16, 20, 25];
export const aireHA = (phi, s) => Math.PI * (phi / 2000) ** 2 / s * 1e4;   // cm²/ml

/** Plus petit diamètre fournissant As (cm²/ml) à 0,20 puis 0,15 puis 0,10 m. */
export function choixAile(As, { phiMin = 10 } = {}) {
  for (const s of [0.20, 0.15, 0.10]) for (const phi of PHIS) if (phi >= phiMin && aireHA(phi, s) + 1e-9 >= As) return { phi, s, As: aireHA(phi, s) };
  return { phi: 25, s: 0.10, As: aireHA(25, 0.10), insuffisant: true };
}

/** Proposition esthétique du guide (§ 2.8.1) : angles depuis l'axe de l'ouvrage [°] ; biais en degrés (90 = droit). */
export function anglesEsthetiques(Lo, biaisDeg) {
  const phiG = biaisDeg / 0.9, aG = 15 + 0.03 * Lo * Lo, bG = 0.008 * (phiG + 25) * aG;
  return { alpha: 0.9 * aG, beta: 0.9 * bG };
}

/** Flexion d'une section de b = 1 m sous M_u, M_s [kN·m/m] : aciers requis [cm²/ml] et choix. */
function flexion({ Mu, Ms, e, c, h, phiMin = 10 }) {
  const d = e - c - 0.008;
  let As, det;
  if (h.code === 'EC2') {
    const u = eluEc2(Mu / 10, d, h.fc28, h.fe), mn = minimumEc2(d, h.fc28, h.fe);
    As = Math.max(u.as || 0, mn); det = u;
    if (u.surarme) return { d, As: NaN, choix: null, surarme: true };
    let ch = choixAile(As, { phiMin });
    for (let k = 0; k < 12; k++) {
      const f = fissureEc2(Ms / 10, e, d, ch.As, ch.phi / 1000, c, h.fc28, h.exposition || 'XC2-XC4');
      if (f.ok) return { d, As, choix: ch, wk: f.wk, det };
      ch = choixAile(ch.As * 1.15, { phiMin });
      if (ch.insuffisant) return { d, As, choix: ch, wk: f.wk, det, fissure: true };
    }
    return { d, As, choix: ch, det };
  }
  const u = eluBael(Mu / 10, d, h.fc28, h.fe), s = elsBael(Ms / 10, d, h.sigmaS || 201.6, h.fc28, h.fe);
  if (u.surarme) return { d, As: NaN, choix: null, surarme: true };
  As = Math.max(u.as || 0, s.as, minimumBael(d, h.fc28, h.fe));
  return { d, As, choix: choixAile(As, { phiMin }), det: u };
}
const tranchant = (Vu, d, As, h) => (h.code === 'EC2' ? tranchantEc2(Vu / 10, d, h.fc28, As) : tranchantBael(Vu / 10, d, h.fc28));

/**
 * Mur en T renversé de hauteur de voile h au-dessus de la semelle (épaisseur es), par mètre.
 * o : { eT, fruit, Ka, gamma, q, phiSol, qadm [kPa, 0 = non vérifié], c, h (hypothèses du cadre : code, fc28, fe, sigmaS) }.
 */
export function calculMurAile(hv, o) {
  const { eT = 0.25, fruit = 0.02, Ka = 0.33, gamma = 20, q = 10, phiSol = 30, qadm = 0, c = 0.05, es = 0.40, h: hyp } = o;
  // voile : épaisseur à la base, épaissie tant que flexion ou tranchant ne passent pas
  let eB = Math.ceil((eT + fruit * hv) / (1 + fruit) * 100 - 1e-6) / 100, V = null;
  const Mg = Ka * gamma * hv ** 3 / 6, Mq = Ka * q * hv ** 2 / 2, Vg = Ka * gamma * hv ** 2 / 2, Vq = Ka * q * hv;
  const Mu = 1.35 * Mg + 1.5 * Mq, Ms = Mg + Mq, Vu = 1.35 * Vg + 1.5 * Vq;
  for (let k = 0; k < 20; k++) {
    const f = flexion({ Mu, Ms, e: eB, c, h: hyp });
    const t = f.choix ? tranchant(Vu, f.d, f.choix.As, hyp) : { ok: false };
    V = { e: eB, ...f, T: t };
    if (!f.surarme && f.choix && !f.choix.insuffisant && t.ok) break;
    eB = Math.round((eB + 0.05) * 100) / 100;
  }
  const eTop = Math.max(0.25, eT), main = V.choix, d = V.d;
  const minF = hyp.code === 'EC2' ? minimumEc2(d, hyp.fc28, hyp.fe) : minimumBael(d, hyp.fc28, hyp.fe);
  const avant = choixAile(Math.max(minF / 2, 0.0005 * eB * 1e4));
  const horiz = choixAile(Math.max(0.25 * main.As, 0.0005 * eB * 1e4), { phiMin: 8 });
  // semelle : largeur croissante jusqu'à satisfaire stabilité et portance
  const tanP = Math.tan(phiSol * RAD), H = hv + es;
  const Pg = Ka * gamma * H ** 2 / 2, Pq = Ka * q * H, Mr = Pg * H / 3 + Pq * H / 2;
  let S = null;
  for (let B = Math.max(1.0, Math.round(0.4 * H * 10) / 10); B <= 1.6 * H + 1.0; B = Math.round((B + 0.1) * 10) / 10) {
    const a = Math.max(0.30, Math.round(0.25 * B * 20) / 20), b = B - a - eB;
    if (b < 0.2) continue;
    const W1 = 25 * (eTop + eB) / 2 * hv, x1 = a + eB / 2, W2 = 25 * B * es, x2 = B / 2, W3 = gamma * hv * b, x3 = a + eB + b / 2, Q3 = q * b;
    const N = W1 + W2 + W3, Ms0 = W1 * x1 + W2 * x2 + W3 * x3;
    const FSr = Ms0 / Mr, FSg = N * tanP / (Pg + Pq);
    // G + Q : résultante, excentricité, contraintes (kPa)
    const Nq = N + Q3, Mc = (Ms0 + Q3 * x3) - Mr, xr = Mc / Nq, ex = B / 2 - xr;
    const s1 = Nq / B * (1 + 6 * ex / B), s2 = Nq / B * (1 - 6 * ex / B), qref = (3 * Math.max(s1, s2) + Math.min(s1, s2)) / 4;
    const ok = FSr >= 1.5 && FSg >= 1.5 && Math.abs(ex) <= B / 6 + 1e-9 && (!(qadm > 0) || qref <= qadm + 1e-9);
    S = { B, a, b, W1, W2, W3, Q3, N, Pg, Pq, FSr, FSg, ex, s1, s2, qref, ok };
    if (ok) break;
  }
  // semelle en flexion : ELU, réaction trapézoïdale ; talon (nappe supérieure) et patin (nappe inférieure)
  const Nu = 1.35 * (S.W1 + S.W2 + S.W3) + 1.5 * S.Q3, Mru = 1.35 * Pg * H / 3 + 1.5 * Pq * H / 2;
  const Msu = 1.35 * (S.W1 * (S.a + eB / 2) + S.W2 * S.B / 2 + S.W3 * (S.a + eB + S.b / 2)) + 1.5 * S.Q3 * (S.a + eB + S.b / 2);
  const exu = S.B / 2 - (Msu - Mru) / Nu, su = x => Math.max(0, Nu / S.B * (1 + 6 * exu / S.B * (1 - 2 * x / S.B)));   // x depuis le patin
  const integ = (x0, x1, f, n = 40) => { let A = 0; for (let k = 0; k < n; k++) { const x = x0 + (k + 0.5) * (x1 - x0) / n; A += f(x) * (x1 - x0) / n; } return A; };
  const xT = S.a + eB;                                                      // nu arrière du voile
  const MtalU = 1.35 * (gamma * hv + 25 * es) * S.b ** 2 / 2 + 1.5 * q * S.b ** 2 / 2 - integ(xT, S.B, x => su(x) * (x - xT));
  const MpatU = integ(0, S.a, x => su(x) * (S.a - x)) - 1.35 * 25 * es * S.a ** 2 / 2;
  const sc = 1 / 1.40;                                                      // ELS ≈ ELU / 1,4 (G et Q mêlés)
  const fT = flexion({ Mu: Math.max(0, MtalU), Ms: Math.max(0, MtalU) * sc, e: es, c, h: hyp, phiMin: 10 });
  const fP = flexion({ Mu: Math.max(0, MpatU), Ms: Math.max(0, MpatU) * sc, e: es, c, h: hyp, phiMin: 10 });
  const repS = choixAile(Math.max(0.25 * Math.max(fT.choix ? fT.choix.As : 0, fP.choix ? fP.choix.As : 0), 0.0005 * es * 1e4));
  const ok = !V.surarme && main && !main.insuffisant && V.T.ok && S.ok && fT.choix && fP.choix;
  return {
    hv, es, eT: eTop, eB, Ka, gamma, q, phiSol, qadm,
    voile: { Mg, Mq, Mu, Ms, Vu, d, As: V.As, main, avant, horiz, T: V.T, wk: V.wk },
    semelle: { ...S, Nu, exu, MtalU, MpatU, talon: fT, patin: fP, rep: repS },
    ok: !!ok,
  };
}

/**
 * Implantation et calcul des quatre ailes d'un cadre.
 * geo : { W (largeur extérieure), Lo (ouverture droite totale), L (longueur suivant l'axe), zT (dessus de la traverse
 * depuis la sous-face du radier), er (épaisseur du radier, 0 pour un portique), biais [°], ep (épaisseur des piédroits) }
 * o : { angle (° ou null), m (talus), ht, hmin, eT, fruit, Ka, gamma, q, phiSol, qadm, c, es, h }.
 */
export function mursEnAile(geo, o) {
  const { W, Lo, L, zT, er, biais } = geo, b = biais * RAD, cb = Math.cos(b), sb = Math.sin(b);
  const m = o.m > 0 ? o.m : 1.5, ht = o.ht ?? 0.30, hmin = o.hmin ?? 0.50, es = o.es ?? Math.max(0.40, er || 0);
  const prop = anglesEsthetiques(Lo, biais);
  const P = (u, x) => [u + x * cb, -x * sb];
  const tete = [cb, -sb];                                                   // direction des têtes (x croissant)
  const nOut = { amont: [-sb, -cb], aval: [sb, cb] };                       // normale sortante aux têtes
  const ailes = [];
  for (const end of ['amont', 'aval']) for (const cote of ['gauche', 'droite']) {
    const u0 = end === 'amont' ? 0 : L, x0 = cote === 'gauche' ? 0 : W, root = P(u0, x0);
    const pied = end === 'amont' ? [1, 0] : [-1, 0], hd = cote === 'gauche' ? tete : [-tete[0], -tete[1]];
    const angCoin = Math.acos(Math.max(-1, Math.min(1, pied[0] * hd[0] + pied[1] * hd[1]))) / RAD;   // angle tête / piédroit
    const aigu = angCoin < 90 - 1e-6;
    const theta = Number.isFinite(o.angle) ? o.angle : aigu ? prop.beta : prop.alpha;
    // direction du mur : depuis l'axe vers l'extérieur latéral (côté gauche : +y), puis vers l'amont ou l'aval
    const lat = cote === 'gauche' ? 1 : -1, sens = end === 'amont' ? -1 : 1;
    const dir = [sens * Math.cos(theta * RAD), lat * Math.sin(theta * RAD)];
    const pente = (dir[0] * nOut[end][0] + dir[1] * nOut[end][1]) / m;      // chute de la trace par mètre de mur
    const zTop0 = zT + ht, hv0 = zTop0 - es;                                // hauteur du voile à l'enracinement
    const chute = Math.max(0, zTop0 - (er + hmin));
    const Lw = pente > 1e-3 ? Math.min(chute / pente + 0.20, 30) : null;
    ailes.push({ end, cote, label: `${end} ${cote}`, theta, aigu, angCoin, root, dir, pente, zTop0, hv0, Lw, hEnd: Lw ? Math.max(hmin, zTop0 - pente * (Lw - 0.20)) - es : null });
  }
  // calcul : une fois par hauteur d'enracinement (identique pour les quatre ailes, les longueurs différant seules)
  const calc = calculMurAile(ailes[0].hv0, { ...o, es });
  return { ailes, calc, prop, m, ht, hmin, es, joint: 0.02 };
}
