import { SOURCES, type EntreeReferentiel, type EtatReference, type Statut } from "../../referentiel/index.ts";
import { nombreTex } from "../format.ts";
import { Tex } from "../Tex.tsx";
import { TableValeurs } from "./TableValeurs.tsx";

export const LIBELLES_STATUT: Record<Statut, string> = {
  verifie: "Vérifié sur la source",
  via_guide: "Via le guide Cerema",
  a_verifier: "À vérifier",
};

const LIBELLES_ETAT: Record<Exclude<EtatReference, "lue">, string> = {
  lue_projet: "lue sur le projet prEN",
  citee_par_guide: "citée par le guide",
  citee_par_an: "citée par l'AN",
  a_confirmer: "à confirmer",
};

const TITRES_ETAT: Record<Exclude<EtatReference, "lue">, string> = {
  lue_projet: "Clause lue dans le projet prEN 1998-2 (juillet 2003) ; à recouper sur l'EN 1998-2:2005 publiée et l'amendement A1",
  citee_par_guide: "Numéro de clause imprimé par le guide Cerema ; texte de la norme non consulté",
  citee_par_an: "Numéro de clause cité par l'annexe nationale NF EN 1998-2/NA (2013) ; texte de la norme non consulté",
  a_confirmer: "Numéro de clause attendu, cité par aucun document consulté",
};

const LIBELLES_TYPE: Record<EntreeReferentiel["type"], string> = {
  scalaire: "Valeur",
  table: "Tableau",
  regle: "Règle",
  formule: "Formule",
};

export function BadgeStatut({ statut }: { statut: Statut }) {
  return <span className={`badge statut-${statut}`}>{LIBELLES_STATUT[statut]}</span>;
}

function Contenu({ e }: { e: EntreeReferentiel }) {
  switch (e.type) {
    case "scalaire":
      return (
        <p className="valeur-scalaire">
          <Tex>{`${e.symbole} = ${nombreTex(e.valeur)}`}</Tex>
          {e.unite !== "-" && <span className="unite">{e.unite}</span>}
        </p>
      );
    case "table":
      return (
        <>
          <p className="symbole">
            <Tex>{e.symbole}</Tex>
            {e.unite !== "-" && <span className="unite">en {e.unite}</span>}
          </p>
          <TableValeurs valeurs={e.valeurs} cles={e.cles} unite={e.unite} />
        </>
      );
    case "regle":
      return <p className="enonce">{e.enonce}</p>;
    case "formule":
      return (
        <>
          <Tex bloc>{e.latex}</Tex>
          {e.variables.length > 0 && (
            <dl className="variables">
              {e.variables.map((v) => (
                <div key={v.symbole}>
                  <dt>
                    <Tex>{v.symbole}</Tex>
                  </dt>
                  <dd>
                    {v.description}
                    {v.unite && v.unite !== "-" && <span className="unite"> [{v.unite}]</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {e.conditions && e.conditions.length > 0 && (
            <ul className="conditions">
              {e.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </>
      );
  }
}

export function CarteEntree({ e }: { e: EntreeReferentiel }) {
  return (
    <article className="carte" id={e.id}>
      <header className="carte-tete">
        <h3>{e.libelle}</h3>
        <div className="carte-meta">
          <span className="type">{LIBELLES_TYPE[e.type]}</span>
          <BadgeStatut statut={e.statut} />
          <code className="ident">{e.id}</code>
        </div>
      </header>
      <div className="carte-corps">
        <Contenu e={e} />
      </div>
      <ul className="refs">
        {e.references.map((r, i) => {
          const s = SOURCES[r.source];
          return (
            <li key={`${r.source}-${r.localisation}`}>
              <span className="ref-source" title={`${s.titre} — ${s.edition}`}>
                {s.abrege}
              </span>
              <span className="ref-loc">{r.localisation}</span>
              {r.page && <span className="ref-page">p. {r.page}</span>}
              {r.etat && r.etat !== "lue" && (
                <span className={`ref-etat etat-${r.etat}`} title={TITRES_ETAT[r.etat]}>
                  {LIBELLES_ETAT[r.etat]}
                </span>
              )}
              {i === 0 && e.references.length > 1 && <span className="ref-foi">fait foi</span>}
            </li>
          );
        })}
      </ul>
      {e.note && <p className="note">{e.note}</p>}
    </article>
  );
}
