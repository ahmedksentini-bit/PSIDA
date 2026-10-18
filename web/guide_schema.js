/**
 * Schémas de l'ouvrage dans la représentation du guide de conception SETRA « Ponts-dalles » (1989, § 2.1 et 2.3) : dessin
 * au trait noir sur fond blanc — élévation (tablier mince, piles voiles ou colonnes sur semelles, culées avec talus de
 * remblai figuré par des traits rayonnants, terrain naturel, cotes) et coupe transversale (dalle avec chanfreins ou
 * encorbellements tramés, corniches, trottoirs et bordures, chaussée avec dévers, appareils d'appui, cotes).
 * Utilisés dans l'onglet Projet (saisie en direct) et dans les notes de calcul.
 */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
import { notionalLanes } from '../src/loads_ec.js';
import { classePont } from '../src/loads_f61.js';
const fr = (v, d = 2) => (Number.isFinite(v) ? Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—');
let UID = 0;
/** Groupe repéré par les noms des champs du formulaire (surbrillance au survol d'un champ de l'onglet Projet). */
const K = (k, c) => (c ? `<g data-k="${k}">${c}</g>` : '');
const INK = '#111', THIN = 0.8, MED = 1.3, BOLD = 1.9;
const head = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="'Arial Narrow', Arial, Helvetica, sans-serif" font-size="12" fill="${INK}" role="img" aria-label="${esc(label)}" style="background:#fff">
<defs><pattern id="g89enc" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.7" fill="${INK}" opacity="0.55"/></pattern>
<pattern id="g89sol" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="${INK}" stroke-width="0.5" opacity="0.45"/></pattern>
<marker id="g89ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9" fill="none" stroke="${INK}" stroke-width="1.3"/></marker></defs>`;
const L_ = (x1, y1, x2, y2, w = THIN, extra = '') => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${w}" ${extra}/>`;
const T_ = (x, y, s, a = 'middle', extra = '') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${a}" ${extra}>${esc(s)}</text>`;
/** Cote horizontale à flèches ouvertes (style dessin technique). */
function coteH(x1, x2, y, s, above = false) {
  return `${L_(x1, y - 4, x1, y + 4)}${L_(x2, y - 4, x2, y + 4)}<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${INK}" stroke-width="${THIN}" marker-start="url(#g89ar)" marker-end="url(#g89ar)"/>${T_((x1 + x2) / 2, y + (above ? -5 : 14), s)}`;
}
function coteV(x, y1, y2, s, left = false) {
  return `${L_(x - 4, y1, x + 4, y1)}${L_(x - 4, y2, x + 4, y2)}<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${INK}" stroke-width="${THIN}" marker-start="url(#g89ar)" marker-end="url(#g89ar)"/>${T_(x + (left ? -6 : 6), (y1 + y2) / 2 + 4, s, left ? 'end' : 'start')}`;
}

/**
 * Élévation (coupe longitudinale suivant l'axe), guide 1989 § 2.1.
 * @param {object} g géométrie (spans, h, overhangs, tirantAir, xFixed) ; @param {object} sp appuis (pile, culee, found) facultatif
 */
export function guideElevationSVG(g, sp = null) {
  const W = 1000;
  if (!g || !g.spans || !g.spans.length) return `${head(W, 60, 'Élévation')}${T_(20, 35, 'Saisir les portées pour voir l\'élévation.', 'start')}</svg>`;
  const P = { type: 'voile', H: [6], b: 0.6, nCol: 3, D: 0.8, hc: 0, ...(sp?.pile || {}) }, C = { type: 'remblayee', Hm: 3, em: 0.8, hc: 1, ...(sp?.culee || {}) };
  const F = { type: 'superficielle', B: 3, hs: 1, De: 1, pileD: 0.8, Lpile: 15, nFiles: 2, sPile: 2.4, ...(sp?.found || {}) };
  const piles = F.type !== 'superficielle', rem = C.type === 'remblayee';
  const [aL, aR] = g.overhangs || [0, 0], L = g.spans.reduce((a, b) => a + b, 0), x0 = [0]; g.spans.forEach(v => x0.push(x0[x0.length - 1] + v));
  const Hp = i => { const v = [].concat(P.H); return v[Math.min(v.length - 1, i - 1)] ?? v[0]; };
  const h = g.h || 0.6, nP = x0.length - 2;
  const Hmax = Math.max(nP ? Math.max(...Array.from({ length: nP }, (_, k) => Hp(k + 1))) : 0, (C.Hm || 3) + (rem ? 0 : C.hc), 3);
  const back = Math.max(3, 0.08 * L);                                      // remblai d'accès figuré derrière les culées
  const xL = -aL - back, xR = L + aR + back;
  const m = { l: 40, r: 40, t: 78 }, sx = (W - m.l - m.r) / (xR - xL);
  const zTN = Hmax + 0.15, zFd = zTN + Math.max(F.De, F.hs);               // TN ; base des semelles
  const zTop = -(h + 0.4), zBot = zFd + (piles ? Math.min(F.Lpile, 6) : 0.4);
  const sz = Math.min(sx * 2.5, 250 / (zBot - zTop));                      // échelle verticale amplifiée (dessin de principe)
  const X = x => m.l + (x - xL) * sx, Z = z => m.t + (z - zTop) * sz;
  const R = (x, z, w, hh, extra = '') => `<rect x="${X(x).toFixed(1)}" y="${Z(z).toFixed(1)}" width="${Math.max(w * sx, 3).toFixed(1)}" height="${Math.max(hh * sz, 2).toFixed(1)}" fill="#fff" stroke="${INK}" stroke-width="${MED}" ${extra}/>`;
  const yDims = Z(zBot) + 22, H = Math.ceil(yDims + 56);
  const clip = `g89clip${++UID}`;
  let s = head(W, H, 'Élévation de l\'ouvrage') + `<clipPath id="${clip}"><rect x="${m.l - 6}" y="0" width="${W - m.l - m.r + 12}" height="${H}"/></clipPath>`;
  s += T_(m.l, 20, 'ÉLÉVATION — COUPE LONGITUDINALE', 'start', 'font-weight="700" font-size="13"');
  s += T_(m.l, 38, `${g.spans.length} travée${g.spans.length > 1 ? 's' : ''} : ${g.spans.map(v => fr(v)).join(' + ')} = ${fr(L)} m${aL || aR ? ` ; abouts ${fr(aL)} / ${fr(aR)} m` : ''} ; épaisseur ${fr(h, 2)} m ; culées ${rem ? 'remblayées' : C.type === 'apparente' ? 'apparentes (colonnes devant le talus)' : 'enterrées (noyées dans le talus)'} ; fondations ${piles ? 'sur pieux' : 'superficielles'}`, 'start', 'font-size="11"');
  s += T_(m.l, 54, 'Dessin de principe, échelle verticale amplifiée (représentation du guide SETRA « Ponts-dalles », 1989).', 'start', 'font-size="10" font-style="italic"');
  s += `<g clip-path="url(#${clip})">`;
  // semelle (et pieux) sous un appui
  const fondation = (xa, B) => {
    let f = K('ap_found ap_B ap_hs ap_De', R(xa - B / 2, zFd - F.hs, B, F.hs)), pp = '';
    if (piles) {
      const n = Math.max(1, Math.round(F.nFiles)), Lp = zBot - zFd - 0.15;
      for (let k = 0; k < n; k++) {
        const xp = xa + (n === 1 ? 0 : (k - (n - 1) / 2) * Math.min(F.sPile, (B - F.pileD) / Math.max(1, n - 1)));
        for (const dx of [-F.pileD / 2, F.pileD / 2]) pp += L_(X(xp + dx), Z(zFd), X(xp + dx), Z(zFd + Lp), THIN);
        pp += `<path d="M${X(xp - F.pileD / 2 - 0.2).toFixed(1)},${Z(zFd + Lp).toFixed(1)} l${(0.35 * sx).toFixed(1)},-4 l${(0.3 * sx).toFixed(1)},8 l${((F.pileD - 0.25) * sx).toFixed(1)},-4" fill="none" stroke="${INK}" stroke-width="${THIN}"/>`;
      }
    }
    return f + K('ap_found ap_pileD ap_Lpile ap_nFiles ap_sPile ap_nPile ap_pieu ap_incl', pp);
  };
  // terrain naturel (ligne et hachures courtes) entre les culées
  const xg0 = rem ? 0 : -aL, xg1 = rem ? L : L + aR;
  s += L_(X(xL), Z(zTN), X(xR), Z(zTN), MED);
  for (let x = xL + 0.3; x < xR; x += (xR - xL) / 80) s += L_(X(x), Z(zTN), X(x) - 5, Z(zTN) + 6, 0.55);
  void xg0; void xg1;
  // tablier : dalle (amplifiée), corniche et garde-corps
  const hPx = Math.max(6, h * sz), yDeckTop = Z(0) - hPx;
  // culées
  [[0, -1, aL], [g.spans.length, 1, aR]].forEach(([i, dir, about]) => {
    const xa = x0[i], xEnd = xa + dir * about, wGG = Math.max(0.3, 6 / sx);
    const xBackFace = xEnd + dir * wGG;
    // garde-grève (au droit de l'about)
    s += K('overhangs ap_hGG', `<rect x="${Math.min(X(xEnd), X(xBackFace)).toFixed(1)}" y="${yDeckTop.toFixed(1)}" width="${(wGG * sx).toFixed(1)}" height="${(Z(0.15) - yDeckTop).toFixed(1)}" fill="#fff" stroke="${INK}" stroke-width="${MED}"/>`);
    // chaussée d'accès (niveau de la route) derrière la culée
    s += L_(X(xBackFace), yDeckTop, X(dir < 0 ? xL : xR), yDeckTop, MED);
    s += T_(X((xBackFace + (dir < 0 ? xL : xR)) / 2), yDeckTop - 4, 'remblai', 'middle', 'font-size="10" font-style="italic"');
    if (rem) {
      // mur de front et semelle ; le remblai est retenu par le mur (mur en retour figuré en tireté)
      const bW = Math.max(C.em || 0.8, 0.5);
      s += K('ap_culType ap_Hm ap_em', R(xa - bW / 2, 0.15, bW, zFd - F.hs - 0.15));
      const Lr = Math.min(C.Lret || 4, back * 0.9), xw = xa + dir * bW / 2, hEnd = Math.min(1.2, zTN * 0.3), hRoot = Math.min(zFd - F.hs - 0.15, Math.max(hEnd + 0.5, 0.7 * zTN));
      s += K('ap_Lret', `<polygon points="${X(xw)},${Z(0.15)} ${X(xw + dir * Lr)},${Z(0.15)} ${X(xw + dir * Lr)},${Z(0.15 + hEnd)} ${X(xw)},${Z(0.15 + hRoot)}" fill="none" stroke="${INK}" stroke-width="${THIN}" stroke-dasharray="5 3"/>`);
      s += fondation(xa, F.B);
    } else {
      // sommier (chevêtre) sur colonnes ; talus 3/2 avec traits rayonnants issus de la crête (symbole du guide)
      const lS = Math.max(C.lc || 1.6, 1), hS = Math.max(C.hc || 1, 0.6), app = C.type === 'apparente';
      s += K('ap_culType ap_culHc ap_culLc', R(xa - lS / 2, 0.15, lS, hS));
      const zCrest = 0.15 + hS + (app ? 0.3 : 0), run = 1.5 * (zTN - zCrest);
      // noyée : la crête est au nu avant du sommier et le talus descend vers la travée ; apparente : le pied du talus
      // est au droit des colonnes (visibles devant le talus) et la crête recule derrière le chevêtre
      const xCrest = app ? xa + dir * (lS / 2 + run - 0.5) : xa - dir * lS / 2, xToe = app ? xa - dir * 0.5 : xCrest - dir * run;
      if (app && C.hv > 0) s += K('ap_culHv', R(xa + (dir > 0 ? lS / 2 - 0.25 : -lS / 2), 0.15 + hS, 0.25, Math.min(C.hv, zTN - 0.15 - hS)));
      s += K('ap_culType ap_culD ap_culNCol ap_Hm', [-0.35, 0.35].map(dx => L_(X(xa + dx), Z(0.15 + hS), X(xa + dx), Z(zFd - F.hs), app ? MED : THIN, app ? '' : 'stroke-dasharray="5 3"')).join(''));
      s += L_(X(xCrest), Z(zCrest), X(xToe), Z(zTN), MED);
      if (app) s += L_(X(xCrest), Z(zCrest), X(xa + dir * lS / 2), Z(zCrest), THIN);
      for (let k = 1; k <= 9; k++) { const xe = xCrest + (xToe - xCrest) * k / 10; s += L_(X(xCrest), Z(zCrest), X(xe), Z(zTN), 0.45); }
      s += fondation(xa, Math.min(F.B, 2.5));
    }
    s += T_(X(xa), yDeckTop - 16, `C${i}`, 'middle', 'font-weight="700"');
  });
  // piles
  for (let i = 1; i < x0.length - 1; i++) {
    const xa = x0[i], Hf = Hp(i), col = P.type === 'colonnes', bF = col ? (P.D || 0.8) : (P.b || 0.6);
    const zs0 = 0.15;                                                        // dessous des appareils d'appui
    let zs = zs0;
    if (col && P.hc > 0) { const lc = P.lc || Math.max(1.2, 2 * bF); s += K('ap_hc ap_lc', R(xa - lc / 2, zs0, lc, P.hc)); zs += P.hc; }
    const zBase = zFd - F.hs;
    s += K('ap_pileType ap_pileB ap_D ap_nCol ap_pileH ap_pileLv', R(xa - bF / 2, zs, bF, zBase - zs) + (col ? L_(X(xa), Z(zs) + 3, X(xa), Z(zBase) - 3, 0.45, 'stroke-dasharray="10 3 2 3"') : ''));
    s += fondation(xa, F.B);
    s += K('ap_pileH', coteV(X(xa + bF / 2) + 10, Z(zs0), Z(zBase), `H = ${fr(Hf)} m`));
    s += T_(X(xa), yDeckTop - 16, `P${i}`, 'middle', 'font-weight="700"');
  }
  s += K('h spans', `<rect x="${X(-aL).toFixed(1)}" y="${yDeckTop.toFixed(1)}" width="${((L + aL + aR) * sx).toFixed(1)}" height="${hPx.toFixed(1)}" fill="#fff" stroke="${INK}" stroke-width="${BOLD}"/>`);
  s += L_(X(-aL), yDeckTop - 6, X(L + aR), yDeckTop - 6, THIN);              // main courante du garde-corps
  for (let k = 0; k <= 80; k++) { const x = -aL + (L + aL + aR) * k / 80; s += L_(X(x), yDeckTop - 6, X(x), yDeckTop, 0.4); }
  s += K('nBearings ap_Te', x0.map(x => `<path d="M${X(x).toFixed(1)},${Z(0).toFixed(1)} l-5,${(0.15 * sz).toFixed(1)} h10 z" fill="${INK}"/>`).join(''));
  s += '</g>';
  // point fixe des déplacements (appareils fixes ou milieu de l'ouvrage)
  const xf = Number.isFinite(g.xFixed) ? g.xFixed : L / 2;
  s += K('xFixed', `<circle cx="${X(xf).toFixed(1)}" cy="${(Z(0) + 14).toFixed(1)}" r="5" fill="#fff" stroke="${INK}" stroke-width="${MED}"/><line x1="${X(xf).toFixed(1)}" y1="${(Z(0) + 9).toFixed(1)}" x2="${X(xf).toFixed(1)}" y2="${(Z(0) + 19).toFixed(1)}" stroke="${INK}"/>` + T_(X(xf) + 9, Z(0) + 18, 'point fixe', 'start', 'font-size="10"'));
  // cotes
  s += K('spans', g.spans.map((v, j) => coteH(X(x0[j]), X(x0[j + 1]), yDims, `${fr(v)} m`)).join('') + coteH(X(x0[0]), X(L), yDims + 26, `${fr(L)} m entre appuis extrêmes`));
  if (g.tirantAir > 0) { const jm = Math.floor(g.spans.length / 2), xm = (x0[jm] + x0[jm + 1]) / 2; s += K('tirantAir', coteV(X(xm + 0.15 * g.spans[jm]), Z(0), Z(Math.min(g.tirantAir, zTN)), `tirant d'air ${fr(g.tirantAir)} m`, true)); }
  return s + '</svg>';
}

/**
 * Coupe transversale droite, guide 1989 § 2.3 : dalle rectangulaire ou à chanfreins (encorbellements tramés), corniches,
 * trottoirs et bordures, chaussée avec dévers, appareils d'appui, cotes.
 */
export function guideCrossSectionSVG(g, opt = {}) {
  const W = 1000;
  if (!g || !g.width || !g.h) return `${head(W, 60, 'Coupe transversale')}${T_(20, 35, 'Saisir la largeur et l\'épaisseur pour voir la coupe.', 'start')}</svg>`;
  const b = g.width / 2, h = g.h, m = { l: 80, r: 110 }, sc = (W - m.l - m.r) / (2 * b), vz = Math.min(sc * 2, 160 / Math.max(h, 0.3));
  const Y = y => m.l + (y + b) * sc;
  // charges de superstructure saisies (bandes q et charges linéiques g, coefficients k min / k max) : étiquettes étagées
  const loads = opt.loads !== false, bands = loads ? (g.bands || []) : [], lines = loads ? (g.lines || []) : [];
  // étiquettes à côté des flèches (vers l'intérieur) et étagées pour qu'aucune flèche ne traverse une étiquette
  const labs = lines.map(l => {
    const text = `g = ${fr(l.g)} kN/m @ y = ${fr(l.e)}${l.kmin !== 1 || l.kmax !== 1 ? ` (k ${l.kmin}/${l.kmax})` : ''}`;
    const X = Y(l.e), left = l.e <= 0;
    return { text, X, left, anchor: left ? 'start' : 'end', dx: left ? 5 : -5, level: 0 };
  });
  const L0 = labs.filter(x => x.left).sort((p, q) => p.X - q.X), R0 = labs.filter(x => !x.left).sort((p, q) => q.X - p.X);
  L0.forEach((lb, k) => { lb.level = L0.length - 1 - k; }); R0.forEach((lb, k) => { lb.level = R0.length - 1 - k; });
  const lv = Array.from({ length: Math.max(L0.length, R0.length) });
  const loadH = (bands.length ? 16 * bands.length + 8 : 0) + (labs.length ? 16 * lv.length + 14 : 0);
  const yTop = 125 + loadH, Zs = z => yTop + z * vz;     // z vers le bas depuis l'extrados
  const chk = g.chamfer && g.chamfer.hEdge > 0 && g.chamfer.hEdge < h && g.chamfer.joue > 0 && g.chamfer.joue < b;
  const ys = loads ? (g.ys && g.ys.length ? g.ys : [-b, 0, b]).filter(y => Math.abs(y) <= b + 1e-9) : [];
  const yAxis = Zs(h) + (chk ? 74 : 52) + 26;
  const H = Math.ceil((ys.length ? yAxis + 30 : Zs(h) + (chk ? 74 : 52) + 20) + (opt.caption ? 20 : 0));
  let s = head(W, H, 'Coupe transversale');
  s += T_(m.l, 20, 'COUPE TRANSVERSALE DROITE', 'start', 'font-weight="700" font-size="13"');
  const ch = g.chamfer && g.chamfer.hEdge > 0 && g.chamfer.hEdge < h && g.chamfer.joue > 0 && g.chamfer.joue < b ? g.chamfer : null;
  const rw0 = g.roadway; let lanes = null, classe = null;
  try { lanes = rw0 ? notionalLanes(rw0.y2 - rw0.y1) : null; } catch { lanes = null; }
  try { classe = rw0 ? (g.classe || classePont(rw0.y2 - rw0.y1)) : null; } catch { classe = null; }
  s += T_(m.l, 38, `2b = ${fr(g.width)} m ; h = ${fr(h, 3)} m ; aire ${fr(g.area || g.width * h, 3)} m² ; ${ch ? `encorbellements de ${fr(ch.joue)} m (épaisseur en rive ${fr(ch.hEdge)} m)` : 'dalle rectangulaire'}`, 'start', 'font-size="11"');
  if (lanes) s += T_(m.l, 54, `chaussée ${fr(rw0.y2 - rw0.y1)} m → ${lanes.n} voie${lanes.n > 1 ? 's' : ''} EN 1991-2 de ${fr(lanes.wl)} m${lanes.wr > 0.01 ? ` + ${fr(lanes.wr)} m résiduel` : ''}${classe ? ` ; pont de classe ${classe} (Fasc. 61)` : ''} — échelle verticale amplifiée`, 'start', 'font-size="11"');
  // charges : bandes tramées au-dessus de la chaussée, flèches des charges linéiques
  s += '<g data-k="bands">';
  bands.forEach((bd, i) => {
    const X1 = Y(bd.y1), X2 = Y(bd.y2), yb = Zs(0) - 62 - 16 * i;
    s += `<rect x="${X1.toFixed(1)}" y="${yb.toFixed(1)}" width="${(X2 - X1).toFixed(1)}" height="8" fill="url(#g89sol)" stroke="${INK}" stroke-width="${THIN}"/>`;
    s += T_((X1 + X2) / 2, yb - 3, `q = ${fr(bd.q)} kN/m² sur [${fr(bd.y1)} ; ${fr(bd.y2)}]${bd.kmin !== 1 || bd.kmax !== 1 ? ` (k ${bd.kmin}/${bd.kmax})` : ''}`, 'middle', 'font-size="10"');
  });
  s += '</g>';
  const yL0 = Zs(0) - 62 - 16 * bands.length - 10;
  s += '<g data-k="lines">';
  for (const lb of labs) {
    const yl = yL0 - lb.level * 16;
    s += `<line x1="${lb.X.toFixed(1)}" y1="${yl.toFixed(1)}" x2="${lb.X.toFixed(1)}" y2="${(Zs(0) - 18).toFixed(1)}" stroke="${INK}" stroke-width="${MED}" marker-end="url(#g89ar)"/>`;
    s += T_(lb.X + lb.dx, yl + 4, lb.text, lb.anchor, 'font-size="10"');
  s += '</g>';
  }
  s += '<g data-k="ys">';
  if (ys.length) {
    s += L_(Y(-b), yAxis, Y(b), yAxis, THIN);
    for (const y of ys) s += L_(Y(y), yAxis - 4, Y(y), yAxis + 4, THIN) + T_(Y(y), yAxis + 16, fr(y), 'middle', 'font-size="10"');
    s += T_(Y(b) + 10, yAxis + 4, 'y [m]', 'start', 'font-size="10"');
  s += '</g>';
  }
  s += '<g data-k="roadway">';
  if (lanes && rw0) for (let i = 1; i <= lanes.n; i++) { if (i === lanes.n && lanes.wr <= 0.01) break; const X = Y(rw0.y1 + i * lanes.wl); s += L_(X, Zs(0) - 10, X, Zs(0) - 2, THIN, 'stroke-dasharray="2 2"'); }
  s += '</g>';
  s += '<g data-k="width h area">';
  // dalle et encorbellements tramés
  if (ch) {
    const j = ch.joue, hE = ch.hEdge;
    s += `<polygon points="${Y(-b)},${Zs(0)} ${Y(b)},${Zs(0)} ${Y(b)},${Zs(hE)} ${Y(b - j)},${Zs(h)} ${Y(-b + j)},${Zs(h)} ${Y(-b)},${Zs(hE)}" fill="#fff" stroke="${INK}" stroke-width="${BOLD}"/>`;
    s += '<g data-k="hEdge joue">';
    for (const sg of [-1, 1]) {
      const xa = sg < 0 ? -b : b - j, xb = sg < 0 ? -b + j : b;
      s += `<polygon points="${Y(xa)},${Zs(0)} ${Y(xb)},${Zs(0)} ${sg < 0 ? `${Y(xb)},${Zs(h)} ${Y(xa)},${Zs(hE)}` : `${Y(xb)},${Zs(hE)} ${Y(xa)},${Zs(h)}`}" fill="url(#g89enc)" stroke="none"/>`;
      s += L_(Y(sg < 0 ? -b + j : b - j), Zs(0), Y(sg < 0 ? -b + j : b - j), Zs(h), 0.5, 'stroke-dasharray="3 2"');
    }
    s += coteH(Y(b - j), Y(b), Zs(h) + 22, `${fr(j)} m`);
    s += '</g>';
  } else {
    s += `<rect x="${Y(-b)}" y="${Zs(0)}" width="${2 * b * sc}" height="${h * vz}" fill="#fff" stroke="${INK}" stroke-width="${BOLD}"/>`;
  }
  s += '</g>';
  // corniches (profil en L sur les bords)
  for (const sg of [-1, 1]) {
    const x = sg < 0 ? Y(-b) : Y(b), w = 14 * sg;
    s += `<path d="M${x},${Zs(0) + 10} l${-w * 0.6},0 l0,-${28} l${w * 1.2},0" fill="none" stroke="${INK}" stroke-width="${MED}"/>`;
  }
  s += '<g data-k="footways">';
  // trottoirs, bordures, garde-corps
  for (const fw of g.footways || []) {
    const x1 = Y(fw.y1), x2 = Y(fw.y2), ht = 14;
    s += `<rect x="${x1}" y="${Zs(0) - ht}" width="${x2 - x1}" height="${ht}" fill="url(#g89sol)" stroke="${INK}" stroke-width="${THIN}"/>`;
    const inner = Math.abs(fw.y1) < Math.abs(fw.y2) ? x1 : x2;
    s += L_(inner, Zs(0) - ht - 2, inner, Zs(0), MED);                // bordure
    const outer = inner === x1 ? x2 : x1, gc = outer + (outer > W / 2 ? -6 : 6);
    s += L_(gc, Zs(0) - ht, gc, Zs(0) - ht - 34, MED); s += L_(gc - 8, Zs(0) - ht - 34, gc + 8, Zs(0) - ht - 34, MED);   // garde-corps
    s += T_((x1 + x2) / 2, Zs(0) + 13, 'trottoir', 'middle', 'font-size="10"');
  s += '</g>';
  }
  s += '<g data-k="roadway tRev">';
  // chaussée : revêtement et dévers (flèches du guide)
  const rw = g.roadway;
  if (rw) {
    const x1 = Y(rw.y1), x2 = Y(rw.y2), yr = Zs(0) - 4;
    s += L_(x1, yr, (x1 + x2) / 2, yr - 3, MED); s += L_((x1 + x2) / 2, yr - 3, x2, yr, MED);
    s += `<line x1="${(x1 + x2) / 2 - 30}" y1="${yr - 22}" x2="${x1 + 40}" y2="${yr - 22}" stroke="${INK}" stroke-width="${MED}" marker-end="url(#g89ar)"/>`;
    s += `<line x1="${(x1 + x2) / 2 + 30}" y1="${yr - 22}" x2="${x2 - 40}" y2="${yr - 22}" stroke="${INK}" stroke-width="${MED}" marker-end="url(#g89ar)"/>`;
    s += T_((x1 + x2) / 2, yr - 30, `chaussée${opt.devers ? ` — dévers ${opt.devers}` : ' — profil en toit'}`, 'middle', 'font-size="10"');
    s += coteH(x1, x2, Zs(h) + (ch ? 48 : 26), `chaussée ${fr(rw.y2 - rw.y1)} m`);
  s += '</g>';
  }
  // appareils d'appui
  const nb = g.nBearings || Math.max(2, Math.round(g.width / 3)), e0 = Math.min(1, b / 3), pitch = nb > 1 ? (2 * b - 2 * e0) / (nb - 1) : 0;
  s += '<g data-k="nBearings">';
  for (let k = 0; k < nb; k++) { const X = Y(-b + e0 + k * pitch); s += `<rect x="${X - 8}" y="${Zs(h) + 1}" width="16" height="6" fill="${INK}"/>`; }
  s += L_(Y(-b), Zs(h) + 7, Y(b), Zs(h) + 7, 0.5, 'stroke-dasharray="10 4 2 4"');
  s += '</g>';
  // axe et cotes
  s += L_(Y(0), Zs(0) - 18, Y(0), Zs(h) + 14, 0.6, 'stroke-dasharray="12 4 2 4"');
  s += T_(Y(0) + 4, Zs(0) + 13, 'axe', 'start', 'font-size="10"');
  s += K('h', coteV(Y(b) + 26, Zs(0), Zs(h), `${fr(h, 2)} m`));
  s += K('width', coteH(Y(-b), Y(b), Zs(h) + (ch ? 74 : 52), `2b = ${fr(g.width)} m`));
  if (opt.caption) s += T_(W / 2, H - 6, opt.caption, 'middle', 'font-style="italic" font-size="11"');
  return s + '</svg>';
}
