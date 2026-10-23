/**
 * Assistant de saisie de l'onglet « Pont à poutres » : coupe transversale du tablier, section de la poutre VIPP avec ses
 * câbles (mi-travée et abouts) et élévation du câblage, dessinées en direct à partir du formulaire, avant tout calcul.
 * Chaque élément porte data-k = noms des champs qui le définissent (clignotement bleu au survol ou à la saisie).
 */
import { parsePoutres } from '../src/beams/run.js';
import { sectionVIPP, contourVIPP } from '../src/beams/vipp_section.js';
import { traceCables, UNITES } from '../src/beams/vipp.js';
import { positionsTorons, DEFAUTS_PRAD, TORONS } from '../src/beams/prad.js';

const F = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const g = (k, inner) => `<g data-k="${k}">${inner}</g>`;
const T = (x, y, s, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.fs || 11}" text-anchor="${o.a || 'middle'}"${o.c ? ` fill="${o.c}"` : ''}>${esc(s)}</text>`;
const cote = (x0, x1, y, txt, k) => g(k, `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="#2a8f6a"/><line x1="${x0}" x2="${x0}" y1="${y - 4}" y2="${y + 4}" stroke="#2a8f6a"/><line x1="${x1}" x2="${x1}" y1="${y - 4}" y2="${y + 4}" stroke="#2a8f6a"/>${T((x0 + x1) / 2, y - 4, txt, { c: '#2a8f6a', fs: 10 })}`);
const coteV = (x, y0, y1, txt, k, side = 'g') => g(k, `<line x1="${x}" x2="${x}" y1="${y0}" y2="${y1}" stroke="#2a8f6a"/><line x1="${x - 4}" x2="${x + 4}" y1="${y0}" y2="${y0}" stroke="#2a8f6a"/><line x1="${x - 4}" x2="${x + 4}" y1="${y1}" y2="${y1}" stroke="#2a8f6a"/>${T(x + (side === 'g' ? -5 : 5), (y0 + y1) / 2 + 4, txt, { c: '#2a8f6a', a: side === 'g' ? 'end' : 'start', fs: 10 })}`);
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" font-family="system-ui,sans-serif">${inner}</svg>`;
const COUL = ['#c8552b', '#d9902a'];   // 1re et 2e famille

/** Coupe transversale du tablier : poutres, hourdis, chaussée, trottoirs. */
function coupeTablier(inp, S) {
  const w = 760, h = 190, n = inp.n, b1 = inp.b1, W = n * b1, ys = Array.from({ length: n }, (_, k) => -W / 2 + b1 * (k + 0.5));
  const yMin = Math.min(-W / 2, inp.roadway.y1, ...inp.footways.map(f => f.y1)), yMax = Math.max(W / 2, inp.roadway.y2, ...inp.footways.map(f => f.y2));
  const Hb = S ? S.forme.hp : (inp.beam.H || 2) - inp.hd, k = (w - 80) / (yMax - yMin), kz = Math.min(k, 90 / (Hb + inp.hd)), sx = y => 40 + (y - yMin) * k, yT = 64, s = [];
  s.push(g('pt_hd pt_n pt_b1', `<rect x="${sx(-W / 2)}" y="${yT}" width="${W * k}" height="${inp.hd * kz}" fill="#c9d6c4" stroke="#456"/>`));
  ys.forEach(y => {
    const x = sx(y);
    if (S) {
      const pts = S.poutre.contour.pts.map(([px, py]) => `${(x + px * k).toFixed(1)},${(yT + inp.hd * kz + (S.forme.hp - py) * kz).toFixed(1)}`).join(' ');
      s.push(g('pt_hp pt_bt pt_b0v pt_bta pt_hpi pt_tpan pt_hte pt_pt pt_gt pt_n pt_b1', `<polygon points="${pts}" fill="#dfe7f1" stroke="#456"/>`));
    } else s.push(g('pt_n pt_b1', `<rect x="${x - 0.2 * k}" y="${yT + inp.hd * kz}" width="${0.4 * k}" height="${Hb * kz}" fill="#dfe7f1" stroke="#456"/>`));
  });
  s.push(g('pt_road', `<rect x="${sx(inp.roadway.y1)}" y="${yT - 10}" width="${(inp.roadway.y2 - inp.roadway.y1) * k}" height="6" fill="#555" opacity=".75"/>${T(sx((inp.roadway.y1 + inp.roadway.y2) / 2), yT - 16, `chaussée ${F(inp.roadway.y2 - inp.roadway.y1)} m`, { fs: 10.5 })}`));
  inp.footways.forEach(f => s.push(g('pt_foot', `<rect x="${sx(f.y1)}" y="${yT - 14}" width="${(f.y2 - f.y1) * k}" height="10" fill="#b9a17a" opacity=".8"/>`)));
  if (n > 1) s.push(cote(sx(ys[0]), sx(ys[1]), yT + (inp.hd + Hb) * kz + 22, `b₁ = ${F(b1)} m`, 'pt_b1'));
  s.push(T(40, 18, `${n} poutres ${inp.type === 'BA' ? 'en béton armé' : 'précontraintes'}, entraxe ${F(b1)} m, hourdis ${F(inp.hd)} m — largeur active 2b = ${F(W)} m`, { a: 'start', fs: 11.5 }));
  return svg(w, h, s.join(''));
}

/** Section de la poutre VIPP : contour, hourdis, centres de gravité, câbles à mi-travée et aux abouts. */
function sectionPoutre(inp, S, tr) {
  const w = 380, h = 300, f = S.forme, Ht = f.hp + inp.hd, bw = Math.max(inp.b1, f.bt), k = Math.min((h - 60) / Ht, (w - 120) / bw), cx = w / 2, y0 = 26;
  const sy = y => y0 + (Ht - y) * k, s = [];
  s.push(g('pt_hd pt_b1', `<rect x="${cx - inp.b1 * k / 2}" y="${sy(Ht)}" width="${inp.b1 * k}" height="${inp.hd * k}" fill="#c9d6c4" stroke="#456"/>`));
  const pts = S.poutre.contour.pts.map(([px, py]) => `${(cx + px * k).toFixed(1)},${sy(py).toFixed(1)}`).join(' ');
  s.push(g('pt_hp pt_bt pt_b0v pt_bta pt_hpi pt_tpan pt_hte pt_pt pt_gt', `<polygon points="${pts}" fill="#dfe7f1" stroke="#456" stroke-width="1.2"/>`));
  s.push(`<g data-k="pt_hp pt_bta pt_bt"><circle cx="${cx}" cy="${sy(S.poutre.yG)}" r="3" fill="#333"/><line x1="${cx}" x2="${cx + f.bt / 2 * k + 4}" y1="${sy(S.poutre.yG)}" y2="${sy(S.poutre.yG)}" stroke="#333" stroke-dasharray="2 2"/>${T(cx + f.bt / 2 * k + 6, sy(S.poutre.yG) + 4, `G poutre ${F(S.poutre.yG)} m`, { a: 'start', fs: 9.5 })}</g>`);
  s.push(`<g data-k="pt_hd pt_b1"><circle cx="${cx}" cy="${sy(S.comp.yG)}" r="3" fill="#2a6b2a"/><line x1="${cx}" x2="${cx + f.bt / 2 * k + 4}" y1="${sy(S.comp.yG)}" y2="${sy(S.comp.yG)}" stroke="#2a6b2a" stroke-dasharray="2 2"/>${T(cx + f.bt / 2 * k + 6, sy(S.comp.yG) + 4, `G composite ${F(S.comp.yG)} m`, { a: 'start', fs: 9.5, c: '#2a6b2a' })}</g>`);
  if (inp.vipp.adherence) {   // PRAD : torons du talon (pleins : adhérents ; vides : gainés), torons supérieurs
    const a = { ...DEFAUTS_PRAD, ...inp.vipp.adherence }, P = positionsTorons(a, f), r = Math.max(P.T.phi / 2 * k, 1.8), nG = a.groupes.reduce((q, gg) => q + gg.n, 0);
    P.pos.forEach((q, i) => s.push(g('pr_nt pr_e pr_cbas pr_g1n pr_g2n', `<circle cx="${cx + q.z * k}" cy="${sy(q.y)}" r="${r}" fill="${i % Math.max(1, Math.round(a.nt / Math.max(nG, 1))) === 0 && nG ? '#fff' : COUL[0]}" stroke="${COUL[0]}" stroke-width=".8"/>`)));
    for (let i = 0; i < (a.nsup || 0); i++) s.push(g('pr_nsup', `<circle cx="${cx + (i - (a.nsup - 1) / 2) * 0.10 * k}" cy="${sy(f.hp - a.cote)}" r="${r}" fill="${COUL[0]}"/>`));
    s.push(T(cx + f.bta / 2 * k + 6, sy(a.cBas) + 4, `${a.nt} torons ${a.type} (${nG} gainés)`, { a: 'start', fs: 9.5, c: COUL[0] }));
  }
  if (tr) {
    const r = Math.max(tr.u.phi / 2 * k, 2.5), n1 = tr.cab.length - Math.round(inp.vipp.cables.n2 || 0);
    tr.cab.forEach((cb, i) => {
      const col = COUL[i < n1 ? 0 : 1];
      s.push(g('pt_nc pt_n2 pt_parlit pt_cbas pt_ev pt_unite', `<circle cx="${cx + cb.zm * k}" cy="${sy(cb.ym)}" r="${r}" fill="${col}" stroke="#fff" stroke-width=".6"/>`));
      s.push(g('pt_yab pt_yah pt_nc', `<circle cx="${cx}" cy="${sy(cb.ya)}" r="${r * 0.8}" fill="none" stroke="${col}" stroke-dasharray="2 1.5"/>`));
    });
    s.push(T(cx + f.bta / 2 * k + 6, sy(tr.cab[0].ym) + 4, 'câbles à mi-travée', { a: 'start', fs: 9.5, c: COUL[0] }));
    s.push(T(cx - f.b0 / 2 * k - 6, sy(tr.cab[tr.cab.length - 1].ya) + 4, 'ancrages (about)', { a: 'end', fs: 9.5, c: COUL[0] }));
  }
  s.push(coteV(cx - f.bt / 2 * k - 12, sy(f.hp), sy(0), `h_p = ${F(f.hp)} m`, 'pt_hp'));
  s.push(coteV(cx - inp.b1 * k / 2 - 6, sy(Ht), sy(f.hp), `${F(inp.hd)}`, 'pt_hd'));
  s.push(cote(cx - f.bta / 2 * k, cx + f.bta / 2 * k, sy(0) + 16, `talon ${F(f.bta)} m`, 'pt_bta'));
  s.push(cote(cx - f.bt / 2 * k, cx + f.bt / 2 * k, sy(Ht) - 8, `table ${F(f.bt)} m`, 'pt_bt'));
  s.push(g('pt_b0v', T(cx + f.b0 / 2 * k + 4, sy(S.poutre.contour.yPan + 0.12), `âme ${F(f.b0 * 100, 0)} cm`, { a: 'start', fs: 9.5 })));
  return svg(w, h, s.join(''));
}

/** Élévation de la poutre et des câbles (échelle verticale dilatée). */
function elevation(inp, S, tr, L) {
  const w = 760, h = 240, f = S.forme, ml = 30, k = (w - ml - 30) / L, kz = 120 / (f.hp + inp.hd), sx = x => ml + x * k, yT = 52, sy = y => yT + (f.hp + inp.hd - y) * kz, s = [];
  s.push(g('pt_hd', `<rect x="${sx(0)}" y="${sy(f.hp + inp.hd)}" width="${L * k}" height="${inp.hd * kz}" fill="#c9d6c4" stroke="#456"/>`));
  s.push(g('pt_hp', `<rect x="${sx(0)}" y="${sy(f.hp)}" width="${L * k}" height="${f.hp * kz}" fill="#dfe7f1" stroke="#456"/>`));
  if (f.Lb > 0) for (const [a, b] of [[0, f.Lb], [L - f.Lb, L]]) s.push(g('pt_b0a pt_Lb', `<rect x="${sx(a)}" y="${sy(f.hp)}" width="${(b - a) * k}" height="${f.hp * kz}" fill="#a9bcd6" opacity=".45"/>`));
  if (tr) {
    const n1 = tr.cab.length - Math.round(inp.vipp.cables.n2 || 0);
    tr.cab.forEach((cb, i) => {
      const pts = []; for (let q = 0; q <= 40; q++) { const x = L * q / 40; pts.push(`${sx(x).toFixed(1)},${sy(tr.y(cb, x)).toFixed(1)}`); }
      s.push(g('pt_nc pt_n2 pt_cbas pt_ev pt_yab pt_yah pt_parlit', `<polyline fill="none" stroke="${COUL[i < n1 ? 0 : 1]}" stroke-width="1.6"${i < n1 ? '' : ' stroke-dasharray="6 3"'} points="${pts.join(' ')}"/>`));
    });
  }
  for (const x of [0, L]) s.push(`<path d="M${sx(x)} ${sy(0)} l-7 12 h14 z" fill="#fff" stroke="#333"/>`);
  s.push(cote(sx(0), sx(L), sy(0) + 30, `L = ${F(L)} m`, 'pt_spans'));
  s.push(T(sx(0), 16, 'Élévation de la poutre et câblage (échelle verticale dilatée)', { a: 'start', fs: 11.5 }), T(sx(0), 32, 'trait plein : 1re famille (poutre seule) ; tirets : 2e famille (après le hourdis) ; bleu : blochets d\'about', { a: 'start', fs: 10, c: '#555' }));
  return svg(w, h, s.join(''));
}

/** Les schémas et une synthèse en clair. */
export function schemasPoutres(d) {
  const inp = parsePoutres(d), L = Math.max(...inp.spans, 1);
  let S = null, tr = null;
  if (inp.geo === 'dims') { S = sectionVIPP(inp.vipp.forme, { b1: inp.b1, hd: inp.hd }); if (inp.type === 'BP') tr = traceCables(inp.vipp.cables, L, inp.vipp.forme); }
  // PRAD : élévation avec les zones gainées (traits interrompus)
  let elevPRAD = '';
  if (S && inp.vipp.adherence) {
    const a = { ...DEFAUTS_PRAD, ...inp.vipp.adherence }, f = S.forme, w = 760, h = 200, ml = 30, k = (w - ml - 30) / L, kz = 110 / (f.hp + inp.hd), sx = x => ml + x * k, sy = y => 46 + (f.hp + inp.hd - y) * kz, q = [];
    q.push(`<rect x="${sx(0)}" y="${sy(f.hp + inp.hd)}" width="${L * k}" height="${inp.hd * kz}" fill="#c9d6c4" stroke="#456"/><rect x="${sx(0)}" y="${sy(f.hp)}" width="${L * k}" height="${f.hp * kz}" fill="#dfe7f1" stroke="#456"/>`);
    q.push(`<line x1="${sx(0)}" x2="${sx(L)}" y1="${sy(a.cBas)}" y2="${sy(a.cBas)}" stroke="${COUL[0]}" stroke-width="2"/>`);
    // groupes gainés : lignes décalées de 9 px (lisibilité), étiquette au-dessus de la poutre, en escalier
    a.groupes.filter(gg => gg.n > 0).forEach((gg, j) => { const y = sy(a.cBas) - 9 * (j + 1), yl = sy(f.hp) + 14 + 13 * j; q.push(g(`pr_g${j + 1}n pr_g${j + 1}L`, `<line x1="${sx(0)}" x2="${sx(L)}" y1="${y}" y2="${y}" stroke="${COUL[1]}" stroke-width="1.6"/>` + [[0, gg.Lg], [L - gg.Lg, L]].map(([u0, u1]) => `<rect x="${sx(u0)}" y="${y - 3}" width="${(u1 - u0) * k}" height="6" fill="#fff" stroke="${COUL[1]}" stroke-dasharray="3 2"/>`).join('') + `<line x1="${sx(gg.Lg)}" x2="${sx(gg.Lg)}" y1="${y}" y2="${yl + 3}" stroke="${COUL[1]}" stroke-width=".6"/>` + T(sx(gg.Lg) + 4, yl, `G${j + 1} : ${gg.n} torons gainés sur ${F(gg.Lg)} m`, { a: 'start', fs: 9.5, c: COUL[1] }))); });
    if (a.nsup) q.push(g('pr_nsup', `<line x1="${sx(0)}" x2="${sx(L)}" y1="${sy(f.hp - a.cote)}" y2="${sy(f.hp - a.cote)}" stroke="${COUL[0]}" stroke-width="1.4"/>`));
    for (const x of [0, L]) q.push(`<path d="M${sx(x)} ${sy(0)} l-7 12 h14 z" fill="#fff" stroke="#333"/>`);
    q.push(T(sx(0), 16, 'Élévation de la poutre PRAD : torons rectilignes, zones gainées aux abouts (échelle verticale dilatée)', { a: 'start', fs: 11.5 }));
    elevPRAD = svg(w, h, q.join(''));
  }
  const out = { trans: coupeTablier(inp, S), section: S ? sectionPoutre(inp, S, tr) : '', elev: S && tr ? elevation(inp, S, tr, L) : elevPRAD, synthese: '' };
  const li = [];
  if (S) {
    li.push(`Poutre seule : A = ${F(S.poutre.A, 3)} m², I = ${F(S.poutre.I, 4)} m⁴, v' = ${F(S.poutre.yG, 3)} m ; avec hourdis (b₁) : A = ${F(S.comp.A, 3)} m², I = ${F(S.comp.I, 4)} m⁴, K = ${F(S.comp.K, 5)} m⁴.`);
    li.push(`Hauteur du tablier ${F(S.forme.hp + inp.hd)} m pour ${F(L)} m : élancement 1/${F(L / (S.forme.hp + inp.hd), 1)} (${inp.vipp.adherence ? 'dossier Sétra PRAD 73 : 1/18 à 1/20' : 'guide Sétra VIPP : 1/16 à 1/18'}).`);
  }
  if (tr) {
    const u = UNITES[inp.vipp.cables.unite] || tr.u, P0 = Math.min(0.8 * 1860, 0.9 * 1640) * u.Ap * 1000;
    li.push(`${tr.cab.length} câbles ${inp.vipp.cables.unite} (A_p = ${F(u.Ap * 1e4, 1)} cm² chacun, gaine ${F(u.phi * 1000, 0)} mm) dont ${Math.round(inp.vipp.cables.n2 || 0)} en 2e famille ; P₀ ≈ ${F(P0, 0)} kN par câble au vérin.`);
    for (const a of tr.alerte) li.push(`<span class="badge warn">ATTENTION</span> ${esc(a)}`);
  }
  if (inp.vipp.adherence) { const a = { ...DEFAUTS_PRAD, ...inp.vipp.adherence }, T0 = TORONS[a.type] || TORONS.T15S, P = Math.min(0.8 * 1860, 0.9 * 1640) * T0.A * 1000; li.push(`${a.nt} torons ${a.type} dans le talon${a.nsup ? ` et ${a.nsup} en table` : ''} ; tension sur banc ≈ ${F(P, 0)} kN par toron ; ${a.groupes.filter(gg => gg.n > 0).map(gg => `${gg.n} gainés sur ${F(gg.Lg)} m`).join(', ') || 'aucun gainage'}.`); }
  if (inp.geo !== 'dims') li.push('Section donnée par ses valeurs ou ses rectangles : répartition transversale et efforts par poutre ; choisir « dimensions d\'une poutre VIPP » pour la chaîne complète de précontrainte.');
  out.synthese = li.map(t => `<p class="small">${t.startsWith('<span') ? t : esc(t)}</p>`).join('');
  return out;
}
