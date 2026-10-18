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
const L0s = (Ls, code) => Ls[0][code].found;

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

  if (sup.seisme) {
    h2('Séisme — EN 1998-2, méthode du mode fondamental (moteur de Pont EC8)');
    if (sup.seisme.error) para(`Calcul sismique impossible : ${sup.seisme.error}`);
    else {
      const sz = sup.sp.ec8;
      table(['Grandeur', 'Longitudinal (X)', 'Transversal (Y)'], [
        ['Période T (propriétés inférieures des élastomères) [s]', F3(sup.seisme.T.x), F3(sup.seisme.T.y)],
        ['Effort sismique total (propriétés supérieures) [kN]', F0(sup.seisme.F.x), F0(sup.seisme.F.y)],
        ['Coefficient de comportement q', F2(sup.sp.seisme.q.long), F2(sup.sp.seisme.q.trans)],
      ]);
      table(['Ligne', 'X + 0,3 Y + 0,3 Z : F_x / F_y / F_z [kN]', '0,3 X + Y + 0,3 Z', '0,3 X + 0,3 Y + Z', 'Déplacement tête / appareils X [cm]'], sup.seisme.efforts.appuis.map((a, i) => [lineName(Ls[i], n), ...a.cas.map(k => `${F0(k.Fx)} / ${F0(k.Fy)} / ${F0(k.Fz)}`), `${F2(a.dTete.x * 100)} / ${F2(a.dAppareils.x * 100)}`]), { small: true });
      comment(`Zone ${sz.zone}, catégorie d'importance ${sz.categorie}, sol de classe ${sz.classeSol} (arrêté du 26 octobre 2011, NF EN 1998-1/NA et 1998-2/NA) ; masse ${F0(sup.seisme.M)} t ; tablier rigide, efforts répartis selon les raideurs (appareils et fûts), propriétés limites des élastomères, combinaison des directions 100/30/30, réactions verticales forfaitaires (guide Cerema « Ponts en zone sismique », 2015). Combinaison sismique G + ψ₂,₁ Q + A_Ed (ψ₂,₁ = 0), matériaux en situation accidentelle (γ_b = 1,15 BAEL / γ_c = 1,2 EC2, γ_s = 1,0), portance des fondations ELU accidentel. Non pris en compte : inertie propre des fûts, surpoussée dynamique des terres sur les culées (Mononobe-Okabe), dispositions de ductilité ; la note sismique complète (appareils, repos d'appui, joints) s'obtient dans Pont EC8 par l'export du projet.${sup.seisme.problemes.length ? ' Alertes de Pont EC8 : ' + sup.seisme.problemes.map(p => `${p.cible} : ${p.message}`).join(' ; ') : ''}`);
    }
  }
  const ch = sup.sp.choc;
  if ((ch.vehicule && ch.vehicule !== 'aucun') || (ch.bateau && ch.bateau !== 'aucun')) {
    comment(`Chocs sur les piles (EN 1991-1-7, valeurs recommandées à confronter à l'annexe nationale et au cahier des charges) : combinaison accidentelle G + A_d + ψ₁,₁ Q (TS 0,75, UDL 0,4) ; force max(F_dx ; F_dy) appliquée dans le sens longitudinal de l'ouvrage (le plus défavorable pour un voile), à ${F2(ch.hV)} m au-dessus de la semelle pour les véhicules${ch.bateau !== 'aucun' ? `, choc de bateau frontal F_dx à ${F2(ch.hB)} m` : ''} ; pour une pile à colonnes, le choc est repris par une seule colonne.`);
  }

  const wat = (sup.water || []).map((w, i) => (w ? { w, L: Ls[i] } : null)).filter(Boolean);
  if (wat.length) {
    const e = sup.sp.eau;
    h2('Piles en rivière — courant, embâcles, affouillement');
    table(['Ligne', 'Hauteur mouillée [m] ; b ⊥ courant [m]', 'F_wa [kN] (k_wa)', 'F_deb [kN]', 'M pied de fût [kN·m]', 'Archimède fût [kN]', 'Fr ; K₁ K₂ K₃', 'y_s local [m]', 'Affouillement total [m]', 'Fondation'], wat.map(({ w, L }) => {
      const f = L[code].found;
      const fo = f.type === 'superficielle' ? (f.scour ? `base à ${F2(f.scour.De)} m : ${f.scour.ok ? 'OK' : 'NON (affouillable)'}` : '—')
        : (f.scour ? `pieu dégagé ${F2(f.scour.expo)} m ; portance crue ELU ${F2(f.scour.ratioELU)} ${ok(f.scour.ratioELU)} / ELS ${F2(f.scour.ratioELS)} ${ok(f.scour.ratioELS)}` : '—');
      return [lineName(L, n), `${F2(w.hw)} ; ${F2(w.bProj)}`, `${F0(w.cur.F)} (${F2(w.nez === 'cylindre' || w.nez === 'groupe' ? 0.7 : 1.44)})`, F0(w.deb.F), F0(w.M), F0(w.Ushaft), `${F2(w.scour.Fr)} ; ${F2(w.scour.K1)} ${F2(w.scour.K2)} ${F2(w.scour.K3)}`, `${F2(w.scour.ys)}${w.scour.capped ? ' (plafond)' : ''}`, F2(w.dAff), fo];
    }), { small: true });
    comment(`Crue de projet : h = ${F2(e.h)} m (PHE − lit), v = ${F2(e.v)} m/s, biais ${F1(e.theta)}°. Courant EN 1991-1-6 § 4.9 (4.1) : F_wa = ½ k_wa ρ_w h b v², k_wa = 1,44 (section rectangulaire) ou 0,70 (circulaire), b largeur perpendiculaire au courant (voile : a cos θ + L sin θ ; colonnes : n Ø, sans effet de masque) ; hypothèse PSIDA : pression triangulaire maximale en surface, résultante à 2h/3 au-dessus du lit. Embâcles (4.2) : F_deb = k_deb A_deb v², k_deb = 666 kg/m³, radeau sous la surface libre. Efforts appliqués au fût dans le sens du courant (transversal à l'ouvrage) ; combinaisons de crue ${isF ? 'ELU 1,35 G + 1,5 F_eau, ELS G + F_eau (comme le vent, BAEL annexe D, sans trafic)' : 'ELU 1,35 G + 1,5 F_eau + 1,35 ψ₀ Q, ELS car. G + F_eau + ψ₀ Q (ψ₀ TS 0,75, UDL 0,4)'} — coefficients à confirmer selon le CCTP ; poussée d'Archimède ρ g V au niveau des PHE sur le fût et la semelle. Affouillement local FHWA HEC-18 (équation CSU) : y_s = 2,0 K₁ K₂ K₃ a^0,65 y₁^0,35 Fr^0,43, K₁ avant-bec (carré 1,1 ; arrondi, cylindre 1,0 ; pointu 0,9 ; 1,0 si θ > 5°), K₂ = (cos θ + L/a sin θ)^0,65 (L/a ≤ 12), K₃ état du lit, y_s ≤ 2,4 a (Fr ≤ 0,8) ou 3,0 a ; affouillement général et de contraction saisi (${F2(e.hGen)} m), à établir par l'étude hydraulique. Conséquences : semelle superficielle — base sous le fond affouillé, encastrement D_e et surcharge q₀ comptés sous ce fond ; pieux — longueur dégagée sans réaction latérale (Winkler) ni frottement, portance recalculée à pointe inchangée. Protection (enrochements) et affouillement autour des groupes de pieux ou des semelles débordantes (piles complexes, HEC-18 § 7.4) : non traités.`);
  }

  h2('Efforts en tête et en pied des fûts (combinaisons les plus défavorables)');
  const rows = [];
  for (const L of Ls) {
    const r = L[code];
    const pick = ls => { const bs = r.base.filter(b => b.ls === ls); const nmax = bs.reduce((a, b) => (b.Nb > a.Nb ? b : a), bs[0]); const mmax = bs.reduce((a, b) => (Math.abs(b.Mb) > Math.abs(a.Mb) ? b : a), bs[0]); return { nmax, mmax }; };
    for (const ls of ['ELU', 'ELS', 'ACC']) {
      if (!r.base.some(b => b.ls === ls)) continue;
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
  if (sup.profiles) {
    for (const pr of sup.profiles) {
      const used = Ls.filter(L => L.profile === pr.name).map(L => lineName(L, n));
      B.push({ t: 'p', text: `Profil pressiométrique ${pr.name}${used.length ? ` — ${used.join(', ')}` : ' (non utilisé)'}` });
      table(['Couche', 'Profondeur [m]', 'Classe (F62)', 'Catégorie NF P 94-261/262', 'p*_l [MPa]', 'E_M [MPa]', 'α'], pr.layers.map((l, k) => [String(k + 1), `${F2(l.z0)} – ${F2(l.z1)}`, l.classe, l.sol, F2(l.pl), F1(l.EM), F2(l.alpha)]));
    }
  }
  if (fType === 'superficielle') {
    table(['Ligne', 'p*_le [MPa] ; D_e [m] ; k_p (assise)', 'Semelle B × L × h [m]', 'V/R_v max', 'H/R_h max (ELU)', 'Excentrement', 'Bielles d ≥ (B − b)/4 ; e ≤ B/6', 'A_s // B [cm²]', 'A_s ⊥ B [cm²/m]'], Ls.map(L => { const f = L[code].found; const w = f.checks.reduce((a, k) => (k.ratioV > a.ratioV ? k : a), f.checks[0]); return [lineName(L, n), `${F2(w.ple)} ; ${F2(w.De)} ; ${F2(w.kp)} (${w.classe})`, `${F2(f.B)} × ${F2(f.L)} × ${F2(f.hs)}`, `${F2(f.worstV)} ${ok(f.worstV)}`, `${F2(f.worstH)} ${ok(f.worstH)}`, f.excOk ? 'OK' : 'NON', `${f.bielles.dOk ? 'OK' : 'NON'} ; ${f.bielles.eOk ? 'OK' : 'NON (calcul en console)'}`, CM(f.AsLong), CM(f.AsTransPerM)]; }));
    comment(isF ? 'Fascicule 62 titre V (annexes B.1, B.2, E.2, F.1) : p*_le moyenne géométrique de p*_l sur [D ; D + 1,5 B], D_e = (1/p*_le)∫p*_l dz, classe de la couche d\'assise ; k_p = k₀[1 + a(0,6 + 0,4 B/L) D_e/B] selon la classe de sol (D_e/B ≤ 2,5) ; q\'_ref = (3 q_max + q_min)/4 ≤ i_δβ k_p p*_le/γ_q + q\'_0 (γ_q = 2 ELU, 3 ELS rares), i_δβ = Φ₁(δ) (sols cohérents) ou Φ₂(δ, D_e/B) (sols frottants) ; surface comprimée ≥ 10 % (ELU), 75 % (ELS rares) ; glissement (ELU) V tan φ\'/1,2 + c\'A\'/1,5 (c\' ≤ 75 kPa). Ferraillage par bielles A = N\'(B − b)/(8 d f_su), N\' = N(1 + 3e/B), minimum 0,12 % par nappe (PP73 1.1.1). Combinaisons fréquentes (sol entièrement comprimé) non vérifiées.'
      : 'NF P 94-261 (annexe D, guide Cerema 2015) : p*_le moyenne géométrique de p*_l sur [D ; D + h_r] (h_r = 1,5 B, réduit selon l\'excentrement à l\'ELU), D_e = (1/p*_le)∫p*_l dz ; k_p (tableau D.2.3, D_e/B ≤ 2), i_δ (D.2.4), R_v;d = A\' k_p p*_le i_δ/(γ_R;v γ_R;d;v), γ_R;v = 1,4 (ELU), 2,3 (ELS), γ_R;d;v = 1,2, R₀ = A q₀ déduit ; A\' = A(1 − 2e/B) ; 1 − 2e/B ≥ 1/15 (ELU), 1/2 (ELS car.) ; glissement (ELU) V tan φ\'/(γ_R;h γ_R;d;h), γ_R;h = γ_R;d;h = 1,1. Ferraillage par bielles, minimum 0,12 % par nappe. ELS quasi-permanent (1 − 2e/B ≥ 2/3) non vérifié.');
  } else {
    table(['Ligne', 'Pieux', 'k Ménard en tête court / long [kN/m³]', 'N max / min ELU [kN]', 'N max ELS [kN]', 'M max pieu [kN·m]', 'Portance ELU / ELS', 'Groupe C_e ; taux', 'A_s pieu [cm²]'], Ls.map(L => {
      const f = L[code].found, mm = Math.max(...f.rows.filter(r => r.ls === 'ELU').map(r => r.Mmax));
      const trac = (f.NminU < 0 ? ` ; traction ELU ${F2(f.capRatio.traction)} ${ok(f.capRatio.traction)}` : '') + (f.capRatio.ACC ? ` ; accidentel ${F2(f.capRatio.ACC)} ${ok(f.capRatio.ACC)}` : '');
      return [lineName(L, n), `${f.nF} × ${f.nP} Ø ${F2(f.D)}, L = ${F1(f.Lpile)}`, `${F0(f.k)} / ${F0(f.k / 2)}`, `${F0(f.NmaxU)} / ${F0(f.NminU)}`, F0(f.NmaxS), F0(mm), f.cap.applicable ? `${F2(f.capRatio.ELU)} ${ok(f.capRatio.ELU)} / ${F2(f.capRatio.ELS)} ${ok(f.capRatio.ELS)}${trac}` : `non calculable : ${f.cap.motif}`, f.group ? `${F2(f.group.Ce)} ; ${F2(f.group.ratio)} ${ok(f.group.ratio)}` : '—', `${CM(f.As)} (min ${CM(f.Amin)})`];
    }), { small: true });
    const f0 = Ls[0][code].found;
    if (f0.nF === 2) {
      h2('Semelles sur deux files de pieux — méthode des bielles (PP73 1.3.2 ch. 4)');
      table(['Ligne', 'h utile [m]', 'Angle des bielles', 'h_s ≥ max(0,60 ; 1,4 Ø)', 'A₁ par couple ELU / ELS [cm²]', 'A₁ total [cm²]', 'Bande Ø + h_s [m]', "A'₁ et A₂ [cm²/m]", 'Ancrage ≥ 0,8 R/σ̄ [cm²]', 'Poinçonnement pieu'], Ls.map(L => {
        const t = L[code].found.tie;
        return [lineName(L, n), F2(t.h), `${F1(t.theta)}° ${t.thetaOk ? 'OK' : 'NON (< 45° : calcul en dalle)'}`, t.hOk ? 'OK' : `NON (${F2(t.hmin)} m)`, `${CM(t.A1U)} / ${CM(t.A1S)}`, CM(t.total), F2(t.band), CM(t.A2), CM(t.Aanchor), `${F0(L[code].found.NmaxS)} / ${F0(t.Rpunch)} kN ${t.punchOk ? 'OK' : 'NON'}`];
      }), { small: true });
      comment(`PP73 pièce 1.3.2 § 4.3 : tirant par couple de pieux A₁ = R (l/2 − b/4)/(h σ̄), R = réaction la plus élevée d'un pieu du couple, à l'ELU (f_su) et à l'ELS (σ̄_s = ${F1(L0s(Ls, code).sigSels)} MPa${isF ? ', fissuration très préjudiciable' : ', 0,8 f_yk'}) ; domaine : bielles inclinées à 45° au moins (h ≥ l/2 − b/4) ; A₁ réparti sur Ø + h_s au droit des pieux ; armatures de répartition A'₁ et longitudinales A₂ ≥ 1/3 de la densité de A₁ ; poinçonnement du pieu d'angle R ≤ (2/3)(h + Ø) h σ₂₈ (σ₂₈ = 2 MPa). La note du Pont de Noé applique au tirant la charge totale de la semelle au lieu de la réaction d'un pieu.`);
    } else if (f0.nF === 1) {
      h2('Semelles filantes sur une file de pieux');
      table(['Ligne', 'M⁻ / M⁺ [kN·m]', 'V [kN]', 'A_s sup / inf [cm²]'], Ls.map(L => { const b = L[code].found.capBeam; return [lineName(L, n), `${F0(b.Mneg)} / ${F0(b.Mpos)}`, F0(b.V), `${CM(b.AsTop)} / ${CM(b.AsBot)}`]; }));
      comment('Poutre continue sur les pieux (appuis rigides) sous le voile (charge répartie) ou les colonnes (charges ponctuelles), ELU ; minimum 0,12 % par face. Les pieux reprennent en tête H/n et M/n (pas d\'encastrement longitudinal par la semelle), superposés dans le calcul de Winkler.');
    }
    comment(`Efforts : semelle rigide N_k = N/n ± (M − n M_tête) x_k/Σx² (deux files, pieux encastrés en tête) ; pieu de Winkler (différences finies), module de Ménard couche par couche (profil pressiométrique ; Fascicule 62 C.5, NF P 94-262 I) en courte durée E_s = 12 E_M/[(4/3)(B₀/B)(2,65 B/B₀)^α + α] et en longue durée (moitié), enveloppe des deux. Portance : ${isF ? 'Fascicule 62 annexe C.3 (k_p, courbes Q1 à Q7 selon le type de pieu et la classe de sol, Q_c = 0,5 Q_pu + 0,7 Q_su), Q ≤ Q_u/1,4 (ELU), Q_c/1,1 (ELS rares), traction Q_tu/1,4 et Q_tc/1,4' : 'NF P 94-262 (modèle de terrain : k_p(D_ef/B), α_pieu-sol f_sol, γ_R;d1 γ_R;d2, γ_t = 1,1 ; ELS caractéristique R_c;cr/0,9)'} ; effet de groupe ${isF ? 'Fascicule 62 annexe G.1 (sols cohérents C_e = ¼(1 + d/B), frottants C_e = 1)' : 'NF P 94-262 annexe J.2'}. Béton de pieu ${isF ? `f_c = min(f_c28 ; f_lim)/(k₁ k₂) = ${F1(f0.pileConc.fc)} MPa (k₁ = ${F2(f0.pileConc.k1)}, k₂ = ${F2(f0.pileConc.k2)})` : 'γ_c × 1,1 (EC2 § 2.4.2.5)'} ; minimum ${isF ? '0,5 % (DTU 13.2)' : 'NF EN 1536 § 7.5.2'}. Frottement négatif (remblai récent sur sol compressible) : étude spécifique, non calculé.`);
  }
  para('Fondations : modules géotechniques du bureau de calcul fond.ksr-infra.org (Fascicule 62 titre V, NF P 94-261, NF P 94-262), relus sur les textes ; semelles sur pieux selon PP73 pièce 1.3.2 ch. 4. Les valeurs de la note des appuis du Pont de Noé (rigidités, répartition, descente de charges, pieux, Ménard) sont reproduites par les tests.');
  return B;
}

/** Note de calcul « appuis et fondations » seule (modèle commun noteToHTML / noteToDocx). */
export function supportsNote(sup, { ref = 'F61', version = '', standalone = false, spans = [] } = {}) {
  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const title = `Note de calcul — appuis et fondations — ${ref === 'F61' ? 'Fascicule 61 / BAEL 91 / Fascicule 62 titre V' : 'Eurocodes (EN 1990, 1991, 1992, 1997, 1998-2)'}`;
  const blocks = [{ t: 'h1', text: '1. Données' }, { t: 'p', text: `Ouvrage de ${spans.length} travée(s) : ${spans.join(' – ')} m. ${standalone ? 'Réactions d\'appui par ligne saisies (tablier quelconque, valeurs caractéristiques, majorations dynamiques incluses).' : 'Réactions d\'appui issues du calcul du tablier (pont-dalle).'}` },
    { t: 'h1', text: '2. Appuis et fondations' }, ...supportsBlocks(sup, ref)];
  return { title, meta: `${today} · calcul PSIDA v${version}`, blocks };
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
