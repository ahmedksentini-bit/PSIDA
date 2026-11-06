/**
 * Ferraillage passif d'une dalle précontrainte (plan TAB-FER-01 en PSI-DP), sur le modèle des plans d'entreprise relus
 * (autoroute A640, OA67 et OA68 « FER » : aciers passifs, frettage des ancrages, zone de régularisation, chapeaux) :
 *   - aciers longitudinaux : sections passives du calcul PSI-DP par section (dp.c.steel : armatures de peau,
 *     non-fragilité, supplément de traction), rapportées au mètre de largeur et disposées par src/rebar.js (rebarPlan :
 *     filantes, renforts, chapeaux, recouvrements, pièces de 12 m) ;
 *   - aciers transversaux et chevêtres incorporés : ceux du calcul de la dalle ;
 *   - effort tranchant : sans armatures quand le calcul PSI-DP n'en demande pas (dp.c.shear needAt) ;
 *   - zone d'ancrage (dp.anchors, BPEL 91 annexe 4 / EN 1992-1-1 § 8.10.3) à chaque about :
 *       armatures de surface verticales (A_s) et d'éclatement verticales (A_e) en U sur la hauteur, réparties sur la
 *       longueur de régularisation d ; éclatement horizontal (A_e,h) en barres transversales ; armatures inférieures
 *       d'about équilibrant la bielle d'appui (A_s,inf) ;
 *   - frettage local de chaque ancrage (hélice ou cadres) : selon l'agrément du procédé (non quantifié ici).
 */
import { rebarPlan, chooseBars, areaOf, massPerM } from '../rebar.js';

const interp = (xs, ys, x) => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[ys.length - 1]; };

/** Nombre de barres φ fournissant A (m²), au moins nMin. */
const nBarres = (A, phi, nMin = 2) => Math.max(nMin, Math.ceil(A / areaOf(phi) - 1e-9));

export function rebarDP(st) {
  const dp = st.psidp; if (!dp || !dp.c || !dp.c.steel) throw new Error('ferraillage passif : dalle précontrainte non calculée');
  const deck = st.deck, W = 2 * deck.b, secs = deck.beam.sections, S = dp.c.steel, p = st.p;
  const sx = S.map(q => q.x), top = S.map(q => q.top.As / W), bot = S.map(q => q.bot.As / W);
  const envTop = secs.map(s => interp(sx, top, s.x)), envBot = secs.map(s => interp(sx, bot, s.x));
  const needAt = (dp.c.shear || []).some(q => q.needAt);
  const D = st.design.EC, skin = Math.min(...top, ...bot);
  const design = { ...D, envBot, envTop, mins: { ...D.mins, perFace: Math.max(skin, 1e-6) }, shear: needAt ? D.shear : D.shear.map(v => ({ ...v, AswS: 0 })), renfortsAppareils: D.renfortsAppareils };
  const R = rebarPlan({ deck, design, trans: st.transDesign && st.transDesign.EC, opt: { fck: p.mat.fck, fyk: p.mat.fyk, phiLong: Math.round(p.mat.phi * 1000), phiTrans: Math.round(p.mat.phiT * 1000), chevetres: st.chevetres } });
  // ------------------------------------------------------------ zones d'ancrage (une par about tendu)
  const fe = dp.steel.fe || 500, h = deck.h, c = p.mat.c, [aL, aR] = deck.g.overhangs || [0, 0];
  const ends = (dp.anchors.sides || []).map(sd => ({ sd, gauche: sd.side === 'gauche' }));
  let id = Math.max(0, ...R.marks.map(m => m.mark));
  const add = m => { m.mark = ++id; m.mass = m.count * m.totalLen * massPerM(m.phi); m.dp = true; R.marks.push(m); return m; };
  const frettage = [];
  for (const { sd, gauche } of ends) {
    const V = sd.vert || {}, Hz = sd.hor || {}, d = V.Lzone || h, xa = gauche ? -aL + c : deck.beam.Ltot + aR - c, sgn = gauche ? 1 : -1, cote = gauche ? 'C0' : `C${deck.spans.length}`;
    const fx = (x1, len) => (gauche ? { x1, x2: x1 + len } : { x1: x1 - len, x2: x1 });
    // surface : U verticaux près de la face d'about (dans 0,1 d)
    if (V.As > 0) { const phi = 12, n = nBarres(V.As, phi, 4); frettage.push(add({ face: 'vert', dir: 'vertical', role: 'frettage', phi, s: Math.max(0.10, (W - 2 * c) / n), ...fx(xa, 0.1 * d), len: h - 2 * c, totalLen: h - 2 * c + 2 * 10 * phi / 1000, count: n, pieces: 1, label: `About ${cote} — armatures de surface (A_s = ${(V.As * 1e4).toFixed(1)} cm²)`, note: `U verticaux près de la face d'about, dans les 0,1 d = ${(0.1 * d).toFixed(2)} m` })); }
    // éclatement vertical : U verticaux répartis de 0,1 d à d
    if (V.Ae > 0) { const phi = 14, n = nBarres(V.Ae, phi, 4), nl = Math.max(2, Math.ceil(0.9 * d / 0.15)), parL = Math.ceil(n / nl); frettage.push(add({ face: 'vert', dir: 'vertical', role: 'frettage', phi, s: Math.max(0.10, (W - 2 * c) / parL), ...fx(xa + sgn * 0.1 * d, 0.9 * d), len: h - 2 * c, totalLen: h - 2 * c + 2 * 10 * phi / 1000, count: parL * nl, pieces: 1, label: `About ${cote} — éclatement vertical (A_e = ${(V.Ae * 1e4).toFixed(1)} cm², ${nl} files)`, note: `zone de régularisation d = ${d.toFixed(2)} m` })); }
    // éclatement horizontal : barres transversales sur la largeur, réparties sur la longueur de régularisation horizontale
    const Ah = Math.max(Hz.Ae || 0, Hz.As || 0);
    if (Ah > 0) { const phi = 12, n = Math.max(2, nBarres(Ah, phi, 2)), lh = Math.max(Hz.L || 0.3, 0.3); frettage.push(add({ face: 'inf', dir: 'trans', role: 'frettage', phi, s: Math.max(0.10, lh / n), ...fx(xa, lh), len: W - 2 * c, totalLen: W - 2 * c + 2 * 10 * phi / 1000, count: n, pieces: 1, label: `About ${cote} — éclatement horizontal (A_e,h = ${(Ah * 1e4).toFixed(1)} cm²)`, note: `barres transversales sur ${lh.toFixed(2)} m` })); }
    // bielle d'appui : armatures inférieures d'about
    const Ai = sd.bielle && sd.bielle.AsInf;
    if (Ai > 0) { const b = chooseBars(Ai / W, { phiMin: 16, phiMax: 32, sMax: 0.20, sMin: 0.10 }), len = Math.max(1.5, d + 0.8); frettage.push(add({ face: 'inf', dir: 'long', role: 'frettage', phi: b.phi, s: b.s, ...fx(xa, len), len, totalLen: len, count: Math.floor((W - 2 * c) / b.s) + 1, pieces: 1, hookL: gauche, hookR: !gauche, label: `About ${cote} — armatures inférieures d'about (bielle, A_s,inf = ${(Ai * 1e4).toFixed(1)} cm²)`, note: 'ancrées par retour au-delà de l\'axe d\'appui' })); }
  }
  R.totalMass = R.marks.reduce((t, m) => t + m.mass, 0);
  R.dp = { frettage, needAt, fe, source: 'PSI-DP : sections passives par section (peau, non-fragilité, traction), zone d\'ancrage BPEL annexe 4' };
  return R;
}
