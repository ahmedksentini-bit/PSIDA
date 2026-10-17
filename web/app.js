import { SlabDeck } from '../src/analysis.js';
import { EC_ALPHA, notionalLanes, lm1 } from '../src/loads_ec.js';
import { voiesF61, classePont, MC120, D240 } from '../src/loads_f61.js';
import { elevationSVG, crossSectionSVG } from './svg.js';
import { envelopePlot, shearPlot, reactionPlot, kPlot, transversePlot, factorPlot, influencePlot, surfacePlot, asPlot, myPlot } from './plots.js';
import { designEC, designBAEL, designTransverseEC, designTransverseBAEL } from '../src/design.js';
import { TransverseModel } from '../src/transverse.js';

const $ = s => document.querySelector(s);
const nums = s => s.split(/[,;\s]+/).filter(Boolean).map(Number);
const pairs = s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => nums(t));
const fmt = v => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
const cell = v => `<td class="${v < -0.05 ? 'neg' : ''}">${fmt(v)}</td>`;

let state = null;

// « 10 @ -5.85 k 0.8/1.2 » → { g, e, kmin, kmax } ; « 1.92 sur -5,5 k 0.8/1.4 » → { q, y1, y2, kmin, kmax }
function parseK(t) { const m = t.match(/k\s*([\d.]+)\s*\/\s*([\d.]+)/i); return m ? { kmin: +m[1], kmax: +m[2], rest: t.replace(m[0], '') } : { kmin: 1, kmax: 1, rest: t }; }

function parseForm(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  const [y1, y2] = nums(d.roadway);
  const overhangs = nums(d.overhangs || '0,0');
  const EIv = d.EI.split(',').map(t => t.trim());
  return {
    deckInput: {
      spans: nums(d.spans), width: +d.width, h: +d.h, roadway: { y1, y2 },
      area: d.area.trim() ? +d.area : undefined, overhangs: [overhangs[0] || 0, overhangs[1] || 0],
      footways: pairs(d.footways).map(([a, b]) => ({ y1: a, y2: b })),
      lines: d.lines.split(';').map(t => t.trim()).filter(Boolean).map(t => { const k = parseK(t); const [g, e] = k.rest.split('@').map(Number); return { g, e, kmin: k.kmin, kmax: k.kmax }; }),
      bands: d.bands.split(';').map(t => t.trim()).filter(Boolean).map(t => { const k = parseK(t); const [q, r] = k.rest.split('sur'); const [a, b] = nums(r); return { q: +q, y1: a, y2: b, kmin: k.kmin, kmax: k.kmax }; }),
      ys: nums(d.ys), Leq: d.Leq.trim() ? nums(d.Leq) : undefined,
      nu: +d.nu, laneStep: +d.laneStep, nSec: 20, nGrid: 100,
      chamfer: d.hEdge.trim() && d.joue.trim() ? { hEdge: +d.hEdge, joue: +d.joue } : undefined,
    },
    alpha: d.alpha, nRetenue: +d.nRetenue, classe: d.classe.trim() ? +d.classe : null, chamoaSign: !!d.chamoaSign,
    withTherm: !!d.withTherm, dT: nums(d.dT), E: +EIv[0] || 34000, I: EIv[1] ? +EIv[1] : null, delta: +d.delta, phiFluage: +d.phiFluage,
    mat: { fck: +d.fck, fyk: +d.fyk, fc28: +d.fck, fe: +d.fyk, c: +d.cover, phi: +d.phi / 1000, phiT: +(d.phiT || 16) / 1000, wkMax: +d.wk, fissuration: d.fiss, tRev: +d.tRev },
  };
}

function compute(p) {
  const t0 = performance.now();
  const deck = new SlabDeck(p.deckInput);
  const keys = deck.keySections();
  const perm = deck.permanent();
  const ec = deck.eurocode({ alpha: EC_ALPHA[p.alpha] });
  const f61 = deck.fascicule61({ nRetenue: p.nRetenue, classe: p.classe });
  const thermal = p.withTherm ? deck.thermal({ dTheat: p.dT[0], dTcool: p.dT[1], E: p.E, I: p.I }) : null;
  const settle = p.withTherm ? deck.settlements({ delta: p.delta, E: p.E, I: p.I, phi: p.phiFluage }) : null;
  const design = {
    EC: designEC(deck, perm, ec, { ...p.mat, thermal, settle }),
    F61: designBAEL(deck, perm, f61, { ...p.mat, thermal, settle }),
  };
  const tm = new TransverseModel(deck, { tRev: p.mat.tRev, nHarm: 15 });
  const trans = tm.run({ alpha: EC_ALPHA[p.alpha], f61opt: { nRetenue: p.nRetenue, classe: p.classe }, thermal, settle });
  const transDesign = {
    EC: designTransverseEC(deck, trans, design.EC, { ...p.mat, phi: p.mat.phiT, phiLong: p.mat.phi }),
    F61: designTransverseBAEL(deck, trans, design.F61, { ...p.mat, phiLong: p.mat.phi }),
  };
  const cases = [
    { id: 'TS', label: 'LM1 – TS', res: ec.TS, ref: 'EC' }, { id: 'UDL', label: 'LM1 – UDL', res: ec.UDL, ref: 'EC' },
    { id: 'LM1', label: 'LM1 (TS + UDL)', res: ec.LM1, ref: 'EC' }, { id: 'gr1a', label: 'gr1a (LM1 + trottoirs 3 kN/m²)', res: ec.gr1a, ref: 'EC' },
    { id: 'gr1b', label: 'gr1b (LM2)', res: ec.gr1b, ref: 'EC' }, { id: 'gr3', label: 'gr3 (trottoirs 5 kN/m²)', res: ec.gr3, ref: 'EC' },
    { id: 'A', label: 'A(l)', res: f61.A, ref: 'F61' }, { id: 'Bc', label: 'Bc (δ inclus)', res: f61.Bc, ref: 'F61' },
    ...(f61.Bt ? [{ id: 'Bt', label: 'Bt (δ inclus)', res: f61.Bt, ref: 'F61' }] : []),
    { id: 'Mc120', label: 'Mc120 (δ inclus)', res: f61.Mc120, ref: 'F61' }, { id: 'D240', label: 'D240', res: f61.D240, ref: 'F61' },
    { id: 'trott', label: 'Trottoirs 1,5 kN/m²', res: f61.trottoir, ref: 'F61' },
  ];
  if (thermal) cases.push({ id: 'therm', label: 'Gradient thermique (±)', res: { ...thermal, Vmax: thermal.Vmax, Vmin: thermal.Vmin }, ref: 'EC' }, { id: 'settle', label: 'Tassements aléatoires (±)', res: settle, ref: 'EC' });
  return { p, deck, keys, perm, ec, f61, cases, thermal, settle, design, trans, transDesign, dt: (performance.now() - t0) / 1000 };
}

/** Charges à dessiner sur la coupe pour un cas (arrangement représentatif, voies depuis le bord y1). */
function caseLoads(st, id) {
  const { deck, ec, f61 } = st;
  const { y1, y2 } = deck.g.roadway;
  const out = [];
  if (['TS', 'UDL', 'LM1', 'gr1a', 'gr3'].includes(id)) {
    const nl = ec.lanes, m1 = ec.lm1;
    m1.lanes.forEach((ln, i) => {
      const e1 = y1 + i * nl.wl, e2 = e1 + nl.wl, e = (e1 + e2) / 2;
      if (id !== 'TS' && id !== 'gr3' && ln.q > 0) out.push({ kind: 'band', e1, e2, label: `voie ${ln.i} : ${ln.q.toFixed(1)} kN/m²` });
      if (id !== 'UDL' && id !== 'gr3' && ln.Q > 0) { out.push({ kind: 'wheel', e: e - 1 }); out.push({ kind: 'wheel', e: e + 1 }); }
    });
    if (id !== 'TS' && id !== 'gr3' && nl.wr > 0) out.push({ kind: 'band', e1: y1 + nl.n * nl.wl, e2: y2, label: `résiduel ${m1.qr.toFixed(1)}` });
    if (id === 'gr1a' || id === 'gr3') for (const fw of deck.g.footways || []) out.push({ kind: 'band', e1: fw.y1, e2: fw.y2, label: id === 'gr3' ? '5 kN/m²' : '3 kN/m²', color: '#2a8f6a' });
  } else if (id === 'gr1b') {
    const e = y1 + 1 + 0.175; out.push({ kind: 'wheel', e: e - 1, w: 0.35 }); out.push({ kind: 'wheel', e: e + 1, w: 0.35 });
  } else if (id === 'A') {
    for (let i = 0; i < f61.nv; i++) { const yc1 = y1 + (f61.Lr - f61.Lc) / 2; out.push({ kind: 'band', e1: yc1 + i * f61.v, e2: yc1 + (i + 1) * f61.v, label: `voie ${i + 1}` }); }
  } else if (id === 'Bc' || id === 'Bt') {
    const yc1 = y1 + (f61.Lr - f61.Lc) / 2, nf = id === 'Bt' ? Math.min(f61.nv, 2) : Math.min(f61.nv, 5);
    for (let i = 0; i < nf; i++) { const e = yc1 + 2.5 * i + 1.25; out.push({ kind: 'band', e1: e - 1.25, e2: e + 1.25, label: `file ${i + 1}`, opacity: 0.12 }); out.push({ kind: 'wheel', e: e - 1, w: 0.25 }); out.push({ kind: 'wheel', e: e + 1, w: 0.25 }); }
  } else if (id === 'Mc120') {
    const e = (y1 + y2) / 2, h = MC120.trackSpacing / 2;
    out.push({ kind: 'band', e1: e - h - 0.5, e2: e - h + 0.5, label: 'chenille' }); out.push({ kind: 'band', e1: e + h - 0.5, e2: e + h + 0.5, label: 'chenille' });
  } else if (id === 'D240') {
    const e = (y1 + y2) / 2; out.push({ kind: 'band', e1: e - D240.width / 2, e2: e + D240.width / 2, label: 'D240 — 3,20 m' });
  } else if (id === 'trott') {
    for (const fw of deck.g.footways || []) out.push({ kind: 'band', e1: fw.y1, e2: fw.y2, label: '1,5 kN/m²', color: '#2a8f6a' });
  }
  return out;
}

function tableEnv(st, res, title, withFactor = true) {
  const { deck, keys } = st;
  const f = withFactor ? deck.transverseFactors(res) : null;
  let h = `<details><summary>${title}</summary><table><thead><tr><th>Section</th><th>M max [kN·m]</th><th>M min</th>${withFactor ? '<th>K</th>' : ''}${deck.ys.map(y => `<th>y=${y}</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) {
    h += `<tr><td>${k.label}</td>${cell(res.Mmax[k.idx])}${cell(res.Mmin[k.idx])}${withFactor ? `<td>${f.K[k.idx].toFixed(3)}</td>` : ''}${res.mxMax[k.idx].map(cell).join('')}</tr>`;
    h += `<tr><td class="small">&nbsp;&nbsp;m_x min</td><td></td><td></td>${withFactor ? '<td></td>' : ''}${res.mxMin[k.idx].map(cell).join('')}</tr>`;
  }
  h += `</tbody></table><p class="small">R max = ${res.Rmax.map(v => v.toFixed(0)).join(' / ')} kN ; R min = ${res.Rmin.map(v => v.toFixed(0)).join(' / ')} kN${res.delta ? ' ; δ = ' + res.delta.map(v => v.toFixed(3)).join(' / ') : ''}. K = facteur de répartition transversale maximal de la section (équivalent du KTRANS de CHAMOA).</p></details>`;
  return h;
}

function renderStatic(st) {
  const { deck, keys, perm, ec, f61, p } = st;
  $('#model-info').innerHTML = `Portées équivalentes L_eq = ${deck.Leq.map(v => v.toFixed(3)).join(' / ')} m — θ = b/L_eq = ${deck.Leq.map(L => (deck.b / L).toFixed(3)).join(' / ')} — ν = ${deck.nu}.<br>
    Eurocode : ${ec.lanes.n} voie(s) de ${ec.lanes.wl.toFixed(2)} m, aire résiduelle ${ec.lanes.wr.toFixed(2)} m, ${ec.alpha.label}, ${ec.nArrangements} arrangements transversaux.
    Fascicule 61 : classe ${f61.classe}, Lc = ${f61.Lc.toFixed(2)} m, ${f61.nv} voie(s) de ${f61.v.toFixed(2)} m. Charges permanentes g = ${perm.gTotal.toFixed(1)} kN/m. Calcul en ${st.dt.toFixed(1)} s.`;
  $('#elevation').innerHTML = elevationSVG(deck, keys);
  // sélecteurs
  const sel = $('#case-select');
  sel.innerHTML = st.cases.map(c => `<option value="${c.id}">${c.ref === 'EC' ? 'EC — ' : 'F61 — '}${c.label}</option>`).join('');
  sel.value = 'LM1';
  const selSec = $('#section-select');
  selSec.innerHTML = keys.map((k, i) => `<option value="${i}">${k.label}</option>`).join('');
  const selSpan = $('#span-select');
  selSpan.innerHTML = deck.spans.map((L, j) => `<option value="${j}">Travée ${j + 1} (${L} m, L_eq ${deck.Leq[j].toFixed(2)} m)</option>`).join('');
  // enveloppes longitudinales : permanent + cas principaux
  const main = st.cases.filter(c => ['LM1', 'gr1b', 'A', 'Bc', 'Mc120', 'D240'].includes(c.id));
  envelopePlot($('#plot-M'), deck, perm, main, { invert: p.chamoaSign });
  shearPlot($('#plot-V'), deck, perm, main);
  reactionPlot($('#plot-R'), deck, perm, main);
  kPlot($('#plot-K'), deck, 0);
  // tableaux
  let h = `<details open><summary>Charges permanentes (g = ${perm.gTotal.toFixed(1)} kN/m)</summary><table><thead><tr><th>Section</th><th>M [kN·m]</th>${deck.ys.map(y => `<th>y=${y}</th>`).join('')}</tr></thead><tbody>`;
  for (const k of keys) h += `<tr><td>${k.label}</td>${cell(perm.M[k.idx])}${perm.mx[k.idx].map(cell).join('')}</tr>`;
  h += `</tbody></table><p class="small">Réactions : ${perm.R.map(v => v.toFixed(0)).join(' / ')} kN</p></details>`;
  h += `<h3>Eurocodes — EN 1991-2 (valeurs caractéristiques)</h3>` + st.cases.filter(c => c.ref === 'EC').map(c => tableEnv(st, c.res, c.label)).join('');
  h += `<h3>Fascicule 61 titre II (valeurs caractéristiques, δ inclus pour B et Mc)</h3>` + st.cases.filter(c => c.ref === 'F61').map(c => tableEnv(st, c.res, c.label)).join('');
  $('#tables').innerHTML = h;
  $('#trans-span').innerHTML = deck.spans.map((L, j) => `<option value="${j}">Travée ${j + 1} (${L} m)</option>`).join('');
  renderCase(st); renderSection(st); renderDesign(st); renderTransverse(st);
}

function renderCase(st) {
  const id = $('#case-select').value;
  const c = st.cases.find(x => x.id === id);
  const note = c.ref === 'EC' ? 'Arrangement représentatif (voies depuis le bord gauche) ; le calcul balaie toutes les positions.' : 'Arrangement représentatif ; le calcul balaie toutes les positions.';
  $('#cross').innerHTML = crossSectionSVG({ deck: st.deck, loads: caseLoads(st, id), title: `Coupe transversale — ${c.label}`, note });
  transversePlot($('#plot-mx'), st.deck, st.keys, st.perm, c.res, c.label);
  factorPlot($('#plot-f'), st.deck, st.keys, st.deck.transverseFactors(c.res), c.label);
  surfacePlot($('#plot-3d'), st.deck, c.res, $('#surface-which').value, `m_x(x, y) ${$('#surface-which').value === 'mxMax' ? 'max' : 'min'} — ${c.label} [kN·m/m]`);
}

function renderDesign(st) {
  const ref = $('#design-ref').value, dz = st.design[ref];
  const { deck, keys } = st;
  asPlot($('#plot-As'), deck, dz, ref === 'EC' ? 'Eurocodes (EC2)' : 'Fascicule 61 + BAEL 91');
  const cm = v => (v * 1e4).toFixed(1);
  let h = '';
  if (ref === 'EC') {
    h += `<p class="small">C${dz.mat.fck}/${dz.mat.fck + 10}, B${dz.mat.fyk} : fcd = ${dz.mat.fcd.toFixed(1)} MPa, fyd = ${dz.mat.fyd.toFixed(0)} MPa, fctm = ${dz.mat.fctm.toFixed(2)} MPa, αe = ${dz.mat.alphaE} ; d = h − c = ${dz.d.toFixed(3)} m ; σs ≤ ${dz.mat.sigSlim} MPa (ELS car., fatigue simplifiée), σc ≤ ${dz.mat.sigCcar.toFixed(1)} MPa, wk ≤ ${st.p.mat.wkMax} mm (ELS fréquent, φ ${(st.p.mat.phi * 1000).toFixed(0)}) ; minimums : 9.2.1.1 ×1,2 = ${cm(dz.mins.as921)}, 7.3.2 = ${cm(dz.mins.as732)}, 3 cm²/m par face.${deck.g.chamfer ? ' Chanfreins pris en compte en compression par l\'intrados.' : ''}</p>`;
    h += `<table><thead><tr><th>Section</th><th>Face</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>M QP</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>min</th><th><b>A_s</b></th><th>σs</th><th>σc</th><th>x/d</th></tr></thead><tbody>`;
    for (const k of keys) {
      for (const face of ['bot', 'top']) {
        const arr = dz[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dz.perFibre[k.idx][iy][face];
        h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'} (y = ${deck.ys[iy]})</td><td>${f.Mu.toFixed(0)}</td><td>${f.Mcar.toFixed(0)}</td><td>${f.Mfre.toFixed(0)}</td><td>${f.Mqp.toFixed(0)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(Math.max(f.as921, f.as732, f.perFace))}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td><td>${f.sigC.toFixed(1)}</td><td>${f.xOverD.toFixed(2)}</td></tr>`;
      }
    }
    h += `</tbody></table><p class="small">Moments en kN·m/m (fibre la plus sollicitée), aciers en cm²/m. Effort tranchant par mètre (V_Ed avec facteur K du cas LM1) / V_Rd,c : ` + keys.map(k => `${k.label} : ${dz.shear[k.idx].ratio.toFixed(2)}`).join(' ; ') + `. Poinçonnement : LM1 vEd = ${dz.punch.LM1.vEd.toFixed(3)} / vRd,c = ${dz.punch.LM1.vRdc.toFixed(3)} MPa (${dz.punch.LM1.ok ? 'OK' : 'NON'}) ; LM2 vEd = ${dz.punch.LM2.vEd.toFixed(3)} MPa (${dz.punch.LM2.ok ? 'OK' : 'NON'}). Aciers transversaux minimaux (EC2 9.3.1.1 : 20 % des longitudinaux) : inf ${cm(dz.transverseMin.bot)}, sup ${cm(dz.transverseMin.top)} cm²/m — à compléter par les moments transversaux m_y.</p>`;
  } else {
    h += `<p class="small">fc28 = ${dz.mat.fc28} MPa, fe = ${dz.mat.fe} MPa : fbu = ${dz.mat.fbu.toFixed(2)} MPa, fsu = ${dz.mat.fsu.toFixed(0)} MPa, μ_lim = ${dz.mat.muL.toFixed(3)} ; ELS fissuration ${dz.mat.fissuration} : σ̄s = ${isFinite(dz.mat.sigSbar) ? dz.mat.sigSbar.toFixed(0) + ' MPa' : '—'}, σ̄bc = ${dz.mat.sigBbar.toFixed(1)} MPa, n = 15 ; d = ${dz.d.toFixed(3)} m ; non-fragilité ${cm(dz.mins.nonFrag)}, dalle ${cm(dz.mins.dalle)} cm²/m.</p>`;
    h += `<table><thead><tr><th>Section</th><th>Face</th><th>M ELU</th><th>M ELS</th><th>ELU</th><th>ELS</th><th>min</th><th><b>A_s</b></th><th>σs</th><th>σb</th><th>α</th></tr></thead><tbody>`;
    for (const k of keys) {
      for (const face of ['bot', 'top']) {
        const arr = dz[face][k.idx]; const iy = arr.indexOf(Math.max(...arr)); const f = dz.perFibre[k.idx][iy][face];
        h += `<tr><td>${k.label}</td><td>${face === 'bot' ? 'inf' : 'sup'} (y = ${deck.ys[iy]})</td><td>${f.Mu.toFixed(0)}</td><td>${f.Ms.toFixed(0)}</td><td>${cm(f.AsELU)}</td><td>${cm(f.AsELS)}</td><td>${cm(Math.max(f.nonFrag, f.dalle))}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td><td>${f.sigB.toFixed(1)}</td><td>${f.alpha.toFixed(3)}</td></tr>`;
      }
    }
    h += `</tbody></table><p class="small">Moments en kN·m/m, aciers en cm²/m. τu / τ̄u (dalles sans armatures d'âme, A.5.2.2) : ` + keys.map(k => `${k.label} : ${dz.shear[k.idx].ratio.toFixed(2)}`).join(' ; ') + `. Poinçonnement (A.5.2.42) : Br Qu = ${dz.punch.Br.Qu.toFixed(3)} / ${dz.punch.Br.QuLim.toFixed(3)} MN (${dz.punch.Br.ok ? 'OK' : 'NON'}). Armatures de répartition ≥ A_s/4 : inf ${cm(dz.transverseMin.bot)}, sup ${cm(dz.transverseMin.top)} cm²/m.</p>`;
  }
  $('#design-tables').innerHTML = h;
}

function renderTransverse(st) {
  const j = +$('#trans-span').value, ref = $('#trans-ref').value;
  const dz = st.transDesign[ref], sp = dz.spans[j];
  const extra = ref === 'EC' ? [{ name: 'ELS caractéristique max', y: sp.comb.CARmax }, { name: 'ELS caractéristique min', y: sp.comb.CARmin }] : [{ name: 'ELS max', y: sp.comb.ELSmax }, { name: 'ELS min', y: sp.comb.ELSmin }];
  myPlot($('#plot-my'), st.deck, st.trans, j, extra);
  const cm = v => (v * 1e4).toFixed(1);
  let h = `<p class="small">Dalle isostatique équivalente (L_eq, bords libres, ν = ${st.deck.nu}), charges diffusées à 45° jusqu'au feuillet moyen (contact + 2·${st.p.mat.tRev} + h), séries de Fourier (15 harmoniques), charges roulantes centrées sur x = L_eq/2, enveloppe sur les positions transversales ; thermique et tassements : m_y = ν·m_x. Hauteur utile transversale d = h − c − φ_long = ${dz.d.toFixed(3)} m.</p>`;
  if (ref === 'EC') {
    h += `<table><thead><tr><th>Travée</th><th>Face</th><th>y</th><th>M ELU</th><th>M car.</th><th>M fréq.</th><th>ELU</th><th>ELS σ</th><th>wk</th><th>non sect.</th><th><b>A_s,y</b></th><th>σs</th></tr></thead><tbody>`;
    dz.spans.forEach(sp2 => { for (const face of ['bot', 'top']) { const f = sp2[face]; h += `<tr><td>Travée ${sp2.j + 1}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${f.y}</td><td>${f.Mu.toFixed(1)}</td><td>${f.Mcar.toFixed(1)}</td><td>${f.Mfre.toFixed(1)}</td><td>${cm(f.AsULS)}</td><td>${cm(f.AsSLS)}</td><td>${cm(f.AsWk)}</td><td>${cm(f.nonSec)}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td></tr>`; } });
    h += `</tbody></table><p class="small">Non sectionnel (EC2 9.3.1.1 et pratique CHAMOA) : A_s,trans,inf ≥ 0,2 A_s,long,inf ; A_s,trans,sup ≥ max(0,2 A_s,long,sup ; 0,5 A_s,trans,inf). Le critère wk (7.3.4) impose un espacement ≤ 5(c + φ/2), d'où un minimum lié au diamètre choisi (φ transversal ${(st.p.mat.phiT * 1000).toFixed(0)} mm).</p>`;
  } else {
    h += `<table><thead><tr><th>Travée</th><th>Face</th><th>y</th><th>M ELU</th><th>M ELS</th><th>ELU</th><th>ELS</th><th>répartition</th><th><b>A_s,y</b></th><th>σs</th></tr></thead><tbody>`;
    dz.spans.forEach(sp2 => { for (const face of ['bot', 'top']) { const f = sp2[face]; h += `<tr><td>Travée ${sp2.j + 1}</td><td>${face === 'bot' ? 'inf' : 'sup'}</td><td>${f.y}</td><td>${f.Mu.toFixed(1)}</td><td>${f.Ms.toFixed(1)}</td><td>${cm(f.AsELU)}</td><td>${cm(f.AsELS)}</td><td>${cm(f.nonSec)}</td><td><b>${cm(f.As)}</b></td><td>${f.sigS.toFixed(0)}</td></tr>`; } });
    h += `</tbody></table><p class="small">Armatures de répartition BAEL B.7.4 : ≥ A_s,long/3 (charges concentrées).</p>`;
  }
  $('#trans-tables').innerHTML = h;
}

function renderSection(st) {
  const k = st.keys[+$('#section-select').value];
  const sup = k.kind === 'support' ? k.span + 1 : (k.span === 0 ? 1 : k.span);
  influencePlot($('#plot-IL'), st.deck, k.idx, Math.min(sup, st.deck.spans.length));
}

$('#f').addEventListener('submit', ev => {
  ev.preventDefault();
  $('#results').hidden = false;
  try { state = compute(parseForm(ev.target)); renderStatic(state); $('#error').textContent = ''; }
  catch (e) { $('#error').textContent = e.stack || String(e); }
});
$('#case-select').addEventListener('change', () => state && renderCase(state));
$('#surface-which').addEventListener('change', () => state && renderCase(state));
$('#section-select').addEventListener('change', () => state && renderSection(state));
$('#design-ref').addEventListener('change', () => state && renderDesign(state));
$('#trans-span').addEventListener('change', () => state && renderTransverse(state));
$('#trans-ref').addEventListener('change', () => state && renderTransverse(state));
$('#span-select').addEventListener('change', () => state && kPlot($('#plot-K'), state.deck, +$('#span-select').value));
$('#btn-chamoa').addEventListener('click', () => {
  const f = $('#f');
  f.spans.value = '10, 15, 15, 10'; f.width.value = 12; f.h.value = 0.75; f.area.value = 8.91; f.overhangs.value = '0.5, 0.5';
  f.roadway.value = '-5, 5'; f.footways.value = '-6,-5 ; 5,6'; f.lines.value = '10 @ -5.85 k 0.8/1.2 ; 10 @ 5.85 k 0.8/1.2';
  f.bands.value = '0.66 sur -6,6 k 0.8/1.2 ; 1.92 sur -5,5 k 0.8/1.4 ; 0.72 sur -6,-5 ; 0.72 sur 5,6'; f.ys.value = '-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6';
  f.Leq.value = ''; f.alpha.value = 'FR2'; f.nRetenue.value = 0; f.classe.value = ''; f.nu.value = 0.2; f.chamoaSign.checked = true;
  f.hEdge.value = 0.40; f.joue.value = 1.0; f.EI.value = '34077, 0.43077'; f.withTherm.checked = true; f.fck.value = 35; f.fyk.value = 500; f.cover.value = 0.03;
});
