/**
 * Cas de charge de la vue 3D des résultats de plaque (web/vue3d.js) : flèches, moments nodaux et réactions des appareils
 * du modèle DKT déjà factorisé (une résolution par cas).
 *   G   : charges permanentes nominales (poids propre et superstructures, comme permanentPlaque) ;
 *   TS  : tandem LM1 de la voie 1 (EN 1991-2 § 4.3.2 : 2 essieux de 300 kN à 1,20 m, roues à 2,00 m, charges ponctuelles),
 *         centré au point (x, y) choisi ;
 *   UDL : charge répartie q [kN/m²] (9 kN/m² par défaut, voie 1 de LM1) sur toute la chaussée ;
 *   P   : précontrainte de la dalle (E.S, valeur moyenne : charges équivalentes du câble, src/plate/precontrainte.js).
 * Grandeurs : w [m, vers le bas], m_x, m_y, m_xy [kN·m/m], Wood-Armer simplifié m_x ± |m_xy| (armatures orthogonales).
 */
import { permanentPlaque } from './deck.js';
import { chargesPrecontrainte } from './precontrainte.js';

export const GRANDEURS_3D = {
  w: { titre: 'Flèche w (vers le bas)', unite: 'mm', echelle: 1000, symetrique: false },
  mx: { titre: 'Moment m_x', unite: 'kN·m/m', echelle: 1, symetrique: true },
  my: { titre: 'Moment m_y', unite: 'kN·m/m', echelle: 1, symetrique: true },
  mxy: { titre: 'Moment de torsion m_xy', unite: 'kN·m/m', echelle: 1, symetrique: true },
  waInf: { titre: 'Wood-Armer m_x + |m_xy| (nappe inférieure)', unite: 'kN·m/m', echelle: 1, symetrique: true },
  waSup: { titre: 'Wood-Armer m_x − |m_xy| (nappe supérieure)', unite: 'kN·m/m', echelle: 1, symetrique: true },
};

/** Roues du tandem TS centré en (x, y) : 4 roues de Q/2. */
export function rouesTandem(x, y, Q = 300) { return [[-0.6, -1], [-0.6, 1], [0.6, -1], [0.6, 1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy, P: Q / 2 })); }

/**
 * @param {object} M modèle de plaque (plaqueTablier) ; o { cas, x, y, q, psidp }
 * @returns { w, champ: { w, mx, my, mxy, waInf, waSup }, reactions, total, roues }
 */
export function cas3D(M, { cas = 'G', x = null, y = 0, q = 9, psidp = null, Q = 300 } = {}) {
  const P = M.P, deck = M.deck;
  let w = null, roues = null, total = 0;
  if (cas === 'G') {
    const r = permanentPlaque(M);
    w = new Float64Array(P.n); for (const f of r.fichiers) { for (let p = 0; p < P.n; p++) w[p] += f.w[p]; total += f.total; }
    // u complet (rotations) : somme des vecteurs complets pour les moments
    const u = new Float64Array(P.ndof); for (const f of r.fichiers) { const fu = f.w.u; if (fu) for (let k = 0; k < P.ndof; k++) u[k] += fu[k]; }
    w.u = u;
  } else {
    const F = P.vecteur();
    if (cas === 'TS') { const xc = x ?? (deck.beam.x0[0] + deck.beam.x0[1]) / 2; roues = rouesTandem(xc, y, Q); for (const r of roues) P.chargePonctuelle(F, r); }
    else if (cas === 'UDL') { const { y1, y2 } = deck.g.roadway; P.chargeRectangle(F, { x1: M.xs[0], x2: M.xs[M.xs.length - 1], y1, y2, q }); }
    else if (cas === 'P') {
      if (!psidp || !psidp.r || M.geo) throw new Error('précontrainte : dalle précontrainte droite ou biaise calculée en plaque seulement');
      const e = psidp.r.ES && psidp.r.ES.moy; if (!e) throw new Error('précontrainte : état E.S non disponible');
      const Fp = chargesPrecontrainte(M, psidp.r, { b: deck.b }, e.F); for (let p = 0; p < P.n; p++) F[p] = Fp[p];
    } else throw new Error(`cas inconnu : ${cas}`);
    total = F.reduce((s, v) => s + v, 0);
    w = P.resoudre(F);
  }
  const m = P.moments(w), n = P.n, waInf = new Float64Array(n), waSup = new Float64Array(n);
  for (let p = 0; p < n; p++) { waInf[p] = m.mx[p] + Math.abs(m.mxy[p]); waSup[p] = m.mx[p] - Math.abs(m.mxy[p]); }
  return { w, champ: { w, mx: m.mx, my: m.my, mxy: m.mxy, waInf, waSup }, reactions: P.reactions(w), total, roues };
}
