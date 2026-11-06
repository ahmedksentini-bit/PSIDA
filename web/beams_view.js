/** Ponts à poutres : blocs de présentation (interface et note). */
import { MENTION, PARAMETRES_REFERENTIEL } from '../src/loads_rail.js';
import { deformationsBlocks } from './rail_deformations_view.js';
import { indicationsParCible, cleCible, texteChamps } from '../src/reco/poutres.js';
import { durabiliteLignes } from '../src/plans/poutres_ba.js';
import { texteDurabilite } from '../src/durabilite.js';
const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F2 = v => F(v, 2), F3 = v => F(v, 3);
const CM = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : F(v * 1e4, 1));
const MPa = v => F(v / 1000, 2);

/** Courbes le long de la demi-travée (contraintes, MPa) : séries [{ nom, pts: [[x, v]], c, dash }], limites horizontales. */
function courbesX(series, { titre = '', unite = 'MPa', lim = [], xlab = 'x depuis l\'appui [m] (demi-travée)' } = {}) {
  const w = 720, h = 260, ml = 52, mr = 150, mt = 24, mb = 34, all = series.flatMap(q => q.pts.map(p => p[1])).concat(lim.map(l => l.v));
  const xMax = Math.max(...series.flatMap(q => q.pts.map(p => p[0]))), yMin = Math.min(0, ...all), yMax = Math.max(0, ...all), pad = (yMax - yMin) * 0.08 || 1;
  const sx = x => ml + x / xMax * (w - ml - mr), sy = v => mt + (yMax + pad - v) / (yMax - yMin + 2 * pad) * (h - mt - mb);
  const o = [`<rect x="${ml}" y="${mt}" width="${w - ml - mr}" height="${h - mt - mb}" fill="#fff" stroke="#ccc"/>`];
  const step = (() => { const r = (yMax - yMin) / 6, p10 = 10 ** Math.floor(Math.log10(r || 1)); return [1, 2, 5, 10].map(m => m * p10).find(m => m >= r) || r; })();
  for (let v = Math.ceil((yMin - pad) / step) * step; v <= yMax + pad; v += step) o.push(`<line x1="${ml}" x2="${w - mr}" y1="${sy(v)}" y2="${sy(v)}" stroke="#eee"/><text x="${ml - 5}" y="${sy(v) + 4}" font-size="10" text-anchor="end">${F(v, step < 1 ? 1 : 0)}</text>`);
  o.push(`<line x1="${ml}" x2="${w - mr}" y1="${sy(0)}" y2="${sy(0)}" stroke="#888"/>`);
  { const sx0 = [1, 2, 2.5, 5, 10].find(m => xMax / m <= 9) || 10; for (let x = 0; x <= xMax + 1e-9; x += sx0) o.push(`<line x1="${sx(x)}" x2="${sx(x)}" y1="${h - mb}" y2="${h - mb + 4}" stroke="#888"/><text x="${sx(x)}" y="${h - mb + 14}" font-size="10" text-anchor="middle">${F(x, sx0 < 1 ? 1 : 0)}</text>`); }
  for (const l of lim) o.push(`<line x1="${ml}" x2="${w - mr}" y1="${sy(l.v)}" y2="${sy(l.v)}" stroke="#b33" stroke-dasharray="5 3"/><text x="${ml + 6}" y="${sy(l.v) - 3}" font-size="9.5" fill="#b33">${l.nom}</text>`);
  series.forEach((q, i) => {
    o.push(`<polyline fill="none" stroke="${q.c}" stroke-width="1.8"${q.dash ? ' stroke-dasharray="5 3"' : ''} points="${q.pts.map(([x, v]) => `${sx(x).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')}"/>`);
    o.push(`<line x1="${w - mr + 8}" x2="${w - mr + 26}" y1="${mt + 14 + i * 15}" y2="${mt + 14 + i * 15}" stroke="${q.c}" stroke-width="2"${q.dash ? ' stroke-dasharray="5 3"' : ''}/><text x="${w - mr + 30}" y="${mt + 18 + i * 15}" font-size="10">${q.nom}</text>`);
  });
  o.push(`<text x="${(ml + w - mr) / 2}" y="${h - 2}" font-size="10.5" text-anchor="middle">${xlab}</text><text x="12" y="${mt + (h - mt - mb) / 2}" font-size="10.5" text-anchor="middle" transform="rotate(-90 12 ${mt + (h - mt - mb) / 2})">${unite}</text>`);
  if (titre) o.push(`<text x="${ml}" y="15" font-size="11.5">${titre}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" font-family="system-ui,sans-serif">${o.join('')}</svg>`;
}

/** Proposition d'étriers : 2 brins HA10 à HA16, espacement arrondi à 5 cm, s ≤ min(0,75 d ; 40 cm) (EN 1992-1-1 § 9.2.2 (6) ; BAEL A.5.1,22). */
function etriers(AswS, d) {
  for (const [nom, a] of [['HA10', 2 * 0.785e-4], ['HA12', 2 * 1.131e-4], ['HA14', 2 * 1.539e-4], ['HA16', 2 * 2.011e-4]]) {
    const s = Math.min(Math.floor(a / AswS / 0.05) * 0.05, Math.floor(0.75 * d / 0.05) * 0.05, 0.40);
    if (s >= 0.10) return `2 ${nom} / ${F0(s * 100)} cm`;
  }
  return 'à densifier (> 2 HA16 / 10 cm)';
}

/** Proposition de nappe par mètre : HA10 à HA20, espacement de 10 à 25 cm (arrondi à 2,5 cm). */
function nappe(As) {
  for (const [nom, a] of [['HA10', 0.785e-4], ['HA12', 1.131e-4], ['HA14', 1.539e-4], ['HA16', 2.011e-4], ['HA20', 3.142e-4], ['HA25', 4.909e-4]]) {
    const s = Math.min(Math.floor(a / Math.max(As, 1e-9) / 0.025) * 0.025, 0.25);
    if (s >= 0.10) return `${nom} / ${F(s * 100, 1)} cm`;
  }
  return 'deux lits nécessaires';
}

/** Hourdis (flexion locale) et entretoises d'about (vérinage). */
export function localBlocks(r) {
  const B = [], h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const H = r.hourdis, E = r.entretoise, inp = r.inp;
  if (H && !H.erreur && H.rail) {
    const Rh = H.rail;
    h2('Hourdis — flexion locale transversale sous charges ferroviaires (moments par mètre, kN·m/m)');
    const sel = [H.inf.gov, H.sup.gov].filter((c, i, a) => a.indexOf(c) === i);
    table(['Section', 'G', '1 voie (LM71)', ...(Rh.nV === 2 ? ['2 voies (LM71)'] : []), ...(Rh.sw2 ? ['SW/2', ...(Rh.nV === 2 ? ['SW/2 + LM71'] : [])] : []), 'ELU', 'Caractéristique', 'Fréquente'],
      sel.map(c => [c.nom, F(c.G), F(c.rail.rail1), ...(Rh.nV === 2 ? [F(c.rail.rail2)] : []), ...(Rh.sw2 ? [F(c.rail.sw2), ...(Rh.nV === 2 ? [F(c.rail.sw2b)] : [])] : []), F(c.EC.ELU), F(c.EC.CAR), F(c.EC.FREQ)]), { small: true });
    comment(`Plaque DKT de ${F0(H.modele.Lm)} m × toute la largeur, appuyée sur l'axe des poutres, épaissie au droit des tables ; surfaces d'influence des moments m_y. LM71 × α : chaque essieu réparti sur trois traverses (Q/4, Q/2, Q/4 à ${F2(Rh.a)} m, EN 1991-2 § 6.3.6.1), chaque traverse diffusée à 4:1 dans le ballast puis à 45° jusqu'au feuillet moyen du hourdis : rectangle ${F2(Rh.ax)} m (le long de la voie, traverse de ${F2(Rh.wt)} m — largeur supposée) × ${F2(Rh.ay)} m (§ 6.3.6.2 et 6.3.6.3) ; charge répartie hors du groupe d'essieux sur les seules parties défavorables ; axe de voie décalé de e = r/18 = ${F3(Rh.ecc)} m (§ 6.3.5)${Rh.sw2 ? ' ; SW/2 sur toute la plaque, intervalle de 7 m placé au mieux' : ''}. Coefficient dynamique ${Rh.dyn.nom} = ${F3(Rh.phi)} pour L_Φ = ${F2(Rh.LPhi)} m (tableau 6.2, cas 4.1 : 3 × portée du hourdis entre nus des âmes, ${F2(Rh.portee)} m${Rh.plafonne ? ', plafonné à L_Φ des poutres principales' : ''}). Combinaisons : ELU 1,35 G + γ Q (1,45 ; 1,20 avec SW/2), caractéristique G + Q, fréquente G + ψ₁ Q (tableau A2.3).`);
    const ligne = (nom, D) => [nom, D.gov.nom, F(D.mom.ELU), F(D.mom.CAR), F(D.mom.FREQ), F(D.AsULS * 1e4, 1), F(D.AsSLS * 1e4, 1), F(D.AsWk * 1e4, 1), F(Math.max(D.as921, D.perFace) * 1e4, 1), F(D.As * 1e4, 1), nappe(D.As)];
    table(['Nappe transversale', 'Section déterminante', 'M_ELU', 'M_car', 'M_fréq', 'A_s ELU', 'A_s σ_s', 'A_s w_k 0,3', 'A_s min', 'A_s retenu [cm²/m]', 'Proposition'], [ligne('inférieure (travée)', H.inf), ligne('supérieure (nu des tables)', H.sup)], { small: true });
    comment('Effets locaux sous rail : murs garde-ballast et éléments proches de la voie (§ 6.3.6.4(3)) non traités ; poinçonnement sans objet sous ballast.');
  } else if (H && !H.erreur) {
    h2('Hourdis — flexion locale transversale (moments par mètre, kN·m/m)');
    const sel = [H.inf.gov, H.sup.gov, ...H.cibles.filter(c => c.rive && c.type === 'appui').slice(0, 1)].filter((c, i, a) => a.indexOf(c) === i);
    table(['Section', 'G', 'TS', 'UDL', 'Trottoirs', 'LM2', 'Bc (δ)', 'Bt (δ)', 'Br (δ)', 'Mc120 (δ)', 'ELU EC', 'ELU F61'],
      sel.map(c => [c.nom, F(c.G), F(c.TS), F(c.UDL), F(c.FW), F(c.LM2), F(c.f61.Bc), F(c.f61.Bt), F(c.f61.Br), F(c.f61.Mc120), F(c.EC.ELU), F(c.F61.ELU)]), { small: true });
    const c0 = H.cibles[0].f61;
    comment(`Plaque DKT de ${F0(H.modele.Lm)} m × toute la largeur (${H.modele.nx} × ${H.modele.ny} nœuds), appuyée sur l'axe des poutres, épaissie au droit des tables ; moments m_y à mi-portée des panneaux et au nu des tables par surfaces d'influence, charges au plus défavorable. EC : ${H.nl} voie(s), tandems de ${F0(2 * H.Q1)} et ${F0(2 * H.Q2)} kN, UDL sur les seules parties défavorables, LM2 (essieu ou roue seule), diffusion à 45° jusqu'au feuillet moyen (EN 1991-2 § 4.3.6). Fascicule 61 : δ_B = ${F3(c0.dB)}, δ_M = ${F3(c0.dM)} (L = ${F2(c0.Ld)} m), bc pour ${c0.nfB} file(s). Combinaisons : ELU 1,35 (G + Q) ; F61 1,35 G + 1,605 B ou 1,35 (G + Mc120).`);
    const ligne = (nom, D) => [nom, D.gov.nom, F(D.mom.ELU), F(D.mom.CAR), F(D.mom.FREQ), F(D.AsULS * 1e4, 1), F(D.AsSLS * 1e4, 1), F(D.AsWk * 1e4, 1), F(Math.max(D.as921, D.perFace) * 1e4, 1), F(D.As * 1e4, 1), nappe(D.As)];
    table(['Nappe transversale', 'Section déterminante', 'M_ELU', 'M_car', 'M_fréq', 'A_s ELU', 'A_s σ_s', 'A_s w_k 0,3', 'A_s min', 'A_s retenu [cm²/m]', 'Proposition'], [ligne('inférieure (travée)', H.inf), ligne('supérieure (nu des tables)', H.sup)], { small: true });
    comment(`Section de ${F2(inp.hd)} m, enrobage ${F0((inp.local?.c ?? 0.03) * 100)} cm ; EN 1992-1-1 : ELU (bloc rectangulaire), σ_s ≤ 0,8 f_yk et σ_c ≤ 0,6 f_ck sous caractéristique (§ 7.2), w_k ≤ 0,3 mm sous fréquente (§ 7.3.4), minimums § 9.3.1.1 et 7.3.2. Armatures de répartition longitudinales ≥ 20 % des transversales (§ 9.3.1.1 (2)). Flexion transversale d'ensemble (coefficients μ de Guyon-Massonnet) non superposée.`);
    const P = H.poinc;
    para(`Poinçonnement sous une roue du tandem (EN 1992-1-1 § 6.4.4) : V_Ed = 1,35 × ${F0(H.Q1)} = ${F0(P.VEd)} kN ; contour u₁ = ${F2(P.u1)} m à 2d, d = ${F3(P.d)} m ; v_Rd,c = ${F3(P.vRdc)} MPa → V_Rd,c = ${F0(P.VRdc)} kN : ${P.ok ? 'OK' : 'NON'}.`);
  } else if (H && H.erreur) para(`Hourdis : calcul impossible (${H.erreur}).`);
  if (E) {
    h2('Entretoise d\'about — vérinage pour le remplacement des appareils d\'appui');
    table(['Vérins', 'Force par vérin (G) [kN]', 'M_Ed+ [kN·m]', 'M_Ed− [kN·m]', 'V_Ed [kN]', 'A_s inférieur [cm²]', 'A_s supérieur [cm²]', 'Étriers A_sw/s [cm²/m]', 'Proposition'],
      [[`${E.appuis.length} (à ${F2(E.dv)} m des axes)`, F0(E.verin), F0(E.Mpos), F0(E.Mneg), F0(E.Vmax), F(E.AsInf * 1e4, 1), F(E.AsSup * 1e4, 1), F(E.etriers.AswS * 1e4, 1), etriers(E.etriers.AswS, E.d)]]);
    comment(`Entretoise de ${F2(E.he)} m × ${F2(E.te)} m (travée de ${F2(E.L)} m) : poutre continue sur les vérins, chargée par les réactions des poutres sous charges permanentes (1,35 G, trafic interrompu pendant le vérinage) et son poids propre ; flexion ELU (EN 1992-1-1, α_cc = 0,85), minimum § 9.2.1.1, étriers § 6.2.3. Guide Sétra VIPP § 2.2.4 : deux entretoises d'about, indispensables au vérinage.`);
  }
  const EI = r.entInt;
  if (EI && EI.erreur) para(`Entretoises intermédiaires : calcul impossible (${EI.erreur}).`);
  else if (EI) {
    const ys = r.bd.ys, y0 = ys[0], c = EI.coefLong, code = inp.regBA === 'EC' ? 'EC' : 'BAEL', D = EI[code];
    h2(`Entretoises intermédiaires — méthode de Courbon (dossier Sétra PSI-BA 77, pièce IV § 7)`);
    para(`Entretoise la plus sollicitée : travée ${EI.travee + 1} (${F2(EI.L)} m, ${EI.nEnt} entretoise(s) intermédiaire(s), entraxe λ = ${F3(EI.lam)} m). Section ${F2(EI.b0)} × ${F2(EI.H)} m (hauteur des poutres), table de compression : hourdis de ${F2(EI.hd)} m.`);
    table(['Système', 'Bc (une file)', 'Bt (une file de roues)', 'Br', 'Mc120 (une chenille)', 'A(l) [kN/m par m]', 'Trottoirs [kN/m par m]'],
      [['Charge reportée sur l\'entretoise [kN]', F1(c.Bc * c.deltaB), F1(c.Bt * c.deltaB), F1(c.Br * c.deltaB), F1(c.Mc * c.deltaMc), F1(EI.coefA), F1(c.trott)]], { small: true });
    comment(`Coefficients longitudinaux (PSI-BA § 7.2.1) : une charge à la distance x de l'entretoise, entre les entretoises voisines, agit comme une charge directement appliquée affectée de (1 − |x|/λ). Bc : roue arrière au droit de l'entretoise, les autres roues des deux camions dans les intervalles voisins ; Bt et Br au droit de l'entretoise ; chenille Mc120 centrée ; A(l) et trottoirs (4,5 kN/m², charge locale) sur une bande de 1 m ; δ_B = ${F3(c.deltaB)}, δ_Mc = ${F3(c.deltaMc)} (travée ${EI.travee + 1}). Coefficient transversal : poutres réagissant sur l'entretoise indéformable, R_k = P (1/n + e y_k/Σ y²), charges déplacées par pas de 0,05 m (Bc : files accolées, roue à 0,25 m du bord de la chaussée chargeable ; bc et bt du Fascicule 61 selon le nombre de files).`);
    const sel = EI.moments.filter((q, i) => i % 2 === 0 || ys.some(y => Math.abs(y - q.y) < 1e-6)), Z = x => F0(Math.abs(x) < 0.5 ? 0 : x);
    table(['y [m]', 'G', 'Bc', 'Bt', 'Br', 'Mc120', 'A(l)', 'Trottoirs', 'Car. G + max Q (PSI-BA)', 'M_u F61 max / min', 'M_Ed EC max / min'],
      sel.map(q => [F2(q.y), Z(q.G.nom), Z(q.F61.Bc.max), Z(q.F61.Bt.max), Z(q.F61.Br.max), Z(q.F61.Mc120.max), Z(q.F61.A.max), `${Z(q.F61.trott.max)} / ${Z(q.F61.trott.min)}`, `${Z(q.max.PSIBA)} / ${Z(q.min.PSIBA)}`,
        `${Z(q.max.ELU_F61)} / ${Z(q.min.ELU_F61)}`, `${Z(q.max.ELU_EC)} / ${Z(q.min.ELU_EC)}`]), { small: true });
    B.push({ t: 'svg', svg: courbesX([{ nom: 'M_u max (F61)', pts: EI.moments.map(q => [q.y - y0, q.max.ELU_F61]), c: '#c8552b' }, { nom: 'M_u min (F61)', pts: EI.moments.map(q => [q.y - y0, q.min.ELU_F61]), c: '#1f5fa8' },
      { nom: 'M_Ed max (EC)', pts: EI.moments.map(q => [q.y - y0, q.max.ELU_EC]), c: '#c8552b', dash: true }, { nom: 'M_Ed min (EC)', pts: EI.moments.map(q => [q.y - y0, q.min.ELU_EC]), c: '#1f5fa8', dash: true }],
      { titre: 'Entretoise intermédiaire — enveloppe des moments ELU', unite: 'kN·m', xlab: 'distance à l\'axe de la poutre de rive gauche [m]' }), caption: 'Moments fléchissants dans l\'entretoise (positif : fibre inférieure tendue), Fascicule 61 / BAEL et Eurocodes.' });
    table(['Section', 'G', 'Bc', 'Bt', 'Mc120', 'A(l)', 'V_u F61 [kN]', 'V_Ed EC [kN]'],
      EI.tranchants.map(q => [`poutre ${q.poutre + 1}, côté ${q.cote}`, F0(q.G.nom), F0(Math.max(q.F61.Bc.max, -q.F61.Bc.min)), F0(Math.max(q.F61.Bt.max, -q.F61.Bt.min)), F0(Math.max(q.F61.Mc120.max, -q.F61.Mc120.min)), F0(Math.max(q.F61.A.max, -q.F61.A.min)),
        F0(Math.max(Math.abs(q.max.ELU_F61), Math.abs(q.min.ELU_F61))), F0(Math.max(Math.abs(q.max.ELU_EC), Math.abs(q.min.ELU_EC)))]), { small: true });
    const bar = x => (x ? `${x.n} HA${x.phi}${x.lits > 1 ? ` (${x.lits} lits)` : ''}` : '—');
    const ligne = (Q, nom) => [nom, `${F0(Q.Mpos)} / ${F0(Q.Mneg)}`, `${CM(Q.inf.As)} → ${bar(Q.barresInf)}`, `${CM(Q.sup.As)} → ${bar(Q.barresSup)}`, F0(Q.Vu),
      Q.code === 'BAEL' ? `τ_u = ${F2(Q.V.tau)} ${Q.V.ok ? '≤' : '>'} ${F2(Q.V.tauLim)} MPa` : `V_Rd,max = ${F0(Q.V.VRdmax)} kN${Q.V.ok ? '' : ' < V_Ed'} (cot θ = ${F2(Q.V.cot)})`, `${CM(Q.V.AtSt ?? Q.V.AswS)} → ${etriers(Q.V.AtSt ?? Q.V.AswS, EI.d)}`, CM(Q.ancrage), `${CM(Q.suspente)} (${Q.suspente2HA12} cadres 2 HA12)`, F2(Q.bNec), Q.ok ? 'OK' : 'NON'];
    table(['Entretoise intermédiaire — vérification', 'M_u + / − [kN·m]', 'A inf. [cm²] → barres', 'A sup. [cm²] → barres', 'V_u [kN]', 'Bielles', 'Étriers A_t/s [cm²/m]', 'Ancrage des aciers inf. [cm²]', 'Suspentes par poutre [cm²]', 'Épaisseur nécessaire [m]', 'Résultat'],
      [ligne(EI.BAEL, 'BAEL 91 / Fascicule 61'), ligne(EI.EC, 'EN 1992-1-1 / EN 1991-2')], { small: true });
    comment(`Règlement des plans : ${code === 'EC' ? 'EN 1992-1-1' : 'BAEL 91'}. Flexion : section en T, table b = ${F2(EI.beffB)} m (BAEL A.4.1,3 et PSI-BA : b₀ + 2 × 1/10 de la portée entre poutres de rive, ≤ ½ intervalle entre entretoises) ou b_eff = ${F2(EI.beffE)} m (EN 1992-1-1 § 5.3.2.1, l₀ = 0,85 b₁), d = ${F3(EI.d)} m (lit au-dessus des armatures des poutres) ; moments négatifs (au droit des poutres intérieures) : aciers supérieurs sous les nappes du hourdis, d = ${F3(EI.dSup)} m ; ELS en section fissurée (n = 15). Combinaisons : BAEL 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)], ELS G + max[1,2 (A ou B + trottoirs) ; Mc120 + trottoirs] ; EC 1,35 G + 1,35 max(gr1a ; gr1b). Ancrage par courbure au-delà du nu des poutres de rive : A ≥ V_u/f_su (BAEL A.5.1,312 ; PSI-BA V.1.7.1), F = V_Ed cot θ/2 (EN 1992-1-1 § 9.2.1.4). Suspentes : la réaction de l'entretoise, appliquée en partie basse, est remontée en zone comprimée de la poutre par des étriers (A ≥ V_u/f_su, Fascicule 61 titre VI art. 38, EN 1992-1-1 § 9.2.5), à répartir de part et d'autre de l'entretoise. Charges permanentes : superstructures sur λ et poids propre de l'entretoise (le hourdis descend dans les poutres par les panneaux de dalle). Aciers supérieurs continus d'une poutre de rive à l'autre (porte-étriers).`);
  }
  return B;
}

/** Chaîne VIPP d'une poutre : blocs détaillés. */
export function vippBlocks(v, titre) {
  const B = [], h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const S = v.S, f = S.forme, T = v.dates, M2 = x => F(x, 2), pc = (a, b) => `${F((1 - a / b) * 100, 1)} %`;
  const pr = v.prad;
  h2(`${titre} — conception (${pr ? 'dossier Sétra PRAD 73' : 'guide Sétra VIPP, 1996'})`);
  table(['Niveau', 'Constat', 'Guide'], v.conception.map(d => [d.niveau, d.texte, d.ref]));
  for (const a of v.trace.alerte) para(`ATTENTION — ${pr ? 'torons' : 'câblage'} : ${a}.`);
  h2(`${titre} — section, matériaux et ${pr ? 'torons' : 'câblage'}`);
  para(`Poutre seule : A = ${F3(S.poutre.A)} m², I = ${F(S.poutre.I, 4)} m⁴, v' = ${F3(S.poutre.yG)} m, v = ${F3(S.poutre.vs)} m, épaisseur fictive h₀ = ${F0(S.poutre.h0)} mm. Hourdis : largeur efficace b_eff = ${F2(v.beff)} m (EN 1992-1-1 § 5.3.2.1), A = ${F3(S.hourdis.A)} m², e = ${F3(S.hourdis.e)} m au-dessus de G poutre. Section composée homogène (n = E_cm,h/E_cm,p = ${F3(v.nh)}) : A = ${F3(S.comp.A)} m², I = ${F(S.comp.I, 4)} m⁴, v' = ${F3(S.comp.yG)} m.`);
  para(`Béton de poutre C${v.betons.P.fck} (E_cm = ${F0(v.betons.P.Ecm)} MPa, φ(∞, t₁) = ${F2(v.betons.P.phi)}, ε_cs(∞) = ${F(-v.betons.P.eps * 1e6, 0)} µm/m) ; hourdis C${v.betons.H.fck} (E_cm = ${F0(v.betons.H.Ecm)} MPa, φ = ${F2(v.betons.H.phi)}, ε_cs(∞) = ${F(-v.betons.H.eps * 1e6, 0)} µm/m) — EN 1992-1-1 § 3.1.4 et annexe B. Charges par poutre : poids propre ${F(v.charges.wP)} kN/m, hourdis ${F(v.charges.wH)} kN/m, superstructures ${F(v.charges.wS)} kN/m (part de G de Guyon-Massonnet).`);
  if (pr) {
    table(['Groupe', 'Torons', 'Gainés sur [m]', 'Force appliquée dès [m de l\'appui]', 'y [m]', 'P_m0 après relâchement [kN]', 'Mise en service', 't∞', 'Pertes depuis σ_pi'],
      v.trace.cab.map((cb, ig) => { const q = v.pertes[ig], P0 = cb.n * pr.T.A * pr.sigPi * 1000; return [cb.sup ? 'supérieurs' : ig ? `gainé G${ig}` : 'adhérents', String(cb.n), cb.Lg ? F2(cb.Lg) : '—', F2(cb.xDeb), F3(cb.ym), F0(q.Pinst), F0(q.Pserv), F0(q.Pinf), pc(q.Pinf, P0)]; }), { small: true });
    comment(`Tension sur banc σ_pi = ${F0(pr.sigPi)} MPa (§ 5.10.2.1) ; avant et au relâchement : relaxation ${F(pr.dRel, 1)} MPa (§ 3.3.2), étuvage ${F(pr.dTh, 1)} MPa (0,5 E_p α_c ΔT, § 10.5.2), raccourcissement élastique ${F(pr.sigEl, 1)} MPa (E_p σ_c / E_cm(t), § 5.10.4) → σ_pm0 = ${F0(pr.sigPm0)} MPa. Transmission : f_bpt = η_p1 η₁ f_ctd(t) = ${F2(pr.fbpt)} MPa, l_pt = α₁ α₂ φ σ_pm0 / f_bpt = ${F2(pr.lpt)} m (l_pt1 = ${F2(pr.lpt1)} m, l_pt2 = ${F2(pr.lpt2)} m, § 8.10.2.2) ; ancrage à l'ELU l_bpd = ${F2(v.ancrage.lbpd)} m (§ 8.10.2.3, σ_p∞ = ${F0(v.ancrage.sigPinf)} MPa). Les groupes gainés agissent au-delà de L_g + l_pt/2 − about ; pertes différées par le calcul pas à pas.`);
  } else {
  table(['Câble', 'Famille', 'y mi-travée [m]', 'y ancrage [m]', 'P₀ vérin [kN]', 'Après frottement et recul (mi-travée)', 'λ recul [m]', 'Après mise en tension', 'Mise en service', 't∞', 'Pertes totales'],
    v.pertes.map(q => [String(q.ic + 1), String(q.famille), F3(q.ym), F3(q.ya), F0(q.P0), `${F0(q.Pinst)} (${pc(q.Pinst, q.P0)})`, F(Math.max(...q.lambda), 1), F0(q.PapresTension), F0(q.Pserv), F0(q.Pinf), pc(q.Pinf, q.P0)]), { small: true });
  comment(`Tension au vérin σ_p0 = ${F0(v.sigP0)} MPa${v.sigP0Reduite ? ` (réduite depuis min(0,8 f_pk ; 0,9 f_p0,1k) = ${F0(v.sigP0Max)} MPa pour que la contrainte initiale après frottement et recul ne dépasse pas min(0,75 f_pk ; 0,85 f_p0,1k) = ${F0(v.sigPm0Lim)} MPa, § 5.10.3 (2) ; atteinte : ${F0(v.sigPm0Max)} MPa)` : ` ≤ min(0,8 f_pk ; 0,9 f_p0,1k) (§ 5.10.2.1) ; contrainte initiale maximale après frottement et recul ${F0(v.sigPm0Max)} MPa pour ${F0(v.sigPm0Lim)} MPa admis (§ 5.10.3 (2))`} ; frottement P(x) = P₀ e^(−μ(θ + kx)) (§ 5.10.5.2), recul d'ancrage par égalité des aires (§ 5.10.5.3)${v.trace && v.pertes[0] && v.pertes[0].lambda[1] > 0 ? ` ; mise en tension par les deux extrémités : diagramme pris comme l'enveloppe des deux mises en tension, chacune avec son recul — approximation, exacte tant que les zones de recul ne se recouvrent pas (λ_g + λ_d ≤ L)${v.pertes.some(q => q.lambda[0] + q.lambda[1] > v.L + 1e-6) ? ` ; ATTENTION : ici λ_g + λ_d > L = ${F(v.L, 1)} m pour au moins un câble (λ jusqu'à ${F(Math.max(...v.pertes.flatMap(q => q.lambda)), 1)} m), la force après recul au voisinage de la mi-travée peut s'écarter de quelques % du diagramme réel (ordre des mises en tension) : à confirmer par le programme de mise en tension` : ''}` : ''} ; raccourcissement élastique par mise en tension successive des câbles (§ 5.10.5.1) ; pertes différées par le calcul pas à pas (fluage et retrait des deux bétons, retrait différentiel hourdis-poutre, relaxation § 3.3.2 classe 2, ρ₁₀₀₀ = 2,5 %). Total à t∞ à mi-travée : ${F0(v.Ptot.inf)} kN pour ${F0(v.Ptot.P0)} kN au vérin (${pc(v.Ptot.inf, v.Ptot.P0)} de pertes).`);
  }
  h2(`${titre} — phases de construction`);
  table(['Phase', 't [j]'], v.modele.phases.map(ph => [ph.nom, F(ph.t, 0)]).concat([['Fin de calcul (t∞)', F0(T.fin)]]));
  h2(`${titre} — contraintes normales (MPa, traction positive) à t∞`);
  table(['x [m]', 'Perm. poutre sup.', 'Perm. poutre inf.', 'Perm. hourdis sup.', 'Car. poutre sup.', 'Car. poutre inf.', 'Car. hourdis sup.', 'Fréq. poutre inf.', `Décompression (${v.expo === 'XD' ? 'fréq.' : 'QP'})`],
    v.sections.map(r => [F(r.x, 1), M2(r.perm.ps), M2(r.perm.pi), M2(r.perm.hs), M2(r.car.F.ps), M2(r.car.F.pi), M2(r.car.F.hs), M2(r.freq.F.pi), M2(v.expo === 'XD' ? r.dec.freq : r.dec.qp)]), { small: true });
  const fck = v.betons.P.fck;
  B.push({ t: 'svg', svg: courbesX([
    { nom: 'QP poutre inf.', pts: v.sections.map(r => [r.x, Math.max(r.qp.F.pi, r.qp.S.pi)]), c: '#1f5fa8' },
    { nom: 'Fréq. poutre inf.', pts: v.sections.map(r => [r.x, Math.max(r.freq.F.pi, r.freq.S.pi)]), c: '#1f5fa8', dash: true },
    { nom: 'Car. poutre sup.', pts: v.sections.map(r => [r.x, Math.min(r.car.F.ps, r.car.S.ps)]), c: '#c8552b' },
    { nom: 'QP poutre sup.', pts: v.sections.map(r => [r.x, Math.min(r.qp.F.ps, r.qp.S.ps)]), c: '#c8552b', dash: true },
    { nom: 'Car. hourdis sup.', pts: v.sections.map(r => [r.x, Math.min(r.car.F.hs, r.car.S.hs)]), c: '#2a6b2a' },
  ], { titre: 'Contraintes extrêmes (mise en service et t∞)', lim: [{ v: -0.6 * fck, nom: '−0,6 f_ck' }, { v: -0.45 * fck, nom: '−0,45 f_ck' }, { v: 0, nom: 'décompression' }] }), caption: 'Contraintes le long de la demi-travée : enveloppe de la mise en service (pertes partielles) et de t∞ ; compressions négatives.' });
  h2(`${titre} — vérifications aux états limites de service`);
  table(['Vérification', 'Valeur [MPa]', 'Limite [MPa]', 'x [m]', 'Résultat', 'Référence'], v.verifs.map(q => [q.nom, M2(q.val), M2(q.lim), F(q.x, 1), q.ok ? 'OK' : 'NON', q.ref]));
  if (v.seismeV) { const S = v.seismeV, si = S.site || {}; comment(`Séisme vertical (EN 1998-2 § 4.1.7(2)P, séisme activé dans l'onglet Appuis : zone ${si.zone}, catégorie ${si.categorie}, sol ${si.classeSol}, ξ = 2 %) : travée isostatique de masse ${F(S.m, 2)} t/m (charges permanentes de la poutre), EI = ${F0(S.EI)} kN·m² ; modes symétriques ${S.modes.map(m => `n = ${m.n} : T = ${F(m.T, 3)} s, S_ve = ${F2(m.S)} m/s²`).join(' ; ')} ; M_n(x) = 4 m S_n L² sin(nπx/L)/(n³π³), combinaison quadratique ; M_Ez = ${F0(S.MEzMax)} kN·m à mi-travée. Contraintes sous G + P ± E_z (mise en service et t∞) dans le tableau ci-dessus ; ELU G + E_z : M_Ed = ${F0(S.eluPire.MEdE)} ≤ M_Rd = ${F0(S.eluPire.MRd)} kN·m — ${S.eluOk ? 'vérifié' : 'NON vérifié'}.`); }
  comment(v.rail ? 'Section non fissurée, parties de section prises séparément (poutre, hourdis) pour les actions permanentes et la précontrainte (calcul par phases), section composée homogène (E_cm) pour le trafic ferroviaire. Combinaisons EN 1990 A2 (tableau A2.3) : caractéristique G + P + max Q_g ; fréquente G + P + max ψ₁,g Q_g (0,8 une voie, 0,7 deux voies) ; quasi permanente G + P (ψ₂ = 0) ; Q_g : groupes du tableau 6.11 de l\'EN 1991-2, Φ inclus. Gradient thermique non linéaire (EN 1991-1-5) non inclus : sur une travée isostatique la part linéaire ne crée pas de contrainte.'
    : 'Section non fissurée, parties de section prises séparément (poutre, hourdis) pour les actions permanentes et la précontrainte (calcul par phases), section composée homogène (E_cm) pour le trafic. Combinaisons EN 1990 A2 : caractéristique G + P + max(gr1a ; gr1b) ; fréquente G + P + max(0,75 TS + 0,4 UDL + 0,4 trottoirs ; 0,75 LM2) ; quasi permanente G + P (ψ₂ = 0). Gradient thermique non linéaire (EN 1991-1-5) non inclus : sur une travée isostatique la part linéaire ne crée pas de contrainte.');
  h2(`${titre} — ELU de flexion`);
  if (v.rail) table(['x [m]', 'M_Ed [kN·m]', 'M_Rd [kN·m]', 'A_s passif [cm²]', 'x/d', 'Résultat'], v.elu.map(e => [F(e.x, 1), F0(e.MEdE), F0(e.MRd), F(e.As * 1e4, 1), F2(e.xd), e.ok ? 'OK' : 'NON']));
  else table(['x [m]', 'M_Ed EC [kN·m]', 'M_Ed F61 [kN·m]', 'M_Rd [kN·m]', 'A_s passif [cm²]', 'x/d', 'Résultat'], v.elu.map(e => [F(e.x, 1), F0(e.MEdE), F0(e.MEdF), F0(e.MRd), F(e.As * 1e4, 1), F2(e.xd), e.ok ? 'OK' : 'NON']));
  comment(`${v.rail ? 'ELU : 1,35 G + max γ_g Q_g (γ = 1,45 ; 1,20 pour les groupes contenant SW/2 ; EN 1990 tableau A2.4(B)), Φ inclus' : 'EC : 1,35 G + 1,35 max(gr1a ; gr1b) ; Fascicule 61 : 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)]'}. Résistance : bloc rectangulaire 0,8 x, f_cd = 0,85 f_ck/1,5 (hourdis puis poutre selon le contour réel), câbles avec allongement préalable ε_pm∞ et palier f_pd = f_p0,1k/1,15 = ${F0(1640 / 1.15)} MPa, armatures passives f_yd = 435 MPa ; A_s ≥ A_s,min = 0,26 f_ctm/f_yk b_t d (§ 9.2.1.1, b_t = talon). La rupture fragile (EN 1992-2 § 6.1 (109)) est couverte par ce minimum lorsque les câbles restent adhérents.`);
  if (v.elu && v.elu.length > 1) B.push({ t: 'svg', svg: courbesX([
    { nom: 'M_Ed EC', pts: v.elu.map(e => [e.x, e.MEdE]), c: '#c8552b' },
    ...(v.rail ? [] : [{ nom: 'M_Ed F61', pts: v.elu.map(e => [e.x, e.MEdF]), c: '#c8552b', dash: true }]),
    { nom: 'M_Rd', pts: v.elu.map(e => [e.x, e.MRd]), c: '#1f5fa8' },
  ], { titre: 'Moments ELU et moment résistant le long de la demi-travée', unite: 'kN·m' }), caption: 'Moment de calcul ELU (enveloppe des combinaisons) et moment résistant de la section composée (câbles, armatures passives) le long de la demi-travée.' });
  h2(`${titre} — effort tranchant et étriers (EN 1992-1-1 § 6.2.3)`);
  table(['x [m]', 'V_Ed [kN]', 'V_pd [kN]', 'V_Ed − V_pd', 'b_w,nom [m]', 'σ_cp [MPa]', 'cot θ', 'V_Rd,max [kN]', 'A_sw/s [cm²/m]', 'Proposition', 'Résultat'],
    v.tranchant.map(t => [F(t.x, 1), F0(t.VEd0), F0(t.Vpd), F0(t.VEd), F3(t.bwn), F2(t.scp), F2(t.cot), F0(t.VRdmax), F(t.AswS * 1e4, 1), etriers(t.AswS, t.z / 0.9), t.ok ? 'OK' : 'NON']), { small: true });
  if (v.tranchant.length > 1) B.push({ t: 'svg', svg: courbesX([
    { nom: 'V_Ed − V_pd', pts: v.tranchant.map(t => [t.x, t.VEd]), c: '#c8552b' },
    { nom: 'V_Ed (brut)', pts: v.tranchant.map(t => [t.x, t.VEd0]), c: '#c8552b', dash: true },
    { nom: 'V_pd (câbles)', pts: v.tranchant.map(t => [t.x, t.Vpd]), c: '#2a6b2a', dash: true },
    { nom: 'V_Rd,max (cot θ)', pts: v.tranchant.map(t => [t.x, t.VRdmax]), c: '#1f5fa8' },
  ], { titre: 'Effort tranchant ELU le long de la demi-travée', unite: 'kN' }), caption: 'Effort tranchant de calcul diminué de la part reprise par l\'inclinaison des câbles (V_Ed − V_pd, à comparer à V_Rd,max), effort brut pour mémoire et résistance des bielles V_Rd,max pour le cot θ retenu (réduit de 2,5 vers 1 jusqu\'à vérification, EN 1992-1-1 § 6.2.3).' });
  comment(('Effort tranchant de la poutre : V du tablier × coefficient de répartition de Guyon-Massonnet (mi-travée) ; poutres de rive, à l\'appui : le plus grand de ce coefficient et de celui de la règle des bras de levier (charges en console descendant directement dans la poutre de rive), raccordé à Guyon-Massonnet sur une longueur égale à la largeur du tablier — hypothèse prudente de PSIDA. ' + (v.rail ? 'V_Ed = 1,35 V_G + max γ_g V_g (groupes ferroviaires, Φ inclus) ;' : 'V_Ed = 1,35 V_G + 1,35 max(V_gr1a ; V_gr1b) ;') + ' V_pd = Σ P∞ sin α (composante verticale des câbles relevés, § 6.2.1 (1)) ; b_w,nom = b_w − ½ φ_gaine (gaines métalliques injectées, § 6.2.3 (6)) — âme épaissie (blochet) près des appuis ; α_cw selon σ_cp = P∞/A_c (§ 6.2.3 (3)) ; z = 0,9 d ; minimum ρ_w,min = 0,08 √f_ck/f_yk. Effort de traction supplémentaire ΔF_td = ½ V_Ed (cot θ − cot α) à ancrer dans le talon (§ 6.2.3 (7)).'));
  h2(`${titre} — flèches à mi-travée (mm, vers le bas positives)`);
  table([pr ? 'Après relâchement' : 'Après 1re famille', pr ? 'Hourdis coulé' : 'Hourdis coulé (avant 2e famille)', pr ? 'Hourdis durci' : 'Après 2e famille', 'Mise en service', 't∞', 'Trafic caractéristique (E_cm)'], [[F(v.fleches.tension * 1000, 1), F(v.fleches.hourdis * 1000, 1), F(v.fleches.famille2 * 1000, 1), F(v.fleches.service * 1000, 1), F(v.fleches.infini * 1000, 1), F(v.fleches.trafic * 1000, 1)]]);
  comment(`Valeurs négatives : contre-flèche (poutre relevée par la précontrainte). La flèche à t∞ sous charges permanentes (${F(v.fleches.infini * 1000, 1)} mm) donne la contre-flèche de coffrage éventuelle ; trafic : L/${F0(v.L / Math.max(v.fleches.trafic, 1e-6))}.`);
  h2(`${titre} — quantités`);
  para(`Béton de poutre ${F(v.quantites.volP, 1)} m³ ; précontrainte ${F0(v.quantites.kgP)} kg, soit ${F0(v.quantites.ratioP)} kg par m³ de béton du tablier (poutre + hourdis)${pr ? '' : ' — guide : ≈ 40 kg/m³'}.`);
  return B;
}

/**
 * Indications « → à modifier » (interface seulement) : `reco` = résultat de recommandationsPoutres ; rend la fonction
 * qui donne l'indication d'une ligne { si, type, k, nom | x | texte }, et le paragraphe de synthèse à placer en tête.
 */
function indications(reco, para) {
  if (!reco) return null;
  const ind = indicationsParCible(reco.items), s = reco.synthese;
  if (reco.items.length) para(`${reco.items.length} vérification(s) non satisfaite(s) ou alerte(s) : sous chaque « NON », la donnée à modifier et la valeur qui suffit (cherchée par recalcul du modèle) ; détail, règles et autres solutions dans « Recommandations » (en-tête).`,
    s ? { texte: `${s.texte} : ${texteChamps(s.champs)}`, champs: s.champs } : null);
  else para('Toutes les vérifications des poutres sont satisfaites.');
  return c => ind.get(cleCible(c)) || null;
}
/** Indications sur les blocs détaillés d'une poutre VIPP / PRAD (vérifications ELS, ELU, effort tranchant, tracé). */
function indiquerVipp(B, v, si, k, hint) {
  if (!hint) return B;
  for (const b of B) {
    if (b.t === 'table' && b.head[0] === 'Vérification') b.hints = v.verifs.map(q => (q.ok ? null : hint({ si, type: 'verif', k, nom: q.nom })));
    else if (b.t === 'table' && b.head.includes('M_Rd [kN·m]')) b.hints = v.elu.map(e => (e.ok ? null : hint({ si, type: 'elu', k, x: e.x })));
    else if (b.t === 'table' && b.head.includes('V_Rd,max [kN]')) b.hints = v.tranchant.map(t => (t.ok ? null : hint({ si, type: 'tranchant', k, x: t.x })));
    else if (b.t === 'p' && b.text.startsWith('ATTENTION — ')) b.hint = hint({ si, type: 'trace', texte: b.text.replace(/^ATTENTION — [^:]*: /, '').replace(/\.$/, '') });
  }
  const iS = B.findIndex(b => b.t === 'comment' && /^Séisme vertical/.test(b.text));
  if (v.seismeV && !v.seismeV.eluOk && iS >= 0) B.splice(iS + 1, 0, { t: 'p', text: 'Séisme vertical, ELU G + E_z : NON', hint: hint({ si, type: 'seismeElu', k }) });
  return B;
}
/** Indications du tableau des déformations sous rail (mêmes lignes, dans le même ordre, que deformationsBlocks). */
function indiquerDefo(B, D, si, hint) {
  const t = hint && D && !D.erreur ? B.find(b => b.t === 'table' && b.head[0] === 'Vérification' && b.head[3] === 'Verdict') : null;
  if (!t) return B;
  const h = (ok, nom) => (ok ? null : hint({ si, type: 'defo', nom }));
  const T = D.transversal;
  t.hints = [...D.fleches.map(f => h(f.ok, 'fleche')), h(D.gauche.ok, 'gauche'), ...D.confort.map(c => h(!c.horsDomaine && c.ok, 'confort')),
    ...D.extremites.flatMap(e => [h(e.okH, 'dH'), h(e.about > 0 && e.okV, 'dV')]),
    ...(T ? T.rows.flatMap(x => [h(x.thetaH <= T.lim.thetaH + 1e-12 || x.rayon >= T.lim.rayon, 'transv'), h(x.fh != null && x.fh >= T.fh0, 'fh')]) : [])];
  return B;
}
/** Indication du poinçonnement du hourdis (paragraphe de localBlocks). */
function indiquerHourdis(B, hint) {
  if (hint) for (const b of B) if (b.t === 'p' && /^Poinçonnement sous une roue/.test(b.text) && /: NON\.$/.test(b.text)) b.hint = hint({ type: 'poinc' });
  if (hint) for (const b of B) if (b.t === 'table' && b.head[0] === 'Entretoise intermédiaire — vérification') b.hints = b.rows.map(row => (row[row.length - 1] === 'NON' ? hint({ type: 'entInt' }) : null));
  return B;
}

export function beamsBlocks(r, { reco = null } = {}) {
  if (r.rail) return beamsBlocksRail(r, { reco });
  const B = [], h2 = text => B.push({ t: 'h2', text }), para = (text, hint) => B.push({ t: 'p', text, ...(hint ? { hint } : {}) }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const hint = indications(reco, para), hints = (l, f) => (hint ? { hints: l.map(f) } : {});
  const inp = r.inp, sec = r.sec;
  h2('Section et paramètres de Guyon-Massonnet');
  para(`${inp.n} poutres d'entraxe ${F2(inp.b1)} m (largeur active 2b = ${F2(inp.n * inp.b1)} m), hourdis ${F2(inp.hd)} m ; poutre + hourdis : A = ${F3(sec.A)} m², I = ${F(sec.I, 4)} m⁴, K = ${F(sec.K, 5)} m⁴${sec.v ? `, v = ${F3(sec.v)} m, v' = ${F3(sec.vp)} m` : ''}.`);
  table(['Travée L [m]', 'θ', 'α', 'Classe F61', 'δ_B', 'δ_C'], r.spans.map(s => [F2(s.L), F3(s.theta), F3(s.alpha), String(s.classe), F3(s.deltaB), F3(s.deltaC)]));
  if (r.spans[0].gp) {
    table(['Travée L [m]', 'b = n b₁/2 [m]', 'ρ_p = I_p/b₁ [m³]', 'γ_p = K_p/(2 b₁) [m³]', 'ρ_e = h_d³/12 [m³]', 'γ_e = h_d³/12 [m³]', 'L de Guyon [m]', 'G de la travée [kN]', 'Voies (largeur v)', 'a₂ = v₀/v', 'A(l) = 230 + 36 000/(L + 12) [kN/m²]'],
      r.spans.map(s => { const g = s.gp, f = s.f61info || {}, v0 = { 1: 3.5, 2: 3.0, 3: 2.75 }[s.classe] ?? 3.5; return [F2(s.L), F2(g.b), F(g.rhoP, 5), F(g.gammaP, 5), F(g.rhoE, 5), F(g.gammaE, 5), F2(g.Lguyon), F0(f.G), f.nv ? `${f.nv} (${F2(f.v)} m)` : '—', f.v ? F3(v0 / f.v) : '—', F3((230 + 36000 / (s.L + 12)) * 9.81 / 1000)]; }), { small: true });
    comment(`Détail du calcul : rigidités par unité de largeur (E et G = E/2 en facteur commun, sans effet sur θ et α) ; K_p = Σ k b t³ des rectangles de la poutre + b₁ h_d³/6 pour le hourdis (Saint-Venant). θ = (b/L)(ρ_p/ρ_e)^¼ ; α = (γ_p + γ_e)/(2√(ρ_p ρ_e)), toujours compris entre 0 et 1 (α = 1 pour une dalle isotrope) : une valeur supérieure à 1 signale une erreur sur les inerties de torsion. Coefficients de majoration dynamique du Fascicule 61 (art. 5.5) : δ = 1 + 0,4/(1 + 0,2 L) + 0,6/(1 + 4 G/S), G poids de la travée, S poids maximal des essieux B (b_c inclus) ou du char Mc120 que l'on peut placer sur la travée. A(l) pour la longueur chargée la plus défavorable (ici la travée), pondéré par a₁ (classe, nombre de voies chargées) et a₂ = v₀/v, et au moins (4 − 0,002 L) kN/m².`);
  }
  comment('θ = (b/L)(ρ_p/ρ_e)^¼, α = (γ_p + γ_e)/(2√(ρ_p ρ_e)), ρ_p = I_p/b₁, γ_p = K_p/(2 b₁) (G = E/2), hourdis ρ_e = γ_e = h_d³/12 ; répartition transversale de Guyon-Massonnet avec l\'interpolation de Massonnet K = K₀ + (K₁ − K₀)√α (pratique PONTYPE/PAP, reproduite sur le Pont de Noé). M_poutre = K̄(y_k) M/n, charges placées transversalement au plus défavorable pour chaque poutre.');
  if (r.spans.some(s => s.grillage)) {
    h2('Répartition transversale par grillage (poutres + hourdis + entretoises)');
    for (const s of r.spans.filter(q => q.grillage)) {
      const G = s.grillage, n = inp.n;
      table(['Charge sur la poutre', ...Array.from({ length: n }, (_, k) => `K̄ poutre ${k + 1}`)], G.comparaison.map((c, i) => [`P${i + 1} (y = ${F2(c.e)} m)`, ...c.grillage.map((v, k) => `${F3(v)} (${F3(c.reference[k])})`)]), { small: true });
      comment(`Travée ${F2(s.L)} m : grillage de ${n} poutres × ${G.m} éléments (${G.N} degrés de liberté), barres transversales du hourdis (E Δx h_d³/12, G Δx h_d³/6)${G.ents.length ? `, ${G.ents.length} entretoise(s) intermédiaire(s) en x = ${G.ents.map(e => F2(e.x)).join(' ; ')} m (âme ${F2(G.ents[0].b0)} × ${F2(G.ents[0].he)} m, table participante ${F2(G.ents[0].beff)} m : I = ${F(G.ents[0].I, 4)} m⁴ hors hourdis)` : ''} ; appuis w = θ_x = 0 (entretoises d'about), G = E/2. Charge-ligne sinusoïdale en y = e (premier harmonique), K̄_k = n M_k/ΣM à mi-travée ; entre parenthèses : ${G.reference} au même point. Les efforts par poutre ci-dessous utilisent les coefficients du grillage (Hambly, Bridge Deck Behaviour, 1991, chap. 3).`);
    }
  }
  if (r.spans.some(s => s.skew && s.skew.actif)) {
    h2(`Biais ψ = ${F0(inp.biais)} gr — effort tranchant et réactions à l'angle obtus`);
    table(['Travée L [m]', 'θ [°]', 'K_g [m⁴]', 'F_V (V et R des poutres de rive, trafic)', 'r_M (pour mémoire, non appliqué)'], r.spans.map(s => [F2(s.L), F1(s.skew.theta), F3(s.skew.Kg), F3(s.skew.Fv), F3(s.skew.rM)]));
    if (r.appareils) table(['Ligne', 'Appareil le plus chargé : car. EC [kN]', 'ELU EC [kN]', 'G min [kN]', 'Poutre'], r.appareils.lignes.map(l => [String(l.i + 1), F0(l.car), F0(l.elu), F0(l.gmin), l.poutre != null ? String(l.poutre + 1) : '—']), { small: true });
    comment(`Coefficients de l'AASHTO LRFD (§ 4.6.2.2.3c et 4.6.2.2.2e, tabliers béton sur poutres béton, domaine 0 ≤ θ ≤ 60°, N_b ≥ 4), ni l'Eurocode ni le guide Sétra VIPP ne donnant de règle : F_V = 1 + 0,20 (L t_s³/K_g)^0,3 tan θ, θ = (100 − ψ) × 0,9° compté depuis la normale à l'axe, K_g = n (I_b + A_b e_g²) de la poutre seule (${inp.KgSource || '—'}). F_V majore la part du trafic de l'effort tranchant et de la réaction des poutres de rive à l'appui, décroissant linéairement jusqu'à la mi-travée (hypothèse PSIDA) ; la réduction des moments r_M = 1 − c₁ (tan θ)^1,5 n'est pas appliquée (prudent). La somme des réactions d'une ligne est inchangée (angle aigu déchargé) : la réaction de l'appareil le plus chargé ci-dessus peut être reportée dans le champ « réactions imposées » de l'onglet Appuis (${r.appareils ? r.appareils.texte : ''}). ${r.spans.flatMap(s => s.skew.notes).filter((t, i, a) => a.indexOf(t) === i).join(' ; ')}`);
  }
  for (const [si, s] of r.spans.entries()) {
    h2(`Travée de ${F2(s.L)} m — moments ${s.continu ? `positifs maximaux (x = ${F2(s.beams[0].xMax)} m)` : 'à mi-travée'} par poutre [kN·m] et coefficients de répartition`);
    const ids = ['G', 'A', 'Bc', 'Bt', 'Mc120', 'D240', 'trott', 'gr1a', 'gr1b'].filter(id => s.beams[0].mid[id] !== undefined);
    const lab = { G: 'Permanentes', A: 'A(l)', Bc: 'Bc', Bt: 'Bt', Mc120: 'Mc120', D240: 'D240', trott: 'Trottoirs', gr1a: 'EC gr1a', gr1b: 'EC gr1b' };
    table(['Poutre (y [m])', ...ids.map(i => lab[i])], s.beams.map(b => [`${b.k + 1} (${F2(b.y)})`, ...ids.map(i => `${F0(b.mid[i])}${i !== 'G' ? ` (η ${F3(b.eta[i])})` : ''}`)]), { small: true });
    const etaA = (b, i) => (b.etaV && b.etaV[i] != null ? `${F3(b.etaV[i])}${b.etaL && b.etaL[i] != null && b.etaV[i] > b.eta[i] + 1e-9 ? ' (levier)' : ''}` : '—');
    table(['Poutre', 'ELS F61', 'ELU F61', 'ELS car. EC', 'ELU EC', 'V Bc appui [kN]', 'V gr1a appui [kN]', 'η à l\'appui G / gr1a'], s.beams.map(b => [String(b.k + 1), F0(b.comb.ELS_F61), F0(b.comb.ELU_F61), F0(b.comb.ELS_EC), F0(b.comb.ELU_EC), F0(b.V0.Bc), F0(b.V0.gr1a), `${etaA(b, 'G')} / ${etaA(b, 'gr1a')}`]));
    comment('Fascicule 61 / BAEL : ELS G + max[1,2 (A ou B + trottoirs) ; Mc120 + trottoirs] ; ELU 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)] (pratique PAP). Eurocodes : ELU 1,35 G + 1,35 max(gr1a ; gr1b). Efforts tranchants par poutre = V du tablier × η / n (δ inclus pour B et Mc120) ; poutres de rive, à l\'appui : η = max(Guyon-Massonnet ; règle des bras de levier), raccordé à Guyon-Massonnet sur la largeur du tablier (« levier » : la règle des bras de levier commande) ; poutres intérieures : Guyon-Massonnet (pratique PAP).');
    if (s.deversement && !s.deversement.erreur) {
      const D = s.deversement, Lv = D.levage, Po = D.pose, C = Lv.contraintes, okS = q => (q ? 'OK' : 'NON');
      h2(`Travée de ${F2(s.L)} m — stabilité latérale de la poutre en phase de pose (déversement, méthode de Mast)`);
      table(['Phase', 'z₀ [mm]', 'e_i [mm]', 'y_r ou y [m]', 'θ_max fissuration [rad]', 'FS fissuration (≥ 1,0)', 'FS rupture / renversement (≥ 1,5)'], [
        ['Levage (points à ' + F2(Lv.a) + ' m des extrémités)', F1(Lv.z0 * 1000), F1(D.ei * 1000), F2(Lv.yr), F3(Lv.thetaMax), `${F2(Lv.FSc)} ${okS(Lv.okC)}`, `${F2(Lv.FSf)} ${okS(Lv.okF)}`],
        ...(Po ? [[`Posée sur appareils ${D.appareil} (r = K_θ/W = ${F2(Po.r)} m, dévers ${F(Po.alpha * 100, 1)} %)`, F1(Po.z0 * 1000), F1(D.ei * 1000), F2(Po.yb), F3(Po.thetaMax), `${F2(Po.FSc)} ${okS(Po.okC)}`, `${F2(Po.FSr)} ${okS(Po.okR)}`]] : [])]);
      table(['Contraintes au levage [MPa] (poids × 1 ± 0,15)', 'Fibre sup.', 'Fibre inf.', 'Limites'], [
        ['Milieu', `${F2(C.supMin)} à ${F2(C.supMax)}`, `${F2(C.infMin)} à ${F2(C.infMax)}`, `−0,6 f_ck(t) = ${F2(C.limC)} ; f_ctm(t) = ${F2(C.limT)}`],
        ['Points de levage', F2(C.supLev), F2(C.infLev), okS(Lv.okS)]], { small: true });
      if (D.ec2) para(`EN 1992-1-1 § 5.9 (3), expression (5.40b) (situation transitoire) : l₀t/b = ${F2(D.ec2.l0t)}/${F2(D.ec2.l0t / D.ec2.rapport)} = ${F1(D.ec2.rapport)} ${D.ec2.rapport <= D.ec2.lim ? '≤' : '>'} 70/(h/b)^⅓ = ${F1(D.ec2.lim)}, h/b = ${F2(D.ec2.hb)} ${D.ec2.hb <= 3.5 ? '≤' : '>'} 3,5 : ${D.ec2.ok ? 'effets du second ordre négligeables' : 'critère simplifié non satisfait, la stabilité repose sur le calcul de Mast ci-dessus'}.`);
      comment(`Méthode de Mast (PCI Journal 1989 et 1993 ; PCI CB-02-16, 2016), l'EN 1992-1-1 § 5.9 ne donnant pour le transport et le montage qu'un critère d'élancement : poutre seule de ${F2(D.L)} m, poids ${F2(D.w)} kN/m, I_y = ${F(D.Iy, 4)} m⁴ (axe faible, contour exact), béton à t₁ = ${F1(D.t1)} j (f_ck(t) et f_ctm(t) de l'EN 1992-1-1 § 3.1.2), précontrainte de ${s.beams[0].vipp.prad ? 'relâchement' : '1re famille'} ${F0(D.P)} kN. Excentricité initiale e_i = ⅔ × L/960 (tolérance de rectitude) + 6 mm (points de levage). Levage : FS_c = 1/(z₀/y_r + θ_i/θ_max), θ_max = (f_ctm − σ_haut)/(M_g (b_t/2)/I_y) (fissuration du coin de la table, σ_haut = ${F2(Lv.sigHaut)} MPa), FS_f = y_r θ'/(z₀(1 + 2,5 θ') θ' + e_i), θ' = 0,4 rad. Posée : raideur de rotation des deux appareils NF EN 1337-3 (M = G a'⁵ b' α/(n t³ K_s), a' en travers de la poutre), FS_c = r(θ_max − α)/(z₀ θ_max + e_i + y θ_max), renversement au bord de l'appareil θ' = (a'/2 − h α)/r. Vent et transport routier non examinés.${D.notes.length ? ' ' + D.notes.join(' ; ') + '.' : ''}`);
    }
    if (s.beams[0].vipp) {
      table(['Poutre', 'Superstructures [kN/m]', 'P∞ mi-travée [kN]', 'Pertes', 'σ inf. QP t∞ [MPa]', 'σ sup. car. [MPa]', 'M_Ed / M_Rd mi-travée', 'A_sw/s appui [cm²/m]', 'Flèche t∞ [mm]', 'Résultat'],
        s.beams.map(b => { const v = b.vipp, m = v.sections[v.sections.length - 1], e = v.elu[v.elu.length - 1]; return [String(b.k + 1), F(v.charges.wS), F0(v.Ptot.inf), `${F((1 - v.Ptot.inf / v.Ptot.P0) * 100, 1)} %`, F2(m.qp.F.pi), F2(Math.min(m.car.F.ps, m.car.S.ps)), `${F0(e.MEd)} / ${F0(e.MRd)}`, F(v.tranchant[0].AswS * 1e4, 1), F(v.fleches.infini * 1000, 1), v.ok ? 'OK' : 'NON']; }), hints(s.beams, b => (b.vipp.ok ? null : hint({ si, type: 'poutre', k: b.k }))));
      comment('Chaîne complète pour chaque poutre (même câblage) : détail ci-dessous pour la poutre la plus sollicitée (moment ELU à mi-travée).');
      const gov = s.beams.reduce((a, b) => (b.vipp.elu[b.vipp.elu.length - 1].MEd > a.vipp.elu[a.vipp.elu.length - 1].MEd || (!b.vipp.ok && a.vipp.ok) ? b : a));
      B.push(...indiquerVipp(vippBlocks(gov.vipp, `Poutre ${gov.k + 1}`), gov.vipp, si, gov.k, hint));
    } else if (inp.type === 'BA') {
      table(['Poutre', 'M_u F61 [kN·m]', 'A_s BAEL [cm²]', 'M_u EC [kN·m]', 'A_s EC2 [cm²]', 'Mode'], s.beams.map(b => [String(b.k + 1), F0(b.MuF), CM(b.BA.BAEL.As), F0(b.MuE), CM(b.BA.EC.As), b.BA.EC.mode]), hints(s.beams, b => hint({ si, type: 'BA', k: b.k })));
      if (s.beams[0].BA.ELS) {
        const ok = q => (q ? 'OK' : 'NON'), l0 = s.beams[0].BA.ELS.BAEL.lim;
        table(['Poutre', 'M_ser F61 [kN·m]', `A_s ELS BAEL [cm²] (σ̄_s = ${Number.isFinite(l0.sigS) ? F1(l0.sigS) : '—'} MPa)`, 'σ_bc [MPa] / 0,6 f_c28', 'M_car EC [kN·m]', 'A_s ELS EC2 [cm²] (0,8 f_yk)', 'σ_c [MPa] / 0,6 f_ck', 'A_s retenu BAEL / EC2 [cm²]'],
          s.beams.map(b => { const E = b.BA.ELS; return [String(b.k + 1), F0(E.BAEL.Mser), E.BAEL.libre ? '— (σ_s non limitée)' : CM(E.BAEL.As), `${F2(E.BAEL.sigC)} / ${F1(E.BAEL.lim.sigC)} ${ok(E.BAEL.okC)}`, F0(E.EC.Mser), CM(E.EC.As), `${F2(E.EC.sigC)} / ${F1(E.EC.lim.sigC)} ${ok(E.EC.okC)}`, `${CM(b.BA.retenu.BAEL)} / ${CM(b.BA.retenu.EC)}`]; }), { small: true, ...hints(s.beams, b => (b.BA.ELS.BAEL.okC && b.BA.ELS.EC.okC ? null : hint({ si, type: 'BAels', k: b.k }))) });
        comment(`États limites de service (section en T fissurée, table b₁ × h_d, âme b₀, n = 15, béton tendu négligé ; A_s calculée pour atteindre exactement σ̄_s, sans bras de levier forfaitaire) : ${l0.ref} ; ${s.beams[0].BA.ELS.EC.lim.ref}. La section retenue est le maximum de l'ELU et de l'ELS : en fissuration préjudiciable, l'ELS gouverne le plus souvent les poutres en béton armé.`);
        table(['Poutre', 'V_u à l\'appui (BAEL) [kN]', 'τ_u [MPa]', 'τ̄_u [MPa]', 'A_t/s_t [cm²/m]', 's_t max [cm]', 'Résultat'],
          s.beams.map(b => { const V = b.BA.cisaillementBAEL; return [String(b.k + 1), F0(V.Vu), F2(V.tau), F2(V.tauLim), F(V.AtSt * 1e4, 1), F0(V.stMax * 100), ok(V.ok)]; }), { small: true, ...hints(s.beams, b => (b.BA.cisaillementBAEL.ok ? null : hint({ si, type: 'BAtau', k: b.k }))) });
        comment('BAEL 91 A.5.1 : V_u = 1,35 V_G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)], efforts tranchants de chaque poutre (poutres de rive : max(Guyon-Massonnet ; bras de levier) à l\'appui, δ inclus) ; τ_u = V_u/(b₀ d) ≤ min(0,15 f_c28/γ_b ; 4 MPa) (fissuration préjudiciable ; 0,20 et 5 MPa si peu préjudiciable) ; A_t/(b₀ s_t) ≥ γ_s (τ_u − 0,3 f_t28)/(0,9 f_e), ≥ 0,4 MPa/f_e ; s_t ≤ min(0,9 d ; 40 cm). Répartir l\'effort tranchant également entre les poutres sous-estime la poutre de rive.');
      }
      comment(`Poutre en T à l'ELU : table b_eff = b₁ = ${F2(inp.b1)} m, h_f = ${F2(inp.hd)} m, âme b₀ = ${F2(inp.b0)} m, d = H − ${F2(inp.cover)} m ; diagramme rectangulaire ; minimum de non-fragilité.`);
      const gov = s.beams.reduce((a, b) => (b.MuE > a.MuE ? b : a));
      if (gov.BA.travee) {
        table(['x [m]', 'M_Ed [kN·m]', 'A_s [cm²]', 'V_Ed [kN]', 'cot θ', 'V_Rd,max [kN]', 'A_sw/s [cm²/m]', 'Proposition', 'Résultat'], gov.BA.travee.map(t => [F(t.x, 1), F0(t.MEd), CM(t.As), F0(t.VEd), F2(t.V.cot), F0(t.V.VRdmax), F(t.V.AswS * 1e4, 1), etriers(t.V.AswS, (sec.H || 2) - inp.cover), t.V.ok ? 'OK' : 'NON']), hints(gov.BA.travee, t => (t.V.ok ? null : hint({ si, type: 'BAV', k: gov.k, x: t.x }))));
        comment(`Poutre ${gov.k + 1} (la plus sollicitée), le long de la demi-travée : armatures inférieures pour l'enveloppe des ELU (EC et Fascicule 61) ; étriers EN 1992-1-1 § 6.2.3 avec V_Ed = 1,35 V_G + 1,35 max(V_gr1a ; V_gr1b), z = 0,9 d, b_w = b₀.`);
        B.push({ t: 'svg', svg: courbesX([{ nom: 'M_Ed', pts: gov.BA.travee.map(t => [t.x, t.MEd]), c: '#c8552b' }], { titre: `Poutre ${gov.k + 1} — moment ELU ${s.continu ? 'positif le long de la travée' : 'le long de la demi-travée'}`, unite: 'kN·m', ...(s.continu ? { xlab: 'x depuis l\'appui gauche de la travée [m]' } : {}) }), caption: 'Enveloppe ELU des moments (Eurocodes et Fascicule 61).' });
        B.push({ t: 'svg', svg: courbesX([{ nom: 'V_Ed', pts: gov.BA.travee.map(t => [t.x, t.VEd]), c: '#c8552b' }, { nom: 'V_Rd,max', pts: gov.BA.travee.map(t => [t.x, t.V.VRdmax]), c: '#1f5fa8' }], { titre: `Poutre ${gov.k + 1} — effort tranchant ELU`, unite: 'kN', ...(s.continu ? { xlab: 'x depuis l\'appui gauche de la travée [m]' } : {}) }), caption: 'Effort tranchant ELU et résistance des bielles.' });
      }
    } else {
      table(['Poutre', 'P∞ [kN]', 'P min (Guyon) [kN]', 'σ sup / inf à vide [MPa]', 'σ sup / inf en charge [MPa]', 'BPEL classe II', 'EC2 (décompression QP, 0,6 f_ck)'], s.beams.map(b => [String(b.k + 1), F0(inp.P), F0(b.BP.BPEL.Pmin), `${MPa(b.BP.BPEL.aVide.sup)} / ${MPa(b.BP.BPEL.aVide.inf)}`, `${MPa(b.BP.BPEL.enCharge.sup)} / ${MPa(b.BP.BPEL.enCharge.inf)}`, b.BP.BPEL.ok ? 'OK' : 'NON', b.BP.EC.ok ? 'OK' : 'NON']), hints(s.beams, b => hint({ si, type: 'BP', k: b.k })));
      comment(`Section donnée par ses valeurs : vérification simplifiée des contraintes normales à mi-travée sur la section composite (poutre + hourdis) avec la précontrainte finale P∞ et l'excentricité e₀ = ${F2(inp.e0)} m : σ = P/A ± P e v/I ∓ M v/I. BPEL 91 classe II : traction ≥ −f_tj sous combinaison rare, compression ≤ 0,6 f_cj ; EC2 : décompression sous quasi-permanente (G), compression ≤ 0,6 f_ck sous caractéristique ; précontrainte minimale de Guyon P ≥ (M_max v'/I + σ_t)/(1/A + e v'/I). Ne remplace pas le calcul phasé (poutre seule puis section composite, pertes instantanées et différées, câblage réel) d'un programme du type PONTYPE/BP.`);
    }
  }
  if (r.continu && r.appuis) {
    const ok = q => (q ? 'OK' : 'NON');
    h2(`Travées continues — appuis intermédiaires (moments négatifs, armatures supérieures, goussets)`);
    if (r.enveloppe) { const E = r.enveloppe.reduce((m, e) => (Math.max(...e.ELU_max) > Math.max(...m.ELU_max) ? e : m));
      B.push({ t: 'svg', svg: courbesX([{ nom: 'M_u max (F61)', pts: E.x.map((x, i) => [x, E.ELU_max[i]]), c: '#c8552b' }, { nom: 'M_u min (F61)', pts: E.x.map((x, i) => [x, E.ELU_min[i]]), c: '#1f5fa8' },
        { nom: 'M_Ed max (EC)', pts: E.x.map((x, i) => [x, E.ELU_EC_max[i]]), c: '#c8552b', dash: true }, { nom: 'M_Ed min (EC)', pts: E.x.map((x, i) => [x, E.ELU_EC_min[i]]), c: '#1f5fa8', dash: true }],
        { titre: `Poutre ${E.k + 1} — enveloppe des moments ELU le long du tablier continu`, unite: 'kN·m', xlab: 'x depuis la culée [m]' }), caption: 'Enveloppes ELU des moments positifs (travées) et négatifs (appuis) de la poutre la plus sollicitée, Fascicule 61 / BAEL et Eurocodes.' }); }
    table(['Appui', 'Poutre', 'M_G [kN·m]', 'M_A [kN·m]', 'M trottoirs', 'M_u axe / nu (F61) [kN·m]', 'M_ser nu (F61)', 'A_s sup. BAEL / EC2 [cm²]', 'σ_bc ELS [MPa]', 'V_u gauche / droite [kN]', 'τ_u / τ̄_u [MPa]', 'Gousset nécessaire [m]', 'Résultat'],
      r.appuis.flatMap(a => a.beams.map(q => [`P${a.i}`, String(q.k + 1), F0(q.Mcomp.G), F0(q.Mcomp.A), F0(q.Mcomp.trott), `${F0(q.Maxe.ELU_F61)} / ${F0(q.Mnu.ELU_F61)}`, F0(q.Mnu.ELS_F61), `${CM(q.retenu.BAEL)} / ${CM(q.retenu.EC)}`,
        `${F2(q.ELS.BAEL.sigC)} / ${F1(q.ELS.BAEL.lim.sigC)}`, `${F0(q.Vg)} / ${F0(q.Vd)}`, `${F2(q.cisaillementBAEL.tau)} / ${F2(q.cisaillementBAEL.tauLim)}`, `${F2(Math.max(q.goussetNecessaire, q.compressionNecessaire))} (âme ${F2(q.bg)})`,
        ok(q.cisaillementBAEL.ok && q.ELS.BAEL.okC && q.ELS.EC.okC && q.ULS.BAEL.As != null && q.ULS.EC.As != null)])), { small: true, ...hints(r.appuis.flatMap(a => a.beams.map(q => ({ a, q }))), x => (x.q.cisaillementBAEL.ok && x.q.ELS.BAEL.okC && x.q.ELS.EC.okC && x.q.ULS.BAEL.As != null && x.q.ULS.EC.As != null ? null : hint({ si: x.a.i, type: 'BAappui', k: x.q.k }))) });
    comment(`Poutre continue d'inertie constante (dossier Sétra PSI-BA 77 : ouvrage coulé sur cintre), répartition transversale ${inp.courbon ? `de Courbon (entretoises intermédiaires infiniment rigides : R_k = P (1/n + e y_k/Σ y²))` : 'de Guyon-Massonnet par travée (portées de Guyon tirées des portées équivalentes de la poutre continue)'}. Sur appui : combinaisons des moments négatifs (BAEL : 1,35 G + min[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)] ; EC : 1,35 G + 1,35 min(gr1a ; gr1b)), réduites au nu de l'entretoise d'appui de ${F2(inp.tePile ?? 0.5)} m (|M| − V e/2, PSI-BA) ; section rectangulaire comprimée en partie basse (largeur max(talon ; gousset)), armatures supérieures réparties dans le hourdis ; ELS en section fissurée (n = 15). Gousset nécessaire : max(V_u/(τ̄_u d) ; largeur pour σ_bc ≤ 0,6 f_c28). Les épaisseurs des goussets sont à reporter dans le champ « gousset d'appui » (dossier PSI-BA : même épaisseur pour toutes les poutres d'un appui, rallonger les goussets).`);
  }
  B.push(...durabiliteBlocks(r, hint));
  B.push(...indiquerHourdis(localBlocks(r), hint));
  h2('Réactions caractéristiques par ligne d\'appui (pour l\'onglet Appuis et fondations)');
  table(['Ligne', 'G', 'A(l)', 'Bc (δ appui)', 'Mc120 (δ appui)', 'Trottoirs', 'TS', 'UDL'], r.lines.map((l, i) => [i === 0 || i === r.lines.length - 1 ? `Culée C${i}` : `Pile P${i}`, F0(l.G), F0(l.A), F0(l.Bc), F0(l.Mc120), F0(l.trott), F0(l.TS), F0(l.UDL)]));
  comment(r.continu ? 'Travées continues : réactions du tablier continu (lignes d\'influence de la poutre continue, enveloppes des charges du Fascicule 61 et des Eurocodes).' : 'Travées indépendantes : permanentes et charges réparties = somme des réactions des travées adjacentes ; convois = maximum sur la ligne d\'influence des deux travées (deux sens de circulation), δ d\'appui ½[δ + max(δ ; 1,5)] (B) et ½[δ + max(δ ; 1,2)] (Mc120).');
  return B;
}

const RAIL_LIB = { rail1: '1 voie (LM71)', rail2: '2 voies (LM71)', sw2: 'SW/2', sw2b: 'SW/2 + LM71' };

/** Éléments hors du périmètre du lot 3 (pont à poutres sous rail), signalés dans l'interface et la note. */
export const HORS_PERIMETRE_POUTRES_RAIL = [
  'Analyse dynamique (§ 6.4.6 : HSLM, trains réels, accélération du tablier) lorsque l\'organigramme de la figure 6.9 la requiert ; effets du vent et du gradient thermique transversal sur la déformation transversale ; compression des appareils d\'appui dans δV.',
  'Appareils d\'appui, appuis et fondations : bouton « → Appuis » (réactions ferroviaires sans Φ et Φ par ligne, démarrage-freinage, force centrifuge, lacet, interaction voie-ouvrage par la méthode simplifiée du § 6.5.4.6.1). Succession de travées indépendantes : la méthode simplifiée ne s\'applique pas (annexe G, hors périmètre) ; efforts de démarrage-freinage transmis en totalité.',
  'Fatigue sous trafic ferroviaire (§ 6.9 et annexe D ; EN 1992-2 annexe NN).',
  'Passages de service non accessibles au public (5 kN/m², § 6.3.7) : non chargés ; murs garde-ballast et éléments locaux proches de la voie (§ 6.3.6.4(3)).',
  'Stabilité transversale sous train à vide (gr15) et actions de déraillement (§ 6.7.1) : non traitées ; travées continues : non disponibles dans ce module (travées indépendantes).',
];

/** Pont à poutres sous rail : blocs de l'interface et de la note (Eurocodes seuls). */
function beamsBlocksRail(r, { reco = null } = {}) {
  const B = [], h2 = text => B.push({ t: 'h2', text }), para = (text, hint) => B.push({ t: 'p', text, ...(hint ? { hint } : {}) }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const hint = indications(reco, para), hints = (l, f) => (hint ? { hints: l.map(f) } : {});
  const inp = r.inp, sec = r.sec, s0 = r.spans[0], R0 = s0.rail, P = R0.params;
  comment(MENTION);
  for (const a of [...new Set(r.spans.flatMap(s => s.rail.avert))]) comment(`Attention : ${a}.`);
  h2('Section et paramètres de Guyon-Massonnet');
  para(`${inp.n} poutres d'entraxe ${F2(inp.b1)} m (largeur active 2b = ${F2(inp.n * inp.b1)} m), hourdis ${F2(inp.hd)} m ; poutre + hourdis : A = ${F3(sec.A)} m², I = ${F(sec.I, 4)} m⁴, K = ${F(sec.K, 5)} m⁴${sec.v ? `, v = ${F3(sec.v)} m, v' = ${F3(sec.vp)} m` : ''}.`);
  table(['Travée L [m]', 'θ', 'α', 'L_Φ [m]', 'Coefficient dynamique'], r.spans.map(s => [F2(s.L), F3(s.theta), F3(s.alpha), F2(s.rail.LPhi.LPhi), `${s.rail.dyn.nom} = ${F3(s.rail.phi)}`]));
  comment('θ = (b/L)(ρ_p/ρ_e)^¼, α = (γ_p + γ_e)/(2√(ρ_p ρ_e)) ; répartition transversale de Guyon-Massonnet (interpolation de Massonnet en √α). L_Φ = portée de la travée (EN 1991-2 tableau 6.2, cas 5.1, travées indépendantes) ; Φ2 ou Φ3 (§ 6.4.5.2), réduit pour une couverture > 1,00 m (§ 6.4.5.4).');
  h2('Charges ferroviaires (EN 1991-2 section 6)');
  const voies = R0.voies.map(y => F2(y)).join(' et ');
  table(['Donnée', 'Valeur', 'Référence'], [
    ['Voies portées', `${R0.nV} voie(s), axe(s) en y = ${voies} m`, ''],
    ['Coefficient α', `${F2(P.alpha)} (LM71 ; SW/2 sans α)`, '§ 6.3.2(3)P'],
    ['Modèles verticaux', `LM71 : 4 × ${F0(250 * P.alpha)} kN à 1,60 m et ${F(80 * P.alpha, 1)} kN/m${P.sw2 ? ' ; SW/2 : 150 kN/m sur 2 × 25 m séparés de 7 m' : ''} ; SW/0 sans objet (travées indépendantes)`, '§ 6.3.2, 6.3.3'],
    ['Couverture h (dessus du hourdis → dessus des traverses)', `${F2(R0.couverture)} m`, '§ 6.4.5.4'],
    ['Bande de répartition au feuillet moyen du hourdis', `b_w = ℓ_t + 2 e_b/4 + h_d = ${F2(P.longueurTraverse)} + 2 × ${F2(P.ballast)}/4 + ${F2(R0.diffusion.h)} = ${F2(R0.diffusion.bw)} m`, '§ 6.3.6.3, figure 6.6 ; 45° dans le hourdis'],
    ['Excentricité des charges verticales', `e = r/18 = ${F3(R0.ecc)} m, dans les deux sens`, '§ 6.3.5'],
    ['Vitesse de ligne ; rayon en plan', `${P.V > 0 ? F0(P.V) + ' km/h' : 'non renseignée'} ; ${P.rayon > 0 ? F0(P.rayon) + ' m' : 'alignement droit'}`, '§ 6.5.1'],
  ], { texte: true });
  table(['Groupe', 'Contenu', 'γ ELU', 'ψ₀', 'ψ₁', 'ψ₂', 'Arrangements'], R0.groupes.map(G => [RAIL_LIB[G.id] || G.id, G.label, F2(G.gamma), F2(G.psi0), F2(G.psi1), F2(G.psi2), String(G.nArr)]), { texte: true });
  comment('Groupes du tableau 6.11 (§ 6.8.2) : chaque groupe est l\'action variable dominante ; dans la flexion des poutres, seule sa composante verticale intervient (coefficient 1). γ : EN 1990 tableau A2.4(B) ; ψ : tableau A2.3.');
  for (const s of r.spans) {
    const H = s.rail.horizontal;
    table(['Action horizontale (travée de ' + F2(s.L) + ' m, pour mémoire)', 'Valeur caractéristique', 'Référence'], [
      ['Démarrage', `${F0(H.demarrageFreinage.demarrage)} kN`, '§ 6.5.3'], ['Freinage', `${F0(H.demarrageFreinage.freinage)} kN${H.demarrageFreinageSW2 ? ` (SW/2 : ${F0(H.demarrageFreinageSW2.freinage)} kN)` : ''}`, '§ 6.5.3'],
      ['Effet de lacet', `${F0(H.lacet)} kN au sommet du rail`, '§ 6.5.2'],
      ...(H.centrifuge.length ? H.centrifuge.map(c => [`Force centrifuge (${c.ref})`, `V = ${F0(c.V)} km/h, f = ${F3(c.f)} : ${F(c.qt, 2)} kN/m et ${F(c.Qt, 1)} kN par essieu à ${F2(c.hauteur)} m`, '§ 6.5.1, tableau 6.8']) : [['Force centrifuge', 'sans objet (vitesse ou rayon non renseignés)', '§ 6.5.1']]),
    ], { texte: true });
  }
  comment('Actions horizontales transmises aux appuis par le bouton « → Appuis » (groupes du tableau 6.11, interaction voie-ouvrage).');
  for (const [si, s] of r.spans.entries()) {
    h2(`Travée de ${F2(s.L)} m — moments à mi-travée par poutre [kN·m] (Φ inclus) et coefficients de répartition`);
    const ids = ['G', ...s.rail.groupes.map(G => G.id)];
    table(['Poutre (y [m])', ...ids.map(i => (i === 'G' ? 'Permanentes' : RAIL_LIB[i]))], s.beams.map(b => [`${b.k + 1} (${F2(b.y)})`, ...ids.map(i => `${F0(b.mid[i])}${i !== 'G' ? ` (η ${F3(b.eta[i])})` : ''}`)]), { small: true });
    table(['Poutre', 'ELS caractéristique', 'ELS fréquente', 'ELU', 'Groupe déterminant (ELU)', 'V_Ed trafic à l\'appui, γ inclus [kN]'], s.beams.map(b => [String(b.k + 1), F0(b.comb.ELS_EC), F0(b.comb.FREQ_EC), F0(b.comb.ELU_EC), RAIL_LIB[b.comb.gov] || '—', F0(b.V0.QeluMax)]));
    comment('EN 1990 A2 : ELU 1,35 G + max γ_g Q_g ; caractéristique G + max Q_g ; fréquente G + max ψ₁,g Q_g ; quasi permanente G. Efforts tranchants par poutre = V du tablier × η / n ; poutres de rive à l\'appui : max(Guyon-Massonnet ; bras de levier), comme sous trafic routier.');
    if (s.beams[0].vipp) {
      table(['Poutre', 'Superstructures [kN/m]', 'P∞ mi-travée [kN]', 'Pertes', 'σ inf. QP t∞ [MPa]', 'σ sup. car. [MPa]', 'M_Ed / M_Rd mi-travée', 'A_sw/s appui [cm²/m]', 'Flèche t∞ [mm]', 'Résultat'],
        s.beams.map(b => { const v = b.vipp, m = v.sections[v.sections.length - 1], e = v.elu[v.elu.length - 1]; return [String(b.k + 1), F(v.charges.wS), F0(v.Ptot.inf), `${F((1 - v.Ptot.inf / v.Ptot.P0) * 100, 1)} %`, F2(m.qp.F.pi), F2(Math.min(m.car.F.ps, m.car.S.ps)), `${F0(e.MEd)} / ${F0(e.MRd)}`, F(v.tranchant[0].AswS * 1e4, 1), F(v.fleches.infini * 1000, 1), v.ok ? 'OK' : 'NON']; }), { small: true, ...hints(s.beams, b => (b.vipp.ok ? null : hint({ si, type: 'poutre', k: b.k }))) });
      comment('Chaîne complète pour chaque poutre (même câblage) : détail ci-dessous pour la poutre la plus sollicitée (moment ELU à mi-travée).');
      const gov = s.beams.reduce((a, b) => (b.vipp.elu[b.vipp.elu.length - 1].MEd > a.vipp.elu[a.vipp.elu.length - 1].MEd || (!b.vipp.ok && a.vipp.ok) ? b : a));
      B.push(...indiquerVipp(vippBlocks(gov.vipp, `Poutre ${gov.k + 1}`), gov.vipp, si, gov.k, hint));
    } else if (inp.type === 'BA') {
      table(['Poutre', 'M_Ed [kN·m]', 'A_s EC2 [cm²]', 'Mode'], s.beams.map(b => [String(b.k + 1), F0(b.MuE), CM(b.BA.EC.As), b.BA.EC.mode]), hints(s.beams, b => hint({ si, type: 'BA', k: b.k })));
      comment(`Poutre en T à l'ELU (EN 1992-1-1) : table b_eff = b₁ = ${F2(inp.b1)} m, h_f = ${F2(inp.hd)} m, âme b₀ = ${F2(inp.b0)} m, d = H − ${F2(inp.cover)} m ; diagramme rectangulaire ; minimum de non-fragilité.`);
      const gov = s.beams.reduce((a, b) => (b.MuE > a.MuE ? b : a));
      table(['x [m]', 'M_Ed [kN·m]', 'A_s [cm²]', 'V_Ed [kN]', 'cot θ', 'V_Rd,max [kN]', 'A_sw/s [cm²/m]', 'Proposition', 'Résultat'], gov.BA.travee.map(t => [F(t.x, 1), F0(t.MEd), CM(t.As), F0(t.VEd), F2(t.V.cot), F0(t.V.VRdmax), F(t.V.AswS * 1e4, 1), etriers(t.V.AswS, (sec.H || 2) - inp.cover), t.V.ok ? 'OK' : 'NON']), { small: true, ...hints(gov.BA.travee, t => (t.V.ok ? null : hint({ si, type: 'BAV', k: gov.k, x: t.x }))) });
      comment(`Poutre ${gov.k + 1} (la plus sollicitée), le long de la demi-travée : V_Ed = 1,35 V_G + max γ_g V_g, z = 0,9 d, b_w = b₀ (EN 1992-1-1 § 6.2.3).`);
    } else {
      table(['Poutre', 'P∞ [kN]', 'σ sup / inf à vide [MPa]', 'σ sup / inf QP [MPa]', 'σ sup caractéristique [MPa]', 'EC2 (décompression QP, 0,6 f_ck)'], s.beams.map(b => [String(b.k + 1), F0(inp.P), `${MPa(b.BP.EC.aVide.sup)} / ${MPa(b.BP.EC.aVide.inf)}`, `${MPa(b.BP.EC.enCharge.sup)} / ${MPa(b.BP.EC.enCharge.inf)}`, MPa(b.BP.EC.enChargeCar.sup), b.BP.EC.ok ? 'OK' : 'NON']), hints(s.beams, b => hint({ si, type: 'BP', k: b.k })));
      comment(`Section donnée par ses valeurs : contraintes normales à mi-travée sur la section composite avec P∞ et e₀ = ${F2(inp.e0)} m ; EN 1992-2 : décompression sous quasi permanente (G seul, ψ₂ = 0), compression ≤ 0,6 f_ck sous caractéristique.`);
    }
  }
  for (const [si, s] of r.spans.entries()) if (s.rail.deformations) B.push(...indiquerDefo(deformationsBlocks(s.rail.deformations, { travee: `travée de ${F2(s.L)} m` }), s.rail.deformations, si, hint));
  B.push(...durabiliteBlocks(r, hint));
  B.push(...indiquerHourdis(localBlocks(r), hint));
  h2('Réactions caractéristiques par ligne d\'appui (transmises aux appuis)');
  table(['Ligne', 'G', 'G min', 'LM71 × α, une voie (sans Φ)', 'Φ', ...(P.sw2 ? ['SW/2, une voie (sans Φ)'] : []), 'Trafic, toutes voies, Φ inclus'],
    r.lines.map((l, i) => [i === 0 || i === r.lines.length - 1 ? `Culée C${i}` : `Pile P${i}`, F0(l.G), F0(l.Gmin), F0(l.LM71), F3(l.phi), ...(P.sw2 ? [F0(l.SW2)] : []), F0(l.Qmax)]));
  comment('Ligne d\'influence en triangle des deux travées adjacentes (travées indépendantes) ; LM71 sur toute la ligne d\'influence (positive), SW/2 en motif rigide ; Φ maximal des travées adjacentes (tableau 6.2, cas 6). Culées et fondations : effets dynamiques négligeables (§ 6.4.5.4(2)). Transmises à l\'onglet Appuis par le bouton « → Appuis » (valeurs sans Φ et Φ par ligne).');
  h2('Hors périmètre de ce calcul');
  for (const t of HORS_PERIMETRE_POUTRES_RAIL) para('— ' + t);
  para(`Paramètres à fixer par le référentiel du gestionnaire du réseau : ${PARAMETRES_REFERENTIEL.join(' ')}`);
  return B;
}

/** Note de calcul du pont à poutres (HTML et Word). */
export function poutresNote(r, { version = '' } = {}) {
  const vipp = r.spans.some(s => s.beams[0].vipp);
  if (r.rail) return {
    title: `Note de calcul — pont à poutres sous rail (${vipp ? (r.inp.type === 'PRAD' ? 'PRAD' : 'VIPP') : r.inp.type === 'BA' ? 'béton armé' : 'poutres précontraintes'})`,
    meta: `PSIDA ${version} — ${r.inp.n} poutres, travées ${r.inp.spans.join(' + ')} m — EN 1991-2 section 6`,
    blocks: [{ t: 'h1', text: '1. Tablier à poutres sous rail' }, ...beamsBlocks(r), { t: 'h1', text: '2. Références' },
      { t: 'ref', text: 'NF EN 1991-2 section 6 (charges ferroviaires ; § 6.4.4, figures 6.9 et 6.10, tableau 6.6, § 6.5.4.5.2, annexe F) ; NF EN 1990/A1 annexe A2 (tableaux A2.3, A2.4 ; A2.4.4 déformations et vibrations) ; NF EN 1991-1-1 annexe A (poids des superstructures de voie).' },
      { t: 'ref', text: 'NF EN 1992-1-1 et NF EN 1992-2 (béton armé et précontraint). Guyon (1946), Massonnet (1950) : répartition transversale ; Sétra, programme PONTYPE / PAP.' },
      ...(vipp ? [{ t: 'ref', text: 'Sétra, VIPP — guide de conception (1996) ; Z. P. Bažant (1972) ; A. Ghali, R. Favre, M. Elbadry (2012) — effets différés.' }] : [])],
  };
  return {
    title: vipp ? 'Note de calcul — pont à poutres précontraintes par post-tension (VIPP)' : r.inp.type === 'BA' ? 'Note de calcul — pont à poutres en béton armé' : 'Note de calcul — pont à poutres : répartition transversale et efforts',
    meta: `PSIDA ${version} — ${r.inp.n} poutres, travées ${r.inp.spans.join(' + ')} m`,
    blocks: [{ t: 'h1', text: '1. Tablier à poutres' }, ...beamsBlocks(r), { t: 'h1', text: '2. Références' },
      { t: 'ref', text: 'Sétra, VIPP — Ponts à poutres préfabriquées précontraintes par post-tension, guide de conception (1996).' },
      { t: 'ref', text: 'NF EN 1990/A1 (annexe A2) ; NF EN 1991-2 ; NF EN 1992-1-1 : § 3.1, 3.3, 5.3.2.1, 5.10, 6.1, 6.2, 7.2, 7.3, 8.10, 9.2 et annexe B ; NF EN 1992-2 : § 3.1.6, 6.1, 7.2, 7.3 et tableau 7.101N.' },
      { t: 'ref', text: 'Fascicule 61 titre II ; BPEL 91 révisé 99 (classe II) ; BAEL 91. Guyon (1946), Massonnet (1950) : répartition transversale ; Sétra, programme PONTYPE / PAP.' },
      { t: 'ref', text: 'Z. P. Bažant (1972) ; A. Ghali, R. Favre, M. Elbadry, Concrete Structures: Stresses and Deformations (2012) — calcul pas à pas des effets différés.' }],
  };
}

function durabiliteBlocks(r, hint) {
  const L = durabiliteLignes(r); if (!L) return [];
  const B = [{ t: 'h2', text: 'Durabilité et enrobage (EN 1992-1-1 § 4.4.1)' }];
  const hs = L.rows.map(q => (q.ok || !hint ? null : hint({ type: 'durab', k: q.k })));
  B.push({ t: 'table', head: ['Vérification', 'Projet', 'Exigence', 'Résultat'], rows: L.rows.map(q => [...q.cells, q.ok ? 'OK' : 'NON']), small: true, ...(hs.some(Boolean) ? { hints: hs } : {}) });
  B.push({ t: 'p', text: texteDurabilite(L.Dd) + (r.durabP ? ` Précontrainte : ${texteDurabilite(r.durabP.D, { enrobage: r.durabP.pire.mm, objet: r.durabP.D.mode === 'pre' ? 'torons' : 'gaines' })} Les plans des poutres prennent c_nom au nu des cadres.` : ' Les plans des poutres BA prennent c_nom au nu des cadres ; la hauteur utile du calcul doit couvrir les lits réellement dessinés.'), cls: 'small' });
  return B;
}
