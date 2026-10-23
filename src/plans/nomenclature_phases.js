/**
 * Nomenclatures des armatures des ouvrages calculés par phases (bordereau de façonnage ISO 4066, mêmes conventions que
 * src/plans/nomenclature_vipp.js : longueurs de coupe, barres de 12 m au plus avec recouvrements l₀) :
 *
 *  - poutres rendues continues (une travée, toutes les poutres) : talon (A_s inférieur de l'ouvrage terminé, 4 HA20 au
 *    moins), étriers d'âme en U en attente dans le hourdis et cadres de talon par zones (A_sw/s de l'effort tranchant :
 *    zones d'about sur 0,25 L, zone centrale), peau, table ; hourdis (flexion locale de la plaque sur les poutres, minimum
 *    EC2 § 9.3.1.1), armatures de continuité sur appui (A_s supérieur de l'ouvrage terminé), prolongées de
 *    0,25 L + l_bd de part et d'autre (EN 1992-1-1 § 9.2.1.3) ; entretoise de clavage (constructif) ;
 *  - voussoir courant de fléau (section de la clé) : cadre transversal (A_s par mètre de la flexion transversale du
 *    caisson : hourdis supérieur, âmes — le plus grand de la flexion et de l'effort tranchant —, hourdis inférieur),
 *    armatures longitudinales de peau (minimum) et armatures passives de complément de l'ouvrage terminé à la clé.
 * Unités : m, cm² ; cotes du bordereau en mm.
 */
import { longueurCoupe, recapitulatif } from './bordereau.js';
import { pieces } from './nomenclature_vipp.js';
import { areaOf, massPerM, anchorage, chooseBars } from '../rebar.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { couperNote } from './appuis.js';
import { Vue } from './dessin.js';

const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const sTxt = s => String(Math.round(s * 1000) / 10).replace('.', ',');

/** Constructeur de lignes de bordereau. */
function fabrique() {
  const out = []; let rep = 0;
  const ligne = (element, desig, phi, code, dims, nombre) => {
    const A = r5(dims.A || 0), B = r5(dims.B || 0), C = r5(dims.C || 0), L = r25(longueurCoupe(code, { A, B, C }, phi));
    out.push({ repere: String(++rep), phi, code, A, B: code === '00' ? null : B, C: code === '21' || code === '51' ? C : null, L, nombre, total: L / 1000 * nombre, masse: L / 1000 * nombre * massPerM(phi), element, desig });
  };
  const droite = (element, desig, phi, Lt, nb, fck = 35) => {
    const p = pieces(Lt, phi, fck);
    ligne(element, desig + (p.n > 1 ? ` — ${p.n} pièces, l₀ = ${fr(p.l0)} m` : ''), phi, '00', { A: p.Lp * 1000 }, nb * p.n);
  };
  return { out, ligne, droite };
}
/** Étriers à 2 brins pour A_sw/s (m²/m) : φ, s ≤ min(0,75 d ; 0,40). */
function etrier(AswS, d) {
  for (const phi of [10, 12, 14, 16]) { const a = 2 * areaOf(phi), s = Math.min(Math.floor(a / Math.max(AswS, 1e-9) / 0.025) * 0.025, Math.floor(0.75 * d / 0.025) * 0.025, 0.40); if (s >= 0.10) return { phi, s }; }
  return { phi: 16, s: 0.10 };
}

/* -------------------------------------------------------------------------------------- poutres continues */
export function nomenclatureContinues(out, { c = 0.03 } = {}) {
  const p = out.p, f = p.forme, L = p.L, v = out.acheve, nP = v ? v.nP : 4, fck = p.poutre.fck, fckH = p.hourdis.fck;
  const Lp = L - 0.10, F = fabrique(), elu = v ? v.elu : [];
  // talon : A_s inférieur maximal (par poutre)
  const AsInf = Math.max(4 * areaOf(20), ...elu.map(e => e.AsInf)), nT = Math.max(4, Math.ceil(AsInf / areaOf(25) - 1e-9));
  F.droite('poutre', `talon : ${nT} HA25 (A_s inf. ELU ${fr(AsInf * 1e4, 1)} cm²)`, 25, Lp - 2 * c, nT * nP * p.n, fck);
  // étriers par zones : about (0,25 L) et centre, A_sw/s maximal de chaque zone sur la première travée
  const d = f.H + f.hd - 0.10, zone = (x0, x1) => Math.max(0, ...elu.filter(e => e.x >= x0 - 1e-9 && e.x <= x1 + 1e-9).map(e => e.V.AswS));
  const eA = etrier(zone(0, 0.25 * L), d), eC = etrier(zone(0.25 * L, 0.5 * L), d), phiE = Math.max(eA.phi, eC.phi);
  const nEt = Math.round(2 * 0.25 * L / eA.s + 0.5 * L / eC.s) + 1, ret = Math.max(f.hd - 0.05, 0.10);
  F.ligne('poutre', `étriers d'âme en U, attentes ${Math.round(ret * 100)} cm (about HA${eA.phi}/${sTxt(eA.s)}, centre HA${eC.phi}/${sTxt(eC.s)})`, phiE, '21', { A: (f.H - 2 * c + ret) * 1000, B: (f.bw - 2 * c) * 1000, C: (f.H - 2 * c + ret) * 1000 }, nEt * nP * p.n);
  F.ligne('poutre', 'cadres fermés du talon', phiE, '51', { A: (f.hb - 2 * c) * 1000, B: (f.bb - 2 * c) * 1000, C: 10 * phiE }, nEt * nP * p.n);
  const nPe = 2 * Math.max(1, Math.floor((f.H - f.ht - f.hb) / 0.25));
  F.droite('poutre', `peau : ${nPe / 2} HA12 par face`, 12, Lp - 2 * c, nPe * nP * p.n, fck);
  F.ligne('poutre', 'table : transversales HA10 / 20', 10, '00', { A: (f.bt - 2 * c) * 1000 }, (Math.floor((Lp - 2 * c) / 0.2) + 1) * nP * p.n);
  // hourdis : flexion locale calculée (plaque sur les poutres, out.acheve.hourdis) ou minimum EC2 § 9.3.1.1 ; nappes
  // inférieure et supérieure transversales, répartition longitudinale ≥ 20 % (§ 9.3.1.1 (2))
  const AsMinH = Math.max(0.26 * 0.3 * fckH ** (2 / 3) / 500, 0.0013) * (f.hd - c - 0.01), W = nP * f.bh, Hl = v && v.hourdis;
  const AsI = Math.max(AsMinH, Hl ? Hl.inf.As : 0), AsS = Math.max(AsMinH, Hl ? Hl.sup.As : 0);
  const bI = chooseBars(AsI, { phiMin: 10, phiMax: 16, sMax: 0.20 }), bS = chooseBars(AsS, { phiMin: 10, phiMax: 16, sMax: 0.20 });
  const orig = As => (Hl ? `${fr(As * 1e4, 1)} cm²/m${As <= AsMinH + 1e-9 ? ', minimum' : ', flexion locale'}` : 'minimum');
  F.droite('hourdis', `transversales inférieures HA${bI.phi} / ${sTxt(bI.s)} (${orig(AsI)})`, bI.phi, W - 2 * c, (Math.floor(L / bI.s) + 1) * p.n, fckH);
  F.droite('hourdis', `transversales supérieures HA${bS.phi} / ${sTxt(bS.s)} (${orig(AsS)})`, bS.phi, W - 2 * c, (Math.floor(L / bS.s) + 1) * p.n, fckH);
  const bR = chooseBars(Math.max(0.2 * Math.max(bI.As, bS.As), AsMinH), { phiMin: 10, phiMax: 12, sMax: 0.25 });
  F.droite('hourdis', `longitudinales (2 nappes) HA${bR.phi} / ${sTxt(bR.s)}`, bR.phi, L * p.n - 2 * c, 2 * (Math.floor((W - 2 * c) / bR.s) + 1), fckH);
  // continuité sur appui : A_s supérieur maximal par poutre, longueur 2 (0,25 L + l_bd)
  if (p.n > 1) {
    const AsC = Math.max(...elu.map(e => e.AsCont), 0);
    if (AsC > 0) {
      const phi = AsC / areaOf(20) <= 12 ? 20 : 25, nC = Math.ceil(AsC / areaOf(phi) - 1e-9), lbd = anchorage(phi, { fck: fckH, top: true }).lbd, Lc = 2 * (0.25 * L + lbd);
      F.droite('hourdis', `continuité sur appui : ${nC} HA${phi} par poutre (A_s ${fr(AsC * 1e4, 1)} cm²), 2 × (0,25 L + l_bd)`, phi, Lc, nC * nP * (p.n - 1), fckH);
    }
    // entretoise de clavage (constructif) : 2 × 4 HA16 filants, cadres HA10 / 20
    const he = f.H + f.hd, Le = W - 2 * c;
    F.droite('entretoise', 'clavage : 2 × 4 HA16 filants (constructif)', 16, Le, 8 * (p.n - 1), fck);
    F.ligne('entretoise', 'clavage : cadres HA10 / 20', 10, '51', { A: (he - 2 * c) * 1000, B: (1.2 - 2 * c) * 1000, C: 100 }, (Math.floor(Le / 0.2) + 1) * (p.n - 1));
  }
  const R = recapitulatif(F.out), vol = (out.modele.barres[0].A + f.bh * f.hd) * L * nP * p.n;
  return { lignes: F.out, R, ratio: R.masse / vol, vol, nP, n: p.n, L };
}

/* ------------------------------------------------------------------------------------- voussoir de fléau */
export function nomenclatureVoussoir(out, { c = 0.04 } = {}) {
  const p = out.p, K = p.caisson, R0 = out.reperes, T = out.transversal, lv = R0.lv, fck = p.fck, F = fabrique();
  if (!K || !T) throw new Error('nomenclature du voussoir : caisson défini par ses dimensions et flexion transversale nécessaires');
  const sec = nom => T.sections.find(s => s.nom.startsWith(nom)), hc = p.hc, xw = K.Bi / 2 - K.bw / 2;
  const bars = As => chooseBars(Math.max(As, 1e-6), { phiMin: 12, phiMax: 25, sMax: 0.20 });
  const nb = s => Math.floor((lv - 2 * c) / s) + 1;
  // hourdis supérieur : nappe supérieure (encastrement des encorbellements, nu intérieur des âmes), nappe inférieure (milieu)
  const sup = bars(Math.max(sec('Encorbellement').AsTendu.neg, sec('Hourdis supérieur : nu').AsTendu.neg)), infH = bars(sec('Hourdis supérieur : milieu').AsTendu.pos);
  F.ligne('hourdis sup.', `nappe supérieure HA${sup.phi} / ${sTxt(sup.s)} (encastrement, nu des âmes)`, sup.phi, '21', { A: 10 * sup.phi, B: (K.B - 2 * c) * 1000, C: 10 * sup.phi }, nb(sup.s));
  F.ligne('hourdis sup.', `nappe inférieure HA${infH.phi} / ${sTxt(infH.s)} (entre âmes)`, infH.phi, '00', { A: (2 * xw + K.bw - 2 * c) * 1000 }, nb(infH.s));
  // âmes : face extérieure / intérieure, le plus grand de la flexion du cadre et d'un brin d'étrier (A_sw/s / 4 : 2 âmes × 2 brins)
  const elu = out.acheve ? out.acheve.elu : [], xCle = 2 * p.a, AswCle = Math.max(0, ...elu.filter(e => Math.abs(e.x - xCle) < lv * 1.5).map(e => e.V.AswS));
  const brin = AswCle / 4, ext = bars(Math.max(sec('Âme : tête').AsTendu.pos, sec('Âme : pied').AsTendu.pos, brin)), int = bars(Math.max(sec('Âme : tête').AsTendu.neg, sec('Âme : pied').AsTendu.neg, brin));
  const hw = hc - K.ts - K.tic;
  F.ligne('âmes', `cadres face extérieure HA${ext.phi} / ${sTxt(ext.s)} (flexion transversale / effort tranchant)`, ext.phi, '21', { A: 15 * ext.phi, B: (hc - 2 * c) * 1000, C: 15 * ext.phi }, 2 * nb(ext.s));
  F.ligne('âmes', `face intérieure HA${int.phi} / ${sTxt(int.s)}`, int.phi, '21', { A: 15 * int.phi, B: (hw + 0.3) * 1000, C: 15 * int.phi }, 2 * nb(int.s));
  // hourdis inférieur : deux nappes
  const bi1 = bars(sec('Hourdis inférieur : nu').AsTendu.pos), bi2 = bars(Math.max(sec('Hourdis inférieur : nu').AsTendu.neg, sec('Hourdis inférieur : milieu').AsTendu.pos));
  F.ligne('hourdis inf.', `nappe inférieure HA${bi1.phi} / ${sTxt(bi1.s)}`, bi1.phi, '21', { A: 10 * bi1.phi, B: (K.Bi - 2 * c) * 1000, C: 10 * bi1.phi }, nb(bi1.s));
  F.ligne('hourdis inf.', `nappe supérieure HA${bi2.phi} / ${sTxt(bi2.s)}`, bi2.phi, '00', { A: (K.Bi - 2 * K.bw) * 1000 }, nb(bi2.s));
  // longitudinales : peau HA12 / 15 sur toutes les faces (minimum), complément de l'ouvrage terminé à la clé (A_s inférieur)
  const per = 2 * K.B + 4 * hw + 2 * K.Bi, nL = Math.ceil(per / 0.15);
  F.droite('longitudinales', `peau HA12 / 15 (périmètre ${fr(per, 1)} m)`, 12, lv + anchorage(12, { fck }).l0, nL, fck);
  const eC = elu.length ? elu.reduce((a, e) => (Math.abs(e.x - xCle) < Math.abs(a.x - xCle) ? e : a)) : null;
  if (eC && eC.AsInf > 0) { const n = Math.ceil(eC.AsInf / areaOf(25) - 1e-9); F.droite('longitudinales', `complément inférieur à la clé : ${n} HA25 (A_s ${fr(eC.AsInf * 1e4, 0)} cm²)`, 25, lv + anchorage(25, { fck }).l0, n, fck); }
  const R = recapitulatif(F.out), A = (K.B * K.ts + 2 * K.bw * hw + K.Bi * K.tic), vol = A * lv;
  return { lignes: F.out, R, ratio: R.masse / vol, vol, lv, AswCle };
}

/* ---------------------------------------------------------------------------------- voussoir sur pile du fléau */
/**
 * Voussoirs sur pile (les deux piles) : diaphragme (treillis orthogonal des deux faces, A_s/s du flux de torsion ou
 * minimum), frettage des blocs d'appui sous les âmes (cadres fermés), frettage et tirants arrière des bossages des câbles
 * de continuité, frettage des ancrages des câbles de fléau (out.vsp, src/phasage/voussoir_pile.js).
 */
export function nomenclatureVoussoirPile(out, { c = 0.05 } = {}) {
  const p = out.p, K = p.caisson, V = out.vsp, hp = p.hp, fck = p.fck, F = fabrique(), nPi = 2;
  if (!K || !V) throw new Error('nomenclature du voussoir sur pile : caisson par dimensions et calcul du voussoir sur pile nécessaires');
  const D = V.diaphragme, A = V.appareil;
  const bd = chooseBars(D.AsFace, { phiMin: 12, phiMax: 20, sMax: 0.20 });
  const nH = Math.floor((hp - 2 * c) / bd.s) + 1, nV = Math.floor((K.Bi - 2 * c) / bd.s) + 1;
  F.ligne('diaphragme', `horizontales, 2 faces : HA${bd.phi} / ${sTxt(bd.s)} (${fr(D.AsFace * 1e4, 1)} cm²/m par face)`, bd.phi, '00', { A: (K.Bi - 2 * c) * 1000 }, 2 * nH * nPi);
  F.ligne('diaphragme', `verticales, 2 faces : HA${bd.phi} / ${sTxt(bd.s)}`, bd.phi, '00', { A: (hp - 2 * c) * 1000 }, 2 * nV * nPi);
  F.ligne('diaphragme', 'épingles HA10, 4 par m² (maintien des deux nappes)', 10, '21', { A: 100, B: (D.ed - 2 * c) * 1000, C: 100 }, Math.ceil(4 * (K.Bi - 2 * K.bw) * hp) * nPi);
  const nCad = Math.max(4, Math.ceil(A.As / (2 * areaOf(16)) - 1e-9));
  const byH = Math.min(A.by, K.Bi / 2 - c);   // cadre tenu dans le béton, du parement extérieur vers l'intérieur
  F.ligne('appuis', `frettage sous chaque appareil : ${nCad} cadres HA16 (tirant ${Math.round(A.T)} kN)`, 16, '51', { A: (byH - 2 * c) * 1000, B: (A.bx - 2 * c) * 1000, C: 160 }, nCad * 2 * nPi);
  if (V.bossage) {
    const Bo = V.bossage, nf = Math.max(3, Math.ceil(Bo.As / (2 * areaOf(12)) - 1e-9)), nt = Math.max(2, Math.ceil(Bo.AsTB / areaOf(16) - 1e-9));
    F.ligne('bossages', `frettage : ${nf} cadres HA12 par bossage (éclatement ${Math.round(Bo.T)} kN)`, 12, '51', { A: (Bo.a + 0.10) * 1000, B: (Bo.a + 0.10) * 1000, C: 120 }, nf * Bo.nombre);
    const lt = Math.max(1.5, anchorage(16, { fck }).lbd + Bo.h);
    F.droite('bossages', `tirants arrière : ${nt} HA16 par bossage (0,25 × 1,2 P₀ = ${Math.round(Bo.tieBack)} kN)`, 16, lt, nt * Bo.nombre, fck);
  }
  const G = V.gousset, ng = Math.max(3, Math.ceil(G.As / (2 * areaOf(12)) - 1e-9));
  F.ligne('ancrages de fléau', `frettage : ${ng} cadres HA12 par ancrage (éclatement ${Math.round(G.T)} kN)`, 12, '51', { A: (G.a + 0.10) * 1000, B: (G.a + 0.10) * 1000, C: 120 }, ng * G.nombre);
  const R = recapitulatif(F.out), vol = nPi * (D.ed * (K.Bi - 2 * K.bw) * (hp - K.ts - K.tip));
  return { lignes: F.out, R, vol, ratio: R.masse / vol, nPiles: nPi };
}

/* ------------------------------------------------------------------------------------------- dalle du pont mixte */
/**
 * Dalle du pont mixte (ouvrage complet) : transversales des deux nappes (flexion locale de la plaque sur les poutres,
 * out.v.dalle ; au moins le minimum EC2 § 9.3.1.1), longitudinales courantes ρ_travée h_c (60 % en nappe supérieure,
 * 40 % en nappe inférieure, comme le modèle de la section mixte), complément sur appui (ρ_appui − ρ_travée) h_c sur la
 * zone d'appui de chaque pile (p.zone × travée de part et d'autre) prolongé de l_bd, armatures de rive en U (constructif).
 */
export function nomenclatureDalleMixte(out, { c = 0.04 } = {}) {
  const p = out.p, D = out.v && out.v.dalle, B = p.largeur, hc = p.hc, L = p.L, Lt = L.reduce((a, b) => a + b, 0), fck = p.fck, F = fabrique();
  const AsMin = Math.max(0.26 * 0.3 * fck ** (2 / 3) / 500, 0.0013) * (hc - c - 0.01);
  const AsI = Math.max(AsMin, D ? D.inf.As : 0), AsS = Math.max(AsMin, D ? D.sup.As : 0);
  const bI = chooseBars(AsI, { phiMin: 10, phiMax: 20, sMax: 0.20 }), bS = chooseBars(AsS, { phiMin: 10, phiMax: 20, sMax: 0.20 });
  const orig = As => (D ? `${fr(As * 1e4, 1)} cm²/m${As <= AsMin + 1e-9 ? ', minimum' : ', flexion locale'}` : 'minimum');
  F.ligne('transversales', `nappe inférieure HA${bI.phi} / ${sTxt(bI.s)} (${orig(AsI)})`, bI.phi, '00', { A: (B - 2 * c) * 1000 }, Math.floor((Lt - 2 * c) / bI.s) + 1);
  F.ligne('transversales', `nappe supérieure HA${bS.phi} / ${sTxt(bS.s)} (${orig(AsS)}), retours en rive`, bS.phi, '21', { A: (hc - 2 * c) * 1000, B: (B - 2 * c) * 1000, C: (hc - 2 * c) * 1000 }, Math.floor((Lt - 2 * c) / bS.s) + 1);
  // longitudinales courantes : ρ_travée h_c par mètre, 60 % / 40 %
  const lc = (frac, rho) => chooseBars(Math.max(frac * rho * hc, 0.2 * Math.max(bI.As, bS.As) * frac / 0.5), { phiMin: 12, phiMax: 25, sMax: 0.25 });
  const lS = lc(0.6, p.rhoTravee), lI = lc(0.4, p.rhoTravee), nbL = s2 => Math.floor((B - 2 * c) / s2) + 1;
  F.droite('longitudinales', `nappe supérieure HA${lS.phi} / ${sTxt(lS.s)} (0,6 ρ_travée h_c = ${fr(0.6 * p.rhoTravee * hc * 1e4, 1)} cm²/m)`, lS.phi, Lt - 2 * c, nbL(lS.s), fck);
  F.droite('longitudinales', `nappe inférieure HA${lI.phi} / ${sTxt(lI.s)} (0,4 ρ_travée h_c)`, lI.phi, Lt - 2 * c, nbL(lI.s), fck);
  // complément sur appui : (ρ_appui − ρ_travée) h_c sur chaque zone d'appui, prolongé de l_bd de chaque côté
  const piles = L.length - 1;
  if (piles > 0 && p.rhoAppui > p.rhoTravee) {
    const dS = (p.rhoAppui - p.rhoTravee) * hc * 0.6, dI = (p.rhoAppui - p.rhoTravee) * hc * 0.4;
    for (const [nom, dA, frac] of [['supérieure', dS, 0.6], ['inférieure', dI, 0.4]]) {
      const b = chooseBars(dA, { phiMin: 12, phiMax: 25, sMax: 0.25 }), lbd = anchorage(b.phi, { fck, top: frac > 0.5 }).lbd;
      for (let j = 1; j <= piles; j++) {
        const Lz = p.zone * (L[j - 1] + L[j]) + 2 * lbd;
        F.droite('sur appui', `P${j} : complément nappe ${nom} HA${b.phi} / ${sTxt(b.s)} ((ρ_appui − ρ_travée) h_c × ${fr(frac, 1)}), zone ${fr(p.zone * 100, 0)} % des travées + 2 l_bd`, b.phi, Lz, nbL(b.s), fck);
      }
    }
  }
  // rives : U HA12 / 20 sur toute la longueur (constructif, EC2 § 9.3.1.4)
  F.ligne('rives', 'U de rive HA12 / 20 (constructif)', 12, '21', { A: 150, B: (hc - 2 * c) * 1000, C: 150 }, 2 * (Math.floor((Lt - 2 * c) / 0.2) + 1));
  const R = recapitulatif(F.out), vol = B * hc * Lt;
  return { lignes: F.out, R, ratio: R.masse / vol, vol, B, hc, Lt, AsI, AsS };
}

/* ------------------------------------------------------------------------------------------------ feuilles */
function feuilleNomenclature({ titre, N0, notes, vue, cartouche }) {
  const lignes = N0.lignes, wb = 166, hl = 4.6, hb = (lignes.length + 2) * hl + 6 + (N0.R.diam.length + 3) * 5.5;
  const td = { titre: 'REPÈRES', hl: 4.6, h: 1.9, cols: [{ t: 'Rep.', w: 11, a: 'c' }, { t: 'Élément', w: 26, a: 'c' }, { t: 'Désignation', w: 129, a: 'g' }], lignes: lignes.map(l => [l.repere, l.element, l.desig]) };
  const N = notes.flatMap((l, i) => (i ? couperNote(l, 80) : [l])), ht = (td.lignes.length + 2) * td.hl, hn = N.length * 2.1 * 1.6;
  const F = composer({ titre, cartouche, rangees: [[vue]], groupes: [{ vues: [vue], cible: 50, min: 20 }], colonne: { largeur: wb + 3, hauteur: 2 + hb + 6 + ht + 6 + hn + 4 },
    poser: (F, [x, y]) => { const xb = F.W - 10 - wb - 3; placerBordereau(F, lignes, [xb, y + 2 + ht + 6, wb, hb]); F.tableau(td, xb, y + 2); F.note(N, xb, y + 2 + ht + 6 + hb + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A2', 'A1', 'A0']);
  F.cartouche.echelles = F.cartouche.echelles || '1/' + vue.echelle;
  F.nomenclature = N0;
  return F;
}

export function planNomenclatureContinues(out, cartouche = {}, { nom = 'POUTRES RENDUES CONTINUES' } = {}) {
  const N0 = nomenclatureContinues(out), f = out.p.forme, V = new Vue('COUPE COURANTE : POUTRE ET HOURDIS', { echelle: 20 });
  const P = [[-f.bb / 2, 0], [f.bb / 2, 0], [f.bb / 2, f.hb], [f.bw / 2, f.hb], [f.bw / 2, f.H - f.ht], [f.bt / 2, f.H - f.ht], [f.bt / 2, f.H], [-f.bt / 2, f.H], [-f.bt / 2, f.H - f.ht], [-f.bw / 2, f.H - f.ht], [-f.bw / 2, f.hb], [-f.bb / 2, f.hb]];
  V.poly('COFFRAGE', P, true); V.hachure(P); V.poly('VUES', [[-f.bh / 2, f.H], [f.bh / 2, f.H], [f.bh / 2, f.H + f.hd], [-f.bh / 2, f.H + f.hd]], true);
  const c = 0.03; V.poly('ACIERS', [[-f.bw / 2 + c, f.H + f.hd - 0.05], [-f.bw / 2 + c, c], [f.bw / 2 - c, c], [f.bw / 2 - c, f.H + f.hd - 0.05]]);
  V.poly('ACIERS', [[-f.bb / 2 + c, c], [f.bb / 2 - c, c], [f.bb / 2 - c, f.hb - c], [-f.bb / 2 + c, f.hb - c]], true);
  V.poly('ACIERS', [[-f.bh / 2 + c, f.H + f.hd - c], [f.bh / 2 - c, f.H + f.hd - c]]); V.poly('ACIERS', [[-f.bh / 2 + c, f.H + c], [f.bh / 2 - c, f.H + c]]);
  V.repere([f.bb / 2 + 0.2, 0.05], '1', [f.bb / 2 - c - 0.03, c + 0.02]); V.repere([f.bt / 2 + 0.2, f.H * 0.6], '2', [f.bw / 2 - c, f.H * 0.6]); V.repere([-f.bb / 2 - 0.2, f.hb / 2], '3', [-f.bb / 2 + c, f.hb / 2]);
  V.coteH([-f.bh / 2, f.H + f.hd], [f.bh / 2, f.H + f.hd], f.H + f.hd + 0.15); V.coteV([-f.bt / 2, 0], [-f.bt / 2, f.H], -f.bt / 2 - 0.15);
  const notes = ['NOTES', `1. Nomenclature de l'ouvrage complet : ${N0.n} travée(s) de ${fr(N0.L)} m à ${N0.nP} poutres, hourdis et ${N0.n - 1} clavage(s) sur appui.`,
    '2. Talon et étriers : ouvrage terminé (ELU avec effets hyperstatiques, effort tranchant) ; continuité sur appui : A_s supérieur nécessaire, prolongé de 0,25 L + l_bd de part et d\'autre (EN 1992-1-1 § 9.2.1.3).',
    `3. Hourdis : flexion locale de la plaque sur les poutres (roues EC et F61, poinçonnement), au moins le minimum EC2 § 9.3.1.1 ; répartition longitudinale ≥ 20 % (§ 9.3.1.1 (2)).`,
    `4. Masse totale ${milliers(N0.R.masse)} kg, soit ${fr(N0.ratio, 0)} kg/m³ de béton des poutres et du hourdis. Aciers HA B500B.`];
  return feuilleNomenclature({ titre: `${nom} — NOMENCLATURE DES ARMATURES`, N0, notes, vue: V, cartouche });
}

export function planNomenclatureVoussoir(out, cartouche = {}, { nom = 'PONT PAR ENCORBELLEMENTS' } = {}) {
  const N0 = nomenclatureVoussoir(out), K = out.p.caisson, h = out.p.hc, ti = K.tic, xw = K.Bi / 2, V = new Vue('COUPE D\'UN VOUSSOIR COURANT (CLÉ) : CADRE TRANSVERSAL', { echelle: 50 });
  const ext = [[-K.B / 2, 0], [K.B / 2, 0], [K.B / 2, -K.ts], [xw, -K.ts], [xw, -h], [-xw, -h], [-xw, -K.ts], [-K.B / 2, -K.ts]];
  const int = [[-xw + K.bw, -K.ts], [xw - K.bw, -K.ts], [xw - K.bw, -h + ti], [-xw + K.bw, -h + ti]];
  V.poly('COFFRAGE', ext, true); V.poly('COFFRAGE', int, true); V.hachure([...ext, ext[0], int[0], ...int.slice(1).reverse(), int[0]]);
  const c = 0.04;
  V.poly('ACIERS', [[-K.B / 2 + c, -c], [K.B / 2 - c, -c]]); V.poly('ACIERS', [[-xw + K.bw - c, -K.ts + c], [xw - K.bw + c, -K.ts + c]]);
  for (const s of [-1, 1]) { V.poly('ACIERS', [[s * (xw - c), -c], [s * (xw - c), -h + c]]); V.poly('ACIERS', [[s * (xw - K.bw + c), -K.ts + c], [s * (xw - K.bw + c), -h + ti - c]]); }
  V.poly('ACIERS', [[-xw + c, -h + c], [xw - c, -h + c]]); V.poly('ACIERS', [[-xw + K.bw - c, -h + ti - c], [xw - K.bw + c, -h + ti - c]]);
  V.repere([K.B / 2 - 0.5, 0.45], '1', [K.B / 2 - 0.8, -c]); V.repere([0, -K.ts - 0.45], '2', [0.3, -K.ts + c]); V.repere([xw + 0.5, -h / 2], '3', [xw - c, -h / 2]);
  V.repere([xw - K.bw - 0.5, -h / 2], '4', [xw - K.bw + c, -h / 2]); V.repere([0.6, -h - 0.45], '5', [0.6, -h + c]); V.repere([-0.6, -h + ti + 0.45], '6', [-0.6, -h + ti - c]);
  V.coteH([-K.B / 2, 0], [K.B / 2, 0], 0.5); V.coteV([xw, 0], [xw, -h], xw + 1.0);
  const notes = ['NOTES', `1. Voussoir courant de ${fr(N0.lv)} m à la section de la clé (h = ${fr(h)} m) ; les voussoirs plus hauts demandent des cadres d'âme plus longs (même pas).`,
    '2. Cadre transversal : sections par mètre de la flexion transversale du caisson (distortion répartie par le gauchissement et les diaphragmes) ; âmes : le plus grand de la flexion du cadre et d\'un brin d\'étrier de l\'effort tranchant (A_sw/s / 4).',
    '3. Longitudinales : peau HA12 / 15 sur toutes les faces (minimum), complément inférieur de l\'ouvrage terminé à la clé ; recouvrements aux joints de voussoirs (l₀, § 8.7.3).',
    `4. Masse ${milliers(N0.R.masse)} kg par voussoir, soit ${fr(N0.ratio, 0)} kg/m³. Frettage des ancrages et bossages : selon l'agrément du procédé.`];
  return feuilleNomenclature({ titre: `${nom} — NOMENCLATURE D'UN VOUSSOIR COURANT`, N0, notes, vue: V, cartouche });
}

export function planNomenclatureDalleMixte(out, cartouche = {}, { nom = 'PONT MIXTE' } = {}) {
  const N0 = nomenclatureDalleMixte(out), p = out.p, B = p.largeur, hc = p.hc, g = p.travee, e = p.entraxe, n = p.nPoutres, c = 0.04;
  const V = new Vue('COUPE TRANSVERSALE DE LA DALLE : ARMATURES', { echelle: 50 });
  V.poly('COFFRAGE', [[-B / 2, 0], [B / 2, 0], [B / 2, -hc], [-B / 2, -hc]], true); V.hachure([[-B / 2, 0], [B / 2, 0], [B / 2, -hc], [-B / 2, -hc]]);
  const ys = Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * e), z0 = -hc - p.hg;
  for (const y of ys) {
    V.poly('VUES', [[y - g.bfs / 2, -hc], [y + g.bfs / 2, -hc], [y + g.bfs / 2, z0], [y - g.bfs / 2, z0]], true);
    // semelle supérieure et amorce d'âme (charpente : plan MX-CH-02)
    const zs = z0 - g.tfs - 0.35;
    V.poly('VUES', [[y - g.bfs / 2, z0], [y + g.bfs / 2, z0], [y + g.bfs / 2, z0 - g.tfs], [y + g.tw / 2, z0 - g.tfs], [y + g.tw / 2, zs], [y - g.tw / 2, zs], [y - g.tw / 2, z0 - g.tfs], [y - g.bfs / 2, z0 - g.tfs]], true);
    V.poly('VUES', [[y - 0.12, zs + 0.03], [y - 0.04, zs + 0.06], [y + 0.04, zs - 0.03], [y + 0.12, zs]]);
  }
  V.poly('ACIERS', [[-B / 2 + c, -hc + c], [-B / 2 + c, -c], [B / 2 - c, -c], [B / 2 - c, -hc + c]]);
  V.poly('ACIERS', [[-B / 2 + c, -hc + c], [B / 2 - c, -hc + c]]);
  const pas = 0.25, dots = (z, r) => { for (let y = -B / 2 + c + 0.05; y <= B / 2 - c - 0.05 + 1e-9; y += pas) V.cercle('ACIERS', [y, z], r, true); };
  dots(-c - 0.02, 0.012); dots(-hc + c + 0.02, 0.010);
  V.repere([B / 2 - 0.6, 0.45], '2', [B / 2 - 0.9, -c]); V.repere([0.4, -hc - 0.45], '1', [0.6, -hc + c]); V.repere([-B / 2 + 0.6, 0.45], '3', [-B / 2 + 0.8, -c - 0.02]);
  V.coteH([-B / 2, 0], [B / 2, 0], 0.5); V.coteV([B / 2, 0], [B / 2, -hc], B / 2 + 0.4);
  const notes = ['NOTES', `1. Dalle de l'ouvrage complet : ${p.L.map(x => fr(x, 0)).join(' + ')} m, largeur ${fr(B)} m, épaisseur ${fr(hc)} m (goussets non comptés).`,
    '2. Transversales : flexion locale de la plaque sur les poutres (roues EC et F61) et poinçonnement, au moins le minimum EC2 § 9.3.1.1 ; nappe supérieure avec retours en rive.',
    `3. Longitudinales : ρ_travée = ${fr(p.rhoTravee * 100, 2)} % et ρ_appui = ${fr(p.rhoAppui * 100, 2)} % de la section de dalle (60 % en nappe supérieure, 40 % en inférieure, comme le calcul de la section mixte) ; complément sur ${fr(p.zone * 100, 0)} % des travées de part et d'autre des piles, prolongé de l_bd (EN 1994-2 § 7.4.2, minimum vérifié dans la note) ; recouvrements l₀ (EC2 § 8.7.3).`,
    `4. Masse ${milliers(N0.R.masse)} kg, soit ${fr(N0.ratio, 0)} kg/m³ de dalle. Aciers HA B500B. Goujons : voir le plan de charpente MX-CH-02.`];
  return feuilleNomenclature({ titre: `${nom} — DALLE : NOMENCLATURE DES ARMATURES`, N0, notes, vue: V, cartouche });
}

export function planNomenclatureVoussoirPile(out, cartouche = {}, { nom = 'PONT PAR ENCORBELLEMENTS' } = {}) {
  const N0 = nomenclatureVoussoirPile(out), p = out.p, K = p.caisson, h = p.hp, ti = K.tip, xw = K.Bi / 2, A = out.vsp.appareil, D = out.vsp.diaphragme;
  const V = new Vue('COUPE SUR PILE : DIAPHRAGME ET APPAREILS D\'APPUI', { echelle: 50 });
  const ext = [[-K.B / 2, 0], [K.B / 2, 0], [K.B / 2, -K.ts], [xw, -K.ts], [xw, -h], [-xw, -h], [-xw, -K.ts], [-K.B / 2, -K.ts]];
  V.poly('COFFRAGE', ext, true); V.hachure(ext);
  const int = [[-xw + K.bw, -K.ts], [xw - K.bw, -K.ts], [xw - K.bw, -h + ti], [-xw + K.bw, -h + ti]];
  V.poly('VUES', int, true);   // contour intérieur du caisson, masqué par le diaphragme
  const c = 0.05, s = 0.25;
  for (let z = -h + c; z <= -c + 1e-9; z += s) V.poly('ACIERS', [[-xw + c, z], [xw - c, z]]);
  for (let y = -xw + c; y <= xw - c + 1e-9; y += s) V.poly('ACIERS', [[y, -h + c], [y, -c]]);
  for (const sg of [-1, 1]) {
    const yc = sg * (xw - K.bw / 2);
    V.poly('COFFRAGE', [[yc - A.a / 2, -h], [yc + A.a / 2, -h], [yc + A.a / 2, -h - 0.15], [yc - A.a / 2, -h - 0.15]], true);
    const byH = Math.min(A.by, K.Bi / 2 - c), y0 = sg * (xw - c), y1 = sg * (xw - byH + c);
    V.poly('ACIERS', [[y0, -h + c], [y1, -h + c], [y1, -h + Math.min(0.6, h / 3)], [y0, -h + Math.min(0.6, h / 3)]], true);
  }
  V.repere([0, 0.45], '1', [0.3, -0.6]); V.repere([-xw - 0.8, -h / 2], '2', [-xw + c, -h / 2]); V.repere([xw + 0.8, -h - 0.4], '4', [xw - K.bw / 2, -h + 0.3]);
  V.coteH([-xw, -h], [xw, -h], -h - 0.6); V.coteV([K.B / 2, 0], [K.B / 2, -h], K.B / 2 + 0.6);
  const notes = ['NOTES', `1. Deux voussoirs sur pile ; diaphragme plein d'épaisseur ${fr(D.ed)} m (trou d'homme et passages de câbles à ménager, avec renforts de bord, selon le projet d'exécution).`,
    `2. Diaphragme : treillis orthogonal des deux faces, A_s/s du flux de Bredt q = T_Ed/(2Ω) = ${fr(out.vsp.torsion.q, 0)} kN/m ou minimum 0,1 % par face (EN 1992-1-1 § 9.7).`,
    `3. Appareils sous les âmes : R_ELU = ${milliers(A.RELU)} kN ; plaque indicative ${fr(A.a)} × ${fr(A.a)} m ; frettage par cadres fermés, tirant ¼ (b − a)/b · R (§ 6.5.3) ; pression localisée vérifiée (§ 6.7).`,
    '4. Ancrages (1,2 P₀) : frettage d\'éclatement ¼ (h − a)/h · P (§ 8.10.3) ; tirants arrière des bossages 0,25 P (Rogowsky et Marti, VSL 1991) ; frettage de la zone locale (spirales) selon l\'agrément du procédé, en plus.',
    `5. Masse ${milliers(N0.R.masse)} kg pour les deux piles et tous les ancrages. Aciers HA B500B.`];
  return feuilleNomenclature({ titre: `${nom} — VOUSSOIR SUR PILE ET ANCRAGES : NOMENCLATURE`, N0, notes, vue: V, cartouche });
}
