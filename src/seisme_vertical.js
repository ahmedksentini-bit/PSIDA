/**
 * Spectre élastique vertical du site (EN 1998-1 § 3.2.2.3 et annexe nationale, par le moteur de Pont EC8), pour la
 * composante verticale des tabliers précontraints (EN 1998-2 § 4.1.7(2)P) : zone, catégorie d'importance et classe de
 * sol de l'onglet Appuis, amortissement du béton précontraint ξ = 2 % (EN 1998-2 § 4.1.3 (1)).
 * Renvoie null quand le séisme n'est pas activé, en zone 1 ou en catégorie I (arrêté du 26 octobre 2011, art. 3).
 */
import { actionSismique, spectreValeur } from './vendor/pont-ec8.js';

const num = (v, d) => (String(v ?? '').trim() === '' || !Number.isFinite(+v) ? d : +v);

export function spectreVerticalDuFormulaire(d, { xi = 2 } = {}) {
  if (!(String(d.ap_seisme || '') === 'on' || d.ap_seisme === true)) return null;
  const site = { zone: num(d.ap_zone, 3), categorie: d.ap_catEC8 || 'III', classeSol: d.ap_solEC8 || 'B', ST: num(d.ap_ST, 1) };
  if (site.zone <= 1 || site.categorie === 'I') return null;
  const a = actionSismique({ site: { commune: '', trafic: 'cas_general', ...site }, comportement: { qLongitudinal: 1, qTransversal: 1, amortissement: xi, plateauOrigine: true },
    options: { g: 9.81 }, tablier: { travees: [10], largeur: 10, aire: 1, superstructures: 0, debordAbout: 0 }, materiaux: { beton: { masseVolumique: 2.5 } } });
  return { spectreV: T => spectreValeur(a.spectres.elastiqueV, T), site: { ...site, xi, avg: a.spectres.elastiqueV.amplitude, Sve: a.plateaux.Sve } };
}

/**
 * Travée isostatique uniforme (masse m, rigidité EI, portée L) : réponse spectrale verticale par les modes symétriques
 * n = 1, 3, 5 (φ_n = sin nπx/L, masse modale 8 m L/(n²π²), ω_n = (nπ/L)² √(EI/m)), M_n(x) = 4 m S_n L² sin(nπx/L)/(n³π³),
 * combinaison quadratique (modes bien séparés). Unités : t/m, kN·m², m, m/s² → kN·m.
 */
export function momentVerticalIsostatique({ m, EI, L, spectreV, modes = [1, 3, 5] }) {
  const M = modes.map(n => { const w = (n * Math.PI / L) ** 2 * Math.sqrt(EI / m), T = 2 * Math.PI / w, S = spectreV(T); return { n, T, S, Meff: 8 * m * L / (n * n * Math.PI ** 2), amp: 4 * m * S * L * L / (n ** 3 * Math.PI ** 3) }; });
  return { modes: M, M: x => Math.sqrt(M.reduce((a, q) => a + (q.amp * Math.sin(q.n * Math.PI * x / L)) ** 2, 0)) };
}
