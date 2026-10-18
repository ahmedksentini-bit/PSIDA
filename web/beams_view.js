/** Ponts à poutres : blocs de présentation (interface et note). */
const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F2 = v => F(v, 2), F3 = v => F(v, 3);
const CM = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : F(v * 1e4, 1));
const MPa = v => F(v / 1000, 2);

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
    if (inp.type === 'BA') {
      table(['Poutre', 'M_u F61 [kN·m]', 'A_s BAEL [cm²]', 'M_u EC [kN·m]', 'A_s EC2 [cm²]', 'Mode'], s.beams.map(b => [String(b.k + 1), F0(b.MuF), CM(b.BA.BAEL.As), F0(b.MuE), CM(b.BA.EC.As), b.BA.EC.mode]));
      comment(`Poutre en T à l'ELU : table b_eff = b₁ = ${F2(inp.b1)} m, h_f = ${F2(inp.hd)} m, âme b₀ = ${F2(inp.b0)} m, d = H − ${F2(inp.cover)} m ; diagramme rectangulaire ; minimum de non-fragilité. Effort tranchant et ancrages à vérifier séparément.`);
    } else {
      table(['Poutre', 'P∞ [kN]', 'P min (Guyon) [kN]', 'σ sup / inf à vide [MPa]', 'σ sup / inf en charge [MPa]', 'BPEL classe II', 'EC2 (décompression QP, 0,6 f_ck)'], s.beams.map(b => [String(b.k + 1), F0(inp.P), F0(b.BP.BPEL.Pmin), `${MPa(b.BP.BPEL.aVide.sup)} / ${MPa(b.BP.BPEL.aVide.inf)}`, `${MPa(b.BP.BPEL.enCharge.sup)} / ${MPa(b.BP.BPEL.enCharge.inf)}`, b.BP.BPEL.ok ? 'OK' : 'NON', b.BP.EC.ok ? 'OK' : 'NON']));
      comment(`Vérification simplifiée des contraintes normales à mi-travée sur la section composite (poutre + hourdis) avec la précontrainte finale P∞ et l'excentricité e₀ = ${F2(inp.e0)} m : σ = P/A ± P e v/I ∓ M v/I. BPEL 91 classe II : traction ≥ −f_tj sous combinaison rare, compression ≤ 0,6 f_cj ; EC2 : décompression sous quasi-permanente (G), compression ≤ 0,6 f_ck sous caractéristique ; précontrainte minimale de Guyon P ≥ (M_max v'/I + σ_t)/(1/A + e v'/I). Ne remplace pas le calcul phasé (poutre seule puis section composite, pertes instantanées et différées, câblage réel) d'un programme du type PONTYPE/BP.`);
    }
  }
  h2('Réactions caractéristiques par ligne d\'appui (pour l\'onglet Appuis et fondations)');
  table(['Ligne', 'G', 'A(l)', 'Bc (δ appui)', 'Mc120 (δ appui)', 'Trottoirs', 'TS', 'UDL'], r.lines.map((l, i) => [i === 0 || i === r.lines.length - 1 ? `Culée C${i}` : `Pile P${i}`, F0(l.G), F0(l.A), F0(l.Bc), F0(l.Mc120), F0(l.trott), F0(l.TS), F0(l.UDL)]));
  comment('Travées indépendantes : permanentes et charges réparties = somme des réactions des travées adjacentes ; convois = maximum sur la ligne d\'influence des deux travées (deux sens de circulation), δ d\'appui ½[δ + max(δ ; 1,5)] (B) et ½[δ + max(δ ; 1,2)] (Mc120).');
  return B;
}
