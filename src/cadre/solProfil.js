/**
 * Module du sol de fondation d'un cadre (ESOL) et vitesse des ondes de cisaillement V_s, tirés d'un profil d'essais
 * in situ, en plus de la table indicative du guide :
 *  - PRESSIOMÈTRE (E_M, p*_l) : annexe 2 du guide SETRA « Programme de calcul PICF-EL » — module de réaction de
 *    Terzaghi et Peck k = E_M·λ, λ = 1/(2·α·B₀)·((B + 0,30)/(2B))², B₀ = 0,32 m, puis ESOL = 2·k·B (portage BVTrace) ;
 *    α de structure : sables et graviers 1/3, limons 1/2, argiles normalement consolidées 2/3, surconsolidé 1 ;
 *  - PÉNÉTROMÈTRE STATIQUE (q_c) : méthode directe de Schmertmann (NF P94-261, annexe I) — tassement du radier sous une
 *    pression d'essai, k = Δq/s, ESOL = 2·k·B ; aucune corrélation vers un module ;
 *  - PÉNÉTROMÈTRE DYNAMIQUE (q_d, formule des Hollandais) : q_c ≈ q_d / r, rapport r = q_d/q_c à caler si possible sur un
 *    sondage statique voisin (valeurs par défaut prudentes : sables 1,0 ; limons 1,5 ; argiles 2,0), puis comme ci-dessus.
 *    Le nombre de coups N₂₀ d'un pénétromètre dynamique lourd (DPSH, énergie voisine du SPT) peut être donné en plus :
 *    il sert à estimer V_s ;
 *  - SPT (N) : V_s = 96,9·N^0,314 (Imai et Tonouchi, 1982), en m/s.
 * Couche porteuse : moyenne harmonique des modules sur une profondeur B (largeur du radier) sous le radier. Le guide
 * rappelle qu'une erreur de 50 % sur ESOL n'a qu'une faible incidence sur les efforts du cadre et conseille une valeur
 * par défaut plutôt que par excès : ces corrélations suffisent au calcul de structure, pas à une justification de
 * portance ou de tassement.
 * Lignes du profil : profondeur z [m] sous la sous-face du radier (ou des semelles), puis :
 *   pressio : « z E_M p*_l nature » (MPa) ; cpt : « z q_c nature » (MPa) ; dpt : « z q_d nature [N₂₀] » (MPa) ;
 *   spt : « z N nature ». Nature : argile, argileSurconsolidee, limon, sable, grave, roche.
 */
import { schmertmann } from '../geotech/tassements.js';

export const B0 = 0.32;
const NATURES = ['argile', 'argileSurconsolidee', 'limon', 'sable', 'grave', 'roche'];
export const ALPHA_STRUCTURE = { sable: 1 / 3, grave: 1 / 3, limon: 0.5, argile: 2 / 3, argileSurconsolidee: 1, roche: 1 };
export const RAPPORT_QD_QC = { sable: 1.0, grave: 1.0, limon: 1.5, argile: 2.0, argileSurconsolidee: 2.0, roche: 1.0 };

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const num = w => (w === undefined || w === '-' ? NaN : Number(String(w).replace(',', '.')));

/** Lecture d'un profil : lignes « z valeur(s) nature ». */
export function lireProfil(texte, type) {
  const out = [];
  for (const raw of String(texte || '').split('\n')) {
    const t = raw.trim(); if (!t || t.startsWith('#')) continue;
    const w = t.split(/[;\s]+/).filter(Boolean), z = num(w[0]);
    if (!Number.isFinite(z)) continue;
    if (type === 'pressio') { const EM = num(w[1]), pl = num(w[2]), nat = NATURES.includes(w[3]) ? w[3] : 'argile'; if (EM > 0) out.push({ z, EM, pl, nature: nat }); }
    else if (type === 'cpt') { const qc = num(w[1]), nat = NATURES.includes(w[2]) ? w[2] : 'sable'; if (qc > 0) out.push({ z, qc, nature: nat }); }
    else if (type === 'dpt') { const qd = num(w[1]), nat = NATURES.includes(w[2]) ? w[2] : 'sable', N = num(w[3]); if (qd > 0) out.push({ z, qd, nature: nat, N: N > 0 ? N : null }); }
    else if (type === 'spt') { const N = num(w[1]), nat = NATURES.includes(w[2]) ? w[2] : 'sable'; if (N > 0) out.push({ z, N, nature: nat }); }
  }
  return out.sort((a, b) => a.z - b.z);
}

const harmonique = v => v.length ? v.length / v.reduce((s, x) => s + 1 / x, 0) : NaN;
const dominante = pts => { const c = {}; for (const p of pts) c[p.nature] = (c[p.nature] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || 'argile'; };
export const vsImai = N => 96.9 * Math.pow(N, 0.314);

/**
 * ESOL [MPa] et V_s [m/s] d'un profil, sous un radier de largeur B [m].
 * @param opts { rapportQd } rapport q_d/q_c imposé (sinon valeur par défaut selon la nature)
 */
export function solDepuisProfil(type, texte, B, opts = {}) {
  const pts = lireProfil(texte, type);
  if (!pts.length) return { esol: null, vs: null, notes: [`Profil ${type} vide ou illisible : ESOL tiré de la table indicative.`] };
  const zMax = Math.max(B, 1.0);
  let zone = pts.filter(p => p.z <= zMax + 1e-9);
  if (!zone.length) zone = [pts[0]];
  const nat = dominante(zone), notes = [];
  let esol = null, vs = null;
  if (type === 'pressio') {
    const EM = harmonique(zone.map(p => p.EM)), a = ALPHA_STRUCTURE[nat], r = (B + 0.30) / (2 * B), lambda = 1 / (2 * a * B0) * r * r, k = EM * lambda;
    esol = 2 * k * B;
    notes.push(`ESOL depuis le pressiomètre (guide PICF-EL, annexe 2) : E_M = ${fr(EM, 1)} MPa (moyenne harmonique de ${zone.length} essai(s) sur ${fr(zMax)} m sous le radier), sol ${nat}, α = ${fr(a, 3)} ; λ = 1/(2·α·0,32)·((B + 0,30)/(2B))² = ${fr(lambda, 3)} m⁻¹ pour B = ${fr(B)} m ; k = ${fr(k, 1)} MPa/m ; ESOL = 2·k·B = ${fr(esol, 1)} MPa.`);
  } else if (type === 'cpt' || type === 'dpt') {
    // Méthode directe : tassement de Schmertmann (NF P94-261 annexe I) sous une pression d'essai, d'où k = Δq/s et
    // ESOL = 2·k·B. Pas de corrélation vers un module : seul le pénétromètre dynamique passe par q_c ≈ q_d/r.
    const qcPts = pts.map(p => ({ z: p.z, qc: type === 'dpt' ? p.qd / (opts.rapportQd > 0 ? opts.rapportQd : RAPPORT_QD_QC[p.nature]) : p.qc }));
    const L = opts.L > 0 ? opts.L : 10 * B, dq = 100, t = opts.tAns > 0 ? opts.tAns : 10, gam = 20;
    const couches = qcPts.map((p, i) => ({ z0: i === 0 ? 0 : (qcPts[i - 1].z + p.z) / 2, z1: i === qcPts.length - 1 ? Math.max(p.z, 4 * B) + 1 : (p.z + qcPts[i + 1].z) / 2, qc: p.qc }));
    const sch = forme => { const zp = forme === 'filante' ? B : B / 2; return schmertmann({ forme, B, q: dq, sigmaV0: 0, sigmaVp: gam * zp, t, couches }); };
    const sC = sch('carree').s, sF = sch('filante').s, rap = Math.min(Math.max(L / B, 1), 10), sMm = sC + (sF - sC) * (rap - 1) / 9;
    const k = dq / 1000 / (sMm / 1000);             // MPa/m
    esol = 2 * k * B;
    const qcm = harmonique(couches.filter(c => c.z0 < 2 * B).map(c => c.qc));
    notes.push(`ESOL depuis le pénétromètre ${type === 'dpt' ? 'dynamique' : 'statique'}, méthode directe de Schmertmann (NF P94-261, annexe I ; E = 2,5 q_c en semelle carrée, 3,5 q_c en filante) : ${type === 'dpt' ? `q_c ≈ q_d / r avec r = ${opts.rapportQd > 0 ? fr(opts.rapportQd) + ' (saisi)' : 'valeur par défaut selon la nature (sables 1,0, limons 1,5, argiles 2,0)'}, ` : ''}q_c moyen ${fr(qcm)} MPa sur 2B ; sous Δq = ${dq} kPa et t = ${t} ans, tassement ${fr(sMm, 1)} mm pour un radier ${fr(B)} × ${fr(L)} m (interpolation carrée/filante sur L/B = ${fr(rap, 1)}) ; k = Δq/s = ${fr(k, 1)} MPa/m ; ESOL = 2·k·B = ${fr(esol, 1)} MPa.`);
    if (type === 'dpt') {
      notes.push('Pénétromètre dynamique seul : le seul pas indirect est q_c ≈ q_d/r. Il suffit au calcul des efforts du cadre (le guide admet ±50 % sur ESOL), mais ni à la portance ni au tassement ; un sondage statique ou pressiométrique, même unique, permet de caler le rapport q_d/q_c du site.');
      const Ns = zone.filter(p => p.N > 0).map(p => p.N);
      if (Ns.length) { const N = Ns.reduce((s, x) => s + x, 0) / Ns.length; vs = vsImai(N); notes.push(`V_s ≈ 96,9·N^0,314 = ${vs.toFixed(0)} m/s (Imai et Tonouchi, 1982) avec N ≈ N₂₀ moyen = ${fr(N, 1)} coups (pénétromètre dynamique lourd assimilé au SPT : hypothèse).`); }
    }
  } else if (type === 'spt') {
    const N = zone.reduce((s, p) => s + p.N, 0) / zone.length;
    vs = vsImai(N);
    notes.push(`V_s ≈ 96,9·N^0,314 = ${vs.toFixed(0)} m/s (Imai et Tonouchi, 1982), N moyen ${fr(N, 1)} sur ${fr(zMax)} m ; le SPT ne donne pas ESOL ici : table indicative ou saisie.`);
  }
  if (esol != null) notes.push('Le guide PICF-EL conseille une valeur d\'ESOL par défaut plutôt que par excès ; une erreur de 50 % n\'a qu\'une faible incidence sur les efforts.');
  return { esol, vs, nature: nat, notes, points: pts };
}
