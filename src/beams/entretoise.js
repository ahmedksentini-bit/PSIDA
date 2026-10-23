/**
 * Entretoise d'about d'un pont à poutres : vérinage du tablier pour le remplacement des appareils d'appui (guide Sétra
 * VIPP 1996, § 2.2.4 : les entretoises d'about sont conservées pour le vérinage). L'entretoise est une poutre continue
 * sur les vérins (appuis rigides), chargée par les réactions des poutres sous charges permanentes, à leur axe, et par son
 * poids propre. Trafic interrompu ou réduit pendant le vérinage : on retient 1,35 G (majorant usuel) ; une part de trafic
 * peut être ajoutée par un coefficient sur les réactions.
 * Ferraillage : flexion ELU (section rectangulaire de l'entretoise, hourdis non compté), étriers EN 1992-1-1 § 6.2.3.
 * Unités : m, kN, kN·m.
 */
import { solve } from '../linalg.js';
import { flexureULS, materialsEC2 } from '../section_ec2.js';
import { etriersEC2 } from './design.js';

/** Poutre continue (éléments de Bernoulli) : nœuds xs, appuis rigides (indices), charges ponctuelles [{ x, P }] et w (kN/m). */
export function poutreContinue(xs, appuisX, charges, w = 0) {
  const pts = [...new Set([...xs, ...appuisX, ...charges.map(c => c.x)].map(x => +x.toFixed(6)))].sort((a, b) => a - b);
  const n = pts.length, N = 2 * n, K = Array.from({ length: N }, () => new Float64Array(N)), F = new Float64Array(N), EI = 1;
  for (let e = 0; e < n - 1; e++) {
    const L = pts[e + 1] - pts[e], k = EI / L ** 3, d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    const ke = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[d[a]][d[b]] += k * ke[a][b];
    const fe = [w * L / 2, w * L * L / 12, w * L / 2, -w * L * L / 12];   // charges vers le bas positives
    for (let a = 0; a < 4; a++) F[d[a]] += fe[a];
  }
  for (const c of charges) F[2 * pts.findIndex(x => Math.abs(x - c.x) < 1e-6)] += c.P;
  const fixes = appuisX.map(x => pts.findIndex(p => Math.abs(p - x) < 1e-6));
  const big = 1e12;
  for (const i of fixes) K[2 * i][2 * i] += big;
  const u = solve(K.map(r => Array.from(r)), Array.from(F));
  // réactions des appuis (vers le haut), puis efforts par la statique sur une grille fine (moment positif : fibre inférieure tendue)
  const R = fixes.map(i => big * u[2 * i]), x0 = pts[0], x1 = pts[n - 1], grille = [];
  for (let k = 0; k <= 400; k++) grille.push(x0 + (x1 - x0) * k / 400);
  for (const x of [...appuisX, ...charges.map(c => c.x)]) grille.push(x - 1e-9, x + 1e-9);
  grille.sort((a, b) => a - b);
  const Mx = x => appuisX.reduce((m, xa, i) => m + (xa < x ? R[i] * (x - xa) : 0), 0) - charges.reduce((m, c) => m + (c.x < x ? c.P * (x - c.x) : 0), 0) - w * (x - x0) ** 2 / 2;
  const Vx = x => appuisX.reduce((v, xa, i) => v + (xa < x ? R[i] : 0), 0) - charges.reduce((v, c) => v + (c.x < x ? c.P : 0), 0) - w * (x - x0);
  const M = grille.map(Mx), V = grille.map(Vx);
  return { pts: grille, M, V, R, appuisX };
}

/**
 * p = { ys (axes des poutres), RG (réactions G par poutre, kN), dv (distance vérin – axe de poutre, m), verinsRive (true :
 *       vérins des deux côtés des poutres de rive), he (hauteur de l'entretoise), te (épaisseur), hd, fck, fyk, kQ (coefficient
 *       de majoration des réactions, 1 par défaut) }
 */
export function entretoiseVerinage(p) {
  const ys = p.ys, n = ys.length, dv = p.dv ?? 0.6, te = p.te ?? 0.25, he = p.he, kQ = p.kQ ?? 1, gamma = 1.35;
  const appuis = [];
  ys.forEach((y, k) => { for (const s of [-1, 1]) { if (!p.verinsRive && ((k === 0 && s < 0) || (k === n - 1 && s > 0))) continue; appuis.push(y + s * dv); } });
  const x0 = Math.min(ys[0] - 0.3, ...appuis), x1 = Math.max(ys[n - 1] + 0.3, ...appuis);
  const charges = ys.map((y, k) => ({ x: y, P: gamma * kQ * p.RG[k] }));
  const w = gamma * 25 * te * he;
  const r = poutreContinue([x0, x1], appuis.sort((a, b) => a - b), charges, w);
  const Mpos = Math.max(0, ...r.M), Mneg = Math.min(0, ...r.M), Vmax = Math.max(...r.V.map(Math.abs));
  const mat = materialsEC2({ fck: p.fck, fyk: p.fyk, alphaCC: 0.85 }), h = he + (p.hd || 0), d = h - 0.06;
  const inf = flexureULS(Mpos / 1000, { b: te, d }, mat), sup = flexureULS(-Mneg / 1000, { b: te, d }, mat);
  const AsMin = Math.max(0.26 * mat.fctm / p.fyk, 0.0013) * te * d;
  const V = etriersEC2({ VEd: Vmax, bw: te, z: 0.9 * d, fck: p.fck, fyk: p.fyk });
  return { appuis: r.appuis = appuis, charges, w, M: r.M, V: r.V, pts: r.pts, R: r.R, Mpos, Mneg, Vmax, AsInf: Math.max(inf.As, AsMin), AsSup: Math.max(sup.As, AsMin), AsMin, etriers: V, verin: Math.max(...r.R) / gamma, dv, te, he, d };
}
