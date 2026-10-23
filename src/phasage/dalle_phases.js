/**
 * Pont-dalle coulé par phases successives (travée par travée), en béton armé ou précontraint (câbles couplés).
 *
 * Chaque phase k bétonne le tronçon [x_{k−1}, x_k] : de la reprise précédente jusqu'à une reprise placée à α L dans la
 * travée suivante (au voisinage du point de moment nul des charges permanentes), la dernière phase allant jusqu'à la
 * culée. Le tronçon est décintré à t_k = (k − 1) Δt + t_d (âge t_d du béton) : il porte alors son poids et, en béton
 * précontraint, la famille de câbles de la phase est tendue à son extrémité libre et couplée à la famille précédente
 * (coupleur à la reprise ; la première famille est tendue des deux côtés). Les superstructures sont posées après la
 * dernière phase. Le calcul par phases (src/phasage/phasage.js : fluage, retrait, relaxation, pertes par frottement et
 * recul d'ancrage de chaque famille) donne les efforts à la fin des travaux et à long terme ; un second calcul, ouvrage
 * coulé d'une traite et câbles filants tendus aux deux extrémités, sert de référence (hypothèse du calcul PSI-DP).
 *
 * Variante béton armé : décintrement à chaque phase (redistribution par fluage vers le schéma continu) ou décintrement
 * unique après la dernière phase (le schéma continu porte tout le poids : pas de redistribution, seulement l'effet des
 * âges différents).
 *
 * Reprises et coupleurs (EN 1992-2 § 8.10.4 (105)) : tous les câbles étant couplés à la même section (plus de 50 %), il
 * faut soit une compression résiduelle d'au moins 3 MPa sous la combinaison caractéristique, soit le ferraillage minimal
 * continu de l'expression (7.1) (EN 1992-1-1 § 7.3.2). Unités : m, kN, kN·m, MPa (traction positive).
 */
import { calculPhasage } from './phasage.js';

/**
 * @param {object} p { spans, A, I, v, vp, h, fck, RH, h0, ciment, gBeton (25), gSup (kN/m), cable?: { n, Ap (m²), sigma0
 *   (MPa), mu, k, g (m), z: x => excentricité (m, + vers le haut), classe, rho1000 }, alpha (0,2), dt (j), td (j), tSup
 *   (j après la dernière phase), decintrement ('phase' | 'final'), nb (barres par travée) }
 */
export function modeleDallePhases(p, { monolithique = false } = {}) {
  const L = p.spans, n = L.length, nb = p.nb || 10, alpha = Math.min(0.45, Math.max(0.05, p.alpha ?? 0.2));
  const X = [0]; L.forEach(l => X.push(X[X.length - 1] + l));
  const Lt = X[n], joints = monolithique ? [] : Array.from({ length: n - 1 }, (_, j) => X[j + 1] + alpha * L[j + 1]);
  const bornes = [0, ...joints, Lt];
  // nœuds : divisions des travées, reprises
  const xs = [...new Set([...L.flatMap((l, s) => Array.from({ length: nb }, (_, k) => +(X[s] + l * k / nb).toFixed(6))), Lt, ...joints.map(x => +x.toFixed(6))])].sort((a, b) => a - b);
  const noeuds = xs.map(x => [x, 0]);
  const iNoeud = x => xs.findIndex(q => Math.abs(q - x) < 1e-6);
  const phaseDe = x => { let k = 0; while (k < bornes.length - 2 && x >= bornes[k + 1] - 1e-9) k++; return k; };
  const nPh = monolithique ? 1 : n;
  const barres = [], parPhase = Array.from({ length: nPh }, () => []);
  for (let i = 0; i < xs.length - 1; i++) {
    const k = monolithique ? 0 : phaseDe((xs[i] + xs[i + 1]) / 2);
    parPhase[k].push(barres.length);
    barres.push({ i, j: i + 1, A: p.A, I: p.I, e: 0, beton: `C${k + 1}`, nom: `phase ${k + 1}` });
  }
  const dt = p.dt ?? 14, td = p.td ?? 7, tk = k => (monolithique ? (n - 1) * dt : k * dt) + td;
  const betons = Object.fromEntries(Array.from({ length: nPh }, (_, k) => [`C${k + 1}`, { fck: p.fck, RH: p.RH ?? 70, h0: p.h0 ?? 2 * p.h * 1000 / 2, ciment: p.ciment || 'N', tCoulage: tk(k) - td }]));
  const wG = p.gBeton * p.A, pre = !!p.cable, final = !pre && p.decintrement === 'final' && !monolithique;
  const phases = [], cables = [];
  const appuisDe = k => X.map((x, s) => ({ x, s })).filter(({ x }) => (monolithique ? true : x >= bornes[k] - 1e-9 && x <= bornes[k + 1] + 1e-9)).filter(({ x }) => (k === 0 || x > bornes[k] + 1e-9))
    .map(({ x, s }) => ({ n: iNoeud(x), ddl: s === 0 ? ['ux', 'uy'] : ['uy'] }));
  for (let k = 0; k < nPh; k++) {
    phases.push({ t: tk(k), nom: monolithique ? 'Ouvrage coulé d\'une traite, décintré, câbles filants tendus' : `Phase ${k + 1} : tronçon ${bornes[k].toFixed(2)} – ${bornes[k + 1].toFixed(2)} m${final ? ' (sur cintre)' : ', décintré' + (pre ? ', câbles tendus et couplés' : '')}`,
      activer: parPhase[k], appuis: appuisDe(k), charges: final ? [] : parPhase[k].map(b => ({ barre: b, w: wG })) });
    if (pre) {
      const C = p.cable, segs = parPhase[k].map(b => ({ barre: b, ei: C.z(xs[barres[b].i]), ej: C.z(xs[barres[b].j]) }));
      cables.push({ nom: monolithique ? 'câbles filants' : `famille ${k + 1}${k > 0 ? ' (couplée)' : ''}`, n: C.n, Ap: C.n * C.Ap, P0: C.n * C.Ap * C.sigma0 * 1000, mu: C.mu, k: C.k, g: C.g,
        tension: monolithique || k === 0 ? 'deux' : 'droite', classe: C.classe ?? 2, rho1000: C.rho1000 ?? 2.5, phase: k, segments: segs });
    }
  }
  const tFinTrav = tk(nPh - 1);
  if (final) phases.push({ t: tFinTrav + 1, nom: 'Décintrement de l\'ouvrage entier', charges: barres.map((_, b) => ({ barre: b, w: wG })) });
  const tSup = (monolithique ? tk(0) : tFinTrav) + (p.tSup ?? 60);
  phases.push({ t: tSup, nom: 'Superstructures', charges: barres.map((_, b) => ({ barre: b, w: p.gSup })) });
  return { modele: { noeuds, barres, phases, cables, betons, tFin: p.tFin ?? 36500, parDecade: 6 }, reperes: { xs, X, joints, bornes, alpha, tSup, tFinTrav: final ? tFinTrav + 1 : tFinTrav } };
}

/** Moment et effort normal du béton en x (barre contenant x). */
function effortsEn(pas, modele, xs, x) {
  let b = modele.barres.findIndex(q => xs[q.i] <= x + 1e-9 && xs[q.j] >= x - 1e-9);
  if (b < 0) b = modele.barres.length - 1;
  const r = pas.barres[b]; if (!r) return null;
  return { N: r.N, M: r.M(Math.min(Math.max(x - xs[modele.barres[b].i], 0), xs[modele.barres[b].j] - xs[modele.barres[b].i])) };
}

/**
 * Calcul complet et vérifications. q = { car: x => { max, min }, freq: x => { max, min } } : moments de trafic de la dalle
 * entière (kN·m), pour les reprises (EN 1992-2 § 8.10.4) ; facultatif.
 */
export function dallePhases(p, q = null) {
  const P = modeleDallePhases(p), M0 = modeleDallePhases(p, { monolithique: true });
  const r = calculPhasage(P.modele), r0 = calculPhasage(M0.modele), R = P.reperes;
  const iSup = P.modele.phases.length - 1, pasFT = r.pas[r.finPhase[iSup - 1]], pasF = r.final, pasF0 = r0.final;
  const sig = (e, M) => ({ sup: (e.N / p.A - M * p.v / p.I) / 1000, inf: (e.N / p.A + M * p.vp / p.I) / 1000 });
  const fctm = 0.3 * p.fck ** (2 / 3), Lt = R.X[R.X.length - 1];
  // sections remarquables : reprises, piles, mi-travées
  const pts = [...R.joints.map((x, j) => ({ x, nom: `reprise ${j + 1}`, type: 'reprise' })), ...R.X.slice(1, -1).map((x, j) => ({ x, nom: `pile P${j + 1}`, type: 'pile' })), ...p.spans.map((l, s) => ({ x: R.X[s] + l / 2, nom: `mi-travée ${s + 1}`, type: 'travee' }))].sort((a, b) => a.x - b.x);
  const sections = pts.map(s => {
    const eT = effortsEn(pasFT, P.modele, R.xs, s.x), eF = effortsEn(pasF, P.modele, R.xs, s.x), e0 = effortsEn(pasF0, M0.modele, M0.reperes.xs, s.x);
    const out = { ...s, MfinTravaux: eT.M, M: eF.M, N: eF.N, Mmono: e0.M, Nmono: e0.N, dM: eF.M - e0.M, sig: sig(eF, eF.M), sigMono: sig(e0, e0.M) };
    if (q && p.cable) {
      const c = q.car(s.x), f = q.freq(s.x);
      const vals = Q => [Q.max, Q.min].map(m => sig(eF, eF.M + m));
      out.car = vals(c); out.freq = vals(f);
      out.carMax = Math.max(...out.car.flatMap(v => [v.sup, v.inf])); out.carMin = Math.min(...out.car.flatMap(v => [v.sup, v.inf]));
    }
    return out;
  });
  // diagrammes : moment à long terme (phases, référence) et à la fin des travaux
  const diag = R.xs.map(x => [x, effortsEn(pasF, P.modele, R.xs, x).M, effortsEn(pasF0, M0.modele, M0.reperes.xs, x).M, effortsEn(pasFT, P.modele, R.xs, x).M]);
  const verifs = [];
  const add = (nom, val, lim, ok, ref, x) => verifs.push({ nom, val, lim, ok, ref, x });
  // reprises : compression résiduelle sous la combinaison caractéristique, sinon ferraillage minimal (7.1)
  const kh = p.h <= 0.3 ? 1 : p.h >= 0.8 ? 0.65 : 1 - 0.35 * (p.h - 0.3) / 0.5;
  const AsMin = 0.4 * kh * fctm * (p.A / 2) / 500;   // k_c = 0,4 (flexion), A_ct ≈ A/2, σ_s = f_yk
  for (const s of sections.filter(z => z.type === 'reprise')) {
    if (p.cable && s.carMax != null) {
      const ok = s.carMax <= -3;
      add(`${s.nom} (x = ${s.x.toFixed(2)} m) : compression résiduelle sous combinaison caractéristique (coupleurs sur 100 % des câbles)`, s.carMax, -3, ok, ok ? 'EN 1992-2 § 8.10.4 (105) : ≥ 3 MPa de compression' : `EN 1992-2 § 8.10.4 (105) : sinon ferraillage minimal continu (7.1), A_s,min ≈ ${(AsMin * 1e4).toFixed(0)} cm² pour la dalle`, s.x);
    }
    add(`${s.nom} : traction sous G + P à long terme`, Math.max(s.sig.sup, s.sig.inf), fctm, Math.max(s.sig.sup, s.sig.inf) <= fctm, p.cable ? 'reprise de bétonnage : non fissurée sous les actions permanentes' : 'béton armé : fissuration maîtrisée par le ferraillage du calcul', s.x);
  }
  const dMax = sections.reduce((a, s) => (Math.abs(s.dM) > Math.abs(a.dM) ? s : a));
  add('Écart de moment phasé / coulé d\'une traite (G + P, long terme), section la plus touchée [kN·m]', dMax.dM, null, true, 'redistribution par fluage entre phases (information)', dMax.x);
  return { p, reperes: R, sections, diag, verifs, AsMin, fctm, r, r0, modele: P.modele, Lt, ok: verifs.every(v => v.ok) };
}

/**
 * Données du calcul à partir du résultat du pont-dalle (pipeline) : section (PSI-DP : section brute du calcul de
 * précontrainte ; sinon rectangle équivalent), poids, superstructures = reste des charges permanentes, câbles du calcul
 * PSI-DP (nombre d'unités, tracé, σ₀, frottement, recul) et moments de trafic pour les reprises.
 */
export async function donneesDallePhases(st, o = {}) {
  const { sectionProps } = await import('../psidp/index.js');
  const { cableGeometry } = await import('../psidp/prestress.js');
  const deck = st.deck, dp = st.psidp, sec = dp ? dp.sec : sectionProps({ width: 2 * deck.b, h: deck.h, chamfer: deck.g.chamfer });
  const A = sec.A ?? sec.B, gTot = st.perm.gTotal, gSup = Math.max(0, gTot - 25 * A);
  const p = { spans: deck.spans.slice(), A, I: sec.I, v: sec.v, vp: sec.vp, h: deck.h, fck: st.p.mat.fck, gBeton: 25, gSup, alpha: o.alpha, dt: o.dt, td: o.td, tSup: o.tSup, decintrement: o.decintrement, RH: o.RH, ciment: o.ciment };
  let q = null;
  if (dp && dp.n) {
    const G = cableGeometry(deck.spans, dp.segs), bp = dp.bp;
    p.cable = { n: dp.n, Ap: dp.unit.Ap, sigma0: dp.sigma0, mu: bp.f, k: bp.phi, g: bp.g, z: G.z, classe: 2, rho1000: bp.rho1000 };
    q = { car: x => dp.M.rare(x), freq: x => dp.M.freq(x) };
  }
  return { p, q };
}
