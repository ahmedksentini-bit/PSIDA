/**
 * Feuille de plan → PDF vectoriel (jsPDF 2.5 + svg2pdf.js 2.2, police DejaVu Sans Condensed incorporée).
 * Les bibliothèques sont chargées à la première demande (web/vendor/plans, licences MIT / Bitstream Vera).
 */
import { feuilleSVG } from '../src/plans/svg.js';

const VENDOR = new URL('./vendor/plans/', import.meta.url).href;
let pret = null;
function script(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('chargement impossible : ' + src)); document.head.appendChild(s); });
}
function charger() {
  if (!pret) pret = (async () => {
    if (!window.jspdf) await script(VENDOR + 'jspdf.umd.min.js');
    if (!window.svg2pdf) await script(VENDOR + 'svg2pdf.umd.min.js');
    return await import(VENDOR + 'dejavu.js');
  })();
  return pret;
}

const FAMILLE = 'DejaVuSansCondensed';

/** Document jsPDF d'une ou plusieurs feuilles (une page par feuille, au format réel). */
export async function feuillesPDF(feuilles, { titre = 'Plans PSIDA', auteur = '' } = {}) {
  const { DEJAVU_NORMAL, DEJAVU_BOLD } = await charger();
  const { jsPDF } = window.jspdf;
  let doc = null;
  for (const F of feuilles) {
    const fmt = [Math.max(F.W, F.H), Math.min(F.W, F.H)];
    if (!doc) {
      doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: fmt, compress: true });
      doc.addFileToVFS('DejaVuSansCondensed.ttf', DEJAVU_NORMAL); doc.addFont('DejaVuSansCondensed.ttf', FAMILLE, 'normal');
      doc.addFileToVFS('DejaVuSansCondensed-Bold.ttf', DEJAVU_BOLD); doc.addFont('DejaVuSansCondensed-Bold.ttf', FAMILLE, 'bold');
      doc.setFont(FAMILLE, 'normal');
      doc.setProperties({ title: titre, author: auteur, creator: 'PSIDA' });
    } else { doc.addPage(fmt, 'landscape'); doc.setFont(FAMILLE, 'normal'); }
    const hote = document.createElement('div');
    hote.style.cssText = 'position:absolute;left:-99999px;top:0;';
    const mesure = (t, h, gras) => { doc.setFont(FAMILLE, gras ? 'bold' : 'normal'); return doc.getStringUnitWidth(t) * h; };
    hote.innerHTML = feuilleSVG(F, { couleurs: true, police: FAMILLE, mm: false, mesure });
    doc.setFont(FAMILLE, 'normal');
    document.body.appendChild(hote);
    try { await doc.svg(hote.firstElementChild, { x: 0, y: 0, width: F.W, height: F.H }); } finally { hote.remove(); }
  }
  return doc;
}

export async function feuillesPDFBlob(feuilles, o) { return (await feuillesPDF(feuilles, o)).output('blob'); }
