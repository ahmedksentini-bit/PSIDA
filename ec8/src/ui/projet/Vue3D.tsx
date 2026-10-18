import { Edges, Grid, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Vector3 } from "three";
import { maquette, type Role, type Solide, type Vec3 } from "../../projet/geometrie.ts";
import type { Projet } from "../../projet/types.ts";
import { formatNombre } from "../format.ts";

/** Repère du pont (X long., Y transv., Z vertical) vers repère Three.js (Y vers le haut). */
const versThree = ([x, y, z]: Vec3): [number, number, number] => [x, z, -y];

type Vue = "perspective" | "elevation" | "plan" | "coupe";

const COULEURS: Record<Role, string> = {
  tablier: "#b9bec6",
  fut: "#d3d6db",
  semelle: "#a9aeb6",
  sommier: "#c7cbd1",
  garde_greve: "#c7cbd1",
  poteau: "#d3d6db",
  longrine: "#a9aeb6",
  appareil: "#2d2f33",
};

const COULEURS_APPAREILS = { elastomere: "#2d2f33", fixe: "#b4462f", glissant: "#2f6fb4" } as const;
const ACCENT = "#1f5fbf";
const AXES: { nom: string; dir: Vec3; couleur: string }[] = [
  { nom: "X", dir: [1, 0, 0], couleur: "#c0392b" },
  { nom: "Y", dir: [0, 1, 0], couleur: "#1e8449" },
  { nom: "Z", dir: [0, 0, 1], couleur: "#1f5fbf" },
];

const couleurDe = (s: Solide) => (s.role === "appareil" && s.typeAppareil ? COULEURS_APPAREILS[s.typeAppareil] : COULEURS[s.role]);

function Element({ s, selectionne, surligne, onSelect }: { s: Solide; selectionne: boolean; surligne: boolean; onSelect: (s: Solide) => void }) {
  const [survol, setSurvol] = useState(false);
  const [dx, dy, dz] = s.dims;
  return (
    <mesh
      position={versThree(s.centre)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(s);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setSurvol(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setSurvol(false);
        document.body.style.cursor = "";
      }}
    >
      {s.forme === "boite" ? <boxGeometry args={[dx, dz, dy]} /> : <cylinderGeometry args={[dx / 2, dx / 2, dz, 40]} />}
      <meshStandardMaterial
        color={selectionne ? ACCENT : couleurDe(s)}
        emissive={surligne || survol ? ACCENT : "#000000"}
        emissiveIntensity={selectionne ? 0.25 : surligne ? 0.18 : survol ? 0.12 : 0}
        roughness={0.85}
        metalness={0.02}
      />
      <Edges color={selectionne ? "#0b2e66" : "#5b616b"} threshold={20} />
    </mesh>
  );
}

export interface Resultats3D {
  direction: "x" | "y" | "z";
  /** Facteur d'amplification du déplacement affiché. */
  amplification: number;
  /** Déplacement du tablier dans la direction (m). */
  deplacementTablier: number;
  /** Efforts par appui (MN), positifs dans le sens de la direction. */
  efforts: { id: string; x: number; F: number }[];
}

const COULEUR_FORCE = "#d9531e";

function Fleche({ depart, direction, longueur }: { depart: Vec3; direction: "x" | "y" | "z"; longueur: number }) {
  const dir: Vec3 = direction === "x" ? [1, 0, 0] : direction === "y" ? [0, 1, 0] : [0, 0, 1];
  const tete = Math.min(0.9, longueur * 0.35);
  const fin: Vec3 = [depart[0] + dir[0] * longueur, depart[1] + dir[1] * longueur, depart[2] + dir[2] * longueur];
  const baseTete: Vec3 = [fin[0] - dir[0] * tete, fin[1] - dir[1] * tete, fin[2] - dir[2] * tete];
  const centreTete: Vec3 = [fin[0] - (dir[0] * tete) / 2, fin[1] - (dir[1] * tete) / 2, fin[2] - (dir[2] * tete) / 2];
  const rotation: [number, number, number] = direction === "x" ? [0, 0, -Math.PI / 2] : direction === "y" ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <group>
      <Line points={[versThree(depart), versThree(baseTete)]} color={COULEUR_FORCE} lineWidth={3} />
      <mesh position={versThree(centreTete)} rotation={rotation}>
        <cylinderGeometry args={[0, tete * 0.45, tete, 20]} />
        <meshStandardMaterial color={COULEUR_FORCE} />
      </mesh>
    </group>
  );
}

/** Directions d'observation (repère Three.js), du centre vers la caméra. */
const DIRECTIONS: Record<Vue, [number, number, number]> = {
  perspective: [-0.5, 0.45, 0.85],
  elevation: [0, 0.04, 1],
  plan: [0, 1, 0.001],
  coupe: [-1, 0.08, 0],
};

function Camera({ vue, min, max, compteur }: { vue: Vue; min: Vec3; max: Vec3; compteur: number }) {
  const { camera, controls, size } = useThree();
  // Bornes et taille lues au moment du recadrage : modifier la saisie ne doit pas déplacer la caméra.
  const etat = useRef({ min, max, size });
  etat.current = { min, max, size };
  useEffect(() => {
    const { min, max, size } = etat.current;
    const c = versThree([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]);
    const rayon = 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const fovV = ((camera as { fov?: number }).fov ?? 35) * (Math.PI / 180);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * (size.width / Math.max(size.height, 1)));
    const distance = (rayon / Math.sin(Math.min(fovV, fovH) / 2)) * 1.02;
    const [dx, dy, dz] = DIRECTIONS[vue];
    const n = Math.hypot(dx, dy, dz);
    camera.position.set(c[0] + (dx / n) * distance, c[1] + (dy / n) * distance, c[2] + (dz / n) * distance);
    camera.lookAt(...c);
    const orbite = controls as unknown as { target: Vector3; update: () => void } | null;
    if (orbite) {
      orbite.target.set(...c);
      orbite.update();
    }
  }, [vue, compteur, camera, controls]);
  return null;
}

interface Ancre {
  cle: string;
  position: Vec3;
  contenu: ReactNode;
  classe: string;
}

/** Place chaque étiquette HTML sur la projection écran de son point d'ancrage, à chaque image. */
function Projecteur({ ancres, elements }: { ancres: Ancre[]; elements: RefObject<Map<string, HTMLElement>> }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const a of ancres) {
      const el = elements.current.get(a.cle);
      if (!el) continue;
      v.set(...versThree(a.position)).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) <= 1.2 && Math.abs(v.y) <= 1.2;
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

interface Props {
  projet: Projet;
  appuiActif: string | null;
  onSelectAppui: (id: string | null) => void;
  resultats?: Resultats3D | null;
}

export default function Vue3D({ projet, appuiActif, onSelectAppui, resultats = null }: Props) {
  const m = useMemo(() => maquette(projet), [projet]);
  const [vue, setVue] = useState<Vue>("perspective");
  const [compteur, setCompteur] = useState(0);
  const [selection, setSelection] = useState<Solide | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (selection && !m.solides.some((s) => s.id === selection.id)) setSelection(null);
  }, [m, selection]);

  const { min, max } = m.bornes;
  const longueur = max[0] - min[0];
  const taille = Math.max(longueur, (max[1] - min[1]) * 1.6, max[2] * 2.5);
  const zEtiquette = m.zTablier + Math.max(1.2, taille * 0.03);
  const origineTriedre: Vec3 = [min[0] - 2, min[1] - 1, 0];
  const longueurTriedre = Math.max(2, taille * 0.06);

  const ancres: Ancre[] = [
    ...projet.appuis.map((a, i) => ({
      cle: `appui-${a.id}`,
      position: [m.positions[i] ?? 0, 0, zEtiquette] as Vec3,
      classe: "etiquette-3d",
      contenu: (
        <button type="button" className={appuiActif === a.id ? "actif" : undefined} onClick={() => onSelectAppui(appuiActif === a.id ? null : a.id)}>
          {a.id}
        </button>
      ),
    })),
    ...projet.tablier.travees.map((t, i) => ({
      cle: `travee-${i}`,
      position: [((m.positions[i] ?? 0) + (m.positions[i + 1] ?? 0)) / 2, 0, zEtiquette] as Vec3,
      classe: "cote-3d",
      contenu: `${formatNombre(t)} m`,
    })),
    ...AXES.map((a) => ({
      cle: `axe-${a.nom}`,
      position: [
        origineTriedre[0] + a.dir[0] * longueurTriedre * 1.15,
        origineTriedre[1] + a.dir[1] * longueurTriedre * 1.15,
        origineTriedre[2] + a.dir[2] * longueurTriedre * 1.15,
      ] as Vec3,
      classe: "axe-3d",
      contenu: <span style={{ color: a.couleur }}>{a.nom}</span>,
    })),
  ];

  const Fmax = resultats ? Math.max(...resultats.efforts.map((e) => Math.abs(e.F)), 1e-9) : 1;
  const longueurFleche = (F: number) => 1.2 + (4.5 * Math.abs(F)) / Fmax;
  // Flèches sur le côté −Y du tablier, à mi-épaisseur, pour ne pas masquer le tablier ni les étiquettes d'appui.
  const yCote = -projet.tablier.largeur / 2 - 1.2;
  const zMilieu = m.zTablier - projet.tablier.epaisseur / 2;
  const departFleche = (x: number, F: number): Vec3 => {
    const l = longueurFleche(F);
    if (resultats?.direction === "x") return [x - l / 2, yCote, zMilieu];
    if (resultats?.direction === "y") return [x, yCote - l, zMilieu];
    return [x, yCote, m.zTablier - l];
  };
  const finFleche = (x: number, F: number): Vec3 => {
    const d0 = departFleche(x, F);
    const l = longueurFleche(F);
    return resultats?.direction === "x" ? [d0[0] + l, d0[1], d0[2]] : resultats?.direction === "y" ? [d0[0], d0[1] + l, d0[2]] : [d0[0], d0[1], d0[2] + l];
  };
  const ancreEffort = (x: number, F: number): Vec3 => {
    const fin = finFleche(x, F);
    const debut = departFleche(x, F);
    if (resultats?.direction === "y") return [debut[0], debut[1] - 0.8, debut[2]];
    if (resultats?.direction === "z") return [debut[0], debut[1], debut[2] - 0.8];
    return [fin[0], fin[1] - 1.2, fin[2]];
  };
  if (resultats) {
    for (const e of resultats.efforts) {
      ancres.push({ cle: `force-${e.id}`, position: ancreEffort(e.x, e.F), classe: "force-3d", contenu: `${formatNombre(Number(Math.abs(e.F).toFixed(3)))} MN` });
    }
  }
  const decalage: Vec3 = resultats
    ? resultats.direction === "x"
      ? [resultats.deplacementTablier * resultats.amplification, 0, 0]
      : resultats.direction === "y"
        ? [0, resultats.deplacementTablier * resultats.amplification, 0]
        : [0, 0, 0]
    : [0, 0, 0];

  const choisir = (v: Vue) => {
    setVue(v);
    setCompteur((c) => c + 1);
  };

  return (
    <div className="vue3d">
      <Canvas
        camera={{ fov: 35, near: 0.1, far: taille * 20, position: [0, taille, taille] }}
        dpr={[1, 2]}
        onPointerMissed={() => setSelection(null)}
      >
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#ffffff", "#8a8f99", 0.5]} />
        <directionalLight position={[longueur, taille, taille * 0.6]} intensity={1.1} />
        <directionalLight position={[-longueur, taille * 0.5, -taille * 0.6]} intensity={0.35} />
        {m.solides.map((s) => (
          <Element
            key={s.id}
            s={s.role === "tablier" ? { ...s, centre: [s.centre[0] + decalage[0], s.centre[1] + decalage[1], s.centre[2] + decalage[2]] } : s}
            selectionne={selection?.id === s.id}
            surligne={appuiActif !== null && s.appui === appuiActif}
            onSelect={(x) => {
              setSelection(x);
              onSelectAppui(x.appui);
            }}
          />
        ))}
        {resultats && (decalage[0] !== 0 || decalage[1] !== 0) && (() => {
          const t = m.solides.find((x) => x.role === "tablier");
          if (!t) return null;
          return (
            <mesh position={versThree(t.centre)}>
              <boxGeometry args={[t.dims[0], t.dims[2], t.dims[1]]} />
              <meshBasicMaterial color="#7a808a" wireframe transparent opacity={0.35} />
            </mesh>
          );
        })()}
        {resultats?.efforts.map((e) => (
          <Fleche key={`f-${e.id}`} depart={departFleche(e.x, e.F)} direction={resultats.direction} longueur={longueurFleche(e.F)} />
        ))}
        {AXES.map((a) => (
          <Line
            key={a.nom}
            points={[
              versThree(origineTriedre),
              versThree([
                origineTriedre[0] + a.dir[0] * longueurTriedre,
                origineTriedre[1] + a.dir[1] * longueurTriedre,
                origineTriedre[2] + a.dir[2] * longueurTriedre,
              ]),
            ]}
            color={a.couleur}
            lineWidth={2.5}
          />
        ))}
        <Grid
          position={[(min[0] + max[0]) / 2, 0, 0]}
          args={[taille * 3, taille * 3]}
          cellSize={1}
          sectionSize={5}
          cellColor="#9aa0a8"
          sectionColor="#7a808a"
          cellThickness={0.5}
          sectionThickness={1}
          fadeDistance={taille * 2.2}
          infiniteGrid
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.495} />
        <Camera vue={vue} min={min} max={max} compteur={compteur} />
        <Projecteur ancres={ancres} elements={elements} />
      </Canvas>

      <div className="etiquettes-3d">
        {ancres.map((a) => (
          <div
            key={a.cle}
            className={a.classe}
            style={{ visibility: "hidden" }}
            ref={(el) => {
              if (el) elements.current.set(a.cle, el);
              else elements.current.delete(a.cle);
            }}
          >
            {a.contenu}
          </div>
        ))}
      </div>

      <div className="vue3d-outils" role="group" aria-label="Point de vue">
        {(
          [
            ["perspective", "3D"],
            ["elevation", "Élévation"],
            ["plan", "Plan"],
            ["coupe", "Coupe"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={vue === v} onClick={() => choisir(v)}>
            {l}
          </button>
        ))}
      </div>

      <div className="vue3d-legende" aria-label="Légende">
        <span>
          <i style={{ background: COULEURS_APPAREILS.elastomere }} /> Élastomère
        </span>
        <span>
          <i style={{ background: COULEURS_APPAREILS.fixe }} /> Fixe
        </span>
        <span>
          <i style={{ background: COULEURS_APPAREILS.glissant }} /> Glissant
        </span>
      </div>

      {selection && (
        <div className="vue3d-info" role="status">
          <span>{selection.libelle}</span>
          <button type="button" aria-label="Fermer" onClick={() => setSelection(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
