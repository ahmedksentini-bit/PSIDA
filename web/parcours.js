/**
 * Parcours par type d'ouvrage : page d'accueil (choix de l'ouvrage, état réel des fonctions), barre d'onglets réduite aux
 * étapes de l'ouvrage choisi, numérotées dans l'ordre du projet, avec leur état (fait / à faire). Le choix est un champ du
 * formulaire (« ouvrage ») : il est enregistré avec le projet. Aucun calcul n'est modifié.
 */

/** État des fonctions par ouvrage : 'oui', 'partiel' ou 'non' (affiché sur l'accueil, sans enjoliver). */
const COLONNES = ['Conception', 'Calcul sous trafic', 'ELS / ELU', 'Ferraillage ou câblage', 'Appuis, fondations', 'Séisme', 'Plans', 'Note'];

export const OUVRAGES = {
  dalle: {
    titre: 'Pont-dalle', sous: 'armé (PSI-DA) ou précontraint (PSI-DP)',
    texte: 'Dalle continue de 1 à plusieurs travées, droite, biaise ou courbe : répartition de Guyon-Massonnet ou plaque, Eurocodes ou Fascicule 61 / BAEL, ferraillage et plans, appuis, séisme, notes.',
    etapes: [['projet', 'Tablier'], ['conception', 'Conception'], ['tablier', 'Calcul'], ['ferraillage', 'Ferraillage, plans'], ['precontrainte', 'Précontrainte'], ['complements', 'Compléments'], ['appuis', 'Appuis'], ['seisme', 'Séisme'], ['retenue', 'Retenue'], ['notes', 'Notes']],
    etat: ['oui', 'oui', 'oui', 'oui', 'oui', 'oui', 'oui', 'oui'],
  },
  poutres: {
    titre: 'Pont à poutres', sous: 'VIPP (post-tension), PRAD (pré-tension) et poutres en béton armé, travées indépendantes',
    texte: 'Répartition de Guyon-Massonnet ; VIPP par dimensions : câblage, pertes, phases (fluage, retrait, relaxation), contraintes ELS, ELU, effort tranchant et étriers, flèches, diagnostic du guide Sétra 1996 ; PRAD : torons adhérents, gainage, pertes au relâchement, étuvage, transmission et ancrage ; hourdis (plaque, roues EC et F61), entretoises d\'about (vérinage), plans (coffrage, câblage ou torons, ferraillage), nomenclature des armatures, note ; réactions transmises aux appuis.',
    etapes: [['poutres', 'Tablier à poutres'], ['appuis', 'Appuis'], ['seisme', 'Séisme'], ['retenue', 'Retenue']],
    etat: ['oui', 'oui', 'oui', 'oui', 'oui', 'partiel', 'oui', 'oui'],
  },
  cadre: {
    titre: 'Cadre ou portique', sous: 'PICF, PIPO — ouvrages hydrauliques et passages inférieurs',
    texte: 'Méthode du programme Sétra PICF-EL, sol élastique, charges routières ou ferroviaires, BAEL ou EC2, séisme EN 1998-2, portance F62 / EC7, plans de coffrage et de ferraillage.',
    etapes: [['cadres', 'Cadre ou portique'], ['retenue', 'Retenue']],
    etat: ['oui', 'oui', 'oui', 'oui', 'oui', 'oui', 'oui', 'oui'],
  },
  continues: {
    titre: 'Poutres rendues continues', sous: 'poutres préfabriquées précontraintes + hourdis, clavage sur appuis',
    texte: 'Prédimensionnement (règles Sétra, affinage par le calcul) ; calcul par phases (pose isostatique, hourdis, clavage, superstructures ; fluage, retrait, relaxation, pertes) puis ouvrage terminé : trafic réparti par Guyon-Massonnet, gradient thermique, ELS, ELU avec effets hyperstatiques, effort tranchant, armatures de continuité, réactions vers les appuis ; plans de coffrage, clavage et câblage.',
    etapes: [['phasage', 'Tablier par phases'], ['appuis', 'Appuis'], ['seisme', 'Séisme'], ['retenue', 'Retenue']], phType: 'poutres',
    etat: ['oui', 'oui', 'oui', 'partiel', 'oui', 'partiel', 'oui', 'oui'],
    manque: 'hourdis par l\'onglet Tablier à poutres ; à venir : bordereau de façonnage des poutres continues.',
  },
  fleaux: {
    titre: 'Pont par encorbellements', sous: 'fléaux en caisson, voussoirs coulés en place',
    texte: 'Prédimensionnement (règles Sétra, affinage) ; calcul par phases voussoir par voussoir (équipage mobile, câbles de fléau et de continuité, clavages ; pertes, contre-flèches) ; déséquilibres de construction et clouage provisoire ; ouvrage terminé : trafic, gradient thermique, ELS, ELU avec effets hyperstatiques, effort tranchant (effet Résal), flexion transversale du caisson (cadre, torsion, distortion), réactions vers les appuis ; plans de coffrage des voussoirs et de câblage.',
    etapes: [['phasage', 'Tablier par phases'], ['appuis', 'Appuis'], ['seisme', 'Séisme'], ['retenue', 'Retenue']], phType: 'fleau',
    etat: ['oui', 'oui', 'oui', 'partiel', 'oui', 'partiel', 'oui', 'oui'],
    manque: 'à venir : distortion avec diaphragmes intermédiaires (analogie de la poutre sur appuis élastiques), bordereau de façonnage.',
  },
  mixte: {
    titre: 'Pont mixte acier-béton', sous: 'bipoutre, quadripoutre, droit ou courbe en plan',
    texte: 'Prédimensionnement (règles Sétra, affinage par le calcul) ; sections mixtes EN 1994-2, calcul par phases (charpente, plots, fissuration, fluage et retrait) ; charpente au bétonnage (déversement des semelles, déversement d\'ensemble) ; structure achevée : trafic LM1, écart thermique, ELU par classe (âme efficace), voilement par cisaillement, déversement avec berceaux, connexion, fatigue ; tablier courbe (grillage, flexion latérale des semelles, soulèvement) ; plans de charpente ; réactions vers les appuis.',
    etapes: [['phasage', 'Tablier mixte'], ['appuis', 'Appuis'], ['seisme', 'Séisme'], ['retenue', 'Retenue']], phType: 'mixte',
    etat: ['oui', 'oui', 'oui', 'partiel', 'oui', 'partiel', 'oui', 'oui'],
    manque: 'à venir : fatigue des armatures de la dalle, ferraillage transversal de la dalle.',
  },
};

const $ = s => document.querySelector(s);
const PICTO = {
  dalle: '<rect x="4" y="18" width="56" height="7" fill="#9fb6d4"/><path d="M8 25v10M32 25v10M56 25v10" stroke="#556" stroke-width="2"/>',
  poutres: '<rect x="4" y="14" width="56" height="4" fill="#9fb6d4"/><path d="M10 18v10M22 18v10M34 18v10M46 18v10M58 18v10" stroke="#556" stroke-width="3"/>',
  cadre: '<rect x="12" y="10" width="40" height="26" fill="none" stroke="#556" stroke-width="4"/><path d="M4 10h56" stroke="#8a6" stroke-width="2" stroke-dasharray="3 2"/>',
  continues: '<rect x="4" y="16" width="56" height="4" fill="#c9d6c4"/><rect x="4" y="20" width="26" height="8" fill="#9fb6d4"/><rect x="34" y="20" width="26" height="8" fill="#9fb6d4"/><rect x="29" y="16" width="6" height="12" fill="#e9b949"/>',
  fleaux: '<path d="M4 14h56v4q-28 4 -28 14q0 -10 -28 -14z" fill="#9fb6d4" stroke="#556"/><rect x="29" y="30" width="6" height="8" fill="#999"/>',
  mixte: '<rect x="4" y="12" width="56" height="5" fill="#c9d6c4"/><path d="M16 17v16M48 17v16M10 33h12M42 33h12M12 17h8M44 17h8" stroke="#556" stroke-width="2.5"/>',
};

/** Ouvrage courant (champ du formulaire ; « dalle » pour les projets antérieurs à ce choix). */
export function ouvrage() { const e = document.querySelector('[name="ouvrage"]'); return (e && OUVRAGES[e.value]) ? e.value : 'dalle'; }

/** État d'une étape d'après l'interface (résultats affichés). */
function faite(tab) {
  const mode = document.body.dataset.mode, vis = s => { const e = $(s); return !!(e && !e.hidden && e.innerHTML.trim()); };
  switch (tab) {
    case 'projet': case 'conception': return !!mode;
    case 'tablier': case 'ferraillage': case 'complements': case 'notes': return mode === 'full';
    case 'precontrainte': return mode === 'full' && !!document.querySelector('#bp-out table');
    case 'appuis': return (mode === 'full' || mode === 'supports') && !!document.querySelector('#card-supports table');
    case 'poutres': return vis('#card-poutres');
    case 'cadres': return vis('#card-cadre');
    case 'phasage': return vis('#card-phasage');
    case 'seisme': return /^Efforts reçus/.test(($('#ec8-status') || {}).textContent || '');
    default: return false;   // dispositifs de retenue : calcul en direct, pas d'état « fait »
  }
}

/** Barre d'onglets : Accueil + étapes numérotées de l'ouvrage courant. */
export function rendreNav() {
  const nav = $('nav.tabs'); if (!nav) return;
  const o = OUVRAGES[ouvrage()], cur = window.psidaTabs ? window.psidaTabs.current() : null;
  nav.innerHTML = `<a href="#accueil" role="tab" data-tab="accueil" class="tab-accueil">Accueil</a><span class="nav-ouvrage">${o.titre}</span>`
    + o.etapes.map(([k, nom], i) => `<a href="#${k}" role="tab" data-tab="${k}">${i + 1}. ${nom}${faite(k) ? ' <span class="ok-mark">✓</span>' : ''}</a>`).join('');
  nav.querySelectorAll('a').forEach(a => a.setAttribute('aria-selected', String(a.dataset.tab === cur)));
  const bc = $('#btn-calc'); if (bc) bc.hidden = ouvrage() !== 'dalle';
  const sub = $('header .sub'); if (sub) sub.textContent = `${o.titre} — ${o.sous} · Eurocodes et règles françaises · code ouvert`;
}

/** Accueil : cartes des ouvrages et état de leurs fonctions. */
export function rendreAccueil() {
  const box = $('#accueil-ouvrages'); if (!box) return;
  const cur = ouvrage(), puce = v => (v === 'oui' ? '<b class="et-oui">oui</b>' : v === 'partiel' ? '<b class="et-partiel">partiel</b>' : '<b class="et-non">à venir</b>');
  box.innerHTML = Object.entries(OUVRAGES).map(([k, o]) => `<div class="ouv-card${k === cur ? ' choisi' : ''}" data-ouvrage="${k}">
    <div class="ouv-txt"><svg class="ouv-lettrine" viewBox="0 0 64 40" width="160" height="100" aria-hidden="true">${PICTO[k]}</svg><h3>${o.titre}</h3><div class="small ouv-sous">${o.sous}</div><p class="small">${o.texte}</p>
    <div class="ouv-etat">${COLONNES.map((c, i) => `<div class="ouv-et"><span>${c}</span>${puce(o.etat[i])}</div>`).join('')}</div>
    ${o.manque ? `<p class="small ouv-manque">${o.manque}</p>` : ''}
    <button type="button" class="${k === cur ? '' : 'secondary'} ouv-choisir">${k === cur ? 'Ouvrage en cours — continuer' : 'Choisir cet ouvrage'}</button></div></div>`).join('');
}

/** Choix d'un ouvrage : champ, sous-type du phasage, barre d'onglets, première étape. */
export function choisirOuvrage(k, { aller = true } = {}) {
  const f = document.querySelector('[name="ouvrage"]'); if (!f || !OUVRAGES[k]) return;
  f.value = k;
  const o = OUVRAGES[k];
  if (o.phType) { const s = document.querySelector('[name="ph_type"]'); if (s && s.value !== o.phType) { s.value = o.phType; s.dispatchEvent(new Event('change', { bubbles: true })); } }
  const lab = document.querySelector('[name="ph_type"]'); if (lab && lab.closest('label')) lab.closest('label').hidden = !!o.phType;
  rendreAccueil(); rendreNav();
  if (aller && window.psidaTabs) window.psidaTabs.goTab(o.etapes[0][0]);
}

export function initParcours() {
  const box = $('#accueil-ouvrages');
  if (box) box.addEventListener('click', ev => { const c = ev.target.closest('.ouv-card'); if (c && (ev.target.closest('.ouv-choisir') || ev.target.closest('h3') || ev.target.closest('svg'))) choisirOuvrage(c.dataset.ouvrage); });
  // l'étape affichée hors du parcours de l'ouvrage (lien ancien, projet rouvert) : on la garde accessible mais signalée
  const maj = () => rendreNav();
  new MutationObserver(maj).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
  for (const s of ['#card-supports', '#card-poutres', '#card-cadre', '#card-phasage', '#bp-out', '#ddr-out', '#ec8-status']) { const e = $(s); if (e) new MutationObserver(maj).observe(e, { attributes: true, childList: true, subtree: s === '#ec8-status' }); }
  window.addEventListener('psida-tab', maj);
  const o = OUVRAGES[ouvrage()];
  const lab = document.querySelector('[name="ph_type"]'); if (lab && lab.closest('label')) lab.closest('label').hidden = !!o.phType;
  rendreAccueil(); rendreNav();
}
