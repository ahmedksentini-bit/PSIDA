// Caisson : distortion avec diaphragmes (poutre sur appui élastique), gauchissement de distortion
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gauchissementDistortion, poutreSurAppuiElastique, distortionCaisson } from '../src/phasage/caisson_transversal.js';
import { computePhasage } from '../web/phasage_view.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);

test('gauchissement de distortion d\'un caisson rectangulaire sans encorbellement : ω = ± b h / 4 aux angles', () => {
  const K = { B: 6, ts: 0.25, Bi: 6.4, ti: 0.25, bw: 0.4 }, h = 2.25, b = 6, hh = h - 0.25;   // âmes en x = ± 3
  const G = gauchissementDistortion(K, h), w0 = b * hh / 4;
  for (const c of ['TL', 'BR']) near(Math.abs(G.coins[c]), w0, 0.02, c);
  near(G.Idw, (2 * 0.25 * b + 2 * 0.4 * hh) * w0 * w0 / 3, 0.02, 'I_dw');
});

test('poutre sur appui élastique : charge ponctuelle loin des appuis, θ = P β / 2k (Hetényi)', () => {
  const EI = 1e7, k = 1e5, beta = (k / (4 * EI)) ** 0.25, L = 12 * Math.PI / beta;
  const r = poutreSurAppuiElastique({ L, EI, k, diaphragmes: [0, L], ponctuelles: [{ x: L / 2, T: 100 }], pas: 0.5 });
  near(r.thMax, 100 * beta / (2 * k), 1e-3, 'θ max');
  // charge répartie, appuis lointains : θ = t / k
  const u = poutreSurAppuiElastique({ L, EI, k, diaphragmes: [0, L], repartie: { x0: 0, x1: L, t: 10 }, pas: 0.5 });
  near(u.th[Math.floor(u.th.length / 2)], 10 / k, 1e-3, 'θ réparti');
});

test('distortion : les diaphragmes réduisent θ ; la flexion transversale retenue n\'excède pas le cadre par mètre aux âmes', () => {
  const K = { B: 12, ts: 0.25, Bi: 6.5, ti: 0.22, bw: 0.45 };
  const d0 = distortionCaisson({ K, h: 2.3, Lspan: 80, sd: 0, Lr: 10, fck: 40 }), d10 = distortionCaisson({ K, h: 2.3, Lspan: 80, sd: 10, Lr: 10, fck: 40 });
  assert.ok(d10.avec.rho < d0.avec.rho && d0.avec.rho < 1 && d0.kD > 0 && d0.Idw > 0);
  const o = computePhasage({ ph_type: 'fleau', fl_sdia: '10' }), T = o.transversal.sections, Tb = o.transversalBrut.sections;
  const tete = T.findIndex(s => /Âme : tête/.test(s.nom));
  assert.ok(Math.abs(T[tete].ELUmin) < Math.abs(Tb[tete].ELUmin), 'tête d\'âme : distortion répartie');
  near(T[0].ELUmin, Tb[0].ELUmin, 1e-6, 'encorbellement inchangé (hors cellule)');
});
