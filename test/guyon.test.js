import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateHarmonic, coefK, coefKFunction, coefKBand, coefMu, meanDeflection, transverseMoments } from '../src/guyon.js';
import { gaussNodes } from '../src/linalg.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} attendu ${b}, obtenu ${a}`);

test('conditions aux limites : M_y = 0 et V_y = 0 aux bords libres, saut de Y\'\'\' = 1 en e', () => {
  for (const [b, L, e] of [[5, 20, 0], [6, 15, 2.5], [4, 30, -3.9], [7, 10, 6.5]]) {
    const h = plateHarmonic({ b, L, e });
    const k = h.k;
    for (const y of [-b, b]) {
      close(h.d2(y), 0, 1e-9, `Y'' bord y=${y}`);
      close(h.d3(y) - 2 * k * k * h.d1(y), 0, 1e-9, `Kirchhoff bord y=${y}`);
    }
    // continuité : la différence de part et d'autre de e doit se réduire au terme de Taylor 2d·f'(e)
    const d = 1e-7, scale = Math.abs(h.Y(e)) + 1;
    close(h.Y(e + d) - h.Y(e - d), 2 * d * h.d1(e), 1e-8 * scale, 'continuité Y');
    close(h.d1(e + d) - h.d1(e - d), 2 * d * h.d2(e), 1e-8 * scale * k, "continuité Y'");
    close(h.d2(e + d) - h.d2(e - d), d * (h.d3(e + d) + h.d3(e - d)), 1e-8 * scale * k * k, "continuité Y''");
    close(h.d3(e + d) - h.d3(e - d), 1, 1e-6, "saut Y'''");
  }
});

test('flèche moyenne = flèche de la poutre équivalente (∫Y dy = 1/k⁴) ⇒ K de moyenne 1', () => {
  for (const [b, L, e] of [[5, 20, 0], [5, 20, 4], [5, 20, 5], [5, 20, -5], [6, 8, 1], [3, 40, -2]]) {
    const h = plateHarmonic({ b, L, e });
    close(meanDeflection(h, 200) * 2 * b * Math.pow(h.k, 4), 1, 1e-6, `moyenne b=${b} L=${L} e=${e}`);
    // intégrale de K sur la largeur = 2b
    let s = 0;
    const f = coefKFunction({ b, L, e });
    for (const [y, w] of gaussNodes(-b, e, 6)) s += w * f(y);
    for (const [y, w] of gaussNodes(e, b, 6)) s += w * f(y);
    close(s, 2 * b, 1e-5 * 2 * b, `∫K = 2b (e=${e})`);
  }
});

test('réciprocité K(y, e) = K(e, y) et symétrie K(θ, e, y) = K(θ, −e, −y)', () => {
  const b = 5, L = 12;
  for (const [e, y] of [[0, 2], [1.5, -3], [4, 4.5], [-2, 5]]) {
    close(coefK({ b, L, e, y }), coefK({ b, L, e: y, y: e }), 1e-9, `réciprocité e=${e} y=${y}`);
    close(coefK({ b, L, e, y }), coefK({ b, L, e: -e, y: -y }), 1e-9, `symétrie e=${e} y=${y}`);
  }
});

test('limite θ → 0 : la dalle travaille en poutre, K → 1 partout', () => {
  const b = 5, L = 5000; // θ = 0.001
  for (const e of [0, 3, 5]) for (const y of [-5, -2, 0, 2, 5]) close(coefK({ b, L, e, y }), 1, 1e-4, `K e=${e} y=${y}`);
});

test('ordre de grandeur et monotonie : K croît vers la charge, K(e,e) > 1, K(bord opposé) < 1 pour θ = 0.5', () => {
  const b = 5, L = 10; // θ = 0.5
  const f = coefKFunction({ b, L, e: b });
  const Kedge = f(b), Kmid = f(0), Kfar = f(-b);
  assert.ok(Kedge > 1.5 && Kedge < 4, `K(b,b) = ${Kedge}`);
  assert.ok(Kmid > 0.5 && Kmid < 1.2, `K(0,b) = ${Kmid}`);
  assert.ok(Kfar < Kmid && Kmid < Kedge, 'monotonie');
  // charge centrée : K(0,0) > 1 et K(±b,0) < 1
  const g = coefKFunction({ b, L, e: 0 });
  assert.ok(g(0) > 1 && g(b) < 1, 'charge centrée');
  // moyenne sur bande = valeur ponctuelle pour une bande dégénérée
  close(coefKBand({ b, L, e1: 2, e2: 2, y: 1 }), coefK({ b, L, e: 2, y: 1 }), 1e-12, 'bande dégénérée');
  const kb = coefKBand({ b, L, e1: 1, e2: 3, y: 1 });
  assert.ok(kb > 0 && Math.abs(kb - coefK({ b, L, e: 2, y: 1 })) < 0.2, 'bande ≈ centre');
});

test('charge en bord (cas dégénéré) : limite continue de e → b', () => {
  const b = 4, L = 16;
  const f1 = coefKFunction({ b, L, e: b });
  const f2 = coefKFunction({ b, L, e: b - 1e-5 });
  for (const y of [-4, -1, 0, 2, 4]) close(f1(y), f2(y), 1e-3, `continuité en bord y=${y}`);
});

test('moment transversal μ : nul aux bords, symétrique pour une charge centrée, signe positif sous la charge', () => {
  const b = 5, L = 10;
  close(coefMu({ b, L, e: 0, y: b }), 0, 1e-9, 'μ bord');
  close(coefMu({ b, L, e: 2, y: -b }), 0, 1e-9, 'μ bord');
  close(coefMu({ b, L, e: 0, y: 2 }), coefMu({ b, L, e: 0, y: -2 }), 1e-9, 'symétrie');
  assert.ok(coefMu({ b, L, e: 0, y: 0 }) > 0, 'μ(0,0) > 0 (fibre inférieure tendue sous la charge)');
});

test('transverseMoments : patch symétrique ⇒ m_y symétrique, nul aux bords ; m_x intégré ≈ moment de poutre', () => {
  const b = 5, L = 12, q = 10;
  const ys = [-5, -2.5, 0, 2.5, 5];
  const { my, mx } = transverseMoments({ b, L, patches: [{ x1: 5, x2: 7, e1: -1, e2: 1, q }], x: 6, ys, nHarm: 30 });
  close(my[0], 0, 1e-6, 'm_y bord');
  close(my[4], 0, 1e-6, 'm_y bord');
  close(my[1], my[3], 1e-9, 'm_y symétrique');
  assert.ok(my[2] > 0, 'm_y positif sous la charge');
  // la somme de m_x sur la largeur doit redonner le moment de la poutre simplement appuyée :
  // charge 2 m × 2 m × 10 kN/m² = 40 kN centrée sur L=12 → M = 40·12/4 − 10·2·(2²)/8 = 120 − 10 = 110 kN·m
  const ysF = []; for (let i = 0; i <= 100; i++) ysF.push(-b + 2 * b * i / 100);
  const r = transverseMoments({ b, L, patches: [{ x1: 5, x2: 7, e1: -1, e2: 1, q }], x: 6, ys: ysF, nHarm: 60 });
  let s = 0; for (let i = 0; i < 100; i++) s += 0.5 * (r.mx[i] + r.mx[i + 1]) * (2 * b / 100);
  close(s, 110, 1.5, '∫m_x dy ≈ M poutre');
});
