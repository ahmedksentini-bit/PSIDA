// Données d'entrée d'un projet de pont. Unités : m, MPa, t/m³, kN/m.
// Repère du guide Cerema : X longitudinal (axe de l'ouvrage), Y transversal, Z vertical.

import type { Categorie, ClasseSol, Zone } from "../referentiel/nationaux.ts";

export type { Categorie, ClasseSol, Zone };

/** Clés du tableau ψ2,1 du référentiel. */
export type Trafic = "cas_general" | "routier_trafic_intense" | "ferroviaire_trafic_intense";

export type TypeTablier = "dalle_ba" | "dalle_bp" | "poutres" | "caisson" | "mixte";

export interface Site {
  commune: string;
  zone: Zone;
  categorie: Categorie;
  classeSol: ClasseSol;
  /** Coefficient d'amplification topographique. */
  ST: number;
  trafic: Trafic;
}

export interface Materiaux {
  beton: {
    classe: string;
    /** Résistance caractéristique en compression (MPa). */
    fck: number;
    /** Masse volumique (t/m³). */
    masseVolumique: number;
  };
  acier: {
    /** Limite d'élasticité caractéristique (MPa). */
    fyk: number;
    classeDuctilite: "A" | "B" | "C";
  };
}

export interface Tablier {
  type: TypeTablier;
  /** Portées entre axes d'appui successifs (m). */
  travees: number[];
  largeur: number;
  /** Hauteur de la section (m). */
  epaisseur: number;
  /** Aire de la section de béton (m²). */
  aire: number;
  /** Poids des superstructures : revêtement, trottoirs, corniches, dispositifs de retenue (kN/m). */
  superstructures: number;
  /** Longueur du tablier au-delà de l'axe d'appui des culées (m). */
  debordAbout: number;
  /** Charges de trafic réparties, valeur caractéristique sur toute la longueur (kN/m), pour la part ψ2,1. */
  chargeTrafic: number;
  /** Inertie de flexion verticale (axe transversal), m⁴ ; par défaut A·e²/12 (section rectangulaire équivalente). Analyse multimodale. */
  inertieVerticale?: number;
  /** Inertie de flexion transversale (axe vertical), m⁴ ; par défaut A·B²/12. Analyse multimodale. */
  inertieTransversale?: number;
  /**
   * Continuité du tablier : « continu » (défaut) ou « isostatique » — travées indépendantes, joint sur chaque pile,
   * chaque travée sur ses propres appareils (deux rangées par pile, la moitié des appareils de la ligne chacune).
   */
  continuite?: "continu" | "isostatique";
}

export interface AppareilsElastomere {
  type: "elastomere";
  /** Nombre d'appareils sur la ligne d'appui. */
  nombre: number;
  /** Dimension en plan parallèle à l'axe de l'ouvrage (m). */
  a: number;
  /** Dimension en plan transversale (m). */
  b: number;
  /** Nombre de feuillets intermédiaires. */
  nbFeuillets: number;
  /** Épaisseur d'un feuillet intermédiaire (m). */
  ti: number;
  /** Épaisseur de chaque couche extérieure d'élastomère (m). */
  enrobage: number;
  /** Épaisseur d'une frette (m). */
  ts: number;
  /** Épaisseur de chaque plaque extérieure, 0 s'il n'y en a pas (m). */
  plaqueExterieure: number;
  /** Module de cisaillement conventionnel Gg (MPa). */
  Gg: number;
  /** Enrobage latéral des frettes (m) : a' = a − 2c, b' = b − 2c. */
  enrobageLateral: number;
  /** Maintien en place : par frottement seul ou par fixation mécanique (boulonnage, taquets). */
  fixation: "frottement" | "mecanique";
}

export interface AppareilsRigides {
  type: "fixe" | "glissant";
  nombre: number;
  a: number;
  b: number;
  /** Hauteur hors tout (m). */
  hauteur: number;
}

export type LigneAppareils = AppareilsElastomere | AppareilsRigides;

/** Résultats d'un calcul de service (ELS quasi permanent) fournis par l'utilisateur, pour un appui. */
export interface ChargesPermanentes {
  /** Réaction maximale (MN). */
  Nmax: number;
  /** Réaction minimale (MN). */
  Nmin: number;
  /** Rotation maximale du tablier sur l'appui (rad). */
  rotation: number;
}

export interface Butees {
  transversales: boolean;
  longitudinales: boolean;
}

export interface Semelle {
  /** Dimension selon X (m). */
  long: number;
  /** Dimension selon Y (m). */
  trans: number;
  epaisseur: number;
}

export interface Pile {
  type: "pile";
  id: string;
  futs: {
    forme: "rectangulaire" | "circulaire";
    nombre: number;
    /** Dimension selon X : épaisseur, ou diamètre d'un fût circulaire (m). */
    long: number;
    /** Dimension selon Y (m), égale au diamètre pour un fût circulaire. */
    trans: number;
    /** Entraxe des fûts selon Y (m). */
    entraxe: number;
    hauteur: number;
  };
  /** Armatures longitudinales d'un fût, pour l'analyse non linéaire (pushover) : section totale (cm²), diamètre des barres (mm), enrobage (m), taux de confinement ρw. */
  armatures?: { As: number; db: number; enrobage: number; rhoW?: number };
  /** Rapport inertie effective / inertie brute des fûts (rigidité fissurée, EN 1998-2 annexe C) ; 1 par défaut. */
  facteurInertie?: number;
  semelle: Semelle;
  appareils: LigneAppareils;
  butees: Butees;
  chargesPermanentes?: ChargesPermanentes;
  /** Travées indépendantes : recouvrement disponible de chaque côté de l'axe, de l'extrémité de la travée au bord de la tête de pile (m). */
  reposDisponible?: number;
}

export interface Culee {
  type: "culee";
  id: string;
  poteaux: {
    nombre: number;
    /** Côté de la section carrée (m). */
    cote: number;
    /** Entraxe selon Y (m). */
    entraxe: number;
    hauteur: number;
  };
  sommier: {
    long: number;
    haut: number;
    trans: number;
    /** Débord du sommier au-delà du nu des poteaux, côté travée (m). */
    debordAvant: number;
  };
  gardeGreve: {
    hauteur: number;
    epaisseur: number;
    /** Retrait de la face arrière du garde-grève par rapport à l'arrière du sommier (m). */
    retrait: number;
  };
  longrine: { long: number; haut: number; trans: number } | null;
  semelle: Semelle;
  /** Distance de l'axe des poteaux à l'axe d'appui, côté remblai (m). */
  excentrementAppui: number;
  /** Culée supposée infiniment rigide dans chaque direction (sinon raideur des poteaux). */
  rigide: { longitudinal: boolean; transversal: boolean };
  appareils: LigneAppareils;
  butees: Butees;
  chargesPermanentes?: ChargesPermanentes;
}

export type Appui = Pile | Culee;

export interface Comportement {
  /** Coefficient de comportement dans la direction longitudinale. */
  qLongitudinal: number;
  /** Coefficient de comportement dans la direction transversale. */
  qTransversal: number;
  /** Amortissement visqueux équivalent (%). */
  amortissement: number;
  /** Prolonger le plateau des spectres jusqu'à T = 0 (recommandation du guide Cerema). */
  plateauOrigine: boolean;
}

export interface Elastomeres {
  /** Température d'origine (°C). */
  T0: number;
  /** Température minimale de l'air sous abri (°C). */
  Tmin: number;
  /** Facteur de vieillissement λmax,f1. */
  lambdaMaxF1: number;
  /** Facteur de température λmax,f2. */
  lambdaMaxF2: number;
  /** Coefficient de combinaison ψfi. */
  psiFi: number;
  /** Coefficient de fiabilité γIS sur le déplacement sismique (1,5 ; 1,0 sous faible action sismique ou avec butées de sécurité). */
  gammaIS: number;
  /** Coefficient de frottement Kf (0,6 sur béton). */
  Kf: number;
}

/** Déformations de service du tablier, pour les appareils, repos d'appui et joints. */
export interface Service {
  /** Raccourcissement relatif dû au retrait et au fluage (m/m). */
  retraitFluage: number;
  /** Variation de température à prendre pour les appareils d'appui (°C). */
  deltaT: number;
  /** Coefficient de dilatation thermique (1/°C). */
  alpha: number;
}

/** Méthodes dont les efforts par appui peuvent partir vers PSIDA. */
export type MethodeEfforts = "mode_fondamental" | "multimodale" | "temporel_lineaire" | "pont_isole";

export interface OptionsCalcul {
  /** Accélération de la pesanteur pour convertir poids et masses (m/s²). */
  g: number;
  /** Méthode dont les efforts par appui sont exportés vers PSIDA (défaut : mode fondamental). */
  methodeEfforts?: MethodeEfforts;
}

export interface Projet {
  version: 1;
  nom: string;
  description: string;
  site: Site;
  materiaux: Materiaux;
  tablier: Tablier;
  /** Dans l'ordre : culée de début, piles, culée de fin (travées + 1 appuis). */
  appuis: Appui[];
  comportement: Comportement;
  elastomeres: Elastomeres;
  service: Service;
  options: OptionsCalcul;
  /** Isolation sismique (EN 1998-2 chapitre 7) : isolateurs sous toutes les lignes d'appui. */
  isolation?: Isolation;
}

/** Système d'isolation : un type d'isolateur, le nombre par ligne étant celui des appareils d'appui. */
export interface Isolation {
  type: "lrb" | "pendule";
  /** Appareil à noyau de plomb : force caractéristique Q_d = F_0 (MN) et raideur post-élastique K_d = K_p (MN/m) par isolateur. */
  Qd: number;
  Kd: number;
  /** Rapport K_e/K_p (élastique / post-élastique), 10 par défaut. */
  rapportKe: number;
  /** Pendule à friction : rayon de courbure R (m) et coefficient de frottement dynamique μ_d. */
  R: number;
  mu: number;
  /** Capacité de déplacement d_m de chaque isolateur (m). */
  capacite: number;
  /** Coefficients de modification λ_U des propriétés limites supérieures (UBDP), sur K_p et F_0 (annexe J). */
  lambdaKp: number;
  lambdaF0: number;
  /** Coefficient γ_IS (7.6.2(1)P ; AN : 1,5). */
  gammaIS: number;
  /** Déplacement des isolateurs dû aux actions permanentes, au retrait-fluage et à 50 % de la température (m). */
  deplacementPermanent: number;
  /** Le site est à plus de 10 km d'une faille active connue (7.5.3(1)P a). */
  loinFaille: boolean;
}
