import type { Comparaison, StatutComparaison } from "../../moteur/validation-exemple.ts";
import { formatNombre } from "../format.ts";
import { Tex } from "../Tex.tsx";

const LIBELLES: Record<StatutComparaison, string> = {
  conforme: "✓ conforme",
  ecart_explique: "≈ écart expliqué",
  ecart: "✗ écart",
};

const CLASSES: Record<StatutComparaison, string> = {
  conforme: "statut-verifie",
  ecart_explique: "statut-via_guide",
  ecart: "statut-a_verifier",
};

/** Comparaison des résultats du moteur aux valeurs imprimées dans l'exemple du guide. */
export function TableValidation<R>({ titre, comparaisons }: { titre: string; comparaisons: Comparaison<R>[] }) {
  const conformes = comparaisons.filter((c) => c.statut === "conforme").length;
  const expliques = comparaisons.filter((c) => c.statut === "ecart_explique").length;
  const ecarts = comparaisons.length - conformes - expliques;
  return (
    <section className="carte-plate">
      <h2>{titre}</h2>
      <p className="aide-bloc">
        Le moteur recalcule l'exemple du pont dalle (guide Cerema 2015, annexe 1), indépendamment du projet en cours, et compare chaque grandeur à la valeur
        imprimée. Conforme : le résultat arrondit à la valeur du guide (ou s'en écarte de moins de 0,2 %). Écart expliqué : le guide arrondit une valeur
        intermédiaire, comme l'indique la remarque.
      </p>
      <p className={`bilan-validation ${ecarts === 0 ? "ok" : "ko"}`}>
        {ecarts === 0 ? "✓" : "✗"} {conformes} conforme{conformes > 1 ? "s" : ""}
        {expliques > 0 && `, ${expliques} écart${expliques > 1 ? "s" : ""} expliqué${expliques > 1 ? "s" : ""}`}
        {ecarts > 0 && `, ${ecarts} écart${ecarts > 1 ? "s" : ""} non expliqué${ecarts > 1 ? "s" : ""}`} sur {comparaisons.length}
      </p>
      <div className="defile">
        <table className="valeurs table-validation">
          <thead>
            <tr>
              <th scope="col">Grandeur</th>
              <th scope="col">Guide</th>
              <th scope="col">Calculé</th>
              <th scope="col">Écart</th>
              <th scope="col">Page</th>
              <th scope="col">Statut</th>
            </tr>
          </thead>
          <tbody>
            {comparaisons.map(({ point, calcule, ecart, statut }) => (
              <tr key={point.id}>
                <th scope="row">
                  {point.libelle} <Tex>{point.symbole}</Tex>
                  {point.remarque && <small className="remarque-validation">{point.remarque}</small>}
                </th>
                <td className="num">
                  {formatNombre(point.guide)} {point.unite !== "-" && point.unite}
                </td>
                <td className="num">{formatNombre(Number(calcule.toFixed(4)))}</td>
                <td className="num">
                  {formatNombre(Number(ecart.toFixed(4)) || 0)}
                  {point.guide !== 0 && Math.abs(ecart) > 1e-9 && <small className="ecart-relatif"> ({formatNombre(Number(((100 * ecart) / point.guide).toFixed(2)) || 0)} %)</small>}
                </td>
                <td>{point.page}</td>
                <td>
                  <span className={`badge ${CLASSES[statut]}`}>{LIBELLES[statut]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
