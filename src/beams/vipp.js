/**
 * Chaîne de dimensionnement d'une poutre précontrainte par post-tension (VIPP) de pont à travées indépendantes :
 *
 *  1. section par dimensions (vipp_section.js) et largeur efficace du hourdis (NF EN 1992-1-1 § 5.3.2.1) ;
 *  2. câblage : n câbles paraboliques ancrés aux abouts, regroupés par lits dans le talon à mi-travée ; tension à
 *     σ_p0 = min(0,8 f_pk ; 0,9 f_p0,1k) (§ 5.10.2.1), frottement et recul d'ancrage (§ 5.10.5.2 et 5.10.5.3) ;
 *  3. calcul par phases (moteur pas à pas de src/phasage, méthode de Bažant) : mise en tension câble par câble de la
 *     poutre seule sous son poids (raccourcissement élastique, § 5.10.5.1), coulage du hourdis porté par la poutre, section
 *     composée, superstructures ; fluage et retrait EC2 (annexe B, § 3.1.4) des deux bétons, retrait différentiel,
 *     relaxation (§ 3.3.2) : pertes différées et contraintes à chaque pas ;
 *  4. contraintes sous trafic (section composée homogène, E_cm) et vérifications ELS : construction 0,6 f_ck(t)
 *     (§ 5.10.2.2 (5)), caractéristique 0,6 f_ck (§ 7.2 (2), EN 1992-2 § 7.2 (102)), quasi permanente 0,45 f_ck (§ 7.2 (3)),
 *     décompression au niveau des gaines (EN 1992-2 § 7.3.1 (105), tableau 7.101N : quasi permanente en XC, fréquente en
 *     XD / XS) ; BPEL 91 classe II sous combinaison rare du Fascicule 61 ;
 *  5. ELU de flexion (§ 6.1 : diagramme rectangulaire, f_cd = α_cc f_ck/γ_c, α_cc = 0,85 — EN 1992-2 § 3.1.6 (101) ;
 *     palier horizontal de l'acier de précontrainte f_pd = f_p0,1k/1,15, § 3.3.6 (7)) avec allongement préalable
 *     ε_pm∞ ; armatures passives de complément et minimum § 9.2.1.1 ;
 *  6. effort tranchant (§ 6.2.3) : composante verticale de la précontrainte V_pd, α_cw (σ_cp), âme nette
 *     b_w,nom = b_w − ½ Σφ (gaines métalliques injectées, § 6.2.3 (6)), cot θ entre 1 et 2,5, étriers A_sw/s et minimum
 *     ρ_w,min = 0,08 √f_ck / f_yk (§ 9.2.2 (5)) ;
 *  7. flèches et contre-flèches, pertes par câble, quantités et diagnostic de conception (guide Sétra VIPP 1996).
 * Unités : m, kN, kN·m ; contraintes en MPa, traction positive (comme le module de phasage).
 */
import { calculPhasage } from '../phasage/phasage.js';
import { betonEC2 } from '../phasage/fluage.js';
import { sectionVIPP, contourVIPP, largeurEfficaceT } from './vipp_section.js';

/** Unités de précontrainte courantes (torons T15 super, 150 mm² ; T13 super, 100 mm²) et diamètre intérieur de gaine. */
export const UNITES = {
  '7T15S': { Ap: 7 * 150e-6, phi: 0.065 }, '9T15S': { Ap: 9 * 150e-6, phi: 0.070 }, '12T15S': { Ap: 12 * 150e-6, phi: 0.080 },
  '13T15S': { Ap: 13 * 150e-6, phi: 0.085 }, '19T15S': { Ap: 19 * 150e-6, phi: 0.095 }, '12T13S': { Ap: 12 * 100e-6, phi: 0.065 },
};

export const DEFAUTS_VIPP = {
  beton: { fckP: 40, fckH: 30, RH: 70, cimP: 'R', cimH: 'N', gamma: 25 },
  cables: { nc: 4, n2: 2, unite: '12T15S', parLit: 3, cBas: 0.13, ev: 0.16, yaBas: 0.45, yaHaut: 1.40, sigP0: null, fpk: 1860, fp01k: 1640, mu: 0.19, k: 0.007, g: 0.006, tension: 'deux', classe: 2, rho1000: 2.5 },
  dates: { t1: 7, t2: 35, t2b: 42, t3: 90, fin: 36500 },
  expo: 'XC', fyk: 500, cs: 0.06, nb: 20,
};

const sq = x => x * x;

/** Géométrie des câbles : ordonnées à mi-travée (lits) et aux ancrages, y_i(x) parabolique, pente. */
export function traceCables(c, L, f) {
  const u = UNITES[c.unite] || UNITES['12T15S'], n = Math.max(1, Math.round(c.nc)), per = Math.max(1, Math.round(c.parLit || 1));
  const cab = Array.from({ length: n }, (_, i) => {
    const lit = Math.floor(i / per), ym = c.cBas + lit * c.ev;
    const ya = n === 1 ? c.yaBas : c.yaBas + i * (c.yaHaut - c.yaBas) / (n - 1);
    const nLit = Math.min(per, n - lit * per), pos = i % per;
    return { i, lit, ym, ya, zm: (pos - (nLit - 1) / 2) * (u.phi + 0.04) };   // zm : position horizontale dans le talon (dessin)
  });
  const y = (cb, x) => cb.ym + (cb.ya - cb.ym) * sq(1 - 2 * x / L);
  const pente = (cb, x) => -4 * (cb.ya - cb.ym) / L * (1 - 2 * x / L);
  const C = contourVIPP(f), libre = [];
  // contrôles d'encombrement (EN 1992-1-1 § 8.10.1.3 : distance libre entre gaines ≥ φ, ≥ 40 mm vertical, 50 mm horizontal)
  if (c.ev - u.phi < Math.max(u.phi, 0.04) - 1e-9) libre.push(`entraxe vertical des lits ${(c.ev * 100).toFixed(0)} cm < φ + max(φ ; 4 cm) = ${((u.phi + Math.max(u.phi, 0.04)) * 100).toFixed(0)} cm (§ 8.10.1.3)`);
  const largeurLit = per * u.phi + (per - 1) * Math.max(u.phi, 0.05) + 2 * 0.06;
  if (largeurLit > f.bta + 1e-9) libre.push(`${per} gaines par lit demandent ${(largeurLit * 100).toFixed(0)} cm de talon (enrobage 6 cm) > ${(f.bta * 100).toFixed(0)} cm`);
  const yHautLit = cab.reduce((m, cb) => Math.max(m, cb.ym), 0) + u.phi / 2;
  if (yHautLit > C.yPan + 1e-9) libre.push(`le lit supérieur (${yHautLit.toFixed(2)} m) sort du talon (pan incliné jusqu'à ${C.yPan.toFixed(2)} m)`);
  if (c.cBas - u.phi / 2 < 0.05) libre.push('enrobage de la gaine inférieure < 5 cm');
  if (c.yaHaut > f.hp - 0.15) libre.push('ancrage supérieur trop près de l\'extrados de la poutre (place de la plaque d\'ancrage)');
  return { u, cab, y, pente, alerte: libre };
}

/** Contraintes (MPa, traction +) aux fibres d'une partie d'après N, M (kN, kN·m) : σ = N/A − M·y/I. */
const fibres = (N, M, A, I, vs, vi) => ({ s: (N / A - M * vs / I) / 1000, i: (N / A + M * vi / I) / 1000 });

/**
 * Moment résistant ultime (kN·m) de la section composée, axe neutre par dichotomie. Béton : bloc 0,8 x, η f_cd par zone
 * (hourdis puis poutre, largeur b(y) du contour) ; câbles i à la profondeur d_i avec allongement préalable ε_pm,i et palier
 * f_pd ; armatures passives A_s à d_s (f_yd). Renvoie { M, x, eps }.
 */
export function momentResistant({ S, cables, As = 0, ds, fcdP, fcdH, fpd, Ep = 195000, fyd = 435, ecu = 0.0035 }) {
  const f = S.forme, hp = f.hp, hd = S.hd, H = hp + hd, beff = S.comp.beff;
  const pts = S.poutre.contour.pts, iTop = pts.findIndex(q => q[0] === 0 && Math.abs(q[1] - hp) < 1e-12), ch = pts.slice(0, iTop + 1);
  const larg = y => {   // largeur de la poutre à l'ordonnée y (demi-contour droit, interpolation)
    for (let i = 1; i < ch.length; i++) { const [x1, y1] = ch[i - 1], [x2, y2] = ch[i]; if (y2 > y1 && y >= y1 && y <= y2) return 2 * (x1 + (x2 - x1) * (y - y1) / (y2 - y1)); }
    return f.bt;
  };
  const forces = x => {
    const L = [], a = Math.min(0.8 * x, H), nS = 120;
    for (let k = 0; k < nS; k++) {   // bandes de béton comprimé depuis l'extrados
      const z0 = a * k / nS, z1 = a * (k + 1) / nS, zc = (z0 + z1) / 2, y = H - zc;
      const F = y >= hp ? -fcdH * beff * (z1 - z0) : -fcdP * larg(y) * (z1 - z0);
      L.push({ F: F * 1000, d: zc });
    }
    for (const c of cables) {
      const e = c.epm + ecu * (c.d - x) / x, sig = Math.max(-fpd, Math.min(fpd, Ep * e));
      L.push({ F: sig * c.Ap * 1000, d: c.d, eps: e });
    }
    if (As > 0) { const e = ecu * (ds - x) / x; L.push({ F: Math.max(-fyd, Math.min(fyd, 200000 * e)) * As * 1000, d: ds }); }
    return L;
  };
  const somme = x => forces(x).reduce((s, q) => s + q.F, 0);
  let lo = 1e-4, hi = H * 1.25;
  for (let it = 0; it < 100; it++) { const m = (lo + hi) / 2; if (somme(m) > 0) lo = m; else hi = m; }
  const x = (lo + hi) / 2, L = forces(x);
  return { M: L.reduce((s, q) => s + q.F * q.d, 0), x, xd: x / Math.max(...cables.map(c => c.d), ds || 0), epsP: Math.min(...L.filter(q => q.eps !== undefined).map(q => q.eps)) };
}

/** Section de la poutre et données dérivées pour une portée L. */
export function geometrieVIPP(p, L) {
  const f = p.forme, beff = largeurEfficaceT({ b1: p.b1, bw: f.bt, l0: L });
  const bP = betonEC2({ fck: p.beton.fckP }), bH = betonEC2({ fck: p.beton.fckH });
  const S = sectionVIPP(f, { b1: p.b1, hd: p.hd, beff, nh: bH.Ecm / bP.Ecm });
  return { S, beff, nh: bH.Ecm / bP.Ecm };
}

/**
 * Chaîne complète pour une poutre k d'une travée de portée L.
 * ch = efforts de la poutre (Guyon-Massonnet) aux sections x : { x, G:{Mmax,Vmax}, TS, UDL, footway, gr1a, gr1b, A, Bc,
 *      Bt, Mc120, D240, trott } ; elsF61, eluF61 : combinaisons du Fascicule 61 (tableaux par section).
 */
export function chaineVIPP(p, L, ch, { elsF61 = null, eluF61 = null } = {}) {
  const D = DEFAUTS_VIPP, c = { ...D.cables, ...p.cables }, T = { ...D.dates, ...p.dates }, B = { ...D.beton, ...p.beton };
  if (!(T.t1 < T.t2 && T.t2 <= T.t2b && T.t2b <= T.t3 && T.t3 < T.fin)) throw new Error('VIPP : dates croissantes attendues (1re famille < hourdis ≤ 2e famille ≤ superstructures < fin)');
  const nb = p.nb || D.nb, f = p.forme, { S, beff, nh } = geometrieVIPP(p, L), P = S.poutre, H = S.hourdis;
  const tr = traceCables(c, L, f), u = tr.u, nc = tr.cab.length, n2 = Math.max(0, Math.min(nc - 1, Math.round(c.n2 || 0))), n1 = nc - n2;
  const bP = betonEC2({ fck: B.fckP, RH: B.RH, h0: P.h0, ciment: B.cimP }), bH = betonEC2({ fck: B.fckH, RH: B.RH, h0: H.h0, ciment: B.cimH });
  const sigP0 = c.sigP0 || Math.min(0.8 * c.fpk, 0.9 * c.fp01k), P0 = sigP0 * u.Ap * 1000;
  const xs = Array.from({ length: nb + 1 }, (_, j) => j * L / nb);
  const interp = (arr, x) => { if (!arr) return 0; const X = ch.x, n = X.length; if (x <= X[0]) return arr[0]; for (let i = 1; i < n; i++) if (x <= X[i] + 1e-9) return arr[i - 1] + (arr[i] - arr[i - 1]) * (x - X[i - 1]) / ((X[i] - X[i - 1]) || 1); return arr[n - 1]; };
  const Mq = (id, x, kind = 'Mmax') => (ch[id] ? interp(ch[id][kind], x) : 0);

  // ---- charges permanentes par poutre : poids propres et superstructures (part de G de Guyon au-delà des poids propres)
  const wP = P.A * B.gamma, wH = H.poids * B.gamma, wE = p.gExtra || 0;
  const MGmid = Mq('G', L / 2), wG = 8 * MGmid / (L * L), wS = Math.max(wG - wP - wH, 0) + wE;

  // ---- modèle du calcul par phases
  const noeuds = xs.map(x => [x, 0]), barres = [], iP = [], iH = [];
  for (let k = 0; k < nb; k++) { iP.push(barres.length); barres.push({ i: k, j: k + 1, A: P.A, I: P.I, e: 0, beton: 'P', nom: 'poutre' }); }
  for (let k = 0; k < nb; k++) { iH.push(barres.length); barres.push({ i: k, j: k + 1, A: H.A, I: H.I, e: H.e, beton: 'H', nom: 'hourdis' }); }
  const cables = tr.cab.map((cb, ic) => ({
    nom: `câble ${ic + 1}`, Ap: u.Ap, P0, mu: c.mu, k: c.k, g: c.g, tension: c.tension, fpk: c.fpk, classe: c.classe, rho1000: c.rho1000, phase: ic,
    segments: iP.map((b, k) => ({ barre: b, ei: tr.y(cb, xs[k]) - P.yG, ej: tr.y(cb, xs[k + 1]) - P.yG })),
  }));
  const appuis = [{ n: 0, ddl: ['ux', 'uy'] }, { n: nb, ddl: ['uy'] }];
  const charge = (idx, w) => idx.map(barre => ({ barre, w }));
  // 1re famille (câbles 1 à n₁) tendue sur la poutre seule ; 2e famille (n₂ derniers câbles, lits supérieurs) tendue sur la
  // section composée, après durcissement du hourdis (pratique VIPP : la poutre seule ne supporte pas toute la précontrainte)
  const phases = [{ t: T.t1, nom: 'Poutre seule sur ses appuis, mise en tension du câble 1', activer: iP, appuis, charges: charge(iP, wP) }];
  for (let ic = 1; ic < n1; ic++) phases.push({ t: T.t1, nom: `Mise en tension du câble ${ic + 1}` });
  const iHourdis = phases.length;
  phases.push({ t: T.t2, nom: 'Coulage du hourdis (porté par la poutre seule)', charges: charge(iP, wH) });
  phases.push({ t: T.t2, nom: 'Hourdis durci : section composée', activer: iH });
  for (let ic = n1; ic < nc; ic++) phases.push({ t: T.t2b, nom: `2e famille : mise en tension du câble ${ic + 1}` });
  cables.forEach((cb, ic) => { cb.phase = ic < n1 ? ic : iHourdis + 2 + (ic - n1); });
  const iServ = phases.length;
  phases.push({ t: T.t3, nom: 'Superstructures : mise en service', charges: charge(iH, wS) });
  const modele = { noeuds, barres, phases, cables, tFin: T.fin, parDecade: 6,
    betons: { P: { fck: B.fckP, RH: B.RH, h0: P.h0, ciment: B.cimP, tCoulage: 0 }, H: { fck: B.fckH, RH: B.RH, h0: H.h0, ciment: B.cimH, tCoulage: T.t2 } } };
  const out = calculPhasage(modele);

  // ---- contraintes des parties à un pas, à la section j
  const effort = (pas, k, x) => { const r = pas.barres[k]; return r ? { N: r.N, M: r.M(x) } : null; };
  const sigmaPas = (pas, j) => {
    const k = Math.min(j, nb - 1), x = j < nb ? 0 : L / nb;
    const ep = effort(pas, iP[k], x), eh = effort(pas, iH[k], x);
    const sp = ep ? fibres(ep.N, ep.M, P.A, P.I, P.vs, P.vi) : { s: 0, i: 0 };
    const sh = eh ? fibres(eh.N, eh.M, H.A, H.I, S.hd / 2, S.hd / 2) : null;
    return { ps: sp.s, pi: sp.i, hs: sh ? sh.s : null, hi: sh ? sh.i : null };
  };
  // contrainte due à un moment M appliqué à la section composée homogène (E_cm, n_h)
  const Cc = S.comp, Hc = f.hp + S.hd;
  const sigQ = M => ({ ps: -M * (f.hp - Cc.yG) / Cc.I / 1000, pi: M * Cc.yG / Cc.I / 1000, hs: -nh * M * (Hc - Cc.yG) / Cc.I / 1000, hi: -nh * M * (f.hp - Cc.yG) / Cc.I / 1000 });
  const add = (a, b, k = 1) => ({ ps: a.ps + k * b.ps, pi: a.pi + k * b.pi, hs: a.hs == null ? null : a.hs + k * b.hs, hi: a.hi == null ? null : a.hi + k * b.hi });
  // décompression : contrainte du béton 25 mm sous la gaine la plus basse (EN 1992-2 § 7.3.1 (105))
  const yDec = x => Math.max(0, Math.min(...tr.cab.map(cb => tr.y(cb, x))) - u.phi / 2 - 0.025);
  const sigAt = (s, y) => s.pi + (s.ps - s.pi) * y / f.hp;

  // ---- combinaisons de service (EN 1990 A2) : moments du trafic par section
  const Mchar = x => Math.max(Mq('gr1a', x), Mq('gr1b', x));
  const Mfreq = x => Math.max(0.75 * Mq('TS', x) + 0.40 * Mq('UDL', x) + 0.40 * Mq('footway', x), 0.75 * Mq('gr1b', x));
  const MrareF = x => (elsF61 ? interp(elsF61, x) - Mq('G', x) : 0);

  const fck = B.fckP, fckH = B.fckH, verifs = [];
  const iS0 = out.pas.findIndex(pp => pp.phase === iServ), iS = iS0 >= 0 ? iS0 : out.pas.length - 1, iF = out.pas.length - 1;
  const stepsConstr = out.pas.map((pp, i) => i).filter(i => out.pas[i].phase < iServ);
  const sections = [];
  for (let j = 0; j <= nb / 2; j++) {
    const x = xs[j], row = { j, x };
    // construction : enveloppe des pas antérieurs à la mise en service
    let cMin = Infinity, tMax = -Infinity, cInfo = null, tInfo = null;
    for (const i of stepsConstr) {
      const pp = out.pas[i], s = sigmaPas(pp, j), age = pp.t;
      for (const [nom, v, lim, limT] of [['poutre sup.', s.ps, bP.fckT(age), bP.fctmT(age)], ['poutre inf.', s.pi, bP.fckT(age), bP.fctmT(age)], ...(s.hs != null && age > T.t2 + 1 ? [['hourdis sup.', s.hs, bH.fckT(age - T.t2), bH.fctmT(age - T.t2)]] : [])]) {
        if (v < 0 && -v / (0.6 * lim) > (cInfo ? cInfo.taux : -1)) { cInfo = { v, lim: 0.6 * lim, taux: -v / (0.6 * lim), fibre: nom, t: age }; }
        if (v > 0 && v / limT > (tInfo ? tInfo.taux : -1)) { tInfo = { v, lim: limT, taux: v / limT, fibre: nom, t: age }; }
        cMin = Math.min(cMin, v); tMax = Math.max(tMax, v);
      }
    }
    row.constr = { c: cInfo, t: tInfo };
    // service : à la mise en service (pertes partielles) et à t∞
    const perm = { S: sigmaPas(out.pas[iS], j), F: sigmaPas(out.pas[iF], j) };
    const qC = sigQ(Mchar(x)), qF = sigQ(Mfreq(x)), qR = sigQ(MrareF(x));
    row.perm = perm.F; row.permS = perm.S;
    row.car = { S: add(perm.S, qC), F: add(perm.F, qC) };
    row.freq = { S: add(perm.S, qF), F: add(perm.F, qF) };
    row.qp = { S: perm.S, F: perm.F };
    row.rare = { S: add(perm.S, qR), F: add(perm.F, qR) };
    row.yDec = yDec(x);
    row.dec = { qp: Math.max(sigAt(perm.S, row.yDec), sigAt(perm.F, row.yDec)), freq: Math.max(sigAt(row.freq.S, row.yDec), sigAt(row.freq.F, row.yDec)) };
    sections.push(row);
  }
  const minC = (o, k) => Math.min(o.S[k] ?? 0, o.F[k] ?? 0), maxT = (o, k) => Math.max(o.S[k] ?? -1e9, o.F[k] ?? -1e9);
  const fctm = bP.fctmT(28), fctmH = bH.fctmT(28), ftjB = 0.6 + 0.06 * fck;
  const ver = (nom, val, lim, ok, ref, x) => verifs.push({ nom, val, lim, ok, ref, x });
  const pire = (sel, cmp) => sections.reduce((b, r) => { const v = sel(r); return b == null || cmp(v, b.v) ? { v, x: r.x } : b; }, null);
  const less = (a, b) => a < b, more = (a, b) => a > b;
  let w;
  w = pire(r => (r.constr.c ? r.constr.c.taux : 0), more); { const r = sections.find(s => s.x === w.x); if (r.constr.c) ver(`Construction : compression (${r.constr.c.fibre}, t = ${r.constr.c.t.toFixed(1)} j)`, r.constr.c.v, -r.constr.c.lim, r.constr.c.taux <= 1, 'EN 1992-1-1 § 5.10.2.2 (5) : 0,6 f_ck(t)', w.x); }
  w = pire(r => (r.constr.t ? r.constr.t.taux : 0), more); { const r = sections.find(s => s.x === w.x); if (r.constr.t) ver(`Construction : traction (${r.constr.t.fibre}, t = ${r.constr.t.t.toFixed(1)} j)`, r.constr.t.v, r.constr.t.lim, r.constr.t.taux <= 1, 'f_ctm(t), § 3.1.2 (9) — au-delà : armatures passives de reprise', w.x); }
  w = pire(r => Math.min(minC(r.car, 'ps'), minC(r.car, 'pi')), less); ver('Caractéristique : compression poutre', w.v, -0.6 * fck, w.v >= -0.6 * fck, 'EN 1992-2 § 7.2 (102) : 0,6 f_ck', w.x);
  w = pire(r => minC(r.car, 'hs'), less); ver('Caractéristique : compression hourdis', w.v, -0.6 * fckH, w.v >= -0.6 * fckH, '0,6 f_ck du hourdis', w.x);
  w = pire(r => Math.min(minC(r.qp, 'ps'), minC(r.qp, 'pi')), less); ver('Quasi permanente : compression poutre', w.v, -0.45 * fck, w.v >= -0.45 * fck, 'EN 1992-1-1 § 7.2 (3) : 0,45 f_ck (fluage linéaire)', w.x);
  const decCle = p.expo === 'XD' ? 'freq' : 'qp';
  w = pire(r => r.dec[decCle], more); ver(`Décompression sous combinaison ${p.expo === 'XD' ? 'fréquente (XD / XS)' : 'quasi permanente (XC)'} à 25 mm des gaines`, w.v, 0, w.v <= 1e-6, 'EN 1992-2 § 7.3.1 (105), tableau 7.101N', w.x);
  w = pire(r => maxT(r.freq, 'pi'), more); ver('Fréquente : traction en fibre inférieure (fissuration)', w.v, fctm, w.v <= fctm, 'σ ≤ f_ctm : section non fissurée, w = 0 ; sinon ouverture des fissures à calculer (§ 7.3.4)', w.x);
  if (elsF61) {
    w = pire(r => maxT(r.rare, 'pi'), more); ver('BPEL classe II, combinaison rare : traction en fibre inférieure', w.v, ftjB, w.v <= ftjB, 'BPEL 91 art. 6.1,23 : σ ≥ −f_tj dans la section d\'enrobage', w.x);
    w = pire(r => Math.min(minC(r.rare, 'ps'), minC(r.rare, 'hs')), less); ver('BPEL classe II, combinaison rare : compression', w.v, -0.6 * fck, w.v >= -0.6 * fck, 'BPEL 91 : 0,6 f_cj', w.x);
  }

  // ---- forces dans les câbles (par câble, au segment de mi-travée et au segment d'about)
  const segMid = nb / 2 - 1, cableAt = (pas, ic, seg) => { const r = pas.cables.find(q => q && q.cable === ic && q.seg === seg); return r ? r.N : 0; };
  // instants juste après la mise en tension du dernier câble de chaque famille (avant tout fluage)
  const iTension = out.pas.findIndex(pp => pp.phase === n1 - 1), iTension2 = n2 ? out.pas.findIndex(pp => pp.phase === iServ - 1) : iTension;
  const pertes = tr.cab.map((cb, ic) => {
    const pi = out.pertesInstantanees[ic];
    return { ic, ym: cb.ym, ya: cb.ya, P0, Pinst: pi ? pi.P[segMid] : P0, Pabout: pi ? pi.P[0] : P0, lambda: pi ? pi.lambda : [0, 0],
      famille: ic < n1 ? 1 : 2, PapresTension: cableAt(out.pas[ic < n1 ? iTension : iTension2], ic, segMid), Pserv: cableAt(out.pas[iS], ic, segMid), Pinf: cableAt(out.pas[iF], ic, segMid) };
  });
  const somme = k => pertes.reduce((s, q) => s + q[k], 0);
  const Ptot = { P0: nc * P0, inst: somme('Pinst'), tension: somme('PapresTension'), serv: somme('Pserv'), inf: somme('Pinf') };

  // ---- ELU de flexion
  const fcd = fckx => 0.85 * fckx / 1.5, fpd = c.fp01k / 1.15, Ep = 195000, fyd = p.fyk / 1.15;
  const ds = Hc - (p.cs ?? 0.06);
  const fctm28 = fctm, dAs = ds, AsMin = Math.max(0.26 * fctm28 / p.fyk, 0.0013) * f.bta * dAs;
  const elu = [];
  for (let j = 0; j <= nb / 2; j++) {
    const x = xs[j], seg = Math.min(j, nb - 1);
    const cabs = tr.cab.map((cb, ic) => { const N = cableAt(out.pas[iF], ic, seg); return { Ap: u.Ap, d: Hc - tr.y(cb, x), epm: N / u.Ap / 1000 / Ep }; });
    const MEdE = 1.35 * Mq('G', x) + 1.35 * Mchar(x), MEdF = eluF61 ? interp(eluF61, x) : null;
    const MEd = Math.max(MEdE, MEdF ?? -Infinity);
    const base = { S, cables: cabs, ds, fcdP: fcd(fck), fcdH: fcd(fckH), fpd, Ep, fyd };
    let r = momentResistant({ ...base, As: AsMin });
    let As = AsMin;
    if (r.M < MEd) { let lo = AsMin, hi = AsMin + 0.05; for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (momentResistant({ ...base, As: m }).M >= MEd) hi = m; else lo = m; } As = hi; r = momentResistant({ ...base, As }); }
    elu.push({ x, MEdE, MEdF, MEd, MRd: r.M, As, AsMin, xn: r.x, ok: r.M >= MEd - 1e-6, xd: r.xd });
  }

  // ---- effort tranchant (EC2 § 6.2.3) : étriers verticaux
  const tranchant = [];
  const fywd = p.fyk / 1.15, nu1 = 0.6 * (1 - fck / 250), fcdV = fcd(fck), rhoMin = 0.08 * Math.sqrt(fck) / p.fyk;
  for (let j = 0; j <= nb / 2; j++) {
    const x = xs[j], seg = Math.min(j, nb - 1);
    const VG = Math.abs(interp(ch.G.Vmax, x)), VQ = Math.max(Math.abs(interp(ch.gr1a?.Vmax, x)), Math.abs(interp(ch.gr1b?.Vmax, x)));
    const VEd0 = 1.35 * VG + 1.35 * VQ;
    let Vpd = 0, Pn = 0, ySum = 0;
    tr.cab.forEach((cb, ic) => { const N = cableAt(out.pas[iF], ic, seg), sl = tr.pente(cb, x); Vpd += N * Math.abs(sl) / Math.sqrt(1 + sl * sl); Pn += N; ySum += N * tr.y(cb, x); });
    const yp = Pn ? ySum / Pn : 0.2, d = Math.max(Hc - yp, 0.8 * Hc), z = 0.9 * d;
    const VEd = Math.max(VEd0 - Vpd, 0);
    const bw = x <= (f.Lb ?? 0) ? (f.b0a ?? f.b0) : f.b0, bwn = bw - 0.5 * u.phi;
    const scp = Pn / Cc.A / 1000, acw = scp <= 0 ? 1 : scp <= 0.25 * fcdV ? 1 + scp / fcdV : scp <= 0.5 * fcdV ? 1.25 : 2.5 * (1 - scp / fcdV);
    const VRdmax = cot => acw * bwn * z * nu1 * fcdV * 1000 / (cot + 1 / cot);
    let cot = 2.5; while (cot > 1 && VRdmax(cot) < VEd) cot -= 0.01;
    cot = Math.max(cot, 1);
    const AswS = VEd / (z * fywd * 1000 * cot), AswMin = rhoMin * bw;
    tranchant.push({ x, VG, VQ, VEd0, Vpd, VEd, bw, bwn, z, scp, acw, cot, VRdmax: VRdmax(cot), AswS: Math.max(AswS, AswMin), AswCalc: AswS, AswMin, ok: VRdmax(cot) >= VEd - 1e-6 });
  }

  // ---- flèches à mi-travée (vers le bas positives), contre-flèche de fabrication
  const jm = nb / 2, uMid = pas => -pas.u[3 * jm + 1];
  const EcI = bP.Ecm * 1000 * Cc.I;
  const fQ = 5 * Mchar(L / 2) * L * L / (48 * EcI);
  const fleches = { tension: uMid(out.pas[iTension]), hourdis: uMid(out.pas[out.finPhase[iHourdis + 1]]), famille2: uMid(out.pas[iTension2]), service: uMid(out.pas[iS]), infini: uMid(out.pas[iF]), trafic: fQ };

  // ---- quantités et diagnostic de conception (guide Sétra VIPP 1996)
  const Lc = L + 1.0, volP = P.A * Lc, volT = (P.A + H.poids) * Lc, kgP = nc * u.Ap * (L + 2) * 7850, ratioP = kgP / volT;
  const conception = diagnosticVIPP({ L, f, b1: p.b1, hd: p.hd, fck, ratioP, nc, unite: c.unite });

  return {
    L, S, beff, nh, trace: tr, sigP0, P0, Ptot, pertes, modele, out, sections, verifs, elu, tranchant, fleches,
    charges: { wP, wH, wS, wG }, betons: { P: { fck, Ecm: bP.Ecm, h0: P.h0, phi: bP.phi(T.fin, T.t1), eps: bP.retrait(T.fin) }, H: { fck: fckH, Ecm: bH.Ecm, h0: H.h0, phi: bH.phi(T.fin - T.t2, T.t3 - T.t2), eps: bH.retrait(T.fin - T.t2) } },
    dates: T, expo: p.expo, quantites: { volP, volT, kgP, ratioP }, conception, n1, n2,
    ok: verifs.every(v => v.ok) && elu.every(e => e.ok) && tranchant.every(t => t.ok),
  };
}

/** Diagnostic de conception d'après le guide Sétra VIPP (1996), §§ 1.3, 2.1, 2.2, 3.1, 3.2. */
export function diagnosticVIPP({ L, f, b1, hd, fck, ratioP, nc, unite }) {
  const D = [], H = f.hp + hd, el = H / L;
  const add = (niveau, texte, ref) => D.push({ niveau, texte, ref });
  if (L < 30) add('INFO', `Portée ${L.toFixed(1)} m < 30 m : dalle précontrainte ou poutres PRAD généralement plus économiques.`, '§ 1.3');
  else if (L > 50) add('ATTENTION', `Portée ${L.toFixed(1)} m > 50 m : hors du domaine d'emploi des VIPP (30 à 45 m, jusqu'à 50 m exceptionnellement).`, '§ 1.3');
  else if (L > 45) add('INFO', `Portée ${L.toFixed(1)} m au-delà de l'optimum (30 à 40 m) : admissible si les appuis sont coûteux.`, '§ 2.1.1');
  else add('OK', `Portée ${L.toFixed(1)} m dans le domaine d'emploi (30 à 45 m).`, '§ 1.3');
  const r = 1 / el;
  if (r > 20) add('ATTENTION', `Élancement H/L = 1/${r.toFixed(1)} : au-delà de la limite raisonnable 1/20 (surconsommation de précontrainte).`, '§ 3.2.1');
  else if (r > 18 || r < 16) add('INFO', `Élancement H/L = 1/${r.toFixed(1)} : hors de la plage usuelle 1/16 à 1/18 (≈ 1/17).`, '§ 3.2.1');
  else add('OK', `Élancement H/L = 1/${r.toFixed(1)} (usuel 1/16 à 1/18).`, '§ 3.2.1');
  if (b1 < 2.5 || b1 > 4.0) add('ATTENTION', `Entraxe ${b1.toFixed(2)} m hors de 2,50 à 3,50 m (4,00 m exceptionnellement ; ≈ 4,50 m avec béton à hautes performances).`, '§ 2.2.2');
  else if (b1 > 3.5) add('INFO', `Entraxe ${b1.toFixed(2)} m : au-delà de la plage usuelle 2,50 à 3,50 m.`, '§ 2.2.2');
  else add('OK', `Entraxe ${b1.toFixed(2)} m (usuel 2,50 à 3,50 m).`, '§ 2.2.2');
  if (f.b0 < 0.20) add('ATTENTION', `Âme ${(f.b0 * 100).toFixed(0)} cm < 20 cm (20 à 22 cm avec coffrage métallique et vibration externe, ≈ 30 cm en vibration interne).`, '§ 3.2.2');
  else add('OK', `Âme ${(f.b0 * 100).toFixed(0)} cm (≥ 20 cm en coffrage métallique).`, '§ 3.2.2');
  if (f.bta < 0.60) add('ATTENTION', `Talon ${(f.bta * 100).toFixed(0)} cm < 60 cm (largeur minimale conseillée).`, '§ 3.2.4');
  else if (f.bta > 0.90) add('INFO', `Talon ${(f.bta * 100).toFixed(0)} cm > 90 cm (courant 60 à 90 cm).`, '§ 3.2.4');
  else add('OK', `Talon ${(f.bta * 100).toFixed(0)} cm (courant 60 à 90 cm).`, '§ 3.2.4');
  if (f.hpi < 0.10 || f.hpi > 0.20) add('INFO', `Pied de talon ${(f.hpi * 100).toFixed(0)} cm (courant 10 à 20 cm).`, '§ 3.2.4');
  if (f.tpan < 1 || f.tpan > 1.5) add('INFO', `Pan incliné du talon de tangente ${f.tpan.toFixed(2)} (1 à 1,5 facilite le bétonnage et le relevage des câbles).`, '§ 3.2.4');
  if (f.bt < 0.6 * H) add('INFO', `Table ${f.bt.toFixed(2)} m < 0,6 h = ${(0.6 * H).toFixed(2)} m.`, '§ 3.2.3');
  if (f.hte < 0.10) add('ATTENTION', `Extrémité de table ${(f.hte * 100).toFixed(0)} cm < 10 cm.`, '§ 3.2.3');
  if (fck < 35) add('INFO', `Béton de poutre C${fck} : le guide retient au moins B35.`, '§ 3.1.1');
  if (ratioP > 55) add('INFO', `Précontrainte ${ratioP.toFixed(0)} kg par m³ de béton du tablier : au-dessus du ratio courant (≈ 40 kg/m³) — section ou élancement à revoir.`, '§ 3.1.3');
  else add('OK', `Précontrainte ${ratioP.toFixed(0)} kg par m³ de béton du tablier (${nc} × ${unite} ; ratio courant ≈ 40 kg/m³).`, '§ 3.1.3');
  add('INFO', 'Deux entretoises d\'about (encastrement de torsion, vérinage, joints) ; entretoises intermédiaires inutiles.', '§ 2.2.4');
  return D;
}
