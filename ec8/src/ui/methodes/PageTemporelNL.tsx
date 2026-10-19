import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionSismique } from "../../moteur/action.ts";
import type { Borne } from "../../moteur/modele.ts";
import { pushover, type DirectionPO, type Pushover } from "../../moteur/pushover.ts";
import { jeuAccelerogrammes, type JeuAccelerogrammes } from "../../moteur/temporel.ts";
import { enveloppe, historiqueNL, noteTemporelNL, temporelNonLineaire, type HistoriqueNL, type LoiHysteresis, type TemporelNL } from "../../moteur/temporel-nl.ts";
import type { Projet } from "../../projet/types.ts";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { deformee } from "./PagePushover.tsx";
import { Courbe, Legende } from "./PageTemporel.tsx";

const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)) || 0);
/** Valeur finie, « effondrement » (infini) ou « — » (indéfini). */
const fv = (v: number, d = 3) => (Number.isFinite(v) ? f(v, d) : Number.isNaN(v) ? "—" : "effondrement");
const NOMS: Record<DirectionPO, string> = { x: "Longitudinal (X)", y: "Transversal (Y)" };
const LOIS: { id: LoiHysteresis; nom: string }[] = [
  { id: "takeda", nom: "Takeda modifié" },
  { id: "bilineaire", nom: "Bilinéaire" },
];
const LAMBDAS = [1, 1.5, 2, 2.5, 3];
type Vue = "synthese" | "boucles" | "animation" | "note";

function Synthese({ r }: { r: TemporelNL }) {
  const ids = r.calcul.piles.map((q) => q.id);
  return (
    <div className="analyse-synthese">
      <section className="carte-plate">
        <h2>Réponses par accélérogramme</h2>
        <div className="table-defilante">
          <table className="valeurs table-raideurs">
            <thead>
              <tr>
                <th scope="col">Accélérogramme</th>
                <th scope="col">d tablier (cm)</th>
                <th scope="col">d élastique (cm)</th>
                {ids.map((id) => (
                  <th key={id} scope="col">{id} : μ<sub>δ</sub> ; θ<sub>p</sub> (mrad) ; résiduel (cm)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.reponses.map((x, k) => (
                <tr key={x.graine}>
                  <th scope="row">n° {k + 1}</th>
                  <td>{fv(100 * x.Dmax, 2)}</td>
                  <td>{f(100 * x.DmaxLineaire, 2)}</td>
                  {x.piles.map((q) => (
                    <td key={q.id}>{fv(q.mu, 2)} ; {fv(1000 * q.thetaP, 1)} ; {fv(100 * q.residu, 1)}</td>
                  ))}
                </tr>
              ))}
              <tr className="ligne-total">
                <th scope="row">{r.calcul.regle === "moyenne" ? "Moyenne (4.2.4.3)" : "Maximum (4.2.4.3)"}</th>
                <td>{fv(100 * r.calcul.Dmax, 2)}</td>
                <td>{f(100 * r.calcul.DmaxLineaire, 2)}</td>
                {r.calcul.piles.map((q) => (
                  <td key={q.id}>{fv(q.mu, 2)} ; {fv(1000 * q.thetaP, 1)} ; —</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="carte-plate">
        <h2>Vérification des rotules (4.2.4.4(2)c)</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Pile</th>
              <th scope="col">δ max (cm)</th>
              <th scope="col">δ<sub>y</sub> (cm)</th>
              <th scope="col">V max (kN)</th>
              <th scope="col">θ<sub>p,E</sub> (mrad)</th>
              <th scope="col">θ<sub>p,d</sub> (mrad)</th>
              <th scope="col">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {r.calcul.piles.map((q) => {
              const e = r.elements.find((x) => x.id === q.id)!;
              return (
                <tr key={q.id}>
                  <th scope="row">{q.id}</th>
                  <td>{fv(100 * q.deltaMax, 2)}</td>
                  <td>{f(100 * e.deltaY, 2)}</td>
                  <td>{f(1000 * q.Fmax, 0)}</td>
                  <td>{fv(1000 * q.thetaP, 2)}</td>
                  <td>{f(1000 * q.thetaPd, 2)}</td>
                  <td className={q.ok ? undefined : "ecart-relatif"}>{q.thetaP === 0 ? "élastique" : !Number.isFinite(q.thetaP) ? "effondrement" : q.ok ? "vérifié" : "non vérifié"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="aide-bloc">
          Période initiale T₀ = {f(r.T0, 3)} s (fûts fissurés, second ordre compris). Déplacement du tablier : {fv(100 * r.calcul.Dmax, 2)} cm en non linéaire, contre{" "}
          {f(100 * r.calcul.DmaxLineaire, 2)} cm pour l'oscillateur élastique de même raideur initiale et {f(100 * r.po.cible.dT * r.options.lambda, 2)} cm pour le
          déplacement cible de la poussée{r.options.lambda !== 1 ? ` × ${f(r.options.lambda, 2)}` : ""}.
        </p>
        {r.remarques.map((t) => (
          <p key={t} className="aide-bloc">{t}</p>
        ))}
        <References ids={["calcul_temporel_non_lineaire", "capacite_rotation"]} />
      </section>
    </div>
  );
}

function Boucles({ r, h, pile, setPile }: { r: TemporelNL; h: HistoriqueNL; pile: number; setPile: (k: number) => void }) {
  const e = r.elements.filter((x) => x.kb > 0)[pile];
  if (!e) return <p className="aide-bloc">Aucune pile active.</p>;
  const boucle: [number, number][] = h.delta[pile]!.map((d, k) => [100 * d, 1000 * h.F[pile]![k]!]);
  const dm = Math.max(...boucle.map((p) => Math.abs(p[0])), 100 * e.deltaY * 1.2);
  const env: [number, number][] = [];
  for (let k = -60; k <= 60; k++) {
    const d = (dm / 100) * (k / 60);
    env.push([100 * d, 1000 * enveloppe(e.pile, d)]);
  }
  const D: [number, number][] = h.t.map((t, k) => [t, 100 * h.D[k]!]);
  const DL: [number, number][] = h.t.map((t, k) => [t, 100 * h.DLin[k]!]);
  return (
    <section className="carte-plate">
      <label className="amplification">
        Pile
        <select value={pile} onChange={(ev) => setPile(Number(ev.target.value))}>
          {r.elements.filter((x) => x.kb > 0).map((x, k) => (
            <option key={x.id} value={k}>{x.id}</option>
          ))}
        </select>
      </label>
      <h3>Boucles d'hystérésis du fût {e.id} (effort en tête – déplacement de tête)</h3>
      <Courbe series={[{ points: env, classe: "po-bilin" }, { points: boucle, classe: "po-capacite" }]} xlabel="δ tête du fût (cm)" ylabel="V (kN)" xmin={-dm} xmax={dm} hauteur={320} />
      <Legende items={[{ classe: "po-capacite", nom: "réponse au cours du séisme" }, { classe: "po-bilin", nom: "enveloppe monotone (poussée idéalisée)" }]} />
      <h3>Déplacement du tablier au cours du temps</h3>
      <Courbe series={[{ points: DL, classe: "th-spectre-un" }, { points: D, classe: "th-effort" }]} xlabel="temps t (s)" ylabel="d (cm)" hauteur={200} />
      <Legende items={[{ classe: "th-effort", nom: "non linéaire" }, { classe: "th-spectre-un", nom: "élastique, même raideur initiale" }]} />
    </section>
  );
}

function Animation({ r, h, po, projet }: { r: TemporelNL; h: HistoriqueNL; po: Pushover; projet: Projet }) {
  const [i, setI] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [vitesse, setVitesse] = useState(0.5);
  const actifs = r.elements.filter((x) => x.kb > 0);
  const dMax = Math.max(1e-6, ...h.D.map(Math.abs));
  const travees = projet.tablier.travees;
  const Ltot = travees.reduce((s, x) => s + x, 0);
  const W = 900, H = 300, M = 50, sol = 270, yT = 52;
  const utile = W - 2 * M - 140; // réserve de 70 px de chaque côté pour le déplacement du tablier
  const echelle = utile / Ltot;
  const [ampli] = useState(() => Math.max(1, Math.round(60 / (dMax * echelle))));
  const debut = useRef<{ t0: number; i0: number } | null>(null);
  useEffect(() => {
    if (!lecture) return;
    let id = 0;
    debut.current = null;
    const pas = (t: number) => {
      if (!debut.current) debut.current = { t0: t, i0: i };
      const k = Math.floor(debut.current.i0 + (((t - debut.current.t0) / 1000) * vitesse) / (h.t[1]! - h.t[0]!));
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
  const sx = (x: number) => M + 70 + (x / Ltot) * utile;
  const xs = [0];
  for (const t of travees) xs.push(xs.at(-1)! + t);
  const hMax = Math.max(1, ...po.capacites.map((c) => c.L));
  const uT = ampli * (h.D[i] ?? 0) * echelle;
  const els: React.ReactNode[] = [];
  els.push(<line key="sol" x1={M - 20} x2={W - M + 20} y1={sol} y2={sol} className="mm-sol" />);
  els.push(<rect key="ref" x={sx(0)} y={yT - 9} width={sx(Ltot) - sx(0)} height={18} className="mm-reference-plein" />);
  els.push(<rect key="tab" x={sx(0) + uT} y={yT - 9} width={sx(Ltot) - sx(0)} height={18} className="mm-tablier-plein" />);
  projet.appuis.forEach((ap, k) => {
    const x = sx(xs[k] ?? 0);
    if (ap.type === "culee") {
      els.push(<rect key={ap.id} x={x - 14} y={yT + 10} width={28} height={sol - yT - 10} className="mm-culee" />);
      return;
    }
    const j = actifs.findIndex((e) => e.id === ap.id);
    const c = po.capacites.find((q) => q.id === ap.id);
    if (j < 0 || !c) return;
    const d = h.delta[j]![i] ?? 0;
    let dm = 0;
    for (let q = 0; q <= i; q++) dm = Math.max(dm, Math.abs(h.delta[j]![q] ?? 0));
    const e = actifs[j]!;
    const thP = Math.max(0, dm - e.deltaY) / e.L;
    const etat = dm <= e.deltaY ? "elastique" : thP > e.thetaPd ? "depasse" : "plastique";
    const hp = (c.L / hMax) * (sol - yT - 30);
    const pts = deformee(c, Math.abs(d)).map((q) => `${x + Math.sign(d) * ampli * q.u * echelle},${sol - (q.z / c.L) * hp}`);
    els.push(<polyline key={ap.id} points={pts.join(" ")} className="mm-fut" />);
    els.push(<line key={`${ap.id}a`} x1={x + ampli * d * echelle} x2={x + uT} y1={sol - hp} y2={yT + 9} className="po-appareil" />);
    els.push(<circle key={`${ap.id}r`} cx={x} cy={sol - 6} r={7} className={`po-rotule ${etat}`} />);
    els.push(<text key={`${ap.id}t`} x={x} y={sol + 18} className="mm-etiquette">{ap.id}</text>);
    els.push(<text key={`${ap.id}v`} x={x + 16} y={sol - hp / 2} className="mm-legende">{f(1000 * (h.F[j]![i] ?? 0), 0)} kN</text>);
  });
  const e0 = actifs[0];
  const boucle: [number, number][] = e0 ? h.delta[0]!.slice(0, i + 1).map((d, k) => [100 * d, 1000 * h.F[0]![k]!]) : [];
  const dm0 = e0 ? Math.max(...h.delta[0]!.map((d) => 100 * Math.abs(d)), 100 * e0.deltaY * 1.2) : 1;
  return (
    <section className="carte-plate">
      <div className="amplification">
        <button type="button" className="bouton-secondaire" onClick={() => { if (i >= h.t.length - 1) setI(0); setLecture((x) => !x); }} aria-pressed={lecture}>
          {lecture ? "Pause" : "Lecture"}
        </button>
        <label>
          Vitesse
          <select value={vitesse} onChange={(ev) => setVitesse(Number(ev.target.value))}>
            <option value={0.25}>× 0,25</option>
            <option value={0.5}>× 0,5</option>
            <option value={1}>temps réel</option>
          </select>
        </label>
        <label>
          Temps
          <input type="range" min={0} max={h.t.length - 1} value={i} onChange={(ev) => { setLecture(false); setI(Number(ev.target.value)); }} />
        </label>
      </div>
      <figure className="mm-animation">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pont à t = ${f(h.t[i] ?? 0, 2)} s`}>
          {els}
          <text x={M} y={22} className="mm-legende">
            t = {f(h.t[i] ?? 0, 2)} s ; tablier {f(100 * (h.D[i] ?? 0), 2)} cm
          </text>
        </svg>
        <figcaption>Accélérogramme n° 1, action × {f(r.options.lambda, 2)}, déplacements amplifiés {ampli} fois. Rotule : blanche = élastique, orange = plastifiée, rouge = θp &gt; θp,d.</figcaption>
      </figure>
      {e0 && (
        <>
          <h3>Boucle de {e0.id} jusqu'à l'instant t</h3>
          <Courbe series={[{ points: boucle.length > 1 ? boucle : [[0, 0], [0, 0]], classe: "po-capacite" }]} xlabel="δ tête (cm)" ylabel="V (kN)" xmin={-dm0} xmax={dm0} hauteur={240} pastille={boucle.at(-1)} />
        </>
      )}
      <Courbe series={[{ points: h.t.map((t, k) => [t, h.ag[k]!]), classe: "th-acc" }]} xlabel="temps t (s)" ylabel="üg (m/s²)" curseur={h.t[i]} hauteur={150} />
    </section>
  );
}

export function PageTemporelNL({ projet, a }: { projet: Projet; a: ActionSismique }) {
  const [vue, setVue] = useState<Vue>("synthese");
  const [d, setD] = useState<DirectionPO>("x");
  const [loi, setLoi] = useState<LoiHysteresis>("takeda");
  const [borne, setBorne] = useState<Borne>("lbdp");
  const [lambda, setLambda] = useState(1);
  const [pile, setPile] = useState(0);
  const po = useMemo(() => {
    try {
      return pushover(projet, a, d);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [projet, a, d]);
  const [jeu, setJeu] = useState<JeuAccelerogrammes | null>(null);
  useEffect(() => {
    setJeu(null);
    if (typeof po === "string") return;
    const id = window.setTimeout(() => setJeu(jeuAccelerogrammes(d, a.spectres.elastiqueH, po.cible.Teff)), 30);
    return () => window.clearTimeout(id);
  }, [po, a, d]);
  const r = useMemo(() => (jeu && typeof po !== "string" ? temporelNonLineaire(projet, a, d, jeu, { loi, borne, lambda }, po) : null), [jeu, po, projet, a, d, loi, borne, lambda]);
  const h = useMemo(
    () => (jeu && typeof po !== "string" && (vue === "boucles" || vue === "animation") ? historiqueNL(projet, a, d, jeu.accelerogrammes[0]!, { loi, borne, lambda }, po) : null),
    [jeu, po, projet, a, d, loi, borne, lambda, vue],
  );
  if (typeof po === "string") return <p className="probleme niveau-alerte">Calcul impossible : {po}</p>;
  if (!po.capacites.length) return <p className="aide-bloc">Le pont n'a pas de pile : le calcul non linéaire des fûts ne s'applique pas.</p>;
  return (
    <>
      <Onglets<Vue>
        libelle="Parties du calcul temporel non linéaire"
        prefixe="tnl"
        actif={vue}
        onChange={setVue}
        onglets={[
          { id: "synthese", titre: "Synthèse" },
          { id: "boucles", titre: "Boucles d'hystérésis" },
          { id: "animation", titre: "Le pont sous le séisme" },
          { id: "note", titre: "Note de calcul" },
        ]}
      />
      <Panneau prefixe="tnl" actif={vue} className="panneau-onglet">
        <div className="raideurs-entete">
          <Onglets<DirectionPO> libelle="Direction" prefixe="tnl-dir" actif={d} onChange={setD} onglets={(["x", "y"] as const).map((x) => ({ id: x, titre: NOMS[x] }))} />
          <div className="segments" role="group" aria-label="Loi d'hystérésis">
            {LOIS.map((x) => (
              <button key={x.id} type="button" aria-pressed={loi === x.id} onClick={() => setLoi(x.id)}>{x.nom}</button>
            ))}
          </div>
          <div className="segments" role="group" aria-label="Propriétés des élastomères">
            {(["lbdp", "ubdp"] as const).map((b) => (
              <button key={b} type="button" aria-pressed={borne === b} onClick={() => setBorne(b)}>{b.toUpperCase()}</button>
            ))}
          </div>
          <label className="amplification">
            Action ×
            <select value={lambda} onChange={(ev) => setLambda(Number(ev.target.value))}>
              {LAMBDAS.map((x) => (
                <option key={x} value={x}>{f(x, 1)}</option>
              ))}
            </select>
          </label>
        </div>
        {!r ? (
          <p className="aide-bloc">Génération des accélérogrammes et calcul non linéaire en cours…</p>
        ) : (
          <>
            {lambda !== 1 && <p className="aide-bloc">Action multipliée par {f(lambda, 1)} : étude de la réserve au-delà du séisme de calcul, hors vérification réglementaire.</p>}
            {vue === "synthese" && <Synthese r={r} />}
            {vue === "boucles" && h && <Boucles r={r} h={h} pile={pile} setPile={setPile} />}
            {vue === "animation" && h && <Animation key={`${d}${loi}${lambda}${borne}`} r={r} h={h} po={po} projet={projet} />}
            {vue === "note" && <NoteCalcul sections={noteTemporelNL(r)} prefixe="note-tnl" />}
          </>
        )}
      </Panneau>
    </>
  );
}
