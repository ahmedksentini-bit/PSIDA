#!/usr/bin/env python3
"""
Manuel d'utilisation : met en forme le PDF exporté du document Claude Docs (polycopié unique, chapitres 1 à 34 et
annexes A à I) avant de le publier sous docs/manuel/PSIDA_Manuel.pdf.

    python3 tools/manuel/pdf.py export_docs.pdf [--sortie docs/manuel/PSIDA_Manuel.pdf] [--px 1100] [--px-plan 1700] [--qualite 60]

Trois opérations, sans rien ajouter au contenu :
  1. signets : un par chapitre (« Chapitre N — … »), par annexe (« Annexe X … ») et par section (« N.M … »), repérés
     dans le texte des pages ;
  2. allègement : images recompressées en JPEG, largeur bornée à --px pixels, --px-plan pour les plans et dessins au
     trait (très larges, fond blanc) dont les cotes doivent rester lisibles (--px 0 : images laissées telles quelles) ;
  3. métadonnées (titre, auteur) et ouverture sur les signets.

Taille : le site est publié par Cloudflare Pages, qui refuse tout fichier de plus de 25 MiB (26 214 400 octets).
Le script échoue (code 2) si le PDF produit dépasse LIMITE_MO = 24 Mo : baisser --qualite ou --px et recommencer.

Il n'y a plus de complément à fusionner : tout le manuel vit dans le document Docs. Les valeurs citées par les
chapitres 31 à 34 se contrôlent à part (npm run manuel:check). Prérequis : python3 avec pypdf et Pillow.
"""
import argparse, io, os, re, shutil, subprocess, sys, unicodedata
from pathlib import Path
from pypdf import PdfReader, PdfWriter

RACINE = Path(__file__).resolve().parents[2]
LIMITE_MO = 24  # Cloudflare Pages : 25 MiB par fichier au plus ; marge d'un peu plus d'1 Mo
MANUEL = RACINE / 'docs/manuel/PSIDA_Manuel.pdf'

# « Chapitre 12 — … » ou « 28. … » ; « Annexe B … » ou « B. … » ; « Avant-propos »
CHAP = re.compile(r'^(?:Chapitre (\d+)\s*[—–-]\s*\S.*|(\d{1,2})\. [A-ZÀ-ÖØ-Þ].*|Annexe ([A-Z])\b.*|([A-L])\. [A-ZÀ-ÖØ-Þ].*|Avant-propos)$')
TDM = re.compile(r'(\s|\.{3,}|…)\d{1,3}$')
SECT = re.compile(r'^(\d+)\.(\d+)(?: bis)?\s+[A-ZÀ-ÖØ-Þ«L].{2,}$')


def norm(s):
    s = unicodedata.normalize('NFKC', s)  # ligatures ﬁ, ﬂ…
    s = s.replace('’', "'").replace(' ', ' ').replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def reperer(lecteur):
    """Titres (niveau, libellé, page) dans l'ordre du document ; une section n'est retenue que si elle appartient au
    chapitre en cours et que son numéro croît, ce qui écarte les « 1.5 m » des tableaux."""
    pages = [[norm(l) for l in (p.extract_text() or '').splitlines()] for p in lecteur.pages]
    # pages de sommaire : la plupart des lignes finissent par un numéro de page ; ailleurs, un titre peut finir par
    # un nombre (« G. Contrôles des chapitres 31 à 34 ») sans être une ligne de sommaire
    def est_sommaire(lignes):
        ls = [l for l in lignes if l]
        return len(ls) >= 5 and sum(bool(TDM.search(l)) for l in ls) >= 0.6 * len(ls)
    sommaire = {i for i, lignes in enumerate(pages) if est_sommaire(lignes)}
    # numéros portés par une forme longue (« Chapitre 3 — », « Annexe B ») : leur forme courte n'est jamais un titre
    longs = {m.group(1) or m.group(3) for i, lignes in enumerate(pages) for l in lignes if not (i in sommaire and TDM.search(l)) and (m := CHAP.match(l)) and (m.group(1) or m.group(3))}
    titres, vus, chap, dern, n_chap, n_ann, annexes = [], set(), None, 0, 0, ord('A') - 1, False
    for i, lignes in enumerate(pages):
        for ligne in lignes:
            if not ligne or len(ligne) > 120 or (i in sommaire and TDM.search(ligne)):
                continue  # ligne de sommaire (« … 12 ») : pas un titre
            if ligne == 'Annexes':
                annexes = True
            m = CHAP.match(ligne)
            if m:
                num = m.group(1) or m.group(2)
                lettre = m.group(3) or m.group(4)
                cle = num or lettre or 'AP'
                # forme courte (« 28. », « B. ») : seulement le chapitre ou l'annexe qui suit, sinon c'est une liste
                # (et seulement après un premier « Chapitre N — », resp. après le titre « Annexes » ou un « Annexe X »)
                suivant = (num and n_chap >= 1 and int(num) == n_chap + 1) or (lettre and annexes and ord(lettre) == n_ann + 1)
                court = bool(m.group(2) or m.group(4))
                if cle in vus or (court and (not suivant or cle in longs)):
                    continue  # titre répété (en-tête courant, renvoi en début de ligne) ou élément de liste
                vus.add(cle)
                if num:
                    n_chap = int(num)
                elif lettre:
                    n_ann, annexes = ord(lettre), True
                titres.append((0, ligne, i))
                chap, dern = cle, 0
                continue
            m = SECT.match(ligne)
            if m and chap is not None and m.group(1) == chap and int(m.group(2)) > dern:
                titres.append((1, ligne, i))
                dern = int(m.group(2))
    return titres


def est_plan(im):
    """Plan ou dessin au trait : image très large (rapport > 2,4), à fond blanc à plus de 80 %. Ses cotes et repères
    sont trop petits pour 1100 px : il garde une largeur plus grande (--px-plan)."""
    if im.width / im.height <= 2.4:
        return False
    g = im.convert('L').resize((max(1, im.width // 4), max(1, im.height // 4)))
    blancs = sum(n for v, n in enumerate(g.histogram()) if v > 235)
    return blancs > 0.8 * g.width * g.height


def alleger(ecrivain, px, qualite, px_plan=1700):
    from PIL import Image
    n = 0
    for page in ecrivain.pages:
        for img in page.images:
            im = img.image
            lim = px_plan if est_plan(im) else px
            if im.width <= lim and img.name.lower().endswith(('.jpg', '.jpeg')):
                continue  # déjà allégée : la recompresser l'alourdirait
            if im.mode in ('RGBA', 'LA', 'P'):
                fond = Image.new('RGB', im.size, 'white')
                fond.paste(im.convert('RGBA'), mask=im.convert('RGBA').split()[-1])
                im = fond
            elif im.mode != 'RGB':
                im = im.convert('RGB')
            if im.width > lim:
                im = im.resize((lim, round(im.height * lim / im.width)), Image.LANCZOS)
            img.replace(im, quality=qualite, optimize=True)
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('export', help='PDF exporté du document Claude Docs')
    ap.add_argument('--sortie', default=str(MANUEL))
    ap.add_argument('--px', type=int, default=1100)
    ap.add_argument('--qualite', type=int, default=60)
    ap.add_argument('--px-plan', type=int, default=1700, help='largeur maximale des plans et dessins au trait')
    a = ap.parse_args()

    lecteur = PdfReader(a.export)
    titres = reperer(lecteur)
    if not any(niv == 0 and re.match(r'(Chapitre 34\b|34\. )', t) for niv, t, _ in titres):
        print('attention : chapitre 34 introuvable dans l\'export — le document Docs est-il complet ?', file=sys.stderr)
    w = PdfWriter(clone_from=lecteur)
    w._root_object.pop('/Outlines', None)  # signets éventuels de l'export : remplacés par ceux du sommaire repéré
    n = alleger(w, a.px, a.qualite, a.px_plan) if a.px > 0 else 0
    parent = None
    for niv, titre, page in titres:
        if niv == 0:
            parent = w.add_outline_item(titre, page)
        else:
            w.add_outline_item(titre, page, parent=parent)
    w.page_mode = '/UseOutlines'
    w.add_metadata({'/Title': "PSIDA — Manuel d'utilisation", '/Author': 'Ahmed Ksentini'})
    w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    tmp = Path(a.sortie).with_suffix('.tmp.pdf')
    with open(tmp, 'wb') as f:
        w.write(f)
    os.replace(tmp, a.sortie)
    if shutil.which('qpdf'):
        # flux recompressés au niveau 9 et objets regroupés en flux d'objets : environ 5 % de moins
        subprocess.run(['qpdf', '--recompress-flate', '--compression-level=9', '--object-streams=generate',
                        a.sortie, str(tmp)], check=True)
        os.replace(tmp, a.sortie)
    nc = sum(1 for niv, *_ in titres if niv == 0)
    print(f'{a.sortie} : {len(lecteur.pages)} pages, {nc} chapitres et annexes, {len(titres) - nc} sections en signets, '
          f'{n} images allégées ({os.path.getsize(a.sortie) / 1e6:.1f} Mo)')
    if os.path.getsize(a.sortie) > LIMITE_MO * 1e6:
        print(f'ERREUR : {os.path.getsize(a.sortie) / 1e6:.1f} Mo > {LIMITE_MO} Mo (Cloudflare Pages refuse tout fichier de plus '
              f'de 25 MiB) : relancer avec --qualite ou --px plus bas', file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
