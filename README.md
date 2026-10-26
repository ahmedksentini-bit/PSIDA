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
web/vendor/plans/   jsPDF 2.5.2 et svg2pdf.js 2.2.4 (MIT), DejaVu Sans Condensed (licence Bitstream Vera) pour le PDF des plans
web/plans_view.js   carte « Plans d'exécution » : cartouche, aperçu, téléchargements ; web/plans_pdf.js : feuilles → PDF
src/plans/          plans d'exécution : dessin.js (vues, feuilles), primitives.js, svg.js, dxf.js (R12), geometrie.js,
                    coffrage.js, ferraillage.js, bordereau.js (ISO 4066), appuis.js et ferraillageAppuis.js (appuis), equipements.js
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

Depuis la v0.91, l'application s'ouvre sur un **accueil** : on choisit d'abord le type d'ouvrage, puis on suit les étapes
numérotées de la barre d'onglets (Tablier → Conception → Calcul → Ferraillage… pour un pont-dalle ; un seul onglet pour un
cadre ; Phasage pour les ponts construits par phases). Chaque carte de l'accueil indique honnêtement ce qui est calculé et
ce qui reste à venir pour cet ouvrage.

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
v0.54 : méthode de calcul du tablier au choix (onglet Projet) — Guyon-Massonnet (par défaut, CHAMOA / PSIDA) ou **plaque
par différences finies** : dalle de Kirchhoff réelle (chanfreins, abouts, bords libres), appuyée sur ses appareils en
élastomère (ressorts), surfaces d'influence par réciprocité de Maxwell-Betti, mêmes convois et arrangements que la poutre ;
dimensionnement sur les moments de Wood-Armer, flexion transversale lue sur la plaque, chevêtres par moyennes de m_y sur
les bandes de l'annexe 4 du guide PSIDP-EL, réaction de chaque appareil, renforts locaux au droit des appareils des piles
(annexe 4 § 7) ; comparaison avec Guyon dans l'onglet Tablier. Validée sur les solutions exactes de Lévy et de Navier.
Ouvrage droit seulement ; ≈ 30 s de calcul.
v0.55 : la plaque passe aux éléments finis (triangle DKT de Batoz, Bathe et Ho, 1980 ; les différences finies restent
en contrôle croisé) et traite les ouvrages biais (maillage en parallélogrammes, appareils le long des lignes d'appui,
Wood-Armer pour armatures biaises vérifié numériquement) ; validation sur Navier, Lévy et la plaque biaise de Morley (30°).
Onglet Calcul sismique : références des conditions d'application de nouveau lisibles (sélecteur CSS trop large).
v0.56 : bouton « Recommandations » (en-tête) : pour chaque vérification non satisfaite (conception, tablier, appareils,
têtes d'appui, piles, fondations superficielles et pieux, PP73, conditions sismiques), le constat et les paramètres à
modifier ; « Calculer » cherche par dichotomie la plus petite modification qui suffit, « Appliquer » l'écrit dans le
formulaire. Onglet Calcul sismique : « Que changer ? » sous chaque condition ou critère non satisfait. Plan de
ferraillage : plus de fausse alerte aux sections d'extrémité hors des barres.
v0.57 : plan de nivellement (onglet Appuis et fondations) : cotes par ligne d'appui (chaussée à l'axe, terrain naturel,
dessus et sous-face de semelle, pointe des pieux), type de fondation et largeur de semelle par ligne ; hauteurs de fûts et
de culées, épaisseurs et encastrements des semelles, longueurs des pieux en découlent ligne par ligne (fondations mixtes
semelles / pieux possibles) ; dévers en toit ou unique et hauteur des bossages sous chaque appareil ; coupes longitudinale
et transversale en direct ; tableau dans la note des appuis ; export Pont EC8 avec les hauteurs propres à chaque pile.
v0.58 : dévers transversal (onglet Projet : en toit ou unique, rattrapé par la dalle inclinée, par la dalle à sous-face
horizontale — aire, inertie et aciers par fibre avec l'épaisseur locale, épaisseur variable dans la plaque — ou par le
revêtement — supplément de charge en bandes) ; plan de nivellement : composante du poids le long de la pente du profil en
long (action permanente répartie entre les appuis, distorsion lente des appareils), plus hautes eaux et lit par pile.

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
v0.59 : ouvrage courbe — import du tracé en plan au format DXF (onglet Projet : axe sur un calque — LINE, ARC,
LWPOLYLINE à renflements, POLYLINE —, lignes d'appui radiales sur un autre ; portées déduites des abscisses le long de
l'axe, vue en plan) ; plaque DKT maillée le long de l'axe (abscisse curviligne, déport ; charges pondérées par
J = 1 − κ y, moments dans le repère local) ; force centrifuge EN 1991-2 § 4.4.2 dans le groupe gr2 (effort transversal en
tête, moment en pied, fondations, appareils). Fichier d'essai : exemples/ouvrage_courbe.dxf (tools/dxf_courbe.mjs).
v0.60 : ouvrage courbe — forces centrifuges du Fascicule 61 titre II art. 7 (système Bc, (R + 150)/(6R + 350) ou 80/R,
δ_B et b_c, combinaison « Bc + centrifuge » sans freinage) ; cartes de la plaque (flèche, m_x, m_y, m_xy, surfaces
d'influence) dessinées en vue en plan pour un ouvrage courbe ; manuel : chapitre 21 « l'ouvrage courbe ».
Bouton « Manuel » (en-tête) : ouvre la dernière version du manuel d'utilisation, publiée avec le site dans docs/manuel/PSIDA_Manuel.pdf.
v0.61 : ouvrage courbe — force centrifuge répartie au prorata des raideurs transversales (pile voile fléchie dans son plan,
colonnes en portique sous chevêtre, culée remblayée rigide en travers, pieux dans le sens transversal, semelle autour de
son grand axe) ; rayon minimal pris sur la longueur du tablier seulement ; manuel § 21.8 mis à jour.
v0.62 : ouvrage courbe à lignes d'appui biaises, biais propre à chaque ligne (franchissement d'une voie droite par un pont
courbe) : angle signé avec la tangente lu dans le DXF, plaque maillée suivant chaque ligne (P = A + y (N + cot ψ T), cot ψ
interpolé), appareils, bandes et repère de chevêtre par ligne ; cartes en plan par transformation inverse ; fichier
d'essai exemples/ouvrage_courbe_biais.dxf ; manuel § 21.9.
v0.63 : clothoïdes — lecture des SPLINE du DXF (de Boor, poids compris) et des polylignes à points serrés ; reconstitution
des droites, arcs et clothoïdes (diagramme des courbures, Douglas-Peucker, moindres carrés de Levenberg-Marquardt sur les
écarts latéraux, fusion des éléments) ; segment « clothoide » dans l'axe (Gauss-Legendre, table au mètre) ; force
centrifuge promenée le long du tablier avec l'intensité du rayon local, tablier indéformable dans son plan en translation
ET rotation d'ensemble sur les ressorts longitudinaux et transversaux des lignes (H_x ajouté au freinage) ; fichier
d'essai exemples/ouvrage_clothoides.dxf ; manuel § 21.8 et 21.10.
v0.64 : précontrainte d'un ouvrage courbe — frottement avec la déviation horizontale des câbles (Δα = √(Δθ_v² + Δθ_h²)),
poussée au vide P/R et armatures de couture, couple de la poussée radiale m_t = F z κ appliqué à la plaque et réactions
différentielles des appareils ajoutées aux réactions de précontrainte ; manuel § 21.11.
v0.65 : exemples traités (manuel, chapitres 22 à 25 ; projets exemples/exemple1.json à exemple4.json, tools/exemples.mjs) —
corrections issues de leur calcul : coefficient K des sections à moment de poutre nul (fausse alerte d'effort tranchant
aux abouts), plan de ferraillage sans disposition possible (message explicite) et non tenté pour une dalle précontrainte,
proposition d'appareil vérifiant à la fois l'EN 1337-3 et le guide 1989, domaine d'emploi d'une dalle précontrainte à
encorbellements, vue en plan d'un ouvrage courbe dans l'onglet Projet, étiquettes du plan de nivellement.
v0.66 : plans d'exécution du tablier (onglet Ferraillage, carte « Plans d'exécution ») — plan de coffrage (vue en plan,
coupe longitudinale développée avec appuis, garde-grèves et niveaux du nivellement, coupes transversales en travée et sur
appui, notes, quantités) et plan de ferraillage (coupe longitudinale des repères à échelles dilatées, demi-coupes
transversales au 1/25, bordereau de façonnage ISO 4066 avec croquis et récapitulatif par diamètre), cartouche sobre ;
sorties DXF R12 (mm, calques normalisés, une vue = un bloc en vraie grandeur) et PDF vectoriel (jsPDF + svg2pdf.js, police
DejaVu incorporée) ; src/plans/ ; manuel chapitre 26.
v0.67 : plans de coffrage des appuis (une feuille par ligne d'appui, A2 ou A1) — élévation suivant l'axe de l'ouvrage,
coupe dans l'axe (mur de front, sommier, garde-grève, mur en retour et dalle de transition des culées ; voile ou colonnes
et chevêtre des piles ; pieux et leur inclinaison), vue en plan de la fondation alignée sous l'élévation, niveaux du plan
de nivellement, quantités de béton par élément et des pieux (src/plans/appuis.js) ; plans du tablier : cotes attachées
à l'ouvrage, bulles de repères sans chevauchement ; manuel § 26.5.
v0.68 : équipements du tablier (src/plans/equipements.js) — corniches, dispositifs de retenue et longrines d'ancrage,
garde-corps, bordures et remplissage des trottoirs, étanchéité et couche de roulement, joints de chaussée (souffle
2 v_T + v_RF, famille selon le guide Cerema 2016), gargouilles (retombée 0,50 m, fiche MEMOAR X-2) ; dessinés dans les
coupes et la vue en plan du coffrage ; feuille « Équipements » (détails des bords, du joint et de la gargouille, schéma
d'évacuation des eaux, métré) ; contrôle des poids propres par rapport aux charges linéaires du calcul.
v0.69 : maillage du modèle en plaque (onglet Tablier, web/maillage_view.js) — vue en plan des triangles DKT, appuis-ressorts,
épaisseur, sections et fibres, nœuds et numéros ; statistiques ; export DXF ; aperçu du maillage sans calcul en plaque ;
manuel § 20.3 et § 26.6.
v0.70 : plans de ferraillage des appuis (src/plans/ferraillageAppuis.js) — sections du calcul des appuis, dispositions des
ferraillages types du Sétra (PP 73 pièce 1.3.2) : fûts (0,2 %, ≥ 20 cm² par colonne ou petit voile), chevêtres et sommiers
(0,5 % pour l'ensemble des nappes, cadres ≥ 0,2 % en plusieurs cadres par cours), garde-grève type (h ≤ 3 m), murs en retour,
semelles (0,12 % par nappe, tirants sur pieux), cages et cerces des pieux ; attentes, recouvrements EC2 ; bordereau ISO 4066
(code 99 : cerces) ; manuel § 26.6.
v0.71 : mise en page automatique des plans (src/plans/mise_en_page.js) — plus petit format où les vues tiennent (A3 → A0),
puis échelles agrandies d'un cran normalisé tant que la feuille le permet ; colonne réservée au-dessus du cartouche pour les
tableaux, notes et bordereau ; vue en plan alignée sous l'élévation ; échelle graphique sous le titre de chaque vue (deux
pour les vues dilatées). Ferraillage des appuis complété : frettes de surface (0,04 R / f_su par appareil), aciers
d'éclatement dans les plans Δ′ et Δ (répartis de 0,1 d à d), voile frontal des piles-culées apparentes ; manuel § 26.
v0.72 : présentation des plans selon les dossiers d'ouvrages courants — cartouche en bande sur toute la largeur (bureau
d'études, maître d'ouvrage, projet, phase et lot, ouvrage et titre, indices avec visas, échelles, format, n° de plan),
mention de vérification des cotes, cadre tireté et « Ech : 1/50 » sous chaque vue, encadré NOTA ; A3 essayé d'abord,
format imposé possible. Nouvelles feuilles : vue en plan – coupe longitudinale de l'ouvrage (appuis complets, terrain
naturel, talus, dalles de transition, bulles d'axes, caractéristiques géométriques) et tableau de dimensionnement et
nivellement des appuis ; tableau de calage et détail bossage / plot de vérinage sur les feuilles d'appui ; coffrage du
tablier réduit aux coupes transversales et au détail du bord. Corrections : garde-grève toujours derrière le bossage
(alerte si l'about est trop court), contre-corniche coulée en place contre la corniche préfabriquée.
v0.73 : habillage des plans — terrain naturel hachuré, béton de propreté et remblais en pointillé, fûts et pieux
cylindriques ombrés, désignations dans les vues (semelle, chevêtre, sommier, garde-grève), profils réalistes des
équipements (barrière type BN4 avec platine et lisses, glissière à double onde, garde-corps type S8, corniche avec nez et
larmier, bordure chanfreinée), coupe transversale annotée (lignes de rappel, couche de roulement, flèches de dévers),
talus 3/2 en terrain.
v0.74 : pile marteau (fût cylindrique unique, chevêtre en console à sous-face inclinée ; calcul d'une pile à une colonne,
métré de la forme réelle, aciers inférieurs et cadres suivant la sous-face) ; « vue suivant F » des piles avec flèche sur
l'élévation ; dalle de transition sur corbeau, pente 5 % ; plan type de la corniche préfabriquée (section et ferraillage
type) sur la feuille Équipements ; alerte d'about trop court reprise sur la feuille d'ensemble.
v0.75 : abouts de 0,50 m par défaut ; bord du tablier — dispositif en rive (trottoir côté chaussée : barrière avec fonction
garde-corps, panneaux grillagés NF P98-405, sans garde-corps séparé) ou à la bordure (trottoir derrière, garde-corps en rive,
alerte si largeur libre < 1,40 m) ; corniche et contre-corniche arasées au même niveau fini ; caniveau en asphalte coulé au
fil d'eau ; chaîne de cotes détaillée du bord dans la coupe A-A ; vue en plan des culées avec garde-grève, réservation du
joint, dalle de transition et bossages.
v0.76 : dispositif anti-cheminement (vue en plan, taquets) sur la feuille d'appui quand σ_min < 2 MPa, note σ_min sur
chaque feuille d'appui ; désignations des bandes (trottoir, chaussée) dans la coupe transversale ; manuel § 26.5 et § 26.7.
v0.77 : feuille « Dispositifs de retenue : plans types » (src/plans/retenue.js) — raccordement barrière de l'ouvrage /
glissière (zone de transition raidie), extrémité amont enfouie dans le talus, extrémité abaissée et ancrée, queue de carpe
réservée à la fin de file aval d'une chaussée unidirectionnelle, implantation en remblai ; plans de principe, la notice du
dispositif certifié fait foi.
v0.78 : feuille « Dispositifs de retenue aux abords : schémas de principe » revue — vue en plan de l'ouvrage et de ses
abords (barrière, raccords, glissières, extrémités) ; raccords et extrémités renvoyés aux fiches techniques du fournisseur
(dispositifs certifiés NF EN 1317) ; queue de carpe interdite en extrémité, admise seulement pour le raccord entre deux
dispositifs ; vues d'extrémités enfouie, abaissée et queue de carpe supprimées.
v0.79 : onglet « Cadres et portiques » (src/cadre) — cadres fermés PICF à une ou plusieurs cellules et portiques ouverts
PIPO sous remblai, portage du moteur C# de BVTrace (programme SETRA PICF-EL : effet Marston, sol élastique ESOL, poussées
K₀ max/min et phasage, situations hydrauliques et flottaison, Fascicule 61 diffusé et balayé, pondération effet par effet,
BAEL 91 ou EN 1992-1-1, blocs monolithiques), recoupé sur 2 104 grandeurs de BVTrace (test/cadre.test.js) ; voie portée
ferroviaire (EN 1991-2 : LM71, SW/0, SW/2, Φ2/Φ3 réduit pour la couverture, surcharge sur remblai) ; voie franchie route
ou voie ferrée (gabarit, choc EN 1991-1-7 en situation accidentelle) ; portique ouvert sur appuis encastrés ou articulés
avec enveloppe des réactions ; note HTML et Word ; avant-propos et chapitre 27 du manuel.
v0.80 : séisme des cadres et portiques (src/cadre/seisme.js), Eurocode 8, q = 1 — action a_g·S (zones de l'arrêté 2011
ou saisie directe) ; approche A inertie + poussée dynamique d'ouvrage rigide (NF EN 1998-5, 7.3.2.2 et annexe E.9),
approche B distorsion imposée par le terrain (Wang 1993, Penzien 2000, FHWA-NHI-10-034 § 13.5 ; G réduit selon
NF EN 1998-5 tableau 4.1), enveloppe ou approche seule ; combinaisons G + P + E (deux sens, ±k_v, K₀ max/min) ;
sections renforcées si le séisme gouverne ; manuel § 27.9.
v0.81 : assistant de saisie des cadres (web/cadre_schema.js) — coupe transversale à l'échelle, vue en plan et synthèse
dessinées en direct avant tout calcul, éléments rattachés aux champs (clignotement bleu), aide contextuelle ; données du
sol de fondation (src/cadre/solProfil.js) : profils pressiométrique (guide PICF-EL annexe 2, Terzaghi et Peck),
pénétrométrique statique (Sanglerat, Ménard), pénétrométrique dynamique (q_d/q_c du site ou par défaut) et SPT
(V_s d'Imai et Tonouchi) ; manuel § 27.2 et 27.2 bis.
v0.82 : cadres — portance sous le radier et sous les semelles du portique (src/cadre/portance.js) par les méthodes
directes du Fascicule 62 titre V et de la NF P94-261 (pressiomètre k_p·p*_le, pénétromètre statique k_c·q_ce ; module
src/geotech de fond.ksr-infra.org) ; ESOL au pénétromètre statique par la méthode directe de Schmertmann (NF P94-261
annexe I), sans corrélation de module ; pénétromètre dynamique ramené au statique par q_d/q_c seulement ; séisme conforme
à NF EN 1998-2, 6.7.3 (inertie, q = 1) et 6.7.4 (pont-cadre sous grande couverture : γ_s = v_g/v_s,
v_g = S·T_C·a_g/(2π)), choix automatique selon le remblai ; manuel § 27.2 bis et 27.9.
v0.83 : cadres — plans d'exécution (src/plans/cadre.js, web/cadre_plans.js) : feuille de coffrage (coupe parallèle aux
têtes cotée, vue en plan biaise, quantités béton, coffrages, aciers, ratio) et feuille de ferraillage (coupe transversale
armée avec repères, coupe longitudinale partielle, bordereau de façonnage ISO 4066, récapitulatif par diamètre, notes) pour
chaque bloc PICF ou pour le PIPO ; sections tirées du calcul, faces extérieures en nappe filante + chapeaux sur nœuds,
faces intérieures par cellule, répartition et renforts de goussets du guide PICF-EL, ancrages BAEL A.6.1,23 ou EC2 § 8.4 ;
export SVG, DXF et PDF avec le cartouche commun ; manuel § 27.11.
v0.84 : calcul par phases avec fluage et retrait (src/phasage) — ossature plane, méthode pas à pas (Bažant), lois de
l'EN 1992-1-1 (§ 3.1.2, § 3.1.4, annexe B, âge corrigé selon le ciment) ; barres activées par phase, appuis ajoutés ou
retirés (réaction restituée), liaisons de clavage ; validé sur les solutions fermées de Dischinger (changement de schéma,
retrait gêné), sur l'équation intégrale de Volterra résolue indépendamment et sur le coefficient de vieillissement χ ≈ 0,8.
Précontrainte par post-tension : câbles par segments excentrés, injectés après mise en tension, pertes différées par
retrait, fluage et relaxation (§ 3.3.2) calculées pas à pas — recoupées avec l'éq. (5.46) à 3 % près et avec le moment
hyperstatique 1,5 P·e ; adaptation par fluage recoupée avec le Bulletin technique Sétra n° 7 (1972), annexe I, et φ avec
le guide Sétra EC2 ponts-routes (2008). Sections composées par barres décalées (poutre préfabriquée + hourdis coulé plus tard, voussoirs d'âges différents) :
section homogène équivalente, retrait différentiel et invariance du fluage homogène vérifiés. Moteur seul : l'interface
suit.
v0.85 : onglet « Phasage » — tablier à poutres préfabriquées précontraintes rendues continues (src/phasage/exemples.js,
web/phasage_view.js) : phases de construction (pose et mise en tension, hourdis, clavage, superstructures), moments de la
section composée à chaque phase, évolution dans le temps, diagrammes, pertes différées des câbles, note HTML et Word,
export du modèle JSON ; manuel § 28.
v0.86 : phasage — pertes instantanées de précontrainte (src/phasage/precontrainte.js : frottement § 5.10.5.2, recul
d'ancrage § 5.10.5.3 avec zone d'influence λ, tension par une ou deux extrémités), recoupées avec la solution exacte du
frottement exponentiel ; fléaux construits par encorbellements successifs (trois travées a – 2a – a, voussoirs d'âges
différents, équipage mobile, câbles de fléau et de continuité, clavages, hauteur parabolique et I ∝ h^5/2 du BT n° 7) ;
manuel § 28.6 et 28.7.
v0.87 : phasage — contre-flèches de construction des fléaux par joint de voussoir (réglage du coffrage sur le bout du
voussoir précédent, part de la construction et part après clavage), recoupées en élastique avec la méthode des aires des
moments ; flèches à mi-travée des poutres rendues continues à chaque phase ; âge minimal de chargement 0,5 j (B.9) ;
manuel § 28.8.
v0.88 : onglet « Phasage » — assistant de saisie (web/phasage_schema.js) : élévation longitudinale (travées, câbles,
voussoirs, équipage, clavages), coupe transversale (poutre en I et hourdis, ou caisson sur pile et à la clé) et
chronologie des phases dessinées en direct, éléments rattachés aux champs (clignotement bleu) ; sections définies par
leurs dimensions (src/phasage/sections.js : A, I, c.d.g. calculés ; caisson exact à chaque hauteur) ou par leurs valeurs.
v0.89 : phasage — contraintes normales du béton à chaque pas (src/phasage/contraintes.js) : enveloppes par partie de
section, limites 0,6 f_ck(t) en construction, 0,45 f_ck en service, traction / f_ctm(t), décompression des parties
précontraintes (EN 1992-1-1 § 3.1.2, 5.10.2.2, 7.2 ; EN 1992-2 tableau 7.101N) ; contraintes aux sections remarquables ;
fléaux : plusieurs câbles par paire de voussoirs ; manuel § 28.9.
v0.90 : ponts mixtes acier-béton (src/mixte) — section mixte EN 1994-2 (propriétés acier seul, mixte n₀ / n_L,
fissurée ; largeur efficace § 5.4.1.2 ; classes EN 1993-1-1 tableau 5.2 ; M_pl,Rd § 6.2.1.2 ; f_y selon l'épaisseur
EN 10025-2) ; pont bipoutre ou quadripoutre par phases dans l'onglet « Phasage » : charpente continue, bétonnage de la dalle
par plots (travées puis appuis), zones fissurées forfaitaires (§ 5.4.2.3), fluage et retrait pas à pas — retrait recoupé
avec la méthode n_L (4 %) ; contraintes acier et dalle, flèches (contre-flèches de fabrication), diagrammes ; assistant
de saisie (élévation avec plots, coupe transversale) ; manuel § 28.10.
v0.91 : interface réorganisée par type d'ouvrage (web/parcours.js) — onglet « Accueil » : choix de l'ouvrage (pont-dalle,
pont à poutres, cadre ou portique, poutres rendues continues, encorbellements, mixte acier-béton) avec, pour chacun, l'état
réel des fonctions (conception, trafic, ELS / ELU, ferraillage ou câblage, appuis, séisme, plans, note : oui / partiel /
à venir) ; la barre d'onglets ne montre plus que les étapes de l'ouvrage choisi, numérotées dans l'ordre du projet et cochées
quand elles sont calculées ; le choix est enregistré avec le projet (champ « ouvrage »). Aucun calcul n'est modifié.
v0.92 : pont à poutres VIPP — chaîne complète (src/beams/vipp.js, vipp_section.js) : poutre définie par ses dimensions
(talon à pan incliné, goussets ; caractéristiques exactes du polygone), largeur efficace (EN 1992-1-1 § 5.3.2.1), câblage
parabolique en deux familles (1re sur la poutre seule, 2e sur la section composée), frottement et recul d'ancrage, calcul par
phases (moteur de src/phasage : raccourcissement élastique câble par câble, fluage et retrait des deux bétons, retrait
différentiel, relaxation), contraintes ELS (0,6 f_ck(t), 0,6 f_ck, 0,45 f_ck, décompression EN 1992-2 tableau 7.101N, BPEL
classe II), ELU de flexion (bloc rectangulaire sur le contour réel, allongement préalable des câbles), effort tranchant
(V_pd, α_cw, b_w,nom, cot θ variable, étriers proposés), flèches, quantités et diagnostic du guide Sétra VIPP (1996) ;
poutres BA : armatures et étriers le long de la travée ; hourdis (src/beams/hourdis.js) : plaque DKT continue sur les poutres,
moments locaux par surfaces d'influence sous TS, UDL, LM2 (EN 1991-2 § 4.3) et Bc, Bt, Br, Mc120 avec δ (Fascicule 61),
ferraillage par mètre et poinçonnement ; entretoises d'about (src/beams/entretoise.js) : vérinage sur vérins, flexion et
étriers ; plans de la poutre (src/plans/vipp.js : coffrage, câblage avec ordonnées des gaines et allongements théoriques,
ferraillage de principe ; aperçu, DXF, PDF) ; assistant de saisie (coupe du tablier, section et câblage) ; note de calcul
HTML et Word ; manuel chapitre 29.
Projets antérieurs (section par valeurs) inchangés.
v0.93 : pont mixte — structure achevée (src/mixte/trafic.js, verifs.js) : poutre continue à inertie variable (n₀ en travée,
fissurée sur appuis), lignes d'influence, répartition transversale (levier / Courbon), LM1 et trottoirs, écart thermique ±10 K
(effets primaires et hyperstatiques) ; ELU par classe de section (M_pl,Rd ou contraintes cumulées par phase, âme efficace
EN 1993-1-5 § 4.4), voilement par cisaillement et interaction M-V, déversement de la semelle comprimée sur berceaux élastiques
(EN 1993-2 § 6.3.4.2, annexe D.2.4), ELS acier / dalle / armatures, armatures minimales, connexion (goujons : ELU, ELS,
fatigue), fatigue FLM3 (λ₁ λ₂) ; réactions transmises à l'onglet Appuis ; PRS d'appui de longueur réglable, sections par défaut
renforcées ; parcours « Tablier mixte → Appuis → Séisme » ; manuel § 28.11.
Poutres rendues continues et fléaux — ouvrage terminé (src/phasage/acheve.js) : trafic LM1 sur la structure continue
(répartition de Guyon-Massonnet pour les poutres, caisson entier pour les fléaux), gradient thermique linéaire (EN 1991-1-5
approche 1), combinaisons EN 1990 A2, ELS (compression, décompression XC / XD, traction fréquente), ELU de flexion avec
effets hyperstatiques de la précontrainte à γ_P = 1 (second calcul par phases sans câbles), armatures passives de complément
et de continuité, effort tranchant (V_pd, effet Résal des caissons), réactions transmises aux appuis ; câbles de continuité
des travées de rive des fléaux ; manuel § 28.12.
v0.94 : poutres PRAD (src/beams/prad.js, chaîne VIPP en mode adhérence) : torons rectilignes en lits et torons supérieurs,
groupes gainés, tension sur banc, pertes avant et au relâchement (relaxation, étuvage, raccourcissement élastique), âge
équivalent d'étuvage (EN 1992-1-1 § 10.3.1.1), longueurs de transmission et d'ancrage (§ 8.10.2), limite k₆ f_ck(t) au
relâchement, diagnostic du dossier Sétra PRAD 73, plan des torons et du gainage ; nomenclature des armatures d'une travée
VIPP ou PRAD (poutres, hourdis, entretoises : bordereau ISO 4066) ; manuel § 29.8 et 29.9.
Prédimensionnement des ouvrages par phases (src/phasage/predim.js) : règles des guides Sétra (poutres continues, fléaux,
bipoutre) puis affinage par le calcul complet (renforcement des seules dimensions en défaut) ; manuel § 28.13.
Pont mixte : charpente pendant le bétonnage (src/mixte/betonnage.js : résistance, déversement des semelles, déversement
d'ensemble de Yura) ; plans de charpente (src/plans/charpente.js : élévation, vue en plan, tôles par tronçon, coupes,
connexion, quantités) ; tablier courbe en plan (src/mixte/courbe.js : grillage, amplification des moments, flexion latérale
des semelles, efforts de cadres, soulèvement) ; manuel § 28.14 et 28.15.
Fléaux : flexion transversale du caisson (src/phasage/caisson_transversal.js : cadre avec flux de flexion et de torsion,
distortion majorée, ferraillage par mètre), déséquilibres de construction et clouage provisoire (src/phasage/desequilibre.js) ;
plans des fléaux et des poutres rendues continues (src/plans/ouvrages_phases.js) ; manuel § 28.16.
v0.95 : pont mixte — flexion transversale de la dalle (plaque du hourdis, src/beams/hourdis.js avec largeur imposée :
charges de bord, revêtement, roues, poinçonnement EC2 § 6.4.4) et fatigue des armatures sur appui (src/mixte/fatigue_armatures.js :
FLM4 EN 1991-2 § 4.6.5, section fissurée EN 1994-2 § 6.8.5.4, courbe S-N et règle de Miner EC2 § 6.8.4) ; manuel § 28.17.
Fléaux : distortion du caisson avec diaphragmes (analogie de la poutre sur appui élastique, Wright et al. 1968 : raideur du
cadre k_D, gauchissement I_dw, diaphragmes θ = 0 ; correction des lignes d'influence du cadre) ; manuel § 28.18.
Nomenclatures des armatures des ouvrages par phases (src/plans/nomenclature_phases.js) : poutres rendues continues (PC-FER-01)
et voussoir courant de fléau (FL-FER-01), bordereau ISO 4066 ; manuel § 28.19. Accueil et manuel § 2.10 : pourquoi un
ouvrage se calcule directement ou par phases.
v0.96 : séisme des ouvrages autres que le pont-dalle. Transfert vers « Appuis seuls » (web/transfert_appuis.js) : aire de la
structure et superstructures résiduelles (masse = poids permanent, comptée une fois), nature du tablier (poutres, caisson,
mixte), inerties de la section réelle, nombre d'appareils ; liaisons par ligne (élastomère, fixe, glissant), appareils à pot
retenus d'office quand aucun élastomère standard ne convient (point fixe sur la pile la plus centrale) ; fléaux : analyse
multimodale. Travées indépendantes (VIPP, PRAD) dans le moteur Pont EC8 (ec8/src/moteur/multimodal.ts, analyse.ts,
verif-appuis.ts) : une translation par travée en X, une poutre par travée en Y, deux rangées d'appareils par pile, repos
d'appui sur chaque pile (EN 1998-2 § 6.6.4), ouverture des joints ; répartition horizontale de service par travée
(src/supports/actions.js). Composante verticale des tabliers précontraints (EN 1998-2 § 4.1.7(2)P, src/seisme_vertical.js) :
poutres continues et fléaux par analyse modale de la poutre continue (CQC, ξ = 2 %), VIPP et PRAD par les modes de la
travée isostatique ; contraintes et ELU sous G + P ± E_z. Manuel § 16.16.
v0.97 : compléments de ferraillage des ouvrages par phases. Poutres rendues continues : flexion locale du hourdis (plaque sur
les poutres, roues EC et F61, poinçonnement) dans l'onglet par phases, reprise par la nomenclature PC-FER-01. Pont mixte :
nomenclature des armatures de la dalle MX-FER-01 (transversales de la flexion locale, longitudinales ρ_travée et complément
ρ_appui sur les zones d'appui). Fléaux : voussoir sur pile (src/phasage/voussoir_pile.js) — torsion transmise au diaphragme
(LM1 excentré), treillis du diaphragme sous le flux de Bredt, appareils sous les âmes (pression localisée § 6.7, diffusion
§ 6.5.3), éclatement des ancrages (§ 8.10.3) et tirants arrière des bossages 0,25 P (VSL 1991) ; nomenclature FL-FER-02.
Manuel § 28.20.
v0.98 : pont-dalle coulé par phases successives (src/phasage/dalle_phases.js, carte de l'onglet Précontrainte) : tronçons
de reprise en reprise (α L au-delà des piles), décintrement et mise en tension par phase, familles de câbles du calcul PSI-DP
couplées aux reprises ; calcul par phases (fluage, retrait, relaxation, frottement, recul) comparé à l'ouvrage coulé d'une
traite ; béton armé : décintrement par phase ou unique ; reprises et coupleurs (EN 1992-2 § 8.10.4 (105) : 3 MPa de
compression sous combinaison caractéristique ou ferraillage minimal (7.1)). Manuel § 28.21.
En cours — ponts-rails, lot 1 : socle commun des charges ferroviaires (src/loads_rail.js, unités kN, m, km/h) — LM71 et α,
SW/0 (avec α), SW/2 (sans α), train à vide 10 kN/m, excentrement r/18, répartition 1/4-1/2-1/4 sous traverses et diffusion
4:1 dans le ballast, surcharge sur remblai (3,00 m à 0,70 m), Φ2/Φ3 et réduction de couverture, longueur déterminante LΦ
(tableau 6.2 : isostatique, continue k·Lm, arcs, dalles, consoles, abouts, appuis), force centrifuge et coefficient f
(plancher 0,35), effort de lacet, démarrage et freinage, groupes gr11 à gr31, γ (EN 1990 tableau A2.4(B)) et ψ (tableau
A2.3). Valeurs recommandées de l'EN 1991-2 — à confirmer par le référentiel du gestionnaire du réseau ; les valeurs non
recoupées sur un texte accessible sont listées dans `A_CONFIRMER`. Le cadre sous rail s'appuie désormais sur ce socle ;
correction : α ne s'applique plus à SW/2 (EN 1991-2 § 6.3.2(4)), ni au modèle ni à la surcharge sur remblai.
En cours — ponts-rails, lot 2 : pont-dalle sous rail (champ « Trafic porté » = ferroviaire ; src/pipeline.js computeRail,
SlabDeck.ferroviaire, web/note_rail.js) — LM71 (essieux + charge répartie sur les parties défavorables hors du groupe) et
SW/0 (dalles continues) en enveloppe par voie, SW/2 en option, sur les lignes d'influence de la poutre continue ; Φ2/Φ3
avec LΦ du tableau 6.2 et réduction de couverture ; bande de répartition ℓt + 2 e_b/4 + h au feuillet moyen, excentricité
±r/18, Guyon-Massonnet ; 1 ou 2 voies, groupes gr11-14, gr21-24, gr16-17, gr26-27 (γ 1,45 / 1,20, ψ du tableau A2.3) en
flexion longitudinale, effort tranchant et flexion transversale ; actions horizontales (freinage, démarrage, lacet,
force centrifuge) reportées pour mémoire. Hors périmètre, signalé : déformations et vibrations (lot 4), appuis et
transmission des efforts horizontaux (lot 5), fatigue ferroviaire, éléments locaux ; Fascicule 61, précontrainte et
plaque sans objet en mode ferroviaire. Mode routier strictement inchangé.
Ponts-rails : poids de la superstructure de voie proposé depuis le ballast (src/loads_rail.js superstructureVoie,
EN 1991-1-1 annexe A tableau A.6 : ballast 20 ou 26 kN/m³, rails UIC 60 1,2 kN/m, traverses béton 4,8 ou bois 1,9 kN/m ;
épaisseur de ballast ± 30 %, § 5.2.3(2)) — bouton du pont-dalle et du pont à poutres en mode ferroviaire.
En cours — ponts-rails, lot 3 : pont à poutres sous rail (champ « Trafic porté » de l'onglet poutres ; src/beams/index.js
beamDeck + beamCombinationsRail, src/beams/run.js traveeRail, src/beams/hourdis.js hourdisRail, src/beams/design.js
lineReactionsRail, web/beams_view.js) — groupes ferroviaires sur le grillage de Guyon-Massonnet (bande diffusée dans le
ballast puis dans le hourdis jusqu'à son feuillet moyen, excentricité ±r/18), Φ avec LΦ = portée (travées
indépendantes) ; combinaisons EN 1990 A2 par groupe (ELU 1,35 G + γ Q, caractéristique, fréquente avec ψ₁, quasi
permanente) dans les chaînes VIPP / PRAD, BA et section par valeurs (Fascicule 61 / BAEL / BPEL sans objet) ; hourdis
sous traverses (Q/4-Q/2-Q/4, diffusion 4:1 puis 45°, Φ du cas 4.1 du tableau 6.2 plafonné à LΦ des poutres) ; réactions
par ligne d'appui pour mémoire. Transfert vers l'onglet Appuis désactivé (lot 5) ; déformations, fatigue, passages de
service, train à vide hors périmètre, signalés. Mode routier strictement inchangé.
En cours — ponts-rails, lot 4 : déformations, vibrations et décision d'analyse dynamique (src/rail_deformations.js ;
pont-dalle : src/pipeline.js deformationsDalleRail ; poutres : src/beams/run.js deformationsPoutresRail ;
web/rail_deformations_view.js) — organigramme de la figure 6.9 de l'EN 1991-2 (n₀ par l'éq. 6.3 sous permanentes,
limites de la figure 6.10, fourchette k min / k max du ballast, amortissement du tableau 6.6, tableaux F.1 / F.2 de
l'annexe F, n_T facultative) ; EN 1990 A2.4.4 : flèche L/600, gauche sur 3 m (t₁ t₂ t₃, entrée et sortie comprises,
excentrement centrifuge), flèche L/600 sous charges classifiées sans Φ (option « majorée par Φ »), confort des
voyageurs (figure A2.3 numérisée sur la NF EN 1990/A1, ± 2 %, forçage possible ; max(k × (L/δ)_fig / b_v ; 600), k = 0,7 /
0,9 / 1,0, plancher 600 non multiplié ; au-delà de 120 m ou 350 km/h : analyse spéciale), rotation
horizontale et rayon (tableau A2.8), fréquence latérale ≥ 1,2 Hz ; EN 1991-2 § 6.5.4.5.2 : δH ≤ 10 mm et δV ≤ 3 / 2 mm
aux extrémités. Flèches de la poutre continue en forme fermée (EI du tablier non fissuré, E_cm limité à C50/60) ×
K̄(y) de Guyon-Massonnet au droit des rails. EN 1990/A1 A2.4.4 relue sur la norme (A_CONFIRMER_DEFORMATIONS vide). Analyse
dynamique elle-même (HSLM, trains réels, accélération) hors périmètre. Mode routier strictement inchangé.

En cours — ponts-rails, lot 5 : appuis sous charges ferroviaires (src/rail_appuis.js ; branchement dans
src/supports/index.js, pont-dalle src/pipeline.js donneesAppuisDalle, poutres → « Appuis seuls » par
web/transfert_appuis.js railPoutres et src/supports/standalone.js railAppuisSeuls ; web/rail_appuis_view.js) —
démarrage-freinage (§ 6.5.3 : SW/0 et SW/2 sur leurs parties chargées, deux voies selon 6.5.3(9), sens opposés ou même
sens), force centrifuge (tableau 6.8, enveloppe des cas ; SW/2 à 80 km/h) et lacet ; groupes du tableau 6.11 aux appuis
(γ 1,45 / 1,20, ψ du tableau A2.3) ; réactions sans Φ pour les culées, fondations et fûts d'élancement < 30, avec Φ pour
les appareils d'appui, chevêtres et fûts d'élancement ≥ 30 (§ 6.4.5.4(2), tableau 6.2 cas 6) ; répartition des efforts
horizontaux selon les raideurs instantanées (longitudinal et transversal) ; réponse combinée voie-ouvrage par la méthode
simplifiée du § 6.5.4.6.1 (conditions (1) et (2) contrôlées : tablier unique, L_T ≤ 40 m, δ_B ≤ 5 mm, δ_H ≤ 5 mm, voie
conforme au 6.5.4.5.1(2), α, ΔT) — ξ du tableau 6.9, F_Tk (6.26 à 6.29, k = 40 kN/m par défaut), F_Qk (6.30, 6.31) ;
hors domaine : ξ = 1 et analyse d'interaction (annexe G) signalée ; critères δ_B, δ_H, δ_V (§ 6.5.4.5.2) ; surcharge de
remblai des culées (§ 6.3.6.4, sans Φ) ; séisme ψ2,1 = 0,3 et 80 α kN/m par voie (EN 1998-2 § 4.1.2(4)P) ; liaisons
par ligne (fixe, glissant) pour le pont-dalle sous rail. Eurocodes seuls (Fascicule 61 / BAEL sans objet). Hors périmètre :
analyse d'interaction complète, contraintes dans les rails hors méthode simplifiée, déraillement (§ 6.7), train à vide
(gr15), chocs sur les piles, fatigue, garde-grève et garde-ballast sous charges locales ferroviaires. Mode routier
strictement inchangé (empreintes des appuis, des appareils, de la note et de l'export Pont EC8 identiques).
