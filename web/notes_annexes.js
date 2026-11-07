/**
 * Blocs de note de calcul des ouvrages annexes : dalles de transition des culées (note du pont, après les appuis) et murs
 * en aile des cadres et portiques (note du cadre). Mêmes calculs que les feuilles de plans APP-DT et OH-AIL-01.
 */
import { culeesAvecDalle, dalleTransitionCulee, reperesDalleTransition } from '../src/plans/dalle_transition.js';
import { ailesCadre, reperesAiles } from '../src/plans/murs_aile.js';

const F = (v, n = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F3 = v => F(v, 3);
const cm2 = As => F(As * 1e4, 2);                                     // m²/m → cm²/m
const ha = (phi, s) => `HA${phi} e = ${F0(s * 100)} cm`;
const ok = b => (b ? 'OK' : 'NON');
const masse = marks => marks.reduce((S, m) => S + m.masse, 0);

/** Dalles de transition des culées (EN 1991-2, EN 1992-1-1) ; [] si aucune culée n'en porte. */
export function dalleTransitionBlocks(st) {
  let lignes = [];
  try { lignes = culeesAvecDalle(st); } catch (e) { return []; }
  if (!lignes.length) return [];
  const B = [], h2 = text => B.push({ t: 'h2', text }), h3 = text => B.push({ t: 'h3', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  para('Dalle sur deux appuis simples, le corbeau du garde-grève et le remblai (béton de propreté sur remblai compacté), calculée par mètre de largeur selon l\'EN 1991-2 et l\'EN 1992-1-1, quel que soit le règlement du tablier. Dessus à 0,30 m sous la chaussée au droit du garde-grève, pente de 5 % vers le remblai, joint de 2 cm en polystyrène contre le garde-grève (guide Sétra « Dalles de transition des ponts-routes », 1984 ; plans relus OA68).');
  for (const i of lignes) {
    let D, marks;
    try { D = dalleTransitionCulee(st, i); marks = reperesDalleTransition(D); } catch (e) { para(`Culée ${i} : dalle de transition non calculée (${e.message}).`); continue; }
    const K = D.K, C = D.Kc, q = st.supports.lines && st.supports.lines[i] && st.supports.lines[i].EC && st.supports.lines[i].EC.dalleQ;
    h2(`Dalle de transition — culée ${D.A.nom}`);
    table(['Grandeur', 'Valeur'], [
      ['Longueur L ; portée de calcul L_c = L − 0,30 m', `${F(K.L)} m ; ${F(K.Lc)} m`],
      ['Largeur entre murs en retour (joints de 2 cm) ; bord sur le garde-grève', `${F(D.B)} m ; ${F(D.Bk)} m${D.psi < 100 - 1e-6 ? ` (biais ${F1(D.psi)} gr)` : ''}`],
      ['Épaisseur retenue ; hauteur utile du lit inférieur', `${F(K.e)} m${K.e > 0.30 + 1e-9 ? ' (portée au-delà de 0,30 m par la flexion ou l\'effort tranchant)' : ''} ; ${F3(K.d)} m`],
      ['Enrobages dessus / sous-face (coulée sur béton de propreté)', `${F0(D.c * 100)} / ${F0(D.cS * 100)} cm`],
      ['Couverture moyenne (remblai et chaussée, γ = 20 kN/m³) ; charge permanente g', `${F(K.hm)} m ; ${F1(K.g)} kN/m²`],
      ['Voies de 3 m chargées par des tandems (LM1)', `${K.nv}`],
    ], { small: true });
    h3('Efforts par mètre de largeur');
    table(['Effet', 'G', 'TS (LM1)', 'UDL (LM1)', 'LM2', 'Q retenu', 'ELU', 'ELS car.', 'QP'], [
      ['Moment en travée, bandes [kN·m/m]', F1(K.M.G), F1(K.M.TS), F1(K.M.UDL), F1(K.M.LM2), `${F1(K.M.Q)} (${K.gouverne === 'plaque' ? 'plaque' : K.gouverne})`, F1(K.M.ELU), F1(K.M.ELS), F1(K.M.QP)],
      ...(K.M.plaque != null ? [['Moment en travée, plaque : trafic (TS + UDL ou LM2) [kN·m/m]', '—', '—', '—', '—', `${F1(K.M.plaque)} (bandes ${F1(K.M.bandes)})`, '—', '—', '—']] : []),
      ['Effort tranchant à d de l\'appui [kN/m]', F1(K.V.G), '—', '—', '—', F1(K.V.Q), F1(K.V.ELU), '—', '—'],
      ['Réaction sur le corbeau [kN/m]', F1(K.corbeau.G), '—', '—', '—', F1(K.corbeau.Q), F1(K.corbeau.ELU), '—', '—'],
    ], { small: true });
    if (K.transv) comment('Calcul de plaque : éléments DKT (src/plate/fe.js), dalle en parallélogramme sur appuis linéaires rigides le long des deux bords parallèles au garde-grève, bords longitudinaux libres ; surfaces d\'influence de m_x, m_y et m_xy en des points des lignes à L_c/2 et L_c/4 ; voies TS (dans les deux ordres) et essieu LM2 déplacés en long et en travers, UDL sur toute la dalle ; le moment principal retenu est le plus grand des deux méthodes.');
    comment('Roues diffusées à 1/1 jusqu\'au feuillet moyen (EN 1991-2 § 4.3.6) ; largeur efficace b_m = t + 2,5 x (1 − x/L_c) pour le moment (DAfStb Heft 240), b_v = t + 2x pour l\'effort tranchant (45° jusqu\'à l\'appui) ; charges voisines regroupées, largeurs tronquées aux bords ; enveloppe par déplacement des essieux ; ELU 1,35 (G + Q) ; charges à a_v ≤ 2d d\'un appui réduites de β = a_v/2d (EN 1992-1-1 § 6.2.2(6)).');
    h3('Armatures et vérifications');
    table(['Vérification', 'Projet', 'Exigence', 'Résultat'], [
      ['Nappe inférieure // axe (flexion)', `${ha(K.inf.phi, K.inf.s)} = ${cm2(K.inf.As)} cm²/m`, `max(ELU ${cm2(K.As.ELU)} ; ELS ${cm2(K.As.ELS)} ; fissuration ${cm2(K.As.fissuration)} ; minimum ${cm2(K.As.min)}) = ${cm2(K.As.requis)} cm²/m`, ok(K.okAs)],
      ...(K.transv ? [
        ['Inférieure // garde-grève (plaque, Wood-Armer m_y + |m_xy|)', `${ha(K.rep.phi, K.rep.s)} = ${cm2(K.rep.As)} cm²/m`, `max(ELU ${cm2(K.transv.inf.ELU)} ; ELS ${cm2(K.transv.inf.ELS)} ; 20 % ${cm2(0.2 * K.inf.As)} ; min.) = ${cm2(K.transv.inf.requis)} cm²/m — M_Ed = ${F1(K.transv.inf.M.ELU)} kN·m/m`, ok(K.rep.As + 1e-12 >= K.transv.inf.requis)],
        ['Supérieure // garde-grève (plaque, m_y − |m_xy|)', `${ha(K.supT.phi, K.supT.s)} = ${cm2(K.supT.As)} cm²/m`, `${cm2(K.transv.sup.requis)} cm²/m — M_Ed = ${F1(K.transv.sup.M.ELU)} kN·m/m`, ok(K.supT.As + 1e-12 >= K.transv.sup.requis)],
        ['Supérieure // axe', `${ha(K.sup.phi, K.sup.s)} = ${cm2(K.sup.As)} cm²/m`, 'minimum par face', 'OK'],
      ] : [
        ['Répartition inférieure // garde-grève', `${ha(K.rep.phi, K.rep.s)} = ${cm2(K.rep.As)} cm²/m`, `≥ 20 % des principales = ${cm2(0.2 * K.inf.As)} cm²/m (§ 9.3.1.1(2))`, ok(K.rep.As >= 0.2 * K.inf.As - 1e-12)],
        ['Nappe supérieure (deux directions)', `${ha(K.sup.phi, K.sup.s)} = ${cm2(K.sup.As)} cm²/m`, 'minimum par face', 'OK'],
      ]),
      ['Effort tranchant sans armatures', `V_Ed = ${F1(K.V.ELU)} kN/m`, `V_Rd,c = ${F1(K.VRdc)} kN/m (§ 6.2.2)`, ok(K.okV)],
      ['Corbeau : tirant (annexe J.3)', `${ha(C.tirant.phi, C.tirant.s)} = ${cm2(C.tirant.As)} cm²/m`, `(F_Ed a_c/z₀ + 0,2 F_Ed)/f_yd = ${F1(C.Ft)} kN/m → ${cm2(C.As)} cm²/m`, ok(C.tirant.As + 1e-12 >= C.As)],
      ['Corbeau : U horizontaux', `${ha(C.cadres.phi, C.cadres.s)} = ${cm2(C.cadres.As)} cm²/m`, `≥ 0,5 A_s = ${cm2(C.lien)} cm²/m (a_c ≤ 0,5 h_c)`, ok(C.cadres.As + 1e-12 >= C.lien)],
      ['Corbeau : bielle', `σ = ${F1(C.sig)} MPa (θ = ${F1(C.theta)}°)`, `≤ ν′ f_cd = ${F1(C.sigRd)} MPa`, ok(C.ok)],
    ], { small: true });
    if (q) para(`Efforts d'ensemble de la culée (EN 1991-2) : trafic transmis par la dalle retenu N = ${F0(q.N)} kN, soit le plus grand du forfait (${F0(q.forfait)} kN, 60 kN/m sur le tiers de la largeur) et du trafic que la dalle ajoute à celui du tablier (${F0(q.dN)} kN = UDL de la dalle ${F0(q.RU)} kN + max(0 ; TS sur la dalle ${F0(q.RTSs)} − TS sur le tablier ${F0(q.RTSd)}) kN) : LM1 étant un modèle unique, un tandem est sur le tablier ou sur la dalle.`);
    para(`Aciers de la dalle et du corbeau : ${F0(masse(marks))} kg (${marks.length} repères, feuille APP-DT-${D.A.nom}).`);
  }
  comment('Limites : effort tranchant par la méthode des bandes seule ; goujons HA20 L = 0,60 m e = 0,50 m (disposition constructive) ; réaction locale par mètre utilisée pour la dalle et le corbeau seulement.');
  return B;
}

/** Murs en aile d'un cadre ou d'un portique (guide Sétra 1992 § 2.8.1, § 3.6.1, annexe ; DT422 § 2.1) ; [] si non demandés. */
export function mursAileBlocks(cadre) {
  let A = null;
  try { A = ailesCadre(cadre); } catch (e) { return [{ t: 'p', text: `Murs en aile non calculés : ${e.message}` }]; }
  if (!A || !A.ailes.some(a => a.Lw)) return [];
  const B = [], h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const K = A.calc, V = K.voile, S = K.semelle, code = A.h.code === 'EC2' ? 'EN 1992-1-1' : 'BAEL 91';
  h2('Implantation (guide « Ponts-cadres et portiques », 1992, § 2.8.1)');
  para(`Quatre murs indépendants du cadre (joint de 2 cm au droit des piédroits), en T renversé. Angles mesurés depuis l'axe de la voie franchie : ${Number.isFinite(cadre.inp.opts.ailes && cadre.inp.opts.ailes.angle) ? `angle saisi θ = ${F(cadre.inp.opts.ailes.angle)}°` : `proposition du guide α = 15 + 0,03 L², β = 0,008 (φ + 25) α (grades), avec L = ${F(A.geo.Lo)} m${A.nCell > 1 ? ' (ouvrage multiple : 1,15 D)' : ''} et φ = ${F1(A.geo.biais / 0.9)} gr, soit α = ${F(A.prop.alpha)}° et β = ${F(A.prop.beta)}° ; β, le plus petit, au coin aigu de la tête, où le mur est le plus long, pour égaliser les surfaces vues (figure 35)`}. Arête 0,20 m sous la trace du talus (pente 1/${F1(A.m)}, perpendiculaire aux têtes), trace à ${F(A.ht)} m au-dessus de la traverse en tête, ${F(A.hmin)} m au moins au-dessus du terrain naturel en bout, mur prolongé de 0,20 m au-delà du pied du talus (§ 3.6.1).`);
  table(['Aile', 'Coin de la tête', 'θ [°]', 'Longueur [m]', 'Hauteur du voile à l\'enracinement / en bout [m]', 'Largeur vue L_w sin θ [m]'],
    A.ailes.map(a => [a.label, `${a.aigu ? 'aigu' : 'obtus'} (${F1(a.angCoin)}°)`, F(a.theta), F(a.Lw), `${F(a.hv0)} / ${F(a.hEnd)}`, F(a.Avue)]), { small: true });
  para(`Surfaces vues : ${A.surfacesVues.map(q => `tête ${q.end}, écart ${F0(q.ecart * 100)} %`).join(' ; ')}.`);
  h2(`Voile et semelle (section d'enracinement, ${code})`);
  table(['Grandeur', 'Valeur'], [
    ['Hauteur du voile au-dessus de la semelle', `${F(K.hv)} m`],
    ['Épaisseur en tête ; à la base', `${F(K.eT)} m ; ${F(K.eB)} m (fruit : ${F3(K.eFruit)} m ; abaque e_m, h_c = h − 0,50 m : ${F3(K.em)} m)`],
    ['Poussée : K_a ; γ ; surcharge de remblai q', `${F(K.Ka)} ; ${F0(K.gamma)} kN/m³ ; ${F0(K.q)} kN/m²`],
    ['Pied du voile : M_G / M_Q / M_u / M_ser', `${F1(V.Mg)} / ${F1(V.Mq)} / ${F1(V.Mu)} / ${F1(V.Ms)} kN·m/m`],
    ['Verticales côté terres : requis ; retenu', `${F(V.As)} cm²/ml ; ${ha(V.main.phi, V.main.s)} = ${F(V.main.As)} cm²/ml${Number.isFinite(V.wk) ? ` (w_k = ${F3(V.wk)} mm)` : ''}`],
    ['Verticales du parement avant ; horizontales (deux faces)', `${ha(V.avant.phi, V.avant.s)} ; ${ha(V.horiz.phi, V.horiz.s)} (≥ 25 % des verticales)`],
    ['Effort tranchant V_u', `${F1(V.Vu)} kN/m — ${V.T.ok ? 'vérifié sans armatures' : 'NON vérifié'}`],
    ['Semelle : largeur B (patin a ; talon b) ; épaisseur', `${F(S.B)} m (${F(S.a)} ; ${F(S.b)}) ; ${F(K.es)} m (épaisseur de la base du mur, DT422 § 2.1)`],
    ['Renversement ΣM_stab/ΣM_renv ; glissement N tan φ/H (≥ 1,5)', `${F(S.FSr)} ; ${F(S.FSg)} (φ = ${F0(K.phiSol)}°)`],
    ['Excentricité sous G + Q ; tiers central B/6', `${F3(S.ex)} m ; ${F3(S.B / 6)} m`],
    ['Contraintes σ_max / σ_min / σ_réf = (3σ_max + σ_min)/4', `${F1(S.s1)} / ${F1(S.s2)} / ${F1(S.qref)} kPa${K.qadm > 0 ? ` (≤ ${F0(K.qadm)} kPa admissible)` : ' (contrainte admissible non saisie)'}`],
    ['Talon (nappe supérieure) : M_u ; aciers', `${F1(S.MtalU)} kN·m/m ; ${ha(S.talon.choix.phi, S.talon.choix.s)}`],
    ['Patin (nappe inférieure) : M_u ; aciers', `${F1(S.MpatU)} kN·m/m ; ${ha(S.patin.choix.phi, S.patin.choix.s)}`],
    ...(K.seisme ? [
      ['Séisme : k_h ; k_v ; angle de frottement du remblai (déduit de K_a)', `${F3(K.seisme.kh)} ; ±${F3(K.seisme.kv)} ; ${F1(K.seisme.phiR)}°`],
      ['Séisme : K_AE de Mononobe-Okabe (θ = atan k_h/(1 ∓ k_v)) ; cas défavorable', `${F3(K.seisme.K)} (θ = ${F1(K.seisme.th)}°, k_v ${K.seisme.sg > 0 ? 'vers le haut' : 'vers le bas'})`],
      ['Séisme, pied du voile : P_a statique / E_d total / M_E', `${F1(K.seisme.voile.Pa)} / ${F1(K.seisme.voile.Ed)} kN/m ; ${F1(K.seisme.voile.M)} kN·m/m → A_s ${F(K.seisme.voile.As)} cm²/ml${K.seisme.voile.gouverne ? ' (gouverne)' : ''}`],
      ['Séisme, semelle : renversement ; glissement (≥ 1) ; excentricité (≤ B/3)', `${F(S.seisme.FSr)} ; ${F(S.seisme.FSg)} ; ${F3(S.seisme.ex)} m`],
    ] : []),
    ['Verdict', K.ok ? 'toutes les vérifications sont satisfaites' : 'NON — voir les lignes ci-dessus'],
  ], { small: true });
  if (K.seisme) comment('Séisme (EN 1998-5 § 7.3.2 et annexe E) : action du cadre, k_h = a_g S / g avec r = 1 (mur en béton armé fléchi, tableau 7.1), k_v = ± 0,5 k_h ; poussée totale de Mononobe-Okabe E_d = ½ K_AE γ (1 ± k_v) H², frottement terre-écran nul, incrément dynamique appliqué à mi-hauteur ; inertie du voile, de la semelle et des terres du talon ; surcharge de trafic ψ₂ = 0 ; situation accidentelle à coefficients partiels unitaires (aciers : moment équivalent M_E / 1,15) ; lorsque le glissement fixe la largeur de la semelle, une bêche la réduirait (non calculée).');
  if (A.calc2) {
    const K2 = A.calc2, V2 = K2.voile, S2 = K2.semelle;
    para(`Zone 2 (seconde moitié du rampant, figure 70 : semelle de largeur variable), calculée à sa hauteur maximale h_v = ${F(K2.hv)} m : base ${F(K2.eB)} m ; verticales côté terres ${ha(V2.main.phi, V2.main.s)} (${F(V2.As)} cm²/ml requis) ; semelle ${F(S2.B)} m (patin ${F(S2.a)}, talon ${F(S2.b)}) ; renversement ${F(S2.FSr)}, glissement ${F(S2.FSg)}, σ_réf ${F1(S2.qref)} kPa — ${K2.ok ? 'vérifications satisfaites' : 'NON'}.`);
  }
  para(`Revanche horizontale de ${F(A.lr)} m en tête, sous la corniche (§ 3.6.1, figure 48). Jonction avec le piédroit (§ 3.6.1 b, figure 71) : ${A.jonction === 'sol1' ? 'solution 1, joint ouvert devant l\'extrémité du piédroit, qui laisse le mur libre de tasser ; sa rotation sous la poussée étant gênée, la face avant est tendue près de la jonction : les verticales avant y reçoivent la section des verticales côté terres sur 1,00 m (disposition PSIDA, le guide ne chiffrant pas ce ferraillage)' : 'solution 2, joint plan, à réserver aux bons terrains de fondation ; le parement avant reçoit un fruit initial supérieur au fruit final, la rotation du mur sous la poussée le réduisant'}.`);
  const marks = reperesAiles(A);
  para(`Aciers des quatre murs : ${F0(masse(marks))} kg (${marks.length} repères, feuille OH-AIL-01).`);
  comment(`Limites : deux zones de calcul (enracinement, mi-longueur du rampant) ; poussée active sous talus horizontal ; ${K.seisme ? '' : 'séisme non activé dans l\'onglet du cadre ; '}niveau d'assise variable des murs longs (figure 70) non dessiné.`);
  return B;
}
