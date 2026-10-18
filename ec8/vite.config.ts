import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relative : l'application est servie par PSIDA sous web/ec8/ (onglet « Calcul sismique ») ;
// `npm run build:psida` produit ce dossier.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
