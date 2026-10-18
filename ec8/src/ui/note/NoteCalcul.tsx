import { useState } from "react";
import { tex, type LigneNote, type SectionNote } from "../../moteur/note.ts";
import { REFERENTIEL, SOURCES } from "../../referentiel/index.ts";
import { Onglets, Panneau } from "../Onglets.tsx";
import { lien } from "../route.ts";
import { Tex } from "../Tex.tsx";

/** Références d'une ligne de note : source qui fait foi de chaque entrée du référentiel citée. */
export function References({ ids }: { ids: string[] }) {
  return (
    <ul className="refs-ligne">
      {ids.map((id) => {
        const e = REFERENTIEL.find((x) => x.id === id);
        if (!e) return null;
        const [premiere] = e.references;
        const guide = e.references.find((r) => r.source === "GUIDE_CEREMA_2015");
        return (
          <li key={id}>
            <a href={lien("referentiel", e.etape, e.id)} title={e.libelle}>
              {premiere && (
                <>
                  <span className="ref-source">{SOURCES[premiere.source].abrege}</span> <span className="ref-loc">{premiere.localisation}</span>
                  {premiere.etat === "a_confirmer" && <span className="ref-etat etat-a_confirmer">à confirmer</span>}
                  {premiere.etat === "citee_par_guide" && <span className="ref-etat etat-citee_par_guide">citée par le guide</span>}
                  {premiere.etat === "citee_par_an" && <span className="ref-etat etat-citee_par_guide">citée par l'AN</span>}
                  {premiere.etat === "lue_projet" && <span className="ref-etat etat-lue_projet">lue sur le projet prEN</span>}
                </>
              )}
              {guide && guide !== premiere && <span className="ref-page"> · guide p. {guide.page}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Ligne({ l }: { l: LigneNote }) {
  const r = l.resultat;
  const numerique = r && typeof r.valeur === "number";
  const valeurTex = numerique ? `\\boldsymbol{${tex(r.valeur as number, r.decimales ?? 3)}}${r.unite ? `\\ \\text{${r.unite}}` : ""}` : "";
  return (
    <article className={`ligne-note ${l.niveau ? `niveau-${l.niveau}` : ""}`}>
      <h3>{l.titre}</h3>
      {l.formule && <Tex bloc>{l.formule}</Tex>}
      {r && numerique && <Tex bloc>{`${r.symbole} = ${l.application ? `${l.application} = ` : ""}${valeurTex}`}</Tex>}
      {r && !numerique && (
        <p className="resultat-texte">
          <Tex>{r.symbole}</Tex> : <strong>{String(r.valeur)}</strong>
        </p>
      )}
      {!r && l.application && <Tex bloc>{l.application}</Tex>}
      {l.commentaire && <p className="commentaire">{l.commentaire}</p>}
      <References ids={l.references} />
    </article>
  );
}

/** Note de calcul découpée en sections, chacune dans son onglet. */
export function NoteCalcul({ sections, prefixe }: { sections: SectionNote[]; prefixe: string }) {
  const [actif, setActif] = useState(sections[0]?.id ?? "");
  const section = sections.find((s) => s.id === actif) ?? sections[0];
  if (!section) return null;
  return (
    <div className="note-calcul">
      <Onglets
        libelle="Sections de la note de calcul"
        prefixe={prefixe}
        variante="vertical"
        actif={section.id}
        onChange={setActif}
        onglets={sections.map((s, i) => ({
          id: s.id,
          titre: (
            <>
              <span className="onglet-numero">{i + 1}</span>
              <span>{s.titre}</span>
            </>
          ),
          marque: s.lignes.some((l) => l.niveau === "alerte") ? "alerte" : undefined,
        }))}
      />
      <Panneau prefixe={prefixe} actif={section.id} className="note-panneau">
        <h2>
          {sections.indexOf(section) + 1}. {section.titre}
        </h2>
        {section.lignes.map((l) => (
          <Ligne key={l.id} l={l} />
        ))}
      </Panneau>
    </div>
  );
}
