/**
 * Véhicules généralisés : engins de chantier (profil provisoire) et convois exceptionnels LM3 (EN 1991-2 § 4.3.4,
 * annexe A ; annexe nationale française), circulant seuls sur une chaussée, glissés transversalement par pas.
 *
 * Un véhicule : { label, width, axles:[{x, P}] (x depuis l'avant [m], P [kN]), wheels (par essieu, 2 par défaut),
 * wheelSpacing [m] (entraxe des roues), contact:{a, b} [m], dyn (coefficient dynamique), unc (coefficient
 * d'incertitude) }. L'effet longitudinal est celui du convoi (poutre), la répartition transversale celle des files
 * de roues (K̄ de Guyon), comme pour TS / Bc.
 *
 * Pratique CHAMOA (guide technique § 6.1) : engin de chantier → dyn = 1,5 ; convoi LM3 → poids × 1,1 (incertitude)
 * et, s'il circule à vitesse normale, dyn = 1 + 0,7/(1 + 0,2 L) avec L la travée la plus courte (annexe nationale).
 */

/** Véhicule spécial de l'exemple CHAMOA : 2 essieux de 100 kN à 8 m, 3 m de large, roues à 2 m, impacts 0,20 × 0,20, dyn 1,5. */
export const VEHICULE_SPECIAL_CHAMOA = { label: 'Véhicule spécial (CHAMOA 100)', width: 3.0, axles: [{ x: 1, P: 100 }, { x: 9, P: 100 }], wheels: 2, wheelSpacing: 2.0, contact: { a: 0.2, b: 0.2 }, dyn: 1.5, unc: 1 };

/**
 * Véhicules spéciaux de l'EN 1991-2 annexe A (tableau A.1) : lignes d'essieux de 150, 200 ou 240 kN espacées de 1,50 m ;
 * largeur 3,00 m (150 et 200 kN) ou 4,50 m (240 kN). TODO_VERIF : composition des lignes d'essieux (nombre et entraxe des
 * roues, figure A.1) à relire dans la norme ; ici roues réparties uniformément sur la largeur.
 */
export function vehicleAnnexA(total, axleLoad) {
  const n = Math.round(total / axleLoad);
  const width = axleLoad >= 240 ? 4.5 : 3.0, wheels = axleLoad >= 240 ? 3 : 2;
  return { label: `VS ${total}/${axleLoad} (EN 1991-2 annexe A)`, width, axles: Array.from({ length: n }, (_, i) => ({ x: i * 1.5, P: axleLoad })), wheels, wheelSpacing: wheels === 2 ? 2.0 : 1.5, contact: { a: 0.15, b: 0.15 }, dyn: 1, unc: 1.1 };
}
export const ANNEX_A_VEHICLES = [[600, 150], [900, 150], [1200, 150], [1500, 150], [1800, 150], [1200, 200], [1500, 200], [1800, 200], [2400, 200], [3000, 200], [3600, 200], [2400, 240], [3000, 240], [3600, 240]].map(([t, a]) => vehicleAnnexA(t, a));

/** Coefficient dynamique des convois exceptionnels à vitesse normale (annexe nationale, pratique CHAMOA). */
export function dynLM3(Lmin) { return 1 + 0.7 / (1 + 0.2 * Lmin); }

/**
 * Lecture d'un texte « P @ x ; P @ x … » (kN, m) en liste d'essieux.
 */
export function parseAxles(text) {
  return String(text || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const [P, x] = t.split('@').map(Number); return { x, P }; }).filter(a => Number.isFinite(a.x) && Number.isFinite(a.P));
}

/**
 * Enveloppes d'un véhicule circulant seul sur la chaussée [y1, y2] (bandes neutralisées déduites), glissé par pas.
 * @param {import('./analysis.js').SlabDeck} deck
 * @param {object} v véhicule ; @param {{y1:number,y2:number,neutral?:number,step?:number,factor?:number}} opt
 */
export function vehicleEnvelope(deck, v, { y1, y2, neutral = 0, step = null, factor = 1 } = {}) {
  const f = (v.dyn || 1) * (v.unc || 1) * factor;
  const axles = v.axles.map(a => ({ d: a.x - v.axles[0].x, P: a.P * f }));
  // les roues extrêmes restent dans la largeur chargeable (pratique CHAMOA : 435 contre 451 kN·m à P1 sur l'exemple,
  // écart cohérent avec le calage des K) ; l'encombrement du véhicule n'est pas la contrainte
  const nw0 = v.wheels || 2, w = Math.min(v.width, (v.wheelSpacing || 2.0) * (nw0 - 1)), lo = y1 + neutral, hi = y2 - neutral;
  const free = hi - lo - w;
  const st = step || deck.laneStep;
  const positions = free <= 1e-9 ? [lo + w / 2] : Array.from({ length: Math.ceil(free / st) + 1 }, (_, i) => lo + w / 2 + free * i / Math.ceil(free / st));
  const nw = v.wheels || 2, sp = v.wheelSpacing || 2.0;
  const offsets = Array.from({ length: nw }, (_, i) => -sp * (nw - 1) / 2 + i * sp);
  const arrangements = positions.map(e => [{ label: v.label, kind: 'axles', axles, tracks: offsets.map(o => ({ e1: e + o, e2: e + o, share: 1 / nw })) }]);
  const res = deck.evaluateArrangements(arrangements);
  return { ...res, label: v.label, factor: f, positions };
}

/**
 * Profil provisoire (phase de chantier) : charges permanentes provisoires (remblai, enrobé) et engins circulant
 * seuls (dyn 1,5). Les abouts et superstructures définitives ne sont pas en place.
 * @param {import('./analysis.js').SlabDeck} deck
 * @param {{roadway:{y1,y2}, neutral?:number, remblai?:{h:number, gamma?:number, y1:number, y2:number}, enrobe?:{t:number, gamma?:number, y1:number, y2:number}, vehicles:object[]}} p
 */
export function provisionalProfile(deck, p) {
  const files = [];
  files.push({ label: 'Poids propre dalle', q: deck.gammaC * deck.area, e1: -deck.b, e2: deck.b, unitK: true, kmin: 1, kmax: 1 });
  if (p.remblai && p.remblai.h > 0) files.push({ label: 'Remblai provisoire', q: (p.remblai.gamma || 20) * p.remblai.h * (p.remblai.y2 - p.remblai.y1), e1: p.remblai.y1, e2: p.remblai.y2, unitK: false, kmin: p.remblai.kmin ?? 1, kmax: p.remblai.kmax ?? 1 });
  if (p.enrobe && p.enrobe.t > 0) files.push({ label: 'Enrobé provisoire', q: (p.enrobe.gamma || 24) * p.enrobe.t * (p.enrobe.y2 - p.enrobe.y1), e1: p.enrobe.y1, e2: p.enrobe.y2, unitK: false, kmin: p.enrobe.kmin ?? 0.8, kmax: p.enrobe.kmax ?? 1.4 });
  const perm = deck.permanentFromFiles(files);
  const vehicles = (p.vehicles || []).map(v => vehicleEnvelope(deck, v, { y1: p.roadway.y1, y2: p.roadway.y2, neutral: p.neutral || 0 }));
  const Q = vehicles.length ? vehicles.reduce((acc, r) => (acc ? SlabDeckEnvelope(acc, r) : r), null) : null;
  return { perm, vehicles, Q };
}

function SlabDeckEnvelope(a, b) {
  const out = JSON.parse(JSON.stringify(a));
  for (const k of ['Mmax', 'Vmax', 'Rmax']) out[k] = out[k].map((v, i) => Math.max(v, b[k][i]));
  for (const k of ['Mmin', 'Vmin', 'Rmin']) out[k] = out[k].map((v, i) => Math.min(v, b[k][i]));
  out.mxMax = out.mxMax.map((row, s) => row.map((v, i) => Math.max(v, b.mxMax[s][i])));
  out.mxMin = out.mxMin.map((row, s) => row.map((v, i) => Math.min(v, b.mxMin[s][i])));
  return out;
}
