/**
 * Plans des ouvrages calculés par phases (onglet « Tablier par phases ») :
 *  - fléaux : coffrage des voussoirs (élévation d'un fléau à hauteur variable, coupes sur pile et à la clé, tableau des
 *    voussoirs : longueur, hauteurs, hourdis inférieur, volume, poids, contre-flèches de réglage des coffrages) et câblage
 *    (câbles de fléau par paire de voussoirs, câbles de continuité au centre et en rive, tableau des familles) ;
 *  - poutres rendues continues : coffrage (élévation d'une poutre, coupe courante avec le hourdis, détail du clavage sur
 *    appui) et câblage (tracé parabolique, ordonnées, armatures de continuité du hourdis).
 * Mêmes conventions que les autres feuilles (cartouche, cotes en m, échelle verticale dilatée pour les élévations).
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { couperNote } from './appuis.js';
import { caisson } from '../phasage/sections.js';
import { contreflechesFleau } from '../phasage/exemples.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const notes = (L, n = 72) => L.flatMap((l, i) => (i ? couperNote(l, n) : [l]));
function finir(F) { F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(q => '1/' + q.vue.echelle + (q.vue.echelleV ? ` (V 1/${q.vue.echelleV})` : '')))].join(' ; '); return F; }
const colonne = (F, wcol, items) => {   // tableaux et notes empilés depuis le bas de la colonne
  const x0 = F.W - 10 - wcol - 3; let y = items.y;
  for (const it of items.liste) {
    if (it.tab) { F.tableau(it.tab, x0, y); y += (it.tab.lignes.length + 2) * (it.tab.hl || 6) + 6; }
    else { const hn = it.notes.length * 2.1 * 1.6; F.note(it.notes, x0, y + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; y += hn + 6; }
  }
};
const hauteur = liste => liste.reduce((s, it) => s + (it.tab ? (it.tab.lignes.length + 2) * (it.tab.hl || 6) + 6 : it.notes.length * 2.1 * 1.6 + 6), 4);

/* ------------------------------------------------------------------------------------------------- fléaux */
function geoFleau(out) {
  const { p, reperes: R } = out, a = p.a, K = p.caisson || { B: 12, ts: 0.25, Bi: 6.5, tip: 0.6, tic: 0.22, bw: 0.45 };
  const r = [0, R.l0 / 2]; for (let k = 1; k <= R.nv; k++) r.push(R.l0 / 2 + k * R.lv);
  const ti = xi => K.tic + (K.tip - K.tic) * (1 - xi) ** 2;
  return { p, R, a, K, r, ti, h: R.h };
}

function vueElevFleau(G, { cables = null } = {}) {
  const { a, r, h, R } = G, V = new Vue(cables ? 'ÉLÉVATION DU FLÉAU — CÂBLAGE' : 'ÉLÉVATION DU FLÉAU — VOUSSOIRS', { echelle: 200, echelleV: 100 });
  const pts = []; for (let q = 0; q <= 80; q++) { const x = -a + 2 * a * q / 80, xi = Math.abs(x) / a; pts.push([x, -h(xi)]); }
  V.poly('COFFRAGE', [[-a, 0], [a, 0], ...pts.slice().reverse()], true);
  // joints de voussoirs
  for (const s of [-1, 1]) r.slice(1).forEach((d, k) => { const x = s * d, xi = d / a; V.ligne('COFFRAGE', [x, 0], [x, -h(xi)]); if (!cables && k > 0) V.texte('TEXTES', [s * (d - R.lv / 2), 0.25], `${k}`, { h: 1.8, ancre: 'c' }); });
  if (!cables) V.texte('TEXTES', [0, 0.25], 'VSP', { h: 1.8, ancre: 'c' });
  // pile
  V.poly('VUES', [[-1.5, -h(0)], [1.5, -h(0)], [1.5, -h(0) - 2.5], [-1.5, -h(0) - 2.5]], true);
  V.ligne('AXES', [0, 0.6], [0, -h(0) - 2.8]);
  if (cables) {
    const { fl, cc } = cables;
    fl.forEach((c, k) => { const d = r[k + 1], y = -0.15 - 0.06 * (k % 4); V.poly('ACIERS', [[-d, y], [d, y]]); for (const s of [-1, 1]) V.poly('APPAREILS', [[s * d, y - 0.08], [s * d - s * 0.12, y - 0.08], [s * d - s * 0.12, y + 0.08], [s * d, y + 0.08]], true); });
    if (cc) for (const s of [-1, 1]) { if (s < 0 && !cc.nRive) continue; const d0 = r[Math.max(1, R.nv - (s > 0 ? cc.nv : cc.nvRive))], pts2 = []; for (let q = 0; q <= 20; q++) { const d = d0 + (a - d0) * q / 20; pts2.push([s * d, -h(d / a) + 0.18]); } V.poly('ACIERS', pts2); V.texte('TEXTES', [s * (a - 1), -h(1) + 0.45], s > 0 ? 'continuité (travée centrale) →' : '← continuité de rive', { h: 1.8, ancre: s > 0 ? 'd' : 'g' }); }
  }
  V.coteH([-a, 0], [a, 0], 1.4, `${fr(2 * a, 2)} (fléau)`);
  V.coteH([-R.l0 / 2, 0], [R.l0 / 2, 0], 0.9, `VSP ${fr(R.l0, 2)}`);
  V.coteV([a, 0], [a, -h(1)], a + 1.2, `h_c = ${fr(h(1), 2)}`);
  V.coteV([R.l0 / 2, 0], [R.l0 / 2, -h(0)], R.l0 / 2 + 1.2, `h_p = ${fr(h(0), 2)}`);
  return V;
}

function vueCaisson(G, xi, titre) {
  const K = G.K, h = G.h(xi), ti = G.ti(xi), V = new Vue(titre, { echelle: 50 }), xw = K.Bi / 2;
  const ext = [[-K.B / 2, 0], [K.B / 2, 0], [K.B / 2, -K.ts], [xw, -K.ts], [xw, -h], [-xw, -h], [-xw, -K.ts], [-K.B / 2, -K.ts]];
  const int = [[-xw + K.bw, -K.ts], [xw - K.bw, -K.ts], [xw - K.bw, -h + ti], [-xw + K.bw, -h + ti]];
  V.poly('COFFRAGE', ext, true); V.poly('COFFRAGE', int, true);
  V.hachure([...ext, ext[0], int[0], ...int.slice(1).reverse(), int[0]]);   // anneau : contour, fente, cellule en sens inverse (pair-impair)
  V.ligne('AXES', [0, 0.3], [0, -h - 0.3]);
  V.coteH([-K.B / 2, 0], [K.B / 2, 0], 0.45); V.coteH([-xw, -h], [xw, -h], -h - 0.4);
  V.coteV([K.B / 2, 0], [K.B / 2, -K.ts], K.B / 2 + 0.3); V.coteV([xw, 0], [xw, -h], xw + 0.5);
  V.coteV([-xw + K.bw, -h], [-xw + K.bw, -h + ti], -xw + K.bw + 0.4);
  V.texte('TEXTES', [xw - K.bw - 0.05, -h / 2], `âme ${fr(K.bw * 100, 0)} cm`, { h: 2.0, ancre: 'd', v: 'm' });
  return V;
}

export function planFleauCoffrage(out, cartouche = {}, { nom = 'PONT PAR ENCORBELLEMENTS' } = {}) {
  const G = geoFleau(out), { p, R, a, K, r } = G, el = vueElevFleau(G), cP = vueCaisson(G, 0, 'COUPE SUR PILE'), cC = vueCaisson(G, 1, 'COUPE À LA CLÉ');
  let cf = []; try { cf = contreflechesFleau(out.r, out.modele, R).filter(q => q.cote === 'D'); } catch { cf = []; }
  const lignes = r.slice(0, -1).map((d0, k) => {
    const d1 = r[k + 1], xm = (d0 + d1) / 2 / a, L = (k === 0 ? 2 : 1) * (d1 - d0), A = caisson({ ...K, ti: G.ti(xm) }, G.h(xm)).A, c = cf.find(q => q.k === k);
    return [k === 0 ? 'VSP' : String(k), fr(L, 2), fr(G.h(d0 / a), 2), fr(G.h(d1 / a), 2), fr(G.ti(xm), 2), fr(A * L, 1), fr(A * L * p.gBeton / 10, 0), c ? fr(c.contrefleche * 1000, 0) : '—'];
  });
  const tv = { titre: 'VOUSSOIRS (UN DEMI-FLÉAU ; VSP ENTIER)', hl: 4.6, h: 1.9, cols: [{ t: 'Voussoir', w: 16, a: 'c' }, { t: 'Long. [m]', w: 16, a: 'd' }, { t: 'h début', w: 15, a: 'd' }, { t: 'h fin', w: 15, a: 'd' }, { t: 't_inf [m]', w: 16, a: 'd' }, { t: 'Vol. [m³]', w: 16, a: 'd' }, { t: 'Poids [t]', w: 16, a: 'd' }, { t: 'Contre-fl. [mm]', w: 22, a: 'd' }], lignes };
  const N = notes(['NOTES', `1. Cotes en mètres. Hauteur h(ξ) = h_c + (h_p − h_c)(1 − ξ)² ; hourdis inférieur d'épaisseur parabolique de ${fr(K.tip, 2)} m (pile) à ${fr(K.tic, 2)} m (clé).`,
    `2. Béton C${p.fck} ; voussoirs coulés en place à l'équipage mobile, cycle de ${p.dates.cycle} j, décoffrage à ${p.dates.durc} j ; équipage de ${milliers(p.Qeq)} kN.`,
    '3. Contre-flèches de réglage des coffrages au joint d\'extrémité de chaque voussoir (calcul par phases, fluage compris jusqu\'à t∞), à ajouter au profil en long théorique (positives vers le haut).',
    '4. Clouage provisoire du VSP sur pile pendant la construction : voir la note (déséquilibre, barres verticales et cales).', '5. Goussets, bossages d\'ancrage et entretoises sur pile : plans d\'exécution.']);
  const liste = [{ tab: tv }, { notes: N }], wcol = tv.cols.reduce((s, c) => s + c.w, 0);
  const F = composer({ titre: `${nom} — COFFRAGE DES VOUSSOIRS`, cartouche, rangees: [[el], [cP, cC]],
    groupes: [{ vues: [el], cible: 250, min: 100 }, { vues: [cP, cC], cible: 100, min: 25 }], colonne: { largeur: wcol + 6, hauteur: hauteur(liste) },
    poser: (F, [x, y]) => colonne(F, wcol, { y: y + 2, liste }) }, ['A3', 'A2', 'A1']);
  return finir(F);
}

export function planFleauCablage(out, cartouche = {}, { nom = 'PONT PAR ENCORBELLEMENTS' } = {}) {
  const G = geoFleau(out), { p, R } = G, C = p.cable, cc = p.continuite;
  const fl = Array.from({ length: R.nv + 1 }, (_, k) => ({ k }));
  const el = vueElevFleau(G, { cables: { fl, cc: cc.n > 0 ? cc : null } });
  const torons = Ap => Math.round(Ap / 150e-6);
  const tc = { titre: 'FAMILLES DE CÂBLES', hl: 4.6, h: 1.9, cols: [{ t: 'Famille', w: 40, a: 'g' }, { t: 'Nombre', w: 16, a: 'd' }, { t: 'Unité', w: 18, a: 'c' }, { t: 'P₀ [kN]', w: 18, a: 'd' }, { t: 'Ancrages / tension', w: 58, a: 'g' }],
    lignes: [[`Fléau (par paire de voussoirs)`, `${C.n} × ${R.nv + 1} × 2`, `${torons(C.Ap)}T15S`, milliers(C.P0), 'faces des voussoirs k, tendus après décoffrage'],
      ...(cc.n > 0 ? [[`Continuité centrale`, String(cc.n), `${torons(cc.Ap)}T15S`, milliers(cc.P0), `${cc.nv} voussoirs de part et d'autre de la clé, après clavage`]] : []),
      ...(cc.nRive > 0 ? [[`Continuité de rive (par travée)`, String(cc.nRive), `${torons(cc.Ap)}T15S`, milliers(cc.P0), `${cc.nvRive} voussoirs côté culée, après clavage`]] : [])] };
  const N = notes(['NOTES', `1. Torons T15 super (150 mm², f_pk = 1 860 MPa) ; frottement μ = ${fr(C.mu, 2)}, k = ${fr(C.k, 3)} rad/m, recul ${fr(C.g * 1000, 0)} mm ; enrobage des câbles ${fr(C.enrob, 2)} m (excentrements du calcul).`,
    '2. Câbles de fléau dans le hourdis supérieur, ancrés aux faces d\'extrémité des voussoirs (bossages ou goussets), tension symétrique des deux côtés.',
    '3. Câbles de continuité dans le hourdis inférieur, ancrés dans des bossages ; tension après les clavages (central et sur culées).',
    '4. Tracés de principe (dessin schématique en élévation) : répartition dans les âmes et positions en plan à établir au plan d\'exécution.']);
  const liste = [{ tab: tc }, { notes: N }], wcol = tc.cols.reduce((s, c) => s + c.w, 0);
  const F = composer({ titre: `${nom} — CÂBLAGE DU FLÉAU`, cartouche, rangees: [[el]], groupes: [{ vues: [el], cible: 250, min: 100 }], colonne: { largeur: wcol + 6, hauteur: hauteur(liste) },
    poser: (F, [x, y]) => colonne(F, wcol, { y: y + 2, liste }) }, ['A3', 'A2', 'A1']);
  return finir(F);
}

/* --------------------------------------------------------------------------------- poutres rendues continues */
function vueElevPoutre(out, { cable = false } = {}) {
  const { p } = out, f = p.forme, L = p.L, a = 0.4, V = new Vue(cable ? 'ÉLÉVATION D\'UNE TRAVÉE — CÂBLE' : 'ÉLÉVATION D\'UNE POUTRE', { echelle: 100, echelleV: 25 });
  V.poly('COFFRAGE', [[-a, 0], [L + a, 0], [L + a, f.H], [-a, f.H]], true);
  V.ligne('VUES', [-a, f.hb], [L + a, f.hb]); V.ligne('VUES', [-a, f.H - f.ht], [L + a, f.H - f.ht]);
  V.poly('VUES', [[-a, f.H], [L + a, f.H], [L + a, f.H + f.hd], [-a, f.H + f.hd]], true);
  for (const x of [0, L]) { V.ligne('AXES', [x, -0.3], [x, f.H + f.hd + 0.2]); V.poly('APPAREILS', [[x - 0.15, -0.05], [x + 0.15, -0.05], [x + 0.15, 0], [x - 0.15, 0]], true); }
  if (cable) {
    const C = p.cable, yG = f.yG, ex = xi => C.eAbout + (C.eMi - C.eAbout) * 4 * xi * (1 - xi), pts = [];
    for (let q = 0; q <= 40; q++) { const x = L * q / 40; pts.push([x, yG + ex(q / 40)]); }
    V.poly('ACIERS', [[-a, pts[0][1]], ...pts, [L + a, pts[pts.length - 1][1]]]);
  }
  V.coteH([0, 0], [L, 0], -0.5, `L = ${fr(L, 2)}`); V.coteV([-a, 0], [-a, f.H], -a - 0.5);
  return V;
}

function vueCoupePoutre(out) {
  const f = out.p.forme, V = new Vue('COUPE COURANTE (POUTRE + HOURDIS)', { echelle: 20 });
  const P = [[-f.bb / 2, 0], [f.bb / 2, 0], [f.bb / 2, f.hb], [f.bw / 2, f.hb], [f.bw / 2, f.H - f.ht], [f.bt / 2, f.H - f.ht], [f.bt / 2, f.H], [-f.bt / 2, f.H], [-f.bt / 2, f.H - f.ht], [-f.bw / 2, f.H - f.ht], [-f.bw / 2, f.hb], [-f.bb / 2, f.hb]];
  V.poly('COFFRAGE', P, true); V.hachure(P);
  V.poly('VUES', [[-f.bh / 2, f.H], [f.bh / 2, f.H], [f.bh / 2, f.H + f.hd], [-f.bh / 2, f.H + f.hd]], true);
  V.coteH([-f.bt / 2, f.H], [f.bt / 2, f.H], f.H + f.hd + 0.12); V.coteH([-f.bb / 2, 0], [f.bb / 2, 0], -0.12); V.coteH([-f.bh / 2, f.H + f.hd], [f.bh / 2, f.H + f.hd], f.H + f.hd + 0.3);
  V.coteV([f.bb / 2, 0], [f.bb / 2, f.hb], f.bb / 2 + 0.1); V.coteV([-f.bt / 2, 0], [-f.bt / 2, f.H], -f.bt / 2 - 0.15); V.coteV([f.bh / 2, f.H], [f.bh / 2, f.H + f.hd], f.bh / 2 + 0.1);
  V.texte('TEXTES', [f.bw / 2 + 0.03, f.H / 2], `âme ${fr(f.bw * 100, 0)} cm`, { h: 2.0, v: 'm' });
  return V;
}

function vueClavage(out) {
  const f = out.p.forme, V = new Vue('DÉTAIL DU CLAVAGE SUR APPUI', { echelle: 25 }), g = 0.10, l = 1.6;
  for (const s of [-1, 1]) V.poly('COFFRAGE', [[s * g / 2, 0], [s * (g / 2 + l), 0], [s * (g / 2 + l), f.H], [s * g / 2, f.H]], true);
  const ent = [[-0.6, 0.15], [0.6, 0.15], [0.6, f.H + f.hd], [-0.6, f.H + f.hd]];
  V.poly('VUES', ent, true);
  V.poly('VUES', [[-(g / 2 + l), f.H], [g / 2 + l, f.H], [g / 2 + l, f.H + f.hd], [-(g / 2 + l), f.H + f.hd]], true);
  V.poly('ACIERS', [[-(g / 2 + l) + 0.05, f.H + f.hd - 0.05], [g / 2 + l - 0.05, f.H + f.hd - 0.05]]);
  for (const s of [-1, 1]) V.poly('APPAREILS', [[s * 0.45 - 0.15, -0.06], [s * 0.45 + 0.15, -0.06], [s * 0.45 + 0.15, 0], [s * 0.45 - 0.15, 0]], true);
  V.ligne('AXES', [0, -0.3], [0, f.H + f.hd + 0.3]);
  V.texte('TEXTES', [0, f.H + f.hd + 0.35], 'entretoise de clavage coulée en place', { h: 2.0, ancre: 'c' });
  V.texte('TEXTES', [g / 2 + l - 0.05, f.H + f.hd + 0.05], 'armatures de continuité du hourdis', { h: 1.8, ancre: 'd' });
  V.coteH([-0.6, 0.15], [0.6, 0.15], -0.25);
  return V;
}

export function planContinuesCoffrage(out, cartouche = {}, { nom = 'POUTRES RENDUES CONTINUES' } = {}) {
  const p = out.p, f = p.forme, el = vueElevPoutre(out), cA = vueCoupePoutre(out), cl = vueClavage(out);
  const A = out.modele.barres[0].A, vol = A * (p.L + 0.8);
  const tq = { titre: 'QUANTITÉS (UNE POUTRE)', hl: 5, h: 2.0, cols: [{ t: 'Désignation', w: 90, a: 'g' }, { t: 'Quantité', w: 34, a: 'd' }],
    lignes: [['Béton de la poutre (C' + p.poutre.fck + ')', `${fr(vol, 2)} m³`], ['Masse de la poutre', `${fr(vol * 2.5, 1)} t`], ['Hourdis par poutre (C' + p.hourdis.fck + ')', `${fr(f.bh * f.hd * p.L, 2)} m³`], ['Nombre de travées', String(p.n)]] };
  const N = notes(['NOTES', '1. Cotes en mètres ; élévation à échelle des hauteurs dilatée.', `2. Poutres préfabriquées posées isostatiques (âge ${p.dates.tension} j à la mise en tension), hourdis coulé à ${p.dates.hourdis} j, clavage à ${p.dates.continuite} j.`,
    '3. Clavage : entretoise sur appui coulée en place entre les abouts des poutres, armatures de continuité du hourdis et attentes des poutres (onglet « Tablier par phases », ouvrage terminé : A_s sur appui).',
    '4. Appareils d\'appui provisoires pendant la pose, définitifs sous l\'entretoise ou sous chaque poutre selon le parti retenu.']);
  const liste = [{ tab: tq }, { notes: N }], wcol = 124;
  const F = composer({ titre: `${nom} — COFFRAGE ET CLAVAGE`, cartouche, rangees: [[el], [cA, cl]], groupes: [{ vues: [el], cible: 200, min: 100 }, { vues: [cA, cl], cible: 50, min: 10 }],
    colonne: { largeur: wcol + 6, hauteur: hauteur(liste) }, poser: (F, [x, y]) => colonne(F, wcol, { y: y + 2, liste }) }, ['A3', 'A2', 'A1']);
  return finir(F);
}

export function planContinuesCablage(out, cartouche = {}, { nom = 'POUTRES RENDUES CONTINUES' } = {}) {
  const p = out.p, f = p.forme, C = p.cable, el = vueElevPoutre(out, { cable: true }), L = p.L;
  const ex = xi => C.eAbout + (C.eMi - C.eAbout) * 4 * xi * (1 - xi), st = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  const to = { titre: 'ORDONNÉE DE L\'AXE DU CÂBLE DEPUIS LA SOUS-FACE [m]', hl: 5, h: 2.0, cols: [{ t: 'x / L', w: 16, a: 'c' }, ...st.map(k => ({ t: k === 0 ? 'appui' : fr(k, 1), w: 17, a: 'd' }))],
    lignes: [['y [m]', ...st.map(k => fr(f.yG + ex(k), 3))]] };
  const e = out.acheve && out.acheve.elu ? out.acheve.elu.reduce((a, b) => (b.AsCont > a.AsCont ? b : a)) : null;
  const tc = { titre: 'PRÉCONTRAINTE ET CONTINUITÉ (UNE POUTRE)', hl: 5, h: 2.0, cols: [{ t: 'Désignation', w: 80, a: 'g' }, { t: 'Valeur', w: 38, a: 'd' }],
    lignes: [['Section des torons A_p', `${fr(C.Ap * 1e4, 1)} cm² (${Math.round(C.Ap / 150e-6)} T15S)`], ['Force après pertes instantanées', `${milliers(C.P ?? C.P0)} kN`], ['Excentrement à mi-travée / sur appui', `${fr(C.eMi, 2)} / ${fr(C.eAbout, 2)} m`],
      ...(e ? [['Armatures de continuité (hourdis, sur appui)', `${fr(e.AsCont * 1e4, 1)} cm²`]] : [])] };
  const N = notes(['NOTES', '1. Câble parabolique par travée, ancré aux abouts de la poutre ; excentrements rapportés au centre de gravité de la poutre.', '2. Torons T15 super, gaines injectées ; tension sur la poutre seule avant la pose.',
    '3. Armatures de continuité : dans le hourdis au-dessus des appuis, ancrées au-delà du point de moment nul (EN 1992-1-1 § 9.2.1.3).']);
  const liste = [{ tab: to }, { tab: tc }, { notes: N }], wcol = 124;
  const F = composer({ titre: `${nom} — CÂBLAGE ET CONTINUITÉ`, cartouche, rangees: [[el]], groupes: [{ vues: [el], cible: 200, min: 100 }], colonne: { largeur: wcol + 6, hauteur: hauteur(liste) },
    poser: (F, [x, y]) => colonne(F, wcol, { y: y + 2, liste }) }, ['A3', 'A2', 'A1']);
  return finir(F);
}
