// Calcul temporel linéaire (EN 1998-2 4.2.3) par superposition modale.
//  1. Accélérogrammes artificiels compatibles avec le spectre élastique à 5 % (EN 1998-1 3.2.3.1.2) :
//     somme de sinusoïdes à phases aléatoires (graine fixe : résultats reproductibles), enveloppe trapézoïdale
//     (montée, phase stationnaire Ts ≥ 10 s, décroissance exponentielle), puis ajustement itératif des amplitudes
//     jusqu'à épouser le spectre cible (méthode du type SIMQKE).
//  2. Réponse de chaque mode retenu par l'analyse multimodale : oscillateur q̈ + 2ξωq̇ + ω²q = −Γ üg intégré
//     exactement pour une excitation linéaire par morceaux (Nigam et Jennings, 1969).
//  3. Grandeurs par appui u(t) = Σ φk qk(t) ; extrême de chaque accélérogramme, puis moyenne sur le jeu
//     (EN 1998-2 4.2.3.1(1)P). Efforts divisés par q (spectre de calcul), déplacements élastiques.
// Unités : m, s, m/s², kN et t en interne ; efforts rendus en MN.

import type { Projet } from "../projet/types.ts";
import type { ActionSismique } from "./action.ts";
import type { Analyse } from "./analyse.ts";
import type { Borne, Modele } from "./modele.ts";
import { grandeursAppuis, modeleDynamique, reponseDirection, type DirectionMM, type GrandeursAppui, type ReponseDirectionMM } from "./multimodal.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";
import { valeur, type FormeSpectre } from "./spectres.ts";
import { modesPropres } from "./valeurs-propres.ts";

export interface OptionsTemporel {
  /** Nombre d'accélérogrammes par direction (au moins 3 ; 7 pour retenir la moyenne). */
  nombre: number;
  dt: number;
  montee: number;
  stationnaire: number;
  descente: number;
  graine: number;
  iterations: number;
}

export const OPTIONS_TEMPOREL: OptionsTemporel = { nombre: 7, dt: 0.01, montee: 2, stationnaire: 10, descente: 8, graine: 1998, iterations: 12 };

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Coefficients de la récurrence exacte d'un oscillateur (ω, ξ) sous une excitation linéaire par morceaux (pas dt). */
export function coefficientsOscillateur(omega: number, xi: number, dt: number) {
  const k = omega * omega;
  const r = Math.sqrt(1 - xi * xi);
  const wd = omega * r;
  const e = Math.exp(-xi * omega * dt);
  const s = Math.sin(wd * dt), c = Math.cos(wd * dt);
  const wdt = omega * dt;
  return {
    A: e * ((xi / r) * s + c),
    B: (e * s) / wd,
    C: (1 / k) * ((2 * xi) / wdt + e * (((1 - 2 * xi * xi) / (wd * dt) - xi / r) * s - (1 + (2 * xi) / wdt) * c)),
    D: (1 / k) * (1 - (2 * xi) / wdt + e * (((2 * xi * xi - 1) / (wd * dt)) * s + ((2 * xi) / wdt) * c)),
    Ap: -e * ((omega / r) * s),
    Bp: e * (c - (xi / r) * s),
    Cp: (1 / k) * (-1 / dt + e * ((omega / r + xi / (dt * r)) * s + (1 / dt) * c)),
    Dp: (1 / (k * dt)) * (1 - e * ((xi / r) * s + c)),
  };
}

/** Déplacement relatif u(t) d'un oscillateur (ω, ξ) sous üg(t) : ü + 2ξωu̇ + ω²u = −üg. */
export function reponseOscillateur(ag: ArrayLike<number>, dt: number, omega: number, xi: number): Float64Array {
  const n = ag.length;
  const u = new Float64Array(n);
  if (!(omega > 0)) return u;
  const K = coefficientsOscillateur(omega, xi, dt);
  let x = 0, v = 0;
  for (let i = 0; i + 1 < n; i++) {
    const p0 = -(ag[i] ?? 0), p1 = -(ag[i + 1] ?? 0);
    const x1 = K.A * x + K.B * v + K.C * p0 + K.D * p1;
    const v1 = K.Ap * x + K.Bp * v + K.Cp * p0 + K.Dp * p1;
    x = x1;
    v = v1;
    u[i + 1] = x;
  }
  return u;
}

/** Spectre de pseudo-accélération Sa(T) = ω² max|u| ; à T = 0, accélération maximale du sol. */
export function spectreReponse(ag: ArrayLike<number>, dt: number, periodes: number[], xi = 0.05): number[] {
  return periodes.map((T) => {
    if (T <= 0) {
      let m = 0;
      for (let i = 0; i < ag.length; i++) m = Math.max(m, Math.abs(ag[i] ?? 0));
      return m;
    }
    const w = (2 * Math.PI) / T;
    const u = reponseOscillateur(ag, dt, w, xi);
    let m = 0;
    for (let i = 0; i < u.length; i++) m = Math.max(m, Math.abs(u[i]!));
    return w * w * m;
  });
}

/** Spectre élastique à 5 % (η = 1), forme de l'EN 1998-1 depuis T = 0 (sans prolongation du plateau). */
export function spectreCible(f: FormeSpectre, vertical: boolean): FormeSpectre {
  return { ...f, plateau: vertical ? 3.0 : 2.5, depart: 1, plateauOrigine: false, plancher: undefined };
}

/** Périodes de contrôle du spectre : 0 (accélération maximale), puis 65 valeurs géométriques de Tmin à 4 s. */
export const periodesSpectre = (Tmin = 0.03): number[] => {
  const T: number[] = [0];
  for (let i = 0; i <= 64; i++) T.push(Tmin * Math.pow(4 / Tmin, i / 64));
  return T;
};

function enveloppe(t: number, o: OptionsTemporel): number {
  if (t < o.montee) return (t / o.montee) ** 2;
  if (t <= o.montee + o.stationnaire) return 1;
  return Math.exp((-3 * (t - o.montee - o.stationnaire)) / o.descente);
}

export interface Accelerogramme {
  graine: number;
  dt: number;
  a: Float64Array;
  /** Spectre de réponse à 5 % aux périodes du jeu (m/s²). */
  spectre: number[];
  pga: number;
}

/** Un accélérogramme artificiel compatible avec le spectre cible (élastique, 5 %). */
export function accelerogramme(cible: FormeSpectre, o: OptionsTemporel, graine: number, periodes = periodesSpectre()): Accelerogramme {
  const duree = o.montee + o.stationnaire + o.descente;
  const n = Math.round(duree / o.dt) + 1;
  const rnd = aleatoire(graine);
  const df = 0.05;
  const freqs: number[] = [];
  const fmax = 0.25 / o.dt;
  for (let f = 0.2; f <= fmax + 1e-9; f += df) freqs.push(f);
  const phases = freqs.map(() => 2 * Math.PI * rnd());
  // Amplitudes initiales : densité spectrale approchée (relation de Vanmarcke simplifiée).
  let amp = freqs.map((f) => {
    const T = 1 / f;
    const S = valeur(cible, T);
    return S * Math.sqrt((4 * 0.05 * df) / (Math.PI * f * 2.5));
  });
  const env = new Float64Array(n);
  for (let i = 0; i < n; i++) env[i] = enveloppe(i * o.dt, o);
  const synthese = () => {
    const a = new Float64Array(n);
    freqs.forEach((f, k) => {
      const w = 2 * Math.PI * f * o.dt;
      const A = amp[k]!;
      // sin(φ + i w) par récurrence de rotation
      let s0 = Math.sin(phases[k]!), c0 = Math.cos(phases[k]!);
      const cw = Math.cos(w), sw = Math.sin(w);
      for (let i = 0; i < n; i++) {
        a[i]! += A * s0;
        const s1 = s0 * cw + c0 * sw;
        c0 = c0 * cw - s0 * sw;
        s0 = s1;
      }
    });
    for (let i = 0; i < n; i++) a[i]! *= env[i]!;
    // correction de ligne de base : vitesse finale nulle (retrait d'une accélération constante pondérée par l'enveloppe)
    let somme = 0, poids = 0;
    for (let i = 0; i < n; i++) {
      somme += a[i]!;
      poids += env[i]!;
    }
    const c = somme / poids;
    for (let i = 0; i < n; i++) a[i]! -= c * env[i]!;
    return a;
  };
  const Tm = periodes.filter((T) => T > 0);
  let a = synthese();
  for (let it = 0; it < o.iterations; it++) {
    const Sa = spectreReponse(a, o.dt, Tm, 0.05);
    const ratio = Tm.map((T, i) => Math.min(2, Math.max(0.5, valeur(cible, T) / Math.max(Sa[i]!, 1e-9))));
    // interpolation du rapport en fréquence (log)
    amp = amp.map((A, k) => {
      const T = 1 / freqs[k]!;
      let r: number;
      if (T <= Tm[0]!) r = ratio[0]!;
      else if (T >= Tm.at(-1)!) r = ratio.at(-1)!;
      else {
        let j = 1;
        while (Tm[j]! < T) j++;
        const t0 = Math.log(Tm[j - 1]!), t1 = Math.log(Tm[j]!);
        const w = (Math.log(T) - t0) / (t1 - t0);
        r = ratio[j - 1]! * (1 - w) + ratio[j]! * w;
      }
      return A * r;
    });
    a = synthese();
  }
  const spectre = spectreReponse(a, o.dt, periodes, 0.05);
  return { graine, dt: o.dt, a, spectre, pga: spectre[0] ?? 0 };
}

export interface JeuAccelerogrammes {
  direction: DirectionMM;
  options: OptionsTemporel;
  cible: FormeSpectre;
  periodes: number[];
  accelerogrammes: Accelerogramme[];
  moyenne: number[];
  /** Contrôles de l'EN 1998-1 3.2.3.1.2(4) : nombre ≥ 3, PGA moyenne ≥ ag·S, spectre moyen ≥ 90 % de la cible entre 0,2 T1 et 2 T1. */
  controles: { nombre: boolean; pga: { moyenne: number; agS: number; ok: boolean }; plage: { Tmin: number; Tmax: number; rapportMin: number; ok: boolean } };
}

export function jeuAccelerogrammes(direction: DirectionMM, forme: FormeSpectre, T1: number, o: OptionsTemporel = OPTIONS_TEMPOREL): JeuAccelerogrammes {
  const cible = spectreCible(forme, direction === "z");
  // Verticale : périodes courtes (0,2 T1 de l'ordre de 0,03 s) ; pas de temps divisé par deux pour représenter jusqu'à 50 Hz.
  if (direction === "z") o = { ...o, dt: Math.min(o.dt, 0.005) };
  const periodes = periodesSpectre(Math.min(0.03, Math.max(0.01, 0.15 * T1)));
  const decalage = direction === "x" ? 0 : direction === "y" ? 1000 : 2000;
  const accelerogrammes = Array.from({ length: o.nombre }, (_, k) => accelerogramme(cible, o, o.graine + decalage + k, periodes));
  const moyenne = periodes.map((_, i) => accelerogrammes.reduce((s, x) => s + (x.spectre[i] ?? 0), 0) / accelerogrammes.length);
  const agS = cible.amplitude;
  const Tmin = 0.2 * T1, Tmax = 2 * T1;
  let rapportMin = Infinity;
  periodes.forEach((T, i) => {
    if (T >= Tmin && T <= Tmax) rapportMin = Math.min(rapportMin, (moyenne[i] ?? 0) / valeur(cible, T));
  });
  if (!Number.isFinite(rapportMin)) rapportMin = 1;
  return {
    direction,
    options: o,
    cible,
    periodes,
    accelerogrammes,
    moyenne,
    controles: {
      nombre: o.nombre >= 3,
      pga: { moyenne: moyenne[0] ?? 0, agS, ok: (moyenne[0] ?? 0) >= agS * 0.999 },
      plage: { Tmin, Tmax, rapportMin, ok: rapportMin >= 0.9 },
    },
  };
}

export interface ExtremesAppui {
  id: string;
  type: "pile" | "culee";
  /** Valeurs extrêmes par accélérogramme puis moyenne et maximum : effort (MN), déplacement du tablier et distorsion (m), pied de pile. */
  F: number[];
  dTablier: number[];
  dAppareils: number[];
  Vpied?: number[];
  Mpied?: number[];
}

export interface ReponseTemporelle {
  direction: DirectionMM;
  borne: Borne;
  q: number;
  modes: { numero: number; T: number; part: number }[];
  appuis: ExtremesAppui[];
  Vbase: number[];
  /** Moyennes sur le jeu (valeurs de calcul, EN 1998-2 4.2.3.1) et comparaison avec la multimodale spectrale. */
  moyennes: { id: string; F: number; Fmax: number; dTablier: number; dAppareils: number; Vpied?: number; Mpied?: number; Fspectral: number; dSpectral: number }[];
  VbaseMoyen: number;
  VbaseSpectral: number;
  spectral: ReponseDirectionMM;
}

const moy = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(v.length, 1);

/** Prépare la superposition modale : modes retenus, réponses unitaires par mode. */
function preparer(p: Projet, a: ActionSismique, m: Modele, direction: DirectionMM, borne: Borne) {
  const spectral = reponseDirection(p, a, m, direction, borne);
  const md = modeleDynamique(p, m, direction, borne);
  const bruts = modesPropres(md.K, md.M);
  const xi = p.comportement.amortissement / 100;
  const retenus = spectral.modes.filter((x) => x.retenu).map((x) => {
    const b = bruts[x.numero - 1]!;
    let gamma = 0;
    for (let i = 0; i < md.n; i++) {
      let s = 0;
      for (let j = 0; j < md.n; j++) s += md.M[i]![j]! * md.r[j]!;
      gamma += b.phi[i]! * s;
    }
    const signe = gamma < 0 ? -1 : 1;
    const phi = b.phi.map((v) => v * signe);
    return { numero: x.numero, T: x.T, part: x.part, omega: Math.sqrt(b.omega2), gamma: gamma * signe, Meff: gamma * gamma, phi, unitaires: grandeursAppuis(md, phi) };
  });
  return { spectral, md, retenus, xi };
}

/** Superposition modale pour un accélérogramme : D_k(t) de chaque mode. */
function reponsesModales(retenus: ReturnType<typeof preparer>["retenus"], ag: Float64Array, dt: number, xi: number): Float64Array[] {
  return retenus.map((mo) => reponseOscillateur(ag, dt, mo.omega, xi));
}

export function temporelDirection(p: Projet, a: ActionSismique, m: Modele, direction: DirectionMM, borne: Borne, jeu: JeuAccelerogrammes): ReponseTemporelle {
  const { spectral, md, retenus, xi } = preparer(p, a, m, direction, borne);
  const q = direction === "x" ? a.q.longitudinal : direction === "y" ? a.q.transversal : 1;
  const nA = md.appuis.length;
  const ext: ExtremesAppui[] = md.appuis.map((ap) => ({ id: ap.id, type: ap.type, F: [], dTablier: [], dAppareils: [], ...(md.piles.some((pl) => pl.id === ap.id) ? { Vpied: [], Mpied: [] } : {}) }));
  const Vbase: number[] = [];
  for (const acc of jeu.accelerogrammes) {
    const D = reponsesModales(retenus, acc.a, acc.dt, xi);
    const n = acc.a.length;
    const maxi = Array.from({ length: nA }, () => ({ F: 0, dT: 0, dA: 0, V: 0, M: 0 }));
    let vmax = 0;
    for (let t = 0; t < n; t++) {
      let vb = 0;
      const somme: GrandeursAppui[] = md.appuis.map(() => ({ F: 0, dTablier: 0, dTete: 0, dAppareils: 0, Vpied: 0, Mpied: 0 }));
      retenus.forEach((mo, k) => {
        const qk = mo.gamma * D[k]![t]!;
        if (qk === 0) return;
        vb += (mo.Meff * mo.omega * mo.omega * D[k]![t]!) / 1000;
        mo.unitaires.forEach((g, i) => {
          const s = somme[i]!;
          s.F += g.F * qk;
          s.dTablier += g.dTablier * qk;
          s.dAppareils += g.dAppareils * qk;
          if (g.Vpied !== undefined) {
            s.Vpied! += g.Vpied * qk;
            s.Mpied! += (g.Mpied ?? 0) * qk;
          }
        });
      });
      vmax = Math.max(vmax, Math.abs(vb));
      somme.forEach((s, i) => {
        const x = maxi[i]!;
        x.F = Math.max(x.F, Math.abs(s.F));
        x.dT = Math.max(x.dT, Math.abs(s.dTablier));
        x.dA = Math.max(x.dA, Math.abs(s.dAppareils));
        x.V = Math.max(x.V, Math.abs(s.Vpied ?? 0));
        x.M = Math.max(x.M, Math.abs(s.Mpied ?? 0));
      });
    }
    maxi.forEach((x, i) => {
      const e = ext[i]!;
      e.F.push(x.F / q);
      e.dTablier.push(x.dT);
      e.dAppareils.push(x.dA);
      if (e.Vpied) {
        e.Vpied.push(x.V / q);
        e.Mpied!.push(x.M / q);
      }
    });
    Vbase.push(vmax / q);
  }
  const moyennes = ext.map((e, i) => {
    const s = spectral.appuis[i]!;
    return {
      id: e.id,
      F: moy(e.F),
      Fmax: Math.max(...e.F),
      dTablier: moy(e.dTablier),
      dAppareils: moy(e.dAppareils),
      ...(e.Vpied ? { Vpied: moy(e.Vpied), Mpied: moy(e.Mpied!) } : {}),
      Fspectral: s.F,
      dSpectral: s.dTablier,
    };
  });
  return {
    direction,
    borne,
    q,
    modes: retenus.map((x) => ({ numero: x.numero, T: x.T, part: x.part })),
    appuis: ext,
    Vbase,
    moyennes,
    VbaseMoyen: moy(Vbase),
    VbaseSpectral: spectral.Ftotal,
    spectral,
  };
}

/** Historique d'un accélérogramme pour l'animation : déformées du tablier et des fûts, effort et déplacement à un appui. */
export interface Historique {
  dt: number;
  pas: number;
  t: number[];
  ag: number[];
  /** Déplacements (m) aux nœuds du tablier et des piles, un tableau par instant retenu. */
  tablier: number[][];
  piles: number[][][];
  /** Effort de liaison (MN) et déplacement du tablier (m) à chaque appui, au cours du temps. */
  F: number[][];
  d: number[][];
  geometrie: ReponseDirectionMM["geometrie"];
}

export function historique(p: Projet, a: ActionSismique, m: Modele, direction: DirectionMM, borne: Borne, acc: Accelerogramme, pas = 2): Historique {
  const { spectral, md, retenus, xi } = preparer(p, a, m, direction, borne);
  const q = direction === "x" ? a.q.longitudinal : direction === "y" ? a.q.transversal : 1;
  const D = reponsesModales(retenus, acc.a, acc.dt, xi);
  const n = acc.a.length;
  const out: Historique = { dt: acc.dt, pas, t: [], ag: [], tablier: [], piles: [], F: md.appuis.map(() => []), d: md.appuis.map(() => []), geometrie: spectral.geometrie };
  for (let t = 0; t < n; t += pas) {
    const u = new Array<number>(md.n).fill(0);
    retenus.forEach((mo, k) => {
      const qk = mo.gamma * D[k]![t]!;
      for (let i = 0; i < md.n; i++) u[i]! += mo.phi[i]! * qk;
    });
    out.t.push(t * acc.dt);
    out.ag.push(acc.a[t]!);
    out.tablier.push(md.tablier.ddl.map((i) => (i < 0 ? 0 : u[i]!)));
    out.piles.push(md.piles.map((pl) => pl.ddl.map((i) => (i < 0 ? 0 : u[i]!))));
    grandeursAppuis(md, u).forEach((g, i) => {
      out.F[i]!.push(g.F / q);
      out.d[i]!.push(g.dTablier);
    });
  }
  return out;
}

export interface Temporel {
  jeux: Record<DirectionMM, JeuAccelerogrammes>;
  directions: Record<"x" | "y", Record<Borne, ReponseTemporelle>> & { z: ReponseTemporelle };
  note: SectionNote[];
}

const NOMS: Record<DirectionMM, string> = { x: "longitudinale (X)", y: "transversale (Y)", z: "verticale (Z)" };

export function temporelLineaire(p: Projet, a: ActionSismique, m: Modele, _mono: Analyse, o: OptionsTemporel = OPTIONS_TEMPOREL): Temporel {
  const T1 = (d: DirectionMM) => {
    const r = reponseDirection(p, a, m, d, "lbdp");
    return r.modes.reduce((b, x) => (x.masseEffective > b.masseEffective ? x : b), r.modes[0]!).T;
  };
  const jeux = {
    x: jeuAccelerogrammes("x", a.spectres.elastiqueH, T1("x"), o),
    y: jeuAccelerogrammes("y", a.spectres.elastiqueH, T1("y"), o),
    z: jeuAccelerogrammes("z", a.spectres.elastiqueV, T1("z"), o),
  };
  const dir = (d: "x" | "y") => ({ lbdp: temporelDirection(p, a, m, d, "lbdp", jeux[d]), ubdp: temporelDirection(p, a, m, d, "ubdp", jeux[d]) });
  const directions = { x: dir("x"), y: dir("y"), z: temporelDirection(p, a, m, "z", "lbdp", jeux.z) };

  const note: SectionNote[] = [];
  const lignesJeu: LigneNote[] = [];
  for (const d of ["x", "y", "z"] as const) {
    const j = jeux[d];
    lignesJeu.push(
      {
        id: `th_${d}_jeu`,
        titre: `Accélérogrammes artificiels — direction ${NOMS[d]}`,
        resultat: { symbole: "", valeur: `${o.nombre} accélérogrammes de ${nombre(o.montee + o.stationnaire + o.descente, 0)} s (phase stationnaire ${nombre(o.stationnaire, 0)} s), pas ${nombre(o.dt, 3)} s` },
        references: ["accelerogrammes_artificiels"],
        commentaire: `Ajustés au spectre élastique à 5 % (${d === "z" ? "vertical" : "horizontal"}), graines ${j.accelerogrammes.map((x) => x.graine).join(", ")}.`,
      },
      {
        id: `th_${d}_pga`,
        titre: "Accélération maximale moyenne ≥ a_g·S",
        formule: "\\overline{S_a(0)} \\ge a_g\\,S",
        application: `${tex(j.controles.pga.moyenne, 3)} \\ge ${tex(j.controles.pga.agS, 3)}`,
        resultat: { symbole: "", valeur: j.controles.pga.ok ? "respecté" : "non respecté" },
        references: ["accelerogrammes_artificiels"],
        niveau: j.controles.pga.ok ? undefined : "alerte",
      },
      {
        id: `th_${d}_plage`,
        titre: "Spectre moyen ≥ 90 % du spectre élastique entre 0,2 T₁ et 2 T₁",
        application: `\\min \\dfrac{\\overline{S_a}}{S_e} = ${tex(j.controles.plage.rapportMin, 3)}\\ \\text{sur}\\ [${tex(j.controles.plage.Tmin, 3)} ;\\ ${tex(j.controles.plage.Tmax, 3)}]\\ \\text{s}`,
        resultat: { symbole: "", valeur: j.controles.plage.ok ? "respecté" : "non respecté" },
        references: ["accelerogrammes_artificiels"],
        niveau: j.controles.plage.ok ? undefined : "alerte",
      },
    );
  }
  note.push({ id: "th_jeux", titre: "Accélérogrammes", lignes: lignesJeu });
  for (const [d, rep] of [["x", directions.x.ubdp], ["y", directions.y.ubdp], ["z", directions.z]] as const) {
    const lignes: LigneNote[] = [
      {
        id: `th_${d}_methode`,
        titre: "Superposition modale",
        formule: "\\ddot q_k + 2\\xi\\omega_k\\dot q_k + \\omega_k^2 q_k = -\\Gamma_k\\,\\ddot u_g(t), \\qquad \\mathbf{u}(t) = \\sum_k \\boldsymbol{\\varphi}_k\\,q_k(t)",
        resultat: { symbole: "", valeur: `${rep.modes.length} modes (ceux de l'analyse multimodale), intégration exacte par morceaux` },
        references: ["calcul_temporel_lineaire", "analyse_spectrale"],
      },
    ];
    for (const x of rep.moyennes) {
      lignes.push({
        id: `th_${d}_${x.id}`,
        titre: `${x.id} — ${d === "z" ? "réaction verticale" : "effort transmis par le tablier"} : moyenne des extrêmes`,
        resultat: { symbole: `F_{${x.id}}`, valeur: x.F, unite: "MN", decimales: 3 },
        references: ["calcul_temporel_lineaire"],
        commentaire: `Maximum du jeu ${nombre(x.Fmax, 3)} MN ; analyse spectrale multimodale ${nombre(x.Fspectral, 3)} MN (écart ${nombre(100 * (x.F / Math.max(x.Fspectral, 1e-9) - 1), 1)} %).`,
      });
    }
    note.push({ id: `th_${d}`, titre: `Direction ${NOMS[d]}${d === "z" ? "" : " (UBDP)"}`, lignes });
  }
  return { jeux, directions, note };
}
