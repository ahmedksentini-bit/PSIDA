/**
 * Lisibilité des schémas SVG : aucun texte ne doit en chevaucher un autre, et un trait ne doit pas masquer un texte.
 *  - halo : chaque texte reçoit un contour de la couleur du fond (paint-order: stroke), si bien qu'une ligne qui le
 *    traverse passe derrière les lettres au lieu de les barrer ;
 *  - écartement : deux textes dont les boîtes se recouvrent sont séparés en déplaçant le second (ordre du document)
 *    verticalement, du plus petit décalage qui ne crée pas de nouveau recouvrement.
 * S'applique à tous les SVG visibles du site, sauf les graphiques Plotly (qui gèrent leurs libellés) et les
 * schémas marqués data-nodeclutter. Un schéma caché (onglet inactif) est traité quand il devient visible.
 */

const done = new WeakMap(); // svg → signature du contenu déjà traité

const inter = (a, b, m = 0.5) => a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m;

export function declutterSVG(svg) {
  if (svg.closest('.js-plotly-plot, [data-nodeclutter]')) return;
  const r0 = svg.getBoundingClientRect();
  if (r0.width < 20 || r0.height < 20) return; // caché : plus tard
  const sig = svg.innerHTML.length + ':' + svg.childElementCount + ':' + Math.round(r0.width);
  if (done.get(svg) === sig) return;
  const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim() && !t.closest('defs, clipPath, mask, [data-nodeclutter]'));
  for (const t of texts) {
    if (t.dataset.halo) continue;
    t.dataset.halo = '1';
    t.style.paintOrder = 'stroke fill';
    t.style.stroke = 'var(--card, var(--bg, #fff))';
    t.style.strokeWidth = '3px';
    t.style.strokeLinejoin = 'round';
  }
  const boxes = texts.map((t) => ({ t, r: t.getBoundingClientRect() })).filter((q) => q.r.width > 0 && q.r.height > 0);
  for (let i = 1; i < boxes.length; i++) {
    const B = boxes[i];
    const others = boxes.slice(0, i);
    if (!others.some((A) => inter(A.r, B.r))) continue;
    // décalages candidats (px écran) : vers le haut et vers le bas, par pas de la hauteur du texte
    const hgt = B.r.height, cands = [];
    for (let k = 1; k <= 6; k++) cands.push(-k * (hgt * 0.95), k * (hgt * 0.95));
    const svgR = svg.getBoundingClientRect();
    let best = null;
    for (const dy of cands) {
      const r = { left: B.r.left, right: B.r.right, top: B.r.top + dy, bottom: B.r.bottom + dy };
      if (r.top < svgR.top - 2 || r.bottom > svgR.bottom + 2) continue;
      if (!others.some((A) => inter(A.r, r))) { best = dy; break; }
    }
    if (best == null) continue;
    // conversion écran → repère local du texte
    const m = B.t.getScreenCTM();
    const k = m ? Math.hypot(m.c, m.d) || 1 : 1;
    const prev = B.t.getAttribute('transform') || '';
    B.t.setAttribute('transform', `${prev} translate(0 ${(best / k).toFixed(2)})`.trim());
    B.r = B.t.getBoundingClientRect();
  }
  done.set(svg, svg.innerHTML.length + ':' + svg.childElementCount + ':' + Math.round(r0.width));
}

let pending = 0;
export function declutterAll(root = document) {
  for (const svg of root.querySelectorAll('svg')) { try { declutterSVG(svg); } catch { /* schéma non mesurable */ } }
}
/** Surveille le document : tout SVG ajouté ou rendu visible est traité (au plus une fois par image). */
export function watchDeclutter() {
  const run = () => { pending = 0; declutterAll(); };
  const schedule = () => { if (!pending) pending = requestAnimationFrame(() => setTimeout(run, 30)); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  addEventListener('resize', schedule);
  schedule();
}
