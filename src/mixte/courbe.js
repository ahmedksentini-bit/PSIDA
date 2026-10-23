/**
 * Pont mixte courbe en plan (bipoutre, quadripoutre) : modèle de grillage et effets de la courbure.
 *
 * Grillage plan (3 ddl par nœud : flèche w, rotations θx, θy) : poutres principales suivant des arcs de rayon R_k = R + y_k
 * discrétisés en cordes, entretoises radiales aux abscisses des cadres (rigidité de flexion E I_q, torsion négligeable),
 * appuis simples sous chaque poutre aux lignes d'appui (lignes radiales). Rigidités des poutres : section mixte (n₀) en
 * travée, fissurée sur appui (mêmes zones que le calcul par phases) ; torsion de Saint-Venant des tôles Σ b t³/3 et de la
 * dalle b h³/6 (G_c = E_cm / 2,4).
 * Le même grillage, rendu droit (R → ∞), sert de référence : les rapports courbe / droit des moments de la poutre
 * extérieure (permanentes et trafic) amplifient les contraintes calculées sur le modèle droit (src/mixte/verifs.js).
 * Charges : permanentes surfaciques et linéiques reportées sur les poutres par la règle du levier, pondérées par r/R
 * (longueur d'arc) ; LM1 placé du côté extérieur (voie 1 contre la bordure extérieure), UDL sur la travée étudiée ou les
 * deux travées adjacentes à l'appui, tandem au milieu de la travée ou à 0,4 L de l'appui.
 * Effets propres à la courbure (AASHTO LRFD § 4.6.1.2.4 et 6.10.1.6 ; méthode « V-load », Fiechtl, Fenves et Frank 1987) :
 *   - flexion latérale des semelles entre cadres : M_lat = M l² / (N R D), N = 10, l = entraxe des cadres, D = hauteur
 *     d'âme ; f_l = 6 M_lat / (t_f b_f²) ; limite f_l ≤ 0,6 f_y ; cumul avec la contrainte de flexion : σ + f_l ≤ f_y/γ_M0
 *     (ELU), σ + f_l / 3 ≤ χ f_y / γ_M1 pour la semelle supérieure au bétonnage (AASHTO 6.10.3.2.1, forme des critères) ;
 *   - efforts radiaux dans les cadres (V-load) : H = M l / (R D) ;
 *   - soulèvement de l'appui intérieur (EN 1990 A2 tableau A2.4(A), EQU) : 0,95 R_G + 1,35 R_Q,min ≥ 0.
 * Unités : m, kN, kN·m.
 */
import { lu } from '../phasage/caisson_transversal.js';
import { proprietes } from './section.js';
import { lm1, notionalLanes, EC_ALPHA } from '../loads_ec.js';

const EA = 210000e3;   // kN/m²

/** Construction du grillage. p : paramètres du bipoutre ; geo : { R, ac, Iq, EIt, EIa, GJt, GJa }. */
export function grillage(p, geo) {
  const L = p.L, nT = L.length, x0 = [0]; L.forEach((l, i) => x0.push(x0[i] + l));
  const Lt = x0[nT], np = p.nPoutres, ys = Array.from({ length: np }, (_, k) => (k - (np - 1) / 2) * p.entraxe), R = geo.R;
  // abscisses curvilignes de l'axe : appuis, cadres (tous les ac par travée), subdivisions ≤ 1,5 m
  const cad = new Set(x0.map(v => +v.toFixed(6)));
  for (let s = 0; s < nT; s++) { const n = Math.max(1, Math.round(L[s] / geo.ac)); for (let q = 1; q < n; q++) cad.add(+(x0[s] + L[s] * q / n).toFixed(6)); }
  const S = new Set(cad); const C = [...cad].sort((a, b) => a - b);
  for (let i = 0; i < C.length - 1; i++) { const n = Math.ceil((C[i + 1] - C[i]) / 1.5 - 1e-9); for (let q = 1; q < n; q++) S.add(+(C[i] + (C[i + 1] - C[i]) * q / n).toFixed(6)); }
  const ss = [...S].sort((a, b) => a - b), N = [], id = (k, i) => k * ss.length + i;
  for (let k = 0; k < np; k++) for (const s of ss) { const rk = R + ys[k], phi = s / R; N.push(R > 1e8 ? [s, ys[k]] : [rk * Math.sin(phi), R - rk * Math.cos(phi)]); }
  const zoneAppui = s => { for (let j = 1; j < nT; j++) if (s >= x0[j] - p.zone * L[j - 1] - 1e-9 && s <= x0[j] + p.zone * L[j] + 1e-9) return true; return false; };
  const E = [];
  for (let k = 0; k < np; k++) for (let i = 0; i < ss.length - 1; i++) { const za = zoneAppui((ss[i] + ss[i + 1]) / 2); E.push({ i: id(k, i), j: id(k, i + 1), EI: za ? geo.EIa : geo.EIt, GJ: za ? geo.GJa : geo.GJt, poutre: k, s: (ss[i] + ss[i + 1]) / 2 }); }
  for (const s of C) { const i = ss.findIndex(v => Math.abs(v - s) < 1e-6); for (let k = 0; k < np - 1; k++) E.push({ i: id(k, i), j: id(k + 1, i), EI: EA * geo.Iq * (x0.some(v => Math.abs(v - s) < 1e-6) ? 5 : 1), GJ: EA * geo.Iq * 1e-3, entretoise: true, s }); }
  const appuis = []; for (const xa of x0) { const i = ss.findIndex(v => Math.abs(v - xa) < 1e-6); for (let k = 0; k < np; k++) appuis.push({ n: id(k, i), k, j: x0.indexOf(xa) }); }
  return { N, E, ss, ys, np, x0, Lt, appuis, id, R };
}

/** Assemblage et factorisation ; renvoie le solveur et l'extraction des efforts. */
export function resoudreGrillage(G) {
  const nd = 3 * G.N.length, K = Array.from({ length: nd }, () => new Float64Array(nd));
  const el = G.E.map(e => {
    const [xi, yi] = G.N[e.i], [xj, yj] = G.N[e.j], L = Math.hypot(xj - xi, yj - yi), c = (xj - xi) / L, s = (yj - yi) / L;
    const b = e.EI / L ** 3, kl = [[12 * b, 0, 6 * L * b, -12 * b, 0, 6 * L * b], [0, e.GJ / L, 0, 0, -e.GJ / L, 0], [6 * L * b, 0, 4 * L * L * b, -6 * L * b, 0, 2 * L * L * b],
      [-12 * b, 0, -6 * L * b, 12 * b, 0, -6 * L * b], [0, -e.GJ / L, 0, 0, e.GJ / L, 0], [6 * L * b, 0, 2 * L * L * b, -6 * L * b, 0, 4 * L * L * b]];
    // local [w, θt, φ = dw/ds] ← global [w, θx, θy] : θt = c θx + s θy, φ = s θx − c θy
    const t3 = [[1, 0, 0], [0, c, s], [0, s, -c]], T = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let a = 0; a < 3; a++) for (let q = 0; q < 3; q++) { T[a][q] = t3[a][q]; T[a + 3][q + 3] = t3[a][q]; }
    const dofs = [3 * e.i, 3 * e.i + 1, 3 * e.i + 2, 3 * e.j, 3 * e.j + 1, 3 * e.j + 2];
    for (let a = 0; a < 6; a++) for (let q = 0; q < 6; q++) { let v = 0; for (let m = 0; m < 6; m++) for (let n = 0; n < 6; n++) v += T[m][a] * kl[m][n] * T[n][q]; K[dofs[a]][dofs[q]] += v; }
    return { L, kl, T, dofs };
  });
  const big = 1e8 * Math.max(...K.map((r, i) => r[i]));
  for (const a of G.appuis) K[3 * a.n][3 * a.n] += big;
  const sol = lu(K);
  return {
    resoudre: F => {
      const u = sol(F);
      const M = (k, bout) => { const g = el[k], ue = g.dofs.map(d => u[d]), ul = g.T.map(r => r.reduce((s0, v, q) => s0 + v * ue[q], 0)), f = g.kl.map(r => r.reduce((s0, v, q) => s0 + v * ul[q], 0)); return bout === 'i' ? -f[2] : f[5]; };
      return { u, M, R: G.appuis.map(a => ({ ...a, R: big * -u[3 * a.n] })) };
    },
  };
}

/** Charges nodales verticales (vers le bas) : charge linéique w_k(s) par poutre sur [s0, s1], longueurs d'arc. */
function charger(G, F, k, w, s0 = 0, s1 = Infinity) {
  const ss = G.ss, rk = G.R > 1e8 ? 1 : (G.R + G.ys[k]) / G.R;
  for (let i = 0; i < ss.length - 1; i++) {
    const a = Math.max(ss[i], s0), b = Math.min(ss[i + 1], s1); if (b <= a) continue;
    const P = w * (b - a) * rk; F[3 * G.id(k, i)] -= P / 2; F[3 * G.id(k, i + 1)] -= P / 2;
  }
}
const ponctuel = (G, F, k, P, s) => { const ss = G.ss; let i = 0; while (i < ss.length - 2 && ss[i + 1] < s) i++; const t = (s - ss[i]) / (ss[i + 1] - ss[i]); F[3 * G.id(k, i)] -= P * (1 - t); F[3 * G.id(k, i + 1)] -= P * t; };

/** Règle du levier entre poutres (charge en y), report en console au-delà des poutres de rive. */
function levier(ys, y) {
  const n = ys.length, f = new Array(n).fill(0); let j = 0; while (j < n - 2 && y > ys[j + 1]) j++;
  const t = (y - ys[j]) / (ys[j + 1] - ys[j]); f[j] = 1 - t; f[j + 1] = t; return f;
}

/**
 * Analyse complète. M = résultat de computeMixte ; o = options (R rayon en plan [m], ac, Iq, chaussee, trottoirs, alpha,
 * gBord). Renvoie rapports d'amplification, réactions, effets de courbure par section.
 */
export function analyseCourbe(M, o) {
  const { p, reperes: Rr } = M, R = o.R, n0 = 6.0, gT = { ...p.travee, hg: p.hg, hc: p.hc, nuance: p.nuance, beff: Rr.beffTravee[0], Asup: 0, Ainf: 0 };
  const gA = { ...p.appui, hg: p.hg, hc: p.hc, nuance: p.nuance, beff: Rr.beffAppui[0] || Rr.beffTravee[0], Asup: p.rhoAppui * p.hc * (Rr.beffAppui[0] || 1) * 0.6, Ainf: p.rhoAppui * p.hc * (Rr.beffAppui[0] || 1) * 0.4 };
  const Ecm = 22000 * ((p.fck + 8) / 10) ** 0.3, nE = 210000 / Ecm;
  const Jacier = g => (g.bfi * g.tfi ** 3 + g.hw * g.tw ** 3 + g.bfs * g.tfs ** 3) / 3;
  const geo = { R, ac: o.ac ?? 6, Iq: o.Iq ?? 1.8e-3, EIt: EA * proprietes(gT, 'mixte', nE).I, EIa: EA * proprietes(gA, 'fissuree', nE).I,
    GJt: EA / 2.6 * Jacier(gT) + Ecm * 1000 / 2.4 * Rr.TR.part * p.hc ** 3 / 6, GJa: EA / 2.6 * Jacier(gA) };
  const Gc = grillage(p, geo), Gd = grillage(p, { ...geo, R: 1e12 }), Sc = resoudreGrillage(Gc), Sd = resoudreGrillage(Gd);
  const np = p.nPoutres, ys = Gc.ys, B = p.largeur, kExt = np - 1, nT = p.L.length;
  // permanentes : poids des poutres, dalle et superstructures surfaciques (par m de largeur), report par levier
  const gS = (p.gSup || 0) * np / B;   // superstructures (kN/m par poutre dans le calcul par phases) ramenées au m² de tablier
  const qArea = p.gBeton * p.hc + gS, wAcier = Rr.aT.A * p.gAcier * p.majAcier;
  const permanent = G => {
    const F = new Float64Array(3 * G.N.length), dy = 0.1;
    for (let y = -B / 2 + dy / 2; y < B / 2; y += dy) { const f = levier(ys, y), r = G.R > 1e8 ? 1 : (G.R + y) / G.R; f.forEach((c, k) => { if (c) charger(G, F, k, qArea * dy * c * r / (G.R > 1e8 ? 1 : (G.R + ys[k]) / G.R)); }); }
    for (let k = 0; k < np; k++) charger(G, F, k, wAcier);
    return F;
  };
  // trafic : voies depuis la bordure extérieure (y croissant = extérieur de la courbe)
  const ch = o.chaussee, al = o.alpha || EC_ALPHA.recommended, NL = notionalLanes(ch.y2 - ch.y1), L1 = lm1(NL.n, al);
  const trafic = (G, s0, s1, sTS) => {
    const F = new Float64Array(3 * G.N.length);
    for (let i = 0; i < NL.n; i++) {
      const yc = ch.y2 - NL.wl * (i + 0.5), ln = L1.lanes[i];
      for (let q = 0; q < 10; q++) { const y = ch.y2 - NL.wl * (i + (q + 0.5) / 10), f = levier(ys, y), r = G.R > 1e8 ? 1 : (G.R + y) / G.R; f.forEach((c, k) => { if (c) charger(G, F, k, ln.q * NL.wl / 10 * c * r / (G.R > 1e8 ? 1 : (G.R + ys[k]) / G.R), s0, s1); }); }
      for (const dy of [-1, 1]) for (const ds of [-0.6, 0.6]) { const f = levier(ys, yc + dy); f.forEach((c, k) => { if (c) ponctuel(G, F, k, ln.Q / 2 * c, sTS + ds); }); }
    }
    return F;
  };
  const x0 = Gc.x0, elemAt = (G, k, s) => { let best = 0, d = Infinity; G.E.forEach((e, m) => { if (e.poutre === k) { const dd = Math.abs(e.s - s); if (dd < d) { d = dd; best = m; } } }); return best; };
  const Mpoutre = (G, res, k, s) => { const m = elemAt(G, k, s), e = G.E[m]; return s <= e.s ? res.M(m, 'i') : res.M(m, 'j'); };
  const cibles = [];
  for (let s = 0; s < nT; s++) cibles.push({ nom: `mi-travée ${s + 1}`, s: x0[s] + p.L[s] / 2, appui: false, q: [x0[s], x0[s + 1], x0[s] + p.L[s] / 2] });
  for (let j = 1; j < nT; j++) cibles.push({ nom: `appui P${j}`, s: x0[j], appui: true, q: [x0[j - 1], x0[j + 1], x0[j] + 0.4 * Math.max(p.L[j - 1], p.L[j]) * (p.L[j] >= p.L[j - 1] ? 1 : -1)] });
  const PGc = Sc.resoudre(permanent(Gc)), PGd = Sd.resoudre(permanent(Gd));
  const sections = cibles.map(c => {
    const Qc = Sc.resoudre(trafic(Gc, ...c.q)), Qd = Sd.resoudre(trafic(Gd, ...c.q));
    const mG = [Mpoutre(Gc, PGc, kExt, c.s), Mpoutre(Gd, PGd, kExt, c.s)], mQ = [Mpoutre(Gc, Qc, kExt, c.s), Mpoutre(Gd, Qd, kExt, c.s)];
    const mGi = [Mpoutre(Gc, PGc, 0, c.s), Mpoutre(Gd, PGd, 0, c.s)];
    return { ...c, MGc: mG[0], MGd: mG[1], MQc: mQ[0], MQd: mQ[1], kG: Math.abs(mG[1]) > 1e-6 ? mG[0] / mG[1] : 1, kQ: Math.abs(mQ[1]) > 1e-6 ? mQ[0] / mQ[1] : 1, kGint: Math.abs(mGi[1]) > 1e-6 ? mGi[0] / mGi[1] : 1 };
  });
  // réactions : permanentes, trafic du côté extérieur (soulèvement de la poutre intérieure), toutes travées chargées
  const QaC = Sc.resoudre(trafic(Gc, 0, Gc.Lt, Gc.Lt / 2));
  const reactions = PGc.R.map((a, m) => ({ appui: a.j, poutre: a.k, RG: a.R, RQ: QaC.R[m].R }));
  // soulèvement : pire combinaison par appui intérieur (UDL sur les seules travées où la réaction de la poutre intérieure diminue)
  const uplift = x0.map((_, j) => {
    const ri = reactions.find(q => q.appui === j && q.poutre === 0);
    let RQmin = 0;
    for (let s = 0; s < nT; s++) { const r = Sc.resoudre(trafic(Gc, x0[s], x0[s + 1], x0[s] + p.L[s] / 2)).R.find(q => q.j === j && q.k === 0).R; if (r < 0) RQmin += r; }
    return { appui: j, RG: ri.RG, RQmin, EQU: 0.95 * ri.RG + 1.35 * RQmin };
  });
  return { R, geo, sections, reactions, uplift, Gc, ys, NL };
}

/** Effets locaux de la courbure à une section : flexion latérale des semelles et effort radial des cadres. */
export function flexionLaterale(M, g, { R, l, N = 10 }) {
  const D = g.hw, Mlat = Math.abs(M) * l * l / (N * R * D);
  return { Mlat, flS: 6 * Mlat / (g.tfs * g.bfs ** 2) / 1000, flI: 6 * Mlat / (g.tfi * g.bfi ** 2) / 1000, H: Math.abs(M) * l / (R * D) };
}

/**
 * Vérifications de la courbure à partir des vérifications du modèle droit (M.v) : amplification par les rapports du
 * grillage, flexion latérale des semelles, soulèvement, semelle supérieure au bétonnage. Renvoie { A, lignes, verifs }.
 */
export function verifierCourbure(M, o) {
  const A = analyseCourbe(M, o), v = M.v, p = M.p, R = o.R, l = o.ac ?? 6;
  const proche = (x, appui) => { const c = A.sections.filter(q => q.appui === appui); return c.length ? c.reduce((a, b) => (Math.abs(b.s - x) < Math.abs(a.s - x) ? b : a)) : { kG: 1, kQ: 1 }; };
  const lignes = v.sections.map(s => {
    const c = proche(s.x, s.zoneAppui), k = Math.max(c.kG, c.kQ, 1), g = s.zoneAppui ? p.appui : p.travee;
    const fl = flexionLaterale(s.MEd * k, g, { R, l }), fyS = s.fy, sig = s.sEluMax * k;
    return { x: s.x, appui: s.zoneAppui, k, sig, flS: fl.flS, flI: fl.flI, tot: sig + Math.max(fl.flS, fl.flI), fy: fyS, H: fl.H, Mlat: fl.Mlat };
  });
  const verifs = [], add = (nom, val, lim, ok, ref, x) => verifs.push({ nom, val, lim, ok, ref, x });
  const w = lignes.reduce((a, b) => (b.tot / b.fy > a.tot / a.fy ? b : a));
  add(`Courbure (R = ${Math.round(R)} m) : σ_ELU amplifié (× ${w.k.toFixed(2)}) + flexion latérale des semelles`, w.tot, w.fy, w.tot <= w.fy, 'grillage ; AASHTO LRFD § 4.6.1.2.4b (M_lat = M l²/10 R D) ; EN 1993-1-1 § 6.2.1', w.x);
  const wl = lignes.reduce((a, b) => (Math.max(b.flS, b.flI) / b.fy > Math.max(a.flS, a.flI) / a.fy ? b : a)), fl = Math.max(wl.flS, wl.flI);
  add('Courbure : contrainte de flexion latérale f_l ≤ 0,6 f_y', fl, 0.6 * wl.fy, fl <= 0.6 * wl.fy, 'AASHTO LRFD § 6.10.1.6', wl.x);
  const u = A.uplift.reduce((a, b) => (b.EQU < a.EQU ? b : a));
  add(`Courbure : soulèvement de l'appareil intérieur, ligne ${u.appui} (EQU) [kN]`, u.EQU, 0, u.EQU >= 0, 'EN 1990 A2 tableau A2.4(A) : 0,95 R_G + 1,35 R_Q,min', p.L.slice(0, u.appui).reduce((s0, q) => s0 + q, 0));
  // semelle supérieure au bétonnage : σ + f_l / 3 ≤ χ f_y / γ_M1 (forme AASHTO 6.10.3.2.1), M déduit de σ (section d'acier)
  const d = v.betonnage && v.betonnage.pires.dev;
  if (d && d.cote === 'sup') {
    const zA = (M.reperes.info.find(q => Math.abs(q.x - d.x) < 1e-6) || {}).zoneAppui, g = zA ? p.appui : p.travee, P = proprietes(g, 'acier');
    const Mst = d.sig * 1000 * P.I / (g.tfi + g.hw + g.tfs - P.yG), f = flexionLaterale(Mst, g, { R, l });
    const val = d.sig + f.flS / 3;
    add('Courbure, bétonnage : semelle supérieure σ + f_l/3 ≤ χ f_y/γ_M1', val, d.lim, val <= d.lim, 'AASHTO LRFD § 6.10.3.2.1 (forme) ; χ de la semelle comprimée (EN 1993-2 § 6.3.4.2)', d.x);
    const val2 = d.sig + f.flS;
    add('Courbure, bétonnage : semelle supérieure σ + f_l ≤ f_y/γ_M0', val2, d.fy, val2 <= d.fy, 'AASHTO LRFD § 6.10.3.2.1 (forme) ; EN 1993-1-1 § 6.2.1', d.x);
  }
  return { A, lignes, verifs, Hmax: Math.max(...lignes.map(q => q.H)), ok: verifs.every(q => q.ok) };
}
