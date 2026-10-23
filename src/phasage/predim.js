/**
 * Prédimensionnement des ouvrages calculés par phases : règles d'élancement et d'épaisseurs des guides du Sétra, puis
 * précontrainte ou semelles estimées par un équilibre simple. Les valeurs proposées remplissent les champs du formulaire ;
 * le calcul par phases et les vérifications de l'ouvrage terminé restent la justification.
 *
 *  - poutres rendues continues : élancement total H/L ≈ 1/18 (guide Sétra VIPP 1996 § 3.2.1 : 1/16 à 1/18 en travées
 *    indépendantes ; la continuité permet de viser le bas de la plage), table ≥ 0,6 h (§ 3.2.3), âme 20 cm (§ 3.2.2),
 *    talon 60 à 90 cm (§ 3.2.4) ; précontrainte : compression résiduelle en fibre inférieure à mi-travée sous charges
 *    permanentes à t∞ (pertes différées ≈ 20 %), moment de continuité forfaitaire ;
 *  - fléaux (caisson à hauteur variable) : h_p ≈ L/17 sur pile, h_c ≈ L/35 à la clé et 2,20 m au moins (visite intérieure),
 *    âmes e = 26 + L/5 (cm), hourdis supérieur 25 cm, hourdis inférieur 20 à 22 cm à la clé (guide Sétra « Ponts en béton
 *    précontraint construits par encorbellements successifs », 2003, chap. 2 ; Infociments, fiche encorbellements),
 *    caisson de largeur ≈ B/2 ; voussoirs de 3 à 4 m ; câbles de fléau : extrados comprimé sur pile en fin de
 *    construction ; câbles de continuité : intrados comprimé à la clé sous superstructures, redistribution par fluage et
 *    part fréquente du trafic ;
 *  - bipoutre mixte : entraxe ≈ 0,55 B (entraxe 7 à 8 m pour 13 à 14 m de largeur, guide Sétra bipoutres 1985 § 1.2.2),
 *    dalle 24 à 30 cm selon l'entraxe (§ III.1.2), hauteur de charpente L/25 (guide : 1/22 à hauteur constante, pratique
 *    actuelle 1/25 à 1/28), semelles de 400 à 800 mm (supérieure) et 500 à 1000 mm (inférieure) selon la portée (§ III.2.2),
 *    âme ≥ h_w/120 en travée ; épaisseurs des semelles par M_Ed/(h·f_yd) avec des moments ELU forfaitaires de poutre
 *    continue (0,08 w L² en travée, 0,10 w L² sur appui).
 * Unités : m, kN, MPa ; épaisseurs d'acier rendues en mm comme dans le formulaire.
 */
import { poutreEtHourdis, caisson } from './sections.js';
import { contraintesPhases } from './contraintes.js';

const r = (x, p = 0.05) => Math.round(x / p) * p, up = (x, p = 0.05) => Math.ceil(x / p - 1e-9) * p;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lin = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0), 0, 1);
const f2 = x => +x.toFixed(3);
const net = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? f2(v) : v]));

/** Poutres rendues continues : portée L, entraxe bh, superstructures gSup (kN/m par poutre). */
export function predimContinues({ L = 25, bh = 2.5, gSup = 8, fck = 40, gb = 25 } = {}) {
  const lignes = [], ligne = (g, v, regle, ref) => lignes.push({ grandeur: g, valeur: v, regle, ref });
  // hauteur visée L/18 ; la poutre est arrondie aux 5 cm supérieurs sous un hourdis fixé : la hauteur totale affichée est celle qui est
  // réellement écrite dans le formulaire (poutre + hourdis), pas la cible
  const hd = L > 30 ? 0.25 : 0.22, Hvise = L / 18, H = up(Hvise - hd), Ht = H + hd;
  const bt = r(clamp(0.6 * Ht, 0.60, Math.max(0.60, bh - 0.60))), ht = 0.15, bw = 0.20, bb = r(clamp(0.60 + 0.012 * (L - 25), 0.60, 0.90)), hb = 0.25;
  ligne('Hauteur totale h (poutre + hourdis)', `${Ht.toFixed(2)} m = L/${(L / Ht).toFixed(1)} (poutre ${H.toFixed(2)} m)`, 'L/18 visé (1/16 à 1/18 isostatique, continuité : bas de plage), poutre arrondie aux 5 cm supérieurs', 'Sétra VIPP 1996 § 3.2.1');
  ligne('Hourdis', `${hd.toFixed(2)} m`, '0,22 à 0,25 m (flexion locale, enrobages)', 'Sétra VIPP § 2.2.3');
  ligne('Table de compression', `${bt.toFixed(2)} × ${ht.toFixed(2)} m`, 'b_t ≥ 0,6 h, ≤ entraxe − 0,60 m (coffrage du hourdis)', 'Sétra VIPP § 3.2.3');
  ligne('Âme', `${bw.toFixed(2)} m`, '20 à 22 cm en coffrage métallique', 'Sétra VIPP § 3.2.2');
  ligne('Talon', `${bb.toFixed(2)} × ${hb.toFixed(2)} m`, '60 à 90 cm, croissant avec la portée', 'Sétra VIPP § 3.2.4');
  // précontrainte : σ_inf ≥ σ_res à mi-travée, à t∞, sous permanentes
  const S = poutreEtHourdis({ H, bt, ht, bw, bb, hb, bh, hd }), P = S.poutre, Hh = S.hourdis;
  const Ac = P.A + Hh.A, yc = (P.A * P.yG + Hh.A * (H + hd / 2)) / Ac, Ic = P.I + P.A * (yc - P.yG) ** 2 + Hh.I + Hh.A * (H + hd / 2 - yc) ** 2;
  const wP = P.A * gb, wH = Hh.A * gb;
  const M1 = (wP + wH) * L * L / 8, M2 = 0.8 * gSup * L * L / 8;   // poutre seule ; section composée (continuité : 0,8 de l'isostatique)
  const eP = -(P.yG - Math.min(0.15, hb * 0.6)), sigRes = 3.0;   // câble au c.d.g. du talon ; compression résiduelle (MPa) pour le trafic
  const Pinf = (M1 * P.yG / P.I + M2 * yc / Ic + sigRes * 1000) / (1 / P.A - eP * P.yG / P.I), Pm0 = Pinf / 0.80;
  const nT = Math.ceil(Pm0 / (150e-6 * 1200 * 1000)), Ap = nT * 1.5;   // torons T15S à σ ≈ 1 200 MPa après pertes instantanées
  const PmR = r(nT * 150e-6 * 1200 * 1000, 50);
  ligne('Précontrainte (après pertes instantanées)', `${PmR} kN, ${nT} T15S (A_p = ${Ap.toFixed(1)} cm²)`, `σ_inf ≥ +${sigRes} MPa à t∞ sous permanentes (pertes différées 20 %), câble à e = ${eP.toFixed(2)} m`, 'EN 1992-1-1 § 5.10 ; Sétra VIPP § 3.1.3');
  const ratio = Ap * 1e-4 * 7850 / (P.A + Hh.A);
  ligne('Ratio de précontrainte', `${ratio.toFixed(0)} kg/m³`, 'courant ≈ 40 kg/m³ en travées indépendantes ; moins en continuité', 'Sétra VIPP § 3.1.3');
  return { champs: net({ ph_H: f2(H), ph_bt: f2(bt), ph_ht: ht, ph_bw: bw, ph_bb: f2(bb), ph_hb: hb, ph_hd: hd, ph_P: PmR, ph_Ap: +Ap.toFixed(1), ph_eMi: f2(eP), ph_geo: 'dimensions' }), lignes };
}

/** Fléaux : demi-travée centrale a (travées a – 2a – a), largeur B, superstructures gSup (kN/m). */
export function predimFleau({ a = 40, B = 12, gSup = 40, gb = 25, P0 = 3000, Lr = 10 } = {}) {
  const L = 2 * a, lignes = [], ligne = (g, v, regle, ref) => lignes.push({ grandeur: g, valeur: v, regle, ref });
  const hp = r(L / 17), hc = r(Math.max(2.2, L / 35)), bw = up((26 + L / 5) / 100), ts = B > 15 ? 0.30 : 0.25, Bi = r(B / 2, 0.25), tic = 0.22, tip = r(clamp(L / 130, 0.35, 0.90));
  const l0 = 8, nv = Math.max(3, Math.round((a - l0 / 2) / 3.5)), tcl = Math.max(90, Math.ceil((nv * 7 + 3 + 10) / 10) * 10);
  ligne('Hauteur sur pile h_p', `${hp.toFixed(2)} m = L/${(L / hp).toFixed(1)}`, 'L/16 à L/18', 'Sétra encorbellements 2003, chap. 2');
  ligne('Hauteur à la clé h_c', `${hc.toFixed(2)} m = L/${(L / hc).toFixed(1)}`, 'L/30 à L/40, 2,20 m au moins (visite intérieure)', 'Sétra encorbellements 2003 ; Infociments');
  ligne('Âmes', `${bw.toFixed(2)} m`, 'e = 26 + L/5 (cm, L en m)', 'Infociments, fiche encorbellements');
  ligne('Hourdis supérieur', `${ts.toFixed(2)} m`, '20 à 25 cm ; 25 à 30 cm pour un caisson large', 'Infociments');
  ligne('Caisson (largeur inférieure)', `${Bi.toFixed(2)} m`, '≈ B/2 : encorbellements latéraux ≈ B/4', 'pratique courante');
  ligne('Hourdis inférieur', `${tip.toFixed(2)} m sur pile, ${tic.toFixed(2)} m à la clé`, '0,35 à 0,90 m sur pile (compression), ≥ 0,20 m à la clé', 'Sétra encorbellements 2003 ; Infociments');
  ligne('Voussoirs', `VSP ${l0} m, ${nv} voussoirs de ${((a - l0 / 2) / nv).toFixed(2)} m`, 'voussoirs coulés en place de 3 à 4 m (équipage mobile)', 'Sétra encorbellements 2003');
  // câbles de fléau : extrados comprimé sur pile en fin de construction (poids propre + équipage)
  const K = { B, ts, Bi, bw }, sp = caisson({ ...K, ti: tip }, hp), sc = caisson({ ...K, ti: tic }, hc);
  const wMoy = (sp.A + 2 * sc.A) / 3 * gb, Qeq = r(lin(L, 60, 150, 300, 700), 50), Mp = wMoy * a * a / 2 + Qeq * a;
  const e = sp.v - 0.15, Pnec = Mp * sp.v / sp.I / (1 / sp.A + e * sp.v / sp.I);
  const nPaires = nv + 1, cn = Math.max(1, Math.ceil(Pnec / 0.80 / P0 / nPaires));
  ligne('Câbles de fléau', `${cn} câble(s) par paire de voussoirs (${nPaires} paires, P₀ = ${P0} kN)`, `extrados comprimé sur pile : M = ${Math.round(Mp)} kN·m (poids propre + équipage ${Qeq} kN), pertes 20 %`, 'Sétra encorbellements 2003');
  // câbles de continuité (clé) : superstructures, redistribution par fluage (≈ 0,4 du moment d'encastrement du poids propre), trafic fréquent
  const qT = 0.4 * (9 * 3 + 2.5 * Math.max(Lr - 3, 0)) + 0.75 * 2 * (600 + 400) / L;
  const Mcle = (gSup + qT) * L * L / 24 + 0.4 * sc.A * gb * L * L / 24;
  const ec = sc.yG - 0.15, Pc = Mcle * sc.yG / sc.I / (1 / sc.A + ec * sc.yG / sc.I);
  const ccn = Math.max(2, Math.ceil(Pc / 0.80 / P0 / 2) * 2), crn = Math.max(2, Math.floor(0.45 * ccn / 2) * 2);
  ligne('Câbles de continuité', `${ccn} au centre, ${crn} par travée de rive`, `intrados comprimé à la clé : M ≈ ${Math.round(Mcle)} kN·m (superstructures, fluage, trafic fréquent)`, 'Sétra encorbellements 2003');
  return { champs: net({ fl_hp: hp, fl_hc: hc, fl_bw: bw, fl_ts: ts, fl_Bi: Bi, fl_tip: tip, fl_tic: tic, fl_l0: l0, fl_nv: nv, fl_cn: cn, fl_Qeq: Qeq, fl_ccn: ccn, fl_ccv: Math.max(2, nv - 1), fl_crn: crn, fl_crv: Math.max(2, nv - 2), fl_geo: 'dimensions', fl_tcl: tcl, fl_tcc: tcl + 5, fl_tsup: tcl + 30 }), lignes };
}

/** Bipoutre mixte : portées, largeur B, superstructures gSup (kN/m de tablier), largeur roulable Lr. */
export function predimMixte({ L = [45, 60, 45], B = 10.5, gSup = 13.5, Lr = 8.5, np = 2, fy = 335 } = {}) {
  const lignes = [], ligne = (g, v, regle, ref) => lignes.push({ grandeur: g, valeur: v, regle, ref });
  const Lm = Math.max(...L), e = np === 2 ? r(0.55 * B, 0.1) : r(B / np, 0.1), hc = r(clamp(0.24 + 0.02 * (e - 5), 0.24, 0.32), 0.01), hg = 0.05;
  const h = up(Lm / 25), bfs = up(lin(Lm, 30, 100, 0.40, 0.80)), bfi = up(lin(Lm, 30, 100, 0.50, 1.00));
  ligne('Entraxe des poutres', `${e.toFixed(1)} m (${(e / B).toFixed(2)} B)`, np === 2 ? '≈ 0,55 B : encorbellements ≤ 3 m, entraxe 7 à 8 m pour 13 à 14 m' : 'répartition régulière', 'Sétra bipoutres 1985 § 1.2.2');
  ligne('Dalle', `${hc.toFixed(2)} m (+ gousset ${hg.toFixed(2)})`, '24 à 30 cm selon l\'entraxe, 20 cm au moins', 'Sétra bipoutres 1985 § III.1.2');
  ligne('Hauteur de charpente', `${h.toFixed(2)} m = L/${(Lm / h).toFixed(1)}`, 'L/25 (guide : 1/22 à hauteur constante ; pratique 1/25 à 1/28)', 'Sétra bipoutres 1985 § 1.1.3');
  // charges par poutre (poutre de rive) et moments ELU forfaitaires
  const part = (B - (np - 1) * e) / 2 + e / 2, gDalle = (hc + hg / 2) * part * 25, gS = gSup * part / B, gAcier = 0.25 * 78.5 * 0.06;   // charpente ≈ 6 dm²/m, majorée
  const w = gDalle + gS + gAcier * 1.1;
  const qQ = (np === 2 ? 0.65 : 1.5 / np) * (9 * 3 + 2.5 * Math.max(Lr - 3, 0)) + (np === 2 ? 0.8 : 2 / np) * 2 * (300 + 200) * 2 / Lm;
  const Mt = 0.08 * (1.35 * w + 1.35 * qQ) * Lm * Lm, Ma = 0.10 * (1.35 * w + 1.35 * qQ) * Lm * Lm;
  const tw = Math.max(18, Math.ceil(h * 1000 / 120 / 2) * 2), twa = Math.max(22, Math.ceil(h * 1000 / 90 / 2) * 2);
  const ep = (A, b) => Math.min(150, Math.max(25, Math.ceil(A / b * 1000 / 5) * 5));
  let tfi = ep(Mt / ((h + hc / 2) * fy * 1000), bfi), tfs = Math.max(25, Math.round(0.6 * tfi / 5) * 5);
  const bfia = up(1.2 * bfi), bfsa = up(1.1 * bfs), tfia = ep(Ma / (h * fy * 1000), bfia), tfsa = ep(0.75 * Ma / (h * fy * 1000), bfsa);   // armatures de dalle : ≈ 25 % de la traction sur appui
  const hw = r(h - (tfi + tfs) / 1000, 0.01), hwa = r(h - (tfia + tfsa) / 1000, 0.01);
  ligne('Charge par poutre (ELU)', `w = ${w.toFixed(1)} kN/m, trafic équivalent ${qQ.toFixed(1)} kN/m`, 'dalle, superstructures, charpente ; LM1 réparti (règle du levier)', 'EN 1991-2 § 4.3.2');
  ligne('Semelles en travée', `inf. ${bfi.toFixed(2)} × ${tfi} mm, sup. ${bfs.toFixed(2)} × ${tfs} mm`, `M_Ed ≈ 0,08 w L² = ${Math.round(Mt)} kN·m ; A_inf = M/(h f_yd)`, 'Sétra bipoutres § III.2.2');
  ligne('Semelles sur appui', `inf. ${bfia.toFixed(2)} × ${tfia} mm, sup. ${bfsa.toFixed(2)} × ${tfsa} mm`, `M_Ed ≈ 0,10 w L² = ${Math.round(Ma)} kN·m`, 'Sétra bipoutres § III.2.2');
  ligne('Âmes', `${tw} mm en travée, ${twa} mm sur appui`, 'h_w/t_w ≤ 120 en travée, ≤ 90 sur appui (voilement par cisaillement)', 'EN 1993-1-5 § 5.1 ; Sétra bipoutres § III.2.2');
  return { champs: net({ mx_e: e, mx_hc: hc, mx_hg: hg, mx_tbfi: bfi, mx_ttfi: tfi, mx_thw: hw, mx_ttw: tw, mx_tbfs: bfs, mx_ttfs: tfs, mx_abfi: bfia, mx_atfi: tfia, mx_ahw: hwa, mx_atw: twa, mx_abfs: bfsa, mx_atfs: tfsa }), lignes };
}

/**
 * Affinage par le calcul : on relance la chaîne complète (phases + ouvrage terminé) avec les valeurs proposées et on
 * renforce les seules dimensions mises en défaut, critère par critère, jusqu'à ce que toutes les vérifications passent
 * (ou maxIt essais). compute(form) renvoie le résultat de computePhasage / computeMixte. Renvoie { champs, ok, journal,
 * restants (vérifications encore en défaut), out }.
 *  - mixte : flexion ELU / ELS de l'acier → épaisseur de la semelle en cause (+5 mm) dans la zone (travée ou appui) ;
 *    effort tranchant, interaction M-V → âme (+2 mm) ; déversement → largeur de la semelle inférieure sur appui (+5 cm,
 *    puis épaisseur) ; fatigue de la semelle → semelle inférieure (+5 mm) ; dalle comprimée → dalle (+1 cm) ; armatures
 *    sur appui → taux d'armatures (+0,1 %) ; au-delà de 150 mm d'épaisseur, la semelle est élargie ; bétonnage :
 *    déversement de la semelle → largeur (+5 cm), déversement d'ensemble → largeurs des deux semelles en travée ;
 *    courbure : épaisseurs et largeurs des semelles de la zone (flexion latérale ∝ 1/b²) ;
 *  - poutres continues : décompression, traction → précontrainte (+5 %, section des torons ajustée) ; compression
 *    excessive au jeune âge pendant la construction (0,6 f_ck(t), contrôlée elle aussi) → mise en tension retardée de 7 j ;
 *  - fléaux : traction ou décompression en partie haute → câbles de fléau (+1 par paire) ; en partie basse →
 *    câbles de continuité (+2 au centre, +2 en rive) selon la position.
 * Les critères sans levier géométrique (goujons, compression excessive) sont laissés au projeteur et listés.
 */
export async function affiner(type, champs, base, compute, { maxIt = 25, onPas = null, pause = false } = {}) {
  const c = { ...champs }, journal = [];
  let out = null, restants = [];
  const str = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));
  for (let it = 0; it <= maxIt; it++) {
    out = compute({ ...base, ...str(c) });
    const V = type === 'mixte' ? out.v : out.acheve;
    restants = V.verifs.filter(q => !q.ok);
    // béton précontraint : les contraintes des phases de construction (compression ≤ 0,6 f_ck(t) au jeune âge, traction)
    // comptent aussi ; sans elles, le prédimensionnement pourrait se déclarer satisfait avec une mise en tension trop précoce
    if (type !== 'mixte' && out.reperes && out.reperes.fibres) {
      const C = contraintesPhases(out.r, out.modele, out.reperes.fibres, out.p.dates.superstructures);
      for (const q of C.verifs) if (!q.ok) restants.push({ nom: `Construction : ${q.partie}, ${q.critere}`, val: q.valeur, lim: q.limite, ok: false, phase: true, age: q.ou.age, t: q.ou.t, fibre: q.ou.fibre, ref: 'EN 1992-1-1 § 5.10.2.2 (5)' });
    }
    if (onPas) onPas(it, restants);
    if (!restants.length || it === maxIt) break;
    const avant = JSON.stringify(c);
    if (type === 'mixte') ajusterMixte(c, restants, V);
    else if (type === 'poutres') ajusterContinues(c, restants, base);
    else ajusterFleau(c, restants, out);
    const delta = Object.keys(c).filter(k => JSON.stringify(c[k]) !== JSON.stringify(JSON.parse(avant)[k]));
    if (!delta.length) break;   // plus de levier : critères restants laissés au projeteur
    journal.push({ essai: it + 1, defauts: restants.map(q => q.nom), modifie: delta.map(k => `${k} = ${c[k]}`) });
    if (pause) await new Promise(r => setTimeout(r, 0));
  }
  return { champs: c, ok: !restants.length, journal, restants, out };
}

function ajusterMixte(c, defauts, V) {
  const zone = x => { const s = V.sections.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)); return s.zoneAppui ? 'a' : 't'; };
  const fait = new Set(), pas = (k, d, max = Infinity) => { if (fait.has(k)) return; fait.add(k); c[k] = Math.min(max, f2(c[k] + d)); };
  const semelle = (z, f) => {   // f = 'fi' ou 'fs' : épaisseur +5 mm, élargissement au-delà de 150 mm
    const t = `mx_${z}t${f}`, b = `mx_${z}b${f}`;
    if (c[t] + 5 <= 150) pas(t, 5); else pas(b, 0.05, 1.6);
  };
  for (const q of defauts) {
    const z = zone(q.x);
    if (/^Courbure \(R/.test(q.nom)) { semelle(z, 'fi'); semelle(z, 'fs'); pas(`mx_${z}bfi`, 0.05, 1.6); pas(`mx_${z}bfs`, 0.05, 1.2); }
    else if (/^Courbure : contrainte de flexion latérale/.test(q.nom)) pas(`mx_${z}bfi`, 0.05, 1.6);   // semelle inférieure seule (la supérieure est tenue par la dalle)
    else if (/^Courbure, bétonnage/.test(q.nom)) pas('mx_tbfs', 0.05, 1.2);
    else if (/^Bétonnage : déversement d'ensemble/.test(q.nom)) { pas('mx_tbfs', 0.05, 1.2); pas('mx_tbfi', 0.05, 1.6); }
    else if (/^Bétonnage : déversement de la semelle supérieure/.test(q.nom)) pas(`mx_${z}bfs`, 0.05, 1.2);
    else if (/^Bétonnage : déversement de la semelle inférieure/.test(q.nom)) pas(`mx_${z}bfi`, 0.05, 1.6);
    else if (/^Bétonnage : résistance/.test(q.nom)) { semelle(z, 'fs'); semelle(z, 'fi'); }
    else if (/ELU flexion|contrainte de l'acier/.test(q.nom)) {
      if (/sup/.test(q.nom)) semelle(z, 'fs'); else if (/inf/.test(q.nom)) semelle(z, 'fi'); else { semelle(z, 'fi'); semelle(z, 'fs'); }
    } else if (/effort tranchant|Interaction/.test(q.nom)) pas(`mx_${z}tw`, 2, 60);
    else if (/Déversement/.test(q.nom)) { if (c.mx_abfi < 1.4) pas('mx_abfi', 0.05); else semelle('a', 'fi'); }
    else if (/Fatigue : semelle/.test(q.nom)) semelle(z, 'fi');
    else if (/compression de la dalle|Dalle : poinçonnement/.test(q.nom)) pas('mx_hc', 0.01, 0.40);
    else if (/Fatigue des armatures/.test(q.nom)) { c.mx_rhoa = +((c.mx_rhoa ?? 1.2) + 0.1).toFixed(2); }
    else if (/armatures/.test(q.nom)) { c.mx_rhoa = +((c.mx_rhoa ?? 1.2) + 0.1).toFixed(2); }
  }
}

function ajusterContinues(c, defauts, base = {}) {
  // compression excessive au jeune âge pendant la construction : mise en tension retardée d'une semaine (béton plus résistant),
  // sans dépasser la date de coulage du hourdis ni 28 jours
  const jeune = defauts.find(q => q.phase && /compression/.test(q.nom) && q.age < 28);
  if (jeune) {
    const t1 = +(c.ph_t1 ?? base.ph_t1 ?? 7), t2 = +(c.ph_t2 ?? base.ph_t2 ?? 60), t = Math.min(t1 + 7, 28, t2);
    if (t > t1) c.ph_t1 = t;
  }
  if (defauts.some(q => !q.phase && /Décompression|traction|Traction/.test(q.nom))) {
    c.ph_P = Math.round(c.ph_P * 1.05 / 50) * 50;
    c.ph_Ap = +(Math.ceil(c.ph_P / 1200 * 10 / 1.5) * 1.5).toFixed(1);   // A_p (cm²) : σ ≈ 1 200 MPa, multiple d'un T15S
  }
}

function ajusterFleau(c, defauts, out) {
  const a = out.p.a;
  for (const q of defauts) {
    if (q.phase || !/Décompression|traction|Traction/.test(q.nom)) continue;   // phases de construction : laissées au projeteur
    const haut = /sup/.test(q.nom), x = q.x ?? 2 * a, rive = x < a || x > 3 * a;
    if (haut) c.fl_cn = (c.fl_cn || 1) + 1;
    else if (rive) c.fl_crn = (c.fl_crn || 0) + 2;
    else c.fl_ccn = (c.fl_ccn || 0) + 2;
  }
}
