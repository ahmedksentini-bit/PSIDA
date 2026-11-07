#!/usr/bin/env node
/**
 * Construit le HTML du complément au manuel (docs/manuel/complement) : chapitres, sommaire, récapitulatif des contrôles.
 *
 *   node tools/manuel/build.mjs <dossier de sortie> [pages.json]
 *
 * pages.json (facultatif, produit par tools/manuel/pdf.py au premier passage) : { "<id de titre>": page } pour le sommaire.
 * Sortie : complement.html, titres.json (titres et ancres), controles.json. Code de sortie 1 si un contrôle échoue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerKit, fr } from '../../docs/manuel/complement/kit.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../..');
const SRC = path.join(RACINE, 'docs/manuel/complement');
const [out = '/tmp/manbuild', pagesFile] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const pages = pagesFile && fs.existsSync(pagesFile) ? JSON.parse(fs.readFileSync(pagesFile, 'utf8')) : {};
const VERSION = process.env.VERSION_MANUEL || fs.readFileSync(path.join(RACINE, 'web/app.js'), 'utf8').match(/version: '([\d.]+)'/)[1];
const KATEX_DIR = process.env.KATEX_DIR || '/tmp/mbuild/node_modules/katex';

const CHAPITRES = ['ch31.mjs', 'ch32.mjs', 'ch33.mjs', 'ch34.mjs'].filter(f => fs.existsSync(path.join(SRC, f)));

const k = creerKit();
for (const f of CHAPITRES) {
  const t0 = Date.now();
  const mod = await import(path.join(SRC, f));
  await mod.default(k);
  console.error(`${f} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// —— récapitulatif des contrôles (annexe)
const ctl = k.controles;
k.h1('G', 'Contrôles du complément');
k.p(`Chaque comparaison « à la main / PSIDA » de ce complément est recalculée à la construction du document
  (tools/manuel/build.mjs) : le calcul à la main est recodé dans le chapitre, indépendamment de PSIDA, et la construction
  s'arrête si un écart dépasse sa tolérance. Le manuel ne peut donc pas citer un chiffre que PSIDA ne donne plus.
  ${ctl.length} comparaisons, ${ctl.filter(c => c.ok).length} dans leur tolérance.`);
k.table(['Ch.', 'Grandeur', 'À la main', 'PSIDA', 'Écart', 'Tol.'], ctl.map(c => [
  c.chapitre, c.libelle, fr(c.main, Math.abs(c.main) >= 100 ? 1 : 3), fr(c.psida, Math.abs(c.psida) >= 100 ? 1 : 3),
  `${fr(100 * c.rel, 2)} %`, `${fr(100 * c.tol, 1)} %`]), { larg: [6, 46, 13, 13, 11, 11], num: false, long: true });

// —— page de titre et sommaire
const titres = k.titres;
const sommaire = titres.map(t => `<div class="toc${t.niv}"><a href="#${t.id}"><span>${t.niv === 1 ? (/^\d/.test(t.num) ? `Chapitre ${t.num} — ` : `Annexe ${t.num}. `) : `${t.num} `}${t.titre}</span>`
  + `<span class="pg">${pages[t.id] ?? ''}</span></a></div>`).join('\n');

const css = fs.readFileSync(path.join(KATEX_DIR, 'dist/katex.min.css'), 'utf8')
  .replace(/url\(fonts\//g, `url(file://${KATEX_DIR}/dist/fonts/`);

const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>PSIDA — Manuel, complément ${VERSION}</title>
<style>${css}</style>
<style>
@page { size: A4; margin: 22mm 20mm 20mm 20mm; }
html { font-family: Carlito, Calibri, sans-serif; font-size: 10.6pt; color: #1b1b1b; }
body { margin: 0; line-height: 1.5; text-align: left; hyphens: auto; }
h1 { font-size: 17pt; color: #1f3a5f; border-bottom: 1.3px solid #1f3a5f; padding-bottom: 5px; margin: 0 0 12px; break-before: page; break-after: avoid; }
h2 { font-size: 13.5pt; color: #1f3a5f; margin: 16px 0 6px; break-after: avoid; }
h3 { font-size: 11.5pt; color: #1f3a5f; margin: 12px 0 4px; break-after: avoid; }
p { margin: 0 0 8px; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 8px; padding-left: 22px; } li { margin: 0 0 3px; }
.eq { margin: 6px 0 10px; text-align: center; break-inside: avoid; }
.katex { font-size: 1.05em; } .katex-display { margin: 0; }
.tbl { margin: 8px 0 12px; break-inside: avoid; } .tbl.long { break-inside: auto; } tr { break-inside: avoid; }
.tcap { font-style: italic; font-size: 10pt; margin: 0 0 4px; color: #333; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th { background: #dce1e8; color: #1b1b1b; font-weight: bold; border: 1px solid #8f9bab; padding: 4px 6px; text-align: center; }
td { border: 1px solid #8f9bab; padding: 4px 6px; vertical-align: top; }
figure { margin: 10px 0 14px; text-align: center; break-inside: avoid; }
figure img, .svgbox { display: block; margin: 0 auto; border: 1px solid #c9ced6; }
figcaption { font-style: italic; font-size: 10.3pt; margin-top: 5px; text-align: left; }
.note { border-left: 3px solid #1f3a5f; background: #f1f4f8; padding: 6px 10px; margin: 8px 0 12px; break-inside: avoid; }
.saut { break-after: page; }
.couv { height: 245mm; display: flex; flex-direction: column; justify-content: center; }
.couv .t1 { font-size: 26pt; color: #1f3a5f; font-weight: bold; margin-bottom: 10px; }
.couv .t2 { font-size: 15pt; color: #1f3a5f; margin-bottom: 40px; }
.couv .t3 { font-size: 12pt; margin-bottom: 6px; }
.somm h1 { break-before: page; }
.toc1 { font-weight: bold; margin: 9px 0 2px; } .toc2 { margin: 1px 0 1px 18px; }
.toc1 a, .toc2 a { display: flex; color: inherit; text-decoration: none; }
.toc1 a span:first-child, .toc2 a span:first-child { flex: 1; }
.pg { padding-left: 10px; }
a { color: inherit; text-decoration: none; }
</style></head><body>
<section class="couv">
  <div class="t1">PSIDA — Manuel d’utilisation</div>
  <div class="t2">Complément de la version ${VERSION} : chapitres 31 à 34</div>
  <div class="t3">Ahmed Ksentini</div>
  <div class="t3">Ingénieur, docteur en génie civil</div>
  <div class="t3" style="margin-top:30px">Novembre 2026 — PSIDA version ${VERSION}</div>
  <div style="margin-top:50px;max-width:150mm">Ce complément suit les chapitres 1 à 30 et les annexes A à F du manuel de la version 0.99.
  Il couvre les versions 0.99.14 à ${VERSION} : ponts à poutres en béton armé continus, compléments Eurocodes, plans
  d’exécution, dalles de transition et murs en aile. Comme dans le manuel, chaque calcul principal est refait à la main
  et comparé à PSIDA ; l’annexe G récapitule ces comparaisons.</div>
</section>
<section class="somm"><h1 style="border:none">Sommaire du complément</h1>${sommaire}</section>
${k.blocs.join('\n')}
</body></html>`;

fs.writeFileSync(path.join(out, 'complement.html'), html);
fs.writeFileSync(path.join(out, 'titres.json'), JSON.stringify(titres, null, 1));
fs.writeFileSync(path.join(out, 'controles.json'), JSON.stringify(ctl, null, 1));
const ko = ctl.filter(c => !c.ok);
for (const c of ko) console.error(`ÉCART HORS TOLÉRANCE — ch. ${c.chapitre}, ${c.libelle} : main ${c.main}, PSIDA ${c.psida} (${(100 * c.rel).toFixed(2)} %)`);
console.error(`${ctl.length} contrôles, ${ko.length} hors tolérance → ${out}/complement.html`);
process.exit(ko.length ? 1 : 0);
