/**
 * Prédimensionnement des appareils d'appui en élastomère fretté — guide SETRA « Ponts-dalles » (1989) § 3.6
 * (règles du bulletin technique n° 4 du SETRA), gamme standard des appareils entièrement enrobés (NF T 47.815,
 * tableau du § 3.6.3).
 *
 * Notations (§ 3.6.1) : a × b dimensions en plan [m] (a la plus petite), n feuillets d'épaisseur t, T = n·t épaisseur
 * totale d'élastomère (frettes non comprises) ; P effort vertical, H effort horizontal, σ = P/(ab) ;
 * G₁ = 0,8 MPa (longue durée), G₂ = 1,6 MPa (courte durée) ; u_g distorsion sous déformations lentes ; α rotation totale.
 *   σ ≤ G·ab/(t(a+b)),  σ ≤ 15 MPa ;  σ < 2 MPa → anti-cheminement ;  H > f·P (f = 0,10 + 0,6/σ) → blocage ;
 *   u_g/T ≤ 0,5 ;  u_g/T + H/(G₂ab) ≤ 0,7 ;  T ≤ min(a,b)/5 ;  t·T ≥ α·a²/3.
 * Unités : m, kN, MPa (1 MPa = 1000 kN/m²).
 */

/** Gamme standard (guide § 3.6.3) : dimensions efficaces a × b [mm], feuillet t / frette ts [mm], nombres n de feuillets disponibles. */
export const STANDARD_BEARINGS = [
  { a: 100, b: 150, t: 8, ts: 2, ns: [2] }, { a: 100, b: 200, t: 8, ts: 2, ns: [2] },
  { a: 150, b: 200, t: 8, ts: 2, ns: [2, 3] }, { a: 150, b: 250, t: 8, ts: 2, ns: [2, 3] }, { a: 150, b: 300, t: 8, ts: 2, ns: [2, 3] },
  { a: 200, b: 250, t: 8, ts: 2, ns: [3, 4] }, { a: 200, b: 300, t: 8, ts: 2, ns: [3, 4] }, { a: 200, b: 350, t: 8, ts: 2, ns: [3, 4] }, { a: 200, b: 400, t: 8, ts: 2, ns: [3, 4] },
  { a: 250, b: 300, t: 10, ts: 3, ns: [3, 4] }, { a: 250, b: 400, t: 10, ts: 3, ns: [3, 4] },
  { a: 300, b: 400, t: 10, ts: 3, ns: [3, 4, 5] }, { a: 300, b: 500, t: 10, ts: 3, ns: [3, 4, 5] }, { a: 300, b: 600, t: 10, ts: 3, ns: [3, 4, 5] },
  { a: 350, b: 450, t: 12, ts: 3, ns: [3, 4, 5] }, { a: 400, b: 500, t: 12, ts: 3, ns: [4, 5, 6] }, { a: 400, b: 600, t: 12, ts: 3, ns: [4, 5, 6] },
  { a: 450, b: 600, t: 12, ts: 3, ns: [4, 5, 6, 7] }, { a: 500, b: 600, t: 12, ts: 3, ns: [5, 6, 7, 8] },
  { a: 600, b: 600, t: 15, ts: 5, ns: [4, 5, 6, 7] }, { a: 600, b: 700, t: 15, ts: 5, ns: [4, 5, 6, 7] }, { a: 700, b: 700, t: 15, ts: 5, ns: [5, 6, 7] },
];

/** Désignation « a×b×n(t+ts) » et hauteur totale avec frettes [mm]. */
export function designation(bd, n) { return `${bd.a}×${bd.b}×${n}(${bd.t}+${bd.ts})`; }
export function totalHeight(bd, n) { return n * bd.t + (n - 1) * bd.ts; }

/**
 * Effort de freinage EN 1991-2 § 4.4.1 : Q_lk = 0,6 α_Q1 (2 Q_1k) + 0,10 α_q1 q_1k w_1 L, 180 α_Q1 ≤ Q_lk ≤ 900 kN.
 * @param {{alphaQ1?:number, alphaq1?:number, Q1k?:number, q1k?:number, w1?:number, L:number}} p
 */
export function brakingEC({ alphaQ1 = 1, alphaq1 = 1, Q1k = 300, q1k = 9, w1 = 3, L }) {
  const Q = 0.6 * alphaQ1 * 2 * Q1k + 0.10 * alphaq1 * q1k * w1 * L;
  return Math.min(900, Math.max(180 * alphaQ1, Q));
}

/**
 * Freinage Fascicule 61 titre II : un camion Bc de 300 kN (art. 5.2.4) ; A(l) : H = A·S/(20 + 0,0035·S), S surface chargée
 * [m²], A = a1·a2·A(l) [kN/m²] (art. 4.4). Valeur retenue : la plus grande.
 */
export function brakingF61({ Aq, S }) { return Math.max(300, Aq * S / (20 + 0.0035 * S)); }

/**
 * Ligne d'influence de réaction d'un appui d'une poutre continue à infinité de travées égales (portée e), abscisse
 * relative a = d/e — modèle de la ligne d'appareils d'appui de PSI-DA 68 § 2.4.2 (interpolation cubique par morceaux).
 */
export function Rinf(a) {
  const x = Math.abs(a);
  if (x < 1) return 1 - 2.196 * x ** 2 + 1.196 * x ** 3;
  if (x < 2) return 2.784 - 5.352 * x + 3.156 * x ** 2 - 0.588 * x ** 3;
  if (x < 3) return -3.168 + 3.576 * x - 1.308 * x ** 2 + 0.156 * x ** 3;
  return 0;
}

/** Entraxe des appareils d'une ligne (PSI-DA 68 § 2.4.1, PSIDA.EL) : E/sinψ/(n − 0,1) pour n ≥ 3, (n − 0,3) sinon. */
export function bearingSpacing({ width, psi = 100, n }) {
  const s = Math.sin(psi * Math.PI / 200);
  return width / s / (n - (n >= 3 ? 0.1 : 0.3));
}

/**
 * Coefficients d'inégalité de répartition des réactions entre les appareils d'une ligne (PSI-DA 68 § 2.4.2, repris par
 * PSIDA.EL p. 31) : réaction de l'appareil le plus chargé = coefficient × réaction moyenne R/n.
 *   CP : k0 = n·e/E, k = max(k0 ; k0 + n/2·(1 − k0)) ;  A : idem avec la largeur chargeable ;
 *   B : ligne d'appareils = poutre continue à infinité de travées e·sinψ, roues des tandems Bt centrés dans des bandes
 *       de 3 m (±0,5 et ±2,5 m) ou des camions Bc (±0,25 et ±2,25 m) : k = n/nvoies·[R(e₁/e) + R(e₂/e)] ;
 *   Mc120 : chenilles étalées sur 1,00 + 2 h_rev + h, positions « une chenille centrée » et « deux chenilles symétriques ».
 * Vérifié sur la note PSIDA.EL (3 et 4 appareils) à 0,3–1 %.
 */
export function inequalityCoefficients({ width, chargeable, n, spacing = null, psi = 100, nLanes = 2, hRev = 0.08, h }) {
  const s = Math.sin(psi * Math.PI / 200), e = (spacing || bearingSpacing({ width, psi, n })) * s;
  const uni = w => { const k0 = n * e / w; return Math.max(k0, k0 + n / 2 * (1 - k0)); };
  const mean = (a, b) => { let t = 0; for (let i = 0; i < 200; i++) t += Rinf(a + (b - a) * (i + 0.5) / 200); return t / 200; };
  const l = 1.0 + 2 * hRev + h, hl = l / 2, nl = Math.max(1, nLanes);
  return {
    e, CP: uni(width), A: uni(chargeable),
    B: Math.max(n / nl * (Rinf(0.5 / e) + Rinf(2.5 / e)), n / nl * (Rinf(0.25 / e) + Rinf(2.25 / e))),
    Mc: Math.max(n * 0.5 * (mean(-hl / e, hl / e) + mean((3.3 - hl) / e, (3.3 + hl) / e)), n * mean((1.65 - hl) / e, (1.65 + hl) / e)),
  };
}

/**
 * Coefficient d'inégalité pour un groupe de roues quelconque (généralisation de la formule B de PSI-DA 68 au tandem TS
 * de l'Eurocode, charges inégales par voie) : k = n · max_y Σ P_w·R((y_w − y)/e) / Σ P_w, la position y de l'appareil
 * parcourant une période de la ligne d'appareils.
 * @param {{y:number, P:number}[]} wheels files de roues (ordonnée, charge) ; e entraxe des appareils × sinψ ; n appareils
 */
export function inequalityWheels(wheels, e, n) {
  const tot = wheels.reduce((a, w) => a + w.P, 0);
  if (tot <= 0) return 1;
  const y0 = Math.min(...wheels.map(w => w.y)), y1 = Math.max(...wheels.map(w => w.y));
  let best = 0;
  for (let y = y0 - e; y <= y1 + e + 1e-9; y += e / 200) best = Math.max(best, wheels.reduce((a, w) => a + w.P * Rinf((w.y - y) / e), 0));
  return n * best / tot;
}

/**
 * Vérification d'un appareil (bd, n) sous P_max, P_min [kN], H [kN], u_g [m], α [rad].
 * @returns {{ok:boolean, sig:number, sigLim:number, sigMin:number, dist1:number, dist2:number, Tmax:number, rotLim:number, T:number, checks:object}}
 */
export function checkBearing(bd, n, { Pmax, Pmin, H, ug, alpha, G1 = 0.8, G2 = 1.6, sigMax = 15, sigMinAdm = 2 }) {
  const a = bd.a / 1000, b = bd.b / 1000, t = bd.t / 1000, T = n * t, A = a * b;
  const sig = Pmax / A / 1000, sigMin = Pmin / A / 1000;         // MPa
  const sigLim = Math.min(sigMax, G1 * A / (t * (a + b)));
  const dist1 = ug / T, dist2 = ug / T + H / (G2 * 1000 * A);
  const Tmax = Math.min(a, b) / 5, rotLim = 3 * t * T / (a * a);
  const f = 0.10 + 0.6 / Math.max(sigMin, 0.01);
  const checks = { compression: sig <= sigLim + 1e-9, distorsionVide: dist1 <= 0.5 + 1e-9, distorsionCharge: dist2 <= 0.7 + 1e-9, deversement: T <= Tmax + 1e-9, rotation: alpha <= rotLim + 1e-9 };
  const ok = Object.values(checks).every(Boolean);
  // § 3.6.2 : appareil glissant (élastomère + PTFE) nécessaire si u_g > min(a, b)/10
  return { ok, sig, sigLim, sigMin, dist1, dist2, T, Tmax, rotLim, f, antiCheminement: sigMin < sigMinAdm, glissement: H > f * Pmin, glissantNecessaire: ug > Math.min(a, b) / 10, checks };
}

/** Plus petit appareil standard (aire puis épaisseur croissantes) vérifiant toutes les conditions. */
export function selectBearing(loads, opt = {}) {
  const cands = [];
  for (const bd of STANDARD_BEARINGS) for (const n of bd.ns) cands.push({ bd, n, area: bd.a * bd.b, T: n * bd.t });
  cands.sort((p, q) => p.area - q.area || p.T - q.T);
  for (const c of cands) { const r = checkBearing(c.bd, c.n, { ...loads, ...opt }); if (r.ok) return { ...c, ...r, label: designation(c.bd, c.n), hTot: totalHeight(c.bd, c.n) }; }
  return null;
}

/**
 * Rotation d'appui estimée à partir du diagramme des moments d'une travée (poutre conjuguée) :
 *   θ_A = (1/(EI·L)) ∫₀ᴸ M(x)(L − x) dx,  θ_B = (1/(EI·L)) ∫₀ᴸ M(x)·x dx   (M sagging > 0).
 * @param {number[]} xi abscisses locales des sections, @param {number[]} M moments [kN·m], @param {number} EI [kN·m²]
 */
export function endRotations(xi, M, L, EI) {
  let iA = 0, iB = 0;
  for (let s = 0; s < xi.length - 1; s++) {
    const dx = xi[s + 1] - xi[s];
    iA += 0.5 * (M[s] * (L - xi[s]) + M[s + 1] * (L - xi[s + 1])) * dx;
    iB += 0.5 * (M[s] * xi[s] + M[s + 1] * xi[s + 1]) * dx;
  }
  return { thetaA: iA / (EI * L), thetaB: iB / (EI * L) };
}

/**
 * Prédimensionnement par ligne d'appui.
 * @param {object} p
 * @param {import('./analysis.js').SlabDeck} p.deck
 * @param {object} p.beamComb  résultat de combineBeamEC (M, R en CARmax/CARmin) — ou {R:{CARmax,CARmin}, M:{CARmax}}
 * @param {number} p.EI        rigidité de flexion [kN·m²]
 * @param {number} [p.nPerLine] appareils par ligne d'appui (défaut : ≈ un tous les 3 m, au moins 2)
 * @param {number} [p.xFixed]   abscisse du point fixe [m] (défaut : milieu de l'ouvrage)
 * @param {number} [p.epsSlow=2.5e-4] raccourcissement lent (retrait + fluage) ; @param {number} [p.dT=30] variation uniforme de température [°C] ; @param {number} [p.alphaT=1e-5]
 * @param {number} [p.Htot]     effort horizontal total sur l'ouvrage [kN] (défaut : freinage EN 1991-2)
 * @param {number} [p.alpha0=0.003] rotation de défaut de pose [rad]
 * @param {{coef:object, Rperm:number[], RA:number[], RB:number[]}} [p.ineq] coefficients d'inégalité de répartition et réactions par cas
 * @param {{perm:number[], traffic:number[]}} [p.rot] rotations d'appui [rad] : permanent (module différé) et trafic (lignes d'influence)
 */
export function designBearings({ deck, beamComb, EI, nPerLine = null, xFixed = null, epsSlow = 2.5e-4, dT = 30, alphaT = 1e-5, Htot = null, alpha0 = 0.003, alphaQ1 = 1, alphaq1 = 1, G1 = 0.8, G2 = 1.6, sigMax = 15, ineq = null, rot = null }) {
  const width = 2 * deck.b, Ltot = deck.spans.reduce((s, L) => s + L, 0);
  const nb = nPerLine || Math.max(2, Math.round(width / 3));
  const xf = xFixed === null || xFixed === undefined ? Ltot / 2 : xFixed;
  const xs = [0]; deck.spans.forEach(L => xs.push(xs[xs.length - 1] + L));
  const H = Htot === null || Htot === undefined ? brakingEC({ alphaQ1, alphaq1, L: Ltot }) : Htot;
  const nLines = xs.length, Hb = H / (nb * nLines);
  const secs = deck.beam.sections;
  const rows = xs.map((x, i) => {
    const Rmax = beamComb.R.CARmax[i], Rmin = beamComb.R.CARmin[i];
    // réaction de l'appareil le plus chargé : coefficients d'inégalité de répartition (PSI-DA 68 § 2.4.2) appliqués
    // à la part permanente (CP) et à la part variable (moyenne pondérée A/UDL et B/TS par leurs réactions caractéristiques)
    let Pmax = Rmax / nb, kCP = 1, kQ = 1;
    if (ineq) {
      const k = ineq.coef, Rp = ineq.Rperm[i], RA = Math.max(ineq.RA[i], 0), RB = Math.max(ineq.RB[i], 0);
      kCP = k.CP; kQ = RA + RB > 0 ? (k.A * RA + k.B * RB) / (RA + RB) : k.A;
      Pmax = (kCP * Rp + kQ * Math.max(Rmax - Rp, 0)) / nb;
    }
    const Pmin = Rmin / nb;
    const ug = (epsSlow + alphaT * dT) * Math.abs(x - xf);
    // rotation : si fournie, θ permanent (module différé) + enveloppe des lignes d'influence de rotation sous trafic
    // (concomitante) ; sinon estimation conservative par l'enveloppe ELS caractéristique des moments (sagging)
    let alphaExp = 0;
    if (rot) alphaExp = Math.abs(rot.perm[i] || 0) + Math.abs(rot.traffic[i] || 0);
    else for (const j of [i - 1, i]) {
      if (j < 0 || j >= deck.spans.length) continue;
      const idx = secs.map((s, k) => (s.span === j ? k : -1)).filter(k => k >= 0);
      const r = endRotations(idx.map(k => secs[k].xi), idx.map(k => Math.max(beamComb.M.CARmax[k], 0)), deck.spans[j], EI);
      alphaExp = Math.max(alphaExp, Math.abs(j === i ? r.thetaA : r.thetaB));
    }
    const alpha = alpha0 + alphaExp;
    const loads = { Pmax, Pmin: Math.max(Pmin, 0), H: Hb, ug, alpha };
    const sel = selectBearing(loads, { G1, G2, sigMax });
    return { i, x, Rmax, Rmin, nb, Pmax, Pmin, kCP, kQ, ug, Hb, alpha, alphaExp, sel, uplift: Rmin < 0 };
  });
  return { rows, nb, H, Hb, xf, nLines, epsSlow, dT, alphaT, alpha0, G1, G2, sigMax, ineq: ineq ? ineq.coef : null };
}
