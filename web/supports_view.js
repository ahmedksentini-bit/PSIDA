/**
 * Appuis et fondations : blocs de présentation (titres, paragraphes, tableaux, commentaires) communs à l'interface et à
 * la note de calcul (HTML / Word), sur le plan de la note des appuis du Pont de Noé : souplesses → efforts en tête →
 * descente en pied → fûts → chevêtres → garde-grève et murs en retour → fondations.
 */
import { profilPressio } from '../src/vendor/fond-figures.js';
import { seismicBlocks } from './seismic_note.js';
import { menardSchema, bulbSchema, footingRebarSchema, pileRebarSchema, capRebarSchema } from './fond_plans.js';
import { svgBlock, supportSchema, distributionChart, sideBySide, pairWidth, pileProfileCharts, footingPressureChart, barChart } from './note_figures.js';

/** Figure du sondage (bureau de calcul fond.ksr-infra.org) : essais, ou à défaut valeurs de couche en escalier. */
export function profileFigure(pr, bandes = []) {
  const couches = pr.layers.map(l => ({ z0: l.z0, z1: l.z1, sol: l.classe, nom: l.classe }));
  const essais = pr.tests && pr.tests.length ? pr.tests
    : pr.layers.flatMap(l => [{ z: l.z0, EM: l.EM, plNette: l.pl }, { z: l.z1 - 1e-3, EM: l.EM, plNette: l.pl }]);
  const nat = c => String(c).split('-')[0];
  const seuils = pr.layers.map(l => ({ z0: l.z0, z1: l.z1, valeurs: nat(l.classe) === 'argile' ? [9, 16] : nat(l.classe) === 'limon' ? [8, 14] : nat(l.classe) === 'grave' ? [6, 10] : [7, 12] }));
  const zMax = Math.max(...pr.layers.map(l => l.z1), ...bandes.map(b => b.z1), ...essais.map(e => e.z)) + 0.5;
  return profilPressio({ couches, essais, seuils, bandes, zMax: Math.ceil(Math.min(zMax, Math.max(...bandes.map(b => b.z1 + 2), ...essais.map(e => e.z + 1), 10))), largeur: 640, hauteur: 480, titre: `Sondage ${pr.name}` });
}

const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
const F0 = v => F(v, 0), F1 = v => F(v, 1), F2 = v => F(v, 2), F3 = v => F(v, 3);
const CM = v => (v === null || !Number.isFinite(v) ? 'impossible' : F(v * 1e4, 1));
// même désignation que le tablier : culées C0 … Cn, piles P1 … (pile de joint : ligne d'extrémité)
const lineName = (L, n) => (L.kind === 'culee' ? `Culée C${L.i}` : L.joint ? `Pile de joint C${L.i}` : `Pile P${L.i}`);
const TYPE = { voile: 'pile voile', colonnes: 'pile à colonnes', remblayee: 'culée remblayée', enterree: 'pile-culée noyée', apparente: 'pile-culée apparente' };
const ok = r => (r <= 1 + 1e-9 ? 'OK' : 'NON');
const L0s = (Ls, code) => Ls[0][code].found;

/** @param {object} sup résultat de computeSupports ; ref 'F61' (BAEL / F62-V) ou 'EC' */
/**
 * @param {object} opts { noWater : sans la section « piles en rivière » (chapitre séparé de la note globale), onlyWater }
 */
export function supportsBlocks(sup, ref = 'F61', opts = {}) {
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
  comment(`Souplesse d'une ligne = souplesse des appareils en élastomère fretté T_e/(n G a b) (G = 1,8 MPa instantané, 0,9 MPa différé ; T_e enrobages compris) + souplesse du fût console H³/(3EI) (${isF ? 'E_i = 11 000 f_c28^(1/3), E_v = 3 700 f_c28^(1/3)' : 'E_cm, E_cm/3 en différé'}) ; ${sup.sp.found.type === 'superficielle' ? 'rotation de la semelle sur le sol h²/K_θ (h = hauteur du fût ou du mur + épaisseur de semelle ; K_θ = k L B³/12, k_i = 2 k_v en instantané, k_v en différé, tableau des fondations), mur de culée remblayée supposé indéformable' : 'souplesse u/T de la tête du groupe de pieux (modèle PSH, § fondations sur pieux), mur de culée remblayée supposé indéformable'}. Freinage réparti au prorata des rigidités instantanées ; déformations imposées ε : H_i = K_i ε (x₀ − x_i), centre de déformation x₀ = ${F2(dist.x0.diff)} m (différé) / ${F2(dist.x0.inst)} m (instantané) ; ε retrait + fluage = ${F(sup.eps.RF * 1e4, 2)}·10⁻⁴${isF ? `, TLD ${F(sup.eps.TLD * 1e4, 1)}·10⁻⁴ (K différé), TCD ${F(sup.eps.TCD * 1e4, 1)}·10⁻⁴ (K instantané)` : `, température α ΔT_N = ${F(sup.eps.T * 1e4, 1)}·10⁻⁴`}. ${isF ? `Freinage Fascicule 61 : A(l) H = A·S/(20 + 0,0035 S) = ${F0(sup.braking.F61.A)} kN (S = ${F0(sup.braking.F61.S)} m²) ; Bc un camion de 300 kN.` : `Freinage EN 1991-2 § 4.4.1 : Q_lk = ${F0(sup.braking.EC)} kN (groupe gr2).`}`);
  if (!opts.noFigures) try { const dc = distributionChart(sup, code); if (dc) B.push(svgBlock(dc, 'Raideurs des lignes d\'appui (instantanée, différée) et répartition du freinage')); } catch (e) { /* figure indisponible */ }

  // --- dalle précontrainte : réactions hyperstatiques et raccourcissements transmis aux appuis ---
  if (sup.hyp || sup.eps.psidp) {
    h2('Dalle précontrainte (PSI-DP) — actions transmises aux appuis');
    if (sup.hyp) table(['Ligne', 'Réaction hyperstatique de précontrainte max [kN]', 'min [kN]'], Ls.map((L, i) => [lineName(L, n), F0(sup.hyp.max[i]), F0(sup.hyp.min[i])]));
    const e = sup.eps.psidp;
    if (e) comment(`Réactions hyperstatiques de précontrainte : enveloppe des phases (mise en tension, mise en service, en service ; valeurs probable, P1 et P2) du calcul PSI-DP, ajoutées aux réactions permanentes avec le coefficient 1 dans toutes les combinaisons (BPEL), aux appareils d'appui, fûts et fondations. Raccourcissement du tablier pris pour les appuis : élastique à la mise en tension σ_m/E_ij = ${F(e.el * 1e4, 2)}·10⁻⁴ (σ_m = P∞/B = ${F2(e.sigm)} MPa) + fluage K_fl σ_m/E_i28 = ${F(e.fl * 1e4, 2)}·10⁻⁴ (K_fl = ${F2(e.Kfl)}, BPEL 2.1,5) + retrait postérieur à la mise en tension ε_r [1 − r(j)] = ${F(e.r * 1e4, 2)}·10⁻⁴ (ε_r = ${F(e.epsR * 1e4, 1)}·10⁻⁴, j = ${F0(e.j)} jours, r_m = ${F1(e.rm * 100)} cm, r(j) = ${F3(e.rj)}, BPEL 2.1,51) = ${F(e.total * 1e4, 2)}·10⁻⁴, au lieu de la valeur saisie ${F(sup.eps.RFsaisi * 1e4, 2)}·10⁻⁴ (cas de la dalle armée) ; appliqué avec les rigidités différées.`);
  }

  // --- appareils d'appui : NF EN 1337-3 (guide Sétra 2007) ---
  const brgs = Ls.map(L => L[code].brg).filter(b => b && !b.error);
  if (brgs.length) {
    h2('Appareils d\'appui en élastomère fretté — NF EN 1337-3 (guide Sétra 2007)');
    const okS = b => (b ? 'OK' : 'NON');
    table(['Ligne', 'Appareil (par ligne)', 'ε_q max ≤ 1', 'ε_t max ≤ 7', 'Flambement σ_m / σ_lim [MPa]', 'Rotation Σv_z / a′α/K_r [mm] (charge minimale)', 'Frettes t_s requis / t_s [mm]', 'Glissement F_xy / μ_e F_z [kN]', 'σ_m,min [MPa] ≥ 3', 'Verdict'],
      Ls.map(L => {
        const b = L[code].brg; if (!b || b.error) return [lineName(L, n), b && b.error ? `erreur : ${b.error}` : 'aucun appareil', '', '', '', '', '', '', '', ''];
        const rs = b.rows.filter(r => !r.indicatif), wq = rs.reduce((m, r) => (r.epsQ > m.epsQ ? r : m)), wt = rs.reduce((m, r) => (r.epsT > m.epsT ? r : m));
        const wb = rs.reduce((m, r) => (r.sig / r.sigBuck > m.sig / m.sigBuck ? r : m)), wf = rs.reduce((m, r) => (r.tsReq > m.tsReq ? r : m));
        const mr = rs.filter(r => r.minimal).concat(rs).reduce((m, r) => (!m || r.vz / r.vzReq < m.vz / m.vzReq ? r : m), null);
        const sl = b.slide;
        return [lineName(L, n), `${b.nb} × ${b.label}`, `${F2(wq.epsQ)} ${okS(wq.checks.distorsion)}`, `${F2(wt.epsT)} ${okS(wt.checks.deformationTotale)}`, `${F1(wb.sig)} / ${F1(wb.sigBuck)} ${okS(wb.checks.flambement)}`,
          `${F2(mr.vz * 1000)} / ${F2(mr.vzReq * 1000)} ${okS(mr.checks.rotation)} (${mr.label.replace(/^ELU /, '')})`, `${F2(wf.tsReq * 1000)} / ${F1(b.g.ts * 1000)} ${okS(wf.checks.frettes)}`,
          `${F1(sl.Fxy * 1000)} / ${F1(sl.R * 1000)} ${okS(sl.okGlissement)}`, `${F2(sl.sigPerm)} ${okS(sl.okPerm)}`, b.ok ? 'conforme' : `non conforme${b.proposal ? ` — proposé : ${b.proposal.label}` : ''}`];
      }), { small: true });
    table(['Ligne', 'Combinaison ELU (appareil le plus chargé)', 'F_z [kN]', 'v_x [mm]', 'α [mrad]', 'A_r [m²]', 'ε_c', 'ε_q', 'ε_α', 'ε_t', 'Σv_z / a′α/3 [mm]', 'Contrôle'],
      Ls.flatMap(L => { const b = L[code].brg; if (!b || b.error) return []; return b.rows.map(r => [lineName(L, n), `${r.label}${r.indicatif ? ' *' : ''}`, F0(r.Fz), F1(r.vx * 1000), F2(r.alpha * 1000), F3(r.Ar), F2(r.epsC), F2(r.epsQ), F2(r.epsA), F2(r.epsT), `${F2(r.vz * 1000)} / ${F2(r.vzReq * 1000)}`, r.ok ? 'OK' : (r.indicatif ? 'à examiner' : 'NON')]); }), { small: true });
    const b0 = brgs[0];
    comment(`NF EN 1337-3 § 5.3.3, présentation du guide Sétra « Appareils d'appui en élastomère fretté » (juillet 2007) § 3.3-3.4, application nationale γ_m = 1, K_L = 1 : a′ = a − 2 × ${F0(b0.g.cLat * 1000)} mm (enrobage latéral), A′ = a′b′, S = A′/(2t(a′ + b′)), T_e = n t + 2e (e = ${F1(b0.g.e * 1000)} mm), T_q = n t si e ≤ 2,5 mm (n t + 2e sinon) ; G = 0,9 MPa, G_dyn = 1,8 MPa (freinage). v_x = v_lent + H_x T_q/(G_dyn A′) ; ε_q = v_x/T_q ≤ 1 ; A_r = A′(1 − v_x/a′) ; ε_c = 1,5 F_z/(G A_r S) ; ε_α = a′² α t/(2 Σ t_i³) ; ε_t = ε_c + ε_q + ε_α ≤ 7 ; flambement F_z/A_r < 2 a′ G S/(3 T_e) ; stabilité en rotation Σv_z = F_z T_q/A′ (1/(5 G S²) + 1/E_b) ≥ a′ α/K_r (K_r = 3, E_b = 2000 MPa), vérifiée aussi sous charge minimale ; frettes t_s ≥ 1,3 F_z · 2t/(A_r f_y) et ≥ 2 mm (f_y = 235 MPa) ; non-glissement F_xy = G A′ v/T_q + H_x ≤ (0,1 + 1,5 K_f/σ_m) F_z,min (K_f = 0,6, béton) ; σ_m,min = F_z,Gmin/A′ ≥ 3 MPa sous charges permanentes. Formules relues sur le guide (§ 3.2-3.4) et contrôlées sur son exemple du § 4.2 (tests). Déplacements des appareils : ${isF ? 'répartition des déformations lentes avec les raideurs différées des appuis (pratique BAEL)' : 'répartition avec les raideurs instantanées des appuis et G = 0,9 MPa pour l\'élastomère (guide § 4.3.1)'}. Combinaisons ${isF ? 'à la manière des notes BAEL : 1,35 G + P + 1,605 (A(l) ou Bc) ou 1,35 Mc120, freinage × 1,605, déplacements retrait + fluage + 1,5 × 0,6 × température (TLD différée + TCD instantanée) ; température dominante 1,35 G + P avec retrait + fluage + 1,5 × température' : 'du guide (tableau 4.1, n° 2, 4 et 8) : 1,35 G + P + S + C + 1,35 gr1a + 1,5 × 0,6 T ; 1,35 G + P + S + C + 1,35 gr2 (freinage, sans température) ; température dominante 1,35 G + P + 1,5 T + 1,35 ψ₀ trafic ; σ_m,min sur A′ sous G min (n° 9)'} ; rotations : charges permanentes (module différé) × 1,35, trafic (lignes d'influence de rotation) × γ_Q, défaut de pose α₀ = ${F1(b0.a0 * 1000)} mrad${b0.Ntheta ? ` ; gradient thermique : réactions N_θ réparties sur les appareils (max ${F1(b0.Ntheta.max)} kN, min ${F1(b0.Ntheta.min)} kN pour la première ligne), × ${isF ? '0,78' : '0,9'} avec le trafic dominant, × ${isF ? '1,35' : '1,5'} en action dominante, × 1 dans les combinaisons minimales et le non-glissement` : ''}. Combinaisons marquées * : charge minimale avec la rotation maximale du trafic (concomitance non établie, enveloppe majorante) : à examiner avec les concomitances réelles. Appareil proposé : plus petit appareil de la gamme standard vérifiant ces conditions sous les mêmes efforts et déplacements (la répartition des efforts horizontaux n'est pas recalculée).`);
  }

  if (sup.seisme) {
    h2(`Séisme — EN 1998-2, méthode du mode fondamental (${sup.seisme.source === 'onglet' ? 'onglet « Calcul sismique » : Pont EC8 complet' : 'moteur de Pont EC8, projet PSIDA'})`);
    if (sup.seisme.error) para(`Calcul sismique impossible : ${sup.seisme.error}`);
    else {
      const sz = sup.seisme.site || sup.sp.ec8, qq = sup.seisme.q || sup.sp.seisme.q;
      table(['Grandeur', 'Longitudinal (X)', 'Transversal (Y)'], [
        ['Période T (propriétés inférieures des élastomères) [s]', F3(sup.seisme.T.x), F3(sup.seisme.T.y)],
        ['Effort sismique total (propriétés supérieures) [kN]', F0(sup.seisme.F.x), F0(sup.seisme.F.y)],
        ['Coefficient de comportement q', F2(qq.long), F2(qq.trans)],
      ]);
      table(['Ligne', 'X + 0,3 Y + 0,3 Z : F_x / F_y / F_z [kN]', '0,3 X + Y + 0,3 Z', '0,3 X + 0,3 Y + Z', 'Déplacement tête / appareils X [cm]'], sup.seisme.efforts.appuis.map((a, i) => [lineName(Ls[i], n), ...a.cas.map(k => `${F0(k.Fx)} / ${F0(k.Fy)} / ${F0(k.Fz)}`), `${F2(a.dTete.x * 100)} / ${F2(a.dAppareils.x * 100)}`]), { small: true });
      comment(`Zone ${sz.zone}, catégorie d'importance ${sz.categorie}, sol de classe ${sz.classeSol} (arrêté du 26 octobre 2011, NF EN 1998-1/NA et 1998-2/NA) ; masse ${F0(sup.seisme.M)} t ; tablier rigide, efforts répartis selon les raideurs (appareils et fûts), propriétés limites des élastomères, combinaison des directions 100/30/30, réactions verticales forfaitaires (guide Cerema « Ponts en zone sismique », 2015). Combinaison sismique G + ψ₂,₁ Q + A_Ed (ψ₂,₁ = 0), matériaux en situation accidentelle (γ_b = 1,15 BAEL / γ_c = 1,2 EC2, γ_s = 1,0), portance des fondations ELU accidentel. Non pris en compte : inertie propre des fûts, surpoussée dynamique des terres sur les culées (Mononobe-Okabe), dispositions de ductilité ; la note sismique complète (appareils, repos d'appui, joints) s'obtient dans Pont EC8 par l'export du projet.${sup.seisme.problemes.length ? ' Alertes de Pont EC8 : ' + sup.seisme.problemes.map(p => `${p.cible} : ${p.message}`).join(' ; ') : ''}`);
    }
  }
  const ch = sup.sp.choc;
  if ((ch.vehicule && ch.vehicule !== 'aucun') || (ch.bateau && ch.bateau !== 'aucun')) {
    comment(`Chocs sur les piles (EN 1991-1-7, valeurs recommandées à confronter à l'annexe nationale et au cahier des charges) : combinaison accidentelle G + A_d + ψ₁,₁ Q (TS 0,75, UDL 0,4) ; force max(F_dx ; F_dy) appliquée dans le sens longitudinal de l'ouvrage (le plus défavorable pour un voile), à ${F2(ch.hV)} m au-dessus de la semelle pour les véhicules${ch.bateau !== 'aucun' ? `, choc de bateau frontal F_dx à ${F2(ch.hB)} m` : ''} ; pour une pile à colonnes, le choc est repris par une seule colonne.`);
  }

  // --- tête d'appui : bossages et console ---
  const hcs = Ls.map(L => L[code].headChk).filter(h => h && !h.error);
  if (hcs.length) {
    h2('Tête d\'appui sous les appareils — bossages, frettage, partie en console');
    const okS = b => (b ? 'OK' : 'NON');
    table(['Ligne', 'R_u par appareil [kN]', 'Bossage a × b [m]', 'Contact σ / K f_bu [MPa]', 'Diffusion dans l\'appui K f_bu [MPa]', 'Frettes de surface A_s [cm²]', 'Éclatement A_e Δ′ / Δ [cm²]', 'Total A_e + A_s Δ′ / Δ [cm²]'],
      Ls.map(L => { const h = L[code].headChk; if (!h || h.error) return null; return [lineName(L, n), F0(h.Ru), `${F2(h.ab)} × ${F2(h.bb)}`, `${F1(h.press.sig)} / ${F1(h.press.lim)} (K = ${F2(h.press.K)}${h.press.outside ? ', débord < a₀/6 → 1' : ''}) ${okS(h.press.ok)}`, `${F1(h.pressDiff.lim)} (K = ${F2(h.pressDiff.K)}) ${okS(h.pressDiff.ok)}`, CM(h.split.As), `${CM(h.split.planes[0].Ae)} / ${CM(h.split.planes[1].Ae)}`, `${CM(h.split.planes[0].total)} / ${CM(h.split.planes[1].total)}`]; }).filter(Boolean), { small: true });
    const cs = Ls.filter(L => L[code].headChk && L[code].headChk.corbel);
    if (cs.length) table(['Ligne', 'Appareils en console', 'a [m] ; d [m] ; b₀ [m]', 'V_u / H_u [kN]', 'M_u [kN·m]', 'Type', 'τ_u / τ_lim [MPa]', 'z [m]', 'A tirant [cm²]', 'Σ A_r (λ) [cm²]', 'A_i [cm²]'],
      cs.map(L => { const k = L[code].headChk.corbel; return [lineName(L, n), `${k.n} par côté`, `${F2(k.a)} ; ${F2(k.d)} ; ${F2(k.b0)}`, `${F0(k.Vu)} / ${F1(k.Hu)}`, F0(k.Mu), k.short ? 'console courte' : 'console longue (d < a)', k.short ? `${F2(k.tau)} / ${F2(k.tauLim)} ${okS(k.okTau)}` : '—', k.short ? F3(k.z) : '—', k.short ? CM(k.A) : `${CM(k.Along)} (flexion)`, k.short ? `${CM(k.Ar)} (${F2(k.lambda)})` : '—', k.short ? CM(k.Ai) : '—']; }), { small: true });
    comment(`R_u : réaction ELU maximale de l'appareil le plus chargé (combinaisons des appareils d'appui ci-dessus). Pression localisée ${isF ? 'BAEL 91 révisé 99, A.8.4,12 et annexe E.8.2,2 : σ_b = R_u/B₀ ≤ K · 0,85 f_cj/(θ γ_b), K = 1 + [3 − 4/3 (a₀/a + b₀/b)] √[(1 − 4a₀/3a)(1 − 4b₀/3b)] ≤ 3,3 ; condition de débord minimal d_a ≥ a₀/6 et d_b ≥ b₀/6, sinon K = 1' : 'EN 1992-1-1 § 6.7 : F_Rdu = A_c0 f_cd √(A_c1/A_c0) ≤ 3 f_cd A_c0 (guide Sétra 2007 § 3.4.1.6)'} ; contact : rectangle homothétique limité au bossage (débord ${F2(hcs[0].deb)} m, béton f_ck = ${F0(hcs[0].press.fck)} MPa) ; diffusion : rectangle homothétique inscrit dans l'épaisseur de l'appui et l'entraxe des appareils. Frettage (BAEL annexe E.8.2,3, transposition de l'annexe 4 du BPEL, f_su = f_e/γ_s) : frettes de surface A_s ≥ 0,04 R_u/f_su ; éclatement R_j = 0,25 (1 − a₀/d_j) R_u, A_ej = R_j/(k_j f_su), d_j = 2 min(c_j ; c_j*) — plan Δ′ : épaisseur de l'appui, k = 1 ; plan Δ : appareil extrême (k = 1) ou intermédiaire (d = entraxe, k = 1,5) ; total A_e + A_s = sup(max A_ej ; 0,15 R_u/f_su) + 0,04 R_u/f_su sur une longueur max d_j. Voile plus court que la ligne d'appareils : appareils extrêmes portés par la tête du voile en console (hauteur ${F2(sup.sp.pile.hcons ?? 1)} m saisie), BAEL annexe E.6 si d ≥ max(a ; ℓ) : charge de l'appareil répartie sur ℓ = b₀, d plafonné à 4ℓ (4a pour une charge concentrée), δ = d/a ≤ 4, τ_u = V_u/(b₀ d) ≤ min[0,03 (2 + δ) f_cj ; 4 MPa], z = min[0,7 d (1 + 0,1 δ) ; 2,4 a (0,4 + 0,1 δ)], A = M_u/(z f_e/γ_s), Σ A_r = λ A avec λ = max[¼ (δ + 12 τ_u/f_cj − 1) ; 1/10], A_i ≥ A/10 ; l'annexe E.6 ne traite pas l'effort horizontal en tête (E.6.2,6) : complément de la pratique (Perchat, C 2 314 § 2.7.4.5), τ_u/(1 − 0,6 H_u/V_u) et A + H_u/(f_e/γ_s), H_u effort horizontal ELU par appareil ; poids propre de la console × 1,35. Console longue : flexion simple au nu du voile.`);
  }

  const iWat0 = B.length;
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
    if (!opts.noFigures) {
      // schémas des piles en rivière (PHE, fond affouillé, semelle, pieux dégagés) et efforts hydrodynamiques
      const sch = []; for (const { L } of wat) { try { sch.push({ L, svg: supportSchema(sup, L, code) }); } catch (er) { /* schéma indisponible */ } }
      for (let q = 0; q < sch.length; q += 2) { const a1 = sch[q], a2 = sch[q + 1]; B.push(svgBlock(sideBySide(a2 ? [a1.svg, a2.svg] : [a1.svg], null, 10, pairWidth(sch.map(x => x.svg))), `${lineName(a1.L, n)}${a2 ? ` et ${lineName(a2.L, n)}` : ''} en crue : plus hautes eaux, affouillement total, fondation`)); }
      try { B.push(svgBlock(barChart({ cats: wat.map(({ L }) => lineName(L, n)), ylabel: 'F [kN] ; y_s [m]×100', series: [{ libelle: 'courant F_wa [kN]', values: wat.map(({ w }) => w.cur.F), couleur: '#0369a1' }, { libelle: 'embâcles F_deb [kN]', values: wat.map(({ w }) => w.deb.F), couleur: '#b45309' }, { libelle: 'affouillement total ×100 [m]', values: wat.map(({ w }) => 100 * w.dAff), couleur: '#b91c1c' }] }), 'Piles en rivière : poussée du courant, embâcles et profondeur d\'affouillement')); } catch (er) { /* figure indisponible */ }
    }
  }

  const iWat1 = B.length;
  if (opts.onlyWater) return B.slice(iWat0, iWat1);
  if (opts.noWater) B.splice(iWat0, iWat1 - iWat0);
  const warn = Ls.filter(L => L.warnings && L.warnings.length);
  if (warn.length) {
    h2('Dispositions minimales (PP73) — avertissements');
    table(['Ligne', 'Avertissement'], warn.flatMap(L => L.warnings.map(w => [lineName(L, n), w])));
  }

  if (!opts.noFigures) {
    // schémas à l'échelle : une culée et chaque pile, deux par figure
    const sch = [];
    for (const L of Ls) if (L.kind !== 'culee' || L.i === 0) { try { sch.push({ L, svg: supportSchema(sup, L, code) }); } catch (e) { /* schéma indisponible */ } }
    if (sch.length) {
      h2('Schémas des appuis (à l\'échelle)');
      for (let k = 0; k < sch.length; k += 2) {
        const a1 = sch[k], a2 = sch[k + 1];
        B.push(svgBlock(sideBySide(a2 ? [a1.svg, a2.svg] : [a1.svg], null, 10, pairWidth(sch.map(x => x.svg))), a2 ? `${lineName(a1.L, n)} et ${lineName(a2.L, n)} : fût, chevêtre, semelle, pieux, terrain et niveaux d'eau` : `${lineName(a1.L, n)} : fût, chevêtre, semelle, pieux, terrain et niveaux d'eau`));
      }
    }
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
    table(['Ligne', 'P_u par appareil [kN]', 'Charges de culée (PP73) [kN/m ; kN]', 'M⁻ / M⁺ [kN·m]', 'V max [kN]', 'A_s sup / inf [cm²]', 'A min par face [cm²]', 'Cadres min [cm²/m]'], caps.map(L => { const c = L[code].cap; return [lineName(L, n), F0(c.Pu), c.qDalle !== undefined ? `g.-g. ${F0(c.qGG)} + dalle ${F0(c.qDalle)} ; bouts ${F0(c.Pend)}` : '—', `${F0(c.Mneg)} / ${F0(c.Mpos)}`, F0(c.V), `${CM(c.AsTop)} / ${CM(c.AsBot)}`, CM(c.Amin), CM(c.AtMin)]; }));
    comment('Poutre continue sur les colonnes (appuis rigides ; console encastrée pour une colonne unique), chargée par les réactions ELU des appareils (coefficients d\'inégalité de répartition) et son poids propre. Piles-culées (PP73 1.3.2 § 2.2.2, valeurs du 1er genre × 1,35) : poids du garde-grève, réaction de la dalle de transition (15 + D) t/ml (sans dalle : 5,5 t/ml × 2 = 11 t/ml), murs en retour ou murettes en bout (poids propre + 4 tf, murettes ≤ 2,5 m : 5 tf). Minimum longitudinal 0,5 % pour l\'ensemble des nappes (§ 2.2.5.1, soit 0,25 % par face), cadres ≥ 0,2 % de la section horizontale, espacement < 20 cm ; section conseillée ≥ 0,60 × 0,70 m.');
    const tor = caps.filter(L => L[code].torsion);
    if (tor.length) {
      table(['Ligne', "M_gh / M'_gh [kN·m]", 'T_u par colonne [kN·m]', isF ? 'τ_t / τ_v / τ_lim [MPa]' : 'T_Ed/T_Rd,max + V_Ed/V_Rd,max', 'Cadres A_t/s [cm²/m]', 'Longitudinales ΣA_l [cm²]'], tor.map(L => { const t = L[code].torsion; return [lineName(L, n), `${F0(t.Mgh)} / ${F0(-t.Mrev)}`, F0(t.Tu), isF ? `${F2(t.tauT)} / ${F2(t.tauV)} / ${F2(t.tauLim)} → ${F2(t.ratio)} ${ok(t.ratio)}` : `${F2(t.ratio)} ${ok(t.ratio)}`, CM(t.AtS), CM(t.Al)]; }));
      comment(`Torsion du chevêtre de pile-culée (PP73 1.3.2 § 2.2.4) : moment du garde-grève ramené à l'axe du chevêtre sur un entraxe e de colonnes, M_gh = 2,5 (h_g + 0,5 h_c + 1) e t·m, sens opposé M'_gh = −3,5 e, couple C = M/2 au droit d'une colonne, × 1,35 à l'ELU. ${isF ? 'BAEL 91 A.5.4 : section creuse équivalente b₀ = a/6, τ_t = T_u/(2Ω b₀), τ_v² + τ_t² ≤ τ_lim², τ_lim = min(0,15 f_c28/γ_b ; 4 MPa)' : 'EN 1992-1-1 § 6.3.2 (θ = 45°) : t_ef = A/u, T_Ed/T_Rd,max + V_Ed/V_Rd,max ≤ 1'} ; aciers A_t/s = T/(2 A_k f_yd) et ΣA_l = T u_k/(2 A_k f_yd), à ajouter à ceux de la flexion et de l'effort tranchant.`);
    }
  }

  const cul = Ls.filter(L => L.kind === 'culee');
  if (cul.length) {
    h2('Culées — mur garde-grève, murs en retour');
    const L0 = cul[0], r = L0[code];
    table(['Élément', 'Dimensions', 'Moments [kN·m/m ou kN·m]', 'A_s [cm²]'], [
      ['Garde-grève', `h = ${F2(r.gg.h)} m, e = ${F2(r.gg.e)} m`, `M_t ${F1(r.gg.Mt)} ; M_p ${F1(r.gg.Mp)} ; M_f ${F1(r.gg.Mf)} → ELU ${F1(r.gg.ELU)} / ELS ${F1(r.gg.ELS)}`, `${CM(r.gg.As)} /m face arrière ; ${CM(r.gg.AsAvant)} /m face avant (M' = −32 kN·m/m)`],
      ['Mur en retour', `L = ${F2(r.retour.L)} m, h = ${F2(r.retour.h)} m, e = ${F2(r.retour.e)} m`, `M_h ${F0(r.retour.Mh)} ; M_v ${F0(r.retour.Mv)} (T_h ${F0(r.retour.Th)}, T_v ${F0(r.retour.Tv)} kN)`, `horiz. ${CM(r.retour.AsH)} ; sup. ${CM(r.retour.AsV)}`],
    ]);
    const ea = r.earth, vide = r.base.filter(b => b.vide);
    para(`Poussée sur la culée (${ea.mode}) : terres ${F0(ea.Pg)} kN, surcharge ${F0(ea.Pq)} kN${ea.arm ? `, appliquées à ${F2(ea.arm)} m au-dessus de la base des colonnes (6/10 de h₁ = ${F2(ea.h1)} m depuis le haut, i = 1/3, p = 15 kPa)` : ''}. Culée sans tablier (PP73 1.3.2 § 3.1.4.6) : ${vide.map(b => `${b.ls} N = ${F0(b.Nb)} kN, H = ${F0(b.Hb)} kN, M = ${F0(b.Mb)} kN·m`).join(' ; ')} — reprises dans le ferraillage des colonnes ou du mur et dans les vérifications de la fondation.`);
    comment(`Garde-grève, PP73 1.3.2 § 2.3 : épaisseur des ferraillages types 0,20 m (h ≤ 1 m), 0,10 + 0,10 h (1 à 2 m), 0,30 m (2 à 3 m) ; moments à l'encastrement : poussée des terres K γ h³/6, roues arrière de deux camions Bc (12 t sur 0,25 × 0,75 m, diffusion à 45°) 12K'/(0,75 + 2h)∫(h − x)/(0,25 + x)dx, freinage d'une roue de 6 t 6h/(0,25 + 2h) [t·m/m], K = K_a = ${F3(sup.Ka)}, b_c = 1,1, δ = 1 ; ELS 1,0 M_t + 1,2 (M_p + M_f) (redonne le tableau du § 2.3.3), ELU 1,35 / 1,6 ; face avant : M' = −3,2 t·m/m (§ 2.3.3). Murs en retour, PP73 1.3.2 § 3.4 : poids propre, 0,3 t/m, 4 tf verticale et 2 tf horizontale à 1 m de l'extrémité (murettes ℓ ≤ 2,5 m : 5 tf et 3 tf, § 2.2.2.4), poussée (h/3 + 0,5) t/m² sur ℓh/2 ; M_V et M_H non concomitants, M_H repris sur une hauteur h/2 ; épaisseur (ℓ + 2)/20 (2 ≤ ℓ ≤ 6 m), minimum 0,20 m ; aciers ≥ 2 cm²/ml par face et par direction.`);
  }

  h2('Fondations');
  const fType = Ls[0][code].found.type;
  if (sup.profiles) {
    const F = sup.sp.found;
    for (const pr of sup.profiles) {
      const used = Ls.filter(L => L.profile === pr.name);
      B.push({ t: 'p', text: `Profil pressiométrique ${pr.name}${used.length ? ` — ${used.map(L => lineName(L, n)).join(', ')}` : ' (non utilisé)'}${pr.tests.length ? ` ; ${pr.tests.length} essai(s)` : ''}` });
      // zones sollicitées : semelle [D ; D + 1,5 B] (F62 E.2) ; pointe de pieu [D − a ; D + 3a], a = max(B/2 ; 0,5 m) (F62 C.3)
      const bandes = [];
      if (used.length) {
        if (fType === 'superficielle') bandes.push({ z0: F.De, z1: F.De + 1.5 * F.B, libelle: `semelles (${used.map(L => lineName(L, n)).join(', ')})` });
        else { const a = Math.max(F.pileD / 2, 0.5), tip = F.De + F.Lpile; bandes.push({ z0: tip - a, z1: tip + 3 * a, libelle: `pointe des pieux (${used.map(L => lineName(L, n)).join(', ')})` }); }
      }
      B.push({ t: 'svg', svg: profileFigure(pr, bandes), caption: `Sondage ${pr.name} — coupe, E_M, p*_l et p*_f, E_M/p*_l (figure du bureau de calcul fond.ksr-infra.org)` });
      table(['Couche', 'Profondeur [m]', 'Classe (F62)', 'Catégorie NF P 94-261/262', 'p*_l [MPa]', 'E_M [MPa]', 'E_M/p*_l', 'α', 'Origine'], pr.layers.map((l, k) => [String(k + 1), `${F2(l.z0)} – ${F2(l.z1)}`, l.classe, l.sol, F2(l.pl), F1(l.EM), F1(l.EM / l.pl), F2(l.alpha), l.derive ? `${l.nEssais} essai(s)${l.estimee ? ' (essai le plus proche)' : ''}` : 'saisie']));
    }
    comment('Valeurs de couche tirées des essais (« - » dans la saisie) : p*_l moyenne géométrique, E_M moyenne harmonique des essais de la couche (à défaut, essai le plus proche du milieu de couche) ; α de Ménard selon la nature et E_M/p*_l (F62 V annexe C.5). Repères pointillés du rapport E_M/p*_l par nature (argile 9 et 16, limon 8 et 14, grave 6 et 10, autres 7 et 12). Zones bleues : sol sollicité par les fondations des lignes rattachées au sondage.');
  }
  if (fType === 'superficielle' && sup.footRot) {
    table(['Ligne', 'k_v (long terme) [kN/m³]', 'k_i = 2 k_v [kN/m³]', 'K_θ diff. / inst. [kN·m/rad]'], Ls.map((L, i) => { const r = sup.footRot[i][code]; return [lineName(L, n), F0(r.kv), F0(r.ki), `${F0(r.Ktheta.diff)} / ${F0(r.Ktheta.inst)}`]; }), { small: true });
    comment('Rotation des semelles superficielles sur le sol dans la répartition des efforts horizontaux : module de réaction de Ménard 1/k_v = α B λ_c/(9 E_c) + 2 B₀ (λ_d B/B₀)^α/(9 E_d), k_i = 2 k_v (F62 annexe F.3), K_θ = k L B³/12, souplesse ramenée en tête h²/K_θ.');
  }
  if (fType === 'superficielle') {
    table(['Ligne', 'p*_le [MPa] ; D_e [m] ; k_p (assise)', 'Semelle B × L × h [m]', 'V/R_v max', 'H/R_h max (ELU)', 'Excentrement', 'Méthode des aciers : bielles si d ≥ (B − b)/4 et e ≤ B/6, sinon consoles', 'A_s // B [cm²]', 'A_s ⊥ B [cm²/m]'], Ls.map(L => { const f = L[code].found; const w = f.checks.reduce((a, k) => (k.ratioV > a.ratioV ? k : a), f.checks[0]); return [lineName(L, n), `${F2(w.ple)} ; ${F2(w.De)} ; ${F2(w.kp)} (${w.classe})`, `${F2(f.B)} × ${F2(f.L)} × ${F2(f.hs)}`, `${F2(f.worstV)} ${ok(f.worstV)}`, `${F2(f.worstH)} ${ok(f.worstH)}`, f.excOk ? 'OK' : 'NON', f.method === 'bielles' ? 'bielles' : (f.bielles.eOk ? 'consoles (d < (B − b)/4)' : 'consoles (e > B/6)'), CM(f.AsLong), CM(f.AsTransPerM)]; }));
    comment(isF ? 'Fascicule 62 titre V (annexes B.1, B.2, E.2, F.1) : p*_le moyenne géométrique de p*_l sur [D ; D + 1,5 B], D_e = (1/p*_le)∫p*_l dz, classe de la couche d\'assise ; k_p = k₀[1 + a(0,6 + 0,4 B/L) D_e/B] selon la classe de sol (D_e/B ≤ 2,5) ; q\'_ref = (3 q_max + q_min)/4 ≤ i_δβ k_p p*_le/γ_q + q\'_0 (γ_q = 2 ELU, 3 ELS rares), i_δβ = Φ₁(δ) (sols cohérents) ou Φ₂(δ, D_e/B) (sols frottants) ; surface comprimée ≥ 10 % (ELU), 75 % (ELS rares) ; glissement (ELU) V tan φ\'/1,2 + c\'A\'/1,5 (c\' ≤ 75 kPa). Ferraillage par bielles A = N\'(B − b)/(8 d f_su), N\' = N(1 + 3e/B), minimum 0,12 % par nappe (PP73 1.1.1). Combinaisons fréquentes (sol entièrement comprimé) non vérifiées.'
      : 'NF P 94-261 (annexe D, guide Cerema 2015) : p*_le moyenne géométrique de p*_l sur [D ; D + h_r] (h_r = 1,5 B, réduit selon l\'excentrement à l\'ELU), D_e = (1/p*_le)∫p*_l dz ; k_p (tableau D.2.3, D_e/B ≤ 2), i_δ (D.2.4), R_v;d = A\' k_p p*_le i_δ/(γ_R;v γ_R;d;v), γ_R;v = 1,4 (ELU), 2,3 (ELS), γ_R;d;v = 1,2, R₀ = A q₀ déduit ; A\' = A(1 − 2e/B) ; 1 − 2e/B ≥ 1/15 (ELU), 1/2 (ELS car.) ; glissement (ELU) V tan φ\'/(γ_R;h γ_R;d;h), γ_R;h = γ_R;d;h = 1,1. Ferraillage par bielles, minimum 0,12 % par nappe. ELS quasi-permanent (1 − 2e/B ≥ 2/3) non vérifié.');
    table(['Ligne', 'Bielles : N\' = N(1 + 3e/B) [kN] ; b ; d [m]', 'A_bielles = N\'(B − b)/(8 d f_su) [cm²]', 'Consoles : combinaison ; e [m]', 'q_max ; q(x₁) [kPa] ; x₁ [m]', 'M₁ [kN·m/m]', 'A_consoles = M₁ L/(0,9 d f_su) [cm²]', 'A_min 0,12 % [cm²]', 'Retenu [cm²]'], Ls.map(L => { const f = L[code].found, bi = f.bielles, co = f.console; return [lineName(L, n), `${F0(bi.N)} ; ${F2(bi.b)} ; ${F2(bi.d)}`, CM(bi.As) + (f.method === 'bielles' ? ' ←' : ''), co ? `${co.label} ; ${F2(co.e)}` : '-', co ? `${F1(co.qmax)} ; ${F1(co.q1)} ; ${F2(co.x1)}` : '-', co ? F1(co.M1) : '-', co ? CM(co.As) + (f.method === 'console' ? ' ←' : '') : '-', CM(f.AsMin), CM(f.AsLong)]; }), { small: true });
    comment('Aciers inférieurs parallèles à B (nappe principale, sur toute la longueur L de la semelle). Méthode des bielles (BAEL, DTU 13.12) si la semelle est assez épaisse (d ≥ (B − b)/4) et la résultante dans le noyau central (e ≤ B/6) : N\' = N(1 + 3e/B), combinaison ELU donnant le plus grand N\'. Sinon méthode des consoles : contrainte du sol linéaire (trapèze, ou triangle de longueur 3(B/2 − e) si e > B/6), moment M₁ = ∫₀^x₁ q(x)(x₁ − x) dx dans la section S₁ à 0,35 b en arrière du nu de l\'appui (x₁ = (B − b)/2 + 0,35 b), côté le plus comprimé, poids de la semelle et des terres sur le débord négligés (sécurité), bras de levier z = 0,9 d, f_su = f_e/1,15. Minimum 0,12 % de la section par nappe (PP73 1.1.1).');
    if (!opts.noFigures) {
      const c0 = Ls.find(L => L.kind === 'culee'), pw = Ls.filter(L => L.kind !== 'culee').reduce((a, L) => (!a || L[code].found.AsLong > a[code].found.AsLong ? L : a), null);
      for (const Lr of [c0, pw].filter(Boolean)) { try { const fr = footingRebarSchema(sup, Lr, code); if (fr) B.push(svgBlock(fr, `${lineName(Lr, n)} — plan de ferraillage de la semelle (barres proposées pour les sections calculées)`)); } catch (e) { /* plan indisponible */ } }
    }
    if (Ls.some(L => L[code].found.settle && !L[code].found.settle.error)) {
      table(['Ligne', 'V_qp [kN] ; q\' [kPa]', 'σ\'_v0 = γ D [kPa] ; q\' − σ\'_v0', 'E₁ ; E₂ ; E₃,₅ ; E₆,₈ ; E₉,₁₆ [MPa]', 'E_d [MPa] ; α', 'λ_c ; λ_d', 's_c + s_d = s_f [mm]', 'θ = M_qp/K_θ [mrad] ; Δs bord [mm]'], Ls.map(L => { const t = L[code].found.settle; if (!t || t.error) return [lineName(L, n), '-', '-', '-', '-', '-', t && t.error ? t.error : '-', '-']; return [lineName(L, n), `${F0(t.q * L[code].found.B * L[code].found.L)} ; ${F1(t.q)}`, `${F1(t.sigmaV0)} ; ${F1(t.dq)}`, [t.E1, t.E2, t.E35, t.E68, t.E916].map(F1).join(' ; '), `${F1(t.Ed)} ; ${F2(t.alpha)}`, `${F2(t.lc)} ; ${F2(t.ld)}`, `${F1(t.sc)} + ${F1(t.sd)} = ${F1(t.s)}`, `${F2(t.theta * 1000)} ; ${F1(t.dTilt)}`]; }), { small: true });
      comment(`Tassement final sous charges quasi permanentes (part soutenue de la combinaison ELS la plus chargée, hors crue) par la méthode pressiométrique de Ménard (${isF ? 'Fascicule 62 titre V annexe F.2' : 'NF P 94-261 annexe H'}) : s_c = α (q' − σ'_v0) λ_c B/(9 E_c), s_d = 2 (q' − σ'_v0) B₀ (λ_d B/B₀)^α/(9 E_d), B₀ = 0,6 m, E_c = E₁, E_d ${isF ? '4/E_d = 1/E₁ + 1/(0,85 E₂) + 1/E₃,₅ + 1/(2,5 E₆,₈) + 1/(2,5 E₉,₁₆)' : '1/E_d = 0,25/E₁ + 0,3/E₂ + 0,25/E₃,₅ + 0,1/E₆,₈ + 0,1/E₉,₁₆'}, E_i moyenne harmonique de E_M sur la tranche i d'épaisseur B/2. Le tassement différentiel entre lignes d'appui est à reporter dans le calcul du tablier (dénivellations d'appui).`);
      if (!opts.noFigures) {
        const Lt = Ls.filter(L => L[code].found.settle && !L[code].found.settle.error).reduce((a, L) => (!a || L[code].found.settle.s > a[code].found.settle.s ? L : a), null);
        if (Lt) {
          try { const m = menardSchema(sup, Lt, code); if (m) B.push(svgBlock(m, `${lineName(Lt, n)} (tassement le plus fort) — découpage de Ménard : 16 tranches de B/2, modules regroupés, tassements sphérique et déviatorique`)); } catch (e) { /* figure indisponible */ }
          try { const bb = bulbSchema(sup, Lt, code); if (bb) B.push(svgBlock(bb, `${lineName(Lt, n)} — bulbe des contraintes de Boussinesq sous la semelle et profil sur l'axe`)); } catch (e) { /* figure indisponible */ }
        }
      }
    }
    if (!opts.noFigures) { const fp = Ls.map(L => { try { return footingPressureChart(L, code); } catch (e) { return null; } }).filter(Boolean); for (let k = 0; k < fp.length; k += 2) B.push(fp[k + 1] ? svgBlock(sideBySide(fp[k].svg, fp[k + 1].svg), `${fp[k].caption} ; ${fp[k + 1].caption}`) : svgBlock(sideBySide([fp[k].svg], null, 10, pairWidth(fp.map(x => x.svg))), fp[k].caption)); }
  } else {
    table(['Ligne', 'Pieux', 'k Ménard en tête [kN/m³]', 'N max / min ELU [kN]', 'N max ELS [kN]', 'M max ; T max pieu ELU [kN·m ; kN]', 'Portance ELU / ELS', 'Groupe C_e ; taux', 'A_s pieu [cm²]', 'Effort tranchant'], Ls.map(L => {
      const f = L[code].found, el = f.rows.filter(r => r.ls === 'ELU'), mm = Math.max(...el.map(r => r.Mmax)), sh = f.shear.ELU;
      const trac = (f.NminU < 0 ? ` ; traction ELU ${F2(f.capRatio.traction)} ${ok(f.capRatio.traction)}` : '') + (f.capRatio.ACC ? ` ; accidentel ${F2(f.capRatio.ACC)} ${ok(f.capRatio.ACC)}` : '');
      const shTxt = isF ? `τ_u ${F2(sh.tau)} / ${F2(sh.lim)} MPa ${sh.ok ? 'OK' : 'NON'} ; A_t/s ${CM(Math.max(sh.AtS, sh.AtSmin))} cm²/m` : `V ${F0(f.shear.TmaxU)} / V_Rd,c ${F0(sh.VRdc)} kN ; A_sw/s ${CM(Math.max(sh.AtS, sh.AtSmin))} cm²/m ${sh.ok ? '' : '(V_Rd,max dépassé : NON)'}`;
      return [lineName(L, n), `${f.nF} × ${f.nP} Ø ${F2(f.D)}, L = ${F1(f.Lpile)}${(sup.sp.found.incl || []).some(a => a) ? `, incl. ${sup.sp.found.incl.join(' / ')}°` : ''}`, F0(f.k), `${F0(f.NmaxU)} / ${F0(f.NminU)}`, F0(f.NmaxS), `${F0(mm)} ; ${F0(f.shear.TmaxU)}`, f.cap.applicable ? `${F2(f.capRatio.ELU)} ${ok(f.capRatio.ELU)} / ${F2(f.capRatio.ELS)} ${ok(f.capRatio.ELS)}${trac}` : `non calculable : ${f.cap.motif}`, f.group ? `${F2(f.group.Ce)} ; ${F2(f.group.ratio)} ${ok(f.group.ratio)}` : '—', `${CM(f.As)} (min ${CM(f.Amin)})`, shTxt];
    }), { small: true });
    if (!opts.noFigures) {
      const Lpm = Ls.reduce((a, L) => (!a || L[code].found.As > a[code].found.As ? L : a), null);
      try { const pr = pileRebarSchema(sup, Lpm, code); if (pr) B.push(svgBlock(pr, `${lineName(Lpm, n)} — plan de ferraillage d'un pieu (section d'acier la plus forte) : élévation, moments du modèle de Winkler, coupe`)); } catch (e) { /* plan indisponible */ }
    }
    // --- portance du pieu isolé : détail du calcul ---
    const capL = Ls.filter(L => L[code].found.cap && L[code].found.cap.applicable && L[code].found.cap.detail);
    if (capL.length) {
      h2('Portance d\'un pieu isolé — détail du calcul');
      if (isF) {
        table(['Ligne', 'Couche porteuse ; h [m]', 'p*_le [MPa] sur [z₁ ; z₂]', 'k_p ; q_u = k_p p*_le [kPa]', 'Q_pu = A q_u [kN]', 'Frottement : couche [m] — classe — courbe — q_s [kPa] — Q_s [kN]', 'Q_su [kN]', 'Q_u ; Q_c [kN]', 'Q_max ELU ; ELS rare ; ELS q.p. ; traction ELU [kN]'], capL.map(L => {
          const c = L[code].found.cap, t = c.detail, dp = t.detailPointe;
          return [lineName(L, n), `${t.porteuse.classe} ; ${F2(t.h)}`, `${F2(t.qEquiv)} [${F2(dp.z0)} ; ${F2(dp.z1)}]`, `${F2(t.kPointe)} ; ${F0(t.qu)}`, F0(t.Qpu), t.lignes.map(l => `${F2(l.z0)}–${F2(l.z1)} ${l.classe} Q${l.courbe} ${F1(l.qs)} → ${F0(l.Q)}`).join(' ; '), F0(t.Qsu), `${F0(t.Qu)} ; ${F0(t.Qc)}`, `${F0(t.limites.ELU.Qmax)} ; ${F0(t.limites.ELS_rare.Qmax)} ; ${F0(t.limites.ELS_QP.Qmax)} ; ${F0(-t.limites.ELU.Qmin)}`];
        }), { small: true });
        comment('Fascicule 62 titre V, annexe C.3 (pressiomètre) : section de pointe A = π Ø²/4, périmètre P = π Ø ; p*_le moyenne de p*_l entre D − b et D + 3a (a = max(Ø/2 ; 0,5 m), b = min(a ; h), h encastrement dans la couche porteuse) ; k_p du tableau I (sol, pieu sans ou avec refoulement) ; frottement q_s lu sur les courbes Q1 à Q7 du tableau II selon le type de pieu et la classe de sol : Q1–Q4 q_s = q_sn (p_l/p_n)(2 − p_l/p_n) si p_l ≤ p_n, q_sn sinon (q_sn = 0,04 n MPa, p_n = 1 + 0,5 n MPa), bornées par Q5 = min[(p_l − 0,2)/9 ; (p_l + 3,3)/32] ; Q_s = P q_s h_couche à partir de la sous-face de la semelle. Q_u = Q_pu + Q_su ; Q_c = 0,5 Q_pu + 0,7 Q_su (pieux sans refoulement ; 0,7 Q_pu avec refoulement) ; Q_max = Q_u/1,40 (ELU), Q_u/1,20 (accidentel), Q_c/1,10 (ELS rares), Q_c/1,40 (ELS quasi permanents) ; traction Q_tu/1,40 = Q_su/1,40 (ELU), Q_tc/1,40 = 0,7 Q_su/1,40 (ELS rares).');
      } else {
        table(['Ligne', 'Couche porteuse ; h [m]', 'p*_le [MPa] sur [z₁ ; z₂] ; D_ef/B', 'k_p (k_max) ; q_b [kPa]', 'R_b = A q_b [kN]', 'Frottement : couche [m] — sol — p*_l — f_sol — α — q_s (≤ q_s,max) [kPa] — R_s [kN]', 'R_s [kN]', 'γ_R;d1 ; γ_R;d2 → R_b;k ; R_s;k [kN]', 'R_c;d ELU ; R_c;cr;d ELS car. ; ELS q.p. ; R_t;d [kN]'], capL.map(L => {
          const c = L[code].found.cap, t = c.detail, p = t.pointe;
          return [lineName(L, n), `${t.porteuse.classe} ; ${F2(t.h)}`, `${F2(p.ple)} [${F2(p.z0)} ; ${F2(p.z1)}] ; ${F2(p.DefB)}`, `${F2(p.k)} (${F2(p.kmax)}) ; ${F0(p.qb)}`, F0(t.Rb), t.lignes.map(l => `${F2(l.z0)}–${F2(l.z1)} ${l.sol} ${F2(l.X)} — ${F1(l.fsol)} — ${F2(l.alpha)} — ${F1(l.qs)} (${F0(l.qsmax)}) → ${F0(l.R)}`).join(' ; '), F0(t.Rs), `${F2(t.gRd1c)} ; ${F2(t.gRd2)} → ${F0(t.Rbk)} ; ${F0(t.Rsk)}`, `${F0(t.calcul.ELU.Rcd)} ; ${F0(t.calcul.ELS_car.Rccrd)} ; ${F0(t.calcul.ELS_QP.Rccrd)} ; ${F0(t.calcul.ELU.Rtd)}`];
        }), { small: true });
        comment('NF P 94-262 annexe F (pressiomètre), procédure « modèle de terrain » : p*_le entre D − b et D + 3a ; encastrement effectif D_ef = (1/p*_le)∫p*_l dz sur [D − 10 Ø ; D] ; k_p = 1 + (k_max − 1) D_ef/(5 Ø) si D_ef/Ø < 5 (tableau F.4.2.1 pour k_max) ; q_b = k_p p*_le ; q_s = min(α_pieu-sol f_sol ; q_s,max) avec f_sol = (a p*_l + b)(1 − e^(−c p*_l)) (tableaux F.5.2.1 à F.5.2.3) ; R_b;k = R_b/(γ_R;d1 γ_R;d2), R_s;k = R_s/(γ_R;d1 γ_R;d2) ; R_c;k = R_b;k + R_s;k ; R_c;cr;k = 0,5 R_b;k + 0,7 R_s;k (sans refoulement) ; R_c;d = R_c;k/1,1 (ELU fondamental), R_c;k/1,0 (accidentel) ; R_c;cr;d = R_c;cr;k/0,9 (ELS caractéristique), /1,1 (quasi permanent) ; traction R_t;d = R_s/(γ_R;d1,t γ_R;d2)/1,15.');
      }
    }
    // --- fiche minimale ---
    const fichL = Ls.filter(L => L[code].found && L[code].found.fiche && !L[code].found.fiche.error);
    if (fichL.length) {
      table(['Ligne', 'Charge par pieu QP / ELS / ELU [kN]', 'Fiche minimale ELS quasi permanent [m]', 'ELS ' + (isF ? 'rare' : 'caractéristique') + ' [m]', 'ELU [m]', 'Accidentel [m]', 'Fiche minimale [m]', 'Fiche retenue [m]'], fichL.map(L => {
        const f = L[code].found, fi = f.fiche, v = x => (x == null ? `> ${F1(fi.Lmax)}` : F1(x));
        return [lineName(L, n), `${F0(fi.NqpP)} / ${F0(f.NmaxS)} / ${F0(f.NmaxU)}`, v(fi.QP), v(fi.ELS), v(fi.ELU), fi.ACC === undefined ? '—' : v(fi.ACC), fi.governing == null ? 'non trouvée' : F1(fi.governing), `${F1(fi.Lretenu)} ${fi.governing != null && fi.Lretenu >= fi.governing - 1e-9 ? 'OK' : 'NON'}`];
      }), { small: true });
      comment(`Fiche minimale : plus petite longueur de pieu (pas de ${F1(fichL[0][code].found.fiche.step)} m, dans le terrain naturel sous la semelle) dont la portance couvre la charge en tête du pieu le plus chargé, pour chaque état limite : ${isF ? 'Fascicule 62 titre V, ELS quasi permanent Q_c/1,4, ELS rare Q_c/1,1, ELU Q_u/1,4, accidentel Q_u/1,2' : 'NF P 94-262, ELS quasi permanent R_c;cr/1,1, ELS caractéristique R_c;cr/0,9, ELU et accidentel'}. Charges en tête de la fiche retenue (l'influence de la fiche sur la répartition entre pieux est négligée) ; ELS quasi permanent : part soutenue des combinaisons ELS. Le poids propre du pieu n'est pas ajouté (convention des rapports de portance ci-dessus).${fichL.some(L => L[code].found.pileSO) ? (() => { const so = fichL.find(L => L[code].found.pileSO)[code].found.pileSO; return ` Excentricités dans les pieux (option) : longueur de transfert l₀ = (4EI/k)^¼ = ${F2(so.l0)} m, l_f = 2 l₀ = ${F2(so.lf)} m, e_a = max(2 cm ; l_f/250) = ${F3(so.ea)} m, e₂ = 3 l_f²/(10⁴ D)(2 + α φ) = ${F3(so.e2min)} à ${F3(so.e2max)} m (φ = 2), ajoutées au moment ELU des pieux.`; })() : ''}`);
    }
    // --- sorties du modèle PSH ---
    h2('Fondations sur pieux — modèle PSH : souplesses de tête, efforts en tête de pieux, profils');
    const E3 = v => (Number.isFinite(v) ? v.toExponential(3).replace('.', ',') : '—');
    table(['Ligne', 'w/N [m/kN]', 'θ/M [rad/kN·m]', 'θ/T = u/M [rad/kN]', 'u/T [m/kN]', 'w/N soutenu', 'θ/M soutenu', 'θ/T soutenu', 'u/T soutenu'], Ls.map(L => {
      const F = L[code].found.psh.flex; return [lineName(L, n), E3(F.inst[0][0]), E3(F.inst[1][1]), E3(F.inst[1][2]), E3(F.inst[2][2]), E3(F.sus[0][0]), E3(F.sus[1][1]), E3(F.sus[1][2]), E3(F.sus[2][2])];
    }), { small: true });
    comment(`Matrices de souplesse de la tête d'appui (programme PSH, SETRA/CETE de l'Ouest) : déplacements (vertical w, rotation θ, horizontal u) sous N, M, T unitaires en tête, charges instantanées (béton ${isF ? 'E_i' : 'E_cm'}, sol k) et soutenues (béton ${isF ? 'E_v' : 'E_cm/3'}, sol k × ${F2(sup.lines[0][code].found.psh.kSus)}${isF ? ', F62 annexe C.5' : ''}) ; fût et chevêtre consoles, semelle rigide, groupe de pieux : rigidité axiale E A/L (pieu en colonne, pointe fixe — convention PSH), rigidité transversale de Winkler (différences finies) avec le module de Ménard de chaque couche, tête ${sup.lines[0][code].found.psh.head === 'articule' ? 'articulée' : 'encastrée'}, pied ${sup.lines[0][code].found.psh.tip === 'encastre' ? 'encastré' : 'libre'}${(sup.sp.found.incl || []).some(a => a) ? ', pieux inclinés' : ''}. Ces souplesses (u/T) entrent dans la répartition des efforts horizontaux entre les lignes d'appui (§ 1). Contrôlé sur la sortie PSH de la pile P3 du Pont de Noé : souplesses à 0,3–4 % près, efforts et profil du pieu à 3 % près (tests).`);
    const rowsHead = [];
    for (const L of Ls) for (const [lab, r] of L[code].found.psh.gov) for (const fl of r.psh.files) rowsHead.push([`${lineName(L, n)} — ${lab}`, `${fl.file + 1} (x = ${F2(fl.x)}${fl.omega ? `, ω = ${F1(fl.omega * 180 / Math.PI)}°` : ''})`, `${F0(fl.Nmax)} / ${F0(fl.Nmin)}`, F1(fl.Mhead), `${F1(fl.Mmax)} à ${F1(fl.zMmax)} m`, F1(fl.Tmax), F2(fl.y0 * 1000), F1(fl.pmax), r.label]);
    table(['Ligne — cas', 'File', 'N max / min par pieu [kN]', 'M tête [kN·m]', 'M max [kN·m] à z', 'T max [kN]', 'y tête [mm]', 'p max [kPa]', 'Combinaison'], rowsHead, { small: true });
    comment('Efforts par pieu : semelle rigide sur le groupe (matrice de rigidité assemblée, part soutenue et part instantanée calculées chacune avec ses modules puis superposées), plan longitudinal et plan transversal (séisme Y, crue) cumulés (moments et efforts tranchants en résultante pour la section circulaire). p = k·y : réaction du sol (modèle linéaire ; la réaction est en pratique bornée par la pression de fluage p_f, à vérifier si p max approche p*_f).');
    for (const L of Ls) {
      const g = L[code].found.psh.gov.find(([lab]) => /M max/.test(lab)); if (!g) continue;
      const r = g[1], fl = r.psh.files.reduce((a, x) => (x.Mmax > a.Mmax ? x : a), r.psh.files[0]);
      const step = Math.max(1, Math.round(fl.prof.length / 16));
      const pts = fl.prof.filter((_, j) => j % step === 0 || j === fl.prof.length - 1);
      B.push({ t: 'p', text: `${lineName(L, n)} — profil du pieu le plus sollicité (file ${fl.file + 1}, ${r.label}) :` });
      table(['z [m]', 'M long. [kN·m]', 'T long. [kN]', 'y long. [mm]', 'p [kPa]', ...(pts.some(q => q.Mt) ? ['M transv. [kN·m]', 'T transv. [kN]'] : [])], pts.map(q => [F1(q.z), F1(q.M), F1(q.T), F2(q.y * 1000), F1(q.p), ...(pts.some(x => x.Mt) ? [F1(q.Mt), F1(q.Tt)] : [])]), { small: true });
      if (!opts.noFigures) try { for (const b of pileProfileCharts(L, code)) B.push(b); } catch (e) { /* profil indisponible */ }
    }
    // --- compléments : plastification du sol, remblai, frottement négatif, tassement, Blévot ---
    const plRows = Ls.filter(L => L[code].found.plast && L[code].found.plast.nodes > 0);
    if (plRows.length) table(['Ligne', 'Combinaison', 'Nœuds au palier', 'Profondeur plastifiée [m]', 'Itérations'], plRows.map(L => { const p = L[code].found.plast; return [lineName(L, n), p.label, String(p.nodes), `0 – ${F2(p.zMax)}`, String(p.iterations)]; }), { small: true });
    comment(`Réaction frontale du sol (F62 annexe C.5 ; NF P 94-262 annexe I) : module k = E_s/B de Ménard, palier r ≤ B p*_f (p*_f du sondage : 7e colonne des couches, essais, à défaut p*_l/2), minoration près de la surface 0,5 (1 + z/z_c) sur le module et le palier, z_c = 2B (sols cohérents) ou 4B (frottants). ${plRows.length ? 'Le palier est atteint pour les combinaisons ci-dessus : modules sécants itérés nœud par nœud (réduction commune aux pieux du groupe, déterminée par le plus sollicité).' : 'Le palier n\'est atteint pour aucune combinaison.'}`);
    const rem = Ls.filter(L => L[code].found.earth);
    if (rem.length) comment(`Remblai traversé par les pieux des culées sur ${F2(rem[0][code].found.earth.h)} m : poussée p = K_a (γ σ + q) avec K_a = ${F2(rem[0][code].found.earth.Ka)}, sur une largeur b = min(3 Ø ; entraxe) = ${F2(rem[0][code].found.earth.bEff)} m (hypothèse PSIDA, comme les colonnes enterrées), action permanente × 1,35 (terres) et variable (surcharge) à l'ELU, appliquée comme charge répartie sur chaque pieu (modèle PSH) ; module de réaction du remblai saisi ; frottement du remblai non compté dans la portance.`);
    const fnL = Ls.filter(L => L[code].found.negFr);
    if (fnL.length) {
      h2('Frottement négatif (méthode de Combarieu)');
      table(['Ligne', 'Remblai [m] ; h₂ [m]', 'K tan δ par couche', 'G_sn pieu isolé / groupe [kN]', 'G_sn retenu [kN]', 'Hauteur d\'action [m]', 'N ELU / ELS avec G_sn [kN]', 'Portance sans frottement au-dessus'], fnL.map(L => {
        const f = L[code].found.negFr;
        if (!f.applicable) return [lineName(L, n), '—', '—', '—', '—', '—', '—', f.motif];
        return [lineName(L, n), `${F2(f.hRemb)} ; ${F2(f.h2)}`, f.couches.map(c => `${c.classe} ${F2(c.Kt)}`).join(', '), `${F0(f.iso.Fn)} / ${f.grp ? F0(f.grp.Fn) : '—'}`, F0(f.Fn), F2(f.hAction), `${F0(f.NfnU)} / ${F0(f.NfnS)}`, f.capFn.applicable ? `ELU ${F2(f.ratioELU)} ${ok(f.ratioELU)} ; ELS ${F2(f.ratioELS)} ${ok(f.ratioELS)}` : f.capFn.motif];
      }), { small: true });
      comment(`${isF ? 'Fascicule 62 annexe G.2' : 'NF P 94-262 annexe H'} : σ'_v au contact du pieu par la récurrence de Combarieu (λ, μ selon K tan δ du tableau, pieux ${fnL[0][code].found.negFr.mise || ''}), hauteur d'action où σ'_v retombe à σ'_v0 ou h₂ ; groupe : rayon d'influence b = d/√π (une file) ou √(d d'/π), répartition empirique (pieu d'angle 7/12 G_sn(b) + 5/12 G_sn(∞), ou d'extrémité ⅓ + ⅔), borne π b² q ; cumul ${isF ? 'F62 C.3.3' : 'EN 1997-1 7.3.2 / NF P 94-262'} : N_d = N_G + max(1,35 G_sn ; N_Q) à l'ELU, N_G + max(G_sn ; N_Q) à l'ELS ; portance recalculée sans frottement positif au-dessus de la hauteur d'action. γ des couches = γ saisi (prendre γ' sous la nappe).`);
    }
    h2('Tassement des fondations sur pieux (quasi permanent)');
    table(['Ligne', 'N_qp par pieu [kN]', 'Pieu isolé (Frank et Zhao) [mm]', 'Forfaitaire 0,6 % Ø [mm]', 'Semelle fictive : z ; B × L [m] ; q [kPa]', 'Tassement du bloc [mm]', 'Total estimé [mm]'], Ls.map(L => {
      const t = L[code].found.settle; if (!t || t.error) return [lineName(L, n), '—', '—', '—', '—', '—', t ? t.error : '—'];
      return [lineName(L, n), F0(t.NqpPile), t.sIso === null ? 'hors domaine' : F1(t.sIso), F1(t.sForf), `${F1(t.raft.zf)} ; ${F2(t.raft.B)} × ${F2(t.raft.L)} ; ${F0(t.raft.q)}`, F1(t.raft.s), F1(t.total)];
    }), { small: true });
    comment('Pieu isolé : lois de transfert de Frank et Zhao (k_t = 2 E_M/B en sols fins, 0,8 E_M/B en sols granulaires ; k_q = 11 et 4,8 E_M/B ; q_s et q_b de la portance) ; contrôle forfaitaire 0,6 % Ø (pieux forés, LCPC-Sétra 1985) ; groupe : semelle fictive aux 2/3 de la fiche, de la dimension du bloc de pieux, tassement de Ménard (F62 annexe F.2 ; NF P 94-261 annexe H) sous la charge quasi permanente totale (part soutenue des combinaisons ELS) — estimation à confronter aux tassements admissibles de l\'ouvrage (dénivellations d\'appui du tablier).');
    const bl = Ls.filter(L => L[code].found.blev);
    if (bl.length) {
      h2('Semelles sur quatre pieux — méthode de Blévot');
      table(['Ligne', 'P_u [kN]', 'a poteau (carré éq.) ; a\' entraxe [m]', 'd ; [d_min ; d_max] [m]', 'θ', 'Bielles poteau / pieux [MPa] (≤ lim.)', 'Cerces A_c [cm²]', 'Diagonales A_d [cm²]'], bl.map(L => {
        const b = L[code].found.blev;
        return [lineName(L, n), F0(b.Pu), `${F2(b.aEq)} ; ${F2(b.apE)}${b.nonCarre ? ' (maille non carrée : moyenne)' : ''}`, `${F2(b.e ? (L[code].found.hs - 0.10) : NaN)} ; [${F2(b.dmin)} ; ${F2(b.dmax)}] ${b.dOk ? 'OK' : 'NON'}`, `${F1(b.theta)}°`, `${F1(b.sigCol)} / ${F1(b.sigPile)} (${F1(b.lim)}) ${b.sigCol <= b.lim && b.sigPile <= b.lim ? 'OK' : 'NON'}`, CM(b.Ac), CM(b.Ad)];
      }));
      comment('Méthode de Blévot et Frémy (1967), règles BAEL (J. Perchat, Techniques de l\'Ingénieur C 2 314 § 6.3.3.3) : 0,71 (a\' − a/2) ≤ d ≤ a\' − a/2, tan θ = d √2/(a\' − a/2) ; bielles P_u/(B sin²θ) et (P_u + 1,35 G₀)/(4 B_p sin²θ) ≤ 1,35 f_c28 ; disposition a : cerces A_c = P₁ (a\' − a/2)/(8 d f_su), P₁ = 0,5 P_u, et diagonales A_d = (P_u − P₁) √2 (a\' − a/2)/(8 d f_su), majorées de 10 % (fissuration préjudiciable). Semelles sur 3 pieux (disposition en triangle) : formules disponibles (blevot, n = 3), disposition non saisissable par files.');
    }
    const f0 = Ls[0][code].found;
    if (f0.nF === 2) {
      h2('Semelles sur deux files de pieux — méthode des bielles (PP73 1.3.2 ch. 4)');
      table(['Ligne', 'h utile [m]', 'Angle des bielles', 'h_s ≥ max(0,60 ; 1,4 Ø)', 'A₁ par couple ELU / ELS [cm²]', 'A₁ total [cm²]', 'Bande Ø + h_s [m]', "A'₁ et A₂ [cm²/m]", 'Ancrage ≥ 0,8 R/σ̄ [cm²]', 'Poinçonnement pieu'], Ls.map(L => {
        const t = L[code].found.tie;
        return [lineName(L, n), F2(t.h), `${F1(t.theta)}° ${t.thetaOk ? 'OK' : 'NON (< 45° : calcul en dalle)'}`, t.hOk ? 'OK' : `NON (${F2(t.hmin)} m)`, `${CM(t.A1U)} / ${CM(t.A1S)}`, CM(t.total), F2(t.band), CM(t.A2), CM(t.Aanchor), t.punchOk === null ? 'sans objet (PP73 § 4.6.2 : pieux d\'angle, > 2 pieux, θ ≥ 45°)' : `${F0(L[code].found.NmaxS)} / ${F0(t.Rpunch)} kN ${t.punchOk ? 'OK' : 'NON'}`];
      }), { small: true });
      comment(`PP73 pièce 1.3.2 § 4.3 : tirant par couple de pieux A₁ = R (l/2 − b/4)/(h σ̄), R = réaction la plus élevée d'un pieu du couple, à l'ELU (f_su) et à l'ELS (σ̄_s = ${F1(L0s(Ls, code).sigSels)} MPa${isF ? ', fissuration très préjudiciable' : ', 0,8 f_yk'}) ; domaine : bielles inclinées à 45° au moins (h ≥ l/2 − b/4) ; A₁ réparti sur Ø + h_s au droit des pieux ; armatures de répartition A'₁ et longitudinales A₂ ≥ 1/3 de la densité de A₁ ; poinçonnement du pieu d'angle R ≤ (2/3)(h + Ø) h σ₂₈ (σ₂₈ = 2 MPa). La note du Pont de Noé applique au tirant la charge totale de la semelle au lieu de la réaction d'un pieu.`);
      if (!opts.noFigures) {
        const Lc = Ls.filter(L => L[code].found.tie).reduce((a, L) => (!a || L[code].found.tie.A1 > a[code].found.tie.A1 ? L : a), null);
        if (Lc) try { const cr = capRebarSchema(sup, Lc, code); if (cr) B.push(svgBlock(cr, `${lineName(Lc, n)} — plan de ferraillage de la semelle sur deux files de pieux (tirant le plus fort)`)); } catch (e) { /* plan indisponible */ }
      }
    }
    if (f0.nF >= 3) {
      h2('Semelles sur plusieurs files de pieux — bielles généralisées (PP73 1.3.2 ch. 4)');
      table(['Ligne', 'File x [m]', 'R par pieu ELU [kN]', 'Angle de bielle', 'Tirant par pieu ELU [kN]'], Ls.flatMap(L => { const c = L[code].found.capFiles.ELU; return c.rows.map(rw => [lineName(L, n), F2(rw.x), F0(rw.R), rw.inside ? 'sous le fût' : `${F1(rw.theta)}° ${rw.theta >= 45 ? 'OK' : 'NON (< 45° : calcul en dalle)'}`, rw.inside ? '—' : F0(rw.tie)]); }), { small: true });
      table(['Ligne', 'A tirant par pieu (ELU / ELS) [cm²]', 'M au nu du fût [kN·m]', 'A flexion [cm²]', 'A retenu par bande de pieux [cm²]'], Ls.map(L => { const c = L[code].found.capFiles; return [lineName(L, n), `${CM(c.ELU.A)} / ${CM(c.ELS.A)}`, F0(Math.max(c.ELU.Mface, c.ELS.Mface)), CM(c.Abend), CM(Math.max(c.A, c.Abend / L[code].found.nP))]; }));
      comment('Méthode des bielles généralisée : pour chaque pieu hors de l\'emprise du fût, tirant T = R (|x| − b/4)/h (identique à A₁ = R (l/2 − b/4)/(h σ̄) de PP73 pour deux files), bielle d\'inclinaison θ = atan(h/(|x| − b/4)) ≥ 45° ; contrôle complémentaire en flexion au nu du fût, M = Σ R (|x| − b/2), A = M/(0,9 h f_su), réparti sur la longueur de la semelle. Semelles sur 3 ou 4 pieux isolés : méthode de Blévot (PP73 § 4.7.5) non traitée.');
    }
    if (f0.nF === 1) {
      h2('Semelles filantes sur une file de pieux');
      table(['Ligne', 'M⁻ / M⁺ [kN·m]', 'V [kN]', 'Poutre h_s : A_s sup / inf [cm²]', 'Paroi fléchie : h ; h/l ; z [m]', 'Paroi : tirant inf. / aciers sur pieux [cm²]'], Ls.map(L => { const b = L[code].found.capBeam, p = b.paroi; return [lineName(L, n), `${F0(b.Mneg)} / ${F0(b.Mpos)}`, F0(b.V), `${CM(b.AsTop)} / ${CM(b.AsBot)}`, p ? (p.applicable ? `${F2(p.h)} ; ${F2(p.r)} ; ${F2(p.z)}` : `h/l = ${F2(p.r)} < 1/2 : poutre`) : 'colonnes : poutre', p && p.applicable ? `${CM(p.Abot)} (sur ${F2(p.hTie)} m) / ${CM(p.Atop)}` : '—']; }));
      comment('Voile unique sur une file de pieux (PP73 1.3.2 § 4.4) : la semelle et la base du voile travaillent en paroi fléchie (Fascicule 61 titre VI annexe A4, BAEL 91 annexe E.5) : h = h_s + hauteur du voile, portée l = min(l_axes ; 1,15 l_nus), paroi fléchie si h ≥ l/2 ; travées continues : z = 0,2 (l + 1,5 h) (1/2 ≤ h/l ≤ 1) ou 0,5 l (h > l) ; tirant inférieur M_t/(z f_e/γ_s) réparti sur 0,15 h_a (h_a = min(h ; l)), aciers sur appuis M_a/(z f_e/γ_s) dans la partie basse du voile ; armatures réparties selon l\'annexe E.5. Le calcul en poutre de hauteur h_s seule est donné à titre de comparaison (sécuritaire sur les aciers, il ignore le fonctionnement en paroi).');
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
    { t: 'h1', text: '2. Appuis et fondations' }, ...supportsBlocks(sup, ref, { noWater: true })];
  let k = 3;
  const wb = waterBlocks(sup, ref);
  if (wb.length) blocks.push({ t: 'h1', text: `${k++}. Piles en rivière — courant, embâcles, affouillement` }, ...wb.filter(b => !(b.t === 'h2' && /^Piles en rivière/.test(b.text))));
  if (sup.sp.seisme.actif) blocks.push({ t: 'h1', text: `${k++}. Calcul sismique — EN 1998-2 (Pont EC8)` }, ...seismicBlocks(sup.seisme));
  return { title, meta: `${today} · calcul PSIDA v${version}`, blocks };
}

/** Rendu HTML minimal des blocs (interface). */
export function blocksToHTML(blocks) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return blocks.map(b => {
    if (b.t === 'h2') return `<h3>${esc(b.text)}</h3>`;
    if (b.t === 'p') return `<p class="small">${esc(b.text)}</p>`;
    if (b.t === 'h1') return `<h3>${esc(b.text)}</h3>`;
    if (b.t === 'h3') return `<h5>${esc(b.text)}</h5>`;
    if (b.t === 'ref') return `<p class="small ref">${esc(b.text)}</p>`;
    if (b.t === 'math') return `<div class="math" data-tex="${esc(b.tex).replace(/"/g, '&quot;')}">${esc(b.tex)}</div>`;
    if (b.t === 'svg') return `<figure class="fig-sondage" style="max-width:760px;margin:8px 0">${b.svg}<figcaption class="small">${esc(b.caption || '')}</figcaption></figure>`;
    if (b.t === 'comment') return `<p class="small" style="font-style:italic">${esc(b.text)}</p>`;
    if (b.t === 'table') return `<table><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c).replace(/\bNON\b/g, '<span class="badge warn">NON</span>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return '';
  }).join('');
}

/** Section « piles en rivière » seule (chapitre de la note globale). */
export const waterBlocks = (sup, ref = 'F61') => supportsBlocks(sup, ref, { onlyWater: true });
