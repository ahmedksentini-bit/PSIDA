/**
 * Passage d'un tablier calculé ailleurs (ponts à poutres, poutres rendues continues, fléaux, pont mixte) vers « Appuis
 * seuls » : portées, largeurs, réactions par ligne, et données du modèle sismique (Pont EC8) — nature du tablier,
 * continuité, aire et inerties de la section réelle, superstructures.
 *
 * Masse sismique : l'aire est celle de la structure (béton ; acier ramené au béton par le rapport des masses volumiques
 * 7,85 / 2,5 pour le mixte) et les superstructures sont le reste du poids permanent, de sorte que
 * 25 A + g_sup = Σ G / L : le poids permanent n'est compté qu'une fois (EN 1998-2 § 4.1.2, masses sismiques).
 * Inerties : dans le béton du tablier (f_ck du tablier) ; l'export Pont EC8 les ramène au béton des appuis.
 * Unités : m, kN, MPa.
 */
import { sectionZone } from '../src/mixte/verifs.js';
import { proprietes } from '../src/mixte/section.js';

const r3 = x => Math.round(x * 1000) / 1000, sig = x => Number(x.toPrecision(4));
const somme = a => a.reduce((s, v) => s + v, 0);

/** Superstructures [kN/m] : reste du poids permanent une fois la structure (25 kN/m³ × A) déduite. */
export function superstructuresResiduelles(Gtot, Ltot, A) { return Math.max(0, Gtot / Ltot - 25 * A); }

/** Champs communs à partir des réactions { G, Gmin?, A?, Bc?, Mc120?, trott, TS, UDL }. */
function champs({ spans, largeur, Lc, h, A, Iv, It, fck, type, continuite, reac, nb }) {
  const Ltot = somme(spans), Gtot = somme(reac.map(q => q.G));
  return {
    ss_spans: spans.join(', '), ss_width: r3(largeur), ss_Lc: r3(Lc), ss_h: r3(h), ss_area: r3(A),
    ss_super: Math.round(superstructuresResiduelles(Gtot, Ltot, A) * 10) / 10,
    ss_type: type, ss_iso: continuite, ss_Iv: sig(Iv), ss_It: sig(It), ss_fck: fck, ss_bearing: 'auto',
    ...(nb ? { ss_nb: nb } : {}),
    ss_lines: reac.map(q => [q.G, q.Gmin ?? q.G, q.A || 0, q.Bc || 0, q.Mc120 || 0, q.trott || 0, q.TS || 0, q.UDL || 0].map(x => Math.round(x)).join(' ; ')).join('\n'),
  };
}

/** Pont à poutres à travées indépendantes (VIPP, PRAD, BA) : résultat de computePoutres. */
export function champsAppuisPoutres(P) {
  const inp = P.inp, W = inp.n * inp.b1, hd = inp.hd || 0.2;
  return champs({ spans: inp.spans, largeur: W, Lc: inp.roadway.y2 - inp.roadway.y1, h: P.sec.H || inp.beam.H || 2,
    A: inp.n * P.sec.A, Iv: inp.n * P.sec.I, It: hd * W ** 3 / 12, fck: inp.fck, type: 'poutres', continuite: 'isostatique', reac: P.lines, nb: inp.n });
}

/** Moyenne pondérée par la longueur des barres d'un modèle par phases (aire et inertie). */
function moyenneBarres(modele) {
  let L = 0, A = 0, I = 0;
  for (const b of modele.barres) {
    const [x1, y1] = modele.noeuds[b.i], [x2, y2] = modele.noeuds[b.j], l = Math.hypot(x2 - x1, y2 - y1);
    L += l; A += b.A * l; I += b.I * l;
  }
  return { A: A / L, I: I / L };
}

/** Inertie transversale (axe vertical) d'un caisson à deux âmes : hourdis, âmes à ±(B_i − b_w)/2. */
export function inertieTransversaleCaisson(K, h) {
  const hw = h - K.ts - K.tic, xw = (K.Bi - K.bw) / 2;
  return K.ts * K.B ** 3 / 12 + K.tic * (K.Bi - 2 * K.bw) ** 3 / 12 + 2 * (hw * K.bw ** 3 / 12 + hw * K.bw * xw ** 2);
}

/** Tablier par phases (poutres continues, fléau) ou mixte : résultat de computePhasage / computeMixte. */
export function champsAppuisPhasage(ph, { Lr = 8 } = {}) {
  const p = ph.p;
  if (ph.type === 'mixte') {
    const v = ph.v, g = p.travee, nP = p.nPoutres, beff = p.largeur / nP;
    const Aacier = nP * (g.bfi * g.tfi + g.hw * g.tw + g.bfs * g.tfs), Adalle = p.largeur * p.hc;
    const P0 = proprietes(sectionZone(p, false, beff, 0), 'mixte', v.n0);
    return champs({ spans: p.L, largeur: p.largeur, Lc: v.CH.wl * v.CH.nl, h: g.tfi + g.hw + g.tfs + p.hg + p.hc,
      A: Adalle + Aacier * 7.85 / 2.5, Iv: nP * P0.I * v.n0, It: p.hc * p.largeur ** 3 / 12, fck: p.fck, type: 'mixte', continuite: 'continu', reac: v.reactions, nb: nP });
  }
  const v = ph.acheve, fl = ph.type === 'fleau';
  if (!v) throw new Error('réactions indisponibles : sections à définir par leurs dimensions.');
  if (fl) {
    const K = p.caisson, m = moyenneBarres(ph.modele), hm = (p.hp + p.hc) / 2;
    return champs({ spans: [p.a, 2 * p.a, p.a], largeur: K ? K.B : 12, Lc: Lr, h: p.hp,
      A: m.A, Iv: m.I, It: K ? inertieTransversaleCaisson(K, hm) : m.A * 12 ** 2 / 12, fck: p.fck, type: 'caisson', continuite: 'continu', reac: v.reactions, nb: 2 });
  }
  const f = p.forme, nP = v.nP, W = nP * f.bh, Ab = ph.modele.barres[0].A, el = v.sections[0].el;
  return champs({ spans: Array.from({ length: p.n }, () => p.L), largeur: W, Lc: Lr, h: f.H + f.hd,
    A: nP * (Ab + f.bh * f.hd), Iv: nP * el.I, It: f.hd * W ** 3 / 12, fck: p.poutre.fck, type: 'poutres', continuite: 'continu', reac: v.reactions, nb: nP });
}
