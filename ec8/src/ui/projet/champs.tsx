import { useEffect, useId, useState, type ReactNode } from "react";
import { REFERENTIEL } from "../../referentiel/index.ts";
import { formatNombre } from "../format.ts";
import { lien } from "../route.ts";

interface Base {
  libelle: string;
  aide?: string;
  /** Identifiant d'une entrée du référentiel, affiché en lien « réf. ». */
  refId?: string;
}

function Etiquette({ id, libelle, unite, refId }: { id: string; libelle: string; unite?: string; refId?: string }) {
  return (
    <label htmlFor={id} className="champ-libelle">
      {libelle}
      {unite && <span className="champ-unite"> ({unite})</span>}
      {refId && (
        <a className="champ-ref" href={lien("referentiel", REFERENTIEL.find((e) => e.id === refId)?.etape, refId)} title="Voir dans le référentiel">
          réf.
        </a>
      )}
    </label>
  );
}

const lireNombre = (s: string): number | null => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "" || !/^-?\d*\.?\d*(e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Champ numérique tolérant la virgule décimale ; la valeur n'est transmise que si elle est lisible. */
export function ChampNombre({
  libelle,
  unite,
  valeur,
  onChange,
  min,
  max,
  entier = false,
  aide,
  refId,
}: Base & { unite?: string; valeur: number; onChange: (v: number) => void; min?: number; max?: number; entier?: boolean }) {
  const id = useId();
  const [texte, setTexte] = useState(() => formatNombre(valeur));
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (!focus) setTexte(formatNombre(valeur));
  }, [valeur, focus]);

  const n = lireNombre(texte);
  const invalide = n === null || (entier && !Number.isInteger(n)) || (min !== undefined && n < min) || (max !== undefined && n > max);

  return (
    <div className="champ">
      <Etiquette id={id} libelle={libelle} unite={unite} refId={refId} />
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={texte}
        aria-invalid={invalide || undefined}
        aria-describedby={aide ? `${id}-aide` : undefined}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setTexte(formatNombre(valeur));
        }}
        onChange={(e) => {
          setTexte(e.target.value);
          const v = lireNombre(e.target.value);
          if (v !== null && !(entier && !Number.isInteger(v))) onChange(v);
        }}
      />
      {aide && (
        <small id={`${id}-aide`} className="champ-aide">
          {aide}
        </small>
      )}
    </div>
  );
}

export function ChampTexte({ libelle, valeur, onChange, aide }: Base & { valeur: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="champ champ-large">
      <Etiquette id={id} libelle={libelle} />
      <input id={id} type="text" value={valeur} onChange={(e) => onChange(e.target.value)} />
      {aide && <small className="champ-aide">{aide}</small>}
    </div>
  );
}

export function ChampChoix<T extends string | number>({
  libelle,
  valeur,
  options,
  onChange,
  aide,
  refId,
}: Base & { valeur: T; options: { valeur: T; libelle: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="champ">
      <Etiquette id={id} libelle={libelle} refId={refId} />
      <select
        id={id}
        value={String(valeur)}
        onChange={(e) => {
          const o = options.find((x) => String(x.valeur) === e.target.value);
          if (o) onChange(o.valeur);
        }}
      >
        {options.map((o) => (
          <option key={String(o.valeur)} value={String(o.valeur)}>
            {o.libelle}
          </option>
        ))}
      </select>
      {aide && <small className="champ-aide">{aide}</small>}
    </div>
  );
}

export function ChampCase({ libelle, valeur, onChange, aide }: Base & { valeur: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="champ champ-case">
      <input id={id} type="checkbox" checked={valeur} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{libelle}</label>
      {aide && <small className="champ-aide">{aide}</small>}
    </div>
  );
}

export function Grille({ children }: { children: ReactNode }) {
  return <div className="grille-champs">{children}</div>;
}
