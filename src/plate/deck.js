/**
 * Tablier de pont-dalle modélisé en plaque : dalle continue réelle de largeur 2b, abouts compris, chanfreins (épaisseur
 * variable en travers), appuyée ponctuellement sur ses appareils d'appui (ressorts verticaux de l'élastomère fretté),
 * bords libres sur les quatre côtés. Éléments finis DKT (src/plate/fe.js, par défaut, ouvrages droits et biais) ou
 * différences finies énergétiques (src/plate/fd.js, ouvrages droits, conservées pour contrôle croisé).
 * Repère : x le long du pont (origine sur l'axe de la culée C0, comme la poutre), y en travers (−b à +b). Ouvrage biais :
 * lignes d'appui et abouts inclinés de ψ sur l'axe ; une section de la poutre d'abscisse x est la droite parallèle aux
 * lignes d'appui passant par le point (x, 0).
 */
import { PlaqueDF, grille } from './fd.js';
import { PlaqueEF } from './fe.js';

/**
 * Repère des armatures : aciers longitudinaux suivant x, aciers transversaux faisant l'angle α avec x (α = ψ pour des
 * aciers parallèles aux lignes d'appui, 100 gr pour des aciers perpendiculaires aux bords libres). Moments de
 * Wood-Armer pour armatures biaises (forme vérifiée numériquement : capacité ≥ moment normal dans toute direction,
 * test/plaque.test.js) : m_x* = L_x ± |t|, m_α* = L_α ± |t| avec
 *   L_x = m_x − 2 m_xy cot α + m_y cot²α,  L_α = m_y / sin²α,  t = (m_xy − m_y cot α) / sin α
 * (α compté de x vers y). Renvoie les coefficients de L_x (clé mx), L_α (my) et t (mxy) sur m_x, m_y, m_xy.
 */
export function repere(alphaGr = 100) {
  const a = alphaGr * Math.PI / 200, ca = Math.abs(alphaGr - 100) < 1e-9 ? 0 : 1 / Math.tan(a), sa = Math.sin(a);
  return { mx: { mx: 1, mxy: -2 * ca, my: ca * ca }, my: { my: 1 / (sa * sa) }, mxy: { mxy: 1 / sa, my: -ca / sa }, alpha: alphaGr };
}
const appliquer = (co, m, p) => (co.mx || 0) * m.mx[p] + (co.my || 0) * m.my[p] + (co.mxy || 0) * m.mxy[p];
import { bearingSpacing } from '../bearings.js';

/** Raideur verticale d'un appareil en élastomère fretté [kN/m] (guide Sétra 2007 : v_z = F Σt_i/A′ (1/(5 G S²) + 1/E_b)). */
export function raideurAppareil(bd, n, { G = 0.9, Eb = 2000, cLat = 0.005 } = {}) {
  const a = bd.a / 1000 - 2 * cLat, b = bd.b / 1000 - 2 * cLat, t = bd.t / 1000;
  const A = a * b, S = A / (2 * t * (a + b));
  return A / (n * t * (1 / (5 * G * 1000 * S * S) + 1 / (Eb * 1000)));
}

/** Épaisseur de la dalle à l'ordonnée y (chanfreins linéaires sur la joue, cf. deck.g.chamfer). */
export function epaisseur(deck, y) {
  const h = deck.h, ch = deck.g.chamfer, b = deck.b;
  if (!ch || !(ch.hEdge < h) || !(ch.joue > 0)) return h;
  const d = b - Math.abs(y);
  return d >= ch.joue ? h : ch.hEdge + (h - ch.hEdge) * Math.max(0, d) / ch.joue;
}

/**
 * Modèle de plaque du tablier.
 * @param {object} deck SlabDeck (src/analysis.js)
 * @param {object} o { h : pas de grille [m], E [MPa], nu, nb : appareils par ligne, kv : raideur par ligne [kN/m]
 *   (nombre ou tableau ; Infinity = appui rigide), psi [gr] }
 */
export function plaqueTablier(deck, { h = 0.25, E = 34000, nu = deck.nu ?? 0.2, nb = 4, kv = Infinity, psi = 100, alphaT = null, moteur = 'ef' } = {}) {
  if (moteur === 'df' && psi < 100 - 1e-9) throw new Error('plaque : les différences finies ne traitent que les ouvrages droits (moteur « ef » pour le biais)');
  const b = deck.b, [aL, aR] = deck.g.overhangs || [0, 0];
  const x0 = deck.beam.x0, xA = -aL, xB = x0[x0.length - 1] + aR;
  const secs = deck.beam.sections.map(s => s.x);
  // entraxe des appareils le long de la ligne d'appui ; en travers (y) : a·sin ψ
  const sPsi = Math.sin(psi * Math.PI / 200), cot = Math.abs(psi - 100) < 1e-9 ? 0 : 1 / Math.tan(psi * Math.PI / 200);
  const a = bearingSpacing({ width: 2 * b, psi, n: nb });
  const yb = Array.from({ length: nb }, (_, k) => (k - (nb - 1) / 2) * a * sPsi);
  const ch = deck.g.chamfer;
  const ptsY = [-b, b, ...deck.ys, ...yb, ...(ch && ch.joue > 0 ? [-b + ch.joue, b - ch.joue] : [])].filter(y => y >= -b - 1e-9 && y <= b + 1e-9);
  const xs = grille([xA, xB, ...x0, ...secs.filter(x => x >= xA && x <= xB)], h);
  const ys = grille(ptsY, h);
  const Dy = y => E * 1000 * epaisseur(deck, y) ** 3 / (12 * (1 - nu * nu));
  const kLigne = i => (Array.isArray(kv) ? kv[i] : kv);
  const appuis = x0.flatMap((x, i) => yb.map((y, k) => ({ x: x + y * cot, y, k: kLigne(i), ligne: i, rang: k })));
  const P = moteur === 'df' ? new PlaqueDF({ xs, ys, D: (_, y) => Dy(y), nu, appuis }) : new PlaqueEF({ xs, ys, D: (_, y) => Dy(y), nu, appuis, psi });
  const iSec = secs.map(x => P.plusProche(xs, x)), jFib = deck.ys.map(y => P.plusProche(ys, y));
  const aT = alphaT ?? psi;
  const M = { P, deck, xs, ys, yb, a, nb, iSec, jFib, E, nu, h, psi, cot, moteur, alphaT: aT, repere: repere(aT), repereChev: repere(psi) };
  M.bandes = bandesChevetre(M);
  return M;
}

/**
 * Bandes de ferraillage des chevêtres incorporés (annexe 4 du guide PSIDP-EL, § 6.2) sur chaque ligne d'appui : face
 * supérieure ①, ②, ③ centrées sur chaque appareil, face inférieure ①′, ②′ centrées entre deux appareils. Largeurs du
 * guide : ① 2/3·max(c, a, e), ② max(2c, a, e), ③ 2·max(a, e, c), ①′ 2/3·max(a, e), ②′ 2·max(a, e).
 * Poids des nœuds de la grille pour la moyenne sur [y1, y2] (longueur tributaire dans la bande / largeur).
 */
export function bandesChevetre(M) {
  const { yb, ys, deck } = M, b = deck.b, n = yb.length, sPsi = Math.sin((M.psi ?? 100) * Math.PI / 200);
  const a = n > 1 ? yb[1] - yb[0] : 2 * b, c = b - yb[n - 1];
  const e = n > 3 ? yb[2] - yb[1] : a, big = Math.max(c, a, e), ae = Math.max(a, e);
  const larg = { top: [2 / 3 * big, Math.max(2 * c, a, e), 2 * big], bot: [2 / 3 * ae, 2 * ae] };
  const out = [];
  // poids des nœuds pour la moyenne sur une réunion d'intervalles (longueur tributaire dans les intervalles / longueur totale)
  const poids = ivs => {
    const tot = ivs.reduce((t, [u, v]) => t + Math.max(0, v - u), 0), w = [];
    if (tot < 1e-9) return w;
    for (let j = 0; j < ys.length; j++) {
      const lo = j > 0 ? (ys[j - 1] + ys[j]) / 2 : ys[0], hi = j < ys.length - 1 ? (ys[j] + ys[j + 1]) / 2 : ys[ys.length - 1];
      const l = ivs.reduce((t, [u, v]) => t + Math.max(0, Math.min(hi, v) - Math.max(lo, u)), 0);
      if (l > 1e-9) w.push([j, l / tot]);
    }
    return w;
  };
  const clip = ([u, v]) => [Math.max(-b, u), Math.min(b, v)];
  // bandes emboîtées (guide : ② = « reste de » max(2c, a, e), ③ = reste de 2·max(a, e, c)) : la bande de rang k ≥ 1 est
  // l'anneau compris entre la largeur de rang k − 1 et la sienne, comme dans le plan de ferraillage
  // l'anneau exclut aussi les bandes de rang 0 de tous les appareils (resp. intervalles) de la ligne, armées par leurs
  // propres aciers : sans cela la pointe d'un appareil voisin serait comptée dans l'anneau de l'appareil considéré
  const moins = (ivs, trous) => trous.reduce((acc, [p, q]) => acc.flatMap(([u, v]) => (q <= u || p >= v ? [[u, v]] : [[u, Math.min(v, p)], [Math.max(u, q), v]].filter(([x, y]) => y - x > 1e-9))), ivs);
  for (const [face, centres] of [['top', yb], ['bot', yb.slice(1).map((y, k) => (y + yb[k]) / 2)]]) {
    let wPrev = 0;
    const w0f = larg[face][0], trous = centres.map(t => [t - w0f / 2, t + w0f / 2]);
    larg[face].forEach((w0, rang) => {
      const w = Math.max(w0, wPrev), wIn = wPrev;
      centres.forEach(yc => {
        const ivs = (wIn > 0 ? moins([[yc - w / 2, yc + w / 2]], [[yc - wIn / 2, yc + wIn / 2], ...trous]) : [[yc - w / 2, yc + w / 2]]).map(clip);
        out.push({ face, rang, yc, y1: Math.max(-b, yc - w / 2), y2: Math.min(b, yc + w / 2), largeur: w, largeurLigne: w / sPsi, interieur: wIn, poids: poids(ivs) });
      });
      wPrev = w;
    });
  }
  return { bandes: out, a, c, e };
}

/** Résultats d'un cas de charge aux sections × fibres de la poutre, réactions par appareil et par ligne. */
export function resultats(M, w) {
  const { P, iSec, jFib, deck, xs, ys } = M;
  const m = P.moments(w), R = M.repere || repere(100), RC = M.repereChev || repere(100);
  // moments aux sections × fibres dans le repère des armatures (identiques aux moments cartésiens pour un ouvrage droit)
  const at = (g, s, f) => appliquer(R[g], m, P.idx(iSec[s], jFib[f]));
  const mx = iSec.map((_, s) => jFib.map((_, f) => at('mx', s, f)));
  const my = iSec.map((_, s) => jFib.map((_, f) => at('my', s, f)));
  const mxy = iSec.map((_, s) => jFib.map((_, f) => at('mxy', s, f)));
  // moment total sur la largeur (règle des trapèzes sur la grille) : contrôle d'équilibre avec la poutre
  const Mtot = iSec.map(i => { let t = 0; for (let j = 1; j < ys.length; j++) t += (m.mx[P.idx(i, j)] + m.mx[P.idx(i, j - 1)]) / 2 * (ys[j] - ys[j - 1]); return t; });
  const reac = P.reactions(w);
  const nL = deck.beam.x0.length;
  const Rl = Array.from({ length: nL }, (_, i) => reac.filter(r => r.ligne === i).reduce((s, r) => s + r.R, 0));
  const Rapp = Array.from({ length: nL }, (_, i) => reac.filter(r => r.ligne === i).sort((u, v) => u.rang - v.rang).map(r => r.R));
  // moyennes de m_y et m_xy sur les bandes de chevêtre de chaque ligne d'appui
  // (aciers des chevêtres parallèles aux lignes d'appui : repère α = ψ)
  const B = M.bandes ? deck.beam.x0.map(x => { const i = P.plusProche(xs, x); return M.bandes.bandes.map(bd => ({ my: bd.poids.reduce((t, [j, w]) => t + w * appliquer(RC.my, m, P.idx(i, j)), 0), mxy: bd.poids.reduce((t, [j, w]) => t + w * appliquer(RC.mxy, m, P.idx(i, j)), 0) })); }) : null;
  return { mx, my, mxy, Mtot, R: Rl, Rapp, B, w, champ: m, xs, ys };
}

/**
 * Charges permanentes sur la plaque : poids propre (γ·h(y), recalé sur l'aire de la section), charges-lignes et
 * bandes des superstructures (mêmes composantes que SlabDeck.permanentFiles, sur toute la longueur abouts compris).
 */
export function permanentPlaque(M, files = null) {
  const { P, deck, xs, ys } = M;
  const b = deck.b, xA = xs[0], xB = xs[xs.length - 1];
  // aire de la section transversale d'après le profil d'épaisseur, pour recaler sur deck.area
  let Aprof = 0; for (let j = 1; j < ys.length; j++) Aprof += (epaisseur(deck, ys[j]) + epaisseur(deck, ys[j - 1])) / 2 * (ys[j] - ys[j - 1]);
  const kA = deck.area / Aprof;
  const fichiers = (files || deck.permanentFiles()).map(f => {
    const F = P.vecteur();
    if (f.unitK) { // poids propre : par bandes de la grille en travers
      for (let j = 0; j < ys.length; j++) {
        const y1 = j > 0 ? (ys[j - 1] + ys[j]) / 2 : ys[0], y2 = j < ys.length - 1 ? (ys[j] + ys[j + 1]) / 2 : ys[ys.length - 1];
        P.chargeRectangle(F, { x1: xA, x2: xB, y1, y2, q: deck.gammaC * epaisseur(deck, ys[j]) * kA });
      }
    } else if (Math.abs(f.e2 - f.e1) < 1e-9) { // charge-ligne g [kN/m] en y = e
      const e = Math.min(b, Math.max(-b, f.e1)), j = P.plusProche(ys, e);
      for (let i = 0; i < xs.length; i++) { const lx = ((i < xs.length - 1 ? xs[i + 1] : xs[i]) - (i > 0 ? xs[i - 1] : xs[i])) / 2; F[P.idx(i, j)] += f.q * lx; }
    } else P.chargeRectangle(F, { x1: xA, x2: xB, y1: f.e1, y2: f.e2, q: f.q / (f.e2 - f.e1) });
    const w = P.resoudre(F);
    return { ...f, total: F.reduce((s, v) => s + v, 0), ...resultats(M, w) };
  });
  const somme = k => fichiers.reduce((acc, f) => acc.map((row, s) => (Array.isArray(row) ? row.map((v, i) => v + f[k][s][i]) : row + f[k][s])), fichiers[0][k].map(row => (Array.isArray(row) ? row.map(() => 0) : 0)));
  const B = fichiers[0].B ? fichiers[0].B.map((row, i) => row.map((_, k) => ({ my: fichiers.reduce((t, f) => t + f.B[i][k].my, 0), mxy: fichiers.reduce((t, f) => t + f.B[i][k].mxy, 0) }))) : null;
  return { fichiers, mx: somme('mx'), my: somme('my'), mxy: somme('mxy'), Mtot: somme('Mtot'), R: somme('R'), Rapp: somme('Rapp'), B };
}
