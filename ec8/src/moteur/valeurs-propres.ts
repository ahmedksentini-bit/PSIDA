// Problème aux valeurs propres généralisé K φ = ω² M φ (K symétrique, M symétrique définie positive),
// pour les modèles dynamiques de quelques centaines de degrés de liberté au plus.
// Méthode : factorisation de Cholesky M = L Lᵀ, réduction au problème standard A = L⁻¹ K L⁻ᵀ,
// puis méthode de Jacobi cyclique. Les vecteurs propres rendus sont normés par rapport à M (φᵀ M φ = 1).

export type Matrice = number[][];

export const zeros = (n: number, m = n): Matrice => Array.from({ length: n }, () => new Array<number>(m).fill(0));

/** Factorisation de Cholesky : renvoie L triangulaire inférieure telle que A = L Lᵀ. */
export function cholesky(A: Matrice): Matrice {
  const n = A.length;
  const L = zeros(n);
  for (let j = 0; j < n; j++) {
    const Lj = L[j]!;
    let s = A[j]![j]!;
    for (let k = 0; k < j; k++) s -= Lj[k]! * Lj[k]!;
    if (!(s > 0)) throw new Error(`Matrice de masse non définie positive (pivot ${j} : ${s}).`);
    const d = Math.sqrt(s);
    Lj[j] = d;
    for (let i = j + 1; i < n; i++) {
      const Li = L[i]!;
      let t = A[i]![j]!;
      for (let k = 0; k < j; k++) t -= Li[k]! * Lj[k]!;
      Li[j] = t / d;
    }
  }
  return L;
}

/** Valeurs et vecteurs propres d'une matrice symétrique (Jacobi cyclique). Colonnes de V = vecteurs propres. */
export function jacobi(S: Matrice, tolerance = 1e-12, balayagesMax = 100): { valeurs: number[]; V: Matrice } {
  const n = S.length;
  const A = S.map((l) => l.slice());
  const V = zeros(n);
  for (let i = 0; i < n; i++) V[i]![i] = 1;
  const normeHorsDiag = () => {
    let s = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += A[i]![j]! ** 2;
    return Math.sqrt(s);
  };
  let normeDiag = 0;
  for (let i = 0; i < n; i++) normeDiag = Math.max(normeDiag, Math.abs(A[i]![i]!));
  for (let b = 0; b < balayagesMax; b++) {
    if (normeHorsDiag() <= tolerance * Math.max(normeDiag, 1e-300)) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p]![p]!, aqq = A[q]![q]!;
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k]![p]!, akq = A[k]![q]!;
          A[k]![p] = c * akp - s * akq;
          A[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p]![k]!, aqk = A[q]![k]!;
          A[p]![k] = c * apk - s * aqk;
          A[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k]![p]!, vkq = V[k]![q]!;
          V[k]![p] = c * vkp - s * vkq;
          V[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { valeurs: A.map((l, i) => l[i]!), V };
}

export interface Mode {
  /** Pulsation propre ω² (rad²/s²). */
  omega2: number;
  /** Vecteur propre normé par rapport à M. */
  phi: number[];
}

/** Modes propres de K φ = ω² M φ, triés par pulsation croissante (période décroissante). */
export function modesPropres(K: Matrice, M: Matrice): Mode[] {
  const n = K.length;
  if (n === 0) return [];
  const L = cholesky(M);
  // Linv = L⁻¹ par substitution avant.
  const Linv = zeros(n);
  for (let c = 0; c < n; c++) {
    for (let i = 0; i < n; i++) {
      let s = i === c ? 1 : 0;
      for (let k = 0; k < i; k++) s -= L[i]![k]! * Linv[k]![c]!;
      Linv[i]![c] = s / L[i]![i]!;
    }
  }
  // A = Linv K Linvᵀ
  const T = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += Linv[i]![k]! * K[k]![j]!;
    T[i]![j] = s;
  }
  const A = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = 0;
    for (let k = 0; k <= j; k++) s += T[i]![k]! * Linv[j]![k]!;
    A[i]![j] = s;
    A[j]![i] = s;
  }
  const { valeurs, V } = jacobi(A);
  const modes: Mode[] = valeurs.map((w2, c) => {
    // φ = L⁻ᵀ y
    const y = V.map((l) => l[c]!);
    const phi = new Array<number>(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i]!;
      for (let k = i + 1; k < n; k++) s -= L[k]![i]! * phi[k]!;
      phi[i] = s / L[i]![i]!;
    }
    return { omega2: Math.max(w2, 0), phi };
  });
  return modes.sort((a, b) => a.omega2 - b.omega2);
}

export const produit = (A: Matrice, x: number[]): number[] => A.map((l) => l.reduce((s, v, j) => s + v * x[j]!, 0));
export const scalaire = (x: number[], y: number[]): number => x.reduce((s, v, i) => s + v * y[i]!, 0);
