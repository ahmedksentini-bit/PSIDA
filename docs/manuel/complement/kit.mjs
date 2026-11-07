/**
 * Kit des chapitres 31 à 34 du manuel d'utilisation : calculs à la main recodés et comparés à PSIDA.
 *
 * Chaque chapitre est un module qui reçoit un objet « k » et y empile des blocs HTML (titres, paragraphes, équations,
 * tableaux, figures). Les valeurs de PSIDA sont calculées au moment de la construction ; les calculs « à la main »
 * sont recodés indépendamment dans le chapitre. k.cmp() compare les deux et enregistre l'écart : la construction
 * échoue si un écart dépasse sa tolérance, de sorte que le manuel ne peut pas citer un chiffre que PSIDA ne donne plus.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// KaTeX n'est chargé que si KATEX_DIR est donné (rendu HTML des formules, pour relire un chapitre) : le contrôle des
// valeurs (tools/manuel/build.mjs, npm run manuel:check) n'en a pas besoin et garde le TeX brut.
const katex = process.env.KATEX_DIR ? require(path.join(process.env.KATEX_DIR, 'dist/katex.js')) : null;

const ESP = ' ';   // espace fine insécable (milliers)

/** Nombre au format français : virgule décimale, espace fine pour les milliers, signe moins typographique. */
export function fr(x, d = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const s = Math.abs(x).toFixed(d), [e, f] = s.split('.');
  const ent = e.replace(/\B(?=(\d{3})+(?!\d))/g, ESP);
  const neg = x < 0 && Number(s) !== 0;
  return (neg ? '−' : '') + ent + (f ? ',' + f : '');
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Formule KaTeX (les virgules décimales s'écrivent {,} dans le TeX). */
export function tex(t, display = false) {
  if (!katex) return `<code class="tex">${esc(t)}</code>`;
  return katex.renderToString(t.replace(/\u202f/g, '\\,'), { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' });
}

/** Remplace $…$ par des formules en ligne dans un texte HTML. */
function inline(html) {
  return html.replace(/\$([^$]+)\$/g, (_, t) => tex(t));
}

export function creerKit() {
  const blocs = [], controles = [], titres = [];
  let ch = '', nSec = 0, nFig = 0, nTab = 0;
  const k = {
    blocs, controles, titres, fr, tex,
    /** Titre de chapitre : « 31. Titre ». */
    h1(num, titre) {
      ch = String(num); nSec = 0; nFig = 0; nTab = 0;
      titres.push({ niv: 1, num: ch, titre, id: `c${ch}` });
      const lib = /^\d/.test(ch) ? `${ch}. ` : `Annexe ${ch}. `;
      blocs.push(`<h1 id="c${ch}">${lib}${inline(esc(titre))}</h1>`);
    },
    /** Titre de section : « 31.2 Titre » (numéro automatique). */
    h2(titre) {
      nSec++;
      const num = `${ch}.${nSec}`;
      titres.push({ niv: 2, num, titre, id: `s${num}` });
      blocs.push(`<h2 id="s${num}">${num} ${inline(esc(titre))}</h2>`);
      return num;
    },
    h3(titre) { blocs.push(`<h3>${inline(esc(titre))}</h3>`); },
    /** Paragraphe : texte HTML, $…$ pour les formules en ligne, **gras**. */
    p(html) { blocs.push(`<p>${inline(html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'))}</p>`); },
    ul(items) { blocs.push(`<ul>${items.map(i => `<li>${inline(i.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'))}</li>`).join('')}</ul>`); },
    ol(items) { blocs.push(`<ol>${items.map(i => `<li>${inline(i.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'))}</li>`).join('')}</ol>`); },
    /** Équation centrée. */
    eq(t) { blocs.push(`<div class="eq">${tex(t, true)}</div>`); },
    /** Tableau : en-tête, lignes (cellules HTML avec $…$), légende facultative au-dessus. */
    table(head, rows, { legende = null, larg = null, num = true, long = false } = {}) {
      let cap = '';
      if (legende) { nTab++; cap = `<div class="tcap">${num ? `Tableau ${ch}.${nTab} — ` : ''}${inline(legende)}</div>`; }
      const cols = larg ? `<colgroup>${larg.map(w => `<col style="width:${w}%">`).join('')}</colgroup>` : '';
      blocs.push(`<div class="tbl${long ? ' long' : ''}">${cap}<table>${cols}<thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    },
    /** Figure : SVG en ligne ou image (chemin relatif au HTML), légende numérotée. */
    fig({ svg = null, src = null, legende, largeur = 100 }) {
      nFig++;
      const corps = svg ? `<div class="svgbox" style="width:${largeur}%">${svg}</div>` : `<img src="${src}" style="width:${largeur}%">`;
      blocs.push(`<figure>${corps}<figcaption>Figure ${ch}.${nFig} — ${inline(legende)}</figcaption></figure>`);
      return `${ch}.${nFig}`;
    },
    /** Encadré « à retenir » ou « attention ». */
    note(html, titre = 'À retenir') {
      blocs.push(`<div class="note"><b>${titre}.</b> ${inline(html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'))}</div>`);
    },
    saut() { blocs.push('<div class="saut"></div>'); },
    /**
     * Comparaison main / PSIDA : lignes [libellé, valeur main, valeur PSIDA, unité, décimales, tolérance relative].
     * Écrit le tableau et enregistre chaque écart.
     */
    cmp(lignes, { legende = 'Calcul à la main et PSIDA', tolDefaut = 0.005 } = {}) {
      const rows = lignes.map(([lib, main, psida, unite = '', d = 2, tol = tolDefaut, absTol = 0]) => {
        const ecart = Math.abs(main - psida), rel = ecart / Math.max(Math.abs(main), 1e-12);
        const ok = ecart <= absTol || rel <= tol;
        controles.push({ chapitre: ch, libelle: lib, main, psida, rel, tol, ok });
        const pct = Math.abs(main) < 1e-12 && Math.abs(psida) < 1e-12 ? '0' : fr(100 * (psida - main) / main, rel < 0.0005 ? 2 : 1);
        return [lib, fr(main, d), fr(psida, d), unite, `${pct} %`];
      });
      k.table(['Grandeur', 'À la main', 'PSIDA', 'Unité', 'Écart'], rows, { legende, larg: [44, 15, 15, 12, 14] });
    },
  };
  return k;
}
