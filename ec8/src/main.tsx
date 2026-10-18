import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./ui/styles.css";
import { App } from "./ui/App.tsx";

const racine = document.getElementById("root");
if (!racine) throw new Error("Élément #root introuvable");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
