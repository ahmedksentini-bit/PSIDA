/**
 * Plan de nivellement (onglet Appuis et fondations) : tableau des cotes par ligne d'appui, cotes et dimensions déduites,
 * coupe longitudinale et coupe transversale dessinées en direct. Les cotes sont écrites dans les champs cachés niv_*
 * (listes séparées par « ; »), lus par parseSupports ; les déductions sont celles du calcul (src/supports/nivellement.js).
 */
import { parseData } from '../src/pipeline.js';
import { nivellement } from '../src/supports/nivellement.js';

const CHAMPS = [
  ['zCh', 'Chaussée à l\'axe (profil en long)'], ['zTN', 'Terrain naturel'], ['zDS', 'Dessus de semelle'], ['zSS', 'Sous-face de semelle'],
  ['zPP', 'Pointe des pieux'], ['zPHE', 'Plus hautes eaux (PHE)'], ['zLit', 'Lit du cours d\'eau'], ['type', 'Type de fondation'], ['B', 'Largeur de semelle B [m]'],
];
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : '');
const fr = v => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '–');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function lireListe(form, k, n) { const t = String(form.elements['niv_' + k].value || '').split(';').map(x => x.trim()); return Array.from({ length: n }, (_, i) => t[i] ?? ''); }
function ecrireListe(form, k, arr) { form.elements['niv_' + k].value = arr.join('; '); }

/** Contexte de calcul des déductions à partir du formulaire (et des appareils du dernier calcul, s'il existe). */
function contexte(form, state) {
  const p = parseData(Object.fromEntries(new FormData(form).entries()));
  const di = p.deckInput, n = di.spans.length + 1;
  const deck = { h: di.h, b: di.width / 2, g: { psi: p.concept.psi || 100, devers: di.devers, roadway: di.roadway } };
  const nb = p.concept.nBearings || Math.max(2, Math.round(di.width / 3));
  const bearings = state && state.bearings && state.bearings.rows.length === n ? state.bearings : { rows: Array.from({ length: n }, () => ({ nb })), nb };
  const sp = p.supports;
  const niv = nivellement(sp, { deck, bearings, tRev: p.mat.tRev, isEnd: i => i === 0 || i === n - 1, nL: n });
  return { p, di, n, sp, niv };
}

export function initNivellement(form, getState) {
  const box = document.getElementById('niv-table');
  if (!box) return { refresh() {} };
  const render = () => {
    if (!form.elements.niv_actif || !form.elements.niv_actif.checked) return;
    let C; try { C = contexte(form, getState()); } catch (e) { box.textContent = 'Plan de nivellement : ' + e.message; return; }
    const { n, niv, sp, di } = C;
    const val = Object.fromEntries(CHAMPS.map(([k]) => [k, lireListe(form, k, n)]));
    const nom = i => (i === 0 || i === n - 1 ? `C${i}` : `P${i}`);
    let h = `<div class="toolbar"><label>Cote de chaussée de référence [m]<input id="niv-z0" type="number" step="any" value="100" style="width:7em"></label><button type="button" class="secondary mini" id="niv-prefill" title="Remplit les cases vides à partir des données générales (hauteurs, semelles, pieux) avec la cote de chaussée de référence sur tous les appuis">Pré-remplir les cases vides à partir des données actuelles</button></div>`;
    h += `<div style="overflow-x:auto"><table class="valeurs"><thead><tr><th>Cote [m] ou donnée</th>${Array.from({ length: n }, (_, i) => `<th>${nom(i)}</th>`).join('')}</tr></thead><tbody>`;
    for (const [k, lab] of CHAMPS) {
      h += `<tr><th>${esc(lab)}</th>`;
      for (let i = 0; i < n; i++) {
        if (k === 'type') h += `<td><select data-niv="type" data-i="${i}"><option value="">${sp.found.type === 'pieux' ? 'pieux (général)' : 'semelle (général)'}</option><option value="superficielle"${val.type[i] === 'superficielle' ? ' selected' : ''}>semelle</option><option value="pieux"${val.type[i] === 'pieux' ? ' selected' : ''}>pieux</option></select></td>`;
        else h += `<td><input data-niv="${k}" data-i="${i}" type="number" step="any" value="${esc(val[k][i])}" placeholder="${k === 'B' ? f2(sp.found.B) : ''}"></td>`;
      }
      h += '</tr>';
    }
    const der = [['zSF', 'Sous-face du tablier à l\'axe'], ['zT', 'Tête d\'appui (sommier ou chevêtre)'], ['Hx', 'Hauteur du fût H_f ou de la culée H_m [m]'], ['hs', 'Épaisseur de semelle h_s [m]'], ['De', 'Encastrement D_e [m]'], ['Lpile', 'Longueur des pieux [m]'], ['bos', 'Bossages, de l\'appareil le plus bas au plus haut [m]']];
    for (const [k, lab] of der) {
      h += `<tr><th class="small">${esc(lab)}</th>`;
      niv.lignes.forEach(L => {
        let v = k === 'Hx' ? (L.H ?? L.Hm) : L[k];
        if (k === 'bos') v = L.appareils ? `${fr(Math.min(...L.appareils.map(a => a.hBossage)))} à ${fr(Math.max(...L.appareils.map(a => a.hBossage)))}` : '–';
        h += `<td class="der">${typeof v === 'string' ? v : fr(v)}</td>`;
      });
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    if (niv.warnings.length) h += `<p class="small"><span class="badge warn">ATTENTION</span> ${niv.warnings.map(esc).join(' ; ')}</p>`;
    box.innerHTML = h;
    document.getElementById('niv-long').innerHTML = coupeLongitudinale(C);
    const selL = document.getElementById('niv-ligne'), cur = +selL.value || 0;
    selL.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}"${i === cur ? ' selected' : ''}>${nom(i)}</option>`).join('');
    document.getElementById('niv-trans').innerHTML = coupeTransversale(C, Math.min(cur, n - 1));
  };
  box.addEventListener('change', ev => {
    const t = ev.target; if (!t.dataset.niv) return;
    const C = contexte(form, getState()), k = t.dataset.niv, arr = lireListe(form, k, C.n);
    arr[+t.dataset.i] = t.value; ecrireListe(form, k, arr);
    form.dispatchEvent(new Event('input', { bubbles: true }));
    render();
  });
  box.addEventListener('click', ev => {
    if (ev.target.id !== 'niv-prefill') return;
    const C = contexte(form, getState()), { n, sp, p } = C;
    const z0 = +document.getElementById('niv-z0').value;
    if (!Number.isFinite(z0)) return;
    const val = Object.fromEntries(CHAMPS.map(([k]) => [k, lireListe(form, k, n)]));
    const Hp = [].concat(sp.pile.H);
    for (let i = 0; i < n; i++) {
      const end = i === 0 || i === n - 1;
      if (val.zCh[i] === '') val.zCh[i] = f2(z0);
      const zch = +val.zCh[i], zSF = zch - p.mat.tRev - p.deckInput.h, zT = zSF - 0.06 - (+form.elements.niv_hBos.value || 0.1);
      const H = end ? sp.culee.Hm + (sp.culee.type === 'remblayee' ? 0 : sp.culee.hc) : (Hp[Math.min(Hp.length - 1, i - 1)] ?? Hp[0]) + (sp.pile.type === 'colonnes' ? sp.pile.hc : 0);
      if (val.zDS[i] === '') val.zDS[i] = f2(zT - H);
      if (val.zSS[i] === '') val.zSS[i] = f2(+val.zDS[i] - sp.found.hs);
      if (val.zTN[i] === '') val.zTN[i] = f2(+val.zSS[i] + sp.found.De);
      if (val.zPP[i] === '' && sp.found.type === 'pieux') val.zPP[i] = f2(+val.zSS[i] - sp.found.Lpile);
    }
    for (const [k] of CHAMPS) ecrireListe(form, k, val[k]);
    form.dispatchEvent(new Event('input', { bubbles: true }));
    render();
  });
  document.getElementById('niv-ligne').addEventListener('change', render);
  form.addEventListener('change', ev => { if (ev.target.name && /^(niv_|spans|overhangs|h$|width|tRev|ap_|nBearings|psi)/.test(ev.target.name)) render(); });
  return { refresh: render };
}

/** Coupe longitudinale : profil en long, tablier, appuis, semelles, pieux, terrain naturel, cotes. */
function coupeLongitudinale({ di, n, niv, sp }) {
  const [aL, aR] = di.overhangs || [0, 0], xs = [0]; di.spans.forEach(L => xs.push(xs[xs.length - 1] + L));
  const Ls = niv.lignes, zs = [];
  for (const L of Ls) for (const k of ['zCh', 'zTN', 'zDS', 'zSS', 'zPP', 'zT', 'zPHE', 'zLit']) if (Number.isFinite(L[k])) zs.push(L[k]);
  if (zs.length < 2) return '<p class="small">Saisissez au moins les cotes de chaussée et de semelle pour dessiner la coupe.</p>';
  const W = 980, Hh = 360, ml = 60, mr = 20, mt = 20, mb = 40, x0 = -aL - 2, x1 = xs[n - 1] + aR + 2;
  const zMin = Math.min(...zs) - 1, zMax = Math.max(...zs) + 1.5;
  const kx = (W - ml - mr) / (x1 - x0), kz0 = (Hh - mt - mb) / (zMax - zMin);
  const kz = Math.min(kz0, kx * 5), ex = kz / kx;   // exagération des hauteurs limitée à ×5
  const X = x => ml + (x - x0) * kx, Z = z => Hh - mb - (z - zMin) * kz;
  let s = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" style="max-width:${W}px;font:11px system-ui" role="img" aria-label="Coupe longitudinale du plan de nivellement">`;
  s += `<text x="${ml}" y="13" font-weight="600">Coupe longitudinale — hauteurs ×${ex.toFixed(1).replace('.', ',')}</text>`;
  // terrain naturel
  const tn = Ls.map((L, i) => (Number.isFinite(L.zTN) ? [X(xs[i]), Z(L.zTN)] : null)).filter(Boolean);
  if (tn.length > 1) s += `<polyline points="${tn.map(p => p.join(',')).join(' ')}" fill="none" stroke="#8a6d3b" stroke-width="1.5" stroke-dasharray="6 3"/><text x="${tn[0][0] - 4}" y="${tn[0][1] + 12}" text-anchor="end" fill="#8a6d3b">TN</text>`;
  // plus hautes eaux et lit (piles en rivière)
  Ls.forEach((L, i) => { if (Number.isFinite(L.zPHE) && Number.isFinite(L.zLit)) { const x = X(xs[i]); s += `<line x1="${x - 40}" y1="${Z(L.zPHE)}" x2="${x + 40}" y2="${Z(L.zPHE)}" stroke="#3b8ea5" stroke-width="2"/><text x="${x - 42}" y="${Z(L.zPHE) - 3}" fill="#3b8ea5" font-size="9.5">PHE ${fr(L.zPHE)}</text><line x1="${x - 40}" y1="${Z(L.zLit)}" x2="${x + 40}" y2="${Z(L.zLit)}" stroke="#3b8ea5" stroke-dasharray="3 2"/>`; } });
  // tablier (chaussée et sous-face, linéaires entre appuis, prolongés sur les abouts)
  const pt = (k, i) => (Number.isFinite(Ls[i][k]) ? Ls[i][k] : null);
  const top = [], bot = [];
  for (let i = 0; i < n; i++) if (pt('zCh', i) != null) { top.push([xs[i], pt('zCh', i)]); bot.push([xs[i], pt('zSF', i)]); }
  if (top.length > 1) {
    const ext = (a, b, x) => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
    const T = [ext(top[0], top[1], -aL), ...top, ext(top[top.length - 2], top[top.length - 1], xs[n - 1] + aR)];
    const Bt = [ext(bot[0], bot[1], -aL), ...bot, ext(bot[bot.length - 2], bot[bot.length - 1], xs[n - 1] + aR)];
    s += `<polygon points="${[...T, ...Bt.reverse()].map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="#b9c2d1" stroke="#1d2433" stroke-width="1"/>`;
  }
  // appuis
  Ls.forEach((L, i) => {
    const x = X(xs[i]), end = i === 0 || i === n - 1;
    const F = { ...sp.found, ...(niv.parLigne[i] && niv.parLigne[i].found) }, B = F.B;
    const bw = end ? (sp.culee.type === 'remblayee' ? sp.culee.em : sp.culee.D) : (sp.pile.type === 'voile' ? sp.pile.b : sp.pile.D);
    if (Number.isFinite(L.zT) && Number.isFinite(L.zDS)) s += `<rect x="${x - bw * kx / 2}" y="${Z(L.zT)}" width="${Math.max(2, bw * kx)}" height="${Math.max(1, Z(L.zDS) - Z(L.zT))}" fill="#d9dee7" stroke="#1d2433"/>`;
    if (Number.isFinite(L.zDS) && Number.isFinite(L.zSS)) s += `<rect x="${x - B * kx / 2}" y="${Z(L.zDS)}" width="${B * kx}" height="${Math.max(1, Z(L.zSS) - Z(L.zDS))}" fill="#c9ced8" stroke="#1d2433"/>`;
    if (F.type === 'pieux' && Number.isFinite(L.zSS) && Number.isFinite(L.zPP)) for (const dx of [-0.3, 0.3]) s += `<line x1="${x + dx * B * kx}" y1="${Z(L.zSS)}" x2="${x + dx * B * kx}" y2="${Z(L.zPP)}" stroke="#1d2433" stroke-width="2"/>`;
    s += `<text x="${x}" y="${Hh - mb + 14}" text-anchor="middle" font-weight="600">${end ? 'C' : 'P'}${i}</text>`;
    const lab = [[L.zCh, 'ch'], [L.zT, 'tête'], [L.zDS, 'ds'], [L.zSS, 'ss'], [F.type === 'pieux' ? L.zPP : null, 'pointe']].filter(([z]) => Number.isFinite(z));
    const gauche = i === n - 1, dxl = Math.max(B, bw) * kx / 2 + 3;
    lab.forEach(([z, t]) => { s += `<text x="${gauche ? x - dxl : x + dxl}" y="${Z(z) + 3}" font-size="9.5" fill="#5b6478" text-anchor="${gauche ? 'end' : 'start'}">${t} ${fr(z)}</text>`; });
  });
  s += `<line x1="${ml}" y1="${Hh - mb}" x2="${W - mr}" y2="${Hh - mb}" stroke="#d9dee7"/>`;
  return s + '</svg>';
}

/** Coupe transversale sur une ligne d'appui : chaussée avec dévers, dalle, appareils, bossages, sommier. */
function coupeTransversale({ di, niv }, i) {
  const L = niv.lignes[i];
  if (!L || !Number.isFinite(L.zSF) || !L.appareils) return '<p class="small">Saisissez la cote de chaussée de cette ligne.</p>';
  const b = di.width / 2, W = 760, Hh = 240, ml = 50, mr = 20;
  const zTop = L.zCh + 0.3, zBot = L.zT - 0.6, kx = (W - ml - mr) / (2 * b + 2), kz = Math.min((Hh - 50) / (zTop - zBot), kx * 8);
  const X = y => ml + (y + b + 1) * kx, Z = z => 30 + (zTop - z) * kz;
  const app = L.appareils, dv = di.devers, pc = dv ? dv.p / 100 : 0, toit = !dv || dv.profil !== 'unique';
  const dzCh = y => (toit ? -pc * Math.abs(y) : pc * y);
  const prof = y => L.zSF + (dv && dv.mode === 'inclinee' ? dzCh(y) : 0);   // sous-face : inclinée avec la chaussée, ou horizontale
  const ys = [-b, ...app.map(a => a.y), b, 0].sort((u, v) => u - v);
  const zsf = ys.map(y => [X(y), Z(prof(y))]), zch = ys.map(y => [X(y), Z(L.zCh + dzCh(y))]);
  let s = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" style="max-width:${W}px;font:11px system-ui" role="img" aria-label="Coupe transversale sur la ligne d'appui">`;
  s += `<text x="${ml}" y="14" font-weight="600">Coupe transversale — ligne ${i === 0 || i === niv.lignes.length - 1 ? 'C' : 'P'}${i} (hauteurs ×${(kz / kx).toFixed(1).replace('.', ',')})</text>`;
  s += `<polygon points="${[...zch, ...zsf.slice().reverse()].map(p => p.join(',')).join(' ')}" fill="#b9c2d1" stroke="#1d2433"/>`;
  s += `<rect x="${X(-b)}" y="${Z(L.zT)}" width="${2 * b * kx}" height="${0.5 * kz}" fill="#d9dee7" stroke="#1d2433"/><text x="${X(b) + 4}" y="${Z(L.zT) + 4}" font-size="10">sommier ${fr(L.zT)}</text>`;
  for (const a of app) {
    const x = X(a.y), w = 0.4 * kx;
    s += `<rect x="${x - w / 2}" y="${Z(L.zT + a.hBossage)}" width="${w}" height="${Math.max(1, a.hBossage * kz)}" fill="#8a96aa"/>`;
    s += `<rect x="${x - w / 2}" y="${Z(a.zSF)}" width="${w}" height="${Math.max(1, (a.zSF - a.zSousApp) * kz)}" fill="#2a8f6a"/>`;
    s += `<text x="${x}" y="${Z(L.zT) + 0.5 * kz + 14}" text-anchor="middle" font-size="9.5">bossage ${fr(a.hBossage)}</text>`;
  }
  s += `<text x="${X(0)}" y="${Z(L.zCh) - 6}" text-anchor="middle" font-size="10">chaussée ${fr(L.zCh)}</text>`;
  return s + '</svg>';
}
