/**
 * Biais : biais mécanique (guide SETRA 1989 § 3.4.1) et moments dans la direction des aciers transversaux
 * (annexe 12A du BPEL, « après fissuration ») confrontés à la note CHAMOA-PSIDA (ch. 4.2 et 4.3, biais 80 gr).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mechanicalSkew, equivalentWidth, annexe12A, armerSkew } from '../src/skew.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} : attendu ${b}, obtenu ${a}`);

test('biais mécanique : Be = 12 I/h³ et φ(ψ = 80 gr) de la note CHAMOA', () => {
  const Be = equivalentWidth({ width: 12, h: 0.75, I: 0.43076814 });
  rel(Be, 12.2530, 1e-3, 'Be');
  rel(mechanicalSkew({ psi: 80, Be, L: 10 }), 82.5322, 1e-4, 'φ travée 1');
  rel(mechanicalSkew({ psi: 80, Be, L: 15 }), 86.5105, 1e-4, 'φ travée 2');
  assert.equal(mechanicalSkew({ psi: 100, Be, L: 10 }), 100, 'ouvrage droit');
  assert.equal(mechanicalSkew({ psi: 60, Be: 30, L: 10 }), 60, 'n ≥ 2 → φ = ψ');
});

test('annexe 12A (après fissuration) : les 11 valeurs M_APF de la note CHAMOA sont reproduites', () => {
  const maxRows = [[82.5322, 435.08, 114.89, 288.10], [82.5322, 368.87, 127.52, 276.37], [82.5322, 503.73, 61.262, 257.01], [82.5322, 232.42, 40.075, 131.18],
    [86.5105, 588.10, 159.72, 351.18], [86.5105, 720.52, 64.403, 277.05], [86.5105, 397.87, 50.025, 169.86]];
  for (const [phi, MX, MY, ref] of maxRows) {
    const r = annexe12A({ MX, MY, phiMec: phi, psi: 80 });
    rel(r.M2, ref, 2e-4, `M_APF max (φ ${phi}, MX ${MX})`);
    assert.ok(r.Mb < 0, 'béton comprimé (Mb < 0) en nappe inférieure');
  }
  const minRows = [[82.5322, -2.4929, -2.6592], [82.5322, -2.8568, -3.0474], [82.5322, -72.139, -76.952], [86.5105, -94.142, -109.86]];
  for (const [phi, MY, ref] of minRows) {
    const r = annexe12A({ MX: 0, MY, phiMec: phi, psi: 80, face: 'top' });
    rel(r.M2, ref, 2e-4, `M_APF min (φ ${phi}, MY ${MY})`);
    assert.ok(r.Mb > 0, 'Mb > 0 en nappe supérieure');
  }
  // forme fermée : M_APF = Myy/(1 − cos ψ) + Mxy/sin ψ
  const r = annexe12A({ MX: 435.08, MY: 114.89, phiMec: 82.5322, psi: 80 });
  const psi = 80 * Math.PI / 200;
  rel(r.Myy / (1 - Math.cos(psi)) - r.Mxy / Math.sin(psi), 288.10, 2e-4, 'forme fermée');
  // ouvrage droit : M2 = MY, M1 = MX, Mb = 0
  const d = annexe12A({ MX: 400, MY: 100, phiMec: 100, psi: 100 });
  rel(d.M1, 400, 1e-9, 'droit M1'); rel(d.M2, 100, 1e-9, 'droit M2'); assert.ok(Math.abs(d.Mb) < 1e-9);
});

test('Wood-Armer généralisé : orthogonal = Wood-Armer, bissectrice ≠ optimum', () => {
  const o = armerSkew({ Mx: 100, My: 40, Mxy: 30, alphaDeg: 90 });
  rel(o.bot.Mx, 130, 1e-9, 'M*x'); rel(o.bot.Ma, 70, 1e-9, 'M*y');
  assert.equal(o.top.Mx, 0, 'pas d\'aciers supérieurs (moments positifs)'); assert.equal(o.top.Ma, 0);
  const n = armerSkew({ Mx: -100, My: -40, Mxy: 30, alphaDeg: 90 });
  rel(n.top.Mx, -130, 1e-9, 'top M*x'); rel(n.top.Ma, -70, 1e-9, 'top M*y'); assert.equal(n.bot.Mx, 0);
  const s = armerSkew({ Mx: 100, My: 40, Mxy: 0, alphaDeg: 72 });
  assert.ok(s.bot.Ma > 40 && s.bot.Mx > 100, 'armatures obliques : plus d\'acier dans chaque direction');
});
