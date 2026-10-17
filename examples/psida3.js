/**
 * Exemple : PSIDA droit à 3 travées (14 – 18 – 14 m), dalle de 12,00 m × 0,70 m,
 * chaussée de 10,00 m entre dispositifs de retenue, trottoirs de 1,00 m de part et d'autre.
 * Lancer : node examples/psida3.js
 */
import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA } from '../src/loads_ec.js';

const deck = new SlabDeck({
  spans: [14, 18, 14],
  width: 12, h: 0.70,
  roadway: { y1: -5, y2: 5 },
  footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }],
  lines: [
    { label: 'Corniche G', g: 5, e: -5.9 }, { label: 'Corniche D', g: 5, e: 5.9 },
    { label: 'BN4 G', g: 6.5, e: -5.3 }, { label: 'BN4 D', g: 6.5, e: 5.3 },
    { label: 'Trottoir G', g: 5, e: -5.5 }, { label: 'Trottoir D', g: 5, e: 5.5 },
  ],
  bands: [{ label: 'Revêtement 8 cm + chape 3 cm', q: 2.6, y1: -5, y2: 5 }],
  ys: [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6],
});

const fmt = v => v.toFixed(1).padStart(8);
const row = (label, arr) => console.log(label.padEnd(28) + arr.map(fmt).join(''));
const keys = deck.keySections();

console.log('Portées équivalentes L_eq [m] :', deck.Leq.map(v => v.toFixed(2)).join(' / '));
console.log('θ = b/L_eq :', deck.Leq.map(L => (deck.b / L).toFixed(3)).join(' / '));

const perm = deck.permanent();
console.log('\n=== CHARGES PERMANENTES === g total = ' + perm.gTotal.toFixed(1) + ' kN/m');
console.log('Section'.padEnd(28) + 'M_tot[kNm]'.padStart(12) + '  m_x(y) [kN·m/m] aux y = ' + deck.ys.join(', '));
for (const k of keys) console.log(k.label.padEnd(28) + perm.M[k.idx].toFixed(0).padStart(10) + '   ' + perm.mx[k.idx].map(fmt).join(''));
console.log('Réactions [kN] :', perm.R.map(v => v.toFixed(0)).join(' / '));

function show(title, res, extra = '') {
  console.log(`\n=== ${title} === ${extra}`);
  console.log('Section'.padEnd(28) + 'M_max'.padStart(8) + 'M_min'.padStart(8) + '   m_x max(y) puis m_x min(y) [kN·m/m]');
  for (const k of keys) {
    console.log(k.label.padEnd(28) + fmt(res.Mmax[k.idx]) + fmt(res.Mmin[k.idx]) + '   ' + res.mxMax[k.idx].map(fmt).join(''));
    console.log(''.padEnd(44) + '   ' + res.mxMin[k.idx].map(fmt).join(''));
  }
  console.log('R max [kN] :', res.Rmax.map(v => v.toFixed(0)).join(' / ') + '   R min :', res.Rmin.map(v => v.toFixed(0)).join(' / '));
}

const ec = deck.eurocode({ alpha: EC_ALPHA.recommended });
console.log(`\nEurocode : ${ec.lanes.n} voies de ${ec.lanes.wl} m, aire résiduelle ${ec.lanes.wr.toFixed(2)} m ; α = ${ec.alpha.label}`);
show('LM1 – TS (caractéristique)', ec.TS);
show('LM1 – UDL (caractéristique)', ec.UDL);
show('gr1a = TS + UDL + trottoirs 3 kN/m²', ec.gr1a);
show('gr1b = LM2', ec.gr1b);

const f61 = deck.fascicule61({ nRetenue: 2 });
console.log(`\nFascicule 61 : classe ${f61.classe}, Lr = ${f61.Lr} m, Lc = ${f61.Lc} m, ${f61.nv} voies de ${f61.v.toFixed(2)} m`);
show('A(l)', f61.A);
show('Bc (avec δ)', f61.Bc, 'δ = ' + f61.deltaBc.map(v => v.toFixed(3)).join(' / '));
if (f61.Bt) show('Bt (avec δ)', f61.Bt, 'δ = ' + f61.deltaBt.map(v => v.toFixed(3)).join(' / '));
show('Mc120 (avec δ)', f61.Mc120, 'δ = ' + f61.deltaMc.map(v => v.toFixed(3)).join(' / '));
show('D240', f61.D240);
