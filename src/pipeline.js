/**
 * Chaîne de calcul complète (sans DOM) : lecture des données du formulaire, tablier (permanentes, trafic EC et F61,
 * dimensionnement longitudinal et transversal), appareils d'appui, chevêtres, conception, compléments, plan de ferraillage.
 * Utilisée par l'interface (web/app.js) et par les tests / la génération de notes sous Node.
 */
import { designPSIDP, psidpDeflections, transversePrestress } from './psidp/index.js';
import { SlabDeck } from './analysis.js';
import { EC_ALPHA } from './loads_ec.js';
import { designEC, designBAEL, designTransverseEC, designTransverseBAEL, designSingleActionEC } from './design.js';
import { TransverseModel } from './transverse.js';
import { aideConception } from './conception.js';
import { designBearings, inequalityCoefficients, inequalityWheels, bearingSpacing, endRotations, parseDesignation } from './bearings.js';
import { chevetresEC } from './chevetre.js';
import { sectionDevers, bandesRevetement } from './devers.js';
import { woodArmer, woodArmerTous, transversalPlaque, chevetresPlaque, reactionsAppareils, renfortsAppareils } from './plate/design.js';
import { raideurAppareil } from './plate/deck.js';
import { parseAxles, vehicleEnvelope, provisionalProfile, ANNEX_A_VEHICLES, dynLM3 } from './vehicles.js';
import { zonage } from './zonage.js';
import { cantileverMoments, cantileverDesign } from './cantilever.js';
import { flm3Envelope, fatigueCheck } from './fatigue.js';
import { rebarPlan } from './rebar.js';
import { computeSupports } from './supports/index.js';

export const nums = s => String(s ?? '').split(/[,;\s]+/).filter(Boolean).map(Number);
const pairs = s => String(s ?? '').split(';').map(t => t.trim()).filter(Boolean).map(t => nums(t));

function parseK(t) { const m = t.match(/k\s*([\d.]+)\s*\/\s*([\d.]+)/i); return m ? { kmin: +m[1], kmax: +m[2], rest: t.replace(m[0], '') } : { kmin: 1, kmax: 1, rest: t }; }

export function parseData(d) {
  return appliquerDevers(parseData0(d));
}

/** Dévers rattrapé par la dalle (aire, inertie) ou par le revêtement (bandes de charge supplémentaires). */
function appliquerDevers(p) {
  const di = p.deckInput, dv = di.devers;
  if (!dv) return p;
  if (dv.mode === 'dalle') {
    const s = sectionDevers(di.width / 2, di.h, dv);
    if (di.area === undefined) di.area = s.A;
    if (p.I == null) p.I = s.I;
  }
  if (dv.mode === 'revetement') di.bands = [...di.bands, ...bandesRevetement(dv, di.roadway)];
  return p;
}

function parseData0(d) {
  const [y1, y2] = nums(d.roadway);
  const overhangs = nums(d.overhangs || '0,0');
  const EIv = d.EI.split(',').map(t => t.trim());
  return {
    deckInput: {
      spans: nums(d.spans), width: +d.width, h: +d.h, roadway: { y1, y2 },
      area: d.area.trim() ? +d.area : undefined, overhangs: [overhangs[0] || 0, overhangs[1] || 0],
      footways: pairs(d.footways).map(([a, b]) => ({ y1: a, y2: b })),
      lines: d.lines.split(';').map(t => t.trim()).filter(Boolean).map(t => { const k = parseK(t); const [g, e] = k.rest.split('@').map(Number); return { g, e, kmin: k.kmin, kmax: k.kmax }; }),
      bands: d.bands.split(';').map(t => t.trim()).filter(Boolean).map(t => { const k = parseK(t); const [q, r] = k.rest.split('sur'); const [a, b] = nums(r); return { q: +q, y1: a, y2: b, kmin: k.kmin, kmax: k.kmax }; }),
      ys: nums(d.ys), Leq: d.Leq.trim() ? nums(d.Leq) : undefined, leqMethod: d.leqMethod || 'moments',
      nu: +d.nu, laneStep: +d.laneStep, nSec: 20, nGrid: 100,
      chamfer: d.hEdge.trim() && d.joue.trim() ? { hEdge: +d.hEdge, joue: +d.joue } : undefined,
      psi: +(d.psi || 100),
      devers: +(d.devers || 0) > 0 ? { p: +d.devers, profil: d.devProfil === 'unique' ? 'unique' : 'toit', mode: ['dalle', 'revetement'].includes(d.devMode) ? d.devMode : 'inclinee' } : undefined,
    },
    methodeTablier: d.methodeTablier === 'plaque' ? 'plaque' : 'guyon',
    alpha: d.alpha, nRetenue: +d.nRetenue, classe: d.classe.trim() ? +d.classe : null, mil: d.mil || 'Mc120+D240', chamoaSign: !!d.chamoaSign,
    withTherm: !!d.withTherm, dT: nums(d.dT), E: +EIv[0] || 34000, I: EIv[1] ? +EIv[1] : null, delta: +d.delta, phiFluage: +d.phiFluage,
    mat: { fck: +d.fck, fyk: +d.fyk, fc28: +d.fck, fe: +d.fyk, c: +d.cover, phi: +d.phi / 1000, phiT: +(d.phiT || 16) / 1000, wkMax: +d.wk, fissuration: d.fiss, tRev: +d.tRev },
    extra: parseExtra(d),
    supports: parseSupports(d),
    bp: parseBP(d),
    concept: { psi: +(d.psi || 100), tirantAir: (d.tirantAir || '').trim() ? +d.tirantAir : null, type: d.typeDalle || 'auto', D: +(d.Dabout || 25) / 1000, rhoMax: +(d.rhoMax || 1) / 100,
      transversePerpendicular: d.transDir === 'perp', nBearings: (d.nBearings || '').trim() ? +d.nBearings : null, xFixed: (d.xFixed || '').trim() ? +d.xFixed : null, epsSlow: +(d.epsSlow || 2.5e-4), dTu: +(d.dTu || 30),
      bearingEnd: parseDesignation(d.brgCul), bearingPier: parseDesignation(d.brgPile) },
  };
}

/**
 * Profils pressiométriques (sondages). Une ligne « [SP1] » ouvre un profil nommé (sans en-tête : profil unique « SP1 »).
 * Couche : « z0 z1 classe p*_l E_M α [p*_f] » (m, m, classe F62, MPa, MPa, –, MPa) ; p*_l, E_M ou α peuvent valoir « - » : ils sont
 * alors tirés des essais de la couche (p*_l moyenne géométrique, E_M moyenne harmonique — pratique du bureau de calcul
 * fond.ksr-infra.org) et α du rapport E_M/p*_l (Ménard). Essai : « e z E_M p*_l [p*_f] » (m, MPa).
 * @returns {{name:string, layers:object[], tests:object[]}[]}
 */
export function parseProfiles(text) {
  const out = [];
  let cur = null;
  const num = w => (w === undefined || w === '-' || w === '' ? NaN : +String(w).replace(',', '.'));
  for (const raw of String(text || '').split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const h = t.match(/^\[(.+)\]$/);
    if (h) { cur = { name: h[1].trim(), layers: [], tests: [] }; out.push(cur); continue; }
    if (!cur) { cur = { name: 'SP1', layers: [], tests: [] }; out.push(cur); }
    const w = t.split(/[;\s]+/).filter(Boolean);
    if (/^e(ssai)?$/i.test(w[0])) {
      const e = { z: num(w[1]), EM: num(w[2]), plNette: num(w[3]), pfNette: num(w[4]) };
      if (Number.isFinite(e.z) && e.EM > 0 && e.plNette > 0) cur.tests.push(e);
      continue;
    }
    cur.layers.push({ z0: num(w[0]), z1: num(w[1]), classe: w[2], pl: num(w[3]), EM: num(w[4]), alpha: num(w[5]), pf: num(w[6]) });
  }
  for (const p of out) {
    p.layers = p.layers.filter(l => Number.isFinite(l.z0) && Number.isFinite(l.z1) && l.z1 > l.z0 && l.classe).map(l => {
      const v = valides => valides.filter(e => e.z >= l.z0 && e.z < l.z1);
      let ins = v(p.tests), estimee = false;
      if (!ins.length && p.tests.length && !(l.pl > 0 && l.EM > 0)) { const zm = (l.z0 + l.z1) / 2; ins = [p.tests.reduce((a, b) => (Math.abs(b.z - zm) < Math.abs(a.z - zm) ? b : a))]; estimee = true; }
      const pl = l.pl > 0 ? l.pl : ins.length ? Math.exp(ins.reduce((a, e) => a + Math.log(e.plNette), 0) / ins.length) : NaN;
      const EM = l.EM > 0 ? l.EM : ins.length ? ins.length / ins.reduce((a, e) => a + 1 / e.EM, 0) : NaN;
      const alpha = Number.isFinite(l.alpha) ? l.alpha : alphaMenard(l.classe, EM / pl);
      // p*_f : saisie (7e colonne), sinon moyenne géométrique des essais de la couche, sinon p*_l/2 (hypothèse PSIDA)
      const insF = ins.filter(e => e.pfNette > 0);
      const pf = l.pf > 0 ? l.pf : insF.length ? Math.exp(insF.reduce((a, e) => a + Math.log(e.pfNette), 0) / insF.length) : pl / 2;
      return { ...l, pl, EM, alpha, pf, pfSource: l.pf > 0 ? 'saisie' : insF.length ? 'essais' : 'p*_l/2', nEssais: ins.length, estimee, derive: !(l.pl > 0 && l.EM > 0) };
    }).filter(l => l.pl > 0 && l.EM > 0);
  }
  return out.filter(p => p.layers.length);
}

/**
 * Coefficient rhéologique α de Ménard (Fascicule 62 V annexe C.5, tableau ; NF P 94-262 annexe I) selon la nature du sol
 * et le rapport E_M/p*_l : argile > 16 → 1, 9–16 → 2/3, < 9 → 1/2 ; limon > 14 → 2/3, 8–14 → 1/2 ; sable > 12 → 1/2,
 * 7–12 → 1/3 ; grave > 10 → 1/3, 6–10 → 1/4 ; marne, craie, roche : 2/3, 1/2 (pratique : roche peu fracturée).
 */
export function alphaMenard(classe, r) {
  const k = String(classe || '').split('-')[0];
  if (!Number.isFinite(r)) return 0.5;
  if (k === 'argile') return r > 16 ? 1 : r >= 9 ? 2 / 3 : 0.5;
  if (k === 'limon') return r > 14 ? 2 / 3 : 0.5;
  if (k === 'sable') return r > 12 ? 0.5 : 1 / 3;
  if (k === 'grave') return r > 10 ? 1 / 3 : 0.25;
  if (k === 'marne') return 2 / 3;
  return 0.5;
}
export const parseProfile = text => (parseProfiles(text)[0] || { layers: [] }).layers;

/** Données « Appuis et fondations » (champs ap_* ; valeurs vides = défauts de SUPPORT_DEFAULTS). */
/** Données de la dalle précontrainte (onglet Précontrainte). */
export function parseBP(d) {
  const num = (k, def = null) => (String(d[k] ?? '').trim() === '' ? def : +d[k]);
  return { actif: d.bp_actif === 'on' || d.bp_actif === true, agrement: d.bp_agrement || 'generique', unite: d.bp_unite || '12', casFrottement: d.bp_cas || 'I', n: num('bp_n'), fprg: num('bp_fprg', 1860), fpeg: num('bp_fpeg', 1660), sigma0: num('bp_sigma0'),
    f: num('bp_f'), phi: num('bp_phi'), g: num('bp_g') == null ? null : num('bp_g') / 1000, ends: d.bp_ends || 'both', friction: d.bp_friction || 'continu', rho1000: num('bp_rho1000', 2.5), mu0: num('bp_mu0', 0.43),
    Ep: num('bp_Ep', 190000), fcj: num('bp_fcj'), epsR: num('bp_epsR', 3e-4), reg: d.bp_reg || 'BPEL91', j: num('bp_j', 7), Kfl: num('bp_Kfl', 2), rj: num('bp_rj', 0.5), eSup: num('bp_eSup'), eLow: num('bp_eLow'),
    lowEnd: num('bp_lowEnd', 0.4), a: num('bp_a', 0.1), trace: d.bp_trace || 'optimise', segs: String(d.bp_segs || '').trim() || null, fe: num('bp_fe', 500), atMin: num('bp_atMin', 0.1) };
}

export function parseSupports(d) {
  const v = (k, def) => (String(d[k] ?? '').trim() === '' ? def : +d[k]);
  const H = nums(d.ap_pileH || '');
  return {
    pile: { type: d.ap_pileType || 'voile', H: H.length ? H : [6], b: v('ap_pileB', 0.6), bTop: v('ap_pileBtop', null), Lv: v('ap_pileLv', null), hcons: v('ap_hcons', 1.0), nCol: v('ap_nCol', 3), D: v('ap_D', 0.8), hc: v('ap_hc', 0), lc: v('ap_lc', 1.2) },
    culee: { type: d.ap_culType || 'remblayee', Hm: v('ap_Hm', 3), em: v('ap_em', 0.8), hGG: v('ap_hGG', null), Lret: v('ap_Lret', 4), nCol: v('ap_culNCol', 3), D: v('ap_culD', 0.8), hc: v('ap_culHc', 1.0), lc: v('ap_culLc', 1.6), hv: v('ap_culHv', 1.0), dalle: (d.ap_dalleGG || 'oui') === 'oui' },
    found: { type: d.ap_found || 'superficielle', pileType: d.ap_pieu || 'fore-boue', B: v('ap_B', 3), hs: v('ap_hs', 1), De: v('ap_De', 1), pileD: v('ap_pileD', 0.8), nPile: v('ap_nPile', 3), nFiles: v('ap_nFiles', 2), sPile: v('ap_sPile', 2.4), Lpile: v('ap_Lpile', 15),
      incl: nums(d.ap_incl || ''), tete: d.ap_tete || 'encastre', pied: d.ap_pied || 'libre', secondOrdre: !!d.ap_pieuSO,
      remblai: { h: v('ap_remH', 0), gamma: v('ap_gamma', 20), Ka: v('ap_remKa', 0.33), EM: v('ap_remEM', 5), alpha: 0.5, pf: v('ap_remPf', 0.3) },
      fn: { actif: !!d.ap_fn, h: v('ap_fnH', null), h2: v('ap_fnH2', null) } },
    soil: { profiles: parseProfiles(d.ap_profil), assign: String(d.ap_profAssign || '').split(/[,;\s]+/).filter(Boolean), classe: d.ap_soil || 'sable-B', ple: v('ap_ple', 1), EM: v('ap_EM', 10), alpha: v('ap_alpha', 0.5), phi: v('ap_phi', 30), gamma: v('ap_gamma', 20), q: v('ap_q', 10), kSus: v('ap_kSus', 0.5) },
    mat: { fck: v('ap_fck', +d.fck || 25), fyk: v('ap_fyk', +d.fyk || 400), c: v('ap_c', 0.05) },
    eps: { TLD: v('ap_TLD', 3e-4), TCD: v('ap_TCD', 1e-4) },
    bossage: { debord: v('ap_bosDeb', 0.05), fck: v('ap_bosFck', null) ?? undefined },
    epsPSIDP: (d.ap_epsPSIDP ?? 'oui') !== 'non',
    joint: { debut: ['debut', 'deux'].includes(d.ap_joint), fin: ['fin', 'deux'].includes(d.ap_joint), rG: v('ap_jointG', 1), rQ: v('ap_jointQ', 1), rH: v('ap_jointH', 1) },
    // plan de nivellement : listes par ligne d'appui séparées par « ; » (valeur vide = donnée générale)
    niv: { actif: d.niv_actif === 'on' || d.niv_actif === true, hBos: v('niv_hBos', 0.10), ...Object.fromEntries(['zCh', 'zTN', 'zDS', 'zSS', 'zPP', 'zPHE', 'zLit', 'type', 'B'].map(k => [k, String(d['niv_' + k] ?? '').split(';').map(t => t.trim())])) },
    ec8: { zone: v('ap_zone', 3), categorie: d.ap_catEC8 || 'III', classeSol: d.ap_solEC8 || 'B' },
    seisme: { actif: !!d.ap_seisme, source: d.ap_seismeSrc || 'auto', q: { long: v('ap_qL', 1), trans: v('ap_qT', 1) } },
    choc: { vehicule: d.ap_choc || 'aucun', hV: v('ap_hV', 1.25), bateau: d.ap_bateau || 'aucun', hB: v('ap_hB', 2.0) },
    eau: { actif: !!d.ap_eau, h: v('ap_hEau', 3), v: v('ap_vEau', 2), theta: v('ap_thEau', 0), nez: d.ap_nez || 'rond', K3: v('ap_K3', 1.1), hGen: v('ap_hGen', 0), hDeb: v('ap_hDeb', 0), bDeb: v('ap_bDeb', 0),
      appuis: String(d.ap_eauLignes || '').split(/[,;\s]+/).filter(Boolean).map(Number).filter(Number.isFinite) },
  };
}

/** « P@x ; P@x | w=3 e=2 dyn=1.5 unc=1.1 » → véhicule généralisé. */
export function parseVehicle(text, label = 'Véhicule') {
  const [lhs, ...rest] = text.split('|');
  let name = label, axlesTxt = lhs;
  if (lhs.includes(':')) { const i = lhs.indexOf(':'); name = lhs.slice(0, i).trim() || label; axlesTxt = lhs.slice(i + 1); }
  const axles = parseAxles(axlesTxt);
  if (!axles.length) return null;
  const opt = {}; for (const m of rest.join(' ').matchAll(/(w|e|dyn|unc|n)\s*=\s*([\d.]+)/g)) opt[m[1]] = +m[2];
  return { label: name, axles, width: opt.w || 3, wheelSpacing: opt.e || 2, wheels: opt.n || 2, dyn: opt.dyn || 1, unc: opt.unc || 1, contact: { a: 0.2, b: 0.2 } };
}
const onY = t => { const [v, r] = String(t || '').split('sur'); const [a, b] = nums(r || ''); return +v > 0 && Number.isFinite(a) && Number.isFinite(b) ? { v: +v, y1: a, y2: b } : null; };
export function parseExtra(d) {
  const ch = nums(d.chRoadway || '');
  const remb = onY(d.chRemblai), enr = onY(d.chEnrobe);
  const cant = nums(d.cant || '');
  return {
    withChantier: !!d.withChantier, chRoadway: ch.length >= 2 ? { y1: ch[0], y2: ch[1] } : null, chNeutral: +(d.chNeutral || 0),
    remblai: remb ? { h: remb.v, y1: remb.y1, y2: remb.y2 } : null, enrobe: enr ? { t: enr.v, y1: enr.y1, y2: enr.y2 } : null,
    chVehicles: String(d.chVehicles || '').split('\n').map(t => t.trim()).filter(Boolean).map((t, i) => parseVehicle(t, `Engin ${i + 1}`)).filter(Boolean),
    lm3: d.lm3 || '', lm3Custom: d.lm3Custom || '', lm3Speed: d.lm3Speed || 'rapide',
    cant: cant.length >= 3 ? { Lc: cant[0], hr: cant[1], ht: cant[2] } : null,
    cantLines: String(d.cantLines || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const [g, e] = t.split('@').map(Number); return { g, e }; }).filter(l => Number.isFinite(l.g) && Number.isFinite(l.e)),
    cantBands: String(d.cantBands || '').split(';').map(t => onY(t)).filter(Boolean).map(b => ({ q: b.v, x1: b.y1, x2: b.y2 })),
    cantFootway: (() => { const f = nums(d.cantFootway || ''); return f.length >= 2 ? { x1: f[0], x2: f[1] } : null; })(),
    cantRoad: +(d.cantRoad || 0),
    fat: { lambda1: +(d.fatLambda1 || 1), trafic: d.fatTrafic || 'longue', categorie: +(d.fatCat || 2), nYears: +(d.fatYears || 100), nSlowLanes: +(d.fatLanes || 1), phiFat: +(d.fatPhi || 1) },
    bearingPitch: String(d.bearingPitch || '').trim() ? +d.bearingPitch : null,
  };
}

/** Modules complémentaires : phase de chantier, LM3, encorbellement, fatigue, zonage. */
export function computeExtra(p, deck, perm, ec, thermal, settle, design, bearings) {
  const x = p.extra, out = {};
  const matOpt = { ...p.mat, thermal, settle };
  if (x.withChantier && x.chRoadway) {
    const pp = provisionalProfile(deck, { roadway: x.chRoadway, neutral: x.chNeutral, remblai: x.remblai, enrobe: x.enrobe, vehicles: x.chVehicles });
    out.chantier = { ...pp, design: designSingleActionEC(deck, pp.perm, pp.Q, { ...matOpt, label: 'Profil provisoire' }), roadway: x.chRoadway, neutral: x.chNeutral };
  }
  if (x.lm3) {
    let v = x.lm3 === 'custom' ? parseVehicle(x.lm3Custom, 'LM3 personnalisé') : ANNEX_A_VEHICLES.find(a => a.label.startsWith(x.lm3));
    if (v) {
      v = { ...v, unc: v.unc || 1.1, dyn: x.lm3Speed === 'rapide' ? dynLM3(Math.min(...deck.spans)) : 1 };
      const env = vehicleEnvelope(deck, v, { y1: deck.g.roadway.y1, y2: deck.g.roadway.y2, neutral: 1 });
      out.lm3 = { vehicle: v, env, K: deck.transverseFactors(env).K, design: designSingleActionEC(deck, perm, env, { ...matOpt, label: 'LM3', psi1: 0 }) };
    }
  }
  if (x.cant) {
    const mom = cantileverMoments({ ...x.cant, lines: x.cantLines, bands: x.cantBands, footway: x.cantFootway, roadOverlap: x.cantRoad, tRev: p.mat.tRev, alphaQ1: ec.alpha.aQ[0], alphaq1: ec.alpha.aq1, betaQ: ec.alpha.aQ[0] });
    out.cantilever = { mom, design: cantileverDesign(mom, { fck: p.mat.fck, fyk: p.mat.fyk, c: p.mat.c + 0.01, phi: p.mat.phiT, wkMax: p.mat.wkMax }) };
  }
  const flm = flm3Envelope(deck);
  out.fatigue = fatigueCheck(deck, flm, perm, design, deck.keySections(), x.fat);
  const pitch = x.bearingPitch || (bearings ? bearingSpacing({ width: 2 * deck.b, psi: p.concept.psi, n: bearings.nb }) : 3);
  out.zonage = zonage({ spans: deck.spans, overhangs: deck.g.overhangs, width: 2 * deck.b, h: deck.h, psi: p.concept.psi, bearingPitch: pitch, optionFers: p.concept.transversePerpendicular ? 2 : 1, cantilever: x.cant ? x.cant.Lc : 0 });
  out.zonage.pitch = pitch;
  return out;
}

/** Données de l'aide à la conception à partir du formulaire analysé et des résultats disponibles. */
export function conceptInput(p) {
  const di = p.deckInput;
  return { spans: di.spans, width: di.width, h: di.h, fck: p.mat.fck, psi: p.concept.psi, tirantAir: p.concept.tirantAir, overhangs: di.overhangs, D: p.concept.D, I: p.I, type: p.concept.type };
}

export function compute(p) {
  // méthode « plaque » : un premier calcul (Guyon-Massonnet) choisit les appareils d'appui, dont la raideur verticale
  // sert d'appui élastique à la plaque ; le calcul est ensuite repris en entier avec la plaque
  if (p.methodeTablier === 'plaque' && !p.deckInput.plaque) {
    const st0 = compute({ ...p, methodeTablier: 'guyon' });
    const kv = st0.bearings.rows.map(r => (r.sel ? raideurAppareil(r.sel.bd, r.sel.n) : Infinity));
    const st = compute({ ...p, deckInput: { ...p.deckInput, plaque: { nb: st0.bearings.nb, kv, E: p.E || 34000, psi: p.concept.psi || 100, alphaT: p.concept.transversePerpendicular ? 100 : (p.concept.psi || 100) } } });
    st.guyon = { perm: st0.perm, ec: st0.ec, f61: st0.f61, design: st0.design, transDesign: st0.transDesign, trans: st0.trans, rebar: st0.rebar, bearings: st0.bearings, chevetres: st0.chevetres };
    st.dt += st0.dt;
    return st;
  }
  const t0 = performance.now();
  const deck = new SlabDeck(p.deckInput);
  const keys = deck.keySections();
  const perm = deck.permanent();
  const ec = deck.eurocode({ alpha: EC_ALPHA[p.alpha] });
  const f61 = deck.fascicule61({ nRetenue: p.nRetenue, classe: p.classe, mil: p.mil });
  const thermal = p.withTherm ? deck.thermal({ dTheat: p.dT[0], dTcool: p.dT[1], E: p.E, I: p.I }) : null;
  const settle = p.withTherm ? deck.settlements({ delta: p.delta, E: p.E, I: p.I, phi: p.phiFluage }) : null;
  // plaque : dimensionnement sur les moments de Wood-Armer (m_x ± |m_xy|, m_y ± |m_xy|)
  const PL = deck.plaque;
  const permD = PL ? woodArmer(perm) : perm, ecD = PL ? woodArmerTous(ec) : ec, f61D = PL ? woodArmerTous(f61) : f61;
  const design = {
    EC: designEC(deck, permD, ecD, { ...p.mat, thermal, settle }),
    F61: designBAEL(deck, permD, f61D, { ...p.mat, thermal, settle }),
  };
  // plaque : pointes de moment au droit des appareils des piles reprises par des renforts locaux (annexe 4 § 7)
  if (PL) { renfortsAppareils(deck, design.EC); renfortsAppareils(deck, design.F61); }
  const tm = new TransverseModel(deck, { tRev: p.mat.tRev, nHarm: 15, I: p.I });
  const transG = tm.run({ alpha: EC_ALPHA[p.alpha], f61opt: { nRetenue: p.nRetenue, classe: p.classe, mil: p.mil }, thermal, settle });
  // plaque : flexion transversale de la travée courante lue sur la plaque (m_y de Wood-Armer), Guyon pour ν·m_x thermique
  const trans = PL ? transversalPlaque(deck, permD, ecD, f61D, transG) : transG;
  // Fascicule 61 / BAEL : pratique SETRA — dalle droite équivalente au biais mécanique (PSI-DA 68, PSIDA.EL, PSIDP.EL) et,
  // en fissuration peu nuisible, ELU avec ν = 0 (béton fissuré) ; l'Eurocode suit CHAMOA (pas de transformation, ν de la dalle)
  const runF = nu => new TransverseModel(deck, { tRev: p.mat.tRev, nHarm: 15, I: p.I, nu, skewEquivalent: true }).run({ alpha: EC_ALPHA[p.alpha], f61opt: { nRetenue: p.nRetenue, classe: p.classe, mil: p.mil }, thermal, settle });
  const skewed = (p.concept.psi || 100) < 100;
  const transF = skewed && !PL ? runF(deck.nu) : trans;
  const transELU = !PL && p.mat.fissuration === 'peu nuisible' && deck.nu > 0 ? runF(0) : null;
  // plaque : moments déjà dans le repère des armatures (Wood-Armer biais) → pas de transformation de l'annexe 12A
  const skewOpt = { psi: p.concept.psi, I: p.I, transversePerpendicular: p.concept.transversePerpendicular, plaque: !!PL };
  const transDesign = {
    EC: designTransverseEC(deck, trans, design.EC, { ...p.mat, phi: p.mat.phiT, phiLong: p.mat.phi, ...skewOpt }),
    F61: designTransverseBAEL(deck, transF, design.F61, { ...p.mat, phiLong: p.mat.phi, ...skewOpt, transELU }),
  };
  const EI = thermal ? thermal.EI : (p.E || 34000) * 1000 * (p.I || p.deckInput.width * Math.pow(p.deckInput.h, 3) / 12);
  // inégalité de répartition entre appareils d'une ligne (PSI-DA 68 § 2.4.2) : CP, UDL (formule A), tandems TS
  // (roues des voies 1 à 3, centrées dans des voies de wl, généralisation de la formule B)
  const nbL = p.concept.nBearings || Math.max(2, Math.round(2 * deck.b / 3));
  const kc = inequalityCoefficients({ width: 2 * deck.b, chargeable: deck.g.roadway.y2 - deck.g.roadway.y1, n: nbL, psi: p.concept.psi, nLanes: ec.lanes.n, h: deck.h, hRev: p.mat.tRev });
  const tsWheels = ec.lm1.lanes.slice(0, 3).flatMap((ln, i) => [{ y: i * ec.lanes.wl + ec.lanes.wl / 2 - 1, P: ln.Q }, { y: i * ec.lanes.wl + ec.lanes.wl / 2 + 1, P: ln.Q }]).filter(w => w.P > 0);
  const ineq = { coef: { ...kc, B: inequalityWheels(tsWheels, kc.e, nbL) }, Rperm: perm.Rmax, RA: ec.UDL.Rmax, RB: ec.TS.Rmax };
  // rotations d'appui : permanent (poutre conjuguée, module différé E/(1+φ)) + trafic gr1a (lignes d'influence de rotation, Ei)
  const rotPerm = deck.beam.x0.map((_, i) => {
    let th = 0;
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= deck.spans.length) continue;
      const idx = deck.beam.sections.map((sc, k) => (sc.span === j ? k : -1)).filter(k => k >= 0);
      const r = endRotations(idx.map(k => deck.beam.sections[k].xi), idx.map(k => perm.M[k]), deck.spans[j], EI / (1 + (p.phiFluage || 2)));
      th = Math.max(th, Math.abs(j === i ? r.thetaA : r.thetaB));
    }
    return th;
  });
  const rotQ = ec.gr1a.Tmax ? ec.gr1a.Tmax.map((v, i) => Math.max(Math.abs(v), Math.abs(ec.gr1a.Tmin[i])) / EI) : null;
  const bearings = designBearings({ deck, beamComb: design.EC.beam, EI, nPerLine: p.concept.nBearings, xFixed: p.concept.xFixed, epsSlow: p.concept.epsSlow, dT: p.concept.dTu, alphaQ1: ec.alpha.aQ[0], alphaq1: ec.alpha.aq1, ineq, rot: rotQ ? { perm: rotPerm, traffic: rotQ } : null,
    impose: p.concept.bearingEnd || p.concept.bearingPier ? { end: p.concept.bearingEnd, pier: p.concept.bearingPier } : null });
  bearings.rotPerm = rotPerm; bearings.EI = EI;
  if (PL) {
    // plaque : réaction de l'appareil le plus chargé lue sur la plaque (au lieu des coefficients d'inégalité PSI-DA 68)
    const ra = reactionsAppareils(deck, perm, ec, design.EC.beam);
    bearings.plaque = ra;
    bearings.rows.forEach((r, i) => { r.PSIDA = { Pmax: r.Pmax, kCP: r.kCP, kQ: r.kQ }; r.Pmax = ra[i].Pmax; r.Rk = ra[i].Rk; r.kCP = ra[i].kCP; r.kQ = ra[i].kQ; });
  }
  const cases = [
    { id: 'TS', label: 'LM1 – TS', res: ec.TS, ref: 'EC' }, { id: 'UDL', label: 'LM1 – UDL', res: ec.UDL, ref: 'EC' },
    { id: 'LM1', label: 'LM1 (TS + UDL)', res: ec.LM1, ref: 'EC' }, { id: 'gr1a', label: 'gr1a (LM1 + trottoirs 3 kN/m²)', res: ec.gr1a, ref: 'EC' },
    { id: 'gr1b', label: 'gr1b (LM2)', res: ec.gr1b, ref: 'EC' }, { id: 'gr3', label: 'gr3 (trottoirs 5 kN/m²)', res: ec.gr3, ref: 'EC' },
    { id: 'A', label: 'A(l)', res: f61.A, ref: 'F61' }, { id: 'Bc', label: 'Bc (δ inclus)', res: f61.Bc, ref: 'F61' },
    ...(f61.Bt ? [{ id: 'Bt', label: 'Bt (δ inclus)', res: f61.Bt, ref: 'F61' }] : []),
    { id: 'Mc120', label: 'Mc120 (δ inclus)', res: f61.Mc120, ref: 'F61' }, { id: 'D240', label: 'D240', res: f61.D240, ref: 'F61' },
    { id: 'trott', label: 'Trottoirs 1,5 kN/m²', res: f61.trottoir, ref: 'F61' },
  ];
  for (let k = cases.length - 1; k >= 0; k--) if (!cases[k].res) cases.splice(k, 1);
  if (thermal) cases.push({ id: 'therm', label: 'Gradient thermique (±)', res: { ...thermal, Vmax: thermal.Vmax, Vmin: thermal.Vmin }, ref: 'EC' }, { id: 'settle', label: 'Tassements aléatoires (±)', res: settle, ref: 'EC' });
  const chev0 = chevetresEC({ deck, perm, ec, n: bearings.nb, psi: p.concept.psi, cover: p.mat.c, phi: p.mat.phiT, fck: p.mat.fck, fyk: p.mat.fyk });
  const chevetres = PL && PL.M.nb === bearings.nb ? chevetresPlaque(chev0, { deck, perm: permD, ec: ecD, fck: p.mat.fck, fyk: p.mat.fyk }) : chev0;
  const concept = aideConception(conceptInput(p), { deck, perm, design: design.EC, transDesign: transDesign.EC });
  const extra = computeExtra(p, deck, perm, ec, thermal, settle, design.EC, bearings);
  // plan de ferraillage sur l'enveloppe des profils (définitif, chantier, LM3)
  const env = { ...design.EC, envBot: design.EC.envBot.slice(), envTop: design.EC.envTop.slice() };
  const governing = ['définitif'];
  for (const [k, lab] of [['chantier', 'chantier'], ['lm3', 'LM3']]) {
    const dz = extra[k] && extra[k].design; if (!dz) continue;
    let used = false;
    dz.envBot.forEach((v, i) => { if (v > env.envBot[i] + 1e-9) { env.envBot[i] = v; used = true; } });
    dz.envTop.forEach((v, i) => { if (v > env.envTop[i] + 1e-9) { env.envTop[i] = v; used = true; } });
    if (used) governing.push(lab);
  }
  // plan de ferraillage BA : impossible quand aucune disposition de barres ne suffit (dalle à précontraindre, travées longues)
  let rebar = null, rebarError = null;
  try { rebar = rebarPlan({ deck, design: env, trans: transDesign.EC, opt: { fck: p.mat.fck, fyk: p.mat.fyk, phiLong: Math.round(p.mat.phi * 1000), phiTrans: Math.round(p.mat.phiT * 1000), chevetres } }); rebar.governing = governing; }
  catch (e) { rebarError = `plan de ferraillage BA impossible (${e.message}) : sections d'acier hors des dispositions courantes — dalle à précontraindre ou à épaissir`; }
  let psidp = null, psidpError = null;
  if (p.bp && p.bp.actif) {
    try {
      psidp = designPSIDP({ deck, perm, f61, thermal, beamF61: design.F61.beam, fc28: p.mat.fck }, p.bp);
      psidp.defl = psidpDeflections(psidp);
      const model = new TransverseModel(deck, { tRev: p.mat.tRev, nHarm: 15, I: p.I, skewEquivalent: true });
      psidp.trans = transversePrestress(psidp, { deck, model, transDesign: transDesign.F61, mat: { ...p.mat, phiLong: p.mat.phi } });
    } catch (e) { psidpError = e.message; }
  }
  let supports = null, supportsError = null;
  try { supports = computeSupports({ p, deck, perm, f61, ec, bearings, psidp, thermal }, p.supports); } catch (e) { supportsError = e.message; }
  return { psidp, psidpError, supports, supportsError, rebar, rebarError, p, deck, keys, perm, ec, f61, cases, thermal, settle, design, trans, transG, transF, transELU, transDesign, concept, bearings, chevetres, extra, dt: (performance.now() - t0) / 1000 };
}

/** Aide à la conception seule : géométrie, charges permanentes et règles du guide (quelques dixièmes de seconde). */
export function computeConceptOnly(p) {
  const deck = new SlabDeck(p.deckInput);
  const perm = deck.permanent();
  return { p, deck, perm, concept: aideConception(conceptInput(p), { deck, perm }), conceptOnly: true };
}

