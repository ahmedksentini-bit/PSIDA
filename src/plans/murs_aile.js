/**
 * Plan des murs en aile d'un cadre ou d'un portique (onglet « Cadres et portiques ») : vue en plan des têtes et des quatre
 * ailes, élévation développée de l'aile la plus longue, coupe à l'enracinement (voile en T renversé), bordereau ISO 4066
 * des quatre ailes, tableau de calcul et notes. Calcul : src/cadre/murs_aile.js.
 */
import { Vue, fmtCote } from './dessin.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { longueurCoupe, recapitulatif } from './bordereau.js';
import { anchorage, massPerM } from '../rebar.js';
import { mursEnAile } from '../cadre/murs_aile.js';
import { epVoile } from '../cadre/cadre.js';
import { couperLigne } from './notes_durabilite.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const esp = s => fr(s * 100, Math.abs(s * 100 - Math.round(s * 100)) > 1e-6 ? 1 : 0);
const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;

/** Ailes d'un résultat de cadre (calcul complet { blocs, inp }) : géométrie de l'ouvrage entier et calcul des murs. */
export function ailesCadre(cadre) {
  const res = cadre.blocs[0], inp = cadre.inp, o = (inp.opts && inp.opts.ailes) || {};
  if (o.actif === false) return null;
  const g = res.cadre, ouvert = !!res.ouvert, gi = inp.geom;
  // largeur extérieure de l'ouvrage entier (tous blocs) : n B + (n − 1) e_i + 2 e_p
  const n = gi.n, W = n * gi.B + (n - 1) * (gi.ei ?? epVoile(g, 1)) + 2 * epVoile(g, 0);
  // portique : semelle du mur sous le terrain naturel (dessus des semelles du portique), décalage de son épaisseur
  const es0 = o.es ?? 0.40, er = ouvert ? es0 : g.er, zT = (ouvert ? es0 : er) + g.h + g.et, biais = res.geom.biais ?? 90;
  const h = res.h || inp.hyp;
  // ouverture L du § 2.8.1 : ouverture droite ; ouvrage multiple : entre D et 1,3 D (D portée d'une travée), retenu 1,15 D
  const geo = { W, Lo: n > 1 ? 1.15 * gi.B : gi.B, L: gi.L > 0 ? gi.L : Math.max(2, W), zT, er, biais, ep: epVoile(g, 0) };
  const R = mursEnAile(geo, { ...o, c: h.enrobage ?? 0.05, h: { code: h.code, fc28: h.fc28, fe: h.fe, sigmaS: h.sigmaS, exposition: h.exposition } });
  return { ...R, geo, h, ouvert, nCell: n };
}

/* -------------------------------------------------------------------------------------------- repères */
export function reperesAiles(A) {
  const { calc: K, h } = A, K2 = A.calc2 || A.calc, c = h.enrobage ?? 0.05, es = K.es, out = [];
  const anc = phi => anchorage(phi, { fck: h.fc28, fyk: h.fe, h: 1 });
  const nb = (l, s) => Math.max(1, Math.floor(l / s + 1e-9) + 1);
  const add = (key, m) => { const q = out.find(x => x.key === key && x.phi === m.phi && x.code === m.code && x.dims.A === m.dims.A && x.dims.B === m.dims.B && (x.dims.C || 0) === (m.dims.C || 0)); if (q) q.nombre += m.nombre; else out.push({ key, ...m }); };
  const deux = !!A.calc2;
  for (const a of A.ailes) {
    if (!a.Lw) continue;
    const Lw = a.Lw, hv = s => Math.max(a.hEnd, a.zTopS(s) - es), s2 = deux ? a.s2 : Lw;
    // zones : [début, fin, calcul] ; zone 2 au-delà de la mi-longueur du rampant
    const zones = deux ? [[c, s2, K, 'zone 1'], [s2, Lw - c, K2, 'zone 2']] : [[c, Lw - c, K, '']];
    for (const [z0, z1, Kz, nom] of zones) {
      const V = Kz.voile, S = Kz.semelle, suf = nom ? ` (${nom})` : '';
      // verticales par bandes de 1,50 m au plus (longueur de la bande à sa hauteur maximale)
      const nbB = Math.max(1, Math.ceil((z1 - z0) / 1.5 - 1e-9)), lb = (z1 - z0) / nbB, der = z1 >= Lw - c - 1e-9;
      for (let k = 0; k < nbB; k++) {
        const hk = hv(z0 + k * lb), last = der && k === nbB - 1;
        const n = Math.max(1, Math.round(lb / V.main.s) + (last ? 1 : 0)), nA = Math.max(1, Math.round(lb / V.avant.s) + (last ? 1 : 0));
        const Av = (hk + es - 2 * c) * 1000;
        add('vArr', { label: 'Voile — verticales côté terres (pied dans le talon)' + suf, phi: V.main.phi, s: V.main.s, code: '11', dims: { A: r5(Av), B: r5(Math.max(0.40, Math.min(S.b, anc(V.main.phi).lbd)) * 1000) }, nombre: n, pos: 'vArr' });
        add('vAv', { label: 'Voile — verticales parement avant (pied dans le patin)' + suf, phi: V.avant.phi, s: V.avant.s, code: '11', dims: { A: r5(Av), B: r5(Math.max(0.30, Math.min(S.a - c, 0.50)) * 1000) }, nombre: nA, pos: 'vAv' });
      }
      // semelle de la zone : transversales inférieures (patin), supérieures (talon), longitudinales des deux nappes
      const lz = z1 - z0 + (z0 <= c + 1e-9 ? 0 : 0);
      add('sInf', { label: 'Semelle — transversales inférieures (patin)' + suf, phi: S.patin.choix.phi, s: S.patin.choix.s, code: '00', dims: { A: r5((S.B - 2 * c) * 1000) }, nombre: nb(lz, S.patin.choix.s), pos: 'sInf' });
      add('sSup', { label: 'Semelle — transversales supérieures (talon)' + suf, phi: S.talon.choix.phi, s: S.talon.choix.s, code: '00', dims: { A: r5((S.B - 2 * c) * 1000) }, nombre: nb(lz, S.talon.choix.s), pos: 'sSup' });
      add('sLong', { label: 'Semelle — longitudinales (deux nappes)' + suf, phi: S.rep.phi, s: S.rep.s, code: '00', dims: { A: r5((lz + (deux ? anc(S.rep.phi).l0 / 2 : 0)) * 1000) }, nombre: 2 * nb(S.B - 2 * c, S.rep.s), pos: 'sLong' });
    }
    // jonction solution 1 : face avant tendue au voisinage du piédroit — verticales avant de la section des verticales côté terres sur 1,00 m
    if (A.jonction === 'sol1') {
      const V = K.voile, l = Math.min(1.0, Lw / 2);
      add('vJn', { label: 'Voile — face avant, jonction avec le piédroit (sur 1,00 m)', phi: V.main.phi, s: V.main.s, code: '11', dims: { A: r5((hv(0) + es - 2 * c) * 1000), B: r5(Math.max(0.30, Math.min(K.semelle.a - c, 0.50)) * 1000) }, nombre: Math.max(1, Math.round(l / V.main.s)), pos: 'vJn' });
    }
    // horizontales des deux faces, par groupes de trois lits (calcul de la zone 1)
    const V1 = K.voile, lits = []; for (let z = es + 0.10; z <= a.zTop0 - c + 1e-9; z += V1.horiz.s) lits.push(z);
    for (let k = 0; k < lits.length; k += 3) {
      const z = lits[k], sz = z <= a.zTopS(Lw) ? Lw : a.lr + (a.zTop0 - z) / a.pente, lz = Math.min(Lw, sz) - 2 * c, ng = Math.min(3, lits.length - k);
      if (lz < 0.30) continue;
      add('hor', { label: 'Voile — horizontales (deux faces)', phi: V1.horiz.phi, s: V1.horiz.s, code: '00', dims: { A: r5(lz * 1000) }, nombre: 2 * ng, pos: 'hor' });
    }
    add('uT', { label: 'Voile — U de couronnement', phi: 10, s: 0.20, code: '21', dims: { A: 300, B: r5((K.eT - 2 * c) * 1000), C: 300 }, nombre: nb(Lw - 2 * c, 0.20), pos: 'uT' });
  }
  const ordre = ['vArr', 'vAv', 'vJn', 'hor', 'uT', 'sInf', 'sSup', 'sLong'];
  out.sort((p, q) => ordre.indexOf(p.key) - ordre.indexOf(q.key) || q.dims.A - p.dims.A);
  out.forEach((m, k) => { m.mark = k + 1; m.L = r25(longueurCoupe(m.code, m.dims, m.phi)); m.total = m.L / 1000 * m.nombre; m.masse = m.total * massPerM(m.phi); });
  return out;
}
const lignesBordereau = marks => marks.map(m => ({ repere: String(m.mark), mark: m.mark, phi: m.phi, code: m.code, A: m.dims.A, B: ['11', '21'].includes(m.code) ? m.dims.B : null, C: m.code === '21' ? m.dims.C : null, L: m.L, nombre: m.nombre, total: m.total, masse: m.masse }));

/* ------------------------------------------------------------------------------------------------ vues */
function vuePlan(A) {
  const { geo, calc: K } = A, v = new Vue('VUE EN PLAN — TÊTES ET MURS EN AILE', { echelle: 100 }), b = geo.biais * Math.PI / 180;
  const P = (u, x) => [u + x * Math.cos(b), -x * Math.sin(b)];
  v.poly('COFFRAGE', [P(0, 0), P(geo.L, 0), P(geo.L, geo.W), P(0, geo.W)], true);
  v.ligne('AXES', P(-1.5, geo.W / 2), P(geo.L + 1.5, geo.W / 2));
  for (const a of A.ailes) {
    if (!a.Lw) continue;
    const lat = a.cote === 'gauche' ? 1 : -1, nw = [-a.dir[1], a.dir[0]];
    const side = (nw[1] * lat > 0 ? 1 : -1), n = [side * nw[0], side * nw[1]];   // normale vers l'extérieur (terres)
    const r0 = [a.root[0] + a.dir[0] * A.joint, a.root[1] + a.dir[1] * A.joint], r1 = [r0[0] + a.dir[0] * a.Lw, r0[1] + a.dir[1] * a.Lw];
    const off = (p, d) => [p[0] + n[0] * d, p[1] + n[1] * d];
    v.poly('COFFRAGE', [r0, r1, off(r1, K.eT), off(r0, K.eB)], true);
    // semelle (tirets) : patin côté écoulement, talon côté terres
    const S = K.semelle, S2 = (A.calc2 || K).semelle, rm = [r0[0] + a.dir[0] * (A.calc2 ? a.s2 : a.Lw), r0[1] + a.dir[1] * (A.calc2 ? a.s2 : a.Lw)];
    v.poly('VUES', [off(r0, -S.a), off(rm, -S.a), off(rm, K.eB + S.b), off(r0, K.eB + S.b)], true);
    if (A.calc2) { const e2 = A.calc2.eB; v.poly('VUES', [off(rm, -S2.a), off(r1, -S2.a), off(r1, e2 + S2.b), off(rm, e2 + S2.b)], true); }
    v.texte('TEXTES', off([(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2], K.eB + S.b + 0.5), `aile ${a.label} : ${fr(a.Lw)} m, θ = ${fr(a.theta, 1)}°`, { h: 2.0, ancre: 'c', v: 'm' });
  }
  v.texte('TEXTES', P(-0.5, geo.W / 2), 'amont', { h: 2.2, ancre: 'd', v: 'm' });
  v.texte('TEXTES', P(geo.L + 0.5, geo.W / 2), 'aval', { h: 2.2, ancre: 'g', v: 'm' });
  v.cote(P(0, geo.W), P(geo.L, geo.W), -0.8, fmtCote(geo.L));
  return v;
}

/** Élévation développée (côté écoulement) de l'aile la plus longue : s le long du mur depuis l'enracinement. */
function vueElevation(A, a, marks) {
  const K = A.calc, es = K.es, v = new Vue(`ÉLÉVATION DÉVELOPPÉE — AILE ${a.label.toUpperCase()}`, { echelle: 50 }), Lw = a.Lw;
  const zTop = s => a.zTopS(s), c = A.h.enrobage ?? 0.05, sF = a.lr + (a.zTop0 - zTop(Lw)) / a.pente;
  v.poly('COFFRAGE', [[0, 0], [Lw, 0], [Lw, es], [0, es]], true);
  v.poly('COFFRAGE', [[0, es], [Lw, es], [Lw, zTop(Lw)], [Math.min(sF, Lw), zTop(Lw)], [a.lr, a.zTop0], [0, a.zTop0]], true);
  if (a.lr > 0) v.coteH([0, a.zTop0], [a.lr, a.zTop0], a.zTop0 + 0.45, `revanche ${fr(a.lr)}`);
  if (A.calc2) { v.ligne('AXES', [a.s2, -0.2], [a.s2, zTop(a.s2) + 0.3]); v.texte('TEXTES', [a.s2 / 2, -0.75], 'ZONE 1', { h: 2.2, ancre: 'c' }); v.texte('TEXTES', [(a.s2 + Lw) / 2, -0.75], 'ZONE 2', { h: 2.2, ancre: 'c' }); v.coteH([0, 0], [a.s2, 0], -0.25, fr(a.s2)); }
  v.ligne('TERRAIN', [-0.5, A.geo.er], [Lw + 1, A.geo.er]); v.texte('TEXTES', [Lw + 0.2, A.geo.er + 0.05], 'TN (dessus du radier)', { h: 2.0, ancre: 'g', v: 'b' });
  v.poly('VUES', [[0, a.zTop0 + 0.20], [a.lr, a.zTop0 + 0.20], [Math.min(sF, Lw), zTop(Lw) + 0.20], [Lw, zTop(Lw) + 0.20]]); v.texte('TEXTES', [Lw * 0.4, zTop(Lw * 0.4) + 0.32], `trace du talus (pente 1/${fr(A.m, 1)} perpendiculaire aux têtes)`, { h: 2.0, ancre: 'c', v: 'b' });
  v.proprete(0, Lw, 0, 0.10);
  const mV = marks.find(m => m.pos === 'vAv'), mH = marks.find(m => m.pos === 'hor');
  if (mV) for (let s = c; s <= Lw - c + 1e-9; s += Math.max(mV.s, (Lw - 2 * c) / 40)) v.ligne('ACIERS', [s, c], [s, zTop(s) - c]);
  if (mH) for (let z = es + 0.10; z <= a.zTop0 - c + 1e-9; z += mH.s) { const ls = Math.min(Lw - c, z <= zTop(Lw) ? Lw : a.lr + (a.zTop0 - z) / a.pente - c); if (ls > c + 0.1) v.ligne('ACIERS', [c, z], [ls, z]); }
  if (mV) v.repere([Lw * 0.3, -0.6], mV.mark, [Lw * 0.3, es + 0.3]);
  if (mH) v.repere([-0.6, es + 0.5], mH.mark, [c + 0.2, es + 0.5]);
  v.coteH([0, 0], [Lw, 0], -0.45, fr(Lw));
  v.coteV([0, 0], [0, a.zTop0], -0.9, fr(a.zTop0));
  v.coteV([Lw, 0], [Lw, zTop(Lw)], Lw + 0.5, fr(zTop(Lw)));
  v.coteV([0, 0], [0, es], -0.45, fr(es));
  return v;
}

/** Coupe A-A à l'enracinement, normale au mur : patin à gauche (écoulement), talon à droite (terres). */
function vueCoupe(A, marks) {
  const K = A.calc, S = K.semelle, es = K.es, hv = K.hv, c = A.h.enrobage ?? 0.05, v = new Vue('COUPE A-A — À L\'ENRACINEMENT', { echelle: 25 });
  const xa = S.a, xb = S.a + K.eB, zt = es + hv;
  // voile : parement arrière vertical, parement avant au fruit
  v.poly('COFFRAGE', [[0, 0], [S.B, 0], [S.B, es], [xb, es], [xb, zt], [xb - K.eT, zt], [xa, es], [0, es]], true);
  v.proprete(0, S.B, 0, 0.10);
  v.terrain([[xb, zt + 0.20], [S.B + 1.0, zt + 0.20]], 1); v.texte('TEXTES', [S.B + 0.1, zt + 0.28], 'remblai', { h: 2.2, ancre: 'g', v: 'b' });
  v.terrain([[-0.8, A.geo.er], [xa - 0.05, A.geo.er]], -1);
  const M = k => marks.filter(m => m.pos === k).sort((p, q) => q.dims.A - p.dims.A)[0], bulles = [];
  const mA = M('vArr'), mAv = M('vAv'), mH = M('hor'), mU = M('uT'), mI = M('sInf'), mSu = M('sSup'), mL = M('sLong');
  const zi = c, zs = es - c;
  if (mA) { v.poly('ACIERS', [[xb - c, zt - c], [xb - c, zi], [xb - c + mA.dims.B / 1000, zi]]); bulles.push([mA, [xb - c, (es + zt) / 2]]); }
  if (mAv) { const xt = xb - K.eT + c; v.poly('ACIERS', [[xt, zt - c], [xa + c, es + 0.02], [xa + c, zi + 0.02], [xa + c - mAv.dims.B / 1000, zi + 0.02]]); bulles.push([mAv, [xa + c + 0.03, es + 0.4]]); }
  if (mH) for (let z = es + 0.10; z < zt - c; z += mH.s) { v.cercle('ACIERS_COUPES', [xb - c - 0.015, z], 0.008, true); const xf = xa + (xb - K.eT - xa) * (z - es) / hv + c + 0.015; v.cercle('ACIERS_COUPES', [xf, z], 0.008, true); }
  if (mH) bulles.push([mH, [xb - c - 0.015, es + 0.5]]);
  if (mU) { v.poly('ACIERS', [[xb - c, zt - c - 0.30], [xb - c, zt - c], [xb - K.eT + c, zt - c], [xb - K.eT + c, zt - c - 0.30]]); bulles.push([mU, [xb - K.eT / 2, zt - c]]); }
  if (mI) { v.ligne('ACIERS', [c, zi], [S.B - c, zi]); bulles.push([mI, [S.a / 2, zi]]); }
  if (mSu) { v.ligne('ACIERS', [c, zs], [S.B - c, zs]); bulles.push([mSu, [xb + S.b / 2, zs]]); }
  if (mL) for (let x = c + 0.03; x <= S.B - c - 0.03 + 1e-9; x += mL.s) { v.cercle('ACIERS_COUPES', [x, zi + 0.02], 0.008, true); v.cercle('ACIERS_COUPES', [x, zs - 0.02], 0.008, true); }
  if (mL) bulles.push([mL, [S.B - c - 0.05, zs - 0.02]]);
  const E = v.etendue(), xr = S.B + 1.4;
  bulles.sort((p, q) => q[1][1] - p[1][1]).forEach(([m, p], k, arr) => {
    const z = zt + 0.1 - k * Math.max(0.30, (zt + 0.2) / Math.max(1, arr.length - 1));
    v.repere([xr, z], m.mark, p);
    v.texte('TEXTES', [xr + 0.2, z], `HA${m.phi}${m.s ? ' e=' + esp(m.s) : ''}`, { h: 2.4, ancre: 'g', v: 'm' });
  });
  v.coteH([0, 0], [S.B, 0], -0.45, fr(S.B)); v.coteH([0, 0], [xa, 0], -0.25, fr(xa)); v.coteH([xb, 0], [S.B, 0], -0.25, fr(S.b));
  v.coteH([xb - K.eT, zt], [xb, zt], zt + 0.45, fr(K.eT)); v.coteH([xa, es], [xb, es], es + 0.25, fr(K.eB));
  v.coteV([S.B, 0], [S.B, es], S.B + 0.35, fr(es)); v.coteV([xb, es], [xb, zt], -0.7, fr(hv));
  void E;
  return v;
}

/* -------------------------------------------------------------------------------------------- feuille */
export function planMursAile(cadre, cartouche = {}) {
  const A = ailesCadre(cadre);
  if (!A) throw new Error('murs en aile non demandés (onglet Cadres et portiques)');
  if (!A.ailes.some(a => a.Lw)) throw new Error('murs en aile : longueur indéterminée (mur parallèle aux têtes, sans chute de talus)');
  const K = A.calc, h = A.h, marks = reperesAiles(A), lignes = lignesBordereau(marks), R0 = recapitulatif(lignes);
  const wb = 166, hb = (lignes.length + 2) * 4.6 + 6 + (R0.diam.length + 3) * 5.5;
  const V = K.voile, S = K.semelle, kN = x => fr(x, 1), cm2 = x => fr(x, 2);
  const tc = { titre: `CALCUL DES MURS EN AILE (par mètre, section d'enracinement, ${h.code === 'EC2' ? 'EN 1992-1-1' : 'BAEL 91'})`, hl: 4.4, h: 1.8, cols: [{ t: 'Grandeur', w: 100, a: 'g' }, { t: 'Valeur', w: 66, a: 'd' }],
    lignes: [
      ['Ailes (θ depuis l\'axe ; longueur)', A.ailes.map(a => `${fr(a.theta, 1)}° ; ${fr(a.Lw)}`).join(' / ')],
      ['Surfaces vues gauche / droite (§ 2.8.1, A = L_w sin θ)', A.surfacesVues.map(q => `${q.end} ${fr(q.Ag)} / ${fr(q.Ad)} m (écart ${fr(q.ecart * 100, 0)} %)`).join(' ; ')],
      ['Hauteur du voile / épaisseur tête, base', `${fr(K.hv)} / ${fr(K.eT)}, ${fr(K.eB)} m`],
      ['Base : fruit (e_h + f h)/(1 + f) / abaque e_m (DT422)', `${fr(K.eFruit, 3)} / ${fr(K.em, 3)} m`],
      ['Poussée K_a, γ, q', `${fr(K.Ka)} ; ${fr(K.gamma, 0)} kN/m³ ; ${fr(K.q, 0)} kN/m²`],
      ['M_G / M_Q / M_u / M_ser (pied du voile)', `${kN(V.Mg)} / ${kN(V.Mq)} / ${kN(V.Mu)} / ${kN(V.Ms)} kN·m/m`],
      ['Verticales côté terres : requis / retenu', `${cm2(V.As)} cm²/ml → HA${V.main.phi} e=${esp(V.main.s)} (${cm2(V.main.As)})`],
      ['Effort tranchant', V.T.ok ? 'vérifié sans armatures' : 'NON VÉRIFIÉ'],
      ['Semelle B (patin a, talon b) × épaisseur', `${fr(S.B)} (${fr(S.a)} ; ${fr(S.b)}) × ${fr(K.es)} m`],
      ['Renversement / glissement (≥ 1,5)', `${fr(S.FSr)} / ${fr(S.FSg)}`],
      ['Excentricité (G + Q) / B/6', `${fr(S.ex, 3)} / ${fr(S.B / 6, 3)} m`],
      ['σ_max / σ_min / σ_réf (G + Q)', `${kN(S.s1)} / ${kN(S.s2)} / ${kN(S.qref)} kPa${K.qadm > 0 ? ` ≤ ${fr(K.qadm, 0)}` : ''}`],
      ['Talon / patin : M_u ; aciers', `${kN(S.MtalU)} ; HA${S.talon.choix.phi} e=${esp(S.talon.choix.s)} / ${kN(S.MpatU)} ; HA${S.patin.choix.phi} e=${esp(S.patin.choix.s)}`],
      ...(A.calc2 ? (K2 => [
        ['Zone 2 : hauteur du voile ; épaisseur à la base', `${fr(K2.hv)} m ; ${fr(K2.eB)} m`],
        ['Zone 2 : verticales côté terres ; semelle B (a ; b)', `HA${K2.voile.main.phi} e=${esp(K2.voile.main.s)} ; ${fr(K2.semelle.B)} (${fr(K2.semelle.a)} ; ${fr(K2.semelle.b)}) m`],
        ['Zone 2 : renversement / glissement ; σ_réf', `${fr(K2.semelle.FSr)} / ${fr(K2.semelle.FSg)} ; ${kN(K2.semelle.qref)} kPa ${K2.ok ? '✓' : '✗'}`],
      ])(A.calc2) : []),
      ['Jonction avec le piédroit (figure 71)', A.jonction === 'sol1' ? 'solution 1 : joint ouvert, face avant renforcée sur 1,00 m' : 'solution 2 : joint plan, fruit initial majoré'],
    ] };
  const hC = (tc.lignes.length + 2) * tc.hl;
  const N = ['NOTES',
    ...couperLigne(`1. Béton f_c28 = ${h.fc28} MPa, aciers HA f_e = ${h.fe} MPa, enrobage ${fr((h.enrobage ?? 0.05) * 100, 0)} cm. Murs indépendants du cadre : joint de 2 cm au droit des piédroits.`, 110),
    ...couperLigne(`2. Implantation : guide Sétra « Ponts-cadres et portiques » (1992) § 2.8.1 — angles depuis l'axe de l'ouvrage${A.prop ? `, proposition α = 15 + 0,03 L², β = 0,008 (φ + 25) α (gr) : α = ${fr(A.prop.alpha, 1)}°, β = ${fr(A.prop.beta, 1)}°, β au coin aigu de la tête pour égaliser les surfaces vues (figure 35)${A.nCell > 1 ? ', L = 1,15 D (ouvrage multiple)' : ''}` : ''} ; arête 0,20 m sous la trace du talus ; dépassement du pied 0,20 m.`, 110),
    ...couperLigne('3. Calcul à l\'enracinement (hauteur maximale) : armatures et semelle conservées sur toute la longueur ; poussée active et surcharge de remblai ; voile en T renversé fondé au niveau de la sous-face du radier ; épaisseur à la base ≥ e_m de l\'abaque des murs en aile et semelle de même épaisseur (Sétra PICF-EL, DT422, § 2.1).', 110),
    ...couperLigne(`4. Revanche horizontale de ${fr(A.lr)} m en tête (sous la corniche, figure 48)${A.calc2 ? ' ; zone 2 au-delà de la mi-longueur du rampant, calculée à sa hauteur maximale (semelle de largeur variable, figure 70)' : ''} ; verticales découpées par bandes de 1,50 m suivant la hauteur du mur ; horizontales par groupes de trois lits, longueur du lit le plus bas.`, 110),
    ...couperLigne(A.jonction === 'sol1' ? '5. Jonction solution 1 (figure 71) : joint ouvert devant l\'extrémité du piédroit ; la rotation du mur, gênée, tend la face avant : verticales avant de la section des verticales côté terres sur 1,00 m (disposition PSIDA, ferraillage non chiffré par le guide).' : '5. Jonction solution 2 (figure 71) : joint plan, réservé aux bons terrains ; donner au parement avant un fruit initial supérieur au fruit final (rotation du mur sous la poussée).', 110),
    ...(K.qadm > 0 ? [] : couperLigne('6. Contrainte admissible du sol non saisie : contrainte de référence à comparer à la portance (onglet Cadres, profil de sol).', 110)),
    ...(K.ok && (!A.calc2 || A.calc2.ok) ? [] : ['7. ATTENTION — vérifications non satisfaites : voir le tableau de calcul.']),
  ], hn = N.length * 2.2 * 1.6;
  const aL = A.ailes.filter(a => a.Lw).sort((p, q) => q.Lw - p.Lw)[0];
  const pl = vuePlan(A), el = vueElevation(A, aL, marks), cp = vueCoupe(A, marks);
  let R = R0;
  const F = composer({ titre: `${cadre.blocs[0].ouvert ? 'PIPO' : 'PICF'}${cadre.inp.geom.nom ? ' ' + cadre.inp.geom.nom.toUpperCase() : ''} — MURS EN AILE — COFFRAGE ET FERRAILLAGE`, cartouche,
    rangees: [[pl, cp], [el]],
    groupes: [{ vues: [pl], cible: 100, min: 50 }, { vues: [el], cible: 50, min: 20 }, { vues: [cp], cible: 50, min: 10 }],
    colonne: { largeur: wb + 16, hauteur: 2 + hb + 6 + hC + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      const xb = F.W - 10 - wb - 3;
      ({ R } = placerBordereau(F, lignes, [xb, y + 2, wb, hb]));
      F.tableau(tc, xb, y + 2 + hb + 6);
      F.note(N, xb, y + 2 + hb + 6 + hC + 6 + hn - 2.2 * 0.6, 2.2);
      F.notes[F.notes.length - 1].titreGras = true;
    } }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(q => '1/' + q.vue.echelle))].join(' ; ');
  F.masse = R.masse; F.ailes = { ...A, marks };
  return F;
}
