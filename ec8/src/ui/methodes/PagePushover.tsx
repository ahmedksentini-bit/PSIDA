import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionSismique } from "../../moteur/action.ts";
import { notePushover, pushover, type CapacitePile, type DirectionPO, type EtatPushover, type Pushover } from "../../moteur/pushover.ts";
import { inerties } from "../../moteur/modele.ts";
import type { Pile, Projet } from "../../projet/types.ts";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { Courbe, Legende } from "./PageTemporel.tsx";

const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)) || 0);
const NOMS: Record<DirectionPO, string> = { x: "Longitudinal (X)", y: "Transversal (Y)" };
type Vue = "synthese" | "animation" | "sections" | "armatures" | "note";

export function etatRotule(e: EtatPushover["piles"][number] | undefined): "elastique" | "plastique" | "depasse" {
  if (!e || !e.plastique) return "elastique";
  return e.rapport > 1 ? "depasse" : "plastique";
}

function CourbeCapacite({ r, D }: { r: Pushover; D?: number }) {
  const pts: [number, number][] = r.etats.map((e) => [100 * e.D, e.V]);
  const parPile = r.capacites.map((c, k) => ({ points: r.etats.map((e) => [100 * e.D, e.piles[k]!.F] as [number, number]), classe: "po-pile", nom: c.id }));
  const reperes = [{ x: 100 * r.cible.dT, texte: `dT = ${f(100 * r.cible.dT, 1)} cm`, classe: "po-cible" }];
  if (r.ultime && r.ultime.D <= (r.etats.at(-1)?.D ?? 0)) reperes.push({ x: 100 * r.ultime.D, texte: `du = ${f(100 * r.ultime.D, 1)} cm`, classe: "po-ultime" });
  const plast = r.evenements.find((e) => e.texte.includes("plastification"));
  if (plast && plast.D <= (r.etats.at(-1)?.D ?? 0)) reperes.push({ x: 100 * plast.D, texte: "1re rotule", classe: "po-plast" });
  const etat = D !== undefined ? r.etats.reduce((b, e) => (Math.abs(e.D - D) < Math.abs(b.D - D) ? e : b), r.etats[0]!) : undefined;
  return (
    <>
      <Courbe
        series={[{ points: pts, classe: "po-capacite" }, ...(r.capacites.length > 1 ? [parPile[0]!] : [])]}
        xlabel="déplacement du tablier D (cm)"
        ylabel="effort tranchant total à la base V (MN)"
        reperes={reperes}
        pastille={etat ? [100 * etat.D, etat.V] : undefined}
        hauteur={280}
      />
      <Legende
        items={[
          { classe: "po-capacite", nom: "courbe de capacité du pont V(D)" },
          ...(r.capacites.length > 1 ? [{ classe: "po-pile", nom: `part d'une pile (${r.capacites[0]!.id})` }] : []),
          { classe: "po-cible", nom: "déplacement cible dT (H.1)" },
          { classe: "po-ultime", nom: "état ultime de calcul du (θp = θp,d)" },
        ]}
      />
    </>
  );
}

function Synthese({ r }: { r: Pushover }) {
  return (
    <div className="analyse-synthese">
      <section className="carte-plate">
        <h2>Courbe de capacité — direction {NOMS[r.direction]}</h2>
        <CourbeCapacite r={r} />
        <p className={`probleme niveau-${r.verifiee ? "ok" : "alerte"}`}>
          {r.ultime
            ? `État ultime de calcul atteint pour D = ${f(100 * r.ultime.D, 2)} cm (rotule de ${r.ultime.pile}), ${r.verifiee ? "au-delà" : "en deçà"} du déplacement cible dT = ${f(100 * r.cible.dT, 2)} cm : ${r.verifiee ? "réserve de déplacement " + f(r.ultime.D / r.cible.dT, 2) + " × dT." : "dimensionnement à reprendre (H.3(2))."}`
            : "Aucune rotule ne peut atteindre sa rotation de calcul (fûts libres par rapport au tablier)."}
        </p>
        {r.remarques.map((t) => (
          <p key={t} className="aide-bloc">{t}</p>
        ))}
      </section>
      <section className="carte-plate">
        <h2>Fûts au déplacement cible</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Pile</th>
              <th scope="col">N par fût (MN)</th>
              <th scope="col">My (MN·m)</th>
              <th scope="col">dy tête (cm)</th>
              <th scope="col">δ tête à dT (cm)</th>
              <th scope="col">θp,E (mrad)</th>
              <th scope="col">θp,d (mrad)</th>
              <th scope="col">État</th>
            </tr>
          </thead>
          <tbody>
            {r.capacites.map((c, k) => {
              const e = r.aCible.piles[k]!;
              const s = etatRotule(e);
              return (
                <tr key={c.id}>
                  <th scope="row">{c.id}</th>
                  <td>{f(c.N, 2)}</td>
                  <td>{f(c.mphi.My, 2)}</td>
                  <td>{f(100 * c.deltaY, 2)}</td>
                  <td>{f(100 * e.delta, 2)}</td>
                  <td>{f(1000 * e.thetaP, 2)}</td>
                  <td>{f(1000 * c.thetaPd, 2)}</td>
                  <td className={s === "depasse" ? "ecart-relatif" : undefined}>{s === "elastique" ? "élastique" : s === "plastique" ? "rotule, vérifiée" : "rotule, non vérifiée"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="carte-plate">
        <h2>Déplacement cible</h2>
        <table className="valeurs table-raideurs">
          <tbody>
            <tr>
              <th scope="row">EN 1998-2 H.1 : multimodale, q = 1, Jeff (annexe C)</th>
              <td>dT = {f(100 * r.cible.dT, 2)} cm ; T = {f(r.cible.Teff, 3)} s</td>
            </tr>
            <tr>
              <th scope="row">EN 1998-1 annexe B (N2), pour comparaison</th>
              <td>
                d*t = {f(100 * r.cible.n2.dt, 2)} cm ; T* = {f(r.cible.n2.Tetoile, 3)} s ; F*y = {f(r.cible.n2.Fy, 2)} MN ; qu = {f(r.cible.n2.qu, 2)}
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Séquence des événements</h3>
        <ol className="mm-liste-modes">
          {r.evenements.filter((e) => e.D <= (r.etats.at(-1)?.D ?? 0)).map((e, i) => (
            <li key={i}>D = {f(100 * e.D, 2)} cm — {e.texte}</li>
          ))}
        </ol>
        <References ids={["poussee_progressive", "rigidite_effective", "capacite_rotation", "deplacement_cible_n2"]} />
      </section>
    </div>
  );
}

/** Déformée d'un fût en console : partie élastique (cubique) + rotation plastique en pied. */
export function deformee(c: CapacitePile, delta: number, n = 16): { z: number; u: number }[] {
  const de = Math.min(delta, c.deltaY);
  const thetaP = delta > c.deltaY ? (delta - c.deltaY) / c.L : 0;
  return Array.from({ length: n + 1 }, (_, j) => {
    const z = (c.L * j) / n;
    return { z, u: (de * (3 * z * z * c.L - z ** 3)) / (2 * c.L ** 3) + thetaP * z };
  });
}

function Animation({ r, projet }: { r: Pushover; projet: Projet }) {
  const Dfin = r.etats.at(-1)!.D;
  const [k, setK] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [ampli, setAmpli] = useState(() => {
    const L = projet.tablier.travees.reduce((x, t) => x + t, 0);
    return Math.max(1, Math.round(70 / (Dfin * (720 / L)))); // ≈ 70 px de déplacement maximal à l'écran
  });
  const debut = useRef<{ t0: number; k0: number } | null>(null);
  useEffect(() => {
    if (!lecture) return;
    let id = 0;
    debut.current = null;
    const pas = (t: number) => {
      if (!debut.current) debut.current = { t0: t, k0: k };
      const kk = Math.floor(debut.current.k0 + (t - debut.current.t0) / 60);
      if (kk >= r.etats.length) {
        setLecture(false);
        setK(r.etats.length - 1);
        return;
      }
      setK(kk);
      id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lecture, r]);
  const e = r.etats[k]!;
  const W = 900, H = 300, M = 50, sol = 270, yT = 52;
  const travees = projet.tablier.travees;
  const Ltot = travees.reduce((s, x) => s + x, 0);
  const utile = W - 2 * M - 80; // réserve à droite pour le déplacement du tablier
  const sx = (x: number) => M + (x / Ltot) * utile;
  const echelle = utile / Ltot;
  const xs = [0];
  for (const t of travees) xs.push(xs.at(-1)! + t);
  const hMax = Math.max(1, ...r.capacites.map((c) => c.L));
  const hp = (L: number) => (L / hMax) * (sol - yT - 30);
  const uT = ampli * e.D * echelle;
  const els: React.ReactNode[] = [];
  els.push(<line key="sol" x1={M - 20} x2={W - M + 20} y1={sol} y2={sol} className="mm-sol" />);
  els.push(<rect key="ref" x={sx(0)} y={yT - 9} width={sx(Ltot) - sx(0)} height={18} className="mm-reference-plein" />);
  els.push(<rect key="tab" x={sx(0) + uT} y={yT - 9} width={sx(Ltot) - sx(0)} height={18} className="mm-tablier-plein" />);
  const arrow = Math.min(80, 18 + 60 * (e.V / Math.max(r.etats.at(-1)!.V, 1e-9)));
  els.push(<line key="fl" x1={sx(0) + uT - 8 - arrow} x2={sx(0) + uT - 10} y1={yT} y2={yT} className="mm-axe" markerEnd="url(#po-fleche)" />);
  projet.appuis.forEach((ap, i) => {
    const x = sx(xs[i] ?? 0);
    if (ap.type === "culee") {
      els.push(<rect key={ap.id} x={x - 14} y={yT + 10} width={28} height={sol - yT - 10} className="mm-culee" />);
    } else {
      const kc = r.capacites.findIndex((c) => c.id === ap.id);
      const c = r.capacites[kc];
      const ep = e.piles[kc];
      if (!c || !ep) return;
      const h = hp(c.L);
      const pts = deformee(c, ep.delta).map((q) => `${x + ampli * q.u * echelle},${sol - (q.z / c.L) * h}`);
      els.push(<polyline key={ap.id} points={pts.join(" ")} className="mm-fut" />);
      const tete = x + ampli * ep.delta * echelle;
      els.push(<line key={`${ap.id}a`} x1={tete} x2={x + uT} y1={sol - h} y2={yT + 9} className="po-appareil" />);
      els.push(<circle key={`${ap.id}r`} cx={x} cy={sol - 6} r={7} className={`po-rotule ${etatRotule(ep)}`} />);
      els.push(<text key={`${ap.id}t`} x={x} y={sol + 18} className="mm-etiquette">{ap.id}</text>);
      els.push(
        <text key={`${ap.id}v`} x={Math.max(tete, x) + 16} y={sol - h / 2} className="mm-legende">
          {f(1000 * ep.F, 0)} kN{ep.plastique ? ` ; θp ${f(1000 * ep.thetaP, 1)} mrad` : ""}
        </text>,
      );
    }
  });
  return (
    <section className="carte-plate">
      <div className="amplification">
        <button type="button" className="bouton-secondaire" onClick={() => { if (k >= r.etats.length - 1) setK(0); setLecture((x) => !x); }} aria-pressed={lecture}>
          {lecture ? "Pause" : "Pousser"}
        </button>
        <label>
          Déplacement imposé
          <input type="range" min={0} max={r.etats.length - 1} value={k} onChange={(ev) => { setLecture(false); setK(Number(ev.target.value)); }} />
        </label>
        <label>
          Amplification × {ampli}
          <input type="range" min={1} max={Math.max(200, 2 * ampli)} value={ampli} onChange={(ev) => setAmpli(Number(ev.target.value))} />
        </label>
      </div>
      <figure className="mm-animation">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pont poussé de ${f(100 * e.D, 1)} cm`}>
          <defs>
            <marker id="po-fleche" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {els}
          <text x={M} y={22} className="mm-legende">
            D = {f(100 * e.D, 2)} cm{e.D >= r.cible.dT ? " (au-delà de dT)" : ""} ; V = {f(e.V, 3)} MN
          </text>
        </svg>
        <figcaption>
          Poussée {r.direction === "x" ? "longitudinale" : "transversale (fûts représentés dans leur plan de flexion)"}, déplacements amplifiés {ampli} fois. Rotule
          en pied : blanche = élastique, orange = plastifiée, rouge = θp &gt; θp,d.
        </figcaption>
      </figure>
      <CourbeCapacite r={r} D={e.D} />
    </section>
  );
}

function Sections({ r }: { r: Pushover }) {
  const [k, setK] = useState(0);
  const c = r.capacites[k];
  if (!c) return <p className="aide-bloc">Aucune pile.</p>;
  const pts: [number, number][] = c.mphi.points.map((p) => [1000 * p.phi, p.M]);
  const bil: [number, number][] = [
    [0, 0],
    [1000 * c.mphi.phiY, c.mphi.My],
    [1000 * c.mphi.ultime.phi, c.mphi.ultime.M],
  ];
  const cap: [number, number][] = c.courbe.map((p) => [100 * p.delta, p.V]);
  return (
    <section className="carte-plate">
      <label className="amplification">
        Pile
        <select value={k} onChange={(e) => setK(Number(e.target.value))}>
          {r.capacites.map((x, i) => (
            <option key={x.id} value={i}>{x.id}</option>
          ))}
        </select>
      </label>
      <h3>Loi moment-courbure d'un fût (N = {f(c.N, 2)} MN)</h3>
      <Courbe
        series={[{ points: pts, classe: "po-capacite" }, { points: bil, classe: "po-bilin" }]}
        xlabel="courbure φ (‰/m)"
        ylabel="M (MN·m)"
        reperes={[{ x: 1000 * c.mphi.phiY, texte: "φy", classe: "po-plast" }, { x: 1000 * c.mphi.ultime.phi, texte: "φu", classe: "po-ultime" }]}
      />
      <Legende items={[{ classe: "po-capacite", nom: "analyse en fibres" }, { classe: "po-bilin", nom: "bilinéaire à aires égales (E.3.2)" }]} />
      <table className="valeurs table-raideurs">
        <tbody>
          <tr><th scope="row">Section</th><td>{c.section.forme === "circulaire" ? `cercle Ø ${f(c.section.h, 2)} m` : `${f(c.section.h, 2)} × ${f(c.section.b, 2)} m (h dans le sens de la poussée)`} ; As = {f(1e4 * c.section.As, 0)} cm² ; d = {f(c.mphi.d, 3)} m</td></tr>
          <tr><th scope="row">Première plastification</th><td>M = {f(c.mphi.premiere.M, 3)} MN·m ; φ = {f(1000 * c.mphi.premiere.phi, 3)} ‰/m</td></tr>
          <tr><th scope="row">Bilinéaire</th><td>My = {f(c.mphi.My, 3)} MN·m ; φy = {f(1000 * c.mphi.phiY, 3)} ‰/m ; φu = {f(1000 * c.mphi.ultime.phi, 2)} ‰/m (limite {c.mphi.ultime.cause === "béton" ? "εcu du béton" : "εsu de l'acier"}) ; ductilité μφ = {f(c.mphi.ultime.phi / c.mphi.phiY, 1)}</td></tr>
          <tr><th scope="row">Résistance de calcul</th><td>MRd = {f(c.MRd, 3)} MN·m ; Jeff = 1,2 MRd/(Ec φy) = {f(c.facteurInertie, 3)} Jbrute</td></tr>
          <tr><th scope="row">Rotule</th><td>Lp = {f(c.Lp, 3)} m ; θy = {f(1000 * c.thetaY, 2)} mrad ; θp,u = {f(1000 * c.thetaPu, 2)} mrad ; θp,d = {f(1000 * c.thetaPd, 2)} mrad{c.alphaS < 3 ? ` (réduite, L/d = ${f(c.alphaS, 2)})` : ""}</td></tr>
        </tbody>
      </table>
      <h3>Courbe effort-déplacement de la pile seule ({c.nFuts} fût{c.nFuts > 1 ? "s" : ""})</h3>
      <Courbe series={[{ points: cap, classe: "po-capacite" }]} xlabel="déplacement en tête δ (cm)" ylabel="V (MN)" reperes={[{ x: 100 * c.deltaY, texte: "δy", classe: "po-plast" }, { x: 100 * c.deltaPd, texte: "δ(θp,d)", classe: "po-ultime" }]} />
      <References ids={["capacite_rotation", "rigidite_effective"]} />
    </section>
  );
}

function Armatures({ projet, modifier }: { projet: Projet; modifier: (f: (p: Projet) => void) => void }) {
  const piles = projet.appuis.map((ap, i) => ({ ap, i })).filter((x): x is { ap: Pile; i: number } => x.ap.type === "pile");
  const champ = (i: number, cle: "As" | "db" | "enrobage" | "rhoW", v: number) =>
    modifier((p) => {
      const ap = p.appuis[i] as Pile;
      const a = ap.armatures ?? { As: Math.round(100 * inerties({ ...ap, facteurInertie: 1 }).aire), db: 25, enrobage: 0.05 }; // 1 % de Ac, en cm²
      ap.armatures = { ...a, [cle]: v };
    });
  return (
    <section className="carte-plate">
      <h2>Armatures des fûts</h2>
      <p className="aide-bloc">
        Armatures longitudinales d'un fût (réparties sur les deux faces d'une section rectangulaire, régulièrement sur le pourtour d'un cercle). Le taux d'armatures
        transversales ρw active le béton confiné de Mander (E.2.1) ; à 0, le béton est non confiné (εcu = 3,5 ‰). Depuis PSIDA, As est repris du ferraillage du fût.
      </p>
      <table className="valeurs po-saisie">
        <thead>
          <tr>
            <th scope="col">Pile</th>
            <th scope="col">As (cm²)</th>
            <th scope="col">Ø barres (mm)</th>
            <th scope="col">Enrobage (m)</th>
            <th scope="col">ρw</th>
          </tr>
        </thead>
        <tbody>
          {piles.map(({ ap, i }) => (
            <tr key={ap.id}>
              <th scope="row">{ap.id}</th>
              <td><input type="number" min={0} step={1} value={ap.armatures?.As ?? ""} placeholder="1 % Ac" onChange={(e) => champ(i, "As", Number(e.target.value))} /></td>
              <td><input type="number" min={6} step={1} value={ap.armatures?.db ?? ""} placeholder="25" onChange={(e) => champ(i, "db", Number(e.target.value))} /></td>
              <td><input type="number" min={0.01} step={0.005} value={ap.armatures?.enrobage ?? ""} placeholder="0,05" onChange={(e) => champ(i, "enrobage", Number(e.target.value))} /></td>
              <td><input type="number" min={0} step={0.001} value={ap.armatures?.rhoW ?? ""} placeholder="0" onChange={(e) => champ(i, "rhoW", Number(e.target.value))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function PagePushover({ projet, a, modifier }: { projet: Projet; a: ActionSismique; modifier: (f: (p: Projet) => void) => void }) {
  const [vue, setVue] = useState<Vue>("synthese");
  const [d, setD] = useState<DirectionPO>("x");
  const res = useMemo(() => {
    try {
      return { x: pushover(projet, a, "x"), y: pushover(projet, a, "y") };
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [projet, a]);
  if (typeof res === "string") return <p className="probleme niveau-alerte">Poussée progressive impossible : {res}</p>;
  if (!res.x.capacites.length) return <p className="aide-bloc">Le pont n'a pas de pile : la poussée progressive ne s'applique pas.</p>;
  const r = res[d];
  return (
    <>
      <Onglets<Vue>
        libelle="Parties de la poussée progressive"
        prefixe="po"
        actif={vue}
        onChange={setVue}
        onglets={[
          { id: "synthese", titre: "Synthèse" },
          { id: "animation", titre: "Le pont poussé" },
          { id: "sections", titre: "Lois des fûts" },
          { id: "armatures", titre: "Armatures" },
          { id: "note", titre: "Note de calcul" },
        ]}
      />
      <Panneau prefixe="po" actif={vue} className="panneau-onglet">
        {vue !== "armatures" && vue !== "note" && (
          <div className="raideurs-entete">
            <Onglets<DirectionPO> libelle="Direction" prefixe="po-dir" actif={d} onChange={setD} onglets={(["x", "y"] as const).map((x) => ({ id: x, titre: NOMS[x] }))} />
          </div>
        )}
        {vue === "synthese" && <Synthese r={r} />}
        {vue === "animation" && <Animation key={d} r={r} projet={projet} />}
        {vue === "sections" && <Sections r={r} />}
        {vue === "armatures" && <Armatures projet={projet} modifier={modifier} />}
        {vue === "note" && <NoteCalcul sections={notePushover([res.x, res.y])} prefixe="note-po" />}
      </Panneau>
    </>
  );
}
