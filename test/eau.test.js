/**
 * Piles en rivière : courant et embâcles (EN 1991-1-6 § 4.9), affouillement local (FHWA HEC-18, équation CSU ;
 * tableaux K₁ et K₂ de HEC-18), intégration au module « Appuis et fondations ».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentForce, debrisForce, localScour, pierWater } from '../src/supports/water.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : réf ${b}, outil ${a.toFixed(4)}`);

test('EN 1991-1-6 § 4.9 : F_wa = ½ k_wa ρ h b v² et F_deb = k_deb A v²', () => {
  const c = currentForce({ h: 3, b: 1.5, v: 2, kwa: 1.44 });
  rel(c.F, 0.5 * 1.44 * 1000 * 3 * 1.5 * 4 / 1000, 1e-9, 'F_wa rectangulaire');   // 12,96 kN
  rel(c.z, 2, 1e-9, 'résultante à 2h/3 au-dessus du lit');
  rel(currentForce({ h: 3, b: 1.5, v: 2, kwa: 0.70 }).F, 6.3, 1e-9, 'F_wa circulaire');
  const d = debrisForce({ h: 3, v: 2, hDeb: 1.5, bDeb: 5 });
  rel(d.F, 666 * 7.5 * 4 / 1000, 1e-9, 'F_deb');                                    // 19,98 kN
  rel(d.z, 2.25, 1e-9, 'radeau sous la surface');
});

test('HEC-18 : équation CSU, K₂ (tableau 7.2 / 4.3) et plafond 2,4 a', () => {
  // forme y_s/y₁ = 2 K₁ K₂ K₃ (a/y₁)^0,65 Fr^0,43 (FHWA) ≡ y_s = 2 K₁ K₂ K₃ a^0,65 y₁^0,35 Fr^0,43
  const s = localScour({ a: 1, y1: 3, v: 2, nez: 'rond', K3: 1.1 });
  const Fr = 2 / Math.sqrt(9.81 * 3);
  rel(s.Fr, Fr, 1e-9, 'Froude');
  rel(s.ys, 3 * 2 * 1 * 1 * 1.1 * (1 / 3) ** 0.65 * Fr ** 0.43, 1e-9, 'y_s');
  assert.ok(!s.capped);
  // tableau K₂ (θ, L/a) : 15° → 1,5 / 2,0 / 2,5 ; 30° → 2,0 / 2,75 / 3,5 ; 45° → 2,3 / 3,3 / 4,3 ; 90° → 2,5 / 3,9 / 5,0
  const tab = { 15: [1.5, 2.0, 2.5], 30: [2.0, 2.75, 3.5], 45: [2.3, 3.3, 4.3], 90: [2.5, 3.9, 5.0] };
  for (const [th, vals] of Object.entries(tab)) [4, 8, 12].forEach((La, k) => {
    const K2 = localScour({ a: 1, L: La, y1: 3, v: 2, theta: +th }).K2;
    assert.ok(Math.abs(K2 - vals[k]) <= 0.1 * vals[k], `K₂(${th}°, L/a = ${La}) = ${K2.toFixed(2)} (tableau ${vals[k]})`);
  });
  assert.equal(localScour({ a: 1, L: 8, y1: 3, v: 2, theta: 10, nez: 'carre' }).K1, 1.0, 'K₁ = 1 si θ > 5°');
  assert.equal(localScour({ a: 1, y1: 3, v: 2, nez: 'carre' }).K1, 1.1);
  // plafond : Fr ≤ 0,8 → 2,4 a
  const big = localScour({ a: 0.3, y1: 10, v: 3, nez: 'carre', K3: 1.3 });
  assert.ok(big.capped); rel(big.ys, 2.4 * 0.3, 1e-9, 'plafond 2,4 a');
});

test('Pile voile en rivière : largeur projetée, moment en pied, Archimède', () => {
  const w = pierWater({ h: 3, v: 2, theta: 0, nez: 'rond', hGen: 0.5 }, { type: 'voile', b: 1, Lv: 8, Hf: 8, dBed: 0.5 });
  rel(w.bProj, 1, 1e-9, 'b = a sans biais');
  rel(w.M, w.cur.F * (0.5 + 2), 1e-9, 'M = F (d_lit + 2h/3)');
  rel(w.Ushaft, 10 * 1 * 8 * 3.5, 1e-9, 'ρ g V fût immergé');
  rel(w.dAff, w.scour.ys + 0.5, 1e-9, 'affouillement total');
  const sk = pierWater({ h: 3, v: 2, theta: 20 }, { type: 'voile', b: 1, Lv: 8, Hf: 8, dBed: 0.5 });
  rel(sk.bProj, Math.cos(20 * Math.PI / 180) + 8 * Math.sin(20 * Math.PI / 180), 1e-9, 'b projetée');
});

test('Intégration : combinaisons de crue, semelle affouillable, pieux dégagés', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const { supportsNote, blocksToHTML } = await import('../web/supports_view.js');
  const base = { ...formDefaults(), ap_eau: 'on', ap_hEau: '4', ap_vEau: '2.5', ap_hGen: '0.5' };
  const st = compute(parseData(base));
  const S = st.supports, P = S.lines[1];
  assert.ok(S.water[1] && !S.water[0], 'piles en eau, culées hors eau');
  for (const code of ['BAEL', 'EC']) {
    const cr = P[code].base.filter(b => b.wat);
    assert.equal(cr.length, 2, `${code} : ELU et ELS de crue`);
    const u = cr.find(b => b.ls === 'ELU');
    rel(u.Myb, 1.5 * S.water[1].M, 1e-9, 'moment transversal de crue');
    // semelle à D_e = 1 m : affouillée
    assert.equal(P[code].found.scour.ok, false);
  }
  const html = blocksToHTML(supportsNote(S, { ref: 'EC', spans: st.deck.spans }).blocks);
  assert.ok(html.includes('Piles en rivière') && html.includes('HEC-18'));
  // pieux : longueur dégagée, portance en crue réduite
  const st2 = compute(parseData({ ...base, ap_found: 'pieux', ap_Lpile: '15', ap_hGen: '2' }));
  const f = st2.supports.lines[1].EC.found;
  assert.ok(f.scour.expo > 0, 'pieu dégagé');
  assert.ok(f.scour.capW.Rcd < f.cap.Rcd, 'portance réduite par l\'affouillement');
  const rw = f.rows.find(r => r.crue && r.ls === 'ELU'), rn = f.rows.find(r => !r.crue && r.ls === 'ELU');
  assert.ok(rw.Mmax / rw.Hp > rn.Mmax / rn.Hp, 'moment par unité d\'effort plus grand avec la longueur libre');
});
