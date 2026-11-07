/**
 * Plan de câblage d'une dalle précontrainte (PSI-DP), sur le modèle des plans d'exécution d'entreprise relus (autoroute
 * A640, OA67 et OA68 « CAB ») :
 *   - coupe longitudinale développée suivant l'axe (hauteurs dilatées) : extrados et intrados de la nervure, axes
 *     d'appui, tracé du câble moyen et de sa gaine, ancrages aux abouts, points bas et hauts cotés ;
 *   - élévation de l'about : section de la dalle, plaques d'ancrage numérotées, entraxe et distance au bord ;
 *   - tableau des ordonnées aux dixièmes de chaque travée : axe du câble et fibre inférieure de la gaine, depuis
 *     l'intrados à l'axe (les entreprises les cotent ainsi pour le réglage des supports de gaines) ;
 *   - tableau des caractéristiques et de la mise en tension : unité, Ap, f_pk, E_p, tension à l'ancrage σ_p0 et P_0,
 *     coefficients de frottement, recul d'ancrage, résistance du béton requise, longueur développée, allongements
 *     théoriques par extrémité (∫σ dx / E_p après frottement, jusqu'au point fixe), ordre de mise en tension
 *     (symétrique à partir du centre) ;
 *   - notes : gaines, enrobage c_nom,p, évents et purges, injection, frettage.
 * Données : st.psidp (src/psidp, tracé r.xs / r.z, frottement r.friction, ancrages dp.anchors).
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { geometrie } from './geometrie.js';
import { couperLigne, classeBeton } from './notes_durabilite.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/** Ordre de mise en tension symétrique à partir du centre : n = 21 → 11, 12, 10, 13, 9… ; n = 20 → 11, 10, 12, 9, …, 20, 1. */
export function ordreTension(n) {
  const out = [], c = Math.ceil(n / 2);
  if (n % 2) { out.push(c); for (let k = 1; k < c; k++) out.push(c + k, c - k); }
  else for (let k = 0; k < n / 2; k++) out.push(c + 1 + k, c - k);
  return out;
}

/**
 * Données du câblage : tracé (ordonnées depuis l'intrados), points remarquables, ordonnées aux dixièmes, longueur
 * développée, allongements, plaques d'ancrage.
 */
export function donneesCablage(st) {
  const dp = st.psidp; if (!dp || !dp.r) throw new Error('plan de câblage : dalle précontrainte non calculée (onglet Précontrainte)');
  const G = geometrie(st), r = dp.r, U = dp.unit, xs = r.xs, n = dp.n, sec = dp.sec, h = sec.h, phiG = U.phiG;
  const yAxe = r.z.map(z => sec.vp + z);                                    // axe du câble depuis l'intrados
  const pente0 = (yAxe[1] - yAxe[0]) / (xs[1] - xs[0]), penteN = (yAxe.at(-1) - yAxe.at(-2)) / (xs.at(-1) - xs.at(-2));
  const uA = G.uA ?? xs[0], uB = G.uB ?? xs.at(-1);
  const pts = [[uA, yAxe[0] + pente0 * (uA - xs[0])], ...xs.map((x, k) => [x, yAxe[k]]), [uB, yAxe.at(-1) + penteN * (uB - xs.at(-1))]];
  // ordonnées aux dixièmes de chaque travée (indices r.tenth sur r.xs)
  const x0 = st.deck.beam.x0, ordonnees = [];
  for (let j = 0; j + 1 < x0.length; j++) for (let k = 0; k <= 10; k++) {
    if (j > 0 && k === 0) continue;
    const x = x0[j] + (x0[j + 1] - x0[j]) * k / 10, i = xs.reduce((b, v, q) => (Math.abs(v - x) < Math.abs(xs[b] - x) ? q : b), 0);
    ordonnees.push({ travee: j + 1, k, x, y: yAxe[i], yInf: yAxe[i] - phiG / 2 });
  }
  // points bas (en travée) et hauts (sur appuis intermédiaires) du câble
  const rem = [];
  for (let j = 0; j + 1 < x0.length; j++) { let ib = -1; for (let i = 0; i < xs.length; i++) if (xs[i] > x0[j] && xs[i] < x0[j + 1] && (ib < 0 || yAxe[i] < yAxe[ib])) ib = i; if (ib >= 0) rem.push({ type: 'bas', x: xs[ib], y: yAxe[ib], travee: j + 1 }); }
  for (let j = 1; j + 1 < x0.length; j++) { let ih = 0; for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - x0[j]) < Math.abs(xs[ih] - x0[j])) ih = i; rem.push({ type: 'haut', x: xs[ih], y: yAxe[ih], appui: j }); }
  // longueur développée et allongements (σ après frottement en kPa, E_p en MPa)
  let Ldev = 0; for (let k = 1; k < pts.length; k++) Ldev += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  const fr_ = r.friction || {}, sL = fr_.sL || fr_.s, sR = fr_.sR || fr_.s, deux = dp.bp.ends === 'both', Ep = dp.bp.Ep * 1000;
  let im = xs.length - 1; if (deux) { im = 0; for (let i = 0; i < xs.length; i++) if (Math.abs(sL[i] - sR[i]) < Math.abs(sL[im] - sR[im])) im = i; }
  const integ = (s, a, b) => { let t = 0; for (let i = a; i < b; i++) t += (s[i] + s[i + 1]) / 2 * Math.hypot(xs[i + 1] - xs[i], yAxe[i + 1] - yAxe[i]); return t; };
  const sig0 = dp.sigma0 * 1000, dA = xs[0] - uA, dB = uB - xs.at(-1);
  // une seule extrémité active : tout le câble s'allonge vers elle ; la longueur hors modèle côté passif est à la tension
  // qui y arrive après frottement
  const N = xs.length - 1, ends = dp.bp.ends, droite = ends === 'right';
  const allG = deux ? (integ(sL, 0, im) + sig0 * dA) / Ep : droite ? 0 : (integ(sL, 0, N) + sig0 * dA + sL[N] * dB) / Ep;
  const allD = deux ? (integ(sR, im, N) + sig0 * dB) / Ep : droite ? (integ(sR, 0, N) + sig0 * dB + sR[0] * dA) / Ep : 0;
  const An = dp.anchors || {}, perRow = An.perRow || n, rows = An.rows || 1, sp = An.spacing || 0.3, edge = An.edge || 0.2;
  const plaques = [];
  for (let rI = 0; rI < rows; rI++) for (let k = 0; k < perRow && plaques.length < n; k++) plaques.push({ n: plaques.length + 1, y: (k - (perRow - 1) / 2) * sp, z: yAxe[0] + (rI - (rows - 1) / 2) * Math.max(U.plateB || 0.25, 0.3) });
  return { dp, G, U, n, h, phiG, sec, xs, yAxe, pts, ordonnees, rem, Ldev, allG, allD, deux, droite, xFixe: xs[im], plaques, sp, edge, rows, perRow, sig0: dp.sigma0, P0: dp.sigma0 * U.Ap * 1000, x0, uA, uB };
}

function vueLongitudinale(C) {
  const { G, h, phiG, pts, x0, uA, uB, rem } = C, V = new Vue('COUPE LONGITUDINALE DÉVELOPPÉE — TRACÉ DU CÂBLE MOYEN', { echelle: 200, echelleV: 25 });
  // nervure : intrados (y = 0) et extrados (y = h) à l'axe ; abouts
  V.poly('COFFRAGE', [[uA, 0], [uB, 0], [uB, h], [uA, h]], true);
  x0.forEach((x, i) => { V.ligne('AXES', [x, -0.35], [x, h + 0.25]); V.texte('TEXTES', [x, h + 0.32], G.nomLigne(i), { h: 2.5, ancre: 'c', gras: true }); V.poly('APPAREILS', [[x - 0.2, -0.06], [x + 0.2, -0.06], [x + 0.2, 0], [x - 0.2, 0]], true); });
  V.poly('ACIERS', pts);
  V.poly('VUES', pts.map(([x, y]) => [x, y + phiG / 2])); V.poly('VUES', pts.map(([x, y]) => [x, y - phiG / 2]));
  for (const [x, s] of [[uA, 1], [uB, -1]]) { const y = s > 0 ? pts[0][1] : pts.at(-1)[1]; V.poly('APPAREILS', [[x, y - 0.13], [x + s * 0.05, y - 0.13], [x + s * 0.05, y + 0.13], [x, y + 0.13]], true); }
  for (const q of rem) { V.ligne('COTES', [q.x, 0], [q.x, q.y]); V.texte('TEXTES', [q.x + 0.25, q.type === 'bas' ? q.y - 0.09 : q.y + 0.04], `${fr(q.y, 3)}`, { h: 1.8 }); }
  for (let j = 0; j + 1 < x0.length; j++) V.coteH([x0[j], 0], [x0[j + 1], 0], -0.55, fr(x0[j + 1] - x0[j]));
  V.coteH([uA, 0], [uB, 0], -0.85, `${fr(uB - uA)} (longueur de la dalle)`);
  V.coteV([uA, 0], [uA, h], uA - 1.2, fr(h));
  return V;
}

function vueAbout(C) {
  const { G, plaques, U, sp, edge } = C, V = new Vue('ÉLÉVATION DE L\'ABOUT — ANCRAGES (vue depuis C0)', { echelle: 25 });
  const b = G.b, Y = [];
  for (let y = -b; y <= b + 1e-9; y += 0.25) Y.push(+y.toFixed(6));
  const h0 = -G.dessous(0);   // épaisseur à l'axe
  const haut = Y.map(y => [-y, h0 + G.dessus(y)]), bas = Y.slice().reverse().map(y => [-y, h0 + G.dessous(y)]);
  V.poly('COFFRAGE', [...haut, ...bas], true);
  const a = U.plate || 0.25, ab = U.plateB || a;
  for (const p of plaques) {
    V.poly('APPAREILS', [[-p.y - a / 2, p.z - ab / 2], [-p.y + a / 2, p.z - ab / 2], [-p.y + a / 2, p.z + ab / 2], [-p.y - a / 2, p.z + ab / 2]], true);
    V.cercle('ACIERS_COUPES', [-p.y, p.z], C.phiG / 2, false);
    V.texte('TEXTES', [-p.y, p.z + ab / 2 + 0.04], String(p.n), { h: 1.8, ancre: 'c' });
  }
  if (plaques.length > 1) {
    const p0 = plaques[0], p1 = plaques[1], pl = plaques[Math.min(plaques.length, C.perRow) - 1];
    V.coteH([-p1.y, p0.z], [-p0.y, p0.z], p0.z - 0.35, fr(sp, 3));
    V.coteH([-pl.y, p0.z], [-p0.y, p0.z], p0.z - 0.6, `${C.perRow - 1} × ${fr(sp, 3)} = ${fr((C.perRow - 1) * sp)}`);
  }
  V.coteV([-plaques[0].y + 0.6, 0 + h0 + G.dessous(plaques[0].y)], [-plaques[0].y + 0.6, plaques[0].z], -plaques[0].y + 0.8, fr(plaques[0].z, 3));
  V.texte('TEXTES', [0, -0.35], `plaques ${fr(a * 100, 0)} × ${fr(ab * 100, 0)} cm, gaines Ø ${fr(C.phiG * 1000, 0)} mm ; distance au bord de la nervure ≥ ${fr(edge, 3)} m`, { h: 1.8, ancre: 'c' });
  return V;
}

export function planCablageDalle(st, cartouche = {}) {
  const C = donneesCablage(st), dp = C.dp, U = C.U, bp = dp.bp, Gp = dp.durabGaine;
  const lg = vueLongitudinale(C), ab = vueAbout(C);
  const to = { titre: 'ORDONNÉES DU CÂBLE MOYEN DEPUIS L\'INTRADOS À L\'AXE (m)', hl: 4.4, h: 1.8,
    cols: [{ t: 'Travée', w: 14, a: 'c' }, { t: 'x / L', w: 14, a: 'c' }, { t: 'x depuis C0', w: 22, a: 'd' }, { t: 'Axe du câble', w: 24, a: 'd' }, { t: 'Fibre inf. gaine', w: 26, a: 'd' }],
    lignes: C.ordonnees.map(o => [String(o.travee), `${o.k}/10`, fr(o.x, 3), fr(o.y, 3), fr(o.yInf, 3)]) };
  const ordre = ordreTension(C.n), fpk = bp.fprg, fp01 = bp.fpeg;
  const tc = { titre: 'CARACTÉRISTIQUES ET MISE EN TENSION', hl: 4.6, h: 1.8, cols: [{ t: 'Grandeur', w: 74, a: 'g' }, { t: 'Valeur', w: 50, a: 'd' }],
    lignes: [
      ['Câbles', `${C.n} × ${U.label}`], ['Section d\'un câble A_p', `${fr(U.Ap * 1e4, 1)} cm²`], ['f_pk / f_p0,1k', `${fpk} / ${fp01} MPa`], ['E_p', `${milliers(bp.Ep)} MPa`],
      ['Gaine (diamètre intérieur)', `Ø ${fr(C.phiG * 1000, 0)} mm`], ['Tension à l\'ancrage σ_p0', `${fr(dp.sigma0, 0)} MPa`], ['Force à l\'ancrage P_0 par câble', `${milliers(C.P0)} kN`],
      ['Frottement en courbe f (μ) / en ligne φ (k)', `${fr(bp.f, 2)} / ${fr(bp.phi, 4)} m⁻¹`], ['Recul d\'ancrage g', `${fr(bp.g * 1000, 0)} mm`],
      ['Mise en tension', C.deux ? 'aux deux extrémités' : C.droite ? 'à une extrémité (côté opposé à C0)' : 'à une extrémité (C0)'], ['Résistance du béton requise', `f_cj ≥ ${fr(dp.fcj, 0)} MPa (j = ${bp.j} j)`],
      ['Longueur développée (hors surlongueurs)', `${fr(C.Ldev)} m`],
      ...(C.deux || !C.droite ? [['Allongement théorique côté C0', `${fr(C.allG * 1000, 0)} mm`]] : []),
      ...(C.deux || C.droite ? [['Allongement théorique côté opposé', `${fr(C.allD * 1000, 0)} mm`]] : []),
      ...(C.deux ? [['Point fixe (x depuis C0)', `${fr(C.xFixe)} m`]] : []),
      ['Ordre de mise en tension', ordre.length > 12 ? `${ordre.slice(0, 6).join('-')}-…-${ordre.slice(-2).join('-')}` : ordre.join('-')],
    ] };
  const N = ['NOTES',
    `1. Câbles ${U.label} (${U.source || 'agrément'}), ${C.n} câbles répartis uniformément sur la largeur de la nervure ; numérotation de gauche à droite vue depuis C0.`,
    `2. Ordonnées de l'axe du câble et de la fibre inférieure de la gaine mesurées depuis l'intrados à l'axe de la nervure, abscisses développées le long de l'axe ; supports de gaines à 1 m au plus.`,
    Gp ? `3. Enrobage des gaines ${fr(Gp.enrobage, 0)} mm ≥ c_nom,p = ${Gp.cnom} mm (EN 1992-1-1 § 4.4.1.2, tableau 4.5N, ${Gp.expos.join(', ')}).` : `3. Enrobage des gaines ≥ Ø gaine (${fr(C.phiG * 1000, 0)} mm) ; classe d'exposition et c_nom selon le plan de coffrage.`,
    '4. Évents aux points hauts (sur appuis) et aux ancrages, purges aux points bas ; injection au coulis de ciment (NF EN 447), procédure et épreuves de convenance de l\'entreprise.',
    `5. Mise en tension quand f_cj ≥ ${fr(dp.fcj, 0)} MPa (éprouvettes conservées dans les conditions de l'ouvrage) ; allongements mesurés à comparer aux valeurs théoriques ci-contre.`,
    `6. Frettage des ancrages et armatures de diffusion : voir le plan de ferraillage de la dalle. Béton du tablier ${classeBeton(dp.fc28)}.`,
    '7. Ordre de mise en tension symétrique à partir du centre de la nervure, câble par câble ; surlongueurs de mise en tension selon le matériel de l\'agrément.',
  ].flatMap((l, i) => (i ? couperLigne(l, 84) : [l]));
  const hO = (to.lignes.length + 2) * to.hl, hC = (tc.lignes.length + 2) * tc.hl, hn = N.length * 2.1 * 1.6, wcol = 128;
  const F = composer({ titre: 'DALLE PRÉCONTRAINTE — PLAN DE CÂBLAGE', cartouche, rangees: [[lg], [ab]],
    groupes: [{ vues: [lg], cible: 200, min: 50 }, { vues: [ab], cible: 25, min: 10 }], colonne: { largeur: 2 * wcol + 12, hauteur: Math.max(hO, hC + 6 + hn) + 8 },
    poser: (F, [x, y]) => { const x0 = F.W - 10 - 2 * wcol - 9; F.tableau(to, x0, y + 2); F.tableau(tc, x0 + wcol + 6, y + 2); F.note(N, x0 + wcol + 6, y + 2 + hC + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } });
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(q => '1/' + q.vue.echelle + (q.vue.echelleV ? ` (V 1/${q.vue.echelleV})` : '')))].join(' ; ');
  F.cablage = C;
  return F;
}
