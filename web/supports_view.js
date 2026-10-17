/**
 * Appuis et fondations : blocs de présentation (titres, paragraphes, tableaux, commentaires) communs à l'interface et à
 * la note de calcul (HTML / Word), sur le plan de la note des appuis du Pont de Noé : souplesses → efforts en tête →
 * descente en pied → fûts → chevêtres → garde-grève et murs en retour → fondations.
 */
const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F2 = v => F(v, 2), F3 = v => F(v, 3);
const CM = v => (v === null || !Number.isFinite(v) ? 'impossible' : F(v * 1e4, 1));
const lineName = (L, n) => `${L.kind === 'culee' ? 'Culée' : 'Pile'} ${L.i + 1}`;
const TYPE = { voile: 'pile voile', colonnes: 'pile à colonnes', remblayee: 'culée remblayée', enterree: 'culée enterrée' };
const ok = r => (r <= 1 + 1e-9 ? 'OK' : 'NON');

/** @param {object} sup résultat de computeSupports ; ref 'F61' (BAEL / F62-V) ou 'EC' */
export function supportsBlocks(sup, ref = 'F61') {
  const B = [], code = ref === 'F61' ? 'BAEL' : 'EC', isF = code === 'BAEL';
  const h2 = text => B.push({ t: 'h2', text }), para = text => B.push({ t: 'p', text }), comment = text => B.push({ t: 'comment', text });
  const table = (head, rows, opt = {}) => B.push({ t: 'table', head, rows, ...opt });
  const dist = isF ? sup.distB : sup.distE, Ls = sup.lines, n = Ls.length;

  h2('Souplesses des lignes d\'appui et répartition des efforts horizontaux');
  table(['Ligne', 'Type', 'x [m]', 'K instantané [kN/m]', 'K différé [kN/m]', isF ? 'Freinage A(l) [kN]' : 'Freinage Q_lk [kN]', isF ? 'Freinage Bc [kN]' : '', isF ? 'Retrait+fluage / TLD / TCD [kN]' : 'Retrait+fluage / température [kN]'].filter(Boolean),
    Ls.map((L, i) => {
      const bk = dist.braking(1)[i];
      const imp = isF ? [dist.imposed(sup.eps.RF).H[i], dist.imposed(sup.eps.TLD).H[i], dist.imposed(sup.eps.TCD, 'inst').H[i]] : [dist.imposed(sup.eps.RF).H[i], dist.imposed(sup.eps.T).H[i]];
      return [lineName(L, n), TYPE[L.type], F2(L.x), F0(dist.K.inst[i]), F0(dist.K.diff[i]), isF ? F1(sup.braking.F61.A * bk) : F1(sup.braking.EC * bk), ...(isF ? [F1(sup.braking.F61.Bc * bk)] : []), imp.map(F1).join(' / ')];
    }));
  comment(`Souplesse d'une ligne = souplesse des appareils en élastomère fretté T_e/(n G a b) (G = 1,8 MPa instantané, 0,9 MPa différé ; T_e enrobages compris) + souplesse du fût console H³/(3EI) (${isF ? 'E_i = 11 000 f_c28^(1/3), E_v = 3 700 f_c28^(1/3)' : 'E_cm, E_cm/3 en différé'}) ; fondation supposée rigide, culée remblayée rigide. Freinage réparti au prorata des rigidités instantanées ; déformations imposées ε : H_i = K_i ε (x₀ − x_i), centre de déformation x₀ = ${F2(dist.x0.diff)} m (différé) / ${F2(dist.x0.inst)} m (instantané) ; ε retrait + fluage = ${F(sup.eps.RF * 1e4, 2)}·10⁻⁴${isF ? `, TLD ${F(sup.eps.TLD * 1e4, 1)}·10⁻⁴ (K différé), TCD ${F(sup.eps.TCD * 1e4, 1)}·10⁻⁴ (K instantané)` : `, température α ΔT_N = ${F(sup.eps.T * 1e4, 1)}·10⁻⁴`}. ${isF ? `Freinage Fascicule 61 : A(l) H = A·S/(20 + 0,0035 S) = ${F0(sup.braking.F61.A)} kN (S = ${F0(sup.braking.F61.S)} m²) ; Bc un camion de 300 kN.` : `Freinage EN 1991-2 § 4.4.1 : Q_lk = ${F0(sup.braking.EC)} kN (groupe gr2).`}`);

  h2('Efforts en tête et en pied des fûts (combinaisons les plus défavorables)');
  const rows = [];
  for (const L of Ls) {
    const r = L[code];
    const pick = ls => { const bs = r.base.filter(b => b.ls === ls); const nmax = bs.reduce((a, b) => (b.Nb > a.Nb ? b : a), bs[0]); const mmax = bs.reduce((a, b) => (Math.abs(b.Mb) > Math.abs(a.Mb) ? b : a), bs[0]); return { nmax, mmax }; };
    for (const ls of ['ELU', 'ELS']) {
      const { nmax, mmax } = pick(ls);
      rows.push([`${lineName(L, n)} ${ls}`, F0(nmax.N), F0(nmax.Nb), nmax.label, F0(mmax.Nb), F1(mmax.H), F1(mmax.Hb), F0(mmax.Mb), mmax.label]);
    }
  }
  table(['Ligne', 'N tête max [kN]', 'N pied max [kN]', 'Combinaison', 'N pied concomitant [kN]', 'H tête [kN]', 'H pied [kN]', 'M pied max [kN·m]', 'Combinaison'], rows, { small: true });
  comment(isF ? 'BAEL 91 annexe D (ponts routes) : ELU 1,35 G + 1,35 (retrait + fluage) + 1,605 (A ou B + freinage) + 0,78 TLD, Mc120 × 1,35 ; ELS G + retrait + fluage + 1,2 (A ou B + freinage) + 0,6 TLD ; température dominante 1,35 / 1,0 (TLD + TCD). Efforts horizontaux cumulés en valeur absolue (freinage dans le sens le plus défavorable). Culées : poussée des terres K_a γ h²/2 et surcharge de remblai sur le mur de front (garde-grève compris) × 1,35 / 1,605, poids propres × 1,35.'
    : 'EN 1990 annexe A2 (approche 2) : ELU 1,35 G + 1,35 (gr1a ou gr2) + 1,5 ψ₀ T ; température dominante 1,35 G + 1,5 T + 1,35 ψ₀ trafic ; ELS caractéristiques correspondantes. Culées : poussée des terres et surcharge de remblai × 1,35.');

  h2('Fûts et voiles — flambement, second ordre, ferraillage en flexion composée');
  table(['Ligne', 'Section', 'λ', 'σ_cr [MPa]', 'Méthode du second ordre', 'M_Ed retenu [kN·m]', 'A_s calcul [cm²] (par fût ou par m)', 'A_s min [cm²]', 'A_s retenu [cm²]'], Ls.map(L => {
    const s = L[code].shaft, w = s.rows.reduce((a, b) => ((b.As ?? Infinity) > (a.As ?? Infinity) || a === null ? b : a), s.rows[0]);
    const sec = L.kind === 'culee' ? (L.type === 'remblayee' ? `mur ${F2(sup.sp.culee.em)} m (par m)` : `${sup.sp.culee.nCol} col. Ø ${F2(sup.sp.culee.D)}`) : (L.type === 'voile' ? `voile ${F2(sup.sp.pile.b)} × ${F2(sup.Lv)}` : `${sup.sp.pile.nCol} col. Ø ${F2(sup.sp.pile.D)}`);
    return [lineName(L, n), sec, F1(s.buckling.lambda), F1(s.buckling.sigCr), w.secondOrder.method, F0(w.Mtot), CM(s.AsReq), CM(s.mins.min), CM(s.As)];
  }), { small: true });
  comment(`${isF ? 'BAEL 91 A.4.4 : l_f = 2 H (console libre en tête, appareils souples), méthode forfaitaire si l_f/h ≤ max(15 ; 20 e₁/h) ; au-delà, moment amplifié N(e₁ + e_a)/(1 − N/N_cr), N_cr = π² E_v I/l_f² (justification simplifiée de l\'état limite de stabilité de forme). Minimum A.8.1,21 : max(4 cm²/m de parement ; 0,2 % B).' : 'EN 1992-1-1 § 5.8 : λ_lim = 20 A B C/√n ; au-delà, courbure nominale (§ 5.8.8, K_r = K_φ = 1) ; imperfection θ_i l₀/2 ; e₀ ≥ max(h/30 ; 20 mm). Minimums § 9.5.2 / 9.6.2.'} Section N-M à fibres (pivots A, B, C), armatures symétriques ; pour les colonnes et le mur de culée, efforts partagés entre colonnes ou ramenés au mètre. Flexion transversale (déviée) non prise en compte.`);

  const caps = Ls.filter(L => L[code].cap);
  if (caps.length) {
    h2('Chevêtres sur colonnes');
    table(['Ligne', 'P_u par appareil [kN]', 'M⁻ / M⁺ [kN·m]', 'V max [kN]', 'A_s sup / inf [cm²]', 'A min 0,5 % [cm²]'], caps.map(L => { const c = L[code].cap; return [lineName(L, n), F0(c.Pu), `${F0(c.Mneg)} / ${F0(c.Mpos)}`, F0(c.V), `${CM(c.AsTop)} / ${CM(c.AsBot)}`, CM(c.Amin)]; }));
    comment('Poutre continue sur les colonnes (appuis rigides ; console encastrée pour une colonne unique), chargée par les réactions ELU des appareils (coefficients d\'inégalité de répartition) et son poids propre ; minimum 0,5 % de la section par face (pratique PP73, note Noé).');
  }

  const cul = Ls.filter(L => L.kind === 'culee');
  if (cul.length) {
    h2('Culées — mur garde-grève, murs en retour');
    const L0 = cul[0], r = L0[code];
    table(['Élément', 'Dimensions', 'Moments [kN·m/m ou kN·m]', 'A_s [cm²]'], [
      ['Garde-grève', `h = ${F2(r.gg.h)} m, e = ${F2(r.gg.e)} m`, `M_t ${F1(r.gg.Mt)} ; M_p ${F1(r.gg.Mp)} ; M_f ${F1(r.gg.Mf)} → ELU ${F1(r.gg.ELU)} / ELS ${F1(r.gg.ELS)}`, `${CM(r.gg.As)} /m (face arrière)`],
      ['Mur en retour', `L = ${F2(r.retour.L)} m, h = ${F2(r.retour.h)} m, e = ${F2(r.retour.e)} m`, `M_h ${F0(r.retour.Mh)} ; M_v ${F0(r.retour.Mv)} (T_h ${F0(r.retour.Th)}, T_v ${F0(r.retour.Tv)} kN)`, `horiz. ${CM(r.retour.AsH)} ; sup. ${CM(r.retour.AsV)}`],
    ]);
    comment(`Garde-grève (PP73 1.3.2) : poussée des terres K γ h³/6, poussée d'un essieu Bc derrière le mur 12K'/(0,75 + 2h)∫(h − x)/(0,25 + x)dx et freinage d'une roue 6h/(0,25 + 2h) [t·m/m], K = K_a = ${F3(sup.Ka)} ; ELU 1,35 / 1,6. Murs en retour suspendus : poids propre, 3 kN/m, 40 kN vertical et 20 kN horizontal en bout, poussée conventionnelle (h/3 + 0,5) t/m² sur L·h/2 ; épaisseur ≥ max(0,30 ; (L + 2)/20). Règles de pratique à confronter au texte de PP73 (formules reprises de la littérature).`);
  }

  h2('Fondations');
  const fType = Ls[0][code].found.type;
  if (fType === 'superficielle') {
    table(['Ligne', 'Semelle B × L × h [m]', 'V/R_v max', 'H/R_h max', 'Excentrement', 'A_s // B [cm²]', 'A_s ⊥ B [cm²/m]'], Ls.map(L => { const f = L[code].found; return [lineName(L, n), `${F2(f.B)} × ${F2(f.L)} × ${F2(f.hs)}`, `${F2(f.worstV)} ${ok(f.worstV)}`, `${F2(f.worstH)} ${ok(f.worstH)}`, f.excOk ? 'OK' : 'NON', CM(f.AsLong), CM(f.AsTransPerM)]; }));
    comment(isF ? 'Fascicule 62 titre V : q\'_ref = (3 q_max + q_min)/4 ≤ q\'_0 + i_δ k_p p*_le/γ_q (γ_q = 2 ELU, 3 ELS) ; surface comprimée ≥ 10 % (ELU), 75 % (ELS) ; glissement V tan φ\'/1,2 + c\'A\'/1,5. k_p selon NF P 94-261 (paramètres du guide Cerema 2015). Ferraillage par bielles A = N\'(B − b)/(8 d f_su), N\' = N(1 + 3e/B).'
      : 'NF P 94-261 : R_v;d = A\' k_p p*_le i_δ/(γ_R;v γ_R;d;v), γ_R;v = 1,4 (ELU), 2,3 (ELS), γ_R;d;v = 1,2 ; Meyerhof B\' = B − 2e ; 1 − 2e/B ≥ 1/15 (ELU), 1/2 (ELS car.) ; glissement V tan φ\'/(1,1 × 0,9). Ferraillage par bielles.');
  } else {
    table(['Ligne', 'Pieux', 'k Ménard [kN/m³]', 'N max / min ELU [kN]', 'N max ELS [kN]', 'M max pieu [kN·m]', 'Portance ELU / ELS', 'A_s pieu [cm²]', 'Tirant semelle [cm²]'], Ls.map(L => {
      const f = L[code].found, mm = Math.max(...f.rows.filter(r => r.ls === 'ELU').map(r => r.Mmax));
      return [lineName(L, n), `${f.nF} × ${f.nP} Ø ${F2(f.D)}, L = ${F1(f.Lpile)}`, F0(f.k), `${F0(f.NmaxU)} / ${F0(f.NminU)}${f.NminU < 0 ? ' (traction)' : ''}`, F0(f.NmaxS), F0(mm), `${F2(f.capRatio.ELU)} ${ok(f.capRatio.ELU)} / ${F2(f.capRatio.ELS)} ${ok(f.capRatio.ELS)}`, `${CM(f.As)} (min ${CM(f.Amin)})`, f.tie ? CM(f.tie) : '—'];
    }), { small: true });
    comment(`Semelle rigide : N_k = N/n ± (M − n M_tête) x_k/Σx² ; pieux tête encastrée, poutre de Winkler (différences finies), module de réaction de Ménard E_s = 12 E_M/[(4/3)(B₀/B)(2,65 B/B₀)^α + α], k = E_s/B (Fascicule 62 V annexe C.5) ; portance pressiométrique NF P 94-262 simplifiée (une couche, f_sol, k_p = 1,15) ${isF ? 'avec Q_u/1,4 (ELU) et Q_c/1,1 (ELS), Q_c = 0,5 R_b + 0,7 R_s' : 'R_c;d = (R_b + R_s)/(1,15 × 1,1 × 1,1), R_c;cr;d = (0,5 R_b + 0,7 R_s)/(1,15 × 1,1 × 0,9)'} ; béton de pieu ${isF ? 'f_c = min(f_c28 ; 25)/(k₁k₂), k₁ = 1,2, k₂ = 1,05' : 'γ_c × 1,1 (EC2 § 2.4.2.5)'} ; minimum ${isF ? '0,5 % (DTU 13.2)' : 'NF EN 1536 § 7.5.2'}. Semelle à deux files : tirant par bielles A = R (l/2 − b/4)/(h σ_s), R = réaction d'une file (FOND 72).`);
  }
  para('Les règles marquées « à vérifier » dans la documentation (PP73 culées, FOND 72, Fascicule 62 titre V, NF P 94-261/262 hors tableau des k_p) sont reprises de la littérature de pratique ; les valeurs de la note des appuis du Pont de Noé (rigidités, répartition, descente de charges, pieux, Ménard, bielles) sont reproduites par les tests.');
  return B;
}

/** Rendu HTML minimal des blocs (interface). */
export function blocksToHTML(blocks) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return blocks.map(b => {
    if (b.t === 'h2') return `<h3>${esc(b.text)}</h3>`;
    if (b.t === 'p') return `<p class="small">${esc(b.text)}</p>`;
    if (b.t === 'comment') return `<p class="small" style="font-style:italic">${esc(b.text)}</p>`;
    if (b.t === 'table') return `<table><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c).replace(/\bNON\b/g, '<span class="badge warn">NON</span>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return '';
  }).join('');
}
