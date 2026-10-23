// Point d'entrée du moteur de Pont EC8 pour PSIDA (paquet src/vendor/pont-ec8.js, `npm run build:engine`) :
// calcul complet, note structurée (sections, formules LaTeX, références au référentiel) et export des efforts.
export { lireProjet } from "../src/projet/stockage.ts";
export { valider } from "../src/projet/validation.ts";
export { actionSismique } from "../src/moteur/action.ts";
export { modele } from "../src/moteur/modele.ts";
export { analyse, methodeRetenue } from "../src/moteur/analyse.ts";
export { multimodale } from "../src/moteur/multimodal.ts";
export { verifierAppuis } from "../src/moteur/verif-appuis.ts";
export { exporterEfforts } from "../src/moteur/export-efforts.ts";
export { REFERENTIEL } from "../src/referentiel/index.ts";
export { SOURCES } from "../src/referentiel/sources.ts";
export { valeur as spectreValeur, echantillonner as echantillonnerSpectre, deplacement as spectreDeplacement } from "../src/moteur/spectres.ts";
