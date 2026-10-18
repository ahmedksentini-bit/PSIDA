import { useMemo, useState } from "react";
import { modele, type Borne, type Direction, type Modele } from "../../moteur/modele.ts";
import { validerModeleExemple } from "../../moteur/validation-exemple.ts";
import type { Projet } from "../../projet/types.ts";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { TableValidation } from "../note/TableValidation.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { ChampNombre, Grille } from "../projet/champs.tsx";
import type { Modifier } from "../projet/Saisie.tsx";
import { aller } from "../route.ts";

type SousOnglet = "masses" | "raideurs" | "elastomeres" | "note" | "validation";
const SOUS_ONGLETS: SousOnglet[] = ["masses", "raideurs", "elastomeres", "note", "validation"];

const f = (v: number, d = 2) => (v === Infinity ? "rigide" : formatNombre(Number(v.toFixed(d))));

function Masses({ m }: { m: Modele }) {
  return (
    <section className="carte-plate">
      <h2>Masses</h2>
      <div className="defile">
        <table className="valeurs table-resultats">
          <tbody>
            <tr>
              <th scope="row">Masse linéique du tablier</th>
              <td className="num"><strong>{f(m.masses.masseLineique, 3)}</strong> <span className="unite">t/m</span></td>
              <td><References ids={["masses_sismiques"]} /></td>
            </tr>
            <tr>
              <th scope="row">Masse du tablier (entre axes des culées)</th>
              <td className="num"><strong>{f(m.masses.tablier, 1)}</strong> <span className="unite">t</span></td>
              <td><References ids={["masses_sismiques"]} /></td>
            </tr>
            <tr>
              <th scope="row">Part du trafic (ψ2,1 = {formatNombre(m.masses.psi21)})</th>
              <td className="num"><strong>{f(m.masses.trafic, 1)}</strong> <span className="unite">t</span></td>
              <td><References ids={["psi_21"]} /></td>
            </tr>
            <tr>
              <th scope="row">Masse sismique M</th>
              <td className="num"><strong>{f(m.masses.M, 1)}</strong> <span className="unite">t</span></td>
              <td><References ids={["masses_sismiques"]} /></td>
            </tr>
            {m.masses.piles.map((p) => (
              <tr key={p.id}>
                <th scope="row">Fûts de {p.id}{p.ajoutTablier > 0 ? " (moitié ajoutée au tablier : appareils fixes)" : " (inertie propre, traitée séparément)"}</th>
                <td className="num"><strong>{f(p.masseFuts, 1)}</strong> <span className="unite">t</span></td>
                <td><References ids={["masses_sismiques"]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Raideurs({ m }: { m: Modele }) {
  const [dir, setDir] = useState<Direction>("x");
  const [borne, setBorne] = useState<Borne>("lbdp");
  const d = m.directions[dir];
  return (
    <section className="carte-plate">
      <div className="raideurs-entete">
        <Onglets<Direction>
          libelle="Direction"
          prefixe="raideurs"
          actif={dir}
          onChange={setDir}
          onglets={[
            { id: "x", titre: "Longitudinal (X)" },
            { id: "y", titre: "Transversal (Y)" },
          ]}
        />
        {m.elastomeres && (
          <div className="segments" role="group" aria-label="Propriétés des élastomères">
            {(["lbdp", "ubdp"] as const).map((b) => (
              <button key={b} type="button" aria-pressed={borne === b} onClick={() => setBorne(b)}>
                {b === "lbdp" ? "Limites inférieures (LBDP)" : "Limites supérieures (UBDP)"}
              </button>
            ))}
          </div>
        )}
      </div>
      <Panneau prefixe="raideurs" actif={dir}>
        <div className="defile">
          <table className="valeurs table-raideurs">
            <thead>
              <tr>
                <th scope="col">Appui</th>
                <th scope="col">Modélisation</th>
                <th scope="col">k support (MN/m)</th>
                <th scope="col">k appareils (MN/m)</th>
                <th scope="col">k appui (MN/m)</th>
                <th scope="col">Part de K</th>
              </tr>
            </thead>
            <tbody>
              {d.appuis.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.id}</th>
                  <td className="modelisation">{a.description}</td>
                  <td className="num">{f(a.kSupport)}</td>
                  <td className="num">{a.kAppareils[borne] === 0 ? "libre" : f(a.kAppareils[borne])}</td>
                  <td className="num"><strong>{a.kTotal[borne] === 0 ? "0" : f(a.kTotal[borne])}</strong></td>
                  <td className="num">
                    <span className="barre-part" style={{ width: `${Math.round(a.part[borne] * 60)}px` }} />
                    {formatNombre(Math.round(a.part[borne] * 1000) / 10)} %
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>Raideur totale K = Σ k appui</th>
                <td className="num"><strong>{f(d.K[borne])}</strong></td>
                <td className="num">100 %</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <References ids={["raideur_fut", "raideur_elastomere", "raideur_ligne_appui", "culee_rigide"]} />
        <p className="aide-bloc">
          Fondations supposées infiniment rigides. La rigidité des culées se règle dans Projet › Appuis. Les périodes et efforts viennent à l'étape 5.
        </p>
      </Panneau>
    </section>
  );
}

function Elastomeres({ m, projet, modifier }: { m: Modele; projet: Projet; modifier: Modifier }) {
  const e = projet.elastomeres;
  const r = m.elastomeres;
  return (
    <div className="action-parametres">
      <section className="carte-plate">
        <h2>Données climatiques et facteurs λ</h2>
        <Grille>
          <ChampNombre libelle="Température d'origine T0" unite="°C" refId="Tmin_b" valeur={e.T0} onChange={(v) => modifier((p) => void (p.elastomeres.T0 = v))} />
          <ChampNombre libelle="Température minimale Tmin" unite="°C" refId="Tmin_b" valeur={e.Tmin} onChange={(v) => modifier((p) => void (p.elastomeres.Tmin = v))} />
          <ChampNombre libelle="λmax,f1 (vieillissement)" refId="lambda_U" valeur={e.lambdaMaxF1} min={1} onChange={(v) => modifier((p) => void (p.elastomeres.lambdaMaxF1 = v))} />
          <ChampNombre libelle="λmax,f2 (température)" refId="lambda_U" valeur={e.lambdaMaxF2} min={1} onChange={(v) => modifier((p) => void (p.elastomeres.lambdaMaxF2 = v))} />
          <ChampNombre libelle="ψfi" refId="lambda_U" valeur={e.psiFi} min={0} max={1} onChange={(v) => modifier((p) => void (p.elastomeres.psiFi = v))} />
        </Grille>
        <p className="aide-bloc">Valeurs de l'exemple du guide : T0 = 10 °C, Tmin = −30 °C (Savoie), λmax = 1,1 et ψfi = 0,70 (catégorie III).</p>
      </section>
      <section className="carte-plate">
        <h2>Module de cisaillement</h2>
        {r ? (
          <table className="valeurs table-resultats">
            <tbody>
              <tr><th scope="row">Gg (conventionnel)</th><td className="num"><strong>{f(r.Gg, 3)}</strong> MPa</td><td><References ids={["module_G_elastomere"]} /></td></tr>
              <tr><th scope="row">Gb = 1,1 Gg (LBDP)</th><td className="num"><strong>{f(r.Gb, 3)}</strong> MPa</td><td><References ids={["module_G_elastomere"]} /></td></tr>
              <tr><th scope="row">Tmin,b</th><td className="num"><strong>{f(r.Tminb, 2)}</strong> °C</td><td><References ids={["Tmin_b"]} /></td></tr>
              {r.regle === "λ" && (
                <tr><th scope="row">λU,f1 · λU,f2</th><td className="num"><strong>{f(r.lambdaU1, 4)} × {f(r.lambdaU2, 4)}</strong></td><td><References ids={["lambda_U"]} /></td></tr>
              )}
              <tr><th scope="row">Gb,max (UBDP) — {r.regle === "λ" ? "Tmin,b < 0 °C" : "Tmin,b ≥ 0 °C : 1,2 Gb"}</th><td className="num"><strong>{f(r.GbMax, 3)}</strong> MPa</td><td><References ids={["bornes_G_elastomere"]} /></td></tr>
            </tbody>
          </table>
        ) : (
          <p className="aide-bloc">Aucun appareil en élastomère dans le projet.</p>
        )}
      </section>
    </div>
  );
}

export default function PageModele({ projet, modifier, sous }: { projet: Projet; modifier: Modifier; sous: string | null }) {
  const m = useMemo(() => modele(projet), [projet]);
  const comparaisons = useMemo(validerModeleExemple, []);
  const onglet: SousOnglet = (SOUS_ONGLETS as string[]).includes(sous ?? "") ? (sous as SousOnglet) : "masses";
  return (
    <main className="page page-action">
      <header className="page-entete">
        <h1>Modèle : masses et raideurs</h1>
        <p>
          {projet.nom} — M = {f(m.masses.M, 1)} t ; Kx = {f(m.directions.x.K.lbdp)} à {f(m.directions.x.K.ubdp)} MN/m ; Ky = {f(m.directions.y.K.lbdp)} à{" "}
          {f(m.directions.y.K.ubdp)} MN/m
        </p>
      </header>
      <Onglets<SousOnglet>
        libelle="Parties du modèle"
        prefixe="modele"
        actif={onglet}
        onChange={(o) => aller("modele", o)}
        onglets={[
          { id: "masses", titre: "Masses" },
          { id: "raideurs", titre: "Raideurs" },
          { id: "elastomeres", titre: "Élastomères" },
          { id: "note", titre: "Note de calcul", marque: Math.abs(m.amortissement.ecartSaisie) > 0.5 ? "alerte" : undefined },
          { id: "validation", titre: "Validation (exemple du guide)" },
        ]}
      />
      <Panneau prefixe="modele" actif={onglet} className="panneau-onglet">
        {onglet === "masses" && <Masses m={m} />}
        {onglet === "raideurs" && <Raideurs m={m} />}
        {onglet === "elastomeres" && <Elastomeres m={m} projet={projet} modifier={modifier} />}
        {onglet === "note" && <NoteCalcul sections={m.note} prefixe="note-modele" />}
        {onglet === "validation" && <TableValidation titre="Validation sur l'exemple du pont dalle" comparaisons={comparaisons} />}
      </Panneau>
    </main>
  );
}
