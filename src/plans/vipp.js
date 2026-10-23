/**
 * Plans d'une poutre VIPP (onglet « Tablier à poutres ») : coffrage, câblage et ferraillage de principe, sur le modèle des
 * feuilles du tablier, des appuis et des cadres (cartouche, vues cotées, tableaux, notes ; export SVG, DXF et PDF).
 *
 *  - coffrage : élévation de la poutre (échelle verticale dilatée), coupes à mi-travée et sur appui (blochet), quantités ;
 *  - câblage : élévation des câbles, tableau des ordonnées des gaines (depuis la sous-face) aux stations, tableau des câbles
 *    (unité, famille, force au vérin, allongement théorique, ordre et âge de mise en tension), coupes avec les gaines ;
 *  - ferraillage de principe : coupe courante avec étriers, armatures du talon et de peau, zones d'étriers le long de la
 *    poutre d'après l'effort tranchant ; le façonnage est donné par la nomenclature (nomenclature_vipp.js).
 * Les cotes sont en mètres ; l'about (distance de l'extrémité de la poutre à l'axe d'appui) vaut 0,50 m par défaut
 * (guide Sétra VIPP, § 3.2.5).
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { couperNote } from './appuis.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const numeroter = (L, n = 70) => { let k = 0; return L.flatMap((l, i) => (i === 0 ? [l] : couperNote(l.replace(/^\d+\. /, () => `${++k}. `), n))); };

/** Contour (m) d'une poutre avec une âme d'épaisseur b0 donnée (coupe courante ou blochet). */
function contour(S, b0) {
  const f = { ...S.forme, b0 }, C = S.poutre.contour;
  if (b0 === S.forme.b0) return C.pts;
  // blochet : âme épaissie jusqu'au talon et à la table (pan et goussets conservés si possible)
  const bta = Math.max(f.bta, b0), gt = Math.max(0, Math.min(f.gt, (f.bt - b0) / 2)), yPan = f.hpi + f.tpan * Math.max(bta - b0, 0) / 2;
  const yTab = f.hp - f.hte - f.pt * Math.max(f.bt / 2 - b0 / 2 - gt, 0), yGou = yTab - gt;
  const d = [[0, 0], [bta / 2, 0], [bta / 2, f.hpi], [b0 / 2, Math.max(yPan, f.hpi)], [b0 / 2, yGou], [b0 / 2 + gt, yTab], [f.bt / 2, f.hp - f.hte], [f.bt / 2, f.hp], [0, f.hp]];
  const g = d.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  return [...d.slice(0, -1), [0, f.hp], ...g].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
}

/** Coupe transversale de la poutre : contour, hachures, hourdis tireté, gaines, cotes. */
export function vueCoupe(v, S, tr, { titre, x = null, b0 = S.forme.b0, armatures = null }) {
  const V = new Vue(titre, { echelle: 20 }), f = S.forme, pts = contour(S, b0);
  V.poly('COFFRAGE', pts, true); V.hachure(pts);
  V.poly('VUES', [[-S.b1 / 2, f.hp], [S.b1 / 2, f.hp], [S.b1 / 2, f.hp + S.hd], [-S.b1 / 2, f.hp + S.hd]], true);
  V.texte('TEXTES', [S.b1 / 2 - 0.05, f.hp + S.hd + 0.04], `hourdis coulé en place (${fr(S.hd)} m)`, { h: 2.0, ancre: 'd' });
  V.ligne('AXES', [0, -0.15], [0, f.hp + S.hd + 0.15]);
  if (tr && x !== null) {
    const r = tr.u.phi / 2;
    tr.cab.forEach(cb => { const y = tr.y(cb, x), z = x === 0 ? 0 : cb.zm; V.cercle('ACIERS_COUPES', [z, y], r); V.texte('TEXTES', [z + r + 0.01, y], String(cb.i + 1), { h: 1.8, v: 'm' }); });
  }
  if (armatures) armatures(V);
  V.coteH([-f.bt / 2, f.hp], [f.bt / 2, f.hp], f.hp + S.hd + 0.12);
  V.coteH([-Math.max(f.bta, b0) / 2, 0], [Math.max(f.bta, b0) / 2, 0], -0.12);
  V.coteV([-f.bt / 2, 0], [-f.bt / 2, f.hp], -f.bt / 2 - 0.12);
  V.coteV([f.bt / 2, f.hp - f.hte], [f.bt / 2, f.hp], f.bt / 2 + 0.08);
  V.coteV([Math.max(f.bta, b0) / 2, 0], [Math.max(f.bta, b0) / 2, f.hpi], Math.max(f.bta, b0) / 2 + 0.08);
  V.texte('TEXTES', [b0 / 2 + 0.02, f.hp * 0.55], `âme ${fr(b0 * 100, 0)} cm`, { h: 2.0, v: 'm' });
  return V;
}

/** Élévation de la poutre (échelle verticale dilatée), câbles éventuels. */
function vueElevation(v, { cables = false, a = 0.5 } = {}) {
  const S = v.S, f = S.forme, L = v.L, Lp = L + 2 * a, tr = v.trace;
  const V = new Vue(cables ? 'ÉLÉVATION — CÂBLAGE' : 'ÉLÉVATION DE LA POUTRE', { echelle: 100, echelleV: 25 });
  V.poly('COFFRAGE', [[0, 0], [Lp, 0], [Lp, f.hp], [0, f.hp]], true);
  V.ligne('VUES', [0, f.hp - f.hte], [Lp, f.hp - f.hte]);
  V.ligne('VUES', [0, S.poutre.contour.yPan], [Lp, S.poutre.contour.yPan]);
  if (f.Lb > 0) for (const xb of [a + f.Lb, Lp - a - f.Lb]) V.ligne('VUES', [xb, f.hpi], [xb, f.hp - f.hte]);
  for (const xa of [a, Lp - a]) { V.ligne('AXES', [xa, -0.35], [xa, f.hp + 0.25]); V.poly('APPAREILS', [[xa - 0.2, -0.06], [xa + 0.2, -0.06], [xa + 0.2, 0], [xa - 0.2, 0]], true); }
  V.ligne('AXES', [Lp / 2, -0.25], [Lp / 2, f.hp + 0.25]);
  V.texte('TEXTES', [Lp / 2, f.hp + 0.3], 'mi-travée', { h: 2.2, ancre: 'c' });
  if (cables && tr) {
    tr.cab.forEach((cb, i) => {
      const pts = []; for (let q = 0; q <= 40; q++) { const x = L * q / 40; pts.push([a + x, tr.y(cb, x)]); }
      pts.unshift([0, tr.y(cb, 0) + (tr.pente(cb, 0)) * (-a)]); pts.push([Lp, pts[0][1]]);
      V.poly('ACIERS', pts);
      for (const xe of [0, Lp]) V.poly('APPAREILS', [[xe - 0.0, pts[0][1] - 0.09], [xe + (xe ? -0.03 : 0.03), pts[0][1] - 0.09], [xe + (xe ? -0.03 : 0.03), pts[0][1] + 0.09], [xe, pts[0][1] + 0.09]], true);
      V.texte('TEXTES', [-0.08, pts[0][1]], `${i + 1}`, { h: 2.0, ancre: 'd', v: 'm' });
    });
  }
  V.coteH([a, 0], [Lp - a, 0], -0.55, `L = ${fr(L)}`);
  V.coteH([0, 0], [a, 0], -0.55); V.coteH([Lp - a, 0], [Lp, 0], -0.55);
  V.coteH([0, 0], [Lp, 0], -0.85, `${fr(Lp)}`);
  V.coteV([0, 0], [0, f.hp], -0.6);
  if (f.Lb > 0) V.coteH([a, f.hp], [a + f.Lb, f.hp], f.hp + 0.55, `blochet ${fr(f.Lb)}`);
  return V;
}

/** Cartouche et échelles. */
function finir(F) { F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(p => '1/' + p.vue.echelle + (p.vue.echelleV ? ` (V 1/${p.vue.echelleV})` : '')))].join(' ; '); return F; }

export function planCoffrageVIPP(v, cartouche = {}, { nom = 'POUTRE VIPP', a = 0.5 } = {}) {
  const S = v.S, f = S.forme, el = vueElevation(v, { a });
  const cA = vueCoupe(v, S, null, { titre: 'COUPE A-A (COURANTE)' }), cB = vueCoupe(v, S, null, { titre: 'COUPE B-B (SUR APPUI, BLOCHET)', b0: f.b0a ?? f.b0 });
  const Lp = v.L + 2 * a, Ab = contour(S, f.b0a ?? f.b0).reduce((s, p, i, A) => { const q = A[(i + 1) % A.length]; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
  const vol = S.poutre.A * (Lp - 2 * (a + (f.Lb || 0))) + Math.abs(Ab) * 2 * (a + (f.Lb || 0));
  const tq = { titre: 'QUANTITÉS (UNE POUTRE)', cols: [{ t: 'Désignation', w: 100, a: 'g' }, { t: 'Unité', w: 20, a: 'c' }, { t: 'Quantité', w: 32, a: 'd' }],
    lignes: [['Béton de la poutre (C' + v.betons.P.fck + ')', 'm³', fr(vol, 2)], ['Longueur hors tout', 'm', fr(Lp, 2)], ['Masse de la poutre (25 kN/m³)', 't', fr(vol * 2.5, 1)], ['Section courante', 'm²', fr(S.poutre.A, 3)], ['Section sur appui (blochet)', 'm²', fr(Math.abs(Ab), 3)]] };
  const N = numeroter(['NOTES', `1. Cotes en mètres. Béton C${v.betons.P.fck} (ciment de prise rapide), poutre préfabriquée ; hourdis C${v.betons.H.fck} coulé en place (tireté).`,
    `2. Abouts de ${fr(a)} m depuis l'axe des appareils d'appui (guide Sétra VIPP § 3.2.5) ; blochets de ${fr(f.Lb)} m (âme ${fr((f.b0a ?? f.b0) * 100, 0)} cm).`,
    `3. Table, goussets et talon : dimensions du calcul (onglet Tablier à poutres) ; pan incliné du talon de tangente ${fr(f.tpan)}.`,
    '4. Réservations des gaines et des plaques d\'ancrage : plan de câblage.', '5. Contre-flèche de fabrication : voir la note de calcul (flèches à t∞).']);
  const hq = (tq.lignes.length + 2) * 6, hn = N.length * 2.1 * 1.6;
  const F = composer({ titre: `${nom} — COFFRAGE`, cartouche, rangees: [[el], [cA, cB]],
    groupes: [{ vues: [el], cible: 100, min: 50 }, { vues: [cA, cB], cible: 25, min: 10 }],
    colonne: { largeur: 170, hauteur: 2 + hq + 6 + hn + 4 },
    poser: (F, [x, y]) => { F.tableau(tq, F.W - 10 - 154, y + 2); F.note(N, F.W - 10 - 170 + 2, y + 2 + hq + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A3', 'A2', 'A1']);
  return finir(F);
}

/** Allongement théorique d'un câble : ∫ P(x) dx / (E_p A_p) avant recul d'ancrage (diagramme de frottement). */
function allongement(pi, Ap, Ep = 195000) {
  if (!pi) return null;
  let s = 0; for (let i = 1; i < pi.x.length; i++) s += (pi.avant[i] + pi.avant[i - 1]) / 2 * (pi.x[i] - pi.x[i - 1]);
  return s / (Ep * 1000 * Ap);
}

export function planCablageVIPP(v, cartouche = {}, { nom = 'POUTRE VIPP', a = 0.5 } = {}) {
  const S = v.S, tr = v.trace, L = v.L, el = vueElevation(v, { cables: true, a });
  const cA = vueCoupe(v, S, tr, { titre: 'COUPE A-A : GAINES À MI-TRAVÉE', x: L / 2 }), cB = vueCoupe(v, S, tr, { titre: 'COUPE B-B : ANCRAGES (ABOUT)', x: 0, b0: S.forme.b0a ?? S.forme.b0 });
  const st = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(k => k * L);
  const to = { titre: 'ORDONNÉES DES AXES DES GAINES DEPUIS LA SOUS-FACE [m]', cols: [{ t: 'Câble', w: 16, a: 'c' }, ...st.map(x => ({ t: x === 0 ? 'appui' : `x = ${fr(x, 2)}`, w: 21, a: 'd' }))],
    lignes: tr.cab.map(cb => [String(cb.i + 1), ...st.map(x => fr(tr.y(cb, x), 3))]) };
  const tc = { titre: 'CÂBLES (UNE POUTRE)', cols: [{ t: 'Câble', w: 14, a: 'c' }, { t: 'Unité', w: 20, a: 'c' }, { t: 'Famille', w: 16, a: 'c' }, { t: 'Âge [j]', w: 16, a: 'c' }, { t: 'P₀ vérin [kN]', w: 24, a: 'd' }, { t: 'Allong. [mm]', w: 22, a: 'd' }, { t: 'P∞ [kN]', w: 20, a: 'd' }],
    lignes: v.pertes.map(q => { const al = allongement(v.out.pertesInstantanees[q.ic], tr.u.Ap); return [String(q.ic + 1), v.modele.cables[q.ic] ? (Object.entries({ '7T15S': 7, '9T15S': 9, '12T15S': 12, '13T15S': 13, '19T15S': 19, '12T13S': 12 }).find(([k]) => Math.abs((k.endsWith('T13S') ? 100e-6 : 150e-6) * parseInt(k) - tr.u.Ap) < 1e-9) || ['—'])[0] : '—', String(q.famille), fr(q.famille === 1 ? v.dates.t1 : v.dates.t2b, 0), milliers(q.P0), al ? fr(al * 1000, 0) : '—', milliers(q.Pinf)]; }) };
  const N = numeroter(['NOTES', `1. Torons T15 super (A = 150 mm², f_pk = 1 860 MPa, classe 2) ; σ_p0 = ${fr(v.sigP0, 0)} MPa au vérin ; mise en tension ${v.modele.cables[0]?.tension === 'deux' ? 'par les deux extrémités' : 'par une extrémité'}.`,
    `2. Frottement μ = ${fr(v.modele.cables[0]?.mu ?? 0.19)}, k = ${fr(v.modele.cables[0]?.k ?? 0.007, 3)} rad/m, recul d'ancrage ${fr((v.modele.cables[0]?.g ?? 0.006) * 1000, 0)} mm (EN 1992-1-1 § 5.10.5) ; allongement théorique total avant blocage, à répartir entre les vérins.`,
    `3. 1re famille tendue sur la poutre seule (âge ${fr(v.dates.t1, 0)} j, f_cm(t) suffisant : voir la note) ; 2e famille après durcissement du hourdis (${fr(v.dates.t2b, 0)} j).`,
    '4. Gaines métalliques injectées au coulis de ciment ; tracé parabolique entre ancrages, sommet à mi-travée.',
    '5. Tolérance de position des gaines : ± 1 cm ; supports de gaines tous les 1,00 m au plus.']);
  const ho = (to.lignes.length + 2) * 6, hc = (tc.lignes.length + 2) * 6, hn = N.length * 2.1 * 1.6, wcol = Math.max(to.cols.reduce((s, c) => s + c.w, 0), tc.cols.reduce((s, c) => s + c.w, 0)) + 10;
  const F = composer({ titre: `${nom} — CÂBLAGE`, cartouche, rangees: [[el], [cA, cB]],
    groupes: [{ vues: [el], cible: 100, min: 50 }, { vues: [cA, cB], cible: 25, min: 10 }],
    colonne: { largeur: wcol + 6, hauteur: 2 + ho + 6 + hc + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      const x0 = F.W - 10 - wcol;
      F.tableau(to, x0, y + 2 + hc + 6); F.tableau(tc, x0, y + 2);
      F.note(N, x0, y + 2 + hc + 6 + ho + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true;
    } }, ['A3', 'A2', 'A1']);
  return finir(F);
}

/** Étriers à 2 brins : diamètre et espacement pour A_sw/s (m²/m), s ≤ min(0,75 d ; 40 cm), arrondi à 5 cm. */
function etrier(AswS, d) {
  for (const [phi, a] of [[10, 2 * 0.785e-4], [12, 2 * 1.131e-4], [14, 2 * 1.539e-4], [16, 2 * 2.011e-4]]) {
    const s = Math.min(Math.floor(a / AswS / 0.05) * 0.05, Math.floor(0.75 * d / 0.05) * 0.05, 0.40);
    if (s >= 0.10) return { phi, s };
  }
  return { phi: 16, s: 0.10 };
}

/** Zones d'étriers : regroupement des sections de même proposition, de l'appui vers la mi-travée (demi-poutre). */
export function zonesEtriers(v) {
  const zones = [], L = v.L;
  v.tranchant.forEach((t, k) => {
    const e = etrier(t.AswS, t.z / 0.9), x1 = k < v.tranchant.length - 1 ? (t.x + v.tranchant[k + 1].x) / 2 : L / 2;
    const last = zones[zones.length - 1];
    if (last && last.phi === e.phi && last.s === e.s) last.x1 = x1; else zones.push({ x0: last ? last.x1 : 0, x1, ...e, AswS: t.AswS });
  });
  return zones;
}
/** Armatures du talon : nombre de HA25 (A_s ELU à mi-travée, 4 au moins). */
export const talonVIPP = v => ({ phi: 25, n: Math.max(4, Math.ceil(v.elu[v.elu.length - 1].As / 4.909e-4)) });

export function planFerraillageVIPP(v, cartouche = {}, { nom = 'POUTRE VIPP', a = 0.5 } = {}) {
  const S = v.S, f = S.forme, L = v.L, c = 0.03;
  const AsMid = v.elu[v.elu.length - 1].As, { n: nT, phi: phiT } = talonVIPP(v);
  const zones = zonesEtriers(v);
  const cA = vueCoupe(v, S, v.trace, { titre: 'COUPE A-A : FERRAILLAGE COURANT (PRINCIPE)', x: L / 2, armatures: V => {
    const C = S.poutre.contour, yb = c + 0.006;
    // étrier fermé suivant le contour intérieur (âme, talon, table) et barres longitudinales
    V.poly('ACIERS', [[-f.b0 / 2 + c, C.yPan], [-f.bta / 2 + c, f.hpi], [-f.bta / 2 + c, yb], [f.bta / 2 - c, yb], [f.bta / 2 - c, f.hpi], [f.b0 / 2 - c, C.yPan], [f.b0 / 2 - c, f.hp - c], [-f.b0 / 2 + c, f.hp - c]], true);
    V.poly('ACIERS', [[-f.bt / 2 + c, f.hp - c], [f.bt / 2 - c, f.hp - c]]);
    V.poly('ACIERS', [[-f.bt / 2 + c, f.hp - f.hte + c], [-f.b0 / 2 - f.gt + c, f.hp - f.hte - f.pt * (f.bt / 2 - f.b0 / 2 - f.gt) + c], [f.b0 / 2 + f.gt - c, f.hp - f.hte - f.pt * (f.bt / 2 - f.b0 / 2 - f.gt) + c], [f.bt / 2 - c, f.hp - f.hte + c]]);
    for (let k = 0; k < nT; k++) V.cercle('ACIERS_COUPES', [-f.bta / 2 + c + 0.03 + k * (f.bta - 2 * c - 0.06) / Math.max(nT - 1, 1), yb + 0.02], 0.0125, true);
    for (let y = C.yPan + 0.2; y < f.hp - f.hte - 0.25; y += 0.25) for (const s of [-1, 1]) V.cercle('ACIERS_COUPES', [s * (f.b0 / 2 - c - 0.01), y], 0.006, true);
    V.repere([f.bta / 2 + 0.25, 0.05], 1, [f.bta / 2 - c - 0.03, yb + 0.02]); V.texte('TEXTES', [f.bta / 2 + 0.31, 0.05], `${nT} HA${phiT} (talon)`, { h: 2.0, v: 'm' });
    V.repere([f.bt / 2 + 0.2, f.hp * 0.6], 2, [f.b0 / 2 - c, f.hp * 0.6]); V.texte('TEXTES', [f.bt / 2 + 0.26, f.hp * 0.6], `étriers HA${zones[0].phi} (zones)`, { h: 2.0, v: 'm' });
    V.repere([-f.bt / 2 - 0.42, f.hp * 0.45], 3, [-f.b0 / 2 + c + 0.01, f.hp * 0.45]); V.texte('TEXTES', [-f.bt / 2 - 0.48, f.hp * 0.45], 'peau HA12 / 25', { h: 2.0, ancre: 'd', v: 'm' });
  } });
  const tz = { titre: 'ZONES D\'ÉTRIERS (DEPUIS L\'AXE D\'APPUI, SYMÉTRIQUE)', cols: [{ t: 'De [m]', w: 18, a: 'd' }, { t: 'À [m]', w: 18, a: 'd' }, { t: 'A_sw/s [cm²/m]', w: 26, a: 'd' }, { t: 'Étriers', w: 34, a: 'c' }],
    lignes: zones.map(z => [fr(z.x0), fr(z.x1), fr(z.AswS * 1e4, 1), `2 HA${z.phi} / ${fr(z.s * 100, 0)} cm`]) };
  // quantités d'acier (estimation) : talon, étriers (périmètre de l'étrier), peau, table
  const per = 2 * (f.hp - 2 * c) + f.bta + f.bt, nEt = zones.reduce((s, z) => s + 2 * (z.x1 - z.x0) / z.s, 0) + 2 * a / 0.15;
  const kg = { talon: nT * (L + 2 * a) * 3.85, etriers: nEt * per * (zones[0].phi === 10 ? 0.617 : zones[0].phi === 12 ? 0.888 : 1.21), peau: 2 * Math.floor((f.hp - 0.6) / 0.25) * (L + 2 * a) * 0.888, table: 2 * (L + 2 * a) / 0.2 * f.bt * 0.888 };
  const tot = Object.values(kg).reduce((s, x) => s + x, 0), vol = S.poutre.A * (L + 2 * a);
  const tq = { titre: 'ARMATURES PASSIVES (ESTIMATION, UNE POUTRE)', cols: [{ t: 'Poste', w: 60, a: 'g' }, { t: 'Masse [kg]', w: 26, a: 'd' }],
    lignes: [['Talon (A_s ELU / minimum)', milliers(kg.talon)], ['Étriers (zones)', milliers(kg.etriers)], ['Armatures de peau', milliers(kg.peau)], ['Table (transversales)', milliers(kg.table)], ['Total', milliers(tot)], [`Ratio (guide : 100 à 120 kg/m³)`, `${fr(tot / vol, 0)} kg/m³`]] };
  const N = numeroter(['NOTES', `1. Plan de principe : sections d'acier du calcul (ELU de flexion : A_s = ${fr(AsMid * 1e4, 1)} cm² à mi-travée ; effort tranchant EN 1992-1-1 § 6.2.3). Façonnage : nomenclature VIPP-NOM-01.`,
    `2. Aciers HA f_yk = 500 MPa ; enrobage ${fr(c * 100, 0)} cm (gaines : 5 cm au moins).`,
    '3. Étriers fermés à 2 brins, espacement ≤ min(0,75 d ; 40 cm) ; densifier sous les plaques d\'ancrage (frettage selon l\'agrément du procédé).',
    '4. Armatures en attente dans la table pour la liaison avec le hourdis (couture à l\'interface, EN 1992-1-1 § 6.2.5) : à justifier.',
    '5. Ratio courant du guide Sétra VIPP : 100 à 120 kg/m³ de poutre (§ 3.1.2).']);
  const hz = (tz.lignes.length + 2) * 6, hq = (tq.lignes.length + 2) * 6, hn = N.length * 2.1 * 1.6, wcol = 104;
  const F = composer({ titre: `${nom} — FERRAILLAGE DE PRINCIPE`, cartouche, rangees: [[cA]], groupes: [{ vues: [cA], cible: 20, min: 10 }],
    colonne: { largeur: wcol + 6, hauteur: Infinity },
    poser: (F, [x, y]) => { const x0 = F.W - 10 - wcol; F.tableau(tq, x0, y + 2); F.tableau(tz, x0, y + 2 + hq + 6); F.note(N, x0, y + 2 + hq + 6 + hz + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A3', 'A2', 'A1']);
  F.masse = tot;
  return finir(F);
}
