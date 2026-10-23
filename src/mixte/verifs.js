/**
 * Pont mixte bipoutre / quadripoutre : vérifications de la structure achevée (NF EN 1994-2, NF EN 1993-2, NF EN 1993-1-5).
 *
 * Actions : permanentes et effets différés du calcul par phases (src/mixte/bipoutre.js, retrait hyperstatique compris),
 * trafic LM1 et trottoirs, écart thermique ±10 K, FLM3 (src/mixte/trafic.js). Combinaisons EN 1990 A2 :
 *   ELU  1,35 G + 1,35 (LM1 + trottoirs) + 1,5 × 0,6 T ;   ELS caractéristique G + Q + 0,6 T.
 * Vérifications, à chaque section du modèle :
 *  - classe de la section (EN 1993-1-1 tableau 5.2 ; semelle connectée en classe 1) ;
 *  - classes 1 et 2 : M_Ed ≤ M_pl,Rd (EN 1994-2 § 6.2.1.2) ; classes 3 et 4 : somme des contraintes par phase ≤ f_y/γ_M0,
 *    l'âme comprimée de classe 4 étant réduite à sa largeur efficace (EN 1993-1-5 § 4.4 : k_σ(ψ), λ̄_p, ρ ; répartition
 *    0,4 / 0,6 de la largeur efficace) ;
 *  - effort tranchant : V_pl,a,Rd = η h_w t_w f_y/(√3 γ_M0) et voilement par cisaillement V_bw,Rd = χ_w f_y h_w t_w/(√3 γ_M1)
 *    (EN 1993-1-5 § 5.2–5.3, montant d'extrémité non rigide, raidisseurs verticaux à l'entraxe a, contribution des
 *    semelles négligée) ; interaction M-V (§ 7.1) ;
 *  - déversement de la semelle inférieure comprimée sur appui : semelle + ⅓ de l'âme comprimée en poteau sur appuis
 *    élastiques continus (EN 1993-2 § 6.3.4.2 (6)), raideur des berceaux C_d (annexe D.2.4 : montants I_v, entretoises I_q),
 *    N_crit d'Engesser, courbe c ou d (EN 1993-1-1 § 6.3.1) ;
 *  - ELS caractéristique : σ_a ≤ f_y (EN 1994-2 § 7.2.2), σ_c ≤ 0,6 f_ck, armatures ≤ 0,8 f_sk avec raidissement en
 *    traction (§ 7.4.3) ; armatures minimales sur appui (§ 7.4.2) ;
 *  - connexion : goujons (§ 6.6.3.1), flux élastique sur section non fissurée (§ 6.6.2.1), espacement ELU et ELS
 *    (k_s = 0,75, § 6.8.1 (3)), dispositions § 6.6.5 ;
 *  - fatigue (simplifiée) : FLM3, λ = λ₁ λ₂ (EN 1993-2 § 9.5.2, λ₃ = λ₄ = 1), semelle inférieure catégorie 80 (soudures des
 *    raidisseurs), goujons Δτ_c = 90 MPa, m = 8 (EN 1994-2 § 6.8.6.2 : λ_v = 1,55 λ_v,2) ; γ_Mf = 1,35 / 1,0.
 * Unités : m, kN, kN·m, MPa.
 */
import { couches, proprietes, equivalence, momentPlastique, classeSection } from './section.js';
import { PoutreContinue, enveloppe, chargesPoutre, FLM3, repartition } from './trafic.js';
import { resultante } from '../phasage/phasage.js';
import { contraintesMixtes } from './bipoutre.js';
import { EC_ALPHA, lm1 } from '../loads_ec.js';

const EA = 210000;

/** Section de calcul d'une zone : PRS, dalle de largeur efficace, armatures (60 % en nappe supérieure). */
function sectionZone(p, zoneAppui, beff, As) {
  const g = zoneAppui ? p.appui : p.travee;
  return { ...g, hg: p.hg, hc: p.hc, nuance: p.nuance, beff, Asup: 0.6 * As, Ainf: 0.4 * As, fck: p.fck, fsk: 500, csup: 0.06, cinf: 0.06 };
}

/** Âme efficace (EN 1993-1-5 § 4.4) sous la répartition élastique de la section brute ; renvoie les caractéristiques. */
export function sectionEfficace(G, signe, type, n) {
  const P = proprietes(G, type, n), C = couches(G), aw = C.acier[1], tw = G.tw, hw = aw.y1 - aw.y0, eps = Math.sqrt(235 / aw.fy);
  // compression positive : au-dessus de l'axe neutre en moment positif, au-dessous en moment négatif
  const c = y => (signe > 0 ? y - P.yG : P.yG - y), c0 = c(aw.y0), c1 = c(aw.y1), cmax = Math.max(c0, c1);
  if (cmax <= 0) return { ...P, rho: 1, trou: 0, classe4: false };
  const psi = Math.min(c0, c1) / cmax;
  const k = psi > 0 ? 8.2 / (1.05 + psi) : psi > -1 ? 7.81 - 6.29 * psi + 9.78 * psi * psi : 5.98 * (1 - psi) ** 2;
  const lam = hw / tw / (28.4 * eps * Math.sqrt(k)), lim = 0.5 + Math.sqrt(0.085 - 0.055 * psi);
  const rho = lam <= lim ? 1 : Math.min(1, (lam - 0.055 * (3 + psi)) / (lam * lam));
  if (rho >= 1) return { ...P, rho: 1, trou: 0, classe4: false, psi, k, lam };
  const bc = psi < 0 ? hw / (1 - psi) : hw, beff = rho * bc, be1 = psi < 0 ? 0.4 * beff : 2 * beff / (5 - psi), be2 = beff - be1;
  // trou : de be1 (depuis le bord comprimé) à bc − be2
  const bordComp = c1 >= c0 ? aw.y1 : aw.y0, dir = c1 >= c0 ? -1 : 1, ya = bordComp + dir * be1, yb = bordComp + dir * (bc - be2);
  const h = Math.abs(yb - ya), yh = (ya + yb) / 2, A2 = P.A - tw * h, yG2 = (P.A * P.yG - tw * h * yh) / A2;
  const I2 = P.I + P.A * (P.yG - yG2) ** 2 - (tw * h ** 3 / 12 + tw * h * (yh - yG2) ** 2);
  return { A: A2, yG: yG2, I: I2, rho, trou: h, classe4: true, psi, k, lam, brut: P, ht: C.ht, ha: C.ha };
}

/** Voilement par cisaillement (EN 1993-1-5 § 5) : V_bw,Rd et V_pl,a,Rd (kN). */
export function cisaillement(g, fyw, a, { gM0 = 1.0, gM1 = 1.1, eta = 1.2 } = {}) {
  const hw = g.hw, tw = g.tw, eps = Math.sqrt(235 / fyw), Vpl = eta * hw * tw * fyw / Math.sqrt(3) / gM0 * 1000;
  if (hw / tw <= 72 * eps / eta) return { Vpl, Vb: Vpl, chi: eta, lam: 0, voilement: false };
  const kt = a / hw >= 1 ? 5.34 + 4 * (hw / a) ** 2 : 4 + 5.34 * (hw / a) ** 2;
  const lam = hw / (37.4 * tw * eps * Math.sqrt(kt)), chi = lam < 0.83 / eta ? eta : 0.83 / lam;
  return { Vpl, Vb: Math.min(chi * fyw * hw * tw / Math.sqrt(3) / gM1 * 1000, Vpl), chi, lam, kt, voilement: true };
}

/** Courbe de flambement (EN 1993-1-1 § 6.3.1.2) : χ pour λ̄ et le facteur d'imperfection α. */
const chiFlambement = (lam, alpha) => { if (lam <= 0.2) return 1; const ph = 0.5 * (1 + alpha * (lam - 0.2) + lam * lam); return Math.min(1, 1 / (ph + Math.sqrt(ph * ph - lam * lam))); };

/**
 * Vérifications. M = résultat de computeMixte ({ p, modele, reperes, r }) ; o = { chaussee {y1,y2}, trottoirs [],
 * alpha (EC_ALPHA), dT (10 K), ac (entraxe des entretoises, m), a (entraxe des raidisseurs verticaux), goujons { d, h, n,
 * fu }, Nobs (poids lourds par an et par voie lente) }.
 */
export function verifierMixte(M, o = {}) {
  const { p, modele, reperes: R, r } = M, nT = p.L.length, nb = R.nb;
  const larg = p.largeur, ch = o.chaussee || { y1: -(larg / 2 - 1.0), y2: larg / 2 - 1.0 }, trott = o.trottoirs || [];
  const dT = o.dT ?? 10, ac = o.ac ?? 7.5, aRaid = o.a ?? ac, gj = { d: 0.022, h: 0.2, n: 3, fu: 450, ...(o.goujons || {}) };
  const Iq = o.Iq ?? 9.21e-4, Iv = o.Iv ?? 1.5e-4, Nobs = o.Nobs ?? 0.5e6;
  const n0 = equivalence(betonEcm(p.fck), 0).n0;
  // ---- poutre continue de calcul des actions variables (4 sous-éléments par barre du modèle)
  const xsC = modele.noeuds.map(q => q[0]), xs = [], EI = [], zoneEl = [];
  const sec = []; // section de chaque barre du modèle
  for (let e = 0; e < xsC.length - 1; e++) {
    const inf = R.info[2 * e], G = sectionZone(p, inf.zoneAppui, inf.beff, inf.As), fiss = !!inf.fiss;
    const P = proprietes(G, fiss ? 'fissuree' : 'mixte', n0);
    sec.push({ G, P, fiss, zoneAppui: inf.zoneAppui, beff: inf.beff, As: inf.As });
    for (let q = 0; q < 4; q++) { xs.push(xsC[e] + (xsC[e + 1] - xsC[e]) * q / 4); EI.push(EA * 1000 * P.I); zoneEl.push(e); }
  }
  xs.push(xsC[xsC.length - 1]);
  const PC = new PoutreContinue(xs, EI, R.x0);
  const ys = Array.from({ length: p.nPoutres }, (_, k) => -(p.nPoutres - 1) * p.entraxe / 2 + k * p.entraxe), kP = p.nPoutres - 1;
  const CH = chargesPoutre(ys, kP, ch, trott, { alpha: o.alpha || EC_ALPHA.recommended });
  const TS = [{ d: 0, P: CH.Q }, { d: 1.2, P: CH.Q }], qTot = CH.q + CH.qTrott;
  // ---- écart thermique : courbure imposée dans les zones non fissurées (dalle plus chaude : courbure négative)
  const therm = sgn => {
    const kap = zoneEl.map(e => { const s = sec[e]; if (s.fiss) return 0; const C = couches(s.G), yc = C.dalle.y0 + p.hc / 2, Ac = s.beff * p.hc, N = 1e-5 * dT * EA * 1000 * Ac / n0; return -sgn * N * (yc - s.P.yG) / (EA * 1000 * s.P.I); });
    return PC.momentsCourbure(kap);
  };
  const MTp = therm(1), MTm = therm(-1);
  const atX = (arr, x) => { const i = xs.findIndex(v => Math.abs(v - x) < 1e-6); return arr[i]; };
  // ---- permanentes : pas de mise en service (après superstructures) et fin de calcul
  const iSup = modele.phases.length - 1, pS = r.pas[r.pas.findIndex(q => q.phase === iSup)], pF = r.final, pAv = r.pas[r.finPhase[iSup - 1]];
  const fy = s => Math.min(...couches(s.G).acier.map(c => c.fy)), fyFl = (s, inf) => couches(s.G).acier[inf ? 0 : 2].fy;
  const sections = [], verifs = [];
  for (let i = 0; i < xsC.length; i++) {
    const x = xsC[i], e = Math.max(0, i - 1), xi = i === 0 ? 0 : 1, Lb = xsC[e + 1] - xsC[e], S = sec[e], G = S.G;
    const ia = R.iAcier[e], id = R.iDalle[e];
    const MG = pas => resultante(pas, [ia, id], xi * Lb).M, VG = pas => { const b1 = pas.barres[ia], b2 = pas.barres[id]; return (b1 ? (xi ? b1.Vj : b1.Vi) : 0) + (b2 ? (xi ? b2.Vj : b2.Vi) : 0); };
    const MGS = MG(pS), MGF = MG(pF), Mg = [MGS, MGF], VGF = Math.abs(VG(pF)), dVsup = Math.abs(VG(pF) - VG(pAv));
    const eM = enveloppe(xs, PC.ligneM(x), { q: qTot, essieux: TS });
    const eV = [enveloppe(xs, PC.ligneV(x, 'd'), { q: qTot, essieux: TS }), enveloppe(xs, PC.ligneV(x, 'g'), { q: qTot, essieux: TS })];
    const VQ = Math.max(...eV.flatMap(v => [Math.abs(v.max), Math.abs(v.min)]));
    const MT = [atX(MTp, x), atX(MTm, x)];
    // ELU : moments extrêmes
    const MEdMax = Math.max(...Mg.map(m => 1.35 * m)) + 1.35 * eM.max + 0.9 * Math.max(...MT, 0);
    const MEdMin = Math.min(...Mg.map(m => 1.35 * m)) + 1.35 * eM.min + 0.9 * Math.min(...MT, 0);
    const signe = Math.abs(MEdMin) > Math.abs(MEdMax) ? -1 : 1, MEd = signe > 0 ? MEdMax : MEdMin;
    const cl = classeSection(G, signe, n0), Mpl = momentPlastique(G, signe).M;
    // contraintes par phase (permanentes) aux fibres de l'acier, puis trafic et thermique sur la section de la zone
    const sigG = [contraintesMixtes(pS, modele, R, { ia, id, xi }), contraintesMixtes(pF, modele, R, { ia, id, xi })];
    const C = couches(G), P = S.P;
    const sQ = (Mq, y, beton = false) => Mq * (P.yG - y) / P.I / 1000 * (beton ? 1 / n0 : 1);   // traction positive (MPa), M positif tend le bas
    const yInf = 0, ySup = C.ha, yDal = C.ht, yReb = C.armatures[0].y;
    // thermique : primaire (auto-équilibré, zones non fissurées) + hyperstatique
    const sT = (sgn, y, zone) => {
      const Mh = sgn > 0 ? MT[0] : MT[1];
      let s = sQ(Mh, y, zone === 'dalle');
      if (!S.fiss) { const yc = C.dalle.y0 + p.hc / 2, Ac = S.beff * p.hc, N = 1e-5 * dT * EA * 1000 * Ac / n0 * sgn; s += (N / P.A + (-N * (yc - P.yG)) * (P.yG - y) / P.I * -1) / 1000 * (zone === 'dalle' ? 1 / n0 : 1); if (zone === 'dalle') s -= sgn * 1e-5 * dT * EA / n0; }
      return s;
    };
    const fibresAcier = [['semelle inf.', yInf, 'inf'], ['semelle sup.', ySup, 'sup']];
    // ELU classes 3-4 et ELS : contraintes de l'acier
    const eff = cl.classe >= 4 ? sectionEfficace(G, signe, S.fiss ? 'fissuree' : 'mixte', n0) : null;
    const kEff = (y) => (eff && eff.classe4 ? (eff.brut.I / Math.abs(y - eff.brut.yG)) / (eff.I / Math.abs(y - eff.yG)) : 1);
    let sEluMax = 0, sElsMax = 0, fibEl = '';
    for (const [nom, y, k] of fibresAcier) {
      for (const [sg, eQ] of [[1, eM.max], [-1, eM.min]]) {
        const sGv = sigG.map(sg2 => sg2.acier ? sg2.acier[k] : 0), sQv = sQ(eQ, y), sTv = Math.max(Math.abs(sT(1, y, 'acier')), Math.abs(sT(-1, y, 'acier')));
        const sElu = (Math.max(...sGv.map(Math.abs)) * 1.35 + Math.abs(1.35 * sQv)) * kEff(y) + 0.9 * sTv;
        const sEls = Math.max(...sGv.map(v => Math.abs(v + sQv))) + 0.6 * sTv;
        if (sElu > sEluMax) { sEluMax = sElu; fibEl = nom; }
        sElsMax = Math.max(sElsMax, sEls);
      }
    }
    // dalle et armatures (ELS caractéristique)
    let sDal = null, sReb = null;
    if (!S.fiss) { const sGd = sigG.map(q => (q.dalle && q.dalle.sup !== undefined ? q.dalle.sup : 0)); sDal = Math.min(...sGd) + sQ(eM.max, yDal, true) + 0.6 * Math.min(sT(1, yDal, 'dalle'), sT(-1, yDal, 'dalle')); }
    else {
      const sGr = sigG.map(q => (q.dalle && q.dalle.armatures !== undefined ? q.dalle.armatures : 0)), rho = S.As / (S.beff * p.hc);
      const fctm = 0.3 * p.fck ** (2 / 3), Pm = proprietes(G, 'mixte', n0), ast = (Pm.A * Pm.I) / (P.A * P.I);
      sReb = Math.max(...sGr) + sQ(eM.min, yReb) + 0.6 * Math.max(Math.abs(sT(1, yReb)), Math.abs(sT(-1, yReb))) + 0.4 * fctm / (ast * rho);
    }
    // effort tranchant et interaction
    const VEd = 1.35 * VGF + 1.35 * VQ, Vr = cisaillement(G, couches(G).acier[1].fy, aRaid), eta3 = VEd / Vr.Vb;
    let interaction = null;
    if (eta3 > 0.5) {
      const fyf = fyFl(S, true), Af1 = G.bfi * G.tfi * fyf, Af2 = G.bfs * G.tfs * fyFl(S, false) + (signe < 0 ? (G.Asup + G.Ainf) * 435 : 0), hf = C.ha - G.tfi / 2 - G.tfs / 2;
      const Mf = Math.min(Af1, Af2) * hf * 1000, eta1 = Math.abs(MEd) / Mpl;
      interaction = { eta1, eta3, Mf, val: eta1 + (1 - Mf / Mpl) * (2 * eta3 - 1) ** 2 };
    }
    // déversement de la semelle inférieure comprimée (moment négatif) : poteau sur appuis élastiques (berceaux en U)
    let deversement = null;
    if (MEdMin < 0) {
      const Pf = proprietes(G, 'fissuree', n0), hwc = Math.max(0, Math.min(G.hw, Pf.yG - G.tfi)), Af = G.bfi * G.tfi + hwc / 3 * G.tw;
      const Iz = G.tfi * G.bfi ** 3 / 12 + hwc / 3 * G.tw ** 3 / 12, f = fyFl(S, true), Ek = EA * 1000;
      const hv = G.hw, Cd = Ek * Iv / (hv * hv * (hv / 3 + p.entraxe * Iv / (2 * Iq))), c = Cd / ac;
      // longueur entre appuis latéraux rigides : la plus longue des travées adjacentes à la zone comprimée
      const jS = Math.max(0, Math.min(nT - 1, R.x0.findIndex((x0, j) => x <= R.x0[j + 1] + 1e-9)));
      const Lsp = Math.max(p.L[jS], p.L[Math.min(nT - 1, jS + 1)], p.L[Math.max(0, jS - 1)]);
      const NE = Math.PI ** 2 * Ek * Iz / (Lsp * Lsp), Ncr = Lsp >= Math.PI * (Ek * Iz / c) ** 0.25 ? 2 * Math.sqrt(c * Ek * Iz) : NE + c * Lsp * Lsp / Math.PI ** 2;
      const lam = Math.sqrt(Af * f * 1000 / Ncr), alpha = G.tfi > 0.04 ? 0.76 : 0.49, chi = chiFlambement(lam, alpha);
      const sInf = Math.abs(Math.min(...sigG.map(q => (q.acier ? q.acier.inf : 0))) * 1.35 + 1.35 * sQ(eM.min, 0) * kEff(0)) + 0.9 * Math.max(Math.abs(sT(1, 0)), Math.abs(sT(-1, 0)));
      deversement = { lam, chi, Cd, Ncr, sigma: sInf, lim: chi * f / 1.1, ok: sInf <= chi * f / 1.1 };
    }
    // connexion : flux de cisaillement (section non fissurée n₀), V après connexion
    const Pn = proprietes(G, 'mixte', n0), yc = C.dalle.y0 + p.hc / 2, Sc = S.beff * p.hc / n0 * (yc - Pn.yG);
    const vElu = (1.35 * dVsup + 1.35 * VQ) * Sc / Pn.I, vEls = (dVsup + VQ) * Sc / Pn.I;
    // étendues de fatigue (FLM3 dans l'axe de la voie lente), λ = λ₁ λ₂ ≤ 2,0 (EN 1993-2 § 9.5.2)
    const jS2 = Math.max(0, Math.min(nT - 1, R.x0.findIndex((x0, j) => x <= R.x0[j + 1] + 1e-9))), Ls = p.L[jS2];
    const lam1 = S.zoneAppui ? (Ls <= 30 ? 2.0 - 0.3 * (Ls - 10) / 20 : 1.70 + 0.5 * (Math.min(Ls, 80) - 30) / 50) : 2.55 - 0.7 * (Math.min(Math.max(Ls, 10), 80) - 10) / 70;
    const lamF = Math.min(lam1 * 445 / 480 * (Nobs / 0.5e6) ** 0.2, 2.0), fl = FLM3.map(q => ({ d: q.d, P: q.P * CH.fatigue }));
    const EF = enveloppe(xs, PC.ligneM(x), { essieux: fl }), dSigF = (EF.max - EF.min) * P.yG / P.I / 1000;
    const dVF = Math.max(...['d', 'g'].map(cote => { const ev = enveloppe(xs, PC.ligneV(x, cote), { essieux: fl }); return ev.max - ev.min; }));
    const fatigue = { lam: lamF, dSig: dSigF, dSigE: lamF * dSigF, dvL: dVF * Sc / Pn.I, ok: lamF * dSigF <= 80 / 1.35 };
    sections.push({ x, i, zoneAppui: S.zoneAppui, fiss: S.fiss, MGS, MGF, MQmax: eM.max, MQmin: eM.min, MT, MEdMax, MEdMin, MEd, signe, classe: cl.classe, Mpl,
      eff, sEluMax, fibEl, sElsMax, fy: fy(S), sDal, sReb, VGF, VQ, VEd, Vr, interaction, deversement, vElu, vEls, dVsup, fatigue });
  }
  // ---- goujons
  const fckP = p.fck, Ecm = betonEcm(fckP), d = gj.d, alpha = gj.h / d >= 4 ? 1 : 0.2 * (gj.h / d + 1);
  const PRd = Math.min(0.8 * gj.fu * Math.PI * d * d / 4 / 1.25, 0.29 * alpha * d * d * Math.sqrt(fckP * Ecm) / 1.25) * 1e6 / 1000;   // kN
  const sMax = Math.min(4 * p.hc, 0.8), sMin = 5 * d;
  // espacement des rangées : ELU, ELS caractéristique (0,75 P_Rd) et fatigue des goujons (Δτ_E2 = 1,55 λ_v,2 Δτ ≤ 90 MPa)
  const Agj = Math.PI * d * d / 4, lamV = 1.55 * 445 / 480 * (Nobs / 0.5e6) ** (1 / 8);
  const connexion = sections.map(s => {
    const sE = gj.n * PRd / Math.max(s.vElu, 1e-9), sS = gj.n * 0.75 * PRd / Math.max(s.vEls, 1e-9), sF = 90 * gj.n * Agj * 1000 / Math.max(lamV * s.fatigue.dvL, 1e-9);
    const sr = Math.min(sE, sS, sF, sMax); return { x: s.x, vElu: s.vElu, vEls: s.vEls, sELU: sE, sELS: sS, sFat: sF, s: sr, ok: sr >= sMin, dTauE: lamV * s.fatigue.dvL * sr / (gj.n * Agj) / 1000 };
  });
  const fat = sections.map((q, k) => ({ x: q.x, ...q.fatigue, dTauE: connexion[k].dTauE }));
  // ---- armatures minimales sur appui (EN 1994-2 § 7.4.2)
  const sA = sec.find(s => s.fiss) || sec[0], Pa = proprietes(sA.G, 'mixte', n0), z0 = couches(sA.G).dalle.y0 + p.hc / 2 - Pa.yG;
  const kc = Math.min(1, 1 / (1 + p.hc / (2 * z0)) + 0.3), fctm = 0.3 * p.fck ** (2 / 3), AsMin = 0.9 * kc * 0.8 * fctm * p.hc / 280;   // m²/m, σ_s = 280 MPa (φ 16, w_k 0,3)
  const armMin = { kc, AsMin, AsReel: p.rhoAppui * p.hc, ok: p.rhoAppui * p.hc >= AsMin };
  // ---- réactions d'appui par ligne (tablier entier : n poutres) pour l'onglet Appuis
  // trafic du tablier entier : voies chargées à plein (coefficient 1), tandems TS et UDL (EN 1991-2 tableau 4.2)
  const wCh = ch.y2 - ch.y1, nlT = CH.nl, wl = CH.wl, LMd = lm1(nlT, o.alpha || EC_ALPHA.recommended);
  const QT = LMd.lanes.reduce((a2, ln) => a2 + ln.Q, 0), qT = LMd.lanes.reduce((a2, ln) => a2 + ln.q * wl, 0) + LMd.qr * Math.max(wCh - nlT * wl, 0);
  const wTr = trott.reduce((a2, t) => a2 + (t.y2 - t.y1), 0);
  const reactions = R.x0.map((x, j) => {
    const RG = Math.abs(r.final.reactions ? (r.final.reactions[3 * (j * nb) + 1] ?? 0) : 0);
    const eR = enveloppe(xs, PC.ligneR(j), { q: 1, essieux: [{ d: 0, P: 1 }, { d: 1.2, P: 1 }] });
    const infTS = eR.max - eR.pos, infUDL = eR.pos;
    return { j, G: RG * p.nPoutres, infTS, infUDL, TS: QT * infTS, UDL: qT * infUDL, trott: 3 * wTr * infUDL };
  });
  // ---- synthèse des vérifications (section la plus défavorable de chaque critère)
  const pire = (sel, f) => { const L = sections.filter(sel); return L.length ? L.reduce((a, b) => (f(b) > f(a) ? b : a)) : null; };
  const add = (nom, val, lim, ok, ref, x) => verifs.push({ nom, val, lim, ok, ref, x });
  let w = pire(s => s.classe <= 2, s => Math.abs(s.MEd) / s.Mpl); if (w) add(`ELU flexion, classe ${w.classe} : M_Ed / M_pl,Rd`, Math.abs(w.MEd), w.Mpl, Math.abs(w.MEd) <= w.Mpl, 'EN 1994-2 § 6.2.1.2', w.x);
  w = pire(s => s.classe >= 3, s => s.sEluMax / s.fy); if (w) add(`ELU flexion, classe ${w.classe}${w.eff && w.eff.classe4 ? ` (âme efficace ρ = ${w.eff.rho.toFixed(2)})` : ''} : σ ${w.fibEl}`, w.sEluMax, w.fy, w.sEluMax <= w.fy, 'EN 1994-2 § 6.2.1.5 ; EN 1993-1-5 § 4.4', w.x);
  w = pire(() => true, s => s.VEd / s.Vr.Vb); add(`ELU effort tranchant${w.Vr.voilement ? ' (voilement, χ_w = ' + w.Vr.chi.toFixed(2) + ')' : ''}`, w.VEd, w.Vr.Vb, w.VEd <= w.Vr.Vb, 'EN 1993-1-5 § 5.2 et 5.3', w.x);
  w = pire(s => s.interaction, s => s.interaction.val); if (w) add('Interaction M-V : η̄₁ + (1 − M_f/M_pl)(2η̄₃ − 1)²', w.interaction.val, 1, w.interaction.val <= 1, 'EN 1993-1-5 § 7.1', w.x);
  w = pire(s => s.deversement, s => s.deversement.sigma / s.deversement.lim); if (w) add(`Déversement de la semelle inférieure (berceaux tous les ${ac} m, χ = ${w.deversement.chi.toFixed(2)})`, w.deversement.sigma, w.deversement.lim, w.deversement.ok, 'EN 1993-2 § 6.3.4.2 ; annexe D.2.4', w.x);
  w = pire(() => true, s => s.sElsMax / s.fy); add('ELS caractéristique : contrainte de l\'acier', w.sElsMax, w.fy, w.sElsMax <= w.fy, 'EN 1994-2 § 7.2.2', w.x);
  w = pire(s => s.sDal !== null, s => -s.sDal); if (w) add('ELS caractéristique : compression de la dalle', w.sDal, -0.6 * p.fck, w.sDal >= -0.6 * p.fck, 'EN 1992-1-1 § 7.2 (2)', w.x);
  w = pire(s => s.sReb !== null, s => s.sReb); if (w) add('ELS caractéristique : armatures sur appui (raidissement en traction)', w.sReb, 400, w.sReb <= 400, 'EN 1994-2 § 7.4.3 ; 0,8 f_sk', w.x);
  add('Armatures minimales de la dalle sur appui [cm²/m]', armMin.AsReel * 1e4, armMin.AsMin * 1e4, armMin.ok, 'EN 1994-2 § 7.4.2 (σ_s = 280 MPa)', R.x0[1] ?? 0);
  const wc = connexion.reduce((a, b) => (b.s < a.s ? b : a)); add(`Connexion : espacement des rangées de ${gj.n} goujons Ø${(d * 1000).toFixed(0)} [m]`, wc.s, sMin, wc.ok, 'EN 1994-2 § 6.6.3.1, 6.8.1 (3), 6.6.5', wc.x);
  const wf = fat.reduce((a, b) => (b.dSigE > a.dSigE ? b : a)); add('Fatigue : semelle inférieure (cat. 80, γ_Mf = 1,35) Δσ_E2', wf.dSigE, 80 / 1.35, wf.ok, 'EN 1993-2 § 9.5.2 (λ₁ λ₂) ; EN 1993-1-9', wf.x);
  const wg = fat.reduce((a, b) => (b.dTauE > a.dTauE ? b : a)); add('Fatigue : goujons Δτ_E2 (espacement retenu)', wg.dTauE, 90, wg.dTauE <= 90 + 1e-6, 'EN 1994-2 § 6.8.6.2 (λ_v = 1,55 λ_v,2)', wg.x);
  return { CH, ys, kP, n0, sections, verifs, connexion, fat, armMin, PRd, goujons: gj, reactions, xs, PC, ac, aRaid, dT, Iq, Iv, Nobs, ok: verifs.every(v => v.ok) };
}

function betonEcm(fck) { return 22000 * ((fck + 8) / 10) ** 0.3; }
