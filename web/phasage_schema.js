/**
 * Assistant de saisie de l'onglet « Phasage » : élévation longitudinale, coupe transversale et chronologie des phases,
 * dessinées en direct à partir du formulaire, avant tout calcul. Chaque élément porte data-k = noms des champs qui le
 * définissent (clignotement bleu au survol ou à la saisie, comme pour les autres onglets).
 */
import { lirePhasage, lireFleau } from '../src/phasage/exemples.js';
import { caisson } from '../src/phasage/sections.js';

const F = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const g = (k, inner) => `<g data-k="${k}">${inner}</g>`;
const T = (x, y, s, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.fs || 11}" text-anchor="${o.a || 'middle'}"${o.c ? ` fill="${o.c}"` : ''}${o.rot ? ` transform="rotate(${o.rot} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}>${esc(s)}</text>`;
const cote = (x0, x1, y, txt, k) => g(k, `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="#2a8f6a"/><line x1="${x0}" x2="${x0}" y1="${y - 4}" y2="${y + 4}" stroke="#2a8f6a"/><line x1="${x1}" x2="${x1}" y1="${y - 4}" y2="${y + 4}" stroke="#2a8f6a"/>${T((x0 + x1) / 2, y - 4, txt, { c: '#2a8f6a' })}`);
const coteV = (x, y0, y1, txt, k, cote = 'g') => g(k, `<line x1="${x}" x2="${x}" y1="${y0}" y2="${y1}" stroke="#2a8f6a"/><line x1="${x - 4}" x2="${x + 4}" y1="${y0}" y2="${y0}" stroke="#2a8f6a"/><line x1="${x - 4}" x2="${x + 4}" y1="${y1}" y2="${y1}" stroke="#2a8f6a"/>${T(x + (cote === 'g' ? -5 : 5), (y0 + y1) / 2 + 4, txt, { c: '#2a8f6a', a: cote === 'g' ? 'end' : 'start' })}`);
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" font-family="system-ui,sans-serif">${inner}</svg>`;

/* ------------------------------------------------------------------------------------------- poutres */
function longPoutres(p) {
  const w = 760, h = 250, ml = 64, Lt = p.n * p.L, k = (w - ml - 20) / Lt, sx = x => ml + x * k, yT = 70, s = [];
  const H = p.forme ? p.forme.H : 1.4, hd = p.forme ? p.forme.hd : 0.25, kz = 80 / (H + hd), yb = yT + hd * kz, yB = yb + H * kz;
  s.push(g('ph_hd ph_bh ph_hA ph_t2', `<rect x="${sx(0)}" y="${yT}" width="${sx(Lt) - sx(0)}" height="${hd * kz}" fill="#c9d6c4" stroke="#456"/>`));
  for (let i = 0; i < p.n; i++) {
    const a = sx(i * p.L) + 2, b = sx((i + 1) * p.L) - 2;
    s.push(g('ph_H ph_pA ph_n ph_L', `<rect x="${a}" y="${yb}" width="${b - a}" height="${H * kz}" fill="#dfe7f1" stroke="#456"/>`));
    const yc = yb + (H - (p.forme ? p.forme.yG : H / 2)) * kz, pts = [];
    for (let q = 0; q <= 24; q++) { const xi = q / 24, e = p.cable.eAbout + (p.cable.eMi - p.cable.eAbout) * 4 * xi * (1 - xi); pts.push(`${(a + (b - a) * xi).toFixed(1)},${(yc - e * kz).toFixed(1)}`); }
    s.push(g('ph_eMi ph_eAb ph_P ph_P0 ph_Ap', `<polyline fill="none" stroke="#c8552b" stroke-width="1.8" points="${pts.join(' ')}"/>`));
    if (i === 0) {
      s.push(g('ph_eMi', `<line x1="${(a + b) / 2}" x2="${(a + b) / 2}" y1="${yc}" y2="${yc - p.cable.eMi * kz}" stroke="#c8552b" stroke-dasharray="2 2"/>${T((a + b) / 2 + 4, yc - p.cable.eMi * kz + 12, `e = ${F(p.cable.eMi)} m`, { a: 'start', c: '#c8552b', fs: 10 })}`));
      s.push(`<line x1="${a}" x2="${b}" y1="${yc}" y2="${yc}" stroke="#888" stroke-dasharray="6 3 1 3"/>`);
    }
    s.push(cote(sx(i * p.L), sx((i + 1) * p.L), yB + 30, `${F(p.L)} m`, 'ph_L ph_n'));
  }
  for (let i = 0; i <= p.n; i++) { const x = sx(i * p.L); s.push(g(i > 0 && i < p.n ? 'ph_t3' : 'ph_n', `<path d="M${x} ${yB} l-7 12 h14 z" fill="#fff" stroke="#333"/>`)); if (i > 0 && i < p.n) s.push(g('ph_t3', `<rect x="${x - 4}" y="${yT}" width="8" height="${yB - yT}" fill="#e9b949" opacity=".6"/>`)); }
  s.push(coteV(sx(0) - 10, yb, yB, `${F(H)} m`, 'ph_H'));
  s.push(T(sx(Lt), h - 4, `échelle verticale dilatée ×${F(80 / (H + hd) / k, 0)}`, { a: 'end', fs: 9.5, c: '#888' }));
  s.push(T(sx(0), yT - 26, `${p.n} travée(s) de ${F(p.L)} m — poutres préfabriquées, hourdis coulé en place, clavage sur appuis (en jaune)`, { a: 'start', fs: 11.5 }));
  s.push(g('ph_gsup ph_t4', T(sx(Lt), yT - 8, `superstructures ${F(p.gSup, 1)} kN/m`, { a: 'end', fs: 10.5, c: '#555' })));
  s.push(g('ph_P ph_P0 ph_pinst', T(sx(0), yT - 8, `câble : ${p.cable.P0 != null ? `P₀ = ${F(p.cable.P0, 0)} kN au vérin (pertes calculées)` : `P = ${F(p.cable.P, 0)} kN`}`, { a: 'start', fs: 10.5, c: '#c8552b' })));
  return svg(w, h, s.join(''));
}

function transPoutres(p) {
  const w = 360, h = 260, s = [];
  if (!p.forme) {
    s.push(T(w / 2, 40, 'Section saisie par ses valeurs (A, I, e) :', { fs: 12 }), T(w / 2, 62, 'choisir « par dimensions » pour la dessiner.', { fs: 11, c: '#666' }));
    s.push(g('ph_pA ph_pI', T(w / 2, 110, `poutre : A = ${F(p.poutre.A, 3)} m², I = ${F(p.poutre.I, 4)} m⁴`, { fs: 11.5 })));
    s.push(g('ph_hA ph_hI ph_he', T(w / 2, 134, `hourdis : A = ${F(p.hourdis.A, 3)} m², e = ${F(p.hourdis.e, 3)} m`, { fs: 11.5 })));
    return svg(w, h, s.join(''));
  }
  const f = p.forme, Ht = f.H + f.hd, k = Math.min((h - 70) / Ht, (w - 40) / f.bh), cx = w / 2, y0 = 30, sy = y => y0 + (Ht - y) * k, X = b => b * k / 2;
  s.push(g('ph_bh ph_hd', `<rect x="${cx - X(f.bh)}" y="${sy(Ht)}" width="${2 * X(f.bh)}" height="${f.hd * k}" fill="#c9d6c4" stroke="#456"/>`));
  s.push(g('ph_bt ph_ht', `<rect x="${cx - X(f.bt)}" y="${sy(f.H)}" width="${2 * X(f.bt)}" height="${f.ht * k}" fill="#dfe7f1" stroke="#456"/>`));
  s.push(g('ph_bw ph_H', `<rect x="${cx - X(f.bw)}" y="${sy(f.H - f.ht)}" width="${2 * X(f.bw)}" height="${(f.H - f.ht - f.hb) * k}" fill="#dfe7f1" stroke="#456"/>`));
  s.push(g('ph_bb ph_hb', `<rect x="${cx - X(f.bb)}" y="${sy(f.hb)}" width="${2 * X(f.bb)}" height="${f.hb * k}" fill="#dfe7f1" stroke="#456"/>`));
  // centres de gravité et câble
  s.push(`<g data-k="ph_H ph_bt ph_bw ph_bb"><circle cx="${cx}" cy="${sy(f.yG)}" r="3" fill="#333"/>${T(cx + X(f.bb) + 8, sy(f.yG) + 4, `c.d.g. poutre (${F(f.yG)} m)`, { a: 'start', fs: 10 })}</g>`);
  s.push(`<g data-k="ph_hd ph_bh"><circle cx="${cx}" cy="${sy(f.H + f.hd / 2)}" r="3" fill="#2a6b2a"/>${T(cx + X(f.bt) + 6, sy(f.H) + 14, `e = ${F(p.hourdis.e, 3)} m`, { a: 'start', fs: 10, c: '#2a6b2a' })}</g>`);
  s.push(g('ph_eMi', `<circle cx="${cx}" cy="${sy(f.yG + p.cable.eMi)}" r="4" fill="#c8552b"/>${T(cx - X(f.bb) - 6, sy(f.yG + p.cable.eMi) + 4, 'câble (mi-travée)', { a: 'end', fs: 10, c: '#c8552b' })}`));
  s.push(g('ph_eAb', `<circle cx="${cx}" cy="${sy(f.yG + p.cable.eAbout)}" r="3" fill="none" stroke="#c8552b"/>${T(cx + X(f.bw) + 6, sy(f.yG + p.cable.eAbout) - 8, 'câble (about)', { a: 'start', fs: 9.5, c: '#c8552b' })}`));
  s.push(cote(cx - X(f.bh), cx + X(f.bh), sy(Ht) - 8, `${F(f.bh)} m`, 'ph_bh'));
  s.push(coteV(cx + X(f.bh) + 10, sy(Ht), sy(f.H), `${F(f.hd)}`, 'ph_hd', 'd'));
  s.push(coteV(cx - X(f.bh) + 2, sy(f.H), sy(0), `H = ${F(f.H)} m`, 'ph_H', 'd'));
  s.push(cote(cx - X(f.bb), cx + X(f.bb), sy(0) + 16, `talon ${F(f.bb)} × ${F(f.hb)}`, 'ph_bb ph_hb'));
  s.push(T(cx, h - 6, `poutre A = ${F(p.poutre.A, 3)} m², I = ${F(p.poutre.I, 4)} m⁴ ; hourdis A = ${F(p.hourdis.A, 3)} m²`, { fs: 10, c: '#333' }));
  return svg(w, h, s.join(''));
}

/* ------------------------------------------------------------------------------------------- fléaux */
function longFleau(p) {
  const w = 760, h = 240, ml = 30, Lt = 4 * p.a, k = (w - 2 * ml) / Lt, sx = x => ml + x * k, kz = 70 / p.hp, yT = 60, s = [];
  const lv = (p.a - p.l0 / 2) / p.nv, hx = xi => p.hc + (p.hp - p.hc) * (1 - xi) ** 2;
  const bas = []; for (let q = 0; q <= 240; q++) { const x = Lt * q / 240, d = Math.min(Math.abs(x - p.a), Math.abs(x - 3 * p.a)); bas.push(`${sx(x).toFixed(1)},${(yT + hx(Math.min(d / p.a, 1)) * kz).toFixed(1)}`); }
  s.push(g('fl_hp fl_hc fl_a', `<polygon points="${sx(0)},${yT} ${sx(Lt)},${yT} ${bas.reverse().join(' ')}" fill="#dfe7f1" stroke="#456"/>`));
  for (const xp of [p.a, 3 * p.a]) {
    s.push(g('fl_l0', `<rect x="${sx(xp - p.l0 / 2)}" y="${yT}" width="${p.l0 * k}" height="${p.hp * kz}" fill="#b9cce4" stroke="#456"/>`));
    for (const sg of [-1, 1]) for (let q = 1; q <= p.nv; q++) { const x = xp + sg * (p.l0 / 2 + q * lv), d = Math.abs(x - xp); s.push(g('fl_nv fl_l0', `<line x1="${sx(x)}" x2="${sx(x)}" y1="${yT}" y2="${yT + hx(Math.min(d / p.a, 1)) * kz}" stroke="#7d8fa8" stroke-width=".7"/>`)); }
    // câbles de fléau (extrados) et pile
    s.push(g('fl_cP0 fl_cAp fl_enr', `<line x1="${sx(xp - p.a)}" x2="${sx(xp + p.a)}" y1="${yT + 3}" y2="${yT + 3}" stroke="#c8552b" stroke-width="1.6"/>`));
    s.push(g('fl_hp', `<rect x="${sx(xp) - 7}" y="${yT + p.hp * kz}" width="14" height="${h - 60 - yT - p.hp * kz}" fill="#bbb" stroke="#555"/>`));
  }
  // câbles de continuité (intrados, travée centrale)
  if (p.continuite.n > 0) { const c0 = 2 * p.a - p.continuite.nv * lv, c1 = 2 * p.a + p.continuite.nv * lv; s.push(g('fl_ccn fl_ccv fl_ccP0 fl_ccAp', `<line x1="${sx(c0)}" x2="${sx(c1)}" y1="${yT + p.hc * kz - 4}" y2="${yT + p.hc * kz - 4}" stroke="#8a4fb8" stroke-width="2"/>${T(sx(2 * p.a), yT + p.hc * kz + 14, `${p.continuite.n} câble(s) de continuité`, { fs: 10, c: '#8a4fb8' })}`)); }
  // équipage mobile (schéma) au bout du 3e voussoir du fléau 1, côté droit
  const xe = p.a + p.l0 / 2 + Math.min(3, p.nv) * lv;
  s.push(g('fl_Qeq fl_cyc', `<path d="M${sx(xe) - 2} ${yT - 2} l0 -16 l${lv * k + 8} 0 l0 ${p.hc * kz + 30}" fill="none" stroke="#b8860b" stroke-width="1.6"/>${T(sx(xe) + lv * k / 2, yT - 22, `équipage ${F(p.Qeq, 0)} kN`, { fs: 10, c: '#b8860b' })}`));
  for (const x of [0, Lt]) s.push(g('fl_tcl', `<path d="M${sx(x)} ${yT + p.hc * kz} l-7 12 h14 z" fill="#fff" stroke="#333"/>`));
  s.push(g('fl_tcl', `<rect x="${sx(2 * p.a) - 3}" y="${yT}" width="6" height="${p.hc * kz}" fill="#e9b949"/>`));
  s.push(cote(sx(0), sx(p.a), h - 34, `${F(p.a, 1)} m`, 'fl_a'), cote(sx(p.a), sx(3 * p.a), h - 34, `${F(2 * p.a, 1)} m`, 'fl_a'), cote(sx(3 * p.a), sx(Lt), h - 34, `${F(p.a, 1)} m`, 'fl_a'));
  s.push(coteV(sx(p.a) - 12, yT, yT + p.hp * kz, `${F(p.hp)} m`, 'fl_hp'), coteV(sx(2 * p.a) + 12, yT, yT + p.hc * kz, `${F(p.hc)} m`, 'fl_hc', 'd'));
  s.push(T(sx(0), yT - 34, `2 fléaux : voussoir sur pile ${F(p.l0, 1)} m + ${p.nv} paires de voussoirs de ${F(lv)} m ; clavage central (jaune)`, { a: 'start', fs: 11.5 }));
  return svg(w, h, s.join(''));
}

function transFleau(p) {
  const w = 420, s = [];
  let h = 230;
  if (!p.caisson) {
    s.push(T(w / 2, 40, 'Caisson saisi par ses valeurs :', { fs: 12 }), T(w / 2, 62, 'choisir « par dimensions » pour le dessiner.', { fs: 11, c: '#666' }));
    s.push(g('fl_Ap fl_Ac fl_Ic', T(w / 2, 110, `A pile ${F(p.Ap)} m², A clé ${F(p.Ac)} m², I clé ${F(p.Ic)} m⁴`, { fs: 11.5 })));
    return svg(w, h, s.join(''));
  }
  const c = p.caisson, k = Math.min(140 / p.hp, (w / 2 - 14) / c.B); h = 62 + p.hp * k + 12;
  const sec = (cx, hh, ti, tag, kk) => {
    const y0 = 62, sy = y => y0 + (hh - y) * k, X = b => b * k / 2, o = [];
    o.push(g('fl_B fl_ts', `<rect x="${cx - X(c.B)}" y="${sy(hh)}" width="${2 * X(c.B)}" height="${c.ts * k}" fill="#dfe7f1" stroke="#456"/>`));
    o.push(g(`fl_Bi ${kk}`, `<rect x="${cx - X(c.Bi)}" y="${sy(ti)}" width="${2 * X(c.Bi)}" height="${ti * k}" fill="#dfe7f1" stroke="#456"/>`));
    for (const sg of [-1, 1]) o.push(g('fl_bw', `<rect x="${cx + sg * X(c.Bi) - (sg > 0 ? c.bw * k : 0)}" y="${sy(hh - c.ts)}" width="${c.bw * k}" height="${(hh - c.ts - ti) * k}" fill="#dfe7f1" stroke="#456"/>`));
    const S = caisson({ ...c, ti }, hh);
    o.push(`<circle cx="${cx}" cy="${sy(S.yG)}" r="2.5" fill="#333"/>`);
    o.push(g('fl_enr', `<circle cx="${cx - X(c.Bi) + c.bw * k / 2}" cy="${sy(hh - p.cable.enrob)}" r="3" fill="#c8552b"/><circle cx="${cx + X(c.Bi) - c.bw * k / 2}" cy="${sy(hh - p.cable.enrob)}" r="3" fill="#c8552b"/>`));
    o.push(g(kk, T(cx, 44, `${tag} — h = ${F(hh)} m`, { fs: 10.5 }) + T(cx, 56, `A = ${F(S.A)} m², I = ${F(S.I)} m⁴`, { fs: 9.5, c: '#555' })));
    return o.join('');
  };
  s.push(sec(w * 0.27, p.hp, c.tip, 'sur pile', 'fl_tip fl_hp'), sec(w * 0.75, p.hc, c.tic, 'à la clé', 'fl_tic fl_hc'));
  s.push(T(w / 2, 16, `hourdis supérieur ${F(c.B)} × ${F(c.ts)} m ; inférieur ${F(c.Bi)} m ; âmes 2 × ${F(c.bw)} m`, { fs: 10.5 }));
  return svg(w, h, s.join(''));
}

/* ------------------------------------------------------------------------------------- chronologie */
function chrono(etapes, tFin, kFin) {
  const w = 760, h = 40 + 26 * etapes.length, ml = 250, mr = 20, W = w - ml - mr;
  const tMax = Math.max(...etapes.map(e => e.t1 ?? e.t)) * 1.15 || 1, sx = t => ml + Math.log10(1 + t) / Math.log10(1 + tMax) * W, s = [];
  for (const t of [1, 3, 7, 14, 28, 60, 90, 180, 365].filter(v => v <= tMax)) s.push(`<line x1="${sx(t)}" x2="${sx(t)}" y1="22" y2="${h - 8}" stroke="#eee"/>`, T(sx(t), 16, `${t} j`, { fs: 9.5, c: '#777' }));
  etapes.forEach((e, i) => {
    const y = 30 + 26 * i;
    s.push(g(e.k, `${T(ml - 8, y + 12, e.nom, { a: 'end', fs: 11 })}${e.t1 != null ? `<rect x="${sx(e.t)}" y="${y + 2}" width="${Math.max(3, sx(e.t1) - sx(e.t))}" height="14" fill="${e.c || '#0b5fa5'}" opacity=".8"/>` : `<circle cx="${sx(e.t)}" cy="${y + 9}" r="6" fill="${e.c || '#0b5fa5'}"/>`}${T(sx(e.t1 ?? e.t) + 8, y + 13, e.t1 != null ? `${F(e.t, 0)} → ${F(e.t1, 0)} j` : `${F(e.t, 0)} j`, { a: 'start', fs: 10, c: '#333' })}`));
  });
  s.push(g(kFin, T(w - mr, h - 2, `puis effets différés jusqu'à ${F(tFin, 0)} j (${F(tFin / 365.25, 0)} ans)`, { a: 'end', fs: 10, c: '#666' })));
  return svg(w, h, s.join(''));
}

/** Schémas en direct : { long, trans, chrono, synthese } (HTML). */
export function schemasPhasage(d) {
  if (d.ph_type === 'mixte') return schemasMixte(d);
  if (d.ph_type === 'fleau') {
    const p = lireFleau(d), D = p.dates, lv = (p.a - p.l0 / 2) / p.nv;
    const et = [
      { nom: 'Voussoirs sur pile, câbles 0', t: D.durc, k: 'fl_dur fl_l0', c: '#456' },
      { nom: `Voussoirs 1 à ${p.nv} (cycle ${F(D.cycle, 0)} j)`, t: D.cycle, t1: p.nv * D.cycle + D.durc, k: 'fl_cyc fl_dur fl_nv' },
      { nom: 'Clavages, appareils d’appui', t: D.clavage, k: 'fl_tcl', c: '#e9b949' },
      { nom: 'Câbles de continuité', t: D.continuite, k: 'fl_tcc fl_ccn', c: '#8a4fb8' },
      { nom: 'Superstructures', t: D.superstructures, k: 'fl_tsup fl_gsup', c: '#2a8f6a' },
    ];
    const ok = D.cycle > D.durc && D.clavage >= p.nv * D.cycle + D.durc && D.continuite >= D.clavage && D.superstructures >= D.continuite;
    return { long: longFleau(p), trans: transFleau(p), chrono: chrono(et, D.fin, 'fl_tfin'),
      synthese: `<p class="small">${ok ? '<span class="badge ok">OK</span>' : '<span class="badge warn">ATTENTION</span> dates incohérentes : le cycle doit dépasser l’âge au décoffrage, et le clavage suivre le dernier voussoir (' + F(p.nv * D.cycle + D.durc, 0) + ' j). '} Ouvrage ${F(p.a, 1)} – ${F(2 * p.a, 1)} – ${F(p.a, 1)} m ; ${p.cable.n * (p.nv + 1)} câbles de fléau par fléau et ${p.continuite.n} de continuité ; voussoirs de ${F(lv)} m ; poids d’un voussoir courant ≈ ${F(p.gBeton * p.Ac * lv, 0)} kN à la clé, ${F(p.gBeton * p.Ap * lv, 0)} kN près de la pile.</p>` };
  }
  const p = lirePhasage(d), D = p.dates;
  const et = [
    { nom: 'Poutres posées, précontraintes', t: D.tension, k: 'ph_t1 ph_P ph_P0', c: '#456' },
    { nom: 'Coulage du hourdis', t: D.hourdis, k: 'ph_t2 ph_hd ph_hA', c: '#2a6b2a' },
    { nom: 'Clavage sur appuis', t: D.continuite, k: 'ph_t3', c: '#e9b949' },
    { nom: 'Superstructures', t: D.superstructures, k: 'ph_t4 ph_gsup', c: '#2a8f6a' },
  ];
  const ok = D.tension <= D.hourdis && D.hourdis <= D.continuite && D.continuite <= D.superstructures && D.superstructures <= D.fin;
  const masse = (p.poutre.A + p.hourdis.A) * p.gBeton;
  return { long: longPoutres(p), trans: transPoutres(p), chrono: chrono(et, D.fin, 'ph_t5'),
    synthese: `<p class="small">${ok ? '<span class="badge ok">OK</span>' : '<span class="badge warn">ATTENTION</span> dates non croissantes. '} Section composée : poutre ${F(p.poutre.A, 3)} m² + hourdis ${F(p.hourdis.A, 3)} m² (poids ${F(masse, 1)} kN/m) ; contrainte moyenne de précontrainte sur la poutre ≈ ${F((p.cable.P0 ?? p.cable.P) / p.poutre.A / 1000, 1)} MPa ; moment isostatique sous poids propre et hourdis ${F(masse * p.L ** 2 / 8, 0)} kN·m par travée.</p>` };
}

/* -------------------------------------------------------------------------------------- pont mixte */
import { lireBipoutre, transversal } from '../src/mixte/bipoutre.js';

function longMixte(p) {
  const w = 760, h = 230, ml = 60, Lt = p.L.reduce((a, b) => a + b, 0), k = (w - ml - 20) / Lt, sx = x => ml + x * k, yT = 70, s = [];
  const Ht = p.travee.tfi + p.travee.hw + p.travee.tfs, kz = 70 / (Ht + p.hc), yd = yT + p.hc * kz, ya = yd + Ht * kz;
  const x0 = [0]; p.L.forEach((l, i) => x0.push(x0[i] + l));
  // plots : travées (ordre 1…n) puis appuis
  let q = 0;
  const zones = [];
  p.L.forEach((l, i) => { const a = x0[i] + (i > 0 ? p.zone * l : 0), b = x0[i + 1] - (i < p.L.length - 1 ? p.zone * l : 0); zones.push({ a, b, n: ++q, appui: false }); });
  for (let j = 1; j < p.L.length; j++) zones.push({ a: x0[j] - p.zone * p.L[j - 1], b: x0[j] + p.zone * p.L[j], n: ++q, appui: true });
  for (const z of zones) {
    s.push(g('mx_hc mx_t1 mx_cad', `<rect x="${sx(z.a)}" y="${yT}" width="${(z.b - z.a) * k}" height="${p.hc * kz}" fill="${z.appui ? '#e8d9a8' : '#c9d6c4'}" stroke="#456"/>${T(sx((z.a + z.b) / 2), yT + p.hc * kz / 2 + 4, String(z.n), { fs: 10, c: '#333' })}`));
    if (z.appui && p.fissuration) s.push(g('mx_fiss mx_rhoa', `<line x1="${sx(z.a)}" x2="${sx(z.b)}" y1="${yT - 4}" y2="${yT - 4}" stroke="#d1335b" stroke-width="2" stroke-dasharray="4 3"/>`));
  }
  p.L.forEach((l, i) => {
    const a = x0[i], b = x0[i + 1];
    const ta = i > 0 ? a + p.zone * l : a, tb = i < p.L.length - 1 ? b - p.zone * l : b;
    s.push(g('mx_thw mx_ttfi mx_ttfs', `<rect x="${sx(ta)}" y="${yd}" width="${(tb - ta) * k}" height="${Ht * kz}" fill="#dfe7f1" stroke="#456"/>`));
    if (i > 0) s.push(g('mx_ahw mx_atfi mx_atfs', `<rect x="${sx(a)}" y="${yd}" width="${(ta - a) * k}" height="${Ht * kz}" fill="#b9cce4" stroke="#456"/>`));
    if (i < p.L.length - 1) s.push(g('mx_ahw mx_atfi mx_atfs', `<rect x="${sx(tb)}" y="${yd}" width="${(b - tb) * k}" height="${Ht * kz}" fill="#b9cce4" stroke="#456"/>`));
    s.push(cote(sx(a), sx(b), ya + 34, `${F(l, 1)} m`, 'mx_L'));
  });
  for (const x of x0) s.push(g('mx_L', `<path d="M${sx(x)} ${ya} l-7 12 h14 z" fill="#fff" stroke="#333"/>`));
  s.push(coteV(sx(0) - 8, yd, ya, `${F(Ht)} m`, 'mx_thw'));
  s.push(T(sx(0), yT - 26, `Charpente continue posée à 0 j ; dalle bétonnée par plots dans l'ordre indiqué (travées puis appuis, ${F(p.dates.cadence, 0)} j d'intervalle)`, { a: 'start', fs: 11 }));
  if (p.fissuration) s.push(g('mx_fiss', T(sx(Lt), yT - 10, 'zones fissurées (15 %) en tireté rouge', { a: 'end', fs: 10, c: '#d1335b' })));
  return svg(w, h, s.join(''));
}

function transMixte(p) {
  const w = 420, h = 230, s = [], TR = transversal(p), Ht = p.travee.tfi + p.travee.hw + p.travee.tfs, k = Math.min((w - 30) / p.largeur, 120 / (Ht + p.hc + p.hg));
  const cx = w / 2, y0 = 40, X = x => cx + x * k, Y = y => y0 + y * k;
  s.push(g('mx_B mx_hc', `<rect x="${X(-p.largeur / 2)}" y="${Y(0)}" width="${p.largeur * k}" height="${p.hc * k}" fill="#c9d6c4" stroke="#456"/>`));
  for (let i = 0; i < p.nPoutres; i++) {
    const xp = -p.largeur / 2 + TR.debord + i * p.entraxe, P = p.travee, yb = p.hc + p.hg;
    s.push(g('mx_hg', `<rect x="${X(xp - P.bfs / 2)}" y="${Y(p.hc)}" width="${P.bfs * k}" height="${p.hg * k}" fill="#c9d6c4" stroke="#456"/>`));
    s.push(g('mx_tbfs mx_ttfs', `<rect x="${X(xp - P.bfs / 2)}" y="${Y(yb)}" width="${P.bfs * k}" height="${Math.max(P.tfs * k, 1.5)}" fill="#7d8fa8"/>`));
    s.push(g('mx_thw mx_ttw', `<rect x="${X(xp) - Math.max(P.tw * k, 1.5) / 2}" y="${Y(yb + P.tfs)}" width="${Math.max(P.tw * k, 1.5)}" height="${P.hw * k}" fill="#7d8fa8"/>`));
    s.push(g('mx_tbfi mx_ttfi', `<rect x="${X(xp - P.bfi / 2)}" y="${Y(yb + P.tfs + P.hw)}" width="${P.bfi * k}" height="${Math.max(P.tfi * k, 1.5)}" fill="#7d8fa8"/>`));
  }
  // poutre étudiée et sa part de dalle
  const x1 = -p.largeur / 2, x2 = x1 + TR.part;
  s.push(g('mx_e mx_B mx_np', `<rect x="${X(x1)}" y="${Y(0) - 12}" width="${(x2 - x1) * k}" height="6" fill="#0b5fa5" opacity=".5"/>${T(X((x1 + x2) / 2), Y(0) - 16, `poutre étudiée : ${F(TR.part)} m de dalle`, { fs: 10, c: '#0b5fa5' })}`));
  s.push(cote(X(-p.largeur / 2), X(p.largeur / 2), Y(Ht + p.hc + p.hg) + 22, `${F(p.largeur)} m`, 'mx_B'));
  if (p.nPoutres > 1) { const xa = -p.largeur / 2 + TR.debord; s.push(cote(X(xa), X(xa + p.entraxe), Y(Ht + p.hc + p.hg) + 8, `${F(p.entraxe)} m`, 'mx_e')); }
  s.push(T(cx, h - 6, `${p.nPoutres} poutres PRS de ${F(Ht)} m (L/${F(Math.max(...p.L) / Ht, 0)}), dalle ${F(p.hc)} m`, { fs: 10.5 }));
  return svg(w, h, s.join(''));
}

export function schemasMixte(d) {
  const p = lireBipoutre(d), D = p.dates, nPlots = 2 * p.L.length - 1;
  const et = [{ nom: 'Charpente posée', t: 0.5, k: 'mx_L', c: '#7d8fa8' },
    { nom: `Bétonnage de ${nPlots} plots`, t: D.debut, t1: D.debut + (nPlots - 1) * D.cadence + 1, k: 'mx_t1 mx_cad' },
    { nom: 'Superstructures', t: D.superstructures, k: 'mx_t4 mx_gsup', c: '#2a8f6a' }];
  const ok = D.superstructures >= D.debut + (nPlots - 1) * D.cadence + 1;
  let syn;
  try { const TR = transversal(p); syn = `${ok ? '<span class="badge ok">OK</span>' : '<span class="badge warn">ATTENTION</span> superstructures avant la fin du bétonnage. '} Poutre de rive : ${F(TR.part)} m de dalle, débord ${F(TR.debord)} m ; acier de travée ${F((p.travee.bfi * p.travee.tfi + p.travee.hw * p.travee.tw + p.travee.bfs * p.travee.tfs) * 7850 * p.majAcier, 0)} kg/m, sur appui ${F((p.appui.bfi * p.appui.tfi + p.appui.hw * p.appui.tw + p.appui.bfs * p.appui.tfs) * 7850 * p.majAcier, 0)} kg/m.`; }
  catch (e) { syn = `<span class="badge warn">ATTENTION</span> ${e.message}`; }
  return { long: longMixte(p), trans: transMixte(p), chrono: chrono(et, D.fin, 'mx_t5'), synthese: `<p class="small">${syn}</p>` };
}
