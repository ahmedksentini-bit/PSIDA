/**
 * Cadre fermé à une ou plusieurs cellules (PICF), résolu par la méthode des déplacements.
 * Portage de BVTrace.Core/MultiCellBoxFrame.cs : géométrie aux feuillets moyens, jeux de charges scalaires par travée
 * (combinaisons = combinaisons linéaires de jeux, le cadre est résolu une fois par combinaison), réaction du sol linéaire
 * (radier rigide, N/A ± M/I) ou sol de Winkler (programme SETRA PICF-EL), poussées trapézoïdales éventuellement
 * dissymétriques (phasage de remblaiement), frottement sous radier, sous-pression, bandes de charge localisées.
 *
 * Géométrie : { ouv: [l1, l2, …] (ouvertures intérieures, m), h (hauteur intérieure), et (traverse), er (radier),
 *               ep (piédroits extérieurs), ei (voiles intermédiaires) }.
 * Charges : t/m² (ou kN/m², cohérent) ; poussées en pression sur les piédroits, positives vers l'intérieur.
 */
import { resoudrePortique } from './portique.js';

export const nCell = g => g.ouv.length;
export const epVoile = (g, j) => (j === 0 || j === nCell(g)) ? g.ep : g.ei;
/** Portée de calcul de la cellule i (axe à axe des voiles). */
export const portee = (g, i) => g.ouv[i] + (epVoile(g, i) + epVoile(g, i + 1)) / 2;
/** Hauteur de calcul, feuillet moyen du radier → feuillet moyen de la traverse. */
export const hauteurCalc = g => g.h + (g.et + (g.er || 0)) / 2;
export const xNoeud = (g, j) => { let x = 0; for (let i = 0; i < j && i < nCell(g); i++) x += portee(g, i); return x; };
export const largeurCalc = g => { let s = 0; for (let i = 0; i < nCell(g); i++) s += portee(g, i); return s; };

/** Portée biaise : lc / sin(biais), biais en DEGRÉS (90° = droit). */
export function porteeBiaise(lc, biaisDeg) {
  const s = Math.sin(biaisDeg * Math.PI / 180);
  if (Math.abs(s) < 1e-9) throw new RangeError('biais nul : la portée de calcul serait infinie');
  return lc / Math.abs(s);
}

/** Applique un biais : c'est l'entraxe des voiles qui s'allonge en 1/sin, d'où (l+e)/sin et non l/sin + e. */
export function avecBiais(g, biaisDeg) {
  const ouv = g.ouv.map((l, i) => {
    const e = (epVoile(g, i) + epVoile(g, i + 1)) / 2, s = porteeBiaise(l + e, biaisDeg) - e;
    if (!(s > 0)) throw new RangeError(`biais ${biaisDeg}° : la cellule ${i + 1} n'a plus d'ouverture positive`);
    return s;
  });
  return { ...g, ouv };
}

export function valider(g, ouvert = false) {
  const n = nCell(g);
  if (n < 1) throw new Error('un cadre a au moins une cellule');
  g.ouv.forEach((l, i) => { if (!(l > 0)) throw new RangeError(`ouverture ${i + 1} nulle ou négative`); });
  for (const k of ouvert ? ['h', 'et', 'ep'] : ['h', 'et', 'er', 'ep']) if (!(g[k] > 0)) throw new RangeError(`dimension ${k} nulle ou négative`);
  if (n > 1 && !(g.ei > 0)) throw new RangeError(`épaisseur des voiles intermédiaires non renseignée alors que l'ouvrage compte ${n} cellules`);
}

// ── Jeux de charges ────────────────────────────────────────────────────────────────────────────────
/** Jeu de charges : v (charge verticale par travée), poussées G/D en pied et en tête, poids d'un voile, sous-pression, bandes. */
export const jeu = (n, o = {}) => ({ v: o.v || new Array(n).fill(0), gB: o.gB || 0, gH: o.gH || 0, dB: o.dB || 0, dH: o.dH || 0, pv: o.pv || 0, up: o.up || 0, bandes: o.bandes || [], bandesVoile: o.bandesVoile || [], fTop: o.fTop || 0 });
export const jeuZero = n => jeu(n);
export const echelle = (s, k) => ({ v: s.v.map(x => x * k), gB: s.gB * k, gH: s.gH * k, dB: s.dB * k, dH: s.dH * k, pv: s.pv * k, up: s.up * k, bandes: s.bandes.map(b => ({ ...b, q: b.q * k })), bandesVoile: (s.bandesVoile || []).map(b => ({ ...b, q: b.q * k })), fTop: (s.fTop || 0) * k });
export function plus(s, o) {
  if (s.v.length !== o.v.length) throw new Error(`jeux de charges à ${s.v.length} et ${o.v.length} travées`);
  return { v: s.v.map((x, i) => x + o.v[i]), gB: s.gB + o.gB, gH: s.gH + o.gH, dB: s.dB + o.dB, dH: s.dH + o.dH, pv: s.pv + o.pv, up: s.up + o.up, bandes: [...s.bandes, ...o.bandes], bandesVoile: [...(s.bandesVoile || []), ...(o.bandesVoile || [])], fTop: (s.fTop || 0) + (o.fTop || 0) };
}
export const combiner = (n, termes) => termes.reduce((acc, [k, s]) => plus(acc, echelle(s, k)), jeuZero(n));
export const vertical = (n, q, charges = null) => jeu(n, { v: Array.from({ length: n }, (_, i) => (!charges || charges[i]) ? q : 0) });
export const poussee = (n, gB, gH, dB = gB, dH = gH) => jeu(n, { gB, gH, dB, dH });
export const poidsVoile = (n, t) => jeu(n, { pv: t });
/** Bande de charge { travee, x0, l, q } mesurée depuis l'axe du voile gauche de la travée. */
export const bandes = (n, liste) => jeu(n, { bandes: liste });
/** Bande horizontale sur le voile j (0 = piédroit gauche) : { voile, z0, l, q } — z0 depuis le feuillet moyen du radier
 *  (ou la base d'un portique ouvert), q > 0 dirigé vers +x (vers la droite). Sert au choc de véhicule. */
export const bandesVoile = (n, liste) => jeu(n, { bandesVoile: liste });
/** Force horizontale totale F (vers +x) au niveau de la traverse, répartie sur les nœuds de tête au prorata des largeurs tributaires. */
export const forceTete = (n, F) => jeu(n, { fTop: F });

const centroide = (pB, pH, h) => { const s = pB + pH; return Math.abs(s) < 1e-15 ? h / 2 : h * (pB + 2 * pH) / (3 * s); };

/** Schémas de chargement partiel : toutes les combinaisons de travées chargées sauf la vide. */
export function schemasPartiels(n) {
  if (n < 1 || n > 16) throw new RangeError('nombre de cellules hors de 1 à 16');
  const out = [];
  for (let m = 1; m < (1 << n); m++) out.push(Array.from({ length: n }, (_, i) => (m & (1 << i)) !== 0));
  return out;
}
export function nomSchema(p) {
  const on = p.map((b, i) => b ? String(i + 1) : null).filter(Boolean);
  if (on.length === p.length) return 'toutes travées chargées';
  return on.length === 1 ? `travée ${on[0]} chargée` : `travées ${on.join(', ')} chargées`;
}

// ── Modèle et résolution ───────────────────────────────────────────────────────────────────────────
const nBas = j => j, nHaut = (n, j) => n + 1 + j;
const iTrav = (n, i) => i, iRad = (n, i) => n + i, iVoile = (n, j) => 2 * n + j;

function construire(g, ks = 0, ouvert = false) {
  valider(g, ouvert);
  const n = nCell(g), hc = hauteurCalc(g), x = [0];
  for (let i = 0; i < n; i++) x.push(x[i] + portee(g, i));
  const noeuds = [...x.map(xi => [xi, 0]), ...x.map(xi => [xi, hc])];
  const sec = e => ({ I: e ** 3 / 12, A: e });
  const barres = [];
  for (let i = 0; i < n; i++) barres.push({ a: nHaut(n, i), b: nHaut(n, i + 1), ...sec(g.et) });
  if (!ouvert) for (let i = 0; i < n; i++) barres.push({ a: nBas(i), b: nBas(i + 1), ...sec(g.er), ks });
  for (let j = 0; j <= n; j++) barres.push({ a: nBas(j), b: nHaut(n, j), ...sec(epVoile(g, j)) });
  return { noeuds, barres, x };
}

/** Réaction linéaire du sol : p(x) = a + b(x − L/2), ∫p = W, ∫x p = moment. Renvoie [p0, pente]. */
function pressionSol(g, W, Mx) {
  const L = largeurCalc(g), a = W / L, b = 12 * (Mx - a * L * L / 2) / (L ** 3);
  return [a - b * L / 2, b];
}

/**
 * Résout le cadre sous un jeu de charges. `sol` : { ks (raideur de Winkler, par m d'enfoncement), E (module du béton,
 * différé, même unité de force que ks) } ; absent ou ks = 0 → radier rigide à réaction linéaire.
 * `opts.ouvert` : 'encastre' | 'articule' → portique ouvert (PIPO) sans radier, pieds des voiles sur appuis ; les
 * réactions d'appui sont rendues (H vers +x, V vers le haut, M) pour le dimensionnement des semelles.
 */
export function resoudreCadre(g, s, sol = null, opts = {}) {
  const ouvert = opts.ouvert || null, rotule = !ouvert && !!opts.rotule;   // rotule : cadre fermé, nœuds du radier articulés (rigidité de distorsion)
  const actif = !ouvert && !rotule && sol && sol.ks > 0 && sol.E > 0;
  const E = actif ? sol.E : 1;
  const { noeuds, barres, x } = construire(g, actif ? sol.ks : 0, !!ouvert);
  const n = nCell(g);
  if (s.v.length !== n) throw new Error(`jeu de charges à ${s.v.length} travées pour un ouvrage qui en compte ${n}`);
  const iV = j => ouvert ? n + j : iVoile(n, j);
  const hc = hauteurCalc(g), charges = [], bands = [], nodales = [];
  let W = 0, Mx = 0, net = 0;
  for (let i = 0; i < n; i++) {
    const q = s.v[i]; if (q === 0) continue;
    charges.push({ barre: iTrav(n, i), wA: -q, wB: -q });
    const lc = portee(g, i); W += q * lc; Mx += q * lc * (x[i] + x[i + 1]) / 2;
  }
  for (const p of s.bandes) {
    if (p.travee < 0 || p.travee >= n) throw new RangeError(`bande sur la travée ${p.travee + 1}, alors que l'ouvrage en compte ${n}`);
    const lc = portee(g, p.travee), a = Math.min(Math.max(p.x0, 0), lc), b = Math.min(Math.max(p.x0 + p.l, a), lc);
    if (!(b > a) || p.q === 0) continue;
    bands.push({ barre: iTrav(n, p.travee), w: -p.q, xA: a, xB: b });
    const c = p.q * (b - a); W += c; Mx += c * (x[p.travee] + (a + b) / 2);
  }
  if (s.up !== 0 && !ouvert) {
    for (let i = 0; i < n; i++) {
      charges.push({ barre: iRad(n, i), wA: s.up, wB: s.up });
      const lc = portee(g, i); W -= s.up * lc; Mx -= s.up * lc * (x[i] + x[i + 1]) / 2;
    }
  }
  if (s.pv !== 0) for (let j = 0; j <= n; j++) { nodales.push({ noeud: nBas(j), Fx: 0, Fy: -s.pv, M: 0 }); W += s.pv; Mx += s.pv * x[j]; }
  if (s.gB || s.gH || s.dB || s.dH) {
    charges.push({ barre: iV(0), wA: -s.gB, wB: -s.gH });
    charges.push({ barre: iV(n), wA: s.dB, wB: s.dH });
    const pl = (s.gB + s.gH) / 2 * hc, pr = -(s.dB + s.dH) / 2 * hc;
    net += pl + pr;
    Mx += pl * centroide(s.gB, s.gH, hc) + pr * centroide(s.dB, s.dH, hc);
  }
  for (const b of s.bandesVoile || []) {
    if (b.voile < 0 || b.voile > n) throw new RangeError(`bande sur le voile ${b.voile}, qui n'existe pas`);
    const z0 = Math.min(Math.max(b.z0, 0), hc), z1 = Math.min(Math.max(b.z0 + b.l, z0), hc);
    if (!(z1 > z0) || b.q === 0) continue;
    // Axe y local d'un voile (barre montante) orienté vers −x : une force vers +x est négative en repère local.
    bands.push({ barre: iV(b.voile), w: -b.q, xA: z0, xB: z1 });
    const F = b.q * (z1 - z0); net += F; Mx += F * (z0 + z1) / 2;
  }
  if (s.fTop) {
    const L = largeurCalc(g);
    for (let j = 0; j <= n; j++) {
      let trib = 0; if (j > 0) trib += portee(g, j - 1) / 2; if (j < n) trib += portee(g, j) / 2;
      nodales.push({ noeud: nHaut(n, j), Fx: s.fTop * trib / L, Fy: 0, M: 0 });
    }
    net += s.fTop; Mx += s.fTop * hc;
  }
  if (!ouvert && !rotule && Math.abs(net) > 1e-15) {
    const L = largeurCalc(g);
    for (let j = 0; j <= n; j++) {
      let trib = 0; if (j > 0) trib += portee(g, j - 1) / 2; if (j < n) trib += portee(g, j) / 2;
      nodales.push({ noeud: nBas(j), Fx: -net * trib / L, Fy: 0, M: 0 });
    }
  }
  let p0 = 0, pente = 0;
  if (!actif && !ouvert && !rotule) {
    [p0, pente] = pressionSol(g, W, Mx);
    for (let i = 0; i < n; i++) charges.push({ barre: iRad(n, i), wA: p0 + pente * x[i], wB: p0 + pente * x[i + 1] });
  }
  const appuis = ouvert ? Array.from({ length: n + 1 }, (_, j) => ({ noeud: nBas(j), ddl: ouvert === 'articule' ? [0, 1] : [0, 1, 2] }))
    : rotule ? Array.from({ length: n + 1 }, (_, j) => ({ noeud: nBas(j), ddl: [0, 1] })) : null;
  const r = resoudrePortique(noeuds, barres, charges, { E, nodales, bandes: bands, appuis });
  if (actif) {
    const ga = r.barres[iRad(n, 0)], dr = r.barres[iRad(n, n - 1)];
    p0 = -ga.solAt(0); pente = (-dr.solAt(dr.L) - p0) / Math.max(largeurCalc(g), 1e-9);
  }
  const barre = (nom, b) => { const [mx, at] = b.maxTravee(), [mn, atn] = b.minTravee(); return { nom, MA: b.MA, MB: b.MB, Mmid: b.Mmid, Mmax: mx, xMmax: at, Mmin: mn, xMmin: atn, VA: b.VA, VB: b.VB, N: b.N, L: b.L, res: b }; };
  const out = {
    traverses: Array.from({ length: n }, (_, i) => barre(`Traverse ${i + 1}`, r.barres[iTrav(n, i)])),
    radiers: ouvert ? [] : Array.from({ length: n }, (_, i) => barre(`Radier ${i + 1}`, r.barres[iRad(n, i)])),
    voiles: Array.from({ length: n + 1 }, (_, j) => barre((j === 0 || j === n) ? `Piédroit ${j === 0 ? 'gauche' : 'droit'}` : `Voile ${j}`, r.barres[iV(j)])),
    pG: p0, pD: p0 + pente * largeurCalc(g), residu: (ouvert || rotule) ? 0 : r.residu,
    // résultantes des charges appliquées (hors poids du radier et des voiles) : V vers le bas, H vers +x, M au centre du radier
    charge: { V: W, H: net, M: Mx - W * largeurCalc(g) / 2 },
    // déplacement horizontal moyen de la tête relativement au pied (distorsion du cadre)
    deriveTete: Array.from({ length: n + 1 }, (_, j) => r.u[3 * nHaut(n, j)] - r.u[3 * nBas(j)]).reduce((a, b) => a + b, 0) / (n + 1),
  };
  // Réactions des appuis d'un portique ouvert : force exercée PAR l'appui sur la structure.
  if (ouvert || rotule) out.reactions = Array.from({ length: n + 1 }, (_, j) => { const k = 3 * nBas(j); return { H: r.reactions[k] ?? 0, V: r.reactions[k + 1] ?? 0, M: r.reactions[k + 2] ?? 0 }; });
  return out;
}
