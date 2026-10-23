/**
 * Contraintes normales du béton au cours des phases (sections non fissurées, parties de section composée prises
 * séparément) : σ = N/A − M·y/I, y compté depuis le c.d.g. de la partie, vers le haut ; traction positive (MPa).
 *
 * Limites (NF EN 1992-1-1 et NF EN 1992-2) :
 *  - compression en construction (phases antérieures à la mise en service) : 0,6 f_ck(t) — § 5.10.2.2 (5) à la mise en
 *    précontrainte, § 113.3.2 de l'EN 1992-2 pour les phases de construction ;
 *  - compression en service sous charges permanentes (combinaison quasi permanente) : 0,45 f_ck — § 7.2 (3), au-delà le
 *    fluage n'est plus linéaire ;
 *  - traction : comparée à f_ctm(t) (risque de fissuration, § 7.1 (2)) ; dans les parties précontraintes en service,
 *    décompression sous combinaison quasi permanente (EN 1992-2, tableau 7.101N, classes XC2 à XC4).
 * f_ck(t) et f_ctm(t) selon § 3.1.2 (5) et (9). Les charges d'exploitation et le gradient thermique ne sont pas inclus :
 * ce sont les contraintes sous actions permanentes et précontrainte, celles que le phasage détermine.
 */
import { betonEC2 } from './fluage.js';

/**
 * out = résultat de calculPhasage ; modele ; fibres[k] = { vs, vi, precontraint, nom } par barre (distances du c.d.g. de
 * la partie aux fibres supérieure et inférieure, m) ; tService = date de mise en service (superstructures).
 * Renvoie { parBarre, enveloppe: { [partie]: { cMax, tMax, … } }, verifs: [...] }.
 */
export function contraintesPhases(out, modele, fibres, tService, { xs = [0, 0.5, 1] } = {}) {
  const lois = {};
  for (const [k, o] of Object.entries(modele.betons)) if (!o.loi || o.loi === 'ec2') lois[k] = { b: betonEC2(o), tC: o.tCoulage ?? 0 };
  const env = {};
  const note = (partie, champ, v, info) => { const e = env[partie] || (env[partie] = {}); if (!e[champ] || (champ === 'cMin' ? v < e[champ].v : v > e[champ].v)) e[champ] = { v, ...info }; };
  const sigma = (r, bb, f, x) => {
    const N = r.N, M = r.M(x), A = bb.A, I = bb.I;
    return { s: (N / A - M * f.vs / I) / 1000, i: (N / A + M * f.vi / I) / 1000 };
  };
  out.pas.forEach((p, ip) => {
    p.barres.forEach((r, k) => {
      const f = fibres[k]; if (!r || !f) return;
      const bb = modele.barres[k], L = Math.hypot(modele.noeuds[bb.j][0] - modele.noeuds[bb.i][0], modele.noeuds[bb.j][1] - modele.noeuds[bb.i][1]);
      const loi = lois[bb.beton]; if (!loi) return;
      const age = p.t - loi.tC, service = p.t >= tService - 1e-9;
      const lim = { comp: (service ? 0.45 : 0.6) * loi.b.fckT(age), trac: loi.b.fctmT(age) };
      for (const xi of xs) {
        const q = sigma(r, bb, f, xi * L);
        for (const [fib, v] of [['sup', q.s], ['inf', q.i]]) {
          const info = { t: p.t, ip, barre: k, xi, fibre: fib, age, lim, service };
          note(f.partie, 'cMin', v, info);
          note(f.partie, 'tMax', v, info);
          // taux de travail en compression (σ / limite) et en traction
          // béton de moins d'un jour (partie qui vient d'être activée, sans contrainte) : pas de taux
          if (age >= 1 && Math.abs(v) > 1e-3) { if (v < 0) note(f.partie, 'tauxC', -v / lim.comp, { ...info, s: v }); else note(f.partie, 'tauxT', v / lim.trac, { ...info, s: v }); }
          // rapport k_σ = |σ_c| / f_ck(t) : au-delà de 0,45, le fluage n'est plus linéaire (EN 1992-1-1 § 3.1.4 (4))
          if (age >= 1 && v < -1e-3) note(f.partie, 'kSig', -v / loi.b.fckT(age), { ...info, s: v });
          if (service && f.precontraint) note(f.partie, 'tService', v, info);
        }
      }
    });
  });
  // vérifications
  const verifs = [];
  for (const [partie, e] of Object.entries(env)) {
    if (e.tauxC) verifs.push({ partie, critere: `compression ≤ ${e.tauxC.service ? '0,45' : '0,6'} f_ck(t)`, valeur: e.tauxC.s, limite: -e.tauxC.lim.comp, taux: e.tauxC.v, ok: e.tauxC.v <= 1 + 1e-9, ou: e.tauxC });
    if (e.tauxT) verifs.push({ partie, critere: 'traction ≤ f_ctm(t) (non-fissuration)', valeur: e.tauxT.s, limite: e.tauxT.lim.trac, taux: e.tauxT.v, ok: e.tauxT.v <= 1 + 1e-9, ou: e.tauxT });
    if (e.tService) verifs.push({ partie, critere: 'décompression en service (quasi permanente)', valeur: e.tService.v, limite: 0, taux: null, ok: e.tService.v <= 1e-3, ou: e.tService });
  }
  // fluage non linéaire : le calcul par phases emploie une loi de fluage linéaire (superposition de Boltzmann) ; quand la
  // compression dépasse 0,45 f_ck(t), on signale le coefficient de l'EN 1992-1-1 § 3.1.4 (4), éq. 3.7 : φ_nl = φ exp(1,5 (k_σ − 0,45))
  let nonLineaire = null;
  for (const [partie, e] of Object.entries(env)) if (e.kSig && e.kSig.v > 0.45 && (!nonLineaire || e.kSig.v > nonLineaire.k)) nonLineaire = { partie, k: e.kSig.v, facteur: Math.exp(1.5 * (e.kSig.v - 0.45)), ou: e.kSig };
  return { enveloppe: env, verifs, nonLineaire };
}

/** Contraintes aux fibres d'une barre au pas p (section à l'abscisse relative xi). */
export function contraintesBarre(p, modele, fibres, k, xi) {
  const r = p.barres[k], f = fibres[k]; if (!r || !f) return null;
  const bb = modele.barres[k], L = Math.hypot(modele.noeuds[bb.j][0] - modele.noeuds[bb.i][0], modele.noeuds[bb.j][1] - modele.noeuds[bb.i][1]);
  const N = r.N, M = r.M(xi * L);
  return { sup: (N / bb.A - M * f.vs / bb.I) / 1000, inf: (N / bb.A + M * f.vi / bb.I) / 1000 };
}
