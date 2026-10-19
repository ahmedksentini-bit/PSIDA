import { useEffect, useMemo, useRef, useState } from "react";
import type { ModeCalcule, ReponseDirectionMM } from "../../moteur/multimodal.ts";
import { formatNombre } from "../format.ts";

const f = (v: number, d = 3) => formatNombre(Number(v.toFixed(d)) || 0);

const W = 900;
const MARGE = 40;

/** Déformée d'un mode, animée (sin ωt) ou figée à son amplitude maximale. Vue en élévation (X, Z) ou en plan (Y). */
export function AnimationMode({ rep, mode, largeur, hauteurs }: { rep: ReponseDirectionMM; mode: ModeCalcule; largeur: number; hauteurs: Record<string, number> }) {
  const reduit = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [lecture, setLecture] = useState(!reduit);
  const [ampli, setAmpli] = useState(40);
  const [phase, setPhase] = useState(1);
  const debut = useRef<number | null>(null);

  useEffect(() => {
    if (!lecture) {
      setPhase(1);
      return;
    }
    let id = 0;
    const pas = (t: number) => {
      if (debut.current === null) debut.current = t;
      setPhase(Math.sin((2 * Math.PI * (t - debut.current)) / 1600));
      id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
  }, [lecture]);

  const g = rep.geometrie;
  const L = g.xTablier.at(-1) ?? 1;
  const sx = (x: number) => MARGE + (x / L) * (W - 2 * MARGE);
  const hMax = Math.max(1, ...Object.values(hauteurs));
  const dir = rep.direction;
  const H = dir === "y" ? 300 : dir === "z" ? 220 : 300;
  const yTablier = dir === "z" ? 110 : 70;
  const sh = (h: number) => (dir === "x" ? 40 + (h / hMax) * 150 : 0);
  const a = ampli * phase;
  const forme = mode.forme;

  const contenu = useMemo(() => {
    const els: React.ReactNode[] = [];
    if (dir === "z") {
      const pts = g.xTablier.map((x, i) => `${sx(x)},${yTablier + a * (forme.tablier[i] ?? 0)}`).join(" ");
      els.push(<polyline key="ref" points={g.xTablier.map((x) => `${sx(x)},${yTablier}`).join(" ")} className="mm-reference" />);
      els.push(<polyline key="tab" points={pts} className="mm-tablier" />);
      g.appuis.forEach((ap) => {
        const x = sx(ap.x);
        els.push(<polygon key={`t${ap.id}`} points={`${x},${yTablier + 6} ${x - 9},${yTablier + 22} ${x + 9},${yTablier + 22}`} className={ap.type === "culee" ? "mm-culee" : "mm-pile"} />);
        els.push(<text key={`l${ap.id}`} x={x} y={yTablier + 40} className="mm-etiquette">{ap.id}</text>);
      });
    } else if (dir === "x") {
      const sol = yTablier + 12 + sh(hMax) + 4;
      els.push(<line key="sol" x1={MARGE - 20} x2={W - MARGE + 20} y1={sol} y2={sol} className="mm-sol" />);
      const u = a * (forme.tablier[0] ?? 0);
      els.push(<rect key="ref" x={sx(0)} y={yTablier - 8} width={sx(L) - sx(0)} height={16} className="mm-reference-plein" />);
      els.push(<rect key="tab" x={sx(0) + u} y={yTablier - 8} width={sx(L) - sx(0)} height={16} className="mm-tablier-plein" />);
      g.appuis.forEach((ap) => {
        const x = sx(ap.x);
        if (ap.type === "culee") {
          els.push(<rect key={`c${ap.id}`} x={x - (ap.x === 0 ? 34 : 0)} y={yTablier + 10} width={34} height={sol - yTablier - 10} className="mm-culee" />);
        }
        els.push(<text key={`l${ap.id}`} x={x} y={sol + 18} className="mm-etiquette">{ap.id}</text>);
      });
      g.piles.forEach((pl, k) => {
        const x = sx(pl.x);
        const h = pl.z.at(-1) ?? 1;
        const hp = sh(hauteurs[pl.id] ?? h);
        const vals = forme.piles[k] ?? [];
        const pts = pl.z.map((z, i) => `${x + a * (vals[i] ?? 0)},${sol - (z / h) * hp}`).join(" ");
        els.push(<line key={`r${pl.id}`} x1={x} x2={x} y1={sol} y2={sol - hp} className="mm-reference" />);
        els.push(<polyline key={`p${pl.id}`} points={pts} className="mm-fut" />);
        const top = a * (vals.at(-1) ?? 0);
        els.push(<rect key={`a${pl.id}`} x={x + (top + u) / 2 - 7} y={sol - hp - 6} width={14} height={6} className="mm-appareil" />);
      });
    } else {
      // Vue en plan : tablier (bande) déformé transversalement, têtes d'appui (carrés) sous le tablier.
      const yc = H / 2;
      const demi = 30;
      const bord = (dy: number) => g.xTablier.map((x, i) => `${sx(x)},${yc + dy + a * (forme.tablier[i] ?? 0)}`);
      els.push(<polygon key="ref" points={`${sx(0)},${yc - demi} ${sx(L)},${yc - demi} ${sx(L)},${yc + demi} ${sx(0)},${yc + demi}`} className="mm-reference-plein" />);
      g.appuis.forEach((ap) => {
        const x = sx(ap.x);
        const k = g.piles.findIndex((pl) => pl.id === ap.id);
        const iT = g.xTablier.findIndex((xx) => Math.abs(xx - ap.x) < 1e-6);
        const tete = k >= 0 ? a * (forme.piles[k]?.at(-1) ?? 0) : a * ap.teteCulee * (forme.tablier[iT] ?? 0);
        els.push(<rect key={`s${ap.id}`} x={x - 9} y={yc + tete - 9} width={18} height={18} className={ap.type === "culee" ? "mm-culee" : "mm-pile"} />);
        els.push(<text key={`l${ap.id}`} x={x} y={H - 18} className="mm-etiquette">{ap.id}</text>);
      });
      els.push(<polygon key="tab" points={[...bord(-demi), ...bord(demi).reverse()].join(" ")} className="mm-tablier-plein" />);
      els.push(<polyline key="axe" points={bord(0).join(" ")} className="mm-axe" />);
      els.push(<text key="leg" x={MARGE} y={22} className="mm-legende">Vue en plan (largeur {f(largeur, 2)} m dilatée) ; carrés : têtes des piles et des culées, sous le tablier</text>);
    }
    return els;
  }, [a, dir, forme, g, hMax, hauteurs, largeur, H, L]);

  return (
    <figure className="mm-animation">
      <div className="amplification">
        <button type="button" className="bouton-secondaire" onClick={() => setLecture((x) => !x)} aria-pressed={lecture}>
          {lecture ? "Pause" : "Lecture"}
        </button>
        <label>
          Amplitude du tracé
          <input type="range" min={5} max={90} value={ampli} onChange={(e) => setAmpli(Number(e.target.value))} />
        </label>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Déformée du mode ${mode.numero}, période ${f(mode.T)} s`}>
        {contenu}
      </svg>
      <figcaption>
        Mode {mode.numero} — T = {f(mode.T)} s, masse effective {f(100 * mode.part, 1)} % ({f(mode.masseEffective, 1)} t). Animation ralentie : un cycle en 1,6 s
        quelle que soit la période ; amplitude arbitraire (un mode propre n'a pas d'amplitude propre).{dir === "x" ? " Hauteurs des piles dilatées." : ""}
      </figcaption>
    </figure>
  );
}
