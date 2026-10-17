"""
Numérisation des abaques d'épaisseur du guide SETRA « Ponts-dalles – guide de conception » (1989).

Usage : placer les pages 59, 60, 61, 65, 66, 67 du PDF scanné rendues à 200 dpi (pdftoppm -r 200 -f 59 -l 67 -png guide.pdf hi)
dans le répertoire courant, puis `python3 digitize.py`. Produit abaques_raw.json (et des images de contrôle ov*.png).
Le résultat nettoyé est dans src/abaques1989.js. Les pages scannées (© SETRA) ne sont pas distribuées avec le dépôt.
"""
from PIL import Image, ImageDraw
import numpy as np, json


def load(path):
    im = np.array(Image.open(path).convert('L'))
    return im < 140

def grid(dark, xr=(0.15, 0.95), yr=(0.12, 0.9), frac=0.6):
    H, W = dark.shape
    rows = [y for y in range(H) if dark[y, int(W*xr[0]):int(W*xr[1])].mean() > frac]
    cols = [x for x in range(W) if dark[int(H*yr[0]):int(H*yr[1]), x].mean() > frac]
    def groups(v):
        g = []; s = v[0]; p = v[0]
        for x in v[1:]:
            if x != p + 1: g.append((s, p)); s = x
            p = x
        g.append((s, p)); return [(a + b) / 2 for a, b in g]
    return groups(rows), groups(cols)

def runs(col, minlen):
    """runs sombres (début, fin) d'une colonne booléenne, longueur ≥ minlen"""
    out = []; y = 0; n = len(col)
    while y < n:
        if col[y]:
            s = y
            while y < n and col[y]: y += 1
            if y - s >= minlen: out.append((s, y - 1))
        else: y += 1
    return out



def tracker(dark, gridcols, xs, y0, x_end, direction=1, tol=10, corner=45, minlen=4, corner_from=None):
    MINLEN = minlen
    pts = {xs: y0}; xp = [xs]; yp = [y0]; x = xs + direction
    while (x <= x_end) if direction > 0 else (x >= x_end):
        if any(abs(x - g) <= 2 for g in gridcols): x += direction; continue
        if len(xp) >= 3:
            k = min(len(xp), 12); A = np.polyfit(xp[-k:], yp[-k:], 1); pred = np.polyval(A, x)
        else: pred = yp[-1]
        cand = [((a + b) / 2) for a, b in runs(dark[:, x], MINLEN)]
        c1 = [c for c in cand if abs(c - pred) <= tol]
        if c1:
            c = min(c1, key=lambda t: abs(t - pred)); pts[x] = c; xp.append(x); yp.append(c)
        else:
            c2 = [c for c in cand if 0 < yp[-1] - c <= corner and abs(x - xp[-1]) <= 8]
            if c2 and direction > 0 and corner_from is not None and x >= corner_from:
                c = max(c2); pts[x] = c; xp = [x]; yp = [c]
            elif abs(x - xp[-1]) > 30: break
        x += direction
    return pts

def digitize(path, out_png, cal, starts, xend, xstart_track=None, step=0.5, tol=10, corner=45, h_min=None, minlen=4, erase_rows=None, corner_from=None):
    """cal = (X0, u0, DX_per_unit, Y0, h0, DY_per_001) ; starts = {L: (u, h)} extrémité gauche ; xend(L) = fin en unités"""
    X0, u0, DX, Y0, h0, DY = cal
    dark = load(path); img = Image.open(path).convert('RGB'); d = ImageDraw.Draw(img)
    if erase_rows:
        for r in erase_rows: dark[int(r) - 2:int(r) + 3, :] = False
    px = lambda u: X0 + DX * (u - u0); hy = lambda y: h0 + (Y0 - y) / DY * 0.01
    py = lambda h: Y0 - (h - h0) / 0.01 * DY
    gridcols = [X0 + DX * k for k in range(-5, 40)]
    colors = ['red', 'blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'brown', 'olive', 'navy', 'teal', 'gold']
    out = {}
    for i, (L, (u, h)) in enumerate(sorted(starts.items())):
        ut = xstart_track(L, u) if xstart_track else u
        xs = int(px(ut)); ys = py(h)
        cands = [((a + b) / 2) for a, b in runs(dark[:, xs], minlen)]
        if not cands: print('départ introuvable', path, L); continue
        y0 = min(cands, key=lambda c: abs(c - ys))
        if abs(y0 - ys) > 25: print('attention départ éloigné', path, L, round(hy(y0), 3))
        pts = tracker(dark, gridcols, xs, y0, int(px(xend(L))), 1, tol, corner, minlen, int(px(corner_from(L))) if corner_from else None)
        if ut > u + 1e-9: pts.update(tracker(dark, gridcols, xs, y0, int(px(u)) - 3, -1, tol, corner, minlen))
        for x, y in pts.items(): d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=colors[i % len(colors)])
        samp = {}
        u2 = np.ceil(u / step) * step
        while u2 <= xend(L) + 1e-9:
            xx = px(u2); near = [x for x in pts if abs(x - xx) <= 4]
            if near:
                v = round(float(hy(np.mean([pts[x] for x in near]))), 3)
                if h_min is None or v >= h_min - 1e-9: samp[float(round(u2, 2))] = v
            u2 += step
        out[float(L)] = samp
    img.save(out_png)
    return out

res = {}
# RC (PSI.DA), 200 dpi, 1 ligne = 0,01 m, 1 colonne = 1 m
res['DA12'] = digitize('hi-065.png', 'ov65.png', (208, 0, (1525 - 208) / 18, 2098, 0.40, (2098 - 269) / 25),
                       {1: (9.1, 0.462), 2: (9.4, 0.448)}, lambda L: 14.6 if L == 1 else 15.1, lambda L, u: 10.5, step=0.5)
res['DA3'] = digitize('hi-066.png', 'ov66.png', (188, 0, (1503 - 188) / 18, 2098, 0.40, (2098 - 266) / 25),
                      {12: (5.2, 0.400), 13: (5.2, 0.431), 14: (5.7, 0.462), 15: (6.2, 0.493), 16: (6.7, 0.525), 17: (7.2, 0.557), 18: (7.7, 0.589), 19: (8.2, 0.620), 10: (9.35, 0.401), 11: (8.4, 0.401)}, lambda L: L)
res['DA4'] = digitize('hi-067.png', 'ov67.png', (210, 0, (1522 - 210) / 18, 2100, 0.48, (2100 - 270) / 25),
                      {13.25: (5.3, 0.491), 14: (6.0, 0.521), 15: (6.0, 0.559), 16: (6.7, 0.594), 17: (6.6, 0.631), 18: (7.0, 0.668), 19: (7.5, 0.708)}, lambda L: L + 0.3, lambda L, u: 8.5, corner_from=lambda L: 0.78 * L)
# PC (PSI.DP), 1 ligne = 0,05 m (DY par 0,01 = spacing/5), 1 colonne = 2 m ; courbes fines → minlen 2, grille horizontale effacée
def cal_pc(x6, x_last, u_last, ytop, h_top, ybot, h_bot):
    n = round((h_top - h_bot) / 0.05)
    return (x6, 6, (x_last - x6) / (u_last - 6), ybot, h_bot, (ybot - ytop) / (n * 5))
ROWS = {'DP2': [298, 403, 508, 614, 720, 826, 934], 'DP2N': [1160, 1268, 1374, 1480, 1586, 1692, 1798, 1906, 2010, 2118],
        'DP3': [292, 399, 504, 610, 714, 822, 928], 'DP3N': [1156, 1260, 1366, 1472, 1576, 1684, 1790, 1896, 2004],
        'DP4': [294, 401, 507, 613, 719, 825, 930], 'DP4N': [1162, 1266, 1370, 1476, 1581, 1688, 1794, 1900, 2006, 2112]}
opt = lambda k: dict(step=1, minlen=2, tol=8, erase_rows=ROWS[k])
res['DP2'] = digitize('hi-059.png', 'ov59.png', cal_pc(551, 1181, 24, 298, 0.75, 934, 0.45),
                      {15: (6, 0.541), 16: (8, 0.571), 17: (8, 0.598), 18: (8, 0.629), 19: (8, 0.660), 20: (8, 0.692)}, lambda L: L, lambda L, u: 11, **opt('DP2'))
res['DP2N'] = digitize('hi-059.png', 'ov59b.png', cal_pc(557, 1257, 26, 1160, 1.05, 2118, 0.60),
                       {15: (6, 0.708), 16: (8, 0.742), 17: (8, 0.772), 18: (8, 0.804), 19: (8, 0.836), 20: (8, 0.868), 21: (9, 0.898), 22: (9, 0.927), 23: (10, 0.955), 24: (10, 0.985), 25: (10, 1.013)}, lambda L: L, lambda L, u: 12, **opt('DP2N'))
res['DP3'] = digitize('hi-060.png', 'ov60.png', cal_pc(542, 1172, 24, 292, 0.75, 928, 0.45),
                      {15: (6, 0.472), 16: (8, 0.494), 17: (8, 0.517), 18: (8, 0.541), 19: (8, 0.564), 20: (8, 0.587), 21: (9, 0.611), 22: (9, 0.635)}, lambda L: 0.82 * L, lambda L, u: 11, **opt('DP3'))
res['DP3N'] = digitize('hi-060.png', 'ov60b.png', cal_pc(547, 1178, 24, 1156, 1.00, 2004, 0.60),
                       {15: (6, 0.638), 16: (8, 0.668), 17: (8, 0.697), 18: (8, 0.725), 19: (8, 0.752), 20: (9, 0.779), 21: (9, 0.806), 22: (9, 0.832), 23: (9, 0.859), 24: (10, 0.885), 25: (10, 0.912)}, lambda L: 0.82 * L, lambda L, u: 12, **opt('DP3N'))
res['DP4'] = digitize('hi-061.png', 'ov61.png', cal_pc(554, 1186, 24, 294, 0.75, 930, 0.45),
                      {15: (6, 0.479), 16: (8, 0.503), 17: (8, 0.527), 18: (8, 0.551), 19: (8, 0.575), 20: (8, 0.599), 21: (9, 0.623), 22: (9, 0.647)}, lambda L: 0.85 * L, lambda L, u: 11, **opt('DP4'))
res['DP4N'] = digitize('hi-061.png', 'ov61b.png', cal_pc(552, 1250, 26, 1162, 1.05, 2112, 0.60),
                       {15: (6, 0.645), 16: (8, 0.676), 17: (8, 0.706), 18: (8, 0.735), 19: (8, 0.764), 20: (8, 0.793), 21: (9, 0.82), 22: (9, 0.847), 23: (9, 0.874), 24: (9, 0.899), 25: (10, 0.925)}, lambda L: 0.85 * L, lambda L, u: 12, **opt('DP4N'))
for k, v in res.items():
    print('==', k)
    for L, s2 in sorted(v.items()): print('  ', L, {a: b for a, b in s2.items() if a == int(a)})
json.dump(res, open('abaques_raw.json', 'w'), indent=0)
