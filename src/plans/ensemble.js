/**
 * Feuille « Vue en plan – coupe longitudinale » (plan d'ensemble de l'ouvrage), à la manière des dossiers d'ouvrages
 * courants : vue en plan du tablier (lignes d'appui repérées par des bulles, appareils, équipements, semelles en tirets) et
 * coupe longitudinale suivant l'axe avec les appuis complets (fondations et pieux sur toute leur longueur), le terrain
 * naturel, les talus et remblais d'accès, la dalle de transition, les cotes des travées et les niveaux ; tableau des
 * caractéristiques géométriques et encadré NOTA.
 *
 * Coordonnées de la coupe : u le long de l'axe (m, origine de la géométrie du tablier), z (m, mêmes niveaux que les plans
 * des appuis : NGF du nivellement, sinon relatifs au dessus de la dalle à l'axe).
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { geometrie } from './geometrie.js';
import { geometrieAppui, vueCoupe, appuisDisponibles, couperNote } from './appuis.js';
import { vuePlan } from './coffrage.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const PENTE_TALUS = 3 / 2;   // talus d'accès 3/2 (horizontal / vertical), valeur courante des passages supérieurs

/** Entités d'une coupe d'appui reprises dans la coupe longitudinale : béton, appareils, axes des pieux. */
function entitesAppui(A, u0) {
  const v = vueCoupe(A, { longueurPieux: A.Lp <= 8 ? A.Lp : 5 }), out = [];
  for (const e of v.ents) {
    if (!['COFFRAGE', 'HACHURES', 'APPAREILS', 'AXES'].includes(e.calque) && e.t !== 'hachure') continue;
    if (e.t === 'texte' || e.t === 'cote' || e.t === 'coteH' || e.t === 'coteV' || e.t === 'niveau') continue;
    const T = p => [p[0] + u0, p[1]];
    const c = { ...e };
    if (e.a) c.a = T(e.a); if (e.b) c.b = T(e.b); if (e.p) c.p = T(e.p); if (e.c) c.c = T(e.c);
    if (e.pts) c.pts = e.pts.map(T);
    out.push(c);
  }
  return out;
}

/** Coupe longitudinale suivant l'axe. */
export function vueCoupeLongitudinale(st, G = geometrie(st), e = 250) {
  const v = new Vue('COUPE LONGITUDINALE', { echelle: e }), { x0, n, uA, uB, h } = G, k = e / 1000;   // k : m par mm papier
  const As = x0.map((_, i) => geometrieAppui(st, i));
  // tablier : dessus à l'axe interpolé entre les lignes d'appui (dessous = dessus des appareils)
  const zTop = As.map(A => A.zSF + h);
  const zAt = u => {
    if (u <= x0[0]) return zTop[0] + (zTop[1] - zTop[0]) * (u - x0[0]) / (x0[1] - x0[0]);
    for (let i = 0; i + 1 < n; i++) if (u <= x0[i + 1] + 1e-9) return zTop[i] + (zTop[i + 1] - zTop[i]) * (u - x0[i]) / (x0[i + 1] - x0[i]);
    return zTop[n - 1] + (zTop[n - 1] - zTop[n - 2]) * (u - x0[n - 1]) / (x0[n - 1] - x0[n - 2]);
  };
  const us = [uA, ...x0, uB].filter((u, k, a) => k === 0 || u - a[k - 1] > 1e-6);
  const dalle = [...us.map(u => [u, zAt(u)]), ...us.slice().reverse().map(u => [u, zAt(u) - h])];
  v.poly('COFFRAGE', dalle, true); v.hachure(dalle);
  v.poly('VUES', us.map(u => [u, zAt(u) + G.tRev]));
  // appuis complets
  As.forEach((A, i) => { for (const e of entitesAppui(A, x0[i])) v.ents.push(e); });
  // terrain naturel, remblais et talus d'accès, dalles de transition
  const zR = u => zAt(u) + G.tRev;   // niveau de la chaussée
  const Lg = Math.max(6, 0.12 * (uB - uA), 42 * k);   // longueur du remblai d'accès dessiné (place des libellés)
  const tn = [];
  As.forEach((A, i) => {
    const u = x0[i];
    if (!A.end) { tn.push([u - A.B / 2 - 1, A.zTN], [u + A.B / 2 + 1, A.zTN]); return; }
    const s = A.sgn;   // +1 : C0 (travée à droite), −1 : dernière culée (travée à gauche)
    const xAr = u + s * A.xGGar, uLoin = xAr - s * Lg, zc = zR(s > 0 ? uA : uB);
    // remblai d'accès derrière la culée, au niveau de la chaussée
    v.poly('VUES', [[uLoin, zc], [xAr, zc]]);
    if (A.dalle) {
      const zt = zc - 0.6, p = [[xAr, zt], [xAr - s * A.dalle.L, zt], [xAr - s * A.dalle.L, zt - A.dalle.e], [xAr, zt - A.dalle.e]];
      v.poly('COFFRAGE', p, true);
      v.texte('TEXTES', [uLoin, zt - A.dalle.e - 3.5 * k], `dalle de transition ${fr(A.dalle.L)} × ${fr(A.dalle.e)}`, { h: 2.2, ancre: s > 0 ? 'g' : 'd' });
    }
    if (A.type === 'remblayee') {
      // le mur de front retient le remblai : terrain naturel devant le mur
      tn.push([uLoin, Math.min(A.zTN, zc - 1)], [u + s * (A.xFut + A.B / 2 + 1), A.zTN]);
    } else {
      // pile-culée : talus 3/2 du bord avant du chevêtre (ou du pied du voile frontal) jusqu'au terrain naturel
      const zDepart = A.type === 'apparente' && A.C.hv > 0 ? A.zT - A.hc - A.C.hv : A.zT - A.hc;
      const xAv = u + s * (A.xChev ? A.xChev[1] : 0.5), xPied = xAv + s * PENTE_TALUS * Math.max(0, zDepart - A.zTN);
      v.poly('VUES', [[xAv, zDepart], [xPied, A.zTN]]);
      v.texte('TEXTES', [(xAv + xPied) / 2 + s * 0.4, (zDepart + A.zTN) / 2 + 0.25], '3/2', { h: 2.2, ancre: 'c' });
      tn.push([uLoin, A.zTN], [xPied, A.zTN]);
    }
    v.texte('TEXTES', [uLoin, zc + 1.5 * k], 'remblai d\'accès', { h: 2.2, ancre: s > 0 ? 'g' : 'd' });
  });
  tn.sort((p, q) => p[0] - q[0]);
  v.poly('VUES', tn);
  v.texte('TEXTES', [tn[0][0], tn[0][1] - 1.2 * k], 'TN', { h: 2.6, ancre: 'g', v: 'h', gras: true });
  // annotations des fondations
  As.forEach((A, i) => {
    const u = x0[i], zb = A.pieux ? A.zSS - (A.Lp <= 8 ? A.Lp : 5) - 0.7 : A.zSS - 0.6;
    const t = A.pieux ? `${A.nF * A.nP} pieux Ø ${fr(A.Dp)}, L = ${fr(A.Lp)}` : `semelle ${fr(A.B)} × ${fr(A.Lf)} × ${fr(A.hs)}`;
    v.texte('TEXTES', [u, zb], t, { h: 2.2, ancre: 'c' });
  });
  // cotes (abouts et travées, longueur totale) puis bulles des appuis, espacées en mm papier
  const zc1 = Math.max(...zTop) + G.tRev + 7 * k, zc2 = zc1 + 7 * k, zMax = zc2 + 9 * k;
  for (let q = 0; q + 1 < us.length; q++) v.coteH([us[q], zAt(us[q])], [us[q + 1], zAt(us[q + 1])], zc1);
  v.coteH([uA, zAt(uA)], [uB, zAt(uB)], zc2);
  const zMin = Math.min(...As.map(A => (A.pieux ? A.zSS - (A.Lp <= 8 ? A.Lp : 5) : A.zSS))) - 1.2;
  As.forEach((A, i) => {
    v.ligne('AXES', [x0[i], zMin + 0.4], [x0[i], zMax - 3.5 * k]);
    v.repere([x0[i], zMax], G.nomLigne(i));
    v.niveau([x0[i] + A.B / 2 + 0.3, A.zDS], A.zDS);
  });
  return v;
}

/** Vue en plan d'ensemble : vue en plan du tablier, bulles des lignes d'appui, semelles en tirets. */
export function vuePlanEnsemble(st, G, eq) {
  const v = vuePlan(G, eq);
  v.titre = 'VUE EN PLAN';
  G.x0.forEach((u, i) => {
    let A = null; try { A = geometrieAppui(st, i); } catch { return; }
    const s = A.sgn, xa = A.xFut - A.B / 2, xb = A.xFut + A.B / 2, Lf = A.Lf;
    const P = (dx, y) => { const p = G.pt(u + (A.end ? s : 1) * dx, y); return p; };
    v.poly('VUES', [P(xa, -Lf / 2), P(xb, -Lf / 2), P(xb, Lf / 2), P(xa, Lf / 2)], true);
  });
  // noms des lignes d'appui dans des bulles
  const noms = new Set(G.x0.map((_, i) => G.nomLigne(i)));
  v.ents = v.ents.filter(e => !(e.t === 'texte' && noms.has(e.s)));
  G.x0.forEach((u, i) => v.repere(G.pt(u, G.b + 2.0), G.nomLigne(i)));
  return v;
}

function tableauCaracteristiques(st, G) {
  const spans = G.x0.slice(1).map((u, j) => u - G.x0[j]);
  const ap = G.appareils, nb = ap[0] ? ap[0].yb.length : 0;
  const lignes = [
    ['Travure', `${spans.length} travée${spans.length > 1 ? 's' : ''} : ${spans.map(x => fr(x)).join(' + ')} m`],
    ['Longueur (abouts compris)', `${fr(G.uB - G.uA)} m`],
    ['Largeur du tablier', `${fr(2 * G.b)} m`],
    ['Épaisseur à l\'axe', `${fr(G.h)} m`],
    ['Biais', `${fr(G.psiL[0])} gr`],
    ['Appareils culées', `${ap[0] ? ap[0].label : ''} — ${nb} par ligne`], ...(ap.length > 2 ? [['Appareils piles', `${ap[1].label} — ${nb} par ligne`]] : []),
  ];
  return { titre: 'CARACTÉRISTIQUES GÉOMÉTRIQUES', cols: [{ t: 'Désignation', w: 52, a: 'g' }, { t: 'Valeur', w: 76, a: 'g' }], lignes, hl: 5.5, h: 2.1 };
}

function notesEnsemble(st, G) {
  const m = st.p.mat, ms = (st.p.supports && st.p.supports.mat) || {};
  const niv = st.supports && st.supports.niv && st.supports.niv.actif;
  return ['NOTES', ...[
    `1. Béton du tablier C${m.fck}/${Math.round(m.fck * 1.22 + 0.5)} ; béton des appuis C${ms.fck || 25} ; béton de propreté sous les semelles, 10 cm.`,
    '2. Cotes en mètres. ' + (niv ? 'Niveaux NGF, rattachés au plan de nivellement.' : 'Niveaux relatifs (m) : ±0,00 = dessus de la dalle à l\'axe.'),
    '3. Terrain naturel, talus et remblais d\'accès : schématiques, à caler sur les profils en long et en travers du projet routier.',
    '4. Coffrage des appuis et du tablier, ferraillage, équipements : plans spécifiques.',
  ].flatMap(t => couperNote(t, 84))];
}

/** Feuille « Vue en plan – coupe longitudinale ». */
export function planEnsemble(st, cartouche = {}, eq = null) {
  if (!appuisDisponibles(st).length) throw new Error('plan d\'ensemble : lancer le calcul des appuis (onglet Appuis et fondations)');
  const G = geometrie(st), L = G.uB - G.uA;
  const pl = vuePlanEnsemble(st, G, eq);
  const cl = vueCoupeLongitudinale(st, G);
  const tq = tableauCaracteristiques(st, G), hq = (tq.lignes.length + 2) * tq.hl;
  const N = notesEnsemble(st, G), hn = N.length * 2.1 * 1.6;
  const F = composer({ titre: 'VUE EN PLAN — COUPE LONGITUDINALE', cartouche,
    rangees: [[pl], [cl]],
    groupes: [{ vues: [pl, cl], cible: L <= 50 ? 250 : L <= 100 ? 500 : 1000, min: 50, refaire: e => { pl.echelle = e; return [pl, vueCoupeLongitudinale(st, G, e)]; } }],
    aligner: [{ ref: cl, vue: pl }],
    colonne: { largeur: 132, hauteur: 2 + hq + 5 + hn + 4 },
    poser: (F, [x, y]) => {
      F.tableau(tq, F.W - 10 - 130, y + 2);
      F.note(N, F.W - 10 - 128, y + 2 + hq + 5 + hn - 2.1 * 0.6, 2.1);
      F.notes[F.notes.length - 1].titreGras = true;
    } });
  F.cartouche.echelles = F.cartouche.echelles || `1/${pl.echelle}`;
  return F;
}
