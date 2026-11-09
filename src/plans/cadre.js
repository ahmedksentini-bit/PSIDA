/**
 * Plans d'exécution des cadres et portiques (onglet « Cadres et portiques ») : feuille de coffrage et feuille de
 * ferraillage d'un bloc PICF ou d'un PIPO, sur le modèle des feuilles du tablier et des appuis (cartouche, vues
 * cotées, bordereau ISO 4066, récapitulatif par diamètre, notes ; export SVG, DXF et PDF).
 *
 * Les sections d'acier viennent du calcul (src/cadre/picf.js, sections par barre et par station) ; les dispositions
 * suivent le guide Sétra PICF-EL et les règles de l'art reprises de BVTrace (src/cadre/details.js) :
 *  - aciers principaux dans le plan du cadre, parallèles aux têtes (option 1 du guide pour un ouvrage biais :
 *    longueurs biaises, répartition parallèle aux piédroits) ;
 *  - faces extérieures : nappe filante (U dont les retours recouvrent les verticales des piédroits) dimensionnée sur les
 *    sections courantes, complétée par des chapeaux sur les nœuds quand les abouts demandent davantage ;
 *  - faces intérieures : une nappe par cellule, prolongée dans les voiles jusqu'à l'enrobage opposé ;
 *  - répartition : face supérieure de la traverse et deux faces du radier ≥ max(½ A_s face inférieure de la traverse,
 *    non-fragilité) (PICF-EL, minimumTransversal) ; autres faces ≥ max(¼ A_s principale, non-fragilité)
 *    (BAEL 91 A.8.2,41) ;
 *  - renforts de goussets (PICF-EL § 2.2) : équerres aux angles intérieurs, longueur L du guide, espacement double de
 *    celui de la nappe intérieure, n φ₂ filants dans l'angle.
 * Ancrages et recouvrements : BAEL 91 A.6.1,23 (l_s = φ f_e / 4 τ_s, τ_s = 0,6 ψ_s² f_tj) ou EN 1992-1-1 § 8.4 et 8.7
 * selon le règlement du calcul.
 */
import { Vue, fmtCote } from './dessin.js';
import { longueurCoupe, rayonCintrage, recapitulatif } from './bordereau.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { anchorage, areaOf, massPerM, chooseBars } from '../rebar.js';
import { epVoile, nCell } from '../cadre/cadre.js';
import { goussetSup, goussetInf, minimumTransversal } from '../cadre/details.js';
import { minimumBael } from '../cadre/sections.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const esp = s => fr(s * 100, Math.abs(s * 100 - Math.round(s * 100)) > 1e-6 ? 1 : 0);
const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;
const LMAX = 12;   // longueur commerciale (m)
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/* ------------------------------------------------------------------------------------------- géométrie */
/** Géométrie de dessin dans le plan des têtes (m) : x depuis le parement extérieur gauche, z depuis la sous-face du radier. */
export function geometrieCadre(res) {
  const g = res.cadre, n = nCell(g), ouvert = !!res.ouvert;
  const t = j => epVoile(g, j), xL = [0], xR = [t(0)];
  for (let i = 0; i < n; i++) { xL.push(xR[i] + g.ouv[i]); xR.push(xL[i + 1] + t(i + 1)); }
  const er = ouvert ? 0 : g.er, zi = er, zt = er + g.h, zT = zt + g.et;
  const biais = res.geom.biais ?? 90, sb = Math.sin(biais * Math.PI / 180);
  return { g, n, ouvert, t, xL, xR, W: xR[n], er, et: g.et, h: g.h, zi, zt, zT, L: res.geom.L || 0, Hr: res.geom.Hr || 0,
    biais, sb, nom: res.geom.nom || '', B: res.geom.B };
}

/* ------------------------------------------------------------------------------------- ancrages, choix */
function ancrage(h) {
  if (h.code === 'EC2') return phi => { const a = anchorage(phi, { fck: h.fc28, fyk: h.fe, h: 1 }); return { lbd: a.lbd, l0: a.l0 }; };
  const ftj = 0.6 + 0.06 * h.fc28, tau = 0.6 * 1.5 ** 2 * ftj;   // BAEL 91 A.6.1,21 (ψ_s = 1,5 pour les HA)
  return phi => { const ls = Math.max(phi / 1000 * h.fe / (4 * tau), 0.20); return { lbd: ls, l0: ls }; };
}
/** Plus petit diamètre fournissant As (cm²/ml) à l'espacement s ; sinon on resserre (0,20 → 0,15 → 0,10). */
function choix(As, { phiMin = 10, sList = [0.20, 0.15, 0.10] } = {}) {
  for (const s of sList) for (const phi of [8, 10, 12, 14, 16, 20, 25, 32]) {
    if (phi < phiMin) continue;
    if (areaOf(phi) / s * 1e4 + 1e-9 >= As) return { phi, s, As: areaOf(phi) / s * 1e4 };
  }
  return { phi: 32, s: 0.10, As: areaOf(32) / 0.10 * 1e4, insuffisant: true };
}
const phiAt = (As, s, phiMin = 10) => { for (const phi of [10, 12, 14, 16, 20, 25, 32]) if (phi >= phiMin && areaOf(phi) / s * 1e4 + 1e-9 >= As) return phi; return 32; };
/** Répartition (cm²/ml) : φ ≥ 8, espacement 0,25 à 0,15 m. */
const repartition = As => { const b = chooseBars(As / 1e4, { phiMin: 8, phiMax: 16, sMax: 0.25, sMin: 0.15 }); return { phi: b.phi, s: b.s, As: b.As * 1e4 }; };

/** Section tendue d'une face (cm²/ml) à une station, d'après la convention de faceTendue (web/cadre_view.js). */
function asFace(s, face) {
  const b = s.barre;
  if (b.startsWith('Traverse') || b === 'Piédroit gauche') return face === 'int' ? s.asMax.as : s.asMin.as;
  if (b.startsWith('Radier') || b === 'Piédroit droit') return face === 'int' ? s.asMin.as : s.asMax.as;
  return face === 'droite' ? s.asMax.as : s.asMin.as;   // voiles intermédiaires
}

/**
 * Découpe d'une nappe à retours (U) trop longue pour une barre commerciale : pièces en L aux extrémités, droites au
 * milieu, recouvrement l0. Renvoie [{ code, dims, nombre }] pour une nappe.
 */
function decouperU(Bh, leg, l0) {
  const nP = Math.max(1, Math.ceil((Bh + 2 * leg - 1e-9) / LMAX));
  if (nP === 1) return { pieces: [{ code: '21', dims: { A: leg, B: Bh, C: leg }, k: 1 }], nP };
  const hp = (Bh + (nP - 1) * l0) / nP, out = [{ code: '11', dims: { A: hp, B: leg }, k: 2 }];
  if (nP > 2) out.push({ code: '00', dims: { A: hp }, k: nP - 2 });
  return { pieces: out, nP };
}
const decouperDroite = (Lb, l0) => { const nP = Math.max(1, Math.ceil((Lb - 1e-9) / LMAX)); return { nP, Lpc: nP > 1 ? (Lb + (nP - 1) * l0) / nP : Lb }; };

/* ------------------------------------------------------------------------------------------ repères */
/**
 * Repères d'armature d'un cadre : { mark, elem, label, phi, s?, code, dims {A, B, C} (mm), nombre, pos, ... } ; chaque
 * repère porte la section demandée (req, cm²/ml) et fournie (prov).
 */
export function reperesCadre(res) {
  const G = geometrieCadre(res), h = res.h, c = h.enrobage, anc = ancrage(h);
  const { n, ouvert, t, xL, xR, W } = G;
  const Lb = G.L > 0 ? G.L : 1, parMetre = !(G.L > 0);
  const nL = s => Math.floor((Lb - 2 * c) / s + 1e-9) + 1;
  const S = res.sections, sec = b => S.filter(s => s.barre === b);
  const out = []; let k = 0;
  const add = m => { out.push({ mark: ++k, ...m }); return out[out.length - 1]; };
  const Htot = G.zT, demande = (barre, face, stations = null) => Math.max(0, ...sec(barre).filter(s => !stations || stations.includes(s.ou)).map(s => asFace(s, face)));
  const COUR = ['1/4', 'Mi-portée', '3/4'], ABOUT = { A: ['About A'], B: ['About B'] };

  // ---------------------------------------------------------------- dalles : traverse, radier
  const dalle = (nom, prefixe, zFace, sens) => {   // sens : +1 traverse (face ext. en haut), −1 radier
    const barres = Array.from({ length: n }, (_, i) => `${nom} ${i + 1}`), e = nom === 'Traverse' ? G.et : G.er;
    // nappe extérieure filante, retours dans les piédroits (recouvrement avec leurs verticales extérieures)
    const reqC = Math.max(...barres.map(b => demande(b, 'ext', COUR)), minimumBael(e - c, h.fc28, h.fe));
    const C = choix(reqC), a = anc(C.phi), leg = Math.min(a.l0, Htot - 2 * c);
    const U = decouperU(W - 2 * c, leg, a.l0);
    U.pieces.forEach((p, q) => add({ elem: nom, label: `${nom} — nappe extérieure filante${U.nP > 1 ? ` (pièce ${q === 0 ? 'd’extrémité' : 'courante'}, ${U.nP} pièces, recouvrement ${fr(a.l0)} m)` : ''}`,
      phi: C.phi, s: C.s, code: p.code, dims: Object.fromEntries(Object.entries(p.dims).map(([kk, v]) => [kk, v * 1000])), nombre: p.k * nL(C.s), req: reqC, prov: C.As, pos: `${prefixe}Ext`, piece: q, leg, nP: U.nP, l0: a.l0 }));
    // chapeaux sur les nœuds dont les abouts demandent plus que la nappe filante
    const reqNoeud = j => Math.max(j > 0 ? demande(barres[j - 1], 'ext', ABOUT.B) : 0, j < n ? demande(barres[j], 'ext', ABOUT.A) : 0);
    const ch = { angle: [], milieu: [] };
    for (let j = 0; j <= n; j++) {
      const def = reqNoeud(j) - C.As;
      if (def <= 0.05) continue;
      const phi = phiAt(def, C.s), aa = anc(phi), port = Math.max(j > 0 ? G.g.ouv[j - 1] : 0, j < n ? G.g.ouv[j] : 0), ext = Math.max(0.25 * port, aa.lbd);
      (j === 0 || j === n ? ch.angle : ch.milieu).push({ j, phi, def, ext, aa });
    }
    if (ch.angle.length) {
      const phi = Math.max(...ch.angle.map(q => q.phi)), q0 = ch.angle.find(q => q.phi === phi), aa = anc(phi), tv = t(q0.j), vert = Math.min(Math.max(0.25 * G.h, aa.lbd), Htot - 2 * c);
      add({ elem: nom, label: `${nom} — chapeaux d’angle (${ch.angle.length === 2 ? '2 angles' : '1 angle'})`, phi, s: C.s, code: '11', dims: { A: (tv - c + q0.ext) * 1000, B: vert * 1000 },
        nombre: ch.angle.length * nL(C.s), req: Math.max(...ch.angle.map(q => q.def + C.As)), prov: C.As + areaOf(phi) / C.s * 1e4, pos: `${prefixe}ChA`, noeuds: ch.angle.map(q => q.j), ext: q0.ext, vert });
    }
    if (ch.milieu.length) {
      const phi = Math.max(...ch.milieu.map(q => q.phi)), ext = Math.max(...ch.milieu.map(q => q.ext));
      add({ elem: nom, label: `${nom} — chapeaux sur voiles intermédiaires`, phi, s: C.s, code: '00', dims: { A: (G.g.ei + 2 * ext) * 1000 },
        nombre: ch.milieu.length * nL(C.s), req: Math.max(...ch.milieu.map(q => q.def + C.As)), prov: C.As + areaOf(phi) / C.s * 1e4, pos: `${prefixe}ChM`, noeuds: ch.milieu.map(q => q.j), ext });
    }
    // nappe intérieure : une par cellule, prolongée dans les voiles jusqu'à l'enrobage opposé
    const inter = [];
    for (let i = 0; i < n; i++) {
      const req = Math.max(demande(barres[i], 'int'), minimumBael(e - c, h.fc28, h.fe)), I = choix(req), a2 = anc(I.phi);
      const Ld = G.g.ouv[i] + t(i) + t(i + 1) - 2 * c, D = decouperDroite(Ld, a2.l0);
      inter.push({ i, I, Ld: D.Lpc, nP: D.nP, req });
    }
    // regroupement des cellules identiques
    const grp = new Map();
    for (const q of inter) { const key = `${q.I.phi}|${q.I.s}|${r5(q.Ld * 1000)}|${q.nP}`; if (!grp.has(key)) grp.set(key, []); grp.get(key).push(q); }
    for (const qs of grp.values()) {
      const q = qs[0];
      add({ elem: nom, label: `${nom} — nappe intérieure${n > 1 ? ` (cellule${qs.length > 1 ? 's' : ''} ${qs.map(x => x.i + 1).join(', ')})` : ''}${q.nP > 1 ? ` (${q.nP} tronçons)` : ''}`,
        phi: q.I.phi, s: q.I.s, code: '00', dims: { A: q.Ld * 1000 }, nombre: qs.length * q.nP * nL(q.I.s), req: Math.max(...qs.map(x => x.req)), prov: q.I.As, pos: `${prefixe}Int`, cellules: qs.map(x => x.i), nP: q.nP, l0: anc(q.I.phi).l0 });
    }
    return { C, inter, sens, zFace, e };
  };
  const T = dalle('Traverse', 'tr', G.zT, 1), R = ouvert ? null : dalle('Radier', 'ra', 0, -1);

  // ---------------------------------------------------------------- piédroits et voiles
  const longV = ouvert ? null : Htot - 2 * c;
  const verticales = (nom, barre, face, pos, nb, extra = {}) => {
    const req = Math.max(demande(barre, face), minimumBael(t(nb === 'g' ? 0 : n) - c, h.fc28, h.fe)), V = choix(req), a = anc(V.phi);
    const Lv = ouvert ? Htot - c + a.lbd : longV, D = decouperDroite(Lv, a.l0);
    return add({ elem: nom, label: `${nom} — verticales ${face === 'ext' ? 'extérieures' : 'intérieures'}${ouvert ? ' (ancrées dans la semelle)' : ''}${D.nP > 1 ? ` (${D.nP} tronçons)` : ''}`,
      phi: V.phi, s: V.s, code: '00', dims: { A: D.Lpc * 1000 }, nombre: D.nP * nL(V.s), req, prov: V.As, pos, cote: nb, lbd: a.lbd, nP: D.nP, l0: a.l0, ...extra });
  };
  const PG = [verticales('Piédroit gauche', 'Piédroit gauche', 'ext', 'pgExt', 'g'), verticales('Piédroit gauche', 'Piédroit gauche', 'int', 'pgInt', 'g')];
  const PD = [verticales('Piédroit droit', 'Piédroit droit', 'ext', 'pdExt', 'd'), verticales('Piédroit droit', 'Piédroit droit', 'int', 'pdInt', 'd')];
  // fusion des deux piédroits quand ils portent les mêmes barres (cas symétrique)
  for (let q = 0; q < 2; q++) {
    const a = PG[q], b = PD[q];
    if (a.phi === b.phi && a.s === b.s && Math.abs(a.dims.A - b.dims.A) < 1) {
      a.nombre += b.nombre; a.req = Math.max(a.req, b.req); a.label = a.label.replace('Piédroit gauche', 'Piédroits'); a.elem = 'Piédroits'; a.pos = q === 0 ? 'pExt' : 'pInt'; a.cote = 'gd';
      out.splice(out.indexOf(b), 1);
    }
  }
  if (n > 1) {
    const req = Math.max(...Array.from({ length: n - 1 }, (_, i) => Math.max(demande(`Voile ${i + 1}`, 'gauche'), demande(`Voile ${i + 1}`, 'droite'))), minimumBael(G.g.ei - c, h.fc28, h.fe));
    const V = choix(req), a = anc(V.phi), Lv = ouvert ? Htot - c + a.lbd : longV, D = decouperDroite(Lv, a.l0);
    add({ elem: 'Voiles', label: `Voiles intermédiaires — verticales (2 faces${n > 2 ? `, ${n - 1} voiles` : ''})`, phi: V.phi, s: V.s, code: '00', dims: { A: D.Lpc * 1000 },
      nombre: 2 * (n - 1) * D.nP * nL(V.s), req, prov: V.As, pos: 'voile', lbd: a.lbd, nP: D.nP, l0: a.l0 });
  }

  // ---------------------------------------------------------------- goussets (PICF-EL § 2.2)
  const sInt = Math.min(...out.filter(m => m.pos === 'trInt').map(m => m.s));
  const gs = goussetSup(G.B), gi = goussetInf(G.B);
  const phiG = Math.max(10, ...out.filter(m => m.pos === 'trInt').map(m => m.phi));
  const coins = 2 * n;
  const rep = [];
  if (gs.L > 0) {
    const leg = Math.min(gs.L, G.h / 2);
    add({ elem: 'Goussets', label: `Renforts d’angle supérieurs (équerres, ${coins} angles, L = ${fr(gs.L)} m — PICF-EL)`, phi: phiG, s: 2 * sInt, code: '11', dims: { A: gs.L * 1000 + 0, B: leg * 1000 },
      nombre: coins * nL(2 * sInt), pos: 'gSup', Lg: gs.L, leg });
    rep.push({ pos: 'gSupR', n: gs.n, nom: 'supérieurs' });
  }
  if (!ouvert && gi.L > 0) {
    const sR = Math.min(...out.filter(m => m.pos === 'raInt').map(m => m.s)), phiR = Math.max(10, ...out.filter(m => m.pos === 'raInt').map(m => m.phi)), leg = Math.min(gi.L, G.h / 2);
    add({ elem: 'Goussets', label: `Renforts d’angle inférieurs (équerres, ${coins} angles, L = ${fr(gi.L)} m — PICF-EL)`, phi: phiR, s: 2 * sR, code: '11', dims: { A: gi.L * 1000, B: leg * 1000 },
      nombre: coins * nL(2 * sR), pos: 'gInf', Lg: gi.L, leg });
    rep.push({ pos: 'gInfR', n: gi.n, nom: 'inférieurs' });
  }

  // ---------------------------------------------------------------- répartition (parallèle aux piédroits)
  const asTrInt = Math.max(...out.filter(m => m.pos === 'trInt').map(m => m.prov));
  const minPICF = ouvert ? Math.max(asTrInt / 4, minimumBael(G.et - c, h.fc28, h.fe)) : minimumTransversal(asTrInt, G.et - c, h.fc28, h.fe, res.sections.some(s => s.echec)).as;
  const repart = (label, As, nombreBarres, pos, extra = {}) => {
    const r = repartition(As), a = anc(r.phi), D = decouperDroite(Lb - 2 * c, a.l0);
    return add({ elem: 'Répartition', label: `${label}${D.nP > 1 ? ` (${D.nP} tronçons)` : ''}`, phi: r.phi, s: r.s, code: '00', dims: { A: D.Lpc * 1000 }, nombre: D.nP * nombreBarres(r.s), req: As, prov: r.As, pos, nP: D.nP, l0: a.l0, ...extra });
  };
  const nW = s => Math.floor((W - 2 * c) / s + 1e-9) + 1, nH = s => Math.floor(G.h / s + 1e-9) + 1;
  repart(`Traverse — répartition face supérieure (${ouvert ? '¼ A_s, BAEL A.8.2,41' : 'PICF-EL'})`, minPICF, nW, 'trRepE');
  repart('Traverse — répartition face inférieure (¼ A_s, BAEL A.8.2,41)', Math.max(asTrInt / 4, minimumBael(G.et - c, h.fc28, h.fe)), s => out.filter(m => m.pos === 'trInt').reduce((S0, m) => S0 + m.cellules.reduce((S1, i) => S1 + Math.floor(G.g.ouv[i] / s + 1e-9) + 1, 0), 0), 'trRepI');
  if (!ouvert) {
    repart('Radier — répartition face inférieure (PICF-EL)', minPICF, nW, 'raRepE');
    repart('Radier — répartition face supérieure (PICF-EL)', minPICF, s => G.g.ouv.reduce((S0, o) => S0 + Math.floor(o / s + 1e-9) + 1, 0), 'raRepI');
  }
  const asP = Math.max(...out.filter(m => /^(p|pg|pd)(Ext|Int)$/.test(m.pos) || m.pos === 'voile').map(m => m.prov));
  const faces = 2 * (n + 1);
  repart(`Piédroits${n > 1 ? ' et voiles' : ''} — horizontales (${faces} faces, ¼ A_s)`, Math.max(asP / 4, minimumBael(G.g.ep - c, h.fc28, h.fe)), s => faces * nH(s), 'pRep');
  for (const q of rep) {
    const ref = out.find(m => m.pos === (q.pos === 'gSupR' ? 'trRepI' : 'raRepI'));
    add({ elem: 'Goussets', label: `Renforts d’angle ${q.nom} — ${q.n} φ₂ filants par angle`, phi: ref.phi, code: '00', dims: { A: ref.dims.A }, nombre: q.n * coins * decouperDroite(Lb - 2 * c, anc(ref.phi).l0).nP, pos: q.pos, nParAngle: q.n, nP: decouperDroite(Lb - 2 * c, anc(ref.phi).l0).nP, l0: anc(ref.phi).l0 });
  }

  // longueurs de coupe et masses
  for (const m of out) {
    const d = { A: r5(m.dims.A || 0), B: r5(m.dims.B || 0), C: r5(m.dims.C || 0) };
    m.dims = d; m.L = r25(longueurCoupe(m.code, d, m.phi));
    m.total = m.L / 1000 * m.nombre; m.masse = m.total * massPerM(m.phi);
  }
  out.forEach((m, i) => { m.mark = i + 1; });
  return { G, marks: out, parMetre, Lb, minPICF, gs, gi, c };
}

export const lignesBordereau = marks => marks.map(m => ({ repere: String(m.mark), mark: m.mark, phi: m.phi, code: m.code, A: m.dims.A, B: ['11', '21', '51'].includes(m.code) ? m.dims.B : null, C: ['21', '51'].includes(m.code) ? m.dims.C : null, L: m.L, nombre: m.nombre, total: m.total, masse: m.masse }));
export const desig = m => (m.nParAngle ? `${m.nParAngle} HA${m.phi} / angle` : m.s ? `HA${m.phi} e=${esp(m.s)}` : `${m.nombre} HA${m.phi}`);

/* -------------------------------------------------------------------------------------- vues de coffrage */
export function contourBeton(v, G, { hachures = true } = {}) {
  const { n, xL, xR, W, zi, zt, zT, ouvert } = G;
  if (ouvert) {
    // portique : traverse + piédroits (pas de radier)
    const pts = [[0, 0], [xR[0], 0]];
    for (let i = 0; i < n; i++) { pts.push([xR[i], zt], [xL[i + 1], zt]); pts.push([xL[i + 1], 0], [xR[i + 1], 0]); }
    pts.push([W, zT], [0, zT]);
    v.poly('COFFRAGE', pts, true);
  } else {
    v.poly('COFFRAGE', [[0, 0], [W, 0], [W, zT], [0, zT]], true);
    for (let i = 0; i < n; i++) v.poly('COFFRAGE', [[xR[i], zi], [xL[i + 1], zi], [xL[i + 1], zt], [xR[i], zt]], true);
  }
  if (!hachures) return;
  v.hachure([[0, zt], [W, zt], [W, zT], [0, zT]]);
  if (!ouvert) v.hachure([[0, 0], [W, 0], [W, zi], [0, zi]]);
  for (let j = 0; j <= n; j++) v.hachure([[xL[j], zi], [xR[j], zi], [xR[j], zt], [xL[j], zt]]);
}

function vueCoupeCoffrage(G) {
  const v = new Vue(`COUPE TRANSVERSALE${Math.abs(G.biais - 90) > 1e-6 ? ' (parallèle aux têtes)' : ''}`), { n, xL, xR, W, zi, zt, zT, ouvert } = G;
  contourBeton(v, G);
  if (!ouvert) v.proprete(0, W, 0, 0.10);
  else for (let j = 0; j <= n; j++) v.texte('TEXTES', [(xL[j] + xR[j]) / 2, -0.12], 'semelle', { h: 2, ancre: 'c', v: 'h' });
  // remblai sur la traverse
  if (G.Hr > 0) {
    const zr = zT + G.Hr, d = Math.min(1.5, W * 0.15);
    v.terrain([[-d, zr], [W + d, zr]], 1);
    v.coteV([W, zT], [W, zr], W + 0.55, fmtCote(G.Hr));
    v.texte('TEXTES', [W / 2, zr + 0.08], `remblai H = ${fmtCote(G.Hr)} m`, { h: 2.2, ancre: 'c', v: 'b' });
  }
  // cotes horizontales : épaisseurs et ouvertures, puis largeur totale
  const zc = (ouvert ? 0 : -0.10) - 0.45;
  const pts = [0]; for (let j = 0; j <= n; j++) { if (j > 0) pts.push(xL[j]); pts.push(xR[j]); }
  for (let q = 0; q + 1 < pts.length; q++) v.coteH([pts[q], 0], [pts[q + 1], 0], zc);
  v.coteH([0, 0], [W, 0], zc - 0.45);
  // cotes verticales : radier, ouverture, traverse
  const xc = -0.45;
  if (!ouvert) v.coteV([0, 0], [0, zi], xc);
  v.coteV([0, zi], [0, zt], xc); v.coteV([0, zt], [0, zT], xc);
  v.coteV([0, 0], [0, zT], xc - 0.45);
  for (let i = 0; i < n; i++) v.texte('TEXTES', [(xR[i] + xL[i + 1]) / 2, (zi + zt) / 2], `${fmtCote(G.g.ouv[i])} × ${fmtCote(G.h)}`, { h: 2.4, ancre: 'c', v: 'm' });
  return v;
}

function vuePlanCoffrage(G) {
  const v = new Vue('VUE EN PLAN'), L = G.L > 0 ? G.L : Math.max(2, G.W), cb = Math.cos(G.biais * Math.PI / 180), sb = G.sb;
  const P = (u, x) => [u + x * cb, -x * sb];   // u le long de l'axe de l'ouvrage, x le long des têtes
  v.poly('COFFRAGE', [P(0, 0), P(L, 0), P(L, G.W), P(0, G.W)], true);
  for (let j = 0; j <= G.n; j++) for (const x of [G.xL[j], G.xR[j]]) if (x > 1e-9 && x < G.W - 1e-9) v.ligne('VUES', P(0, x), P(L, x));
  v.ligne('AXES', P(-0.6, G.W / 2), P(L + 0.6, G.W / 2));
  v.cote(P(0, G.W), P(L, G.W), -0.6, `${fmtCote(L)}${G.L > 0 ? '' : ' (longueur non saisie)'}`);
  v.cote(P(L, 0), P(L, G.W), -0.6, fmtCote(G.W));
  if (Math.abs(G.biais - 90) > 1e-6) v.texte('TEXTES', P(L / 2, -0.35), `biais ${fr(G.biais / 0.9, 1)} gr`, { h: 2.4, ancre: 'c', v: 'b' });
  v.texte('TEXTES', P(-0.3, G.W / 2), 'tête amont', { h: 2.2, ancre: 'c', v: 'm', angle: 90 });
  v.texte('TEXTES', P(L + 0.3, G.W / 2), 'tête aval', { h: 2.2, ancre: 'c', v: 'm', angle: 90 });
  return v;
}

/** Quantités : béton (section × longueur × sin biais), coffrages, aciers du bordereau. */
export function quantitesCadre(res, masseAcier = null) {
  const G = geometrieCadre(res), L = G.L > 0 ? G.L : 1, { n, xL, xR, W, zi, zt, zT, ouvert } = G;
  let A = W * G.et + (ouvert ? 0 : W * G.er);
  for (let j = 0; j <= n; j++) A += (xR[j] - xL[j]) * G.h;
  const beton = A * L * G.sb;
  const cellules = G.g.ouv.reduce((s, o) => s + (2 * G.h + o + (ouvert ? 0 : o)), 0) * L;
  const parements = 2 * zT * L, abouts = 2 * A;
  return { beton, coffrage: { cellules, parements, abouts }, acier: masseAcier, ratio: masseAcier ? masseAcier / beton : null, parMetre: !(G.L > 0) };
}
function tableauQuantites(Q) {
  const u = Q.parMetre ? ' (par m)' : '';
  return {
    titre: `QUANTITÉS${Q.parMetre ? ' PAR MÈTRE D’OUVRAGE' : ''}`,
    cols: [{ t: 'Désignation', w: 104, a: 'g' }, { t: 'Unité', w: 22, a: 'c' }, { t: 'Quantité', w: 34, a: 'd' }],
    lignes: [
      ['Béton de structure' + u, 'm³', fr(Q.beton, 1)],
      ['Coffrage : intérieur des cellules' + u, 'm²', fr(Q.coffrage.cellules, 1)],
      ['Coffrage : parements extérieurs' + u, 'm²', fr(Q.coffrage.parements, 1)],
      ['Coffrage : abouts (têtes)', 'm²', fr(Q.coffrage.abouts, 1)],
      ['Armatures (plan de ferraillage)' + u, 'kg', Q.acier ? milliers(Q.acier) : '—'],
      ['Ratio d’armatures', 'kg/m³', Q.acier ? fr(Q.ratio, 0) : '—'],
    ],
  };
}
/** Numérotation continue des notes (les lignes conditionnelles laissent sinon des trous). */
export const numeroter = L => { let k = 0; return L.map((l, i) => (i === 0 ? l : l.replace(/^\d+\. /, () => `${++k}. `))); };
export const nomOuvrage = (res, bloc) => `${res.ouvert ? 'PIPO' : 'PICF'}${res.geom.nom ? ' ' + res.geom.nom.toUpperCase() : ''}${bloc ? ` — ${bloc.toUpperCase()}` : ''}`;

export function planCoffrageCadre(res, cartouche = {}, { bloc = '' } = {}) {
  const G = geometrieCadre(res), { marks } = reperesCadre(res), masse = marks.reduce((s, m) => s + m.masse, 0);
  const cp = vueCoupeCoffrage(G), pl = vuePlanCoffrage(G);
  const Q = quantitesCadre(res, masse), tq = tableauQuantites(Q), hq = (tq.lignes.length + 2) * 6;
  const h = res.h;
  const notes = [
    'NOTES',
    `1. Cotes en mètres. Béton f_c28 = ${h.fc28} MPa${h.exposition ? `, exposition ${h.exposition}` : ''} ; enrobage ${fr(h.enrobage * 100, 1)} cm.`,
    `2. ${res.ouvert ? 'Portique ouvert : semelles et fondations selon leur propre plan (réactions dans la note).' : 'Béton de propreté 10 cm sous le radier (non compté).'}`,
    `3. Dimensions de calcul : onglet Cadres et portiques (${h.code === 'EC2' ? 'Eurocodes' : 'BAEL 91 / Fascicule 61'}).`,
    ...(Math.abs(G.biais - 90) > 1e-6 ? [`4. Ouvrage biais (${fr(G.biais / 0.9, 1)} gr) : coupe parallèle aux têtes, longueurs biaises.`] : []),
    ...(Q.parMetre ? ['5. Longueur de l’ouvrage non saisie : quantités par mètre.'] : []),
  ].filter(Boolean);
  const notesN = numeroter(notes), hn = notesN.length * 2.1 * 1.6;
  const F = composer({
    titre: `${nomOuvrage(res, bloc)} — COFFRAGE`, cartouche,
    rangees: G.W > 9 ? [[cp], [pl]] : [[cp, pl]],
    groupes: [{ vues: [cp], cible: 50, min: 20 }, { vues: [pl], cible: 100, min: 25 }],
    colonne: { largeur: 182, hauteur: 2 + hq + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      F.tableau(tq, F.W - 10 - 162, y + 2);
      F.note(notesN, F.W - 10 - 182 + 2, y + 2 + hq + 6 + hn - 2.1 * 0.6, 2.1);
      F.notes[F.notes.length - 1].titreGras = true;
    },
  }, ['A3', 'A2', 'A1']);
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(p => '1/' + p.vue.echelle))].join(' ; ');
  return F;
}

/* Feuilles de ferraillage : src/plans/cadre_fer.js (coupes et détails, vues en plan, nomenclature et façonnage). */
export { planFerraillageCadre, planFerraillagePlanCadre, planFaconnageCadre } from './cadre_fer.js';
