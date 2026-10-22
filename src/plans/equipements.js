/**
 * Équipements du tablier : géométrie paramétrée (corniches, dispositifs de retenue et longrines d'ancrage, garde-corps,
 * bordures et remplissage des trottoirs, étanchéité et couche de roulement, joints de chaussée, gargouilles), dessin dans
 * les coupes et la vue en plan du coffrage, feuille « Équipements » (détails, schéma d'assainissement, métré) et contrôle
 * des poids propres par rapport aux charges linéaires saisies pour le calcul.
 *
 * Les dimensions sont des valeurs courantes par défaut, modifiables ; les formes des dispositifs sont schématiques (le
 * modèle retenu, sa fiche et son marquage CE fixent la géométrie réelle). Références :
 *  - joints : Cerema, « Joints de chaussée des ponts-routes », guide méthodologique 2016, § 1.3.2 (plages de souffle) ;
 *    Sétra, note d'information OA n° 36 (souffle aux Eurocodes) ;
 *  - évacuation des eaux : Sétra, « Assainissement des ponts-routes », 1989 ; fiche MEMOAR X-2 (2010) : retombée de 50 cm
 *    sous l'intrados ;
 *  - garde-corps : XP P98-405 (1,00 m pour les piétons), Sétra guide GC § 3.4.3, Certu 2008 § 3.6.2 (1,20 m pour les cycles).
 */
import { Vue, Feuille, fmtCote } from './dessin.js';
import { composer } from './mise_en_page.js';
import { couperNote } from './appuis.js';
import { geometrie, courbeU } from './geometrie.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');

/** Valeurs par défaut (champs eq_* du formulaire). */
export const EQ_DEFAUTS = {
  corn: 'prefa', cornH: 0.60, cornL: 0.25, cornE: 0.20, cornT: 0.15,
  dr: 'barriere', drPos: 'rive', hDR: 1.00, drY: 0.30, lgB: 0.50, lgH: 0.30, pDR: 0.65,
  gc: 'auto', hGC: 1.00, pGC: 0.50,
  hTrot: 0.15, bordB: 0.15, gTrot: 22,
  etanType: 'FPA', etanE: 0.03,
  jointW: null, jointType: '',
  garg: 'gargouilles', gargPas: 20, gargD: 0.10, gargDep: 0.50,
  canL: 0.50,
};

const ETAN = { FPA: 'feuille préfabriquée monocouche et asphalte', chape: 'chape mince adhérente', asphalte: 'asphalte coulé (chape épaisse)', MCA: 'moyen de complexe d\'asphalte' };
const DR = { barriere: 'barrière (montants et lisses) sur longrine', glissiere: 'glissière métallique sur longrine', gba: 'glissière en béton adhérente (GBA)', gc: 'garde-corps seul', aucun: 'aucun' };

/** Données du formulaire (champs eq_*) → paramètres des équipements. */
export function lireEquipements(d = {}) {
  const e = { ...EQ_DEFAUTS };
  for (const k of Object.keys(EQ_DEFAUTS)) {
    const v = d['eq_' + k]; if (v == null || String(v).trim() === '') continue;
    e[k] = typeof EQ_DEFAUTS[k] === 'number' || k === 'jointW' ? +v : String(v);
  }
  if (d.dr_hDR && (d.eq_hDR == null || String(d.eq_hDR).trim() === '')) e.hDR = +d.dr_hDR || e.hDR;
  return e;
}

/* --------------------------------------------------------------------------------------------- géométrie */
/** Géométrie des équipements d'un côté (sg = +1 : y > 0, −1 : y < 0), coordonnées (y, z) du profil en travers. */
export function bordGeom(G, eq, sg) {
  const b = G.b, zE = G.dessus(sg * b), fw = (G.g.footways || []).find(f => sg * (f.y1 + f.y2) / 2 > 0 && Math.max(Math.abs(f.y1), Math.abs(f.y2)) > b - 1e-6) || null;
  const out = { sg, fw, b };
  const Y = y => sg * y;   // distance à l'axe (≥ 0) → ordonnée y
  const corn = eq.corn !== 'aucune';
  // corniche : talon sur la dalle, face vue légèrement inclinée, nez chanfreiné, larmier (goutte d'eau) sous le nez
  // niveau fini commun : la corniche et la contre-corniche (longrine en rive) arasées au même niveau, comme dans les dossiers
  const longRive = (eq.dr === 'barriere' || eq.dr === 'glissiere') && !(fw && eq.drPos === 'bordure');
  const hFini = corn && longRive ? Math.max(eq.cornT, eq.lgH) : eq.cornT;
  out.hFini = hFini;
  if (corn) {
    const zt = zE + hFini, zb = zt - eq.cornH, E = eq.cornE, ch = Math.min(0.04, E / 3), lm = Math.min(0.025, E / 5);
    out.corniche = { type: eq.corn, poly: [[b - eq.cornL, zE], [b - eq.cornL, zt], [b + E - ch, zt], [b + E, zt - ch], [b + E - 0.02, zb + ch],
      [b + E - 0.02 - ch, zb], [b + E * 0.45 + lm, zb], [b + E * 0.45 + lm, zb + lm], [b + E * 0.45, zb + lm], [b + E * 0.45, zb], [b, zb], [b, zE]].map(([d, z]) => [Y(d), z]) };
  } else out.corniche = null;
  const zSur = d => G.dessus(Y(d)) + (corn && d > b - eq.cornL + 1e-9 ? hFini : 0);   // dessus du support (dalle ou talon)
  // trottoir : bordure côté chaussée, remplissage jusqu'à la longrine ou à la corniche
  const dIn = fw ? Math.min(Math.abs(fw.y1), Math.abs(fw.y2)) : null;
  const zRoute = d => G.dessus(Y(d)) + G.tRev;
  const zTrot = fw ? zRoute(dIn) + eq.hTrot : null;
  // position du dispositif : en rive (trottoir éventuel côté chaussée) ou à la bordure (trottoir derrière le dispositif)
  const dr = eq.dr, aBordure = !!fw && eq.drPos === 'bordure' && (dr === 'barriere' || dr === 'glissiere');
  out.zRef = aBordure ? zRoute(dIn) : fw ? zTrot : zRoute(b - Math.max(eq.drY, 0.5));   // niveau de référence de la hauteur du dispositif
  out.alertes = [];
  if (aBordure) {
    // longrine à la place de la bordure, dispositif côté chaussée ; trottoir entre la longrine et la corniche
    const d0 = dIn, d1 = dIn + eq.lgB, c = (d0 + d1) / 2, zD = G.dessus(Y(d0)), top = Math.max(zD + eq.lgH, zTrot + 0.05);
    out.longrine = { poly: [[d0, zD], [d1, G.dessus(Y(d1))], [d1, top], [d0, top]].map(([d, z]) => [Y(d), z]), c, base: zD, top, B: eq.lgB, H: top - zD, aBordure: true };
    out.dispositif = { type: dr, y: Y(c), base: top, haut: out.zRef + eq.hDR };
  } else if (dr === 'barriere' || dr === 'glissiere') {
    // longrine coulée en place sur la dalle ; si elle recouvre le talon de la corniche, elle l'enrobe (sous-face en
    // gradin : dalle puis dessus du talon), sans vide sous la longrine
    // avec une corniche préfabriquée : contre-corniche coulée en place sur la dalle, contre le talon de la corniche
    // (disposition courante des dossiers d'ouvrages, barrière BN4 boulonnée dans la contre-corniche) ; sinon axe à drY du bord
    const d1 = corn ? b - eq.cornL : b - eq.drY + eq.lgB / 2, d0 = d1 - eq.lgB, c = (d0 + d1) / 2, zD = G.dessus(Y(d0));
    const dT = corn ? b - eq.cornL : Infinity, zT = corn ? zE + hFini : -Infinity;
    const top = corn ? zE + hFini : zD + eq.lgH, base = zD;   // arasée au niveau fini de la corniche
    const bas = corn && d1 > dT + 1e-9 ? (d0 >= dT - 1e-9 ? [[d0, zT], [d1, zT]] : [[d0, zD], [dT, G.dessus(Y(dT))], [dT, zT], [d1, zT]]) : [[d0, zD], [d1, G.dessus(Y(d1))]];
    out.longrine = { poly: [...bas, [d1, top], [d0, top]].map(([d, z]) => [Y(d), z]), c, base, top, B: eq.lgB, H: top - zD };
    out.dispositif = { type: dr, y: Y(c), base: top, haut: out.zRef + eq.hDR };
    // trottoir côté chaussée devant un dispositif en rive : le dispositif doit assurer aussi la fonction de garde-corps
    if (fw && dr === 'barriere') out.dispositif.mixte = true;
    if (fw && dr === 'glissiere') out.alertes.push('Trottoir côté chaussée devant une glissière en rive : la glissière n\'assure pas la fonction de garde-corps ; prévoir une barrière avec fonction garde-corps ou placer le dispositif à la bordure.');
  } else if (dr === 'gba') {
    const c = b - eq.drY, base = zSur(c), Wb = 0.60, Wt = 0.20, H = eq.hDR;
    out.dispositif = { type: 'gba', poly: [[c + Wb / 2, base], [c + Wb / 2, base + 0.08], [c + Wt / 2, base + H], [c - Wt / 2, base + H], [c - Wb / 2 + 0.05, base + 0.25], [c - Wb / 2, base + 0.08], [c - Wb / 2, base]].map(([d, z]) => [Y(d), z]), y: Y(c), base, haut: base + H, aire: (Wb + Wt) / 2 * H };
  }
  // garde-corps : seul, ou en rive en plus du dispositif (trottoir)
  // automatique : seulement s'il protège un trottoir accessible (dispositif à la bordure, aucun dispositif, GBA trop basse) ;
  // jamais derrière une barrière en rive, qui assure elle-même la fonction de garde-corps
  const gcAvec = dr === 'gc' || eq.gc === 'oui' || (eq.gc === 'auto' && !!fw && (aBordure || dr === 'aucun' || dr === 'gba'));
  if (gcAvec) {
    // sur la corniche (au-delà de la longrine) ou en rive de la dalle
    const d = corn ? b + eq.cornE / 2 : b - 0.06, base = corn ? zE + hFini : zSur(d);
    out.gardeCorps = { y: Y(d), base, haut: Math.max(base, out.zRef) + eq.hGC, h: eq.hGC };
  }
  if (fw && aBordure) {
    // trottoir derrière le dispositif : remplissage de la longrine à la corniche, largeur libre contrôlée (1,40 m)
    const zBase = d => G.dessus(Y(d)) + eq.etanE, d0 = dIn + eq.lgB, d1 = corn ? b - eq.cornL : b - 0.10;
    out.bordure = null;
    out.remplissage = { poly: [[d0, zBase(d0)], [d0, zTrot], [d1, zTrot], [d1, zBase(d1)]].map(([d, z]) => [Y(d), z]), aire: (d1 - d0) * (zTrot - zBase((d0 + d1) / 2)) };
    out.fourreaux = [0.30, 0.55].map(t => d0 + (d1 - d0) * t).filter(d => d < d1 - 0.1).map(d => [Y(d), zBase(d) + 0.12]);
    out.filEau = dIn;
    const libre = (corn ? b + eq.cornE / 2 - 0.05 : b - 0.10) - d0;
    out.largeurLibre = libre;
    if (libre < 1.40 - 1e-9) out.alertes.push(`Trottoir derrière le dispositif : largeur libre ${fr(libre)} m < 1,40 m (cheminement accessible) ; vérifier aussi la largeur de fonctionnement du dispositif.`);
  } else if (fw) {
    const obst = out.longrine ? out.longrine.c - eq.lgB / 2 : out.dispositif && out.dispositif.type === 'gba' ? b - eq.drY - 0.30 : corn ? b - eq.cornL : b;
    const zBase = d => G.dessus(Y(d)) + eq.etanE;
    out.bordure = { poly: [[dIn, zBase(dIn)], [dIn, zTrot - 0.03], [dIn + 0.03, zTrot], [dIn + eq.bordB, zTrot], [dIn + eq.bordB, zBase(dIn + eq.bordB)]].map(([d, z]) => [Y(d), z]), d: dIn };
    const d0 = dIn + eq.bordB, d1 = Math.max(d0 + 0.05, obst);
    out.remplissage = { poly: [[d0, zBase(d0)], [d0, zTrot], [d1, zTrot], [d1, zBase(d1)]].map(([d, z]) => [Y(d), z]), aire: (d1 - d0) * (zTrot - zBase((d0 + d1) / 2)) };
    out.fourreaux = [0.30, 0.55].map(t => d0 + (d1 - d0) * t).filter(d => d < d1 - 0.1).map(d => [Y(d), zBase(d) + 0.12]);
    out.filEau = dIn;
  } else out.filEau = out.longrine ? out.longrine.c - eq.lgB / 2 : out.dispositif ? b - eq.drY - 0.30 : corn ? b - eq.cornL : b;
  out.zFil = zRoute(out.filEau);
  // caniveau en asphalte coulé le long du fil d'eau (bande de largeur canL, dans l'épaisseur de la couche de roulement)
  if (eq.canL > 0) out.caniveau = { d0: out.filEau - eq.canL, d1: out.filEau };
  return out;
}

/** Côtés bas (fil d'eau collecté) : dévers en toit ou absent → les deux ; dévers unique → le côté bas. */
export function cotesBas(G) {
  const dv = G.g.devers;
  if (dv && dv.p > 0 && dv.profil === 'unique' && dv.mode !== 'revetement') return [G.dessus(G.b) < G.dessus(-G.b) ? 1 : -1];
  return [1, -1];
}

/** Souffle des joints aux culées : allongement v_T, raccourcissement v_T + v_RF → W = 2 v_T + v_RF (ELS, Eurocodes). */
export function souffleJoints(st, eq) {
  const L = st.supports && st.supports.lines, n = st.deck.beam.x0.length;
  return [0, n - 1].map(i => {
    const brg = L && L[i] && (L[i].EC || L[i].BAEL) ? (L[i].EC || L[i].BAEL).brg : null;
    const vT = brg ? brg.vT : null, vRF = brg ? brg.vRF : null;
    const Wc = vT != null ? 2 * vT + vRF : null, W = eq.jointW > 0 ? eq.jointW / 1000 : Wc;
    return { i, vT, vRF, Wcalc: Wc, W, type: eq.jointType || familleJoint(W) };
  });
}
/** Famille de joint selon le souffle (Cerema 2016, § 1.3.2). */
export function familleJoint(W) {
  if (W == null) return 'à définir (souffle non calculé)';
  const mm = W * 1000;
  if (mm < 10) return 'joint sous revêtement (souffle < 10 mm)';
  if (mm < 20) return 'joint à revêtement amélioré (souffle < 20 mm)';
  if (mm <= 80) return mm < 30 ? 'joint à lèvres, en bas de plage (30 à 80 mm) ; revêtement amélioré à justifier' : 'joint à lèvres (30 à 80 mm, de préférence ≤ 50 mm)';
  return 'joint cantilever (50 à 700 mm) ou à bande (50 à 800 mm)';
}

/** Gargouilles : abscisses le long du tablier et ordonnée du fil d'eau, par côté bas. */
export function gargouilles(G, eq) {
  if (eq.garg === 'aucun') return [];
  const out = [], L = G.uB - G.uA, n = Math.max(2, Math.ceil(L / eq.gargPas) + 1);
  for (const sg of cotesBas(G)) {
    const B = bordGeom(G, eq, sg), y = sg * (B.filEau - 0.25);
    for (let k = 0; k < n; k++) out.push({ u: G.uA + 0.8 + (L - 1.6) * k / (n - 1), y, sg });
  }
  return out;
}

/* ------------------------------------------------------------------------------------- poids et contrôle */
export function poidsBord(G, eq, sg) {
  const B = bordGeom(G, eq, sg), P = [];
  const aire = poly => Math.abs(poly.reduce((s, p, k) => { const q = poly[(k + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  if (B.corniche) P.push(['Corniche', 25 * aire(B.corniche.poly)]);
  if (B.longrine) P.push([B.corniche ? 'Contre-corniche' : 'Longrine d\'ancrage', 25 * aire(B.longrine.poly)]);
  if (B.dispositif) P.push([`Dispositif de retenue (${eq.dr === 'gba' ? 'GBA' : eq.dr})`, eq.dr === 'gba' ? 24 * B.dispositif.aire : eq.pDR]);
  if (B.dispositif && B.dispositif.mixte) P.push(['Panneaux grillagés (fonction garde-corps)', 0.15]);
  if (B.gardeCorps) P.push(['Garde-corps', eq.pGC]);
  if (B.bordure) P.push(['Bordure', 24 * aire(B.bordure.poly)]);
  if (B.remplissage) P.push(['Remplissage du trottoir', eq.gTrot * aire(B.remplissage.poly)]);
  return { lignes: P, total: P.reduce((s, p) => s + p[1], 0) };
}
/** Charges linéaires saisies, par côté (e > 0 : côté y > 0). */
export function chargesSaisies(st, sg) {
  return (st.deck.g.lines || []).filter(l => sg * l.e > 0).reduce((s, l) => s + (l.g || 0), 0);
}
export function controleCharges(st, eq, G = geometrie(st)) {
  return [1, -1].map(sg => { const P = poidsBord(G, eq, sg), S = chargesSaisies(st, sg); return { sg, P, saisi: S, ecart: S > 0 ? P.total / S - 1 : null }; });
}

/* ------------------------------------------------------------------------------- dessin dans une coupe */
/** Équipements d'un côté dans une vue en travers (X = −y). `detail` : repères et désignations. */
export function dessinerBord(v, G, eq, sg, { detail = false, dMin = 0 } = {}) {
  const B = bordGeom(G, eq, sg), X = y => -y, P = pts => pts.map(([y, z]) => [X(y), z]);
  const notes = [];
  if (B.corniche) {
    const p = P(B.corniche.poly); v.poly('EQUIPEMENTS', p, true); v.hachure(p);
    notes.push([p[3], `Corniche ${B.corniche.type === 'prefa' ? 'préfabriquée' : 'coulée en place'} (h ${fr(eq.cornH)})`]);
  }
  if (B.longrine) { const p = P(B.longrine.poly); v.poly('EQUIPEMENTS', p, true); v.hachure(p); notes.push([p[2], `${B.longrine.aBordure ? 'Longrine d\'ancrage (bordure)' : B.corniche ? 'Contre-corniche coulée en place' : 'Longrine d\'ancrage'} ${fr(eq.lgB)} × ${fr(eq.lgH)}`]); }
  const D = B.dispositif;
  if (D) {
    if (D.type === 'gba') { const p = P(D.poly); v.poly('EQUIPEMENTS', p, true); v.hachure(p); notes.push([[X(D.y), D.haut], `GBA (profil indicatif), h ${fr(eq.hDR)}`]); }
    else {
      // poteau (profil effilé), platine, lisses côté chaussée ; glissière : poteau C, écarteur, lisse à double onde
      const x = X(D.y), dIn = -sg, sc = dIn > 0 ? -1 : 1;   // sc : sens vers la chaussée en abscisse X
      v.poly('EQUIPEMENTS', [[x - 0.15, D.base], [x + 0.15, D.base], [x + 0.15, D.base + 0.025], [x - 0.15, D.base + 0.025]], true);
      if (D.type === 'barriere') {
        const wb = 0.07, wt = 0.04, z0 = D.base + 0.025;
        v.poly('EQUIPEMENTS', [[x - sc * wb, z0], [x + sc * wb, z0], [x + sc * wt, D.haut], [x - sc * wb * 0.6, D.haut]], true);
        for (const z of [D.haut - 0.07, D.haut - 0.46]) {
          const xf = x + sc * (wt + 0.06 + (D.haut - z) * 0.03);
          v.poly('EQUIPEMENTS', [[xf, z - 0.035], [xf + sc * 0.10, z - 0.035], [xf + sc * 0.10, z + 0.035], [xf, z + 0.035]], true);
          v.ligne('EQUIPEMENTS', [xf, z], [x + sc * (wt + (D.haut - z) * 0.03), z]);
        }
        for (const dx of [-0.08, 0.08]) v.ligne('EQUIPEMENTS', [x + dx, D.base], [x + dx, D.base - 0.18]);   // tiges d'ancrage
        if (D.mixte) {   // panneau grillagé en partie arrière (fonction garde-corps, NF P98-405)
          const xg = x - sc * (wb + 0.02), z1 = D.base + 0.10, z2 = D.haut - 0.04;
          v.poly('EQUIPEMENTS', [[xg, z1], [xg - sc * 0.02, z1], [xg - sc * 0.02, z2], [xg, z2]], true);
          for (let z = z1 + 0.08; z < z2; z += 0.08) v.ligne('VUES', [xg, z], [xg - sc * 0.02, z - 0.04]);
        }
      } else {
        v.poly('EQUIPEMENTS', [[x - 0.05, D.base + 0.025], [x + 0.05, D.base + 0.025], [x + 0.05, D.haut - 0.05], [x - 0.05, D.haut - 0.05]], true);
        const zm = D.base + Math.max(0.35, (D.haut - D.base) * 0.55), xe = x + sc * 0.05, xl = xe + sc * 0.12;
        v.poly('EQUIPEMENTS', [[xe, zm - 0.08], [xl, zm - 0.06], [xl, zm + 0.06], [xe, zm + 0.08]], true);   // écarteur
        v.poly('EQUIPEMENTS', [[xl, zm - 0.155], [xl + sc * 0.05, zm - 0.10], [xl + sc * 0.02, zm], [xl + sc * 0.05, zm + 0.10], [xl, zm + 0.155]]);
      }
      notes.push([[x, D.haut], `${D.type === 'barriere' ? (D.mixte ? 'Barrière (type BN4) avec fonction garde-corps (panneaux grillagés, NF P98-405)' : 'Barrière (type BN4)') : 'Glissière'}, h ${fr(eq.hDR)}`]);
    }
  }
  if (B.gardeCorps) {
    // garde-corps (type S8) : montant, main courante, lisse basse, platine scellée
    const g = B.gardeCorps, x = X(g.y);
    v.poly('EQUIPEMENTS', [[x - 0.07, g.base], [x + 0.07, g.base], [x + 0.07, g.base + 0.02], [x - 0.07, g.base + 0.02]], true);
    v.poly('EQUIPEMENTS', [[x - 0.025, g.base + 0.02], [x + 0.025, g.base + 0.02], [x + 0.02, g.haut - 0.03], [x - 0.02, g.haut - 0.03]], true);
    v.cercle('EQUIPEMENTS', [x, g.haut - 0.02], 0.035);
    v.poly('EQUIPEMENTS', [[x - 0.03, g.base + 0.10], [x + 0.03, g.base + 0.10], [x + 0.03, g.base + 0.14], [x - 0.03, g.base + 0.14]], true);
    v.ligne('VUES', [x, g.base + 0.14], [x, g.haut - 0.055]);   // barreaudage (vu)
    notes.push([[x, g.haut + 0.02], `Garde-corps (type S8) h ${fr(eq.hGC)}`]);
  }
  if (B.bordure) { const p = P(B.bordure.poly); v.poly('EQUIPEMENTS', p, true); notes.push([p[1], `Bordure, vue ${fr(eq.hTrot)}`]); }
  if (B.remplissage) {
    const p = P(B.remplissage.poly); v.poly('VUES', p, true);
    for (const f of B.fourreaux) v.cercle('EQUIPEMENTS', [X(f[0]), f[1]], 0.05);
    notes.push([[(p[0][0] + p[2][0]) / 2, p[1][1]], 'Trottoir : remplissage, fourreaux Ø 100']);
  }
  if (B.caniveau && B.caniveau.d0 > dMin) {
    const { d0, d1 } = B.caniveau, zr = d => G.dessus(sg * d) + G.tRev, ze = d => G.dessus(sg * d) + eq.etanE;
    const p = P([[sg * d0, ze(d0)], [sg * d1, ze(d1)], [sg * d1, zr(d1) - 0.01], [sg * d0, zr(d0)]]);
    v.poly('EQUIPEMENTS', p, true); v.pointille(p, 0.8);
    notes.push([[(p[0][0] + p[1][0]) / 2, p[2][1]], `Caniveau en asphalte coulé, largeur ${fr(eq.canL)}`]);
  }
  // étanchéité et couche de roulement (de l'axe au bord, sous les équipements)
  const dE = B.corniche ? B.b - eq.cornL : B.b, ys = []; for (let d = dMin; d <= dE + 1e-9; d += 0.25) ys.push(Math.min(d, dE));
  v.poly('EQUIPEMENTS', ys.map(d => [X(sg * d), G.dessus(sg * d) + eq.etanE]));
  const dR = B.filEau, yr = []; for (let d = dMin; d <= dR + 1e-9; d += 0.25) yr.push(Math.min(d, dR));
  v.poly('VUES', yr.map(d => [X(sg * d), G.dessus(sg * d) + G.tRev]));
  if (detail) {
    notes.push([[X(sg * (B.filEau - 0.6)), G.dessus(sg * (B.filEau - 0.6)) + G.tRev], `Couche de roulement ${fr((G.tRev - eq.etanE) * 100, 0)} cm`]);
    notes.push([[X(sg * (B.filEau - 1.2)), G.dessus(sg * (B.filEau - 1.2)) + eq.etanE], `Étanchéité : ${ETAN[eq.etanType] || eq.etanType} (${fr(eq.etanE * 100, 0)} cm)`]);
    v.texte('TEXTES', [X(sg * B.filEau), B.zFil - 0.06], '▲ fil d\'eau', { h: 2.0, ancre: sg > 0 ? 'g' : 'd', v: 'h' });
  }
  return { B, notes };
}

/** Désignations reliées par des lignes de rappel, rangées au-dessus de la coupe (vue de détail). */
function etiquettes(v, notes, { xTxt, z0, pas, ancre }) {
  let prec = Infinity;
  notes.slice().sort((a, b) => b[0][1] - a[0][1]).forEach(([p, s], k) => {
    const z = Math.min(prec - pas, k === 0 ? z0 : Infinity, Math.max(p[1], z0 - k * pas)); prec = z;
    v.ligne('REPERES', p, [xTxt, z]);
    v.cercle('REPERES', p, 0.012, true);
    v.texte('TEXTES', [xTxt + (ancre === 'g' ? 0.04 : -0.04), z], s, { h: 2.5, ancre, v: 'm' });
  });
}

/* ------------------------------------------------------------------------------------ vues de détail */
/**
 * Plan type de la corniche préfabriquée : section au droit d'un élément courant, ferraillage type (cadres suivant le
 * profil, filants aux angles, attentes de liaison avec la contre-corniche) et réservation du scellement du garde-corps.
 * Repère : y vers l'extérieur depuis le bord de la dalle, z depuis le dessus de la dalle.
 */
function rupture(v, x0, x1, z, amp = 0.05) { const xm = (x0 + x1) / 2; v.poly('VUES', [[xm, z - 0.2], [xm, z - amp], [xm + amp, z], [xm - amp, z + amp / 2], [xm, z + amp], [xm, z + 0.2]]); }
export function vueCorniche(eq) {
  const v = new Vue('CORNICHE PRÉFABRIQUÉE — SECTION ET FERRAILLAGE TYPE'), c = 0.03;
  const L = eq.cornL, T = (eq.dr === 'barriere' || eq.dr === 'glissiere') && eq.drPos !== 'bordure' ? Math.max(eq.cornT, eq.lgH) : eq.cornT, H = eq.cornH, E = eq.cornE, ch = Math.min(0.04, E / 3), lm = Math.min(0.025, E / 5);
  const zt = T, zb = T - H;
  const prof = [[-L, 0], [-L, zt], [E - ch, zt], [E, zt - ch], [E - 0.02, zb + ch], [E - 0.02 - ch, zb], [E * 0.45 + lm, zb], [E * 0.45 + lm, zb + lm], [E * 0.45, zb + lm], [E * 0.45, zb], [0, zb], [0, 0]];
  v.poly('COFFRAGE', prof, true); v.hachure(prof);
  // dalle (amorce) et contre-corniche (amorce)
  v.poly('VUES', [[-L - 0.6, 0], [0, 0], [0, -0.25], [-L - 0.6, -0.25]]); rupture(v, -L - 0.62, -L - 0.58, -0.12, 0.05);
  v.poly('VUES', [[-L, 0], [-L - 0.45, 0], [-L - 0.45, zt + 0.15], [-L, zt + 0.15]]);
  v.texte('TEXTES', [-L - 0.3, -0.13], 'dalle', { h: 2.2, ancre: 'c', v: 'm' }); v.texte('TEXTES', [-L - 0.225, zt + 0.07], 'contre-corniche', { h: 2.0, ancre: 'c', v: 'm' });
  // cadre suivant le profil (enrobage 3 cm) : voile vertical et talon
  const cad = [[-L + c, c + 0.01], [-L + c, zt - c], [E - c - 0.01, zt - c], [E - c - 0.03, zb + c], [c, zb + c], [c, c + 0.01]];
  v.poly('ACIERS', cad, true);
  for (const p of [cad[1], cad[2], cad[3], cad[4], [c + 0.025, (zt + zb) / 2], [E - c - 0.035, (zt + zb) / 2], [-L / 2, zt - c - 0.012]]) v.cercle('ACIERS_COUPES', [p[0] + (p[0] < 0 ? 0.012 : -0.012) * 0, p[1]], 0.007, true);
  // attentes de liaison avec la contre-corniche
  v.poly('ACIERS', [[-L + 0.05, zt - c - 0.02], [-L - 0.35, zt - c - 0.02]]);
  // réservation du scellement du garde-corps
  v.poly('VUES', [[E / 2 - 0.05, zt], [E / 2 + 0.05, zt], [E / 2 + 0.05, zt - 0.20], [E / 2 - 0.05, zt - 0.20]], true);
  // désignations
  const lab = (p, q, t) => { v.ligne('REPERES', p, q); v.cercle('REPERES', p, 0.006, true); v.texte('TEXTES', [q[0] + 0.02, q[1]], t, { h: 2.2, ancre: 'g', v: 'm' }); };
  const xl = E + 0.25;
  lab([E / 2, zt - 0.1], [xl, zt + 0.10], 'Réservation scellement garde-corps (polystyrène)');
  lab([E - c - 0.02, zt - c], [xl, zt - 0.06], 'Cadres HA 8 e = 0,20 suivant le profil');
  lab([E - c - 0.035, (zt + zb) / 2], [xl, zt - 0.22], '6 HA 10 filants (angles et faces)');
  lab([-L - 0.2, zt - c - 0.02], [xl, zt - 0.38], 'Attentes HA 10 e = 0,40 vers la contre-corniche');
  lab([E * 0.45 + lm / 2, zb + lm / 2], [xl, zb + 0.05], 'Larmier 2,5 × 2,5 cm');
  // cotes
  v.coteH([-L, zt], [0, zt], zt + 0.22); v.coteH([0, zt], [E, zt], zt + 0.22); v.coteH([-L, zt], [E, zt], zt + 0.34);
  v.coteV([E, zt], [E, zb], E + 0.12); v.coteV([-L, 0], [-L, zt], -L - 0.55);
  return v;
}

export function vueDetailBord(G, eq, sg) {
  const v = new Vue(`DÉTAIL ${sg > 0 ? 'A' : 'B'} — BORD ${sg > 0 ? 'GAUCHE (y > 0)' : 'DROIT (y < 0)'} DU TABLIER`), X = y => -y, b = G.b;
  // dalle (sur 2,5 m depuis le bord), chanfrein, rupture
  const d0 = Math.max(0, b - 2.5), ys = [];
  for (let d = d0; d <= b + 1e-9; d += 0.1) ys.push(sg * Math.min(d, b));
  const ch = G.g.chamfer; if (ch && ch.joue > 0) ys.push(sg * (b - ch.joue));
  ys.sort((p, q) => sg * (p - q));
  const p = [...ys.map(y => [X(y), G.dessus(y)]), ...ys.slice().reverse().map(y => [X(y), G.dessous(y)])];
  v.poly('COFFRAGE', p.slice(0, ys.length).concat(p.slice(ys.length)), false);
  v.ligne('COFFRAGE', [X(sg * b), G.dessus(sg * b)], [X(sg * b), G.dessous(sg * b)]);
  const xr = X(sg * d0); v.poly('COFFRAGE', [[xr, G.dessus(sg * d0) + 0.05], [xr, G.dessus(sg * d0) - 0.2], [xr + 0.06, G.dessus(sg * d0) - 0.28], [xr - 0.06, G.dessus(sg * d0) - 0.38], [xr, G.dessous(sg * d0) - 0.05]]);
  v.hachure(p);
  const { B, notes } = dessinerBord(v, G, eq, sg, { detail: true, dMin: d0 });
  // désignations en colonne, côté axe, au-dessus de la chaussée
  const zTop = Math.max(B.zRef + eq.hDR, B.gardeCorps ? B.gardeCorps.haut : 0) + 0.1;
  etiquettes(v, notes, { xTxt: X(sg * (b - 1.25)), z0: zTop, pas: 0.13, ancre: sg > 0 ? 'g' : 'd' });
  // cotes : corniche, longrine (position), dispositif, garde-corps
  const zb = G.dessous(sg * b) - 0.35;
  if (B.corniche) v.coteH([X(sg * (b - eq.cornL)), G.dessus(sg * b) + B.hFini], [X(sg * (b + eq.cornE)), G.dessus(sg * b) + B.hFini], G.dessus(sg * b) + B.hFini + 0.12);
  if (B.corniche) v.coteV([X(sg * (b + eq.cornE)), G.dessus(sg * b) + B.hFini - eq.cornH], [X(sg * (b + eq.cornE)), G.dessus(sg * b) + B.hFini], X(sg * (b + eq.cornE + 0.15)));
  if (B.longrine) v.coteH([X(sg * (B.longrine.c)), B.longrine.base], [X(sg * b), G.dessus(sg * b)], zb);
  if (B.dispositif) v.coteV([X(B.dispositif.y), B.zRef], [X(B.dispositif.y), B.dispositif.haut], X(B.dispositif.y) + sg * 0.25);
  if (B.fw) { const dI = B.filEau, dO = Math.max(Math.abs(B.fw.y1), Math.abs(B.fw.y2)); v.coteH([X(sg * dI), G.dessus(sg * dI)], [X(sg * dO), G.dessus(sg * dO)], zb - 0.2); }
  return v;
}

function vueDetailJoint(G, st, eq, J) {
  const v = new Vue(`DÉTAIL C — JOINT DE CHAUSSÉE SUR ${G.nomLigne(J.i)}`), s = J.i === 0 ? 1 : -1, X = x => s * x;
  const h = G.h, zt = 0, W = J.W || 0.02;
  // tablier (about) et garde-grève
  const a = J.i === 0 ? G.aL : G.aR;
  const pd = [[X(-a), zt], [X(1.2), zt], [X(1.2), zt - h], [X(-a), zt - h]];
  v.poly('COFFRAGE', [pd[1], pd[0], pd[3], pd[2]]); v.hachure(pd);
  const xg = -a - W, pg = [[X(xg), zt + G.tRev - 0.02], [X(xg - 0.30), zt + G.tRev - 0.02], [X(xg - 0.30), zt - h - 0.4], [X(xg), zt - h - 0.4]];
  v.poly('COFFRAGE', pg, true); v.hachure(pg);
  // revêtement de part et d'autre, joint (symbole), étanchéité relevée
  v.poly('VUES', [[X(-a + 0.35), zt + G.tRev], [X(1.2), zt + G.tRev]]);
  v.poly('VUES', [[X(xg - 0.35), zt + G.tRev], [X(xg - 1.0), zt + G.tRev]]);
  v.poly('EQUIPEMENTS', [[X(-a), zt + eq.etanE], [X(1.2), zt + eq.etanE]]);
  const pj = [[X(-a + 0.35), zt + G.tRev], [X(xg - 0.35), zt + G.tRev], [X(xg - 0.35), zt + G.tRev - 0.12], [X(-a + 0.35), zt + G.tRev - 0.12]];
  v.poly('EQUIPEMENTS', pj, true);
  v.ligne('EQUIPEMENTS', [X(-a), zt + G.tRev - 0.12], [X(-a), zt - 0.12]); v.ligne('EQUIPEMENTS', [X(xg), zt + G.tRev - 0.12], [X(xg), zt - 0.12]);
  v.coteH([X(xg), zt - h - 0.4], [X(-a), zt - h], zt - h - 0.65, `${fr(W * 1000, 0)} mm`);
  v.texte('TEXTES', [X(-a - W / 2), zt + G.tRev + 0.35], `Joint : ${J.type}`, { h: 2.5, ancre: 'c' });
  v.texte('TEXTES', [X(-a - W / 2), zt + G.tRev + 0.20], `souffle ${J.Wcalc != null ? fr(J.Wcalc * 1000, 0) + ' mm calculé' : 'à calculer'}${eq.jointW > 0 ? ', ' + fr(eq.jointW, 0) + ' mm retenu' : ''}`, { h: 2.2, ancre: 'c' });
  v.texte('TEXTES', [X(0.6), zt - h / 2], 'tablier', { h: 2.4, ancre: 'c' });
  v.texte('TEXTES', [X(xg - 0.15), zt - h - 0.2], 'garde-grève', { h: 2.2, ancre: 'c', angle: 90 });
  return v;
}

function vueDetailGargouille(G, eq) {
  const v = new Vue('DÉTAIL D — GARGOUILLE'), sg = cotesBas(G)[0], B = bordGeom(G, eq, sg), X = y => -y;
  const yg = sg * (B.filEau - 0.25), d0 = B.filEau - 1.2, d1 = Math.min(B.b, B.filEau + 0.4);
  const ys = []; for (let d = d0; d <= d1 + 1e-9; d += 0.1) ys.push(sg * d);
  const p = [...ys.map(y => [X(y), G.dessus(y)]), ...ys.slice().reverse().map(y => [X(y), G.dessous(y)])];
  v.poly('COFFRAGE', p, true); v.hachure(p);
  const zt = G.dessus(yg), zb = G.dessous(yg), r = eq.gargD / 2;
  v.poly('EQUIPEMENTS', [[X(yg) - r, zt + eq.etanE], [X(yg) - r, zb - eq.gargDep]]); v.poly('EQUIPEMENTS', [[X(yg) + r, zt + eq.etanE], [X(yg) + r, zb - eq.gargDep]]);
  v.poly('EQUIPEMENTS', [[X(yg) - r - 0.08, zt + eq.etanE], [X(yg) + r + 0.08, zt + eq.etanE]]);
  v.poly('VUES', ys.map(y => [X(y), G.dessus(y) + G.tRev]));
  v.coteV([X(yg) + r, zb], [X(yg) + r, zb - eq.gargDep], X(yg) + r + 0.2, fmtCote(eq.gargDep));
  v.texte('TEXTES', [X(yg) - r - 0.1, zb - eq.gargDep / 2], `tube Ø ${fr(eq.gargD * 1000, 0)} mm`, { h: 2.4, ancre: -sg > 0 ? 'g' : 'd', v: 'm' });
  v.texte('TEXTES', [X(yg), zt + G.tRev + 0.1], 'avaloir, grille, raccord à l\'étanchéité', { h: 2.2, ancre: 'c' });
  return v;
}

function vueAssainissement(G, eq, joints) {
  const v = new Vue('SCHÉMA D\'ÉVACUATION DES EAUX ET JOINTS (vue en plan)'), { b, uA, uB, x0 } = G;
  v.poly('COFFRAGE', [...courbeU(G, b, uA, uB, x0), ...courbeU(G, -b, uA, uB, x0).reverse()], true);
  for (const sg of [1, -1]) { const B = bordGeom(G, eq, sg); v.poly('VUES', courbeU(G, sg * B.filEau, uA, uB, x0)); }
  v.poly('AXES', courbeU(G, 0, uA - 1, uB + 1, x0));
  for (const g of gargouilles(G, eq)) v.cercle('EQUIPEMENTS', G.pt(g.u, g.y), 0.25);
  for (const J of joints) { const u = J.i === 0 ? uA : uB; v.poly('EQUIPEMENTS', [G.pt(u, -b), G.pt(u, b)]); v.texte('TEXTES', G.pt(u + (J.i === 0 ? -0.4 : 0.4), 0), 'JC', { h: 2.5, ancre: 'c', angle: 90, gras: true }); }
  x0.forEach((u, i) => v.texte('TEXTES', G.pt(u, b + 1.0), G.nomLigne(i), { h: 3, ancre: 'c', gras: true }));
  const n = gargouilles(G, eq).length;
  v.texte('TEXTES', G.pt((uA + uB) / 2, -b - 1.6), `${n} gargouilles Ø ${fr(eq.gargD * 1000, 0)} mm au pas de ${fr(eq.gargPas, 0)} m environ, le long du fil d'eau ${cotesBas(G).length === 2 ? 'des deux côtés' : 'du côté bas'} ; JC : joints de chaussée`, { h: 2.4, ancre: 'c' });
  return v;
}

/* ------------------------------------------------------------------------------------- métré et feuille */
export function metreEquipements(st, eq, G = geometrie(st)) {
  const L = G.uB - G.uA, lignes = [];
  const sides = [1, -1].map(sg => bordGeom(G, eq, sg));
  const nb = f => sides.filter(f).length;
  if (nb(B => B.corniche)) lignes.push(['Corniches', 'ml', nb(B => B.corniche) * L]);
  if (nb(B => B.dispositif)) lignes.push([`Dispositif de retenue : ${DR[eq.dr]}`, 'ml', nb(B => B.dispositif) * L]);
  if (nb(B => B.longrine)) lignes.push(['Longrines d\'ancrage (béton)', 'm³', nb(B => B.longrine) * L * eq.lgB * eq.lgH]);
  if (nb(B => B.gardeCorps)) lignes.push(['Garde-corps', 'ml', nb(B => B.gardeCorps) * L]);
  if (nb(B => B.dispositif && B.dispositif.mixte)) lignes.push(['Panneaux grillagés des barrières (fonction garde-corps)', 'ml', nb(B => B.dispositif && B.dispositif.mixte) * L]);
  if (nb(B => B.bordure)) lignes.push(['Bordures de trottoir', 'ml', nb(B => B.bordure) * L]);
  if (eq.canL > 0) lignes.push([`Caniveaux en asphalte coulé (largeur ${fr(eq.canL)} m)`, 'ml', 2 * L]);
  lignes.push([`Étanchéité (${eq.etanType})`, 'm²', 2 * G.b * L]);
  const rd = G.g.roadway || { y1: -G.b, y2: G.b };
  lignes.push(['Couche de roulement', 'm²', (rd.y2 - rd.y1) * L]);
  const s = G.psiL.map(p => Math.sin(p * Math.PI / 200));
  lignes.push(['Joints de chaussée', 'ml', 2 * G.b / s[0] + 2 * G.b / s[s.length - 1]]);
  const ng = gargouilles(G, eq).length; if (ng) lignes.push([`Gargouilles Ø ${fr(eq.gargD * 1000, 0)} mm`, 'u', ng]);
  return lignes;
}

export function planEquipements(st, eq = EQ_DEFAUTS, cartouche = {}) {
  const G = geometrie(st), J = souffleJoints(st, eq);
  const dA = vueDetailBord(G, eq, 1), dB = vueDetailBord(G, eq, -1);
  const dJ = vueDetailJoint(G, st, eq, J[0]), dG = vueDetailGargouille(G, eq), sA = vueAssainissement(G, eq, J);
  const dC = eq.corn === 'prefa' ? vueCorniche(eq) : null;
  // métré et contrôle des charges, au-dessus du cartouche
  const M = metreEquipements(st, eq, G);
  const tM = { titre: 'MÉTRÉ DES ÉQUIPEMENTS', cols: [{ t: 'Désignation', w: 110, a: 'g' }, { t: 'Unité', w: 18, a: 'c' }, { t: 'Quantité', w: 32, a: 'd' }], lignes: M.map(([d, u, q]) => [d, u, u === 'u' ? String(q) : fr(q, 1)]), hl: 5.5 };
  const C = controleCharges(st, eq, G);
  const tC = { titre: 'POIDS DES ÉQUIPEMENTS / CHARGES LINÉAIRES DU CALCUL (kN/m)', cols: [{ t: 'Élément', w: 80, a: 'g' }, { t: 'Côté y > 0', w: 40, a: 'd' }, { t: 'Côté y < 0', w: 40, a: 'd' }], hl: 5.5, lignes: [] };
  const noms = [...new Set(C.flatMap(c => c.P.lignes.map(l => l[0])))];
  for (const n of noms) tC.lignes.push([n, ...C.map(c => { const l = c.P.lignes.find(q => q[0] === n); return l ? fr(l[1], 2) : '—'; })]);
  tC.lignes.push(Object.assign(['Total des équipements', ...C.map(c => fr(c.P.total, 2))], { gras: true }));
  tC.lignes.push(['Charges linéaires saisies', ...C.map(c => fr(c.saisi, 2))]);
  tC.lignes.push(Object.assign(['Écart', ...C.map(c => (c.ecart == null ? '—' : (c.ecart >= 0 ? '+' : '') + fr(c.ecart * 100, 0) + ' %'))], { gras: true }));
  const hM = (tM.lignes.length + 2) * 5.5, hC = (tC.lignes.length + 2) * 5.5;
  const notes = [
    'NOTES',
    '1. Dimensions des équipements : valeurs paramétrées (carte « Plans d\'exécution »),',
    '   formes des dispositifs schématiques : la fiche du modèle retenu fait foi.',
    `2. Joints : souffle W = 2 v_T + v_RF (ELS) ; familles selon le guide Cerema 2016, § 1.3.2.`,
    '   Souffle définitif selon la note Sétra OA n° 36 (température de pose, incertitude S).',
    `3. Gargouilles : retombée ≥ ${fr(eq.gargDep)} m sous l'intrados (fiche MEMOAR X-2) ; pas à justifier`,
    '   par le calcul hydraulique (guide Sétra « Assainissement des ponts-routes », 1989).',
    `4. Garde-corps : ${fr(eq.hGC)} m (XP P98-405 : 1,00 m piétons ; 1,20 m avec cycles, Certu 2008).`,
    '5. Écart poids / charges saisies > 10 % : revoir les charges linéaires du calcul.',
    ...[...new Set([1, -1].flatMap(sg => bordGeom(G, eq, sg).alertes))].flatMap((t, k) => couperNote(`${6 + k}. ATTENTION — ${t}`, 92)),
  ], hn = notes.length * 2.1 * 1.6;
  const Lt = G.uB - G.uA;
  const F = composer({ titre: 'TABLIER — ÉQUIPEMENTS', cartouche,
    rangees: [[dA, dB], [dJ, dG, ...(dC ? [dC] : [])], [sA]],
    groupes: [{ vues: [dA, dB], cible: 25, min: 10 }, { vues: [dJ, dG], cible: 25, min: 20 }, ...(dC ? [{ vues: [dC], cible: 20, min: 10 }] : []), { vues: [sA], cible: Lt <= 60 ? 200 : 500, min: 100 }],
    colonne: { largeur: 182, hauteur: 2 + hC + 5 + hM + 4 + hn + 4 },
    poser: (F, [x, y]) => {
      const xt = F.W - 10 - 162;
      F.tableau(tC, xt, y + 2);
      F.tableau(tM, xt, y + 2 + hC + 5);
      F.note(notes, xt - 4, y + 2 + hC + 5 + hM + 4 + hn - 2.1 * 0.6, 2.1);
      F.notes[F.notes.length - 1].titreGras = true;
    } });
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(p => '1/' + p.vue.echelle))].join(' ; ');
  return F;
}

export { ETAN, DR };
