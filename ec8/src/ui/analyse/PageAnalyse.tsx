import { lazy, Suspense, useMemo, useState } from "react";
import { actionSismique } from "../../moteur/action.ts";
import { analyse, type Analyse } from "../../moteur/analyse.ts";
import { modele, type Borne, type Direction } from "../../moteur/modele.ts";
import { valeur } from "../../moteur/spectres.ts";
import { exporterEfforts, telechargerEfforts } from "../../moteur/export-efforts.ts";
import { validerAnalyseExemple } from "../../moteur/validation-exemple.ts";
import type { Projet } from "../../projet/types.ts";
import { Conseils } from "../Conseils.tsx";
import { GraphiqueSpectre, type Serie } from "../action/GraphiqueSpectre.tsx";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { TableValidation } from "../note/TableValidation.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { aller } from "../route.ts";
import { integreDansPsida, sourcesEfforts } from "../psida.ts";

const Vue3D = lazy(() => import("../projet/Vue3D.tsx"));

type SousOnglet = "synthese" | "efforts" | "vue3d" | "note" | "validation";
const SOUS_ONGLETS: SousOnglet[] = ["synthese", "efforts", "vue3d", "note", "validation"];
type DirEfforts = Direction | "z" | "combinaisons";

const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)) || 0);
const NOMS: Record<Direction, string> = { x: "Longitudinal (X)", y: "Transversal (Y)" };

function SegmentsBorne({ borne, setBorne }: { borne: Borne; setBorne: (b: Borne) => void }) {
  return (
    <div className="segments" role="group" aria-label="Propriétés des élastomères">
      {(["lbdp", "ubdp"] as const).map((b) => (
        <button key={b} type="button" aria-pressed={borne === b} onClick={() => setBorne(b)}>
          {b === "lbdp" ? "LBDP (déplacements max.)" : "UBDP (efforts max.)"}
        </button>
      ))}
    </div>
  );
}

function Synthese({ r, avecBornes, spectres }: { r: Analyse; avecBornes: boolean; spectres: { x: Serie; y: Serie } }) {
  const bornes: Borne[] = avecBornes ? ["lbdp", "ubdp"] : ["lbdp"];
  return (
    <div className="analyse-synthese">
      <div className="cartes-directions">
        {(["x", "y"] as const).map((dir) => (
          <section key={dir} className="carte-plate">
            <h2>{NOMS[dir]}</h2>
            <table className="valeurs table-resultats">
              <thead>
                <tr>
                  <th scope="col" />
                  {bornes.map((b) => (
                    <th key={b} scope="col">{avecBornes ? b.toUpperCase() : "Valeur"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row">Raideur K (MN/m)</th>{bornes.map((b) => <td key={b} className="num">{r.directions[dir][b].K === Infinity ? "rigide" : f(r.directions[dir][b].K, 2)}</td>)}</tr>
                <tr><th scope="row">Période T (s)</th>{bornes.map((b) => <td key={b} className="num"><strong>{f(r.directions[dir][b].T)}</strong></td>)}</tr>
                <tr><th scope="row">Sd(T) (m/s²)</th>{bornes.map((b) => <td key={b} className="num">{f(r.directions[dir][b].Sd)}</td>)}</tr>
                <tr><th scope="row">Effort total F (MN)</th>{bornes.map((b) => <td key={b} className="num"><strong>{f(r.directions[dir][b].F)}</strong></td>)}</tr>
                <tr><th scope="row">μd</th>{bornes.map((b) => <td key={b} className="num">{f(r.directions[dir][b].muD)}</td>)}</tr>
                <tr><th scope="row">Déplacement du tablier dE (cm)</th>{bornes.map((b) => <td key={b} className="num"><strong>{f(r.directions[dir][b].dE * 100, 2)}</strong></td>)}</tr>
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <section className="carte-plate">
        <h2>Conditions d'application de la méthode du mode fondamental</h2>
        <ul className="conditions-liste">
          {r.conditions.map((c) => (
            <li key={c.id} className={c.respectee ? "ok" : "ko"}>
              <span className="marque-condition" aria-hidden="true">{c.respectee ? "✓" : "!"}</span>
              <span>
                {c.libelle} — <strong>{c.valeur}</strong> {c.respectee ? "" : "(non respectée)"}
              </span>
              <References ids={c.references} />
              {!c.respectee && c.conseils && <Conseils items={c.conseils} />}
            </li>
          ))}
        </ul>
      </section>
      <GraphiqueSpectre
        titre="Périodes propres sur les spectres de calcul"
        grandeur="Sd"
        unite="m/s²"
        series={spectres.x.nom === spectres.y.nom ? [spectres.x] : [spectres.x, spectres.y]}
        reperes={[
          { T: r.directions.x.lbdp.T, nom: "Tx" },
          { T: r.directions.y.lbdp.T, nom: "Ty" },
        ]}
      />
    </div>
  );
}

function Efforts({ r, avecBornes }: { r: Analyse; avecBornes: boolean }) {
  const [dir, setDir] = useState<DirEfforts>("x");
  const [borne, setBorne] = useState<Borne>("ubdp");
  const b = avecBornes ? borne : "lbdp";
  return (
    <section className="carte-plate">
      <div className="raideurs-entete">
        <Onglets<DirEfforts>
          libelle="Direction"
          prefixe="efforts"
          actif={dir}
          onChange={setDir}
          onglets={[
            { id: "x", titre: "Longitudinal (X)" },
            { id: "y", titre: "Transversal (Y)" },
            { id: "z", titre: "Vertical (Z)" },
            { id: "combinaisons", titre: "Combinaisons" },
          ]}
        />
        {avecBornes && (dir === "x" || dir === "y") && <SegmentsBorne borne={borne} setBorne={setBorne} />}
      </div>
      <Panneau prefixe="efforts" actif={dir}>
        {(dir === "x" || dir === "y") && (
          <>
            <div className="defile">
              <table className="valeurs table-raideurs">
                <thead>
                  <tr>
                    <th scope="col">Appui</th>
                    <th scope="col">Part de K</th>
                    <th scope="col">Effort F (MN)</th>
                    {r.torsion.appliquee && dir === "y" && <th scope="col">dont torsion (MN)</th>}
                    <th scope="col">Déplacement tête (cm)</th>
                    <th scope="col">Distorsion appareils (cm)</th>
                  </tr>
                </thead>
                <tbody>
                  {r.directions[dir][b].appuis.map((a) => (
                    <tr key={a.id}>
                      <th scope="row">{a.id}</th>
                      <td className="num">{f(100 * a.part, 1)} %</td>
                      <td className="num"><strong>{f(a.F)}</strong></td>
                      {r.torsion.appliquee && dir === "y" && <td className="num">{f(a.torsion)}</td>}
                      <td className="num">{f(a.dTete * 100, 2)}</td>
                      <td className="num">{f(a.dAppareils * 100, 2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>Total</th>
                    <td className="num"><strong>{f(r.directions[dir][b].F)}</strong></td>
                    {r.torsion.appliquee && dir === "y" && <td />}
                    <td colSpan={2}>Tablier : {f(r.directions[dir][b].dE * 100, 2)} cm</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <References ids={["tablier_rigide", "mu_d", ...(r.torsion.appliquee && dir === "y" ? ["torsion_excentricite"] : [])]} />
            <p className="aide-bloc">Efforts transmis par le tablier ; l'inertie propre des piles s'ajoutera à l'étape 6 (vérification des piles).</p>
          </>
        )}
        {dir === "z" && (
          <>
            {r.vertical.applicable ? (
              <table className="valeurs table-raideurs">
                <thead>
                  <tr>
                    <th scope="col">Appui</th>
                    <th scope="col">b</th>
                    <th scope="col">Réaction ± R (MN)</th>
                  </tr>
                </thead>
                <tbody>
                  {r.vertical.reactions.map((x) => (
                    <tr key={x.id}>
                      <th scope="row">{x.id}</th>
                      <td className="num">{f(x.b)}</td>
                      <td className="num"><strong>{f(x.R)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="probleme niveau-alerte">{r.vertical.motif}</p>
            )}
            <p className="aide-bloc">
              a = {f(r.vertical.a)} m/s², μ = {f(r.vertical.mu)} t/m, L = {f(r.vertical.L)} m, Ψ = {f(r.vertical.psi)}. {r.vertical.applicable ? r.vertical.motif : ""}
            </p>
            <References ids={["reactions_verticales", "b_reactions_verticales"]} />
          </>
        )}
        {dir === "combinaisons" && (
          <>
            <div className="defile">
              <table className="valeurs table-raideurs">
                <thead>
                  <tr>
                    <th scope="col">Appui</th>
                    <th scope="col">Combinaison</th>
                    <th scope="col">± Fx (MN)</th>
                    <th scope="col">± Fy (MN)</th>
                    <th scope="col">± Fz (MN)</th>
                  </tr>
                </thead>
                <tbody>
                  {r.combinaisons.flatMap((c) =>
                    c.cas.map((k, i) => (
                      <tr key={`${c.id}-${i}`} className={i === 0 ? "debut-groupe" : undefined}>
                        {i === 0 && <th scope="rowgroup" rowSpan={c.cas.length}>{c.id}</th>}
                        <td>{k.nom}</td>
                        <td className="num">{f(k.Fx)}</td>
                        <td className="num">{f(k.Fy)}</td>
                        <td className="num">{f(k.Fz)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <p className="aide-bloc">Règle 100 % / 30 % / 30 %, signes les plus défavorables ; efforts horizontaux en UBDP.</p>
            <References ids={["combinaison_100_30_30"]} />
          </>
        )}
      </Panneau>
    </section>
  );
}

function Vue({ projet, r, avecBornes }: { projet: Projet; r: Analyse; avecBornes: boolean }) {
  const [dir, setDir] = useState<"x" | "y" | "z">("x");
  const [borne, setBorne] = useState<Borne>("lbdp");
  const [appui, setAppui] = useState<string | null>(null);
  const b = avecBornes ? borne : "lbdp";
  const d = dir === "z" ? 0 : r.directions[dir][b].dE;
  const auto = d > 0 ? Math.max(1, Math.min(200, Math.round(1.5 / d))) : 1;
  const [ampli, setAmpli] = useState<number | null>(null);
  const amplification = ampli ?? auto;
  const efforts =
    dir === "z"
      ? r.vertical.reactions.map((x, i) => ({ id: x.id, x: r.directions.x.lbdp.appuis[i]?.x ?? 0, F: x.R }))
      : r.directions[dir][b].appuis.map((a) => ({ id: a.id, x: a.x, F: a.F }));
  return (
    <section className="carte-plate analyse-vue3d">
      <div className="raideurs-entete">
        <Onglets<"x" | "y" | "z">
          libelle="Direction affichée"
          prefixe="vue-analyse"
          actif={dir}
          onChange={(x) => {
            setDir(x);
            setAmpli(null);
          }}
          onglets={[
            { id: "x", titre: "Longitudinal (X)" },
            { id: "y", titre: "Transversal (Y)" },
            { id: "z", titre: "Vertical (Z)" },
          ]}
        />
        {avecBornes && dir !== "z" && (
          <SegmentsBorne
            borne={borne}
            setBorne={(x) => {
              setBorne(x);
              setAmpli(null);
            }}
          />
        )}
      </div>
      {dir !== "z" && (
        <label className="amplification">
          Amplification du déplacement : <strong>× {amplification}</strong> (tablier déplacé de {f(d * 100, 2)} cm)
          <input type="range" min={1} max={200} value={amplification} onChange={(e) => setAmpli(Number(e.target.value))} />
        </label>
      )}
      <div className="cadre-vue3d">
        <Suspense fallback={<div className="vue3d chargement">Chargement de la vue 3D…</div>}>
          <Vue3D projet={projet} appuiActif={appui} onSelectAppui={setAppui} resultats={{ direction: dir, amplification, deplacementTablier: d, efforts }} />
        </Suspense>
      </div>
      <p className="aide-bloc">
        Flèches : efforts transmis par le tablier à chaque appui{dir === "z" ? " (réactions verticales ±)" : ""}. Le tablier en fil de fer marque la position
        initiale.
      </p>
    </section>
  );
}

export default function PageAnalyse({ projet, sous }: { projet: Projet; sous: string | null }) {
  const a = useMemo(() => actionSismique(projet), [projet]);
  const m = useMemo(() => modele(projet), [projet]);
  const r = useMemo(() => analyse(projet, a, m), [projet, a, m]);
  const comparaisons = useMemo(validerAnalyseExemple, []);
  const avecBornes = m.elastomeres !== null;
  const onglet: SousOnglet = (SOUS_ONGLETS as string[]).includes(sous ?? "") ? (sous as SousOnglet) : "synthese";
  const spectres = {
    x: { id: "Sdx", rang: 1 as const, nom: `Spectre de calcul X (q = ${formatNombre(a.q.longitudinal)})`, valeur: (T: number) => valeur(a.spectres.calculLong, T) },
    y: { id: "Sdy", rang: 2 as const, nom: `Spectre de calcul Y (q = ${formatNombre(a.q.transversal)})`, valeur: (T: number) => valeur(a.spectres.calculTrans, T) },
  };
  if (a.q.longitudinal === a.q.transversal) spectres.y.nom = spectres.x.nom;
  const alerte = r.conditions.some((c) => !c.respectee) || !r.vertical.applicable;
  return (
    <main className="page page-action">
      <header className="page-entete">
        <h1>Analyse : méthode du mode fondamental</h1>
        <p>
          {projet.nom} — Tx = {f(r.directions.x.lbdp.T)} s, Ty = {f(r.directions.y.lbdp.T)} s ; Fx = {f(r.directions.x.ubdp.F)} MN, Fy = {f(r.directions.y.ubdp.F)} MN
        </p>
        <p>
          <button type="button" className="bouton-secondaire" onClick={() => { try { const { methode, sources } = sourcesEfforts(projet, a, m, r); telechargerEfforts(exporterEfforts(projet, a, r, sources, methode)); } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); } }}>
            Exporter les efforts par appui (PSIDA, méthode choisie dans l'onglet Méthodes)
          </button>{" "}
          {integreDansPsida()
            ? "Dans PSIDA, ces efforts sont transmis automatiquement : bouton « Utiliser ces efforts dans Appuis et fondations » au-dessus."
            : "Fichier JSON à importer dans la carte « Appuis et fondations » de PSIDA (combinaison sismique des fûts et fondations)."}
        </p>
      </header>
      <Onglets<SousOnglet>
        libelle="Parties de l'analyse"
        prefixe="analyse"
        actif={onglet}
        onChange={(o) => aller("analyse", o)}
        onglets={[
          { id: "synthese", titre: "Synthèse", marque: alerte ? "alerte" : undefined },
          { id: "efforts", titre: "Efforts par appui" },
          { id: "vue3d", titre: "Vue 3D" },
          { id: "note", titre: "Note de calcul" },
          { id: "validation", titre: "Validation (exemple du guide)" },
        ]}
      />
      <Panneau prefixe="analyse" actif={onglet} className="panneau-onglet">
        {onglet === "synthese" && <Synthese r={r} avecBornes={avecBornes} spectres={spectres} />}
        {onglet === "efforts" && <Efforts r={r} avecBornes={avecBornes} />}
        {onglet === "vue3d" && <Vue projet={projet} r={r} avecBornes={avecBornes} />}
        {onglet === "note" && <NoteCalcul sections={r.note} prefixe="note-analyse" />}
        {onglet === "validation" && <TableValidation titre="Validation sur l'exemple du pont dalle" comparaisons={comparaisons} />}
      </Panneau>
    </main>
  );
}
