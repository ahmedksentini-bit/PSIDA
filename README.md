# PSIDA — calcul manuel assisté des ponts-dalles

Outil ouvert pour **recalculer « à la main » (de façon reproductible) un pont-dalle** en béton armé
du type PSI-DA, sans se limiter aux notes de calcul automatiques (PSIDA.EL du SETRA, CHAMOA-P du
Cerema), et pour **comparer ses résultats à ces notes**.

Deux référentiels de charges sont traités en parallèle :

- **Eurocodes** — EN 1991-2 (LM1 TS + UDL, LM2, trottoirs, groupes gr1a / gr1b / gr3), coefficients α
  recommandés (pays sans annexe nationale) ou annexe française (classes 1 et 2) ;
- **Fascicule 61 titre II** — A(l), Bc, Bt, Mc120, D240, trottoirs, majoration dynamique δ.

Le moteur est en JavaScript pur (modules ES), **sans dépendance ni étape de build** : il tourne sous
Node pour les tests et dans le navigateur pour l'interface. Le dépôt se déploie tel quel sur
Cloudflare Pages depuis GitHub.

## Contenu

```
index.html          interface (formulaire → tableaux de résultats)
src/linalg.js       Gauss, Gauss-Legendre
src/beam.js         poutre continue : lignes d'influence M, V, R ; enveloppes UDL / travées entières / convois
src/guyon.js        Guyon-Massonnet recalculé (plaque isotrope, ν = 0) : K, μ, m_y multi-harmoniques
src/loads_ec.js     EN 1991-2 : voies conventionnelles, LM1, LM2, LM4, α, ψ
src/loads_f61.js    Fascicule 61 : classes, voies, A(l), Bc, Bt, Br, Mc120, D240, δ
src/analysis.js     orchestration : SlabDeck (permanent, eurocode, fascicule61)
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
[docs/hypotheses.md](docs/hypotheses.md).

## Déploiement (GitHub → Cloudflare Pages)

1. Pousser le dépôt sur GitHub.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → choisir le dépôt.
3. Build command : *(vide)* ; Build output directory : `/` (racine). Aucune étape de build.
4. Chaque `git push` redéploie. Un sous-domaine personnalisé se règle dans l'onglet *Custom domains*.

## État et limites (v0.1)

- Ouvrage droit, dalle pleine de hauteur constante, appuis simples (pas de cantilever, pas d'encastrement).
- Pas encore : sections (ELS/ELU EC2 et BAEL), fatigue, poinçonnement, moments transversaux dans
  l'interface, biais, LM3 / convois spéciaux EC, combinaisons pondérées automatiques.
- Les tableaux `a1`, `bc`, `bt` du Fascicule 61 et les α de l'annexe française sont à relire contre
  les textes avant toute utilisation en production (voir les commentaires `TODO_VERIF`).

## Licence

MIT.
