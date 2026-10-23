/**
 * Pont construit par encorbellements : voussoir sur pile, diaphragme et zones d'ancrage (après déclouage, tablier sur
 * deux appareils par pile, un sous chaque âme).
 *
 *  - torsion transmise au diaphragme sur pile (le caisson y est bloqué en torsion et en distortion) : voies LM1 placées
 *    du côté le plus défavorable (EN 1991-2 § 4.3.2), couple des tandems T_TS = Σ 2 Q_i e_i et couple réparti de l'UDL
 *    t = Σ q_i w_l e_i ; chaque appui reprend la moitié du couple réparti des travées voisines et tout le couple du tandem
 *    placé sur lui : T_Ed = 1,35 [T_TS + t (L_g + L_d)/2] ;
 *  - diaphragme : panneau en cisaillement pur sous le flux de Bredt q = T_Ed/(2 Ω) (Ω : aire du feuillet moyen à la
 *    pile), armatures orthogonales A_s/s = q/f_yd dans chaque direction (θ = 45°, EN 1992-1-1 § 6.2.4 et § 6.5), bielle
 *    τ = q/e_d ≤ ν f_cd/2 ; minimum des voiles et poutres-cloisons 0,1 % par face et par direction (§ 9.7) ;
 *  - appareils d'appui sous les âmes : réaction R = (permanentes + trafic)/2 + T/b ; plaque de côté a pour σ = 20 MPa
 *    à l'ELS (appareil à pot, valeur indicative), pression localisée F_Rdu = A_c0 f_cd √(A_c1/A_c0) ≤ 3 f_cd A_c0
 *    (§ 6.7 ; A_c1 élargie longitudinalement dans le diaphragme et le hourdis inférieur, pas transversalement) ; diffusion :
 *    tirant T = ¼ (b − a)/b · R (§ 6.5.3, éq. 6.58), repris par des cadres de frettage ;
 *  - ancrages : câbles de continuité dans des bossages du hourdis inférieur et câbles de fléau dans les goussets du
 *    hourdis supérieur, effort 1,2 P₀ (γ_P,unfav = 1,2 pour les effets locaux, § 2.4.2.2 (3)). Éclatement T = ¼ (h − a)/h · P (éq. 6.58, diffusion à 2 β = 2 arctan ⅔, § 8.10.3 (4)), tirants
 *    arrière des bossages 0,25 P (VSL, « Detailing for post-tensioning », Rogowsky et Marti 1991, § 4.3), frettage de la
 *    zone locale selon l'agrément européen du procédé (ETAG 013 / EAD 160004).
 * Unités : m, kN, MPa (sorties en m²/m pour les sections par mètre).
 */
import { lm1, notionalLanes, EC_ALPHA } from '../loads_ec.js';

const fydOf = (fyk = 500) => fyk / 1.15;

/** Couples de torsion du trafic LM1 sur une chaussée de largeur Lr : tandems (kN·m) et UDL (kN·m/m). */
export function couplesTrafic(Lr, alpha = EC_ALPHA.recommended) {
  const NL = notionalLanes(Lr), L1 = lm1(NL.n, alpha);
  let TTS = 0, tU = 0;
  L1.lanes.forEach((l, i) => { const e = Lr / 2 - NL.wl * (i + 0.5); if (e > 0) { TTS += 2 * l.Q * e; tU += l.q * NL.wl * e; } });
  return { TTS, tU, n: NL.n, wl: NL.wl };
}

export function voussoirSurPile(out, o = {}) {
  const p = out.p, K = p.caisson, v = out.acheve;
  if (!K || !v) throw new Error('voussoir sur pile : caisson défini par ses dimensions et ouvrage terminé nécessaires');
  const fck = p.fck, fcd = 0.85 * fck / 1.5, fyd = fydOf(o.fyk || 500), nu = 0.6 * (1 - fck / 250);
  const ed = o.eDiaph ?? 0.8, Lr = o.Lr ?? K.B - 2, c = o.c ?? 0.05, sigApp = o.sigApp ?? 20;
  const hp = p.hp, bAx = K.Bi - K.bw, hAx = hp - K.ts / 2 - K.tip / 2, Omega = bAx * hAx;
  // ---- torsion transmise au diaphragme de la pile (travée de rive a, travée centrale 2a)
  const C = couplesTrafic(Lr, o.alpha), Lg = p.a, Ld = 2 * p.a;
  const TEd = 1.35 * (C.TTS + C.tU * (Lg + Ld) / 2), Tk = C.TTS + C.tU * (Lg + Ld) / 2;
  const q = TEd / (2 * Omega);
  const AsReq = q / (fyd * 1000), AsMinFace = Math.max(0.001 * ed, 1.5e-4), AsFace = Math.max(AsReq / 2, AsMinFace);
  const tau = q / ed / 1000, tauLim = nu * fcd / 2;
  // ---- appareils sous les âmes (pile la plus chargée)
  const rP = v.reactions.filter((_, j) => j > 0 && j < v.reactions.length - 1).reduce((a, r) => (r.G + r.TS + r.UDL > a.G + a.TS + a.UDL ? r : a));
  const Q = rP.TS + rP.UDL + rP.trott, RELU = (1.35 * rP.G + 1.35 * Q) / 2 + TEd / bAx, RELS = (rP.G + Q) / 2 + Tk / bAx;
  const a = Math.ceil(Math.sqrt(RELS / (sigApp * 1000)) / 0.05 - 1e-9) * 0.05;
  // aire de diffusion A_c1 : longitudinalement le diaphragme et le hourdis inférieur (b_x ≤ 3a, a + 2 t_i) ; transversalement
  // aucun élargissement compté (appareil au droit de l'âme, près du parement extérieur)
  const bx = Math.min(3 * a, Math.max(ed, a) + 2 * K.tip), FRdu = a * a * fcd * 1000 * Math.min(Math.sqrt(bx / a), 3);
  // tirants de diffusion dans le bloc d'appui : longitudinal (largeur b_x) et transversal (étalement dans l'épaisseur du hourdis)
  const by = Math.min(3 * a, a + 2 * K.tip), b1 = bx;
  const Tapp = Math.max(0.25 * (bx - a) / bx, 0.25 * (by - a) / by) * RELU, AsApp = Tapp / (fyd * 1000);
  // ---- ancrages : bossages des câbles de continuité, goussets des câbles de fléau
  const aAnc = P => Math.ceil(Math.sqrt(1.2 * P / 35000) / 0.01) * 0.01;   // plaque d'ancrage indicative (≈ 35 MPa sous 1,2 P₀)
  const anc = (P, h) => { const aa = aAnc(P), T = 0.25 * Math.max(h - aa, 0) / h * 1.2 * P; return { P, a: aa, h, T, As: T / (fyd * 1000) }; };
  const CC = p.continuite || { n: 0, nRive: 0, P0: 0 }, CF = p.cable;
  const bossage = CC.P0 > 0 ? { ...anc(CC.P0, o.hBossage ?? 0.6), tieBack: 0.25 * 1.2 * CC.P0, AsTB: 0.25 * 1.2 * CC.P0 / (fyd * 1000), nombre: 2 * CC.n + 2 * CC.nRive } : null;
  const gousset = { ...anc(CF.P0, o.tGousset ?? K.ts + 0.2), nombre: 2 * 2 * CF.n * p.nv };
  // ---- vérifications
  const verifs = [];
  const add = (nom, val, lim, ok, ref) => verifs.push({ nom, val, lim, ok, ref, x: p.a });
  add('Diaphragme sur pile : cisaillement de torsion τ = q / e_d [MPa]', tau, tauLim, tau <= tauLim, 'EN 1992-1-1 § 6.2.4 / § 6.5.2 : bielles ν f_cd / 2');
  add('Appareil sous âme : pression localisée R_ELU / F_Rdu [kN]', RELU, FRdu, RELU <= FRdu, 'EN 1992-1-1 § 6.7');
  return {
    torsion: { ...C, Lg, Ld, TEd, Tk, Omega, bAx, hAx, q },
    diaphragme: { ed, AsReq, AsFace, AsMinFace, tau, tauLim },
    appareil: { R: rP, RELU, RELS, a, b1, bx, by, FRdu, T: Tapp, As: AsApp, sigApp },
    bossage, gousset, verifs, ok: verifs.every(x => x.ok),
  };
}
