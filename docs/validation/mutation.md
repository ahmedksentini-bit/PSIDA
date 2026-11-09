# Force des tests : campagne de mutation (novembre 2026)

Un test de mutation introduit volontairement une petite erreur dans le code de calcul (un signe inversé, un « + » changé
en « − », une constante majorée de 10 %, une comparaison décalée d'un cran) et vérifie qu'au moins un test la détecte.
Un mutant non détecté (« survivant ») montre un endroit où une erreur de calcul passerait inaperçue. Le score de mutation
est la part des mutants détectés.

## Méthode

Outil maison sans dépendance (`tools/mutation/`), parce que PSIDA n'a aucune dépendance npm et que ses tests tournent
sous `node --test` en modules ES :

- `jetons.mjs` découpe le source en jetons (commentaires, chaînes, gabarits avec leurs `${…}`, expressions régulières,
  nombres, noms, ponctuation) ;
- `mutants.mjs` produit les mutants : `+` ↔ `−` et `×` ↔ `÷` binaires, signe unaire supprimé, `<` ↔ `<=`, `>` ↔ `>=`,
  `===` ↔ `!==`, `&&` ↔ `||`, `Math.max` ↔ `Math.min`, constante × 1,1 (ou + 1 pour un entier). Le contenu des chaînes,
  des gabarits (messages, formatage des notes) et des commentaires n'est jamais muté ; tous les mutants produits sont
  syntaxiquement valides (vérifié sur les 3 772 mutants des huit modules) ;
- `couverture.mjs` lance chaque fichier de test seul sous `NODE_V8_COVERAGE`, mesure sa durée et relève les modules dont
  une fonction est réellement exécutée (carte écrite dans `tools/mutation/.cache/`, non versionnée) ;
- `lancer.mjs` tire un échantillon de mutants par module (graine fixe), écrit chaque mutant dans une copie de travail du
  dépôt et lance les tests qui exécutent le module, du plus rapide au plus lent, dans un budget de temps ; le premier
  « not ok » tue le mutant, un dépassement de délai aussi (boucle infinie). Les survivants sont rejoués sur un second
  jeu plus large : d'abord les tests qui importent directement le module, puis les plus rapides, dans un second budget ;
- `rejouer.mjs` rejoue les seuls survivants après ajout de tests.

```
npm run mutation:couverture                 # carte de couverture (≈ 1 h 30 sur 2 cœurs, instrumentée)
npm run mutation -- --max 80 --budget 20 --budget2 60
node tools/mutation/rejouer.mjs --budget 20 --budget2 60
```

Le score porte donc sur **les tests rapides et directs** de chaque module, pas sur toute la suite : les tests
d'intégration de plusieurs minutes (chaîne complète des appuis, notes de calcul) ne sont pas lancés pour chaque mutant.
Sur un échantillon de 12 survivants des fondations rejoués avec tous les tests directs (jusqu'à 700 s par mutant),
3 ont été tués par les tests d'intégration lents : le score réel de la suite complète est un peu plus élevé, mais ces
tests lents ne localisent pas l'erreur.

## Résultats (80 mutants tirés par module, graine 20261108)

| Module | Mutants possibles | Score avant | Score après | Tests ajoutés |
|---|---|---|---|---|
| `src/beam.js` (poutre continue, lignes d'influence) | 1 116 | 61,3 % (63,8 %¹) | 71,3 % | `renfort_poutre` |
| `src/guyon.js` (Guyon-Massonnet) | 324 | 65,0 % (72,5 %¹) | 82,5 % | `renfort_guyon` |
| `src/loads_ec.js` (EN 1991-2, EN 1991-1-5) | 134 | 82,5 % | 92,5 % | `renfort_charges_ec` |
| `src/loads_f61.js` (Fascicule 61 titre II) | 185 | 48,8 % | 80,0 % | `renfort_charges_f61` |
| `src/design.js` (assemblage du dimensionnement) | 461 | 6,3 % | 32,5 % | `renfort_dimensionnement` |
| `src/bearings.js` (appareils d'appui, freinage) | 545 | 75,0 % | 80,0 % | `renfort_freinage` |
| `src/supports/foundation.js` (fondations) | 649 | 1,3 % | 60,0 % | `renfort_fondations` |
| `src/cadre/sections.js` (sections des cadres) | 358 | 58,8 % | 91,3 % | `renfort_cadre_sections` |

¹ Second passage (0.99.49) sur `beam.js` et `guyon.js` : carte de couverture refaite sur les seuls tests qui importent ces
deux modules, d'où un score « avant » un peu différent du premier passage (même échantillon de 80 mutants, mêmes
budgets 20 s / 60 s). Le score « après » est mesuré sur cette même carte, nouveaux tests compris.

Les tests ajoutés comparent PSIDA à des valeurs indépendantes, jamais à sa propre sortie :

- valeurs réglementaires du Fascicule 61 titre II (voies, a1, v0, A(l), Bc, Bt, Br, δ, Mc120, D240, trottoirs) et de
  l'EN 1991-2 / EN 1990 A2 / EN 1991-1-5 (voies conventionnelles, LM1, LM2, ψ, k_sur) ;
- calculs à la main des formules (σ̄s BAEL, tirants de semelles sur pieux, semelles par bielles et par consoles avec
  l'intégrale exacte du diagramme trapézoïdal ou triangulaire, groupe de pieux, Ménard, béton des pieux, paroi fléchie,
  V_Rd,c, w_k de l'EN 1992-1-1 § 7.3.4, freinage EN 1991-2 § 4.4.1 et Fascicule 61) ;
- solution analytique de Hetényi pour le pieu de Winkler long (tête libre et encastrée) ;
- recalcul de l'effort tranchant, du poinçonnement et des minimums transversaux de `design.js` à partir des efforts
  du calcul, avec les formules de l'EN 1992-1-1 (6.2.2, 6.2.3) et du BAEL (A.5.1, A.5.2) ;
- poutre continue (`renfort_poutre`) : équation des trois moments de Clapeyron (EI variable par travée), 3PL/32, ligne
  d'influence de M_B −a(L² − a²)/(4L²) et son extremum −L/(6√3), console (−c sur l'appui d'about, +c/4 au suivant),
  gradient thermique 3EIκ/2 et dénivellation 3EIδ/L² par superposition, bandes de charge (qcL/4 − qc²/8, cas
  défavorable de charges disjointes), charge A(l) dépendant de la longueur chargée, convoi avec espacement minimal actif ;
- Guyon-Massonnet (`renfort_guyon`) : identités exactes de l'équation de la plaque orthotrope à bords libres
  (∫Y dy = 1/k⁴ pour tout α et tout harmonique, d'où K moyen = 1 ; α = 0 : ∫yK dy = 2be), limite de Courbon
  K = 1 + 3ey/b² et K = 1 à θ → 0, interpolation de Massonnet en √α (K, μ, moments locaux), conditions aux limites
  d'une charge sur le bord libre, Σ m_x sur la largeur = moment de poutre.

Aucun mutant tué n'a révélé de défaut de calcul : les modules faibles l'étaient par manque de tests unitaires rapides,
pas par erreur.

## Survivants restants (168 sur 640) et pourquoi

- **Mutants équivalents ou sans effet d'ingénierie** : tolérances numériques (`1e-9` → `1,1e-9`), nombre d'itérations
  d'une dichotomie déjà convergée, valeurs par défaut d'options que le pipeline passe toujours explicitement, cases des
  tables a1 et bc des classes 2 et 3 au-delà de deux voies (inatteignables : ces ponts ont au plus deux voies), pas de
  discrétisation (200 éléments de pieu → 201, pas de convoi) qui ne changent le résultat qu'à l'arrondi.
- **`src/beam.js`** (23 survivants après renfort) : finesse des grilles et tolérances (pas de recherche, bornes des
  primitives `_primitive` / `_primitiveSigned`), choix de branche de signe dans `integrateIL`, découpage et masque de la
  charge répartie selon la longueur chargée, internes de la programmation dynamique des essieux et des convois (bornes de
  boucles qui ne changent l'optimum qu'à l'arrondi), racine de `equivalentSpans`. Aucun ne cache d'erreur de calcul :
  rejoués un à un, ils déplacent le résultat de moins que la discrétisation.
- **`src/guyon.js`** (14) : équivalents pour l'essentiel — tolérances `1e-9`, décalage de l'origine de la base
  exponentielle (t = y + c reste une base de solutions), dérivée de la base isotrope (α = 1) qui n'intervient que par
  une combinaison où elle se simplifie, sélection de branche de la charge au bord (autre chemin, même physique, ou jamais
  atteinte), nombres de morceaux et d'itérations des intégrations, seuil d'α du cas isotrope.
- **`src/design.js`** (54) : chemins du pont-dalle sous rail (`designRailEC`), flexion transversale (`designTransverse*`)
  et combinaisons partielles, couverts seulement par des tests d'intégration lents.
- **`src/supports/foundation.js`** (32) : enchaînement portance / glissement / surface comprimée par état limite et
  frottement négatif, couverts seulement par les tests d'intégration des appuis (plusieurs minutes chacun).
- **`src/bearings.js`** (16) et **`src/loads_f61.js`** (16) : grille de recherche des coefficients d'inégalité,
  sélection de l'appareil, valeurs par défaut de `designBearings`, fenêtre glissante des convois de chenilles.

Les résultats bruts (mutant par mutant : ligne, opérateur, test qui l'a tué) se régénèrent avec les commandes ci-dessus.
