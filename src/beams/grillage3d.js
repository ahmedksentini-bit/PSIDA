/**
 * Vue 3D du grillage d'un tablier à poutres (web/vue3d_poutres.js) : construction du grillage d'une travée indépendante
 * en grandeurs physiques (E_cm du béton des poutres) et cas de charge.
 *   G   : charges permanentes nominales du tablier (poids propre réparti également entre les poutres, charges linéiques
 *         et surfaciques des superstructures à leur position) ;
 *   TS  : tandem LM1 de la voie 1 (2 essieux de 300 kN à 1,20 m, roues à 2,00 m), centré en (x, y) ;
 *   UDL : q [kN/m²] (9 par défaut) sur toute la chaussée.
 * Grandeurs : w [m, vers le bas], M des poutres [kN·m], m_y du hourdis [kN·m/m], torsion des poutres T [kN·m].
 */
import { grillagePoutres } from './grillage.js';
import { entretoisesGrillage } from './index.js';
import { rouesTandem } from '../plate/cas3d.js';

export const GRANDEURS_GRILLAGE = {
  w: { titre: 'Flèche w (vers le bas)', unite: 'mm', echelle: 1000, symetrique: false, sur: 'tout' },
  M: { titre: 'Moment fléchissant des poutres M', unite: 'kN·m', echelle: 1, symetrique: true, sur: 'poutres' },
  my: { titre: 'Moment transversal du hourdis m_y', unite: 'kN·m/m', echelle: 1, symetrique: true, sur: 'hourdis' },
  T: { titre: 'Moment de torsion des poutres T', unite: 'kN·m', echelle: 1, symetrique: true, sur: 'poutres' },
};

const Ecm = fck => 22000 * ((fck + 8) / 10) ** 0.3 * 1000;   // kN/m² (EN 1992-1-1 tableau 3.1)

/** Grillage physique de la travée de portée L du résultat r de computePoutres (travées indépendantes). */
export function grillageTravee(r, L) {
  if (r.continu) throw new Error('grillage : travées indépendantes seulement');
  const inp = r.inp, S = r.bd.bySpan.get(L);
  if (!S) throw new Error(`grillage : pas de travée de ${L} m`);
  const n = inp.n, b1 = inp.b1, sec = r.sec, fck = inp.geo === 'dims' && inp.vipp ? inp.vipp.beton.fckP : inp.fck || 35;
  const nE = Math.max(0, ...inp.spans.map((Lj, j) => (Math.abs(Lj - L) < 1e-3 ? (inp.nEntInt || [])[j] || 0 : 0)));
  const ents = entretoisesGrillage({ L, nE, b0: inp.beInt ?? 0.25, he: Math.max((sec.H || 0) - inp.hd, 0), hd: inp.hd, n, b1 });
  const g = grillagePoutres({ n, b1, L, Ip: sec.I, Kp: sec.K, hd: inp.hd, m: Math.max(20, 2 * Math.round(L / 1.5 / 2)), entretoises: ents, E: Ecm(fck) });
  return { g, deck: S.deck, inp, H: sec.H || inp.beam?.H || 1.5, ents, fck, L };
}

export function casGrillage(T, { cas = 'G', x = null, y = 0, q = 9, Q = 300 } = {}) {
  const { g, deck, inp } = T, F = g.vecteur(), dx = g.dx, b = g.n * g.b1 / 2;
  let roues = null;
  const ligneX = (e, qx) => { for (let i = 1; i < g.m; i++) g.chargePoint(F, g.xs[i], e, qx * dx); };
  const bande = (y1, y2, qs) => { const nY = Math.max(2, Math.ceil((y2 - y1) / 0.25)), dy = (y2 - y1) / nY; for (let j = 0; j < nY; j++) ligneX(y1 + (j + 0.5) * dy, qs * dy); };
  if (cas === 'G') {
    for (const f of deck.permanentFiles()) {
      if (f.unitK) for (let k = 0; k < g.n; k++) ligneX(g.ys[k], f.q / g.n);
      else if (Math.abs(f.e2 - f.e1) < 1e-9) ligneX(Math.min(b, Math.max(-b, f.e1)), f.q);
      else bande(f.e1, f.e2, f.q / (f.e2 - f.e1));
    }
  } else if (cas === 'TS') { roues = rouesTandem(x ?? T.L / 2, y, Q); for (const r of roues) g.chargePoint(F, r.x, r.y, r.P); }
  else if (cas === 'UDL') bande(inp.roadway.y1, inp.roadway.y2, q);
  else throw new Error(`cas inconnu : ${cas}`);
  return { ...g.resultats(F), roues };
}
