const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

export const formatNombre = (v: number): string => nombreFr.format(v);

/** Nombre au format LaTeX avec virgule décimale sans espace parasite. */
export const nombreTex = (v: number): string => formatNombre(v).replace(",", "{,}").replace(/ | /g, "\\,");

const LIBELLES_CLES: Record<string, string> = {
  zones_2_a_4: "Zones 2 à 4",
  zone_5: "Zone 5",
  beton: "Béton",
  mixte: "Mixte",
  acier: "Acier",
  rapport: "avg / ag",
  TB: "TB (s)",
  TC: "TC (s)",
  TD: "TD (s)",
  TE: "TE (s)",
  TF: "TF (s)",
  vs30: "vs,30 (m/s)",
  NSPT: "NSPT",
  cu: "cu (kPa)",
  routier_trafic_intense: "Pont routier, trafic intense",
  ferroviaire_trafic_intense: "Pont ferroviaire, trafic intense",
  pE: "pE (sismique)",
  pT: "pT (thermique)",
  cas_general: "Cas général",
  faible_action_ou_butees: "Faible action sismique ou butées de sécurité",
  service: "Séisme de service",
  ultime_NF_EN_15129: "Ultime (NF EN 15129)",
  ultime_conseille: "Ultime (conseillé, EN 1998-2)",
  ductile: "Ductile",
  ductilite_limitee: "Ductilité limitée",
  armatures_acier: "Armatures, acier",
  elastomere: "Élastomère",
};

export const libelleCle = (cle: string): string => LIBELLES_CLES[cle] ?? cle;
