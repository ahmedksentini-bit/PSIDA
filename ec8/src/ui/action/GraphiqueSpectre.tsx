import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatNombre } from "../format.ts";

export interface Serie {
  id: string;
  nom: string;
  /** Rang de couleur catégorielle (1 à 3). */
  rang: 1 | 2 | 3;
  valeur: (T: number) => number;
}

interface Props {
  titre: string;
  /** Nom de la grandeur en ordonnée (ex. « Se »). */
  grandeur: string;
  unite: string;
  series: Serie[];
  /** Périodes remarquables marquées par un trait vertical. */
  reperes: { T: number; nom: string }[];
  Tmax?: number;
  decimales?: number;
}

const L = 720;
const H = 320;
const M = { g: 56, d: 18, h: 18, b: 42 };
const PAS = 0.01;

function graduations(max: number): number[] {
  const brut = max / 5;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * puissance).find((p) => p >= brut) ?? brut;
  const n = Math.ceil(max / pas);
  return Array.from({ length: n + 1 }, (_, i) => i * pas);
}

/** Graphique d'un ou plusieurs spectres : réticule au survol et au clavier, tableau des valeurs en option. */
export function GraphiqueSpectre({ titre, grandeur, unite, series, reperes, Tmax = 4, decimales = 3 }: Props) {
  const id = useId();
  const zone = useRef<SVGSVGElement>(null);
  const [T, setT] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);

  const Ts = useMemo(() => Array.from({ length: Math.round(Tmax / PAS) + 1 }, (_, i) => Math.round(i * PAS * 1e6) / 1e6), [Tmax]);
  const ymaxBrut = Math.max(...series.flatMap((s) => Ts.map((t) => s.valeur(t))).filter(Number.isFinite), 1e-9);
  const yTicks = graduations(ymaxBrut * 1.08);
  const ymax = yTicks.at(-1) ?? ymaxBrut;
  const xTicks = Array.from({ length: Math.round(Tmax / 0.5) + 1 }, (_, i) => i * 0.5);

  const x = (t: number) => M.g + (t / Tmax) * (L - M.g - M.d);
  const y = (v: number) => H - M.b - (v / ymax) * (H - M.h - M.b);
  const chemin = (s: Serie) => {
    const pts = [...new Set([...Ts, ...reperes.map((r) => r.T)])].filter((t) => t <= Tmax).sort((a, b) => a - b);
    return pts.map((t, i) => `${i ? "L" : "M"}${x(t).toFixed(2)},${y(s.valeur(t)).toFixed(2)}`).join("");
  };

  const versT = (e: PointerEvent<SVGSVGElement>) => {
    const r = zone.current?.getBoundingClientRect();
    if (!r) return null;
    const px = ((e.clientX - r.left) / r.width) * L;
    const t = ((px - M.g) / (L - M.g - M.d)) * Tmax;
    return Math.min(Tmax, Math.max(0, Math.round(t / PAS) * PAS));
  };

  const clavier = (e: KeyboardEvent<SVGSVGElement>) => {
    const pas = e.shiftKey ? 0.1 : 0.01;
    if (e.key === "ArrowRight") setT((t) => Math.min(Tmax, Math.round(((t ?? 0) + pas) / PAS) * PAS));
    else if (e.key === "ArrowLeft") setT((t) => Math.max(0, Math.round(((t ?? 0) - pas) / PAS) * PAS));
    else if (e.key === "Escape") setT(null);
    else return;
    e.preventDefault();
  };

  const lignesTableau = [...new Set([0, ...reperes.map((r) => r.T), 0.5, 1, 1.5, 2, 2.5, 3, 4])].filter((t) => t <= Tmax).sort((a, b) => a - b);

  return (
    <figure className="graphique" aria-labelledby={`${id}-titre`}>
      <figcaption id={`${id}-titre`} className="graphique-titre">
        {titre}
      </figcaption>
      {series.length === 1 && <p className="graphique-sous-titre">{series[0]?.nom}</p>}
      {series.length > 1 && (
        <ul className="graphique-legende">
          {series.map((s) => (
            <li key={s.id}>
              <i className={`cle-serie serie-${s.rang}`} /> {s.nom}
            </li>
          ))}
        </ul>
      )}
      <div className="graphique-zone">
        <svg
          ref={zone}
          viewBox={`0 0 ${L} ${H}`}
          role="img"
          aria-label={`${titre}. Utiliser les flèches pour parcourir les périodes.`}
          tabIndex={0}
          onPointerMove={(e) => setT(versT(e))}
          onPointerLeave={() => setT(null)}
          onKeyDown={clavier}
          onBlur={() => setT(null)}
        >
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line className="grille" x1={M.g} x2={L - M.d} y1={y(v)} y2={y(v)} />
              <text className="axe-texte" x={M.g - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
                {formatNombre(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={`x${t}`} className="axe-texte" x={x(t)} y={H - M.b + 18} textAnchor="middle">
              {formatNombre(t)}
            </text>
          ))}
          <line className="axe" x1={M.g} x2={L - M.d} y1={y(0)} y2={y(0)} />
          <text className="axe-titre" x={(M.g + L - M.d) / 2} y={H - 6} textAnchor="middle">
            T (s)
          </text>
          <text className="axe-titre" transform={`translate(14 ${(M.h + H - M.b) / 2}) rotate(-90)`} textAnchor="middle">
            {grandeur} ({unite})
          </text>
          {reperes
            .filter((r) => r.T <= Tmax)
            .map((r) => (
              <g key={r.nom}>
                <line className="repere" x1={x(r.T)} x2={x(r.T)} y1={M.h} y2={y(0)} />
                <text className="repere-texte" x={x(r.T) + 4} y={M.h + 10}>
                  {r.nom}
                </text>
              </g>
            ))}
          {series.map((s) => (
            <path key={s.id} className={`trace serie-${s.rang}`} d={chemin(s)} />
          ))}
          {T !== null && (
            <g>
              <line className="reticule" x1={x(T)} x2={x(T)} y1={M.h} y2={y(0)} />
              {series.map((s) => (
                <circle key={s.id} className={`point serie-${s.rang}`} cx={x(T)} cy={y(s.valeur(T))} r={4.5} />
              ))}
            </g>
          )}
        </svg>
        {T !== null && (
          <div
            className="infobulle"
            style={{ left: `${(x(T) / L) * 100}%`, transform: T > Tmax * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
            role="status"
          >
            <div className="infobulle-T">T = {formatNombre(T)} s</div>
            {series.map((s) => (
              <div key={s.id} className="infobulle-ligne">
                <i className={`cle-serie serie-${s.rang}`} />
                <strong>
                  {formatNombre(Number(s.valeur(T).toFixed(decimales)))} {unite}
                </strong>
                <span>{s.nom}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="bouton-lien" aria-expanded={tableau} onClick={() => setTableau((v) => !v)}>
        {tableau ? "Masquer le tableau des valeurs" : "Afficher le tableau des valeurs"}
      </button>
      {tableau && (
        <div className="defile">
          <table className="valeurs">
            <thead>
              <tr>
                <th scope="col">T (s)</th>
                {series.map((s) => (
                  <th key={s.id} scope="col">
                    {s.nom} ({unite})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignesTableau.map((t) => (
                <tr key={t}>
                  <th scope="row">{formatNombre(t)}</th>
                  {series.map((s) => (
                    <td key={s.id} className="num">
                      {formatNombre(Number(s.valeur(t).toFixed(decimales)))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
