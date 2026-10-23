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
 *   - la part restante déforme le cadre en distortion : sans diaphragme intermédiaire (gauchissement de distortion
 *     négligé), les moments de cadre obtenus en sont un majorant (du côté de la sécurité).
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
  const lane = (nom, i, y0) => {   // effet d'une voie i (0 = voie 1) d'axe y0 + wl/2 : UDL sur la voie, deux roues de Q/l_x (kN/m) réparties sur b₀
    const ln = L1.lanes[i] || { Q: 0, q: 2.5 * al.qr }; let ts = 0, udl = 0;
    for (const dy of [-1, 1]) { const yc = y0 + wl / 2 + dy, lxr = lxAt(nom, yc); for (let k = -2; k <= 2; k++) ts += ln.Q / lxr * eta(nom, yc + k * b0 / 5) / 5; }
    for (let k = 0; k < 10; k++) udl += ln.q * wl / 10 * eta(nom, y0 + (k + 0.5) * wl / 10);
    return { ts, udl };
  };
  const enveloppe = (nom, sg) => {   // sg = +1 : max ; −1 : min
    const pris = [], tot = { ts: 0, udl: 0 };
    for (let i = 0; i < NL.n; i++) {
      let best = null;
      for (let y0 = -Lr / 2; y0 <= Lr / 2 - wl + 1e-9; y0 += 0.1) {
        if (pris.some(a => y0 < a + wl - 1e-9 && a < y0 + wl - 1e-9)) continue;
        const e = lane(nom, i, y0), v = sg * (e.ts + e.udl);
        if (v > 0 && (!best || v > best.v)) best = { v, y0, ...e };
      }
      if (!best) break; pris.push(best.y0); tot.ts += best.ts; tot.udl += best.udl;
    }
    // aire résiduelle (2,5 kN/m² × α_qr) hors des voies, parties défavorables
    for (let y = -Lr / 2 + 0.05; y < Lr / 2; y += 0.1) if (!pris.some(a => y > a && y < a + wl)) { const v = 2.5 * (al.qr ?? 1) * 0.1 * eta(nom, y); if (sg * v > 0) tot.udl += v; }
    return tot;
  };
  const res = C.sections.map(s => {
    const g = G0[s.nom] + G1[s.nom], qp = enveloppe(s.nom, 1), qm = enveloppe(s.nom, -1);
    const comb = q => ({ ELU: 1.35 * g + 1.35 * (q.ts + q.udl), CAR: g + q.ts + q.udl, FREQ: g + 0.75 * q.ts + 0.4 * q.udl });
    const cp = comb(qp), cm = comb(qm);
    // épaisseur de calcul : gousset au droit des âmes (encastrement de l'encorbellement, nu intérieur), sinon feuillet
    const tCalc = /encastrement/.test(s.nom) ? (p.tEnc ?? s.t) : /nu intérieur/.test(s.nom) ? (p.tGou ?? s.t) : s.t;
    const dim = (m, sens) => cantileverDesign({ ELU: Math.max(sens * m.ELU, 0), CAR: Math.max(sens * m.CAR, 0), FREQ: Math.max(sens * m.FREQ, 0), hr: tCalc }, { fck: p.fck ?? 40, fyk: p.fyk ?? 500, c: p.c ?? 0.04, phi: 0.016, wkMax: 0.2, kSlab: 1.0 });
    return { ...s, tCalc, G: g, Gpp: G0[s.nom], Gsup: G1[s.nom], Qmax: qp.ts + qp.udl, Qmin: qm.ts + qm.udl, ELUmax: cp.ELU, ELUmin: cm.ELU, CARmax: cp.CAR, CARmin: cm.CAR,
      AsTendu: { pos: dim(cp, 1).As, neg: dim(cm, -1).As } };
  });
  return { C, sections: res, NL, lx, b0, Lr, tRev, gBord };
}
