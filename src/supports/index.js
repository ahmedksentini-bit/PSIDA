import { nivellement } from './nivellement.js';
/**
 * Appuis et fondations — chaîne complète à partir des résultats du tablier (réactions, appareils d'appui) :
 * rigidités des lignes, répartition du freinage et des déformations imposées, combinaisons en tête (BAEL/F61 et EC),
 * descente en pied, fûts (piles voiles ou colonnes, voiles et colonnes de culée), chevêtres, garde-grève, murs en
 * retour, semelles superficielles ou sur pieux, pieux (Ménard, efforts, ferraillage, portance).
 * Unités : m, kN, kN·m, MPa (p*_l, E_M en MPa).
 */
import { Axe } from '../geom/axe.js';
import { forceCentrifuge, qvEC, forceCentrifugeF61 } from '../geom/centrifuge.js';
import { BC } from '../loads_f61.js';
import { neopreneFlexibility, cantileverFlexibility, horizontalDistribution, horizontalDistributionIso, brakingF61Deck, headCombinationsBAEL, headCombinationsEC, repartitionPlan } from './actions.js';
import { designShaft, pierCap, buckling, chevetreTorsion } from './pier.js';
import { gardeGreve, murEnRetour, earthPressure, earthPressureUpper, videCombos, dalleTransition, Ka } from './abutment.js';
import { shallowFooting, footingStrutTie, pileCapStrutTie, pileGroupForces, menardReaction, lateralPile, pileMinSteel, pileCapacity, minPileLength, PILE_TYPES, pileCapTwoRows, paroiFlechie, negativeFrictionPiles, pileGroupSettlement, footingRotationStiffness, footingSettlement, footingCantilever, sigmaSBAEL, pileConcrete, efficaciteCoherentF62, efficaciteEC7, isCohesive, soilProfile } from './foundation.js';
import { requiredSteelNM } from './section_nm.js';
import { winklerPile, pileGroup, headFlexibility, pileProfile, pileShear, pileCapFiles, blevot } from './psh.js';
import { minorationSurface } from '../geotech/lateral.js';
import { pierWater } from './water.js';
import { bearingSpacing, STANDARD_BEARINGS, designation, checkBearing, totalHeight } from '../bearings.js';
import { verifyBearing1337 } from './bearings1337.js';
import { localPressure, bearingSplitting, shortCorbel } from './pierhead.js';
import { toPontEC8 } from '../ec8export.js';
import * as EC8 from '../vendor/pont-ec8.js';

/**
 * Chocs accidentels sur les piles (EN 1991-1-7, valeurs recommandées — à confronter à l'annexe nationale) :
 * véhicules, tableau 4.1 (F_dx dans le sens de la circulation sous l'ouvrage, F_dy perpendiculaire, non simultanés,
 * appliqués entre 0,5 et 1,5 m au-dessus de la chaussée) ; bateaux fluviaux, tableau C.3 (classes CEMT, frontal F_dx et
 * latéral F_dy). Pratique SETRA (Fascicule 61) : 1000 kN // et 500 kN ⊥ à 1,50 m.
 */
export const IMPACT_VEHICULE = {
  autoroute: { label: 'autoroutes, routes nationales et principales', Fdx: 1000, Fdy: 500 },
  rurale: { label: 'routes de campagne', Fdx: 750, Fdy: 375 },
  urbaine: { label: 'voies urbaines', Fdx: 500, Fdy: 250 },
  parking: { label: 'cours et parkings (poids lourds)', Fdx: 150, Fdy: 75 },
};
export const IMPACT_BATEAU = {
  I: { Fdx: 2000, Fdy: 1000 }, II: { Fdx: 3000, Fdy: 1500 }, III: { Fdx: 4000, Fdy: 2000 }, IV: { Fdx: 5000, Fdy: 2500 },
  Va: { Fdx: 8000, Fdy: 3500 }, Vb: { Fdx: 10000, Fdy: 4000 }, VIa: { Fdx: 10000, Fdy: 4000 }, VIb: { Fdx: 14000, Fdy: 5000 }, VIc: { Fdx: 17000, Fdy: 8000 },
};

/** Séisme par le moteur de Pont EC8 (EN 1998-2, mode fondamental) sur le projet exporté ; efforts par appui en kN. */
export function seismicActions(st, sp, hGG, spLigne = null) {
  const projet = EC8.lireProjet(JSON.parse(JSON.stringify(toPontEC8({ ...st, supports: { sp, hGG, spLigne } }, { site: sp.ec8, q: sp.seisme.q }))));
  const problemes = EC8.valider(projet);
  const a = EC8.actionSismique(projet), m = EC8.modele(projet), r = EC8.analyse(projet, a, m);
  // repos d'appui (EN 1998-2 6.6.4) : culées, et piles d'un tablier à travées indépendantes
  let repos = null;
  try { const v = EC8.verifierAppuis(projet, a, m, r); repos = v.repos.map(q => ({ ...q, etat: (v.criteres.find(c => c.id === `${q.id}_repos`) || {}).etat })); } catch { repos = null; }
  // méthode demandée par le projet (caissons construits par encorbellements : multimodale) ; sans demande, mode fondamental
  // dans son domaine (masse des piles < 20 %, tablier rigide L/B ≤ 4 : EN 1998-2 4.2.2.2-4.2.2.3), multimodale sinon
  const choix = EC8.methodeRetenue(projet, r);
  if (choix.methode === 'multimodale') {
    const mm = EC8.multimodale(projet, a, m, r), efforts = EC8.exporterEfforts(projet, a, r, { multimodale: mm }, 'multimodale');
    const T1 = d => (mm.comparaison.find(c => c.direction === d) || {}).T1 ?? 0;
    const F = d => efforts.appuis.reduce((s, ap) => s + Math.abs(d === 'x' ? ap.cas[0].Fx : ap.cas[1].Fy), 0);
    return { projet, problemes, efforts, repos, methode: 'multimodale', motifMethode: choix.motif, T: { x: T1('x'), y: T1('y') }, F: { x: F('x'), y: F('y') }, M: r.M, conditions: r.conditions };
  }
  // effort total = somme des efforts reçus par les appuis (comme l'onglet « Calcul sismique ») : en travées indépendantes, les
  // modes sont combinés appui par appui (SRSS / CQC), et la somme des combinaisons dépasse un peu la combinaison du total
  const efforts = EC8.exporterEfforts(projet, a, r);
  const F = d => efforts.appuis.reduce((s, ap) => s + Math.abs(d === 'x' ? ap.cas[0].Fx : ap.cas[1].Fy), 0);
  return { projet, problemes, repos, efforts, methode: projet.tablier.continuite === 'isostatique' ? 'travees_independantes' : 'mode_fondamental', T: { x: r.directions.x.lbdp.T, y: r.directions.y.lbdp.T }, F: { x: F('x'), y: F('y') }, Fglobal: { x: r.directions.x.ubdp.F * 1000, y: r.directions.y.ubdp.F * 1000 }, M: r.M, conditions: r.conditions };
}

/**
 * Efforts reçus de l'onglet « Calcul sismique » (Pont EC8 complet, projet éventuellement modifié par l'utilisateur) :
 * même format que seismicActions ; contrôle du nombre de lignes d'appui.
 */
export function externalSeismic(ext, nL, spans = null) {
  if (!ext || !ext.efforts) return { error: 'aucun effort reçu de l\'onglet « Calcul sismique » : y envoyer le projet (ou l\'ouvrir), puis relancer le calcul.' };
  const n = ext.efforts.appuis.length;
  if (n !== nL) return { error: `le projet de l'onglet « Calcul sismique » a ${n} lignes d'appui, l'ouvrage PSIDA en a ${nL} : renvoyer le projet PSIDA vers l'onglet.` };
  if (spans && ext.travees && (ext.travees.length !== spans.length || ext.travees.some((L, k) => Math.abs(L - spans[k]) > 0.05)))
    return { error: `les travées du projet de l'onglet « Calcul sismique » (${ext.travees.join(' + ')} m) ne sont pas celles de l'ouvrage PSIDA (${spans.join(' + ')} m) : renvoyer le projet PSIDA vers l'onglet.` };
  return { ...ext, problemes: ext.problemes || [], source: 'onglet' };
}

/**
 * Dispositions géométriques minimales du dossier pilote PP73 (pièces 1.1.2, 1.1.3, 1.2.3, 1.3.2) : avertissements.
 */
/** @param {number} [Lfoot] longueur de la semelle le long de la ligne d'appui (défaut : largeur + 1 m) */
export function geometryWarnings(sp, end, width, Lfoot = width + 1) {
  const W = [], F = sp.found, P = sp.pile, C = sp.culee;
  const col = end ? C.type !== 'remblayee' : P.type === 'colonnes';
  const D = end ? C.D : P.D, hc = end ? C.hc : P.hc, lc = end ? C.lc : P.lc;
  if (col && D < 0.60 - 1e-9) W.push(`colonnes Ø ${D} m < 0,60 m (PP73 1.3.2 § 1.3 : diamètre minimal vis-à-vis du choc)`);
  if (col && hc > 0 && (hc < 0.60 - 1e-9 || lc < 0.70 - 1e-9)) W.push(`chevêtre ${hc} × ${lc} m : dimensions conseillées ≥ 0,60 m de hauteur × 0,70 m de largeur (PP73 1.1.3, 1.3.2 § 2.2.5.1)`);
  if (F.type === 'superficielle' && F.B < 1.5 - 1e-9) W.push(`semelle B = ${F.B} m < 1,50 m (PP73 1.1.2)`);
  if (F.type !== 'superficielle') {
    if (F.nFiles === 1 && F.pileD < 0.60 - 1e-9) W.push(`file unique de pieux Ø ${F.pileD} m < 0,60 m (PP73 : 0,80 m conseillé)`);
    const s = F.nFiles > 1 ? Math.min(F.sPile, Lfoot / Math.max(1, F.nPile)) : Lfoot / Math.max(1, F.nPile);
    if (s < 3 * F.pileD - 1e-9) W.push(`entraxe des pieux ${s.toFixed(2)} m < 3 Ø (PP73 1.2.3, effet de groupe)`);
    if (F.nFiles > 1 && F.B < 4.5 * F.pileD - 1e-9) W.push(`semelle sur pieux B = ${F.B} m < 4,5 Ø (PP73 1.2.3)`);
  }
  if (end && sp.culee.hGG && sp.culee.hGG > 3) W.push('garde-grève de plus de 3 m : hors domaine des ferraillages types PP73 (calcul nécessaire)');
  if (end && C.Lret > 6) W.push(`mur en retour de ${C.Lret} m : épaisseur (ℓ + 2)/20 hors domaine (2 à 6 m, PP73 1.3.2 § 3.4)`);
  return W;
}

/** Valeurs par défaut du formulaire « Appuis et fondations ». */
export const SUPPORT_DEFAULTS = {
  pile: { type: 'voile', H: [6], b: 0.6, bTop: null, Lv: null, hcons: 1.0, nCol: 3, D: 0.8, hc: 0, lc: 1.2 },
  // type : remblayee (mur de front), enterree (pile-culée noyée), apparente (pile-culée apparente, voile frontal hv sous le chevêtre) ;
  // dalle : dalle de transition appuyée sur le garde-grève
  culee: { type: 'remblayee', Hm: 3.0, em: 0.8, hGG: null, Lret: 4.0, nCol: 3, D: 0.8, hc: 1.0, lc: 1.6, hv: 1.0, dalle: true },
  // pieux : incl inclinaison de chaque file [°] (vers l'extérieur positive), tete encastre | articule, pied libre | encastre
  found: { type: 'superficielle', B: 3.0, hs: 1.0, De: 1.0, pileType: 'fore-boue', pileD: 0.8, nPile: 3, nFiles: 2, sPile: 2.4, Lpile: 15, incl: [], tete: 'encastre', pied: 'libre' },
  // kSus : module de réaction sous charges soutenues / module instantané (F62 C.5 : ½ ; PSH : au choix de l'utilisateur)
  soil: { layers: null, classe: 'sable-B', ple: 1.0, EM: 10, alpha: 0.5, phi: 30, gamma: 20, q: 10, kSus: 0.5 },
  mat: { fck: 25, fyk: 400, c: 0.05 },
  eps: { TLD: 3e-4, TCD: 1e-4 },
  // bossages sous les appareils (débord autour de l'appareil, béton) ; dalle précontrainte : actions PSI-DP transmises aux appuis
  bossage: { debord: null, fck: null },   // débord null : dimensionné (5 à 20 cm)
  epsPSIDP: true,
  // pile de joint (pile double) au début et/ou à la fin : rapports des réactions du tablier adjacent à celles du tablier étudié
  joint: { debut: false, fin: false, rG: 1, rQ: 1, rH: 1 },
  ec8: { zone: 3, categorie: 'III', classeSol: 'B' },
  seisme: { actif: false, source: 'auto', externe: null, q: { long: 1, trans: 1 } },
  choc: { vehicule: 'aucun', hV: 1.25, bateau: 'aucun', hB: 2.0 },
  // cours d'eau (crue de projet) : h hauteur d'eau PHE − lit, v vitesse moyenne, theta biais du courant sur l'axe des piles,
  // nez forme de l'avant-bec, K3 état du lit, hGen affouillement général + de contraction, hDeb/bDeb radeau d'embâcles,
  // appuis numéros des lignes en eau (null : toutes les piles)
  eau: { actif: false, h: 3, v: 2, theta: 0, nez: 'rond', K3: 1.1, hGen: 0, hDeb: 0, bDeb: 0, appuis: null },
};

const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? { ...a[k], ...b[k] } : b[k] ?? a[k]; return o; };
const EiB = fc => 11000 * fc ** (1 / 3), EvB = fc => 3700 * fc ** (1 / 3), Ecm = fck => 22000 * ((fck + 8) / 10) ** 0.3;

/**
 * @param {object} st résultats de compute() (pipeline) ; @param {object} input données « Appuis » (voir SUPPORT_DEFAULTS)
 */
export function computeSupports(st, input = {}) {
  const r = calculAvecSemelles(st, input);
  // appareils choisis automatiquement (règles du guide 1989) qui ne vérifient pas la NF EN 1337-3 alors qu'un appareil de
  // la gamme la vérifie : cet appareil est retenu et le calcul est refait (raideurs des lignes, répartition des efforts
  // horizontaux, têtes d'appui). Les appareils imposés par l'utilisateur ne sont jamais remplacés.
  const rows = st.bearings && st.bearings.rows;
  if (!rows) return r;
  const remplace = new Map();
  r.lines.forEach((L, i) => {
    const b = L.EC && L.EC.brg, row = rows[i];
    if (!b || b.error || b.ok || !b.proposal || !row || !row.sel || row.sel.imposed) return;
    const p0 = b.proposal.bd, a = Math.round(p0.a * 1000), bb = Math.round(p0.b * 1000), t = Math.round(p0.t * 1000), ts = Math.round(p0.ts * 1000);
    const std = STANDARD_BEARINGS.find(x => x.a === a && x.b === bb) || { a, b: bb, t, ts, ns: [p0.n] };
    const bd = { ...std, t, ts };
    const g = row.Pmax != null && row.ug != null ? checkBearing(bd, p0.n, { Pmax: row.Pmax, Pmin: row.Pmin ?? 0, H: row.Hb ?? 0, ug: row.ug, alpha: row.alpha ?? 0.003 }) : { T: p0.n * p0.t };
    remplace.set(i, { ...row.sel, ...g, bd, n: p0.n, area: a * bb, label: designation(bd, p0.n), hTot: totalHeight(bd, p0.n), ajusteEN1337: { de: row.sel.label || b.label } });
  });
  if (!remplace.size) return r;
  const st2 = { ...st, bearings: { ...st.bearings, rows: rows.map((row, i) => (remplace.has(i) ? { ...row, sel: remplace.get(i) } : row)) } };
  const r2 = calculAvecSemelles(st2, input);
  for (const [i, sel] of remplace) {
    const L = r2.lines[i]; if (!L) continue;
    (L.warnings ||= []).push(`appareil ${sel.label} retenu au lieu de ${sel.ajusteEN1337.de} (choisi par les règles du guide 1989) : seul le premier vérifie la NF EN 1337-3 sous les mêmes efforts${L.EC && L.EC.brg && !L.EC.brg.ok ? ' — il ne la vérifie toujours pas après le nouveau calcul, voir le tableau des appareils' : ''}`);
    L.appareilAjuste = { de: sel.ajusteEN1337.de, a: sel.label };
  }
  // appareils effectivement retenus : repris par l'export vers l'onglet « Calcul sismique » (Pont EC8)
  r2.bearingsRetenus = st2.bearings;
  return r2;
}

function calculAvecSemelles(st, input) {
  // semelles superficielles de largeur B non donnée (B vide) : dimensionnées ligne par ligne (plus petite largeur, par pas de
  // 0,25 m, qui vérifie portance, glissement et excentrement dans toutes les combinaisons, à vide comprise), puis second
  // calcul avec ces largeurs pour que la rotation des semelles dans la répartition des efforts horizontaux leur corresponde
  const F = { ...SUPPORT_DEFAULTS.found, ...(input.found || {}) };
  // semelle sur pieux (ou B saisie) : largeur donnée, 3 m par défaut (dimensions du groupe de pieux à la charge du projeteur)
  if (!F.Bauto || F.type !== 'superficielle') return calculAppuis(st, F.B == null ? { ...input, found: { ...F, B: 3.0 } } : input);
  const r1 = calculAppuis(st, { ...input, found: { ...F, B: F.B ?? 3.0 } });
  const Bligne = r1.lines.map(L => (L.EC.found.type === 'superficielle' ? Math.max(L.EC.found.B, L.BAEL.found.B) : null));
  return calculAppuis(st, { ...input, found: { ...F, B: F.B ?? 3.0, Bligne } });
}

function calculAppuis(st, input = {}) {
  const sp = merge(SUPPORT_DEFAULTS, input);
  const { deck, perm, f61, ec, bearings } = st;
  // tablier à travées indépendantes : chaque pile porte deux rangées d'appareils (une par about). Voile d'épaisseur en tête
  // non donnée : tête élargie pour recevoir les deux bossages (appareil + 2 × 10 cm chacun) et l'ouverture du joint (10 cm)
  if (deck.continuite === 'isostatique' && (sp.pile.type || 'voile') === 'voile' && sp.pile.bTop == null && deck.spans.length > 1) {
    const aMax = Math.max(0, ...bearings.rows.slice(1, -1).map(r => (r.sel ? r.sel.bd.a / 1000 : 0)));
    const req = Math.ceil((2 * (aMax + 0.20) + 0.10) / 0.05 - 1e-9) * 0.05;
    if (req > sp.pile.b + 1e-9) sp.pile = { ...sp.pile, bTop: req, bTopAuto: true };
  }
  const width = 2 * deck.b, Ltot = deck.spans.reduce((a, v) => a + v, 0);
  const xs = [0]; deck.spans.forEach(L => xs.push(xs[xs.length - 1] + L));
  // dalle précontrainte (PSI-DP) : réactions hyperstatiques de précontrainte (enveloppe des phases mise en tension, mise en
  // service et en service, valeurs probable, P1 et P2), coefficient 1 dans toutes les combinaisons (BPEL), ajoutées aux
  // réactions permanentes ; raccourcissements élastique, de fluage et de retrait de la dalle précontrainte
  const dp = st.psidp && st.psidp.r && sp.epsPSIDP !== false ? st.psidp : null;
  const HYP = dp ? ['MT', 'MS', 'ES'].flatMap(ph => ['moy', 'max', 'min'].map(k => dp.r[ph][k].hyp.R)) : null;
  const hypMax = xs.map((_, i) => (HYP ? Math.max(...HYP.map(R => R[i] || 0)) : 0)), hypMin = xs.map((_, i) => (HYP ? Math.min(...HYP.map(R => R[i] || 0)) : 0));
  const Gmax = i => jG(i) * perm.Rmax[i] + hypMax[i], Gmin = i => jG(i) * perm.Rmin[i] + hypMin[i];
  // pile de joint (pile double) à une extrémité : appui commun avec un tablier adjacent — calculée comme une pile, sous les
  // réactions du tablier étudié augmentées de celles du tablier adjacent (rapports r_G, r_Q, r_H aux valeurs propres ;
  // 1 = tablier adjacent symétrique), efforts horizontaux cumulés dans le même sens (prudent)
  const nL = xs.length, J = sp.joint || {};
  const jointAt = i => (i === 0 && !!J.debut) || (i === nL - 1 && !!J.fin);
  const isEnd = i => (i === 0 || i === nL - 1) && !jointAt(i);
  const jG = i => (jointAt(i) ? 1 + (J.rG ?? 1) : 1), jQ = i => (jointAt(i) ? 1 + (J.rQ ?? 1) : 1), jH = i => (jointAt(i) ? 1 + (J.rH ?? 1) : 1);
  const { fck, fyk, c } = sp.mat;
  // plan de nivellement : données propres à chaque ligne d'appui (hauteurs, semelle, pieux) déduites des cotes
  const niv = nivellement(sp, { deck, bearings, tRev: st.p && st.p.mat ? st.p.mat.tRev : 0.08, isEnd, nL: xs.length });
  const S = i => (niv.parLigne[i] ? merge(sp, niv.parLigne[i]) : sp);
  const Hpile = i => { const H = [].concat(S(i).pile.H); return H[Math.min(H.length - 1, i - 1)] ?? H[0]; };
  const Lv = sp.pile.Lv ?? width;
  // voile d'épaisseur variable : b en pied, bTop en tête (vide = constante) ; moyenne pour le poids, plus faible pour l'élancement
  const bBot = sp.pile.b, bTop = sp.pile.bTop ?? sp.pile.b, bMean = (bBot + bTop) / 2, bMin = Math.min(bBot, bTop);
  const voileSegs = (H, E, n = bTop === bBot ? 1 : 6) => Array.from({ length: n }, (_, k) => { const bk = bBot + (bTop - bBot) * (k + 0.5) / n; return { h: H / n, E, A: Lv * bk, I: Lv * bk ** 3 / 12 }; });
  const segFlex = segs => { const H = segs.reduce((a, g) => a + g.h, 0); let s0 = 0, f = 0; for (const g of segs) { const a = H - s0, b = H - s0 - g.h; if (Number.isFinite(g.E * g.I) && g.I > 0) f += (a ** 3 - b ** 3) / (3 * g.E * 1000 * g.I); s0 += g.h; } return f; };
  const hGG = sp.culee.hGG ?? deck.h + 0.15 + Math.max(...bearings.rows.map(r => (r.sel ? r.sel.hTot : 60))) / 1000;

  const soil = sp.soil;
  // profils pressiométriques (sondages, couches depuis le terrain naturel), un profil associé à chaque ligne d'appui
  // (liste « assign » : nom du profil par ligne ; à défaut le premier) ; sans profil : couche unique homogène
  const profs = (soil.profiles && soil.profiles.length ? soil.profiles : [{ name: 'SP1', layers: soil.layers && soil.layers.length ? soil.layers : [{ z0: 0, z1: 100, classe: soil.classe, pl: soil.ple, EM: soil.EM, alpha: soil.alpha }] }])
    .map(p => ({ name: p.name, tests: p.tests || [], ...soilProfile(p.layers) }));
  const profileOf = i => profs.find(p => p.name === (soil.assign || [])[i]) || profs[0];

  // --- fondations sur pieux : modèle PSH (semelle rigide, pieux de Winkler, matrice de rigidité du groupe) ---
  // fondation de chaque ligne (type, semelle, pieux) : données générales ou propres à la ligne (plan de nivellement)
  const BligneDe = i => { const Bl = sp.found.Bligne && sp.found.Bligne[i], bN = niv.parLigne[i] && niv.parLigne[i].found && niv.parLigne[i].found.B; return Bl != null && !(bN > 0) ? Bl : null; };
  const F0 = i => { const f = S(i).found, Bl = BligneDe(i); return Bl != null ? { ...f, B: Bl } : f; }, onPiles = i => F0(i).type !== 'superficielle';
  const parLigne = niv.actif || !!sp.found.Bligne, SL = i => ({ ...S(i), found: F0(i) });
  const nF0 = i => Math.max(1, F0(i).nFiles), nP0 = i => Math.max(1, F0(i).nPile), Dp = i => F0(i).pileD;
  const Lfoot = i => (isEnd(i) ? width : (sp.pile.type === 'voile' ? Lv : width)) + 1.0;
  const fileX = (i, f) => (nF0(i) === 1 ? 0 : (f - (nF0(i) - 1) / 2) * F0(i).sPile);
  const fileOmega = (i, f) => { const a = (F0(i).incl || [])[f] ?? 0; return (fileX(i, f) < 0 ? -1 : 1) * a * Math.PI / 180; };
  const pilesLong = i => Array.from({ length: nF0(i) }, (_, f) => Array.from({ length: nP0(i) }, () => ({ x: fileX(i, f), omega: fileOmega(i, f), file: f }))).flat();
  const pilesTrans = i => Array.from({ length: nF0(i) }, () => Array.from({ length: nP0(i) }, (_, k2) => ({ x: Lfoot(i) * (2 * k2 + 1) / (2 * nP0(i)) - Lfoot(i) / 2, omega: 0 }))).flat();
  const pileE = (code, i) => { const F = F0(i), pc = pileConcrete({ fc28: fck, D: F.pileD, L: F.Lpile, type: F.pileType }); const Ei = code === 'BAEL' ? pc.Ei : Ecm(Math.min(fck, 30)); return { pc, inst: Ei * 1000, sus: Ei * 1000 * (code === 'BAEL' ? 3700 / 11000 : 1 / 3) }; };
  // remblai traversé par les pieux des culées sous la semelle (hauteur hR, poussée K_a, module E_M) — PSH « couches de remblai »
  const RB = { h: 0, gamma: 20, Ka: 0.33, EM: 5, alpha: 0.5, pf: 0.3, ...(sp.found.remblai || {}) };
  const hRem = i => (isEnd(i) ? Math.max(0, RB.h || 0) : 0);
  /** Profondeur sous le terrain naturel d'un point du pieu à z sous la tête (z < 0 : dans le remblai). */
  const zTN = (i, z) => (hRem(i) > 0 ? z - hRem(i) : F0(i).De + z);
  /**
   * Loi de réaction frontale du pieu à z sous la tête (F62 annexe C.5 ; NF P 94-262 annexe I) : module k = E_s/B (Ménard,
   * court terme), palier r_max = B p*_f ; minoration près de la surface 0,5 (1 + z/z_c), z_c = 2B (sols cohérents) ou 4B
   * (frottants), sur le module et le palier (art. 6 ; I.1.6) ; remblai : module et p*_f du remblai.
   */
  const soilLaw = (i, z) => {
    const zt = zTN(i, z), inRem = zt < 0;
    const l = inRem ? { EM: RB.EM, alpha: RB.alpha, pf: RB.pf, classe: 'sable-A' } : profileOf(i).at(zt);
    const D = Dp(i), k = menardReaction({ EM: l.EM * 1000, alpha: l.alpha, B: D }).k;
    const depth = inRem ? z : Math.max(0, zt) + (hRem(i) > 0 ? hRem(i) : 0);   // profondeur sous la surface du sol
    const m = minorationSurface({ z: depth, B: D, sol: isCohesive(l.classe) ? 'coherent' : 'frottant' });
    return { k: k * m.pente, rmax: D * (l.pf ?? l.pl / 2) * 1000 * m.palier, minor: m.pente < 1 };
  };
  const groupCache = new Map();
  /**
   * Groupes de pieux (longitudinal et transversal) pour la ligne i, le référentiel et la durée d'application ; expo :
   * longueur dégagée par l'affouillement ; fac : coefficients sécants de plastification par nœud (palier de réaction).
   */
  const groupsOf = (i, code, dur, expo = 0, fac = null) => {
    const F = F0(i), key = `${profileOf(i).name}|${code}|${dur}|${expo.toFixed(3)}|${isEnd(i)}|${fac ? fac.key : ''}|${F.Lpile}|${F.pileD}|${F.De}|${F.nFiles}|${F.nPile}|${F.sPile}`;
    if (groupCache.has(key)) return groupCache.get(key);
    const E = pileE(code, i)[dur], fk = dur === 'sus' ? (soil.kSus ?? 0.5) : 1, hz = F.Lpile / 240;
    const kz = z => (z < expo ? 0 : fk * soilLaw(i, z).k * (fac ? fac.f[Math.min(fac.f.length - 1, Math.round(z / hz))] : 1));
    const wp = winklerPile({ L: F.Lpile, D: F.pileD, E, k: kz, tip: F.pied || 'libre', n: 240 });
    const opt = { head: F.tete || 'encastre' };
    const g = { wp, long: pileGroup(pilesLong(i), wp, opt), trans: pileGroup(pilesTrans(i), wp, opt), E };
    groupCache.set(key, g); return g;
  };
  const footRotCache = new Map();
  const footRot = (i, code) => { const F = F0(i), k = `${profileOf(i).name}|${code}|${Lfoot(i)}|${F.B}|${F.De}`; if (!footRotCache.has(k)) footRotCache.set(k, footingRotationStiffness({ profile: profileOf(i), B: F.B, L: Lfoot(i), D: F.De, code })); return footRotCache.get(k); };
  /** Tronçons de l'appui au-dessus de la semelle (fût, chevêtre) pour la souplesse de tête (sens longitudinal). */
  const segmentsOf = (i, E) => {
    if (isEnd(i)) {
      const C = S(i).culee;
      if (C.type === 'remblayee') return [{ h: C.Hm, E, A: C.em * width, I: Infinity }];
      return [{ h: C.Hm, E, A: C.nCol * Math.PI * C.D ** 2 / 4, I: C.nCol * Math.PI * C.D ** 4 / 64 }, ...(C.hc > 0 ? [{ h: C.hc, E, A: C.lc * width, I: width * C.lc ** 3 / 12 }] : [])];
    }
    const P = sp.pile, col = P.type === 'colonnes';
    return [...(col ? [{ h: Hpile(i), E, A: P.nCol * Math.PI * P.D ** 2 / 4, I: P.nCol * Math.PI * P.D ** 4 / 64 }] : voileSegs(Hpile(i), E)),
      ...(col && P.hc > 0 ? [{ h: P.hc, E, A: P.lc * width, I: width * P.lc ** 3 / 12 }] : [])];
  };
  /** Matrice de souplesse de la tête d'appui (N, M, T) — PSH. */
  const headFlex = (i, code, dur) => {
    const Eapp = (code === 'BAEL' ? (dur === 'inst' ? EiB(fck) : EvB(fck)) : (dur === 'inst' ? Ecm(fck) : Ecm(fck) / 3)) * 1000;
    return headFlexibility({ group: groupsOf(i, code, dur).long, segments: segmentsOf(i, Eapp), hs: F0(i).hs });
  };
  // --- rigidités horizontales (néoprène + fût console encastré ; fondation sur pieux : souplesse de tête PSH, fondation
  //     superficielle supposée rigide) ---
  const shaftI = i => {
    if (isEnd(i)) return sp.culee.type === 'remblayee' ? Infinity : sp.culee.nCol * Math.PI * sp.culee.D ** 4 / 64;
    return sp.pile.type === 'voile' ? Lv * sp.pile.b ** 3 / 12 : sp.pile.nCol * Math.PI * sp.pile.D ** 4 / 64;
  };
  const shaftH = i => (isEnd(i) ? S(i).culee.Hm : Hpile(i) + (sp.pile.type === 'colonnes' ? sp.pile.hc : 0));
  // tablier à travées indépendantes (appuis seuls) : chaque travée sur ses propres appareils
  const iso = deck.continuite === 'isostatique';
  const lineData = code => xs.map((x, i) => {
    const r = bearings.rows[i], sel = r.sel || { bd: { a: 300, b: 400 }, T: 0.04 };
    const a = sel.bd.a / 1000, b = sel.bd.b / 1000, Te = (sel.T || 0.04) + 2 * 0.0025;   // élastomère + enrobages 2,5 mm
    const I = shaftI(i), H = shaftH(i);
    const Ei = code === 'BAEL' ? EiB(fck) : Ecm(fck), Ev = code === 'BAEL' ? EvB(fck) : Ecm(fck) / 3;
    return {
      x, bearing: { a, b, Te, n: r.nb }, liaison: r.liaison || 'elastomere', rangees: iso && i > 0 && i < xs.length - 1 ? 2 : 1,
      // appareil fixe : liaison rigide ; appareil glissant (multidirectionnel) : aucun effort horizontal (frottement négligé)
      sNeo: r.liaison === 'fixe' ? { inst: 0, diff: 0 } : r.liaison === 'glissant' ? { inst: Infinity, diff: Infinity }
        : { inst: neopreneFlexibility({ n: r.nb, a, b, Te, G: 1.8 }), diff: neopreneFlexibility({ n: r.nb, a, b, Te, G: 0.9 }) },
      sApp: onPiles(i) ? { inst: headFlex(i, code, 'inst')[2][2], diff: headFlex(i, code, 'sus')[2][2] } : (() => {
        // semelle superficielle : rotation sur le sol (module de réaction de Ménard, F62 F.3 : k_i = 2 k_v) ramenée en tête
        const fr = footRot(i, code), hT = H + F0(i).hs;
        const varV = !isEnd(i) && sp.pile.type === 'voile' && bTop !== bBot;
        const cf = E => (varV ? segFlex(voileSegs(H, E)) : Number.isFinite(I) ? cantileverFlexibility({ H, E, I }) : 0);
        return { inst: cf(Ei) + hT ** 2 / fr.Ktheta.inst, diff: cf(Ev) + hT ** 2 / fr.Ktheta.diff };
      })(),
    };
  });
  const distH = iso ? horizontalDistributionIso : horizontalDistribution;
  const distB = distH(lineData('BAEL')), distE = distH(lineData('EC'));
  // --- rigidités TRANSVERSALES (efforts H_y : force centrifuge) : mêmes appareils (élastomère isotrope en distorsion) ;
  //     pile voile fléchie dans son plan (I = b L_v³/12) ; colonnes liées en tête par le chevêtre : portique à traverse
  //     rigide (12 EI/H³ par colonne, soit un fût console d'inertie 4 Σ I) ; culée remblayée rigide en travers ;
  //     fondation : groupe de pieux dans le sens transversal (PSH), semelle tournant autour de son grand axe (B ↔ L) ---
  const segmentsT = (i, E) => {
    if (isEnd(i)) {
      const C = S(i).culee;
      if (C.type === 'remblayee') return [{ h: C.Hm, E, A: C.em * width, I: Infinity }];
      return [{ h: C.Hm, E, A: C.nCol * Math.PI * C.D ** 2 / 4, I: (C.nCol > 1 ? 4 : 1) * C.nCol * Math.PI * C.D ** 4 / 64 }, ...(C.hc > 0 ? [{ h: C.hc, E, A: C.lc * width, I: C.lc * width ** 3 / 12 }] : [])];
    }
    const P = sp.pile, col = P.type === 'colonnes', n = bTop === bBot ? 1 : 6;
    return [...(col ? [{ h: Hpile(i), E, A: P.nCol * Math.PI * P.D ** 2 / 4, I: (P.nCol > 1 ? 4 : 1) * P.nCol * Math.PI * P.D ** 4 / 64 }]
      : Array.from({ length: n }, (_, k) => { const bk = bBot + (bTop - bBot) * (k + 0.5) / n; return { h: Hpile(i) / n, E, A: Lv * bk, I: bk * Lv ** 3 / 12 }; })),
      ...(col && P.hc > 0 ? [{ h: P.hc, E, A: P.lc * width, I: P.lc * width ** 3 / 12 }] : [])];
  };
  const footRotT = (i, code) => { const F = F0(i), k = `T|${profileOf(i).name}|${code}|${Lfoot(i)}|${F.B}|${F.De}`; if (!footRotCache.has(k)) footRotCache.set(k, footingRotationStiffness({ profile: profileOf(i), B: Lfoot(i), L: F.B, D: F.De, code })); return footRotCache.get(k); };
  const lineDataT = code => lineData(code).map((l, i) => {
    const Ei = (code === 'BAEL' ? EiB(fck) : Ecm(fck)), Ev = code === 'BAEL' ? EvB(fck) : Ecm(fck) / 3;
    const fl = (E, dur) => {
      const segs = segmentsT(i, E);
      if (onPiles(i)) return headFlexibility({ group: groupsOf(i, code, dur).trans, segments: segs.map(g => ({ ...g, E: g.E * 1000 })), hs: F0(i).hs })[2][2];
      if (isEnd(i) && S(i).culee.type === 'remblayee') return 0;
      const hT = segs.reduce((a, g) => a + g.h, 0) + F0(i).hs, fr = footRotT(i, code);
      return segFlex(segs) + hT ** 2 / fr.Ktheta[dur === 'sus' ? 'diff' : 'inst'];
    };
    return { ...l, sApp: { inst: fl(Ei, 'inst'), diff: fl(Ev, 'sus') } };
  });
  const distTB = horizontalDistribution(lineDataT('BAEL')), distTE = horizontalDistribution(lineDataT('EC'));
  // ouvrage courbe : force centrifuge promenée le long du tablier (intensité au rayon local, dirigée vers l'extérieur
  // du virage, appliquée sur l'axe), tablier indéformable dans son plan sur les lignes d'appui (ressorts longitudinal et
  // transversal de chaque ligne) : translation et ROTATION d'ensemble ; enveloppe des efforts par ligne
  const centrifugePlan = (code, Fde) => {
    const t = deck.g.trace, ax = new Axe(t.segments), sC0 = (t.s0 || 0) + deck.beam.x0[0], ov = deck.g.overhangs || [0, 0];
    const dL = code === 'BAEL' ? distB : distE, dT = code === 'BAEL' ? distTB : distTE;
    const lignes = xs.map((x, i) => { const s = sC0 + x - deck.beam.x0[0], T = ax.tangente(s); return { P: ax.point(s), T, N: [-T[1], T[0]], KL: dL.K.inst[i], KT: dT.K.inst[i] }; });
    const Hx = xs.map(() => 0), Hy = xs.map(() => 0), pos = xs.map(() => null);
    let Fmax = 0;
    for (let x = -ov[0]; x <= Ltot + ov[1] + 1e-9; x += 0.5) {
      const s = sC0 + x, k = ax.courbure(s); if (!k) continue;
      const F = Fde(1 / Math.abs(k)); if (!(F > 0)) continue;
      Fmax = Math.max(Fmax, F);
      const T = ax.tangente(s), N = [-T[1], T[0]], dir = -Math.sign(k), Fv = [dir * F * N[0], dir * F * N[1]];
      repartitionPlan(lignes, Fv, ax.point(s)).forEach((r, i) => { if (Math.abs(r.Hy) > Hy[i]) { Hy[i] = Math.abs(r.Hy); pos[i] = x; } Hx[i] = Math.max(Hx[i], Math.abs(r.Hx)); });
    }
    return { Hx, Hy, Fmax, pos };
  };
  // appareils d'appui, référentiel EC (guide Sétra 2007 § 4.3.1 et 4.3.2.3.1) : appui (fût, fondation, sol) avec ses raideurs
  // instantanées, élastomère G = 0,9 MPa pour les déformations lentes — distribution distincte de celle des fondations (différée)
  const distEb = distH(lineData('EC').map(l => ({ ...l, sApp: { inst: l.sApp.inst, diff: l.sApp.inst } })));

  // --- profil en long (plan de nivellement) : composante du poids parallèle à la pente, W_j·sin α_j par travée (abouts
  //     avec la travée de rive), action permanente répartie entre les lignes d'appui au prorata des raideurs différées ;
  //     cumulée en valeur absolue avec le retrait-fluage (sens indifférent, prudent)
  const pente = (() => {
    const z = niv.actif ? niv.lignes.map(L => L.zCh) : [];
    if (!niv.actif || z.some(v => !Number.isFinite(v))) return null;
    const [aL, aR] = deck.g.overhangs || [0, 0], g = perm.gTotal;
    const sl = deck.spans.map((L, j) => (z[j + 1] - z[j]) / L);
    const Wj = deck.spans.map((L, j) => g * (L + (j === 0 ? aL : 0) + (j === deck.spans.length - 1 ? aR : 0)));
    const H = Wj.reduce((a, W, j) => a + W * Math.sin(Math.atan(sl[j])), 0);
    if (Math.abs(H) < 1e-9) return null;
    const rep = d => { const S = d.K.diff.reduce((a, b) => a + b, 0); return d.K.diff.map(k => k * H / S); };
    return { sl, H, B: rep(distB), E: rep(distE), Eb: rep(distEb) };
  })();
  const Hp = (code, i) => (pente ? Math.abs(pente[code][i]) : 0);

  // --- actions en tête par ligne ---
  const chargeable = deck.g.roadway.y2 - deck.g.roadway.y1;
  const brk = brakingF61Deck({ Ltot: deck.continuite === 'isostatique' ? Math.max(...deck.spans) : Ltot, Lc: chargeable });
  // ouvrage courbe : force centrifuge EN 1991-2 § 4.4.2 au rayon minimal du tracé, groupe gr2, répartie entre les lignes
  // comme le freinage (raideurs instantanées des appareils et des appuis — approximation : raideurs transversales prises
  // égales aux raideurs longitudinales)
  // rayon minimal sur la longueur du tablier (abouts compris), pas sur tout l'axe dessiné
  const rTrace = deck.g.trace ? (() => { const t = deck.g.trace, ov = deck.g.overhangs || [0, 0], s0 = (t.s0 || 0) + deck.beam.x0[0]; return new Axe(t.segments).rayonMin(s0 - ov[0], s0 + Ltot + ov[1]); })() : Infinity;
  const Qv = qvEC(st.ec && st.ec.alpha ? st.ec.alpha.aQ : [1, 1, 1], st.ec && st.ec.lanes ? st.ec.lanes.n : 3);
  const optF61 = f61 ? { nv: f61.nv, bc: BC.bc[f61.classe] || BC.bc[1], delta: Math.max(1, ...(f61.deltaBc || [1])), Ltot } : null;
  const centrifuge = Number.isFinite(rTrace) ? { r: rTrace, Qv, Qtk: forceCentrifuge({ r: rTrace, Qv }),
    F61: f61 ? forceCentrifugeF61({ r: rTrace, ...optF61 }) : null,
    plan: { EC: centrifugePlan('EC', r => forceCentrifuge({ r, Qv })), BAEL: f61 ? centrifugePlan('BAEL', r => forceCentrifugeF61({ r, ...optF61 }).F) : null } } : null;
  const RFsaisi = Math.max(0, st.p.concept.epsSlow ?? 2.5e-4), epsT = 1e-5 * (st.p.concept.dTu ?? 30);
  const RF = dp && dp.shorten ? dp.shorten.total : RFsaisi;
  const R = (res, i) => (res ? Math.max(0, res.Rmax[i]) : 0);
  let seisme = null;
  if (sp.seisme.actif) {
    if (sp.seisme.source === 'onglet') seisme = externalSeismic(sp.seisme.externe, nL, deck.spans);
    else { try { seisme = seismicActions(st, sp, hGG, parLigne ? xs.map((_, i) => SL(i)) : null); } catch (e) { seisme = { error: e.message }; } }
  }
  const accidental = (i, Nfreq) => {
    const out = [];
    if (seisme && seisme.efforts) {
      // EN 1990 6.4.3.4 : G + ψ2,1 Q + A_Ed (ψ2,1 = 0 pour le trafic routier courant) ; Fz pris avec ± (G max + Fz, G min − Fz)
      for (const k of seisme.efforts.appuis[i].cas) for (const sgn of [1, -1]) {
        out.push({ label: `ACC séisme ${k.nom} ${sgn > 0 ? '(+Z)' : '(−Z)'}`, ls: 'ACC', acc: true, N: (sgn > 0 ? Gmax(i) : Gmin(i)) + sgn * Math.abs(k.Fz), H: Math.abs(k.Fx), Hy: Math.abs(k.Fy), Nsus: Gmax(i), Ninst: 0, Hsus: 0, Hinst: Math.abs(k.Fx) });
      }
      // fondations seules (EN 1998-2 5.8.2) : effets × q (ductilité limitée, pont isolé) ou dimensionnement en capacité des
      // piles ; non repris pour les fûts, dimensionnés sous A_Ed
      for (const k of seisme.efforts.appuis[i].casFondations || []) for (const sgn of [1, -1]) {
        out.push({ label: `ACC séisme ${k.nom} ${sgn > 0 ? '(+Z)' : '(−Z)'}`, ls: 'ACC', acc: true, fond: true, N: (sgn > 0 ? Gmax(i) : Gmin(i)) + sgn * Math.abs(k.Fz), H: Math.abs(k.Fx), Hy: Math.abs(k.Fy), Nsus: Gmax(i), Ninst: 0, Hsus: 0, Hinst: Math.abs(k.Fx) });
      }
    }
    if (!isEnd(i)) {
      // chocs : G + A_d + ψ1,1 Q (EN 1990 6.4.3.3, ψ1 TS 0,75 / UDL 0,4) ; F appliqué au fût (non transmis par le tablier)
      const veh = IMPACT_VEHICULE[sp.choc.vehicule], bat = IMPACT_BATEAU[sp.choc.bateau];
      const add = (label, F, h) => out.push({ label, ls: 'ACC', acc: true, N: Gmax(i) + Nfreq, H: 0, Hy: 0, imp: { F, h }, Nsus: Gmax(i), Ninst: Nfreq, Hsus: 0, Hinst: 0 });
      if (veh) add(`ACC choc véhicule (${veh.label}) F = max(F_dx ; F_dy) = ${Math.max(veh.Fdx, veh.Fdy)} kN`, Math.max(veh.Fdx, veh.Fdy), sp.choc.hV);
      if (bat) add(`ACC choc de bateau (classe CEMT ${sp.choc.bateau}) F_dx = ${bat.Fdx} kN`, bat.Fdx, sp.choc.hB);
    }
    for (const c of out) { c.N = c.N; }
    return out;
  };
  // --- cours d'eau : courant, embâcles, poussée d'Archimède, affouillement (piles en rivière) ---
  // plan de nivellement : une pile est dans l'eau si ses cotes de PHE et de lit sont données (PHE au-dessus du lit)
  // (dès qu'une ligne porte des cotes d'eau, les lignes sans cotes d'eau sont hors de l'eau)
  const eauNiv = niv.actif && niv.lignes.some(L => L.hEau != null);
  const nivEau = i => { if (!eauNiv) return null; const L = niv.lignes[i]; return !!(L && L.hEau > 0); };
  const inWater = i => sp.eau.actif && !isEnd(i) && (nivEau(i) ?? (!sp.eau.appuis || !sp.eau.appuis.length || sp.eau.appuis.includes(i + 1)));
  const water = xs.map((x, i) => (inWater(i) ? pierWater(S(i).eau, { type: sp.pile.type, b: sp.pile.b, Lv, D: sp.pile.D, nCol: sp.pile.nCol, s: sp.pile.nCol > 1 ? width / sp.pile.nCol : 0,
    Hf: Hpile(i), dBed: (niv.actif && niv.lignes[i] && niv.lignes[i].dBed != null) ? niv.lignes[i].dBed : Math.max(0, F0(i).De - F0(i).hs) }) : null));
  const waterCombos = (i, Nfreq) => {
    const w = water[i]; if (!w) return { F61: [], EC: [] };
    // F_wa action variable de courte durée (γ_Q = 1,5) ; BAEL/F61 : comme le vent (annexe D), sans trafic ; EC : action
    // dominante, trafic d'accompagnement ψ₀ (TS 0,75, UDL 0,4) ; poussée d'Archimède au niveau des PHE (γ = 1, défavorable
    // en soulèvement, retenue dans toutes les combinaisons de crue)
    const mk = (label, ls, gG, gW, NQ) => ({ label, ls, N: gG * jG(i) * perm.Rmax[i] + hypMax[i] + jQ(i) * NQ, H: 0, Hy: 0, wat: { F: gW * w.F, M: gW * w.M, U: w.Ushaft, gG }, Nsus: gG * jG(i) * perm.Rmax[i] + hypMax[i], Ninst: jQ(i) * NQ, Hsus: 0, Hinst: 0 });
    return {
      F61: [mk('ELU crue : 1,35 G + 1,5 F_eau', 'ELU', 1.35, 1.5, 0), mk('ELS crue : G + F_eau', 'ELS', 1, 1, 0)],
      EC: [mk('ELU crue : 1,35 G + 1,5 F_eau + 1,35 ψ₀ Q', 'ELU', 1.35, 1.5, 1.35 * Nfreq), mk('ELS car. crue : G + F_eau + ψ₀ Q', 'ELS', 1, 1, Nfreq)],
    };
  };
  const heads = xs.map((x, i) => {
    const G = { N: jG(i) * perm.Rmax[i], P: hypMax[i] };
    const tr = R(f61.trottoir, i), q = jQ(i), h = jH(i);
    const bB = distB.braking(1)[i];
    const QF = [
      { label: 'A(l) + trottoirs', N: q * (R(f61.A, i) + tr), H: h * brk.A * bB, gU: 1.605, gS: 1.2 },
      { label: 'Bc + trottoirs', N: q * (R(f61.Bc, i) + tr), H: h * brk.Bc * bB, gU: 1.605, gS: 1.2 },
      // ouvrage courbe : force centrifuge du Bc (art. 7), non cumulée avec le freinage (art. 7.3)
      ...(centrifuge && centrifuge.F61 && centrifuge.F61.F ? [{ label: 'Bc + trottoirs + centrifuge', N: q * (R(f61.Bc, i) + tr), H: h * centrifuge.plan.BAEL.Hx[i], Hy: h * centrifuge.plan.BAEL.Hy[i], gU: 1.605, gS: 1.2 }] : []),
      ...(f61.Bt ? [{ label: 'Bt + trottoirs', N: q * (R(f61.Bt, i) + tr), H: 0, gU: 1.605, gS: 1.2 }] : []),
      ...(f61.Mc120 ? [{ label: 'Mc120 + trottoirs', N: q * (R(f61.Mc120, i) + tr), H: 0, gU: 1.35, gS: 1.0 }] : []),
    ];
    const F61 = headCombinationsBAEL({ G, Q: QF, RF: { H: Math.abs(h * distB.imposed(RF).H[i]) + Hp('B', i) }, TLD: { H: h * distB.imposed(sp.eps.TLD).H[i] }, TCD: { H: h * distB.imposed(sp.eps.TCD, 'inst').H[i] }, envelope: true });
    const psi0 = (0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i) + 0.4 * R(ec.gr3, i) * 0.6) / Math.max(1e-9, R(ec.gr1a, i));
    const QE = [
      { label: 'gr1a', N: q * R(ec.gr1a, i), H: 0, psi0 },
      { label: centrifuge && centrifuge.Qtk ? 'gr2 (freinage + centrifuge)' : 'gr2 (freinage)', N: q * (0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i)), H: h * (bearings.H * distE.braking(1)[i] + (centrifuge ? centrifuge.plan.EC.Hx[i] : 0)), Hy: centrifuge ? h * centrifuge.plan.EC.Hy[i] : 0, psi0: 0 },
    ];
    const EC = headCombinationsEC({ G, Q: QE, RF: { H: Math.abs(h * distE.imposed(RF).H[i]) + Hp('E', i) }, T: { H: h * distE.imposed(epsT).H[i] } });
    const Nfreq = q * (0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i));
    const acc = accidental(i, Nfreq), wc = waterCombos(i, Nfreq);
    return { x, F61: [...F61, ...wc.F61, ...acc], EC: [...EC, ...wc.EC, ...acc] };
  });

  // --- appareils d'appui en élastomère fretté : NF EN 1337-3 (guide Sétra 2007), appareil le plus chargé de chaque ligne ---
  const EIb = bearings.EI || null;
  const rotOf = (res, i) => (res && res.Tmax && EIb ? Math.max(Math.abs(res.Tmax[i] || 0), Math.abs(res.Tmin[i] || 0)) / EIb : 0);
  const bearing1337 = (i, code) => {
    const row = bearings.rows[i], sel = row.sel;
    if (!sel) return null;
    const nb = row.nb, bd = { a: sel.bd.a / 1000, b: sel.bd.b / 1000, n: sel.n, t: sel.bd.t / 1000, ts: sel.bd.ts / 1000 };
    // rotation permanente : dalle armée G (module différé) ; dalle précontrainte G + P (PSI-DP : enveloppe de la mise en
    // tension, instantanée, et du service, fluage compris)
    const a0 = bearings.alpha0 ?? 0.003;
    let aG = bearings.rotPerm ? bearings.rotPerm[i] || 0 : 0;
    if (dp && dp.defl && dp.defl.rot) {
      const R0 = dp.defl.rot, mx = q => Math.max(Math.abs(q.g ?? 0), Math.abs(q.d ?? 0));
      aG = Math.max(mx(R0.service[i]), mx({ g: (R0.cp[i].g ?? 0) + (R0.pI[i].g ?? 0), d: (R0.cp[i].d ?? 0) + (R0.pI[i].d ?? 0) }));
    }
    const dist = code === 'BAEL' ? distB : distEb;
    // déplacement lent : retrait-fluage + distorsion sous la composante du poids le long de la pente (profil en long)
    const vRF = Math.abs(dist.imposed(RF, 'diff').disp[i]) + (pente ? Math.abs(pente[code === 'BAEL' ? 'B' : 'Eb'][i]) * dist.lines[i].sNeo.diff : 0);
    // température : BAEL longue durée (module différé) + courte durée (instantané) ; EC variation uniforme T (guide 2007, G = 0,9 MPa)
    const vT = code === 'BAEL' ? Math.abs(dist.imposed(sp.eps.TLD, 'diff').disp[i]) + Math.abs(dist.imposed(sp.eps.TCD, 'inst').disp[i]) : Math.abs(dist.imposed(epsT, 'diff').disp[i]);
    // ouvrage courbe précontraint : réactions différentielles des appareils dues au couple de la poussée radiale des câbles
    const tC = dp && dp.courbe && dp.courbe.dRmax ? dp.courbe : null;
    const Gb = row.kCP * perm.Rmax[i] / nb, GbMin = perm.Rmin[i] / nb, Pmax = hypMax[i] / nb + (tC ? tC.dRmax[i] : 0), Pmin = hypMin[i] / nb + (tC ? tC.dRmin[i] : 0);
    const tr = R(f61.trottoir, i);
    const bB = distB.braking(1)[i], bE = distE.braking(1)[i];
    const QQ = code === 'BAEL'
      ? [{ label: 'A(l)', res: f61.A, add: tr, g: 1.605, H: brk.A * bB / nb }, { label: 'Bc', res: f61.Bc, add: tr, g: 1.605, H: Math.max(brk.Bc * bB, centrifuge && centrifuge.plan.BAEL ? Math.hypot(centrifuge.plan.BAEL.Hx[i], centrifuge.plan.BAEL.Hy[i]) : 0) / nb },
        ...(f61.Mc120 ? [{ label: 'Mc120', res: f61.Mc120, add: tr, g: 1.35, H: 0 }] : [])]
      : [{ label: 'gr1a', res: ec.gr1a, add: 0, g: 1.35, H: 0 }, { label: centrifuge && centrifuge.Qtk ? 'gr2 (freinage + centrifuge)' : 'gr2 (freinage)', noT: true, res: ec.gr1a, frac: R(ec.gr1a, i) > 0 ? (0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i)) / R(ec.gr1a, i) : 0, add: 0, g: 1.35, H: Math.hypot(bearings.H * bE + (centrifuge ? centrifuge.plan.EC.Hx[i] : 0), centrifuge ? centrifuge.plan.EC.Hy[i] : 0) / nb }];
    // gradient thermique (réactions hyperstatiques N_θ du gradient, réparties sur les n appareils) : ψ₀ = 0,6 avec le trafic
    // dominant (BAEL 1,3 × 0,6 = 0,78 ; EC 1,5 × 0,6), 1,35 / 1,5 en action dominante, 1,0 dans les combinaisons minimales
    const th = st.thermal && st.thermal.Rmax ? st.thermal : null;
    const NtMax = th ? Math.max(0, th.Rmax[i]) / nb : 0, NtMin = th ? Math.min(0, th.Rmin[i]) / nb : 0;
    const gTq = code === 'BAEL' ? 0.78 : 0.9, gTd = code === 'BAEL' ? 1.35 : 1.5;
    const psi0T = 0.6, combos = [];
    for (const q of QQ) {
      const f = q.frac ?? 1, Qmax = f * (row.kQ * R(q.res, i) + q.add) / nb, Qmin = f * Math.min(0, q.res ? q.res.Rmin[i] : 0) / nb, aQ = f * rotOf(q.res, i);
      combos.push({ label: `ELU ${q.label} (max)`, Fz: 1.35 * Gb + Pmax + q.g * Qmax + (q.noT ? 0 : gTq * NtMax), vSlow: vRF + (q.noT ? 0 : 1.5 * psi0T * vT), Hx: q.g * q.H, alpha: 1.35 * aG + q.g * aQ + a0 });
      if (Qmin < 0) combos.push({ label: `ELU ${q.label} (min, enveloppe)`, Fz: GbMin + Pmin + q.g * Qmin + (q.noT ? 0 : gTq * NtMin), vSlow: vRF + (q.noT ? 0 : 1.5 * psi0T * vT), Hx: q.g * q.H, alpha: aG + q.g * aQ + a0, minimal: true, indicatif: true });
    }
    // température dominante (BAEL : comb. 8 de la pratique ; EC : 1,5 T + 1,35 ψ₀ trafic)
    const q0 = QQ[0], psiQ = code === 'BAEL' ? 0 : (0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i)) / Math.max(1e-9, R(ec.gr1a, i));
    combos.push({ label: 'ELU température', Fz: 1.35 * Gb + Pmax + gTd * NtMax + 1.35 * psiQ * row.kQ * R(q0.res, i) / nb, vSlow: vRF + 1.5 * vT, Hx: 0, alpha: 1.35 * aG + 1.35 * psiQ * rotOf(q0.res, i) + a0 });
    combos.push({ label: th ? 'G + P + N_θ (min)' : 'G + P (min)', Fz: GbMin + Pmin + NtMin, vSlow: vRF + vT, Hx: 0, alpha: aG + a0, minimal: true });
    // non-glissement : effort vertical minimal concomitant (permanent seul ; ou trafic minimal avec son freinage)
    const slides = [{ FzMin: GbMin + Pmin + NtMin, vSlow: vRF + vT, Hx: 0, FzGmin: GbMin + Pmin, vPerm: vRF, label: th ? 'G + P + N_θ (min)' : 'G + P (min)' },
      ...QQ.filter(q => q.H > 0).map(q => ({ FzMin: GbMin + Pmin + NtMin + Math.min(0, q.res ? q.res.Rmin[i] : 0) / nb, vSlow: q.noT ? vRF : vRF + vT, Hx: q.H, FzGmin: GbMin + Pmin, vPerm: vRF, label: `G + P + ${q.label} (min) + freinage` }))];
    const res = verifyBearing1337(bd, combos, slides[0]);
    const sl = slides.map(sl0 => ({ ...verifyBearing1337(bd, [], sl0).slide, label: sl0.label }));
    res.slides = sl; res.slide = sl.reduce((m, x) => (!m || x.Fxy / Math.max(x.R, 1e-12) > m.Fxy / Math.max(m.R, 1e-12) ? x : m), null);
    res.ok = res.rows.every(r => r.ok || r.indicatif) && res.slide.okGlissement && res.slide.okPerm;
    // appareil non conforme : plus petit appareil de la gamme standard vérifiant la NF EN 1337-3 sous les mêmes efforts et
    // déplacements (la répartition des efforts horizontaux n'est pas recalculée)
    let proposal = null;
    if (!res.ok) {
      const cands = [];
      for (const s0 of STANDARD_BEARINGS) for (const n of s0.ns) cands.push({ s0, n, area: s0.a * s0.b, T: n * s0.t });
      cands.sort((p, q) => p.area - q.area || p.T - q.T);
      // proposition : plus petit appareil standard qui vérifie l'EN 1337-3 ET le guide Sétra 1989 (sinon le premier qui
      // vérifie l'EN 1337-3) — une proposition qui ne passerait pas le guide serait aussitôt signalée comme non conforme
      const g89 = c => (row && row.Pmax != null ? checkBearing(c.s0, c.n, { Pmax: Math.max(row.Pmax, row.PSIDA ? row.PSIDA.Pmax : 0), Pmin: row.Pmin, H: row.Hb, ug: row.ug, alpha: row.alpha }).ok : true);
      let enSeul = null;
      for (const c of cands) {
        const bdc = { a: c.s0.a / 1000, b: c.s0.b / 1000, n: c.n, t: c.s0.t / 1000, ts: c.s0.ts / 1000 };
        const rc = verifyBearing1337(bdc, combos, null);
        if (!rc.rows.every(r => r.ok || r.indicatif)) continue;
        if (!slides.every(sl0 => { const x = verifyBearing1337(bdc, [], sl0).slide; return x.okGlissement && x.okPerm; })) continue;
        if (!g89(c)) { enSeul ||= { label: designation(c.s0, c.n), bd: bdc, guide1989: false }; continue; }
        proposal = { label: designation(c.s0, c.n), bd: bdc };
        break;
      }
      proposal ||= enSeul;
    }
    return { proposal, ...res, label: sel.label || `${sel.bd.a}×${sel.bd.b}×${sel.n}(${sel.bd.t}+${sel.bd.ts})`, nb, vRF, vT, aG, a0, RF, Pmax: hypMax[i], Pmin: hypMin[i], Ntheta: th ? { max: NtMax, min: NtMin } : null };
  };

  // --- tête d'appui : bossages (pression localisée, frettage) et voile en console sous les appareils extrêmes ---
  const pierHead = (i, code, brg) => {
    if (!brg || brg.error) return null;
    const end = isEnd(i), P = sp.pile, C = sp.culee, row = bearings.rows[i], nb = row.nb;
    const Ru = Math.max(...brg.rows.filter(r => !r.minimal).map(r => r.Fz));
    const a0 = brg.g.a, b0 = brg.g.b, debSaisi = sp.bossage?.debord;
    const pitch = bearingSpacing({ width, psi: st.p.concept.psi, n: nb });
    const dA = end ? (C.type === 'remblayee' ? C.em : C.lc) : (P.type === 'voile' ? bTop : P.lc);
    // pression localisée : contact appareil / bossage (rectangle homothétique limité au bossage, béton du bossage) ;
    // diffusion sous le bossage dans la section de l'appui (rectangle homothétique inscrit dans l'épaisseur d_A et l'entraxe)
    const fckB = sp.bossage?.fck || fck;
    const pr = (fc, A1, B1) => {
      if (code === 'BAEL') return { ...localPressure({ R: Ru, a0, b0, a: A1, b: B1, fcj: fc }), rule: 'BAEL A.8.4,1' };
      // EN 1992-1-1 § 6.7 : F_Rdu = A_c0 f_cd √(A_c1/A_c0) ≤ 3 f_cd A_c0 (f_cd = f_ck/1,5)
      const fcd = fc / 1.5, k = Math.min(Math.sqrt(A1 * B1 / (a0 * b0)), 3), sig = Ru / 1000 / (a0 * b0);
      return { K: k, fbu: fcd, lim: k * fcd, sig, ok: sig <= k * fcd + 1e-9, rule: 'EN 1992-1-1 § 6.7' };
    };
    // débord du bossage : saisi, ou dimensionné (vide) — plus petit débord de 5 à 20 cm, par pas de 5 cm, qui vérifie le
    // contact appareil / bossage (règle du code affiché ; BAEL : K > 1 seulement si d ≥ a₀/6 et b₀/6)
    let deb = debSaisi ?? 0.05, debDim = false;
    if (debSaisi == null) { debDim = true; for (const d of [0.05, 0.10, 0.15, 0.20]) { deb = d; if (pr(fckB, a0 + 2 * d, b0 + 2 * d).ok) break; } }
    const ab = a0 + 2 * deb, bb = b0 + 2 * deb;
    const press = { ...pr(fckB, ab, bb), fck: fckB };
    const sc = Math.min(dA / a0, Math.min(pitch, width) / b0), pressDiff = { ...pr(fck, a0 * sc, b0 * sc), a: a0 * sc, b: b0 * sc, fck };
    const Lline = end ? width : (P.type === 'voile' ? Math.min(Lv, width) : width), edge = Math.max(b0 / 2, (Lline - (nb - 1) * pitch) / 2);
    const split = bearingSplitting({ R: Ru, a0, b0, dA: Math.max(dA, a0), pitch, edge, n: nb, fe: fyk });
    let corbel = null;
    if (!end && P.type === 'voile' && Lv < width - 1e-9) {
      const ys = Array.from({ length: nb }, (_, k) => (k - (nb - 1) / 2) * pitch);
      const out = ys.map(y => Math.abs(y) - Lv / 2).filter(av => av > 1e-9);
      if (out.length) {
        const side = Math.ceil(out.length / 2), aSide = out.slice(0, side);
        const hc = P.hcons ?? 1.0, d = hc - c - 0.03, b0c = bTop, Lc = Math.max(...aSide) + b0 / 2;
        const Hb = Math.max(0, ...heads[i][code === 'BAEL' ? 'F61' : 'EC'].filter(cb => cb.ls === 'ELU').map(cb => cb.H)) / nb;
        const Vb = Ru * aSide.length, Wc = 1.35 * 25 * b0c * hc * Lc;
        const Mu = Ru * aSide.reduce((s0, av) => s0 + av, 0) + Wc * Lc / 2, aRes = Mu / (Vb + Wc);
        corbel = { n: aSide.length, a: aRes, aList: aSide, hc, d, b0: b0c, Vu: Vb + Wc, Hu: Hb * aSide.length, Lc, ...shortCorbel({ Vu: Vb + Wc, Hu: Hb * aSide.length, Mu, a: aRes, d, b0: b0c, fcj: fck, fe: fyk, l: b0 }) };
        // console longue (d < a) : hors annexe E.6 — flexion simple de la console encastrée au nu du voile
        if (!corbel.short) corbel.Along = (requiredSteelNM({ b: b0c, h: hc, c }, { code, fck, fyk }, 0, Mu).As ?? NaN) + Hb * aSide.length / (fyk * 1000 / 1.15);
      }
    }
    return { Ru, a0, b0, ab, bb, deb, debDim, press, pressDiff, split, corbel, dA, pitch };
  };

  // --- éléments d'appui ---
  const KA = Ka(sp.soil.phi);
  const lines = xs.map((x, i) => {
    const sp = S(i);   // données de la ligne (plan de nivellement)
    const end = isEnd(i), profile = profileOf(i), out = { i, x, kind: end ? 'culee' : 'pile', joint: jointAt(i), type: end ? sp.culee.type : sp.pile.type, head: heads[i], profile: profile.name };
    out.K = { BAEL: { inst: distB.K.inst[i], diff: distB.K.diff[i] }, EC: { inst: distE.K.inst[i], diff: distE.K.diff[i] } };
    const per = {};
    for (const code of ['BAEL', 'EC']) {
      const combos = code === 'BAEL' ? heads[i].F61 : heads[i].EC;
      const gU = 1.35;
      let base, shaftRes, extra = {};
      if (!end) {
        const P = sp.pile, Hf = Hpile(i), col = P.type === 'colonnes';
        const Wchev = col && P.hc > 0 ? 25 * P.hc * P.lc * width : 0;
        const Wfut = col ? 25 * P.nCol * Math.PI * P.D ** 2 / 4 * Hf : 25 * Lv * bMean * Hf;
        const arm = Hf + (col ? P.hc : 0);
        base = combos.map(cb => {
          const g = cb.ls === 'ELU' ? gU : 1, Mimp = cb.imp ? cb.imp.F * cb.imp.h : 0;
          const wt = cb.wat;   // crue : courant + embâcles appliqués au fût (sens du courant, transversal), Archimède sur le fût
          return { ...cb, Nb: cb.N + g * (Wchev + Wfut) - (wt ? wt.U : 0), Mb: cb.H * arm + Mimp, Mimp, Myb: (cb.Hy || 0) * arm + (wt ? wt.M : 0), Hb: cb.H + (cb.imp ? cb.imp.F : 0), Hyb: (cb.Hy || 0) + (wt ? wt.F : 0) };
        });
        const shape = col ? { D: P.D, c: c + 0.01, nBars: 12 } : { b: Lv, h: bBot, c: c + 0.01, ...(bTop !== bBot ? { hBuck: bMin } : {}) };
        shaftRes = designShaft({ shape, code, fck, fyk, Hf, combos: base.filter(b => b.ls !== 'ELS' && !b.fond).map(b => ({ label: b.label, N: b.Nb, M: b.Mb - b.Mimp, Mloc: b.Mimp, My: b.Myb, acc: !!b.acc })), n: col ? P.nCol : 1 });
        if (col && P.hc > 0) {
          const nb = bearings.nb, pitch = bearingSpacing({ width, psi: st.p.concept.psi, n: nb });
          const ys = Array.from({ length: nb }, (_, k) => width / 2 + (k - (nb - 1) / 2) * pitch);
          const row = bearings.rows[i], kQ = code === 'BAEL' ? 1.605 : 1.35;
          const Pu = (jG(i) * 1.35 * row.kCP * perm.Rmax[i] + hypMax[i] + jQ(i) * kQ * row.kQ * Math.max(0, row.Rmax - perm.Rmax[i])) / nb;
          extra.cap = pierCap({ length: width, supports: Array.from({ length: P.nCol }, (_, j) => ({ x: width * (2 * j + 1) / (2 * P.nCol) })), loads: ys.map(y => ({ x: y, P: Pu })), q: 1.35 * 25 * P.hc * P.lc, b: P.lc, h: P.hc, c, fck, fyk, code });
          extra.cap.Pu = Pu;
        }
      } else {
        const C = sp.culee, Hm = C.Hm, rem = C.type === 'remblayee', app = C.type === 'apparente';
        // poussée : mur de front ; pile-culée noyée : colonnes de largeur fictive min(3D ; entraxe) (hypothèse PSIDA, pratique
        // des guides de culées) ; pile-culée apparente : partie haute seulement (PP73 1.3.2 § 3.1.3.1, i = 1/3, p = 15 kPa)
        const ep = app ? earthPressureUpper({ h1: hGG + C.hc + Math.max(0, C.hv), Htot: Hm + C.hc + hGG, L: width, gamma: soil.gamma })
          : earthPressure({ H: Hm + hGG, B: rem ? width : C.nCol * Math.min(3 * C.D, width / C.nCol), K: KA, gamma: soil.gamma, q: soil.q });
        const dt = dalleTransition({ Hr: Hm + hGG });
        const Wtop = rem ? 25 * (0.3 * hGG + 1.0 * (C.em + 0.3)) * width : 25 * C.hc * C.lc * width + 25 * 0.3 * hGG * width;
        const Wwall = rem ? 25 * C.em * Hm * width : 25 * C.nCol * Math.PI * C.D ** 2 / 4 * Hm;
        const mr = murEnRetour({ L: C.Lret, h: Hm + hGG });
        const Wret = 2 * 25 * mr.e * C.Lret * (Hm + hGG) / 2;
        base = combos.map(cb => {
          const elu = cb.ls === 'ELU', g = elu ? gU : 1, gq = cb.ls === 'ACC' ? 0 : code === 'BAEL' ? (elu ? 1.605 : 1.2) : (elu ? 1.35 : 1);
          const Hb = cb.H + g * ep.Pg + gq * ep.Pq;
          return { ...cb, Nb: cb.N + g * (Wtop + Wwall + Wret + dt.Rg * width) + gq * dt.Rq * width / 3, Mb: cb.H * (Hm + (rem ? 0 : C.hc)) + g * ep.Mg + gq * ep.Mq, Hb };
        });
        // culée sans tablier (remblai mis en place avant la pose du tablier, PP73 1.3.2 § 3.1.4.6)
        base.push(...videCombos({ W: Wtop + Wwall + Wret, ep, code }));
        extra.earth = { ...ep, K: app ? ep.i : KA, Htot: Hm + hGG, mode: app ? 'partie haute (PP73 § 3.1.3.1)' : rem ? 'mur de front' : 'colonnes, largeur fictive min(3D ; entraxe)' };
        const shape = rem ? { b: 1, h: C.em, c: c + 0.01 } : { D: C.D, c: c + 0.01, nBars: 12 };
        shaftRes = designShaft({ shape, code, fck, fyk, Hf: Hm, combos: base.filter(b => b.ls !== 'ELS' && !b.fond).map(b => ({ label: b.label, N: b.Nb, M: b.Mb, My: (b.Hy || 0) * Hm, acc: !!b.acc })), n: rem ? width : C.nCol, pileCulee: !rem, strip: rem });
        const gg = gardeGreve({ h: hGG, K: KA, gamma: soil.gamma, dalleSurGG: !!C.dalle });
        const ggAs = (requiredSteelNM({ b: 1, h: gg.e, c }, { code, fck, fyk }, 0, gg.ELU).As ?? NaN) / 2;
        // face avant : moment de sens opposé M' = −3,2 t·m/m (PP73 1.3.2 § 2.3.3, sollicitation du 1er genre → ELU × 1,6/1,2)
        const ggAv = (requiredSteelNM({ b: 1, h: gg.e, c }, { code, fck, fyk }, 0, gg.Mrev * 1.6 / 1.2).As ?? NaN) / 2;
        extra.gg = { ...gg, h: hGG, As: Math.max(ggAs, 0.001 * gg.e), AsAvant: Math.max(ggAv, 0.001 * gg.e) };
        const hh = Hm + hGG;
        extra.retour = { ...mr, L: C.Lret, h: hh, AsH: Math.max((requiredSteelNM({ b: hh / 2, h: mr.e, c }, { code, fck, fyk }, 0, 1.35 * mr.Mh).As ?? NaN) / 2, mr.Amin * hh / 2), AsV: (requiredSteelNM({ b: mr.e, h: Math.max(0.5, hh / 2), c }, { code, fck, fyk }, 0, 1.35 * mr.Mv).As ?? NaN) / 2 };
        if (!rem && C.hc > 0) {
          const nb = bearings.nb, pitch = bearingSpacing({ width, psi: st.p.concept.psi, n: nb });
          const ys = Array.from({ length: nb }, (_, k) => width / 2 + (k - (nb - 1) / 2) * pitch);
          const row = bearings.rows[i], kQ = code === 'BAEL' ? 1.605 : 1.35;
          const Pu = (jG(i) * 1.35 * row.kCP * perm.Rmax[i] + hypMax[i] + jQ(i) * kQ * row.kQ * Math.max(0, row.Rmax - perm.Rmax[i])) / nb;
          // PP73 1.3.2 § 2.2.2 : garde-grève (poids propre), dalle de transition (15 + D) t/ml ou, sans dalle, 5,5 t/ml × 2 = 11 t/ml ;
          // murs en retour ou murettes : poids propre et charge verticale à l'extrémité (4 tf, murettes ≤ 2,5 m : 5 tf) ;
          // valeurs du 1er genre → ELU × 1,35
          const qGG = 25 * gg.e * hGG, qDalle = C.dalle ? 10 * (15 + dt.L) : 110;
          const Pend = 1.35 * (Wret / 2 + (mr.murette ? 50 : 40));
          extra.cap = pierCap({ length: width, supports: Array.from({ length: C.nCol }, (_, j) => ({ x: width * (2 * j + 1) / (2 * C.nCol) })), loads: [...ys.map(y => ({ x: y, P: Pu })), { x: 0, P: Pend }, { x: width, P: Pend }],
            q: 1.35 * (25 * C.hc * C.lc + qGG + qDalle), b: C.lc, h: C.hc, c, fck, fyk, code });
          extra.cap.Pu = Pu; extra.cap.qGG = qGG; extra.cap.qDalle = qDalle; extra.cap.Pend = Pend;
          // torsion due au garde-grève (PP73 1.3.2 § 2.2.4), entraxe des colonnes
          extra.torsion = chevetreTorsion({ hg: hGG, hc: C.hc, b: C.lc, e: width / C.nCol, V: extra.cap.V, code, fck, fyk, c });
        }
      }
      // --- fondation ---
      const Fl = F0(i), bWall = end ? (sp.culee.type === 'remblayee' ? sp.culee.em : sp.culee.D) : (sp.pile.type === 'voile' ? sp.pile.b : sp.pile.D);
      const Lf = (end ? width : (sp.pile.type === 'voile' ? Lv : width)) + 1.0;
      const wl = water[i], dAff = wl ? wl.dAff : 0;
      // crue : Archimède sur la semelle (ρ g V), effort transversal combiné (glissement, effort par pieu), moment transversal
      const armHead = end ? sp.culee.Hm + (sp.culee.type === 'remblayee' ? 0 : sp.culee.hc) : Hpile(i) + (sp.pile.type === 'colonnes' ? sp.pile.hc : 0);
      const fdDe = Wsem => base.map(b => {
        const g = b.ls === 'ELU' && !b.vide ? gU : 1, Hy = b.Hyb || 0, wt = !!b.wat;
        // part instantanée (trafic, freinage, TCD, séisme, chocs) des efforts au niveau des têtes de pieux (modèle PSH)
        const Hi = (b.Hinst || 0) + (b.imp ? b.imp.F : 0), Vi = b.Nsus !== undefined && b.N !== undefined ? b.N - b.Nsus : 0;
        const Mi = (b.Hinst || 0) * (armHead + F.hs) + (b.imp ? b.imp.F * (b.imp.h + F.hs) : 0);
        return { label: b.label, ls: b.ls, V: b.Nb + g * Wsem - (wt ? 10 * Wsem / 25 : 0), H: Math.hypot(b.Hb, wt ? Hy : 0), Hx: b.Hb, Hy, M: b.Mb + b.Hb * F.hs, My: (b.Myb || 0) + Hy * F.hs, crue: wt, vide: !!b.vide, acc: !!b.acc, inst: { V: Vi, H: Hi, M: Mi } };
      });
      const checksDe = (B, fd) => fd.map(f => {
        const r = { ...f, ...shallowFooting({ code, B, L: Lf, D: F.De, De: F.De, V: f.V, H: f.H, M: f.M, ls: f.ls, profile, phi: soil.phi, gamma: soil.gamma, dAff: f.crue ? dAff : 0 }) };
        // excentricité transversale (sens L) sous la crue : noyau central L/6 (contrôle simple, non intégré à la portance)
        if (f.crue) { r.eY = Math.abs(f.My) / f.V; r.eYok = r.eY <= Lf / 6; r.excOk = r.excOk && r.eYok; }
        return r;
      });
      // largeur de semelle : donnée, ou dimensionnée (1er calcul, B vide) — plus petite largeur vérifiant toutes les combinaisons
      let F = Fl, Bdim = false;
      if (Fl.type === 'superficielle' && sp.found.Bauto && !sp.found.Bligne && !(niv.parLigne[i] && niv.parLigne[i].found && niv.parLigne[i].found.B > 0)) {
        const vaut = B => checksDe(B, fdDe(25 * B * Lf * Fl.hs)).every(k => Number.isFinite(k.ratioV) && k.ratioV <= 1 + 1e-9 && (k.ratioH ?? 0) <= 1 + 1e-9 && k.excOk);
        let B = Math.max(1.5, Math.ceil((bWall + 0.5) / 0.25 - 1e-9) * 0.25);
        while (B < 12 - 1e-9 && !vaut(B)) B += 0.25;
        F = { ...Fl, B: Math.round(B * 100) / 100 }; Bdim = true;
      } else if (sp.found.Bauto && BligneDe(i) != null) Bdim = true;
      const Wsem = 25 * F.B * Lf * F.hs, fd = fdDe(Wsem);
      let found;
      if (F.type === 'superficielle') {
        const checks = checksDe(F.B, fd);
        const eluMax = fd.filter(f => f.ls === 'ELU').reduce((a, f) => (f.V * (1 + 3 * Math.abs(f.M) / f.V / F.B) > a.Nn ? { f, Nn: f.V * (1 + 3 * Math.abs(f.M) / f.V / F.B) } : a), { Nn: 0 });
        const d = F.hs - c - 0.01, fsu = fyk / 1.15;
        const eMax = Math.max(...fd.map(f => Math.abs(f.M) / f.V));
        found = { type: 'superficielle', B: F.B, Bauto: Bdim, L: Lf, hs: F.hs, W: Wsem, checks, scour: wl ? { dAff, De: F.De, ok: F.De > dAff } : null, worstV: Math.max(...checks.map(k => k.ratioV)), worstH: Math.max(...checks.map(k => k.ratioH)), excOk: checks.every(k => k.excOk),
          bielles: { dOk: d >= (F.B - bWall) / 4, eOk: eMax <= F.B / 6, eMax, N: eluMax.Nn, label: eluMax.f ? eluMax.f.label : '', d, b: bWall, As: footingStrutTie({ N: eluMax.Nn, B: F.B, b: bWall, d, fsu }) } };
        // méthode des consoles (e > B/6 ou semelle trop mince pour les bielles) : combinaison ELU donnant le plus grand moment en S₁
        found.console = fd.filter(f => f.ls === 'ELU').map(f => ({ label: f.label, V: f.V, M: f.M, ...footingCantilever({ V: f.V, M: f.M, B: F.B, L: Lf, b: bWall, d, fsu }) })).reduce((a, r) => (!a || r.M1 > a.M1 ? r : a), null);
        found.AsMin = 0.0012 * F.hs * Lf;
        found.method = found.bielles.dOk && found.bielles.eOk ? 'bielles' : 'console';
        found.AsLong = Math.max(found.method === 'bielles' ? found.bielles.As : found.console.As, found.AsMin);
        // tassement sous charges quasi permanentes : part soutenue des combinaisons ELS (hors crue)
        try {
          const qp = fd.filter(f => f.ls !== 'ELU' && f.ls !== 'ACC' && !f.crue).reduce((a, f) => (f.V - f.inst.V > a.V ? { V: f.V - f.inst.V, M: f.M - f.inst.M } : a), { V: 0, M: 0 });
          found.settle = footingSettlement({ profile, B: F.B, L: Lf, D: F.De, Vqp: qp.V, Mqp: Math.abs(qp.M), gamma: soil.gamma, code });
        } catch (e) { found.settle = { error: e.message }; }
        // sens transversal : semelle filante sous voile → aciers de répartition ≥ 1/4 des aciers principaux (par m) ;
        // sous colonnes → poutre renversée sur les colonnes chargée par la réaction du sol uniforme
        const nc = end ? (sp.culee.type !== 'remblayee' ? sp.culee.nCol : 0) : (sp.pile.type === 'colonnes' ? sp.pile.nCol : 0);
        if (nc > 0) {
          const off = (Lf - width) / 2, Vu = eluMax.f ? eluMax.f.V : 0;
          const bm = pierCap({ length: Lf, supports: Array.from({ length: nc }, (_, j) => ({ x: off + width * (2 * j + 1) / (2 * nc) })), loads: [], q: -Vu / Lf, b: F.B, h: F.hs, c, fck, fyk, code, rhoMin: 0.0012 });
          found.trans = { mode: 'poutre sur colonnes', Mneg: bm.Mneg, Mpos: bm.Mpos, AsTop: bm.AsTop, AsBot: bm.AsBot };
          found.AsTransPerM = Math.max(bm.AsTop, bm.AsBot) / F.B;
        } else found.AsTransPerM = found.AsLong / Lf / 4;
        found.AsTransPerM = Math.max(found.AsTransPerM, 0.0012 * F.hs);
      } else {
        const nF = nF0(i), nP = nP0(i), D = Dp(i), PL = pilesLong(i);
        const xsP = PL.map(p => p.x);
        const kHead = soilLaw(i, 0).k;
        const pc = pileE(code, i).pc;
        // crue : longueur de pieu dégagée sous la semelle par l'affouillement (sol sans réaction latérale ni frottement)
        const expo = wl ? Math.min(Math.max(0, dAff - F.De), 0.9 * F.Lpile) : 0;
        const head = F.tete || 'encastre', hR = hRem(i), Lf_ = Lfoot(i);
        const lawZ = Array.from({ length: 241 }, (_, j) => soilLaw(i, j * F.Lpile / 240));
        // poussée des terres du remblai traversé sur les pieux (culées) : p = K_a (γ σ + q) sur une largeur b = min(3 Ø ; entraxe)
        // (même règle que pour les colonnes enterrées ; hypothèse PSIDA), action permanente (terres) et variable (surcharge)
        const bEff = Math.min(3 * D, Lf_ / nP);
        const earthLoad = f => {
          if (!(hR > 0)) return null;
          const elu = f.ls === 'ELU', gE = f.ls === 'ACC' ? 1 : elu ? 1.35 : 1, gQ = f.ls === 'ACC' ? 0 : code === 'BAEL' ? (elu ? 1.605 : 1.2) : (elu ? 1.35 : 1);
          return z => (z < hR ? RB.Ka * (gE * RB.gamma * (F.De + z) + gQ * soil.q) * bEff : 0);
        };
        /**
         * Modèle PSH : efforts au niveau des têtes de pieux décomposés en part soutenue (modules différés du béton, k × kSus)
         * et part instantanée ; plan longitudinal (V, M, H) ; plan transversal (H_y, M_y, part instantanée) ; superposition
         * des déplacements, des efforts en tête et des profils le long des pieux (résultante des deux plans). Réaction du sol
         * bornée par le palier B p*_f (F62 C.5 ; NF P 94-262 I) : modules sécants nœud par nœud, itérations jusqu'à
         * stabilisation (même réduction pour tous les pieux du groupe, déterminée par le pieu le plus sollicité).
         */
        const analyse = f => {
          let fac = null, it = 0, plast = 0, ratio = 0, a;
          for (; it < 15; it++) {
            a = analyseLin(f, fac);
            // réaction totale par nœud, pieu le plus sollicité
            const r = lawZ.map((_, j) => Math.max(...a.files.map(fl => Math.hypot(fl.prof[j].pI, fl.prof[j].pT) * D)));
            ratio = Math.max(...r.map((v, j) => v / lawZ[j].rmax));
            if (ratio <= 1.02) break;
            const prev = fac ? fac.f : new Array(241).fill(1);
            const nf = prev.map((v, j) => (r[j] > lawZ[j].rmax ? v * lawZ[j].rmax / r[j] : v));
            plast = nf.filter(v => v < 0.999).length;
            fac = { f: nf, key: `${f.label}|${it}` };
          }
          return { ...a, plast: { nodes: fac ? fac.f.filter(v => v < 0.999).length : 0, iterations: it, ratio, zMax: fac ? Math.max(0, ...fac.f.map((v, j) => (v < 0.999 ? j * F0.Lpile / 240 : 0))) : 0 } };
        };
        const analyseLin = (f, fac) => {
          const g = { inst: groupsOf(i, code, 'inst', f.crue ? expo : 0, fac), sus: groupsOf(i, code, 'sus', f.crue ? expo : 0, fac) };
          const sus = { V: f.V - f.inst.V, M: f.M - f.inst.M, H: f.Hx - f.inst.H };
          const el = earthLoad(f), lc = el ? g.sus.wp.loadCase(el) : null;
          const rI = g.inst.long.respond(f.inst.V, f.inst.M, f.inst.H), rS = g.sus.long.respond(sus.V, sus.M, sus.H, lc);
          const rT = (f.Hy || f.My) ? g.inst.trans.respond(0, f.My || 0, f.Hy || 0) : null;
          const piles = rI.piles.map((pI, k) => {
            const pS = rS.piles[k], pT = rT ? rT.piles[k] : null;
            return { x: pI.x, omega: pI.omega, file: PL[k].file, N: pI.N + pS.N + (pT ? pT.N : 0), Nsus: pS.N, Ninst: pI.N + (pT ? pT.N : 0), Tlong: pI.T + pS.T, t: pI.t + pS.t, phi: pI.phi + pS.phi, a: pI.a + pS.a, pI, pS, pT };
          });
          // profils par file (pieux d'une file : mêmes déplacements dans le plan longitudinal) et profil transversal commun
          const files = [...new Set(piles.map(p => p.file))].map(fi => {
            const pk = piles.find(p => p.file === fi);
            const prI = pileProfile(g.inst.wp, pk.pI.t, pk.pI.phi, head), prS = pileProfile(g.sus.wp, pk.pS.t, pk.pS.phi, head, lc);
            const prT = pk.pT ? pileProfile(g.inst.wp, pk.pT.t, pk.pT.phi, head) : null;
            const prof = prI.map((q, j) => ({ z: q.z, M: q.M + prS[j].M, T: q.T + prS[j].T, y: q.y + prS[j].y, p: q.p + prS[j].p, pI: q.p + prS[j].p, pT: prT ? prT[j].p : 0, Mt: prT ? prT[j].M : 0, Tt: prT ? prT[j].T : 0, yt: prT ? prT[j].y : 0 }));
            const Ms = prof.map(q => Math.hypot(q.M, q.Mt)), Ts = prof.map(q => Math.hypot(q.T, q.Tt));
            const jM = Ms.indexOf(Math.max(...Ms));
            const Nf = piles.filter(p => p.file === fi);
            return { file: fi, x: pk.x, omega: pk.omega, Nmax: Math.max(...Nf.map(p => p.N)), Nmin: Math.min(...Nf.map(p => p.N)), NsusMax: Math.max(...Nf.map(p => p.Nsus)), NinstMax: Math.max(...Nf.map(p => p.Ninst)),
              Mhead: Ms[0], Mmax: Ms[jM], zMmax: prof[jM].z, Tmax: Math.max(...Ts), y0: Math.hypot(prof[0].y, prof[0].yt), pmax: Math.max(...prof.map(q => Math.hypot(q.p, q.pT))), prof };
          });
          const cap = { u: rI.q[2] + rS.q[2], w: rI.q[0] + rS.q[0], theta: rI.q[1] + rS.q[1] };
          return { files, piles, cap };
        };
        const G = { inst: groupsOf(i, code, 'inst'), sus: groupsOf(i, code, 'sus') };
        const rows = fd.map(f => {
          const a = analyse(f);
          return { ...f, psh: a, Nmax: Math.max(...a.files.map(x => x.Nmax)), Nmin: Math.min(...a.files.map(x => x.Nmin)), Hp: Math.abs(f.H) / xsP.length, Mhead: Math.max(...a.files.map(x => x.Mhead)),
            Mmax: Math.max(...a.files.map(x => x.Mmax)), Tmax: Math.max(...a.files.map(x => x.Tmax)), y0: Math.max(...a.files.map(x => x.y0)), pmax: Math.max(...a.files.map(x => x.pmax)) };
        });
        const elu = rows.filter(r => r.ls === 'ELU' && !r.crue), els = rows.filter(r => r.ls === 'ELS' && !r.crue), eluAll = rows.filter(r => r.ls === 'ELU'), accR = rows.filter(r => r.ls === 'ACC');
        const shapeP = { D, c: 0.07, nBars: 12 };
        // béton de pieu foré : BAEL / F62-V f_c = min(f_c28 ; 25)/(k₁ k₂), k₁ = 1,2 (groupe B), k₂ = 1,05 ; EC2 § 2.4.2.5 : γ_c × k_f = 1,1
        const pileMat = code === 'BAEL' ? { code, fck: pc.fc, fyk } : { code, fck: Math.min(fck, 30), fyk, gammaC: 1.5 * 1.1 };
        const pileMatAcc = { ...pileMat, gammaC: code === 'BAEL' ? 1.15 : 1.2, gammaS: 1.0 };
        // option : excentricités additionnelle et du second ordre dans les pieux (pratique de certaines notes, BAEL A.4.4) —
        // e_a = max(2 cm ; l_f/250), e₂ = 3 l_f²/(10⁴ D) (2 + α φ), φ = 2, α = part permanente de N, l_f = 2 l₀,
        // l₀ = (4 E I/k)^¼ longueur de transfert du pieu (module de réaction en tête) ; ELU seulement
        let pileSO = null;
        if (F.secondOrdre) {
          const Ep = pileE(code, i).inst, Ip = Math.PI * D ** 4 / 64, kh = Math.max(1, soilLaw(i, Math.min(D, F.Lpile / 2)).k);
          const l0 = (4 * Ep * Ip / kh) ** 0.25, lf = 2 * l0, ea = Math.max(0.02, lf / 250);
          pileSO = { l0, lf, ea, kh, e2: alpha => 3 * lf ** 2 / (1e4 * D) * (2 + 2 * alpha) };
        }
        const eSO = r => { if (!pileSO || r.ls !== 'ELU') return 0; const p0 = r.psh.piles.reduce((m, q) => (q.N > m.N ? q : m)); const al = p0.N > 0 ? Math.min(1, Math.max(0, p0.Nsus / p0.N)) : 1; return pileSO.ea + pileSO.e2(al); };
        const AsOf = (r, mt) => { const M = r.Mmax + Math.max(0, r.Nmax) * eSO(r); return Math.max(requiredSteelNM(shapeP, mt, Math.max(0, r.Nmin), r.Mmax + Math.max(0, r.Nmin) * eSO(r)).As ?? Infinity, requiredSteelNM(shapeP, mt, r.Nmax, M).As ?? Infinity); };
        const AsP = Math.max(...eluAll.map(r => AsOf(r, pileMat)), ...accR.map(r => AsOf(r, pileMatAcc)));
        // remblai traversé (culées) : frottement compté dans le terrain naturel seulement
        const DheadC = hR > 0 ? 0 : F.De, LpileC = F.Lpile - hR;
        const cap = pileCapacity({ code, type: F.pileType, D, Lpile: LpileC, profile, Dhead: DheadC });
        // portance en crue : frottement compté sous le fond affouillé (même pointe)
        const capW = expo > 0 ? pileCapacity({ code, type: F.pileType, D, Lpile: LpileC - expo, profile, Dhead: DheadC + expo }) : cap;
        const crueR = rows.filter(r => r.crue);
        const scour = wl ? { dAff, expo, capW, ratioELU: capW.applicable && crueR.some(r => r.ls === 'ELU') ? Math.max(...crueR.filter(r => r.ls === 'ELU').map(r => r.Nmax)) / capW.Rcd : NaN,
          ratioELS: capW.applicable && crueR.some(r => r.ls === 'ELS') ? Math.max(...crueR.filter(r => r.ls === 'ELS').map(r => r.Nmax)) / capW.Rcrd : NaN } : null;
        const NmaxU = Math.max(...elu.map(r => r.Nmax)), NmaxS = Math.max(0, ...els.map(r => r.Nmax)), NminU = Math.min(...elu.map(r => r.Nmin));
        const NminS = Math.min(...els.map(r => r.Nmin));
        const NmaxA = accR.length ? Math.max(...accR.map(r => r.Nmax)) : 0;
        const capRatio = cap.applicable ? { ELU: NmaxU / cap.Rcd, ELS: NmaxS / cap.Rcrd, ACC: accR.length ? NmaxA / cap.RcdAcc : 0, traction: NminU < 0 ? -NminU / cap.Rtd : 0,
          tractionELS: NminS < 0 ? (code === 'BAEL' ? -NminS / (0.7 * cap.Rs / 1.4) : -NminS / (cap.Rtd / 1.1)) : 0 } : { ELU: NaN, ELS: NaN, traction: NaN, tractionELS: NaN };
        // frottement négatif (culées sur remblai d'accès, sols compressibles) : Combarieu ; cumul F62 C.3.3 / EN 1997-1 7.3.2 :
        // N_d = N_G + max(γ G_sn ; N_Q), γ = 1,35 à l'ELU (1,0 à l'ELS) ; portance sans frottement positif au-dessus de la
        // hauteur d'action
        let negFr = null;
        const FN = sp.found.fn || {};
        if (end && FN.actif) {
          const hRembV = FN.h ?? (sp.culee.Hm + hGG);
          const fnr = negativeFrictionPiles({ profile, D, type: F.pileType, hRemb: hRembV, hR, gamma: RB.gamma || soil.gamma, q: soil.q, h2: FN.h2 ?? null, Dhead: DheadC, dFile: Lf_ / nP, dRow: nF > 1 ? F.sPile : null, nFiles: nF });
          if (fnr.applicable) {
            const cum = (rs, gFn) => Math.max(...rs.flatMap(r => r.psh.piles.map(p => p.Nsus + Math.max(gFn * fnr.Fn, p.Ninst))));
            const NfnU = cum(elu, 1.35), NfnS = cum(els, 1.0);
            const zN = Math.max(DheadC, fnr.hAction), tipZ = DheadC + LpileC;
            const capFn = pileCapacity({ code, type: F.pileType, D, Lpile: tipZ - zN, profile, Dhead: zN });
            negFr = { ...fnr, hRemb: hRembV, NfnU, NfnS, capFn, ratioELU: capFn.applicable ? NfnU / capFn.Rcd : NaN, ratioELS: capFn.applicable ? NfnS / capFn.Rcrd : NaN };
          } else negFr = fnr;
        }
        // tassement sous charges quasi permanentes (part soutenue des combinaisons ELS) : Frank et Zhao + semelle fictive
        let settle = null;
        try {
          const NqpPile = Math.max(...els.map(r => Math.max(...r.psh.files.map(fl => fl.NsusMax)))), Vqp = Math.max(...els.map(r => r.V - r.inst.V));
          const Bg = (nF - 1) * (nF > 1 ? F.sPile : 0) + D, Lg = (nP - 1) * (Lf_ / nP) + D;
          settle = pileGroupSettlement({ profile, D, Lpile: LpileC, Dhead: DheadC, Ep: pc.Ei || 30000, capDetail: cap.detail, NqpPile, Vqp, Bg, Lg, type: F.pileType, code });
          settle.NqpPile = NqpPile; settle.Vqp = Vqp;
        } catch (e) { settle = { error: e.message }; }
        // fiche minimale par état limite (ELS quasi permanent, ELS rare / caractéristique, ELU, accidentel) à charges en tête inchangées
        let fiche = null;
        try {
          const NqpP = Math.max(0, ...els.map(r => Math.max(...r.psh.files.map(fl => fl.NsusMax))));
          fiche = minPileLength({ code, type: F.pileType, D, profile, Dhead: DheadC, loads: { QP: NqpP, ELS: NmaxS, ELU: NmaxU, ...(accR.length ? { ACC: NmaxA } : {}) }, Lmax: Math.max(2 * LpileC, 40) });
          fiche.Lretenu = LpileC; fiche.NqpP = NqpP;
          if (cap.applicable && Number.isFinite(cap.Rqp)) capRatio.QP = NqpP / cap.Rqp;
        } catch (e) { fiche = { error: e.message }; }
        // effet de groupe (F62 C.4.1,2 et annexe G.1 ; NF P 94-262 annexe J) : Converse-Labarre / formule J.2
        const dP = nF > 1 ? Math.min(F.sPile, Lf / nP) : Lf / nP;
        // F62 annexe G.1 § 2.5 : sols cohérents Ce = ¼(1 + d/B) (1 au-delà de d = 3B), sols frottants Ce = 1 ; NF P 94-262 J.2
        const Ce = code === 'BAEL' ? (isCohesive(profile.at(F.De + F.Lpile / 2).classe) ? efficaciteCoherentF62({ B: D, d: dP }) : 1) : efficaciteEC7({ B: D, d: dP, m: nF, n: nP });
        const VmaxU = Math.max(...elu.map(r => r.V));
        const group = cap.applicable ? { Ce: Math.min(1, Ce), d: dP, ratio: VmaxU / (Math.min(1, Ce) * xsP.length * cap.Rcd) } : null;
        const sigSels = code === 'BAEL' ? sigmaSBAEL({ fe: fyk, fc28: fck, fiss: 'FTP' }) : 0.8 * fyk;
        let tie = null, capBeam = null, capFiles = null;
        // semelle sur n files : bielles généralisées (réaction par pieu de chaque file) et flexion au nu du fût ; ELU et ELS
        if (nF >= 2) {
          const filesOf = r => r.psh.files.map(fl => ({ x: fl.x, R: fl.Nmax }));
          const env = (rs, fs) => rs.reduce((acc, r) => { const c = pileCapFiles({ files: filesOf(r), b: bWall, hs: F.hs, fsu: fs }); return !acc || c.A > acc.A || c.Abend > acc.Abend ? { ...c, A: Math.max(c.A, acc ? acc.A : 0), Abend: Math.max(c.Abend, acc ? acc.Abend : 0), label: r.label } : acc; }, null);
          const cu = env(elu, fyk / 1.15), cs = env(els, sigSels);
          capFiles = { ELU: cu, ELS: cs, A: Math.max(cu ? cu.A : 0, cs ? cs.A : 0), Abend: Math.max(cu ? cu.Abend : 0, cs ? cs.Abend : 0), perPileRow: nP };
        }
        if (nF === 2) {
          const t = pileCapTwoRows({ RU: NmaxU, RS: NmaxS, l: F.sPile, b: bWall, hs: F.hs, D, fsu: fyk / 1.15, sigSels, nPiles: xsP.length });
          tie = { ...t, perCouple: t.A1, total: t.A1 * nP };
        } else if (nF === 1) {
          // semelle filante sur une file de pieux (PP73 1.3.2 § 4.4) : poutre sur les pieux sous le voile (charge répartie) ou les colonnes
          const nc = end ? (sp.culee.type !== 'remblayee' ? sp.culee.nCol : 0) : (sp.pile.type === 'colonnes' ? sp.pile.nCol : 0);
          const Vu = Math.max(...elu.map(r => r.V)), off = (Lf - width) / 2;
          const piles = Array.from({ length: nP }, (_, k2) => ({ x: Lf * (2 * k2 + 1) / (2 * nP) }));
          const loads = nc > 0 ? Array.from({ length: nc }, (_, j) => ({ x: off + width * (2 * j + 1) / (2 * nc), P: (Vu - gU * Wsem) / nc })) : [];
          const bm = pierCap({ length: Lf, supports: piles, loads, q: nc > 0 ? gU * Wsem / Lf : Vu / Lf, b: F.B, h: F.hs, c: 0.07, fck, fyk, code, rhoMin: 0.0012 });
          capBeam = { Mneg: bm.Mneg, Mpos: bm.Mpos, V: bm.V, AsTop: bm.AsTop, AsBot: bm.AsBot };
          // voile unique sur une file : semelle + base du voile en paroi fléchie (PP73 1.3.2 § 4.4)
          if (nc === 0) capBeam.paroi = paroiFlechie({ l: Lf / nP, lNu: Lf / nP - D, travees: nP - 1, hs: F.hs, Hwall: end ? (sp.culee.type === 'remblayee' ? sp.culee.Hm : 0) : Hpile(i), Mt: bm.Mpos, Ma: bm.Mneg, fsu: fyk / 1.15 });
        }
        // effort tranchant des pieux (T max le long du pieu, résultante des deux plans)
        const TmaxU = Math.max(0, ...eluAll.map(r => r.Tmax)), TmaxA = accR.length ? Math.max(...accR.map(r => r.Tmax)) : 0;
        const shear = { ELU: pileShear({ V: TmaxU, D, As: Math.max(AsP, pileMinSteel({ D, code })), fck: code === 'BAEL' ? pc.fc : Math.min(fck, 30), fyk, code, gammaC: 1.65 }),
          ACC: accR.length ? pileShear({ V: TmaxA, D, As: Math.max(AsP, pileMinSteel({ D, code })), fck: code === 'BAEL' ? pc.fc : Math.min(fck, 30), fyk, code, gammaC: 1.2 }) : null, TmaxU, TmaxA };
        // sorties PSH : matrices de souplesse de la tête d'appui, cas dimensionnants (N max ELU, M max ELU, ELS)
        const pick = (rs, key) => rs.reduce((a, r) => (!a || r[key] > a[key] ? r : a), null);
        const psh = { flex: { inst: headFlex(i, code, 'inst'), sus: headFlex(i, code, 'sus') }, K: { inst: G.inst.long.K, sus: G.sus.long.K }, kSus: soil.kSus ?? 0.5, head, tip: F0.pied || 'libre',
          gov: [['ELU — N max', pick(eluAll, 'Nmax')], ['ELU — M max', pick(eluAll, 'Mmax')], ['ELS — N max', pick(els, 'Nmax')], ...(accR.length ? [['ACC — M max', pick(accR, 'Mmax')]] : [])].filter(([, r]) => r) };
        // semelle sur 4 pieux (2 × 2) sous un poteau unique : méthode de Blévot
        let blev = null;
        const singleCol = end ? (sp.culee.type !== 'remblayee' && sp.culee.nCol === 1) : (sp.pile.type === 'colonnes' && sp.pile.nCol === 1);
        if (nF * nP === 4 && nF === 2 && singleCol) {
          const Dc = end ? sp.culee.D : sp.pile.D, aEq = Dc * Math.sqrt(Math.PI) / 2, apE = (F.sPile + Lf_ / nP) / 2;
          const PuMax = Math.max(...elu.map(r => r.V)) - gU * Wsem;
          blev = { ...blevot({ n: 4, Pu: PuMax, G0: Wsem, a: aEq, ap: apE, d: F.hs - 0.10, B: Math.PI * Dc ** 2 / 4, Bp: Math.PI * D ** 2 / 4, fc28: code === 'BAEL' ? fck : fck, fsu: fyk / 1.15, fiss: 'P' }), aEq, apE, nonCarre: Math.abs(F.sPile - Lf_ / nP) > 0.05 * apE, Pu: PuMax };
        }
        const plast = rows.reduce((a, r) => (r.psh.plast.nodes > a.nodes ? { ...r.psh.plast, label: r.label } : a), { nodes: 0 });
        found = { type: 'pieux', D, n: xsP.length, nF, nP, Lpile: F.Lpile, k: kHead, rows, psh, shear, capFiles, blev, negFr, settle, plast, fiche, pileSO: pileSO ? { l0: pileSO.l0, lf: pileSO.lf, ea: pileSO.ea, e2max: pileSO.e2(1), e2min: pileSO.e2(0) } : null, hR, earth: hR > 0 ? { Ka: RB.Ka, bEff, h: hR } : null, NmaxU, NmaxS, NminU, As: Math.max(AsP, pileMinSteel({ D, code })), AsReq: AsP, Amin: pileMinSteel({ D, code }), cap, capRatio, NmaxA, group, scour, pileConc: pc, tie, capBeam, sigSels, hs: F.hs, hOk: F.hs >= Math.max(0.60, nF === 2 ? 1.4 * D : D) - 1e-9, hMin: Math.max(0.60, nF === 2 ? 1.4 * D : D), W: Wsem };
      }
      let brg = null;
      try { brg = bearing1337(i, code); } catch (e) { brg = { error: e.message }; }
      let headChk = null;
      try { headChk = pierHead(i, code, brg); } catch (e) { headChk = { error: e.message }; }
      per[code] = { base, shaft: shaftRes, ...extra, found, brg, headChk };
    }
    out.BAEL = per.BAEL; out.EC = per.EC;
    out.warnings = geometryWarnings(sp, end, width, Lfoot(i));
    for (const t of (bearings.notes || [])) if (t.startsWith(`ligne ${i + 1} :`)) out.warnings.push(t.replace(/^ligne \d+ : /, ''));
    if (bearings.rows[i] && bearings.rows[i].liaison && bearings.rows[i].liaison !== 'elastomere') out.liaison = bearings.rows[i].liaison;
    if (jointAt(i)) out.warnings.push(`pile de joint : réactions du tablier adjacent prises égales à r_G = ${J.rG ?? 1}, r_Q = ${J.rQ ?? 1}, r_H = ${J.rH ?? 1} fois celles du tablier étudié (géométrie de pile commune aux autres piles)${sp.seisme.actif ? ' ; le calcul sismique (Pont EC8) traite encore cette ligne comme une culée' : ''}`);
    const hv = Math.max(0, ...(per.EC.found.rows || per.EC.found.checks || []).filter(r => r.ls === 'ELU' && !r.vide).map(r => Math.abs(r.H) / Math.max(1e-9, r.V)));
    if (sp.found.type !== 'superficielle' && hv > 0.20) out.warnings.push(`H/V = ${hv.toFixed(2)} > 0,20 à l'ELU : envisager des pieux inclinés (PP73 1.1.3 § 2.2.2.7)`);
    if (end && sp.found.type !== 'superficielle' && sp.found.nFiles === 1 && sp.found.pileD < 0.80 - 1e-9) out.warnings.push(`culée sur une file de pieux Ø ${sp.found.pileD} m : Ø 0,80 m minimal (PP73 1.2.3 § 1.2.3)`);
    return out;
  });
  const footRotAll = xs.every((_, i) => onPiles(i)) ? null : xs.map((x, i) => (onPiles(i) ? null : { BAEL: footRot(i, 'BAEL'), EC: footRot(i, 'EC') }));
  return { sp, niv, pente, centrifuge, distTB, distTE, spLigne: parLigne ? xs.map((_, i) => SL(i)) : null, xs, Lv, width, seisme, water, footRot: footRotAll, profiles: profs, distB, distE, braking: { F61: brk, EC: bearings.H }, eps: { RF, RFsaisi, psidp: dp && dp.shorten ? dp.shorten : null, TLD: sp.eps.TLD, TCD: sp.eps.TCD, T: epsT }, hyp: dp ? { max: hypMax, min: hypMin } : null, hGG, Ka: KA, lines };
}
