/**
 * Pont mixte : vérification de la charpente pendant le bétonnage de la dalle (phases du calcul par plots).
 *
 * À la fin de chaque phase « Bétonnage du plot … » (béton frais porté par la structure existante : charpente seule et plots
 * déjà durcis) et sous la charpente seule :
 *  - actions : résultats du calcul par phases (poids de la charpente, béton frais, plots durcis collaborants) et charges de
 *    chantier q_c sur le plot coulé (EN 1991-1-6 § 4.11.2, tableau 4.2 : Q_ca + Q_cb hors zone de travail, 1 kN/m²
 *    retenu par défaut), calculées sur la charpente seule (poutre continue d'inertie variable) ;
 *  - combinaison ELU de construction : 1,35 G + 1,5 q_c (EN 1990 A2, EN 1991-1-6 § 3) ;
 *  - résistance des sections de la charpente : |σ| ≤ f_y/γ_M0 (EN 1993-1-1 § 6.2.1) ;
 *  - déversement de la semelle comprimée là où la dalle n'a pas encore durci (semelle supérieure en travée, inférieure
 *    sur appui) : semelle + ⅓ de l'âme comprimée en poteau sur appuis élastiques, raideur des cadres formés par les
 *    entretoises et les montants (EN 1993-2 § 6.3.4.2 ; annexe D.2.4), même modèle que pour l'ouvrage en service ;
 *  - instabilité d'ensemble du système bipoutre avant durcissement de la dalle (déversement global du couple de poutres
 *    entretoisées, peu sensible aux entretoises) : M_gs = C_b π² s E √(I_eff I_x) / L² (Yura, Helwig, Herman, Zhou, ASCE
 *    J. Struct. Eng. 134(9), 2008), critère d'alerte Σ M_u ≤ 0,7 M_gs (AASHTO LRFD, art. 6.10.3.4.2 ; C_b = 1, L = portée).
 * Unités : m, kN, kN·m, MPa (traction positive).
 */
import { couches, proprietes, fyEpaisseur } from './section.js';
import { PoutreContinue } from './trafic.js';
import { resultante } from '../phasage/phasage.js';

const EA = 210000;
const chi = (lam, a) => { if (lam <= 0.2) return 1; const ph = 0.5 * (1 + a * (lam - 0.2) + lam * lam); return Math.min(1, 1 / (ph + Math.sqrt(ph * ph - lam * lam))); };

/** Déversement d'une semelle comprimée (poteau sur appuis élastiques continus) : χ, N_cr, λ̄. */
export function deversementSemelle(g, cote, { Lsp, ac, Iv, Iq, entraxe, nuance = 'S355' }) {
  const P = proprietes(g, 'acier'), C = couches(g);
  const sup = cote === 'sup', b = sup ? g.bfs : g.bfi, t = sup ? g.tfs : g.tfi;
  const hwc = Math.max(0, Math.min(g.hw, sup ? C.acier[1].y1 - P.yG : P.yG - g.tfi));
  const Af = b * t + hwc / 3 * g.tw, Iz = t * b ** 3 / 12 + hwc / 3 * g.tw ** 3 / 12, f = fyEpaisseur(nuance, t * 1000), Ek = EA * 1000;
  const hv = g.hw, Cd = Ek * Iv / (hv * hv * (hv / 3 + entraxe * Iv / (2 * Iq))), c = Cd / ac;
  const NE = Math.PI ** 2 * Ek * Iz / (Lsp * Lsp), Ncr = Lsp >= Math.PI * (Ek * Iz / c) ** 0.25 ? 2 * Math.sqrt(c * Ek * Iz) : NE + c * Lsp * Lsp / Math.PI ** 2;
  const lam = Math.sqrt(Af * f * 1000 / Ncr), k = chi(lam, t > 0.04 ? 0.76 : 0.49);
  return { Af, Iz, Cd, Ncr, lam, chi: k, fy: f, lim: k * f / 1.1 };
}

/** Moment de déversement global de deux poutres entretoisées (Yura et al. 2008), par portée L (kN·m, système). */
export function momentGlobal(g, s, L, Cb = 1) {
  const P = proprietes(g, 'acier'), C = couches(g);
  const Iyc = g.tfs * g.bfs ** 3 / 12, Iyt = g.tfi * g.bfi ** 3 / 12;
  const c = C.ha - g.tfs / 2 - P.yG, t = P.yG - g.tfi / 2, Ieff = Iyc + (t / c) * Iyt;   // semelle supérieure comprimée (travée)
  return { Mgs: Cb * Math.PI ** 2 * s * EA * 1000 * Math.sqrt(Ieff * P.I) / (L * L), Ieff, Ix: P.I };
}

/**
 * M = résultat de computeMixte ({ p, modele, reperes, r }) ; o = { ac, Iv, Iq, qc (kN/m²) }.
 * Renvoie { etapes, verifs, ok } ; chaque vérification porte le préfixe « Bétonnage ».
 */
export function verifierBetonnage(M, o = {}) {
  const { p, modele, reperes: R, r } = M, nb = R.nb, nT = p.L.length, qc = o.qc ?? 1.0;
  const ac = o.ac ?? 6, Iv = o.Iv ?? 4e-4, Iq = o.Iq ?? 1.8e-3, part = R.TR.part, np = p.nPoutres;
  // charpente seule : poutre continue d'inertie variable pour les charges de chantier
  const xs = modele.noeuds.map(q => q[0]), EI = R.iAcier.map(k => EA * 1000 * modele.barres[k].I), PC = new PoutreContinue(xs, EI, R.x0);
  const geo = j => (R.info[2 * j].zoneAppui ? R.gA : R.gT);
  const iPh = [0, ...modele.phases.map((ph, i) => (/^Bétonnage/.test(ph.nom) ? i : -1)).filter(i => i >= 0)];
  const etapes = [], pires = { res: null, dev: null, glob: null };
  const garde = (cle, v) => { if (!pires[cle] || v.taux > pires[cle].taux) pires[cle] = v; };
  for (const i of iPh) {
    const ph = modele.phases[i], pas = r.pas[r.finPhase[i]];
    // barres d'acier du plot coulé : charges de chantier q_c × largeur reprise par la poutre
    const plot = new Set((i ? ph.charges : []).map(c => c.barre));
    const elems = R.iAcier.map((k, j) => (plot.has(k) ? j : -1)).filter(j => j >= 0);
    const Mqc = j => {   // moment au milieu de l'élément j sous q_c sur les éléments du plot (intégrale de la ligne d'influence)
      if (!elems.length) return 0;
      const x = (xs[j] + xs[j + 1]) / 2, eta = PC.ligneM(x);
      return elems.reduce((s, e) => s + qc * part * (eta[e] + eta[e + 1]) / 2 * (xs[e + 1] - xs[e]), 0);
    };
    let et = { nom: ph.nom, t: ph.t, sMin: 0, sMax: 0, globale: [] };
    const Mspan = Array(nT).fill(0), durci = Array(nT).fill(true);
    R.iAcier.forEach((k, j) => {
      const ra = pas.barres[k]; if (!ra) return;
      const b = modele.barres[k], f = R.fibres[k], Lb = xs[j + 1] - xs[j], Mg = ra.M(Lb / 2), Ng = ra.N;
      const mq = Mqc(j), g = geo(j);
      const sG = { sup: (Ng / b.A - Mg * f.vs / b.I) / 1000, inf: (Ng / b.A + Mg * f.vi / b.I) / 1000 };
      // q_c sur la charpente seule (moment de la poutre continue acier) : σ = M v / I de la section d'acier de l'élément
      const sQ = { sup: -mq * f.vs / b.I / 1000, inf: mq * f.vi / b.I / 1000 };
      const sEd = { sup: 1.35 * sG.sup + 1.5 * sQ.sup, inf: 1.35 * sG.inf + 1.5 * sQ.inf };
      const fyS = fyEpaisseur(p.nuance, g.tfs * 1000), fyI = fyEpaisseur(p.nuance, g.tfi * 1000), x = (xs[j] + xs[j + 1]) / 2;
      et.sMin = Math.min(et.sMin, sEd.sup, sEd.inf); et.sMax = Math.max(et.sMax, sEd.sup, sEd.inf);
      garde('res', { taux: Math.max(Math.abs(sEd.sup) / fyS, Math.abs(sEd.inf) / fyI), x, phase: ph.nom, sig: Math.abs(sEd.sup) / fyS > Math.abs(sEd.inf) / fyI ? sEd.sup : sEd.inf, fy: Math.abs(sEd.sup) / fyS > Math.abs(sEd.inf) / fyI ? fyS : fyI });
      const dalleOk = !!pas.barres[R.iDalle[j]];
      const s = Math.min(nT - 1, Math.max(0, R.x0.findIndex((x0, q) => x <= R.x0[q + 1] + 1e-9)));
      if (!dalleOk) {
        durci[s] = false;
        for (const cote of ['sup', 'inf']) if (sEd[cote] < 0) {
          const D = deversementSemelle(g, cote, { Lsp: p.L[s], ac, Iv, Iq, entraxe: p.entraxe, nuance: p.nuance });
          garde('dev', { taux: -sEd[cote] / D.lim, x, phase: ph.nom, cote, sig: -sEd[cote], ...D });
        }
      }
      const Mtot = resultante(pas, [k, R.iDalle[j]], Lb / 2).M;
      Mspan[s] = Math.max(Mspan[s], 1.35 * Mtot + 1.5 * mq);
    });
    // déversement d'ensemble (portées dont la dalle n'a pas entièrement durci)
    for (let s = 0; s < nT; s++) if (!durci[s] && Mspan[s] > 0) {
      const G = momentGlobal(R.gT, (np - 1) * p.entraxe, p.L[s]), Mu = np * Mspan[s];
      et.globale.push({ s, Mu, Mgs: G.Mgs });
      garde('glob', { taux: Mu / (0.7 * G.Mgs), s, phase: ph.nom, Mu, Mgs: G.Mgs, x: R.x0[s] + p.L[s] / 2 });
    }
    etapes.push(et);
  }
  const verifs = [], add = (nom, val, lim, ok, ref, x) => verifs.push({ nom, val, lim, ok, ref, x });
  const w = pires.res; add(`Bétonnage : résistance de la charpente (${w.phase})`, Math.abs(w.sig), w.fy, w.taux <= 1, 'EN 1993-1-1 § 6.2.1 ; 1,35 G + 1,5 q_c (EN 1991-1-6 § 4.11)', w.x);
  if (pires.dev) { const d = pires.dev; add(`Bétonnage : déversement de la semelle ${d.cote === 'sup' ? 'supérieure' : 'inférieure'} (${d.phase}, χ = ${d.chi.toFixed(2)})`, d.sig, d.lim, d.taux <= 1, 'EN 1993-2 § 6.3.4.2 ; annexe D.2.4 (cadres d\'entretoisement)', d.x); }
  if (pires.glob) { const g = pires.glob; add(`Bétonnage : déversement d'ensemble des poutres, travée ${g.s + 1} (${g.phase}) [kN·m]`, g.Mu, 0.7 * g.Mgs, g.taux <= 1, 'Yura et al. 2008 ; AASHTO LRFD § 6.10.3.4.2 : Σ M_u ≤ 0,7 M_gs', g.x); }
  return { etapes, verifs, pires, qc, ok: verifs.every(v => v.ok) };
}
