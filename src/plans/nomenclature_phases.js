/**
 * Nomenclatures des armatures des ouvrages calculés par phases (bordereau de façonnage ISO 4066, mêmes conventions que
 * src/plans/nomenclature_vipp.js : longueurs de coupe, barres de 12 m au plus avec recouvrements l₀) :
 *
 *  - poutres rendues continues (une travée, toutes les poutres) : talon (A_s inférieur de l'ouvrage terminé, 4 HA20 au
 *    moins), étriers d'âme en U en attente dans le hourdis et cadres de talon par zones (A_sw/s de l'effort tranchant :
 *    zones d'about sur 0,25 L, zone centrale), peau, table ; hourdis (minimum EC2 § 9.3.1.1, la flexion locale relevant de
 *    l'onglet Tablier à poutres), armatures de continuité sur appui (A_s supérieur de l'ouvrage terminé), prolongées de
 *    0,25 L + l_bd de part et d'autre (EN 1992-1-1 § 9.2.1.3) ; entretoise de clavage (constructif) ;
 *  - voussoir courant de fléau (section de la clé) : cadre transversal (A_s par mètre de la flexion transversale du
 *    caisson : hourdis supérieur, âmes — le plus grand de la flexion et de l'effort tranchant —, hourdis inférieur),
 *    armatures longitudinales de peau (minimum) et armatures passives de complément de l'ouvrage terminé à la clé.
 * Unités : m, cm² ; cotes du bordereau en mm.
 */
import { longueurCoupe, recapitulatif } from './bordereau.js';
import { pieces } from './nomenclature_vipp.js';
import { areaOf, massPerM, anchorage, chooseBars } from '../rebar.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { couperNote } from './appuis.js';
import { Vue } from './dessin.js';

const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const sTxt = s => String(Math.round(s * 1000) / 10).replace('.', ',');

/** Constructeur de lignes de bordereau. */
function fabrique() {
  const out = []; let rep = 0;
  const ligne = (element, desig, phi, code, dims, nombre) => {
    const A = r5(dims.A || 0), B = r5(dims.B || 0), C = r5(dims.C || 0), L = r25(longueurCoupe(code, { A, B, C }, phi));
    out.push({ repere: String(++rep), phi, code, A, B: code === '00' ? null : B, C: code === '21' || code === '51' ? C : null, L, nombre, total: L / 1000 * nombre, masse: L / 1000 * nombre * massPerM(phi), element, desig });
  };
  const droite = (element, desig, phi, Lt, nb, fck = 35) => {
    const p = pieces(Lt, phi, fck);
    ligne(element, desig + (p.n > 1 ? ` — ${p.n} pièces, l₀ = ${fr(p.l0)} m` : ''), phi, '00', { A: p.Lp * 1000 }, nb * p.n);
  };
  return { out, ligne, droite };
}
/** Étriers à 2 brins pour A_sw/s (m²/m) : φ, s ≤ min(0,75 d ; 0,40). */
function etrier(AswS, d) {
  for (const phi of [10, 12, 14, 16]) { const a = 2 * areaOf(phi), s = Math.min(Math.floor(a / Math.max(AswS, 1e-9) / 0.025) * 0.025, Math.floor(0.75 * d / 0.025) * 0.025, 0.40); if (s >= 0.10) return { phi, s }; }
  return { phi: 16, s: 0.10 };
}

/* -------------------------------------------------------------------------------------- poutres continues */
export function nomenclatureContinues(out, { c = 0.03 } = {}) {
  const p = out.p, f = p.forme, L = p.L, v = out.acheve, nP = v ? v.nP : 4, fck = p.poutre.fck, fckH = p.hourdis.fck;
  const Lp = L - 0.10, F = fabrique(), elu = v ? v.elu : [];
  // talon : A_s inférieur maximal (par poutre)
  const AsInf = Math.max(4 * areaOf(20), ...elu.map(e => e.AsInf)), nT = Math.max(4, Math.ceil(AsInf / areaOf(25) - 1e-9));
  F.droite('poutre', `talon : ${nT} HA25 (A_s inf. ELU ${fr(AsInf * 1e4, 1)} cm²)`, 25, Lp - 2 * c, nT * nP * p.n, fck);
  // étriers par zones : about (0,25 L) et centre, A_sw/s maximal de chaque zone sur la première travée
  const d = f.H + f.hd - 0.10, zone = (x0, x1) => Math.max(0, ...elu.filter(e => e.x >= x0 - 1e-9 && e.x <= x1 + 1e-9).map(e => e.V.AswS));
  const eA = etrier(zone(0, 0.25 * L), d), eC = etrier(zone(0.25 * L, 0.5 * L), d), phiE = Math.max(eA.phi, eC.phi);
  const nEt = Math.round(2 * 0.25 * L / eA.s + 0.5 * L / eC.s) + 1, ret = Math.max(f.hd - 0.05, 0.10);
  F.ligne('poutre', `étriers d'âme en U, attentes ${Math.round(ret * 100)} cm (about HA${eA.phi}/${sTxt(eA.s)}, centre HA${eC.phi}/${sTxt(eC.s)})`, phiE, '21', { A: (f.H - 2 * c + ret) * 1000, B: (f.bw - 2 * c) * 1000, C: (f.H - 2 * c + ret) * 1000 }, nEt * nP * p.n);
  F.ligne('poutre', 'cadres fermés du talon', phiE, '51', { A: (f.hb - 2 * c) * 1000, B: (f.bb - 2 * c) * 1000, C: 10 * phiE }, nEt * nP * p.n);
  const nPe = 2 * Math.max(1, Math.floor((f.H - f.ht - f.hb) / 0.25));
  F.droite('poutre', `peau : ${nPe / 2} HA12 par face`, 12, Lp - 2 * c, nPe * nP * p.n, fck);
  F.ligne('poutre', 'table : transversales HA10 / 20', 10, '00', { A: (f.bt - 2 * c) * 1000 }, (Math.floor((Lp - 2 * c) / 0.2) + 1) * nP * p.n);
  // hourdis : minimum EC2 (flexion locale : onglet Tablier à poutres), transversal deux nappes, répartition
  const AsMinH = Math.max(0.26 * 0.3 * fckH ** (2 / 3) / 500, 0.0013) * (f.hd - c - 0.01), bH = chooseBars(AsMinH, { phiMin: 10, phiMax: 16, sMax: 0.20 }), W = nP * f.bh;
  F.droite('hourdis', `transversales (2 nappes) HA${bH.phi} / ${sTxt(bH.s)} — minimum`, bH.phi, W - 2 * c, 2 * (Math.floor(L / bH.s) + 1) * p.n, fckH);
  const bR = chooseBars(Math.max(0.2 * bH.As, AsMinH), { phiMin: 10, phiMax: 12, sMax: 0.25 });
  F.droite('hourdis', `longitudinales (2 nappes) HA${bR.phi} / ${sTxt(bR.s)}`, bR.phi, L * p.n - 2 * c, 2 * (Math.floor((W - 2 * c) / bR.s) + 1), fckH);
  // continuité sur appui : A_s supérieur maximal par poutre, longueur 2 (0,25 L + l_bd)
  if (p.n > 1) {
    const AsC = Math.max(...elu.map(e => e.AsCont), 0);
    if (AsC > 0) {
      const phi = AsC / areaOf(20) <= 12 ? 20 : 25, nC = Math.ceil(AsC / areaOf(phi) - 1e-9), lbd = anchorage(phi, { fck: fckH, top: true }).lbd, Lc = 2 * (0.25 * L + lbd);
      F.droite('hourdis', `continuité sur appui : ${nC} HA${phi} par poutre (A_s ${fr(AsC * 1e4, 1)} cm²), 2 × (0,25 L + l_bd)`, phi, Lc, nC * nP * (p.n - 1), fckH);
    }
    // entretoise de clavage (constructif) : 2 × 4 HA16 filants, cadres HA10 / 20
    const he = f.H + f.hd, Le = W - 2 * c;
    F.droite('entretoise', 'clavage : 2 × 4 HA16 filants (constructif)', 16, Le, 8 * (p.n - 1), fck);
    F.ligne('entretoise', 'clavage : cadres HA10 / 20', 10, '51', { A: (he - 2 * c) * 1000, B: (1.2 - 2 * c) * 1000, C: 100 }, (Math.floor(Le / 0.2) + 1) * (p.n - 1));
  }
  const R = recapitulatif(F.out), vol = (out.modele.barres[0].A + f.bh * f.hd) * L * nP * p.n;
  return { lignes: F.out, R, ratio: R.masse / vol, vol, nP, n: p.n, L };
}

/* ------------------------------------------------------------------------------------- voussoir de fléau */
export function nomenclatureVoussoir(out, { c = 0.04 } = {}) {
  const p = out.p, K = p.caisson, R0 = out.reperes, T = out.transversal, lv = R0.lv, fck = p.fck, F = fabrique();
  if (!K || !T) throw new Error('nomenclature du voussoir : caisson défini par ses dimensions et flexion transversale nécessaires');
  const sec = nom => T.sections.find(s => s.nom.startsWith(nom)), hc = p.hc, xw = K.Bi / 2 - K.bw / 2;
  const bars = As => chooseBars(Math.max(As, 1e-6), { phiMin: 12, phiMax: 25, sMax: 0.20 });
  const nb = s => Math.floor((lv - 2 * c) / s) + 1;
  // hourdis supérieur : nappe supérieure (encastrement des encorbellements, nu intérieur des âmes), nappe inférieure (milieu)
  const sup = bars(Math.max(sec('Encorbellement').AsTendu.neg, sec('Hourdis supérieur : nu').AsTendu.neg)), infH = bars(sec('Hourdis supérieur : milieu').AsTendu.pos);
  F.ligne('hourdis sup.', `nappe supérieure HA${sup.phi} / ${sTxt(sup.s)} (encastrement, nu des âmes)`, sup.phi, '21', { A: 10 * sup.phi, B: (K.B - 2 * c) * 1000, C: 10 * sup.phi }, nb(sup.s));
  F.ligne('hourdis sup.', `nappe inférieure HA${infH.phi} / ${sTxt(infH.s)} (entre âmes)`, infH.phi, '00', { A: (2 * xw + K.bw - 2 * c) * 1000 }, nb(infH.s));
  // âmes : face extérieure / intérieure, le plus grand de la flexion du cadre et d'un brin d'étrier (A_sw/s / 4 : 2 âmes × 2 brins)
  const elu = out.acheve ? out.acheve.elu : [], xCle = 2 * p.a, AswCle = Math.max(0, ...elu.filter(e => Math.abs(e.x - xCle) < lv * 1.5).map(e => e.V.AswS));
  const brin = AswCle / 4, ext = bars(Math.max(sec('Âme : tête').AsTendu.pos, sec('Âme : pied').AsTendu.pos, brin)), int = bars(Math.max(sec('Âme : tête').AsTendu.neg, sec('Âme : pied').AsTendu.neg, brin));
  const hw = hc - K.ts - K.tic;
  F.ligne('âmes', `cadres face extérieure HA${ext.phi} / ${sTxt(ext.s)} (flexion transversale / effort tranchant)`, ext.phi, '21', { A: 15 * ext.phi, B: (hc - 2 * c) * 1000, C: 15 * ext.phi }, 2 * nb(ext.s));
  F.ligne('âmes', `face intérieure HA${int.phi} / ${sTxt(int.s)}`, int.phi, '21', { A: 15 * int.phi, B: (hw + 0.3) * 1000, C: 15 * int.phi }, 2 * nb(int.s));
  // hourdis inférieur : deux nappes
  const bi1 = bars(sec('Hourdis inférieur : nu').AsTendu.pos), bi2 = bars(Math.max(sec('Hourdis inférieur : nu').AsTendu.neg, sec('Hourdis inférieur : milieu').AsTendu.pos));
  F.ligne('hourdis inf.', `nappe inférieure HA${bi1.phi} / ${sTxt(bi1.s)}`, bi1.phi, '21', { A: 10 * bi1.phi, B: (K.Bi - 2 * c) * 1000, C: 10 * bi1.phi }, nb(bi1.s));
  F.ligne('hourdis inf.', `nappe supérieure HA${bi2.phi} / ${sTxt(bi2.s)}`, bi2.phi, '00', { A: (K.Bi - 2 * K.bw) * 1000 }, nb(bi2.s));
  // longitudinales : peau HA12 / 15 sur toutes les faces (minimum), complément de l'ouvrage terminé à la clé (A_s inférieur)
  const per = 2 * K.B + 4 * hw + 2 * K.Bi, nL = Math.ceil(per / 0.15);
  F.droite('longitudinales', `peau HA12 / 15 (périmètre ${fr(per, 1)} m)`, 12, lv + anchorage(12, { fck }).l0, nL, fck);
  const eC = elu.length ? elu.reduce((a, e) => (Math.abs(e.x - xCle) < Math.abs(a.x - xCle) ? e : a)) : null;
  if (eC && eC.AsInf > 0) { const n = Math.ceil(eC.AsInf / areaOf(25) - 1e-9); F.droite('longitudinales', `complément inférieur à la clé : ${n} HA25 (A_s ${fr(eC.AsInf * 1e4, 0)} cm²)`, 25, lv + anchorage(25, { fck }).l0, n, fck); }
  const R = recapitulatif(F.out), A = (K.B * K.ts + 2 * K.bw * hw + K.Bi * K.tic), vol = A * lv;
  return { lignes: F.out, R, ratio: R.masse / vol, vol, lv, AswCle };
}

/* ------------------------------------------------------------------------------------------------ feuilles */
function feuilleNomenclature({ titre, N0, notes, vue, cartouche }) {
  const lignes = N0.lignes, wb = 166, hl = 4.6, hb = (lignes.length + 2) * hl + 6 + (N0.R.diam.length + 3) * 5.5;
  const td = { titre: 'REPÈRES', hl: 4.6, h: 1.9, cols: [{ t: 'Rep.', w: 11, a: 'c' }, { t: 'Élément', w: 26, a: 'c' }, { t: 'Désignation', w: 129, a: 'g' }], lignes: lignes.map(l => [l.repere, l.element, l.desig]) };
  const N = notes.flatMap((l, i) => (i ? couperNote(l, 80) : [l])), ht = (td.lignes.length + 2) * td.hl, hn = N.length * 2.1 * 1.6;
  const F = composer({ titre, cartouche, rangees: [[vue]], groupes: [{ vues: [vue], cible: 50, min: 20 }], colonne: { largeur: wb + 3, hauteur: 2 + hb + 6 + ht + 6 + hn + 4 },
    poser: (F, [x, y]) => { const xb = F.W - 10 - wb - 3; placerBordereau(F, lignes, [xb, y + 2 + ht + 6, wb, hb]); F.tableau(td, xb, y + 2); F.note(N, xb, y + 2 + ht + 6 + hb + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || '1/' + vue.echelle;
  F.nomenclature = N0;
  return F;
}

export function planNomenclatureContinues(out, cartouche = {}, { nom = 'POUTRES RENDUES CONTINUES' } = {}) {
  const N0 = nomenclatureContinues(out), f = out.p.forme, V = new Vue('COUPE COURANTE : POUTRE ET HOURDIS', { echelle: 20 });
  const P = [[-f.bb / 2, 0], [f.bb / 2, 0], [f.bb / 2, f.hb], [f.bw / 2, f.hb], [f.bw / 2, f.H - f.ht], [f.bt / 2, f.H - f.ht], [f.bt / 2, f.H], [-f.bt / 2, f.H], [-f.bt / 2, f.H - f.ht], [-f.bw / 2, f.H - f.ht], [-f.bw / 2, f.hb], [-f.bb / 2, f.hb]];
  V.poly('COFFRAGE', P, true); V.hachure(P); V.poly('VUES', [[-f.bh / 2, f.H], [f.bh / 2, f.H], [f.bh / 2, f.H + f.hd], [-f.bh / 2, f.H + f.hd]], true);
  const c = 0.03; V.poly('ACIERS', [[-f.bw / 2 + c, f.H + f.hd - 0.05], [-f.bw / 2 + c, c], [f.bw / 2 - c, c], [f.bw / 2 - c, f.H + f.hd - 0.05]]);
  V.poly('ACIERS', [[-f.bb / 2 + c, c], [f.bb / 2 - c, c], [f.bb / 2 - c, f.hb - c], [-f.bb / 2 + c, f.hb - c]], true);
  V.poly('ACIERS', [[-f.bh / 2 + c, f.H + f.hd - c], [f.bh / 2 - c, f.H + f.hd - c]]); V.poly('ACIERS', [[-f.bh / 2 + c, f.H + c], [f.bh / 2 - c, f.H + c]]);
  V.repere([f.bb / 2 + 0.2, 0.05], '1', [f.bb / 2 - c - 0.03, c + 0.02]); V.repere([f.bt / 2 + 0.2, f.H * 0.6], '2', [f.bw / 2 - c, f.H * 0.6]); V.repere([-f.bb / 2 - 0.2, f.hb / 2], '3', [-f.bb / 2 + c, f.hb / 2]);
  V.coteH([-f.bh / 2, f.H + f.hd], [f.bh / 2, f.H + f.hd], f.H + f.hd + 0.15); V.coteV([-f.bt / 2, 0], [-f.bt / 2, f.H], -f.bt / 2 - 0.15);
  const notes = ['NOTES', `1. Nomenclature de l'ouvrage complet : ${N0.n} travée(s) de ${fr(N0.L)} m à ${N0.nP} poutres, hourdis et ${N0.n - 1} clavage(s) sur appui.`,
    '2. Talon et étriers : ouvrage terminé (ELU avec effets hyperstatiques, effort tranchant) ; continuité sur appui : A_s supérieur nécessaire, prolongé de 0,25 L + l_bd de part et d\'autre (EN 1992-1-1 § 9.2.1.3).',
    '3. Hourdis : section minimale (EC2 § 9.3.1.1) ; la flexion locale sous les roues se calcule par l\'onglet Tablier à poutres et peut augmenter ces sections.',
    `4. Masse totale ${milliers(N0.R.masse)} kg, soit ${fr(N0.ratio, 0)} kg/m³ de béton des poutres et du hourdis. Aciers HA B500B.`];
  return feuilleNomenclature({ titre: `${nom} — NOMENCLATURE DES ARMATURES`, N0, notes, vue: V, cartouche });
}

export function planNomenclatureVoussoir(out, cartouche = {}, { nom = 'PONT PAR ENCORBELLEMENTS' } = {}) {
  const N0 = nomenclatureVoussoir(out), K = out.p.caisson, h = out.p.hc, ti = K.tic, xw = K.Bi / 2, V = new Vue('COUPE D\'UN VOUSSOIR COURANT (CLÉ) : CADRE TRANSVERSAL', { echelle: 50 });
  const ext = [[-K.B / 2, 0], [K.B / 2, 0], [K.B / 2, -K.ts], [xw, -K.ts], [xw, -h], [-xw, -h], [-xw, -K.ts], [-K.B / 2, -K.ts]];
  const int = [[-xw + K.bw, -K.ts], [xw - K.bw, -K.ts], [xw - K.bw, -h + ti], [-xw + K.bw, -h + ti]];
  V.poly('COFFRAGE', ext, true); V.poly('COFFRAGE', int, true); V.hachure([...ext, ext[0], int[0], ...int.slice(1).reverse(), int[0]]);
  const c = 0.04;
  V.poly('ACIERS', [[-K.B / 2 + c, -c], [K.B / 2 - c, -c]]); V.poly('ACIERS', [[-xw + K.bw - c, -K.ts + c], [xw - K.bw + c, -K.ts + c]]);
  for (const s of [-1, 1]) { V.poly('ACIERS', [[s * (xw - c), -c], [s * (xw - c), -h + c]]); V.poly('ACIERS', [[s * (xw - K.bw + c), -K.ts + c], [s * (xw - K.bw + c), -h + ti - c]]); }
  V.poly('ACIERS', [[-xw + c, -h + c], [xw - c, -h + c]]); V.poly('ACIERS', [[-xw + K.bw - c, -h + ti - c], [xw - K.bw + c, -h + ti - c]]);
  V.repere([K.B / 2 - 0.5, 0.45], '1', [K.B / 2 - 0.8, -c]); V.repere([0, -K.ts - 0.45], '2', [0.3, -K.ts + c]); V.repere([xw + 0.5, -h / 2], '3', [xw - c, -h / 2]);
  V.repere([xw - K.bw - 0.5, -h / 2], '4', [xw - K.bw + c, -h / 2]); V.repere([0.6, -h - 0.45], '5', [0.6, -h + c]); V.repere([-0.6, -h + ti + 0.45], '6', [-0.6, -h + ti - c]);
  V.coteH([-K.B / 2, 0], [K.B / 2, 0], 0.5); V.coteV([xw, 0], [xw, -h], xw + 1.0);
  const notes = ['NOTES', `1. Voussoir courant de ${fr(N0.lv)} m à la section de la clé (h = ${fr(h)} m) ; les voussoirs plus hauts demandent des cadres d'âme plus longs (même pas).`,
    '2. Cadre transversal : sections par mètre de la flexion transversale du caisson (distortion répartie par le gauchissement et les diaphragmes) ; âmes : le plus grand de la flexion du cadre et d\'un brin d\'étrier de l\'effort tranchant (A_sw/s / 4).',
    '3. Longitudinales : peau HA12 / 15 sur toutes les faces (minimum), complément inférieur de l\'ouvrage terminé à la clé ; recouvrements aux joints de voussoirs (l₀, § 8.7.3).',
    `4. Masse ${milliers(N0.R.masse)} kg par voussoir, soit ${fr(N0.ratio, 0)} kg/m³. Frettage des ancrages et bossages : selon l'agrément du procédé.`];
  return feuilleNomenclature({ titre: `${nom} — NOMENCLATURE D'UN VOUSSOIR COURANT`, N0, notes, vue: V, cartouche });
}
