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
 *  - entretoises d'about (§ V.1.8) : armatures inférieures et supérieures, étriers (vérinage) ;
 *  - entretoises intermédiaires (§ V.1.7) : niveau inférieur à l'intrados des poutres (ou au-dessus des ailes du talon),
 *    armatures inférieures ancrées par courbure au-delà du nu des poutres de rive, armatures supérieures continues d'une
 *    poutre de rive à l'autre (porte-étriers), étriers, étriers de suspension dans les poutres.
 * Cotes en mètres.
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { couperNote } from './appuis.js';
import { nomenclatureBA } from './nomenclature_ba.js';

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
    if (nl <= 3 || (phi === 32 && nl <= 4) || phi === 40) { choix = { phi, n, nmax, nl, e }; break; }
  }
  const { phi, n, nmax, nl, e } = choix, p = phi / 1000;
  // répartition par lits (le plus chargé en bas), ordonnées des axes des lits depuis la sous-face
  const lits = [];
  for (let k = 0, reste = n; k < nl; k++) { const nk = Math.min(nmax, reste); reste -= nk; lits.push({ n: nk, y: cover + phiT / 1000 + p / 2 + k * (p + e) }); }
  // épure : section nécessaire As·M(x)/M(L/2), décalée de 0,8 h vers l'appui, plus l_s ; lits arrêtés du haut vers le bas
  const ls = longueurScellement({ phi, fck, fyk, code }), decal = 0.8 * h;
  let Mmid = 0; for (let x = 0; x <= L / 2 + 1e-9; x += L / 400) Mmid = Math.max(Mmid, profil(x)); Mmid = Mmid || 1;
  // section nécessaire en x (depuis l'appui) : enveloppe décalée, bornée au maximum (atteint au plus tard à mi-travée)
  const besoin = x => { let m = 0; for (let t = x; t <= Math.min(L / 2, x + decal) + 1e-9; t += L / 400) m = Math.max(m, profil(t)); return As * Math.max(m, 0) / Mmid; };
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

/** Retour relevé des lits filants au-delà de l'appui : 10 φ, 25 cm au moins (ancrage par retour à 90°). */
export const retourLit = phi => Math.max(0.25, 10 * phi / 1000);

/** Nappes du hourdis : transversales inférieure et supérieure (flexion locale), répartition longitudinale ≥ A_s/4. */
export function nappesHourdis(D) {
  const inp = D.inp, Hd = D.hourdis && !D.hourdis.erreur ? D.hourdis : null;
  const ni = Hd && Hd.inf ? nappeBA(Hd.inf.As) : nappeBA(0.0012 * inp.hd), ns = Hd && Hd.sup ? nappeBA(Hd.sup.As) : nappeBA(0.0012 * inp.hd);
  const rep = nappeBA(Math.max(aire(ni.phi) / ni.s / 4, 0.0008 * inp.hd));   // répartition longitudinale ≥ A_s/4 (BAEL A.8.2,41)
  return { ni, ns, rep };
}

/** Âme et talon : largeurs, hauteur du talon (cadres distincts d'âme et de talon si le talon est plus large). */
export function ameTalon(D) {
  const parts = D.parts, bt = parts[0].b, b0 = parts.length > 1 ? Math.min(...parts.map(q => q.b)) : bt;
  return { bt, b0, ht: parts[0].h, talon: bt > b0 + 1e-6 };
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
  const tr0 = b.BA.travee || [];
  // travée continue (tableaux sur toute la portée) : demi-travée symétrisée, effort tranchant le plus fort des deux côtés
  const tr = tr0.length && tr0[tr0.length - 1].x > sp.L / 2 + 1e-6 ? tr0.filter(t => t.x <= sp.L / 2 + 1e-9).map(t => {
    const o = tr0.reduce((m, q) => (Math.abs(q.x - (sp.L - t.x)) < Math.abs(m.x - (sp.L - t.x)) ? q : m)), w = o.VEd > t.VEd ? o : t;
    return { ...t, MEd: Math.max(t.MEd, o.MEd), VEd: w.VEd, V: w.V };
  }) : tr0;
  const profil = x => { if (!tr.length) return 4 * x * (sp.L - x) / (sp.L * sp.L); let k = tr.findIndex(t => t.x >= x - 1e-9); if (k <= 0) return tr[0].MEd * (k === 0 ? 1 : 0); const t0 = tr[k - 1], t1 = tr[k]; return t0.MEd + (t1.MEd - t0.MEd) * (x - t0.x) / (t1.x - t0.x); };
  const profilS = x => Math.max(profil(x), profil(sp.L - x));   // travée continue : enveloppe non symétrique, symétrisée
  // enrobage au nu des cadres : c_nom de durabilité (EN 1992-1-1 § 4.4.1), 3 cm au moins
  const cP = Math.max(0.03, r.durab ? r.durab.cnom / 1000 : 0.03);
  const bars = barresInferieures({ As, parts, cover: cP, phiT: 10, L: sp.L, a, profil: profilS, h: H, fck: inp.fck, fyk: inp.fyk, code });
  // centre de gravité des lits dessinés, à comparer à l'enrobage à l'axe du calcul (d = H − enrobage)
  const nTot = bars.lits.reduce((t, l) => t + l.n, 0), yG = bars.lits.reduce((t, l) => t + l.n * l.y, 0) / Math.max(nTot, 1);
  // travées continues : armatures supérieures sur les appuis de la travée détaillée (PSI-BA V.1.4) ; longueur de part et
  // d'autre = distance au point de moment nul de l'enveloppe négative + 0,8 h + l_s
  let superieures = null;
  if (r.continu && r.appuis && r.enveloppe) {
    // armatures longitudinales du hourdis (deux nappes de répartition sur b₁) : elles reprennent la fin de l'épure
    const Hd = r.hourdis && !r.hourdis.erreur ? r.hourdis : null, ni = Hd && Hd.inf ? nappeBA(Hd.inf.As) : nappeBA(0.0012 * inp.hd);
    const rep = nappeBA(Math.max(aire(ni.phi) / ni.s / 4, 0.0008 * inp.hd)), Ah = 2 * inp.b1 * aire(rep.phi) / rep.s;
    const j = r.spans.indexOf(sp), E = r.enveloppe.find(e => e.k === b.k), Mn = code === 'EC' ? E.ELU_EC_min : E.ELU_min, xs = E.x;
    const Mat = x => { const i = xs.findIndex(t => t >= x - 1e-9); return i < 0 ? 0 : Mn[i]; };
    superieures = r.appuis.filter(ap => ap.i === j || ap.i === j + 1).map(ap => {
      const q = ap.beams.find(z => z.k === b.k), Asup = q.retenu[code], xa = r.inp.spans.slice(0, ap.i).reduce((s2, l) => s2 + l, 0), M0 = Math.min(Mat(xa), -1e-9);
      let phi = 20, nb = 0; for (const ph of [16, 20, 25, 32]) { phi = ph; nb = Math.max(4, Math.ceil(Asup / aire(ph))); if (nb * 0.10 <= inp.b1 + 1e-9) break; }
      const ls = longueurScellement({ phi, fck: inp.fck, fyk: inp.fyk, code }), Lg = r.inp.spans[ap.i - 1], Ld = r.inp.spans[ap.i];
      // distance à l'appui où la section nécessaire A_sup M(x)/M(appui) descend sous un seuil (pas de 5 cm, borné à la travée)
      const dist = (sens, seuil, Lmax) => { for (let t = 0; t <= Lmax + 1e-9; t += 0.05) if (Asup * Mat(xa + sens * t) / M0 <= seuil + 1e-12) return t; return Lmax; };
      const n1 = Math.ceil(nb / 2), n2 = nb - n1, A1 = n1 * aire(phi), ext = 0.8 * H + ls;
      // groupe long (n₁ barres) arrêté où A_nec ≤ A_h (hourdis seul) ; groupe court (n₂ barres) où A_nec ≤ A₁ + A_h
      const g1 = { n: n1, dg: Math.min(Lg, dist(-1, Ah, Lg) + ext), dd: Math.min(Ld, dist(1, Ah, Ld) + ext) };
      const court = { n: n2, dg: Math.min(Lg, dist(-1, A1 + Ah, Lg) + ext), dd: Math.min(Ld, dist(1, A1 + Ah, Ld) + ext) };
      return { appui: ap.i, As: Asup, phi, n: nb, ls, groupes: [{ ...g1, L: g1.dg + g1.dd }, { ...court, L: court.dg + court.dd }], dg: g1.dg, dd: g1.dd, L: g1.dg + g1.dd, cote: ap.i === j ? 'gauche' : 'droite', Ah, rep };
    });
  }
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
  return { r, sp, b, inp, sec, parts, hp, H, d, As, a, bars, zones, code, superieures, hourdis: r.hourdis, entretoise: r.entretoise, entInt: entretoisesInt(r, sp, parts, H, code), c: cP, yG, okYG: yG <= inp.cover + 0.005, durab: r.durab };
}

/**
 * Entretoises intermédiaires de la travée détaillée (calcul de l'entretoise la plus sollicitée, src/beams/entretoise_int.js) :
 * positions (également espacées), niveau inférieur (intrados, ou dessus des ailes du talon), barres et étriers retenus.
 */
function entretoisesInt(r, sp, parts, H, code) {
  const E = r.entInt, inp = r.inp;
  if (!E || E.erreur) return null;
  const j = r.spans.indexOf(sp), nE = (inp.nEntInt || [])[j] || 0;
  if (!(nE > 0)) return null;
  const Q = E[code], bw = Math.min(...parts.map(q => q.b));
  let zInf = 0; for (const q of parts) { if (q.b > bw + 1e-9) zInf += q.h; else break; }
  const smax = code === 'EC' ? Math.min(0.75 * E.d, 0.40) : Math.min(0.9 * E.d, 0.40), et = etrierBA(Q.V.AtSt ?? Q.V.AswS, smax);
  return { E, Q, nE, xs: Array.from({ length: nE }, (_, i) => sp.L * (i + 1) / (nE + 1)), b: E.b0, zInf, bw, inf: Q.barresInf, sup: Q.barresSup, et, smax, nSusp: Q.suspente2HA12 };
}

/** Coupe de la poutre (rectangles empilés centrés) avec sa largeur de hourdis b₁. */
export function vuePoutre(D, { titre, armatures = null, echelle = 20 }) {
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
function vueTablier(D, { titre = D.entInt ? 'COUPE TRANSVERSALE DU TABLIER (AU DROIT D\'UNE ENTRETOISE INTERMÉDIAIRE)' : 'COUPE TRANSVERSALE DU TABLIER' } = {}) {
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
  // entretoise intermédiaire coupée (plan de coupe à son droit), entre les âmes des poutres
  const EI = D.entInt;
  if (EI) for (let k = 0; k < n - 1; k++) {
    const pts = [[ys[k] + EI.bw / 2, EI.zInf], [ys[k + 1] - EI.bw / 2, EI.zInf], [ys[k + 1] - EI.bw / 2, hp], [ys[k] + EI.bw / 2, hp]];
    V.poly('COFFRAGE', pts, true); V.hachure(pts);
    if (k === 0) V.texte('TEXTES', [(ys[0] + ys[1]) / 2, (EI.zInf + hp) / 2], `entretoise intermédiaire e = ${fr(EI.b)}`, { h: 2.0, ancre: 'c', v: 'm' });
  }
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
  const EI = D.entInt;
  if (EI) {
    EI.xs.forEach(x => { const xe = a + x; V.poly('VUES', [[xe - EI.b / 2, EI.zInf], [xe + EI.b / 2, EI.zInf], [xe + EI.b / 2, hp], [xe - EI.b / 2, hp]], true); if (!barres) V.ligne('AXES', [xe, -0.15], [xe, H + 0.15]); });
    if (!barres) { [0, ...EI.xs, L].forEach((x, i, l) => { if (i) V.coteH([a + l[i - 1], 0], [a + x, 0], -0.3, fr(x - l[i - 1])); }); V.texte('TEXTES', [a + EI.xs[0], H + 0.15], 'B', { h: 2.5, ancre: 'c', gras: true }); }
  }
  if (barres) {
    bars.lits.forEach((l, k) => {
      const x0 = a + l.x0, x1 = x0 + l.L, y = l.y;
      const rt = retourLit(bars.phi); V.poly('ACIERS', l.filant ? [[x0, y + rt], [x0, y], [x1, y], [x1, y + rt]] : [[x0, y], [x1, y]]);
      V.repere([x1 + 0.45 + 0.35 * k, y + 0.12 * k], k + 1, [x1 - 0.05, y]);
      if (!l.filant) V.coteH([a, 0], [x0, 0], -0.35 - 0.25 * k, fr(l.x0));
    });
    // travées continues : armatures supérieures sur appuis (depuis l'axe d'appui vers la travée)
    for (const q of D.superieures || []) q.groupes.forEach((g, m) => {
      const xa = q.cote === 'gauche' ? a : Lp - a, xe = q.cote === 'gauche' ? Math.min(Lp, a + g.dd) : Math.max(0, Lp - a - g.dg), y = H - 0.04 - 0.05 * m;
      V.poly('ACIERS', [[q.cote === 'gauche' ? 0 : Lp, y], [xe, y]]);
      V.texte('TEXTES', [(xa + xe) / 2, y - 0.03], `${g.n} HA${q.phi}`, { h: 1.9, ancre: 'c', v: 'h' });
    });
    // armatures supérieures de montage ; armatures d'âme : zones cotées sur la demi-travée gauche, quelques cadres dessinés
    V.poly('ACIERS', [[0.03, hp - 0.05], [Lp - 0.03, hp - 0.05]]);
    D.zones.forEach((z, k) => {
      for (let x = z.x0; x < Math.min(z.x1, z.x0 + 3 * z.s) - 1e-9; x += z.s) for (const xx of [a + x, Lp - a - x]) V.ligne('ACIERS', [xx, 0.03], [xx, H - 0.03]);
      V.coteH([a + z.x0, H], [a + z.x1, H], H + 0.30 + 0.22 * (k % 2), `${z.brins === 4 ? 'C+E' : 'C'} HA${z.phi}/${fr(z.s * 100, 0)}`);
    });
  }
  const dz = !barres && D.entInt ? 0.2 : 0;
  V.coteH([a, 0], [Lp - a, 0], barres ? -1.2 : -0.55 - dz, `L = ${fr(L)}`);
  V.coteH([0, 0], [Lp, 0], barres ? -1.5 : -0.85 - dz, `${fr(Lp)}`);
  V.coteV([0, 0], [0, H], -0.6);
  return V;
}

/** Longueurs des barres de l'entretoise intermédiaire (ancrages par courbure dans les poutres de rive, retours de 10 φ). */
export function barresEntretoise(D) {
  const EI = D.entInt, inp = D.inp, n = inp.n, Lt = (n - 1) * inp.b1, c = D.c ?? 0.03, H = D.H, retInf = Math.max(0.30, H / 3), retSup = 0.20;
  const Linf = Lt + EI.bw - 2 * c - 0.04 + 2 * retInf, Lsup = Lt + EI.bw - 2 * c + 2 * retSup;
  const he = D.hp - EI.zInf, per = 2 * (EI.b - 2 * c) + 2 * (he + inp.hd - 2 * c) + 0.2, nEt = Math.ceil((n - 1) * (inp.b1 - EI.bw) / EI.et.s) + (n - 1);
  const kg = (k, phi, L) => k * L * kgm(phi);
  const lignes = [];
  if (EI.inf) lignes.push({ rep: 'E1', bar: `${EI.inf.n} HA${EI.inf.phi}`, L: Linf, disp: `inférieures${EI.inf.lits > 1 ? `, ${EI.inf.lits} lits` : ''}, ancrées par courbure dans les poutres de rive`, kg: kg(EI.inf.n, EI.inf.phi, Linf) });
  if (EI.sup) lignes.push({ rep: 'E2', bar: `${Math.max(EI.sup.n, EI.inf ? EI.inf.parLit : 2)} HA${EI.sup.phi}`, L: Lsup, disp: 'supérieures continues (porte-étriers)', kg: kg(Math.max(EI.sup.n, EI.inf ? EI.inf.parLit : 2), EI.sup.phi, Lsup) });
  lignes.push({ rep: 'E3', bar: `${nEt} ${EI.et.brins === 4 ? 'cadres + étriers' : 'cadres'} HA${EI.et.phi}`, L: per, disp: `étriers / ${fr(EI.et.s * 100, 0)} cm entre poutres`, kg: kg(nEt * (EI.et.brins === 4 ? 1.8 : 1), EI.et.phi, per) });
  const perS = 2 * (D.H - 2 * c) + 2 * (EI.bw - 2 * c) + 0.2;
  lignes.push({ rep: 'E4', bar: `${EI.nSusp} cadres HA12`, L: perS, disp: 'suspentes dans chaque poutre, de part et d\'autre de l\'entretoise', kg: kg(EI.nSusp * n, 12, perS) });
  return { lignes, Linf, Lsup, retInf, retSup, masse: lignes.reduce((t, l) => t + l.kg, 0) };
}

/** Coupe B-B : entretoise intermédiaire vue dans son plan (poutres coupées), armatures. */
export function vueEntretoise(D) {
  const EI = D.entInt, { inp, parts, hp, H } = D, n = inp.n, b1 = inp.b1, W = n * b1, ys = Array.from({ length: n }, (_, k) => -W / 2 + b1 * (k + 0.5)), c = D.c ?? 0.03;
  const V = new Vue('COUPE B-B : FERRAILLAGE D\'UNE ENTRETOISE INTERMÉDIAIRE', { echelle: 50 });
  const yL = ys[0] - b1 / 2, yR = ys[n - 1] + b1 / 2;
  V.poly('COFFRAGE', [[yL, hp], [yR, hp], [yR, H], [yL, H]], true);
  for (const y0 of ys) { let y = 0; const right = [], left = []; parts.forEach(q => { right.push([y0 + q.b / 2, y], [y0 + q.b / 2, y + q.h]); left.unshift([y0 - q.b / 2, y + q.h], [y0 - q.b / 2, y]); y += q.h; }); const pts = [...right, ...left]; V.poly('COFFRAGE', pts, true); V.hachure(pts); V.ligne('AXES', [y0, -0.2], [y0, H + 0.2]); }
  for (let k = 0; k < n - 1; k++) V.poly('COFFRAGE', [[ys[k] + EI.bw / 2, EI.zInf], [ys[k + 1] - EI.bw / 2, EI.zInf], [ys[k + 1] - EI.bw / 2, hp], [ys[k] + EI.bw / 2, hp]], true);
  const B = barresEntretoise(D), y0 = ys[0] - EI.bw / 2 + c + 0.02, y1 = ys[n - 1] + EI.bw / 2 - c - 0.02;
  // aciers inférieurs : lits au-dessus de ceux des poutres (d = H − 2 × enrobage), relevés dans les poutres de rive
  const zb = Math.max(H - EI.E.d - (EI.inf && EI.inf.lits > 1 ? (EI.inf.lits - 1) * 0.03 : 0), EI.zInf + 0.06);
  for (let k = 0; k < (EI.inf ? EI.inf.lits : 1); k++) { const z = zb + k * 0.06; V.poly('ACIERS', [[y0, z + B.retInf], [y0, z], [y1, z], [y1, z + B.retInf]]); }
  const zs = H - 0.07;
  V.poly('ACIERS', [[y0, zs - B.retSup], [y0, zs], [y1, zs], [y1, zs - B.retSup]]);
  for (let k = 0; k < n - 1; k++) for (let y = ys[k] + EI.bw / 2 + 0.05; y < ys[k + 1] - EI.bw / 2 - 0.02; y += EI.et.s) V.ligne('ACIERS', [y, zb - 0.02], [y, zs + 0.02]);
  for (const yy of ys) for (const s2 of [-1, 1]) V.ligne('ACIERS', [yy + s2 * (EI.bw / 2 - c), c], [yy + s2 * (EI.bw / 2 - c), H - c]);
  const xm = (ys[0] + ys[1]) / 2;
  if (EI.inf) { V.repere([xm, zb - 0.25], 'E1', [xm, zb]); V.texte('TEXTES', [xm + 0.12, zb - 0.25], `${EI.inf.n} HA${EI.inf.phi}${EI.inf.lits > 1 ? ` (${EI.inf.lits} lits)` : ''}`, { h: 2.0, v: 'm' }); }
  if (EI.sup) { V.repere([xm, H + 0.25], 'E2', [xm, zs]); V.texte('TEXTES', [xm + 0.12, H + 0.25], `${B.lignes.find(l => l.rep === 'E2').bar}`, { h: 2.0, v: 'm' }); }
  const xe = (ys[n - 2] + ys[n - 1]) / 2;
  V.repere([xe, H + 0.25], 'E3', [xe, (zb + zs) / 2]); V.texte('TEXTES', [xe + 0.12, H + 0.25], `${EI.et.brins === 4 ? 'C+E' : 'cadres'} HA${EI.et.phi} / ${fr(EI.et.s * 100, 0)}`, { h: 2.0, v: 'm' });
  V.repere([ys[0] - EI.bw / 2 - 0.35, H * 0.5], 'E4', [ys[0] - EI.bw / 2 + c, H * 0.5]); V.texte('TEXTES', [ys[0] - EI.bw / 2 - 0.42, H * 0.5], `suspentes ${EI.nSusp} cadres HA12`, { h: 2.0, ancre: 'd', v: 'm' });
  for (let k = 0; k < n - 1; k++) V.coteH([ys[k], 0], [ys[k + 1], 0], -0.3);
  V.coteV([ys[n - 1] + EI.bw / 2, EI.zInf], [ys[n - 1] + EI.bw / 2, hp], ys[n - 1] + b1 / 2 + 0.2, fr(hp - EI.zInf));
  V.texte('TEXTES', [(ys[0] + ys[n - 1]) / 2, -0.75], `épaisseur de l'entretoise ${fr(EI.b)} m ; ${EI.nE} entretoise(s) dans la travée`, { h: 2.0, ancre: 'c' });
  return V;
}

export function planCoffrageBA(D, cartouche = {}, { nom = 'TABLIER À POUTRES BA' } = {}) {
  const { inp, sp, parts, hp, H, a } = D, L = sp.L, Lp = L + 2 * a, n = inp.n, te = D.entretoise ? D.entretoise.te : 0.25, he = D.entretoise ? D.entretoise.he : hp - 0.1;
  const ct = vueTablier(D), el = vueElevation(D), cp = vuePoutre(D, { titre: 'COUPE DE LA POUTRE (MI-TRAVÉE)' });
  const Ap = parts.reduce((s, q) => s + q.b * q.h, 0), vP = Ap * Lp * n, vH = n * inp.b1 * inp.hd * Lp, vE = 2 * te * he * (n - 1) * inp.b1;
  const EI = D.entInt, vI = EI ? EI.nE * EI.b * (hp - EI.zInf) * (n - 1) * (inp.b1 - EI.bw) : 0;
  const coff = n * Lp * (2 * hp + parts[0].b) + n * inp.b1 * Lp + (EI ? EI.nE * 2 * (hp - EI.zInf) * (n - 1) * (inp.b1 - EI.bw) : 0);
  const tq = { titre: `QUANTITÉS (UNE TRAVÉE DE ${fr(L)} m)`, cols: [{ t: 'Désignation', w: 96, a: 'g' }, { t: 'Unité', w: 18, a: 'c' }, { t: 'Quantité', w: 30, a: 'd' }],
    lignes: [[`Béton des poutres (${n} × ${fr(Ap, 3)} m² × ${fr(Lp)} m)`, 'm³', fr(vP, 2)], ['Béton du hourdis', 'm³', fr(vH, 2)], ['Béton des entretoises d\'about', 'm³', fr(vE, 2)], ...(EI ? [[`Béton des entretoises intermédiaires (${EI.nE})`, 'm³', fr(vI, 2)]] : []), ['Total béton (C' + inp.fck + ')', 'm³', fr(vP + vH + vE + vI, 2)], ['Coffrage (estimation)', 'm²', fr(coff, 0)]] };
  const N = numeroter(['NOTES', `1. Cotes en mètres. Tablier coulé en place sur cintre : ${n} poutres de ${fr(H)} m (hourdis compris) à ${fr(inp.b1)} m d'entraxe, hourdis de ${fr(inp.hd)} m, travée de ${fr(L)} m entre axes d'appui, abouts de ${fr(a)} m.`,
    `2. Entretoises d'about de ${fr(te)} m d'épaisseur et ${fr(he)} m de hauteur sous hourdis, dimensionnées pour le vérinage (onglet Tablier à poutres).`,
    '3. Goussets des poutres de rive et ailes du talon du côté intérieur de l\'ouvrage (dossier Sétra PSI-BA 77, pièce V.1.1).',
    '4. Épaississement de l\'âme près des appuis (gousset d\'appui) si la contrainte de cisaillement l\'exige : voir la note de calcul.',
    ...(EI ? [`4 bis. Entretoises intermédiaires : ${EI.nE} dans la travée, également espacées (${fr(D.sp.L / (EI.nE + 1))} m), épaisseur ${fr(EI.b)} m, niveau inférieur ${EI.zInf > 0 ? 'au-dessus des ailes du talon' : 'à l\'intrados des poutres'} (PSI-BA V.1.1) ; coupe B-B au plan BA-FER-01.`] : []),
    '5. Ferraillage : plan BA-FER-01, nomenclature et façonnage : plan BA-FAC-01 ; équipements (corniches, trottoirs, étanchéité) : plans du tablier.']);
  const hq = (tq.lignes.length + 2) * 6, hn = N.length * 2.1 * 1.6;
  const F = composer({ titre: `${nom} — COFFRAGE`, cartouche, rangees: [[ct], [el], [cp]],
    groupes: [{ vues: [ct], cible: 50, min: 20 }, { vues: [el], cible: 100, min: 50 }, { vues: [cp], cible: 20, min: 10 }],
    colonne: { largeur: 156, hauteur: 2 + hq + 6 + hn + 4 },
    poser: (F, [x, y]) => { F.tableau(tq, F.W - 10 - 146, y + 2); F.note(N, F.W - 10 - 156 + 2, y + 2 + hq + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A3', 'A2', 'A1']);
  F.quantites = { beton: vP + vH + vE + vI, coffrage: coff };
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
  const { inp, sp, parts, hp, H, a, bars, zones, code } = D, L = sp.L, Lp = L + 2 * a, c = D.c ?? 0.03, bt = parts[0].b, b0 = parts.length > 1 ? Math.min(...parts.map(q => q.b)) : bt;
  const { ni, ns, rep } = nappesHourdis(D), AT = ameTalon(D);
  const E = D.entretoise, z0 = zones[0] || { phi: 10, s: 0.2, brins: 2 };
  const cp = vuePoutre(D, { titre: 'COUPE A-A : FERRAILLAGE DE LA POUTRE (MI-TRAVÉE)', armatures: V => {
    const ph = bars.phi / 1000, pt = z0.phi / 1000;
    // cadre d'âme jusqu'au hourdis ; cadre de talon distinct si le talon est plus large que l'âme
    V.poly('ACIERS', [[-b0 / 2 + c, c + (AT.talon ? 0.008 : 0)], [b0 / 2 - c, c + (AT.talon ? 0.008 : 0)], [b0 / 2 - c, hp + inp.hd - c], [-b0 / 2 + c, hp + inp.hd - c]], true);
    if (AT.talon) V.poly('ACIERS', [[-bt / 2 + c, c], [bt / 2 - c, c], [bt / 2 - c, AT.ht - c], [-bt / 2 + c, AT.ht - c]], true);
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
  const el = vueElevation(D, { barres: true }), EI = D.entInt, ce = EI ? vueEntretoise(D) : null, BE = EI ? barresEntretoise(D) : null;
  // nomenclature simplifiée des barres d'une poutre
  const rt = retourLit(bars.phi), NB = nomenclatureBA(D), nP = NB.n;
  const lignesB = bars.lits.map((l, k) => [String(k + 1), `${l.n} HA${bars.phi}`, fr(l.L + (l.filant ? 2 * rt : 0), 2), l.filant ? `filant, relevé de ${fr(rt)} m au-delà des appuis` : `arrêt à ${fr(l.x0)} m de l'appui`, milliers(l.n * (l.L + (l.filant ? 2 * rt : 0)) * kgm(bars.phi))]);
  lignesB.push([String(bars.nl + 1), `${AT.talon ? 'cadres d\'âme et de talon' : 'cadre'}${z0.brins === 4 ? ' + étrier' : ''} HA${z0.phi}`, fr(2 * (hp + inp.hd - 2 * c) + 2 * (b0 - 2 * c), 2), 'zones ci-dessous', '—'],
    [String(bars.nl + 2), `HA${ns.phi} / ${fr(ns.s * 100, 1)}`, fr(inp.b1, 2), 'hourdis, nappe supérieure transversale', '—'],
    [String(bars.nl + 3), `HA${ni.phi} / ${fr(ni.s * 100, 1)}`, fr(inp.b1, 2), 'hourdis, nappe inférieure transversale', '—'],
    [String(bars.nl + 4), 'HA12 / 25', fr(Lp, 2), 'armatures de peau (2 faces)', '—']);
  for (const [m, q] of (D.superieures || []).entries()) q.groupes.forEach((g, gi) => lignesB.push([`S${m + 1}${'ab'[gi]}`, `${g.n} HA${q.phi}`, fr(g.L, 2), `sup. appui ${q.appui + 1} : ${fr(g.dg)} g. / ${fr(g.dd)} d.${gi === 0 ? ` (${fr(q.As * 1e4, 0)} cm²)` : ''}`, milliers(g.n * g.L * kgm(q.phi))]));
  const tb = { titre: 'BARRES PRINCIPALES (UNE POUTRE)', cols: [{ t: 'Rep.', w: 10, a: 'c' }, { t: 'Barres', w: 22, a: 'c' }, { t: 'L [m]', w: 16, a: 'd' }, { t: 'Disposition', w: 52, a: 'g' }, { t: 'kg', w: 16, a: 'd' }], lignes: lignesB };
  const tz = { titre: 'ZONES D\'ÉTRIERS (DEPUIS L\'AXE D\'APPUI, SYMÉTRIQUE)', cols: [{ t: 'De [m]', w: 18, a: 'd' }, { t: 'À [m]', w: 18, a: 'd' }, { t: 'A_t/s_t [cm²/m]', w: 28, a: 'd' }, { t: 'Armatures d\'âme', w: 52, a: 'c' }],
    lignes: zones.map(z => [fr(z.x0), fr(z.x1), fr(z.AtSt * 1e4, 1), `${z.brins === 4 ? 'cadre + étrier' : 'cadre'} HA${z.phi} / ${fr(z.s * 100, 0)} cm`]) };
  // masses : bordereau de façonnage (plan BA-FAC-01), par poutre ; hourdis sur la largeur b₁
  const mEl = re => NB.lignes.filter(l => l.element === 'poutre' && re.test(l.desig)).reduce((t, l) => t + l.masse, 0) / nP;
  const mB = mEl(/^(lit|S\d)/), mEt = mEl(/^(cadres|étriers)/), mPM = mEl(/^(peau|montage)/), mHourdis = NB.parElement.hourdis / nP;
  const tot = mB + mEt + mPM + mHourdis, vol = (parts.reduce((s, q) => s + q.b * q.h, 0) + inp.b1 * inp.hd) * Lp;
  const tq = { titre: 'ARMATURES (BORDEREAU BA-FAC-01, UNE POUTRE ET SON HOURDIS)', cols: [{ t: 'Poste', w: 70, a: 'g' }, { t: 'Masse [kg]', w: 26, a: 'd' }],
    lignes: [[D.superieures && D.superieures.length ? 'Barres principales (inférieures et supérieures sur appuis)' : 'Barres principales inférieures', milliers(mB)], ['Cadres et étriers', milliers(mEt)], ['Armatures de peau et de montage', milliers(mPM)], ['Hourdis (largeur b₁)', milliers(mHourdis)], ['Total', milliers(tot)], ['Ratio', `${fr(tot / vol, 0)} kg/m³`]] };
  const tI = EI ? { titre: `ENTRETOISE INTERMÉDIAIRE (UNE ; ${EI.nE} DANS LA TRAVÉE)`, cols: [{ t: 'Rep.', w: 10, a: 'c' }, { t: 'Barres', w: 30, a: 'c' }, { t: 'L [m]', w: 14, a: 'd' }, { t: 'Disposition', w: 58, a: 'g' }, { t: 'kg', w: 14, a: 'd' }],
    lignes: [...BE.lignes.map(l => [l.rep, l.bar, fr(l.L, 2), l.disp, milliers(l.kg)]), ['', '', '', 'Total (une entretoise et ses suspentes)', milliers(BE.masse)]] } : null;
  const te = E ? [['Entretoise d\'about', `inf. ${fr(E.AsInf * 1e4, 1)} cm² ; sup. ${fr(E.AsSup * 1e4, 1)} cm² ; étriers ${fr(E.etriers.AswS * 1e4, 1)} cm²/m`]] : [];
  const tE = te.length ? { titre: 'ENTRETOISES D\'ABOUT (VÉRINAGE)', cols: [{ t: 'Élément', w: 34, a: 'g' }, { t: 'Sections d\'acier', w: 82, a: 'g' }], lignes: te } : null;
  const lim = D.b.BA.ELS ? D.b.BA.ELS[code] : null;
  const N = numeroter(['NOTES', `1. Poutre ${D.b.k + 1} (la plus sollicitée) de la travée de ${fr(L)} m ; section retenue ${code === 'EC' ? 'EN 1992-1-1' : 'BAEL 91'} : A_s = ${fr(D.As * 1e4, 1)} cm² = max(ELU ; ELS${lim && lim.lim && Number.isFinite(lim.lim.sigS) ? `, σ̄_s = ${fr(lim.lim.sigS, 1)} MPa` : ''}) ; mises en place : ${bars.n} HA${bars.phi} = ${fr(bars.Asx * 1e4, 1)} cm².`,
    `2. Épure d'arrêt (dossier Sétra PSI-BA 77, V.1.3 et V.3) : courbe des sections nécessaires décalée de 0,8 h = ${fr(bars.decal)} m vers l'appui, barres prolongées de l_s = ${fr(bars.ls)} m (${code === 'EC' ? 'EN 1992-1-1 § 8.4.4' : 'BAEL A.6.1,23, τ_su = 0,6 ψ_s² f_tj'}) ; lit inférieur filant, relevé et ancré au-delà de l'appui.`,
    `3. Armatures d'âme : ${code === 'EC' ? 'EN 1992-1-1 § 6.2.3' : 'BAEL 91 A.5.1 (A_t/(b₀ s_t) ≥ γ_s(τ_u − 0,3 f_t28)/(0,9 f_e), ≥ 0,4 MPa/f_e)'} ; espacement ≤ ${fr(code === 'EC' ? Math.min(0.75 * D.d, 0.4) : Math.min(0.9 * D.d, 0.4))} m ; deux cadres rapprochés au droit des appareils d'appui.`,
    `4. Hourdis : nappes transversales du calcul de flexion locale (onglet Tablier à poutres), répartition longitudinale HA${rep.phi} / ${fr(rep.s * 100, 1)} cm (≥ A_s/4) ; jonction hourdis-poutre (PSI-BA V.1.6) : les cadres des poutres montent dans le hourdis.`,
    `5. Enrobage au nu des cadres ${fr(c * 100, 1)} cm${D.durab ? ` = c_nom (EN 1992-1-1 § 4.4.1 : ${D.durab.expos.join(', ')}, ${D.durab.vie} ans, S${D.durab.S}, c_min,dur = ${D.durab.cminDur} mm + Δc_dev = ${D.durab.dcDev} mm)` : ''} ; acier HA f_e = ${inp.fyk} MPa ; béton C${inp.fck}${D.durab && !D.durab.okBeton ? ` (classe minimale ${D.durab.classeMin} non atteinte)` : ''}. Centre de gravité des lits inférieurs à ${fr(D.yG * 100, 1)} cm du fond ${D.okYG ? '≤' : '>'} enrobage à l'axe du calcul ${fr(inp.cover * 100, 1)} cm${D.okYG ? '' : ' : hauteur utile du calcul surestimée, enrobage à reprendre'}. Façonnage (codes de forme, mandrins, crochets, recouvrements) : bordereau BA-FAC-01.`,
    ...(EI ? [`${D.superieures && D.superieures.length ? 7 : 6}. Entretoises intermédiaires (coupe B-B ; PSI-BA V.1.7) : méthode de Courbon, entretoise la plus sollicitée (travée ${EI.E.travee + 1}) ; A_inf = ${fr(EI.Q.inf.As * 1e4, 1)} cm² (≥ ancrage V_u/f_su = ${fr(EI.Q.ancrage * 1e4, 1)} cm²), ancrée par courbure au-delà du nu des poutres de rive, ligaturée (poussée au vide) ; aciers supérieurs continus d'une poutre de rive à l'autre ; suspentes : la réaction de l'entretoise (V_u = ${fr(EI.Q.Vu, 0)} kN) est remontée dans la poutre par ${EI.nSusp} cadres HA12 répartis de part et d'autre de l'entretoise.`] : []),
    ...(D.superieures && D.superieures.length ? [`6. Travées continues : armatures supérieures sur appuis (PSI-BA V.1.4) en deux groupes, arrêtés où la section nécessaire A_sup M(x)/M(appui) ne dépasse plus la section restante plus celle des armatures longitudinales du hourdis (${fr(D.superieures[0].Ah * 1e4, 1)} cm² sur b₁), prolongés de 0,8 h + l_s, bornés aux travées adjacentes ; recouvrements des armatures inférieures sur appui.`] : [])]);
  const hb = (tb.lignes.length + 2) * 6, hz = (tz.lignes.length + 2) * 6, hq = (tq.lignes.length + 2) * 6, he2 = tE ? (tE.lignes.length + 2) * 6 + 6 : 0, hi = tI ? (tI.lignes.length + 2) * 6 + 6 : 0, hn = N.length * 2.1 * 1.6, wcol = 128;
  const spec = c2 => ({ titre: `${nom} — FERRAILLAGE`, cartouche: c2, rangees: ce ? [[el], [cp], [ce]] : [[el], [cp]], groupes: [{ vues: [el], cible: 100, min: 50 }, { vues: [cp], cible: 20, min: 10 }, ...(ce ? [{ vues: [ce], cible: 50, min: 20 }] : [])],
    colonne: { largeur: wcol + 6, hauteur: Infinity },
    poser: (F, [x, y]) => {
      const x0 = F.W - 10 - wcol; let yy = y + 2;
      F.tableau(tb, x0, yy); yy += hb + 6; F.tableau(tz, x0, yy); yy += hz + 6; F.tableau(tq, x0, yy); yy += hq + 6;
      if (tE) { F.tableau(tE, x0, yy); yy += he2; }
      if (tI) { F.tableau(tI, x0 - 0, yy); yy += hi; }
      F.note(N, x0, yy + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true;
    } });
  // colonne de tableaux et de notes plus haute que la feuille retenue pour les vues : format supérieur (sauf format imposé)
  let F = composer(spec(cartouche), ['A3', 'A2', 'A1']);
  const libre = !cartouche.format || cartouche.format === 'auto';
  for (const f of ['A1', 'A0']) { if (!libre || F.valide().ok || F.format === f || (f === 'A1' && F.format === 'A0')) break; F = composer(spec({ ...cartouche, format: f }), [f]); F.cartouche.format = cartouche.format; }
  F.masse = tot; F.masseEntretoiseInt = BE ? BE.masse : 0;
  return finir(F);
}

/**
 * Durabilité (EN 1992-1-1 § 4.4.1) : classe de béton minimale, enrobage nominal des cadres et, pour les poutres BA, centre de
 * gravité des lits inférieurs des plans comparé à l'enrobage à l'axe du calcul (hauteur utile).
 */
export function durabiliteLignes(r) {
  const Dd = r.durab; if (!Dd) return null;
  const rows = [{ k: 'beton', cells: ['Classe de résistance du béton', `C${Dd.fck}`, `${Dd.classeMin} au moins (${Dd.critique}, ${Dd.ref === 'CN' ? 'NF EN 206/CN' : 'EN 1992-1-1 tableau E.1N'})`], ok: Dd.okBeton }];
  let P = null;
  if (r.inp.type === 'BA' && r.spans && r.spans.some(s => s.beams && s.beams.some(b => b.BA))) { try { P = donneesBA(r); } catch (e) { P = null; } }
  rows.push({ k: 'cnom', cells: ['Enrobage nominal (cadres, Ø12)', P ? `${(P.c * 1000).toFixed(0)} mm (plans)` : 'à respecter sur les plans', `c_nom = c_min,dur ${Dd.cminDur} + Δc_dev ${Dd.dcDev} = ${Dd.cnom} mm (S${Dd.S} : ${Dd.detailsS})`], ok: true });
  if (P) rows.push({ k: 'yG', cells: ['Centre de gravité des lits inférieurs (plans)', `${(P.yG * 100).toFixed(1).replace('.', ',')} cm du fond`, `≤ enrobage à l'axe du calcul ${(r.inp.cover * 100).toFixed(1).replace('.', ',')} cm (d = H − enrobage)`], ok: P.okYG, yG: P.yG });
  return { Dd, rows, P };
}

