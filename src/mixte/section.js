/**
 * Section mixte acier-béton d'un pont bipoutre ou quadripoutre (NF EN 1994-2, NF EN 1993-1-1 et 1-5) :
 * poutre en PRS (semelle inférieure, âme, semelle supérieure), dalle de béton de largeur efficace, armatures
 * longitudinales supérieures et inférieures de la dalle, gousset éventuel.
 *
 *  - propriétés élastiques : acier seul ; mixte avec coefficient d'équivalence n (court terme n₀ = E_a/E_cm, long terme
 *    n_L = n₀ (1 + ψ_L φ_t), EN 1994-2 § 5.4.2.2) ; section fissurée (acier + armatures, béton tendu négligé) ;
 *  - largeur efficace (§ 5.4.1.2) : b_eff = b₀ + Σ min(L_e/8, b_i), L_e selon la position (figure 5.1) ;
 *  - classes des parois (EN 1993-1-1 tableau 5.2 ; semelle connectée : classe 1, EN 1994-1-1 § 5.5.2 (1)) ;
 *  - moment résistant plastique M_pl,Rd (§ 6.2.1.2) : béton 0,85 f_cd en compression seulement, acier ± f_yd,
 *    armatures ± f_sd ; f_y selon l'épaisseur (EN 10025-2 : 355 → 345 → 335 MPa au-delà de 16, 40 mm).
 * Ordonnées y en m depuis la fibre inférieure de l'acier ; moments positifs = fibre inférieure tendue.
 */

/** f_y d'une tôle S235 à S460 selon son épaisseur t (mm), EN 10025-2 tableau 7 (t ≤ 100 mm). */
export function fyEpaisseur(nuance, t) {
  const T = { S235: [235, 225, 215, 215, 215], S275: [275, 265, 255, 245, 235], S355: [355, 345, 335, 325, 315], S420: [420, 400, 390, 370, 360], S460: [460, 440, 430, 410, 400] }[nuance] || [355, 345, 335, 325, 315];
  return t <= 16 ? T[0] : t <= 40 ? T[1] : t <= 63 ? T[2] : t <= 80 ? T[3] : T[4];
}

/**
 * g = { bfi, tfi, hw, tw, bfs, tfs (m), hg (gousset, m), beff, hc (dalle, m), Asup, Ainf (m² sur beff), csup, cinf (m :
 *       distance des armatures aux faces de la dalle), nuance ('S355'), fck, fsk (500), Ea (210 000) }.
 * Renvoie les couches (rectangles et armatures) avec leurs ordonnées.
 */
export function couches(g) {
  const y1 = g.tfi, y2 = y1 + g.hw, y3 = y2 + g.tfs, yd = y3 + (g.hg || 0), yt = yd + g.hc;
  const fy = t => fyEpaisseur(g.nuance || 'S355', t * 1000);
  return {
    acier: [
      { nom: 'semelle inférieure', b: g.bfi, y0: 0, y1, fy: fy(g.tfi) },
      { nom: 'âme', b: g.tw, y0: y1, y1: y2, fy: fy(g.tw) },
      { nom: 'semelle supérieure', b: g.bfs, y0: y2, y1: y3, fy: fy(g.tfs) },
    ],
    dalle: { b: g.beff, y0: yd, y1: yt },
    armatures: [{ nom: 'armatures supérieures', A: g.Asup || 0, y: yt - (g.csup ?? 0.06) }, { nom: 'armatures inférieures', A: g.Ainf || 0, y: yd + (g.cinf ?? 0.06) }],
    ha: y3, ht: yt,
  };
}

const rect = (b, y0, y1) => ({ A: b * (y1 - y0), S: b * (y1 - y0) * (y0 + y1) / 2, I0: b * (y1 - y0) ** 3 / 12, yc: (y0 + y1) / 2 });

/** Propriétés élastiques. type : 'acier' | 'mixte' (avec n) | 'fissuree'. Rapportées à l'acier (E_a). */
export function proprietes(g, type = 'mixte', n = 6) {
  const C = couches(g), parts = C.acier.map(c => rect(c.b, c.y0, c.y1));
  if (type === 'mixte') { const d = rect(C.dalle.b / n, C.dalle.y0, C.dalle.y1); parts.push(d); }
  if (type !== 'acier') for (const a of C.armatures) if (a.A > 0) parts.push({ A: a.A, S: a.A * a.y, I0: 0, yc: a.y });
  const A = parts.reduce((s, p) => s + p.A, 0), yG = parts.reduce((s, p) => s + p.S, 0) / A;
  const I = parts.reduce((s, p) => s + p.I0 + p.A * (p.yc - yG) ** 2, 0);
  return { A, yG, I, vi: yG, vs: C.ht - yG, vsa: C.ha - yG, Wi: I / yG, Wsa: I / (C.ha - yG), type, n };
}

/** Coefficients d'équivalence (EN 1994-2 § 5.4.2.2) : n₀ = E_a/E_cm, n_L = n₀ (1 + ψ_L φ_t). */
export function equivalence(Ecm, phi, Ea = 210000) {
  const n0 = Ea / Ecm;
  return { n0, permanent: n0 * (1 + 1.1 * phi), retrait: n0 * (1 + 0.55 * phi), deformationsImposees: n0 * (1 + 1.5 * phi) };
}

/**
 * Largeur efficace de la dalle d'une poutre (§ 5.4.1.2) : b0 (entre connecteurs extrêmes), b1 et b2 (débords de part et
 * d'autre jusqu'à mi-distance de la poutre voisine ou au bord libre), Le (longueur équivalente, figure 5.1).
 */
export function largeurEfficace({ b0 = 0, b1, b2, Le }) {
  const be1 = Math.min(Le / 8, b1), be2 = Math.min(Le / 8, b2);
  return { beff: b0 + be1 + be2, be1, be2 };
}
/** Longueurs équivalentes L_e (figure 5.1) pour des travées L[] : travées de rive 0,85 L, intermédiaires 0,70 L, appuis 0,25 (L_i + L_{i+1}). */
export function longueursEquivalentes(L) {
  const n = L.length;
  return { travees: L.map((l, i) => (n === 1 ? l : (i === 0 || i === n - 1 ? 0.85 : 0.70) * l)), appuis: L.slice(1).map((l, i) => 0.25 * (L[i] + l)) };
}

/**
 * Moment résistant plastique (EN 1994-2 § 6.2.1.2). signe = +1 (moment positif, dalle comprimée) ou −1 (négatif : béton
 * négligé, armatures tendues). γ_M0 = 1,0 ; γ_c = 1,5 ; γ_s = 1,15. Renvoie { M (kN·m), yp (axe neutre plastique) }.
 */
export function momentPlastique(g, signe = 1, { gM0 = 1.0, gc = 1.5, gs = 1.15 } = {}) {
  const C = couches(g), fcd = (g.fck || 35) / gc * 1000 * 0.85, fsd = (g.fsk || 500) / gs * 1000;
  // force résultante (traction +) de toutes les couches pour un axe neutre yp, sous la courbure du signe donné :
  // fibres au-dessus de yp comprimées si signe > 0 (moment positif), tendues si signe < 0
  const forces = yp => {
    const L = [];
    for (const c of C.acier) {
      const fyd = c.fy / gM0 * 1000;
      const lo = [c.y0, Math.min(c.y1, Math.max(c.y0, yp))], hi = [Math.max(c.y0, Math.min(c.y1, yp)), c.y1];
      if (lo[1] > lo[0]) L.push({ F: signe * fyd * c.b * (lo[1] - lo[0]), y: (lo[0] + lo[1]) / 2 });
      if (hi[1] > hi[0]) L.push({ F: -signe * fyd * c.b * (hi[1] - hi[0]), y: (hi[0] + hi[1]) / 2 });
    }
    if (signe > 0) { const d0 = Math.max(C.dalle.y0, yp); if (C.dalle.y1 > d0) L.push({ F: -fcd * C.dalle.b * (C.dalle.y1 - d0), y: (d0 + C.dalle.y1) / 2 }); }
    for (const a of C.armatures) if (a.A > 0) {
      if (signe < 0 && a.y > yp) L.push({ F: fsd * a.A, y: a.y });   // armatures tendues (moment négatif)
      // armatures comprimées en moment positif : négligées (pratique courante, du côté de la sécurité)
    }
    return L;
  };
  const somme = yp => forces(yp).reduce((s, f) => s + f.F, 0);
  let lo = 0, hi = C.ht;
  // somme(yp) est monotone : croissante si signe > 0 (plus d'acier tendu quand yp monte)
  for (let it = 0; it < 200; it++) { const m = (lo + hi) / 2, v = somme(m); if ((v > 0) === (signe > 0)) hi = m; else lo = m; }
  const yp = (lo + hi) / 2, L = forces(yp);
  // ΣF = 0 : le moment ne dépend pas du point de réduction
  return { M: Math.abs(L.reduce((s, f) => s + f.F * (f.y - yp), 0)), yp, forces: L };
}

/**
 * Classe de la section (EN 1993-1-1 tableau 5.2) en flexion de signe donné, à partir de l'axe neutre plastique
 * (classes 1 et 2) et de la répartition élastique ψ (classe 3). ε = √(235/f_y).
 */
export function classeSection(g, signe = 1, n = 6) {
  const C = couches(g), aw = C.acier[1], fyw = aw.fy, eps = f => Math.sqrt(235 / f);
  const { yp } = momentPlastique(g, signe);
  // semelle comprimée : supérieure (connectée → classe 1) en moment positif, inférieure en moment négatif
  const sem = signe > 0 ? null : C.acier[0];
  let cSem = 1;
  if (sem) { const c = (sem.b - g.tw) / 2, r = c / (sem.y1 - sem.y0), e = eps(sem.fy); cSem = r <= 9 * e ? 1 : r <= 10 * e ? 2 : r <= 14 * e ? 3 : 4; }
  // âme : hauteur c = hw, part comprimée α (plastique)
  const c = g.hw, t = g.tw, r = c / t, e = eps(fyw);
  const yc0 = signe > 0 ? Math.max(aw.y0, Math.min(aw.y1, yp)) : aw.y0, yc1 = signe > 0 ? aw.y1 : Math.max(aw.y0, Math.min(aw.y1, yp));
  const alpha = Math.max(0, yc1 - yc0) / c;
  let cAme;
  if (alpha <= 1e-9) cAme = 1;
  else {
    const l1 = alpha > 0.5 ? 396 * e / (13 * alpha - 1) : 36 * e / alpha, l2 = alpha > 0.5 ? 456 * e / (13 * alpha - 1) : 41.5 * e / alpha;
    if (r <= l1) cAme = 1; else if (r <= l2) cAme = 2;
    else {
      // classe 3 : répartition élastique (section mixte en moment positif, fissurée en moment négatif)
      const P = proprietes(g, signe > 0 ? 'mixte' : 'fissuree', n), dT = aw.y1 - P.yG, dB = aw.y0 - P.yG;
      // ψ = contrainte à l'autre bord de l'âme / contrainte au bord le plus comprimé (compression en haut si signe > 0)
      const ps = Math.max(-3, Math.min(1, signe > 0 ? dB / dT : dT / dB));
      const l3 = ps > -1 ? 42 * e / (0.67 + 0.33 * ps) : 62 * e * (1 - ps) * Math.sqrt(-ps);
      cAme = r <= l3 ? 3 : 4;
    }
  }
  return { classe: Math.max(cSem, cAme), semelle: cSem, ame: cAme, alpha, yp, eps: e };
}
