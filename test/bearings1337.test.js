/**
 * Appareils d'appui NF EN 1337-3 (guide Sétra 2007) et tête d'appui (BAEL A.8.4, annexe E.6) — contrôle sur la note
 * « appuis et fondations » de d'un pont-dalle précontraint réel (note de bureau d'études, 6 travées) : appareils 500 × 600 × 8(12 + 4)
 * des piles simples et 350 × 450 × 6(12 + 4) des piles doubles. Valeurs de la note entre parenthèses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyBearing1337, bearingGeometry } from '../src/supports/bearings1337.js';
import { localPressure, shortCorbel, bearingSplitting } from '../src/supports/pierhead.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : ${a} au lieu de ${b}`);

test('NF EN 1337-3 — appareil 500 × 600 × 8(12 + 4) de la pile P2-2 (note de référence, comb. 4-2)', () => {
  const g = bearingGeometry({ a: 0.5, b: 0.6, n: 8, t: 0.012, ts: 0.004 });
  near(g.S, 11.154, 1e-3, 'S1'); near(g.Te, 0.101, 1e-9, 'Te'); near(g.Ap, 0.2891, 1e-4, "A'");
  assert.equal(g.Tq, 0.096);   // guide § 3.3.2.2 : e = 2,5 mm ⇒ T_q = n t (la note prend T_e)
  // F_z = 420,29 t, v = retrait + fluage + 0,9 TCD = 2,01 cm, H_x = 1,65 t (freinage Bc × 1,605), α = 4,761 + 3 mrad
  const r = verifyBearing1337({ a: 0.5, b: 0.6, n: 8, t: 0.012, ts: 0.004 }, [{ label: '4-2', Fz: 4202.9, vSlow: 0.0201, Hx: 16.5, alpha: 7.761e-3 }],
    { FzMin: 633.3, vSlow: 0.0252, Hx: 0, FzGmin: 2000.6 });
  const x = r.rows[0];
  near(x.v2, 0.0165 * 0.096 / (1.8 * 0.2891), 1e-6, 'v2 = H T_q/(2G A′) (la note prend T_e : 3,19e-3)'); near(x.Ar, 0.2753, 2e-3, 'Ar (0,2753)'); near(x.epsC, 2.281, 2e-3, 'εc (2,281)');
  near(x.sig, 15.265, 2e-3, 'σm (15,265)'); near(x.sigBuck, 32.467, 1e-3, 'σlim flambement (32,467)');
  near(x.vz, 3.19e-3, 3e-3, 'Σvz (3,19e-3)'); near(x.vzReq, 1.27e-3, 3e-3, "a'α/3 (1,27e-3)"); near(x.tsReq, 2.03e-3, 5e-3, 'ts (2,03e-3)');
  // ε_α avec α = 7,761 mrad : 0,809 (la note imprime 0,314 en comb. 4, valeur erronée ; 0,607 en comb. 2 avec 5,84 mrad)
  near(x.epsA, 0.809, 2e-3, 'εα');
  near(x.epsQ, 0.0233 / 0.096, 1e-2, 'εq = vx/Tq');
  assert.ok(x.ok && r.slide.okGlissement && r.slide.okPerm);
  // non-glissement sous N + Nθ min (63,33 t) : σ = 2,309 MPa, μe = 0,490, μe·Fz = 0,310 MN (note)
  near(r.slide.sig, 2.309, 2e-3, 'σmin'); near(r.slide.mu, 0.4898, 2e-3, 'μe'); near(r.slide.R, 0.3101, 2e-3, 'μe Fz');
});

test('NF EN 1337-3 — stabilité en rotation des appareils 350 × 450 × 6(12 + 4) de P2-1 sous charge minimale', () => {
  const bd = { a: 0.35, b: 0.45, n: 6, t: 0.012, ts: 0.004 };
  const r = verifyBearing1337(bd, [
    { label: 'comb. 4-2 max (note)', Fz: 2117.8, vSlow: 0.0535, Hx: 20.2, alpha: 18.21e-3 },
    { label: 'G + P min, α_G + α₀', Fz: 789.6, vSlow: 0, alpha: 13.2e-3, minimal: true },
    { label: 'G + P + 1,605 Al min, rotation Al (enveloppe)', Fz: 706.4, vSlow: 0, alpha: 10.2e-3 + 1.605 * 1.8e-3 + 3e-3, minimal: true, indicatif: true },
  ]);
  near(r.g.S, 7.991, 1e-3, 'S1 (7,991)'); near(r.rows[0].sigBuck, 21.172, 1e-3, 'σlim (21,172)');
  near(r.rows[0].vz, 4.06e-3, 5e-3, 'vz sous F max (4,06e-3)');
  // charge minimale : marge nulle (1,51e-3 / 1,50e-3) ; enveloppe avec la rotation du trafic : non vérifiée
  near(r.rows[1].vz, 1.512e-3, 5e-3, 'vz G seul'); near(r.rows[1].vzReq, 1.496e-3, 5e-3, "a'α/3 G seul");
  assert.ok(r.rows[1].checks.rotation);
  assert.ok(!r.rows[2].checks.rotation && r.rows[2].indicatif);
  assert.ok(r.ok, 'combinaison indicative non bloquante');
});

test('Tête d\'appui — bossage et console de la pile P2-6 (note de référence)', () => {
  // bossage 0,60 × 0,70 sous appareil 0,50 × 0,60 : α = 0,83 > 3/4 ⇒ K = 1 (la note retient 1,09) ; σ = 14,40 > 14,17 MPa
  const p = localPressure({ R: 4320, a0: 0.5, b0: 0.6, a: 0.6, b: 0.7, fcj: 25 });
  assert.ok(p.outside); assert.equal(p.K, 1); near(p.Kformula, 1.094, 2e-3, 'K formule (1,09)');
  near(p.sig, 14.40, 1e-3, 'σ'); assert.ok(!p.ok);
  // bossage élargi 0,75 × 0,85 : K = 1,09, vérifié
  assert.ok(localPressure({ R: 4320, a0: 0.5, b0: 0.6, a: 0.75, b: 0.85, fcj: 25 }).ok);
  // console : V_u = 408,92 t, H_u = 7,31 t, M_u = 65,85 t·m, a = 0,16 m, d = 1,5 m, b₀ = 0,78 m
  const c = shortCorbel({ Vu: 4089.2, Hu: 73.1, Mu: 658.5, a: 0.16, d: 1.5, b0: 0.78, fcj: 25, fe: 400 });
  near(c.z, 0.3072, 1e-6, 'z (0,3072)'); near(c.A * 1e4, 63.72, 2e-3, 'A (63,72 cm²)'); assert.equal(c.tauLim, 4);
  // d plafonné à 4a = 0,64 m (charge concentrée) : τ_u = 8,3 MPa > 4 MPa (la note prend d = 1,5 m : 3,54 MPa)
  near(c.dEff, 0.64, 1e-9, 'd plafonné à 4a (charge concentrée)'); assert.ok(!c.okTau);
  // BAEL 99 E.6.2,1 : charge de l'appareil répartie sur ℓ = 0,6 m ⇒ d plafonné à 4ℓ = 2,4 m > 1,5 m : τ_u = 3,54 MPa ≤ 4 (note)
  const c2 = shortCorbel({ Vu: 4089.2, Hu: 73.1, Mu: 658.5, a: 0.16, d: 1.5, b0: 0.78, fcj: 25, fe: 400, l: 0.6 });
  near(c2.dEff, 1.5, 1e-9, 'd non plafonné'); near(c2.tau, 3.54, 3e-3, 'τ_u (3,54)'); assert.ok(c2.okTau);
  near(c2.lambda, 1.175, 3e-3, 'λ (1,18)');
  // avec d non plafonné, on retrouve la note
  near(4.0892 / (0.78 * 1.5) / (1 - 0.6 * 73.1 / 4089.2), 3.54, 3e-3, 'τ de la note');
  // armatures réparties : λ = max(¼(δ + 12 τ/f_c − 1) ; 0,1) avec τ = 3,54 MPa : 1,18 (note)
  near(Math.max(0.25 * (4 + 12 * 3.54 / 25 - 1), 0.1), 1.175, 2e-3, 'λ');
  // annexe E.8 : prismes d = 1,4 m dans les deux plans, f_su = 348 MPa ; frettes de surface 0,04 R_u/f_su = 4,98 cm² (la note : 8,48)
  const sp = bearingSplitting({ R: 4330, a0: 0.7, b0: 0.6, dA: 1.4, pitch: 1.4, edge: 0.7, n: 2, fe: 400 });
  near(sp.planes[0].Rj, 541.25, 1e-6, 'R éclatement plan Δ′ (54,1 t)'); near(sp.planes[1].Rj, 618.6, 1e-3, "R plan Δ (61,9 t ; la note reprend 54,1 t)");
  near(sp.planes[0].Aej * 1e4, 15.56, 1e-3, 'A_e = R/f_su'); near(sp.As * 1e4, 4.98, 2e-3, 'A_s');
  near(sp.planes[0].Ae * 1e4, 18.66, 1e-3, '0,15 R_u/f_su (18,67 cm², note)');
});

test('Appuis d\'une dalle PSI-DP : réactions hyperstatiques, raccourcissement et rotations G + P transmis aux appuis', async () => {
  const { formDefaults } = await import('../tools/formdefaults.mjs');
  const { parseData, compute } = await import('../src/pipeline.js');
  const base = { ...formDefaults(), spans: '18, 24, 18', h: '0.85' };
  const st = compute(parseData({ ...base, bp_actif: 'on' })), st0 = compute(parseData({ ...base, bp_actif: 'on', ap_epsPSIDP: 'non' }));
  assert.equal(st.supportsError, null);
  const S = st.supports, S0 = st0.supports;
  // réactions hyperstatiques (enveloppe des phases) : positives aux culées, négatives aux piles ; chaque phase s'équilibre
  assert.ok(S.hyp.max[0] > 0 && S.hyp.min[1] < 0);
  assert.ok(Math.abs(st.psidp.r.ES.moy.hyp.R.reduce((a, v) => a + v, 0)) < 1e-6);
  // effort normal en tête de culée : + R_hyp max (coefficient 1)
  const N = s => s.lines[0].head.F61.find(c => c.label.startsWith('ELU A(l)')).N;
  near(N(S) - N(S0), S.hyp.max[0], 1e-6, 'N tête culée');
  // raccourcissement : élastique + fluage + retrait du calcul PSI-DP
  const e = S.eps.psidp; near(S.eps.RF, e.el + e.fl + e.r, 1e-12, 'ε'); assert.ok(e.total > 4e-4 && e.total < 9e-4, `ε = ${e.total}`);
  assert.equal(S0.eps.RF, S0.eps.RFsaisi);
  // vérification NF EN 1337-3 présente pour chaque ligne et chaque référentiel ; rotation permanente G + P < G seul
  for (const L of S.lines) for (const code of ['BAEL', 'EC']) { assert.ok(L[code].brg && !L[code].brg.error); assert.ok(L[code].headChk && !L[code].headChk.error); }
  assert.ok(S.lines[0].BAEL.brg.aG < st.bearings.rotPerm[0]);
});

test('NF EN 1337-3 — exemple du guide Sétra 2007 § 4.2 (PSI-DP 3 travées, appareil 400 × 600, 6 × 12 + 2 × 6 mm)', () => {
  const bd = { a: 0.4, b: 0.6, n: 6, t: 0.012, ts: 0.004 }, o = { e: 0.006 };
  const g = bearingGeometry({ ...bd, e: 0.006 });
  near(g.Ap, 0.2301, 1e-4, "A′"); near(g.S, 9.783, 1e-4, 'S1'); near(g.Te, 0.084, 1e-9, 'Te'); near(g.Tq, 0.084, 1e-9, 'Tq (e > 2,5 mm)');
  const r = verifyBearing1337(bd, [
    { label: 'comb. 2', Fz: 4500, vSlow: 0.070, alpha: 8.7e-3 },
    { label: 'comb. 4', Fz: 3750, vSlow: 0.061, Hx: 55, alpha: 7.9e-3 },
    { label: 'comb. 8', Fz: 3820, vSlow: 0.080, alpha: 9.7e-3 },
  ], { FzMin: 790, vSlow: 0.059, Hx: 55, FzGmin: 890 }, o);
  const [c2, c4, c8] = r.rows;
  near(c2.Ar, 0.1888, 1e-3, 'Ar comb. 2'); near(c2.epsC, 4.061, 2e-3, 'εc (4,061)'); near(c2.epsQ, 0.833, 2e-3, 'εq (0,833)');
  near(c2.epsA, 0.735, 3e-3, 'εα (0,735)'); near(c2.epsT, 5.629, 2e-3, 'Σε (5,629)');
  near(c2.sig, 23.835, 2e-3, 'σm (23,835)'); near(c2.sigBuck, 27.253, 1e-3, 'σlim (27,253)');
  near(c4.v2, 0.011, 0.02, 'v2 freinage (0,011)'); near(c4.epsQ, 0.857, 5e-3, 'εq comb. 4 (0,857)'); near(c4.epsT, 4.932, 5e-3, 'Σε comb. 4');
  near(c8.epsT, 5.330, 3e-3, 'Σε comb. 8 (5,330)');
  near(c8.vz, 3.93e-3, 3e-3, 'Σvz (3,93 mm)'); near(c8.vzReq, 1.26e-3, 3e-3, "a′α/3 (1,26 mm)");
  near(c2.tsReq, 3.16e-3, 3e-3, 'ts (3,16 mm)');
  // non-glissement comb. 4 bis : σ = 4,187 MPa, μe = 0,315, Fx = 0,200 ≤ 0,249 MN ; σ_m,min = 0,89/A′ = 3,87 MPa ≥ 3
  near(r.slide.sig, 4.187, 2e-3, 'σmin'); near(r.slide.mu, 0.315, 2e-3, 'μe'); near(r.slide.Fxy, 0.200, 5e-3, 'Fx'); near(r.slide.R, 0.249, 3e-3, 'μe Fd');
  near(r.slide.sigPerm, 0.89 / 0.2301, 1e-6, 'σm,min'); assert.ok(r.ok);
});
