/** Cadres fermés (PICF) et portiques ouverts (PIPO) : blocs de présentation (interface et note) et figures SVG. */
import { goussetSup, goussetInf } from '../src/cadre/details.js';
import { portee, hauteurCalc, nCell, epVoile } from '../src/cadre/cadre.js';

const F = (v, n = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F3 = v => F(v, 3);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** Face tendue par un moment de signe donné (convention des barres : traverses et radiers de gauche à droite, voiles de bas en haut). */
export function faceTendue(barre, positif) {
  if (barre.startsWith('Traverse') || barre === 'Piédroit gauche') return positif ? 'intérieure' : 'extérieure';
  if (barre.startsWith('Radier') || barre === 'Piédroit droit') return positif ? 'extérieure' : 'intérieure';
  return positif ? 'droite' : 'gauche';
}
const LIB_FRANCHIE = { eau: 'écoulement (ouvrage hydraulique)', route: 'route', rail: 'voie ferrée' };

/** Géométrie aux feuillets moyens : x des voiles, hauteur de calcul. */
function axes(g) {
  const n = nCell(g), x = [0];
  for (let i = 0; i < n; i++) x.push(x[i] + portee(g, i));
  return { n, x, hc: hauteurCalc(g) };
}

/**
 * Coupe transversale cotée et enveloppes des moments ELU (toutes combinaisons tracées) le long des barres.
 * Moments positifs (fibre intérieure tendue) dessinés vers l'intérieur de la cellule.
 */
export function cadreSVG(r, { largeur = 760 } = {}) {
  const g = r.cadre, ouvert = !!r.ouvert;
  const { n, x, hc } = axes(g), W = x[n], ep = g.ep, et = g.et, er = g.er || 0;
  const pad = 60, sc = Math.min((largeur - 2 * pad) / (W + 2 * ep), 300 / (hc + et + er));
  const H = (hc + (et + er) / 2) * sc + 2 * pad + 30, X = v => pad + (v + ep / 2) * sc, Y = v => pad + 20 + (hc - v) * sc;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${H.toFixed(0)}" width="100%" style="max-width:${largeur}px;background:#fff;font-family:system-ui,sans-serif">`;
  // béton
  const rect = (x0, y0, x1, y1) => `<rect x="${X(x0).toFixed(1)}" y="${Y(y1).toFixed(1)}" width="${((x1 - x0) * sc).toFixed(1)}" height="${((y1 - y0) * sc).toFixed(1)}" fill="#e8ecef" stroke="#555" stroke-width="0.8"/>`;
  s += rect(-ep / 2, hc - et / 2, W + ep / 2, hc + et / 2);
  if (!ouvert) s += rect(-ep / 2, -er / 2, W + ep / 2, er / 2);
  for (let j = 0; j <= n; j++) { const e = epVoile(g, j); s += rect(x[j] - e / 2, ouvert ? 0 : er / 2, x[j] + e / 2, hc - et / 2); }
  if (ouvert) for (let j = 0; j <= n; j++) s += `<path d="M${X(x[j]) - 14} ${Y(0) + 10} L${X(x[j]) + 14} ${Y(0) + 10} M${X(x[j]) - 14} ${Y(0) + 10} l-6 6 M${X(x[j]) - 4} ${Y(0) + 10} l-6 6 M${X(x[j]) + 6} ${Y(0) + 10} l-6 6 M${X(x[j]) + 16} ${Y(0) + 10} l-6 6" stroke="#333" fill="none"/>`;
  // remblai
  if (r.geom.Hr > 0) s += `<rect x="${X(-ep / 2) - 20}" y="${Y(hc + et / 2) - Math.min(r.geom.Hr * sc, 40)}" width="${(W + ep) * sc + 40}" height="${Math.min(r.geom.Hr * sc, 40)}" fill="#f4ead2" stroke="none"/><text x="${X(W / 2)}" y="${Y(hc + et / 2) - 6}" font-size="11" text-anchor="middle" fill="#7a5c1e">remblai ${F(r.geom.Hr)} m</text>`;
  // enveloppes ELU des moments
  const elu = r.frames.filter((f, k) => r.combos[k].elu);
  const barres = f => [...f.traverses.map((b, i) => ({ b, p0: [x[i], hc], p1: [x[i + 1], hc] })), ...f.radiers.map((b, i) => ({ b, p0: [x[i], 0], p1: [x[i + 1], 0] })), ...f.voiles.map((b, j) => ({ b, p0: [x[j], 0], p1: [x[j], hc] }))];
  let mx = 1e-9;
  for (const f of elu) for (const { b } of barres(f)) for (const p of b.res.diagramme(21)) mx = Math.max(mx, Math.abs(p[1]));
  const k = 0.18 * Math.min(W, hc) * sc / mx;
  const nb = barres(elu[0] || r.frames[0]).length;
  for (let i = 0; i < nb; i++) {
    let hi = null, lo = null;
    for (const f of elu) {
      const { b } = barres(f)[i], d = b.res.diagramme(21);
      if (!hi) { hi = d.map(p => p[1]); lo = d.map(p => p[1]); } else d.forEach((p, q) => { hi[q] = Math.max(hi[q], p[1]); lo[q] = Math.min(lo[q], p[1]); });
    }
    const { p0, p1 } = barres(elu[0] || r.frames[0])[i], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L;
    // M > 0 tend la fibre du côté −y local (y = axe de la barre tourné de +90°) : on trace chaque moment du côté de la
    // fibre tendue, décalage (uy, −ux)·M en coordonnées du modèle (y vers le haut).
    for (const [arr, col] of [[hi, '#c0392b'], [lo, '#2471a3']]) {
      const pts = arr.map((m, q) => { const t = q / (arr.length - 1), px = X(p0[0] + ux * L * t), py = Y(p0[1] + uy * L * t); return `${(px + uy * m * k).toFixed(1)},${(py + ux * m * k).toFixed(1)}`; });
      s += `<polyline points="${X(p0[0]).toFixed(1)},${Y(p0[1]).toFixed(1)} ${pts.join(' ')} ${X(p1[0]).toFixed(1)},${Y(p1[1]).toFixed(1)}" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="1.1"/>`;
    }
  }
  // cotes
  const cy = Y(ouvert ? 0 : -er / 2) + 26;
  for (let i = 0; i < n; i++) s += `<line x1="${X(x[i])}" y1="${cy}" x2="${X(x[i + 1])}" y2="${cy}" stroke="#1e8449"/><text x="${(X(x[i]) + X(x[i + 1])) / 2}" y="${cy - 4}" font-size="11" text-anchor="middle" fill="#1e8449">${F(r.geom.B)} (l_c ${F(portee(g, i))})</text>`;
  s += `<line x1="${X(W) + 30}" y1="${Y(0)}" x2="${X(W) + 30}" y2="${Y(hc)}" stroke="#1e8449"/><text x="${X(W) + 36}" y="${(Y(0) + Y(hc)) / 2}" font-size="11" fill="#1e8449">h_c ${F(hc)}</text>`;
  s += `<text x="${pad}" y="${H - 8}" font-size="11" fill="#333"><tspan fill="#c0392b">■</tspan> M max ELU  <tspan fill="#2471a3">■</tspan> M min ELU — diagrammes tracés du côté de la fibre tendue ; échelle : ${F1(mx)} t·m/ml ↔ ${F0(mx * k)} px</text>`;
  return s + '</svg>';
}

/** Blocs (titres, paragraphes, tableaux, figures) d'un calcul de cadre, pour l'interface et la note. */
export function cadreBlocks(out) {
  const B = [], h2 = text => B.push({ t: 'h2', text }), h3 = text => B.push({ t: 'h3', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const { inp, split } = out, ouvert = inp.type === 'pipo';
  if (split && split.blocs.length > 1) para(split.explication);
  out.blocs.forEach((r, ib) => {
    const g = r.geom, h = r.h, titre = out.blocs.length > 1 ? `Bloc ${ib + 1} (${split.blocs[ib].label})` : (g.nom || (ouvert ? 'Portique ouvert' : 'Cadre fermé'));
    h2(`${titre} — ${r.statut}`);
    para(`${ouvert ? `Portique ouvert (PIPO), piédroits ${inp.opts.ouvert === 'articule' ? 'articulés' : 'encastrés'} sur semelles` : 'Cadre fermé (PICF)'} à ${g.n} ouverture(s) de ${F(g.B)} m, hauteur intérieure ${F(g.H)} m, longueur ${F(g.L)} m, biais ${F(g.biais / 0.9, 1)} gr ; traverse ${F(g.et)} m${ouvert ? '' : `, radier ${F(g.er)} m`}, piédroits ${F(g.ep)} m${g.n > 1 ? `, voiles ${F(g.ei)} m` : ''} ; remblai ${F(g.Hr)} m. Voie portée : ${inp.opts.usage.portee === 'rail' ? 'voie ferrée' : 'route'} ; voie franchie : ${LIB_FRANCHIE[inp.opts.usage.franchie] || '—'}. Règlement ${h.code === 'EC2' ? 'EN 1992-1-1' : 'BAEL 91 révisé 99'}, f_c28 = ${F0(h.fc28)} MPa, f_e = ${F0(h.fe)} MPa${h.code === 'BAEL' ? `, σ̄_s = ${F1(h.sigmaS)} MPa` : `, exposition ${h.exposition}`}, enrobage ${F(h.enrobage)} m. Unités : t, t/m², t·m/ml (1 t = 10 kN).`);
    B.push({ t: 'svg', svg: cadreSVG(r), caption: 'Coupe aux feuillets moyens et enveloppes des moments ELU de toutes les combinaisons tracées (côté de la fibre tendue).' });

    h3('Charges et coefficients');
    table(['Grandeur', 'Valeur'], [
      r.rail ? ['Coefficient dynamique Φ (avant / après réduction de couverture) ; L_Φ [m]', `${F3(r.rail.phiBrut)} / ${F3(r.rail.phi)} ; ${F(r.rail.LPhi)}`] : ['Coefficient dynamique δ_B (systèmes B) / δ_Mc', `${F3(r.deltaB)} / ${F3(r.deltaMc)}`],
      ...(r.rail ? [['Largeur de diffusion transversale ; élargissement longitudinal [m]', `${F(r.rail.bt)} ; ${F(r.rail.sL)}`]] : [['Poids pris en compte pour δ (ouvrage + remblai) [t]', F1(r.poids)]]),
      ['Alourdissement de Marston K', F3(r.marstonK)],
      ['Poussée K₀ max / min ; surcharge sur remblai [t/m²]', `${F(h.K0max)} / ${F(h.K0min)} ; ${F(r.psrem)}`],
    ]);
    if (r.derivations.length) table(['Système', 'Empreinte', 'Diffusion [m]', 'U × V [m]', 'q brute [t/m²]', 'δ / Φ', 'Coef.', 'q de calcul [t/m²]', 'V / l_c'],
      r.derivations.map(d => [d.sys, d.empreinte, F3(d.s), d.U ? `${F3(d.U)} × ${F3(d.V)}` : '—', F3(d.qBrute), F3(d.delta), F(d.coef), F3(d.q), Number.isFinite(d.couverture) ? F(d.couverture) : '∞']), { small: true });
    comment(inp.opts.usage.portee === 'rail'
      ? 'Charges ferroviaires de l\'EN 1991-2 (LM71, SW/0, SW/2) déplacées le long de l\'ouvrage ; voir les hypothèses de diffusion ci-dessous.'
      : 'Fascicule 61 titre II : δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4 G/S) ; diffusion à travers le remblai 1,5 H + e (BAEL A.3.2,5, programme PICF-EL) ; A(l) recalculée pour chaque longueur chargée ; une empreinte plus courte que la portée est balayée le long de la travée.');

    h3('Cas de charge élémentaires (non pondérés)');
    table(['Cas', 'Traverse 1 about [t·m/ml]', 'Traverse 1 mi-portée', ouvert ? 'Piédroit g. pied' : 'Radier 1 about', 'Piédroit g. mi-hauteur', ouvert ? 'Réaction V pied g. [t/ml]' : 'p sol g. / d. [t/m²]'],
      r.cas.map(c => { const f = c.frame; return [c.nom, F(f.traverses[0].MA), F(f.traverses[0].Mmid), ouvert ? F(f.voiles[0].MA) : F(f.radiers[0].MA), F(f.voiles[0].Mmid), ouvert ? F(f.reactions?.[0].V) : `${F(f.pG)} / ${F(f.pD)}`]; }), { small: true });

    h3('Effets de calcul aux sections (enveloppes ELS et ELU)');
    table(['Barre', 'Section', 'M ELS max', 'M ELS min', 'M ELU max', 'M ELU min', 'V ELU [t/ml]', 'N min [t/ml]'],
      r.effets.map(e => [e.barre, e.ou, F(e.Mels), F(e.mels), F(e.Melu), F(e.melu), F(e.Vu), F(e.N)]), { small: true });
    comment('Signe des moments : M > 0 tend la face intérieure de la traverse et du piédroit gauche, la face extérieure du radier et du piédroit droit, la face droite d\'un voile intermédiaire (barres orientées de gauche à droite et de bas en haut).');
    comment('Effets additifs à section fixe : chaque cas élémentaire est pondéré selon qu\'il aggrave (γ défavorable) ou soulage la section ; remblai lourd/léger, poussée max/min et situations hydrauliques sont des alternatives ; un seul système d\'exploitation à la fois (A(l), Bc, Bt, Mc120 ou LM71, SW/0, SW/2). ELS : G + 1,20 Q civiles (1,00 militaires, 1,00 ferroviaires) ; ELU : 1,35 G + 1,60 Q civiles (1,35 militaires ; 1,45 LM71/SW/0, 1,20 SW/2).');

    h3('Armatures par mètre linéaire');
    const ligne = sx => {
      const fp = faceTendue(sx.barre, true), fm = faceTendue(sx.barre, false), aP = [fp, sx.asMax.as, sx.barresMax], aM = [fm, sx.asMin.as, sx.barresMin];
      const [a1, a2] = (fp === 'intérieure' || fp === 'gauche') ? [aP, aM] : [aM, aP];
      return [sx.barre, sx.ou, F(sx.e), F3(sx.d), `${a1[0]} : ${F(a1[1])}`, a1[2].option?.label || 'aucune', `${a2[0]} : ${F(a2[1])}`, a2[2].option?.label || 'aucune',
        sx.tranchantEc2 ? `${F(sx.tranchantEc2.ved)} / ${F(sx.tranchantEc2.vRd)}` : `${F3(sx.tranchant.tau)} / ${F3(sx.tranchant.lim)}`, sx.echec ? 'NON' : 'OK'];
    };
    table(['Barre', 'Section', 'e [m]', 'd [m]', 'A_s face int. (g.) [cm²/ml]', 'Barres', 'A_s face ext. (d.) [cm²/ml]', 'Barres', h.code === 'EC2' ? 'V_Ed / V_Rd,c' : 'τ_u / τ_lim [MPa]', 'Verdict'], r.sections.map(ligne), { small: true });
    comment(`Hauteur utile d = e − enrobage − φ/2, recalculée avec le diamètre retenu ; flexion composée à l'ELS (BAEL) dès que N > 0,5 t/ml, avec la compression la plus faible ; non-fragilité ${h.code === 'EC2' ? 'EN 1992-1-1 §9.2.1.1' : '0,23 d f_t28/f_e'} ; effort tranchant sans armatures ${h.code === 'EC2' ? 'V_Rd,c (§6.2.2)' : '0,07 f_c28/γ_b (A.5.2,2)'}.`);
    const B0 = r.geom.B, gs = goussetSup(B0), gi = goussetInf(B0);
    para(`Dispositions du guide PICF-EL : renfort de gousset supérieur ${F(gs.L)} m, ${gs.n} barres (${gs.base}) ; ${ouvert ? '' : `gousset inférieur ${F(gi.L)} m, ${gi.n} barres (${gi.base}) ; `}voiles : espacement 0,40 m, 0,20 m sur 2,00 m près des joints.`);

    if (r.reactions) {
      h3('Réactions d\'appui des piédroits (pour les semelles)');
      table(['Appui', 'V ELS min / max [t/ml]', 'H ELS min / max [t/ml]', 'M ELS min / max [t·m/ml]', 'V ELU min / max', 'H ELU min / max', 'M ELU min / max'],
        r.reactions.map(a => [a.appui, `${F(a.els.Vmin)} / ${F(a.els.Vmax)}`, `${F(a.els.Hmin)} / ${F(a.els.Hmax)}`, `${F(a.els.Mmin)} / ${F(a.els.Mmax)}`, `${F(a.elu.Vmin)} / ${F(a.elu.Vmax)}`, `${F(a.elu.Hmin)} / ${F(a.elu.Hmax)}`, `${F(a.elu.Mmin)} / ${F(a.elu.Mmax)}`]), { small: true });
      comment('Réaction exercée par la semelle sur le piédroit : V vers le haut, H vers la droite (+x), M positif dans le sens trigonométrique.');
    }
    if (r.gabarit) para(`Gabarit : hauteur libre ${F(r.gabarit.hauteurLibre)} m${r.gabarit.hauteurRequise > 0 ? ` pour ${F(r.gabarit.hauteurRequise)} m requis` : ''}, ouverture ${F(r.gabarit.largeurLibre)} m${r.gabarit.largeurRequise > 0 ? ` pour ${F(r.gabarit.largeurRequise)} m requis` : ''} — ${r.gabarit.ok ? 'OK' : 'NON'}.`);
    if (r.choc) {
      h3('Choc sur les piédroits (situation accidentelle)');
      table(['Barre', 'Section', 'z choc [m]', 'M [t·m/ml]', 'A_s requis', 'A_s fourni [cm²/ml]', 'τ / τ_lim [MPa]', 'Verdict'],
        r.choc.verifs.map(v => [v.barre, v.ou, F(v.z), F(v.M), v.surarme ? 'surarmé' : F(v.asReq), F(v.asFournie), `${F3(v.tau)} / ${F3(v.tauLim)}`, v.okFlexion && v.okTranchant ? 'OK' : 'NON']), { small: true });
    }
    if (r.flottaison) para(r.flottaison.message);
    para(`Avant-métré : ${r.metre.note}`);
    if (r.reserves.length) { h3('Réserves bloquantes'); for (const x of r.reserves) para('RÉSERVE — ' + x); }
    h3('Hypothèses retenues et observations');
    for (const x of r.alertes) comment(x);
  });
  return B;
}

/** Note de calcul autonome (même format que la note des appuis). */
export function cadreNote(out, { version = '' } = {}) {
  const ouvert = out.inp.type === 'pipo', g = out.inp.geom;
  return {
    title: `Note de calcul — ${ouvert ? 'portique ouvert (PIPO)' : 'cadre fermé (PICF)'}${g.nom ? ' ' + g.nom : ''}`,
    meta: `PSIDA ${version} — module cadres et portiques (portage du moteur BVTrace, programme SETRA PICF-EL, Fascicule 61 titre II, BAEL 91 / EN 1992-1-1${out.inp.opts.usage.portee === 'rail' ? ', EN 1991-2 section 6' : ''})`,
    blocks: [{ t: 'h1', text: '1. Calcul de structure' }, ...cadreBlocks(out),
      { t: 'h1', text: '2. Références' },
      { t: 'ref', text: 'SETRA, Programme de calcul PICF-EL — guide d\'emploi (déc. 1991, 2ᵉ éd. juillet 1992) : combinaisons, effet Marston (annexe 4), module ESOL (annexe 2), biais (annexe 5).' },
      { t: 'ref', text: 'Fascicule 61 titre II (charges routières) ; BAEL 91 révisé 99 ; NF EN 1992-1-1 ; NF EN 1991-2 section 6 (charges ferroviaires) ; NF EN 1990 annexe A2 ; NF EN 1991-1-7 (chocs).' }],
  };
}
