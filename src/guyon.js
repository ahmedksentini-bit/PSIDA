/**
 * Répartition transversale par la méthode de Guyon-Massonnet (dalle isotrope, α = 1).
 *
 * Au lieu de lire les tables de Massonnet-Bareš, on résout exactement l'équation de la
 * plaque isotrope pour une charge-ligne sinusoïdale p·sin(nπx/L) placée à l'excentricité e :
 *
 *      D (Y'''' − 2 k² Y'' + k⁴ Y) = p δ(y − e),   k = nπ/L,   y ∈ [−b, +b]
 *
 * avec bords libres en y = ±b. Hypothèse classique de la méthode : coefficient de Poisson ν = 0
 * (les tables de Guyon-Massonnet sont établies pour ν = 0 ; un ν ≠ 0 est admis en option pour
 * les moments transversaux, cf. correction de Bareš).
 *
 * Avec ν = 0, l'intégration de l'équation sur la largeur donne exactement
 *      ∫ Y dy = p / (D k⁴)   ⇒   flèche moyenne = flèche de la poutre équivalente,
 * d'où le coefficient de répartition K(y) = Y(y) / Y_moy = 2 b k⁴ Y(y)   (p = D = 1).
 *
 * Moment longitudinal par mètre : m_x(y) = K(y) · M_poutre / (2b)   (premier harmonique).
 * Moment transversal par mètre sous la charge-ligne unitaire : m_y = −D(Y'' − ν k² Y) ;
 * Massonnet définit μ par m_y = μ · b · p.
 *
 * Base de fonctions à exponentielles bornées (centrées sur les extrémités de chaque région)
 * pour rester bien conditionné même pour θ = b/L élevé ou harmoniques élevés.
 */
import { solve, gaussNodes } from './linalg.js';

/**
 * Résout l'harmonique n pour une charge-ligne unitaire en e.
 * @param {{b:number, L:number, n?:number, e:number, nu?:number}} p
 * @returns {{k:number, Y:(y:number)=>number, d1, d2, d3, b:number, e:number}}
 */
export function plateHarmonic({ b, L, n = 1, e, nu = 0, alpha = 1 }) {
  const k = n * Math.PI / L;
  const tolEdge = 1e-9 * b;
  const edgeLoad = e >= b - tolEdge ? +1 : e <= -b + tolEdge ? -1 : 0;
  const iso = alpha >= 1 - 1e-9;

  // Base de fonctions → [f, f', f'', f'''] en y.
  //  α = 1 (racine double k)      : {E, (y−c)E}, E = exp(s k (y−c))
  //  α < 1 (racines complexes)    : {Re F, Im F}, F = exp(λ (y−c)), λ = k (s·a + i·c₁),
  //                                 a = √((1+α)/2), c₁ = √((1−α)/2)   (paramètre de torsion de Guyon-Massonnet)
  const ca = Math.sqrt((1 + alpha) / 2), cc = Math.sqrt(Math.max(0, (1 - alpha) / 2));
  const basis = (list, y) => list.map(({ s, c, lin }) => {
    const t = y - c;
    if (iso) {
      const E = Math.exp(s * k * t);
      if (!lin) return [E, s * k * E, k * k * E, s * k * k * k * E];
      return [t * E, E * (1 + s * k * t), E * (2 * s * k + k * k * t), E * (3 * k * k + s * k * k * k * t)];
    }
    // λ = k(s·a + i·c₁) ; F = e^{λt} ; F^(m) = λ^m F ; lin=false → Re, lin=true → Im
    const lr = k * s * ca, li = k * cc;
    const mod = Math.exp(lr * t), ph = li * t;
    let pr = 1, pi = 0; // λ^m
    const out = [];
    for (let m = 0; m < 4; m++) {
      const Fr = mod * (pr * Math.cos(ph) - pi * Math.sin(ph));
      const Fi = mod * (pr * Math.sin(ph) + pi * Math.cos(ph));
      out.push(lin ? Fi : Fr);
      const nr = pr * lr - pi * li, ni = pr * li + pi * lr; pr = nr; pi = ni;
    }
    return out;
  });
  const momentOp = f => f[2] - nu * k * k * f[0];                       // M_y = 0 (à D près)
  const shearOp = f => f[3] - (2 * alpha - nu) * k * k * f[1];          // V_y (Kirchhoff) = 0 (à −D près)

  if (edgeLoad !== 0) {
    // Une seule région : la charge en bord devient une condition aux limites
    //   Y''' − (2−ν)k² Y' = −1 en y = +b (charge en +b)  /  = +1 en y = −b (charge en −b)
    // base bornée sur [−b, b] : exp(−k(y+b)), (y+b)exp(−k(y+b)), exp(k(y−b)), (y−b)exp(k(y−b))
    const Bs = [{ s: -1, c: -b, lin: false }, { s: -1, c: -b, lin: true }, { s: 1, c: b, lin: false }, { s: 1, c: b, lin: true }];
    const fm = basis(Bs, -b), fp = basis(Bs, b);
    const A = [fm.map(momentOp), fm.map(shearOp), fp.map(momentOp), fp.map(shearOp)];
    const rhs = [0, edgeLoad > 0 ? 0 : 1, 0, edgeLoad > 0 ? -1 : 0];
    const C = solve(A, rhs);
    const ev = (y, m) => { const f = basis(Bs, y); let s = 0; for (let i = 0; i < 4; i++) s += C[i] * f[i][m]; return s; };
    return { k, b, e, Y: y => ev(y, 0), d1: y => ev(y, 1), d2: y => ev(y, 2), d3: y => ev(y, 3) };
  }

  const left = [{ s: 1, c: e, lin: false }, { s: 1, c: e, lin: true }, { s: -1, c: -b, lin: false }, { s: -1, c: -b, lin: true }];
  const right = [{ s: -1, c: e, lin: false }, { s: -1, c: e, lin: true }, { s: 1, c: b, lin: false }, { s: 1, c: b, lin: true }];
  const fL = basis(left, -b), fR = basis(right, b), fLe = basis(left, e), fRe = basis(right, e);
  const A = [];
  const row = (aPart, bPart) => [...aPart, ...bPart];
  A.push(row(fL.map(momentOp), [0, 0, 0, 0]));
  A.push(row(fL.map(shearOp), [0, 0, 0, 0]));
  A.push(row([0, 0, 0, 0], fR.map(momentOp)));
  A.push(row([0, 0, 0, 0], fR.map(shearOp)));
  for (let m = 0; m < 4; m++) A.push(row(fLe.map(f => -f[m]), fRe.map(f => f[m])));
  const rhs = [0, 0, 0, 0, 0, 0, 0, 1];
  const C = solve(A, rhs);
  const cL = C.slice(0, 4), cR = C.slice(4, 8);
  const ev = (y, m) => {
    const f = y < e ? basis(left, y) : basis(right, y);
    const c = y < e ? cL : cR;
    let s = 0; for (let i = 0; i < 4; i++) s += c[i] * f[i][m];
    return s;
  };
  return { k, b, e, Y: y => ev(y, 0), d1: y => ev(y, 1), d2: y => ev(y, 2), d3: y => ev(y, 3) };
}

/** Flèche moyenne sur la largeur (intégration numérique ; utile si ν ≠ 0). */
export function meanDeflection(h, pieces = 64) {
  const { b, e } = h;
  let s = 0;
  const seg = [[-b, e], [e, b]];
  for (const [a1, b1] of seg) {
    if (b1 - a1 <= 0) continue;
    const n = Math.max(2, Math.round(pieces * (b1 - a1) / (2 * b)));
    const hh = (b1 - a1) / n;
    for (let i = 0; i < n; i++) for (const [y, w] of gaussNodes(a1 + i * hh, a1 + (i + 1) * hh, 4)) s += w * h.Y(y);
  }
  return s / (2 * b);
}

/**
 * Coefficient de répartition K de Guyon-Massonnet (α = 1, premier harmonique).
 * @param {{b:number, L:number, e:number, y:number, nu?:number}} p
 *   b demi-largeur de la dalle, L portée (équivalente), e excentricité de la charge, y ordonnée
 */
export function coefK({ b, L, e, y, nu = 0, alpha = 1, alphaMode = 'massonnet' }) {
  if (alpha < 1 - 1e-9 && alphaMode === 'massonnet') {
    // interpolation de Massonnet K = K₀ + (K₁ − K₀)√α (pratique SETRA, PONTYPE/PAP : reproduite à 10⁻³ sur le Pont de Noé)
    const k0 = coefK({ b, L, e, y, nu, alpha: 0, alphaMode: 'exact' }), k1 = coefK({ b, L, e, y, nu, alpha: 1 });
    return k0 + (k1 - k0) * Math.sqrt(alpha);
  }
  const h = plateHarmonic({ b, L, n: 1, e, nu, alpha });
  if (nu === 0) return 2 * b * Math.pow(h.k, 4) * h.Y(y);
  return h.Y(y) / meanDeflection(h);
}

/** Fonction K(y) pour une excentricité e donnée (évite de refaire la résolution). */
export function coefKFunction({ b, L, e, nu = 0, alpha = 1, alphaMode = 'massonnet' }) {
  if (alpha < 1 - 1e-9 && alphaMode === 'massonnet') {
    const f0 = coefKFunction({ b, L, e, nu, alpha: 0, alphaMode: 'exact' }), f1 = coefKFunction({ b, L, e, nu, alpha: 1 }), r = Math.sqrt(alpha);
    return y => f0(y) + (f1(y) - f0(y)) * r;
  }
  const h = plateHarmonic({ b, L, n: 1, e, nu, alpha });
  const norm = nu === 0 ? 2 * b * Math.pow(h.k, 4) : 1 / meanDeflection(h);
  return y => norm * h.Y(y);
}

/**
 * K moyen sur une bande de charge e ∈ [e1, e2] (voie chargée uniformément dans le sens transversal).
 */
export function coefKBand({ b, L, e1, e2, y, nu = 0, alpha = 1, nGauss = 5 }) {
  if (Math.abs(e2 - e1) < 1e-9) return coefK({ b, L, e: e1, y, nu, alpha });
  let s = 0;
  const pieces = Math.max(1, Math.ceil(Math.abs(e2 - e1) / 0.5));
  const hh = (e2 - e1) / pieces;
  for (let i = 0; i < pieces; i++) {
    for (const [e, w] of gaussNodes(e1 + i * hh, e1 + (i + 1) * hh, nGauss)) s += w * coefK({ b, L, e, y, nu, alpha });
  }
  return s / (e2 - e1);
}

/**
 * Coefficient μ de Guyon-Massonnet : moment transversal m_y = μ · b · p sous la charge-ligne
 * sinusoïdale p·sin(πx/L) placée en e (premier harmonique).
 */
export function coefMu({ b, L, e, y, nu = 0, alpha = 1, alphaMode = 'massonnet' }) {
  if (alpha < 1 - 1e-9 && alphaMode === 'massonnet') {
    const m0 = coefMu({ b, L, e, y, nu, alpha: 0, alphaMode: 'exact' }), m1 = coefMu({ b, L, e, y, nu, alpha: 1 });
    return m0 + (m1 - m0) * Math.sqrt(alpha);
  }
  const h = plateHarmonic({ b, L, n: 1, e, nu, alpha });
  return -(h.d2(y) - nu * h.k * h.k * h.Y(y)) / b;
}

/** Tableau K[y][e] pour listes d'ordonnées et d'excentricités (contrôle visuel / comparaison aux tables). */
export function tableK({ b, L, es, ys, nu = 0, alpha = 1 }) {
  return es.map(e => { const f = coefKFunction({ b, L, e, nu, alpha }); return ys.map(y => f(y)); });
}

/**
 * Moments transversaux et longitudinaux locaux par mètre, par série de Fourier sur la
 * portée équivalente L, sous des charges rectangulaires (patches) :
 *   patch = { x1, x2, e1, e2, q }  q en kN/m² sur x ∈ [x1,x2] (sens longitudinal, 0 ≤ x ≤ L)
 *                                   et e ∈ [e1,e2] (sens transversal).
 * Amplitude du n-ième harmonique d'une charge uniforme sur [x1,x2] :
 *   p_n = (2q/(nπ)) [cos(nπx1/L) − cos(nπx2/L)]   (charge-ligne par unité de largeur).
 * @returns {{my:number[], mx:number[]}} moments [kN·m/m] aux ordonnées ys, à l'abscisse x
 */
export function transverseMoments({ b, L, patches, x, ys, nHarm = 25, nu = 0, alpha = 1, nGauss = 4, alphaMode = 'massonnet' }) {
  if (alpha < 1 - 1e-9 && alphaMode === 'massonnet') {
    const r0 = transverseMoments({ b, L, patches, x, ys, nHarm, nu, alpha: 0, nGauss, alphaMode: 'exact' });
    const r1 = transverseMoments({ b, L, patches, x, ys, nHarm, nu, alpha: 1, nGauss });
    const r = Math.sqrt(alpha);
    return { my: r0.my.map((v, i) => v + (r1.my[i] - v) * r), mx: r0.mx.map((v, i) => v + (r1.mx[i] - v) * r) };
  }
  const my = ys.map(() => 0), mx = ys.map(() => 0);
  for (let n = 1; n <= nHarm; n++) {
    const sinx = Math.sin(n * Math.PI * x / L);
    if (Math.abs(sinx) < 1e-14) continue;
    const k = n * Math.PI / L;
    for (const { x1, x2, e1, e2, q } of patches) {
      const pn = (2 * q / (n * Math.PI)) * (Math.cos(n * Math.PI * x1 / L) - Math.cos(n * Math.PI * x2 / L));
      if (Math.abs(pn) < 1e-14) continue;
      // intégration sur e : découpage en morceaux ≤ 0.25 m, coupure aux ordonnées y (point anguleux de Y'')
      const cuts = [e1, e2, ...ys.filter(y => y > e1 && y < e2)].sort((u, v) => u - v);
      for (let c = 0; c < cuts.length - 1; c++) {
        const a1 = cuts[c], b1 = cuts[c + 1];
        if (b1 - a1 < 1e-9) continue;
        const pieces = Math.max(1, Math.ceil((b1 - a1) / 0.25));
        const hh = (b1 - a1) / pieces;
        for (let i = 0; i < pieces; i++) {
          for (const [e, w] of gaussNodes(a1 + i * hh, a1 + (i + 1) * hh, nGauss)) {
            const h = plateHarmonic({ b, L, n, e, nu, alpha });
            ys.forEach((y, iy) => {
              const Y = h.Y(y), Y2 = h.d2(y);
              my[iy] += sinx * pn * w * (-(Y2 - nu * k * k * Y));
              mx[iy] += sinx * pn * w * (k * k * Y - nu * Y2);
            });
          }
        }
      }
    }
  }
  return { my, mx };
}
