/**
 * Nomenclature et bordereau de façonnage des armatures d'une travée de tablier à poutres en béton armé (onglet « Tablier
 * à poutres », poutres BA) : codes de forme et longueurs de coupe de l'ISO 4066 (bordereau.js), mandrins de l'EN 1992-1-1
 * § 8.3 (4 φ jusqu'à 16 mm, 7 φ au-delà), barres droites de 12 m au plus et recouvrements l₀ (§ 8.7.3, α₆ = 1,5) décalés.
 *
 *  Poutre (× n poutres) : lits inférieurs (épure d'arrêt ; lits filants relevés au-delà des appuis, code 21), armatures
 *   supérieures sur appuis des travées continues (deux groupes), cadres d'âme (51) et de talon (51) au pas des zones,
 *   étriers intérieurs (4 brins), armatures de peau HA12 / 25, barres de montage HA16 ;
 *  Hourdis (toute la largeur) : transversales inférieures et supérieures, répartition longitudinale (deux nappes) ;
 *  Entretoises d'about (deux) : armatures inférieures et supérieures du vérinage (21), cadres (51), peau ;
 *  Entretoises intermédiaires (n_e) : E1 inférieures relevées dans les poutres de rive (21), E2 supérieures continues (21),
 *   E3 cadres (51), E4 cadres de suspension HA12 dans les poutres (51).
 * Les longueurs, nombres et masses sont ceux des plans de coffrage et de ferraillage (mêmes données, src/plans/poutres_ba.js).
 */
import { longueurCoupe, recapitulatif, rayonCintrage } from './bordereau.js';
import { areaOf, massPerM, anchorage } from '../rebar.js';
import { L_COMMERCIALE } from './nomenclature_vipp.js';
import { retourLit, nappesHourdis, ameTalon, barresEntretoise, vuePoutre, vueEntretoise } from './poutres_ba.js';
import { composer } from './mise_en_page.js';
import { placerBordereau } from './ferraillage.js';
import { couperNote } from './appuis.js';

const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25, mm = x => x * 1000;
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');

/**
 * Lignes : { repere, element, desig, phi, code, A, B, C (mm), L (mm, longueur de coupe), nombre, parPoutre, total (m), masse (kg) }.
 * @param {object} D données des plans (donneesBA)
 */
export function nomenclatureBA(D) {
  const { inp, sp, a, H, hp, bars, zones, code } = D, n = inp.n, L = sp.L, Lp = L + 2 * a, c = 0.03, W = n * inp.b1, fck = inp.fck;
  const AT = ameTalon(D), z0 = zones[0] || { phi: 10, s: 0.2, brins: 2 };
  const out = [];
  let rep = 0;
  const ligne = (element, desig, phi, cd, dims, nombre, parPoutre = null, suffixe = '') => {
    const A = r5(dims.A || 0), B = r5(dims.B || 0), C = r5(dims.C || 0), Lc = r25(longueurCoupe(cd, { A, B, C }, phi));
    out.push({ repere: (suffixe ? String(rep) : String(++rep)) + suffixe.trim(), element, desig, phi, code: cd, A, B: cd === '00' ? null : B, C: cd === '21' || cd === '51' ? C : null, L: Lc, nombre,
      parPoutre, total: Lc / 1000 * nombre, masse: Lc / 1000 * nombre * massPerM(phi) });
  };
  /** Barre de longueur hors tout Lt [m] (retours de hauteur ret [m] aux extrémités indiquées) découpée en pièces de 12 m au plus. */
  const barre = (element, desig, phi, Lt, nb, { hooks = [false, false], ret = 0, parPoutre = null } = {}) => {
    const Ldroit = Lt;
    const l0 = anchorage(phi, { fck }).l0, np = Ldroit + (hooks[0] ? ret : 0) + (hooks[1] ? ret : 0) <= L_COMMERCIALE + 1e-9 ? 1 : Math.ceil((Ldroit - l0) / (L_COMMERCIALE - Math.max(...hooks.map(h => (h ? ret : 0))) - l0) - 1e-9);
    const Lpc = (Ldroit + (np - 1) * l0) / np, txt = np > 1 ? ` — ${np} pièces, l₀ = ${fr(l0)} m` : '', pp = k => (parPoutre ? parPoutre * k : null);
    if (np === 1) {
      if (hooks[0] && hooks[1]) ligne(element, desig, phi, '21', { A: mm(ret), B: mm(Ldroit), C: mm(ret) }, nb, parPoutre);
      else if (hooks[0] || hooks[1]) ligne(element, desig, phi, '11', { A: mm(Ldroit), B: mm(ret) }, nb, parPoutre);
      else ligne(element, desig, phi, '00', { A: mm(Ldroit) }, nb, parPoutre);
      return;
    }
    // pièces d'extrémité avec leur retour, pièces courantes droites (sous-repères a, b)
    const ext = (hooks[0] ? 1 : 0) + (hooks[1] ? 1 : 0), droites = np - ext;
    rep++;
    let k = 0; const seul = !(ext && droites), suf = () => (seul ? ' ' : String.fromCharCode(97 + k++));
    if (ext) ligne(element, desig + txt + ' (pièces d\'extrémité)', phi, '11', { A: mm(Lpc), B: mm(ret) }, nb * ext, pp(ext), suf());
    if (droites) ligne(element, desig + txt + (ext ? ' (pièces courantes)' : ''), phi, '00', { A: mm(Lpc) }, nb * droites, pp(droites), suf());
  };

  // ---- poutres (× n)
  const rt = retourLit(bars.phi);
  bars.lits.forEach((l, k) => {
    const desig = `lit ${k + 1} : ${l.n} HA${bars.phi}${l.filant ? `, filant, relevé de ${fr(rt)} m au-delà des appuis` : `, arrêt à ${fr(l.x0)} m de l'axe d'appui`}`;
    barre('poutre', desig, bars.phi, l.L, l.n * n, { hooks: l.filant ? [true, true] : [false, false], ret: rt, parPoutre: l.n });
  });
  for (const [m, q] of (D.superieures || []).entries()) q.groupes.forEach((g, gi) => {
    barre('poutre', `S${m + 1}${'ab'[gi]} sup. appui ${q.appui + 1} : ${g.n} HA${q.phi} (${fr(g.dg)} m à gauche, ${fr(g.dd)} m à droite)`, q.phi, g.L, g.n * n, { parPoutre: g.n });
  });
  const nEt = Math.round(zones.reduce((s, z) => s + 2 * (z.x1 - z.x0) / z.s, 0) + 2 * a / 0.15) + 1;
  ligne('poutre', `cadres d'âme HA${z0.phi} (zones d'étriers), fermés par crochets à 135°`, z0.phi, '51', { A: mm(H - 2 * c), B: mm(AT.b0 - 2 * c), C: 10 * z0.phi }, nEt * n, nEt);
  if (AT.talon) ligne('poutre', `cadres de talon HA${z0.phi}, au pas des cadres d'âme`, z0.phi, '51', { A: mm(AT.ht - 2 * c), B: mm(AT.bt - 2 * c), C: 10 * z0.phi }, nEt * n, nEt);
  if (z0.brins === 4) ligne('poutre', `étriers intérieurs HA${z0.phi} (4 brins)`, z0.phi, '51', { A: mm(H - 2 * c - 0.02), B: mm(AT.bt / 2 - 2 * c), C: 10 * z0.phi }, nEt * n, nEt);
  const nPeau = 2 * Math.max(0, Math.floor((hp - AT.ht - 0.15) / 0.25));
  if (nPeau) barre('poutre', `peau : ${nPeau / 2} HA12 par face d'âme`, 12, Lp - 2 * c, nPeau * n, { parPoutre: nPeau });
  barre('poutre', 'montage : 2 HA16 (porte-cadres)', 16, Lp - 2 * c, 2 * n, { parPoutre: 2 });

  // ---- hourdis (toute la largeur)
  const { ni, ns, rep: rp } = nappesHourdis(D), fs = s => fr(s * 100, 1);
  barre('hourdis', `transversales supérieures HA${ns.phi} / ${fs(ns.s)}`, ns.phi, W - 2 * c, Math.floor((Lp - 2 * c) / ns.s) + 1);
  barre('hourdis', `transversales inférieures HA${ni.phi} / ${fs(ni.s)}`, ni.phi, W - 2 * c, Math.floor((Lp - 2 * c) / ni.s) + 1);
  barre('hourdis', `répartition longitudinale HA${rp.phi} / ${fs(rp.s)}, deux nappes`, rp.phi, Lp - 2 * c, 2 * (Math.floor((W - 2 * c) / rp.s) + 1));

  // ---- entretoises d'about (deux par travée, vérinage)
  const E = D.entretoise;
  if (E && n >= 2) {
    const Le = (n - 1) * inp.b1 + AT.b0, te = E.te, hE = E.he + inp.hd;
    const choix = As => { for (const phi of [16, 20, 25, 32]) { const k = Math.max(2, Math.ceil(As / areaOf(phi))); if (k <= Math.max(2, Math.floor((te - 2 * c) / 0.05)) || phi === 32) return { phi, k }; } return { phi: 32, k: 2 }; };
    for (const [nomE, As] of [['inférieures', E.AsInf], ['supérieures', E.AsSup]]) {
      const b = choix(As), ret = Math.min(15 * b.phi / 1000, hE - 2 * c);
      barre('entretoise d\'about', `${nomE} : ${b.k} HA${b.phi} (vérinage), retours 15 φ`, b.phi, Le - 2 * c, 2 * b.k, { hooks: [true, true], ret });
    }
    const AswS = E.etriers && E.etriers.AswS || 0, sE = Math.min(Math.max(0.10, Math.floor(2 * areaOf(10) / Math.max(AswS, 1e-9) / 0.05) * 0.05), 0.25);
    ligne('entretoise d\'about', `cadres HA10 / ${fs(sE)}`, 10, '51', { A: mm(hE - 2 * c), B: mm(te - 2 * c), C: 100 }, 2 * (Math.floor((Le - 2 * c) / sE) + 1));
  }

  // ---- entretoises intermédiaires (n_e dans la travée détaillée)
  const EI = D.entInt;
  if (EI) {
    const BE = barresEntretoise(D), Lt = (n - 1) * inp.b1, he = hp - EI.zInf, nE = EI.nE;
    if (EI.inf) barre('entretoise intermédiaire', `E1 inférieures : ${EI.inf.n} HA${EI.inf.phi}${EI.inf.lits > 1 ? ` (${EI.inf.lits} lits)` : ''}, relevées dans les poutres de rive`, EI.inf.phi, Lt + EI.bw - 2 * c - 0.04, EI.inf.n * nE, { hooks: [true, true], ret: BE.retInf });
    const e2 = BE.lignes.find(l => l.rep === 'E2');
    if (EI.sup && e2) { const k = +e2.bar.split(' ')[0]; barre('entretoise intermédiaire', `E2 supérieures continues : ${k} HA${EI.sup.phi}`, EI.sup.phi, Lt + EI.bw - 2 * c, k * nE, { hooks: [true, true], ret: BE.retSup }); }
    const nEtI = Math.ceil((n - 1) * (inp.b1 - EI.bw) / EI.et.s) + (n - 1);
    ligne('entretoise intermédiaire', `E3 cadres HA${EI.et.phi} / ${fs(EI.et.s)} entre poutres`, EI.et.phi, '51', { A: mm(he + inp.hd - 2 * c), B: mm(EI.b - 2 * c), C: 10 * EI.et.phi }, nEtI * nE);
    ligne('entretoise intermédiaire', `E4 suspentes : ${EI.nSusp} cadres HA12 par poutre, de part et d'autre de l'entretoise`, 12, '51', { A: mm(H - 2 * c), B: mm(EI.bw - 2 * c), C: 120 }, EI.nSusp * n * nE);
  }

  const R = recapitulatif(out), masse = el => out.filter(l => l.element === el).reduce((s, l) => s + l.masse, 0);
  const volPoutre = D.parts.reduce((s, q) => s + q.b * q.h, 0) * Lp;
  const parElement = { poutre: masse('poutre'), hourdis: masse('hourdis'), about: masse('entretoise d\'about'), intermediaire: masse('entretoise intermédiaire') };
  return { lignes: out, R, parElement, masseParPoutre: parElement.poutre / n, ratioPoutre: parElement.poutre / n / volPoutre, Lp, W, n, a, c, code, mandrins: [...new Set(out.map(l => l.phi))].sort((x, y) => x - y).map(phi => ({ phi, D: 2 * rayonCintrage(phi) })) };
}

/* ----------------------------------------------------------------------------------------------- la feuille */

const milliers = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/** Feuille « nomenclature et façonnage » : coupe repérée de la poutre, repères, bordereau ISO 4066 avec croquis, notes. */
export function planNomenclatureBA(D, cartouche = {}, { nom = 'TABLIER À POUTRES BA' } = {}) {
  const N0 = nomenclatureBA(D), lignes = N0.lignes, { inp, hp, H, bars } = D, AT = ameTalon(D), c = N0.c;
  const idx = re => { const l = lignes.find(q => re.test(q.desig)); return l ? l.repere.replace(/[a-z]$/, '') : null; };
  const cp = vuePoutre(D, { titre: 'COUPE A-A : REPÈRES DU BORDEREAU (POUTRE)', armatures: V => {
    const ph = bars.phi / 1000;
    V.poly('ACIERS', [[-AT.b0 / 2 + c, c + (AT.talon ? 0.008 : 0)], [AT.b0 / 2 - c, c + (AT.talon ? 0.008 : 0)], [AT.b0 / 2 - c, H - c], [-AT.b0 / 2 + c, H - c]], true);
    if (AT.talon) V.poly('ACIERS', [[-AT.bt / 2 + c, c], [AT.bt / 2 - c, c], [AT.bt / 2 - c, AT.ht - c], [-AT.bt / 2 + c, AT.ht - c]], true);
    bars.lits.forEach((l, k) => {
      for (let i = 0; i < l.n; i++) V.cercle('ACIERS_COUPES', [-AT.bt / 2 + c + 0.012 + ph / 2 + i * (l.n > 1 ? (AT.bt - 2 * c - 0.024 - ph) / (l.n - 1) : 0), l.y], ph / 2, true);
      const r = idx(new RegExp(`^lit ${k + 1} `)); if (r) V.repere([AT.bt / 2 + 0.22, 0.04 + 0.09 * k], r, [AT.bt / 2 - c - 0.012 - ph / 2, l.y]);
    });
    const rc = idx(/^cadres d'âme/), rtl = idx(/^cadres de talon/), rpe = idx(/^peau/), rmo = idx(/^montage/), rhs = idx(/^transversales supérieures/), rhi = idx(/^transversales inférieures/);
    if (rc) V.repere([inp.b1 / 2 + 0.1, hp * 0.6], rc, [AT.b0 / 2 - c, hp * 0.6]);
    if (rtl) V.repere([-AT.bt / 2 - 0.25, AT.ht * 0.5], rtl, [-AT.bt / 2 + c, AT.ht * 0.5]);
    if (rpe) { for (let y = AT.ht + 0.25; y < hp - 0.15; y += 0.25) for (const sg of [-1, 1]) V.cercle('ACIERS_COUPES', [sg * (AT.b0 / 2 - c - 0.01), y], 0.006, true); V.repere([-inp.b1 / 2 - 0.1, hp * 0.45], rpe, [-AT.b0 / 2 + c + 0.01, hp * 0.45]); }
    if (rmo) { for (const sg of [-1, 1]) V.cercle('ACIERS_COUPES', [sg * (AT.b0 / 2 - c - 0.012), hp - 0.05], 0.008, true); V.repere([inp.b1 / 2 + 0.1, hp - 0.12], rmo, [AT.b0 / 2 - c - 0.012, hp - 0.05]); }
    for (const yy of [hp + 0.035, hp + inp.hd - 0.035]) V.poly('ACIERS', [[-inp.b1 / 2 + 0.03, yy], [inp.b1 / 2 - 0.03, yy]]);
    if (rhs) V.repere([-inp.b1 / 2 - 0.1, hp + inp.hd - 0.02], rhs, [-inp.b1 / 2 + 0.1, hp + inp.hd - 0.035]);
    if (rhi) V.repere([-inp.b1 / 2 - 0.1, hp + 0.02], rhi, [-inp.b1 / 2 + 0.1, hp + 0.035]);
  } });
  const td = { titre: 'REPÈRES', hl: 4.6, h: 1.9, cols: [{ t: 'Rep.', w: 11, a: 'c' }, { t: 'Élément', w: 34, a: 'c' }, { t: 'Désignation', w: 104, a: 'g' }, { t: 'Par poutre', w: 17, a: 'd' }],
    lignes: lignes.map(l => [l.repere, l.element, l.desig, l.parPoutre ? String(l.parPoutre) : '']) };
  const P = N0.parElement, code = N0.code;
  const notes = ['NOTES',
    `1. Nomenclature d'une travée de ${fr(D.sp.L)} m : ${N0.n} poutres identiques (poutre la plus sollicitée, abouts ${fr(N0.a)} m), hourdis de ${fr(N0.W)} m${D.entretoise && N0.n >= 2 ? ', deux entretoises d\'about' : ''}${D.entInt ? `, ${D.entInt.nE} entretoise(s) intermédiaire(s)` : ''}. Aciers HA f_yk = ${inp.fyk} MPa, enrobage ${fr(c * 100, 0)} cm ; règlement des sections : ${code === 'EC' ? 'EN 1992-1-1' : 'BAEL 91'}.`,
    `2. Longueurs de coupe ISO 4066 (codes 00, 11, 21, 51), cotes hors tout en mm arrondies à 5 mm, longueurs aux 25 mm supérieurs. Mandrins EN 1992-1-1 § 8.3 (tableau 8.1N) : ${N0.mandrins.map(q => `Ø${q.phi} : ${q.D} mm`).join(' ; ')}${code === 'EC' ? '' : ' ; BAEL 91 A.6.1,251 : rayon des ancrages courbes ≥ 5,5 φ (relevés des lits filants et des entretoises)'}.`,
    `3. Barres droites de ${L_COMMERCIALE} m au plus : pièces avec recouvrement l₀ = α₆ l_bd (α₆ = 1,5, EN 1992-1-1 § 8.7.3), recouvrements décalés d'au moins 1,3 l₀ d'une barre à l'autre et hors des zones de moment maximal ; pièces d'extrémité avec leur retour.`,
    `4. Cadres fermés par deux crochets à 135° de 10 φ (EN 1992-1-1 § 8.5, figure 8.5) ; cadres d'âme et de talon au pas des zones d'étriers du plan BA-FER-01, deux cadres rapprochés au droit des appareils d'appui.`,
    `5. Masses : poutres ${milliers(P.poutre)} kg (${milliers(N0.masseParPoutre)} kg par poutre, ${fr(N0.ratioPoutre, 0)} kg/m³ de poutre), hourdis ${milliers(P.hourdis)} kg${P.about ? `, entretoises d'about ${milliers(P.about)} kg` : ''}${P.intermediaire ? `, entretoises intermédiaires ${milliers(P.intermediaire)} kg` : ''} ; total ${milliers(N0.R.masse)} kg.`,
    '6. Façonnage à froid, sans soudure ; tolérances de façonnage selon la NF EN 13670 ; le bordereau est à reprendre par l\'entreprise d\'après les plans d\'exécution.'];
  const Nn = notes.flatMap((l, i) => (i === 0 ? [l] : couperNote(l, 80)));
  const wb = 166, hl = 4.6, hb = (lignes.length + 2) * hl + 6 + (N0.R.diam.length + 3) * 5.5, ht = (td.lignes.length + 2) * td.hl, hn = Nn.length * 2.1 * 1.6;
  const ce = D.entInt ? vueEntretoise(D) : null;   // coupe B-B : repères E1 à E4 (désignations du bordereau)
  const spec = c2 => ({ titre: `${nom} — NOMENCLATURE ET FAÇONNAGE DES ARMATURES`, cartouche: c2, rangees: ce ? [[cp], [ce]] : [[cp]], groupes: [{ vues: [cp], cible: 20, min: 10 }, ...(ce ? [{ vues: [ce], cible: 50, min: 20 }] : [])],
    colonne: { largeur: wb + 3, hauteur: 2 + hb + 6 + ht + 6 + hn + 4 },
    poser: (F, [x, y]) => {
      const xb = F.W - 10 - wb - 3;
      placerBordereau(F, lignes, [xb, y + 2 + ht + 6, wb, hb]);
      F.tableau(td, xb, y + 2);
      F.note(Nn, xb, y + 2 + ht + 6 + hb + 6 + hn - 2.1 * 0.6, 2.1); F.notes[F.notes.length - 1].titreGras = true;
    } });
  let F = composer(spec(cartouche), ['A2', 'A1', 'A0']);
  const libre = !cartouche.format || cartouche.format === 'auto';
  for (const f of ['A1', 'A0']) { if (!libre || (F.valide().ok && !F.deborde) || F.format === f || (f === 'A1' && F.format === 'A0')) break; F = composer(spec({ ...cartouche, format: f }), [f]); }
  F.cartouche.echelles = F.cartouche.echelles || '1/' + cp.echelle;
  F.nomenclature = N0;
  return F;
}
