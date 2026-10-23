/**
 * Plans de charpente d'un pont mixte bipoutre ou quadripoutre (onglet « Tablier mixte »), sur le modèle des autres
 * feuilles (cartouche, vues cotées, tableaux, notes ; export SVG, DXF et PDF) :
 *
 *  1. ÉLÉVATION ET VUE EN PLAN : élévation d'une poutre (échelle verticale dilatée) avec les zones de PRS (travée / appui),
 *     les épaisseurs des semelles, les montants (raidisseurs verticaux), les entretoises, les joints de chantier des
 *     tronçons ; vue en plan des poutres et des entretoises ; tableau des tôles par tronçon ;
 *  2. COUPES ET DÉTAILS : coupe transversale courante et sur appui (entretoise d'appui, vérinage), connexion (goujons par
 *     rangée et espacements par zone, d'après les vérifications), quantités (masse de la charpente, ratio par m² de
 *     tablier, surface à peindre), notes (nuances et qualités EN 10025 / EN 1993-1-10, exécution EN 1090-2).
 *
 * Tronçons : longueur transportable ≤ L_max (24 m par défaut) ; joints soudés de chantier placés d'abord aux changements
 * de PRS (changement d'épaisseur), puis répartis régulièrement. Entretoises : profilé du commerce le plus léger dont
 * l'inertie atteint I_q (catalogue IPE / HEA, valeurs ArcelorMittal), montants en plats 250 × 20.
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { couperNote } from './appuis.js';
import { fyEpaisseur } from '../mixte/section.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const RHO = 7850;

/** Profilés d'entretoise : [nom, I_y (cm⁴), masse (kg/m), hauteur (m)]. */
export const PROFILES = [['IPE 400', 23130, 66.3, 0.400], ['IPE 450', 33740, 77.6, 0.450], ['IPE 500', 48200, 90.7, 0.500], ['IPE 550', 67120, 106, 0.550], ['IPE 600', 92080, 122, 0.600],
  ['HEA 600', 141200, 178, 0.590], ['HEA 650', 175200, 190, 0.640], ['HEA 700', 215300, 204, 0.690], ['HEA 800', 303400, 224, 0.790], ['HEA 900', 422100, 252, 0.890]];
export const profileEntretoise = Iq => PROFILES.filter(q => q[1] * 1e-8 >= Iq - 1e-12).sort((a, b) => a[2] - b[2])[0] || PROFILES[PROFILES.length - 1];

/** Géométrie de la charpente : zones de PRS, tronçons, montants, entretoises, quantités. */
export function charpente(M, { Lmax = 24, montant = { b: 0.25, t: 0.020 } } = {}) {
  const { p, v } = M, L = p.L, nT = L.length, x0 = [0]; L.forEach((l, i) => x0.push(x0[i] + l));
  const Lt = x0[nT], ac = v ? v.ac : 6, a = v ? v.aRaid : ac, Iq = v ? v.Iq : 1.8e-3;
  // zones (travée / appui) le long d'une poutre
  const bornes = [0];
  for (let j = 1; j < nT; j++) bornes.push(x0[j] - p.zone * L[j - 1], x0[j] + p.zone * L[j]);
  bornes.push(Lt);
  const zones = [];
  for (let k = 0; k < bornes.length - 1; k++) zones.push({ x0: bornes[k], x1: bornes[k + 1], type: k % 2 === 0 ? 'travee' : 'appui', g: k % 2 === 0 ? p.travee : p.appui });
  // tronçons : joints aux changements de zone, puis découpe régulière
  let joints = bornes.slice(1, -1);
  const seg = [0, ...joints, Lt], tr = [];
  for (let k = 0; k < seg.length - 1; k++) { const n = Math.ceil((seg[k + 1] - seg[k]) / Lmax - 1e-9); for (let q = 0; q < n; q++) tr.push([seg[k] + (seg[k + 1] - seg[k]) * q / n, seg[k] + (seg[k + 1] - seg[k]) * (q + 1) / n]); }
  joints = tr.slice(1).map(t => t[0]);
  const zoneAt = x => zones.find(z => x >= z.x0 - 1e-9 && x <= z.x1 + 1e-9) || zones[0];
  const troncons = tr.map(([u0, u1], i) => {
    const z = zoneAt((u0 + u1) / 2), g = z.g, l = u1 - u0;
    const kg = { si: g.bfi * g.tfi * l * RHO, ame: g.hw * g.tw * l * RHO, ss: g.bfs * g.tfs * l * RHO };
    return { i: i + 1, x0: u0, x1: u1, l, type: z.type, g, kg, masse: kg.si + kg.ame + kg.ss };
  });
  // montants : tous les a, plus sur appuis (doubles) ; entretoises : tous les ac, et sur chaque appui
  const pos = (pas) => { const out = []; for (let s = 0; s < nT; s++) { const n = Math.max(1, Math.round(L[s] / pas)); for (let q = 0; q <= n; q++) out.push(+(x0[s] + L[s] * q / n).toFixed(6)); } return [...new Set(out)].sort((u, w) => u - w); };
  const montants = pos(a), entretoises = pos(ac), appuis = x0;
  const prof = profileEntretoise(Iq), np = p.nPoutres, e = p.entraxe, hMoy = (p.travee.hw + p.appui.hw) / 2;
  const nEnt = entretoises.length * (np - 1), lEnt = e - p.travee.tw;
  const kgEnt = nEnt * lEnt * prof[2], kgEntApp = appuis.length * (np - 1) * lEnt * prof[2] * 1.5;   // entretoises d'appui renforcées (vérinage) : +50 %
  const nMont = (montants.length + appuis.length) * 2 * np;   // deux faces, appuis doublés
  const kgMont = nMont * hMoy * montant.b * montant.t * RHO;
  const kgPoutres = troncons.reduce((s, t) => s + t.masse, 0) * np;
  const total = kgPoutres + kgEnt + kgEntApp + kgMont;
  const perim = g => 2 * g.bfi + 2 * g.hw + 2 * g.bfs - g.tw;
  const surface = troncons.reduce((s, t) => s + perim(t.g) * t.l, 0) * np + nEnt * lEnt * 2.2 * prof[3];
  // connexion : goujons par rangée et espacements (vérifications)
  let goujons = null;
  if (v && v.connexion) {
    const C = v.connexion, xs = C.map(c => c.x), n = v.goujons.n;
    const sAt = x => { let k = 0; while (k < xs.length - 1 && xs[k + 1] < x) k++; return C[k].s; };
    let nb = 0; for (let x = 0; x < Lt; x += 0.05) nb += n * 0.05 / Math.max(sAt(x), 0.05);
    const pas = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8], arr = s => pas.filter(q => q <= s + 1e-9).pop() || 0.15;
    const zg = zones.map(z => { const smin = Math.min(...C.filter(c => c.x >= z.x0 - 1e-9 && c.x <= z.x1 + 1e-9).map(c => c.s), sAt((z.x0 + z.x1) / 2)); return { ...z, s: arr(smin) }; });
    goujons = { n, d: v.goujons.d, h: v.goujons.h, total: Math.ceil(nb) * np, zones: zg };
  }
  const R = v && v.courbe ? v.courbe.A.R : 0;
  return { p, L, x0, Lt, R, zones, troncons, joints, montants, entretoises, appuis, prof, nEnt, lEnt, kg: { poutres: kgPoutres, entretoises: kgEnt, entretoisesAppui: kgEntApp, montants: kgMont, total }, ratio: total / (Lt * p.largeur), surface, goujons, ac, a, montant };
}

/* ------------------------------------------------------------------------------------------------------ vues */
function vueElevation(C, eV = 50) {
  const p = C.p, V = new Vue('ÉLÉVATION D\'UNE POUTRE', { echelle: 200, echelleV: eV });
  const hmax = Math.max(...C.zones.map(z => z.g.tfi + z.g.hw + z.g.tfs));
  for (const z of C.zones) {
    const g = z.g, y1 = g.tfi, y2 = y1 + g.hw, y3 = y2 + g.tfs;
    V.poly('CHARPENTE', [[z.x0, 0], [z.x1, 0], [z.x1, y1], [z.x0, y1]], true);
    V.poly('CHARPENTE', [[z.x0, y2], [z.x1, y2], [z.x1, y3], [z.x0, y3]], true);
    V.ligne('CHARPENTE', [z.x0, y1], [z.x0, y2]);
    const xm = (z.x0 + z.x1) / 2;
    V.texte('TEXTES', [xm, y3 + 0.12], `${fr(g.bfs, 2)} × ${fr(g.tfs * 1000, 0)}`, { h: 1.8, ancre: 'c' });
    V.texte('TEXTES', [xm, -0.16], `${fr(g.bfi, 2)} × ${fr(g.tfi * 1000, 0)}`, { h: 1.8, ancre: 'c', v: 'h' });
    V.texte('TEXTES', [xm, y1 + g.hw / 2], `âme ${fr(g.hw, 2)} × ${fr(g.tw * 1000, 0)}`, { h: 1.6, ancre: 'c', v: 'm' });
  }
  V.ligne('CHARPENTE', [C.Lt, C.zones.at(-1).g.tfi], [C.Lt, C.zones.at(-1).g.tfi + C.zones.at(-1).g.hw]);
  for (const x of C.montants) { const g = (C.zones.find(z => x >= z.x0 - 1e-9 && x <= z.x1 + 1e-9) || C.zones[0]).g; V.ligne('VUES', [x, g.tfi], [x, g.tfi + g.hw]); }
  for (const x of C.entretoises) { const g = (C.zones.find(z => x >= z.x0 - 1e-9 && x <= z.x1 + 1e-9) || C.zones[0]).g; V.poly('EQUIPEMENTS', [[x - 0.15, g.tfi + g.hw * 0.35], [x + 0.15, g.tfi + g.hw * 0.35], [x + 0.15, g.tfi + g.hw * 0.65], [x - 0.15, g.tfi + g.hw * 0.65]], true); }
  C.joints.forEach((x, k) => { V.ligne('AXES', [x, -0.35], [x, hmax + 0.40]); V.texte('TEXTES', [x, hmax + 0.45], `J${k + 1}`, { h: 2.0, ancre: 'c' }); });
  C.appuis.forEach((x, j) => {
    V.poly('APPAREILS', [[x - 0.6, -0.5], [x + 0.6, -0.5], [x, -0.02]], true);
    V.texte('TEXTES', [x, -0.62], j === 0 ? 'C0' : j === C.appuis.length - 1 ? `C${j}` : `P${j}`, { h: 2.2, ancre: 'c', v: 'h' });
  });
  C.L.forEach((l, s) => V.coteH([C.x0[s], 0], [C.x0[s + 1], 0], -1.0, `${fr(l, 2)}`));
  V.coteH([0, 0], [C.Lt, 0], -1.35, `${fr(C.Lt, 2)}`);
  // tronçons
  C.troncons.forEach(t => V.texte('TEXTES', [(t.x0 + t.x1) / 2, hmax + 0.85], `tronçon T${t.i}`, { h: 1.8, ancre: 'c' }));
  V.coteV([0, 0], [0, C.zones[0].g.tfi + C.zones[0].g.hw + C.zones[0].g.tfs], -2.0);
  return V;
}

function vuePlan(C) {
  const p = C.p, R = C.R, V = new Vue(R ? `VUE EN PLAN DE LA CHARPENTE (R = ${fr(R, 0)} m)` : 'VUE EN PLAN DE LA CHARPENTE', { echelle: 200 }), np = p.nPoutres, e = p.entraxe;
  const ys = Array.from({ length: np }, (_, k) => (k - (np - 1) / 2) * e);
  // repère en plan : abscisse curviligne s de l'axe, décalage y (tablier courbe : arcs de rayon R + y)
  const P = (s, y) => (R ? [(R + y) * Math.sin(s / R), (R + y) * Math.cos(s / R) - R] : [s, y]);
  const arc = (y, s0 = 0, s1 = C.Lt) => { const n = R ? Math.max(2, Math.ceil((s1 - s0) / 1.0)) : 1, pts = []; for (let q = 0; q <= n; q++) pts.push(P(s0 + (s1 - s0) * q / n, y)); return pts; };
  for (const y of ys) V.poly('CHARPENTE', arc(y));
  for (const x of C.entretoises) V.poly('EQUIPEMENTS', [P(x, ys[0]), P(x, ys[np - 1])]);
  for (const x of C.appuis) { V.poly('AXES', [P(x, ys[0] - 1.2), P(x, ys[np - 1] + 1.2)]); for (const y of ys) { const c = P(x, y); V.poly('APPAREILS', [[c[0] - 0.3, c[1] - 0.3], [c[0] + 0.3, c[1] - 0.3], [c[0] + 0.3, c[1] + 0.3], [c[0] - 0.3, c[1] + 0.3]], true); } }
  V.poly('VUES', [...arc(-p.largeur / 2), ...arc(p.largeur / 2).reverse()], true);
  V.poly('AXES', arc(0, -1, C.Lt + 1));
  const fin = P(C.Lt, 0);
  if (!R) { V.coteV([C.Lt, ys[0]], [C.Lt, ys[np - 1]], C.Lt + 1.5, `${fr(e * (np - 1), 2)}`); V.coteV([C.Lt, -p.largeur / 2], [C.Lt, p.largeur / 2], C.Lt + 3.2, `${fr(p.largeur, 2)}`); }
  else V.texte('TEXTES', [fin[0], fin[1] + p.largeur / 2 + 1.0], `entraxe ${fr(e * (np - 1), 2)} m ; largeur ${fr(p.largeur, 2)} m ; longueur développée ${fr(C.Lt, 2)} m`, { h: 2.0, ancre: 'd' });
  const t0 = P(1, p.largeur / 2 + 0.6);
  V.texte('TEXTES', t0, `entretoises ${C.prof[0]} tous les ${fr(C.ac, 2)} m (et sur appuis)`, { h: 2.0 });
  return V;
}

function vueCoupe(C, { appui = false } = {}) {
  const p = C.p, g = appui ? p.appui : p.travee, np = p.nPoutres, e = p.entraxe, B = p.largeur;
  const V = new Vue(appui ? 'COUPE SUR APPUI (ENTRETOISE D\'APPUI)' : 'COUPE TRANSVERSALE COURANTE', { echelle: 50 });
  const ys = Array.from({ length: np }, (_, k) => (k - (np - 1) / 2) * e), y1 = g.tfi, y2 = y1 + g.hw, y3 = y2 + g.tfs, yd = y3 + p.hg;
  // dalle (tiretée) et goussets
  V.poly('VUES', [[-B / 2, yd + p.hc - 0.05], [-B / 2, yd + p.hc], [B / 2, yd + p.hc], [B / 2, yd + p.hc - 0.05], [B / 2 - 0.3, yd], [-B / 2 + 0.3, yd]], true);
  for (const y of ys) {
    V.poly('CHARPENTE', [[y - g.bfi / 2, 0], [y + g.bfi / 2, 0], [y + g.bfi / 2, y1], [y - g.bfi / 2, y1]], true);
    V.poly('CHARPENTE', [[y - g.tw / 2, y1], [y + g.tw / 2, y1], [y + g.tw / 2, y2], [y - g.tw / 2, y2]], true);
    V.poly('CHARPENTE', [[y - g.bfs / 2, y2], [y + g.bfs / 2, y2], [y + g.bfs / 2, y3], [y - g.bfs / 2, y3]], true);
    // montants (vus) sur les deux faces
    for (const s of [-1, 1]) V.poly('VUES', [[y + s * g.tw / 2, y1 + 0.03], [y + s * (g.tw / 2 + C.montant.b), y1 + 0.03], [y + s * (g.tw / 2 + C.montant.b), y2 - 0.03], [y + s * g.tw / 2, y2 - 0.03]], true);
    // goujons
    if (C.goujons) for (let k = 0; k < C.goujons.n; k++) { const z = y - g.bfs / 2 + g.bfs * (k + 1) / (C.goujons.n + 1); V.ligne('CHARPENTE', [z, y3], [z, y3 + C.goujons.h]); }
    if (appui) V.poly('APPAREILS', [[y - 0.35, -0.08], [y + 0.35, -0.08], [y + 0.35, 0], [y - 0.35, 0]], true);
  }
  // entretoise : profilé entre âmes, à mi-hauteur (courante) ou PRS d'appui en partie basse (vérinage)
  for (let k = 0; k < np - 1; k++) {
    const a0 = ys[k] + g.tw / 2 + C.montant.b * 0.2, a1 = ys[k + 1] - g.tw / 2 - C.montant.b * 0.2, hp = appui ? Math.min(g.hw * 0.6, C.prof[3] * 1.6) : C.prof[3];
    const yc = appui ? y1 + 0.15 + hp / 2 : y1 + g.hw * 0.5;
    V.poly('EQUIPEMENTS', [[a0, yc - hp / 2], [a1, yc - hp / 2], [a1, yc + hp / 2], [a0, yc + hp / 2]], true);
    V.ligne('EQUIPEMENTS', [a0, yc - hp / 2 + 0.02], [a1, yc - hp / 2 + 0.02]); V.ligne('EQUIPEMENTS', [a0, yc + hp / 2 - 0.02], [a1, yc + hp / 2 - 0.02]);
    V.texte('TEXTES', [(a0 + a1) / 2, yc + hp / 2 + 0.06], appui ? `entretoise d'appui (PRS, h ≈ ${fr(hp, 2)} m)` : `entretoise ${C.prof[0]}`, { h: 2.0, ancre: 'c' });
    if (appui) for (const yv of [a0 + 0.5, a1 - 0.5]) { V.poly('APPAREILS', [[yv - 0.15, -0.35], [yv + 0.15, -0.35], [yv + 0.15, -0.05], [yv - 0.15, -0.05]], true); V.texte('TEXTES', [yv, -0.4], 'vérin', { h: 1.8, ancre: 'c', v: 'h' }); }
  }
  V.ligne('AXES', [0, -0.3], [0, yd + p.hc + 0.3]);
  V.coteH([ys[0], 0], [ys[np - 1], 0], -0.55, `${fr(e * (np - 1), 2)}`);
  V.coteH([-B / 2, yd + p.hc], [B / 2, yd + p.hc], yd + p.hc + 0.35);
  V.coteV([ys[np - 1] + g.bfi / 2, 0], [ys[np - 1] + g.bfi / 2, y3], ys[np - 1] + g.bfi / 2 + 0.5, `${fr(y3, 3)}`);
  V.coteV([B / 2, yd], [B / 2, yd + p.hc], B / 2 + 0.3);
  return V;
}

function finir(F) { F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(q => '1/' + q.vue.echelle + (q.vue.echelleV ? ` (V 1/${q.vue.echelleV})` : '')))].join(' ; '); return F; }

export function planCharpenteElevation(M, cartouche = {}, { nom = 'PONT MIXTE' } = {}) {
  const C = charpente(M), el = vueElevation(C), pl = vuePlan(C);
  const tt = { titre: 'TÔLES PAR TRONÇON (UNE POUTRE) — b × t en m × mm', hl: 4.6, h: 1.9, cols: [{ t: 'Tronçon', w: 15, a: 'c' }, { t: 'De [m]', w: 16, a: 'd' }, { t: 'À [m]', w: 16, a: 'd' }, { t: 'Zone', w: 15, a: 'c' }, { t: 'Semelle sup.', w: 26, a: 'c' }, { t: 'Âme', w: 26, a: 'c' }, { t: 'Semelle inf.', w: 26, a: 'c' }, { t: 'Masse [kg]', w: 20, a: 'd' }],
    lignes: [...C.troncons.map(t => [`T${t.i}`, fr(t.x0, 2), fr(t.x1, 2), t.type === 'appui' ? 'appui' : 'travée', `${fr(t.g.bfs, 2)} × ${fr(t.g.tfs * 1000, 0)}`, `${fr(t.g.hw, 2)} × ${fr(t.g.tw * 1000, 0)}`, `${fr(t.g.bfi, 2)} × ${fr(t.g.tfi * 1000, 0)}`, milliers(t.masse)]),
      Object.assign(['Total', '', '', '', '', '', '', milliers(C.troncons.reduce((s, t) => s + t.masse, 0))], { gras: true })] };
  const N = ['NOTES', `1. Cotes en mètres ; épaisseurs en mm. Élévation : échelle des hauteurs dilatée.`, `2. Joints de chantier J1 à J${C.joints.length} : soudures bout à bout à pleine pénétration, aux changements de PRS puis tous les 24 m au plus (transport).`,
    `3. Montants (raidisseurs verticaux) plats ${fr(C.montant.b * 1000, 0)} × ${fr(C.montant.t * 1000, 0)} tous les ${fr(C.a, 2)} m, sur les deux faces ; doublés sur appuis (raidisseurs d'appui).`,
    `4. Entretoises ${C.prof[0]} tous les ${fr(C.ac, 2)} m, attachées aux montants (cadres anti-déversement : I_q = ${fr((M.v ? M.v.Iq : 0) * 1e8, 0)} cm⁴ demandé).`,
    '5. Zones de PRS d\'appui : ' + `${fr(M.p.zone * 100, 0)} % des travées adjacentes de part et d'autre des piles.`].flatMap((l, i) => (i ? couperNote(l, 70) : [l]));
  const ht = (tt.lignes.length + 2) * tt.hl, hn = N.length * 2.1 * 1.6, wcol = tt.cols.reduce((s, c) => s + c.w, 0);
  const F = composer({ titre: `${nom} — CHARPENTE : ÉLÉVATION ET VUE EN PLAN`, cartouche, rangees: [[el], [pl]], aligner: [{ ref: el, vue: pl }],
    groupes: [{ vues: [el, pl], cible: 500, min: 100, refaire: e2 => { const a = vueElevation(C, Math.max(10, Math.round(e2 / 4 / 5) * 5)), b = vuePlan(C); return [a, b]; } }],
    colonne: { largeur: wcol + 6, hauteur: 2 + ht + 6 + hn + 4 },
    poser: (F, [x, y]) => { const x0 = F.W - 10 - wcol - 3; F.tableau(tt, x0, y + 2); F.note(N, x0, y + 2 + ht + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A2', 'A1', 'A0']);
  F.charpente = C;
  return finir(F);
}

export function planCharpenteCoupes(M, cartouche = {}, { nom = 'PONT MIXTE' } = {}) {
  const C = charpente(M), cA = vueCoupe(C), cB = vueCoupe(C, { appui: true }), p = M.p;
  const q = { titre: 'QUANTITÉS DE LA CHARPENTE', hl: 5, h: 2.0, cols: [{ t: 'Poste', w: 92, a: 'g' }, { t: 'Quantité', w: 34, a: 'd' }],
    lignes: [[`Poutres (${p.nPoutres} PRS, ${C.troncons.length} tronçons chacune${C.R ? ', cintrées en plan' : ''})`, `${milliers(C.kg.poutres)} kg`], [`Entretoises courantes (${C.nEnt} × ${C.prof[0]})`, `${milliers(C.kg.entretoises)} kg`],
      ['Entretoises d\'appui (vérinage)', `${milliers(C.kg.entretoisesAppui)} kg`], ['Montants et raidisseurs d\'appui', `${milliers(C.kg.montants)} kg`],
      Object.assign(['Total charpente', `${milliers(C.kg.total)} kg`], { gras: true }), ['Ratio par m² de tablier', `${fr(C.ratio, 0)} kg/m²`], ['Surface à protéger (anticorrosion)', `${milliers(C.surface)} m²`],
      ...(C.goujons ? [[`Goujons Ø${fr(C.goujons.d * 1000, 0)} × ${fr(C.goujons.h * 1000, 0)} (${C.goujons.n} par rangée)`, `${milliers(C.goujons.total)} u`]] : [])] };
  const tg = C.goujons ? { titre: 'CONNEXION : ESPACEMENT DES RANGÉES DE GOUJONS', hl: 4.6, h: 1.9, cols: [{ t: 'Zone', w: 20, a: 'c' }, { t: 'De [m]', w: 20, a: 'd' }, { t: 'À [m]', w: 20, a: 'd' }, { t: 'Espacement [m]', w: 30, a: 'd' }, { t: 'Goujons / m', w: 26, a: 'd' }],
    lignes: C.goujons.zones.map(z => [z.type === 'appui' ? 'appui' : 'travée', fr(z.x0, 2), fr(z.x1, 2), fr(z.s, 2), fr(C.goujons.n / z.s, 1)]) } : null;
  const nu = p.nuance, qual = t => (t > 80 ? 'NL' : t > 40 ? 'N' : 'K2');
  const tMax = Math.max(p.appui.tfi, p.appui.tfs, p.travee.tfi, p.travee.tfs) * 1000;
  const N = ['NOTES', `1. Acier ${nu} (EN 10025-2/-3) : f_y = ${fyEpaisseur(nu, 16)} MPa jusqu'à 16 mm, ${fyEpaisseur(nu, 40)} MPa jusqu'à 40 mm, ${fyEpaisseur(nu, 63)} MPa jusqu'à 63 mm. Qualité de ténacité selon l'épaisseur (EN 1993-1-10, T_md de l'ouvrage) : ${nu} ${qual(tMax)} au moins pour les tôles de ${fr(tMax, 0)} mm.`,
    '2. Exécution selon EN 1090-2, classe d\'exécution EXC3 ; soudures des semelles sur l\'âme : cordons d\'angle continus ; aboutages : pleine pénétration, contrôle 100 % (US / RX).',
    '3. Contre-flèches de fabrication : déformées du calcul par phases (charpente, béton, superstructures, effets différés) plus profil en long ; à reprendre sur la note.',
    `4. Goujons ${C.goujons ? `Ø${fr(C.goujons.d * 1000, 0)} × ${fr(C.goujons.h * 1000, 0)}, ${C.goujons.n} par rangée` : ''} soudés à l'arc (EN ISO 14555), espacements du tableau (EN 1994-2 § 6.6.5) ; densifier aux abouts (effort de retrait concentré, § 6.6.2.4).`,
    '5. Entretoises d\'appui dimensionnées pour le vérinage (remplacement des appareils d\'appui) : vérins sous l\'entretoise, de part et d\'autre des poutres.',
    '6. Protection anticorrosion : système ACQPA (C4 ANV) sur les faces extérieures ; semelles supérieures non peintes sous la dalle (bande de 2 cm aux rives).'].flatMap((l, i) => (i ? couperNote(l, 72) : [l]));
  const hq = (q.lignes.length + 2) * q.hl, hg = tg ? (tg.lignes.length + 2) * tg.hl + 6 : 0, hn = N.length * 2.1 * 1.6, wcol = Math.max(126, tg ? 116 : 0);
  const F = composer({ titre: `${nom} — CHARPENTE : COUPES, CONNEXION, QUANTITÉS`, cartouche, rangees: [[cA], [cB]], groupes: [{ vues: [cA, cB], cible: 75, min: 20 }],
    colonne: { largeur: wcol + 6, hauteur: 2 + hq + 6 + hg + hn + 4 },
    poser: (F, [x, y]) => { const x0 = F.W - 10 - wcol - 3; F.tableau(q, x0, y + 2); if (tg) F.tableau(tg, x0, y + 2 + hq + 6); F.note(N, x0, y + 2 + hq + 6 + hg + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A3', 'A2', 'A1']);
  F.charpente = C;
  return finir(F);
}
