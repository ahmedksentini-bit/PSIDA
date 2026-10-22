/**
 * Plans d'exécution — modèle de dessin commun aux sorties SVG/PDF et DXF.
 *
 * Une VUE contient des entités en coordonnées réelles (m, repère de la vue : x vers la droite, y vers le haut) rangées
 * par calque, et une échelle (dénominateur : 50 pour 1/50). Les hauteurs de texte et les tailles de symboles sont
 * données en mm papier. Une FEUILLE (A1, A3…) place des vues (origine en mm papier), des tableaux et un cartouche.
 *
 * Entités :
 *   { t: 'ligne', a, b }                          { t: 'poly', pts, ferme }
 *   { t: 'cercle', c, r, plein }                  { t: 'arc', c, r, a0, a1 } (rad, sens trigonométrique)
 *   { t: 'texte', p, s, h, ancre: 'g'|'c'|'d', v: 'b'|'m'|'h', angle (deg), gras }
 *   { t: 'hachure', pts }                         (béton coupé : hachures à 45°)
 *   { t: 'cote', a, b, d, texte? }                cote alignée a → b, ligne de cote décalée de d (m, à gauche de a→b)
 *   { t: 'coteH', a, b, z } / { t: 'coteV', a, b, x }   cote horizontale / verticale attachée à l'objet
 *   { t: 'niveau', p, z, s? }                     repère de niveau (triangle + cote)
 *   { t: 'repere', p, n, cible? }                 bulle de repère d'armature (n), flèche vers cible
 */

export const CALQUES = {
  COFFRAGE: { couleur: 7, ep: 0.5, type: 'CONTINUOUS' },
  VUES: { couleur: 8, ep: 0.25, type: 'DASHED' },          // arêtes cachées, chanfreins vus de dessus
  AXES: { couleur: 1, ep: 0.18, type: 'CENTER' },
  COTES: { couleur: 3, ep: 0.18, type: 'CONTINUOUS' },
  NIVEAUX: { couleur: 3, ep: 0.18, type: 'CONTINUOUS' },
  TEXTES: { couleur: 7, ep: 0.18, type: 'CONTINUOUS' },
  HACHURES: { couleur: 8, ep: 0.13, type: 'CONTINUOUS' },
  APPAREILS: { couleur: 5, ep: 0.35, type: 'CONTINUOUS' },
  EQUIPEMENTS: { couleur: 4, ep: 0.35, type: 'CONTINUOUS' },
  ACIERS: { couleur: 1, ep: 0.5, type: 'CONTINUOUS' },
  ACIERS_COUPES: { couleur: 1, ep: 0.35, type: 'CONTINUOUS' },
  REPERES: { couleur: 6, ep: 0.25, type: 'CONTINUOUS' },
  CARTOUCHE: { couleur: 7, ep: 0.35, type: 'CONTINUOUS' },
  TABLEAUX: { couleur: 7, ep: 0.18, type: 'CONTINUOUS' },
  CADRES: { couleur: 8, ep: 0.25, type: 'DASHED' },
  TERRAIN: { couleur: 8, ep: 0.35, type: 'CONTINUOUS' },        // cadre tireté autour de chaque vue
};

export const FORMATS = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297] };
/** Cadre de la feuille (marge de reliure 20 mm à gauche, 10 mm ailleurs) ; cartouche en bande sur toute la largeur du bas. */
export const CADRE = { x0: 20, y0: 10, d: 10, bande: 34, mention: 6 };
/** Haut de la zone réservée au cartouche et à la mention à l'entrepreneur (mm papier). */
export const hautBande = () => CADRE.y0 + CADRE.bande + CADRE.mention;
export const ECHELLES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

/** Plus grande échelle normalisée qui fait tenir une étendue [L, H] (m) dans un cadre [W, H] (mm). */
export function echelleQuiTient([L, H], [W, Hc]) {
  for (const e of ECHELLES) if (L * 1000 / e <= W && H * 1000 / e <= Hc) return e;
  return ECHELLES[ECHELLES.length - 1];
}

export class Vue {
  constructor(titre, { echelle = 50, echelleV = null } = {}) {
    this.titre = titre; this.echelle = echelle; this.echelleV = echelleV; this.ents = [];
    this.echelleMax = null;   // échelle la plus petite admise (dénominateur) pour le choix du format
  }
  _add(calque, e) { this.ents.push({ ...e, calque }); return this; }
  ligne(calque, a, b) { return this._add(calque, { t: 'ligne', a, b }); }
  poly(calque, pts, ferme = false) { return this._add(calque, { t: 'poly', pts, ferme }); }
  cercle(calque, c, r, plein = false) { return this._add(calque, { t: 'cercle', c, r, plein }); }
  arc(calque, c, r, a0, a1) { return this._add(calque, { t: 'arc', c, r, a0, a1 }); }
  texte(calque, p, s, { h = 2.5, ancre = 'g', v = 'b', angle = 0, gras = false } = {}) { return this._add(calque, { t: 'texte', p, s: String(s), h, ancre, v, angle, gras }); }
  hachure(pts) { return this._add('HACHURES', { t: 'hachure', pts }); }
  /** Terrain naturel : ligne et petits traits obliques côté sol (cote = −1 : sous la ligne), espacés en mm papier. */
  terrain(pts, cote = -1) { return this._add('TERRAIN', { t: 'terrain', pts, cote }); }
  /** Pointillé (béton de propreté, remblai, gros béton) : points répartis dans le polygone, densité en mm papier. */
  pointille(pts, pas = 2.2) { return this._add('HACHURES', { t: 'pointille', pts, pas }); }
  /** Fût ou pieu cylindrique vu en élévation : génératrices resserrées vers les bords (ombrage du cylindre). */
  cylindre(x0, x1, z0, z1, n = 9) {
    const xc = (x0 + x1) / 2, R = (x1 - x0) / 2;
    for (let k = 1; k < n; k++) { const x = xc - R * Math.cos(Math.PI * k / n); this.ligne('HACHURES', [x, z0], [x, z1]); }
    return this;
  }
  /** Béton de propreté (ép. e) sous une semelle [x0, x1] dont la sous-face est à z. */
  proprete(x0, x1, z, e = 0.10) {
    const p = [[x0 - 0.10, z - e], [x1 + 0.10, z - e], [x1 + 0.10, z], [x0 - 0.10, z]];
    this.poly('COFFRAGE', p, true); return this.pointille(p, 1.4);
  }
  cote(a, b, d, texte = null) { return this._add('COTES', { t: 'cote', a, b, d, texte }); }
  /** Cote horizontale entre les points a et b (attaches sur l'objet), ligne de cote à l'ordonnée z (m). */
  coteH(a, b, z, texte = null) { return this._add('COTES', { t: 'coteH', a, b, z, texte }); }
  /** Cote verticale entre a et b, ligne de cote à l'abscisse x (m). */
  coteV(a, b, x, texte = null) { return this._add('COTES', { t: 'coteV', a, b, x, texte }); }
  niveau(p, z, s = null) { return this._add('NIVEAUX', { t: 'niveau', p, z, s }); }
  repere(p, n, cible = null) { return this._add('REPERES', { t: 'repere', p, n, cible }); }
  /** Étendue en m (avec une marge pour les cotes et les textes). */
  etendue(marge = 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ajoute = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    for (const e of this.ents) {
      if (e.t === 'ligne') { ajoute(e.a); ajoute(e.b); } else if (e.t === 'poly' || e.t === 'hachure' || e.t === 'terrain' || e.t === 'pointille') e.pts.forEach(ajoute);
      else if (e.t === 'cercle' || e.t === 'arc') { ajoute([e.c[0] - e.r, e.c[1] - e.r]); ajoute([e.c[0] + e.r, e.c[1] + e.r]); }
      else if (e.t === 'cote') { ajoute(e.a); ajoute(e.b); const n = normaleG(e.a, e.b); ajoute([e.a[0] + n[0] * e.d, e.a[1] + n[1] * e.d]); ajoute([e.b[0] + n[0] * e.d, e.b[1] + n[1] * e.d]); }
      else if (e.t === 'coteH') { ajoute(e.a); ajoute(e.b); ajoute([e.a[0], e.z]); ajoute([e.b[0], e.z]); }
      else if (e.t === 'coteV') { ajoute(e.a); ajoute(e.b); ajoute([e.x, e.a[1]]); ajoute([e.x, e.b[1]]); }
      else if (e.t === 'texte' && this.echelle) {
        // emprise du texte (police condensée) : largeur 0,53 h par caractère, à l'échelle de la vue
        const kx = this.echelle / 1000, ky = (this.echelleV || this.echelle) / 1000, w = 0.53 * e.h * e.s.length * (e.gras ? 1.12 : 1), hh = e.h;
        const vert = Math.abs(Math.abs(e.angle || 0) - 90) < 1;
        const [W, H] = vert ? [hh * kx, w * ky] : [w * kx, hh * ky];
        const ax = vert ? 0.5 : (e.ancre === 'c' ? 0.5 : e.ancre === 'd' ? 1 : 0), ay = vert ? (e.ancre === 'c' ? 0.5 : 0) : (e.v === 'm' ? 0.5 : e.v === 'h' ? 1 : 0);
        ajoute([e.p[0] - ax * W, e.p[1] - ay * H]); ajoute([e.p[0] + (1 - ax) * W, e.p[1] + (1 - ay) * H]);
      } else if (e.t === 'niveau' && this.echelle) {
        const kx = this.echelle / 1000, ky = (this.echelleV || this.echelle) / 1000, n = (e.s ? e.s.length + 7 : 6);
        ajoute(e.p); ajoute([e.p[0] + (3.1 + 0.53 * 2.2 * n) * kx, e.p[1] + 6 * ky]);
      } else if (e.t === 'repere' && this.echelle) {
        const k = this.echelle / 1000, ky = (this.echelleV || this.echelle) / 1000; ajoute([e.p[0] - 3 * k, e.p[1] - 3 * ky]); ajoute([e.p[0] + 3 * k, e.p[1] + 3 * ky]);
        if (e.cible) ajoute(e.cible);
      } else if (e.p) ajoute(e.p);
    }
    return { x0: x0 - marge, y0: y0 - marge, x1: x1 + marge, y1: y1 + marge };
  }
}

/** Normale unitaire à gauche du segment a → b. */
export function normaleG(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; }

/** Feuille : format, vues placées, tableaux, cartouche. */
export class Feuille {
  constructor(format = 'A1', { titre = '', cartouche = {} } = {}) {
    this.format = format; [this.W, this.H] = FORMATS[format]; this.titre = titre; this.cartouche = cartouche;
    this.vues = []; this.tableaux = []; this.notes = []; this.papier = [];   // papier : primitives libres en mm (croquis du bordereau)
  }
  /** Place une vue : coin bas-gauche (mm papier) de son étendue. */
  placer(vue, x, y) { this.vues.push({ vue, x, y }); return this; }
  /** Place une vue centrée dans un cadre [x, y, w, h] (mm), échelle choisie pour tenir si `auto`. */
  placerDans(vue, [x, y, w, h], { auto = true, marge = 14 } = {}) {
    const E = vue.etendue();
    if (auto) {
      const L = E.x1 - E.x0, Hh = (E.y1 - E.y0) * (vue.echelleV ? vue.echelle / vue.echelleV : 1);
      vue.echelle = echelleQuiTient([L, Hh], [w - 2 * marge, h - 2 * marge - 8]);
    }
    const sx = 1000 / vue.echelle, sy = vue.echelleV ? 1000 / vue.echelleV : sx;
    const wv = (E.x1 - E.x0) * sx, hv = (E.y1 - E.y0) * sy;
    this.vues.push({ vue, x: x + (w - wv) / 2, y: y + (h - 8 - hv) / 2, cadre: [x, y, w, h] });
    return this;
  }
  tableau(tab, x, y) { this.tableaux.push({ ...tab, x, y }); return this; }
  /**
   * Boîtes occupées (mm papier) : vues (étendue à l'échelle, titre et échelles graphiques compris), tableaux, notes,
   * cartouche ; contrôle de mise en page : chevauchements et sorties du cadre.
   */
  boites() {
    const B = [];
    for (const pl of this.vues) { const [x, y, w, h] = boiteVuePlacee(pl); B.push({ nom: pl.vue.titre, x, y, w, h }); }
    for (const t of this.tableaux) {
      const W = t.cols.reduce((s, c) => s + c.w, 0), H = (t.lignes.length + 1 + (t.titre ? 1 : 0)) * (t.hl || 6);
      B.push({ nom: t.titre || 'tableau', x: t.x, y: t.y, w: W, h: H });
    }
    for (const n of this.notes) {
      const [x, y, w, h] = boiteNote(n);
      B.push({ nom: 'notes', x, y, w, h });
    }
    B.push({ nom: 'cartouche', x: CADRE.x0, y: CADRE.y0, w: this.W - CADRE.d - CADRE.x0, h: CADRE.bande + CADRE.mention - 1 });
    return B;
  }
  valide() {
    const B = this.boites(), pb = [], m = 0.5;
    for (const b of B) if (b.x < CADRE.x0 - m || b.y < CADRE.y0 - m || b.x + b.w > this.W - CADRE.d + m || b.y + b.h > this.H - CADRE.d + m) pb.push(`hors cadre : ${b.nom}`);
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      if (a.x < b.x + b.w - m && b.x < a.x + a.w - m && a.y < b.y + b.h - m && b.y < a.y + a.h - m) pb.push(`chevauchement : ${a.nom} / ${b.nom}`);
    }
    return { ok: pb.length === 0, problemes: pb };
  }
  note(lignes, x, y, h = 2.5) { this.notes.push({ lignes, x, y, h }); return this; }
}

/** Marges du cadre tireté d'une vue et hauteur réservée au titre (titre, « Ech : 1/50 », échelle graphique). */
export const VUE_PAD = 4, VUE_TITRE = 15;
/** Largeur du titre d'une vue et de sa ligne d'échelle (mm papier). */
export function largeurTitreVue(v) { return Math.max(0.6 * 3.8 * v.titre.length + 4, v.echelleV ? 215 : 100); }
/** Cadre tireté d'une vue placée : [x, y, w, h] (mm papier) ; pl.boite si la mise en page l'a fixé. */
export function boiteVuePlacee(pl) {
  if (pl.boite) return pl.boite;
  const v = pl.vue, E = v.etendue(), sx = 1000 / v.echelle, sy = v.echelleV ? 1000 / v.echelleV : sx;
  const w = (E.x1 - E.x0) * sx, h = (E.y1 - E.y0) * sy, wt = largeurTitreVue(v), W = Math.max(w, wt);
  return [pl.x - (W - w) / 2 - VUE_PAD, pl.y - VUE_PAD, W + 2 * VUE_PAD, h + VUE_TITRE + 2 * VUE_PAD];
}
/** Encadré d'un bloc de notes (« NOTA ») : [x, y, w, h]. */
export function boiteNote(n) {
  const W = Math.max(...n.lignes.map(l => 0.52 * n.h * l.length)), H = n.lignes.length * n.h * 1.6;
  return [n.x - 2, n.y - H + n.h - 2, W + 4, H + 3];
}

/**
 * Transformation d'une vue placée : coordonnées réelles (m) → mm papier (repère feuille, y vers le haut).
 * Les vues à échelle verticale distincte (coupes longitudinales dilatées) utilisent echelleV pour y.
 */
export function transfo(pl) {
  const v = pl.vue, E = v.etendue(), sx = 1000 / v.echelle, sy = v.echelleV ? 1000 / v.echelleV : sx;
  return { f: p => [pl.x + (p[0] - E.x0) * sx, pl.y + (p[1] - E.y0) * sy], sx, sy, E };
}

/** Format d'une cote : en mètres, deux décimales, virgule décimale (convention du plan, rappelée dans les notes). */
export const fmtCote = m => m.toFixed(2).replace('.', ',');
export const fmtNiv = z => (z >= 0 ? '+' : '') + z.toFixed(2).replace('.', ',');

/**
 * Hachures à 45° d'un polygone (coordonnées papier, mm) : segments intérieurs, pas `pas` mm.
 * Calcul par balayage : intersection de chaque droite x − y = k avec les côtés du polygone, paires d'intersections.
 */
export function hachuresPoly(pts, pas = 2) {
  const out = [], n = pts.length;
  const ks = pts.map(p => p[0] - p[1]), kmin = Math.min(...ks), kmax = Math.max(...ks);
  for (let k = Math.ceil(kmin / pas) * pas; k <= kmax; k += pas) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], fa = a[0] - a[1] - k, fb = b[0] - b[1] - k;
      if ((fa < 0) !== (fb < 0)) { const t = fa / (fa - fb); xs.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    xs.sort((p, q) => p[0] - q[0]);
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  }
  return out;
}

/** Cote : géométrie papier (lignes d'attache, ligne de cote, traits obliques, position et angle du texte). */
export function geomCote(A, B, dmm, { attache = 2, deborde = 2, tick = 1.5 } = {}) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, u = [dx / L, dy / L], n = [-u[1], u[0]];
  const s = Math.sign(dmm) || 1, A2 = [A[0] + n[0] * dmm, A[1] + n[1] * dmm], B2 = [B[0] + n[0] * dmm, B[1] + n[1] * dmm];
  const lignes = [
    [[A[0] + n[0] * s * attache * 0.5, A[1] + n[1] * s * attache * 0.5], [A2[0] + n[0] * s * deborde, A2[1] + n[1] * s * deborde]],
    [[B[0] + n[0] * s * attache * 0.5, B[1] + n[1] * s * attache * 0.5], [B2[0] + n[0] * s * deborde, B2[1] + n[1] * s * deborde]],
    [[A2[0] - u[0] * deborde, A2[1] - u[1] * deborde], [B2[0] + u[0] * deborde, B2[1] + u[1] * deborde]],
  ];
  const t = [(u[0] + n[0]) / Math.SQRT2 * tick, (u[1] + n[1]) / Math.SQRT2 * tick];
  for (const P of [A2, B2]) lignes.push([[P[0] - t[0], P[1] - t[1]], [P[0] + t[0], P[1] + t[1]]]);
  let ang = Math.atan2(u[1], u[0]) * 180 / Math.PI; if (ang > 90.01) ang -= 180; if (ang < -89.99) ang += 180;
  const mid = [(A2[0] + B2[0]) / 2 + n[0] * s * 1.0, (A2[1] + B2[1]) / 2 + n[1] * s * 1.0];
  return { lignes, texte: { p: mid, angle: ang, v: s > 0 ? 'b' : 'h' } };
}

