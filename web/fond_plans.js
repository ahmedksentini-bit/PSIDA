/**
 * Schémas des fondations tracés à partir des résultats du projet (onglet Appuis et note de calcul) :
 * découpage de Ménard, bulbe des contraintes de Boussinesq, plans de ferraillage de la semelle superficielle, du pieu
 * et de la semelle sur deux files de pieux. Les barres sont choisies ici (diamètre et espacement fournissant la section
 * calculée) : proposition à reprendre sur les plans d'exécution.
 */
import { svg, texte, ligne, COULEURS, solDe } from '../src/vendor/fond-figures.js';
import { chooseBars, areaOf, anchorage } from '../src/rebar.js';

const f0 = v => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : '—');
const f1 = v => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
const f2 = v => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const cm2 = a => f1(a * 1e4);
const esp = e => (e * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const BET = '#e5e7eb', ACIER = '#b91c1c', REP = '#e29595', BIEL = '#2563eb';
const pt = 'class="pt"', b12 = 'style="font-size:12px;font-weight:700"', s11 = 'style="font-size:11px"';
const rect = (x, y, w, h, fill = BET, stroke = COULEURS.betonTrait, sw = 1.3, extra = '') => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const dot = (x, y, r, c = ACIER) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${c}"/>`;
const poly = (pts, stroke, sw = 1.6, fill = 'none', extra = '') => `<polyline points="${pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
/** Cote horizontale ou verticale avec flèches simples. */
function cote(x1, y1, x2, y2, lib) {
  const h = Math.abs(y2 - y1) < 1e-6, a = 4;
  let s = ligne(x1, y1, x2, y2, COULEURS.cote, 1);
  if (h) { s += poly([[x1 + a, y1 - a], [x1, y1], [x1 + a, y1 + a]], COULEURS.cote, 1) + poly([[x2 - a, y2 - a], [x2, y2], [x2 - a, y2 + a]], COULEURS.cote, 1); s += texte((x1 + x2) / 2, y1 - 4, lib, 'text-anchor="middle" style="font-size:11px"'); }
  else { s += poly([[x1 - a, y1 + a], [x1, y1], [x1 + a, y1 + a]], COULEURS.cote, 1) + poly([[x2 - a, y2 - a], [x2, y2], [x2 + a, y2 - a]], COULEURS.cote, 1); s += `<text transform="translate(${(x1 - 5).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" style="font-size:11px">${lib}</text>`; }
  return s;
}
/** Ligne de rappel : point sur l'objet, trait, texte. */
const rappel = (x1, y1, x2, y2, lib, col = COULEURS.encre) => ligne(x1, y1, x2, y2, '#64748b', 0.9) + dot(x1, y1, 2.2, '#64748b') + texte(x2 + 4, y2 + 4, lib, `style="font-size:11.5px;fill:${col}"`);
const nom = L => (L.kind === 'culee' ? `culée C${L.i}` : L.joint ? `pile de joint C${L.i}` : `pile P${L.i}`);
/** Largeur du fût ou du mur au pied (dans le sens B de la semelle). */
/** Données d'appui de la ligne L (plan de nivellement : propres à la ligne). */
export const spOf = (sup, L) => (sup.spLigne && sup.spLigne[L.i]) || sup.sp;

export function wallWidth(sp, L) {
  if (L.kind === 'culee') return sp.culee.type === 'remblayee' ? sp.culee.em : sp.culee.D;
  return sp.pile.type === 'voile' ? sp.pile.b : sp.pile.D;
}
const HA = (n, phi) => `${n} HA${phi}`;

// ============================================================================================== Ménard et Boussinesq
/** Découpage du sol en 16 tranches de B/2 sous la semelle et regroupement des modules (F62 annexe F.2 / NF P 94-261 H). */
export function menardSchema(sup, L, code = 'EC') {
  const f = L[code].found, t = f.settle; if (!t || t.error || !t.E) return null;
  const prof = (sup.profiles || []).find(p => p.name === L.profile) || (sup.profiles || [])[0];
  const D = spOf(sup, L).found.De, B = Math.min(f.B, f.L), zMax = D + 8 * B, isF = code === 'BAEL';
  const top = 46, Hd = 430, sc = Hd / zMax, Y = z => top + z * sc;
  const xL = 30, wL = 150, xT = 300, wT = 150, xG = xT + wT + 10, xTx = 640, W = 1000;
  const grp = [[1, 1, `E₁ = ${f1(t.E1)}`, '#1d4ed8'], [2, 2, `E₂ = ${f1(t.E2)}`, '#60a5fa'], [3, 5, `E₃,₅ = ${f1(t.E35)}`, '#15803d'], [6, 8, `E₆,₈ = ${f1(t.E68)}`, '#ea580c'], [9, 16, `E₉,₁₆ = ${f1(t.E916)}`, '#a16207']];
  return svg({ largeur: W, hauteur: top + Hd + 30, titre: `Ménard ${nom(L)}`, contenu: () => {
    let s = texte(xL, 20, `Tassement de Ménard sous la ${nom(L)} : 16 tranches de B/2 = ${f2(B / 2)} m et regroupement des modules`, b12);
    // couches du sondage
    s += texte(xL + wL / 2, top - 8, `sondage ${prof ? prof.name : ''} (E_M en MPa)`, 'text-anchor="middle" style="font-size:11px;font-weight:700"');
    for (const l of (prof ? prof.layers : [])) {
      const z0 = Math.min(l.z0, zMax), z1 = Math.min(l.z1, zMax); if (z1 <= z0) continue;
      s += rect(xL, Y(z0), wL, (z1 - z0) * sc, solDe(l.classe).fond, '#64748b', 0.8);
      if ((z1 - z0) * sc > 14) s += texte(xL + wL / 2, Y((z0 + z1) / 2) + 4, `${l.classe} ${f1(l.EM)}`, 'text-anchor="middle" style="font-size:11px"');
    }
    // semelle et tranches
    s += rect(xT - 20, Y(D) - Math.min(14, D * sc), wT + 40, Math.min(14, D * sc), '#cbd5e1');
    s += texte(xT + wT / 2, Y(D) - 3, `semelle B = ${f2(B)} m`, 'text-anchor="middle" style="font-size:10.5px"');
    for (let k = 0; k < 16; k++) {
      const g = grp.find(q => k + 1 >= q[0] && k + 1 <= q[1]), za = D + k * B / 2;
      s += rect(xT, Y(za), wT, B / 2 * sc, g[3], '#64748b', 0.6, 'fill-opacity="0.22"');
      if (B / 2 * sc >= 11) s += texte(xT + wT / 2, Y(za + B / 4) + 4, `${k + 1} : ${f1(t.E[k])}`, 'text-anchor="middle" style="font-size:10px"');
    }
    for (const [a, b, lab, col] of grp) {
      const za = D + (a - 1) * B / 2, zb = D + b * B / 2;
      s += ligne(xG, Y(za) + 2, xG, Y(zb) - 2, col, 3);
      s += texte(xG + 8, Y((za + zb) / 2) + 4, `${lab} MPa`, `style="font-size:11.5px;font-weight:700;fill:${col}"`);
    }
    s += rect(xT - 34, Y(D), 8, B / 2 * sc, '#1d4ed8', 'none', 0) + texte(xT - 38, Y(D + B / 4) + 4, 'sphérique', 'text-anchor="end" style="font-size:10.5px;fill:#1d4ed8"');
    s += rect(xT - 30, Y(D), 3, 8 * B * sc, '#94a3b8', 'none', 0) + texte(xT - 38, Y(D + 4 * B) + 4, 'déviatorique', 'text-anchor="end" style="font-size:10.5px;fill:#64748b"');
    const pas = zMax > 40 ? 10 : 5;
    for (let z = 0; z <= zMax + 1e-9; z += pas) s += ligne(xT - 5, Y(z), xT, Y(z), COULEURS.trait, 1) + texte(xT - 7, Y(z) + 4, String(z), 'text-anchor="end" style="font-size:10px;fill:#64748b"');
    // calcul
    const lignes = ['Dans chaque tranche, moyenne harmonique des E_M ;',
      isF ? '4/E_d = 1/E₁ + 1/(0,85 E₂) + 1/E₃,₅ + 1/(2,5 E₆,₈) + 1/(2,5 E₉,₁₆)' : '1/E_d = 0,25/E₁ + 0,3/E₂ + 0,25/E₃,₅ + 0,1/E₆,₈ + 0,1/E₉,₁₆',
      `E_d = ${f2(t.Ed)} MPa ; E_c = E₁ = ${f1(t.E1)} MPa ; α = ${f2(t.alpha)}`, '',
      `q′ − σ′_v0 = ${f1(t.q)} − ${f1(t.sigmaV0)} = ${f1(t.dq)} kPa`, `λ_c = ${f2(t.lc)} ; λ_d = ${f2(t.ld)} (L/B = ${f2(Math.max(f.B, f.L) / B)})`, '',
      `s_c = α (q′ − σ′_v0) λ_c B/(9 E_c) = ${f1(t.sc)} mm`, `s_d = 2 (q′ − σ′_v0) B₀ (λ_d B/B₀)^α/(9 E_d) = ${f1(t.sd)} mm`, `s_f = ${f1(t.s)} mm`];
    lignes.forEach((l, i) => { s += texte(xTx, top + 20 + i * 22, l, i === lignes.length - 1 ? 'style="font-size:12.5px;font-weight:700"' : 'style="font-size:12px"'); });
    s += texte(xTx, top + Hd + 10, `z depuis le terrain naturel [m] ; ${isF ? 'Fascicule 62 titre V annexe F.2' : 'NF P 94-261 annexe H'}`, pt);
    return s;
  } });
}

/** Contrainte verticale (fraction de q) sous un rectangle souple B × L centré, au point (x, 0, z) — Newmark. */
export function boussinesqRect(x, z, B, L) {
  const corner = (m, n) => {
    const m2 = m * m, n2 = n * n, V = m2 + n2 + 1, r = Math.sqrt(V);
    return (2 * m * n * r / (V + m2 * n2) * (V + 1) / V + Math.atan2(2 * m * n * r, V - m2 * n2)) / (4 * Math.PI);
  };
  let s = 0;
  for (const dx of [B / 2 - x, B / 2 + x]) s += 2 * Math.sign(dx || 1) * corner(Math.abs(dx) / z, L / 2 / z);
  return s;
}
/** Isolignes par carrés marchants : segments [[x1, z1], [x2, z2]]. */
function marching(xs, zs, G, lev) {
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const c = [[xs[i], zs[j], G[j][i]], [xs[i + 1], zs[j], G[j][i + 1]], [xs[i + 1], zs[j + 1], G[j + 1][i + 1]], [xs[i], zs[j + 1], G[j + 1][i]]];
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const a = c[k], b = c[(k + 1) % 4];
      if ((a[2] - lev) * (b[2] - lev) < 0) { const t = (lev - a[2]) / (b[2] - a[2]); pts.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    if (pts.length === 2) out.push(pts); else if (pts.length === 4) { out.push([pts[0], pts[1]]); out.push([pts[2], pts[3]]); }
  }
  return out;
}
/** Bulbe des contraintes de Boussinesq sous la semelle (coupe dans le sens B) et profil sur l'axe. */
export function bulbSchema(sup, L, code = 'EC') {
  const f = L[code].found, t = f.settle; if (!t || t.error) return null;
  const B = Math.min(f.B, f.L), Lg = Math.max(f.B, f.L), zMax = 6 * B, xMax = 2 * B;
  const nx = 81, nz = 73, xs = Array.from({ length: nx }, (_, i) => -xMax + 2 * xMax * i / (nx - 1)), zs = Array.from({ length: nz }, (_, j) => 0.02 * B + (zMax - 0.02 * B) * j / (nz - 1));
  const G = zs.map(z => xs.map(x => boussinesqRect(x, z, B, Lg)));
  const ox = 70, oy = 60, sc = Math.min(380 / (2 * xMax), 420 / zMax), X = x => ox + (x + xMax) * sc, Y = z => oy + z * sc;
  const px = X(xMax) + 90, pw = 220, W = Math.max(900, px + pw + 200);
  const lev = [0.9, 0.7, 0.5, 0.3, 0.2, 0.1], cols = ['#b91c1c', '#ea580c', '#15803d', '#1d4ed8', '#60a5fa', '#64748b'];
  const zAt = v => { let lo = 0.01, hi = 20 * B; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (boussinesqRect(0, m, B, Lg) > v) lo = m; else hi = m; } return lo; };
  return svg({ largeur: W, hauteur: Y(zMax) + 60, titre: `Bulbe ${nom(L)}`, contenu: () => {
    let s = texte(30, 20, `Bulbe des contraintes sous la semelle de la ${nom(L)} (Boussinesq, semelle souple ${f2(B)} × ${f2(Lg)} m, coupe dans le sens B)`, b12);
    s += rect(X(-B / 2), oy - 12, B * sc, 12, '#cbd5e1') + ligne(X(-xMax), oy, X(xMax), oy, COULEURS.trait, 1.4);
    lev.forEach((lv, k) => {
      const seg = marching(xs, zs, G, lv);
      s += seg.map(([a, b]) => ligne(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), cols[k], 1.8)).join('');
      const z = zAt(lv); s += texte(X(0) + 4, Y(z) + 13, `${f1(lv)} q`, `style="font-size:11px;font-weight:700;fill:${cols[k]}"`);
    });
    for (let z = 0; z <= zMax + 1e-9; z += (zMax > 30 ? 5 : 2)) s += ligne(X(-xMax) - 5, Y(z), X(-xMax), Y(z), COULEURS.trait, 1) + texte(X(-xMax) - 8, Y(z) + 4, String(z), 'text-anchor="end" style="font-size:10px"');
    s += ligne(X(-xMax), oy, X(-xMax), Y(zMax), COULEURS.trait, 1) + texte(X(-xMax) - 30, oy - 20, 'z sous la base (m)', s11);
    // profil sur l'axe
    s += ligne(px, oy, px, Y(zMax), COULEURS.trait, 1) + ligne(px, oy, px + pw, oy, COULEURS.trait, 1);
    for (const v of [0, 0.5, 1]) s += texte(px + v * pw, oy - 6, f1(v), 'text-anchor="middle" style="font-size:10px"');
    s += texte(px + pw / 2, oy - 22, 'Δσ_z/q sur l\'axe', 'text-anchor="middle" style="font-size:12px"');
    const zz = Array.from({ length: 120 }, (_, k) => 0.02 * B + (zMax - 0.02 * B) * k / 119);
    s += poly(zz.map(z => [px + boussinesqRect(0, z, B, Lg) * pw, Y(z)]), '#1d4ed8', 2.2);
    for (const k of [0.5, 1, 1.5, 2, 3, 4, 6]) { const z = k * B, v = boussinesqRect(0, z, B, Lg); s += dot(px + v * pw, Y(z), 3, '#1d4ed8') + texte(px + v * pw + 6, Y(z) + 4, `z = ${f1(z)} m : ${f2(v)}`, s11); }
    s += texte(30, Y(zMax) + 28, `q = q′ − σ′_v0 = ${f1(t.dq)} kPa. Isobare 0,2 q à ${f1(zAt(0.2))} m, 0,1 q à ${f1(zAt(0.1))} m ; à 8 B = ${f1(8 * B)} m, Δσ_z = ${f2(boussinesqRect(0, 8 * B, B, Lg))} q : profondeur couverte par les 16 tranches de Ménard.`, 'style="font-size:12px"');
    s += texte(30, Y(zMax) + 46, 'Solution de Boussinesq intégrée sur le rectangle (formule de Newmark pour un coin, superposition de quatre rectangles).', pt);
    return s;
  } });
}

// ============================================================================================== semelle superficielle
/** Plan de ferraillage de la semelle superficielle : coupe dans le sens B, vue en plan de la nappe inférieure, nomenclature. */
export function footingRebarSchema(sup, L, code = 'EC') {
  const f = L[code].found; if (f.type !== 'superficielle') return null;
  const B = f.B, Lf = f.L, hs = f.hs, b = wallWidth(sup.sp, L), d = f.bielles.d, c = Math.max(0.03, hs - d - 0.01);
  const main = chooseBars(f.AsLong / Lf, { phiMin: 12, phiMax: 32, sMax: 0.25, sMin: 0.10 });
  const rep = chooseBars(f.AsTransPerM, { phiMin: 10, phiMax: 25, sMax: 0.25, sMin: 0.10 });
  const nMain = Math.floor((Lf - 2 * c) / main.s + 1e-9) + 1, nRep = Math.floor((B - 2 * c) / rep.s + 1e-9) + 1;
  const AsProv = nMain * areaOf(main.phi), bi = f.method === 'bielles', co = f.console;
  const s = Math.min(300 / B, 120 / hs), ox = 50, oy = 80, hW = Math.min(1.0, 2 * hs);
  const ys = oy + hW * s, yb = ys + hs * s - c * s, xs = x => ox + x * s;
  const lx = xs(B) + 50, px = lx + 340, sp = Math.min(380 / Lf, 120 / B), W = Math.max(1000, px + Lf * sp + 70);
  const ty = ys + hs * s + 70, H = ty + 6 * 20 + 40;
  return svg({ largeur: W, hauteur: H, titre: `Ferraillage semelle ${nom(L)}`, contenu: () => {
    let o = texte(30, 20, `Ferraillage de la semelle de la ${nom(L)} (méthode ${bi ? 'des bielles' : 'des consoles'}) : coupe dans le sens B et vue en plan`, b12);
    o += texte(ox, oy - 34, 'Coupe dans le sens B', 'style="font-size:12px;font-weight:700"');
    o += rect(xs(0), ys, B * s, hs * s) + rect(xs((B - b) / 2), oy, b * s, hW * s + 1, BET, COULEURS.betonTrait, 1.3, 'stroke-dasharray="0"');
    o += ligne(xs((B - b) / 2) - 6, oy, xs((B + b) / 2) + 6, oy, '#fff', 3) + texte(xs(B / 2), oy - 6, `${L.kind === 'culee' ? 'mur' : 'fût'} ${f2(b)}`, 'text-anchor="middle" style="font-size:10.5px"');
    const hook = Math.min(hs - 2 * c, 0.5 * hs) * s;
    o += poly([[xs(c), yb - hook], [xs(c), yb], [xs(B - c), yb], [xs(B - c), yb - hook]], ACIER, 2.6);
    const nd = Math.min(28, nRep); for (let k = 0; k < nd; k++) o += dot(xs(c) + (k + 0.5) * (B - 2 * c) * s / nd, yb - 5, 2.6);
    for (const xa of [xs((B - b) / 2 + c + 0.02), xs((B + b) / 2 - c - 0.02)]) o += ligne(xa, oy + 4, xa, yb - 9, '#7f1d1d', 1.8, 'stroke-dasharray="7 3"');
    if (bi) for (const sg of [-1, 1]) o += ligne(xs(B / 2 + sg * b / 4), ys, xs(B / 2 + sg * (B / 2 - 0.25)), yb - 8, BIEL, 1.3, 'stroke-dasharray="6 4"');
    else if (co) { const xS = xs(co.x1); o += ligne(xS, ys - 12, xS, ys + hs * s + 8, COULEURS.rouge, 1.4, 'stroke-dasharray="6 3"') + texte(xS + 4, ys - 2, 'S₁', 'style="font-size:12px;font-weight:700;fill:#b91c1c"'); }
    o += cote(xs(0), ys + hs * s + 22, xs(B), ys + hs * s + 22, `B = ${f2(B)} m`) + cote(xs(0) - 14, ys, xs(0) - 14, ys + hs * s, f2(hs));
    o += rappel(xs(B - c), yb - hook / 2, lx, ys + 0.15 * hs * s, `① ${HA('', main.phi).trim()} e = ${esp(main.s)} cm, retours aux extrémités`, ACIER);
    o += rappel(xs(B) - 0.25 * B * s, yb - 5, lx, ys + 0.5 * hs * s, `② répartition HA${rep.phi} e = ${esp(rep.s)} cm (vue en bout)`);
    o += rappel(xs(B - c), yb + c * s * 0.5, lx, ys + 0.85 * hs * s, `enrobage ${f0(c * 100)} cm ; d = ${f2(d)} m`);
    o += rappel(xs((B + b) / 2 - c - 0.02), oy + hW * s * 0.4, lx, oy + 10, `attentes du ${L.kind === 'culee' ? 'mur' : 'fût'} (ferraillage du fût)`);
    // vue en plan
    o += texte(px, oy - 34, 'Vue en plan, nappe inférieure', 'style="font-size:12px;font-weight:700"');
    const Wp = Lf * sp, Hp = B * sp, step = nMain > 70 ? 2 : 1;
    o += rect(px, oy, Wp, Hp);
    for (let k = 0; k < nMain; k += step) { const x = px + (c + k * main.s) * sp; o += ligne(x, oy + 2, x, oy + Hp - 2, ACIER, 0.9); }
    for (let k = 0; k < nRep; k += step) { const y = oy + (c + k * rep.s) * sp; o += ligne(px + 2, y, px + Wp - 2, y, REP, 0.8); }
    const lw = L.kind === 'culee' ? Lf - 1 : Lf - 1;
    o += rect(px + (Lf - lw) / 2 * sp, oy + (B - b) / 2 * sp, lw * sp, b * sp, '#f8fafc', '#334155', 1, 'stroke-dasharray="4 3" fill-opacity="0.85"');
    o += texte(px + Wp / 2, oy + B / 2 * sp + 4, `${L.kind === 'culee' ? 'mur' : 'fût'} ${f2(b)} m`, 'text-anchor="middle" style="font-size:10.5px"');
    o += cote(px, oy + Hp + 18, px + Wp, oy + Hp + 18, `L = ${f2(Lf)} m`) + cote(px + Wp + 18, oy, px + Wp + 18, oy + Hp, f2(B));
    if (step > 1) o += texte(px, oy + Hp + 44, '(une barre sur deux dessinée)', pt);
    // nomenclature
    const rows = [['Rep.', 'Désignation', 'Section fournie / calculée'],
      ['①', `${HA(nMain, main.phi)}, L = ${f2(B - 2 * c)} m + 2 retours (sens B, e = ${esp(main.s)} cm)`, `${cm2(AsProv)} ≥ ${cm2(f.AsLong)} cm²`],
      ['②', `${HA(nRep, rep.phi)}, L = ${f2(Lf - 2 * c)} m (sens L, e = ${esp(rep.s)} cm)`, `${cm2(rep.As)} ≥ ${cm2(f.AsTransPerM)} cm²/m`],
      ['—', 'nappe supérieure : constructive, minimum 0,12 % (PP73 1.1.1)', `${cm2(f.AsMin / Lf)} cm²/m`]];
    rows.forEach((r, i) => { const st = i === 0 ? 'style="font-size:12px;font-weight:700"' : 'style="font-size:12px"'; o += texte(ox, ty + i * 20, r[0], st) + texte(ox + 40, ty + i * 20, r[1], st) + texte(ox + 520, ty + i * 20, r[2], st); });
    o += texte(ox, ty + 4 * 20 + 6, bi ? `A_s = N′ (B − b)/(8 d f_su) = ${f0(f.bielles.N)} × ${f2(B - b)}/(8 × ${f2(d)} × f_su) = ${cm2(f.bielles.As)} cm² (minimum ${cm2(f.AsMin)} cm²)` : `A_s = M₁ L/(0,9 d f_su), M₁ = ${f1(co ? co.M1 : NaN)} kN·m/m en S₁ (x₁ = ${f2(co ? co.x1 : NaN)} m) : ${cm2(co ? co.As : NaN)} cm² (minimum ${cm2(f.AsMin)} cm²)`, 'style="font-size:12px"');
    o += texte(ox, ty + 5 * 20 + 6, 'Barres proposées par PSIDA (plus légère combinaison diamètre / espacement) : à reprendre sur les plans d\'exécution.', pt);
    return o;
  } });
}

// ============================================================================================== pieux
/** Barres longitudinales d'un pieu : au moins 6 barres, espacement libre ≥ 10 cm, section minimale fournie. */
export function pileBars(As, D, c = 0.07) {
  let best = null;
  for (const phi of [14, 16, 20, 25, 32]) {
    const a = areaOf(phi), n = Math.max(6, Math.ceil(As / a - 1e-9)), sp = Math.PI * (D - 2 * c - phi / 1000) / n;
    if (sp < 0.10 + phi / 1000) continue;
    const A = n * a; if (!best || A < best.As - 1e-9 || (Math.abs(A - best.As) < 1e-9 && n < best.n)) best = { phi, n, As: A, s: sp };
  }
  return best || { phi: 32, n: Math.max(6, Math.ceil(As / areaOf(32))), As: Math.max(6, Math.ceil(As / areaOf(32))) * areaOf(32), insufficient: true };
}
/** Cerces (deux brins par section) : A_t/s fourni ≥ besoin, φ_t ≥ φ_l/3. */
export function pileHoops(AtS, phiL) {
  let best = null;
  for (const phi of [10, 12, 14, 16]) {
    if (phi < phiL / 3) continue;
    for (const s of [0.15, 0.175, 0.20, 0.25, 0.30]) {
      const A = 2 * areaOf(phi) / s; if (A + 1e-9 < AtS) continue;
      if (!best || A < best.As - 1e-9) best = { phi, s, As: A };
    }
  }
  return best || { phi: 16, s: 0.15, As: 2 * areaOf(16) / 0.15, insufficient: true };
}
/** Longueur de scellement droit des barres du pieu dans la semelle. */
function anchorLen(phi, mat, code) {
  if (code === 'BAEL') { const ft = 0.6 + 0.06 * mat.fck, tau = 0.6 * 1.5 ** 2 * ft; return phi / 1000 * mat.fyk / (4 * tau); }
  return anchorage(phi, { fck: mat.fck, fyk: mat.fyk }).lbd;
}
/** Plan de ferraillage d'un pieu : élévation (échelle horizontale dilatée), moments, coupe, ancrage dans la semelle. */
export function pileRebarSchema(sup, L, code = 'EC') {
  const f = L[code].found; if (f.type === 'superficielle' || !f.D) return null;
  const D = f.D, Lp = f.Lpile, hs = f.hs, c = 0.07, mat = sup.sp.mat, isF = code === 'BAEL';
  const lb = pileBars(f.As, D, c), sh = f.shear.ELU, At = Math.max(sh.AtS || 0, sh.AtSmin || 0), hp = pileHoops(At, lb.phi);
  const ls = anchorLen(lb.phi, mat, code), lsShow = Math.min(ls, hs - 0.10);
  const g = f.psh && f.psh.gov.find(([lab]) => /M max/.test(lab)), fl = g ? g[1].psh.files.reduce((a, x) => (x.Mmax > a.Mmax ? x : a), g[1].psh.files[0]) : null;
  const ox = 140, oy = 60, sv = Math.min(30, 470 / (Lp + hs)), Wp = 96, Yp = z => oy + hs * sv + z * sv;
  const lx = ox + Wp + 70, mx = lx + 470, W = 1180;
  return svg({ largeur: W, hauteur: Yp(Lp) + 60, titre: `Ferraillage pieu ${nom(L)}`, contenu: () => {
    let o = texte(30, 20, `Ferraillage d'un pieu Ø ${f2(D)} m de la ${nom(L)} : élévation, coupe et liaison avec la semelle`, b12);
    o += rect(ox - 80, oy, Wp + 120, hs * sv) + texte(ox - 74, oy + 13, `semelle h = ${f2(hs)} m`, 'style="font-size:10.5px"');
    o += rect(ox, Yp(-0.1), Wp, (Lp + 0.1) * sv) + ligne(ox, Yp(0), ox + Wp, Yp(0), '#334155', 1, 'stroke-dasharray="4 3"');
    const cw = c / D * Wp, xb = [ox + cw + 3, ox + Wp / 2 - 10, ox + Wp / 2 + 10, ox + Wp - cw - 3];
    for (const x of xb) o += ligne(x, Yp(-0.1 - lsShow), x, Yp(Lp - 0.08), ACIER, 2.2);
    for (let z = 0; z < Lp - 0.08; z += Math.max(hp.s, Lp / 80)) o += ligne(ox + cw, Yp(z), ox + Wp - cw, Yp(z), REP, 0.9);
    o += cote(ox - 40, Yp(0), ox - 40, Yp(Lp), `L = ${f2(Lp)} m`) + cote(ox, Yp(Lp) + 20, ox + Wp, Yp(Lp) + 20, `Ø ${f2(D)}`);
    const zA = Math.min(2, Lp / 6); o += ligne(ox - 20, Yp(zA), ox + Wp + 20, Yp(zA), '#334155', 1, 'stroke-dasharray="8 4"') + texte(ox - 24, Yp(zA) + 4, 'A', 'text-anchor="end" style="font-weight:700"') + texte(ox + Wp + 24, Yp(zA) + 4, 'A', 'style="font-weight:700"');
    const r = (z, lab, xx = xb[3], col) => rappel(xx, Yp(z), lx, Yp(z), lab, col);
    o += rappel(xb[3], Yp(-0.1 - lsShow / 2), lx, oy + 6, `ancrage dans la semelle : l_s = ${f2(ls)} m (${f0(ls / lb.phi * 1000)} Ø)${ls > hs - 0.10 + 1e-9 ? ' > semelle : crosses' : ''}`);
    o += rappel(ox + Wp - 2, Yp(-0.05), lx, Yp(0.25), 'tête engagée de 10 cm, béton recépé');
    o += r(Lp * 0.08, `① ${HA(lb.n, lb.phi)} filants (${cm2(lb.As)} cm² ≥ ${cm2(f.As)} cm²)`, xb[3], ACIER);
    o += r(Lp * 0.22, `② cerces HA${hp.phi} e = ${esp(hp.s)} cm (2 brins : ${cm2(hp.As)} ≥ ${cm2(At)} cm²/m)`, ox + Wp / 2 + 20);
    o += r(Lp * 0.38, `enrobage ${f0(c * 100)} cm`, ox + Wp);
    o += r(Lp * 0.6, 'cage sur toute la hauteur, centreurs', ox + Wp / 2);
    if (Lp > 12) o += r(Lp * 0.8, 'cage en plusieurs éléments : recouvrement ≥ l_s', ox + Wp / 2);
    o += texte(ox - 70, Yp(Lp) + 46, '(échelle horizontale dilatée)', pt);
    // moments
    if (fl && fl.prof && fl.prof.length) {
      const Mm = Math.max(1, ...fl.prof.map(q => Math.abs(q.M))), ms = 110 / Mm, zMaxP = Math.min(Lp, Math.max(...fl.prof.map(q => q.z)));
      o += ligne(mx, Yp(0), mx, Yp(zMaxP), COULEURS.trait, 1) + texte(mx, Yp(0) - 12, `M (kN·m) — ${g[1].label}`, 'text-anchor="middle" style="font-size:11px"');
      o += poly([[mx, Yp(0)], ...fl.prof.map(q => [mx + q.M * ms, Yp(q.z)]), [mx, Yp(zMaxP)]], '#1d4ed8', 1.8, '#dbeafe', 'fill-opacity="0.7"');
      const qm = fl.prof.reduce((a, q) => (Math.abs(q.M) > Math.abs(a.M) ? q : a)), q0 = fl.prof[0];
      o += texte(mx + q0.M * ms + (q0.M < 0 ? -4 : 4), Yp(q0.z) + 12, f0(q0.M), `${q0.M < 0 ? 'text-anchor="end" ' : ''}style="font-size:11px;fill:#1d4ed8"`);
      if (qm !== q0) o += texte(mx + qm.M * ms + (qm.M < 0 ? -4 : 4), Yp(qm.z) + 4, `${f0(qm.M)} (${f1(qm.z)} m)`, `${qm.M < 0 ? 'text-anchor="end" ' : ''}style="font-size:11px;fill:#1d4ed8"`);
    }
    // coupe
    const cx = mx + 240, cy = oy + 120, R = 80;
    o += texte(cx, cy - R - 16, 'Coupe A-A', 'text-anchor="middle" style="font-size:12px;font-weight:700"');
    o += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${BET}" stroke="${COULEURS.betonTrait}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="${(R * (1 - 2 * c / D) + 2).toFixed(1)}" fill="none" stroke="${REP}" stroke-width="2"/>`;
    const rb = R * (1 - 2 * c / D) - 3; for (let k = 0; k < lb.n; k++) { const a = 2 * Math.PI * k / lb.n + Math.PI / lb.n; o += dot(cx + rb * Math.cos(a), cy + rb * Math.sin(a), Math.max(3, Math.min(6, lb.phi / 4))); }
    o += cote(cx - R, cy + R + 18, cx + R, cy + R + 18, `${f2(D)} m`);
    o += texte(cx, cy + R + 48, `${HA(lb.n, lb.phi)} ; cerces HA${hp.phi} e = ${esp(hp.s)}`, 'text-anchor="middle" style="font-size:11.5px"');
    const lines = [isF ? `béton de pieu f_c = ${f1(f.pileConc.fc)} MPa` : 'béton de pieu : γ_c × 1,1 (EC2 § 2.4.2.5)', `A_s calcul ${cm2(f.AsReq)} cm² ; minimum ${cm2(f.Amin)} cm²`,
      isF ? `τ_u = ${f2(sh.tau)} ≤ ${f2(sh.lim)} MPa` : `V = ${f0(f.shear.TmaxU)} kN ; V_Rd,c = ${f0(sh.VRdc)} kN`, `A_t/s requis ${cm2(At)} cm²/m (minimum ${cm2(sh.AtSmin)})`];
    lines.forEach((l, i) => { o += texte(cx - 120, cy + R + 84 + i * 20, l, 'style="font-size:11.5px"'); });
    return o;
  } });
}

/** Plan de ferraillage de la semelle sur deux files de pieux : bandes de tirants au droit des couples, coupe. */
export function capRebarSchema(sup, L, code = 'EC') {
  const f = L[code].found, t = f.tie; if (!t || f.nF !== 2) return null;
  const F = spOf(sup, L).found, B = F.B, hs = f.hs, Lf = f.W / (25 * B * hs), sP = F.sPile, D = f.D, nP = f.nP, b = wallWidth(sup.sp, L);
  // tirant par couple : barres dans la bande Ø + h_s
  let tb = null;
  for (const phi of [16, 20, 25, 32]) { const a = areaOf(phi), n = Math.max(4, Math.ceil(t.A1 / a - 1e-9)); if (t.band / n < 0.07 + phi / 1000) continue; const A = n * a; if (!tb || A < tb.As - 1e-9) tb = { phi, n, As: A }; }
  if (!tb) { const n = Math.ceil(t.A1 / areaOf(32)); tb = { phi: 32, n, As: n * areaOf(32), insufficient: true }; }
  const rep = chooseBars(t.A2, { phiMin: 12, phiMax: 25, sMax: 0.25, sMin: 0.10 });
  const k = Math.min(520 / Lf, 170 / B), ox = 60, oy = 70, Wp = Lf * k, Hp = B * k;
  const xsP = Array.from({ length: nP }, (_, j) => ox + Lf * (2 * j + 1) / (2 * nP) * k), ysP = [oy + (B / 2 - sP / 2) * k, oy + (B / 2 + sP / 2) * k];
  const lx = ox + Wp + 90, s = Math.min(70, 300 / B), cy = oy + Hp + 140, cx = ox + 30, yt = cy + 0.9 * s, yinf = yt + hs * s, W = Math.max(1000, lx + 420);
  return svg({ largeur: W, hauteur: yinf + 1.1 * s + 40, titre: `Ferraillage semelle sur pieux ${nom(L)}`, contenu: () => {
    let o = texte(30, 20, `Semelle de liaison de la ${nom(L)} sur deux files de pieux : tirants au droit des couples de pieux (PP73 1.3.2 ch. 4)`, b12);
    o += texte(ox, oy - 14, `Vue en plan, nappe inférieure (semelle ${f2(B)} × ${f2(Lf)} m)`, 'style="font-size:12px;font-weight:700"');
    o += rect(ox, oy, Wp, Hp);
    for (let y = rep.s; y < B - 0.05; y += rep.s) o += ligne(ox + 3, oy + y * k, ox + Wp - 3, oy + y * k, REP, 0.6);
    for (const xp of xsP) {
      o += rect(xp - t.band / 2 * k, oy + 2, t.band * k, Hp - 4, ACIER, 'none', 0, 'fill-opacity="0.08"');
      const nd = Math.min(tb.n, 30); for (let q = 0; q < nd; q++) { const x = xp - t.band / 2 * k + (q + 0.5) * t.band * k / nd; o += ligne(x, oy + 4, x, oy + Hp - 4, ACIER, 1.1); }
      for (const y of ysP) o += `<circle cx="${xp.toFixed(1)}" cy="${y.toFixed(1)}" r="${(D / 2 * k).toFixed(1)}" fill="none" stroke="#334155" stroke-width="1.3" stroke-dasharray="4 2"/>`;
    }
    o += rect(ox + 0.5 * k, oy + (B - b) / 2 * k, Wp - k, b * k, 'none', '#334155', 1, 'stroke-dasharray="4 3"');
    o += cote(xsP[0] - t.band / 2 * k, oy + Hp + 20, xsP[0] + t.band / 2 * k, oy + Hp + 20, f2(t.band));
    if (nP > 1) o += cote(xsP[0], oy + Hp + 48, xsP[1], oy + Hp + 48, f2(Lf / nP));
    o += cote(ox, oy + Hp + 76, ox + Wp, oy + Hp + 76, `L = ${f2(Lf)} m`) + cote(ox + Wp + 18, ysP[0], ox + Wp + 18, ysP[1], f2(sP)) + cote(ox + Wp + 48, oy, ox + Wp + 48, oy + Hp, f2(B));
    o += rappel(xsP[nP - 1] + t.band / 4 * k, oy + 0.15 * Hp, lx, oy + 10, `① tirant A₁ : ${HA(tb.n, tb.phi)} par bande de ${f2(t.band)} m`, ACIER);
    o += texte(lx + 4, oy + 30, `(${cm2(tb.As)} ≥ ${cm2(t.A1)} cm² par couple, ${t.A1S >= t.A1U ? 'ELS' : 'ELU'})`, `style="font-size:11.5px;fill:${ACIER}"`);
    o += rappel(ox + Wp - 0.3 * k, oy + 0.9 * Hp, lx, oy + 70, `② répartition A₂ ≥ A₁/3 : HA${rep.phi} e = ${esp(rep.s)} cm`);
    o += texte(lx + 4, oy + 90, `(${cm2(rep.As)} ≥ ${cm2(t.A2)} cm²/m), entre et sur les bandes`, 'style="font-size:11.5px"');
    o += texte(lx + 4, oy + 124, `pieux Ø ${f2(D)} m en pointillés (sous la nappe)`, pt);
    // coupe
    o += texte(ox, cy - 16, 'Coupe dans le sens B au droit d\'un couple de pieux', 'style="font-size:12px;font-weight:700"');
    const X = x => cx + x * s;
    o += rect(X((B - b) / 2), cy, b * s, 0.9 * s) + rect(X(0), yt, B * s, hs * s);
    for (const xp of [B / 2 - sP / 2, B / 2 + sP / 2]) {
      o += rect(X(xp - D / 2), yinf - 0.1 * s, D * s, 1.0 * s);
      for (const dx of [-0.39 * D, 0.39 * D]) o += ligne(X(xp + dx), yinf - Math.min(0.7, hs - 0.2) * s, X(xp + dx), yinf + 0.9 * s, ACIER, 1.5);
    }
    o += ligne(X(0), yinf, X(B), yinf, '#334155', 1.4);
    const ytir = yinf - 0.10 * s;
    o += poly([[X(0.07), yt + 0.1 * s], [X(0.07), ytir], [X(B - 0.07), ytir], [X(B - 0.07), yt + 0.1 * s]], ACIER, 3.4);
    o += ligne(X(0.1), yt + 0.08 * s, X(B - 0.1), yt + 0.08 * s, REP, 1.6);
    for (const sg of [-1, 1]) o += ligne(X(B / 2 + sg * b / 4), yt, X(B / 2 + sg * sP / 2), ytir, BIEL, 1.3, 'stroke-dasharray="6 4"');
    o += texte(X(B / 2 + sP / 4 + 0.2), yt + 0.45 * hs * s, `θ = ${f1(t.theta)}°`, `style="font-size:11px;fill:${BIEL}"`);
    o += cote(X(0), yinf + 1.05 * s, X(B), yinf + 1.05 * s, `B = ${f2(B)} m`) + cote(X(B / 2 - sP / 2), yinf + 0.72 * s, X(B / 2 + sP / 2), yinf + 0.72 * s, f2(sP)) + cote(X(0) - 16, yt, X(0) - 16, yinf, f2(hs));
    const lx2 = X(B) + 60;
    o += rappel(X(0.4 * B), yt + 0.08 * s, lx2, yt + 0.02 * s, 'nappe supérieure constructive');
    o += rappel(X(B - 0.07), yt + 0.5 * hs * s, lx2, yt + 0.5 * hs * s, `retours verticaux : ancrage au-delà de l'axe des pieux pour 0,8 R (${cm2(t.Aanchor)} cm²)`);
    o += rappel(X(0.62 * B), ytir, lx2, yinf - 0.02 * s, `① tirant A₁ au-dessus des têtes de pieux (h = ${f2(t.h)} m)`, ACIER);
    o += rappel(X(B / 2 + sP / 2 + 0.39 * D), yinf + 0.4 * s, lx2, yinf + 0.4 * s, 'attentes des pieux ancrées dans la semelle');
    o += texte(lx2 + 4, yinf + 0.95 * s, `bielles θ ${t.thetaOk ? '≥' : '<'} 45° ; h_s = ${f2(hs)} m ${t.hOk ? '≥' : '<'} max(0,60 ; 1,4 Ø) = ${f2(t.hmin)} m`, 'style="font-size:11.5px"');
    return o;
  } });
}
