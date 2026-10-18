/**
 * Justifications du tablier-dalle précontraint (type PSI-DP), d'après la note modèle SETRA PSIDP-EL 84-1 et le BPEL 91 :
 *  - contraintes normales en classe II (BPEL 6.1,2) par phase (mise en tension M.T avec P1 et l'ossature, mise en service
 *    M.S avec P1, service définitif E.S avec P2) et par combinaison (quasi permanente « à vide », fréquente, rare), section
 *    nette, avec contrôle dans la section d'enrobage (bande de hauteur 3 Φ_gaine centrée sur le câble moyen) ;
 *  - armatures passives longitudinales : peau (BPEL 6.1,31), 1,5 ‰ B en fibre inférieure près des appuis intermédiaires
 *    (règle SETRA), non-fragilité des zones tendues B_t/1000 + N_Bt f_tj/(f_e σ_Bt) (BPEL 6.1,32) ;
 *  - ELU de flexion (BPEL 6.3) : N = F (P1 ou P2), M = M_ELU + F z + M_hyp ; M_lim par équilibre de la section (béton
 *    parabole-rectangle, pivots 3,5 ‰ / 10 ‰, aciers passifs et surtension des armatures de précontrainte élasto-plastiques) ;
 *  - effort tranchant (BPEL 7) au voisinage des appuis intermédiaires, section à h/2 de l'axe d'appui : V_red = V + V_hyp
 *    + F sin α ; τ = V_red/(b_n · 2h/3), b_n = b − n Φ/2 ; ELS (7.2,2), ELU bielles et armatures d'âme (7.3).
 * Unités cohérentes avec prestress.js.
 */

/** Contraintes fibre supérieure / inférieure (compression > 0) sous N et M (M > 0 : fibre inférieure tendue). */
const fibres = (N, M, Bn, In, v, vp) => ({ s: N / Bn + M * v / In, i: N / Bn - M * vp / In });

/**
 * @param {object} r résultat de prestress()
 * @param {object} o { sec {B, I, v, vp, h, bTop, bBot}, phiG, nCables, stations [{x, label, j, f}],
 *   M: { oss(x) → {min,moy,max}, cp(x) → {min,moy,max}, rare(x) → {max,min}, freq(x) → {max,min}, elu(x) → {max,min} },
 *   lim: { fcj, fc28, ftj, ft28 }, steel: { fe, skin (aire par m de parement), Es, gs, gp, gb, fpeg, cover } }
 */
export function psidpChecks(r, o) {
  const { sec, lim, steel } = o, { v, vp, h } = sec, half = 1.5 * o.phiG;
  const out = { stresses: [], extremes: {}, steel: [], elu: [], shear: [] };
  const LIM = {
    MT: { c: 0.6 * lim.fcj, encR: -lim.ftj, horsR: -1.5 * lim.ftj },
    rare: { c: 0.6 * lim.fc28, enc: -lim.ft28, hors: -1.5 * lim.ft28 },
    freq: { c: 0.6 * lim.fc28, enc: 0, hors: null },
    QL: { c: 0.5 * lim.fc28, enc: 0, hors: null },
  };
  const ext = {}; const upd = (key, cmp, val, where) => { const e = ext[key] || (ext[key] = { max: -Infinity, min: Infinity, whereMax: '', whereMin: '' }); if (cmp === 'max' && val > e.max) { e.max = val; e.whereMax = where; } if (cmp === 'min' && val < e.min) { e.min = val; e.whereMin = where; } };

  for (const st of o.stations) {
    const x = st.x, z = r.at(r.z, x), In = sec.I - r.Ag * o.nCables * z * z, Bn = r.Bn;
    const yLo = Math.max(z - half, -vp), yHi = Math.min(z + half, v);
    const atY = (sg, y) => sg.i + (sg.s - sg.i) * (y + vp) / (v + vp);
    const pre = state => { const F = r.at(state.F, x); return { N: F, M: F * z + r.at(state.Mhyp, x), F }; };
    const row = { x, label: st.label, z, phases: {} };
    const evalC = (P, Mload) => { const sg = fibres(P.N, P.M + Mload, Bn, In, v, vp); return { ...sg, enc: Math.min(atY(sg, yLo), atY(sg, yHi)), cmax: Math.max(sg.s, sg.i) }; };
    // mise en tension : ossature min / max + P1
    { const P = pre(r.MT.max), G = o.M.oss(x); const a = evalC(P, G.max), b = evalC(P, G.min);
      row.phases.MT = { a, b }; for (const c of [a, b]) { upd('MT', 'max', c.cmax, st.label); upd('MT_enc', 'min', c.enc, st.label); upd('MT_hors', 'min', Math.min(c.s, c.i), st.label); } }
    for (const [ph, P0] of [['MS', r.MS.max], ['ES', r.ES.min]]) {
      const P = pre(P0), G = o.M.cp(x), R = o.M.rare(x), Fq = o.M.freq(x);
      const QL = [evalC(P, G.max), evalC(P, G.min)], rare = [evalC(P, G.max + R.max), evalC(P, G.min + R.min)], freq = [evalC(P, G.max + Fq.max), evalC(P, G.min + Fq.min)];
      row.phases[ph] = { QL, rare, freq, F: P.F, Mhyp: r.at(P0.Mhyp, x) };
      for (const [k, list] of [['QL', QL], ['freq', freq], ['rare', rare]]) for (const c of list) { upd(`${ph}_${k}`, 'max', c.cmax, st.label); upd(`${ph}_${k}_enc`, 'min', c.enc, st.label); upd(`${ph}_${k}_hors`, 'min', Math.min(c.s, c.i), st.label); }
    }
    out.stresses.push(row);
  }
  // récapitulatif des extrêmes (comme NP 44) avec limites et vérification
  const rec = [];
  const push = (lab, key, L) => { const e = ext[key], en = ext[`${key}_enc`], ho = ext[`${key}_hors`]; rec.push({ lab, cmax: e.max, cLim: L.c, enc: en.min, encLim: L.enc ?? L.encR, hors: ho.min, horsLim: L.hors ?? L.horsR ?? null, where: { c: e.whereMax, enc: en.whereMin, hors: ho.whereMin } }); };
  ext.MT_enc = ext.MT_enc; push('Mise en tension (ossature + P1)', 'MT', LIM.MT);
  for (const ph of ['MS', 'ES']) { const nm = ph === 'MS' ? 'Mise en service (P1)' : 'Service définitif (P2)'; push(`${nm} — quasi permanente`, `${ph}_QL`, LIM.QL); push(`${nm} — fréquente`, `${ph}_freq`, LIM.freq); push(`${nm} — rare`, `${ph}_rare`, LIM.rare); }
  rec.forEach(e => { e.ok = e.cmax <= e.cLim + 1e-9 && e.enc >= e.encLim - 1e-9 && (e.horsLim === null || e.hors >= e.horsLim - 1e-9); });
  out.extremes = rec;

  if (o.stressOnly) return out;
  // ---- armatures passives longitudinales
  const x0 = r.geo.x0, nSp = x0.length - 1;
  const nearSupport = x => { for (let i = 1; i < nSp; i++) { const Ll = x0[i] - x0[i - 1], Lr = x0[i + 1] - x0[i]; if (x >= x0[i] - 0.1 * Ll - 1e-6 && x <= x0[i] + 0.1 * Lr + 1e-6) return true; } return false; };
  const nfArea = (sT, sC, b) => { if (!(sT < 0)) return 0; const ht = sC > 0 ? h * (-sT) / (-sT + sC) : h; const Bt = b * ht; return Bt / 1000 + (-sT * Bt / 2) * lim.ft28 / (steel.fe * (-sT)); };
  for (const row of out.stresses) {
    let top = 0, bot = 0;
    for (const ph of ['MS', 'ES']) for (const c of row.phases[ph].rare) { top = Math.max(top, nfArea(c.s, c.i, sec.bTop)); bot = Math.max(bot, nfArea(c.i, c.s, sec.bBot)); }
    const skT = steel.skin * sec.bTop, skB = steel.skin * sec.bBot, sup = nearSupport(row.x) ? 0.0015 * sec.B : 0;
    out.steel.push({ x: row.x, label: row.label, top: { skin: skT, nf: top, As: Math.max(skT, top) }, bot: { skin: skB, nf: bot, sup, As: Math.max(skB, bot, sup) } });
  }

  // ---- ELU de flexion
  const fbu = 0.85 * lim.fc28 / steel.gb, fsu = steel.fe / steel.gs, fpu = steel.fpeg / steel.gp, Ep = o.Ep, Apt = r.nAp;
  for (const [k, row] of out.stresses.entries()) {
    const x = row.x, z = row.z, Mq = o.M.elu(x), As = out.steel[k];
    for (const [ph, P0] of [['MT', r.MT.max], ['MS', r.MS.max], ['ES', r.ES.min]]) {
      if (ph === 'MT' && !o.M.eluMT) continue;
      const F = r.at(P0.F, x), sp2 = r.at(P0.sig, x), Mh = r.at(P0.Mhyp, x), ML = ph === 'MT' ? o.M.eluMT(x) : Mq;
      const res = {};
      for (const sgn of ['min', 'max']) {
        const Mcal = ML[sgn] + F * z + Mh;
        const hog = Mcal < 0, b = hog ? sec.bBot : sec.bTop, AsT = hog ? As.top.As : As.bot.As;
        const lim0 = mLim({ N: F, hog, h, v, vp, b, As: AsT, d: h - (steel.cover ?? 0.035), zc: z, Ap: Apt, sp2, Ep, Es: steel.Es, fbu, fsu, fpu });
        res[sgn] = { Mcal, ...lim0, ok: Math.abs(Mcal) <= lim0.Mlim + 1e-9 };
      }
      out.elu.push({ x, label: row.label, ph, ...res });
    }
  }

  // ---- effort tranchant au voisinage des appuis intermédiaires (section à h/2)
  if (o.V) {
    const bn = sec.bBot - o.nCables * o.phiG / 2, zl = 2 * h / 3;
    for (let i = 1; i < nSp; i++) for (const side of [-1, 1]) {
      const x = x0[i] + side * h / 2, F = r.at(r.ES.min.F, x), th = r.at(r.th, x), j = side < 0 ? i - 1 : i;
      const Vh = r.ES.min.hyp.V[j], Vp = F * th + Vh;          // relevage du câble (iso) + hyperstatique
      const Vels = o.V.els(x), Velu = o.V.elu(x);
      const red = Vl => { const a = Vl.max + Vp, b2 = Vl.min + Vp; return Math.abs(a) > Math.abs(b2) ? a : b2; };
      const Vr = red(Vels), Vu = red(Velu), sx = F / sec.B, ft = lim.ft28, fc = lim.fc28;
      const tau = Math.abs(Vr) / (bn * zl), tauU = Math.abs(Vu) / (bn * zl);
      const tauBar = Math.sqrt(Math.max(0, Math.min(0.4 * ft * (ft + sx), 2 * ft / fc * (0.6 * fc - sx) * (ft + sx))));
      const beta = Math.max(Math.PI / 6, 0.5 * Math.atan2(2 * tauU, sx)), sb = 2 * tauU / Math.sin(2 * beta), sbLim = (2 / 3) * fbu;
      const AtS = Math.max(steel.atMin ?? 0, (tauU - ft / 3) * Math.tan(beta)) / fsu;        // A_t/(b_n s_t) [m²/m²] : BPEL 7.3,22 ; minimum de la note PSIDP-EL (≈ 0,1 MPa)
      out.shear.push({ support: i, side: side < 0 ? 'gauche' : 'droite', x, F, Vp, Vels: Vr, Velu: Vu, sx, tau, tauBar, okELS: tau <= tauBar, tauU, beta, sb, sbLim, okBielle: sb <= sbLim, AtS });
    }
  }
  return out;
}

/**
 * Moment limite ELU d'une section rectangulaire précontrainte (BPEL 6.3) sous l'effort normal N = F (précontrainte
 * extérieure appliquée au câble, la surtension σ_p − σ_p2 étant comptée comme armature) : recherche de l'axe neutre par
 * dichotomie sur N_lim = N, béton parabole-rectangle (2 ‰ / 3,5 ‰), acier passif tendu élasto-plastique, allongement
 * limité à 10 ‰. Moments rapportés à la fibre moyenne de la section brute. Retour : M_lim (valeur absolue), x, ε_b, ε_s.
 */
export function mLim({ N, hog, h, v, vp, b, As, d, zc, Ap, sp2, Ep, Es, fbu, fsu, fpu }) {
  const uG = hog ? vp : v;                         // fibre moyenne depuis la fibre comprimée
  const uP = hog ? vp + zc : v - zc;               // câble depuis la fibre comprimée
  const sigC = e => (e <= 0 ? 0 : e >= 2e-3 ? fbu : fbu * (1 - (1 - e / 2e-3) ** 2));
  const state = x => {
    const xAB = 3.5 / 13.5 * d, ec = x <= xAB ? 10e-3 * x / (d - x) : 3.5e-3;
    const eps = u => ec * (x - u) / x;             // raccourcissement > 0
    let C = 0, MC = 0; const nS = 120, top = Math.min(x, h);
    for (let k = 0; k < nS; k++) { const u = (k + 0.5) * top / nS, f = sigC(eps(u)) * b * top / nS; C += f; MC += f * (uG - u); }
    const es = -eps(d), Fs = es > 0 ? As * Math.min(Es * es, fsu) : 0;
    const dep = -eps(uP), sp = Math.max(0, Math.min(Ep * (sp2 / Ep + dep), fpu)), dFp = Ap * (sp - sp2);
    return { Nint: C - Fs - dFp, M: MC + Fs * (d - uG) + dFp * (uP - uG), ec, es };
  };
  let lo = 1e-4, hi = h * 1.5;
  if (state(hi).Nint < N) { const s = state(hi); return { Mlim: s.M, x: hi, eb: -s.ec * 1000, es: s.es * 1000, horsDomaine: true }; }
  for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; if (state(m).Nint < N) lo = m; else hi = m; }
  const x = (lo + hi) / 2, s = state(x);
  return { Mlim: s.M, x, eb: -s.ec * 1000, es: s.es * 1000 };
}
