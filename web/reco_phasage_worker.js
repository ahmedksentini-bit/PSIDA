/**
 * Recommandations de l'onglet « Phasage » dans un Web Worker (module) : chaque essai relance le calcul par phases et
 * l'ouvrage terminé (quelques secondes) ; les recherches tournent ici pour que la page reste utilisable.
 * Messages reçus : { id, type: 'reco', data, budget } → { id, type: 'reco', rec } ; { id, type: 'chercher', data, c } →
 * { id, type: 'chercher', r } ; pendant le calcul : { id, type: 'progres', n } ; en cas d'erreur : { id, type: 'erreur', message }.
 * Le résultat du calcul est recalculé ici à l'identique (données du formulaire) : les index des lignes « NON » sont
 * ceux des tableaux affichés.
 */
import { computePhasage } from './phasage_view.js';
import { recommandationsPhasage, chercherPhasage } from '../src/reco/phasage.js';

self.onmessage = ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'reco') {
      const out = computePhasage(m.data);
      const rec = recommandationsPhasage(out, m.data, { budget: m.budget ?? 90000, progres: n => self.postMessage({ id: m.id, type: 'progres', n }) });
      // objets simples seulement (clonage structuré) : les actions « chercher » ne portent pas de fonction
      self.postMessage({ id: m.id, type: 'reco', rec: JSON.parse(JSON.stringify(rec)) });
    } else if (m.type === 'chercher') {
      self.postMessage({ id: m.id, type: 'chercher', r: chercherPhasage(m.data, m.c) });
    }
  } catch (e) { self.postMessage({ id: m.id, type: 'erreur', message: e.message || String(e) }); }
};
