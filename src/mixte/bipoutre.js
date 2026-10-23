/**
 * Pont mixte bipoutre (ou quadripoutre) : modèle par phases d'une poutre et de sa part de dalle (NF EN 1994-2).
 *
 * Phasage (moteur src/phasage) :
 *   1. charpente posée sur ses appuis, poids propre de l'acier (entretoises et raidisseurs : majoration forfaitaire) ;
 *   2. bétonnage de la dalle par plots (« pianotage ») : plots de travée d'abord, plots sur appuis ensuite ; chaque plot
 *      pèse sur la structure existante (acier + plots déjà durcis) puis devient collaborant le lendemain ;
 *   3. superstructures ; 4. effets différés jusqu'à la fin de la durée de calcul.
 * Acier : élastique (E_a = 210 000 MPa) ; béton : fluage et retrait de l'EN 1992-1-1 (annexe B, § 3.1.4) — les
 * coefficients d'équivalence n_L de l'EN 1994-2 § 5.4.2.2 en sont une approximation, recoupée en tests.
 * Fissuration (EN 1994-2 § 5.4.2.3 (3)) : sur 15 % de chaque travée de part et d'autre des appuis intermédiaires, la
 * dalle est réduite à ses armatures (béton tendu négligé) — méthode simplifiée admise si les travées adjacentes ont un
 * rapport de portées ≥ 0,6.
 * Sections : PRS de travée et PRS sur appui (zone d'appui = 15 % de part et d'autre, comme la fissuration, sauf indication).
 * La ligne des nœuds est le c.d.g. de l'acier de travée ; acier sur appui, dalle et armatures sont des barres décalées.
 */
import { couches, proprietes, largeurEfficace, longueursEquivalentes, fyEpaisseur } from './section.js';

const num = (v, d) => (Number.isFinite(+v) && String(v).trim() !== '' ? +v : d);

export const DEFAUTS_BIPOUTRE = {
  L: [45, 60, 45], nb: 20, nPoutres: 2,
  largeur: 10.5, entraxe: 6.0, hc: 0.28, hg: 0.05,
  travee: { bfi: 0.80, tfi: 0.035, hw: 2.20, tw: 0.018, bfs: 0.60, tfs: 0.030 },
  appui: { bfi: 1.00, tfi: 0.070, hw: 2.20, tw: 0.022, bfs: 0.80, tfs: 0.060 },
  nuance: 'S355', majAcier: 1.10, rhoTravee: 0.006, rhoAppui: 0.012,
  fck: 35, RH: 70, h0: 280, ciment: 'N', gSup: 13.5, gBeton: 25, gAcier: 78.5,
  zone: 0.15, fissuration: true,
  dates: { charpente: 0, debut: 30, cadence: 2, superstructures: 120, fin: 36500 },
  parDecade: 6,
};

/** Lecture des champs mx_* du formulaire. */
export function lireBipoutre(d = {}) {
  const D = DEFAUTS_BIPOUTRE, L = String(d.mx_L ?? '').split(/[;,\s]+/).map(Number).filter(v => v > 0);
  // épaisseurs saisies en mm, largeurs et hauteurs en m
  const sec = (p, dd) => ({ bfi: num(d[`mx_${p}bfi`], dd.bfi), tfi: num(d[`mx_${p}tfi`], dd.tfi * 1000) / 1000, hw: num(d[`mx_${p}hw`], dd.hw),
    tw: num(d[`mx_${p}tw`], dd.tw * 1000) / 1000, bfs: num(d[`mx_${p}bfs`], dd.bfs), tfs: num(d[`mx_${p}tfs`], dd.tfs * 1000) / 1000 });
  const T = sec('t', D.travee), A = sec('a', D.appui);
  return {
    L: L.length ? L : D.L, nb: Math.max(8, Math.round(num(d.mx_nb, D.nb) / 2) * 2), nPoutres: Math.max(2, Math.round(num(d.mx_np, D.nPoutres))),
    largeur: num(d.mx_B, D.largeur), entraxe: num(d.mx_e, D.entraxe), hc: num(d.mx_hc, D.hc), hg: num(d.mx_hg, D.hg),
    travee: T, appui: A, nuance: d.mx_nuance || D.nuance, majAcier: num(d.mx_maj, D.majAcier),
    rhoTravee: num(d.mx_rhot, D.rhoTravee * 100) / 100, rhoAppui: num(d.mx_rhoa, D.rhoAppui * 100) / 100,
    fck: num(d.mx_fck, D.fck), RH: num(d.mx_RH, D.RH), h0: num(d.mx_h0, D.h0), ciment: d.mx_cim || D.ciment,
    gSup: num(d.mx_gsup, D.gSup), gBeton: D.gBeton, gAcier: D.gAcier, zone: D.zone, fissuration: d.mx_fiss !== 'non',
    dates: { charpente: 0, debut: num(d.mx_t1, D.dates.debut), cadence: num(d.mx_cad, D.dates.cadence), superstructures: num(d.mx_t4, D.dates.superstructures), fin: num(d.mx_t5, D.dates.fin) },
    parDecade: D.parDecade,
  };
}

/** Géométrie transversale d'une poutre : largeur de dalle reprise (poids) et largeurs b0, b1, b2 (largeur efficace). */
export function transversal(p) {
  const n = p.nPoutres, e = p.entraxe, debord = (p.largeur - (n - 1) * e) / 2;
  if (!(debord > 0)) throw new Error('entraxe trop grand pour la largeur du tablier');
  // poutre de rive (la plus sollicitée par les superstructures de bord) : de son débord jusqu'à mi-entraxe
  return { part: debord + e / 2, b0: 0, b1: debord, b2: e / 2, debord };
}

export function bipoutre(p = DEFAUTS_BIPOUTRE) {
  const { L, nb } = p, nT = L.length, TR = transversal(p), Le = longueursEquivalentes(L);
  const gT = { ...p.travee, hg: p.hg, hc: p.hc, nuance: p.nuance }, gA = { ...p.appui, hg: p.hg, hc: p.hc, nuance: p.nuance };
  const aT = proprietes(gT, 'acier'), aA = proprietes(gA, 'acier'), cT = couches(gT), cA = couches(gA);
  const yRef = aT.yG;   // ligne des nœuds : c.d.g. de l'acier de travée
  // largeur efficace par zone : travée (L_e de la travée) ou appui (L_e de l'appui)
  const beffTravee = Le.travees.map(le => largeurEfficace({ b0: TR.b0, b1: TR.b1, b2: TR.b2, Le: le }).beff);
  const beffAppui = Le.appuis.map(le => largeurEfficace({ b0: TR.b0, b1: TR.b1, b2: TR.b2, Le: le }).beff);
  const noeuds = [], barres = [], fibres = [], info = [];
  const x0 = [0]; L.forEach((l, i) => x0.push(x0[i] + l));
  for (let s = 0; s < nT; s++) for (let k = 0; k < nb; k++) { if (s === 0 && k === 0) noeuds.push([0, 0]); noeuds.push([x0[s] + (k + 1) * L[s] / nb, 0]); }
  const nn = s => s * nb;   // nœud de début de la travée s
  const betons = { ACIER: { loi: 'elastique', E: 210000 }, ARM: { loi: 'elastique', E: 210000 } };
  // plots : une zone de travée par travée, une zone d'appui par appui intermédiaire
  const plots = [];
  for (let s = 0; s < nT; s++) plots.push({ nom: `plot de travée ${s + 1}`, type: 'travee', s, barres: [] });
  for (let j = 1; j < nT; j++) plots.push({ nom: `plot sur appui P${j}`, type: 'appui', j, barres: [] });
  const iAcier = [], iDalle = [];
  for (let s = 0; s < nT; s++) for (let k = 0; k < nb; k++) {
    const xm = (k + 0.5) / nb, dG = xm * L[s], dD = (1 - xm) * L[s];
    const surAppuiG = s > 0 && dG <= p.zone * L[s] + 1e-9, surAppuiD = s < nT - 1 && dD <= p.zone * L[s] + 1e-9;
    const zoneAppui = surAppuiG || surAppuiD, jApp = surAppuiG ? s : surAppuiD ? s + 1 : null;
    const g = zoneAppui ? gA : gT, A = zoneAppui ? aA : aT, C = zoneAppui ? cA : cT;
    // acier
    iAcier.push(barres.length);
    barres.push({ i: nn(s) + k, j: nn(s) + k + 1, A: A.A, I: A.I, e: A.yG - yRef, beton: 'ACIER', nom: `acier T${s + 1}` });
    fibres.push({ vs: C.ha - A.yG, vi: A.yG, partie: 'acier', acier: true, fy: Math.min(...C.acier.filter((_, q) => q !== 1).map(c => c.fy)) });
    // dalle (ou armatures seules en zone fissurée)
    const beff = zoneAppui ? beffAppui[jApp - 1] : beffTravee[s], rho = zoneAppui ? p.rhoAppui : p.rhoTravee, As = rho * beff * p.hc;
    const yd = C.dalle.y0 + p.hc / 2, fiss = p.fissuration && zoneAppui;
    iDalle.push(barres.length);
    const plot = zoneAppui ? plots[nT - 1 + jApp] : plots[s];
    plot.barres.push({ acier: barres.length - 1, dalle: barres.length });
    if (fiss) {
      barres.push({ i: nn(s) + k, j: nn(s) + k + 1, A: As, I: As * (p.hc / 2 - 0.06) ** 2, e: yd - yRef, beton: 'ARM', nom: `armatures T${s + 1}` });
      fibres.push(null);
    } else {
      barres.push({ i: nn(s) + k, j: nn(s) + k + 1, A: beff * p.hc, I: beff * p.hc ** 3 / 12, e: yd - yRef, beton: 'TBD', nom: `dalle T${s + 1}` });
      fibres.push({ vs: p.hc / 2, vi: p.hc / 2, partie: 'dalle', precontraint: false });
    }
    info.push({ s, k, zoneAppui, fiss, beff, As, x: x0[s] + xm * L[s] });
    info.push(info[info.length - 1]);
  }
  // dates des plots : travées dans l'ordre, puis appuis
  const T = p.dates, phases = [];
  phases.push({ t: T.charpente, nom: 'Charpente posée, poids propre de l’acier', activer: iAcier,
    appuis: x0.map((_, j) => ({ n: j * nb, ddl: j === 0 ? ['ux', 'uy'] : ['uy'] })),
    charges: iAcier.map(b => ({ barre: b, w: barres[b].A * p.gAcier * p.majAcier })) });
  plots.forEach((pl, q) => {
    const t = T.debut + q * T.cadence, cle = `D${q}`;
    betons[cle] = { fck: p.fck, RH: p.RH, h0: p.h0, ciment: p.ciment, tCoulage: t };
    for (const pb of pl.barres) if (barres[pb.dalle].beton === 'TBD') barres[pb.dalle].beton = cle;
    pl.t = t;
    // béton frais sur la structure existante (largeur de dalle reprise par la poutre, gousset compris)
    phases.push({ t, nom: `Bétonnage du ${pl.nom}`, charges: pl.barres.map(pb => ({ barre: pb.acier, w: p.gBeton * (TR.part * p.hc + 0.6 * p.hg) })) });
    phases.push({ t: t + 1, nom: `${pl.nom[0].toUpperCase()}${pl.nom.slice(1)} durci, collaborant`, activer: pl.barres.map(pb => pb.dalle) });
  });
  phases.push({ t: T.superstructures, nom: 'Superstructures', charges: iAcier.map(b => ({ barre: b, w: p.gSup })) });
  const tFinBet = T.debut + (plots.length - 1) * T.cadence + 1;
  if (!(T.superstructures >= tFinBet && T.fin >= T.superstructures)) throw new Error(`dates : le dernier plot durcit à ${tFinBet} j ; superstructures et fin doivent suivre`);
  return {
    modele: { noeuds, barres, betons, phases, tFin: T.fin, parDecade: p.parDecade || 6 },
    reperes: { L, nb, x0, iAcier, iDalle, info, fibres, yRef, plots, TR, beffTravee, beffAppui, gT, gA, aT, aA, cT, cA },
  };
}

/** Points remarquables : mi-travées et appuis intermédiaires (indices de barres). */
export function sectionsRemarquables(R) {
  const out = [], nT = R.L.length;
  for (let s = 0; s < nT; s++) {
    const k = s * R.nb + R.nb / 2 - 1;
    out.push({ nom: `mi-travée ${s + 1}`, ia: R.iAcier[k], id: R.iDalle[k], xi: 1 });
    if (s < nT - 1) { const ke = s * R.nb + R.nb - 1; out.push({ nom: `appui P${s + 1}`, ia: R.iAcier[ke], id: R.iDalle[ke], xi: 1 }); }
  }
  return out;
}

/** Contraintes de l'acier (fibres extrêmes) et de la dalle à une section, au pas p : MPa, traction positive. */
export function contraintesMixtes(p, modele, R, sec) {
  const s = (k, xi) => {
    const r = p.barres[k], f = R.fibres[k], bb = modele.barres[k]; if (!r) return null;
    const Lb = modele.noeuds[bb.j][0] - modele.noeuds[bb.i][0], M = r.M(xi * Lb);
    if (!f) return { armatures: r.N / bb.A / 1000 };   // armatures seules (zone fissurée)
    return { sup: (r.N / bb.A - M * f.vs / bb.I) / 1000, inf: (r.N / bb.A + M * f.vi / bb.I) / 1000 };
  };
  return { acier: s(sec.ia, sec.xi), dalle: s(sec.id, sec.xi) };
}

/** Flèches à mi-travée (vers le bas positives). */
export function flechesBipoutre(p, R) { return R.L.map((_, s) => -p.u[3 * (s * R.nb + R.nb / 2) + 1]); }
