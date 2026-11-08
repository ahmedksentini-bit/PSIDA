Manuel d'utilisation de PSIDA : un polycopié unique (PDF allégé : images recompressées en JPEG, 1100 px). Ouvert par le
bouton « Manuel » de l'en-tête (web/app.js, constante MANUEL). À remplacer à chaque nouvelle édition, sous le même nom.

Source : le document Claude Docs « PSIDA — Manuel d'utilisation » (avant-propos, chapitres 1 à 34, annexes A à I ;
l'annexe H tient l'historique des versions, l'annexe I la validation). C'est la seule source du texte : on le corrige là, puis on réexporte.

Publication d'une édition :

    # 1. exporter le document Docs en PDF (A4), par exemple vers /tmp/manuel_docs.pdf
    python3 tools/manuel/pdf.py /tmp/manuel_docs.pdf    # signets, images allégées, métadonnées → PSIDA_Manuel.pdf
    npm run manuel:check                                # valeurs citées par les chapitres 31 à 34

Taille : Cloudflare Pages refuse tout fichier de plus de 25 MiB ; `pdf.py` échoue au-delà de 24 Mo. Pour alléger :
`--qualite` (JPEG, 60 par défaut), `--px` (largeur maximale des images, 1100 par défaut) et `--px-plan`
(plans et dessins au trait, 1700 par défaut, pour garder les cotes lisibles) ; si `qpdf` est installé, les flux sont recompressés en fin de course.

Rendu local (secours, et méthode des éditions 0.99.42 à 0.99.48) : quand l'export PDF de Docs est refusé (document trop lourd
pour le service d'impression, plus de 200 images), on part des exports Markdown et HTML du même document (même
révision) et des images nommées par leur identifiant de blob :

    # 2. images : pour chaque <img src="blob/…"> de l'export HTML, lire le blob dans Docs (→ identifiant d'asset),
    #    retrouver le fichier d'origine par son sha256 (list_assets de l'artefact) et le copier en <blob>.<ext>
    tools/manuel/rendu/make.sh export.md export.html images/ "Novembre 2026 — PSIDA version 0.99.48" /tmp/brut.pdf
    python3 tools/manuel/pdf.py /tmp/brut.pdf

`rendu/build.py` substitue les images (l'export Markdown les remplace par « [image: …] », dans l'ordre de l'export
HTML), convertit les blocs ```latex en formules et ajoute la page de titre ; pandoc produit le HTML (KaTeX, sommaire) ;
`rendu/pdf.cjs` l'imprime avec Chromium (A4, Carlito, pied de page numéroté, formules trop larges réduites, sommaire
paginé en deux passes). Prérequis : pandoc, Playwright avec Chromium, KaTeX (`KATEX_DIR`), python3 avec Pillow.

Contrôle des valeurs : `complement/` ne sert plus à fabriquer un PDF. Les modules `ch31.mjs` à `ch34.mjs` recodent,
indépendamment de PSIDA, les calculs à la main de ces chapitres et les comparent à ce que PSIDA donne aujourd'hui
(`kit.mjs`, `k.cmp`) ; `tools/manuel/build.mjs` (`npm run manuel:check`) échoue si un écart sort de sa tolérance
(83 comparaisons, reprises dans l'annexe G). Un échec signifie que le manuel cite un chiffre que PSIDA ne donne plus :
corriger le document Docs (ou PSIDA), puis le module du chapitre. Avec un dossier en argument, le script écrit
`controles.json` et, si `KATEX_DIR` désigne une installation de KaTeX, `chapitres.html` pour relire les calculs.

`img/` : captures d'écran des chapitres 31 à 34 (`tools/manuel/captures.py`), reprises comme figures dans le document Docs.
