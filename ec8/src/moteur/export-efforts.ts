// Export des efforts sismiques par appui pour le dimensionnement des appuis et fondations
// dans PSIDA (psida.ksr-infra.org, carte « Appuis et fondations ») : combinaison sismique
// G + ψ2,1 Q + AEd (EN 1990 6.4.3.4), avec AEd = efforts en tête d'appui transmis par le tablier.
// Unités du fichier : kN, m.

import type { Projet } from "../projet/types.ts";
import type { ActionSismique } from "./action.ts";
import type { Analyse } from "./analyse.ts";

export interface CasEfforts {
  nom: string;
  /** Effort longitudinal en tête d'appui (kN), à prendre avec ±. */
  Fx: number;
  /** Effort transversal en tête d'appui (kN), à prendre avec ±. */
  Fy: number;
  /** Réaction verticale sismique (kN), à prendre avec ±. */
  Fz: number;
}

export interface EffortsAppui {
  id: string;
  x: number;
  type: "pile" | "culee";
  cas: CasEfforts[];
  /** Déplacement sismique de la tête d'appui (m), propriétés inférieures (LBDP). */
  dTete: { x: number; y: number };
  /** Distorsion sismique des appareils d'appui (m), LBDP. */
  dAppareils: { x: number; y: number };
}

export interface ExportEfforts {
  format: "pont-ec8-efforts";
  version: 1;
  projet: string;
  unites: { force: "kN"; longueur: "m" };
  q: { x: number; y: number };
  periodes: { x: number; y: number };
  masse: number;
  appuis: EffortsAppui[];
  remarques: string[];
}

export function exporterEfforts(p: Projet, a: ActionSismique, r: Analyse): ExportEfforts {
  const kN = (v: number) => v * 1000;
  return {
    format: "pont-ec8-efforts",
    version: 1,
    projet: p.nom,
    unites: { force: "kN", longueur: "m" },
    q: { x: a.q.longitudinal, y: a.q.transversal },
    periodes: { x: r.directions.x.lbdp.T, y: r.directions.y.lbdp.T },
    masse: r.M,
    appuis: p.appuis.map((ap, i) => {
      const c = r.combinaisons[i];
      const lx = r.directions.x.lbdp.appuis[i], ly = r.directions.y.lbdp.appuis[i];
      return {
        id: ap.id,
        x: lx?.x ?? 0,
        type: ap.type,
        cas: (c?.cas ?? []).map((k) => ({ nom: k.nom, Fx: kN(k.Fx), Fy: kN(k.Fy), Fz: kN(k.Fz) })),
        dTete: { x: lx?.dTete ?? 0, y: ly?.dTete ?? 0 },
        dAppareils: { x: lx?.dAppareils ?? 0, y: ly?.dAppareils ?? 0 },
      };
    }),
    remarques: [
      "Efforts horizontaux transmis par le tablier en tête d'appui, propriétés limites supérieures (UBDP), combinaison des directions 100/30/30 (EN 1998-2 4.2.1.4).",
      "Réactions verticales sismiques forfaitaires (guide Cerema 2015) ; nulles si la méthode n'est pas applicable.",
      "Inertie propre des fûts non comprise : à ajouter au pied des appuis si elle n'est pas négligeable.",
    ],
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
