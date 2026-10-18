import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDesignation } from '../src/bearings.js';
import { parseData, compute } from '../src/pipeline.js';
import { formDefaults } from '../tools/formdefaults.mjs';

test('désignation a×b×n(t+ts) : lecture', () => {
  const d = parseDesignation('250×400×4(10+3)');
  assert.equal(d.bd.a, 250); assert.equal(d.bd.b, 400); assert.equal(d.n, 4); assert.equal(d.bd.t, 10); assert.equal(d.bd.ts, 3);
  assert.deepEqual(parseDesignation('300x500x3(10+3)').bd.b, 500);
  assert.equal(parseDesignation(''), null);
  assert.equal(parseDesignation('auto'), null);
});

test('appareil imposé sur les culées : retenu et vérifié NF EN 1337-3 (exemple du manuel)', () => {
  const d = { ...formDefaults(), overhangs: '0.5, 0.5', cover: '0.05', brgCul: '250×400×4(10+3)', ap_bosDeb: '0.10', ap_bosFck: '35', ap_B: '4' };
  const st = compute(parseData(d));
  const rows = st.bearings.rows;
  assert.equal(rows[0].sel.label, '250×400×4(10+3)'); assert.equal(rows[0].sel.imposed, true);
  assert.equal(rows[1].sel.label, '300×500×3(10+3)'); assert.ok(!rows[1].sel.imposed);
  for (const L of st.supports.lines) for (const code of ['BAEL', 'EC']) {
    assert.ok(L[code].brg.ok, `appareils ${code} ligne ${L.i}`);
    assert.ok(L[code].headChk.press.ok, `contact ${code} ligne ${L.i}`);
    assert.ok(L[code].found.worstV <= 1, `portance ${code} ligne ${L.i}`);
  }
});
