/**
 * Plans d'un tablier à poutres en béton armé (onglet « Tablier à poutres », poutres BA) : coffrage et ferraillage, sur le
 * modèle des feuilles VIPP et du tablier (cartouche, vues cotées, tableaux, notes ; export SVG, DXF et PDF).
 *
 * Règles de dessin du dossier Sétra PSI-BA 77, pièce V (établissement des plans d'exécution à partir de la note de calcul) :
 *  - coffrage : coupe transversale du tablier (poutres, hourdis, entretoises d'about), élévation d'une poutre, coupe de la
 *    poutre, quantités ;
 *  - armatures longitudinales inférieures (§ V.1.3) : barres groupées en lits dans le talon, arrêtées d'après l'épure : courbe
 *    des sections nécessaires décalée de 0,8 h vers l'appui (Fascicule 61 titre VI / BAEL 91 A.4.1,5) et prolongée de la
 *    longueur de scellement droit l_s ; le lit inférieur (au moins deux barres d'angle) est filant et ancré au-delà de l'appui ;
 *  - armatures d'âme (§ V.1.5) : épure de répartition des étriers par zones depuis l'appui ;
 *  - hourdis (§ V.1.2) : nappes transversales inférieure et supérieure par mètre, armatures longitudinales de répartition ;
 *  - entretoises d'about (§ V.1.8) : armatures inférieures et supérieures, étriers (vérinage).
 * Cotes en mètres.
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { couperNote } from './appuis.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const numeroter = (L, n = 70) => { let k = 0; return L.flatMap((l, i) => (i === 0 ? [l] : couperNote(l.replace(/^\d+\. /, () => `${++k}. `), n))); };
const aire = phi => Math.PI * (phi / 1000) ** 2 / 4;
const kgm = phi => 0.00617 * phi * phi;   // masse linéique (kg/m) d'une barre HA de diamètre φ [mm]
function finir(F) { F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(p => '1/' + p.vue.echelle + (p.vue.echelleV ? ` (V 1/${p.vue.echelleV})` : '')))].join(' ; '); return F; }

/** Rectangles empilés de la poutre (du talon vers la table), sinon âme rectangulaire b₀ × (H − h_d). */
export function partiesPoutre(inp, sec) {
  if (inp.beam && inp.beam.parts && inp.beam.parts.length) return inp.beam.parts;
  return [{ b: inp.b0, h: Math.max((sec.H || inp.beam.H || 1) - inp.hd, 0.3) }];
}

/** Ancrage droit : BAEL 91 A.6.1,23 l_s = φ f_e/(4 τ_su), τ_su = 0,6 ψ_s² f_tj (ψ_s = 1,5) ; EC2 § 8.4.4 l_bd = (φ/4)(f_yd/f_bd). */
export function longueurScellement({ phi, fck, fyk, code = 'BAEL' }) {
  const p = phi / 1000;
  if (code === 'EC') { const fctd = 0.7 * 0.3 * fck ** (2 / 3) / 1.5, fbd = 2.25 * fctd; return Math.max(p / 4 * (fyk / 1.15) / fbd, 10 * p, 0.10); }
  const tsu = 0.6 * 1.5 ** 2 * (0.6 + 0.06 * fck);
  return p * fyk / (4 * tsu);
}

/**
 * Armatures inférieures de la poutre la plus sollicitée : diamètre, nombre de barres et lits dans le talon, épure d'arrêt.
 * @returns { phi, n, lits: [{ n, y, x0 (arrêt depuis l'axe d'appui), L (longueur), filant }], As, Asx, ls, decal, bt }
 */
export function barresInferieures({ As, parts, cover = 0.03, phiT = 10, L, a = 0.30, profil, h, fck, fyk, code }) {
  const bt = parts[0].b, e0 = 0.025;
  let choix = null;
  for (const phi of [20, 25, 32, 40]) {
    const p = phi / 1000, e = Math.max(p, e0), nmax = Math.max(2, Math.floor((bt - 2 * cover - 2 * phiT / 1000 + e) / (p + e)));
    const n = Math.max(2, Math.ceil(As / aire(phi)));
    const nl = Math.ceil(n / nmax);
    if (nl <= 3 || phi === 40) { choix = { phi, n, nmax, nl, e }; break; }
  }
  const { phi, n, nmax, nl, e } = choix, p = phi / 1000;
  // répartition par lits (le plus chargé en bas), ordonnées des axes des lits depuis la sous-face
  const lits = [];
  for (let k = 0, reste = n; k < nl; k++) { const nk = Math.min(nmax, reste); reste -= nk; lits.push({ n: nk, y: cover + phiT / 1000 + p / 2 + k * (p + e) }); }
  // épure : section nécessaire As·M(x)/M(L/2), décalée de 0,8 h vers l'appui, plus l_s ; lits arrêtés du haut vers le bas
  const ls = longueurScellement({ phi, fck, fyk, code }), decal = 0.8 * h, Mmid = profil(L / 2) || 1;
  const besoin = x => As * Math.max(profil(Math.min(L / 2, x + decal)), 0) / Mmid;   // section nécessaire en x (depuis l'appui)
  let cumul = n;
  for (let k = lits.length - 1; k >= 1; k--) {
    cumul -= lits[k].n;
    const Areste = cumul * aire(phi);
    // x théorique : première abscisse où la section restante ne suffit plus
    let xt = L / 2;
    for (let x = 0; x <= L / 2 + 1e-9; x += L / 400) if (besoin(x) > Areste + 1e-12) { xt = x; break; }
    const x0 = Math.max(0, xt - ls);
    lits[k].filant = x0 <= 1e-9;
    lits[k].x0 = lits[k].filant ? -a + cover : x0; lits[k].L = lits[k].filant ? L + 2 * (a - cover) : L - 2 * x0;
  }
  lits[0].x0 = -a + cover; lits[0].L = L + 2 * (a - cover); lits[0].filant = true;   // lit inférieur filant, ancré au-delà de l'appui
  return { phi, n, nl, lits, As, Asx: n * aire(phi), ls, decal, bt, e };
}

/** Étriers (cadre + étriers) : brins, diamètre et espacement pour A_t/s_t (m²/m), s ≤ s_max, arrondi à 5 cm. */
export function etrierBA(AtSt, smax) {
  for (const brins of [2, 4]) for (const phi of [8, 10, 12, 14]) {
    const s = Math.min(Math.floor(brins * aire(phi) / Math.max(AtSt, 1e-9) / 0.05) * 0.05, Math.floor(smax / 0.05) * 0.05);
    if (s >= 0.10) return { brins, phi, s };
  }
  return { brins: 4, phi: 16, s: 0.10 };
}

/** Données des plans : poutre la plus sollicitée de la plus longue travée, sections retenues selon le règlement choisi. */
export function donneesBA(r, { code = 'BAEL' } = {}) {
  if (!r || !r.spans || r.inp.type !== 'BA') return null;
  const sp = r.spans.reduce((a, q) => (q.L > a.L ? q : a)), inp = r.inp, sec = r.sec;
  const b = sp.beams.reduce((m, q) => ((q.BA.retenu ? q.BA.retenu[code] : q.BA[code].As) > (m.BA.retenu ? m.BA.retenu[code] : m.BA[code].As) ? q : m));
  const parts = partiesPoutre(inp, sec), hp = parts.reduce((s, q) => s + q.h, 0), H = hp + inp.hd, d = H - inp.cover;
  const As = b.BA.retenu ? b.BA.retenu[code] : b.BA[code].As, a = inp.pose && inp.pose.about != null ? Math.min(inp.pose.about, 0.5) : 0.30;
  const tr = b.BA.travee || [];
  const profil = x => { if (!tr.length) return 4 * x * (sp.L - x) / (sp.L * sp.L); let k = tr.findIndex(t => t.x >= x - 1e-9); if (k <= 0) return tr[0].MEd * (k === 0 ? 1 : 0); const t0 = tr[k - 1], t1 = tr[k]; return t0.MEd + (t1.MEd - t0.MEd) * (x - t0.x) / (t1.x - t0.x); };
  const bars = barresInferieures({ As, parts, cover: 0.03, phiT: 10, L: sp.L, a, profil, h: H, fck: inp.fck, fyk: inp.fyk, code });
  // étriers : EC2 le long de la travée, ou BAEL (τ_u(x) proportionnel à V_Ed(x)) ; zones depuis l'appui
  const V0 = tr.length ? tr[0].VEd : 0, B0 = b.BA.cisaillementBAEL, ftj = 0.6 + 0.06 * inp.fck;
  const AtSt = t => (code === 'EC' ? t.V.AswS : B0 ? Math.max(1.15 * Math.max(0, B0.tau * (V0 > 0 ? t.VEd / V0 : 1) - 0.3 * ftj) * inp.b0 / (0.9 * inp.fyk), 0.4 * inp.b0 / inp.fyk) : t.V.AswS);
  const smax = code === 'EC' ? Math.min(0.75 * d, 0.40) : Math.min(0.9 * d, 0.40), zones = [];
  // diamètre et nombre de brins fixés par la zone d'appui, espacement variable le long de la travée
  const e0 = etrierBA(Math.max(...tr.map(AtSt), 1e-9), smax);
  const espace = A => Math.min(Math.max(0.10, Math.floor(e0.brins * aire(e0.phi) / Math.max(A, 1e-9) / 0.05) * 0.05), Math.floor(smax / 0.05) * 0.05);
  tr.forEach((t, k) => {
    const e = { brins: e0.brins, phi: e0.phi, s: Math.round(espace(AtSt(t)) * 100) / 100 }, x1 = k < tr.length - 1 ? (t.x + tr[k + 1].x) / 2 : sp.L / 2, last = zones[zones.length - 1];
    if (last && last.phi === e.phi && last.s === e.s && last.brins === e.brins) last.x1 = x1; else zones.push({ x0: last ? last.x1 : 0, x1, ...e, AtSt: AtSt(t) });
  });
  return { r, sp, b, inp, sec, parts, hp, H, d, As, a, bars, zones, code, hourdis: r.hourdis, entretoise: r.entretoise };
}

/** Coupe de la poutre (rectangles empilés centrés) avec sa largeur de hourdis b₁. */
function vuePoutre(D, { titre, armatures = null, echelle = 20 }) {
  const V = new Vue(titre, { echelle }), { parts, hp, inp } = D;
  let y = 0;
  const pts = [];
  // contour : montée à droite, descente à gauche
  const right = [], left = [];
  parts.forEach(q => { right.push([q.b / 2, y], [q.b / 2, y + q.h]); left.unshift([-q.b / 2, y + q.h], [-q.b / 2, y]); y += q.h; });
  pts.push(...right, ...left);
  V.poly('COFFRAGE', pts, true); V.hachure(pts);
  V.poly('COFFRAGE', [[-inp.b1 / 2, hp], [inp.b1 / 2, hp], [inp.b1 / 2, hp + inp.hd], [-inp.b1 / 2, hp + inp.hd]], true);
  V.ligne('AXES', [0, -0.15], [0, hp + inp.hd + 0.15]);
  if (armatures) armatures(V);
  V.coteH([-inp.b1 / 2, hp + inp.hd], [inp.b1 / 2, hp + inp.hd], hp + inp.hd + 0.15, `b₁ = ${fr(inp.b1)}`);
  V.coteH([-parts[0].b / 2, 0], [parts[0].b / 2, 0], -0.12);
  V.coteV([-inp.b1 / 2, hp], [-inp.b1 / 2, hp + inp.hd], -inp.b1 / 2 - 0.10);
  V.coteV([-parts[0].b / 2, 0], [-parts[0].b / 2, hp], -parts[0].b / 2 - 0.25);
  let yy = 0; parts.forEach((q, i) => { if (i < parts.length) V.texte('TEXTES', [q.b / 2 + 0.03, yy + q.h / 2], `${fr(q.b * 100, 0)} × ${fr(q.h * 100, 0)}`, { h: 1.8, v: 'm' }); yy += q.h; });
  return V;
}

/** Coupe transversale du tablier : poutres, hourdis, entretoise d'about (tiretée), chaussée et trottoirs. */
function vueTablier(D, { titre = 'COUPE TRANSVERSALE DU TABLIER' } = {}) {
  const { inp, parts, hp } = D, n = inp.n, b1 = inp.b1, W = n * b1, V = new Vue(titre, { echelle: 50 });
  const ys = Array.from({ length: n }, (_, k) => -W / 2 + b1 * (k + 0.5));
  V.poly('COFFRAGE', [[-W / 2, hp], [W / 2, hp], [W / 2, hp + inp.hd], [-W / 2, hp + inp.hd]], true);
  for (const y0 of ys) {
    let y = 0; const right = [], left = [];
    parts.forEach(q => { right.push([y0 + q.b / 2, y], [y0 + q.b / 2, y + q.h]); left.unshift([y0 - q.b / 2, y + q.h], [y0 - q.b / 2, y]); y += q.h; });
    V.poly('COFFRAGE', [...right, ...left], true);
    V.ligne('AXES', [y0, -0.25], [y0, hp + inp.hd + 0.3]);
  }
  // entretoise d'about (vue au-delà, tiretée) entre poutres
  const he = D.entretoise ? D.entretoise.he : hp - 0.1;
  V.poly('VUES', [[ys[0], hp - he], [ys[n - 1], hp - he], [ys[n - 1], hp], [ys[0], hp]], true);
  // chaussée et trottoirs (au-dessus du hourdis)
  const zr = hp + inp.hd + 0.08;
  if (inp.roadway) { V.ligne('VUES', [inp.roadway.y1, zr], [inp.roadway.y2, zr]); V.texte('TEXTES', [(inp.roadway.y1 + inp.roadway.y2) / 2, zr + 0.06], `chaussée ${fr(inp.roadway.y2 - inp.roadway.y1)} m`, { h: 2.2, ancre: 'c' }); }
  for (const f of inp.footways || []) { const y1 = Math.max(f.y1, -W / 2), y2 = Math.min(f.y2, W / 2); if (y2 > y1) V.poly('VUES', [[y1, hp + inp.hd], [y2, hp + inp.hd], [y2, hp + inp.hd + 0.20], [y1, hp + inp.hd + 0.20]], true); }
  for (let k = 0; k < n - 1; k++) V.coteH([ys[k], -0.25], [ys[k + 1], -0.25], -0.4);
  V.coteH([-W / 2, hp + inp.hd], [W / 2, hp + inp.hd], hp + inp.hd + 0.55, `${fr(W)}`);
  V.coteV([ys[0] - parts[0].b / 2, 0], [ys[0] - parts[0].b / 2, hp + inp.hd], -W / 2 - 0.3);
  ys.forEach((y0, k) => V.texte('TEXTES', [y0, -0.75], `P${k + 1}`, { h: 2.2, ancre: 'c' }));
  return V;
}

/** Élévation d'une poutre entre abouts (échelle verticale dilatée), entretoises d'about, appareils. */
function vueElevation(D, { barres = false } = {}) {
  const { sp, a, H, hp, inp, bars } = D, L = sp.L, Lp = L + 2 * a, te = D.entretoise ? D.entretoise.te : 0.25;
  const V = new Vue(barres ? 'ÉLÉVATION — ÉPURE D\'ARRÊT DES BARRES INFÉRIEURES' : 'ÉLÉVATION DE LA POUTRE', { echelle: 100, echelleV: 25 });
  V.poly('COFFRAGE', [[0, 0], [Lp, 0], [Lp, H], [0, H]], true);
  V.ligne('VUES', [0, hp], [Lp, hp]);
  for (const xe of [a - te / 2, Lp - a - te / 2]) V.poly('VUES', [[xe, H - (D.entretoise ? D.entretoise.he + inp.hd : hp)], [xe + te, H - (D.entretoise ? D.entretoise.he + inp.hd : hp)], [xe + te, H], [xe, H]], true);
  for (const xa of [a, Lp - a]) { V.ligne('AXES', [xa, -0.35], [xa, H + 0.25]); V.poly('APPAREILS', [[xa - 0.2, -0.06], [xa + 0.2, -0.06], [xa + 0.2, 0], [xa - 0.2, 0]], true); }
  V.ligne('AXES', [Lp / 2, -0.25], [Lp / 2, H + 0.25]);
  V.texte('TEXTES', [Lp / 2, H + 0.3], 'mi-travée', { h: 2.2, ancre: 'c' });
  if (barres) {
    bars.lits.forEach((l, k) => {
      const x0 = a + l.x0, x1 = x0 + l.L, y = l.y;
      V.poly('ACIERS', l.filant ? [[x0, y + 0.25], [x0, y], [x1, y], [x1, y + 0.25]] : [[x0, y], [x1, y]]);
      V.repere([x1 + 0.45 + 0.35 * k, y + 0.12 * k], k + 1, [x1 - 0.05, y]);
      if (!l.filant) V.coteH([a, 0], [x0, 0], -0.35 - 0.25 * k, fr(l.x0));
    });
    // armatures supérieures de montage ; armatures d'âme : zones cotées sur la demi-travée gauche, quelques cadres dessinés
    V.poly('ACIERS', [[0.03, hp - 0.05], [Lp - 0.03, hp - 0.05]]);
    D.zones.forEach((z, k) => {
      for (let x = z.x0; x < Math.min(z.x1, z.x0 + 3 * z.s) - 1e-9; x += z.s) for (const xx of [a + x, Lp - a - x]) V.ligne('ACIERS', [xx, 0.03], [xx, H - 0.03]);
      V.coteH([a + z.x0, H], [a + z.x1, H], H + 0.30 + 0.22 * (k % 2), `${z.brins === 4 ? 'C+E' : 'C'} HA${z.phi}/${fr(z.s * 100, 0)}`);
    });
  }
  V.coteH([a, 0], [Lp - a, 0], barres ? -1.2 : -0.55, `L = ${fr(L)}`);
  V.coteH([0, 0], [Lp, 0], barres ? -1.5 : -0.85, `${fr(Lp)}`);
  V.coteV([0, 0], [0, H], -0.6);
  return V;
}

export function planCoffrageBA(D, cartouche = {}, { nom = 'TABLIER À POUTRES BA' } = {}) {
  const { inp, sp, parts, hp, H, a } = D, L = sp.L, Lp = L + 2 * a, n = inp.n, te = D.entretoise ? D.entretoise.te : 0.25, he = D.entretoise ? D.entretoise.he : hp - 0.1;
  const ct = vueTablier(D), el = vueElevation(D), cp = vuePoutre(D, { titre: 'COUPE DE LA POUTRE (MI-TRAVÉE)' });
  const Ap = parts.reduce((s, q) => s + q.b * q.h, 0), vP = Ap * Lp * n, vH = n * inp.b1 * inp.hd * Lp, vE = 2 * te * he * (n - 1) * inp.b1;
  const coff = n * Lp * (2 * hp + parts[0].b) + n * inp.b1 * Lp;
  const tq = { titre: `QUANTITÉS (UNE TRAVÉE DE ${fr(L)} m)`, cols: [{ t: 'Désignation', w: 96, a: 'g' }, { t: 'Unité', w: 18, a: 'c' }, { t: 'Quantité', w: 30, a: 'd' }],
    lignes: [[`Béton des poutres (${n} × ${fr(Ap, 3)} m² × ${fr(Lp)} m)`, 'm³', fr(vP, 2)], ['Béton du hourdis', 'm³', fr(vH, 2)], ['Béton des entretoises d\'about', 'm³', fr(vE, 2)], ['Total béton (C' + inp.fck + ')', 'm³', fr(vP + vH + vE, 2)], ['Coffrage (estimation)', 'm²', fr(coff, 0)]] };
  const N = numeroter(['NOTES', `1. Cotes en mètres. Tablier coulé en place sur cintre : ${n} poutres de ${fr(H)} m (hourdis compris) à ${fr(inp.b1)} m d'entraxe, hourdis de ${fr(inp.hd)} m, travée de ${fr(L)} m entre axes d'appui, abouts de ${fr(a)} m.`,
    `2. Entretoises d'about de ${fr(te)} m d'épaisseur et ${fr(he)} m de hauteur sous hourdis, dimensionnées pour le vérinage (onglet Tablier à poutres).`,
    '3. Goussets des poutres de rive et ailes du talon du côté intérieur de l\'ouvrage (dossier Sétra PSI-BA 77, pièce V.1.1).',
    '4. Épaississement de l\'âme près des appuis (gousset d\'appui) si la contrainte de cisaillement l\'exige : voir la note de calcul.',
    '5. Ferraillage : plan BA-FER-01 ; équipements (corniches, trottoirs, étanchéité) : plans du tablier.']);
  const hq = (tq.lignes.length + 2) * 6, hn = N.length * 2.1 * 1.6;
  const F = composer({ titre: `${nom} — COFFRAGE`, cartouche, rangees: [[ct], [el], [cp]],
    groupes: [{ vues: [ct], cible: 50, min: 20 }, { vues: [el], cible: 100, min: 50 }, { vues: [cp], cible: 20, min: 10 }],
    colonne: { largeur: 156, hauteur: 2 + hq + 6 + hn + 4 },
    poser: (F, [x, y]) => { F.tableau(tq, F.W - 10 - 146, y + 2); F.note(N, F.W - 10 - 156 + 2, y + 2 + hq + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A3', 'A2', 'A1']);
  F.quantites = { beton: vP + vH + vE, coffrage: coff };
  return finir(F);
}

/** Proposition de nappe par mètre (HA10 à HA25, espacement de 10 à 25 cm, arrondi à 2,5 cm). */
export function nappeBA(As) {
  for (const phi of [10, 12, 14, 16, 20, 25]) {
    const s = Math.min(Math.floor(aire(phi) / Math.max(As, 1e-9) / 0.025) * 0.025, 0.25);
    if (s >= 0.10) return { phi, s };
  }
  return { phi: 25, s: 0.10 };
}

export function planFerraillageBA(D, cartouche = {}, { nom = 'TABLIER À POUTRES BA' } = {}) {
  const { inp, sp, parts, hp, H, a, bars, zones, code } = D, L = sp.L, Lp = L + 2 * a, c = 0.03, bt = parts[0].b, b0 = parts.length > 1 ? Math.min(...parts.map(q => q.b)) : bt;
  const Hd = D.hourdis && !D.hourdis.erreur ? D.hourdis : null;
  const ni = Hd && Hd.inf ? nappeBA(Hd.inf.As) : nappeBA(0.0012 * inp.hd), ns = Hd && Hd.sup ? nappeBA(Hd.sup.As) : nappeBA(0.0012 * inp.hd);
  const rep = nappeBA(Math.max(aire(ni.phi) / ni.s / 4, 0.0008 * inp.hd));   // répartition longitudinale ≥ A_s/4 (BAEL A.8.2,41)
  const E = D.entretoise, z0 = zones[0] || { phi: 10, s: 0.2, brins: 2 };
  const cp = vuePoutre(D, { titre: 'COUPE A-A : FERRAILLAGE DE LA POUTRE (MI-TRAVÉE)', armatures: V => {
    const ph = bars.phi / 1000, pt = z0.phi / 1000;
    // cadre suivant le talon et l'âme jusqu'au hourdis
    V.poly('ACIERS', [[-b0 / 2 + c, hp + inp.hd - c], [-b0 / 2 + c, parts[0].h], [-bt / 2 + c, parts[0].h - 0.02], [-bt / 2 + c, c], [bt / 2 - c, c], [bt / 2 - c, parts[0].h - 0.02], [b0 / 2 - c, parts[0].h], [b0 / 2 - c, hp + inp.hd - c]], true);
    if (z0.brins === 4) V.poly('ACIERS', [[-bt / 4 + c, c + 0.01], [-bt / 4 + c, hp + inp.hd - c - 0.01], [bt / 4 - c, hp + inp.hd - c - 0.01], [bt / 4 - c, c + 0.01]], true);
    bars.lits.forEach(l => { for (let k = 0; k < l.n; k++) V.cercle('ACIERS_COUPES', [-bt / 2 + c + pt + ph / 2 + k * (l.n > 1 ? (bt - 2 * c - 2 * pt - ph) / (l.n - 1) : 0), l.y], ph / 2, true); });
    // nappes du hourdis (sections transversales vues en coupe longitudinale : barres de répartition)
    for (const yy of [hp + 0.035, hp + inp.hd - 0.035]) V.poly('ACIERS', [[-inp.b1 / 2 + 0.03, yy], [inp.b1 / 2 - 0.03, yy]]);
    for (let x = -inp.b1 / 2 + 0.10; x < inp.b1 / 2 - 0.05; x += rep.s) for (const yy of [hp + 0.05, hp + inp.hd - 0.05]) V.cercle('ACIERS_COUPES', [x, yy], rep.phi / 2000, true);
    for (let y = parts[0].h + 0.25; y < hp - 0.15; y += 0.25) for (const s of [-1, 1]) V.cercle('ACIERS_COUPES', [s * (b0 / 2 - c - 0.01), y], 0.006, true);
    bars.lits.forEach((l, k) => { V.repere([bt / 2 + 0.25, 0.04 + 0.09 * k], k + 1, [bt / 2 - c - pt - ph / 2, l.y]); V.texte('TEXTES', [bt / 2 + 0.31, 0.04 + 0.09 * k], `${l.n} HA${bars.phi} (lit ${k + 1})`, { h: 1.9, v: 'm' }); });
    V.repere([inp.b1 / 2 + 0.1, hp * 0.6], bars.nl + 1, [b0 / 2 - c, hp * 0.6]); V.texte('TEXTES', [inp.b1 / 2 + 0.16, hp * 0.6], `${z0.brins === 4 ? 'cadre + étrier' : 'cadre'} HA${z0.phi} (zones)`, { h: 2.0, v: 'm' });
    V.repere([-inp.b1 / 2 - 0.1, hp + inp.hd - 0.04], bars.nl + 2, [-inp.b1 / 2 + 0.1, hp + inp.hd - 0.035]); V.texte('TEXTES', [-inp.b1 / 2 - 0.16, hp + inp.hd - 0.04], `sup. HA${ns.phi} / ${fr(ns.s * 100, 1)}`, { h: 2.0, ancre: 'd', v: 'm' });
    V.repere([-inp.b1 / 2 - 0.1, hp + 0.03], bars.nl + 3, [-inp.b1 / 2 + 0.1, hp + 0.035]); V.texte('TEXTES', [-inp.b1 / 2 - 0.16, hp + 0.03], `inf. HA${ni.phi} / ${fr(ni.s * 100, 1)}`, { h: 2.0, ancre: 'd', v: 'm' });
    V.repere([-bt / 2 - 0.45, hp * 0.45], bars.nl + 4, [-b0 / 2 + c + 0.01, hp * 0.45]); V.texte('TEXTES', [-bt / 2 - 0.51, hp * 0.45], 'peau HA12 / 25', { h: 2.0, ancre: 'd', v: 'm' });
  } });
  const el = vueElevation(D, { barres: true });
  // nomenclature simplifiée des barres d'une poutre
  const lignesB = bars.lits.map((l, k) => [String(k + 1), `${l.n} HA${bars.phi}`, fr(l.L + (l.filant && k === 0 ? 0.5 : 0), 2), l.filant ? (k === 0 ? 'filant, crochets relevés' : 'filant') : `arrêt à ${fr(l.x0)} m de l'appui`, milliers(l.n * (l.L + (k === 0 ? 0.5 : 0)) * kgm(bars.phi))]);
  const nEt = zones.reduce((s, z) => s + 2 * (z.x1 - z.x0) / z.s, 0) + 2 * a / 0.15, per = 2 * (hp + inp.hd - 2 * c) + 2 * (bt - 2 * c);
  const mEt = nEt * per * kgm(z0.phi) * (z0.brins === 4 ? 1.8 : 1), nPeau = 2 * Math.max(0, Math.floor((hp - parts[0].h - 0.15) / 0.25));
  lignesB.push([String(bars.nl + 1), `${z0.brins === 4 ? 'cadre + étrier' : 'cadre'} HA${z0.phi}`, fr(2 * (hp + inp.hd - 2 * c) + 2 * (bt - 2 * c), 2), 'zones ci-dessous', '—'],
    [String(bars.nl + 2), `HA${ns.phi} / ${fr(ns.s * 100, 1)}`, fr(inp.b1, 2), 'hourdis, nappe supérieure transversale', '—'],
    [String(bars.nl + 3), `HA${ni.phi} / ${fr(ni.s * 100, 1)}`, fr(inp.b1, 2), 'hourdis, nappe inférieure transversale', '—'],
    [String(bars.nl + 4), 'HA12 / 25', fr(Lp, 2), 'armatures de peau (2 faces)', '—']);
  const tb = { titre: 'BARRES PRINCIPALES (UNE POUTRE)', cols: [{ t: 'Rep.', w: 10, a: 'c' }, { t: 'Barres', w: 22, a: 'c' }, { t: 'L [m]', w: 16, a: 'd' }, { t: 'Disposition', w: 52, a: 'g' }, { t: 'kg', w: 16, a: 'd' }], lignes: lignesB };
  const tz = { titre: 'ZONES D\'ÉTRIERS (DEPUIS L\'AXE D\'APPUI, SYMÉTRIQUE)', cols: [{ t: 'De [m]', w: 18, a: 'd' }, { t: 'À [m]', w: 18, a: 'd' }, { t: 'A_t/s_t [cm²/m]', w: 28, a: 'd' }, { t: 'Armatures d\'âme', w: 52, a: 'c' }],
    lignes: zones.map(z => [fr(z.x0), fr(z.x1), fr(z.AtSt * 1e4, 1), `${z.brins === 4 ? 'cadre + étrier' : 'cadre'} HA${z.phi} / ${fr(z.s * 100, 0)} cm`]) };
  const mHourdis = inp.b1 * Lp * (aire(ni.phi) / ni.s + aire(ns.phi) / ns.s) * 7850 * 1.1 + inp.b1 * Lp * 2 * aire(rep.phi) / rep.s * 7850;
  const mB = bars.lits.reduce((s, l, k) => s + l.n * (l.L + (k === 0 ? 0.5 : 0)) * kgm(bars.phi), 0), mPeau = nPeau * Lp * kgm(12), mMont = 2 * Lp * kgm(16);
  const tot = mB + mEt + mPeau + mMont + mHourdis, vol = (parts.reduce((s, q) => s + q.b * q.h, 0) + inp.b1 * inp.hd) * Lp;
  const tq = { titre: 'ARMATURES (ESTIMATION, UNE POUTRE ET SON HOURDIS)', cols: [{ t: 'Poste', w: 70, a: 'g' }, { t: 'Masse [kg]', w: 26, a: 'd' }],
    lignes: [['Barres principales inférieures', milliers(mB)], ['Cadres et étriers', milliers(mEt)], ['Armatures de peau et de montage', milliers(mPeau + mMont)], ['Hourdis (largeur b₁)', milliers(mHourdis)], ['Total', milliers(tot)], ['Ratio', `${fr(tot / vol, 0)} kg/m³`]] };
  const te = E ? [['Entretoise d\'about', `inf. ${fr(E.AsInf * 1e4, 1)} cm² ; sup. ${fr(E.AsSup * 1e4, 1)} cm² ; étriers ${fr(E.etriers.AswS * 1e4, 1)} cm²/m`]] : [];
  const tE = te.length ? { titre: 'ENTRETOISES D\'ABOUT (VÉRINAGE)', cols: [{ t: 'Élément', w: 34, a: 'g' }, { t: 'Sections d\'acier', w: 82, a: 'g' }], lignes: te } : null;
  const lim = D.b.BA.ELS ? D.b.BA.ELS[code] : null;
  const N = numeroter(['NOTES', `1. Poutre ${D.b.k + 1} (la plus sollicitée) de la travée de ${fr(L)} m ; section retenue ${code === 'EC' ? 'EN 1992-1-1' : 'BAEL 91'} : A_s = ${fr(D.As * 1e4, 1)} cm² = max(ELU ; ELS${lim && lim.lim && Number.isFinite(lim.lim.sigS) ? `, σ̄_s = ${fr(lim.lim.sigS, 1)} MPa` : ''}) ; mises en place : ${bars.n} HA${bars.phi} = ${fr(bars.Asx * 1e4, 1)} cm².`,
    `2. Épure d'arrêt (dossier Sétra PSI-BA 77, V.1.3 et V.3) : courbe des sections nécessaires décalée de 0,8 h = ${fr(bars.decal)} m vers l'appui, barres prolongées de l_s = ${fr(bars.ls)} m (${code === 'EC' ? 'EN 1992-1-1 § 8.4.4' : 'BAEL A.6.1,23, τ_su = 0,6 ψ_s² f_tj'}) ; lit inférieur filant, relevé et ancré au-delà de l'appui.`,
    `3. Armatures d'âme : ${code === 'EC' ? 'EN 1992-1-1 § 6.2.3' : 'BAEL 91 A.5.1 (A_t/(b₀ s_t) ≥ γ_s(τ_u − 0,3 f_t28)/(0,9 f_e), ≥ 0,4 MPa/f_e)'} ; espacement ≤ ${fr(code === 'EC' ? Math.min(0.75 * D.d, 0.4) : Math.min(0.9 * D.d, 0.4))} m ; deux cadres rapprochés au droit des appareils d'appui.`,
    `4. Hourdis : nappes transversales du calcul de flexion locale (onglet Tablier à poutres), répartition longitudinale HA${rep.phi} / ${fr(rep.s * 100, 1)} cm (≥ A_s/4) ; jonction hourdis-poutre (PSI-BA V.1.6) : les cadres des poutres montent dans le hourdis.`,
    `5. Enrobage ${fr(c * 100, 0)} cm ; acier HA f_e = ${inp.fyk} MPa ; béton C${inp.fck}. Plan de principe : le façonnage détaillé (crochets, recouvrements) reste à établir.`]);
  const hb = (tb.lignes.length + 2) * 6, hz = (tz.lignes.length + 2) * 6, hq = (tq.lignes.length + 2) * 6, he2 = tE ? (tE.lignes.length + 2) * 6 + 6 : 0, hn = N.length * 2.1 * 1.6, wcol = 128;
  const F = composer({ titre: `${nom} — FERRAILLAGE`, cartouche, rangees: [[el], [cp]], groupes: [{ vues: [el], cible: 100, min: 50 }, { vues: [cp], cible: 20, min: 10 }],
    colonne: { largeur: wcol + 6, hauteur: Infinity },
    poser: (F, [x, y]) => {
      const x0 = F.W - 10 - wcol; let yy = y + 2;
      F.tableau(tb, x0, yy); yy += hb + 6; F.tableau(tz, x0, yy); yy += hz + 6; F.tableau(tq, x0, yy); yy += hq + 6;
      if (tE) { F.tableau(tE, x0, yy); yy += he2; }
      F.note(N, x0, yy + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true;
    } }, ['A3', 'A2', 'A1']);
  F.masse = tot;
  return finir(F);
}
