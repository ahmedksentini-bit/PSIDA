/**
 * Campagne de mutation. Pour chaque module de tools/mutation/modules.mjs :
 *  1. échantillon de mutants (graine fixe, au plus N par module, tous opérateurs confondus) ;
 *  2. chaque mutant est écrit dans une copie de travail du dépôt et les tests qui exécutent le module (carte
 *     tools/mutation/.cache/couverture.json) sont lancés du plus rapide au plus lent, dans la limite d'un budget de
 *     temps ; le premier « not ok » tue le mutant, un dépassement de délai aussi (boucle infinie) ;
 *  3. les survivants sont rejoués sur un second jeu de tests couvrants plus large (budget --budget2, 120 s par défaut).
 * Résultats : tools/mutation/.cache/resultats.json (reprise possible), résumé en sortie.
 * Usage : node tools/mutation/lancer.mjs [--max 120] [--budget 20] [--budget2 120] [--workers 2] [--module src/beam.js] [--ids 1,2,3]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MODULES } from './modules.mjs';
import { mutants, appliquer } from './mutants.mjs';

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const cache = path.join(racine, 'tools/mutation/.cache');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const MAX = +arg('max', 120), BUDGET = +arg('budget', 20), BUDGET2 = +arg('budget2', 120), WORKERS = +arg('workers', os.cpus().length);
const SEUL = arg('module', null), IDS = arg('ids', null) ? arg('ids').split(',').map(Number) : null;
const SORTIE = arg('sortie', 'resultats.json');
const couv = JSON.parse(fs.readFileSync(path.join(cache, 'couverture.json'), 'utf8'));
const fichRes = path.join(cache, SORTIE);
const resultats = fs.existsSync(fichRes) ? JSON.parse(fs.readFileSync(fichRes, 'utf8')) : {};

// générateur pseudo-aléatoire à graine fixe (mulberry32)
const alea = graine => () => { graine |= 0; graine = graine + 0x6D2B79F5 | 0; let t = Math.imul(graine ^ graine >>> 15, 1 | graine); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export function echantillon(liste, n, graine = 20261108) {
  const r = alea(graine), a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n).sort((x, y) => x.id - y.id);
}

// copies de travail (une par processus)
const copies = [];
function preparerCopies() {
  for (let w = 0; w < WORKERS; w++) {
    const dir = path.join(os.tmpdir(), `mutation-psida-${w}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.cpSync(racine, dir, { recursive: true, filter: s => !/\/(\.git|node_modules)$|\/tools\/mutation\/\.cache|\.pdf$/.test(s) });
    if (fs.existsSync(path.join(racine, 'node_modules'))) fs.symlinkSync(fs.realpathSync(path.join(racine, 'node_modules')), path.join(dir, 'node_modules'));
    copies.push(dir);
  }
}

function executer(dir, fichiers, delai) {
  return new Promise(ok => {
    if (!fichiers.length) return ok({ etat: 'survivant', tests: 0 });
    const p = spawn(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', ...fichiers.map(f => path.join('test', f))], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    let fini = false, tampon = '';
    const fin = r => { if (fini) return; fini = true; clearTimeout(minuteur); try { process.kill(-p.pid, 'SIGKILL'); } catch { /* déjà fini */ } ok(r); };
    const minuteur = setTimeout(() => fin({ etat: 'tue', par: 'délai' }), delai * 1000);
    p.stdout.on('data', d => {
      tampon += d;
      const m = /^\s*not ok \d+ - (.*)$/m.exec(tampon);
      if (m) fin({ etat: 'tue', par: m[1].slice(0, 160) });
      if (tampon.length > 1e6) tampon = tampon.slice(-1e5);
    });
    p.on('close', code => fin(code === 0 ? { etat: 'survivant' } : { etat: 'tue', par: `code ${code}` }));
  });
}

async function campagne() {
  preparerCopies();
  const libres = copies.slice();
  const prendre = async () => { while (!libres.length) await new Promise(r => setTimeout(r, 50)); return libres.pop(); };
  for (const mod of MODULES.filter(m => !SEUL || m === SEUL)) {
    const src = fs.readFileSync(path.join(racine, mod), 'utf8');
    const tous = mutants(src);
    const choisis = IDS ? tous.filter(m => IDS.includes(m.id)) : echantillon(tous, MAX);
    const tests = Object.entries(couv).filter(([, v]) => v.code === 0 && v.modules.includes(mod)).sort((a, b) => a[1].duree - b[1].duree);
    let cumul = 0; const rapides = [];
    for (const [f, v] of tests) { if (rapides.length && cumul + v.duree > BUDGET) break; rapides.push(f); cumul += v.duree; }
    // second jeu : tests directs du module d'abord (ceux qui l'importent), puis les plus rapides, dans le budget 2
    const direct = f => new RegExp(`['"]\\.\\./${mod.replace(/\./g, '\\.')}['"]`).test(fs.readFileSync(path.join(racine, 'test', f), 'utf8'));
    const ordonnes = [...tests.filter(([f]) => direct(f)), ...tests.filter(([f]) => !direct(f))];
    let cumul2 = 0; const larges = [];
    for (const [f, v] of ordonnes) { if (larges.length && cumul2 + v.duree > BUDGET2) continue; larges.push(f); cumul2 += v.duree; }
    const tousTests = tests.map(([f]) => f), dureeTous = cumul2;
    resultats[mod] ||= { total: tous.length, tests: tousTests.length, mutants: {} };
    resultats[mod].total = tous.length; resultats[mod].tests = tousTests.length;
    process.stderr.write(`\n${mod} : ${tous.length} mutants, ${choisis.length} tirés ; ${tousTests.length} tests couvrants, budget ${rapides.length} tests (${cumul.toFixed(0)} s), second jeu ${larges.length} tests (${cumul2.toFixed(0)} s)\n`);
    const enCours = [];
    for (const m of choisis) {
      const cle = String(m.id);
      if (resultats[mod].mutants[cle] && !IDS) continue;
      const dir = await prendre();
      enCours.push((async () => {
        const fich = path.join(dir, mod);
        fs.writeFileSync(fich, appliquer(src, m));
        let r = await executer(dir, rapides, Math.max(30, 4 * cumul));
        if (r.etat === 'survivant' && larges.some(f => !rapides.includes(f))) { const r2 = await executer(dir, larges, Math.max(60, 3 * cumul2)); r = { ...r2, phase: 2 }; }
        fs.writeFileSync(fich, src);
        resultats[mod].mutants[cle] = { ligne: m.ligne, operateur: m.operateur, original: m.original, remplacement: m.remplacement, ...r };
        fs.writeFileSync(fichRes, JSON.stringify(resultats, null, 1));
        process.stderr.write(r.etat === 'tue' ? '.' : 'S');
        libres.push(dir);
      })());
    }
    await Promise.all(enCours);
  }
  // résumé
  for (const [mod, r] of Object.entries(resultats)) {
    const v = Object.values(r.mutants), t = v.filter(x => x.etat === 'tue').length;
    console.log(`${mod.padEnd(28)} ${String(v.length).padStart(4)} mutants testés / ${r.total} — tués ${t}, survivants ${v.length - t} — score ${(100 * t / v.length).toFixed(1)} %`);
  }
  for (const d of copies) fs.rmSync(d, { recursive: true, force: true });
}

if (process.argv[1] === new URL(import.meta.url).pathname) await campagne();
