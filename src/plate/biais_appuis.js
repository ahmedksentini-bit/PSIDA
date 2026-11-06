/**
 * Ouvrage biais calculé par Guyon-Massonnet : répartition des réactions entre les appareils d'une ligne d'appui.
 *
 * Les coefficients d'inégalité de PSI-DA 68 (§ 2.4.2) sont établis pour un ouvrage droit ; dans une dalle biaise, la
 * réaction se concentre à l'angle obtus et l'angle aigu se décharge (SETRA, « Tabliers-dalles biais ou courbes —
 * programme MRB-EL », 1995 : répartition des efforts dans les angles obtus différente de celle de Guyon-Massonnet-Barres,
 * domaine de PSIDA/PSIDP limité à un biais mécanique de 70 gr environ). PSIDA résout la plaque (éléments finis DKT, maille
 * 0,50 m, appareils ponctuels rigides) sous les charges permanentes, pour l'ouvrage biais et pour l'ouvrage droit de mêmes
 * portées, et en tire par ligne d'appui :
 *   κ_max = (n R_max / ΣR)_biais / (n R_max / ΣR)_droit  — majoration de l'appareil le plus chargé ;
 *   κ_min = (n R_min / ΣR)_biais / (n R_min / ΣR)_droit  — minoration de l'appareil le moins chargé.
 * Hypothèse PSIDA : κ_max multiplie les coefficients PSI-DA 68 du permanent et du trafic (le trafic placé dans l'angle
 * obtus concentre au moins autant la réaction), κ_min la réaction minimale par appareil. Coût : deux résolutions de plaque.
 */
import { plaqueTablier, permanentPlaque } from './deck.js';

export function coefficientsBiais(deck, { psi = 100, nb = 4, h = 0.5, E = 34000 } = {}) {
  const ratios = M => permanentPlaque(M).Rapp.map(r => { const S = r.reduce((s, v) => s + v, 0), n = r.length; return { max: n * Math.max(...r) / S, min: n * Math.min(...r) / S, R: r }; });
  const B = ratios(plaqueTablier(deck, { h, nb, psi, E })), D = deck.g.trace ? null : ratios(plaqueTablier(deck, { h, nb, psi: 100, E }));
  return B.map((b, i) => {
    const d = D ? D[i] : { max: 1, min: 1 };
    return { kMax: Math.max(1, b.max / d.max), kMin: Math.min(1, d.min > 0 ? b.min / d.min : 1), biais: b, droit: D ? D[i] : null };
  });
}
