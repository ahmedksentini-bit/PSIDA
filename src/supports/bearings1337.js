/**
 * Appareils d'appui en élastomère fretté — vérifications de la NF EN 1337-3 § 5.3.3, selon la présentation du guide
 * technique Sétra « Appareils d'appui en élastomère fretté — utilisation sur les ponts, viaducs et structures similaires »
 * (juillet 2007), § 3.3 et 3.4 ; valeurs de l'application nationale (γm = 1, KL = 1, εu,d = 7).
 *
 * Géométrie : a ≤ b dimensions en plan (a parallèle à l'axe de l'ouvrage), enrobage latéral c (a' = a − 2c, b' = b − 2c,
 * A' = a'b', surface des frettes), n feuillets intermédiaires d'épaisseur t, frettes ts, enrobages extérieurs e ;
 *   T_e = n t + 2e (épaisseur totale d'élastomère, souplesse et flambement) ;
 *   T_q = n t + 2e si e > 2,5 mm, sinon n t (distorsion, guide § 3.3.2.2) ;
 *   S = A'/(2 t (a' + b')) (feuillet intermédiaire) ; G = 0,9 MPa (actions lentes), G_dyn = 1,8 MPa (freinage) ; E_b = 2000 MPa.
 * Vérifications à l'ELU fondamental, combinaison par combinaison (efforts et déplacements concomitants) :
 *   v_x = v_lent + H_x T_e/(G_dyn A')  ;  ε_q = v_x/T_q ≤ 1  ;  A_r = A'(1 − v_x/a')
 *   ε_c = 1,5 F_z/(G A_r S)  ;  ε_α = a'² α t/(2 Σ t³) = a'² α/(2 n t²)  ;  ε_t = K_L(ε_c + ε_q + ε_α) ≤ 7
 *   flambement : F_z/A_r < 2 a' G S/(3 T_e)
 *   stabilité en rotation : Σ v_z − a' α/K_r ≥ 0, K_r = 3, Σ v_z = n (F_z t/A')(1/(5 G S²) + 1/E_b)
 *   frettes : t_s ≥ K_p F_z (t₁ + t₂) K_h γ_m/(A_r f_y) et ≥ 2 mm, K_p = 1,3, K_h = 1, f_y = 235 MPa
 *   non-glissement (F_z minimal concomitant) : F_xy ≤ μ_e F_z, μ_e = 0,1 + 1,5 K_f/σ_m, σ_m = F_z/A_r [MPa],
 *     K_f = 0,6 (béton) ou 0,2 (autres surfaces, mortier de résine), F_xy = G A' v_lent/T_e + H_x ;
 *   anti-cheminement : σ_m,min = F_z,Gmin/A_r ≥ 3 MPa sous charges permanentes.
 * α comprend le défaut de pose α₀ (0,003 rad en pose conjuguée, 0,010 rad si la structure est posée directement).
 * Unités : entrées en m, kN, rad ; calculs en MN et MPa.
 */

export const EN1337_DEFAULTS = { cLat: 0.005, e: 0.0025, G: 0.9, Gdyn: 1.8, Eb: 2000, KL: 1, epsU: 7, Kr: 3, Kp: 1.3, Kh: 1, gm: 1, fy: 235, Kf: 0.6, sigMinPerm: 3 };

/** Grandeurs géométriques d'un appareil a × b × n(t + ts) [m]. */
export function bearingGeometry({ a, b, n, t, ts, cLat = EN1337_DEFAULTS.cLat, e = EN1337_DEFAULTS.e }) {
  const ap = a - 2 * cLat, bp = b - 2 * cLat, Ap = ap * bp;
  const Te = n * t + 2 * e, Tq = e > 0.0025 + 1e-12 ? n * t + 2 * e : n * t;
  const S = Ap / (2 * t * (ap + bp));
  return { a, b, n, t, ts, cLat, e, ap, bp, Ap, Te, Tq, S };
}

/**
 * Vérification d'une combinaison ELU.
 * @param {object} g géométrie (bearingGeometry)
 * @param {{label?:string, Fz:number, vSlow:number, Hx?:number, alpha:number}} c F_z [kN], v_lent [m] (retrait, fluage,
 *   température), H_x [kN] effort rapide (freinage), α [rad] défaut de pose compris
 */
export function checkCombo1337(g, c, o = {}) {
  const P = { ...EN1337_DEFAULTS, ...o };
  const Fz = c.Fz / 1000, Hx = Math.abs(c.Hx || 0) / 1000, alpha = Math.abs(c.alpha);
  const v2 = Hx * g.Te / (P.Gdyn * g.Ap);
  const vx = Math.abs(c.vSlow) + v2;
  const epsQ = vx / g.Tq;
  const Ar = g.Ap * Math.max(0, 1 - vx / g.ap);
  const sig = Ar > 0 ? Fz / Ar : Infinity;
  const epsC = Ar > 0 ? 1.5 * Fz / (P.G * Ar * g.S) : Infinity;
  const epsA = g.ap ** 2 * alpha / (2 * g.n * g.t ** 2);
  const epsT = P.KL * (epsC + epsQ + epsA);
  const sigBuck = 2 * g.ap * P.G * g.S / (3 * g.Te);
  const vz = g.n * (Fz * g.t / g.Ap) * (1 / (5 * P.G * g.S ** 2) + 1 / P.Eb);
  const vzReq = g.ap * alpha / P.Kr;
  const tsReq = Math.max(0.002, Ar > 0 ? P.Kp * Fz * 2 * g.t * P.Kh * P.gm / (Ar * P.fy) : Infinity);
  const checks = {
    distorsion: epsQ <= 1 + 1e-9,
    deformationTotale: epsT <= P.epsU + 1e-9,
    flambement: sig < sigBuck,
    rotation: vz >= vzReq - 1e-12,
    frettes: g.ts >= tsReq - 1e-9,
  };
  return { ...c, v2, vx, epsQ, Ar, sig, epsC, epsA, epsT, sigBuck, vz, vzReq, tsReq, checks, ok: Object.values(checks).every(Boolean) };
}

/**
 * Non-glissement sous l'effort vertical minimal concomitant et contrainte minimale sous charges permanentes.
 * @param {{FzMin:number, vSlow:number, Hx?:number, FzGmin:number, vPerm?:number}} c [kN, m]
 */
export function checkSliding1337(g, c, o = {}) {
  const P = { ...EN1337_DEFAULTS, ...o };
  const v = Math.abs(c.vSlow), Hx = Math.abs(c.Hx || 0) / 1000;
  const Ar = g.Ap * Math.max(0, 1 - (v + Hx * g.Te / (P.Gdyn * g.Ap)) / g.ap);
  const Fz = Math.max(0, c.FzMin) / 1000, sig = Ar > 0 ? Fz / Ar : 0;
  const mu = sig > 0 ? 0.1 + 1.5 * P.Kf / sig : Infinity;
  const Fxy = P.G * g.Ap * v / g.Te + Hx;
  const ArP = g.Ap * Math.max(0, 1 - Math.abs(c.vPerm ?? v) / g.ap);
  const sigPerm = ArP > 0 ? Math.max(0, c.FzGmin) / 1000 / ArP : 0;
  return { Ar, sig, mu, Fxy, R: mu * Fz, okGlissement: Fz > 0 && Fxy <= mu * Fz + 1e-12, sigPerm, okPerm: sigPerm >= P.sigMinPerm - 1e-9, Kf: P.Kf };
}

/**
 * Vérification complète d'un appareil sur un jeu de combinaisons ELU (max et min).
 * @param {object} bd {a, b, n, t, ts} [m] ; @param {object[]} combos voir checkCombo1337 (+ minimal : true pour les combinaisons à effort minimal)
 * @param {object} slide voir checkSliding1337
 */
export function verifyBearing1337(bd, combos, slide, o = {}) {
  const g = bearingGeometry({ ...bd, cLat: o.cLat ?? EN1337_DEFAULTS.cLat, e: o.e ?? EN1337_DEFAULTS.e });
  const rows = combos.map(c => checkCombo1337(g, c, o));
  const worst = k => rows.reduce((m, r) => (r[k] > m[k] ? r : m), rows[0]);
  const sl = slide ? checkSliding1337(g, slide, o) : null;
  const minRot = rows.filter(r => r.minimal).reduce((m, r) => (!m || r.vz / Math.max(r.vzReq, 1e-12) < m.vz / Math.max(m.vzReq, 1e-12) ? r : m), null);
  // combinaisons « indicatives » (enveloppe dont la concomitance n'est pas établie) : signalées, non bloquantes
  const ok = rows.every(r => r.ok || r.indicatif) && (!sl || (sl.okGlissement && sl.okPerm));
  return { g, rows, slide: sl, ok, worst: { epsT: worst('epsT'), epsQ: worst('epsQ'), sig: worst('sig') }, minRot };
}
