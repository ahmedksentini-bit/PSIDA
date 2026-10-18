// Étape 5 : méthode du mode fondamental, modèle à tablier rigide (EN 1998-2 4.2.2),
// réactions verticales forfaitaires et combinaison des directions.
// Unités : t, MN, MN/m, m, s, m/s².

import { derives } from "../projet/geometrie.ts";
import type { Projet } from "../projet/types.ts";
import { TABLEAU_B_VERTICAL } from "../referentiel/modele.ts";
import type { ActionSismique } from "./action.ts";
import type { Borne, Direction, Modele } from "./modele.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";
import { valeur, type FormeSpectre } from "./spectres.ts";

export interface EffortAppui {
  id: string;
  x: number;
  /** Effort horizontal transmis par le tablier (MN). */
  F: number;
  part: number;
  /** Dont effet de la torsion d'axe vertical (MN). */
  torsion: number;
  /** Déplacement de la tête d'appui (m). */
  dTete: number;
  /** Distorsion imposée aux appareils (déplacement relatif tablier/tête, m). */
  dAppareils: number;
}

export interface ReponseDirection {
  K: number;
  T: number;
  Sd: number;
  /** Effort sismique total (MN). */
  F: number;
  /** Déplacement issu de l'analyse linéaire (m). */
  dEe: number;
  muD: number;
  /** Déplacement sismique de calcul du tablier (m). */
  dE: number;
  appuis: EffortAppui[];
}

export interface Condition {
  id: string;
  libelle: string;
  valeur: string;
  respectee: boolean;
  references: string[];
}

export interface ReactionVerticale {
  id: string;
  b: number;
  R: number;
}

export interface Analyse {
  M: number;
  directions: Record<Direction, Record<Borne, ReponseDirection>>;
  torsion: { e0: number; L: number; appliquee: boolean };
  vertical: { applicable: boolean; motif: string; a: number; mu: number; L: number; psi: number; reactions: ReactionVerticale[] };
  conditions: Condition[];
  combinaisons: { id: string; cas: { nom: string; Fx: number; Fy: number; Fz: number }[] }[];
  note: SectionNote[];
}

const BORNES: Borne[] = ["lbdp", "ubdp"];

/** Interpolation linéaire dans une ligne du tableau 22 (Ψ = 0,5 à 1,0). */
function interpoler(ligne: Record<string, number>, psi: number): number {
  const pts = Object.entries(ligne).map(([k, v]) => [Number(k.replace("Ψ = ", "").replace(",", ".")), v] as const).sort((a, b) => a[0] - b[0]);
  const p = Math.min(Math.max(psi, pts[0]?.[0] ?? 0.5), pts.at(-1)?.[0] ?? 1);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] ?? [0, 0];
    const [x1, y1] = pts[i] ?? [0, 0];
    if (p <= x1) return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts.at(-1)?.[1] ?? NaN;
}

export function analyse(p: Projet, a: ActionSismique, m: Modele): Analyse {
  const d = derives(p);
  const M = m.masses.M;
  const L = d.longueur;
  const positions = d.positions;
  const notes: Record<"conditions" | Direction | "vertical" | "combinaisons", LigneNote[]> = { conditions: [], x: [], y: [], vertical: [], combinaisons: [] };

  // --- Conditions d'application -------------------------------------------------
  const massePiles = m.masses.piles.reduce((s, x) => s + x.masseFuts, 0);
  const rapportMasse = massePiles / M;
  const LsurB = L / p.tablier.largeur;
  const conditions: Condition[] = [
    {
      id: "tablier_continu",
      libelle: "Tablier continu, droit et à peu près rectiligne",
      valeur: `${p.tablier.travees.length} travée(s), pont droit`,
      respectee: true,
      references: ["conditions_monomodal"],
    },
    {
      id: "masse_piles",
      libelle: "Masse des piles < 20 % de celle du tablier (longitudinal)",
      valeur: `${nombre(100 * rapportMasse, 1)} %`,
      respectee: rapportMasse < 0.2,
      references: ["conditions_monomodal"],
    },
    {
      id: "L_sur_B",
      libelle: "Tablier rigide en transversal : L/B ≤ 4",
      valeur: `L/B = ${nombre(LsurB, 2)}`,
      respectee: LsurB <= 4,
      references: ["tablier_rigide"],
    },
  ];

  // --- Torsion d'axe vertical (transversal) -----------------------------------------
  const appuisY = m.directions.y.appuis;
  const infinis = appuisY.filter((x) => x.kTotal.lbdp === Infinity);
  const xK = infinis.length
    ? infinis.reduce((s, x) => s + (positions[p.appuis.findIndex((ap) => ap.id === x.id)] ?? 0), 0) / infinis.length
    : appuisY.reduce((s, x, i) => s + (positions[i] ?? 0) * x.kTotal.lbdp, 0) / Math.max(m.directions.y.K.lbdp, 1e-12);
  const e0 = Math.abs(xK - L / 2);
  const torsionAppliquee = e0 > 0.05 * L;
  conditions.push({
    id: "excentricite",
    libelle: "Excentricité centre de raideur / centre de masse ≤ 5 % de L (sinon torsion)",
    valeur: `e0 = ${nombre(e0, 2)} m ; 5 % L = ${nombre(0.05 * L, 2)} m`,
    respectee: !torsionAppliquee,
    references: ["conditions_monomodal", "centre_raideur", "torsion_excentricite"],
  });
  for (const c of conditions) {
    notes.conditions.push({
      id: c.id,
      titre: c.libelle,
      resultat: { symbole: "", valeur: `${c.valeur} — ${c.respectee ? "respectée" : "non respectée"}` },
      references: c.references,
      niveau: c.respectee ? undefined : "alerte",
      commentaire: c.respectee
        ? undefined
        : c.id === "excentricite"
          ? "Moment de torsion ajouté aux efforts transversaux."
          : c.id === "L_sur_B"
            ? "Tablier flexible : la méthode de Rayleigh (non traitée en V1) serait plus appropriée ; résultats indicatifs."
            : "Hors domaine de la méthode du mode fondamental : résultats indicatifs.",
    });
  }

  // --- Réponse par direction -------------------------------------------------------
  const spectreDe = (dir: Direction): FormeSpectre => (dir === "x" ? a.spectres.calculLong : a.spectres.calculTrans);
  const qDe = (dir: Direction) => (dir === "x" ? a.q.longitudinal : a.q.transversal);

  const directions = {} as Analyse["directions"];
  for (const dir of ["x", "y"] as const) {
    const nomDir = dir === "x" ? "longitudinale" : "transversale";
    const q = qDe(dir);
    directions[dir] = {} as Record<Borne, ReponseDirection>;
    for (const borne of BORNES) {
      const K = m.directions[dir].K[borne];
      const T = K === Infinity ? 0 : 2 * Math.PI * Math.sqrt(M / (K * 1000));
      const Sd = valeur(spectreDe(dir), T);
      const F = (M * Sd) / 1000;
      const dEe = K === Infinity || K === 0 ? 0 : F / K;
      const T0 = 1.25 * a.TC;
      const muD = T < 0.033 ? 1 : T >= T0 ? q : Math.min((q - 1) * (T0 / T) + 1, 5 * q - 4);
      const dE = a.eta * muD * dEe;
      const appuis: EffortAppui[] = m.directions[dir].appuis.map((ap, i) => {
        const Fi = ap.part[borne] * F;
        return {
          id: ap.id,
          x: positions[i] ?? 0,
          F: Fi,
          part: ap.part[borne],
          torsion: 0,
          dTete: ap.kSupport === Infinity ? 0 : (Fi / ap.kSupport) * a.eta * muD,
          dAppareils: ap.kAppareils[borne] === Infinity || ap.kAppareils[borne] === 0 ? 0 : (Fi / ap.kAppareils[borne]) * a.eta * muD,
        };
      });
      if (dir === "y" && torsionAppliquee) {
        const e = e0 + 0.05 * L;
        const Mt = e * F;
        const finis = m.directions.y.appuis.map((ap, i) => ({ k: ap.kTotal[borne], dx: (positions[i] ?? 0) - xK }));
        const J = finis.reduce((s, x) => s + (Number.isFinite(x.k) ? x.k * x.dx * x.dx : 0), 0);
        appuis.forEach((ap, i) => {
          const f = finis[i];
          if (!f || !Number.isFinite(f.k) || J === 0) return;
          ap.torsion = (Mt * f.k * Math.abs(f.dx)) / J;
          ap.F += ap.torsion;
        });
      }
      directions[dir][borne] = { K, T, Sd, F, dEe, muD, dE, appuis };
    }

    const L_ = directions[dir].lbdp;
    const U = directions[dir].ubdp;
    const etiquette = (b: Borne) => (m.elastomeres ? (b === "lbdp" ? "^{LBDP}" : "^{UBDP}") : "");
    for (const borne of m.elastomeres ? BORNES : (["lbdp"] as Borne[])) {
      const r = directions[dir][borne];
      const K = r.K;
      notes[dir].push(
        {
          id: `T_${dir}_${borne}`,
          titre: `Période propre ${nomDir}${m.elastomeres ? ` (${borne.toUpperCase()})` : ""}`,
          formule: "T = 2\\pi\\sqrt{\\dfrac{M}{K}}",
          application: K === Infinity ? "K \\to \\infty" : `2\\pi\\sqrt{\\dfrac{${tex(M * 1000, 0)}}{${tex(K * 1e6, 0)}}}`,
          resultat: { symbole: `T${etiquette(borne)}`, valeur: r.T, unite: "s", decimales: 3 },
          references: ["tablier_rigide"],
          commentaire: K === Infinity ? "Tablier bloqué sur un appui rigide : période nulle." : undefined,
        },
        {
          id: `Sd_${dir}_${borne}`,
          titre: `Accélération spectrale (q = ${nombre(q, 2)})`,
          resultat: { symbole: `S_d(T)${etiquette(borne)}`, valeur: r.Sd, unite: "m/s²", decimales: 3 },
          references: ["Sd"],
          commentaire: r.T < a.TB ? "T < TB." : r.T <= a.TC ? "Plateau du spectre (TB ≤ T ≤ TC)." : r.T <= a.TD ? "Branche en 1/T (TC ≤ T ≤ TD)." : "Branche en 1/T² (T > TD).",
        },
        {
          id: `F_${dir}_${borne}`,
          titre: "Effort sismique total",
          formule: "F = M\\,S_d(T)",
          application: `${tex(M, 1)}\\ \\text{t} \\times ${tex(r.Sd, 3)}`,
          resultat: { symbole: `F${etiquette(borne)}`, valeur: r.F, unite: "MN", decimales: 3 },
          references: ["tablier_rigide"],
        },
        {
          id: `d_${dir}_${borne}`,
          titre: "Déplacement sismique du tablier",
          formule: "d_E = \\eta\\,\\mu_d\\,d_{Ee}, \\qquad d_{Ee} = \\dfrac{F}{K}",
          application: K === Infinity ? "0" : `${tex(a.eta, 3)} \\times ${tex(r.muD, 3)} \\times \\dfrac{${tex(r.F, 3)}}{${tex(K, 2)}}`,
          resultat: { symbole: `d_E${etiquette(borne)}`, valeur: r.dE * 100, unite: "cm", decimales: 2 },
          references: ["mu_d", "tablier_rigide"],
          commentaire: `μd = ${nombre(r.muD, 3)}${q === 1 ? " (q = 1)" : ""}.`,
        },
      );
    }
    for (const ap of U.appuis) {
      const apL = L_.appuis.find((x) => x.id === ap.id);
      notes[dir].push({
        id: `F_${dir}_${ap.id}`,
        titre: `${ap.id} — effort ${dir === "x" ? "longitudinal" : "transversal"} transmis par le tablier`,
        formule: "F_i = \\dfrac{k_i}{K}\\,F" + (ap.torsion > 0 ? " + \\dfrac{M_t\\,k_i\\,|x_i - x_K|}{\\sum k_j (x_j - x_K)^2}" : ""),
        application: `${tex(ap.part, 4)} \\times ${tex(U.F, 3)}` + (ap.torsion > 0 ? ` + ${tex(ap.torsion, 3)}` : ""),
        resultat: { symbole: `F_{${ap.id}}${etiquette("ubdp")}`, valeur: ap.F, unite: "MN", decimales: 3 },
        references: ap.torsion > 0 ? ["tablier_rigide", "torsion_excentricite"] : ["tablier_rigide"],
        commentaire: `Déplacement de la tête d'appui${m.elastomeres ? " (LBDP)" : ""} : ${nombre((apL?.dTete ?? 0) * 100, 2)} cm ; distorsion des appareils : ${nombre((apL?.dAppareils ?? 0) * 100, 2)} cm.`,
      });
    }
  }

  // --- Composante verticale : réactions forfaitaires ---------------------------------
  const t = p.tablier.travees;
  const n = t.length;
  const Lp = Math.max(...t);
  const psi = n >= 2 ? (t[0] ?? 0) / Lp : 1;
  const egal = (u: number, v: number) => Math.abs(u - v) <= 0.05 * Math.max(u, v);
  const regulier = n === 1 || (egal(t[0] ?? 0, t[n - 1] ?? 0) && t.slice(1, -1).every((x) => egal(x, Lp)) && psi >= 0.5 - 1e-9 && psi <= 1 + 1e-9);
  const aV = a.plateaux.Sve;
  const mu = m.masses.masseLineique;
  const reactions: ReactionVerticale[] = [];
  let motif = "";
  if (!regulier) {
    motif = "Travées de rive inégales, travées intermédiaires différentes ou Ψ hors de [0,5 ; 1] : méthode forfaitaire non applicable.";
  } else {
    const tab = TABLEAU_B_VERTICAL.valeurs;
    const bDe = (i: number): number => {
      if (n === 1) return 0.41;
      const culee = i === 0 || i === n;
      if (n === 2) return culee ? interpoler(i === 0 ? tab["2 travées"]?.R1 ?? {} : tab["2 travées"]?.R3 ?? {}, psi) : interpoler(tab["2 travées"]?.R2 ?? {}, psi);
      if (n === 3) return interpoler((culee ? tab["3 travées"]?.R1 : tab["3 travées"]?.R2) ?? {}, psi);
      const g = tab["4 travées et plus"] ?? {};
      if (culee) return interpoler(g["R1 (culée)"] ?? {}, psi);
      if (i === 1 || i === n - 1) return interpoler(g["R2 (1re pile)"] ?? {}, psi);
      return interpoler(g["Ri (piles intermédiaires)"] ?? {}, psi);
    };
    p.appuis.forEach((ap, i) => {
      const b = bDe(i);
      reactions.push({ id: ap.id, b, R: (aV * b * mu * Lp) / 1000 });
    });
    motif = `${n} travée(s), Ψ = ${nombre(psi, 3)}.`;
  }
  notes.vertical.push({
    id: "a_vertical",
    titre: "Accélération du plateau vertical",
    formule: "a = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
    resultat: { symbole: "a", valeur: aV, unite: "m/s²", decimales: 3 },
    references: ["reactions_verticales", "Sve"],
  });
  for (const r of reactions) {
    notes.vertical.push({
      id: `Rv_${r.id}`,
      titre: `${r.id} — réaction verticale sous séisme vertical`,
      formule: "R_i = \\pm\\,a\\,b\\,\\mu\\,L",
      application: `${tex(aV, 3)} \\times ${tex(r.b, 3)} \\times ${tex(mu, 3)}\\ \\text{t/m} \\times ${tex(Lp, 3)}`,
      resultat: { symbole: `R_{${r.id}}`, valeur: r.R, unite: "MN", decimales: 3 },
      references: ["reactions_verticales", "b_reactions_verticales"],
    });
  }
  if (!regulier) {
    notes.vertical.push({ id: "vertical_na", titre: "Méthode forfaitaire", resultat: { symbole: "", valeur: "non applicable" }, references: ["reactions_verticales"], commentaire: motif, niveau: "alerte" });
  }

  // --- Combinaison des directions (efforts UBDP, règle 100/30/30) ------------------------
  const combinaisons = p.appuis.map((ap, i) => {
    const Fx = directions.x.ubdp.appuis[i]?.F ?? 0;
    const Fy = directions.y.ubdp.appuis[i]?.F ?? 0;
    const Fz = reactions[i]?.R ?? 0;
    return {
      id: ap.id,
      cas: [
        { nom: "X + 0,3 Y + 0,3 Z", Fx, Fy: 0.3 * Fy, Fz: 0.3 * Fz },
        { nom: "0,3 X + Y + 0,3 Z", Fx: 0.3 * Fx, Fy, Fz: 0.3 * Fz },
        { nom: "0,3 X + 0,3 Y + Z", Fx: 0.3 * Fx, Fy: 0.3 * Fy, Fz },
      ],
    };
  });
  for (const c of combinaisons) {
    notes.combinaisons.push({
      id: `comb_${c.id}`,
      titre: `${c.id} — combinaisons des directions (± sur chaque terme)`,
      formule: "E = \\pm E_1 \\pm 0{,}3\\,E_2 \\pm 0{,}3\\,E_3",
      resultat: {
        symbole: "(F_x ; F_y ; F_z)",
        valeur: c.cas.map((k) => `${k.nom} : (${nombre(k.Fx, 3)} ; ${nombre(k.Fy, 3)} ; ${nombre(k.Fz, 3)}) MN`).join(" — "),
      },
      references: ["combinaison_100_30_30"],
      commentaire: m.elastomeres ? "Efforts horizontaux en propriétés limites supérieures (UBDP)." : undefined,
    });
  }

  const note: SectionNote[] = [
    { id: "conditions", titre: "Conditions d'application", lignes: notes.conditions },
    { id: "longitudinal", titre: "Direction longitudinale", lignes: notes.x },
    { id: "transversal", titre: "Direction transversale", lignes: notes.y },
    { id: "vertical", titre: "Composante verticale", lignes: notes.vertical },
    { id: "combinaisons", titre: "Combinaison des directions", lignes: notes.combinaisons },
  ];

  return {
    M,
    directions,
    torsion: { e0, L, appliquee: torsionAppliquee },
    vertical: { applicable: regulier, motif, a: aV, mu, L: Lp, psi, reactions },
    conditions,
    combinaisons,
    note,
  };
}
