// Analyse statique non linéaire en poussée progressive (EN 1998-2 4.2.5 et annexe H ; EN 1998-1 annexe B).
//  · Loi moment-courbure des fûts par fibres : béton confiné ou non (EN 1998-2 E.2.1, Mander), acier à écrouissage
//    linéaire (E.2.2 : fym = 1,15 fyk, ftm = 1,20 fyk, εsu = εuk), effort normal de la situation sismique ;
//    idéalisation bilinéaire à aires égales au-delà de la première plastification (E.3.2(3)).
//  · Courbe effort-déplacement de chaque fût en console : rotule en pied de longueur Lp = 0,10 L + 0,015 fyk dbL
//    (E.19), δ = φy L²/3 + (φ − φy) Lp (L − Lp/2), effort V = (M − N δ)/L (second ordre, 4.2.5(1)P) ; capacité de rotation θp,u = (φu − φy) Lp (1 − Lp/2L) (E.16b),
//    valeur de calcul θp,d = θp,u / γR,p, γR,p = 1,40 (E.3.1(3)), réduite si L/d < 3 (E.20, E.21).
//  · Pont : tablier indéformable dans son plan (point de référence = tablier), appareils et culées élastiques,
//    piles non linéaires ; déplacement imposé au tablier, effort total à la base V(D).
//  · Déplacement cible (H.1) : dT = dE de l'analyse multimodale avec q = 1 et la rigidité effective des fûts
//    (annexe C, méthode 2 : Jeff = 1,20 MRd / (Ec φy)) ; à titre de comparaison, méthode N2 (EN 1998-1 annexe B).
// Unités : m, MN, MPa (MN/m²), MN·m.

import { derives } from "../projet/geometrie.ts";
import type { Pile, Projet } from "../projet/types.ts";
import type { ActionSismique } from "./action.ts";
import { inerties, modele, type Modele } from "./modele.ts";
import { reponseDirection } from "./multimodal.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";
import { valeur } from "./spectres.ts";

export type DirectionPO = "x" | "y";

export interface Materiaux {
  fcm: number;
  Ec: number;
  fcc: number;
  epsC1: number;
  epsCu: number;
  confine: boolean;
  fym: number;
  ftm: number;
  Es: number;
  epsSu: number;
}

const EPS_UK = { A: 0.025, B: 0.05, C: 0.075 } as const;

/** Matériaux probables (EN 1998-2 E.2), béton confiné si ρw > 0 (E.1 à E.10, α = 1). */
export function materiauxProbables(fck: number, fyk: number, classe: "A" | "B" | "C", rhoW = 0, Ecm?: number): Materiaux {
  const fcm = fck + 8;
  const Ec = Ecm ?? 22000 * (fcm / 10) ** 0.3;
  const fym = 1.15 * fyk, ftm = 1.2 * fyk, epsSu = EPS_UK[classe];
  if (rhoW > 0) {
    const sl = rhoW * fym; // contrainte de confinement effective, α = 1 (E.9)
    const lc = 2.254 * Math.sqrt(1 + (7.94 * sl) / fcm) - (2 * sl) / fcm - 1.254; // (E.6)
    const fcc = fcm * lc;
    const epsC1 = 0.002 * (1 + 5 * (fcc / fcm - 1)); // (E.7)
    const epsCu = 0.004 + (1.4 * 2 * rhoW * fym * epsSu) / fcc; // (E.10), ρs = 2 ρw (frettes orthogonales)
    return { fcm, Ec, fcc, epsC1, epsCu, confine: true, fym, ftm, Es: 200000, epsSu };
  }
  return { fcm, Ec, fcc: fcm, epsC1: 0.002, epsCu: 0.0035, confine: false, fym, ftm, Es: 200000, epsSu };
}

/** Matériaux de calcul (MRd, annexe C) : fcd = fck/1,5, fyd = fyk/1,15, sans écrouissage. */
export function materiauxCalcul(fck: number, fyk: number, Ecm: number): Materiaux {
  return { fcm: fck / 1.5, Ec: Ecm, fcc: fck / 1.5, epsC1: 0.002, epsCu: 0.0035, confine: false, fym: fyk / 1.15, ftm: fyk / 1.15, Es: 200000, epsSu: 0.05 };
}

/** Contrainte du béton (compression positive), loi de Mander (EN 1998-2 E.1). */
export function sigmaBeton(eps: number, m: Materiaux): number {
  if (eps <= 0) return 0;
  const x = eps / m.epsC1;
  const Esec = m.fcc / m.epsC1;
  const r = m.Ec / Math.max(m.Ec - Esec, 1e-9);
  return (m.fcc * x * r) / (r - 1 + x ** r);
}

/** Contrainte de l'acier (signe de la déformation), élastique puis écrouissage linéaire jusqu'à εsu. */
export function sigmaAcier(eps: number, m: Materiaux): number {
  const a = Math.abs(eps);
  const ey = m.fym / m.Es;
  const s = a <= ey ? m.Es * a : m.fym + ((m.ftm - m.fym) * Math.min(a - ey, m.epsSu - ey)) / Math.max(m.epsSu - ey, 1e-9);
  return Math.sign(eps) * s;
}

export interface Section {
  forme: "rectangulaire" | "circulaire";
  /** Hauteur dans le sens de la flexion (m) ; largeur perpendiculaire (m) ; diamètre pour un cercle. */
  h: number;
  b: number;
  As: number; // m²
  db: number; // m
  enrobage: number; // m
}

interface Fibres {
  beton: { y: number; A: number }[];
  acier: { y: number; A: number }[];
  ymax: number;
  ys: number;
  d: number;
}

function fibres(s: Section): Fibres {
  const beton: Fibres["beton"] = [];
  const acier: Fibres["acier"] = [];
  const n = 80;
  if (s.forme === "rectangulaire") {
    for (let i = 0; i < n; i++) {
      const y = -s.h / 2 + ((i + 0.5) * s.h) / n;
      beton.push({ y, A: (s.b * s.h) / n });
    }
    const ys = s.h / 2 - s.enrobage - s.db / 2;
    acier.push({ y: ys, A: s.As / 2 }, { y: -ys, A: s.As / 2 });
    return { beton, acier, ymax: s.h / 2, ys, d: s.h / 2 + ys };
  }
  const R = s.h / 2;
  for (let i = 0; i < n; i++) {
    const y = -R + ((i + 0.5) * s.h) / n;
    beton.push({ y, A: 2 * Math.sqrt(Math.max(R * R - y * y, 0)) * (s.h / n) });
  }
  const Rs = R - s.enrobage - s.db / 2;
  const nb = 20;
  for (let k = 0; k < nb; k++) acier.push({ y: Rs * Math.cos((2 * Math.PI * k) / nb), A: s.As / nb });
  return { beton, acier, ymax: R, ys: Rs, d: R + Rs };
}

export interface PointMPhi {
  phi: number;
  M: number;
  epsC: number;
  epsS: number;
}

export interface MomentCourbure {
  points: PointMPhi[];
  premiere: { phi: number; M: number };
  ultime: { phi: number; M: number; cause: "béton" | "acier" };
  /** Idéalisation bilinéaire (E.3.2(3)) : courbure et moment à la limite élastique. */
  phiY: number;
  My: number;
  d: number;
}

/** Courbe moment-courbure sous l'effort normal N (MN, compression positive). */
export function momentCourbure(s: Section, m: Materiaux, N: number): MomentCourbure {
  const f = fibres(s);
  const efforts = (e0: number, phi: number) => {
    let Fx = 0, M = 0;
    for (const c of f.beton) {
      const sg = sigmaBeton(e0 + phi * c.y, m);
      Fx += sg * c.A;
      M += sg * c.A * c.y;
    }
    for (const a of f.acier) {
      const sg = sigmaAcier(e0 + phi * a.y, m);
      Fx += sg * a.A;
      M += sg * a.A * a.y;
    }
    return { Fx, M };
  };
  const equilibre = (phi: number) => {
    let lo = -0.08, hi = m.epsCu + 0.01;
    for (let k = 0; k < 70; k++) {
      const mid = (lo + hi) / 2;
      if (efforts(mid, phi).Fx > N) hi = mid;
      else lo = mid;
    }
    const e0 = (lo + hi) / 2;
    return { e0, M: efforts(e0, phi).M, epsC: e0 + phi * f.ymax, epsS: e0 - phi * f.ys };
  };
  const ey = m.fym / m.Es;
  const points: PointMPhi[] = [{ phi: 0, M: 0, epsC: equilibre(0).epsC, epsS: equilibre(0).epsS }];
  let premiere: { phi: number; M: number } | null = null;
  let ultime: MomentCourbure["ultime"] | null = null;
  const dphi = (2e-5 / f.d) * 2;
  let phi = 0;
  for (let k = 0; k < 4000 && !ultime; k++) {
    phi += k < 200 ? dphi : dphi * 4;
    const r = equilibre(phi);
    if (!premiere && -r.epsS >= ey) {
      // interpolation de la première plastification
      const p0 = points.at(-1)!;
      const t = (ey + p0.epsS) / (p0.epsS - r.epsS || 1);
      premiere = { phi: p0.phi + t * (phi - p0.phi), M: p0.M + t * (r.M - p0.M) };
    }
    if (r.epsC >= m.epsCu || -r.epsS >= m.epsSu) {
      const p0 = points.at(-1)!;
      const cause = r.epsC >= m.epsCu ? "béton" : "acier";
      const t = cause === "béton" ? (m.epsCu - p0.epsC) / (r.epsC - p0.epsC || 1) : (m.epsSu + p0.epsS) / (p0.epsS - r.epsS || 1);
      const pu = { phi: p0.phi + t * (phi - p0.phi), M: p0.M + t * (r.M - p0.M) };
      points.push({ ...pu, epsC: cause === "béton" ? m.epsCu : p0.epsC + t * (r.epsC - p0.epsC), epsS: cause === "acier" ? -m.epsSu : p0.epsS + t * (r.epsS - p0.epsS) });
      ultime = { ...pu, cause };
      break;
    }
    points.push({ phi, M: r.M, epsC: r.epsC, epsS: r.epsS });
  }
  if (!premiere) premiere = { phi: points.at(-1)!.phi, M: points.at(-1)!.M };
  if (!ultime) ultime = { phi: points.at(-1)!.phi, M: points.at(-1)!.M, cause: "béton" };
  // Bilinéaire à aires égales : pente K = M1/φ1 jusqu'à (φy, My), puis droite jusqu'à (φu, Mu).
  const K = premiere.M / premiere.phi;
  let aire = 0;
  for (let i = 1; i < points.length; i++) aire += ((points[i]!.M + points[i - 1]!.M) / 2) * (points[i]!.phi - points[i - 1]!.phi);
  const { phi: pu, M: Mu } = ultime;
  // aire bilinéaire(My) = My²/(2K) + (pu − My/K)(My + Mu)/2 = aire → résolution par dichotomie sur My
  let lo = 0, hi = Math.max(Mu, premiere.M) * 1.5;
  for (let k = 0; k < 80; k++) {
    const My = (lo + hi) / 2;
    const py = My / K;
    const a = py >= pu ? (Mu * pu) / 2 : (My * py) / 2 + (pu - py) * ((My + Mu) / 2);
    if (a > aire) hi = My;
    else lo = My;
  }
  const My = (lo + hi) / 2;
  return { points, premiere, ultime, phiY: Math.min(My / K, pu), My, d: f.d };
}

export interface CapacitePile {
  id: string;
  direction: DirectionPO;
  nFuts: number;
  L: number;
  N: number;
  section: Section;
  mphi: MomentCourbure;
  MRd: number;
  Lp: number;
  alphaS: number;
  thetaY: number;
  thetaPu: number;
  thetaPd: number;
  deltaY: number;
  /** Courbe effort (MN, tous fûts) - déplacement en tête (m) jusqu'à la courbure ultime. */
  courbe: { delta: number; V: number; phi: number }[];
  /** Déplacement en tête pour lequel θp = θp,d (rotation plastique de calcul atteinte). */
  deltaPd: number;
  /** Jeff / Jbrute (annexe C, méthode 2). */
  facteurInertie: number;
  armaturesParDefaut: boolean;
}

/** Courbe de capacité d'une pile (fûts en console) dans une direction. */
export function capacitePile(p: Projet, m: Modele, pile: Pile, direction: DirectionPO, Nperm: number): CapacitePile {
  const { forme, long, trans, nombre: nf, hauteur: L } = pile.futs;
  const { aire, Ix, Iy } = inerties({ ...pile, facteurInertie: 1 });
  const arm = pile.armatures;
  const As = arm ? arm.As / 1e4 : 0.01 * aire;
  const db = arm ? arm.db / 1000 : 0.025;
  const section: Section = {
    forme,
    h: forme === "circulaire" ? long : direction === "x" ? long : trans,
    b: forme === "circulaire" ? long : direction === "x" ? trans : long,
    As,
    db,
    enrobage: arm?.enrobage ?? 0.05,
  };
  const fyk = p.materiaux.acier.fyk, fck = p.materiaux.beton.fck;
  const mat = materiauxProbables(fck, fyk, p.materiaux.acier.classeDuctilite, arm?.rhoW ?? 0, m.Ecm);
  const poidsFut = (aire * L * p.materiaux.beton.masseVolumique * p.options.g) / 1000; // MN
  const N = Nperm / nf + poidsFut;
  const mphi = momentCourbure(section, mat, N);
  const MRd = Math.max(...momentCourbure(section, materiauxCalcul(fck, fyk, m.Ecm), N).points.map((x) => x.M));
  const Lp = 0.1 * L + 0.015 * fyk * db; // (E.19), fyk en MPa, dbL en m
  const alphaS = L / mphi.d;
  const thetaY = (mphi.phiY * L) / 3; // (E.17)
  const thetaPu = (mphi.ultime.phi - mphi.phiY) * Lp * (1 - Lp / (2 * L)); // (E.16b)
  const reduc = alphaS >= 3 ? 1 : Math.sqrt(alphaS / 3); // (E.20), (E.21)
  const thetaPd = (thetaPu * reduc) / 1.4; // (4.21), γR,p = 1,40
  const deltaY = (mphi.phiY * L * L) / 3;
  const EIeff = mphi.My / mphi.phiY;
  const courbe = mphi.points.map((pt) => {
    const delta = pt.phi <= mphi.phiY ? ((pt.M / EIeff) * L * L) / 3 : deltaY + (pt.phi - mphi.phiY) * Lp * (L - Lp / 2);
    // effets du second ordre (4.2.5(1)P) : moment en pied M = V L + N δ ⇒ V = (M − N δ)/L
    return { delta, V: (nf * (pt.M - N * delta)) / L, phi: pt.phi };
  });
  const deltaPd = deltaY + thetaPd * L; // θp = (φ − φy) Lp (1 − Lp/2L) = δp / L
  const Iun = direction === "x" ? Ix : Iy;
  const Jeff = (1.2 * MRd) / (m.Ecm * mphi.phiY); // (C.3), un fût (inerties() est par fût)
  return {
    id: pile.id,
    direction,
    nFuts: nf,
    L,
    N,
    section,
    mphi,
    MRd,
    Lp,
    alphaS,
    thetaY,
    thetaPu,
    thetaPd,
    deltaY,
    courbe,
    deltaPd,
    facteurInertie: Math.min(1, Jeff / Iun),
    armaturesParDefaut: !arm,
  };
}

/** Effort d'une pile pour un déplacement en tête δ (interpolation sur la courbe ; palier au-delà). */
export function effortPile(c: CapacitePile, delta: number): number {
  const pts = c.courbe;
  if (delta <= 0) return 0;
  for (let i = 1; i < pts.length; i++) {
    if (delta <= pts[i]!.delta) {
      const a = pts[i - 1]!, b = pts[i]!;
      return a.V + ((b.V - a.V) * (delta - a.delta)) / Math.max(b.delta - a.delta, 1e-12);
    }
  }
  return pts.at(-1)!.V;
}

export interface EtatPushover {
  D: number;
  V: number;
  piles: { id: string; delta: number; F: number; plastique: boolean; thetaP: number; rapport: number }[];
  culees: { id: string; F: number }[];
}

export interface Pushover {
  direction: DirectionPO;
  capacites: CapacitePile[];
  etats: EtatPushover[];
  evenements: { D: number; texte: string }[];
  /** Déplacement cible (H.1) et méthode N2 (annexe B de l'EN 1998-1). */
  cible: { dT: number; Teff: number; n2: { mEtoile: number; Fy: number; dy: number; dm: number; Tetoile: number; dt: number; qu: number } };
  /** État de déformation ultime de calcul (H.3(2)) : premier fût où θp = θp,d. */
  ultime: { D: number; pile: string } | null;
  aCible: EtatPushover;
  verifiee: boolean;
  remarques: string[];
}

export function reactionPermanente(p: Projet, i: number, M: number): number {
  const ap = p.appuis[i]!;
  if (ap.chargesPermanentes) return (ap.chargesPermanentes.Nmax + ap.chargesPermanentes.Nmin) / 2;
  const t = p.tablier.travees;
  const L = (i > 0 ? t[i - 1] ?? 0 : 0) / 2 + (i < t.length ? t[i] ?? 0 : 0) / 2;
  return (M * p.options.g * L) / derives(p).longueur / 1000;
}

/** Poussée progressive du pont dans une direction. */
export function pushover(p: Projet, a: ActionSismique, direction: DirectionPO): Pushover {
  const m = modele(p);
  const remarques: string[] = [];
  const raideurs = m.directions[direction].appuis;
  const piles = p.appuis.map((ap, i) => ({ ap, i })).filter((x): x is { ap: Pile; i: number } => x.ap.type === "pile");
  const capacites = piles.map(({ ap, i }) => capacitePile(p, m, ap, direction, reactionPermanente(p, i, m.masses.M)));
  for (const c of capacites) if (c.alphaS < 2) remarques.push(`${c.id} : fût trapu dans cette direction (αs = L/d = ${nombre(c.alphaS, 2)} < 2) : l'effort tranchant (traction diagonale, glissement) est à vérifier en capacité (EN 1998-2 5.6.3.4) ; le modèle en flexion n'est qu'indicatif${c.alphaS < 1 ? ", et la réduction √(αs/3) de l'annexe E n'est définie que pour αs ≥ 1" : ""}.`);
  if (capacites.some((c) => c.armaturesParDefaut)) remarques.push("Armatures longitudinales non saisies pour certains fûts : 1 % de la section, barres de 25 mm, enrobage 5 cm.");

  // Déplacement cible (H.1) : multimodale avec q = 1 et rigidité effective des fûts.
  const pe = structuredClone(p);
  pe.comportement.qLongitudinal = 1;
  pe.comportement.qTransversal = 1;
  capacites.forEach((c) => {
    const ap = pe.appuis.find((x) => x.id === c.id) as Pile;
    ap.facteurInertie = c.facteurInertie;
  });
  const me = modele(pe);
  // Spectre de calcul avec q = 1 (plateau 2,5) ; η est appliqué aux déplacements par reponseDirection (2.3.6.1).
  const ae: ActionSismique = { ...a, q: { ...a.q, longitudinal: 1, transversal: 1 }, spectres: { ...a.spectres, calculLong: { ...a.spectres.calculLong, plateau: 2.5 }, calculTrans: { ...a.spectres.calculTrans, plateau: 2.5 } } };
  const rep = reponseDirection(pe, ae, me, direction, "lbdp");
  const dT = rep.appuis.reduce((s, x) => s + x.dTablier, 0) / Math.max(rep.appuis.length, 1);
  const Teff = rep.modes.reduce((b, x) => (x.masseEffective > b.masseEffective ? x : b), rep.modes[0]!).T;

  // Équilibre pour un déplacement de tablier D (tablier indéformable dans son plan).
  const etat = (D: number): EtatPushover => {
    const ep = capacites.map((c, k) => {
      const ra = raideurs[piles[k]!.i]!;
      const ka = ra.kAppareils.lbdp;
      let delta: number;
      if (ka === 0) delta = 0;
      else if (ka === Infinity) delta = D;
      else {
        let lo = 0, hi = D;
        for (let it = 0; it < 60; it++) {
          const mid = (lo + hi) / 2;
          if (ka * (D - mid) > effortPile(c, mid)) lo = mid;
          else hi = mid;
        }
        delta = (lo + hi) / 2;
      }
      const F = ka === 0 ? 0 : effortPile(c, delta);
      const thetaP = delta > c.deltaY ? (delta - c.deltaY) / c.L : 0;
      return { id: c.id, delta, F, plastique: delta > c.deltaY, thetaP, rapport: thetaP / c.thetaPd };
    });
    const culees = p.appuis
      .map((ap, i) => ({ ap, i }))
      .filter((x) => x.ap.type === "culee")
      .map(({ ap, i }) => {
        const k = raideurs[i]!.kTotal.lbdp;
        return { id: ap.id, F: Number.isFinite(k) ? k * D : NaN };
      });
    const V = ep.reduce((s, x) => s + x.F, 0) + culees.reduce((s, x) => s + (Number.isFinite(x.F) ? x.F : 0), 0);
    return { D, V, piles: ep, culees };
  };
  if (raideurs.some((r) => r.type === "culee" && r.kTotal.lbdp === Infinity)) remarques.push("Tablier bloqué sur une culée rigide dans cette direction : les piles ne sont pas sollicitées par la poussée.");

  // Plage de déplacement : au-delà de la cible et de la première rotule à θp,d.
  const Dlim = (c: CapacitePile, k: number, delta: number) => {
    const ka = raideurs[piles[k]!.i]!.kAppareils.lbdp;
    return ka === Infinity ? delta : ka === 0 ? Infinity : delta + effortPile(c, delta) / ka;
  };
  const Dpd = capacites.map((c, k) => Dlim(c, k, c.deltaPd));
  const Du = capacites.map((c, k) => Dlim(c, k, c.courbe.at(-1)!.delta));
  // Jusqu'à l'état ultime de calcul (+ 15 %), sans dépasser la courbure ultime ; au moins 1,3 dT.
  const dPdMin = Math.min(...Dpd.filter(Number.isFinite));
  const dUMin = Math.min(...Du.filter(Number.isFinite));
  const Dmax = Math.max(1.3 * dT, Number.isFinite(dPdMin) ? Math.min(1.15 * dPdMin, dUMin) : 3 * dT, 0.01);
  const etats: EtatPushover[] = [];
  for (let k = 0; k <= 120; k++) etats.push(etat((Dmax * k) / 120));
  const evenements: Pushover["evenements"] = [];
  capacites.forEach((c, k) => {
    const Dy = Dlim(c, k, c.deltaY);
    if (Number.isFinite(Dy)) evenements.push({ D: Dy, texte: `${c.id} : plastification (My = ${nombre(c.mphi.My * c.nFuts, 2)} MN·m)` });
    if (Number.isFinite(Dpd[k]!)) evenements.push({ D: Dpd[k]!, texte: `${c.id} : rotation plastique de calcul θp,d atteinte` });
  });
  evenements.push({ D: dT, texte: "déplacement cible dT (H.1)" });
  evenements.sort((x, y) => x.D - y.D);
  const kmin = Dpd.reduce((b, v, k) => (v < (Dpd[b] ?? Infinity) ? k : b), 0);
  const ultime = capacites.length && Number.isFinite(Dpd[kmin]!) ? { D: Dpd[kmin]!, pile: capacites[kmin]!.id } : null;

  // Méthode N2 (EN 1998-1 annexe B), Γ = 1 (tablier rigide, masse du tablier).
  const mEtoile = m.masses.M; // t
  // B.3 : F*y = effort à la formation du mécanisme plastique (toutes les piles plastifiées), d*m le déplacement correspondant.
  const Dmeca = Math.max(...capacites.map((c, k) => Dlim(c, k, c.deltaY)));
  const Dm = Number.isFinite(Dmeca) && Dmeca > 0 && Dmeca <= Dmax ? Dmeca : ultime ? Math.min(ultime.D, Dmax) : Dmax;
  const pts = etats.filter((e) => e.D <= Dm + 1e-12);
  let Em = 0;
  for (let k = 1; k < pts.length; k++) Em += ((pts[k]!.V + pts[k - 1]!.V) / 2) * (pts[k]!.D - pts[k - 1]!.D);
  const Fy = etat(Dm).V;
  const dy = Math.min(Dm, Math.max(1e-6, 2 * (Dm - Em / Fy)));
  const Tetoile = 2 * Math.PI * Math.sqrt((mEtoile / 1000) * dy / Fy);
  const Se = valeur(a.spectres.elastiqueH, Tetoile);
  const det = Se * (Tetoile / (2 * Math.PI)) ** 2;
  const qu = (Se * mEtoile) / 1000 / Fy;
  const dtN2 = Tetoile >= a.TC || qu <= 1 ? det : Math.max(det, (det / qu) * (1 + ((qu - 1) * a.TC) / Tetoile));

  return {
    direction,
    capacites,
    etats,
    evenements,
    cible: { dT, Teff, n2: { mEtoile, Fy, dy, dm: Dm, Tetoile, dt: dtN2, qu } },
    ultime,
    aCible: etat(dT),
    verifiee: !ultime || ultime.D >= dT,
    remarques,
  };
}

/** Note de calcul de la poussée progressive (deux directions). */
export function notePushover(res: Pushover[]): SectionNote[] {
  const sections: SectionNote[] = [];
  for (const r of res) {
    const nom = r.direction === "x" ? "longitudinale (X)" : "transversale (Y)";
    const lignes: LigneNote[] = [];
    for (const c of r.capacites) {
      lignes.push(
        {
          id: `po_${r.direction}_${c.id}_mphi`,
          titre: `${c.id} — loi moment-courbure d'un fût (N = ${nombre(c.N, 2)} MN)`,
          resultat: { symbole: "M_y ;\\ \\varphi_y ;\\ \\varphi_u", valeur: `${nombre(c.mphi.My, 3)} MN·m ; ${nombre(1000 * c.mphi.phiY, 3)} ‰/m ; ${nombre(1000 * c.mphi.ultime.phi, 2)} ‰/m (rupture côté ${c.mphi.ultime.cause})` },
          references: ["capacite_rotation"],
          commentaire: `Première plastification ${nombre(c.mphi.premiere.M, 3)} MN·m ; MRd ≈ ${nombre(c.MRd, 3)} MN·m ; Jeff/Jbrute = ${nombre(c.facteurInertie, 3)} (annexe C).`,
        },
        {
          id: `po_${r.direction}_${c.id}_rot`,
          titre: `${c.id} — capacité de rotation plastique`,
          formule: "L_p = 0{,}10\\,L + 0{,}015\\,f_{yk}\\,d_{bL}, \\quad \\theta_{p,u} = (\\varphi_u - \\varphi_y)\\,L_p\\left(1 - \\dfrac{L_p}{2L}\\right), \\quad \\theta_{p,d} = \\dfrac{\\theta_{p,u}}{\\gamma_{R,p}}",
          application: `L_p = ${tex(c.Lp, 3)}\\ \\text{m},\\ \\theta_{p,u} = ${tex(1000 * c.thetaPu, 2)}\\ \\text{mrad}`,
          resultat: { symbole: "\\theta_{p,d}", valeur: 1000 * c.thetaPd, unite: "mrad", decimales: 2 },
          references: ["capacite_rotation"],
          commentaire: `L/d = ${nombre(c.alphaS, 2)}${c.alphaS < 3 ? " < 3 : capacité réduite par √(αs/3)" : ""} ; γR,p = 1,40.`,
        },
      );
      const e = r.aCible.piles.find((x) => x.id === c.id)!;
      lignes.push({
        id: `po_${r.direction}_${c.id}_dem`,
        titre: `${c.id} — demande au déplacement cible`,
        formule: "\\theta_{p,E} \\le \\theta_{p,d}",
        application: `${tex(1000 * e.thetaP, 2)} \\le ${tex(1000 * c.thetaPd, 2)}\\ \\text{mrad}`,
        resultat: { symbole: "", valeur: e.plastique ? (e.rapport <= 1 ? "vérifié" : "non vérifié") : "fût élastique (pas de rotule)" },
        references: ["poussee_progressive", "capacite_rotation"],
        niveau: e.rapport > 1 ? "alerte" : undefined,
      });
    }
    lignes.push(
      {
        id: `po_${r.direction}_cible`,
        titre: "Déplacement cible (H.1)",
        formule: "d_T = d_E\\ \\text{(multimodale, } q = 1\\text{, rigidité effective des fûts)}",
        resultat: { symbole: "d_T", valeur: 100 * r.cible.dT, unite: "cm", decimales: 2 },
        references: ["poussee_progressive", "rigidite_effective"],
        commentaire: `Méthode N2 (EN 1998-1 annexe B) : T* = ${nombre(r.cible.n2.Tetoile, 3)} s, d*t = ${nombre(100 * r.cible.n2.dt, 2)} cm.`,
      },
      {
        id: `po_${r.direction}_ultime`,
        titre: "État de déformation ultime de calcul (H.3(2))",
        resultat: { symbole: "d_u", valeur: r.ultime ? `${nombre(100 * r.ultime.D, 2)} cm (${r.ultime.pile})` : "non atteint (appareils glissants)" },
        references: ["poussee_progressive"],
        commentaire: r.verifiee ? "d_u ≥ d_T : dimensionnement satisfaisant." : "d_u < d_T : dimensionnement à reprendre (H.3(2)).",
        niveau: r.verifiee ? undefined : "alerte",
      },
    );
    sections.push({ id: `po_${r.direction}`, titre: `Poussée progressive — direction ${nom}`, lignes });
  }
  return sections;
}
