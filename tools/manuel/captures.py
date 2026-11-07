#!/usr/bin/env python3
"""
Captures d'écran des chapitres 31 à 34 du manuel : PSIDA servi en local, formulaire rempli, calcul lancé, élément photographié.
Images JPEG (1 100 px de large au plus) écrites dans docs/manuel/complement/img/.

    python3 tools/manuel/captures.py
"""
import io, subprocess, time
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parents[2]
IMG = RACINE / 'docs/manuel/complement/img'
PORT = 8779

PSIBA = {'pt_type': 'BA', 'pt_geo': 'rect', 'pt_spans': '11.66, 18.80, 18.80, 14.45', 'pt_continu': 'oui', 'pt_entInt': '1, 2, 2, 1',
         'pt_beInt': '0.38', 'pt_n': '3', 'pt_b1': '4.00', 'pt_hd': '0.20', 'pt_parts': '0.38 0.76', 'pt_road': '-3.75, 3.75',
         'pt_foot': '-5,-3.75 ; 3.75,5', 'pt_lines': '', 'pt_bands': '', 'pt_fck': '30', 'pt_fyk': '400', 'pt_b0': '0.38',
         'pt_cover': '0.10', 'pt_mil': 'Mc120', 'pt_ret': '0', 'pt_tePile': '0.50'}

REMPLIR = """(D) => { for (const [k, v] of Object.entries(D)) { const el = document.querySelector(`[name="${k}"]`); if (!el) continue;
  el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }"""
# bloc qui suit un titre (h2/h3) donné par un extrait de son texte : le titre et les éléments suivants jusqu'au titre suivant
BLOC = """([onglet, motif, n]) => { const T = [...document.querySelectorAll(`#tab-${onglet} h2, #tab-${onglet} h3`)].find(h => h.textContent.includes(motif));
  if (!T) return null; const r = T.getBoundingClientRect(); let b = r.bottom, e = T.nextElementSibling, k = 0;
  while (e && k < n && !/^H[23]$/.test(e.tagName)) { b = Math.max(b, e.getBoundingClientRect().bottom); e = e.nextElementSibling; k++; }
  const box = T.parentElement.getBoundingClientRect();
  return { x: box.left + scrollX, y: r.top + scrollY - 6, w: box.width, h: b - r.top + 12 }; }"""


def jpeg(png, nom, larg=1100):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    if im.width > larg:
        im = im.resize((larg, round(im.height * larg / im.width)), Image.LANCZOS)
    IMG.mkdir(parents=True, exist_ok=True)
    im.save(IMG / nom, 'JPEG', quality=85, optimize=True)
    print(f'{nom} : {im.width} × {im.height}')


def capturer(pg, onglet, donnees, bouton, motif, nom, n=3, attente=12000):
    pg.goto(f'http://127.0.0.1:{PORT}/index.html#{onglet}')
    pg.wait_for_timeout(2500)
    pg.evaluate(REMPLIR, donnees)
    pg.wait_for_timeout(400)
    pg.click(bouton)
    pg.wait_for_timeout(attente)
    z = pg.evaluate(BLOC, [onglet, motif, n])
    if not z:
        raise SystemExit(f'titre introuvable : {motif}')
    jpeg(pg.screenshot(full_page=True, clip={'x': z['x'], 'y': z['y'], 'width': z['w'], 'height': min(z['h'], 1400)}), nom)


def main():
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=RACINE,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1400, 'height': 1000}, device_scale_factor=1.5)
            capturer(pg, 'poutres', PSIBA, '#btn-poutres', 'Travées continues — appuis intermédiaires', 'psiba_appuis.jpg', n=2)
            capturer(pg, 'poutres', PSIBA, '#btn-poutres', 'Entretoises intermédiaires', 'psiba_entretoise.jpg', n=3)
            b.close()
    finally:
        srv.terminate()


if __name__ == '__main__':
    main()
