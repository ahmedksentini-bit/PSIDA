/** Outils des chapitres du complément. */

/**
 * Recadre un SVG de feuille (viewBox « 0 0 W H ») sur une fenêtre donnée en fractions [x0, y0, x1, y1] de la feuille
 * (y vers le bas, comme à l'écran) ; largeur et hauteur fixes retirées pour que la figure suive la colonne.
 */
export function recadrer(svg, [x0, y0, x1, y1]) {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!m) return svg;
  const W = +m[1], H = +m[2];
  const vb = `${(x0 * W).toFixed(2)} ${(y0 * H).toFixed(2)} ${((x1 - x0) * W).toFixed(2)} ${((y1 - y0) * H).toFixed(2)}`;
  return svg.replace(/ width="[^"]*" height="[^"]*" viewBox="[^"]*"/, ` viewBox="${vb}" preserveAspectRatio="xMidYMid meet"`)
    .replace('<svg ', '<svg style="width:100%;height:auto;display:block" ');
}
