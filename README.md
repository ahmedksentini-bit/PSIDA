# PontDalle — calcul manuel assisté des ponts-dalles

Outil ouvert pour **recalculer « à la main » (de façon reproductible) un pont-dalle** en béton armé
du type PSI-DA, sans se limiter aux notes de calcul automatiques (PSIDA.EL du SETRA, CHAMOA-P du
Cerema), et pour **comparer ses résultats à ces notes**.

Deux référentiels de charges sont traités en parallèle :

- **Eurocodes** — EN 1991-2 (LM1 TS + UDL, LM2, trottoirs, groupes gr1a / gr1b / gr3), coefficients α
  recommandés (pays sans annexe nationale) ou annexe française (classes 1 et 2) ;
- **Fascicule 61 titre II** — A(l), Bc, Bt, Mc120, D240, trottoirs, majoration dynamique δ.

Le moteur est en JavaScript pur (modules ES), **sans dépendance ni étape de build** : il tourne sous
Node pour les tests et dans le navigateur pour l'interface. Le dépôt se déploie tel quel sur
Cloudflare Pages depuis GitHub. Les graphiques utilisent Plotly (MIT, embarqué dans `web/vendor/`,
donc utilisable hors ligne) pour les courbes, et du SVG natif pour les schémas.

**Benchmark** : l'exemple du chapitre 4 du guide technique CHAMOA-PSIDA (Cerema) est reproduit à
10⁻³ près pour les charges permanentes, la travée équivalente, le gradient thermique et les tassements, à 1–2 %
pour le moment de calcul LM1 par mètre à l'appui (facteur KTRANS compris) et les aciers de flexion, et exactement
pour les moments transversaux « dans la direction des aciers » de l'annexe 12A du BPEL (biais 80 gr) — voir
`test/chamoa.test.js`, `test/skew.test.js` et `docs/hypotheses.md`. Pour le référentiel Fascicule 61 / BAEL, la note
de calcul commentée **PSIDA.EL** du SETRA (version 84-1) est reproduite à 0,1–0,5 % pour les lignes d'influence, les
dénivellations d'appui, la travée équivalente, les coefficients de répartition, A(l), Bc/Bt, Mc120 en travée, les
combinaisons ELS/ELU et la section d'acier sur appui (`test/psidael.test.js`, `docs/hypotheses.md` § 1 quater). Sont aussi
reproduits la 2e note PSIDA.EL du guide PSI-PAP, la note modèle PSIDP.EL (hors précontrainte), les formules de PSI-DA 68,
la répartition PONTYPE/PAP du Pont de Noé et les règles du guide 1989 relues page par page (§ 1 quinquies).

**Note de calcul** : au format des notes SETRA (plan de la note commentée PSIDA.EL pour le Fascicule 61 / BAEL, de CHAMOA
pour les Eurocodes) — données, lignes d'influence, dénivellations, majoration dynamique, coefficients de répartition, moments
par section, positions des charges, efforts tranchants, réactions, flexion transversale, ferraillage, appareils d'appui,
chevêtres et nomenclature, avec commentaires — en HTML imprimable ou en document Word (.docx), depuis le bouton « Note de calcul ».

**Aide à la conception** : les règles du guide SETRA *Ponts-dalles – guide de conception* (1989) — domaine
d'emploi, **abaques d'épaisseur numérisés** (PSI.DA à 1, 2, 3 et 4 travées, pages 65–67 ; plateaux PSI.DP pages 59–61),
élancements, travure, biais, coupe transversale, abouts, descente de charges, points de vigilance — sont codées dans
`src/conception.js` / `src/abaques1989.js` et affichées en tête des résultats, avec des variantes de travure et une
recherche automatique de l'épaisseur minimale vérifiée (Eurocodes).

## Contenu

```
index.html          interface
web/app.js          logique de l'interface (formulaire, cas de charge, rendu)
web/svg.js          schémas SVG : élévation, coupe transversale avec les charges du cas affiché
web/plots.js        graphiques Plotly : enveloppes M/V/R, K(y), m_x(y), facteur f(y), lignes d'influence, surface m_x(x,y), A_s(x), m_y(y)
web/report.js       note de calcul HTML imprimable (graphiques en PNG)
web/schema.js       schémas « ce que vous saisissez » (élévation, coupe, plan) et aide contextuelle des champs
web/vendor/         plotly.min.js (2.35.2, MIT)
src/linalg.js       Gauss, Gauss-Legendre
src/beam.js         poutre continue : lignes d'influence M, V, R ; enveloppes UDL / travées entières / convois
src/guyon.js        Guyon-Massonnet recalculé (plaque isotrope, ν = 0) : K, μ, m_y multi-harmoniques
src/loads_ec.js     EN 1991-2 : voies conventionnelles, LM1, LM2, LM4, α, ψ
src/loads_f61.js    Fascicule 61 : classes, voies, A(l), Bc, Bt, Br, Mc120, D240, δ
src/analysis.js     orchestration : SlabDeck (permanent, eurocode, fascicule61, thermal, settlements)
src/combinations.js combinaisons EC0-A2 (formules CHAMOA) et BAEL / Fasc. 61
src/section_ec2.js  sections EC2 : ELU, ELS, wk 7.3.4, minimums, V_Rd,c, poinçonnement, chanfreins
src/section_bael.js sections BAEL 91 : ELU, ELS, minimums, τu, poinçonnement
src/design.js       ferraillage longitudinal et transversal, enveloppes, tranchant, poinçonnement
src/transverse.js   flexion transversale m_y(y) par travée (dalle isostatique équivalente, Fourier)
src/skew.js         biais : biais mécanique (SETRA 1989), moments dans les directions d'aciers (annexe 12A BPEL / CHAMOA, Wood-Armer)
src/bearings.js     appareils d'appui en élastomère fretté : règles du guide § 3.6 (BT4), gamme standard, freinage EN 1991-2, rotations
src/vehicles.js     véhicules généralisés : engins de chantier (profil provisoire, dyn 1,5) et convois LM3 (annexe A, incertitude 1,1, dyn annexe nationale)
src/zonage.js       zonage du ferraillage : chevêtres incorporés, extensions, bords libres, angles, abouts (guide § 3.4.4–3.4.8)
src/cantilever.js   encorbellements : moments d'encastrement (poids propre, superstructures, trottoir, TS/LM2/UDL diffusés) et aciers
src/fatigue.js      fatigue des armatures : FLM3, λ_s (EN 1992-2 annexe NN), section fissurée
src/rebar.js        plan de ferraillage : choix φ/e, épure décalée, filantes + renforts, ancrages, recouvrements, transversaux, cadres, épingles, métré
web/rebarplan.js    dessins du plan de ferraillage (coupe longitudinale, coupes transversales), nomenclature, A_s mis en place / requis
src/supports/       appuis et fondations : section N-M (section_nm), efforts horizontaux et combinaisons (actions), fûts et
                    chevêtres (pier, beam1d), culées (abutment), semelles et pieux (foundation), chaîne complète (index)
src/beams/          ponts à poutres : Guyon-Massonnet poutres + hourdis, efforts par poutre, poutres BA / BP, réactions par ligne
src/geotech/         modules géotechniques du dépôt « fondation » (F62-V, NF P 94-261/262)
src/vendor/pont-ec8.mjs moteur sismique de Pont EC8 (dépôt « ouvpara », EN 1998-2)
src/ec8export.js    projet Pont EC8 construit depuis PSIDA (export JSON et calcul intégré)
web/supports_view.js tableaux « Appuis et fondations » (interface, rapport, note de calcul)
src/conception.js   aide à la conception : règles du guide SETRA 1989, variantes de travure, recherche de l'épaisseur minimale vérifiée
src/abaques1989.js  abaques d'épaisseur du guide SETRA 1989 numérisés (PSI.DA p. 65–67 ; plateaux PSI.DP p. 59–61)
tools/abaques1989/  script de numérisation (suivi de courbes sur les pages scannées) et données brutes
examples/psida3.js  exemple PSIDA 3 travées 14-18-14 m (node examples/psida3.js)
test/               tests unitaires (npm test)
docs/hypotheses.md  hypothèses de modélisation, protocole de comparaison, références
```

## Utilisation

```bash
npm test                    # tests unitaires (node ≥ 18, aucune installation)
node examples/psida3.js     # exemple complet, sortie texte
npm run serve               # http://localhost:8080 (ou n'importe quel serveur statique)
```

Dans le code :

```js
import { SlabDeck } from './src/analysis.js';
const deck = new SlabDeck({ spans: [14, 18, 14], width: 12, h: 0.7, roadway: { y1: -5, y2: 5 },
  footways: [{ y1: -6, y2: -5 }, { y1: 5, y2: 6 }],
  lines: [{ g: 5, e: -5.9 }, { g: 5, e: 5.9 }], bands: [{ q: 2.6, y1: -5, y2: 5 }] });
const perm = deck.permanent();               // M, V, R, m_x(y) sous charges permanentes
const ec   = deck.eurocode();                // TS, UDL, gr1a, gr1b, gr3 (caractéristiques)
const f61  = deck.fascicule61({ nRetenue: 2 }); // A, Bc, Bt, Mc120, D240, trottoir (δ inclus)
```

Chaque résultat de cas de charge contient, par section de calcul (tous les L/20) : `Mmax/Mmin`
(moment de la poutre entière), `Vmax/Vmin`, `Rmax/Rmin` (réactions) et `mxMax/mxMin[section][y]`
(moment longitudinal **par mètre de largeur** après répartition transversale).

## Méthode (résumé)

1. **Flexion longitudinale** — poutre continue à EI constant, méthode des rotations ; lignes
   d'influence sur 100 positions par travée ; enveloppes par intégration des zones défavorables
   (UDL Eurocode), par travées entières avec intensité fonction de la longueur chargée (A(l)) ou par
   glissement de convois dans les deux sens (TS, Bc, Bt, Mc120, D240).
2. **Répartition transversale** — Guyon-Massonnet pour dalle isotrope (α = 1, ν = 0) ; au lieu des
   tables, résolution exacte de `D(Y'''' − 2k²Y'' + k⁴Y) = p δ(y−e)` avec bords libres, d'où
   `K(y) = 2b·k⁴·Y(y)` (la flèche moyenne égale celle de la poutre équivalente, propriété exacte pour ν = 0),
   `θ = b/L_eq`. Moments transversaux par séries de Fourier (jusqu'à 25–60 harmoniques).
3. **Composition** — `m_x(y) = Σ_files K̄_file(y) · M_file / 2b`, chaque file de charge (voie, roue,
   chenille) étant positionnée indépendamment dans le sens longitudinal.

Les hypothèses détaillées et les points à confronter aux notes CHAMOA / PSIDA sont dans
[docs/hypotheses.md](docs/hypotheses.md) ; la méthode complète, avec les formules à refaire à la main, est dans [docs/methode.md](docs/methode.md).

## Dalle précontrainte — module PSI-DP (`src/psidp/`, onglet « Précontrainte »)

Précontrainte longitudinale par post-tension d'un pont-dalle continu, d'après le dossier pilote SETRA PSI-DP et la note modèle
PSIDP-EL 84-1, règles BPEL 91 révisé 99 (classe II) ; charges du Fascicule 61 titre II du modèle PSIDA.
- Tracé du câble moyen par paraboles (automatique ou saisi), rayon minimal et continuité contrôlés.
- Pertes : frottement, recul d'ancrage, raccourcissement élastique, relaxation, retrait, fluage réajusté par itérations.
- P1 / P2, moments et réactions hyperstatiques (méthode des forces) pour les trois phases (mise en tension, mise en service,
  service définitif).
- Contraintes en classe II avec section d'enrobage, aciers passifs (peau, 1,5 ‰ sur appuis, non-fragilité), ELU de flexion
  par équilibre de la section, effort tranchant (ELS, bielles, armatures d'âme), flexion transversale due à la
  précontrainte, flèches et contre-flèches, zones d'about (BPEL annexe 4). Tracé recherché (excentricités et points bas
  optimisés) et nombre d'unités minimal trouvés automatiquement (départ au prédimensionnement de l'annexe 1).
- Calage : `test/psidp.test.js` reproduit la note modèle (13,50-17,61-17,61-13,50 m, 18 × 12T13) à 0,3 % près sur les
  tensions, au dixième de t·m sur les moments hyperstatiques, et M_lim ELU sur appui à 0,1 %.

## Appareils d'appui et tête d'appui (`src/supports/bearings1337.js`, `src/supports/pierhead.js`)

- Appareils en élastomère fretté vérifiés selon la NF EN 1337-3 (présentation du guide Sétra de juillet 2007) pour l'appareil le plus chargé de chaque ligne : distorsion, déformation totale, flambement, stabilité en rotation (y compris sous charge minimale), frettes, non-glissement, contrainte minimale ; appareil de la gamme standard proposé si la vérification échoue.
- Tête d'appui : pression localisée sous les appareils (BAEL A.8.4 ou EN 1992-1-1 § 6.7), frettage, partie de voile en console (BAEL annexe E.6).
- Dalle précontrainte : les réactions hyperstatiques de précontrainte et le raccourcissement (élastique, fluage, retrait) du calcul PSI-DP passent aux appuis.
- Contrôle sur une note d'appuis réelle (pont-dalle précontraint) : `test/bearings1337.test.js`.
- Compléments : gradient thermique dans les réactions des appareils, fiche minimale des pieux par état limite, voile d'épaisseur variable, pile de joint (pile double), excentricités du second ordre dans les pieux (option).

## Calcul sismique — Pont EC8 intégré (`ec8/`, `web/ec8/`)

L'application Pont EC8 (dépôt ouvpara) est intégrée en entier : sources dans `ec8/` (React + TypeScript, tests du moteur dans `ec8/tests`), version compilée servie par l'onglet « Calcul sismique » dans `web/ec8/` (site statique, aucune compilation au déploiement).

- **PSIDA → Pont EC8 :** « Envoyer le projet PSIDA » charge le projet issu du dernier calcul (`src/ec8export.js`).
- **Pont EC8 → PSIDA :** à chaque modification, l'onglet renvoie les efforts par appui (`ec8/src/ui/psida.ts`, postMessage). « Appuis et fondations » les retient quand la source « onglet Calcul sismique » est choisie. Le nombre de lignes d'appui et les travées sont contrôlés.
- **Note de calcul globale :** elle contient les chapitres Appuis et fondations, Piles en rivière, Calcul sismique (note complète de Pont EC8 : formules en LaTeX, références au paragraphe près, synthèse des vérifications ; `web/seismic_note.js`) et Dispositifs de retenue. Les formules sont rendues par KaTeX (`web/vendor/katex`) en HTML, et en texte dans la note Word.
- **Recompiler après une modification de `ec8/src` :**
  - application : `cd ec8 && npm install && npm run build:psida` ;
  - moteur utilisé pour le calcul automatique et la note (`src/vendor/pont-ec8.js`) : `cd ec8 && npm run build:engine` (entrée `ec8/psida/moteur.ts`), puis rétablir l'en-tête de provenance.

## Déploiement (GitHub → Cloudflare Pages)

1. Pousser le dépôt sur GitHub.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → choisir le dépôt.
3. Build command : *(vide)* ; Build output directory : `/` (racine). Aucune étape de build.
4. Chaque `git push` redéploie. Un sous-domaine personnalisé se règle dans l'onglet *Custom domains*.

## Interface

Formulaire à gauche (bouton « Charger l'exemple CHAMOA-PSIDA » pour le cas de référence ; chaque champ porte une infobulle
et une liste d'aide détaille les données), résultats à droite. Depuis la v0.37, une donnée par ligne : libellé à gauche,
champ dans une colonne alignée à droite, intertitres par thème ; les données à plusieurs valeurs se saisissent valeur par
valeur (`web/fields.js`) — nombre de travées et une case par portée, une case par pile, tableaux « + Ajouter / × » pour les
trottoirs et les charges de superstructure, sondage par ligne d'appui, cases à cocher des piles en eau — et les champs sans
objet sont masqués (pieux si fondations superficielles, voile ou colonnes selon le type de pile…). Les noms et formats des
données (`spans = "14, 18, 14"`…) sont inchangés : liens partagés, notes et tests restent compatibles.
Depuis la v0.38 : appareils d'appui imposés sur les culées et sur les piles (onglet Conception, désignation a×b×n(t+ts)),
vérifiés par le prédimensionnement puis par la NF EN 1337-3 et conservés même s'ils ne passent pas ; lignes d'appui
désignées partout C0, P1…, Cn ; virgule décimale acceptée dans les éditeurs de valeurs.
Depuis la v0.39 : semelles superficielles — tassement de Ménard sous charges quasi permanentes (s_c + s_d, tranches E₁…E₉,₁₆,
E_d, λ_c, λ_d) et rotation θ = M_qp/K_θ, ferraillage par la méthode des consoles (section S₁ à 0,35 b) quand les bielles
ne s'appliquent pas, tableau de détail bielles / consoles / minimum ; pieux — détail de la portance du pieu isolé (F62 :
p*_le, k_p, q_u, courbes Q1–Q7, Q_pu, Q_su, Q_u, Q_c ; NF P 94-262 : D_ef, k_p, f_sol, α, q_s, γ_R;d1 γ_R;d2, R_c;d, R_c;cr;d).
Depuis la v0.40 : second ordre EC2 (courbure nominale) des fûts en situation sismique ou accidentelle avec γ_s = 1,0 et
γ_c = 1,2 (ε_yd = f_yk/E_s) ; commentaire des souplesses des lignes d'appui précisé (rotation des semelles comptée).
Depuis la v0.41 : ouverture des fissures EC2 § 7.3.4 — le coefficient α_e de l'expression (7.9) vaut E_s/E_cm (5,87 pour un
C35/45) et non plus le coefficient d'équivalence de l'ELS (15) ; seule la colonne w_k des aciers longitudinaux change.
Depuis la v0.42 : plan de ferraillage — l'épure décalée de a_l = d interpole les bornes x ± a_l (le pas des sections,
0,9 m, dépassait a_l = 0,65 m et rendait le décalage sans effet) et les arrêts de barres partent de l'abscisse interpolée où
les aciers requis franchissent la section des filantes ; le contrôle « mis en place ≥ requis » porte aussi sur l'épure décalée.
Depuis la v0.43 : phase de chantier et convoi LM3 — l'ELS fréquent retient aussi le cas du gradient thermique dominant,
G + 0,6 T (EN 1990 A2), en plus de G + ψ₁ Q + 0,5 T ; seule la colonne w_k peut changer.
Depuis la v0.44 : boutons « Ouvrir » et « Enregistrer » à côté de « Calculer » (raccourcis Ctrl+O et Ctrl+S). Le projet est
un fichier .json qui contient toutes les données de tous les onglets et, s'il y en a, les efforts reçus de l'onglet Calcul
sismique ; à l'ouverture, les champs absents d'un fichier plus ancien prennent leur valeur par défaut et le calcul est relancé.
Le lien partageable conserve désormais toutes les cases à cocher (frottement négatif, séisme, phase de chantier…).
Depuis la v0.45 : miniatures de schémas de principe dans le formulaire (repères, biais, appareil d'appui, tête d'appui,
encorbellement, épure d'arrêt des barres, nappe inférieure, et six schémas de pieux : groupe, inclinaison, procédés,
modèle de Winkler, frottement négatif, bielles) ; un clic les agrandit (flèches pour passer d'un schéma à l'autre,
Échap pour fermer). Dans les notes d'appuis, les deux schémas d'un appui sont tracés à la même échelle et alignés en bas.
Le contrôle de l'entraxe des pieux dans une file utilise la longueur réelle de la semelle (longueur du voile + 1 m aux piles).
Depuis la v0.46 : onglet « Méthodes » du calcul sismique (Pont EC8). « Choisir la méthode » : logigramme, tableau des méthodes
de l'EN 1998-2 et recommandation pour le projet. « Analyse multimodale » (EN 1998-2 § 4.2.1) : modèle poutres et ressorts par
direction (tablier, fûts en consoles à masse répartie, appareils, culées ; appuis indéformables en Z), modes propres (Cholesky +
Jacobi), masses effectives jusqu'à 90 %, combinaison SRSS ou CQC (éq. 4.6 à 4.9), efforts en tête et en pied d'appui, réactions
verticales, comparaison au mode fondamental et déformées animées. Les efforts transmis aux appuis peuvent venir de l'une ou
l'autre méthode ; la note sismique compare toujours les deux. L'inertie de la section du tablier est transmise à Pont EC8.
Depuis la v0.47 : « Temporel linéaire » (EN 1998-2 § 4.2.3) dans l'onglet Méthodes : 7 accélérogrammes artificiels par direction
ajustés au spectre élastique (EN 1998-1 § 3.2.3.1.2, contrôles affichés, graine fixe), superposition des modes de la multimodale
avec intégration exacte (Nigam et Jennings), moyenne des extrêmes comparée à l'analyse spectrale, et animation du pont sous le
séisme avec l'accélérogramme et l'effort d'un appui au cours du temps.
Depuis la v0.48 : « Poussée progressive » (EN 1998-2 § 4.2.5 et annexe H) dans l'onglet Méthodes : loi moment-courbure des
fûts en fibres (matériaux probables et béton confiné de l'annexe E, bilinéaire à aires égales), rotule plastique L_p et capacité
de rotation θ_p,d (E.16b à E.21, γ_R,p = 1,40), second ordre, rigidité effective (annexe C), déplacement cible par la
multimodale à q = 1 (H.1) et par la méthode N2 (EN 1998-1 annexe B) pour comparaison, animation du pont poussé avec l'état des
rotules. Les armatures des fûts calculées par PSIDA sont transmises à Pont EC8.
Depuis la v0.49 : « Temporel non linéaire » (EN 1998-2 § 4.2.4) dans l'onglet Méthodes : tablier indéformable à un degré de
liberté par direction, fûts non linéaires (courbe de la poussée, second ordre compris) en série avec les appareils, lois
d'hystérésis de Takeda modifiée ou bilinéaire, différences centrales, 7 accélérogrammes artificiels et moyenne des réponses
(§ 4.2.4.3), vérification θ_p,E ≤ θ_p,d, déplacements résiduels, multiplicateur de l'action pour étudier la réserve et
détection de l'effondrement ; boucles d'hystérésis et animation du pont sous le séisme.
Depuis la v0.50 : « Pont isolé » (EN 1998-2 chapitre 7) dans l'onglet Méthodes : variante à isolateurs (élastomère à noyau de
plomb ou pendule à friction) sous toutes les lignes d'appui, loi bilinéaire (7.5.2.3), mode fondamental à rigidité et
amortissement effectifs avec itérations sur d_cd (7.5.4, tableau 7.1), rigidité composée avec les piles (7.11), propriétés
DP / LBDP / UBDP (7.5.2.4, annexe J) et règle des 15 %, vérification des isolateurs à γ_IS d_d (7.6.2, AN : 1,5), capacité de
rappel (7.7.1), comparaison au pont non isolé et contrôle temporel non linéaire avec les rapports ρ_d, ρ_v ≥ 0,80 (7.5.5(6),
7.5.6) ; boucle, itérations et animation du tablier sur ses isolateurs.
Depuis la v0.51 : schémas des fondations tracés à partir des résultats du projet, dans l'onglet Appuis et la note
(`web/fond_plans.js`) : découpage de Ménard en 16 tranches de B/2 avec le regroupement des modules et les tassements,
bulbe des contraintes de Boussinesq (formule de Newmark) sous la semelle la plus tassée, plans de ferraillage de la semelle
superficielle (coupe, vue en plan, nomenclature ; bielles ou section S₁ des consoles), d'un pieu (élévation, ancrage dans la
semelle, moments du modèle de Winkler, coupe) et de la semelle sur deux files de pieux (bandes de tirants, retours d'ancrage).
Les barres sont proposées par PSIDA pour couvrir les sections calculées et restent à reprendre sur les plans d'exécution.
Depuis la v0.52 : aciers des chevêtres incorporés (guide PSIDP-EL annexe 4) dans le plan de ferraillage (repères numérotés après ceux de la dalle courante, v0.52.1) — barres parallèles
à la ligne d'appui par bande (①, ②, ③ en face supérieure ; ①', ②' en face inférieure), en complément des transversaux
courants, avec repères dans la nomenclature et tracé sur les coupes sur appui ; bandeau « résultats périmés » dès qu'une donnée
change après un calcul, ou que l'onglet « Calcul sismique » envoie des efforts différents de ceux du dernier calcul, avec un
bouton de relance.
v0.52.2 : chevêtres incorporés lus sur le texte de l'annexe 4 (§ 6.2.1 et 6.2.2) : les sections des bandes sont des minimums
« au moins », en enveloppe avec le ferraillage courant en travée (et non en cumul) ; seul le complément aux transversaux
courants parallèles à la ligne d'appui est placé, intercalé au même espacement.
Depuis la v0.53 : l'onglet « Calcul sismique » transmet aux appuis les efforts de la méthode choisie (mode fondamental,
multimodale, temporel linéaire ou pont isolé) et, pour les fondations seules, les effets de l'EN 1998-2 5.8.2 (A_Ed × q en
ductilité limitée et pour un pont isolé, dimensionnement en capacité des piles γ0 M_Rd au-delà, plafonné à q·A_Ed) ; la note
des appuis donne la méthode et le passage V_E → V par appui. v0.53.1 : appareils en élastomère (EN 1998-2 5.3(8)P),
V_b = 1,3 K_b d_b pour les culées et min(V_C ; V_b) pour les piles.

- **Ce que vous saisissez** — en direct, avant tout calcul : résumé en clair des données (travure, dalle, voies EN 1991-2 et
  classe Fascicule 61 déduites de la chaussée, charges permanentes et leur total, biais, matériaux, appareils d'appui) et
  schémas cotés : élévation (travées, appuis C0/P1…, abouts, h, hauteur libre, point fixe), coupe transversale (chanfreins,
  chaussée et voies, trottoirs, charges linéiques et surfaciques, enrobage, appareils d'appui, ordonnées de calcul) et vue en
  plan (biais ψ, lignes d'appui, direction des aciers).
0. **Aide à la conception** (guide SETRA 1989, bouton « Aide à la conception seule » pour l'obtenir en une fraction de
   seconde sans lancer le calcul complet) — domaine d'emploi et type de dalle (§ 1.2), épaisseur lue sur les abaques
   du guide (h(ℓ, θℓ) pour 1–4 travées en BA, B25 × 0,87/0,81 pour B30/B35, graphique avec le point du projet ; plateaux
   BP) et par l'élancement (1/20, 1/26, 1/28 ; 1/22–1/33 en BP), travure (rapports de rive
   0,5–0,85, décroissance vers les culées, nombre d'or), biais (biais mécanique, validité de Guyon-Massonnet, direction des
   fers, minimum transversal 1,3 n ‰), coupe transversale (largeur, grande largeur, encorbellements, dévers), abouts
   (0,1 + 15 D), descente de charges (t/m², t/m) et quantités indicatives (béton, aciers en kg/m³). Variantes de travure
   à 1–5 travées pour la même longueur (bouton « Adopter ») et recherche de l'épaisseur minimale vérifiée : la chaîne
   Eurocodes complète est relancée de 2 cm en 2 cm (pratique CHAMOA) jusqu'à satisfaire x/d, σc, taux d'armatures,
   V_Rd,max et poinçonnement. Après le calcul complet : prédimensionnement des appareils d'appui en élastomère fretté
   par ligne d'appui (réactions ELS caractéristiques, distorsion lente et freinage, rotation, plus petit appareil de la
   gamme standard NF T 47.815 du guide § 3.6).
1. **Modèle** — élévation (portées, appuis, abouts, sections clés, L_eq, θ) et coupe transversale avec les
   charges du cas sélectionné (roues TS, files Bc/Bt, chenilles Mc120, bande D240, voies, trottoirs).
2. **Enveloppes longitudinales** — M(x), V(x) de la poutre entière (permanent + cas de trafic, légende
   cliquable, survol des valeurs) et réactions ; option « convention CHAMOA » (moment + = fibre supérieure tendue).
3. **Répartition transversale** — famille K(y) de Guyon-Massonnet par travée, m_x(y) aux sections clés,
   facteur f(y) = m_x/(M/2b) (le KTRANS de CHAMOA en est le maximum), surface 3D m_x(x, y).
4. **Lignes d'influence** — M, V⁻/V⁺ et réaction pour la section choisie.
5. **Tableaux** — toutes les valeurs numériques, par cas, avec K par section.

6. **Ferraillage longitudinal** — combinaisons (ELU, ELS caractéristique / fréquent / quasi-permanent ;
   ELU / ELS BAEL), aciers par mètre et par critère (ELU, σs/σc, ouverture de fissure 7.3.4, minimums 9.2.1.1 ×1,2 /
   7.3.2 / 3 cm²/m ; ELU / ELS BAEL, non-fragilité), diagramme A_s(x), tranchant V_Rd,c ou τu, poinçonnement sous roue.
   Gradient thermique (EN 1991-1-5) et tassements aléatoires (δ, −δ sur appuis adjacents, module différé) en option,
   chanfreins en compression par l'intrados en option.

7. **Flexion transversale** — m_y(y) par travée sur la dalle isostatique équivalente (permanent, TS, UDL, LM2,
   A(l), Bc, Mc120, D240, enveloppe combinée), aciers transversaux par face et par critère, minimums non sectionnels
   (20 % des longitudinaux, sup ≥ 50 % inf ; BAEL : A_s/3) et minimum du guide 1989 (1,3 n ‰). **Ouvrage biais** :
   les aciers transversaux (parallèles aux lignes d'appui ou perpendiculaires aux bords libres, au choix) sont
   dimensionnés avec le moment dans leur direction M_APF de l'annexe 12A du BPEL (pratique CHAMOA, reproduite exactement).

7 bis. **Phase de chantier, LM3, encorbellement, fatigue** — profil provisoire (remblai, enrobé, engins circulant seuls,
   dyn 1,5), convoi exceptionnel LM3 seul (véhicules de l'annexe A ou personnalisé, incertitude 1,1, dynamique
   1 + 0,7/(1 + 0,2 L)), avec les aciers du profil comparés au profil définitif et l'enveloppe retenue ; encorbellement
   (moments d'encastrement, aciers) ; fatigue des armatures par la méthode λ_s avec FLM3 (essieux × 1,75 / 1,40, section
   fissurée, Δσ_Rsk = 162,5 MPa).
7 ter. **Zonage et dispositions constructives** — chevêtres incorporés et extensions (a/(3 sin ψ), 2a/(3 sin ψ)), chaînage des
   bords libres (0,9 ‰, cadres 5 cm²/m), angles (1,2 ‰ ou 0,6/sin²(α/2) ‰), abouts, encorbellements, avec la vue en plan des zones.
7 quater. **Plan de ferraillage** — sur l'enveloppe des aciers requis (profil définitif, chantier, LM3) : choix des barres
   (φ, espacement), schéma filantes + renforts intercalés (≥ 50 % des aciers inférieurs sur appuis), arrêts de barres sur
   épure décalée a_l = d + l_bd, ancrages et recouvrements EC2 8.4 / 8.7, éléments de 12 m au plus, aciers transversaux par
   travée, cadres de chaînage des bords libres, épingles d'effort tranchant ; coupe longitudinale repérée, coupes
   transversales en travée et sur appui (aciers inférieurs suivant les chanfreins), graphique A_s mis en place / requis,
   nomenclature et métré (masse par repère et par diamètre, kg/m³).
8. **Note de calcul** — bouton « Exporter la note de calcul » : page HTML autonome (données, modèle, tableaux,
   graphiques en PNG, hypothèses, références), à imprimer ou enregistrer en PDF depuis le navigateur.
9. **Permalien** — les données du formulaire sont encodées dans l'URL après chaque calcul : un lien suffit pour
   partager ou rejouer un cas (utile en cours).

## État et limites (v0.8)

- Dalle pleine de hauteur constante, appuis simples, abouts en console (charges permanentes). Biais : le calcul longitudinal
  est fait suivant les portées biaises (comme CHAMOA, sans correction) ; les aciers transversaux sont corrigés par
  l'annexe 12A (biais mécanique du guide 1989, reproduits exactement sur la note CHAMOA).
- Appareils d'appui : prédimensionnement aux règles du BT4 reprises par le guide 1989, à confirmer selon NF EN 1337-3.
- Fatigue : critère simplifié σs ≤ 300 MPa (CHAMOA) et méthode λ_s de l'annexe NN ; λ_s,1 est à lire sur la figure NN.1 (saisi).
- Phase de chantier : les tombereaux 23/34 m³ de la circulaire « delta 70 » ne sont pas prédéfinis (données non disponibles) ;
  le véhicule spécial de la note CHAMOA est reproduit à 4 % (435 contre 451 kN·m à P1). LM3 : composition des lignes
  d'essieux de l'annexe A à relire (`TODO_VERIF`). Encorbellement : méthode simplifiée (diffusion à 45°), pas l'annexe 3 du PSIDP.EL.
- Appuis et fondations (v0.13) : piles voiles ou colonnes, culées remblayées ou enterrées, semelles ou pieux, BAEL/F61/F62-V et
  Eurocodes ; rigidités, répartition et descente de charges recalées sur la note des appuis du Pont de Noé. Les formules de
  pratique PP73 (garde-grève, murs en retour), FOND 72 et une partie de F62-V / NF P 94-262 sont marquées `TODO_VERIF`.
- Pas encore : tassements probables, précontrainte (PSI.DP), appareils d'appui glissants ou à pot.
- Le guide SETRA 1989 a été établi pour les charges du Fascicule 61 (classe I–II, deux voies) : ses abaques et élancements sont des
  ordres de grandeur (lecture des abaques à ±0,005 m), la recherche d'épaisseur de l'outil fait foi pour les charges Eurocodes.
- Les tableaux `a1`, `bc`, `bt` du Fascicule 61 et les α de l'annexe française sont à relire contre
  les textes avant toute utilisation en production (voir les commentaires `TODO_VERIF`).

## Licence

MIT.
