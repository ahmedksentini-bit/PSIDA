// Logigramme du choix de la méthode d'analyse (EN 1998-2 4.2 et chapitre 7).

type Boite = { x: number; y: number; w: number; h: number; lignes: string[]; type: "question" | "methode" | "complement" | "debut" };

const BOITES: Record<string, Boite> = {
  debut: { x: 380, y: 10, w: 240, h: 40, lignes: ["Pont à étudier (q, appuis, appareils)"], type: "debut" },
  iso: { x: 380, y: 80, w: 240, h: 54, lignes: ["Isolateurs sismiques ?", "(appareils spéciaux, ch. 7)"], type: "question" },
  ch7: { x: 700, y: 74, w: 260, h: 66, lignes: ["Méthodes du chapitre 7 :", "mode fondamental isolé (7.5.4),", "multimodale (7.5.5), temporel (7.5.6)"], type: "methode" },
  dom: { x: 350, y: 170, w: 300, h: 80, lignes: ["Domaine du mode fondamental ? (4.2.2.2)", "tablier continu à peu près rectiligne,", "masse des piles < 20 % du tablier,", "excentricité e₀ ≤ 5 % L"], type: "question" },
  mono: { x: 60, y: 290, w: 260, h: 54, lignes: ["Mode fondamental (4.2.2)", "tablier rigide ou souple, pile isolée"], type: "methode" },
  multi: { x: 550, y: 290, w: 250, h: 54, lignes: ["Analyse multimodale (4.2.1)", "modes jusqu'à 90 % de la masse"], type: "methode" },
  acc: { x: 830, y: 280, w: 164, h: 74, lignes: ["Accélérogrammes", "imposés ?", "→ temporel linéaire", "(4.2.3)"], type: "complement" },
  duct: { x: 370, y: 390, w: 260, h: 54, lignes: ["Comportement ductile ?", "q > 1,5 (rotules plastiques)"], type: "question" },
  push: { x: 60, y: 480, w: 300, h: 66, lignes: ["En plus : poussée progressive", "(4.2.5, annexe H) ; temporel non linéaire", "(4.2.4) si pont irrégulier ou important"], type: "complement" },
  fin: { x: 600, y: 480, w: 340, h: 66, lignes: ["Ductilité limitée (q ≤ 1,5) :", "l'analyse linéaire suffit ;", "vérifications des appareils, piles, fondations"], type: "methode" },
};

const centre = (b: Boite) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 });

function Fleche({ d, texte, tx, ty }: { d: string; texte?: string; tx?: number; ty?: number }) {
  return (
    <g>
      <path d={d} className="choix-fleche" markerEnd="url(#choix-pointe)" />
      {texte && <text x={tx} y={ty} className="choix-oui-non">{texte}</text>}
    </g>
  );
}

export function SchemaChoix() {
  const b = BOITES;
  return (
    <svg viewBox="0 0 1000 556" className="schema-choix" role="img" aria-label="Logigramme du choix de la méthode d'analyse sismique">
      <defs>
        <marker id="choix-pointe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="choix-pointe" />
        </marker>
      </defs>
      <Fleche d="M500,50 L500,78" />
      <Fleche d="M620,107 L698,107" texte="oui" tx={645} ty={100} />
      <Fleche d="M500,134 L500,168" texte="non" tx={508} ty={156} />
      <Fleche d="M350,210 L190,210 L190,288" texte="oui" tx={230} ty={202} />
      <Fleche d="M650,210 L675,210 L675,288" texte="non" tx={680} ty={240} />
      <Fleche d="M800,317 L828,317" texte="ou" tx={806} ty={309} />
      <Fleche d="M190,344 L190,365 L470,365 L470,388" />
      <Fleche d="M675,344 L675,365 L530,365 L530,388" />
      <Fleche d="M370,417 L210,417 L210,478" texte="oui" tx={250} ty={409} />
      <Fleche d="M630,417 L770,417 L770,478" texte="non" tx={690} ty={409} />
      {Object.entries(b).map(([id, x]) => {
        const { cx } = centre(x);
        return (
          <g key={id}>
            <rect x={x.x} y={x.y} width={x.w} height={x.h} rx={x.type === "question" ? 22 : 6} className={`choix-${x.type}`} />
            {x.lignes.map((l, i) => (
              <text key={i} x={cx} y={x.y + x.h / 2 + (i - (x.lignes.length - 1) / 2) * 15 + 4} className={i === 0 ? "choix-titre" : "choix-texte"}>
                {l}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
