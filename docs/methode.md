# Calcul manuel d'un pont-dalle en béton armé — la méthode mise en œuvre dans PSIDA

Ce document décrit, étape par étape et avec les formules, la chaîne de calcul que l'outil exécute. Chaque étape
peut être refaite à la main ou au tableur ; l'outil ne fait qu'automatiser l'énumération des positions de charge.
Les notations suivent la note CHAMOA-PSIDA du Cerema, sur laquelle la chaîne a été calée (voir `hypotheses.md`).

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
* A(l) du Fascicule 61 : intensité fonction de la longueur chargée, donc énumération des travées chargées ;
* convois (TS, Bc, Bt, Mc120, D240) : glissement pas à pas dans les deux sens.

Les abouts (consoles au-delà des culées) n'entrent que par les charges permanentes : M = −g a²/2 imposé
aux nœuds extrêmes. Vérification : 2 travées égales sous q → M_appui = −qL²/8, M_travée,max = 9/128 qL² ;
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
  D240 (2400 kN sur 18,6 × 3,2 m) ; δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4G/S).
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

## 9. Ce que l'outil ne fait pas (encore)

Biais (correction du guide SETRA 1989 et moments dans les directions d'aciers, annexe 12 du BPEL), phase de
chantier (profil provisoire), convois LM3 de l'Eurocode, tassements probables, encorbellements, fatigue par la
méthode λ_s de l'EN 1992-2 annexe NN.
