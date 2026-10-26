/**
 * Corrections du volet sismique des appuis tirées de Capra et Godreau, « Ouvrages d'art en zone sismique » (2015) :
 * γ_c = 1,3 en situation sismique, culées (inertie, Mononobe-Okabe, ΔP_d), inertie propre des fûts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gammaAcc, designShaft } from '../src/supports/pier.js';
import { kMononobeOkabe, pousseeMononobeOkabe, pousseeRigide, culeeSismique } from '../src/supports/culee_seisme.js';
import { formDefaults } from '../tools/formdefaults.mjs';
import { parseData, compute } from '../src/pipeline.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : attendu ${b}, obtenu ${a}`);

test('γ_c sismique = 1,3 (NF EN 1998-2/NA 5.2.4) ; chocs : 1,2 (EC2) / 1,15 (BAEL) ; γ_s = 1,0', () => {
  assert.deepEqual(gammaAcc('EC', true), { gammaC: 1.3, gammaS: 1.0 });
  assert.deepEqual(gammaAcc('BAEL', true), { gammaC: 1.3, gammaS: 1.0 });
  assert.deepEqual(gammaAcc('EC', false), { gammaC: 1.2, gammaS: 1.0 });
  assert.deepEqual(gammaAcc('BAEL', false), { gammaC: 1.15, gammaS: 1.0 });
  const sh = sis => designShaft({ shape: { b: 6, h: 0.8, c: 0.06 }, code: 'EC', fck: 30, fyk: 500, Hf: 6, combos: [{ label: 'acc', N: 4000, M: 9000, acc: true, sis }] });
  assert.ok(sh(true).AsReq > sh(false).AsReq, 'le séisme (γ_c = 1,3) demande plus d\'acier que le choc (1,2)');
});

test('Mononobe-Okabe : Rankine pour k_h = 0, valeur de référence φ = 30°, k_h = 0,2, δ = 0 (K_AE = cos²(φ−θ)/(cos²θ [1 + √(sin φ sin(φ−θ)/cos θ)]²) ≈ 0,4733)', () => {
  const phi = 30 * Math.PI / 180;
  close(kMononobeOkabe({ phiD: phi }), Math.tan(Math.PI / 4 - phi / 2) ** 2, 1e-12, 'K_A');
  { const th = Math.atan(0.2), ref = Math.cos(phi - th) ** 2 / (Math.cos(th) ** 2 * (1 + Math.sqrt(Math.sin(phi) * Math.sin(phi - th) / Math.cos(th))) ** 2);
    close(kMononobeOkabe({ phiD: phi, theta: th }), ref, 1e-12, 'K_AE'); close(ref, 0.4733, 1e-3, 'K_AE numérique'); }
  const p = pousseeMononobeOkabe({ phi: 30, gamma: 20, H: 6, B: 1, kh: 0.2, kv: 0, gammaPhi: 1 });
  close(p.F, 0.5 * 20 * 0.4733 * 36, 1e-3, 'F');
  assert.ok(p.dF > 0 && Math.abs(p.z - 3) < 1e-12, 'incrément à mi-hauteur');
  close(pousseeRigide({ gamma: 20, H: 6, B: 1, kh: 0.2 }).dF, 0.2 * 20 * 36, 1e-12, 'ΔP_d = k_h γ H²');
  const c = culeeSismique({ kh: 0.2, gamma: 20, phi: 30, H: 6, B: 10, masses: [{ W: 1000, z: 3 }] });
  close(c.F1, 200, 1e-12, 'F1 = k_h W'); close(c.M1, 600, 1e-12, 'M1');
  const r = culeeSismique({ connexion: 'rigide', kh: 0.2, gamma: 20, phi: 30, H: 6, B: 10, masses: [] });
  close(r.F3, 0.2 * 20 * 36 * 10, 1e-12, 'culée rigide : ΔP_d');
});

test('appuis du pont-dalle en zone 4 : culées (F1, F3) et inertie des fûts ajoutées aux combinaisons sismiques', async () => {
  const st = compute(parseData({ ...formDefaults(), ap_seisme: 'on', ap_zone: '4' }));
  const S = st.supports, C = S.lines[0].EC, P = S.lines[1].EC;
  assert.ok(C.seisme && C.seisme.F1 > 0 && C.seisme.F3 > 0 && C.seisme.connexion === 'flexible');
  const A = S.seisme.actionSite; close(C.seisme.kh, A.ag * A.S * A.ST / 9.81, 1e-9, 'k_h = a_g S S_T / g');
  assert.ok(S.seisme.site === undefined || S.seisme.site.zone !== undefined, 'site (zone, catégorie, sol) non écrasé');
  const txt = JSON.stringify((await import('../web/supports_view.js')).supportsBlocks(S, 'EC'));
  assert.ok(!/Zone undefined/.test(txt) && /Effort propre/.test(txt));
  // culée : la combinaison sismique X dominante porte F1 + F3 en plus des efforts des appareils
  const bx = C.base.find(b => b.sis && /^ACC séisme X/.test(b.label) && !b.fond);
  assert.ok(bx && Math.abs(bx.sisInst.H - (C.seisme.F1 + C.seisme.F3)) < 1e-6);
  // fondation de la culée : F2 (inertie du remblai sur le talon) s'ajoute, pondérée par cx (1 en X, 0,3 en « 0,3 X + Y »)
  const fx = C.found.checks.find(c => c.sis && /^ACC séisme X \+ 0,3 Y/.test(c.label));
  const b03 = C.base.find(b => b.sis && /^ACC séisme 0,3 X \+ Y/.test(b.label) && !b.fond);
  const f03 = C.found.checks.find(c => c.sis && /^ACC séisme 0,3 X \+ Y/.test(c.label));
  const F2x = fx.Hx - bx.Hb, F2y = f03.Hx - b03.Hb;
  assert.ok(Number.isFinite(F2x) && F2x > 0, 'F2 appliqué à la fondation de la culée');
  close(F2y, 0.3 * F2x, 1e-6, 'F2 pondéré par cx = 0,3');
  // pile : effort et moment propres du fût au pied
  const pb = P.base.find(b => b.sis && /^ACC séisme X/.test(b.label) && !b.fond);
  assert.ok(pb.fut && pb.fut.Fx > 0 && Math.abs(pb.Hb - pb.H - pb.fut.Fx) < 1e-6);
  const ap = S.seisme.efforts.appuis[1];
  assert.ok(ap.inertieFut && ap.inertieFut.x.aH >= ap.inertieFut.x.a0);
  // le ferraillage du fût utilise γ_c = 1,3 pour ces combinaisons
  assert.ok(P.shaft.rows.some(r => r.sis));
});
