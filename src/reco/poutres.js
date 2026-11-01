/**
 * Règles de recommandation de l'onglet « Ponts à poutres » (VIPP en post-tension, PRAD en pré-tension, poutres en béton
 * armé, poutres précontraintes données par leurs valeurs ; travées indépendantes).
 *
 * Pour chaque vérification qui sort « NON » (contraintes ELS selon la classe de précontrainte, construction, transfert,
 * contrainte initiale, ELU de flexion, effort tranchant, séisme vertical, poinçonnement du hourdis, flexion et effort
 * tranchant des poutres BA, contraintes de la vérification simplifiée BP) et pour les alertes de tracé des câbles ou des
 * torons : le constat, la règle, et les données du formulaire (champs pt_* et pr_*) à modifier, avec la valeur qui
 * suffit, CHERCHÉE par recalcul du modèle (dichotomie sur une grille, les autres données restant inchangées), jamais
 * estimée par une formule.
 *
 * Le calcul complet du pont à poutres prend plusieurs secondes, dont l'essentiel pour la plaque du hourdis. Les essais
 * passent donc par `evaluerPoutres`, qui enchaîne les mêmes fonctions du moteur que computePoutres (src/beams/run.js :
 * Guyon-Massonnet, combinaisons, chaîne VIPP / PRAD par phases, poutres BA, vérification simplifiée BP) sans le hourdis
 * ni l'entretoise, quand la vérification n'en dépend pas ; la répartition transversale est gardée en cache tant que la
 * géométrie ne change pas, et la chaîne de chaque poutre n'est calculée qu'à la demande (une vérification s'arrête à la
 * première poutre qui ne passe pas ; deux poutres symétriques, aux efforts identiques à 10 chiffres près, partagent le
 * même calcul). Sous rail, ou pour le hourdis, c'est computePoutres lui-même qui est relancé.
 *
 * Paramètres liés (nombre de câbles ou de torons, f_ck, 2e famille ou torons supérieurs, hauteur, âme…) : ils sont
 * cherchés ENSEMBLE, par point fixe, comme les épaisseurs des cadres (src/reco/cadre.js) : chaque famille de
 * vérifications en échec reçoit la plus petite valeur de son paramètre qui la fait passer, les autres gardant leur
 * dernière valeur, jusqu'à ce que toutes passent ; puis chaque valeur modifiée est ramenée au minimum qui garde tout OK.
 *
 * Format (celui de src/recommandations.js et src/reco/cadre.js) : { domaine, lieu, verification, constat, regle, actions,
 * cibles } ; `cibles` situe les lignes « NON » des tableaux (web/beams_view.js) qui reçoivent l'indication « → à
 * modifier ». Une action peut porter `champs` ({ pt_x: valeur }) quand plusieurs données vont ensemble.
 */
import { parsePoutres, computePoutres } from '../beams/run.js';
import { beamDeck, beamCombinations } from '../beams/index.js';
import { tBeamULS, prestressCheck, etriersEC2 } from '../beams/design.js';
import { sectionVIPP } from '../beams/vipp_section.js';
import { chaineVIPP, traceCables, DEFAUTS_VIPP, UNITES } from '../beams/vipp.js';
import { traceTorons } from '../beams/prad.js';

const min1 = t => String(t).charAt(0).toLowerCase() + String(t).slice(1);
const fx = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : v === Infinity ? '∞' : '–');
const str = v => String(+(+v).toFixed(4));
const plafond = (v, pas) => Math.ceil(v / pas - 1e-9) * pas;
const grille = (min, max, pas) => { const o = []; for (let v = min; v <= max + 1e-9; v += pas) o.push(+v.toFixed(4)); return o; };

/** Libellés courts des champs (indications sous les « NON » ; le panneau lit les libellés complets du formulaire). */
export const LIB_POUTRES = {
  pt_nc: 'Nombre de câbles par poutre', pt_n2: 'Câbles de 2e famille', pt_unite: 'Unité de précontrainte', pt_parlit: 'Câbles par lit',
  pt_cbas: 'Axe du lit inférieur', pt_ev: 'Entraxe vertical des lits', pt_yah: 'Ancrage le plus haut', pt_sp0: 'σ_p0 à la mise en tension',
  pt_hp: 'Hauteur de la poutre h_p', pt_bta: 'Largeur du talon', pt_b0v: 'Épaisseur d\'âme b₀', pt_b0a: 'Âme sur appui (blochet)', pt_Lb: 'Longueur du blochet',
  pt_fck: 'f_ck des poutres', pt_fckh: 'f_ck du hourdis', pt_hd: 'Épaisseur du hourdis', pt_t1: 'Âge à la mise en tension (1re famille) ou au relâchement',
  pr_nt: 'Nombre de torons par poutre', pr_nsup: 'Torons supérieurs', pr_e: 'Entraxe des torons', pr_cbas: 'Axe du lit inférieur des torons',
  pr_g1n: 'Groupe gainé 1 : torons', pr_g1L: 'Groupe gainé 1 : longueur', pr_g2n: 'Groupe gainé 2 : torons', pr_g2L: 'Groupe gainé 2 : longueur', pr_hetuv: 'Durée de l\'étuvage',
  pt_P: 'Précontrainte P∞', pt_e0: 'Excentricité e₀', pt_b0: 'Âme b₀ (poutres BA)', pt_parts: 'Rectangles de la poutre', pt_H: 'Hauteur totale H',
  pt_trev: 'Épaisseur du revêtement', pt_n: 'Nombre de poutres', pt_b1: 'Entraxe des poutres', pt_rail_about: 'Appareil d\'appui → extrémité du tablier',
};

/** Unités des champs (textes « ensemble »). */
const UNITE = { pt_fck: 'MPa', pt_fckh: 'MPa', pt_sp0: 'MPa', pt_t1: 'j', pr_hetuv: 'h', pt_P: 'kN' };
const ENTIERS = /^(pt_nc|pt_n2|pt_parlit|pr_nt|pr_nsup|pr_g1n|pr_g2n|pt_t1|pt_fck|pt_fckh|pt_sp0|pt_P)$/;
/** « nombre de câbles par poutre 5 ; f_ck des poutres 45 MPa » */
export const texteChamps = ch => Object.entries(ch).map(([k, v]) => `${min1(LIB_POUTRES[k] || k)} ${k === 'pt_unite' || k === 'pt_parts' ? v : v === '' ? 'vide' : fx(+v, ENTIERS.test(k) ? 0 : (+v * 100) % 1 ? 3 : 2)}${UNITE[k] ? ' ' + UNITE[k] : ENTIERS.test(k) || k === 'pt_unite' || k === 'pt_parts' ? '' : ' m'}`).join(' ; ');

// ===================================================================================================== évaluation
/**
 * Calcul du pont à poutres pour les essais des recherches : même enchaînement que computePoutres (src/beams/run.js),
 * sans hourdis ni entretoise (sauf `local`) ; sous rail, computePoutres. `cache` : Map des répartitions transversales
 * (beamDeck) déjà calculées, par géométrie. Les grandeurs par poutre (vipp, BA, BP) sont calculées à la première lecture.
 */
export function evaluerPoutres(data, { local = false, cache = null, exact = false } = {}) {
  let inp = parsePoutres(data);
  if (inp.rail || local) return computePoutres(inp);
  if (inp.geo === 'dims') {
    const S = sectionVIPP(inp.vipp.forme, { b1: inp.b1, hd: inp.hd });
    inp = { ...inp, beam: { ...S.comp, v: S.comp.v, vp: S.comp.vp }, vippSection: S };
  }
  const cle = JSON.stringify([inp.beam, inp.n, inp.b1, inp.hd, inp.spans, inp.roadway, inp.footways, inp.lines, inp.bands, inp.extraArea, inp.nRetenue, inp.mil, inp.alphaEC, inp.geo]);
  let bd = cache && cache.get(cle);
  if (!bd) { bd = beamDeck(inp); if (cache) { if (cache.size > 12) cache.clear(); cache.set(cle, bd); } }
  const sec = bd.sec, H = sec.H || inp.beam.H || 2, v = sec.v ?? inp.beam.v, vp = sec.vp ?? inp.beam.vp;
  const spans = [...bd.bySpan.values()].map(S => {
    const mid = S.deck.beam.sectionIndex(0, 0.5), parSig = new Map();   // poutres symétriques : un seul calcul
    const beams = S.beams.map(b => {
      const sig = exact ? `k${b.k}` : signatureEfforts(b); if (!parSig.has(sig)) parSig.set(sig, {});
      const o = { k: b.k, y: b.y }, memo = parSig.get(sig);
      const lazy = (nom, f) => Object.defineProperty(o, nom, { enumerable: true, get: () => (nom in memo ? memo[nom] : (memo[nom] = f())) });
      const comb = () => memo.c || (memo.c = beamCombinations(b));
      const d = H - inp.cover;
      if ((inp.type === 'BP' || inp.type === 'PRAD') && inp.geo === 'dims') {
        lazy('vipp', () => { const c = comb(); return chaineVIPP({ ...inp.vipp, b1: inp.b1, hd: inp.hd, gExtra: 0 }, S.L, b, { elsF61: c.ELS_F61, eluF61: c.ELU_F61 }); });
      } else if (inp.type === 'BA') {
        lazy('BA', () => {
          const c = comb(), MuF = Math.max(...c.ELU_F61), MuE = Math.max(...c.ELU_EC);
          const BA = { BAEL: tBeamULS({ M: MuF, beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'BAEL' }), EC: tBeamULS({ M: MuE, beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'EC' }) };
          const secs = S.deck.beam.sections, half = secs.filter(q => q.x <= S.L / 2 + 1e-9);
          BA.travee = half.map((q, i) => {
            const VEd = 1.35 * Math.abs(b.G.Vmax?.[i] ?? 0) + 1.35 * Math.max(Math.abs(b.gr1a?.Vmax?.[i] ?? 0), Math.abs(b.gr1b?.Vmax?.[i] ?? 0));
            const As = tBeamULS({ M: Math.max(c.ELU_EC[i], c.ELU_F61[i]), beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'EC' });
            return { x: q.x, MEd: Math.max(c.ELU_EC[i], c.ELU_F61[i]), As: As.As, VEd, V: etriersEC2({ VEd, bw: inp.b0, z: 0.9 * d, fck: inp.fck, fyk: inp.fyk }) };
          });
          return BA;
        });
      } else {
        lazy('BP', () => {
          const c = comb(), base = { A: sec.A, I: sec.I, v, vp, P: inp.P, e0: inp.e0, Mmin: b.G.Mmin[mid], fck: inp.fck };
          const ecQP = prestressCheck({ ...base, Mmax: b.G.Mmax[mid], code: 'EC' }), ecCar = prestressCheck({ ...base, Mmax: c.ELS_EC[mid], code: 'EC' });
          return { BPEL: prestressCheck({ ...base, Mmax: c.ELS_F61[mid], code: 'BPEL' }),
            EC: { ...ecQP, enChargeCar: ecCar.enCharge, ok: ecQP.enCharge.inf >= -1e-6 && ecQP.aVide.sup >= -1e-6 && ecCar.enCharge.sup <= ecCar.sigClim + 1e-6 } };
        });
      }
      return o;
    });
    return { L: S.L, beams };
  });
  return { inp, sec, spans, hourdis: null, entretoise: null, rail: false, partiel: true };
}

/** Signature des efforts d'une poutre : deux poutres symétriques (même signature) ont la même chaîne de calcul. */
export const signatureEfforts = b => JSON.stringify(Object.entries(b).filter(([k, x]) => x && typeof x === 'object' && !Array.isArray(x) && x.Mmax)
  .map(([k, x]) => [k, ...[x.Mmax, x.Vmax || [], x.Mmin || [], x.Rmax || []].map(a => a.map(q => +q.toPrecision(10)))]));

// ===================================================================================================== familles
/** Vérifications ELS de la chaîne VIPP / PRAD, par famille (nom de la vérification, src/beams/vipp.js). */
const RE = {
  sigpm0: /^Contrainte initiale/, constrT: /^Construction : traction/, constrC: /^Construction : compression/,
  traction: /^Décompression|^Fréquente : traction|^BPEL.*traction|^Séisme vertical.*traction/,
  compP: /^Caractéristique : compression poutre|^Quasi permanente : compression|^BPEL.*: compression|^Séisme vertical.*compression/,
  compH: /^Caractéristique : compression hourdis/,
};
const verifsOk = re => v => v.verifs.every(q => !re.test(q.nom) || q.ok);
/** Alertes de tracé (câbles ou torons) : nature de l'alerte d'après son texte (src/beams/vipp.js traceCables, prad.js). */
const ALERTES = [
  { cle: 'ev', re: /^entraxe vertical des lits/ }, { cle: 'largeurLit', re: /gaines par lit demandent/ }, { cle: 'litSup', re: /^le lit supérieur .* sort du talon/ },
  { cle: 'enrob', re: /^enrobage de la gaine inférieure/ }, { cle: 'ancrageHaut', re: /^ancrage supérieur trop près/ },
  { cle: 'pradEh', re: /^entraxe horizontal/ }, { cle: 'pradLitSup', re: /^lit supérieur à .* hors du talon/ }, { cle: 'pradGaine', re: /de torons gainés : au-delà de la moitié/ },
  { cle: 'pradRepart', re: /^répartition des torons gainés incomplète/ },
];
const natureAlerte = t => (ALERTES.find(a => a.re.test(t)) || { cle: 'autre' }).cle;
/**
 * Alertes de tracé d'un jeu de données, par les fonctions du moteur (traceCables, traceTorons) sans la chaîne de calcul :
 * quelques millisecondes ; elles ne dépendent pas de la portée (VIPP) ou seulement par le moment de poids propre (PRAD).
 */
export function alertesTrace(data) {
  try {
    const inp = parsePoutres(data);
    if (inp.geo !== 'dims' || !(inp.type === 'BP' || inp.type === 'PRAD')) return [];
    const L = Math.max(...inp.spans), f = inp.vipp.forme;
    if (inp.type === 'PRAD') { const S = sectionVIPP(f, { b1: inp.b1, hd: inp.hd }); return traceTorons(inp.vipp.adherence, L, f, { fckP: inp.vipp.beton.fckP, t1: inp.vipp.dates.t1, Mg: S.poutre.A * 25 * L * L / 8 }, S).alerte; }
    return traceCables({ ...DEFAUTS_VIPP.cables, ...inp.vipp.cables }, L, f).alerte;
  } catch (e) { return [e.message]; }
}
const blochet = v => (v.S.forme.Lb ?? 0) + 1e-9;
const alertes = r => [...new Set(r.spans.flatMap(s => (s.beams[0] && s.beams[0].vipp ? s.beams[0].vipp.trace.alerte : [])))];

/**
 * Familles de vérifications. test(b) : la poutre b passe ; unique : identique pour toutes les poutres (construction,
 * tracé) ; local : vérification du hourdis (calcul complet).
 */
function familles(mode) {
  if (mode === 'vipp') return [
    ...ALERTES.map(a => ({ cle: 'trace:' + a.cle, unique: true, test: b => !b.vipp.trace.alerte.some(t => a.re.test(t)) })),
    { cle: 'sigpm0', unique: true, test: b => verifsOk(RE.sigpm0)(b.vipp) },
    { cle: 'constrT', unique: true, test: b => verifsOk(RE.constrT)(b.vipp) },
    { cle: 'constrC', unique: true, test: b => verifsOk(RE.constrC)(b.vipp) },
    { cle: 'traction', test: b => verifsOk(RE.traction)(b.vipp) },
    { cle: 'compP', test: b => verifsOk(RE.compP)(b.vipp) },
    { cle: 'compH', test: b => verifsOk(RE.compH)(b.vipp) },
    { cle: 'elu', test: b => b.vipp.elu.every(e => e.ok) },
    // effort tranchant : dans le blochet (âme épaissie, x ≤ L_b) et en section courante, qui ne dépendent pas des mêmes données
    { cle: 'tranchantA', test: b => b.vipp.tranchant.every(t => t.ok || t.x > blochet(b.vipp)) },
    { cle: 'tranchantC', test: b => b.vipp.tranchant.every(t => t.ok || t.x <= blochet(b.vipp)) },
    { cle: 'seismeElu', test: b => !b.vipp.seismeV || b.vipp.seismeV.eluOk },
  ];
  if (mode === 'BA') return [
    { cle: 'flexBA', test: b => b.BA.EC.As != null && (!b.BA.BAEL || b.BA.BAEL.As != null) && (b.BA.travee || []).every(t => t.As != null) },
    { cle: 'tranchBA', test: b => (b.BA.travee || []).every(t => t.V.ok) },
  ];
  if (mode === 'BP') return [
    { cle: 'tracBP', test: (b, r) => { const P = b.BP.BPEL, E = b.BP.EC; return (!P || (P.enCharge.inf >= P.sigTlim - 1e-6 && P.Pmin <= r.inp.P + 1e-6)) && E.enCharge.inf >= -1e-6; } },
    { cle: 'videBP', test: b => { const P = b.BP.BPEL, E = b.BP.EC; return (!P || P.aVide.sup >= P.sigTlim - 1e-6) && E.aVide.sup >= -1e-6; } },
    { cle: 'compBP', test: b => { const P = b.BP.BPEL, E = b.BP.EC; return (!P || Math.max(P.aVide.inf, P.enCharge.sup) <= P.sigClim + 1e-6) && E.enChargeCar.sup <= E.sigClim + 1e-6; } },
  ];
  return [];
}
/**
 * Verdict d'une famille sur un résultat (computePoutres ou evaluerPoutres) : vrai si toutes les vérifications de la famille
 * passent. Un résultat absent ou en erreur n'est jamais accepté (hourdis, déformations). Familles `unique` (construction,
 * σ_pm0, tracé : identiques pour les poutres d'une même travée, mais fonction de la portée) : une poutre par travée.
 * prio : Map facultative famille → [travée, poutre] de la dernière poutre en échec, testée en premier.
 */
export function familleOk(r, f, prio = null) {
  try {
    if (!r) return false;
    if (f.cle === 'poinc') return !!(r.hourdis && !r.hourdis.erreur && r.hourdis.poinc && r.hourdis.poinc.ok !== false);
    if (f.global) return !!f.testR(r);
    const liste = [];
    r.spans.forEach((s, si) => (f.unique ? s.beams.slice(0, 1) : s.beams).forEach(b => liste.push([si, b])));
    if (!liste.length) return false;
    const p = prio && prio.get(f.cle);
    if (p) liste.sort((a, b) => (a[0] === p[0] && a[1].k === p[1] ? -1 : 0) - (b[0] === p[0] && b[1].k === p[1] ? -1 : 0));
    for (const [si, b] of liste) if (!f.test(b, r)) { if (prio) prio.set(f.cle, [si, b.k]); return false; }
    return true;
  } catch { return false; }
}
export { familles, FAM_RAIL };

/** Déformations et vibrations sous rail (EN 1990 A2.4.4, EN 1991-2 § 6.5.4.5.2) : vérifications du tablier entier. */
/** Déformations de chaque travée ; une travée sans résultat ou en erreur rend la liste invalide (null) : critère non vérifié. */
const defos = r => { const l = r.spans.map(s => s.rail && s.rail.deformations); return l.every(D => D && !D.erreur) ? l : null; };
const transvOk = (T, x) => x.thetaH <= T.lim.thetaH + 1e-12 || x.rayon >= T.lim.rayon;
const FAM_RAIL = [
  { cle: 'railFleche', global: true, testR: r => !!defos(r) && defos(r).every(D => D.fleches.every(f => f.ok) && D.confort.every(c => c.horsDomaine || c.ok)) },
  { cle: 'railGauche', global: true, testR: r => !!defos(r) && defos(r).every(D => D.gauche.ok) },
  { cle: 'railDH', global: true, testR: r => !!defos(r) && defos(r).every(D => D.extremites.every(e => e.okH)) },
  { cle: 'railDV', global: true, testR: r => !!defos(r) && defos(r).every(D => D.extremites.every(e => e.okV !== false)) },
  { cle: 'railTransv', global: true, testR: r => !!defos(r) && defos(r).every(D => !D.transversal || D.transversal.rows.every(x => transvOk(D.transversal, x) && (x.fh == null || x.fh >= D.transversal.fh0))) },
];

// ===================================================================================================== paramètres
/** Paramètre numérique sur une grille régulière (vers le haut ou vers le bas depuis la valeur actuelle). */
function num(champ, actuel, { pas, min = -Infinity, max = Infinity, vers = 'haut', dec = 2, unite = 'm', entier = false }) {
  if (!Number.isFinite(actuel)) return null;
  const vals = vers === 'haut' ? grille(entier ? actuel + 1 : plafond(actuel + pas / 100, pas), max, pas)
    : grille(Number.isFinite(min) ? plafond(min, pas) : 0, entier ? actuel - 1 : Math.floor((actuel - pas / 100) / pas) * pas, pas).filter(x => x >= min - 1e-9).reverse();
  if (!vals.length) return null;
  return { champ, actuel, vals, vers, pas, min: vers === 'haut' ? vals[0] : vals[vals.length - 1], max: vers === 'haut' ? vals[vals.length - 1] : vals[0], unite, regulier: true,
    ecrire: v => str(v), aff: v => fx(v, entier ? 0 : dec), affActuel: fx(actuel, entier ? 0 : dec) };
}
/** Paramètre à valeurs listées (unité de précontrainte, rectangles…) : vals = indices, ecrire / aff selon la liste. */
const liste = (champ, actuel, items, { unite = '', affActuel = String(actuel) } = {}) => (items.length ? {
  champ, actuel, vals: items.map((x, i) => i), vers: 'haut', unite, regulier: false, ecrire: i => items[i].champ, aff: i => items[i].aff, affActuel } : null);

/** Hauteur de la poutre selon la définition de la section (dimensions, rectangles, valeurs). */
function hauteurPoutre(inp, d, val) {   // d : pt_parts courant
  if (inp.geo === 'dims') return num('pt_hp', val('pt_hp', inp.vipp.forme.hp), { pas: 0.05, max: val('pt_hp', inp.vipp.forme.hp) + 1.0 });
  if (inp.geo === 'rect' && inp.beam.parts) {
    const parts = String(d.pt_parts).split(';').map(t => t.trim()).filter(Boolean).map(t => t.split(/[\s,]+/).map(Number));
    const i = parts.reduce((m, q, j) => (q[1] > parts[m][1] ? j : m), 0), h0 = parts[i][1];
    const items = grille(plafond(h0 + 0.001, 0.05), h0 + 1.0, 0.05).map(h => ({ champ: parts.map((q, j) => `${q[0]} ${j === i ? str(h) : q[1]}`).join(' ; '), aff: `${fx(h)} m (rectangle ${i + 1}, ${fx(parts[i][0])} m de large)` }));
    const p = liste('pt_parts', h0, items, { unite: '', affActuel: `${fx(h0)} m (rectangle ${i + 1})` });
    return p && { ...p, texteChamp: 'hauteur du rectangle le plus haut (âme)' };
  }
  return num('pt_H', val('pt_H', inp.beam.H), { pas: 0.05, max: val('pt_H', inp.beam.H) + 1.0 });
}

/**
 * Paramètres d'une famille, du plus direct au plus coûteux. ctx : { mode, prad, inp, get(champ), val(champ, défaut),
 * fibreSup, modeBA, L, vp }.
 */
function parametres(cle, ctx) {
  const { prad, inp, val, get } = ctx, d = { pt_unite: get('pt_unite'), pt_parts: get('pt_parts'), pr_hetuv: get('pr_hetuv') }, V = inp.vipp, C = V && V.cables, F = V && V.forme, A = V && V.adherence;
  const fck = val('pt_fck', V && inp.geo === 'dims' ? V.beton.fckP : inp.fck), fckh = val('pt_fckh', V ? V.beton.fckH : 30);
  const P = {
    nc: () => num('pt_nc', val('pt_nc', C.nc), { pas: 1, max: 12, entier: true, unite: '' }),
    nt: () => num('pr_nt', val('pr_nt', A.nt), { pas: 1, max: val('pr_nt', A.nt) + 40, entier: true, unite: '' }),
    unite: () => { const u0 = d.pt_unite || C.unite, a0 = (UNITES[u0] || UNITES['12T15S']).Ap; return liste('pt_unite', u0, Object.entries(UNITES).filter(([, u]) => u.Ap > a0 + 1e-12).sort((a, b) => a[1].Ap - b[1].Ap).map(([n]) => ({ champ: n, aff: n }))); },
    hp: () => hauteurPoutre(inp, d, val),
    fck: () => num('pt_fck', fck, { pas: 5, max: 60, unite: 'MPa', dec: 0 }),
    fckh: () => num(inp.geo === 'dims' ? 'pt_fckh' : 'pt_fck', inp.geo === 'dims' ? fckh : fck, { pas: 5, max: 60, unite: 'MPa', dec: 0 }),
    hd: () => num('pt_hd', val('pt_hd', inp.hd), { pas: 0.02, max: val('pt_hd', inp.hd) + 0.20 }),
    n2up: () => num('pt_n2', val('pt_n2', C.n2), { pas: 1, max: val('pt_nc', C.nc) - 1, entier: true, unite: '' }),
    n2down: () => num('pt_n2', val('pt_n2', C.n2), { pas: 1, min: 0, vers: 'bas', entier: true, unite: '' }),
    nsup: () => num('pr_nsup', val('pr_nsup', A.nsup), { pas: 1, max: val('pr_nsup', A.nsup) + 10, entier: true, unite: '' }),
    t1: () => num('pt_t1', val('pt_t1', V.dates.t1), { pas: 1, max: val('pt_t2', V.dates.t2) - 1, entier: true, unite: 'j' }),
    hetuv: () => (A && A.dT > 0 ? num('pr_hetuv', val('pr_hetuv', +d.pr_hetuv || 0), { pas: 2, max: 48, entier: false, dec: 0, unite: 'h' }) : null),
    b0a: () => num('pt_b0a', val('pt_b0a', F.b0a), { pas: 0.05, max: Math.max(val('pt_bta', F.bta), 0.30) }),
    b0v: () => num('pt_b0v', val('pt_b0v', F.b0), { pas: 0.02, max: 0.40 }),
    Lb: () => num('pt_Lb', val('pt_Lb', F.Lb), { pas: 0.5, max: ctx.L / 2 }),
    ev: () => num('pt_ev', val('pt_ev', C.ev), { pas: 0.01, max: 0.40 }),
    parlitDown: () => num('pt_parlit', val('pt_parlit', C.parLit), { pas: 1, min: 1, vers: 'bas', entier: true, unite: '' }),
    parlitUp: () => num('pt_parlit', val('pt_parlit', C.parLit), { pas: 1, max: 4, entier: true, unite: '' }),
    bta: () => num('pt_bta', val('pt_bta', F.bta), { pas: 0.05, max: 1.20 }),
    hpi: () => num('pt_hpi', val('pt_hpi', F.hpi), { pas: 0.01, max: val('pt_hpi', F.hpi) + 0.30 }),
    cbas: () => num('pt_cbas', val('pt_cbas', C.cBas), { pas: 0.01, max: 0.40 }),
    yah: () => num('pt_yah', val('pt_yah', C.yaHaut), { pas: 0.01, min: val('pt_yab', C.yaBas) + 0.05, vers: 'bas' }),
    pre: () => num('pr_e', val('pr_e', A.ev), { pas: 0.005, max: 0.10, dec: 3 }),
    g2n: () => num('pr_g2n', val('pr_g2n', A.groupes[1]?.n ?? 0), { pas: 1, min: 0, vers: 'bas', entier: true, unite: '' }),
    g1n: () => num('pr_g1n', val('pr_g1n', A.groupes[0]?.n ?? 0), { pas: 1, min: 0, vers: 'bas', entier: true, unite: '' }),
    sp0: () => (C.sigP0 ? num('pt_sp0', val('pt_sp0', C.sigP0), { pas: 10, min: 1000, vers: 'bas', dec: 0, unite: 'MPa' }) : null),
    b0: () => num('pt_b0', val('pt_b0', inp.b0), { pas: 0.05, max: Math.max(val('pt_b0', inp.b0) + 0.5, 0.6) }),
    P: () => num('pt_P', val('pt_P', inp.P), { pas: 100, max: Math.max(3 * val('pt_P', inp.P), 2000), dec: 0, unite: 'kN' }),
    Pdown: () => num('pt_P', val('pt_P', inp.P), { pas: 100, min: 100, vers: 'bas', dec: 0, unite: 'kN' }),
    e0down: () => { const q = num('pt_e0', val('pt_e0', inp.e0), { pas: 0.05, min: -Math.max((ctx.vp ?? 1) - 0.10, 0.05), vers: 'bas' }); return q && { ...q, texteChamp: 'excentricité e₀ (câble descendu)' }; },
    e0up: () => { const q = num('pt_e0', val('pt_e0', inp.e0), { pas: 0.05, max: 0 }); return q && { ...q, texteChamp: 'excentricité e₀ (câble remonté, valeur moins négative)' }; },
    trev: () => num('pt_trev', val('pt_trev', inp.local.tRev), { pas: 0.01, max: 0.20 }),
    about: () => (inp.rail && inp.rail.about > 0 ? num('pt_rail_about', val('pt_rail_about', inp.rail.about), { pas: 0.05, min: 0.05, vers: 'bas' }) : null),
  };
  const L = {
    'trace:ev': ['ev'], 'trace:largeurLit': ['parlitDown', 'bta'], 'trace:litSup': ['parlitUp', 'hpi', 'bta'], 'trace:enrob': ['cbas'], 'trace:ancrageHaut': ['yah', 'hp'],
    'trace:pradEh': ['pre'], 'trace:pradLitSup': ['bta', 'hpi'], 'trace:pradGaine': ['g2n', 'g1n'], 'trace:pradRepart': [], 'trace:autre': [],
    sigpm0: ['sp0'],
    constrT: ctx.fibreSup ? (prad ? ['nsup', 't1'] : ['n2up', 't1']) : (prad ? ['nt'] : ['n2down', 'nc']),
    constrC: prad ? ['fck', 'hetuv', 't1'] : ['fck', 't1', 'n2up'],
    traction: prad ? ['nt', 'hp'] : ['nc', 'unite', 'hp'],
    compP: ['fck', 'hp'], compH: ['fckh', 'hd'], elu: ['hp', 'fckh', 'fck'],
    tranchantA: ['b0a', 'fck', 'hp'], tranchantC: ['b0v', 'Lb', 'fck', 'hp'],
    seismeElu: prad ? ['nt', 'hp'] : ['nc', 'hp'],
    flexBA: ['hp', ...(ctx.modeBA === 'âme' ? ['b0'] : ctx.modeBA === 'table' ? ['hd'] : []), 'fck'], tranchBA: ['b0', 'fck', 'hp'],
    tracBP: ['P', 'e0down'], videBP: ['e0up', 'Pdown'], compBP: ['fck'],
    poinc: ['hd', 'fckh', 'trev'],
    railFleche: ['hp'], railGauche: ['hp'], railDH: ['hp'], railDV: ['about', 'hp'], railTransv: ['hd'],
  }[cle] || [];
  return L.map(k => { try { return P[k](); } catch { return null; } }).filter(Boolean);
}

// ===================================================================================================== recherches
class HorsBudget extends Error {}
/** Dichotomie sur une grille dans l'ordre de modification croissante (vérification supposée fausse puis vraie). */
async function dicho(vals, ok) {
  if (!vals.length || !(await ok(vals[vals.length - 1]))) return null;
  let lo = -1, hi = vals.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (await ok(vals[m])) hi = m; else lo = m; }
  return vals[hi];
}

const LIB_FAM = {
  sigpm0: 'contrainte initiale de précontrainte', constrT: 'traction en construction', constrC: 'compression en construction', traction: 'décompression et tractions en service',
  compP: 'compression des poutres', compH: 'compression du hourdis', elu: 'ELU de flexion', tranchantA: 'effort tranchant dans le blochet', tranchantC: 'effort tranchant en section courante', seismeElu: 'ELU sous séisme vertical',
  flexBA: 'flexion ELU des poutres BA', tranchBA: 'effort tranchant des poutres BA', tracBP: 'tractions (précontrainte insuffisante)', videBP: 'traction à vide (fibre supérieure)',
  compBP: 'compressions', poinc: 'poinçonnement du hourdis', railFleche: 'flèche et confort sous rail', railGauche: 'gauche du tablier',
  railDH: 'déplacement δH des extrémités', railDV: 'soulèvement δV des extrémités', railTransv: 'déformation et fréquence transversales',
};
const libFam = cle => LIB_FAM[cle] || (cle.startsWith('trace:') ? 'tracé des câbles ou des torons' : cle);

/** Texte d'une action sur un paramètre : « Augmenter … : 4 → 5 ». */
function actionParam(p, v, suffixe = '') {
  const lib = LIB_POUTRES[p.champ] || p.champ, verbe = !p.regulier ? 'Passer' : p.vers === 'haut' ? 'Augmenter' : 'Réduire';
  const aff = p.aff(v), unite = p.unite ? ' ' + p.unite : '';
  return { texte: `${verbe} : ${p.texteChamp || min1(lib)} de ${p.affActuel}${p.regulier ? unite : ''} à ${aff}${p.regulier ? unite : ''}${suffixe ? ' — ' + suffixe : ''}`,
    champ: p.champ, unite: p.regulier ? p.unite : '', valeur: aff, valeurChamp: p.ecrire(v), court: LIB_POUTRES[p.champ] || p.champ, actuel: p.affActuel };
}

/**
 * Recommandations d'un calcul du pont à poutres. out : résultat de computePoutres ; data : données du formulaire qui
 * l'ont produit. opts.budget : temps accordé aux recherches [ms] (au-delà, la recherche est laissée au bouton « Calculer »
 * du panneau) ; onProgress(n) : nombre de calculs faits ; annule() → true : arrêt (un nouveau calcul a été lancé).
 * Asynchrone : rend la main entre deux essais (l'interface reste vivante).
 */
export async function recommandationsPoutres(out, data, { budget = 45000, onProgress = null, annule = null, maintenant = Date.now } = {}) {   // maintenant : horloge du budget (injectable pour les tests)
  const t0 = maintenant(), d = { ...data }, items = [], cache = new Map(), memo = new Map();
  const inp = out.inp, vippMode = out.spans.some(s => s.beams[0] && s.beams[0].vipp);
  const mode = vippMode ? 'vipp' : inp.type === 'BA' ? 'BA' : 'BP', prad = vippMode && inp.type === 'PRAD';
  const nomType = mode === 'vipp' ? (prad ? 'Poutres PRAD (pré-tension)' : 'Poutres VIPP (post-tension)') : mode === 'BA' ? 'Poutres en béton armé' : 'Poutres précontraintes (vérification simplifiée)';
  let nCalc = 0;
  const dansBudget = () => maintenant() - t0 < budget;
  const essai = async (modifs, opt = {}) => {
    const cle = JSON.stringify([modifs, !!opt.local, !!opt.exact]);
    if (memo.has(cle)) return memo.get(cle);
    nCalc++; if (onProgress) onProgress(nCalc);
    await new Promise(r => setTimeout(r, 0));
    if (annule && annule()) throw new Error('recherche interrompue');
    let r = null; try { r = evaluerPoutres({ ...d, ...modifs }, { cache, ...opt }); } catch { r = null; }
    if (memo.size > 60) memo.clear();
    memo.set(cle, r); return r;
  };
  // sous rail, les familles de déformations ne sont cherchées que si le calcul de base les a produites sans erreur (sinon
  // une recommandation signale le calcul impossible)
  const defosBase = out.rail ? defos(out) : null;
  const fams = [...familles(mode), ...(out.rail && defosBase ? FAM_RAIL : [])], prio = new Map();
  const famOk = (r, f) => familleOk(r, f, prio);
  const permises = new Set(alertes(out).map(natureAlerte)); permises.delete('autre');
  const alertesOk = r => { try { return mode !== 'vipp' || alertes(r).every(t => permises.has(natureAlerte(t))); } catch { return false; } };

  // ------------------------------------------------------------------ constats de base
  const echecs = fams.filter(f => !famOk(out, f));
  const poincKo = out.hourdis && out.hourdis.poinc && out.hourdis.poinc.ok === false;
  const constrT0 = []; out.spans.forEach(s => s.beams.forEach(b => b.vipp && b.vipp.verifs.forEach(q => { if (RE.constrT.test(q.nom) && !q.ok) constrT0.push(q); })));
  const modesBA = out.spans.flatMap(s => s.beams.map(b => (b.BA ? `${b.BA.EC.mode} ${b.BA.BAEL ? b.BA.BAEL.mode : ''}` : ''))).join(' ');
  const ctxDe = cur => ({
    mode, prad, inp, L: Math.max(...inp.spans), vp: inp.beam.vp,
    get: c => (cur[c] != null ? cur[c] : d[c]), val: (c, def) => (cur[c] != null && cur[c] !== '' ? +cur[c] : def),
    fibreSup: constrT0.some(q => /poutre sup|hourdis/.test(q.nom)) || !constrT0.length,
    modeBA: /âme/.test(modesBA) ? 'âme' : /table/.test(modesBA) ? 'table' : '',
  });
  const ctx0 = ctxDe({});
  // familles en échec dont la recherche ensemble a un sens ; les autres (alerte sans paramètre) restent signalées et
  // sont ignorées par le critère « tout passe »
  const joints = echecs.filter(f => parametres(f.cle, ctx0).length), ignorees = new Set(echecs.filter(f => !joints.includes(f)));
  const allOk = r => !!r && fams.every(f => ignorees.has(f) || famOk(r, f)) && alertesOk(r);

  /** Valeurs géométriquement admissibles de p (pas de nouvelle alerte de tracé : contrôle du moteur, sans calcul). */
  const admissibles = (p, base = {}) => (mode !== 'vipp' ? p.vals : p.vals.filter(x => alertesTrace({ ...d, ...base, [p.champ]: p.ecrire(x) }).every(t => permises.has(natureAlerte(t)))));
  /** Recherche laissée au bouton « Calculer » du panneau : candidats admissibles et même critère que `cherche`. */
  const aChercher = (f, p) => {
    const local = f.cle === 'poinc', vals = p.regulier ? admissibles(p) : [];
    return vals.length ? { champ: p.champ, min: Math.min(...vals), max: Math.max(...vals), pas: p.pas, vers: p.vers, depart: vals[0], valeurs: vals.map(Number), calcul: 'poutres', local, base: {},
      verifie: r => famOk(r, f) && (local || alertesOk(r)) } : null;
  };
  /** Plus petite modification du paramètre p (autres modifications : base) qui fait passer la famille f. */
  const cherche = async (f, p, base = {}, { tous = false } = {}) => {
    if (!dansBudget()) return { budget: true };
    const local = f.cle === 'poinc';
    // valeurs géométriquement admissibles (pas de nouvelle alerte de tracé : contrôle du moteur, sans calcul) — sans ce
    // filtre, le haut de la grille (12 câbles qui sortent du talon) rompt la monotonie de la dichotomie
    const vals = admissibles(p, base);
    if (!vals.length) return { valeur: null, vide: true };
    let v;
    try { v = await dicho(vals, async x => {
      if (maintenant() - t0 > 1.5 * budget) throw new HorsBudget();   // essais longs (pont-rail : calcul complet à chaque essai)
      const r = await essai({ ...base, [p.champ]: p.ecrire(x) }, { local });
      return !!r && (tous ? allOk(r) : famOk(r, f) && (local || alertesOk(r)));
    }); } catch (e) { if (e instanceof HorsBudget) return { budget: true }; throw e; }
    return { valeur: v, max: vals[vals.length - 1] };
  };

  // ------------------------------------------------------------------ 1. chaque famille seule (les autres données inchangées)
  const seules = new Map();   // cle → [{ p, res }]
  const chercheSeule = async (f, p) => {
    const l = seules.get(f.cle) || []; seules.set(f.cle, l);
    const deja = l.find(x => x.p.champ === p.champ); if (deja) return deja.res;
    const res = await cherche(f, p); l.push({ p, res }); return res;
  };
  for (const f of joints) for (const p of parametres(f.cle, ctx0)) { const r = await chercheSeule(f, p); if (r.valeur != null || r.budget) break; }

  // ------------------------------------------------------------------ 2. ensemble, par point fixe
  let cur = {}, jointOk = !joints.length, bloque = null, horsBudget = false;
  if (joints.length) {
    for (const f of joints) {
      const s = (seules.get(f.cle) || []).find(x => x.res.valeur != null); if (!s) continue;
      const w = s.p.ecrire(s.res.valeur), c = s.p.champ;
      if (cur[c] == null) cur[c] = w;
      else if (s.p.regulier && (s.p.vers === 'haut' ? +w > +cur[c] : +w < +cur[c])) cur[c] = w;
    }
    for (let tour = 0; tour < 6 && !jointOk && !bloque; tour++) {
      if (!dansBudget()) { horsBudget = true; break; }
      const r = await essai(cur);
      if (allOk(r)) { jointOk = true; break; }
      if (!r) { bloque = { cle: 'calcul' }; break; }
      for (const f of fams) {
        if (ignorees.has(f) || famOk(r, f)) continue;
        if (!dansBudget()) { horsBudget = true; break; }
        let trouve = false;
        for (const p of parametres(f.cle, ctxDe(cur))) {
          const res = await cherche(f, p, cur);
          if (res.valeur != null) { cur = { ...cur, [p.champ]: p.ecrire(res.valeur) }; trouve = true; break; }
          if (res.budget) { horsBudget = true; break; }
        }
        if (horsBudget) break;
        if (!trouve) { bloque = f; break; }
        break;   // une famille par essai : la suivante est revue sur le calcul mis à jour
      }
      if (horsBudget) break;
    }
    // descente : chaque valeur modifiée ramenée au minimum qui garde TOUTES les vérifications (l'ordre de la montée compte)
    if (jointOk && Object.keys(cur).length > 1) {
      for (let passe = 0; passe < 2 && dansBudget(); passe++) {
        let change = false;
        for (const c of Object.keys(cur)) {
          if (!dansBudget()) break;
          // descripteur du paramètre depuis les données d'origine, dans le sens où la montée l'a déplacé
          const p0 = fams.flatMap(f => parametres(f.cle, ctx0)).find(p => p.champ === c && p.regulier && (p.vers === 'haut' ? +cur[c] > p.actuel : +cur[c] < p.actuel));
          if (!p0) continue;
          const v1 = +cur[c], vals = [p0.actuel, ...p0.vals.filter(x => (p0.vers === 'haut' ? x < v1 - 1e-9 : x > v1 + 1e-9)), v1];
          const autres = Object.fromEntries(Object.entries(cur).filter(([k]) => k !== c));
          const v = await dicho(vals, async x => (x === p0.actuel ? allOk(await essai(autres)) : allOk(await essai({ ...autres, [c]: str(x) }))));
          if (v != null && Math.abs(v - v1) > 1e-9) { if (Math.abs(v - p0.actuel) < 1e-9) delete cur[c]; else cur[c] = str(v); change = true; }
        }
        if (!change) break;
      }
    }
    // contrôle final sans partage des poutres symétriques
    if (jointOk && Object.keys(cur).length) jointOk = allOk(await essai(cur, { exact: true }));
  }
  const calculsEnsemble = nCalc;
  const ensemble = jointOk && Object.keys(cur).length ? cur : null;
  const texteEnsemble = ensemble ? texteChamps(ensemble) : '';

  // ------------------------------------------------------------------ 3. actions d'une famille
  const actionsFamille = async f => {
    const acts = [], ps = parametres(f.cle, ctx0), l = seules.get(f.cle) || [];
    const sol = l.find(x => x.res.valeur != null);
    const autresEchecs = async (p, v) => {
      const r = await essai({ [p.champ]: p.ecrire(v) }, { local: f.cle === 'poinc' });
      return r ? fams.filter(g => g !== f && famOk(out, g) && !famOk(r, g)).map(g => libFam(g.cle)) : ['calcul impossible'];
    };
    // la valeur seule fait passer la vérification ; si elle en fait tomber d'autres, l'ensemble passe devant (c'est lui que
    // l'indication « → à modifier » applique)
    // contrôle fait même budget épuisé : sans lui, la valeur seule pourrait devenir l'indication appliquée alors qu'elle
    // fait tomber une autre vérification
    const nouv = sol ? await autresEchecs(sol.p, sol.res.valeur) : [];
    const aEns = ensemble && !(sol && Object.keys(ensemble).length === 1 && ensemble[sol.p.champ] === sol.p.ecrire(sol.res.valeur));
    const actEns = aEns ? { texte: `Appliquer l'ensemble cherché par recalcul pour que toutes les vérifications des poutres passent : ${texteEnsemble}`, champs: { ...ensemble }, valeur: 'ensemble', court: texteEnsemble } : null;
    if (actEns && (!sol || nouv.length)) acts.push(actEns);
    if (sol) {
      const a = actionParam(sol.p, sol.res.valeur, `valeur cherchée par recalcul de toutes les poutres, les autres données restant inchangées${nouv.length ? ` ; fait apparaître : ${nouv.join(', ')} — d'où l'ensemble ci-dessus` : ''}`);
      acts.push(acts.length ? { ...a, texte: 'Ou ' + a.texte.replace(/^./, c => c.toLowerCase()) } : a);
    }
    if (actEns && sol && !nouv.length) acts.push({ ...actEns, texte: 'Ou ' + actEns.texte.replace(/^./, c => c.toLowerCase()) });
    else if (!sol && !ensemble && joints.includes(f) && (bloque || horsBudget))
      acts.push({ texte: horsBudget ? 'Recherche d\'ensemble interrompue (temps de calcul) : utiliser « Calculer » sur les actions ci-dessous' : `Aucune combinaison des paramètres essayés ne fait tout passer (bloqué sur : ${libFam(bloque.cle || '')}) : changer de conception (voir ci-dessous)` });
    for (const p of ps) {
      if (sol && p.champ === sol.p.champ) continue;
      const deja = l.find(x => x.p.champ === p.champ);
      let res = deja ? deja.res : null;
      if (!res && dansBudget()) res = await chercheSeule(f, p);
      if (res && res.valeur != null) acts.push({ ...actionParam(p, res.valeur, 'seul, les autres données restant inchangées'), texte: 'Ou ' + actionParam(p, res.valeur, 'seul, les autres données restant inchangées').texte.replace(/^./, c => c.toLowerCase()) });
      else if (res && res.valeur === null) acts.push({ texte: `${(LIB_POUTRES[p.champ] || p.champ)} : ${res.vide ? 'aucune autre valeur n\'est compatible avec l\'encombrement du talon (alertes de tracé)' : `ne suffit pas seul (essayé jusqu'à ${p.aff(res.max)}${p.regulier && p.unite ? ' ' + p.unite : ''}${res.max !== p.vals[p.vals.length - 1] ? ', au-delà le tracé ne loge plus dans le talon' : ''})`}`, champ: p.champ, unite: p.unite });
      else if (p.regulier && aChercher(f, p)) acts.push({ texte: `Ou modifier : ${min1(LIB_POUTRES[p.champ] || p.champ)} (${p.affActuel}${p.unite ? ' ' + p.unite : ''})`, champ: p.champ, unite: p.unite, court: LIB_POUTRES[p.champ], actuel: p.affActuel,
        chercher: aChercher(f, p) });
      else acts.push({ texte: `Ou modifier : ${min1(LIB_POUTRES[p.champ] || p.champ)}`, champ: p.champ, court: LIB_POUTRES[p.champ] });
    }
    return acts;
  };
  // ------------------------------------------------------------------ 4. éléments, par vérification « NON »
  const nS = out.spans.length, ouT = si => (nS > 1 ? `, travée de ${fx(out.spans[si].L)} m` : '');
  const listeP = ks => (ks.length > 1 ? `poutres ${[...new Set(ks)].sort((a, b) => a - b).map(k => k + 1).join(', ')}` : `poutre ${ks[0] + 1}`);
  const cacheActs = new Map(), acts = async f => { if (!cacheActs.has(f.cle)) cacheActs.set(f.cle, await actionsFamille(f)); return cacheActs.get(f.cle).map(a => ({ ...a })); };
  const famDe = cle => fams.find(f => f.cle === cle);
  const dom = cat => `${nomType} — ${cat}`;
  const plus = (f, extra) => extra.filter(Boolean).map(t => (typeof t === 'string' ? { texte: t } : t));

  if (mode === 'vipp') {
    // tracé (alertes de câblage ou de torons) : une recommandation par nature d'alerte
    const vus = new Map();
    out.spans.forEach((s, si) => { const v = s.beams[0].vipp; v.trace.alerte.forEach(t => { const n = natureAlerte(t); if (!vus.has(n)) vus.set(n, { t, cibles: [] }); vus.get(n).cibles.push({ si, type: 'trace', texte: t }); }); });
    for (const [n, { t, cibles }] of vus) {
      const f = famDe('trace:' + n), a = f ? await acts(f) : [];
      if (n === 'pradGaine') a.push({ texte: 'Ou vérifier l\'ancrage des torons aux abouts (EN 1992-1-1 § 8.10.2.3) avec la part de torons gainés retenue' });
      if (!a.length) a.push({ texte: 'Revoir la disposition des torons ou des câbles (voir l\'alerte)' });
      items.push({ domaine: dom(prad ? 'tracé des torons' : 'tracé des câbles'), lieu: prad ? 'Torons' : 'Câbles', verification: 'Encombrement et enrobage du tracé', constat: t,
        regle: prad ? 'EN 1992-1-1 § 8.10.1.2 ; dossier Sétra PRAD 73' : 'EN 1992-1-1 § 8.10.1.3 ; guide Sétra VIPP 1996 § 3.2.4', actions: a, cibles });
    }
    // contraintes (ELS, construction, contrainte initiale) : une recommandation par vérification
    const parNom = new Map();
    out.spans.forEach((s, si) => s.beams.forEach(b => b.vipp.verifs.forEach(q => {
      if (q.ok) return;
      const cle = q.nom.replace(/\s*\((poutre|hourdis)[^)]*t = [^)]*\)$/, '');
      if (!parNom.has(cle)) parNom.set(cle, []);
      parNom.get(cle).push({ si, b, q });
    })));
    for (const [nom, l] of parNom) {
      const fc = Object.keys(RE).find(k => RE[k].test(nom)), f = famDe(fc);
      const w = l.slice().sort((a, b) => Math.abs(b.q.val / (b.q.lim || 1)) - Math.abs(a.q.val / (a.q.lim || 1)))[0];
      const a = f ? await acts(f) : [];
      if (fc === 'sigpm0' && !prad && inp.vipp.cables.sigP0) {
        const r = dansBudget() ? await essai({ pt_sp0: '' }) : null;
        a.unshift({ texte: `Laisser le moteur fixer la tension au vérin (champ vide : réduite jusqu'à respecter σ_pm0 ≤ min(0,75 f_pk ; 0,85 f_p0,1k))${r && famOk(r, f) ? ' — vérifié par recalcul' : ''}`, champ: 'pt_sp0', valeur: 'vide (automatique)', valeurChamp: '', court: LIB_POUTRES.pt_sp0, actuel: fx(inp.vipp.cables.sigP0, 0) });
      }
      if (fc === 'sigpm0' && prad) a.push({ texte: 'La tension sur banc est fixée par le moteur (σ_pi = min(0,8 f_pk ; 0,9 f_p0,1k)) : pertes au relâchement faibles ; réduire σ_pi n\'est pas une donnée du formulaire' });
      if (fc === 'constrT') a.push({ texte: 'Ou armatures passives de reprise des tractions au jeune âge (section fissurée à justifier ; non dimensionnées par PSIDA)' });
      if (fc === 'traction' && prad && Math.max(...inp.spans) > 30) a.push({ texte: `Ou, pour une portée de ${fx(Math.max(...inp.spans), 1)} m (au-delà des 30 m courants du dossier PRAD 73), passer en poutres VIPP (post-tension)`, champ: 'pt_type', court: 'Type de poutres' });
      if (fc === 'traction' && inp.vipp.expo === 'XD' && /Décompression/.test(nom)) a.push({ texte: 'La décompression est demandée sous combinaison fréquente parce que la classe d\'exposition est XD / XS : vérifier que cette classe est bien celle de l\'ouvrage', champ: 'pt_expo', court: 'Classe d\'exposition' });
      items.push({ domaine: dom(fc === 'constrT' || fc === 'constrC' ? (prad ? 'transfert et construction' : 'mise en tension et construction') : fc === 'sigpm0' ? 'précontrainte' : 'contraintes normales en service'),
        lieu: listeP(l.map(x => x.b.k)), verification: nom,
        constat: `${fx(w.q.val)} MPa pour ${fx(w.q.lim)} MPa admis${/\(/.test(w.q.nom) && fc?.startsWith('constr') ? ` (${w.q.nom.match(/\(([^)]*)\)$/)[1]})` : ''}, x = ${fx(w.q.x, 1)} m, poutre ${w.b.k + 1}${ouT(w.si)}`,
        regle: w.q.ref, actions: a.length ? a : [{ texte: 'Voir les autres vérifications' }],
        cibles: l.flatMap(x => [{ si: x.si, type: 'verif', k: x.b.k, nom: x.q.nom }, { si: x.si, type: 'poutre', k: x.b.k }]) });
    }
    // ELU de flexion, effort tranchant, séisme vertical
    const lignes = (sel) => { const o = []; out.spans.forEach((s, si) => s.beams.forEach(b => sel(b.vipp).forEach(e => o.push({ si, b, e })))); return o; };
    const elu = lignes(v => v.elu.filter(e => !e.ok));
    if (elu.length) {
      const w = elu.sort((a, b) => b.e.MEd / b.e.MRd - a.e.MEd / a.e.MRd)[0], a = await acts(famDe('elu'));
      a.push({ texte: 'Le moteur ajoute déjà les armatures passives nécessaires (jusqu\'à A_s,min + 500 cm²) : c\'est la zone comprimée (hauteur, table, hourdis) qui manque' });
      items.push({ domaine: dom('ELU de flexion'), lieu: listeP(elu.map(x => x.b.k)), verification: 'M_Ed ≤ M_Rd', constat: `M_Ed = ${fx(w.e.MEd, 0)} > M_Rd = ${fx(w.e.MRd, 0)} kN·m (x = ${fx(w.e.x, 1)} m, poutre ${w.b.k + 1}${ouT(w.si)})`,
        regle: 'EN 1992-1-1 § 6.1 (f_cd = 0,85 f_ck/1,5, f_pd = f_p0,1k/1,15, ε_pm∞)', actions: a, cibles: elu.flatMap(x => [{ si: x.si, type: 'elu', k: x.b.k, x: x.e.x }, { si: x.si, type: 'poutre', k: x.b.k }]) });
    }
    for (const [cle, dans] of [['tranchantA', true], ['tranchantC', false]]) {
      const tr = lignes(v => v.tranchant.filter(t => !t.ok && (t.x <= blochet(v)) === dans));
      if (!tr.length) continue;
      const w = tr.sort((a, b) => b.e.VEd / b.e.VRdmax - a.e.VEd / a.e.VRdmax)[0], a = await acts(famDe(cle));
      a.push({ texte: 'Les étriers sont dimensionnés par le programme (A_sw/s) : c\'est la bielle de béton (V_Rd,max avec cot θ = 1) qui est dépassée' });
      items.push({ domaine: dom('effort tranchant'), lieu: listeP(tr.map(x => x.b.k)), verification: `V_Ed − V_pd ≤ V_Rd,max ${dans ? 'dans le blochet (âme sur appui)' : 'en section courante'}`,
        constat: `V_Ed − V_pd = ${fx(w.e.VEd, 0)} > V_Rd,max = ${fx(w.e.VRdmax, 0)} kN à x = ${fx(w.e.x, 1)} m (b_w,nom = ${fx(w.e.bwn, 3)} m, cot θ = ${fx(w.e.cot)}), poutre ${w.b.k + 1}${ouT(w.si)}`,
        regle: 'EN 1992-1-1 § 6.2.3 (3) : bielles, α_cw, ν₁ ; § 6.2.3 (6) : âme nette', actions: a, cibles: tr.flatMap(x => [{ si: x.si, type: 'tranchant', k: x.b.k, x: x.e.x }, { si: x.si, type: 'poutre', k: x.b.k }]) });
    }
    const se = []; out.spans.forEach((s, si) => s.beams.forEach(b => { if (b.vipp.seismeV && !b.vipp.seismeV.eluOk) se.push({ si, b }); }));
    if (se.length) {
      const w = se[0].b.vipp.seismeV.eluPire, a = await acts(famDe('seismeElu'));
      items.push({ domaine: dom('séisme vertical'), lieu: listeP(se.map(x => x.b.k)), verification: 'ELU G + E_z', constat: `M_Ed = ${fx(w.MEdE, 0)} > M_Rd = ${fx(w.MRd, 0)} kN·m (x = ${fx(w.x, 1)} m)`,
        regle: 'EN 1998-2 § 4.1.7(2)P', actions: a, cibles: se.flatMap(x => [{ si: x.si, type: 'seismeElu', k: x.b.k }, { si: x.si, type: 'poutre', k: x.b.k }]) });
    }
  } else if (mode === 'BA') {
    const fl = [], tv = [];
    out.spans.forEach((s, si) => s.beams.forEach(b => {
      const B = b.BA;
      if (B.EC.As == null || (B.BAEL && B.BAEL.As == null) || (B.travee || []).some(t => t.As == null)) fl.push({ si, b });
      (B.travee || []).forEach(t => { if (!t.V.ok) tv.push({ si, b, t }); });
    }));
    if (fl.length) {
      const w = fl[0].b.BA, m = w.EC.As == null ? w.EC.mode : w.BAEL && w.BAEL.As == null ? w.BAEL.mode : 'section insuffisante le long de la travée';
      items.push({ domaine: dom('flexion ELU'), lieu: listeP(fl.map(x => x.b.k)), verification: 'Section en T sans aciers comprimés', constat: `${m} (M_u EC = ${fx(fl[0].b.MuE ?? NaN, 0)} kN·m, poutre ${fl[0].b.k + 1}${ouT(fl[0].si)})`,
        regle: 'EN 1992-1-1 § 6.1 / BAEL 91 A.4.3 : μ ≤ 0,48 dans le programme (au-delà : aciers comprimés, non dimensionnés)', actions: await acts(famDe('flexBA')), cibles: fl.map(x => ({ si: x.si, type: 'BA', k: x.b.k })) });
    }
    if (tv.length) {
      const w = tv.sort((a, b) => b.t.VEd / b.t.V.VRdmax - a.t.VEd / a.t.V.VRdmax)[0];
      items.push({ domaine: dom('effort tranchant'), lieu: listeP(tv.map(x => x.b.k)), verification: 'V_Ed ≤ V_Rd,max (cot θ = 1)', constat: `V_Ed = ${fx(w.t.VEd, 0)} > V_Rd,max = ${fx(w.t.V.VRdmax, 0)} kN à x = ${fx(w.t.x, 1)} m (b_w = ${fx(inp.b0)} m), poutre ${w.b.k + 1}${ouT(w.si)}`,
        regle: 'EN 1992-1-1 § 6.2.3 (3)', actions: await acts(famDe('tranchBA')), cibles: tv.map(x => ({ si: x.si, type: 'BAV', k: x.b.k, x: x.t.x })) });
    }
  } else {
    for (const cle of ['tracBP', 'videBP', 'compBP']) {
      const f = famDe(cle), ko = []; out.spans.forEach((s, si) => s.beams.forEach(b => { if (!f.test(b, out)) ko.push({ si, b }); }));
      if (!ko.length) continue;
      const B = ko[0].b.BP, P = B.BPEL, E = B.EC, kPa = x => fx(x / 1000);
      const constat = cle === 'tracBP' ? (P && P.Pmin > inp.P + 1e-6 ? `P∞ = ${fx(inp.P, 0)} kN < P_min (Guyon) = ${fx(P.Pmin, 0)} kN` : `fibre inférieure en charge ${kPa(P ? P.enCharge.inf : E.enCharge.inf)} MPa (traction ; limite ${P ? kPa(P.sigTlim) : '0'} MPa)`)
        : cle === 'videBP' ? `fibre supérieure à vide ${kPa((P || E).aVide.sup)} MPa (limite ${P ? kPa(P.sigTlim) : '0'} MPa)` : `compression ${kPa(Math.max(P ? Math.max(P.aVide.inf, P.enCharge.sup) : 0, E.enChargeCar.sup))} MPa > 0,6 f_ck = ${kPa(E.sigClim)} MPa`;
      items.push({ domaine: dom('contraintes à mi-travée'), lieu: listeP(ko.map(x => x.b.k)), verification: libFam(cle).replace(/^./, c => c.toUpperCase()), constat: `${constat} (poutre ${ko[0].b.k + 1}${ouT(ko[0].si)})`,
        regle: 'BPEL 91 classe II (σ ≥ −f_tj sous combinaison rare, ≤ 0,6 f_cj, P ≥ P_min) ; EN 1992-2 § 7.3.1 (décompression sous quasi permanente) et § 7.2 (0,6 f_ck)',
        actions: [...await acts(f), { texte: 'Vérification simplifiée à mi-travée : la chaîne complète (phases, pertes, câblage) demande la section par ses dimensions', champ: 'pt_geo', court: 'Définition de la section' }],
        cibles: ko.map(x => ({ si: x.si, type: 'BP', k: x.b.k })) });
    }
  }
  // sous rail : déformations et vibrations (calcul complet relancé pour chaque essai)
  if (out.rail && !defosBase) {
    const e = out.spans.map(s => s.rail && s.rail.deformations).find(D => !D || D.erreur);
    items.push({ domaine: `${nomType} sous rail — déformations et vibrations`, lieu: 'Tablier', verification: 'Calcul des déformations', constat: `calcul impossible${e && e.erreur ? ` : ${e.erreur}` : ''}`, regle: 'EN 1990 A2.4.4 ; EN 1991-2 § 6.4.4',
      actions: [{ texte: 'Vérifier les données ferroviaires (voies, vitesse, about) : aucune valeur ne peut être cherchée tant que le calcul échoue' }], cibles: [] });
  }
  if (out.rail && defosBase) {
    const lignesR = [];   // { cle, si, nom, ok, constat, regle }
    out.spans.forEach((s, si) => {
      const D = s.rail && s.rail.deformations; if (!D || D.erreur) return;
      D.fleches.forEach(f => lignesR.push({ cle: 'railFleche', si, nom: 'fleche', ok: f.ok, constat: `flèche ${fx(f.w * 1000, 1)} mm > L/600 = ${fx(f.lim * 1000, 1)} mm`, regle: 'EN 1990 A2.4.4.2.3(1)', verif: 'Flèche verticale L/600' }));
      lignesR.push({ cle: 'railGauche', si, nom: 'gauche', ok: D.gauche.ok, constat: `gauche ${fx(D.gauche.t)} mm > ${fx(D.gauche.lim, 1)} mm sur 3 m`, regle: 'EN 1990 A2.4.4.2.2', verif: 'Gauche du tablier' });
      D.confort.forEach(c => lignesR.push({ cle: 'railFleche', si, nom: 'confort', ok: c.horsDomaine ? null : c.ok, constat: c.horsDomaine ? 'hors du domaine de la figure A2.3 : analyse spéciale' : `L/δ = ${fx(c.LsurD, 0)} < ${fx(c.LsurDlim, 0)}`, regle: 'EN 1990 A2.4.4.3.2, figure A2.3', verif: 'Confort des voyageurs' }));
      D.extremites.forEach(e => {
        lignesR.push({ cle: 'railDH', si, nom: 'dH', ok: e.okH, constat: `δH = ${fx(e.deltaH)} mm > ${fx(e.deltaHlim, 0)} mm (extrémité ${e.appui})`, regle: 'EN 1991-2 § 6.5.4.5.2(2)', verif: 'Déplacement longitudinal δH des extrémités' });
        lignesR.push({ cle: 'railDV', si, nom: 'dV', ok: e.about > 0 ? e.okV : null, constat: e.about > 0 ? `δV = ${fx(e.deltaV)} mm > ${fx(e.deltaVlim, 0)} mm (extrémité ${e.appui})` : 'distance de l\'appareil d\'appui à l\'extrémité du tablier non renseignée', regle: 'EN 1991-2 § 6.5.4.5.2(3)', verif: 'Soulèvement δV des extrémités', manque: !(e.about > 0) });
      });
      if (D.transversal) D.transversal.rows.forEach(x => {
        lignesR.push({ cle: 'railTransv', si, nom: 'transv', ok: transvOk(D.transversal, x), constat: `θ_h = ${fx(x.thetaH * 1000, 3)} mrad > ${fx(D.transversal.lim.thetaH * 1000, 1)} mrad et r = ${fx(x.rayon, 0)} m < ${fx(D.transversal.lim.rayon, 0)} m`, regle: 'EN 1990 A2.4.4.2.4, tableau A2.8', verif: 'Déformation transversale' });
        lignesR.push({ cle: 'railTransv', si, nom: 'fh', ok: x.fh == null ? null : x.fh >= D.transversal.fh0, constat: `f_h = ${fx(x.fh, 1)} Hz < ${fx(D.transversal.fh0, 1)} Hz`, regle: 'EN 1990 A2.4.4.2.4(3)', verif: 'Première fréquence latérale', manque: x.fh == null });
      });
    });
    const groupes = new Map();
    for (const l of lignesR) { if (l.ok) continue; const k = l.verif + (l.ok === null ? '|manque' : ''); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(l); }
    for (const [, l] of groupes) {
      const w = l[0], cibles = l.map(x => ({ si: x.si, type: 'defo', nom: x.nom }));
      let a;
      if (w.ok === null && w.nom === 'dV') a = [{ texte: 'Renseigner la distance de l\'appareil d\'appui à l\'extrémité du tablier (about) : sans elle, le soulèvement δV n\'est pas vérifié', champ: 'pt_rail_about', unite: 'm', court: LIB_POUTRES.pt_rail_about }];
      else if (w.ok === null) a = [{ texte: w.nom === 'confort' ? 'Analyse dynamique spéciale (hors du domaine de la figure A2.3), ou imposer L/δ de la figure (b_v = 1) d\'après le référentiel du gestionnaire' : 'Donnée insuffisante pour cette vérification : voir le tableau', ...(w.nom === 'confort' ? { champ: 'pt_rail_Ld', court: 'L/δ imposé' } : {}) }];
      else a = await acts(famDe(w.cle));
      items.push({ domaine: `${nomType} sous rail — déformations et vibrations`, lieu: nS > 1 ? `travée de ${fx(out.spans[w.si].L)} m` : 'Tablier', verification: w.verif + (w.ok === null ? ' (à compléter)' : ''), constat: w.constat, regle: w.regle, actions: a.length ? a : [{ texte: 'Voir le tableau des déformations' }], cibles });
    }
  }
  // hourdis : poinçonnement sous la roue du tandem (calcul complet relancé pour chaque essai)
  if (poincKo) {
    const f = { cle: 'poinc' }, P = out.hourdis.poinc, ps = parametres('poinc', ctx0), a = [];
    for (const p of ps) {
      let res = dansBudget() ? await cherche(f, p) : null;
      if (res && res.budget) res = null;   // dichotomie interrompue : recherche à reprendre (« Calculer »), pas une absence de solution
      if (res && res.valeur != null) a.push(a.length ? { ...actionParam(p, res.valeur), texte: 'Ou ' + actionParam(p, res.valeur, 'seul').texte.replace(/^./, c => c.toLowerCase()) } : actionParam(p, res.valeur, 'valeur cherchée par recalcul complet (plaque du hourdis), les autres données restant inchangées'));
      else if (res) a.push({ texte: `${LIB_POUTRES[p.champ] || p.champ} : ne suffit pas seul (essayé jusqu'à ${p.aff(res.max ?? p.vals[p.vals.length - 1])} ${p.unite})`, champ: p.champ, unite: p.unite });
      else a.push({ texte: `Ou modifier : ${min1(LIB_POUTRES[p.champ] || p.champ)} (${p.affActuel} ${p.unite})`, champ: p.champ, unite: p.unite, court: LIB_POUTRES[p.champ], actuel: p.affActuel,
        chercher: aChercher(f, p) });
    }
    items.push({ domaine: 'Hourdis', lieu: 'Hourdis', verification: 'Poinçonnement sous la roue du tandem', constat: `V_Ed = ${fx(P.VEd, 0)} > V_Rd,c = ${fx(P.VRdc, 0)} kN (d = ${fx(P.d, 3)} m, v_Rd,c = ${fx(P.vRdc, 3)} MPa)`,
      regle: 'EN 1992-1-1 § 6.4.4', actions: a, cibles: [{ type: 'poinc' }] });
  }
  const synthese = ensemble && items.length ? { texte: 'Valeurs cherchées ensemble pour que toutes les vérifications des poutres passent', champs: { ...ensemble } } : null;
  return { items, synthese, ensemble, jointOk, bloque: bloque && bloque.cle, horsBudget, calculs: nCalc, calculsEnsemble, duree: maintenant() - t0 };
}

/** Première action applicable (champ et valeur) d'un élément : c'est l'indication « → à modifier » des tableaux. */
export function indication(it) {
  const a = it.actions.find(x => (x.champ && x.valeurChamp != null) || x.champs) || it.actions.find(x => x.champ) || it.actions[0];
  if (!a) return null;
  return { texte: a.court || a.texte, champ: a.champ || null, champs: a.champs || null, actuel: a.actuel, valeur: a.valeur, valeurChamp: a.valeurChamp, unite: a.unite || '', complet: a.texte };
}
/** Clé d'une ligne de tableau : travée, type de ligne, poutre, vérification ou abscisse. */
export const cleCible = c => [c.si ?? '', c.type, c.k ?? '', c.nom ?? c.texte ?? (c.x != null ? (+c.x).toFixed(3) : '')].join('|');
/** Index des indications par ligne de tableau. */
export function indicationsParCible(items) {
  const m = new Map();
  for (const it of items) {
    const ind = indication(it); if (!ind) continue;
    for (const c of it.cibles || []) { const k = cleCible(c); if (!m.has(k)) m.set(k, ind); }
  }
  return m;
}
