/**
 * Chapitre « Calcul sismique » de la note de calcul globale : note complète de Pont EC8 (action sismique, modèle, analyse
 * par la méthode du mode fondamental, vérifications des appareils d'appui, des repos et des joints), produite par le
 * moteur intégré (src/vendor/pont-ec8.js) sur le projet retenu par « Appuis et fondations » (calcul automatique sur le
 * projet PSIDA, ou projet de l'onglet « Calcul sismique »). Formules en LaTeX (blocs « math »), références au paragraphe
 * près (référentiel de Pont EC8).
 */
import * as EC8 from '../src/vendor/pont-ec8.js';
import { lineChart, barChart, svgBlock } from './note_figures.js';

const nb = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: d }) : String(v ?? '—'));
const texNb = (v, d = 3) => nb(v, d).replace(',', '{,}').replace(/[  ]/g, '\\,');
/** Texte placé dans \\text{…} : caractères spéciaux de LaTeX neutralisés (le % ouvrirait un commentaire). */
const texTxt = t => String(t ?? '').replace(/[{}\\]/g, '').replace(/([%#&$_])/g, '\\$1');
const ETAT = { ok: 'OK', alerte: 'À EXAMINER', ko: 'NON', info: 'INFO', na: 'sans objet' };

/** Texte des références d'une ligne (source, localisation, page du guide Cerema, état de vérification). */
export function referencesText(ids = []) {
  return ids.map(id => {
    const e = EC8.REFERENTIEL.find(x => x.id === id); if (!e) return null;
    const [r0] = e.references, g = e.references.find(r => r.source === 'GUIDE_CEREMA_2015');
    const src = r0 ? `${EC8.SOURCES[r0.source]?.abrege || r0.source} ${r0.localisation || ''}`.trim() : e.libelle;
    return `${src}${r0 && r0.etat === 'a_confirmer' ? ' (à confirmer)' : ''}${g && g !== r0 ? ` · guide p. ${g.page}` : ''}`;
  }).filter(Boolean).join(' ; ');
}

function sectionBlocks(B, sections, prefix) {
  for (const s of sections) {
    B.push({ t: 'h2', text: `${prefix} — ${s.titre}` });
    for (const l of s.lignes) {
      B.push({ t: 'h3', text: l.titre });
      if (l.formule) B.push({ t: 'math', tex: l.formule });
      const r = l.resultat;
      if (r && typeof r.valeur === 'number') B.push({ t: 'math', tex: `${r.symbole ? `${r.symbole} = ` : ''}${l.application ? `${l.application} = ` : ''}\\boldsymbol{${texNb(r.valeur, r.decimales ?? 3)}}${r.unite ? `\\ \\text{${texTxt(r.unite)}}` : ''}` });
      else if (r) B.push({ t: 'math', tex: `${r.symbole ? `${r.symbole} : ` : ''}\\text{${texTxt(r.valeur)}}` });
      else if (l.application) B.push({ t: 'math', tex: l.application });
      if (l.commentaire) B.push({ t: l.niveau === 'alerte' ? 'comment' : 'p', text: `${l.niveau === 'alerte' ? 'Alerte — ' : ''}${l.commentaire}` });
      const refs = referencesText(l.references);
      if (refs) B.push({ t: 'ref', text: `Réf. : ${refs}` });
    }
  }
}

/**
 * @param {object} seisme résultat de seismicActions / externalSeismic (projet Pont EC8 v1 dans seisme.projet)
 * @returns {object[]} blocs (h2, h3, p, comment, ref, math, table) — le titre de chapitre (h1) est posé par l'appelant
 */
export function seismicBlocks(seisme) {
  const B = [];
  if (!seisme) { B.push({ t: 'p', text: 'Séisme non étudié : case « Séisme » de l\'onglet Appuis et fondations non cochée.' }); return B; }
  if (seisme.error) { B.push({ t: 'comment', text: `Calcul sismique impossible : ${seisme.error}` }); return B; }
  if (!seisme.projet) { B.push({ t: 'comment', text: 'Projet Pont EC8 non transmis : renvoyer le projet depuis l\'onglet « Calcul sismique ».' }); return B; }
  const p = EC8.lireProjet(JSON.parse(JSON.stringify(seisme.projet)));
  const a = EC8.actionSismique(p), m = EC8.modele(p), r = EC8.analyse(p, a, m), v = EC8.verifierAppuis(p, a, m, r);
  const problemes = EC8.valider(p);
  B.push({ t: 'p', text: `Projet « ${p.nom} » (${seisme.source === 'onglet' ? 'onglet « Calcul sismique », projet éventuellement modifié par l\'utilisateur' : 'calcul automatique sur le projet PSIDA'}) : ${p.tablier.travees.length} travée(s) de ${p.tablier.travees.join(' + ')} m, zone ${p.site.zone}, catégorie d'importance ${p.site.categorie}, sol de classe ${p.site.classeSol}, q = ${nb(p.comportement.qLongitudinal, 2)} (longitudinal) / ${nb(p.comportement.qTransversal, 2)} (transversal). Méthode du mode fondamental (EN 1998-2 § 4.2.2), propriétés limites des élastomères (LBDP / UBDP), combinaison des directions 100/30/30.` });
  B.push({ t: 'table', head: ['Direction', 'K LBDP / UBDP [MN/m]', 'T LBDP / UBDP [s]', 'F UBDP [kN]', 'd_E LBDP [cm]'], rows: ['x', 'y'].map(dk => {
    const d = r.directions[dk];
    return [dk === 'x' ? 'Longitudinale (X)' : 'Transversale (Y)', `${nb(d.lbdp.K, 2)} / ${nb(d.ubdp.K, 2)}`, `${nb(d.lbdp.T, 3)} / ${nb(d.ubdp.T, 3)}`, nb(d.ubdp.F * 1000, 0), nb((d.lbdp.dE ?? NaN) * 100, 2)];
  }) });
  // spectres de réponse (EN 1998-1 § 3.2.2) avec les périodes du mode fondamental, puis efforts sismiques par appui
  try {
    const S = a.spectres, pts = f => EC8.echantillonnerSpectre(f, 4, 0.01);
    const T = r.directions, mk = [];
    for (const [dk, lab, f] of [['x', 'T_x', S.calculLong], ['y', 'T_y', S.calculTrans]]) for (const pr of ['lbdp', 'ubdp']) {
      const Tv = T[dk][pr].T; if (Number.isFinite(Tv)) mk.push({ x: Tv, y: EC8.spectreValeur(f, Tv), couleur: dk === 'x' ? '#dc2626' : '#0f766e', libelle: `${lab} ${pr === 'lbdp' ? 'LBDP' : 'UBDP'} = ${nb(Tv, 2)} s`, guides: true, rayon: 4 });
    }
    B.push(svgBlock(lineChart({ xlabel: 'période T [s]', ylabel: 'S [m/s²]', xRange: [0, 4], marques: mk, series: [
      { points: pts(S.elastiqueH), libelle: 'élastique horizontal S_e (ξ = 5 %)', couleur: '#64748b' },
      { points: pts(S.calculLong), libelle: `calcul longitudinal S_d (q = ${nb(p.comportement.qLongitudinal, 2)})`, couleur: '#dc2626' },
      { points: pts(S.calculTrans), libelle: `calcul transversal S_d (q = ${nb(p.comportement.qTransversal, 2)})`, couleur: '#0f766e', tirets: '6 3' },
      { points: pts(S.elastiqueV), libelle: 'élastique vertical S_ve', couleur: '#7c3aed', tirets: '2 3' }] }),
    `Spectres de réponse (EN 1998-1 § 3.2.2.2 à 3.2.2.5 ; zone ${p.site.zone}, sol ${p.site.classeSol}) et périodes du mode fondamental`));
    B.push(svgBlock(lineChart({ xlabel: 'période T [s]', ylabel: 'S_De [cm]', xRange: [0, 4], hauteur: 240, series: [{ points: EC8.echantillonnerSpectre(S.elastiqueH, 4, 0.02, EC8.spectreDeplacement).map(([x, y]) => [x, 100 * y]), libelle: 'spectre élastique en déplacement S_De = S_e (T/2π)²', couleur: '#0369a1' }] }),
    'Spectre élastique en déplacement (EN 1998-1 éq. 3.7)'));
    const ef = seisme.efforts || EC8.exporterEfforts(p, a, r), ap = ef.appuis || [];
    if (ap.length) B.push(svgBlock(barChart({ cats: ap.map((x, i) => x.id || `A${i + 1}`), ylabel: 'F [kN]', series: [
      { libelle: 'F_x (X + 0,3 Y + 0,3 Z)', values: ap.map(x => x.cas[0].Fx), couleur: '#dc2626' },
      { libelle: 'F_y (0,3 X + Y + 0,3 Z)', values: ap.map(x => x.cas[1].Fy), couleur: '#0f766e' },
      { libelle: 'F_z (0,3 X + 0,3 Y + Z)', values: ap.map(x => x.cas[2].Fz), couleur: '#7c3aed' }] }), 'Efforts sismiques par appui (combinaisons des directions 100/30/30)'));
  } catch (e) { /* figures sismiques indisponibles */ }
  if (problemes.length) B.push({ t: 'comment', text: `Alertes de saisie : ${problemes.map(x => `${x.cible} : ${x.message}`).join(' ; ')}` });
  sectionBlocks(B, a.note, 'Action sismique');
  sectionBlocks(B, m.note, 'Modèle');
  sectionBlocks(B, r.note, 'Analyse');
  sectionBlocks(B, v.note, 'Vérifications');
  B.push({ t: 'h2', text: 'Synthèse des vérifications (appareils d\'appui, repos, joints)' });
  B.push({ t: 'table', head: ['Appui', 'Critère', 'Valeur', 'Limite', 'État'], rows: v.criteres.map(c => [c.appui || '—', c.libelle, `${nb(c.valeur, 3)}${c.unite ? ' ' + c.unite : ''}`, c.limite === undefined || c.limite === null ? '—' : `${nb(c.limite, 3)}${c.unite ? ' ' + c.unite : ''}`, ETAT[c.etat] || String(c.etat)]), small: true });
  const ko = v.criteres.filter(c => c.etat === 'ko');
  B.push({ t: 'comment', text: ko.length ? `${ko.length} critère(s) non satisfait(s) : ${ko.map(c => `${c.appui ? c.appui + ' : ' : ''}${c.libelle}`).join(' ; ')}.` : 'Tous les critères de Pont EC8 sont satisfaits ou à examiner selon le tableau.' });
  B.push({ t: 'p', text: 'Les efforts par appui de cette analyse (cas X + 0,3 Y + 0,3 Z, 0,3 X + Y + 0,3 Z, 0,3 X + 0,3 Y + Z) entrent dans la combinaison sismique G + A_Ed des fûts et des fondations du chapitre « Appuis et fondations ».' });
  return B;
}

/** LaTeX → texte lisible (note Word, rendu de secours). */
export function texToText(t) {
  let s = String(t).replace(/\{,\}/g, ',');
  const G = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', varphi: 'φ', psi: 'ψ', omega: 'ω', Omega: 'Ω', xi_: 'ξ' };
  for (let k = 0; k < 6; k++) {
    s = s.replace(/\\(?:text|mathrm|mathit|boldsymbol|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/_\{([^{}]*)\}/g, '_$1').replace(/\^\{([^{}]*)\}/g, '^$1');
  }
  s = s.replace(/\\(left|right)\s*/g, '').replace(/\\(cdot|times)/g, (m, x) => (x === 'cdot' ? '·' : '×'))
    .replace(/\\leq?\b/g, '≤').replace(/\\geq?\b/g, '≥').replace(/\\approx/g, '≈').replace(/\\neq/g, '≠').replace(/\\infty/g, '∞')
    .replace(/\\(max|min|ln|log|exp|sin|cos|tan)\b/g, '$1').replace(/\\([A-Za-z]+)/g, (m, x) => G[x] ?? x)
    .replace(/\{,\}/g, ',').replace(/\\[,;: !]|~/g, ' ').replace(/\\quad|\\qquad/g, '  ').replace(/[{}]/g, '').replace(/\^2\b/g, '²').replace(/\^3\b/g, '³').replace(/\s+/g, ' ');
  return s.trim();
}
