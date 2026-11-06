/**
 * Dalle de transition d'une culée : calcul simplifié et plan de ferraillage avec nomenclature (une feuille par culée).
 *
 * Disposition (plans d'exécution relus, autoroute Tunis–Jelma lot 7, OA68 FER-30 et NOM-30, et guide Sétra « Dalles de
 * transition des ponts-routes », 1984) : dalle de L × e posée d'un côté sur le corbeau du garde-grève, de l'autre sur le
 * remblai par l'intermédiaire d'un béton de propreté, dessus à 0,30 m sous la chaussée au droit du garde-grève, pente de 5 %
 * vers le remblai ; joint de 2 cm (polystyrène) contre le garde-grève, goujons dans le corbeau ; deux nappes, U de rive
 * fermant les nappes sur les quatre bords, chaises de la nappe supérieure.
 *
 * Calcul : src/supports/dalle_transition.js (dalle sur deux appuis simples, LM1 et LM2, largeurs efficaces du DAfStb
 * Heft 240) ; l'épaisseur y est choisie (0,30 m, portée à 0,35–0,45 m si nécessaire) et reprise par geometrieAppui.
 * Aciers transversaux ≥ 20 % des aciers principaux (EN 1992-1-1 § 9.3.1.1(2)) : les moments transversaux sous charges
 * concentrées ne sont pas calculés (calcul de plaque à faire si la dalle est large ou très biaise).
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { longueurCoupe, recapitulatif } from './bordereau.js';
import { geometrieAppui, dalleTransition, alphasTrafic } from './appuis.js';
import { couperLigne, classeBeton, texteRecouvrements, enrobagesAppuis } from './notes_durabilite.js';
import { calculDalleTransition, corbeauDalle } from '../supports/dalle_transition.js';
import { anchorage, massPerM, chooseBars } from '../rebar.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const esp = s => fr(s * 100, Math.abs(s * 100 - Math.round(s * 100)) > 1e-6 ? 1 : 0);
const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;
const LMAX = 12;

/** Géométrie et calcul de la dalle de transition de la culée i (null si la culée n'en a pas). */
export function dalleTransitionCulee(st, i) {
  const A = geometrieAppui(st, i); if (A.kind !== 'culee' || !A.dalle) return null;
  const DT = dalleTransition(A), { c, cS } = enrobagesAppuis(st, A.mat), mat = A.mat;
  const al = alphasTrafic(st);
  const psi = (A.G.psiL && A.G.psiL[i]) || 100, sinP = Math.sin(psi * Math.PI / 200), cotP = Math.cos(psi * Math.PI / 200) / sinP;
  const B = A.dalle.B, K = calculDalleTransition({ L: DT.L, e: DT.e, B, hc0: A.zT + A.hGG - DT.z0, pente: DT.pente, fck: mat.fck, fyk: mat.fyk, cSup: c, cInf: cS, aQ: al.aQ, aq1: al.aq1 });
  // corbeau : console courte sous la réaction ELU de la dalle (aciers posés avec le garde-grève)
  const eGG = A.xGGav - A.xGGar, Kc = corbeauDalle({ FEd: K.corbeau.ELU, ac: 0.15, hc: 0.40, c, fck: mat.fck, fyk: mat.fyk });
  Kc.tirant = chooseBars(Kc.As, { phiMin: 12, phiMax: 16, sMax: 0.20, sMin: 0.10 }); Kc.cadres = chooseBars(Kc.lien, { phiMin: 10, phiMax: 12, sMax: 0.20, sMin: 0.10 });
  return { A, DT, K, Kc, eGG, c, cS, mat, psi, sinP, cotP, B, Bk: B / sinP };
}

/** Lignes d'appui (culées) qui portent une dalle de transition. */
export function culeesAvecDalle(st) {
  const s = st && st.supports; if (!s || !s.lines || st.supportsError) return [];
  const n = s.lines.length, out = [];
  for (const i of [0, n - 1]) { const sp = (s.spLigne && s.spLigne[i]) || s.sp; if (sp && sp.culee && sp.culee.dalle && !out.includes(i)) out.push(i); }
  return out;
}

/** Repères de la dalle de transition (mêmes champs que les repères des appuis). */
export function reperesDalleTransition(D) {
  const { K, c, cS, mat, sinP, B, Bk, DT } = D, L = DT.L, e = DT.e, out = []; let k = 0;
  const add = m => { out.push({ mark: ++k, ...m }); };
  const anc = phi => anchorage(phi, { fck: mat.fck, fyk: mat.fyk, h: 1 });
  const nb = (long, s) => Math.floor(long / s + 1e-9) + 1;
  // nappe inférieure : principales // à l'axe (lit extérieur), répartition // au garde-grève (lit intérieur)
  add({ label: 'Nappe inférieure — principales // axe', phi: K.inf.phi, s: K.inf.s, code: '00', dims: { A: (L - 2 * c) * 1000 }, nombre: nb(B - 2 * c, K.inf.s), req: K.As.requis, prov: K.inf.As, pos: 'infL' });
  add({ label: 'Nappe inférieure — répartition // garde-grève', phi: K.rep.phi, s: K.rep.s, code: '00', dims: { A: (Bk - 2 * c) * 1000 }, nombre: nb((L - 2 * c) * sinP, K.rep.s), req: 0.2 * K.inf.As, prov: K.rep.As, pos: 'infT' });
  add({ label: 'Nappe supérieure — // axe', phi: K.sup.phi, s: K.sup.s, code: '00', dims: { A: (L - 2 * c) * 1000 }, nombre: nb(B - 2 * c, K.sup.s), prov: K.sup.As, pos: 'supL' });
  add({ label: 'Nappe supérieure — // garde-grève', phi: K.sup.phi, s: K.sup.s, code: '00', dims: { A: (Bk - 2 * c) * 1000 }, nombre: nb((L - 2 * c) * sinP, K.sup.s), prov: K.sup.As, pos: 'supT' });
  // U de rive fermant les nappes : bords longitudinaux et abouts (corbeau et remblai)
  const phiU = 10, legU = Math.max(0.30, anc(phiU).lbd), hU = e - c - cS;
  add({ label: 'U de rive — bords longitudinaux', phi: phiU, s: 0.20, code: '21', dims: { A: legU * 1000, B: hU * 1000, C: legU * 1000 }, nombre: 2 * nb(L - 2 * c, 0.20), pos: 'uL' });
  add({ label: 'U de rive — abouts (corbeau, remblai)', phi: phiU, s: 0.20, code: '21', dims: { A: legU * 1000, B: hU * 1000, C: legU * 1000 }, nombre: 2 * nb(Bk - 2 * c, 0.20), pos: 'uT' });
  // chaises de la nappe supérieure : une par m²
  const hCh = e - c - cS - (K.inf.phi + K.rep.phi + K.sup.phi) / 1000;
  add({ label: 'Chaises de la nappe supérieure (1 par m²)', phi: 12, code: '21', dims: { A: 200, B: Math.max(0.05, hCh) * 1000, C: 200 }, nombre: Math.ceil(L * B - 1e-9), pos: 'ch' });
  // goujons dans le corbeau (articulation de la dalle, effort horizontal)
  add({ label: 'Goujons dans le corbeau', phi: 20, s: 0.50, code: '00', dims: { A: 600 }, nombre: nb(Bk - 0.50, 0.50), pos: 'gj' });
  // corbeau (EN 1992-1-1 annexe J.3) : tirant en L ancré dans le garde-grève, U horizontaux (≥ 0,5 A_s)
  if (D.Kc) {
    const t = D.Kc.tirant, u = D.Kc.cadres, eG = D.eGG || 0.30;
    add({ label: 'Corbeau — tirant (ancré dans le garde-grève)', phi: t.phi, s: t.s, code: '11', dims: { A: (0.30 + eG - 2 * c) * 1000, B: Math.max(0.40, anc(t.phi).lbd) * 1000 }, nombre: nb(Bk - 2 * c, t.s), req: D.Kc.As, prov: t.As, pos: 'cbT' });
    add({ label: 'Corbeau — U horizontaux', phi: u.phi, s: u.s, code: '21', dims: { A: (0.10 + eG - c) * 1000, B: 100, C: (0.10 + eG - c) * 1000 }, nombre: nb(Bk - 2 * c, u.s), req: D.Kc.lien, prov: u.As, pos: 'cbU' });
  }
  for (const m of out) {
    const dd = { A: r5(m.dims.A || 0), B: r5(m.dims.B || 0), C: r5(m.dims.C || 0) };
    m.dims = dd; m.L = r25(longueurCoupe(m.code, dd, m.phi));
  }
  // barres de plus de 12 m : pièces égales recouvertes de l₀
  for (const q of out) {
    if (q.code !== '00') continue;
    const Lc = q.L / 1000; if (Lc <= LMAX + 1e-9) continue;
    const l0 = anc(q.phi).l0, n = Math.ceil((Lc - l0) / (LMAX - l0) - 1e-9);
    q.dims = { A: r5((Lc + (n - 1) * l0) / n * 1000) }; q.L = r25(q.dims.A); q.nombre *= n; q.label += ` — ${n} pièces, recouvrement ${fr(l0)} m`; q.pieces = n;
  }
  for (const m of out) { m.total = m.L / 1000 * m.nombre; m.masse = m.total * massPerM(m.phi); }
  return out;
}

const desig = m => (m.pos === 'ch' ? `chaises HA${m.phi} (1/m²)` : m.pos === 'gj' ? `goujons HA${m.phi} L=${fr(m.L / 1000)} e=${esp(m.s)}` : m.pos === 'cbT' ? `corbeau : tirant HA${m.phi} e=${esp(m.s)}` : m.pos === 'cbU' ? `corbeau : U HA${m.phi} e=${esp(m.s)}` : m.pos.startsWith('u') ? `U HA${m.phi} e=${esp(m.s)}` : `HA${m.phi} e=${esp(m.s)}`);
const lignesBordereau = marks => marks.map(m => ({ repere: String(m.mark), mark: m.mark, phi: m.phi, code: m.code, A: m.dims.A, B: ['11', '21', '51'].includes(m.code) ? m.dims.B : null, C: ['21', '51'].includes(m.code) ? m.dims.C : null, L: m.L, nombre: m.nombre, total: m.total, masse: m.masse }));

/* ------------------------------------------------------------------------------------------ vues */
function bullesADroite(v, bulles) {
  const E = v.etendue(), xb = E.x1 + 0.5;
  bulles.sort((a, b) => b.p[1] - a.p[1]).forEach((q, k, arr) => {
    const z = E.y1 - 0.1 - k * Math.max(0.28, (E.y1 - E.y0 - 0.2) / Math.max(1, arr.length - 1));
    v.repere([xb, z], q.m.mark, q.p);
    v.texte('TEXTES', [xb + 0.22, z], desig(q.m), { h: 2.4, ancre: 'g', v: 'm' });
  });
}

/** Coupe A-A dans l'axe : garde-grève à gauche, remblai à droite ; u depuis le dos du garde-grève. */
function coupeLongitudinale(D, marks) {
  const { DT, A, c, cS } = D, L = DT.L, e = DT.e, p = DT.pente, z0 = DT.z0, v = new Vue('COUPE A-A — DANS L\'AXE DE L\'OUVRAGE', { echelle: 25 });
  const M = k => marks.find(m => m.pos === k), zt = u => z0 - p * u, zb = u => zt(u) - e;
  // garde-grève (amorce), corbeau, chaussée
  const zr = A.zT + A.hGG, zc = z0 - e;
  v.poly('COFFRAGE', [[-0.30, zr], [0, zr], [0, zc - 0.40], [0.30, zc - 0.10], [0.30, zc], [0, zc]], false);
  v.ligne('COFFRAGE', [-0.30, zr], [-0.30, zc - 0.70]); v.ligne('COFFRAGE', [0, zc - 0.40], [0, zc - 0.70]);
  v.texte('TEXTES', [-0.15, zc - 0.85], 'garde-grève', { h: 2.2, ancre: 'c' });
  v.texte('TEXTES', [0.32, zc - 0.25], 'corbeau', { h: 2.2, ancre: 'g' });
  v.ligne('VUES', [-0.30, zr], [L + 0.6, zr]); v.texte('TEXTES', [L * 0.75, zr + 0.06], 'chaussée', { h: 2.2, ancre: 'c' });
  // dalle (joint de 2 cm contre le garde-grève), béton de propreté au-delà du corbeau
  const pd = [[0.02, zt(0.02)], [L, zt(L)], [L, zb(L)], [0.02, zb(0.02)]];
  v.poly('COFFRAGE', pd, true);
  v.poly('HACHURES', [[0, zt(0)], [0.02, zt(0.02)], [0.02, zb(0.02)], [0, zb(0)]], true);
  v.texte('TEXTES', [0.05, zt(0) + 0.32], 'joint polystyrène 2 cm', { h: 2.0, ancre: 'g' });
  v.poly('COFFRAGE', [[0.30, zb(0.30)], [L + 0.10, zb(L + 0.10)], [L + 0.10, zb(L + 0.10) - 0.10], [0.30, zb(0.30) - 0.10]], true);
  v.texte('TEXTES', [L * 0.55, zb(L * 0.55) - 0.30], 'béton de propreté 10 cm sur remblai compacté', { h: 2.0, ancre: 'c' });
  const bulles = [], bul = (m, q) => m && bulles.push({ m, p: q });
  // nappes : inférieure (principales en trait, répartition en points), supérieure ; U aux abouts
  const ui = 0.02 + c, uf = L - c, zi = u => zb(u) + cS, zs = u => zt(u) - c;
  const mI = M('infL'), mT = M('infT'), mS = M('supL'), mS2 = M('supT'), mU = M('uT'), mG = M('gj');
  if (mI) { v.poly('ACIERS', [[ui, zi(ui)], [uf, zi(uf)]]); bul(mI, [ui + 0.55 * (uf - ui), zi(ui + 0.55 * (uf - ui))]); }
  if (mS) { v.poly('ACIERS', [[ui, zs(ui)], [uf, zs(uf)]]); bul(mS, [ui + 0.35 * (uf - ui), zs(ui + 0.35 * (uf - ui))]); }
  const pts = (m, z, dz) => { if (!m) return; const ds = m.s / D.sinP, n = Math.min(60, Math.floor((uf - ui) / ds)); for (let k = 0; k <= n; k++) { const u = ui + 0.02 + k * (uf - ui - 0.04) / n; v.cercle('ACIERS_COUPES', [u, z(u) + dz], 0.010, true); } };
  pts(mT, zi, (mI ? mI.phi / 1000 : 0.02) / 2 + 0.010); pts(mS2, zs, -0.012);
  bul(mT, [ui + 0.8 * (uf - ui), zi(ui + 0.8 * (uf - ui)) + 0.02]); bul(mS2, [ui + 0.15 * (uf - ui), zs(ui + 0.15 * (uf - ui)) - 0.012]);
  if (mU) {
    const leg = mU.dims.A / 1000;
    for (const [u, s] of [[ui - 0.01, 1], [uf + 0.01, -1]]) v.poly('ACIERS', [[u + s * leg, zs(u + s * leg) + 0.01], [u, zs(u) + 0.01], [u, zi(u) - 0.01], [u + s * leg, zi(u + s * leg) - 0.01]]);
    bul(mU, [uf + 0.01, (zs(uf) + zi(uf)) / 2]);
  }
  if (mG) { const u = 0.15, zgb = zc - 0.30; v.poly('ACIERS', [[u, zgb], [u, zgb + mG.L / 1000]]); bul(mG, [u, zc + 0.05]); }
  // corbeau : tirant en L sous la face supérieure, retour descendant le long du parement avant du garde-grève ; U horizontaux
  const mCT = M('cbT'), mCU = M('cbU'), eG = D.eGG || 0.30;
  if (mCT) { const zt0 = zc - c; v.poly('ACIERS', [[0.30 - c, zt0], [-eG + c, zt0], [-eG + c, zt0 - mCT.dims.B / 1000]]); bul(mCT, [0.20, zt0]); }
  if (mCU) { const z1 = zc - c - 0.06, z2 = z1 - mCU.dims.B / 1000, xa = 0.10; v.poly('ACIERS', [[-eG + c + 0.02, z1], [xa, z1], [xa, z2], [-eG + c + 0.02, z2]]); bul(mCU, [xa, (z1 + z2) / 2]); }
  // cotes
  v.coteH([0.02, zb(L) - 0.10], [L, zb(L) - 0.10], zb(L) - 0.55, fr(L - 0.02));
  v.coteV([L + 0.10, zb(L)], [L + 0.10, zt(L)], L + 0.35, fr(e));
  v.coteV([-0.30, z0], [-0.30, zr], -0.55, fr(zr - z0));
  v.texte('TEXTES', [L * 0.45, zt(L * 0.45) + 0.08], 'pente 5 %', { h: 2.2, ancre: 'c', angle: -Math.atan(p) * 180 / Math.PI });
  bullesADroite(v, bulles);
  return v;
}

/** Vue en plan : demi-vue inférieure = nappe inférieure, demi-vue supérieure = nappe supérieure ; garde-grève à gauche. */
function vuePlan(D, marks) {
  const { DT, B, cotP, c } = D, L = DT.L, v = new Vue('VUE EN PLAN — NAPPE INFÉRIEURE (bas) ET SUPÉRIEURE (haut)', { echelle: 50 });
  const P = (u, y) => [u + y * cotP, y];                                  // u le long de l'axe depuis le garde-grève
  v.poly('COFFRAGE', [P(0, -B / 2), P(L, -B / 2), P(L, B / 2), P(0, B / 2)], true);
  v.ligne('AXES', P(-0.4, 0), P(L + 0.4, 0));
  v.poly('COFFRAGE', [P(-0.30, -B / 2 - 0.4), P(0, -B / 2 - 0.4), P(0, B / 2 + 0.4), P(-0.30, B / 2 + 0.4)], true);
  v.texte('TEXTES', P(-0.15, B / 2 + 0.6), 'garde-grève', { h: 2.2, ancre: 'c' });
  const M = k => marks.find(m => m.pos === k), bulles = [], bul = (m, q) => m && bulles.push({ m, p: q });
  const lignesL = (m, y0, y1) => { if (!m) return; const n = Math.min(80, Math.floor((y1 - y0) / m.s)); for (let k = 0; k <= n; k++) { const y = y0 + (y1 - y0) * k / n; v.ligne('ACIERS', P(c, y), P(L - c, y)); } };
  const lignesT = (m, y0, y1) => { if (!m) return; const ds = m.s / D.sinP, n = Math.min(80, Math.floor((L - 2 * c) / ds)); for (let k = 0; k <= n; k++) { const u = c + (L - 2 * c) * k / n; v.ligne('ACIERS', P(u, y0), P(u, y1)); } };
  const yb = -B / 2 + c, yt = B / 2 - c;
  lignesL(M('infL'), yb, -0.05); lignesT(M('infT'), yb, -0.05); lignesL(M('supL'), 0.05, yt); lignesT(M('supT'), 0.05, yt);
  bul(M('infL'), P(L * 0.6, -B / 4)); bul(M('infT'), P(L * 0.3, -B / 2 + 0.6)); bul(M('supL'), P(L * 0.6, B / 4)); bul(M('supT'), P(L * 0.3, B / 2 - 0.6));
  const mG = M('gj'); if (mG) { const n = Math.min(40, mG.nombre); for (let k = 0; k < n; k++) { const y = -B / 2 + 0.25 + (B - 0.5) * (n > 1 ? k / (n - 1) : 0.5); v.cercle('ACIERS_COUPES', P(0.15, y), 0.03, true); } bul(mG, P(0.15, -B / 2 + 0.25)); }
  v.coteH(P(0, -B / 2), P(L, -B / 2), -B / 2 - 0.9, fr(L));
  v.coteV(P(L, -B / 2), P(L, B / 2), L + B / 2 * cotP + 0.9, fr(B));
  if (Math.abs(cotP) > 1e-6) v.texte('TEXTES', P(L / 2, -B / 2 - 1.5), `biais ${fr(D.psi, 1)} gr — bord sur le garde-grève : ${fr(D.Bk)} m`, { h: 2.2, ancre: 'c' });
  v.texte('TEXTES', P(L / 2, -0.25), 'NAPPE INFÉRIEURE', { h: 2.4, ancre: 'c', gras: true });
  v.texte('TEXTES', P(L / 2, 0.15), 'NAPPE SUPÉRIEURE', { h: 2.4, ancre: 'c', gras: true });
  bullesADroite(v, bulles);
  return v;
}

/** Coupe B-B transversale (normale à l'axe), à mi-longueur. */
function coupeTransversale(D, marks) {
  const { DT, B, c, cS } = D, e = DT.e, v = new Vue('COUPE B-B — TRANSVERSALE', { echelle: 25 });
  v.poly('COFFRAGE', [[-B / 2, 0], [B / 2, 0], [B / 2, e], [-B / 2, e]], true);
  const M = k => marks.find(m => m.pos === k), bulles = [], bul = (m, q) => m && bulles.push({ m, p: q });
  const mI = M('infL'), mT = M('infT'), mS = M('supL'), mS2 = M('supT'), mU = M('uL');
  const pts = (m, z) => { if (!m) return; const n = Math.min(120, Math.floor((B - 2 * c) / m.s)); for (let k = 0; k <= n; k++) v.cercle('ACIERS_COUPES', [-B / 2 + c + (B - 2 * c) * k / n, z], Math.max(0.008, m.phi / 2000), true); };
  pts(mI, cS + (mI ? mI.phi / 2000 : 0)); pts(mS, e - c - (mS ? mS.phi / 2000 : 0));
  const zT = cS + (mI ? mI.phi / 1000 : 0.02) + 0.006, zS = e - c - (mS ? mS.phi / 1000 : 0.012) - 0.006;
  if (mT) v.ligne('ACIERS', [-B / 2 + c, zT], [B / 2 - c, zT]);
  if (mS2) v.ligne('ACIERS', [-B / 2 + c, zS], [B / 2 - c, zS]);
  if (mU) { const leg = Math.min(mU.dims.A / 1000, B / 4); for (const s of [1, -1]) { const x = s > 0 ? -B / 2 + c - 0.01 : B / 2 - c + 0.01; v.poly('ACIERS', [[x + s * leg, e - c + 0.005], [x, e - c + 0.005], [x, cS - 0.005], [x + s * leg, cS - 0.005]]); } }
  bul(mI, [-B / 4, cS]); bul(mT, [B / 6, zT]); bul(mS, [-B / 3, e - c]); bul(mS2, [B / 3, zS]); bul(mU, [B / 2 - c + 0.01, e / 2]);
  v.coteH([-B / 2, 0], [B / 2, 0], -0.35, fr(B));
  v.coteV([B / 2, 0], [B / 2, e], B / 2 + 0.3, fr(e));
  bullesADroite(v, bulles);
  return v;
}

/* --------------------------------------------------------------------------------------------- la feuille */
export function planDalleTransition(st, i, cartouche = {}) {
  const D = dalleTransitionCulee(st, i);
  if (!D) throw new Error('dalle de transition : la culée n\'en comporte pas (onglet Appuis et fondations)');
  const { A, K, mat, c, cS } = D, marks = reperesDalleTransition(D), lignes = lignesBordereau(marks), R0 = recapitulatif(lignes);
  const wb = 166, hb = (lignes.length + 2) * 4.6 + 6 + (R0.diam.length + 3) * 5.5;
  const tc = { titre: 'CALCUL PAR MÈTRE DE LARGEUR (EN 1991-2, EN 1992-1-1)', hl: 4.4, h: 1.8, cols: [{ t: 'Grandeur', w: 100, a: 'g' }, { t: 'Valeur', w: 66, a: 'd' }],
    lignes: [
      ['Longueur L / portée de calcul L_c', `${fr(K.L)} / ${fr(K.Lc)} m`], ['Épaisseur e / hauteur utile d', `${fr(K.e)} / ${fr(K.d, 3)} m`],
      ['Couverture moyenne (remblai + chaussée, γ = 20 kN/m³)', `${fr(K.hm)} m`], ['Charge permanente g', `${fr(K.g, 1)} kN/m²`],
      ['M_G / M_TS / M_UDL / M_LM2', `${fr(K.M.G, 1)} / ${fr(K.M.TS, 1)} / ${fr(K.M.UDL, 1)} / ${fr(K.M.LM2, 1)} kN·m/m`],
      ['M_Ed ELU (1,35 G + 1,35 Q, ' + K.gouverne + ')', `${fr(K.M.ELU, 1)} kN·m/m`], ['M ELS caractéristique / quasi permanent', `${fr(K.M.ELS, 1)} / ${fr(K.M.QP, 1)} kN·m/m`],
      ['A_s ELU / ELS / fissuration / minimum', `${fr(K.As.ELU * 1e4, 1)} / ${fr(K.As.ELS * 1e4, 1)} / ${fr(K.As.fissuration * 1e4, 1)} / ${fr(K.As.min * 1e4, 1)} cm²/m`],
      ['A_s retenue (nappe inférieure // axe)', `HA${K.inf.phi} e=${esp(K.inf.s)} = ${fr(K.inf.As * 1e4, 1)} cm²/m ${K.okAs ? '✓' : '✗'}`],
      ['Répartition (≥ 20 %) / nappe supérieure', `HA${K.rep.phi} e=${esp(K.rep.s)} / HA${K.sup.phi} e=${esp(K.sup.s)}`],
      ['V_Ed ELU / V_Rd,c (sans armatures)', `${fr(K.V.ELU, 1)} / ${fr(K.VRdc, 1)} kN/m ${K.okV ? '✓' : '✗'}`],
      ['Réaction sur le corbeau G / Q / ELU', `${fr(K.corbeau.G, 1)} / ${fr(K.corbeau.Q, 1)} / ${fr(K.corbeau.ELU, 1)} kN/m`],
      ['Corbeau (J.3) : tirant F_Ed a_c/z₀ + 0,2 F_Ed / A_s', `${fr(D.Kc.Ft, 1)} kN/m / ${fr(D.Kc.As * 1e4, 2)} cm²/m → HA${D.Kc.tirant.phi} e=${esp(D.Kc.tirant.s)}`],
      ...(() => { const q = st.supports && st.supports.lines && st.supports.lines[i] && st.supports.lines[i].EC && st.supports.lines[i].EC.dalleQ; return q ? [['Culée, efforts d\'ensemble : trafic de la dalle retenu', `${fr(q.N, 0)} kN (forfait ${fr(q.forfait, 0)} ; EC ${fr(q.dN, 0)})`]] : []; })(),
      ['Corbeau : bielle σ / ν′ f_cd', `${fr(D.Kc.sig, 1)} / ${fr(D.Kc.sigRd, 1)} MPa ${D.Kc.ok ? '✓' : '✗'}`],
    ] };
  const hC = (tc.lignes.length + 2) * tc.hl;
  const N = ['NOTES',
    ...couperLigne(`1. Béton ${classeBeton(mat.fck)}, aciers HA f_yk = ${mat.fyk} MPa. Enrobages : ${fr(c * 100, 0)} cm (dessus, rives), ${fr(cS * 100, 0)} cm (sous-face coulée sur béton de propreté, EN 1992-1-1 § 4.4.1.3(4)).`, 110),
    ...couperLigne(`2. Dalle sur deux appuis simples : corbeau du garde-grève et remblai (béton de propreté de 10 cm sur remblai compacté) ; portée de calcul L_c = L − 0,30 m ; charges LM1 (TS, UDL) et LM2 diffusées à 1/1 jusqu'au feuillet moyen (EN 1991-2 § 4.3.6).`, 110),
    ...couperLigne('3. Dessus de la dalle à 0,30 m sous la chaussée au droit du garde-grève, pente de 5 % vers le remblai ; joint de 2 cm en polystyrène contre le garde-grève ; goujons scellés dans le corbeau, à disposer avant le bétonnage du corbeau.', 110),
    ...couperLigne(`4. Recouvrements l₀ (EN 1992-1-1 § 8.7.3) : ${texteRecouvrements(marks.map(q => q.phi), mat)} ; barres de plus de 12 m en pièces recouvertes.`, 110),
    ...couperLigne('5. Aciers de répartition ≥ 20 % des aciers principaux (§ 9.3.1.1(2)) ; moments transversaux sous charges concentrées non calculés : calcul de plaque si la dalle est large ou très biaise.', 110),
    ...couperLigne('6. Bordereau ISO 4066, cotes en mm ; chaises : une par m² de dalle ; aciers du corbeau (tirant, U horizontaux, EN 1992-1-1 annexe J.3) à poser avec le garde-grève.', 110),
    ...(K.okV && K.okAs ? [] : ['7. ATTENTION — ' + (!K.okV ? 'effort tranchant > V_Rd,c : épaissir la dalle.' : 'section d\'acier insuffisante : épaissir la dalle.')]),
  ], hn = N.length * 2.2 * 1.6;
  const ca = coupeLongitudinale(D, marks), pl = vuePlan(D, marks), cb = coupeTransversale(D, marks);
  let R = R0;
  const F = composer({ titre: `CULÉE ${A.nom} — DALLE DE TRANSITION — FERRAILLAGE ET NOMENCLATURE`, cartouche,
    rangees: [[ca, pl], [cb]],
    groupes: [{ vues: [ca], cible: 50, min: 10 }, { vues: [cb, pl], cible: 100, min: 20 }],
    colonne: { largeur: wb + 16, hauteur: 2 + hb + 6 + hC + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      const xb = F.W - 10 - wb - 3;
      ({ R } = placerBordereau(F, lignes, [xb, y + 2, wb, hb]));
      F.tableau(tc, xb, y + 2 + hb + 6);
      F.note(N, xb, y + 2 + hb + 6 + hC + 6 + hn - 2.2 * 0.6, 2.2);
      F.notes[F.notes.length - 1].titreGras = true;
    } }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(q => '1/' + q.vue.echelle))].join(' ; ');
  F.masse = R.masse; F.dalleTransition = { ...D, marks };
  return F;
}
