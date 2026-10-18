// Étape 6a : appareils d'appui en élastomère (NF EN 15129, NF EN 1337-3), repos d'appui
// (EN 1998-2 6.6.4) et joints de chaussée. Unités : MN, m, MPa, rad.

import { derives, epaisseurElastomere } from "../projet/geometrie.ts";
import type { AppareilsElastomere, Appui, Culee, Projet } from "../projet/types.ts";
import { LG } from "../referentiel/combinaisons.ts";
import type { ActionSismique } from "./action.ts";
import type { Analyse } from "./analyse.ts";
import type { Modele } from "./modele.ts";
import { nombre, tex, type LigneNote, type SectionNote } from "./note.ts";

export type Etat = "ok" | "non_verifie" | "info";

export interface Critere {
  id: string;
  appui: string;
  libelle: string;
  /** Valeur calculée et limite, dans la même unité. */
  valeur: number;
  limite: number | null;
  unite: string;
  etat: Etat;
  commentaire?: string;
  references: string[];
}

export interface CombinaisonAppareil {
  nom: string;
  /** Effort normal par appareil (MN). */
  N: number;
  /** Déplacement horizontal total de calcul (m). */
  dEd: number;
  epsC: number;
  epsQ: number;
  epsA: number;
  epsT: number;
}

export interface VerifAppareils {
  id: string;
  type: Appui["type"];
  elastomere: boolean;
  /** Réactions et rotation permanentes retenues, et leur origine. */
  permanentes: { Nmax: number; Nmin: number; rotation: number; source: "saisie" | "poutre continue" };
  service: { distance: number; dT: number; dDiff: number };
  dbd: number;
  dEd: number;
  S?: number;
  Ar?: number;
  EcPrime?: number;
  Pcr?: number;
  combinaisons: CombinaisonAppareil[];
  glissement?: { F: number; R: number; Nmin: number; sigmaM: number };
}

export interface VerifAppuis {
  appareils: VerifAppareils[];
  criteres: Critere[];
  repos: { id: string; lm: number; deg: number; des: number; lov: number; disponible: number; Leff: number }[];
  joints: { id: string; dE: number; dG: number; dT: number; souffle: number; souffleRetenu: number; regle: string; jeuGardeGreve: number; dEd: number }[];
  note: SectionNote[];
}

/** Réactions d'une poutre continue sous charge uniforme q (théorème des trois moments, EI constant). */
export function reactionsPoutreContinue(travees: number[], q: number): number[] {
  const n = travees.length;
  if (n === 1) return [(q * (travees[0] ?? 0)) / 2, (q * (travees[0] ?? 0)) / 2];
  // Inconnues : moments M1…M(n−1) sur appuis intermédiaires (M0 = Mn = 0).
  const m = n - 1;
  const a = new Array<number>(m).fill(0);
  const b = new Array<number>(m).fill(0);
  const c = new Array<number>(m).fill(0);
  const dd = new Array<number>(m).fill(0);
  for (let i = 1; i <= m; i++) {
    const Li = travees[i - 1] ?? 0;
    const Lj = travees[i] ?? 0;
    a[i - 1] = Li;
    b[i - 1] = 2 * (Li + Lj);
    c[i - 1] = Lj;
    dd[i - 1] = (-q * (Li ** 3 + Lj ** 3)) / 4;
  }
  // Algorithme de Thomas.
  for (let i = 1; i < m; i++) {
    const w = (a[i] ?? 0) / (b[i - 1] ?? 1);
    b[i] = (b[i] ?? 0) - w * (c[i - 1] ?? 0);
    dd[i] = (dd[i] ?? 0) - w * (dd[i - 1] ?? 0);
  }
  const M = new Array<number>(m).fill(0);
  M[m - 1] = (dd[m - 1] ?? 0) / (b[m - 1] ?? 1);
  for (let i = m - 2; i >= 0; i--) M[i] = ((dd[i] ?? 0) - (c[i] ?? 0) * (M[i + 1] ?? 0)) / (b[i] ?? 1);
  const Mt = [0, ...M, 0];
  return Array.from({ length: n + 1 }, (_, i) => {
    let R = 0;
    if (i > 0) {
      const L = travees[i - 1] ?? 0;
      R += (q * L) / 2 + ((Mt[i - 1] ?? 0) - (Mt[i] ?? 0)) / L;
    }
    if (i < n) {
      const L = travees[i] ?? 0;
      R += (q * L) / 2 + ((Mt[i + 1] ?? 0) - (Mt[i] ?? 0)) / L;
    }
    return R;
  });
}

const vect = (x: number, y: number) => Math.hypot(x, y);

export function verifierAppuis(p: Projet, a: ActionSismique, m: Modele, r: Analyse): VerifAppuis {
  const d = derives(p);
  const positions = d.positions;
  const criteres: Critere[] = [];
  const lignes: LigneNote[] = [];
  const lignesRepos: LigneNote[] = [];
  const lignesJoints: LigneNote[] = [];
  const { gammaIS, Kf } = p.elastomeres;
  const { retraitFluage, deltaT, alpha } = p.service;

  // Point fixe : centre des raideurs longitudinales (LBDP).
  const kx = m.directions.x.appuis.map((x) => x.kTotal.lbdp);
  const infinis = kx.map((k, i) => (k === Infinity ? positions[i] ?? 0 : null)).filter((x): x is number => x !== null);
  const x0 = infinis.length ? infinis.reduce((s, x) => s + x, 0) / infinis.length : kx.reduce((s, k, i) => s + k * (positions[i] ?? 0), 0) / Math.max(m.directions.x.K.lbdp, 1e-12);

  const reactionsG = reactionsPoutreContinue(p.tablier.travees, d.poidsLineique.total / 1000);
  if (!r.vertical.applicable) {
    criteres.push({
      id: "vertical_absent",
      appui: "—",
      libelle: "Séisme vertical non pris en compte dans les appareils (méthode forfaitaire non applicable à cet ouvrage)",
      valeur: 0,
      limite: null,
      unite: "",
      etat: "info",
      commentaire: r.vertical.motif,
      references: ["reactions_verticales", "composante_verticale_a_considerer"],
    });
  }
  const Rv = r.vertical.reactions;

  const appareils: VerifAppareils[] = p.appuis.map((appui, i) => {
    const xi = positions[i] ?? 0;
    const distance = Math.abs(xi - x0);
    const dT = alpha * deltaT * distance;
    const dDiff = retraitFluage * distance;
    const rx = r.directions.x.lbdp.appuis[i];
    const ry = r.directions.y.lbdp.appuis[i];
    const dbd = rx?.dAppareils ?? 0;
    const dbdY = ry?.dAppareils ?? 0;
    const cp = appui.chargesPermanentes;
    const permanentes = cp
      ? { ...cp, source: "saisie" as const }
      : { Nmax: reactionsG[i] ?? 0, Nmin: reactionsG[i] ?? 0, rotation: 0, source: "poutre continue" as const };
    const rv = Rv[i]?.R ?? 0;
    const app = appui.appareils;
    const dEd = gammaIS * dbd + 0.5 * dT + dDiff;
    const base: VerifAppareils = { id: appui.id, type: appui.type, elastomere: app.type === "elastomere", permanentes, service: { distance, dT, dDiff }, dbd, dEd, combinaisons: [] };

    lignes.push({
      id: `${appui.id}_service`,
      titre: `${appui.id} — déplacements de service`,
      formule: "d_T = \\alpha\\,\\Delta T\\,|x - x_0|, \\qquad d_{diff} = \\varepsilon_{diff}\\,|x - x_0|",
      application: `${tex(alpha * 1e5, 2)}\\cdot 10^{-5} \\times ${tex(deltaT, 1)} \\times ${tex(distance, 3)}, \\quad ${tex(retraitFluage * 1e4, 2)}\\cdot 10^{-4} \\times ${tex(distance, 3)}`,
      resultat: { symbole: "d_T ;\\ d_{diff}", valeur: `${nombre(dT * 100, 2)} cm ; ${nombre(dDiff * 100, 2)} cm` },
      references: ["deplacements_service"],
      commentaire: `Point fixe x0 = ${nombre(x0, 3)} m (centre des raideurs longitudinales). Charges permanentes : ${permanentes.source === "saisie" ? "calcul de service saisi" : "poutre continue (estimation)"} — Nmax = ${nombre(permanentes.Nmax, 3)} MN, Nmin = ${nombre(permanentes.Nmin, 3)} MN, rotation ${nombre(permanentes.rotation * 1000, 2)}·10⁻³ rad.`,
      niveau: permanentes.source === "poutre continue" ? "info" : undefined,
    });

    if (app.type !== "elastomere") {
      criteres.push({
        id: `${appui.id}_rigides`,
        appui: appui.id,
        libelle: app.type === "fixe" ? "Appareils fixes : dimensionnement en capacité (sur-résistance ≥ 1,3) par le fabricant" : "Appareils glissants : course ≥ déplacement majoré, à justifier par le fabricant",
        valeur: app.type === "fixe" ? 1.3 * Math.max(rx?.F ?? 0, ry?.F ?? 0) : dEd,
        limite: null,
        unite: app.type === "fixe" ? "MN" : "m",
        etat: "info",
        references: ["appareils_fixes"],
      });
      return base;
    }

    const e = app as AppareilsElastomere;
    const Tq = epaisseurElastomere(e) ?? 0;
    const ap = e.a - 2 * e.enrobageLateral;
    const bp = e.b - 2 * e.enrobageLateral;
    const Ap = ap * bp;
    const S = Ap / (2 * e.ti * (ap + bp));
    const vx = dT + dDiff;
    const Ar = Ap * (1 - vx / ap);
    const G = m.elastomeres?.Gb ?? 1.1 * e.Gg;
    const EcPrime = 3 * G * (1 + 2 * S * S);
    const sommeTi3 = e.nbFeuillets * e.ti ** 3 + 2 * e.enrobage ** 3;
    const alphaA = permanentes.rotation + 0.003;
    const alphaB = 0.003;
    const epsA = ((ap * ap * alphaA + bp * bp * alphaB) * e.ti) / (2 * sommeTi3);
    const n = e.nombre;

    // Combinaisons 100/30/30 : X dominant, Y dominant, Z dominant (séisme vertical descendant).
    const service = 0.5 * dT + dDiff;
    const combos = [
      { nom: "X + 0,3 Y + 0,3 Z", N: (permanentes.Nmax + 0.3 * rv) / n, dEd: vect(gammaIS * dbd + service, 0.3 * gammaIS * dbdY) },
      { nom: "0,3 X + Y + 0,3 Z", N: (permanentes.Nmax + 0.3 * rv) / n, dEd: vect(0.3 * gammaIS * dbd + service, gammaIS * dbdY) },
      { nom: "0,3 X + 0,3 Y + Z", N: (permanentes.Nmax + rv) / n, dEd: vect(0.3 * gammaIS * dbd + service, 0.3 * gammaIS * dbdY) },
    ];
    const combinaisons: CombinaisonAppareil[] = combos.map((c) => {
      const epsC = (6 * S * c.N) / (Ar * EcPrime);
      const epsQ = c.dEd / Tq;
      return { ...c, epsC, epsQ, epsA, epsT: epsC + epsQ + epsA };
    });
    const pire = combinaisons.reduce((x, y) => (y.epsT > x.epsT ? y : x));
    const pireQ = combinaisons.reduce((x, y) => (y.epsQ > x.epsQ ? y : x));
    const Pcr = (1.3 * G * Ar * ap * S) / Tq;

    lignes.push(
      {
        id: `${appui.id}_S`,
        titre: `${appui.id} — coefficient de forme et aire réduite`,
        formule: "S = \\dfrac{a'b'}{2\\,t_i\\,(a' + b')}, \\quad A_r = A'\\left(1 - \\dfrac{v_x}{a'}\\right), \\quad E'_c = 3G(1 + 2S^2)",
        application: `S = \\dfrac{${tex(ap, 3)} \\times ${tex(bp, 3)}}{2 \\times ${tex(e.ti, 3)} \\times ${tex(ap + bp, 3)}}, \\quad A_r = ${tex(Ap, 4)}\\left(1 - \\dfrac{${tex(vx, 4)}}{${tex(ap, 3)}}\\right), \\quad E'_c = 3 \\times ${tex(G, 3)} \\times (1 + 2 \\times ${tex(S, 2)}^2)`,
        resultat: { symbole: "S ;\\ A_r ;\\ E'_c", valeur: `${nombre(S, 2)} ; ${nombre(Ar, 4)} m² ; ${nombre(EcPrime, 0)} MPa` },
        references: ["elastomere_coef_forme", "elastomere_eps_c_E"],
      },
      {
        id: `${appui.id}_dEd`,
        titre: `${appui.id} — déplacement total de calcul (longitudinal)`,
        formule: "d_{Ed} = \\gamma_{IS}\\,d_{bd} + 0{,}5\\,d_T + d_{diff}",
        application: `${tex(gammaIS, 2)} \\times ${tex(dbd, 4)} + 0{,}5 \\times ${tex(dT, 4)} + ${tex(dDiff, 4)}`,
        resultat: { symbole: "d_{Ed}", valeur: dEd, unite: "m", decimales: 4 },
        references: ["dEd_appuis", "gamma_IS"],
        commentaire: `dbd = distorsion sismique LBDP des appareils (${nombre(dbd * 100, 2)} cm). Combinaisons : résultante avec la composante transversale.`,
      },
      {
        id: `${appui.id}_epsT`,
        titre: `${appui.id} — distorsion totale (combinaison ${pire.nom})`,
        formule: "\\varepsilon_{t,d} = K_L\\,(\\varepsilon_{c,E} + \\varepsilon_{q,max} + \\varepsilon_{\\alpha,d}), \\quad \\varepsilon_{c,E} = \\dfrac{6\\,S\\,N_{Ed}}{A_r\\,E'_c}, \\quad \\varepsilon_{q} = \\dfrac{d_{Ed}}{T_q}, \\quad \\varepsilon_{\\alpha,d} = \\dfrac{(a'^2\\alpha_a + b'^2\\alpha_b)\\,t_i}{2\\sum t_i^3}",
        application: `${tex(pire.epsC, 3)} + ${tex(pire.epsQ, 3)} + ${tex(pire.epsA, 3)}`,
        resultat: { symbole: "\\varepsilon_{t,d}", valeur: pire.epsT, decimales: 3 },
        references: ["elastomere_distorsion_totale", "elastomere_eps_c_E", "elastomere_eps_q_max", "elastomere_eps_alpha_d"],
        commentaire: `NEd = ${nombre(pire.N * 1000, 0)} kN par appareil ; αa = ${nombre(alphaA * 1000, 2)}·10⁻³ rad (rotation permanente + 0,003), αb = 3·10⁻³ rad.`,
      },
    );

    const ok = (cond: boolean): Etat => (cond ? "ok" : "non_verifie");
    criteres.push(
      { id: `${appui.id}_epsq`, appui: appui.id, libelle: `Distorsion de cisaillement εq,max (${pireQ.nom})`, valeur: pireQ.epsQ, limite: 2.0, unite: "", etat: ok(pireQ.epsQ <= 2.0), references: ["elastomere_limites_eps_q", "elastomere_eps_q_max"], commentaire: "Limite conseillée 2,0 (NF EN 15129 : 2,5)." },
      { id: `${appui.id}_epst`, appui: appui.id, libelle: `Distorsion totale εt,d (${pire.nom})`, valeur: pire.epsT, limite: 7, unite: "", etat: ok(pire.epsT <= 7), references: ["elastomere_distorsion_totale"] },
    );

    // Flambement : pour chaque combinaison.
    let flambeOk = true;
    let flambeTexte = "";
    for (const c of combinaisons) {
      const rapport = c.dEd / ap;
      let okC: boolean;
      if (c.N < Pcr / 4) okC = rapport <= 0.7;
      else if (c.N < Pcr / 2) okC = 1 - (2 * c.N) / Pcr >= 0.7 * rapport;
      else okC = false;
      if (!okC) flambeOk = false;
      flambeTexte += `${c.nom} : N = ${nombre(c.N * 1000, 0)} kN, dEd/a' = ${nombre(rapport, 2)} ; `;
    }
    const Nmax = Math.max(...combinaisons.map((c) => c.N));
    criteres.push({
      id: `${appui.id}_flambement`,
      appui: appui.id,
      libelle: "Flambement : NEd,max < Pcr/4 et dEd/a' ≤ 0,7 (ou critère intermédiaire)",
      valeur: Nmax * 1000,
      limite: (Pcr / 4) * 1000,
      unite: "kN",
      etat: ok(flambeOk),
      references: ["elastomere_flambement"],
      commentaire: `Pcr = ${nombre(Pcr * 1000, 0)} kN. ${flambeTexte}`,
    });
    lignes.push({
      id: `${appui.id}_Pcr`,
      titre: `${appui.id} — charge critique de flambement`,
      formule: "P_{cr} = \\lambda\\,G\\,A_r\\,\\dfrac{a'\\,S}{T_q}, \\quad \\lambda = 1{,}3",
      application: `1{,}3 \\times ${tex(G, 3)} \\times ${tex(Ar, 4)} \\times \\dfrac{${tex(ap, 3)} \\times ${tex(S, 2)}}{${tex(Tq, 3)}}`,
      resultat: { symbole: "P_{cr}", valeur: Pcr * 1000, unite: "kN", decimales: 0 },
      references: ["elastomere_flambement"],
    });

    // Glissement (séisme vertical ascendant 0,3 Rv).
    const NminApp = (permanentes.Nmin - 0.3 * rv) / n;
    const sigmaM = NminApp / Ap;
    const khdyn = (m.directions.x.appuis[i]?.kAppareils.lbdp ?? 0) / n;
    const khstat = (e.a * e.b * e.Gg) / Tq;
    const F = gammaIS * dbd * khdyn + (0.5 * dT + dDiff) * khstat;
    const R = NminApp > 0 ? (0.1 + Kf / sigmaM) * NminApp : 0;
    const glisseOk = F <= R;
    criteres.push({
      id: `${appui.id}_glissement`,
      appui: appui.id,
      libelle: "Non-glissement : Fxy,Ed ≤ (0,1 + Kf/σm)·NEd,min",
      valeur: F,
      limite: R,
      unite: "MN",
      etat: glisseOk ? "ok" : e.fixation === "mecanique" ? "info" : "non_verifie",
      references: ["elastomere_glissement", "elastomere_effort_glissement"],
      commentaire: glisseOk
        ? undefined
        : e.fixation === "mecanique"
          ? "Frottement insuffisant : la fixation mécanique prévue reprend l'effort (taquets ou boulonnage à justifier)."
          : "Frottement insuffisant : fixation mécanique (anti-cheminement) nécessaire.",
    });
    lignes.push({
      id: `${appui.id}_glissement`,
      titre: `${appui.id} — non-glissement`,
      formule: "F_{xy,Ed} = \\gamma_{IS}\\,d_{bd}\\,k_{h,dyn} + (0{,}5\\,d_T + d_{diff})\\,k_{h,stat} \\le \\left(0{,}1 + \\dfrac{K_f}{\\sigma_m}\\right) N_{Ed,min}",
      application: `${tex(gammaIS, 2)} \\times ${tex(dbd, 4)} \\times ${tex(khdyn, 3)} + ${tex(0.5 * dT + dDiff, 4)} \\times ${tex(khstat, 3)} = ${tex(F, 3)} \\ \\text{vs}\\ \\left(0{,}1 + \\dfrac{${tex(Kf, 2)}}{${tex(sigmaM, 2)}}\\right) \\times ${tex(NminApp, 3)}`,
      resultat: { symbole: "R", valeur: R, unite: "MN", decimales: 3 },
      references: ["elastomere_glissement", "elastomere_effort_glissement"],
      commentaire: `NEd,min = (Nmin − 0,3 Rv)/n = ${nombre(NminApp * 1000, 0)} kN ; σm = ${nombre(sigmaM, 2)} MPa${sigmaM < 3 ? " (< 3 MPa)" : ""}.`,
      niveau: glisseOk ? undefined : "alerte",
    });

    // Soulèvement (EN 1998-2 6.6.3.2) : réaction verticale sismique / réaction permanente minimale.
    const ductile = Math.max(a.q.longitudinal, a.q.transversal) > 1.5;
    const seuil = ductile ? 0.8 : 0.5;
    const rapportV = permanentes.Nmin > 0 ? rv / permanentes.Nmin : Infinity;
    criteres.push({
      id: `${appui.id}_soulevement`,
      appui: appui.id,
      libelle: `Réaction verticale sismique / réaction permanente minimale ≤ ${nombre(seuil, 1)} (sinon dispositifs anti-soulèvement)`,
      valeur: rapportV,
      limite: seuil,
      unite: "",
      etat: rapportV <= seuil ? "ok" : "non_verifie",
      references: ["anti_soulevement"],
      commentaire: `Rv = ${nombre(rv, 3)} MN ; Nmin = ${nombre(permanentes.Nmin, 3)} MN. ${permanentes.Nmin - rv > 0 ? "Pas de soulèvement d'appareil (Nmin − Rv > 0)." : "Soulèvement des appareils !"}`,
    });

    return { ...base, S, Ar, EcPrime, Pcr, combinaisons, glissement: { F, R, Nmin: NminApp, sigmaM } };
  });

  // --- Repos d'appui et joints (extrémités du tablier) ---------------------------------
  const Lg = LG.valeurs[p.site.classeSol];
  const epsE = (2 * a.dg) / Lg;
  const repos: VerifAppuis["repos"] = [];
  const joints: VerifAppuis["joints"] = [];
  const dE = r.directions.x.lbdp.dE;
  [0, p.appuis.length - 1].forEach((i) => {
    const appui = p.appuis[i];
    if (!appui || appui.type !== "culee") return;
    const c = appui as Culee;
    const v = appareils[i];
    if (!v) return;
    const Leff = v.service.distance;
    const deg = Math.min(epsE * Leff, 2 * a.dg);
    const des = dE + v.service.dDiff + 0.5 * v.service.dT;
    const lm = 0.4;
    const lov = lm + deg + des;
    // Recouvrement disponible : du nu avant du sommier à l'extrémité du tablier.
    const disponible = c.excentrementAppui + c.poteaux.cote / 2 + c.sommier.debordAvant + p.tablier.debordAbout;
    repos.push({ id: c.id, lm, deg, des, lov, disponible, Leff });
    criteres.push({
      id: `${c.id}_repos`,
      appui: c.id,
      libelle: "Longueur de repos d'appui : lov = lm + deg + des ≤ recouvrement disponible",
      valeur: lov,
      limite: disponible,
      unite: "m",
      etat: lov <= disponible ? "ok" : "non_verifie",
      references: ["lov_repos_appui", "Lg"],
    });
    lignesRepos.push({
      id: `${c.id}_lov`,
      titre: `${c.id} — longueur minimale de repos d'appui`,
      formule: "l_{ov} = l_m + d_{eg} + d_{es}, \\quad d_{eg} = \\dfrac{2\\,d_g}{L_g}\\,L_{eff} \\le 2\\,d_g, \\quad d_{es} = d_E + d_{diff} + 0{,}5\\,d_T",
      application: `0{,}40 + \\dfrac{2 \\times ${tex(a.dg, 4)}}{${tex(Lg, 0)}} \\times ${tex(Leff, 3)} + (${tex(dE, 4)} + ${tex(v.service.dDiff, 4)} + 0{,}5 \\times ${tex(v.service.dT, 4)})`,
      resultat: { symbole: "l_{ov}", valeur: lov, unite: "m", decimales: 3 },
      references: ["lov_repos_appui", "Lg", "dg"],
      commentaire: `Leff = distance au point fixe (aucune liaison rigide). Recouvrement disponible (nu du sommier → extrémité du tablier) : ${nombre(disponible, 2)} m.`,
    });

    // Joint de chaussée.
    const souffle = 2 * dE + 2 * v.service.dT + v.service.dDiff;
    const service = v.service.dDiff + 0.5 * v.service.dT;
    const cat = p.site.categorie;
    const regle =
      cat === "I" || cat === "II"
        ? "Catégorie II : séisme pouvant être ignoré pour le joint (about et culée non endommagés)."
        : dE <= 0.02
          ? "dE ≤ 2 cm : joint dimensionné au séisme ultime."
          : "dE > 2 cm : souffle = souffle de service + 0,4 × souffle sismique (séisme de service), garde-grève fusible au-delà.";
    const souffleRetenu = cat === "I" || cat === "II" ? 2 * v.service.dT + v.service.dDiff : dE <= 0.02 ? souffle : 2 * service + 0.4 * 2 * dE;
    const faceGG = c.sommier.long - c.poteaux.cote / 2 - c.sommier.debordAvant - c.gardeGreve.retrait - c.gardeGreve.epaisseur;
    const jeuGardeGreve = faceGG - c.excentrementAppui - p.tablier.debordAbout;
    const dEdJoint = dE + v.service.dDiff + 0.5 * v.service.dT;
    joints.push({ id: c.id, dE, dG: v.service.dDiff, dT: v.service.dT, souffle, souffleRetenu, regle, jeuGardeGreve, dEd: dEdJoint });
    lignesJoints.push(
      {
        id: `${c.id}_souffle`,
        titre: `${c.id} — souffle sismique total du joint`,
        formule: "\\text{souffle} = 2\\,d_E + 2\\,d_T + d_G",
        application: `2 \\times ${tex(dE * 100, 2)} + 2 \\times ${tex(v.service.dT * 100, 2)} + ${tex(v.service.dDiff * 100, 2)}`,
        resultat: { symbole: "\\text{souffle}", valeur: souffle * 100, unite: "cm", decimales: 1 },
        references: ["souffle_joint", "joints_chaussee"],
        commentaire: `${regle} Souffle retenu : ${nombre(souffleRetenu * 100, 1)} cm.`,
      },
      {
        id: `${c.id}_jeu`,
        titre: `${c.id} — jeu entre tablier et garde-grève`,
        resultat: { symbole: "\\text{jeu}", valeur: jeuGardeGreve * 100, unite: "cm", decimales: 1 },
        references: ["joints_chaussee", "pE_pT"],
        commentaire:
          jeuGardeGreve >= dEdJoint
            ? "Jeu suffisant pour le déplacement sismique de calcul."
            : `Jeu inférieur au déplacement de calcul (${nombre(dEdJoint * 100, 1)} cm) : choc du tablier sur le garde-grève, à rendre fusible (vérification à l'étape 6c).`,
        niveau: jeuGardeGreve >= dEdJoint ? undefined : "info",
      },
    );
    criteres.push({
      id: `${c.id}_garde_greve`,
      appui: c.id,
      libelle: "Jeu tablier / garde-grève ≥ déplacement sismique de calcul (sinon garde-grève fusible)",
      valeur: jeuGardeGreve,
      limite: dEdJoint,
      unite: "m",
      etat: jeuGardeGreve >= dEdJoint ? "ok" : "info",
      references: ["joints_chaussee"],
    });
  });

  const note: SectionNote[] = [
    { id: "appareils", titre: "Appareils d'appui", lignes },
    { id: "repos", titre: "Repos d'appui", lignes: lignesRepos },
    { id: "joints", titre: "Joints et garde-grève", lignes: lignesJoints },
  ];
  return { appareils, criteres, repos, joints, note };
}
