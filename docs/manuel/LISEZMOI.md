Manuel d'utilisation de PSIDA : un polycopié unique (PDF allégé : images recompressées en JPEG, 1100 px). Ouvert par le
bouton « Manuel » de l'en-tête (web/app.js, constante MANUEL). À remplacer à chaque nouvelle édition, sous le même nom.

Source : le document Claude Docs « PSIDA — Manuel d'utilisation » (avant-propos, chapitres 1 à 34, annexes A à H ;
l'annexe H tient l'historique des versions). C'est la seule source du texte : on le corrige là, puis on réexporte.

Publication d'une édition :

    # 1. exporter le document Docs en PDF (A4), par exemple vers /tmp/manuel_docs.pdf
    python3 tools/manuel/pdf.py /tmp/manuel_docs.pdf    # signets, images allégées, métadonnées → PSIDA_Manuel.pdf
    npm run manuel:check                                # valeurs citées par les chapitres 31 à 34

Contrôle des valeurs : `complement/` ne sert plus à fabriquer un PDF. Les modules `ch31.mjs` à `ch34.mjs` recodent,
indépendamment de PSIDA, les calculs à la main de ces chapitres et les comparent à ce que PSIDA donne aujourd'hui
(`kit.mjs`, `k.cmp`) ; `tools/manuel/build.mjs` (`npm run manuel:check`) échoue si un écart sort de sa tolérance
(83 comparaisons, reprises dans l'annexe G). Un échec signifie que le manuel cite un chiffre que PSIDA ne donne plus :
corriger le document Docs (ou PSIDA), puis le module du chapitre. Avec un dossier en argument, le script écrit
`controles.json` et, si `KATEX_DIR` désigne une installation de KaTeX, `chapitres.html` pour relire les calculs.

`img/` : captures d'écran des chapitres 31 à 34 (`tools/manuel/captures.py`), reprises comme figures dans le document Docs.
