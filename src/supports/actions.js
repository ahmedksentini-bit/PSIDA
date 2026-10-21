/**
 * Efforts horizontaux en tête des appuis — répartition par rigidités (pratique SETRA, programme PSH ; note des appuis du
 * Pont de Noé) et combinaisons des efforts en tête (BAEL 91 annexe D / Fascicule 61 ; EN 1990 annexe A2).
 *
 * Souplesse horizontale d'une ligne d'appui : s = s_néoprène + s_appui, s_néoprène = T_e/(n G a b) (G = 0,9 MPa différé,
 * 1,8 MPa instantané), s_appui = souplesse du fût et de sa fondation ramenée en tête.
 *   freinage (instantané) : H_i = K_i,inst · H / Σ K_inst ;
 *   déformations imposées ε (température, retrait, fluage) : x₀ = Σ K_i x_i / Σ K_i, H_i = K_i · ε · (x₀ − x_i),
 *   déplacement de l'appareil = H_i / K_néoprène.
 * Unités : m, kN, MPa.
 */

/** Souplesse d'une ligne de n appareils en élastomère fretté [m/kN] (T_e enrobages compris, G en MPa). */
export function neopreneFlexibility({ n, a, b, Te, G }) { return Te / (n * G * 1000 * a * b); }

/** Souplesse en tête d'un fût console encastré en pied (hauteur H jusqu'au point d'application, E en MPa, I en m⁴). */
export function cantileverFlexibility({ H, E, I }) { return H ** 3 / (3 * E * 1000 * I); }

/**
 * Répartition des efforts horizontaux entre les lignes d'appui.
 * @param {{x:number, sNeo:{inst:number, diff:number}, sApp:{inst:number, diff:number}}[]} lines
 * @returns {{K, x0, braking:(H)=>number[], imposed:(eps, kind)=>{H:number[], disp:number[]}}}
 */
export function horizontalDistribution(lines) {
  const K = { inst: lines.map(l => 1 / (l.sNeo.inst + l.sApp.inst)), diff: lines.map(l => 1 / (l.sNeo.diff + l.sApp.diff)) };
  const sum = a => a.reduce((s, v) => s + v, 0);
  const x0 = { inst: sum(K.inst.map((k, i) => k * lines[i].x)) / sum(K.inst), diff: sum(K.diff.map((k, i) => k * lines[i].x)) / sum(K.diff) };
  return {
    K, x0, lines,
    braking: H => K.inst.map(k => k * H / sum(K.inst)),
    /**
     * ε > 0 raccourcissement du tablier (retrait, fluage, refroidissement) ; kind 'diff' (lent) ou 'inst' (rapide).
     * H_i = K_i ε (x₀ − x_i) : effort sur la tête d'appui, positif dans le sens des x croissants (convention de la note Noé).
     */
    imposed: (eps, kind = 'diff') => {
      const H = K[kind].map((k, i) => k * eps * (x0[kind] - lines[i].x));
      return { H, disp: H.map((h, i) => h * lines[i].sNeo[kind]) };
    },
  };
}

/** Freinage Fascicule 61 : Bc un camion de 300 kN ; A(l) : H = A·S/(20 + 0,0035 S), A = a1·a2·A(l) [kN/m²], S [m²]. */
export function brakingF61Deck({ Ltot, Lc, nv, a1 = 1, a2 = 1 }) {
  const A = a1 * a2 * (2.3 + 360 / (Ltot + 12)), S = Ltot * Lc;
  return { Bc: 300, A: A * S / (20 + 0.0035 * S), Aq: A, S };
}

/**
 * Combinaisons des efforts en tête d'un appui (BAEL 91 annexe D, ponts routes — combinaisons C1… de la note du Pont de
 * Noé) : ELU 1,35 G + 1,35 (retrait + fluage) + γ_Q1 (Q1 + freinage) + 0,78 TLD (γ_Q1 = 1,605 pour A et B, 1,35 Mc120) ;
 * ELS G + retrait + fluage + 1,2 (Q1 + freinage) + 0,6 TLD (Mc120 × 1). Températures dominantes : 1,35 / 1,0 (TLD + TCD).
 * @param {object} a actions en tête : G {N}, Q:[{label, N, H, gU, gS}], RF {H} (retrait + fluage), TLD {H}, TCD {H} ;
 *   envelope : efforts horizontaux cumulés en valeur absolue (le freinage et la température changent de sens — la note Noé
 *   combine le freinage positif avec le retrait négatif en P3, ce qui n'est pas défavorable)
 */
export function headCombinationsBAEL({ G, Q = [], RF = { H: 0 }, TLD = { H: 0 }, TCD = { H: 0 }, envelope = false }) {
  if (envelope) return headCombinationsBAEL({ G, Q: Q.map(q => ({ ...q, H: Math.abs(q.H) })), RF: { H: Math.abs(RF.H) }, TLD: { H: Math.abs(TLD.H) }, TCD: { H: Math.abs(TCD.H) } });
  const out = [];
  for (const q of Q) {
    out.push({ label: `ELU ${q.label}`, ls: 'ELU', Nsus: 1.35 * G.N + (G.P || 0), Ninst: q.gU * q.N, Hinst: q.gU * q.H, Hsus: 1.35 * RF.H + 0.78 * TLD.H });
    out.push({ label: `ELS ${q.label}`, ls: 'ELS', Nsus: G.N + (G.P || 0), Ninst: q.gS * q.N, Hinst: q.gS * q.H, Hsus: RF.H + 0.6 * TLD.H });
  }
  out.push({ label: 'ELU température', ls: 'ELU', Nsus: 1.35 * G.N + (G.P || 0), Ninst: 0, Hinst: 1.35 * TCD.H, Hsus: 1.35 * (RF.H + TLD.H) });
  out.push({ label: 'ELS température', ls: 'ELS', Nsus: G.N + (G.P || 0), Ninst: 0, Hinst: TCD.H, Hsus: RF.H + TLD.H });
  for (const c of out) { c.N = c.Nsus + c.Ninst; c.H = c.Hsus + c.Hinst; }
  return out;
}

/**
 * Combinaisons EN 1990 A2 (approche 2, STR/GEO) en tête d'appui : ELU 1,35 G + 1,35 (gr1a ou gr2 freinage) + 1,5 ψ0 T ;
 * température dominante 1,35 G + 1,5 T + 1,35 ψ0 trafic ; ELS caractéristique idem avec 1,0.
 */
export function headCombinationsEC({ G, Q = [], RF = { H: 0 }, T = { H: 0 }, psi0T = 0.6, envelope = true }) {
  if (envelope) { Q = Q.map(q => ({ ...q, H: Math.abs(q.H) })); RF = { H: Math.abs(RF.H) }; T = { H: Math.abs(T.H) }; }
  const out = [];
  for (const q of Q) {
    out.push({ label: `ELU ${q.label}`, ls: 'ELU', Nsus: 1.35 * G.N + (G.P || 0), Ninst: 1.35 * q.N, Hinst: 1.35 * q.H, Hsus: 1.35 * RF.H + 1.5 * psi0T * T.H });
    out.push({ label: `ELS car. ${q.label}`, ls: 'ELS', Nsus: G.N + (G.P || 0), Ninst: q.N, Hinst: q.H, Hsus: RF.H + psi0T * T.H });
  }
  const q0 = Q[0] || { N: 0, H: 0, psi0: 0.75 };
  out.push({ label: 'ELU température', ls: 'ELU', Nsus: 1.35 * G.N + (G.P || 0), Ninst: 1.35 * (q0.psi0 ?? 0.4) * q0.N, Hinst: 0, Hsus: 1.35 * RF.H + 1.5 * T.H });
  out.push({ label: 'ELS car. température', ls: 'ELS', Nsus: G.N + (G.P || 0), Ninst: (q0.psi0 ?? 0.4) * q0.N, Hinst: 0, Hsus: RF.H + T.H });
  for (const c of out) { c.N = c.Nsus + c.Ninst; c.H = c.Hsus + c.Hinst; }
  return out;
}
