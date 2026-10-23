// Export des efforts sismiques par appui pour le dimensionnement des appuis et fondations
// dans PSIDA (psida.ksr-infra.org, carte « Appuis et fondations ») : combinaison sismique
// G + ψ2,1 Q + AEd (EN 1990 6.4.3.4), avec AEd = efforts en tête d'appui transmis par le tablier.
// Quatre méthodes peuvent fournir AEd : mode fondamental, multimodale, temporel linéaire, pont isolé.
// Pour les fondations, un second jeu d'efforts suit l'EN 1998-2 5.8.2 : effets × q (ductilité limitée, q ≤ 1,5,
// et ponts isolés) ou effets du dimensionnement en capacité des piles (5.3, annexe G.2), plafonnés à q·AEd (5.3(2)).
// Unités du fichier : kN, m.

import type { MethodeEfforts, Pile, Projet } from "../projet/types.ts";
import type { ActionSismique } from "./action.ts";
import { valeur } from "./spectres.ts";
import type { Analyse } from "./analyse.ts";
import type { PontIsole } from "./isolation.ts";
import { inerties, modele as construireModele, type Modele } from "./modele.ts";
import type { Multimodale } from "./multimodal.ts";
import { capacitePile, reactionPermanente } from "./pushover.ts";
import type { Temporel } from "./temporel.ts";

export interface CasEfforts {
  nom: string;
  /** Effort longitudinal en tête d'appui (kN), à prendre avec ±. */
  Fx: number;
  /** Effort transversal en tête d'appui (kN), à prendre avec ±. */
  Fy: number;
  /** Réaction verticale sismique (kN), à prendre avec ±. */
  Fz: number;
  /** Inertie propre des fûts (piles) : effort tranchant (kN) et moment (kN·m) au pied du fût, mêmes coefficients 1/0,3/0,3. */
  fut?: { Fx: number; Mx: number; Fy: number; My: number };
}

/** Inertie propre des fûts d'une pile, par direction (MN, MN·m au pied du fût dans le moteur ; kN, kN·m dans l'export). */
export interface InertieFut {
  masse: number;
  hauteur: number;
  x: { Tf: number; a0: number; aH: number; F: number; M: number };
  y: { Tf: number; a0: number; aH: number; F: number; M: number };
}

/** Détail du passage AEd → effets pour les fondations, dans une direction (kN, kN·m). */
export interface DetailCapacite {
  regle: "q_fois_AEd" | "capacite" | "capacite_plafonnee" | "AEd" | "appareils";
  VE: number;
  VC: number;
  /** Pile : résistance de calcul en flexion d'un fût en pied, sous l'effort normal sismique (kN·m). */
  MRd?: number;
  gamma0?: number;
  etaK?: number;
  nFuts?: number;
  L?: number;
  /** Effort de capacité brut γ0 n M_Rd / L, avant les bornes V_E et q·V_E (kN). */
  VCbrut?: number;
  /** Effort transmis par les appareils en élastomère à leur déformation de calcul, raideur + 30 % (5.3(8)P, kN). */
  Vappareils?: number;
}

export interface EffortsAppui {
  id: string;
  x: number;
  type: "pile" | "culee";
  cas: CasEfforts[];
  /** Effets de calcul pour les fondations (EN 1998-2 5.8.2), mêmes combinaisons 100/30/30. */
  casFondations?: CasEfforts[];
  capacite?: { x: DetailCapacite; y: DetailCapacite };
  /** Déplacement sismique de la tête d'appui (m), propriétés inférieures (LBDP). */
  dTete: { x: number; y: number };
  /** Distorsion sismique des appareils d'appui (m), LBDP. */
  dAppareils: { x: number; y: number };
  /** Inertie propre des fûts (piles seulement). */
  inertieFut?: InertieFut;
}

export interface ExportEfforts {
  format: "pont-ec8-efforts";
  version: 1;
  projet: string;
  unites: { force: "kN"; longueur: "m" };
  q: { x: number; y: number };
  periodes: { x: number; y: number };
  masse: number;
  /** Méthode d'analyse dont viennent les efforts. */
  methode?: MethodeEfforts;
  appuis: EffortsAppui[];
  /** Règle retenue pour les fondations dans chaque direction (EN 1998-2 5.8.2). */
  fondations?: { x: string; y: string };
  remarques: string[];
}

/** Sources facultatives des méthodes autres que le mode fondamental. */
export interface SourcesEfforts {
  multimodale?: Multimodale;
  temporel?: Temporel;
  isole?: { x: PontIsole; y: PontIsole };
}

interface Base {
  Fx: number[];
  Fy: number[];
  Fz: number[];
  dTete: { x: number; y: number }[];
  dApp: { x: number; y: number }[];
  q: { x: number; y: number };
  T: { x: number; y: number };
  M: number;
  methode: MethodeEfforts;
  remarques: string[];
}

const combiner = (Fx: number, Fy: number, Fz: number, f?: InertieFut, k = { x: 1, y: 1 }): CasEfforts[] => {
  const fut = (cx: number, cy: number) => (f ? { fut: { Fx: cx * k.x * f.x.F, Mx: cx * k.x * f.x.M, Fy: cy * k.y * f.y.F, My: cy * k.y * f.y.M } } : {});
  return [
    { nom: "X + 0,3 Y + 0,3 Z", Fx, Fy: 0.3 * Fy, Fz: 0.3 * Fz, ...fut(1, 0.3) },
    { nom: "0,3 X + Y + 0,3 Z", Fx: 0.3 * Fx, Fy, Fz: 0.3 * Fz, ...fut(0.3, 1) },
    { nom: "0,3 X + 0,3 Y + Z", Fx: 0.3 * Fx, Fy: 0.3 * Fy, Fz, ...fut(0.3, 0.3) },
  ];
};

/**
 * Inertie propre des fûts d'une pile (EN 1998-2 4.1.2 ; Capra et Godreau 2015, § 5.4) — approche simplifiée documentée.
 * Les appareils découplent le fût du tablier : le fût vibre dans son mode propre de console (masse répartie, période
 * T_f = 2π √(0,24 m / k), k = 3 E I / H³, inertie du modèle), généralement courte. On retient une accélération linéaire
 * du pied à la tête : a₀ = a_g·S·S_T au pied (mouvement du sol, non réduit par q) et a_H = max(S_d(T_f) ; S_d(T₁)) en tête
 * (spectre de calcul de la direction). Effort tranchant au pied F = m (a₀ + a_H)/2, moment au pied M = m H (a₀ + 2 a_H)/6,
 * ajoutés en valeur absolue aux efforts transmis par le tablier (cumul prudent, plutôt qu'une combinaison quadratique).
 */
export function inertieFuts(p: Projet, a: ActionSismique, T: { x: number; y: number }): (InertieFut | undefined)[] {
  const E = 22 * ((p.materiaux.beton.fck + 8) / 10) ** 0.3 * 1000; // MPa (MN/m²)
  const agS = a.ag * a.S * (a.ST ?? 1);
  return p.appuis.map((ap) => {
    if (ap.type !== "pile") return undefined;
    const pile = ap as Pile, H = pile.futs.hauteur, n = pile.futs.nombre;
    const sec = inerties(pile), masse = n * inerties({ ...pile, facteurInertie: 1 }).aire * H * p.materiaux.beton.masseVolumique;
    const dir = (f: Parameters<typeof valeur>[0], T1: number, I: number) => {
      const k = (3 * E * n * I) / H ** 3, Tf = 2 * Math.PI * Math.sqrt((0.24 * masse / 1000) / k);
      const a0 = agS, aH = Math.max(valeur(f, Tf), valeur(f, T1));
      // masse en t, accélérations en m/s² : efforts en MN (unités du moteur)
      return { Tf, a0, aH, F: (masse * (a0 + aH)) / 2 / 1000, M: (masse * H * (a0 + 2 * aH)) / 6 / 1000 };
    };
    return { masse, hauteur: H, x: dir(a.spectres.calculLong, T.x, sec.Ix), y: dir(a.spectres.calculTrans, T.y, sec.Iy) };
  });
}

/** Coefficient de sur-résistance γ0 des éléments en béton (EN 1998-2 5.3(4), valeur recommandée 1,35), majoré si ηk > 0,1. */
export function gamma0(etaK: number): number {
  return 1.35 * (etaK > 0.1 ? 1 + 2 * (etaK - 0.1) ** 2 : 1);
}

/**
 * Effets sismiques de calcul pour les fondations (EN 1998-2 5.8.2) dans une direction, à partir des efforts AEd en tête
 * (MN). q ≤ 1,5 ou pont isolé : AEd × q (5.8.2(2)P). q > 1,5 : dimensionnement en capacité (5.8.2(3)P, 5.3) —
 *  · piles : V_C = γ0 n M_Rd / L (annexe G.2, (G.3) avec M_E = V_E L pour un fût en console) ;
 *  · appareils en élastomère (5.3(8)P) : un élément sans rotule plastique qui reprend l'effort des appareils est dimensionné
 *    pour l'effort des appareils à leur déformation maximale (déplacement de calcul du tablier), raideur accrue de 30 % :
 *    V_b = 1,3 K_b d_b. Les culées sur élastomères reçoivent V_b ; une pile ne peut recevoir plus que V_b (min(V_C ; V_b)) ;
 *  · culées sans élastomère : AEd × ΣV_C / ΣV_E (G.4) ;
 *  le tout borné par V_E et q·V_E (5.3(2)).
 * @param dApp déformation de calcul des appareils par appui (m, propriétés inférieures, η μ_d inclus)
 */
export function effetsFondations(p: Projet, m: Modele, direction: "x" | "y", q: number, VE: number[], isole: boolean, dApp: number[] = []): DetailCapacite[] {
  if (isole || q <= 1.5) return VE.map((v) => ({ regle: q === 1 ? "AEd" : "q_fois_AEd", VE: v, VC: q * v }));
  const borne = (x: number, v: number) => Math.min(Math.max(x, v), q * v);
  const Vb = p.appuis.map((_, i) => {
    const k = m.directions[direction].appuis[i]?.kAppareils.lbdp ?? Infinity, d = dApp[i] ?? 0;
    return m.elastomeres && Number.isFinite(k) && k > 0 && d > 0 ? 1.3 * k * d : undefined;
  });
  const det: DetailCapacite[] = p.appuis.map((ap, i) => {
    const v = VE[i] ?? 0, vb = Vb[i];
    if (ap.type !== "pile") return vb !== undefined ? { regle: "appareils", VE: v, VC: borne(vb, v), Vappareils: vb } : { regle: "capacite", VE: v, VC: NaN };
    const pile = ap as Pile;
    const c = capacitePile(p, m, pile, direction, reactionPermanente(p, i, m.masses.M));
    const etaK = c.N / (inerties({ ...pile, facteurInertie: 1 }).aire * p.materiaux.beton.fck);
    const g0 = gamma0(etaK);
    const VC = (g0 * c.nFuts * c.MRd) / c.L;
    const brut = vb !== undefined ? Math.min(VC, vb) : VC;
    const regle: DetailCapacite["regle"] = brut >= q * v ? "capacite_plafonnee" : vb !== undefined && vb < VC ? "appareils" : "capacite";
    return { regle, VE: v, VC: borne(brut, v), VCbrut: VC, ...(vb !== undefined ? { Vappareils: vb } : {}), MRd: c.MRd * 1000, gamma0: g0, etaK, nFuts: c.nFuts, L: c.L };
  });
  const piles = det.filter((_, i) => p.appuis[i]!.type === "pile");
  const sE = piles.reduce((s, d) => s + d.VE, 0), sC = piles.reduce((s, d) => s + d.VC, 0);
  const ratio = sE > 0 ? Math.min(sC / sE, q) : q;
  det.forEach((d, i) => {
    if (p.appuis[i]!.type !== "pile" && d.regle !== "appareils") { d.VC = ratio * d.VE; d.regle = ratio >= q - 1e-9 ? "capacite_plafonnee" : "capacite"; }
  });
  return det;
}

function baseMethode(p: Projet, a: ActionSismique, r: Analyse, s: SourcesEfforts, methode: MethodeEfforts): Base {
  const Fz = p.appuis.map((_, i) => r.combinaisons[i]?.cas[2]?.Fz ?? 0);
  const qAe = { x: a.q.longitudinal, y: a.q.transversal };
  if (methode === "multimodale" && s.multimodale) {
    const mm = s.multimodale;
    const T1 = (d: "x" | "y") => mm.comparaison.find((c) => c.direction === d)?.T1 ?? 0;
    return {
      Fx: mm.combinaisons.map((c) => c.cas[0]?.Fx ?? 0), Fy: mm.combinaisons.map((c) => c.cas[1]?.Fy ?? 0), Fz: mm.combinaisons.map((c) => c.cas[2]?.Fz ?? 0),
      dTete: p.appuis.map((_, i) => ({ x: mm.directions.x.lbdp.appuis[i]?.dTete ?? 0, y: mm.directions.y.lbdp.appuis[i]?.dTete ?? 0 })),
      dApp: p.appuis.map((_, i) => ({ x: mm.directions.x.lbdp.appuis[i]?.dAppareils ?? 0, y: mm.directions.y.lbdp.appuis[i]?.dAppareils ?? 0 })),
      q: qAe, T: { x: T1("x"), y: T1("y") }, M: mm.directions.x.lbdp.modele.masse, methode,
      remarques: [
        "Analyse spectrale multimodale (EN 1998-2 4.2.1) : modes jusqu'à 90 % de la masse, combinaison SRSS ou CQC ; efforts horizontaux transmis par le tablier en tête d'appui, propriétés limites supérieures (UBDP), combinaison des directions 100/30/30 (EN 1998-2 4.2.1.4).",
        "Réactions verticales sismiques issues de l'analyse multimodale verticale (spectre élastique vertical).",
        
      ],
    };
  }
  if (methode === "temporel_lineaire" && s.temporel) {
    const t = s.temporel, nAcc = t.jeux.x.accelerogrammes.length;
    const val = (mo: { F: number; Fmax: number }) => (nAcc >= 7 ? mo.F : mo.Fmax);
    const T1 = (d: "x" | "y") => t.directions[d].lbdp.modes.reduce((b, x) => (x.part > b.part ? x : b), t.directions[d].lbdp.modes[0]!).T;
    return {
      Fx: t.directions.x.ubdp.moyennes.map(val), Fy: t.directions.y.ubdp.moyennes.map(val), Fz: t.directions.z.moyennes.map(val),
      dTete: p.appuis.map((_, i) => ({ x: (t.directions.x.lbdp.moyennes[i]?.dTablier ?? 0) - (t.directions.x.lbdp.moyennes[i]?.dAppareils ?? 0), y: (t.directions.y.lbdp.moyennes[i]?.dTablier ?? 0) - (t.directions.y.lbdp.moyennes[i]?.dAppareils ?? 0) })),
      dApp: p.appuis.map((_, i) => ({ x: t.directions.x.lbdp.moyennes[i]?.dAppareils ?? 0, y: t.directions.y.lbdp.moyennes[i]?.dAppareils ?? 0 })),
      q: qAe, T: { x: T1("x"), y: T1("y") }, M: r.M, methode,
      remarques: [
        `Calcul temporel linéaire (EN 1998-2 4.2.3) : ${nAcc} accélérogrammes artificiels par direction, ${nAcc >= 7 ? "moyenne des extrêmes (au moins 7 accélérogrammes)" : "maximum des extrêmes (moins de 7 accélérogrammes)"}, efforts divisés par q ; propriétés limites supérieures (UBDP) pour les efforts, inférieures (LBDP) pour les déplacements ; combinaison des directions 100/30/30.`,
        "Réactions verticales : réponse temporelle verticale (spectre élastique vertical).",
      ],
    };
  }
  if (methode === "pont_isole" && s.isole) {
    const { x, y } = s.isole;
    const ligne = (pi: PontIsole, i: number) => pi.UBDP.lignes[i];
    const lb = (pi: PontIsole, i: number) => pi.LBDP.lignes[i];
    return {
      Fx: p.appuis.map((_, i) => ligne(x, i)?.F ?? 0), Fy: p.appuis.map((_, i) => ligne(y, i)?.F ?? 0), Fz,
      dTete: p.appuis.map((_, i) => ({ x: lb(x, i)?.ds ?? 0, y: lb(y, i)?.ds ?? 0 })),
      dApp: p.appuis.map((_, i) => ({ x: lb(x, i)?.db ?? 0, y: lb(y, i)?.db ?? 0 })),
      q: { x: 1, y: 1 }, T: { x: x.LBDP.Teff, y: y.LBDP.Teff }, M: x.DP.Md, methode,
      remarques: [
        "Pont isolé (EN 1998-2 chapitre 7), méthode du mode fondamental à rigidité et amortissement effectifs : efforts par ligne d'appui avec les propriétés de calcul supérieures (UBDP), déplacements des isolateurs et des têtes d'appui avec les propriétés inférieures (LBDP) ; spectre élastique réduit par η_eff (q = 1) ; combinaison des directions 100/30/30.",
        "Réactions verticales sismiques forfaitaires (guide Cerema 2015), comme pour le pont sans isolation.",
      ],
    };
  }
  return {
    Fx: p.appuis.map((_, i) => r.directions.x.ubdp.appuis[i]?.F ?? 0), Fy: p.appuis.map((_, i) => r.directions.y.ubdp.appuis[i]?.F ?? 0), Fz,
    dTete: p.appuis.map((_, i) => ({ x: r.directions.x.lbdp.appuis[i]?.dTete ?? 0, y: r.directions.y.lbdp.appuis[i]?.dTete ?? 0 })),
    dApp: p.appuis.map((_, i) => ({ x: r.directions.x.lbdp.appuis[i]?.dAppareils ?? 0, y: r.directions.y.lbdp.appuis[i]?.dAppareils ?? 0 })),
    q: qAe, T: { x: r.directions.x.lbdp.T, y: r.directions.y.lbdp.T }, M: r.M, methode: "mode_fondamental",
    remarques: p.tablier.continuite === "isostatique" && p.tablier.travees.length > 1 ? [
      "Travées indépendantes : modèle dynamique à travées séparées (une translation par travée en X, une poutre par travée en Y, piles en console, une rangée d'appareils par about), analyse spectrale multimodale (EN 1998-2 4.2.1) ; efforts transmis en tête d'appui (somme des deux rangées sur une pile), propriétés limites supérieures (UBDP), combinaison des directions 100/30/30.",
      "Réactions verticales sismiques forfaitaires de chaque travée sur deux appuis (b = 0,41, guide Cerema 2015), cumulées sur les piles.",
      
    ] : [
      "Efforts horizontaux transmis par le tablier en tête d'appui, propriétés limites supérieures (UBDP), combinaison des directions 100/30/30 (EN 1998-2 4.2.1.4).",
      "Réactions verticales sismiques forfaitaires (guide Cerema 2015) ; nulles si la méthode n'est pas applicable.",
      
    ],
  };
}

const LIB_REGLE = (q: number, isole: boolean, d: DetailCapacite[]) =>
  isole ? "pont isolé : effets de l'analyse avec q = 1 (5.8.2(2)P)"
    : q <= 1.5 ? `ductilité limitée (q = ${q.toFixed(2).replace(".", ",")} ≤ 1,5) : AEd × q, soit les effets pour q = 1 (5.8.2(2)P)`
      : `comportement ductile (q = ${q.toFixed(2).replace(".", ",")}) : dimensionnement en capacité (5.8.2(3)P) — ${[
        d.some((x) => x.MRd !== undefined) ? "piles γ0 M_Rd (5.3, annexe G.2)" : "",
        d.some((x) => x.Vappareils !== undefined) ? "effort des appareils en élastomère à leur déformation de calcul, raideur + 30 % (5.3(8)P)" : "",
      ].filter(Boolean).join(" ; ")}${d.every((x) => x.regle === "capacite_plafonnee") ? ", plafonné partout à q·AEd (5.3(2))" : ", borné par AEd et q·AEd (5.3(2))"}`;

export function exporterEfforts(p: Projet, a: ActionSismique, r: Analyse, sources?: Multimodale | SourcesEfforts, methodeDemandee?: MethodeEfforts): ExportEfforts {
  const kN = (v: number) => v * 1000;
  const s: SourcesEfforts = sources && "combinaisons" in sources ? { multimodale: sources } : (sources as SourcesEfforts) ?? {};
  const methode: MethodeEfforts = methodeDemandee ?? (s.multimodale ? "multimodale" : s.temporel ? "temporel_lineaire" : s.isole ? "pont_isole" : "mode_fondamental");
  const b = baseMethode(p, a, r, s, methode);
  const isole = b.methode === "pont_isole";
  let fx: DetailCapacite[] = [], fy: DetailCapacite[] = [];
  const remarques = [...b.remarques];
  // inertie propre des fûts (kN, kN·m) : spectre de calcul de chaque direction (pont isolé : pas de réduction par q)
  const futs = inertieFuts(p, a, b.T);
  if (futs.some(Boolean)) remarques.push("Inertie propre des fûts ajoutée au pied des piles (approche simplifiée : accélération linéaire de a_g·S au pied à max(S_d(T_fût) ; S_d(T₁)) en tête, mode propre du fût en console découplé du tablier par les appareils ; EN 1998-2 4.1.2, Capra et Godreau 2015 § 5.4).");
  try {
    const m = construireModele(p);
    fx = effetsFondations(p, m, "x", b.q.x, b.Fx, isole, b.dApp.map((d) => d.x));
    fy = effetsFondations(p, m, "y", b.q.y, b.Fy, isole, b.dApp.map((d) => d.y));
  } catch (e) {
    remarques.push(`Effets pour les fondations non calculés : ${e instanceof Error ? e.message : String(e)}.`);
  }
  const insuff = fx.concat(fy).some((d) => d.VCbrut !== undefined && d.VCbrut < d.VE - 1e-9);
  if (fx.concat(fy).some((d) => d.MRd !== undefined) && p.appuis.some((ap) => ap.type === "pile" && !(ap as Pile).armatures))
    remarques.push("Armatures des fûts non transmises pour au moins une pile : M_Rd calculé avec 1 % de la section (barres de 25 mm, enrobage 5 cm) ; envoyer le projet depuis PSIDA après le calcul des appuis pour reprendre les aciers dimensionnés.");
  if (insuff) remarques.push("Capacité γ0 M_Rd / L inférieure à l'effort de calcul pour au moins une pile : la section d'acier des fûts est insuffisante ; l'effort de calcul est retenu pour les fondations.");
  if (fx.length) remarques.push(`Fondations (EN 1998-2 5.8.2) — X : ${LIB_REGLE(b.q.x, isole, fx)} ; Y : ${LIB_REGLE(b.q.y, isole, fy)}. Réactions verticales inchangées.`);
  const kNfut = (f: InertieFut): InertieFut => ({ ...f, x: { ...f.x, F: kN(f.x.F), M: kN(f.x.M) }, y: { ...f.y, F: kN(f.y.F), M: kN(f.y.M) } });
  // fondations : inertie des fûts × q (règle q·AEd) ou × 1 (AEd, capacité : l'effort de capacité borne déjà la pile)
  const kFond = (d: DetailCapacite | undefined, q: number) => (d && d.regle === "q_fois_AEd" ? q : 1);
  const det = (d: DetailCapacite | undefined): DetailCapacite => (d ? { ...d, VE: kN(d.VE), VC: kN(d.VC), ...(d.VCbrut !== undefined ? { VCbrut: kN(d.VCbrut) } : {}), ...(d.Vappareils !== undefined ? { Vappareils: kN(d.Vappareils) } : {}) } : { regle: "AEd", VE: 0, VC: 0 });
  return {
    format: "pont-ec8-efforts",
    version: 1,
    projet: p.nom,
    unites: { force: "kN", longueur: "m" },
    q: b.q,
    periodes: b.T,
    masse: b.M,
    methode: b.methode,
    appuis: p.appuis.map((ap, i) => {
      const Fx = b.Fx[i] ?? 0, Fy = b.Fy[i] ?? 0, Fz = b.Fz[i] ?? 0;
      const cx = fx[i], cy = fy[i];
      return {
        id: ap.id,
        x: r.directions.x.lbdp.appuis[i]?.x ?? 0,
        type: ap.type,
        cas: combiner(kN(Fx), kN(Fy), kN(Fz), futs[i] ? kNfut(futs[i]!) : undefined),
        ...(cx && cy ? {
          // capacité : calculée séparément dans chaque direction (5.3(6)), les autres composantes étant celles de l'action de calcul
          // composante orthogonale : action de calcul (capacité, 5.3(3)) ou action × q (5.8.2(2)P)
          casFondations: ((): CasEfforts[] => {
            const fF = futs[i] ? kNfut(futs[i]!) : undefined, kx = kFond(cx, b.q.x), ky = kFond(cy, b.q.y);
            const fut = (ax: number, ay: number) => (fF ? { fut: { Fx: ax * kx * fF.x.F, Mx: ax * kx * fF.x.M, Fy: ay * ky * fF.y.F, My: ay * ky * fF.y.M } } : {});
            return [
              { nom: "X + 0,3 Y + 0,3 Z (fondations)", Fx: kN(cx.VC), Fy: 0.3 * kN(cy.regle.startsWith("capacite") || cy.regle === "appareils" ? Fy : cy.VC), Fz: 0.3 * kN(Fz), ...fut(1, 0.3) },
              { nom: "0,3 X + Y + 0,3 Z (fondations)", Fx: 0.3 * kN(cx.regle.startsWith("capacite") || cx.regle === "appareils" ? Fx : cx.VC), Fy: kN(cy.VC), Fz: 0.3 * kN(Fz), ...fut(0.3, 1) },
              { nom: "0,3 X + 0,3 Y + Z (fondations)", Fx: 0.3 * kN(cx.VC), Fy: 0.3 * kN(cy.VC), Fz: kN(Fz), ...fut(0.3, 0.3) },
            ];
          })(),
          capacite: { x: det(cx), y: det(cy) },
        } : {}),
        dTete: b.dTete[i] ?? { x: 0, y: 0 },
        dAppareils: b.dApp[i] ?? { x: 0, y: 0 },
        ...(futs[i] ? { inertieFut: kNfut(futs[i]!) } : {}),
      };
    }),
    ...(fx.length ? { fondations: { x: LIB_REGLE(b.q.x, isole, fx), y: LIB_REGLE(b.q.y, isole, fy) } } : {}),
    remarques,
  };
}

export function telechargerEfforts(e: ExportEfforts): void {
  const blob = new Blob([JSON.stringify(e, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `${e.projet.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "projet"}-efforts-sismiques.json`;
  lien.click();
  URL.revokeObjectURL(url);
}
