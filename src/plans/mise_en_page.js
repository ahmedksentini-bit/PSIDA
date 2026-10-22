/**
 * Mise en page automatique d'une feuille : les vues sont rangées par rangées (de haut en bas), une colonne est réservée en
 * bas à droite (cartouche, tableaux, notes) ou sur toute la hauteur (bordereau). On cherche le plus petit format où toutes
 * les vues tiennent à leur échelle cible, puis on agrandit les échelles (1/100 → 1/75 → 1/50…) tant que la feuille le
 * permet, pour remplir la place disponible. L'espace vertical restant est réparti entre les rangées.
 *
 * Spécification : {
 *   titre, cartouche,
 *   rangees : [[vue, …], …]           (ordre d'affichage)
 *   groupes : [{ vues: [vue, …], cible, min, refaire? }]  (refaire(e) → nouvelles vues, si le dessin dépend de l'échelle)
 *   groupes (suite)   vues à la même échelle ; cible = échelle à tenir au moins (dénominateur
 *                                      maximal), min = échelle la plus grande admise (dénominateur minimal)
 *   colonne : { largeur, hauteur }     zone réservée en bas à droite (hauteur Infinity : toute la hauteur)
 *   aligner : [{ ref, vue }]           vue placée aux mêmes abscisses que ref (projection)
 *   poser(F, zone)                     place tableaux et notes dans la colonne (zone = [x, y, w, h])
 * }
 */
import { Feuille, ECHELLES, VUE_PAD, VUE_TITRE, largeurTitreVue, hautBande, CADRE } from './dessin.js';

const GAPX = 6, GAPY = 5, GMAX = 20;

/** Boîte d'une vue à son échelle courante (mm papier) : dessin + titre + échelles graphiques. */
export function boiteVue(v) {
  const E = v.etendue(), sx = 1000 / v.echelle, sy = v.echelleV ? 1000 / v.echelleV : sx;
  const w = (E.x1 - E.x0) * sx, h = (E.y1 - E.y0) * sy;
  return { w: Math.max(w, largeurTitreVue(v)) + 2 * VUE_PAD, h: h + VUE_TITRE + 2 * VUE_PAD, wd: w, hd: h };
}

/** Essaie de ranger les vues dans le format : positions, ou null si elles ne tiennent pas. */
function ranger(format, spec, enHaut = false) {
  const F = new Feuille(format, {});
  const x0 = CADRE.x0 + 1.5, x1 = F.W - CADRE.d - 1.5, y0 = hautBande() + 1, y1 = F.H - CADRE.d - 1.5;
  const cw = spec.colonne ? spec.colonne.largeur : 0, ch = spec.colonne ? Math.min(spec.colonne.hauteur, y1 - y0) : 0;
  const xr = x1 - cw - 8, cb = enHaut ? y1 - ch : y0, ct = enHaut ? y1 : y0 + ch;   // colonne réservée : x ≥ xr, cb ≤ y ≤ ct
  const rangs = spec.rangees.map(r => r.map(v => ({ v, b: boiteVue(v) })));
  // vues d'une rangée (hauts alignés) : une vue qui descend dans la hauteur de la colonne doit rester à sa gauche ;
  // écart uniforme (≤ 40 mm) le plus grand possible, bloc centré dans la marge restante
  const placerRangee = (r, haut) => {
    const lim = r.map(q => (haut - q.b.h < ct - 1e-6 && haut > cb + 1e-6 ? xr : x1) - x0);
    let cum = 0, g = 40;
    const W = r.map((q, i) => { cum += q.b.w; return cum; });
    for (let i = 0; i < r.length; i++) {
      if (W[i] > lim[i] + 1e-6) return null;
      if (i > 0) g = Math.min(g, (lim[i] - W[i]) / i);
    }
    if (r.length > 1 && g < GAPX - 1e-6) return null;
    if (r.length === 1) g = 0;
    const off = Math.min(...r.map((q, i) => lim[i] - W[i] - g * i)) / 2;
    return r.map((q, i) => {
      const bx = x0 + off + W[i] - q.b.w + g * i;
      return { vue: q.v, x: bx + (q.b.w - q.b.wd) / 2, y: haut - VUE_PAD - VUE_TITRE - q.b.hd, boite: [bx, haut - q.b.h, q.b.w, q.b.h] };
    });
  };
  const essayer = (ecart, marge) => {
    let y = y1 - marge; const out = [];
    for (const r of rangs) {
      const h = Math.max(...r.map(q => q.b.h));
      if (y - h < y0 - 1e-6) return null;
      const p = placerRangee(r, y); if (!p) return null;
      out.push(...p); y -= h + GAPY + ecart;
    }
    return out;
  };
  let placees = essayer(0, 0);
  if (!placees) return null;
  // place verticale restante : écart entre rangées plafonné, bloc centré verticalement (si les largeurs restent admissibles)
  const htot = rangs.reduce((s, r) => s + Math.max(...r.map(q => q.b.h)), 0) + GAPY * (rangs.length - 1);
  const reste = y1 - y0 - htot;
  if (reste > 1) {
    const g = Math.min(reste / (rangs.length + 1), GMAX), marge = (reste - g * (rangs.length - 1)) / 2;
    const p2 = essayer(g, marge) || essayer(g, 0) || essayer(0, 0);
    if (p2) placees = p2;
  }
  return { F, placees, colonne: [x1 - cw, cb, cw, ch], enHaut };
}

/** Feuille mise en page (formats essayés dans l'ordre), échelles agrandies au mieux. */
export function composer(spec, formats = ['A3', 'A2', 'A1', 'A0']) {
  const fi = spec.cartouche && spec.cartouche.format;
  if (fi && fi !== 'auto' && ['A3', 'A2', 'A1', 'A0'].includes(fi)) formats = [fi];   // format imposé (carte des plans)
  else formats = ['A3', 'A2', 'A1', 'A0'].filter(f => formats.includes(f) || f === 'A3');
  const gs = spec.groupes;
  const fixer = (g, e) => {
    if (g.refaire) {   // vues dont le dessin dépend de l'échelle (décalages papier) : reconstruites
      g._cache = g._cache || {}; const nv = g._cache[e] || (g._cache[e] = g.refaire(e));   // mêmes objets pour une même échelle
      for (const v of nv) v.echelle = e;
      spec.rangees = spec.rangees.map(r => r.map(v => { const k = g.vues.indexOf(v); return k >= 0 ? nv[k] : v; }));
      const rem = v => { const k = g.vues.indexOf(v); return k >= 0 ? nv[k] : v; };
      if (spec.aligner) spec.aligner = spec.aligner.map(a => ({ ref: rem(a.ref), vue: rem(a.vue) }));
      g.vues = nv; return;
    }
    for (const v of g.vues) { if (v.echelleV) v.echelleV = ECHELLES.filter(x => x <= e / 3).pop() || 10; v.echelle = e; } };
  let res = null;
  for (const f of formats) {
    for (const g of gs) fixer(g, g.cible);
    res = ranger(f, spec) || (spec.colonne ? ranger(f, spec, true) : null);
    if (res) {
      // agrandissement : chaque groupe passe à l'échelle supérieure tant que la feuille tient
      let progres = true;
      while (progres) {
        progres = false;
        for (const g of gs) {
          const e = g.vues[0].echelle, plus = ECHELLES.filter(x => x < e && x >= (g.min || 10)).pop();
          if (!plus) continue;
          fixer(g, plus);
          const r2 = ranger(f, spec, res.enHaut) || ranger(f, spec, !res.enHaut);
          if (r2) { res = r2; progres = true; } else fixer(g, e);
        }
      }
      break;
    }
  }
  if (!res) {   // rien ne tient à l'échelle cible : plus grand format, échelles réduites jusqu'à ce que ça tienne
    const f = formats[formats.length - 1];
    for (let k = 0; k < 8 && !res; k++) { for (const g of gs) { const e = g.vues[0].echelle, moins = ECHELLES.find(x => x > e); if (moins) fixer(g, moins); } res = ranger(f, spec) || (spec.colonne ? ranger(f, spec, true) : null); }
    if (!res) throw new Error('mise en page impossible');
  }
  const F = res.F;
  F.titre = spec.titre; F.cartouche = { ...(spec.cartouche || {}) };
  F.vues = res.placees;
  // projections alignées (ex. vue en plan sous l'élévation : mêmes abscisses)
  for (const { ref, vue } of spec.aligner || []) {
    const pr = F.vues.find(p => p.vue === ref), pv = F.vues.find(p => p.vue === vue);
    if (pr && pv && pr.vue.echelle === pv.vue.echelle) {
      const nx = pr.x + (vue.etendue().x0 - ref.etendue().x0) * 1000 / ref.echelle, dx = nx - pv.x;
      const b = pv.boite, xmin = CADRE.x0 + 1.5;
      const nb = b && [b[0] + dx, b[1], b[2], b[3]], xmax = F.W - CADRE.d - 1.5;
      const recouvre = nb && F.vues.some(q => q !== pv && q.boite && nb[0] < q.boite[0] + q.boite[2] && q.boite[0] < nb[0] + nb[2] && nb[1] < q.boite[1] + q.boite[3] && q.boite[1] < nb[1] + nb[3]);
      const col = nb && res.colonne && res.colonne[2] > 0 && nb[0] + nb[2] > res.colonne[0] - 8 && nb[1] < res.colonne[1] + res.colonne[3] && nb[1] + nb[3] > res.colonne[1];
      if (!b || (nb[0] >= xmin && nb[0] + nb[2] <= xmax && !recouvre && !col)) { pv.x = nx; if (b) pv.boite = nb; }
    }
  }
  if (spec.poser) spec.poser(F, res.colonne);
  return F;
}
