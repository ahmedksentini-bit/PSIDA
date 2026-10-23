// Semelles de culée : poids du remblai sur le talon arrière et charges permanentes favorables (γ_G,inf = 1,0) dans le
// glissement et l'excentrement (EN 1990 A2.4 ; NF P 94-261 ; Fascicule 62 titre V).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { parseSupports } from '../src/pipeline.js';
import { parseStandalone, computeStandalone } from '../src/supports/standalone.js';
import { champsAppuisPoutres } from '../web/transfert_appuis.js';

const D = formDefaults();
const P0 = computePoutres(parsePoutres(D));
const appuis = (extra = {}) => {
  const d = { ...D, ...Object.fromEntries(Object.entries(champsAppuisPoutres(P0)).map(([k, v]) => [k, String(v)])), ...extra };
  return { d, st: computeStandalone(parseStandalone(d), parseSupports(d)) };
};

test('talon arrière : W_r = γ (H_m + h_gg) d L, d = (B − e_m)/2, bras e_m/2 + d/2', () => {
  const { st } = appuis({ ap_B: '4' });
  const sp = parseSupports(appuis({ ap_B: '4' }).d), f = st.supports.lines[0].EC.found, t = f.talon;
  const em = sp.culee.em, d = (4 - em) / 2;
  assert.ok(Math.abs(t.d - d) < 1e-9);
  assert.ok(Math.abs(t.x - (em / 2 + d / 2)) < 1e-9);
  // calcul à la main : γ = 20 kN/m³ (sol par défaut), hauteur de remblai = H_m + h_gg, largeur entre murs en retour
  const hR = t.W / (sp.soil.gamma * d * st.supports.width);
  assert.ok(hR > sp.culee.Hm && hR < sp.culee.Hm + 3, `hauteur de remblai ${hR}`);
});

test('variante « G favorables » : charges permanentes à 1,0, charges variables verticales à 0, même effort horizontal', () => {
  const { st } = appuis({ ap_B: '4' });
  const L = st.supports.lines[0].EC, f = L.found;
  const elu = f.checks.filter(k => k.ls === 'ELU' && !k.vide && !k.gFav), fav = f.checks.filter(k => k.gFav);
  assert.equal(fav.length, elu.length);
  const b = L.base.find(x => x.ls === 'ELU' && !x.vide), k0 = elu.find(k => k.label === b.label), k1 = fav.find(k => k.label.startsWith(b.label));
  const Wsem = 25 * f.B * f.L * f.hs;
  // V_fav = N_sus/1,35 + W_appui + W_semelle + W_remblai (calcul à la main)
  assert.ok(Math.abs(k1.V - (b.Nsus / 1.35 + b.Wst + Wsem + f.talon.W)) < 1e-6);
  assert.ok(k1.V < k0.V);
  assert.equal(k1.H, k0.H);
  // le remblai soulage le moment de la poussée : M_fav = M_sup + 0,35 W_r x_r (même M de poussée, remblai à 1,0 au lieu de 1,35)
  assert.ok(Math.abs(k1.M - (k0.M + 0.35 * f.talon.W * f.talon.x)) < 1e-6);
});

test('culée de l\'exemple VIPP : semelle dimensionnée raisonnable (remblai sur le talon compté)', () => {
  const { st } = appuis();
  const f = st.supports.lines[0].EC.found;
  assert.ok(f.Bauto && f.B <= 4.5, `B = ${f.B}`);
  assert.ok(f.worstH <= 1 && f.worstV <= 1 && f.excOk);
});
