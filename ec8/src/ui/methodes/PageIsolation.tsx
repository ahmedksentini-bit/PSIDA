import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionSismique } from "../../moteur/action.ts";
import type { Analyse } from "../../moteur/analyse.ts";
import { effortIsolateur, historiqueIsole, ISOLATION_DEFAUT, lignes, notePontIsole, PENDULE_DEFAUT, pontIsole, temporelIsole, type DirectionIso, type HistoriqueIsole, type PontIsole, type TemporelIsole } from "../../moteur/isolation.ts";
import { modele } from "../../moteur/modele.ts";
import { jeuAccelerogrammes, type JeuAccelerogrammes } from "../../moteur/temporel.ts";
import type { Isolation, Projet } from "../../projet/types.ts";
import { formatNombre } from "../format.ts";
import { NoteCalcul, References } from "../note/NoteCalcul.tsx";
import { Onglets, Panneau } from "../Onglets.tsx";
import { Courbe, Legende } from "./PageTemporel.tsx";

const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)) || 0);
const NOMS: Record<DirectionIso, string> = { x: "Longitudinal (X)", y: "Transversal (Y)" };
type Vue = "systeme" | "synthese" | "boucle" | "temporel" | "note";

function Champ({ libelle, unite, valeur, pas, facteur = 1, onChange }: { libelle: string; unite: string; valeur: number; pas: number; facteur?: number; onChange: (v: number) => void }) {
  return (
    <label className="iso-champ">
      <span>{libelle}</span>
      <input type="number" step={pas} value={Number((valeur * facteur).toFixed(6))} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v / facteur); }} />
      <span className="iso-unite">{unite}</span>
    </label>
  );
}

function Systeme({ iso, maj, projet }: { iso: Isolation; maj: (f: (i: Isolation) => void) => void; projet: Projet }) {
  const n = projet.appuis.reduce((s, ap) => s + Math.max(1, ap.appareils.nombre), 0);
  return (
    <section className="carte-plate">
      <h2>Système d'isolation</h2>
      <p className="aide-bloc">
        Les isolateurs remplacent les appareils d'appui de toutes les lignes ({n} isolateurs : le nombre par ligne est celui des appareils saisis). Cette variante n'affecte
        que cet onglet ; les autres calculs gardent les appareils du projet.
      </p>
      <div className="segments" role="group" aria-label="Type d'isolateur">
        <button type="button" aria-pressed={iso.type === "lrb"} onClick={() => maj((i) => { i.type = "lrb"; i.lambdaKp = ISOLATION_DEFAUT.lambdaKp; i.lambdaF0 = ISOLATION_DEFAUT.lambdaF0; })}>Élastomère à noyau de plomb (LRB)</button>
        <button type="button" aria-pressed={iso.type === "pendule"} onClick={() => maj((i) => { i.type = "pendule"; Object.assign(i, PENDULE_DEFAUT); })}>Pendule à friction</button>
      </div>
      <div className="iso-grille">
        {iso.type === "lrb" ? (
          <>
            <Champ libelle="Force caractéristique Q_d = F₀" unite="kN" valeur={iso.Qd} facteur={1000} pas={1} onChange={(v) => maj((i) => { i.Qd = v; })} />
            <Champ libelle="Raideur post-élastique K_d = K_p" unite="kN/mm" valeur={iso.Kd} pas={0.01} onChange={(v) => maj((i) => { i.Kd = v; })} />
            <Champ libelle="Rapport K_e / K_p" unite="—" valeur={iso.rapportKe} pas={1} onChange={(v) => maj((i) => { i.rapportKe = v; })} />
          </>
        ) : (
          <>
            <Champ libelle="Rayon de courbure R" unite="m" valeur={iso.R} pas={0.1} onChange={(v) => maj((i) => { i.R = v; })} />
            <Champ libelle="Frottement dynamique μ_d" unite="—" valeur={iso.mu} pas={0.005} onChange={(v) => maj((i) => { i.mu = v; })} />
          </>
        )}
        <Champ libelle="Capacité de déplacement d_m" unite="mm" valeur={iso.capacite} facteur={1000} pas={10} onChange={(v) => maj((i) => { i.capacite = v; })} />
        <Champ libelle="λ_U sur K_p (UBDP)" unite="—" valeur={iso.lambdaKp} pas={0.05} onChange={(v) => maj((i) => { i.lambdaKp = v; })} />
        <Champ libelle="λ_U sur F₀ (UBDP)" unite="—" valeur={iso.lambdaF0} pas={0.05} onChange={(v) => maj((i) => { i.lambdaF0 = v; })} />
        <Champ libelle="γ_IS (AN : 1,5)" unite="—" valeur={iso.gammaIS} pas={0.1} onChange={(v) => maj((i) => { i.gammaIS = v; })} />
        <Champ libelle="Déplacement permanent + retrait + ½ ΔT" unite="mm" valeur={iso.deplacementPermanent} facteur={1000} pas={1} onChange={(v) => maj((i) => { i.deplacementPermanent = v; })} />
      </div>
      <label className="amplification">
        <input type="checkbox" checked={iso.loinFaille} onChange={(e) => maj((i) => { i.loinFaille = e.target.checked; })} /> Site à plus de 10 km d'une faille active connue (7.5.3)
      </label>
      <p className="aide-bloc">
        UBDP = λ_U × propriétés nominales (annexe J : λ_U,fi = 1 + (λ_max,fi − 1) ψ_fi) ; LBDP = propriétés nominales (J.7). Défauts : élastomère à T_min = 0 °C (tableau JJ.2) ;
        pendule en PTFE non lubrifié étanche (tableaux JJ.5 et JJ.6, ψ = 0,9).
      </p>
      <References ids={["isolation_bilineaire", "isolation_variabilite"]} />
    </section>
  );
}

function Synthese({ r, sans }: { r: PontIsole; sans?: { T: number; F: number } }) {
  return (
    <div className="analyse-synthese">
      <section className="carte-plate">
        <h2>Mode fondamental du pont isolé (7.5.4)</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Propriétés</th>
              <th scope="col">d_cd (cm)</th>
              <th scope="col">K_eff (MN/m)</th>
              <th scope="col">T_eff (s)</th>
              <th scope="col">ξ_eff</th>
              <th scope="col">η_eff</th>
              <th scope="col">S_e (m/s²)</th>
              <th scope="col">V_d (kN)</th>
            </tr>
          </thead>
          <tbody>
            {[r.DP, r.LBDP, r.UBDP].map((m) => (
              <tr key={m.ensemble}>
                <th scope="row">{m.ensemble}</th>
                <td>{f(100 * m.dcd, 2)}</td>
                <td>{f(m.Keff, 2)}</td>
                <td>{f(m.Teff, 3)}</td>
                <td>{f(m.xiEff, 3)}</td>
                <td>{f(m.etaEff, 3)}</td>
                <td>{f(m.Se, 3)}</td>
                <td>{f(1000 * m.Vd, 0)}</td>
              </tr>
            ))}
            {sans && (
              <tr className="ligne-total">
                <th scope="row">Sans isolation (projet)</th>
                <td>—</td>
                <td>—</td>
                <td>{f(sans.T, 3)}</td>
                <td>0,05</td>
                <td>1</td>
                <td>—</td>
                <td>{f(1000 * sans.F, 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="aide-bloc">
          Écarts au DP : LBDP {f(100 * r.ecarts.LBDP, 1)} %, UBDP {f(100 * r.ecarts.UBDP, 1)} % ({r.ecarts.analysesDP ? "≤ 15 % : multimodale ou temporel possibles avec les DP" : "> 15 % : analyses UBDP et LBDP"}, 7.5.2.4(4)).
          {sans ? ` Réduction de l'effort total : ${f(sans.F / r.UBDP.Vd, 1)} fois (UBDP).` : ""}
        </p>
        <ul className="iso-conditions">
          {r.conditions.map((c) => (
            <li key={c.id} className={c.ok ? "ok" : "ko"}>{c.ok ? "✓" : "✗"} {c.libelle}</li>
          ))}
        </ul>
        {r.remarques.map((t) => (
          <p key={t} className="aide-bloc">{t}</p>
        ))}
        <References ids={["isolation_mode_fondamental"]} />
      </section>
      <section className="carte-plate">
        <h2>Lignes d'appui : isolateurs et infrastructure (UBDP pour les efforts, LBDP pour les déplacements)</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr>
              <th scope="col">Ligne</th>
              <th scope="col">Isolateurs</th>
              <th scope="col">K infrastructure (MN/m)</th>
              <th scope="col">d isolateur LBDP (cm)</th>
              <th scope="col">Effort par isolateur UBDP (kN)</th>
              <th scope="col">Effort de la ligne UBDP (kN)</th>
              <th scope="col">Tête de pile UBDP (cm)</th>
            </tr>
          </thead>
          <tbody>
            {r.UBDP.lignes.map((l, k) => (
              <tr key={l.id}>
                <th scope="row">{l.id}</th>
                <td>{l.n}</td>
                <td>{l.Ks === Infinity ? "rigide" : f(l.Ks, 1)}</td>
                <td>{f(100 * r.LBDP.lignes[k]!.db, 2)}</td>
                <td>{f(1000 * l.Fb, 1)}</td>
                <td>{f(1000 * l.F, 0)}</td>
                <td>{f(100 * l.ds, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="carte-plate">
        <h2>Vérification des isolateurs</h2>
        <table className="valeurs table-raideurs">
          <tbody>
            <tr>
              <th scope="row">Déplacement total (7.6.2)</th>
              <td>γ_IS d_d + d_perm = {f(100 * r.verif.total, 2)} cm ≤ d_m = {f(100 * r.verif.capacite, 1)} cm : {r.verif.ok ? "vérifié" : "non vérifié"}</td>
            </tr>
            <tr>
              <th scope="row">Capacité de rappel (7.7.1)</th>
              <td>
                ΔF_m = {f(1000 * r.verif.rappel.deltaFm, 0)} kN ≥ δ_w W_d d_rm/d_m = {f(1000 * r.verif.rappel.critereA, 0)} kN ; d_rm = {f(100 * r.verif.rappel.drm, 2)} cm ≤ d_m − δ_d d_d,in = {f(100 * r.verif.rappel.critereB, 2)} cm :{" "}
                {r.verif.rappel.okA && r.verif.rappel.okB ? "vérifié" : "non vérifié"}
              </td>
            </tr>
          </tbody>
        </table>
        <References ids={["isolation_verifications", "isolation_rappel"]} />
      </section>
    </div>
  );
}

function Boucle({ r, projet, iso, d }: { r: PontIsole; projet: Projet; iso: Isolation; d: DirectionIso }) {
  const m = useMemo(() => modele(projet), [projet]);
  const l = lignes(projet, m, iso, "LBDP", d).find((x) => x.type === "pile") ?? lignes(projet, m, iso, "LBDP", d)[0]!;
  const lr = r.LBDP.lignes.find((x) => x.id === l.id)!;
  const pr = l.pr;
  const dd = lr.db;
  const Fmax = effortIsolateur(pr, dd);
  // boucle stabilisée à ±dd
  const boucle: [number, number][] = [
    [-dd, -Fmax], [-dd + 2 * pr.dy, -Fmax + 2 * pr.dy * pr.Ke], [dd, Fmax], [dd - 2 * pr.dy, Fmax - 2 * pr.dy * pr.Ke], [-dd, -Fmax],
  ].map(([x, y]) => [1000 * x!, 1000 * y!] as [number, number]);
  const secante: [number, number][] = [[-1000 * dd, -1000 * Fmax], [1000 * dd, 1000 * Fmax]];
  const ED = 4 * pr.F0 * (dd - pr.dy);
  const it = r.LBDP.iterations;
  return (
    <section className="carte-plate">
      <h3>Boucle d'un isolateur de {l.id} au déplacement de calcul (LBDP)</h3>
      <Courbe series={[{ points: boucle, classe: "po-capacite" }, { points: secante, classe: "po-bilin" }]} xlabel="d isolateur (mm)" ylabel="F (kN)" xmin={-1100 * dd} xmax={1100 * dd} hauteur={300} />
      <Legende items={[{ classe: "po-capacite", nom: "boucle bilinéaire (figure 7.1)" }, { classe: "po-bilin", nom: "raideur effective (sécante)" }]} />
      <table className="valeurs table-raideurs">
        <tbody>
          <tr><th scope="row">Paramètres</th><td>K_e = {f(pr.Ke, 2)} MN/m ; K_p = {f(pr.Kp, 3)} MN/m ; F₀ = {f(1000 * pr.F0, 1)} kN ; d_y = {f(1000 * pr.dy, 2)} mm{iso.type === "pendule" ? ` ; N = ${f(1000 * pr.N, 0)} kN` : ""}</td></tr>
          <tr><th scope="row">Au déplacement d_d = {f(1000 * dd, 1)} mm</th><td>F = F₀ + K_p d_d = {f(1000 * Fmax, 1)} kN ; K_eff,b = F/d_d = {f(Fmax / dd, 3)} MN/m ; E_D = 4 F₀ (d_d − d_y) = {f(1000 * ED, 2)} kJ</td></tr>
        </tbody>
      </table>
      <h3>Itérations sur d_cd (7.5.4(4))</h3>
      <div className="table-defilante">
        <table className="valeurs table-raideurs">
          <thead>
            <tr><th scope="col">n°</th><th scope="col">d supposé (cm)</th><th scope="col">K_eff (MN/m)</th><th scope="col">ξ_eff</th><th scope="col">T_eff (s)</th><th scope="col">d calculé (cm)</th></tr>
          </thead>
          <tbody>
            {it.filter((_, k) => k < 6 || k === it.length - 1).map((x, k) => (
              <tr key={k}><th scope="row">{k < 6 ? k + 1 : it.length}</th><td>{f(100 * x.d, 3)}</td><td>{f(x.Keff, 2)}</td><td>{f(x.xi, 3)}</td><td>{f(x.T, 3)}</td><td>{f(100 * x.dNouveau, 3)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Temporel({ r, th, h, projet }: { r: PontIsole; th: Record<"LBDP" | "UBDP", TemporelIsole> | null; h: HistoriqueIsole | null; projet: Projet }) {
  const [i, setI] = useState(0);
  const [lecture, setLecture] = useState(false);
  const debut = useRef<{ t0: number; i0: number } | null>(null);
  useEffect(() => {
    if (!lecture || !h) return;
    let id = 0;
    debut.current = null;
    const pas = (t: number) => {
      if (!debut.current) debut.current = { t0: t, i0: i };
      const k = Math.floor(debut.current.i0 + ((t - debut.current.t0) / 1000) * 0.5 / (h.t[1]! - h.t[0]!));
      if (k >= h.t.length) { setLecture(false); setI(h.t.length - 1); return; }
      setI(k);
      id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lecture, h]);
  if (!th || !h) return <p className="aide-bloc">Génération des accélérogrammes et calcul temporel en cours…</p>;
  const W = 900, H = 260, M = 50, sol = 235, yT = 60;
  const travees = projet.tablier.travees;
  const Ltot = travees.reduce((s, x) => s + x, 0);
  const utile = W - 2 * M - 140;
  const sx = (x: number) => M + 70 + (x / Ltot) * utile;
  const dMax = Math.max(1e-6, ...h.D.map(Math.abs));
  const ampli = Math.max(1, Math.round(60 / (dMax * (utile / Ltot))));
  const ech = (utile / Ltot) * ampli;
  const xs = [0];
  for (const t of travees) xs.push(xs.at(-1)! + t);
  const u = (h.D[i] ?? 0) * ech;
  const els: React.ReactNode[] = [];
  els.push(<line key="sol" x1={M - 20} x2={W - M + 20} y1={sol} y2={sol} className="mm-sol" />);
  els.push(<rect key="ref" x={sx(0)} y={yT - 9} width={sx(Ltot) - sx(0)} height={18} className="mm-reference-plein" />);
  els.push(<rect key="tab" x={sx(0) + u} y={yT - 9} width={sx(Ltot) - sx(0)} height={18} className="mm-tablier-plein" />);
  projet.appuis.forEach((ap, k) => {
    const x = sx(xs[k] ?? 0);
    const tete = ap.type === "pile" ? ((h.D[i] ?? 0) - (h.db[i] ?? 0)) * ech : 0; // approximation : même rapport pour toutes les piles
    if (ap.type === "pile") els.push(<line key={ap.id} x1={x} y1={sol} x2={x + tete} y2={yT + 34} className="mm-fut" />);
    else els.push(<rect key={ap.id} x={x - 14} y={yT + 34} width={28} height={sol - yT - 34} className="mm-culee" />);
    // isolateur cisaillé (parallélogramme)
    const b = x + tete, hI = 25;
    els.push(<polygon key={`${ap.id}i`} points={`${b - 9},${yT + 34} ${b + 9},${yT + 34} ${x + u + 9},${yT + 9} ${x + u - 9},${yT + 9}`} className="iso-isolateur" />);
    els.push(<text key={`${ap.id}t`} x={x} y={sol + 18} className="mm-etiquette">{ap.id}</text>);
    void hI;
  });
  const boucle: [number, number][] = h.db.slice(0, i + 1).map((d, k) => [1000 * d, 1000 * h.Fb[k]!]);
  const dm = Math.max(...h.db.map((d) => 1000 * Math.abs(d)), 1);
  return (
    <>
      <section className="carte-plate">
        <h2>Contrôle par le calcul temporel non linéaire (7.5.6)</h2>
        <table className="valeurs table-raideurs">
          <thead>
            <tr><th scope="col">Propriétés</th><th scope="col">d moyen temporel (cm)</th><th scope="col">d mode fondamental (cm)</th><th scope="col">ρ_d</th><th scope="col">V moyen (kN)</th><th scope="col">V mode fondamental (kN)</th><th scope="col">ρ_v</th></tr>
          </thead>
          <tbody>
            {(["LBDP", "UBDP"] as const).map((e) => (
              <tr key={e}>
                <th scope="row">{e}</th>
                <td>{f(100 * th[e].ddm, 2)}</td>
                <td>{f(100 * r[e].dcd, 2)}</td>
                <td className={th[e].rhoD < 0.8 ? "ecart-relatif" : undefined}>{f(th[e].rhoD, 2)}</td>
                <td>{f(1000 * th[e].Vdm, 0)}</td>
                <td>{f(1000 * r[e].Vd, 0)}</td>
                <td className={th[e].rhoV < 0.8 ? "ecart-relatif" : undefined}>{f(th[e].rhoV, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="aide-bloc">
          7.5.5(6) appliqué au temporel (7.5.6(3)) : ρ_d = d_d,m / d_d,f ≥ 0,80 et ρ_v = V_d,m / V_d,f ≥ 0,80 ; sinon, effets multipliés par 0,80/ρ (7.5.5(7)).
          {th.LBDP.correctionD > 1 || th.UBDP.correctionV > 1 ? ` Correction : déplacements × ${f(th.LBDP.correctionD, 2)}, efforts × ${f(th.UBDP.correctionV, 2)}.` : " Aucune correction nécessaire."}
          {" "}Oscillateur à tablier rigide, isolateurs bilinéaires en série avec les piles, 5 % d'amortissement visqueux sur la raideur post-élastique, 7 accélérogrammes artificiels.
        </p>
        <References ids={["isolation_temporel"]} />
      </section>
      <section className="carte-plate">
        <div className="amplification">
          <button type="button" className="bouton-secondaire" onClick={() => { if (i >= h.t.length - 1) setI(0); setLecture((x) => !x); }} aria-pressed={lecture}>{lecture ? "Pause" : "Lecture"}</button>
          <label>Temps <input type="range" min={0} max={h.t.length - 1} value={i} onChange={(e) => { setLecture(false); setI(Number(e.target.value)); }} /></label>
        </div>
        <figure className="mm-animation">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pont isolé à t = ${f(h.t[i] ?? 0, 2)} s`}>
            {els}
            <text x={M} y={22} className="mm-legende">t = {f(h.t[i] ?? 0, 2)} s ; tablier {f(100 * (h.D[i] ?? 0), 2)} cm ; effort total {f(1000 * (h.V[i] ?? 0), 0)} kN</text>
          </svg>
          <figcaption>Accélérogramme n° 1 (LBDP), déplacements amplifiés {ampli} fois : le tablier glisse sur les isolateurs, les piles bougent à peine.</figcaption>
        </figure>
        <Courbe series={[{ points: boucle.length > 1 ? boucle : [[0, 0], [0, 0]], classe: "po-capacite" }]} xlabel="d isolateur de la pile (mm)" ylabel="F (kN)" xmin={-dm} xmax={dm} hauteur={240} pastille={boucle.at(-1)} />
        <Courbe series={[{ points: h.t.map((t, k) => [t, h.ag[k]!]), classe: "th-acc" }]} xlabel="temps t (s)" ylabel="üg (m/s²)" curseur={h.t[i]} hauteur={140} />
      </section>
    </>
  );
}

export function PageIsolation({ projet, a, r, modifier }: { projet: Projet; a: ActionSismique; r: Analyse; modifier: (f: (p: Projet) => void) => void }) {
  const [vue, setVue] = useState<Vue>("systeme");
  const [d, setD] = useState<DirectionIso>("x");
  const iso = projet.isolation;
  const maj = (fn: (i: Isolation) => void) => modifier((p) => { if (!p.isolation) p.isolation = structuredClone(ISOLATION_DEFAUT); fn(p.isolation); });
  const res = useMemo(() => {
    if (!iso) return null;
    try {
      const rd = r.directions[d].ubdp;
      return pontIsole(projet, a, iso, d, { T: rd.T, F: rd.F, d: rd.dE });
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [projet, a, iso, d, r]);
  const [jeu, setJeu] = useState<JeuAccelerogrammes | null>(null);
  useEffect(() => {
    setJeu(null);
    if (!res || typeof res === "string" || vue !== "temporel") return;
    const id = window.setTimeout(() => setJeu(jeuAccelerogrammes(d, a.spectres.elastiqueH, res.LBDP.Teff)), 30);
    return () => window.clearTimeout(id);
  }, [res, vue, d, a]);
  const th = useMemo(() => (jeu && iso && res && typeof res !== "string" ? { LBDP: temporelIsole(projet, a, iso, "LBDP", d, jeu, res.LBDP), UBDP: temporelIsole(projet, a, iso, "UBDP", d, jeu, res.UBDP) } : null), [jeu, iso, res, projet, a, d]);
  const h = useMemo(() => (jeu && iso ? historiqueIsole(projet, iso, "LBDP", d, jeu.accelerogrammes[0]!) : null), [jeu, iso, projet, d]);
  if (!iso)
    return (
      <section className="carte-plate">
        <h2>Pont à isolation sismique (EN 1998-2 chapitre 7)</h2>
        <p className="aide-bloc">
          Des isolateurs (appareils à noyau de plomb ou pendules à friction) remplacent les appareils d'appui : la période s'allonge, l'amortissement augmente, les efforts
          transmis aux piles diminuent au prix de déplacements plus grands. Les élastomères frettés simples du projet relèvent déjà du cas particulier 7.5.1(3) (analyse linéaire,
          ξ = 5 %).
        </p>
        <button type="button" className="bouton-secondaire" onClick={() => maj(() => {})}>Étudier une variante isolée</button>
      </section>
    );
  return (
    <>
      <Onglets<Vue>
        libelle="Parties du pont isolé"
        prefixe="iso"
        actif={vue}
        onChange={setVue}
        onglets={[
          { id: "systeme", titre: "Système d'isolation" },
          { id: "synthese", titre: "Mode fondamental" },
          { id: "boucle", titre: "Boucle et itérations" },
          { id: "temporel", titre: "Contrôle temporel" },
          { id: "note", titre: "Note de calcul" },
        ]}
      />
      <Panneau prefixe="iso" actif={vue} className="panneau-onglet">
        {vue !== "systeme" && (
          <div className="raideurs-entete">
            <Onglets<DirectionIso> libelle="Direction" prefixe="iso-dir" actif={d} onChange={setD} onglets={(["x", "y"] as const).map((x) => ({ id: x, titre: NOMS[x] }))} />
          </div>
        )}
        {vue === "systeme" && <Systeme iso={iso} maj={maj} projet={projet} />}
        {typeof res === "string" && <p className="probleme niveau-alerte">Calcul impossible : {res}</p>}
        {res && typeof res !== "string" && (
          <>
            {vue === "synthese" && <Synthese r={res} sans={res.sansIsolation} />}
            {vue === "boucle" && <Boucle r={res} projet={projet} iso={iso} d={d} />}
            {vue === "temporel" && <Temporel key={d} r={res} th={th} h={h} projet={projet} />}
            {vue === "note" && <NoteCalcul sections={notePontIsole(iso, res)} prefixe="note-iso" />}
          </>
        )}
      </Panneau>
    </>
  );
}
