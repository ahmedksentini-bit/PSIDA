/** Ponts à poutres : blocs de présentation (interface et note). */
const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F2 = v => F(v, 2), F3 = v => F(v, 3);
const CM = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : F(v * 1e4, 1));
const MPa = v => F(v / 1000, 2);

/** Courbes le long de la demi-travée (contraintes, MPa) : séries [{ nom, pts: [[x, v]], c, dash }], limites horizontales. */
function courbesX(series, { titre = '', unite = 'MPa', lim = [] } = {}) {
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
  o.push(`<text x="${(ml + w - mr) / 2}" y="${h - 2}" font-size="10.5" text-anchor="middle">x depuis l'appui [m] (demi-travée)</text><text x="12" y="${mt + (h - mt - mb) / 2}" font-size="10.5" text-anchor="middle" transform="rotate(-90 12 ${mt + (h - mt - mb) / 2})">${unite}</text>`);
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
  if (H && !H.erreur) {
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
      v.trace.cab.map((cb, ig) => { const q = v.pertes[ig], P0 = cb.n * pr.T.A * pr.sigPi * 1000; return [cb.sup ? 'supérieurs' : ig ? `gainé G${ig}` : 'adhérents', String(cb.n), cb.Lg ? F2(cb.Lg) : '—', F2(cb.xDeb), F3(cb.ym), F0(q.P0), F0(q.Pserv), F0(q.Pinf), pc(q.Pinf, P0)]; }), { small: true });
    comment(`Tension sur banc σ_pi = ${F0(pr.sigPi)} MPa (§ 5.10.2.1) ; avant et au relâchement : relaxation ${F(pr.dRel, 1)} MPa (§ 3.3.2), étuvage ${F(pr.dTh, 1)} MPa (0,5 E_p α_c ΔT, § 10.5.2), raccourcissement élastique ${F(pr.sigEl, 1)} MPa (E_p σ_c / E_cm(t), § 5.10.4) → σ_pm0 = ${F0(pr.sigPm0)} MPa. Transmission : f_bpt = η_p1 η₁ f_ctd(t) = ${F2(pr.fbpt)} MPa, l_pt = α₁ α₂ φ σ_pm0 / f_bpt = ${F2(pr.lpt)} m (l_pt1 = ${F2(pr.lpt1)} m, l_pt2 = ${F2(pr.lpt2)} m, § 8.10.2.2) ; ancrage à l'ELU l_bpd = ${F2(v.ancrage.lbpd)} m (§ 8.10.2.3, σ_p∞ = ${F0(v.ancrage.sigPinf)} MPa). Les groupes gainés agissent au-delà de L_g + l_pt/2 − about ; pertes différées par le calcul pas à pas.`);
  } else {
  table(['Câble', 'Famille', 'y mi-travée [m]', 'y ancrage [m]', 'P₀ vérin [kN]', 'Après frottement et recul (mi-travée)', 'λ recul [m]', 'Après mise en tension', 'Mise en service', 't∞', 'Pertes totales'],
    v.pertes.map(q => [String(q.ic + 1), String(q.famille), F3(q.ym), F3(q.ya), F0(q.P0), `${F0(q.Pinst)} (${pc(q.Pinst, q.P0)})`, F(Math.max(...q.lambda), 1), F0(q.PapresTension), F0(q.Pserv), F0(q.Pinf), pc(q.Pinf, q.P0)]), { small: true });
  comment(`σ_p0 = ${F0(v.sigP0)} MPa = min(0,8 f_pk ; 0,9 f_p0,1k) (§ 5.10.2.1) ; frottement P(x) = P₀ e^(−μ(θ + kx)) (§ 5.10.5.2), recul d'ancrage par égalité des aires (§ 5.10.5.3) ; raccourcissement élastique par mise en tension successive des câbles (§ 5.10.5.1) ; pertes différées par le calcul pas à pas (fluage et retrait des deux bétons, retrait différentiel hourdis-poutre, relaxation § 3.3.2 classe 2, ρ₁₀₀₀ = 2,5 %). Total à t∞ à mi-travée : ${F0(v.Ptot.inf)} kN pour ${F0(v.Ptot.P0)} kN au vérin (${pc(v.Ptot.inf, v.Ptot.P0)} de pertes).`);
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
  comment('Section non fissurée, parties de section prises séparément (poutre, hourdis) pour les actions permanentes et la précontrainte (calcul par phases), section composée homogène (E_cm) pour le trafic. Combinaisons EN 1990 A2 : caractéristique G + P + max(gr1a ; gr1b) ; fréquente G + P + max(0,75 TS + 0,4 UDL + 0,4 trottoirs ; 0,75 LM2) ; quasi permanente G + P (ψ₂ = 0). Gradient thermique non linéaire (EN 1991-1-5) non inclus : sur une travée isostatique la part linéaire ne crée pas de contrainte.');
  h2(`${titre} — ELU de flexion`);
  table(['x [m]', 'M_Ed EC [kN·m]', 'M_Ed F61 [kN·m]', 'M_Rd [kN·m]', 'A_s passif [cm²]', 'x/d', 'Résultat'], v.elu.map(e => [F(e.x, 1), F0(e.MEdE), F0(e.MEdF), F0(e.MRd), F(e.As * 1e4, 1), F2(e.xd), e.ok ? 'OK' : 'NON']));
  comment(`EC : 1,35 G + 1,35 max(gr1a ; gr1b) ; Fascicule 61 : 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)]. Résistance : bloc rectangulaire 0,8 x, f_cd = 0,85 f_ck/1,5 (hourdis puis poutre selon le contour réel), câbles avec allongement préalable ε_pm∞ et palier f_pd = f_p0,1k/1,15 = ${F0(1640 / 1.15)} MPa, armatures passives f_yd = 435 MPa ; A_s ≥ A_s,min = 0,26 f_ctm/f_yk b_t d (§ 9.2.1.1, b_t = talon). La rupture fragile (EN 1992-2 § 6.1 (109)) est couverte par ce minimum lorsque les câbles restent adhérents.`);
  h2(`${titre} — effort tranchant et étriers (EN 1992-1-1 § 6.2.3)`);
  table(['x [m]', 'V_Ed [kN]', 'V_pd [kN]', 'V_Ed − V_pd', 'b_w,nom [m]', 'σ_cp [MPa]', 'cot θ', 'V_Rd,max [kN]', 'A_sw/s [cm²/m]', 'Proposition', 'Résultat'],
    v.tranchant.map(t => [F(t.x, 1), F0(t.VEd0), F0(t.Vpd), F0(t.VEd), F3(t.bwn), F2(t.scp), F2(t.cot), F0(t.VRdmax), F(t.AswS * 1e4, 1), etriers(t.AswS, t.z / 0.9), t.ok ? 'OK' : 'NON']), { small: true });
  comment('V_Ed = 1,35 V_G + 1,35 max(V_gr1a ; V_gr1b) ; V_pd = Σ P∞ sin α (composante verticale des câbles relevés, § 6.2.1 (1)) ; b_w,nom = b_w − ½ φ_gaine (gaines métalliques injectées, § 6.2.3 (6)) — âme épaissie (blochet) près des appuis ; α_cw selon σ_cp = P∞/A_c (§ 6.2.3 (3)) ; z = 0,9 d ; minimum ρ_w,min = 0,08 √f_ck/f_yk. Effort de traction supplémentaire ΔF_td = ½ V_Ed (cot θ − cot α) à ancrer dans le talon (§ 6.2.3 (7)).');
  h2(`${titre} — flèches à mi-travée (mm, vers le bas positives)`);
  table([pr ? 'Après relâchement' : 'Après 1re famille', pr ? 'Hourdis coulé' : 'Hourdis coulé (avant 2e famille)', pr ? 'Hourdis durci' : 'Après 2e famille', 'Mise en service', 't∞', 'Trafic caractéristique (E_cm)'], [[F(v.fleches.tension * 1000, 1), F(v.fleches.hourdis * 1000, 1), F(v.fleches.famille2 * 1000, 1), F(v.fleches.service * 1000, 1), F(v.fleches.infini * 1000, 1), F(v.fleches.trafic * 1000, 1)]]);
  comment(`Valeurs négatives : contre-flèche (poutre relevée par la précontrainte). La flèche à t∞ sous charges permanentes (${F(v.fleches.infini * 1000, 1)} mm) donne la contre-flèche de coffrage éventuelle ; trafic : L/${F0(v.L / Math.max(v.fleches.trafic, 1e-6))}.`);
  h2(`${titre} — quantités`);
  para(`Béton de poutre ${F(v.quantites.volP, 1)} m³ ; précontrainte ${F0(v.quantites.kgP)} kg, soit ${F0(v.quantites.ratioP)} kg par m³ de béton du tablier (poutre + hourdis)${pr ? '' : ' — guide : ≈ 40 kg/m³'}.`);
  return B;
}

export function beamsBlocks(r) {
  const B = [], h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const inp = r.inp, sec = r.sec;
  h2('Section et paramètres de Guyon-Massonnet');
  para(`${inp.n} poutres d'entraxe ${F2(inp.b1)} m (largeur active 2b = ${F2(inp.n * inp.b1)} m), hourdis ${F2(inp.hd)} m ; poutre + hourdis : A = ${F3(sec.A)} m², I = ${F(sec.I, 4)} m⁴, K = ${F(sec.K, 5)} m⁴${sec.v ? `, v = ${F3(sec.v)} m, v' = ${F3(sec.vp)} m` : ''}.`);
  table(['Travée L [m]', 'θ', 'α', 'Classe F61', 'δ_B', 'δ_C'], r.spans.map(s => [F2(s.L), F3(s.theta), F3(s.alpha), String(s.classe), F3(s.deltaB), F3(s.deltaC)]));
  comment('θ = (b/L)(ρ_p/ρ_e)^¼, α = (γ_p + γ_e)/(2√(ρ_p ρ_e)), ρ_p = I_p/b₁, γ_p = K_p/(2 b₁) (G = E/2), hourdis ρ_e = γ_e = h_d³/12 ; répartition transversale de Guyon-Massonnet avec l\'interpolation de Massonnet K = K₀ + (K₁ − K₀)√α (pratique PONTYPE/PAP, reproduite sur le Pont de Noé). M_poutre = K̄(y_k) M/n, charges placées transversalement au plus défavorable pour chaque poutre.');
  for (const s of r.spans) {
    h2(`Travée de ${F2(s.L)} m — moments à mi-travée par poutre [kN·m] et coefficients de répartition`);
    const ids = ['G', 'A', 'Bc', 'Bt', 'Mc120', 'D240', 'trott', 'gr1a', 'gr1b'].filter(id => s.beams[0].mid[id] !== undefined);
    const lab = { G: 'Permanentes', A: 'A(l)', Bc: 'Bc', Bt: 'Bt', Mc120: 'Mc120', D240: 'D240', trott: 'Trottoirs', gr1a: 'EC gr1a', gr1b: 'EC gr1b' };
    table(['Poutre (y [m])', ...ids.map(i => lab[i])], s.beams.map(b => [`${b.k + 1} (${F2(b.y)})`, ...ids.map(i => `${F0(b.mid[i])}${i !== 'G' ? ` (η ${F3(b.eta[i])})` : ''}`)]), { small: true });
    table(['Poutre', 'ELS F61', 'ELU F61', 'ELS car. EC', 'ELU EC', 'V Bc appui [kN]', 'V gr1a appui [kN]'], s.beams.map(b => [String(b.k + 1), F0(b.comb.ELS_F61), F0(b.comb.ELU_F61), F0(b.comb.ELS_EC), F0(b.comb.ELU_EC), F0(b.V0.Bc), F0(b.V0.gr1a)]));
    comment('Fascicule 61 / BAEL : ELS G + max[1,2 (A ou B + trottoirs) ; Mc120 + trottoirs] ; ELU 1,35 G + max[1,605 (A ou B + trottoirs) ; 1,35 (Mc120 + trottoirs)] (pratique PAP). Eurocodes : ELU 1,35 G + 1,35 max(gr1a ; gr1b). Efforts tranchants par poutre = V du tablier × η de la poutre / n (δ inclus pour B et Mc120).');
    if (s.beams[0].vipp) {
      table(['Poutre', 'Superstructures [kN/m]', 'P∞ mi-travée [kN]', 'Pertes', 'σ inf. QP t∞ [MPa]', 'σ sup. car. [MPa]', 'M_Ed / M_Rd mi-travée', 'A_sw/s appui [cm²/m]', 'Flèche t∞ [mm]', 'Résultat'],
        s.beams.map(b => { const v = b.vipp, m = v.sections[v.sections.length - 1], e = v.elu[v.elu.length - 1]; return [String(b.k + 1), F(v.charges.wS), F0(v.Ptot.inf), `${F((1 - v.Ptot.inf / v.Ptot.P0) * 100, 1)} %`, F2(m.qp.F.pi), F2(Math.min(m.car.F.ps, m.car.S.ps)), `${F0(e.MEd)} / ${F0(e.MRd)}`, F(v.tranchant[0].AswS * 1e4, 1), F(v.fleches.infini * 1000, 1), v.ok ? 'OK' : 'NON']; }));
      comment('Chaîne complète pour chaque poutre (même câblage) : détail ci-dessous pour la poutre la plus sollicitée (moment ELU à mi-travée).');
      const gov = s.beams.reduce((a, b) => (b.vipp.elu[b.vipp.elu.length - 1].MEd > a.vipp.elu[a.vipp.elu.length - 1].MEd || (!b.vipp.ok && a.vipp.ok) ? b : a));
      B.push(...vippBlocks(gov.vipp, `Poutre ${gov.k + 1}`));
    } else if (inp.type === 'BA') {
      table(['Poutre', 'M_u F61 [kN·m]', 'A_s BAEL [cm²]', 'M_u EC [kN·m]', 'A_s EC2 [cm²]', 'Mode'], s.beams.map(b => [String(b.k + 1), F0(b.MuF), CM(b.BA.BAEL.As), F0(b.MuE), CM(b.BA.EC.As), b.BA.EC.mode]));
      comment(`Poutre en T à l'ELU : table b_eff = b₁ = ${F2(inp.b1)} m, h_f = ${F2(inp.hd)} m, âme b₀ = ${F2(inp.b0)} m, d = H − ${F2(inp.cover)} m ; diagramme rectangulaire ; minimum de non-fragilité.`);
      const gov = s.beams.reduce((a, b) => (b.MuE > a.MuE ? b : a));
      if (gov.BA.travee) {
        table(['x [m]', 'M_Ed [kN·m]', 'A_s [cm²]', 'V_Ed [kN]', 'cot θ', 'V_Rd,max [kN]', 'A_sw/s [cm²/m]', 'Proposition', 'Résultat'], gov.BA.travee.map(t => [F(t.x, 1), F0(t.MEd), CM(t.As), F0(t.VEd), F2(t.V.cot), F0(t.V.VRdmax), F(t.V.AswS * 1e4, 1), etriers(t.V.AswS, (sec.H || 2) - inp.cover), t.V.ok ? 'OK' : 'NON']));
        comment(`Poutre ${gov.k + 1} (la plus sollicitée), le long de la demi-travée : armatures inférieures pour l'enveloppe des ELU (EC et Fascicule 61) ; étriers EN 1992-1-1 § 6.2.3 avec V_Ed = 1,35 V_G + 1,35 max(V_gr1a ; V_gr1b), z = 0,9 d, b_w = b₀.`);
      }
    } else {
      table(['Poutre', 'P∞ [kN]', 'P min (Guyon) [kN]', 'σ sup / inf à vide [MPa]', 'σ sup / inf en charge [MPa]', 'BPEL classe II', 'EC2 (décompression QP, 0,6 f_ck)'], s.beams.map(b => [String(b.k + 1), F0(inp.P), F0(b.BP.BPEL.Pmin), `${MPa(b.BP.BPEL.aVide.sup)} / ${MPa(b.BP.BPEL.aVide.inf)}`, `${MPa(b.BP.BPEL.enCharge.sup)} / ${MPa(b.BP.BPEL.enCharge.inf)}`, b.BP.BPEL.ok ? 'OK' : 'NON', b.BP.EC.ok ? 'OK' : 'NON']));
      comment(`Section donnée par ses valeurs : vérification simplifiée des contraintes normales à mi-travée sur la section composite (poutre + hourdis) avec la précontrainte finale P∞ et l'excentricité e₀ = ${F2(inp.e0)} m : σ = P/A ± P e v/I ∓ M v/I. BPEL 91 classe II : traction ≥ −f_tj sous combinaison rare, compression ≤ 0,6 f_cj ; EC2 : décompression sous quasi-permanente (G), compression ≤ 0,6 f_ck sous caractéristique ; précontrainte minimale de Guyon P ≥ (M_max v'/I + σ_t)/(1/A + e v'/I). Ne remplace pas le calcul phasé (poutre seule puis section composite, pertes instantanées et différées, câblage réel) d'un programme du type PONTYPE/BP.`);
    }
  }
  B.push(...localBlocks(r));
  h2('Réactions caractéristiques par ligne d\'appui (pour l\'onglet Appuis et fondations)');
  table(['Ligne', 'G', 'A(l)', 'Bc (δ appui)', 'Mc120 (δ appui)', 'Trottoirs', 'TS', 'UDL'], r.lines.map((l, i) => [i === 0 || i === r.lines.length - 1 ? `Culée C${i}` : `Pile P${i}`, F0(l.G), F0(l.A), F0(l.Bc), F0(l.Mc120), F0(l.trott), F0(l.TS), F0(l.UDL)]));
  comment('Travées indépendantes : permanentes et charges réparties = somme des réactions des travées adjacentes ; convois = maximum sur la ligne d\'influence des deux travées (deux sens de circulation), δ d\'appui ½[δ + max(δ ; 1,5)] (B) et ½[δ + max(δ ; 1,2)] (Mc120).');
  return B;
}

/** Note de calcul du pont à poutres (HTML et Word). */
export function poutresNote(r, { version = '' } = {}) {
  const vipp = r.spans.some(s => s.beams[0].vipp);
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
