/**
 * État de calcul « vu » par le plan de ferraillage pour une dalle précontrainte : st.rebar remplacé par le ferraillage
 * passif et le frettage de src/psidp/ferraillage_passif.js (mémoïsé par état).
 */
import { rebarDP } from '../psidp/ferraillage_passif.js';

const memo = new WeakMap();
export function etatFerraillageDP(st) {
  if (!st || !st.psidp) return st;
  if (!memo.has(st)) memo.set(st, { ...st, rebar: rebarDP(st) });
  return memo.get(st);
}
