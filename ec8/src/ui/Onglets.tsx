import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface Onglet<T extends string> {
  id: T;
  titre: ReactNode;
  /** Pastille d'état (erreur, alerte…) affichée après le titre. */
  marque?: "erreur" | "alerte";
}

interface Props<T extends string> {
  onglets: Onglet<T>[];
  actif: T;
  onChange: (id: T) => void;
  libelle: string;
  /** Identifiant de base pour relier onglets et panneaux. */
  prefixe: string;
  variante?: "secondaire" | "vertical";
}

/** Liste d'onglets accessible : flèches, Début et Fin pour naviguer ; le panneau porte role="tabpanel". */
export function Onglets<T extends string>({ onglets, actif, onChange, libelle, prefixe, variante = "secondaire" }: Props<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = onglets.findIndex((o) => o.id === actif);
    const suivant = variante === "vertical" ? "ArrowDown" : "ArrowRight";
    const precedent = variante === "vertical" ? "ArrowUp" : "ArrowLeft";
    let j: number | null = null;
    if (e.key === suivant) j = (i + 1) % onglets.length;
    else if (e.key === precedent) j = (i - 1 + onglets.length) % onglets.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = onglets.length - 1;
    if (j === null) return;
    e.preventDefault();
    const cible = onglets[j];
    if (!cible) return;
    onChange(cible.id);
    refs.current.get(cible.id)?.focus();
  };

  return (
    <div role="tablist" aria-label={libelle} aria-orientation={variante === "vertical" ? "vertical" : "horizontal"} className={`onglets-${variante}`} onKeyDown={clavier}>
      {onglets.map((o) => (
        <button
          key={o.id}
          ref={(el) => {
            if (el) refs.current.set(o.id, el);
            else refs.current.delete(o.id);
          }}
          type="button"
          role="tab"
          id={`${prefixe}-onglet-${o.id}`}
          aria-controls={`${prefixe}-panneau`}
          aria-selected={o.id === actif}
          tabIndex={o.id === actif ? 0 : -1}
          onClick={() => onChange(o.id)}
        >
          {o.titre}
          {o.marque && <span className={`pastille ${o.marque}`} aria-label={o.marque === "erreur" ? "erreur" : "alerte"} />}
        </button>
      ))}
    </div>
  );
}

export function Panneau({ prefixe, actif, children, className }: { prefixe: string; actif: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${prefixe}-panneau`} aria-labelledby={`${prefixe}-onglet-${actif}`} className={className} tabIndex={0}>
      {children}
    </div>
  );
}
