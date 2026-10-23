/**
 * Assistant de saisie de l'onglet « Cadres et portiques » : coupe transversale et vue en plan dessinées en direct à
 * partir du formulaire (avant tout calcul), éléments rattachés aux champs (data-k : clignotent en bleu au survol ou à la
 * saisie du champ), synthèse des grandeurs déduites et contrôles immédiats, aide contextuelle des champs.
 */
import { parseCadre } from '../src/cadre/run.js';
import { geometrieCadre, cadreDe } from '../src/cadre/picf.js';
import { portee, hauteurCalc, largeurCalc, nCell } from '../src/cadre/cadre.js';
import { epaisseurPicf, decoupageBlocs, horsTableEpaisseur } from '../src/cadre/details.js';
import { marston } from '../src/cadre/sol.js';
import { actionSismique } from '../src/cadre/seisme.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fr = (v, d = 2) => (Number.isFinite(v) ? Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—');
const K = (k, c) => (c ? `<g data-k="${k}">${c}</g>` : '');
const INK = '#111', THIN = 0.8, MED = 1.3, BOLD = 1.9, BLEU = '#2b7bd6', TERRE = '#8a6a2b';
const head = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="'Arial Narrow', Arial, Helvetica, sans-serif" font-size="12" fill="${INK}" role="img" aria-label="${esc(label)}" style="background:#fff;max-width:100%">
<defs><pattern id="cfRem" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.8" fill="${TERRE}" opacity="0.55"/></pattern>
<pattern id="cfSol" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="${INK}" stroke-width="0.6" opacity="0.5"/></pattern>
<pattern id="cfBal" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#777"/><circle cx="5.5" cy="5" r="1" fill="#999"/></pattern>
<marker id="cfAr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9" fill="none" stroke="${INK}" stroke-width="1.3"/></marker>
<marker id="cfFl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker></defs>`;
const L_ = (x1, y1, x2, y2, w = THIN, extra = '') => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${w}" ${extra}/>`;
const T_ = (x, y, s, a = 'middle', extra = '') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${a}" ${extra}>${esc(s)}</text>`;
const R_ = (x, y, w, h, extra = 'fill="#fff"') => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, 1).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" stroke="${INK}" stroke-width="${MED}" ${extra}/>`;
const coteH = (x1, x2, y, s, above = false) => `${L_(x1, y - 4, x1, y + 4)}${L_(x2, y - 4, x2, y + 4)}<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${INK}" stroke-width="${THIN}" marker-start="url(#cfAr)" marker-end="url(#cfAr)"/>${T_((x1 + x2) / 2, y + (above ? -5 : 14), s)}`;
const coteV = (x, y1, y2, s, left = false) => `${L_(x - 4, y1, x + 4, y1)}${L_(x - 4, y2, x + 4, y2)}<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${INK}" stroke-width="${THIN}" marker-start="url(#cfAr)" marker-end="url(#cfAr)"/>${T_(x + (left ? -6 : 6), (y1 + y2) / 2 + 4, s, left ? 'end' : 'start')}`;
const fleche = (x1, y1, x2, y2, w = MED, col = INK) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${w}" marker-end="url(#cfFl)"/>`;

/** Lecture tolérante du formulaire : renvoie l'entrée du calcul et la géométrie de calcul, ou un message. */
export function lireCadre(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  const inp = parseCadre(d), geom = geometrieCadre(inp.opts.ouvert ? { ...inp.geom, er: 0 } : inp.geom);
  if (inp.opts.ouvert) geom.er = 0;
  const vide = k => !String(d[k] ?? '').trim();
  return { d, inp, geom, setra: { et: vide('cf_et'), er: vide('cf_er'), ep: vide('cf_ep'), ei: vide('cf_ei') } };
}

/** Coupe transversale de principe (vraie grandeur pour l'ouvrage, remblai et terrain figurés). */
export function coupeCadreSVG(lu) {
  const { inp, geom, setra } = lu, o = inp.opts, ouvert = !!o.ouvert, n = geom.n, rail = o.usage.portee === 'rail', fr_ = o.usage.franchie;
  const W = 1000;
  if (!(geom.B > 0) || !(geom.H > 0) || !(n >= 1)) return `${head(W, 60, 'Coupe')}${T_(20, 35, 'Saisir le nombre de cellules, l\'ouverture et la hauteur pour voir la coupe.', 'start')}</svg>`;
  const ep = geom.ep, ei = geom.ei, et = geom.et, er = geom.er, Hr = Math.max(geom.Hr, 0);
  const Wext = n * geom.B + (n - 1) * ei + 2 * ep, Hext = geom.H + et + er;
  const sem = ouvert ? Math.max(0.6, ep * 1.2) : 0, hSem = ouvert ? Math.max(0.6, ep) : 0;          // semelles figurées (PIPO)
  const voie = rail ? 0.9 : 0.25;                                                                     // épaisseur figurée de la voie portée
  const marge = Math.max(1.2, 0.18 * Wext);
  const xMin = -marge - sem, xMax = Wext + marge + sem;
  const zTop = Hr + voie + 0.6, zBot = -(er + hSem + 0.9);                                             // z = 0 au dessus du radier (ou des semelles)
  const m = { l: 70, r: 150, t: 64, b: 70 };
  const s0 = Math.min((W - m.l - m.r) / (xMax - xMin), 430 / (zTop + geom.H + et - zBot));
  const X = x => m.l + (x - xMin) * s0, Z = z => m.t + (zTop - (z - 0) ) * s0 - 0;
  const zSurf = geom.H + et + Hr;                                                                      // surface du remblai (au-dessus du radier)
  const Zs = z => m.t + (zSurf + voie + 0.6 - z) * s0;
  const Hpx = Zs(zBot) + 18 + 26 + 46;
  let s = head(W, Hpx, 'Coupe transversale du cadre');
  s += T_(m.l, 20, `COUPE TRANSVERSALE — ${ouvert ? 'PORTIQUE OUVERT (PIPO)' : 'CADRE FERMÉ (PICF)'} À ${n} CELLULE${n > 1 ? 'S' : ''}`, 'start', 'font-weight="700" font-size="13"');
  s += T_(m.l, 38, `Voie portée : ${rail ? 'voie ferrée (EN 1991-2)' : 'route (Fascicule 61)'} — voie franchie : ${fr_ === 'eau' ? 'écoulement' : fr_ === 'route' ? 'route' : 'voie ferrée'} ; dimensions intérieures, dessin à l'échelle (remblai et terrain figurés).`, 'start', 'font-size="11"');
  // terrain naturel et remblai
  const xg = X(xMin), xd = X(xMax), yS = Zs(zSurf), yFond = Zs(zBot);
  s += K('cf_Hr cf_rhoR', `<rect x="${xg}" y="${yS}" width="${xd - xg}" height="${yFond - yS}" fill="url(#cfRem)" stroke="none"/>${L_(xg, yS, xd, yS, MED, `stroke="${TERRE}"`)}`);
  // ouvrage : x = 0 au nu extérieur gauche
  const xIn = j => ep + j * (geom.B + ei);                                                              // nu intérieur gauche de la cellule j
  const y0 = Zs(0), yH = Zs(geom.H), yT = Zs(geom.H + et);
  const vides = [];
  for (let j = 0; j < n; j++) vides.push(`<rect x="${X(xIn(j))}" y="${yH}" width="${geom.B * s0}" height="${geom.H * s0}" fill="#fff" stroke="none"/>`);
  s += vides.join('');
  s += K('cf_et', R_(X(0), yT, Wext * s0, et * s0));
  if (!ouvert) s += K('cf_er', R_(X(0), y0, Wext * s0, er * s0));
  s += K('cf_ep', R_(X(0), yH, ep * s0, geom.H * s0) + R_(X(Wext - ep), yH, ep * s0, geom.H * s0));
  for (let j = 1; j < n; j++) s += K('cf_ei', R_(X(xIn(j) - ei), yH, ei * s0, geom.H * s0));
  if (ouvert) {
    for (const xc of [ep / 2, ...Array.from({ length: n - 1 }, (_, j) => xIn(j + 1) - ei / 2), Wext - ep / 2])
      s += K('cf_appui cf_type', R_(X(xc - sem / 2 - ep / 2), y0, (sem + ep) * s0, hSem * s0) + (o.ouvert === 'articule' ? `<circle cx="${X(xc)}" cy="${y0}" r="4" fill="#fff" stroke="${INK}" stroke-width="${MED}"/>` : ''));
    s += `<rect x="${X(ep)}" y="${y0}" width="${(Wext - 2 * ep) * s0}" height="${(yFond - y0)}" fill="url(#cfSol)" stroke="none" opacity="0.5"/>`;
  } else {
    // sol sous le radier : ressorts (Winkler) ou radier rigide
    const ySol = Zs(-er), win = inp.hyp.sol === 'winkler';
    let r = '';
    if (win) for (let k = 0; k <= 8; k++) { const x = X(Wext * k / 8), y1 = ySol + 2, y2 = ySol + 22; r += `<polyline points="${x},${y1} ${x - 4},${y1 + 4} ${x + 4},${y1 + 8} ${x - 4},${y1 + 12} ${x + 4},${y1 + 16} ${x},${y2}" fill="none" stroke="${INK}" stroke-width="${THIN}"/>`; }
    r += T_(X(Wext / 2), ySol + 36, win ? `sol élastique ESOL ${inp.hyp.esol > 0 ? fr(inp.hyp.esol) + ' MPa' : '(table du guide)'}` : 'radier rigide, réaction linéaire', 'middle', 'font-size="11"');
    s += K('cf_sol cf_esol cf_nature cf_etat cf_solSrc cf_profil cf_rqd', r);
  }
  // voie portée en surface
  const xv0 = X(-marge * 0.6), xv1 = X(Wext + marge * 0.6);
  if (rail) {
    const yb = yS, hb = 0.3 * s0;
    let v = `<polygon points="${xv0},${yb} ${xv0 + 18},${yb - hb} ${xv1 - 18},${yb - hb} ${xv1},${yb}" fill="url(#cfBal)" stroke="${INK}" stroke-width="${THIN}"/>`;
    for (let k = 0; k < 16; k++) { const x = xv0 + 24 + (xv1 - xv0 - 48) * k / 15; v += `<rect x="${x - 5}" y="${yb - hb - 5}" width="10" height="5" fill="#666"/>`; }
    v += L_(xv0 + 18, yb - hb - 8, xv1 - 18, yb - hb - 8, BOLD) + T_(xv1 + 6, yb - hb - 4, 'voie ferrée : LM71, SW/0', 'start', 'font-size="11"');
    s += K('cf_portee cf_alpha cf_ballast cf_ltrav', v);
  } else {
    s += K('cf_portee cf_classe cf_bc cf_bt cf_a1 cf_a2 cf_mc120', `<rect x="${xv0}" y="${yS - 5}" width="${xv1 - xv0}" height="5" fill="#444"/>${T_(xv1 + 6, yS, 'chaussée : A(l), Bc, Bt, Mc120', 'start', 'font-size="11"')}`);
  }
  // poussée des terres sur les piédroits extérieurs
  const kp = Math.min(60, 22 + 6 * geom.H);
  const tri = (xw, sgn) => { const x = X(xw); return `<polygon points="${x},${yT} ${x + sgn * kp * 0.35},${yT} ${x + sgn * kp},${y0} ${x},${y0}" fill="${TERRE}" fill-opacity="0.18" stroke="${TERRE}" stroke-width="${THIN}"/>${[0.3, 0.6, 0.9].map(f => { const y = yT + (y0 - yT) * f, l = kp * (0.35 + 0.65 * f); return fleche(x + sgn * l, y, x + sgn * 2, y, THIN, TERRE); }).join('')}`; };
  s += K('cf_K0max cf_K0min cf_psrem cf_phasage', tri(0, -1) + tri(Wext, 1) + T_(X(Wext) + kp + 6, (yT + y0) / 2, 'poussée K₀', 'start', `font-size="11" fill="${TERRE}"`));
  // voie franchie dans les cellules
  if (fr_ === 'eau' && !ouvert) {
    const he = Math.min(Math.max(inp.hyp.hEau, 0), geom.H);
    if (he > 0) s += K('cf_hEau', Array.from({ length: n }, (_, j) => `<rect x="${X(xIn(j))}" y="${Zs(he)}" width="${geom.B * s0}" height="${he * s0}" fill="${BLEU}" fill-opacity="0.25" stroke="none"/>${L_(X(xIn(j)), Zs(he), X(xIn(j) + geom.B), Zs(he), MED, `stroke="${BLEU}"`)}`).join('') + T_(X(xIn(0)) + 6, Zs(he) - 4, `eau ${fr(he)} m`, 'start', `font-size="11" fill="${BLEU}"`));
    const hn = Math.max(inp.hyp.hNappe, 0);
    if (hn > 0) s += K('cf_hNappe', L_(xg, Zs(hn), X(0), Zs(hn), MED, `stroke="${BLEU}" stroke-dasharray="7 4"`) + L_(X(Wext), Zs(hn), xd, Zs(hn), MED, `stroke="${BLEU}" stroke-dasharray="7 4"`) + T_(xg + 4, Zs(hn) - 4, `nappe ${fr(hn)} m`, 'start', `font-size="11" fill="${BLEU}"`));
  } else if (fr_ === 'route' || fr_ === 'rail') {
    const ech = o.gabarit.epaisseurChaussee ?? (fr_ === 'route' ? 0.30 : 0.60);
    let v = '';
    for (let j = 0; j < n; j++) v += `<rect x="${X(xIn(j))}" y="${Zs(ech)}" width="${geom.B * s0}" height="${ech * s0}" fill="${fr_ === 'route' ? '#555' : 'url(#cfBal)'}" opacity="0.8"/>`;
    s += K('cf_ech cf_franchie', v);
    const gh = o.gabarit.hauteur, gl = o.gabarit.largeur || geom.B * 0.8;
    if (gh > 0) {
      const ok = geom.H - ech >= gh - 1e-9, col = ok ? '#1e8449' : '#c0392b', x0 = X(xIn(0) + (geom.B - Math.min(gl, geom.B)) / 2);
      s += K('cf_gabH cf_gabL', `<rect x="${x0}" y="${Zs(ech + gh)}" width="${Math.min(gl, geom.B) * s0}" height="${gh * s0}" fill="none" stroke="${col}" stroke-width="${MED}" stroke-dasharray="6 3"/>${T_(x0 + 4, Zs(ech + gh) + 14, `gabarit ${fr(gh)} m ${ok ? '✓' : '✗'}`, 'start', `font-size="11" fill="${col}"`)}`);
    }
    const F = o.choc.F ?? (fr_ === 'route' ? 500 : 0);
    if (F > 0) { const yC = Zs(ech + 1.25); s += K('cf_chocF cf_chocBeff', fleche(X(xIn(0)) + 46, yC, X(xIn(0)) + 3, yC, BOLD, '#c0392b') + T_(X(xIn(0)) + 50, yC + 4, `choc ${fr(F, 0)} kN`, 'start', 'font-size="11" fill="#c0392b"')); }
  }
  // séisme
  if (inp.opts.seisme.actif) s += K('cf_sis cf_sisMode cf_zone cf_cat cf_solEC8 cf_ag cf_S cf_Vs cf_nuSol cf_sisAppr', fleche(X(-marge * 0.9), Zs(zSurf - 0.4 * Hr) , X(-marge * 0.25), Zs(zSurf - 0.4 * Hr), BOLD, '#7d3c98') + T_(X(-marge * 0.9), Zs(zSurf - 0.4 * Hr) - 6, 'séisme', 'start', 'font-size="11" fill="#7d3c98"'));
  // cotes
  const yc = Zs(zBot) + 18;
  for (let j = 0; j < n; j++) s += K('cf_B cf_n', coteH(X(xIn(j)), X(xIn(j) + geom.B), yc, `B = ${fr(geom.B)}`));
  s += K('cf_n', coteH(X(0), X(Wext), yc + 26, `${n} × ${fr(geom.B)} + épaisseurs = ${fr(Wext)} m`));
  s += K('cf_H', coteV(X(Wext) + kp + 70, yH, y0, `H = ${fr(geom.H)}`));
  if (Hr > 0) s += K('cf_Hr', coteV(X(Wext) + kp + 70, yS, yT, `remblai ${fr(Hr)}`));
  const lab = (k, x, y, t) => K(k, T_(x, y, t, 'start', 'font-size="11"'));
  s += lab('cf_et', X(Wext) + 4, yT + et * s0 / 2 + 4, `traverse ${fr(et)}${setra.et ? ' (SETRA)' : ''}`);
  if (!ouvert) s += lab('cf_er', X(Wext) + 4, y0 + er * s0 / 2 + 4, `radier ${fr(er)}${setra.er ? ' (SETRA)' : ''}`);
  s += K('cf_ep', T_(X(ep / 2), yH - 6, `${fr(ep)}${setra.ep ? '*' : ''}`, 'middle', 'font-size="10"'));
  if (n > 1) s += K('cf_ei', T_(X(xIn(1) - ei / 2), yH - 6, `${fr(ei)}${setra.ei ? '*' : ''}`, 'middle', 'font-size="10"'));
  s += T_(m.l, Hpx - 10, '* épaisseur tirée de la table SETRA (champ laissé vide). Survolez un champ : l\'élément correspondant clignote en bleu.', 'start', 'font-size="10" font-style="italic"');
  return s + '</svg>';
}

/** Vue en plan : ouvrage de longueur L sous la voie portée, biais. */
export function planCadreSVG(lu) {
  const { inp, geom } = lu, n = geom.n, W = 1000, H = 260;
  if (!(geom.B > 0) || !(geom.L > 0)) return `${head(W, 50, 'Vue en plan')}${T_(20, 30, 'Saisir la longueur de l\'ouvrage pour voir la vue en plan.', 'start')}</svg>`;
  const Wext = n * geom.B + (n - 1) * geom.ei + 2 * geom.ep, phi = (geom.biais || 90) * Math.PI / 180;
  // axe de l'ouvrage horizontal (longueur L) ; la voie portée le croise sous l'angle de biais
  const s0 = Math.min(560 / geom.L, 150 / (Wext / Math.sin(phi) + 0.1)), cx = 470, cy = 140;
  const ux = 1, uy = 0, vx = Math.cos(phi), vy = -Math.sin(phi);                 // v : direction des piédroits (parallèles à la voie portée)
  const P = (a, b) => [cx + (a * ux + b * vx) * s0, cy + (a * uy + b * vy) * s0];
  const w = Wext / Math.sin(phi), L2 = geom.L / 2;
  const poly = pts => pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  let s = head(W, H, 'Vue en plan');
  s += T_(20, 20, 'VUE EN PLAN — OUVRAGE SOUS LA VOIE PORTÉE', 'start', 'font-weight="700" font-size="13"');
  // voie portée (bande parallèle à v) : largeur figurée = L
  const a0 = -L2, a1 = L2;
  s += K('cf_L cf_portee', `<polygon points="${poly([P(a0, -w * 1.2), P(a1, -w * 1.2), P(a1, w * 1.2), P(a0, w * 1.2)].map(([x, y]) => [x, y]))}" fill="none" stroke="none"/>`);
  // l'ouvrage : parallélogramme (têtes parallèles à l'axe de la voie franchie, piédroits parallèles à la voie portée)
  const q = [P(-L2, -w / 2), P(L2, -w / 2), P(L2, w / 2), P(-L2, w / 2)];
  s += K('cf_L cf_biais cf_n cf_B', `<polygon points="${poly(q)}" fill="#fff" stroke="${INK}" stroke-width="${MED}"/>`);
  for (let j = 1; j < n; j++) { const b = -w / 2 + j * w / n; s += K('cf_ei cf_n', `<line x1="${P(-L2, b)[0]}" y1="${P(-L2, b)[1]}" x2="${P(L2, b)[0]}" y2="${P(L2, b)[1]}" stroke="${INK}" stroke-width="${THIN}" stroke-dasharray="6 3"/>`); }
  // axe de la voie portée : droite perpendiculaire à l'axe de l'ouvrage si biais 100 gr
  const A = P(0, -w * 1.4), B = P(0, w * 1.4);
  s += K('cf_portee cf_biais', `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="#c0392b" stroke-width="${THIN}" stroke-dasharray="12 4 2 4"/>${T_(B[0] + 6, B[1] + 4, `axe de la voie portée (${inp.opts.usage.portee === 'rail' ? 'voie ferrée' : 'route'})`, 'start', 'font-size="11" fill="#c0392b"')}`);
  const E1 = P(-L2 - 1, 0), E2 = P(L2 + 1, 0);
  s += `<line x1="${E1[0]}" y1="${E1[1]}" x2="${E2[0]}" y2="${E2[1]}" stroke="${BLEU}" stroke-width="${THIN}" stroke-dasharray="12 4 2 4"/>${T_(E2[0] + 6, E2[1] + 4, 'axe de l\'ouvrage', 'start', `font-size="11" fill="${BLEU}"`)}`;
  s += K('cf_L', coteH(P(-L2, w / 2)[0], P(L2, w / 2)[0], H - 22, `L = ${fr(geom.L)} m`));
  s += K('cf_biais', T_(P(L2, -w / 2)[0] + 10, P(L2, -w / 2)[1], `biais ${fr(geom.biais / 0.9, 1)} gr (${fr(geom.biais, 1)}°)`, 'start', 'font-size="11"'));
  return s + '</svg>';
}

/** Synthèse des grandeurs déduites et contrôles immédiats (avant calcul). */
export function syntheseCadreHTML(lu) {
  const { inp, geom } = lu, o = inp.opts, h = inp.hyp, ouvert = !!o.ouvert, li = [];
  try {
    const g = cadreDe(geom), n = nCell(g), lcs = Array.from({ length: n }, (_, i) => portee(g, i));
    li.push(`Épaisseurs retenues : traverse ${fr(geom.et)} m${ouvert ? '' : `, radier ${fr(geom.er)} m`}, piédroits ${fr(geom.ep)} m${n > 1 ? `, voiles ${fr(geom.ei)} m` : ''} ; table SETRA pour B = ${fr(geom.B)} m : ${fr(epaisseurPicf(geom.B))} m${horsTableEpaisseur(geom.B) ? ' (hors table, valeur de bord)' : ''}.`);
    li.push(`Modèle aux feuillets moyens : portée de calcul l_c = ${fr(lcs[0])} m${Math.abs(geom.biais - 90) > 1e-9 ? ' (biais compris)' : ''}, hauteur de calcul h_c = ${fr(hauteurCalc(g))} m, largeur de calcul ${fr(largeurCalc(g))} m.`);
    const Dext = n * geom.B + (n - 1) * geom.ei + 2 * geom.ep, Hext = geom.H + geom.et + geom.er;
    if (h.marston && geom.Hr > 0) li.push(`Effet Marston : K = ${fr(marston(geom.Hr, Dext, Hext, h.incompressible).K, 3)} (H/D = ${fr(geom.Hr / Dext)}).`);
    if (geom.Hr < 0.5) li.push(`<span class="badge warn">ATTENTION</span> couverture ${fr(geom.Hr)} m < 0,50 m : la diffusion n'étale plus les roues, moments de traverse sous-estimés (répartition transversale non traitée).`);
    const gr = (90 - Math.abs(90 - geom.biais)) / 0.9;
    if (gr < 70) li.push(`<span class="badge warn">RÉSERVE</span> biais ${fr(gr, 0)} gr < 70 gr : ferraillage orienté et renfort des angles obtus requis (guide PICF-EL, annexe 5).`);
    if (!ouvert && n > 3) { const sp = decoupageBlocs(n, lcs[0]); li.push(sp.refus || sp.explication); }
    if (o.usage.franchie !== 'eau') {
      const ech = o.gabarit.epaisseurChaussee ?? (o.usage.franchie === 'route' ? 0.30 : 0.60), lib = geom.H - ech;
      li.push(o.gabarit.hauteur > 0 ? `Gabarit : hauteur libre ${fr(lib)} m pour ${fr(o.gabarit.hauteur)} m requis — ${lib >= o.gabarit.hauteur - 1e-9 ? 'OK' : '<span class="badge warn">NON</span>'}.` : '<span class="badge warn">À SAISIR</span> hauteur libre exigée par le gestionnaire de la voie franchie.');
    } else if (!ouvert && !(h.hEau > 0) && !(h.hNappe > 0)) li.push('<span class="badge warn">À SAISIR</span> hauteur d\'eau intérieure ou nappe : sans situation hydraulique, la note portera une réserve.');
    if (!ouvert) li.push(h.esol > 0 ? `Sol : ${esc(h.esolSource || `ESOL saisi ${fr(h.esol, 1)} MPa`)}${inp.hyp.sol === 'winkler' ? '' : ' (non utilisé : radier rigide choisi)'}.` : 'Sol : ESOL de la table indicative du guide (nature et état).');
    if (h.notesSol && h.notesSol.length && /Pénétromètre dynamique seul/.test(h.notesSol.join(' '))) li.push('<span class="badge warn">CORRÉLATION</span> pénétromètre dynamique seul : ESOL estimé par q_d → q_c → module ; suffisant pour les efforts du cadre, pas pour la portance ni le tassement.');
    if (o.seisme.actif && o.seisme.vsSource === 'profil') li.push(`V_s tiré du profil : ${fr(o.seisme.Vs, 0)} m/s.`);
    if (o.seisme.actif) { const a = actionSismique(o.seisme); li.push(`Séisme : ${esc(a.source)} ; k_h = ${fr(a.kh, 3)}.`); }
  } catch (e) { li.push(`Géométrie incomplète : ${esc(e.message)}`); }
  return `<ul class="small">${li.map(x => `<li>${x}</li>`).join('')}</ul>`;
}

/** Aide contextuelle des champs de l'onglet. */
export const AIDE_CADRE = {
  cf_type: 'Cadre fermé (PICF, dalot) : traverse, radier et piédroits monolithiques. Portique ouvert (PIPO) : sans radier, piédroits sur semelles.',
  cf_appui: 'Liaison des pieds des piédroits avec leurs semelles : encastrement (cas courant) ou articulation.',
  cf_portee: 'Voie portée par l\'ouvrage, sur le remblai : route (charges du Fascicule 61) ou voie ferrée (EN 1991-2).',
  cf_franchie: 'Ce qui passe dans l\'ouvrage : écoulement (situations hydrauliques), route ou voie ferrée (gabarit et choc sur les piédroits).',
  cf_n: 'Nombre de cellules (ouvertures). Au-delà de 3, le cadre est découpé en blocs monolithiques séparés par des joints secs.',
  cf_B: 'Ouverture intérieure d\'une cellule, entre nus des piédroits [m].',
  cf_H: 'Hauteur intérieure entre le dessus du radier et la sous-face de la traverse ; portique : depuis le dessus des semelles [m].',
  cf_L: 'Longueur de l\'ouvrage le long de son axe [m] : entre dans le poids pour le coefficient dynamique et dans l\'avant-métré.',
  cf_biais: 'Angle entre l\'axe de l\'ouvrage et celui de la voie portée, en grades ; 100 gr = ouvrage droit. En deçà de 70 gr, réserve du guide.',
  cf_Hr: 'Hauteur de remblai au-dessus de la traverse, chaussée ou ballast compris [m].',
  cf_et: 'Épaisseur de la traverse [m] ; vide = table SETRA selon l\'ouverture.',
  cf_er: 'Épaisseur du radier [m] ; vide = table SETRA.',
  cf_ep: 'Épaisseur des piédroits extérieurs [m] ; vide = table SETRA.',
  cf_ei: 'Épaisseur des voiles intermédiaires [m] ; vide = table SETRA.',
  cf_K0max: 'Coefficient de poussée maximal (au repos, remblai compacté) ; 0,50 par défaut du programme PICF-EL.',
  cf_K0min: 'Coefficient de poussée minimal ; 0,25 par défaut du PICF-EL. Une poussée faible peut être défavorable à la traverse.',
  cf_psrem: 'Surcharge sur les remblais (Fascicule 61, art. 8) transmise en poussée uniforme sur les piédroits ; 1 t/m² réglementaire.',
  cf_sol: 'Sol élastique de module ESOL (Winkler, comme le PICF-EL) ou radier rigide à réaction linéaire (méthode manuelle).',
  cf_esol: 'Module d\'élasticité différé du sol [MPa] ; vide = valeur indicative de l\'annexe 2 du guide selon la nature et l\'état.',
  cf_hEau: 'Hauteur d\'eau dans l\'ouvrage [m] (cas « en eau »).',
  cf_hNappe: 'Niveau de la nappe extérieure au-dessus de la face supérieure du radier (fil d\'eau) [m] ; la sous-pression s\'exerce sous le radier, sous h + e_r d\'eau ; le cas « vide sous nappe haute » inverse la flexion du radier.',
  cf_lch: 'Largeur chargeable de la voie portée sur l\'ouvrage [m] (Fascicule 61, art. 2.1) : fixe le nombre de voies, donc S, poids des essieux B plaçables, dans le coefficient de majoration dynamique ; vide = longueur de l\'ouvrage (majorant).',
  cf_gabH: 'Hauteur libre exigée au-dessus de la chaussée ou de la plateforme de la voie franchie [m].',
  cf_chocF: 'Force de choc perpendiculaire au piédroit [kN] : route, EN 1991-1-7 tableau 4.1 (500 kN autoroute ou route principale) ; voie ferrée, à fixer par le gestionnaire.',
  cf_sis: 'Calcul sismique Eurocode 8 (q = 1) : inertie et poussée dynamique, et distorsion imposée par le terrain.',
  cf_Vs: 'Vitesse des ondes de cisaillement du terrain autour de l\'ouvrage [m/s], à mesurer ; vide = valeur indicative de la classe de sol.',
  cf_alpha: 'Coefficient de classification α des charges ferroviaires (EN 1991-2, 6.3.2), fixé par le gestionnaire du réseau.',
};
