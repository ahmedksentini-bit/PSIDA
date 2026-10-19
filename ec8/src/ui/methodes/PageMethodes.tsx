import { useMemo, useState } from "react";
import { actionSismique } from "../../moteur/action.ts";
import { analyse, type Analyse } from "../../moteur/analyse.ts";
import { modele, type Borne } from "../../moteur/modele.ts";
import { multimodale, type DirectionMM, type Multimodale, type ReponseDirectionMM } from "../../moteur/multimodal.ts";
import type { Projet } from "../../projet/types.ts";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { aller, lien } from "../route.ts";
import { AnimationMode } from "./AnimationMode.tsx";
import { SchemaChoix } from "./SchemaChoix.tsx";
import { PageTemporel } from "./PageTemporel.tsx";
import { PagePushover } from "./PagePushover.tsx";
import { PageTemporelNL } from "./PageTemporelNL.tsx";
import { PageIsolation } from "./PageIsolation.tsx";

type SousOnglet = "choix" | "multimodale" | "temporel" | "pushover" | "nonlineaire" | "isolation";
const SOUS: SousOnglet[] = ["choix", "multimodale", "temporel", "pushover", "nonlineaire", "isolation"];
type Vue = "synthese" | "modes" | "efforts" | "comparaison" | "note";

const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)) || 0);
const NOMS: Record<DirectionMM, string> = { x: "Longitudinal (X)", y: "Transversal (Y)", z: "Vertical (Z)" };

interface Methode {
  id: string;
  nom: string;
  clause: string;
  quand: string;
  donne: string;
  dispo: "oui" | "a_venir";
  lien?: string;
}

const METHODES: Methode[] = [
  {
    id: "mode_fondamental",
    nom: "Mode fondamental (« statique équivalente »)",
    clause: "EN 1998-2 4.2.2",
    quand: "Pont régulier : tablier continu à peu près rectiligne, masse des piles < 20 % du tablier (longitudinal), excentricité ≤ 5 % de L (transversal). Cas de la plupart des ponts-dalles courants.",
    donne: "Une période par direction, l'effort total F = M·Sd(T) réparti au prorata des raideurs, les déplacements dE = η μd dEe.",
    dispo: "oui",
    lien: lien("analyse"),
  },
  {
    id: "multimodale",
    nom: "Analyse spectrale multimodale",
    clause: "EN 1998-2 4.2.1",
    quand: "Méthode de référence, toujours admise en linéaire. Obligatoire hors du domaine du mode fondamental : piles lourdes ou de hauteurs très inégales, tablier souple en plan (L/B > 4), excentricités, biais ou courbure marqués.",
    donne: "Les modes propres, leurs masses effectives (≥ 90 %), la combinaison SRSS ou CQC des réponses modales ; efforts en tête et en pied d'appui.",
    dispo: "oui",
    lien: lien("methodes", "multimodale"),
  },
  {
    id: "temporel_lineaire",
    nom: "Calcul temporel linéaire",
    clause: "EN 1998-2 4.2.3 ; EN 1998-1 3.2.3",
    quand: "Alternative à la méthode spectrale, surtout pour comprendre la réponse dans le temps, ou quand des accélérogrammes de site sont imposés.",
    donne: "Moyenne des réponses extrêmes d'un jeu d'accélérogrammes compatibles avec le spectre (au moins 3 ; PSIDA en génère 7).",
    dispo: "oui",
    lien: lien("methodes", "temporel"),
  },
  {
    id: "pushover",
    nom: "Analyse statique non linéaire (poussée progressive)",
    clause: "EN 1998-2 4.2.5 et annexe H",
    quand: "Pont ductile (q > 1,5) : vérifier la formation des rotules plastiques et les demandes en rotation ; réponse assimilable à un système à un degré de liberté.",
    donne: "La courbe de capacité, le déplacement cible, la séquence des rotules et leurs rotations.",
    dispo: "oui",
    lien: lien("methodes", "pushover"),
  },
  {
    id: "temporel_non_lineaire",
    nom: "Calcul temporel non linéaire",
    clause: "EN 1998-2 4.2.4",
    quand: "En complément d'une analyse spectrale (sauf ponts isolés ou irréguliers) : ductilité locale, ponts irréguliers, ouvrages importants.",
    donne: "Les demandes en rotation plastique et en déplacement au cours du temps ; moyenne sur au moins 7 paires d'accélérogrammes.",
    dispo: "oui",
    lien: lien("methodes", "nonlineaire"),
  },
  {
    id: "isolation",
    nom: "Ponts isolés (isolateurs sismiques)",
    clause: "EN 1998-2 chapitre 7",
    quand: "Appareils spéciaux (élastomère fretté à fort amortissement, appareils à noyau de plomb, pendules à friction) qui allongent la période et dissipent l'énergie.",
    donne: "Raideur et amortissement effectifs itérés ; mode fondamental (7.5.4), multimodale (7.5.5) ou temporel (7.5.6).",
    dispo: "oui",
    lien: lien("methodes", "isolation"),
  },
];

/** Recommandation pour le projet courant, d'après les conditions du mode fondamental et les coefficients q. */
function recommandation(r: Analyse, p: Projet): { texte: string; niveau: "ok" | "alerte" } {
  const ko = r.conditions.filter((c) => !c.respectee && c.id !== "excentricite");
  const q = Math.max(p.comportement.qLongitudinal, p.comportement.qTransversal);
  const ductile = q > 1.5;
  if (ko.length) {
    return {
      niveau: "alerte",
      texte: `Conditions du mode fondamental non respectées (${ko.map((c) => c.libelle.toLowerCase()).join(" ; ")}) : retenir l'analyse multimodale.${ductile ? " Comportement ductile (q > 1,5) : une poussée progressive vérifierait la ductilité des piles." : ""}`,
    };
  }
  return {
    niveau: "ok",
    texte: `Conditions du mode fondamental respectées : la méthode du mode fondamental suffit${r.torsion.appliquee ? " (avec la torsion d'excentricité)" : ""}. L'analyse multimodale sert ici de contrôle.${ductile ? " Comportement ductile (q > 1,5) : une poussée progressive vérifierait la ductilité des piles." : " Comportement à ductilité limitée (q ≤ 1,5) : les méthodes non linéaires n'apportent rien de réglementaire."}`,
  };
}

function Choix({ r, projet }: { r: Analyse; projet: Projet }) {
  const rec = recommandation(r, projet);
  return (
    <div className="analyse-synthese">
      <section className="carte-plate">
        <h2>Pour ce projet</h2>
        <p className={`probleme niveau-${rec.niveau === "ok" ? "info" : "alerte"}`}>{rec.texte}</p>
        <ul className="conditions-liste">
          {r.conditions.map((c) => (
            <li key={c.id} className={c.respectee ? "ok" : "ko"}>
              <span className="marque-condition" aria-hidden="true">{c.respectee ? "✓" : "!"}</span>
              <span>{c.libelle} — <strong>{c.valeur}</strong></span>
            </li>
          ))}
        </ul>
        <References ids={["conditions_monomodal", "analyse_spectrale"]} />
      </section>
      <section className="carte-plate">
        <h2>Quelle méthode, quand ?</h2>
        <SchemaChoix />
      </section>
      <section className="carte-plate">
        <h2>Les méthodes de l'EN 1998-2</h2>
        <div className="defile">
          <table className="valeurs table-raideurs mm-methodes">
            <thead>
              <tr>
                <th scope="col">Méthode</th>
                <th scope="col">Quand l'utiliser</th>
                <th scope="col">Ce qu'elle donne</th>
                <th scope="col">Dans l'outil</th>
              </tr>
            </thead>
            <tbody>
              {METHODES.map((m) => (
                <tr key={m.id}>
                  <th scope="row">
                    {m.nom}
                    <br />
                    <span className="ecart-relatif">{m.clause}</span>
                  </th>
                  <td>{m.quand}</td>
                  <td>{m.donne}</td>
                  <td>{m.dispo === "oui" ? (m.lien ? <a href={m.lien}>Ouvrir</a> : "oui") : <span className="ecart-relatif">prochaine version</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aide-bloc">
          Les méthodes linéaires (mode fondamental, multimodale, temporel linéaire) utilisent le spectre de calcul réduit par q. Les méthodes non linéaires modélisent
          directement la plastification, sans q ; l'EN 1998-2 4.2.4.1(2)P ne les admet qu'en complément d'une analyse spectrale, sauf pour les ponts isolés ou
          irréguliers.
        </p>
      </section>
    </div>
  );
}

function SelecteurBorne({ borne, setBorne }: { borne: Borne; setBorne: (b: Borne) => void }) {
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

const rep = (mm: Multimodale, d: DirectionMM, b: Borne): ReponseDirectionMM => (d === "z" ? mm.directions.z : mm.directions[d][b]);

function SyntheseMM({ mm, projet, modifier }: { mm: Multimodale; projet: Projet; modifier: (f: (p: Projet) => void) => void }) {
  const choix = projet.options.methodeEfforts ?? "mode_fondamental";
  return (
    <div className="analyse-synthese">
      <div className="cartes-directions mm-cartes">
        {(["x", "y", "z"] as const).map((d) => {
          const l = rep(mm, d, "lbdp"), u = rep(mm, d, "ubdp");
          const c = d === "z" ? null : mm.comparaison.find((k) => k.direction === d);
          return (
            <section key={d} className="carte-plate">
              <h2>{NOMS[d]}</h2>
              <table className="valeurs table-resultats">
                <tbody>
                  <tr><th scope="row">Degrés de liberté</th><td className="num">{l.modele.n}</td></tr>
                  <tr><th scope="row">Masse mobilisable (t)</th><td className="num">{f(l.modele.masse, 1)}</td></tr>
                  <tr><th scope="row">Période du 1er mode (s)</th><td className="num"><strong>{f(l.modes[0]?.T ?? 0)}</strong></td></tr>
                  <tr><th scope="row">Modes retenus</th><td className="num">{l.retenus} ({f(100 * l.partRetenue, 1)} %)</td></tr>
                  <tr><th scope="row">Combinaison</th><td className="num">{l.regle}</td></tr>
                  {c && (
                    <>
                      <tr><th scope="row">Effort du tablier F UBDP (MN)</th><td className="num"><strong>{f(u.Ftablier)}</strong></td></tr>
                      <tr><th scope="row">Effort à la base, fûts compris (MN)</th><td className="num">{f(u.Ftotal)}</td></tr>
                      <tr><th scope="row">Mode fondamental : T ; F</th><td className="num">{f(c.Tmono)} s ; {f(c.Fmono)} MN</td></tr>
                      <tr><th scope="row">Écart sur F</th><td className="num">{f(100 * (c.Fmulti / c.Fmono - 1), 1)} %</td></tr>
                    </>
                  )}
                  {d === "z" && (
                    <tr><th scope="row">Réactions ± (MN)</th><td>{l.appuis.map((x) => `${x.id} : ${f(x.F)}`).join(" ; ")}</td></tr>
                  )}
                </tbody>
              </table>
              {l.alertes.map((x, i) => (
                <p key={i} className="aide-bloc">{x}</p>
              ))}
            </section>
          );
        })}
      </div>
      <section className="carte-plate">
        <h2>Efforts transmis à PSIDA</h2>
        <div className="segments" role="group" aria-label="Méthode des efforts exportés">
          {(["mode_fondamental", "multimodale"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={choix === m} onClick={() => modifier((p) => { p.options.methodeEfforts = m; })}>
              {m === "mode_fondamental" ? "Mode fondamental" : "Multimodale"}
            </button>
          ))}
        </div>
        <p className="aide-bloc">
          Méthode dont les efforts par appui (combinaisons 100/30/30, UBDP) partent vers « Appuis et fondations » de PSIDA et dans le fichier exporté. Le mode
          fondamental reste la valeur par défaut, comme dans le guide Cerema.
        </p>
      </section>
      <References ids={["analyse_spectrale", "modes_significatifs", "combinaison_modale", "modele_dynamique"]} />
    </div>
  );
}

function Modes({ mm, projet }: { mm: Multimodale; projet: Projet }) {
  const [d, setD] = useState<DirectionMM>("x");
  const [borne, setBorne] = useState<Borne>("lbdp");
  const r = rep(mm, d, borne);
  const visibles = r.modes.filter((x, i) => i < 3 || x.part >= 0.005).slice(0, 12);
  const [num, setNum] = useState(1);
  const mode = r.modes.find((x) => x.numero === num) ?? r.modes[0]!;
  const hauteurs = Object.fromEntries(projet.appuis.map((a) => [a.id, a.type === "pile" ? a.futs.hauteur : a.poteaux.hauteur]));
  return (
    <section className="carte-plate">
      <div className="raideurs-entete">
        <Onglets<DirectionMM>
          libelle="Direction"
          prefixe="mm-modes"
          actif={d}
          onChange={(x) => {
            setD(x);
            setNum(1);
          }}
          onglets={(["x", "y", "z"] as const).map((x) => ({ id: x, titre: NOMS[x] }))}
        />
        {d !== "z" && <SelecteurBorne borne={borne} setBorne={setBorne} />}
      </div>
      <Panneau prefixe="mm-modes" actif={d}>
        <div className="segments mm-liste-modes" role="group" aria-label="Mode affiché">
          {visibles.map((x) => (
            <button key={x.numero} type="button" aria-pressed={x.numero === mode.numero} onClick={() => setNum(x.numero)}>
              {x.numero} · {f(x.T)} s · {f(100 * x.part, 1)} %
            </button>
          ))}
        </div>
        <AnimationMode rep={r} mode={mode} largeur={projet.tablier.largeur} hauteurs={hauteurs} />
        <div className="defile">
          <table className="valeurs table-raideurs">
            <thead>
              <tr>
                <th scope="col">Mode</th>
                <th scope="col">T (s)</th>
                <th scope="col">Sd(T) (m/s²)</th>
                <th scope="col">Γ (t^½)</th>
                <th scope="col">Masse effective</th>
                <th scope="col">Cumul</th>
                <th scope="col">Retenu</th>
              </tr>
            </thead>
            <tbody>
              {r.modes.filter((x) => x.retenu || x.numero <= 12).map((x) => (
                <tr key={x.numero} className={x.numero === mode.numero ? "mm-actif" : undefined}>
                  <th scope="row">
                    <button type="button" className="bouton-lien" onClick={() => setNum(x.numero)}>{x.numero}</button>
                  </th>
                  <td className="num">{f(x.T)}</td>
                  <td className="num">{f(x.Sd)}</td>
                  <td className="num">{f(x.gamma, 2)}</td>
                  <td className="num">
                    <span className="barre-part" style={{ width: `${Math.max(1, 80 * x.part)}px` }} />
                    {f(100 * x.part, 1)} % ({f(x.masseEffective, 1)} t)
                  </td>
                  <td className="num">{f(100 * x.cumul, 1)} %</td>
                  <td>{x.retenu ? "✓" : ""}{x.T < 0.033 ? " (rigide)" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aide-bloc">
          {r.retenus} mode(s) retenu(s) : {f(100 * r.partRetenue, 1)} % de la masse ({f(100 * r.partSouples, 1)} % par les modes de période ≥ 0,033 s). Combinaison {r.regle}
          {r.voisins.length ? ` (périodes voisines : modes ${r.voisins.map(([i, j]) => `${i}-${j}`).join(", ")})` : " (périodes bien séparées)"}.
        </p>
        <References ids={["modes_significatifs", "combinaison_modale"]} />
      </Panneau>
    </section>
  );
}

function EffortsMM({ mm }: { mm: Multimodale }) {
  const [d, setD] = useState<DirectionMM | "combinaisons">("x");
  const [borne, setBorne] = useState<Borne>("ubdp");
  return (
    <section className="carte-plate">
      <div className="raideurs-entete">
        <Onglets<DirectionMM | "combinaisons">
          libelle="Direction"
          prefixe="mm-efforts"
          actif={d}
          onChange={setD}
          onglets={[...(["x", "y", "z"] as const).map((x) => ({ id: x, titre: NOMS[x] })), { id: "combinaisons" as const, titre: "Combinaisons" }]}
        />
        {(d === "x" || d === "y") && <SelecteurBorne borne={borne} setBorne={setBorne} />}
      </div>
      <Panneau prefixe="mm-efforts" actif={d}>
        {d !== "combinaisons" ? (
          <div className="defile">
            <table className="valeurs table-raideurs">
              <thead>
                <tr>
                  <th scope="col">Appui</th>
                  <th scope="col">{d === "z" ? "Réaction ± (MN)" : "Effort en tête F (MN)"}</th>
                  {d !== "z" && (
                    <>
                      <th scope="col">Déplacement tablier (cm)</th>
                      <th scope="col">Distorsion appareils (cm)</th>
                      <th scope="col">Pied de pile V (MN)</th>
                      <th scope="col">Pied de pile M (MN·m)</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rep(mm, d, borne).appuis.map((x) => (
                  <tr key={x.id}>
                    <th scope="row">{x.id}</th>
                    <td className="num"><strong>{f(x.F)}</strong></td>
                    {d !== "z" && (
                      <>
                        <td className="num">{f(x.dTablier * 100, 2)}</td>
                        <td className="num">{f(x.dAppareils * 100, 2)}</td>
                        <td className="num">{x.Vpied === undefined ? "—" : f(x.Vpied)}</td>
                        <td className="num">{x.Mpied === undefined ? "—" : f(x.Mpied)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
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
                {mm.combinaisons.flatMap((c) =>
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
        )}
        <p className="aide-bloc">
          Chaque grandeur est combinée sur les modes retenus (SRSS ou CQC), puis prise avec les deux signes : on ne peut pas additionner des grandeurs déjà combinées.
          Déplacements multipliés par η·μd (EN 1998-2 2.3.6.3) avec la période du mode dominant ; en Z, spectre élastique vertical (q = 1).
        </p>
        <References ids={["combinaison_modale", "mu_d", "combinaison_100_30_30"]} />
      </Panneau>
    </section>
  );
}

function Comparaison({ mm }: { mm: Multimodale }) {
  return (
    <section className="carte-plate">
      <h2>Mode fondamental et multimodale, appui par appui (UBDP)</h2>
      <div className="defile">
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Direction</th>
              <th scope="col">Appui</th>
              <th scope="col">Mode fondamental (MN)</th>
              <th scope="col">Multimodale (MN)</th>
              <th scope="col">Écart</th>
            </tr>
          </thead>
          <tbody>
            {mm.comparaison.flatMap((c) =>
              [{ id: "Total", Fmono: c.Fmono, Fmulti: c.Fmulti }, ...c.appuis].map((x, i) => (
                <tr key={`${c.direction}-${x.id}`} className={i === 0 ? "debut-groupe" : undefined}>
                  {i === 0 && <th scope="rowgroup" rowSpan={c.appuis.length + 1}>{NOMS[c.direction]}<br /><span className="ecart-relatif">T : {f(c.Tmono)} / {f(c.T1)} s</span></th>}
                  <td>{x.id === "Total" ? <strong>Total</strong> : x.id}</td>
                  <td className="num">{f(x.Fmono)}</td>
                  <td className="num">{f(x.Fmulti)}</td>
                  <td className="num">{x.Fmono > 1e-6 ? `${f(100 * (x.Fmulti / x.Fmono - 1), 1)} %` : "—"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className="aide-bloc">
        « Total » : effort transmis par le tablier à l'ensemble des appuis (le mode fondamental ne compte pas l'inertie propre des fûts). Écarts faibles : le pont est régulier, le mode fondamental mobilise presque toute la masse et la méthode simplifiée suffit. Des écarts de plus de 10 à
        15 % signalent un pont hors du domaine du mode fondamental (piles lourdes ou très inégales, tablier souple en plan).
      </p>
    </section>
  );
}

function PageMultimodale({ projet, mm, modifier }: { projet: Projet; mm: Multimodale; modifier: (f: (p: Projet) => void) => void }) {
  const [vue, setVue] = useState<Vue>("synthese");
  return (
    <>
      <Onglets<Vue>
        libelle="Parties de l'analyse multimodale"
        prefixe="mm"
        actif={vue}
        onChange={setVue}
        onglets={[
          { id: "synthese", titre: "Synthèse" },
          { id: "modes", titre: "Modes propres" },
          { id: "efforts", titre: "Efforts par appui" },
          { id: "comparaison", titre: "Comparaison" },
          { id: "note", titre: "Note de calcul" },
        ]}
      />
      <Panneau prefixe="mm" actif={vue} className="panneau-onglet">
        {vue === "synthese" && <SyntheseMM mm={mm} projet={projet} modifier={modifier} />}
        {vue === "modes" && <Modes mm={mm} projet={projet} />}
        {vue === "efforts" && <EffortsMM mm={mm} />}
        {vue === "comparaison" && <Comparaison mm={mm} />}
        {vue === "note" && <NoteCalcul sections={mm.note} prefixe="note-mm" />}
      </Panneau>
    </>
  );
}

export default function PageMethodes({ projet, sous, modifier }: { projet: Projet; sous: string | null; modifier: (f: (p: Projet) => void) => void }) {
  const a = useMemo(() => actionSismique(projet), [projet]);
  const m = useMemo(() => modele(projet), [projet]);
  const r = useMemo(() => analyse(projet, a, m), [projet, a, m]);
  const onglet: SousOnglet = (SOUS as string[]).includes(sous ?? "") ? (sous as SousOnglet) : "choix";
  const mm = useMemo(() => {
    if (onglet !== "multimodale") return null;
    try {
      return multimodale(projet, a, m, r);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [onglet, projet, a, m, r]);
  return (
    <main className="page page-action">
      <header className="page-entete">
        <h1>Méthodes d'analyse</h1>
        <p>Choisir la méthode selon le pont, puis la comparer au mode fondamental.</p>
      </header>
      <Onglets<SousOnglet>
        libelle="Méthodes"
        prefixe="methodes"
        actif={onglet}
        onChange={(o) => aller("methodes", o)}
        onglets={[
          { id: "choix", titre: "Choisir la méthode" },
          { id: "multimodale", titre: "Analyse multimodale" },
          { id: "temporel", titre: "Temporel linéaire" },
          { id: "pushover", titre: "Poussée progressive" },
          { id: "nonlineaire", titre: "Temporel non linéaire" },
          { id: "isolation", titre: "Pont isolé" },
        ]}
      />
      <Panneau prefixe="methodes" actif={onglet} className="panneau-onglet">
        {onglet === "choix" && <Choix r={r} projet={projet} />}
        {onglet === "temporel" && <PageTemporel projet={projet} a={a} m={m} r={r} />}
        {onglet === "pushover" && <PagePushover projet={projet} a={a} modifier={modifier} />}
        {onglet === "nonlineaire" && <PageTemporelNL projet={projet} a={a} />}
        {onglet === "isolation" && <PageIsolation projet={projet} a={a} r={r} modifier={modifier} />}
        {onglet === "multimodale" && (typeof mm === "string" ? <p className="probleme niveau-alerte">Analyse multimodale impossible : {mm}</p> : mm && <PageMultimodale projet={projet} mm={mm} modifier={modifier} />)}
      </Panneau>
    </main>
  );
}
