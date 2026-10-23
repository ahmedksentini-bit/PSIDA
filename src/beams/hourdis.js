/**
 * Hourdis général d'un pont à poutres : flexion locale transversale sous les charges concentrées (roues) et les charges
 * réparties, et ferraillage par mètre.
 *
 * Modèle : plaque mince (éléments DKT, src/plate/fe.js) de toute la largeur du tablier, continue sur les poutres, appuyée
 * sans encastrement sur l'axe de chaque poutre (lignes d'appuis rigides), d'épaisseur h_d entre les tables et h_d + table
 * au-dessus des tables ; tronçon de 12 m centré sur la section étudiée, extrémités libres. Les moments m_y sont
 * évalués à mi-portée de chaque panneau (armatures inférieures) et au nu des tables (armatures supérieures) par surfaces
 * d'influence (réciprocité de Maxwell-Betti), sur lesquelles les charges sont placées au plus défavorable :
 *  - Eurocodes (NF EN 1991-2 § 4.3.2 à 4.3.6) : tandems TS de deux voies (roues 0,40 × 0,40, essieux à 1,20 m, roues de
 *    tandems voisins à 0,50 m au moins), UDL sur les seules parties défavorables, trottoirs 3 kN/m² (gr1a) ; LM2 (essieu
 *    de 400 β_Q kN, roues 0,35 × 0,60, ou une roue seule de 200 β_Q kN) ; diffusion à 45° dans le revêtement et jusqu'au
 *    feuillet moyen du hourdis (§ 4.3.6) ;
 *  - Fascicule 61 titre II : Bc (roues arrière de 60 kN, 0,25 × 0,25, coefficient bc), Bt (roues de 80 kN, 0,60 × 0,25),
 *    Br (roue de 100 kN, 0,60 × 0,30), Mc120 (chenilles 1,00 × 6,10), coefficients de majoration dynamique δ
 *    (art. 5.5 : δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4 G/S), L = inf(sup(L_r ; distance des poutres de rive) ; portée)).
 * Combinaisons : EC — ELU 1,35 (G + Q), caractéristique G + Q, fréquente G + ψ₁ Q ; Fascicule 61 / BAEL — ELU 1,35 G +
 * 1,605 B (ou 1,35 Mc120), ELS G + 1,2 B (ou Mc120). Ferraillage (cantilever.js : ELU, σ_s à l'ELS caractéristique,
 * w_k ≤ 0,3 mm sous fréquente, minimums § 9.3.1.1 et 7.3.2) et poinçonnement sous la roue du tandem (§ 6.4.4).
 * La flexion transversale d'ensemble du grillage (coefficients μ de Guyon-Massonnet, flèches différentielles des
 * poutres) n'est pas ajoutée : elle reste à superposer pour les tabliers sans entretoises intermédiaires.
 * Unités : m, kN, kN·m/m.
 */
import { PlaqueEF } from '../plate/fe.js';
import { BC, BT, BR, MC120, deltaDyn, classePont, voiesF61 } from '../loads_f61.js';
import { EC_ALPHA, lm1, notionalLanes } from '../loads_ec.js';
import { cantileverDesign } from '../cantilever.js';
import { materialsEC2, shearVRdc } from '../section_ec2.js';

const pasGrille = (bornes, pas) => {
  const v = [...new Set(bornes.map(x => +x.toFixed(4)))].sort((a, b) => a - b), out = [v[0]];
  for (let k = 1; k < v.length; k++) { const n = Math.max(1, Math.ceil((v[k] - v[k - 1]) / pas - 1e-9)); for (let q = 1; q <= n; q++) out.push(v[k - 1] + (v[k] - v[k - 1]) * q / n); }
  return out;
};

/**
 * p = { n, b1, hd, bt (largeur de table), eTab (épaisseur moyenne de la table), L (portée des poutres), roadway {y1,y2},
 *       footways [{y1,y2}], lines [{g,e}], bands [{q,y1,y2}], tRev (0,08), fck (hourdis), fyk, c (enrobage, 0,03),
 *       alphaEC ('recommended'), classe F61 (auto), nRetenue, mil ('Mc120' | 'aucune'), gamma (25) }
 */
export function hourdisLocal(p) {
  const n = p.n, b1 = p.b1, hd = p.hd, W = n * b1, b = W / 2, bt = Math.min(p.bt, b1 - 0.2), tRev = p.tRev ?? 0.08;
  const ys0 = Array.from({ length: n }, (_, k) => -b + b1 * (k + 0.5));
  const Lm = Math.min(12, Math.max(p.L || 12, 6)), x0 = Lm / 2;
  // pas fin (0,10 m) près de la section étudiée, 0,40 m ailleurs
  const xsF = pasGrille([0, x0 - 2.0, x0 + 2.0, Lm], 0.4).flatMap((x, i, a) => (i && a[i - 1] >= x0 - 2.0 - 1e-9 && x <= x0 + 2.0 + 1e-9 ? Array.from({ length: Math.ceil((x - a[i - 1]) / 0.1) }, (_, q) => a[i - 1] + (x - a[i - 1]) * (q + 1) / Math.ceil((x - a[i - 1]) / 0.1)) : [x]));
  // la plaque s'étend jusqu'aux charges linéiques extérieures (corniches) pour garder leur bras de levier réel
  const yMin = Math.min(-b, ...(p.lines || []).map(l => l.e - 0.05)), yMax = Math.max(b, ...(p.lines || []).map(l => l.e + 0.05));
  const yb = [yMin, yMax, -b, b, ...ys0, ...ys0.flatMap(y => [y - bt / 2, y + bt / 2]), ...ys0.slice(1).map((y, k) => (y + ys0[k]) / 2)];
  const ys = pasGrille(yb, 0.15);
  const E = 22000 * ((p.fck + 8) / 10) ** 0.3 * 1000, nu = 0.2, Dd = h => E * h ** 3 / (12 * (1 - nu * nu));
  const surTable = y => ys0.some(yk => Math.abs(y - yk) < bt / 2 - 1e-9);
  const appuis = [];
  for (const x of xsF) for (const yk of ys0) appuis.push({ x, y: yk, k: Infinity });
  const P = new PlaqueEF({ xs: xsF, ys, D: (x, y) => Dd(surTable(y) ? hd + (p.eTab || 0.15) : hd), nu, appuis });
  const i0 = P.plusProche(xsF, x0);

  // cibles : mi-portée de chaque panneau (m_y > 0) et nu des tables (m_y < 0)
  const cibles = [];
  for (let k = 0; k < n - 1; k++) cibles.push({ type: 'travee', nom: `panneau ${k + 1}–${k + 2}`, y: (ys0[k] + ys0[k + 1]) / 2, signe: 1, rive: k === 0 || k === n - 2 });
  ys0.forEach((yk, k) => { for (const s of [-1, 1]) { const y = yk + s * bt / 2; if (y > -b + 1e-6 && y < b - 1e-6) cibles.push({ type: 'appui', nom: `nu de la table ${k + 1} (${s < 0 ? 'gauche' : 'droite'})`, y, signe: -1, rive: (k === 0 && s < 0) || (k === n - 1 && s > 0) }); } });
  for (const c of cibles) { c.j = P.plusProche(ys, c.y); c.eta = P.resoudre(P.vecteurGrandeur(i0, c.j, 'my')); }

  // valeur de la surface d'influence (bilinéaire) et moyenne sur un rectangle (3 × 3 points)
  const loc = (v, t) => { if (t <= v[0]) return [0, 0]; if (t >= v[v.length - 1]) return [v.length - 2, 1]; let k = 0; while (k < v.length - 2 && v[k + 1] < t) k++; return [k, (t - v[k]) / (v[k + 1] - v[k])]; };
  const etaAt = (eta, x, y) => { if (y < yMin || y > yMax || x < 0 || x > Lm) return 0; const [i, rx] = loc(xsF, x), [j, ry] = loc(ys, y); const g = (a, c) => eta[P.idx(a, c)]; return g(i, j) * (1 - rx) * (1 - ry) + g(i + 1, j) * rx * (1 - ry) + g(i, j + 1) * (1 - rx) * ry + g(i + 1, j + 1) * rx * ry; };
  const patch = (eta, x, y, ax, ay) => { let s = 0; for (const u of [-1 / 3, 0, 1 / 3]) for (const v of [-1 / 3, 0, 1 / 3]) s += etaAt(eta, x + u * ax, y + v * ay); return s / 9; };
  const diff = a => a + 2 * tRev + hd;   // côté de l'impact diffusé jusqu'au feuillet moyen (§ 4.3.6)
  // intégrale de la partie de signe s de η sur une bande [y1, y2] × toute la longueur
  const integ = (eta, y1, y2, s) => { let a = 0; for (let i = 0; i < xsF.length; i++) { const dx = (i < xsF.length - 1 ? xsF[i + 1] - xsF[i] : 0) / 2 + (i > 0 ? xsF[i] - xsF[i - 1] : 0) / 2; for (let j = 0; j < ys.length; j++) { if (ys[j] < y1 - 1e-9 || ys[j] > y2 + 1e-9) continue; const dy = (j < ys.length - 1 ? Math.min(ys[j + 1], y2) - ys[j] : 0) / 2 + (j > 0 ? ys[j] - Math.max(ys[j - 1], y1) : 0) / 2; const v = eta[P.idx(i, j)]; if (v * s > 0) a += v * dx * Math.max(dy, 0); } } return a; };

  // ---- permanentes (hourdis, revêtement, superstructures), une résolution
  const F = P.vecteur(), g = p.gamma ?? 25;
  P.chargeRectangle(F, { x1: 0, x2: Lm, y1: -b, y2: b, q: g * hd });
  for (const bd of p.bands || []) P.chargeRectangle(F, { x1: 0, x2: Lm, y1: Math.max(yMin, bd.y1), y2: Math.min(yMax, bd.y2), q: bd.q });
  for (const l of p.lines || []) for (let i = 0; i < xsF.length; i++) { const dx = (i < xsF.length - 1 ? xsF[i + 1] - xsF[i] : 0) / 2 + (i > 0 ? xsF[i] - xsF[i - 1] : 0) / 2; P.chargePonctuelle(F, { x: xsF[i], y: l.e, P: l.g * dx }); }
  const wG = P.resoudre(F), mG = P.moments(wG);

  // ---- géométrie de la chaussée, voies EC
  const R = p.roadway, Lr = R.y2 - R.y1, nl = notionalLanes(Lr).n, alpha = EC_ALPHA[p.alphaEC || 'recommended'] || EC_ALPHA.recommended;
  const LM = lm1(nl, alpha), Q1 = LM.lanes[0].Q / 2, Q2 = (LM.lanes[1] ? LM.lanes[1].Q / 2 : 0), q1 = LM.lanes[0].q, qr = LM.lanes[1] ? LM.lanes[1].q : 2.5;
  const betaQ = alpha.aQ ? alpha.aQ[0] : 1;
  const posY = (w, step = 0.1) => { const out = []; for (let y = R.y1 + w / 2; y <= R.y2 - w / 2 + 1e-9; y += step) out.push(y); return out.length ? out : [(R.y1 + R.y2) / 2]; };
  // tandem : 4 roues ; essieux à x0 ± 0,6 ou (x0 ; x0 + 1,2)
  const tandem = (eta, yc, Q) => { const a = diff(0.4); let best = -Infinity, worst = Infinity; for (const xa of [[x0 - 0.6, x0 + 0.6], [x0, x0 + 1.2]]) { let s = 0; for (const x of xa) for (const dy of [-1, 1]) s += Q * patch(eta, x, yc + dy, a, a); best = Math.max(best, s); worst = Math.min(worst, s); } return [best, worst]; };

  const res = cibles.map(c => {
    const s = c.signe, eta = c.eta, pick = ([a, w]) => (s > 0 ? a : w), better = (u, v) => (s > 0 ? Math.max(u, v) : Math.min(u, v));
    const G = mG.my[P.idx(i0, c.j)];
    // TS : tandem 1 seul, ou tandems 1 et 2 voisins (axes ≥ 2,50 m)
    let TS = 0;
    for (const y1 of posY(2.4)) {
      const t1 = pick(tandem(eta, y1, Q1)); TS = better(TS, t1);
      if (Q2) for (const y2 of posY(2.4, 0.25)) if (Math.abs(y2 - y1) >= 2.5 - 1e-9) TS = better(TS, t1 + pick(tandem(eta, y2, Q2)));
    }
    // UDL sur les parties défavorables (voie 1 au plus défavorable : majorant 9 kN/m² sur 3 m, 2,5 ailleurs)
    let UDL = 0;
    for (const yl of posY(3.0, 0.25)) UDL = better(UDL, q1 * integ(eta, yl - 1.5, yl + 1.5, s) + qr * (integ(eta, R.y1, yl - 1.5, s) + integ(eta, yl + 1.5, R.y2, s)));
    const FW = (p.footways || []).reduce((a, f) => a + 3 * integ(eta, Math.max(yMin, f.y1), Math.min(yMax, f.y2), s), 0);
    // LM2 : essieu de deux roues (2,00 m) ou roue seule, 0,35 (long.) × 0,60 (transv.)
    let LM2 = 0; const ax2 = diff(0.35), ay2 = diff(0.60), Pw = 200 * betaQ;
    for (const y of posY(0.6, 0.1)) { LM2 = better(LM2, Pw * patch(eta, x0, y, ax2, ay2)); if (y + 2 <= R.y2 - 0.3 + 1e-9) LM2 = better(LM2, Pw * (patch(eta, x0, y, ax2, ay2) + patch(eta, x0, y + 2, ax2, ay2))); }
    // Fascicule 61
    const f61 = {};
    { // Bc : files accolées (axes ≥ 2,50 m), roues arrière 60 kN, essieux à 1,50 m
      const cl = p.classe || classePont(Lr), nv = voiesF61(Lr).nv, a = diff(0.25);
      const camion = (yc, nf) => { let best = -Infinity, worst = Infinity; for (const xa of [[x0 - 0.75, x0 + 0.75], [x0, x0 + 1.5]]) { let v = 0; for (const x of xa) for (const dy of [-1, 1]) v += 60 * patch(eta, x, yc + dy, a, a); best = Math.max(best, v); worst = Math.min(worst, v); } return [best, worst]; };
      let Bc = 0, nfB = 1;
      for (const y1 of posY(2.5, 0.1)) {
        const c1 = pick(camion(y1)); const bc1 = BC.bc[cl][0]; if (s * c1 * bc1 > s * Bc) { Bc = c1 * bc1; nfB = 1; }
        for (const y2 of posY(2.5, 0.25)) if (Math.abs(y2 - y1) >= 2.5 - 1e-9 && nv >= 2) { const v = (c1 + pick(camion(y2))) * BC.bc[cl][1]; if (s * v > s * Bc) { Bc = v; nfB = 2; } }
      }
      const at = [diff(0.25), diff(0.6)], tand = yc => { let best = -Infinity, worst = Infinity; for (const xa of [[x0 - 0.675, x0 + 0.675], [x0, x0 + 1.35]]) { let v = 0; for (const x of xa) for (const dy of [-1, 1]) v += 80 * patch(eta, x, yc + dy, at[0], at[1]); best = Math.max(best, v); worst = Math.min(worst, v); } return [best, worst]; };
      let Bt = 0; const btc = BT.bt[cl];
      if (btc) for (const y1 of posY(2.6, 0.1)) { const t1 = pick(tand(y1)); Bt = better(Bt, t1 * btc); for (const y2 of posY(2.6, 0.25)) if (Math.abs(y2 - y1) >= 3 - 1e-9) Bt = better(Bt, (t1 + pick(tand(y2))) * btc); }
      let Br = 0; for (const y of posY(0.6, 0.1)) Br = better(Br, 100 * patch(eta, x0, y, diff(0.3), diff(0.6)));
      let Mc = 0;
      if ((p.mil || 'Mc120') !== 'aucune') { const q = MC120.P / 2 / (MC120.trackLength * MC120.trackWidth); for (const y of posY(MC120.trackSpacing + MC120.trackWidth, 0.1)) { let v = 0; for (const dy of [-MC120.trackSpacing / 2, MC120.trackSpacing / 2]) { const yy = y + dy; for (let u = -0.5; u <= 0.5 + 1e-9; u += 0.25) for (let xx = -3.05; xx <= 3.05 + 1e-9; xx += 0.305) v += q * 0.25 * 0.305 * etaAt(eta, x0 + xx, yy + u); } Mc = better(Mc, v); } }
      // δ : L = inf(sup(L_r ; distance des poutres de rive) ; portée), G = poids du hourdis et des superstructures sur L
      const Ld = Math.min(Math.max(Lr, (n - 1) * b1), p.L || 30), gL = (g * hd * W + (p.bands || []).reduce((a2, bd) => a2 + bd.q * (Math.min(b, bd.y2) - Math.max(-b, bd.y1)), 0) + (p.lines || []).reduce((a2, l) => a2 + l.g, 0)) * Ld;
      const SB = Math.max(Math.min(nv, 2) * 2 * 120 * BC.bc[cl][Math.min(nv, 2) - 1] * (Ld >= 1.5 ? 2 : 1) / 2, btc ? Math.min(nv, 2) * 320 * btc : 0, 100);
      const dB = deltaDyn(Ld, gL, Math.max(SB, 1)), dM = deltaDyn(Ld, gL, MC120.P);
      Object.assign(f61, { Bc: Bc * dB, Bt: Bt * dB, Br: Br * dB, Mc120: Mc * dM, dB, dM, Ld, nfB, classe: cl });
    }
    const Qcar = better(TS + UDL + FW, LM2), Qfreq = better(0.75 * TS + 0.4 * UDL + 0.4 * FW, 0.75 * LM2);
    const B = better(better(f61.Bc, f61.Bt), f61.Br);
    return {
      ...c, eta: undefined, G, TS, UDL, FW, LM2, f61,
      EC: { ELU: 1.35 * (G + Qcar), CAR: G + Qcar, FREQ: G + Qfreq, QP: G },
      F61: { ELU: better(1.35 * G + 1.605 * B, 1.35 * (G + f61.Mc120)), ELS: better(G + 1.2 * B, G + f61.Mc120) },
    };
  });

  // ---- enveloppes et ferraillage par mètre (armatures transversales inférieures en travée, supérieures au nu des tables)
  const design = type => {
    const r = res.filter(q => q.type === type), s = type === 'travee' ? 1 : -1;
    const gov = r.reduce((a, q) => (Math.max(s * q.EC.ELU, s * q.F61.ELU) > Math.max(s * a.EC.ELU, s * a.F61.ELU) ? q : a));
    const mom = { ELU: Math.max(s * gov.EC.ELU, s * gov.F61.ELU, 0), CAR: Math.max(s * gov.EC.CAR, s * gov.F61.ELS, 0), FREQ: Math.max(s * gov.EC.FREQ, 0), hr: hd };
    return { gov, mom, ...cantileverDesign(mom, { fck: p.fck, fyk: p.fyk, c: p.c ?? 0.03, phi: 0.014, wkMax: 0.3, kSlab: 1.0 }) };
  };
  const inf = design('travee'), sup = design('appui');
  // poinçonnement sous une roue du tandem (EN 1992-1-1 § 6.4.4) : aire chargée diffusée dans le revêtement
  const mat = materialsEC2({ fck: p.fck, fyk: p.fyk }), d = hd - (p.c ?? 0.03) - 0.007, a0 = 0.4 + 2 * tRev;
  const u1 = 4 * a0 + 2 * Math.PI * 2 * d, VEd = 1.35 * Q1, k = Math.min(2, 1 + Math.sqrt(0.2 / d));
  const rho = Math.min(0.02, Math.sqrt(inf.As * Math.max(inf.As, 1e-9)) / d), vRdc = Math.max(0.18 / 1.5 * k * Math.cbrt(100 * rho * p.fck), 0.035 * k ** 1.5 * Math.sqrt(p.fck));
  const poinc = { VEd, u1, d, vRdc, VRdc: vRdc * u1 * d * 1000, ok: VEd <= vRdc * u1 * d * 1000 };
  return { modele: { Lm, x0, nx: xsF.length, ny: ys.length, bt, ys0 }, cibles: res, inf, sup, poinc, Q1, Q2, nl };
}
