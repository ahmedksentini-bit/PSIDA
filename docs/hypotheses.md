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
- Non traité : recherche automatique du fuseau et du tracé optimal (simplexe de PSIDP), zones d'about et diffusion
  (BPEL annexe 4).

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
