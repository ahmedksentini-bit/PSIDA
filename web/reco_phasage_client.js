/**
 * Client du Web Worker des recommandations de l'onglet « Phasage » (web/reco_phasage_worker.js) : une demande à la fois
 * par calcul ; un nouveau calcul abandonne la recherche en cours (Worker relancé).
 */
let worker = null, numero = 0;
const attente = new Map();

function travailleur() {
  if (!worker) {
    worker = new Worker(new URL('./reco_phasage_worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ev => {
      const m = ev.data, w = attente.get(m.id); if (!w) return;
      if (m.type === 'progres') { if (w.progres) w.progres(m.n); return; }
      attente.delete(m.id);
      if (m.type === 'erreur') w.rej(new Error(m.message)); else w.res(m);
    };
    worker.onerror = ev => { for (const w of attente.values()) w.rej(new Error(ev.message || 'Worker des recommandations indisponible')); attente.clear(); worker = null; };
  }
  return worker;
}
const demande = (msg, progres) => new Promise((res, rej) => { const id = ++numero; attente.set(id, { res, rej, progres }); travailleur().postMessage({ ...msg, id }); });

/** Recommandations des données du formulaire `data` (même calcul que l'affichage) ; rejet « abandonné » si un autre calcul suit. */
export function recommanderPhasage(data, { budget = 150000, progres = null } = {}) {
  if (attente.size && worker) { worker.terminate(); worker = null; for (const w of attente.values()) w.rej(new Error('abandonné')); attente.clear(); }
  return demande({ type: 'reco', data, budget }, progres).then(m => m.rec);
}
/** Bouton « Calculer » du panneau : plus petite valeur du levier c.levier qui fait passer la famille c.famille. */
export const chercherPhasageWorker = (data, c) => demande({ type: 'chercher', data, c }).then(m => m.r);
