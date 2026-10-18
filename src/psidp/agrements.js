/**
 * Procédés de précontrainte par post-tension (torons T15 / 0,6") : données des agréments (évaluations techniques
 * européennes ETA) et des documentations des fabricants utiles au calcul PSI-DP — section d'acier, gaine, plaque
 * d'ancrage, entraxe et distance au bord minimaux (fonction de la résistance du béton à la mise en tension f_cm,0),
 * rentrée de clavettes, frottement. Chaque valeur provient du document cité (page dans `ref`) ; null = non trouvé, la
 * valeur générique est alors utilisée et signalée.
 * Frottement : BPEL 3.3,11 σ(x) = σ_p0 e^(−fα − φx) ; ETA / EN 1992 : P(x) = P0 e^(−μ(θ + kx)) ⇒ f = μ, φ = μ k.
 * Générique : BPEL 91 révisé 99, annexe 3 (torons en conduits acier, cas I : f = 0,18 (R ≥ 6 m), φ = 0,002 m⁻¹ ;
 * cas II, nombreux joints ou reprises : f = 0,20, φ = 0,003 m⁻¹), recul d'ancrage 6 mm, plaques forfaitaires.
 * Distance au bord, règle commune Freyssinet (brochure V14 p. 11) et VSL (ETA 06/0006 § 3.5.2) :
 * e ≥ x/2 + c − 10 mm (x : entraxe minimal, c : enrobage sur l'ouvrage).
 */
export const AGREMENTS = {
  generique: {
    label: 'Générique (BPEL annexe 3, plaques forfaitaires)', document: 'BPEL 91 révisé 99, annexe 3', url: null,
    rentree_mm: 6, // frottement : cas I ou II de l'annexe 3 selon l'option bp_cas
    unites: {
      '7': { nom: '7 T 15 S', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 65, gaine_int_mm: 60, plaque_mm: [200, 200], entraxe_par_fcm0_mm: null, Rmin_m: 4.5 },
      '12': { nom: '12 T 15 S', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 80, gaine_int_mm: 75, plaque_mm: [250, 250], entraxe_par_fcm0_mm: null, Rmin_m: 6 },
      '19': { nom: '19 T 15 S', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 95, gaine_int_mm: 90, plaque_mm: [300, 300], entraxe_par_fcm0_mm: null, Rmin_m: 7 },
      '12T13': { nom: '12 T 13 (PSIDP-EL 84)', torons: 12, Ap_mm2: 1116, gaine_ext_mm: 70, gaine_int_mm: 65, plaque_mm: [220, 220], entraxe_par_fcm0_mm: null, Rmin_m: 6 },
    },
  },
  freyssinet: {
    label: 'Freyssinet C (ETA 06/0226)',
    document: 'Brochure Freyssinet « La précontrainte Freyssinet » V14 (09/2014), conforme à l\'ETA 06/0226 (texte de l\'ETA non lu)',
    url: 'https://www.freysas.com.tr/wp-content/uploads/sites/45/2021/12/C-III-1_FREYSSINET-PRESTRESSING_EN_V14.pdf',
    rentree_mm: null, mu: 0.19, k_rad_m: 0.007, bordRegle: true,
    note: 'μ = 0,19 : torons non lubrifiés en gaine feuillard (0,17 si lubrifiés), k = 0,007 rad/m (p. 29) ; recul d\'ancrage non donné par la brochure : 6 mm par défaut ; entraxe a pour f_cm,0 = 24, 44 ou 60 MPa (cylindre, à la mise en tension, p. 11).',
    unites: {
      '4C15': { nom: '4C15 (Freyssinet)', torons: 4, Ap_mm2: 600, gaine_ext_mm: 50, gaine_int_mm: 45, plaque_mm: [150, 120], entraxe_par_fcm0_mm: {"24": 250, "44": 220, "60": 200}, Rmin_m: 4.5, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '7C15': { nom: '7C15 (Freyssinet)', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 65, gaine_int_mm: 60, plaque_mm: [180, 150], entraxe_par_fcm0_mm: {"24": 330, "44": 260, "60": 240}, Rmin_m: 6.0, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '9C15': { nom: '9C15 (Freyssinet)', torons: 9, Ap_mm2: 1350, gaine_ext_mm: 70, gaine_int_mm: 65, plaque_mm: [225, 185], entraxe_par_fcm0_mm: {"24": 380, "44": 300, "60": 280}, Rmin_m: 6.5, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '12C15': { nom: '12C15 (Freyssinet)', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 85, gaine_int_mm: 80, plaque_mm: [240, 200], entraxe_par_fcm0_mm: {"24": 430, "44": 320, "60": 300}, Rmin_m: 8.0, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '13C15': { nom: '13C15 (Freyssinet)', torons: 13, Ap_mm2: 1950, gaine_ext_mm: 85, gaine_int_mm: 80, plaque_mm: [250, 210], entraxe_par_fcm0_mm: {"24": 450, "44": 340, "60": 310}, Rmin_m: 8.0, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '19C15': { nom: '19C15 (Freyssinet)', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 100, gaine_int_mm: 95, plaque_mm: [300, 250], entraxe_par_fcm0_mm: {"24": 530, "44": 400, "60": 380}, Rmin_m: 9.5, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
    },
  },
  vsl: {
    label: 'VSL (ETA 06/0006)',
    document: 'ETA 06/0006 version 5 du 12/05/2026 (Cerema) ; gaines : brochure VSL Post-Tensioning Solutions (2009)',
    url: 'https://www.heijmans.nl/media/documents/2582/ETA_06-0006_v5_TSp6YRK.pdf',
    rentree_mm: 6, mu: 0.18, k_rad_m: 0.005, bordRegle: true,
    note: 'Recul 6 mm (A.2.6.3), μ = 0,18 et k = 0,005 rad/m en gaine feuillard (A.2.6.1, p. 26-28). Plaques, entraxes et distances au bord de l\'annexe A.6 non lus : plaques forfaitaires génériques.',
    unites: {
      '6-4': { nom: 'VSL 6-4', torons: 4, Ap_mm2: 600, gaine_ext_mm: 50, gaine_int_mm: 45, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 4.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-7': { nom: 'VSL 6-7', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 62, gaine_int_mm: 55, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 5.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-9': { nom: 'VSL 6-9', torons: 9, Ap_mm2: 1350, gaine_ext_mm: 72, gaine_int_mm: 65, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 6.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-12': { nom: 'VSL 6-12', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 82, gaine_int_mm: 75, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 7.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-19': { nom: 'VSL 6-19', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 97, gaine_int_mm: 90, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 9.0, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
    },
  },
};

/** Liste pour l'interface : [{ id, label, unites: [{ id, nom }] }]. */
export const agrementList = () => Object.entries(AGREMENTS).map(([id, a]) => ({ id, label: a.label, unites: Object.entries(a.unites).map(([uid, u]) => ({ id: uid, nom: u.nom, torons: u.torons })) }));

/** Unité générique de référence pour n torons : la plus petite unité générique T15 d'au moins n torons. */
function genericFor(n) {
  const G = Object.values(AGREMENTS.generique.unites).filter(u => u.Ap_mm2 / u.torons > 140).sort((p, q) => p.torons - q.torons);
  return G.find(u => u.torons >= n) || G[G.length - 1];
}

/**
 * Unité de calcul à partir d'un procédé et d'une unité ; frottement et recul : agrément, sinon BPEL annexe 3.
 * Entraxe minimal : valeur de l'agrément pour la plus grande f_cm,0 du tableau ne dépassant pas f_cj (f_cj caractéristique
 * ≤ f_cm,0 moyenne : choix prudent) ; distance au bord e = x/2 + c − 10 mm quand le procédé donne cette règle.
 * Unité absente du procédé : unité du procédé de même nombre de torons, sinon la première.
 * @param {{cas?: 'I'|'II', fcj?: number, cover?: number}} o f_cj [MPa] à la mise en tension, enrobage c [m]
 */
export function unitOf(agrId = 'generique', unitId = '12', { cas = 'I', fcj = null, cover = 0.05 } = {}) {
  const A = AGREMENTS[agrId] || AGREMENTS.generique, id = AGREMENTS[agrId] ? agrId : 'generique';
  let uid = A.unites[unitId] ? unitId : null;
  if (!uid) {
    const nT = (AGREMENTS.generique.unites[unitId] || {}).torons ?? parseInt(unitId, 10);
    uid = Object.keys(A.unites).find(k => A.unites[k].torons === nT) || Object.keys(A.unites)[0];
  }
  const u = A.unites[uid], gu = genericFor(u.torons), notes = [];
  const pick = (v, d, what) => { if (v === null || v === undefined) { if (id !== 'generique' && what) notes.push(what); return d; } return v; };
  const fB = cas === 'II' ? 0.20 : 0.18, phiB = cas === 'II' ? 0.003 : 0.002;
  const f = A.mu ?? A.f ?? fB, phi = A.mu != null && A.k_rad_m != null ? A.mu * A.k_rad_m : (A.phi ?? phiB);
  let spacingMin = null, fcm0 = null, tensionOK = true;
  if (u.entraxe_par_fcm0_mm) {
    const keys = Object.keys(u.entraxe_par_fcm0_mm).map(Number).sort((p, q) => p - q);
    const k = fcj == null ? keys[0] : (keys.filter(x => x <= fcj + 1e-9).pop() ?? keys[0]);
    if (fcj != null && fcj < keys[0] - 1e-9) tensionOK = false;
    fcm0 = k; spacingMin = u.entraxe_par_fcm0_mm[String(k)] / 1000;
  } else if (id !== 'generique') notes.push('entraxe minimal');
  const edgeMin = spacingMin && A.bordRegle ? spacingMin / 2 + cover - 0.010 : null;
  const plate = u.plaque_mm ? u.plaque_mm[0] / 1000 : pick(null, gu.plaque_mm[0] / 1000, 'plaque d\'ancrage (forfait générique)');
  const plateB = u.plaque_mm ? (u.plaque_mm[1] ?? u.plaque_mm[0]) / 1000 : gu.plaque_mm[1] / 1000;
  return {
    label: u.nom, Ap: u.Ap_mm2 * 1e-6, torons: u.torons,
    phiG: pick(u.gaine_ext_mm, gu.gaine_ext_mm, 'gaine') / 1000, Rmin: pick(u.Rmin_m, gu.Rmin_m, 'rayon minimal'),
    plate, plateB, spacingMin, edgeMin, fcm0, tensionOK, cover,
    f, phi, g: pick(A.rentree_mm, 6, 'recul d\'ancrage (6 mm par défaut)') / 1000,
    source: A.document, url: A.url, agrNote: A.note || null, ref: u.ref || null, manquants: notes, agrement: id, unite: uid,
  };
}
