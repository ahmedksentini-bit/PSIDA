import { useMemo, useState } from "react";
import { actionSismique } from "../../moteur/action.ts";
import { analyse } from "../../moteur/analyse.ts";
import { modele } from "../../moteur/modele.ts";
import { validerAppuisExemple } from "../../moteur/validation-exemple.ts";
import { verifierAppuis, type Critere, type Etat, type VerifAppuis } from "../../moteur/verif-appuis.ts";
import type { Projet } from "../../projet/types.ts";
import { Conseils } from "../Conseils.tsx";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { TableValidation } from "../note/TableValidation.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { ChampCase, ChampNombre, Grille } from "../projet/champs.tsx";
import type { Modifier } from "../projet/Saisie.tsx";
import { aller } from "../route.ts";

type SousOnglet = "synthese" | "donnees" | "appareils" | "repos" | "note" | "validation";
const SOUS_ONGLETS: SousOnglet[] = ["synthese", "donnees", "appareils", "repos", "note", "validation"];

const f = (v: number, d = 3) => (Number.isFinite(v) ? formatNombre(Number(v.toFixed(d)) || 0) : "—");
const LIBELLE_ETAT: Record<Etat, string> = { ok: "✓ vérifié", non_verifie: "✗ non vérifié", info: "ℹ à traiter" };
const CLASSE_ETAT: Record<Etat, string> = { ok: "statut-verifie", non_verifie: "statut-a_verifier etat-ko", info: "statut-via_guide" };

function BadgeEtat({ etat }: { etat: Etat }) {
  return <span className={`badge ${CLASSE_ETAT[etat]}`}>{LIBELLE_ETAT[etat]}</span>;
}

function TableCriteres({ criteres }: { criteres: Critere[] }) {
  return (
    <div className="defile">
      <table className="valeurs table-criteres">
        <thead>
          <tr>
            <th scope="col">Appui</th>
            <th scope="col">Critère</th>
            <th scope="col">Valeur</th>
            <th scope="col">Limite</th>
            <th scope="col">Taux</th>
            <th scope="col">État</th>
          </tr>
        </thead>
        <tbody>
          {criteres.map((c) => {
            const taux = c.limite && c.limite > 0 ? c.valeur / c.limite : null;
            return (
              <tr key={c.id}>
                <th scope="row">{c.appui}</th>
                <td>
                  {c.libelle}
                  {c.commentaire && <small className="remarque-validation">{c.commentaire}</small>}
                  <References ids={c.references} />
                  {c.etat === "non_verifie" && c.conseils && <Conseils items={c.conseils} />}
                </td>
                <td className="num">
                  {f(c.valeur)} {c.unite}
                </td>
                <td className="num">{c.limite === null ? "—" : `${f(c.limite)} ${c.unite}`}</td>
                <td className="num">
                  {taux === null ? "—" : (
                    <>
                      <span className={`jauge ${taux > 1 ? "depasse" : ""}`} style={{ width: `${Math.min(60, Math.round(taux * 50))}px` }} />
                      {formatNombre(Math.round(taux * 100))} %
                    </>
                  )}
                </td>
                <td>
                  <BadgeEtat etat={c.etat} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Synthese({ v }: { v: VerifAppuis }) {
  const [filtre, setFiltre] = useState<Etat | "tous">("tous");
  const compte = (e: Etat) => v.criteres.filter((c) => c.etat === e).length;
  return (
    <section className="carte-plate">
      <h2>Synthèse des vérifications (étape 6a)</h2>
      <div className="compteurs" role="group" aria-label="Filtrer par état">
        {(["tous", "non_verifie", "info", "ok"] as const).map((e) => (
          <button key={e} type="button" className={`compteur ${e === "non_verifie" ? "statut-a_verifier" : e === "ok" ? "statut-verifie" : e === "info" ? "statut-via_guide" : ""}`} aria-pressed={filtre === e} onClick={() => setFiltre(e)}>
            <span className="compteur-n">{e === "tous" ? v.criteres.length : compte(e)}</span>
            <span>{e === "tous" ? "Tous" : LIBELLE_ETAT[e].slice(2)}</span>
          </button>
        ))}
      </div>
      <TableCriteres criteres={filtre === "tous" ? v.criteres : v.criteres.filter((c) => c.etat === filtre)} />
      <p className="aide-bloc">Piles (étape 6b), culées et fondations (étape 6c) viendront compléter cette synthèse.</p>
    </section>
  );
}

function Donnees({ projet, modifier, v }: { projet: Projet; modifier: Modifier; v: VerifAppuis }) {
  const { service, elastomeres } = projet;
  return (
    <div className="action-parametres">
      <section className="carte-plate">
        <h2>Déformations de service et appareils</h2>
        <Grille>
          <ChampNombre libelle="Retrait + fluage εdiff" unite="‰" refId="deplacements_service" valeur={service.retraitFluage * 1000} min={0} onChange={(x) => modifier((p) => void (p.service.retraitFluage = x / 1000))} />
          <ChampNombre libelle="ΔT pour les appareils" unite="°C" refId="deplacements_service" valeur={service.deltaT} min={0} onChange={(x) => modifier((p) => void (p.service.deltaT = x))} />
          <ChampNombre libelle="Coefficient α" unite="10⁻⁵/°C" valeur={service.alpha * 1e5} min={0} onChange={(x) => modifier((p) => void (p.service.alpha = x / 1e5))} />
          <ChampNombre libelle="γIS" refId="gamma_IS" valeur={elastomeres.gammaIS} min={1} onChange={(x) => modifier((p) => void (p.elastomeres.gammaIS = x))} />
          <ChampNombre libelle="Kf (frottement)" refId="elastomere_glissement" valeur={elastomeres.Kf} min={0} onChange={(x) => modifier((p) => void (p.elastomeres.Kf = x))} />
        </Grille>
        <p className="aide-bloc">Exemple du guide : εdiff = 0,49 ‰, ΔT = 42 °C, α = 10⁻⁵/°C, γIS = 1,5, Kf = 0,6 (béton).</p>
      </section>
      <section className="carte-plate">
        <h2>Charges permanentes par appui (calcul de service ELS QP)</h2>
        <p className="aide-bloc">
          Réactions maximale et minimale (G + effets différés ± 0,5 T) et rotation maximale. Sans saisie, le moteur estime les réactions par une poutre continue et
          prend une rotation nulle.
          <References ids={["reactions_permanentes"]} />
        </p>
        {projet.appuis.map((ap, i) => {
          const cp = ap.chargesPermanentes;
          const est = v.appareils[i]?.permanentes;
          return (
            <div key={ap.id} className="bloc-appui-donnees">
              <ChampCase
                libelle={`${ap.id} : valeurs issues d'un calcul de service`}
                valeur={cp !== undefined}
                onChange={(x) =>
                  modifier((p) => {
                    const a = p.appuis[i];
                    if (!a) return;
                    if (x) a.chargesPermanentes = { Nmax: est?.Nmax ?? 1, Nmin: est?.Nmin ?? 1, rotation: est?.rotation ?? 0 };
                    else delete a.chargesPermanentes;
                  })
                }
              />
              {cp ? (
                <Grille>
                  <ChampNombre libelle="Nmax" unite="MN" valeur={cp.Nmax} onChange={(x) => modifier((p) => void (p.appuis[i]?.chargesPermanentes && (p.appuis[i]!.chargesPermanentes!.Nmax = x)))} />
                  <ChampNombre libelle="Nmin" unite="MN" valeur={cp.Nmin} onChange={(x) => modifier((p) => void (p.appuis[i]?.chargesPermanentes && (p.appuis[i]!.chargesPermanentes!.Nmin = x)))} />
                  <ChampNombre libelle="Rotation" unite="10⁻³ rad" valeur={cp.rotation * 1000} onChange={(x) => modifier((p) => void (p.appuis[i]?.chargesPermanentes && (p.appuis[i]!.chargesPermanentes!.rotation = x / 1000)))} />
                </Grille>
              ) : (
                <p className="aide-bloc">Estimation (poutre continue) : N = {f(est?.Nmax ?? NaN)} MN, rotation 0.</p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Appareils({ v }: { v: VerifAppuis }) {
  const avec = v.appareils.filter((a) => a.elastomere);
  const [actif, setActif] = useState(avec[0]?.id ?? "");
  const a = avec.find((x) => x.id === actif) ?? avec[0];
  if (!a) return <p className="aide-bloc">Aucun appareil en élastomère dans le projet.</p>;
  return (
    <section className="carte-plate">
      <Onglets<string> libelle="Appui" prefixe="verif-appareils" actif={a.id} onChange={setActif} onglets={avec.map((x) => ({ id: x.id, titre: x.id, marque: v.criteres.some((c) => c.appui === x.id && c.etat === "non_verifie") ? "erreur" : undefined }))} />
      <Panneau prefixe="verif-appareils" actif={a.id}>
        <div className="grille-mesures">
          <div><span>dbd (LBDP)</span><strong>{f(a.dbd * 100, 2)} cm</strong></div>
          <div><span>dT ; ddiff</span><strong>{f(a.service.dT * 100, 2)} ; {f(a.service.dDiff * 100, 2)} cm</strong></div>
          <div><span>dEd = γIS dbd + 0,5 dT + ddiff</span><strong>{f(a.dEd * 100, 2)} cm</strong></div>
          <div><span>S ; Ar</span><strong>{f(a.S ?? NaN, 2)} ; {f(a.Ar ?? NaN, 4)} m²</strong></div>
          <div><span>E′c ; Pcr</span><strong>{f(a.EcPrime ?? NaN, 0)} MPa ; {f((a.Pcr ?? NaN) * 1000, 0)} kN</strong></div>
          <div><span>Charges permanentes</span><strong>{f(a.permanentes.Nmax)} / {f(a.permanentes.Nmin)} MN ({a.permanentes.source})</strong></div>
        </div>
        <h3 className="sous-titre">Distorsions par combinaison</h3>
        <div className="defile">
          <table className="valeurs table-raideurs">
            <thead>
              <tr>
                <th scope="col">Combinaison</th>
                <th scope="col">N par appareil (kN)</th>
                <th scope="col">dEd (cm)</th>
                <th scope="col">εc,E</th>
                <th scope="col">εq</th>
                <th scope="col">εα</th>
                <th scope="col">εt,d (≤ 7)</th>
              </tr>
            </thead>
            <tbody>
              {a.combinaisons.map((c) => (
                <tr key={c.nom}>
                  <th scope="row">{c.nom}</th>
                  <td className="num">{f(c.N * 1000, 0)}</td>
                  <td className="num">{f(c.dEd * 100, 2)}</td>
                  <td className="num">{f(c.epsC)}</td>
                  <td className="num"><strong>{f(c.epsQ)}</strong></td>
                  <td className="num">{f(c.epsA)}</td>
                  <td className="num"><strong>{f(c.epsT)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="sous-titre">Critères</h3>
        <TableCriteres criteres={v.criteres.filter((c) => c.appui === a.id && !c.id.endsWith("_repos") && !c.id.endsWith("_garde_greve"))} />
      </Panneau>
    </section>
  );
}

function ReposJoints({ v }: { v: VerifAppuis }) {
  return (
    <div className="analyse-synthese">
      <section className="carte-plate">
        <h2>Repos d'appui</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Culée</th>
              <th scope="col">lm (m)</th>
              <th scope="col">Leff (m)</th>
              <th scope="col">deg (m)</th>
              <th scope="col">des (m)</th>
              <th scope="col">lov (m)</th>
              <th scope="col">Disponible (m)</th>
            </tr>
          </thead>
          <tbody>
            {v.repos.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.id}</th>
                <td className="num">{f(r.lm, 2)}</td>
                <td className="num">{f(r.Leff, 2)}</td>
                <td className="num">{f(r.deg, 4)}</td>
                <td className="num">{f(r.des, 4)}</td>
                <td className="num"><strong>{f(r.lov)}</strong></td>
                <td className="num">{Number.isFinite(r.disponible) ? f(r.disponible, 2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <References ids={["lov_repos_appui", "Lg", "dg"]} />
      </section>
      <section className="carte-plate">
        <h2>Joints de chaussée et garde-grève</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Culée</th>
              <th scope="col">dE (cm)</th>
              <th scope="col">dG (cm)</th>
              <th scope="col">dT (cm)</th>
              <th scope="col">Souffle sismique total (cm)</th>
              <th scope="col">Souffle retenu (cm)</th>
              <th scope="col">Jeu au garde-grève (cm)</th>
            </tr>
          </thead>
          <tbody>
            {v.joints.map((j) => (
              <tr key={j.id}>
                <th scope="row">{j.id}</th>
                <td className="num">{f(j.dE * 100, 2)}</td>
                <td className="num">{f(j.dG * 100, 2)}</td>
                <td className="num">{f(j.dT * 100, 2)}</td>
                <td className="num"><strong>{f(j.souffle * 100, 1)}</strong></td>
                <td className="num">{f(j.souffleRetenu * 100, 1)}</td>
                <td className="num">{f(j.jeuGardeGreve * 100, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="aide-bloc">{v.joints[0]?.regle}</p>
        <References ids={["souffle_joint", "joints_chaussee", "pE_pT"]} />
      </section>
    </div>
  );
}

export default function PageVerifications({ projet, modifier, sous }: { projet: Projet; modifier: Modifier; sous: string | null }) {
  const v = useMemo(() => {
    const a = actionSismique(projet);
    const m = modele(projet);
    return verifierAppuis(projet, a, m, analyse(projet, a, m));
  }, [projet]);
  const comparaisons = useMemo(validerAppuisExemple, []);
  const onglet: SousOnglet = (SOUS_ONGLETS as string[]).includes(sous ?? "") ? (sous as SousOnglet) : "synthese";
  const ko = v.criteres.filter((c) => c.etat === "non_verifie").length;
  return (
    <main className="page page-action">
      <header className="page-entete">
        <h1>Vérifications</h1>
        <p>
          {projet.nom} — étape 6a : appareils d'appui, repos d'appui, joints. {ko === 0 ? "Tous les critères sont vérifiés." : `${ko} critère${ko > 1 ? "s" : ""} non vérifié${ko > 1 ? "s" : ""}.`}
        </p>
      </header>
      <Onglets<SousOnglet>
        libelle="Parties des vérifications"
        prefixe="verifications"
        actif={onglet}
        onChange={(o) => aller("verifications", o)}
        onglets={[
          { id: "synthese", titre: "Synthèse", marque: ko > 0 ? "erreur" : undefined },
          { id: "donnees", titre: "Données" },
          { id: "appareils", titre: "Appareils d'appui" },
          { id: "repos", titre: "Repos et joints" },
          { id: "note", titre: "Note de calcul" },
          { id: "validation", titre: "Validation (exemple du guide)" },
        ]}
      />
      <Panneau prefixe="verifications" actif={onglet} className="panneau-onglet">
        {onglet === "synthese" && <Synthese v={v} />}
        {onglet === "donnees" && <Donnees projet={projet} modifier={modifier} v={v} />}
        {onglet === "appareils" && <Appareils v={v} />}
        {onglet === "repos" && <ReposJoints v={v} />}
        {onglet === "note" && <NoteCalcul sections={v.note} prefixe="note-verif" />}
        {onglet === "validation" && <TableValidation titre="Validation sur l'exemple du pont dalle" comparaisons={comparaisons} />}
      </Panneau>
    </main>
  );
}
