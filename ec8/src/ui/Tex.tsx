import katex from "katex";
import { useMemo } from "react";

interface Props {
  children: string;
  bloc?: boolean;
}

/** Rendu LaTeX via KaTeX ; une formule invalide s'affiche en rouge au lieu de casser la page. */
export function Tex({ children, bloc = false }: Props) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: bloc, throwOnError: false, strict: "ignore" }),
    [children, bloc],
  );
  return bloc ? (
    <div className="tex-bloc" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}
