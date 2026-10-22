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
