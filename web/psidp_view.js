/**
 * Présentation du module PSI-DP (onglet « Précontrainte » et chapitre de la note globale) : données de la précontrainte,
 * tracé du câble, pertes, efforts et moments hyperstatiques, contraintes en classe II, aciers passifs, ELU, effort tranchant.
 * Blocs communs (h2, p, comment, table, svg) rendus par blocksToHTML (onglet) et par la note (HTML / Word).
 */
import { lineChart, svgBlock } from './note_figures.js';

const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F2 = v => F(v, 2), F3 = v => F(v, 3), MPa = v => F(v / 1000, 2), MN = v => F(v / 1000, 2);
const ok = b => (b ? 'OK' : 'NON');

/** Abscisses des dixièmes de travée parmi les nœuds du calcul. */
const tenths = r => r.tenth.map(i => r.xs[i]);

export function psidpBlocks(dp, { error = null } = {}) {
  const B = [];
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  if (error) { comment(`Calcul de la précontrainte impossible : ${error}`); return B; }
  if (!dp) { para('Dalle en béton armé : cocher « Calculer la dalle en béton précontraint » dans l\'onglet Précontrainte pour le calcul PSI-DP.'); return B; }
  const { r, c, sec, unit: U, n, bp } = dp, EC = !!dp.isEC2, spans = r.geo.x0.slice(1).map((x, j) => x - r.geo.x0[j]);
  const P0 = r.nAp * dp.sigma0 * 1000, xT = tenths(r), lab = x => { let j = r.geo.x0.findIndex((x0, k) => k < spans.length && x < r.geo.x0[k + 1] - 1e-6); if (j < 0) j = spans.length - 1; const f = (x - r.geo.x0[j]) / spans[j]; return `${j + 1} — ${F(f, 1)} L`; };

  // ------------------------------------------------------------------ données
  h2('Données de la précontrainte');
  table(['Grandeur', 'Valeur'], [
    [sec.imposee ? 'Section brute (imposée : valeurs de la note)' : 'Section brute (rectangle équivalent ou encorbellements)', `B = ${F3(sec.B)} m² ; I = ${F(sec.I, 4)} m⁴ ; v = ${F3(sec.v)} m ; v′ = ${F3(sec.vp)} m ; rendement ρ = ${F3(sec.rho)}`],
    ['Section nette (gaines déduites)', `B_n = ${F3(r.Bn)} m² ; I_n(x) = I − n A_gaine z(x)²`],
    ['Câblage', `${n} unités ${U.label} (A_p = ${F0(U.Ap * 1e6)} mm², gaine Ø ${F0(U.phiG * 1000)} mm) — n A_p = ${F0(r.nAp * 1e6)} mm² ; ${dp.auto ? `nombre minimal ${EC ? 'vérifiant les contraintes EN 1992' : 'en classe II'} (départ du prédimensionnement à ${dp.n0} unités ; essais ${dp.tried.map(([k, o]) => `${k} ${o ? '✓' : '✗'}`).join(', ')})` : 'nombre imposé'}`],
    ['Procédé (agrément)', `${U.source || '—'}${U.url ? ` (${U.url})` : ''} ; frottement f = ${F2(bp.f)} rad⁻¹, φ = ${F(bp.phi, 4)} m⁻¹, recul g = ${F0(bp.g * 1000)} mm ; plaque ${F0(U.plate * 1000)} × ${F0(U.plateB * 1000)} mm${U.spacingMin ? ` ; entraxe ≥ ${F0(U.spacingMin * 1000)} mm, bord ≥ ${F0(U.edgeMin * 1000)} mm${U.fcm0 ? ` (f_cm,0 = ${F0(U.fcm0)} MPa)` : ''}` : ''}`],
    ['Acier de précontrainte', `f_prg = ${F0(bp.fprg)} MPa, f_peg = ${F0(bp.fpeg)} MPa, E_p = ${F0(bp.Ep)} MPa, ρ₁₀₀₀ = ${F(bp.rho1000, 1)} %, μ₀ = ${F2(bp.mu0)}`],
    ['Tension à l\'origine σ_p0', `${F0(dp.sigma0)} MPa (${EC ? 'EN 1992-1-1 § 5.10.2.1 : σ_p,max = min(0,8 f_pk ; 0,9 f_p0,1k)' : 'BPEL 3.2 : min(0,8 f_prg ; 0,9 f_peg)'} par défaut) ; P0 = ${MN(P0)} MN${dp.sigImposed ? ' — contrainte initiale imposée (table x σ) : frottement, recul et raccourcissement élastique ne sont pas recalculés' : ''}`],
    ...(EC && dp.sigPm0 ? [['Tension après pertes instantanées σ_pm0 (EN 1992-1-1 § 5.10.3 (2))', `${F0(dp.sigPm0.max)} MPa au plus (x = ${F2(dp.sigPm0.x)} m) ≤ min(0,75 f_pk ; 0,85 f_p0,1k) = ${F0(dp.sigPm0.lim)} MPa : ${ok(dp.sigPm0.ok)}${dp.sigPm0.okJack ? '' : ` ; tension à l'ancrage ${F0(dp.sigma0)} > σ_p,max = ${F0(dp.sigPm0.sigmaJack)} MPa (§ 5.10.2.1)`}${dp.sigPm0.ajuste ? ` — tension à l'ancrage abaissée de ${F0(dp.sigPm0.sigmaJack)} à ${F0(dp.sigma0)} MPa pour respecter cette limite` : ''}${dp.sigPm0.imposee ? ' (contrainte initiale imposée)' : ''}`]] : []),
    ['Frottement, recul d\'ancrage', `${EC ? `μ = ${F2(bp.f)} rad⁻¹, k = ${F(bp.f ? bp.phi / bp.f : 0, 4)} rad/m (σ = σ_p0 e^(−μ(θ + k x)), EN 1992-1-1 (5.45))` : `f = ${F2(bp.f)} rad⁻¹, φ = ${F3(bp.phi)} m⁻¹`}, g = ${F0(bp.g * 1000)} mm ; ancrages actifs ${bp.ends === 'both' ? 'aux deux extrémités' : bp.ends === 'left' ? 'à gauche' : 'à droite'} ; déviation ${bp.friction === 'dixiemes' ? 'cumulée sur la grille des dixièmes (programme PSIDP)' : 'cumulée (variation totale de pente)'}`],
    EC ? ['Béton (EN 1992-1-1 § 3.1)', `f_ck = ${F(dp.fc28, 1)} MPa, f_ctm = ${F2(dp.ec2.fctm)} MPa, E_cm = ${F0(dp.ec2.Ecm)} MPa ; à la mise en tension (${F(bp.j ?? 7, 0)} j, ciment ${bp.cem || 'N'}) f_ck(t) = ${F(dp.ec2.fckt, 1)} MPa, f_ctm(t) = ${F2(dp.ec2.fctmt)} MPa, E_cm(t) = ${F0(dp.ec2.Ecmt)} MPa`]
      : ['Béton', `f_c28 = ${F(dp.fc28, 1)} MPa, f_cj (mise en tension) = ${F(dp.fcj, 1)} MPa ; f_t28 = ${F2(dp.lim.ft28 / 1000)} MPa, f_tj = ${F2(dp.lim.ftj / 1000)} MPa ; E_ij = 11 000 f_cj^⅓`],
    EC ? ['Pertes différées et valeurs caractéristiques', `EN 1992-1-1 (5.46) : retrait ε_cs = ${F((bp.epsCs ?? bp.epsR) * 1e4, 2)}·10⁻⁴, fluage φ(∞,t0) = ${F2(bp.phiC ?? 2)}, relaxation classe ${bp.relCls ?? 2} (§ 3.3.2, 500 000 h) ; fraction à la mise en service ${F2(bp.rj)} ; P_k,sup = ${F2(bp.rsup ?? 1.1)} P_m, P_k,inf = ${F2(bp.rinf ?? 0.9)} P_m (§ 5.10.9) ; décompression sous la combinaison ${bp.decomp === 'qp' ? 'quasi permanente (XC2 à XC4)' : bp.decomp === 'aucune' ? '— (non exigée : X0, XC1)' : 'fréquente (XD, XS)'}`] :
    ['Pertes différées', `${bp.reg === 'PSIDP84' ? 'convention PSIDP-EL 84 (BPEL 83)' : 'BPEL 91 révisé 99'} ; retrait final ε_r = ${F(bp.epsR * 1e4, 1)}·10⁻⁴ ; âge à la mise en tension j = ${F(bp.j ?? 7, 0)} jours ; fraction à la mise en service r(j) = ${F2(bp.rj)}${bp.reg === 'PSIDP84' ? ` ; K_fl = ${F2(bp.Kfl)}` : ''}`],
    ['Prédimensionnement (annexe 1 du dossier PSI-DP)', `l = ${F2(dp.pre.l)} m, ξ = ${F3(dp.pre.xi)}, Z = ${F3(dp.pre.Z)} m → F∞ ≥ max(F1 ; F2) = max(${MN(dp.pre.F1)} ; ${MN(dp.pre.F2)}) = ${MN(dp.pre.F)} MN`],
  ]);
  if (U.agrement && U.agrement !== 'generique') comment(`Procédé ${U.label} : ${U.agrNote || ''}${U.ref ? ` Références : ${U.ref}.` : ''}${U.manquants && U.manquants.length ? ` Données absentes du document lu, valeurs génériques utilisées : ${U.manquants.join(', ')}.` : ''}`);
  if (U.tensionOK === false) comment(U.fcm0Niveaux > 1 ? `Attention : f_cj = ${F(dp.fcj, 1)} MPa à la mise en tension est inférieur à la plus faible résistance du tableau de l'agrément (f_cm,0 = ${F0(U.fcm0)} MPa) : mise en tension à pleine force non admise par le procédé, retarder la mise en tension ou la faire par étapes.` : `Attention : f_cj = ${F(dp.fcj, 1)} MPa est inférieur à la seule résistance à la mise en tension pour laquelle les entraxes et distances au bord ont été lus (f_cm,0 = ${F0(U.fcm0)} MPa) ; l'agrément peut admettre une résistance plus faible avec des entraxes plus grands : vérifier sur l'ETA, ou retarder la mise en tension.`);
  if (dp.geoChk.gaps.length) comment(`Paraboles discontinues : ${dp.geoChk.gaps.map(gq => `travée ${gq.span} à x = ${F2(gq.x)} m (Δz = ${F3(gq.dz)} m, Δpente = ${F3(gq.dp)})`).join(' ; ')}.`);
  comment(`Rayon de courbure minimal du câble moyen : ${F(dp.geoChk.Rmin, 1)} m (≥ ${F(U.Rmin, 1)} m requis pour ${U.label} : ${ok(dp.geoChk.Rmin >= U.Rmin)}).`);

  // ------------------------------------------------------------------ tracé
  h2('Tracé du câble moyen');
  const xsP = r.xs, zc = r.z, half = 1.5 * U.phiG;
  B.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'z [m] (fibre moyenne = 0)', hauteur: 260, includeZero: true, series: [
    { points: xsP.map(x => [x, sec.v]), libelle: 'fibre supérieure', couleur: '#334155', epaisseur: 1.5 },
    { points: xsP.map(x => [x, -sec.vp]), libelle: 'fibre inférieure', couleur: '#334155', epaisseur: 1.5 },
    { points: xsP.map((x, i) => [x, zc[i]]), libelle: 'câble moyen', couleur: '#dc2626', epaisseur: 2.5 },
    { points: xsP.map((x, i) => [x, Math.min(sec.v, zc[i] + half)]), libelle: 'section d\'enrobage (3 Ø gaine)', couleur: '#f59e0b', tirets: '4 3', epaisseur: 1 },
    { points: xsP.map((x, i) => [x, Math.max(-sec.vp, zc[i] - half)]), libelle: '', couleur: '#f59e0b', tirets: '4 3', epaisseur: 1 }] }),
  'Tracé du câble moyen dans l\'épaisseur de la dalle (échelle verticale dilatée) et section d\'enrobage'));
  if (dp.points) {
    table(['x [m]', 'z [m] (fibre moyenne)', 'x [m]', 'z [m]', 'x [m]', 'z [m]'], (() => { const P = dp.points, rows = []; const k3 = Math.ceil(P.length / 3); for (let k = 0; k < k3; k++) rows.push([0, 1, 2].flatMap(c2 => { const q = P[k + c2 * k3]; return q ? [F3(q[0]), F3(q[1])] : ['', '']; })); return rows; })(), { small: true });
    comment(`Tracé du câble moyen saisi par points (${dp.points.length} points, référence ${bp.ptsRef === 'inf' ? 'sous-face, ramenée à la fibre moyenne' : bp.ptsRef === 'sup' ? 'fibre supérieure, ramenée à la fibre moyenne' : 'fibre moyenne'}) et interpolé par une spline cubique naturelle ; rayon minimal lu sur la spline.`);
  } else table(['Travée', 'Tronçon [m]', 'A', 'B', 'C', 'Rayon [m]'], dp.segs.flatMap((list, j) => list.map((q, k) => [String(j + 1), `${F3(k ? list[k - 1].x1 : 0)} – ${F3(q.x1)}`, F(q.A, 6), F(q.B, 6), F(q.C, 6), q.A ? F(1 / (2 * Math.abs(q.A)), 1) : '∞'])), { small: true });
  if (!dp.points) comment('z = A x² + B x + C, x depuis l\'appui gauche de la travée, z vers le haut depuis la fibre moyenne de la section brute. Tracé automatique : ancrages sur la fibre moyenne, sommets de parabole sur les appuis intermédiaires, points bas à 0,4 L (rives) et 0,5 L, paraboles de raccordement de longueur a·L de part et d\'autre des appuis (guide PSI-DP).');

  if (dp.opt) {
    const o = dp.opt, q = o.q, nS2 = spans.length;
    const lamTxt = spans.map((_, j) => F2(q.lam[Math.min(j, nS2 - 1 - j)] ?? q.lam[j])).join(' / '), muTxt = spans.slice(1).map((_, i) => F2(q.mu[Math.min(i + 1, nS2 - i - 1)] ?? q.mu[i + 1])).join(' / ');
    table(['Recherche du tracé', 'Résultat'], [
      ['Paramètres retenus', `points bas à λ × excentricité maximale, λ = ${lamTxt} (travées 1 à ${nS2}) ; sommets sur appuis à μ × excentricité maximale, μ = ${muTxt} ; point bas des rives à ${F2(q.le)} L`],
      ['Marge minimale normée des contraintes par nombre d\'unités', o.path.map(([k, m]) => `${k} : ${F(m, 3)}`).join(' ; ')],
      ['Conclusion', o.feasible ? `${dp.n} unités avec ce tracé (marge ${F(o.m, 3)} ≥ 0)` : 'aucun tracé ne satisfait toutes les contraintes : épaissir la dalle ou changer d\'unité'],
    ]);
    comment('Marge = min[(σ_lim − σ)/f_c28 en compression ; (σ − σ_lim)/f_t28 en traction] sur toutes les sections, phases et combinaisons, pénalisée si le rayon de courbure est inférieur au minimum de l\'unité. Recherche par coordonnées (pas 0,2 / 0,1 / 0,05) qui maximise la marge, c\'est-à-dire centre le tracé dans le fuseau admissible comme la transformation linéaire du programme PSIDP, puis diminution du nombre d\'unités tant que la marge reste positive ; paramètres liés deux à deux pour un ouvrage symétrique.');
  }

  // ------------------------------------------------------------------ pertes
  h2('Pertes de tension et tensions caractéristiques');
  B.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'σ_p [MPa]', includeZero: false, series: [
    { points: xsP.map((x, i) => [x, r.friction.s[i] / 1000]), libelle: 'après frottement', couleur: '#64748b' },
    { points: xsP.map((x, i) => [x, r.spi[i] / 1000]), libelle: 'initiale σ_pi (recul, raccourcissement)', couleur: '#0369a1' },
    { points: xsP.map((x, i) => [x, r.MS.moy.sig[i] / 1000]), libelle: 'mise en service (moyenne)', couleur: '#0f766e', tirets: '6 3' },
    { points: xsP.map((x, i) => [x, r.ES.moy.sig[i] / 1000]), libelle: 'finale σ_p∞ (moyenne)', couleur: '#dc2626' },
    { points: xsP.map((x, i) => [x, r.ES.min.sig[i] / 1000]), libelle: EC ? `finale P_k,inf = ${F2(bp.rinf ?? 0.9)} P_m∞` : 'finale P2 = 0,98 σ_p0 − 1,2 Δσ', couleur: '#dc2626', tirets: '3 3' }] }),
  'Tensions dans les armatures de précontrainte le long de l\'ouvrage'));
  table(['Section', 'Frottement', 'Recul', 'Raccourc.', 'Δσ_i', 'Relaxation', 'Retrait', 'Fluage', r.reg === 'PSIDP84' ? 'Terme □' : EC ? '−0,2 Δσ_pr' : '−Δσ_ρ/6', EC ? 'Δσ_c+s+r' : 'Δσ_d', 'σ_p∞ moy.', EC ? 'P_k,inf [MPa]' : 'P2 [MPa]', 'F∞ moy. [MN]'], xT.map(x => {
    const fr = (dp.sigma0 * 1000 - r.at(r.friction.s, x));
    return [lab(x), MPa(fr), MPa(r.at(r.recoil.loss, x)), MPa(r.at(r.shortening.arr, x)), MPa(r.at(r.dSi, x)), MPa(r.at(r.delayed.dRho, x)), MPa(r.delayed.dR), MPa(r.at(r.delayed.dFl, x)), MPa(r.at(r.delayed.rect, x)), MPa(r.at(r.delayed.dSd, x)), MPa(r.at(r.ES.moy.sig, x)), MPa(r.at(r.ES.min.sig, x)), MN(r.at(r.ES.moy.F, x))];
  }), { small: true });
  const pertes = 1 - Math.min(...r.ES.moy.sig) / (dp.sigma0 * 1000), pMoy = 1 - r.ES.moy.sig.reduce((a, v) => a + v, 0) / r.ES.moy.sig.length / (dp.sigma0 * 1000);
  const recul = r.imposed ? 'Contrainte initiale imposée (frottement, recul et raccourcissement élastique compris)' : `Recul d'ancrage : longueur d'influence ${r.recoil.left ? F2(r.recoil.left.d) : F2(r.recoil.right.d)} m (∫₀^d 2[σ(x) − σ(d)] dx = g E_p, BPEL 3.3,12)`;
  if (EC) comment(`Pertes en MPa, EN 1992-1-1. ${recul}. ${r.imposed ? '' : 'Frottement σ_p0 e^(−μ(θ + kx)) (5.45) ; raccourcissement élastique E_p Σ j Δσ_c/E_cm(t), j = ½ pour la précontrainte et le poids propre, 1 pour les superstructures (5.44). '}Pertes différées (5.46) : Δσ_p,c+s+r = [ε_cs E_p + 0,8 Δσ_pr + (E_p/E_cm) φ σ_c,QP] / [1 + (E_p/E_cm)(A_p/A_c)(1 + A_c z_cp²/I_c)(1 + 0,8 φ)] ; les colonnes relaxation, retrait et fluage donnent les termes du numérateur (avant division), σ_c,QP au niveau du câble sous les charges permanentes, tassement probable compris, et la précontrainte initiale. Relaxation Δσ_pr à 500 000 h (§ 3.3.2, classe ${bp.relCls ?? 2}). Pertes totales moyennes ${F(100 * pMoy, 1)} % (maximum ${F(100 * pertes, 1)} %).`);
  else comment(r.reg === 'PSIDP84'
    ? `Pertes en MPa, convention de la note PSIDP-EL 84 (BPEL 83). ${recul}. Raccourcissement ½ (E_p/E_ij) σ̄_bj, σ̄_bj = ${MPa(r.shortening.sbj)} MPa (contrainte moyenne au niveau du câble sous la précontrainte seule). Relaxation 6/100 ρ₁₀₀₀ (σ_pi/f_prg − μ₀) σ_pi ; retrait ε_r E_p ; fluage K_fl E_p σ_b/E_i28 avec σ_b sous C.P. moyennes et précontrainte finale moyenne (iso + hyper), réajusté par itérations ; terme □ = −2 Δσ_ρ (Δσ_r + Δσ_fl)/σ_pi. Pertes totales moyennes ${F(100 * pMoy, 1)} % (maximum ${F(100 * pertes, 1)} %).`
    : `Pertes en MPa, BPEL 91 révisé 99. Frottement σ_p0 e^(−fα − φx) (3.3,11). ${recul}. Déformations instantanées du béton E_p Σ k Δσ_bj/E_ij, k = ½ pour la précontrainte et le poids propre appliqués à la mise en tension, k = 1 pour les superstructures posées ensuite (3.3,13), section par section. Retrait ε_r [1 − r(j)] E_p, r(t) = t/(t + 9 r_m), j = ${F(dp.bp.j ?? 7, 0)} jours, r_m = B/u (3.3,21 ; 2.1,51). Fluage (σ_b + σ_M) E_p/E_ij, σ_b sous C.P. moyennes et précontrainte finale moyenne (iso + hyper), σ_M maximale (mise en tension), réajusté par itérations (écart final ${F(r.delayed.conv[r.delayed.conv.length - 1] / 1000, 4)} MPa) (3.3,22). Relaxation 6/100 ρ₁₀₀₀ (σ_pi/f_prg − μ₀) σ_pi (3.3,23). Δσ_d = Δσ_r + Δσ_fl + 5/6 Δσ_ρ, fraction r(j) = ${F2(dp.bp.rj)} à la mise en service (3.3,24). Pertes totales moyennes ${F(100 * pMoy, 1)} % (maximum ${F(100 * pertes, 1)} %).`);

  // ------------------------------------------------------------------ hyperstatiques
  h2('Effets de la précontrainte : moments isostatiques et hyperstatiques');
  const ph = EC ? [['MT', 'moy', 'Mise en tension, P_m0'], ['MT', 'max', 'Mise en tension, P_k,sup'], ['MS', 'moy', 'Mise en service, P_m'], ['ES', 'moy', 'Temps infini, P_m∞'], ['ES', 'max', 'Temps infini, P_k,sup'], ['ES', 'min', 'Temps infini, P_k,inf']]
    : [['MT', 'moy', 'Mise en tension, moyenne'], ['MT', 'max', 'Mise en tension, P1'], ['MS', 'moy', 'Mise en service, moyenne'], ['MS', 'max', 'Mise en service, P1'], ['ES', 'moy', 'Service définitif, moyenne'], ['ES', 'min', 'Service définitif, P2']];
  table(['Phase', ...r.geo.x0.slice(1, -1).map((_, i) => `M_hyp appui ${i + 2} [kN·m]`), ...r.geo.x0.map((_, i) => `R_hyp ${i + 1} [kN]`)], ph.map(([a, b, l]) => [l, ...r[a][b].hyp.X.slice(1, -1).map(v => F(v, 1)), ...r[a][b].hyp.R.map(v => F(v, 1))]), { small: true });
  const es = r.ES.min;
  B.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'M [kN·m] (largeur totale)', series: [
    { points: xsP.map((x, i) => [x, es.F[i] * zc[i]]), libelle: `isostatique F·z (${EC ? 'P_k,inf' : 'P2'})`, couleur: '#0369a1' },
    { points: xsP.map((x, i) => [x, es.Mhyp[i]]), libelle: `hyperstatique (${EC ? 'P_k,inf' : 'P2'})`, couleur: '#b45309', tirets: '6 3' },
    { points: xsP.map((x, i) => [x, es.F[i] * zc[i] + es.Mhyp[i]]), libelle: `total (${EC ? 'P_k,inf' : 'P2'})`, couleur: '#dc2626' },
    { points: dp.xs.map(x => [x, -dp.M.cp(x).moy]), libelle: '− C.P. moyennes', couleur: '#64748b', tirets: '2 3' }] }),
  EC ? 'Moments dus à la précontrainte à temps infini (P_k,inf) et moment des charges permanentes changé de signe' : 'Moments dus à la précontrainte en service définitif (P2) et moment des charges permanentes changé de signe'));
  comment('Moments hyperstatiques par la méthode des forces sur la poutre continue à inertie constante (M_hyp,i = −Σ (D⁻¹)_ia ∫ m_a F z dx), linéaires entre appuis ; tranchants V_hyp = ΔM_hyp/L, réactions R_hyp à ajouter aux descentes de charges des appuis.');

  // ------------------------------------------------------------------ contraintes
  h2(EC ? 'Contraintes normales — EN 1992-1-1 § 5.10.2.2, 7.2 et décompression (tableau 7.1N)' : 'Contraintes normales — classe II (BPEL 6.1,2)');
  const st = c.stresses;
  const envS = (ph, k, fib, w) => st.map(s => [s.x, (w === 'min' ? Math.min : Math.max)(...s.phases[ph][k].map(q => q[fib])) / 1000]);
  B.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'σ [MPa] (compression > 0)', series: [
    { points: envS('ES', 'rare', 's', 'min'), libelle: EC ? 'temps infini, caractéristique — fibre sup. min' : 'E.S rare — fibre sup. min', couleur: '#0369a1' },
    { points: envS('ES', 'rare', 'i', 'min'), libelle: EC ? 'temps infini, caractéristique — fibre inf. min' : 'E.S rare — fibre inf. min', couleur: '#dc2626' },
    { points: envS('ES', 'rare', 's', 'max'), libelle: 'fibre sup. max', couleur: '#0369a1', tirets: '5 3' },
    { points: envS('ES', 'rare', 'i', 'max'), libelle: 'fibre inf. max', couleur: '#dc2626', tirets: '5 3' },
    { points: st.map(s => [s.x, Math.min(...s.phases.ES.rare.map(q => q.enc)) / 1000]), libelle: EC ? 'à 25 mm de la gaine (min)' : 'bord de la section d\'enrobage (min)', couleur: '#f59e0b' },
    { points: st.map(s => [s.x, -dp.lim.ft28 / 1000]), libelle: EC ? '−f_ctm' : '−f_t28', couleur: '#111827', tirets: '2 2', epaisseur: 1 },
    { points: st.map(s => [s.x, 0.6 * dp.lim.fc28 / 1000]), libelle: EC ? '0,6 f_ck' : '0,6 f_c28', couleur: '#111827', tirets: '8 3', epaisseur: 1 }] }),
  EC ? 'Contraintes extrêmes à temps infini (P_k,sup et P_k,inf), combinaisons caractéristiques' : 'Contraintes extrêmes en service définitif (P2), combinaisons rares'));
  if (EC) {
    table(['Phase / combinaison', 'Compression max / limite [MPa]', 'Décompression : σ min à 25 mm de la gaine / limite', 'Traction max (fibre extrême) / limite', 'Vérification', 'Règle', 'Sections déterminantes'], c.extremes.map(e => [e.lab, `${MPa(e.cmax)} / ${MPa(e.cLim)}`, `${MPa(e.enc)} / ${MPa(e.encLim)}`, `${MPa(e.hors)} / ${e.horsLim === null ? '—' : MPa(e.horsLim)}`, ok(e.ok), e.ref || '', `${e.where.c} ; ${e.where.enc} ; ${e.where.hors}`]), { small: true });
    comment(`Section nette (B_n, I_n(x)), v et v′ bruts${sec.imposee ? ' (section imposée)' : ''}. Chaque phase est calculée avec P_k,sup = ${F2(bp.rsup ?? 1.1)} P_m et P_k,inf = ${F2(bp.rinf ?? 0.9)} P_m (§ 5.10.9) et les charges permanentes min / max, tassement probable et aléatoire compris. Caractéristique : G + max(gr1a + 0,6 T ; ψ0 gr1a + T ; gr1b) ; fréquente : G + max(ψ1 gr1a + 0,5 T ; 0,6 T ; 0,75 gr1b) ; quasi permanente : G + 0,5 T (EN 1990 A2, tableau A2.1). Une traction supérieure à f_ctm sous la combinaison caractéristique signale une section fissurée : l'ouverture des fissures (§ 7.3.4, w_k ≤ 0,2 mm sous la combinaison fréquente pour des armatures adhérentes) et les armatures minimales (§ 7.3.2) sont alors à justifier.`);
  } else table(['Phase / combinaison', 'Compression max / limite [MPa]', 'Traction en section d\'enrobage / limite', 'Traction hors enrobage / limite', 'Vérification', 'Sections déterminantes'], c.extremes.map(e => [e.lab, `${MPa(e.cmax)} / ${MPa(e.cLim)}`, `${MPa(e.enc)} / ${MPa(e.encLim)}`, `${MPa(e.hors)} / ${e.horsLim === null ? '—' : MPa(e.horsLim)}`, ok(e.ok), `${e.where.c} ; ${e.where.enc}`]), { small: true });
  if (!EC) comment('Section nette (B_n, I_n(x)), v et v′ bruts. Mise en tension : ossature min/max + P1, limites 0,6 f_cj, −0,7 f_tj (enrobage, BPEL 91 révisé 99 ; la note PSIDP-EL de 1984 admettait −f_tj), −1,5 f_tj ; mise en service P1 et service définitif P2 : quasi permanente G + P (0,5 f_c28, pas de traction dans la section d\'enrobage), fréquente G + 0,6 (A ou B + trottoirs) (+ 0,5 T) (pas de traction dans la section d\'enrobage), rare G + max(1,2 A ; 1,2 B ; Mc ; D) + trottoirs (+ 0,6 T) (0,6 f_c28, −f_t28 dans la section d\'enrobage, −1,5 f_t28 ailleurs). Section d\'enrobage : bande de 3 Ø gaine centrée sur le câble moyen (contrainte au bord par interpolation linéaire).');

  // ------------------------------------------------------------------ aciers passifs et ELU
  h2('Armatures passives longitudinales et ELU de flexion');
  const idxT = c.stresses.map((s, k) => k).filter(k => xT.some(x => Math.abs(x - c.stresses[k].x) < 1e-6));
  table(['Section', 'A_s sup. : peau / non-fragilité → retenu [cm²]', 'A_s inf. : peau / 1,5 ‰ B / non-fragilité → retenu [cm²]', 'ELU E.S min : M_cal / M_lim [kN·m]', 'ELU E.S max : M_cal / M_lim', 'A_s complémentaire [cm²]'], idxT.map(k => {
    const s = c.steel[k], e = c.elu.find(q => Math.abs(q.x - s.x) < 1e-9 && q.ph === 'ES');
    const add = e ? Math.max(e.min.AsAdd || 0, e.max.AsAdd || 0) : 0;
    return [s.label, `${F(s.top.skin * 1e4, 1)} / ${F(s.top.nf * 1e4, 1)} → ${F(s.top.As * 1e4, 1)}`, `${F(s.bot.skin * 1e4, 1)} / ${F(s.bot.sup * 1e4, 1)} / ${F(s.bot.nf * 1e4, 1)} → ${F(s.bot.As * 1e4, 1)}`,
      e ? `${F0(e.min.Mcal)} / ${F0(-e.min.Mlim)} ${ok(e.min.ok)}` : '—', e ? `${F0(e.max.Mcal)} / ${F0(e.max.Mlim)} ${ok(e.max.ok)}` : '—', add ? (Number.isFinite(add) ? F(add * 1e4, 1) : 'section insuffisante') : '—'];
  }), { small: true });
  const eluES = c.elu.filter(q => q.ph === 'ES');
  B.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'M [kN·m] (largeur totale)', series: [
    { points: eluES.map(q => [q.x, q.max.Mcal]), libelle: `M_cal max (charges ELU + F z + M_hyp, ${EC ? 'P_m∞' : 'P2'})`, couleur: '#dc2626' },
    { points: eluES.map(q => [q.x, q.max.Mlim]), libelle: 'M_lim (fibre inf. tendue)', couleur: '#dc2626', tirets: '5 3' },
    { points: eluES.map(q => [q.x, q.min.Mcal]), libelle: 'M_cal min', couleur: '#0369a1' },
    { points: eluES.map(q => [q.x, -q.min.Mlim]), libelle: '−M_lim (fibre sup. tendue)', couleur: '#0369a1', tirets: '5 3' }] }),
  'ELU de flexion en service définitif : moments agissants et résistants'));
  if (EC) comment('Totalité de la largeur. Aciers de peau 3 cm²/m de parement et au moins 0,10 % de la section (disposition constructive) ; 1,5 ‰ de B en fibre inférieure sur 0,1 L de part et d\'autre des appuis intermédiaires (règle SETRA PSI-DP) ; armatures minimales des zones tendues sous la combinaison caractéristique A_s,min = k_c k f_ctm A_ct/f_yk (EN 1992-1-1 § 7.3.2, k_c avec σ_c = N/A_c, précontrainte adhérente non déduite). ELU : P_m (γ_P = 1), M_cal = M_ELU + F z + M_hyp, charges 1,35 G + 1,20 tassements + max(1,35 gr1a + 0,9 T ; 1,35 ψ0 gr1a + 1,5 T ; 1,35 gr1b) ; M_lim par équilibre de la section (parabole-rectangle 0,85 f_ck/1,5, pivots 3,5 ‰ / 10 ‰, f_yk/1,15, f_p0,1k/1,15).');
  else comment('Totalité de la largeur. Aciers de peau 3 cm²/m de parement et au moins 0,10 % de la section de béton (BPEL 6.1,31) ; 1,5 ‰ de B en fibre inférieure sur 0,1 L de part et d\'autre des appuis intermédiaires (règle SETRA PSI-DP) ; non-fragilité des zones tendues A_s = B_t/1000 + N_Bt f_t28/(f_e σ_Bt) sous les combinaisons rares (BPEL 6.1,32). ELU : N = F (P1 ou P2), M_cal = M_ELU + F z + M_hyp ; M_lim par équilibre de la section rectangulaire (largeur comprimée b_sup ou b_inf), béton parabole-rectangle 0,85 f_c28/γ_b, pivots 3,5 ‰ / 10 ‰, aciers passifs f_e/γ_s, surtension des armatures de précontrainte σ_p ≤ f_peg/γ_p (BPEL 6.3).');

  // ------------------------------------------------------------------ tranchant
  if (c.shear.length && EC) {
    h2('Effort tranchant au voisinage des appuis (EN 1992-1-1 § 6.2.2 et 6.2.3)');
    table(['Appui / côté', 'F (P_m∞) [MN]', 'V_P relevage + hyper [kN]', 'V_Ed [kN]', 'σ_cp [MPa]', 'ρ_l [%]', 'v_Rd,c [MPa] ; V_Rd,c [kN]', 'A_sw/s [cm²/m²]', 'V_Rd,max [kN]'], c.shear.map(s2 => [`appui ${s2.support + 1} ${s2.side}`, MN(s2.F), F0(s2.Vp), F0(s2.Velu), F2(s2.scp), F2(s2.rho * 100), `${F2(s2.vRdc)} ; ${F0(s2.VRdc)} ${s2.need ? '→ armatures' : '→ aucune armature'}`, s2.need ? F(s2.AswS * 1e4, 2) : '—', `${F0(s2.VRdmax)} ${ok(s2.ok)}`]), { small: true });
    comment('Section à d de l\'axe d\'appui, P_m∞ ; V_Ed = V_ELU + F sin α + V_hyp. V_Rd,c = [C_Rd,c k (100 ρ_l f_ck)^⅓ ≥ v_min + 0,15 σ_cp] b d (6.2.a/b), C_Rd,c = 0,18/γ_c, σ_cp = min(F/A_c ; 0,2 f_cd), ρ_l des aciers passifs de la face tendue (précontrainte non comptée), ≤ 2 % ; si V_Ed > V_Rd,c : A_sw/s = V_Ed/(z f_ywd cot θ) avec cot θ = 2,5, z = 0,9 d ; V_Rd,max = α_cw b z ν₁ f_cd/(cot θ + tan θ) (6.9).');
  } else if (c.shear.length) {
    h2('Effort tranchant au voisinage des appuis (BPEL 9.6 — dalles)');
    table(['Appui / côté', 'F (P2) [MN]', 'V_P relevage + hyper [kN]', 'V_red ELU [kN]', 'σ_x [MPa]', 'τ_réd,u / 0,09 f_c28/γ_b [MPa]', 'β_u [°] ; τ_u limite [MPa]', 'A_t/(b s_t) [cm²/m²]', 'Note PSIDP-EL : τ ELS / τ̄ [MPa]'], c.shear.map(s2 => [`appui ${s2.support + 1} ${s2.side}`, MN(s2.F), F0(s2.Vp), F0(s2.Velu), MPa(s2.sx),
      `${MPa(s2.tauU)} / ${MPa(s2.tau0)} ${s2.needAt ? '→ armatures' : '→ aucune armature'}`, `${F(s2.beta * 180 / Math.PI, 1)} ; ${MPa(s2.tauLim)} ${ok(s2.okBeton)}`, s2.needAt ? F(s2.AtS * 1e4, 2) : '—', `${MPa(s2.tau)} / ${MPa(s2.tauBar)} ${ok(s2.okELS)}`]), { small: true });
    comment('Section à h/2 de l\'axe d\'appui, P2 en service définitif ; V_red = V(G + Q) + F sin α + V_hyp. BPEL 9.6 (dalles, justifications à l\'ELU seul) : τ_réd,u = 1,5 V_réd,u/(b h) sur la section brute (9.6,3) ; aucune armature d\'effort tranchant si τ_réd,u ≤ 0,09 f_cj/γ_b et bétonnage sans reprise (9.6,41) ; sinon (A_t/(b s_t)) f_e/γ_s ≥ (τ_réd,u − f_tj/2) tg β_u (7.3,22 avec f_tj/2), minimum 0,1 MPa (0,4 MPa sur 0,5 h le long des bords libres) ; béton τ_réd,u ≤ (0,85 f_cj/3γ_b) sin 2β_u × (10h/3 si h < 0,30 m) (7.3,3, 9.6,42) ; β_u = max(30° ; ½ arctan(2τ_u/σ_x)). Dernière colonne : contrôle ELS de la note PSIDP-EL (BPEL 7.2,2 ; τ = V_red/(b_n · 2h/3)), non exigé pour les dalles.');
  }
  // ------------------------------------------------------------------ flexion transversale
  if (dp.trans && dp.trans.length) {
    h2('Flexion transversale due à la précontrainte');
    const tr = dp.trans, ys = tr[0].ys;
    B.push(svgBlock(lineChart({ xlabel: 'y [m]', ylabel: 'm_y [kN·m/m]', hauteur: 260, series: tr.flatMap((t, k) => [
      { points: ys.map((y, iy) => [y, t.myMax[iy]]), libelle: `travée ${t.j + 1} — P2 (E.S)`, couleur: ['#0369a1', '#dc2626', '#0f766e', '#b45309', '#7c3aed'][k % 5] },
      { points: ys.map((y, iy) => [y, t.myMin[iy]]), libelle: `travée ${t.j + 1} — × F1,MS/F2,ES`, couleur: ['#0369a1', '#dc2626', '#0f766e', '#b45309', '#7c3aed'][k % 5], tirets: '5 3' }]) }),
    'Moments transversaux dus à la poussée au vide du câble en travée (mi-travée)'));
    table(['Travée', 'Ā⁺ [1/m]', 'F2 E.S / F1 M.S [MN]', 'p [kPa]', 'm_y précontrainte P2 / × F1/F2 (extrêmes) [kN·m/m]', 'N = F h/B_n [kN/m]', 'A_s inf. avec / sans précontrainte [cm²/m]', 'A_s sup. avec / sans précontrainte [cm²/m]'], tr.map(t => [String(t.j + 1), F(t.Abar, 5), `${MN(t.F2)} / ${MN(t.F1)}`, F(t.p, 1), `${F(Math.min(...t.myMax), 1)} / ${F(Math.min(...t.myMin), 1)}`, F0(t.N),
      t.design ? `${F(t.design.bot.As * 1e4, 2)} / ${F(t.design.bot.AsBA * 1e4, 2)}` : '—', t.design ? `${F(t.design.top.As * 1e4, 2)} / ${F(t.design.top.AsBA * 1e4, 2)}` : '—']), { small: true });
    comment('Poussée au vide uniforme p = −F2 · 2Ā⁺/2b (Ā⁺ : moyenne pondérée des coefficients A > 0 des paraboles de la travée ; la note PSIDP-EL divise par 9 m au lieu de la largeur, point non élucidé), appliquée sur toute la largeur de la travée droite équivalente ; m_y par le noyau de Guyon-Massonnet des charges permanentes (ν de la dalle), valeur maximale avec P2 en service définitif, minimale × F1,MS/F2,ES. Aciers transversaux BAEL (flexion simple, sans l\'effort normal longitudinal) avec m_y(précontrainte) ajouté aux combinaisons ELS et ELU de la flexion transversale du béton armé ; la précontrainte allège la nappe inférieure et sollicite la nappe supérieure.');
  }

  // ------------------------------------------------------------------ flèches
  if (dp.defl) {
    h2('Flèches et contre-flèches');
    const D = dp.defl, mm = arr => xsP.map((x, i) => [x, 1000 * arr[i]]);
    B.push(svgBlock(lineChart({ xlabel: 'x [m]', ylabel: 'w [mm] (vers le haut)', series: [
      { points: mm(D.w.oss), libelle: 'ossature, instantanée', couleur: '#64748b', tirets: '2 3' },
      { points: mm(D.w.cp), libelle: 'C.P., instantanée', couleur: '#64748b' },
      { points: mm(D.w.cpTot), libelle: 'C.P., à long terme', couleur: '#111827' },
      { points: mm(D.w.pI), libelle: 'précontrainte, instantanée', couleur: '#0369a1', tirets: '5 3' },
      { points: mm(D.w.pFl), libelle: 'précontrainte, par fluage', couleur: '#0369a1' },
      { points: mm(D.w.miseEnTension), libelle: 'à la mise en tension (ossature + P)', couleur: '#0f766e' },
      { points: mm(D.w.service), libelle: 'en service après fluage', couleur: '#dc2626', epaisseur: 3 }] }),
    'Flèches des charges permanentes et contre-flèches de précontrainte'));
    const xMid = spans.map((L, j) => r.xOf(j, j === 0 && spans.length > 1 ? 0.4 : j === spans.length - 1 && spans.length > 1 ? 0.6 : 0.5));
    table(['Section', 'Ossature inst.', 'C.P. inst.', 'C.P. long terme', 'P inst.', 'P fluage', 'Mise en tension', 'Service après fluage'], xMid.map(x => [lab(x), ...['oss', 'cp', 'cpTot', 'pI', 'pFl', 'miseEnTension', 'service'].map(k => F(1000 * r.at(D.w[k], x), 1))]), { small: true });
    table(['Appui', 'Rotation C.P. inst. g / d [10⁻³ rad]', 'Rotation P inst.', 'Rotation en service'], D.rot.cp.map((q, i) => [String(i + 1), `${q.g == null ? '—' : F(q.g * 1000, 2)} / ${q.d == null ? '—' : F(q.d * 1000, 2)}`, `${D.rot.pI[i].g == null ? '—' : F(D.rot.pI[i].g * 1000, 2)} / ${D.rot.pI[i].d == null ? '—' : F(D.rot.pI[i].d * 1000, 2)}`, `${D.rot.service[i].g == null ? '—' : F(D.rot.service[i].g * 1000, 2)} / ${D.rot.service[i].d == null ? '—' : F(D.rot.service[i].d * 1000, 2)}`]), { small: true });
    comment(`Flèches en mm (positives vers le haut) ; poutre continue à inertie brute constante sous les moments réels (hyperstatiques compris). E_ij = ${F0(D.Eij / 1000)} MPa (ossature, C.P. et précontrainte instantanées) ; long terme des C.P. (1 + K_fl) w(E_i28) (E_v28 = E_i28/3 pour K_fl = 2) ; précontrainte par fluage K_fl · w(P∞ moyenne, E_i28), convention retrouvée sur la note PSIDP-EL (15,2 mm calculés pour 15,0). Une flèche finale proche de zéro ou positive traduit la prépondérance de la précontrainte (contre-flèche de coffrage à prévoir en conséquence).`);
  }
  // ------------------------------------------------------------------ ouvrage courbe
  if (dp.courbe) {
    const C = dp.courbe, n = dp.n;
    h2('Ouvrage courbe — effets de la courbure en plan sur la précontrainte');
    table(['Effet', 'Valeur', 'Règle'], [
      ['Déviation angulaire horizontale cumulée α_h (câbles parallèles à l\'axe)', `${F(C.aHtot, 3)} rad`, 'frottement σ = σ_p0 e^(−f α − φ x), Δα = √(Δθ_v² + Δθ_h²) pas à pas (BPEL 3.3,11 ; EN 1992-1-1 § 5.10.5.2)'],
      ['Rayon minimal sur le tablier ; unité la plus intérieure (à ' + F2(C.yInt) + ' m de l\'axe)', `${F(C.rMin, 1)} m ; ${F(C.rInt, 1)} m`, '—'],
      ['Poussée au vide d\'une unité, vers le centre de courbure : P_max/R', `${F(C.qUnit, 1)} kN/m (P_max = 1,02 σ_p0 A_p = ${F0(C.Pmax1)} kN)`, 'force radiale du câble courbe sur le béton'],
      ['Armatures de couture (épingles horizontales autour des gaines, côté concave)', `${F(C.At * 1e4, 2)} cm²/m par unité ; ${F(C.AtTot * 1e4, 1)} cm²/m pour les ${n} unités`, 'A_t f_e/γ_s ≥ P_max/R'],
      ['Couple réparti de la poussée radiale m_t = F z κ (F moyen en service)', `${F(C.mtMax, 1)} kN·m/m au plus`, 'z : cote du câble par rapport au centre de gravité'],
    ], { small: true });
    if (C.dR) table(['Ligne', ...C.dR[0].map((_, k) => `Appareil ${k + 1}`)], C.dR.map((row, i) => [i === 0 ? 'C0' : i === C.dR.length - 1 ? `C${i}` : `P${i}`, ...row.map(v => F0(v))]), { small: true });
    comment(`La poussée radiale des câbles s'exerce à la cote du câble : elle tord le tablier autour de son axe (couple m_t = F z κ). Sur la plaque, ce couple est appliqué comme une pression linéaire en travers q(y) = 3 m_t y/(2 b³) ; le tableau donne les réactions différentielles des appareils qui en résultent [kN, appareil 1 du côté y < 0, extérieur d'un virage à gauche], ajoutées aux réactions de précontrainte dans le dimensionnement des appareils d'appui. La perte par frottement tient compte de la déviation horizontale des câbles ; la poussée au vide est reprise par des épingles de couture autour des gaines, à disposer du côté concave sur toute la longueur courbe.`);
  }
  // ------------------------------------------------------------------ zones d'about
  if (dp.anchors) {
    const A = dp.anchors, W = dp.sec.bBot, cm = v => F(v * 1e4, 1), cmm = v => F(v * 1e4 / W, 1);
    h2('Zones d\'about — ancrages et bielle d\'about (BPEL 91, annexe 4 et article 7.5)');
    const L = A.layout || {};
    if (L.spMin) comment(`Implantation des ancrages : entraxe ${A.spacing ? F0(A.spacing * 1000) : '—'} mm ≥ ${F0(L.spMin * 1000)} mm ${ok(L.okSpacing)} ; distance au bord ${F0(A.edge * 1000)} mm${L.edgeMin ? ` ≥ ${F0(L.edgeMin * 1000)} mm (agrément)` : ''} ; ${A.rows === 1 ? `une nappe : h = ${F0(dp.sec.h * 1000)} mm ≥ 2 × ${F0(A.edge * 1000)} mm` : 'deux nappes'} ${ok(L.okVertical)}${dp.unit.fcm0 ? ` ; minima de l'agrément donnés pour f_cm,0 = ${F0(dp.unit.fcm0)} MPa à la mise en tension (f_cj saisi : ${F(dp.fcj, 1)} MPa)` : ''}.`);
    para(`${dp.n} ancrages ${dp.unit.label} par about, ${A.rows === 1 ? 'une nappe centrée sur le câble' : 'deux nappes (h insuffisante pour une nappe)'} de ${A.perRow} ancrages${A.spacing ? `, entraxe ${F2(A.spacing)} m, ancrages de rive à ${F2(A.edge)} m du bord` : ''} ; plaque a = ${F2(A.a)} m ; F_j0 = σ_p0 A_p = ${F(A.Fj0 / 1000, 3)} MN par ancrage ; σ_s,lim = 2/3 f_e = ${F0(A.ssl / 1000)} MPa.`);
    for (const S of A.sides) {
      const V = S.vert, H = S.hor, b2 = S.bielle;
      table([`About ${S.side}`, 'Plan vertical (nappes, e′ = b)', 'Plan horizontal (files, e′ = h)'], [
        ['Prismes symétriques d_j [m]', V.levels.map(q => F2(q.d)).join(' / '), `${F2(H.levels[0].d)} (rive) / ${H.levels.length > 2 ? F2(H.levels[1].d) : '—'} (courant)`],
        ['σ_tej max / 1,25 f_tj [MPa]', `${MPa(V.sigT)} / ${MPa(1.25 * dp.lim.ftj)} ${ok(V.okT)}`, `${MPa(H.sigT)} ${ok(H.okT)}`],
        ['σ_xmj max / 2/3 f_cj [MPa]', `${MPa(V.sigX)} / ${MPa(2 / 3 * dp.lim.fcj)} ${ok(V.okX)}`, `${MPa(H.sigX)} ${ok(H.okX)}`],
        ['Frettage de surface A_s [cm²] (total ; par m)', `${cm(V.As)} ; ${cmm(V.As)} /m`, `${cm(H.As)}`],
        ['Éclatement A_e [cm²] sur max d_j', `${cm(V.Ae)} ; ${cmm(V.Ae)} /m sur ${F2(V.Lzone)} m (cadres verticaux)`, `${cm(H.Ae)} sur ${F2(H.Lzone)} m (barres transversales)`],
        ['Équilibre général : V_x max [kN] ; τ_d [MPa]', `${F0(S.gV.VxMax)} ; ${MPa(S.gV.tauD)}`, `${F0(S.gH.VxMax)} ; ${MPa(S.gH.tauD)}`],
        ['τ_g = max(τ_d + τ) / 1,5 f_tj [MPa]', `${MPa(S.gV.tauG)} / ${MPa(S.gV.tauLim)} ${ok(S.gV.ok)}`, `${MPa(S.gH.tauG)} ${ok(S.gH.ok)}`],
        ['A_c [cm²] ; complément A_c − A_s − A_e', `${cm(S.gV.Ac)} ; ${S.complV > 0 ? `${cm(S.complV)} sur ${F2(2 * dp.sec.h / 3)} m` : 'aucun'}`, `${cm(S.gH.Ac)} ; ${S.complH > 0 ? cm(S.complH) : 'aucun'}`],
      ], { small: true });
      comment(`Bielle d'about (7.5,11) : R_u = ${F0(b2.Ru)} kN (ELU, réaction hyperstatique de précontrainte comprise), β_u = ${F(b2.beta * 180 / Math.PI, 1)}° → effort à équilibrer R_u cotg β_u = ${F0(b2.Hb)} kN ; ${b2.lowTendons ? `${b2.lowTendons} armatures de précontrainte en partie inférieure à ${MPa(b2.sp1)} MPa = ${F0(b2.Fp)} kN` : 'ancrages sur la fibre moyenne : armatures de précontrainte non comptées'} ; armatures passives inférieures à ancrer au-delà du nu de l'appui : ${cm(b2.AsInf)} cm² (${cmm(b2.AsInf)} cm²/m).`);
    }
    comment('BPEL 91 révisé 99, annexe 4 (1.1,13 prisme symétrique d_j = 2 inf(c_j, c_j*) ; 1.2,1 A_s = 0,04 max F_j0/σ_s,lim ; 1.2,21 σ_tej = 0,5 (1 − a_j/d_j) F_j0/(e′ d_j) ≤ 1,25 f_tj, σ_xmj = F_j0/(e′ d_j) ≤ 2/3 f_cj ; 1.2,22 R_j = 0,25 (1 − a_j/d_j) F_j0, A_ej = R_j/(k_j σ_s,lim), k_j = 1 niveau extrême, 1,5 intermédiaire, A_e = sup(max A_ej ; 0,15 max F_j0/σ_s,lim) ; 1.3 forces F_j (P1 à l\'ancrage) réparties sur (a_j + d_j)/2 ≤ 2a_j, τ_d = 2V_x/(e′ l_r), τ_g max ≤ 1,5 f_tj ; 1.3,2 V_xe = V_x [1 − (f_tj/3τ_d)²], A_c = |V_xe|max/σ_s,lim). Aciers continus sur toute la hauteur du panneau (frettages de l\'agrément du procédé redimensionnés). Coin inférieur (7.5,2) : vérifier la couture des plans de rupture entre le nu intérieur de l\'appareil d\'appui et les ancrages (armatures de la bielle souvent suffisantes). Le guide SETRA 1989 (§ 3.3) conseille deux nappes d\'ancrages, la nappe inférieure participant alors à l\'équilibre de la bielle. Dimensions des plaques : forfaitaires, à remplacer par celles de l\'agrément du procédé.');
  }
  return B;
}
