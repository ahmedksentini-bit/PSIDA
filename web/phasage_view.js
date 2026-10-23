/**
 * Onglet « Phasage » : tablier à poutres préfabriquées précontraintes rendues continues (src/phasage/exemples.js),
 * calcul par phases avec fluage, retrait et relaxation (src/phasage/phasage.js). Blocs de note (format commun à
 * blocksToHTML et aux notes HTML/Word), figures en SVG autonomes.
 */
import { calculPhasage, resultante } from '../src/phasage/phasage.js';
import { lirePhasage, poutresContinues, momentsRemarquables, diagramme, lireFleau, fleaux, momentsFleau, diagrammeFleau, contreflechesFleau, flechesPoutres } from '../src/phasage/exemples.js';
import { betonEC2 } from '../src/phasage/fluage.js';
import { contraintesPhases, contraintesBarre } from '../src/phasage/contraintes.js';

const F = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-0(,0+)?$/, '0$1') : '—');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COUL = ['#0b5fa5', '#c8552b', '#2a8f6a', '#8a4fb8', '#b8860b', '#6b6b6b'];

/** Courbes en SVG : series = [{ nom, pts: [[x, y]…], coul?, tirets? }], abscisses logarithmiques en option. */
export function courbesSVG(series, { titre = '', xlab = '', ylab = '', xlog = false, w = 720, h = 300, marques = [], zero = true } = {}) {
  const X = v => (xlog ? Math.log10(Math.max(v, 1e-6)) : v), all = series.flatMap(s => s.pts);
  let x0 = Math.min(...all.map(p => X(p[0]))), x1 = Math.max(...all.map(p => X(p[0])));
  let y0 = Math.min(...(zero ? [0] : []), ...all.map(p => p[1])), y1 = Math.max(...(zero ? [0] : []), ...all.map(p => p[1]));
  if (x1 - x0 < 1e-9) x1 = x0 + 1; const dy = (y1 - y0) || 1; y0 -= 0.06 * dy; y1 += 0.06 * dy;
  const ml = 64, mr = 14, mt = 28, mb = 60, W = w - ml - mr, H = h - mt - mb;
  const sx = v => ml + (X(v) - x0) / (x1 - x0) * W, sy = v => mt + (y1 - v) / (y1 - y0) * H;
  const pas = r => { const e = 10 ** Math.floor(Math.log10(r / 5)); return [1, 2, 2.5, 5, 10].map(m => m * e).find(s => r / s <= 6); };
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,sans-serif" font-size="11">`, `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>`];
  if (titre) out.push(`<text x="${ml}" y="16" font-size="12.5" font-weight="600">${esc(titre)}</text>`);
  const sY = pas(y1 - y0);
  for (let v = Math.ceil(y0 / sY) * sY; v <= y1 + 1e-9; v += sY) out.push(`<line x1="${ml}" x2="${ml + W}" y1="${sy(v)}" y2="${sy(v)}" stroke="${Math.abs(v) < 1e-9 ? '#333' : '#e1e5ec'}"/>`, `<text x="${ml - 6}" y="${sy(v) + 4}" text-anchor="end">${F(v)}</text>`);
  if (xlog) for (let e = Math.floor(x0); e <= Math.ceil(x1); e++) { if (e < x0 - 1e-9 || e > x1 + 1e-9) continue; const xv = 10 ** e; out.push(`<line x1="${sx(xv)}" x2="${sx(xv)}" y1="${mt}" y2="${mt + H}" stroke="#e1e5ec"/>`, `<text x="${sx(xv)}" y="${mt + H + 14}" text-anchor="middle">${F(xv)}</text>`); }
  else { const sX = pas(x1 - x0); for (let v = Math.ceil(x0 / sX) * sX; v <= x1 + 1e-9; v += sX) out.push(`<line x1="${sx(v)}" x2="${sx(v)}" y1="${mt}" y2="${mt + H}" stroke="#e1e5ec"/>`, `<text x="${sx(v)}" y="${mt + H + 14}" text-anchor="middle">${F(v)}</text>`); }
  for (const m of marques) out.push(`<line x1="${sx(m.x)}" x2="${sx(m.x)}" y1="${mt}" y2="${mt + H}" stroke="#999" stroke-dasharray="3 3"/>`, `<text x="${sx(m.x) + 3}" y="${mt + 10}" fill="#666" font-size="10">${esc(m.nom)}</text>`);
  out.push(`<rect x="${ml}" y="${mt}" width="${W}" height="${H}" fill="none" stroke="#999"/>`);
  series.forEach((s, i) => out.push(`<polyline fill="none" stroke="${s.coul || COUL[i % COUL.length]}" stroke-width="1.8" ${s.tirets ? 'stroke-dasharray="6 4"' : ''} points="${s.pts.map(p => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')}"/>`));
  out.push(`<text x="${ml + W / 2}" y="${h - 30}" text-anchor="middle">${esc(xlab)}</text>`, `<text transform="translate(14 ${mt + H / 2}) rotate(-90)" text-anchor="middle">${esc(ylab)}</text>`);
  let lx = ml; series.forEach((s, i) => { out.push(`<line x1="${lx}" x2="${lx + 22}" y1="${h - 10}" y2="${h - 10}" stroke="${s.coul || COUL[i % COUL.length]}" stroke-width="2" ${s.tirets ? 'stroke-dasharray="6 4"' : ''}/>`, `<text x="${lx + 26}" y="${h - 6}">${esc(s.nom)}</text>`); lx += 34 + 6.2 * s.nom.length; });
  out.push('</svg>');
  return out.join('');
}

/** Élévation schématique : travées, appuis, poutre et hourdis, câble. */
function elevationSVG(p) {
  const w = 720, h = 150, ml = 20, Lt = p.n * p.L, k = (w - 2 * ml) / Lt, sx = x => ml + x * k, yb = 70, hp = 34, hh = 10, s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,sans-serif" font-size="11"><rect width="${w}" height="${h}" fill="#fff"/>`);
  for (let i = 0; i < p.n; i++) {
    const a = sx(i * p.L) + 2, b = sx((i + 1) * p.L) - 2;
    s.push(`<rect x="${a}" y="${yb}" width="${b - a}" height="${hp}" fill="#dfe7f1" stroke="#456"/>`);
    // câble parabolique
    const pts = []; for (let q = 0; q <= 20; q++) { const xi = q / 20, e = p.cable.eAbout + (p.cable.eMi - p.cable.eAbout) * 4 * xi * (1 - xi); pts.push(`${(a + (b - a) * xi).toFixed(1)},${(yb + hp / 2 - e / 0.9 * hp).toFixed(1)}`); }
    s.push(`<polyline fill="none" stroke="#c8552b" stroke-width="1.5" points="${pts.join(' ')}"/>`);
    s.push(`<text x="${(a + b) / 2}" y="${yb + hp + 30}" text-anchor="middle">T${i + 1} — ${F(p.L, 2)} m</text>`);
  }
  s.push(`<rect x="${sx(0)}" y="${yb - hh}" width="${sx(Lt) - sx(0)}" height="${hh}" fill="#c9d6c4" stroke="#456"/>`);
  for (let i = 0; i <= p.n; i++) { const x = sx(i * p.L); s.push(`<path d="M${x} ${yb + hp} l-7 12 h14 z" fill="#fff" stroke="#333"/>`); }
  s.push(`<text x="${sx(0)}" y="${yb - hh - 6}">hourdis coulé à ${F(p.dates.hourdis)} j, clavage sur appuis à ${F(p.dates.continuite)} j</text>`);
  s.push(`<text x="${sx(Lt)}" y="${yb - hh - 6}" text-anchor="end" fill="#c8552b">câble par travée : P = ${F(p.cable.P)} kN, e = ${F(p.cable.eMi, 2)} m à mi-travée</text></svg>`);
  return s.join('');
}

/** Calcul complet : modèle, résultats, blocs de note. */
export function computePhasage(d) {
  if (d.ph_type === 'mixte') return computeMixte(d);
  let out;
  if (d.ph_type === 'fleau') { const p = lireFleau(d), { modele, reperes } = fleaux(p); out = { type: 'fleau', p, modele, reperes, r: calculPhasage(modele) }; }
  else { const p = lirePhasage(d), { modele, reperes } = poutresContinues(p), r = calculPhasage(modele); out = { type: 'poutres', p, modele, reperes, r }; }
  // ouvrage terminé : trafic, gradient thermique, ELS / ELU, réactions (sections définies par leurs dimensions)
  if (out.reperes.fibres && (out.type === 'fleau' || out.p.n > 1 || true)) {
    const v = (k, def) => (String(d[k] ?? '').trim() === '' || !Number.isFinite(+d[k]) ? def : +d[k]);
    const fl = out.type === 'fleau', Lr = fl ? v('fl_Lr', (out.p.caisson ? out.p.caisson.B : 12) - 2) : v('ph_Lr', 8), tr = fl ? v('fl_trott', 0) : v('ph_trott', 1);
    try {
      out.acheve = structureAchevee(out, { nPoutres: v('ph_nP', 4), chaussee: { y1: -Lr / 2, y2: Lr / 2 }, trottoirs: tr > 0 ? [{ y1: -Lr / 2 - tr, y2: -Lr / 2 }, { y1: Lr / 2, y2: Lr / 2 + tr }] : [],
        alpha: EC_ALPHA[d.alpha || 'recommended'] || EC_ALPHA.recommended, alphaKey: d.alpha || 'recommended', expo: (fl ? d.fl_expo : d.ph_expo) || 'XC' });
    } catch (e) { out.acheveErreur = e.message; }
    if (fl) {
      // caisson : flexion transversale (cadre par mètre) et fléaux en construction (déséquilibre, clouage provisoire)
      try { if (out.p.caisson) out.transversal = flexionTransversale({ K: { ...out.p.caisson, ti: out.p.caisson.tic }, h: out.p.hc, Lr, gBord: v('fl_gbord', 8), tRev: v('fl_trev', 0.08), tEnc: v('fl_tenc', 0.45), tGou: v('fl_tgou', 0.40), fck: out.p.fck, alpha: EC_ALPHA[d.alpha || 'recommended'] || EC_ALPHA.recommended }); } catch (e) { out.transversalErreur = e.message; }
      try { out.desequilibre = desequilibreFleau(out, { dc: v('fl_dcal', 3.0) }); } catch (e) { out.desequilibreErreur = e.message; }
    }
  }
  return out;
}

/** Bloc « contraintes » commun : vérifications enveloppes et tableau aux sections remarquables. */
function blocsContraintes(B, out, tService, sections, instants) {
  const { modele, reperes: R, r } = out, F2 = v => F(v, 2);
  B.push({ t: 'h2', text: 'Contraintes normales du béton (actions permanentes et précontrainte)' });
  if (!R.fibres) { B.push({ t: 'p', text: 'Contraintes non calculées : les sections sont saisies par leurs valeurs (A, I, e) ; choisir « par leurs dimensions » pour obtenir les fibres extrêmes.' }); return; }
  const C = contraintesPhases(r, modele, R.fibres, tService);
  B.push({ t: 'table', head: ['Partie', 'Critère', 'σ [MPa]', 'Limite [MPa]', 'Taux', 'Lieu', 'Instant [j] (âge)', 'Verdict'],
    rows: C.verifs.map(v => [v.partie, v.critere, F2(v.valeur), F2(v.limite), v.taux == null ? '—' : F2(v.taux), `${modele.barres[v.ou.barre].nom}, fibre ${v.ou.fibre}, ${v.ou.xi === 0 ? 'origine' : v.ou.xi === 1 ? 'extrémité' : 'milieu'} de barre`, `${F(v.ou.t)} (${F(v.ou.age)} j)`, v.ok ? 'OK' : 'NON']) });
  B.push({ t: 'p', text: 'Enveloppe sur tous les pas de calcul et toutes les barres (origine, milieu, extrémité), traction positive. Limites : compression 0,6 f_ck(t) en construction (EN 1992-1-1 § 5.10.2.2 (5), EN 1992-2 § 113.3.2) et 0,45 f_ck en service sous charges permanentes (§ 7.2 (3)) ; traction comparée à f_ctm(t) ; décompression des parties précontraintes en service (EN 1992-2, tableau 7.101N, XC2 à XC4, combinaison quasi permanente). Trafic et gradient thermique non inclus : ils s\'ajoutent sur l\'ouvrage terminé.' });
  const rows = [];
  for (const [nomI, k] of instants) for (const [nomS, ks, xi] of sections) {
    const cs = ks.map(kb => contraintesBarre(r.pas[k], modele, R.fibres, kb, xi));
    if (cs.every(c => !c)) continue;
    rows.push([nomI, nomS, ...cs.flatMap(c => (c ? [F2(c.sup), F2(c.inf)] : ['—', '—']))]);
  }
  const parties = sections[0][1].map(kb => R.fibres[kb].partie);
  B.push({ t: 'table', head: ['Instant', 'Section', ...parties.flatMap(pt => [`σ sup ${pt} [MPa]`, `σ inf ${pt} [MPa]`])], rows });
}

/** Pertes instantanées d'un câble : diagramme avant et après recul d'ancrage. */
function blocsPertesInst(B, pi, nom, c) {
  if (!pi) return;
  B.push({ t: 'svg', svg: courbesSVG([{ nom: 'après frottement', pts: pi.x.map((x, i) => [x, pi.avant[i]]), tirets: true }, { nom: 'après recul d’ancrage', pts: pi.x.map((x, i) => [x, pi.apres[i]]), coul: '#c8552b' }],
    { titre: `Pertes instantanées — ${nom} [kN]`, xlab: 'abscisse le long du câble [m]', ylab: 'P [kN]', h: 260, zero: false }),
    caption: `Frottement P₀ e^{−μ(θ + kx)} (μ = ${F(c.mu, 2)}, k = ${F(c.k, 3)} rad/m) et recul d'ancrage g = ${F(c.g * 1000, 1)} mm (NF EN 1992-1-1 § 5.10.5.2 et 5.10.5.3) ; longueur d'influence λ = ${F(Math.max(...pi.lambda), 1)} m${pi.lambda[1] ? ' de chaque côté' : ''}.` });
}

export function phasageBlocks(out) {
  if (out.type === 'mixte') return mixteBlocks(out);
  if (out.type === 'fleau') return fleauBlocks(out);
  const { p, modele, reperes: R, r } = out, B = [];
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  const bP = betonEC2(modele.betons.P), bH = betonEC2(modele.betons.H);
  h2('Ouvrage et phases de construction');
  B.push({ t: 'svg', svg: elevationSVG(p), caption: 'Élévation schématique : poutres préfabriquées posées isostatiques, hourdis, clavage sur appuis ; câble parabolique de chaque travée (échelle verticale dilatée).' });
  table(['Donnée', 'Poutre', 'Hourdis'], [
    ['Aire A [m²] ; inertie propre I [m⁴]', `${F(p.poutre.A, 3)} ; ${F(p.poutre.I, 4)}`, `${F(p.hourdis.A, 3)} ; ${F(p.hourdis.I, 5)}`],
    ['Centre de gravité / c.d.g. de la poutre [m]', '0', F(p.hourdis.e, 3)],
    ['Béton f_ck [MPa] ; ciment ; h₀ [mm] ; HR [%]', `${p.poutre.fck} ; ${p.poutre.ciment} ; ${p.poutre.h0} ; ${p.poutre.RH}`, `${p.hourdis.fck} ; ${p.hourdis.ciment} ; ${p.hourdis.h0} ; ${p.hourdis.RH}`],
    ['E_cm [MPa] ; φ(∞, t₀) au chargement', `${F(bP.Ecm)} ; ${F(bP.phi(p.dates.fin, p.dates.tension), 2)} (t₀ = ${F(p.dates.tension)} j)`, `${F(bH.Ecm)} ; ${F(bH.phi(p.dates.fin - p.dates.hourdis, 3), 2)} (t₀ = 3 j)`],
    ['Retrait final ε_cs(∞) [µm/m]', F(bP.retrait(p.dates.fin) * 1e6), F(bH.retrait(p.dates.fin - p.dates.hourdis) * 1e6)],
  ]);
  table(['Phase', 'Date [j]', 'Opération'], modele.phases.map((ph, i) => [String(i + 1), F(ph.t), ph.nom]).concat([[String(modele.phases.length + 1), F(p.dates.fin), 'Fin de la durée de calcul']]));
  para(`${p.n} travée(s) de ${F(p.L, 2)} m, ${p.nb} barres par travée pour la poutre et autant pour le hourdis (sections composées par barres décalées). Poids volumique ${F(p.gBeton)} kN/m³ ; superstructures ${F(p.gSup, 1)} kN/m. Câble : A_p = ${F(p.cable.Ap * 1e4, 1)} cm², P = ${F(p.cable.P)} kN après pertes instantanées, relaxation classe ${p.cable.classe} (ρ₁₀₀₀ = ${F(p.cable.rho1000, 1)} %).`);

  // moments aux points remarquables
  h2('Moments de la section composée (béton, précontrainte comprise)');
  const debutPh = i => r.pas.findIndex(q => q.phase === i), cles = [];
  // instant de chaque phase (après le chargement instantané), puis fin de phase (juste avant la suivante, fluage compris)
  modele.phases.forEach((ph, i) => {
    cles.push({ nom: `${i + 1}. ${ph.nom} — à ${F(ph.t)} j`, k: debutPh(i) });
    const kf = r.finPhase[i], tf = r.pas[kf] ? r.pas[kf].t : ph.t;
    if (kf >= 0 && tf > ph.t + 1e-9) cles.push({ nom: `   fin de phase — à ${F(tf)} j`, k: kf });
  });
  const lignes = cles.filter(c => c.k >= 0).map(c => { const m = momentsRemarquables(r.pas[c.k], R, resultante); return [c.nom, ...m.appuis.map(v => F(v)), ...m.travees.map(v => F(v))]; });
  table(['Instant', ...Array.from({ length: p.n - 1 }, (_, i) => `M appui ${i + 1} [kN·m]`), ...Array.from({ length: p.n }, (_, i) => `M mi-travée ${i + 1} [kN·m]`)], lignes);
  para('Moments rapportés au centre de gravité de la poutre (ligne des nœuds), positifs quand ils tendent la fibre inférieure ; ils incluent l\'effet de la précontrainte sur le béton (moment isostatique P·e et moment hyperstatique). Le moment sur appui naît au clavage : il ne résulte, avant les superstructures, que de l\'adaptation par fluage et du retrait différentiel du hourdis.');

  table(['Instant', ...Array.from({ length: p.n }, (_, i) => `flèche mi-travée ${i + 1} [mm]`)], cles.filter(c => c.k >= 0).map(c => [c.nom, ...flechesPoutres(r.pas[c.k], R).map(v => F(v * 1000, 1))]));
  para('Flèches à mi-travée, vers le bas positives, comptées depuis la pose (poutre précontrainte : la valeur initiale négative est la contre-flèche de précontrainte). La flèche finale indique la contre-flèche de fabrication à donner aux poutres pour obtenir le profil voulu en service.');
  {
    const kSup = debutPh(modele.phases.length - 1), mid = R.nb / 2 - 1, e1 = R.nb - 1;
    const inst = [[`mise en tension (${F(p.dates.tension)} j)`, debutPh(0)], [`avant clavage (${F(p.dates.continuite)} j)`, r.finPhase[Math.max(0, modele.phases.findIndex(ph => ph.liaisons) - 1)]], [`après superstructures (${F(p.dates.superstructures)} j)`, kSup], [`fin (${F(p.dates.fin)} j)`, r.pas.length - 1]];
    const secs = [['mi-travée 1', [R.iP[mid], R.iH[mid]], 1], ...(p.n > 1 ? [['appui 1 (travée 1)', [R.iP[e1], R.iH[e1]], 1]] : [])];
    blocsContraintes(B, out, p.dates.superstructures, secs, inst);
  }
  // évolution dans le temps
  const kC = debutPh(modele.phases.findIndex(ph => ph.liaisons));
  const serie = (f, k0 = 0) => r.pas.slice(k0).map(q => [q.t, f(momentsRemarquables(q, R, resultante))]);
  const series = [{ nom: 'M mi-travée 1', pts: serie(m => m.travees[0]) }];
  if (p.n > 1) series.push({ nom: 'M appui 1', pts: serie(m => m.appuis[0], Math.max(kC, 0)) });
  if (p.n > 2) series.push({ nom: 'M mi-travée 2', pts: serie(m => m.travees[1]) });
  B.push({ t: 'svg', svg: courbesSVG(series, { titre: 'Évolution des moments dans le temps [kN·m]', xlab: 'temps depuis le coulage des poutres [jours] (échelle logarithmique)', ylab: 'M [kN·m]', xlog: true, marques: modele.phases.filter((ph, i, a) => i === 0 || ph.t !== a[i - 1].t).map(ph => ({ x: ph.t, nom: `${F(ph.t)} j` })) }), caption: 'Les sauts correspondent aux chargements instantanés (coulage du hourdis, superstructures) ; entre deux phases, la variation est due au fluage, au retrait et à la relaxation.' });

  // diagrammes
  const kFinC = r.pas.findIndex(q => q.phase === modele.phases.length - 1);
  const diag = [{ nom: `fin de construction (${F(p.dates.superstructures)} j)`, pts: diagramme(r.pas[kFinC], R, resultante) }, { nom: `t = ${F(p.dates.fin)} j`, pts: diagramme(r.final, R, resultante), coul: '#c8552b' }];
  B.push({ t: 'svg', svg: courbesSVG(diag, { titre: 'Moment de la section composée le long du tablier [kN·m]', xlab: 'abscisse [m]', ylab: 'M [kN·m]', marques: Array.from({ length: p.n + 1 }, (_, i) => ({ x: i * p.L, nom: '' })) }), caption: 'Redistribution entre la fin de la construction et la fin de la durée de calcul.' });

  // câbles
  h2('Précontrainte : forces et pertes différées');
  const mid = Math.floor(p.nb / 2), seg = s => s * p.nb + mid;
  const kT = debutPh(0), rows = [];
  for (let s = 0; s < p.n; s++) {
    const N0 = r.pas[kT].cables[seg(s)].N, Nc = kC >= 0 ? r.pas[kC].cables[seg(s)].N : NaN, Nf = r.final.cables[seg(s)].N;
    rows.push([`Câble T${s + 1} (mi-travée)`, F(N0), F(Nc), F(Nf), F((1 - Nf / N0) * 100, 1), F((N0 - Nf) / p.cable.Ap / 1000)]);
  }
  table(['Câble', 'P après mise en tension [kN]', `P au clavage [kN]`, `P(∞) [kN]`, 'Pertes différées [%]', 'Δσ_p [MPa]'], rows);
  if (r.pertesInstantanees && r.pertesInstantanees[0]) blocsPertesInst(B, r.pertesInstantanees[0], 'câble T1', p.cable);
  para(`Pertes calculées pas à pas : raccourcissement du béton sous les charges successives, fluage et retrait (EN 1992-1-1 annexe B et § 3.1.4) et relaxation (§ 3.3.2), en interaction avec la structure. ${r.pertesInstantanees && r.pertesInstantanees[0] ? `Force au vérin P₀ = ${F(p.cable.P0)} kN, pertes instantanées calculées (frottement, recul d\'ancrage).` : 'La force après mise en tension est une donnée (pertes instantanées non calculées).'}`);

  B.push(...acheveBlocks(out));
  B.push(...constructionFleauBlocks(out));
  B.push(...transversalBlocks(out));
  h2('Méthode et limites');
  para('Méthode pas à pas (Bažant ; Ghali, Favre et Elbadry, Concrete Structures: Stresses and Deformations, ch. 5) sur une ossature plane : chaque incrément d\'effort est affecté de la fonction de fluage J(t, τ) de son béton et de son âge ; un changement de schéma (clavage, activation du hourdis) ne sollicite que par les incréments postérieurs. Moteur recoupé sur les solutions fermées de Dischinger, l\'équation intégrale de Volterra, le Bulletin technique Sétra n° 7 (1972, annexe I), le guide Sétra « Eurocode 2 — application aux ponts-routes en béton » (2008) et l\'éq. (5.46) de l\'EN 1992-1-1.');
  para('Limites : effort normal constant par barre (le maillage doit rester fin), sections non fissurées, armatures passives non prises en compte dans le fluage (coefficient k_s du guide Sétra non appliqué), une poutre et sa largeur de hourdis pour les actions permanentes ; trafic réparti par les coefficients de Guyon-Massonnet d\'une travée de même portée ; hourdis (flexion locale) : onglet Tablier à poutres ; gradient thermique linéaire seul (approche 1).');
  return B;
}

export function phasageNote(out, { version = '' } = {}) {
  return {
    title: out.type === 'mixte' ? 'Note de calcul — pont mixte acier-béton : phasage, effets différés et structure achevée' : out.type === 'fleau' ? 'Note de calcul — pont construit par encorbellements successifs : phasage, effets différés et ouvrage terminé' : 'Note de calcul — tablier à poutres précontraintes rendues continues : phasage, effets différés et ouvrage terminé',
    meta: `PSIDA ${version} — calcul par phases avec fluage, retrait et relaxation (NF EN 1992-1-1)`,
    blocks: [{ t: 'h1', text: '1. Calcul par phases' }, ...phasageBlocks(out), { t: 'h1', text: '2. Références' },
      { t: 'ref', text: 'NF EN 1992-1-1 : § 3.1.2, § 3.1.4, § 3.3.2, § 5.10.5, § 5.10.6 et annexe B ; NF EN 1992-2.' },
      { t: 'ref', text: 'Z. P. Bažant, Prediction of concrete creep effects using age-adjusted effective modulus method, ACI Journal 69 (1972) ; A. Ghali, R. Favre, M. Elbadry, Concrete Structures: Stresses and Deformations, 4ᵉ éd., CRC Press (2012).' },
      ...(out.type === 'mixte' ? [{ t: 'ref', text: 'NF EN 1994-2 : § 5.4, 6.2, 6.6, 6.8, 7.2, 7.4 ; NF EN 1993-2 : § 6.3.4.2, 9.5.2 et annexe D.2.4 ; NF EN 1993-1-5 : § 4.4, 5.2, 5.3, 7.1 ; NF EN 1993-1-1 : tableau 5.2, § 6.3.1 ; NF EN 1993-1-9 ; NF EN 1991-2 : § 4.2, 4.3, 4.6.4 ; NF EN 1991-1-5 : § 6.1.4.3.' }] : []),
      { t: 'ref', text: 'Sétra, Bulletin technique n° 7 : ponts en béton précontraint construits par encorbellements successifs (1972), annexe I § 2.2 ; Sétra, Guide méthodologique Eurocode 2 — application aux ponts-routes en béton (2008), ch. 4.' }],
  };
}

/* ---------------------------------------------------------------------------------------------- fléaux */
function elevationFleauSVG(p, R) {
  const w = 720, h = 170, ml = 20, Lt = 4 * p.a, k = (w - 2 * ml) / Lt, sx = x => ml + x * k, kz = 40 / p.hp, y0 = 60, s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,sans-serif" font-size="11"><rect width="${w}" height="${h}" fill="#fff"/>`);
  const bas = []; for (let q = 0; q <= 200; q++) { const x = Lt * q / 200, d = Math.min(Math.abs(x - p.a), Math.abs(x - 3 * p.a)), xi = Math.min(d / p.a, 1); bas.push(`${sx(x).toFixed(1)},${(y0 + R.h(xi) * kz).toFixed(1)}`); }
  s.push(`<polygon points="${sx(0)},${y0} ${sx(Lt)},${y0} ${bas.reverse().join(' ')}" fill="#dfe7f1" stroke="#456"/>`);
  // joints de voussoirs (fléau 1 et 2)
  for (const xp of [p.a, 3 * p.a]) for (const sg of [-1, 1]) for (let q = 0; q <= p.nv; q++) { const x = xp + sg * (p.l0 / 2 + q * R.lv), xi = Math.min(Math.abs(x - xp) / p.a, 1); s.push(`<line x1="${sx(x)}" x2="${sx(x)}" y1="${y0}" y2="${y0 + R.h(xi) * kz}" stroke="#89a" stroke-width="0.6"/>`); }
  for (const xp of [p.a, 3 * p.a]) { const yb = y0 + p.hp * kz; s.push(`<rect x="${sx(xp) - 6}" y="${yb}" width="12" height="${h - 40 - yb}" fill="#bbb" stroke="#555"/>`); }
  for (const x of [0, Lt]) s.push(`<path d="M${sx(x)} ${y0 + p.hc * kz} l-7 12 h14 z" fill="#fff" stroke="#333"/>`);
  s.push(`<text x="${sx(p.a / 2)}" y="${h - 22}" text-anchor="middle">rive ${F(p.a, 1)} m</text><text x="${sx(2 * p.a)}" y="${h - 22}" text-anchor="middle">travée centrale ${F(2 * p.a, 1)} m</text><text x="${sx(3.5 * p.a)}" y="${h - 22}" text-anchor="middle">rive ${F(p.a, 1)} m</text>`);
  s.push(`<text x="${sx(0)}" y="${y0 - 10}">2 fléaux de ${p.nv} paires de voussoirs de ${F(R.lv, 2)} m (cycle ${F(p.dates.cycle)} j) ; h = ${F(p.hp, 2)} m sur pile, ${F(p.hc, 2)} m à la clé</text></svg>`);
  return s.join('');
}

export function fleauBlocks(out) {
  const { p, modele, reperes: R, r } = out, B = [];
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  const bt = betonEC2(modele.betons.V0);
  h2('Ouvrage et phases de construction');
  B.push({ t: 'svg', svg: elevationFleauSVG(p, R), caption: 'Élévation : trois travées a – 2a – a, deux fléaux construits symétriquement par encorbellements successifs (échelle verticale dilatée).' });
  table(['Donnée', 'Valeur'], [
    ['Hauteur sur pile / à la clé [m]', `${F(p.hp, 2)} / ${F(p.hc, 2)} (variation parabolique)`],
    ['Aire sur pile / à la clé [m²] ; inertie à la clé [m⁴]', `${F(p.Ap, 2)} / ${F(p.Ac, 2)} ; ${F(p.Ic, 2)} ${p.caisson ? '(caisson défini par ses dimensions)' : '(I ∝ h^{5/2})'}`],
    ['Voussoir sur pile ; voussoirs courants', `${F(p.l0, 2)} m ; ${p.nv} × ${F(R.lv, 2)} m de part et d'autre`],
    ['Béton f_ck ; ciment ; h₀ ; HR', `${p.fck} MPa ; ${p.ciment} ; ${p.h0} mm ; ${p.RH} %`],
    ['E_cm [MPa] ; φ(∞, 3 j) ; ε_cs(∞)', `${F(bt.Ecm)} ; ${F(bt.phi(p.dates.fin, p.dates.durc), 2)} ; ${F(bt.retrait(p.dates.fin) * 1e6)} µm/m`],
    ['Équipage mobile ; superstructures', `${F(p.Qeq)} kN par bout de fléau ; ${F(p.gSup, 1)} kN/m`],
    ['Câbles de fléau (par paire de voussoirs)', `${p.cable.n} × (A_p = ${F(p.cable.Ap * 1e4, 1)} cm², P₀ = ${F(p.cable.P0)} kN au vérin), tendus des deux côtés, à ${F(p.cable.enrob, 2)} m sous l'extrados`],
    ['Câbles de continuité (travée centrale)', `${p.continuite.n} × (A_p = ${F(p.continuite.Ap * 1e4, 1)} cm², P₀ = ${F(p.continuite.P0)} kN) sur ${p.continuite.nv} voussoirs de part et d'autre de la clé`],
  ]);
  const dateClav = p.dates.clavage, tFinFleau = p.nv * p.dates.cycle + p.dates.durc;
  table(['Étape', 'Dates [j]'], [
    ['Voussoirs sur pile (coulés à 0 j), encastrement provisoire, câbles de fléau 0', F(p.dates.durc)],
    [`Bétonnage des voussoirs 1 à ${p.nv}, câbles de fléau 1 à ${p.nv} (cycle ${F(p.dates.cycle)} j, décoffrage et tension à ${F(p.dates.durc)} j)`, `${F(p.dates.cycle)} à ${F(tFinFleau)}`],
    ['Clavages central et sur culées, pose sur appareils d’appui', F(dateClav)],
    ['Câbles de continuité', F(p.dates.continuite)], ['Superstructures', F(p.dates.superstructures)], ['Fin du calcul', F(p.dates.fin)],
  ]);
  h2('Moments fléchissants (béton, précontrainte comprise)');
  const iCl = modele.phases.findIndex(ph => /Clavages/.test(ph.nom)), iCC = modele.phases.findIndex(ph => /continuité/.test(ph.nom)), iS = modele.phases.length - 1;
  const debut = i => r.pas.findIndex(q => q.phase === i);
  const lignes = [[`fin de construction des fléaux (${F(dateClav)} j)`, r.finPhase[iCl - 1]], [`après clavage, avant continuité (${F(p.dates.continuite)} j)`, r.finPhase[iCl]],
    ['après câbles de continuité', debut(iCC)], [`avant superstructures (${F(p.dates.superstructures)} j)`, r.finPhase[iCC]], ['après superstructures', debut(iS)], [`fin (${F(p.dates.fin)} j)`, r.pas.length - 1]];
  table(['Instant', 'M sur pile P1 [kN·m]', 'M à la clé [kN·m]', 'M mi-travée de rive [kN·m]'], lignes.filter(l => l[1] >= 0).map(([n, k]) => { const m = momentsFleau(r.pas[k], R); return [n, F(m.P1), m.cle == null ? '—' : F(m.cle), m.rive == null ? '—' : F(m.rive)]; }));
  const mA = momentsFleau(r.pas[debut(iS)], R), mF = momentsFleau(r.final, R);
  para(`Moments rapportés à la ligne des nœuds (c.d.g. de la section), positifs quand ils tendent la fibre inférieure, précontrainte comprise. Avant le clavage, la clé n'existe pas : la valeur indiquée est celle du bout de fléau (moment des derniers ancrages). Entre la pose des superstructures et la fin du calcul, l'adaptation par fluage fait passer le moment à la clé de ${F(mA.cle)} à ${F(mF.cle)} kN·m et sur pile de ${F(mA.P1)} à ${F(mF.P1)} kN·m : l'ouvrage se rapproche de la distribution qu'il aurait eue s'il avait été construit sur cintre (BT n° 7 § 2.155), d'où le renforcement des câbles de continuité.`);
  const kC = debut(iCl);
  const serie = (f, k0 = 0) => r.pas.slice(k0).map(q => [Math.max(q.t, 0.5), f(momentsFleau(q, R))]).filter(q => q[1] != null);
  B.push({ t: 'svg', svg: courbesSVG([{ nom: 'M sur pile P1', pts: serie(m => m.P1) }, { nom: 'M à la clé', pts: serie(m => m.cle, kC) }], { titre: 'Évolution des moments dans le temps [kN·m]', xlab: 'temps [jours] (échelle logarithmique)', ylab: 'M [kN·m]', xlog: true, marques: [{ x: dateClav, nom: 'clavage' }, { x: p.dates.superstructures, nom: 'superstr.' }] }), caption: 'Croissance du moment sur pile pendant la construction (voussoirs successifs, câbles de fléau), puis adaptation par fluage après le clavage.' });
  const diag = [{ nom: 'fin de construction des fléaux', pts: diagrammeFleau(r.pas[r.finPhase[iCl - 1]], R, modele) }, { nom: 'après superstructures', pts: diagrammeFleau(r.pas[debut(iS)], R, modele), coul: '#2a8f6a' }, { nom: `t = ${F(p.dates.fin)} j`, pts: diagrammeFleau(r.final, R, modele), coul: '#c8552b' }];
  B.push({ t: 'svg', svg: courbesSVG(diag, { titre: 'Moment le long de l’ouvrage [kN·m]', xlab: 'abscisse [m]', ylab: 'M [kN·m]', marques: [0, p.a, 2 * p.a, 3 * p.a, 4 * p.a].map(x => ({ x, nom: '' })) }), caption: 'Diagrammes en fin de construction des fléaux, après pose des superstructures et à la fin du calcul.' });
  blocsContraintes(B, out, p.dates.superstructures, [['sur pile P1 (côté travée centrale)', [R.F[0].bD[0]], 0], ['à la clé', [R.F[0].bD[R.nv]], 1], ['mi-travée de rive', [R.F[0].bG[Math.floor(R.nv / 2)]], 0]],
    [[`fin de construction des fléaux (${F(p.dates.clavage)} j)`, r.finPhase[iCl - 1]], ['après superstructures', debut(iS)], [`fin (${F(p.dates.fin)} j)`, r.pas.length - 1]]);
  h2('Précontrainte : pertes instantanées et différées');
  const rows = [];
  modele.cables.forEach((c, ic) => {
    if (ic % 2 === 1 && /fléau/.test(c.nom)) return;   // fléau 2 identique au fléau 1
    const seg = r.final.cables.findIndex(q => q && q.cable === ic && q.seg === Math.floor(c.segments.length / 2));
    const k0 = debut(c.phase), N0 = r.pas[k0].cables[seg].N, Nc = r.pas[r.finPhase[iCl - 1]].cables[seg]?.N, Nf = r.final.cables[seg].N;
    const nn = c.n || 1;
    rows.push([c.nom.replace('F1-', '') + (nn > 1 && /fléau/.test(c.nom) ? ` (${nn} câbles)` : ''), F(c.P0 / nn), F(N0 / nn), Nc == null ? '—' : F(Nc / nn), F(Nf / nn), F((1 - Nf / c.P0) * 100, 1)]);
  });
  table(['Câbles (milieu)', 'P₀ vérin par câble [kN]', 'après pertes instantanées [kN]', 'avant clavage [kN]', 'P(∞) [kN]', 'pertes totales [%]'], rows);
  const iLong = modele.cables.findIndex((c, i) => i === 2 * p.nv);
  blocsPertesInst(B, r.pertesInstantanees[iLong], modele.cables[iLong].nom, p.cable);
  h2('Contre-flèches de construction (fléau 1)');
  const cf = contreflechesFleau(r, modele, R), mm = v => F(v * 1000, 1);
  table(['Joint', 'x [m]', 'construction jusqu’au clavage [mm]', 'après clavage jusqu’à la fin [mm]', 'déplacement total [mm]', 'contre-flèche du coffrage [mm]'],
    cf.map(c => [`${c.cote === 'G' ? 'gauche' : 'droite'} ${c.k === 0 ? 'VSP' : c.k}`, F(c.x, 2), mm(c.construction), mm(c.apres), mm(c.total), mm(c.contrefleche)]));
  B.push({ t: 'svg', svg: courbesSVG([{ nom: 'contre-flèche totale', pts: cf.map(c => [c.x, c.contrefleche * 1000]) }, { nom: 'part de la construction', pts: cf.map(c => [c.x, -c.construction * 1000]), tirets: true }],
    { titre: 'Contre-flèches à donner aux coffrages des voussoirs [mm] (+ vers le haut)', xlab: 'abscisse [m]', ylab: 'mm', h: 260 }), caption: 'Fléau 1 ; le fléau 2 est symétrique.' });
  para('Chaque coffrage est réglé sur le bout du voussoir précédent juste avant le bétonnage ; le joint suit ce bout rigidement jusqu\'au décoffrage, puis la structure. La contre-flèche compense tout le déplacement vertical postérieur au réglage : poids des voussoirs suivants, câbles, clavages, superstructures, fluage et retrait jusqu\'à la fin du calcul. Non compris : la déformation propre de l\'équipage mobile (à ajouter d\'après sa raideur, fournie par l\'entreprise), les tassements d\'appuis et le gradient thermique.');
  B.push(...acheveBlocks(out));
  B.push(...constructionFleauBlocks(out));
  B.push(...transversalBlocks(out));
  h2('Méthode et limites');
  para('Calcul par phases pas à pas (même moteur que pour les poutres rendues continues) : chaque voussoir est une barre avec son béton et sa date de coulage ; le béton frais est porté par l\'équipage au bout du fléau (force et moment) jusqu\'au décoffrage ; les câbles de fléau sont tendus des deux côtés après chaque paire de voussoirs, avec frottement et recul d\'ancrage (§ 5.10.5) ; les clavages réunissent les fléaux sans contrainte. Hauteur et inertie variables par barre (I ∝ h^{5/2}, BT n° 7 § 2.222).');
  para('Limites : ligne moyenne supposée droite (la variation du c.d.g. avec la hauteur n\'est prise en compte que dans les excentrements) ; le calcul par phases suppose des fléaux construits symétriquement, les déséquilibres de construction étant traités à part (moments de déséquilibre ajoutés sur pile) ; flexion longitudinale sous trafic sur le caisson entier, torsion et distorsion traitées dans le cadre transversal (sans diaphragme intermédiaire, du côté de la sécurité) ; gradient thermique linéaire seul (approche 1).');
  return B;
}

/** Fléaux en construction : moments de déséquilibre sur pile, clouage provisoire, contraintes au VSP. */
export function constructionFleauBlocks(out) {
  const D = out.desequilibre, B = [];
  if (!D) { if (out.desequilibreErreur) B.push({ t: 'p', text: `Déséquilibre en construction : calcul impossible (${out.desequilibreErreur}).` }); return B; }
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  h2('Fléaux en construction : déséquilibres et clouage provisoire');
  table(['Stade', 't [j]', 'Demi-fléau : poids [kN] / longueur [m]', 'DIFF / CLL / WUP / LAG / AI [kN·m]', 'M_d [kN·m] (cas)', 'N [kN]', 'Traction par file [kN]', 'Barres Ø36 par file', 'Cales [kN]', 'σ VSP min / max [MPa]'],
    D.etapes.map(e => [e.k === 0 ? 'VSP' : `voussoir ${e.k}`, F(e.t, 0), `${F(e.W, 0)} / ${F(e.Lh, 1)}`, Object.values(e.M).map(x => F(x, 0)).join(' / '), `${F(e.Md, 0)} (${e.cas})`, F(e.Nv, 0), F(e.T, 0), String(e.nb), F(e.Rc, 0), e.sig ? `${F(e.sig.sMin, 1)} / ${F(e.sig.sMax, 2)}` : '—']));
  table(['Vérification', 'Valeur', 'Limite', 'Résultat', 'Référence'], D.verifs.map(q => [q.nom, F(q.val, 2), F(q.lim, 2), q.ok ? 'OK' : 'NON', q.ref]));
  para(`Cas de charge par stade (AASHTO, Guide Specifications for Segmental Concrete Bridges § 7.4) : DIFF = 2 % du poids d'un demi-fléau ; CLL = 0,48 kN/m² sur un demi-fléau et 0,24 kN/m² sur l'autre ; WUP = vent ascendant 0,24 kN/m² sur un demi-fléau ; LAG = décalage d'un demi-voussoir au bétonnage ; AI = chute d'un équipage (perte de Q_eq, effet dynamique 2). ELU C1 = 1,35 DIFF + 1,5 (CLL + WUP), C2 = 1,35 (DIFF + LAG) + 1,5 CLL ; accidentel CA = DIFF + CLL + AI. Clouage : deux files de cales à ${F(D.dc, 2)} m d'entraxe, traction T = M_d/d_c − 0,9 N/2 reprise par des barres Ø36 (F_d = ${F(BARRE_36.Fd, 0)} kN) ; contraintes au VSP : état du calcul par phases + DIFF + CLL + WUP (caractéristique).`);
  return B;
}

/** Caisson : flexion transversale (cadre) et distortion. */
export function transversalBlocks(out) {
  const T = out.transversal, B = [];
  if (!T) { if (out.transversalErreur) B.push({ t: 'p', text: `Flexion transversale : calcul impossible (${out.transversalErreur}).` }); return B; }
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  h2('Caisson : flexion transversale et distortion (cadre par mètre, section de la clé)');
  table(['Section', 'M_pp [kN·m/m]', 'M_superstr.', 'M_Q max / min', 'M_ELU max / min', 'Épaisseur de calcul [m]', 'A_s face tendue par M > 0 [cm²/m]', 'A_s face tendue par M < 0 [cm²/m]'],
    T.sections.map(s => [s.nom, F(s.Gpp, 1), F(s.Gsup, 1), `${F(s.Qmax, 1)} / ${F(s.Qmin, 1)}`, `${F(s.ELUmax, 1)} / ${F(s.ELUmin, 1)}`, F(s.tCalc, 2), `${F(s.AsTendu.pos * 1e4, 1)} (${s.faces[0]})`, `${F(s.AsTendu.neg * 1e4, 1)} (${s.faces[1]})`]));
  para(`Cadre fermé suivant les feuillets moyens, chaque cas équilibré par les flux de cisaillement de flexion (V/2 par âme) et de torsion de Bredt (q = T/2Ω) ; sans diaphragme intermédiaire, la distortion est entièrement reprise par la flexion du cadre (majorant). Charges : poids propre, bords ${F(T.gBord, 1)} kN/m, revêtement ${F(T.tRev * 100, 0)} cm ; LM1 sur ${F(T.Lr, 2)} m (${T.NL.n} voies), tandems répartis longitudinalement sur 1,20 + b₀ + 2d (b₀ = ${F(T.b0, 2)} m ; d : distance de la roue à la section) et, dans la travée du hourdis, selon les largeurs participantes du DAfStb Heft 240. Moments positifs : traction de la fibre inférieure des hourdis et de la face extérieure des âmes. Ferraillage : ELU, σ_s à l'ELS caractéristique, w_k ≤ 0,2 mm à l'ELS fréquent, minimums EC2. Diaphragmes à prévoir sur piles et culées (reprise de la torsion et de la distortion aux appuis).`);
  return B;
}

/** Ouvrage terminé (poutres rendues continues, fléaux) : trafic, thermique, vérifications, réactions. */
export function acheveBlocks(out) {
  const v = out.acheve, B = [];
  if (!v) { if (out.acheveErreur) B.push({ t: 'p', text: `Ouvrage terminé : calcul impossible (${out.acheveErreur}).` }); return B; }
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  const fl = v.type === 'fleau';
  h2('Ouvrage terminé : trafic et gradient thermique');
  table(['Donnée', 'Valeur'], [
    ['Charges de trafic', fl ? `tablier entier : tandems de ${F(v.QT, 0)} kN par essieu (toutes voies), UDL ${F(v.qT, 1)} kN/m` : `poutre la plus chargée (n° ${v.guyon.k + 1}, y = ${F(v.guyon.y, 2)} m) parmi ${v.nP} : coefficients de Guyon-Massonnet η_TS = ${F(v.eta.TS, 3)}, η_UDL = ${F(v.eta.UDL, 3)} (θ = ${F(v.guyon.theta, 3)}, α = ${F(v.guyon.alpha, 3)}) ; charges de la poutre : tandem ${F(v.Qb, 0)} kN par essieu, UDL ${F(v.qb, 1)} kN/m`],
    ['Gradient thermique (EN 1991-1-5 § 6.1.4.1, approche 1)', `ΔT_M = +${v.dTh[0]} K (dessus plus chaud) / −${v.dTh[1]} K ; courbure α ΔT_M / h, effets hyperstatiques sur la structure continue`],
    ['Combinaisons (EN 1990 A2)', 'caractéristique G + P + Q + 0,6 T ou G + P + T + ψ₀ Q ; fréquente G + P + ψ₁ Q + 0,5 T ou G + P + 0,6 T ; quasi permanente G + P + 0,5 T'],
  ]);
  const pas = Math.max(1, Math.round(v.sections.length / 14));
  table(['x [m]', 'M_charges t∞ [kN·m]', 'M hyperstatique P', 'M_Q max / min', 'M_T + / −', 'M_Ed+ / M_Rd+', 'M_Ed− / M_Rd−', 'A_s inf. / sup. [cm²]', 'V_Ed (− V_pd − Résal) [kN]', 'A_sw/s [cm²/m]'],
    v.sections.map((s, i) => ({ s, e: v.elu[i] })).filter((q, i) => i % pas === 0).map(({ s, e }) => [F(s.x, 1), F(s.MGch[1], 0), F(s.Mhyp[1], 0), `${F(s.eM.max, 0)} / ${F(s.eM.min, 0)}`, `${F(s.MT[0], 0)} / ${F(s.MT[1], 0)}`, `${F(e.MEdP, 0)} / ${F(e.MRdP, 0)}`, `${F(e.MEdN, 0)} / ${F(e.MRdN, 0)}`, `${F(e.AsInf * 1e4, 1)} / ${F(e.AsCont * 1e4, 1)}`, `${F(e.VEd0, 0)} (${F(e.VEd, 0)})`, F(e.V.AswS * 1e4, 1)]));
  para('ELU : M_Ed = 1,35 M_charges + M_hyperstatique de la précontrainte (γ_P = 1,0, EN 1992-1-1 § 2.4.2.2 ; obtenu par un second calcul par phases sans câbles) + 1,35 Q + 1,5 × 0,6 T. M_Rd : câbles seuls ; A_s : armatures passives de complément nécessaires (face inférieure en moment positif, face supérieure en moment négatif). Effort tranchant réduit de la composante verticale des câbles et, pour les caissons de hauteur variable, de l\'effet Résal de la membrure inférieure inclinée (§ 6.2.1 (1)).');
  h2('Vérifications de l\'ouvrage terminé');
  table(['Vérification', 'Valeur', 'Limite', 'x [m]', 'Résultat', 'Référence'], v.verifs.map(q => [q.nom, F(q.val, 2), F(q.lim, 2), F(q.x, 1), q.ok ? 'OK' : 'NON', q.ref]));
  h2('Réactions d\'appui (tablier entier)');
  table(['Ligne', 'G [kN]', 'TS [kN]', 'UDL [kN]', 'Trottoirs [kN]'], v.reactions.map((q, j) => [j === 0 || j === v.reactions.length - 1 ? `Culée C${j}` : `Pile P${j}`, F(q.G, 0), F(q.TS, 0), F(q.UDL, 0), F(q.trott, 0)]));
  para(`Permanentes : calcul par phases à t∞${fl ? '' : ` × ${v.nP} poutres`} ; trafic : voies chargées à plein sur les lignes d'influence des réactions. Le bouton « Transmettre les réactions aux appuis » les envoie à l'onglet Appuis et fondations.`);
  return B;
}

/* ---------------------------------------------------------------------------------------- pont mixte */
/** Structure achevée du pont mixte : trafic, combinaisons, résistances, stabilité, connexion, fatigue, appuis. */
export function mixteVerifsBlocks(out) {
  const { p, v } = out, B = [];
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  h2('Structure achevée : actions variables');
  const CH = v.CH;
  table(['Donnée', 'Valeur'], [
    ['Répartition transversale', `${p.nPoutres === 2 ? 'règle du levier (bipoutre)' : 'Courbon (entretoisement rigide)'} ; poutre de rive à y = ${F(v.ys[v.kP], 2)} m`],
    ['Voies (EN 1991-2 § 4.2)', `${CH.nl} voie(s) de ${F(CH.wl, 2)} m ; coefficients de la poutre : ${CH.voies.map((q, i) => `voie ${i + 1} ${F(q.eta, 3)}`).join(', ')}`],
    ['Charges équivalentes sur la poutre', `tandem : 2 essieux de ${F(CH.Q, 0)} kN ; UDL ${F(CH.q, 1)} kN/m ; trottoirs ${F(CH.qTrott, 1)} kN/m`],
    ['Écart thermique dalle – acier', `±${F(v.dT, 0)} K (EN 1991-1-5 § 6.1.4.3), effets primaires et hyperstatiques`],
    ['Modèle de calcul', 'poutre continue : section mixte n₀ en travée, fissurée (acier + armatures) sur 15 % de part et d\'autre des appuis ; lignes d\'influence'],
  ]);
  const pas = Math.max(1, Math.round(v.sections.length / 16));
  const lignes = v.sections.filter((q, i) => i % pas === 0 || q.zoneAppui !== v.sections[Math.max(0, i - 1)].zoneAppui || Math.abs(q.MGF) === Math.max(...v.sections.map(z => Math.abs(z.MGF))));
  table(['x [m]', 'M_G t∞ [kN·m]', 'M_Q max / min', 'M_T ±', 'M_Ed ELU', 'Classe', 'M_pl,Rd', 'σ_ELU acier [MPa]', 'σ_ELS acier', 'V_Ed [kN]', 'V_b,Rd'],
    lignes.map(q => [F(q.x, 1), F(q.MGF, 0), `${F(q.MQmax, 0)} / ${F(q.MQmin, 0)}`, F(Math.abs(q.MT[0]), 0), F(q.MEd, 0), String(q.classe) + (q.eff && q.eff.classe4 ? ` (ρ ${F(q.eff.rho, 2)})` : ''), F(q.signe * q.Mpl, 0), F(q.sEluMax, 0), F(q.sElsMax, 0), F(q.VEd, 0), F(q.Vr.Vb, 0)]));
  para('ELU : 1,35 G + 1,35 (LM1 + trottoirs) + 1,5 × 0,6 T ; ELS caractéristique : G + Q + 0,6 T (EN 1990 A2). Permanentes : calcul par phases à la mise en service et à t∞ (l\'enveloppe des deux est retenue), effets hyperstatiques du retrait compris. Classes 1 et 2 : M_Ed ≤ M_pl,Rd ; classes 3 et 4 : contraintes cumulées par phase, âme efficace en classe 4 (EN 1993-1-5 § 4.4).');
  h2('Vérifications');
  table(['Vérification', 'Valeur', 'Limite', 'x [m]', 'Résultat', 'Référence'], v.verifs.map(q => [q.nom, F(q.val, 2), F(q.lim, 2), F(q.x, 1), q.ok ? 'OK' : 'NON', q.ref]));
  const dv = v.sections.filter(q => q.deversement).reduce((a, b) => (!a || b.deversement.sigma / b.deversement.lim > a.deversement.sigma / a.deversement.lim ? b : a), null);
  if (dv) para(`Déversement : berceaux de raideur C_d = ${F(dv.deversement.Cd, 0)} kN/m tous les ${F(v.ac, 1)} m (montants I_v = ${F(v.Iv * 1e8, 0)} cm⁴, entretoises I_q = ${F(v.Iq * 1e8, 0)} cm⁴, EN 1993-2 annexe D.2.4), N_crit = ${F(dv.deversement.Ncr, 0)} kN, λ̄ = ${F(dv.deversement.lam, 2)}, χ = ${F(dv.deversement.chi, 2)} ; compression supposée uniforme (du côté de la sécurité).`);
  if (v.betonnage) {
    const b = v.betonnage;
    h2('Charpente pendant le bétonnage');
    table(['Phase', 't [j]', 'σ_Ed min [MPa]', 'σ_Ed max [MPa]', 'Déversement d\'ensemble : Σ M_u / 0,7 M_gs (travées non durcies)'], b.etapes.map(e => [e.nom, F(e.t, 0), F(e.sMin, 0), F(e.sMax, 0), e.globale.length ? e.globale.map(g => `T${g.s + 1} : ${F(g.Mu, 0)} / ${F(0.7 * g.Mgs, 0)}`).join(' ; ') : '—']));
    para(`ELU de construction 1,35 G + 1,5 q_c, q_c = ${F(b.qc, 2)} kN/m² sur le plot coulé (charges de chantier, EN 1991-1-6 § 4.11.2). Déversement de la semelle comprimée là où la dalle n'a pas durci : même modèle de cadres que l'ouvrage en service (EN 1993-2 § 6.3.4.2). Déversement d'ensemble du couple de poutres entretoisées avant durcissement de la dalle : M_gs = π² s E √(I_eff I_x) / L² (Yura et al., ASCE J. Struct. Eng. 2008), critère d'alerte Σ M_u ≤ 0,7 M_gs (AASHTO LRFD § 6.10.3.4.2) ; au-delà, prévoir un contreventement horizontal provisoire ou un ordre de bétonnage différent.`);
  }
  h2('Connexion (goujons)');
  const g = v.goujons, cx = v.connexion.filter((q, i) => i % pas === 0);
  table(['x [m]', 'v_L,Ed ELU [kN/m]', 'v_L ELS car.', 's ELU [m]', 's ELS [m]', 's fatigue [m]', 'Espacement retenu [m]'], cx.map(q => [F(q.x, 1), F(q.vElu, 0), F(q.vEls, 0), F(Math.min(q.sELU, 9.99), 2), F(Math.min(q.sELS, 9.99), 2), F(Math.min(q.sFat, 9.99), 2), F(q.s, 2)]));
  para(`Goujons Ø${F(g.d * 1000, 0)} × ${F(g.h * 1000, 0)} mm (f_u = ${g.fu} MPa), ${g.n} par rangée : P_Rd = ${F(v.PRd, 1)} kN (EN 1994-2 § 6.6.3.1) ; flux élastique sur section non fissurée (§ 6.6.2.1) sous l\'effort tranchant appliqué après la connexion (superstructures, trafic) ; ELS : 0,75 P_Rd (§ 6.8.1 (3)) ; fatigue : Δτ_E2 = 1,55 λ_v,2 Δτ ≤ 90 MPa ; espacement ≤ min(4 h_c ; 0,80 m) (§ 6.6.5.5). Effort concentré d\'about dû au retrait (§ 6.6.2.4) à reprendre par une densification locale.`);
  h2('Réactions d\'appui (tablier complet)');
  table(['Ligne', 'Permanentes G [kN]', 'TS [kN]', 'UDL [kN]', 'Trottoirs [kN]', 'Ligne d\'influence : ∑ η tandem', 'aire positive [m]'], v.reactions.map((q, j) => [j === 0 || j === v.reactions.length - 1 ? `Culée C${j}` : `Pile P${j}`, F(q.G, 0), F(q.TS, 0), F(q.UDL, 0), F(q.trott, 0), F(q.infTS, 2), F(q.infUDL, 1)]));
  para('Réactions G : calcul par phases à t∞ × nombre de poutres. Trafic (tablier entier, voies chargées à plein) : TS = Σ Q_i × ∑η du tandem, UDL = Σ q_i w_i × aire positive de la ligne d\'influence de la réaction. Le bouton « Transmettre les réactions aux appuis » les envoie à l\'onglet Appuis et fondations (mode appuis seuls).');
  return B;
}

import { bipoutre, lireBipoutre, sectionsRemarquables, contraintesMixtes, flechesBipoutre } from '../src/mixte/bipoutre.js';
import { proprietes, equivalence, momentPlastique, classeSection } from '../src/mixte/section.js';
import { verifierMixte } from '../src/mixte/verifs.js';
import { structureAchevee } from '../src/phasage/acheve.js';
import { verifierBetonnage } from '../src/mixte/betonnage.js';
import { flexionTransversale } from '../src/phasage/caisson_transversal.js';
import { desequilibreFleau, BARRE_36 } from '../src/phasage/desequilibre.js';
import { EC_ALPHA } from '../src/loads_ec.js';

/** Options des vérifications de la structure achevée (champs mx_* du formulaire). */
export function optionsMixte(d, p) {
  const v = (k, def) => (String(d[k] ?? '').trim() === '' || !Number.isFinite(+d[k]) ? def : +d[k]);
  const Lr = v('mx_Lr', p.largeur - 2), tr = v('mx_trott', 0);
  return { chaussee: { y1: -Lr / 2, y2: Lr / 2 }, trottoirs: tr > 0 ? [{ y1: -Lr / 2 - tr, y2: -Lr / 2 }, { y1: Lr / 2, y2: Lr / 2 + tr }] : [],
    alpha: EC_ALPHA[d.alpha || 'recommended'] || EC_ALPHA.recommended, dT: v('mx_dT', 10), ac: v('mx_ac', 6), a: v('mx_a', 6), Iv: v('mx_Iv', 40000) * 1e-8, Iq: v('mx_Iq', 180000) * 1e-8,
    goujons: { d: v('mx_gd', 22) / 1000, h: v('mx_gh', 200) / 1000, n: Math.max(1, Math.round(v('mx_gn', 3))), fu: 450 }, Nobs: v('mx_Nobs', 5e5), qc: v('mx_qc', 1.0) };
}
export function computeMixte(d) {
  const p = lireBipoutre(d), { modele, reperes } = bipoutre(p), out = { type: 'mixte', p, modele, reperes, r: calculPhasage(modele) };
  try {
    const o = optionsMixte(d, p);
    out.v = verifierMixte(out, o);
    // charpente pendant le bétonnage : vérifications ajoutées à la synthèse de la structure (même liste, même affinage)
    const b = verifierBetonnage(out, o);
    out.v.betonnage = b; out.v.verifs.push(...b.verifs); out.v.ok = out.v.ok && b.ok;
  } catch (e) { out.vErreur = e.message; }
  return out;
}

export function mixteBlocks(out) {
  const { p, modele, reperes: R, r } = out, B = [];
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), table = (head, rows) => B.push({ t: 'table', head, rows });
  const bc = betonEC2({ fck: p.fck, RH: p.RH, h0: p.h0, ciment: p.ciment }), phi = bc.phi(p.dates.fin, 1), n = equivalence(bc.Ecm, phi);
  h2(`Pont mixte ${p.nPoutres === 2 ? 'bipoutre' : `à ${p.nPoutres} poutres`} : données et sections`);
  table(['Donnée', 'Valeur'], [
    ['Travées', p.L.map(l => `${F(l, 1)} m`).join(' – ')],
    ['Tablier', `largeur ${F(p.largeur, 2)} m, ${p.nPoutres} poutres à ${F(p.entraxe, 2)} m, débords ${F(R.TR.debord, 2)} m ; dalle ${F(p.hc, 2)} m (gousset ${F(p.hg, 2)} m)`],
    ['Poutre étudiée (de rive)', `dalle reprise ${F(R.TR.part, 2)} m (poids) ; largeur efficace ${R.beffTravee.map(v => F(v, 2)).join(' / ')} m en travée, ${R.beffAppui.map(v => F(v, 2)).join(' / ') || '—'} m sur appuis`],
    ['Béton', `C${p.fck}, ciment ${p.ciment}, h₀ ${p.h0} mm, HR ${p.RH} % ; E_cm = ${F(bc.Ecm)} MPa ; φ(∞, 1 j) = ${F(phi, 2)}`],
    ['Coefficients d’équivalence (EN 1994-2 § 5.4.2.2)', `n₀ = ${F(n.n0, 2)} ; n_L = ${F(n.permanent, 1)} (permanentes), ${F(n.retrait, 1)} (retrait) — pour information : le calcul suit le fluage pas à pas`],
    ['Acier', `${p.nuance}, majoration ${F((p.majAcier - 1) * 100, 0)} % (raidisseurs, entretoises) ; armatures ρ = ${F(p.rhoTravee * 100, 2)} % en travée, ${F(p.rhoAppui * 100, 2)} % sur appuis`],
  ]);
  const ligneSec = (nom, g, beff, rho) => {
    const G = { ...g, beff, Asup: rho * beff * p.hc * 0.6, Ainf: rho * beff * p.hc * 0.4 }, a = proprietes(G, 'acier'), m0 = proprietes(G, 'mixte', n.n0), mL = proprietes(G, 'mixte', n.permanent), f = proprietes(G, 'fissuree');
    const cp = classeSection(G, 1, n.n0), cn = classeSection(G, -1, n.n0);
    return [nom, `${F(g.bfi, 2)}×${F(g.tfi * 1000, 0)} / ${F(g.hw, 2)}×${F(g.tw * 1000, 0)} / ${F(g.bfs, 2)}×${F(g.tfs * 1000, 0)}`, F(a.A, 4), F(a.I, 4), F(m0.I, 4), F(mL.I, 4), F(f.I, 4), `${cp.classe} / ${cn.classe}`, `${F(momentPlastique(G, 1).M / 1000, 1)} / ${F(momentPlastique(G, -1).M / 1000, 1)}`];
  };
  table(['Section', 'PRS (semelle inf / âme / semelle sup) [m × mm]', 'A acier [m²]', 'I acier [m⁴]', 'I mixte n₀', 'I mixte n_L', 'I fissurée', 'Classe M+ / M−', 'M_pl,Rd + / − [MN·m]'],
    [ligneSec('travée', R.gT, R.beffTravee[0], p.rhoTravee), ...(p.L.length > 1 ? [ligneSec('sur appui', R.gA, R.beffAppui[0], p.rhoAppui)] : [])]);
  para('Classes selon l’EN 1993-1-1 tableau 5.2 (semelle supérieure connectée : classe 1, EN 1994-1-1 § 5.5.2) ; M_pl,Rd selon l’EN 1994-2 § 6.2.1.2 (γ_M0 = 1,0, γ_c = 1,5, γ_s = 1,15), utilisable pour les classes 1 et 2 ; en classe 3 ou 4 la résistance est élastique (section efficace pour la classe 4), à vérifier avec les combinaisons ELU complètes.');
  h2('Phases de construction');
  table(['Phase', 'Date [j]', 'Opération'], modele.phases.map((ph, i) => [String(i + 1), F(ph.t), ph.nom]));
  para(`Plots de travée bétonnés d’abord, plots sur appuis ensuite (cadence ${F(p.dates.cadence)} j) : le béton des zones d’appui est mis en place quand la charpente a déjà pris l’essentiel de la flèche, ce qui limite sa fissuration. ${p.fissuration ? `Zones fissurées sur ${F(p.zone * 100, 0)} % de chaque travée de part et d’autre des appuis intermédiaires : la dalle n’y compte que par ses armatures (EN 1994-2 § 5.4.2.3 (3)).` : 'Analyse non fissurée.'}`);
  h2('Contraintes aux sections remarquables (actions permanentes)');
  const S = sectionsRemarquables(R), debut = i => r.pas.findIndex(q => q.phase === i), iS = modele.phases.length - 1;
  const inst = [[`avant superstructures (${F(p.dates.superstructures)} j)`, r.finPhase[iS - 1]], ['après superstructures', debut(iS)], [`fin (${F(p.dates.fin)} j)`, r.pas.length - 1]];
  const rows = [];
  for (const [ni, k] of inst) for (const sc of S) {
    const c = contraintesMixtes(r.pas[k], modele, R, sc), fy = R.fibres[sc.ia].fy;
    rows.push([ni, sc.nom, F(c.acier.sup, 0), F(c.acier.inf, 0), F(Math.max(Math.abs(c.acier.sup), Math.abs(c.acier.inf)) / fy, 2), c.dalle.armatures != null ? `armatures ${F(c.dalle.armatures, 0)}` : `${F(c.dalle.sup, 2)} / ${F(c.dalle.inf, 2)}`]);
  }
  table(['Instant', 'Section', 'σ acier semelle sup [MPa]', 'σ acier semelle inf [MPa]', 'σ / f_y', 'Dalle : σ sup / inf ou armatures [MPa]'], rows);
  para('Traction positive. Acier : contraintes sous actions permanentes seules, à cumuler avec le trafic et le gradient thermique (EN 1994-2 § 7.2.2 : σ ≤ f_y/γ_M,ser sous combinaison caractéristique). Dalle hors zones fissurées : le retrait gêné la met en traction ; les armatures des zones d’appui reprennent l’effort de la dalle fissurée.');
  // flèches
  table(['Instant', ...p.L.map((_, s) => `flèche travée ${s + 1} [mm]`)], [[`fin de bétonnage (${F(p.dates.superstructures)} j)`, r.finPhase[iS - 1]], ['après superstructures', debut(iS)], [`fin (${F(p.dates.fin)} j)`, r.pas.length - 1]].map(([ni, k]) => [ni, ...flechesBipoutre(r.pas[k], R).map(v => F(v * 1000, 0))]));
  para('Flèches à mi-travée depuis la pose de la charpente (poids propre de l’acier compris) : la flèche finale est la contre-flèche de fabrication à donner aux poutres pour obtenir le profil voulu en service.');
  // diagramme des moments de la section mixte
  const diag = k => { const pts = []; R.iAcier.forEach((ia, q) => { const id = R.iDalle[q], bb = modele.barres[ia], x0 = modele.noeuds[bb.i][0], Lb = modele.noeuds[bb.j][0] - x0; for (const xi of [0, 0.5, 1]) pts.push([x0 + xi * Lb, resultante(r.pas[k], [ia, id], xi * Lb).M / 1000]); }); return pts; };
  B.push({ t: 'svg', svg: courbesSVG([{ nom: 'avant superstructures', pts: diag(r.finPhase[iS - 1]) }, { nom: 'après superstructures', pts: diag(debut(iS)), coul: '#2a8f6a' }, { nom: `t = ${F(p.dates.fin)} j`, pts: diag(r.pas.length - 1), coul: '#c8552b' }], { titre: 'Moment de la section mixte (acier + dalle) [MN·m]', xlab: 'abscisse [m]', ylab: 'M [MN·m]', marques: R.x0.map(x => ({ x, nom: '' })) }), caption: 'Moments rapportés au c.d.g. de l’acier de travée ; redistribution par fluage et retrait entre la fin des travaux et la fin du calcul.' });
  if (out.v) B.push(...mixteVerifsBlocks(out));
  else if (out.vErreur) para(`Vérifications de la structure achevée impossibles : ${out.vErreur}.`);
  h2('Méthode et limites');
  para('Calcul par phases pas à pas : acier élastique, béton de chaque plot avec son âge (fluage et retrait EN 1992-1-1), sections mixtes par barres décalées (acier, dalle, armatures), plots activés le lendemain de leur bétonnage. Le retrait est recoupé, sur une travée isostatique, avec la méthode des coefficients d’équivalence n_L de l’EN 1994-2 (écart de 4 %).');
  para('Limites : poutre de rive et sa part de dalle (charges permanentes non réparties entre poutres) ; répartition transversale du trafic par la règle du levier (bipoutre) ou Courbon ; zones fissurées forfaitaires (15 %) ; déversement en phase de bétonnage (charpente seule) non vérifié ; fatigue par la méthode des coefficients λ simplifiée (λ₃ = λ₄ = 1), armatures non vérifiées en fatigue ; voilement des panneaux comprimés sans raidisseurs longitudinaux.');
  return B;
}
