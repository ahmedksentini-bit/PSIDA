/**
 * Plan des torons d'une poutre PRAD (pré-tension) : élévation avec les zones gainées de chaque groupe, coupe du talon
 * avec la position des torons (adhérents, gainés par groupe, supérieurs), tableau des groupes, tension sur banc et pertes
 * au relâchement, longueurs de transmission et d'ancrage (EN 1992-1-1 § 8.10.2).
 */
import { Vue } from './dessin.js';
import { composer } from './mise_en_page.js';
import { couperNote } from './appuis.js';
import { vueCoupe } from './vipp.js';

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

function vueElevationTorons(v) {
  const pr = v.prad, f = v.S.forme, a = pr.a.about, L = v.L, Lp = L + 2 * a;
  const V = new Vue('ÉLÉVATION — TORONS ET ZONES GAINÉES', { echelle: 100, echelleV: 25 });
  V.poly('COFFRAGE', [[0, 0], [Lp, 0], [Lp, f.hp], [0, f.hp]], true);
  for (const xa of [a, Lp - a]) { V.ligne('AXES', [xa, -0.3], [xa, f.hp + 0.2]); V.poly('APPAREILS', [[xa - 0.15, -0.05], [xa + 0.15, -0.05], [xa + 0.15, 0], [xa - 0.15, 0]], true); }
  v.trace.cab.forEach((cb, ig) => {
    const y = cb.ym + (cb.sup ? 0 : ig * 0.012);   // lignes légèrement décalées pour la lecture
    V.poly('ACIERS', [[0, y], [Lp, y]]);
    if (cb.Lg > 0) for (const [x0, x1] of [[0, cb.Lg], [Lp - cb.Lg, Lp]]) { V.poly('VUES', [[x0, y - 0.02], [x1, y - 0.02], [x1, y + 0.02], [x0, y + 0.02]], true); V.texte('TEXTES', [(x0 + x1) / 2, y + 0.05], `G${ig}`, { h: 1.6, ancre: 'c' }); }
  });
  const gr = v.trace.cab.filter(cb => cb.Lg > 0);
  gr.forEach((cb, k) => V.coteH([0, f.hp], [cb.Lg, f.hp], f.hp + 0.25 + 0.2 * k, `gaine G${v.trace.cab.indexOf(cb)} : ${fr(cb.Lg)}`));
  V.coteH([a, 0], [Lp - a, 0], -0.45, `L = ${fr(L)}`); V.coteH([0, 0], [Lp, 0], -0.75, fr(Lp));
  V.coteV([0, 0], [0, f.hp], -0.5);
  return V;
}

export function planToronsPRAD(v, cartouche = {}, { nom = 'POUTRE PRAD', a } = {}) {
  const pr = v.prad, S = v.S, f = S.forme, el = vueElevationTorons(v);
  const coupe = vueCoupe(v, S, null, { titre: 'COUPE A-A : TORONS DANS LE TALON', armatures: V => {
    const grp = pr.attribue, r = pr.T.phi / 2;
    pr.pos.forEach((q, k) => { const g = grp[k]; V.cercle('ACIERS_COUPES', [q.z, q.y], r * 1.4, g === 0); if (g > 0) V.texte('TEXTES', [q.z, q.y - 0.035], String(g), { h: 1.4, ancre: 'c', v: 'h' }); });
    if (pr.a.nsup > 0) for (let k = 0; k < pr.a.nsup; k++) V.cercle('ACIERS_COUPES', [(k - (pr.a.nsup - 1) / 2) * 0.10, f.hp - pr.a.cote], r * 1.4, true);
    V.texte('TEXTES', [f.bta / 2 + 0.05, pr.a.cBas], '● adhérent  ○ gainé (n° du groupe)', { h: 1.8, v: 'm' });
  } });
  const tg = { titre: 'GROUPES DE TORONS (UNE POUTRE)', hl: 4.8, h: 1.9, cols: [{ t: 'Groupe', w: 26, a: 'g' }, { t: 'Torons', w: 16, a: 'd' }, { t: 'Gainés sur [m]', w: 24, a: 'd' }, { t: 'y moyen [m]', w: 20, a: 'd' }, { t: 'P_m0 [kN]', w: 20, a: 'd' }, { t: 'P∞ [kN]', w: 20, a: 'd' }],
    lignes: v.trace.cab.map((cb, ig) => [cb.sup ? 'supérieurs' : ig === 0 ? 'adhérents' : `gainé G${ig}`, String(cb.n), cb.Lg ? fr(cb.Lg) : '—', fr(cb.ym, 3), milliers(cb.P), milliers(v.pertes[ig] ? v.pertes[ig].Pinf : NaN)]) };
  const tp = { titre: 'TENSION ET PERTES (PAR TORON, MPa)', hl: 4.8, h: 1.9, cols: [{ t: 'Grandeur', w: 96, a: 'g' }, { t: 'Valeur', w: 30, a: 'd' }],
    lignes: [['Tension sur banc σ_pi = min(0,8 f_pk ; 0,9 f_p0,1k)', fr(pr.sigPi, 0)], ['Relaxation sur banc', fr(pr.dRel, 1)], ['Étuvage 0,5 E_p α_c ΔT', fr(pr.dTh, 1)], ['Raccourcissement élastique au relâchement', fr(pr.sigEl, 1)],
      ['σ_pm0 après relâchement', fr(pr.sigPm0, 0)], ['σ_p∞ (mi-travée)', fr(v.ancrage.sigPinf, 0)], ['Longueur de transmission l_pt [m] (l_pt1 ; l_pt2)', `${fr(pr.lpt)} (${fr(pr.lpt1)} ; ${fr(pr.lpt2)})`], ['Longueur d\'ancrage l_bpd [m]', fr(v.ancrage.lbpd)]] };
  const N = ['NOTES', `1. Torons ${pr.a.type === 'T13S' ? 'T13' : 'T15'} super, f_pk = ${pr.a.fpk} MPa, classe 2 ; relâchement ${pr.a.alpha1 > 1 ? 'brutal (α₁ = 1,25)' : 'progressif (α₁ = 1,0)'} à ${fr(v.dates.t1, 1)} j${pr.a.dT ? ` après étuvage (ΔT = ${fr(pr.a.dT, 0)} K)` : ''}.`,
    '2. Gaines des torons gainés : tubes PEHD étanches aux deux extrémités, longueurs comptées depuis l\'about ; au plus la moitié des torons gainés, jamais les torons d\'angle.',
    `3. Abouts de ${fr(pr.a.about)} m (≥ 30 cm de l'axe d'appui, dossier Sétra PRAD 73 § 1.3) ; frettage d'about et armatures d'éclatement selon EN 1992-1-1 § 8.10.3.`,
    '4. Entraxe des torons ≥ max(2φ ; d_g + 5 mm ; 20 mm) en distance libre (§ 8.10.1.2) ; enrobage selon la classe d\'exposition.',
    '5. Contrôles : rentrée des torons au relâchement (≤ 1,5 fois la moyenne), flèche au relâchement (écart ≤ 20 % de la moyenne) — dossier PRAD 73 § 1.4.'].flatMap((l, i) => (i ? couperNote(l, 72) : [l]));
  const hg = (tg.lignes.length + 2) * tg.hl, hp = (tp.lignes.length + 2) * tp.hl, hn = N.length * 2.1 * 1.6, wcol = 130;
  const F = composer({ titre: `${nom} — TORONS ET GAINAGE`, cartouche, rangees: [[el], [coupe]],
    groupes: [{ vues: [el], cible: 200, min: 50 }, { vues: [coupe], cible: 20, min: 10 }], colonne: { largeur: wcol + 6, hauteur: 2 + hg + 6 + hp + 6 + hn + 4 },
    poser: (F, [x, y]) => { const x0 = F.W - 10 - wcol - 3; F.tableau(tp, x0, y + 2); F.tableau(tg, x0, y + 2 + hp + 6); F.note(N, x0, y + 2 + hp + 6 + hg + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true; } }, ['A3', 'A2', 'A1']);
  F.cartouche.echelles = F.cartouche.echelles || [...new Set(F.vues.map(q => '1/' + q.vue.echelle + (q.vue.echelleV ? ` (V 1/${q.vue.echelleV})` : '')))].join(' ; ');
  return F;
}
