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
      phi: C.phi, s: C.s, code: p.code, dims: Object.fromEntries(Object.entries(p.dims).map(([kk, v]) => [kk, v * 1000])), nombre: p.k * nL(C.s), req: reqC, prov: C.As, pos: `${prefixe}Ext`, piece: q, leg }));
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
        phi: q.I.phi, s: q.I.s, code: '00', dims: { A: q.Ld * 1000 }, nombre: qs.length * q.nP * nL(q.I.s), req: Math.max(...qs.map(x => x.req)), prov: q.I.As, pos: `${prefixe}Int`, cellules: qs.map(x => x.i) });
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
      phi: V.phi, s: V.s, code: '00', dims: { A: D.Lpc * 1000 }, nombre: D.nP * nL(V.s), req, prov: V.As, pos, cote: nb, lbd: a.lbd, ...extra });
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
      nombre: 2 * (n - 1) * D.nP * nL(V.s), req, prov: V.As, pos: 'voile' });
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
    return add({ elem: 'Répartition', label: `${label}${D.nP > 1 ? ` (${D.nP} tronçons)` : ''}`, phi: r.phi, s: r.s, code: '00', dims: { A: D.Lpc * 1000 }, nombre: D.nP * nombreBarres(r.s), req: As, prov: r.As, pos, ...extra });
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
    add({ elem: 'Goussets', label: `Renforts d’angle ${q.nom} — ${q.n} φ₂ filants par angle`, phi: ref.phi, code: '00', dims: { A: ref.dims.A }, nombre: q.n * coins * decouperDroite(Lb - 2 * c, anc(ref.phi).l0).nP, pos: q.pos, nParAngle: q.n });
  }

  // longueurs de coupe et masses
  for (const m of out) {
    const d = { A: r5(m.dims.A || 0), B: r5(m.dims.B || 0), C: r5(m.dims.C || 0) };
    m.dims = d; m.L = r25(longueurCoupe(m.code, d, m.phi));
    m.total = m.L / 1000 * m.nombre; m.masse = m.total * massPerM(m.phi);
  }
  out.forEach((m, i) => { m.mark = i + 1; });
  return { G, marks: out, parMetre, Lb, minPICF, gs, gi };
}

const lignesBordereau = marks => marks.map(m => ({ repere: String(m.mark), mark: m.mark, phi: m.phi, code: m.code, A: m.dims.A, B: ['11', '21', '51'].includes(m.code) ? m.dims.B : null, C: ['21', '51'].includes(m.code) ? m.dims.C : null, L: m.L, nombre: m.nombre, total: m.total, masse: m.masse }));
const desig = m => (m.nParAngle ? `${m.nParAngle} HA${m.phi} / angle` : m.s ? `HA${m.phi} e=${esp(m.s)}` : `${m.nombre} HA${m.phi}`);

/* -------------------------------------------------------------------------------------- vues de coffrage */
function contourBeton(v, G, { hachures = true } = {}) {
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
const numeroter = L => { let k = 0; return L.map((l, i) => (i === 0 ? l : l.replace(/^\d+\. /, () => `${++k}. `))); };
const nomOuvrage = (res, bloc) => `${res.ouvert ? 'PIPO' : 'PICF'}${res.geom.nom ? ' ' + res.geom.nom.toUpperCase() : ''}${bloc ? ` — ${bloc.toUpperCase()}` : ''}`;

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

/* ---------------------------------------------------------------------------------- vues de ferraillage */
function vueCoupeArmatures(G, marks, h, e = 50) {
  const v = new Vue('COUPE TRANSVERSALE — ARMATURES'), c = h.enrobage, { n, xL, xR, W, zi, zt, zT, ouvert } = G;
  contourBeton(v, G, { hachures: false });
  const M = p => marks.filter(m => m.pos === p), M1 = p => marks.find(m => m.pos === p), bulles = [];
  const bul = (m, p) => m && bulles.push({ m, p });
  const d = 0.012, rp = 0.011;   // décalage entre lits, rayon des points
  const points = (x0, z0, x1, z1, s) => { const Lg = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.min(60, Math.round(Lg / s))); for (let q = 0; q <= k; q++) v.cercle('ACIERS_COUPES', [x0 + (x1 - x0) * q / k, z0 + (z1 - z0) * q / k], rp, true); };
  // traverse
  const tE = M('trExt'), leg = tE.length ? tE[0].leg : 0;
  if (tE.length) { v.poly('ACIERS', [[c + d, zT - c - leg], [c + d, zT - c], [W - c - d, zT - c], [W - c - d, zT - c - leg]]); bul(tE[0], [W * 0.62, zT - c]); }
  const rE = M('raExt');
  if (rE.length) { v.poly('ACIERS', [[c + d, c + rE[0].leg], [c + d, c], [W - c - d, c], [W - c - d, c + rE[0].leg]]); bul(rE[0], [W * 0.62, c]); }
  for (const [pre, zf, sg] of [['tr', zT - c - 2 * d, -1], ['ra', c + 2 * d, 1]]) {
    const ca = M1(`${pre}ChA`), cm = M1(`${pre}ChM`);
    if (ca) for (const j of ca.noeuds) { const x0 = j === 0 ? c + 2 * d : W - c - 2 * d, x1 = j === 0 ? xR[0] + ca.ext : xL[n] - ca.ext; v.poly('ACIERS', [[x0, zf + sg * ca.vert], [x0, zf], [x1, zf]]); }
    if (ca) bul(ca, [ca.noeuds[0] === 0 ? xR[0] + ca.ext * 0.6 : xL[n] - ca.ext * 0.6, zf]);
    if (cm) for (const j of cm.noeuds) v.ligne('ACIERS', [xL[j] - cm.ext, zf], [xR[j] + cm.ext, zf]);
    if (cm) bul(cm, [xR[cm.noeuds[0]] + cm.ext * 0.5, zf]);
  }
  for (const [pre, z] of [['tr', zt + c], ['ra', zi - c]]) for (const m of M(`${pre}Int`)) {
    for (const i of m.cellules) v.ligne('ACIERS', [xL[i] + c, z], [xR[i + 1] - c, z]);
    bul(m, [(xR[m.cellules[0]] + xL[m.cellules[0] + 1]) / 2 - 0.15 * G.g.ouv[m.cellules[0]], z]);
  }
  // piédroits et voiles
  const z0 = ouvert ? -(M1('pExt') || M1('pgExt')).lbd : c, z1 = zT - c;
  const vert = (pos, x) => { const m = M1(pos); if (m) v.ligne('ACIERS', [x, z0], [x, z1]); return m; };
  const pe = M1('pExt'), pi = M1('pInt');
  if (pe) { vert('pExt', c); vert('pExt', W - c); bul(pe, [W - c, zi + 0.35 * G.h]); } else { bul(vert('pgExt', c), [c, zi + 0.35 * G.h]); bul(vert('pdExt', W - c), [W - c, zi + 0.35 * G.h]); }
  if (pi) { vert('pInt', xR[0] - c); vert('pInt', xL[n] + c); bul(pi, [xL[n] + c, zi + 0.6 * G.h]); } else { bul(vert('pgInt', xR[0] - c), [xR[0] - c, zi + 0.6 * G.h]); bul(vert('pdInt', xL[n] + c), [xL[n] + c, zi + 0.6 * G.h]); }
  const vo = M1('voile');
  if (vo) { for (let j = 1; j < n; j++) { v.ligne('ACIERS', [xL[j] + c, z0], [xL[j] + c, z1]); v.ligne('ACIERS', [xR[j] - c, z0], [xR[j] - c, z1]); } bul(vo, [xR[1] - c, zi + 0.45 * G.h]); }
  if (ouvert) for (let j = 0; j <= n; j++) {
    const xa = xL[j] - 0.4, xb = xR[j] + 0.4, zb = z0 - 0.15;
    v.poly('VUES', [[xa, 0], [xb, 0], [xb, zb], [xa, zb]], true);
    if (j === 0) v.texte('TEXTES', [(xa + xb) / 2, zb - 0.08], 'semelle : plan propre', { h: 2.0, ancre: 'c', v: 'h' });
  }
  // goussets : équerres aux angles intérieurs
  for (const [pos, zc, sg] of [['gSup', zt + c + d, -1], ['gInf', zi - c - d, 1]]) {
    const m = M1(pos); if (!m) continue;
    for (let i = 0; i < n; i++) {
      const xa = xR[i] - c - d, xb = xL[i + 1] + c + d;
      v.poly('ACIERS', [[xa + m.Lg, zc], [xa, zc], [xa, zc + sg * m.leg]]);
      v.poly('ACIERS', [[xb - m.Lg, zc], [xb, zc], [xb, zc + sg * m.leg]]);
    }
    bul(m, [xR[0] - c - d + m.Lg * 0.7, zc]);
    const r = M1(pos + 'R');
    if (r) { for (let i = 0; i < n; i++) for (const [xa, s2] of [[xR[i] - c - d, 1], [xL[i + 1] + c + d, -1]]) for (let q = 1; q <= r.nParAngle; q++) v.cercle('ACIERS_COUPES', [xa + s2 * (m.Lg * q / (r.nParAngle + 1)), zc - sg * 0.022], rp, true); bul(r, [xL[n] + c + d - m.Lg * 0.5, zc - sg * 0.022]); }
  }
  // répartition : points le long des faces
  const rTE = M1('trRepE'), rTI = M1('trRepI'), rRE = M1('raRepE'), rRI = M1('raRepI'), rP = M1('pRep');
  if (rTE) { points(c + 0.04, zT - c - 0.025, W - c - 0.04, zT - c - 0.025, rTE.s); bul(rTE, [W * 0.3, zT - c - 0.025]); }
  if (rTI) { for (let i = 0; i < n; i++) points(xR[i] + 0.04, zt + c + 0.025, xL[i + 1] - 0.04, zt + c + 0.025, rTI.s); bul(rTI, [(xR[n - 1] + xL[n]) / 2 + 0.2, zt + c + 0.025]); }
  if (rRE) { points(c + 0.04, c + 0.025, W - c - 0.04, c + 0.025, rRE.s); bul(rRE, [W * 0.3, c + 0.025]); }
  if (rRI) { for (let i = 0; i < n; i++) points(xR[i] + 0.04, zi - c - 0.025, xL[i + 1] - 0.04, zi - c - 0.025, rRI.s); bul(rRI, [(xR[n - 1] + xL[n]) / 2 + 0.2, zi - c - 0.025]); }
  if (rP) {
    for (let j = 0; j <= n; j++) for (const x of [xL[j] + c + 0.025, xR[j] - c - 0.025]) points(x, zi + 0.05, x, zt - 0.05, rP.s);
    bul(rP, [c + 0.025, zi + 0.8 * G.h]);
  }
  // bulles : deux colonnes (gauche, droite), espacées d'au moins 8 mm papier
  const E = v.etendue(), pas = 8 * e / 1000;
  const gauche = bulles.filter(q => q.p[0] < W / 2).sort((a, b) => b.p[1] - a.p[1]), droite = bulles.filter(q => q.p[0] >= W / 2).sort((a, b) => b.p[1] - a.p[1]);
  const ranger = (liste, xb, ancre) => {
    // bulles au plus près de l'ordonnée de leur cible (renvois quasi horizontaux), écartées d'au moins « pas »
    const z = []; liste.forEach((q, k) => { z.push(k === 0 ? q.p[1] : Math.min(q.p[1], z[k - 1] - pas)); });
    const bas = E.y0 - 0.1, deficit = z.length ? bas - z[z.length - 1] : 0;
    if (deficit > 0) for (let k = z.length - 1; k >= 0; k--) { z[k] = Math.max(z[k], k === z.length - 1 ? bas : z[k + 1] + pas); }
    liste.forEach((q, k) => {
      v.repere([xb, z[k]], q.m.mark, q.p);
      v.texte('TEXTES', [xb + (ancre === 'g' ? 1 : -1) * 4.5 * e / 1000, z[k]], desig(q.m), { h: 2.4, ancre, v: 'm' });
    });
  };
  ranger(gauche, E.x0 - 14 * e / 1000, 'd');
  ranger(droite, E.x1 + 14 * e / 1000, 'g');
  return v;
}

/** Coupe longitudinale dans la première cellule (axe), longueur montrée limitée à 4 m avec coupure. */
function vueCoupeLongitudinale(G, marks, h) {
  const v = new Vue('COUPE LONGITUDINALE DANS LA CELLULE 1 (partielle)'), c = h.enrobage, { zi, zt, zT, ouvert } = G;
  const Lv = Math.min(G.L > 0 ? G.L : 2, 4), M1 = p => marks.find(m => m.pos === p);
  // béton : traverse et radier, vides de la cellule
  v.poly('COFFRAGE', [[0, zt], [Lv, zt]]); v.poly('COFFRAGE', [[0, zT], [Lv, zT]]); v.ligne('COFFRAGE', [0, zt], [0, zT]);
  v.hachure([[0, zt], [Lv, zt], [Lv, zT], [0, zT]]);
  if (!ouvert) { v.poly('COFFRAGE', [[0, 0], [Lv, 0]]); v.poly('COFFRAGE', [[0, zi], [Lv, zi]]); v.ligne('COFFRAGE', [0, 0], [0, zi]); v.hachure([[0, 0], [Lv, 0], [Lv, zi], [0, zi]]); }
  // coupure
  for (const [za, zb] of ouvert ? [[zt, zT]] : [[zt, zT], [0, zi]]) v.poly('COFFRAGE', [[Lv, za - 0.05], [Lv, (za + zb) / 2 - 0.05], [Lv + 0.08, (za + zb) / 2], [Lv - 0.08, (za + zb) / 2 + 0.02], [Lv, (za + zb) / 2 + 0.07], [Lv, zb + 0.05]]);
  const ligneRep = (m, z) => { if (m) v.ligne('ACIERS', [c, z], [Lv - 0.02, z]); };
  const pts = (m, z) => { if (!m) return; for (let x = c + 0.03; x < Lv - 0.03; x += m.s) v.cercle('ACIERS_COUPES', [x, z], 0.011, true); };
  const tE = marks.find(m => m.pos === 'trExt'), tI = marks.find(m => m.pos === 'trInt'), rE = marks.find(m => m.pos === 'raExt'), rI = marks.find(m => m.pos === 'raInt');
  pts(tE, zT - c); ligneRep(M1('trRepE'), zT - c - 0.025); pts(tI, zt + c); ligneRep(M1('trRepI'), zt + c + 0.025);
  if (!ouvert) { pts(rE, c); ligneRep(M1('raRepE'), c + 0.025); pts(rI, zi - c); ligneRep(M1('raRepI'), zi - c - 0.025); }
  const items = [[tE, [Lv * 0.35, zT - c]], [M1('trRepE'), [Lv * 0.55, zT - c - 0.025]], [tI, [Lv * 0.35, zt + c]], [M1('trRepI'), [Lv * 0.55, zt + c + 0.025]],
    ...(ouvert ? [] : [[rI, [Lv * 0.35, zi - c]], [M1('raRepI'), [Lv * 0.55, zi - c - 0.025]], [rE, [Lv * 0.35, c]], [M1('raRepE'), [Lv * 0.55, c + 0.025]]])].filter(q => q[0]);
  const zTop = zT + 0.5, zBot = ouvert ? zt - 0.6 : -0.5;
  items.forEach(([m, p], k) => {
    const up = p[1] > (zi + zt) / 2, xb = 0.3 + (k % 4) * Lv / 4, zb = up ? zTop : zBot;
    v.repere([xb, zb], m.mark, [xb + 0.12, p[1]]);
    v.texte('TEXTES', [xb, zb + (up ? 0.22 : -0.22)], desig(m), { h: 2.2, ancre: 'c', v: up ? 'b' : 'h' });
  });
  if (tE) v.coteH([c + 0.03, zT], [c + 0.03 + tE.s, zT], zT + 0.2, `e = ${esp(tE.s)}`);
  v.texte('TEXTES', [-0.15, ouvert ? (zt + zT) / 2 : (zi + zt) / 2], 'tête', { h: 2.2, ancre: 'c', v: 'm', angle: 90 });
  return v;
}

export function planFerraillageCadre(res, cartouche = {}, { bloc = '' } = {}) {
  const { G, marks, parMetre, minPICF, gs, gi } = reperesCadre(res), h = res.h;
  const lignes = lignesBordereau(marks), R0 = recapitulatif(lignes), wb = 166, hl = 4.6;
  const hb = (lignes.length + 2) * hl + 6 + (R0.diam.length + 3) * 5.5;
  const phis = [...new Set(marks.map(m => m.phi))].sort((a, b) => a - b);
  const N = [
    'NOTES',
    `1. Aciers HA f_e = ${h.fe} MPa ; enrobage ${fr(h.enrobage * 100, 1)} cm. Cotes du bordereau en mm.`,
    `2. Sections calculées : onglet Cadres et portiques (${h.code === 'EC2' ? 'EN 1992' : 'BAEL 91'}) ; dispositions : guide Sétra PICF-EL.`,
    `3. Ancrages et recouvrements : ${h.code === 'EC2' ? 'EN 1992-1-1 § 8.4 et 8.7' : 'BAEL 91 A.6.1,23 (l_s = φ f_e / 4 τ_s)'} ; mandrins : ${phis.slice(0, 3).map(p => `Ø${p} r = ${fr(rayonCintrage(p), 0)} mm`).join(', ')}.`,
    `4. Faces extérieures : nappe filante + chapeaux sur nœuds ; faces intérieures : une nappe par cellule.`,
    `5. Répartition min. ${fr(minPICF)} cm²/ml (${res.ouvert ? 'traverse sup., ¼ A_s' : 'traverse sup., radier'}) ; renforts de goussets : ${fr(gs.L)} m / ${gs.n} φ₂${res.ouvert ? '' : ` et ${fr(gi.L)} m / ${gi.n} φ₂`}.`,
    '6. Équerres de gousset disposées à l’espacement double de la nappe intérieure (PICF-EL).',
    ...(Math.abs(G.biais - 90) > 1e-6 ? [`7. Biais : principaux parallèles aux têtes, répartition parallèle aux piédroits (PICF-EL, option 1).`] : []),
    ...(parMetre ? ['8. Longueur non saisie : nombres et masses pour 1 m d’ouvrage.'] : []),
    '9. Plan type à valider : encombrement des nappes, reprises de bétonnage.',
  ];
  const NN = numeroter(N), hn = NN.length * 2.2 * 1.6;
  const cp = vueCoupeArmatures(G, marks, h, 50), cl = vueCoupeLongitudinale(G, marks, h);
  let R = R0;
  const F = composer({
    titre: `${nomOuvrage(res, bloc)} — FERRAILLAGE`, cartouche,
    rangees: [[cp], [cl]],
    groupes: [{ vues: [cp], cible: 50, min: 20, refaire: e => [vueCoupeArmatures(G, marks, h, e)] }, { vues: [cl], cible: 50, min: 20 }],
    colonne: { largeur: wb + 16, hauteur: Infinity },
    poser: (F, [x, y]) => {
      const xb = F.W - 10 - wb - 3;
      ({ R } = placerBordereau(F, lignes, [xb, y + 2 + hn + 8, wb, Math.min(hb, F.H - 10 - (y + 2 + hn + 8) - 2)]));
      F.note(NN, xb, y + 2 + hn - 2.2 * 0.6, 2.2);
      F.notes[F.notes.length - 1].titreGras = true;
    },
  }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(p => '1/' + p.vue.echelle))].join(' ; ');
  F.masse = R.masse;
  return F;
}
