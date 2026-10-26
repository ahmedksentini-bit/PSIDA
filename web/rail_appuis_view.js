/**
 * Appuis des ponts-rails (lot 5) : blocs de l'interface et de la note — actions ferroviaires transmises aux appuis,
 * réponse combinée voie-ouvrage (méthode simplifiée de l'EN 1991-2 § 6.5.4.6.1), critères de déformation (§ 6.5.4.5.2).
 */
import { MENTION } from '../src/loads_rail.js';
import { CRITERES_INTERACTION, PSI21_FERROVIAIRE } from '../src/rail_appuis.js';

const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F2 = v => F(v, 2);
const okS = b => (b === null || b === undefined ? '—' : b ? 'OK' : 'NON');
const DIL = { continue: 'longs rails soudés continus aux deux extrémités du tablier', une: 'dispositif de dilatation des rails à une extrémité (libre)', deux: 'dispositifs de dilatation des rails aux deux extrémités' };

/** @param {object} sup résultat de computeSupports (sup.rail présent) ; @param {Function} lineName (L, n) → nom de la ligne */
export function railSupportBlocks(sup, lineName) {
  const R = sup.rail, B = [], Ls = sup.lines, n = Ls.length, P = R.params;
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  h2('Actions ferroviaires transmises aux appuis (EN 1991-2 section 6)');
  comment(`${MENTION} ${R.source === 'poutres' ? 'Tablier à poutres sous rail transmis par le module « Ponts à poutres » (réactions par ligne sans Φ et Φ des travées adjacentes).' : 'Pont-dalle sous rail (réactions par ligne de chaque groupe, Φ du tablier).'} Eurocodes seuls : Fascicule 61, BAEL et Fascicule 62 titre V sans objet sous charges ferroviaires.`);
  for (const a of R.avert) comment(`Attention : ${a}.`);
  const L = R.long, T = R.trans;
  table(['Action', 'Valeur caractéristique', 'Référence'], [
    ['Longueur d\'influence des efforts horizontaux', `${F2(R.Lh)} m (${R.tablierUnique && R.source !== 'poutres' ? 'tablier entier' : 'une travée'})`, '§ 6.5.3(1)P'],
    ['Démarrage / freinage, une voie LM71' + (L.voie.detail.length > 1 ? ' ou SW/0' : ''), `${F0(L.voie.Qla)} / ${F0(L.voie.Qlb)} kN (α = ${F2(P.alpha)})`, '§ 6.5.3(2), (4), éq. (6.20)-(6.21)'],
    ...(L.voieSW2 ? [['Démarrage / freinage, SW/2 (parties chargées, sans α)', `${F0(L.voieSW2.Qla)} / ${F0(L.voieSW2.Qlb)} kN (L_chargée = ${F1(L.voieSW2.Lab)} m)`, '§ 6.5.3(2) note 1, éq. (6.22)']] : []),
    ...(P.nV === 2 ? [['Deux voies', `${F0(L.deux)} kN (${L.memeSens ? 'même sens : démarrage ou freinage sur les deux voies' : 'freinage sur une voie + démarrage sur l\'autre'})`, '§ 6.5.3(9)P']] : []),
    ['Force centrifuge par voie', P.V > 0 && P.rayon > 0 ? `${F0(T.centrifuge)} kN (V = ${F0(P.V)} km/h, r = ${F0(P.rayon)} m ; enveloppe des cas du tableau 6.8${T.cas.length ? ' : ' + T.cas.map(c => `${F0(c.V)} km/h, α_c = ${F2(c.alpha)}, f = ${F2(c.f)} → ${F0(c.F)} kN`).join(' ; ') : ''})${P.sw2 ? ` ; SW/2 à ${F0(T.VSW2)} km/h : ${F0(T.centrifugeSW2)} kN` : ''}` : 'sans objet (vitesse ou rayon non renseignés)', '§ 6.5.1, éq. (6.17)-(6.19), tableau 6.8'],
    ['Effet de lacet par voie', `${F0(T.lacet)} kN au sommet du rail`, '§ 6.5.2'],
    ['Surcharge sur remblai (culées)', `${F1(R.surcharge.qBande)} kN/m² sur ${F2(R.surcharge.largeurBandes)} m${R.surcharge.sw2Gouverne ? ' (SW/2)' : ''}, soit q_eq = ${F1(R.surcharge.qEq)} kN/m² sur la largeur du mur, sans Φ ; γ = ${F2(R.surcharge.gamma)}, ψ₀ = 0,8`, '§ 6.3.6.4 ; EN 1990 tableaux A2.3, A2.4(B)'],
  ], { small: true, texte: true, wrap: true });
  comment('Démarrage et freinage au niveau des rails, uniformes sur la longueur d\'influence, sans Φ ni f ; SW/0 et SW/2 sur leurs seules parties chargées. Force centrifuge horizontale à 1,80 m au-dessus du plan de roulement, sans Φ ; lacet horizontal au sommet du rail, × α pour α ≥ 1, sans Φ ni f. Les trois actions sont combinées par groupes (tableau 6.11), chacun étant une action variable unique.');

  h2('Réponse combinée voie-ouvrage (EN 1991-2 § 6.5.4)');
  table(['Condition de la méthode simplifiée', 'Valeur', 'Vérifiée', 'Référence'], R.simp.conditions.map(c => [c.texte, c.valeur === '' || c.valeur == null ? '—' : typeof c.valeur === 'number' ? F2(c.valeur) : String(c.valeur), okS(c.ok), c.ref]), { small: true, texte: true, wrap: true });
  para(`Rails : ${DIL[P.dilatation] || P.dilatation} ; point fixe du tablier ${R.xf == null ? 'propre à chaque travée' : `à x = ${F2(R.xf)} m`} ; longueur de dilatation L_T = ${F2(R.LT)} m${R.L1 != null ? ` (L₁ = ${F2(R.L1)} m, L₂ = ${F2(R.L2)} m)` : ''} ; δ_B = ${F1(R.dB)} mm sous le démarrage-freinage classifié (tablier sur ses appuis, raideurs instantanées, sans réduction ξ) ; δ_H = ${R.dH == null ? '—' : F2(R.dH) + ' mm'} (déformations du tablier, LM71 × α sans Φ).`);
  if (R.simp.applicable) {
    table(['Effort sur les appareils', 'Par voie', 'Formule', 'Référence'], [
      ['Coefficient ξ (démarrage-freinage transmis)', F2(R.xi), R.xi0 == null ? 'hors tableau (> 40 m) : ξ = 1' : 'tableau 6.9', '§ 6.5.4.6.1(3)'],
      ['F_Tk, température', `± ${F0(R.FT.F)} kN`, `${R.FT.eq}, k = ${F0(R.k)} kN/m`, '§ 6.5.4.6.1(4) ; annexe G.2(3)'],
      ['F_Qk, déformation du tablier', `± ${F0(R.FQ.F)} kN`, `${R.FQ.eq}, L = ${F2(R.Lfix)} m`, '§ 6.5.4.6.1(5)'],
    ], { small: true, texte: true, wrap: true });
    comment('Méthode simplifiée applicable : la vérification des contraintes additionnelles dans les rails n\'est pas nécessaire (§ 6.5.4.6.1(1)). Forces longitudinales sur les appareils : ξ × (démarrage-freinage) + F_Qk avec le groupe ferroviaire, F_Tk avec la température (γ = 1,5, ψ₀ = 0,6) ; réparties entre les lignes d\'appui selon leurs raideurs instantanées (hypothèse PSIDA quand le tablier repose sur des élastomères : la norme vise les appareils fixes). Le texte français rattache F_Qk = ± 20 L au cas « longs rails soudés aux deux extrémités, appareils fixes à une extrémité » : retenu dès que le rail est continu à l\'extrémité fixe.');
  } else comment(`Méthode simplifiée non applicable : la réponse combinée voie-ouvrage (contraintes additionnelles dans les rails ≤ ${CRITERES_INTERACTION.sigmaCompression} MPa en compression et ${CRITERES_INTERACTION.sigmaTraction} MPa en traction, § 6.5.4.5.1 ; forces sur les appareils fixes) relève de l'annexe G ou d'une analyse selon 6.5.4.2 à 6.5.4.5 — hors du périmètre de PSIDA. Les efforts de démarrage-freinage sont transmis en totalité aux appuis (ξ = 1) ; F_Tk et F_Qk ne sont pas évaluées. Pour un tablier sur élastomères, δ_B est souvent trop grand : un point fixe (appareils à pot fixes sur une culée ou une pile) le réduit.`);
  const Cr = R.criteres;
  table(['Critère de déformation', 'Valeur [mm]', 'Limite [mm]', 'Verdict', 'Référence'], [
    ['δ_B, déplacement relatif sous démarrage-freinage', F1(Cr.deltaB.val), F0(Cr.deltaB.lim), okS(Cr.deltaB.val <= Cr.deltaB.lim + 1e-9), Cr.deltaB.ref],
    ...Cr.deltaH.map(c => [`δ_H, extrémité ${c.appui} (déformation du tablier)`, F2(c.val), F0(c.lim), okS(c.val <= c.lim + 1e-9), c.ref]),
    ...Cr.deltaV.map(c => [`δ_V, extrémité ${c.appui} (au-delà de l'appareil)`, F2(c.val), F0(c.lim), okS(c.ok), c.ref]),
  ], { small: true, texte: true, wrap: true });
  comment(`δ_B : ${P.dilatation === 'deux' ? '30 mm avec dispositifs de dilatation aux deux extrémités et ballast continu' : '5 mm pour des longs rails soudés sans dispositif de dilatation ou avec un dispositif à une extrémité'} (§ 6.5.4.5.2(1)P) ; δ_H : 8 mm en tenant compte du comportement combiné voie-ouvrage, 10 mm sinon (§ 6.5.4.5.2(2)P) ; δ_V : 3 mm (V ≤ 160 km/h), 2 mm au-delà (§ 6.5.4.5.2(3)P).`);

  h2('Groupes de charges ferroviaires aux appuis (EN 1991-2 tableau 6.11 ; EN 1990 A2)');
  table(['Groupe', 'γ', 'ψ₀ / ψ₁', 'Longitudinal total [kN]', 'Transversal total [kN]', ...Ls.map(L0 => `${lineName(L0, n)} : V ; H ; H_y [kN]`)],
    R.groupes.map(g => [g.label, F2(g.gamma), `${F2(g.psi0)} / ${F2(g.psi1)}`, `${F0(g.H)}${g.FQ ? ` (dont F_Qk ${F0(g.FQ)})` : ''}`, F0(g.Hy),
      ...g.parLigne.map(q => `${F0(q.N)}${q.phi ? ' (Φ)' : ''} ; ${F0(q.H)} ; ${F0(q.Hy)}`)]), { small: true, wrap: true });
  comment(`Coefficients des composantes (tableau 6.11) : démarrage-freinage 1 / 0,5, force centrifuge et lacet 0,5 / 1 selon le groupe ; deux voies chargées dans les groupes gr21 à gr27. Réactions verticales sans Φ pour les culées, les fondations et les fûts d'élancement < 30 (§ 6.4.5.4(2)) ; avec Φ pour les appareils d'appui et les chevêtres (tableau 6.2, cas 6 : L_Φ des éléments portés) et les fûts d'élancement ≥ 30 (élancement 2H/i : ${R.lam.map((l, i) => (l == null ? null : `${lineName(Ls[i], n)} ${F0(l)}`)).filter(Boolean).join(', ') || '—'}). ELU : 1,35 G + γ Q_groupe + 1,35 (retrait + fluage) + 1,5 × 0,6 (T + F_Tk) ; température dominante : 1,35 G + 1,5 (T + F_Tk) + γ × 0,8 Q ; ELS caractéristique avec 1,0 (EN 1990 tableaux A2.3 et A2.4(B), γ = 1,45 ou 1,20 pour les groupes SW/2). Séisme : G + ψ₂,₁ Q + A_Ed avec ψ₂,₁ = ${F1(PSI21_FERROVIAIRE)} (EN 1998-2 § 4.1.2(4)P, ponts ferroviaires), masse de trafic 80 α kN/m par voie dans le modèle sismique. Non traités : train à vide (gr15), déraillement (§ 6.7), chocs sur les piles sous l'ouvrage ferroviaire, fatigue, analyse complète de l'interaction voie-ouvrage (annexe G).`);
  return B;
}
