// NF EN 1991-2/NA (mars 2008) : coefficients α des deux classes de trafic (clause 4.3.2(3)) et βQ du LM2 (4.3.3(2)).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EC_ALPHA, lm1, lm2 } from '../src/loads_ec.js';

test('NF EN 1991-2/NA 4.3.2(3) : 1ère et 2e classes de trafic', () => {
  assert.deepEqual([...EC_ALPHA.FR1.aQ, EC_ALPHA.FR1.aq1, EC_ALPHA.FR1.aq2, EC_ALPHA.FR1.aqr], [1, 1, 1, 1, 1.2, 1.2]);
  assert.deepEqual([...EC_ALPHA.FR2.aQ, EC_ALPHA.FR2.aq1, EC_ALPHA.FR2.aq2, EC_ALPHA.FR2.aqr], [0.9, 0.8, 0.8, 0.7, 1, 1]);
  const m = lm1(3, EC_ALPHA.FR2);
  assert.deepEqual(m.lanes.map((l) => l.Q), [270, 160, 80]);
  assert.ok(Math.abs(m.lanes[0].q - 6.3) < 1e-12);
});

test('NF EN 1991-2/NA 4.3.3(2) : βQ = 0,80 pour le LM2 dans les deux classes ; αQ1 sans annexe', () => {
  assert.equal(lm2(EC_ALPHA.FR1).Q, 320);
  assert.equal(lm2(EC_ALPHA.FR2).Q, 320);
  assert.equal(lm2(EC_ALPHA.recommended).Q, 400);
});
