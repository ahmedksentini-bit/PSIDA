/**
 * Version de PSIDA : `node tools/version.mjs 0.24.2` met à jour la version (app.js, tabs.js, index.html) et régénère la
 * carte d'import (importmap) de index.html, qui ajoute « ?v=version » à TOUS les modules ES (web/ et src/). Sans elle, un
 * module importé sans paramètre (par exemple ./guide_schema.js) peut rester en cache du navigateur après une mise à jour.
 */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const v = process.argv[2] || (fs.readFileSync(path.join(root, 'web/app.js'), 'utf8').match(/version: '([\d.]+)'/) || [])[1];
if (!/^\d+\.\d+(\.\d+)?$/.test(v || '')) { console.error('version invalide'); process.exit(1); }
const files = [];
const walk = d => { for (const f of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) { if (!['web/ec8', 'web/vendor/katex'].includes(p)) walk(p); } else if (/\.(m?js)$/.test(f.name) && p !== 'web/tabs.js' && !/plotly/.test(f.name)) files.push(p); } };
walk('web'); walk('src');
const map = { imports: Object.fromEntries(files.sort().map(f => [`./${f}`, `./${f}?v=${v}`])) };
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const block = `<!-- importmap:début (tools/version.mjs) --><script type="importmap">${JSON.stringify(map)}</script><!-- importmap:fin -->`;
html = /<!-- importmap:début[\s\S]*?importmap:fin -->/.test(html) ? html.replace(/<!-- importmap:début[\s\S]*?importmap:fin -->/, block) : html.replace(/(<script src="\.\/web\/tabs\.js)/, `${block}\n$1`);
html = html.replace(/\?v=[\d.]+/g, m => m).replace(/(tabs\.js|app\.js)\?v=[\d.]+/g, `$1?v=${v}`);
html = html.replace(/import\('\.\/web\/app\.js\?v=[\d.]+'\)/, "import('./web/app.js')");
fs.writeFileSync(path.join(root, 'index.html'), html);
for (const f of ['web/app.js']) { const p = path.join(root, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/version: '[\d.]+'/g, `version: '${v}'`)); }
const t = path.join(root, 'web/tabs.js'); fs.writeFileSync(t, fs.readFileSync(t, 'utf8').replace(/'\?v=' \+ '[\d.]+'/, `'?v=' + '${v}'`));
console.log(`version ${v} ; ${files.length} modules dans la carte d'import`);
