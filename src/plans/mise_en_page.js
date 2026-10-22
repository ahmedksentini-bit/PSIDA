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
import { Feuille, ECHELLES } from './dessin.js';

const GAPX = 12, GAPY = 6, TITRE = 12, GMAX = 25;

/** Boîte d'une vue à son échelle courante (mm papier) : dessin + titre + échelles graphiques. */
export function boiteVue(v) {
  const E = v.etendue(), sx = 1000 / v.echelle, sy = v.echelleV ? 1000 / v.echelleV : sx;
  const w = (E.x1 - E.x0) * sx, h = (E.y1 - E.y0) * sy;
  const tl = v.titre.length + (v.echelleV ? 40 : 16), wt = 0.62 * 3.5 * tl + 8 + (v.echelleV ? 150 : 75);
  return { w: Math.max(w, wt), h: h + TITRE, wd: w, hd: h };
}

/** Essaie de ranger les vues dans le format : positions, ou null si elles ne tiennent pas. */
function ranger(format, spec) {
  const F = new Feuille(format, {});
  const x0 = 23, x1 = F.W - 12, y0 = 12, y1 = F.H - 12;
  const cw = spec.colonne ? spec.colonne.largeur : 0, ch = spec.colonne ? Math.min(spec.colonne.hauteur, y1 - y0) : 0;
  const xr = x1 - cw - 8, yc = y0 + ch;   // limite gauche de la colonne réservée, haut de la colonne
  const rangs = spec.rangees.map(r => r.map(v => ({ v, b: boiteVue(v) })));
  // vues d'une rangée (hauts alignés) : une vue qui descend dans la hauteur de la colonne doit rester à sa gauche ;
  // écart uniforme (≤ 40 mm) le plus grand possible, bloc centré dans la marge restante
  const placerRangee = (r, haut) => {
    const lim = r.map(q => (haut - q.b.h < yc - 1e-6 ? xr : x1) - x0);
    let cum = 0, g = 40;
    const W = r.map((q, i) => { cum += q.b.w; return cum; });
    for (let i = 0; i < r.length; i++) {
      if (W[i] > lim[i] + 1e-6) return null;
      if (i > 0) g = Math.min(g, (lim[i] - W[i]) / i);
    }
    if (r.length > 1 && g < GAPX - 1e-6) return null;
    if (r.length === 1) g = 0;
    const off = Math.min(...r.map((q, i) => lim[i] - W[i] - g * i)) / 2;
    return r.map((q, i) => ({ vue: q.v, x: x0 + off + W[i] - q.b.w + g * i, y: haut - TITRE - q.b.hd }));
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
  return { F, placees, colonne: [x1 - cw, y0, cw, ch] };
}

/** Feuille mise en page (formats essayés dans l'ordre), échelles agrandies au mieux. */
export function composer(spec, formats = ['A3', 'A2', 'A1', 'A0']) {
  const gs = spec.groupes;
  const fixer = (g, e) => {
    if (g.refaire) {   // vues dont le dessin dépend de l'échelle (décalages papier) : reconstruites
      const nv = g.refaire(e);
      spec.rangees = spec.rangees.map(r => r.map(v => { const k = g.vues.indexOf(v); return k >= 0 ? nv[k] : v; }));
      g.vues = nv; return;
    }
    for (const v of g.vues) { if (v.echelleV) v.echelleV = ECHELLES.filter(x => x <= e / 3).pop() || 10; v.echelle = e; } };
  let res = null;
  for (const f of formats) {
    for (const g of gs) fixer(g, g.cible);
    res = ranger(f, spec);
    if (res) {
      // agrandissement : chaque groupe passe à l'échelle supérieure tant que la feuille tient
      let progres = true;
      while (progres) {
        progres = false;
        for (const g of gs) {
          const e = g.vues[0].echelle, plus = ECHELLES.filter(x => x < e && x >= (g.min || 10)).pop();
          if (!plus) continue;
          fixer(g, plus);
          const r2 = ranger(f, spec);
          if (r2) { res = r2; progres = true; } else fixer(g, e);
        }
      }
      break;
    }
  }
  if (!res) {   // rien ne tient à l'échelle cible : plus grand format, échelles réduites jusqu'à ce que ça tienne
    const f = formats[formats.length - 1];
    for (let k = 0; k < 8 && !res; k++) { for (const g of gs) { const e = g.vues[0].echelle, moins = ECHELLES.find(x => x > e); if (moins) fixer(g, moins); } res = ranger(f, spec); }
    if (!res) throw new Error('mise en page impossible');
  }
  const F = res.F;
  F.titre = spec.titre; F.cartouche = { ...(spec.cartouche || {}) };
  F.vues = res.placees;
  // projections alignées (ex. vue en plan sous l'élévation : mêmes abscisses)
  for (const { ref, vue } of spec.aligner || []) {
    const pr = F.vues.find(p => p.vue === ref), pv = F.vues.find(p => p.vue === vue);
    if (pr && pv && pr.vue.echelle === pv.vue.echelle) pv.x = pr.x + (vue.etendue().x0 - ref.etendue().x0) * 1000 / ref.echelle;
  }
  if (spec.poser) spec.poser(F, res.colonne);
  return F;
}
