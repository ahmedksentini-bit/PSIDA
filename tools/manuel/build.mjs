#!/usr/bin/env node
/**
 * Contrôle de non-régression des valeurs citées par le manuel d'utilisation (chapitres 31 à 34, annexe G).
 *
 *   node tools/manuel/build.mjs [dossier de sortie]      (ou : npm run manuel:check)
 *
 * Le manuel est un polycopié unique rédigé dans Claude Docs et exporté en PDF (docs/manuel/PSIDA_Manuel.pdf, voir
 * docs/manuel/LISEZMOI.md). Les modules docs/manuel/complement/ch31.mjs à ch34.mjs recodent, indépendamment de PSIDA,
 * les calculs à la main de ces chapitres et les comparent aux valeurs que PSIDA donne aujourd'hui (k.cmp). Le script
 * s'arrête (code 1) si un écart sort de sa tolérance : le chiffre cité par le manuel n'est plus celui de PSIDA, et le
 * manuel ou PSIDA est à corriger. Il ne produit plus de PDF ; avec un dossier de sortie, il y écrit controles.json
 * (le tableau de l'annexe G) et, si KATEX_DIR est donné, chapitres.html pour relire les calculs mis en forme.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerKit, fr } from '../../docs/manuel/complement/kit.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../..');
const SRC = path.join(RACINE, 'docs/manuel/complement');
const [out] = process.argv.slice(2);

const CHAPITRES = ['ch31.mjs', 'ch32.mjs', 'ch33.mjs', 'ch34.mjs'];

const k = creerKit();
for (const f of CHAPITRES) {
  const t0 = Date.now();
  const mod = await import(path.join(SRC, f));
  await mod.default(k);
  console.error(`${f} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const ctl = k.controles;
const ko = ctl.filter(c => !c.ok);
if (out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'controles.json'), JSON.stringify(ctl, null, 1));
  if (process.env.KATEX_DIR) {
    const css = fs.readFileSync(path.join(process.env.KATEX_DIR, 'dist/katex.min.css'), 'utf8')
      .replace(/url\(fonts\//g, `url(file://${process.env.KATEX_DIR}/dist/fonts/`);
    fs.writeFileSync(path.join(out, 'chapitres.html'), `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>PSIDA — manuel, chapitres 31 à 34 (relecture des calculs)</title><style>${css}</style>
<style>body{font-family:Carlito,Calibri,sans-serif;max-width:180mm;margin:auto;line-height:1.5}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:3px 6px}.eq{text-align:center}</style>
</head><body>${k.blocs.join('\n')}</body></html>`);
  }
}
for (const c of ko) console.error(`ÉCART HORS TOLÉRANCE — ch. ${c.chapitre}, ${c.libelle} : main ${fr(c.main, 4)}, PSIDA ${fr(c.psida, 4)} (${(100 * c.rel).toFixed(2)} %, tolérance ${(100 * c.tol).toFixed(1)} %)`);
console.error(`${ctl.length} contrôles des chapitres 31 à 34, ${ko.length} hors tolérance${out ? ` → ${out}` : ''}`);
process.exit(ko.length ? 1 : 0);
