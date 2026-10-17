/** Valeurs par défaut du formulaire de index.html (pour la chaîne de calcul sous Node : tests, notes). */
import { readFileSync } from 'node:fs';
export function formDefaults(path = new URL('../index.html', import.meta.url)) {
  const html = readFileSync(path, 'utf8'), d = {};
  for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
    const a = m[1], name = (a.match(/name="([^"]+)"/) || [])[1]; if (!name) continue;
    const type = (a.match(/type="([^"]+)"/) || [])[1];
    if (type === 'checkbox') { if (/\bchecked\b/.test(a)) d[name] = 'on'; continue; }
    d[name] = (a.match(/value="([^"]*)"/) || [, ''])[1];
  }
  for (const m of html.matchAll(/<textarea\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) d[m[1]] = m[2];
  for (const m of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const sel = m[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/) || m[2].match(/<option[^>]*value="([^"]*)"/);
    d[m[1]] = sel ? sel[1] : '';
  }
  return d;
}
/** Exemple PSIDA.EL 1984 (note commentée) — mêmes valeurs que le bouton de l'interface. */
export const PSIDAEL_EXAMPLE = {
  spans: '9.75, 13.93, 13.93, 9.75', width: '7.913', h: '0.52', area: '4.1256', overhangs: '0.35, 0.35', roadway: '-3, 3', footways: '-3.9565,-3 ; 3,3.9565', lines: '',
  bands: '5.371 sur -3.9565,3.9565 k 0.6/1.0', ys: '-3.9565, -3, -1.978, 0, 1.978, 3, 3.9565', Leq: '', leqMethod: 'fleches', nRetenue: '0', classe: '1', mil: 'Mc120', nu: '0', withTherm: 'on', dT: '0, 0', delta: '0.01', phiFluage: '2',
  hEdge: '', joue: '', EI: '38032, 0.09272', fck: '30.6', fyk: '400', cover: '0.025', fiss: 'peu nuisible', psi: '80', withChantier: undefined, lm3: '', cant: '',
};
