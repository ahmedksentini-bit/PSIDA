/**
 * Aide à la conception des ponts-dalles.
 *
 *  1. Règles et ordres de grandeur du guide SETRA « Ponts-dalles – guide de conception » (1989) : domaine
 *     d'emploi (§ 1.2), élancements (§ 1.2 et § 3.1), travure (§ 2.1), coupe transversale (§ 2.3), biais
 *     (§ 2.4, § 3.4), abouts (§ 3.2), descente de charges (§ 1.3).
 *  2. Prédimensionnement par le moteur de calcul : recherche de l'épaisseur minimale qui satisfait les
 *     justifications Eurocodes (pratique CHAMOA § 4.1 : épaisseur augmentée de 2 cm en 2 cm).
 *
 * Toutes les fonctions sont pures sauf `rechercheEpaisseur`, qui enchaîne SlabDeck → designEC.
 */
import { mechanicalSkew, equivalentWidth } from './skew.js';
import { DA1, DA2, DA3, DA4, DP } from './abaques1989.js';
import { SlabDeck } from './analysis.js';
import { EC_ALPHA } from './loads_ec.js';
import { designEC } from './design.js';

const GR = Math.PI / 200;

/** Ordres de grandeur du guide SETRA 1989 (références de paragraphes dans les textes). */
export const GUIDE89 = {
  DA: { portees12: [7, 15], portees3: [6, 18], elancement: { 1: 20, 2: 26, 3: 28 } },
  DP: { portees: [14, 25], porteeMax: 30, encorbellementsConseilles: 20, elancement: { 1: [22, 25], 2: { rect: 28, enc: 25 }, 3: { rect: 33, enc: 28 } }, longueurCablesFilants: 80 },
  travure: { rMin: 0.5, rMinBiais: 0.6, rMax: 0.85, nombreOr: 0.618, hauteurMax4Travees: 8 },
  largeur: { min: 5.5, max: 16, demiTabliers: 15 },
  biais: { phiMecMin: 70, option1DA: 80, option1DP: 70, angleMinFers: 60, deblaiFaible: 75 },
  poidsPropre: [1.2, 2.0], reactions: { culee: 20, pile: 70 }, tassements: { sansRenfort: [0.02, 0.03], avecRenfort: [0.06, 0.07] },
};

/** Coefficient d'épaisseur des dalles BA selon la classe de béton (§ 3.1.3 : abaques B25 ; B30 ×0,87 ; B35 ×0,81). */
export function coefBeton(fck) { return fck >= 35 ? 0.81 : fck >= 30 ? 0.87 : 1; }

/**
 * Domaine d'emploi (§ 1.2) : types de dalle envisageables pour la portée déterminante.
 * @returns {{Lmax:number, n:number, types:string[], level:string, text:string, recommande:'DA'|'DP'|'autre'}}
 */
export function domaineEmploi(spans) {
  const n = spans.length, Lmax = Math.max(...spans);
  const da = n <= 2 ? GUIDE89.DA.portees12 : GUIDE89.DA.portees3;
  const types = [];
  if (Lmax <= da[1]) types.push('DA');
  if (Lmax >= GUIDE89.DP.portees[0] && Lmax <= GUIDE89.DP.porteeMax) types.push(Lmax > GUIDE89.DP.encorbellementsConseilles ? 'DP à encorbellements' : 'DP');
  if (Lmax > GUIDE89.DP.porteeMax) types.push('autre');
  const recommande = types.includes('DA') ? 'DA' : types.includes('autre') ? 'autre' : 'DP';
  let text = `Portée déterminante L_max = ${Lmax} m (${n} travée${n > 1 ? 's' : ''}) : `;
  let level = 'ok';
  if (Lmax < da[0]) { text += `inférieure au domaine économique du pont-dalle BA (${da[0]}–${da[1]} m) — un cadre ou portique (PICF, PIPO) est souvent préférable (§ 1.2.1), sauf grand tirant d'air. `; level = 'info'; }
  else if (types.includes('DA')) text += `domaine économique PSI.DA ${da[0]}–${da[1]} m respecté${Lmax >= GUIDE89.DP.portees[0] ? ` ; plage commune avec le PSI.DP (14–18 m), le choix relève de considérations locales (§ 1.2)` : ''}. `;
  else if (types.includes('DP')) { text += `au-delà du domaine BA (≤ ${da[1]} m) : dalle précontrainte PSI.DP (14–25 m, voire 30 m). `; level = 'warn'; }
  else if (types.includes('DP à encorbellements')) { text += `au-delà du domaine BA : dalle précontrainte à larges encorbellements (économiquement imposés au-delà d'une vingtaine de mètres, § 1.2 et § 2.3.2). `; level = 'warn'; }
  else { text += `au-delà de 25–30 m, le pont-dalle n'est plus adapté : dalle nervurée (PSI.DN), bipoutre mixte, pont à béquilles (PSI.BQ). `; level = 'warn'; }
  return { Lmax, n, types, level, text: text.trim(), recommande };
}

/** Interpolation linéaire sur des couples [x, y] triés ; prolongement linéaire au-delà des bornes (signalé). */
function interp1(pairs, x) {
  const n = pairs.length;
  let i = 0;
  while (i < n - 2 && x > pairs[i + 1][0]) i++;
  const [x0, y0] = pairs[i], [x1, y1] = pairs[i + 1];
  return { y: y0 + (y1 - y0) * (x - x0) / (x1 - x0), extrap: x < pairs[0][0] - 1e-9 || x > pairs[n - 1][0] + 1e-9 };
}
/** Lecture d'une courbe h(θℓ) d'abaque : plateau à gauche (courbes plates), prolongement à droite signalé. */
function curveAt(curve, u) {
  if (u <= curve[0][0]) return { y: curve[0][1], extrap: false };
  return interp1(curve, u);
}

/**
 * Épaisseur des abaques PSI.DA du guide (B25, § 3.1.3) pour une travure quelconque : travée déterminante ℓ et
 * travée de rive θℓ (la plus longue) ; hors du domaine des abaques, l'épaisseur est prolongée à élancement
 * constant et signalée.
 * @returns {{h25:number, L:number, thetaL:number|null, abaque:string, extrap:boolean, note:string}}
 */
export function epaisseurAbaqueDA(spans) {
  const n = spans.length;
  if (n === 1) { const r = interp1(DA1, spans[0]); return { h25: r.y, L: spans[0], thetaL: null, abaque: 'travée indépendante (p. 65)', extrap: r.extrap, note: r.extrap ? 'portée hors de la plage 9,5–14,5 m de l\'abaque, prolongement linéaire' : '' }; }
  if (n === 2) { const L = Math.max(...spans); const r = interp1(DA2, L); return { h25: r.y, L, thetaL: null, abaque: '2 travées égales (p. 65)', extrap: r.extrap, note: (spans[0] !== spans[1] ? 'abaque établi pour deux travées égales, portée la plus longue retenue ; ' : '') + (r.extrap ? 'portée hors de la plage 10–15 m, prolongement linéaire' : '') }; }
  const table = n === 3 ? DA3 : DA4;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const central = n === 3 ? [spans[1]] : spans.slice(1, n - 1);
  // § 3.1.3 (p. 64) : 9-14-15-13-8 m → 8-15-15-8 m : travée centrale la plus longue, travée de rive la plus courte (côté sécurité)
  const L = Math.max(...central), thetaL = Math.min(spans[0], spans[n - 1]);
  let note = n >= 5 ? `${n} travées : abaque à 4 travées, plus longue travée intermédiaire et plus courte travée de rive (exemple du guide 9-14-15-13-8 → 8-15-15-8, § 3.1.3) ; ` : '';
  if (n === 4 && spans[1] !== spans[2]) note += 'travées centrales inégales, la plus longue est retenue ; ';
  if (spans[0] !== spans[n - 1]) note += 'travées de rive inégales, la plus courte est retenue (§ 3.1.3, p. 64) ; ';
  const lo = keys[0], hi = keys[keys.length - 1];
  const read = (Lk, u) => curveAt(table[Lk], u);
  let h25, extrap = false;
  if (L < lo - 1e-9 || L > hi + 1e-9) {
    // prolongement à élancement constant à partir de la courbe extrême (même rapport θ)
    const Lk = L < lo ? lo : hi; const r = read(Lk, thetaL * Lk / L); h25 = r.y * L / Lk; extrap = true;
    note += `travée déterminante ${L} m hors de la plage ${lo}–${hi} m de l'abaque, prolongement à élancement constant ; `;
  } else {
    let k0 = keys[0], k1 = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (L >= keys[i] - 1e-9 && L <= keys[i + 1] + 1e-9) { k0 = keys[i]; k1 = keys[i + 1]; break; }
    const r0 = read(k0, thetaL), r1 = read(k1, thetaL);
    h25 = k1 === k0 ? r0.y : r0.y + (r1.y - r0.y) * (L - k0) / (k1 - k0);
    extrap = r0.extrap || r1.extrap;
    if (extrap) note += 'travée de rive au-delà de la travée centrale (θ > 1), prolongement de l\'abaque ; ';
  }
  if (h25 < 0.40) note += 'valeur inférieure à 0,40 m, limite basse des abaques (épaisseur pratique minimale) ; ';
  return { h25, L, thetaL, abaque: n === 3 ? '3 travées (p. 66)' : '4 travées (p. 67)', extrap, note: note.replace(/ ; $/, '') };
}

/** Épaisseur « plateau » des abaques PSI.DP (§ 3.1.2) : dalle pleine (B25) ou à larges encorbellements (B30). */
export function epaisseurAbaqueDP(spans, encorbellements = false) {
  const n = Math.min(Math.max(spans.length, 2), 4);
  const L = Math.max(...spans);
  const key = `DP${n}${encorbellements ? 'N' : ''}`;
  const r = interp1(DP[key], L);
  return { h: r.y, L, abaque: key, extrap: r.extrap, note: (spans.length === 1 ? 'travée unique : abaque à 2 travées, le guide conseille ℓ/25 à ℓ/22 ; ' : '') + (r.extrap ? `portée hors de la plage ${DP[key][0][0]}–${DP[key][DP[key].length - 1][0]} m, prolongement linéaire ; ` : '') + 'valeur pour des travées de rive de 0,4 à 0,6 ℓ, à majorer de 0,02 à 0,04 m si θ approche 0,8–1' };
}

/**
 * Épaisseur indicative : abaques du guide (§ 3.1.2 / § 3.1.3) complétés par les élancements courants (§ 1.2).
 * @param {{spans:number[], type?:'DA'|'DP', fck?:number, encorbellements?:boolean}} p
 */
export function epaisseurGuide({ spans, type = 'DA', fck = 25, encorbellements = false }) {
  const n = Math.min(spans.length, 3), Lmax = Math.max(...spans);
  if (type === 'DP') {
    const e = GUIDE89.DP.elancement[n];
    const el = n === 1 ? `1/${e[1]} à 1/${e[0]}` : `1/${encorbellements ? e.enc : e.rect}`;
    const hEl = n === 1 ? Lmax / e[0] : Lmax / (encorbellements ? e.enc : e.rect);
    const ab = epaisseurAbaqueDP(spans, encorbellements);
    const h = ab.h;
    return { type, h, hAbaque: ab.h, hElancement: hEl, range: [0.8 * h, h], elancement: el, hMinTech: 0.8 * h, abaque: ab,
      text: `PSI.DP${encorbellements ? ' à larges encorbellements' : ' (dalle pleine)'} : abaque ${ab.abaque} du guide (§ 3.1.2, classe II, B${encorbellements ? '30' : '25'}) → h_éco ≈ ${h.toFixed(2)} m pour ℓ = ${ab.L} m (${ab.note}) ; élancement courant ${el} → ${hEl.toFixed(2)} m. Épaisseur minimale technique ≈ 0,8 h_éco = ${(0.8 * h).toFixed(2)} m ; ±20 % autour de h_éco ne change le coût que de 2 % au plus.` };
  }
  const e = GUIDE89.DA.elancement[n], k = coefBeton(fck);
  const ab = epaisseurAbaqueDA(spans);
  const hEl = Lmax / e;
  const h25 = ab.h25, h = h25 * k;
  if (h25 < 0.40 && !ab.note.includes('0,40')) ab.note += (ab.note ? ' ; ' : '') + 'valeur inférieure à 0,40 m, limite basse des abaques (épaisseur pratique minimale)';
  return { type: 'DA', h, h25, k, hAbaque: h25, hElancement: hEl, range: [h, Math.max(h, hEl * k)], elancement: `1/${e}`, hMinTech: h, abaque: ab,
    text: `PSI.DA : abaque ${ab.abaque} du guide (§ 3.1.3, B25, charges du Fascicule 61) → h ≈ ${h25.toFixed(2)} m${ab.thetaL ? ` pour ℓ = ${ab.L} m et une travée de rive de ${ab.thetaL} m (θ = ${(ab.thetaL / ab.L).toFixed(2)})` : ` pour ℓ = ${ab.L} m`}${ab.note ? ' — ' + ab.note : ''}${k < 1 ? ` ; × ${k} = ${h.toFixed(2)} m pour un ${fck >= 35 ? 'B35' : 'B30'}` : ''}. Élancement courant ${`1/${e}`} (${n >= 3 ? '3 travées ou plus' : n === 2 ? '2 travées' : 'travée unique'}) → ${hEl.toFixed(2)} m. Sous LM1 Eurocode et pour les dalles larges, l'épaisseur vérifiée est souvent supérieure : utiliser la recherche d'épaisseur.` };
}

/**
 * Propositions de travure pour une longueur totale entre appuis extrêmes (§ 2.1.1 : travées décroissant du
 * milieu vers les culées, 0,5 (0,6 si biais prononcé) ≤ travée de rive / travée adjacente ≤ 0,85).
 * @param {{Ltot:number, psi?:number, r?:number, fck?:number, nList?:number[]}} p  r = rapport rive/adjacente visé
 */
export function proposerTravures({ Ltot, psi = 100, r = 0.7, fck = 25, nList = [1, 2, 3, 4, 5] }) {
  const out = [];
  const rMin = psi < 70 ? GUIDE89.travure.rMinBiais : GUIDE89.travure.rMin;
  const rr = Math.min(Math.max(r, rMin), GUIDE89.travure.rMax);
  for (const n of nList) {
    let spans;
    if (n === 1) spans = [Ltot];
    else if (n === 2) spans = [Ltot / 2, Ltot / 2];
    else if (n === 3) { const c = Ltot / (1 + 2 * rr); spans = [rr * c, c, rr * c]; }
    else if (n === 4) { const c = Ltot / (2 + 2 * rr); spans = [rr * c, c, c, rr * c]; }
    else if (n === 5) { const s = 0.85, c = Ltot / (1 + 2 * s + 2 * s * rr); spans = [rr * s * c, s * c, c, s * c, rr * s * c]; }
    else { const c = Ltot / n; spans = Array(n).fill(c); }
    // arrondi à 0,1 m, la travée centrale absorbant l'écart
    spans = spans.map(v => Math.round(v * 10) / 10);
    const mid = Math.floor(n / 2), diff = Ltot - spans.reduce((a, b) => a + b, 0);
    if (n % 2 === 1) spans[mid] = Math.round((spans[mid] + diff) * 10) / 10;
    else { spans[mid - 1] = Math.round((spans[mid - 1] + diff / 2) * 10) / 10; spans[mid] = Math.round((spans[mid] + diff / 2) * 10) / 10; }
    const dom = domaineEmploi(spans);
    const type = dom.recommande === 'autre' ? 'DP' : dom.recommande;
    const ep = epaisseurGuide({ spans, type, fck, encorbellements: dom.types.includes('DP à encorbellements') });
    const usage = { 1: 'ouverture modérée, grand élancement indispensable ; sinon cadre/portique (§ 1.2.1)', 2: 'appui central (TPC ≥ 3 m), peu d\'appuis, biais faible (ψ > 75 gr) ; +15 % env. par rapport à 4 travées (§ 1.2.2)', 3: 'fort déblai, TPC < 3 m, biais faible ; travée centrale réduite ou grand tirant d\'air (§ 1.2.3)', 4: 'cas le plus courant en passage supérieur : petit déblai ou remblai, biais même important, TPC ≥ 3 m ; tablier à moins de 8 m au-dessus de la voie (§ 1.2.4)', 5: 'ouvrages longs (voies juxtaposées) ; répartition harmonieuse des appuis (§ 1.2.4)' }[n] || '';
    out.push({ n, spans, type, hGuide: ep.h, hRange: ep.range, domaine: dom, usage, ok: dom.recommande !== 'autre' });
  }
  return out;
}

/** Vérification d'une travure donnée (§ 2.1.1) : rapports de rive, décroissance depuis le milieu, parité. */
export function verifierTravure({ spans, psi = 100 }) {
  const items = [], n = spans.length;
  if (n === 1) { items.push({ level: 'info', text: 'Travée unique : culées de préférence en tête ou à mi-hauteur des talus ; comparer à une solution cadre/portique (§ 1.2.1).' }); return items; }
  const rMin = psi < 70 ? GUIDE89.travure.rMinBiais : GUIDE89.travure.rMin, rMax = GUIDE89.travure.rMax;
  const ends = n === 2 ? [[0, 1, 'courte / longue']] : [[0, 1, 'gauche / adjacente'], [n - 1, n - 2, 'droite / adjacente']];
  for (const [i, j, lab] of ends) {
    const r = spans[i] / spans[j];
    let text = `Rapport des travées ${lab} = ${r.toFixed(2)} (guide : ${rMin} ≤ r ≤ ${rMax}${psi < 70 ? ', 0,6 pour biais prononcé' : ''})`;
    let level = 'ok';
    if (n === 2 && r > 1) { text = `Rapport des travées courte / longue = ${(1 / r).toFixed(2)}`; level = 1 / r < rMin ? 'warn' : 'ok'; if (level === 'warn') text += ` < ${rMin} : risque de soulèvement de l'about de la travée courte (§ 1.2.2)`; }
    else if (r < rMin) { level = 'warn'; text += ` — travée de rive trop courte : risque de soulèvement de l'about, appareils d'appui anti-soulèvement coûteux (§ 2.1.1)`; }
    else if (r > rMax && n > 2) { level = 'warn'; text += ` — travée de rive trop longue : aspect et surconsommation d'aciers (§ 2.1.1)`; }
    items.push({ level, text: text + '.' });
  }
  if (n >= 3) {
    const mid = (n - 1) / 2;
    const decroissant = spans.every((L, i) => i === 0 || (i <= mid ? L >= spans[i - 1] - 1e-9 : L <= spans[i - 1] + 1e-9));
    items.push({ level: decroissant ? 'ok' : 'info', text: decroissant ? 'Travées décroissantes du milieu vers les culées : disposition d\'aspect satisfaisant (§ 2.1.1).' : 'Les travées ne décroissent pas régulièrement du milieu vers les culées : effet de désordre possible (§ 2.1.1).' });
    if (n % 2 === 0) items.push({ level: 'info', text: 'Nombre pair de travées : équilibrer les deux travées centrales (égales) et faire décroître vers les culées (§ 2.1.1).' });
  }
  if (n >= 3 && new Set(spans.map(v => v.toFixed(2))).size === 1) items.push({ level: 'info', text: 'Travées toutes égales : monotonie et travées de rive relativement trop longues (r = 1 > 0,85) ; préférer des rives à 0,6–0,85 de la travée adjacente (§ 2.1.1).' });
  return items;
}

/** Proportions des ouvertures (§ 2.1.1 : hauteur / portée ≤ 0,618 ; § 1.2.4 : au-delà de 8 m de hauteur, 3 travées plutôt que 4). */
export function verifierOuvertures({ spans, tirantAir }) {
  const items = [];
  if (!tirantAir) return items;
  spans.forEach((L, j) => { const r = tirantAir / L; if (r > GUIDE89.travure.nombreOr) items.push({ level: 'info', text: `Travée ${j + 1} : hauteur libre / portée = ${r.toFixed(2)} > 0,618 — ouverture étirée verticalement (§ 2.1.1) ; allonger la travée ou supprimer un appui.` }); });
  if (items.length === 0) items.push({ level: 'ok', text: `Hauteur libre / portée ≤ 0,618 pour toutes les travées (nombre d'or, § 2.1.1).` });
  if (tirantAir > GUIDE89.travure.hauteurMax4Travees && spans.length === 4) items.push({ level: 'info', text: `Tablier à plus de 8 m au-dessus de la voie franchie : le 4 travées paraît trop mince et haut perché, préférer 3 travées sans appui sur le terre-plein central (§ 1.2.4).` });
  return items;
}

/** Coupe transversale (§ 2.3). */
export function verifierCoupe({ width, spans, h, type = 'DA' }) {
  const items = [], Lmax = Math.max(...spans), Lmin = Math.min(...spans);
  if (width < GUIDE89.largeur.min || width > GUIDE89.largeur.max) items.push({ level: 'info', text: `Largeur droite ${width} m hors de la plage courante 5,50–16 m (§ 2.3.3).` });
  if (width > GUIDE89.largeur.demiTabliers) items.push({ level: 'warn', text: `Largeur > 15 m : concevoir si possible deux demi-tabliers séparés par un vide ou un joint mince, pour limiter les effets des déformations imposées (tassements de cintre, gradient thermique) (§ 2.3.3).` });
  if (width > Lmin) items.push({ level: 'info', text: `Largeur (${width} m) supérieure à la portée de la travée ${spans.indexOf(Lmin) + 1} (${Lmin} m) : ouvrage « de grande largeur » — efforts transversaux bornés mais ≈ 20 % supérieurs à ceux d'une travée carrée, gradient thermique redistribuant les réactions vers les appareils d'appui de rive (§ 2.3.3).` });
  if (Lmax > GUIDE89.DP.encorbellementsConseilles) items.push({ level: 'info', text: `Portée > 20 m : la dalle rectangulaire devient trop lourde, encorbellements latéraux conseillés (épaisseur 0,20 ± 0,05 m en extrémité, 0,50 ± 0,15 m à la jonction, ≥ 0,22 m pour ancrer une BN4 ; largeur ≈ 1/4 de la largeur totale chacun, portée d'encorbellement ≤ 3,50 m) (§ 2.3.2, § 3.1.1).` });
  items.push({ level: 'info', text: `Dévers transversal minimal 2,5 % (double pente) rattrapé sur la face supérieure de la dalle ; sous-face horizontale (profil bombé, largeur réduite) ou parallèle (profil en toit, grande largeur) avec bossages sous les appareils d'appui (§ 2.3.1).` });
  if (type === 'DA') items.push({ level: 'info', text: `Dalle BA : longueur de tablier sans limite particulière (dilatations) ; dalle BP à câbles filants : ≤ 80 m environ (§ 2.1.2).` });
  return items;
}

/** Biais (§ 2.4, § 3.4.1, § 3.4.2, § 3.4.3). */
export function verifierBiais({ spans, width, h, I = null, psi = 100, type = 'DA' }) {
  const items = [];
  const Be = equivalentWidth({ width, h, I });
  const phiMec = spans.map(L => mechanicalSkew({ psi, Be, L }));
  if (psi >= 100) { items.push({ level: 'ok', text: 'Ouvrage droit (ψ = 100 gr).' }); return { items, phiMec, Be }; }
  const minPhi = Math.min(...phiMec);
  items.push({ level: minPhi >= GUIDE89.biais.phiMecMin ? 'ok' : 'warn', text: `Biais géométrique ψ = ${psi} gr → biais mécanique φ = ${phiMec.map(v => v.toFixed(1)).join(' / ')} gr par travée (φ = ψ + (100 − ψ)(1 − n/2)², n = largeur biaise / portée biaise, Be = ${Be.toFixed(2)} m, § 3.4.1). Guyon-Massonnet (PSIDA, CHAMOA, cet outil) valable pour φ ≳ 70 gr${minPhi < GUIDE89.biais.phiMecMin ? ' — NON RESPECTÉ : calcul par MRB ou éléments finis (§ 2.4)' : ' (§ 2.4)'}.` });
  const lim = type === 'DA' ? GUIDE89.biais.option1DA : GUIDE89.biais.option1DP;
  const angleFers = psi * 0.9;
  if (psi >= lim) items.push({ level: 'info', text: `Direction des fers (§ 3.4.2) : option 1 conseillée — longitudinaux parallèles aux bords libres, transversaux parallèles aux lignes d'appui (angle entre familles ${angleFers.toFixed(0)}° ≥ 60°).` });
  else if (psi >= 70) items.push({ level: 'info', text: `Direction des fers (§ 3.4.2) : ψ entre 70 et 80 gr — option 1 (transversaux parallèles aux lignes d'appui, angle ${angleFers.toFixed(0)}°) ou option 2 (transversaux perpendiculaires aux bords libres), au choix pratique.` });
  else items.push({ level: 'warn', text: `Direction des fers (§ 3.4.2) : biais prononcé (ψ < 70 gr) — option 2 (fers parallèles et perpendiculaires aux bords libres) ; l'option 1 donnerait un angle de ${angleFers.toFixed(0)}° entre familles${angleFers < 60 ? ' < 60°' : ', proche de la limite de 60°'}.` });
  items.push({ level: 'info', text: `Appuis (§ 2.5) : appareils d'appui disposés suivant le biais, ou appuis intermédiaires ponctuels pour un ouvrage peu large ; appuis d'extrémité conçus pour l'encastrement en torsion. Culées en retrait de préférence perpendiculaires à l'axe.` });
  if (psi < GUIDE89.biais.deblaiFaible && (spans.length === 2 || spans.length === 3)) items.push({ level: 'info', text: `Biais < 75 gr : les 2 et 3 travées sont réservés aux biais faibles ; 4 travées s'accommode d'un biais important (§ 1.2, schéma p. 17).` });
  if (psi < 50 && spans.length === 1) items.push({ level: 'info', text: 'Travée unique : biais modéré conseillé (ψ ≥ 50 gr, schéma p. 17).' });
  return { items, phiMec, Be };
}

/** Pourcentage minimal d'aciers transversaux inférieurs en travée (§ 3.4.3). */
export function minTransversalGuide({ width, spans, h, psi = 100, parallelesAppuis = true }) {
  // § 3.4.3 : η = largeur / portée de la travée considérée (travée par travée — note PSIDP.EL, guide p. 80)
  const perSpan = spans.map(L => Math.min(1.3 * width / L, 2) / 1000);
  const n = width / Math.min(...spans);
  const rho = Math.max(...perSpan);
  const k = psi < 100 && parallelesAppuis ? 1 / Math.sin(psi * GR) : 1;
  const detail = spans.length > 1 ? ` (par travée : ${perSpan.map(r => (r * 1000).toFixed(2)).join(' / ')} ‰)` : '';
  return { n, rho: rho * k, rhoBase: rho, perSpan: perSpan.map(r => r * k), k, As: rho * k * h * 1e4, text: `Aciers transversaux inférieurs minimaux en travée (gradient thermique, § 3.4.3) : ρ ≥ min(1,3 η ; 2) ‰ avec η = largeur/portée de chaque travée${detail} → au plus ${(rho * 1000).toFixed(2)} ‰${k > 1 ? ` × 1/sin ψ = ${k.toFixed(3)} (fers parallèles aux lignes d'appui)` : ''} = ${(rho * k * h * 1e4).toFixed(1)} cm²/m.` };
}

/** Longueur d'about (§ 3.2) : BA 0,1 + 15 D ; BP 0,5 (1 + |cot ψ|), mesurée suivant l'axe. */
export function longueurAbout({ type = 'DA', psi = 100, D = 0.02 }) {
  return type === 'DA' ? 0.1 + 15 * D : 0.5 * (1 + Math.abs(1 / Math.tan(psi * GR)));
}

export function verifierAbouts({ type = 'DA', psi = 100, D = 0.02, overhangs = [0, 0] }) {
  const req = longueurAbout({ type, psi, D });
  const items = [];
  const rule = type === 'DA' ? `0,1 + 15 D = ${req.toFixed(2)} m (D = ${(D * 1000).toFixed(0)} mm, plus gros fer ancré par courbure au-delà de la ligne d'appui)` : `0,5 (1 + |cot ψ|) = ${req.toFixed(2)} m`;
  overhangs.forEach((a, i) => items.push({ level: a >= req - 1e-9 ? 'ok' : 'warn', text: `About ${i === 0 ? 'gauche' : 'droit'} = ${a.toFixed(2)} m ; guide § 3.2 : ≥ ${rule}.` }));
  return { req, items };
}

/** Descente de charges indicative (§ 1.3.1 : poids propre 1,2–2 t/m², réactions 20 t/m (pile-culée) à 70 t/m (pile)). */
export function descenteCharges(deck, perm) {
  const width = 2 * deck.b;
  const gDalle = deck.gammaC * deck.area / width; // kN/m²
  const tPerM2 = gDalle / 9.81;
  const reactions = perm.R.map((R, i) => ({ i, R, perM: R / width, tPerM: R / width / 9.81, kind: i === 0 || i === perm.R.length - 1 ? 'culée' : 'pile' }));
  const items = [];
  const [lo, hi] = GUIDE89.poidsPropre;
  items.push({ level: tPerM2 >= lo && tPerM2 <= hi ? 'ok' : 'info', text: `Poids propre de la dalle ${gDalle.toFixed(1)} kN/m² = ${tPerM2.toFixed(2)} t/m² (guide : 1,2 à 2 t/m² selon les portées, § 1.3.1).` });
  const rc = reactions.filter(r => r.kind === 'culée').map(r => r.tPerM), rp = reactions.filter(r => r.kind === 'pile').map(r => r.tPerM);
  items.push({ level: 'info', text: `Réactions permanentes par mètre de largeur : culées ${rc.map(v => v.toFixed(1)).join(' / ')} t/m${rp.length ? `, piles ${rp.map(v => v.toFixed(1)).join(' / ')} t/m` : ''} (guide : de l'ordre de 20 t/m en pile-culée à 70 t/m en pile intermédiaire, par mètre de largeur droite, § 1.3.1). Fondations superficielles souvent possibles (semelles de 1,5 à 4 m, sol ≤ 200–300 kPa).` });
  items.push({ level: 'info', text: `Tassements différentiels admissibles : 2 à 3 cm sans renforcement, 6 à 7 cm moyennant peu de renforcements (§ 1.3.3, § 2.7).` });
  return { gDalle, tPerM2, reactions, items };
}

/** Quantités indicatives à partir d'un ferraillage longitudinal (et transversal si fourni). */
export function quantites(deck, design, transDesign = null) {
  const width = 2 * deck.b, Ltot = deck.spans.reduce((a, b) => a + b, 0) + (deck.g.overhangs || [0, 0]).reduce((a, b) => a + b, 0);
  const volume = deck.area * Ltot; // m³
  // aciers longitudinaux : enveloppe A_s(x) intégrée par section (uniformes sur la largeur, pratique CHAMOA)
  const secs = deck.beam.sections;
  let steelLong = 0;
  for (let s = 0; s < secs.length; s++) {
    const x0 = s === 0 ? secs[0].x : (secs[s - 1].x + secs[s].x) / 2, x1 = s === secs.length - 1 ? secs[s].x : (secs[s].x + secs[s + 1].x) / 2;
    steelLong += (design.envBot[s] + design.envTop[s]) * width * (x1 - x0);
  }
  // disposition pratique : nappe inférieure constante par travée (max de la travée), nappe supérieure constante par demi-travée
  let steelPractical = 0;
  deck.spans.forEach((L, j) => {
    const idx = secs.map((s, i) => (s.span === j ? i : -1)).filter(i => i >= 0);
    const botMax = Math.max(...idx.map(i => design.envBot[i]));
    const left = idx.filter(i => secs[i].frac <= 0.5), right = idx.filter(i => secs[i].frac >= 0.5);
    const topL = Math.max(...left.map(i => design.envTop[i])), topR = Math.max(...right.map(i => design.envTop[i]));
    steelPractical += (botMax * L + topL * L / 2 + topR * L / 2) * width;
  });
  let steelTrans = 0;
  if (transDesign) transDesign.spans.forEach((sp, j) => { steelTrans += (sp.bot.As + sp.top.As) * width * deck.spans[j]; });
  const kg = v => v * 7850; // m³ → kg
  return { volume, volumePerM2: deck.area / width, steelLongKg: kg(steelLong), steelLongPracticalKg: kg(steelPractical), steelTransKg: kg(steelTrans), ratioLong: kg(steelLong) / volume, ratioLongPractical: kg(steelPractical) / volume, ratioTrans: kg(steelTrans) / volume, ratioTotal: kg(steelPractical + steelTrans) / volume,
    text: `Béton ${volume.toFixed(0)} m³ (${(deck.area / width).toFixed(3)} m³/m² de tablier). Aciers longitudinaux : ${(kg(steelLong) / 1000).toFixed(1)} t (${(kg(steelLong) / volume).toFixed(0)} kg/m³) pour l'enveloppe A_s(x) stricte, ${(kg(steelPractical) / 1000).toFixed(1)} t (${(kg(steelPractical) / volume).toFixed(0)} kg/m³) avec des nappes constantes par travée (inf.) et par demi-travée (sup.), hors recouvrements${transDesign ? ` ; transversaux ≈ ${(kg(steelTrans) / 1000).toFixed(1)} t (${(kg(steelTrans) / volume).toFixed(0)} kg/m³)` : ''} ; soit ≈ ${(kg(steelPractical + steelTrans) / volume).toFixed(0)} kg/m³ hors étriers, chevêtres, abouts et encorbellements.` };
}

/** Désordres constatés sur les ponts-dalles et leurs causes (guide, § 5.1), pour mémoire au stade de la conception. */
export function pointsVigilance({ width, psi = 100, type = 'DA', spans }) {
  const items = [];
  items.push({ level: 'info', text: 'Les désordres les plus fréquents viennent d\'une insuffisance d\'aciers passifs (ouverture des fissures) plus que de béton : respecter les dispositions constructives du § 3.4 (deux directions d\'armatures par face, angle ≥ 60°, recouvrements entre zones, cadres et étriers).' });
  items.push({ level: 'info', text: 'Fissures transversales en sous-face près des appuis intermédiaires : pointes de flexion amplifiées par le gradient thermique (et un tracé de câble inadapté en BP), retrait différentiel nervure / encorbellements minces — d\'où le gradient thermique et les minimums de l\'outil (§ 5.1 b).' });
  if (width > GUIDE89.largeur.demiTabliers) items.push({ level: 'warn', text: 'Dalle de plus de 15 m de largeur : fissures longitudinales en sous-face découpant la dalle en bandes (gradient thermique, tassement de cintre avant durcissement) — demi-tabliers ou ferraillage transversal renforcé (§ 5.1 c, § 2.3.3).' });
  if (type === 'DP') items.push({ level: 'info', text: 'Zones d\'about en BP : fissures longitudinales et inclinées dues à la diffusion de la précontrainte (efforts de surface, d\'éclatement, d\'équilibre général) ; frettage soigné derrière les ancrages (§ 5.1 a, § 3.2, § 3.3).' });
  if (psi < 100) items.push({ level: 'info', text: 'Tabliers biais ou courbes : ruptures d\'articulations Freyssinet constatées (déplacements et rotations excessifs) — préférer des appareils d\'appui en élastomère fretté (§ 5.1, § 3.6).' });
  items.push({ level: 'info', text: 'Appuis : piles conçues pour résister aux chocs de véhicules ; joints de chaussée et dalles de transition à concevoir dès l\'avant-projet (bourrelets et dislocations du revêtement sinon) (§ 5.1, § 3.9).' });
  return items;
}

/**
 * Synthèse de l'aide à la conception pour un projet.
 * @param {object} p { spans, width, h, fck, psi, tirantAir, overhangs, D, I, type }
 * @param {{deck?:SlabDeck, perm?:object, design?:object, transDesign?:object}} [res] résultats déjà calculés
 */
export function aideConception(p, res = {}) {
  const { spans, width, h, fck = 25, psi = 100, tirantAir = null, overhangs = [0, 0], D = 0.02, I = null } = p;
  const dom0 = domaineEmploi(spans);
  const type = p.type && p.type !== 'auto' ? p.type : (dom0.recommande === 'autre' ? 'DP' : dom0.recommande);
  // dalle précontrainte retenue (type DP), dans son domaine, avec des encorbellements quand ils sont conseillés : conforme
  const dpOk = type === 'DP' && (dom0.types.includes('DP') || (dom0.types.includes('DP à encorbellements') && p.encorbellements));
  const dom = dpOk ? { ...dom0, level: 'ok', text: `${dom0.text} Dalle précontrainte retenue${p.encorbellements ? ', à encorbellements' : ''} : conforme au domaine d'emploi.` } : dom0;
  const ep = epaisseurGuide({ spans, type, fck, encorbellements: dom.types.includes('DP à encorbellements') });
  const ratio = h / ep.h;
  const sections = [];
  sections.push({ title: 'Domaine d\'emploi et type (§ 1.2)', items: [{ level: dom.level, text: dom.text }, { level: 'info', text: `Type retenu pour l'aide : PSI.${type}${type === 'DP' ? ' (la vérification détaillée de cet outil ne couvre que le béton armé)' : ''}.` }] });
  sections.push({ title: 'Épaisseur (§ 1.2, § 3.1)', items: [{ level: ratio >= 0.95 ? (ratio <= 1.3 ? 'ok' : 'info') : 'warn', text: `h = ${h.toFixed(2)} m, soit L_max/h = ${(dom.Lmax / h).toFixed(1)} ; ${ep.text}${ratio < 0.95 ? ' Épaisseur saisie inférieure de plus de 5 % à l\'indication du guide : vérifier la compression du béton et la densité d\'armatures (§ 3.1.3 : « la recherche d\'une minceur excessive doit être évitée »).' : ratio > 1.3 ? ' Épaisseur saisie supérieure de plus de 30 % à l\'indication du guide (dalle lourde).' : ''}` }] });
  sections.push({ title: 'Travure (§ 2.1)', items: [...verifierTravure({ spans, psi }), ...verifierOuvertures({ spans, tirantAir })] });
  const biais = verifierBiais({ spans, width, h, I, psi, type });
  sections.push({ title: 'Biais (§ 2.4, § 3.4)', items: biais.items });
  sections.push({ title: 'Coupe transversale (§ 2.3)', items: verifierCoupe({ width, spans, h, type }) });
  const ab = verifierAbouts({ type, psi, D, overhangs });
  const mt = minTransversalGuide({ width, spans, h, psi, parallelesAppuis: psi >= 70 });
  sections.push({ title: 'Abouts et ferraillage minimal (§ 3.2, § 3.4.3)', items: [...ab.items, { level: 'info', text: mt.text }] });
  sections.push({ title: 'Points de vigilance (désordres constatés, ch. 5 du guide)', items: pointsVigilance({ width, psi, type, spans }) });
  let descente = null, quant = null;
  if (res.deck && res.perm) { descente = descenteCharges(res.deck, res.perm); sections.push({ title: 'Descente de charges (§ 1.3)', items: descente.items }); }
  if (res.deck && res.design) { quant = quantites(res.deck, res.design, res.transDesign); sections.push({ title: 'Quantités indicatives', items: [{ level: 'info', text: quant.text }] }); }
  const Ltot = spans.reduce((a, b) => a + b, 0);
  const travures = proposerTravures({ Ltot, psi, fck, r: 0.7 });
  return { type, domaine: dom, epaisseur: ep, sections, travures, biais, abouts: ab, minTransversal: mt, descente, quantites: quant, Ltot };
}

/**
 * Recherche de l'épaisseur minimale vérifiée (Eurocodes) : h croissant de `step` en `step` (CHAMOA § 4.1).
 * Critères : pas d'aciers comprimés (x/d ≤ 0,45 à l'ELU, σc ≤ 0,6 fck à l'ELS caractéristique), taux d'armatures
 * par face ≤ rhoMax, V_Ed ≤ V_Rd,max, poinçonnement sous roue ; V_Ed ≤ V_Rd,c (sans étriers) est indiqué à titre d'information.
 * @param {object} p  { deckInput, alpha, mat, withTherm, dT, E, I, delta, phiFluage } (mêmes champs que l'interface)
 * @param {{hMin:number, hMax:number, step?:number, rhoMax?:number, onStep?:(row)=>void|Promise}} o
 */
export async function rechercheEpaisseur(p, { hMin, hMax, step = 0.02, rhoMax = 0.01, onStep = null } = {}) {
  const rows = [];
  const h0 = p.deckInput.h, area0 = p.deckInput.area;
  let hOK = null;
  for (let h = hMin; h <= hMax + 1e-9 && hOK === null; h = Math.round((h + step) * 1000) / 1000) {
    const area = area0 ? area0 + p.deckInput.width * (h - h0) : undefined; // déduction des chanfreins conservée
    const deck = new SlabDeck({ ...p.deckInput, h, area });
    const perm = deck.permanent();
    const ec = deck.eurocode({ alpha: EC_ALPHA[p.alpha] || p.alpha || EC_ALPHA.recommended });
    const I = p.I ? p.I * Math.pow(h / h0, 3) : null;
    const thermal = p.withTherm ? deck.thermal({ dTheat: p.dT?.[0] ?? 12, dTcool: p.dT?.[1] ?? -6, E: p.E, I }) : null;
    const settle = p.withTherm ? deck.settlements({ delta: p.delta ?? 0.01, E: p.E, I, phi: p.phiFluage ?? 2 }) : null;
    const d = designEC(deck, perm, ec, { ...p.mat, thermal, settle });
    const asBot = Math.max(...d.envBot), asTop = Math.max(...d.envTop);
    const as2 = Math.max(...d.perFibre.flatMap(r => r.flatMap(f => [f.bot.As2 || 0, f.top.As2 || 0])));
    const sigC = Math.max(...d.perFibre.flatMap(r => r.flatMap(f => [f.bot.sigC || 0, f.top.sigC || 0])));
    const xd = Math.max(...d.perFibre.flatMap(r => r.flatMap(f => [f.bot.xOverD || 0, f.top.xOverD || 0])));
    const vRatio = Math.max(...d.shear.map(s => s.ratio)), vMax = Math.max(...d.shear.map(s => s.VEd / s.VRdmax));
    const punchOK = d.punch.LM1.ok && d.punch.LM2.ok;
    const crit = [];
    if (as2 > 1e-9) crit.push('aciers comprimés');
    if (Math.max(asBot, asTop) / h > rhoMax) crit.push(`ρ > ${(rhoMax * 100).toFixed(1)} %`);
    if (vMax > 1) crit.push('V_Ed > V_Rd,max');
    if (!punchOK) crit.push('poinçonnement');
    const row = { h, asBot, asTop, rhoBot: asBot / h, rhoTop: asTop / h, as2, sigC, xd, vRatio, vMax, punchOK, crit, ok: crit.length === 0, stirrups: vRatio > 1, Mmax: Math.max(...d.comb.ELU.max.flat()), Mmin: Math.min(...d.comb.ELU.min.flat()) };
    rows.push(row);
    if (row.ok) hOK = h;
    if (onStep) await onStep(row);
  }
  return { rows, hOK, rhoMax };
}
