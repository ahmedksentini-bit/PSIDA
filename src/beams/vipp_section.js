/**
 * Section d'une poutre préfabriquée précontrainte de pont à travées indépendantes (VIPP), définie par ses dimensions
 * comme dans le guide Sétra « VIPP — Ponts à poutres préfabriquées précontraintes par post-tension, guide de conception »
 * (1996), § 3.2 : talon à pied vertical et pan incliné, âme d'épaisseur constante, table de compression à sous-face
 * inclinée raccordée à l'âme par un gousset à 45°. Le hourdis général (coulé sur les poutres) est ajouté par-dessus.
 *
 * Caractéristiques exactes du polygone (formules de Green : aire, moment statique, inertie), inertie de torsion par
 * décomposition en rectangles (k b t³, Saint-Venant). Ordonnées y depuis la fibre inférieure de la poutre (m).
 */
import { kTorsion } from './index.js';

/**
 * Dimensions (m) : hp hauteur de la poutre seule ; bt largeur de la table ; hte épaisseur de la table à son extrémité ;
 * pt pente de la sous-face de la table (1/10 à 1/15) ; gt gousset table-âme (côté, 45°) ; b0 épaisseur d'âme ;
 * bta largeur du talon ; hpi hauteur du pied de talon ; tpan tangente du pan incliné (1 à 1,5) ;
 * b0a épaisseur d'âme sur appui (blochet), Lb longueur du blochet depuis l'appui (m).
 */
export const FORME_VIPP = { hp: 1.75, bt: 1.50, hte: 0.10, pt: 0.10, gt: 0.15, b0: 0.20, bta: 0.70, hpi: 0.15, tpan: 1.25, b0a: 0.30, Lb: 4.0 };

/** Ordonnées caractéristiques et contour (sens trigonométrique), contrôle de cohérence. */
export function contourVIPP(f) {
  const { hp, bt, hte, pt, gt, b0, bta, hpi, tpan } = f;
  const yPan = hpi + tpan * Math.max(bta - b0, 0) / 2;                 // haut du pan incliné (naissance de l'âme)
  const yTab = hp - hte - pt * Math.max(bt / 2 - b0 / 2 - gt, 0);      // sous-face de la table au droit du gousset
  const yGou = yTab - gt;                                                // naissance du gousset sur l'âme
  if (!(bta >= b0 && bt >= b0 + 2 * gt)) throw new Error('poutre VIPP : il faut talon ≥ âme et table ≥ âme + 2 goussets');
  if (!(yGou > yPan + 0.05)) throw new Error(`poutre VIPP : âme trop courte (talon jusqu'à ${yPan.toFixed(2)} m, gousset à ${yGou.toFixed(2)} m) — augmenter la hauteur ou réduire talon et table`);
  const d = [[0, 0], [bta / 2, 0], [bta / 2, hpi], [b0 / 2, yPan], [b0 / 2, yGou], [b0 / 2 + gt, yTab], [bt / 2, hp - hte], [bt / 2, hp], [0, hp]];
  const g = d.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  return { pts: [...d.slice(0, -1), [0, hp], ...g].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]), yPan, yTab, yGou };
}

/** Aire, centre de gravité (depuis le bas), inertie centrale et périmètre d'un polygone. */
export function proprietesPolygone(pts) {
  let A = 0, Sy = 0, Ixx = 0, u = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length], c = x1 * y2 - x2 * y1;
    A += c / 2; Sy += (y1 + y2) * c / 6; Ixx += (y1 * y1 + y1 * y2 + y2 * y2) * c / 12; u += Math.hypot(x2 - x1, y2 - y1);
  }
  if (A < 0) { A = -A; Sy = -Sy; Ixx = -Ixx; }
  const yG = Sy / A;
  return { A, yG, I: Ixx - A * yG * yG, u };
}

/** Largeur efficace d'une poutre en T (NF EN 1992-1-1 § 5.3.2.1) : l₀ = portée (travée isostatique). */
export function largeurEfficaceT({ b1, bw, l0 }) {
  const bi = Math.max(b1 - bw, 0) / 2, be = Math.min(0.2 * bi + 0.1 * l0, 0.2 * l0, bi);
  return Math.min(bw + 2 * be, b1);
}

/**
 * Poutre seule, hourdis et section composée. o = { b1 (entraxe), hd (hourdis), beff (largeur efficace, b₁ par défaut),
 * nh (coefficient E_hourdis/E_poutre de la section homogène, 1 par défaut) }.
 */
export function sectionVIPP(f, { b1, hd, beff = b1, nh = 1 } = {}) {
  const C = contourVIPP(f), P = proprietesPolygone(C.pts);
  const hAme = C.yGou - C.yPan, eTab = f.hte + f.pt * Math.max(f.bt / 2 - f.b0 / 2 - f.gt, 0) / 2;
  const K = kTorsion(f.bta, f.hpi + (C.yPan - f.hpi) / 2) + kTorsion(f.b0, hAme + f.gt) + kTorsion(f.bt, eTab);
  const poutre = { ...P, H: f.hp, vs: f.hp - P.yG, vi: P.yG, K, h0: 2 * P.A / P.u * 1000, contour: C };
  const Ah = beff * hd, yh = f.hp + hd / 2;
  const hourdis = { A: Ah, I: beff * hd ** 3 / 12, e: yh - P.yG, poids: b1 * hd, h0: hd * 1000 };
  const Ac = P.A + nh * Ah, yGc = (P.A * P.yG + nh * Ah * yh) / Ac;
  const Ic = P.I + P.A * (P.yG - yGc) ** 2 + nh * (hourdis.I + Ah * (yh - yGc) ** 2);
  const comp = { A: Ac, yG: yGc, I: Ic, H: f.hp + hd, v: f.hp + hd - yGc, vp: yGc, K: K + b1 * hd ** 3 / 6, nh, beff };
  return { forme: f, poutre, hourdis, comp, b1, hd };
}
