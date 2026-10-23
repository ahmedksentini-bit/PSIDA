/**
 * Charges routières du Fascicule 61 titre II appliquées à un cadre sous remblai (portage de BVTrace Fascicule61Loads.cs) :
 * coefficient de majoration dynamique (avec le terme en G/S), charge A(l), diffusion des systèmes B et Mc120 à travers
 * le remblai et la traverse (BAEL 91 A.3.2,5 tel que l'applique le programme SETRA PICF-EL : élargissement de 3/4 H de
 * chaque côté, soit 1,5 H + e), fusion des empreintes voisines. Unités : m, t, t/m².
 */
export const CLASSE = { premiere: 1, deuxieme: 2, troisieme: 3 };
export const PLAFOND_DYN_CLASSE3 = 1.4;
export const PENTE_DIFFUSION = 1.5;
export const PENTE_DIFFUSION_CLASSEURS = 1.15;

/** δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4 G/S) ; plafond 1,4 en 3ᵉ classe seulement. */
export function coefDynamique(L, G, S, classe = 1) {
  if (!(L > 0)) throw new RangeError('portée nulle');
  if (!(S > 0)) throw new RangeError('charge du système nulle');
  if (G < 0) throw new RangeError('poids négatif');
  const d = 1 + 0.4 / (1 + 0.2 * L) + 0.6 / (1 + 4 * G / S);
  return classe === 3 ? Math.min(PLAFOND_DYN_CLASSE3, d) : d;
}

/** Coefficients b_c (par nombre de files de camions) et b_t, Fascicule 61 titre II, art. 5.2.2 et 5.4.2. */
export const BC_TABLE = { 1: [1.20, 1.10, 0.95, 0.80, 0.70], 2: [1.00, 1.00], 3: [1.00, 0.80] };
export const BT_TABLE = { 1: 1.00, 2: 0.90 };
/** Nombre de voies de circulation (art. 2.2) : E(L_c/3), deux voies pour 5 m ≤ L_c < 6 m. */
export const nombreVoies = Lc => (Lc >= 5 && Lc < 6) ? 2 : Math.max(1, Math.floor(Lc / 3 + 1e-9));
/** Essieux d'une file de deux camions Bc (même sens, distance minimale de 4,5 m entre camions) : positions (m), charges (t). */
const FILE_BC = [[0, 6], [4.5, 12], [6.0, 12], [10.5, 6], [15.0, 12], [16.5, 12]];
/** Plus forte charge d'essieux d'une file Bc tenant sur une longueur D (m) mesurée dans le sens de circulation. */
export function chargeFileBc(D) {
  let m = 0;
  for (const [x0] of FILE_BC) { let s = 0; for (const [x, P] of FILE_BC) if (x >= x0 - 1e-9 && x <= x0 + D + 1e-9) s += P; m = Math.max(m, s); }
  return m;
}
/**
 * S du coefficient de majoration dynamique des systèmes B (art. 5.5) : « poids total le plus élevé des essieux du système B
 * qu'il est possible de placer sur le tablier de l'élément, compte tenu des coefficients b_c ou b_t ». L'élément est la
 * couverture de l'ouvrage : D (m) dans le sens de circulation de la voie portée (largeur extérieure du cadre), n voies.
 * Bc : n_f ≤ n files de deux camions au plus, b_c selon n_f (classe du pont) ; Bt : un tandem par voie, deux voies au plus.
 */
export function poidsSystemeB(D, nVoies, classe = 1) {
  const bcT = BC_TABLE[classe] || BC_TABLE[1], fil = chargeFileBc(D);
  let sBc = 0, nfBc = 1;
  for (let nf = 1; nf <= nVoies; nf++) { const v = nf * fil * bcT[Math.min(nf, bcT.length) - 1]; if (v > sBc) { sBc = v; nfBc = nf; } }
  const bt = BT_TABLE[classe], nT = Math.min(nVoies, 2), sBt = bt ? bt * nT * (D >= 1.35 ? 32 : 16) : 0;
  return sBc >= sBt ? { S: sBc, systeme: 'Bc', files: nfBc, sBc, sBt } : { S: sBt, systeme: 'Bt', files: nT, sBc, sBt };
}

/** A(l) de base (t/m²) : 0,23 + 36/(L + 12). */
export function alBase(L) { if (!(L > 0)) throw new RangeError('longueur chargée nulle'); return 0.23 + 36 / (L + 12); }
export const al = (L, a1, a2) => alBase(L) * a1 * a2;

/** Empreintes avant diffusion : u (travers), v (long), charge d'une empreinte (t), entraxes Et et El (0 = unique en long). */
export const EMPREINTES = {
  Bc: { u: 0.25, v: 0.25, P: 6.0, Et: 2.0, El: 1.5 },
  Bt: { u: 0.60, v: 0.25, P: 8.0, Et: 2.0, El: 1.35 },
  Mc120: { u: 1.00, v: 6.10, P: 55.0, Et: 3.30, El: 0 },
};

/** Diffusion d'une empreinte de roue (Bc, Bt) : emprise U × V et densité Q, empreintes voisines fusionnées. */
export function diffuser(p, H, e, pente = PENTE_DIFFUSION) {
  const s = pente * Math.max(0, H) + Math.max(0, e);
  const mT = p.Et > 0 && s >= p.Et - p.u, U = mT ? p.Et + p.u + s : p.u + s, fT = (mT ? 2 : 1) / U;
  const mL = p.El > 0 && s >= p.El - p.v, V = mL ? p.El + p.v + s : p.v + s, fL = (mL ? 2 : 1) / V;
  return { s, U, V, q: p.P * fT * fL };
}

/** Diffusion d'une chenille (Mc120) : empreinte unique en long, deux chenilles comptées dès qu'elles se recouvrent. */
export function diffuserChenille(p, H, e, pente = PENTE_DIFFUSION) {
  const s = pente * Math.max(0, H) + Math.max(0, e);
  const mT = p.Et > 0 && s >= p.Et - p.u, U = mT ? p.Et + p.u + s : p.u + s, V = p.v + s;
  const q = U < p.Et ? p.P / V / U : 2 * p.P / V / U;
  return { s, U, V, q };
}
