// Garde-fou : tous les modules du site (web/ et src/) doivent être syntaxiquement valides — une apostrophe non
// échappée dans une chaîne d'aide a suffi à empêcher le chargement de tout le calcul en ligne.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); if (/vendor|katex|ec8$/.test(p)) return []; return statSync(p).isDirectory() ? walk(p) : /\.m?js$/.test(f) ? [p] : []; });

test('modules web/ et src/ : syntaxe valide (node --check)', () => {
  const bad = [];
  for (const f of [...walk('web'), ...walk('src')]) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad.push(`${f} : ${String(e.stderr).split('\n').find((l) => /Error/.test(l)) || 'erreur'}`); }
  }
  assert.deepEqual(bad, []);
});
