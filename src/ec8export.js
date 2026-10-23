/**
 * Export vers « Pont EC8 » (dépôt ahmedksentini-bit/ouvpara) : projet JSON v1 importable dans l'outil de calcul
 * parasismique EN 1998-2 (méthode du mode fondamental, guide Cerema 2015), construit à partir du tablier, des appareils
 * d'appui retenus et des données « Appuis et fondations » de PSIDA.
 *
 * Correspondances et limites (périmètre V1 de Pont EC8) :
 *  - piles voiles → 1 fût rectangulaire (épaisseur × longueur), piles à colonnes → n fûts circulaires ;
 *  - culées : Pont EC8 ne traite que les culées perchées (poteaux carrés, sommier, garde-grève). Culée enterrée → poteaux
 *    carrés de même aire que les colonnes ; culée remblayée (mur de front) → culée supposée rigide dans les deux directions ;
 *  - appareils en élastomère fretté : n feuillets de t, frettes t_s, enrobages 2,5 mm, G = 0,9 MPa, fixation mécanique ;
 *  - charges permanentes par appui : réactions permanentes (MN) et rotation permanente (module différé) ;
 *  - fondations supposées rigides (comme dans Pont EC8).
 * Unités Pont EC8 : m, MPa, t/m³, kN/m, MN.
 */
import { bearingSpacing } from './bearings.js';

const CLASSES = [[12, 15], [16, 20], [20, 25], [25, 30], [30, 37], [35, 45], [40, 50], [45, 55], [50, 60]];
const betonClasse = fck => { const c = CLASSES.find(([f]) => f >= fck) || CLASSES[CLASSES.length - 1]; return `C${c[0]}/${c[1]}`; };

/**
 * @param {object} st résultat de compute() (pipeline) ; @param {object} opt { nom, site: { commune, zone, categorie, classeSol, ST, trafic },
 *   q: { long, trans }, g }
 */
export function toPontEC8(st, opt = {}) {
  const { p, deck, perm, supports } = st;
  if (!supports) throw new Error('Calcul des appuis indisponible : export Pont EC8 impossible.');
  // appareils retenus par le calcul des appuis (remplacés quand le choix du guide 1989 ne vérifiait pas la NF EN 1337-3)
  const bearings = supports.bearingsRetenus || st.bearings;
  const sp = supports.sp, width = 2 * deck.b;
  // données propres à chaque ligne (plan de nivellement : hauteurs, semelles, pieux)
  const spL = i => (supports.spLigne && supports.spLigne[i]) || sp;
  const n = deck.spans.length + 1;
  const di = p.deckInput;
  const superstr = di.lines.reduce((a, l) => a + (+l.g || 0), 0) + di.bands.reduce((a, b) => a + (+b.q || 0) * Math.abs(b.y2 - b.y1), 0);
  const appareils = i => {
    const r = bearings.rows[i], sel = r.sel;
    // appareils à pot (EN 1337-5) fixes ou glissants (EN 1337-2) : liaison rigide ou libre, dimensions indicatives
    if (r.liaison === 'fixe' || r.liaison === 'glissant') return { type: r.liaison, nombre: r.nb, a: 0.6, b: 0.6, hauteur: 0.15 };
    const bd = sel ? sel.bd : { a: 300, b: 400, t: 10, ts: 3 }, nl = sel ? sel.n : 3;
    return { type: 'elastomere', nombre: r.nb, a: bd.a / 1000, b: bd.b / 1000, nbFeuillets: nl, ti: bd.t / 1000, enrobage: 0.0025, ts: bd.ts / 1000,
      plaqueExterieure: 0, Gg: 0.9, enrobageLateral: 0.005, fixation: 'mecanique' };
  };
  const charges = i => ({ Nmax: Math.max(perm.Rmax[i], perm.Rmin[i]) / 1000, Nmin: Math.min(perm.Rmax[i], perm.Rmin[i]) / 1000, rotation: Math.abs((bearings.rotPerm || [])[i] || 0) });
  const Lfoot = (end) => (end ? width : (sp.pile.type === 'voile' ? (sp.pile.Lv ?? width) : width)) + 1.0;
  const semelle = (end, i) => ({ long: spL(i).found.B, trans: Lfoot(end), epaisseur: spL(i).found.hs });
  const Hpile = i => { const H = [].concat(spL(i).pile.H); return H[Math.min(H.length - 1, i - 1)] ?? H[0]; };
  // armatures longitudinales du fût (une colonne ou le voile) retenues par PSIDA, pour la poussée progressive de Pont EC8 :
  // barres Ø 20, axe des aciers à c + 1 cm du parement (comme le calcul en flexion composée de PSIDA)
  const armatures = i => {
    const l = supports.lines?.[i], sh = l?.EC?.shaft ?? l?.BAEL?.shaft;
    return sh && sh.As > 0 ? { armatures: { As: Math.round(sh.As * 1e4 * 10) / 10, db: 20, enrobage: sp.mat.c ?? 0.04 } } : {};
  };
  const appuis = Array.from({ length: n }, (_, i) => {
    const end = i === 0 || i === n - 1;
    if (!end) {
      const P = sp.pile, col = P.type === 'colonnes';
      return {
        type: 'pile', id: `P${i}`,
        futs: col ? { forme: 'circulaire', nombre: P.nCol, long: P.D, trans: P.D, entraxe: width / P.nCol, hauteur: Hpile(i) + (P.hc || 0) }
          : { forme: 'rectangulaire', nombre: 1, long: P.b, trans: P.Lv ?? width, entraxe: 0, hauteur: Hpile(i) },
        semelle: semelle(false, i), appareils: appareils(i), butees: { transversales: false, longitudinales: false }, chargesPermanentes: charges(i),
        ...armatures(i),
        // travées indépendantes : recouvrement de chaque côté = demi-largeur de la tête de pile (chevêtre, ou voile en tête)
        // moins la demi-ouverture nominale du joint (2,5 cm)
        ...(deck.continuite === 'isostatique' ? { reposDisponible: Math.max(0, (col ? (P.hc > 0 ? P.lc : P.D) : (P.bTop ?? P.b)) / 2 - 0.025) } : {}),
      };
    }
    const C = spL(i).culee, rem = C.type === 'remblayee';
    const nCol = rem ? 2 : C.nCol, cote = rem ? C.em : C.D * Math.sqrt(Math.PI) / 2;
    const hc = rem ? 1.0 : C.hc;
    // sommier assez long pour que le garde-grève (épaisseur 0,30, à l'arrière du sommier) laisse 0,15 m de jeu devant le tablier
    const ap = appareils(i), deb = (di.overhangs || [0, 0])[i === 0 ? 0 : 1] || 0;
    const lc = Math.max(rem ? C.em + 0.3 : C.lc, cote / 2 + 0.2 + 0.30 + Math.max(ap.a / 2, deb) + 0.15);
    return {
      type: 'culee', id: `C${i}`,
      poteaux: { nombre: nCol, cote, entraxe: rem ? width / 2 : width / nCol, hauteur: C.Hm },
      sommier: { long: lc, haut: hc, trans: width, debordAvant: 0.2 },
      gardeGreve: { hauteur: supports.hGG, epaisseur: 0.30, retrait: 0 },
      longrine: null, semelle: semelle(true, i), excentrementAppui: 0,
      rigide: { longitudinal: true, transversal: rem },
      appareils: ap, butees: { transversales: false, longitudinales: false }, chargesPermanentes: charges(i),
    };
  });
  const site = { commune: '', zone: 3, categorie: 'III', classeSol: 'B', ST: 1.0, trafic: 'cas_general', ...(opt.site || {}) };
  // nature du tablier : pont-dalle (PSI-DA ou PSI-DP) ou tablier quelconque des appuis seuls (poutres, caisson, mixte)
  const TYPES = { dalle: st.psidp ? 'dalle_bp' : 'dalle_ba', poutres: 'poutres', caisson: 'caisson', mixte: 'mixte' };
  const typeTablier = TYPES[deck.type || 'dalle'] || 'dalle_ba';
  // inerties du tablier saisies dans son propre béton : ramenées au béton des appuis, seul module du modèle Pont EC8
  const kE = deck.fck > 0 ? ((deck.fck + 8) / (sp.mat.fck + 8)) ** 0.3 : 1;
  const inertieV = deck.Iv > 0 ? kE * deck.Iv : p.I > 0 ? p.I : null, inertieT = deck.It > 0 ? kE * deck.It : null;
  // ouvrage construit par encorbellements (caisson) : hors du domaine du mode fondamental (guide Cerema 2015, ch. 4 § 5.3.1)
  const methode = opt.methode || (deck.type === 'caisson' ? 'multimodale' : undefined);
  return {
    version: 1,
    nom: opt.nom || `${({ dalle: 'Pont-dalle', poutres: 'Pont à poutres', caisson: 'Pont-caisson', mixte: 'Pont mixte' })[deck.type || 'dalle']} ${deck.spans.join('-')} m (export PSIDA)`,
    description: `Exporté de PSIDA (calcul manuel assisté des ponts-dalles) : tablier, appareils d'appui retenus, appuis et semelles. Entraxe des appareils ${bearingSpacing({ width, psi: p.concept.psi, n: bearings.nb }).toFixed(2)} m. Culées remblayées représentées comme rigides (culées à mur de front hors du périmètre V1 de Pont EC8).`,
    site,
    materiaux: { beton: { classe: betonClasse(sp.mat.fck), fck: sp.mat.fck, masseVolumique: 2.5 }, acier: { fyk: sp.mat.fyk, classeDuctilite: 'B' } },
    tablier: { type: typeTablier, travees: deck.spans.slice(), largeur: width, epaisseur: deck.h, aire: deck.area ?? di.area ?? width * deck.h, superstructures: superstr,
      debordAbout: (di.overhangs || [0, 0])[0] || 0, chargeTrafic: 0, ...(inertieV ? { inertieVerticale: inertieV } : {}), ...(inertieT ? { inertieTransversale: inertieT } : {}),
      ...(deck.continuite === 'isostatique' ? { continuite: 'isostatique' } : {}) },
    appuis,
    comportement: { qLongitudinal: opt.q?.long ?? 1, qTransversal: opt.q?.trans ?? 1, amortissement: 5, plateauOrigine: true },
    elastomeres: { T0: 10, Tmin: -20, lambdaMaxF1: 1.1, lambdaMaxF2: 1.1, psiFi: 0.7, gammaIS: 1.5, Kf: 0.6 },
    service: { retraitFluage: p.concept.epsSlow ?? 2.5e-4, deltaT: p.concept.dTu ?? 30, alpha: 1e-5 },
    options: { g: opt.g ?? 9.81, ...(methode ? { methodeEfforts: methode } : {}) },
  };
}
