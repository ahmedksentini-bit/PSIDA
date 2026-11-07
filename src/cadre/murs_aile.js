/**
 * Murs en aile des cadres (PICF) et portiques (PIPO) : implantation, longueur, prédimensionnement et ferraillage.
 *
 * Géométrie (guide Sétra « Ponts-cadres et portiques — guide de conception », déc. 1992, § 2.8.1 p. 29–30, § 3.6.1
 * p. 58–59 : T renversé, fruit avant 1 à 2 %, épaisseur en tête 25 à 30 cm, arête 15 à 20 cm sous la trace du talus,
 * prolongement d'au moins 20 cm au-delà du pied de talus, semelle de l'épaisseur de la base ; annexe p. 92 : abaques des
 * murs en retour applicables aux murs en aile avec h_c = h − 0,50 m) :
 *  - quatre ailes distinctes (amont gauche, amont droite, aval gauche, aval droite), enracinées aux coins extérieurs des
 *    têtes, joint de 2 cm avec le piédroit ; angle θ mesuré depuis l'axe de l'ouvrage (0 = prolongement du piédroit,
 *    90° = mur frontal), jamais converti en 90° − θ ;
 *  - proposition esthétique (§ 2.8.1 p. 29–30, d'après le document GUEST du Sétra, en grades) : α = 15 + 0,03 L²,
 *    β = 0,008 (φ + 25) α (minimums 15 et 0,12 (φ + 25)), L ouverture droite (cadre ou portique multiple : L entre D et
 *    1,3 D, D portée d'une travée — retenu 1,15 D), φ biais ; objectif du guide : surfaces vues égales (figure 35,
 *    A = B, largeurs vues depuis la voie franchie). Le mur du coin aigu de la tête, plus long (le talus y descend moins
 *    vite le long du mur), reçoit le petit angle β, celui du coin obtus α : c'est l'affectation qui égalise A = L_w sin θ
 *    (contrôle `surfacesVues`) ; les lettres de la figure 35 placent α au coin aigu, mais la géométrie dessinée (mur long
 *    et raide au coin aigu) et la condition A = B conduisent à l'inverse avec les formules ; ouvrage droit : α = β ;
 *    angle saisi sinon ;
 *  - arête supérieure 0,20 m sous la trace du talus (pente 1/m, m = 3/2 par défaut) ; à l'enracinement, trace au niveau
 *    du dessus de la traverse + h_t ; revanche horizontale de longueur l_r en tête (sous la corniche, § 3.6.1, figure 48) ;
 *    le talus descend perpendiculairement aux têtes ; longueur = l_r + chute de l'arête jusqu'à h_min au-dessus du terrain
 *    naturel (dessus du radier) / pente le long du mur + 0,20 m de dépassement du pied ;
 *  - deux zones de ferraillage et de semelle : zone 1 de l'enracinement à la mi-longueur du rampant (calcul à h_v0),
 *    zone 2 au-delà (calcul à sa hauteur maximale) — semelle de largeur variable (figure 70) ;
 *  - jonction avec le piédroit (§ 3.6.1 b, figure 71) : solution 1, joint ouvert devant l'extrémité du piédroit — la
 *    rotation du mur y est gênée et tend la face avant : verticales de la face avant portées à la section des verticales
 *    côté terres sur 1,00 m au droit de la jonction (disposition PSIDA, le guide ne chiffre pas ce ferraillage) ;
 *    solution 2, joint plan sans butée : fruit avant initial majoré pour compenser la rotation (non chiffré) ;
 *  - épaisseur en tête ≥ 0,25 m, à la base e = (e_haut + (f_e + f_i) h)/(1 + f_e + f_i) et e ≥ e_m de l'abaque des murs
 *    en aile (Sétra, PICF-EL, déc. 1991 – éd. juil. 1992, DT422, annexe « prédimensionnement des murs de tête » § 2.1.1,
 *    p. 75 : courbes f_c28 = 20 et 25 MPa, axe des murs en aile décalé de +0,50 m sur celui des murs en retour ; sinon
 *    augmenter le fruit intérieur), épaissie par pas de 5 cm si la flexion ou l'effort tranchant l'imposent ; semelle
 *    d'épaisseur égale à celle du mur à sa base (même § 2.1), fondée au niveau de la sous-face du radier.
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

/**
 * Abaque e_m(h) du DT422 p. 75 (numérisé, axe des murs en retour : h de 3,69 à 8,96 m) ; murs en aile : h − 0,50 m.
 * En deçà de la plage, première valeur ; au-delà, prolongement linéaire de la dernière pente.
 */
export const ABAQUE_EM = {
  25: [[3.69, 0.210], [4.5, 0.263], [5.5, 0.330], [6.0, 0.363], [7.5, 0.475], [8.0, 0.516], [8.5, 0.558], [8.96, 0.597]],
  20: [[3.69, 0.235], [4.5, 0.295], [5.5, 0.374], [6.0, 0.413], [6.5, 0.455], [7.5, 0.545], [8.0, 0.592], [8.5, 0.642], [8.96, 0.690]],
};
const interp = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let k = 1; k < T.length; k++) if (x <= T[k][0]) return T[k - 1][1] + (T[k][1] - T[k - 1][1]) * (x - T[k - 1][0]) / (T[k][0] - T[k - 1][0]);
  const [a, b] = T.slice(-2); return b[1] + (b[1] - a[1]) * (x - b[0]) / (b[0] - a[0]);
};
/** Épaisseur minimale à la base e_m [m] pour un mur de hauteur h (au-dessus de la semelle) ; f_c28 en MPa. */
export function epaisseurAbaque(h, fc28 = 25, type = 'aile') {
  const hr = type === 'aile' ? h - 0.50 : h, t = Math.min(1, Math.max(0, (Math.min(25, Math.max(20, fc28)) - 20) / 5));
  return interp(ABAQUE_EM[20], hr) * (1 - t) + interp(ABAQUE_EM[25], hr) * t;
}
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
  const em = epaisseurAbaque(hv, hyp.fc28, 'aile'), eF = (eT + fruit * hv) / (1 + fruit);
  let eB = Math.ceil(Math.max(eF, em) * 100 - 1e-6) / 100, V = null;
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
    hv, es, eT: eTop, eB, eFruit: eF, em, Ka, gamma, q, phiSol, qadm,
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
  const m = o.m > 0 ? o.m : 1.5, ht = o.ht ?? 0.30, hmin = o.hmin ?? 0.50, lr = Math.max(0, o.lr ?? 0.50);
  // semelle d'épaisseur égale à celle du mur à sa base (DT422 § 2.1), sauf épaisseur saisie : point fixe sur e_b(h_v)
  let es = o.es ?? 0.40;
  if (o.es == null) for (let k = 0; k < 6; k++) { const eb = calculMurAile(zT + ht - es, { ...o, es }).eB; if (Math.abs(eb - es) < 0.005) break; es = eb; }
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
    // revanche horizontale en tête (sous la corniche, § 3.6.1), puis arête parallèle à la trace du talus
    const Lw = pente > 1e-3 ? Math.min(lr + chute / pente + 0.20, 30) : null;
    const s2 = Lw ? lr + (Lw - lr) / 2 : null;                              // début de la zone 2 (mi-longueur du rampant)
    const zTopS = s => Math.max(er + hmin, zTop0 - pente * Math.max(0, s - lr));
    ailes.push({ end, cote, label: `${end} ${cote}`, theta, aigu, angCoin, root, dir, pente, lr, zTop0, hv0, Lw, s2, zTopS, hv2: Lw ? zTopS(s2) - es : null, hEnd: Lw ? er + hmin - es : null });
  }
  // calcul : une fois par hauteur d'enracinement (identique pour les quatre ailes, les longueurs différant seules)
  const calc = calculMurAile(ailes[0].hv0, { ...o, es });
  // zone 2 (seconde moitié du rampant) : calcul à sa hauteur maximale, épaisseur de semelle conservée
  const a2 = ailes.find(a => a.Lw), calc2 = a2 && a2.hv2 < ailes[0].hv0 - 0.30 ? calculMurAile(Math.max(0.5, a2.hv2), { ...o, es }) : null;
  for (const a of ailes) a.Avue = a.Lw ? a.Lw * Math.sin(a.theta * RAD) : null;    // largeur vue depuis la voie franchie
  return { ailes, calc, calc2, prop, m, ht, hmin, lr, es, joint: 0.02, jonction: o.jonction === 'sol2' ? 'sol2' : 'sol1', surfacesVues: surfacesVues(ailes) };
}

/** Égalité des surfaces vues par tête (guide § 2.8.1, figure 35) : largeurs A = L_w sin θ et triangles ½ A h. */
export function surfacesVues(ailes) {
  return ['amont', 'aval'].map(end => {
    const [g, d] = ['gauche', 'droite'].map(c => ailes.find(a => a.end === end && a.cote === c));
    const sg = g.Avue * g.hv0 / 2, sd = d.Avue * d.hv0 / 2;
    return { end, Ag: g.Avue, Ad: d.Avue, ecart: Math.abs(sg - sd) / Math.max(sg, sd) };
  });
}
