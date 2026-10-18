// Copie de src/figures.js du dépôt ahmedksentini-bit/fondation (commit 985d215, bureau de calcul fond.ksr-infra.org) —
// figures SVG partagées (profil pressiométrique, coupes de sol). Ne pas modifier ici : reporter les évolutions dans le dépôt source.
// Boîte à outils des figures SVG : coupes de sol, semelles, pieux, cotes,
// efforts et graphiques. Tout est produit sous forme de chaîne SVG — la même
// figure sert au cours, à l'exerciseur, au bureau de calcul et au polycopié.
//
// Règles de mise en page, tenues partout :
//  · une légende ne se pose jamais sur les courbes : elle va sous le graphique ;
//  · les étiquettes sont posées par un placeur, qui essaie plusieurs positions
//    et retient la première qui ne touche ni tracé, ni point, ni autre texte ;
//  · un texte qui peut frôler un tracé porte un liseré blanc (classe halo) ;
//  · une étiquette trop longue pour la place libre passe à la ligne sur « · » ;
//  · aucun libellé ne sort du cadre de la figure.

export const COULEURS = {
  encre: "#0f172a", trait: "#334155", discret: "#64748b", grille: "#e2e8f0",
  beton: "#cbd5e1", betonTrait: "#475569",
  eau: "#0077be", eauFond: "rgba(0,119,190,0.12)",
  effort: "#dc2626", reaction: "#0f766e", cote: "#2b2d42",
  f62: "#b45309", ec7: "#0f766e", bleu: "#0369a1", cyan: "#0891b2", rouge: "#b91c1c", violet: "#7c3aed",
};

/** Teintes et motifs par nature de terrain. */
export const SOLS = {
  remblai: { nom: "Remblai", fond: "#eadfd2", motif: "remblai" },
  argile: { nom: "Argile", fond: "#dccab0", motif: "argile" },
  limon: { nom: "Limon", fond: "#e8dcc3", motif: "argile" },
  intermediaire: { nom: "Sol intermédiaire", fond: "#e9dbb7", motif: "sable" },
  sable: { nom: "Sable", fond: "#f3e5ae", motif: "sable" },
  grave: { nom: "Grave", fond: "#e3d3a0", motif: "grave" },
  craie: { nom: "Craie", fond: "#f4f6f8", motif: "craie" },
  marne: { nom: "Marne", fond: "#cfd8c7", motif: "marne" },
  roche: { nom: "Roche", fond: "#b8bec7", motif: "roche" },
  tourbe: { nom: "Tourbe", fond: "#8d7a64", motif: "argile" },
};
export const solDe = (cle = "") => {
  const k = String(cle).split("-")[0];
  if (k.startsWith("intermediaire")) return SOLS.intermediaire;
  return SOLS[k] ?? SOLS.argile;
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fmt = (x, c = 3) => (Number.isFinite(x) ? Number(x).toLocaleString("fr-FR", { maximumSignificantDigits: c }) : "—");

/** Pas « rond » (1, 2 ou 5 × 10ⁿ) qui découpe une étendue en n intervalles environ. */
export function pasJoli(etendue, n = 6) {
  const brut = etendue / n, p = 10 ** Math.floor(Math.log10(brut)), r = brut / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}

// Chasse approchée des caractères (en em), pour une police sans empattement.
const ETROITS = new Set(" il.,:;'’|!·ıj");
const MI_ETROITS = new Set("tfr()[]1*-/");
const LARGES = new Set("mwMW%—");
/** Largeur approchée d'un texte, en unités SVG (graisse forte par défaut). */
export function largeurTexte(s, taille = 12, gras = true) {
  let em = 0;
  for (const c of String(s ?? "")) {
    em += ETROITS.has(c) ? 0.29 : MI_ETROITS.has(c) ? 0.4 : LARGES.has(c) ? 0.86
      : c === "I" ? 0.32 : c >= "A" && c <= "Z" ? 0.7 : /[0-9=+−×<>≥≤→]/.test(c) ? 0.6 : 0.56;
  }
  return em * taille * (gras ? 1.05 : 0.98);
}

let compteur = 0;
/** Préfixe unique par figure : deux figures d'une même page ne partagent pas leurs motifs. */
const nouvelId = () => `f${(compteur++).toString(36)}`;

function defs(id) {
  return `<defs>
    <marker id="${id}-fl" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0l9 4.5-9 4.5z" fill="${COULEURS.effort}"/></marker>
    <marker id="${id}-fr" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0l9 4.5-9 4.5z" fill="${COULEURS.reaction}"/></marker>
    <marker id="${id}-fb" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0l9 4.5-9 4.5z" fill="${COULEURS.bleu}"/></marker>
    <marker id="${id}-fc" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0 0l7 3.5-7 3.5z" fill="${COULEURS.cote}"/></marker>
    <pattern id="${id}-argile" width="14" height="8" patternUnits="userSpaceOnUse"><path d="M1 4h6" stroke="#8b7355" stroke-width="1" opacity=".55"/></pattern>
    <pattern id="${id}-sable" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#8a6d1f" opacity=".55"/><circle cx="6.5" cy="6" r=".9" fill="#8a6d1f" opacity=".5"/></pattern>
    <pattern id="${id}-grave" width="14" height="12" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" fill="none" stroke="#7c6a3a" stroke-width=".9" opacity=".6"/><circle cx="10.5" cy="9" r="1.6" fill="none" stroke="#7c6a3a" stroke-width=".9" opacity=".55"/></pattern>
    <pattern id="${id}-craie" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 0h16M0 5h16M4 0v5M12 5v5" stroke="#94a3b8" stroke-width=".8" fill="none" opacity=".6"/></pattern>
    <pattern id="${id}-marne" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M0 3h12M0 8h5" stroke="#5b6b52" stroke-width=".9" opacity=".5"/></pattern>
    <pattern id="${id}-roche" width="18" height="14" patternUnits="userSpaceOnUse"><path d="M0 7h18M9 0v7M3 7v7M15 7v7" stroke="#4b5563" stroke-width=".9" fill="none" opacity=".55"/></pattern>
    <pattern id="${id}-remblai" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M2 10l3-3M7 11l2-2M8 4l2-2" stroke="#7c6a58" stroke-width=".9" opacity=".6"/></pattern>
    <pattern id="${id}-beton" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v7" stroke="#94a3b8" stroke-width="1"/></pattern>
  </defs>`;
}

/** Cadre SVG commun ; `contenu(id)` reçoit le préfixe des motifs. */
export function svg({ largeur = 560, hauteur = 300, titre = "", contenu }) {
  const id = nouvelId();
  return `<svg viewBox="0 0 ${largeur} ${Math.round(hauteur)}" role="img" aria-label="${esc(titre)}" xmlns="http://www.w3.org/2000/svg">
  ${defs(id)}<style>text{font-family:Inter,-apple-system,"Segoe UI",sans-serif;font-size:12px;fill:${COULEURS.encre}}.pt{font-size:11px;fill:${COULEURS.discret}}.gr{font-weight:800}.halo{paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round}</style>
  ${contenu(id)}</svg>`;
}

export const texte = (x, y, s, attrs = "") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${esc(s)}</text>`;
export const ligne = (x1, y1, x2, y2, couleur = COULEURS.trait, ep = 1.4, attrs = "") =>
  `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${couleur}" stroke-width="${ep}" fill="none" ${attrs}/>`;

/**
 * Découpe une étiquette en lignes qui tiennent dans `largeurMax`, en coupant
 * d'abord sur « · », puis sur les espaces.
 */
export function couper(s, largeurMax, taille = 11) {
  if (largeurTexte(s, taille) <= largeurMax) return [s];
  const morceaux = String(s).split(" · ");
  const lignes = [];
  let courant = "";
  const pousser = (m) => {
    const essai = courant ? `${courant} · ${m}` : m;
    if (!courant || largeurTexte(essai, taille) <= largeurMax) courant = essai;
    else { lignes.push(courant); courant = m; }
  };
  for (const m of morceaux) {
    if (largeurTexte(m, taille) <= largeurMax) { pousser(m); continue; }
    // Morceau trop long : on le coupe sur les espaces.
    for (const mot of m.split(" ")) {
      const essai = courant ? `${courant} ${mot}` : mot;
      if (!courant || largeurTexte(essai, taille) <= largeurMax) courant = essai;
      else { lignes.push(courant); courant = mot; }
    }
  }
  if (courant) lignes.push(courant);
  return lignes;
}

/** Texte sur plusieurs lignes (une ligne par élément). */
function texteLignes(x, y, lignes, attrs, pas = 13) {
  return lignes.map((l, i) => texte(x, y + i * pas, l, attrs)).join("");
}

// ───────────────────────── Placement des étiquettes ──────────────────────

/** Le segment (x1, y1)–(x2, y2) traverse-t-il le rectangle r ? (Liang–Barsky) */
function coupeRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
const chevauche = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contient = (a, b) => b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5;

/** Boîte d'un texte d'une ou plusieurs lignes ; y est la ligne de base de la première. */
export function boiteTexte(x, y, lignes, { taille = 12, ancre = "start", pas = 13 } = {}) {
  const ls = Array.isArray(lignes) ? lignes : [lignes];
  const w = Math.max(...ls.map((l) => largeurTexte(l, taille)));
  return { x: ancre === "end" ? x - w : ancre === "middle" ? x - w / 2 : x, y: y - 0.8 * taille, w, h: 1.05 * taille + (ls.length - 1) * pas };
}

/**
 * Placeur d'étiquettes. Les tracés déclarent leurs obstacles (segments,
 * boîtes) ; chaque étiquette propose des positions candidates, par ordre de
 * préférence, et rendre() les pose toutes à la fin : la première position qui
 * ne touche rien l'emporte, sinon la moins gênée. Une étiquette posée devient
 * à son tour un obstacle. cadre : rectangle dont aucune étiquette ne sort.
 */
export function placeur(cadre = null) {
  const segments = [], boites = [], demandes = [];
  const cout = (b, dedans) => {
    const r = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
    let c = 0;
    if (cadre && !contient(cadre, b)) c += 100;
    if (dedans && !contient(dedans, b)) c += 40;
    for (const [x1, y1, x2, y2, p] of segments) if (coupeRect(x1, y1, x2, y2, r)) c += p;
    for (const o of boites) if (chevauche(o, r)) c += o.poids;
    return c;
  };
  return {
    segment(x1, y1, x2, y2, poids = 1) { segments.push([x1, y1, x2, y2, poids]); },
    polyligne(pts, poids = 1) {
      for (let i = 1; i < pts.length; i++) segments.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], poids]);
    },
    boite(b, poids = 4) { boites.push({ ...b, poids }); },
    /**
     * Étiquette différée : candidats [{ x, y, ancre, lignes, dedans? }] ; style :
     * attributs SVG communs ; dedans : zone dont l'étiquette ne doit pas sortir.
     */
    texte(candidats, style, { taille = 12, pas = 13, dedans = null, priorite = 0 } = {}) {
      demandes.push({ candidats, style, taille, pas, dedans, priorite, rang: demandes.length });
    },
    rendre() {
      let s = "";
      demandes.sort((a, b) => b.priorite - a.priorite || a.rang - b.rang);
      for (const d of demandes) {
        let retenu = null, min = Infinity;
        d.candidats.forEach((c, i) => {
          const b = boiteTexte(c.x, c.y, c.lignes, { taille: d.taille, ancre: c.ancre, pas: d.pas });
          const k = cout(b, c.dedans ?? d.dedans) + i * 1e-3;
          if (k < min) { min = k; retenu = { ...c, b }; }
        });
        if (!retenu) continue;
        boites.push({ ...retenu.b, poids: 4 });
        s += texteLignes(retenu.x, retenu.y, retenu.lignes, `text-anchor="${retenu.ancre}" ${d.style}`, d.pas);
      }
      demandes.length = 0;
      return s;
    },
  };
}

/**
 * Rectangle de sol avec son motif et, éventuellement, son étiquette (posée
 * sans placeur : les coupes passent par leur propre placement).
 */
export function couche(id, { x, y, w, h, sol, etiquette = null, cote = "droite", position = "haut", largeurMax = null }) {
  const s = typeof sol === "string" ? solDe(sol) : sol;
  let t = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.fond}"/>
    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#${id}-${s.motif})"/>`;
  if (etiquette && h > 13) {
    const lignes = couper(etiquette, largeurMax ?? w - 12, 11).slice(0, Math.max(1, Math.floor((h - 4) / 13)));
    const tx = cote === "droite" ? x + w - 6 : x + 6;
    const ty = position === "bas" ? y + h - 6 - (lignes.length - 1) * 13 : y + Math.min(h / 2 + 4, 16);
    t += texteLignes(tx, ty, lignes, `text-anchor="${cote === "droite" ? "end" : "start"}" class="gr halo" style="font-size:11px"`);
  }
  return t;
}

/**
 * Candidats d'étiquette pour une bande de terrain [y0, y1] entre xg et xd :
 * d'une traite dans la bande (côté et hauteur préférés d'abord), puis, si
 * `dehors` donne la place libre de part et d'autre ({ gauche, droite }), à
 * l'extérieur du bloc, en face de la bande ; en dernier recours, coupée.
 */
function candidatsBande(etiquette, { xg, xd, y0, y1, cote = "droite", position = "haut", largeurs = [200, 150, 110, 80], dehors = null }) {
  const h = y1 - y0, nMax = Math.max(1, Math.floor((h - 4) / 13));
  const dedans = { x: xg, y: y0, w: xd - xg, h };
  const variantes = [[etiquette]];
  for (const lmax of largeurs) {
    const l = couper(etiquette, Math.min(lmax, xd - xg - 12), 11);
    if (l.length <= nMax && !variantes.some((v) => v.join("|") === l.join("|"))) variantes.push(l);
  }
  const autre = cote === "droite" ? "gauche" : "droite";
  const verticales = [position, position === "haut" ? "bas" : "haut", "milieu"];
  const yDe = (v, n) => (v === "haut" ? y0 + Math.min(h / 2 + 4, 16) : v === "bas" ? y1 - 6 - (n - 1) * 13 : y0 + h / 2 + 4 - (n - 1) * 6.5);
  const interieur = (v, l, c) => ({ x: c === "droite" ? xd - 6 : xg + 6, y: yDe(v, l.length), ancre: c === "droite" ? "end" : "start", lignes: l, dedans });
  const exterieur = (l, c) => ({
    x: c === "droite" ? xd + 6 : xg - 6, y: yDe("haut", l.length), ancre: c === "droite" ? "start" : "end", lignes: l,
    dedans: c === "droite" ? { x: xd, y: y0, w: dehors.droite - xd, h } : { x: dehors.gauche, y: y0, w: xg - dehors.gauche, h },
  });
  const cands = [];
  for (const l of variantes) {
    for (const v of verticales) for (const c of [cote, autre]) cands.push(interieur(v, l, c));
    if (dehors) for (const c of [cote, autre]) cands.push(exterieur(l, c));
  }
  return cands;
}

/**
 * Ligne de cote avec flèches aux deux bouts et libellé. Avec un placeur P,
 * le libellé cherche sa place (côté demandé d'abord, au milieu puis vers les
 * bouts) et la cote devient un obstacle pour les autres étiquettes.
 */
export function cote(id, x1, y1, x2, y2, libelle, { cote: position = "haut", decalage = 5, P = null } = {}) {
  const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  const trait = ligne(x1, y1, x2, y2, COULEURS.cote, 1.1, `marker-start="url(#${id}-fc)" marker-end="url(#${id}-fc)"`);
  if (P) P.segment(x1, y1, x2, y2, 2);
  if (!libelle) return trait;
  const style = `class="halo" style="font-size:11.5px;font-weight:700;fill:${COULEURS.cote}"`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  let cands;
  if (vertical) {
    const g = position === "gauche";
    const pos = (gauche, f) => ({ x: mx + (gauche ? -decalage : decalage), y: y1 + f * (y2 - y1) + 4, ancre: gauche ? "end" : "start" });
    cands = [pos(g, 0.5), pos(g, 0.3), pos(g, 0.7), pos(g, 0.15), pos(g, 0.85), pos(!g, 0.5), pos(!g, 0.3), pos(!g, 0.7)];
  } else {
    const bas = position === "bas";
    const pos = (dessous, f) => ({ x: x1 + f * (x2 - x1), y: my + (dessous ? 14 : -decalage), ancre: "middle" });
    // Cote courte au bord de la figure : libellé calé sur l'un de ses bouts.
    const bout = (dessous, droite) => ({ x: droite ? Math.max(x1, x2) : Math.min(x1, x2), y: my + (dessous ? 14 : -decalage), ancre: droite ? "end" : "start" });
    cands = [pos(bas, 0.5), pos(!bas, 0.5), pos(bas, 0.3), pos(bas, 0.7), pos(!bas, 0.3), pos(!bas, 0.7),
      bout(bas, true), bout(bas, false), bout(!bas, true), bout(!bas, false)];
  }
  cands = cands.map((c) => ({ ...c, lignes: [libelle] }));
  if (!P) return trait + texte(cands[0].x, cands[0].y, libelle, `text-anchor="${cands[0].ancre}" ${style}`);
  P.texte(cands, style, { taille: 11.5, priorite: 3 });
  return trait;
}

/**
 * Flèche d'effort (rouge), de réaction (vert) ou d'écoulement (bleu). Le
 * libellé s'accroche à l'extrémité désignée par `position` : au-dessus d'une
 * flèche horizontale, à droite d'une flèche verticale ; avec un placeur P, il
 * se déplace si cette place est prise.
 */
export function fleche(id, x1, y1, x2, y2, { type = "effort", libelle = "", ep = 2.4, position = "fin", P = null } = {}) {
  const couleur = type === "reaction" ? COULEURS.reaction : type === "bleu" ? COULEURS.bleu : COULEURS.effort;
  const m = type === "reaction" ? "fr" : type === "bleu" ? "fb" : "fl";
  const trait = ligne(x1, y1, x2, y2, couleur, ep, `marker-end="url(#${id}-${m})"`);
  if (P) P.segment(x1, y1, x2, y2, 2);
  if (!libelle) return trait;
  const fin = position === "fin";
  const [ax, ay] = fin ? [x2, y2] : [x1, y1]; // extrémité qui porte le libellé
  const [bx, by] = fin ? [x1, y1] : [x2, y2];
  let cands;
  if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
    // Le texte part de l'extrémité et longe la flèche.
    const s = Math.sign(bx - ax) || 1, ancre = s > 0 ? "start" : "end";
    cands = [
      { x: ax + 2 * s, y: ay - 7, ancre }, { x: ax + 2 * s, y: ay + 16, ancre },
      { x: ax - 7 * s, y: ay + 4, ancre: s > 0 ? "end" : "start" },
      { x: (ax + bx) / 2, y: ay - 7, ancre: "middle" }, { x: (ax + bx) / 2, y: ay + 16, ancre: "middle" },
    ];
  } else {
    const ty = ay + (y2 > y1 ? (fin ? -2 : 4) : 12);
    cands = [
      { x: ax + 7, y: ty, ancre: "start" }, { x: ax - 7, y: ty, ancre: "end" },
      { x: ax, y: by > ay ? ay - 5 : ay + 14, ancre: "middle" },
      { x: ax + 7, y: (ay + by) / 2 + 4, ancre: "start" }, { x: ax - 7, y: (ay + by) / 2 + 4, ancre: "end" },
    ];
  }
  cands = cands.map((c) => ({ ...c, lignes: [libelle] }));
  const style = `class="halo" style="font-weight:800;fill:${couleur}"`;
  if (!P) return trait + texte(cands[0].x, cands[0].y, libelle, `text-anchor="${cands[0].ancre}" ${style}`);
  P.texte(cands, style, { taille: 12, priorite: 3 });
  return trait;
}

/** Symbole de nappe (triangle inversé, à droite) et trait du niveau d'eau. */
export function nappe(x, y, largeur, P = null) {
  const xs = x + largeur - 22;
  if (P) { P.segment(x, y, x + largeur, y, 1); P.boite({ x: xs - 6, y: y - 10, w: 12, h: 10 }); }
  return `${ligne(x, y, x + largeur, y, COULEURS.eau, 1.4, 'stroke-dasharray="6 4"')}
    <path d="M${xs} ${y - 1}l6-9h-12z" fill="${COULEURS.eau}"/>`;
}

// ───────────────────────────── Graphique x–y ──────────────────────────────

/**
 * Graphique cartésien : séries de points, axes gradués, légende sous le
 * graphique (jamais sur les courbes).
 * series : [{ points: [[x, y]], couleur, libelle, tirets, epaisseur, marqueurs }]
 * zones : [{ x0, x1, y0, y1, couleur, opacite, libelle, position: "gauche"|"droite" }]
 * marques : [{ x, y, couleur, libelle, guides, rayon }]
 * inverserY : pour un profil en profondeur (z croissant vers le bas).
 * logX, logY : échelles logarithmiques (bornes strictement positives).
 * textes : [{ x, y, texte, couleur }] annotations libres, posées près du point.
 * legende : "dessous" (défaut) | "dedans" | false.
 * Les libellés des marques, des annotations puis des zones sont posés par le
 * placeur : ils évitent les courbes, les guides, les points et les autres libellés.
 */
export function graphe({
  largeur = 560, hauteur = 300, xmin, xmax, ymin, ymax, xlabel = "", ylabel = "", series = [],
  titre = "", inverserY = false, pasX = null, pasY = null, marques = [], legende = "dessous", zones = [],
  logX = false, logY = false, textes = [],
}) {
  const g = { gauche: 58, droite: 18, haut: 14, bas: 44 };
  const W = largeur - g.gauche - g.droite, H = hauteur - g.haut - g.bas;
  const fx = logX ? (x) => (Math.log10(x) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) : (x) => (x - xmin) / (xmax - xmin);
  const fy = logY ? (y) => (Math.log10(y) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) : (y) => (y - ymin) / (ymax - ymin);
  const X = (x) => g.gauche + fx(x) * W;
  const Y = (y) => inverserY ? g.haut + fy(y) * H : g.haut + H - fy(y) * H;
  const px = pasX || pasJoli(xmax - xmin), py = pasY || pasJoli(ymax - ymin);
  // Graduations : pas rond en linéaire ; en logarithmique, 1-2-5 par décade, chiffres aux décades
  // (et aux 2 et 5 quand l'axe ne couvre qu'une ou deux décades).
  const graduer = (a, b, pas, log) => {
    if (!log) {
      const t = [];
      for (let v = Math.ceil(a / pas - 1e-9) * pas; v <= b + 1e-9; v += pas) t.push({ v: Math.abs(v) < pas * 1e-9 ? 0 : v, chiffre: true });
      return t;
    }
    const decades = Math.log10(b / a);
    return graduationsLog(a, b).map((v) => {
      const m = Math.round(v / 10 ** Math.floor(Math.log10(v) + 1e-9));
      return { v, chiffre: m === 1 || (decades <= 2.2 && (m === 2 || m === 5)), majeur: m === 1 };
    });
  };
  const okX = (x) => Number.isFinite(x) && (!logX || x > 0), okY = (y) => Number.isFinite(y) && (!logY || y > 0);

  // Légende : rangées d'éléments sous le titre de l'axe x.
  const avecLibelle = series.filter((se) => se.libelle);
  const rangees = [];
  if (legende && legende !== "dedans" && avecLibelle.length) {
    let rangee = [], occupe = 0;
    for (const se of avecLibelle) {
      const w = 34 + largeurTexte(se.libelle, 11);
      if (rangee.length && occupe + w > largeur - 20) { rangees.push({ rangee, occupe }); rangee = []; occupe = 0; }
      rangee.push({ se, w }); occupe += w;
    }
    rangees.push({ rangee, occupe });
  }
  const hLegende = rangees.length ? rangees.length * 17 + 6 : 0;

  return svg({
    largeur, hauteur: hauteur + hLegende, titre, contenu: (id) => {
      let s = "";
      const P = placeur({ x: g.gauche, y: g.haut, w: W, h: H });
      for (const z of zones) {
        s += `<rect x="${X(z.x0).toFixed(1)}" y="${Math.min(Y(z.y0), Y(z.y1)).toFixed(1)}" width="${(X(z.x1) - X(z.x0)).toFixed(1)}" height="${Math.abs(Y(z.y1) - Y(z.y0)).toFixed(1)}" fill="${z.couleur}" opacity="${z.opacite ?? 0.18}"/>`;
      }
      // Graduations ; le zéro s'écrit « 0 », jamais « -0 ».
      for (const { v, chiffre, majeur } of graduer(xmin, xmax, px, logX)) {
        s += ligne(X(v), g.haut, X(v), g.haut + H, COULEURS.grille, logX && !majeur ? 0.7 : 1);
        if (chiffre) s += texte(X(v), g.haut + H + 16, fmt(v, 4), `text-anchor="middle" class="pt"`);
      }
      for (const { v, chiffre, majeur } of graduer(ymin, ymax, py, logY)) {
        s += ligne(g.gauche, Y(v), g.gauche + W, Y(v), COULEURS.grille, logY && !majeur ? 0.7 : 1);
        if (chiffre) s += texte(g.gauche - 7, Y(v) + 4, fmt(v, 4), `text-anchor="end" class="pt"`);
      }
      s += `<rect x="${g.gauche}" y="${g.haut}" width="${W}" height="${H}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.2"/>`;
      s += texte(g.gauche + W / 2, hauteur - 10, xlabel, `text-anchor="middle" style="font-weight:700"`);
      s += `<text transform="translate(14 ${g.haut + H / 2}) rotate(-90)" text-anchor="middle" style="font-weight:700">${esc(ylabel)}</text>`;
      const clip = `${id}-clip`;
      s += `<clipPath id="${clip}"><rect x="${g.gauche}" y="${g.haut}" width="${W}" height="${H}"/></clipPath>`;
      // Guides des marques d'abord : ils passent sous les courbes.
      for (const m of marques) {
        if (!m.guides || !okX(m.x) || !okY(m.y)) continue;
        const col = m.couleur ?? COULEURS.effort, cx = X(m.x), cy = Y(m.y);
        s += ligne(cx, cy, cx, g.haut + H, col, 1, `stroke-dasharray="4 3" clip-path="url(#${clip})"`);
        s += ligne(g.gauche, cy, cx, cy, col, 1, `stroke-dasharray="4 3" clip-path="url(#${clip})"`);
        P.segment(cx, cy, cx, g.haut + H, 0.5);
        P.segment(g.gauche, cy, cx, cy, 0.5);
      }
      series.forEach((se) => {
        const pts = se.points.filter(([x, y]) => okX(x) && okY(y));
        if (!pts.length) return;
        // Série « nuage » : des points seuls, sans trait (mesures d'un profil sur un abaque…).
        if (!se.nuage) {
          const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join("");
          s += `<path d="${d}" fill="none" stroke="${se.couleur}" stroke-width="${se.epaisseur ?? 2.2}" ${se.tirets ? `stroke-dasharray="${se.tirets}"` : ""} stroke-linejoin="round" clip-path="url(#${clip})"/>`;
          P.polyligne(pts.map(([x, y]) => [X(x), Y(y)]));
        }
        if (se.marqueurs || se.nuage) pts.forEach(([x, y], i) => {
          const col = se.couleurs?.[i] ?? se.couleur;
          s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${se.rayon ?? 3}" fill="${col}"${se.nuage ? ' fill-opacity=".85" stroke="#fff" stroke-width=".6"' : ""} clip-path="url(#${clip})"/>`;
          if (!se.nuage) P.boite({ x: X(x) - 3, y: Y(y) - 3, w: 6, h: 6 }, 2);
        });
      });
      // Annotations libres : près de leur point, sans rien recouvrir.
      for (const t of textes) {
        if (!okX(t.x) || !okY(t.y) || t.x < xmin || t.x > xmax || t.y < Math.min(ymin, ymax) || t.y > Math.max(ymin, ymax)) continue;
        const cx = X(t.x), cy = Y(t.y);
        P.texte([
          { x: cx, y: cy + 4, ancre: "middle" }, { x: cx + 6, y: cy - 4, ancre: "start" }, { x: cx - 6, y: cy - 4, ancre: "end" },
          { x: cx + 6, y: cy + 13, ancre: "start" }, { x: cx - 6, y: cy + 13, ancre: "end" },
        ].map((c) => ({ ...c, lignes: [t.texte] })), `class="halo" style="font-size:${t.taille ?? 11}px;font-weight:${t.gras === false ? 400 : 700};fill:${t.couleur ?? COULEURS.discret}"`, { taille: t.taille ?? 11, priorite: 1.5 });
      }
      for (const m of marques) {
        if (!okX(m.x) || !okY(m.y)) continue;
        const col = m.couleur ?? COULEURS.effort, cx = X(m.x), cy = Y(m.y), r = m.rayon ?? 5;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${col}" stroke="#fff" stroke-width="1.5"/>`;
        P.boite({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r });
        if (!m.libelle) continue;
        const d = r + 3;
        P.texte([
          { x: cx + d, y: cy - d, ancre: "start" }, { x: cx - d, y: cy - d, ancre: "end" },
          { x: cx + d, y: cy + d + 10, ancre: "start" }, { x: cx - d, y: cy + d + 10, ancre: "end" },
          { x: cx + d + 2, y: cy + 4, ancre: "start" }, { x: cx - d - 2, y: cy + 4, ancre: "end" },
          { x: cx, y: cy - d - 2, ancre: "middle" }, { x: cx, y: cy + d + 12, ancre: "middle" },
        ].map((c) => ({ ...c, lignes: [m.libelle] })), `class="halo" style="font-weight:800;fill:${col}"`, { taille: 12, priorite: 2 });
      }
      // Libellés des zones : dans leur zone, là où aucune courbe ne passe.
      for (const z of zones) {
        if (!z.libelle) continue;
        const haut = Math.max(Math.min(Y(z.y0), Y(z.y1)), g.haut), bas = Math.min(Math.max(Y(z.y0), Y(z.y1)), g.haut + H);
        const gx = Math.max(X(z.x0), g.gauche), dx = Math.min(X(z.x1), g.gauche + W);
        if (bas - haut < 15 || dx - gx < 30) continue;
        const Z = { x: gx, y: haut, w: dx - gx, h: bas - haut };
        const lignes = couper(z.libelle, Z.w - 10, 11).slice(0, Math.max(1, Math.floor((Z.h - 4) / 13)));
        const n = lignes.length;
        const pref = z.position === "droite" ? "droite" : "gauche";
        const cands = [];
        for (const yv of [Z.y + 12.5, Z.y + Z.h - 5 - (n - 1) * 13, Z.y + Z.h / 2 + 4 - (n - 1) * 6.5]) {
          for (const c of [pref, pref === "droite" ? "gauche" : "droite"]) {
            cands.push({ x: c === "droite" ? Z.x + Z.w - 5 : Z.x + 5, y: yv, ancre: c === "droite" ? "end" : "start", lignes });
          }
        }
        P.texte(cands, `class="pt halo"`, { taille: 11, dedans: Z, priorite: 1 });
      }
      s += P.rendre();
      if (legende === "dedans") {
        avecLibelle.forEach((se, i) => {
          const lx = g.gauche + 10, ly = g.haut + 14 + i * 16;
          s += ligne(lx, ly - 4, lx + 16, ly - 4, se.couleur, 2.4, se.tirets ? `stroke-dasharray="${se.tirets}"` : "");
          s += texte(lx + 21, ly, se.libelle, `class="halo" style="font-size:11px;font-weight:700"`);
        });
      } else {
        rangees.forEach(({ rangee, occupe }, i) => {
          let lx = (largeur - occupe) / 2 + 4;
          const ly = hauteur + 8 + i * 17;
          for (const { se, w } of rangee) {
            s += ligne(lx, ly - 4, lx + 18, ly - 4, se.couleur, se.epaisseur ? Math.max(se.epaisseur, 2.2) : 2.4, se.tirets ? `stroke-dasharray="${se.tirets}"` : "");
            s += texte(lx + 24, ly, se.libelle, `style="font-size:11px;font-weight:700"`);
            lx += w;
          }
        });
      }
      return s;
    },
  });
}

/** Échantillonne une fonction sur [a, b]. */
export const echantillon = (f, a, b, n = 80) => Array.from({ length: n + 1 }, (_, i) => {
  const x = a + ((b - a) * i) / n;
  return [x, f(x)];
});

// ───────────────────────────── Coupe d'une semelle ───────────────────────

/**
 * Coupe transversale d'une semelle : terrain, couches, semelle et poteau,
 * charge V (excentrée de e) et H, cotes B et D, nappe, talus éventuel.
 * couches : [{ z0, z1, sol, etiquette, cote, position }] depuis le terrain
 * après travaux ; cote et position ne sont que des préférences.
 * annotations : fonctions (id, { Y, xC, ech, xs, ws, yTN, P }) → SVG ; en
 * passant P à cote() ou fleche(), leurs libellés entrent dans le placement.
 * decalageCoteB : distance (px) de la cote B sous la base.
 */
export function coupeSemelle({
  B, D, e = 0, V = null, H = 0, couches = [], zNappe = null, largeur = 560, hauteur = 300,
  profondeurVue = null, epaisseur = null, talus = null, annotations = [], montrerHr = null, decalageCoteB = 12,
}) {
  const zVue = profondeurVue ?? Math.max(D + 2 * B, 4);
  const marge = { g: 40, d: 40, h: 64, b: 16 };
  const largeurM = Math.max(3.2 * B, B + 5, talus ? talus.d + B + 4 : 0);
  const ech = Math.min((largeur - marge.g - marge.d) / largeurM, (hauteur - marge.h - marge.b) / zVue);
  const x0 = marge.g + ((largeur - marge.g - marge.d) - largeurM * ech) / 2;
  const xC = x0 + (talus ? talus.d * ech + (largeurM - talus.d - B) * ech / 2 + B * ech / 2 : largeurM * ech / 2);
  const yTN = marge.h;
  const Y = (z) => yTN + z * ech;
  const xs = xC - (B / 2) * ech, ws = B * ech;
  return svg({
    largeur, hauteur, titre: "Coupe de la semelle", contenu: (id) => {
      let s = "";
      const xg = x0, xd = x0 + largeurM * ech;
      const P = placeur({ x: 2, y: 2, w: largeur - 4, h: hauteur - 4 });
      // Terrain : les fonds d'abord, les étiquettes à la fin.
      const bandes = [];
      for (const c of couches.length ? couches : [{ z0: 0, z1: zVue, sol: "argile" }]) {
        const a = Math.max(c.z0, 0), b = Math.min(c.z1, zVue);
        if (b <= a) continue;
        s += couche(id, { x: xg, y: Y(a), w: xd - xg, h: (b - a) * ech, sol: c.sol });
        if (c.etiquette) bandes.push({ c, y0: Y(a), y1: Y(b) });
      }
      // Talus : on retire la partie du terrain à gauche de l'arête.
      let xTN = xg;
      if (talus) {
        const xa = xs - talus.d * ech; // arête du talus
        const t = Math.tan((talus.beta * Math.PI) / 180);
        const yb = Y(Math.min(zVue, ((xa - xg) / ech) * t));
        const xb = Math.max(xa - (zVue / t) * ech, xg);
        s += `<path d="M${xg} ${yTN - 1}L${xa.toFixed(1)} ${yTN - 1}L${xb.toFixed(1)} ${yb.toFixed(1)}L${xg} ${yb.toFixed(1)}Z" fill="#fff"/>`;
        s += ligne(xa, yTN, xb, yb, COULEURS.trait, 1.6);
        P.segment(xa, yTN, xb, yb, 2);
        P.texte([
          { x: xa - 12, y: yTN + 28, ancre: "end" }, { x: xa - 8, y: yTN + 16, ancre: "end" }, { x: (xa + xb) / 2 - 10, y: (yTN + yb) / 2, ancre: "end" },
        ].map((c) => ({ ...c, lignes: [`β = ${fmt(talus.beta, 3)}°`] })), `class="pt halo"`, { taille: 11, priorite: 2 });
        s += cote(id, xa, yTN - 12, xs, yTN - 12, `d = ${fmt(talus.d, 3)} m`, { P });
        xTN = xa;
      }
      s += ligne(xTN, yTN, xd, yTN, COULEURS.trait, 1.8);
      P.segment(xTN, yTN, xd, yTN, 1);
      if (zNappe !== null && zNappe < zVue) s += nappe(xg, Y(zNappe), xd - xg, P);
      // Semelle et poteau.
      const ep = epaisseur ?? Math.min(Math.max(0.35 * B, 0.3), D);
      s += `<rect x="${xs.toFixed(1)}" y="${Y(D - ep).toFixed(1)}" width="${ws.toFixed(1)}" height="${(ep * ech).toFixed(1)}" fill="${COULEURS.beton}" stroke="${COULEURS.betonTrait}" stroke-width="1.6"/>`;
      s += `<rect x="${xs.toFixed(1)}" y="${Y(D - ep).toFixed(1)}" width="${ws.toFixed(1)}" height="${(ep * ech).toFixed(1)}" fill="url(#${id}-beton)"/>`;
      const bp = Math.max(0.25 * B, 0.2) * ech;
      s += `<rect x="${(xC - bp / 2).toFixed(1)}" y="${(yTN - 34).toFixed(1)}" width="${bp.toFixed(1)}" height="${(Y(D - ep) - yTN + 34).toFixed(1)}" fill="${COULEURS.beton}" stroke="${COULEURS.betonTrait}" stroke-width="1.6"/>`;
      P.boite({ x: xs, y: Y(D - ep), w: ws, h: ep * ech });
      P.boite({ x: xC - bp / 2, y: yTN - 34, w: bp, h: Y(D - ep) - yTN + 34 });
      // Charges : V au-dessus du poteau (excentrée de e), H sur le poteau.
      const xe = xC + e * ech;
      if (V !== null) s += fleche(id, xe, yTN - 60, xe, yTN - 37, { libelle: V, position: "debut", P });
      if (H) s += fleche(id, xC - bp / 2 - 44, yTN - 22, xC - bp / 2 - 3, yTN - 22, { libelle: "H", position: "debut", P });
      // Cote de l'excentrement, sous la flèche V ; son libellé ne touche pas la flèche.
      if (Math.abs(e) * ech >= 8) {
        s += ligne(xC, yTN - 44, xe, yTN - 44, COULEURS.cote, 1.1, `marker-start="url(#${id}-fc)" marker-end="url(#${id}-fc)"`);
        s += ligne(xC, yTN - 49, xC, yTN - 34, COULEURS.cote, 0.8, 'stroke-dasharray="2 2"');
        P.segment(xC, yTN - 44, xe, yTN - 44, 2);
        const a = Math.min(xC, xe), b = Math.max(xC, xe);
        P.texte([
          { x: b + 6, y: yTN - 40, ancre: "start" }, { x: a - 6, y: yTN - 40, ancre: "end" }, { x: (a + b) / 2, y: yTN - 48, ancre: "middle" },
        ].map((c) => ({ ...c, lignes: ["e"] })), `class="halo" style="font-size:11.5px;font-weight:700;fill:${COULEURS.cote}"`, { taille: 11.5, priorite: 3 });
      }
      // Cotes ; D passe à droite de la semelle quand le talus occupe la gauche.
      s += cote(id, xs, Y(D) + decalageCoteB, xs + ws, Y(D) + decalageCoteB, `B = ${fmt(B, 3)} m`, { cote: "bas", P });
      if (D > 0 && talus) s += cote(id, xs + ws + 14, yTN, xs + ws + 14, Y(D), `D = ${fmt(D, 3)} m`, { cote: "droite", P });
      else if (D > 0) s += cote(id, xs - 14, yTN, xs - 14, Y(D), `D = ${fmt(D, 3)} m`, { cote: "gauche", P });
      if (montrerHr) {
        s += `<rect x="${xs.toFixed(1)}" y="${Y(D).toFixed(1)}" width="${ws.toFixed(1)}" height="${(montrerHr * ech).toFixed(1)}" fill="${COULEURS.bleu}" opacity=".12"/>`;
        s += cote(id, xs + ws + 14, Y(D), xs + ws + 14, Y(D + montrerHr), `hr = ${fmt(montrerHr, 3)} m`, { P });
      }
      for (const a of annotations) s += a(id, { Y, xC, ech, xs, ws, yTN, P });
      // Terrain naturel : au bout de son trait, dans le bloc ou juste après
      // (jamais à gauche d'un talus, où le terrain est plus bas).
      P.texte([
        { x: xd - 4, y: yTN - 7, ancre: "end" }, ...(talus ? [] : [{ x: xTN + 4, y: yTN - 7, ancre: "start" }]),
        { x: xd + 6, y: yTN + 4, ancre: "start" }, ...(talus ? [] : [{ x: xg - 6, y: yTN + 4, ancre: "end" }]),
        { x: xd + 6, y: yTN - 12, ancre: "start" }, { x: xd - 4, y: yTN - 20, ancre: "end" }, { x: xd - 4, y: yTN - 50, ancre: "end" },
      ].map((c) => ({ ...c, lignes: ["TN après travaux"] })), `class="pt"`, { taille: 11, priorite: 2 });
      for (const { c, y0, y1 } of bandes) {
        P.texte(candidatsBande(c.etiquette, { xg, xd, y0, y1, cote: c.cote ?? "droite", position: c.position ?? "haut", dehors: { gauche: 2, droite: largeur - 2 } }),
          `class="gr halo" style="font-size:11px"`, { taille: 11, priorite: 1 });
      }
      s += P.rendre();
      return s;
    },
  });
}

// ─────────────────────────── Profil vertical d'un pieu ───────────────────

/**
 * Pieu dans son terrain, avec à droite un profil de valeurs (pl*, qc ou qs).
 * couches : [{ z0, z1, sol, etiquette }] ; profil : { valeurs: [{ z0, z1, v }],
 * libelle, unite, max } ; zones : [{ z0, z1, couleur, libelle }] (intervalle
 * de pointe, frottement négatif…).
 */
export function coupePieu({ B, D, couches, profil = null, zones = [], largeur = 560, hauteur = 360, zMax = null, tete = 0 }) {
  const zBas = zMax ?? Math.max(D + 4, ...couches.map((c) => c.z1).filter(Number.isFinite).map((z) => Math.min(z, D + 6)));
  const marge = { h: 28, b: 26 };
  const ech = (hauteur - marge.h - marge.b) / (zBas + tete);
  const Y = (z) => marge.h + (z + tete) * ech;
  const xs0 = 30, xs1 = profil ? 290 : largeur - 30;
  const xp = (xs0 + xs1) / 2, wp = Math.max(B * ech, 7);
  return svg({
    largeur, hauteur, titre: "Coupe du pieu", contenu: (id) => {
      let s = "";
      const P = placeur({ x: xs0, y: 2, w: xs1 - xs0, h: hauteur - 4 });
      const bandes = [];
      for (const c of couches) {
        const a = Math.max(c.z0, 0), b = Math.min(c.z1, zBas);
        if (b <= a) continue;
        s += couche(id, { x: xs0, y: Y(a), w: xs1 - xs0, h: (b - a) * ech, sol: c.sol });
        if (c.etiquette) bandes.push({ c, y0: Y(a), y1: Y(b) });
      }
      for (const z of zones) {
        const Z = { x: xs0, y: Y(z.z0), w: xs1 - xs0, h: (z.z1 - z.z0) * ech };
        s += `<rect x="${Z.x}" y="${Z.y.toFixed(1)}" width="${Z.w}" height="${Z.h.toFixed(1)}" fill="${z.couleur}" opacity="${z.opacite ?? 0.18}"/>`;
        if (z.libelle) {
          P.texte([
            { x: xs1 - 6, y: Z.y + 13, ancre: "end" }, { x: xs1 - 6, y: Z.y + Z.h - 5, ancre: "end" }, { x: xs0 + 6, y: Z.y + 13, ancre: "start" },
          ].map((c) => ({ ...c, lignes: [z.libelle] })), `class="halo" style="font-size:11px;font-weight:800;fill:${z.couleur}"`, { taille: 11, priorite: 2 });
        }
      }
      s += ligne(xs0, Y(0), xs1, Y(0), COULEURS.trait, 1.8);
      P.segment(xs0, Y(0), xs1, Y(0), 1);
      s += `<rect x="${(xp - wp / 2).toFixed(1)}" y="${Y(-tete).toFixed(1)}" width="${wp.toFixed(1)}" height="${((D + tete) * ech).toFixed(1)}" fill="${COULEURS.beton}" stroke="${COULEURS.betonTrait}" stroke-width="1.5"/>`;
      s += `<rect x="${(xp - wp / 2).toFixed(1)}" y="${Y(-tete).toFixed(1)}" width="${wp.toFixed(1)}" height="${((D + tete) * ech).toFixed(1)}" fill="url(#${id}-beton)"/>`;
      P.boite({ x: xp - wp / 2, y: Y(-tete), w: wp, h: (D + tete) * ech });
      s += cote(id, xp + wp / 2 + 12, Y(0), xp + wp / 2 + 12, Y(D), `D = ${fmt(D, 3)} m`, { P });
      // Étiquettes des couches : à gauche du pieu de préférence.
      for (const { c, y0, y1 } of bandes) {
        P.texte(candidatsBande(c.etiquette, { xg: xs0, xd: xs1, y0, y1, cote: "gauche", position: "haut", largeurs: [xp - wp / 2 - xs0 - 16, 90] }),
          `class="gr halo" style="font-size:11px"`, { taille: 11, priorite: 1 });
      }
      // Échelle des profondeurs
      for (let z = 0; z <= zBas + 1e-9; z += zBas > 25 ? 5 : zBas > 12 ? 2 : 1) {
        s += ligne(xs0 - 5, Y(z), xs0, Y(z), COULEURS.trait, 1);
        s += texte(xs0 - 7, Y(z) + 4, fmt(z, 3), `text-anchor="end" class="pt"`);
      }
      s += P.rendre();
      if (profil) {
        const px0 = 330, px1 = largeur - 20;
        const vmax = profil.max ?? Math.max(...profil.valeurs.map((p) => p.v)) * 1.15;
        const X = (v) => px0 + (v / vmax) * (px1 - px0);
        s += ligne(px0, Y(0), px0, Y(zBas), COULEURS.trait, 1.2);
        s += ligne(px0, Y(0), px1, Y(0), COULEURS.trait, 1.2);
        s += texte((px0 + px1) / 2, Y(0) - 8, `${profil.libelle} (${profil.unite})`, `text-anchor="middle" style="font-weight:800;font-size:11.5px"`);
        const pasV = pasJoli(vmax, 5);
        for (let v = pasV; v < vmax; v += pasV) {
          s += ligne(X(v), Y(0), X(v), Y(zBas), COULEURS.grille, 1);
          s += texte(X(v), Y(zBas) + 14, fmt(v, 4), `text-anchor="middle" class="pt"`);
        }
        let d = "";
        for (const p of profil.valeurs) {
          const a = Math.max(p.z0, 0), b = Math.min(p.z1, zBas);
          if (b <= a) continue;
          d += `M${X(0).toFixed(1)} ${Y(a).toFixed(1)}H${X(p.v).toFixed(1)}V${Y(b).toFixed(1)}H${X(0).toFixed(1)}`;
        }
        s += `<path d="${d}" fill="${profil.couleur ?? COULEURS.bleu}" fill-opacity=".22" stroke="${profil.couleur ?? COULEURS.bleu}" stroke-width="1.6"/>`;
        for (const p of profil.valeurs) {
          const a = Math.max(p.z0, 0), b = Math.min(p.z1, zBas);
          if (b - a < 0.5 || !profil.etiquettes) continue;
          const txt = fmt(p.v, 3), w = largeurTexte(txt, 11);
          const tx = X(p.v) + 5 + w > px1 ? X(p.v) - 5 : X(p.v) + 5;
          s += texte(tx, Y((a + b) / 2) + 4, txt, `text-anchor="${tx < X(p.v) ? "end" : "start"}" class="halo" style="font-size:11px;font-weight:800;fill:${profil.couleur ?? COULEURS.bleu}"`);
        }
        s += ligne(px0 - 4, Y(D), px1, Y(D), COULEURS.effort, 1, 'stroke-dasharray="5 4"');
      }
      return s;
    },
  });
}

// ───────────────────────────── Essai pressiométrique ─────────────────────

/**
 * Schéma de l'essai : contrôleur pression-volume (CPV) posé au sol, forage,
 * sonde tricellulaire à la profondeur z, colonne d'eau hc + z qui fait ph ;
 * la nappe est dessinée pour montrer qu'elle n'entre pas dans ph.
 */
export function schemaPressio({ z = 6, hc = 1, zw = 2, largeur = 560, hauteur = 330 } = {}) {
  return svg({
    largeur, hauteur, titre: "Schéma de l'essai pressiométrique", contenu: (id) => {
      const P = placeur({ x: 2, y: 2, w: largeur - 4, h: hauteur - 4 });
      const yS = 96, zMax = Math.max(z + 2.2, 5), ech = (hauteur - yS - 16) / zMax;
      const Y = (h) => yS + h * ech;
      const xF = 330, wF = 34; // forage
      let s = "";
      s += couche(id, { x: 20, y: yS, w: largeur - 40, h: hauteur - yS - 4, sol: "limon" });
      s += `<rect x="${xF - wF / 2}" y="${yS}" width="${wF}" height="${(Y(z + 1.1) - yS).toFixed(1)}" fill="#fff"/>`;
      s += ligne(xF - wF / 2, yS, xF - wF / 2, Y(z + 1.1), COULEURS.trait, 1, 'stroke-dasharray="4 3"');
      s += ligne(xF + wF / 2, yS, xF + wF / 2, Y(z + 1.1), COULEURS.trait, 1, 'stroke-dasharray="4 3"');
      s += ligne(20, yS, largeur - 20, yS, COULEURS.trait, 1.8);
      P.segment(20, yS, largeur - 20, yS);
      // CPV : caisson, manomètre et volumètre.
      const xc = 70, yM = yS - hc * ech * 0.9 - 18;
      s += `<rect x="${xc - 44}" y="${yM - 26}" width="92" height="${(yS - yM + 26).toFixed(1)}" rx="6" fill="#e2e8f0" stroke="${COULEURS.betonTrait}" stroke-width="1.4"/>`;
      s += `<circle cx="${xc - 16}" cy="${yM}" r="13" fill="#fff" stroke="${COULEURS.trait}" stroke-width="1.4"/>`;
      s += ligne(xc - 16, yM, xc - 8, yM - 8, COULEURS.effort, 1.6);
      s += `<rect x="${xc + 18}" y="${yM - 20}" width="12" height="${(yS - yM + 12).toFixed(1)}" fill="#fff" stroke="${COULEURS.trait}" stroke-width="1.2"/>`;
      s += `<rect x="${xc + 19}" y="${(yM + 2).toFixed(1)}" width="10" height="${(yS - yM - 11).toFixed(1)}" fill="${COULEURS.eauFond}"/>`;
      P.boite({ x: xc - 44, y: yM - 26, w: 92, h: yS - yM + 26 });
      P.texte([{ x: xc, y: yM - 32, ancre: "middle", lignes: ["CPV"] }], `class="gr" style="font-size:12px"`, { priorite: 3 });
      // Tubulure du CPV à la sonde.
      const tub = `M${xc + 48} ${yS - 10}H${xF - 4}V${Y(z) - 36}`;
      s += `<path d="${tub}" fill="none" stroke="${COULEURS.eau}" stroke-width="2.4"/>`;
      P.segment(xc + 48, yS - 10, xF - 4, yS - 10, 2); P.segment(xF - 4, yS - 10, xF - 4, Y(z) - 36, 2);
      P.texte([{ x: (xc + 48 + xF) / 2, y: yS - 16, ancre: "middle", lignes: ["tubulure coaxiale (eau et gaz)"] }], `class="pt halo"`, { taille: 11, priorite: 2 });
      // Sonde : garde, mesure, garde.
      const hG = 20, hM = 30, xs = xF - 13, ws = 26;
      const yM0 = Y(z) - hM / 2;
      s += `<rect x="${xs}" y="${(yM0 - hG).toFixed(1)}" width="${ws}" height="${hG}" rx="4" fill="#cbd5e1" stroke="${COULEURS.betonTrait}"/>`;
      s += `<rect x="${xs - 3}" y="${yM0.toFixed(1)}" width="${ws + 6}" height="${hM}" rx="5" fill="#bae6fd" stroke="${COULEURS.eau}" stroke-width="1.6"/>`;
      s += `<rect x="${xs}" y="${(yM0 + hM).toFixed(1)}" width="${ws}" height="${hG}" rx="4" fill="#cbd5e1" stroke="${COULEURS.betonTrait}"/>`;
      P.boite({ x: xs - 3, y: yM0 - hG, w: ws + 6, h: hM + 2 * hG });
      for (const dy of [8, 15, 22]) {
        s += fleche(id, xs + ws + 4, yM0 + dy, xs + ws + 22, yM0 + dy, { type: "bleu", ep: 1.6 });
        s += fleche(id, xs - 4, yM0 + dy, xs - 22, yM0 + dy, { type: "bleu", ep: 1.6 });
        P.segment(xs + ws + 4, yM0 + dy, xs + ws + 22, yM0 + dy); P.segment(xs - 4, yM0 + dy, xs - 22, yM0 + dy);
      }
      const etiq = (y, t) => P.texte([{ x: xs + ws + 30, y, ancre: "start", lignes: [t] }, { x: xs + ws + 30, y: y + 8, ancre: "start", lignes: [t] }],
        `class="halo" style="font-size:11px;font-weight:700"`, { taille: 11, priorite: 2 });
      etiq(yM0 - hG / 2 + 4, "cellule de garde (gaz)");
      etiq(yM0 + hM / 2 + 4, "cellule centrale de mesure (eau)");
      etiq(yM0 + hM + hG / 2 + 4, "cellule de garde (gaz)");
      // Nappe : présente dans le sol, absente de la correction ph.
      if (zw < z) {
        const yw = Y(zw);
        s += ligne(20, yw, xF - wF / 2, yw, COULEURS.eau, 1.2, 'stroke-dasharray="6 4"');
        s += ligne(xF + wF / 2, yw, largeur - 20, yw, COULEURS.eau, 1.2, 'stroke-dasharray="6 4"');
        s += `<path d="M${largeur - 42} ${yw - 1}l6-9h-12z" fill="${COULEURS.eau}"/>`;
        P.segment(20, yw, largeur - 20, yw);
        P.texte([{ x: largeur - 50, y: yw - 5, ancre: "end", lignes: ["nappe : n'entre pas dans ph"] }], `class="pt halo" style="fill:${COULEURS.eau}"`, { taille: 11, priorite: 2 });
      }
      // Cotes hc et z : leur somme fait la colonne d'eau de la tubulure.
      s += cote(id, xc - 58, yM, xc - 58, yS, `hc = ${fmt(hc, 3)} m`, { cote: "gauche", P });
      s += cote(id, xF - wF / 2 - 40, yS, xF - wF / 2 - 40, Y(z), `z = ${fmt(z, 3)} m`, { cote: "gauche", P });
      P.texte([{ x: largeur - 24, y: 30, ancre: "end", lignes: ["ph = γw (hc + z)", "colonne d'eau du manomètre", "au centre de la sonde"] }],
        `class="halo" style="font-size:11.5px;font-weight:700;fill:${COULEURS.eau}"`, { taille: 11.5, priorite: 1 });
      s += P.rendre();
      return s;
    },
  });
}

// ─────────────────────────── Profils verticaux ────────────────────────────

/**
 * Profils en fonction de la profondeur, panneaux côte à côte sur le même axe
 * des z, avec la coupe du terrain à gauche (facultative). panneaux :
 * [{ titre, min, max, log, series: [{ points: [[v, z]], couleur, tirets, epaisseur }],
 *    bandes: [{ v0, v1, couleur, libelle }] }] — bandes verticales de valeurs
 * (domaines d'un abaque, seuils de classement…). zw : niveau de la nappe.
 */
export function profilsVerticaux({ couches = [], panneaux, zMax, zw = null, largeur = 640, hauteur = 440, titre = "Profils" }) {
  const haut = 40, bas = 12, gauche = 34, ecart = 16;
  const H = hauteur - haut - bas;
  const Y = (z) => haut + (z / zMax) * H;
  const wCoupe = couches.length ? 104 : 0;
  const wP = (largeur - gauche - wCoupe - (couches.length ? ecart : 0) - ecart * (panneaux.length - 1) - 8) / panneaux.length;
  let x = gauche + wCoupe + (couches.length ? ecart : 0);
  const cadres = panneaux.map((p) => {
    const c = { ...p, x, w: wP };
    x += wP + ecart;
    const lg = p.log;
    c.X = (v) => c.x + (lg ? (Math.log10(v) - Math.log10(p.min)) / (Math.log10(p.max) - Math.log10(p.min)) : (v - p.min) / (p.max - p.min)) * wP;
    return c;
  });
  return svg({
    largeur, hauteur, titre, contenu: (id) => {
      let s = "";
      const pasZ = pasJoli(zMax, 8);
      for (let z = 0; z <= zMax + 1e-9; z += pasZ) {
        s += texte(gauche - 6, Y(z) + 4, fmt(z, 3), `text-anchor="end" class="pt"`);
        for (const c of cadres) s += ligne(c.x, Y(z), c.x + c.w, Y(z), COULEURS.grille, 1);
      }
      s += `<text transform="translate(11 ${haut + H / 2}) rotate(-90)" text-anchor="middle" style="font-weight:700;font-size:11px">profondeur (m)</text>`;
      if (couches.length) {
        const xc = gauche;
        for (const c of couches) {
          const a = Math.max(c.z0, 0), b = Math.min(c.z1, zMax);
          if (b <= a) continue;
          s += couche(id, { x: xc, y: Y(a), w: wCoupe, h: Y(b) - Y(a), sol: c.sol });
          if (c.nom && Y(b) - Y(a) >= 14) {
            const lignes = couper(c.nom, wCoupe - 10, 10.5).slice(0, Math.max(1, Math.floor((Y(b) - Y(a) - 4) / 12)));
            s += texteLignes(xc + wCoupe / 2, (Y(a) + Y(b)) / 2 + 4 - (lignes.length - 1) * 6, lignes, `text-anchor="middle" class="gr halo" style="font-size:10.5px"`, 12);
          }
        }
        s += `<rect x="${xc}" y="${haut}" width="${wCoupe}" height="${H}" fill="none" stroke="${COULEURS.trait}" stroke-width="1"/>`;
        s += texte(xc + wCoupe / 2, 16, "Coupe", `text-anchor="middle" style="font-weight:800;font-size:11.5px"`);
        if (zw !== null && zw < zMax) s += nappe(xc, Y(zw), wCoupe);
      }
      for (const c of cadres) {
        for (const b of c.bandes ?? []) {
          const x0 = c.X(Math.max(b.v0, c.min)), x1 = c.X(Math.min(b.v1, c.max));
          s += `<rect x="${x0.toFixed(1)}" y="${haut}" width="${(x1 - x0).toFixed(1)}" height="${H}" fill="${b.couleur}" opacity="${b.opacite ?? 0.14}"/>`;
          if (b.libelle && x1 - x0 > 14) s += `<text transform="translate(${((x0 + x1) / 2 + 4).toFixed(1)} ${haut + H - 6}) rotate(-90)" class="pt" style="font-size:10px">${esc(b.libelle)}</text>`;
        }
        const t = c.log ? graduationsLog(c.min, c.max).filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9) : [];
        const pas = c.log ? null : pasJoli(c.max - c.min, 4);
        const valeurs = c.log ? t : Array.from({ length: Math.floor((c.max - c.min) / pas + 1e-9) + 1 }, (_, i) => c.min + i * pas);
        if (c.log) for (const v of graduationsLog(c.min, c.max)) s += ligne(c.X(v), haut, c.X(v), haut + H, COULEURS.grille, 0.7);
        for (const v of valeurs) {
          const px = c.X(v);
          if (!c.log) s += ligne(px, haut, px, haut + H, COULEURS.grille, 1);
          const ancre = px - c.x < 6 ? "start" : c.x + c.w - px < 6 ? "end" : "middle";
          s += texte(px, haut - 6, fmt(v, 3), `text-anchor="${ancre}" class="pt"`);
        }
        s += `<rect x="${c.x.toFixed(1)}" y="${haut}" width="${c.w.toFixed(1)}" height="${H}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.1"/>`;
        s += texte(c.x + c.w / 2, 16, c.titre, `text-anchor="middle" style="font-weight:800;font-size:11.5px"`);
        const clip = `${id}-p${cadres.indexOf(c)}`;
        s += `<clipPath id="${clip}"><rect x="${c.x}" y="${haut}" width="${c.w}" height="${H}"/></clipPath>`;
        for (const se of c.series) {
          const pts = se.points.filter(([v, z]) => Number.isFinite(v) && Number.isFinite(z) && (!c.log || v > 0));
          if (!pts.length) continue;
          s += `<path d="${pts.map(([v, z], i) => `${i ? "L" : "M"}${c.X(v).toFixed(1)} ${Y(z).toFixed(1)}`).join("")}" fill="none" stroke="${se.couleur}" stroke-width="${se.epaisseur ?? 1.4}" ${se.tirets ? `stroke-dasharray="${se.tirets}"` : ""} stroke-linejoin="round" clip-path="url(#${clip})"/>`;
        }
      }
      return s;
    },
  });
}

/** Passe de carottage : morceaux (cm) dans l'ordre, ceux d'au moins 10 cm comptés dans le RQD. */
export function figureCarotte(morceaux, longueur, { largeur = 560, hauteur = 150 } = {}) {
  return svg({
    largeur, hauteur, titre: "Passe de carottage", contenu: () => {
      let s = "";
      const x0 = 30, w = largeur - 60, y = 46, h = 30;
      const X = (cm) => x0 + (cm / longueur) * w;
      s += `<rect x="${x0}" y="${y}" width="${w}" height="${h}" fill="#f1f5f9" stroke="${COULEURS.trait}" stroke-dasharray="4 3"/>`;
      let pos = 0;
      for (const l of morceaux) {
        if (!(l > 0)) continue;
        const compte = l >= 10;
        s += `<rect x="${X(pos).toFixed(1)}" y="${y + 2}" width="${Math.max(1, X(pos + l) - X(pos) - 1.5).toFixed(1)}" height="${h - 4}" rx="4" fill="${compte ? "#94a3b8" : "#e2e8f0"}" stroke="${compte ? COULEURS.trait : "#94a3b8"}"/>`;
        if (X(pos + l) - X(pos) > 22) s += texte((X(pos) + X(pos + l)) / 2, y + h / 2 + 4, fmt(l, 3), `text-anchor="middle" style="font-size:10.5px;font-weight:${compte ? 800 : 400}"`);
        pos += l;
      }
      if (pos < longueur) s += texte((X(pos) + X(longueur)) / 2, y + h / 2 + 4, "perte", `text-anchor="middle" class="pt"`);
      s += ligne(x0, y + h + 12, x0 + w, y + h + 12, COULEURS.cote, 1);
      for (let cm = 0; cm <= longueur + 1e-9; cm += longueur > 200 ? 50 : 25) {
        s += ligne(X(cm), y + h + 8, X(cm), y + h + 16, COULEURS.cote, 1);
        s += texte(X(cm), y + h + 30, `${fmt(cm, 3)} cm`, `text-anchor="middle" class="pt"`);
      }
      s += `<rect x="${x0}" y="20" width="18" height="12" rx="3" fill="#94a3b8" stroke="${COULEURS.trait}"/>`;
      s += texte(x0 + 24, 30, "morceau d'au moins 10 cm : compté dans le RQD", `style="font-size:11px;font-weight:700"`);
      s += `<rect x="${x0 + 300}" y="20" width="18" height="12" rx="3" fill="#e2e8f0" stroke="#94a3b8"/>`;
      s += texte(x0 + 324, 30, "morceau plus court", `style="font-size:11px"`);
      return s;
    },
  });
}

// ─────────────────────────── Sondage pressiométrique ─────────────────────

/** Graduations d'un axe logarithmique : 1, 2, 5 × 10ⁿ entre a et b. */
function graduationsLog(a, b) {
  const t = [];
  for (let n = Math.floor(Math.log10(a)); n <= Math.ceil(Math.log10(b)); n++) {
    for (const m of [1, 2, 5]) { const v = m * 10 ** n; if (v >= a * 0.999 && v <= b * 1.001) t.push(v); }
  }
  return t;
}

/**
 * Feuille de sondage pressiométrique : coupe du terrain, puis profils EM
 * (échelle logarithmique), pl* et pf*, et rapport EM/pl*, sur un même axe des
 * profondeurs. couches : [{ z0, z1, sol, nom, nature? }] ; essais :
 * [{ z, EM, plNette, pfNette }] (MPa) ; seuils : [{ z0, z1, valeurs: [9, 16] }]
 * repères du rapport EM/pl* propres à la nature de chaque couche ;
 * bandes : [{ z0, z1, libelle }] zones à mettre en évidence (sous une semelle…).
 */
export function profilPressio({ couches = [], essais = [], zMax = null, largeur = 640, hauteur = 460, seuils = [], bandes = [], titre = "Sondage pressiométrique" }) {
  const zBas = zMax ?? Math.ceil(Math.max(...essais.map((e) => e.z), ...couches.map((c) => c.z1).filter(Number.isFinite)) + 0.5);
  const haut = 40, bas = 14, gauche = 34;
  const H = hauteur - haut - bas;
  const Y = (z) => haut + (z / zBas) * H;
  const panneaux = [
    { cle: "coupe", w: 112, titre: "Coupe" },
    { cle: "EM", w: 150, titre: "EM (MPa)" },
    { cle: "pl", w: 150, titre: "pl* et pf* (MPa)" },
    { cle: "rapport", w: largeur - gauche - 112 - 150 - 150 - 3 * 16 - 8, titre: "EM/pl*" },
  ];
  let x = gauche;
  for (const p of panneaux) { p.x = x; x += p.w + 16; }
  const [pC, pE, pP, pR] = panneaux;
  const valides = essais.filter((e) => Number.isFinite(e.EM) && e.EM > 0);
  const emMin = 10 ** Math.floor(Math.log10(Math.min(...valides.map((e) => e.EM), 10)));
  const emMax = 10 ** Math.ceil(Math.log10(Math.max(...valides.map((e) => e.EM), 10) * 1.05));
  const XE = (v) => pE.x + ((Math.log10(v) - Math.log10(emMin)) / (Math.log10(emMax) - Math.log10(emMin))) * pE.w;
  const plMax = Math.max(0.5, ...essais.map((e) => e.plNette).filter(Number.isFinite)) * 1.08;
  const pasP = pasJoli(plMax, 4), plHaut = Math.ceil(plMax / pasP) * pasP;
  const XP = (v) => pP.x + (v / plHaut) * pP.w;
  const rMax = Math.max(20, ...valides.map((e) => e.EM / e.plNette).filter(Number.isFinite)) * 1.05;
  const pasR = pasJoli(rMax, 3), rHaut = Math.ceil(rMax / pasR) * pasR;
  const XR = (v) => pR.x + (v / rHaut) * pR.w;
  return svg({
    largeur, hauteur, titre, contenu: (id) => {
      let s = "";
      // Bandes mises en évidence (sous une fondation…), derrière tout le reste.
      for (const b of bandes) {
        s += `<rect x="${pE.x}" y="${Y(b.z0).toFixed(1)}" width="${pR.x + pR.w - pE.x}" height="${(Y(b.z1) - Y(b.z0)).toFixed(1)}" fill="${COULEURS.bleu}" opacity=".09"/>`;
      }
      // Axe des profondeurs et grille horizontale commune.
      const pasZ = pasJoli(zBas, 8);
      for (let z = 0; z <= zBas + 1e-9; z += pasZ) {
        s += texte(gauche - 6, Y(z) + 4, fmt(z, 3), `text-anchor="end" class="pt"`);
        for (const p of panneaux.slice(1)) s += ligne(p.x, Y(z), p.x + p.w, Y(z), COULEURS.grille, 1);
      }
      s += `<text transform="translate(11 ${haut + H / 2}) rotate(-90)" text-anchor="middle" style="font-weight:700;font-size:11px">profondeur (m)</text>`;
      // Coupe
      for (const c of couches) {
        const a = Math.max(c.z0, 0), b = Math.min(c.z1, zBas);
        if (b <= a) continue;
        s += couche(id, { x: pC.x, y: Y(a), w: pC.w, h: Y(b) - Y(a), sol: c.sol });
        if (c.nom && Y(b) - Y(a) >= 14) {
          const lignes = couper(c.nom, pC.w - 10, 10.5).slice(0, Math.max(1, Math.floor((Y(b) - Y(a) - 4) / 12)));
          s += texteLignes(pC.x + pC.w / 2, (Y(a) + Y(b)) / 2 + 4 - (lignes.length - 1) * 6, lignes, `text-anchor="middle" class="gr halo" style="font-size:10.5px"`, 12);
        }
      }
      s += `<rect x="${pC.x}" y="${haut}" width="${pC.w}" height="${H}" fill="none" stroke="${COULEURS.trait}" stroke-width="1"/>`;
      // Grilles verticales et graduations des trois profils ; aux bords d'un
      // panneau, le chiffre se cale vers l'intérieur pour ne pas toucher le voisin.
      const graduation = (px, p, v) => {
        const ancre = px - p.x < 6 ? "start" : p.x + p.w - px < 6 ? "end" : "middle";
        return texte(px, haut - 6, fmt(v, 3), `text-anchor="${ancre}" class="pt"`);
      };
      for (const v of graduationsLog(emMin, emMax)) {
        const decade = Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9;
        s += ligne(XE(v), haut, XE(v), haut + H, COULEURS.grille, decade ? 1.2 : 0.8);
        if (decade) s += graduation(XE(v), pE, v);
      }
      for (let v = 0; v <= plHaut + 1e-9; v += pasP) {
        s += ligne(XP(v), haut, XP(v), haut + H, COULEURS.grille, 1);
        s += graduation(XP(v), pP, v);
      }
      for (let v = 0; v <= rHaut + 1e-9; v += pasR) {
        s += ligne(XR(v), haut, XR(v), haut + H, COULEURS.grille, 1);
        s += graduation(XR(v), pR, v);
      }
      for (const p of panneaux) {
        // Le titre du panneau pl*/pf* sert de légende : chaque grandeur dans sa couleur.
        s += p.cle === "pl"
          ? `<text x="${(p.x + p.w / 2).toFixed(1)}" y="16" text-anchor="middle" style="font-weight:800;font-size:11.5px"><tspan style="fill:${COULEURS.effort}">● pl*</tspan> et <tspan style="fill:${COULEURS.f62}">▫ pf*</tspan> (MPa)</text>`
          : texte(p.x + p.w / 2, 16, p.titre, `text-anchor="middle" style="font-weight:800;font-size:11.5px"`);
        if (p.cle !== "coupe") s += `<rect x="${p.x}" y="${haut}" width="${p.w}" height="${H}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.1"/>`;
      }
      // Repères du rapport EM/pl*, couche par couche.
      for (const r of seuils) {
        for (const v of r.valeurs) {
          if (v > rHaut) continue;
          s += ligne(XR(v), Y(Math.max(r.z0, 0)), XR(v), Y(Math.min(r.z1, zBas)), COULEURS.discret, 1, 'stroke-dasharray="3 3"');
        }
      }
      for (const b of bandes) {
        if (b.libelle) s += texte(pR.x + pR.w - 4, Y(b.z1) - 4, b.libelle, `text-anchor="end" class="pt halo" style="fill:${COULEURS.bleu};font-weight:700;font-size:10px"`);
      }
      // Profils : un point par essai, reliés dans l'ordre des profondeurs.
      const tri = [...essais].sort((a, b) => a.z - b.z);
      const trace = (pts, couleur, tirets = "", forme = "rond") => {
        const ok = pts.filter(([px]) => Number.isFinite(px));
        if (!ok.length) return "";
        let t = `<path d="${ok.map(([px, z], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${Y(z).toFixed(1)}`).join("")}" fill="none" stroke="${couleur}" stroke-width="1.8" ${tirets ? `stroke-dasharray="${tirets}"` : ""}/>`;
        for (const [px, z] of ok) {
          t += forme === "rond"
            ? `<circle cx="${px.toFixed(1)}" cy="${Y(z).toFixed(1)}" r="3.2" fill="${couleur}" stroke="#fff" stroke-width="1"/>`
            : `<rect x="${(px - 3).toFixed(1)}" y="${(Y(z) - 3).toFixed(1)}" width="6" height="6" fill="#fff" stroke="${couleur}" stroke-width="1.5"/>`;
        }
        return t;
      };
      s += trace(tri.map((e) => [e.EM > 0 ? XE(Math.min(Math.max(e.EM, emMin), emMax)) : NaN, e.z]), COULEURS.bleu);
      s += trace(tri.map((e) => [Number.isFinite(e.pfNette) ? XP(Math.max(e.pfNette, 0)) : NaN, e.z]), COULEURS.f62, "5 3", "carre");
      s += trace(tri.map((e) => [Number.isFinite(e.plNette) ? XP(Math.max(e.plNette, 0)) : NaN, e.z]), COULEURS.effort);
      s += trace(tri.map((e) => [e.plNette > 0 && e.EM > 0 ? XR(Math.min(e.EM / e.plNette, rHaut)) : NaN, e.z]), COULEURS.violet);
      return s;
    },
  });
}

// ───────────────────────── Diagramme des contraintes ─────────────────────

/**
 * Semelle vue en coupe avec son diagramme de contraintes et la zone comprimée.
 * Les valeurs de q'ref (F62) et de la contrainte de Meyerhof (EC7) sont
 * écrites en légende sous le diagramme ; sur le dessin, de simples repères,
 * posés par le placeur à l'écart des tracés.
 */
export function figureContraintes({ B, V, e, qmax, qmin, Bc, qref = null, meyerhof = null, largeur = 560, hauteur = 0, uniteV = "kN/m" }) {
  const legendes = (qref ? 1 : 0) + (meyerhof ? 1 : 0);
  const yS = 70, hDiag = 104;
  const yLeg = yS + hDiag + 34;
  const yComp = yLeg + legendes * 16 + 12;
  const yB = yComp + 26;
  const hTot = Math.max(hauteur, yB + 16);
  return svg({
    largeur, hauteur: hTot, titre: "Diagramme des contraintes sous la semelle", contenu: (id) => {
      const g = 60, W = largeur - 2 * g;
      const X = (x) => g + (x / B) * W;
      const ech = hDiag / Math.max(qmax, 1);
      const ea = Math.abs(e);
      const P = placeur({ x: 2, y: 2, w: largeur - 4, h: yLeg - 16 });
      const rouge = (taille, graisse, couleur) => `class="halo" style="font-size:${taille}px;font-weight:${graisse};fill:${couleur}"`;
      let s = "";
      s += `<rect x="${g}" y="${yS - 26}" width="${W}" height="26" fill="${COULEURS.beton}" stroke="${COULEURS.betonTrait}" stroke-width="1.5"/>`;
      s += `<rect x="${g}" y="${yS - 26}" width="${W}" height="26" fill="url(#${id}-beton)"/>`;
      P.boite({ x: g, y: yS - 26, w: W, h: 26 });
      const xe = X(B / 2 + ea);
      s += fleche(id, xe, 6, xe, yS - 30, { libelle: `V = ${fmt(V, 4)} ${uniteV}`, position: "debut", P });
      s += ligne(X(B / 2), yS - 30, X(B / 2), yS + 2, COULEURS.discret, 1, 'stroke-dasharray="3 3"');
      P.segment(X(B / 2), yS, X(B / 2), yS + 2, 0.5);
      // Diagramme : de x = B − Bc (bord décomprimé) à x = B (bord le plus chargé).
      const x0 = B - Bc;
      const pts = [[X(x0), yS], [X(x0), yS + qmin * ech], [X(B), yS + qmax * ech], [X(B), yS]];
      s += `<path d="M${pts.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join("L")}Z" fill="${COULEURS.reaction}" fill-opacity=".18" stroke="${COULEURS.reaction}" stroke-width="1.8"/>`;
      P.polyligne(pts.slice(0, 4), 2);
      // Ordonnée du bord du diagramme à l'abscisse x (en px).
      const yBord = (x) => yS + (qmin + ((qmax - qmin) * (x - X(x0))) / Math.max(X(B) - X(x0), 1)) * ech;
      if (x0 > 0) {
        s += `<rect x="${X(0)}" y="${yS}" width="${(X(x0) - X(0)).toFixed(1)}" height="8" fill="#fee2e2"/>`;
        P.boite({ x: X(0), y: yS, w: X(x0) - X(0), h: 8 }, 2);
        const xm = (X(0) + X(x0)) / 2;
        P.texte([{ x: xm, y: yS + 22, ancre: "middle" }, { x: X(0) + 4, y: yS + 22, ancre: "start" }, { x: xm, y: yS + 38, ancre: "middle" }]
          .map((c) => ({ ...c, lignes: ["décollée"] })), rouge(11, 800, COULEURS.rouge), { taille: 11, priorite: 1 });
      }
      if (meyerhof) {
        const xa = X(2 * ea), xb = X(B), ym = yS + meyerhof * ech;
        s += `<rect x="${xa.toFixed(1)}" y="${(ym - 1.25).toFixed(1)}" width="${(xb - xa).toFixed(1)}" height="2.5" fill="${COULEURS.violet}"/>`;
        P.segment(xa, ym, xb, ym, 2);
        P.texte([
          { x: xa + 4, y: ym - 5, ancre: "start" }, { x: xa + 4, y: ym + 13, ancre: "start" },
          { x: (xa + xb) / 2, y: ym - 5, ancre: "middle" }, { x: (xa + xb) / 2, y: ym + 13, ancre: "middle" },
          { x: xb - 4, y: ym - 5, ancre: "end" }, { x: xb - 4, y: ym + 13, ancre: "end" },
        ].map((c) => ({ ...c, lignes: ["Meyerhof"] })), rouge(11, 800, COULEURS.violet), { taille: 11, priorite: 2 });
      }
      if (qref) {
        const xr = X(B - Bc / 4), hr = qref * ech;
        s += ligne(xr, yS, xr, yS + hr, COULEURS.f62, 2, 'stroke-dasharray="5 3"');
        P.segment(xr, yS, xr, yS + hr, 2);
        P.texte([0.5, 0.3, 0.75].flatMap((f) => [
          { x: xr - 5, y: yS + f * hr + 4, ancre: "end" }, { x: xr + 5, y: yS + f * hr + 4, ancre: "start" },
        ]).map((c) => ({ ...c, lignes: ["q'ref"] })), rouge(11, 800, COULEURS.f62), { taille: 11, priorite: 2 });
      }
      // Valeurs extrêmes : q'max sous le coin le plus chargé, q'min sous le bord du diagramme.
      const tMax = `q'max = ${fmt(qmax, 4)} kPa`;
      P.texte([
        { x: X(B), y: yS + qmax * ech + 16, ancre: "end" }, { x: X(B) - 6, y: yS + qmax * ech - 8, ancre: "end" },
      ].map((c) => ({ ...c, lignes: [tMax] })), rouge(12, 800, COULEURS.reaction), { taille: 12, priorite: 4 });
      if (qmin > 0) {
        const l1 = [`q'min = ${fmt(qmin, 4)} kPa`], l2 = ["q'min =", `${fmt(qmin, 4)} kPa`];
        const sous = (l, dy) => ({ x: X(x0) + 2, y: yBord(X(x0) + 2 + Math.max(...l.map((t) => largeurTexte(t, 12)))) + dy, ancre: "start", lignes: l });
        P.texte([sous(l1, 14), sous(l2, 14), sous(l1, 28), sous(l2, 28)], rouge(12, 700, COULEURS.reaction), { taille: 12, priorite: 3 });
      }
      s += P.rendre();
      // Légende des contraintes de référence.
      let yl = yLeg;
      if (qref) {
        s += ligne(g, yl - 4, g + 18, yl - 4, COULEURS.f62, 2, 'stroke-dasharray="5 3"');
        s += texte(g + 24, yl, `q'ref (Fascicule 62) = ${fmt(qref, 4)} kPa, aux 3/4 de la largeur comprimée`, `style="font-size:11.5px;font-weight:700;fill:${COULEURS.f62}"`);
        yl += 16;
      }
      if (meyerhof) {
        s += `<rect x="${g}" y="${yl - 5.25}" width="18" height="2.5" fill="${COULEURS.violet}"/>`;
        s += texte(g + 24, yl, `Meyerhof (NF P94-261) = ${fmt(meyerhof, 4)} kPa sur B' = B − 2e = ${fmt(B - 2 * ea, 3)} m`, `style="font-size:11.5px;font-weight:700;fill:${COULEURS.violet}"`);
      }
      // Cotes : le libellé d'une zone comprimée très courte reste dans le cadre.
      const Pc = placeur({ x: 2, y: 2, w: largeur - 4, h: hTot - 4 });
      s += cote(id, X(x0), yComp, X(B), yComp, `largeur comprimée : ${fmt(Bc, 3)} m (${fmt((100 * Bc) / B, 3)} %)`, { P: Pc });
      s += cote(id, X(0), yB, X(B), yB, `B = ${fmt(B, 3)} m`, { P: Pc });
      s += Pc.rendre();
      return s;
    },
  });
}

/**
 * Coupe d'un remblai sur un multicouche (bureau de calcul) : remblai
 * trapézoïdal à l'échelle, couches depuis le terrain naturel, nappe dans les
 * champs libres, drains verticaux jusqu'à zDrains (représentés, pas à
 * l'échelle de leur espacement). couches : [{ z0, z1, sol, etiquette }].
 */
export function coupeRemblai({ H, largeurCrete, fruit, couches, zw = null, zDrains = null, largeur = 560, hauteur = 300 }) {
  const zBas = Math.max(...couches.map((c) => c.z1));
  const demi = largeurCrete / 2 + fruit * H, marge = Math.max(3, 0.2 * demi);
  const k = Math.min((largeur - 24) / (2 * (demi + marge)), (hauteur - 36) / (H + zBas));
  // Coupe à l'échelle : la hauteur de la figure suit celle du profil.
  return svg({
    largeur, hauteur: Math.min(hauteur, Math.ceil(36 + (H + zBas) * k)), titre: "Coupe du remblai et du sol", contenu: (id) => {
      const xc = largeur / 2, yT = 28 + H * k, X = (x) => xc + x * k, Z = (z) => yT + z * k;
      const xg = X(-(demi + marge)), xd = X(demi + marge);
      let s = "";
      for (const c of couches) s += couche(id, { x: xg, y: Z(c.z0), w: xd - xg, h: (c.z1 - c.z0) * k, sol: c.sol, etiquette: c.etiquette, cote: "droite" });
      const pts = [[X(-demi), yT], [X(-largeurCrete / 2), yT - H * k], [X(largeurCrete / 2), yT - H * k], [X(demi), yT]];
      const d = `${pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("")}Z`;
      s += `<path d="${d}" fill="${SOLS.remblai.fond}"/><path d="${d}" fill="url(#${id}-remblai)"/><path d="${d}" fill="none" stroke="${COULEURS.trait}" stroke-width="1.5"/>`;
      if (zDrains > 0) {
        const zD = Math.min(zDrains, zBas), n = Math.max(4, Math.round((2 * demi * k) / 11));
        for (let i = 1; i < n; i++) { const x = X(-demi + (2 * demi * i) / n); s += ligne(x, yT, x, Z(zD), "#1e293b", 0.8, 'opacity=".65"'); }
      }
      s += ligne(xg, yT, xd, yT, COULEURS.trait, 1.6);
      if (zw !== null && zw < zBas) {
        const y = Z(zw);
        s += ligne(xg, y, X(-demi), y, COULEURS.eau, 1.3, 'stroke-dasharray="6 4"') + ligne(X(demi), y, xd, y, COULEURS.eau, 1.3, 'stroke-dasharray="6 4"');
        s += `<path d="M${(xg + 14).toFixed(1)} ${(y - 1).toFixed(1)}l6-9h-12z" fill="${COULEURS.eau}"/>`;
      }
      s += texte(xc, 16, `crête ${fmt(largeurCrete, 3)} m · H = ${fmt(H, 3)} m · talus ${fmt(fruit, 2)}/1`, 'text-anchor="middle" class="halo" style="font-size:11.5px;font-weight:700"');
      return s;
    },
  });
}
