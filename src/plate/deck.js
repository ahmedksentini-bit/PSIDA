/**
 * Tablier de pont-dalle modélisé en plaque (différences finies, src/plate/fd.js) : dalle continue réelle de largeur 2b,
 * abouts compris, chanfreins (épaisseur variable en travers), appuyée ponctuellement sur ses appareils d'appui
 * (ressorts verticaux de l'élastomère fretté), bords libres sur les quatre côtés.
 * Repère : x le long du pont (origine sur l'axe de la culée C0, comme la poutre), y en travers (−b à +b).
 * Ouvrage droit uniquement à ce stade (biais : grille oblique à prévoir).
 */
import { PlaqueDF, grille } from './fd.js';
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
export function plaqueTablier(deck, { h = 0.25, E = 34000, nu = deck.nu ?? 0.2, nb = 4, kv = Infinity, psi = 100 } = {}) {
  if (psi < 100 - 1e-9) throw new Error('plaque : ouvrage biais non traité à ce stade (grille oblique à venir)');
  const b = deck.b, [aL, aR] = deck.g.overhangs || [0, 0];
  const x0 = deck.beam.x0, xA = -aL, xB = x0[x0.length - 1] + aR;
  const secs = deck.beam.sections.map(s => s.x);
  const a = bearingSpacing({ width: 2 * b, psi, n: nb });
  const yb = Array.from({ length: nb }, (_, k) => (k - (nb - 1) / 2) * a);
  const ch = deck.g.chamfer;
  const ptsY = [-b, b, ...deck.ys, ...yb, ...(ch && ch.joue > 0 ? [-b + ch.joue, b - ch.joue] : [])].filter(y => y >= -b - 1e-9 && y <= b + 1e-9);
  const xs = grille([xA, xB, ...x0, ...secs.filter(x => x >= xA && x <= xB)], h);
  const ys = grille(ptsY, h);
  const Dy = y => E * 1000 * epaisseur(deck, y) ** 3 / (12 * (1 - nu * nu));
  const kLigne = i => (Array.isArray(kv) ? kv[i] : kv);
  const appuis = x0.flatMap((x, i) => yb.map((y, k) => ({ x, y, k: kLigne(i), ligne: i, rang: k })));
  const P = new PlaqueDF({ xs, ys, D: (_, y) => Dy(y), nu, appuis });
  const iSec = secs.map(x => P.plusProche(xs, x)), jFib = deck.ys.map(y => P.plusProche(ys, y));
  return { P, deck, xs, ys, yb, a, nb, iSec, jFib, E, nu, h };
}

/** Résultats d'un cas de charge aux sections × fibres de la poutre, réactions par appareil et par ligne. */
export function resultats(M, w) {
  const { P, iSec, jFib, deck, xs, ys } = M;
  const m = P.moments(w);
  const at = (arr, s, f) => arr[P.idx(iSec[s], jFib[f])];
  const mx = iSec.map((_, s) => jFib.map((_, f) => at(m.mx, s, f)));
  const my = iSec.map((_, s) => jFib.map((_, f) => at(m.my, s, f)));
  const mxy = iSec.map((_, s) => jFib.map((_, f) => at(m.mxy, s, f)));
  // moment total sur la largeur (règle des trapèzes sur la grille) : contrôle d'équilibre avec la poutre
  const Mtot = iSec.map(i => { let t = 0; for (let j = 1; j < ys.length; j++) t += (m.mx[P.idx(i, j)] + m.mx[P.idx(i, j - 1)]) / 2 * (ys[j] - ys[j - 1]); return t; });
  const reac = P.reactions(w);
  const nL = deck.beam.x0.length;
  const R = Array.from({ length: nL }, (_, i) => reac.filter(r => r.ligne === i).reduce((s, r) => s + r.R, 0));
  const Rapp = Array.from({ length: nL }, (_, i) => reac.filter(r => r.ligne === i).sort((u, v) => u.rang - v.rang).map(r => r.R));
  return { mx, my, mxy, Mtot, R, Rapp, w, champ: m, xs, ys };
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
  return { fichiers, mx: somme('mx'), my: somme('my'), mxy: somme('mxy'), Mtot: somme('Mtot'), R: somme('R'), Rapp: somme('Rapp') };
}
