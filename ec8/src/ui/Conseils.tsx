import { useState } from "react";

/** Bouton « Que changer ? » et liste des conseils d'une condition ou d'un critère non satisfait. */
export function Conseils({ items }: { items: string[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="conseils">
      <button type="button" className="bouton-conseils" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? "Masquer les recommandations" : "Que changer ?"}
      </button>
      {ouvert && (
        <ol className="conseils-liste">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
