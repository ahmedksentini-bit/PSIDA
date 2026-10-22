/**
 * Portique plan par la méthode des déplacements — barres droites, 3 DDL par nœud (u, v, θ), flexion et effort normal.
 * Portage fidèle de BVTrace.Core/PlaneFrame.cs (même assemblage, même solveur, mêmes conventions), étendu par des
 * appuis explicites pour les portiques ouverts (PIPO) : quand `appuis` est fourni, les DDL désignés sont bloqués et les
 * réactions sont restituées ; sinon le cadre est « flottant » (sa réaction de sol fait partie du chargement) et l'on
 * bloque les trois modes de corps rigide en vérifiant que les réactions y sont nulles.
 *
 * Unités : m, t (ou kN, au choix, tant qu'on reste cohérent), t·m. Inertie et section par mètre d'ouvrage (I = e³/12, A = e).
 * Convention des moments exposés : positif = fibre tendue du côté −y local (axe local y = axe A→B tourné de +90°).
 * Bi-encastrée sous charge uniforme : −qL²/12 aux appuis, +qL²/24 à mi-portée.
 */

export const EQUILIBRE_TOL = 1e-6;
export const EQUILIBRE_TOL_REL = 1e-6;
/** Rapport raideur axiale / raideur de flexion quand l'effort normal est négligé (méthode classique). */
export const RAPPORT_AXIAL_RIGIDE = 1e8;

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

/** Résultat d'une barre : moments et efforts aux extrémités, puis M(x), V(x) par intégration des charges. */
export class BarreResultat {
  constructor(o) { Object.assign(this, { Ks: 0, A0: 0, A1: 0, A2: 0, A3: 0, bandes: [] }, o); }
  /** Réaction du sol à l'abscisse x (portée par y local). */
  solAt(xM) {
    if (!(this.Ks > 0)) return 0;
    const x = clamp(xM, 0, this.L);
    return -this.Ks * (this.A0 + this.A1 * x + this.A2 * x * x + this.A3 * x * x * x);
  }
  _solM(x) {
    if (!(this.Ks > 0)) return 0;
    const x2 = x * x;
    return -this.Ks * (this.A0 * x2 / 2 + this.A1 * x2 * x / 6 + this.A2 * x2 * x2 / 12 + this.A3 * x2 * x2 * x / 20);
  }
  _solV(x) {
    if (!(this.Ks > 0)) return 0;
    const x2 = x * x;
    return -this.Ks * (this.A0 * x + this.A1 * x2 / 2 + this.A2 * x2 * x / 3 + this.A3 * x2 * x2 / 4);
  }
  _bandM(x) { let s = 0; for (const [a, b, w] of this.bandes) { const d = Math.min(x, b) - a; if (d > 0) s += w * d * (x - a - d / 2); } return s; }
  _bandV(x) { let s = 0; for (const [a, b, w] of this.bandes) { const d = Math.min(x, b) - a; if (d > 0) s += w * d; } return s; }
  M(xM) {
    const L = this.L;
    if (xM < -1e-9 || xM > L + 1e-9) throw new RangeError(`abscisse ${xM} hors de la barre (0 à ${L})`);
    const x = clamp(xM, 0, L);
    const q = this.wA * x * x / 2 + (this.wB - this.wA) / L * x * x * x / 6;
    return this.MA + this.VA * x + q + this._bandM(x) + this._solM(x);
  }
  V(xM) {
    const L = this.L, x = clamp(xM, 0, L);
    return this.VA + this.wA * x + (this.wB - this.wA) / L * x * x / 2 + this._bandV(x) + this._solV(x);
  }
  get Mmid() { return this.M(this.L / 2); }
  diagramme(n = 21) {
    n = Math.max(2, n);
    const p = [];
    for (let i = 0; i < n; i++) { const x = this.L * i / (n - 1); p.push([x, this.M(x), this.V(x)]); }
    return p;
  }
  /** Moment maximal en travée et son abscisse (balayage, comme le C#). */
  maxTravee(n = 201) {
    let best = -Infinity, bx = 0;
    for (let i = 0; i <= n; i++) { const x = this.L * i / n, m = this.M(x); if (m > best) { best = m; bx = x; } }
    return [best, bx];
  }
  minTravee(n = 201) {
    let best = Infinity, bx = 0;
    for (let i = 0; i <= n; i++) { const x = this.L * i / n, m = this.M(x); if (m < best) { best = m; bx = x; } }
    return [best, bx];
  }
}

function raideurLocale(EA, EI, L) {
  const L2 = L * L, L3 = L2 * L, k = Array.from({ length: 6 }, () => new Array(6).fill(0));
  k[0][0] = EA / L; k[0][3] = -EA / L; k[3][0] = -EA / L; k[3][3] = EA / L;
  k[1][1] = 12 * EI / L3; k[1][2] = 6 * EI / L2; k[1][4] = -12 * EI / L3; k[1][5] = 6 * EI / L2;
  k[2][1] = 6 * EI / L2; k[2][2] = 4 * EI / L; k[2][4] = -6 * EI / L2; k[2][5] = 2 * EI / L;
  k[4][1] = -12 * EI / L3; k[4][2] = -6 * EI / L2; k[4][4] = 12 * EI / L3; k[4][5] = -6 * EI / L2;
  k[5][1] = 6 * EI / L2; k[5][2] = 2 * EI / L; k[5][4] = -6 * EI / L2; k[5][5] = 4 * EI / L;
  return k;
}

/** Matrice consistante de Winkler ∫ k NᵗN dx (fonctions d'Hermite). */
function ajouterSol(k, ks, L) {
  const f = ks * L / 420, L2 = L * L, d = [1, 2, 4, 5];
  const m = [[156, 22 * L, 54, -13 * L], [22 * L, 4 * L2, 13 * L, -3 * L2], [54, 13 * L, 156, -22 * L], [-13 * L, -3 * L2, -22 * L, 4 * L2]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[d[i]][d[j]] += f * m[i][j];
}

/** Forces d'encastrement parfait, charge trapézoïdale wA → wB : [N1, V1, M1, N2, V2, M2]. */
function encastrement(wA, wB, L) {
  const L2 = L * L;
  let v1 = -wA * L / 2, m1 = -wA * L2 / 12, v2 = -wA * L / 2, m2 = wA * L2 / 12;
  const t = wB - wA;
  v1 += -3 * t * L / 20; m1 += -t * L2 / 30; v2 += -7 * t * L / 20; m2 += t * L2 / 20;
  return [0, v1, m1, 0, v2, m2];
}

/** Forces d'encastrement d'une bande uniforme w entre a et b (intégration exacte des fonctions d'Hermite). */
function encastrementBande(w, a, b, L) {
  const I1 = t => t - t ** 3 + t ** 4 / 2, I2 = t => t * t / 2 - 2 * t ** 3 / 3 + t ** 4 / 4;
  const I3 = t => t ** 3 - t ** 4 / 2, I4 = t => -(t ** 3) / 3 + t ** 4 / 4;
  const al = a / L, be = b / L, L2 = L * L;
  return [0, -w * L * (I1(be) - I1(al)), -w * L2 * (I2(be) - I2(al)), 0, -w * L * (I3(be) - I3(al)), -w * L2 * (I4(be) - I4(al))];
}

function rotation(c, s) {
  const T = Array.from({ length: 6 }, () => new Array(6).fill(0));
  T[0][0] = c; T[0][1] = s; T[1][0] = -s; T[1][1] = c; T[2][2] = 1;
  T[3][3] = c; T[3][4] = s; T[4][3] = -s; T[4][4] = c; T[5][5] = 1;
  return T;
}
function congruence(T, k) {
  const tmp = Array.from({ length: 6 }, () => new Array(6).fill(0)), r = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let v = 0; for (let p = 0; p < 6; p++) v += k[i][p] * T[p][j]; tmp[i][j] = v; }
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let v = 0; for (let p = 0; p < 6; p++) v += T[p][i] * tmp[p][j]; r[i][j] = v; }
  return r;
}
const fois = (T, v) => T.map(row => row.reduce((s, t, j) => s + t * v[j], 0));
const transposeFois = (T, v) => { const r = new Array(6).fill(0); for (let i = 0; i < 6; i++) { let s = 0; for (let j = 0; j < 6; j++) s += T[j][i] * v[j]; r[i] = s; } return r; };

/** Gauss-Jordan avec pivot partiel (même algorithme que le C#). */
function resoudre(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error('portique instable : matrice de rigidité singulière (barres non reliées ou modes de corps rigide non bloqués)');
    if (piv !== col) [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function plusLoin(noeuds, de) {
  let best = de === 0 ? 1 : 0, bd = -1;
  for (let i = 0; i < noeuds.length; i++) {
    if (i === de) continue;
    const dx = noeuds[i][0] - noeuds[de][0], dy = noeuds[i][1] - noeuds[de][1], d = dx * dx + dy * dy;
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * Résout un cas de charge.
 * @param noeuds  [[x, y], …]
 * @param barres  [{ a, b, I, A, ks? }]  (ks : raideur de Winkler sous la barre, par m d'enfoncement)
 * @param charges [{ barre, wA, wB }]   charges réparties trapézoïdales (axe y local)
 * @param opts    { E = 1, nodales: [{ noeud, Fx, Fy, M }], bandes: [{ barre, w, xA, xB }], axialRigide = true,
 *                  appuis: [{ noeud, ddl: [0|1|2, …] }] (portique appuyé : pas de contrôle d'auto-équilibre) }
 */
export function resoudrePortique(noeuds, barres, charges = [], opts = {}) {
  const { E = 1, nodales = [], bandes: bandesIn = [], axialRigide = true, appuis = null } = opts;
  if (!noeuds || noeuds.length < 2) throw new Error('portique vide');
  if (!barres || !barres.length) throw new Error('aucune barre');
  if (!(E > 0)) throw new RangeError('module E nul ou négatif');
  const n = noeuds.length, ndof = 3 * n;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0)), F = new Array(ndof).fill(0);
  const wa = new Array(barres.length).fill(0), wb = new Array(barres.length).fill(0);
  for (const c of charges) {
    if (c.barre < 0 || c.barre >= barres.length) throw new RangeError(`charge sur la barre ${c.barre}, qui n'existe pas`);
    wa[c.barre] += c.wA; wb[c.barre] += c.wB;
  }
  const bandes = barres.map(() => null);
  for (const p of bandesIn) {
    if (p.barre < 0 || p.barre >= barres.length) throw new RangeError(`bande sur la barre ${p.barre}, qui n'existe pas`);
    if (p.w === 0) continue;
    if (!(p.xB > p.xA)) throw new RangeError(`bande d'étendue nulle sur la barre ${p.barre}`);
    (bandes[p.barre] ||= []).push([p.xA, p.xB, p.w]);
  }
  for (const q of nodales) {
    if (q.noeud < 0 || q.noeud >= n) throw new RangeError(`charge sur le nœud ${q.noeud}, qui n'existe pas`);
    F[3 * q.noeud] += q.Fx || 0; F[3 * q.noeud + 1] += q.Fy || 0; F[3 * q.noeud + 2] += q.M || 0;
  }
  const aire = (mb, L) => axialRigide ? Math.max(mb.A, RAPPORT_AXIAL_RIGIDE * 12 * mb.I / (L * L)) : mb.A;
  const fefs = (m, L) => {
    const f = encastrement(wa[m], wb[m], L);
    for (const [a, b, w] of bandes[m] || []) {
      if (a < -1e-9 || b > L + 1e-9) throw new RangeError(`bande de ${a} à ${b} m hors de la barre ${m} (0 à ${L} m)`);
      const g = encastrementBande(w, Math.max(a, 0), Math.min(b, L), L);
      for (let i = 0; i < 6; i++) f[i] += g[i];
    }
    return f;
  };
  const geom = [];
  barres.forEach((mb, m) => {
    const A = noeuds[mb.a], B = noeuds[mb.b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    if (!(L > 1e-9)) throw new Error(`barre ${m} de longueur nulle`);
    if (!(mb.I > 0) || !(mb.A > 0)) throw new Error(`barre ${m} : inertie ou section nulle`);
    const c = dx / L, s = dy / L;
    geom[m] = [L, c, s];
    const kl = raideurLocale(E * aire(mb, L), E * mb.I, L);
    if (mb.ks > 0) ajouterSol(kl, mb.ks, L);
    const T = rotation(c, s), kg = congruence(T, kl), fg = transposeFois(T, fefs(m, L));
    const map = [3 * mb.a, 3 * mb.a + 1, 3 * mb.a + 2, 3 * mb.b, 3 * mb.b + 1, 3 * mb.b + 2];
    for (let i = 0; i < 6; i++) { F[map[i]] -= fg[i]; for (let j = 0; j < 6; j++) K[map[i]][map[j]] += kg[i][j]; }
  });

  let fixes;
  const surSol = barres.some(b => b.ks > 0);
  if (appuis) fixes = appuis.flatMap(a => a.ddl.map(d => 3 * a.noeud + d));
  else {
    const nA = 0, nB = plusLoin(noeuds, 0);
    fixes = surSol ? [3 * nA] : [3 * nA, 3 * nA + 1, 3 * nB + 1];
  }
  const Kr = K.map(r => r.slice()), Fr = F.slice();
  for (const d of fixes) { for (let j = 0; j < ndof; j++) { Kr[d][j] = 0; Kr[j][d] = 0; } Kr[d][d] = 1; Fr[d] = 0; }
  const u = resoudre(Kr, Fr);

  const reactions = {};
  let residu = 0;
  for (const d of fixes) {
    let r = -F[d];
    for (let j = 0; j < ndof; j++) r += K[d][j] * u[j];
    reactions[d] = r;
    residu = Math.max(residu, Math.abs(r));
  }
  if (!appuis) {
    const echelle = F.reduce((s, v) => s + Math.abs(v), 0), tol = Math.max(EQUILIBRE_TOL, EQUILIBRE_TOL_REL * echelle);
    if (residu > tol) throw new Error(`cas de charge non auto-équilibré : réaction résiduelle ${residu.toExponential(3)} aux blocages. ` + (surSol
      ? 'Le sol élastique reprend la charge verticale, mais la résultante horizontale doit être équilibrée (frottement sous le radier en cas de poussée dissymétrique).'
      : 'Un cadre fermé ne repose sur aucun appui : la réaction du sol doit faire partie du chargement et équilibrer exactement les charges.'));
  }

  const res = barres.map((mb, m) => {
    const [L, c, s] = geom[m];
    const map = [3 * mb.a, 3 * mb.a + 1, 3 * mb.a + 2, 3 * mb.b, 3 * mb.b + 1, 3 * mb.b + 2];
    const dl = fois(rotation(c, s), map.map(i => u[i]));
    const kl = raideurLocale(E * aire(mb, L), E * mb.I, L);
    if (mb.ks > 0) ajouterSol(kl, mb.ks, L);
    const fef = fefs(m, L), f = fef.map((v, i) => v + kl[i].reduce((t, k, j) => t + k * dl[j], 0));
    const r = new BarreResultat({ L, MA: -f[2], MB: f[5], VA: f[1], VB: -f[4], N: f[0], wA: wa[m], wB: wb[m], bandes: bandes[m] || [] });
    if (mb.ks > 0) {
      const [v1, t1, v2, t2] = [dl[1], dl[2], dl[4], dl[5]];
      Object.assign(r, { Ks: mb.ks, A0: v1, A1: t1, A2: (-3 * v1 - 2 * t1 * L + 3 * v2 - t2 * L) / (L * L), A3: (2 * v1 + t1 * L - 2 * v2 + t2 * L) / (L * L * L) });
    }
    return r;
  });
  return { barres: res, u, residu, reactions };
}
