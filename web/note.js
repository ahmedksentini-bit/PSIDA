/**
 * Note de calcul au format des notes SETRA (PSIDA.EL pour le Fascicule 61 / BAEL, CHAMOA-PSIDA pour les Eurocodes) :
 * un modèle de document (blocs titre / paragraphes / tableaux / commentaires / figures) construit à partir de l'état du
 * calcul, puis rendu en HTML imprimable (noteToHTML) ou en document Word .docx (noteToDocx, bibliothèque docx vendorisée).
 *
 * Plan (repris de la note commentée PSIDA.EL) :
 *  1 données · 2 caractéristiques et lignes d'influence · 3 dénivellations d'appui · 4 charges et majoration dynamique
 *  5 coefficients de répartition transversale · 6 moments fléchissants par travée · 7 positions des charges
 *  8 efforts tranchants · 9 réactions d'appui · 10 flexion transversale · 11 ferraillage longitudinal
 *  12 appareils d'appui et chevêtres incorporés · 13 nomenclature des aciers · 14 appuis et fondations · références.
 * Le modèle ne dépend pas du DOM (testable sous Node) ; les figures sont passées en data: URI.
 */
import { BC, BT, MC120, maxAxleLoadOnLength, maxStripTrainLoad, COMBI_BAEL } from '../src/loads_f61.js';
import { mechanicalSkew } from '../src/skew.js';
import { supportsBlocks, waterBlocks } from './supports_view.js';
import { seismicBlocks, texToText } from './seismic_note.js';
import { ddrBlocks } from './ddr_view.js';
import { deckFigures, supportSchema, distributionChart, pileProfileCharts, footingPressureChart, svgBlock } from './note_figures.js';

const F = (v, n = 1) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F2 = v => F(v, 2), F3 = v => F(v, 3);
const CM = v => F(v * 1e4, 1);

/** Fractions de portée imprimées (comme PSIDA.EL : 0,05 L près des appuis, 0,10 L ailleurs). */
const FRACS = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];

function sectionRows(deck, j) {
  return FRACS.map(fr => ({ fr, idx: deck.beam.sectionIndex(j, fr), x: deck.beam.x0[j] + fr * deck.spans[j] }));
}

/** Moment « largeur totale » d'un cas de trafic (Σ K·δ·M) = extremum sur les fibres de m_x·2b. */
const Mtot = (deck, res, s, w) => (res ? (w === 'max' ? Math.max(0, ...res.mxMax[s]) : Math.min(0, ...res.mxMin[s])) * 2 * deck.b : 0);

export function buildNote(st, { ref = 'F61', figures = {}, project = {} } = {}) {
  const { p, deck, perm, ec, f61, thermal, settle, design, bearings, chevetres, rebar } = st;
  const g = deck.g, bm = deck.beam, nSp = deck.spans.length;
  const B = [];
  const h1 = (text, num) => B.push({ t: 'h1', text: num ? `${num}. ${text}` : text });
  const h2 = text => B.push({ t: 'h2', text });
  const para = text => B.push({ t: 'p', text });
  const comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const fig = key => { if (figures[key]) B.push({ t: 'img', ...figures[key] }); };
  let DF = { data: [], il: [], M: [], V: [], R: [], As: [], rebar: [] };
  try { DF = deckFigures(st, ref === 'F61' ? 'F61' : 'EC'); } catch (e) { /* figures indisponibles */ }
  const figs = arr => { for (const b of arr || []) if (b && b.svg) B.push(b); };
  const isF = ref === 'F61';
  const dz = isF ? design.F61 : design.EC;
  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const title = isF ? 'Note de calcul — pont-dalle en béton armé (type PSI-DA) — Fascicule 61 titre II et BAEL 91'
    : 'Note de calcul — pont-dalle en béton armé (type PSI-DA) — Eurocodes';
  const meta = `${project.name || 'Ouvrage'} · ${today} · calcul PSIDA v${st.version || ''} (calcul manuel assisté)`;
  const Ltot = deck.spans.reduce((a, b) => a + b, 0), [aL, aR] = g.overhangs || [0, 0];
  const psi = p.concept?.psi || g.psi || 100;
  const I = p.I || 2 * deck.b * deck.h ** 3 / 12;

  // ---------------------------------------------------------------------------------------------------------- 1
  h1('Données', 1);
  h2('Géométrie de l\'ouvrage');
  table(['Grandeur', 'Valeur'], [
    ['Nombre de travées', String(nSp)],
    ['Portées (biaises) [m]', `${F2(aL)} (about) | ${deck.spans.map(F2).join(' | ')} | ${F2(aR)} (about)`],
    ['Longueur entre appuis extrêmes / totale [m]', `${F2(Ltot)} / ${F2(Ltot + aL + aR)}`],
    ['Biais géométrique ψ [gr]', F1(psi)],
    ['Profil en travers : chaussée y₁ ; y₂ [m]', `${F2(g.roadway.y1)} ; ${F2(g.roadway.y2)} (largeur roulable ${F2(g.roadway.y2 - g.roadway.y1)} m)`],
    ['Trottoirs [m]', (g.footways || []).map(f => `${F2(f.y1)} ; ${F2(f.y2)}`).join(' | ') || '—'],
    ['Dalle : largeur 2b ; épaisseur h [m]', `${F3(2 * deck.b)} ; ${F3(deck.h)}`],
    ['Aire S [m²] ; inertie I [m⁴]', `${F3(deck.area)} ; ${F(I, 5)}`],
  ]);
  comment('La dalle est remplacée par un rectangle équivalent de largeur 2b et d\'inertie I (Guyon-Massonnet, dalle isotrope). Les portées sont les portées biaises mesurées suivant l\'axe longitudinal ; le biais n\'est pris en compte que par le biais mécanique (flexion transversale, directions d\'aciers).');
  figs(DF.data);
  h2('Matériaux');
  if (isF) table(['Béton', 'Valeur', 'Acier', 'Valeur'], [
    ['f_c28 [MPa]', F1(dz.mat.fc28), 'f_e [MPa]', F0(dz.mat.fe)],
    ['f_t28 [MPa]', F2(dz.mat.ft28), 'f_su [MPa]', F0(dz.mat.fsu)],
    ['f_bu [MPa]', F2(dz.mat.fbu), 'σ̄_s ELS [MPa]', isFinite(dz.mat.sigSbar) ? F0(dz.mat.sigSbar) : '— (fissuration peu nuisible)'],
    ['σ̄_bc [MPa]', F1(dz.mat.sigBbar), 'coefficient d\'équivalence n', '15'],
  ]);
  else table(['Béton', 'Valeur', 'Acier', 'Valeur'], [
    ['C' + dz.mat.fck, `f_cd = ${F2(dz.mat.fcd)} MPa`, 'B' + dz.mat.fyk, `f_yd = ${F0(dz.mat.fyd)} MPa`],
    ['f_ctm [MPa]', F2(dz.mat.fctm), 'E_s [MPa]', '200 000'],
    ['E_cm [MPa]', F0(dz.mat.Ecm), 'ouverture des fissures w_k [mm]', F2(p.mat.wkMax || 0.3)],
  ]);
  h2('Charges');
  const files = deck.permanentFiles();
  table(['Charge permanente', 'q nominale [kN/m]', 'k min', 'k max', 'q min / q max [kN/m]'],
    files.map(f => [f.label, F2(f.q), F2(f.kmin), F2(f.kmax), `${F2(f.q * f.kmin)} / ${F2(f.q * f.kmax)}`]));
  if (isF) para(`Surcharges réglementaires (Fascicule 61 titre II) : pont de ${f61.classe}ʳᵉ classe, largeur chargeable L_c = ${F2(f61.Lc)} m, ${f61.nv} voie(s) de ${F2(f61.v)} m ; systèmes A(l), Bc, Bt${f61.Bt ? '' : ' (non applicable)'}, Mc120, D240 et trottoirs (1,5 kN/m², charge locale 4,5 kN/m² en flexion transversale).`);
  else para(`Charges de trafic (EN 1991-2) : ${ec.lanes.n} voie(s) conventionnelle(s) de ${F2(ec.lanes.wl)} m (aire résiduelle ${F2(ec.lanes.wr)} m), ${ec.alpha.label} ; LM1 (TS + UDL), LM2, trottoirs (gr1a 3 kN/m², gr3 5 kN/m²).`);
  if (thermal) para(`Gradient thermique ${p.dT[0]} / ${p.dT[1]} °C ; tassements aléatoires ${F1(p.delta * 100)} cm (module différé E/(1 + ${p.phiFluage})).`);

  // ---------------------------------------------------------------------------------------------------------- 2
  h1('Caractéristiques et lignes d\'influence', 2);
  const Le = deck.Leq;
  table(['Travée', 'Portée [m]', 'L_eq [m]', 'θ = b/L_eq', 'Biais mécanique φ [gr]'], deck.spans.map((L, j) => [String(j + 1), F2(L), F3(Le[j]), F3(deck.b / Le[j]), psi < 100 ? F3(mechanicalSkew({ psi, Be: 2 * deck.b, L })) : '100']));
  comment(`Portée équivalente : ${g.leqMethod === 'fleches' ? 'travée isostatique de même flèche à mi-travée sous charge uniforme (programme PSIDA.EL)' : 'distance entre les points de moment nul de la travée chargée seule (méthode des moments, CHAMOA)'} ; paramètre d'entretoisement θ = b/L_eq. Biais mécanique φ = ψ + (100 − ψ)(1 − η/2)², η = (2b/sin ψ)/L (guide SETRA 1989 § 3.4.1).`);
  h2('Aires des lignes d\'influence des moments sur appuis (m²)');
  const area = (il, a, b) => bm.integrateIL(il, a, b);
  const supRows = [];
  for (let i = 1; i < nSp; i++) { const il = bm.ILM[bm.supportSectionIndex(i)]; const parts = deck.spans.map((_, j) => area(il, bm.x0[j], bm.x0[j + 1])); supRows.push([`Appui ${i + 1}`, F3(parts.reduce((a, v) => a + v, 0)), ...parts.map(F3)]); }
  if (supRows.length) table(['Ligne d\'influence', 'Aire totale', ...deck.spans.map((_, j) => `Travée ${j + 1}`)], supRows);
  h2('Aires des lignes d\'influence des réactions d\'appui (m)');
  table(['Réaction', 'Aire totale', 'About', ...deck.spans.map((_, j) => `Travée ${j + 1}`)], bm.ILR.map((il, i) => {
    const parts = deck.spans.map((_, j) => area(il, bm.x0[j], bm.x0[j + 1]));
    const ab = (aL > 0 && i === 0 ? area(il, bm.xMin, 0) : 0) + (aR > 0 && i === nSp ? area(il, bm.Ltot, bm.xMax) : 0);
    return [`Appui ${i + 1}`, F3(parts.reduce((a, v) => a + v, 0) + ab), F3(ab), ...parts.map(F3)];
  }));
  comment('Les lignes d\'influence sont calculées par la méthode des rotations (poutre continue à inertie constante), abouts compris : une charge sur un about équivaut à un moment imposé au nœud extrême et à une charge directe sur l\'appui.');
  figs(DF.il);

  // ---------------------------------------------------------------------------------------------------------- 3
  h1('Dénivellations d\'appui', 3);
  const EI = (p.E || 34000) * 1000 * I;
  const sRows = [];
  for (let k = 0; k <= nSp; k++) { const v = new Array(nSp + 1).fill(0); v[k] = 0.01; const r = bm.settlement(v, deck.spans.map(() => EI)); sRows.push([`Appui ${k + 1} (1 cm)`, ...Array.from({ length: nSp - 1 }, (_, i) => F1(r.M[bm.supportSectionIndex(i + 1)])), ...r.R.map(F1)]); }
  table(['Dénivellation', ...Array.from({ length: nSp - 1 }, (_, i) => `M appui ${i + 2} [kN·m]`), ...Array.from({ length: nSp + 1 }, (_, i) => `R${i + 1} [kN]`)], sRows);
  comment(`Calcul avec le module instantané E = ${F0(p.E || 34000)} MPa (effets d'un changement d'appareils d'appui). Les tassements effectifs sont combinés avec le module différé E/(1 + φ) : tassement δ sur un appui et −δ sur l'appui adjacent, enveloppe sur les paires d'appuis (pratique PSIDA.EL et CHAMOA).`);

  // ---------------------------------------------------------------------------------------------------------- 4
  h1(isF ? 'Charges permanentes et majoration dynamique' : 'Charges permanentes', 4);
  const gMean = files.reduce((a, f) => a + f.q * (f.kmin + f.kmax) / 2, 0);
  if (isF) {
    table(['Travée', 'L [m]', 'G = ½(G min + G max) [kN]', 'S système B [kN]', 'δ_B', 'S Mc120 [kN]', 'δ_Mc'], deck.spans.map((L, j) => {
      const SB = Math.max(Math.min(f61.nv, 5) * BC.bc[f61.classe][Math.min(f61.nv, 5) - 1] * maxAxleLoadOnLength(BC.axlesTwoTrucks, L), BT.bt[f61.classe] ? Math.min(f61.nv, 2) * BT.bt[f61.classe] * maxAxleLoadOnLength(BT.axles, L) : 0);
      return [String(j + 1), F2(L), F0(gMean * L), F0(SB), F3(f61.deltaBc[j]), F0(maxStripTrainLoad(L, MC120.trackLength, MC120.trackLength + MC120.gapMin, MC120.P)), F3(f61.deltaMc[j])];
    }));
    comment('δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4 G/S) (art. 5.5) ; G = demi-somme des poids caractéristiques minimal et maximal de la travée ; S = poids maximal des essieux de Bc ou de Bt plaçables sur la travée (un seul δ pour le système B) ; Mc120 en convoi. Réactions de culée : δ = ½[δ + max(δ ; 1,5)] (B) et ½[δ + max(δ ; 1,2)] (Mc120) (PSI-DA 68 § 2.4.3).');
  } else table(['Composante', 'g [kN/m]'], [...files.map(f => [f.label, F2(f.q)]), ['Total nominal', F2(files.reduce((a, f) => a + f.q, 0))]]);

  // ---------------------------------------------------------------------------------------------------------- 5
  h1('Coefficients de répartition transversale', 5);
  const cases = isF ? [['Trottoirs', f61.trottoir], ['A(l)', f61.A], ['Bc', f61.Bc], ['Bt', f61.Bt], ['Mc120', f61.Mc120]]
    : [['TS', ec.TS], ['UDL', ec.UDL], ['LM1', ec.LM1], ['LM2', ec.gr1b], ['Trottoirs gr3', ec.gr3]];
  const Kspan = (res, j) => { if (!res) return null; const K = deck.transverseFactors(res).K; return Math.max(...sectionRows(deck, j).filter(r => r.fr > 0.15 && r.fr < 0.85).map(r => K[r.idx])); };
  table(['Travée', ...cases.map(c => c[0])], deck.spans.map((_, j) => [String(j + 1), ...cases.map(([, r]) => (r ? F3(Kspan(r, j)) : '—'))]));
  comment(isF ? 'Coefficient de la fibre la plus sollicitée, rapport du moment par mètre m_x(y) au moment moyen M/2b (Guyon-Massonnet, premier harmonique). Chaque charge reçoit le coefficient et le δ de la travée qui la porte (convention PSIDA.EL) ; bc et a1 sont inclus dans les charges.' : 'Facteur K = max_y m_x(y)/(M/2b), équivalent du KTRANS de CHAMOA ; la L_eq de la section est utilisée (moyenne des deux travées sur appui).');
  fig('K');

  // ---------------------------------------------------------------------------------------------------------- 6
  h1('Moments fléchissants par travée (largeur totale) [kN·m]', 6);
  const Kc = isF ? COMBI_BAEL : null;
  for (let j = 0; j < nSp; j++) {
    h2(`Travée ${j + 1} (L = ${F2(deck.spans[j])} m)`);
    const rows = [];
    for (const r of sectionRows(deck, j)) {
      const s = r.idx;
      const gx = perm.Mmax[s], gn = perm.Mmin[s];
      const T = settle ? settle.Mmax[s] : 0, Th = thermal ? [thermal.Mmax[s], thermal.Mmin[s]] : [0, 0];
      if (isF) {
        const A = [Mtot(deck, f61.A, s, 'max'), Mtot(deck, f61.A, s, 'min')];
        const Bx = Math.max(Mtot(deck, f61.Bc, s, 'max'), Mtot(deck, f61.Bt, s, 'max')), Bn = Math.min(Mtot(deck, f61.Bc, s, 'min'), Mtot(deck, f61.Bt, s, 'min'));
        const C = [Math.max(Mtot(deck, f61.Mc120, s, 'max'), Mtot(deck, f61.D240, s, 'max')), Math.min(Mtot(deck, f61.Mc120, s, 'min'), Mtot(deck, f61.D240, s, 'min'))];
        const Tr = [Mtot(deck, f61.trottoir, s, 'max'), Mtot(deck, f61.trottoir, s, 'min')];
        const E = Kc.ELU, S = Kc.ELS;
        // trottoirs cumulés avec A, B et le char (pratique PSIDA.EL)
        const elsX = gx + Math.max(S.A * Math.max(A[0], Bx), S.Mc * C[0], 0) + S.trottoir * Tr[0], elsN = gn + Math.min(S.A * Math.min(A[1], Bn), S.Mc * C[1], 0) + S.trottoir * Tr[1];
        const eluX = E.G * gx + E.G * T + Math.max(E.A * Math.max(A[0], Bx), E.Mc * C[0], 0) + E.trottoir * Tr[0];
        const eluN = (gn < 0 ? E.G : E.Gfav) * gn - E.G * T + Math.min(E.A * Math.min(A[1], Bn), E.Mc * C[1], 0) + E.trottoir * Tr[1];
        rows.push([`${F2(r.fr)} L`, F2(r.x), F1(gx), F1(T), F1(A[0]), F1(Bx), F1(C[0]), F1(Tr[0]), F1(elsX), F1(eluX), CM(dz.envBot[s])]);
        rows.push(['', '', F1(gn), F1(-T), F1(A[1]), F1(Bn), F1(C[1]), F1(Tr[1]), F1(elsN), F1(eluN), CM(dz.envTop[s])]);
      } else {
        const c = dz.beam.M;
        const q = res => [Mtot(deck, res, s, 'max'), Mtot(deck, res, s, 'min')];
        const ts = q(ec.TS), udl = q(ec.UDL), lm2 = q(ec.gr1b), g3 = q(ec.gr3);
        rows.push([`${F2(r.fr)} L`, F2(r.x), F1(gx), F1(ts[0]), F1(udl[0]), F1(lm2[0]), F1(g3[0]), F1(Th[0]), F1(T), F1(c.CARmax[s]), F1(c.ELUmax[s]), CM(dz.envBot[s])]);
        rows.push(['', '', F1(gn), F1(ts[1]), F1(udl[1]), F1(lm2[1]), F1(g3[1]), F1(Th[1]), F1(-T), F1(c.CARmin[s]), F1(c.ELUmin[s]), CM(dz.envTop[s])]);
      }
    }
    if (isF) table(['Section', 'x [m]', 'Charge perm.', 'Tassements', 'A', 'B', 'C.E.', 'Trottoirs', 'ELS', 'ELU', 'A_s inf / sup [cm²/m]'], rows, { small: true, pairs: true });
    else table(['Section', 'x [m]', 'Perm.', 'TS', 'UDL', 'LM2', 'gr3', 'Gradient', 'Tassements', 'ELS car.', 'ELU', 'A_s inf / sup [cm²/m]'], rows, { small: true, pairs: true });
  }
  if (isF) comment('Première ligne : moments maximaux ; seconde ligne : moments minimaux. Valeurs pour la largeur totale avec coefficients de répartition et δ (Σ K_j·δ_j·M_j). ELS = G + max[1,2 (A ou B) ; C.E.] + trottoirs ; ELU = 1,35 (G + tassements aléatoires) + max[1,6 (A ou B) ; 1,35 C.E.] + 1,6 trottoirs (G favorable 1,0) — équivalent aux combinaisons 1,125 × [1,2 G + 1,42 Q] des notes PSIDA.EL. Les sections d\'acier sont calculées fibre par fibre (m_x(y)) et données par mètre de largeur pour la fibre la plus sollicitée.');
  else comment('Valeurs « largeur totale » des cas de trafic = max_y m_x(y)·2b ; combinaisons EN 1990 annexe A2 (formules CHAMOA) : ELS caractéristique = G + Ta + max(T + ψ₀Q ; 0,6 T + Q_LM1 ; LM2) ; ELU = 1,35 G + 1,35 Q. Sections d\'acier par mètre pour la fibre la plus sollicitée.');
  if (DF.M.length) figs(DF.M); else fig('M');

  // ---------------------------------------------------------------------------------------------------------- 7
  if (isF) {
    h1('Positions des surcharges correspondant aux moments extrêmes', 7);
    const voies = f61.nv, vv = f61.v;
    const qA = l => (2.3 + 360 / (l + 12));
    for (let j = 0; j < nSp; j++) {
      h2(`Travée ${j + 1}`);
      const rows = [];
      for (const r of sectionRows(deck, j).filter(r => r.fr > 0 && r.fr < 1 || r.fr === 1 && j < nSp - 1)) {
        const s = r.idx, il = bm.ILM[s];
        const zA = bm.spanwiseEnvelope(il, l => qA(l) * vv * voies);
        const fmtZ = zs => zs.map(z => `${F2(z.x1)}–${F2(z.x2)}`).join(' ; ');
        const tr = bm.trainEnvelope(il, BC.axlesOneTruck, { nVeh: 2, pitch: BC.pitchMin });
        const bt = bm.axleEnvelope(il, BT.axles);
        const mc = bm.stripTrainEnvelope(il, 1, MC120.trackLength, { pitch: MC120.trackLength + MC120.gapMin });
        const BcGov = Mtot(deck, f61.Bc, s, 'max') >= Mtot(deck, f61.Bt, s, 'max');
        const posB = BcGov ? `Bc ${tr.dirMax > 0 ? 'GD' : 'DG'} ${(tr.posMax || []).filter(x => x > bm.xMin - 17 && x < bm.xMax + 17).map(F2).join(' ; ')}` : `Bt ${bt.dirMax > 0 ? 'GD' : 'DG'} ${F2(bt.xmax)}`;
        rows.push([`${F2(r.fr)} L`, F2(r.x), `max : ${fmtZ(zA.zonesMax)} (l = ${F2(zA.zonesMax.reduce((a, z) => a + z.x2 - z.x1, 0))} m)`, posB, `Mc120 ${(mc.posMax || []).filter(x => x > bm.xMin - 7 && x < bm.xMax).map(F2).join(' ; ')}`]);
        const trn = BcGov ? tr : null;
        rows.push(['', '', `min : ${fmtZ(zA.zonesMin)} (l = ${F2(zA.zonesMin.reduce((a, z) => a + z.x2 - z.x1, 0))} m)`, trn ? `Bc ${tr.dirMin > 0 ? 'GD' : 'DG'} ${(tr.posMin || []).filter(x => x > bm.xMin - 17 && x < bm.xMax + 17).map(F2).join(' ; ')}` : `Bt ${bt.dirMin > 0 ? 'GD' : 'DG'} ${F2(bt.xmin)}`, `Mc120 ${(mc.posMin || []).filter(x => x > bm.xMin - 7 && x < bm.xMax).map(F2).join(' ; ')}`]);
      }
      table(['Section', 'x [m]', 'Surcharge A : zones chargées [m]', 'Surcharge B : sens, abscisses des camions / du tandem [m]', 'Char : abscisses de début des engins [m]'], rows, { small: true, pairs: true });
    }
    comment('A(l) : zones de même signe de la ligne d\'influence (travées, parties de travées, abouts), longueur chargée l = somme des zones. Bc : abscisse du premier essieu de chaque camion (deux camions par file à espacement libre, pas ≥ 10,50 m) ; GD / DG : sens de marche. Mc120 : convoi d\'engins à espacement libre (distance libre ≥ 30,50 m). Abscisses depuis l\'appui 1.');
  }

  // ---------------------------------------------------------------------------------------------------------- 8
  h1('Efforts tranchants sur appuis (largeur totale) [kN]', isF ? 8 : 7);
  const Kof = res => (res ? deck.transverseFactors(res).K : null);
  const KV = isF ? { A: Kof(f61.A), Bc: Kof(f61.Bc), Bt: Kof(f61.Bt), Mc: Kof(f61.Mc120), T: Kof(f61.trottoir) } : { TS: Kof(ec.TS), UDL: Kof(ec.UDL) };
  const vRows = [];
  for (let j = 0; j < nSp; j++) for (const [fr, lab] of [[0, 'côté gauche'], [1, 'côté droit']]) {
    const s = bm.sectionIndex(j, fr), vG = fr === 0 ? perm.Vp[s] : perm.Vm[s];
    const pick = (res, K) => (res ? (K[s] || 1) * Math.max(Math.abs(res.Vmax[s]), Math.abs(res.Vmin[s])) : 0);
    if (isF) {
      const A = pick(f61.A, KV.A), Bv = Math.max(pick(f61.Bc, KV.Bc), pick(f61.Bt, KV.Bt)), C = pick(f61.Mc120, KV.Mc), Tr = pick(f61.trottoir, KV.T);
      const elu = 1.35 * Math.abs(vG) + Math.max(1.6 * Math.max(A, Bv), 1.35 * C) + 1.6 * Tr;
      vRows.push([`Travée ${j + 1} ${lab}`, F1(vG), F1(A), F1(Bv), F1(C), F1(Tr), F1(elu)]);
    } else {
      const ts = pick(ec.TS, KV.TS), udl = pick(ec.UDL, KV.UDL);
      vRows.push([`Travée ${j + 1} ${lab}`, F1(vG), F1(ts), F1(udl), F1(Math.abs(dz.beam.V.ELUmax[s]) > Math.abs(dz.beam.V.ELUmin[s]) ? dz.beam.V.ELUmax[s] : dz.beam.V.ELUmin[s])]);
    }
  }
  if (isF) table(['Section', 'Charge perm.', 'A', 'B', 'C.E.', 'Trottoirs', 'ELU (valeur absolue)'], vRows);
  else table(['Section', 'Perm.', 'TS (×K)', 'UDL (×K)', 'ELU poutre'], vRows);
  if (dz.shear) para(`Vérification de l'effort tranchant (dalle sans armatures d'effort tranchant si possible) : rapport maximal ${F2(Math.max(...dz.shear.map(v => v.ratio || v.VEd / v.VRdc || 0)))} (≤ 1 : pas d'armatures transversales nécessaires).`);
  figs(DF.V);

  // ---------------------------------------------------------------------------------------------------------- 9
  h1('Réactions d\'appui pour la largeur totale [kN]', isF ? 9 : 8);
  if (isF) {
    table(['Appui', 'Perm. max / min', 'A max', 'Bc max (δ)', 'Bt max (δ)', 'Mc120 max (δ)', 'Trottoirs', 'δ_B appui', 'ELS max', 'ELU max'], bm.ILR.map((_, i) => {
      const gx = perm.Rmax[i], gn = perm.Rmin[i];
      const A = f61.A.Rmax[i], Bc = f61.Bc.Rmax[i], Bt = f61.Bt ? f61.Bt.Rmax[i] : 0, Mc = f61.Mc120.Rmax[i], Tr = f61.trottoir.Rmax[i];
      const els = gx + Math.max(1.2 * Math.max(A, Bc, Bt), Mc) + Tr, elu = 1.35 * gx + Math.max(1.6 * Math.max(A, Bc, Bt), 1.35 * Mc) + 1.6 * Tr;
      return [`Appui ${i + 1}`, `${F1(gx)} / ${F1(gn)}`, F1(A), F1(Bc), F1(Bt), F1(Mc), F1(Tr), F3(f61.Bc.deltaR ? f61.Bc.deltaR[i] : 1), F1(els), F1(elu)];
    }));
    comment('Réactions de la largeur totale, sans coefficient de répartition ; δ des appuis intermédiaires : max des deux travées ; culées : ½[δ + max(δ ; 1,5)] (B) et ½[δ + max(δ ; 1,2)] (Mc120). Les réactions par appareil d\'appui (inégalité de répartition) sont au chapitre des appareils d\'appui.');
  } else table(['Appui', 'Perm. max / min', 'TS max', 'UDL max', 'LM1 max', 'ELS car. max / min', 'ELU max'], bm.ILR.map((_, i) => [`Appui ${i + 1}`, `${F1(perm.Rmax[i])} / ${F1(perm.Rmin[i])}`, F1(ec.TS.Rmax[i]), F1(ec.UDL.Rmax[i]), F1(ec.LM1.Rmax[i]), `${F1(dz.beam.R.CARmax[i])} / ${F1(dz.beam.R.CARmin[i])}`, F1(dz.beam.R.ELUmax[i])]));
  if (DF.R.length) figs(DF.R); else fig('R');

  // ---------------------------------------------------------------------------------------------------------- 10
  h1('Flexion transversale', isF ? 10 : 9);
  const tz = isF ? st.transDesign.F61 : st.transDesign.EC, tr = isF ? (st.transF || st.trans) : st.trans;
  comment(isF ? `Dalle isostatique équivalente de portée L_eq, bords libres, séries de Fourier ; ${psi < 100 ? 'dalle droite équivalente au biais mécanique (largeur 2b/sin φ, portée L_eq·sin φ) ; ' : ''}charges locales diffusées jusqu'au feuillet moyen ; trottoirs à 4,5 kN/m² ; ${st.transELU ? 'ELU avec ν = 0 (fissuration peu nuisible), ELS avec ν = ' + deck.nu : 'ν = ' + deck.nu} ; moments dans la direction des aciers transversaux par l'annexe 12A (biais).` : `Dalle isostatique équivalente (CHAMOA) : portée L_eq, bords libres, ν = ${deck.nu}, séries de Fourier, charges diffusées jusqu'au feuillet moyen ; moments dans la direction des aciers par l'annexe 12A du BPEL si biais.`);
  for (const sp of tz.spans) {
    const t = tr.spans[sp.j];
    h2(`Travée ${sp.j + 1} (L_eq = ${F2(t.L)} m) — moments m_y [kN·m/m]`);
    const cols = isF ? [['C.P.', t.perm], ['A', t.f61.A], ['Bc', t.f61.Bc], ['Bt', t.f61.Bt], ['Mc120', t.f61.Mc120], ['Trottoirs', t.f61.trottoir]]
      : [['Perm.', t.perm], ['TS', t.ec.TS], ['UDL', t.ec.UDL], ['LM2', t.ec.gr1b], ['gr3', t.ec.gr3]];
    const rows = [];
    tr.ys.forEach((y, iy) => {
      rows.push([F2(y), ...cols.map(([, r]) => (r ? F1(r.myMax[iy]) : '—')), F1(isF ? sp.comb.ELSmax[iy] : sp.comb.CARmax[iy]), F1(sp.comb.ELUmax[iy])]);
      rows.push(['', ...cols.map(([, r]) => (r ? F1(r.myMin[iy]) : '—')), F1(isF ? sp.comb.ELSmin[iy] : sp.comb.CARmin[iy]), F1(sp.comb.ELUmin[iy])]);
    });
    table(['Fibre y [m]', ...cols.map(c => c[0]), isF ? 'ELS' : 'ELS car.', 'ELU'], rows, { small: true, pairs: true });
    para(`Aciers transversaux retenus : inférieurs ${CM(sp.bot.As)} cm²/m (flexion ${CM(sp.bot.flex || 0)}, minimum du guide 1989 ${CM(sp.bot.minGuide || 0)}, répartition ${CM(sp.bot.nonSec || 0)}), supérieurs ${CM(sp.top.As)} cm²/m${sp.skew ? ` ; biais : M_APF max ${F1(sp.skew.max.ELU ? sp.skew.max.ELU.M : 0)} kN·m/m (ELU)` : ''}.`);
  }
  fig('my');

  // ---------------------------------------------------------------------------------------------------------- 11
  h1('Ferraillage longitudinal', isF ? 11 : 10);
  const lr = [];
  for (let j = 0; j < nSp; j++) for (const r of sectionRows(deck, j).filter(r => [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1].includes(r.fr))) lr.push([`Travée ${j + 1} ${F2(r.fr)} L`, F2(r.x), CM(dz.envBot[r.idx]), CM(dz.envTop[r.idx]), F0(dz.envBot[r.idx] * 2 * deck.b * 1e4), F0(dz.envTop[r.idx] * 2 * deck.b * 1e4)]);
  table(['Section', 'x [m]', 'A_s inf [cm²/m]', 'A_s sup [cm²/m]', 'A_s inf largeur totale [cm²]', 'A_s sup largeur totale [cm²]'], lr, { small: true });
  comment(isF ? 'Flexion simple BAEL 91 (A.4.3 à l\'ELU, A.4.5 à l\'ELS), fibre par fibre ; minimum de non-fragilité et sections minimales de dalle. La largeur totale est indicative (le ferraillage suit la répartition m_x(y)).' : 'Flexion EC2 (ELU, ELS caractéristique σ_s ≤ 0,8 f_yk et σ_c ≤ 0,6 f_ck, ouverture des fissures en quasi-permanent), minimum § 9.2.1.1 et 7.3.2.');
  if (DF.As.length) figs(DF.As); else fig('As');
  figs(DF.rebar);

  // ---------------------------------------------------------------------------------------------------------- 12
  h1('Appareils d\'appui et chevêtres incorporés', isF ? 12 : 11);
  if (bearings) {
    const k = bearings.ineq;
    if (k) para(`Coefficients d'inégalité de répartition de la réaction entre appareils d'une même ligne (PSI-DA 68 § 2.4.2, note PSIDP.EL p. 52) : charge permanente ${F3(k.CP)}, A / UDL ${F3(k.A)}, B / TS ${F3(k.B)}${k.Mc ? `, Mc120 ${F3(k.Mc)}` : ''} ; entraxe × sin ψ = ${F2(k.e)} m.`);
    table(['Ligne', 'R max / min [kN]', 'P max appareil [kN]', 'u_g [mm]', 'α [mrad]', 'Appareil (a×b×n(t+ts))', 'σ / σ_lim [MPa]', 'u_g/T ; total'], bearings.rows.map(r => [`${r.i === 0 || r.i === bearings.rows.length - 1 ? 'Culée' : 'Pile'} ${r.i + 1}`, `${F0(r.Rmax)} / ${F0(r.Rmin)}`, F0(r.Pmax), F1(r.ug * 1000), F1(r.alpha * 1000), r.sel ? r.sel.label : 'hors gamme standard', r.sel ? `${F1(r.sel.sig)} / ${F1(r.sel.sigLim)}` : '—', r.sel ? `${F2(r.sel.dist1)} ; ${F2(r.sel.dist2)}` : '—']));
    comment(`Élastomère fretté, règles du bulletin technique n° 4 (guide SETRA 1989 § 3.6) : σ ≤ min(15 MPa ; G·ab/(t(a + b))), u_g/T ≤ 0,5, u_g/T + H/(G₂ab) ≤ 0,7, T ≤ a/5, t·T ≥ α a²/3 ; ${bearings.nb} appareils par ligne ; freinage ${F0(bearings.H)} kN ; rotations sous charges permanentes (module différé) et sous trafic (lignes d'influence de rotation).`);
  }
  if (chevetres) {
    table(['Ligne', 'd [m]', 'ζ TS / UDL', 'R rive / centre ELU [kN]', 'm_c⁻ / m_e⁻ / m_e⁺ [kN·m/m]', 'Sup. ① / ② / ③ [cm²/m]', 'Inf. ①\' / ②\' [cm²/m]'], chevetres.map(r => [`${r.i === 0 || r.i === chevetres.length - 1 ? 'Culée' : 'Pile'} ${r.i + 1}`, F2(r.d), r.zetas.map(F2).join(' / '), `${F0(r.R1)} / ${F0(r.R2)}`, `${F0(r.mc)} / ${F0(r.me_neg)} / ${F0(r.me_pos)}`, r.bands.top.map(b => CM(b.As)).join(' / '), r.bands.bot.map(b => CM(b.As)).join(' / ')]));
    comment('Annexe 4 du guide PSIDP-EL : charges de type 1 (réparties) et de type 2 (proches de la ligne d\'appui, part ζ), réactions des appareils de rive et central, moments du chevêtre par poutre continue sur les appareils et moments locaux m_c⁻ = M_c⁻/(1,5 c), m_e = 1,5 M_e/e ; bandes ① 2/3·max(c, a, e), ② max(2c, a, e), ③ 2·max(a, e, c) ; ELU 1,35 G + 1,35 LM1.');
  }

  // ---------------------------------------------------------------------------------------------------------- 13
  if (rebar && rebar.marks) {
    h1('Nomenclature des aciers', isF ? 13 : 12);
    table(['Repère', 'Désignation', 'φ [mm]', 'Espacement [m]', 'Longueur unitaire [m]', 'Nombre', 'Masse [kg]'], rebar.marks.map(m => [String(m.mark), m.label, String(m.phi), m.s ? F2(m.s) : '—', F2(m.len), String(m.count), F0(m.mass)]), { small: true });
    para(`Masse totale d'aciers : ${F0(rebar.totalMass)} kg pour ${F1(rebar.volume)} m³ de béton, soit ${F0(rebar.ratio)} kg/m³.`);
  }

  // ---------------------------------------------------------------------------------------------------------- 14
  let chap = isF ? 14 : 13;
  if (st.supports) {
    h1('Appuis et fondations', chap++);
    for (const b of supportsBlocks(st.supports, ref, { noWater: true })) B.push(b);
    const wb = waterBlocks(st.supports, ref);
    if (wb.length) { h1('Piles en rivière — courant, embâcles, affouillement', chap++); for (const b of wb) if (!(b.t === 'h2' && /^Piles en rivière/.test(b.text))) B.push(b); }
    h1('Calcul sismique — EN 1998-2 (Pont EC8)', chap++);
    for (const b of seismicBlocks(st.supports.sp.seisme.actif ? st.supports.seisme : null)) B.push(b);
  }
  // ------------------------------------------------------------------------------------------------- dispositifs de retenue
  if (st.ddr) {
    h1('Dispositifs de retenue — indice de danger (Cerema 2021)', chap++);
    for (const b of ddrBlocks(st.ddr)) B.push(b);
  }

  h1('Références');
  for (const r of [
    'SETRA, Ponts-dalles — Guide de conception, juillet 1989.',
    'SETRA, PSI-DA 68 — Méthode de calcul (calcul automatique), 1968-1973.',
    'SETRA, Programme PSIDA.EL — Note de calcul commentée (version 84-1), 1984 (réimpr. 1990).',
    'SETRA, Ponts-dalles précontraints d\'inertie constante — Programme PSIDP.EL, notice et note de calcul modèle, annexes 1 à 6, 1985.',
    'Cerema, CHAMOA-P PSIDA — Guide technique, 2023.',
    'Fascicule 61 titre II (1971, mod. 1981) ; BAEL 91 révisé 99 ; NF EN 1990/A1, NF EN 1991-2, NF EN 1992-1-1 et 1992-2 et annexes nationales.',
    ...(st.supports ? ['SETRA, PP73 — Appuis des tabliers (piles, palées, culées), 1973-1977 ; SETRA, FOND 72 — Fondations courantes d\'ouvrages d\'art.',
      'Fascicule 62 titre V (1993) ; NF P 94-261 (2013) et guide Cerema « Eurocode 7 — fondations superficielles » (2015) ; NF P 94-262 (2012).',
      'Note de calcul des appuis et fondations du Pont de Noé (COMETE/ICI, A.P.D. mai 2012, programme PSH) — valeurs de contrôle.'] : []),
  ]) para(r);
  return { title, meta, blocks: B };
}

// ============================================================================================================ HTML
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** KaTeX (web/vendor/katex) pour les formules de la note sismique ; base = origine du site (la note s'ouvre en blob:). */
export const katexHead = (base = '') => (base ? `<link rel="stylesheet" href="${base}/web/vendor/katex/katex.min.css"><script defer src="${base}/web/vendor/katex/katex.min.js"></script>
<script>addEventListener('DOMContentLoaded',()=>{if(!window.katex)return;for(const el of document.querySelectorAll('.math[data-tex]'))try{katex.render(el.dataset.tex,el,{displayMode:true,throwOnError:false})}catch(e){}})</script>` : '');

export function noteToHTML(note, { base = (typeof location !== 'undefined' && /^https?:/.test(location.origin) ? location.origin + location.pathname.replace(/\/[^/]*$/, '') : '') } = {}) {
  let h = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(note.title)}</title><style>
 body{font:11.5px/1.45 "Courier New",ui-monospace,monospace;color:#111;margin:0;padding:24px 32px;max-width:1150px}
 .hdr{font-family:system-ui,sans-serif;border:2px solid #111;padding:10px 14px;margin-bottom:16px}
 .hdr h1{font-size:17px;margin:0 0 4px} .hdr .m{font-size:12px;color:#333}
 h2{font:bold 13.5px system-ui,sans-serif;margin:24px 0 8px;padding:4px 8px;background:#e9ecf1;border-left:4px solid #111;page-break-after:avoid}
 h3{font:bold 12.5px system-ui,sans-serif;margin:14px 0 6px}
 table{border-collapse:collapse;margin:4px 0 10px;width:100%;page-break-inside:auto} th,td{border:1px solid #999;padding:2px 5px;text-align:right;white-space:nowrap}
 th{background:#f3f4f6;font-family:system-ui,sans-serif;font-size:11px} td:first-child,th:first-child{text-align:left} table.small td,table.small th{font-size:10.5px}
 tr.pair2 td{border-top:0} tr.pair1 td{border-bottom:0}
 .comment{font:italic 11.5px/1.45 Georgia,serif;border:1px solid #888;border-left:4px solid #888;background:#fbfbf8;padding:6px 10px;margin:6px 0 12px}
 .comment:before{content:"Commentaire — ";font-weight:bold;font-style:normal}
 p{font-family:system-ui,sans-serif;margin:6px 0} figure{margin:8px 0;page-break-inside:avoid} figure img{width:100%;border:1px solid #ccc} figcaption{font:10.5px system-ui;text-align:center;color:#444}
 h4{font:bold 11.5px system-ui,sans-serif;margin:10px 0 3px} .ref{font-size:10px;color:#555} .math{margin:3px 0 3px 12px;font-family:"Times New Roman",serif;font-size:13px;overflow-x:auto}
 @media print{body{padding:0} .noprint{display:none} h2{page-break-before:auto}}
</style>${katexHead(base)}</head><body><div class="noprint" style="margin-bottom:10px"><button onclick="window.print()">Imprimer / PDF</button></div>
<div class="hdr"><h1>${esc(note.title)}</h1><div class="m">${esc(note.meta)}</div></div>`;
  for (const b of note.blocks) {
    if (b.t === 'h1') h += `<h2>${esc(b.text)}</h2>`;
    else if (b.t === 'h2') h += `<h3>${esc(b.text)}</h3>`;
    else if (b.t === 'p') h += `<p>${esc(b.text)}</p>`;
    else if (b.t === 'h3') h += `<h4>${esc(b.text)}</h4>`;
    else if (b.t === 'ref') h += `<p class="ref">${esc(b.text)}</p>`;
    else if (b.t === 'math') h += `<div class="math" data-tex="${esc(b.tex).replace(/"/g, '&quot;')}">${esc(texToText(b.tex))}</div>`;
    else if (b.t === 'comment') h += `<div class="comment">${esc(b.text)}</div>`;
    else if (b.t === 'img') h += `<figure><img src="${b.dataUrl}" alt=""><figcaption>${esc(b.caption || '')}</figcaption></figure>`;
    else if (b.t === 'svg') h += `<figure style="max-width:760px">${b.svg}<figcaption>${esc(b.caption || '')}</figcaption></figure>`;
    else if (b.t === 'table') {
      h += `<table class="${b.small ? 'small' : ''}"><thead><tr>${b.head.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
      b.rows.forEach((r, i) => { h += `<tr class="${b.pairs ? (i % 2 ? 'pair2' : 'pair1') : ''}">${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`; });
      h += '</tbody></table>';
    }
  }
  return h + '</body></html>';
}

// ============================================================================================================ DOCX
/**
 * Document Word (.docx) de la note : titres, paragraphes, commentaires encadrés, tableaux et figures (PNG).
 * @param {object} note  modèle de buildNote
 * @param {object} docx  module de la bibliothèque docx (import dynamique de ./vendor/docx.js)
 * @returns {Promise<Blob|Buffer>}
 */
export async function noteToDocx(note, docx, { asBuffer = false } = {}) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, BorderStyle, ImageRun, PageOrientation, ShadingType, Header, Footer, PageNumber } = docx;
  const kids = [];
  const run = (text, o = {}) => new TextRun({ text, font: o.font || 'Arial', size: o.size || 18, bold: o.bold, italics: o.italics, color: o.color });
  kids.push(new Paragraph({ children: [run(note.title, { bold: true, size: 28 })], spacing: { after: 80 } }));
  kids.push(new Paragraph({ children: [run(note.meta, { size: 18, color: '444444' })], spacing: { after: 240 } }));
  for (const b of note.blocks) {
    if (b.t === 'h1') kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(b.text, { bold: true, size: 24 })], spacing: { before: 240, after: 120 } }));
    else if (b.t === 'h2') kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(b.text, { bold: true, size: 20 })], spacing: { before: 160, after: 80 } }));
    else if (b.t === 'p') kids.push(new Paragraph({ children: [run(b.text)], spacing: { after: 80 } }));
    else if (b.t === 'h3') kids.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(b.text, { bold: true, size: 18 })], spacing: { before: 120, after: 40 } }));
    else if (b.t === 'ref') kids.push(new Paragraph({ children: [run(b.text, { size: 15, color: '555555' })], spacing: { after: 60 } }));
    else if (b.t === 'math') kids.push(new Paragraph({ children: [run(texToText(b.tex), { font: 'Cambria Math', size: 19, italics: true })], indent: { left: 360 }, spacing: { after: 40 } }));
    else if (b.t === 'comment') kids.push(new Paragraph({ children: [run('Commentaire — ', { bold: true, size: 17 }), run(b.text, { italics: true, size: 17 })], border: { left: { style: BorderStyle.SINGLE, size: 18, color: '888888', space: 6 } }, shading: { type: ShadingType.CLEAR, fill: 'F7F7F2', color: 'auto' }, spacing: { before: 60, after: 160 }, indent: { left: 120 } }));
    else if (b.t === 'img' && b.dataUrl) {
      const bin = b.dataUrl.split(',')[1];
      const data = typeof atob === 'function' ? Uint8Array.from(atob(bin), c => c.charCodeAt(0)) : Buffer.from(bin, 'base64');
      const w = 640, hh = Math.round(w * (b.h || 440) / (b.w || 1100));
      kids.push(new Paragraph({ children: [new ImageRun({ type: 'png', data, transformation: { width: w, height: hh } })], alignment: AlignmentType.CENTER }));
      if (b.caption) kids.push(new Paragraph({ children: [run(b.caption, { size: 16, color: '555555' })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
    } else if (b.t === 'table') {
      const sz = b.small ? 13 : 15;
      const cell = (text, head) => new TableCell({ children: [new Paragraph({ children: [run(String(text), { size: sz, bold: head })], alignment: head ? AlignmentType.CENTER : AlignmentType.RIGHT })], shading: head ? { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' } : undefined, margins: { top: 20, bottom: 20, left: 50, right: 50 } });
      const rows = [new TableRow({ tableHeader: true, children: b.head.map(c => cell(c, true)) }), ...b.rows.map(r => new TableRow({ children: r.map(c => cell(c, false)) }))];
      kids.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      kids.push(new Paragraph({ children: [], spacing: { after: 80 } }));
    }
  }
  const doc = new Document({
    creator: 'PSIDA', title: note.title,
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [run(note.title, { size: 14, color: '666666' })], alignment: AlignmentType.RIGHT })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [run('Page ', { size: 14 }), new TextRun({ children: [PageNumber.CURRENT], size: 14, font: 'Arial' })], alignment: AlignmentType.CENTER })] }) },
      children: kids,
    }],
  });
  return asBuffer ? Packer.toBuffer(doc) : Packer.toBlob(doc);
}
