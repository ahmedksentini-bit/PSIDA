Manuel d'utilisation de PSIDA (PDF allégé : images recompressées en JPEG, 1100 px). Ouvert par le bouton « Manuel »
de l'en-tête (web/app.js, constante MANUEL). À remplacer à chaque nouvelle édition du manuel, sous le même nom.

Le PDF réunit le manuel de la version 0.99 (chapitres 1 à 30, annexes A à F) et un complément (chapitres 31 à 34,
annexe G) dont la source est dans complement/ :

- `kit.mjs` (mise en forme, formules KaTeX, tableaux de comparaison « à la main / PSIDA »), `outils.mjs` ;
- `ch31.mjs` à `ch34.mjs` : un module par chapitre ; les valeurs de PSIDA y sont calculées à la construction et les
  calculs à la main recodés indépendamment ;
- `img/` : captures d'écran produites par `tools/manuel/captures.py`.

Construction (node, python3 avec playwright et pypdf, KaTeX dans KATEX_DIR) :

    python3 tools/manuel/captures.py      # captures d'écran (si l'interface a changé)
    python3 tools/manuel/pdf.py           # complément → PDF, fusion avec le manuel, signets

`tools/manuel/build.mjs` s'arrête si un écart « à la main / PSIDA » sort de sa tolérance : le manuel ne peut pas citer un
chiffre que PSIDA ne donne plus. `pdf.py` retire un complément déjà fusionné avant d'ajouter le nouveau.
