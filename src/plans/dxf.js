/**
 * Feuille de plan → DXF R12 (AC1009, ASCII, page de codes ANSI_1252), lisible par AutoCAD, BricsCAD, DraftSight,
 * LibreCAD, QCAD. Unités : mm. L'espace objet contient la feuille à l'échelle 1 (mm papier) ; chaque vue à échelle
 * unique y est un BLOC dessiné en vraie grandeur (mm de l'ouvrage) inséré à l'échelle 1/échelle : une fois le bloc
 * décomposé (ou édité), les longueurs se mesurent directement. Les coupes dilatées (échelles horizontale et
 * verticale différentes) sont dessinées directement sur la feuille. Calques normalisés (dessin.js, CALQUES).
 */
import { CALQUES } from './dessin.js';
import { primitivesFeuille } from './primitives.js';

const n = v => (Math.abs(v) < 1e-9 ? '0.0' : (+v.toFixed(4)).toString());
// caractères hors ANSI 1252 : séquence \U+XXXX (comprise par AutoCAD et la plupart des lecteurs)
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const txt = s => Array.from(String(s)).map(ch => { const c = ch.codePointAt(0); return c < 256 || CP1252_EXTRA.includes(ch) ? ch : `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`; }).join('');

function entite(L, p, calque) {
  const c = calque || p.calque || '0';
  if (p.t === 'L') L.push('0', 'LINE', '8', c, '10', n(p.a[0]), '20', n(p.a[1]), '30', '0.0', '11', n(p.b[0]), '21', n(p.b[1]), '31', '0.0');
  else if (p.t === 'P') {
    L.push('0', 'POLYLINE', '8', c, '66', '1', '10', '0.0', '20', '0.0', '30', '0.0', '70', p.ferme ? '1' : '0');
    for (const q of p.pts) L.push('0', 'VERTEX', '8', c, '10', n(q[0]), '20', n(q[1]), '30', '0.0');
    L.push('0', 'SEQEND', '8', c);
  } else if (p.t === 'C') {
    if (!p.plein) L.push('0', 'CIRCLE', '8', c, '10', n(p.c[0]), '20', n(p.c[1]), '30', '0.0', '40', n(p.r));
    else {   // disque plein (« donut » : polyligne fermée de deux demi-cercles, largeur r)
      L.push('0', 'POLYLINE', '8', c, '66', '1', '10', '0.0', '20', '0.0', '30', '0.0', '70', '1', '40', n(p.r), '41', n(p.r));
      for (const sx of [-1, 1]) L.push('0', 'VERTEX', '8', c, '10', n(p.c[0] + sx * p.r / 2), '20', n(p.c[1]), '30', '0.0', '42', '1.0');
      L.push('0', 'SEQEND', '8', c);
    }
  } else if (p.t === 'A') L.push('0', 'ARC', '8', c, '10', n(p.c[0]), '20', n(p.c[1]), '30', '0.0', '40', n(p.r), '50', n(p.a0), '51', n(p.a1));
  else if (p.t === 'T') {
    const h72 = p.ancre === 'c' ? 1 : p.ancre === 'd' ? 2 : 0, v73 = p.v === 'm' ? 2 : p.v === 'h' ? 3 : 0;
    L.push('0', 'TEXT', '8', c, '10', n(p.p[0]), '20', n(p.p[1]), '30', '0.0', '40', n(p.h), '1', txt(p.s), '50', n(p.angle || 0), '7', p.gras ? 'GRAS' : 'STANDARD');
    if (h72 || v73) L.push('72', String(h72), '73', String(v73), '11', n(p.p[0]), '21', n(p.p[1]), '31', '0.0');
  }
}

export function feuilleDXF(F) {
  const { papier, blocs } = primitivesFeuille(F, { blocsDXF: true });
  const L = [];
  // en-tête
  L.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$DWGCODEPAGE', '3', 'ANSI_1252', '9', '$INSBASE', '10', '0.0', '20', '0.0', '30', '0.0',
    '9', '$EXTMIN', '10', '0.0', '20', '0.0', '30', '0.0', '9', '$EXTMAX', '10', n(F.W), '20', n(F.H), '30', '0.0', '9', '$LIMMIN', '10', '0.0', '20', '0.0', '9', '$LIMMAX', '10', n(F.W), '20', n(F.H),
    '9', '$LTSCALE', '40', '1.0', '9', '$TEXTSTYLE', '7', 'STANDARD', '0', 'ENDSEC');
  // tables : types de ligne, calques, styles
  L.push('0', 'SECTION', '2', 'TABLES');
  L.push('0', 'TABLE', '2', 'LTYPE', '70', '3');
  L.push('0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0');
  L.push('0', 'LTYPE', '2', 'DASHED', '70', '0', '3', '__ __ __', '72', '65', '73', '2', '40', '4.5', '49', '3.0', '49', '-1.5');
  L.push('0', 'LTYPE', '2', 'CENTER', '70', '0', '3', '____ _ ____', '72', '65', '73', '4', '40', '13.5', '49', '9.0', '49', '-1.5', '49', '1.5', '49', '-1.5');
  L.push('0', 'ENDTAB');
  const noms = Object.keys(CALQUES);
  L.push('0', 'TABLE', '2', 'LAYER', '70', String(noms.length + 1));
  L.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
  for (const k of noms) L.push('0', 'LAYER', '2', k, '70', '0', '62', String(CALQUES[k].couleur), '6', CALQUES[k].type);
  L.push('0', 'ENDTAB');
  L.push('0', 'TABLE', '2', 'STYLE', '70', '2');
  for (const [nom, police] of [['STANDARD', 'arialn.ttf'], ['GRAS', 'arialnb.ttf']]) L.push('0', 'STYLE', '2', nom, '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', police, '4', '');
  L.push('0', 'ENDTAB', '0', 'ENDSEC');
  // blocs : une vue par bloc, en mm réels
  L.push('0', 'SECTION', '2', 'BLOCKS');
  for (const b of blocs) {
    L.push('0', 'BLOCK', '8', '0', '2', b.nom, '70', '0', '10', '0.0', '20', '0.0', '30', '0.0', '3', b.nom);
    for (const p of b.prims) entite(L, p);
    L.push('0', 'ENDBLK', '8', '0');
  }
  L.push('0', 'ENDSEC');
  // entités : feuille + insertions des vues
  L.push('0', 'SECTION', '2', 'ENTITIES');
  for (const p of papier) entite(L, p);
  for (const b of blocs) L.push('0', 'INSERT', '8', 'COFFRAGE', '2', b.nom, '10', n(b.x), '20', n(b.y), '30', '0.0', '41', n(b.sx), '42', n(b.sy), '43', n(b.sx));
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\r\n') + '\r\n';
}

/** Chaîne DXF → octets ANSI 1252 (les caractères hors page ont déjà été échappés en \U+XXXX). */
export function octetsCp1252(s) {
  const map = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
  const out = new Uint8Array(s.length); let k = 0;
  for (const ch of s) { const c = ch.codePointAt(0); out[k++] = c < 256 ? c : (map[ch] ?? 0x3F); }
  return out.slice(0, k);
}
