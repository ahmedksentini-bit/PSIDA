# Hypothèses de modélisation et protocole de comparaison

## 1. Hypothèses (H1–H6) et où les retrouver dans le code

| # | Hypothèse | Code | À confronter à |
|---|-----------|------|----------------|
| H1 | Dalle isotrope de largeur totale 2b (encorbellements compris), inertie équivalente constante | `SlabDeck` (`b = width/2`) | CHAMOA-PSIDA ch. 2 §3.4 : « modèle Guyon constitué d'une dalle isotrope » avec inertie équivalente |
| H2 | Poutre continue à EI constant, appuis simples | `ContinuousBeam` | CHAMOA : flexion longitudinale avec ST1 (modèle à barres) ; PSIDA.EL : idem par RDM |
| H3 | Premier harmonique ; θ = b/L_eq ; L_eq = distance entre points de moment nul sous charge uniforme (rive et intermédiaire), moyenne des deux L_eq sur appui | `equivalentSpans()`, `LeqAt()` ; paramètre `Leq` pour imposer d'autres valeurs | Choix de portée équivalente de PSIDA / CHAMOA (à lire dans les guides) |
| H4 | Files de charge indépendantes : m_x(y) = Σ K̄_i(y)·M_i/2b, positions longitudinales choisies file par file | `evaluateCase()` | Légèrement conservatif pour Bc (files alignées) ; exact pour LM1 |
| H5 | Poids propre K = 1 ; superstructures avec K(e,y) ; revêtement bande uniforme avec K̄ | `permanent()` | PSIDA répartit aussi les charges permanentes excentrées |
| H6 | Ouvrage droit | — | Biais 70–100 gr : coefficients correctifs du guide SETRA 1989 |

Autres choix :
- ν = 0 pour K (tables classiques) ; option `nu` dans `guyon.js` pour les moments transversaux (correction de Bareš).
- UDL Eurocode appliquée sur les zones défavorables de la ligne d'influence (EN 1991-2 §4.3.2(1)b) ; A(l) par travées entières (pratique SETRA).
- Voies Eurocode numérotées depuis chaque bord de chaussée (deux arrangements), enveloppe des deux.
- Fascicule 61 : files Bc/Bt accolées (2,50 m) depuis chaque bord de la largeur chargeable ; Mc120 et D240 au plus près de chaque bord et au centre.
- δ (Fasc. 61 art. 5.5) calculé par travée avec G = g·L et S = poids maximal du système sur la travée (approché : 1 ou 2 camions par file selon L ≥ 16,5 m) ; sur appui, δ max des deux travées.

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
- SETRA, *Ponts-dalles — Guide de conception* (juillet 1989), annexe 1 « Note sur le calcul automatique des tabliers-dalles ». https://piles.cerema.fr/IMG/pdf/ponts-dalles_guide_de_conception_1989_cle218b1a.pdf
- SETRA, *PSIDP.EL — Notice d'utilisation, note de calcul modèle* (1985). https://piles.cerema.fr/IMG/pdf/ponts_dalles_precontraints_d_inertie_constante_-_notice_d_utilisation_du_programme_de_calcul_psidp-el_-_1985_cle52216b.pdf
- SETRA, *PSIPAP — Guide de calcul* (1986), contient un bordereau et une note PSIDA.EL. https://piles.cerema.fr/IMG/pdf/psipap_ponts_dalles_a_poutrelles_ajourees_precontraints_-_guide_de_calcul_1986_cle59721c.pdf
- SETRA, *MRB-EL — Tabliers-dalles biais ou courbes* (1995). https://piles.cerema.fr/IMG/pdf/tabliers-dalles_-_biais_ou_courbes_-_programme_de_calcul_mrb-el_-_1995_cle7b253d.pdf
- SETRA, *MCP-EL — Ponts-dalles d'inertie variable, nervurés ou élégis* (1984). https://piles.cerema.fr/IMG/pdf/ponts_dalles_precontraints_d_inertie_variable_-_ponts_dalles_a_nervures_ou_elegis-_notice_d_utilisation_du_programme_de_calcul_mcp-el_-_1984_cle75a2a5.pdf

Bibliographie : Bareš & Massonnet (1966) ; Pücher (1977) ; Homberg (1968) ; Calgaro & Virlogeux ; Hambly (1991) ; O'Brien, Keogh & O'Connor (2014) ; EN 1991-2, EN 1992-1-1, EN 1992-2 ; Fascicule 61 titre II ; BAEL 91.

## 4. Vérifications internes déjà en place (`npm test`)

- Poutre : PL/4 ; −qL²/8 et 9/128·qL² (2 travées) ; −qL²/10, 0,08 qL², 0,025 qL² (3 travées) ; enveloppe une travée chargée 0,0957 qL² ; convoi glissant ; portées équivalentes 0,8L / 0,447L.
- Guyon-Massonnet : conditions de bord libre exactes, saut de Y''' = 1 sous la charge, flèche moyenne = poutre (∫K = 2b à 10⁻⁵), réciprocité K(y,e) = K(e,y), symétrie, limite θ → 0 ⇒ K = 1, continuité en charge de bord, μ nul aux bords, ∫m_x dy = moment de poutre (séries de Fourier).

Valeurs de contrôle (α = 1) à comparer aux tables de Massonnet-Bareš : θ = 0,5 → K(0,0) = 1,115, K(b,b) = 2,136 ; θ = 1 → K(0,0) = 1,632, K(b,b) = 4,189.
