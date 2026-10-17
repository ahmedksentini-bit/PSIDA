# Calcul manuel d'un pont-dalle en béton armé — la méthode mise en œuvre dans PSIDA

Ce document décrit, étape par étape et avec les formules, la chaîne de calcul que l'outil exécute. Chaque étape
peut être refaite à la main ou au tableur ; l'outil ne fait qu'automatiser l'énumération des positions de charge.
Les notations suivent la note CHAMOA-PSIDA du Cerema, sur laquelle la chaîne a été calée (voir `hypotheses.md`).

## 0. Conception et prédimensionnement (guide SETRA 1989)

Avant tout calcul, l'outil confronte le projet aux règles du guide SETRA *Ponts-dalles – guide de conception* (1989) :

* **Domaine d'emploi (§ 1.2)** : dalle BA (PSI.DA) économique de 7 à 15 m (1–2 travées) et de 6 à 18 m (≥ 3 travées) ;
  dalle précontrainte (PSI.DP) de 14 à 25 m (30 m), à larges encorbellements au-delà d'une vingtaine de mètres ; plage
  commune 14–18 m. Au-delà de 25–30 m : dalle nervurée, bipoutre mixte, béquilles.
* **Épaisseur (§ 3.1.3, abaques p. 65–67 numérisés dans `src/abaques1989.js`)** : travée indépendante h(ℓ)
  (10 m → 0,44 ; 12 → 0,53 ; 14 → 0,625), deux travées égales (10 → 0,43 ; 12 → 0,51 ; 15 → 0,65), trois travées
  h(ℓ, θℓ) avec ℓ la travée centrale (10–19 m) et θℓ la travée de rive (plateau vers θ ≈ 0,4, montée jusqu'à θ = 1 :
  ℓ = 15 → 0,50 à θℓ = 8, 0,60 à 15), quatre travées h(ℓ, θℓ) (13,25–19 m ; courbes quasi plates jusqu'au minimum vers
  θ ≈ 0,83 puis la travée de rive gouverne : ℓ = 15 → 0,559 à θℓ = 8, 0,546 à 12,5, 0,609 à 15). Pour un nombre
  quelconque de travées, le guide applique les abaques à la travure symétrique équivalente (exemple 9-14-15-13-8 →
  8-15-15-8 → 0,56 m). Abaques établis pour un B25 : × 0,87 pour un B30, × 0,81 pour un B35. Les abaques s'arrêtent à
  0,40 m. Dalles précontraintes (§ 3.1.2, p. 59–61, classe II, chaussée 7,50 m + 2 × 1,25 m) : plateaux h(ℓ) de la dalle
  pleine (3 travées : 15 → 0,47, 22 → 0,635) et de la dalle à larges encorbellements (15 → 0,64, 25 → 0,91), montée de
  0,015 à 0,04 m lorsque la travée de rive dépasse 0,6–0,7 ℓ ; épaisseur minimale technique ≈ 0,8 h_éco.
* **Élancement courant (épaisseur / portée la plus longue, § 1.2)** : PSI.DA 1/20 (travée unique), 1/26 (2 travées),
  1/28 (3 travées et plus) ; PSI.DP 1/22–1/25, 1/25 (1/28 avec larges encorbellements), 1/33 (1/28). Les abaques donnent
  en pratique ℓ/22,5 (1 travée), ℓ/23 (2), ℓ/28 (3 travées, θ = 0,7) et ℓ/27 (4 travées). Ces valeurs correspondent aux
  charges du Fascicule 61 : sous LM1 l'épaisseur vérifiée est en général supérieure.
* **Travure (§ 2.1.1)** : 0,5 ≤ travée de rive / travée adjacente ≤ 0,85 (0,6 au moins en biais prononcé) — en deçà,
  risque de soulèvement de l'about ; nombre impair de travées décroissant du milieu vers les culées ; hauteur
  libre / portée ≲ 0,618 ; au-delà de 8 m de hauteur, 3 travées plutôt que 4 (§ 1.2.4). Les variantes proposées par
  l'outil prennent des rives à 0,7 fois la travée adjacente et, à 5 travées, des travées intermédiaires à 0,85 de la
  travée centrale.
* **Biais (§ 2.4, § 3.4.1)** : biais mécanique φ = ψ + (100 − ψ)(1 − n/2)² (n = largeur biaise / portée biaise < 2),
  Guyon-Massonnet (PSIDA, CHAMOA, cet outil) valable pour φ ≳ 70 gr ; direction des fers (§ 3.4.2) : option 1
  (longitudinaux parallèles aux bords libres, transversaux parallèles aux lignes d'appui) pour ψ ≳ 80 gr en BA (70 gr en
  BP), option 2 (fers parallèles et perpendiculaires aux bords libres) pour les biais prononcés, angle entre familles
  ≥ 60° ; aciers transversaux inférieurs ≥ 1,3 n ‰ (≤ 2 ‰) de la section, n = largeur/portée, × 1/sin ψ s'ils sont
  parallèles aux lignes d'appui (§ 3.4.3).
* **Coupe transversale (§ 2.3)** : largeur 5,50–16 m, au-delà de 15 m deux demi-tabliers ; ouvrage « de grande
  largeur » si la largeur dépasse une portée (efforts transversaux ≈ +20 %, gradient thermique sur les appareils d'appui
  de rive) ; encorbellements au-delà de 20 m (0,20 ± 0,05 m en extrémité, 0,50 ± 0,15 m à la jonction, ≤ 3,50 m de
  portée) ; dévers ≥ 2,5 %.
* **Abouts (§ 3.2)** : longueur ≥ 0,1 + 15 D (BA, D = plus gros fer ancré par courbure), ≥ 0,5 (1 + |cot ψ|) (BP).
* **Descente de charges (§ 1.3)** : poids propre 1,2 à 2 t/m², réactions ≈ 20 t/m (pile-culée) à 70 t/m (pile) par
  mètre de largeur, fondations superficielles fréquentes ; tassements différentiels admissibles 2–3 cm (6–7 cm avec
  renforts).
* **Domaine des programmes PSIDA / PSIDP (annexe 1 du guide)** : bords libres parallèles, biais mécanique > 70 gr, biais
  géométrique peu différent d'un appui à l'autre, portée angulaire ≤ 0,3 rad (biais moyen des ouvrages construits ≈ 85 gr) ;
  au-delà : MCP (bords non parallèles), MRB (biais ou courbure prononcés, appui ponctuel), éléments finis de plaque épaisse
  (Mindlin) pour les zones d'about et de bords libres (largeur ≈ 2 h) où la torsion et le cisaillement dominent.
* **Points de vigilance (ch. 5)** : insuffisance d'aciers passifs à l'origine de la plupart des désordres ; fissures
  transversales près des appuis (pointes de flexion, gradient thermique, retrait différentiel nervure/encorbellements),
  fissures longitudinales des dalles de plus de 15 m, abouts BP (diffusion de la précontrainte), appareils d'appui en
  élastomère pour les tabliers biais ou courbes, piles résistant aux chocs, joints et dalles de transition.

* **Appareils d'appui en élastomère fretté (§ 3.6, règles du bulletin technique n° 4 du SETRA)** : σ = P/(ab) ≤ 15 MPa
  et ≤ G·ab/(t(a + b)) (G = 0,8 MPa) ; σ_min < 2 MPa → anti-cheminement ; H > f·P avec f = 0,10 + 0,6/σ → blocage ;
  u_g/T ≤ 0,5 ; u_g/T + H/(G₂ab) ≤ 0,7 (G₂ = 1,6 MPa) ; T ≤ min(a, b)/5 ; t·T ≥ α·a²/3 (rotation α). L'outil prend les
  réactions ELS caractéristiques réparties sur n appareils par ligne (≈ un tous les 3 m), u_g = (ε_retrait+fluage +
  α_T·ΔT)·(distance au point fixe), H = freinage EN 1991-2 § 4.4.1 réparti sur tous les appareils, α = 3 mrad de pose +
  rotation d'appui par la poutre conjuguée θ = (1/EIL)∫M(L − x)dx sur l'enveloppe ELS, et retient le plus petit appareil
  de la gamme standard entièrement enrobée du guide (§ 3.6.3, NF T 47.815 : 100×150 à 700×700, feuillets 8/10/12/15 mm).
  Exemple CHAMOA (4 appareils par ligne) : culées 200×300×4(8+2), piles 300×400 et 300×500×3(10+3).

**Recherche de l'épaisseur minimale** (pratique CHAMOA § 4.1) : h est augmenté de 2 cm en 2 cm, la chaîne complète du
§ 1 au § 7 étant relancée à chaque pas, jusqu'à ce que : aucune face ne demande d'aciers comprimés (x/d ≤ 0,45 à l'ELU,
σc ≤ 0,6 fck à l'ELS caractéristique), le taux d'armatures par face reste sous la valeur admise (1 % par défaut),
V_Ed ≤ V_Rd,max et le poinçonnement sous roue est vérifié. V_Ed > V_Rd,c (étriers nécessaires) est signalé sans
bloquer : les dalles PSI.DA comportent normalement des cadres et étriers (§ 3.4.2).

## 1. Modèle longitudinal : la poutre équivalente

Le tablier est une poutre continue de largeur 2b, de rigidité EI constante, sur appuis simples. Pour une charge
unité placée en x_p, les moments d'extrémité de chaque travée s'obtiennent par la méthode des rotations
(équivalente aux équations des trois moments) : avec θ_i les rotations des nœuds d'appui, k_j = EI/L_j,

    M_ij = k_j (4 θ_i + 2 θ_j) + M_ij^F,   M_ji = k_j (2 θ_i + 4 θ_j) + M_ji^F,   Σ M = 0 en chaque nœud,

les termes d'encastrement parfait d'une charge P à l'abscisse a d'une travée de portée L valant
M^F = −P a b²/L² à gauche et +P a² b/L² à droite (b = L − a, moments horaires positifs). Le moment en travée
est ensuite M(x) = M_0 + (M_L − M_0) x/L + moment isostatique. En répétant l'opération pour 100 positions
par travée on obtient les **lignes d'influence** de M, V et des réactions, puis les enveloppes :

* charge répartie q : intégrale de la ligne d'influence sur ses parties positives (max) ou négatives (min) —
  EN 1991-2 §4.3.2 autorise de ne charger que les zones défavorables ;
* A(l) du Fascicule 61 : intensité fonction de la longueur chargée, donc énumération des zones de même signe de la ligne
  d'influence (travées, parties de travées entre zéros, abouts), l = somme des longueurs chargées ;
* Mc120 : convoi d'engins à espacement libre (distance libre ≥ 30,50 m), même programmation dynamique que Bc ;
* chaque enveloppe est ventilée par travée porteuse, ce qui permet d'appliquer à chaque charge le K et le δ de sa travée (Fasc. 61) ;
* convois (TS, Bt, Mc120, D240) : glissement pas à pas dans les deux sens ;
* Bc : deux camions par file à espacement libre (pas ≥ 10,50 m entre essieux avant, Fasc. 61 art. 5.2) — programmation
  dynamique sur la grille de positions (`trainEnvelope`), chaque camion pouvant aussi sortir de l'ouvrage.

Les abouts (consoles au-delà des culées) portent les charges permanentes (M = −g a²/2 imposé aux nœuds extrêmes) et
le trafic : une charge unité à la distance t de l'appui extrême équivaut à un moment −t au nœud extrême plus la charge
posée sur l'appui. Vérification : 2 travées égales sous q → M_appui = −qL²/8, M_travée,max = 9/128 qL² ;
3 travées → −qL²/10.

## 2. Travée équivalente et paramètre θ

Pour la répartition transversale on remplace chaque travée par une travée isostatique de portée L_eq, distance
entre les points de moment nul **lorsque cette seule travée** porte une charge uniforme (« méthode des moments »
de CHAMOA). Avec M_0, M_L les moments d'appui de la travée seule chargée par q = 1 :

    M(x) = M_0 + (M_L − M_0) x/L + x(L − x)/2 = 0  →  racines x_1, x_2,   L_eq = x_2 − x_1.

Exemples : 3 travées égales → L_eq = 13L/15 en rive, L√0,6 au centre ; 10-15-15-10 m → 8,912 et 11,187 m.
Le paramètre de Guyon-Massonnet est θ = b/L_eq (dalle isotrope). Sur appui on prend la moyenne des deux travées.

## 3. Répartition transversale : Guyon-Massonnet recalculé

Une charge-ligne sinusoïdale p·sin(πx/L) placée à l'ordonnée e sur la dalle isotrope de rigidité D donne une
flèche w = Y(y)·sin(πx/L) avec k = π/L :

    D (Y'''' − 2 k² Y'' + k⁴ Y) = p δ(y − e),   bords libres : M_y = 0 et V_y = 0 en y = ±b
    soit Y'' − ν k² Y = 0 et Y''' − (2 − ν) k² Y' = 0.

Pour ν = 0 l'intégration de l'équation sur la largeur donne ∫Y dy = p/(D k⁴) : la flèche moyenne est celle de
la poutre, d'où le **coefficient de répartition** K(y) = Y(y)/Y_moy = 2b k⁴ Y(y), de moyenne 1, et

    m_x(y) = K(e, y) · M_poutre / (2b)     (moment par mètre de largeur).

Les tables de Massonnet-Bareš donnent K pour ν = 0 ; l'outil résout l'équation exactement (base de fonctions
exponentielles centrées sur les bords, charge en bord traitée comme condition aux limites) et admet ν ≠ 0 et
un paramètre de torsion α < 1. Pour une bande de charge (voie), K̄ est la moyenne de K(e, y) sur la bande.
Valeurs de contrôle (ν = 0) : θ = 0,5 → K(0, 0) = 1,115, K(b, b) = 2,136 ; θ = 1 → 1,632 et 4,189.

**Calage CHAMOA** : avec ν = 0,2 le facteur de bord d'une voie LM1 reproduit le KTRANS de la note (1,2996 contre
1,30464 sur appui) ; avec ν = 0 il est 7 % trop bas. Chaque fibre y reçoit l'arrangement de voies le plus
défavorable (voies glissées sur la chaussée et renumérotées), et les files sont positionnées indépendamment en long :

    m_x,max(y) = Σ_files K̄_i(y) · M_i,max / 2b,   f(y) = m_x(y) / (M/2b),   K_section = max_y f(y).

CHAMOA applique K_section au calcul ST1 et dimensionne toute la largeur avec m_x = K_section·M/2b ; l'outil
donne en plus le profil m_x(y).

## 4. Charges

* **EN 1991-2** : voies conventionnelles de 3 m (tableau 4.1) ; LM1 = tandem TS (2 essieux de α_Q Q_k à 1,2 m,
  roues à ±1 m) + UDL α_q q_k (9 kN/m² voie 1, 2,5 ailleurs) ; LM2 essieu de 400 β_Q kN ; trottoirs 3 kN/m² avec
  LM1 (gr1a), 5 kN/m² seuls (gr3). Coefficients α : 1 (valeurs recommandées) ou annexe française (classe 2 :
  α_Q = 0,9/0,8/0,8, α_q1 = 0,7).
* **Fascicule 61 titre II** : classe du pont par la largeur roulable ; A(l) = 2,3 + 360/(l + 12) kN/m² ×a_1·a_2 ;
  Bc (camions de 300 kN, bc), Bt (tandems de 320 kN, bt), Br ; Mc120 (1100 kN sur deux chenilles de 6,10 × 1,00 m),
  D240 (2400 kN sur 18,6 × 3,2 m) ; δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4G/S), un seul δ pour le système B avec S = poids
  maximal des essieux de Bc ou de Bt plaçables sur la travée. Transversalement : files Bc dans des bandes de 2,50 m,
  tandems Bt dans l'axe de bandes de 3,00 m (art. 5.3), A(l) sur les voies fixes (a_1 selon le nombre de voies chargées).
* **Permanent** : poids propre (K = 1), superstructures linéiques et surfaciques avec K(e, y), coefficients
  k_min/k_max (0,8/1,4 enrobé, 0,8/1,2 chape et corniches dans l'exemple CHAMOA).

## 5. Gradient thermique et tassements

Gradient linéaire ΔT sur la hauteur h (EN 1991-1-5 : +12 / −6 °C pour une dalle, k_sur = 1) : courbure libre
κ = α_T ΔT/h ; sur la poutre continue, les moments d'encastrement parfait valent EIκ et les moments
hyperstatiques s'obtiennent comme au §1 (2 travées égales : M_appui = 1,5 EIκ ; exemple CHAMOA : 2819 kN·m
à P1 pour EI = 1,468·10⁷ kN·m²). Tassement aléatoire : δ sur un appui et −δ sur l'appui voisin, module différé
E/(1 + φ) (φ = 2), enveloppe des paires (exemple : 1871 kN·m pour 1 cm).

## 6. Combinaisons (EN 1990 A2, pratique CHAMOA)

    ELU            : 1,35 G + 1,35 Q                      (T et Ta : ζ = 0)
    ELS caract.    : G + Ta + max(T + ψ₀Q ; 0,6 T + Q_LM1 ; Q_LM2)      ψ₀ : TS 0,75, UDL 0,40, trottoirs 0,40
    ELS fréquent   : G + max(0,6 T ; 0,5 T + ψ₁Q_LM1 ; 0,75 Q_LM2)
    ELS quasi-perm.: G + Ta + 0,5 T
    BAEL/F61 ELU   : 1,35 G + 1,6 (A ou B) + 1,6 Tr  |  1,35 G + 1,35 (Mc ou D)
    BAEL/F61 ELS   : G + Ta + 0,6 T + 1,2 (A ou B) + Tr  |  G + Ta + 0,6 T + (Mc ou D)

Vérification : ELS caractéristique CHAMOA à P1 = 4490 + 1871 + 0,6·1410 + 1,305·2157 = 10 010 ≈ 10 042 kN·m.

## 7. Sections par mètre de largeur (d = h − c)

* **ELU (EC2)** : μ = M/(b d² η f_cd), ξ = 1 − √(1 − 2μ), z = d(1 − ξ/2), A_s = M/(z f_yd), x/d = ξ/λ ≤ 0,45 ;
  au-delà, aciers comprimés. **BAEL** : μ = M/(b d² f_bu), α = 1,25(1 − √(1 − 2μ)), z = d(1 − 0,4α), μ ≤ 0,372.
* **ELS** : section fissurée, x tel que b x²/2 = α_e A_s (d − x) (α_e = 15), I = b x³/3 + α_e A_s (d − x)²,
  σ_c = M x/I ≤ 0,6 f_ck, σ_s = α_e M (d − x)/I ≤ min(0,8 f_yk ; 300 MPa) — 300 MPa étant la vérification de fatigue
  simplifiée de CHAMOA. BAEL : σ̄_s = min(2/3 f_e ; max(0,5 f_e ; 110√(η f_tj))) en fissuration préjudiciable.
* **Ouverture de fissure** (EC2 7.3.4, ELS fréquent) : w_k = s_r,max (ε_sm − ε_cm), s_r,max = k₃c + 0,17 φ/ρ_p,eff si
  l'espacement ≤ 5(c + φ/2), sinon 1,3(h − x) ; k₃ = 3,4 (25/c)^(2/3) (annexe française).
* **Minimums** : 0,26 f_ctm/f_yk · b_t d (× 1,2 pour les dalles, CHAMOA) si la fibre est tendue à l'ELS
  caractéristique ; k_c k f_ct,eff A_ct/f_yk (7.3.2) si elle l'est à l'ELS quasi-permanent ; 3 cm²/m par face.
  BAEL : 0,23 b d f_t28/f_e et 0,06 % b h.
* **Tranchant** : V_Rd,c = max(0,12 k (100 ρ f_ck)^(1/3) ; v_min) b d, sinon étriers A_sw/s = V_Ed/(0,9 d f_ywd).
  BAEL dalles : τ_u ≤ 0,07 f_c28/γ_b. **Poinçonnement** : roue diffusée à 45° jusqu'au feuillet moyen,
  v_Ed = V_Ed/(u₁ d) ≤ v_Rd,c (u₁ à 2d) ; BAEL : Q_u ≤ 0,045 u_c h f_c28/γ_b.
* Chanfreins : largeur de la zone comprimée variable par l'intrados (moments sur appuis).

Vérification : mi-travée 2 de l'exemple, M_ELS,car = 8,62 MN·m sur 12 m, d = 0,742 m → σ_s = 300 MPa →
431 cm² (note : 431,7). Sur appui, les aciers de la note sont gouvernés par la phase de chantier (profil provisoire).

## 8. Flexion transversale

Dalle isostatique équivalente de portée L_eq, bords libres, ν = 0,2 ; chaque charge rectangulaire q sur
[x₁, x₂] × [e₁, e₂] est développée en série de Fourier, p_n = (2q/nπ)[cos(nπx₁/L) − cos(nπx₂/L)], et
m_y(x, y) = Σ_n sin(nπx/L) ∫ p_n (−D)(Y_n'' − ν k_n² Y_n) de ; les roues sont diffusées à 45° jusqu'au feuillet
moyen (contact + 2 t_rev + h) et centrées sur x = L_eq/2. Aciers transversaux par les mêmes règles de section
(d = h − c − φ_long), avec A_s,trans ≥ 0,2 A_s,long par face et A_s,trans,sup ≥ 0,5 A_s,trans,inf (CHAMOA) ;
BAEL : ≥ A_s,long/3.

## 8 bis. Biais : moments dans les directions d'aciers (annexe 12A du BPEL, pratique CHAMOA)

CHAMOA calcule la flexion longitudinale suivant les portées biaises sans correction, puis dimensionne les aciers
transversaux avec le moment « après fissuration » de l'annexe 12A du BPEL (dossier CED 66). L'outil reproduit
exactement ce calcul (`annexe12A`, 11 valeurs de la note à 10⁻⁴) : le moment longitudinal MX (ST1, par mètre) et le
moment transversal MY (Guyon) sont pris comme moments principaux, la direction de MX étant tournée de
δ = 100 − φ_mec grades de l'axe vers la normale aux lignes d'appui ; le tenseur est décomposé sur les deux familles
d'aciers (longitudinaux suivant x, transversaux à l'angle ψ) et sur leur bissectrice, où le béton ne travaille qu'en
compression (Mb ≤ 0 en nappe inférieure) :

    M = M₁ n₁⊗n₁ + M₂ n₂⊗n₂ + Mb c⊗c
    M_APF = M₂ = M_yy / (1 − cos ψ) + M_xy / sin ψ,   M_yy = MX sin²δ + MY cos²δ,   M_xy = (MX − MY) sin δ cos δ

Exemple (travée 1, φ = 82,53 gr, ψ = 80 gr) : MX = 435,08 et MY = 114,89 kN·m/m → M_APF = 288,10 (note : 288,10), soit
0,38 MX + 1,07 MY ; en travée 2 (φ = 86,51 gr) : 0,28 MX + 1,17 MY. Pour les moments transversaux négatifs la note prend
MX = 0. Les aciers longitudinaux ne sont pas corrigés (M₁ n'est pas utilisé). Pour une dalle droite ψ = 100 gr,
M_APF = MY. Les aciers transversaux de la note (14,1 / 17,3 cm²/m) s'obtiennent ensuite avec σs ≤ 300 MPa sous
M_APF caractéristique (288 / 351 kN·m/m, ce dernier venant du profil provisoire de chantier).

L'outil applique ce calcul dès que ψ < 100 gr (`designTransverseEC/BAEL`) : MX = moment longitudinal maximal de la travée
(par mètre, toutes fibres), MY = moment transversal maximal de la travée, pour chaque combinaison ; aciers transversaux
parallèles aux lignes d'appui (ψ₂ = ψ, défaut CHAMOA) ou perpendiculaires aux bords libres (ψ₂ = 100 gr, M_APF plus faible
sur l'exemple : 268 contre 359 kN·m/m). Sur l'exemple CHAMOA l'outil obtient M_APF = 359 / 417 kN·m/m (note : 288 / 351),
l'écart venant des entrées MX (528 contre 435 : enveloppe du maximum de travée avec Ta + 0,6 T) et MY (149 contre 115 :
charges locales à 15 harmoniques) ; aciers 18,6 / 21,8 cm²/m contre 14,1 / 17,3. Les quantités sont données par mètre
perpendiculaire aux aciers (× sin ψ par mètre d'axe, remarque [11] de la note).

## 8 ter. Phase de chantier, convois LM3, encorbellements, fatigue, zonage

* **Profil provisoire (phase de chantier)** : charges permanentes provisoires (remblai h·γ sur une largeur, enrobé) et
  engins de chantier définis par leurs essieux (P@x), largeur, entraxe des roues et coefficient dynamique (1,5 pour un
  engin « rapide », pratique CHAMOA), circulant seuls sur la chaussée de chantier moins les bandes neutralisées — les
  roues extrêmes restant dans la largeur chargeable (sur l'exemple, le véhicule spécial 2 × 100 kN donne 435 kN·m à P1
  contre 451 dans la note) ; ELU 1,35 G + 1,35 Q, ELS car. G + Ta + 0,6 T + Q ; les aciers du profil provisoire sont
  comparés à ceux du profil définitif, l'enveloppe des deux est retenue (c'est ce qui gouverne les aciers d'appui de la
  note CHAMOA, avec des tombereaux non reproduits ici).
* **Convois exceptionnels LM3** (EN 1991-2 § 4.3.4 et annexe A, annexe nationale) : véhicules spéciaux 600/150 … 3600/200
  (lignes d'essieux à 1,50 m, largeur 3,00 ou 4,50 m) ou personnalisés, charges × 1,1 (incertitude), coefficient dynamique
  1 + 0,7/(1 + 0,2 L_min) à vitesse normale (1 au pas), convoi seul avec bandes de 1 m neutralisées ; même chaîne que les
  engins de chantier.
* **Encorbellement** : console de portée Lc et d'épaisseur variable ; m = γ(h_r L²/2 + (h_t − h_r) L²/3) + Σ g·e + Σ q(x₂² − x₁²)/2
  + trottoir (5 ou 3 kN/m²) + roues : tandem TS diffusé à 45° (b_eff = 0,40 + 2 t_rev + h_m + 1,20 + 2x), LM2
  (b_eff = 0,60 + 2 t_rev + h_m + 2x), UDL ; ELU/ELS car./fréq. ; aciers supérieurs d'encastrement EC2.
* **Fatigue (EN 1992-2 annexe NN)** : FLM3 (4 × 120 kN, 1,2 – 6,0 – 1,2 m, roues à 2 m) sur la voie lente, essieux × 1,75
  sur appuis et × 1,40 en travée ; Δσ_s,Ec en section fissurée avec les aciers calculés ; λ_s = φ_fat λ_s,1 λ_s,2 λ_s,3 λ_s,4,
  λ_s,2 = Q̄ (N_obs/2·10⁶)^(1/9), λ_s,3 = (N_années/100)^(1/9), λ_s,4 = (Σ N_obs,i/N_obs,1)^(1/9) ; γ_F,fat Δσ_s,equ ≤ 162,5/1,15.
* **Zonage (guide § 3.4.4 – 3.4.8)** : chevêtre sur pile-culée = about + a/(3 sin ψ), extension = 2a/(3 sin ψ) ; appui
  intermédiaire ± a/(3 sin ψ) et extensions 2a/(3 sin ψ) (a = entraxe des appareils d'appui) ; chaînage des bords libres sur
  une largeur h, ≥ 0,9 ‰ par face et par direction, cadres ≥ 5 cm²/m ; angles ≥ 1,2 ‰ (orthogonal) ou 0,6/sin²(α/2) ‰
  (2,4 ‰ à 60°, 4,1 ‰ à 45°) ; encorbellements : aciers doublés dans les angles sur 1,5 Lc ; abouts : bielle et coin inférieur.

## 8 quater. Plan de ferraillage

Les aciers requis par mètre (enveloppe sur la largeur, profils définitif, chantier et LM3) sont décalés de a_l = d
(EC2 9.3.1.1(4)). Pour chaque travée, les aciers inférieurs sont répartis en **filantes** (au moins 50 % des aciers de
travée et les besoins près des appuis, prolongées jusqu'aux appuis avec recouvrement l₀ sur les appuis intermédiaires et
retours au-delà des appuis d'extrémité) et **renforts** intercalés, arrêtés à l_bd au-delà du point où l'épure décalée
redescend sous la capacité des filantes. En nappe supérieure : filantes sur toute la longueur (besoin des zones de
travée, à plus de 0,35 L des appuis intermédiaires), renforts sur appuis selon la même règle. Le couple (φ, e) est choisi
pour minimiser la masse (pondérée par les longueurs, HA32 pénalisés) avec e ≤ min(3h ; 40 cm) et e/2 ≤ min(2h ; 25 cm)
aux moments maximaux. l_b,rqd = (φ/4) f_yd/f_bd, f_bd = 2,25 η₁ f_ctd (η₁ = 0,7 en nappe supérieure), l₀ = 1,5 l_bd ; barres de
12 m au plus. Aciers transversaux par travée (option 1 : longueur (2b − 2c)/sin ψ + retours), cadres de chaînage des bords
libres (≥ 5 cm²/m), épingles dans les zones V_Ed > V_Rd,c (maille ≤ 0,75 d). Sur l'exemple CHAMOA : HA25 e = 25 + renforts
en travée, HA20 e = 15 + HA25 e = 15 sur appuis, ≈ 52 t soit ≈ 115 kg/m³.

## 8 quinquies. Appuis et fondations

Chaîne (`src/supports/index.js`) : réactions du tablier par ligne (permanent, A(l), Bc, Bt, Mc120, trottoirs ; gr1a, gr2) →
rigidités (néoprène retenu + fût) → freinage (F61 : A·S/(20 + 0,0035 S) et 300 kN ; EC : Q_lk) et déformations imposées réparties →
combinaisons en tête → descente en pied (poids du chevêtre, du fût, poussée des terres pour les culées) → fûts (flambement,
second ordre, flexion composée, minimums), chevêtres sur colonnes (poutre continue), garde-grève et murs en retour →
semelles (portance, excentrement, glissement, bielles, sens transversal) ou pieux (efforts, Ménard, ferraillage, portance,
tirant de semelle). Résultats dans la carte « Appuis et fondations », le rapport et le chapitre 14 de la note de calcul.

## 9. Ce que l'outil ne fait pas (encore)

Tassements probables, précontrainte (PSI.DP), souplesse des fondations dans la répartition des efforts horizontaux, flexion déviée des fûts, chocs, vent et séisme sur les appuis, stabilité d'ensemble des culées (renversement), appareils d'appui glissants ou à pot (§ 3.6.2, § 3.7), dalles à
encorbellements massifs participant à la flexion longitudinale ; les tombereaux de la circulaire « delta 70 » ne sont pas
prédéfinis ; λ_s,1 (figure NN.1) est saisi ; la composition des lignes d'essieux de l'annexe A est à relire.
