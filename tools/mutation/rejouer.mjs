/**
 * Rejoue les survivants d'une campagne (après ajout de tests) : copie resultats.json vers resultats-apres.json (s'il
 * n'existe pas encore) puis relance, module par module, les seuls mutants encore survivants de resultats-apres.json. Usage : node tools/mutation/rejouer.mjs [options de lancer.mjs]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const cache = path.join(dir, '.cache');
if (!fs.existsSync(path.join(cache, 'resultats-apres.json'))) fs.copyFileSync(path.join(cache, 'resultats.json'), path.join(cache, 'resultats-apres.json'));
const avant = JSON.parse(fs.readFileSync(path.join(cache, 'resultats-apres.json'), 'utf8'));
for (const [mod, r] of Object.entries(avant)) {
  const ids = Object.entries(r.mutants).filter(([, x]) => x.etat !== 'tue').map(([id]) => id);
  if (!ids.length) continue;
  spawnSync(process.execPath, [path.join(dir, 'lancer.mjs'), '--module', mod, '--ids', ids.join(','), '--sortie', 'resultats-apres.json', ...process.argv.slice(2)], { stdio: 'inherit' });
}
