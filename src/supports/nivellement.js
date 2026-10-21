/**
 * Plan de nivellement : les appuis définis par leurs cotes (m, système de nivellement du projet), ligne d'appui par ligne.
 *
 * Saisie (sp.niv) : par ligne i, cote du profil en long (dessus de chaussée à l'axe) zCh, du terrain naturel zTN, du
 * dessus de semelle zDS, de la sous-face de semelle zSS, de la pointe des pieux zPP ; type de fondation et largeur B de
 * semelle facultatifs (vides : données générales) ; hauteur des bossages hBos.
 * Cotes déduites : sous-face du tablier à l'axe zSF = zCh − e_rev − h ; tête d'appui (dessus du sommier ou du chevêtre)
 * zT = zSF − h_appareil − h_bossage.
 * Données d'appui déduites : fût de pile H = zT − zDS (− h du chevêtre sur colonnes) ; culée : H_m = zT − zDS (− h du
 * chevêtre pour une culée sur colonnes) ; semelle h_s = zDS − zSS ; encastrement D_e = zTN − zSS ; pieux L = zSS − zPP.
 * Les valeurs déduites remplacent, pour la ligne, les données générales correspondantes (hauteurs de piles, H_m, h_s,
 * D_e, longueur des pieux).
 * En travers : dalle parallèle à la chaussée, dévers p (%) en toit (cote −p|y|) ou unique (cote p·y, y > 0 à droite) ;
 * sommier horizontal, au plus haut sous l'appareil le plus bas ; hauteur des bossages ajustée sous chaque appareil
 * (h_bossage minimale sous l'appareil le plus bas).
 */
import { bearingSpacing } from '../bearings.js';
const num = v => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);

export function nivellement(sp, { deck, bearings, tRev = 0.08, isEnd, nL }) {
  const N = sp.niv;
  const out = { actif: !!(N && N.actif), parLigne: [], lignes: [], warnings: [] };
  if (!out.actif) return out;
  const hBos = num(N.hBos) ?? 0.10, p = (num(N.devers) ?? 0) / 100, toit = N.profil !== 'unique';
  const dz = y => (toit ? -p * Math.abs(y) : p * y);
  const psi = deck.g.psi ?? 100, sPsi = Math.sin(psi * Math.PI / 200);
  for (let i = 0; i < nL; i++) {
    const z = k => num((N[k] || [])[i]);
    const zCh = z('zCh'), zTN = z('zTN'), zDS = z('zDS'), zSS = z('zSS'), zPP = z('zPP');
    const row = bearings && bearings.rows[i], hApp = row && row.sel && row.sel.hTot ? row.sel.hTot / 1000 : 0.06;
    const nb = (row && row.nb) || (bearings && bearings.nb) || 2, a = bearingSpacing({ width: 2 * deck.b, psi, n: nb });
    const yb = Array.from({ length: nb }, (_, k) => (k - (nb - 1) / 2) * a * sPsi), off = yb.map(dz), offMin = Math.min(...off);
    const end = isEnd(i), L = { i, zCh, zTN, zDS, zSS, zPP, hApp, hBos, warnings: [] };
    const over = {};
    const type = (N.type || [])[i], B = num((N.B || [])[i]);
    const found = {};
    if (type === 'superficielle' || type === 'pieux') found.type = type;
    if (B != null) found.B = B;
    if (zCh != null) {
      L.zSF = zCh - tRev - deck.h;
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
    if (Object.keys(found).length) over.found = found;
    out.parLigne[i] = Object.keys(over).length ? over : null;
    out.lignes.push(L);
    for (const w of L.warnings) out.warnings.push(`${end ? 'C' : 'P'}${i} : ${w}`);
  }
  return out;
}
