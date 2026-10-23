/**
 * Sections du calcul par phases, définies par leurs dimensions (m) : aire, inertie propre, position du centre de gravité.
 *  - poutre en I préfabriquée (table, âme, talon, goussets à 45° omis) et hourdis rectangulaire ;
 *  - caisson à deux âmes verticales (hourdis supérieur B × t_s, hourdis inférieur B_i × t_i, âmes b_w chacune).
 * Les rectangles sont décrits du bas vers le haut : [largeur, hauteur].
 */

/** Rectangles empilés (bas → haut) : A, y_G (depuis le bas), I_G. */
export function rectangles(R) {
  let A = 0, S = 0, y = 0; const P = [];
  for (const [b, h] of R) { const a = b * h; P.push({ a, yc: y + h / 2, i: b * h ** 3 / 12 }); A += a; S += a * (y + h / 2); y += h; }
  const yG = S / A, I = P.reduce((s, p) => s + p.i + p.a * (p.yc - yG) ** 2, 0);
  return { A, yG, I, H: y };
}

/** Poutre en I : talon bb × hb, âme bw, table bt × ht, hauteur totale H. */
export function poutreI({ H, bt, ht, bw, bb, hb }) {
  if (!(H > ht + hb)) throw new Error('poutre : la hauteur doit dépasser table + talon');
  return { ...rectangles([[bb, hb], [bw, H - ht - hb], [bt, ht]]), forme: { H, bt, ht, bw, bb, hb } };
}

/** Poutre + hourdis (largeur bh, épaisseur hd, posé sur la table) : sections des deux parties et décalage e. */
export function poutreEtHourdis(g) {
  const P = poutreI(g), Hd = { A: g.bh * g.hd, I: g.bh * g.hd ** 3 / 12 };
  return { poutre: P, hourdis: { ...Hd, e: g.H - P.yG + g.hd / 2 } };
}

/** Caisson de hauteur h : hourdis supérieur B × ts, inférieur Bi × ti, deux âmes bw. v = distance c.d.g. – extrados. */
export function caisson({ B, ts, Bi, ti, bw }, h) {
  if (!(h > ts + ti)) throw new Error('caisson : hauteur insuffisante pour les deux hourdis');
  const S = rectangles([[Bi, ti], [2 * bw, h - ts - ti], [B, ts]]);
  return { ...S, v: h - S.yG };
}
