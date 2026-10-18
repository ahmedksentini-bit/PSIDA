import { formatNombre, libelleCle } from "../format.ts";

type Primitive = number | string | null;
type Objet = Record<string, unknown>;

const estObjet = (v: unknown): v is Objet => typeof v === "object" && v !== null;
const estPrimitive = (v: unknown): v is Primitive => v === null || typeof v === "number" || typeof v === "string";

function Cellule({ v }: { v: unknown }) {
  if (v === null) return <td className="vide" title="Aucune limitation">sans limite</td>;
  if (typeof v === "number") return <td className="num">{formatNombre(v)}</td>;
  return <td>{String(v)}</td>;
}

interface Props {
  valeurs: unknown;
  cles: string[];
  unite: string;
}

/**
 * Affiche les valeurs d'un paramètre tabulé, quelle que soit sa profondeur :
 * une clé → une ligne ; une clé et des objets → lignes × champs ;
 * deux clés → lignes groupées par la première clé.
 */
export function TableValeurs({ valeurs, cles, unite }: Props) {
  if (!estObjet(valeurs)) return null;
  const entrees = Object.entries(valeurs);
  const [cle1 = "", cle2 = ""] = cles;

  if (entrees.every(([, v]) => estPrimitive(v))) {
    return (
      <div className="defile">
        <table className="valeurs">
          <thead>
            <tr>
              <th scope="row">{cle1}</th>
              {entrees.map(([k]) => (
                <th key={k} scope="col">
                  {libelleCle(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{unite}</th>
              {entrees.map(([k, v]) => (
                <Cellule key={k} v={v} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const objets = entrees.filter((e): e is [string, Objet] => estObjet(e[1]));
  const plats = objets.every(([, o]) => Object.values(o).every(estPrimitive));

  if (plats) {
    const colonnes = [...new Set(objets.flatMap(([, o]) => Object.keys(o)))];
    return (
      <div className="defile">
        <table className="valeurs">
          <thead>
            <tr>
              <th scope="col">{cle1}</th>
              {colonnes.map((c) => (
                <th key={c} scope="col">
                  {libelleCle(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {objets.map(([k, o]) => (
              <tr key={k}>
                <th scope="row">{libelleCle(k)}</th>
                {colonnes.map((c) => (
                  <Cellule key={c} v={o[c]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Deux niveaux de clés, feuilles = objets (ex. groupe de zones → classe de sol → {TB, TC, TD}).
  const lignes = objets.flatMap(([k1, o]) =>
    Object.entries(o)
      .filter((e): e is [string, Objet] => estObjet(e[1]))
      .map(([k2, feuille], i, tout) => ({ k1, k2, feuille, premiere: i === 0, n: tout.length })),
  );
  const colonnes = [...new Set(lignes.flatMap((l) => Object.keys(l.feuille)))];
  return (
    <div className="defile">
      <table className="valeurs">
        <thead>
          <tr>
            <th scope="col">{cle1}</th>
            <th scope="col">{cle2}</th>
            {colonnes.map((c) => (
              <th key={c} scope="col">
                {libelleCle(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={`${l.k1}-${l.k2}`} className={l.premiere ? "debut-groupe" : undefined}>
              {l.premiere && (
                <th scope="rowgroup" rowSpan={l.n}>
                  {libelleCle(l.k1)}
                </th>
              )}
              <th scope="row">{libelleCle(l.k2)}</th>
              {colonnes.map((c) => (
                <Cellule key={c} v={l.feuille[c]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
