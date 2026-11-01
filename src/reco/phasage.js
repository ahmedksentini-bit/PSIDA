/**
 * Règles de recommandation de l'onglet « Phasage » : poutres préfabriquées précontraintes rendues continues, pont construit
 * par encorbellements successifs (fléaux, caisson) et pont mixte acier-béton (bipoutre ou quadripoutre, EN 1994-2).
 *
 * Pour chaque vérification qui sort « NON » (contraintes des phases de construction, ouvrage terminé, fléaux en
 * construction, voussoir sur pile, structure mixte achevée, charpente au bétonnage, courbure, fatigue, connexion) ou qui
 * n'a pas pu être faite (sections saisies par leurs valeurs, calcul impossible) : le constat, la règle, et les données du
 * formulaire (champs ph_*, fl_*, mx_*) à modifier. Les valeurs proposées sont CHERCHÉES par recalcul du modèle complet
 * (calcul par phases avec fluage, retrait et relaxation, puis ouvrage terminé), jamais estimées par une formule.
 *
 * Les vérifications sont regroupées en familles qu'un même paramètre fait passer (précontrainte, béton, âmes, semelles d'une
 * zone, câbles de fléau ou de continuité, entretoisement…). Plusieurs familles en défaut sont traitées ENSEMBLE, comme les
 * épaisseurs des cadres (src/reco/cadre.js) : chaque famille en défaut reçoit la valeur minimale de son paramètre qui la fait
 * passer, les autres gardant leur dernière valeur (point fixe : la précontrainte augmentée peut mettre la compression en
 * défaut, une semelle épaissie sur appui redistribue les moments en travée…), puis chaque paramètre est ramené au minimum
 * qui garde toutes les familles satisfaites. Le jeu de valeurs final est recalculé en entier : chaque recommandation dit
 * si la vérification passe effectivement avec lui.
 *
 * Un calcul complet prend quelques secondes : l'interface lance ces recherches dans un Web Worker
 * (web/reco_phasage_worker.js) ; les essais ne recalculent que ce dont dépend la famille cherchée (phases seules pour les
 * contraintes de construction ; flexion locale du hourdis seulement pour le poinçonnement), le résultat final étant toujours
 * le calcul complet. Au-delà du budget de temps, la recherche est laissée au bouton « Calculer » du panneau.
 *
 * Format (celui de src/recommandations.js et src/reco/cadre.js) : { domaine, lieu, verification, constat, regle, actions,
 * cibles } ; `cibles` situe les lignes « NON » des tableaux (web/phasage_view.js) : { type, index } avec type 'phase'
 * (contraintes des phases), 'acheve' (ouvrage terminé), 'deseq' (fléaux en construction), 'vsp' (voussoir sur pile),
 * 'mixte' (structure mixte), 'nonverif' ou 'erreur'.
 */
import { computePhasage } from '../../web/phasage_view.js';
import { contraintesPhases } from '../phasage/contraintes.js';

const fx = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : v === Infinity ? '∞' : '–');
const str = v => String(+(+v).toFixed(4));
const num = (v, def) => (String(v ?? '').trim() !== '' && Number.isFinite(+v) ? +v : def);
const plafond = (v, pas) => Math.ceil(v / pas - 1e-9) * pas;
const plancher = (v, pas) => Math.floor(v / pas + 1e-9) * pas;
const minus = s => s.charAt(0).toLowerCase() + s.slice(1);   // libellé en milieu de phrase (« f_ck », « P » inchangés)

/** Libellés courts des champs (indications sous les « NON » ; le panneau lit les libellés complets du formulaire). */
export const LIB_PHASAGE = {
  ph_P: 'Précontrainte P', ph_P0: 'Force au vérin P₀', ph_Ap: 'Section A_p', ph_eMi: 'Excentrement à mi-travée', ph_pfck: 'f_ck de la poutre', ph_hfck: 'f_ck du hourdis',
  ph_t1: 'Mise en tension', ph_t2: 'Coulage du hourdis', ph_bw: 'Épaisseur d\'âme de la poutre', ph_hd: 'Épaisseur du hourdis', ph_H: 'Hauteur de la poutre', ph_geo: 'Sections définies',
  ph_expo: 'Classe d\'exposition', ph_bb: 'Largeur du talon',
  fl_cn: 'Câbles de fléau par paire de voussoirs', fl_ccn: 'Câbles de continuité (travée centrale)', fl_crn: 'Câbles de continuité par travée de rive',
  fl_ccv: 'Voussoirs couverts (continuité centrale)', fl_crv: 'Voussoirs couverts (continuité de rive)', fl_fck: 'f_ck du caisson', fl_bw: 'Épaisseur des âmes',
  fl_tip: 'Hourdis inférieur sur pile', fl_hp: 'Hauteur sur pile', fl_ediaph: 'Épaisseur du diaphragme sur pile', fl_dur: 'Âge à la mise en tension', fl_geo: 'Section définie', fl_dcal: 'Entraxe des cales de clouage',
  mx_ttfi: 'Semelle inférieure en travée (épaisseur)', mx_ttfs: 'Semelle supérieure en travée (épaisseur)', mx_atfi: 'Semelle inférieure sur appui (épaisseur)', mx_atfs: 'Semelle supérieure sur appui (épaisseur)',
  mx_tbfi: 'Semelle inférieure en travée (largeur)', mx_tbfs: 'Semelle supérieure en travée (largeur)', mx_abfi: 'Semelle inférieure sur appui (largeur)', mx_abfs: 'Semelle supérieure sur appui (largeur)',
  mx_ttw: 'Âme en travée (épaisseur)', mx_atw: 'Âme sur appui (épaisseur)', mx_a: 'Entraxe des raidisseurs verticaux', mx_ac: 'Entraxe des entretoises (berceaux)',
  mx_hc: 'Épaisseur de la dalle', mx_fck: 'f_ck de la dalle', mx_rhoa: 'Armatures sur appuis', mx_gn: 'Goujons par rangée', mx_gd: 'Diamètre des goujons', mx_Iv: 'Inertie des montants I_v', mx_R: 'Rayon en plan',
};

/* ------------------------------------------------------------------------------------------- lecture des vérifications */

/** Références des contraintes des phases (src/phasage/contraintes.js). */
const refPhase = (critere, service) => (/^compression/.test(critere) ? (service ? 'EN 1992-1-1 § 7.2 (3) : 0,45 f_ck(t) en service' : 'EN 1992-1-1 § 5.10.2.2 (5) ; EN 1992-2 § 113.3.2 : 0,6 f_ck(t) en construction')
  : /^traction/.test(critere) ? 'EN 1992-1-1 § 3.1.2 (9) et § 7.1 (2) : f_ctm(t)' : 'EN 1992-2 tableau 7.101N (décompression, quasi permanente)');

/**
 * Toutes les vérifications d'un calcul, sous une forme commune : { type, index, nom, val, lim, ok, ref, x, … } ; type et
 * index repèrent la ligne du tableau de l'interface. Les contraintes des phases sont recalculées comme l'affichage
 * (contraintesPhases, même date de mise en service) : leurs index sont ceux du tableau.
 */
export function verifsPhasage(out) {
  const L = [];
  if (!out) return L;
  const push = (type, index, q) => L.push({ type, index, nom: q.nom, val: q.val, lim: q.lim, ok: !!q.ok, ref: q.ref, x: q.x });
  if (out.type === 'mixte') { (out.v?.verifs || []).forEach((q, i) => push('mixte', i, q)); return L; }
  const R = out.reperes, M = out.modele;
  if (R && R.fibres && out.r) {
    const C = contraintesPhases(out.r, M, R.fibres, out.p.dates.superstructures);
    C.verifs.forEach((q, i) => {
      const b = M.barres[q.ou.barre], n = M.noeuds, x = n[b.i][0] + (n[b.j][0] - n[b.i][0]) * q.ou.xi;
      L.push({ type: 'phase', index: i, nom: `Phases : ${q.partie}, ${q.critere}`, val: q.valeur, lim: q.limite, ok: q.ok, ref: refPhase(q.critere, q.ou.service), x,
        partie: q.partie, critere: q.critere, fibre: q.ou.fibre, service: q.ou.service, age: q.ou.age, t: q.ou.t });
    });
  }
  (out.acheve?.verifs || []).forEach((q, i) => push('acheve', i, q));
  (out.desequilibre?.verifs || []).forEach((q, i) => push('deseq', i, q));
  return L;
}

/** Zone (travée 't' ou appui 'a') de la section du pont mixte à l'abscisse x. */
function zoneMixte(out, x) {
  const S = out.v?.sections || [];
  if (!S.length || x == null) return 't';
  const s = S.find(q => Math.abs(q.x - x) < 1e-6) || S.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  return s.zoneAppui ? 'a' : 't';
}

/** Famille d'une vérification : ensemble des vérifications qu'un même paramètre fait passer. */
export function famille(v, out) {
  const n = v.nom || '', comp = /compression/.test(n.replace(/[Dd]écompression/g, ''));
  if (out.type === 'poutres') {
    if (v.type === 'phase') {
      if (/^compression/.test(v.critere)) return v.partie === 'hourdis' ? 'beton-hourdis' : v.service ? 'beton-poutre' : 'jeune-age';
      if (/^traction/.test(v.critere)) return v.partie === 'hourdis' ? 'hourdis-traction' : 'poutre-traction';
      return 'precontrainte';
    }
    if (comp) return /hourdis/.test(n) ? 'beton-hourdis' : 'beton-poutre';
    if (/^Décompression|^Fréquente : traction|^Séisme vertical.*traction/.test(n)) return 'precontrainte';
    if (/^Joint de clavage/.test(n)) return 'joint';
    if (/effort tranchant/.test(n)) return 'tranchant';
    if (/poinçonnement/.test(n)) return 'poinc';
    return 'autre';
  }
  if (out.type === 'fleau') {
    const a = out.p.a, pos = (fib, x) => (fib === 'sup' ? 'cables-fleau' : x > a + 1e-6 && x < 3 * a - 1e-6 ? 'cables-centre' : 'cables-rive');
    if (v.type === 'phase') return /^compression/.test(v.critere) ? 'compression' : pos(v.fibre, v.x);
    if (v.type === 'deseq') return comp ? 'compression' : /traction/.test(n) ? 'vsp-traction' : 'clouage';
    if (comp) return 'compression';
    if (/^Décompression|^Fréquente : traction|^Séisme vertical.*traction/.test(n)) { const m = n.match(/\b(sup|inf)\)/); return pos(m ? m[1] : 'inf', v.x); }
    if (/effort tranchant/.test(n)) return 'tranchant';
    if (/^Diaphragme/.test(n)) return 'diaphragme';
    if (/^Appareil/.test(n)) return 'appareil';
    return 'autre';
  }
  // pont mixte
  const z = zoneMixte(out, v.x);
  if (/^ELU flexion|^ELS caractéristique : contrainte de l'acier/.test(n)) return `acier-${z}`;
  if (/effort tranchant|^Interaction/.test(n)) return `ame-${z}`;
  if (/^Déversement/.test(n)) return 'deversement';
  if (/compression de la dalle/.test(n)) return 'dalle';
  if (/armatures sur appui|^Armatures minimales|^Fatigue des armatures/.test(n)) return 'armatures';
  if (/^Connexion|^Fatigue : goujons/.test(n)) return 'connexion';
  if (/^Fatigue : semelle/.test(n)) return `fatigue-${z}`;
  if (/^Bétonnage : résistance/.test(n)) return `beton-res-${z}`;
  if (/^Bétonnage : déversement de la semelle/.test(n)) return /supérieure/.test(n) ? `beton-dev-sup-${z}` : `beton-dev-inf-${z}`;
  if (/^Bétonnage : déversement d'ensemble/.test(n)) return 'beton-glob';
  if (/^Courbure \(R/.test(n)) return `courbe-${z}`;
  if (/flexion latérale/.test(n)) return `courbe-fl-${z}`;
  if (/soulèvement/.test(n)) return 'courbe-equ';
  if (/^Courbure, bétonnage/.test(n)) return 'courbe-beton';
  if (/poinçonnement/.test(n)) return 'poinc';
  return 'autre';
}
/** Familles du pont mixte vérifiées section par section (toutes les sections de la zone, pas seulement la plus sollicitée). */
const SECTIONNELLE = /^(acier|ame|fatigue)-[at]$/;

/** État d'un calcul : vérifications classées et familles en défaut. */
const ETATS = new WeakMap();
function etat(out) {
  if (!out) return null;
  if (ETATS.has(out)) return ETATS.get(out);
  const V = verifsPhasage(out).map(v => ({ ...v, famille: famille(v, out) })), ko = new Set();
  for (const v of V) if (!v.ok && !SECTIONNELLE.test(v.famille)) ko.add(v.famille);
  if (out.type === 'mixte') for (const s of out.v?.sections || []) {
    const z = s.zoneAppui ? 'a' : 't';
    if (!((s.classe <= 2 ? Math.abs(s.MEd) <= s.Mpl : s.sEluMax <= s.fy) && s.sElsMax <= s.fy)) ko.add(`acier-${z}`);
    if (!(s.VEd <= s.Vr.Vb && (!s.interaction || s.interaction.val <= 1))) ko.add(`ame-${z}`);
    if (!s.fatigue.ok) ko.add(`fatigue-${z}`);
  }
  const e = { V, ko };
  ETATS.set(out, e);
  return e;
}

/* ------------------------------------------------------------------------------------------------------------ leviers */

/**
 * Paramètre du formulaire et grille de valeurs, de la valeur actuelle vers les valeurs « plus favorables ».
 * o : { champ, unite, dec, pas, max | min, sens ('haut' | 'bas'), entier, lire(out, d) → valeur actuelle, extra(v, d0) → autres
 * champs écrits avec lui (A_p avec P), echelle (affichage : % ou mm) }.
 */
function levier(champ, o) {
  return {
    champ, unite: o.unite || '', dec: o.dec ?? 2, sens: o.sens || 'haut', pas: o.pas, extra: o.extra || null, txt: o.txt || null,
    lire: o.lire,
    grille(x0) {
      const vals = [];
      if (this.sens === 'haut') { const max = typeof o.max === 'function' ? o.max(x0) : o.max; for (let v = plafond(x0 + 1e-9 * Math.max(1, Math.abs(x0)) + (o.pas * 1e-6), o.pas); v <= max + 1e-9; v += o.pas) vals.push(+v.toFixed(4)); }
      else { const min = typeof o.min === 'function' ? o.min(x0) : o.min; for (let v = plancher(x0 - 1e-9 * Math.max(1, Math.abs(x0)) - (o.pas * 1e-6), o.pas); v >= min - 1e-9; v -= o.pas) vals.push(+v.toFixed(4)); }
      return vals;
    },
    appliquer(v, d0) { return { [champ]: str(v), ...(this.extra ? this.extra(v, d0) : {}) }; },
  };
}

/** Valeur actuelle d'un champ : la saisie, sinon la valeur lue par le modèle (champ vide = valeur par défaut). */
function lecteur(out) {
  const p = out.p, v = out.v || {};
  const zone = z => (z === 't' ? p.travee : p.appui);
  return {
    ph_P: () => p.cable?.P, ph_P0: () => p.cable?.P0, ph_Ap: () => p.cable?.Ap * 1e4, ph_pfck: () => p.poutre?.fck, ph_hfck: () => p.hourdis?.fck, ph_t1: () => p.dates?.tension, ph_t2: () => p.dates?.hourdis,
    ph_bw: () => p.forme?.bw, ph_hd: () => p.forme?.hd, ph_H: () => p.forme?.H, ph_eMi: () => p.cable?.eMi,
    fl_cn: () => p.cable?.n, fl_ccn: () => p.continuite?.n, fl_crn: () => p.continuite?.nRive, fl_ccv: () => p.continuite?.nv, fl_crv: () => p.continuite?.nvRive, fl_fck: () => p.fck, fl_bw: () => p.caisson?.bw,
    fl_tip: () => p.caisson?.tip, fl_hp: () => p.hp, fl_ediaph: () => 0.8, fl_dur: () => p.dates?.durc, fl_dcal: () => 3,
    mx_hc: () => p.hc, mx_fck: () => p.fck, mx_rhoa: () => p.rhoAppui * 100, mx_ac: () => v.ac ?? 6, mx_a: () => v.aRaid ?? 6, mx_gn: () => v.goujons?.n ?? 3, mx_Iv: () => (v.Iv ?? 4e-4) * 1e8,
    ...Object.fromEntries(['t', 'a'].flatMap(z => [[`mx_${z}tfi`, () => zone(z).tfi * 1000], [`mx_${z}tfs`, () => zone(z).tfs * 1000], [`mx_${z}tw`, () => zone(z).tw * 1000],
      [`mx_${z}bfi`, () => zone(z).bfi], [`mx_${z}bfs`, () => zone(z).bfs]])),
  };
}

/** Catalogue des leviers d'un type d'ouvrage (fonction des données initiales d0 et du calcul initial). */
function catalogue(out, d0) {
  const L = lecteur(out), lire = champ => (o, d) => num(d[champ], L[champ] ? L[champ]() : NaN);
  const C = {};
  const def = (id, champ, o) => { C[id] = levier(champ, { lire: lire(champ), ...o }); C[id].id = id; };
  if (out.type === 'poutres') {
    // précontrainte : P (ou P₀ si les pertes instantanées sont calculées) et A_p augmentés ensemble : A_p jamais réduit,
    // porté au multiple d'un toron T15S (1,5 cm²) qui garde la contrainte initiale du câble (au moins 1 200 MPa, au plus
    // la contrainte actuelle si elle est plus haute ; EN 1992-1-1 § 5.10.3 (2) : 0,75 f_pk = 1 395 MPa pour un T15S 1860)
    const champP = d0.ph_pinst === 'calcul' ? 'ph_P0' : 'ph_P', P0 = num(d0[champP], L[champP]()), Ap0 = num(d0.ph_Ap, L.ph_Ap()), sig = Math.max(P0 / Ap0, 120);
    def('P', champP, { unite: 'kN', dec: 0, pas: 100, max: x => 2 * x, extra: v => { const Ap = Math.max(Ap0, Math.ceil(v / sig / 1.5 - 1e-9) * 1.5); return Ap > Ap0 + 1e-9 ? { ph_Ap: str(Ap) } : {}; } });
    // excentrement du câble à mi-travée (vers le bas, négatif) : centre du câble à 0,10 m au moins de la fibre inférieure
    def('eMi', 'ph_eMi', { unite: 'm', pas: 0.01, sens: 'bas', min: -Math.max(0.05, (out.p.forme ? out.p.forme.yG : 0.7) - 0.10) });
    def('pfck', 'ph_pfck', { unite: 'MPa', dec: 0, pas: 5, max: 60 });
    def('hfck', 'ph_hfck', { unite: 'MPa', dec: 0, pas: 5, max: 50 });
    def('t1', 'ph_t1', { unite: 'j', dec: 0, pas: 1, max: () => Math.min(28, num(d0.ph_t2, L.ph_t2())) });
    def('bw', 'ph_bw', { unite: 'm', pas: 0.01, max: x => Math.min(0.45, x + 0.25) });
    def('hd', 'ph_hd', { unite: 'm', pas: 0.01, max: 0.40 });
    def('H', 'ph_H', { unite: 'm', pas: 0.05, max: x => x + 0.6 });
  } else if (out.type === 'fleau') {
    def('cn', 'fl_cn', { unite: '', dec: 0, pas: 1, max: x => x + 8 });
    def('ccn', 'fl_ccn', { unite: '', dec: 0, pas: 2, max: x => x + 20 });
    def('crn', 'fl_crn', { unite: '', dec: 0, pas: 2, max: x => x + 16 });
    def('fck', 'fl_fck', { unite: 'MPa', dec: 0, pas: 5, max: 60 });
    def('bw', 'fl_bw', { unite: 'm', pas: 0.02, max: x => Math.min(1.0, x + 0.4) });
    def('tip', 'fl_tip', { unite: 'm', pas: 0.05, max: x => Math.min(1.2, x + 0.6) });
    def('hp', 'fl_hp', { unite: 'm', pas: 0.25, max: x => x + 2.5 });
    def('ediaph', 'fl_ediaph', { unite: 'm', pas: 0.05, max: 2.5 });
  } else {
    for (const z of ['t', 'a']) {
      for (const f of ['fi', 'fs']) {
        def(`${z}t${f}`, `mx_${z}t${f}`, { unite: 'mm', dec: 0, pas: 5, max: 150 });
        def(`${z}b${f}`, `mx_${z}b${f}`, { unite: 'm', pas: 0.05, max: f === 'fi' ? 1.6 : 1.2 });
      }
      def(`${z}tw`, `mx_${z}tw`, { unite: 'mm', dec: 0, pas: 1, max: x => Math.min(40, x + 16) });
    }
    def('a', 'mx_a', { unite: 'm', pas: 0.25, sens: 'bas', min: 1.0 });
    def('ac', 'mx_ac', { unite: 'm', pas: 0.5, sens: 'bas', min: 2.0 });
    def('hc', 'mx_hc', { unite: 'm', pas: 0.01, max: 0.40 });
    def('fck', 'mx_fck', { unite: 'MPa', dec: 0, pas: 5, max: 60 });
    def('rhoa', 'mx_rhoa', { unite: '%', dec: 1, pas: 0.1, max: 3.0 });
    def('gn', 'mx_gn', { unite: '', dec: 0, pas: 1, max: 6 });
  }
  return C;
}

/** Leviers d'une famille, dans l'ordre (le premier sert à la recherche d'ensemble, les suivants sont des variantes). */
function leviersFamille(f, out) {
  if (out.type === 'poutres') return ({
    precontrainte: ['P', 'eMi'], 'beton-poutre': ['pfck'], 'jeune-age': ['t1', 'pfck'], 'poutre-traction': ['pfck', 't1'], 'beton-hourdis': ['hfck'], 'hourdis-traction': ['hfck'],
    tranchant: ['bw', 'pfck'], poinc: ['hd', 'hfck'], joint: ['hfck', 'H'],
  })[f] || [];
  if (out.type === 'fleau') return ({
    'cables-fleau': ['cn'], 'cables-centre': ['ccn'], 'cables-rive': ['crn'], compression: ['fck', 'tip'], 'vsp-traction': ['cn', 'fck'],
    tranchant: ['bw', 'fck'], diaphragme: ['ediaph', 'fck'], appareil: ['ediaph', 'fck', 'tip'],
  })[f] || [];
  // pont mixte : la semelle la plus sollicitée de la zone d'abord
  const m = f.match(/-(a|t)$/), z = m ? m[1] : 't', S = (out.v?.sections || []).filter(s => (s.zoneAppui ? 'a' : 't') === z);
  if (/^acier-/.test(f)) {
    const ko = S.filter(s => !((s.classe <= 2 ? Math.abs(s.MEd) <= s.Mpl : s.sEluMax <= s.fy) && s.sElsMax <= s.fy));
    const w = ko.reduce((a, s) => (!a || (s.classe <= 2 ? Math.abs(s.MEd) / s.Mpl : s.sEluMax / s.fy) > (a.classe <= 2 ? Math.abs(a.MEd) / a.Mpl : a.sEluMax / a.fy) ? s : a), null);
    const fl = !w || w.classe <= 2 ? 'fi' : (w.sEluFib.sup > w.sEluFib.inf ? 'fs' : 'fi'), autre = fl === 'fi' ? 'fs' : 'fi';
    return [`${z}t${fl}`, `${z}t${autre}`, `${z}b${fl}`];
  }
  if (/^ame-/.test(f)) return [`${z}tw`, 'a'];
  if (/^fatigue-/.test(f)) return [`${z}tfi`, `${z}bfi`];
  if (/^beton-res-/.test(f)) { const sg = out.v?.betonnage?.pires?.res?.sig ?? -1, fl = (sg < 0) === (z === 't') ? 'fs' : 'fi'; return [`${z}t${fl}`, `${z}t${fl === 'fs' ? 'fi' : 'fs'}`]; }
  if (/^beton-dev-sup-/.test(f)) return [`${z}bfs`, 'ac'];
  if (/^beton-dev-inf-/.test(f)) return [`${z}bfi`, 'ac'];
  if (/^courbe-fl-/.test(f)) return [`${z}bfi`];
  if (/^courbe-[at]$/.test(f)) { const w = (out.v?.verifs || []).find(q => /^Courbure \(R/.test(q.nom)), fl = w && /semelle sup/.test(w.nom) ? 'fs' : 'fi'; return [`${z}t${fl}`, `${z}b${fl}`]; }
  const zd = zoneMixte(out, (out.v?.verifs || []).find(q => /^Déversement/.test(q.nom))?.x);
  return ({ deversement: ['ac', `${zd}bfi`, `${zd}tfi`], dalle: ['hc', 'fck'], armatures: ['rhoa'], connexion: ['gn'],
    'beton-glob': ['tbfs', 'tbfi'], 'courbe-beton': ['tbfs'], poinc: ['hc', 'fck'] })[f] || [];
}

/* ------------------------------------------------------------------------------------------------------- textes */

const NOM_TYPE = { poutres: 'Poutres rendues continues', fleau: 'Encorbellements successifs', mixte: 'Pont mixte' };
const LIEU = {
  precontrainte: 'Précontrainte', 'beton-poutre': 'Poutre', 'jeune-age': 'Poutre (jeune âge)', 'poutre-traction': 'Poutre', 'beton-hourdis': 'Hourdis', 'hourdis-traction': 'Hourdis', tranchant: 'Âmes',
  poinc: 'Hourdis', joint: 'Joint de clavage', 'cables-fleau': 'Câbles de fléau', 'cables-centre': 'Continuité centrale', 'cables-rive': 'Continuité de rive', compression: 'Béton du caisson',
  'vsp-traction': 'Voussoir sur pile', clouage: 'Clouage', diaphragme: 'Diaphragme sur pile', appareil: 'Appareils d\'appui', deversement: 'Semelle inférieure', dalle: 'Dalle', armatures: 'Armatures de la dalle',
  connexion: 'Goujons', 'beton-glob': 'Charpente', 'courbe-beton': 'Charpente', 'courbe-equ': 'Appareils d\'appui', autre: '',
};
const lieu = f => LIEU[f] ?? (/^acier-a/.test(f) ? 'Charpente sur appui' : /^acier-t/.test(f) ? 'Charpente en travée' : /^ame-a/.test(f) ? 'Âme sur appui' : /^ame-t/.test(f) ? 'Âme en travée'
  : /^fatigue-/.test(f) ? 'Semelle inférieure' : /^beton-/.test(f) ? 'Charpente au bétonnage' : /^courbe-/.test(f) ? 'Courbure' : '');

/** Indications complémentaires sans valeur (ce que le calcul ne cherche pas). */
function conseils(f, out, d) {
  const T = [];
  const t = out.type;
  if (f === 'precontrainte') {
    if ((d.ph_expo || 'XC') === 'XD') T.push({ texte: 'La décompression est vérifiée sous combinaison fréquente (XD / XS) : ne passer en XC que si l\'exposition réelle le permet (EN 1992-2 tableau 7.101N)', champ: 'ph_expo' });
  }
  if (f === 'jeune-age') T.push({ texte: 'Ou mettre en tension en deux temps (une partie des câbles au jeune âge, le reste après durcissement) : hors du modèle à un câble par travée' });
  if (f === 'tranchant') T.push({ texte: 'V_Rd,max est la résistance des bielles : des étriers supplémentaires n\'y changent rien, seules l\'épaisseur d\'âme et la classe du béton comptent (EN 1992-1-1 § 6.2.3 (3))' });
  if (f === 'cables-fleau') T.push({ texte: 'Ou augmenter la force au vérin ou la section des câbles de fléau (P₀, A_p d\'un câble) dans les limites de l\'agrément du procédé', champ: 'fl_cP0', unite: 'kN' });
  if (f === 'cables-centre') T.push({ texte: 'Ou prolonger les câbles de continuité sur plus de voussoirs de part et d\'autre de la clé', champ: 'fl_ccv' });
  if (f === 'cables-rive') T.push({ texte: 'Ou prolonger les câbles de continuité de rive sur plus de voussoirs depuis la culée', champ: 'fl_crv' });
  if (f === 'compression' && t === 'fleau') T.push({ texte: 'Ou augmenter la hauteur sur pile (bras de levier) : à reprendre avec le prédimensionnement', champ: 'fl_hp', unite: 'm' });
  if (f === 'clouage') T.push({ texte: 'Écarter les files de cales (entraxe d_c) ou ajouter des barres de clouage', champ: 'fl_dcal', unite: 'm' });
  if (f === 'deversement') T.push({ texte: 'Ou raidir les berceaux (inertie des montants I_v, des entretoises I_q)', champ: 'mx_Iv', unite: 'cm⁴' });
  if (t === 'mixte' && (/^beton-/.test(f) || f === 'courbe-beton')) T.push({ texte: 'Ou contreventement horizontal provisoire de la charpente, ou ordre de bétonnage différent (hors du modèle)' });
  if (f === 'connexion') T.push({ texte: 'Ou goujons de plus grand diamètre (P_Rd ∝ d²), vérifier l\'espacement minimal 5 d', champ: 'mx_gd', unite: 'mm' });
  if (f === 'courbe-equ') T.push({ texte: 'Appareils d\'appui anti-soulèvement, lest de la poutre intérieure, ou rayon en plan plus grand ; à défaut, entraxe des poutres augmenté (hors recherche automatique)', champ: 'mx_R', unite: 'm' });
  if (f === 'joint') T.push({ texte: 'Armatures de continuité du hourdis à disposer dans le joint de clavage (aucun câble ne le traverse)' });
  return T;
}

/* ------------------------------------------------------------------------------------------------- recommandations */

/**
 * Recommandations d'un calcul de l'onglet Phasage. out : résultat de computePhasage ; data : données du formulaire qui
 * l'ont produit ; opts.budget : temps accordé aux recherches [ms] (au-delà, recherche laissée au bouton « Calculer ») ;
 * opts.variantes : chercher aussi les autres leviers seuls ; opts.progres(n) : appelé à chaque calcul ; opts.calcul :
 * fonction de calcul (computePhasage par défaut).
 */
export function recommandationsPhasage(out, data, { budget = 60000, variantes = true, progres = null, calcul = computePhasage } = {}) {
  const t0 = Date.now(), items = [], d = { ...data }, type = out.type;
  const domaine = sous => `${NOM_TYPE[type]} — ${sous}`;
  let nCalc = 0;
  const cache = new Map();
  const dansBudget = () => Date.now() - t0 < budget;
  /** Calcul avec des données modifiées ; niv = { acheve, hourdis } (ce qui est recalculé). */
  const essai = (modifs, niv = {}) => {
    // flexion locale du hourdis : seulement pour le poinçonnement (seule vérification qui en dépend) et le calcul final
    const opts = { annexes: false, acheve: niv.acheve !== false, hourdis: niv.hourdis === true };
    const cle = JSON.stringify([modifs, opts]);
    if (cache.has(cle)) return cache.get(cle);
    nCalc++; if (progres) try { progres(nCalc); } catch { /* affichage */ }
    let o = null; try { o = calcul({ ...d, ...modifs }, opts); } catch { o = null; }
    cache.set(cle, o);
    return o;
  };
  const famOk = (o, f) => { const e = etat(o); return !!e && !e.ko.has(f); };

  const E0 = etat(out), V0 = E0.V, C = catalogue(out, d);
  const valeur = (id, modifs) => { const L = C[id]; return num(modifs[L.champ], L.lire(out, d)); };

  // ------------------------------------------------------------------ vérifications non faites
  const nonVerif = [];
  if (type !== 'mixte' && !out.reperes?.fibres) nonVerif.push({ cle: 'geo', verification: 'Contraintes, ELS et ELU', constat: 'sections saisies par leurs valeurs (A, I, e) : contraintes des phases et ouvrage terminé non vérifiés', regle: 'fibres extrêmes nécessaires (EN 1992-1-1 § 7.2)',
    actions: [{ texte: 'Définir les sections par leurs dimensions (poutre, talon, table, hourdis)', champ: 'ph_geo', valeur: 'par leurs dimensions', valeurChamp: 'dimensions', court: LIB_PHASAGE.ph_geo, actuel: 'par leurs valeurs' }] });
  if (type === 'fleau' && out.reperes?.fibres && !out.p.caisson) nonVerif.push({ cle: 'geo', verification: 'Voussoir sur pile, flexion transversale du caisson', constat: 'caisson saisi par ses valeurs : diaphragme, appareils d\'appui et cadre transversal non vérifiés', regle: 'dimensions du caisson nécessaires',
    actions: [{ texte: 'Définir le caisson par ses dimensions (hourdis, âmes)', champ: 'fl_geo', valeur: 'par ses dimensions', valeurChamp: 'dimensions', court: LIB_PHASAGE.fl_geo, actuel: 'par ses valeurs' }] });
  for (const it of nonVerif) items.push({ domaine: domaine('vérifications non faites'), lieu: 'Sections', verification: it.verification, constat: it.constat, regle: it.regle, actions: it.actions, cibles: [{ type: 'nonverif', index: it.cle }] });
  const erreurs = [['acheveErreur', 'Ouvrage terminé'], ['vErreur', 'Structure achevée'], ['desequilibreErreur', 'Fléaux en construction'], ['vspErreur', 'Voussoir sur pile'], ['transversalErreur', 'Flexion transversale du caisson'],
    ['distortionErreur', 'Distortion du caisson']].map(([k, n]) => [k, n, out[k]]).concat([['hourdisErreur', 'Hourdis : flexion locale', out.acheve?.hourdisErreur], ['dalleErreur', 'Dalle : flexion locale', out.v?.dalleErreur]]);
  for (const [k, n, msg] of erreurs) if (msg) items.push({ domaine: domaine('vérifications non faites'), lieu: n, verification: `${n} : calcul impossible`, constat: msg, regle: '',
    actions: [{ texte: `Corriger la donnée en cause (message ci-dessus), puis relancer « Calculer les phases »` }], cibles: [{ type: 'erreur', index: k }] });

  // ------------------------------------------------------------------ familles en défaut et recherche d'ensemble
  const ko0 = [...E0.ko];
  const besoins = f => ({ acheve: type === 'mixte' || V0.some(v => v.famille === f && v.type !== 'phase' && v.type !== 'deseq'), hourdis: f === 'poinc' });
  const nivTous = fams => ({ acheve: true, hourdis: fams.includes('poinc') });
  const avecLevier = f => leviersFamille(f, out).filter(id => C[id]).length > 0;
  const bloques = new Set(ko0.filter(f => !avecLevier(f))), resolu = {}, depart = {}, trace = [], bloqueA = {};
  let modifs = {}, cur = out, epuise = false;
  for (let tour = 0; tour < 5 && !epuise; tour++) {
    // une famille sans valeur suffisante est réessayée quand d'autres valeurs ont changé depuis (semelle épaissie…)
    for (const f of [...bloques]) if (f in bloqueA && bloqueA[f] !== JSON.stringify(modifs)) bloques.delete(f);
    const ko = [...(etat(cur)?.ko || [])].filter(f => !bloques.has(f));
    if (!ko.length) break;
    for (const f of ko) {
      if (famOk(cur, f) || bloques.has(f)) continue;
      if (!dansBudget()) { epuise = true; break; }
      let trouve = null;
      for (const id of leviersFamille(f, cur).filter(k => C[k])) {
        const L = C[id], x0 = valeur(id, modifs), vals = L.grille(x0), niv = besoins(f);
        if (!(id in depart)) depart[id] = L.lire(out, d);
        const v = recherche(vals, x => famOk(essai({ ...modifs, ...L.appliquer(x, d) }, niv), f));
        if (v != null) { trouve = { id, v }; break; }
        if (!dansBudget()) { epuise = true; break; }
      }
      if (!trouve) { if (!epuise) { bloques.add(f); bloqueA[f] = JSON.stringify(modifs); } continue; }
      modifs = { ...modifs, ...C[trouve.id].appliquer(trouve.v, d) }; resolu[f] = trouve.id; trace.push(`${f} → ${C[trouve.id].champ} = ${trouve.v}`);
      cur = essai(modifs, nivTous([...ko0, ...Object.keys(resolu)]));
      if (!cur) { bloques.add(f); cur = out; delete resolu[f]; break; }
    }
  }
  // descente : chaque paramètre ramené au minimum qui garde toutes les familles satisfaites (la montée dépend de l'ordre)
  const ids = [...new Set(Object.values(resolu))];
  const tousOk = o => { const e = etat(o); return !!e && [...e.ko].every(f => bloques.has(f)); };
  if (ids.length > 1 && cur && tousOk(cur)) {
    for (let passe = 0; passe < 2 && dansBudget(); passe++) {
      let change = false;
      for (const id of ids) {
        const L = C[id], v0 = valeur(id, modifs), e = depart[id];
        if (!dansBudget() || !(L.sens === 'haut' ? v0 > e + 1e-9 : v0 < e - 1e-9)) continue;
        const sans = Object.fromEntries(Object.entries(modifs).filter(([k]) => !(k in L.appliquer(v0, d))));
        const vals = [e, ...L.grille(e).filter(x => (L.sens === 'haut' ? x <= v0 + 1e-9 : x >= v0 - 1e-9))];
        const v = dichotomie(vals, x => tousOk(essai(x === e ? sans : { ...sans, ...L.appliquer(x, d) }, nivTous([...ko0, ...Object.keys(resolu)]))));
        if (v != null && Math.abs(v - v0) > 1e-9) { modifs = v === e ? sans : { ...sans, ...L.appliquer(v, d) }; change = true; }
      }
      if (!change) break;
    }
  }
  // calcul complet avec l'ensemble des valeurs retenues : chaque recommandation dit si sa vérification passe
  const fin = Object.keys(modifs).length ? essai(modifs, { acheve: true, hourdis: true }) : out;
  const finEtat = etat(fin), lect = lecteur(out), ini = k => num(d[k], lect[k] ? lect[k]() : NaN);
  const decChamp = Object.fromEntries(Object.values(C).map(L => [L.champ, L.dec])), decs = k => decChamp[k] ?? 1;
  const ensemble = Object.keys(modifs).map(k => `${minus(LIB_PHASAGE[k] || k)} ${fx(ini(k), decs(k))} → ${fx(+modifs[k], decs(k))}`).join(' ; ');
  const bouges = ids.filter(id => Math.abs(valeur(id, modifs) - C[id].lire(out, d)) > 1e-9);

  // ------------------------------------------------------------------ variantes : autres leviers, cherchés seuls
  const variante = {}, autresLeviers = f => leviersFamille(f, out).filter(id => C[id] && id !== resolu[f] && !(C[id].champ in modifs)).slice(0, 1);
  for (const f of ko0) {
    const autres = autresLeviers(f);
    for (const id of autres) {
      const L = C[id], x0 = L.lire(out, d), vals = L.grille(x0);
      if (!vals.length) continue;
      if (!variantes || !dansBudget()) { variante[`${f}|${id}`] = { chercher: { champ: L.champ, min: L.sens === 'haut' ? vals[0] : vals[vals.length - 1], max: L.sens === 'haut' ? vals[vals.length - 1] : vals[0], pas: L.pas, vers: L.sens, depart: vals[0], calcul: 'phasage', base: {}, famille: f, levier: id } }; continue; }
      variante[`${f}|${id}`] = { v: recherche(vals, x => famOk(essai(L.appliquer(x, d), besoins(f)), f)) };
    }
  }

  // ------------------------------------------------------------------ une recommandation par vérification « NON »
  const fmt = (L, x) => fx(+x, L.dec);
  for (const v of V0.filter(q => !q.ok)) {
    const f = v.famille, acts = [], L = resolu[f] ? C[resolu[f]] : null;
    const passeFin = !!finEtat && !finEtat.ko.has(f) && fin !== out;
    const verdict = passeFin ? 'la vérification passe (recalcul complet avec ces valeurs)' : 'ATTENTION : la vérification reste à « NON » avec ces valeurs (voir les autres actions)';
    const vNew = L ? valeur(resolu[f], modifs) : null, vIni = L ? L.lire(out, d) : null, bouge = !!L && Math.abs(vNew - vIni) > 1e-9;
    if (bouge) {
      const champsL = Object.keys(L.appliquer(vNew, d)), extra = champsL.filter(k => k !== L.champ).map(k => `${LIB_PHASAGE[k] || k} ${fx(ini(k), decs(k))} → ${fx(+modifs[k], decs(k))}`);
      const autres = Object.keys(modifs).filter(k => !champsL.includes(k)), propres = Object.fromEntries(champsL.map(k => [k, modifs[k]]));
      // la valeur suffit-elle seule (familles indépendantes : armatures et goujons…) ? recalcul, le plus souvent déjà en cache
      const seule = autres.length > 0 && dansBudget() && famOk(essai(propres, besoins(f)), f);
      const ens = autres.length > 0 && !seule, champs = ens ? { ...modifs } : propres;
      const lib = (LIB_PHASAGE[L.champ] || L.champ), avec = autres.map(k => `${minus(LIB_PHASAGE[k] || k)} ${fx(+modifs[k], decs(k))}`).join(', ');
      const multi = champsL.length > 1 || ens;
      acts.push({ texte: `${L.sens === 'haut' ? 'Porter' : 'Ramener'} ${minus(lib)} de ${fmt(L, vIni)} à ${fmt(L, vNew)}${L.unite ? ' ' + L.unite : ''}${extra.length ? ` (${extra.join(', ')})` : ''} — valeur cherchée par recalcul complet${ens ? ` AVEC ${avec} (appliquées ensemble)` : seule ? ' ; elle suffit seule à cette vérification (recalcul complet), les autres valeurs cherchées servant aux autres vérifications' : ', les autres données restant inchangées'} : ${seule ? 'la vérification passe' : verdict}`,
        champ: L.champ, unite: L.unite, valeur: fmt(L, vNew), valeurChamp: modifs[L.champ], actuel: fmt(L, vIni),
        // indication sous le « NON » : quand plusieurs champs vont ensemble, les valeurs sont dans le texte du lien
        court: multi ? `${lib} ${fmt(L, vIni)} → ${fmt(L, vNew)}${L.unite ? ' ' + L.unite : ''}${extra.length ? `, ${extra.join(', ')}` : ''}${ens ? ` (avec ${avec})` : ''}` : lib,
        ...(multi ? { champs } : {}), verifie: seule || passeFin });
      if (autres.length) acts.push({ texte: `Appliquer l'ensemble des valeurs cherchées ensemble (${ensemble}) : ${passeFin ? 'la vérification passe' : 'la vérification reste à « NON »'}`, champs: { ...modifs }, valeur: 'ensemble' });
    } else if (passeFin && Object.keys(modifs).length) {
      acts.push({ texte: `${L ? `Inutile de modifier ${minus(LIB_PHASAGE[L.champ] || L.champ)} : la` : 'La'} vérification passe une fois appliquées les valeurs cherchées pour les autres vérifications (${ensemble}, recalcul complet)`, champs: { ...modifs }, valeur: 'ensemble', court: ensemble.charAt(0).toUpperCase() + ensemble.slice(1), verifie: true });
    } else if (bloques.has(f)) {
      const ids0 = leviersFamille(f, out).filter(id => C[id]);
      if (ids0.length) { const L0 = C[ids0[0]]; acts.push({ texte: `Aucune valeur ne suffit dans la plage explorée (${ids0.map(id => `${minus(LIB_PHASAGE[C[id].champ] || C[id].champ)} jusqu'à ${fmt(C[id], C[id].grille(C[id].lire(out, d)).slice(-1)[0] ?? C[id].lire(out, d))}${C[id].unite ? ' ' + C[id].unite : ''}`).join(', ')}) : changer de conception (voir ci-dessous)`, champ: L0.champ, unite: L0.unite, court: LIB_PHASAGE[L0.champ], actuel: fmt(L0, L0.lire(out, d)) }); }
      else acts.push({ texte: 'Pas de paramètre du formulaire à chercher automatiquement pour ce critère : voir les indications ci-dessous' });
    } else {
      // budget épuisé : recherche laissée au bouton « Calculer » du panneau
      const id = leviersFamille(f, out).find(k => C[k]);
      if (id) { const Lb = C[id], vals = Lb.grille(Lb.lire(out, d)); acts.push({ texte: `${Lb.sens === 'haut' ? 'Augmenter' : 'Réduire'} ${minus(LIB_PHASAGE[Lb.champ] || Lb.champ)} (${fmt(Lb, Lb.lire(out, d))}${Lb.unite ? ' ' + Lb.unite : ''}) : valeur à chercher (« Calculer »)`, champ: Lb.champ, unite: Lb.unite, court: LIB_PHASAGE[Lb.champ], actuel: fmt(Lb, Lb.lire(out, d)),
        ...(vals.length ? { chercher: { champ: Lb.champ, min: Lb.sens === 'haut' ? vals[0] : vals[vals.length - 1], max: Lb.sens === 'haut' ? vals[vals.length - 1] : vals[0], pas: Lb.pas, vers: Lb.sens, depart: vals[0], calcul: 'phasage', base: { ...modifs }, famille: f, levier: id } } : {}) }); }
    }
    for (const id of autresLeviers(f)) {
      const Lv = C[id], r = variante[`${f}|${id}`]; if (!r) continue;
      const x0 = Lv.lire(out, d), extra = Lv.extra ? Object.keys(Lv.appliquer(1, d)).filter(k => k !== Lv.champ) : [];
      if (r.v != null) { const ap = Lv.appliquer(r.v, d); acts.push({ texte: `Ou, seul (les autres données inchangées) : ${minus(LIB_PHASAGE[Lv.champ] || Lv.champ)} ${fmt(Lv, x0)} → ${fmt(Lv, r.v)}${Lv.unite ? ' ' + Lv.unite : ''}${extra.length ? ` (${extra.map(k => `${LIB_PHASAGE[k] || k} ${ap[k]}`).join(', ')})` : ''}`, champ: Lv.champ, unite: Lv.unite, valeur: fmt(Lv, r.v), valeurChamp: ap[Lv.champ], actuel: fmt(Lv, x0), court: LIB_PHASAGE[Lv.champ], ...(extra.length ? { champs: ap } : {}) }); }
      else if (r.chercher) acts.push({ texte: `Ou, seul : ${minus(LIB_PHASAGE[Lv.champ] || Lv.champ)} (${fmt(Lv, x0)}${Lv.unite ? ' ' + Lv.unite : ''})`, champ: Lv.champ, unite: Lv.unite, chercher: r.chercher });
      else acts.push({ texte: `${(LIB_PHASAGE[Lv.champ] || Lv.champ)} seul ne suffit pas (essayé jusqu'à ${fmt(Lv, Lv.grille(x0).slice(-1)[0] ?? x0)}${Lv.unite ? ' ' + Lv.unite : ''})`, champ: Lv.champ, unite: Lv.unite });
    }
    acts.push(...conseils(f, out, d));
    const sous = v.type === 'phase' ? 'phases de construction' : v.type === 'deseq' ? 'fléaux en construction' : type === 'mixte' ? (/^Bétonnage|^Courbure, bétonnage/.test(v.nom) ? 'charpente au bétonnage' : 'structure achevée') : 'ouvrage terminé';
    const cibles = [{ type: v.type, index: v.index }];
    if (v.type === 'acheve' && /^Diaphragme/.test(v.nom)) cibles.push({ type: 'vsp', index: 'diaphragme' });
    if (v.type === 'acheve' && /^Appareil sous âme/.test(v.nom)) cibles.push({ type: 'vsp', index: 'appareil' });
    const ou = v.type === 'phase' ? ` (${v.partie}, fibre ${v.fibre}, x = ${fx(v.x, 1)} m, à ${fx(v.t, 0)} j, âge ${fx(v.age, 0)} j)` : v.x != null && Number.isFinite(v.x) ? ` (x = ${fx(v.x, 1)} m)` : '';
    items.push({ domaine: domaine(sous), lieu: lieu(f), verification: v.nom, constat: `${fx(v.val)} pour une limite de ${fx(v.lim)}${ou}`, regle: v.ref || '', actions: acts, cibles, famille: f });
  }
  const synthese = bouges.length > 1 ? { texte: 'Valeurs cherchées ensemble pour faire passer les vérifications', champs: { ...modifs }, ok: !!finEtat && [...finEtat.ko].every(f => bloques.has(f)) } : null;
  return { items, synthese, modifs, bloques: [...bloques], trace, calculs: nCalc, duree: Date.now() - t0, epuise };
}

/**
 * Recherche sur une grille ordonnée (vérification supposée fausse puis vraie) : essais aux rangs 0, 1, 3, 7, 15… jusqu'au
 * premier succès, puis dichotomie entre le dernier échec et ce succès. La plupart des corrections ne demandent qu'un ou
 * deux pas de grille : deux ou trois calculs au lieu de cinq ou six. La valeur rendue a été vérifiée, la précédente de la
 * grille a échoué (valeur minimale sur la grille).
 */
function recherche(vals, ok) {
  if (!vals.length) return null;
  let lo = -1, hi = -1, i = 0, pas = 1;
  for (;;) {
    if (ok(vals[i])) { hi = i; break; }
    lo = i;
    if (i === vals.length - 1) return null;
    i = Math.min(vals.length - 1, i + pas); pas *= 2;
  }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ok(vals[m])) hi = m; else lo = m; }
  return vals[hi];
}

/** Dichotomie synchrone sur une grille ordonnée (vérification supposée fausse puis vraie) ; la valeur rendue a été vérifiée. */
function dichotomie(vals, ok) {
  if (!vals.length || !ok(vals[vals.length - 1])) return null;
  let lo = -1, hi = vals.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ok(vals[m])) hi = m; else lo = m; }
  return vals[hi];
}

/**
 * Recherche différée (bouton « Calculer » du panneau) : plus petite valeur du levier qui fait passer la famille, les
 * autres données étant celles du formulaire. c = action.chercher ; renvoie { champ, affiche, champs } ou null.
 */
export function chercherPhasage(data, c, { calcul = computePhasage } = {}) {
  const out = calcul(data, { annexes: false }), C = catalogue(out, data), L = C[c.levier];
  if (!L) return null;
  const vals = L.grille(L.lire(out, data));
  const v = recherche(vals, x => { try { const o = calcul({ ...data, ...(c.base || {}), ...L.appliquer(x, data) }, { annexes: false, hourdis: c.famille === 'poinc' }); const e = etat(o); return !!e && !e.ko.has(c.famille); } catch { return false; } });
  if (v == null) return null;
  const champs = L.appliquer(v, data);
  return { champ: champs[L.champ], affiche: fx(v, L.dec), champs };
}

/** Première action applicable (champ et valeur) d'un élément : c'est l'indication « → à modifier » des tableaux. */
export function indication(it) {
  const a = it.actions.find(x => (x.champ && x.valeurChamp != null) || x.champs) || it.actions.find(x => x.champ) || it.actions[0];
  if (!a) return null;
  return { texte: a.court || a.texte, champ: a.champ || null, champs: a.champs || null, actuel: a.actuel, valeur: a.valeur, valeurChamp: a.valeurChamp, unite: a.unite || '', complet: a.texte };
}

/** Index des indications par ligne de tableau : clé `${type}|${index}`. */
export const cleCible = c => `${c.type}|${c.index}`;
export function indicationsParCible(items) {
  const m = new Map();
  for (const it of items) {
    const ind = indication(it); if (!ind) continue;
    for (const c of it.cibles || []) { const k = cleCible(c); if (!m.has(k)) m.set(k, ind); }
  }
  return m;
}
