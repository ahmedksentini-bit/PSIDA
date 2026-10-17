# Hypothèses de modélisation et protocole de comparaison

## 1. Hypothèses (H1–H6) et où les retrouver dans le code

| # | Hypothèse | Code | À confronter à |
|---|-----------|------|----------------|
| H1 | Dalle isotrope de largeur totale 2b (encorbellements compris), inertie équivalente constante, ν = 0,2 (option `nu`, 0 = tables de Massonnet) | `SlabDeck` (`b = width/2`, `nu`) | CHAMOA-PSIDA ch. 2 §3.3 : dalle isotrope de largeur totale, I = I_tot/2b_d. **Vérifié** : avec ν = 0,2 le facteur de bord reproduit KTRANS à 0,4 % (P1) et 2,3 % (travée 1) ; avec ν = 0 il est 7 % trop bas |
| H2 | Poutre continue à EI constant, appuis simples, abouts en console (`overhangs`) | `ContinuousBeam` | **Vérifié** à 10⁻³ près sur les moments de poids propre et de superstructures de la note CHAMOA (ST1) |
| H3 | Premier harmonique ; θ = b/L_eq ; L_eq = distance entre points de moment nul de la travée **seule chargée** par une charge uniforme (« méthode des moments » CHAMOA), moyenne des deux L_eq sur appui | `equivalentSpans()`, `LeqAt()` ; paramètre `Leq` | **Vérifié** : 8,9119 / 11,1867 m contre 8,9118 / 11,1862 (note CHAMOA, tableau « caractéristiques équivalentes ») |
| H4 | Pour chaque fibre y, arrangement transversal le plus défavorable (voies glissées et renumérotées, pas `laneStep`) ; files indépendantes longitudinalement : m_x(y) = Σ K̄_i(y)·M_i/2b | `laneArrangementsEC()`, `evaluateArrangements()` | CHAMOA ch. 2 §3.4.1 : « effet le plus défavorable de la répartition transversale pour chaque point d'étude transversal ». Le facteur de bord (dimensionnant) est reproduit ; le profil CHAMOA est plus plat vers l'axe (1,18 contre 1,10), définition exacte du fichier Guyon à élucider |
| H5 | Poids propre K = 1 ; superstructures avec K(e,y) ; revêtement bande uniforme avec K̄ | `permanent()` | PSIDA répartit aussi les charges permanentes excentrées |
| H6 | Calcul longitudinal suivant les portées biaises sans correction (pratique CHAMOA § 3.4.1) ; biais mécanique φ du guide SETRA 1989 et moments dans les directions d'aciers (annexe 12A) dans `skew.js` ; règles de conception du guide dans `conception.js` | `skew.js`, `conception.js` | **Vérifié** : φ = 82,5322 / 86,5105 gr et les 11 M_APF de la note CHAMOA reproduits à 10⁻⁴ (`test/skew.test.js`) ; validité φ ≥ 70 gr (guide § 2.4) |
| H7 | Flexion transversale sur dalle isostatique équivalente (voir § 1 ter) | `transverse.js` | CHAMOA §4.3 et fichiers 5.4 (biais 80 gr) |

Autres choix :
- ν = 0 pour K (tables classiques) ; option `nu` dans `guyon.js` pour les moments transversaux (correction de Bareš).
- UDL Eurocode appliquée sur les zones défavorables de la ligne d'influence (EN 1991-2 §4.3.2(1)b) ; A(l) par travées entières (pratique SETRA).
- Voies Eurocode numérotées depuis chaque bord de chaussée (deux arrangements), enveloppe des deux.
- Fascicule 61 : files Bc/Bt accolées (2,50 m) depuis chaque bord de la largeur chargeable ; Mc120 et D240 au plus près de chaque bord et au centre.
- δ (Fasc. 61 art. 5.5) calculé par travée avec G = g·L et S = poids maximal du système sur la travée (approché : 1 ou 2 camions par file selon L ≥ 16,5 m) ; sur appui, δ max des deux travées.

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

### 2.2 Référentiel Fascicule 61 — note PSIDA.EL (reproduite dans le guide PSIPAP 1986, p. 63 sqq.)
1. Même géométrie ; classe du pont, largeur chargeable, nombre de voies.
2. PSIDA.EL donne les efforts aux ordonnées y = B/4 et y = −3B/8 (convention à vérifier dans la note) : renseigner `ys` en conséquence.
3. Comparer A(l) (a1, a2, longueur chargée retenue), Bc (bc, δ), Bt, Mc120 (δ), puis les combinaisons ELS/ELU BAEL (1,2 / 1,6 sur A et B ; 1,0 / 1,35 sur Mc et D).

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

## 4. Vérifications internes déjà en place (`npm test`, 49 tests)

- Poutre : PL/4 ; −qL²/8 et 9/128·qL² (2 travées) ; −qL²/10, 0,08 qL², 0,025 qL² (3 travées) ; enveloppe une travée chargée 0,0957 qL² ; convoi glissant ; portées équivalentes 0,8L / 0,447L.
- Guyon-Massonnet : conditions de bord libre exactes, saut de Y''' = 1 sous la charge, flèche moyenne = poutre (∫K = 2b à 10⁻⁵), réciprocité K(y,e) = K(e,y), symétrie, limite θ → 0 ⇒ K = 1, continuité en charge de bord, μ nul aux bords, ∫m_x dy = moment de poutre (séries de Fourier).

Valeurs de contrôle (α = 1) à comparer aux tables de Massonnet-Bareš : θ = 0,5 → K(0,0) = 1,115, K(b,b) = 2,136 ; θ = 1 → K(0,0) = 1,632, K(b,b) = 4,189.
