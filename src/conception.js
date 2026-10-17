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
import { SlabDeck } from './analysis.js';
import { EC_ALPHA } from './loads_ec.js';
import { designEC } from './design.js';

const GR = Math.PI / 200;

/** Ordres de grandeur du guide SETRA 1989 (références de paragraphes dans les textes). */
export const GUIDE89 = {
  DA: { portees12: [7, 15], portees3: [6, 18], elancement: { 1: 20, 2: 26, 3: 28 } },
  DP: { portees: [14, 25], porteeMax: 30, encorbellementsConseilles: 20, elancement: { 1: [22, 25], 2: { rect: 25, enc: 28 }, 3: { rect: 33, enc: 28 } }, longueurCablesFilants: 80 },
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

/**
 * Épaisseur indicative par l'élancement courant (§ 1.2 ; § 3.1.2 et § 3.1.3).
 * @param {{spans:number[], type?:'DA'|'DP', fck?:number, encorbellements?:boolean}} p
 */
export function epaisseurGuide({ spans, type = 'DA', fck = 25, encorbellements = false }) {
  const n = Math.min(spans.length, 3), Lmax = Math.max(...spans);
  if (type === 'DP') {
    const e = GUIDE89.DP.elancement[n];
    const range = n === 1 ? [Lmax / e[1], Lmax / e[0]] : [Lmax / (encorbellements ? e.enc : e.rect), Lmax / (encorbellements ? e.enc : e.rect)];
    const h = range[1];
    return { type, h, range, elancement: n === 1 ? `1/${e[1]} à 1/${e[0]}` : `1/${encorbellements ? e.enc : e.rect}${encorbellements ? ' (larges encorbellements)' : ' (dalle rectangulaire)'}`, hMinTech: 0.8 * h,
      text: `PSI.DP : élancement courant ${n === 1 ? `1/${e[1]} à 1/${e[0]}` : `1/${encorbellements ? e.enc : e.rect}`} → h ≈ ${range.map(v => v.toFixed(2)).join('–')} m ; épaisseur minimale technique ≈ 0,8 h_éco = ${(0.8 * h).toFixed(2)} m, et ±20 % autour de h_éco ne change le coût que de 2 % au plus (§ 3.1.2).` };
  }
  const e = GUIDE89.DA.elancement[n], k = coefBeton(fck);
  const h25 = Lmax / e, h = h25 * k;
  return { type: 'DA', h, h25, k, range: [h, h25], elancement: `1/${e}`, hMinTech: h,
    text: `PSI.DA : élancement courant 1/${e} (${n >= 3 ? '3 travées ou plus' : n === 2 ? '2 travées' : 'travée unique'}) → h ≈ ${h25.toFixed(2)} m pour un B25${k < 1 ? `, × ${k} = ${h.toFixed(2)} m pour un ${fck >= 35 ? 'B35' : 'B30'} (§ 3.1.3)` : ''}. Valeurs établies pour les charges du Fascicule 61 (classe I–II, 2 voies) ; sous LM1 Eurocode et pour les dalles larges l'épaisseur vérifiée est souvent supérieure : utiliser la recherche d'épaisseur ci-dessous.` };
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
  else items.push({ level: 'warn', text: `Direction des fers (§ 3.4.2) : biais prononcé — option 2 (fers parallèles et perpendiculaires aux bords libres) ; l'option 1 donnerait un angle de ${angleFers.toFixed(0)}° < 60° entre familles.` });
  items.push({ level: 'info', text: `Appuis (§ 2.5) : appareils d'appui disposés suivant le biais, ou appuis intermédiaires ponctuels pour un ouvrage peu large ; appuis d'extrémité conçus pour l'encastrement en torsion. Culées en retrait de préférence perpendiculaires à l'axe.` });
  if (psi < GUIDE89.biais.deblaiFaible && spans.length === 3) items.push({ level: 'info', text: `Biais < 75 gr : le 3 travées est réservé aux biais faibles ; 4 travées s'accommode d'un biais important (§ 1.2, schéma des cas d'emploi).` });
  return { items, phiMec, Be };
}

/** Pourcentage minimal d'aciers transversaux inférieurs en travée (§ 3.4.3). */
export function minTransversalGuide({ width, spans, h, psi = 100, parallelesAppuis = true }) {
  const n = width / Math.max(...spans);
  let rho = Math.min(1.3 * n, 2) / 1000;
  const k = psi < 100 && parallelesAppuis ? 1 / Math.sin(psi * GR) : 1;
  return { n, rho: rho * k, rhoBase: rho, k, As: rho * k * h * 1e4, text: `Aciers transversaux inférieurs minimaux en travée (gradient thermique, § 3.4.3) : ρ ≥ min(1,3 n ; 2) ‰ avec n = largeur/portée = ${n.toFixed(2)} → ${(rho * 1000).toFixed(2)} ‰${k > 1 ? ` × 1/sin ψ = ${k.toFixed(3)} (fers parallèles aux lignes d'appui)` : ''} = ${(rho * k * h * 1e4).toFixed(1)} cm²/m.` };
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
  items.push({ level: 'info', text: `Réactions permanentes par mètre de largeur : culées ${rc.map(v => v.toFixed(1)).join(' / ')} t/m${rp.length ? `, piles ${rp.map(v => v.toFixed(1)).join(' / ')} t/m` : ''} (guide : ≈ 20 t/m en pile-culée, ≈ 70 t/m en pile intermédiaire, charges d'exploitation comprises, § 1.3.1). Fondations superficielles souvent possibles (semelles de 1,5 à 4 m, sol ≤ 200–300 kPa).` });
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

/**
 * Synthèse de l'aide à la conception pour un projet.
 * @param {object} p { spans, width, h, fck, psi, tirantAir, overhangs, D, I, type }
 * @param {{deck?:SlabDeck, perm?:object, design?:object, transDesign?:object}} [res] résultats déjà calculés
 */
export function aideConception(p, res = {}) {
  const { spans, width, h, fck = 25, psi = 100, tirantAir = null, overhangs = [0, 0], D = 0.02, I = null } = p;
  const dom = domaineEmploi(spans);
  const type = p.type && p.type !== 'auto' ? p.type : (dom.recommande === 'autre' ? 'DP' : dom.recommande);
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
