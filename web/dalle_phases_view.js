/**
 * Pont-dalle coulé par phases successives : carte de l'onglet Précontrainte (résultats du module
 * src/phasage/dalle_phases.js sous forme de blocs de note).
 */
import { courbesSVG } from './phasage_view.js';

const F = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-0(,0+)?$/, '0$1') : '—');

export function dallePhasesBlocks(R) {
  const B = [], p = R.p, RR = R.reperes, pre = !!p.cable;
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  h2(`Pont-dalle coulé par phases successives (${p.spans.length} phases)`);
  table(['Phase', 'Tronçon [m]', 'Décintrement' + (pre ? ' et mise en tension' : '') + ' [j]'], RR.bornes.slice(0, -1).map((x0, k) => [`${k + 1}`, `${F(x0, 2)} – ${F(RR.bornes[k + 1], 2)}`, F(R.modele.phases[k].t, 0)]));
  para(`Reprises à ${F(RR.alpha * 100, 0)} % de la travée suivante au-delà de chaque pile, au voisinage du point de moment nul des charges permanentes ; un tronçon tous les ${F(p.dt ?? 14, 0)} jours, ${p.decintrement === 'final' && !pre ? 'décintrement unique après la dernière phase' : `décintré à ${F(p.td ?? 7, 0)} jours d'âge`}${pre ? ` ; famille de ${p.cable.n} unités par phase, tendue à l'extrémité libre du tronçon et couplée à la précédente (la première tendue des deux côtés), σ₀ = ${F(p.cable.sigma0, 0)} MPa, tracé du calcul PSI-DP` : ''} ; superstructures (${F(p.gSup, 1)} kN/m) à ${F(RR.tSup, 0)} jours. Référence : ouvrage coulé d'une traite${pre ? ', câbles filants tendus aux deux extrémités' : ''}, mêmes bétons et mêmes lois de fluage (EN 1992-1-1 annexe B).`);
  const sR = R.sections;
  table(['Section', 'x [m]', 'M fin des travaux [kN·m]', 'M long terme, phasé', 'M long terme, d\'une traite', 'Écart', 'σ sup. / inf. (G + P, t∞) [MPa]', ...(pre ? ['σ max sous caractéristique [MPa]'] : [])],
    sR.map(s => [s.nom, F(s.x, 2), F(s.MfinTravaux, 0), F(s.M, 0), F(s.Mmono, 0), F(s.dM, 0), `${F(s.sig.sup, 2)} / ${F(s.sig.inf, 2)}`, ...(pre ? [F(s.carMax, 2)] : [])]));
  B.push({ t: 'svg', svg: courbesSVG([
    { nom: 'phasé, long terme', pts: R.diag.map(d => [d[0], d[1]]) },
    { nom: 'coulé d\'une traite, long terme', pts: R.diag.map(d => [d[0], d[2]]), tirets: true },
    { nom: 'phasé, fin des travaux', pts: R.diag.map(d => [d[0], d[3]]), coul: '#c8552b' },
  ], { titre: `Moment du béton sous G${pre ? ' + P' : ''} [kN·m] (dalle entière, positif : fibre inférieure tendue)`, xlab: 'abscisse [m]', ylab: 'kN·m', h: 280, marques: RR.joints.map(x => ({ x, nom: 'reprise' })) }), caption: 'Le fluage fait migrer les efforts du schéma de construction vers celui de l\'ouvrage coulé d\'une traite, sans l\'atteindre : fraction ≈ φ/(1 + χφ) de l\'écart initial (méthode du module effectif ajusté, Trost et Bažant).' });
  h2('Vérifications des reprises');
  table(['Vérification', 'Valeur', 'Limite', 'x [m]', 'Résultat', 'Référence'], R.verifs.map(v => [v.nom, F(v.val, 2), v.lim == null ? '—' : F(v.lim, 2), F(v.x, 2), v.ok ? 'OK' : 'NON', v.ref]));
  para(pre ? `Coupleurs : toutes les unités sont couplées à chaque reprise (plus de 50 %) ; l'EN 1992-2 § 8.10.4 (105) demande alors une compression résiduelle d'au moins 3 MPa sous la combinaison caractéristique, ou le ferraillage minimal continu de l'expression (7.1) de l'EN 1992-1-1 (§ 7.3.2) : A_s,min = k_c k f_ct,eff A_ct / f_yk ≈ ${F(R.AsMin * 1e4, 0)} cm² pour la dalle (k_c = 0,4, A_ct ≈ A/2), à répartir en deux nappes de part et d'autre de la reprise. Les reprises doivent être décalées des appuis, et les coupleurs protégés contre la corrosion et la fatigue (EN 1992-1-1 § 8.10.4). Trafic : moments des combinaisons rare et fréquente du calcul PSI-DP (dalle entière).`
    : 'Béton armé : le ferraillage du calcul (onglets Calcul et Ferraillage) suppose l\'ouvrage coulé d\'une traite ; l\'écart de moment ci-dessus dit s\'il faut le reprendre localement. Aux reprises, armatures de couture de section au moins égale aux armatures longitudinales courantes, sans recouvrement dans le plan de la reprise.');
  return B;
}
