/**
 * Plan de ferraillage du tablier (dalle armée) : coupe longitudinale développée (échelle des hauteurs dilatée) avec les
 * repères longitudinaux, leurs pièces, recouvrements et retours, les zones d'aciers transversaux, de chevêtres incorporés
 * et d'épingles ; demi-coupes transversales en travée et sur appui ; bordereau de façonnage ISO 4066 avec croquis et
 * récapitulatif par diamètre ; notes.
 */
import { Vue, Feuille, ECHELLES, echelleQuiTient, fmtCote } from './dessin.js';
import { geometrie } from './geometrie.js';
import { bordereau, recapitulatif, croquisForme, rayonCintrage } from './bordereau.js';

const fr = (x, d = 0) => x.toFixed(d).replace('.', ',');
const esp = s => fr(s * 100, Math.abs(s * 100 - Math.round(s * 100)) > 1e-6 ? 1 : 0);
/** Bandes de chevêtre ①②③ → 1, 2, 3 (glyphes absents de la police incorporée au PDF). */
const bande = b => { const k = '①②③④⑤⑥⑦⑧⑨'.indexOf(b); return k >= 0 ? String(k + 1) : b; };
const desig = m => (m.dir === 'vertical' ? `HA${m.phi} maille ${esp(m.s)}` : m.dir === 'cadre' ? `HA${m.phi} e=${esp(m.s)}` : `${m.count} HA${m.phi} e=${esp(m.s)}`);

/** Pièces d'un repère longitudinal : [{ a, b, k }] (abscisses), recouvrement l0 entre pièces. */
function piecesLong(m) {
  const n = m.pieces || 1, Lp = m.totalLen / n, l0 = n > 1 ? (m.totalLen - m.len) / (n - 1) : 0;
  return Array.from({ length: n }, (_, k) => ({ a: m.x1 + k * (Lp - l0), b: m.x1 + k * (Lp - l0) + Lp, k }));
}

/* --------------------------------------------------------------------------- coupe longitudinale développée */
/** Rangement de bulles en rangées : chaque bulle va dans la première rangée libre à son abscisse. */
function ranger(items, largeur) {
  const fins = [];
  for (const it of items.sort((a, b) => a.x - b.x)) {
    let r = fins.findIndex(f => f < it.x - largeur.marge);
    if (r < 0) { r = fins.length; fins.push(-Infinity); }
    it.r = r; fins[r] = it.x + largeur(it);
  }
  return fins.length;
}

function vueLongitudinale(G, st, marks, e, eV) {
  const v = new Vue('COUPE LONGITUDINALE DÉVELOPPÉE — ARMATURES', { echelle: e, echelleV: eV });
  const { uA, uB, x0, n, h } = G, c = st.p.mat.c;
  const V = mm => mm * eV / 1000, Hz = mm => mm * e / 1000;   // décalages papier (mm) → m, vertical et horizontal
  const PAS = 8;   // pas des rangées de bulles (mm)
  v.poly('COFFRAGE', [[uA, 0], [uB, 0], [uB, -h], [uA, -h]], true);
  const longs = marks.filter(m => m.dir === 'long');
  const zBarre = m => {
    const dz = (m.role === 'filante' ? 0 : 0.045);
    return m.face === 'inf' ? -h + c + m.phi / 2000 + dz : -c - m.phi / 2000 - dz;
  };
  const items = { inf: [], sup: [] };
  for (const m of longs) {
    const z = zBarre(m), sg = m.face === 'inf' ? 1 : -1, hr = h - 2 * c;
    const P = piecesLong(m);
    for (const p of P) {
      const dz = (p.k % 2) * 0.022 * sg;
      const a = Math.max(p.a, uA - 0.5), b = Math.min(p.b, uB + 0.5);
      const pts = [[a, z + dz], [b, z + dz]];
      if (p.k === 0 && m.hookL) pts.unshift([a, z + dz + sg * hr]);
      if (p.k === P.length - 1 && m.hookR) pts.push([b, z + dz + sg * hr]);
      v.poly('ACIERS', pts);
    }
    const xm = m.role === 'filante' && m.span == null ? (x0[0] + x0[1]) / 2 - 2 : (m.x1 + m.x2) / 2;
    items[m.face].push({ m, x: xm, z, txt: desig(m) + (m.pieces > 1 ? ` (${m.pieces} pièces)` : '') });
  }
  // repères : bulles rangées sans chevauchement, sous la dalle (inf.) ou au-dessus (sup.)
  const larg = it => Hz(4.5 + 1.25 * it.txt.length + 4); larg.marge = Hz(4);
  const nr = { inf: ranger(items.inf, larg), sup: ranger(items.sup, larg) };
  for (const face of ['inf', 'sup']) for (const it of items[face]) {
    const zb = face === 'inf' ? -h - V(9 + it.r * PAS) : V(9 + it.r * PAS);
    // une bulle d'une rangée plus éloignée, au-dessus d'une bulle plus proche : décalée, rappel oblique
    const gene = items[face].some(o => o.r < it.r && Math.abs(o.x - it.x) < Hz(7));
    const xb = gene ? it.x + Hz(10) : it.x;
    v.repere([xb, zb], it.m.mark, [it.x, it.z]);
    v.texte('TEXTES', [xb + Hz(4.5), zb], it.txt, { h: 2.4, ancre: 'g', v: 'm' });
  }
  const zChev = V(9 + nr.sup * PAS + 4), zHaut = zChev + V(12);
  const zT = -h - V(9 + nr.inf * PAS + 4), zEp = zT - V(12), zCote = zEp - V(14);
  x0.forEach((u, i) => {
    v.ligne('AXES', [u, zHaut], [u, zCote + V(4)]);
    v.texte('TEXTES', [u, zHaut + V(2)], G.nomLigne(i), { h: 3.5, ancre: 'c', gras: true });
    const a = G.appareils[i].a;
    v.poly('APPAREILS', [[u - a / 2, -h - 0.06], [u + a / 2, -h - 0.06], [u + a / 2, -h], [u - a / 2, -h]], true);
  });
  // aciers transversaux : zones par travée
  for (let j = 0; j + 1 < n; j++) {
    const tr = marks.filter(m => m.dir === 'trans' && m.role === 'courant' && m.span === j);
    if (!tr.length) continue;
    const a = x0[j] + 0.15, b = x0[j + 1] - 0.15;
    v.poly('REPERES', [[a, zT + V(2)], [a, zT], [b, zT], [b, zT + V(2)]]);
    const txt = tr.map(m => `${m.mark} : ${m.face === 'inf' ? 'inf.' : 'sup.'} HA${m.phi} e=${esp(m.s)}`).join('   ');
    v.texte('TEXTES', [(a + b) / 2, zT - V(1.5)], `Transversaux — ${txt}`, { h: 2.3, ancre: 'c', v: 'h' });
  }
  // chevêtres incorporés : bandes au-dessus de la dalle
  for (const m of marks.filter(q => q.role === 'chevêtre')) {
    v.poly('REPERES', [[m.x1, zChev - V(2)], [m.x1, zChev], [m.x2, zChev], [m.x2, zChev - V(2)]]);
    v.texte('TEXTES', [(m.x1 + m.x2) / 2, zChev + V(1)], `${m.mark} : chevêtre${m.band ? ', bande ' + bande(m.band) : ''} — ${m.count} HA${m.phi}`, { h: 2.2, ancre: 'c', v: 'b' });
  }
  // épingles : traits verticaux dans la dalle, repère sous la zone
  for (const m of marks.filter(q => q.role === 'épingles')) {
    const a = Math.max(m.x1, uA + c), b = Math.min(m.x2, uB - c);
    const N = Math.max(1, Math.round((b - a) / m.s));
    for (let k = 0; k <= N; k++) { const x = a + (b - a) * k / N; v.ligne('ACIERS_COUPES', [x, -h + c], [x, -c]); }
    const xm = (a + b) / 2;
    v.repere([xm, zEp], m.mark, [xm, -h + c]);
    v.texte('TEXTES', [xm + Hz(4.5), zEp], `épingles HA${m.phi}, maille ${esp(m.s)}`, { h: 2.2, ancre: 'g', v: 'm' });
  }
  // cotes des travées
  const us = [uA, ...x0, uB].filter((u, k, a) => k === 0 || u - a[k - 1] > 1e-6);
  for (let k = 0; k + 1 < us.length; k++) v.coteH([us[k], -h], [us[k + 1], -h], zCote);
  return v;
}

/* ---------------------------------------------------------------- demi-coupes transversales (travée | appui) */
function vueDemiCoupes(G, st, marks, { xT, jT, xA, iA }) {
  const v = new Vue(`DEMI-COUPES TRANSVERSALES : TRAVÉE ${jT + 1} (gauche) | SUR ${G.nomLigne(iA)} (droite)`, { echelle: 25 });
  const { b, h } = G, c = st.p.mat.c, X = y => -y;
  // contour
  const ch = G.g.chamfer, ys = new Set([-b, 0, b]);
  if (ch && ch.joue > 0) { ys.add(-b + ch.joue); ys.add(b - ch.joue); }
  for (let y = -b; y <= b; y += 0.5) ys.add(+y.toFixed(6));
  const Y = [...ys].sort((p, q) => p - q);
  v.poly('COFFRAGE', [...Y.map(y => [X(y), G.dessus(y)]), ...Y.slice().reverse().map(y => [X(y), G.dessous(y)])], true);
  const zmax = Math.max(...Y.map(y => G.dessus(y))), zmin = Math.min(...Y.map(y => G.dessous(y)));
  v.ligne('AXES', [0, zmax + 1.3], [0, zmin - 1.9]);
  v.texte('TEXTES', [X(b / 2), zmax + 1.15], `TRAVÉE ${jT + 1}`, { h: 3, ancre: 'c', gras: true });
  v.texte('TEXTES', [X(-b / 2), zmax + 1.15], `SUR ${G.nomLigne(iA)}`, { h: 3, ancre: 'c', gras: true });
  const dans = (m, x) => m.x1 - 1e-9 <= x && x <= m.x2 + 1e-9;
  const Ys = sg => Y.filter(y => sg * y >= -1e-9 && Math.abs(y) <= b - c + 1e-9).concat([sg * (b - c)]).sort((p, q) => sg * (p - q));
  const demandes = [];
  const bulle = (sg, face, m, cible) => demandes.push({ sg, face, m, cible });
  for (const [sg, x, j, iApp] of [[1, xT, jT, null], [-1, xA, iA < G.n - 1 ? iA : iA - 1, iA]]) {
    const L = marks.filter(m => m.dir === 'long' && dans(m, x));
    const T = marks.filter(m => m.dir === 'trans' && ((m.role === 'courant' && m.span === j) || (m.role === 'chevêtre' && iApp != null && m.support === iApp)));
    const phiT = { inf: 0, sup: 0 }; for (const m of T) if (m.role === 'courant') phiT[m.face] = m.phi / 1000;
    const phiL = { inf: 0, sup: 0 }; for (const m of L) phiL[m.face] = Math.max(phiL[m.face], m.phi / 1000);
    // longitudinaux : points ; renforts intercalés (demi-espacement)
    for (const m of L) {
      const n = m.count, s = m.s, dec = m.role === 'filante' ? 0 : s / 2, r = m.phi / 2000;
      let cible = null;
      for (let k = 0; k < n; k++) {
        const y = -((n - 1) / 2) * s + k * s + dec;
        if (sg * y < -1e-9 || Math.abs(y) > b - c) continue;
        const z = m.face === 'inf' ? G.dessous(y) + c + r : G.dessus(y) - c - r;
        v.cercle('ACIERS_COUPES', [X(y), z], Math.max(r, 0.006), true);
        if (!cible || Math.abs(Math.abs(y) - 1.2) < Math.abs(Math.abs(cible[2]) - 1.2)) cible = [X(y), z, y];
      }
      if (cible) bulle(sg, m.face, m, [cible[0], cible[1]]);
    }
    // transversaux : barres avec retours 10φ aux bords libres
    for (const m of T) {
      const p = m.phi / 1000, f = m.face, extra = m.role === 'chevêtre' ? 1.5 * p : 0;
      const zf = y => (f === 'inf' ? G.dessous(y) + c + phiL.inf + p / 2 + extra : G.dessus(y) - c - phiL.sup - p / 2 - extra);
      const ys2 = Ys(sg), pts = ys2.map(y => [X(y), zf(y)]);
      const ye = ys2[ys2.length - 1], ret = 10 * p;
      pts.push([X(ye), zf(ye) + (f === 'inf' ? ret : -ret)]);
      v.poly('ACIERS', pts);
      const yc = sg * Math.min(b - c - 0.6, 2.4 + (m.role === 'chevêtre' ? 1.2 : 0));
      bulle(sg, f, m, [X(yc), zf(yc)]);
    }
    // cadres de chaînage du bord libre
    for (const m of marks.filter(q => q.dir === 'cadre')) {
      const ye = sg * (b - c), B = Math.max(h - 2 * c, 0.3), yi = sg * (b - c - B);
      const z1 = y => G.dessous(y) + c, z2 = y => G.dessus(y) - c;
      v.poly('ACIERS', [[X(ye), z1(ye)], [X(yi), z1(yi)], [X(yi), z2(yi)], [X(ye), z2(ye)]], true);
      if (sg === 1) bulle(sg, 'sup', m, [X(ye), (z1(ye) + z2(ye)) / 2]);
    }
    // épingles (zones d'effort tranchant)
    for (const m of marks.filter(q => q.role === 'épingles' && dans(q, x))) {
      const N = Math.floor((b - c - 0.1) / m.s);
      for (let k = 0; k <= N; k++) {
        const y = sg * (0.1 + k * m.s);
        const z1 = G.dessous(y) + c, z2 = G.dessus(y) - c, hk = 10 * m.phi / 1000;
        const dh = X(y) > 0 ? -hk : hk;   // crochets tournés vers l'axe
        v.poly('ACIERS_COUPES', [[X(y) + dh, z1], [X(y), z1], [X(y), z2], [X(y) + dh, z2]]);
      }
      bulle(sg, 'inf', m, [X(sg * 0.1), G.dessous(sg * 0.1) + c + 0.1]);
    }
  }
  // bulles : rangées sous (inf.) et au-dessus (sup.) de la dalle, au plus près de leur cible, sans chevauchement
  for (const sg of [1, -1]) for (const face of ['inf', 'sup']) {
    const D = demandes.filter(d => d.sg === sg && d.face === face).sort((p, q) => sg * (q.cible[0] - p.cible[0]));
    let prec = -Infinity, r = 0;
    D.forEach(d => {
      const t = Math.max(sg * -d.cible[0], 0.45);   // distance à l'axe de la cible (≥ 0)
      let yb = Math.max(t, prec + 1.9);
      if (yb > b - 0.6) { r++; yb = Math.min(t, b - 0.6); }   // plus de place sur la rangée : rangée suivante
      prec = yb;
      const zb = face === 'inf' ? zmin - 0.30 - r * 0.28 : zmax + 0.30 + r * 0.28;
      const xb = X(sg * yb);
      v.repere([xb, zb], d.m.mark, d.cible);
      v.texte('TEXTES', [xb + 0.14, zb], desig(d.m), { h: 2.2, ancre: 'g', v: 'm' });
    });
  }
  // cotes : largeur, enrobage figuré par une note
  v.coteH([X(b), G.dessus(b)], [X(-b), G.dessus(-b)], zmax + 1.75);
  return v;
}

/* ------------------------------------------------------------------------------------- bordereau (tableau) */
const COLS = [
  { t: 'Rep.', w: 11, a: 'c' }, { t: 'Ø', w: 9, a: 'c' }, { t: 'Code', w: 10, a: 'c' }, { t: 'Forme', w: 30, a: 'c' },
  { t: 'A', w: 14, a: 'd' }, { t: 'B', w: 14, a: 'd' }, { t: 'C', w: 11, a: 'd' }, { t: 'L (mm)', w: 15, a: 'd' },
  { t: 'Nombre', w: 15, a: 'd' }, { t: 'Long. (m)', w: 18, a: 'd' }, { t: 'Masse (kg)', w: 19, a: 'd' },
];
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

function placerBordereau(F, lignes, [x, y, w, hmax]) {
  const R = recapitulatif(lignes);
  const hl = Math.min(6, Math.max(4.2, (hmax - 16 - (R.diam.length + 3) * 5.5) / (lignes.length + 2)));
  const tab = {
    titre: 'BORDEREAU DE FAÇONNAGE (ISO 4066) — cotes en mm', hl, h: hl > 5 ? 2.2 : 1.9, cols: COLS,
    lignes: lignes.map(l => [l.repere, l.phi, l.code, '', l.A, l.B ?? '', l.C ?? '', l.L, l.nombre, fr(l.total, 1), milliers(l.masse)]),
  };
  const H = (tab.lignes.length + 2) * hl, y0 = y + hmax - H;
  F.tableau(tab, x, y0);
  // croquis des formes dans la colonne « Forme »
  const xf = x + COLS.slice(0, 3).reduce((s, c) => s + c.w, 0), wf = COLS[3].w;
  lignes.forEach((l, k) => {
    const ytop = y0 + H - 2 * hl - k * hl, cro = croquisForme(l.code, [xf, ytop - hl, wf, hl]);
    for (const t of cro.traits) F.papier.push({ calque: 'ACIERS', t: 'P', pts: t, ferme: false, ep: 0.3 });
  });
  // récapitulatif par diamètre
  const rec = {
    titre: 'RÉCAPITULATIF PAR DIAMÈTRE', hl: 5.5, h: 2.1,
    cols: [{ t: 'Diamètre', w: 40, a: 'c' }, { t: 'Masse linéique (kg/m)', w: 50, a: 'd' }, { t: 'Longueur (m)', w: 46, a: 'd' }, { t: 'Masse (kg)', w: 30, a: 'd' }],
    lignes: [...R.diam.map(q => [`HA ${q.phi}`, fr(q.masse / q.longueur, 3), fr(q.longueur, 1), milliers(q.masse)]), Object.assign(['Total', '', fr(R.longueur, 1), milliers(R.masse)], { gras: true })],
  };
  const Hr = (rec.lignes.length + 2) * rec.hl;
  F.tableau(rec, x, y0 - 6 - Hr);
  return { R, bas: y0 - 6 - Hr };
}

function notesFerraillage(st, G, R) {
  const m = st.p.mat, rb = st.rebar, phis = [...new Set(rb.marks.map(q => q.phi))].sort((a, b) => a - b);
  return [
    'NOTES',
    `1. Aciers B500B (fyk = ${m.fyk} MPa), HA. Enrobage nominal ${fr(m.c * 100, 1)} cm sur toutes les faces.`,
    `2. Mandrins de cintrage (EC2 § 8.3) : Ø ≤ 16 : 4Ø ; Ø > 16 : 7Ø (r = ${phis.map(p => `${fr(rayonCintrage(p), 0)} mm pour Ø${p}`).slice(0, 3).join(', ')}…).`,
    '3. Longueurs de coupe selon l\'ISO 4066 (codes de forme 00, 11, 21, 51), arrondies aux 25 mm supérieurs.',
    '4. Longitudinaux : lit extérieur ; transversaux : lit intérieur, retours 10Ø aux bords libres.',
    '5. Recouvrements décalés d\'une pièce à l\'autre (pièces courantes en longueur commerciale).',
    `6. Masse du bordereau : ${milliers(R.masse)} kg (métré du calcul : ${milliers(rb.totalMass)} kg, retours compris ici).`,
    `7. Coupe longitudinale : échelles distinctes des longueurs et des hauteurs.`,
  ];
}

/* --------------------------------------------------------------------------------------------- la feuille */
export function planFerraillage(st, cartouche = {}) {
  if (!st.rebar || !st.rebar.marks) throw new Error('plan de ferraillage : pas de ferraillage de dalle armée calculé');
  const G = geometrie(st), marks = st.rebar.marks;
  const lignes = bordereau(st);
  const Lt = G.uB - G.uA, format = Lt > 60 || lignes.length > 60 ? 'A0' : 'A1';
  const F = new Feuille(format, { titre: 'TABLIER — PLAN DE FERRAILLAGE', cartouche: { ...cartouche } });
  const W = F.W, H = F.H, x0 = 20, x1 = W - 10, y0 = 10, y1 = H - 10, wc = 180, wb = COLS.reduce((s, c) => s + c.w, 0);
  // colonne de droite : bordereau et récapitulatif au-dessus du cartouche
  const xb = x1 - wb - 3;
  const { R, bas } = placerBordereau(F, lignes, [xb, y0 + 76 + 8, wb, y1 - (y0 + 76 + 8) - 4]);
  // zone de gauche : coupe longitudinale (haut), demi-coupes (bas)
  const wl = xb - 8 - x0, ySep = y0 + (y1 - y0) * 0.50;
  const e = echelleQuiTient([Lt + 8, 0.1], [wl - 28, 1000]);
  const vl = vueLongitudinale(G, st, marks, e, ECHELLES.filter(q => q <= e / 3).pop() || 10);
  F.placerDans(vl, [x0, ySep, wl, y1 - ySep], { auto: false });
  // sections : milieu de la plus grande travée, première pile (ou C0)
  const spans = G.x0.slice(1).map((u, j) => u - G.x0[j]), jT = spans.indexOf(Math.max(...spans));
  const iA = G.n > 2 ? 1 : 0;
  const vd = vueDemiCoupes(G, st, marks, { xT: (G.x0[jT] + G.x0[jT + 1]) / 2, jT, xA: G.x0[iA], iA });
  F.placerDans(vd, [x0, y0 + 40, wl, ySep - y0 - 40]);
  if (vd.echelle > 25 && vd.echelle < 50) { /* garder l'échelle choisie */ }
  F.note(notesFerraillage(st, G, R), x0 + 6, y0 + 36, 2.2);
  F.notes[F.notes.length - 1].titreGras = true;
  F.cartouche.echelles = F.cartouche.echelles || `1/${vl.echelle} (long.) ; 1/${vl.echelleV} (haut.) ; 1/${vd.echelle}`;
  return F;
}
