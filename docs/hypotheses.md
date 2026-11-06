# Hypothèses de modélisation et protocole de comparaison

## 1. Hypothèses (H1–H6) et où les retrouver dans le code

| # | Hypothèse | Code | À confronter à |
|---|-----------|------|----------------|
| H1 | Dalle isotrope de largeur totale 2b (encorbellements compris), inertie équivalente constante, ν = 0,2 (option `nu`, 0 = tables de Massonnet) | `SlabDeck` (`b = width/2`, `nu`) | CHAMOA-PSIDA ch. 2 §3.3 : dalle isotrope de largeur totale, I = I_tot/2b_d. **Vérifié** : avec ν = 0,2 le facteur de bord reproduit KTRANS à 0,4 % (P1) et 2,3 % (travée 1) ; avec ν = 0 il est 7 % trop bas |
| H2 | Poutre continue à EI constant, appuis simples, abouts en console (`overhangs`) chargés par les permanentes et le trafic | `ContinuousBeam` | **Vérifié** à 10⁻³ près sur les moments de poids propre et de superstructures de la note CHAMOA (ST1) |
| H3 | Premier harmonique ; θ = b/L_eq ; L_eq = distance entre points de moment nul de la travée **seule chargée** par une charge uniforme (« méthode des moments » CHAMOA), moyenne des deux L_eq sur appui ; option `leqMethod: 'fleches'` = travée isostatique de même flèche à mi-travée (PSIDA.EL) | `equivalentSpans(method)`, `LeqAt()` ; paramètres `Leq`, `leqMethod` | **Vérifié** : 8,9119 / 11,1867 m contre 8,9118 / 11,1862 (note CHAMOA) ; 9,0174 contre 9,017 m (note PSIDA.EL, méthode des flèches) |
| H4 | Pour chaque fibre y, arrangement transversal le plus défavorable (voies glissées et renumérotées, pas `laneStep`) ; files indépendantes longitudinalement : m_x(y) = Σ K̄_i(y)·M_i/2b | `laneArrangementsEC()`, `evaluateArrangements()` | CHAMOA ch. 2 §3.4.1 : « effet le plus défavorable de la répartition transversale pour chaque point d'étude transversal ». Le facteur de bord (dimensionnant) est reproduit ; le profil CHAMOA est plus plat vers l'axe (1,18 contre 1,10), définition exacte du fichier Guyon à élucider |
| H5 | Poids propre K = 1 ; superstructures avec K(e,y) ; revêtement bande uniforme avec K̄ | `permanent()` | PSIDA répartit aussi les charges permanentes excentrées |
| H6 | Calcul longitudinal suivant les portées biaises sans correction (pratique CHAMOA § 3.4.1) ; biais mécanique φ du guide SETRA 1989 et moments dans les directions d'aciers (annexe 12A) dans `skew.js` ; règles de conception du guide dans `conception.js` | `skew.js`, `conception.js` | **Vérifié** : φ = 82,5322 / 86,5105 gr et les 11 M_APF de la note CHAMOA reproduits à 10⁻⁴ (`test/skew.test.js`) ; validité φ ≥ 70 gr (guide § 2.4) |
| H7 | Flexion transversale sur dalle isostatique équivalente (voir § 1 ter) | `transverse.js` | CHAMOA §4.3 et fichiers 5.4 (biais 80 gr) |

Autres choix :
- ν = 0 pour K (tables classiques) ; option `nu` dans `guyon.js` pour les moments transversaux (correction de Bareš). Paramètre de torsion α < 1
  (tabliers à poutres) : interpolation de Massonnet K = K₀ + (K₁ − K₀)√α par défaut (pratique SETRA, PONTYPE/PAP reproduit à 10⁻³), solution
  orthotrope exacte en option (`alphaMode: 'exact'`, +3,6 % au bord).
- Lignes d'influence sur toute la longueur, **abouts compris** : le trafic est aussi placé sur les consoles d'about (moment imposé au nœud
  extrême + charge directe sur l'appui), comme PSIDA.EL et PSIDP.EL (réactions de culée +3,5 à +15 % par rapport à la version 0.9).
- Effort tranchant : le saut unité des lignes d'influence au droit de la section est intégré exactement (limites à gauche et à droite) ;
  auparavant la grille l'étalait sur une maille (−0,5 à −1,4 % sous charge répartie).
- Lignes d'influence de rotation des appuis (`ILT`) : rotations d'appareils d'appui sous trafic par enveloppe concomitante (et non plus
  par l'enveloppe des moments, +20 à +28 %), permanent par la poutre conjuguée avec le module différé.
- UDL Eurocode appliquée sur les zones défavorables de la ligne d'influence (EN 1991-2 §4.3.2(1)b). **A(l) : zones de même signe de la
  ligne d'influence** — travées entières, parties de travées entre zéros, abouts — avec l = somme des longueurs chargées (PSIDA.EL : « longueurs
  chargées 13,93 et 2,83 m », PSIDP.EL : « zéros des lignes d'influence et aires partielles ») ; auparavant travées entières seulement
  (jusqu'à −51 % près des points de moment nul).
- Voies Eurocode numérotées depuis chaque bord de chaussée (deux arrangements), enveloppe des deux.
- Fascicule 61 : files Bc accolées (bandes de 2,50 m) et tandems Bt centrés chacun dans une bande de 3,00 m (art. 5.3), blocs glissant dans la
  largeur chargeable ; Mc120 et D240 glissants. Bc : deux camions par file à espacement libre (pas ≥ 10,50 m). **Mc120 : convoi d'engins à
  espacement libre, distance libre ≥ 30,50 m (art. 9 ; « convoi de deux chars » de la note PSIDP.EL)** — auparavant un seul engin (−3 à −52 %).
- δ (art. 5.5) par travée avec **G = ½(G_min + G_max)·L** (PONTYPE, PSIDA.EL, PSIDP.EL : δ reproduits exactement), S = poids le plus élevé des
  essieux plaçables sur la travée (fenêtre glissante ; convoi pour Mc120), un seul δ pour Bc et Bt. Réactions : appuis intermédiaires, δ max
  des deux travées ; **culées δ = ½[δ + max(δ ; 1,5)] pour B, ½[δ + max(δ ; 1,2)] pour Mc120** (PSI-DA 68 § 2.4.3, PSIDP.EL).
- **Convention de répartition Fascicule 61 : chaque charge reçoit le coefficient K et le δ de la travée qui la porte** (PSI-DA 68 § 2.2.2,
  PSIDA.EL, PSIDP.EL ; option `f61Convention: 'section'` pour l'ancienne convention). Eurocodes : K de la section (L_eq moyenne sur appui),
  comme CHAMOA. Option `sin2Phi` : minoration sin²φ_mec des moments d'exploitation (PSIDP.EL ; ni PSIDA.EL ni CHAMOA ne minorent).
- Flexion transversale Fascicule 61 (pratique SETRA) : dalle droite équivalente au biais mécanique (largeur 2b/sin φ, portée L_eq·sin φ,
  PSI-DA 68 § 2.5.2.1.2) ; trottoirs à la charge locale 4,5 kN/m² (art. 6), un trottoir ou les deux ; en fissuration peu nuisible, ELU avec
  ν = 0 (béton fissuré, PSIDA.EL, MRB-EL). Eurocodes : modèle CHAMOA (pas de transformation, ν de la dalle).
- Appareils d'appui : réaction de l'appareil le plus chargé par les **coefficients d'inégalité de répartition** de PSI-DA 68 § 2.4.2 (CP,
  A/UDL, B/TS, Mc120 ; reproduits sur la note PSIDA.EL à 0,3–1 %) au lieu de R/n (−35 à −60 % sous trafic) ; entraxe par défaut
  E/sinψ/(n − 0,1) ; contrôle u_g > min(a,b)/10 (appareil glissant, guide § 3.6.2) ; freinage Fascicule 61 disponible (`brakingF61`).
- Combinaisons BAEL / Fascicule 61 alignées sur les notes PSIDA.EL et PSIDP.EL : trottoirs cumulés avec A, B **et Mc120** (pas avec D240),
  tassements aléatoires à l'ELU avec 1,35 (1,125 × 1,2) et tassements probables seuls à l'ELS ; charges militaires et exceptionnelles selon
  l'itinéraire (Mc120, D240, les deux ou aucune). La note de calcul reproduit le tableau des moments extrêmes pondérés de PSIDA.EL à 0,1–0,5 %
  (ELU appui 2 : −5954,8 contre −5958,1 kN·m ; ELS 0,5 L travée 2 : 3622,2 contre 3624,1) — `test/note.test.js`.
- Unités : 1 t = 10 kN (A(l) = 2,3 + 360/(l + 12) kN/m², Bc = 300 kN) ; les programmes qui convertissent avec g = 9,81 donnent 1,9 % de moins.

## 1 bis. Résultats du benchmark CHAMOA-PSIDA (test/chamoa.test.js)

Exemple du chapitre 4 (10-15-15-10 m, 12 × 0,75 m, classe 2). CHAMOA applique au calcul ST1 un facteur KTRANS
par barre (max des fibres) et prend comme moment de calcul par mètre M_ST1/2b sur toute la largeur.

| Grandeur | CHAMOA | pontdalle | écart |
|---|---|---|---|
| M poids propre P1 / P2 [kN·m] | 3514,9 / 4507,4 | 3514,8 / 4507,3 | < 0,1 % |
| Le travée 1 / 2 [m] | 8,9118 / 11,1862 | 8,9119 / 11,1867 | < 0,1 % |
| M LM1 (poutre entière) à P1 [kN·m] | 2834,2/1,30464 = 2172 | 2157 | −0,7 % |
| KTRANS P1 (barre 2) | 1,30464 | 1,2996 | −0,4 % |
| KTRANS travée 1 | 1,35827 | 1,3276 | −2,3 % |
| m_x de calcul LM1 à P1 [kN·m/m] | 236,2 | 233,6 | −1,1 % |

| Gradient thermique +12 / −6 °C à P1 [kN·m] | 2819,9 / −1409,9 | 2818,6 / −1409,3 | < 0,1 % |
| Tassements aléatoires 1 cm à P1 [kN·m] | 1870,9 | 1870,9 | — (δ et −δ sur deux appuis adjacents, E/3) |
| Permanent kmin / kmax à P1 [kN·m] | 4132,4 / 4490,4 | 4132,0 / 4490,0 | < 0,1 % |
| ELS caractéristique à P1, poutre entière [kN·m] | 10 042 | 10 010 | −0,3 % |
| A_s inférieur mi-travée 2 (σs ≤ 300 MPa) [cm²/m] | 36,0 (431,7/12) | 36,4 | +1 % |
| A_s supérieur P1 / P2 [cm²/m] | 46,0 / 52,1 | 44,2 / 47,5 | −4 % / −9 % |
| A_s,min 9.2.1.1 ×1,2 (bt = 11,12 m) / 7.3.2 [cm²] | 165,2 / 75,8 | 165,2 / 74,1 | < 2 % |
| Biais mécanique travée 1 / 2 [gr] (Be = 12,253 m) | 82,5322 / 86,5105 | 82,5322 / 86,5105 | 10⁻⁵ |
| M_APF annexe 12A, travée 1 CARA max (MX 435,08, MY 114,89) [kN·m/m] | 288,10 | 288,10 | 10⁻⁴ (11 valeurs) |
| Véhicule spécial de chantier (2 × 100 kN × 1,5) à P1, KTRANS inclus [kN·m] | 451,05 | 435,1 | −3,5 % (roues dans la largeur chargeable) |

Formules de combinaison relevées dans la note et reproduites (combinations.js) : ELS caractéristique = G + Ta + max(T + ψ0·Q ; 0,6 T + Q_LM1 ; Q_LM2) ;
ELS fréquent = G + max(0,6 T ; 0,5 T + ψ1·Q_LM1 ; 0,75 Q_LM2) ; ELU = 1,35 G + 1,35 Q (ζ = 0 pour T et Ta).

**Aciers supérieurs d'appui — écart expliqué.** Les 551,8 cm² (P1) et 625,5 cm² (P2) de la note sont gouvernés par le **profil provisoire**
(phase de chantier : remblai de 0,50 m, enrobé 0,20 m, tombereaux 23/34 m³ avec δ = 1,5, LM3 VS), dont l'ELS caractéristique à P1 vaut
10 826 kN·m (tableau « profil provisoire ») contre 10 042 pour le profil définitif. Avec ce moment, le module de sections donne
556,2 cm² (+0,8 %) ; avec le moment du profil définitif, 513,6 cm². Le profil provisoire n'est pas modélisé ici (données des engins de
chantier non disponibles), les aciers d'appui de l'outil correspondent donc au seul profil définitif.

## 1 ter. Flexion transversale (H7)

Modèle : dalle isostatique équivalente de portée L_eq, isotrope, ν = 0,2, bords libres ; charges réelles diffusées à 45° jusqu'au feuillet
moyen (contact + 2·t_rev + h) ; séries de Fourier (15 harmoniques) ; charges roulantes centrées sur x = L_eq/2 ; enveloppe sur les positions
transversales ; thermique et tassements : m_y = ν·m_x pondéré par le profil de la réponse à une charge uniforme (nul aux bords libres).

Comparaison CHAMOA (fichiers 5.4 et §4.3) : poids propre « ossature seule » au centre de la travée 1 : CHAMOA 24,0 kN·m/m (variante ν = 0 :
−6,4), outil 36,4 (ν = 0 : +2,6) — CHAMOA traite le chanfrein en encorbellement (TRV_ENC = −6,46) et son terme de couplage ν correspond à
un m_x de ≈ 152 kN·m/m dont l'origine n'est pas documentée ; l'outil est du côté conservatif. Les aciers transversaux de la note
(14,1 / 17,3 cm²/m inf.) sont dimensionnés par M_APF = 288 / 351 kN·m/m, moment dans la direction des aciers transversaux (parallèles
aux lignes d'appui) de l'annexe 12A du BPEL. Cette transformation est reproduite exactement (`skew.js`, méthode.md § 8 bis) et
appliquée par l'outil : M_APF = 0,38 MX + 1,07 MY en travée 1, 0,28 MX + 1,17 MY en travée 2. L'écart résiduel porte sur les entrées :
MY caractéristique CHAMOA 114,9 contre 149 ici (travée 1, 15 harmoniques, charges locales diffusées), MX 435 contre 528 (max de travée
avec Ta + 0,6 T) → M_APF 359 / 417 contre 288 / 351 et aciers 18,6 / 21,8 cm²/m contre 14,1 / 17,3 (+30 %, du côté de la sécurité).

Note : le biais de 80 gr de l'exemple n'intervient pas dans le calcul longitudinal (CHAMOA calcule « en biais géométrique » sans correction).

## 1 quater. Benchmark Fascicule 61 / BAEL — note commentée PSIDA.EL (test/psidael.test.js)

Note de calcul commentée PSIDA.EL (SETRA, version 84-1, réimpression 1990, 70 p.) : pont-dalle BA 9,75 – 13,93 – 13,93 – 9,75 m,
abouts 0,35 m, biais 80 gr, rectangle équivalent 7,913 × 0,52 m (I = 0,092720 m⁴), chaussée 6 m + 2 trottoirs, classe 1,
QSUP 42,5 / 25,5 kN/m, fc28 = 30,6 MPa, fe = 400 MPa. Unités de la note : t et m (1 t = 10 kN). Bouton « Charger l'exemple PSIDA.EL ».

| Grandeur | PSIDA.EL | outil | écart |
|---|---|---|---|
| Aires des lignes d'influence (M appuis 2 et 3, M 0,4 L, R1, R3), par travée | ex. −5,314 / −11,316 / 2,952 / −0,422 | idem | ≤ 0,002 (20 valeurs) |
| Foyers de gauche travées 2 / 3 [m] | 3,166 / 2,960 | 3,166 / 2,960 | < 0,1 % |
| M permanent appui 2, g min / g max [t·m] | −181,39 / −205,36 | −181,20 / −205,14 | +0,1 % (moment de console des abouts, que la note néglige) |
| M permanent appui 3 g max ; R1 ; R3 [t, t·m] | −250,58 ; 55,1 ; 209,4 | −250,68 ; 55,15 ; 209,42 | < 0,1 % |
| Dénivellation 1 cm, matrice des moments et réactions (Ei) | ex. −49,77 / 94,01 / −56,40 | idem | < 0,2 % |
| Tassements aléatoires 1 cm (paires adjacentes, Ev = Ei/3) appuis 2 / 3 [t·m] | 50,14 / 45,84 | 50,14 / 45,84 | < 0,1 % |
| Portée équivalente biaise travée 1 [m] ; θ | 9,017 ; 0,44 | 9,0174 ; 0,439 | méthode des **flèches** (la méthode des moments donne 8,660) |
| Biais mécanique ; travée droite équivalente [m] | 86,574 gr ; 8,818 | 86,574 ; 8,818 | 10⁻⁵ |
| Lignes d'influence de K, fibres −3,96 / −3,00 / 0 (25 points) | ex. K(b,b) = 1,9199 | 1,9065 → écart rms 0,1 % | **ν = 0** (avec ν = 0,2 : écart rms 5 %) |
| Coefficients de répartition travée 1 : trottoirs / A / Bc (hors bc) / Bt / Mc120 | 1,129 / 1,024 / 1,052 / 1,023 / 1,127 | 1,127 / 1,024 / 1,054 / 1,023 / 1,123 | < 0,4 % |
| δB, δMc travée 1 (G = ½(G min + G max)·L, défaut) | 1,201 / 1,238 | 1,2015 / 1,2379 | 0,0 % |
| A(l) : 0,4 L travée 1 / appui 2 / 0,5 L travée 2 [t·m] | 125,46 / −146,54 / 155,68 | 125,47 / −146,53 / 155,70 | < 0,1 % |
| B = max(Bc, Bt) : 0,4 L travée 1 (Bt) / 0,5 L travée 2 (Bt) / appui 2 (Bc) | 138,20 / 155,03 / −151,50 | 138,20 / 154,99 / −151,49 | < 0,1 % |
| Mc120 : 0,4 L travée 1 / 0,5 L travée 2 / appui 2 | 204,11 / 232,61 / −169,90 | 203,77 / 232,54 / −169,80 | −0,2 / 0,0 / −0,1 % (v0.9 : +6,4 % sur appui) |
| Trottoirs 0,4 L travée 1 / appui 2 | 3,52 / −5,56 | 3,38 / −5,33 | −4 % (la note charge 1,00 m de trottoir réel, l'outil 0,9565 m de largeur équivalente) |
| ELS appui 2 = G + 1,2 B + trottoirs [t·m] | −392,71 | −392,23 | −0,1 % |
| ELU appui 2 = 1,35 (G + tass.) + 1,6 B + 1,6 trottoirs [t·m] | −595,81 | −595,49 | −0,1 % |
| A_s ELU appui 2 (groupes de 3 HA25, d = 0,4575 m) [m²] | 0,0425 | 0,04243 | −0,2 % |
| Flexion transversale : μ₁ / μ₃ / μ₅ à l'axe (ν = 0,2, θ = 0,459) | 0,1848 / 0,0692 / 0,0416 | 0,1848 / 0,0693 / 0,0416 | < 0,2 % |
| MY sous A(l) à l'axe / fibre 2, travée 1 (ν = 0) [t·m/m] | 1,470 / 1,886 | 1,468 / 1,903 | −0,1 / +0,9 % |

Ce que la comparaison a appris (et corrigé dans l'outil) :
1. **PSIDA.EL et CHAMOA ne font pas les mêmes choix** : PSIDA.EL calcule L_eq par la flèche à mi-travée et K avec ν = 0 (tables de
   Massonnet) ; CHAMOA calcule L_eq par les points de moment nul et K avec ν = 0,2. Les deux couples sont disponibles (`leqMethod`, `nu`) ;
   l'écart sur K de rive est de 5 à 8 % entre les deux. Par défaut l'outil suit CHAMOA (Eurocodes).
2. **Bc** : camions d'une même file à espacement libre (positions de la note : 0,97 et 25,07 m pour une même file). Le convoi rigide
   à 4,50 m sous-estimait Bc de 9 % (0,4 L) à 22 % (0,5 L travée 2). **Corrigé.**
3. **Bt** : tandems dans l'axe de bandes de 3 m (la note : coefficient 1,023 = moyenne des K aux roues ±0,5 et ±2,5 m). **Corrigé**
   (auparavant bandes de 2,50 m : K = 1,054, +3 %).
4. **δ** : un seul coefficient pour le système B, S = poids maximal des essieux plaçables sur la travée (54 t par file de Bc sur 13,93 m
   avec deux camions à espacement minimal). **Corrigé** (auparavant 30 t par file sous 16,5 m et δ distinct pour Bt).
5. **Convention** : PSIDA.EL affecte à chaque charge le K et le δ de la travée qui la porte ; c'est désormais la convention par défaut de
   l'outil pour le Fascicule 61 (v0.9 : K à L_eq moyenne et δ max sur appui, +6,4 % pour Mc120 sur l'appui 2 ; −2 à −7,5 % sur les minima
   de travée centrale du 2e exemple PSIDA.EL).
6. **Flexion transversale** : PSIDA.EL calcule MY à l'ELU avec ν = 0 (béton fissuré) et à l'ELS avec ν = 0,2 ; les roues y sont des
   charges sans diffusion transversale (Bc à l'axe 3,274 t·m/m contre 2,675 dans l'outil, qui diffuse à 45° jusqu'au feuillet moyen
   dans les deux directions). L'outil suit CHAMOA (ν = 0,2, MY 117 contre 115 kN·m/m sur l'exemple CHAMOA) : il est donc du côté de la
   sécurité vis-à-vis de PSIDA.EL pour les charges réparties, et en retrait pour les roues isolées. Les facteurs d'étalement
   longitudinal de la note sont rapportés à la portée biaise 9,017 m.

## 1 quinquies. Vérification sur les autres documents SETRA et notes de calcul (v0.10)

Chaque document a été lu en entier et confronté à l'outil ; les tests correspondants sont dans `test/`.

| Document | Ce qui est vérifié | Résultat | Test |
|---|---|---|---|
| **2e note PSIDA.EL** (annexe du guide PSI-PAP, SETRA 1986) : 3 travées 14,50 – 24,60 – 14,50 m, biais 90 gr, 13,90 × 0,72 m, classe 1, 3 voies | lignes d'influence, foyers, permanent, réactions, L_eq, biais mécaniques 92,649 / 95,097 gr, A(l), B, trottoirs, réactions trafic, ELS/ELU, μ et MY | ≤ 0,3 % après correction de A(l) par zones (−51 % auparavant à 0,1 L de la travée 2), de la convention par travée (minima de la travée centrale −7,5 %), du tranchant et des trottoirs locaux en flexion transversale (÷3) | `psipap.test.js` |
| **Note modèle PSIDP.EL** (SETRA 1985), parties hors précontrainte : 4 travées 13,50 – 17,61 – 17,61 – 13,50 m, biais 80 gr | lignes d'influence (34 valeurs), permanent, L_eq (flèches), biais mécanique, sin²φ, δ, K des roues à 10⁻⁴, coefficients correctifs, A, B, trottoirs, convoi de deux Mc120, réactions, δ de culée 1,338 / 1,186, μ₁₋₃₋₅, MY | ≤ 0,5 % ; a révélé le convoi Mc120 (−52 % sur appui auparavant), A(l) par zones (−16 %), les abouts (réactions de culée −5 à −15 %) | `psidpel.test.js` |
| **Mémoire « programme PSI DA »** (programme interne PSDPV contre PSIDP-EL), travée isostatique 25,60 m | permanent avec abouts, K (ν = 0), δ, moments A/Bc/Bt/Mc120 (≤ 0,05 %), μ (tables ITBTP), réactions de rive avec trafic sur l'about, rotations d'appui | conforme ; rotations par ligne d'influence à +2,5 % (au lieu de +20 à +28 % par l'enveloppe des moments) | `progpsida.test.js` |
| **PSI-DA 68 – Méthode de calcul** (SETRA 1968-73) | formules : foyers, L_eq (flèches, 10⁻⁹), K (10⁻¹³), δ, Bc à 2e camion libre, ligne d'influence de poutre à infinité de travées (inégalité de répartition) | conforme ; coefficients d'inégalité de répartition introduits (reproduisent la note PSIDA.EL à 0,3–1 %) ; δ de culée ; dalle droite équivalente au biais en flexion transversale ; trottoirs ×3 | `psida68.test.js` |
| **Pont de Noé** (COMETE/ICI 2012, VIPP 4 × 33 m, PONTYPE/PAP ; note d'appuis EN 1337-3) | K et μ₁₋₃₋₅ pour α = 0,148 (4 fibres × 105 points), coefficients A/Bc/Bt/Mc120/trottoirs, A(l), a1, a2, bc, δ (G moyen), moments par poutre, freinage F61, appareil 400 × 400 | K à 10⁻³ avec l'interpolation √α (désormais par défaut) ; tables a1/a2/bc/bt de la classe 1 confirmées ; l'outil (BT4 1989) est plus sévère que l'EN 1337-3 en distorsion | `noe.test.js` |
| **Guide « Ponts-dalles » 1989** (relecture page par page, 40 règles) | élancements, abaques, travures, abouts, minimum transversal, chevêtres, bords libres, angles, appareils d'appui, biais | conforme sauf : élancement PSI.DP à 2 travées inversé, abaque BA (rive la plus courte), minimum 1,3η par travée, appareil glissant — corrigés | `guide89.test.js` |
| **Guide PSIDP-EL, note modèle complète et annexes 2 à 6** (scans fournis) | coefficients d'inégalité de répartition de la note (p. 52, 3 et 4 appareils, CP / A / Bc / Mc120), entraxe E/sinψ/(n − 0,1), moment de chevêtre R·ℓ/(12 e) ; annexe 4 : coefficients s(α), t(α), u, parts rive/centre, d, ζ, bandes de ferraillage | coefficients à 0,5 % (Bc 2,057 / 2,162 contre 2,055 / 2,161) ; annexe 4 implémentée (`chevetre.js`) et recalée sur les rapports rive/centre du mémoire (CP et A à 0,1 %) ; chevêtres incorporés calculés pour chaque ligne d'appui | `chevetre.test.js` |
| **Pont de Noé — note des appuis et fondations** (COMETE/ICI 2012, programme PSH ; PP73, FOND 72, F62-V) | souplesses des appareils (T_e/(nGab)), rigidités des lignes 1780 / 1050 / 996 t/m, centre de déformation 56,80 / 56,905 m, freinage Bc et A(l), TLD / retrait / fluage / TCD par ligne, combinaisons C1/C8 en tête de P3, descente en pied (P3 1348,89 / 1426,98 t ; C1 415,66 / 601,55 t, M 263,93 / 323,24 t·m), pieux 475,66 t et 50,35 / 100,04 t, flambement λ = 85,44 / 25,98, Ménard k = 6756 / 9120 t/m³, minimum des pieux, bielles 501,5 cm² | ≤ 0,2 % (efforts horizontaux ≤ 1 %, bielles 0,5 % : la note retient 501,53 cm² pour 498,9 par la formule) ; la note imprime P4 et C5 en valeur absolue et combine en P3 le freinage positif avec le retrait négatif (non défavorable : l'outil cumule en valeur absolue) ; a1 = 0,75 pris pour 2 voies (devrait être 1) ; poids de semelle de P3 incohérent avec sa largeur | `noe_appuis.test.js` |
| **MRB-EL** (SETRA 1995, biais et courbes) | domaine de la méthode du pont droit, ν = 0 pour les efforts BAEL | compatible avec H6 ; le texte en ligne s'arrête au bordereau (pas d'exemple chiffré exploitable) | — |

Restent hors périmètre : la précontrainte (PSIDP.EL), la
vérification NF EN 1337-3 des appareils d'appui (l'outil applique le BT4 du guide 1989, plus sévère en distorsion lente), les tableaux a1/bc
des classes 2 et 3 (aucun document de la série ne les imprime), la flexion transversale sous roues (PSI-DA 68 et PSIDA.EL prennent des roues
ponctuelles transversalement et le seul tandem arrière de Bc : l'outil diffuse à 45° et charge tout le convoi — ±10 à 20 % selon la fibre).

## 1 sexies. Appuis et fondations (v0.13, `src/supports/`)

Choix retenus (justifiés dans les en-têtes des modules) :

- **Efforts horizontaux** : souplesse d'une ligne = appareils (G = 1,8 / 0,9 MPa) + fût console H³/(3EI) ; fondation supposée
  rigide (la souplesse des pieux — matrice de tête du programme PSH — n'est pas encore ajoutée) ; culée remblayée rigide.
  Freinage au prorata de K instantané, déformations imposées H = K ε (x₀ − x) (K différé pour retrait, fluage, TLD ; instantané pour TCD).
- **Combinaisons** : BAEL 91 annexe D (1,35 G + 1,35 (retrait + fluage) + 1,605 (Q + freinage) + 0,78 TLD ; Mc120 × 1,35 ;
  ELS 1,2 / 0,6) et EN 1990 A2 (1,35 / 1,5 ψ₀ T) ; efforts horizontaux cumulés en valeur absolue.
- **Fûts** : section N-M à fibres (pivots BAEL / EC2), armatures symétriques ; second ordre BAEL forfaitaire (A.4.4,3) si
  l_f/h ≤ max(15 ; 20 e₁/h), sinon moment amplifié N(e₁ + e_a)/(1 − N/N_cr) avec E_v (simplification de l'état limite de
  stabilité de forme) ; EC2 λ_lim puis courbure nominale (K_r = K_φ = 1). Flexion transversale (déviée) non traitée.
- **Culées** : garde-grève et murs en retour par les formules de pratique PP73 (TODO_VERIF : texte non consulté) ;
  poussée de Rankine sur le mur de front (garde-grève compris) ou sur une largeur fictive min(3D ; entraxe) par colonne.
- **Fondations** : semelles NF P 94-261 (k_p du tableau D.2.3 — vérifié sur les k_p,max du guide Cerema —, i_δ, Meyerhof,
  glissement) ou F62-V (q_ref = (3q_max + q_min)/4, γ_q = 2 / 3) ; bielles ; pieux : semelle rigide, Winkler-Ménard
  (différences finies, vérifié sur la solution de Hetényi), portance NF P 94-262 simplifiée (une couche ; f_sol et k_p à relire).
- **Écart signalé** : la note de Noé applique au tirant de la semelle de culée l'effort total (601,6 t) ; la formule des bielles
  à deux files porte sur la réaction d'une file — c'est ce que fait l'outil.

## 1 septies. Relecture des textes et intégrations (v0.14)

- **Fondations** : modules `src/geotech/` copiés du dépôt `fondation` (bureau de calcul fond.ksr-infra.org, 170 tests) —
  Fascicule 62 titre V (k_p par classe, Φ₁/Φ₂, q'_ref, γ_q, pieux annexe C.3 et courbes Q1–Q7), NF P 94-261 (k_p, i_δ, γ_R;v,
  γ_R;d;v, γ_R;h = γ_R;d;h = 1,1), NF P 94-262 (modèle de terrain), effet de groupe. Relus sur les textes du Drive
  (rapports `ref/reports/f62v.md`, `nfp94261.md`, `fond72.md`).
- **Semelles sur pieux** : PP73 pièce 1.3.2 ch. 4 — tirant par couple de pieux avec R = réaction d'un pieu (la note de Noé
  applique la charge totale de la semelle : 501,5 cm² au lieu de 82,97 cm² par couple), bielles à 45° au moins, hauteur
  minimale, répartition, ancrage, poinçonnement ; file unique : poutre sur pieux et moment M/n en tête des pieux.
- **Ménard** : la formule reproduite sur Noé est le module de courte durée (2 E_s du F62) ; enveloppe courte/longue durée.
- **Séisme** : moteur de Pont EC8 (dépôt `ouvpara`, EN 1998-2, guide Cerema 2015) intégré en module ES (`src/vendor/pont-ec8.mjs`) :
  le projet est construit par `src/ec8export.js`, les efforts par appui (100/30/30, UBDP) entrent en combinaison sismique
  G + A_Ed avec matériaux accidentels. Non compris : inertie propre des fûts, surpoussée dynamique des terres.
- **Chocs** : EN 1991-1-7 tableau 4.1 (véhicules) et C.3 (bateaux fluviaux CEMT), valeurs recommandées à confronter à
  l'annexe nationale ; force maximale dans le sens longitudinal, une seule colonne touchée.

## 1 octies. Profil pressiométrique et appuis seuls (v0.15)

- **Profil pressiométrique** par couches (profondeurs depuis le terrain naturel, classe F62, p*_l, E_M, α) : semelles —
  p*_le moyenne géométrique sur [D ; D + 1,5 B] (F62 E.2) ou [D ; D + h_r] (NF P 94-261), D_e = (1/p*_le)∫₀ᴰ p*_l dz,
  k_p de la couche d'assise ; pieux — frottement couche par couche depuis la tête (sous la semelle), pointe dans la couche
  porteuse ; module de Ménard couche par couche le long du pieu (Winkler à raideur variable).
- **Appuis seuls** : le module appuis, fondations, séisme et chocs fonctionne pour un tablier quelconque (poutres, caisson,
  dalle précontrainte) à partir des réactions caractéristiques saisies par ligne et des appareils (imposés ou choisis
  dans la gamme standard) ; note de calcul « appuis et fondations » seule (HTML et Word).

## 1 octies. Profils pressiométriques, appuis seuls, interface en onglets (v0.15)

- **Profils pressiométriques** par sondage (« [SP1] » puis une couche par ligne : z0, z1, classe F62, p*_l, E_M, α ;
  profondeurs depuis le terrain naturel), un profil associé à chaque ligne d'appui. Semelles : p*_le moyenne géométrique sur
  [D ; D + 1,5 B] (F62 E.2) ou [D ; D + h_r] (NF P 94-261), D_e = (1/p*_le)∫₀ᴰ p*_l dz, k_p de la couche d'assise ; pieux :
  frottement couche par couche depuis la tête, pointe dans la couche porteuse ; Ménard couche par couche le long du pieu.
- **Appuis seuls** : appuis, fondations, séisme et chocs pour un tablier quelconque (poutres, caisson, dalle précontrainte)
  à partir des réactions caractéristiques saisies par ligne ; note « appuis et fondations » seule (HTML et Word).
- **Interface en onglets** (Projet, Conception, Tablier, Ferraillage, Compléments, Appuis et fondations, Notes de calcul),
  adresse #onglet/d=… partageable comme auparavant.

## 1 nonies. Ponts à poutres (v0.16, `src/beams/`)

- Travées indépendantes, réseau poutres + hourdis de Guyon-Massonnet : ρ_p = I/b₁, γ_p = K/(2 b₁), hourdis ρ_e = γ_e = h_d³/12,
  θ = (b/L)(ρ_p/ρ_e)^¼, α = (γ_p + γ_e)/(2√(ρ_p ρ_e)) ; interpolation de Massonnet en √α ; le modèle de dalle (SlabDeck) est
  utilisé avec la portée de Guyon L/(ρ_p/ρ_e)^¼ et α, les fibres de calcul étant les axes des poutres (M_k = m_x(y_k) b₁).
- Validé sur la sortie PONTYPE/PAP du Pont de Noé (`test/poutres.test.js`) : θ, α exacts ; A et Mc120 par poutre ≤ 0,3 % ;
  Bc −1,7 % en rive (placement transversal, cf. § 1 quinquies) ; trottoirs ≤ 1 % ; ELS/ELU ≤ 0,6 % ; permanentes rive 0,2 %,
  poutre 2 −1,2 % (coefficients QSUP de PAP non reproduits exactement pour les superstructures de rive hors largeur active,
  extrapolées linéairement).
- Efforts tranchants par poutre = V du tablier × η/n ; réactions par ligne (travées indépendantes) par lignes d'influence sur
  deux travées et δ d'appui ½[δ + max(δ ; 1,5 ou 1,2)] — reproduit les réactions de culée du modèle de dalle.
- Dimensionnement : poutre en T en BA (ELU) ; poutre précontrainte : vérification simplifiée des contraintes à mi-travée sur
  section composite avec P∞ et e₀, et précontrainte minimale de Guyon — ne remplace pas un calcul phasé (PONTYPE/BP).

## 1 decies. Dispositifs de retenue — indice de danger (v0.17, `src/ddr/indice.js`)

Guide méthodologique Cerema « Choix des performances d'un dispositif de retenue sur ouvrage d'art — Méthode de calcul de
l'indice de danger » (novembre 2021, remplace le guide GC SETRA 2002) : ID = ID1 + max(ID2 ; ID3) arrondi à l'entier
supérieur, tableaux 1 à 18 (trafic à 15 ans × 1,25, tracé, profil, conflit, longueur de franchissement, viabilité hivernale,
hauteur de chute, hauteur d'eau, voie franchie, voie ferrée, habitations, zones sensibles, coefficient K des poids lourds),
niveaux N / H2 / H3 / H4b, cas particuliers (voie ferrée, grande route franchie : H2 minimal), objectifs secondaires
(véhicules légers, écran de chargement, piétons). Effort de choc sur le dispositif : EN 1991-2 § 4.7.3.3, classes A à D
(valeurs recommandées, classe à confirmer selon le produit et l'annexe nationale). Le guide ne donne pas d'exemple chiffré :
les tests vérifient les bornes des tableaux et un exemple calculé à la main.

## 1 undecies. Piles en rivière (v0.18, `src/supports/water.js`)

- Courant : EN 1991-1-6 § 4.9, expression (4.1) F_wa = ½ k_wa ρ_w h b v², k_wa = 1,44 (section carrée ou rectangulaire) ou 0,70 (circulaire). La valeur k_wa est confirmée par la fiche NBN EN 1991-1-6 (Buildwise). La répartition est supposée triangulaire (maximum en surface), avec une résultante à 2h/3 au-dessus du lit (hypothèse PSIDA).
- Embâcles : expression (4.2) F_deb = k_deb A_deb v², k_deb = 666 kg/m³ (valeur recommandée). Le radeau (hauteur, largeur) est saisi.
- Combinaisons de crue :
  - BAEL : 1,35 G + 1,5 F_eau à l'ELU, G + F_eau à l'ELS, sans trafic (comme le vent, annexe D) ;
  - EC : 1,35 G + 1,5 F_eau + 1,35 ψ₀ Q à l'ELU (ψ₀ TS 0,75, UDL 0,4), G + F_eau + ψ₀ Q à l'ELS caractéristique.
  - À confirmer selon le CCTP.
- Poussée d'Archimède : ρ g V au niveau des PHE, sur le fût et la semelle.
- Affouillement local : FHWA HEC-18 (équation CSU), y_s = 2,0 K₁ K₂ K₃ a^0,65 y₁^0,35 Fr^0,43.
  - K₁ : avant-bec carré 1,1, arrondi ou cylindre 1,0, pointu 0,9, et 1,0 si θ > 5°.
  - K₂ = (cos θ + L/a sin θ)^0,65 avec L/a ≤ 12 ; contrôlé contre le tableau K₂ à 10 % près.
  - K₃ : état du lit.
  - Plafond : 2,4 a si Fr ≤ 0,8, 3,0 a au-delà.
  - Affouillement général et de contraction : saisi (étude hydraulique).
- Conséquences sur la fondation :
  - semelle : base exigée sous le fond affouillé ; D_e et q₀ sont comptés sous ce fond ;
  - pieux : la longueur dégagée n'a ni réaction latérale ni frottement ; la portance est recalculée à pointe inchangée ;
  - moment transversal réparti sur les pieux de la file.
- Non traités : protections, piles complexes (HEC-18 § 7.4), affouillement autour des groupes de pieux, flambement du fût avec la longueur libre accrue.

## 1 duodecies. Relecture PP73 (v0.19.1)

Rapport détaillé : vérification des règles d'appuis sur les pièces PP73 1.1.2, 1.1.3, 1.2.3, 1.3.1 et 1.3.2 (Drive de l'auteur).

- **Conformes :**
  - moments du garde-grève : la combinaison redonne le tableau du § 2.3.3 ;
  - méthode des bielles des semelles sur deux files (ch. 4) ;
  - poussée (h/3 + 0,5) t/m² des murs en retour ;
  - 0,2 % des fûts ;
  - 0,12 % par nappe des semelles.
- **Corrigés :**
  - épaisseur du garde-grève : 0,20 / 0,10 + 0,10 h / 0,30 m ;
  - face avant du garde-grève : M' = −3,2 t·m/m ;
  - charges des murs en retour à 1 m de l'extrémité, et murettes (ℓ ≤ 2,5 m) à 5 tf / 3 tf ;
  - épaisseur minimale des murs en retour 0,20 m et 2 cm²/ml ;
  - minimum des chevêtres : 0,5 % pour l'ensemble des nappes, au lieu de 0,5 % par face ;
  - 20 cm² minimum par colonne, poteau ou voile de moins de 1 m² ;
  - hauteur minimale des semelles sur pieux : max(0,60 ; 1,4 Ø) ;
  - poinçonnement vérifié seulement pour les pieux d'angle des semelles sur plus de deux pieux, avec θ ≥ 45° ;
  - avertissements géométriques : colonnes Ø ≥ 0,60 m, chevêtre ≥ 0,60 × 0,70 m, B ≥ 1,50 m, entraxe ≥ 3 Ø, B ≥ 4,5 Ø.
- **Ajoutés en v0.20 :**
  - torsion du chevêtre de pile-culée (§ 2.2.4, BAEL A.5.4 / EC2 6.3.2) ;
  - charges de la dalle de transition (15 + D) t/ml (11 t/ml sans dalle), du garde-grève et des murs en retour ou murettes en bout du chevêtre de culée ;
  - pile-culée apparente : poussée sur la partie haute seulement (§ 3.1.3.1, i = 1/3, p = 15 kPa, à 0,6 h₁) ;
  - vérification de la culée sans tablier (§ 3.1.4.6, G favorable) ;
  - voile sur une file de pieux en paroi fléchie (§ 4.4, BAEL annexe E.5). Formules relues dans J. Perchat, Techniques de l'Ingénieur C 2 314 § 2.7.3 : paroi si h ≥ l/2, z = 0,2 (l + 1,5 h) ou 0,5 l (travées continues), l = min(l_axes ; 1,15 l_nus), A sur 0,15 h_a. Torsion relue dans C 2 308 § 1.4 : b₀ = D/6, τ_uT² + τ_uV² ≤ τ_lim² ;
  - colonnes de piles-culées armées à environ 2 % (1.1.3 § 2.3.2) ;
  - garde-grève de 0,30 m si la dalle de transition s'y appuie ;
  - avertissements H/V > 0,20 (pieux inclinés) et Ø ≥ 0,80 m pour une culée sur une file.
- **FOND 72 :** remplacé par le Fascicule 62 V et l'Eurocode 7 (NF P 94-261/262), qui sont ceux codés ; seuls les fascicules 2 et 3.1-3.2 sont lisibles dans le Drive. Les k_p, le frottement et le module de Ménard ne sont donc pas vérifiables sur ce texte. Le Fascicule 62 V codé reste cohérent avec la partie lue (coefficients 3 et 2, q'_ref aux 3/4 de la largeur comprimée).

## 1 terdecies. Fondations sur pieux — modèle PSH (v0.22, `src/supports/psh.js`)

Le modèle reprend les principes du programme SETRA/CETE de l'Ouest PSH (« Calcul des appuis d'ouvrages d'art », v. 1.11, 1993).

- **Semelle :** rigide.
- **Pieux :**
  - verticaux ou inclinés, file par file ;
  - tête encastrée ou articulée, pied libre ou encastré ;
  - rigidité axiale E A/L : pieu en colonne, pointe fixe (convention PSH) ;
  - rigidité transversale : poutre de Winkler en différences finies, avec le module de Ménard couche par couche ;
  - matrice 2 × 2 de tête obtenue par l'énergie.
- **Groupe :**
  - matrice de rigidité 3 × 3 (V, M, H), assemblée par les matrices de passage de chaque pieu ;
  - plan longitudinal, plus un plan transversal pour le séisme Y et la crue ;
  - les efforts et les profils des deux plans sont cumulés (résultante pour la section circulaire).
- **Charges instantanées et soutenues :**
  - charges soutenues : modules différés du béton (E_v, ou E_cm/3), sol k × kSus ;
  - kSus = ½ par défaut (F62 C.5) ; PSH laisse ce choix à l'utilisateur, et la note du Pont de Noé prend 1 ;
  - les deux parts sont calculées séparément puis superposées.
- **Matrices de souplesse de la tête d'appui :**
  - fût et chevêtre en consoles, semelle rigide, groupe de pieux ;
  - u/T entre dans la répartition des efforts horizontaux entre lignes d'appui : la fondation sur pieux n'est plus supposée rigide ;
  - une fondation superficielle reste supposée rigide (rotation de la semelle non prise en compte).
- **Contrôle sur la pile P3 du Pont de Noé (sortie PSH) :**
  - souplesses : w/N et θ/M à 0,3 % près ; θ/T à 0,6 % (instantané) et 1,6 % (soutenu) ; u/T à 3,8 % ;
  - efforts en tête de pieu et profil M, T, y, p le long du pieu à 3 % près (test/psh.test.js).
- **Effort tranchant des pieux :** section circulaire avec b_w = D et d = D/2 + 2 r_s/π ; BAEL A.5.1 ou EC2 § 6.2.
- **Semelles sur plusieurs files :**
  - bielles généralisées, tirant R (|x| − b/4)/h par pieu (identique à PP73 pour deux files) ;
  - angle de bielle ≥ 45° ;
  - contrôle en flexion au nu du fût.
- **Compléments (v0.23)** — modules `lateral`, `frottement-negatif`, `tassement-pieu` et `tassements` du dépôt fondation :
  - **Réaction du sol :** palier B p*_f (F62 C.5, NF P 94-262 I), avec modules sécants itérés nœud par nœud ; la réduction est commune aux pieux du groupe. Minoration près de la surface 0,5 (1 + z/z_c). p*_f vient de la 7e colonne des couches ou des essais, à défaut p*_l/2 (hypothèse PSIDA).
  - **Remblai traversé par les pieux des culées :**
    - poussée K_a (γ σ + q) sur une largeur min(3 Ø ; entraxe) (hypothèse PSIDA), en charge répartie sur chaque pieu (cas de charge du pieu de Winkler et forces équivalentes) ;
    - module et p*_f du remblai saisis ;
    - pas de frottement dans le remblai.
  - **Frottement négatif (Combarieu, F62 G.2 / NF P 94-262 H) :**
    - couches compressibles : A et argiles jusqu'à h₂ (automatique ou saisi) ;
    - pieu isolé et groupe (rayon d'influence, répartition empirique) ;
    - cumul N_G + max(1,35 G_sn ; N_Q) ;
    - portance sans frottement au-dessus de la hauteur d'action.
  - **Tassement :** pieu isolé par Frank et Zhao, plus le bloc par une semelle fictive aux 2/3 de la fiche (Ménard) ; contrôle forfaitaire 0,6 % Ø.
  - **Semelle sur 4 pieux sous un poteau :** méthode de Blévot (BAEL, Perchat C 2 314 § 6.3.3) ; 3 pieux codés mais non saisissables par files.
  - **Semelles superficielles :** rotation sur le sol (k_v de Ménard, k_i = 2 k_v, F62 F.3) dans la répartition des efforts horizontaux.

## 1 quaterdecies. Schémas et figures (v0.24, `web/guide_schema.js`, `web/note_figures.js`)
- Onglet Projet et chapitre 1 de la note : élévation et coupe transversale dessinées au trait dans la représentation du guide
  SETRA « Ponts-dalles — guide de conception » (1989, § 2.1 profils en long, § 2.3 coupes transversales et encorbellements) :
  tablier mince avec garde-corps, piles voiles ou colonnes avec chevêtre, semelles et pieux, culées remblayées (mur de front,
  mur en retour en tireté), enterrées (sommier sur colonnes noyées) ou apparentes (colonnes devant le talus), talus 3/2
  figuré par des traits rayonnants issus de la crête, terrain naturel hachuré, point fixe, cotes ; encorbellements tramés,
  corniches, trottoirs et bordures, chaussée en toit, voies EN 1991-2, charges de superstructure saisies (bandes et charges
  linéiques avec k min / k max), appareils d'appui, ordonnées de calcul. Dessins de principe : échelle verticale amplifiée.
- Note globale : lignes d'influence, enveloppes M et V, réactions, sections d'acier requises, plans de ferraillage ;
  appuis : raideurs et répartition du freinage, schéma à l'échelle de chaque appui (eau, affouillement), contraintes sous
  les semelles superficielles (diagramme du bureau de calcul fond.ksr-infra.org), profils M(z), y(z), p(z) du pieu le plus
  sollicité ; sondages pressiométriques. Les mêmes figures apparaissent dans l'onglet Appuis et fondations. En Word, les
  figures SVG sont converties en images.

## 1 quindecies. Dalle précontrainte PSI-DP (v0.25, `src/psidp/`)
- Câble moyen (toute la largeur) : paraboles z = A x² + B x + C par tronçon, z depuis la fibre moyenne de la section brute.
  Tracé automatique : ancrages sur la fibre moyenne aux culées, sommets sur appuis intermédiaires à (enrobage + Ø/2 + 7 mm)
  de la fibre supérieure, points bas à 0,4 L (rives) / 0,5 L à la même distance de la fibre inférieure, raccordements sur a·L.
- Section nette B_n = B − n A_gaine, I_n(x) = I − n A_gaine z², v et v′ bruts (convention PSIDP-EL).
- Frottement exp(−f α − φ x) ; α = variation totale de pente (option : grille des dixièmes du programme PSIDP, qui saute
  les points d'inflexion) ; recul d'ancrage ∫₀^d 2[σ(x) − σ(d)] dx = g E_p ; raccourcissement ½ (E_p/E_ij) σ̄_bj, σ̄_bj =
  contrainte moyenne au niveau du câble sous la précontrainte seule (point fixe) ; P1 = 1,02 σ_p0 − 0,8 Δσ,
  P2 = 0,98 σ_p0 − 1,2 Δσ.
- Pertes différées BPEL 3.3,2 avec terme □ de l'annexe 2 ; fluage K_fl E_p σ_b/E_i28, σ_b sous C.P. moyennes +
  précontrainte finale moyenne (iso + hyper), itéré jusqu'à convergence ; r(j) = 0,5 à la mise en service.
- Moments de calcul des charges = max_y m_x · 2b (répartition de Guyon-Massonnet comprise, comme PSIDP-EL) ; C.P. et
  ossature min / max par les coefficients k ; rare G + max(1,2 A ; 1,2 B ; Mc ; D) + trottoirs (+ 0,6 T) ; fréquente
  G + 0,6 (A ou B + trottoirs) (+ 0,5 T) ; ELU 1,35 G + 1,6 (A|B + trottoirs) | 1,35 Mc + 1,6 trottoirs | 1,35 D.
- Phases : mise en tension (ossature + P1, f_cj), mise en service (P1), service définitif (P2), comme PSIDP-EL.
- Classe II : section d'enrobage = bande de 3 Ø gaine centrée sur le câble ; pas de traction dans l'enrobage en quasi
  permanente et fréquente ; −f_t28 (rare) et −f_tj (mise en tension) dans l'enrobage, −1,5 f_t ailleurs ; compression
  0,6 f_cj, 0,6 f_c28, 0,5 f_c28 (quasi permanente, que la note modèle ne vérifie pas).
- ELU : M_lim par équilibre (parabole-rectangle, pivots), surtension σ_p − σ_p2 comptée comme armature (σ_p ≤ f_peg/γ_p),
  terme 5 σ_b du BPEL négligé ; armatures passives complémentaires calculées si nécessaire.
- Tranchant : section à h/2 de l'axe d'appui, V_red = V + F sin α + V_hyp (la note modèle majore le relevage de 1,42 à
  l'ELU ; PSIDA ne le majore pas, +1,9 % sur l'exemple), τ = V_red/(b_n 2h/3), b_n = b_inf − n Ø/2. Minimum d'armatures
  d'âme 0,1 MPa (note modèle ; BPEL 7.4 : 0,4 MPa pour les poutres).
- Flexion transversale (v0.26) : poussée au vide p = −F2 · 2Ā⁺/2b (Ā⁺ moyenne des A > 0 de la travée ; la note divise
  par 9 m, point non élucidé), m_y par le noyau de Guyon-Massonnet des C.P. (écart 3,5 % avec MY_PREC de la note à p
  égal), minimum × F1,MS/F2,ES ; aciers transversaux BAEL recalculés avec m_y(P) ajouté aux combinaisons (sans l'effort
  normal des facettes biaises).
- Flèches (v0.26) : poutre continue, inertie brute, moments réels ; E_ij pour l'instantané, C.P. à long terme
  (1 + K_fl) w(E_i28), précontrainte par fluage K_fl w(P∞ moyenne, E_i28) — note modèle à 0,1-0,3 mm près sauf la
  précontrainte instantanée (8,8 mm pour 8,5) ; flèche finale 4,9 mm pour 4,4.
- Recherche du tracé (v0.27, option par défaut) : paramètres λ_j (excentricité du point bas / maximale, de −0,5 à 1),
  μ_i (excentricité sur appui / maximale, de 0 à 1), position du point bas des rives (0,30 à 0,50 L), liés deux à deux
  pour un ouvrage symétrique ; recherche par coordonnées maximisant la marge minimale normée des contraintes (équivalent
  du centrage du tracé dans le fuseau du programme PSIDP, qui utilisait un simplexe), puis plus petit nombre d'unités de
  marge positive. Calcul rapide (20 pas par travée, 3 itérations de fluage) pendant la recherche, définitif ensuite.
- Zones d'about (v0.28, texte du BPEL 91 révisé 99, annexe 4 § 1.1,13 à 1.3,2, et article 7.5) : dalle étudiée comme un
  panneau h × b dans le plan vertical (nappes d'ancrages, e′ = b, l_r = h) et dans le plan horizontal (files, e′ = h,
  l_r = b) ; prisme symétrique d_j = 2 inf(c_j, c_j*) ; σ_s,lim = 2/3 f_e ; A_s = 0,04 max F_j0/σ_s,lim ;
  σ_tej = 0,5 (1 − a_j/d_j) F_j0/(e′ d_j) ≤ 1,25 f_tj, σ_xmj = F_j0/(e′ d_j) ≤ 2/3 f_cj ; R_j = 0,25 (1 − a_j/d_j) F_j0,
  A_ej = R_j/(k_j σ_s,lim) (k_j = 1 extrême, 1,5 intermédiaire), A_e = sup(max A_ej ; 0,15 max F_j0/σ_s,lim) sur max d_j ;
  équilibre général de diffusion pure avec les F_j (P1) réparties sur (a_j + d_j)/2 ≤ 2a_j, τ_d = 2V_x/(e′ l_r),
  τ_g = max(τ_d + τ) ≤ 1,5 f_tj (τ parabolique de l'effort tranchant ELS à l'about), V_xe = V_x [1 − (f_tj/3τ_d)²],
  A_c = |V_xe|max/σ_s,lim, complément si A_c > A_s + A_e sur 2 l_r/3. Bielle d'about (7.5,11) : R_u cotg β_u équilibré
  par les armatures inférieures (précontrainte en partie basse à min(1,2 σ_pm ; f_peg/γ_p), passives à f_e/γ_s) ; avec
  les ancrages sur la fibre moyenne, la précontrainte n'est pas comptée. Coin inférieur (7.5,2) : commentaire seulement.
  Plaques d'ancrage, entraxes et distances au bord : ceux du procédé choisi (v0.30, `src/psidp/agrements.js`), sinon forfait générique.
- Procédés (v0.30) : liste « Procédé de précontrainte (agrément) » dans l'onglet Précontrainte.
  - Générique : BPEL 91 révisé 99, annexe 3 (f = 0,18 / φ = 0,002 m⁻¹ en cas I, 0,20 / 0,003 en cas II), recul 6 mm, plaques forfaitaires.
  - Freyssinet C (brochure V14 de 09/2014, conforme à l'ETA 06/0226 dont le texte n'a pas été lu) : unités 4 à 19 C15, plaque A × B (p. 8), entraxe a selon f_cm,0 = 24 / 44 / 60 MPa (p. 11), gaine (p. 9), μ = 0,19 (torons non lubrifiés) et k = 0,007 rad/m (p. 29), R_min = 100 Ø_int (p. 28). Recul non donné : 6 mm.
  - VSL (ETA 06/0006 version 5 du 12/05/2026) : unités 6-4 à 6-19, A_p (tableau A.1.2), recul 6 mm (A.2.6.3), μ = 0,18 et k = 0,005 rad/m (A.2.6.1), R_min = 100 Ø_int (A.2.3.2), gaines (brochure 2009). Plaques et entraxes (annexe A.6) non lus : forfait générique, signalé dans la note.
  - DYWIDAG MA (ETA-13/0815 du 29.01.2021, texte et annexes 1 à 7) : unités 6805 à 6837 ; A_p, gaine acier I (annexe 3), R_min (annexe 7), μ = 0,20 et k = 0,005 rad/m ; ancrage MA Ø a, entraxe et distance au bord pour f_cm,0 = 33 MPa cylindre (brochure DSI 10.09, base ETA-06/0022 ; annexes 11 à 13 de l'ETA non lues), bord corrigé de l'enrobage (donné pour 30 mm) ; recul 8 mm sans blocage des clavettes (4 mm avec).
  - BBR VT CONA CMI (ETA-06/0147 du 26.06.2025, lue p. 1 à 24) : unités 0406 à 3106 ; trompe-plaque Ø B (ETA 2017, annexe 4), μ = 0,18, k = 0,005 rad/m, recul 6 mm ; gaine Ø int et R_min de l'agrément DIBt de 2011 (à vérifier) ; entraxes et Ø extérieur des gaines non lus : génériques.
  - Unité demandée absente du procédé : unité du procédé au nombre de torons le plus proche.
  - Entraxe minimal retenu pour la plus grande f_cm,0 du tableau ne dépassant pas f_cj (f_cj caractéristique ≤ f_cm,0 moyenne : choix prudent) ; alerte si f_cj est sous la plus faible valeur du tableau. Distance au bord e = x/2 + c − 10 mm (règle Freyssinet p. 11 et VSL § 3.5.2), c = 5 cm.
  - En changeant de procédé, l'interface garde le même nombre de torons. f, φ et g saisis restent prioritaires sur ceux de l'agrément.
- Pertes (v0.28) : option « BPEL 91 révisé 99 » (défaut) — déformations instantanées E_p Σ k Δσ_bj/E_ij section par
  section (k = ½ précontrainte et poids propre, 1 superstructures), retrait ε_r [1 − r(j)] E_p avec r(t) = t/(t + 9 r_m),
  fluage (σ_b + σ_M) E_p/E_ij, Δσ_d = Δσ_r + Δσ_fl + 5/6 Δσ_ρ ; option « note PSIDP-EL 84 » (BPEL 83) conservée pour le
  calage : σ̄_bj moyen, K_fl E_p σ_b/E_i28, terme rectangle. Retrait final par défaut 3·10⁻⁴ (climat tempéré sec).
- Contraintes (v0.28) : traction en exécution limitée à 0,7 f_tj dans la section d'enrobage (6.1,23 ; f_tj dans la note de
  1984) ; aciers de peau ≥ 3 cm²/m de parement et ≥ 0,10 % de la section (6.1,31).
- Effort tranchant (v0.28) : BPEL 9.6 (dalles, ELU seul), τ_réd,u = 1,5 V_réd,u/(b h) sur la section brute ; pas
  d'armatures si τ_réd,u ≤ 0,09 f_cj/γ_b ; sinon (A_t/(b s_t)) f_e/γ_s ≥ (τ_réd,u − f_tj/2) tg β_u, minimum 0,1 MPa
  (0,4 MPa sur 0,5 h le long des bords libres) ; τ_réd,u ≤ (0,85 f_cj/3γ_b) sin 2β_u × (10h/3 si h < 0,30 m) ; contrôle ELS
  de la note (7.2,2) donné à titre indicatif ; appuis d'extrémité inclus.
## 1 quindecies bis. PSI-DP selon l'EN 1992 et reprise d’une note existante (v0.99.14, `test/psidp_ec2.test.js`)

- Règles « EC2 » (`bp_reg = EC2`) : mêmes pertes instantanées que le BPEL 91 (frottement f = μ, φ = μ k ; recul ;
  raccourcissement E_p Σ j Δσ_c/E_cm(t), j = ½ / 1 — EN 1992-1-1 (5.44), (5.45)) ; pertes différées (5.46) sans itération,
  σ_c,QP sous la précontrainte initiale et les charges permanentes moyennes (tassement probable compris), section brute ;
  relaxation (3.28)-(3.30) à 500 000 h, nulle pour μ < 0,5 ; phases mise en tension / mise en service (fraction r_j) /
  temps infini, chacune avec P_k,sup et P_k,inf.
- Contraintes : mise en tension σ ≤ 0,6 f_ck(t) et ≥ −f_ctm(t) (P_k,sup et P_k,inf, poids propre) ; caractéristique
  σ ≤ 0,6 f_ck, traction ≥ −f_ctm (au-delà : section fissurée, w_k et armatures minimales à justifier) ; quasi permanente
  σ ≤ 0,45 f_ck ; décompression = contrainte ≥ 0 à 25 mm de la gaine (Ø/2 + 25 mm autour du câble moyen) sous la
  combinaison choisie. Combinaisons : G + max(gr1a + 0,6 T ; ψ0 gr1a + T ; gr1b), G + max(ψ1 gr1a + 0,5 T ; 0,6 T ;
  0,75 gr1b), G + 0,5 T ; ELU 1,35 G + 1,20 S + max(1,35 gr1a + 0,9 T ; 1,35 ψ0 gr1a + 1,5 T ; 1,35 gr1b).
- Tassements probables par appui (`tassProb`, mm, vers le bas) : réponse de la poutre continue au module E/(1 + φ),
  ajoutée aux enveloppes de l'aléatoire (probable ± aléatoire) ; utilisée par toutes les combinaisons qui comptent les
  tassements.
- Tracé par points : spline cubique naturelle (z'' = 0 aux extrémités de la table) ; points au-delà des appuis d'extrémité
  admis. Contrainte imposée : remplace frottement, recul et raccourcissement (contrainte « finale » d'un logiciel EF).
- Écarts connus : le tranchant EC2 ne compte pas les câbles dans ρ_l (sécuritaire) ; zones d'about et flexion
  transversale restent calculées par les méthodes BPEL / PSIDP-EL.

## 1 sexdecies. Appareils d'appui NF EN 1337-3, tête d'appui, liaison PSI-DP / appuis (v0.34)

Contrôle sur la note « appuis et fondations » de d'un pont-dalle précontraint réel (note de bureau d'études, 6 travées) : `test/bearings1337.test.js`.

- **Appareils d'appui** (`src/supports/bearings1337.js`) : NF EN 1337-3 § 5.3.3 dans la présentation du guide Sétra de juillet 2007 (§ 3.3-3.4), application nationale γ_m = 1, K_L = 1.
  - a′ = a − 2 × 5 mm, T_e = n t + 2e, T_q = n t si e ≤ 2,5 mm (guide § 3.3.2.2) ; S = A′/(2t(a′ + b′)) ; G = 0,9 MPa, G_dyn = 1,8 MPa (freinage).
  - ε_q ≤ 1, ε_c + ε_q + ε_α ≤ 7, flambement, stabilité en rotation (K_r = 3, E_b = 2000 MPa), frettes (K_p = 1,3, f_y = 235 MPa, ≥ 2 mm), non-glissement (K_f = 0,6), σ_m,min ≥ 3 MPa.
  - Valeurs de la note de référence retrouvées à 0,3 % près (S, A_r, ε_c, σ_lim, Σv_z, t_s, μ_e). Écarts de la note : ε_q calculé avec T_e au lieu de T_q ; ε_α de P2-2 en combinaison 4 (0,314 au lieu de 0,809).
  - Stabilité en rotation vérifiée aussi sous charge minimale (G + P seuls, concomitant) ; la combinaison « charge minimale + rotation maximale du trafic » est une enveloppe dont la concomitance n'est pas établie : signalée « à examiner », non bloquante.
  - Combinaisons : BAEL (1,35 G + P + 1,605 Q, freinage × 1,605, retrait + fluage + 1,5 × 0,6 × température ; température dominante) ou guide 2007 (1,35 G + P + 1,35 gr1a/gr2 + 1,5 × 0,6 T).
  - Rotations : dalle armée G (module différé) ; dalle précontrainte G + P (enveloppe de la mise en tension et du service, calcul PSI-DP).
  - Appareil non conforme : plus petit appareil de la gamme standard vérifiant ces conditions sous les mêmes efforts (répartition horizontale non recalculée). Le prédimensionnement de l'onglet Projet reste celui du bulletin n° 4.
  - Texte du guide 2007 relu en entier (v0.36, PDF fourni) : § 3.2-3.4 et exemple du § 4.2 (PSI-DP 3 travées, appareil 400 × 600 ; 6 × 12 + 2 × 6 mm) reproduit dans `test/bearings1337.test.js` (ε_c, ε_q, ε_α, Σε, σ_lim, Σv_z, t_s, μ_e, F_x à 0,5 % près). Corrections apportées : déplacement dû au freinage H_x T_q/(2G A′) (au lieu de T_e) ; Σt_i³ avec les enrobages s'ils sont comptés (e > 2,5 mm) ; Σv_z = F_z T_q/A′(…) ; F_xy = G A′ v/T_q + H_x ; σ_m,min = F_z,Gmin/A′ (remarque du § 3.4.1.5) ; combinaison gr2 (freinage) sans température (tableau 4.1, n° 4) ; référentiel EC : déplacements des appareils calculés avec les raideurs instantanées des appuis et G = 0,9 MPa (§ 4.3.1), distincts de la répartition différée utilisée pour les fondations ; avis « t_s majorée de 5 à 10 % » si b′/a′ < 1,24 près des limites (§ 3.4.1.2, nota).
- **Tête d'appui** (`src/supports/pierhead.js`) :
  - pression localisée BAEL A.8.4,1 (K ≤ 3,3 ; K = 1 au-delà de α ou β = 3/4, domaine où la formule cesse d'être valable) ou EN 1992-1-1 § 6.7 ; contact sur le bossage (débord et béton saisis) et diffusion dans la section de l'appui ;
  - frettage : annexe 4 du BPEL transposée (frettes de surface 0,04 R_u, éclatement 0,25 (1 − a/d) R_u, minimum 0,15 R_u, σ_s,lim = 2/3 f_e) ;
  - voile plus court que la ligne d'appareils : console courte BAEL annexe E.6 (Perchat C 2 314 § 2.7.4), d plafonné à 4a (charge concentrée) ou 4ℓ (charge répartie, BAEL 99 E.6.2,1 relu en v0.36) ; console longue en flexion simple.
  - Note de référence : la console de P2-6 (d = 1,5 m, charge répartie sur ℓ = 0,6 m, non plafonnée) donne τ_u = 3,54 MPa ≤ 4 MPa, conforme (v0.36). Le bossage 0,60 × 0,70 donne K = 1 (débord < a₀/6) et σ = 14,40 > 14,17 MPa.
- **Dalle précontrainte → appuis** : réactions hyperstatiques de précontrainte (enveloppe des phases MT, MS, ES et des valeurs probable, P1, P2) ajoutées aux réactions permanentes avec le coefficient 1 (BPEL) dans toutes les combinaisons des appuis ; raccourcissement ε = σ_m/E_ij + K_fl σ_m/E_i28 + ε_r [1 − r(j)] à la place de la valeur saisie (option « ap_epsPSIDP »).

## 1 septdecies. Compléments des appuis (v0.35, `test/supports_ext.test.js`)

- **Gradient thermique sur les appareils** : réactions hyperstatiques du gradient N_θ (modèle du tablier) réparties sur les n appareils de la ligne ; × 0,78 (BAEL, 1,3 ψ₀) ou × 0,9 (EC, 1,5 ψ₀) avec le trafic dominant, × 1,35 / 1,5 en action dominante, × 1 dans les combinaisons minimales et le non-glissement (la note de référence combine N + 0,5 N_θ et N + N_θ).
- **Fiche minimale des pieux** (`minPileLength`) : plus petite longueur, par pas de 0,5 m, dont la portance couvre la charge par pieu de chaque état — ELS quasi permanent (Q_c/1,4 au F62 ; R_c;cr/1,1 NF P 94-262, part soutenue des combinaisons ELS), ELS rare ou caractéristique, ELU, accidentel ; charges en tête de la fiche retenue (influence de la fiche sur la répartition négligée), poids propre du pieu non ajouté.
- **Voile d'épaisseur variable** : épaisseur en pied (saisie existante) et en tête ; souplesse du fût intégrée sur 6 tronçons (PSH et semelles superficielles), poids avec l'épaisseur moyenne, ferraillage en pied, élancement et second ordre avec la plus faible épaisseur, tête d'appui avec l'épaisseur en tête ; schéma trapézoïdal.
- **Excentricités dans les pieux (option)** : e_a = max(2 cm ; l_f/250) et e₂ = 3 l_f²/(10⁴ D)(2 + α φ) (BAEL A.4.4,3, φ = 2, α part permanente de N), l_f = 2 l₀ avec la longueur de transfert l₀ = (4 E I/k)^¼ (module de réaction en tête), ajoutées au moment ELU. Pratique de certaines notes (l_f non justifiée dans la note de référence) ; désactivée par défaut, le pieu étant tenu par le sol.
- **Pile de joint (pile double)** : extrémité commune avec un tablier adjacent, calculée comme une pile (géométrie des piles) ; réactions permanentes, trafic et efforts horizontaux du tablier étudié multipliés par 1 + r_G, 1 + r_Q, 1 + r_H (r = 1 : tablier adjacent symétrique), efforts horizontaux cumulés dans le même sens ; appareils et tête d'appui vérifiés pour la ligne du tablier étudié. Non traité : la seconde ligne d'appareils, le séisme (le moteur Pont EC8 garde une culée à cette extrémité, avertissement affiché).

## 1 septdecies bis. Gros béton, souffle sismique, réactions imposées ; trafic Eurocode des cadres (v0.99.15, `test/appuis_v09915.test.js`, `test/cadre_ec.test.js`)

- **Massif en gros béton** (`ap_gbH`, `ap_gbDeb`, `ap_gbFck`) : semelle posée sur un massif non armé de hauteur h_gb, débord d_gb de chaque côté (défaut h_gb/2, diffusion 2V/1H) ; portance (NF P 94-261 ou F62), glissement, excentrement et tassement vérifiés à la base du massif B′ = B + 2 d_gb, L′ = L + 2 d_gb, D = D_e + h_gb, avec son poids (γ = 23 kN/m³, pondéré comme les poids propres, 1,0 dans la variante « G favorables », déjaugé sous la crue) et le moment M + H h_gb. Contact semelle / massif : σ_réf = V/((B − 2e) L) ≤ 0,8 f_ck/γ_c (EN 1992-1-1 § 12.3.1, γ_c = 1,5 ; 1,2 en accidentel) ; glissement béton contre béton H ≤ 0,6 V (§ 6.2.5, surface lisse, sans coefficient partiel supplémentaire : hypothèse PSIDA). Largeur B dimensionnée sur ces critères quand elle n'est pas donnée. Traction dans le massif (débord > h_gb/2) non calculée : signalée.
- **Souffle des joints** : W = max(2 v_T + v_RF ; souffle retenu par Pont EC8). Pont EC8 : catégorie I-II, séisme ignoré (2 d_T + d_G) ; d_E ≤ 2 cm, 2 d_E + 2 d_T + d_G ; d_E > 2 cm, souffle de service + 0,4 × souffle sismique (garde-grève fusible). Premier et dernier joints du moteur EC8 affectés aux culées de début et de fin.
- **Réactions imposées par appareil** (`ap_brgReac`) : F_z,max ELU substituée dans chaque combinaison ELU maximale PSIDA (v_lent, H_x et α concomitants conservés) ; F_z,min avec les déplacements et rotations de la combinaison minimale PSIDA (rotation sous charge minimale, non-glissement, σ_m,min ≥ 3 MPa). Vérification seule : ne déclenche ni le remplacement automatique de l'appareil ni la bascule en appareil glissant.
- **Cadres sous route, Eurocodes** (`cf_portee = routeEC`) : LM1 (TS 300/200/100 kN par essieu, UDL 9 / 2,5 kN/m², α de l'annexe nationale française classe 1 ou 2 ou α = 1), voies de 3 m, ordres de chargement des voies balayés ; roue de 0,40 × 0,40 m diffusée sur d = H_r tan θ + e/2 (θ = 30° par défaut) ; bande de 1 m la plus chargée appliquée par mètre ; LM2 (400 kN β_Q, roues 0,35 × 0,60 m) ; Mc120 optionnel (Fascicule 61) ; γ_Q = 1,35 (ELU), 1,0 (ELS caractéristique). La bande de 1 m la plus chargée, appliquée à toute la largeur, est sécuritaire pour les cadres larges.

## 1 septdecies ter. Ponts à poutres : biais et phase de pose (v0.99.17, `test/poutres_v09917.test.js`)

- **Biais** (`pt_biais`, ψ en grades) : ni l'Eurocode ni le guide Sétra VIPP ne donnent de règle ; coefficients de l'AASHTO LRFD (tabliers béton sur poutres béton, 0 ≤ θ ≤ 60°) : F_V = 1 + 0,20 (L t_s³/K_g)^0,3 tan θ, θ = (100 − ψ) × 0,9°, K_g = n (I_b + A_b e_g²) de la poutre seule ; F_V appliqué à la part du trafic de V et R des poutres de rive, maximal à l'appui et nul à la mi-travée (hypothèse PSIDA) ; réduction des moments r_M donnée pour mémoire, non appliquée. Sous 70 gr, étude par grillage ou éléments finis signalée.
- **Poutres BA, ELS et effort tranchant BAEL** : A_s calculée sur la section en T fissurée (n = 15) pour que σ_s = σ̄_s, contrôle de σ_bc ≤ 0,6 f_c28 (BAEL) ou 0,6 f_ck (EC2, σ_s ≤ 0,8 f_yk) ; ELS au moment de mi-travée (combinaisons BAEL / Fascicule 61 et EN 1990 caractéristique) ; V_u BAEL à l'appui avec les efforts tranchants par poutre de PSIDA (poutre de rive : max(Guyon-Massonnet ; bras de levier)) ; armatures droites, k = 1.
- **Déversement en phase de pose** (méthode de Mast, PCI) : excentricité initiale ⅔ L/960 + 6 mm ; fissuration au coin de la table avec f_ctm(t) (prudent par rapport au module de rupture de Mast) ; FS_c ≥ 1,0, FS_f et FS_r ≥ 1,5 ; poutre posée : deux appareils provisoires, raideur de rotation NF EN 1337-3 ; contraintes de levage avec poids × (1 ± 0,15) (hypothèse PSIDA) ; vent et transport non examinés ; critère (5.40b) de l'EN 1992-1-1 § 5.9 donné en complément.

## 1 septdecies quater. Plans des tabliers à poutres BA (v0.99.18, `test/poutres_ba_note.test.js`)

- Poutre détaillée : la plus sollicitée de la plus longue travée (section retenue max(ELU ; ELS) du règlement choisi). Barres HA20 à HA40, le plus petit diamètre tenant en trois lits au plus dans le talon (espacement ≥ max(φ ; 25 mm), enrobage 3 cm au cadre). Épure d'arrêt (PSI-BA 77, V.1.3) : section nécessaire A_s M(x + 0,8 h)/M(L/2) (enveloppe ELU de la poutre), lits arrêtés du haut vers le bas à l'abscisse théorique moins l_s (BAEL A.6.1,23 ou EN 1992-1-1 § 8.4.4) ; lit inférieur filant, relevé au-delà de l'appui. Armatures d'âme : diamètre et brins fixés par la zone d'appui, espacement variable par zones (BAEL A.5.1 avec τ_u(x) ∝ V_Ed(x), ou EN 1992-1-1 § 6.2.3). Hourdis : nappes du calcul de flexion locale, répartition ≥ A_s/4. Plan de principe : façonnage (crochets, recouvrements) à établir.

## 1 septdecies quinquies. Poutres BA à travées continues (v0.99.19, `test/poutres_psiba.test.js`)

- **Domaine** (`pt_continu = oui`, poutres BA seulement, hors voie ferrée) : 2 à 6 travées coulées sur cintre (dossier Sétra PSI-BA 77). Poutre continue d'inertie constante, appuis simples indéformables ; les goussets ne sont pas pris dans la raideur (prudent sur appui, un peu défavorable en travée selon PSI-BA).
- **Répartition transversale** : Guyon-Massonnet avec, pour chaque travée, la portée équivalente de la poutre continue ; dès qu'il y a des entretoises intermédiaires (`pt_entInt` > 0) et au moins 3 poutres, méthode de Courbon R_k = P (1/n + e y_k / Σ y²) comme dans la note PSI-BA. Les entretoises intermédiaires ne sont pas dimensionnées.
- **Sur appuis** : M_axe des combinaisons BAEL 1,35 G + min[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)] (ELU), G + 1,2 (A ou B) + trottoirs (ELS) et EC 1,35 G + 1,35 min(gr1a ; gr1b) ; moment au nu de l'entretoise sur pile |M_nu| = |M_axe| − V e/2 (e = `pt_tePile`, défaut 0,50 m). Section rectangulaire comprimée en bas, largeur max(talon ; gousset `pt_bgous`), aciers supérieurs dans la table. Gousset nécessaire = max(V_u/(τ̄_u d) ; largeur donnant σ_bc ≤ 0,6 f_ck aux ELS BAEL et EC).
- **Plans** : aciers supérieurs sur appui en deux groupes — groupe long arrêté où A_nec ≤ A_h (aciers longitudinaux du hourdis dans la largeur participante), groupe court où A_nec ≤ A_1 + A_h — prolongés de 0,8 h + l_s et bornés aux travées voisines ; aciers inférieurs tirés de l'enveloppe positive de la travée détaillée, symétrisée.
- **Recalage** (exemple PSI-BA 77, 11,66 / 18,80 / 18,80 / 14,45 m, 3 poutres à 4,00 m) : moments sur piles des charges permanentes à 0,1 % (−90,94 / −119,93 / −102,95 t·m) ; A(l) à 3 % (note −70,6 / −79,3 / −74,6 t·m, 1 t = 10 kN) ; appui 3 le plus sollicité, comme la note.

## 1 septdecies sexies. Entretoises intermédiaires des poutres BA (v0.99.20, `test/poutres_psiba.test.js`)

- **Entretoise calculée** : celle de la travée où les entretoises sont le plus espacées (entraxe λ = L/(n_e + 1), PSI-BA IV § 7.1) ; `pt_entInt` accepte un nombre par travée. Hauteur = hauteur des poutres, épaisseur `pt_beInt` (défaut 0,25 m ; PSI-BA : 0,15 m au moins pour du HA25, 0,20 m pour du HA32).
- **Courbon** : entretoise indéformable, poutres identiques, R_k = P (1/n + e y_k/Σ y²) (la note PSI-BA pondère par l'inertie de chaque poutre : écart de l'ordre de 3 % sur la poutre de rive).
- **Coefficients longitudinaux** (PSI-BA § 7.2.1) : une charge à x de l'entretoise agit avec (1 − |x|/λ). Bc : deux camions d'une file, une roue au droit de l'entretoise ; Bt (deux essieux) et Br au droit de l'entretoise, comme la note ; chenille Mc120 centrée ; A(l) (l = portée de la travée) et trottoirs (charge locale 4,5 kN/m²) sur 1 m ; δ_B et δ_Mc de la travée. EC : TS (un essieu au droit de l'entretoise, l'autre à 1,20 m), UDL sur λ, trottoirs 3 kN/m² (gr1a), LM2 (essieu ou roue seule, gr1b) ; voies conventionnelles déplacées dans la chaussée et numérotées au plus défavorable.
- **Coefficients transversaux** : mêmes placements que le tablier (Bc en files accolées, roue à 0,25 m du bord de la chaussée chargeable ; Bt dans des bandes de 3 m ; Mc120 de 4,30 m), pas de 0,05 m ; moments à 0,25 m d'intervalle entre les poutres de rive, efforts tranchants de part et d'autre de chaque poutre.
- **Charges permanentes** : superstructures (`pt_lines`, `pt_bands`) sur λ et poids propre de l'entretoise, mêmes réactions de Courbon ; le poids du hourdis n'est pas repris (il descend dans les poutres par les panneaux de dalle : charge permanente négative en rive dans la note PSI-BA).
- **Combinaisons** : BAEL 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)], ELS G + max[1,2 (A ou B + trottoirs) ; Mc120 + trottoirs] ; EC 1,35 G + 1,35 max(gr1a ; gr1b), caractéristique G + max(gr1a ; gr1b). La colonne « G + max Q » reproduit l'« effort extrême » de la note PSI-BA (valeurs caractéristiques).
- **Sections** : en travée, section en T (BAEL A.4.1,3 et PSI-BA : b = b₀ + 2 min(L_t/10 ; (λ − b₀)/2), L_t entre poutres de rive ; EC § 5.3.2.1 avec l₀ = 0,85 b₁), d = H − 2 × enrobage des poutres (lits de l'entretoise au-dessus de ceux des poutres) ; au droit des poutres intérieures, section rectangulaire b₀ × H, aciers supérieurs à 7 cm du dessus (sous les nappes du hourdis). ELS en section fissurée (n = 15).
- **Effort tranchant et ancrages** : étriers BAEL A.5.1 et EN 1992-1-1 § 6.2.3 ; épaisseur nécessaire max(V_u/(τ̄_u d) ; 2 V_Ed/(z ν₁ f_cd)) ; aciers inférieurs ancrés par courbure au-delà du nu des poutres de rive A ≥ V_u/f_su (BAEL A.5.1,312, PSI-BA V.1.7.1) ou V_Ed cot θ/(2 f_yd) (§ 9.2.1.4) ; étriers de suspension dans la poutre A ≥ V_u/f_su (Fascicule 61 titre VI art. 38, § 9.2.5).
- **Recalage** (travée 4 de la note, λ = 7,225 m) : coefficients longitudinaux hors δ exacts (Bc 12,39 t, Mc120 86,8 t, trottoirs 3,25 t) ; efforts par système au droit de la poutre de rive et à −3,50 / −3,75 m à 7 % près (δ de PSIDA un peu plus fort, Bt dans des bandes de 3 m) ; moment au droit de la poutre centrale (G + max Q) 55,6 t·m pour 55,4 t·m.
- **Plans** (v0.99.21) : entretoises de la travée détaillée également espacées (L/(n_e + 1)), niveau inférieur à l'intrados des poutres ou au-dessus des ailes du talon (PSI-BA V.1.1) ; ferraillage de l'entretoise la plus sollicitée appliqué à toutes. E1 : aciers inférieurs (section max(A_s ; ancrage)) relevés de max(0,30 m ; H/3) dans les poutres de rive ; E2 : aciers supérieurs continus, au moins autant de barres par lit que E1 (porte-étriers, PSI-BA V.1.7.2), retours de 0,20 m ; E3 : cadres entre poutres ; E4 : cadres HA12 de suspension dans chaque poutre, de part et d'autre de l'entretoise. Longueurs de principe (façonnage à établir).
- **Non traité** : torsion des poutres introduite par les entretoises, biais.

## 1 septdecies septies. Gradient thermique et tension après pertes instantanées (v0.99.22, `test/psidp_ec2.test.js`)

- **Gradient thermique** (champ `dT` vide) : EN 1991-1-5 § 6.1.4.1, approche 1 (composante linéaire), tablier de type 3 (dalle béton) : ΔT_M,heat = 15 °C, ΔT_M,cool = 8 °C (tableau 6.1) × k_sur (tableau 6.2 : sans revêtement 0,8 / 1,1 ; 50 mm 1,0 / 1,0 ; 100 mm 0,7 / 1,0 ; 150 mm 0,5 / 1,0 ; interpolation linéaire entre lignes, épaisseur = `tRev`). Appliqué aux calculs Eurocodes (tablier, précontrainte EN 1992, appuis). Fascicule 61 (BAEL, BPEL, flexion transversale SETRA) : 12 / −6 °C, pratique antérieure. Une valeur saisie s'applique partout. La note OA67 (Eurocodes) retenait 12 / 6 °C : l'échauffement correspond à un revêtement de 8 cm environ, le refroidissement est sous-estimé (6 au lieu de 8 °C).
- **Tension après pertes instantanées** (dalle précontrainte, règles EN 1992) : σ_pm0 = σ après frottement, recul et raccourcissement élastique ≤ min(0,75 f_pk ; 0,85 f_p0,1k) (§ 5.10.3 (2)) ; tension à l'ancrage ≤ min(0,8 f_pk ; 0,9 f_p0,1k) (§ 5.10.2.1). Tension à l'ancrage laissée vide : partie de la seconde valeur, abaissée par itérations (au plus 4) jusqu'à vérifier la première. Une contrainte initiale imposée (table x σ) est contrôlée telle quelle : la « contrainte finale » SCIA de la note EC6 atteint 1 425 MPa pour 1 394 MPa admis (non signalé par la note), celle de l'OA67 1 428 MPa.

## 1 septdecies octies. Nomenclature et façonnage des poutres BA (v0.99.23, `test/poutres_psiba.test.js`)

- **Formes et longueurs** : ISO 4066 (codes de forme de la BS 8666) de `src/plans/bordereau.js`, commun au pont-dalle et aux VIPP : cotes hors tout arrondies à 5 mm, longueurs de coupe aux 25 mm supérieurs, rayon de cintrage EN 1992-1-1 § 8.3 (mandrin 4 φ jusqu'à 16 mm, 7 φ au-delà). En BAEL, la note rappelle le rayon minimal des ancrages courbes (5,5 φ, A.6.1,251) pour les relevés.
- **Barres longues** : 12 m au plus ; pièces égales avec recouvrement l₀ = α₆ l_bd (α₆ = 1,5, § 8.7.3), pièces d'extrémité avec leur retour (code 11), pièces courantes droites.
- **Poutre** (× n) : lits de l'épure d'arrêt, lits filants relevés de max(10 φ ; 0,25 m) au-delà de l'axe d'appui (même retour sur l'élévation) ; armatures supérieures sur appuis (deux groupes) ; cadres d'âme (51, crochets à 135° de 10 φ) et, si le talon est plus large que l'âme, cadres de talon distincts au même pas ; étriers intérieurs si 4 brins ; nombre de cadres d'après les zones d'étriers et les abouts (pas de 15 cm) ; peau HA12 / 25 par face ; deux HA16 de montage.
- **Hourdis** : transversales sur toute la largeur n b₁, longitudinales de répartition en deux nappes. **Entretoises d'about** : barres du vérinage (retours 15 φ), cadres HA10. **Entretoises intermédiaires** : E1 (retours max(0,30 m ; H/3)), E2 (retours 0,20 m), E3, E4 du plan de ferraillage.
- **Cohérence** : la feuille de ferraillage reprend les masses du bordereau (une poutre et son hourdis sur b₁).

## 1 septdecies novies. Durabilité et enrobage (v0.99.24, `test/durabilite.test.js`)

- **Classe de béton minimale** : la plus exigeante des classes d'exposition saisies ; EN 1992-1-1 annexe E, tableau E.1N (indicatif) ou NF EN 206/CN (France, 50 ans : XC1–XC2 C20/25 ; XC3, XC4, XD1, XF1, XF2 C25/30 ; XD2, XS1, XS2, XF3, XF4, XA1 C30/37 ; XD3, XS3, XA2 C35/45 ; XA3 C40/50).
- **Classe structurale** (tableau 4.3N, valeurs recommandées) : S4 ; +2 pour 100 ans ; −1 si le béton atteint le seuil de la colonne (C30/37, C35/45, C40/50, C45/55) ; −1 pour la dalle (géométrie de dalle) ; bornée à S1–S6. **c_min,dur** du tableau 4.4N (béton armé), c_min = max(φ ; c_min,dur ; 10 mm), **c_nom = c_min + 10 mm**. Les classes XF et XA ne jouent que sur la classe de béton.
- **Vérifications** : dalle — enrobage à l'axe c − Ø_long/2 ≥ c_nom (recommandation : c à l'axe) ; cadres — enrobage au nu ≥ c_nom ; poutres — classe de béton, c_nom des cadres (Ø12) appliqué aux plans BA (au moins 3 cm), et centre de gravité des lits inférieurs dessinés ≤ enrobage à l'axe du calcul (sinon hauteur utile surestimée). L'exemple PSI-BA (enrobage 10 cm, lits HA32 dans 0,38 m) sort NON : la note PSI-BA retient d'ailleurs d = 0,77 m (19 cm).
- **Non traité** : enrobage des armatures de précontrainte (§ 4.4.1.2 (3) : gaines), hourdis des poutres et appuis (champ d'enrobage propre aux appuis), Δc_dur additionnels.

## 1 septdecies decies. Séisme non calculé et anti-cheminement (v0.99.25, `test/durabilite.test.js`)

- **Séisme** : case « Séisme » non cochée, zone de sismicité 2 à 5 et catégorie d'importance II à IV → alerte dans la note des appuis et recommandation (arrêté du 26/10/2011, art. 3 et 4 ; zone 1 ou catégorie I : non soumis). Ailleurs qu'en France, la zone et la catégorie saisies doivent traduire le règlement local.
- **Anti-cheminement** : appareil en élastomère fretté dont le non-glissement n'est pas vérifié (F_xy > μ_e F_z) → à fixer (NF EN 1337-3 § 5.3.3.6). Dispositif (taquets en béton armé ou plaques à ergots) pour tout l'effort horizontal, frottement négligé : F_Ed = 1,35 F_xy max des combinaisons de glissement ; aciers de couture A_s ≥ F_Ed/(μ f_yd), μ = 0,7 (EN 1992-1-1 § 6.2.5, interface rugueuse, cohésion négligée), 4 HA16 au moins ; surface d'appui ≥ F_Ed/f_cd (§ 6.7). Jeu de quelques millimètres pour la distorsion. Le dessin du taquet n'est pas fait.
- **Enrobage par défaut** du pont-dalle : 5,5 cm à l'axe (c_nom 45 mm, S5, + Ø20/2).

## 1 septdecies undecies. Enrobages, biais, grillage, précontrainte sur la plaque (v0.99.26, `test/v09926.test.js`)

- **Précontrainte** (EN 1992-1-1 § 4.4.1.2) : c_min,dur,p du tableau 4.5N (S4 : 10, 25, 35, 40, 45, 50, 55 mm) ; c_min,b = Ø de la gaine circulaire, 80 mm au plus (post-tension), 1,5 Ø du toron (prétension) ; c_nom,p = max(c_min,b ; c_min,dur,p ; 10) + Δc_dev. Mesuré au nu de la gaine ou du toron.
- **VIPP** : sous-face (lit inférieur à mi-travée), flancs du talon (gaines extrêmes, largeur au haut de la gaine), âme ((b_w − Ø)/2, gaine relevée centrée, b₀ au-delà de L_b, b₀,a en deçà). Âme de 20 cm avec 12T15S (Ø 80) en XC4, 100 ans, C40 : 60 mm < 90 mm, b_w ≥ 26 cm aux Eurocodes. Les âmes de 20 cm du guide Sétra 1996 relèvent du BPEL. PRAD : torons de la sous-face et des flancs.
- **PSI-DP aux Eurocodes** : enrobage des gaines non saisi = c_nom,p (géométrie de dalle) au lieu de Ø gaine ; BPEL : inchangé.
- **Plans VIPP** : enrobage des cadres c_nom (3 cm au moins) dans le ferraillage et la nomenclature ; notes rappelant c_nom,p des gaines.
- **Appuis** : élévations XC4 et fondations XC2 par défaut, 100 ans, Ø20 ; semelles c_nom ≥ k₁ = 40 mm, pieux forés c_nom ≥ k₂ = 75 mm (§ 4.4.1.3 (4)) → axe des aciers des pieux à max(7 cm ; c_nom + 1 cm). Béton des appuis par défaut C30/37 (tableau E.1N en XC4).
- **Biais par Guyon** : deux résolutions de la plaque (DKT, maille 0,50 m, appareils rigides) sous les charges permanentes, ouvrage biais et ouvrage droit ; κ_max = (n R_max/ΣR)_biais/(n R_max/ΣR)_droit multiplie k_CP et k_Q (PSI-DA 68), κ_min la réaction minimale. Hypothèse : le trafic dans l'angle obtus concentre au moins autant. Exemple 2 (70 gr) : κ_max = 1,01 sur culée, 1,08 sur pile.
- **Grillage** (Hambly 1991, chap. 3) : poutres E I_p, G K_p ; barres transversales du hourdis E Δx h_d³/12, G Δx h_d³/6 ; entretoises en T (âme b_e × h_e, table b_e + 2 min(0,1 (n−1) b₁ ; s/2)) ; appuis w = θ_x = 0 ; G = E/2 ; charge-ligne sinusoïdale (premier harmonique) → K̄_k = n M_k/ΣM. Contrôles : dalle isotrope à 10 poutres ≈ Guyon à 3 % ; entretoises infiniment rigides sans torsion = Courbon exactement. Pont de Noé (4 VIPP) : K̄ de la poutre de rive chargée 2,71 au lieu de 2,50 (Guyon), M_Ed +2 %. Travées indépendantes seulement.
- **Précontrainte sur la plaque** : charges équivalentes de chaque état (M.T, M.S, E.S ; moyenne, P1, P2) : forces de déviation −Δ(dM₀/dx) réparties uniformément en travers, effort et couple d'ancrage aux abouts (couple ± M₀/δ) ; réactions des appareils = réactions hyperstatiques. Somme par ligne ≈ poutre (exemple 3 : 0,2 à 8 %). Appareils et chevêtres : appareil le plus et le moins chargé ; fûts et fondations : somme de la ligne. Ouvrages courbes : répartition uniforme conservée.

## 1 septdecies duodecies. Vue 3D des résultats de la plaque (v0.99.27, `test/vue3d.test.js`)

- **Cas** (`src/plate/cas3d.js`, une résolution du modèle déjà factorisé) : G = somme des fichiers permanents de `permanentPlaque` ; TS = 4 roues de 150 kN (essieux à 1,20 m, roues à 2,00 m) en charges ponctuelles réparties bilinéairement, tandem placé par curseurs (le long du tablier ; en travers de y₁ + 1,5 à y₂ − 1,5 m) ; UDL = 9 kN/m² sur toute la chaussée (illustration, pas l'enveloppe de calcul) ; P = charges équivalentes du câble à l'état E.S moyen (`chargesPrecontrainte`), dalle droite ou biaise.
- **Grandeurs** : moments nodaux (moyenne des sommets des triangles adjacents, repère de l'axe), Wood-Armer simplifié m_x ± |m_xy| (armatures orthogonales, sans les corrections des moments négatifs). Les vérifications restent faites aux sections et fibres de calcul.
- **Affichage** : déformée dessinée à 4 % de la plus grande dimension × curseur ; échelle symétrique pour les moments (palette divergente), séquentielle pour w ; réactions en flèches de longueur ∝ |R|. Contrôles : Σ réactions = charge (G, TS, UDL), précontrainte autoéquilibrée.

## 1 septdecies terdecies. Vue 3D du grillage des ponts à poutres (v0.99.28, `test/vue3d_poutres.test.js`)

- **Grillage** (`src/beams/grillage.js`, § 1 septdecies undecies) construit pour la travée choisie avec E = E_cm du béton des poutres (EN 1992-1-1 tableau 3.1), G = E/2, m ≈ L/1,5 éléments (20 au moins) ; résolution complète : w, M des poutres (−E I w″, moyenne des éléments adjacents), torsion G K θ′, m_y du hourdis (barre transversale / largeur tributaire), réactions F − K₀u aux appuis.
- **Charges** : point (x, e) partagé linéairement entre stations, fonctions d'Hermite en travers (console rigide au-delà des rives) ; permanent = poids propre réparti également entre les poutres + charges linéiques et surfaciques à leur position ; TS et 9 kN/m² comme pour la plaque.
- **Contrôles** : Σ R = charge ; Σ M(L/2) = moment isostatique (exact) ; poutres découplées : flèche 5 q L⁴/384 E I à 1 % près. Section brute homogénéisée, linéaire : lecture de la répartition, pas de justification.

## 1 septdecies quaterdecies. Plans : relecture des plans d'entreprise A640 (v0.99.29, `test/plans_controles.test.js`, `test/plans_dp_implantation.test.js`)

- **Source** : plans d'exécution des OA61 (SCC, lot 6), OA67 et OA68 (ETE, lot 7), PIGR-1 (SOR, lot 5) — 34 feuilles d'appuis, 14 de tablier, 10 de cadre relues. Défauts relevés chez eux : nomenclature de pile recopiée de la culée (barre de 7,89 m dans une semelle de 7,00 m), cotes biaises fausses (22,00K au lieu de 22,10K), abouts différents entre coffrage et câblage (0,774 / 0,786 m), dosages et recouvrements différents d'une feuille à l'autre, mandrins HA8 de 30 mm (< 4 Ø), classes d'exposition absentes.
- **Notes par partie** (`src/plans/notes_durabilite.js`) : classes d'exposition et c_nom du calcul de durabilité ; « enrobage » = nu des armatures extérieures, l'axe des aciers étant donné à part ; appuis : élévations c, semelles max(c + 2 cm ; k₁), pieux k₂ = 75 mm ; recouvrements l₀ en Ø (§ 8.7.3, h = 1).
- **Barres de plus de 12 m** : droites en n pièces égales recouvertes de l₀, U en deux L ; transversales du tablier en deux L.
- **Contrôles** (`src/plans/controles.js`) : béton et axe des aciers du tablier ; barres ≤ 12 m ; retours dans h − 2 c_nom ; barres de semelle dans la semelle ; cerces dans le pieu ; enrobages des plans ≥ c_nom ; mandrins EC2.
- **Câblage** (`src/plans/cablage_dalle.js`) : câble moyen PSI-DP (z depuis le centre de gravité, v′ + z depuis l'intrados), prolongé tangentiellement jusqu'aux abouts ; allongement Δl = ∫σ_frottement ds / E_p jusqu'au point fixe (σ_L = σ_R) plus la longueur hors modèle à σ_p0 ; ordre de mise en tension c, c−1, c+1… (n pair : c+1, c, c+2…, comme OA67).
- **Ferraillage passif** (`src/psidp/ferraillage_passif.js`) : A_s passif par face de chaque section PSI-DP / largeur → enveloppes de `rebarPlan` ; effort tranchant sans armatures si aucune section ne le demande ; about : A_s (U HA12 dans 0,1 d), A_e (U HA14 sur 0,9 d), A_e,h (barres transversales HA12), A_s,inf de la bielle (HA16 à HA32) ; frettage local : agrément.
- **Implantation** (`src/plans/implantation.js`) : centre de semelle = axe d'appui + x_fût normal à la ligne d'appui ; coins ± B/2 normal, ± L_f/2 le long de la ligne ; pieux (fileX, pieuY) ; E = E₀ + x sin g − y cos g, N = N₀ + x cos g + y sin g. Nivellement : chaussée − revêtement aux appuis, interpolation linéaire, dévers du profil saisi ; contre-flèche = − w_service (PSIDP-EL NP 58).

## 1 septdecies quindecies. Dalle de transition, contre-flèche des dalles armées, profil en long parabolique, calepinage des corniches (v0.99.30, `test/v09930.test.js`)

- **Dalle de transition** (`src/supports/dalle_transition.js`, plan `src/plans/dalle_transition.js`, feuille APP-DT par culée) : dalle sur deux appuis simples, corbeau et remblai, portée L_c = L − 0,30 m ; g = 25 e + 20 h_moy (couverture 0,30 m au garde-grève, pente 5 %). LM1 (TS de chaque voie de 3 m, UDL 9 kN/m²) et LM2 (β_Q·400 kN), roues diffusées à 1/1 jusqu'au feuillet moyen (EN 1991-2 § 4.3.6) ; largeur efficace b_m = t + 2,5 x (1 − x/L_c) pour le moment (DAfStb Heft 240), b_v = t + 2x pour l'effort tranchant (45° jusqu'à l'appui), charges voisines regroupées en une charge de largeur (y_max − y_min) + t, largeurs tronquées aux bords. ELU 1,35 (G + Q) ; ELS caractéristique ; fissuration sous G (ψ₂ = 0) ; tranchant à d avec β = a_v/2d (§ 6.2.2(6)) sans armatures. Épaisseur 0,30 m portée à 0,35–0,45 m si nécessaire, reprise par la géométrie des appuis. Contrôle : L = 5 m, e = 0,30 → HA20 e = 0,10, comme le plan OA68 FER-30 (leur note : modèle de plaque Robot, LM2 + foule).
- **Limites** : moments transversaux non calculés (répartition ≥ 20 %, § 9.3.1.1(2)) ; corbeau ferraillé avec la culée ; goujons HA20 L = 0,60 m e = 0,50 m (disposition proposée) ; la réaction de la dalle sur la culée dans le calcul des appuis reste celle de `abutment.js` (60 kN/m sur un tiers de la largeur), plus faible que la réaction du TS calculée ici.
- **Contre-flèche des dalles armées** (`src/fleche_ba.js`) : moments permanents, κ = ζ κ_II + (1 − ζ) κ_I (EN 1992-1-1 § 7.4.3, β = 0,5), E_c,eff = E_cm/(1 + φ), aciers fournis du ferraillage, double intégration par travée ; retrait non compris ; contre-flèche = −w.
- **Profil en long** : rayon R du raccordement (champ niv_R, > 0 saillant) — z = interpolation linéaire entre appuis + (u − a)(b − u)/2R.
- **Corniches préfabriquées** (`calepinageCorniches`) : éléments de L_e (2,48 m) et joints j (2 cm), deux abouts de (L_rive − n L_e − (n + 1) j)/2 coupés suivant le biais, Δ = (L_talon + E)|cot ψ| ; réservations au pas saisi ; masse 25 A L / 9,81.

## 1 septdecies sexdecies. Corbeau de la dalle de transition, trafic de la dalle sur la culée, murs en aile des cadres (v0.99.31, `test/v09930.test.js`, `test/murs_aile.test.js`)

- **Corbeau** (`corbeauDalle`) : console courte EN 1992-1-1 annexe J.3 sous la réaction ELU de la dalle par mètre, a_c = 0,15 m, h_c = 0,40 m, z₀ = 0,8 d, H_Ed = 0,2 F_Ed (§ 10.9.4.7) ; tirant (F_Ed a_c/z₀ + H_Ed)/f_yd en L ancré dans le garde-grève ; U horizontaux ≥ 0,5 A_s (a_c ≤ 0,5 h_c) ; bielle ≤ ν′ f_cd. Repères sur la feuille APP-DT.
- **Trafic de la dalle dans les efforts d'ensemble de la culée** (EC) : LM1 est un modèle unique sur l'ouvrage et ses accès — un tandem est sur le tablier ou sur la dalle. Supplément dû à la dalle : R_UDL,dalle + max(0 ; R_TS,dalle − R_TS,tablier) ; retenu : max(forfait 60 kN/m sur l/3 ; supplément). Exemple par défaut : supplément 67 kN < forfait 240 kN (le TS sur le tablier, 1 189 kN à la culée, couvre le TS sur la dalle, 933 kN). La réaction par mètre (≈ 160 kN/m caractéristique) ne sert qu'au calcul local (dalle, corbeau).
- **Murs en aile** (`src/cadre/murs_aile.js`, feuille OH-AIL-01) : guide Sétra « Ponts-cadres et portiques » 1992 (§ 2.8.1, § 3.6.1, annexe 3), règles reprises de BVTrace. Quatre ailes distinctes, θ depuis l'axe de l'ouvrage, proposition α_g = 15 + 0,03 L², β_g = 0,008 (φ_g + 25) α_g (β au coin aigu — affectation à confirmer sur le texte du guide) ; arête 0,20 m sous la trace du talus (pente 1/m perpendiculaire aux têtes), trace à h_t au-dessus de la traverse ; longueur = chute jusqu'à h_min au-dessus du TN / pente le long du mur + 0,20 m. Mur en T renversé : e_t ≥ 0,25, e_b = (e_t + f h)/(1 + f) épaissie si besoin ; poussée K_a γ h + K_a q ; BAEL ou EC2 (sections du cadre) ; semelle : renversement et glissement ≥ 1,5, tiers central sous G + Q, σ_réf = (3σ_max + σ_min)/4 ≤ q_adm saisi ; talon et patin en console. Limites : calcul à l'enracinement seul (armatures et semelle constantes), poussée active sans inclinaison du talus derrière le mur, séisme non traité.
- **v0.99.32 — DT422** (Sétra, « Ponts-cadres en béton armé — programme PICF-EL », déc. 1991, éd. juil. 1992, § 2 « Prédimensionnement des murs de tête », p. 75–78) : e_base = (e_haut + (f_e + f_i) h)/(1 + f_e + f_i) ≥ e_m de l'abaque (courbes f_c28 = 20 et 25 MPa, numérisées ; axe des murs en aile = axe des murs en retour + 0,50 m ; f_c28 > 25 → courbe 25 MPa), semelle de l'épaisseur du mur à sa base. Non repris : abaques des longueurs de semelle a et b (p. 76–78, remplacés par le calcul direct de stabilité). Le DT422 ne traite pas l'implantation des ailes (α, β) : elle relève du guide de conception de 1992, annoncé par le DT422 ; il définit aile et retour par l'angle avec l'axe de la voie portée.
- **v0.99.33 — guide de conception 1992** (texte reçu) : § 2.8.1 p. 29–30 confirme α = 15 + 0,03 L², β = 0,008 (φ + 25) α (gr, d'après le document GUEST), minimums 15 et 0,12 (φ + 25), angles depuis l'axe de la voie franchie (jamais nuls : pas de mur en aile parallèle à cet axe), objectif d'égalité des surfaces vues (figure 35). Affectation : β (petit angle) au coin aigu, où le mur est le plus long — c'est elle qui égalise A = L_w sin θ (écart 11 % à φ = 60 gr, contre ≈ 50 % pour l'affectation inverse) ; les lettres de la figure 35 placent α au coin aigu, mais la figure n'est pas cotée et son mur du coin aigu est dessiné avec le plus petit angle. Ouvrage multiple : L entre D et 1,3 D, retenu 1,15 D. § 3.6.1 p. 58–59 et annexe p. 92 confirment fruit avant 1–2 %, tête 25–30 cm, arête 15–20 cm sous le talus, dépassement ≥ 20 cm, semelle de l'épaisseur de la base, h_c = h − 0,50 m pour les abaques.

## 1 septdecies septdecies. Notes de calcul des ouvrages annexes (v0.99.34, `test/notes_annexes.test.js`)

- `web/notes_annexes.js` : `dalleTransitionBlocks(st)` (note du pont, chapitre après les appuis, une section par culée portant une dalle) et `mursAileBlocks(cadre)` (note du cadre, chapitre 2, références renumérotées). Mêmes fonctions de calcul que les feuilles APP-DT et OH-AIL-01 : les chiffres de la note et du plan sont identiques par construction.

## 1 octodecies. Textes relus (v0.36)

- **Guide Sétra 2007** (appareils en élastomère fretté) : voir 1 sexdecies ; exemple du § 4.2 reproduit.
- **Note d'information Sétra OA 27** (application nationale de la NF EN 1337) : γ_m = 1 et K_L = 1 (§ 5.3.3, 5.3.3.5) ; rotation vérifiée sous la combinaison des rotations maximales, qui n'est pas forcément celle de la pression maximale (§ 5.3.3.6 a) ; non-glissement avec F_z,d min coexistant, σ_m sur A_r, K_f = 0,6 (béton) ou 0,2 ; F_z,Gmin/A′ ≥ 3 MPa à l'ELS (16 bis). Conforme au code.
- **BAEL 91 révisé 99** (Fascicule 62 titre I section I) :
  - A.8.4,12 : K = 1 + [3 − 4/3 (a₀/a + b₀/b)] √[(1 − 4a₀/3a)(1 − 4b₀/3b)] ≤ 3,3 ; condition de débord minimal d_a ≥ a₀/6 et d_b ≥ b₀/6, sinon K = 1 (texte et commentaire) — la règle « K = 1 au-delà de 3/4 » codée en v0.34 est exactement cette condition.
  - Annexe E.6 (consoles courtes) : d plafonné à 4a (charge concentrée) ou **4ℓ** (charge répartie sur ℓ) — et non 4a + ℓ/2, qui est la hauteur sur laquelle disposer ΣA_r quand δ est plafonné ; corrigé. λ = max[¼(δ + 12 τ_u/f_cj − 1) ; 1/10] (f_cj non plafonné dans λ). L'annexe ne traite pas l'effort horizontal en tête (E.6.2,6) : le complément de Perchat est signalé comme tel.
  - Annexe E.8 (pressions localisées sous les appareils, tête de pile) : f_su = f_e/γ_s (et non 2/3 f_e) ; frettes de surface 0,04 R_u/f_su ; d_j = 2 min(c_j ; c_j*) ; A_ej = R_j/(k_j f_su), k_j = 1 (extrême) ou 1,5 (intermédiaire) ; total sup(max A_ej ; 0,15 R_u/f_su) + 0,04 R_u/f_su ; corrigé.
  - Conséquence pour la note de référence : la console de P2-6, chargée par un appareil (charge répartie sur ℓ = 0,6 m), n'a pas à être plafonnée (4ℓ = 2,4 m > d = 1,5 m) : τ_u = 3,54 MPa ≤ 4 MPa, conforme. Les frettes de surface valent 0,04 R_u/f_su = 4,98 cm² (la note : 8,48 cm², du côté de la sécurité).
- **ETA-06/0147 BBR** (26.06.2025) lue : frottement (tableau 3), recul (§ 1.7), entraxes (annexe 37, frette et étriers, f_cm,0 cylindre 19 à 35 MPa), bord (§ 1.8), trompe-plaques A (annexe 8), gaines et rayons (annexe 31, f ≈ 0,40, p_R,max = 130 kN/m) ; unités 0406 à 3106.

## 2. Protocole de comparaison avec une note de référence

### 2.1 Référentiel Eurocodes — note CHAMOA-PSIDA (Cerema, guide technique, ch. 4)
1. Saisir exactement la géométrie de l'exemple du ch. 4 (portées, 2b, h, chaussée, trottoirs, superstructures, revêtement, classe de trafic → α).
2. Comparer, dans l'ordre :
   - charges permanentes : g [kN/m], M sur appuis et en travée, réactions → écart attendu < 1 % (pure RDM) ;
   - LM1 TS et UDL séparément : M_max/M_min de la poutre entière → écart < 2 % si la grille de positions est fine ;
   - m_x(y) aux ordonnées de la note (CHAMOA sort des nappes par bandes) → écart 3–8 % attendu (H3, H4) ;
   - réactions et tranchants ;
   - aciers (une fois le module sections écrit).
3. Noter chaque écart > 5 % avec l'hypothèse responsable (tableau ci-dessus).

### 2.2 Référentiel Fascicule 61 — note PSIDA.EL commentée (fait : § 1 quater)
1. Saisir le rectangle équivalent (largeur, I, aire) de la note, `leqMethod = 'fleches'`, ν = 0, classe imposée.
2. Comparer moments « poutre × coefficient de répartition » : la note publie M_poutre × K × δ par cas de charge, K étant le maximum sur
   les fibres de la travée (a1 et bc inclus, δ exclu du tableau des coefficients).
3. Combinaisons de la note (règles BAEL 83) : ELU = 1,125 × [1,2 G + 1,42 (A ou B) + 1,2 Mc + 1,42 trottoirs] = 1,35 G + 1,6 Q ;
   ELS = G + 1,2 (A ou B) + trottoirs ; tassements aléatoires à l'ELU seulement.

## 3. Documents de référence en ligne

- Cerema, *CHAMOA-P PSIDA — Guide technique* (avril 2023) : méthode (ch. 2) et note de calculs commentée (ch. 4). https://logiciels-oa.cerema.fr/Ponts_Types/CHAMOA-P/CHAMOA_P_PSIDA.pdf
- Cerema, *CHAMOA-P PSIDP — Guide technique* (avril 2023). https://logiciels-oa.cerema.fr/Ponts_Types/CHAMOA-P/CHAMOA_P_PSIDP.pdf
- Cerema, *Abaques de pré-dimensionnement à partir de CHAMOA-P* (avril 2024). https://logiciels-oa.cerema.fr/Ponts_Types/CHAMOA-P/CHAMOA_Abaques.pdf
- SETRA, *Ponts-dalles — Guide de conception* (juillet 1989), 137 p. : domaine d'emploi, travure, abaques d'épaisseur (p. 59–61 BP, p. 65–67 BA, numérisés dans `src/abaques1989.js`), biais (§ 3.4), appareils d'appui (§ 3.6), désordres (ch. 5), annexe 1 « Note sur le calcul automatique des tabliers-dalles ». https://piles.cerema.fr/IMG/pdf/ponts-dalles_guide_de_conception_1989_cle218b1a.pdf
- SETRA, *PSIDP.EL — Notice d'utilisation, note de calcul modèle* (1985). https://piles.cerema.fr/IMG/pdf/ponts_dalles_precontraints_d_inertie_constante_-_notice_d_utilisation_du_programme_de_calcul_psidp-el_-_1985_cle52216b.pdf
- SETRA, *PSIPAP — Guide de calcul* (1986), contient un bordereau et une note PSIDA.EL. https://piles.cerema.fr/IMG/pdf/psipap_ponts_dalles_a_poutrelles_ajourees_precontraints_-_guide_de_calcul_1986_cle59721c.pdf
- SETRA, *MRB-EL — Tabliers-dalles biais ou courbes* (1995). https://piles.cerema.fr/IMG/pdf/tabliers-dalles_-_biais_ou_courbes_-_programme_de_calcul_mrb-el_-_1995_cle7b253d.pdf
- SETRA, *MCP-EL — Ponts-dalles d'inertie variable, nervurés ou élégis* (1984). https://piles.cerema.fr/IMG/pdf/ponts_dalles_precontraints_d_inertie_variable_-_ponts_dalles_a_nervures_ou_elegis-_notice_d_utilisation_du_programme_de_calcul_mcp-el_-_1984_cle75a2a5.pdf

Bibliographie : Bareš & Massonnet (1966) ; Pücher (1977) ; Homberg (1968) ; Calgaro & Virlogeux ; Hambly (1991) ; O'Brien, Keogh & O'Connor (2014) ; EN 1991-2, EN 1992-1-1, EN 1992-2 ; Fascicule 61 titre II ; BAEL 91.

## 4. Vérifications internes déjà en place (`npm test`, 102 tests)

- Poutre : PL/4 ; −qL²/8 et 9/128·qL² (2 travées) ; −qL²/10, 0,08 qL², 0,025 qL² (3 travées) ; enveloppe une travée chargée 0,0957 qL² ; convoi glissant ; portées équivalentes 0,8L / 0,447L.
- Guyon-Massonnet : conditions de bord libre exactes, saut de Y''' = 1 sous la charge, flèche moyenne = poutre (∫K = 2b à 10⁻⁵), réciprocité K(y,e) = K(e,y), symétrie, limite θ → 0 ⇒ K = 1, continuité en charge de bord, μ nul aux bords, ∫m_x dy = moment de poutre (séries de Fourier).

Valeurs de contrôle (α = 1) à comparer aux tables de Massonnet-Bareš : θ = 0,5 → K(0,0) = 1,115, K(b,b) = 2,136 ; θ = 1 → K(0,0) = 1,632, K(b,b) = 4,189.
