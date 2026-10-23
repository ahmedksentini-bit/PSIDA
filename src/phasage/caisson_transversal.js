/**
 * Caisson des ponts construits par encorbellements : flexion transversale (modèle de cadre par mètre de tablier) et
 * distortion.
 *
 * Modèle : cadre fermé plan suivant les feuillets moyens (hourdis supérieur avec ses encorbellements, deux âmes, hourdis
 * inférieur), éléments de Bernoulli de 1 m de largeur (A = t, I = t³/12), à la section courante de la clé (hourdis
 * inférieur le plus mince). Chaque cas de charge est équilibré par les flux de cisaillement de la flexion longitudinale et
 * de la torsion, appliqués comme charges tangentielles sur les parois (Sétra, guide « encorbellements successifs » 2003,
 * chap. 4 ; méthode des cadres) :
 *   - part symétrique : réaction verticale V/2 par âme, répartie uniformément sur sa hauteur ;
 *   - torsion de Bredt : T = Σ F·y (centre de torsion sur l'axe, caisson symétrique), flux q = T / (2 Ω) tout autour de la
 *     cellule (Ω : aire intérieure aux feuillets moyens) ;
 *   - la part restante déforme le cadre en distortion : seule, la tranche d'un mètre la reprend par flexion (majorant) ;
 *     avec p.dist (distortionCaisson), elle est répartie le long du caisson par le gauchissement et les diaphragmes.
 * Actions par mètre : poids propre (25 kN/m³), superstructures (charges de bord, revêtement 24 kN/m³), LM1 (EN 1991-2 §
 * 4.3.2) : UDL par voie conventionnelle, tandems TS répartis longitudinalement sur l_x = 1,20 + b₀ + 2d avec
 * b₀ = 0,40 + 2 t_rev + t_s (diffusion à 45° jusqu'au feuillet moyen) et d la distance de la roue à la section étudiée
 * (élargissement en plan à 45°, comme pour les encorbellements de src/cantilever.js), plafonnée à 3 m ; pour une roue dans
 * la travée du hourdis entre âmes : largeurs participantes du DAfStb Heft 240 (tableau 1) en travée et à l'encastrement ; voies placées au plus défavorable de chaque section par
 * lignes d'influence (voie 1 la plus chargée, voies suivantes sans recouvrement, aire résiduelle 2,5 kN/m² sur les parties
 * défavorables). Les effets locaux des roues dans les travées du hourdis (surfaces d'influence de plaque, Pucher) sont à
 * superposer au stade de l'exécution.
 * Combinaisons : ELU 1,35 G + 1,35 Q ; ELS caractéristique G + Q ; fréquente G + 0,75 TS + 0,4 UDL. Ferraillage par mètre :
 * src/cantilever.js (cantileverDesign : ELU, σ_s à l'ELS caractéristique, ouverture des fissures, minimums EC2).
 * Unités : m, kN, kN·m par mètre de tablier.
 */
import { cantileverDesign } from '../cantilever.js';
import { lm1, notionalLanes, EC_ALPHA } from '../loads_ec.js';

/** Factorisation LU dense avec pivot partiel ; renvoie une fonction de résolution. */
export function lu(A) {
  const n = A.length, M = A.map(r => Float64Array.from(r)), P = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let p = k, m = Math.abs(M[k][k]); for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > m) { m = Math.abs(M[i][k]); p = i; }
    if (m < 1e-14) throw new Error('cadre : matrice singulière');
    if (p !== k) { [M[p], M[k]] = [M[k], M[p]]; [P[p], P[k]] = [P[k], P[p]]; }
    const piv = M[k][k];
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / piv; if (!f) continue; M[i][k] = f; const Ri = M[i], Rk = M[k]; for (let j = k + 1; j < n; j++) Ri[j] -= f * Rk[j]; }
  }
  return b => {
    const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[P[i]]; const Ri = M[i]; for (let j = 0; j < i; j++) s -= Ri[j] * y[j]; y[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; const Ri = M[i]; for (let j = i + 1; j < n; j++) s -= Ri[j] * y[j]; y[i] = s / Ri[i]; }
    return y;
  };
}

/** Géométrie du cadre : nœuds, éléments, repères des sections de calcul. K = { B, ts, Bi, ti, bw }, h = hauteur. */
export function cadreCaisson(K, h, { pas = 0.1 } = {}) {
  const xw = K.Bi / 2 - K.bw / 2, yb = -(h - K.ts / 2 - K.ti / 2), N = [], E = [];
  const node = (x, y) => { const k = N.findIndex(q => Math.abs(q[0] - x) < 1e-9 && Math.abs(q[1] - y) < 1e-9); if (k >= 0) return k; N.push([x, y]); return N.length - 1; };
  const ligne = (a, b, t, paroi, n) => { let prev = node(...a); for (let i = 1; i <= n; i++) { const q = node(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n); E.push({ i: prev, j: q, t, paroi }); prev = q; } };
  // hourdis supérieur : nœuds réguliers + nus des âmes
  const xs = new Set([-K.B / 2, K.B / 2, -xw, xw, -xw - K.bw / 2, -xw + K.bw / 2, xw - K.bw / 2, xw + K.bw / 2, 0]);
  for (let x = -K.B / 2; x <= K.B / 2 + 1e-9; x += pas) xs.add(+x.toFixed(6));
  const X = [...xs].sort((a, b) => a - b);
  for (let k = 0; k < X.length - 1; k++) { const a = node(X[k], 0), b = node(X[k + 1], 0); E.push({ i: a, j: b, t: K.ts, paroi: X[k] < -xw - 1e-9 ? 'console G' : X[k + 1] > xw + 1e-9 ? 'console D' : 'hourdis sup.' }); }
  const nW = Math.max(6, Math.round(-yb / 0.2)), nB = Math.max(6, 2 * Math.round(xw / 0.2));
  ligne([-xw, 0], [-xw, yb], K.bw, 'âme G', nW); ligne([xw, 0], [xw, yb], K.bw, 'âme D', nW);
  ligne([-xw, yb], [xw, yb], K.ti, 'hourdis inf.', nB);
  return { N, E, xw, yb, X, h, K, omega: 2 * xw * (-yb) };
}

/** Raideur et efforts d'un cadre plan (E = 1, sections par mètre). */
function rigidite(C) {
  const n = C.N.length, nd = 3 * n, K = Array.from({ length: nd }, () => new Float64Array(nd));
  const geo = C.E.map(e => { const [xi, yi] = C.N[e.i], [xj, yj] = C.N[e.j], L = Math.hypot(xj - xi, yj - yi); return { L, c: (xj - xi) / L, s: (yj - yi) / L, A: e.t, I: e.t ** 3 / 12 }; });
  const kLoc = ({ L, A, I }) => { const a = A / L, b = 12 * I / L ** 3, c = 6 * I / L ** 2, d = 4 * I / L, f = 2 * I / L; return [[a, 0, 0, -a, 0, 0], [0, b, c, 0, -b, c], [0, c, d, 0, -c, f], [-a, 0, 0, a, 0, 0], [0, -b, -c, 0, b, -c], [0, c, f, 0, -c, d]]; };
  const T = ({ c, s }) => { const R = [[c, s, 0], [-s, c, 0], [0, 0, 1]], M = Array.from({ length: 6 }, () => new Array(6).fill(0)); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { M[a][b] = R[a][b]; M[a + 3][b + 3] = R[a][b]; } return M; };
  const kg = C.E.map((e, k) => {
    const kl = kLoc(geo[k]), t = T(geo[k]), m = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) { let s = 0; for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) s += t[p][a] * kl[p][q] * t[q][b]; m[a][b] = s; }
    const dofs = [3 * e.i, 3 * e.i + 1, 3 * e.i + 2, 3 * e.j, 3 * e.j + 1, 3 * e.j + 2];
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) K[dofs[a]][dofs[b]] += m[a][b];
    return { kl, t, dofs };
  });
  // appuis minimaux (charges auto-équilibrées) : coin inférieur gauche ux, uy ; coin inférieur droit uy
  const iG = C.N.findIndex(q => Math.abs(q[0] + C.xw) < 1e-9 && Math.abs(q[1] - C.yb) < 1e-9), iD = C.N.findIndex(q => Math.abs(q[0] - C.xw) < 1e-9 && Math.abs(q[1] - C.yb) < 1e-9);
  const big = 1e6 * Math.max(...K.map((r, i) => r[i]));
  for (const d of [3 * iG, 3 * iG + 1, 3 * iD + 1]) K[d][d] += big;
  return { solve: lu(K), geo, kg, fixes: [3 * iG, 3 * iG + 1, 3 * iD + 1], big };
}

/**
 * Vecteur de charges nodales d'un ensemble de charges verticales (kN, vers le bas positif) aux abscisses y du hourdis
 * supérieur, équilibré par les flux de cisaillement (flexion : âmes ; torsion : périmètre).
 */
function chargement(C, charges, poidsPropre = 0) {
  const n = C.N.length, F = new Float64Array(3 * n), xs = C.N.map(q => q[0]);
  const top = C.N.map((q, k) => (Math.abs(q[1]) < 1e-9 ? k : -1)).filter(k => k >= 0).sort((a, b) => xs[a] - xs[b]);
  let V = 0, T = 0;
  const appliquer = (x, P) => {   // charge ponctuelle répartie sur les deux nœuds encadrants du hourdis supérieur
    let k = 0; while (k < top.length - 2 && xs[top[k + 1]] < x) k++;
    const a = top[k], b = top[k + 1], t = Math.min(1, Math.max(0, (x - xs[a]) / (xs[b] - xs[a] || 1)));
    F[3 * a + 1] -= P * (1 - t); F[3 * b + 1] -= P * t; V += P; T += P * x;
  };
  for (const c of charges) appliquer(c.y, c.P);
  if (poidsPropre) for (const e of C.E) {   // poids propre des parois : moitié à chaque nœud
    const [xi, yi] = C.N[e.i], [xj, yj] = C.N[e.j], L = Math.hypot(xj - xi, yj - yi), P = poidsPropre * e.t * L;
    F[3 * e.i + 1] -= P / 2; F[3 * e.j + 1] -= P / 2; V += P; T += P * (xi + xj) / 2;
  }
  // flux équilibrants : part symétrique (V/2 par âme, uniforme sur la hauteur) et torsion (q = T/2Ω, sens trigonométrique)
  const q = T / (2 * C.omega);
  for (const e of C.E) {
    const [xi, yi] = C.N[e.i], [xj, yj] = C.N[e.j], L = Math.hypot(xj - xi, yj - yi);
    if (/^âme/.test(e.paroi)) { const f = V / 2 / (-C.yb) * L; F[3 * e.i + 1] += f / 2; F[3 * e.j + 1] += f / 2; }
    // cellule : hourdis sup. entre âmes, âmes, hourdis inf. ; flux de torsion le long de la paroi (sens anti-horaire)
    const cell = (e.paroi === 'hourdis sup.' && Math.min(xi, xj) >= -C.xw - 1e-9 && Math.max(xi, xj) <= C.xw + 1e-9) || /^âme|hourdis inf/.test(e.paroi);
    if (cell && q) {
      // direction anti-horaire : hourdis inf. vers +x, âme D vers +y, hourdis sup. vers −x, âme G vers −y
      const dir = e.paroi === 'hourdis inf.' ? [1, 0] : e.paroi === 'âme D' ? [0, 1] : e.paroi === 'âme G' ? [0, -1] : [-1, 0];
      // T = Σ P·x (charges vers le bas) : moment des charges −T autour de l'axe, compensé par le flux anti-horaire 2Ω q = T
      const f = q * L;
      for (const k of [e.i, e.j]) { F[3 * k] += dir[0] * f / 2; F[3 * k + 1] += dir[1] * f / 2; }
    }
  }
  return F;
}

/** Moments aux sections de calcul (kN·m/m) pour un vecteur de charges. Signe : traction de la fibre inférieure (hourdis) ou
 *  extérieure (âmes) positive. */
function momentsSections(C, S, F) {
  const u = S.solve(F), out = {};
  const Mfin = (k, bout) => {   // moment interne à l'extrémité bout ('i' | 'j') de l'élément k, repère local
    const g = S.kg[k], ue = g.dofs.map(d => u[d]), ul = g.t.map(r => r.reduce((s, v, q) => s + v * ue[q], 0)), fl = g.kl.map(r => r.reduce((s, v, q) => s + v * ul[q], 0));
    return bout === 'i' ? -fl[2] : fl[5];   // convention : moment positif = traction côté y local négatif
  };
  for (const s of C.sections) out[s.nom] = s.signe * Mfin(s.k, s.bout);
  out._u = u; out._R = S.fixes.map(d => S.big * u[d]);   // réactions des appuis minimaux : nulles (charges auto-équilibrées)
  return out;
}

/** Sections de calcul : élément et extrémité ; faces tendues par un moment positif / négatif. */
function definirSections(C) {
  const find = (pred) => C.E.findIndex(pred), N = C.N, K = C.K, xw = C.xw;
  const at = (x, y) => N.findIndex(q => Math.abs(q[0] - x) < 1e-9 && Math.abs(q[1] - y) < 1e-9);
  const eTopEndingAt = x => find(e => Math.abs(N[e.j][0] - x) < 1e-9 && Math.abs(N[e.j][1]) < 1e-9 && Math.abs(N[e.i][1]) < 1e-9);
  const eTopStartingAt = x => find(e => Math.abs(N[e.i][0] - x) < 1e-9 && Math.abs(N[e.i][1]) < 1e-9 && Math.abs(N[e.j][1]) < 1e-9);
  const wTop = find(e => e.paroi === 'âme G' && e.i === at(-xw, 0)), wBot = find(e => e.paroi === 'âme G' && e.j === at(-xw, C.yb));
  const bG = find(e => e.paroi === 'hourdis inf.' && e.i === at(-xw, C.yb)), bMid = find(e => e.paroi === 'hourdis inf.' && Math.abs(N[e.j][0]) < 1e-9);
  // hourdis inf. : nœud intermédiaire au nu de l'âme (approché : 1er élément) ; repère local de G vers D (y local vers le haut)
  C.sections = [
    { nom: 'Encorbellement : encastrement (nu extérieur de l\'âme)', k: eTopEndingAt(-xw - K.bw / 2), bout: 'j', signe: 1, t: K.ts, xs: -xw - K.bw / 2, faces: ['inférieure', 'supérieure'] },
    { nom: 'Hourdis supérieur : nu intérieur de l\'âme', k: eTopStartingAt(-xw + K.bw / 2), bout: 'i', signe: 1, t: K.ts, xs: -xw + K.bw / 2, faces: ['inférieure', 'supérieure'] },
    { nom: 'Hourdis supérieur : milieu', k: eTopEndingAt(0), bout: 'j', signe: 1, t: K.ts, xs: 0, faces: ['inférieure', 'supérieure'] },
    { nom: 'Âme : tête', k: wTop, bout: 'i', signe: 1, t: K.bw, xs: null, faces: ['extérieure', 'intérieure'] },
    { nom: 'Âme : pied', k: wBot, bout: 'j', signe: 1, t: K.bw, xs: null, faces: ['extérieure', 'intérieure'] },
    { nom: 'Hourdis inférieur : nu de l\'âme', k: bG, bout: 'i', signe: 1, t: K.ti, xs: null, faces: ['inférieure', 'supérieure'] },
    { nom: 'Hourdis inférieur : milieu', k: bMid, bout: 'j', signe: 1, t: K.ti, xs: null, faces: ['inférieure', 'supérieure'] },
  ];
}

/**
 * Calcul complet. p = { K (caisson), h (hauteur à la clé), Lr (largeur roulable, centrée), gBord (kN/m par bord), tRev (m),
 * tEnc, tGou (épaisseurs du hourdis au droit des goussets, pour le ferraillage), alpha (EC_ALPHA), fck, fyk, c (enrobage) }.
 */
export function flexionTransversale(p) {
  const K = p.K, C = cadreCaisson(K, p.h), S = rigidite(C); definirSections(C);
  const tRev = p.tRev ?? 0.08, Lr = Math.min(p.Lr ?? K.B - 2, K.B - 0.5), gBord = p.gBord ?? 8, al = p.alpha || EC_ALPHA.recommended;
  // permanentes
  const G0 = momentsSections(C, S, chargement(C, [], 25));
  const rev = []; for (let y = -Lr / 2 + 0.05; y < Lr / 2; y += 0.1) rev.push({ y, P: 24 * tRev * 0.1 });
  const G1 = momentsSections(C, S, chargement(C, [...rev, { y: -K.B / 2 + 0.25, P: gBord }, { y: K.B / 2 - 0.25, P: gBord }]));
  // lignes d'influence : charge unité aux nœuds du hourdis supérieur dans la chaussée
  const yi = C.X.filter(x => x >= -Lr / 2 - 1e-9 && x <= Lr / 2 + 1e-9), IL = yi.map(y => momentsSections(C, S, chargement(C, [{ y, P: 1 }])));
  const eta = (nom, y) => { let k = 0; while (k < yi.length - 2 && yi[k + 1] < y) k++; const t = (y - yi[k]) / (yi[k + 1] - yi[k] || 1); return IL[k][nom] * (1 - t) + IL[k + 1][nom] * t; };
  const NL = notionalLanes(Lr), L1 = lm1(NL.n, al), wl = NL.wl, b0 = 0.4 + 2 * tRev + K.ts, lx = 1.2 + b0;
  // largeur de répartition longitudinale d'une roue : l_x = 1,20 + b₀ + 2 d, d = distance de la roue à la section étudiée (à
  // l'appui le plus proche pour les âmes et le hourdis inférieur), plafonnée à 3 m (cf. src/cantilever.js : b₀ + 1,20 + 2x)
  const xsec = Object.fromEntries(C.sections.map(s => [s.nom, s.xs]));
  // roue dans la travée du hourdis entre âmes (portée l = 2 x_w, a = distance à l'âme la plus proche) : largeurs
  // participantes du DAfStb Heft 240, tableau 1 — moment en travée t + 2,5 a (1 − a/l), moment d'encastrement t + 0,5 a (2 − a/l)
  const lC = 2 * C.xw, travee = nom => xsec[nom] === 0, encast = nom => xsec[nom] !== null && Math.abs(Math.abs(xsec[nom]) - C.xw) < K.bw && xsec[nom] > -C.xw;
  const lxAt = (nom, y) => {
    const xs0 = xsec[nom], dans = Math.abs(y) < C.xw, a = C.xw - Math.abs(y);
    if (dans && travee(nom)) return 1.2 + b0 + 2.5 * a * (1 - a / lC);
    if (dans && encast(nom)) return 1.2 + b0 + 0.5 * a * (2 - a / lC);
    const d = xs0 === null ? Math.min(Math.abs(y - C.xw), Math.abs(y + C.xw)) : Math.abs(y - xs0);
    return 1.2 + b0 + 2 * Math.min(d, 3);
  };
  // distortion répartie par le gauchissement et les diaphragmes (p.dist = { m1, uTs, uUdl } de distortionCaisson) : la
  // part de distortion d'une charge unité en y (moment de cadre M_D1 × (−y)) est ramenée à u × (−y) M_D1 —
  // roues : u = u_ts l_x/2 (deux couples d'essieu au lieu de la ligne de roue Q/l_x), UDL : u = u_udl
  const corr = (nom, y, f) => (p.dist ? (1 - f) * (p.dist.m1[nom] || 0) * y : 0);
  const etaT = (nom, y, lxr) => eta(nom, y) + corr(nom, y, p.dist ? p.dist.uTs * lxr / 2 : 1), etaU = (nom, y) => eta(nom, y) + corr(nom, y, p.dist ? p.dist.uUdl : 1);
  const lane = (nom, i, y0) => {   // effet d'une voie i (0 = voie 1) d'axe y0 + wl/2 : UDL sur la voie, deux roues de Q/l_x (kN/m) réparties sur b₀
    const ln = L1.lanes[i] || { Q: 0, q: 2.5 * al.qr }; let ts = 0, udl = 0, tF = 0, tAx = 0;
    for (const dy of [-1, 1]) { const yc = y0 + wl / 2 + dy, lxr = lxAt(nom, yc); for (let k = -2; k <= 2; k++) ts += ln.Q / lxr * etaT(nom, yc + k * b0 / 5, lxr) / 5; tF += ln.Q / lxr * yc; tAx += ln.Q / 2 * yc; }
    for (let k = 0; k < 10; k++) udl += ln.q * wl / 10 * etaU(nom, y0 + (k + 0.5) * wl / 10);
    // couples de torsion (pour la distortion) : par mètre dans le cadre (roues de Q/l_x), par essieu (Q/2 par roue), UDL par mètre
    return { ts, udl, tF, tAx, tU: ln.q * wl * (y0 + wl / 2) };
  };
  const enveloppe = (nom, sg) => {   // sg = +1 : max ; −1 : min
    const pris = [], tot = { ts: 0, udl: 0, tF: 0, tAx: 0, tU: 0 };
    for (let i = 0; i < NL.n; i++) {
      let best = null;
      for (let y0 = -Lr / 2; y0 <= Lr / 2 - wl + 1e-9; y0 += 0.1) {
        if (pris.some(a => y0 < a + wl - 1e-9 && a < y0 + wl - 1e-9)) continue;
        const e = lane(nom, i, y0), v = sg * (e.ts + e.udl);
        if (v > 0 && (!best || v > best.v)) best = { v, y0, ...e };
      }
      if (!best) break; pris.push(best.y0); for (const k of ['ts', 'udl', 'tF', 'tAx', 'tU']) tot[k] += best[k];
    }
    // aire résiduelle (2,5 kN/m² × α_qr) hors des voies, parties défavorables
    for (let y = -Lr / 2 + 0.05; y < Lr / 2; y += 0.1) if (!pris.some(a => y > a && y < a + wl)) { const v = 2.5 * (al.qr ?? 1) * 0.1 * etaU(nom, y); if (sg * v > 0) { tot.udl += v; tot.tU += 2.5 * (al.qr ?? 1) * 0.1 * y; } }
    return tot;
  };
  const res = C.sections.map(s => {
    const g = G0[s.nom] + G1[s.nom], qp = enveloppe(s.nom, 1), qm = enveloppe(s.nom, -1);
    const comb = q => ({ ELU: 1.35 * g + 1.35 * (q.ts + q.udl), CAR: g + q.ts + q.udl, FREQ: g + 0.75 * q.ts + 0.4 * q.udl });
    const cp = comb(qp), cm = comb(qm);
    // épaisseur de calcul : gousset au droit des âmes (encastrement de l'encorbellement, nu intérieur), sinon feuillet
    const tCalc = /encastrement/.test(s.nom) ? (p.tEnc ?? s.t) : /nu intérieur/.test(s.nom) ? (p.tGou ?? s.t) : s.t;
    const dim = (m, sens) => cantileverDesign({ ELU: Math.max(sens * m.ELU, 0), CAR: Math.max(sens * m.CAR, 0), FREQ: Math.max(sens * m.FREQ, 0), hr: tCalc }, { fck: p.fck ?? 40, fyk: p.fyk ?? 500, c: p.c ?? 0.04, phi: 0.016, wkMax: 0.2, kSlab: 1.0 });
    return { ...s, tCalc, cp, cm, tors: { pos: qp, neg: qm }, G: g, Gpp: G0[s.nom], Gsup: G1[s.nom], Qmax: qp.ts + qp.udl, Qmin: qm.ts + qm.udl, ELUmax: cp.ELU, ELUmin: cm.ELU, CARmax: cp.CAR, CARmin: cm.CAR,
      AsTendu: { pos: dim(cp, 1).As, neg: dim(cm, -1).As } };
  });
  return { C, sections: res, NL, lx, b0, Lr, tRev, gBord };
}

/* =====================================================================================================================
 * Distortion du caisson avec diaphragmes : analogie de la poutre sur appui élastique (BEF, Wright, Abdel-Samad et
 * Robinson, ASCE J. Struct. Div. 94(ST7), 1968 ; Hambly, « Bridge Deck Behaviour », chap. 10).
 *   E I_dw θ'''' + k_D θ = t_D(x)
 *  - θ : déformée de distortion (variable conjuguée du couple de distortion t_D, travail t_D θ) ;
 *  - k_D : raideur de distortion du cadre par mètre, obtenue sur le cadre de flexion transversale sous le chargement de
 *    distortion pure D(T) : âmes ± T/(2b) verticalement, hourdis ∓ T/(2h) horizontalement (sens opposé à la torsion),
 *    charges réparties sur les parois ; θ = uᵀF / T, k_D = T / θ ;
 *  - I_dw = ∫ ω² t ds : gauchissement de distortion des parois fléchies dans leur plan (translation de chaque paroi :
 *    âmes ± b/2, hourdis ∓ h/2 par unité de θ ; ω linéaire par paroi, continu aux angles, encorbellements dans le
 *    prolongement du hourdis), rendu orthogonal à l'effort normal et aux flexions (moindres carrés pondérés) ;
 *    contrainte de gauchissement σ_dw = E ω θ'' ;
 *  - diaphragmes rigides (θ = 0) sur piles et tous les s_d ; la charge de trafic excentrée (tandem de la voie 1 au bord
 *    de la chaussée) est appliquée au milieu du panneau central ; la référence est le cadre par mètre sans gauchissement
 *    (θ_réf = t_D / k_D, t_D = couple par mètre du § flexion transversale) : ρ = θ_max / θ_réf mesure la réduction de la
 *    part de distortion des moments de cadre.
 * ================================================================================================================== */

/** Chargement de distortion pure D(T) (vecteur nodal) sur le cadre C. */
function chargementDistortion(C, T = 1) {
  const F = new Float64Array(3 * C.N.length), b = 2 * C.xw, h = -C.yb;
  for (const e of C.E) {
    const [xi, yi] = C.N[e.i], [xj, yj] = C.N[e.j], L = Math.hypot(xj - xi, yj - yi);
    let f = null;
    if (e.paroi === 'âme D') f = [0, T / (2 * b) / h * L];
    else if (e.paroi === 'âme G') f = [0, -T / (2 * b) / h * L];
    else if (e.paroi === 'hourdis sup.' && Math.min(xi, xj) >= -C.xw - 1e-9 && Math.max(xi, xj) <= C.xw + 1e-9) f = [T / (2 * h) / b * L, 0];
    else if (e.paroi === 'hourdis inf.') f = [-T / (2 * h) / b * L, 0];
    if (f) for (const k of [e.i, e.j]) { F[3 * k] += f[0] / 2; F[3 * k + 1] += f[1] / 2; }
  }
  return F;
}

/** Gauchissement de distortion ω (m² par unité de θ') aux points des parois et inertie I_dw (m⁶). */
export function gauchissementDistortion(K, h) {
  const xw = K.Bi / 2 - K.bw / 2, hh = h - K.ts / 2 - K.ti / 2, b = 2 * xw, pts = [];
  const add = (x, y, w, t, ds) => pts.push({ x, y, w, a: t * ds });
  const n = 200;
  // hourdis supérieur (encorbellements compris) : w = (h/2)(x_w − x) ; âme gauche : w = w_TL − (b/2) s ; inférieur ; âme droite
  for (let i = 0; i < n; i++) { const x = -K.B / 2 + K.B * (i + 0.5) / n; add(x, 0, (hh / 2) * (xw - x), K.ts, K.B / n); }
  for (let i = 0; i < n; i++) { const s = hh * (i + 0.5) / n; add(-xw, -s, hh * b / 2 - (b / 2) * s, K.bw, hh / n); }
  for (let i = 0; i < n; i++) { const s = b * (i + 0.5) / n; add(-xw + s, -hh, (hh / 2) * s, K.ti, b / n); }
  for (let i = 0; i < n; i++) { const s = hh * (i + 0.5) / n; add(xw, -hh + s, hh * b / 2 - (b / 2) * s, K.bw, hh / n); }
  // orthogonalisation : w ← w − (c₀ + c₁ x + c₂ y), moindres carrés pondérés par t ds
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
  for (const q of pts) { const f = [1, q.x, q.y]; for (let i = 0; i < 3; i++) { r[i] += q.a * f[i] * q.w; for (let j = 0; j < 3; j++) M[i][j] += q.a * f[i] * f[j]; } }
  const c = lu(M)(r);
  let I = 0, wmax = 0; for (const q of pts) { q.w -= c[0] + c[1] * q.x + c[2] * q.y; I += q.a * q.w * q.w; wmax = Math.max(wmax, Math.abs(q.w)); }
  const coin = (x, y) => pts.reduce((a, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(a.x - x, a.y - y) ? q : a)).w;
  return { Idw: I, wmax, coins: { TL: coin(-xw, 0), TR: coin(xw, 0), BL: coin(-xw, -hh), BR: coin(xw, -hh) }, b, h: hh };
}

/** Poutre sur appui élastique (éléments de Hermite) : θ(x) sous charges ponctuelles et réparties, θ = 0 aux diaphragmes. */
export function poutreSurAppuiElastique({ L, EI, k, diaphragmes, ponctuelles = [], repartie = null, pas = 0.25 }) {
  const xs = [...new Set([0, L, ...diaphragmes, ...ponctuelles.map(q => q.x), ...Array.from({ length: Math.ceil(L / pas) + 1 }, (_, i) => Math.min(L, i * pas))].map(v => +v.toFixed(6)))].sort((a, b) => a - b);
  const n = xs.length, nd = 2 * n, Km = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
  for (let e = 0; e < n - 1; e++) {
    const l = xs[e + 1] - xs[e], d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    const kb = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]].map(r => r.map(v => v * EI / l ** 3));
    const kf = [[156, 22 * l, 54, -13 * l], [22 * l, 4 * l * l, 13 * l, -3 * l * l], [54, 13 * l, 156, -22 * l], [-13 * l, -3 * l * l, -22 * l, 4 * l * l]].map(r => r.map(v => v * k * l / 420));
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) Km[d[a]][d[b]] += kb[a][b] + kf[a][b];
    if (repartie) { const xm = (xs[e] + xs[e + 1]) / 2; if (xm >= repartie.x0 && xm <= repartie.x1) { const q = repartie.t; F[d[0]] += q * l / 2; F[d[1]] += q * l * l / 12; F[d[2]] += q * l / 2; F[d[3]] -= q * l * l / 12; } }
  }
  for (const p of ponctuelles) F[2 * xs.findIndex(v => Math.abs(v - +p.x.toFixed(6)) < 1e-9)] += p.T;
  const big = 1e10 * Math.max(...Km.map((r, i) => r[i]));
  for (const xd of diaphragmes) { const i = xs.findIndex(v => Math.abs(v - +xd.toFixed(6)) < 1e-9); Km[2 * i][2 * i] += big; }
  const u = lu(Km)(F), th = xs.map((_, i) => u[2 * i]);
  // courbure θ'' aux nœuds (différences finies sur les rotations)
  const cour = xs.map((x, i) => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); return (u[2 * b + 1] - u[2 * a + 1]) / (xs[b] - xs[a]); });
  return { xs, th, cour, thMax: Math.max(...th.map(Math.abs)), courMax: Math.max(...cour.map(Math.abs)) };
}

/**
 * Distortion avec diaphragmes. p = { K, h, Lspan (portée centrale), sd (entraxe des diaphragmes, 0 = piles seules),
 * Lr, tRev, fck, alpha }. Utilise la flexion transversale déjà calculée (sections, l_x) pour la référence.
 */
export function distortionCaisson(p) {
  const K = p.K, C = cadreCaisson(K, p.h), S = rigidite(C); definirSections(C);
  const T = 1, F = chargementDistortion(C, T), u = S.solve(F), thetaCadre = u.reduce((s, v, i) => s + v * F[i], 0) / T;   // E = 1
  const Ecm = 22000 * ((p.fck + 8) / 10) ** 0.3 * 1000, kD = T / thetaCadre;   // raideur pour E = 1 → multipliée par E
  const kDE = kD * Ecm, G = gauchissementDistortion(K, p.h), EIdw = Ecm * G.Idw;
  const MD = momentsSections(C, S, F);   // moments de cadre sous D(1) ; par unité de θ : × k_D
  // moments de cadre par unité de θ réel (θ_réel = θ_{E=1} / E) : M_D × k_D,E (les moments ne dépendent pas de E)
  const parTheta = Object.fromEntries(C.sections.map(s => [s.nom, MD[s.nom] * kDE]));
  // charge excentrée : tandem de la voie 1 contre la bordure (axe de la voie à L_r/2 − 1,5 m), deux essieux à 1,20 m
  const al = p.alpha || EC_ALPHA.recommended, L1 = lm1(notionalLanes(p.Lr).n, al), Q = L1.lanes[0].Q, e = p.Lr / 2 - 1.5;
  // couple d'un essieu (kN·m) : le chargement de distortion pure D(T) associé à une charge excentrée de couple T a pour
  // intensité T (âmes ± T/2b : moitié de la part antisymétrique, l'autre moitié étant la torsion de Bredt)
  const Td = Q * e, tD1 = Td, b0 = 0.4 + 2 * (p.tRev ?? 0.08) + K.ts, lx = 1.2 + b0;
  const Ls = p.Lspan, sd = p.sd || 0, dia = [0, Ls]; if (sd > 0) for (let x = sd; x < Ls - 1e-6; x += sd) dia.push(x);
  dia.sort((a, b) => a - b);
  // panneau central : le plus proche du milieu de la travée
  let pi = 0; for (let i = 0; i < dia.length - 1; i++) if (Math.abs((dia[i] + dia[i + 1]) / 2 - Ls / 2) < Math.abs((dia[pi] + dia[pi + 1]) / 2 - Ls / 2)) pi = i;
  const xc = (dia[pi] + dia[pi + 1]) / 2;
  const calc = diaph => poutreSurAppuiElastique({ L: Ls, EI: EIdw, k: kDE, diaphragmes: diaph, ponctuelles: [{ x: xc - 0.6, T: tD1 }, { x: xc + 0.6, T: tD1 }] });
  const avec = calc(dia), sans = calc([0, Ls]);
  // réponses unitaires : deux couples ponctuels de 1 kN·m (essieux du tandem) au milieu du panneau central, couple réparti
  // de 1 kN·m/m sur toute la travée ; θ_max × k_D = couple par mètre « vu » par le cadre
  const unit = diaph => ({ ts: poutreSurAppuiElastique({ L: Ls, EI: EIdw, k: kDE, diaphragmes: diaph, ponctuelles: [{ x: xc - 0.6, T: 1 }, { x: xc + 0.6, T: 1 }] }).thMax * kDE,
    udl: poutreSurAppuiElastique({ L: Ls, EI: EIdw, k: kDE, diaphragmes: diaph, repartie: { x0: 0, x1: Ls, t: 1 } }).thMax * kDE });
  const u1 = { avec: unit(dia), sans: unit([0, Ls]) };
  const thRef = (2 * tD1 / lx) / kDE;   // cadre par mètre sans gauchissement : couple par mètre des deux essieux répartis sur l_x
  const sigma = r => Ecm * G.wmax * r.courMax / 1000;   // MPa
  const ligne = r => ({ thMax: r.thMax, rho: r.thMax / thRef, sigma: sigma(r), M: Object.fromEntries(Object.entries(parTheta).map(([k, v]) => [k, v * r.thMax])) });
  return { kD: kDE, Idw: G.Idw, EIdw, beta: (kDE / (4 * EIdw)) ** 0.25, G, diaphragmes: dia, sd, Td, tD1, lx, thRef,
    avec: ligne(avec), sans: ligne(sans), MD1: Object.fromEntries(C.sections.map(s => [s.nom, MD[s.nom]])), u1, ref: { M: Object.fromEntries(Object.entries(parTheta).map(([k, v]) => [k, v * thRef])) }, courbe: avec };
}
