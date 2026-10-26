/**
 * Dimensionnement des poutres : poutre en T en béton armé (ELU, BAEL 91 / EN 1992-1-1) et vérification des contraintes
 * normales d'une poutre précontrainte (section composite poutre + hourdis, précontrainte finale P∞, excentricité e₀),
 * avec la précontrainte minimale de Guyon (diagramme de Magnel). Réactions des lignes d'appui d'un tablier à travées
 * indépendantes (deux travées adjacentes chargées simultanément) pour le module « Appuis et fondations ».
 * Unités : m, kN, kN·m, MPa.
 */
import { BC, MC120, TROTTOIR } from '../loads_f61.js';

/**
 * Armatures inférieures d'une poutre en T à l'ELU (diagramme rectangulaire 0,8x ; BAEL f_bu = 0,85 f_c28/1,5, f_su = f_e/1,15 ;
 * EC2 f_cd = f_ck/1,5, λ = 0,8, η = 1, f_yd = f_yk/1,15) : table de largeur b_eff et d'épaisseur h_f, âme b₀, hauteur utile d.
 */
export function tBeamULS({ M, beff, hf, b0, d, fck = 30, fyk = 500, code = 'EC' }) {
  const fc = code === 'BAEL' ? 0.85 * fck / 1.5 : fck / 1.5, fy = fyk / 1.15;
  const Mt = beff * hf * fc * 1000 * (d - hf / 2);                      // moment repris par la table seule
  let As, mode, x;
  if (M <= Mt) {                                                         // axe neutre dans la table : section rectangulaire b_eff
    const mu = M / (beff * d * d * fc * 1000);
    if (mu > 0.48) return { As: null, mode: 'table insuffisante', Mt };
    const a = 1.25 * (1 - Math.sqrt(1 - 2 * mu)); x = a * d;
    As = M / ((d - 0.4 * x) * fy * 1000); mode = 'axe neutre dans la table';
  } else {
    const Mf = (beff - b0) * hf * fc * 1000 * (d - hf / 2), Mw = M - Mf;  // débords de table + âme
    const mu = Mw / (b0 * d * d * fc * 1000);
    if (mu > 0.48) return { As: null, mode: 'âme insuffisante (aciers comprimés nécessaires)', Mt };
    const a = 1.25 * (1 - Math.sqrt(1 - 2 * mu)); x = a * d;
    As = (Mf / (d - hf / 2) + Mw / (d - 0.4 * x)) / (fy * 1000); mode = 'section en T';
  }
  const Amin = code === 'BAEL' ? 0.23 * b0 * d * (0.6 + 0.06 * fck) / fyk : Math.max(0.26 * 0.3 * fck ** (2 / 3) / fyk, 0.0013) * b0 * d;
  return { As: Math.max(As, Amin), AsCalc: As, Amin, mode, x, Mt };
}

/**
 * Étriers verticaux à l'effort tranchant (NF EN 1992-1-1 § 6.2.3, bielles d'inclinaison variable) : cot θ le plus grand
 * dans [1 ; 2,5] tel que V_Rd,max ≥ V_Ed, A_sw/s = V_Ed/(z f_ywd cot θ), minimum ρ_w,min = 0,08 √f_ck/f_yk (§ 9.2.2 (5)).
 * α_cw selon la contrainte moyenne de compression σ_cp (MPa) ; f_cd = 0,85 f_ck/1,5 (EN 1992-2 § 3.1.6 (101)).
 * V en kN, longueurs en m ; A_sw/s en m²/m.
 */
export function etriersEC2({ VEd, bw, bwNom = bw, z, fck = 30, fyk = 500, scp = 0 }) {
  const fcd = 0.85 * fck / 1.5, nu1 = 0.6 * (1 - fck / 250), fywd = fyk / 1.15;
  const acw = scp <= 0 ? 1 : scp <= 0.25 * fcd ? 1 + scp / fcd : scp <= 0.5 * fcd ? 1.25 : 2.5 * (1 - scp / fcd);
  const VRdmax = cot => acw * bwNom * z * nu1 * fcd * 1000 / (cot + 1 / cot);
  let cot = 2.5; while (cot > 1 && VRdmax(cot) < VEd) cot -= 0.01;
  cot = Math.max(cot, 1);
  const calc = Math.max(VEd, 0) / (z * fywd * 1000 * cot), min = 0.08 * Math.sqrt(fck) / fyk * bw;
  return { cot, VRdmax: VRdmax(cot), AswS: Math.max(calc, min), AswCalc: calc, AswMin: min, acw, ok: VRdmax(cot) >= VEd - 1e-6 };
}

/**
 * Contraintes normales de la poutre précontrainte (section composite) : σ = P/A ± P e v/I ∓ M v/I (compression > 0).
 * Limites : BPEL 91 classe II (σ ≤ 0,6 f_cj ; traction ≥ −f_tj en section d'enrobage sous combinaison rare, 0 sous
 * fréquente) ou EN 1992-1-1 (σ_c ≤ 0,6 f_ck caractéristique, décompression sous quasi-permanente — XC/XD) ; précontrainte
 * minimale (Guyon) P ≥ (M_max v'/I + σ_t)/(1/A + e' v'/I), avec e' = −e₀ > 0 (câble sous le centre de gravité).
 */
export function prestressCheck({ A, I, v, vp, P, e0, Mmin, Mmax, fck = 35, code = 'BPEL' }) {
  const ft = 0.6 + 0.06 * fck, ec = -e0;
  const sig = M => ({ sup: P / A - P * ec * v / I + M * v / I, inf: P / A + P * ec * vp / I - M * vp / I });
  const s0 = sig(Mmin), s1 = sig(Mmax);
  const sigTlim = code === 'BPEL' ? -ft * 1000 : 0, sigClim = 0.6 * fck * 1000;   // kPa
  const Pmin = (Mmax * vp / I + sigTlim) / (1 / A + ec * vp / I);
  return { aVide: s0, enCharge: s1, sigClim, sigTlim, Pmin, ok: Math.min(s0.sup, s1.inf) >= sigTlim - 1e-6 && Math.max(s0.inf, s1.sup) <= sigClim + 1e-6 && P >= Pmin - 1e-6 };
}

/**
 * Réaction maximale d'une ligne d'appui entre deux travées isostatiques L₁ (à gauche) et L₂ : ligne d'influence en
 * triangle (1 sur l'appui, 0 aux appuis voisins) ; convoi d'essieux { d, P } glissant, réaction totale maximale.
 */
export function pierReactionAxles(axles, L1, L2) {
  const il = x => (x < 0 ? (x >= -L1 ? 1 + x / L1 : 0) : (x <= L2 ? 1 - x / L2 : 0));
  const len = Math.max(...axles.map(a => a.d));
  let best = 0;
  // convoi dans les deux sens de circulation, chaque essieu amené sur l'appui
  for (const tr of [axles, axles.map(a => ({ d: len - a.d, P: a.P }))]) {
    for (let x0 = -L1 - len; x0 <= L2; x0 += 0.05) best = Math.max(best, tr.reduce((s, a) => s + a.P * il(x0 + a.d), 0));
    for (const a of tr) best = Math.max(best, tr.reduce((s, b) => s + b.P * il(b.d - a.d), 0));
  }
  return best;
}

/**
 * Réactions caractéristiques par ligne d'appui d'un tablier à travées indépendantes (format « appuis seuls » :
 * G ; G min ; A ; Bc ; Mc120 ; trottoirs ; TS ; UDL) : permanentes = somme des réactions des travées adjacentes ;
 * charges réparties (A, UDL, trottoirs) = somme (sécuritaire pour A(l)) ; convois (Bc, Mc120, TS) = maximum sur la ligne
 * d'influence des deux travées, δ maximal des travées adjacentes.
 */
export function lineReactions(bd) {
  const spans = bd.spans, n = spans.length + 1, S = L => bd.bySpan.get(+L.toFixed(3));
  const end = (j, side, get) => { if (j < 0 || j >= spans.length) return 0; const r = get(S(spans[j])); return r ? r[side === 'L' ? 0 : 1] : 0; };
  const R = (j, side, key) => end(j, side, s => (key === 'G' ? s.perm.Rmax : key === 'Gmin' ? s.perm.Rmin : (s.f61[key] || s.ec[key])?.Rmax));
  const lines = [];
  for (let i = 0; i < n; i++) {
    const L1 = i > 0 ? spans[i - 1] : 0, L2 = i < spans.length ? spans[i] : 0;
    const sum = key => R(i - 1, 'R', key) + R(i, 'L', key);
    const adj = [i - 1, i].filter(j => j >= 0 && j < spans.length).map(j => S(spans[j]));
    const f = adj[0].f61, nf = Math.min(f.nv, BC.bc[f.classe].length), bc = BC.bc[f.classe][nf - 1];
    // δ des réactions d'appui (pratique PSIDA.EL / PONTYPE) : ½[δ + max(δ ; 1,5)] pour B, ½[δ + max(δ ; 1,2)] pour Mc120
    const dEnd = (d, d0) => 0.5 * (d + Math.max(d, d0));
    const dB = dEnd(Math.max(...adj.map(s => s.f61.deltaBc[0])), 1.5), dC = dEnd(Math.max(...adj.map(s => s.f61.deltaMc[0])), 1.2);
    const bcTrain = [...BC.axlesTwoTrucks.map(a => ({ d: a.d, P: a.P * bc * nf }))];
    const Bc = dB * pierReactionAxles(bcTrain, L1 || 1e-6, L2 || 1e-6);
    const mcAxles = Array.from({ length: 11 }, (_, k) => ({ d: k * MC120.trackLength / 10, P: MC120.P / 11 }));
    const Mc = adj[0].f61.Mc120 ? dC * pierReactionAxles(mcAxles, L1 || 1e-6, L2 || 1e-6) : 0;
    const lanes = adj[0].ec.lm1.lanes, Qtot = lanes.reduce((a, l) => a + l.Q, 0);
    const TS = pierReactionAxles([{ d: 0, P: Qtot }, { d: 1.2, P: Qtot }], L1 || 1e-6, L2 || 1e-6);
    lines.push({ G: sum('G'), Gmin: sum('Gmin'), A: sum('A'), Bc, Mc120: Mc, trott: sum('trottoir'), TS, UDL: sum('UDL') });
  }
  return lines;
}

/**
 * Réactions caractéristiques par ligne d'appui d'un pont à poutres sous rail (travées indépendantes), pour mémoire et pour
 * les appuis (transmises aux « appuis seuls », lot 5) : permanentes = somme des réactions des travées adjacentes ; trafic par voie =
 * maximum, sur la ligne d'influence en triangle des deux travées, de LM71 × α (4 essieux de 250α kN à 1,60 m et 80α kN/m
 * hors des 6,40 m du groupe, sur les seules parties défavorables — ici toute la ligne d'influence, positive) et de SW/2
 * (motif rigide 150 kN/m sur 2 × 25 m séparés de 7 m) si la ligne l'exige ; × Φ maximal des travées adjacentes
 * (EN 1991-2 § 6.3.2, 6.3.3, 6.4.5 ; tableau 6.2, cas 6 : appareils d'appui, L_Φ des éléments portés). Les culées et
 * fondations peuvent être calculées sans effets dynamiques (§ 6.4.5.4(2)) : valeurs sans Φ aussi rendues.
 */
export function lineReactionsRail(bd, rail) {
  const spans = bd.spans, n = spans.length + 1, S = L => bd.bySpan.get(+L.toFixed(3));
  const end = (j, side, key) => { if (j < 0 || j >= spans.length) return 0; const r = S(spans[j]).perm[key]; return r ? r[side === 'L' ? 0 : 1] : 0; };
  const alpha = rail.alpha ?? 1, P = 250 * alpha, q = 80 * alpha;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const L1 = i > 0 ? spans[i - 1] : 0, L2 = i < spans.length ? spans[i] : 0;
    // ligne d'influence de la réaction (1 sur l'appui) ; culée d'extrémité : pas de travée d'un côté (L = 0)
    const il = x => (Math.abs(x) < 1e-12 ? 1 : x < 0 ? (L1 > 0 && x >= -L1 ? 1 + x / L1 : 0) : (L2 > 0 && x <= L2 ? 1 - x / L2 : 0));
    const integ = (a, b) => { a = Math.max(a, -L1); b = Math.min(b, L2); if (b <= a) return 0; const m = 400; let s = 0; for (let k = 0; k < m; k++) s += il(a + (b - a) * (k + 0.5) / m); return s * (b - a) / m; };
    const tot = (L1 + L2) / 2;
    // position du groupe d'essieux (abscisse du 1er essieu) : balayage, plus chaque essieu exactement sur l'appui
    const r71 = x0 => [0, 1.6, 3.2, 4.8].reduce((a, d) => a + P * il(x0 + d), 0) + q * (tot - integ(x0 - 0.8, x0 + 5.6));
    let R71 = Math.max(...[0, 1.6, 3.2, 4.8].map(d => r71(-d)));
    for (let x0 = -L1 - 6; x0 <= L2 + 1e-9; x0 += 0.05) R71 = Math.max(R71, r71(x0));
    let RSW2 = 0;
    if (rail.sw2) for (let x0 = -L1 - 57; x0 <= L2 + 1e-9; x0 += 0.1) RSW2 = Math.max(RSW2, 150 * (integ(x0, x0 + 25) + integ(x0 + 32, x0 + 57)));
    const adj = [i - 1, i].filter(j => j >= 0 && j < spans.length).map(j => S(spans[j]));
    const phi = Math.max(...adj.map(s => s.rail.phi)), nV = adj[0].rail.nV;
    lines.push({ G: end(i - 1, 'R', 'Rmax') + end(i, 'L', 'Rmax'), Gmin: end(i - 1, 'R', 'Rmin') + end(i, 'L', 'Rmin'), rail: true,
      phi, nV, LM71: R71, LM71phi: phi * R71, SW2: RSW2, SW2phi: phi * RSW2, Qmax: phi * Math.max(nV * R71, rail.sw2 ? RSW2 + (nV - 1) * R71 : 0),
      A: 0, Bc: 0, Mc120: 0, trott: 0, TS: 0, UDL: 0 });
  }
  return lines;
}
