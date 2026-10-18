import { ACTION } from "./action.ts";
import { APPUIS } from "./appuis.ts";
import { COMBINAISONS } from "./combinaisons.ts";
import { COMPORTEMENT } from "./comportement.ts";
import { MODELE } from "./modele.ts";
import { NATIONAUX } from "./nationaux.ts";
import type { EntreeReferentiel } from "./types.ts";
import { VERIFICATIONS } from "./verifications.ts";

export { SOURCES } from "./sources.ts";
export * from "./types.ts";

export const REFERENTIEL: EntreeReferentiel[] = [
  ...NATIONAUX,
  ...ACTION,
  ...COMPORTEMENT,
  ...MODELE,
  ...COMBINAISONS,
  ...APPUIS,
  ...VERIFICATIONS,
];
