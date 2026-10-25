/**
 * Schémas « ce que vous saisissez » : élévation, coupe transversale et vue en plan dessinées en direct à partir du
 * formulaire (sans lancer le calcul), avec les cotes des valeurs saisies ; aide contextuelle des champs.
 */
import { notionalLanes } from '../src/loads_ec.js';
import { classePont } from '../src/loads_f61.js';
import { parseRail } from '../src/pipeline.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fr = (v, d = 2) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
const nums = s => String(s || '').split(/[,;\s]+/).filter(t => t !== '').map(Number).filter(v => Number.isFinite(v));
const GR = Math.PI / 200;

/** Aide contextuelle par champ (title des champs et liste d'aide). */
export const HELP = {
  spans: 'Portées entre axes d\'appuis, de gauche à droite [m] : choisir le nombre de travées (− / +), puis saisir chaque portée — ex. 10 ; 15 ; 15 ; 10. Elles définissent les travées T1…Tn et les appuis C0, P1…, Cn.',
  width: 'Largeur droite totale de la dalle 2b, mesurée perpendiculairement aux bords libres, encorbellements compris [m]. Le repère transversal y va de −b (bord gauche) à +b (bord droit).',
  h: 'Épaisseur de la dalle (hauteur de la nervure Hd) [m] ; voir les abaques du guide 1989 dans l\'aide à la conception.',
  area: 'Aire de la section droite pour le poids propre [m²] ; vide = 2b·h (rectangle). Avec chanfreins ou encorbellements, saisir l\'aire réelle (8,91 m² pour l\'exemple CHAMOA).',
  overhangs: 'Abouts : longueur de dalle au-delà de l\'axe des appuis d\'extrémité, à gauche puis à droite [m] (consoles chargées par le permanent). Guide § 3.2 : ≥ 0,1 + 15 D en BA.',
  roadway: 'Bords de la largeur roulable y1, y2 dans le repère transversal (y = 0 à l\'axe) [m] — ex. −5, 5 pour une chaussée de 10 m centrée. Détermine les voies EN 1991-2 et la classe Fascicule 61.',
  footways: 'Trottoirs : une ligne par trottoir, bords y1 et y2 [m] (« + Ajouter un trottoir », × pour supprimer) — chargés à 3 kN/m² avec LM1 (gr1a), 5 kN/m² seuls (gr3) et 1,5 kN/m² (Fasc. 61).',
  lines: 'Charges permanentes linéiques (corniches, garde-corps, BN4, trottoirs pleins…) : une ligne par charge : g [kN/m] et position transversale e [m] ; k min et k max = coefficients de valeur caractéristique (EN 1991-1-1 § 5.2.3 ; CHAMOA 0,8/1,2), vides = 1.',
  bands: 'Charges permanentes surfaciques (revêtement, chape, remblai) : une ligne par charge : q [kN/m²] appliquée entre y1 et y2 [m] ; k min / k max (enrobé 0,8/1,4 ; chape 0,8/1,2), vides = 1.',
  ys: 'Ordonnées transversales de calcul de K(y) et m_x(y) [m] ; les bords ±b sont les fibres les plus sollicitées.',
  nu: 'Coefficient de Poisson de la dalle dans Guyon-Massonnet : 0,2 reproduit CHAMOA, 0 reproduit les tables de Massonnet et les coefficients K de PSIDA.EL.',
  laneStep: 'Pas de glissement transversal des voies et files de camions pour trouver la position la plus défavorable [m].',
  Leq: 'Portées équivalentes imposées (θ = b/L_eq) [m] ; vide = calcul automatique par la travée seule chargée (points de moment nul).',
  mil: 'Charges militaires et exceptionnelles du Fascicule 61 (art. 9 et 10) : elles ne s\'appliquent que sur les itinéraires classés (Mc120 pour les itinéraires militaires, D240 pour les convois exceptionnels). L\'exemple PSIDA.EL ne prend que Mc120.',
  ap_pileType: 'Pile voile (fût rectangulaire, appareils sous la dalle) ou palée de colonnes circulaires, avec ou sans chevêtre. Le fût est calculé en console encastrée en pied (l_f = 2 H) sous les efforts en tête combinés (BAEL annexe D ou EN 1990 A2).',
  ap_pileH: 'Hauteur des fûts de la base (dessus de semelle) à la sous-face de la dalle ou du chevêtre, une valeur par pile (P1, P2… de gauche à droite) ; le nombre de piles suit le nombre de travées.',
  ap_culType: 'Culée remblayée : mur de front sous la poussée des terres (garde-grève compris) + garde-grève et murs en retour (PP73). Culée enterrée : chevêtre sur colonnes noyées dans le remblai, poussée sur une largeur fictive min(3D ; entraxe) par colonne.',
  ap_found: 'Semelles superficielles (portance pressiométrique NF P 94-261 ou F62-V, excentrement, glissement, ferraillage par bielles) ou semelles sur pieux (efforts par semelle rigide, Ménard, ferraillage, portance NF P 94-262 simplifiée, tirant par bielles).',
  ap_ple: 'Pression limite nette équivalente p*_le sous la semelle ou en pointe [MPa], module pressiométrique E_M [MPa] et coefficient rhéologique α de Ménard (0,33 à 0,67 selon le sol).',
  ap_TLD: 'Fascicule 61 : raccourcissements relatifs du tablier sous variation de température de longue durée (3·10⁻⁴, K différé) et de courte durée (1·10⁻⁴ pour les appuis, K instantané). Retrait + fluage : champ « Raccourcissement lent ε » ; Eurocodes : α × variation uniforme de température.',
  leqMethod: 'Définition de la portée équivalente de Guyon-Massonnet : distance entre points de moment nul de la travée seule chargée (CHAMOA, avec ν = 0,2) ou travée isostatique de même flèche à mi-travée (programme SETRA PSIDA.EL 1984, avec ν = 0). Les deux couples reproduisent les notes de référence (docs/hypotheses.md § 1 quater).',
  alpha: 'Coefficients d\'ajustement α du modèle LM1 : valeurs recommandées (α = 1) ou annexe nationale française (classe 1 : trafic lourd ; classe 2 : trafic courant, exemple CHAMOA).',
  trafic: 'Trafic porté par le tablier : routier (LM1, LM2, Fascicule 61) ou ferroviaire (pont-dalle sous rail : LM71, SW/0, SW/2 de l\'EN 1991-2 section 6, à la place des charges routières).',
  rail_n: 'Nombre de voies ferrées portées (1 ou 2). Avec 2 voies, les groupes du tableau 6.11 chargent une voie ou les deux.',
  rail_y: 'Ordonnée y de l\'axe de la voie (une voie) ou du milieu des deux voies, dans le repère du tablier (−b à +b).',
  rail_entraxe: 'Entraxe des deux voies [m] (deux voies seulement).',
  rail_alpha: 'Coefficient α des charges verticales classifiées (EN 1991-2 § 6.3.2(3)) : multiplie LM71 et SW/0 (pas SW/2) ; 1,00 par défaut, valeur à fixer par le gestionnaire du réseau.',
  rail_entretien: 'Coefficient dynamique : Φ3 pour un entretien normal (défaut de l\'EN 1991-2), Φ2 pour une voie soigneusement entretenue (§ 6.4.5.2).',
  rail_sw2: 'Lignes à trafic lourd : modèle SW/2 (150 kN/m sur 2 × 25 m), groupes gr16, gr17, gr26, gr27, γ = 1,20 (§ 6.3.3(4)).',
  rail_ballast: 'Épaisseur de ballast sous la traverse [m] : diffusion 4:1 (§ 6.3.6.3) et couverture h du § 6.4.5.4.',
  rail_traverse: 'Longueur des traverses de voie [m] (2,60 m pour des traverses béton monobloc courantes).',
  rail_hTrav: 'Hauteur des traverses [m] : comptée dans la couverture h (dessus de la dalle → dessus des traverses) qui réduit Φ au-delà de 1,00 m.',
  rail_V: 'Vitesse maximale de ligne au droit de l\'ouvrage [km/h] : force centrifuge (§ 6.5.1) ; au-delà de 200 km/h, analyse dynamique requise (§ 6.4.4), hors de PSIDA.',
  rail_r: 'Rayon en plan de la voie [m] : force centrifuge (§ 6.5.1) ; vide = voie en alignement droit.',
  nRetenue: 'Fascicule 61 : nombre de dispositifs de retenue (0 à 2) ; largeur chargeable Lc = Lr − 0,5 par dispositif.',
  classe: 'Fascicule 61 : classe du pont imposée (1, 2, 3) ; vide = déduite de la largeur roulable (≥ 7 m : 1ère classe).',
  hEdge: 'Chanfreins de l\'intrados : hauteur de la dalle au bord libre (joue) [m] ; vide = sans chanfrein. Réduit la largeur comprimée sur appuis.',
  joue: 'Largeur horizontale du chanfrein, du bord libre jusqu\'à l\'intrados plein [m].',
  withTherm: 'Gradient thermique EN 1991-1-5 (courbure imposée sur la poutre continue) et tassements aléatoires d\'appui (δ et −δ sur deux appuis voisins, module différé).',
  dT: 'Différence de température entre faces supérieure et inférieure : échauffement (+12 °C) puis refroidissement (−6 °C).',
  EI: 'Module E du béton [MPa] et inertie totale I de la section [m⁴] ; vide = 2b·h³/12. Servent aux effets thermiques, aux tassements, aux rotations d\'appui et à la largeur équivalente Be = 12 I/h³ du biais.',
  delta: 'Tassement aléatoire d\'un appui [m] (CHAMOA : 0,01 m).',
  phiFluage: 'Coefficient de fluage pour le module différé E/(1 + φ) utilisé pour les tassements.',
  fck: 'Résistance caractéristique du béton fck (EC2) ou fc28 (BAEL) [MPa] ; influence aussi l\'épaisseur du guide 1989 (× 0,87 B30, × 0,81 B35).',
  fyk: 'Limite d\'élasticité des aciers fyk (EC2) ou fe (BAEL) [MPa].',
  cover: 'Enrobage à l\'axe des aciers longitudinaux c [m] ; hauteur utile d = h − c (convention CHAMOA).',
  phi: 'Diamètres des aciers longitudinaux et transversaux [mm] pour le calcul d\'ouverture des fissures (EC2 7.3.4) et la hauteur utile transversale.',
  phiT: 'Diamètre des aciers transversaux [mm].',
  wk: 'Ouverture de fissure admissible sous ELS fréquent [mm] (EC2 7.3.1 : 0,3 mm en XC).',
  fiss: 'BAEL : fissuration peu nuisible, préjudiciable (σ̄s = min(2/3 fe ; max(0,5 fe ; 110√(η ft28))), BAEL 91 révisé 99 A.4.5,33) ou très préjudiciable (σ̄s = min(0,5 fe ; max(0,4 fe ; 90√(η ft28))), A.4.5,34).',
  tRev: 'Épaisseur du revêtement de chaussée pour la diffusion des roues à 45° jusqu\'au feuillet moyen [m].',
  psi: 'Angle de biais géométrique ψ entre l\'axe longitudinal (bords libres) et les lignes d\'appui, en grades : 100 = ouvrage droit, 80 = biais modéré (exemple CHAMOA), < 70 = hors domaine Guyon.',
  tirantAir: 'Hauteur libre entre la sous-face de la dalle et la voie franchie [m] : proportions des ouvertures (≤ 0,618 de la portée) et choix 3 / 4 travées.',
  typeDalle: 'Type de dalle pour l\'aide à la conception : automatique selon les portées (BA ≤ 15/18 m, BP au-delà), ou imposé.',
  Dabout: 'Diamètre du plus gros fer inférieur ancré par courbure au-delà de la ligne d\'appui [mm] : longueur d\'about ≥ 0,1 + 15 D (guide § 3.2).',
  rhoMax: 'Taux d\'armatures par face au-delà duquel la recherche d\'épaisseur considère la dalle trop ferraillée [%].',
  transDir: 'Ouvrage biais : direction des aciers transversaux pour l\'annexe 12A — parallèles aux lignes d\'appui (option 1 du guide, défaut CHAMOA) ou perpendiculaires aux bords libres (option 2).',
  nBearings: 'Nombre d\'appareils d\'appui par ligne d\'appui ; vide = environ un tous les 3 m de largeur (au moins 2).',
  xFixed: 'Abscisse du point fixe des déplacements (dilatation, retrait) [m] depuis C0 ; vide = milieu de l\'ouvrage (appareils tous libres).',
  epsSlow: 'Raccourcissement lent du tablier (retrait + fluage) pour la distorsion des appareils d\'appui (BA : ≈ 2,5·10⁻⁴).',
  dTu: 'Variation uniforme de température du tablier [°C] pour la distorsion des appareils d\'appui (α_T = 10⁻⁵/°C).',
  chamoaSign: 'Affiche M(x) avec la convention de CHAMOA / ST1 (moment positif = fibre supérieure tendue).',
  bp_epsR: 'Retrait final ε_r (BPEL 91 art. 2.1,51) : 1,5·10⁻⁴ climat très humide, 2·10⁻⁴ humide, 3·10⁻⁴ tempéré sec (valeur par défaut), 4·10⁻⁴ chaud et sec, 5·10⁻⁴ très sec ou désertique.',
  bp_sigma0: 'Tension à l\'origine σ_p0 [MPa] ; vide = min(0,8 f_prg ; 0,9 f_peg) (BPEL 91 art. 3.2).',
  bp_fcj: 'Résistance du béton à la mise en tension [MPa] ; vide = 0,8 f_c28 + 2.',
  bp_eSup: 'Distance de l\'axe du câble moyen à la fibre supérieure sur appuis [m] ; vide = enrobage + Ø/2 de la gaine + décalage du câble dans la gaine.',
  bp_eLow: 'Distance de l\'axe du câble moyen à la fibre inférieure en travée [m] ; vide = même règle que sur appuis.',
  ap_incl: 'Inclinaison de chaque file de pieux sur la verticale [°], comptée vers l\'extérieur de la fondation ; vide = pieux verticaux.',
  ap_profAssign: 'Sondage (profil pressiométrique) utilisé pour chaque ligne d\'appui, culées comprises ; la liste propose les noms « [SP…] » du champ Profils pressiométriques.',
  ap_eauLignes: 'Piles soumises au courant, aux embâcles et à l\'affouillement ; toutes cochées par défaut.',
  brgCul: 'Appareil d\'appui imposé sur les deux culées, désignation a×b×n(t+ts) en mm (ex. 250×300×3(10+3)) ; vide = plus petit appareil de la gamme vérifiant le prédimensionnement. Un appareil imposé est vérifié (bulletin technique n° 4, puis NF EN 1337-3 dans l\'onglet Appuis) et conservé même s\'il ne passe pas.',
  brgPile: 'Appareil d\'appui imposé sur toutes les piles, désignation a×b×n(t+ts) en mm (ex. 300×500×3(10+3)) ; vide = choix automatique.',
};

/** Applique les infobulles aux champs et construit la liste d'aide. */
export function applyHelp(form, listEl) {
  for (const [name, text] of Object.entries(HELP)) {
    const el = form.elements[name];
    if (!el) continue;
    el.title = text;
    const lab = el.closest('label, .fld'); if (lab) lab.title = text;
  }
  if (listEl) {
    const labelOf = name => { const el = form.elements[name]; const lab = el && el.closest('label, .fld'); const t = lab ? [...lab.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()) : null; return t ? t.textContent.trim() : name; };
    listEl.innerHTML = `<dl>${Object.keys(HELP).filter(n => form.elements[n]).map(n => `<dt>${esc(labelOf(n))}</dt><dd>${esc(HELP[n])}</dd>`).join('')}</dl>`;
  }
}

/** Lecture tolérante du formulaire (valeurs partielles ignorées). */
export function readGeometry(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  const spans = nums(d.spans).filter(v => v > 0);
  const width = +d.width > 0 ? +d.width : null, h = +d.h > 0 ? +d.h : null;
  const ov = nums(d.overhangs); const overhangs = [ov[0] || 0, ov[1] || 0];
  const rw = nums(d.roadway); const roadway = rw.length >= 2 ? { y1: rw[0], y2: rw[1] } : null;
  const footways = String(d.footways || '').split(';').map(t => nums(t)).filter(p => p.length >= 2).map(([a, b]) => ({ y1: a, y2: b }));
  const parseK = t => { const m = t.match(/k\s*([\d.]+)\s*\/\s*([\d.]+)/i); return m ? { kmin: +m[1], kmax: +m[2], rest: t.replace(m[0], '') } : { kmin: 1, kmax: 1, rest: t }; };
  const lines = String(d.lines || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const k = parseK(t); const [g, e] = k.rest.split('@').map(Number); return { g, e, kmin: k.kmin, kmax: k.kmax }; }).filter(l => Number.isFinite(l.g) && Number.isFinite(l.e));
  const bands = String(d.bands || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const k = parseK(t); const [q, r] = k.rest.split('sur'); const [a, b] = nums(r || ''); return { q: +q, y1: a, y2: b, kmin: k.kmin, kmax: k.kmax }; }).filter(b => Number.isFinite(b.q) && Number.isFinite(b.y1) && Number.isFinite(b.y2));
  const area = String(d.area || '').trim() ? +d.area : (width && h ? width * h : null);
  const chamfer = String(d.hEdge || '').trim() && String(d.joue || '').trim() ? { hEdge: +d.hEdge, joue: +d.joue } : null;
  const EIv = String(d.EI || '').split(',').map(t => t.trim());
  return { spans, width, h, overhangs, roadway, footways, lines, bands, ys: nums(d.ys), area, chamfer,
    psi: +d.psi > 0 ? +d.psi : 100, tirantAir: String(d.tirantAir || '').trim() ? +d.tirantAir : null, typeDalle: d.typeDalle || 'auto',
    Dabout: +d.Dabout || 25, transDir: d.transDir || 'appuis', nBearings: String(d.nBearings || '').trim() ? +d.nBearings : null, xFixed: String(d.xFixed || '').trim() ? +d.xFixed : null,
    fck: +d.fck, fyk: +d.fyk, cover: +d.cover, phi: +d.phi, phiT: +d.phiT, wk: +d.wk, fiss: d.fiss, tRev: +d.tRev, alpha: d.alpha, nu: +d.nu, nRetenue: +d.nRetenue, classe: String(d.classe || '').trim() ? +d.classe : null,
    withTherm: !!d.withTherm, dT: nums(d.dT), E: +EIv[0] || null, I: EIv[1] ? +EIv[1] : null, delta: +d.delta, phiFluage: +d.phiFluage, epsSlow: +d.epsSlow, dTu: +d.dTu,
    rail: parseRail(d) };
}

/** Cote horizontale avec texte. */
function dimH(x1, x2, y, text, opt = {}) {
  const c = opt.color || 'currentColor', dy = opt.above ? -5 : 14;
  return `<g stroke="${c}" stroke-width="0.8" fill="${c}"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/><line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}"/><text x="${(x1 + x2) / 2}" y="${y + dy}" text-anchor="middle" stroke="none" font-size="${opt.size || 12}">${esc(text)}</text></g>`;
}
function dimV(x, y1, y2, text, opt = {}) {
  const c = opt.color || 'currentColor';
  return `<g stroke="${c}" stroke-width="0.8" fill="${c}"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}"/><text x="${x + (opt.left ? -6 : 6)}" y="${(y1 + y2) / 2 + 4}" text-anchor="${opt.left ? 'end' : 'start'}" stroke="none" font-size="${opt.size || 12}">${esc(text)}</text></g>`;
}

/** Élévation : travées, appuis, abouts, épaisseur, hauteur libre, point fixe. */
export function elevationInputSVG(g) {
  const W = 1000, H = 320;
  if (!g.spans.length) return `<svg viewBox="0 0 ${W} 60" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="13" fill="currentColor"><text x="20" y="35">Saisir les portées pour voir l'élévation.</text></svg>`;
  const [aL, aR] = g.overhangs, L = g.spans.reduce((a, b) => a + b, 0), Ltot = L + aL + aR;
  const m = { l: 60, r: 110 }, usable = W - m.l - m.r;
  const sx = x => m.l + (x + aL) / Ltot * usable;
  const scale = usable / Ltot;
  const h = g.h || 0.5, hPx = Math.max(12, Math.min(40, h * scale * 2.5));
  const yTop = 118;
  const x0 = [0]; g.spans.forEach(v => x0.push(x0[x0.length - 1] + v));
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" role="img" aria-label="Élévation">`;
  s += `<text x="${m.l}" y="22" font-weight="600">Élévation (coupe longitudinale suivant l'axe)</text>`;
  s += `<text x="${m.l}" y="40" opacity="0.75">${g.spans.length} travée${g.spans.length > 1 ? 's' : ''} : ${g.spans.map(v => fr(v)).join(' + ')} = ${fr(L)} m entre appuis extrêmes${aL || aR ? ` ; abouts ${fr(aL)} / ${fr(aR)} m ; longueur totale ${fr(Ltot)} m` : ''}</text>`;
  // dalle
  s += `<rect x="${sx(-aL)}" y="${yTop}" width="${sx(L + aR) - sx(-aL)}" height="${hPx}" fill="var(--slab, #9aa5b8)" stroke="currentColor" stroke-width="1.2"/>`;
  // abouts cotés au-dessus
  if (aL > 0) s += dimH(sx(-aL), sx(0), yTop - 14, `about ${fr(aL)} m`, { above: true });
  if (aR > 0) s += dimH(sx(L), sx(L + aR), yTop - 14, `about ${fr(aR)} m`, { above: true });
  // appuis
  x0.forEach((x, i) => {
    const X = sx(x), isEnd = i === 0 || i === x0.length - 1;
    s += `<path d="M${X},${yTop + hPx} l-9,16 h18 z" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
    s += `<rect x="${X - (isEnd ? 14 : 9)}" y="${yTop + hPx + 16}" width="${isEnd ? 28 : 18}" height="${isEnd ? 34 : 40}" fill="var(--footway, #dfe3ea)" stroke="currentColor" stroke-width="0.8"/>`;
    s += `<text x="${X}" y="${yTop + hPx + 70}" text-anchor="middle" font-weight="600">${i === 0 ? 'C0' : i === x0.length - 1 ? 'C' + i : 'P' + i}</text>`;
    s += `<text x="${X}" y="${yTop + hPx + 84}" text-anchor="middle" opacity="0.7" font-size="11">x = ${fr(x)}</text>`;
  });
  // cotes des travées
  const yc = yTop + hPx + 108;
  for (let j = 0; j < g.spans.length; j++) s += dimH(sx(x0[j]), sx(x0[j + 1]), yc, `T${j + 1} = ${fr(g.spans[j])} m`);
  // épaisseur
  s += dimV(sx(L + aR) + 14, yTop, yTop + hPx, `h = ${fr(g.h || 0, 3)} m`);
  // hauteur libre
  if (g.tirantAir) {
    const yG = yTop + hPx + 56;
    s += `<line x1="${sx(x0[0]) + 20}" y1="${yG}" x2="${sx(x0[x0.length - 1]) - 20}" y2="${yG}" stroke="currentColor" stroke-dasharray="4 3" opacity="0.6"/>`;
    const jm = Math.floor(g.spans.length / 2), xm = sx((x0[jm] + x0[jm + 1]) / 2);
    s += dimV(xm, yTop + hPx, yG, `hauteur libre ${fr(g.tirantAir)} m`, { color: 'var(--acc, #0b5fa5)' });
  }
  // point fixe
  const xf = g.xFixed === null || g.xFixed === undefined ? L / 2 : g.xFixed;
  s += `<path d="M${sx(xf)},${yTop - 30} l-6,-10 h12 z" fill="var(--acc, #0b5fa5)"/><line x1="${sx(xf)}" y1="${yTop - 30}" x2="${sx(xf)}" y2="${yTop}" stroke="var(--acc, #0b5fa5)" stroke-dasharray="3 3"/>`;
  s += `<text x="${sx(xf)}" y="${yTop - 44}" text-anchor="middle" fill="var(--acc, #0b5fa5)">point fixe x = ${fr(xf)} m (dilatation ${fr(Math.max(xf, L - xf))} m)</text>`;
  s += `</svg>`;
  return s;
}

/** Coupe transversale : dalle et chanfreins, chaussée, trottoirs, charges permanentes, voies, appareils d'appui, ordonnées. */
export function crossSectionInputSVG(g) {
  const W = 1000, H = 440;
  if (!g.width || !g.h) return `<svg viewBox="0 0 ${W} 60" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="13" fill="currentColor"><text x="20" y="35">Saisir la largeur et l'épaisseur pour voir la coupe.</text></svg>`;
  const b = g.width / 2, h = g.h;
  const m = { l: 70, r: 110 }, usable = W - m.l - m.r;
  const sy = y => m.l + (y + b) / (2 * b) * usable;
  const scale = usable / (2 * b);
  const hPx = Math.max(18, Math.min(70, h * scale));
  const yTop = 210;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" role="img" aria-label="Coupe transversale">`;
  s += `<defs><marker id="arrS" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--warn, #9a5b00)"/></marker><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--warn, #9a5b00)" stroke-width="1"/></pattern></defs>`;
  s += `<text x="${m.l}" y="22" font-weight="600">Coupe transversale droite (perpendiculaire aux bords libres)</text>`;
  const rw = g.roadway;
  const lanes = rw ? notionalLanes(rw.y2 - rw.y1) : null;
  let classe = null; try { classe = rw ? (g.classe || classePont(rw.y2 - rw.y1)) : null; } catch (e) { classe = null; }
  s += `<text x="${m.l}" y="40" opacity="0.75">2b = ${fr(g.width)} m, h = ${fr(h, 3)} m, aire ${fr(g.area || g.width * h, 3)} m²${rw ? ` ; chaussée ${fr(rw.y2 - rw.y1)} m → ${lanes.n} voie${lanes.n > 1 ? 's' : ''} EN 1991-2 de ${fr(lanes.wl)} m${lanes.wr > 0.01 ? ` + ${fr(lanes.wr)} m résiduel` : ''}${classe ? `, pont de classe ${classe} (Fasc. 61)` : ''}` : ''}</text>`;
  // bandes de charges permanentes (au-dessus de la chaussée)
  g.bands.forEach((bd, i) => {
    const X1 = sy(bd.y1), X2 = sy(bd.y2), yb = yTop - 24 - 18 * i;
    s += `<rect x="${X1}" y="${yb}" width="${X2 - X1}" height="10" fill="url(#hatch)" stroke="var(--warn, #9a5b00)" stroke-width="0.8"/>`;
    s += `<text x="${(X1 + X2) / 2}" y="${yb - 3}" text-anchor="middle" fill="var(--warn, #9a5b00)" font-size="11">q = ${fr(bd.q)} kN/m² sur [${fr(bd.y1)} ; ${fr(bd.y2)}]${bd.kmin !== 1 || bd.kmax !== 1 ? ` (k ${bd.kmin}/${bd.kmax})` : ''}</text>`;
  });
  // charges linéiques
  // charges linéiques : étiquettes étagées pour éviter les chevauchements (charges voisines)
  const yLines = Math.max(70, yTop - 28 - 18 * g.bands.length - 24);
  const labels = g.lines.map((l, i) => {
    const text = `g = ${fr(l.g)} kN/m @ y = ${fr(l.e)}${l.kmin !== 1 || l.kmax !== 1 ? ` (k ${l.kmin}/${l.kmax})` : ''}`;
    const X = sy(l.e), wTxt = text.length * 6.2;
    const anchor = X < 160 ? 'start' : X > W - 160 ? 'end' : 'middle';
    const x1 = anchor === 'start' ? X : anchor === 'end' ? X - wTxt : X - wTxt / 2, x2 = x1 + wTxt;
    return { i, l, text, X, anchor, x1, x2, level: 0 };
  }).sort((p, q) => p.X - q.X);
  const levels = [];
  for (const lb of labels) {
    let lv = 0;
    while (levels[lv] && levels[lv].some(o => !(lb.x2 < o.x1 - 6 || lb.x1 > o.x2 + 6))) lv++;
    (levels[lv] = levels[lv] || []).push(lb); lb.level = lv;
  }
  for (const lb of labels) {
    const yl = yLines - lb.level * 16;
    s += `<line x1="${lb.X}" y1="${yl}" x2="${lb.X}" y2="${yTop - 12}" stroke="var(--warn, #9a5b00)" stroke-width="1.6" marker-end="url(#arrS)"/>`;
    s += `<text x="${lb.X}" y="${yl - 4}" text-anchor="${lb.anchor}" fill="var(--warn, #9a5b00)" font-size="11">${esc(lb.text)}</text>`;
  }
  // trottoirs
  for (const fw of g.footways) {
    s += `<rect x="${sy(fw.y1)}" y="${yTop - 10}" width="${sy(fw.y2) - sy(fw.y1)}" height="10" fill="var(--footway, #c7ccd6)" stroke="currentColor" stroke-width="0.8"/>`;
    s += `<text x="${(sy(fw.y1) + sy(fw.y2)) / 2}" y="${yTop + hPx + 58}" text-anchor="middle" font-size="11" opacity="0.8">trottoir [${fr(fw.y1)} ; ${fr(fw.y2)}]</text>`;
  }
  // chaussée et voies
  if (rw) {
    s += `<rect x="${sy(rw.y1)}" y="${yTop - 4}" width="${sy(rw.y2) - sy(rw.y1)}" height="4" fill="var(--road, #4d5566)"/>`;
    for (let i = 1; i < lanes.n; i++) { const X = sy(rw.y1 + i * lanes.wl); s += `<line x1="${X}" y1="${yTop - 9}" x2="${X}" y2="${yTop - 1}" stroke="var(--acc, #0b5fa5)" stroke-dasharray="2 2"/>`; }
    if (lanes.wr > 0.01) { const X = sy(rw.y1 + lanes.n * lanes.wl); s += `<line x1="${X}" y1="${yTop - 9}" x2="${X}" y2="${yTop - 1}" stroke="var(--acc, #0b5fa5)" stroke-dasharray="2 2"/>`; }
    s += dimH(sy(rw.y1), sy(rw.y2), yTop + hPx + 28, `chaussée y ∈ [${fr(rw.y1)} ; ${fr(rw.y2)}] = ${fr(rw.y2 - rw.y1)} m`, { color: 'var(--acc, #0b5fa5)' });
  }
  // dalle (avec chanfreins)
  if (g.chamfer && g.chamfer.hEdge > 0 && g.chamfer.hEdge < h && g.chamfer.joue > 0 && g.chamfer.joue < b) {
    const hE = g.chamfer.hEdge * (hPx / h), j = g.chamfer.joue * scale;
    s += `<polygon points="${sy(-b)},${yTop} ${sy(b)},${yTop} ${sy(b)},${yTop + hE} ${sy(b) - j},${yTop + hPx} ${sy(-b) + j},${yTop + hPx} ${sy(-b)},${yTop + hE}" fill="var(--slab, #9aa5b8)" stroke="currentColor" stroke-width="1.2"/>`;
    s += dimV(sy(-b) - 14, yTop, yTop + hE, `${fr(g.chamfer.hEdge)} m`, { size: 11, left: true });
    s += dimH(sy(b) - j, sy(b), yTop + hPx + 14, `joue ${fr(g.chamfer.joue)} m`, { size: 11 });
  } else {
    s += `<rect x="${sy(-b)}" y="${yTop}" width="${sy(b) - sy(-b)}" height="${hPx}" fill="var(--slab, #9aa5b8)" stroke="currentColor" stroke-width="1.2"/>`;
  }
  s += dimV(sy(b) + 14, yTop, yTop + hPx, `h = ${fr(h, 3)} m`);
  // aciers et enrobage (indicatif)
  if (g.cover > 0) {
    const cPx = Math.max(4, Math.min(hPx * 0.3, g.cover * (hPx / h)));
    for (let k = 0; k < 9; k++) { const X = sy(-b + (k + 0.5) * 2 * b / 9); s += `<circle cx="${X}" cy="${yTop + hPx - cPx}" r="2" fill="currentColor"/><circle cx="${X}" cy="${yTop + cPx}" r="2" fill="currentColor"/>`; }
    s += `<text x="${sy(-b) + 8}" y="${yTop + hPx / 2 + 4}" font-size="11" opacity="0.85">aciers : c = ${fr(g.cover * 100)} cm, φ ${g.phi || '?'} / ${g.phiT || '?'} mm</text>`;
  }
  // appareils d'appui
  const nb = g.nBearings || Math.max(2, Math.round(g.width / 3));
  const e0 = Math.min(1, b / 3), pitch = nb > 1 ? (2 * b - 2 * e0) / (nb - 1) : 0;
  for (let k = 0; k < nb; k++) { const X = sy(-b + e0 + k * pitch); s += `<rect x="${X - 9}" y="${yTop + hPx + 2}" width="18" height="7" fill="var(--acc, #0b5fa5)" opacity="0.8"/>`; }
  s += `<text x="${sy(-b)}" y="${yTop + hPx + 20}" font-size="11" fill="var(--acc, #0b5fa5)">${nb} appareils d'appui par ligne (schématique)</text>`;
  // axe y et ordonnées de calcul
  const yAx = yTop + hPx + 78;
  s += `<line x1="${sy(-b)}" y1="${yAx}" x2="${sy(b)}" y2="${yAx}" stroke="currentColor" stroke-width="0.8"/>`;
  for (const y of (g.ys.length ? g.ys : [-b, 0, b])) { if (Math.abs(y) > b + 1e-9) continue; const X = sy(y); s += `<line x1="${X}" y1="${yAx - 4}" x2="${X}" y2="${yAx + 4}" stroke="currentColor" stroke-width="0.8"/><text x="${X}" y="${yAx + 17}" text-anchor="middle" font-size="11">${fr(y)}</text>`; }
  s += dimH(sy(-b), sy(b), yAx + 38, `2b = ${fr(g.width)} m (y de −b = ${fr(-b)} à +b = ${fr(b)}, axe y = 0)`);
  s += `</svg>`;
  return s;
}

/** Vue en plan : bords libres, lignes d'appui biaises, angle ψ, direction des aciers. */
export function planSVG(g) {
  const W = 1000, H = 260;
  if (!g.spans.length || !g.width) return '';
  const [aL, aR] = g.overhangs, L = g.spans.reduce((a, b) => a + b, 0), b = g.width / 2;
  const psi = g.psi, a = psi * GR, cot = Math.abs(psi - 100) < 1e-9 ? 0 : Math.cos(a) / Math.sin(a);
  // repère plan : x le long de l'axe (horizontal), y transversal (vertical, vers le haut) ; lignes d'appui inclinées : x = x_i + y·cot ψ
  const m = { l: 60, r: 60, t: 60, b: 60 };
  const xmin = -aL - b * Math.abs(cot), xmax = L + aR + b * Math.abs(cot);
  const sxp = (W - m.l - m.r) / (xmax - xmin), syp = (H - m.t - m.b) / (2 * b);
  const sc = Math.min(sxp, syp * 2.2); // compression verticale acceptée (plan allongé)
  const sx = x => m.l + (x - xmin) * sc, sy = y => (H + m.t - m.b) / 2 - y * Math.min(sc, syp);
  const lineAt = (x, y) => x + y * cot;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" role="img" aria-label="Vue en plan">`;
  s += `<text x="${m.l}" y="22" font-weight="600">Vue en plan — biais ψ = ${fr(psi)} gr${psi >= 100 ? ' (ouvrage droit)' : ''}</text>`;
  s += `<text x="${m.l}" y="40" opacity="0.75">ψ = angle entre l'axe longitudinal (bords libres) et les lignes d'appui ; portées mesurées suivant l'axe (longueurs biaises).</text>`;
  // contour (parallélogramme : abouts parallèles aux lignes d'appui)
  const pts = [[lineAt(-aL, b), b], [lineAt(L + aR, b), b], [lineAt(L + aR, -b), -b], [lineAt(-aL, -b), -b]];
  s += `<polygon points="${pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')}" fill="var(--slab, #9aa5b8)" fill-opacity="0.5" stroke="currentColor" stroke-width="1.2"/>`;
  // voies ferrées (pont-dalle sous rail) ou chaussée
  if (g.rail) {
    g.rail.voies.forEach((yv, i) => {
      s += `<line x1="${sx(lineAt(-aL, yv))}" y1="${sy(yv)}" x2="${sx(lineAt(L + aR, yv))}" y2="${sy(yv)}" stroke="var(--acc, #0b5fa5)" stroke-width="1.4" stroke-dasharray="12 4 2 4"/>`;
      for (const d of [-0.75, 0.75]) s += `<line x1="${sx(lineAt(-aL, yv + d))}" y1="${sy(yv + d)}" x2="${sx(lineAt(L + aR, yv + d))}" y2="${sy(yv + d)}" stroke="currentColor" stroke-width="0.9"/>`;
      s += `<text x="${sx(lineAt(-aL, yv)) + 6}" y="${sy(yv) - 4}" font-size="11" fill="var(--acc, #0b5fa5)">voie ${i + 1}</text>`;
    });
  } else if (g.roadway) {
    const r = g.roadway, p2 = [[lineAt(-aL, r.y2), r.y2], [lineAt(L + aR, r.y2), r.y2], [lineAt(L + aR, r.y1), r.y1], [lineAt(-aL, r.y1), r.y1]];
    s += `<polygon points="${p2.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')}" fill="var(--road, #4d5566)" fill-opacity="0.25" stroke="none"/>`;
  }
  // lignes d'appui
  const x0 = [0]; g.spans.forEach(v => x0.push(x0[x0.length - 1] + v));
  x0.forEach((x, i) => {
    s += `<line x1="${sx(lineAt(x, -b))}" y1="${sy(-b)}" x2="${sx(lineAt(x, b))}" y2="${sy(b)}" stroke="var(--acc, #0b5fa5)" stroke-width="1.6" stroke-dasharray="${i === 0 || i === x0.length - 1 ? '' : '6 3'}"/>`;
    s += `<text x="${sx(lineAt(x, -b))}" y="${sy(-b) + 16}" text-anchor="middle" fill="var(--acc, #0b5fa5)" font-weight="600">${i === 0 ? 'C0' : i === x0.length - 1 ? 'C' + i : 'P' + i}</text>`;
  });
  // axe longitudinal
  s += `<line x1="${sx(lineAt(-aL, 0) - 1)}" y1="${sy(0)}" x2="${sx(lineAt(L + aR, 0) + 1)}" y2="${sy(0)}" stroke="currentColor" stroke-dasharray="8 4 2 4" stroke-width="0.8"/>`;
  s += `<text x="${sx(lineAt(L + aR, 0)) + 6}" y="${sy(0) + 4}" font-size="11">axe</text>`;
  // angle ψ en C0
  if (psi < 100) {
    const X = sx(0), Y = sy(0), r = 40, aDeg = psi * 0.9;
    const ex = X + r * Math.cos(-aDeg * Math.PI / 180), ey = Y + r * Math.sin(-aDeg * Math.PI / 180) * (Math.min(sc, syp) / sc);
    s += `<path d="M${X + r},${Y} A${r},${r} 0 0 0 ${ex},${ey}" fill="none" stroke="var(--warn, #9a5b00)" stroke-width="1.2"/>`;
    s += `<text x="${X + r + 6}" y="${Y - 10}" fill="var(--warn, #9a5b00)">ψ = ${fr(psi)} gr</text>`;
  }
  // aciers transversaux (quelques traits dans la travée centrale) et longitudinaux
  const jm = Math.floor(g.spans.length / 2), xc = (x0[jm] + x0[jm + 1]) / 2;
  for (let k = -2; k <= 2; k++) {
    const xk = xc + k * Math.min(1.2, g.spans[jm] / 6);
    const cotBars = g.transDir === 'perp' ? 0 : cot;
    s += `<line x1="${sx(xk + (-b + 0.4) * cotBars)}" y1="${sy(-b + 0.4)}" x2="${sx(xk + (b - 0.4) * cotBars)}" y2="${sy(b - 0.4)}" stroke="currentColor" stroke-width="0.8" opacity="0.6"/>`;
  }
  for (let k = -1; k <= 1; k++) { const yk = k * b * 0.5; s += `<line x1="${sx(lineAt(x0[jm], yk) + 0.6)}" y1="${sy(yk)}" x2="${sx(lineAt(x0[jm + 1], yk) - 0.6)}" y2="${sy(yk)}" stroke="currentColor" stroke-width="0.8" opacity="0.6"/>`; }
  s += `<text x="${sx(xc)}" y="${sy(-b) + 34}" text-anchor="middle" font-size="11" opacity="0.8">aciers longitudinaux ∥ bords libres, transversaux ${g.transDir === 'perp' ? '⟂ bords libres' : '∥ lignes d\'appui'} (traits dans la travée centrale)</text>`;
  s += `</svg>`;
  return s;
}

/** Résumé en clair des valeurs saisies. */
export function summaryHTML(g) {
  const items = [];
  if (g.spans.length) {
    const L = g.spans.reduce((a, b) => a + b, 0);
    items.push(`<b>Travure</b> : ${g.spans.length} travée${g.spans.length > 1 ? 's' : ''} de ${g.spans.map(v => fr(v)).join(' / ')} m (${fr(L)} m entre appuis extrêmes)${g.overhangs.some(v => v > 0) ? `, abouts ${fr(g.overhangs[0])} et ${fr(g.overhangs[1])} m` : ', sans abouts'} ; ${g.spans.length + 1} lignes d'appui.`);
  }
  if (g.width && g.h) items.push(`<b>Dalle</b> : largeur 2b = ${fr(g.width)} m (b = ${fr(g.width / 2)}), épaisseur h = ${fr(g.h, 3)} m, aire ${fr(g.area || g.width * g.h, 3)} m²${g.chamfer ? `, chanfreins de ${fr(g.chamfer.hEdge)} m au bord sur ${fr(g.chamfer.joue)} m` : ''} ; poids propre ${fr(25 * (g.area || g.width * g.h), 1)} kN/m.`);
  if (g.rail) {
    const R = g.rail, n = R.voies.length;
    items.push(`<b>Voies ferrées</b> (pont-dalle sous rail, EN 1991-2 section 6) : ${n} voie${n > 1 ? 's' : ''} d'axe${n > 1 ? 's' : ''} y = ${R.voies.map(v => fr(v)).join(' et ')} m${n > 1 ? ` (entraxe ${fr(R.entraxe)} m)` : ''} ; α = ${fr(R.alpha)}, ${R.entretien === 'soigne' ? 'Φ2' : 'Φ3'}${R.sw2 ? ', SW/2' : ''} ; ballast ${fr(R.ballast)} m sous traverses de ${fr(R.longueurTraverse)} × ${fr(R.hTraverse)} m${R.V > 0 ? ` ; V = ${fr(R.V)} km/h` : ''}${R.rayon > 0 ? `, R = ${fr(R.rayon)} m` : ''}. Pas de charges routières.`);
  } else if (g.roadway) {
    const w = g.roadway.y2 - g.roadway.y1, ln = notionalLanes(w);
    let cl = ''; try { cl = `, classe ${g.classe || classePont(w)} (Fascicule 61, largeur roulable ${fr(w)} m${g.nRetenue ? `, ${g.nRetenue} dispositif(s) de retenue → Lc = ${fr(w - 0.5 * g.nRetenue)} m` : ''})`; } catch (e) { /* ignore */ }
    items.push(`<b>Chaussée</b> : de y = ${fr(g.roadway.y1)} à ${fr(g.roadway.y2)} m (${fr(w)} m) → ${ln.n} voie${ln.n > 1 ? 's' : ''} conventionnelle${ln.n > 1 ? 's' : ''} de ${fr(ln.wl)} m${ln.wr > 0.01 ? ` et ${fr(ln.wr)} m d'aire résiduelle` : ''} (EN 1991-2, ${g.alpha === 'FR2' ? 'α classe 2' : g.alpha === 'FR1' ? 'α classe 1' : 'α = 1'})${cl}.`);
  }
  if (g.footways.length) items.push(`<b>Trottoirs</b> : ${g.footways.map(f => `[${fr(f.y1)} ; ${fr(f.y2)}] (${fr(f.y2 - f.y1)} m)`).join(', ')}.`);
  if (g.lines.length || g.bands.length) items.push(`<b>Charges permanentes</b> : ${[...g.lines.map(l => `${fr(l.g)} kN/m en y = ${fr(l.e)}${l.kmin !== 1 || l.kmax !== 1 ? ` (k ${l.kmin}/${l.kmax})` : ''}`), ...g.bands.map(b => `${fr(b.q)} kN/m² sur [${fr(b.y1)} ; ${fr(b.y2)}] = ${fr(b.q * (b.y2 - b.y1), 1)} kN/m${b.kmin !== 1 || b.kmax !== 1 ? ` (k ${b.kmin}/${b.kmax})` : ''}`)].join(' ; ')} ; total ${fr(g.lines.reduce((a, l) => a + l.g, 0) + g.bands.reduce((a, b) => a + b.q * (b.y2 - b.y1), 0), 1)} kN/m en plus du poids propre.`);
  items.push(`<b>Biais</b> : ψ = ${fr(g.psi)} gr${g.psi >= 100 ? ' (droit)' : ` ; aciers transversaux ${g.transDir === 'perp' ? 'perpendiculaires aux bords libres' : 'parallèles aux lignes d\'appui'}`}${g.tirantAir ? ` ; hauteur libre ${fr(g.tirantAir)} m` : ''}.`);
  if (g.fck) items.push(g.rail ? `<b>Matériaux</b> : C${g.fck}/${g.fck + 10}, aciers ${g.fyk} MPa, enrobage à l'axe ${fr(g.cover * 100)} cm, φ ${g.phi} / ${g.phiT} mm, wk ≤ ${g.wk} mm (Eurocodes).`
    : `<b>Matériaux</b> : C${g.fck}/${g.fck + 10} (fc28 = ${g.fck} MPa), aciers ${g.fyk} MPa, enrobage à l'axe ${fr(g.cover * 100)} cm, φ ${g.phi} / ${g.phiT} mm, wk ≤ ${g.wk} mm, fissuration BAEL ${g.fiss} ; revêtement ${fr(g.tRev)} m.`);
  items.push(`<b>Modèle</b> : ν = ${g.nu}, ordonnées y = ${g.ys.map(v => fr(v)).join(', ')} ; ${g.withTherm ? `gradient ${g.dT[0] ?? 12} / ${g.dT[1] ?? -6} °C et tassements ${fr((g.delta || 0) * 100)} cm (E = ${g.E || 34000} MPa${g.I ? `, I = ${g.I} m⁴` : ''})` : 'sans gradient thermique ni tassements'}.`);
  items.push(`<b>Appareils d'appui</b> : ${g.nBearings || Math.max(2, Math.round((g.width || 0) / 3))} par ligne, point fixe ${g.xFixed === null ? 'au milieu' : `à x = ${fr(g.xFixed)} m`}, ε = ${g.epsSlow}, ΔT = ${g.dTu} °C.`);
  return `<ul class="checks">${items.map(t => `<li>${t}</li>`).join('')}</ul>`;
}

/** Vue en plan des zones de ferraillage (chevêtres, extensions, bords libres, angles) — guide § 3.4.4 à 3.4.6. */
export function zoningPlanSVG(g, z) {
  const W = 1000, H = 300;
  const [aL, aR] = g.overhangs, L = g.spans.reduce((a, b) => a + b, 0), b = g.width / 2;
  const psi = g.psi, a = psi * GR, cot = Math.abs(psi - 100) < 1e-9 ? 0 : Math.cos(a) / Math.sin(a);
  const m = { l: 60, r: 60, t: 50, b: 70 };
  const xmin = -aL - b * Math.abs(cot), xmax = L + aR + b * Math.abs(cot);
  const sxp = (W - m.l - m.r) / (xmax - xmin), syp = (H - m.t - m.b) / (2 * b);
  const sc = Math.min(sxp, syp * 2.2);
  const sx = x => m.l + (x - xmin) * sc, sy = y => (H + m.t - m.b) / 2 - y * Math.min(sc, syp);
  const lineAt = (x, y) => x + y * cot;
  const poly = (x1, x2, y1, y2) => [[lineAt(x1, y2), y2], [lineAt(x2, y2), y2], [lineAt(x2, y1), y1], [lineAt(x1, y1), y1]].map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ');
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" role="img" aria-label="Zonage">`;
  s += `<text x="${m.l}" y="22" font-weight="600">Zonage du ferraillage (vue en plan) — chevêtres incorporés, extensions, chaînage des bords libres, angles</text>`;
  s += `<polygon points="${poly(-aL, L + aR, -b, b)}" fill="var(--slab, #9aa5b8)" fill-opacity="0.35" stroke="currentColor" stroke-width="1.2"/>`;
  for (const zz of z.zones) s += `<polygon points="${poly(zz.x1, zz.x2, -b, b)}" fill="${zz.kind === 'chevetre' ? 'var(--warn, #9a5b00)' : 'var(--acc, #0b5fa5)'}" fill-opacity="${zz.kind === 'chevetre' ? 0.45 : 0.2}" stroke="none"/>`;
  // chaînage des bords libres (largeur h)
  for (const yb of [b, -b]) s += `<polygon points="${poly(-aL, L + aR, yb - Math.sign(yb) * g.h, yb)}" fill="none" stroke="var(--warn, #9a5b00)" stroke-dasharray="5 3" stroke-width="1.2"/>`;
  // angles (carrés 1,5 h)
  const ca = 1.5 * g.h;
  for (const [x, dir] of [[-aL, 1], [L + aR, -1]]) for (const yb of [b, -b]) s += `<polygon points="${poly(dir > 0 ? x : x - ca, dir > 0 ? x + ca : x, yb - Math.sign(yb) * ca, yb)}" fill="var(--warn, #9a5b00)" fill-opacity="0.6"/>`;
  // lignes d'appui
  const x0 = [0]; g.spans.forEach(v => x0.push(x0[x0.length - 1] + v));
  x0.forEach((x, i) => { s += `<line x1="${sx(lineAt(x, -b))}" y1="${sy(-b)}" x2="${sx(lineAt(x, b))}" y2="${sy(b)}" stroke="currentColor" stroke-width="1.4"/><text x="${sx(lineAt(x, -b))}" y="${sy(-b) + 16}" text-anchor="middle" font-weight="600">${i === 0 ? 'C0' : i === x0.length - 1 ? 'C' + i : 'P' + i}</text>`; });
  s += `<g font-size="11"><rect x="${m.l}" y="${H - 34}" width="14" height="10" fill="var(--warn, #9a5b00)" fill-opacity="0.45"/><text x="${m.l + 18}" y="${H - 25}">chevêtre incorporé</text><rect x="${m.l + 150}" y="${H - 34}" width="14" height="10" fill="var(--acc, #0b5fa5)" fill-opacity="0.2"/><text x="${m.l + 168}" y="${H - 25}">extension de chevêtre</text><rect x="${m.l + 320}" y="${H - 34}" width="14" height="10" fill="none" stroke="var(--warn, #9a5b00)" stroke-dasharray="4 2"/><text x="${m.l + 338}" y="${H - 25}">chaînage des bords libres (largeur h, ≥ 0,9 ‰)</text><rect x="${m.l + 620}" y="${H - 34}" width="14" height="10" fill="var(--warn, #9a5b00)" fill-opacity="0.6"/><text x="${m.l + 638}" y="${H - 25}">angles (quadrillage renforcé)</text></g>`;
  s += `</svg>`;
  return s;
}
