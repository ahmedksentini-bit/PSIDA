/**
 * Pont-dalle sous rail (mode « trafic ferroviaire ») : section « Charges ferroviaires » de l'interface et note de calcul
 * dédiée (même modèle de blocs que note.js : titres, paragraphes, tableaux, commentaires, figures), sans dépendance au DOM.
 * Les articles cités sont ceux de la NF EN 1991-2 (section 6) et de la NF EN 1990/A1 (annexe A2) ; aucun texte de la
 * norme n'est reproduit.
 */
import { MENTION, PARAMETRES_REFERENTIEL, superstructureVoie } from '../src/loads_rail.js';
import { guideCrossSectionSVG } from './guide_schema.js';
import { deformationsBlocks, deformationsHTML } from './rail_deformations_view.js';
import { supportsBlocks, waterBlocks } from './supports_view.js';
import { seismicBlocks } from './seismic_note.js';

const F = (v, n = 1) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F2 = v => F(v, 2), F3 = v => F(v, 3);
const CM = v => F(v * 1e4, 1);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Libellé court des groupes (graphiques, sélecteurs). */
export const RAIL_COURT = { rail1: '1 voie (LM71/SW0)', rail2: '2 voies (LM71/SW0)', sw2: 'SW/2', sw2b: 'SW/2 + LM71' };

/** Éléments hors du périmètre du calcul ferroviaire du pont-dalle, signalés dans l'interface et la note. */
export const HORS_PERIMETRE = [
  'Analyse dynamique (§ 6.4.6 : HSLM, trains réels, accélération du tablier, EN 1990 A2.4.4.2.1) lorsque l\'organigramme de la figure 6.9 la requiert ; effets du vent et du gradient thermique transversal sur la déformation transversale.',
  'Interaction voie-ouvrage complète (annexe G, ou analyse selon § 6.5.4.2 à 6.5.4.5) lorsque la méthode simplifiée du § 6.5.4.6.1 ne s\'applique pas ; contraintes additionnelles dans les rails dans ce cas ; chocs sur les piles. Choix des appareils d\'appui (règles de 1989) et inégalité de répartition entre les appareils d\'une ligne (PSI-DA 68) : règles établies pour les charges routières, appliquées aux réactions ferroviaires.',
  'Fatigue sous trafic ferroviaire (§ 6.9 et annexe D ; EN 1992-2 annexe NN pour les ponts-rails).',
  'Murs garde-ballast et éléments locaux proches de la voie (§ 6.3.6.4(3)) ; effets locaux des charges de roue sur la dalle.',
  'Stabilité transversale sous train à vide (gr15, § 6.3.4) et actions de déraillement (§ 6.7.1) : situations non traitées.',
  'Fascicule 61 / BAEL et dalle précontrainte (PSI-DP) : sans objet sous charges ferroviaires dans PSIDA.',
];

/** Lignes de données ferroviaires (tableau « Grandeur | Valeur | Référence »). */
function lignesDonnees(st) {
  const r = st.rail, R = r.params, dyn = r.dyn, L = r.LPhi;
  const voies = r.voies.map(y => F2(y)).join(' et ');
  return [
    ['Voies portées', `${r.nV} voie(s), axe(s) en y = ${voies} m`, ''],
    ['Coefficient α des charges classifiées', `${F2(R.alpha)} (LM71 et SW/0 ; SW/2 sans α)`, '§ 6.3.2(3)P'],
    ['Modèles verticaux', `LM71 : 4 × ${F0(250 * R.alpha)} kN à 1,60 m et ${F1(80 * R.alpha)} kN/m${r.continu ? ` ; SW/0 : ${F1(133 * R.alpha)} kN/m sur 2 × 15 m séparés de 5,30 m (dalle continue)` : ' (SW/0 sans objet : travée indépendante, note 2 du tableau 6.11)'}${R.sw2 ? ' ; SW/2 : 150 kN/m sur 2 × 25 m séparés de 7,00 m' : ''}`, '§ 6.3.2, § 6.3.3, tableau 6.1'],
    ['Longueur déterminante L_Φ', `${F2(L.LPhi)} m — ${r.continu ? `k · L_m = ${F1(L.k)} × ${F2(L.Lm)} m, au moins max L_i` : 'portée de la travée'}`, `tableau 6.2, cas ${r.continu ? '5.2' : '5.1'}`],
    ['Coefficient dynamique', `${dyn.nom} = ${F3(dyn.brut)} (${dyn.entretien === 'soigne' ? 'voie soigneusement entretenue' : 'entretien normal'})`, '§ 6.4.5.2, éq. (6.4) / (6.5)'],
    ['Couverture h (dessus de dalle → dessus des traverses)', `${F2(r.couverture)} m → Φ retenu = ${F3(r.phi)}${r.couverture > 1 ? ' (réduit)' : ' (pas de réduction, h ≤ 1,00 m)'}`, '§ 6.4.5.4'],
    ['Bande de répartition au feuillet moyen', `b_w = ℓ_t + 2 e_b/4 + h = ${F2(R.longueurTraverse)} + 2 × ${F2(R.ballast)}/4 + ${F2(r.diffusion.h)} = ${F2(r.diffusion.bw)} m`, '§ 6.3.6.3, figure 6.6 ; 45° dans la dalle'],
    ['Excentricité des charges verticales', `e = r/18 = ${F3(r.ecc)} m (r = ${F2(R.ecartement)} m), dans les deux sens`, '§ 6.3.5, figure 6.3'],
    ['Vitesse de ligne ; rayon en plan', `${R.V > 0 ? F0(R.V) + ' km/h' : 'non renseignée'} ; ${R.rayon > 0 ? F0(R.rayon) + ' m' : 'alignement droit'}`, '§ 6.5.1'],
  ];
}

/** Tableau des groupes : γ, ψ, effets globaux aux sections clés (Φ inclus). */
function lignesGroupes(st) {
  const { deck, keys, rail } = st;
  return rail.groupes.map(G => [G.label, F2(G.gamma), F2(G.psi0), F2(G.psi1), '0', String(G.nArr),
    keys.map(k => `${k.label} : ${F0(k.kind === 'support' ? G.res.Mmin[k.idx] : G.res.Mmax[k.idx])}`).join(' ; ')]);
}

/** Actions horizontales (6.5) — pour mémoire, non transmises aux appuis dans ce lot. */
function lignesHorizontales(st) {
  const h = st.rail.horizontal, R = st.rail.params, out = [];
  out.push(['Démarrage (LM71' + (R.alpha !== 1 ? ' × α' : '') + ')', `${F0(h.demarrageFreinage.demarrage)} kN (33 kN/m × ${F1(h.Ltot)} m, au plus 1 000 kN × α)`, '§ 6.5.3(2), (4)']);
  out.push(['Freinage (LM71' + (R.alpha !== 1 ? ' × α' : '') + ')', `${F0(h.demarrageFreinage.freinage)} kN (20 kN/m × ${F1(h.Ltot)} m, au plus 6 000 kN × α)`, '§ 6.5.3(2), (4)']);
  if (h.demarrageFreinageSW2) out.push(['Freinage (SW/2)', `${F0(h.demarrageFreinageSW2.freinage)} kN (35 kN/m, sans α)`, '§ 6.5.3(2)']);
  out.push(['Effet de lacet', `${F0(h.lacet)} kN au sommet du rail, ni Φ ni f`, '§ 6.5.2']);
  for (const c of h.centrifuge) out.push([`Force centrifuge, cas ${c.ref.replace('6.5.1', '§ 6.5.1')}`, `V = ${F0(c.V)} km/h, α = ${F2(c.alpha)}, f = ${F3(c.f)} : Q_tk = ${F1(c.Qt)} kN par essieu, q_tk = ${F2(c.qt)} kN/m, à ${F2(c.hauteur)} m au-dessus du plan de roulement`, '§ 6.5.1(4), tableau 6.8']);
  if (!h.centrifuge.length) out.push(['Force centrifuge', 'sans objet (vitesse ou rayon non renseignés)', '§ 6.5.1']);
  return out;
}

/**
 * Superstructure de voie proposée (EN 1991-1-1 annexe A, tableau A.6 et § 5.2.3), à comparer aux charges permanentes
 * effectivement saisies dans les données (celles qui entrent dans le calcul).
 */
function lignesSuperstructure(st) {
  const R = st.rail.params, b = st.deck && st.deck.b;
  const S = superstructureVoie({ voies: st.rail.voies, ballast: R.ballast, hTraverse: R.hTraverse, longueurTraverse: R.longueurTraverse,
    largeurBallast: R.largeurBallast, typeBallast: R.typeBallast, typeTraverse: R.typeTraverse, limites: b ? [-b, b] : null }).detail;
  return [
    ['Ballast', `γ = ${F1(S.gammaBallast)} kN/m³ × (e_b + h_t) = ${F2(R.ballast)} + ${F2(R.hTraverse)} m → q = ${F2(S.q)} kN/m², de y = ${F2(S.y1)} à ${F2(S.y2)} m (lit de ${F2(S.largeur)} m par voie)`, 'EN 1991-1-1 tableau A.6'],
    ['Épaisseur de ballast : valeurs caractéristiques', 'nominale ± 30 % → k_min = 0,7 ; k_max = 1,3 (valeur défavorable selon l\'effet)', 'EN 1991-1-1 § 5.2.3(2)'],
    ['Rails et traverses, par voie', `2 rails UIC 60 ${F1(S.rails)} kN/m + traverses ${S.traversesBois ? 'bois' : 'béton précontraint'} avec attaches ${F1(S.traverses)} kN/m${S.deplace ? ` − ballast déplacé par les traverses ${F2(S.deplace)} kN/m (volume g_t/25)` : ' (volume des traverses bois non déduit du ballast)'} = ${F2(S.gVoie)} kN/m, à l'axe`, 'EN 1991-1-1 tableau A.6 (traverses espacées de 600 mm) ; § 5.2.3(5)'],
    ['Total par voie', `${F1(S.parVoie)} kN/m (valeur nominale)`, ''],
  ];
}

/** Carte « Charges ferroviaires » de l'onglet Tablier (HTML). */
export function railCardHTML(st) {
  const r = st.rail;
  const tab = (head, rows) => `<table><thead><tr>${head.map(t => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>${rows.map(rw => `<tr>${rw.map((c, i) => `<td${i ? ' style="white-space:normal;text-align:left"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  let h = `<p class="small rail-mention"><b>${esc(MENTION)}</b> Le trafic routier n'est pas appliqué au tablier.</p>`;
  if (r.avert.length) h += `<ul class="checks">${r.avert.map(a => `<li><span class="badge warn">ATTENTION</span>${esc(a)}</li>`).join('')}</ul>`;
  h += tab(['Donnée', 'Valeur', 'Référence'], lignesDonnees(st));
  h += `<h3>Superstructure de voie proposée</h3>` + tab(['Élément', 'Valeur proposée', 'Référence'], lignesSuperstructure(st)) + `<p class="small">Le bouton « Calculer les charges permanentes depuis le ballast » du formulaire reporte ces valeurs dans les charges permanentes ; le calcul retient celles des données.</p>`;
  h += `<h3>Groupes de charges (flexion de la dalle)</h3>` + tab(['Groupe', 'γ ELU', 'ψ₀', 'ψ₁', 'ψ₂', 'arrangements', 'M [kN·m], Φ inclus (max en travée, min sur appui)'], lignesGroupes(st));
  h += `<p class="small">Groupes du tableau 6.11 (EN 1991-2 § 6.8.2) : chaque groupe est une action variable unique ; dans la flexion de la dalle, seule sa composante verticale intervient (coefficient 1). γ : EN 1990 tableau A2.4(B) ; ψ : tableau A2.3 (ψ₂ = 0, ψ₂ = 1 pour les seules déformations). Combinaisons : ELU γ_G G + γ Q ; ELS caractéristique G + Ta + max(T + ψ₀ Q ; 0,6 T + Q) ; fréquent G + max(0,6 T ; 0,5 T + ψ₁ Q) ; quasi permanent G + Ta + 0,5 T.</p>`;
  h += `<h3>Actions horizontales (pour mémoire)</h3>` + tab(['Action', 'Valeur caractéristique', 'Référence'], lignesHorizontales(st));
  h += `<p class="small">Transmises aux appareils d'appui, aux appuis et aux fondations par groupe de charges (tableau 6.11), avec la réponse combinée voie-ouvrage : voir « Appuis et fondations ».</p>`;
  if (r.deformations) h += deformationsHTML(r.deformations, { titre: 'Déformations et vibrations (EN 1991-2 § 6.4.4 ; EN 1990 A2.4.4)' });
  h += `<h3>Hors périmètre de ce calcul</h3><ul class="small">${HORS_PERIMETRE.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  h += `<p class="small">Paramètres à fixer par le référentiel du gestionnaire du réseau : ${esc(PARAMETRES_REFERENTIEL.join(' '))}</p>`;
  return h;
}

/** Blocs de la section « Charges ferroviaires » (note de calcul). */
export function railNoteBlocks(st) {
  const B = [];
  B.push({ t: 'comment', text: MENTION });
  for (const a of st.rail.avert) B.push({ t: 'comment', text: `Attention : ${a}.` });
  B.push({ t: 'h2', text: 'Données ferroviaires, coefficient dynamique et répartition' });
  B.push({ t: 'table', head: ['Donnée', 'Valeur', 'Référence'], rows: lignesDonnees(st), texte: true });
  B.push({ t: 'comment', text: 'Longitudinalement, LM71 est déplacé sur les lignes d\'influence de la poutre continue : essieux et charge répartie sur les seules parties défavorables, hors des 6,40 m du groupe d\'essieux ; SW/0 et SW/2 en motif rigide. Pour chaque voie, la charge verticale est l\'enveloppe « LM71 ou SW/0 ». Transversalement, chaque voie charge une bande b_w centrée sur son axe décalé de ±e ; les coefficients K̄ de Guyon-Massonnet de cette bande donnent m_x(y) comme pour une bande routière. Φ s\'applique aux moments, aux tranchants et aux réactions.' });
  B.push({ t: 'h2', text: 'Superstructure de voie (charges permanentes)' });
  B.push({ t: 'table', head: ['Élément', 'Valeur proposée', 'Référence'], rows: lignesSuperstructure(st), texte: true });
  B.push({ t: 'comment', text: 'Valeurs proposées par PSIDA à partir du ballast et du type de traverses ; le calcul retient les charges permanentes des données (charges réparties et linéaires), qui peuvent les reprendre ou les corriger. Lit de ballast arasé au dessus des traverses ; largeur par défaut = longueur de traverse + 2 × 0,50 m (choix PSIDA, à adapter au profil type de la ligne). Étanchéité, couche de protection et garde-ballast à ajouter s\'il y a lieu.' });
  B.push({ t: 'h2', text: 'Groupes de charges et coefficients' });
  B.push({ t: 'table', head: ['Groupe', 'γ ELU', 'ψ₀', 'ψ₁', 'ψ₂', 'Arrangements', 'M poutre entière [kN·m], Φ inclus'], rows: lignesGroupes(st), texte: true });
  B.push({ t: 'comment', text: 'EN 1991-2 tableau 6.11 (groupes), EN 1990 tableaux A2.3 (ψ) et A2.4(B) (γ = 1,45 ; 1,20 pour les groupes contenant SW/2). Dans la flexion de la dalle, seule la composante verticale du groupe intervient, avec le coefficient 1.' });
  B.push({ t: 'h2', text: 'Actions horizontales (pour mémoire)' });
  B.push({ t: 'table', head: ['Action', 'Valeur caractéristique', 'Référence'], rows: lignesHorizontales(st), texte: true });
  B.push({ t: 'comment', text: 'Ces actions ne sont pas ajoutées à la flexion de la dalle ; elles sont transmises aux appuis par groupe de charges (chapitre « Appuis et fondations »).' });
  if (st.rail.deformations) B.push(...deformationsBlocks(st.rail.deformations));
  B.push({ t: 'h2', text: 'Hors périmètre' });
  for (const t of HORS_PERIMETRE) B.push({ t: 'p', text: '— ' + t });
  return B;
}

/**
 * Note de calcul complète d'un pont-dalle sous rail (Eurocodes) : données, charges ferroviaires, combinaisons, flexion
 * longitudinale, effort tranchant, flexion transversale, appuis et fondations (lot 5), références.
 */
export function buildNoteRail(st, { figures = {}, project = {} } = {}) {
  const { p, deck, keys, perm, design, transDesign, bearings, thermal } = st;
  const g = deck.g, dz = design.EC, B = [];
  const h1 = (text, num) => B.push({ t: 'h1', text: num ? `${num}. ${text}` : text });
  const h2 = text => B.push({ t: 'h2', text });
  const para = text => B.push({ t: 'p', text });
  const comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const fig = key => { if (figures[key]) B.push({ t: 'img', ...figures[key] }); };
  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const Ltot = deck.spans.reduce((a, b) => a + b, 0), [aL, aR] = g.overhangs || [0, 0];

  h1('Données', 1);
  table(['Grandeur', 'Valeur'], [
    ['Nombre de travées ; portées [m]', `${deck.spans.length} ; ${deck.spans.map(F2).join(' | ')} (abouts ${F2(aL)} / ${F2(aR)})`],
    ['Longueur entre appuis extrêmes [m]', F2(Ltot)],
    ['Dalle : largeur 2b ; épaisseur h [m]', `${F3(2 * deck.b)} ; ${F3(deck.h)}`],
    ['Biais ψ [gr]', F1(p.concept?.psi || 100)],
    ['Béton ; acier', `C${dz.mat.fck} (f_cd = ${F2(dz.mat.fcd)} MPa) ; B${dz.mat.fyk} (f_yd = ${F0(dz.mat.fyd)} MPa)`],
    ['Enrobage à l\'axe ; w_k max', `${F3(p.mat.c)} m ; ${F2(p.mat.wkMax)} mm`],
  ], { texte: true });
  try {
    const gg = { ...g, spans: deck.spans, h: deck.h, width: 2 * deck.b, lines: g.lines || [], bands: g.bands || [], ys: g.ys || [], footways: g.footways || [], rail: p.rail };
    B.push({ t: 'svg', svg: guideCrossSectionSVG(gg), caption: 'Coupe transversale : dalle, voies ferrées (rails, traverses, ballast), diffusion 4:1 puis 45° et bande chargée au feuillet moyen, charges permanentes' });
  } catch (e) { /* schéma non disponible */ }
  comment('Dalle remplacée par un rectangle équivalent de largeur 2b (Guyon-Massonnet, dalle isotrope), poutre continue à inertie constante pour la flexion longitudinale.');
  h2('Charges permanentes');
  table(['Charge permanente', 'q nominale [kN/m]', 'k min', 'k max'], deck.permanentFiles().map(f => [f.label, F2(f.q), F2(f.kmin), F2(f.kmax)]));
  if (thermal) para(`Gradient thermique ${p.dT[0]} / ${p.dT[1]} °C ; tassements aléatoires ${F1(p.delta * 100)} cm (module différé E/(1 + ${p.phiFluage})).`);

  h1('Charges ferroviaires (EN 1991-2 section 6)', 2);
  B.push(...railNoteBlocks(st));
  fig('M'); fig('R'); fig('K');

  h1('Flexion longitudinale', 3);
  comment('Combinaisons des ponts-rails (EN 1990 A2) sur chaque groupe, par section et par fibre : ELU 1,35 G + γ Q (G favorable : 1,00) ; ELS caractéristique G + Ta + max(T + ψ₀ Q ; 0,6 T + Q) ; fréquent G + max(0,6 T ; 0,5 T + ψ₁ Q) ; quasi permanent G + Ta + 0,5 T. Aciers : ELU (EN 1992-1-1 § 6.1), ELS caractéristique (σ_c ≤ 0,6 f_ck, σ_s ≤ 0,8 f_yk), ouverture des fissures sous ELS fréquent (§ 7.3.4), minimums (§ 9.2.1.1 et 7.3.2).');
  const rows = [];
  for (const k of keys) for (const face of ['bot', 'top']) {
    const arr = dz[face][k.idx], iy = arr.indexOf(Math.max(...arr)), f = dz.perFibre[k.idx][iy][face];
    rows.push([k.label, `${face === 'bot' ? 'inf' : 'sup'} (y = ${F2(deck.ys[iy])})`, F0(f.Mu), F0(f.Mcar), F0(f.Mfre), F0(f.Mqp), CM(f.AsULS), CM(f.AsSLS), CM(f.AsWk), CM(f.As), F0(f.sigS)]);
  }
  table(['Section', 'Face', 'M ELU [kN·m/m]', 'M car.', 'M fréq.', 'M QP', 'A_s ELU [cm²/m]', 'A_s ELS', 'A_s w_k', 'A_s retenu', 'σ_s [MPa]'], rows);
  fig('As');
  h2('Effort tranchant');
  table(['Section', 'V_Ed [kN/m]', 'V_Rd,c [kN/m]', 'V_Ed / V_Rd,c', 'Étriers A_sw/s [cm²/m par m]'], keys.map(k => { const s = dz.shear[k.idx]; return [k.label, F0(s.VEd * 1000), F0(s.VRdc * 1000), F2(s.ratio), s.AswS > 0 ? CM(s.AswS) : '—']; }));
  comment('V_Ed = (1,35 V_G + max des groupes γ · K · V_Q)/2b, K facteur de répartition transversale du groupe ; V_Rd,c selon EN 1992-1-1 § 6.2.2. Poinçonnement : sans objet (charges réparties par les traverses et le ballast).');

  h1('Flexion transversale', 4);
  comment('Dalle isostatique équivalente de portée L_eq, bords libres, chargée au milieu de la portée : LM71 avec ses essieux remplacés par la charge uniforme équivalente sur 6,40 m (EN 1991-2 § 6.3.6.2(1)), SW/0 et SW/2 en motif ; mêmes bandes, groupes et combinaisons que la flexion longitudinale ; séries de Fourier (15 harmoniques).');
  const tz = transDesign.EC;
  table(['Travée', 'Face', 'y [m]', 'M ELU [kN·m/m]', 'M car.', 'M fréq.', 'A_s flexion [cm²/m]', 'A_s retenu [cm²/m]'], tz.spans.flatMap(sp => ['bot', 'top'].map(face => { const f = sp[face]; return [`Travée ${sp.j + 1}`, face === 'bot' ? 'inf' : 'sup', F2(f.y), F1(f.Mu), F1(f.Mcar), F1(f.Mfre), CM(f.flex), CM(f.As)]; })));
  fig('my');

  if (st.supports) {
    h1('Appuis et fondations', 5);
    for (const b of supportsBlocks(st.supports, 'EC', { noWater: true })) B.push(b);
    const wb = waterBlocks(st.supports, 'EC');
    if (wb.length) for (const b of wb) B.push(b);
    if (st.supports.sp.seisme.actif) for (const b of seismicBlocks(st.supports.seisme)) B.push(b);
  } else {
    h1('Appareils d\'appui', 5);
    comment(`Calcul des appuis indisponible${st.supportsError ? ` : ${st.supportsError}` : ''}.`);
    if (bearings) table(['Ligne d\'appui', 'R max / min [kN]', 'Appareil (pré-choix)'], bearings.rows.map(r => [`${r.i === 0 || r.i === bearings.rows.length - 1 ? 'Culée C' : 'Pile P'}${r.i}`, `${F0(r.Rmax)} / ${F0(r.Rmin)}`, r.sel ? r.sel.label : 'aucun appareil']));
  }

  h1('Références', 6);
  for (const t of [
    'NF EN 1991-2 (2004) : Actions sur les ponts, dues au trafic — section 6 (trafic ferroviaire) : § 6.3.2 à 6.3.6, 6.4.4 (figures 6.9 et 6.10), 6.4.5, 6.4.6.3, 6.5.1 à 6.5.3, 6.5.4.5.2, 6.8.2, tableaux 6.1, 6.2, 6.6, 6.8, 6.11 ; annexe F (tableaux F.1, F.2).',
    'NF EN 1998-2 § 4.1.2(4)P (ψ2,1 des ponts ferroviaires) ; PP73, FOND 72, Fascicule 62 titre V / NF P 94-261 et 94-262 (appuis et fondations, modules communs de PSIDA).',
    'NF EN 1990/A1 (2006) : annexe A2, tableaux A2.3 (coefficients ψ des ponts ferroviaires) et A2.4(B) (coefficients γ) ; A2.4.4 (déformations et vibrations des ponts ferroviaires, tableaux A2.8 et A2.9, figure A2.3).',
    'NF EN 1992-1-1 et NF EN 1992-2 : dimensionnement des sections en béton armé.',
    'Guyon-Massonnet (répartition transversale), guide SETRA « Ponts-dalles » (1989), note CHAMOA-PSIDA (pratique de calcul des dalles).',
  ]) para('— ' + t);
  return { title: 'Note de calcul — pont-dalle en béton armé sous rail — Eurocodes (EN 1991-2 section 6)', meta: `${project.name || 'Ouvrage'} · ${today} · calcul PSIDA v${st.version || ''} (calcul manuel assisté)`, blocks: B };
}
