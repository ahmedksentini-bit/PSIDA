#!/usr/bin/env python3
"""
Complément au manuel : HTML → PDF (Chromium / Playwright), sommaire paginé en deux passages, fusion avec le manuel
docs/manuel/PSIDA_Manuel.pdf et signets (sommaire du manuel et du complément).

    python3 tools/manuel/pdf.py [--sortie docs/manuel/PSIDA_Manuel.pdf] [--complement-seul fichier.pdf]

Le manuel d'origine est relu dans docs/manuel/PSIDA_Manuel.pdf : les pages d'un complément déjà fusionné (à partir de
la page de titre « Complément de la version ») sont retirées avant d'ajouter le nouveau, si bien que le script peut être
relancé. Prérequis : node, python3 avec playwright (Chromium) et pypdf, KaTeX (variable KATEX_DIR).
"""
import argparse, json, os, re, subprocess, sys, tempfile, unicodedata
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parents[2]
MANUEL = RACINE / 'docs/manuel/PSIDA_Manuel.pdf'
MARQUE = 'Complément de la version'


def norm(s):
    s = unicodedata.normalize('NFKC', s)  # ligatures ﬁ, ﬂ…
    s = s.replace('’', "'").replace(' ', ' ').replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def construire(out, pages=None):
    args = ['node', str(RACINE / 'tools/manuel/build.mjs'), str(out)]
    if pages is not None:
        (out / 'pages.json').write_text(json.dumps(pages))
        args.append(str(out / 'pages.json'))
    r = subprocess.run(args, cwd=RACINE)
    if r.returncode:
        sys.exit('construction interrompue : écart hors tolérance ou erreur (voir ci-dessus)')
    return json.loads((out / 'titres.json').read_text())


def imprimer(html, pdf, version):
    pied = ('<div style="width:100%;font-family:Inter,sans-serif;font-size:10px;color:#444;text-align:center;">'
            f'PSIDA — Manuel d\'utilisation · Complément {version} · <span class="pageNumber"></span> / '
            '<span class="totalPages"></span></div>')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(html.as_uri(), wait_until='networkidle')
        pg.pdf(path=str(pdf), format='A4', print_background=True, display_header_footer=True,
               header_template='<div></div>', footer_template=pied, prefer_css_page_size=True,
               margin={'top': '22mm', 'bottom': '20mm', 'left': '20mm', 'right': '20mm'})
        b.close()


def libelle(t):
    if t['niv'] == 1:
        return (f"{t['num']}. " if t['num'][0].isdigit() else f"Annexe {t['num']}. ") + t['titre']
    return f"{t['num']} {t['titre']}"


def chercher_pages(pdf, titres):
    textes = [norm(p.extract_text() or '') for p in PdfReader(str(pdf)).pages]
    # début du corps : première page qui porte le titre du premier chapitre sans être une page de sommaire
    debut = next(i for i, t in enumerate(textes) if norm(libelle(titres[0]))[:40] in t and 'Sommaire du complément' not in t
                 and 'Chapitre ' + titres[0]['num'] not in t)
    pages, i = {}, debut
    for t in titres:
        cle = norm(re.sub(r'\$([^$]*)\$', '', libelle(t)))[:38]
        j = i
        while j < len(textes) and cle not in textes[j]:
            j += 1
        if j == len(textes):
            print(f'titre introuvable dans le PDF : {cle}', file=sys.stderr)
            continue
        pages[t['id']] = j + 1
        i = j
    return pages, len(textes)


def signets_manuel(lecteur):
    """Signets du manuel d'origine, tirés de son sommaire (pages 2 à 9 : « titre … page »)."""
    entrees = []
    for p in lecteur.pages[1:9]:
        for ligne in (p.extract_text() or '').splitlines():
            ligne = norm(ligne)
            m = re.match(r'^(.*\S)\s+(\d{1,3})$', ligne)
            if not m or ligne.startswith('PSIDA'):
                continue
            titre, page = m.group(1), int(m.group(2))
            if re.match(r'^Chapitre \d+ —|^\d+\. |^Avant-propos$|^Annexes$|^Exemples traités$', titre):
                entrees.append((0, titre, page))
            else:
                entrees.append((1, titre, page))
    return entrees


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sortie', default=str(MANUEL))
    ap.add_argument('--complement-seul', default=None)
    a = ap.parse_args()
    version = re.search(r"version: '([\d.]+)'", (RACINE / 'web/app.js').read_text()).group(1)
    out = Path(tempfile.mkdtemp(prefix='manuel-'))
    titres = construire(out)
    html, pdf = out / 'complement.html', out / 'complement.pdf'
    imprimer(html, pdf, version)
    pages, n = chercher_pages(pdf, titres)
    for _ in range(2):  # le sommaire paginé peut décaler le corps : on repasse jusqu'à stabilité
        construire(out, pages)
        imprimer(html, pdf, version)
        nouv, n = chercher_pages(pdf, titres)
        if nouv == pages:
            break
        pages = nouv
    if a.complement_seul:
        Path(a.complement_seul).write_bytes(pdf.read_bytes())

    orig = PdfReader(str(MANUEL))
    fin = next((i for i, p in enumerate(orig.pages) if i > 0 and MARQUE in norm(p.extract_text() or '')), len(orig.pages))
    w = PdfWriter()
    for p in orig.pages[:fin]:
        w.add_page(p)
    comp = PdfReader(str(pdf))
    for p in comp.pages:
        w.add_page(p)
    parent = None
    for niv, titre, page in signets_manuel(orig):
        if page > fin:
            continue
        if niv == 0:
            parent = w.add_outline_item(titre, page - 1)
        else:
            w.add_outline_item(titre, page - 1, parent=parent)
    racine = w.add_outline_item(f'Complément {version}', fin)
    parent = None
    for t in titres:
        if t['id'] not in pages:
            continue
        lib = re.sub(r'\$([^$]*)\$', r'\1', libelle(t))
        if t['niv'] == 1:
            parent = w.add_outline_item(lib, fin + pages[t['id']] - 1, parent=racine)
        else:
            w.add_outline_item(lib, fin + pages[t['id']] - 1, parent=parent)
    w.page_mode = '/UseOutlines'
    w.add_metadata({'/Title': "PSIDA — Manuel d'utilisation", '/Author': 'Ahmed Ksentini'})
    w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
    tmp = Path(a.sortie).with_suffix('.tmp.pdf')
    with open(tmp, 'wb') as f:
        w.write(f)
    os.replace(tmp, a.sortie)
    print(f'{a.sortie} : {fin} pages du manuel + {len(comp.pages)} pages du complément ({version})')


if __name__ == '__main__':
    main()
