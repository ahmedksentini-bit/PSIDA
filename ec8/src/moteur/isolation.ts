// Ponts à isolation sismique (EN 1998-2 chapitre 7), version simplifiée.
//  · Isolateurs à noyau de plomb (LRB) ou pendules à friction, sous toutes les lignes d'appui (nombre = appareils d'appui).
//  · Loi bilinéaire (7.5.2.3.2, figure 7.1) : K_e, K_p, F_0 ; énergie dissipée par cycle E_D = 4 F_0 (d − d_y).
//  · Analyse spectrale par le mode fondamental (7.5.4) : tablier rigide, K_eff = Σ K_eff,i (7.4) composé en série avec
//    l'infrastructure (7.11), ξ_eff (7.5), T_eff (7.6), η_eff = √(0,10/(0,05 + ξ_eff)) (7.9), tableau 7.1, itérations ±5 % (7.5.4(4)).
//  · Propriétés nominales (DP), limites inférieures (LBDP = DP, J.7) et supérieures (UBDP = λ_U DP, J.4) (7.5.2.4).
//  · Vérifications : ξ_eff ≤ 0,30 et sol A, B, C ou E (7.5.3) ; ±15 % (7.5.2.4(4)) ; d_d,in = γ_IS d_d (7.6.2) ;
//    capacité de rappel (7.7.1, tableau 7.2N) ; efforts dans l'infrastructure divisés par q ≤ 1,5 (7.6.3).
//  · Contrôle temporel non linéaire (7.5.6) : oscillateur à tablier rigide, isolateurs bilinéaires en série avec les
//    piles, 7 accélérogrammes ; ρ_d = d_d,m / d_d,f ≥ 0,80 (7.5.5(6)).
// Unités : m, MN, t, s.

import { derives } from "../projet/geometrie.ts";
import type { Isolation, Projet } from "../projet/types.ts";
import type { ActionSismique } from "./action.ts";
import { modele, type Modele } from "./modele.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";
import { valeur, type FormeSpectre } from "./spectres.ts";
import { avancer, etatInitial, type ParametresHysteresis } from "./temporel-nl.ts";
import type { Accelerogramme, JeuAccelerogrammes } from "./temporel.ts";

export type Ensemble = "DP" | "LBDP" | "UBDP";
export type DirectionIso = "x" | "y";

/** Valeurs par défaut d'un pendule à friction (PTFE non lubrifié, étanche, T_min = 0 °C, catégorie III : λ_U = (1 + 0,1 × 0,9)²). */
export const PENDULE_DEFAUT = { R: 3.1, mu: 0.04, lambdaKp: 1, lambdaF0: 1.19 };

export const ISOLATION_DEFAUT: Isolation = {
  type: "lrb",
  Qd: 0.01,
  Kd: 0.4,
  rapportKe: 10,
  R: 3.1,
  mu: 0.04,
  capacite: 0.2,
  lambdaKp: 1.3,
  lambdaF0: 1.1,
  gammaIS: 1.5,
  deplacementPermanent: 0,
  loinFaille: true,
};

export interface ProprietesIsolateur {
  Ke: number;
  Kp: number;
  F0: number;
  dy: number;
  /** Effort normal permanent par isolateur (MN). */
  N: number;
}

/** Propriétés bilinéaires d'un isolateur pour un ensemble de propriétés de calcul. */
export function proprietes(iso: Isolation, N: number, ens: Ensemble): ProprietesIsolateur {
  const lk = ens === "UBDP" ? iso.lambdaKp : 1;
  const lf = ens === "UBDP" ? iso.lambdaF0 : 1;
  if (iso.type === "pendule") {
    const Kp = (N / iso.R) * lk;
    const F0 = iso.mu * N * lf;
    const dy = 0.001; // glissement quasi rigide-plastique
    return { Ke: F0 / dy + Kp, Kp, F0, dy, N };
  }
  const Kp = iso.Kd * lk;
  const F0 = iso.Qd * lf;
  const Ke = iso.rapportKe * Kp;
  return { Ke, Kp, F0, dy: F0 / (Ke - Kp), N };
}

/** Effort de l'isolateur sur l'enveloppe monotone (pour le déplacement d ≥ 0). */
export const effortIsolateur = (pr: ProprietesIsolateur, d: number) => (d <= pr.dy ? pr.Ke * d : pr.F0 + pr.Kp * d);

export interface LigneIsolee {
  id: string;
  type: "pile" | "culee";
  x: number;
  n: number;
  /** Raideur de l'infrastructure (MN/m ; Infinity : rigide). */
  Ks: number;
  pr: ProprietesIsolateur;
}

/** Lignes d'appui isolées : nombre d'isolateurs, effort normal par isolateur, raideur de l'infrastructure. */
export function lignes(p: Projet, m: Modele, iso: Isolation, ens: Ensemble, direction: DirectionIso): LigneIsolee[] {
  const d = derives(p);
  const t = p.tablier.travees;
  // Efforts normaux : répartition des réactions permanentes (ou des longueurs d'influence), ramenée au poids sismique du tablier.
  const brut = p.appuis.map((ap, i) => {
    const Ltrib = (i > 0 ? t[i - 1] ?? 0 : 0) / 2 + (i < t.length ? t[i] ?? 0 : 0) / 2;
    return ap.chargesPermanentes ? (ap.chargesPermanentes.Nmax + ap.chargesPermanentes.Nmin) / 2 : Ltrib / d.longueur;
  });
  const somme = brut.reduce((s, x) => s + x, 0);
  const Wd = (m.masses.M * p.options.g) / 1000;
  return p.appuis.map((ap, i) => {
    const n = Math.max(1, ap.appareils.nombre);
    const R = (Wd * brut[i]!) / somme;
    const ks = m.directions[direction].appuis[i]!.kSupport;
    return { id: ap.id, type: ap.type, x: d.positions[i] ?? 0, n, Ks: ks, pr: proprietes(iso, R / n, ens) };
  });
}

export interface ReponseLigne {
  id: string;
  type: "pile" | "culee";
  n: number;
  Ks: number;
  /** Déplacement relatif des isolateurs (m), effort par isolateur et par ligne (MN). */
  db: number;
  Fb: number;
  F: number;
  Keff: number;
  ED: number;
  /** Déplacement de la tête de l'infrastructure (m). */
  ds: number;
}

export interface ModeFondamentalIsole {
  ensemble: Ensemble;
  direction: DirectionIso;
  Md: number;
  dcd: number;
  Keff: number;
  Teff: number;
  xiEff: number;
  etaEff: number;
  Se: number;
  Vd: number;
  dC: number;
  branche: "TC ≤ Teff < TD" | "TD ≤ Teff" | "Teff < TC";
  lignes: ReponseLigne[];
  iterations: { d: number; Keff: number; xi: number; T: number; dNouveau: number }[];
}

/** Déplacement de l'isolateur d'une ligne pour un déplacement du tablier D (isolateurs en série avec l'infrastructure). */
function equilibreLigne(l: LigneIsolee, D: number): { db: number; Fb: number } {
  const f = (db: number) => effortIsolateur(l.pr, db);
  if (l.Ks === Infinity) return { db: D, Fb: f(D) };
  let lo = 0, hi = D;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (l.n * f(mid) > l.Ks * (D - mid)) hi = mid;
    else lo = mid;
  }
  const db = (lo + hi) / 2;
  return { db, Fb: f(db) };
}

/** Spectre élastique avec l'amortissement effectif (7.5.4(2)). */
export function spectreIsole(a: ActionSismique, eta: number): FormeSpectre {
  return { ...a.spectres.elastiqueH, plateau: 2.5 * eta };
}

/** Analyse spectrale par le mode fondamental d'un pont isolé (7.5.4), avec itérations sur d_cd. */
export function modeFondamentalIsole(p: Projet, a: ActionSismique, iso: Isolation, ens: Ensemble, direction: DirectionIso, m = modele(p)): ModeFondamentalIsole {
  const ls = lignes(p, m, iso, ens, direction);
  const Md = m.masses.M; // t
  const iterations: ModeFondamentalIsole["iterations"] = [];
  let d = 0.1;
  let res!: Omit<ModeFondamentalIsole, "iterations" | "ensemble" | "direction" | "Md">;
  for (let it = 0; it < 60; it++) {
    const rl: ReponseLigne[] = ls.map((l) => {
      const { db, Fb } = equilibreLigne(l, d);
      const F = l.n * Fb;
      const ED = db > l.pr.dy ? l.n * 4 * l.pr.F0 * (db - l.pr.dy) : 0;
      return { id: l.id, type: l.type, n: l.n, Ks: l.Ks, db, Fb, F, Keff: F / d, ED, ds: d - db };
    });
    const Keff = rl.reduce((s, x) => s + x.Keff, 0);
    const ED = rl.reduce((s, x) => s + x.ED, 0);
    const xiEff = ED / (2 * Math.PI * Keff * d * d); // (7.5)
    const Teff = 2 * Math.PI * Math.sqrt(Md / 1000 / Keff); // (7.6)
    const etaEff = Math.sqrt(0.1 / (0.05 + xiEff)); // (7.9)
    const f = spectreIsole(a, etaEff);
    const Se = valeur(f, Teff);
    const dC = (0.625 / Math.PI ** 2) * f.amplitude * etaEff * a.TC ** 2; // (7.8)
    const dNouveau = Se * (Teff / (2 * Math.PI)) ** 2; // tableau 7.1 (identique au spectre en déplacement)
    iterations.push({ d, Keff, xi: xiEff, T: Teff, dNouveau });
    res = { dcd: dNouveau, Keff, Teff, xiEff, etaEff, Se, Vd: Keff * d, dC, branche: Teff < a.TC ? "Teff < TC" : Teff < a.TD ? "TC ≤ Teff < TD" : "TD ≤ Teff", lignes: rl };
    if (Math.abs(dNouveau - d) <= 1e-4 * d) break;
    d = 0.5 * d + 0.5 * dNouveau;
  }
  // état final au déplacement convergé
  return { ensemble: ens, direction, Md, iterations, ...res, Vd: res.Keff * res.dcd };
}

export interface VerificationIsolateurs {
  ddIn: number;
  total: number;
  capacite: number;
  ok: boolean;
  rappel: { dm: number; dr: number; drm: number; deltaFm: number; Wd: number; critereA: number; okA: boolean; critereB: number; okB: boolean };
}

export interface PontIsole {
  direction: DirectionIso;
  DP: ModeFondamentalIsole;
  LBDP: ModeFondamentalIsole;
  UBDP: ModeFondamentalIsole;
  ecarts: { LBDP: number; UBDP: number; analysesDP: boolean };
  conditions: { id: string; libelle: string; ok: boolean }[];
  verif: VerificationIsolateurs;
  /** Comparaison avec le pont du projet (appareils actuels, mode fondamental). */
  sansIsolation?: { T: number; F: number; d: number };
  remarques: string[];
}

const SOLS_OK = new Set(["A", "B", "C", "E"]);

/** Pont isolé dans une direction : trois ensembles de propriétés, vérifications. */
export function pontIsole(p: Projet, a: ActionSismique, iso: Isolation, direction: DirectionIso, sansIsolation?: { T: number; F: number; d: number }): PontIsole {
  const m = modele(p);
  const DP = modeFondamentalIsole(p, a, iso, "DP", direction, m);
  const LBDP = modeFondamentalIsole(p, a, iso, "LBDP", direction, m);
  const UBDP = modeFondamentalIsole(p, a, iso, "UBDP", direction, m);
  const ecarts = { LBDP: LBDP.dcd / DP.dcd - 1, UBDP: UBDP.dcd / DP.dcd - 1, analysesDP: false };
  ecarts.analysesDP = Math.abs(ecarts.LBDP) <= 0.15 && Math.abs(ecarts.UBDP) <= 0.15;
  const conditions = [
    { id: "faille", libelle: "Site à plus de 10 km d'une faille active connue (7.5.3(1)P a)", ok: iso.loinFaille },
    { id: "sol", libelle: `Classe de sol ${p.site.classeSol} parmi A, B, C, E (7.5.3(1)P b)`, ok: SOLS_OK.has(p.site.classeSol) },
    { id: "xi", libelle: `ξ_eff = ${nombre(Math.max(DP.xiEff, LBDP.xiEff, UBDP.xiEff), 3)} ≤ 0,30 (7.5.3(1)P c)`, ok: Math.max(DP.xiEff, LBDP.xiEff, UBDP.xiEff) <= 0.3 },
    { id: "t4", libelle: `T_eff = ${nombre(LBDP.Teff, 2)} s ≤ 4 s (tableau 7.1)`, ok: LBDP.Teff <= 4 },
  ];
  // Isolateurs : déplacement maximal (LBDP), majoré par γ_IS (7.6.2).
  const dbMax = Math.max(...LBDP.lignes.map((l) => l.db));
  const ddIn = iso.gammaIS * dbMax;
  const total = ddIn + iso.deplacementPermanent;
  // Capacité de rappel (7.7.1) avec les propriétés nominales.
  const ls = lignes(p, m, iso, "DP", direction);
  const dm = iso.capacite;
  const Wd = (DP.Md * p.options.g) / 1000; // MN
  const deltaFm = ls.reduce((s, l) => s + l.n * (effortIsolateur(l.pr, dm) - effortIsolateur(l.pr, dm / 2)), 0);
  const pr0 = ls[0]!.pr;
  const dr = pr0.F0 / pr0.Kp; // d_r = F_0/K_p ; pendule : μ R
  const drm = dm >= dr + 2 * pr0.dy ? dr : dm > pr0.dy ? (dr * (dm - pr0.dy)) / (dr + pr0.dy) : 0; // tableau 7.2N
  const critereA = (0.015 * Wd * drm) / dm; // (7.24a) δ_w = 0,015 (expression à confirmer sur le texte de la norme)
  const critereB = dm - 0.5 * ddIn; // (7.24b) δ_d = 0,5
  const verif: VerificationIsolateurs = {
    ddIn,
    total,
    capacite: dm,
    ok: total <= dm,
    rappel: { dm, dr, drm, deltaFm, Wd, critereA, okA: deltaFm >= critereA, critereB, okB: drm <= critereB },
  };
  const remarques: string[] = [];
  if (!ecarts.analysesDP) remarques.push("Écarts LBDP ou UBDP / DP supérieurs à 15 % : une analyse multimodale ou temporelle devrait être menée avec les UBDP et les LBDP (7.5.2.4(4)).");
  if (LBDP.branche === "Teff < TC") remarques.push("T_eff < T_C : l'isolation n'allonge pas assez la période ; elle n'apporte guère de réduction d'effort.");
  if (iso.type === "lrb" && (iso.lambdaKp === 1 || iso.lambdaF0 === 1)) remarques.push("λ_U = 1 : vérifier les coefficients de l'annexe J (vieillissement, température, ψ_fi) pour les UBDP.");
  return { direction, DP, LBDP, UBDP, ecarts, conditions, verif, sansIsolation, remarques };
}

export interface TemporelIsole {
  ensemble: Ensemble;
  /** Coefficients de correction (7.5.5(7)) si ρ < 0,80. */
  correctionD: number;
  correctionV: number;
  reponses: { graine: number; dmax: number; Vmax: number }[];
  ddm: number;
  Vdm: number;
  rhoD: number;
  rhoV: number;
}

export interface HistoriqueIsole {
  t: number[];
  ag: number[];
  D: number[];
  /** Déplacement relatif et effort d'un isolateur de la première pile isolée. */
  db: number[];
  Fb: number[];
  V: number[];
}

/** Réponse temporelle non linéaire (oscillateur à tablier rigide, isolateurs bilinéaires en série avec l'infrastructure). */
export function reponseIsolee(ls: LigneIsolee[], Md: number, acc: Accelerogramme, xi = 0.05, historique = false, ligneSuivie = 1) {
  const M = Md / 1000;
  // ressort équivalent par ligne : bilinéaire (isolateurs ×n) en série avec l'infrastructure linéaire
  const params: ParametresHysteresis[] = ls.map((l) => {
    const ke = l.n * l.pr.Ke, kp = l.n * l.pr.Kp;
    const ser = (k: number) => (l.Ks === Infinity ? k : (k * l.Ks) / (k + l.Ks));
    const Fy = l.n * effortIsolateur(l.pr, l.pr.dy);
    return { k0: ser(ke), Fy, k2: ser(kp), beta: 0.5, loi: "bilineaire" };
  });
  const etats = params.map((x) => etatInitial(x));
  const K0 = params.reduce((s, x) => s + x.k0, 0);
  // amortissement visqueux de la structure (5 %) sur la raideur post-élastique (période isolée)
  const Kp = params.reduce((s, x) => s + x.k2, 0);
  const c = 2 * xi * Math.sqrt(Kp * M);
  const Tmin = 2 * Math.PI * Math.sqrt(M / K0);
  const sub = Math.max(4, Math.ceil(acc.dt / (Tmin / 20)));
  const h = acc.dt / sub;
  const n0 = acc.a.length;
  const n = n0 + Math.ceil(4 / acc.dt);
  let u = 0, uPrec = 0, dmax = 0, Vmax = 0;
  const hist: HistoriqueIsole | null = historique ? { t: [], ag: [], D: [], db: [], Fb: [], V: [] } : null;
  const j = Math.min(ligneSuivie, ls.length - 1);
  for (let i = 0; i + 1 < n; i++) {
    const a0 = acc.a[i] ?? 0, a1 = acc.a[i + 1] ?? 0;
    let V = 0;
    for (let k = 0; k < sub; k++) {
      const ag = a0 + ((a1 - a0) * k) / sub;
      V = 0;
      for (let q = 0; q < params.length; q++) V += avancer(etats[q]!, params[q]!, u);
      const uS = (h * h * (-M * ag - V) + 2 * M * u - (M - (c * h) / 2) * uPrec) / (M + (c * h) / 2);
      uPrec = u;
      u = uS;
      dmax = Math.max(dmax, Math.abs(u));
      Vmax = Math.max(Vmax, Math.abs(V));
    }
    if (hist && i % 2 === 0) {
      const l = ls[j]!;
      const F = etats[j]!.F; // effort de la ligne
      hist.t.push((i + 1) * acc.dt);
      hist.ag.push(a1);
      hist.D.push(u);
      hist.V.push(V);
      hist.Fb.push(F / l.n);
      hist.db.push(l.Ks === Infinity ? u : u - F / l.Ks);
    }
  }
  return { dmax, Vmax, historique: hist };
}

/** Contrôle temporel (7.5.6) sur un jeu d'accélérogrammes : moyenne des maximums et rapports ρ_d, ρ_v (7.5.5(6)). */
export function temporelIsole(p: Projet, a: ActionSismique, iso: Isolation, ens: Ensemble, direction: DirectionIso, jeu: JeuAccelerogrammes, mf: ModeFondamentalIsole): TemporelIsole {
  const m = modele(p);
  const ls = lignes(p, m, iso, ens, direction);
  const reponses = jeu.accelerogrammes.map((acc) => {
    const r = reponseIsolee(ls, m.masses.M, acc, 0.05);
    return { graine: acc.graine, dmax: r.dmax, Vmax: r.Vmax };
  });
  const moy = (x: number[]) => x.reduce((s, y) => s + y, 0) / Math.max(x.length, 1);
  const ddm = moy(reponses.map((r) => r.dmax)), Vdm = moy(reponses.map((r) => r.Vmax));
  void a;
  const rhoD = ddm / mf.dcd, rhoV = Vdm / mf.Vd;
  return { ensemble: ens, reponses, ddm, Vdm, rhoD, rhoV, correctionD: rhoD < 0.8 ? 0.8 / rhoD : 1, correctionV: rhoV < 0.8 ? 0.8 / rhoV : 1 };
}

export function historiqueIsole(p: Projet, iso: Isolation, ens: Ensemble, direction: DirectionIso, acc: Accelerogramme): HistoriqueIsole | null {
  const m = modele(p);
  const ls = lignes(p, m, iso, ens, direction);
  const j = ls.findIndex((l) => l.type === "pile");
  return reponseIsolee(ls, m.masses.M, acc, 0.05, true, j < 0 ? 0 : j).historique;
}

const NOM_TYPE = { lrb: "appareils à noyau de plomb (LRB)", pendule: "pendules à friction" } as const;

export function notePontIsole(iso: Isolation, r: PontIsole): SectionNote[] {
  const nom = r.direction === "x" ? "longitudinale (X)" : "transversale (Y)";
  const lignesNote: LigneNote[] = [];
  lignesNote.push({
    id: `iso_${r.direction}_type`,
    titre: "Système d'isolation",
    resultat: { symbole: "", valeur: NOM_TYPE[iso.type] },
    references: ["isolation_bilineaire"],
    commentaire:
      iso.type === "lrb"
        ? `Par isolateur : Q_d = F_0 = ${nombre(1000 * iso.Qd, 1)} kN, K_d = K_p = ${nombre(iso.Kd, 3)} MN/m, K_e = ${nombre(iso.rapportKe, 1)} K_p ; UBDP : λ_U(K_p) = ${nombre(iso.lambdaKp, 2)}, λ_U(F_0) = ${nombre(iso.lambdaF0, 2)}.`
        : `Par isolateur : R = ${nombre(iso.R, 2)} m, μ_d = ${nombre(iso.mu, 3)} ; K_p = N/R, F_0 = μ_d N ; UBDP : λ_U(K_p) = ${nombre(iso.lambdaKp, 2)}, λ_U(F_0) = ${nombre(iso.lambdaF0, 2)}.`,
  });
  for (const mf of [r.DP, r.LBDP, r.UBDP]) {
    lignesNote.push(
      {
        id: `iso_${r.direction}_${mf.ensemble}_k`,
        titre: `${mf.ensemble} — rigidité et amortissement effectifs à d_cd = ${nombre(100 * mf.dcd, 2)} cm`,
        formule: "K_{eff} = \\sum K_{eff,i},\\quad \\xi_{eff} = \\dfrac{1}{2\\pi}\\,\\dfrac{\\sum E_{D,i}}{K_{eff}\\,d_{cd}^2},\\quad T_{eff} = 2\\pi\\sqrt{\\dfrac{M_d}{K_{eff}}},\\quad \\eta_{eff} = \\sqrt{\\dfrac{0{,}10}{0{,}05 + \\xi_{eff}}}",
        application: `K_{eff} = ${tex(mf.Keff, 2)}\\ \\text{MN/m},\\ \\xi_{eff} = ${tex(mf.xiEff, 3)},\\ T_{eff} = ${tex(mf.Teff, 3)}\\ \\text{s},\\ \\eta_{eff} = ${tex(mf.etaEff, 3)}`,
        resultat: { symbole: "V_d = K_{eff}\\,d_{cd}", valeur: 1000 * mf.Vd, unite: "kN", decimales: 0 },
        references: ["isolation_mode_fondamental"],
        commentaire: `${mf.branche} ; S_e(T_eff) = ${nombre(mf.Se, 3)} m/s² ; d_C = ${nombre(100 * mf.dC, 2)} cm ; ${mf.iterations.length} itérations.`,
      },
    );
  }
  lignesNote.push(
    {
      id: `iso_${r.direction}_ecart`,
      titre: "Variabilité des propriétés (7.5.2.4(4))",
      resultat: { symbole: "", valeur: `LBDP ${nombre(100 * r.ecarts.LBDP, 1)} % ; UBDP ${nombre(100 * r.ecarts.UBDP, 1)} %` },
      references: ["isolation_variabilite"],
      commentaire: r.ecarts.analysesDP ? "Écarts ≤ 15 % : une analyse multimodale ou temporelle peut se fonder sur les DP." : "Écarts > 15 % : analyses avec UBDP et LBDP.",
    },
    {
      id: `iso_${r.direction}_dd`,
      titre: "Déplacement des isolateurs (7.6.2)",
      formule: "d_{d,in} = \\gamma_{IS}\\,d_d + d_{perm} \\le d_m",
      application: `${tex(iso.gammaIS, 2)} \\times ${tex(100 * (r.verif.ddIn / iso.gammaIS), 2)} + ${tex(100 * iso.deplacementPermanent, 2)} = ${tex(100 * r.verif.total, 2)} \\le ${tex(100 * r.verif.capacite, 2)}\\ \\text{cm}`,
      resultat: { symbole: "", valeur: r.verif.ok ? "vérifié" : "non vérifié" },
      references: ["isolation_verifications"],
      niveau: r.verif.ok ? undefined : "alerte",
    },
    {
      id: `iso_${r.direction}_rappel`,
      titre: "Capacité de rappel latéral (7.7.1)",
      formule: "\\Delta F_m \\ge \\delta_w W_d \\dfrac{d_{rm}}{d_m},\\qquad d_{rm} \\le d_m - \\delta_d\\, d_{d,in}",
      application: `${tex(1000 * r.verif.rappel.deltaFm, 0)} \\ge ${tex(1000 * r.verif.rappel.critereA, 0)}\\ \\text{kN} ;\\ ${tex(100 * r.verif.rappel.drm, 2)} \\le ${tex(100 * r.verif.rappel.critereB, 2)}\\ \\text{cm}`,
      resultat: { symbole: "", valeur: r.verif.rappel.okA && r.verif.rappel.okB ? "vérifié" : "non vérifié" },
      references: ["isolation_rappel"],
      commentaire: `d_r = F_0/K_p = ${nombre(100 * r.verif.rappel.dr, 2)} cm ; d_rm (tableau 7.2N) = ${nombre(100 * r.verif.rappel.drm, 2)} cm ; δ_w = 0,015, δ_d = 0,5.`,
      niveau: r.verif.rappel.okA && r.verif.rappel.okB ? undefined : "alerte",
    },
  );
  return [{ id: `iso_${r.direction}`, titre: `Pont isolé — direction ${nom}`, lignes: lignesNote }];
}
