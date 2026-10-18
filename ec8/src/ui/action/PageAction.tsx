import { useMemo, useState } from "react";
import { actionSismique, type ActionSismique } from "../../moteur/action.ts";
import { deplacement, valeur } from "../../moteur/spectres.ts";
import { validerActionExemple } from "../../moteur/validation-exemple.ts";
import type { Projet } from "../../projet/types.ts";
import { valider } from "../../projet/validation.ts";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { TableValidation } from "../note/TableValidation.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { ChampCase, ChampNombre, Grille } from "../projet/champs.tsx";
import type { Modifier } from "../projet/Saisie.tsx";
import { aller } from "../route.ts";
import { Tex } from "../Tex.tsx";
import { GraphiqueSpectre, type Serie } from "./GraphiqueSpectre.tsx";

type SousOnglet = "parametres" | "spectres" | "note" | "validation";
const SOUS_ONGLETS: SousOnglet[] = ["parametres", "spectres", "note", "validation"];
type Vue = "horizontal" | "vertical" | "deplacement";

interface Props {
  projet: Projet;
  modifier: Modifier;
  sous: string | null;
}

function LigneResultat({ libelle, symbole, valeur: v, unite, refs }: { libelle: string; symbole: string; valeur: string; unite?: string; refs: string[] }) {
  return (
    <tr>
      <th scope="row">
        {libelle} <Tex>{symbole}</Tex>
      </th>
      <td className="num">
        <strong>{v}</strong> {unite && <span className="unite">{unite}</span>}
      </td>
      <td>
        <References ids={refs} />
      </td>
    </tr>
  );
}

function Parametres({ a, projet, modifier }: { a: ActionSismique; projet: Projet; modifier: Modifier }) {
  const c = projet.comportement;
  const problemes = valider(projet).filter((p) => p.cible === "comportement");
  const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)));
  return (
    <div className="action-parametres">
      <section className="carte-plate">
        <h2>Hypothèses de comportement</h2>
        <Grille>
          <ChampNombre libelle="q longitudinal" refId="q_max" valeur={c.qLongitudinal} min={1} onChange={(v) => modifier((p) => void (p.comportement.qLongitudinal = v))} />
          <ChampNombre libelle="q transversal" refId="q_max" valeur={c.qTransversal} min={1} onChange={(v) => modifier((p) => void (p.comportement.qTransversal = v))} />
          <ChampNombre libelle="Amortissement ξ" unite="%" refId="amortissement_materiaux" valeur={c.amortissement} min={0} max={30} onChange={(v) => modifier((p) => void (p.comportement.amortissement = v))} />
        </Grille>
        <ChampCase
          libelle="Prolonger le plateau des spectres jusqu'à T = 0 (recommandation du guide)"
          valeur={c.plateauOrigine}
          onChange={(v) => modifier((p) => void (p.comportement.plateauOrigine = v))}
        />
        <p className="aide-bloc">
          q = 1 pour un tablier sur appareils en élastomère fretté ; q ≤ 1,5 en ductilité limitée (piles en béton armé fléchies, culées avec butées de blocage). La
          composante verticale est toujours traitée avec q = 1.
        </p>
        {problemes.length > 0 && (
          <ul className="problemes">
            {problemes.map((p, i) => (
              <li key={i} className={`probleme niveau-${p.niveau}`}>
                <strong>{p.niveau === "erreur" ? "Erreur" : "Alerte"}</strong> {p.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="carte-plate">
        <h2>Résultats</h2>
        <div className="defile">
          <table className="valeurs table-resultats">
            <tbody>
              <LigneResultat libelle="Coefficient d'importance" symbole="\gamma_I" valeur={f(a.gammaI, 2)} refs={["gamma_I"]} />
              <LigneResultat libelle="Accélération de référence" symbole="a_{gR}" valeur={f(a.agr, 2)} unite="m/s²" refs={["agr"]} />
              <LigneResultat libelle="Accélération de calcul" symbole="a_g" valeur={f(a.ag)} unite="m/s²" refs={["ag"]} />
              <LigneResultat libelle="Accélération verticale" symbole="a_{vg}" valeur={f(a.avg)} unite="m/s²" refs={["avg"]} />
              <LigneResultat libelle="Paramètre de sol" symbole="S" valeur={f(a.S, 2)} refs={["S"]} />
              <LigneResultat
                libelle="Périodes de coin"
                symbole="T_B,\ T_C,\ T_D"
                valeur={`${f(a.TB, 2)} ; ${f(a.TC, 2)} ; ${f(a.TD, 2)}`}
                unite="s"
                refs={["periodes_horizontales"]}
              />
              <LigneResultat libelle="Correction d'amortissement" symbole="\eta" valeur={f(a.eta)} refs={["eta"]} />
              <LigneResultat libelle="Plateau élastique" symbole="S_e" valeur={f(a.plateaux.Se)} unite="m/s²" refs={["Se"]} />
              <LigneResultat libelle={`Plateau de calcul, q = ${formatNombre(a.q.longitudinal)}`} symbole="S_{d,x}" valeur={f(a.plateaux.SdLong)} unite="m/s²" refs={["Sd"]} />
              <LigneResultat libelle={`Plateau de calcul, q = ${formatNombre(a.q.transversal)}`} symbole="S_{d,y}" valeur={f(a.plateaux.SdTrans)} unite="m/s²" refs={["Sd"]} />
              <LigneResultat libelle="Plancher du spectre de calcul" symbole="\beta\,a_g" valeur={f(a.beta * a.ag)} unite="m/s²" refs={["beta"]} />
              <LigneResultat libelle="Plateau vertical" symbole="S_{ve}" valeur={f(a.plateaux.Sve)} unite="m/s²" refs={["Sve"]} />
              <LigneResultat libelle="Déplacement du sol" symbole="d_g" valeur={f(a.dg * 100, 2)} unite="cm" refs={["dg"]} />
              <LigneResultat
                libelle="Méthode simplifiée (faible sismicité)"
                symbole=""
                valeur={a.faibleSismicite.applicable ? "admise" : "non admise"}
                refs={["faible_sismicite_methode_simplifiee"]}
              />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Spectres({ a, projet }: { a: ActionSismique; projet: Projet }) {
  const [vue, setVue] = useState<Vue>("horizontal");
  const { q } = a;
  const seriesH: Serie[] = [
    {
      id: "Se",
      rang: 1,
      nom:
        q.longitudinal === 1 && q.transversal === 1
          ? "Élastique et calcul, q = 1 dans les deux directions"
          : q.longitudinal === 1
            ? "Élastique et calcul longitudinal (q = 1)"
            : q.transversal === 1
              ? "Élastique et calcul transversal (q = 1)"
              : "Élastique (q = 1)",
      valeur: (T) => valeur(a.spectres.elastiqueH, T),
    },
  ];
  if (q.longitudinal !== 1) seriesH.push({ id: "SdX", rang: 2, nom: `Calcul longitudinal (q = ${formatNombre(q.longitudinal)})`, valeur: (T) => valeur(a.spectres.calculLong, T) });
  if (q.transversal !== 1 && q.transversal !== q.longitudinal) {
    seriesH.push({ id: "SdY", rang: seriesH.length === 1 ? 2 : 3, nom: `Calcul transversal (q = ${formatNombre(q.transversal)})`, valeur: (T) => valeur(a.spectres.calculTrans, T) });
  } else if (q.transversal !== 1 && q.transversal === q.longitudinal) {
    const s = seriesH[1];
    if (s) s.nom = `Calcul longitudinal et transversal (q = ${formatNombre(q.transversal)})`;
  }
  const reperesH = [
    { T: a.TB, nom: "TB" },
    { T: a.TC, nom: "TC" },
    { T: a.TD, nom: "TD" },
  ];
  const site = `zone ${projet.site.zone}, catégorie ${projet.site.categorie}, sol ${projet.site.classeSol}`;

  return (
    <div className="action-spectres">
      <Onglets<Vue>
        libelle="Spectre affiché"
        prefixe="spectre"
        actif={vue}
        onChange={setVue}
        onglets={[
          { id: "horizontal", titre: "Horizontal" },
          { id: "vertical", titre: "Vertical" },
          { id: "deplacement", titre: "Déplacement" },
        ]}
      />
      <Panneau prefixe="spectre" actif={vue} className="panneau-graphique">
        {vue === "horizontal" && (
          <GraphiqueSpectre titre={`Spectres horizontaux en accélération — ${site}`} grandeur="S" unite="m/s²" series={seriesH} reperes={reperesH} />
        )}
        {vue === "vertical" && (
          <GraphiqueSpectre
            titre={`Spectre élastique vertical Sve (q = 1) — ${site}`}
            grandeur="Sve"
            unite="m/s²"
            series={[{ id: "Sve", rang: 1, nom: "Sve", valeur: (T) => valeur(a.spectres.elastiqueV, T) }]}
            reperes={[
              { T: a.vertical.TB, nom: "TB" },
              { T: a.vertical.TC, nom: "TC" },
              { T: a.vertical.TD, nom: "TD" },
            ]}
          />
        )}
        {vue === "deplacement" && (
          <GraphiqueSpectre
            titre={`Spectre élastique en déplacement SDe — ${site}`}
            grandeur="SDe"
            unite="cm"
            decimales={2}
            series={[{ id: "SDe", rang: 1, nom: "SDe", valeur: (T) => deplacement(a.spectres.elastiqueH, T) * 100 }]}
            reperes={reperesH}
          />
        )}
      </Panneau>
    </div>
  );
}

function Validation() {
  const comparaisons = useMemo(validerActionExemple, []);
  return <TableValidation titre="Validation sur l'exemple du pont dalle" comparaisons={comparaisons} />;
}

export default function PageAction({ projet, modifier, sous }: Props) {
  const a = useMemo(() => actionSismique(projet), [projet]);
  const onglet: SousOnglet = (SOUS_ONGLETS as string[]).includes(sous ?? "") ? (sous as SousOnglet) : "parametres";
  const alerteComportement = valider(projet).some((p) => p.cible === "comportement" && p.niveau !== "info");

  return (
    <main className="page page-action">
      <header className="page-entete">
        <h1>Action sismique</h1>
        <p>
          {projet.nom} — zone {projet.site.zone}, catégorie {projet.site.categorie}, sol {projet.site.classeSol} :{" "}
          <Tex>{`a_g = ${a.ag.toFixed(3).replace(".", "{,}")}\\ \\text{m/s}^2`}</Tex>
        </p>
        {!a.soumis && <p className="statut-reglementaire non-soumis">Pont non soumis aux règles parasismiques : calcul mené à titre indicatif.</p>}
      </header>
      <Onglets<SousOnglet>
        libelle="Parties de l'action sismique"
        prefixe="action"
        actif={onglet}
        onChange={(o) => aller("action", o)}
        onglets={[
          { id: "parametres", titre: "Paramètres", marque: alerteComportement ? "alerte" : undefined },
          { id: "spectres", titre: "Spectres" },
          { id: "note", titre: "Note de calcul" },
          { id: "validation", titre: "Validation (exemple du guide)" },
        ]}
      />
      <Panneau prefixe="action" actif={onglet} className="panneau-onglet">
        {onglet === "parametres" && <Parametres a={a} projet={projet} modifier={modifier} />}
        {onglet === "spectres" && <Spectres a={a} projet={projet} />}
        {onglet === "note" && <NoteCalcul sections={a.note} prefixe="note-action" />}
        {onglet === "validation" && <Validation />}
      </Panneau>
    </main>
  );
}
