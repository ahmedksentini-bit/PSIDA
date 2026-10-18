/**
 * Appuis et fondations — chaîne complète à partir des résultats du tablier (réactions, appareils d'appui) :
 * rigidités des lignes, répartition du freinage et des déformations imposées, combinaisons en tête (BAEL/F61 et EC),
 * descente en pied, fûts (piles voiles ou colonnes, voiles et colonnes de culée), chevêtres, garde-grève, murs en
 * retour, semelles superficielles ou sur pieux, pieux (Ménard, efforts, ferraillage, portance).
 * Unités : m, kN, kN·m, MPa (p*_l, E_M en MPa).
 */
import { neopreneFlexibility, cantileverFlexibility, horizontalDistribution, brakingF61Deck, headCombinationsBAEL, headCombinationsEC } from './actions.js';
import { designShaft, pierCap, buckling } from './pier.js';
import { gardeGreve, murEnRetour, earthPressure, dalleTransition, Ka } from './abutment.js';
import { shallowFooting, footingStrutTie, pileCapStrutTie, pileGroupForces, menardReaction, lateralPile, pileMinSteel, pileCapacity, PILE_TYPES, pileCapTwoRows, sigmaSBAEL, pileConcrete, efficaciteCoherentF62, efficaciteEC7, isCohesive, soilProfile } from './foundation.js';
import { requiredSteelNM } from './section_nm.js';
import { pierWater } from './water.js';
import { bearingSpacing } from '../bearings.js';
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
export function seismicActions(st, sp, hGG) {
  const projet = EC8.lireProjet(JSON.parse(JSON.stringify(toPontEC8({ ...st, supports: { sp, hGG } }, { site: sp.ec8, q: sp.seisme.q }))));
  const problemes = EC8.valider(projet);
  const a = EC8.actionSismique(projet), m = EC8.modele(projet), r = EC8.analyse(projet, a, m);
  return { projet, problemes, efforts: EC8.exporterEfforts(projet, a, r), T: { x: r.directions.x.lbdp.T, y: r.directions.y.lbdp.T }, F: { x: r.directions.x.ubdp.F * 1000, y: r.directions.y.ubdp.F * 1000 }, M: r.M, conditions: r.conditions };
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
export function geometryWarnings(sp, end, width) {
  const W = [], F = sp.found, P = sp.pile, C = sp.culee;
  const col = end ? C.type === 'enterree' : P.type === 'colonnes';
  const D = end ? C.D : P.D, hc = end ? C.hc : P.hc, lc = end ? C.lc : P.lc;
  if (col && D < 0.60 - 1e-9) W.push(`colonnes Ø ${D} m < 0,60 m (PP73 1.3.2 § 1.3 : diamètre minimal vis-à-vis du choc)`);
  if (col && hc > 0 && (hc < 0.60 - 1e-9 || lc < 0.70 - 1e-9)) W.push(`chevêtre ${hc} × ${lc} m : dimensions conseillées ≥ 0,60 m de hauteur × 0,70 m de largeur (PP73 1.1.3, 1.3.2 § 2.2.5.1)`);
  if (F.type === 'superficielle' && F.B < 1.5 - 1e-9) W.push(`semelle B = ${F.B} m < 1,50 m (PP73 1.1.2)`);
  if (F.type !== 'superficielle') {
    if (F.nFiles === 1 && F.pileD < 0.60 - 1e-9) W.push(`file unique de pieux Ø ${F.pileD} m < 0,60 m (PP73 : 0,80 m conseillé)`);
    const s = F.nFiles > 1 ? Math.min(F.sPile, (width + 1) / Math.max(1, F.nPile)) : (width + 1) / Math.max(1, F.nPile);
    if (s < 3 * F.pileD - 1e-9) W.push(`entraxe des pieux ${s.toFixed(2)} m < 3 Ø (PP73 1.2.3, effet de groupe)`);
    if (F.nFiles > 1 && F.B < 4.5 * F.pileD - 1e-9) W.push(`semelle sur pieux B = ${F.B} m < 4,5 Ø (PP73 1.2.3)`);
  }
  if (end && sp.culee.hGG && sp.culee.hGG > 3) W.push('garde-grève de plus de 3 m : hors domaine des ferraillages types PP73 (calcul nécessaire)');
  if (end && C.Lret > 6) W.push(`mur en retour de ${C.Lret} m : épaisseur (ℓ + 2)/20 hors domaine (2 à 6 m, PP73 1.3.2 § 3.4)`);
  return W;
}

/** Valeurs par défaut du formulaire « Appuis et fondations ». */
export const SUPPORT_DEFAULTS = {
  pile: { type: 'voile', H: [6], b: 0.6, Lv: null, nCol: 3, D: 0.8, hc: 0, lc: 1.2 },
  culee: { type: 'remblayee', Hm: 3.0, em: 0.8, hGG: null, Lret: 4.0, nCol: 3, D: 0.8, hc: 1.0, lc: 1.6 },
  found: { type: 'superficielle', B: 3.0, hs: 1.0, De: 1.0, pileType: 'fore-boue', pileD: 0.8, nPile: 3, nFiles: 2, sPile: 2.4, Lpile: 15 },
  soil: { layers: null, classe: 'sable-B', ple: 1.0, EM: 10, alpha: 0.5, phi: 30, gamma: 20, q: 10 },
  mat: { fck: 25, fyk: 400, c: 0.05 },
  eps: { TLD: 3e-4, TCD: 1e-4 },
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
  const sp = merge(SUPPORT_DEFAULTS, input);
  const { deck, perm, f61, ec, bearings } = st;
  const width = 2 * deck.b, Ltot = deck.spans.reduce((a, v) => a + v, 0);
  const xs = [0]; deck.spans.forEach(L => xs.push(xs[xs.length - 1] + L));
  const nL = xs.length, isEnd = i => i === 0 || i === nL - 1;
  const { fck, fyk, c } = sp.mat;
  const Hpile = i => { const H = [].concat(sp.pile.H); return H[Math.min(H.length - 1, i - 1)] ?? H[0]; };
  const Lv = sp.pile.Lv ?? width;
  const hGG = sp.culee.hGG ?? deck.h + 0.15 + Math.max(...bearings.rows.map(r => (r.sel ? r.sel.hTot : 60))) / 1000;

  // --- rigidités horizontales (néoprène + fût console encastré ; fondation supposée rigide) ---
  const shaftI = i => {
    if (isEnd(i)) return sp.culee.type === 'remblayee' ? Infinity : sp.culee.nCol * Math.PI * sp.culee.D ** 4 / 64;
    return sp.pile.type === 'voile' ? Lv * sp.pile.b ** 3 / 12 : sp.pile.nCol * Math.PI * sp.pile.D ** 4 / 64;
  };
  const shaftH = i => (isEnd(i) ? sp.culee.Hm : Hpile(i) + (sp.pile.type === 'colonnes' ? sp.pile.hc : 0));
  const lineData = code => xs.map((x, i) => {
    const r = bearings.rows[i], sel = r.sel || { bd: { a: 300, b: 400 }, T: 0.04 };
    const a = sel.bd.a / 1000, b = sel.bd.b / 1000, Te = (sel.T || 0.04) + 2 * 0.0025;   // élastomère + enrobages 2,5 mm
    const I = shaftI(i), H = shaftH(i);
    const Ei = code === 'BAEL' ? EiB(fck) : Ecm(fck), Ev = code === 'BAEL' ? EvB(fck) : Ecm(fck) / 3;
    return {
      x, bearing: { a, b, Te, n: r.nb },
      sNeo: { inst: neopreneFlexibility({ n: r.nb, a, b, Te, G: 1.8 }), diff: neopreneFlexibility({ n: r.nb, a, b, Te, G: 0.9 }) },
      sApp: { inst: Number.isFinite(I) ? cantileverFlexibility({ H, E: Ei, I }) : 0, diff: Number.isFinite(I) ? cantileverFlexibility({ H, E: Ev, I }) : 0 },
    };
  });
  const distB = horizontalDistribution(lineData('BAEL')), distE = horizontalDistribution(lineData('EC'));

  // --- actions en tête par ligne ---
  const chargeable = deck.g.roadway.y2 - deck.g.roadway.y1;
  const brk = brakingF61Deck({ Ltot, Lc: chargeable });
  const RF = Math.max(0, st.p.concept.epsSlow ?? 2.5e-4), epsT = 1e-5 * (st.p.concept.dTu ?? 30);
  const R = (res, i) => (res ? Math.max(0, res.Rmax[i]) : 0);
  let seisme = null;
  if (sp.seisme.actif) {
    if (sp.seisme.source === 'onglet') seisme = externalSeismic(sp.seisme.externe, nL, deck.spans);
    else { try { seisme = seismicActions(st, sp, hGG); } catch (e) { seisme = { error: e.message }; } }
  }
  const accidental = (i, Nfreq) => {
    const out = [];
    if (seisme && seisme.efforts) {
      // EN 1990 6.4.3.4 : G + ψ2,1 Q + A_Ed (ψ2,1 = 0 pour le trafic routier courant) ; Fz pris avec ± (G max + Fz, G min − Fz)
      for (const k of seisme.efforts.appuis[i].cas) for (const sgn of [1, -1]) {
        out.push({ label: `ACC séisme ${k.nom} ${sgn > 0 ? '(+Z)' : '(−Z)'}`, ls: 'ACC', acc: true, N: (sgn > 0 ? perm.Rmax[i] : perm.Rmin[i]) + sgn * Math.abs(k.Fz), H: Math.abs(k.Fx), Hy: Math.abs(k.Fy), Nsus: perm.Rmax[i], Ninst: 0, Hsus: 0, Hinst: Math.abs(k.Fx) });
      }
    }
    if (!isEnd(i)) {
      // chocs : G + A_d + ψ1,1 Q (EN 1990 6.4.3.3, ψ1 TS 0,75 / UDL 0,4) ; F appliqué au fût (non transmis par le tablier)
      const veh = IMPACT_VEHICULE[sp.choc.vehicule], bat = IMPACT_BATEAU[sp.choc.bateau];
      const add = (label, F, h) => out.push({ label, ls: 'ACC', acc: true, N: perm.Rmax[i] + Nfreq, H: 0, Hy: 0, imp: { F, h }, Nsus: perm.Rmax[i], Ninst: Nfreq, Hsus: 0, Hinst: 0 });
      if (veh) add(`ACC choc véhicule (${veh.label}) F = max(F_dx ; F_dy) = ${Math.max(veh.Fdx, veh.Fdy)} kN`, Math.max(veh.Fdx, veh.Fdy), sp.choc.hV);
      if (bat) add(`ACC choc de bateau (classe CEMT ${sp.choc.bateau}) F_dx = ${bat.Fdx} kN`, bat.Fdx, sp.choc.hB);
    }
    for (const c of out) { c.N = c.N; }
    return out;
  };
  // --- cours d'eau : courant, embâcles, poussée d'Archimède, affouillement (piles en rivière) ---
  const inWater = i => sp.eau.actif && !isEnd(i) && (!sp.eau.appuis || !sp.eau.appuis.length || sp.eau.appuis.includes(i + 1));
  const water = xs.map((x, i) => (inWater(i) ? pierWater(sp.eau, { type: sp.pile.type, b: sp.pile.b, Lv, D: sp.pile.D, nCol: sp.pile.nCol, s: sp.pile.nCol > 1 ? width / sp.pile.nCol : 0,
    Hf: Hpile(i), dBed: Math.max(0, sp.found.De - sp.found.hs) }) : null));
  const waterCombos = (i, Nfreq) => {
    const w = water[i]; if (!w) return { F61: [], EC: [] };
    // F_wa action variable de courte durée (γ_Q = 1,5) ; BAEL/F61 : comme le vent (annexe D), sans trafic ; EC : action
    // dominante, trafic d'accompagnement ψ₀ (TS 0,75, UDL 0,4) ; poussée d'Archimède au niveau des PHE (γ = 1, défavorable
    // en soulèvement, retenue dans toutes les combinaisons de crue)
    const mk = (label, ls, gG, gW, NQ) => ({ label, ls, N: gG * perm.Rmax[i] + NQ, H: 0, Hy: 0, wat: { F: gW * w.F, M: gW * w.M, U: w.Ushaft, gG }, Nsus: gG * perm.Rmax[i], Ninst: NQ, Hsus: 0, Hinst: 0 });
    return {
      F61: [mk('ELU crue : 1,35 G + 1,5 F_eau', 'ELU', 1.35, 1.5, 0), mk('ELS crue : G + F_eau', 'ELS', 1, 1, 0)],
      EC: [mk('ELU crue : 1,35 G + 1,5 F_eau + 1,35 ψ₀ Q', 'ELU', 1.35, 1.5, 1.35 * Nfreq), mk('ELS car. crue : G + F_eau + ψ₀ Q', 'ELS', 1, 1, Nfreq)],
    };
  };
  const heads = xs.map((x, i) => {
    const G = { N: perm.Rmax[i] };
    const tr = R(f61.trottoir, i);
    const bB = distB.braking(1)[i];
    const QF = [
      { label: 'A(l) + trottoirs', N: R(f61.A, i) + tr, H: brk.A * bB, gU: 1.605, gS: 1.2 },
      { label: 'Bc + trottoirs', N: R(f61.Bc, i) + tr, H: brk.Bc * bB, gU: 1.605, gS: 1.2 },
      ...(f61.Bt ? [{ label: 'Bt + trottoirs', N: R(f61.Bt, i) + tr, H: 0, gU: 1.605, gS: 1.2 }] : []),
      ...(f61.Mc120 ? [{ label: 'Mc120 + trottoirs', N: R(f61.Mc120, i) + tr, H: 0, gU: 1.35, gS: 1.0 }] : []),
    ];
    const F61 = headCombinationsBAEL({ G, Q: QF, RF: { H: distB.imposed(RF).H[i] }, TLD: { H: distB.imposed(sp.eps.TLD).H[i] }, TCD: { H: distB.imposed(sp.eps.TCD, 'inst').H[i] }, envelope: true });
    const psi0 = (0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i) + 0.4 * R(ec.gr3, i) * 0.6) / Math.max(1e-9, R(ec.gr1a, i));
    const QE = [
      { label: 'gr1a', N: R(ec.gr1a, i), H: 0, psi0 },
      { label: 'gr2 (freinage)', N: 0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i), H: bearings.H * distE.braking(1)[i], psi0: 0 },
    ];
    const EC = headCombinationsEC({ G, Q: QE, RF: { H: distE.imposed(RF).H[i] }, T: { H: distE.imposed(epsT).H[i] } });
    const Nfreq = 0.75 * R(ec.TS, i) + 0.4 * R(ec.UDL, i);
    const acc = accidental(i, Nfreq), wc = waterCombos(i, Nfreq);
    return { x, F61: [...F61, ...wc.F61, ...acc], EC: [...EC, ...wc.EC, ...acc] };
  });

  // --- éléments d'appui ---
  const soil = sp.soil, KA = Ka(soil.phi);
  // profils pressiométriques (sondages, couches depuis le terrain naturel), un profil associé à chaque ligne d'appui
  // (liste « assign » : nom du profil par ligne ; à défaut le premier) ; sans profil : couche unique homogène
  const profs = (soil.profiles && soil.profiles.length ? soil.profiles : [{ name: 'SP1', layers: soil.layers && soil.layers.length ? soil.layers : [{ z0: 0, z1: 100, classe: soil.classe, pl: soil.ple, EM: soil.EM, alpha: soil.alpha }] }])
    .map(p => ({ name: p.name, tests: p.tests || [], ...soilProfile(p.layers) }));
  const profileOf = i => profs.find(p => p.name === (soil.assign || [])[i]) || profs[0];
  const lines = xs.map((x, i) => {
    const end = isEnd(i), profile = profileOf(i), out = { i, x, kind: end ? 'culee' : 'pile', type: end ? sp.culee.type : sp.pile.type, head: heads[i], profile: profile.name };
    out.K = { BAEL: { inst: distB.K.inst[i], diff: distB.K.diff[i] }, EC: { inst: distE.K.inst[i], diff: distE.K.diff[i] } };
    const per = {};
    for (const code of ['BAEL', 'EC']) {
      const combos = code === 'BAEL' ? heads[i].F61 : heads[i].EC;
      const gU = 1.35;
      let base, shaftRes, extra = {};
      if (!end) {
        const P = sp.pile, Hf = Hpile(i), col = P.type === 'colonnes';
        const Wchev = col && P.hc > 0 ? 25 * P.hc * P.lc * width : 0;
        const Wfut = col ? 25 * P.nCol * Math.PI * P.D ** 2 / 4 * Hf : 25 * Lv * P.b * Hf;
        const arm = Hf + (col ? P.hc : 0);
        base = combos.map(cb => {
          const g = cb.ls === 'ELU' ? gU : 1, Mimp = cb.imp ? cb.imp.F * cb.imp.h : 0;
          const wt = cb.wat;   // crue : courant + embâcles appliqués au fût (sens du courant, transversal), Archimède sur le fût
          return { ...cb, Nb: cb.N + g * (Wchev + Wfut) - (wt ? wt.U : 0), Mb: cb.H * arm + Mimp, Mimp, Myb: (cb.Hy || 0) * arm + (wt ? wt.M : 0), Hb: cb.H + (cb.imp ? cb.imp.F : 0), Hyb: (cb.Hy || 0) + (wt ? wt.F : 0) };
        });
        const shape = col ? { D: P.D, c: c + 0.01, nBars: 12 } : { b: Lv, h: P.b, c: c + 0.01 };
        shaftRes = designShaft({ shape, code, fck, fyk, Hf, combos: base.filter(b => b.ls !== 'ELS').map(b => ({ label: b.label, N: b.Nb, M: b.Mb - b.Mimp, Mloc: b.Mimp, My: b.Myb, acc: !!b.acc })), n: col ? P.nCol : 1 });
        if (col && P.hc > 0) {
          const nb = bearings.nb, pitch = bearingSpacing({ width, psi: st.p.concept.psi, n: nb });
          const ys = Array.from({ length: nb }, (_, k) => width / 2 + (k - (nb - 1) / 2) * pitch);
          const row = bearings.rows[i], kQ = code === 'BAEL' ? 1.605 : 1.35;
          const Pu = (1.35 * row.kCP * perm.Rmax[i] + kQ * row.kQ * Math.max(0, row.Rmax - perm.Rmax[i])) / nb;
          extra.cap = pierCap({ length: width, supports: Array.from({ length: P.nCol }, (_, j) => ({ x: width * (2 * j + 1) / (2 * P.nCol) })), loads: ys.map(y => ({ x: y, P: Pu })), q: 1.35 * 25 * P.hc * P.lc, b: P.lc, h: P.hc, c, fck, fyk, code });
          extra.cap.Pu = Pu;
        }
      } else {
        const C = sp.culee, Hm = C.Hm, rem = C.type === 'remblayee';
        const ep = earthPressure({ H: Hm + hGG, B: rem ? width : C.nCol * Math.min(3 * C.D, width / C.nCol), K: KA, gamma: soil.gamma, q: soil.q });
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
        extra.earth = { ...ep, K: KA, Htot: Hm + hGG };
        const shape = rem ? { b: 1, h: C.em, c: c + 0.01 } : { D: C.D, c: c + 0.01, nBars: 12 };
        shaftRes = designShaft({ shape, code, fck, fyk, Hf: Hm, combos: base.filter(b => b.ls !== 'ELS').map(b => ({ label: b.label, N: b.Nb, M: b.Mb, My: (b.Hy || 0) * Hm, acc: !!b.acc })), n: rem ? width : C.nCol });
        const gg = gardeGreve({ h: hGG, K: KA, gamma: soil.gamma });
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
          const Pu = (1.35 * row.kCP * perm.Rmax[i] + kQ * row.kQ * Math.max(0, row.Rmax - perm.Rmax[i])) / nb;
          extra.cap = pierCap({ length: width, supports: Array.from({ length: C.nCol }, (_, j) => ({ x: width * (2 * j + 1) / (2 * C.nCol) })), loads: ys.map(y => ({ x: y, P: Pu })), q: 1.35 * 25 * C.hc * C.lc, b: C.lc, h: C.hc, c, fck, fyk, code });
          extra.cap.Pu = Pu;
        }
      }
      // --- fondation ---
      const F = sp.found, bWall = end ? (sp.culee.type === 'remblayee' ? sp.culee.em : sp.culee.D) : (sp.pile.type === 'voile' ? sp.pile.b : sp.pile.D);
      const Lf = (end ? width : (sp.pile.type === 'voile' ? Lv : width)) + 1.0;
      const Wsem = 25 * F.B * Lf * F.hs;
      const wl = water[i], dAff = wl ? wl.dAff : 0;
      // crue : Archimède sur la semelle (ρ g V), effort transversal combiné (glissement, effort par pieu), moment transversal
      const fd = base.map(b => {
        const g = b.ls === 'ELU' ? gU : 1, Hy = b.Hyb || 0, wt = !!b.wat;
        return { label: b.label, ls: b.ls, V: b.Nb + g * Wsem - (wt ? 10 * Wsem / 25 : 0), H: Math.hypot(b.Hb, wt ? Hy : 0), Hx: b.Hb, Hy, M: b.Mb + b.Hb * F.hs, My: (b.Myb || 0) + Hy * F.hs, crue: wt };
      });
      let found;
      if (F.type === 'superficielle') {
        const checks = fd.map(f => {
          const r = { ...f, ...shallowFooting({ code, B: F.B, L: Lf, D: F.De, De: F.De, V: f.V, H: f.H, M: f.M, ls: f.ls, profile, phi: soil.phi, gamma: soil.gamma, dAff: f.crue ? dAff : 0 }) };
          // excentricité transversale (sens L) sous la crue : noyau central L/6 (contrôle simple, non intégré à la portance)
          if (f.crue) { r.eY = Math.abs(f.My) / f.V; r.eYok = r.eY <= Lf / 6; r.excOk = r.excOk && r.eYok; }
          return r;
        });
        const eluMax = fd.filter(f => f.ls === 'ELU').reduce((a, f) => (f.V * (1 + 3 * Math.abs(f.M) / f.V / F.B) > a.Nn ? { f, Nn: f.V * (1 + 3 * Math.abs(f.M) / f.V / F.B) } : a), { Nn: 0 });
        const d = F.hs - c - 0.01, fsu = fyk / 1.15;
        const eMax = Math.max(...fd.map(f => Math.abs(f.M) / f.V));
        found = { type: 'superficielle', B: F.B, L: Lf, hs: F.hs, W: Wsem, checks, scour: wl ? { dAff, De: F.De, ok: F.De > dAff } : null, worstV: Math.max(...checks.map(k => k.ratioV)), worstH: Math.max(...checks.map(k => k.ratioH)), excOk: checks.every(k => k.excOk),
          AsLong: Math.max(footingStrutTie({ N: eluMax.Nn, B: F.B, b: bWall, d, fsu }), 0.0012 * F.hs * Lf),
          bielles: { dOk: d >= (F.B - bWall) / 4, eOk: eMax <= F.B / 6, eMax } };
        // sens transversal : semelle filante sous voile → aciers de répartition ≥ 1/4 des aciers principaux (par m) ;
        // sous colonnes → poutre renversée sur les colonnes chargée par la réaction du sol uniforme
        const nc = end ? (sp.culee.type === 'enterree' ? sp.culee.nCol : 0) : (sp.pile.type === 'colonnes' ? sp.pile.nCol : 0);
        if (nc > 0) {
          const off = (Lf - width) / 2, Vu = eluMax.f ? eluMax.f.V : 0;
          const bm = pierCap({ length: Lf, supports: Array.from({ length: nc }, (_, j) => ({ x: off + width * (2 * j + 1) / (2 * nc) })), loads: [], q: -Vu / Lf, b: F.B, h: F.hs, c, fck, fyk, code, rhoMin: 0.0012 });
          found.trans = { mode: 'poutre sur colonnes', Mneg: bm.Mneg, Mpos: bm.Mpos, AsTop: bm.AsTop, AsBot: bm.AsBot };
          found.AsTransPerM = Math.max(bm.AsTop, bm.AsBot) / F.B;
        } else found.AsTransPerM = found.AsLong / Lf / 4;
        found.AsTransPerM = Math.max(found.AsTransPerM, 0.0012 * F.hs);
      } else {
        const nF = Math.max(1, F.nFiles), nP = Math.max(1, F.nPile), D = F.pileD;
        const xsP = []; for (let f = 0; f < nF; f++) for (let k = 0; k < nP; k++) xsP.push(nF === 1 ? 0 : (f - (nF - 1) / 2) * F.sPile);
        // module de Ménard couche par couche le long du pieu (tête à la profondeur D_e de la base de semelle)
        const kAt = z => { const l = profile.at(F.De + z); return menardReaction({ EM: l.EM * 1000, alpha: l.alpha, B: D }); };
        const mr = { k: z => kAt(z).k, kLong: z => kAt(z).kLong }, kR = mr.k;
        const kHead = kAt(0).k;
        const pc = pileConcrete({ fc28: fck, D, L: F.Lpile, type: F.pileType });
        const Ep = code === 'BAEL' ? pc.Ei : Ecm(Math.min(fck, 30));
        // pieu de Winkler-Ménard : réponses linéaires unitaires. Deux files : tête encastrée dans la semelle (H seul) ;
        // file unique : la semelle ne bloque pas la rotation longitudinale, chaque pieu reprend H/n et M/n en tête.
        // enveloppe des modules de courte (freinage, TCD) et de longue durée (permanentes, retrait, TLD) : réponse la plus défavorable
        const env = (a, b) => ({ M: a.M.map((m, i) => (Math.abs(m) >= Math.abs(b.M[i]) ? m : b.M[i])), Mmax: Math.max(a.Mmax, b.Mmax), y0: Math.max(Math.abs(a.y0), Math.abs(b.y0)) });
        // crue : longueur de pieu dégagée sous la semelle par l'affouillement (sol sans réaction latérale ni frottement)
        const expo = wl ? Math.min(Math.max(0, dAff - F.De), 0.9 * F.Lpile) : 0;
        const lats = ex => {
          const kS = ex > 0 ? z => (z < ex ? 0 : kR(z)) : kR, kL = ex > 0 ? z => (z < ex ? 0 : mr.kLong(z)) : mr.kLong;
          return {
            latFix: env(lateralPile({ L: F.Lpile, D, E: Ep, k: kS, H: 1, fixedHead: true }), lateralPile({ L: F.Lpile, D, E: Ep, k: kL, H: 1, fixedHead: true })),
            latH: env(lateralPile({ L: F.Lpile, D, E: Ep, k: kS, H: 1 }), lateralPile({ L: F.Lpile, D, E: Ep, k: kL, H: 1 })),
            latM: env(lateralPile({ L: F.Lpile, D, E: Ep, k: kS, H: 0, M0: 1 }), lateralPile({ L: F.Lpile, D, E: Ep, k: kL, H: 0, M0: 1 })),
          };
        };
        const L0 = lats(0), LW = expo > 0 ? lats(expo) : L0;
        // pieux d'une file répartis sur la longueur de semelle (sens transversal) : effet du moment transversal de crue
        const ysP = Array.from({ length: nP }, (_, k2) => Lf * (2 * k2 + 1) / (2 * nP) - Lf / 2), sy2 = nF * ysP.reduce((a, y) => a + y * y, 0), yMax = Math.max(0, ...ysP);
        const rows = fd.map(f => {
          const { latFix, latH, latM } = f.crue ? LW : L0;
          const dNy = f.crue && sy2 > 0 ? Math.abs(f.My) * yMax / sy2 : 0;
          const Hp = Math.abs(f.H) / xsP.length;
          if (nF > 1) {
            const Mhead = Math.abs(latFix.M[0]) * Hp;
            const g = pileGroupForces({ N: f.V, M: Math.abs(f.M), xs: xsP, Mhead });
            return { ...f, Nmax: Math.max(...g.N) + dNy, Nmin: Math.min(...g.N) - dNy, Hp, Mhead, Mmax: latFix.Mmax * Hp, y0: latFix.y0 * Hp };
          }
          const Mp = Math.abs(f.M) / xsP.length;
          const Mz = latH.M.map((m, i) => Math.max(Math.abs(Hp * m + Mp * latM.M[i]), Math.abs(Hp * m - Mp * latM.M[i])));
          return { ...f, Nmax: f.V / xsP.length + dNy, Nmin: f.V / xsP.length - dNy, Hp, Mhead: Mp, Mmax: Math.max(...Mz), y0: Math.abs(latH.y0 * Hp) + Math.abs(latM.y0 * Mp) };
        });
        const elu = rows.filter(r => r.ls === 'ELU' && !r.crue), els = rows.filter(r => r.ls === 'ELS' && !r.crue), eluAll = rows.filter(r => r.ls === 'ELU'), accR = rows.filter(r => r.ls === 'ACC');
        const shapeP = { D, c: 0.07, nBars: 12 };
        // béton de pieu foré : BAEL / F62-V f_c = min(f_c28 ; 25)/(k₁ k₂), k₁ = 1,2 (groupe B), k₂ = 1,05 ; EC2 § 2.4.2.5 : γ_c × k_f = 1,1
        const pileMat = code === 'BAEL' ? { code, fck: pc.fc, fyk } : { code, fck: Math.min(fck, 30), fyk, gammaC: 1.5 * 1.1 };
        const pileMatAcc = { ...pileMat, gammaC: code === 'BAEL' ? 1.15 : 1.2, gammaS: 1.0 };
        const AsOf = (r, mt) => Math.max(requiredSteelNM(shapeP, mt, Math.max(0, r.Nmin), r.Mmax).As ?? Infinity, requiredSteelNM(shapeP, mt, r.Nmax, r.Mmax).As ?? Infinity);
        const AsP = Math.max(...eluAll.map(r => AsOf(r, pileMat)), ...accR.map(r => AsOf(r, pileMatAcc)));
        const cap = pileCapacity({ code, type: F.pileType, D, Lpile: F.Lpile, profile, Dhead: F.De });
        // portance en crue : frottement compté sous le fond affouillé (même pointe)
        const capW = expo > 0 ? pileCapacity({ code, type: F.pileType, D, Lpile: F.Lpile - expo, profile, Dhead: F.De + expo }) : cap;
        const crueR = rows.filter(r => r.crue);
        const scour = wl ? { dAff, expo, capW, ratioELU: capW.applicable && crueR.some(r => r.ls === 'ELU') ? Math.max(...crueR.filter(r => r.ls === 'ELU').map(r => r.Nmax)) / capW.Rcd : NaN,
          ratioELS: capW.applicable && crueR.some(r => r.ls === 'ELS') ? Math.max(...crueR.filter(r => r.ls === 'ELS').map(r => r.Nmax)) / capW.Rcrd : NaN } : null;
        const NmaxU = Math.max(...elu.map(r => r.Nmax)), NmaxS = Math.max(0, ...els.map(r => r.Nmax)), NminU = Math.min(...elu.map(r => r.Nmin));
        const NminS = Math.min(...els.map(r => r.Nmin));
        const NmaxA = accR.length ? Math.max(...accR.map(r => r.Nmax)) : 0;
        const capRatio = cap.applicable ? { ELU: NmaxU / cap.Rcd, ELS: NmaxS / cap.Rcrd, ACC: accR.length ? NmaxA / cap.RcdAcc : 0, traction: NminU < 0 ? -NminU / cap.Rtd : 0,
          tractionELS: NminS < 0 ? (code === 'BAEL' ? -NminS / (0.7 * cap.Rs / 1.4) : -NminS / (cap.Rtd / 1.1)) : 0 } : { ELU: NaN, ELS: NaN, traction: NaN, tractionELS: NaN };
        // effet de groupe (F62 C.4.1,2 et annexe G.1 ; NF P 94-262 annexe J) : Converse-Labarre / formule J.2
        const dP = nF > 1 ? Math.min(F.sPile, Lf / nP) : Lf / nP;
        // F62 annexe G.1 § 2.5 : sols cohérents Ce = ¼(1 + d/B) (1 au-delà de d = 3B), sols frottants Ce = 1 ; NF P 94-262 J.2
        const Ce = code === 'BAEL' ? (isCohesive(profile.at(F.De + F.Lpile / 2).classe) ? efficaciteCoherentF62({ B: D, d: dP }) : 1) : efficaciteEC7({ B: D, d: dP, m: nF, n: nP });
        const VmaxU = Math.max(...elu.map(r => r.V));
        const group = cap.applicable ? { Ce: Math.min(1, Ce), d: dP, ratio: VmaxU / (Math.min(1, Ce) * xsP.length * cap.Rcd) } : null;
        const sigSels = code === 'BAEL' ? sigmaSBAEL({ fe: fyk, fc28: fck, fiss: 'FTP' }) : 0.8 * fyk;
        let tie = null, capBeam = null;
        if (nF === 2) {
          const t = pileCapTwoRows({ RU: NmaxU, RS: NmaxS, l: F.sPile, b: bWall, hs: F.hs, D, fsu: fyk / 1.15, sigSels, nPiles: xsP.length });
          tie = { ...t, perCouple: t.A1, total: t.A1 * nP };
        } else if (nF === 1) {
          // semelle filante sur une file de pieux (PP73 1.3.2 § 4.4) : poutre sur les pieux sous le voile (charge répartie) ou les colonnes
          const nc = end ? (sp.culee.type === 'enterree' ? sp.culee.nCol : 0) : (sp.pile.type === 'colonnes' ? sp.pile.nCol : 0);
          const Vu = Math.max(...elu.map(r => r.V)), off = (Lf - width) / 2;
          const piles = Array.from({ length: nP }, (_, k2) => ({ x: Lf * (2 * k2 + 1) / (2 * nP) }));
          const loads = nc > 0 ? Array.from({ length: nc }, (_, j) => ({ x: off + width * (2 * j + 1) / (2 * nc), P: (Vu - gU * Wsem) / nc })) : [];
          const bm = pierCap({ length: Lf, supports: piles, loads, q: nc > 0 ? gU * Wsem / Lf : Vu / Lf, b: F.B, h: F.hs, c: 0.07, fck, fyk, code, rhoMin: 0.0012 });
          capBeam = { Mneg: bm.Mneg, Mpos: bm.Mpos, V: bm.V, AsTop: bm.AsTop, AsBot: bm.AsBot };
        }
        found = { type: 'pieux', D, n: xsP.length, nF, nP, Lpile: F.Lpile, k: kHead, rows, NmaxU, NmaxS, NminU, As: Math.max(AsP, pileMinSteel({ D, code })), AsReq: AsP, Amin: pileMinSteel({ D, code }), cap, capRatio, NmaxA, group, scour, pileConc: pc, tie, capBeam, sigSels, hs: F.hs, hOk: F.hs >= Math.max(0.60, nF === 2 ? 1.4 * D : D) - 1e-9, hMin: Math.max(0.60, nF === 2 ? 1.4 * D : D), W: Wsem };
      }
      per[code] = { base, shaft: shaftRes, ...extra, found };
    }
    out.BAEL = per.BAEL; out.EC = per.EC;
    out.warnings = geometryWarnings(sp, end, width);
    return out;
  });
  return { sp, xs, Lv, width, seisme, water, profiles: profs, distB, distE, braking: { F61: brk, EC: bearings.H }, eps: { RF, TLD: sp.eps.TLD, TCD: sp.eps.TCD, T: epsT }, hGG, Ka: KA, lines };
}
