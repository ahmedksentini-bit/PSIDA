/**
 * Procédés de précontrainte par post-tension (torons T15 / 0,6") : données des agréments (évaluations techniques
 * européennes ETA) utiles au calcul PSI-DP — section d'acier, gaine, plaque d'ancrage, entraxe et distance au bord
 * minimaux (béton à la mise en tension f_cm,0 indiqué), rentrée de clavettes, frottement. Chaque valeur provient du
 * document cité (page entre crochets dans `ref`) ; null = non trouvé, la valeur générique est alors utilisée.
 * Frottement : BPEL 3.3,11 σ(x) = σ_p0 e^(−fα − φx) ; ETA / EN 1992 : P(x) = P0 e^(−μ(θ + kx)) ⇒ f = μ, φ = μ k.
 * Générique : BPEL 91 révisé 99, annexe 3 (torons en conduits acier, cas I : f = 0,18 (R ≥ 6 m), φ = 0,002 m⁻¹ ;
 * cas II, nombreux joints ou reprises : f = 0,20, φ = 0,003 m⁻¹), recul d'ancrage 6 mm, plaques forfaitaires.
 */
export const AGREMENTS = {
  generique: {
    label: 'Générique (BPEL annexe 3, plaques forfaitaires)', document: 'BPEL 91 révisé 99, annexe 3', url: null,
    rentree_mm: 6, f: 0.18, phi: 0.002,
    unites: {
      '7': { nom: '7 T 15 S', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 65, gaine_int_mm: 60, plaque_mm: [200, 200], entraxe_min_mm: null, bord_min_mm: null, Rmin_m: 4.5 },
      '12': { nom: '12 T 15 S', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 80, gaine_int_mm: 75, plaque_mm: [250, 250], entraxe_min_mm: null, bord_min_mm: null, Rmin_m: 6 },
      '19': { nom: '19 T 15 S', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 95, gaine_int_mm: 90, plaque_mm: [300, 300], entraxe_min_mm: null, bord_min_mm: null, Rmin_m: 7 },
      '12T13': { nom: '12 T 13 (PSIDP-EL 84)', torons: 12, Ap_mm2: 1116, gaine_ext_mm: 70, gaine_int_mm: 65, plaque_mm: [220, 220], entraxe_min_mm: null, bord_min_mm: null, Rmin_m: 6 },
    },
  },
};

/** Liste pour l'interface : [{ id, label, unites: [{ id, nom }] }]. */
export const agrementList = () => Object.entries(AGREMENTS).map(([id, a]) => ({ id, label: a.label, unites: Object.entries(a.unites).map(([uid, u]) => ({ id: uid, nom: u.nom })) }));

/**
 * Unité de calcul à partir d'un procédé et d'une unité ; frottement et recul : agrément, sinon BPEL annexe 3.
 * @returns {{Ap, phiG, Rmin, plate, plateB, spacingMin, edgeMin, label, f, phi, g, source}}
 */
export function unitOf(agrId = 'generique', unitId = '12', { cas = 'I' } = {}) {
  const A = AGREMENTS[agrId] || AGREMENTS.generique, G = AGREMENTS.generique;
  const u = A.unites[unitId] || A.unites[Object.keys(A.unites)[0]];
  const gu = G.unites[String(u.torons)] || G.unites['12'];
  const pick = (v, d) => (v === null || v === undefined ? d : v);
  const fB = cas === 'II' ? 0.20 : 0.18, phiB = cas === 'II' ? 0.003 : 0.002;
  const f = A.mu ?? A.f ?? fB, phi = A.mu != null && A.k_rad_m != null ? A.mu * A.k_rad_m : (A.phi ?? phiB);
  return {
    label: `${u.nom}${agrId !== 'generique' ? ` (${A.label})` : ''}`, Ap: u.Ap_mm2 * 1e-6,
    phiG: pick(u.gaine_ext_mm, gu.gaine_ext_mm) / 1000, Rmin: pick(u.Rmin_m, gu.Rmin_m),
    plate: pick(u.plaque_mm && u.plaque_mm[0], gu.plaque_mm[0]) / 1000, plateB: pick(u.plaque_mm && (u.plaque_mm[1] ?? u.plaque_mm[0]), gu.plaque_mm[1]) / 1000,
    spacingMin: u.entraxe_min_mm ? u.entraxe_min_mm / 1000 : null, edgeMin: u.bord_min_mm ? u.bord_min_mm / 1000 : null, fcm0: u.fcm0_MPa ?? null,
    f, phi, g: pick(A.rentree_mm, 6) / 1000, source: A.document, url: A.url, agrement: agrId, unite: unitId,
  };
}
