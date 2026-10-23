import { useRef } from "react";
import { CLASSES_BETON, changerNombreTravees, changerTypeAppareils } from "../../projet/edition.ts";
import { EXEMPLE_PONT_DALLE } from "../../projet/exemple.ts";
import { derives, epaisseurElastomere, hauteurAppareil } from "../../projet/geometrie.ts";
import { importerFichier, telechargerProjet } from "../../projet/stockage.ts";
import type { Appui, Categorie, ClasseSol, Culee, LigneAppareils, Pile, Projet, Trafic, TypeTablier, Zone } from "../../projet/types.ts";
import type { Probleme } from "../../projet/validation.ts";
import { formatNombre } from "../format.ts";
import { Onglets, Panneau } from "../Onglets.tsx";
import { ChampCase, ChampChoix, ChampNombre, ChampTexte, Grille } from "./champs.tsx";

export type Modifier = (f: (p: Projet) => void) => void;

interface Props {
  projet: Projet;
  modifier: Modifier;
  remplacer: (p: Projet) => void;
  problemes: Probleme[];
  appuiActif: string | null;
  setAppuiActif: (id: string | null) => void;
  sousOnglet: SousOngletProjet;
  setSousOnglet: (o: SousOngletProjet) => void;
}

const mm = { vers: (v: number) => v * 1000, depuis: (v: number) => v / 1000 };

const LIBELLES_NIVEAU = { erreur: "Erreur", alerte: "Alerte", info: "Information" } as const;

function ListeProblemes({ problemes }: { problemes: Probleme[] }) {
  if (problemes.length === 0) return null;
  return (
    <ul className="problemes">
      {problemes.map((p, i) => (
        <li key={`${p.cible}-${i}`} className={`probleme niveau-${p.niveau}`}>
          <strong>{LIBELLES_NIVEAU[p.niveau]}</strong> {p.cible !== "site" && p.cible !== "tablier" ? `${p.cible} : ` : ""}
          {p.message}
        </li>
      ))}
    </ul>
  );
}

function Deduit({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="deduit">
      <span>{libelle}</span>
      <strong>{valeur}</strong>
    </div>
  );
}

function SaisieAppareils({ a, maj }: { a: LigneAppareils; maj: (f: (a: LigneAppareils) => LigneAppareils) => void }) {
  const tq = epaisseurElastomere(a);
  return (
    <>
      <h4>Appareils d'appui</h4>
      <Grille>
        <ChampChoix
          libelle="Type"
          valeur={a.type}
          options={[
            { valeur: "elastomere", libelle: "Élastomère fretté" },
            { valeur: "fixe", libelle: "Fixe" },
            { valeur: "glissant", libelle: "Glissant" },
          ]}
          onChange={(t) => maj((x) => changerTypeAppareils(x, t))}
        />
        <ChampNombre libelle="Nombre sur la ligne" valeur={a.nombre} entier min={1} onChange={(v) => maj((x) => ({ ...x, nombre: v }))} />
        <ChampNombre libelle="a (selon X)" unite="mm" valeur={mm.vers(a.a)} min={0} onChange={(v) => maj((x) => ({ ...x, a: mm.depuis(v) }))} />
        <ChampNombre libelle="b (selon Y)" unite="mm" valeur={mm.vers(a.b)} min={0} onChange={(v) => maj((x) => ({ ...x, b: mm.depuis(v) }))} />
        {a.type === "elastomere" ? (
          <>
            <ChampNombre libelle="Feuillets intermédiaires" valeur={a.nbFeuillets} entier min={1} onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, nbFeuillets: v } : x))} />
            <ChampNombre libelle="Épaisseur d'un feuillet ti" unite="mm" valeur={mm.vers(a.ti)} min={0} onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, ti: mm.depuis(v) } : x))} />
            <ChampNombre libelle="Couche extérieure e" unite="mm" valeur={mm.vers(a.enrobage)} min={0} onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, enrobage: mm.depuis(v) } : x))} />
            <ChampNombre libelle="Frette ts" unite="mm" valeur={mm.vers(a.ts)} min={0} onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, ts: mm.depuis(v) } : x))} />
            <ChampNombre libelle="Plaque extérieure" unite="mm" valeur={mm.vers(a.plaqueExterieure)} min={0} onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, plaqueExterieure: mm.depuis(v) } : x))} />
            <ChampNombre libelle="Module Gg" unite="MPa" valeur={a.Gg} min={0} refId="module_G_elastomere" onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, Gg: v } : x))} />
            <ChampNombre libelle="Enrobage latéral des frettes" unite="mm" valeur={mm.vers(a.enrobageLateral)} min={0} onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, enrobageLateral: mm.depuis(v) } : x))} />
            <ChampChoix
              libelle="Maintien en place"
              valeur={a.fixation}
              options={[
                { valeur: "mecanique", libelle: "Fixation mécanique" },
                { valeur: "frottement", libelle: "Frottement seul" },
              ]}
              onChange={(v) => maj((x) => (x.type === "elastomere" ? { ...x, fixation: v } : x))}
            />
          </>
        ) : (
          <ChampNombre libelle="Hauteur hors tout" unite="mm" valeur={mm.vers(a.hauteur)} min={0} onChange={(v) => maj((x) => (x.type !== "elastomere" ? { ...x, hauteur: mm.depuis(v) } : x))} />
        )}
      </Grille>
      <div className="deduits">
        {tq !== null && <Deduit libelle="Épaisseur d'élastomère Tq = n·ti + 2e" valeur={`${formatNombre(tq * 1000)} mm`} />}
        <Deduit libelle="Hauteur hors tout" valeur={`${formatNombre(hauteurAppareil(a) * 1000)} mm`} />
      </div>
    </>
  );
}

function SaisieButees({ appui, maj }: { appui: Appui; maj: (f: (a: Appui) => void) => void }) {
  return (
    <>
      <h4>Butées</h4>
      <Grille>
        <ChampCase libelle="Blocage transversal" valeur={appui.butees.transversales} onChange={(v) => maj((a) => void (a.butees.transversales = v))} />
        <ChampCase libelle="Blocage longitudinal" valeur={appui.butees.longitudinales} onChange={(v) => maj((a) => void (a.butees.longitudinales = v))} />
      </Grille>
    </>
  );
}

function SaisiePile({ pile, maj, toutesPiles }: { pile: Pile; maj: (f: (a: Pile) => void) => void; toutesPiles: () => void }) {
  const { futs, semelle } = pile;
  const rond = futs.forme === "circulaire";
  return (
    <>
      <h4>Fûts</h4>
      <Grille>
        <ChampChoix
          libelle="Forme"
          valeur={futs.forme}
          options={[
            { valeur: "rectangulaire", libelle: "Rectangulaire" },
            { valeur: "circulaire", libelle: "Circulaire" },
          ]}
          onChange={(v) => maj((p) => void (p.futs.forme = v))}
        />
        <ChampNombre libelle="Nombre de fûts" valeur={futs.nombre} entier min={1} onChange={(v) => maj((p) => void (p.futs.nombre = v))} />
        <ChampNombre libelle={rond ? "Diamètre" : "Épaisseur (selon X)"} unite="m" valeur={futs.long} min={0} onChange={(v) => maj((p) => void (p.futs.long = v))} />
        {!rond && <ChampNombre libelle="Largeur (selon Y)" unite="m" valeur={futs.trans} min={0} onChange={(v) => maj((p) => void (p.futs.trans = v))} />}
        <ChampNombre libelle="Entraxe des fûts" unite="m" valeur={futs.entraxe} min={0} onChange={(v) => maj((p) => void (p.futs.entraxe = v))} />
        <ChampNombre libelle="Hauteur" unite="m" valeur={futs.hauteur} min={0} onChange={(v) => maj((p) => void (p.futs.hauteur = v))} />
        <ChampNombre libelle="Repos disponible de chaque côté" unite="m" valeur={pile.reposDisponible ?? 0} min={0} aide="Travées indépendantes : de l'extrémité de la travée au bord de la tête de pile (0 = non saisi)" onChange={(v) => maj((p) => void (p.reposDisponible = v > 0 ? v : undefined))} />
      </Grille>
      <h4>Semelle</h4>
      <Grille>
        <ChampNombre libelle="Longueur (selon X)" unite="m" valeur={semelle.long} min={0} onChange={(v) => maj((p) => void (p.semelle.long = v))} />
        <ChampNombre libelle="Largeur (selon Y)" unite="m" valeur={semelle.trans} min={0} onChange={(v) => maj((p) => void (p.semelle.trans = v))} />
        <ChampNombre libelle="Épaisseur" unite="m" valeur={semelle.epaisseur} min={0} onChange={(v) => maj((p) => void (p.semelle.epaisseur = v))} />
      </Grille>
      <SaisieAppareils a={pile.appareils} maj={(f) => maj((p) => void (p.appareils = f(p.appareils)))} />
      <SaisieButees appui={pile} maj={(f) => maj((p) => f(p))} />
      <button type="button" className="bouton-secondaire" onClick={toutesPiles}>
        Appliquer cette pile à toutes les piles
      </button>
    </>
  );
}

function SaisieCulee({ culee, maj }: { culee: Culee; maj: (f: (a: Culee) => void) => void }) {
  const { poteaux, sommier, gardeGreve, longrine, semelle } = culee;
  return (
    <>
      <h4>Poteaux</h4>
      <Grille>
        <ChampNombre libelle="Nombre" valeur={poteaux.nombre} entier min={1} onChange={(v) => maj((c) => void (c.poteaux.nombre = v))} />
        <ChampNombre libelle="Côté (section carrée)" unite="m" valeur={poteaux.cote} min={0} onChange={(v) => maj((c) => void (c.poteaux.cote = v))} />
        <ChampNombre libelle="Entraxe (selon Y)" unite="m" valeur={poteaux.entraxe} min={0} onChange={(v) => maj((c) => void (c.poteaux.entraxe = v))} />
        <ChampNombre libelle="Hauteur" unite="m" valeur={poteaux.hauteur} min={0} onChange={(v) => maj((c) => void (c.poteaux.hauteur = v))} />
      </Grille>
      <h4>Sommier et mur garde-grève</h4>
      <Grille>
        <ChampNombre libelle="Sommier : longueur (X)" unite="m" valeur={sommier.long} min={0} onChange={(v) => maj((c) => void (c.sommier.long = v))} />
        <ChampNombre libelle="Sommier : hauteur" unite="m" valeur={sommier.haut} min={0} onChange={(v) => maj((c) => void (c.sommier.haut = v))} />
        <ChampNombre libelle="Sommier : largeur (Y)" unite="m" valeur={sommier.trans} min={0} onChange={(v) => maj((c) => void (c.sommier.trans = v))} />
        <ChampNombre libelle="Débord côté travée" unite="m" valeur={sommier.debordAvant} min={0} aide="Au-delà du nu des poteaux" onChange={(v) => maj((c) => void (c.sommier.debordAvant = v))} />
        <ChampNombre libelle="Garde-grève : hauteur" unite="m" valeur={gardeGreve.hauteur} min={0} onChange={(v) => maj((c) => void (c.gardeGreve.hauteur = v))} />
        <ChampNombre libelle="Garde-grève : épaisseur" unite="m" valeur={gardeGreve.epaisseur} min={0} onChange={(v) => maj((c) => void (c.gardeGreve.epaisseur = v))} />
        <ChampNombre libelle="Garde-grève : retrait" unite="m" valeur={gardeGreve.retrait} min={0} aide="Depuis l'arrière du sommier" onChange={(v) => maj((c) => void (c.gardeGreve.retrait = v))} />
        <ChampNombre libelle="Excentrement de l'axe d'appui" unite="m" valeur={culee.excentrementAppui} aide="Des poteaux vers le remblai" onChange={(v) => maj((c) => void (c.excentrementAppui = v))} />
      </Grille>
      <h4>Fondation</h4>
      <Grille>
        <ChampCase
          libelle="Longrine sous les poteaux"
          valeur={longrine !== null}
          onChange={(v) => maj((c) => void (c.longrine = v ? { long: 1, haut: 0.8, trans: Math.max(c.poteaux.entraxe + c.poteaux.cote, 1) } : null))}
        />
      </Grille>
      {longrine && (
        <Grille>
          <ChampNombre libelle="Longrine : longueur (X)" unite="m" valeur={longrine.long} min={0} onChange={(v) => maj((c) => void (c.longrine && (c.longrine.long = v)))} />
          <ChampNombre libelle="Longrine : hauteur" unite="m" valeur={longrine.haut} min={0} onChange={(v) => maj((c) => void (c.longrine && (c.longrine.haut = v)))} />
          <ChampNombre libelle="Longrine : largeur (Y)" unite="m" valeur={longrine.trans} min={0} onChange={(v) => maj((c) => void (c.longrine && (c.longrine.trans = v)))} />
        </Grille>
      )}
      <Grille>
        <ChampNombre libelle="Semelle : longueur (X)" unite="m" valeur={semelle.long} min={0} onChange={(v) => maj((c) => void (c.semelle.long = v))} />
        <ChampNombre libelle="Semelle : largeur (Y)" unite="m" valeur={semelle.trans} min={0} onChange={(v) => maj((c) => void (c.semelle.trans = v))} />
        <ChampNombre libelle="Semelle : épaisseur" unite="m" valeur={semelle.epaisseur} min={0} onChange={(v) => maj((c) => void (c.semelle.epaisseur = v))} />
      </Grille>
      <h4>Raideur propre</h4>
      <Grille>
        <ChampCase libelle="Rigide en longitudinal (remblai)" valeur={culee.rigide.longitudinal} onChange={(v) => maj((c) => void (c.rigide.longitudinal = v))} />
        <ChampCase libelle="Rigide en transversal" valeur={culee.rigide.transversal} onChange={(v) => maj((c) => void (c.rigide.transversal = v))} />
      </Grille>
      <SaisieAppareils a={culee.appareils} maj={(f) => maj((c) => void (c.appareils = f(c.appareils)))} />
      <SaisieButees appui={culee} maj={(f) => maj((c) => f(c))} />
    </>
  );
}

export type SousOngletProjet = "site" | "materiaux" | "tablier" | "appuis" | "options";

export const SOUS_ONGLETS_PROJET: SousOngletProjet[] = ["site", "materiaux", "tablier", "appuis", "options"];

export function Saisie({ projet, modifier, remplacer, problemes, appuiActif, setAppuiActif, sousOnglet, setSousOnglet }: Props) {
  const fichier = useRef<HTMLInputElement>(null);
  const d = derives(projet);
  const { site, materiaux, tablier, comportement } = projet;
  const problemesDe = (...cibles: string[]) => problemes.filter((p) => cibles.includes(p.cible));
  const marque = (...cibles: string[]): "erreur" | "alerte" | undefined => {
    const liste = problemesDe(...cibles);
    return liste.some((p) => p.niveau === "erreur") ? "erreur" : liste.some((p) => p.niveau === "alerte") ? "alerte" : undefined;
  };
  const idsAppuis = projet.appuis.map((a) => a.id);
  const indexActif = Math.max(0, projet.appuis.findIndex((a) => a.id === appuiActif));
  const appui = projet.appuis[indexActif];

  const majAppui = (i: number) => (f: (a: Appui) => void) =>
    modifier((p) => {
      const a = p.appuis[i];
      if (a) f(a);
    });

  const appliquerAToutesLesPiles = (source: Pile) =>
    modifier((p) => {
      p.appuis = p.appuis.map((a) => (a.type === "pile" ? { ...structuredClone(source), id: a.id } : a));
    });

  return (
    <div className="saisie">
      <div className="barre-outils">
        <button type="button" className="bouton-secondaire" onClick={() => remplacer(structuredClone(EXEMPLE_PONT_DALLE))}>
          Charger l'exemple du guide
        </button>
        <button type="button" className="bouton-secondaire" onClick={() => fichier.current?.click()}>
          Importer…
        </button>
        <button type="button" className="bouton-secondaire" onClick={() => telechargerProjet(projet)}>
          Exporter
        </button>
        <input
          ref={fichier}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              remplacer(await importerFichier(f));
            } catch (err) {
              alert(err instanceof Error ? err.message : "Fichier illisible.");
            }
          }}
        />
      </div>

      <Onglets<SousOngletProjet>
        libelle="Parties de la saisie"
        prefixe="saisie"
        actif={sousOnglet}
        onChange={setSousOnglet}
        onglets={[
          { id: "site", titre: "Site", marque: marque("site") },
          { id: "materiaux", titre: "Matériaux", marque: marque("matériaux") },
          { id: "tablier", titre: "Tablier", marque: marque("tablier") },
          { id: "appuis", titre: "Appuis", marque: marque("appuis", ...idsAppuis) },
          { id: "options", titre: "Options", marque: marque("options") },
        ]}
      />

      <Panneau prefixe="saisie" actif={sousOnglet} className="panneau-onglet">
        {sousOnglet === "site" && (
          <>
            <ChampTexte libelle="Nom du projet" valeur={projet.nom} onChange={(v) => modifier((p) => void (p.nom = v))} />
            {projet.description && <p className="description-projet">{projet.description}</p>}
            <Grille>
              <ChampTexte libelle="Commune" valeur={site.commune} onChange={(v) => modifier((p) => void (p.site.commune = v))} />
              <ChampChoix<Zone>
                libelle="Zone de sismicité"
                refId="agr"
                valeur={site.zone}
                options={[1, 2, 3, 4, 5].map((z) => ({ valeur: z as Zone, libelle: `${z} — ${["très faible", "faible", "modérée", "moyenne", "forte"][z - 1]}` }))}
                onChange={(v) => modifier((p) => void (p.site.zone = v))}
              />
              <ChampChoix<Categorie>
                libelle="Catégorie d'importance"
                refId="categories_importance"
                valeur={site.categorie}
                options={(["I", "II", "III", "IV"] as const).map((c) => ({ valeur: c, libelle: c }))}
                onChange={(v) => modifier((p) => void (p.site.categorie = v))}
              />
              <ChampChoix<ClasseSol>
                libelle="Classe de sol"
                refId="classes_sol"
                valeur={site.classeSol}
                options={(["A", "B", "C", "D", "E"] as const).map((c) => ({ valeur: c, libelle: c }))}
                onChange={(v) => modifier((p) => void (p.site.classeSol = v))}
              />
              <ChampNombre libelle="Coefficient topographique ST" refId="ST" valeur={site.ST} min={1} onChange={(v) => modifier((p) => void (p.site.ST = v))} />
              <ChampChoix<Trafic>
                libelle="Trafic (ψ2,1)"
                refId="psi_21"
                valeur={site.trafic}
                options={[
                  { valeur: "cas_general", libelle: "Cas général (ψ2,1 = 0)" },
                  { valeur: "routier_trafic_intense", libelle: "Routier, trafic intense (0,2)" },
                  { valeur: "ferroviaire_trafic_intense", libelle: "Ferroviaire, trafic intense (0,3)" },
                ]}
                onChange={(v) => modifier((p) => void (p.site.trafic = v))}
              />
            </Grille>
            <p className={`statut-reglementaire ${d.soumis.soumis ? "soumis" : "non-soumis"}`}>{d.soumis.motif}</p>
            <ListeProblemes problemes={problemesDe("site")} />
          </>
        )}

        {sousOnglet === "materiaux" && (
          <>
            <Grille>
              <ChampChoix
                libelle="Classe de béton"
                valeur={materiaux.beton.classe}
                options={CLASSES_BETON.map((c) => ({ valeur: c.classe, libelle: c.classe }))}
                onChange={(v) =>
                  modifier((p) => {
                    p.materiaux.beton.classe = v;
                    p.materiaux.beton.fck = CLASSES_BETON.find((c) => c.classe === v)?.fck ?? p.materiaux.beton.fck;
                  })
                }
              />
              <ChampNombre libelle="Masse volumique du béton" unite="t/m³" valeur={materiaux.beton.masseVolumique} min={0} onChange={(v) => modifier((p) => void (p.materiaux.beton.masseVolumique = v))} />
              <ChampNombre libelle="fyk des armatures" unite="MPa" valeur={materiaux.acier.fyk} min={0} onChange={(v) => modifier((p) => void (p.materiaux.acier.fyk = v))} />
              <ChampChoix
                libelle="Classe de ductilité de l'acier"
                valeur={materiaux.acier.classeDuctilite}
                options={(["A", "B", "C"] as const).map((c) => ({ valeur: c, libelle: c }))}
                onChange={(v) => modifier((p) => void (p.materiaux.acier.classeDuctilite = v))}
              />
            </Grille>
            <div className="deduits">
              <Deduit libelle="fck" valeur={`${formatNombre(materiaux.beton.fck)} MPa`} />
            </div>
            <ListeProblemes problemes={problemesDe("matériaux")} />
          </>
        )}

        {sousOnglet === "tablier" && (
          <>
            <Grille>
              <ChampChoix<TypeTablier>
                libelle="Type de tablier"
                valeur={tablier.type}
                options={[
                  { valeur: "dalle_ba", libelle: "Dalle en béton armé" },
                  { valeur: "dalle_bp", libelle: "Dalle en béton précontraint" },
                  { valeur: "poutres", libelle: "Poutres" },
                  { valeur: "caisson", libelle: "Caisson" },
                  { valeur: "mixte", libelle: "Mixte acier-béton" },
                ]}
                onChange={(v) => modifier((p) => void (p.tablier.type = v))}
              />
              <ChampNombre libelle="Nombre de travées" valeur={tablier.travees.length} entier min={1} max={20} onChange={(v) => remplacer(changerNombreTravees(projet, v))} />
              <ChampChoix<"continu" | "isostatique">
                libelle="Continuité"
                valeur={tablier.continuite ?? "continu"}
                options={[
                  { valeur: "continu", libelle: "Tablier continu" },
                  { valeur: "isostatique", libelle: "Travées indépendantes (joint sur chaque pile)" },
                ]}
                onChange={(v) => modifier((p) => void (p.tablier.continuite = v))}
              />
            </Grille>
            <Grille>
              {tablier.travees.map((t, i) => (
                <ChampNombre key={i} libelle={`Portée travée ${i + 1}`} unite="m" valeur={t} min={0} onChange={(v) => modifier((p) => void (p.tablier.travees[i] = v))} />
              ))}
            </Grille>
            <Grille>
              <ChampNombre libelle="Largeur" unite="m" valeur={tablier.largeur} min={0} onChange={(v) => modifier((p) => void (p.tablier.largeur = v))} />
              <ChampNombre libelle="Épaisseur (hauteur de section)" unite="m" valeur={tablier.epaisseur} min={0} onChange={(v) => modifier((p) => void (p.tablier.epaisseur = v))} />
              <ChampNombre libelle="Aire de la section" unite="m²" valeur={tablier.aire} min={0} onChange={(v) => modifier((p) => void (p.tablier.aire = v))} />
              <ChampNombre libelle="Superstructures" unite="kN/m" valeur={tablier.superstructures} min={0} aide="Revêtement, trottoirs, corniches, retenues" onChange={(v) => modifier((p) => void (p.tablier.superstructures = v))} />
              <ChampNombre libelle="Débord d'about" unite="m" valeur={tablier.debordAbout} min={0} aide="Au-delà de l'axe d'appui des culées" onChange={(v) => modifier((p) => void (p.tablier.debordAbout = v))} />
              <ChampNombre libelle="Charges de trafic réparties" unite="kN/m" valeur={tablier.chargeTrafic} min={0} refId="psi_21" aide="Valeur caractéristique ; ψ2,1 en tient compte" onChange={(v) => modifier((p) => void (p.tablier.chargeTrafic = v))} />
            </Grille>
            {(tablier.type === "dalle_ba" || tablier.type === "dalle_bp") && Math.abs(tablier.aire - tablier.largeur * tablier.epaisseur) > 1e-6 && (
              <button type="button" className="bouton-lien" onClick={() => modifier((p) => void (p.tablier.aire = p.tablier.largeur * p.tablier.epaisseur))}>
                Prendre aire = largeur × épaisseur ({formatNombre(tablier.largeur * tablier.epaisseur)} m²)
              </button>
            )}
            <div className="deduits">
              <Deduit libelle="Longueur entre axes d'appui des culées" valeur={`${formatNombre(d.longueur)} m`} />
              <Deduit libelle="Poids propre de la section" valeur={`${formatNombre(d.poidsLineique.beton)} kN/m`} />
              <Deduit libelle="Poids total" valeur={`${formatNombre(d.poidsLineique.total)} kN/m`} />
              <Deduit libelle="Masse linéique" valeur={`${formatNombre(d.masseLineique)} t/m`} />
              <Deduit libelle="Masse du tablier (entre axes)" valeur={`${formatNombre(Math.round(d.masseTablier * 10) / 10)} t`} />
            </div>
            <ListeProblemes problemes={problemesDe("tablier")} />
          </>
        )}

        {sousOnglet === "appuis" && appui && (
          <>
            <ListeProblemes problemes={problemesDe("appuis")} />
            <Onglets<string>
              libelle="Appuis"
              prefixe="appui"
              variante="secondaire"
              actif={appui.id}
              onChange={setAppuiActif}
              onglets={projet.appuis.map((a) => ({
                id: a.id,
                titre: a.id,
                marque: marque(a.id),
              }))}
            />
            <Panneau prefixe="appui" actif={appui.id} className="panneau-appui">
              <p className="appui-entete">
                <strong>{appui.type === "pile" ? "Pile" : "Culée"} {appui.id}</strong>
                <span>x = {formatNombre(d.positions[indexActif] ?? 0)} m</span>
              </p>
              <ListeProblemes problemes={problemesDe(appui.id)} />
              {appui.type === "pile" ? (
                <SaisiePile pile={appui} maj={majAppui(indexActif) as (f: (a: Pile) => void) => void} toutesPiles={() => appliquerAToutesLesPiles(appui)} />
              ) : (
                <SaisieCulee culee={appui} maj={majAppui(indexActif) as (f: (a: Culee) => void) => void} />
              )}
            </Panneau>
          </>
        )}

        {sousOnglet === "options" && (
          <>
            <Grille>
              <ChampNombre
                libelle="Pesanteur g"
                unite="m/s²"
                valeur={projet.options.g}
                min={9}
                max={11}
                aide="9,81 en général ; l'exemple du guide utilise 10"
                onChange={(v) => modifier((p) => void (p.options.g = v))}
              />
            </Grille>
            <p className="description-projet">
              Coefficients de comportement et amortissement : onglet « Action sismique » ({formatNombre(comportement.qLongitudinal)} en longitudinal,{" "}
              {formatNombre(comportement.qTransversal)} en transversal).
            </p>
            <ListeProblemes problemes={problemesDe("options")} />
          </>
        )}
      </Panneau>
    </div>
  );
}
