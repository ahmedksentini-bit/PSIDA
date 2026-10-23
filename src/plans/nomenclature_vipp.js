/**
 * Nomenclature des armatures passives d'une travée de pont à poutres VIPP (bordereau de façonnage ISO 4066, codes de forme
 * et longueurs de coupe de bordereau.js) : poutres, hourdis et entretoises d'about, à partir des sections calculées.
 *
 *  Poutre (×n poutres de la travée) :
 *   1  armatures longitudinales du talon : A_s de l'ELU à mi-travée (4 HA25 au moins), droites, recouvrements décalés ;
 *   2  étriers d'âme en U, branches en attente dans le hourdis (couture de l'interface, EN 1992-1-1 § 6.2.5) : zones de
 *      l'effort tranchant (§ 6.2.3), espacement ≤ min(0,75 d ; 40 cm) ;
 *   3  cadres fermés du talon, au pas des étriers ;
 *   4  armatures de peau HA12 / 25 cm sur chaque face d'âme (EN 1992-1-1 § 9.2.4, annexe J ; pratique Sétra) ;
 *   5–6 table de compression : transversales HA12 et longitudinales HA10 à 20 cm, deux lits ;
 *  Hourdis (une travée, toute la largeur) : transversales inférieures et supérieures (flexion locale : onglet Tablier à
 *   poutres), répartition longitudinale ≥ 20 % des armatures principales (§ 9.3.1.1 (2)) et minimum § 9.2.1.1 ;
 *  Entretoises d'about (deux par travée) : armatures inférieures et supérieures du vérinage, cadres, peau.
 * Longueurs commerciales de 12 m : au-delà, pièces droites avec recouvrement l₀ (§ 8.7.3, α₆ = 1,5).
 */
import { longueurCoupe, recapitulatif } from './bordereau.js';
import { areaOf, massPerM, anchorage, chooseBars } from '../rebar.js';
import { zonesEtriers, talonVIPP, vueCoupe } from './vipp.js';
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { couperNote } from './appuis.js';

const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;
export const L_COMMERCIALE = 12;

/** Découpe d'une barre droite de longueur hors tout Lt (m) en pièces de 12 m au plus, recouvrements l₀ compris. */
export function pieces(Lt, phi, fck = 30) {
  if (Lt <= L_COMMERCIALE + 1e-9) return { n: 1, Lp: Lt, l0: 0 };
  const l0 = anchorage(phi, { fck }).l0, n = Math.ceil((Lt - l0) / (L_COMMERCIALE - l0) - 1e-9);
  return { n, Lp: (Lt + (n - 1) * l0) / n, l0 };
}

/**
 * Lignes de la nomenclature : { repere, phi, code, A, B, C, L, nombre, total, masse, element, desig, parPoutre }.
 * ctx = { n (poutres), b1, W (largeur du hourdis, défaut n·b1), a (about), hourdis, entretoise, c (enrobage) }.
 */
export function nomenclatureVIPP(v, ctx = {}) {
  const S = v.S, f = S.forme, L = v.L, a = ctx.a ?? 0.5, c = ctx.c ?? 0.03, n = ctx.n || 1, Lp = L + 2 * a;
  const fckP = v.betons.P.fck, fckH = v.betons.H.fck, hd = S.hd, W = ctx.W || n * (ctx.b1 || S.b1);
  const out = [];
  let rep = 0;
  const ligne = (element, desig, phi, code, dims, nombre, parPoutre = null) => {
    const A = r5(dims.A || 0), B = r5(dims.B || 0), C = r5(dims.C || 0), Lc = r25(longueurCoupe(code, { A, B, C }, phi));
    out.push({ repere: String(++rep), phi, code, A, B: code === '00' ? null : B, C: code === '21' || code === '51' ? C : null, L: Lc, nombre,
      total: Lc / 1000 * nombre, masse: Lc / 1000 * nombre * massPerM(phi), element, desig, parPoutre });
  };
  const droite = (element, desig, phi, Lt, nb, fck, parPoutre) => {
    const p = pieces(Lt, phi, fck);
    ligne(element, desig + (p.n > 1 ? ` — ${p.n} pièces, l₀ = ${p.l0.toFixed(2).replace('.', ',')} m` : ''), phi, '00', { A: p.Lp * 1000 }, nb * p.n, parPoutre && parPoutre * p.n);
  };

  // ---- poutres
  const T = talonVIPP(v), zones = zonesEtriers(v), C = S.poutre.contour;
  droite('poutre', `talon : ${T.n} HA${T.phi} (A_s ELU)`, T.phi, Lp - 2 * c, T.n * n, fckP, T.n);
  // nombre d'étriers d'une poutre : zones symétriques depuis les appuis, abouts au pas de la première zone
  const nEt = Math.round(zones.reduce((s, z) => s + 2 * (z.x1 - z.x0) / z.s, 0) + 2 * a / zones[0].s) + 1;
  const phiE = Math.max(...zones.map(z => z.phi)), ret = Math.max(hd - 0.05, 0.10);
  ligne('poutre', `étriers d'âme en U, attentes ${Math.round(ret * 100)} cm dans le hourdis (zones)`, phiE, '21', { A: (f.hp - 2 * c + ret) * 1000, B: (f.b0 - 2 * c) * 1000, C: (f.hp - 2 * c + ret) * 1000 }, nEt * n, nEt);
  ligne('poutre', 'cadres fermés du talon', phiE, '51', { A: (C.yPan - 2 * c) * 1000, B: (f.bta - 2 * c) * 1000, C: 10 * phiE }, nEt * n, nEt);
  const nPeau = 2 * Math.max(1, Math.floor((f.hp - 0.6) / 0.25));
  droite('poutre', `peau : ${nPeau / 2} HA12 par face`, 12, Lp - 2 * c, nPeau * n, fckP, nPeau);
  const nTt = 2 * (Math.floor((Lp - 2 * c) / 0.20) + 1);
  ligne('poutre', 'table : transversales HA12 / 20, deux lits', 12, '00', { A: (f.bt - 2 * c) * 1000 }, nTt * n, nTt);
  const nTl = 2 * (Math.floor((f.bt - 2 * c) / 0.20) + 1);
  droite('poutre', 'table : longitudinales HA10 / 20, deux lits', 10, Lp - 2 * c, nTl * n, fckP, nTl);

  // ---- hourdis d'une travée
  const H = ctx.hourdis && !ctx.hourdis.erreur ? ctx.hourdis : null;
  const AsMinH = Math.max(0.26 * (0.3 * fckH ** (2 / 3)) / 500, 0.0013) * (hd - c - 0.01);
  const AsI = Math.max(H ? H.inf.As : 0, AsMinH), AsS = Math.max(H ? H.sup.As : 0, AsMinH);
  const bI = chooseBars(AsI, { phiMin: 10, phiMax: 20, sMax: 0.20 }), bS = chooseBars(AsS, { phiMin: 10, phiMax: 20, sMax: 0.20 });
  const fmtS = s => String(Math.round(s * 1000) / 10).replace('.', ',');
  droite('hourdis', `transversales inférieures HA${bI.phi} / ${fmtS(bI.s)}`, bI.phi, W - 2 * c, Math.floor((Lp - 2 * c) / bI.s) + 1, fckH);
  droite('hourdis', `transversales supérieures HA${bS.phi} / ${fmtS(bS.s)}`, bS.phi, W - 2 * c, Math.floor((Lp - 2 * c) / bS.s) + 1, fckH);
  for (const [nomL, As] of [['inférieures', bI.As], ['supérieures', bS.As]]) {
    const bl = chooseBars(Math.max(0.2 * As, AsMinH), { phiMin: 10, phiMax: 16, sMax: 0.25 });
    droite('hourdis', `répartition longitudinale ${nomL} HA${bl.phi} / ${fmtS(bl.s)}`, bl.phi, Lp - 2 * c, Math.floor((W - 2 * c) / bl.s) + 1, fckH);
  }

  // ---- entretoises d'about (deux par travée)
  const E = ctx.entretoise;
  if (E && n >= 2) {
    const Le = (n - 1) * (ctx.b1 || S.b1) + f.b0, he = E.he, te = E.te, hE = he + hd;
    const barres = As => { for (const phi of [16, 20, 25, 32]) { const k = Math.max(2, Math.ceil(As / areaOf(phi))); if (k <= 4 || phi === 32) return { phi, k }; } };
    for (const [nomE, As] of [['inférieures', E.AsInf], ['supérieures', E.AsSup]]) {
      const b = barres(As), retour = Math.min(15 * b.phi / 1000, hE - 2 * c);
      ligne('entretoise', `${nomE} : ${b.k} HA${b.phi} (vérinage)`, b.phi, '21', { A: retour * 1000, B: (Le - 2 * c) * 1000, C: retour * 1000 }, 2 * b.k);
    }
    const eC = chooseBars(E.etriers.AswS / 2, { phiMin: 10, phiMax: 16, sMax: Math.min(0.75 * E.d, 0.30) });
    ligne('entretoise', `cadres HA${eC.phi} / ${fmtS(eC.s)}`, eC.phi, '51', { A: (hE - 2 * c) * 1000, B: (te - 2 * c) * 1000, C: 10 * eC.phi }, 2 * (Math.floor((Le - 2 * c) / eC.s) + 1));
    const nP = 2 * Math.max(1, Math.floor((hE - 0.3) / 0.20));
    droite('entretoise', `peau : ${nP / 2} HA12 par face`, 12, Le - 2 * c, 2 * nP, fckP);
  }
  const R = recapitulatif(out), masse = el => out.filter(l => l.element === el).reduce((s, l) => s + l.masse, 0);
  const volPoutre = S.poutre.A * Lp, mP = masse('poutre') / n;
  return { lignes: out, R, parElement: { poutre: masse('poutre'), hourdis: masse('hourdis'), entretoise: masse('entretoise') }, ratioPoutre: mP / volPoutre, masseParPoutre: mP, volPoutre, Lp, W, n, a, c };
}

/* ----------------------------------------------------------------------------------------------- la feuille */

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/** Coupe de l'entretoise d'about (largeur te, hauteur he + hd) : contour, cadre, barres inférieures et supérieures. */
function vueEntretoise(E, hd, lignes) {
  const V = new Vue('COUPE C-C : ENTRETOISE D\'ABOUT', { echelle: 20 }), te = E.te, h = E.he + hd, c = 0.03;
  const pts = [[-te / 2, 0], [te / 2, 0], [te / 2, h], [-te / 2, h]];
  V.poly('COFFRAGE', pts, true); V.hachure(pts);
  V.ligne('VUES', [-te / 2 - 0.3, E.he], [te / 2 + 0.3, E.he]);
  V.poly('ACIERS', [[-te / 2 + c, c], [te / 2 - c, c], [te / 2 - c, h - c], [-te / 2 + c, h - c]], true);
  const L = lignes.filter(l => l.element === 'entretoise');
  const nb = l => +(/: (\d+) HA/.exec(l.desig) || [0, 2])[1];
  if (L[0]) { const k = nb(L[0]); for (let i = 0; i < k; i++) V.cercle('ACIERS_COUPES', [-te / 2 + c + 0.02 + i * (te - 2 * c - 0.04) / Math.max(k - 1, 1), c + 0.02], 0.01, true); V.repere([te / 2 + 0.2, 0.05], L[0].repere, [te / 2 - c - 0.02, c + 0.02]); }
  if (L[1]) { const k = nb(L[1]); for (let i = 0; i < k; i++) V.cercle('ACIERS_COUPES', [-te / 2 + c + 0.02 + i * (te - 2 * c - 0.04) / Math.max(k - 1, 1), h - c - 0.02], 0.01, true); V.repere([te / 2 + 0.2, h - 0.05], L[1].repere, [te / 2 - c - 0.02, h - c - 0.02]); }
  if (L[2]) V.repere([-te / 2 - 0.2, h / 2], L[2].repere, [-te / 2 + c, h / 2]);
  if (L[3]) { for (let y = 0.25; y < h - 0.2; y += 0.2) for (const s of [-1, 1]) V.cercle('ACIERS_COUPES', [s * (te / 2 - c - 0.01), y], 0.006, true); V.repere([te / 2 + 0.2, h * 0.6], L[3].repere, [te / 2 - c - 0.01, h * 0.6]); }
  V.coteH([-te / 2, 0], [te / 2, 0], -0.1); V.coteV([te / 2, 0], [te / 2, h], te / 2 + 0.38);
  V.texte('TEXTES', [te / 2 + 0.33, E.he + 0.02], 'hourdis', { h: 1.8 });
  return V;
}

export function planNomenclatureVIPP(v, cartouche = {}, { nom = 'POUTRE VIPP', a = 0.5, ctx = {} } = {}) {
  const N0 = nomenclatureVIPP(v, { ...ctx, a }), S = v.S, f = S.forme, c = N0.c, lignes = N0.lignes, rp = k => lignes[k] && lignes[k].repere;
  const cA = vueCoupe(v, S, null, { titre: 'COUPE A-A : REPÈRES DES ARMATURES DE LA POUTRE', armatures: V => {
    const C = S.poutre.contour, yb = c + 0.006, T = talonVIPP(v);
    V.poly('ACIERS', [[-f.b0 / 2 + c, f.hp + S.hd - 0.05], [-f.b0 / 2 + c, yb], [f.b0 / 2 - c, yb], [f.b0 / 2 - c, f.hp + S.hd - 0.05]]);
    V.poly('ACIERS', [[-f.bta / 2 + c, yb], [f.bta / 2 - c, yb], [f.bta / 2 - c, C.yPan - c], [-f.bta / 2 + c, C.yPan - c]], true);
    V.poly('ACIERS', [[-f.bt / 2 + c, f.hp - c], [f.bt / 2 - c, f.hp - c]]); V.poly('ACIERS', [[-f.bt / 2 + c, f.hp - f.hte + c], [f.bt / 2 - c, f.hp - f.hte + c]]);
    for (let k = 0; k < T.n; k++) V.cercle('ACIERS_COUPES', [-f.bta / 2 + c + 0.03 + k * (f.bta - 2 * c - 0.06) / Math.max(T.n - 1, 1), yb + 0.02], 0.0125, true);
    for (let y = C.yPan + 0.2; y < f.hp - f.hte - 0.25; y += 0.25) for (const s of [-1, 1]) V.cercle('ACIERS_COUPES', [s * (f.b0 / 2 - c - 0.01), y], 0.006, true);
    for (let x = -f.bt / 2 + c + 0.02; x < f.bt / 2 - c; x += 0.2) for (const y of [f.hp - c - 0.012, f.hp - f.hte + c + 0.012]) V.cercle('ACIERS_COUPES', [x, y], 0.005, true);
    V.repere([f.bta / 2 + 0.25, 0.04], rp(0), [f.bta / 2 - c - 0.03, yb + 0.02]);
    V.repere([f.bt / 2 + 0.2, f.hp * 0.62], rp(1), [f.b0 / 2 - c, f.hp * 0.62]);
    V.repere([-f.bta / 2 - 0.25, C.yPan * 0.6], rp(2), [-f.bta / 2 + c, C.yPan * 0.6]);
    V.repere([-f.bt / 2 - 0.3, f.hp * 0.45], rp(3), [-f.b0 / 2 + c + 0.01, f.hp * 0.45]);
    V.repere([f.bt / 2 + 0.2, f.hp + 0.12], rp(4), [f.bt / 2 - c - 0.1, f.hp - c]);
    V.repere([-f.bt / 2 - 0.2, f.hp - f.hte], rp(5), [-f.bt / 2 + c + 0.02, f.hp - f.hte + c + 0.012]);
  } });
  const vues = [cA]; if (ctx.entretoise && N0.n >= 2) vues.push(vueEntretoise(ctx.entretoise, S.hd, lignes));
  const td = { titre: 'REPÈRES', hl: 4.6, h: 1.9, cols: [{ t: 'Rep.', w: 11, a: 'c' }, { t: 'Élément', w: 22, a: 'c' }, { t: 'Désignation', w: 110, a: 'g' }, { t: 'Par poutre', w: 23, a: 'd' }],
    lignes: lignes.map(l => [l.repere, l.element, l.desig, l.parPoutre ? String(l.parPoutre) : '']) };
  const notes = ['NOTES', `1. Nomenclature d'une travée de ${fr(v.L)} m : ${N0.n} poutres (abouts ${fr(a)} m), hourdis de ${fr(N0.W)} m, deux entretoises d'about. Aciers HA B500B, enrobage ${fr(c * 100, 0)} cm.`,
    '2. Longueurs de coupe ISO 4066 (codes 00, 21, 51), mandrins EC2 § 8.3 ; barres droites de 12 m au plus, recouvrements l₀ (§ 8.7.3) décalés.',
    `3. Masses : poutres ${milliers(N0.parElement.poutre)} kg (${fr(N0.ratioPoutre, 0)} kg/m³ de poutre ; guide Sétra VIPP : 100 à 120 kg/m³), hourdis ${milliers(N0.parElement.hourdis)} kg, entretoises ${milliers(N0.parElement.entretoise)} kg.`,
    '4. Frettage sous ancrages et armatures d\'éclatement : selon l\'agrément du procédé de précontrainte (non comptés).',
    '5. Hourdis : sections de la flexion locale (onglet Tablier à poutres) ; répartition ≥ 20 % des armatures principales (EN 1992-1-1 § 9.3.1.1).'];
  const N = notes.flatMap((l, i) => (i === 0 ? [l] : couperNote(l, 80)));
  const wb = 166, hl = 4.6, hb = (lignes.length + 2) * hl + 6 + (N0.R.diam.length + 3) * 5.5, ht = (td.lignes.length + 2) * td.hl, hn = N.length * 2.1 * 1.6;
  const F = composer({ titre: `${nom} — NOMENCLATURE DES ARMATURES`, cartouche, rangees: [vues], groupes: [{ vues, cible: 25, min: 10 }],
    colonne: { largeur: wb + 3, hauteur: 2 + hb + 6 + ht + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      const xb = F.W - 10 - wb - 3;
      placerBordereau(F, lignes, [xb, y + 2 + ht + 6, wb, hb]);
      F.tableau(td, xb, y + 2);
      F.note(N, xb, y + 2 + ht + 6 + hb + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true;
    } }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || '1/' + cA.echelle;
  F.nomenclature = N0;
  return F;
}
