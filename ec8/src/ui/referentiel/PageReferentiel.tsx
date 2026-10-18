import { useEffect, useMemo, useState } from "react";
import { ETAPES, REFERENTIEL, SOURCES, type Disponibilite, type Etape, type Statut } from "../../referentiel/index.ts";
import { Onglets, Panneau } from "../Onglets.tsx";
import { aller } from "../route.ts";
import { BadgeStatut, CarteEntree, LIBELLES_STATUT } from "./CarteEntree.tsx";

const LIBELLES_DISPO: Record<Disponibilite, string> = {
  fourni: "Fourni",
  public: "Texte public",
  projet: "Projet (prEN) lu",
  non_fourni: "Non consulté",
};

const STATUTS: Statut[] = ["verifie", "via_guide", "a_verifier"];

type OngletReferentiel = Etape | "sources";

const ETAPES_PRESENTES = ETAPES.filter((et) => REFERENTIEL.some((e) => e.etape === et.id));

const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function TableSources() {
  return (
    <div className="defile">
      <table className="valeurs table-sources">
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Édition</th>
            <th scope="col">Disponibilité</th>
            <th scope="col">Remarque</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(SOURCES).map((s) => (
            <tr key={s.id}>
              <th scope="row" title={s.titre}>
                {s.abrege}
              </th>
              <td>{s.edition}</td>
              <td>
                <span className={`badge dispo-${s.disponibilite}`}>{LIBELLES_DISPO[s.disponibilite]}</span>
              </td>
              <td className="remarque">{s.remarque ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageReferentiel({ sous = null, ancre = null }: { sous?: string | null; ancre?: string | null }) {
  const [statuts, setStatuts] = useState<Set<Statut>>(new Set(STATUTS));
  const [recherche, setRecherche] = useState("");

  // L'onglet vient de l'adresse ; un lien vers une entrée (#/referentiel/<id>) ouvre l'onglet de son étape.
  const entreeCible = REFERENTIEL.find((e) => e.id === (ancre ?? sous));
  const onglet: OngletReferentiel =
    sous === "sources" ? "sources" : entreeCible ? entreeCible.etape : ETAPES_PRESENTES.some((e) => e.id === sous) ? (sous as Etape) : (ETAPES_PRESENTES[0]?.id ?? "classification");

  useEffect(() => {
    if (!entreeCible) return;
    setStatuts(new Set(STATUTS));
    setRecherche("");
    const id = window.setTimeout(() => {
      const el = document.getElementById(entreeCible.id);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("cible");
      window.setTimeout(() => el.classList.remove("cible"), 2000);
    }, 50);
    return () => window.clearTimeout(id);
  }, [entreeCible]);

  const comptes = useMemo(() => {
    const c: Record<Statut, number> = { verifie: 0, via_guide: 0, a_verifier: 0 };
    for (const e of REFERENTIEL) c[e.statut]++;
    return c;
  }, []);

  const references = useMemo(() => {
    const toutes = REFERENTIEL.flatMap((e) => e.references);
    return {
      citees: toutes.filter((r) => r.etat === "citee_par_guide").length,
      an: toutes.filter((r) => r.etat === "citee_par_an").length,
      projet: toutes.filter((r) => r.etat === "lue_projet").length,
      aConfirmer: toutes.filter((r) => r.etat === "a_confirmer").length,
    };
  }, []);

  const q = normaliser(recherche.trim());
  const filtres = useMemo(
    () =>
      REFERENTIEL.filter(
        (e) =>
          statuts.has(e.statut) &&
          (q
            ? normaliser([e.id, e.libelle, e.note ?? "", ...e.references.map((r) => `${SOURCES[r.source].abrege} ${r.localisation}`)].join(" ")).includes(q)
            : e.etape === onglet),
      ),
    [statuts, q, onglet],
  );

  const basculerStatut = (s: Statut) =>
    setStatuts((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(s)) suivant.delete(s);
      else suivant.add(s);
      return suivant;
    });

  return (
    <main className="page page-referentiel">
      <section className="intro">
        <h1>Référentiel</h1>
        <p>
          Valeurs, règles et formules utilisées par le calcul, avec leur source et leur localisation exacte. Aucun texte des
          normes n'est reproduit.
        </p>
        <div className="compteurs" role="group" aria-label="Filtrer par statut">
          {STATUTS.map((s) => (
            <button key={s} type="button" className={`compteur statut-${s}`} aria-pressed={statuts.has(s)} onClick={() => basculerStatut(s)}>
              <span className="compteur-n">{comptes[s]}</span>
              <span>{LIBELLES_STATUT[s]}</span>
            </button>
          ))}
        </div>
        <p className="refs-bilan">
          Numéros de clause : {references.projet} lus sur le projet prEN 1998-2 (juillet 2003), {references.an} cités par
          l'annexe nationale, {references.citees} cités par le guide, {references.aConfirmer} à confirmer sur les textes.
        </p>
        <label className="recherche">
          <span className="sr">Rechercher dans tout le référentiel</span>
          <input type="search" placeholder="Rechercher dans tout le référentiel (ex. 4.1.8, γI, élastomère)" value={recherche} onChange={(ev) => setRecherche(ev.target.value)} />
        </label>
      </section>

      <div className="referentiel-corps">
        <Onglets<OngletReferentiel>
          libelle="Étapes du calcul"
          prefixe="referentiel"
          variante="vertical"
          actif={onglet}
          onChange={(o) => {
            setRecherche("");
            aller("referentiel", o);
          }}
          onglets={[
            ...ETAPES_PRESENTES.map((et) => ({
              id: et.id as OngletReferentiel,
              titre: (
                <>
                  <span>{et.titre}</span>
                  <span className="onglet-n">{REFERENTIEL.filter((e) => e.etape === et.id).length}</span>
                </>
              ),
            })),
            { id: "sources", titre: <span>Sources ({Object.keys(SOURCES).length})</span> },
          ]}
        />
        <Panneau prefixe="referentiel" actif={onglet} className="referentiel-panneau">
          {q ? (
            <>
              <h2>
                Résultats dans tout le référentiel <span className="groupe-n">{filtres.length}</span>
              </h2>
              {filtres.length === 0 && <p className="vide-liste">Aucune entrée ne correspond à la recherche.</p>}
              {filtres.map((e) => (
                <CarteEntree key={e.id} e={e} />
              ))}
            </>
          ) : onglet === "sources" ? (
            <>
              <h2>Sources</h2>
              <TableSources />
            </>
          ) : (
            <>
              <h2>
                {ETAPES.find((e) => e.id === onglet)?.titre} <span className="groupe-n">{filtres.length}</span>
              </h2>
              {filtres.length === 0 && <p className="vide-liste">Aucune entrée pour les statuts sélectionnés.</p>}
              {filtres.map((e) => (
                <CarteEntree key={e.id} e={e} />
              ))}
            </>
          )}
          <footer className="pied">
            Légende : <BadgeStatut statut="verifie" /> lu sur la source primaire · <BadgeStatut statut="via_guide" /> reproduit ou
            cité par le guide Cerema 2015 · <BadgeStatut statut="a_verifier" /> à confirmer.
          </footer>
        </Panneau>
      </div>
    </main>
  );
}
