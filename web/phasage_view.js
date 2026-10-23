/**
 * Onglet « Phasage » : tablier à poutres préfabriquées précontraintes rendues continues (src/phasage/exemples.js),
 * calcul par phases avec fluage, retrait et relaxation (src/phasage/phasage.js). Blocs de note (format commun à
 * blocksToHTML et aux notes HTML/Word), figures en SVG autonomes.
 */
import { calculPhasage, resultante } from '../src/phasage/phasage.js';
import { lirePhasage, poutresContinues, momentsRemarquables, diagramme, lireFleau, fleaux, momentsFleau, diagrammeFleau, contreflechesFleau, flechesPoutres } from '../src/phasage/exemples.js';
import { betonEC2 } from '../src/phasage/fluage.js';

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
  if (d.ph_type === 'fleau') { const p = lireFleau(d), { modele, reperes } = fleaux(p); return { type: 'fleau', p, modele, reperes, r: calculPhasage(modele) }; }
  const p = lirePhasage(d), { modele, reperes } = poutresContinues(p), r = calculPhasage(modele);
  return { type: 'poutres', p, modele, reperes, r };
}

/** Pertes instantanées d'un câble : diagramme avant et après recul d'ancrage. */
function blocsPertesInst(B, pi, nom, c) {
  if (!pi) return;
  B.push({ t: 'svg', svg: courbesSVG([{ nom: 'après frottement', pts: pi.x.map((x, i) => [x, pi.avant[i]]), tirets: true }, { nom: 'après recul d’ancrage', pts: pi.x.map((x, i) => [x, pi.apres[i]]), coul: '#c8552b' }],
    { titre: `Pertes instantanées — ${nom} [kN]`, xlab: 'abscisse le long du câble [m]', ylab: 'P [kN]', h: 260, zero: false }),
    caption: `Frottement P₀ e^{−μ(θ + kx)} (μ = ${F(c.mu, 2)}, k = ${F(c.k, 3)} rad/m) et recul d'ancrage g = ${F(c.g * 1000, 1)} mm (NF EN 1992-1-1 § 5.10.5.2 et 5.10.5.3) ; longueur d'influence λ = ${F(Math.max(...pi.lambda), 1)} m${pi.lambda[1] ? ' de chaque côté' : ''}.` });
}

export function phasageBlocks(out) {
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

  h2('Méthode et limites');
  para('Méthode pas à pas (Bažant ; Ghali, Favre et Elbadry, Concrete Structures: Stresses and Deformations, ch. 5) sur une ossature plane : chaque incrément d\'effort est affecté de la fonction de fluage J(t, τ) de son béton et de son âge ; un changement de schéma (clavage, activation du hourdis) ne sollicite que par les incréments postérieurs. Moteur recoupé sur les solutions fermées de Dischinger, l\'équation intégrale de Volterra, le Bulletin technique Sétra n° 7 (1972, annexe I), le guide Sétra « Eurocode 2 — application aux ponts-routes en béton » (2008) et l\'éq. (5.46) de l\'EN 1992-1-1.');
  para('Limites : effort normal constant par barre (le maillage doit rester fin), sections non fissurées, armatures passives non prises en compte dans le fluage (coefficient k_s du guide Sétra non appliqué), une poutre et sa largeur de hourdis (pas de répartition transversale), gradient thermique et charges d\'exploitation hors de ce module.');
  return B;
}

export function phasageNote(out, { version = '' } = {}) {
  return {
    title: out.type === 'fleau' ? 'Note de calcul — pont construit par encorbellements successifs : phasage et effets différés' : 'Note de calcul — tablier à poutres précontraintes rendues continues : effets différés',
    meta: `PSIDA ${version} — calcul par phases avec fluage, retrait et relaxation (NF EN 1992-1-1)`,
    blocks: [{ t: 'h1', text: '1. Calcul par phases' }, ...phasageBlocks(out), { t: 'h1', text: '2. Références' },
      { t: 'ref', text: 'NF EN 1992-1-1 : § 3.1.2, § 3.1.4, § 3.3.2, § 5.10.5, § 5.10.6 et annexe B ; NF EN 1992-2.' },
      { t: 'ref', text: 'Z. P. Bažant, Prediction of concrete creep effects using age-adjusted effective modulus method, ACI Journal 69 (1972) ; A. Ghali, R. Favre, M. Elbadry, Concrete Structures: Stresses and Deformations, 4ᵉ éd., CRC Press (2012).' },
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
    ['Câbles de fléau (par paire de voussoirs)', `A_p = ${F(p.cable.Ap * 1e4, 1)} cm², P₀ = ${F(p.cable.P0)} kN au vérin, tendus des deux côtés, à ${F(p.cable.enrob, 2)} m sous l'extrados`],
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
  h2('Précontrainte : pertes instantanées et différées');
  const rows = [];
  modele.cables.forEach((c, ic) => {
    if (ic % 2 === 1 && /fléau/.test(c.nom)) return;   // fléau 2 identique au fléau 1
    const seg = r.final.cables.findIndex(q => q && q.cable === ic && q.seg === Math.floor(c.segments.length / 2));
    const k0 = debut(c.phase), N0 = r.pas[k0].cables[seg].N, Nc = r.pas[r.finPhase[iCl - 1]].cables[seg]?.N, Nf = r.final.cables[seg].N;
    rows.push([c.nom.replace('F1-', ''), F(c.P0), F(N0), Nc == null ? '—' : F(Nc), F(Nf), F((1 - Nf / c.P0) * 100, 1)]);
  });
  table(['Câble (milieu)', 'P₀ vérin [kN]', 'après pertes instantanées [kN]', 'avant clavage [kN]', 'P(∞) [kN]', 'pertes totales [%]'], rows);
  const iLong = modele.cables.findIndex((c, i) => i === 2 * p.nv);
  blocsPertesInst(B, r.pertesInstantanees[iLong], modele.cables[iLong].nom, p.cable);
  h2('Contre-flèches de construction (fléau 1)');
  const cf = contreflechesFleau(r, modele, R), mm = v => F(v * 1000, 1);
  table(['Joint', 'x [m]', 'construction jusqu’au clavage [mm]', 'après clavage jusqu’à la fin [mm]', 'déplacement total [mm]', 'contre-flèche du coffrage [mm]'],
    cf.map(c => [`${c.cote === 'G' ? 'gauche' : 'droite'} ${c.k === 0 ? 'VSP' : c.k}`, F(c.x, 2), mm(c.construction), mm(c.apres), mm(c.total), mm(c.contrefleche)]));
  B.push({ t: 'svg', svg: courbesSVG([{ nom: 'contre-flèche totale', pts: cf.map(c => [c.x, c.contrefleche * 1000]) }, { nom: 'part de la construction', pts: cf.map(c => [c.x, -c.construction * 1000]), tirets: true }],
    { titre: 'Contre-flèches à donner aux coffrages des voussoirs [mm] (+ vers le haut)', xlab: 'abscisse [m]', ylab: 'mm', h: 260 }), caption: 'Fléau 1 ; le fléau 2 est symétrique.' });
  para('Chaque coffrage est réglé sur le bout du voussoir précédent juste avant le bétonnage ; le joint suit ce bout rigidement jusqu\'au décoffrage, puis la structure. La contre-flèche compense tout le déplacement vertical postérieur au réglage : poids des voussoirs suivants, câbles, clavages, superstructures, fluage et retrait jusqu\'à la fin du calcul. Non compris : la déformation propre de l\'équipage mobile (à ajouter d\'après sa raideur, fournie par l\'entreprise), les tassements d\'appuis et le gradient thermique.');
  h2('Méthode et limites');
  para('Calcul par phases pas à pas (même moteur que pour les poutres rendues continues) : chaque voussoir est une barre avec son béton et sa date de coulage ; le béton frais est porté par l\'équipage au bout du fléau (force et moment) jusqu\'au décoffrage ; les câbles de fléau sont tendus des deux côtés après chaque paire de voussoirs, avec frottement et recul d\'ancrage (§ 5.10.5) ; les clavages réunissent les fléaux sans contrainte. Hauteur et inertie variables par barre (I ∝ h^{5/2}, BT n° 7 § 2.222).');
  para('Limites : ligne moyenne supposée droite (la variation du c.d.g. avec la hauteur n\'est prise en compte que dans les excentrements), fléaux construits simultanément et symétriquement (pas de déséquilibre de bétonnage ni de vent en phase de construction), pas de gradient thermique ni de charges d\'exploitation, flexion transversale du caisson et effort tranchant hors de ce module, contre-flèches non calculées.');
  return B;
}
