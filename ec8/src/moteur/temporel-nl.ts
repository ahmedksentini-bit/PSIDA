// Calcul temporel non linéaire simplifié (EN 1998-2 4.2.4).
//  · Modèle : tablier indéformable dans son plan (un degré de liberté par direction, masse M du tablier),
//    chaque pile = fût non linéaire en série avec ses appareils d'appui (linéaires), culées linéaires.
//  · Fût : courbe effort-déplacement de la poussée progressive (lois moment-courbure en fibres, rotule L_p, second ordre),
//    idéalisée en bilinéaire (V_y, δ_y, pente post-élastique éventuellement négative par l'effet P-Δ).
//  · Lois d'hystérésis (4.2.4.4(2)b : forme des boucles) : Takeda modifié (dégradation de la raideur de décharge
//    k_u = k_0 (d_y/d_max)^0,5, recharge vers le point extrême opposé) ou bilinéaire à écrouissage cinématique.
//  · Intégration : différences centrales à pas réduit, amortissement visqueux ξ sur la raideur initiale.
//  · Valeurs de calcul (4.2.4.3) : moyenne des réponses si au moins 7 accélérogrammes, sinon maximum.
//  · Vérification (4.2.4.4(2)c) : θ_p,E ≤ θ_p,d en chaque rotule.
// Unités : m, MN, t, s.

import type { Projet } from "../projet/types.ts";
import type { ActionSismique } from "./action.ts";
import { modele, type Borne } from "./modele.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";
import { effortPile, pushover, type DirectionPO, type Pushover } from "./pushover.ts";
import { reponseOscillateur, type Accelerogramme, type JeuAccelerogrammes } from "./temporel.ts";

export type LoiHysteresis = "takeda" | "bilineaire" | "lineaire";

export interface ParametresHysteresis {
  k0: number;
  Fy: number;
  k2: number;
  /** Exposant de dégradation de la raideur de décharge (Takeda modifié). */
  beta: number;
  loi: LoiHysteresis;
}

/** État d'un ressort hystérétique (branche courante, points extrêmes, point d'origine de la branche). */
export interface EtatHysteresis {
  D: number;
  F: number;
  branche: "vierge" | "enveloppe" | "decharge" | "recharge";
  Dp: number; Fp: number; Dn: number; Fn: number;
  Da: number; Fa: number; k: number;
  Dt: number; Ft: number;
  plastifie: boolean;
}

export function etatInitial(p: ParametresHysteresis): EtatHysteresis {
  const Dy = p.Fy / p.k0;
  return { D: 0, F: 0, branche: "vierge", Dp: Dy, Fp: p.Fy, Dn: -Dy, Fn: -p.Fy, Da: 0, Fa: 0, k: p.k0, Dt: 0, Ft: 0, plastifie: false };
}

/** Courbe enveloppe (monotone) symétrique ; avec une pente négative, l'effort ne change pas de signe. */
export function enveloppe(p: ParametresHysteresis, D: number): number {
  const Dy = p.Fy / p.k0;
  const a = Math.abs(D);
  if (a <= Dy) return p.k0 * D;
  return Math.sign(D) * Math.max(0, p.Fy + p.k2 * (a - Dy));
}

/** Avance le ressort jusqu'au déplacement D (petits incréments) et renvoie l'effort. */
export function avancer(s: EtatHysteresis, p: ParametresHysteresis, D: number): number {
  const dD = D - s.D;
  if (dD === 0) return s.F;
  const dir = Math.sign(dD);
  const Dy = p.Fy / p.k0;
  if (p.loi === "lineaire") {
    s.D = D;
    s.F = p.k0 * D;
    return s.F;
  }
  if (p.loi === "bilineaire") {
    const essai = s.F + p.k0 * dD;
    const haut = p.Fy + p.k2 * (D - Dy), bas = -p.Fy + p.k2 * (D + Dy);
    let F = Math.min(Math.max(essai, bas), haut);
    if (F !== essai) s.plastifie = true;
    if (p.k2 < 0) F = D >= 0 ? Math.min(F, Math.max(0, haut)) : Math.max(F, Math.min(0, bas));
    s.D = D;
    s.F = F;
    return F;
  }
  // Takeda modifié
  const pic = (signe: number) => (signe > 0 ? { D: s.Dp, F: s.Fp } : { D: s.Dn, F: s.Fn });
  const majPic = () => {
    if (s.D > 0 && s.D >= s.Dp) { s.Dp = s.D; s.Fp = s.F; }
    if (s.D < 0 && s.D <= s.Dn) { s.Dn = s.D; s.Fn = s.F; }
  };
  const versEnveloppe = () => {
    s.branche = "enveloppe";
    s.F = enveloppe(p, s.D);
    if (Math.abs(s.D) > Dy) s.plastifie = true;
    majPic();
  };
  const recharge = (Da: number, Fa: number, signe: number) => {
    const t = pic(signe);
    s.Da = Da; s.Fa = Fa; s.Dt = t.D; s.Ft = t.F;
    s.k = Math.abs(t.D - Da) > 1e-12 ? (t.F - Fa) / (t.D - Da) : p.k0;
    s.branche = "recharge";
  };
  const decharge = () => {
    const Dm = Math.max(Math.abs(s.F >= 0 ? s.Dp : s.Dn), Dy);
    s.Da = s.D; s.Fa = s.F;
    s.k = p.k0 * Math.pow(Dy / Dm, p.beta);
    s.branche = "decharge";
  };
  switch (s.branche) {
    case "vierge":
      s.D = D;
      if (Math.abs(D) <= Dy) s.F = p.k0 * D;
      else versEnveloppe();
      return s.F;
    case "enveloppe":
      if (dir === Math.sign(s.D)) {
        s.D = D;
        versEnveloppe();
        return s.F;
      }
      decharge();
      break;
    case "recharge":
      if (dir !== Math.sign(s.Ft)) decharge();
      break;
  }
  if (s.branche === "decharge") {
    const F = s.Fa + s.k * (D - s.Da);
    if (dir === Math.sign(s.Fa) && (D - s.Da) * Math.sign(s.Fa) >= 0) {
      // retour au-delà du point de décharge : recharge vers le pic de ce côté
      s.D = s.Da; s.F = s.Fa;
      recharge(s.Da, s.Fa, Math.sign(s.Fa));
    } else if (Math.sign(F) !== Math.sign(s.Fa) && s.Fa !== 0) {
      const D0 = s.Da - s.Fa / s.k;
      recharge(D0, 0, dir);
    } else {
      s.D = D;
      s.F = F;
      return F;
    }
  }
  // branche de recharge
  const F = s.Fa + s.k * (D - s.Da);
  s.D = D;
  if ((D - s.Dt) * Math.sign(s.Ft) >= 0) versEnveloppe();
  else s.F = F;
  return s.F;
}

export interface ElementNL {
  id: string;
  /** Raideur des appareils (MN/m) ; Infinity : fixes ; 0 : glissants. */
  kb: number;
  pile: ParametresHysteresis;
  /** Ressort équivalent appareils + fût (en série). */
  serie: ParametresHysteresis;
  L: number;
  deltaY: number;
  thetaPd: number;
  Vy: number;
}

const serie = (a: number, b: number) => (a === Infinity ? b : b === Infinity ? a : (a * b) / (a + b));

export interface OptionsNL {
  loi: LoiHysteresis;
  borne: Borne;
  /** Multiplicateur de l'action (1 = séisme de calcul). */
  lambda: number;
  beta?: number;
}

export interface ReponseAccelerogramme {
  graine: number;
  Dmax: number;
  DmaxLineaire: number;
  piles: { id: string; deltaMax: number; mu: number; thetaP: number; Fmax: number; residu: number; energie: number }[];
  residuTablier: number;
  /** L'effort d'un fût est retombé à zéro (instabilité par le second ordre). */
  effondrement: boolean;
}

export interface HistoriqueNL {
  dt: number;
  t: number[];
  ag: number[];
  D: number[];
  DLin: number[];
  /** Par pile : effort (MN) et déplacement de tête du fût (m). */
  F: number[][];
  delta: number[][];
}

export interface TemporelNL {
  direction: DirectionPO;
  options: OptionsNL;
  M: number;
  T0: number;
  xi: number;
  elements: ElementNL[];
  kCulees: number;
  reponses: ReponseAccelerogramme[];
  /** Valeurs de calcul (4.2.4.3) : moyenne si ≥ 7 accélérogrammes, sinon maximum. */
  calcul: { regle: "moyenne" | "maximum"; Dmax: number; DmaxLineaire: number; piles: { id: string; deltaMax: number; mu: number; thetaP: number; thetaPd: number; Fmax: number; ok: boolean }[] };
  po: Pushover;
  remarques: string[];
}

/** Modèle non linéaire d'une direction, construit sur la poussée progressive. */
export function modeleNL(p: Projet, a: ActionSismique, direction: DirectionPO, o: OptionsNL, po = pushover(p, a, direction)) {
  const m = modele(p);
  const raideurs = m.directions[direction].appuis;
  const remarques: string[] = [];
  const elements: ElementNL[] = po.capacites.map((c) => {
    const i = p.appuis.findIndex((x) => x.id === c.id);
    const kb = raideurs[i]!.kAppareils[o.borne];
    const Vy = effortPile(c, c.deltaY);
    const k0 = Vy / c.deltaY;
    const dFin = c.courbe.at(-1)!.delta;
    const k2 = dFin > c.deltaY * 1.001 ? (effortPile(c, dFin) - Vy) / (dFin - c.deltaY) : 0;
    const pile: ParametresHysteresis = { k0, Fy: Vy, k2, beta: o.beta ?? 0.5, loi: o.loi };
    const k0s = serie(kb, k0), k2s = k2 === 0 ? 0 : serie(kb, k2);
    return { id: c.id, kb, pile, serie: { ...pile, k0: k0s, k2: kb === Infinity ? k2 : k2s }, L: c.L, deltaY: c.deltaY, thetaPd: c.thetaPd, Vy };
  });
  let kCulees = 0;
  p.appuis.forEach((ap, i) => {
    if (ap.type !== "culee") return;
    const k = raideurs[i]!.kTotal[o.borne];
    if (k === Infinity) remarques.push(`${ap.id} : culée bloquée dans cette direction ; le tablier ne se déplace pas, les piles ne sont pas sollicitées.`);
    else kCulees += k;
  });
  const actifs = elements.filter((e) => e.kb > 0);
  if (!actifs.length) remarques.push("Aucune pile liée au tablier dans cette direction (appareils glissants) : la réponse est celle des culées.");
  const K0 = actifs.reduce((s, e) => s + e.serie.k0, 0) + kCulees;
  return { m, elements, kCulees, K0, M: m.masses.M, remarques };
}

/** Réponse à un accélérogramme (différences centrales). */
export function reponseNL(mod: ReturnType<typeof modeleNL>, acc: Accelerogramme, xi: number, lambda: number, loi: LoiHysteresis, garderHistorique = false, pas = 2) {
  const M = mod.M / 1000; // MN·s²/m
  const actifs = mod.elements.filter((e) => e.kb > 0 && mod.K0 < Infinity);
  const params = actifs.map((e) => ({ ...e.serie, loi }));
  const etats = params.map((pp) => etatInitial(pp));
  const K0 = mod.K0;
  const omega = Math.sqrt(K0 / M);
  const c = 2 * xi * omega * M;
  const n0 = acc.a.length;
  // vibrations libres après le séisme (2 T0 + 2 s) pour mesurer le déplacement résiduel
  const n = n0 + Math.ceil((2 * (2 * Math.PI) / Math.sqrt(K0 / M) + 2) / acc.dt);
  const sub = Math.max(4, Math.ceil(acc.dt / ((2 * Math.PI) / omega / 40)));
  const h = acc.dt / sub;
  let u = 0, uPrec = 0, uAvant = 0;
  const res = actifs.map(() => ({ deltaMax: 0, Fmax: 0, energie: 0 }));
  let Dmax = 0;
  const hist: HistoriqueNL | null = garderHistorique ? { dt: acc.dt, t: [], ag: [], D: [], DLin: [], F: actifs.map(() => []), delta: actifs.map(() => []) } : null;
  const forces = new Array<number>(actifs.length).fill(0);
  const residus: number[][] = actifs.map(() => []);
  const resD: number[] = [];
  const tFin = (n - 1) * acc.dt;
  const T0 = (2 * Math.PI) / omega;
  // départ au repos : u(−h) = 0 (accélération initiale nulle)
  // Effondrement : l'effort d'un fût retombe à zéro sur l'enveloppe (pente négative, effet P-Δ).
  const dEff = Math.min(...actifs.map((e) => (e.pile.k2 < 0 ? (e.deltaY + e.pile.Fy / -e.pile.k2) * 1.0 + (e.kb === Infinity ? 0 : e.pile.Fy / e.kb) : Infinity)));
  let effondrement = false;
  for (let i = 0; i + 1 < n && !effondrement; i++) {
    const a0 = lambda * (acc.a[i] ?? 0), a1 = lambda * (acc.a[i + 1] ?? 0); // nul au-delà du signal
    for (let k = 0; k < sub; k++) {
      const ag = a0 + ((a1 - a0) * k) / sub;
      let R = mod.kCulees * u;
      for (let j = 0; j < actifs.length; j++) {
        const Fold = forces[j]!;
        const F = avancer(etats[j]!, params[j]!, u);
        const e = actifs[j]!;
        const dPile = e.kb === Infinity ? u : u - F / e.kb;
        res[j]!.energie += ((F + Fold) / 2) * (u - uAvant);
        forces[j] = F;
        res[j]!.deltaMax = Math.max(res[j]!.deltaMax, Math.abs(dPile));
        res[j]!.Fmax = Math.max(res[j]!.Fmax, Math.abs(F));
        R += F;
      }
      uAvant = u;
      const uSuiv = (h * h * (-M * ag - R) + 2 * M * u - (M - (c * h) / 2) * uPrec) / (M + (c * h) / 2);
      uPrec = u;
      u = uSuiv;
      Dmax = Math.max(Dmax, Math.abs(u));
      if (Math.abs(u) >= dEff || !Number.isFinite(u)) effondrement = true;
      if (effondrement) break;
    }
    const t = (i + 1) * acc.dt;
    if (t > tFin - T0) {
      resD.push(u);
      actifs.forEach((e, j) => residus[j]!.push(e.kb === Infinity ? u : u - forces[j]! / e.kb));
    }
    if (hist && i % pas === 0) {
      hist.t.push(t);
      hist.ag.push(a1);
      hist.D.push(u);
      actifs.forEach((e, j) => {
        hist.F[j]!.push(forces[j]!);
        hist.delta[j]!.push(e.kb === Infinity ? u : u - forces[j]! / e.kb);
      });
    }
  }
  const moy = (x: number[]) => (x.length ? x.reduce((s, y) => s + y, 0) / x.length : 0);
  // Réponse élastique de référence : même oscillateur, raideur initiale, Nigam et Jennings.
  const agL = new Float64Array(n);
  for (let i = 0; i < n0; i++) agL[i] = lambda * (acc.a[i] ?? 0);
  const uL = reponseOscillateur(agL, acc.dt, omega, xi);
  let DmaxLineaire = 0;
  for (const x of uL) DmaxLineaire = Math.max(DmaxLineaire, Math.abs(x));
  if (hist) for (let i = 0; i < hist.t.length; i++) hist.DLin.push(uL[Math.min(uL.length - 1, Math.round(hist.t[i]! / acc.dt))] ?? 0);
  const piles = actifs.map((e, j) => {
    const r = res[j]!;
    return {
      id: e.id,
      deltaMax: r.deltaMax,
      mu: r.deltaMax / e.deltaY,
      thetaP: Math.max(0, r.deltaMax - e.deltaY) / e.L,
      Fmax: r.Fmax,
      residu: moy(residus[j]!),
      energie: r.energie,
    };
  });
  if (effondrement) for (const q of piles) { q.deltaMax = Infinity; q.mu = Infinity; q.thetaP = Infinity; q.residu = NaN; }
  return { reponse: { graine: acc.graine, Dmax: effondrement ? Infinity : Dmax, DmaxLineaire, piles, residuTablier: effondrement ? NaN : moy(resD), effondrement } as ReponseAccelerogramme, historique: hist, omega };
}

/** Calcul temporel non linéaire d'une direction sur un jeu d'accélérogrammes. */
export function temporelNonLineaire(p: Projet, a: ActionSismique, direction: DirectionPO, jeu: JeuAccelerogrammes, o: OptionsNL, po?: Pushover): TemporelNL {
  const poussee = po ?? pushover(p, a, direction);
  const mod = modeleNL(p, a, direction, o, poussee);
  const xi = p.comportement.amortissement / 100;
  const remarques = [...mod.remarques, ...poussee.remarques];
  const bloque = mod.K0 === Infinity;
  const reponses = bloque ? [] : jeu.accelerogrammes.map((acc) => reponseNL(mod, acc, xi, o.lambda, o.loi).reponse);
  const regle = reponses.length >= 7 ? "moyenne" : "maximum";
  const agr = (x: number[]) => (regle === "moyenne" ? x.reduce((s, y) => s + y, 0) / Math.max(x.length, 1) : Math.max(0, ...x));
  const ids = reponses[0]?.piles.map((x) => x.id) ?? [];
  const piles = ids.map((id) => {
    const e = mod.elements.find((x) => x.id === id)!;
    const val = (f: (q: ReponseAccelerogramme["piles"][number]) => number) => agr(reponses.map((r) => f(r.piles.find((x) => x.id === id)!)));
    const thetaP = val((q) => q.thetaP);
    return { id, deltaMax: val((q) => q.deltaMax), mu: val((q) => q.mu), thetaP, thetaPd: e.thetaPd, Fmax: val((q) => q.Fmax), ok: thetaP <= e.thetaPd };
  });
  const nEff = reponses.filter((x) => x.effondrement).length;
  if (nEff) remarques.unshift(`Effondrement sous ${nEff} accélérogramme(s) sur ${reponses.length} : l'effort des fûts retombe à zéro (instabilité par le second ordre).`);
  if (mod.elements.some((e) => e.pile.k2 < 0)) remarques.push("Pente post-élastique négative (effet P-Δ) : les fûts plastifiés perdent de la résistance ; surveiller le déplacement résiduel.");
  return {
    direction,
    options: o,
    M: mod.M,
    T0: bloque ? 0 : 2 * Math.PI * Math.sqrt(mod.M / 1000 / mod.K0),
    xi,
    elements: mod.elements,
    kCulees: mod.kCulees,
    reponses,
    calcul: { regle, Dmax: agr(reponses.map((r) => r.Dmax)), DmaxLineaire: agr(reponses.map((r) => r.DmaxLineaire)), piles },
    po: poussee,
    remarques,
  };
}

/** Historique détaillé pour un accélérogramme (boucles, animation). */
export function historiqueNL(p: Projet, a: ActionSismique, direction: DirectionPO, acc: Accelerogramme, o: OptionsNL, po?: Pushover): HistoriqueNL | null {
  const mod = modeleNL(p, a, direction, o, po);
  if (mod.K0 === Infinity) return null;
  return reponseNL(mod, acc, p.comportement.amortissement / 100, o.lambda, o.loi, true).historique;
}

const LOIS: Record<LoiHysteresis, string> = { takeda: "Takeda modifié", bilineaire: "bilinéaire cinématique", lineaire: "linéaire" };

export function noteTemporelNL(r: TemporelNL): SectionNote[] {
  const nom = r.direction === "x" ? "longitudinale (X)" : "transversale (Y)";
  const lignes: LigneNote[] = [
    {
      id: `tnl_${r.direction}_modele`,
      titre: "Modèle non linéaire",
      resultat: { symbole: "T_0", valeur: r.T0, unite: "s", decimales: 3 },
      references: ["calcul_temporel_non_lineaire"],
      commentaire: `Tablier indéformable de masse ${nombre(r.M, 0)} t ; ${r.elements.length} pile(s) non linéaire(s) (loi ${LOIS[r.options.loi]}), appareils ${r.options.borne.toUpperCase()} en série, culées ${nombre(r.kCulees, 2)} MN/m ; amortissement ${nombre(100 * r.xi, 1)} % sur la raideur initiale ; action × ${nombre(r.options.lambda, 2)}.`,
    },
  ];
  for (const e of r.elements) {
    lignes.push({
      id: `tnl_${r.direction}_${e.id}_loi`,
      titre: `${e.id} — idéalisation bilinéaire du fût (second ordre compris)`,
      formule: "V_y = V(\\delta_y),\\quad k_0 = V_y/\\delta_y,\\quad k_2 = \\dfrac{V(\\delta_u) - V_y}{\\delta_u - \\delta_y}",
      application: `V_y = ${tex(1000 * e.Vy, 0)}\\ \\text{kN},\\ \\delta_y = ${tex(100 * e.deltaY, 2)}\\ \\text{cm},\\ k_0 = ${tex(e.pile.k0, 2)},\\ k_2 = ${tex(e.pile.k2, 3)}\\ \\text{MN/m}`,
      resultat: { symbole: "k_b", valeur: e.kb === Infinity ? "appareils fixes" : e.kb === 0 ? "appareils glissants" : `${nombre(e.kb, 2)} MN/m` },
      references: ["capacite_rotation", "calcul_temporel_non_lineaire"],
    });
  }
  for (const q of r.calcul.piles) {
    lignes.push({
      id: `tnl_${r.direction}_${q.id}_verif`,
      titre: `${q.id} — rotation plastique (${r.calcul.regle} sur ${r.reponses.length} accélérogrammes)`,
      formule: "\\theta_{p,E} = \\dfrac{\\max|\\delta| - \\delta_y}{L} \\le \\theta_{p,d}",
      application: Number.isFinite(q.thetaP) ? `${tex(1000 * q.thetaP, 2)} \\le ${tex(1000 * q.thetaPd, 2)}\\ \\text{mrad}` : "\\text{effondrement}",
      resultat: Number.isFinite(q.mu) ? { symbole: "\\mu_\\delta", valeur: q.mu, decimales: 2 } : { symbole: "\\mu_\\delta", valeur: "effondrement" },
      references: ["calcul_temporel_non_lineaire", "capacite_rotation"],
      commentaire: !Number.isFinite(q.thetaP) ? "effondrement (second ordre)" : q.thetaP > 0 ? (q.ok ? "vérifié" : "non vérifié") : "fût resté élastique",
      niveau: q.ok ? undefined : "alerte",
    });
  }
  lignes.push({
    id: `tnl_${r.direction}_deplacement`,
    titre: "Déplacement du tablier",
    resultat: Number.isFinite(r.calcul.Dmax) ? { symbole: "d_E", valeur: 100 * r.calcul.Dmax, unite: "cm", decimales: 2 } : { symbole: "d_E", valeur: "effondrement" },
    references: ["calcul_temporel_non_lineaire"],
    commentaire: `Calcul élastique de même raideur initiale : ${nombre(100 * r.calcul.DmaxLineaire, 2)} cm (règle des déplacements égaux) ; poussée progressive : d_T = ${nombre(100 * r.po.cible.dT, 2)} cm.`,
  });
  return [{ id: `tnl_${r.direction}`, titre: `Calcul temporel non linéaire — direction ${nom}`, lignes }];
}
