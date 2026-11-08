/**
 * Carte de couverture : lance chaque fichier de test seul (NODE_V8_COVERAGE), mesure sa durée et relève, pour chaque
 * module visé, si l'une de ses fonctions a réellement été exécutée (au-delà du simple chargement du module).
 * Écrit tools/mutation/.cache/couverture.json. Usage : node tools/mutation/couverture.mjs [parallélisme] [fichiers…]
 * (avec des fichiers : seuls ceux-là sont mesurés, et la carte existante est complétée)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MODULES } from './modules.mjs';

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const cache = path.join(racine, 'tools/mutation/.cache');
fs.mkdirSync(cache, { recursive: true });
const choisis = process.argv.slice(3);
const tests = choisis.length ? choisis : fs.readdirSync(path.join(racine, 'test')).filter(f => f.endsWith('.test.js')).sort();
const par = +(process.argv[2] || os.cpus().length);
const fich = path.join(cache, 'couverture.json');
const res = choisis.length && fs.existsSync(fich) ? JSON.parse(fs.readFileSync(fich, 'utf8')) : {};

function lancer(f) {
  return new Promise(ok => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
    const t0 = Date.now();
    const p = spawn(process.execPath, ['--test', '--test-reporter=dot', path.join('test', f)], { cwd: racine, env: { ...process.env, NODE_V8_COVERAGE: dir }, stdio: 'ignore' });
    p.on('close', code => {
      const duree = (Date.now() - t0) / 1000, couverts = new Set();
      for (const j of fs.readdirSync(dir)) {
        const d = JSON.parse(fs.readFileSync(path.join(dir, j), 'utf8'));
        for (const s of d.result) {
          const m = MODULES.find(m => s.url.endsWith('/' + m));
          if (!m) continue;
          if (s.functions.some(fn => fn.functionName !== '' && fn.ranges[0].count > 0)) couverts.add(m);
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
      res[f] = { duree, code, modules: [...couverts] };
      process.stderr.write(`${f} ${duree.toFixed(1)} s ${[...couverts].join(' ')}\n`);
      ok();
    });
  });
}

const file = [...tests];
await Promise.all(Array.from({ length: par }, async () => { while (file.length) await lancer(file.shift()); }));
fs.writeFileSync(fich, JSON.stringify(res, null, 1));
