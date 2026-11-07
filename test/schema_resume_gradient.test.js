/**
 * Résumé en clair (onglet Tablier) : quand le gradient n'est pas saisi, il annonce le gradient automatique
 * EN 1991-1-5 (+12,3 / −8 °C pour 8 cm de revêtement) et non la valeur de repli 12 / −6 °C du Fascicule 61.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryHTML } from '../web/schema.js';

const g = over => ({ spans: [14, 18, 14], overhangs: [0, 0], width: 12, h: 0.7, footways: [], lines: [], bands: [], psi: 100,
  fck: 30, fyk: 500, cover: 0.055, phi: 25, phiT: 16, wk: 0.3, fiss: 'FP', tRev: 0.08, nu: 0.2, ys: [0], withTherm: true,
  dT: [], delta: 0, epsSlow: 4e-4, dTu: 30, xFixed: null, ...over });

test('gradient vide : EN 1991-1-5 automatique, Fascicule 61 rappelé', () => {
  const t = summaryHTML(g({}));
  assert.match(t, /EN 1991-1-5 12,3 \/ -8 °C \(Fascicule 61 : 12 \/ −6 °C\)/);
  assert.ok(!/gradient 12 \/ -6/.test(t));
});

test('gradient saisi : valeurs de l\'utilisateur', () => {
  assert.match(summaryHTML(g({ dT: [10, -5] })), /gradient 10 \/ -5 °C/);
});
