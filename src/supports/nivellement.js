/**
 * Plan de nivellement : les appuis définis par leurs cotes (m, système de nivellement du projet), ligne d'appui par ligne.
 *
 * Saisie (sp.niv) : par ligne i, cote du profil en long (dessus de chaussée à l'axe) zCh, du terrain naturel zTN, du
 * dessus de semelle zDS, de la sous-face de semelle zSS, de la pointe des pieux zPP, des plus hautes eaux zPHE et du lit
 * zLit (piles en rivière : hauteur d'eau zPHE − zLit, dessus de semelle à zLit − zDS sous le lit) ; type de fondation et largeur B de
 * semelle facultatifs (vides : données générales) ; hauteur des bossages hBos.
 * Cotes déduites : sous-face du tablier à l'axe zSF = zCh − e_rev − h ; tête d'appui (dessus du sommier ou du chevêtre)
 * zT = zSF − h_appareil − h_bossage.
 * Données d'appui déduites : fût de pile H = zT − zDS (− h du chevêtre sur colonnes) ; culée : H_m = zT − zDS (− h du
 * chevêtre pour une culée sur colonnes) ; semelle h_s = zDS − zSS ; encastrement D_e = zTN − zSS ; pieux L = zSS − zPP.
 * Les valeurs déduites remplacent, pour la ligne, les données générales correspondantes (hauteurs de piles, H_m, h_s,
 * D_e, longueur des pieux).
 * En travers : dévers du tablier (src/devers.js) ; si la dalle est inclinée (épaisseur constante), sa sous-face suit la
 * chaussée et le sommier, horizontal, est au plus haut sous l'appareil le plus bas, les bossages rattrapant la différence ;
 * dalle d'épaisseur variable ou revêtement variable : sous-face horizontale, bossages égaux. Revêtement variable :
 * épaisseur de revêtement à l'axe e_rev + supplément de dévers.
 */
import { bearingSpacing } from '../bearings.js';
import { revetementAxe, deltaDevers } from '../devers.js';
const num = v => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);

export function nivellement(sp, { deck, bearings, tRev = 0.08, isEnd, nL }) {
  const N = sp.niv;
  const out = { actif: !!(N && N.actif), parLigne: [], lignes: [], warnings: [] };
  if (!out.actif) return out;
  // dévers du tablier (onglet Projet) : la sous-face ne suit la chaussée que pour une dalle inclinée d'épaisseur constante
  const hBos = num(N.hBos) ?? 0.10, dv = deck.g.devers || null;
  const dz = y => (dv && dv.mode === 'inclinee' ? deltaDevers(dv, y) : 0);
  const eRevAxe = deck.g.roadway ? revetementAxe(dv, tRev, deck.g.roadway) : tRev;
  const psi = deck.g.psi ?? 100, sPsi = Math.sin(psi * Math.PI / 200);
  for (let i = 0; i < nL; i++) {
    const z = k => num((N[k] || [])[i]);
    const zCh = z('zCh'), zTN = z('zTN'), zDS = z('zDS'), zSS = z('zSS'), zPP = z('zPP'), zPHE = z('zPHE'), zLit = z('zLit');
    const row = bearings && bearings.rows[i], hApp = row && row.sel && row.sel.hTot ? row.sel.hTot / 1000 : 0.06;
    const nb = (row && row.nb) || (bearings && bearings.nb) || 2, a = bearingSpacing({ width: 2 * deck.b, psi, n: nb });
    const yb = Array.from({ length: nb }, (_, k) => (k - (nb - 1) / 2) * a * sPsi), off = yb.map(dz), offMin = Math.min(...off);
    const end = isEnd(i), L = { i, zCh, zTN, zDS, zSS, zPP, zPHE, zLit, hApp, hBos, warnings: [] };
    const over = {};
    const type = (N.type || [])[i], B = num((N.B || [])[i]);
    const found = {};
    if (type === 'superficielle' || type === 'pieux') found.type = type;
    if (B != null) found.B = B;
    if (zCh != null) {
      L.zSF = zCh - eRevAxe - deck.h;
      // tête d'appui (dessus du sommier, horizontal) sous l'appareil le plus bas ; bossages sous chaque appareil
      L.zT = L.zSF + offMin - hApp - hBos;
      L.appareils = yb.map((y, k) => ({ y, zSF: L.zSF + off[k], zSousApp: L.zSF + off[k] - hApp, hBossage: hBos + off[k] - offMin }));
      if (zDS != null) {
        if (end) {
          const C = sp.culee, hc = C.type === 'remblayee' ? 0 : (C.hc || 0);
          L.Hm = L.zT - zDS - hc; over.culee = { Hm: L.Hm };
          if (L.Hm < 0.5) L.warnings.push(`hauteur de culée H_m = ${L.Hm.toFixed(2)} m < 0,50 m : cotes à vérifier`);
        } else {
          const P = sp.pile, hc = P.type === 'colonnes' ? (P.hc || 0) : 0;
          L.H = L.zT - zDS - hc; over.pile = { H: L.H };
          if (L.H < 0.5) L.warnings.push(`hauteur de fût H = ${L.H.toFixed(2)} m < 0,50 m : cotes à vérifier`);
        }
      }
    }
    if (zDS != null && zSS != null) {
      L.hs = zDS - zSS; found.hs = L.hs;
      if (L.hs < 0.4) L.warnings.push(`épaisseur de semelle h_s = ${L.hs.toFixed(2)} m < 0,40 m : cotes à vérifier`);
    }
    if (zTN != null && zSS != null) {
      L.De = Math.max(0, zTN - zSS); found.De = L.De;
      if (zTN < zSS) L.warnings.push('sous-face de semelle au-dessus du terrain naturel : encastrement nul');
    }
    const onPiles = (found.type || sp.found.type) !== 'superficielle';
    if (onPiles && zSS != null && zPP != null) {
      L.Lpile = zSS - zPP; found.Lpile = L.Lpile;
      if (L.Lpile < 3) L.warnings.push(`longueur de pieux L = ${L.Lpile.toFixed(2)} m < 3 m : cotes à vérifier`);
    }
    // cours d'eau : hauteur d'eau PHE − lit et profondeur du dessus de semelle sous le lit (piles en rivière)
    if (zPHE != null && zLit != null) {
      L.hEau = Math.max(0, zPHE - zLit); over.eau = { h: L.hEau };
      if (zDS != null) L.dBed = Math.max(0, zLit - zDS);
      if (zTN != null && Math.abs(zTN - zLit) > 0.01 && !end) L.warnings.push(`lit (${zLit.toFixed(2)}) différent du terrain naturel (${zTN.toFixed(2)}) : le lit sert à l'eau, le terrain naturel à l'encastrement`);
    }
    if (Object.keys(found).length) over.found = found;
    out.parLigne[i] = Object.keys(over).length ? over : null;
    out.lignes.push(L);
    for (const w of L.warnings) out.warnings.push(`${end ? 'C' : 'P'}${i} : ${w}`);
  }
  return out;
}
