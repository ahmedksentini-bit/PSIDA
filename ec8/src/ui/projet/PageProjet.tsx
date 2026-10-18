import { lazy, Suspense, useMemo, useState } from "react";
import type { Projet } from "../../projet/types.ts";
import { valider } from "../../projet/validation.ts";
import { aller } from "../route.ts";
import { Saisie, SOUS_ONGLETS_PROJET, type Modifier, type SousOngletProjet } from "./Saisie.tsx";

const Vue3D = lazy(() => import("./Vue3D.tsx"));

interface Props {
  projet: Projet;
  modifier: Modifier;
  remplacer: (p: Projet) => void;
  sous: string | null;
}

export function PageProjet({ projet, modifier, remplacer, sous }: Props) {
  const [appuiActif, setAppuiActif] = useState<string | null>(null);
  const problemes = useMemo(() => valider(projet), [projet]);
  const erreurs = problemes.filter((p) => p.niveau === "erreur").length;
  const alertes = problemes.filter((p) => p.niveau === "alerte").length;
  const sousOnglet: SousOngletProjet = (SOUS_ONGLETS_PROJET as string[]).includes(sous ?? "") ? (sous as SousOngletProjet) : "site";

  const choisirAppui = (id: string | null) => {
    setAppuiActif(id);
    if (id) aller("projet", "appuis");
  };

  return (
    <main className="page-projet">
      <section className="panneau-saisie" aria-label="Saisie du pont">
        <header className="panneau-tete">
          <h1>{projet.nom || "Projet sans nom"}</h1>
          <p className={`etat-saisie ${erreurs ? "erreur" : alertes ? "alerte" : "ok"}`}>
            {erreurs
              ? `${erreurs} erreur${erreurs > 1 ? "s" : ""} à corriger`
              : alertes
                ? `Saisie complète, ${alertes} alerte${alertes > 1 ? "s" : ""}`
                : "Saisie complète et cohérente"}
          </p>
        </header>
        <Saisie
          projet={projet}
          modifier={modifier}
          remplacer={remplacer}
          problemes={problemes}
          appuiActif={appuiActif}
          setAppuiActif={choisirAppui}
          sousOnglet={sousOnglet}
          setSousOnglet={(o) => aller("projet", o)}
        />
      </section>
      <section className="panneau-3d" aria-label="Vue 3D du pont">
        <Suspense fallback={<div className="vue3d chargement">Chargement de la vue 3D…</div>}>
          <Vue3D projet={projet} appuiActif={appuiActif} onSelectAppui={choisirAppui} />
        </Suspense>
      </section>
    </main>
  );
}
