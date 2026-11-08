# Confrontation à l'exemple JRC EUR 25193

Référence : *Bridge Design to Eurocodes – Worked examples*, JRC Scientific and Technical Report EUR 25193 EN, 2012
([JRC](https://eurocodes.jrc.ec.europa.eu/publications/bridge-design-eurocodes-worked-examples)). Ouvrage d'étude :
pont mixte bipoutre continu 60 + 80 + 60 m, dalle de 12 m (chaussée de 11 m), poutres à 7 m d'entraxe, hauteur d'acier
2,80 m, C35/45, S355, durée de vie 100 ans.

**Sources réellement lues.** Le texte intégral du rapport n'a pu être lu que jusqu'au début du chapitre 3 (p. 37) :
l'outil de lecture tronque le PDF. Les valeurs des chapitres 3, 4, 6 et 8 viennent des supports de présentation du même
exemple publiés par le JRC :

- Malakatas, *Actions on bridges* (EN 1991), 2013 : `D1.7Malakatas.pdf` ;
- Davaine, *Bridge deck modelling*, 2013 et 2010 : `D1.8Davaine.pdf`, `2010_Bridges_AnalysisandModelling_LDavaine.pdf` ;
- Davaine, *Composite bridge design (EN 1994-2)*, 2013 : `D1.10Davaine.pdf` ;
- Kolias, *Seismic design of bridges (EN 1998-2)*, 2010 : `2010_EN1998_Bridges_BKolias.pdf`.

Tous ces fichiers sont sur `eurocodes.jrc.ec.europa.eu`. Seules des **valeurs** sont reprises ; le test
`test/jrc_eur25193.test.js` les fige.

## Ce qui est comparable

| Domaine | Comparable | Raison |
|---|---|---|
| Voies conventionnelles, LM1, freinage, chocs, γ et ψ | oui | données et formules publiées |
| Gradient d'une dalle béton (EN 1991-1-5, tableaux 6.1-6.2) | oui | tableaux publiés |
| Répartition transversale de LM1 (règle du levier) | oui | réactions publiées |
| L_e, b_eff, n₀, n_L, φ(t, t₀) | oui | valeurs publiées ; h₀ non publié (voir plus bas) |
| M_pl,Rd de la section B (mi-travée P1-P2) | oui, géométrie reconstituée | voir la ligne correspondante |
| Effort tranchant et voilement de la section A (appui P1) | oui | h_w, t_w, a, f_y publiés |
| f_y selon l'épaisseur des semelles | oui | tableau publié |
| Résistance des goujons | oui | données publiées |
| Fatigue : λ₁, λ_max | oui | formules et valeurs publiées |
| Fatigue : λ₂ = 0,848 | non | les données publiées (Q_m1 = 445 kN, trafic « moyen ») donnent 0,927 ; l'hypothèse du JRC n'est pas lisible |
| Armature minimale et raidissement en traction | en partie | k_c oui ; A_s,min et Δσ_s demandent la géométrie de la section A |
| Moments et réactions globaux par phase (41,0 à −112,7 MN·m) | non | répartition des tôles le long de l'ouvrage (fig. 1.12) et charges par cas absentes des sources lisibles |
| Largeur efficace réduite sur culée (5,869 m) | non implémenté | voir les limites |
| Vent | non | PSIDA ne calcule pas le vent |
| Séisme (piles hautes ; isolation par pendules) | non | a_g = 0,30 g ou 0,40 g et T_D = 2,0 ou 2,5 s, hors du zonage français de Pont EC8 ; le calcul d'isolation de Pont EC8 n'est appelable que dans l'interface |

## Résultats

| Grandeur (source) | JRC | PSIDA | Écart |
|---|---|---|---|
| Voies : chaussée de 11 m (ch. 3) | 3 × 3 m + 2 m | 3 × 3 m + 2 m | 0 |
| Freinage Q_lk pour L = 60 / 80 / 120 / 140 / 200 m (Malakatas, diap. 126) | 522 / 577 / 685 / 739 / 900 kN | 522 / 576 / 684 / 738 / 900 kN | ≤ 0,17 % (le support arrondit à l'unité supérieure) |
| Chocs F_dx / F_dy (diap. 98) | 1000/500, 750/375, 500/250, 150/75 kN | idem | 0 |
| ψ trafic TS / UDL, ψ thermique, γ (diap. 131-132) | 0,75 / 0,40 ; 0,6 / 0,6 / 0,5 ; 1,35 | idem | 0 |
| ΔT_M de la dalle, k_sur type 3 (diap. 63-64) | 15 / 8 °C × (0,8/1,1 ; 1,0/1,0 ; 0,7/1,0 ; 0,5/1,0) | idem | 0 |
| TS : R1 / R2 par essieu (Davaine, diap. 26) | 471,4 / 128,6 kN | 471,43 / 128,57 kN | < 0,01 % |
| UDL : R1 / R2 (diap. 27) | 35,36 / 6,64 kN/m | 35,357 / 6,643 kN/m | < 0,01 % |
| L_e en travées / sur appuis (diap. 9) | 51 / 56 / 51 ; 35 m | idem | 0 |
| b_eff en travée et sur appui (diap. 9) | 6,0 m | 6,0 m | 0 |
| n₀ (diap. 14) | 6,2 (6,16) | 6,162 | 0 |
| n_L dalle / déformations imposées / retrait / superstructures, à partir des φ du JRC | 15,61 / 18,09 / 15,24 / 14,15 | 15,61 / 18,10 / 15,24 / 14,15 | < 0,05 % |
| φ(∞, t₀), t₀ = 35,25 / 49,25 / 1 / 79,25 j | 1,394 / 1,291 / 2,677 / 1,179 | 1,385 / 1,299 / 2,694 / 1,186 | ≤ 0,7 %, avec h₀ = 500 mm, ciment N |
| F_c, F_a, axe neutre plastique, section B (D1.10, diap. 9-11) | 38,65 MN ; 47,25 MN ; 12,5 mm | 38,64 MN ; 47,25 MN ; 12,5 mm | < 0,05 % |
| M_pl,Rd section B (diap. 12) | 79,6 MN·m | 79,09 MN·m | −0,6 % (géométrie reconstituée) |
| V_pl,a,Rd section A (diap. 18) | 15,9 MN | 15,91 MN | +0,06 % |
| τ_cr ; λ̄_w (diap. 17-18) | 112,6 MPa ; 1,33 | 112,7 MPa ; 1,330 | +0,07 % ; 0 |
| χ_w ; V_bw,Rd, montant rigide (diap. 18) | 0,675 ; 8,14 MN | 0,675 ; 8,13 MN | −0,1 % |
| V_bw,Rd, montant non rigide (choix par défaut de PSIDA) | — | 7,52 MN | −7,6 %, du côté de la sécurité |
| f_y pour t = 40 / 55 / 80 / 120 mm (diap. 31) | 345 / 335 / 325 / 295 MPa | 345 / 335 / 325 / 295 MPa | 0 (après correctif) |
| P_Rd goujon Ø 22 × 200 (diap. 30) | 0,1095 MN | 0,1095 MN | 0 |
| λ₁ mi-travée L = 80 / 60 m ; appui L = 70 m (diap. 46-47) | 1,85 / 2,05 ; 2,10 | idem | 0 |
| λ_max mi-travée / appui L = 70 m | 2,0 / 2,52 | 2,0 / 2,52 | 0 (après correctif) |
| k_c P1 / mi-travée (diap. 22-23) | 1,13 → 1,0 ; 1,02 → 1,0 | idem | 0 |

## Écarts expliqués

- **φ(t, t₀).** Les supports ne donnent ni h₀ = 2A_c/u, ni le type de ciment, ni l'âge final. Avec h₀ = 500 mm, un ciment
  N et t = 100 ans, l'annexe B de l'EN 1992-1-1 programmée dans PSIDA retrouve les quatre valeurs du JRC à 0,7 % près.
  Parmi les couples essayés (ciments S, N et R ; h₀ de 150 à 1000 mm ; 100 ans ou temps infini), aucun ne fait mieux. Le test porte sur ce couple, avec une tolérance de 1 %.
- **M_pl,Rd.** La répartition des tôles n'est pas lisible dans les sources. La section B est reconstituée à partir de
  deux valeurs publiées : F_a = 47,25 MN, qui donne A_a = 0,137 m², et l'axe neutre plastique à 12,5 mm sous le dessus de
  la semelle, qui fixe la largeur de la semelle supérieure à 1,0 m. On obtient des semelles 1000 × 40 et 1200 × 40 et une
  âme 2720 × 18. La dalle d'aire 1,948 m² a sa face supérieure à 0,40 m au-dessus de la semelle. L'écart de −0,6 % vient de
  cette dalle idéalisée en rectangle (gousset, devers de 2,5 %).
- **V_bw,Rd.** Le JRC traite le panneau voisin de l'appui intermédiaire avec un montant rigide (EN 1993-1-5, tableau 5.1).
  PSIDA prend par défaut le montant non rigide, qui donne −7,6 %, du côté de la sécurité. L'option `montantRigide` de
  `cisaillement` retrouve 8,13 MN. Le calcul du pont mixte garde le choix prudent.
- **A_s,min.** Le JRC prend σ_s = f_sk (A_s,min = 90 cm²). PSIDA prend σ_s = 280 MPa (barres Ø 16, w_k = 0,3 mm). C'est
  plus sévère et admis par l'EN 1994-2 § 7.4.2 (1).
- **Masse volumique de l'acier.** Le JRC prend 77 kN/m³, PSIDA 78,5 kN/m³, et ajoute 10 % forfaitaires pour les
  entretoises (le JRC compte 1,5 kN/m par poutre).

## Défauts de PSIDA trouvés et corrigés (v0.99.44)

1. **Raidissement en traction des armatures** (`src/mixte/verifs.js`). L'EN 1994-1-1 § 7.4.3 (3) définit
   α_st = A I / (A_a I_a) : section fissurée (charpente + armatures) rapportée à la charpente seule. PSIDA rapportait la
   section non fissurée à la section fissurée. Il sous-estimait donc Δσ_s = 0,4 f_ctm/(α_st ρ_s), et la contrainte des
   armatures sur appui. Sur le bipoutre par défaut, σ_s passe de 151 à 207 MPa, toujours sous 0,8 f_sk = 400 MPa. Nouvelle
   fonction `raidissementTraction`.
2. **λ_max de la fatigue** (EN 1993-2 § 9.5.2 (7), figure 9.8). PSIDA plafonnait λ à 2,0 partout. Sur appui, λ_max vaut
   1,80 + 0,90 (L − 30)/50 (2,52 pour L = 70 m), et à mi-travée 2,5 − 0,5 (L − 10)/15 entre 10 et 25 m. La L de λ₁ sur
   appui est désormais la moyenne des deux travées adjacentes (§ 9.5.2 (2)). Nouvelle fonction `lambdaFatigue`.
3. **f_y au-delà de 100 mm** (`fyEpaisseur`). La limite restait à 315 MPa (S355) quelle que soit l'épaisseur. Elle suit
   désormais l'EN 10025-2, tableau 7 (S235, S275, S355), jusqu'à 250 mm, par exemple 295 MPa de 100 à 150 mm. Pour S420 et
   S460, le tableau 5 de l'EN 10025-3 est repris de mémoire : **à confirmer sur la norme**.

Fonctions ajoutées pour le contrôle, sans changer les résultats : `resistanceGoujon`, `kcFissuration`, option
`montantRigide` de `cisaillement`, sortie `tauCr`.

## Limites restantes

- Largeur efficace réduite sur culée (EN 1994-2 § 5.4.1.2 (6), β ≤ 1 : 5,869 m dans l'exemple) : non implémentée.
  L'analyse globale à b_eff constant est admise (§ 5.4.1.2 (4)). L'écart ne touche que la vérification des sections
  proches des culées, peu sollicitées en flexion.
- Moments globaux par phase, voilement des sections de classe 4, séisme : il faut la répartition des tôles et le texte
  intégral des chapitres 4, 6 et 8, à relire sur une copie complète du rapport.
