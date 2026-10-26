/**
 * Ponts-rails, lot 4 : blocs « Déformations et vibrations » (interface et note de calcul) communs au pont-dalle et au pont
 * à poutres sous rail. Sans dépendance au DOM. Les articles sont cités, le texte des normes n'est pas reproduit.
 */
const F = (v, n = 1) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F2 = v => F(v, 2), F3 = v => F(v, 3);
const MM = v => F(v * 1000, 1);
const verdict = ok => (ok === null || ok === undefined ? 'À COMPLÉTER' : ok ? 'OK' : 'NON');
const CONFORT = { tres_bon: 'très bon', bon: 'bon', acceptable: 'acceptable' };

/**
 * Blocs de la section « Déformations et vibrations (EN 1991-2 § 6.4.4 ; EN 1990 A2.4.4) ».
 * @param {object} D résultat de deformationsRail (src/rail_deformations.js)
 * @param {object} opt titre (h2 de la section), travee (libellé de la travée pour les ponts à poutres)
 */
export function deformationsBlocks(D, { titre = 'Déformations et vibrations (EN 1991-2 § 6.4.4 ; EN 1990 A2.4.4)', travee = '' } = {}) {
  const B = [];
  B.push({ t: 'h2', text: titre + (travee ? ` — ${travee}` : '') });
  if (!D || D.erreur) { B.push({ t: 'comment', text: `Calcul des déformations impossible${D && D.erreur ? ` : ${D.erreur}` : ''}.` }); return B; }
  for (const a of D.avert || []) B.push({ t: 'comment', text: `Attention : ${a}.` });
  const H = D.hyp, n0 = D.n0, dec = D.decision;
  // --- décision d'analyse dynamique
  const lim = dec.limites || n0.limites;
  const n0s = [n0.n0, n0.n0min, n0.n0max].filter(x => x > 0);
  const n0txt = n0.n0 ? `n₀ = 17,75/√δ₀ = ${F2(n0.n0)} Hz (δ₀ = ${F(n0.d0, 1)} mm à mi-portée sous permanentes nominales${n0s.length > 1 && Math.max(...n0s) - Math.min(...n0s) > 0.005 ? ` ; ${F2(Math.min(...n0s))} à ${F2(Math.max(...n0s))} Hz avec la superstructure k min / k max` : ''})` : 'non estimée (travées continues : équation 6.3 limitée aux appuis simples)';
  B.push({ t: 'table', head: ['Grandeur', 'Valeur', 'Référence'], texte: true, wrap: true, rows: [
    ['Vitesse maximale de ligne V', H.V > 0 ? `${F0(H.V)} km/h` : 'non renseignée (≤ 120 km/h retenu pour le gauche)', '§ 6.4.4 ; § 6.5.1(5)'],
    ['Première fréquence propre de flexion', n0txt, 'figure 6.10, note 8, éq. (6.3)'],
    ['Limites de la fréquence propre', lim ? `[${F2(lim.inf)} ; ${F2(lim.sup)}] Hz pour L = ${F2(n0.L)} m${lim.domaine ? '' : ' (hors du domaine 4-100 m)'}` : '—', 'figure 6.10, éq. (6.1) et (6.2)'],
    ['Masse ; amortissement', `m = ${F(n0.m, 1)} t/m ; ζ = ${F2(n0.zeta)} % (${n0.type === 'precontraint' ? 'béton précontraint' : 'béton armé'})`, '§ 6.4.6.3.1 tableau 6.6 ; annexe F'],
    ['Rigidité de flexion', `EI = ${F0(H.EI / 1000)} MN·m² (section non fissurée, E_cm = ${F0(n0.E)} MPa, module instantané limité à C50/60)`, 'note 8 ; § 6.4.6.3.3'],
    ['Organigramme', dec.etapes.join(' → '), 'figure 6.9'],
    ['Conclusion', dec.conclusion + (dec.reserve ? ` — ${dec.reserve}` : ''), '§ 6.4.4'],
  ] });
  // --- vérifications
  const rows = [];
  for (const f of D.fleches) rows.push([`Flèche verticale, travée ${f.j + 1} (L = ${F2(f.L)} m), voie ${f.voie + 1}`, `${MM(f.w)} mm (L/${F0(f.LsurD)})`, `L/600 = ${MM(f.lim)} mm`, verdict(f.ok), 'EN 1990 A2.4.4.2.3(1)']);
  const G = D.gauche;
  rows.push([`Gauche du tablier sur 3 m (voie ${(G.voie ?? 0) + 1}${G.eCf > 0 ? ', excentrement centrifuge compris' : ''})`, `${F2(G.t)} mm`, `${F(G.lim, 1)} mm (t_T voie + tablier ≤ ${F(G.limTotal, 1)} mm)`, verdict(G.ok), 'EN 1990 A2.4.4.2.2']);
  for (const c of D.confort) rows.push([`Confort ${CONFORT[H.confort] || ''} (b_v = ${F(c.bv, 1)} m/s²), travée ${c.j + 1}`, `L/δ = ${F0(c.LsurD)} (δ = ${MM(c.w)} mm)`,
    c.LsurDlim ? `L/δ ≥ ${F0(c.LsurDlim)} (${F(c.facteur, 1)} × ${F0(H.LdeltaFig)} / b_v, ≥ 600)` : `L/δ de la figure A2.3 × ${F(c.facteur, 1)} / b_v (≥ 600) : à lire`, verdict(c.ok), 'EN 1990 A2.4.4.3.2, figure A2.3']);
  for (const e of D.extremites) {
    rows.push([`Rotation et déplacement longitudinal δH, extrémité ${e.appui}`, `θ = ${F(e.theta * 1000, 2)} mrad → δH = ${F2(e.deltaH)} mm`, `${F0(e.deltaHlim)} mm`, verdict(e.okH), 'EN 1991-2 § 6.5.4.5.2(2)']);
    rows.push([`Soulèvement δV de l'extrémité ${e.appui}`, e.about > 0 ? `${F2(e.deltaV)} mm (about ${F2(e.about)} m)` : 'about non renseigné', `${F0(e.deltaVlim)} mm`, e.about > 0 ? verdict(e.okV) : 'À COMPLÉTER', 'EN 1991-2 § 6.5.4.5.2(3)']);
  }
  if (D.transversal) {
    const T = D.transversal;
    for (const r of T.rows) {
      rows.push([`Déformation transversale, travée L = ${F2(r.L)} m`, `θ_h = ${F(r.thetaH * 1000, 3)} mrad ; r = ${r.rayon > 1e6 ? '> 1 000 000' : F0(r.rayon)} m`, `θ_h ≤ ${F(T.lim.thetaH * 1000, 1)} mrad ou r ≥ ${F0(T.lim.rayon)} m`, verdict(r.thetaH <= T.lim.thetaH + 1e-12 || r.rayon >= T.lim.rayon), 'EN 1990 A2.4.4.2.4, tableau A2.8']);
      rows.push([`Première fréquence latérale, travée L = ${F2(r.L)} m`, `${F(r.fh, 1)} Hz`, `≥ ${F(T.fh0, 1)} Hz`, verdict(r.fh == null ? null : r.fh >= T.fh0), 'EN 1990 A2.4.4.2.4(3)']);
    }
  }
  B.push({ t: 'table', head: ['Vérification', 'Valeur', 'Limite (valeur recommandée)', 'Verdict', 'Référence'], rows, texte: true, wrap: true });
  B.push({ t: 'comment', text: `Charges caractéristiques (ψ = 1 pour les déformations, note 4 du tableau A2.3). Flèche L/600 et gauche : LM71 × α (et SW/0 sur les ouvrages continus, SW/2 si requis) × Φ = ${F3(H.phi)}, toutes les voies chargées, excentrement r/18 le plus défavorable ; confort : LM71 × Φ, α = 1, une seule voie chargée ; δH : LM71 (et SW/0) × α sans Φ ; δV : rotation de l'about sous les mêmes charges que la flèche. Flèches de la poutre continue (EI du tablier entier) en forme fermée, convois déplacés sur les lignes d'influence de flèche et de rotation ; flèche sous une voie = K̄(y) de Guyon-Massonnet de la bande de la voie × flèche moyenne, moyenne des deux files de rails (écartement ${F3(H.s)} m). Gauche : différence de flèche entre files de rails sur 3 m, remblai d'accès supposé indéformable (gauche d'entrée et de sortie compris). Transversal : lacet 100·max(α ; 1) kN à mi-portée et force centrifuge répartie, travée sur appuis simples, inertie horizontale ${D.transversal ? `${F0(H.EIz / 1000)} MN·m²` : '—'} ; vent et gradient thermique transversal non pris en compte. δV : compression des appareils d'appui non comptée. Accélération du tablier (A2.4.4.2.1) : seulement si l'analyse dynamique est requise, hors de PSIDA.` });
  if (D.aConfirmer && D.aConfirmer.length) B.push({ t: 'comment', text: 'Points à confirmer sur l\'exemplaire de l\'EN 1990/A1 : ' + D.aConfirmer.join(' ') });
  return B;
}

/** Rendu HTML de la section (carte de l'onglet Tablier du pont-dalle) ; verdicts en badges. */
export function deformationsHTML(D, opt = {}) {
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const badge = c => (c === 'OK' ? '<span class="badge ok">OK</span>' : c === 'NON' ? '<span class="badge warn">NON</span>' : c === 'À COMPLÉTER' ? '<span class="badge warn">À COMPLÉTER</span>' : esc(c));
  return deformationsBlocks(D, opt).map(b => {
    if (b.t === 'h2') return `<h3>${esc(b.text)}</h3>`;
    if (b.t === 'comment') return `<p class="small">${esc(b.text)}</p>`;
    if (b.t === 'table') return `<table><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' style="white-space:normal;text-align:left"' : ''}>${badge(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return `<p class="small">${esc(b.text)}</p>`;
  }).join('');
}
