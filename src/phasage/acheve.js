/**
 * Structure achevée des ponts construits par phases en béton précontraint : poutres préfabriquées rendues continues et
 * ponts en caisson construits par encorbellements (fléaux). Les actions permanentes, la précontrainte et les effets
 * différés viennent du calcul par phases (src/phasage) ; on y ajoute, sur la structure continue :
 *
 *  - trafic LM1 et trottoirs (EN 1991-2 § 4.3) par lignes d'influence d'une poutre continue d'inertie variable
 *    (src/mixte/trafic.js) ; part d'une poutre préfabriquée : coefficients de répartition de Guyon-Massonnet d'une travée
 *    de même portée (src/beams), le tablier en caisson portant toutes les voies ;
 *  - gradient thermique linéaire ΔT_M (EN 1991-1-5 § 6.1.4.1, approche 1, tableau 6.1 : poutres en béton 15 / 8 K, caissons
 *    10 / 5 K), effets hyperstatiques de la courbure α ΔT_M / h ;
 *  - combinaisons EN 1990 A2 (ψ : TS 0,75 / 0,75 / 0, UDL 0,4 / 0,4 / 0, trottoirs 0,4 / 0,4 / 0, T 0,6 / 0,6 / 0,5) ;
 *  - ELS (EN 1992-1-1 § 7.2, EN 1992-2 tableau 7.101N) : compression 0,6 f_ck (caractéristique) et 0,45 f_ck (quasi
 *    permanente), décompression des parties précontraintes (quasi permanente en XC, fréquente en XD), traction ≤ f_ctm sous
 *    fréquente (section non fissurée) ; poutres rendues continues : armatures de continuité du hourdis sur appuis ;
 *  - ELU de flexion : M_Ed = 1,35 M_charges + M_hyperstatique de la précontrainte (γ_P = 1,0) + 1,35 Q + 0,9 T, résistance
 *    par bloc rectangulaire sur les rectangles de la section, câbles avec allongement préalable et palier f_pd, armatures
 *    passives de complément et effort tranchant (§ 6.2.3 : V_pd des câbles inclinés, effet Résal de la membrure inclinée des
 *    caissons de hauteur variable, § 6.2.1 (1)) ;
 *  - réactions d'appui du tablier entier, transmises à l'onglet Appuis.
 * Unités : m, kN, kN·m, MPa (traction positive).
 */
import { PoutreContinue, enveloppe } from '../mixte/trafic.js';
import { resultante, calculPhasage } from './phasage.js';
import { betonEC2 } from './fluage.js';
import { lm1, notionalLanes, EC_ALPHA } from '../loads_ec.js';
import { etriersEC2 } from '../beams/design.js';
import { beamDeck, kTorsion } from '../beams/index.js';

const fcdOf = fck => 0.85 * fck / 1.5;

/** Moment résistant d'une section en rectangles empilés { b, y0, y1, fcd } (y depuis la fibre inférieure), câbles
 *  { Ap, y, epm } et armatures { A, y } ; signe +1 : fibre supérieure comprimée. Renvoie M (kN·m, valeur absolue). */
export function resistanceCouches(couches, cables, arm, signe, { fpd = 1640 / 1.15, Ep = 195000, fyd = 435, ecu = 0.0035 } = {}) {
  const H = Math.max(...couches.map(c => c.y1)), prof = y => (signe > 0 ? H - y : y);   // profondeur depuis la fibre comprimée
  const forces = x => {
    const L = [], a = 0.8 * x;
    for (const c of couches) {
      const z0 = Math.min(prof(c.y0), prof(c.y1)), z1 = Math.max(prof(c.y0), prof(c.y1)), za = Math.max(z0, 0), zb = Math.min(z1, a);
      if (zb > za) L.push({ F: -c.fcd * c.b * (zb - za) * 1000, d: (za + zb) / 2 });
    }
    for (const c of cables) { const d = prof(c.y), e = c.epm + ecu * (d - x) / x; L.push({ F: Math.max(-fpd, Math.min(fpd, Ep * e)) * c.Ap * 1000, d }); }
    for (const s of arm) { const d = prof(s.y), e = ecu * (d - x) / x; L.push({ F: Math.max(-fyd, Math.min(fyd, 200000 * e)) * s.A * 1000, d }); }
    return L;
  };
  const somme = x => forces(x).reduce((s, q) => s + q.F, 0);
  let lo = 1e-4, hi = H * 1.2;
  for (let it = 0; it < 100; it++) { const m = (lo + hi) / 2; if (somme(m) > 0) lo = m; else hi = m; }
  const x = (lo + hi) / 2;
  return { M: Math.abs(forces(x).reduce((s, q) => s + q.F * q.d, 0)), x };
}

/**
 * out = résultat de computePhasage (type 'poutres' ou 'fleau') ; o = { nPoutres, chaussee {y1,y2}, trottoirs [], alpha,
 * expo ('XC' | 'XD'), fyk, cs (enrobage des armatures du hourdis) }.
 */
export function structureAchevee(out, o = {}) {
  const { type, p, modele, reperes: R, r } = out, fleau = type === 'fleau';
  const alpha = o.alpha || EC_ALPHA.recommended, fyk = o.fyk ?? 500, fyd = fyk / 1.15;
  const nd = modele.noeuds, X = i => nd[i][0];
  // ---- éléments de la ligne moyenne : x0, x1, section composée (A, I, c.d.g.), fibres, couches pour l'ELU
  const els = [];
  if (fleau) {
    modele.barres.forEach((b, k) => {
      const x0 = Math.min(X(b.i), X(b.j)), x1 = Math.max(X(b.i), X(b.j)), f = R.fibres[k], h = f.vs + f.vi, xi = Math.min(Math.abs(x0 + x1) / 2 - 0, 0);
      els.push({ k, x0, x1, A: b.A, I: b.I, h, fibres: [['sup', f.vs, true], ['inf', -f.vi, true]], beton: b.beton, xs: [k] });
    });
  } else {
    const fP = p.forme, nH = betonEC2(modele.betons.H).Ecm / betonEC2(modele.betons.P).Ecm;
    R.iP.forEach((kP, q) => {
      const b = modele.barres[kP], bh = modele.barres[R.iH[q]], x0 = X(b.i), x1 = X(b.j);
      const Ac = b.A + nH * bh.A, dG = nH * bh.A * bh.e / Ac, Ic = b.I + nH * bh.I + b.A * dG * dG + nH * bh.A * (bh.e - dG) ** 2;
      const fib = fP ? [['hourdis sup.', bh.e + fP.hd / 2, false], ['poutre sup.', fP.H - fP.yG, true], ['poutre inf.', -fP.yG, true]] : [['poutre sup.', 0.5, true], ['poutre inf.', -0.5, true]];
      els.push({ k: kP, kH: R.iH[q], x0, x1, A: Ac, I: Ic, dG, nH, h: fP ? fP.H + fP.hd : 1, fibres: fib, xs: [kP, R.iH[q]] });
    });
  }
  els.sort((a, b) => a.x0 - b.x0);
  const Ec = betonEC2(fleau ? { fck: p.fck } : modele.betons.P).Ecm * 1000;
  const xs = [], EI = [], elOf = [];
  els.forEach((e, q) => { for (let s = 0; s < 3; s++) { xs.push(e.x0 + (e.x1 - e.x0) * s / 3); EI.push(Ec * e.I); elOf.push(q); } });
  xs.push(els[els.length - 1].x1);
  const appX = fleau ? [0, p.a, 3 * p.a, 4 * p.a] : Array.from({ length: p.n + 1 }, (_, s) => s * p.L);
  const PC = new PoutreContinue(xs, EI, appX);

  // ---- charges de trafic de la poutre étudiée (ou du caisson entier)
  const ch = o.chaussee || { y1: -4, y2: 4 }, w = ch.y2 - ch.y1, NL = notionalLanes(w), L1 = lm1(NL.n, alpha);
  const QT = L1.lanes.reduce((s, l) => s + l.Q, 0), qT = L1.lanes.reduce((s, l) => s + l.q * NL.wl, 0) + L1.qr * Math.max(w - NL.n * NL.wl, 0);
  const wTr = (o.trottoirs || []).reduce((s, t) => s + (t.y2 - t.y1), 0), qFw = 3 * wTr;
  let eta = { TS: 1, UDL: 1, fw: 1 }, nP = 1, guyon = null;
  if (!fleau) {
    nP = Math.max(2, Math.round(o.nPoutres || 4));
    const fP = p.forme;
    const parts = fP ? [{ b: fP.bb, h: fP.hb }, { b: fP.bw, h: fP.H - fP.hb - fP.ht }, { b: fP.bt, h: fP.ht }] : null;
    const K = parts ? parts.reduce((s, q) => s + kTorsion(q.b, q.h), 0) + (fP.bh * fP.hd ** 3) / 6 : 0.05;
    const e0 = els[0], Iguy = e0.I, Aguy = e0.A;
    const bd = beamDeck({ spans: [p.L], n: nP, b1: fP ? fP.bh : 2.5, hd: fP ? fP.hd : 0.25, beam: { A: Aguy, I: Iguy, K, H: e0.h }, roadway: ch, footways: o.trottoirs || [], lines: [], bands: [], alphaEC: o.alphaKey || 'recommended' });
    const S = bd.bySpan.get(+p.L.toFixed(3)), best = S.beams.reduce((a, b2) => ((b2.TS?.eta ?? 0) > (a.TS?.eta ?? 0) ? b2 : a));
    eta = { TS: best.TS.eta, UDL: best.UDL.eta, fw: best.footway ? best.footway.eta : 1 };
    guyon = { theta: S.gp.theta, alpha: S.gp.alpha, k: best.k, y: best.y };
  }
  const Qb = eta.TS * QT / nP, qb = (eta.UDL * qT + eta.fw * qFw) / nP, qTS = [{ d: 0, P: Qb }, { d: 1.2, P: Qb }];
  // ---- gradient thermique linéaire : courbure α ΔT_M / h (dessus plus chaud : courbure négative)
  const dTh = fleau ? [10, 5] : [15, 8];
  const MTh = PC.momentsCourbure(elOf.map(q => -1e-5 * dTh[0] / els[q].h)), MTc = PC.momentsCourbure(elOf.map(q => 1e-5 * dTh[1] / els[q].h));
  const atX = (arr, x) => { let k = 0; while (k < xs.length - 2 && xs[k + 1] < x) k++; const t = Math.min(1, Math.max(0, (x - xs[k]) / (xs[k + 1] - xs[k]))); return arr[k] + (arr[k + 1] - arr[k]) * t; };

  // ---- permanentes : pas après superstructures (mise en service) et fin de calcul
  const iSup = modele.phases.length - 1, pS = r.pas[r.pas.findIndex(q => q.phase === iSup)], pF = r.final;
  // calcul par phases sans précontrainte : moments des seules charges (γ_G = 1,35) ; la différence avec le calcul complet
  // donne les effets hyperstatiques de la précontrainte, pris avec γ_P = 1,0 à l'ELU (EN 1992-1-1 § 2.4.2.2)
  const r0 = calculPhasage({ ...modele, cables: [] }), p0S = r0.pas[r0.pas.findIndex(q => q.phase === iSup)], p0F = r0.final;
  const cablesAt = (pas, el, xi) => {   // câbles traversant l'élément : force, excentrement (ligne des nœuds), pente
    const out2 = [];
    modele.cables.forEach((c, ic) => c.segments.forEach((sg, is) => {
      if (!el.xs.includes(sg.barre)) return;
      const rr = pas.cables.find(q => q && q.cable === ic && q.seg === is); if (!rr) return;
      const b = modele.barres[sg.barre], L = Math.hypot(nd[b.j][0] - nd[b.i][0], nd[b.j][1] - nd[b.i][1]), sens = Math.sign(nd[b.j][0] - nd[b.i][0]) || 1;
      const t = sens > 0 ? xi : 1 - xi, e = sg.ei + (sg.ej - sg.ei) * t;
      out2.push({ N: rr.N, e, pente: (sg.ej - sg.ei) / L, Ap: c.Ap });
    }));
    return out2;
  };
  const fck = fleau ? p.fck : modele.betons.P.fck, fckH = fleau ? p.fck : modele.betons.H.fck, fctm = 0.3 * fck ** (2 / 3);
  const expo = o.expo || 'XC', sections = [];
  els.forEach((el, q) => {
    for (const xi of q === 0 ? [0, 0.5, 1] : [0.5, 1]) {
      const x = el.x0 + (el.x1 - el.x0) * xi;
      const kb = el.k, b = modele.barres[kb], sensB = Math.sign(nd[b.j][0] - nd[b.i][0]) || 1, xb = (sensB > 0 ? xi : 1 - xi) * (el.x1 - el.x0);
      const MGc = pas => resultante(pas, el.xs, xb).M, Vbar = pas => el.xs.reduce((s, k) => { const rb = pas.barres[k]; if (!rb) return s; return s + (rb.Vi + (rb.Vj - rb.Vi) * (sensB > 0 ? xi : 1 - xi)); }, 0);
      // moment du béton (précontrainte comprise, pour les contraintes) et moment extérieur M_béton − Σ N e (charges et
      // effets hyperstatiques de la précontrainte, pour l'ELU où les câbles sont des armatures)
      const MG = [MGc(pS), MGc(pF)];
      const MGext = [pS, pF].map(pas => MGc(pas) - cablesAt(pas, el, xi).reduce((s2, c) => s2 + c.N * c.e, 0));
      const MGch = [MGc(p0S), MGc(p0F)], Mhyp = MGext.map((m, k) => m - MGch[k]);
      const VG = Math.max(Math.abs(Vbar(pS)), Math.abs(Vbar(pF)));
      const eM = enveloppe(xs, PC.ligneM(x), { q: qb, essieux: qTS });
      const eMf = enveloppe(xs, PC.ligneM(x), { q: 0.4 * qb, essieux: qTS.map(a => ({ d: a.d, P: 0.75 * a.P })) });
      const VQ = Math.max(...['d', 'g'].flatMap(c => { const ev = enveloppe(xs, PC.ligneV(x, c), { q: qb, essieux: qTS }); return [Math.abs(ev.max), Math.abs(ev.min)]; }));
      const MT = [atX(MTh, x), atX(MTc, x)];
      // contraintes : permanentes par partie (calcul par phases), variables sur la section composée
      const sigG = pas => {
        const res = {};
        for (const k of el.xs) {
          const rb = pas.barres[k]; if (!rb) continue;
          const f = R.fibres ? R.fibres[k] : null; if (!f) continue;
          const bb = modele.barres[k], xk = xb, M = rb.M(xk), N = rb.N;
          const nom = fleau ? '' : f.partie === 'hourdis' ? 'hourdis' : 'poutre';
          res[fleau ? 'sup' : `${nom} sup.`] = (N / bb.A - M * f.vs / bb.I) / 1000;
          res[fleau ? 'inf' : `${nom} inf.`] = (N / bb.A + M * f.vi / bb.I) / 1000;
        }
        return res;
      };
      const SG = [sigG(pS), sigG(pF)];
      const fib = el.fibres.map(([nom, y, prec]) => {
        const sV = M => -M * (y - el.dG ?? 0) / el.I / 1000 * (nom.startsWith('hourdis') ? el.nH : 1);
        const yy = y - (el.dG || 0), sQ = M => -M * yy / el.I / 1000 * (nom.startsWith('hourdis') ? el.nH : 1);
        const g = SG.map(S => S[nom] ?? 0);
        const cand = (ks, kq, kt) => g.flatMap(gv => [eM.max, eM.min].flatMap(mq => MT.map(mt => gv + kq * sQ(mq) + kt * sQ(mt))));
        const car = [...cand(0, 1, 0.6), ...g.flatMap(gv => MT.flatMap(mt => [eM.max * 0.75, eM.min * 0.75].map(mq => gv + sQ(mt) + sQ(mq))))];
        const freq = [...g.flatMap(gv => [eMf.max, eMf.min].flatMap(mq => MT.map(mt => gv + sQ(mq) + 0.5 * sQ(mt)))), ...g.flatMap(gv => MT.map(mt => gv + 0.6 * sQ(mt)))];
        const qp = g.flatMap(gv => MT.map(mt => gv + 0.5 * sQ(mt)));
        return { nom, prec, car: [Math.min(...car), Math.max(...car)], freq: [Math.min(...freq), Math.max(...freq)], qp: [Math.min(...qp), Math.max(...qp)] };
      });
      sections.push({ x, q, xi, el, MG, MGext, MGch, Mhyp, VG, eM, VQ, MT, fib });
    }
  });

  // ---- ELU de flexion et effort tranchant, armatures de continuité (poutres continues, sur appuis)
  const fpd = 1640 / 1.15, Ep = 195000;
  const elu = sections.map(s => {
    const MG2 = [0, 1].map(k => 1.35 * s.MGch[k] + s.Mhyp[k]), el = s.el, MEdP = Math.max(...MG2) + 1.35 * s.eM.max + 0.9 * Math.max(...s.MT, 0), MEdN = Math.min(...MG2) + 1.35 * s.eM.min + 0.9 * Math.min(...s.MT, 0);
    // section en rectangles (y depuis la fibre inférieure de la section composée) et câbles à t∞
    let couches, ycab, yTop, yRef;
    if (fleau) {
      const K = p.caisson, h = el.h, vsup = el.fibres[0][1];
      const ti = K ? (K.tic + (K.tip - K.tic) * (1 - Math.min(1, Math.abs(((el.x0 + el.x1) / 2) - p.a * (((el.x0 + el.x1) / 2) > 2 * p.a ? 3 : 1)) / p.a)) ** 2) : 0.3;
      couches = K ? [{ b: K.Bi, y0: 0, y1: ti, fcd: fcdOf(fck) }, { b: 2 * K.bw, y0: ti, y1: h - K.ts, fcd: fcdOf(fck) }, { b: K.B, y0: h - K.ts, y1: h, fcd: fcdOf(fck) }] : [{ b: 2, y0: 0, y1: h, fcd: fcdOf(fck) }];
      yRef = h - vsup;   // c.d.g. depuis le bas
    } else {
      const fP = p.forme || { H: 1.4, bt: 0.8, ht: 0.15, bw: 0.2, bb: 0.65, hb: 0.25, bh: 2.5, hd: 0.25, yG: 0.7 };
      couches = [{ b: fP.bb, y0: 0, y1: fP.hb, fcd: fcdOf(fck) }, { b: fP.bw, y0: fP.hb, y1: fP.H - fP.ht, fcd: fcdOf(fck) }, { b: fP.bt, y0: fP.H - fP.ht, y1: fP.H, fcd: fcdOf(fck) }, { b: fP.bh, y0: fP.H, y1: fP.H + fP.hd, fcd: fcdOf(fckH) }];
      yRef = fP.yG;
    }
    const cab = cablesAt(pF, el, s.xi).map(c => ({ Ap: c.Ap, y: yRef + c.e, epm: c.N / c.Ap / 1000 / Ep }));
    const H = Math.max(...couches.map(c => c.y1)), yArm = H - (o.cs ?? 0.05);
    const rP = resistanceCouches(couches, cab, [], 1, { fpd, Ep }), rN = resistanceCouches(couches, cab, [], -1, { fpd, Ep });
    // armatures passives nécessaires en complément des câbles : face supérieure (moment négatif : continuité du hourdis
    // des poutres, hourdis supérieur du caisson) et face inférieure (moment positif)
    const besoin = (signe, Med, y) => { if (Med <= 0 || (signe > 0 ? rP.M : rN.M) >= Med) return 0; let lo = 0, hi = 0.08; for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (resistanceCouches(couches, cab, [{ A: m, y }], signe, { fpd, Ep }).M >= Med) hi = m; else lo = m; } return hi; };
    const AsCont = besoin(-1, -MEdN, yArm), AsInf = besoin(1, MEdP, o.cs ?? 0.05);
    // effort tranchant
    const VEd0 = 1.35 * s.VG + 1.35 * s.VQ, cs2 = cablesAt(pF, el, s.xi), Vpd = Math.abs(cs2.reduce((a, c) => a + c.N * Math.sin(Math.atan(c.pente)), 0));
    const Pn = cs2.reduce((a, c) => a + c.N, 0), z = 0.9 * (H - Math.min(...cab.map(c => Math.min(c.y, H - c.y)), 0.1));
    let VRes = 0;
    if (fleau) { const dh = Math.abs((R.h(Math.min(1, Math.abs(el.x1 - nearestPile(el.x1, p)) / p.a)) - R.h(Math.min(1, Math.abs(el.x0 - nearestPile(el.x0, p)) / p.a))) / (el.x1 - el.x0)); VRes = Math.abs(Math.min(MEdN, 0)) / Math.max(z, 0.5) * dh; }
    const VEd = Math.max(VEd0 - Vpd - VRes, 0), bw = fleau ? 2 * (p.caisson ? p.caisson.bw : 0.4) : (p.forme ? p.forme.bw : 0.2);
    const V = etriersEC2({ VEd, bw, bwNom: bw - 0.5 * 0.08 * (fleau ? 2 : 1), z: Math.max(z, 0.3), fck, fyk, scp: Pn / el.A / 1000 });
    return { x: s.x, MEdP, MEdN, MRdP: rP.M, MRdN: rN.M, AsCont, AsInf, VEd0, Vpd, VRes, VEd, V };
  });

  // ---- synthèse des vérifications ELS / ELU
  const verifs = [], add = (nom, val, lim, ok, ref, x) => verifs.push({ nom, val, lim, ok, ref, x });
  const allFib = sections.flatMap(s => s.fib.map(f => ({ ...f, x: s.x })));
  const wC = allFib.reduce((a, b) => (b.car[0] < a.car[0] ? b : a)); add(`Caractéristique : compression (${wC.nom || 'caisson'})`, wC.car[0], -0.6 * fck, wC.car[0] >= -0.6 * fck, 'EN 1992-2 § 7.2 (102)', wC.x);
  const wQ = allFib.reduce((a, b) => (b.qp[0] < a.qp[0] ? b : a)); add(`Quasi permanente : compression (${wQ.nom || 'caisson'})`, wQ.qp[0], -0.45 * fck, wQ.qp[0] >= -0.45 * fck, 'EN 1992-1-1 § 7.2 (3)', wQ.x);
  const prec = allFib.filter(f => f.prec && (fleau || f.nom === 'poutre inf.')), cle = expo === 'XD' ? 'freq' : 'qp';
  const wD = prec.reduce((a, b) => (b[cle][1] > a[cle][1] ? b : a)); add(`Décompression (${expo === 'XD' ? 'fréquente' : 'quasi permanente'}, ${wD.nom || 'caisson'})`, wD[cle][1], 0, wD[cle][1] <= 1e-6, 'EN 1992-2 tableau 7.101N', wD.x);
  const wF = prec.reduce((a, b) => (b.freq[1] > a.freq[1] ? b : a)); add(`Fréquente : traction (${wF.nom || 'caisson'})`, wF.freq[1], fctm, wF.freq[1] <= fctm, 'σ ≤ f_ctm : non fissuré (sinon § 7.3.4)', wF.x);
  const eP = elu.reduce((a, b) => (b.MEdP / b.MRdP > a.MEdP / a.MRdP ? b : a)); add('ELU flexion, moment positif : M_Ed / M_Rd (câbles seuls)', eP.MEdP, eP.MRdP, true, 'EN 1992-1-1 § 6.1 — complément passif ci-dessous', eP.x);
  const eN = elu.reduce((a, b) => (-b.MEdN / b.MRdN > -a.MEdN / a.MRdN ? b : a)); add('ELU flexion, moment négatif : |M_Ed| / M_Rd (câbles seuls)', -eN.MEdN, eN.MRdN, true, 'EN 1992-1-1 § 6.1 — complément passif ci-dessous', eN.x);
  const aI = elu.reduce((a, b) => (b.AsInf > a.AsInf ? b : a)), aS = elu.reduce((a, b) => (b.AsCont > a.AsCont ? b : a));
  add(`Armatures passives inférieures nécessaires à l'ELU [cm²${fleau ? '' : ' par poutre'}]`, aI.AsInf * 1e4, aI.AsInf * 1e4, true, 'complément des câbles en moment positif', aI.x);
  add(`Armatures passives supérieures nécessaires à l'ELU [cm²${fleau ? '' : ' par poutre, continuité du hourdis'}]`, aS.AsCont * 1e4, aS.AsCont * 1e4, true, 'complément des câbles en moment négatif', aS.x);
  const eV = elu.reduce((a, b) => (b.VEd / b.V.VRdmax > a.VEd / a.V.VRdmax ? b : a)); add(`ELU effort tranchant : V_Ed / V_Rd,max (cot θ = ${eV.V.cot.toFixed(2)})`, eV.VEd, eV.V.VRdmax, eV.V.ok, 'EN 1992-1-1 § 6.2.3', eV.x);
  // ---- réactions d'appui du tablier entier
  const reacG = appX.map(xa => { let s = 0; nd.forEach((n0, i) => { if (Math.abs(n0[0] - xa) < 1e-6) s += pF.reactions[3 * i + 1] || 0; }); return Math.abs(s) * nP; });
  const reactions = appX.map((xa, j) => { const eR = enveloppe(xs, PC.ligneR(j), { q: 1, essieux: [{ d: 0, P: 1 }, { d: 1.2, P: 1 }] }); const infTS = eR.max - eR.pos; return { j, G: reacG[j], TS: QT * infTS, UDL: qT * eR.pos, trott: qFw * eR.pos, infTS, infUDL: eR.pos }; });
  return { type, nP, eta, guyon, Qb, qb, QT, qT, dTh, sections, elu, verifs, reactions, expo, fck, ok: verifs.every(v => v.ok) && elu.every(e => e.V.ok) };
}

function nearestPile(x, p) { return Math.abs(x - p.a) < Math.abs(x - 3 * p.a) ? p.a : 3 * p.a; }
