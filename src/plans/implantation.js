/**
 * Feuille « Implantation des fondations et nivellement du tablier » (OA-IMP-01), sur le modèle des dossiers d'entreprise
 * relus (autoroute A640 : COF-3500 « plan d'ensemble & implantation », COF-22 « coffrage et nivellement ») :
 *   - vue en plan des fondations : contour du tablier, lignes d'appui, semelles (axe de semelle et axe d'appui), pieux ;
 *   - tableau des coordonnées : coins et centre de chaque semelle, centre de chaque pieu, dans le repère de l'ouvrage
 *     (origine : axe de C0 sur l'axe de l'ouvrage, x le long de l'axe vers la dernière culée, y à gauche) et, quand le
 *     point d'origine et le gisement de l'axe sont saisis, en coordonnées du projet (E, N) ;
 *   - tableau de nivellement du tablier aux appuis et aux quarts de portée : extrados à l'axe et aux bords
 *     (hors contre-flèche), contre-flèche de réglage du coffrage d'une dalle précontrainte (−w en service à long terme,
 *     src/psidp flèches NP 58) ;
 *   - cotes biaises : longueurs droites × K, K = 1/sin ψ.
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { geometrie } from './geometrie.js';
import { geometrieAppui, appuisDisponibles } from './appuis.js';
import { couperLigne } from './notes_durabilite.js';

const fr = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');

/** Points d'implantation : [{ appui, nom, point, x, y }] dans le repère de l'ouvrage. */
export function pointsImplantation(st) {
  const G = geometrie(st), out = [];
  for (const i of appuisDisponibles(st)) {
    let A; try { A = geometrieAppui(st, i); } catch (e) { continue; }
    const u = G.x0[i], P0 = G.pt(u, 0), P1 = G.pt(u, 1), t = [P1[0] - P0[0], P1[1] - P0[1]], lt = Math.hypot(...t), T = [t[0] / lt, t[1] / lt];
    // normale à la ligne d'appui, orientée vers les x croissants
    let N = [T[1], -T[0]]; if (N[0] < 0) N = [-N[0], -N[1]];
    const xc = A.sgn * (A.xFut || 0), C = [P0[0] + xc * N[0], P0[1] + xc * N[1]], B = A.B, Lf = A.Lf, nom = A.nom;
    const pt = (a, b) => [C[0] + a * N[0] + b * T[0], C[1] + a * N[1] + b * T[1]];
    out.push({ appui: i, nom, point: 'axe d\'appui', x: P0[0], y: P0[1], role: 'axe' });
    out.push({ appui: i, nom, point: 'centre semelle', x: C[0], y: C[1], role: 'centre' });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], k) => { const [x, y] = pt(a * B / 2, b * Lf / 2); out.push({ appui: i, nom, point: `coin ${k + 1}`, x, y, role: 'coin' }); });
    if (A.pieux) for (let f = 0; f < A.nF; f++) for (let k = 0; k < A.nP; k++) { const [x, y] = pt(A.fileX(f), A.pieuY(k)); out.push({ appui: i, nom, point: `pieu ${f * A.nP + k + 1}`, x, y, role: 'pieu', D: A.Dp }); }
  }
  return { G, points: out };
}

/** Coordonnées du projet : E = E0 + x sin g − y cos g, N = N0 + x cos g + y sin g (gisement g de l'axe, grades). */
export function versProjet({ x, y }, { E0, N0, gis }) {
  const g = gis * Math.PI / 200;
  return { E: E0 + x * Math.sin(g) - y * Math.cos(g), N: N0 + x * Math.cos(g) + y * Math.sin(g) };
}

/** Nivellement du tablier : stations aux appuis et aux quarts de portée. */
export function nivellementTablier(st) {
  const G = geometrie(st), x0 = G.x0, b = G.b, NV = G.niv && G.niv.lignes ? G.niv.lignes : null;
  const zAxe = u => {   // extrados à l'axe : chaussée − revêtement interpolée entre appuis, sinon relatif
    if (!NV) return 0;
    const zs = NV.map(q => q.zCh - G.tRev);
    let j = 0; while (j < x0.length - 2 && u > x0[j + 1]) j++;
    return zs[j] + (zs[j + 1] - zs[j]) * (u - x0[j]) / (x0[j + 1] - x0[j]);
  };
  const dp = st.psidp, w = dp && dp.defl && dp.defl.w && dp.defl.w.service, xs = dp && dp.defl ? dp.defl.xs : null;
  const wAt = u => { if (!w) return null; let i = 0; while (i < xs.length - 1 && xs[i + 1] < u) i++; const t = Math.min(1, Math.max(0, (u - xs[i]) / ((xs[i + 1] - xs[i]) || 1))); return w[i] + (w[Math.min(i + 1, xs.length - 1)] - w[i]) * t; };
  const st_ = [];
  for (let j = 0; j + 1 < x0.length; j++) for (let k = 0; k <= 4; k++) {
    if (j > 0 && k === 0) continue;
    const u = x0[j] + (x0[j + 1] - x0[j]) * k / 4, z = zAxe(u);
    st_.push({ nom: k === 0 ? G.nomLigne(j) : k === 4 ? G.nomLigne(j + 1) : `T${j + 1} — ${k}/4`, u, z, zG: z + G.dessus(b), zD: z + G.dessus(-b), cf: w ? -wAt(u) : null });
  }
  return { stations: st_, relatif: !NV, contreFleche: !!w };
}

function vuePlanFondations(G, pts) {
  const V = new Vue('VUE EN PLAN — IMPLANTATION DES FONDATIONS', { echelle: 200 }), b = G.b;
  const bord = s => { const P = []; for (let k = 0; k <= 40; k++) { const u = G.uA + (G.uB - G.uA) * k / 40; P.push(G.pt(u, s * b)); } return P; };
  V.poly('VUES', [...bord(-1), ...bord(1).reverse()], true);
  G.x0.forEach((u, i) => { V.ligne('AXES', G.pt(u, -b - 2), G.pt(u, b + 2)); V.texte('TEXTES', G.pt(u, b + 2.6), G.nomLigne(i), { h: 3, ancre: 'c', gras: true }); });
  V.ligne('AXES', G.pt(G.uA - 3, 0), G.pt(G.uB + 3, 0));
  const parAppui = new Map(); for (const q of pts) { if (!parAppui.has(q.appui)) parAppui.set(q.appui, []); parAppui.get(q.appui).push(q); }
  for (const [, L] of parAppui) {
    const coins = L.filter(q => q.role === 'coin').map(q => [q.x, q.y]); if (coins.length === 4) V.poly('COFFRAGE', coins, true);
    L.filter(q => q.role === 'coin').forEach(q => V.texte('TEXTES', [q.x, q.y], q.point.replace('coin ', ''), { h: 1.8, ancre: 'c', v: 'b' }));
    for (const q of L.filter(q => q.role === 'pieu')) V.cercle('COFFRAGE', [q.x, q.y], q.D / 2);
    const c = L.find(q => q.role === 'centre'); if (c) V.cercle('AXES', [c.x, c.y], 0.15);
  }
  // repère de l'ouvrage
  const o = G.pt(G.x0[0], 0);
  V.ligne('COTES', o, [o[0] + 3, o[1]]); V.ligne('COTES', o, [o[0], o[1] + 3]);
  V.texte('TEXTES', [o[0] + 3.2, o[1]], 'x', { h: 2.2, v: 'm' }); V.texte('TEXTES', [o[0], o[1] + 3.3], 'y', { h: 2.2, ancre: 'c' });
  return V;
}

export function planImplantation(st, cartouche = {}, proj = null) {
  const { G, points } = pointsImplantation(st), N = nivellementTablier(st), vp = vuePlanFondations(G, points);
  const glob = proj && [proj.E0, proj.N0, proj.gis].every(Number.isFinite);
  const pts = points;
  const tI = { titre: `COORDONNÉES D'IMPLANTATION (m)${glob ? ' — repère de l\'ouvrage et coordonnées du projet' : ' — repère de l\'ouvrage'}`, hl: 4.2, h: 1.7,
    cols: [{ t: 'Appui', w: 12, a: 'c' }, { t: 'Point', w: 26, a: 'g' }, { t: 'x', w: 20, a: 'd' }, { t: 'y', w: 18, a: 'd' }, ...(glob ? [{ t: 'E', w: 26, a: 'd' }, { t: 'N', w: 26, a: 'd' }] : [])],
    lignes: pts.map(q => { const P = glob ? versProjet(q, proj) : null; return [q.nom, q.point, fr(q.x), fr(q.y), ...(P ? [fr(P.E), fr(P.N)] : [])]; }) };
  const tN = { titre: `NIVELLEMENT DU TABLIER — EXTRADOS (m)${N.relatif ? ', relatif au dessus de la dalle à l\'axe sur C0' : ''}, hors contre-flèche`, hl: 4.2, h: 1.7,
    cols: [{ t: 'Section', w: 26, a: 'g' }, { t: 'x', w: 18, a: 'd' }, { t: 'Axe', w: 20, a: 'd' }, { t: 'Bord gauche', w: 20, a: 'd' }, { t: 'Bord droit', w: 20, a: 'd' }, ...(N.contreFleche ? [{ t: 'Contre-flèche', w: 22, a: 'd' }] : [])],
    lignes: N.stations.map(s => [s.nom, fr(s.u, 2), fr(s.z), fr(s.zG), fr(s.zD), ...(N.contreFleche ? [`${s.cf >= 0 ? '+' : '−'}${fr(Math.abs(s.cf) * 1000, 0)} mm`] : [])]) };
  const psi = G.psiL[0], sinP = Math.sin(psi * Math.PI / 200);
  const notes = ['NOTES', ...[
    `1. Repère de l'ouvrage : origine à l'intersection de l'axe de C0 et de l'axe de l'ouvrage, x le long de l'axe vers ${G.nomLigne(G.n - 1)}, y à gauche${glob ? ` ; coordonnées du projet : origine E = ${fr(proj.E0)}, N = ${fr(proj.N0)}, gisement de l'axe ${fr(proj.gis, 4)} gr` : ' ; saisir l\'origine et le gisement de l\'axe (carte des plans) pour les coordonnées du projet'}.`,
    `2. Coins des semelles numérotés dans le sens trigonométrique depuis l'angle aval gauche ; « centre semelle » : intersection de l'axe de semelle et de l'axe de l'ouvrage (axe d'appui décalé de l'about pour les culées).`,
    ...(Math.abs(psi - 100) > 1e-6 && !G.courbe ? [`3. Ouvrage biais ψ = ${fr(psi, 2)} gr : K = 1/sin ψ = ${(1 / sinP).toFixed(5).replace('.', ',')} ; longueurs droites × K = longueurs biaises le long de l'axe.`] : []),
    `${Math.abs(psi - 100) > 1e-6 && !G.courbe ? 4 : 3}. Nivellement : extrados ${N.relatif ? 'relatif' : 'déduit des cotes de chaussée des appuis (revêtement retranché), interpolé linéairement entre appuis — à reprendre sur le profil en long du projet'} ; dévers et bombement du profil en travers saisi.`,
    N.contreFleche ? `${Math.abs(psi - 100) > 1e-6 && !G.courbe ? 5 : 4}. Contre-flèche de réglage du coffrage (positive vers le haut) = − flèche en service à long terme (poids propre, superstructures, précontrainte et fluage, note PSIDP-EL NP 58) ; à ajouter aux cotes de nivellement.` : `${Math.abs(psi - 100) > 1e-6 && !G.courbe ? 5 : 4}. Dalle armée : contre-flèche selon la note de calcul (flèche à long terme en section fissurée).`,
  ].flatMap(t => couperLigne(t, 90))];
  const hI = (tI.lignes.length + 2) * tI.hl, hN = (tN.lignes.length + 2) * tN.hl, hn = notes.length * 2.1 * 1.6;
  const wI = tI.cols.reduce((s, c) => s + c.w, 0), wN = tN.cols.reduce((s, c) => s + c.w, 0), wc = Math.max(wI, wN, 150);
  // hauteur utile des formats (cadre et cartouche déduits) : le premier qui contient la colonne des tableaux
  const hCol = hI + 6 + hN + 6 + hn + 6, utile = { A3: 297 - 60, A2: 420 - 60, A1: 594 - 60, A0: 841 - 60 };
  const formats = ['A3', 'A2', 'A1', 'A0'].filter(f => utile[f] >= hCol + 10);
  const F = composer({ titre: 'OUVRAGE — IMPLANTATION DES FONDATIONS ET NIVELLEMENT DU TABLIER', cartouche, rangees: [[vp]],
    groupes: [{ vues: [vp], cible: 200, min: 50 }], colonne: { largeur: wc + 6, hauteur: hI + 6 + hN + 6 + hn + 6 },
    poser: (F, [x, y]) => { const xc = F.W - 10 - wc - 3; F.tableau(tI, xc, y + 2); F.tableau(tN, xc, y + 2 + hI + 6); F.note(notes, xc, y + 2 + hI + 6 + hN + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, formats.length ? formats : ['A0']);
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(q => '1/' + q.vue.echelle))].join(' ; ');
  F.implantation = { points, nivellement: N };
  return F;
}
