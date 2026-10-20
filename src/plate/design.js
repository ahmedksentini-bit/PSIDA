/**
 * Exploitation des résultats de plaque pour le dimensionnement : moments de Wood-Armer, flexion transversale de la
 * travée courante, chevêtres incorporés et réactions par appareil.
 *
 * Wood-Armer (Wood 1968, Armer 1968 ; EN 1992-2 annexe LL n'en dispense pas) pour des armatures orthogonales x, y :
 *   face inférieure  m_x* = m_x + |m_xy|,  m_y* = m_y + |m_xy| ;  face supérieure  m_x*′ = m_x − |m_xy|,  m_y*′ = m_y − |m_xy|.
 * On retient la règle de base sans la correction des cas où un moment de dimensionnement change de signe : elle est
 * toujours du côté de la sécurité (si m_y* < 0, la règle corrigée donne m_x* = m_x + m_xy²/|m_y| ≤ m_x + |m_xy|).
 * Les enveloppes de trafic ne sont pas concomitantes : |m_xy| est pris égal à max(|m_xy,max|, |m_xy,min|) et ajouté action
 * par action, ce qui majore |Σ m_xy| des combinaisons (Σ|m_xy,i| ≥ |Σ m_xy,i|).
 */
import { flexureULS, materialsEC2 } from '../section_ec2.js';

const absMxy = (r, s, i) => Math.max(Math.abs(r.mxyMax[s][i]), Math.abs(r.mxyMin[s][i]));

/** Résultat de plaque → mêmes clés, m_x et m_y remplacés par les moments de Wood-Armer (enveloppes max / min). */
export function woodArmer(r) {
  if (!r || !r.mxyMax) return r;
  const map = (k, sgn) => r[k].map((row, s) => row.map((v, i) => v + sgn * absMxy(r, s, i)));
  return { ...r, mxMax: map('mxMax', 1), mxMin: map('mxMin', -1), myMax: map('myMax', 1), myMin: map('myMin', -1), woodArmer: true, brut: { mxMax: r.mxMax, mxMin: r.mxMin, myMax: r.myMax, myMin: r.myMin } };
}

/** Applique woodArmer à chaque cas d'un objet de résultats (deck.eurocode(), deck.fascicule61()). */
export function woodArmerTous(o) {
  if (!o) return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = v && typeof v === 'object' && v.mxyMax ? woodArmer(v) : v;
  return out;
}

/** Sections de la travée courante j (hors zones de chevêtre : fraction de portée dans [f1, f2]). */
export function sectionsCourantes(deck, j, f1 = 0.2, f2 = 0.8) {
  return deck.beam.sections.map((s, i) => (s.span === j && s.frac >= f1 - 1e-9 && s.frac <= f2 + 1e-9 ? i : -1)).filter(i => i >= 0);
}

/**
 * Résultat transversal au format de TransverseModel.run() à partir de la plaque : m_y (Wood-Armer) enveloppé sur les
 * sections de la travée courante, pour chaque fibre. Les effets thermiques et de tassement (couplage ν·m_x) restent ceux
 * du modèle de Guyon-Massonnet (la plaque ne traite pas encore ces actions).
 * @param {object} transG résultat de TransverseModel.run() (thermique, tassements, L)
 */
export function transversalPlaque(deck, perm, ec, f61, transG, { f1 = 0.2, f2 = 0.8 } = {}) {
  const ny = deck.ys.length;
  const env = (r, j) => {
    if (!r || !r.myMax) return null;
    const idx = sectionsCourantes(deck, j, f1, f2);
    const myMax = Array.from({ length: ny }, (_, i) => Math.max(0, ...idx.map(s => r.myMax[s][i])));
    const myMin = Array.from({ length: ny }, (_, i) => Math.min(0, ...idx.map(s => r.myMin[s][i])));
    return { myMax, myMin };
  };
  const spans = deck.spans.map((_, j) => {
    const g = transG.spans[j];
    return {
      j, L: g.L, x: g.x, perm: { ...env(perm, j), my: perm.my[deck.beam.sectionIndex(j, 0.5)].slice() },
      ec: { TS: env(ec.TS, j), UDL: env(ec.UDL, j), footway: env(ec.footway, j), gr3: env(ec.gr3, j), gr1b: env(ec.gr1b, j), lanes: g.ec.lanes },
      f61: { A: env(f61.A, j), Bc: env(f61.Bc, j), Bt: env(f61.Bt, j), Mc120: env(f61.Mc120, j), D240: env(f61.D240, j), trottoir: env(f61.trottoir, j), classe: g.f61.classe, nv: g.f61.nv, v: g.f61.v },
      thermal: g.thermal, settle: g.settle, plaque: true,
    };
  });
  return { spans, ys: deck.ys.slice(), plaque: { f1, f2 } };
}

/**
 * Chevêtres incorporés à partir de la plaque : bandes de l'annexe 4 du guide PSIDP-EL (§ 6.2 ; largeurs de
 * bandesChevetre), dont le moment est la moyenne de m_y sur la bande (① pleine, ② et ③ en anneaux autour de la
 * précédente, comme dans le plan de ferraillage), lue directement sur la plaque
 * (surface d'influence de la moyenne, donc enveloppe exacte de la moyenne), avec Wood-Armer (± |m_xy| moyen) ;
 * ELU 1,35 G + 1,35 gr1a. Réactions des appareils lues sur la plaque (même combinaison).
 * Face supérieure : bandes centrées sur chaque appareil (on retient le plus défavorable) ; face inférieure : bandes
 * centrées entre deux appareils.
 * @param {object[]} base résultat de chevetresEC (géométrie, d utile, résultats du guide conservés pour comparaison)
 */
export function chevetresPlaque(base, { deck, perm, ec, fck = 35, fyk = 500, gG = 1.35, gQ = 1.35 }) {
  const mat = materialsEC2({ fck, fyk });
  const { bandes } = deck.plaque.M.bandes, n = deck.plaque.M.yb.length;
  const tr = ec.gr1a || ec.LM1;
  const wa = (r, l, k) => Math.max(Math.abs(r.BmxyMax[l][k]), Math.abs(r.BmxyMin[l][k]));
  return base.map(cv => {
    const l = deck.beam.x0.findIndex(x => Math.abs(x - cv.x) < 1e-6);
    // moments de dimensionnement par bande (≥ 0) : sup. −(m_y − |m_xy|), inf. m_y + |m_xy|
    const mB = bandes.map((bd, k) => bd.face === 'top'
      ? gG * Math.max(-perm.BmyMin[l][k] + wa(perm, l, k), 0) + gQ * Math.max(-tr.BmyMin[l][k] + wa(tr, l, k), 0)
      : gG * Math.max(perm.BmyMax[l][k] + wa(perm, l, k), 0) + gQ * Math.max(tr.BmyMax[l][k] + wa(tr, l, k), 0));
    const pire = (face, rang) => { let m = 0, yc = null; bandes.forEach((bd, k) => { if (bd.face === face && bd.rang === rang && mB[k] > m) { m = mB[k]; yc = bd.yc; } }); return { m, yc }; };
    const Ru = perm.RappMax[l].map((v, k) => gG * v + gQ * Math.max(tr.RappMax[l][k], 0));
    const R1 = Math.max(Ru[0], Ru[n - 1]), R2 = n > 2 ? Math.max(...Ru.slice(1, -1)) : R1;
    const As = m => (m > 0 ? flexureULS(m / 1000, { b: 1, d: cv.dEff }, mat).As : 0);
    const larg = (face, rang) => bandes.find(bd => bd.face === face && bd.rang === rang).largeur;
    const top = cv.bands.top.map((bd, r) => { const p = pire('top', r); return { ...bd, width: larg('top', r), m: p.m, yc: p.yc, As: As(p.m) }; });
    const bot = cv.bands.bot.map((bd, r) => { const p = pire('bot', r); return { ...bd, width: larg('bot', r), m: p.m, yc: p.yc, As: As(p.m) }; });
    return { ...cv, plaque: true, annexe4: { R1: cv.R1, R2: cv.R2, mc: cv.mc, me_neg: cv.me_neg, me_pos: cv.me_pos, bands: cv.bands }, R1, R2, Rmax: Math.max(R1, R2), Rapp: Ru,
      mc: top[0].m, me_neg: top[0].m, me_pos: bot[0].m, bands: { top, bot } };
  });
}

/**
 * Réactions caractéristiques par appareil (ELS caractéristique) : G + max(gr1a, gr1b) de la plaque, plus la part des
 * autres actions de la combinaison de poutre (thermique, tassements) répartie également entre les appareils.
 * @returns {{Pmax:number[], Rk:number[][]}} par ligne d'appui
 */
export function reactionsAppareils(deck, perm, ec, beamComb) {
  return deck.beam.x0.map((_, i) => {
    const nb = perm.RappMax[i].length;
    const q = k => Math.max(ec.gr1a ? ec.gr1a.RappMax[i][k] : 0, ec.gr1b ? ec.gr1b.RappMax[i][k] : 0, 0);
    const Rk = perm.RappMax[i].map((v, k) => v + q(k));
    const qBeam = Math.max(ec.gr1a ? ec.gr1a.Rmax[i] : 0, ec.gr1b ? ec.gr1b.Rmax[i] : 0, 0);
    const reste = Math.max(0, beamComb.R.CARmax[i] - perm.Rmax[i] - qBeam) / nb;
    // coefficients d'inégalité équivalents (appareil le plus chargé / moyenne), pour les appuis (descente de charges)
    const kCP = perm.Rmax[i] > 0 ? nb * Math.max(...perm.RappMax[i]) / perm.Rmax[i] : 1;
    const kQ = qBeam > 0 ? nb * Math.max(...perm.RappMax[i].map((_, k) => q(k))) / qBeam : 1;
    return { Rk, Pmax: Math.max(...Rk) + reste, reste, kCP, kQ };
  });
}

/**
 * Pointes de moment longitudinal au droit des appareils des lignes d'appui intermédiaires (guide PSIDP-EL, annexe 4
 * § 7) : le ferraillage courant de la nappe supérieure est dimensionné, dans la zone ± 0,2 L de part et d'autre de la
 * ligne d'appui, sur le plus grand des deux : moyenne sur la largeur des aciers requis par fibre, aciers requis aux
 * fibres situées hors des bandes ① des appareils ; la pointe au droit de chaque appareil est reprise par des
 * renforcements locaux (§ 7.2 : longueur de l'ordre de 0,3 L, tête-bêche sur ± 0,2 L), sur la largeur de la bande ①.
 * Modifie dz.envTop dans la zone et ajoute dz.renfortsAppareils.
 */
export function renfortsAppareils(deck, dz, { zone = 0.2 } = {}) {
  const M = deck.plaque.M, { a, e } = M.bandes, yb = M.yb, ys = deck.ys, x0 = deck.beam.x0, secs = deck.beam.sections;
  const w1 = 2 / 3 * Math.max(a, e), b = deck.b;
  const dansBande = y => yb.some(t => Math.abs(y - t) <= w1 / 2 + 1e-9);
  const hors = ys.map((y, i) => (dansBande(y) ? -1 : i)).filter(i => i >= 0);
  const moy = row => row.reduce((t, v, i) => (i ? t + (v + row[i - 1]) / 2 * (ys[i] - ys[i - 1]) : t), 0) / (2 * b);
  const envTop = dz.envTop.slice(), out = [];
  for (let i = 1; i < x0.length - 1; i++) {
    const zL = zone * deck.spans[i - 1], zR = zone * deck.spans[i];
    const idx = secs.map((sc, k) => (sc.x >= x0[i] - zL - 1e-9 && sc.x <= x0[i] + zR + 1e-9 ? k : -1)).filter(k => k >= 0);
    let need = 0, sMax = null;
    for (const s of idx) {
      const row = dz.top[s];
      const u = Math.max(moy(row), ...hors.map(k => row[k]), dz.mins ? dz.mins.perFace || 0 : 0);
      envTop[s] = Math.min(dz.envTop[s], u);
      const pic = Math.max(...row) - envTop[s];
      if (pic > need) { need = pic; sMax = s; }
    }
    if (need > 1e-7) out.push({ support: i, x1: x0[i] - zL, x2: x0[i] + zR, yb: yb.slice(), width: w1, As: need, sMax, uniforme: envTop[sMax], pic: Math.max(...dz.top[sMax]) });
  }
  dz.envTopPlaque = dz.envTop; dz.envTop = envTop; dz.renfortsAppareils = out;
  return dz;
}
