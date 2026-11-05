/**
 * Entretoises intermédiaires d'un tablier à poutres BA (dossier Sétra PSI-BA 77, pièce IV § 7 et pièce V § 1.7) :
 * efforts dans l'entretoise la plus sollicitée (celle de la travée où les entretoises sont le plus espacées), puis
 * flexion, effort tranchant, ancrage des aciers inférieurs et étriers de suspension.
 *
 * Hypothèses de PSI-BA, reprises ici :
 *  - Courbon : l'entretoise est indéformable, les poutres (identiques) réagissent sur elle en R_k = P (1/n + e y_k/Σ y²) ;
 *  - coefficient de réduction longitudinal : une charge placée à la distance x de l'entretoise (entre les deux entretoises
 *    voisines, entraxe λ) agit sur elle comme une charge directement appliquée affectée de (1 − |x|/λ) ; d'où, par file,
 *    le « coefficient longitudinal » (charge maximale reportée sur l'entretoise, δ compris) : Bc (roue arrière de 6 t au
 *    droit de l'entretoise, autres roues dans les intervalles voisins), A(l) (bande de 1 m sur les deux intervalles),
 *    Bt et Br au droit de l'entretoise, trottoirs (charge locale 4,5 kN/m² sur 1 m), chenille Mc120 centrée ;
 *  - coefficient transversal : charges déplacées en travers de la chaussée par pas de 0,25 m (au plus près à 0,25 m des
 *    trottoirs pour Bc, files accolées à 2,50 m), lignes d'influence des moments à 0,25 m d'intervalle et des efforts
 *    tranchants au droit des poutres.
 * Eurocodes (en complément) : même modèle, TS (essieu au droit de l'entretoise, l'autre à 1,20 m), UDL sur les parties
 * défavorables, trottoirs 3 kN/m² (gr1a) et LM2 (gr1b), voies conventionnelles placées au plus défavorable.
 * Charges permanentes : superstructures sur λ et poids propre de l'entretoise (le hourdis descend dans les poutres par
 * les panneaux de dalle) ; mêmes réactions de Courbon.
 * Unités : m, kN, kN·m.
 */
import { BC, MC120, TROTTOIR, chargeA } from '../loads_f61.js';
import { lm1, lm2, notionalLanes, EC_ALPHA, FOOTWAY } from '../loads_ec.js';
import { tBeamULS, tBeamSLS, limitesELS, etriersBAEL, etriersEC2 } from './design.js';

const PAS = 0.05;
const plage = (a, b, pas = PAS) => { const out = []; if (b < a - 1e-9) return out; const n = Math.max(0, Math.round((b - a) / pas)); for (let i = 0; i <= n; i++) out.push(a + (b - a) * (n ? i / n : 0)); return out; };
const tri = (x, lam) => Math.max(0, 1 - Math.abs(x) / lam);

/** Coefficients longitudinaux (kN par file de roues, par chenille ou par mètre de largeur), δ et coefficients bc/bt exclus. */
export function coefficientsLongitudinaux(lam) {
  // Bc : deux camions d'une file au pas minimal ; maximum quand une roue est au droit de l'entretoise (somme de « tentes »)
  const roues = BC.axlesTwoTrucks.map(a => ({ d: a.d, P: a.P / 2 }));
  let Bc = 0;
  for (const r0 of roues) Bc = Math.max(Bc, roues.reduce((s, r) => s + r.P * tri(r.d - r0.d, lam), 0));
  // Mc120 : chenille de 6,10 m centrée sur l'entretoise : q ∫ (1 − |x|/λ) dx
  const a = Math.min(MC120.trackLength / 2, lam), Mc = MC120.qTrack * (2 * a - a * a / lam);
  return { Bc, Bt: 160, Br: 100, Mc, A: lam, trott: TROTTOIR.qLocal * lam, lam };
}

/**
 * p = { ys (axes des poutres, centrés), roadway { y1, y2 }, footways, lines, bands, edges [y_g, y_d] (bords du tablier),
 *   lam (entraxe des entretoises), L (portée de la travée, pour A(l)), deltaB, deltaMc, classe, nRetenue, mil,
 *   alphaEC, b0 (épaisseur de l'entretoise), H (hauteur, = poutres), hd, cover, fck, fyk, fiss, b1 }
 */
export function entretoiseIntermediaire(p) {
  const ys = p.ys, n = ys.length, S2 = ys.reduce((s, y) => s + y * y, 0), lam = p.lam;
  const w = e => ys.map(y => 1 / n + (S2 > 0 ? e * y / S2 : 0));
  const IM = y => e => { const R = w(e); let m = 0; ys.forEach((yk, k) => { if (yk < y) m += R[k] * (y - yk); }); return m - (e < y ? y - e : 0); };
  const IV = y => e => { const R = w(e); let v = 0; ys.forEach((yk, k) => { if (yk < y) v += R[k]; }); return v - (e < y ? 1 : 0); };
  const integ = (f, a, b, part = 0) => { if (b <= a) return 0; const m = Math.max(4, Math.ceil((b - a) / 0.02)), h = (b - a) / m; let s = 0;
    for (let i = 0; i < m; i++) { const v = f(a + (i + 0.5) * h); s += part > 0 ? Math.max(v, 0) : part < 0 ? Math.min(v, 0) : v; } return s * h; };

  // ---- Fascicule 61
  const { y1, y2 } = p.roadway, Lr = y2 - y1, Lc = Lr - 0.5 * (p.nRetenue || 0), yc1 = y1 + (Lr - Lc) / 2, yc2 = y2 - (Lr - Lc) / 2;
  const nv = Math.max(1, Lc >= 5 && Lc < 6 ? 2 : Math.floor(Lc / 3)), v = Lc / nv, cl = p.classe || (Lr >= 7 ? 1 : Lr > 5.5 ? 2 : 3);
  const CL = coefficientsLongitudinaux(lam), dB = p.deltaB ?? 1, dM = p.deltaMc ?? 1, withMc = /Mc120/.test(p.mil || 'Mc120');
  const bt = { 1: 1.0, 2: 0.9, 3: null }[cl];
  const voies = Array.from({ length: nv }, (_, i) => [yc1 + i * v, yc1 + (i + 1) * v]);
  const coefA = k => chargeA(p.L, { classe: cl, nVoiesChargees: k, v }).q * lam;
  const systemesF61 = f => {
    const env = () => ({ max: 0, min: 0 }), out = { Bc: env(), Bt: env(), Br: env(), Mc120: env(), A: env(), trott: env() }, upd = (o, x) => { if (x > o.max) o.max = x; if (x < o.min) o.min = x; };
    for (let nf = 1; nf <= Math.min(nv, 5); nf++) {
      const k = CL.Bc * dB * BC.bc[cl][nf - 1];
      for (const s of plage(yc1, yc2 - 2.5 * nf)) { let t = 0; for (let i = 0; i < nf; i++) t += f(s + 0.25 + 2.5 * i) + f(s + 2.25 + 2.5 * i); upd(out.Bc, k * t); }
    }
    if (bt) for (let nf = 1; nf <= Math.min(nv, 2); nf++) {
      const wb = Math.min(3, Lc / nf), k = CL.Bt * dB * bt;
      for (const s of plage(yc1, yc2 - wb * nf)) { let t = 0; for (let i = 0; i < nf; i++) { const e = s + wb * i + wb / 2; t += f(e - 1) + f(e + 1); } upd(out.Bt, k * t); }
    }
    for (const e of plage(yc1 + 0.3, yc2 - 0.3)) upd(out.Br, CL.Br * dB * f(e));
    if (withMc) for (const e of plage(yc1 + 2.15, yc2 - 2.15)) upd(out.Mc120, CL.Mc * dM * (integ(f, e - 2.15, e - 1.15) + integ(f, e + 1.15, e + 2.15)));
    for (let mask = 1; mask < (1 << nv); mask++) {
      const l = voies.filter((_, i) => mask & (1 << i)), k = coefA(l.length);
      upd(out.A, k * l.reduce((s, [a, b]) => s + integ(f, a, b), 0));
    }
    for (const fw of p.footways || []) { const t = CL.trott * integ(f, fw.y1, fw.y2); if (t > 0) out.trott.max += t; else out.trott.min += t; }
    return out;
  };

  // ---- Eurocodes : LM1 (TS + UDL) + trottoirs 3 kN/m² (gr1a), LM2 (gr1b)
  const alpha = EC_ALPHA[p.alphaEC || 'recommended'] || EC_ALPHA.recommended, nl = notionalLanes(Lr), m1 = lm1(nl.n, alpha), l2 = lm2(alpha);
  const kTS = 1 + tri(1.2, lam);
  const perms = (a => { const r = []; const go = (pre, rest) => { if (!rest.length) { r.push(pre); return; } rest.forEach((x, i) => go([...pre, x], rest.filter((_, j) => j !== i))); }; go([], a); return r; })(Array.from({ length: Math.min(nl.n, 4) }, (_, i) => i));
  const systemesEC = f => {
    const res = { gr1a: { max: 0, min: 0 }, gr1b: { max: 0, min: 0 }, TS: { max: 0, min: 0 } };
    for (const sg of [1, -1]) {
      const g = e => sg * f(e);
      let best = 0, bestTS = 0;
      for (const o of plage(0, nl.wr, 0.25)) {
        const lanes = Array.from({ length: nl.n }, (_, i) => [y1 + o + nl.wl * i, y1 + o + nl.wl * (i + 1)]);
        const resid = integ(g, y1, y1 + o, 1) + integ(g, y1 + o + nl.wl * nl.n, y2, 1);
        // apport d'une voie pour le numéro i : TS (roues à ≥ 0,20 m des bords de voie) + UDL sur ses parties défavorables
        const apport = (L, i) => { const ln = m1.lanes[i], [a, b] = L; let ts = 0;
          if (ln.Q > 0) for (const c of plage(a + 1.2, b - 1.2)) ts = Math.max(ts, ln.Q / 2 * kTS * (g(c - 1) + g(c + 1)));
          return { ts, udl: ln.q * lam * integ(g, a, b, 1) }; };
        for (const pm of perms) {
          let tot = m1.qr * lam * resid, tts = 0;
          lanes.forEach((L, j) => { const i = j < pm.length ? pm[j] : j, q = apport(L, i); tot += Math.max(0, q.ts + q.udl); tts += Math.max(0, q.ts); });
          if (tot > best) best = tot; if (tts > bestTS) bestTS = tts;
        }
      }
      const fw = (p.footways || []).reduce((s, q) => s + FOOTWAY.qfkCombi * lam * integ(g, q.y1, q.y2, 1), 0);
      let lm2v = 0;
      for (const e of plage(y1 + 1.175, y2 - 1.175)) lm2v = Math.max(lm2v, l2.Q / 2 * (g(e - 1) + g(e + 1)));
      for (const e of plage(y1 + 0.175, y2 - 0.175)) lm2v = Math.max(lm2v, l2.Q / 2 * g(e));
      const k = sg > 0 ? 'max' : 'min';
      res.gr1a[k] = sg * (best + fw); res.gr1b[k] = sg * lm2v; res.TS[k] = sg * bestTS;
    }
    return res;
  };

  // ---- charges permanentes : hourdis et superstructures sur λ, poids propre de l'entretoise entre poutres de rive
  const [eg, ed] = p.edges, he = p.H - p.hd;
  // (le poids du hourdis descend dans les poutres par les panneaux de dalle : comme dans la note PSI-BA, seules les
  // superstructures, en rive surtout, et l'entretoise elle-même chargent l'entretoise)
  const fichiers = [...(p.hourdisSurEntretoise ? [{ nom: 'hourdis', q: 25 * p.hd * lam, y1: eg, y2: ed }] : []),
    ...(p.lines || []).map(l => ({ nom: 'superstructure', P: l.g * lam, e: l.e, kmin: l.kmin ?? 1, kmax: l.kmax ?? 1 })),
    ...(p.bands || []).map(b => ({ nom: 'superstructure', q: b.q * lam, y1: b.y1, y2: b.y2, kmin: b.kmin ?? 1, kmax: b.kmax ?? 1 })),
    { nom: 'entretoise', q: 25 * p.b0 * he, y1: ys[0], y2: ys[n - 1] }];
  const perm = f => { let nom = 0, max = 0, min = 0;
    for (const F of fichiers) { const c = F.P != null ? F.P * f(F.e) : integ(f, F.y1, F.y2) * F.q / 1, a = (F.kmin ?? 1) * c, b = (F.kmax ?? 1) * c; nom += c; max += Math.max(a, b); min += Math.min(a, b); }
    return { nom, max, min }; };

  // ---- combinaisons (mêmes règles que les poutres : BAEL 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)])
  const comb = (G, F, E) => {
    const AB = s => Math.max(0, s * F.A[s > 0 ? 'max' : 'min'], s * F.Bc[s > 0 ? 'max' : 'min'], s * F.Bt[s > 0 ? 'max' : 'min'], s * F.Br[s > 0 ? 'max' : 'min']);
    const pick = (o, s) => s * o[s > 0 ? 'max' : 'min'];
    const out = {};
    for (const s of [1, -1]) {
      const g = s > 0 ? G.max : G.min, gU = (s * g > 0 ? 1.35 : 1.0) * g, tr = Math.max(0, pick(F.trott, s)), mc = Math.max(0, pick(F.Mc120, s)), ab = AB(s);
      const qE = Math.max(0, pick(E.gr1a, s), pick(E.gr1b, s)), k = s > 0 ? 'max' : 'min';
      out[k] = { ELU_F61: gU + s * Math.max(1.605 * (ab + tr), 1.35 * (mc + tr)), ELS_F61: g + s * Math.max(1.2 * (ab + tr), mc + tr),
        ELU_EC: gU + s * 1.35 * qE, ELS_EC: g + s * qE,
        // « effort extrême » de la note PSI-BA : G + le plus défavorable des systèmes (valeurs caractéristiques, δ compris)
        PSIBA: G.nom + s * Math.max(0, ab, mc, tr) };
    }
    return out;
  };

  const yM = []; for (let y = ys[0]; y <= ys[n - 1] + 1e-9; y += 0.25) yM.push(+y.toFixed(6));
  for (const y of ys) if (!yM.some(q => Math.abs(q - y) < 1e-6)) yM.push(y);
  yM.sort((a, b) => a - b);
  const moments = yM.map(y => { const f = IM(y), F = systemesF61(f), E = systemesEC(f), G = perm(f); return { y, G, F61: F, EC: E, ...comb(G, F, E) }; });
  const eps = 1e-6, yV = ys.flatMap((y, k) => [...(k > 0 ? [{ y: y - eps, poutre: k, cote: 'gauche' }] : []), ...(k < n - 1 ? [{ y: y + eps, poutre: k, cote: 'droite' }] : [])]);
  const tranchants = yV.map(q => { const f = IV(q.y), F = systemesF61(f), E = systemesEC(f), G = perm(f); return { ...q, G, F61: F, EC: E, ...comb(G, F, E) }; });

  // ---- dimensionnement
  const b0 = p.b0, d = Math.max(p.H - 2 * (p.cover ?? 0.10), 0.5 * p.H), dSup = p.H - 0.07, Lt = ys[n - 1] - ys[0], bi = Math.max((lam - b0) / 2, 0);
  const beffB = b0 + 2 * Math.min(Lt / 10, bi), l0 = 0.85 * (p.b1 || (n > 1 ? Lt / (n - 1) : Lt)), beffE = b0 + 2 * Math.min(0.2 * bi + 0.1 * l0, 0.2 * l0, bi);
  const ext = (arr, key, s) => arr.reduce((m, q) => (s > 0 ? Math.max(m, q.max[key]) : Math.min(m, q.min[key])), 0);
  const Vext = key => tranchants.reduce((m, q) => Math.max(m, Math.abs(q.max[key]), Math.abs(q.min[key])), 0);
  const yDe = (arr, key, s) => (arr.reduce((b, q) => ((s > 0 ? q.max[key] > b.max[key] : q.min[key] < b.min[key]) ? q : b), arr[0]) || {}).y;
  const lB = limitesELS({ code: 'BAEL', fck: p.fck, fyk: p.fyk, fiss: p.fiss || 'prej' }), lE = limitesELS({ code: 'EC', fck: p.fck, fyk: p.fyk });
  const fcdE = 0.85 * p.fck / 1.5, nu1 = 0.6 * (1 - p.fck / 250);
  const regle = (code) => {
    const kU = code === 'BAEL' ? 'ELU_F61' : 'ELU_EC', kS = code === 'BAEL' ? 'ELS_F61' : 'ELS_EC', lim = code === 'BAEL' ? lB : lE, beff = code === 'BAEL' ? beffB : beffE;
    const Mp = ext(moments, kU, 1), Mn = ext(moments, kU, -1), Msp = ext(moments, kS, 1), Msn = ext(moments, kS, -1), Vu = Vext(kU);
    const infU = tBeamULS({ M: Mp, beff, hf: p.hd, b0, d, fck: p.fck, fyk: p.fyk, code }), supU = tBeamULS({ M: -Mn, beff: b0, hf: p.H, b0, d: dSup, fck: p.fck, fyk: p.fyk, code });
    const infS = tBeamSLS({ M: Msp, beff, hf: p.hd, b0, d, sigS: lim.sigS, sigC: lim.sigC }), supS = tBeamSLS({ M: -Msn, beff: b0, hf: p.H, b0, d: dSup, sigS: lim.sigS, sigC: lim.sigC });
    const fy = p.fyk / 1.15;
    if (code === 'BAEL') {
      const V = etriersBAEL({ Vu, b0, d, fc28: p.fck, fe: p.fyk, fiss: p.fiss || 'prej' });
      const bNec = Vu / (V.tauLim * 1000 * d);
      return { code, beff, Mpos: Mp, Mneg: Mn, MserPos: Msp, MserNeg: Msn, Vu, yMpos: yDe(moments, kU, 1), yMneg: yDe(moments, kU, -1), inf: { ULS: infU, ELS: infS, As: infU.As == null ? null : Math.max(infU.As, infS.As || 0) },
        sup: { ULS: supU, ELS: supS, As: supU.As == null ? null : Math.max(supU.As, supS.As || 0) }, V, ancrage: Vu / (fy * 1000), suspente: Vu / (fy * 1000), bNec,
        ok: V.ok && infU.As != null && supU.As != null && infS.okC !== false && supS.okC !== false };
    }
    const z = 0.9 * d, V = etriersEC2({ VEd: Vu, bw: b0, z, fck: p.fck, fyk: p.fyk });
    const bNec = 2 * Vu / (z * nu1 * fcdE * 1000);
    return { code, beff, Mpos: Mp, Mneg: Mn, MserPos: Msp, MserNeg: Msn, Vu, yMpos: yDe(moments, kU, 1), yMneg: yDe(moments, kU, -1), inf: { ULS: infU, ELS: infS, As: infU.As == null ? null : Math.max(infU.As, infS.As || 0) },
      sup: { ULS: supU, ELS: supS, As: supU.As == null ? null : Math.max(supU.As, supS.As || 0) }, V, ancrage: Vu * V.cot / 2 / (fy * 1000), suspente: Vu / (fy * 1000), bNec,
      ok: V.ok && infU.As != null && supU.As != null && infS.okC !== false && supS.okC !== false };
  };
  const BAEL = regle('BAEL'), EC = regle('EC');
  for (const D of [BAEL, EC]) {
    D.barresInf = D.inf.As != null ? propositionBarres(Math.max(D.inf.As, D.ancrage), b0) : null;
    D.barresSup = D.sup.As != null ? propositionBarres(D.sup.As, b0, { phiMin: 12 }) : null;
    // étriers de suspension (PSI-BA V.1.7.4 ; Fascicule 61 titre VI art. 38 ; EN 1992-1-1 § 9.2.5) : la réaction de l'entretoise,
    // appliquée en partie basse de la poutre, est remontée par des étriers de la poutre (cadres à 2 brins HA12)
    D.suspente2HA12 = Math.ceil(D.suspente / (2 * 1.131e-4));
  }
  return { lam, L: p.L, travee: p.travee, b0, H: p.H, he, hd: p.hd, d, dSup, beffB, beffE, coefLong: { ...CL, deltaB: dB, deltaMc: dM }, coefA: coefA(nv), classe: cl, nv, v,
    moments, tranchants, BAEL, EC, ok: BAEL.ok && EC.ok, bNec: Math.max(BAEL.bNec, EC.bNec), longueur: Lt - (p.bAme ?? 0) };
}

/**
 * Barres longitudinales d'une entretoise de largeur b : HA12 à HA32, au plus trois lits, entraxe libre ≥ max(φ ; 2,5 cm),
 * enrobage latéral 4 cm. Rend le choix le plus simple (un lit si possible, puis le plus petit diamètre).
 */
export function propositionBarres(As, b, { phiMin = 16 } = {}) {
  const cands = [];
  for (const phi of [12, 14, 16, 20, 25, 32].filter(x => x >= phiMin)) {
    const a = Math.PI * (phi / 1000) ** 2 / 4, e = Math.max(phi / 1000, 0.025), parLit = Math.max(1, Math.floor((b - 2 * 0.04 + e) / (phi / 1000 + e)));
    const n = Math.max(2, Math.ceil(As / a - 1e-9)), lits = Math.ceil(n / parLit);
    if (lits <= 3) cands.push({ n, phi, lits, parLit, As: n * a });
  }
  if (!cands.length) return null;
  return cands.sort((x, y) => x.lits - y.lits || x.phi - y.phi)[0];
}
