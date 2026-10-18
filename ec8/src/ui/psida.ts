// Passerelle avec PSIDA quand Pont EC8 tourne dans l'onglet « Calcul sismique » (iframe) :
//  · PSIDA → Pont EC8 : { source: "psida", type: "projet", projet } remplace le projet courant (export toPontEC8) ;
//  · Pont EC8 → PSIDA : { source: "pont-ec8", type: "efforts", ... } à chaque modification du projet — efforts par appui
//    (exporterEfforts), périodes, efforts totaux, masse, alertes — repris par « Appuis et fondations ».
//  · { source: "pont-ec8", type: "pret" } à l'ouverture, pour que PSIDA envoie un projet en attente.

import { actionSismique } from "../moteur/action.ts";
import { analyse } from "../moteur/analyse.ts";
import { exporterEfforts } from "../moteur/export-efforts.ts";
import { modele } from "../moteur/modele.ts";
import { lireProjet } from "../projet/stockage.ts";
import type { Projet } from "../projet/types.ts";
import { valider } from "../projet/validation.ts";

export const integreDansPsida = (): boolean => {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
};

const envoyer = (message: Record<string, unknown>): void => {
  if (integreDansPsida()) window.parent.postMessage({ source: "pont-ec8", ...message }, window.location.origin);
};

export function signalerPret(): void {
  envoyer({ type: "pret" });
}

/** Écoute les projets envoyés par PSIDA ; renvoie la fonction de désabonnement. */
export function ecouterPsida(remplacer: (p: Projet) => void, surErreur: (m: string) => void): () => void {
  const surMessage = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin || !ev.data || ev.data.source !== "psida" || ev.data.type !== "projet") return;
    try {
      remplacer(lireProjet(structuredClone(ev.data.projet)));
    } catch (e) {
      surErreur(e instanceof Error ? e.message : String(e));
    }
  };
  window.addEventListener("message", surMessage);
  return () => window.removeEventListener("message", surMessage);
}

/** Calcule et transmet à PSIDA les efforts sismiques par appui du projet courant. */
export function transmettreEfforts(p: Projet): void {
  if (!integreDansPsida()) return;
  try {
    const problemes = valider(p);
    const a = actionSismique(p), m = modele(p), r = analyse(p, a, m);
    envoyer({
      type: "efforts",
      nom: p.nom,
      travees: p.tablier.travees,
      efforts: exporterEfforts(p, a, r),
      T: { x: r.directions.x.lbdp.T, y: r.directions.y.lbdp.T },
      F: { x: r.directions.x.ubdp.F * 1000, y: r.directions.y.ubdp.F * 1000 },
      M: r.M,
      q: { long: p.comportement.qLongitudinal, trans: p.comportement.qTransversal },
      site: { zone: p.site.zone, categorie: p.site.categorie, classeSol: p.site.classeSol },
      problemes: problemes.map((x) => ({ cible: x.cible, message: x.message })),
      date: new Date().toISOString(),
    });
  } catch (e) {
    envoyer({ type: "erreur", message: e instanceof Error ? e.message : String(e) });
  }
}
