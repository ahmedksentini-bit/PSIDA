#!/usr/bin/env python3
"""
Rendu local du manuel (secours quand l'export PDF de Claude Docs est indisponible).

Entrées : l'export Markdown et l'export HTML du document Docs (même révision), et un dossier d'images
nommées <blob>.<ext> (identifiant du blob Docs, sans le préfixe « blob/ »). L'export Markdown remplace
chaque image par « [image: texte alternatif] » ; l'export HTML donne, dans le même ordre, le blob de
chaque image. Le script substitue les images, convertit les blocs ```latex en formules $$…$$ et les
indices X\\_ab en X~ab~, puis écrit doc_pd.md (Markdown pandoc avec page de titre).

    python3 build.py export.md export.html dossier_images sortie/ "Novembre 2026 — PSIDA version 0.99.40"

Puis : pandoc (voir make.sh) et node pdf.cjs.
"""
import html
import os
import re
import sys

from PIL import Image


def main(md_path, html_path, img_dir, out_dir, date_line):
    md = open(md_path, encoding='utf-8').read()
    h = open(html_path, encoding='utf-8').read()
    blobs = re.findall(r'<img src="blob/([^"]+)"', h)
    files = {os.path.splitext(f)[0]: os.path.join(os.path.abspath(img_dir), f) for f in os.listdir(img_dir)}
    it = iter(blobs)
    manquantes = []

    def img(mo):
        b = next(it, None)
        p = files.get(b)
        if p is None:
            manquantes.append(b)
            return ''
        w, hh = Image.open(p).size
        wc = min(16.0, w / 1.5 * 0.02646)  # 1,5 px d'écran par pixel CSS, plafonné à la largeur utile
        hc = wc * hh / w
        if hc > 22:
            wc = 22 * w / hh
        return f'![]({p}){{width={wc:.2f}cm}}'

    md = re.sub(r'^&#91;image: (.*)\\\][ \t]*$', img, md, flags=re.M)
    md = re.sub(r'```latex\n(.*?)\n```', lambda mo: '$$\n' + mo.group(1).strip() + '\n$$', md, flags=re.S)
    # noms de fichiers : soulignés protégés avant la conversion des indices
    md = re.sub(r'[\w/.\-]*\\_[\w\\./\-]*\.(?:dxf|mjs|js|json|pdf|md)\b', lambda mo: mo.group(0).replace('\\_', '\x00'), md)
    md = re.sub(r'\\_([A-Za-z0-9α-ωΑ-Ωθ;′]+(?:,[A-Za-zα-ω][A-Za-z0-9]*)?)', r'~\1~', md)
    md = md.replace('\x00', '\\_')
    # ligne de date et d'auteur du document Docs (remplacée par la page de titre)
    md = re.sub(r'^[A-Z][a-z]{2} \d{1,2}, \d{4} · @\S+\s*$', '', md, count=1, flags=re.M)
    title = md.split('\n', 1)[0].lstrip('# ').strip()
    md = '\n'.join(md.split('\n')[1:])
    head = ('---\ntitle: "' + title + '"\n'
            'subtitle: "Polycopié de cours — exemple suivi pas à pas : passage supérieur en dalle armée, 14 + 18 + 14 m"\n'
            'author:\n  - |\n    Ahmed Ksentini\\\n    Ingénieur, docteur en génie civil\n'
            'date: "' + date_line + '"\nlang: fr-FR\n---\n')
    os.makedirs(out_dir, exist_ok=True)
    open(os.path.join(out_dir, 'doc_pd.md'), 'w', encoding='utf-8').write(head + md)
    print(f'images : {len(blobs)} dans l\'export HTML, {len(manquantes)} sans fichier {manquantes[:5]} ; '
          f'blocs latex restants : {md.count("```latex")} ; images non substituées : {md.count("&#91;image")}')
    return 1 if manquantes else 0


if __name__ == '__main__':
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    sys.exit(main(*sys.argv[1:]))
