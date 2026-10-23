/**
 * Onglet « Phasage » : tablier à poutres préfabriquées précontraintes rendues continues (src/phasage/exemples.js),
 * calcul par phases avec fluage, retrait et relaxation (src/phasage/phasage.js). Blocs de note (format commun à
 * blocksToHTML et aux notes HTML/Word), figures en SVG autonomes.
 */
import { calculPhasage, resultante } from '../src/phasage/phasage.js';
import { lirePhasage, poutresContinues, momentsRemarquables, diagramme } from '../src/phasage/exemples.js';
import { betonEC2 } from '../src/phasage/fluage.js';

const F = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace(/^-0(,0+)?$/, '0$1') : '—');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COUL = ['#0b5fa5', '#c8552b', '#2a8f6a', '#8a4fb8', '#b8860b', '#6b6b6b'];

/** Courbes en SVG : series = [{ nom, pts: [[x, y]…], coul?, tirets? }], abscisses logarithmiques en option. */
export function courbesSVG(series, { titre = '', xlab = '', ylab = '', xlog = false, w = 720, h = 300, marques = [] } = {}) {
  const X = v => (xlog ? Math.log10(Math.max(v, 1e-6)) : v), all = series.flatMap(s => s.pts);
  let x0 = Math.min(...all.map(p => X(p[0]))), x1 = Math.max(...all.map(p => X(p[0])));
  let y0 = Math.min(0, ...all.map(p => p[1])), y1 = Math.max(0, ...all.map(p => p[1]));
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
  const p = lirePhasage(d), { modele, reperes } = poutresContinues(p), r = calculPhasage(modele);
  return { p, modele, reperes, r };
}

export function phasageBlocks(out) {
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
    rows.push([`Câble T${s + 1} (mi-travée)`, F(p.cable.P), F(Nc), F(Nf), F((1 - Nf / p.cable.P) * 100, 1), F((p.cable.P - Nf) / p.cable.Ap / 1000)]);
    void N0;
  }
  table(['Câble', 'P après mise en tension [kN]', `P au clavage [kN]`, `P(∞) [kN]`, 'Pertes différées [%]', 'Δσ_p [MPa]'], rows);
  para('Pertes calculées pas à pas : raccourcissement du béton sous les charges successives, fluage et retrait (EN 1992-1-1 annexe B et § 3.1.4) et relaxation (§ 3.3.2), en interaction avec la structure. La force après mise en tension est une donnée (pertes instantanées par frottement et recul d\'ancrage non calculées ici).');

  h2('Méthode et limites');
  para('Méthode pas à pas (Bažant ; Ghali, Favre et Elbadry, Concrete Structures: Stresses and Deformations, ch. 5) sur une ossature plane : chaque incrément d\'effort est affecté de la fonction de fluage J(t, τ) de son béton et de son âge ; un changement de schéma (clavage, activation du hourdis) ne sollicite que par les incréments postérieurs. Moteur recoupé sur les solutions fermées de Dischinger, l\'équation intégrale de Volterra, le Bulletin technique Sétra n° 7 (1972, annexe I), le guide Sétra « Eurocode 2 — application aux ponts-routes en béton » (2008) et l\'éq. (5.46) de l\'EN 1992-1-1.');
  para('Limites : effort normal constant par barre (le maillage doit rester fin), sections non fissurées, armatures passives non prises en compte dans le fluage (coefficient k_s du guide Sétra non appliqué), une poutre et sa largeur de hourdis (pas de répartition transversale), gradient thermique et charges d\'exploitation hors de ce module.');
  return B;
}

export function phasageNote(out, { version = '' } = {}) {
  return {
    title: 'Note de calcul — tablier à poutres précontraintes rendues continues : effets différés',
    meta: `PSIDA ${version} — calcul par phases avec fluage, retrait et relaxation (NF EN 1992-1-1)`,
    blocks: [{ t: 'h1', text: '1. Calcul par phases' }, ...phasageBlocks(out), { t: 'h1', text: '2. Références' },
      { t: 'ref', text: 'NF EN 1992-1-1 : § 3.1.2, § 3.1.4, § 3.3.2, § 5.10.6 et annexe B ; NF EN 1992-2.' },
      { t: 'ref', text: 'Z. P. Bažant, Prediction of concrete creep effects using age-adjusted effective modulus method, ACI Journal 69 (1972) ; A. Ghali, R. Favre, M. Elbadry, Concrete Structures: Stresses and Deformations, 4ᵉ éd., CRC Press (2012).' },
      { t: 'ref', text: 'Sétra, Bulletin technique n° 7 : ponts en béton précontraint construits par encorbellements successifs (1972), annexe I § 2.2 ; Sétra, Guide méthodologique Eurocode 2 — application aux ponts-routes en béton (2008), ch. 4.' }],
  };
}
