/**
 * Tracé en plan d'un ouvrage courbe (onglet Projet) : lecture d'un DXF (axe de l'ouvrage sur un calque, lignes d'appui sur
 * un autre), abscisses des lignes d'appui le long de l'axe → portées, contrôle des lignes radiales, vue en plan.
 * Le tracé est écrit dans le champ caché « trace » (JSON { segments, s0, source }) ; les portées dans « spans » ;
 * la méthode du tablier passe en plaque (Guyon-Massonnet suppose un tablier droit).
 */
import { lireDXF } from '../src/geom/dxf.js';
import { Axe, stationsAppuis } from '../src/geom/axe.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fr = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '–');

/** Analyse d'un DXF : axe, stations des lignes d'appui, portées. Lève une erreur explicite si la géométrie ne convient pas. */
export function analyserDXF(texte, { calqueAxe, calqueAppuis, echelle = 1 } = {}) {
  const d = lireDXF(texte, { echelle });
  const cal = d.calques;
  const cA = calqueAxe || cal.find(c => /axe|axis|cl/i.test(c)) || cal[0];
  const cP = calqueAppuis || cal.find(c => /appui|pile|support|ligne/i.test(c) && c !== cA) || cal.find(c => c !== cA);
  const eA = d.entites.filter(e => e.calque === cA);
  if (!eA.length) throw new Error(`aucune entité sur le calque d'axe « ${cA} »`);
  const axe = Axe.depuisEntites(eA);
  const lignes = d.entites.filter(e => e.calque === cP).flatMap(e => e.segments).filter(g => g.type === 'ligne');
  if (lignes.length < 2) throw new Error(`il faut au moins deux lignes d'appui (segments) sur le calque « ${cP} »`);
  const st = stationsAppuis(axe, lignes);
  const warnings = [];
  const biais = st.filter(s => Math.abs(s.psi - 100) > 1);
  if (biais.length) throw new Error(`ligne(s) d'appui non radiale(s) (ψ = ${biais.map(s => fr(s.psi, 1)).join(', ')} gr) : le biais sur un ouvrage courbe n'est pas traité — dessiner les lignes d'appui perpendiculaires à l'axe`);
  const spans = st.slice(1).map((s, k) => s.s - st[k].s);
  if (spans.some(L => L < 1)) throw new Error('deux lignes d\'appui à moins d\'un mètre l\'une de l\'autre');
  const rMin = axe.rayonMin();
  if (st[0].s < -1e-6 || st[st.length - 1].s > axe.L + 1e-6) warnings.push('l\'axe ne couvre pas toutes les lignes d\'appui : prolongé en ligne droite');
  return { axe, calques: cal, calqueAxe: cA, calqueAppuis: cP, stations: st, spans, rMin, warnings, nSeg: axe.seg.length };
}

/** Vue en plan SVG : axe, bords de la dalle (±b), lignes d'appui et leurs noms. */
export function planSVG(axe, stations, b = 6) {
  const sA = Math.min(0, stations[0].s), sB = Math.max(axe.L, stations[stations.length - 1].s), N = 200;
  const pts = y => Array.from({ length: N + 1 }, (_, k) => axe.pointDeporte(sA + (sB - sA) * k / N, y));
  const ax = pts(0), g = pts(b), d = pts(-b), all = [...g, ...d];
  const xmin = Math.min(...all.map(p => p[0])), xmax = Math.max(...all.map(p => p[0])), ymin = Math.min(...all.map(p => p[1])), ymax = Math.max(...all.map(p => p[1]));
  const W = 640, m = 30, sc = (W - 2 * m) / Math.max(1e-6, xmax - xmin), H = Math.max(160, (ymax - ymin) * sc + 2 * m);
  const X = p => (m + (p[0] - xmin) * sc).toFixed(1), Y = p => (H - m - (p[1] - ymin) * sc).toFixed(1);
  const pl = P => P.map((p, k) => `${k ? 'L' : 'M'}${X(p)},${Y(p)}`).join('');
  let s = `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" class="trace-plan" role="img" aria-label="Vue en plan du tracé">`;
  s += `<path d="${pl(g)}${pl(d.slice().reverse()).replace('M', 'L')}Z" class="tp-dalle"/>`;
  s += `<path d="${pl(ax)}" class="tp-axe"/>`;
  stations.forEach((st, i) => {
    const a = axe.pointDeporte(st.s, -b - 1), c = axe.pointDeporte(st.s, b + 1), t = axe.pointDeporte(st.s, b + 2.5);
    const nom = i === 0 ? 'C0' : i === stations.length - 1 ? `C${i}` : `P${i}`;
    s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(c)}" y2="${Y(c)}" class="tp-appui"/><text x="${X(t)}" y="${Y(t)}" class="tp-nom">${nom}</text>`;
  });
  return s + '</svg>';
}

export function initTrace(form, { setField }) {
  const box = document.getElementById('trace-box'); if (!box) return { refresh() {} };
  const file = box.querySelector('#trace-file'), sA = box.querySelector('#trace-calque-axe'), sP = box.querySelector('#trace-calque-appuis');
  const info = box.querySelector('#trace-info'), btnX = box.querySelector('#trace-effacer');
  let texte = null, nom = '';
  const b = () => +form.elements.width.value / 2 || 6;
  const montrer = () => {
    const t = form.elements.trace.value;
    btnX.hidden = !t;
    if (!t) { info.innerHTML = '<span class="small">Ouvrage droit (pas de tracé importé).</span>'; return; }
    try {
      const o = JSON.parse(t), axe = new Axe(o.segments);
      const st = (o.stations || []).map(s => ({ s: s }));
      info.innerHTML = `<p class="small">Tracé ${esc(o.source || '')} : ${o.segments.length} élément(s), longueur ${fr(axe.L)} m, rayon minimal ${fr(axe.rayonMin(), 1)} m ; lignes d'appui aux abscisses ${(o.stations || []).map(v => fr(v)).join(' ; ')} m. Tablier calculé en plaque (éléments finis) ; force centrifuge EN 1991-2 § 4.4.2 dans le groupe gr2.</p>${st.length ? planSVG(axe, st, b()) : ''}`;
    } catch (e) { info.textContent = 'Tracé illisible : ' + e.message; }
  };
  const analyser = () => {
    if (!texte) return;
    try {
      const r = analyserDXF(texte, { calqueAxe: sA.value || undefined, calqueAppuis: sP.value || undefined });
      const opts = sel => r.calques.map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
      sA.innerHTML = opts(r.calqueAxe); sP.innerHTML = opts(r.calqueAppuis); sA.disabled = sP.disabled = false;
      const s0 = r.stations[0].s;
      setField('trace', JSON.stringify({ segments: r.axe.seg.map(({ s0: _a, L: _b, ...g }) => g), s0, source: nom, stations: r.stations.map(s => +s.s.toFixed(4)) }));
      setField('spans', r.spans.map(L => +L.toFixed(3)).join(', '));
      setField('psi', '100');
      setField('methodeTablier', 'plaque');
      montrer();
      if (r.warnings.length) info.insertAdjacentHTML('afterbegin', `<p class="small warn">${r.warnings.map(esc).join(' ; ')}</p>`);
    } catch (e) { info.innerHTML = `<p class="small warn">DXF non retenu : ${esc(e.message)}</p>`; }
  };
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; nom = f.name; texte = await f.text(); sA.value = ''; sP.value = ''; sA.innerHTML = sP.innerHTML = ''; analyser(); });
  sA.addEventListener('change', analyser); sP.addEventListener('change', analyser);
  btnX.addEventListener('click', () => { setField('trace', ''); texte = null; file.value = ''; montrer(); });
  form.elements.width.addEventListener('change', montrer);
  montrer();
  return { refresh: montrer };
}
