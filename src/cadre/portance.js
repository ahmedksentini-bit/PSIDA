/**
 * Portance du sol sous le radier d'un cadre fermé et sous les semelles d'un portique ouvert, par les méthodes directes
 * des essais in situ — module de fondations superficielles de PSIDA (copié de fond.ksr-infra.org, src/geotech) :
 *  - Fascicule 62 titre V (annexes B.1, B.2, E.2, F.1) : q'_ref ≤ (q'_u − q'_0)·i_δβ/γ_q + q'_0, γ_q = 2 (ELU) ou 3 (ELS rare),
 *    q'_ref = (3 q'_max + q'_min)/4 ; q'_u − q'_0 = k_p·p*_le (pressiomètre) ou k_c·q_ce (pénétromètre statique) ;
 *  - NF P94-261 (Eurocode 7), guide Cerema 2015 : V_d − R_0 ≤ A·i_e·i_δ·q_net/(γ_R;v·γ_R;d;v), γ_R;v = 1,4 (ELU), 2,3 (ELS),
 *    γ_R;d;v = 1,2 ; q_net = k_p·p*_le ou k_c·q_ce ; p*_le moyenne géométrique et q_ce moyenne écrêtée sur 1,5 B.
 * Le pénétromètre dynamique n'a pas de méthode directe dans ces textes : q_c ≈ q_d/r (rapport du site ou par défaut),
 * puis la méthode pénétrométrique — c'est une corrélation, signalée comme telle.
 * Encastrement compté nul (D_e = 0, k_p = k₀ ou k_c = k₀) : prudent, le remblai récent autour de l'ouvrage n'étant pas
 * un terrain d'encastrement ; q'_0 = γ'·D avec D la profondeur sous le terrain naturel saisie.
 * Unités : charges du cadre en t (1 t = 10 kN), contraintes en kPa.
 */
import { lireProfil, RAPPORT_QD_QC } from './solProfil.js';
import { profilPoints } from '../geotech/outils.js';
import * as SF from '../geotech/superficielles.js';
import { proposerClasseF62, CLASSES_F62 } from '../geotech/sols.js';
import { largeurCalc, nCell, epVoile } from './cadre.js';

const KN = 10;
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const CAT = { argile: 'argile', argileSurconsolidee: 'argile', limon: 'argile', sable: 'sable', grave: 'sable', roche: 'roche' };
const FAM = { argile: 'argile', argileSurconsolidee: 'argile', limon: 'argile', sable: 'sable', grave: 'sable', roche: 'roche' };
const coherent = nat => CAT[nat] !== 'sable';

function classeF62Qc(famille, qc) {
  const c = Object.entries(CLASSES_F62).filter(([, v]) => v.famille === famille && v.qc);
  let ret = c[0];
  for (const e of c) if (qc >= e[1].qc[0]) ret = e;
  return ret ? { cle: ret[0], ...ret[1] } : null;
}

/** Résistance nette du sol sous une fondation de largeur B (profil depuis la base) : q_net [kPa] et ses éléments. */
export function resistanceNette({ type, texte, rapportQd = 0, B, forme, L, referentiel }) {
  const pts = lireProfil(texte, type);
  if (!pts.length) return { erreur: 'profil vide' };
  const nature = (() => { const c = {}; for (const p of pts.filter(p => p.z <= 1.5 * B + 1e-9)) c[p.nature] = (c[p.nature] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || pts[0].nature; })();
  const ec7 = referentiel !== 'F62';
  if (type === 'pressio') {
    const ok = pts.filter(p => p.pl > 0);
    if (!ok.length) return { erreur: 'pression limite p*_l absente du profil pressiométrique' };
    const profil = profilPoints(ok.map(p => ({ z: p.z, v: p.pl })), { log: true });
    const ple = ec7 ? SF.pleEC7({ profil, D: 0, hr: 1.5 * B }).ple : SF.pleF62({ profil, D: 0, B }).ple;
    let k, classe = null;
    if (ec7) k = SF.kpEC7({ categorie: CAT[nature], B, L, forme, De: 0 });
    else { classe = proposerClasseF62(FAM[nature], ple); k = SF.kpF62({ classe: classe.cle, B, L, forme, De: 0 }); }
    if (!k.applicable) return { erreur: k.motif || 'facteur de portance hors domaine' };
    return { methode: 'pressio', qnet: k.k * ple * 1000, k: k.k, ref: ple, refNom: 'p*_le', nature, classe: classe?.cle, coherent: coherent(nature) };
  }
  if (type === 'cpt' || type === 'dpt') {
    const qc = pts.map(p => ({ z: p.z, v: type === 'dpt' ? p.qd / (rapportQd > 0 ? rapportQd : RAPPORT_QD_QC[p.nature]) : p.qc }));
    const profil = profilPoints(qc);
    const qce = ec7 ? SF.qceEC7({ profil, D: 0, hr: 1.5 * B }).qce : SF.qceF62({ profil, D: 0, B }).qce;
    let k, classe = null;
    if (ec7) k = SF.kcEC7({ categorie: CAT[nature], B, L, forme, De: 0 });
    else { classe = classeF62Qc(FAM[nature], qce); k = classe ? SF.kcF62({ classe: classe.cle, B, L, forme, De: 0 }) : { applicable: false, motif: 'classe F62 sans valeur de q_c' }; }
    if (!k.applicable) return { erreur: k.motif || 'facteur de portance hors domaine' };
    return { methode: 'penetro', qnet: k.k * qce * 1000, k: k.k, ref: qce, refNom: 'q_ce', nature, classe: classe?.cle, coherent: coherent(nature), dpt: type === 'dpt' };
  }
  return { erreur: 'le SPT ne fournit pas de méthode directe de portance dans ces textes' };
}

/** Une vérification de portance (une combinaison). V, H en kN/m (ou kN), M en kN·m/m au centre de la base. */
function verifier({ V, H, M, B, L, forme, R, referentiel, etat, q0 }) {
  const e = Math.abs(M) / Math.max(V, 1e-9), delta = Math.atan2(Math.abs(H), Math.max(V, 1e-9)) * 180 / Math.PI;
  if (referentiel === 'F62') {
    const d = SF.diagramme({ forme, B, L, V, e });
    if (!d.applicable) return { etat, ok: false, taux: Infinity, detail: d.motif, e, delta };
    const idb = SF.idbF62({ sol: R.coherent ? 'coherent' : 'frottant', delta, B, De: 0 }).i;
    const et = etat === 'ELU' || etat === 'ELU_acc' ? 'ELU' : 'ELS_rare';
    const p = SF.portanceF62({ qnette: R.qnet, q0, idb, qref: d.qrefTrapeze, etat: et });
    return { etat: et, ok: p.ok, taux: p.taux, qref: d.qrefTrapeze, qadm: p.qadm, e, delta, i: idb };
  }
  const ex = SF.excentrementEC7({ forme, B, L, eB: e });
  if (!ex.applicable) return { etat, ok: false, taux: Infinity, detail: ex.motif, e, delta };
  const id = SF.idEC7({ sol: R.coherent ? 'coherent' : 'frottant', delta, B, De: 0 }).i;
  const et = etat === 'ELU' ? 'ELU' : etat === 'ELU_acc' ? 'ELU_acc' : 'ELS_car';
  const A = forme === 'filante' ? B : B * L;
  const p = SF.portanceEC7({ A, ie: ex.ie * id, qnet: R.qnet, q0, Vd: V, etat: et, methode: R.methode });
  return { etat: et, ok: p.ok, taux: p.taux, Rvd: p.Rvd, R0: p.R0, ie: ex.ie, i: id, e, delta, excOk: ex[et === 'ELU_acc' ? 'ELU' : et]?.ok };
}

/**
 * Portance d'un cadre ou d'un portique calculé par calculPicf.
 * sol : { type, texte, rapportQd, referentiel ('EC7' | 'F62'), D (m sous le terrain naturel), gamma (kN/m³), Bs, hs (semelles PIPO) }
 */
export function portanceCadre(res, sol) {
  const { geom, h, cadre: g, combos, frames } = res, ouvert = !!res.ouvert, ref = sol.referentiel === 'F62' ? 'F62' : 'EC7';
  const notes = [], verifs = [];
  const q0 = (sol.gamma ?? 20) * Math.max(sol.D ?? 0, 0);
  const etatDe = c => /^ELU/.test(c.nom) ? 'ELU' : 'ELS';
  const retenue = c => !/^Phas/.test(c.nom);          // phasage et construction : états provisoires, hors justification de portance
  const fG = c => (/^ELU/.test(c.nom) && !/G−/.test(c.nom)) ? h.gG : 1;
  if (!ouvert) {
    const B = largeurCalc(g) + geom.ep, L = geom.L > 0 ? geom.L : null, forme = L ? 'rectangulaire' : 'filante';
    const R = resistanceNette({ ...sol, B, forme, L: L || 1, referentiel: ref });
    if (R.erreur) return { erreur: R.erreur, notes: [`Portance non vérifiée : ${R.erreur}.`] };
    let pp = h.rhoB * geom.er * B; for (let j = 0; j <= nCell(g); j++) pp += h.rhoB * epVoile(g, j) * geom.H;   // t/ml (radier + voiles)
    combos.forEach((c, k) => {
      if (!retenue(c)) return;
      const ch = frames[k].charge; if (!ch) return;
      const V = (ch.V + fG(c) * pp) * KN, Hh = ch.H * KN, M = ch.M * KN;            // kN/ml
      const Vt = L ? V * L : V, Ht = L ? Hh * L : Hh, Mt = L ? M * L : M;
      const v = verifier({ V: Vt, H: Ht, M: Mt, B, L: L || 1, forme, R, referentiel: ref, etat: etatDe(c), q0 });
      verifs.push({ fondation: 'Radier', combinaison: c.nom, V, H: Hh, M, ...v });
    });
    notes.push(`Portance sous le radier (${ref === 'F62' ? 'Fascicule 62 titre V' : 'NF P94-261'}) : B = ${fr(B)} m${L ? ` × L = ${fr(L)} m` : ' (filante, par mètre)'}, ${R.methode === 'pressio' ? `p*_le = ${fr(R.ref, 3)} MPa, k_p` : `q_ce = ${fr(R.ref, 3)} MPa, k_c`} = ${fr(R.k, 3)}${R.classe ? ` (classe ${R.classe})` : ` (catégorie ${CAT[R.nature]})`}, D_e = 0 (encastrement non compté) → q_net = ${fr(R.qnet, 0)} kPa ; q'_0 = ${fr(q0, 0)} kPa.`);
    if (R.dpt) notes.push('Portance tirée du pénétromètre dynamique par q_c ≈ q_d/r : corrélation hors des méthodes directes du Fascicule 62 et de la NF P94-261 — à confirmer par un essai statique ou pressiométrique.');
  } else {
    const Bs = sol.Bs > 0 ? sol.Bs : Math.max(1.0, 3 * geom.ep), hs = sol.hs > 0 ? sol.hs : Math.max(0.5, geom.ep), L = geom.L > 0 ? geom.L : null, forme = L ? 'rectangulaire' : 'filante';
    const R = resistanceNette({ ...sol, B: Bs, forme, L: L || 1, referentiel: ref });
    if (R.erreur) return { erreur: R.erreur, notes: [`Portance non vérifiée : ${R.erreur}.`] };
    const ps = h.rhoB * Bs * hs;                                                                      // t/ml de semelle
    combos.forEach((c, k) => {
      if (!retenue(c)) return;
      (frames[k].reactions || []).forEach((r, j) => {
        const V = (r.V + fG(c) * ps) * KN, Hh = r.H * KN, M = (r.M + r.H * hs) * KN;
        const Vt = L ? V * L : V, Ht = L ? Hh * L : Hh, Mt = L ? M * L : M;
        const v = verifier({ V: Vt, H: Ht, M: Mt, B: Bs, L: L || 1, forme, R, referentiel: ref, etat: etatDe(c), q0 });
        verifs.push({ fondation: j === 0 ? 'Semelle gauche' : j === nCell(g) ? 'Semelle droite' : `Semelle ${j}`, combinaison: c.nom, V, H: Hh, M, ...v });
      });
    });
    notes.push(`Portance des semelles du portique (${ref === 'F62' ? 'Fascicule 62 titre V' : 'NF P94-261'}) : B = ${fr(Bs)} m, épaisseur ${fr(hs)} m${L ? `, L = ${fr(L)} m` : ' (filantes, par mètre)'}, ${R.methode === 'pressio' ? `p*_le = ${fr(R.ref, 3)} MPa, k_p` : `q_ce = ${fr(R.ref, 3)} MPa, k_c`} = ${fr(R.k, 3)}, D_e = 0 → q_net = ${fr(R.qnet, 0)} kPa ; q'_0 = ${fr(q0, 0)} kPa. Glissement et renversement non traités.`);
    if (R.dpt) notes.push('Portance tirée du pénétromètre dynamique par q_c ≈ q_d/r : corrélation hors des méthodes directes du Fascicule 62 et de la NF P94-261 — à confirmer par un essai statique ou pressiométrique.');
  }
  const parEtat = {};
  for (const v of verifs) { const k = `${v.fondation}|${v.etat}`; if (!parEtat[k] || v.taux > parEtat[k].taux) parEtat[k] = v; }
  const synthese = Object.values(parEtat);
  notes.push('Phasage du remblaiement et phase de construction exclus de la justification de portance (états provisoires, justifiés en structure seulement).');
  return { referentiel: ref, verifs, synthese, ok: synthese.every(v => v.ok), notes };
}
