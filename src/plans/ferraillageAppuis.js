/**
 * Plans de ferraillage des appuis : une feuille par ligne d'appui. Les sections d'acier sont celles du calcul des appuis
 * (st.supports.lines[i], Eurocodes ou, à défaut, BAEL) ; les dispositions suivent les ferraillages types du Sétra,
 * PP 73 pièce 1.3.2 « Calculs complémentaires — Ferraillages types » (oct. 1977) :
 *  - fûts : armatures verticales ≥ 0,2 % du béton, espacement ≤ 40 cm ; ≥ 20 cm² par colonne, poteau ou voile < 1 m² ;
 *    ceintures ≥ 0,05 % (0,1 % et 20 cm en zone de recouvrement) (§ 1.1.2) ; colonnes de piles-culées ≈ 2 % (1.1.3 § 2.3.2),
 *    cadres Ø 12 / 30 cm, 15 cm en zone de recouvrement (§ 2.1) ;
 *  - chevêtre : 0,5 % pour l'ensemble des nappes, cadres ≥ 0,2 %, t < 20 cm (§ 2.2.5.1) ;
 *  - garde-grève : ferraillages types jusqu'à 3 m (§ 2.3.1), complétés par le calcul ;
 *  - murs en retour : armatures de suspension en tête et armatures horizontales de la moitié supérieure (§ 3.4) ;
 *  - semelles : 0,12 % par nappe au moins (§ 1.1.1) ; semelles sur pieux : bandes au droit des pieux (ch. 4).
 * Longueurs d'ancrage et de recouvrement : EN 1992-1-1 § 8.4 et 8.7 (src/rebar.js, anchorage). Bordereau ISO 4066.
 */
import { Vue, Feuille, fmtCote } from './dessin.js';
import { geometrieAppui, vueElevation, vueCoupe } from './appuis.js';
import { longueurCoupe, rayonCintrage, croquisForme, recapitulatif } from './bordereau.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { chooseBars, areaOf, anchorage, massPerM } from '../rebar.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const esp = s => fr(s * 100, Math.abs(s * 100 - Math.round(s * 100)) > 1e-6 ? 1 : 0);
const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;
const LMAX = 12;   // longueur commerciale (m)

/** n barres de diamètre φ fournissant As sur une largeur utile w (entraxe libre ≥ 6 cm). */
function barresN(As, w, { phis = [12, 14, 16, 20, 25, 32], nMin = 2 } = {}) {
  let best = null;
  for (const phi of phis) {
    const n = Math.max(nMin, Math.ceil(As / areaOf(phi) - 1e-9));
    if (n > 1 && w / (n - 1) < 0.06 + phi / 1000) continue;
    const A = n * areaOf(phi);
    if (!best || A < best.As - 1e-9) best = { phi, n, As: A };
  }
  return best || { phi: 32, n: Math.ceil(As / areaOf(32)), As: Math.ceil(As / areaOf(32)) * areaOf(32), insuffisant: true };
}
/** Barres sur le pourtour d'un cercle (colonne, pieu) : n ≥ 6, φ ≥ 14. */
function barresCercle(As, D, c) {
  let best = null;
  for (const phi of [14, 16, 20, 25, 32]) {
    const n = Math.max(6, Math.ceil(As / areaOf(phi) - 1e-9)), s = Math.PI * (D - 2 * c - phi / 1000) / n;
    if (s < 0.07 + phi / 1000) continue;
    const A = n * areaOf(phi); if (!best || A < best.As - 1e-9) best = { phi, n, As: A };
  }
  return best || { phi: 32, n: 6, As: 6 * areaOf(32) };
}

/**
 * Repères d'armature d'un appui : { mark, elem, label, phi, code, dims {A, B, C} (mm), nombre, s?, pos (dessin) }.
 * Chaque repère porte la section calculée (req) et fournie (prov) quand il en découle.
 */
export function reperesAppui(st, i) {
  const A = geometrieAppui(st, i), L = st.supports.lines[i], R = L.EC || L.BAEL, code = L.EC ? 'EC' : 'BAEL';
  const sp = (st.supports.spLigne && st.supports.spLigne[i]) || st.supports.sp, mat = sp.mat, c = mat.c, cS = c + 0.02;
  const anc = phi => anchorage(phi, { fck: mat.fck, fyk: mat.fyk, h: 1 });
  const out = []; let k = 0;
  const add = m => { const r = { mark: ++k, ...m }; out.push(r); return r; };
  const w = A.width;
  // ---------------------------------------------------------------- fondation
  const F = R.found, hs = A.hs, B = A.B, Lf = A.Lf;
  // nappe supérieure minimale (0,12 %, PP73 1.3.2 § 1.1.1) : deux repères, // L et // B
  const nappeSup = top => {
    add({ elem: 'semelle', label: 'Semelle — nappe supérieure // L (0,12 %)', phi: top.phi, s: top.s, code: '00', dims: { A: (Lf - 2 * cS) * 1000 }, nombre: Math.floor((B - 2 * cS) / top.s + 1e-9) + 1, prov: top.As, pos: 'semSup' });
    add({ elem: 'semelle', label: 'Semelle — nappe supérieure // B (0,12 %)', phi: top.phi, s: top.s, code: '00', dims: { A: (B - 2 * cS) * 1000 }, nombre: Math.floor((Lf - 2 * cS) / top.s + 1e-9) + 1, prov: top.As, pos: 'semSupB' });
  };
  if (!A.pieux) {
    const main = chooseBars(Math.max(F.AsLong / Lf, 0.0012 * hs), { phiMin: 12, phiMax: 32, sMax: 0.25, sMin: 0.10 });
    const rep = chooseBars(Math.max(F.AsTransPerM, 0.0012 * hs), { phiMin: 10, phiMax: 25, sMax: 0.25, sMin: 0.10 });
    const top = chooseBars(0.0012 * hs, { phiMin: 10, phiMax: 20, sMax: 0.25, sMin: 0.15 });
    const ret = Math.max(0, hs - 2 * cS);
    add({ elem: 'semelle', label: 'Semelle — nappe inférieure principale (// B)', phi: main.phi, s: main.s, code: '21', dims: { A: ret * 1000, B: (B - 2 * cS) * 1000, C: ret * 1000 }, nombre: Math.floor((Lf - 2 * cS) / main.s + 1e-9) + 1, req: F.AsLong / Lf, prov: main.As, pos: 'semInfB' });
    add({ elem: 'semelle', label: 'Semelle — nappe inférieure de répartition (// L)', phi: rep.phi, s: rep.s, code: '00', dims: { A: (Lf - 2 * cS) * 1000 }, nombre: Math.floor((B - 2 * cS) / rep.s + 1e-9) + 1, req: F.AsTransPerM, prov: rep.As, pos: 'semInfL' });
    nappeSup(top);
  } else {
    const t = F.tie || null, nP = A.nP, nF = A.nF;
    if (t && nF === 2) {
      const tb = barresN(t.A1, t.band - 2 * c, { phis: [16, 20, 25, 32], nMin: 4 });
      add({ elem: 'semelle', label: 'Semelle — tirants au droit des pieux (bandes)', phi: tb.phi, code: '21', dims: { A: (hs - 2 * cS) * 1000, B: (B - 2 * cS) * 1000, C: (hs - 2 * cS) * 1000 }, nombre: tb.n * nP, req: t.A1, prov: tb.As, pos: 'semInfB', note: `${tb.n} barres par bande de ${fr(t.band)} m, ${nP} bandes` });
    } else {
      const main = chooseBars(Math.max(0.0012 * hs, (F.capFiles && F.capFiles.A ? F.capFiles.A / B : 0)), { phiMin: 14, phiMax: 32, sMax: 0.20, sMin: 0.10 });
      add({ elem: 'semelle', label: 'Semelle — nappe inférieure (// B)', phi: main.phi, s: main.s, code: '21', dims: { A: (hs - 2 * cS) * 1000, B: (B - 2 * cS) * 1000, C: (hs - 2 * cS) * 1000 }, nombre: Math.floor((Lf - 2 * cS) / main.s + 1e-9) + 1, prov: main.As, pos: 'semInfB' });
    }
    const rep = chooseBars(Math.max(t ? t.A2 : 0, 0.0012 * hs), { phiMin: 12, phiMax: 25, sMax: 0.25, sMin: 0.10 });
    add({ elem: 'semelle', label: 'Semelle — répartition inférieure (// L)', phi: rep.phi, s: rep.s, code: '00', dims: { A: (Lf - 2 * cS) * 1000 }, nombre: Math.floor((B - 2 * cS) / rep.s + 1e-9) + 1, req: t ? t.A2 : null, prov: rep.As, pos: 'semInfL' });
    const top = chooseBars(0.0012 * hs, { phiMin: 10, phiMax: 20, sMax: 0.25, sMin: 0.15 });
    nappeSup(top);
    // pieux : cage longitudinale (ancrée dans la semelle), cerces
    const cp = 0.07, lb = barresCercle(Math.max(F.As || 0, F.Amin || 0), A.Dp, cp), a = anc(lb.phi);
    const Lp = A.Lp + Math.min(a.lbd, hs - 0.10);
    const nPieces = Math.ceil((Lp - 1e-9) / LMAX), Lpc = nPieces > 1 ? (Lp + (nPieces - 1) * a.l0) / nPieces : Lp;
    add({ elem: 'pieux', label: `Pieux Ø ${fr(A.Dp)} — armatures longitudinales${nPieces > 1 ? ` (${nPieces} tronçons, recouvrement ${fr(a.l0)})` : ''}`, phi: lb.phi, code: '00', dims: { A: Lpc * 1000 }, nombre: lb.n * nF * nP * nPieces, req: F.AsReq, prov: lb.As, pos: 'pieuL', n: lb.n });
    const sh = F.shear && F.shear.ELU ? F.shear.ELU : {}, At = Math.max(sh.AtS || 0, sh.AtSmin || 0);
    const phiT = Math.max(10, Math.ceil(lb.phi / 4 / 2) * 2), sT = Math.min(0.20, At > 0 ? 2 * areaOf(phiT) / At : 0.20, 12 * lb.phi / 1000 * 1.5);
    const sT2 = [0.10, 0.125, 0.15, 0.175, 0.20].filter(v => v <= sT + 1e-9).pop() || 0.10, Dc = A.Dp - 2 * cp + phiT / 1000;
    add({ elem: 'pieux', label: 'Pieux — cerces', phi: phiT, s: sT2, code: '99', dims: { A: (Math.PI * Dc + anc(phiT).l0) * 1000 }, nombre: nF * nP * (Math.floor(A.Lp / sT2) + 1), prov: 2 * areaOf(phiT) / sT2, pos: 'pieuT' });
  }
  // ---------------------------------------------------------------- fût, mur, colonnes
  const Sh = R.shaft || {};
  const attentes = (phi, nombre, label, pos) => {
    const a = anc(phi), ret = Math.max(0.30, 12 * phi / 1000);
    return add({ elem: 'attentes', label, phi, code: '11', dims: { A: (hs - cS + a.l0) * 1000, B: ret * 1000 }, nombre, pos, l0: a.l0 });
  };
  const verticales = (phi, H, nombre, label, pos, extra = {}) => {
    const a = anc(phi), n = Math.ceil((H - 1e-9) / LMAX), Lpc = n > 1 ? (H + (n - 1) * a.l0) / n : H;
    return add({ elem: 'fût', label: label + (n > 1 ? ` (${n} tronçons)` : ''), phi, code: '00', dims: { A: Lpc * 1000 }, nombre: nombre * n, pos, ...extra });
  };
  if (A.kind === 'pile' && A.type !== 'colonnes') {
    const Lv = A.Lv, b = A.b, H = A.H, Asf = Math.max(Sh.As || 0, 0.002 * Lv * b) / 2;
    const v = chooseBars(Asf / Lv, { phiMin: 12, phiMax: 32, sMax: 0.25, sMin: 0.10 }), nv = 2 * (Math.floor((Lv - 2 * c) / v.s + 1e-9) + 1);
    attentes(v.phi, nv, 'Voile — attentes dans la semelle', 'attV');
    verticales(v.phi, H - c, nv, 'Voile — armatures verticales (2 faces)', 'verV', { s: v.s, req: Sh.AsReq, prov: v.As * Lv * 2 });
    const hreq = Math.max(0.25 * v.As, 0.0005 * b / 2 * 1, 0.0005 * b), h = chooseBars(hreq, { phiMin: 10, phiMax: 20, sMax: 0.25, sMin: 0.15 });
    add({ elem: 'fût', label: 'Voile — armatures horizontales (U par face, recouvrement aux extrémités)', phi: h.phi, s: h.s, code: '21', dims: { A: (b - 2 * c) * 1000, B: (Lv - 2 * c) * 1000, C: (b - 2 * c) * 1000 }, nombre: 2 * (Math.floor((H - 2 * c) / h.s) + 1), prov: h.As, pos: 'horV' });
    const ep = chooseBars(0, { phiMin: 8, phiMax: 10, sMax: 0.25, sMin: 0.25 });
    add({ elem: 'fût', label: 'Voile — épingles (4 par m²)', phi: 8, code: '21', dims: { A: 80, B: (b - 2 * c) * 1000, C: 80 }, nombre: Math.ceil(4 * Lv * H), pos: 'epV' });
    void ep;
  } else if (A.nCol) {
    const D = A.D, Hc = A.kind === 'pile' ? A.H : A.Hm, Asc = Math.max(Sh.As || 0, 20e-4), lb = barresCercle(Asc, D, c);
    attentes(lb.phi, lb.n * A.nCol, `Colonnes Ø ${fr(D)} — attentes dans la semelle`, 'attC');
    verticales(lb.phi, Hc + Math.min(anc(lb.phi).lbd, A.hc - c), lb.n * A.nCol, `Colonnes Ø ${fr(D)} — armatures longitudinales (${lb.n} par colonne)`, 'verC', { req: Sh.AsReq, prov: lb.As, n: lb.n });
    const phiT = Math.max(10, Math.ceil(lb.phi / 4 / 2) * 2), sT = [0.15, 0.20, 0.25, 0.30].filter(v => v <= Math.min(0.30, 20 * lb.phi / 1000, D) + 1e-9).pop() || 0.15;
    add({ elem: 'fût', label: 'Colonnes — cerces (resserrées à s/2 en zone de recouvrement)', phi: phiT, s: sT, code: '99', dims: { A: (Math.PI * (D - 2 * c + phiT / 1000) + anc(phiT).l0) * 1000 }, nombre: A.nCol * (Math.floor(Hc / sT) + 1 + Math.ceil(anc(lb.phi).l0 / sT)), pos: 'cerC' });
  } else if (A.kind === 'culee') {   // culée remblayée : mur de front (calcul par bande de 1 m)
    const em = A.C.em, Hm = A.Hm - A.hSom, Asf = Math.max(Sh.As || 0, 0.002 * em) / 2;
    const v = chooseBars(Asf, { phiMin: 12, phiMax: 32, sMax: 0.25, sMin: 0.10 }), nv = 2 * (Math.floor((w - 2 * c) / v.s + 1e-9) + 1);
    attentes(v.phi, nv, 'Mur de front — attentes dans la semelle', 'attM');
    verticales(v.phi, Hm + Math.min(anc(v.phi).lbd, A.hSom - c), nv, 'Mur de front — armatures verticales (2 faces)', 'verM', { s: v.s, req: Sh.AsReq, prov: v.As });
    const h = chooseBars(Math.max(0.25 * v.As, 0.001 * em / 2), { phiMin: 10, phiMax: 20, sMax: 0.25, sMin: 0.15 });
    add({ elem: 'fût', label: 'Mur de front — armatures horizontales (2 faces)', phi: h.phi, s: h.s, code: '21', dims: { A: (em - 2 * c) * 1000, B: (w - 2 * c) * 1000, C: (em - 2 * c) * 1000 }, nombre: 2 * (Math.floor(Hm / h.s) + 1), prov: h.As, pos: 'horM' });
  }
  // ---------------------------------------------------------------- tête : chevêtre ou sommier
  if (A.hc > 0 || (A.kind === 'culee' && A.type === 'remblayee')) {
    const cap = R.cap || null, sommier = A.kind === 'culee' && A.type === 'remblayee';
    const bT = sommier ? A.xSom[1] - A.xSom[0] : A.kind === 'pile' ? A.lc : A.xChev[1] - A.xChev[0], hT = sommier ? A.hSom : A.hc;
    const AsMin = 0.0025 * bT * hT;   // 0,5 % pour l'ensemble des nappes (PP73 1.3.2 § 2.2.5.1)
    const top = barresN(Math.max(cap ? cap.AsTop : 0, AsMin), bT - 2 * c, { phis: [16, 20, 25, 32], nMin: 4 });
    const bot = barresN(Math.max(cap ? cap.AsBot : 0, AsMin), bT - 2 * c, { phis: [16, 20, 25, 32], nMin: 4 });
    const nom = sommier ? 'Sommier' : 'Chevêtre';
    add({ elem: 'tête', label: `${nom} — armatures supérieures`, phi: top.phi, code: '21', dims: { A: (hT - 2 * c) * 1000 * 0.6, B: (w - 2 * c) * 1000, C: (hT - 2 * c) * 1000 * 0.6 }, nombre: top.n, req: cap ? cap.AsTop : AsMin, prov: top.As, pos: 'chevSup', n: top.n });
    add({ elem: 'tête', label: `${nom} — armatures inférieures`, phi: bot.phi, code: '21', dims: { A: (hT - 2 * c) * 1000 * 0.6, B: (w - 2 * c) * 1000, C: (hT - 2 * c) * 1000 * 0.6 }, nombre: bot.n, req: cap ? cap.AsBot : AsMin, prov: bot.As, pos: 'chevInf', n: bot.n });
    const AtMin = Math.max(cap && cap.AtMin ? cap.AtMin : 0, 0.002 * bT);   // par mètre de chevêtre
    // cadres : 1 à 3 cadres par cours (2 brins chacun), Ø 10 à 16, t ≤ 20 cm (PP73 : 2 cadres HA 10 par cours, 5 cours/m)
    let cad = null;
    for (const nc of [1, 2, 3]) for (const phi of [10, 12, 14, 16]) for (const t of [0.20, 0.175, 0.15, 0.125, 0.10]) {
      const prov = 2 * nc * areaOf(phi) / t; if (prov + 1e-9 < AtMin) continue;
      if (!cad || prov < cad.prov - 1e-9) cad = { nc, phi, t, prov };
    }
    cad = cad || { nc: 3, phi: 16, t: 0.10, prov: 6 * areaOf(16) / 0.10 };
    const bc = cad.nc > 1 ? (bT - 2 * c) / cad.nc + 0.05 : bT - 2 * c;
    add({ elem: 'tête', label: `${nom} — cadres (${cad.nc} par cours)`, phi: cad.phi, s: cad.t, code: '51', dims: { A: (hT - 2 * c) * 1000, B: bc * 1000, C: 10 * cad.phi }, nombre: cad.nc * (Math.floor((w - 2 * c) / cad.t) + 1), req: AtMin, prov: cad.prov, pos: 'chevCad' });
  }
  // ---------------------------------------------------------------- garde-grève, murs en retour (culées)
  if (A.kind === 'culee') {
    const gg = R.gg || {}, h = A.hGG, e = 0.30;
    // ferraillage type PP73 § 2.3.1 (h ≤ 3 m), complété par le calcul
    const typ = h <= 2 ? { ar: areaOf(12) / 0.10, av: areaOf(12) / 0.20, hz: areaOf(10) / 0.15 } : { ar: areaOf(14) / 0.12, av: areaOf(14) / 0.24, hz: areaOf(10) / 0.15 };
    const ar = chooseBars(Math.max(gg.As || 0, typ.ar), { phiMin: 12, phiMax: 25, sMax: 0.20, sMin: 0.10 });
    const av = chooseBars(Math.max(gg.AsAvant || 0, typ.av), { phiMin: 12, phiMax: 25, sMax: 0.25, sMin: 0.10 });
    const hz = chooseBars(typ.hz, { phiMin: 10, phiMax: 12, sMax: 0.15, sMin: 0.15 });
    const aAr = anc(ar.phi);
    add({ elem: 'garde-grève', label: 'Garde-grève — face arrière (côté remblai)', phi: ar.phi, s: ar.s, code: '11', dims: { A: (h - c + aAr.lbd) * 1000, B: (e - 2 * c) * 1000 }, nombre: Math.floor((w - 2 * c) / ar.s) + 1, req: gg.As, prov: ar.As, pos: 'ggAr' });
    add({ elem: 'garde-grève', label: 'Garde-grève — face avant', phi: av.phi, s: av.s, code: '00', dims: { A: (h - c + anc(av.phi).lbd) * 1000 }, nombre: Math.floor((w - 2 * c) / av.s) + 1, req: gg.AsAvant, prov: av.As, pos: 'ggAv' });
    add({ elem: 'garde-grève', label: 'Garde-grève — armatures horizontales (2 faces)', phi: hz.phi, s: hz.s, code: '00', dims: { A: (w - 2 * c) * 1000 }, nombre: 2 * (Math.floor((h - 2 * c) / hz.s) + 1), prov: hz.As, pos: 'ggH' });
    const rt = R.retour || {}, Lr = A.Lret, hh = A.Hm + A.hGG, er = A.eRet;
    if (Lr > 0) {
      const sus = barresN(Math.max(rt.AsV || 0, 2 * areaOf(16)), er - 2 * c, { phis: [16, 20, 25], nMin: 2 });
      const aS = anc(sus.phi);
      add({ elem: 'murs en retour', label: 'Murs en retour — armatures de suspension en tête (×2 murs)', phi: sus.phi, code: '11', dims: { A: (Lr - c + aS.lbd) * 1000, B: 300 }, nombre: 2 * sus.n, req: rt.AsV, prov: sus.As, pos: 'retS' });
      const hzr = chooseBars(Math.max((rt.AsH || 0) / (hh / 2), 2e-4), { phiMin: 10, phiMax: 20, sMax: 0.20, sMin: 0.10 });
      add({ elem: 'murs en retour', label: 'Murs en retour — horizontales de la moitié supérieure, face remblai (×2)', phi: hzr.phi, s: hzr.s, code: '11', dims: { A: (Lr - c + anc(hzr.phi).lbd) * 1000, B: 200 }, nombre: 2 * (Math.floor(hh / 2 / hzr.s) + 1), req: rt.AsH ? rt.AsH / (hh / 2) : null, prov: hzr.As, pos: 'retH' });
      const mr = chooseBars(2e-4, { phiMin: 10, phiMax: 12, sMax: 0.25, sMin: 0.25 });
      add({ elem: 'murs en retour', label: 'Murs en retour — treillis minimal (2 faces, 2 sens, ×2)', phi: mr.phi, s: mr.s, code: '00', dims: { A: Lr * 1000 }, nombre: 2 * 2 * (Math.floor(hh / mr.s) + 1 + Math.floor(Lr / mr.s) + 1), prov: mr.As, pos: 'retM', note: 'barres de longueur L et h' });
    }
  }
  // ---------------------------------------------------------------- voile frontal (culée apparente sur colonnes)
  if (A.kind === 'culee' && A.type === 'apparente' && A.C.hv > 0) {
    const hv = A.C.hv, ev = 0.30, hcT = Math.max(A.hc - c, 0.2);
    // minimum des voiles (PP73 1.3.2 : 0,2 % pour les deux faces), verticales ancrées dans le chevêtre
    const vv = chooseBars(0.001 * ev, { phiMin: 10, phiMax: 16, sMax: 0.20, sMin: 0.15 });
    add({ elem: 'voile frontal', label: 'Voile frontal — verticales (2 faces), ancrées dans le chevêtre', phi: vv.phi, s: vv.s, code: '00', dims: { A: (hv - c + Math.min(anc(vv.phi).lbd, hcT)) * 1000 }, nombre: 2 * (Math.floor((w - 2 * c) / vv.s + 1e-9) + 1), req: 0.001 * ev, prov: vv.As, pos: 'vfV' });
    const vh = chooseBars(Math.max(0.5 * vv.As, 0.0005 * ev), { phiMin: 10, phiMax: 12, sMax: 0.20, sMin: 0.20 });
    add({ elem: 'voile frontal', label: 'Voile frontal — horizontales (U par face)', phi: vh.phi, s: vh.s, code: '21', dims: { A: (ev - 2 * c) * 1000, B: (w - 2 * c) * 1000, C: (ev - 2 * c) * 1000 }, nombre: 2 * (Math.floor((hv - 2 * c) / vh.s + 1e-9) + 1), prov: vh.As, pos: 'vfH' });
  }
  // ---------------------------------------------------------------- frettes et aciers d'éclatement sous appareils
  // pression localisée (calcul de la tête d'appui, onglet Appuis) : frettage de surface A_s = 0,04 R / f_su par
  // appareil ; éclatement dans les plans Δ′ (épaisseur de l'appui) et Δ (ligne d'appareils), réparti de 0,1 d à d
  const hk = R.headChk;
  if (hk && !hk.error && hk.split && hk.split.planes) {
    const sp2 = hk.split, nb = A.ap.yb.length, [pD1, pD] = sp2.planes;
    const choisir = (As, nMin, brins) => {
      let best = null;
      for (const phi of [10, 12, 14, 16]) for (let n = nMin; n <= 8; n++) { const prov = brins * n * areaOf(phi); if (prov + 1e-9 >= As && (!best || prov < best.prov - 1e-9)) best = { phi, n, prov }; }
      return best || { phi: 16, n: 8, prov: brins * 8 * areaOf(16) };
    };
    const tete = sommierT => (sommierT ? [A.xSom[0], A.xSom[1]] : A.kind === 'pile' ? (A.type === 'colonnes' ? [-A.lc / 2, A.lc / 2] : [-A.bTop / 2, A.bTop / 2]) : [A.xChev[0], A.xChev[1]]);
    const [xa, xb] = tete(A.kind === 'culee' && A.type === 'remblayee'), dT = xb - xa;
    const hT = A.kind === 'culee' && A.type === 'remblayee' ? A.hSom : A.hc > 0 ? A.hc : Math.min(1.0, A.H || 1);
    const Lt = A.kind === 'pile' && A.type !== 'colonnes' ? A.Lv : w;
    // frettes : cadres horizontaux fermés autour de l'empreinte du bossage (2 brins par direction), lits espacés de 6 cm
    const f = choisir(sp2.As, 2, 2);
    const Af = Math.min(hk.ab + 0.10, dT - 2 * c), Bf = Math.min(hk.bb + 0.10, (hk.pitch || 9) - 0.10);
    add({ elem: 'tête', label: `Frettes de surface sous appareils (${f.n} lits par appareil, ${nb} appareils)`, phi: f.phi, code: '51', dims: { A: Af * 1000, B: Bf * 1000, C: 10 * f.phi }, nombre: f.n * nb, req: sp2.As, prov: f.prov, pos: 'fret', n: f.n, dA: Af, dB: Bf });
    // plan Δ′ : épingles en U traversant l'épaisseur de l'appui, sous chaque appareil
    const u = choisir(pD1.Ae, 2, 1), legU = Math.max(0.15, Math.min(0.30, Bf / 2));
    add({ elem: 'tête', label: `Éclatement plan Δ′ — U dans l'épaisseur (${u.n} par appareil, de ${fr(0.1 * pD1.d)} à ${fr(Math.min(pD1.d, hT))} m)`, phi: u.phi, code: '21', dims: { A: legU * 1000, B: (dT - 2 * c) * 1000, C: legU * 1000 }, nombre: u.n * nb, req: pD1.Ae, prov: u.prov, pos: 'eclP', n: u.n, z0: 0.1 * pD1.d, z1: Math.min(pD1.d, hT - c) });
    // plan Δ : barres filantes le long de la ligne d'appareils, deux faces, réparties en hauteur
    const e2 = choisir(pD.Ae, 2, 2);
    add({ elem: 'tête', label: `Éclatement plan Δ — filantes 2 faces (${e2.n} par face, de ${fr(0.1 * pD.d)} à ${fr(Math.min(pD.d, hT))} m)`, phi: e2.phi, code: '00', dims: { A: (Lt - 2 * c) * 1000 }, nombre: 2 * e2.n, req: pD.Ae, prov: e2.prov, pos: 'eclL', n: e2.n, z0: 0.1 * pD.d, z1: Math.min(pD.d, hT - c) });
  }
  // longueurs de coupe et masses
  for (const m of out) {
    const d = { A: r5(m.dims.A || 0), B: r5(m.dims.B || 0), C: r5(m.dims.C || 0) };
    m.dims = d; m.L = r25(longueurCoupe(m.code, d, m.phi));
    m.total = m.L / 1000 * m.nombre; m.masse = m.total * massPerM(m.phi);
  }
  return { A, marks: out, code, mat };
}

/** Lignes du bordereau (format de placerBordereau). */
const lignesBordereau = marks => marks.map(m => ({ repere: String(m.mark), mark: m.mark, phi: m.phi, code: m.code, A: m.dims.A, B: ['11', '21', '51'].includes(m.code) ? m.dims.B : null, C: ['21', '51'].includes(m.code) ? m.dims.C : null, L: m.L, nombre: m.nombre, total: m.total, masse: m.masse }));
const desig = m => (m.pos === 'fret' ? `${m.n} cadres HA${m.phi} / appareil` : m.pos === 'eclP' ? `${m.n} U HA${m.phi} / appareil` : m.pos === 'eclL' ? `${m.n} HA${m.phi} / face`
  : m.s ? `HA${m.phi} e=${esp(m.s)}` : `${m.n || m.nombre} HA${m.phi}`);

/* -------------------------------------------------------------------------------------- dessin des aciers */
function dessinerCoupe(A, marks) {
  const v = vueCoupe(A); v.titre = `COUPE DANS L'AXE DE L'OUVRAGE — ARMATURES — ${A.nom}`;
  v.ents = v.ents.filter(e => e.t !== 'hachure');
  const S = A.sgn, X = x => S * x, c = 0.05, cS = 0.07, M = p => marks.find(m => m.pos === p);
  const bulles = [];
  const bul = (m, p, cote = 1) => m && bulles.push({ m, p, cote });
  // semelle : nappe inférieure // B (ligne avec retours), répartition (points), nappe supérieure (ligne)
  const x0 = A.xFut - A.B / 2 + cS, x1 = A.xFut + A.B / 2 - cS, zi = A.zSS + cS, zs = A.zDS - cS;
  const mB = M('semInfB');
  if (mB) { v.poly('ACIERS', [[X(x0), zs - 0.05], [X(x0), zi], [X(x1), zi], [X(x1), zs - 0.05]]); bul(mB, [X(x0 + 0.4 * (x1 - x0)), zi], -1); }
  const mL = M('semInfL'); if (mL) { const n = Math.min(30, Math.floor((x1 - x0) / mL.s)); for (let k = 0; k <= n; k++) v.cercle('ACIERS_COUPES', [X(x0 + (x1 - x0) * k / n), zi + 0.03], 0.012, true); bul(mL, [X(x0 + 0.7 * (x1 - x0)), zi + 0.03], -1); }
  const mT = M('semSup'); if (mT) { v.poly('ACIERS', [[X(x0), zs], [X(x1), zs]]); bul(mT, [X(x0 + 0.2 * (x1 - x0)), zs], -1); }
  // fût / mur / colonne : verticales des deux faces, attentes avec retour
  const faces = A.kind === 'pile' && A.type !== 'colonnes' ? [[-A.b / 2, -A.bTop / 2], [A.b / 2, A.bTop / 2]]
    : A.nCol ? [[A.xFut - A.D / 2, A.xFut - A.D / 2], [A.xFut + A.D / 2, A.xFut + A.D / 2]]
      : A.kind === 'culee' ? [[A.xMur[0], A.xMur[0]], [A.xMur[1], A.xMur[1]]] : [];
  const zH = A.zT - A.hc - (A.kind === 'culee' && A.type === 'remblayee' ? A.hSom : 0);
  const mV = marks.find(m => /^ver/.test(m.pos)), mA = marks.find(m => /^att/.test(m.pos));
  faces.forEach(([xb, xt], k) => {
    const sg = k === 0 ? 1 : -1, xbb = xb + sg * (c + 0.01), xtt = xt + sg * (c + 0.01);
    if (mV) v.poly('ACIERS', [[X(xbb), A.zDS], [X(xtt), A.zT - c - (A.hc > 0 || A.kind === 'culee' ? 0.25 : 0)]]);
    if (mA) { const ret = mA.dims.B / 1000; v.poly('ACIERS', [[X(xbb - sg * ret + sg * 0.02), zi + 0.05], [X(xbb + sg * 0.02), zi + 0.05], [X(xbb + sg * 0.02), A.zDS + mA.l0]]); }
  });
  if (mV) bul(mV, [X(faces[1] ? faces[1][0] - c - 0.01 : 0), (A.zDS + zH) / 2]);
  if (mA) bul(mA, [X(faces[1] ? faces[1][0] - c + 0.01 : 0), A.zDS + 0.3]);
  const mH = marks.find(m => /^hor|^cer/.test(m.pos));
  if (mH && faces.length) { const n = Math.min(25, Math.floor((zH - A.zDS) / mH.s)); for (let k = 1; k < n; k++) { const z = A.zDS + (zH - A.zDS) * k / n; for (const [xb] of faces) v.cercle('ACIERS_COUPES', [X(xb + (xb < A.xFut ? 1 : -1) * (c + 0.03)), z], 0.01, true); } bul(mH, [X(faces[0][0] + c + 0.03), A.zDS + (zH - A.zDS) * 0.7], 1); }
  // tête
  const mS = M('chevSup'), mI = M('chevInf'), mC = M('chevCad');
  if (mC) {
    const sommier = A.kind === 'culee' && A.type === 'remblayee', xa = sommier ? A.xSom[0] : A.kind === 'pile' ? -A.lc / 2 : A.xChev[0], xb = sommier ? A.xSom[1] : A.kind === 'pile' ? A.lc / 2 : A.xChev[1];
    const hT = sommier ? A.hSom : A.hc, zb = A.zT - hT;
    v.poly('ACIERS', [[X(xa + c), zb + c], [X(xb - c), zb + c], [X(xb - c), A.zT - c], [X(xa + c), A.zT - c]], true);
    for (const [m, z] of [[mS, A.zT - c - 0.02], [mI, zb + c + 0.02]]) if (m) { const n = Math.min(m.n || 4, 12); for (let k = 0; k < n; k++) v.cercle('ACIERS_COUPES', [X(xa + c + 0.02 + (xb - xa - 2 * c - 0.04) * k / Math.max(1, n - 1)), z], 0.014, true); }
    bul(mS, [X((xa + xb) / 2), A.zT - c - 0.02]); bul(mI, [X((xa + xb) / 2), zb + c + 0.02], -1); bul(mC, [X(xb - c), (zb + A.zT) / 2]);
  }
  // frettes et éclatement sous appareils (appareil dans l'axe x = 0)
  const mF = M('fret'), mU = M('eclP'), mE = M('eclL');
  if (mF) {
    for (let k = 0; k < mF.n; k++) { const z = A.zT - c - 0.01 - k * 0.06; v.ligne('ACIERS', [X(-mF.dA / 2), z], [X(mF.dA / 2), z]); }
    bul(mF, [X(mF.dA / 2), A.zT - c - 0.01]);
  }
  const xt = A.kind === 'culee' && A.type === 'remblayee' ? A.xSom : A.kind === 'pile' ? (A.type === 'colonnes' ? [-A.lc / 2, A.lc / 2] : [-A.bTop / 2, A.bTop / 2]) : A.xChev;
  if (mU) {
    for (let k = 0; k < mU.n; k++) { const z = A.zT - mU.z0 - (mU.z1 - mU.z0) * (mU.n > 1 ? k / (mU.n - 1) : 0.5); v.poly('ACIERS', [[X(xt[0] + c + 0.03), z - 0.04], [X(xt[0] + c + 0.03), z], [X(xt[1] - c - 0.03), z], [X(xt[1] - c - 0.03), z - 0.04]]); }
    bul(mU, [X(xt[0] + 0.35 * (xt[1] - xt[0])), A.zT - (mU.z0 + mU.z1) / 2]);
  }
  if (mE) {
    for (let k = 0; k < mE.n; k++) { const z = A.zT - mE.z0 - (mE.z1 - mE.z0) * (mE.n > 1 ? k / (mE.n - 1) : 0.5); for (const xx of [xt[0] + c + 0.035, xt[1] - c - 0.035]) v.cercle('ACIERS_COUPES', [X(xx), z], 0.011, true); }
    bul(mE, [X(xt[1] - c - 0.035), A.zT - (mE.z0 + mE.z1) / 2]);
  }
  // voile frontal (culée apparente) : à l'arrière du chevêtre, sous celui-ci
  const vV = M('vfV'), vH = M('vfH');
  if (vV) {
    const zb = A.zT - A.hc, zv = zb - A.C.hv, xr = A.xGGar + c, xa2 = A.xGGar + 0.30 - c, za = zb + (vV.dims.A / 1000 - (A.C.hv - c));
    v.poly('ACIERS', [[X(xr), zv + c], [X(xr), za]]); v.poly('ACIERS', [[X(xa2), zv + c], [X(xa2), za]]);
    if (vH) { const n = Math.max(2, Math.floor((A.C.hv - 2 * c) / vH.s)); for (let k = 0; k <= n; k++) { const z = zv + c + (A.C.hv - 2 * c) * k / n; v.cercle('ACIERS_COUPES', [X(xr + 0.02), z], 0.009, true); v.cercle('ACIERS_COUPES', [X(xa2 - 0.02), z], 0.009, true); } }
    bul(vV, [X(xr), zv + A.C.hv * 0.4]); bul(vH, [X(xa2 - 0.02), zv + A.C.hv * 0.7]);
  }
  // garde-grève
  const gAr = M('ggAr'), gAv = M('ggAv'), gH = M('ggH');
  if (gAr) {
    const xr = A.xGGar + c, xv = A.xGGav - c, zt = A.zT + A.hGG - c, la = gAr.dims.A / 1000 - (A.hGG - c);
    v.poly('ACIERS', [[X(xv), zt], [X(xr), zt], [X(xr), A.zT - la]]);
    if (gAv) v.poly('ACIERS', [[X(xv), zt - 0.02], [X(xv), A.zT - (gAv.dims.A / 1000 - (A.hGG - c))]]);
    if (gH) { const n = Math.max(2, Math.floor((A.hGG - 2 * c) / gH.s)); for (let k = 0; k <= n; k++) { const z = A.zT + c + (A.hGG - 2 * c) * k / n; v.cercle('ACIERS_COUPES', [X(xr + 0.025), z], 0.009, true); v.cercle('ACIERS_COUPES', [X(xv - 0.025), z], 0.009, true); } }
    bul(gAr, [X(xr), A.zT + A.hGG * 0.6]); bul(gAv, [X(xv), A.zT + A.hGG * 0.4]); bul(gH, [X(xr + 0.025), A.zT + A.hGG * 0.2]);
  }
  // pieux
  const pL = M('pieuL'), pT = M('pieuT');
  if (pL) for (let f = 0; f < A.nF; f++) {
    const x = A.xFut + A.fileX(f), Lv = Math.min(A.Lp, 2.5);
    for (const sg of [-1, 1]) v.poly('ACIERS', [[X(x + sg * (A.Dp / 2 - 0.08)), A.zSS - Lv + 0.1], [X(x + sg * (A.Dp / 2 - 0.08)), A.zSS + Math.min(0.8, A.hs - 0.1)]]);
    if (pT) for (let z = A.zSS - 0.2; z > A.zSS - Lv + 0.1; z -= Math.max(0.15, pT.s)) v.ligne('ACIERS_COUPES', [X(x - A.Dp / 2 + 0.07), z], [X(x + A.Dp / 2 - 0.07), z]);
    if (f === A.nF - 1) { bul(pL, [X(x + A.Dp / 2 - 0.08), A.zSS - 1.2]); bul(pT, [X(x), A.zSS - 1.6]); }
  }
  // bulles : rangées à droite de la vue
  const E = v.etendue(), xb = E.x1 + 0.6;
  bulles.sort((a, b) => b.p[1] - a.p[1]).forEach((q, k, arr) => {
    const z = E.y1 - 0.2 - k * (E.y1 - E.y0 - 0.4) / Math.max(1, arr.length - 1);
    v.repere([xb, z], q.m.mark, q.p);
    v.texte('TEXTES', [xb + 0.25, z], desig(q.m), { h: 2.4, ancre: 'g', v: 'm' });
  });
  return v;
}

function dessinerElevation(A, marks) {
  const v = vueElevation(A); v.titre = `ÉLÉVATION — ARMATURES — ${A.nom}`;
  v.ents = v.ents.filter(e => e.t !== 'hachure' && e.calque !== 'COTES' && e.t !== 'coteH' && e.t !== 'coteV');
  const X = y => -y, c = 0.05, cS = 0.07, w = A.width, M = p => marks.find(m => m.pos === p), bulles = [];
  const bul = (m, p) => m && bulles.push({ m, p });
  // semelle : répartition // L (ligne), nappe // B (points)
  const zi = A.zSS + cS, zs = A.zDS - cS, l0 = -A.Lf / 2 + cS, l1 = A.Lf / 2 - cS;
  const mL = M('semInfL'); if (mL) { v.poly('ACIERS', [[l0, zi + 0.03], [l1, zi + 0.03]]); bul(mL, [l0 + 0.3 * (l1 - l0), zi + 0.03]); }
  const mB = M('semInfB'); if (mB) { const n = Math.min(40, mB.s ? Math.floor((l1 - l0) / mB.s) : 3 * A.nP); for (let k = 0; k <= n; k++) v.cercle('ACIERS_COUPES', [l0 + (l1 - l0) * k / n, zi], 0.012, true); bul(mB, [l0 + 0.6 * (l1 - l0), zi]); }
  const mT = M('semSup'); if (mT) v.poly('ACIERS', [[l0, zs], [l1, zs]]);
  // voile / mur : verticales (traits) et horizontales (traits)
  const mV = marks.find(m => /^ver/.test(m.pos)), mH = marks.find(m => /^hor/.test(m.pos)), mA = marks.find(m => /^att/.test(m.pos));
  const zH = A.zT - A.hc - (A.kind === 'culee' && A.type === 'remblayee' ? A.hSom : 0);
  if (A.kind === 'pile' && A.type !== 'colonnes' || (A.kind === 'culee' && A.type === 'remblayee')) {
    const Lc = A.kind === 'pile' ? A.Lv : w, y0 = -Lc / 2 + c, y1 = Lc / 2 - c;
    if (mV) { const n = Math.min(60, Math.floor((y1 - y0) / mV.s)); for (let k = 0; k <= n; k++) { const y = y0 + (y1 - y0) * k / n; v.ligne('ACIERS', [y, A.zDS], [y, zH - c]); } bul(mV, [y0 + 0.2 * (y1 - y0), (A.zDS + zH) / 2]); }
    if (mA) { const n = Math.min(60, Math.floor((y1 - y0) / mV.s)); for (let k = 0; k <= n; k += 2) { const y = y0 + (y1 - y0) * k / n + 0.03; v.ligne('ACIERS', [y, zi + 0.05], [y, A.zDS + mA.l0]); } bul(mA, [y0 + 0.75 * (y1 - y0), A.zDS + mA.l0 * 0.6]); }
    if (mH) { const n = Math.min(30, Math.floor((zH - A.zDS) / mH.s)); for (let k = 1; k < n; k++) { const z = A.zDS + (zH - A.zDS) * k / n; v.ligne('ACIERS', [y0, z], [y1, z]); } bul(mH, [y0 + 0.45 * (y1 - y0), A.zDS + (zH - A.zDS) * 0.55]); }
  } else if (A.nCol) {
    const cer = M('cerC');
    for (let j = 0; j < A.nCol; j++) {
      const y = X(A.colY(j));
      for (const sg of [-1, 1]) { v.ligne('ACIERS', [y + sg * (A.D / 2 - c - 0.01), A.zDS], [y + sg * (A.D / 2 - c - 0.01), A.zT - c - 0.25]); if (mA) v.ligne('ACIERS', [y + sg * (A.D / 2 - c - 0.04), zi + 0.05], [y + sg * (A.D / 2 - c - 0.04), A.zDS + mA.l0]); }
      if (cer) { const n = Math.min(30, Math.floor((zH - A.zDS) / cer.s)); for (let k = 1; k < n; k++) { const z = A.zDS + (zH - A.zDS) * k / n; v.ligne('ACIERS_COUPES', [y - A.D / 2 + c, z], [y + A.D / 2 - c, z]); } }
      if (j === A.nCol - 1) { bul(mV, [y + A.D / 2 - c - 0.01, (A.zDS + zH) / 2]); bul(cer, [y, A.zDS + (zH - A.zDS) * 0.3]); bul(mA, [y - A.D / 2 + c + 0.04, A.zDS + 0.3]); }
    }
  }
  // tête : armatures longitudinales et cadres
  const mS = M('chevSup'), mI = M('chevInf'), mC = M('chevCad');
  if (mS) {
    const hT = A.kind === 'culee' && A.type === 'remblayee' ? A.hSom : A.hc, zb = A.zT - hT, rt = Math.min(hT - 2 * c, mS.dims.A / 1000);
    v.poly('ACIERS', [[-w / 2 + c, A.zT - c - rt], [-w / 2 + c, A.zT - c], [w / 2 - c, A.zT - c], [w / 2 - c, A.zT - c - rt]]);
    v.poly('ACIERS', [[-w / 2 + c + 0.03, zb + c + rt], [-w / 2 + c + 0.03, zb + c], [w / 2 - c - 0.03, zb + c], [w / 2 - c - 0.03, zb + c + rt]]);
    if (mC) { const n = Math.min(60, Math.floor((w - 2 * c) / mC.s)); for (let k = 0; k <= n; k++) { const y = -w / 2 + c + (w - 2 * c) * k / n; v.ligne('ACIERS_COUPES', [y, zb + c], [y, A.zT - c]); } }
    bul(mS, [w / 4, A.zT - c]); bul(mI, [-w / 4, zb + c]); bul(mC, [0.15, zb + hT / 2]);
  }
  // frettes sous chaque appareil, filantes d'éclatement
  const mF = M('fret'), mE = M('eclL');
  if (mF) { for (const yb of A.ap.yb) for (let k = 0; k < mF.n; k++) { const z = A.zT - c - 0.01 - k * 0.06; v.ligne('ACIERS', [X(yb) - mF.dB / 2, z], [X(yb) + mF.dB / 2, z]); } bul(mF, [X(A.ap.yb[0]) + mF.dB / 2, A.zT - c - 0.01]); }
  if (mE) {
    const Lt = A.kind === 'pile' && A.type !== 'colonnes' ? A.Lv : w;
    for (let k = 0; k < mE.n; k++) { const z = A.zT - mE.z0 - (mE.z1 - mE.z0) * (mE.n > 1 ? k / (mE.n - 1) : 0.5); v.ligne('ACIERS', [-Lt / 2 + c, z], [Lt / 2 - c, z]); }
    bul(mE, [-Lt / 2 + 0.6 * Lt, A.zT - (mE.z0 + mE.z1) / 2]);
  }
  // voile frontal : verticales et horizontales
  const vV = M('vfV'), vH = M('vfH');
  if (vV) {
    const zb = A.zT - A.hc, zv = zb - A.C.hv, n = Math.min(60, Math.floor((w - 2 * c) / vV.s));
    for (let k = 0; k <= n; k += 2) { const y = -w / 2 + c + (w - 2 * c) * k / n; v.ligne('ACIERS', [y, zv + c], [y, zb + 0.2]); }
    if (vH) { const m = Math.max(2, Math.floor((A.C.hv - 2 * c) / vH.s)); for (let k = 0; k <= m; k++) { const z = zv + c + (A.C.hv - 2 * c) * k / m; v.ligne('ACIERS_COUPES', [-w / 2 + c, z], [w / 2 - c, z]); } }
    bul(vV, [-w / 2 + 0.15 * w, zv + A.C.hv * 0.5]); bul(vH, [w / 2 - 0.15 * w, zv + A.C.hv * 0.3]);
  }
  // garde-grève : verticales arrière (traits), horizontales
  const gAr = M('ggAr'), gH = M('ggH');
  if (gAr) {
    const n = Math.min(60, Math.floor((w - 2 * c) / gAr.s)); for (let k = 0; k <= n; k += 2) { const y = -w / 2 + c + (w - 2 * c) * k / n; v.ligne('ACIERS', [y, A.zT - 0.2], [y, A.zT + A.hGG - c]); }
    if (gH) { const m = Math.max(2, Math.floor((A.hGG - 2 * c) / gH.s)); for (let k = 0; k <= m; k++) { const z = A.zT + c + (A.hGG - 2 * c) * k / m; v.ligne('ACIERS_COUPES', [-w / 2 + c, z], [w / 2 - c, z]); } }
    bul(gAr, [-w / 3, A.zT + A.hGG * 0.6]); bul(gH, [w / 3, A.zT + A.hGG * 0.5]);
  }
  // pieux
  const pL = M('pieuL');
  if (pL) for (let k = 0; k < A.nP; k++) { const y = A.pieuY(k), Lv = Math.min(A.Lp, 2.5); for (const sg of [-1, 1]) v.ligne('ACIERS', [y + sg * (A.Dp / 2 - 0.08), A.zSS - Lv + 0.1], [y + sg * (A.Dp / 2 - 0.08), A.zSS + Math.min(0.8, A.hs - 0.1)]); }
  const E = v.etendue(), xb = E.x0 - 0.8;
  bulles.sort((a, b) => b.p[1] - a.p[1]).forEach((q, k, arr) => {
    const z = E.y1 - 0.2 - k * (E.y1 - E.y0 - 0.4) / Math.max(1, arr.length - 1);
    v.repere([xb, z], q.m.mark, q.p);
    v.texte('TEXTES', [xb - 0.25, z], desig(q.m), { h: 2.4, ancre: 'd', v: 'm' });
  });
  return v;
}

/** Sections : fût (voile, colonne ou mur), pieu, murs en retour (vue de face simplifiée). */
function dessinerSections(A, marks) {
  const vues = [], c = 0.05, M = p => marks.find(m => m.pos === p);
  const cercle = (titre, D, mL, mT, cc) => {
    const v = new Vue(titre), R = D / 2;
    v.cercle('COFFRAGE', [0, 0], R); v.cercle('ACIERS', [0, 0], R - cc);
    const n = mL.n || 8, r = R - cc - mL.phi / 2000 - 0.012;
    for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n + Math.PI / n; v.cercle('ACIERS_COUPES', [r * Math.cos(a), r * Math.sin(a)], Math.max(mL.phi / 2000, 0.01), true); }
    v.repere([R + 0.35, R * 0.5], mL.mark, [r, 0]); v.texte('TEXTES', [R + 0.6, R * 0.5], `${n} HA${mL.phi}`, { h: 2.4, ancre: 'g', v: 'm' });
    if (mT) { v.repere([R + 0.35, -R * 0.5], mT.mark, [0, -(R - cc)]); v.texte('TEXTES', [R + 0.6, -R * 0.5], desig(mT), { h: 2.4, ancre: 'g', v: 'm' }); }
    v.coteH([-R, -R], [R, -R], -R - 0.25);
    return v;
  };
  if (A.nCol) vues.push(cercle(`SECTION D'UNE COLONNE Ø ${fr(A.D)}`, A.D, M('verC'), M('cerC'), c));
  if (A.pieux) vues.push(cercle(`SECTION D'UN PIEU Ø ${fr(A.Dp)}`, A.Dp, M('pieuL'), M('pieuT'), 0.07));
  if (A.kind === 'pile' && A.type !== 'colonnes') {
    const v = new Vue('SECTION DU VOILE (extrémité)'), b = A.b, Lx = Math.min(A.Lv, 2.5), mV = M('verV'), mH = M('horV');
    v.poly('COFFRAGE', [[0, -b / 2], [Lx, -b / 2]]); v.poly('COFFRAGE', [[0, b / 2], [Lx, b / 2]]); v.ligne('COFFRAGE', [0, -b / 2], [0, b / 2]);
    if (mH) { v.poly('ACIERS', [[Lx, -b / 2 + c], [c, -b / 2 + c], [c, b / 2 - c - 0.02]]); v.poly('ACIERS', [[Lx, b / 2 - c], [c + 0.02, b / 2 - c], [c + 0.02, -b / 2 + c + 0.02]]); }
    if (mV) for (let x = c + 0.03; x < Lx; x += mV.s) for (const sg of [-1, 1]) v.cercle('ACIERS_COUPES', [x, sg * (b / 2 - c - 0.02)], Math.max(mV.phi / 2000, 0.01), true);
    if (mV) { v.repere([Lx * 0.6, b / 2 + 0.4], mV.mark, [Lx * 0.6, b / 2 - c - 0.02]); v.texte('TEXTES', [Lx * 0.6 + 0.25, b / 2 + 0.4], desig(mV), { h: 2.4, ancre: 'g', v: 'm' }); }
    if (mH) { v.repere([Lx * 0.3, -b / 2 - 0.4], mH.mark, [Lx * 0.3, -b / 2 + c]); v.texte('TEXTES', [Lx * 0.3 + 0.25, -b / 2 - 0.4], desig(mH), { h: 2.4, ancre: 'g', v: 'm' }); }
    v.coteV([0, -b / 2], [0, b / 2], -0.3);
    vues.push(v);
  }
  const rS = M('retS'), rH = M('retH');
  if (rS) {
    const v = new Vue('MUR EN RETOUR — ARMATURES PRINCIPALES (vue de face)'), Lr = A.Lret, hh = A.Hm + A.hGG;
    v.poly('COFFRAGE', [[0, 0], [Lr, 0], [Lr, -0.8], [0, -hh]], true);
    v.poly('ACIERS', [[-0.6, -c - 0.02], [Lr - c, -c - 0.02], [Lr - c, -0.30]]);
    const xMax = z => Math.min(Lr, Lr * (hh + z) / Math.max(0.1, hh - 0.8)) - c - 0.05;   // sous la pente du bord libre
    if (rH) for (let z = -c - 0.15; z > -hh / 2; z -= rH.s) v.ligne('ACIERS', [-0.5, z], [xMax(z), z]);
    v.repere([Lr * 0.5, 0.45], rS.mark, [Lr * 0.5, -c - 0.02]); v.texte('TEXTES', [Lr * 0.5 + 0.25, 0.45], `${rS.n || ''} HA${rS.phi} en tête`, { h: 2.4, ancre: 'g', v: 'm' });
    if (rH) { v.repere([Lr + 0.5, -hh / 4], rH.mark, [Lr - c - 0.05, -hh / 4]); v.texte('TEXTES', [Lr + 0.75, -hh / 4], desig(rH), { h: 2.4, ancre: 'g', v: 'm' }); }
    v.coteH([0, 0], [Lr, 0], 0.25);
    v.texte('TEXTES', [-0.1, -hh / 2], 'mur de front', { h: 2.2, ancre: 'd', v: 'm', angle: 90 });
    v.vueDeFace = true;
    vues.push(v);
  }
  return vues;
}

/* --------------------------------------------------------------------------------------------- la feuille */
export function planFerraillageAppui(st, i, cartouche = {}) {
  const { A, marks, code, mat } = reperesAppui(st, i);
  const lignes = lignesBordereau(marks), R0 = recapitulatif(lignes), wb = 166, hl = 4.6;
  const hb = (lignes.length + 2) * hl + 6 + (R0.diam.length + 3) * 5.5;
  const N = [
    'NOTES',
    `1. Aciers HA (f_yk = ${mat.fyk} MPa). Enrobage ${fr(mat.c * 100, 1)} cm, ${fr(mat.c * 100 + 2, 1)} cm contre le sol ; pieux 7 cm.`,
    `2. Sections calculées : onglet Appuis et fondations (${code === 'EC' ? 'Eurocodes' : 'BAEL'}) ; dispositions : Sétra PP 73, pièce 1.3.2 (ferraillages types).`,
    '3. Ancrages et recouvrements : EN 1992-1-1 § 8.4 et 8.7 ; recouvrements des verticales au-dessus des attentes.',
    '4. Bordereau ISO 4066 ; code 99 : cerce circulaire (longueur développée, recouvrement compris).',
    '5. Frettes et éclatement sous appareils : A_s = 0,04 R / f_su par appareil ; plans Δ′ et Δ répartis de 0,1 d à d.',
    '6. Plan type à valider : vérifier l\'encombrement des nappes et les zones de bétonnage.',
  ], hn = N.length * 2.2 * 1.6;
  // élévation et coupe en haut, sections en bas ; bordereau, notes et cartouche dans la colonne de droite
  const el = dessinerElevation(A, marks), cp = dessinerCoupe(A, marks), secs = dessinerSections(A, marks);
  let R = R0;
  const F = composer({ titre: `${A.kind === 'culee' ? 'CULÉE' : 'PILE'} ${A.nom} — PLAN DE FERRAILLAGE`, cartouche,
    rangees: [[el, cp], ...(secs.length ? [secs] : [])],
    groupes: [{ vues: [el, cp], cible: 50, min: 20 }, ...[secs.filter(v => !v.vueDeFace), secs.filter(v => v.vueDeFace)].filter(g => g.length).map(g => ({ vues: g, cible: g[0].vueDeFace ? 50 : 25, min: g[0].vueDeFace ? 25 : 10 }))],
    colonne: { largeur: wb + 16, hauteur: 76 + 8 + hb + 8 + hn + 4 },
    poser: (F, [x, y]) => {
      const xb = F.W - 10 - wb - 3;
      ({ R } = placerBordereau(F, lignes, [xb, y + 76 + 8, wb, hb]));
      F.note(N, xb, y + 76 + 8 + hb + 8 + hn - 2.2 * 0.6, 2.2);
      F.notes[F.notes.length - 1].titreGras = true;
    } }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(p => '1/' + p.vue.echelle))].join(' ; ');
  F.masse = R.masse;
  return F;
}
