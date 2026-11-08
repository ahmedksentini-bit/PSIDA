# Tests d'invariants sur des ouvrages tirés au hasard (v0.99.43)

Les tests `test/invariants_*.test.js` tirent des ouvrages au hasard dans le domaine d'emploi de PSIDA. Sur chacun, ils
vérifient des propriétés physiques qui doivent toujours être vraies : équilibre, symétrie, réciprocité de Maxwell-Betti,
cas limites, monotonie, continuité, absence de sortie non finie. Ils complètent les tests de référence (notes SETRA,
CHAMOA, calculs à la main), qui portent sur quelques ouvrages précis.

Les tirages sont reproductibles : générateur à graine fixe (`test/alea.mjs`), graine de chaque tirage rappelée dans le
message d'un échec.

- `INVARIANTS_LONG=1` : dix fois plus de tirages.
- `INVARIANTS_GRAINE=n` : autre graine de départ.
- Durée en mode normal : environ 3 à 4 minutes (2 cœurs). En mode long, les tests hors chaîne du pont-dalle prennent 2 minutes ; la chaîne complète (`invariants_dalle`) dure environ dix fois plus que son mode normal et n'a pas encore été passée en mode long.

## Invariants couverts

| Fichier | Objet | Invariants | Tirages (normal / long) |
|---|---|---|---|
| `invariants_poutre` | poutre continue | ΣR = 1 pour chaque position de la charge unité ; charge uniforme : ΣR = g L, statique de chaque travée, saut d'effort tranchant = réaction ; symétrie ; Maxwell-Betti des tassements d'appui, réactions auto-équilibrées ; continuité des enveloppes UDL et tandem ; g L²/8 et croissance avec la portée | 60 / 600 par propriété |
| | Guyon-Massonnet | ∫K dy = 2b ; K(e, y) = K(y, e) ; K(e, y) = K(−e, −y) ; θ → 0 : K → 1 (α = 1), K → 1 + 3ey/b² (α = 0), interpolation en √α | 40 / 400 |
| | grillage de poutres | ΣR = P ; Σ M(L/2) = moment isostatique ; Maxwell-Betti des flèches ; symétrie de η ; entretoises rigides sans torsion = Courbon | 15 / 150 |
| `invariants_plaque` | plaque (éléments finis DKT et différences finies) | ΣR = charge ; m_x et m_y à mi-portée = solution exacte de Lévy (99 harmoniques) ; Maxwell-Betti ; symétrie ; continuité du biais | 5 / 50 par moteur |
| `invariants_dalle` | chaîne complète du pont-dalle (EC et Fascicule 61) | aucune sortie non finie ; ΣR des permanents = g × longueur ; aciers ≥ 0 ; symétrie (permanents, LM1, aciers) ; monotonie des aciers avec le revêtement ; continuité des aciers calculés et des réactions sous une portée allongée de 10⁻³ | 12 calculs / 120 |
| `invariants_ouvrages` | sections EC2 et BAEL | aciers croissants avec M, décroissants avec d, sans saut ; équilibre de la section fissurée | 200 / 2 000 |
| | cadres et portiques | aucune sortie non finie, métré positif | 40 / 400 |
| | ponts à poutres | aucune sortie non finie | 3 / 30 |

## Défauts trouvés et corrigés (v0.99.43)

1. **Essieu au bout de l'about ignoré (poutre continue).**
   - Problème : une position de convoi x₀ + i·pas qui tombe sur l'extrémité de l'ouvrage la dépasse parfois d'un arrondi (7,400000000000002 > 7,4). La ligne d'influence y valait alors 0.
   - Exemple : travée de 7 m, abouts de 0,80 et 0,40 m, pas de 0,10 m. Moment négatif à 0,8 L sous le tandem : −72 au lieu de −96 kN·m.
   - Correction : `ilAt` et `_samples` ramènent sur l'extrémité une position qui la dépasse de moins de 10⁻⁹ (`src/beam.js`).
   - Trouvé par la continuité des enveloppes, graine 20261176.
2. **« As = NaN » dans la note et le métré des cadres très sollicités (ELS BAEL).**
   - Problème : la formule de BVTrace pour α (deux itérations de point fixe) diverge pour k = 90 μ/σ_s ≥ 4,5 : α > 1, puis NaN dès k = 5. Il en résultait « As = NaN cm²/ml » dans la note, aucune barre choisie et un métré « NaN kg ».
   - Correction : la formule est gardée tant qu'elle donne 0 < α < 1, ce qui conserve la parité avec BVTrace. Au-delà, α est la racine exacte de α²(3 − α) = k (1 − α) (`src/cadre/sections.js`).
   - Trouvé sur un portique de 1,98 × 5,33 m sous 4,73 m de remblai, avec des pièces de 0,20 m (graine 20261466). L'ouvrage reste signalé insuffisant.

## Défaut corrigé en v0.99.47

3. **ELS des sections quand le béton gouverne : bascule non monotone** (`src/section_ec2.js` flexureSLS, `src/section_bael.js` flexureELS).
   - Problème : la recherche d'aciers tendus seuls se faisait dans [0 ; 8 M/(d σ_s)] et ne passait aux aciers comprimés que si cette borne arbitraire ne suffisait pas. A_s tendu pouvait donc diminuer quand M augmentait (graine 20261140 : ρ = 3,9 %, 249 cm²/m qui devenaient 159 cm²/m + A_s2 pour M × 1,2), et A_s2 n'était ni ferraillé ni signalé.
   - Correction : méthode du moment limite du béton. L'axe neutre limite est y₁ = α₁ d, α₁ = n σ̄c/(n σ̄c + σ̄s), et M_rb est le moment du béton comprimé à σ̄c par rapport aux aciers tendus (intégré sur la largeur réelle en cas de chanfreins). Sous M_rb : armatures simples avec σ_s = σ̄_s. Au-delà : A' = (M − M_rb)/(σ'sc (d − d')), σ'sc = n σ̄c (y₁ − d')/y₁, A = A_rb + A' σ'sc/σ̄s (BAEL 91 A.4.5,2 ; EN 1992-1-1 § 7.2 avec α_e = 15). A et A' sont continus et croissants en M.
   - Ferraillage : les aciers comprimés d'une face sont repris dans la face opposée (`reprendreComprimes`, `src/design.js`) ; les tableaux de ferraillage et la note les signalent (« A_s2 = … comprimés ») ; les recommandations du tablier signalent les aciers comprimés et un taux > 4 % (EN 1992-1-1 § 9.2.1.1(3)), avec recherche d'épaisseur.
   - Tests : `test/els_moment_limite.test.js` (références à la main BAEL et EC2, largeur variable), invariants de continuité et de monotonie autour de M_rb, domaine des tirages de sections porté à 6 %.
   - Effet : aucun sur l'exemple fil rouge ni sur les exemples 1 à 3 (aucune section au-delà de M_rb). Sur l'exemple 4 (dalle précontrainte), seuls les aciers du calcul en béton armé, indicatifs, changent.

## Défauts trouvés et laissés ouverts (documentés, testés tels quels)

1. *(corrigé en v0.99.47, voir plus haut)*
2. **ELS des cadres (BAEL) : σ_bc non vérifiée — corrigé en 0.99.45.**
   - Le module des cadres, porté de BVTrace, ne limitait que σ_s. Pour k > 1 environ, la compression du béton dépassait 0,6 f_c28 sans alerte.
   - Depuis la version 0.99.45 : σ_bc ≤ 0,6 f_c28 (BAEL 91 A.4.5,2) ; en Eurocode 2, σ_c ≤ 0,6 f_ck sous la combinaison caractéristique (§ 7.2(2)) et ≤ 0,45 f_ck sous la quasi permanente (§ 7.2(3)). Section fissurée, n = 15, aciers retenus ; ligne au tableau des armatures, alerte, verdict « NON » et recommandations (épaisseur, f_c28). Tests : `test/cadre_sigma_bc.test.js` et l'invariant des cadres tirés au hasard.
3. **Plaque : la triangulation change d'un coup entre le pont droit et un très faible biais.**
   - Le pont droit (ψ = 100 gr) alterne les diagonales des mailles ; un biais même infime prend toujours la plus courte.
   - Écart entre ψ = 100 et ψ = 99,999 gr, maille de 0,5 m : jusqu'à 1,3 % de m_x max en partie courante et 5 % aux angles. Il diminue de moitié quand la maille est divisée par deux : c'est une erreur de discrétisation, mais elle est visible.

4. **Entraxe des appareils d'appui : encorbellements ignorés** (relevé par l'alerte de la version 0.99.45).
   - PSIDA répartit les appareils sur toute la largeur de la dalle, encorbellements compris : entraxe 2b/(n − 0,1) (PSI-DA 68 § 2.4.1, établi pour une dalle rectangulaire).
   - Pour une dalle à larges encorbellements, les appareils de rive tombent sous la partie amincie. Exemples 3 et 4 du manuel (2b = 12 m, joues de 2,5 m, 4 appareils) : appareil de rive en y = ±4,62 m pour une nervure qui s'arrête à ±3,50 m. Aucun nombre d'appareils ne règle le cas (2 appareils : y = ±3,53 m).
   - Effet : réactions des appareils, chevêtres et plans de ces exemples calculés avec des appareils mal placés.
   - Correction proposée : répartir les appareils sur la largeur de la nervure (2b − 2 joues) quand la dalle a des encorbellements. Elle change le modèle et les résultats des exemples 3 et 4 (chapitres 24 et 25 du manuel) : laissée à une décision. `test/exemples.test.js` fige le défaut.

## Invariants mal posés au départ (corrigés dans les tests, sans toucher au code)

- **Limite θ → 0 de Guyon-Massonnet :** K → 1 seulement pour α = 1. Sans torsion, la limite est la répartition de Courbon continue.
- **Courbon par le grillage :** il faut des entretoises rigides à chaque station et un hourdis sans raideur de torsion.
- **Statique de la poutre sous charge uniforme :** erreur de quadrature en O(h²) des lignes d'influence, soit 1·10⁻⁴ de g L²/8 pour 100 positions par travée.
- **m_y de la plaque sous une petite surface chargée :** convergence en O(h). Maille de 0,25 m dans le test.
- **Monotonie des aciers avec le revêtement :** due seulement aux faces nettement tendues par le permanent. Près d'un point de moment nul, le revêtement minimal (k_min) des travées voisines l'emporte.
- **Continuité des aciers :** testée sur les aciers calculés (ELU, ELS, fissuration). Les minimums de l'EC2 (§ 9.2.1.1, § 7.3.2) et du BAEL s'appliquent dès qu'une face est tendue : l'enveloppe complète saute donc, par la règle normative elle-même, quand un moment change de signe.
- **Dalle trop mince pour sa travure :** le plan de ferraillage est refusé avec un motif (« hors des dispositions courantes »). C'est un comportement attendu.
