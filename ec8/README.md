# Pont EC8

Calcul parasismique des ponts courants selon l'Eurocode 8 (NF EN 1998-1, -2, -5 et leurs annexes nationales) et l'arrêté du 26 octobre 2011. Chaque résultat est détaillé : formule, valeurs substituées et référence au paragraphe près.

Outil d'aide au calcul et d'enseignement : l'ingénieur reste responsable de ses justifications.

## Démarrer

```bash
npm install
npm run dev        # application sur http://localhost:5173
npm test           # tests du référentiel et du moteur
npm run typecheck
```

Node 24 ou plus récent (les tests s'exécutent directement en TypeScript).

## Déployer sur Cloudflare

Le fichier `.node-version` impose Node 24 au build Cloudflare (sans lui, l'image par défaut
fournit un Node trop ancien pour Vite 8 et le build échoue). `wrangler.jsonc` publie `dist/`
comme site statique (Workers Static Assets).

- **Depuis le dépôt Git** (Workers Builds) : commande de build `npm run build`, commande de
  déploiement `npx wrangler deploy`.
- **Depuis un poste** : `npm run build && npx wrangler deploy`.
- **Cloudflare Pages** (ancien parcours) : commande de build `npm run build`, dossier de sortie
  `dist` ; la version de Node est lue dans `.node-version`.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/referentiel/` | Sources, valeurs nationales, règles et formules, avec leurs références |
| `src/projet/` | Modèle de données du pont, exemple du guide, géométrie déduite, contrôles de saisie, import/export |
| `src/moteur/` | Calculs (action sismique…), note de calcul structurée, validation sur l'exemple du guide |
| `src/ui/` | Interface React en onglets : saisie et vue 3D (`projet/`), action sismique (`action/`), note de calcul (`note/`), référentiel (`referentiel/`) |
| `tests/` | Tests du référentiel et du modèle de pont, puis cas de validation du guide Cerema |
| `donnees/extraction-guide/` | Relevés du guide Cerema (matériau de travail) |

## Périmètre de la saisie (V1)

Pont droit à tablier continu sur culées perchées (poteaux, sommier, garde-grève) et piles à fûts
rectangulaires ou circulaires sur semelles, appareils d'appui en élastomère fretté, fixes ou glissants.
Fondations supposées infiniment rigides, comme dans l'exemple du guide. Biais, courbure, culées à mur
de front et fondations sur pieux viendront ensuite.

## Méthodes d'analyse

L'onglet **Méthodes** aide à choisir la méthode (logigramme et tableau des méthodes de l'EN 1998-2, recommandation pour le
projet) et réalise l'**analyse spectrale multimodale** (EN 1998-2 4.2.1) : modèle discret par direction (tablier en poutre,
fûts en consoles à masse répartie, appareils et culées en ressorts, liaisons rigides en ressorts de période 2 ms), modes propres
par Cholesky et Jacobi, modes retenus jusqu'à 90 % de la masse (4.2.1.2), combinaison SRSS ou CQC (4.2.1.3), comparaison au
mode fondamental et animation des déformées. Inerties du tablier : champs facultatifs `inertieVerticale` et
`inertieTransversale` (défauts A·e²/12 et A·B²/12). `options.methodeEfforts` choisit la méthode des efforts exportés.

Le **calcul temporel linéaire** (EN 1998-2 4.2.3) génère des accélérogrammes artificiels compatibles avec le spectre
(EN 1998-1 3.2.3.1.2), superpose les modes de la multimodale (intégration exacte de Nigam et Jennings) et retient la moyenne
des extrêmes ; un sous-onglet anime le pont sous l'accélérogramme.

## Référentiel

Chaque entrée porte :

- une ou plusieurs **références** (document, localisation, page) ; la première est celle qui fait foi ;
- un **statut** :
  - `verifie` : lu sur la source primaire (annexe nationale, texte officiel) ;
  - `via_guide` : reproduit ou cité par le guide Cerema 2015, source primaire non consultée ;
  - `a_verifier` : à confirmer avant usage.

Le référentiel ne reproduit aucun texte des normes : seulement des valeurs, des formules, des numéros de clause et des paraphrases.
