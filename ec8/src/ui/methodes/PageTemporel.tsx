import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionSismique } from "../../moteur/action.ts";
import type { Analyse } from "../../moteur/analyse.ts";
import type { Borne, Modele } from "../../moteur/modele.ts";
import type { DirectionMM } from "../../moteur/multimodal.ts";
import { valeur } from "../../moteur/spectres.ts";
import { historique, temporelLineaire, type Historique, type JeuAccelerogrammes, type Temporel } from "../../moteur/temporel.ts";
import type { Projet } from "../../projet/types.ts";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";

const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)) || 0);
const NOMS: Record<DirectionMM, string> = { x: "Longitudinal (X)", y: "Transversal (Y)", z: "Vertical (Z)" };
type Vue = "synthese" | "accelerogrammes" | "animation" | "note";

interface Serie {
  points: [number, number][];
  classe: string;
  nom?: string;
}

/** Petit graphique SVG (axes, graduations, séries, curseur vertical éventuel). */
export function Courbe({ series, xlabel, ylabel, logx = false, curseur, hauteur = 240, xmin, xmax, bande }: { series: Serie[]; xlabel: string; ylabel: string; logx?: boolean; curseur?: number; hauteur?: number; xmin?: number; xmax?: number; bande?: [number, number] }) {
  const W = 880, H = hauteur, g = 56, d = 16, h = 26, b = 40;
  const tous = series.flatMap((s) => s.points);
  const x0 = xmin ?? Math.min(...tous.map((p) => p[0])), x1 = xmax ?? Math.max(...tous.map((p) => p[0]));
  const yAbs = Math.max(1e-12, ...tous.map((p) => Math.abs(p[1])));
  const neg = tous.some((p) => p[1] < 0);
  const y0 = neg ? -yAbs : 0, y1 = yAbs * 1.05;
  const tx = (x: number) => (logx ? Math.log(x) - Math.log(x0) : x - x0) / (logx ? Math.log(x1) - Math.log(x0) : x1 - x0);
  const X = (x: number) => g + tx(x) * (W - g - d);
  const Y = (y: number) => h + (1 - (y - y0) / (y1 - y0)) * (H - h - b);
  const gradY = (neg ? [-yAbs, 0, yAbs] : [0, yAbs / 2, yAbs]).map((v) => Number(v.toPrecision(2)));
  const gradX = logx ? [0.05, 0.1, 0.2, 0.5, 1, 2, 4].filter((v) => v >= x0 && v <= x1) : Array.from({ length: 6 }, (_, i) => x0 + ((x1 - x0) * i) / 5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="th-courbe" role="img" aria-label={`${ylabel} en fonction de ${xlabel}`}>
      {bande && <rect x={X(bande[0])} y={h} width={Math.max(0, X(bande[1]) - X(bande[0]))} height={H - h - b} className="th-bande" />}
      <line x1={g} x2={W - d} y1={Y(0)} y2={Y(0)} className="th-axe" />
      <line x1={g} x2={g} y1={h} y2={H - b} className="th-axe" />
      {gradY.map((v, i) => (
        <text key={i} x={g - 6} y={Y(v) + 4} className="th-grad" textAnchor="end">{f(v, 2)}</text>
      ))}
      {gradX.map((v, i) => (
        <text key={i} x={X(v)} y={H - b + 16} className="th-grad" textAnchor="middle">{f(v, 2)}</text>
      ))}
      <text x={(g + W - d) / 2} y={H - 6} className="th-grad" textAnchor="middle">{xlabel}</text>
      <text x={g} y={14} className="th-grad">{ylabel}</text>
      {series.map((s, i) => (
        <polyline key={i} points={s.points.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")} className={s.classe} />
      ))}
      {curseur !== undefined && <line x1={X(curseur)} x2={X(curseur)} y1={h} y2={H - b} className="th-curseur" />}
    </svg>
  );
}

function Legende({ items }: { items: { classe: string; nom: string }[] }) {
  return (
    <p className="th-legende">
      {items.map((x) => (
        <span key={x.nom}>
          <svg width="26" height="10" aria-hidden="true"><line x1="0" x2="26" y1="5" y2="5" className={x.classe} /></svg> {x.nom}
        </span>
      ))}
    </p>
  );
}

function Synthese({ th }: { th: Temporel }) {
  return (
    <div className="analyse-synthese">
      <section className="carte-plate">
        <h2>Contrôle des jeux d'accélérogrammes (EN 1998-1 3.2.3.1.2(4))</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Direction</th>
              <th scope="col">Nombre</th>
              <th scope="col">PGA moyenne / a_g S (m/s²)</th>
              <th scope="col">Plage 0,2 T₁ – 2 T₁ (s)</th>
              <th scope="col">min S̄a / Se</th>
            </tr>
          </thead>
          <tbody>
            {(["x", "y", "z"] as const).map((d) => {
              const c = th.jeux[d].controles;
              return (
                <tr key={d}>
                  <th scope="row">{NOMS[d]}</th>
                  <td className="num">{th.jeux[d].accelerogrammes.length}</td>
                  <td className="num">{f(c.pga.moyenne)} / {f(c.pga.agS)} {c.pga.ok ? "✓" : "!"}</td>
                  <td className="num">{f(c.plage.Tmin)} – {f(c.plage.Tmax)}</td>
                  <td className="num">{f(c.plage.rapportMin)} {c.plage.ok ? "✓ (≥ 0,90)" : "! (< 0,90)"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <References ids={["accelerogrammes_artificiels"]} />
      </section>
      <section className="carte-plate">
        <h2>Moyenne des extrêmes et analyse spectrale multimodale</h2>
        <div className="defile">
          <table className="valeurs table-raideurs">
            <thead>
              <tr>
                <th scope="col">Direction</th>
                <th scope="col">Appui</th>
                <th scope="col">Temporel : moyenne (MN)</th>
                <th scope="col">Temporel : maximum (MN)</th>
                <th scope="col">Multimodale (MN)</th>
                <th scope="col">Écart</th>
                <th scope="col">Déplacement du tablier (cm)</th>
              </tr>
            </thead>
            <tbody>
              {([["x", th.directions.x.ubdp], ["y", th.directions.y.ubdp], ["z", th.directions.z]] as const).flatMap(([d, r]) =>
                r.moyennes.map((x, i) => (
                  <tr key={`${d}-${x.id}`} className={i === 0 ? "debut-groupe" : undefined}>
                    {i === 0 && <th scope="rowgroup" rowSpan={r.moyennes.length}>{NOMS[d]}{d !== "z" ? " UBDP" : ""}</th>}
                    <td>{x.id}</td>
                    <td className="num"><strong>{f(x.F)}</strong></td>
                    <td className="num">{f(x.Fmax)}</td>
                    <td className="num">{f(x.Fspectral)}</td>
                    <td className="num">{x.Fspectral > 1e-6 ? `${f(100 * (x.F / x.Fspectral - 1), 1)} %` : "—"}</td>
                    <td className="num">{d === "z" ? "—" : `${f(100 * x.dTablier, 2)} (${f(100 * x.dSpectral, 2)})`}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className="aide-bloc">
          Valeur de calcul : moyenne, sur le jeu, de l'extrême de chaque accélérogramme (EN 1998-2 4.2.3.1). Efforts divisés par q ; déplacements du calcul
          élastique (entre parenthèses : multimodale spectrale). Les mêmes modes que l'analyse multimodale sont superposés.
        </p>
        <References ids={["calcul_temporel_lineaire"]} />
      </section>
    </div>
  );
}

function Accelerogrammes({ jeu }: { jeu: JeuAccelerogrammes }) {
  const [k, setK] = useState(0);
  const acc = jeu.accelerogrammes[k]!;
  const pas = Math.max(1, Math.round(0.02 / acc.dt));
  const pts: [number, number][] = [];
  for (let i = 0; i < acc.a.length; i += pas) pts.push([i * acc.dt, acc.a[i]!]);
  const P = jeu.periodes.map((T, i) => [T, i] as const).filter(([T]) => T > 0);
  const cible: [number, number][] = P.map(([T]) => [T, valeur(jeu.cible, T)]);
  return (
    <>
      <div className="segments mm-liste-modes" role="group" aria-label="Accélérogramme affiché">
        {jeu.accelerogrammes.map((x, i) => (
          <button key={i} type="button" aria-pressed={i === k} onClick={() => setK(i)}>
            n° {i + 1} · PGA {f(x.pga, 2)} m/s²
          </button>
        ))}
      </div>
      <Courbe series={[{ points: pts, classe: "th-acc" }]} xlabel="temps t (s)" ylabel="accélération du sol üg (m/s²)" hauteur={220} />
      <Courbe
        series={[
          ...jeu.accelerogrammes.map((x) => ({ points: P.map(([T, i]) => [T, x.spectre[i]!] as [number, number]), classe: "th-spectre-un" })),
          { points: P.map(([T]) => [T, 0.9 * valeur(jeu.cible, T)] as [number, number]), classe: "th-spectre-90" },
          { points: cible, classe: "th-spectre-cible" },
          { points: P.map(([T, i]) => [T, jeu.moyenne[i]!] as [number, number]), classe: "th-spectre-moyen" },
        ]}
        xlabel="période T (s), échelle logarithmique"
        ylabel="Sa (m/s²), ξ = 5 %"
        logx
        hauteur={300}
        bande={[jeu.controles.plage.Tmin, jeu.controles.plage.Tmax]}
      />
      <Legende
        items={[
          { classe: "th-spectre-un", nom: "spectre de chaque accélérogramme" },
          { classe: "th-spectre-moyen", nom: "spectre moyen" },
          { classe: "th-spectre-cible", nom: "spectre élastique cible" },
          { classe: "th-spectre-90", nom: "90 % de la cible" },
        ]}
      />
      <p className="aide-bloc">
        Zone colorée : 0,2 T₁ à 2 T₁, où le spectre moyen doit rester au-dessus de 90 % du spectre élastique. Accélérogrammes de {f(acc.a.length * acc.dt, 1)} s :
        montée {f(jeu.options.montee, 0)} s, phase stationnaire {f(jeu.options.stationnaire, 0)} s, décroissance ; pas {f(acc.dt, 3)} s.
      </p>
      <References ids={["accelerogrammes_artificiels"]} />
    </>
  );
}

function PontSousSeisme({ h, direction, projet }: { h: Historique; direction: DirectionMM; projet: Projet }) {
  const [lecture, setLecture] = useState(false);
  const [vitesse, setVitesse] = useState(0.5);
  const [i, setI] = useState(0);
  const [appui, setAppui] = useState(1);
  const W = 900, H = 260, M = 40;
  const L = h.geometrie.xTablier.at(-1) ?? 1;
  const echelle = (W - 2 * M) / L; // px par mètre, à l'échelle du dessin
  const dMax = Math.max(1e-9, ...h.tablier.flat().map(Math.abs), ...h.piles.flat(2).map(Math.abs));
  const [ampli, setAmpli] = useState(() => Math.max(10, Math.round(40 / (dMax * echelle) / 10) * 10));
  const debut = useRef<{ t0: number; i0: number } | null>(null);
  useEffect(() => {
    if (!lecture) return;
    let id = 0;
    debut.current = null;
    const pas = (t: number) => {
      if (!debut.current) debut.current = { t0: t, i0: i };
      const k = Math.floor(debut.current.i0 + ((t - debut.current.t0) / 1000) * vitesse / (h.dt * h.pas));
      if (k >= h.t.length) {
        setLecture(false);
        setI(h.t.length - 1);
        return;
      }
      setI(k);
      id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lecture, vitesse, h]);
  const g = h.geometrie;
  const sx = (x: number) => M + (x / L) * (W - 2 * M);
  const tab = h.tablier[i] ?? [];
  const pil = h.piles[i] ?? [];
  const els: React.ReactNode[] = [];
  if (direction === "x") {
    const hMax = Math.max(1, ...g.piles.map((p) => p.z.at(-1) ?? 1));
    const yT = 60, sol = 230;
    els.push(<line key="sol" x1={M - 20} x2={W - M + 20} y1={sol} y2={sol} className="mm-sol" />);
    const u = ampli * (tab[0] ?? 0) * echelle;
    els.push(<rect key="ref" x={sx(0)} y={yT - 8} width={sx(L) - sx(0)} height={16} className="mm-reference-plein" />);
    els.push(<rect key="tab" x={sx(0) + u} y={yT - 8} width={sx(L) - sx(0)} height={16} className="mm-tablier-plein" />);
    g.piles.forEach((p, k) => {
      const x = sx(p.x), hp = ((p.z.at(-1) ?? 1) / hMax) * (sol - yT - 20);
      const v = pil[k] ?? [];
      els.push(<polyline key={p.id} points={p.z.map((z, j) => `${x + ampli * (v[j] ?? 0) * echelle},${sol - (z / (p.z.at(-1) ?? 1)) * hp}`).join(" ")} className="mm-fut" />);
    });
    g.appuis.forEach((ap) => els.push(<text key={ap.id} x={sx(ap.x)} y={sol + 18} className="mm-etiquette">{ap.id}</text>));
  } else {
    const yc = direction === "z" ? 110 : 120;
    els.push(<polyline key="ref" points={g.xTablier.map((x) => `${sx(x)},${yc}`).join(" ")} className="mm-reference" />);
    const sgn = 1;
    els.push(<polyline key="tab" points={g.xTablier.map((x, j) => `${sx(x)},${yc + sgn * ampli * (tab[j] ?? 0) * echelle}`).join(" ")} className="mm-tablier" />);
    g.appuis.forEach((ap) => {
      const k = g.piles.findIndex((p) => p.id === ap.id);
      const tete = direction === "y" && k >= 0 ? ampli * ((pil[k] ?? []).at(-1) ?? 0) * echelle : 0;
      els.push(<rect key={`s${ap.id}`} x={sx(ap.x) - 7} y={yc + 30 + tete - 7} width={14} height={14} className={ap.type === "culee" ? "mm-culee" : "mm-pile"} />);
      els.push(<text key={ap.id} x={sx(ap.x)} y={yc + 70} className="mm-etiquette">{ap.id}</text>);
    });
  }
  const tCour = h.t[i] ?? 0;
  const acc: [number, number][] = h.t.map((t, k) => [t, h.ag[k]!]);
  const Fa: [number, number][] = h.t.map((t, k) => [t, 1000 * (h.F[appui]?.[k] ?? 0)]);
  return (
    <section className="carte-plate">
      <div className="amplification">
        <button type="button" className="bouton-secondaire" onClick={() => { if (i >= h.t.length - 1) setI(0); setLecture((x) => !x); }} aria-pressed={lecture}>
          {lecture ? "Pause" : "Lecture"}
        </button>
        <label>
          Vitesse
          <select value={vitesse} onChange={(e) => setVitesse(Number(e.target.value))}>
            <option value={0.25}>× 0,25</option>
            <option value={0.5}>× 0,5</option>
            <option value={1}>temps réel</option>
          </select>
        </label>
        <label>
          Temps
          <input type="range" min={0} max={h.t.length - 1} value={i} onChange={(e) => { setLecture(false); setI(Number(e.target.value)); }} />
        </label>
        <label>
          Amplification × {ampli}
          <input type="range" min={10} max={5000} step={10} value={ampli} onChange={(e) => setAmpli(Number(e.target.value))} />
        </label>
      </div>
      <figure className="mm-animation">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Déformée du pont à t = ${f(tCour, 2)} s`}>
          {els}
          <text x={M} y={22} className="mm-legende">
            t = {f(tCour, 2)} s — tablier au droit de {g.appuis[appui]?.id} : {f(100 * (h.d[appui]?.[i] ?? 0), 2)} cm ; effort {f(1000 * (h.F[appui]?.[i] ?? 0), 0)} kN
          </text>
        </svg>
        <figcaption>Le pont sous l'accélérogramme n° 1, déplacements amplifiés {ampli} fois{direction === "y" ? " (vue en plan)" : ""}.</figcaption>
      </figure>
      <Courbe series={[{ points: acc, classe: "th-acc" }]} xlabel="temps t (s)" ylabel="üg (m/s²)" curseur={tCour} hauteur={170} />
      <label className="amplification">
        Effort de liaison à l'appui
        <select value={appui} onChange={(e) => setAppui(Number(e.target.value))}>
          {g.appuis.map((ap, k) => (
            <option key={ap.id} value={k}>{ap.id}</option>
          ))}
        </select>
      </label>
      <Courbe series={[{ points: Fa, classe: "th-effort" }]} xlabel="temps t (s)" ylabel={`F ${g.appuis[appui]?.id} (kN)`} curseur={tCour} hauteur={170} />
      <p className="aide-bloc">
        Le maximum en valeur absolue de cette courbe est l'« extrême » de l'accélérogramme ; la valeur de calcul est la moyenne de ces extrêmes sur les{" "}
        accélérogrammes du jeu. Projet : {projet.nom}.
      </p>
    </section>
  );
}

export function PageTemporel({ projet, a, m, r }: { projet: Projet; a: ActionSismique; m: Modele; r: Analyse }) {
  const [th, setTh] = useState<Temporel | string | null>(null);
  const [vue, setVue] = useState<Vue>("synthese");
  const [d, setD] = useState<DirectionMM>("x");
  const [borne, setBorne] = useState<Borne>("lbdp");
  useEffect(() => {
    setTh(null);
    const id = window.setTimeout(() => {
      try {
        setTh(temporelLineaire(projet, a, m, r));
      } catch (e) {
        setTh(e instanceof Error ? e.message : String(e));
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [projet, a, m, r]);
  const h = useMemo(() => {
    if (!th || typeof th === "string" || vue !== "animation") return null;
    return historique(projet, a, m, d, d === "z" ? "lbdp" : borne, th.jeux[d].accelerogrammes[0]!);
  }, [th, vue, d, borne, projet, a, m]);
  if (th === null) return <p className="aide-bloc">Génération des accélérogrammes et calcul temporel en cours (quelques secondes)…</p>;
  if (typeof th === "string") return <p className="probleme niveau-alerte">Calcul temporel impossible : {th}</p>;
  return (
    <>
      <Onglets<Vue>
        libelle="Parties du calcul temporel"
        prefixe="th"
        actif={vue}
        onChange={setVue}
        onglets={[
          { id: "synthese", titre: "Synthèse" },
          { id: "accelerogrammes", titre: "Accélérogrammes et spectres" },
          { id: "animation", titre: "Le pont sous le séisme" },
          { id: "note", titre: "Note de calcul" },
        ]}
      />
      <Panneau prefixe="th" actif={vue} className="panneau-onglet">
        {vue === "synthese" && <Synthese th={th} />}
        {(vue === "accelerogrammes" || vue === "animation") && (
          <section className="carte-plate">
            <div className="raideurs-entete">
              <Onglets<DirectionMM> libelle="Direction" prefixe="th-dir" actif={d} onChange={setD} onglets={(["x", "y", "z"] as const).map((x) => ({ id: x, titre: NOMS[x] }))} />
              {vue === "animation" && d !== "z" && (
                <div className="segments" role="group" aria-label="Propriétés des élastomères">
                  {(["lbdp", "ubdp"] as const).map((b) => (
                    <button key={b} type="button" aria-pressed={borne === b} onClick={() => setBorne(b)}>{b.toUpperCase()}</button>
                  ))}
                </div>
              )}
            </div>
            <Panneau prefixe="th-dir" actif={d}>
              {vue === "accelerogrammes" && <Accelerogrammes jeu={th.jeux[d]} />}
              {vue === "animation" && h && <PontSousSeisme h={h} direction={d} projet={projet} />}
            </Panneau>
          </section>
        )}
        {vue === "note" && <NoteCalcul sections={th.note} prefixe="note-th" />}
      </Panneau>
    </>
  );
}
