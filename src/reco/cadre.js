/**
 * Règles de recommandation des cadres fermés (PICF) et portiques ouverts (PIPO) — onglet « Cadres et portiques ».
 *
 * Pour chaque vérification du calcul qui sort « NON » (sections, gabarit, choc, portance) ou qui laisse une réserve
 * bloquante (biais, flottaison, situations hydrauliques, sol, données manquantes) : le constat, la règle, et les données
 * du formulaire (champs cf_*) à modifier. Le calcul d'un cadre ne prend que quelques centièmes de seconde : les valeurs
 * qui suffisent sont donc CHERCHÉES par recalcul complet (dichotomie sur une grille, les autres données restant
 * inchangées), et non estimées par une formule.
 *
 * Épaisseurs : traverse, radier, piédroits et voiles interagissent (épaissir les piédroits encastre davantage la
 * traverse). Elles sont cherchées ENSEMBLE, par point fixe : chaque famille en échec est épaissie au minimum qui la fait
 * passer, les autres gardant leur dernière valeur, jusqu'à ce que toutes passent. Les recherches suivantes (choc,
 * portance, flottaison, béton) partent de ces épaisseurs, pour que l'ensemble des valeurs proposées soit cohérent.
 *
 * Format (celui de src/recommandations.js) : { domaine, lieu, verification, constat, regle, actions, cibles } ;
 * `cibles` situe les lignes « NON » des tableaux de résultats (web/cadre_view.js) qui reçoivent l'indication
 * « → à modifier ». Une action peut porter `champs` ({ cf_x: valeur }) quand plusieurs données vont ensemble.
 */
import { parseCadre, computeCadre } from '../cadre/run.js';
import { esolIndicatif } from '../cadre/sol.js';
import { CATALOGUE } from '../cadre/sections.js';
import { epaisseurPicf } from '../cadre/details.js';

const fx = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : v === Infinity ? '∞' : '–');
const str = v => String(+(+v).toFixed(3));
const plafond = (v, pas) => Math.ceil(v / pas - 1e-9) * pas;

/** Libellés courts des champs (indications sous les « NON » ; le panneau lit les libellés complets du formulaire). */
export const LIB_CADRE = {
  cf_et: 'Épaisseur de la traverse', cf_er: 'Épaisseur du radier', cf_ep: 'Épaisseur des piédroits', cf_ei: 'Épaisseur des voiles intermédiaires',
  cf_fc28: 'f_c28 (f_ck)', cf_fe: 'f_e (f_yk)', cf_H: 'Hauteur intérieure H', cf_B: 'Ouverture d\'une cellule B', cf_n: 'Nombre de cellules',
  cf_Bsem: 'Largeur des semelles', cf_hsem: 'Épaisseur des semelles', cf_Dfond: 'Profondeur de l\'assise D', cf_Hr: 'Hauteur de remblai sur la traverse',
  cf_biais: 'Biais', cf_hEau: 'Hauteur d\'eau intérieure', cf_hNappe: 'Nappe au-dessus du radier', cf_sol: 'Modèle de sol sous radier',
  cf_solSrc: 'Données du sol de fondation', cf_esol: 'ESOL', cf_gabH: 'Hauteur libre requise', cf_chocF: 'Force de choc', cf_chocBeff: 'Largeur de diffusion du choc',
  cf_enrob: 'Enrobage',
};

const FAMILLES = [
  { cle: 'Traverse', lieu: 'Traverse', champ: 'cf_et', geo: 'et', test: b => b.startsWith('Traverse') },
  { cle: 'Radier', lieu: 'Radier', champ: 'cf_er', geo: 'er', test: b => b.startsWith('Radier') },
  { cle: 'Piédroits', lieu: 'Piédroits', champ: 'cf_ep', geo: 'ep', test: b => b.startsWith('Piédroit') },
  { cle: 'Voiles', lieu: 'Voiles intermédiaires', champ: 'cf_ei', geo: 'ei', test: b => b.startsWith('Voile') },
];
const famOk = (out, f) => out.blocs.every(r => r.sections.every(s => !f.test(s.barre) || !s.echec));
const toutesOk = out => out.blocs.every(r => r.sections.every(s => !s.echec));
const chocOk = (out, barre) => out.blocs.every(r => !r.choc || r.choc.verifs.every(v => (barre && v.barre !== barre) || (v.okFlexion && v.okTranchant)));
const portanceOk = out => out.blocs.every(r => !r.portance || r.portance.erreur || r.portance.ok);
const gabaritOk = out => out.blocs.every(r => !r.gabarit || r.gabarit.ok);
const flottaisonOk = out => out.blocs.every(r => !r.flottaison || r.flottaison.ok);
const sansReserve = re => out => out.blocs.every(r => !r.reserves.some(x => re.test(x)));

/** Dichotomie synchrone sur une grille croissante (vérification supposée fausse puis vraie). */
function dichotomie(vals, ok) {
  if (!vals.length || !ok(vals[vals.length - 1])) return null;
  let lo = -1, hi = vals.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ok(vals[m])) hi = m; else lo = m; }
  return vals[hi];
}
const grille = (min, max, pas) => { const o = []; for (let v = min; v <= max + 1e-9; v += pas) o.push(+v.toFixed(3)); return o; };

/**
 * Recommandations d'un calcul de cadre. out : résultat de computeCadre ; data : données du formulaire (champs cf_*) qui
 * l'ont produit ; opts.budget : temps de calcul accordé aux recherches [ms] (au-delà, la recherche est laissée au bouton
 * « Calculer » du panneau).
 */
export function recommandationsCadre(out, data, { budget = 4000 } = {}) {
  const t0 = Date.now(), items = [], d = { ...data };
  const pipo = out.inp.type === 'pipo', g0 = out.inp.geom, h0 = out.inp.hyp, ec2 = h0.code === 'EC2';
  let nCalc = 0;
  const essai = modifs => { nCalc++; try { return computeCadre(parseCadre({ ...d, ...modifs })); } catch { return null; } };
  const dansBudget = () => Date.now() - t0 < budget;
  /** Recherche : valeur minimale d'un champ (grille) telle que verifie(out) — ou objet `chercher` si le budget est épuisé. */
  const chercher = (champ, vals, verifie, base = {}) => {
    if (!vals.length) return { valeur: null };
    if (!dansBudget()) return { chercher: { champ, min: vals[0], max: vals[vals.length - 1], pas: vals.length > 1 ? +(vals[1] - vals[0]).toFixed(3) : 1, vers: 'haut', depart: vals[0], calcul: 'cadre', base, verifie } };
    return { valeur: dichotomie(vals, v => { const o = essai({ ...base, [champ]: str(v) }); return !!o && verifie(o); }) };
  };

  // ------------------------------------------------------------------ durabilité (classe de béton, enrobage nominal)
  const Dd = out.durab;
  if (Dd && !Dd.okBeton) items.push({ domaine: 'Durabilité', lieu: 'Cadre', verification: 'Classe de béton minimale', constat: `C${Dd.fck} < ${Dd.classeMin} (${Dd.critique})`, regle: 'EN 1992-1-1 tableau E.1N, NF EN 206/CN',
    actions: [{ texte: `Béton ${Dd.classeMin} au moins`, champ: 'cf_fc28', unite: 'MPa', valeur: String(Dd.fckMin), valeurChamp: String(Dd.fckMin) }], cibles: [{ type: 'durab', k: 'beton' }] });
  if (Dd && !Dd.okEnrobage) items.push({ domaine: 'Durabilité', lieu: 'Cadre', verification: 'Enrobage nominal', constat: `${Math.round(Dd.enrobage)} mm < c_nom = ${Dd.cnom} mm (S${Dd.S}, ${Dd.expos.join(', ')})`, regle: 'EN 1992-1-1 § 4.4.1, tableaux 4.3N et 4.4N',
    actions: [{ texte: `Enrobage au nu ${(Dd.cnom / 1000).toFixed(3).replace('.', ',')} m`, champ: 'cf_enrob', unite: 'm', valeur: (Dd.cnom / 1000).toFixed(3).replace('.', ','), valeurChamp: (Dd.cnom / 1000).toFixed(3) }], cibles: [{ type: 'durab', k: 'enrobage' }] });

  // ------------------------------------------------------------------ sections (flexion, effort tranchant, fissuration, barres)
  const fams = FAMILLES.filter(f => out.blocs.some(r => r.sections.some(s => f.test(s.barre) && s.echec)));
  const presentes = FAMILLES.filter(f => out.blocs.some(r => r.sections.some(s => f.test(s.barre))));
  const epaisseurs = {}; for (const f of presentes) epaisseurs[f.champ] = g0[f.geo];
  let joint = { ok: !fams.length, val: { ...epaisseurs }, bloque: null, budget: false };
  if (fams.length) {
    let cur = out;
    for (let tour = 0; tour < 5 && !joint.ok && !joint.bloque && !joint.budget; tour++) {
      const ko = presentes.filter(f => !famOk(cur, f));
      if (!ko.length) { joint.ok = true; break; }
      for (const f of ko) {
        if (!famOk(cur, f)) {
          if (!dansBudget()) { joint.budget = true; break; }
          const e = joint.val[f.champ], base = Object.fromEntries(Object.entries(joint.val).filter(([k, v]) => v !== epaisseurs[k]).map(([k, v]) => [k, str(v)]));
          const vals = grille(plafond(e + 0.001, 0.05), Math.min(e + 1.5, 2.5), 0.05);
          const v = dichotomie(vals, x => { const o = essai({ ...base, [f.champ]: str(x) }); return !!o && famOk(o, f); });
          if (v == null) { joint.bloque = f; break; }
          joint.val[f.champ] = v;
          cur = essai(Object.fromEntries(Object.entries(joint.val).filter(([k, x]) => x !== epaisseurs[k]).map(([k, x]) => [k, str(x)])));
          if (!cur) { joint.bloque = f; break; }
        }
      }
      if (cur && toutesOk(cur)) joint.ok = true;
    }
    // descente : la montée dépend de l'ordre (une traverse épaissie avant les piédroits travaille presque sur appuis
    // simples et sort trop épaisse) ; chaque épaisseur est ensuite ramenée au minimum qui garde TOUTES les sections OK
    for (let passe = 0; passe < 3 && joint.ok && dansBudget(); passe++) {
      let change = false;
      for (const f of presentes) {
        const v0 = joint.val[f.champ], e = epaisseurs[f.champ];
        if (!(v0 > e + 1e-9) || !dansBudget()) continue;
        const autres = Object.fromEntries(Object.entries(joint.val).filter(([k, x]) => k !== f.champ && x !== epaisseurs[k]).map(([k, x]) => [k, str(x)]));
        const vals = [e, ...grille(plafond(e + 0.001, 0.05), v0, 0.05).filter(x => x > e + 1e-9 && x <= v0 + 1e-9)];
        const v = dichotomie(vals, x => { const o = essai({ ...autres, [f.champ]: str(x) }); return !!o && toutesOk(o); });
        if (v != null && v < v0 - 1e-9) { joint.val[f.champ] = v; change = true; }
      }
      if (!change) break;
    }
  }
  // épaisseurs retenues (modifiées seulement) : base des recherches suivantes
  const modifsEp = joint.ok ? Object.fromEntries(Object.entries(joint.val).filter(([k, v]) => v !== epaisseurs[k]).map(([k, v]) => [k, str(v)])) : {};
  const avecEp = Object.keys(modifsEp).length ? ' (avec les épaisseurs recommandées pour les sections)' : '';
  const champsEp = { ...modifsEp };

  for (const f of fams) {
    const ko = [];
    out.blocs.forEach((r, ib) => r.sections.forEach(s => { if (f.test(s.barre) && s.echec) ko.push({ s, r, ib }); }));
    const pref = ({ r, ib }) => (out.blocs.length > 1 ? `bloc ${ib + 1}, ` : '');
    const motifs = [], regles = new Set();
    // effort tranchant
    const tr = ko.filter(k => !k.s.tranchantOk).map(k => {
      const v = k.r.sisme?.verifs?.find(x => x.barre === k.s.barre && x.ou === k.s.ou && !x.okT);
      if (v && /^séisme/.test(k.s.tranchantMsg)) return { k, ratio: v.tau / v.lim, txt: `τ = ${fx(v.tau, 3)} > ${fx(v.lim, 3)} MPa sous séisme`, regle: 'EN 1998-2, BAEL A.5.2,2 (γ_b = 1,15)' };
      if (k.s.tranchantEc2) return { k, ratio: k.s.tranchantEc2.ved / k.s.tranchantEc2.vRd, txt: `V_Ed = ${fx(k.s.tranchantEc2.ved)} > V_Rd,c = ${fx(k.s.tranchantEc2.vRd)} t/ml`, regle: 'EN 1992-1-1 § 6.2.2' };
      return { k, ratio: k.s.tranchant.tau / k.s.tranchant.lim, txt: `τ_u = ${fx(k.s.tranchant.tau, 3)} > τ_lim = 0,07 f_c28/γ_b = ${fx(k.s.tranchant.lim, 3)} MPa`, regle: 'BAEL 91 A.5.2,2' };
    }).sort((a, b) => b.ratio - a.ratio);
    if (tr.length) { motifs.push(`effort tranchant sans armatures (${tr.length} section(s), au plus ${pref(tr[0].k)}${tr[0].k.s.barre} — ${tr[0].k.s.ou} : ${tr[0].txt})`); regles.add(tr[0].regle); }
    // section surarmée (aciers comprimés)
    const sa = ko.filter(k => k.s.surarme).map(k => ({ k, mu: Math.max(k.s.eluMax?.surarme ? k.s.eluMax.mu : 0, k.s.eluMin?.surarme ? k.s.eluMin.mu : 0) })).sort((a, b) => b.mu - a.mu);
    if (sa.length) { motifs.push(`section surarmée à l'ELU (${sa.length} section(s)${sa[0].mu > 0 ? `, μ = ${fx(sa[0].mu, 3)} > 0,372 en ${pref(sa[0].k)}${sa[0].k.s.barre} — ${sa[0].k.s.ou}` : ', sous séisme'}) : il faudrait des aciers comprimés`); regles.add(ec2 ? 'EN 1992-1-1 § 6.1 (ξ_lim)' : 'BAEL 91 A.4.3 (μ_bu ≤ 0,372)'); }
    // fissuration EC2
    const fi = ko.filter(k => k.s.fissureTrop).map(k => { const w = [k.s.fissMax, k.s.fissMin].filter(x => x && !x.ok).sort((a, b) => b.wk - a.wk)[0]; return { k, w }; }).sort((a, b) => b.w.wk - a.w.wk);
    if (fi.length) { motifs.push(`ouverture des fissures (${fi.length} section(s), w_k = ${fx(fi[0].w.wk, 3)} > w_max = ${fx(fi[0].w.wmax)} mm en ${pref(fi[0].k)}${fi[0].k.s.barre} — ${fi[0].k.s.ou})`); regles.add('EN 1992-1-1 § 7.3.4, tableau 7.1N'); }
    // catalogue de barres insuffisant
    const maxCat = CATALOGUE[CATALOGUE.length - 1];
    const ba = ko.filter(k => !k.s.surarme && (!k.s.barresMax.ok || !k.s.barresMin.ok)).map(k => ({ k, req: Math.max(k.s.barresMax.ok ? 0 : k.s.barresMax.req, k.s.barresMin.ok ? 0 : k.s.barresMin.req) })).filter(x => Number.isFinite(x.req)).sort((a, b) => b.req - a.req);
    if (ba.length) { motifs.push(`aciers impossibles à loger (${ba.length} section(s), A_s requis ${fx(ba[0].req)} cm²/ml en ${pref(ba[0].k)}${ba[0].k.s.barre} — ${ba[0].k.s.ou}, pour ${fx(maxCat.aire)} cm²/ml au plus avec ${maxCat.label})`); regles.add('catalogue PSIDA des dispositions (guide PICF-EL)'); }

    const actions = [], e = epaisseurs[f.champ];
    const vide = String(d[f.champ] ?? '').trim() === '';
    const ensemble = Object.entries(modifsEp).map(([k, x]) => `${LIB_CADRE[k].toLowerCase()} ${fx(+x)} m`).join(' ; ');
    if (joint.ok && !(joint.val[f.champ] > e + 1e-9)) {
      actions.push({ texte: `Inutile d'épaissir ${f.lieu === 'Piédroits' ? 'les piédroits' : f.lieu === 'Radier' ? 'le radier' : f.lieu === 'Traverse' ? 'la traverse' : 'les voiles'} : ${f.lieu === 'Radier' || f.lieu === 'Traverse' ? 'il' : 'ils'} passe${f.lieu === 'Radier' || f.lieu === 'Traverse' ? '' : 'nt'} une fois appliqués ${ensemble} (moments redistribués dans le cadre ; valeurs cherchées par recalcul complet)`,
        champs: { ...modifsEp }, valeur: 'ensemble', court: `${ensemble}` });
    } else if (joint.ok) {
      const v = joint.val[f.champ];
      const autres = Object.entries(modifsEp).filter(([k]) => k !== f.champ);
      actions.push({ texte: `Épaissir : ${LIB_CADRE[f.champ].toLowerCase()} de ${fx(e)} m${vide ? ' (table SETRA)' : ''} à ${fx(v)} m${autres.length ? ` — valeur cherchée par recalcul complet AVEC ${autres.map(([k, x]) => `${LIB_CADRE[k].toLowerCase()} ${fx(+x)} m`).join(', ')} : appliquer l'ensemble (action suivante)` : ' — valeur cherchée par recalcul complet, les autres données restant inchangées'}`,
        champ: f.champ, unite: 'm', valeur: fx(v), valeurChamp: str(v), court: LIB_CADRE[f.champ], actuel: fx(e) });
      if (autres.length) actions.push({ texte: `Appliquer l'ensemble des épaisseurs cherchées ensemble (${ensemble}) : toutes les sections passent`, champs: { ...modifsEp }, valeur: 'ensemble' });
    } else if (joint.budget || !dansBudget()) {
      actions.push({ texte: `Épaissir : ${LIB_CADRE[f.champ].toLowerCase()} (${fx(e)} m)`, champ: f.champ, unite: 'm', court: LIB_CADRE[f.champ], actuel: fx(e),
        chercher: { champ: f.champ, min: plafond(e + 0.001, 0.05), max: Math.min(e + 1.5, 2.5), pas: 0.05, vers: 'haut', depart: plafond(e + 0.001, 0.05), calcul: 'cadre', base: {}, verifie: o => famOk(o, f) } });
    } else {
      const bl = joint.bloque || f;
      actions.push({ texte: `Aucune épaisseur jusqu'à ${fx(Math.min(epaisseurs[bl.champ] + 1.5, 2.5))} m ne fait passer ${bl.lieu === 'Piédroits' ? 'les piédroits' : bl.lieu === 'Radier' ? 'le radier' : bl.lieu === 'Traverse' ? 'la traverse' : 'les voiles'} (le poids propre et la raideur croissent avec l'épaisseur) : changer de conception (ouverture plus petite, plus de cellules, remblai moins haut)${tr.length ? ' ou armer l\'effort tranchant' : ''}`, champ: f.champ, unite: 'm', court: LIB_CADRE[f.champ], actuel: fx(e) });
      actions.push({ texte: 'Partager l\'ouverture en plusieurs cellules (portées plus courtes)', champ: 'cf_n', court: LIB_CADRE.cf_n });
    }
    // béton plus résistant (cherché seul, épaisseurs actuelles)
    if (tr.length || sa.length || fi.length || ba.length) {
      const fmax = ec2 ? 50 : 40, fc = h0.fc28;
      if (fc + 5 <= fmax) {
        const r = chercher('cf_fc28', grille(plafond(fc + 0.001, 5), fmax, 5), o => famOk(o, f));
        if (r.valeur != null) actions.push({ texte: `Ou, sans changer les épaisseurs : béton plus résistant, f_c28 = ${fx(r.valeur, 0)} MPa (${tr.length ? `τ_lim ∝ f_c28${ec2 ? '^1/3' : ''}` : 'μ et fissuration réduits'})`, champ: 'cf_fc28', unite: 'MPa', valeur: fx(r.valeur, 0), valeurChamp: str(r.valeur), court: LIB_CADRE.cf_fc28, actuel: fx(fc, 0) });
        else if (r.chercher) actions.push({ texte: 'Ou béton plus résistant (épaisseurs actuelles)', champ: 'cf_fc28', unite: 'MPa', chercher: r.chercher });
        else actions.push({ texte: `Un béton plus résistant ne suffit pas seul (essayé jusqu'à ${fmax} MPa)`, champ: 'cf_fc28', unite: 'MPa' });
      }
    }
    if ((ba.length || sa.length) && h0.fe < 500 && dansBudget()) {
      const o = essai({ cf_fe: '500' });
      if (o && famOk(o, f)) actions.push({ texte: 'Ou aciers de nuance f_e = 500 MPa (ELU gouvernant)', champ: 'cf_fe', unite: 'MPa', valeur: '500', valeurChamp: '500', court: LIB_CADRE.cf_fe, actuel: fx(h0.fe, 0) });
    }
    if (joint.ok && (f.cle === 'Traverse' || f.cle === 'Radier') && joint.val[f.champ] > 2 * epaisseurPicf(g0.B) && g0.B > 2)
      actions.push({ texte: `Ou, l'épaisseur trouvée étant plus du double de celle de la table SETRA (${fx(epaisseurPicf(g0.B))} m) : partager l'ouverture en ${g0.n + 1} cellules, puis recalculer`, champ: 'cf_n', court: LIB_CADRE.cf_n, actuel: String(g0.n) });
    if (tr.length) actions.push({ texte: `Ou prévoir des armatures d'effort tranchant (étriers ou épingles, ${ec2 ? 'EN 1992-1-1 § 6.2.3 et 9.3.2' : 'BAEL 91 A.5.1,2 et A.5.1,23'}) : non dimensionnées par PSIDA, la dalle sans armatures transversales étant la disposition du guide PICF-EL` });
    if (fi.length) actions.push({ texte: 'Ne pas réduire l\'enrobage pour gagner sur w_k : il est fixé par la classe d\'exposition (EN 1992-1-1 § 4.4.1)' });
    items.push({ domaine: `Cadre — sections (${ec2 ? 'EN 1992-1-1' : 'BAEL 91'})`, lieu: f.lieu, verification: `${ko.length} section(s) « NON »`, constat: motifs.join(' ; '), regle: [...regles].join(' ; '),
      actions, cibles: ko.map(({ s, ib }) => ({ bloc: ib, type: 'section', barre: s.barre, ou: s.ou })) });
  }

  // ------------------------------------------------------------------ hauteur utile nulle (section non calculée)
  for (const f of FAMILLES) {
    const al = out.blocs.flatMap(r => r.alertes.filter(a => a.startsWith(f.cle === 'Piédroits' ? 'Piédroit' : f.cle === 'Voiles' ? 'Voile' : f.cle) && /hauteur utile nulle/.test(a)));
    if (!al.length) continue;
    const e = g0[f.geo], c = h0.enrobage, v = plafond(c + 0.10, 0.05);
    items.push({ domaine: 'Cadre — sections', lieu: f.lieu, verification: 'Hauteur utile d > 0', constat: al[0], regle: 'd = e − enrobage − φ/2',
      actions: [{ texte: `Épaisseur d'au moins ${fx(v)} m (enrobage ${fx(c)} m + aciers + béton comprimé)`, champ: f.champ, unite: 'm', valeur: fx(Math.max(v, e)), valeurChamp: str(Math.max(v, e)), court: LIB_CADRE[f.champ], actuel: fx(e) },
        { texte: 'Vérifier l\'enrobage saisi (en mètres : 0,05 pour 5 cm)', champ: 'cf_enrob', unite: 'm', court: LIB_CADRE.cf_enrob, actuel: fx(c) }], cibles: [] });
  }

  // ------------------------------------------------------------------ gabarit de la voie franchie
  out.blocs.slice(0, 1).forEach(r => {
    const G = r.gabarit; if (!G || G.ok) return;
    const acts = [], modifs = { ...champsEp };
    if (G.hauteurRequise > 0 && G.hauteurLibre < G.hauteurRequise - 1e-9) {
      const ech = g0.H - G.hauteurLibre, H = plafond(G.hauteurRequise + ech, 0.05);
      acts.push({ texte: `Hauteur intérieure : ${fx(G.hauteurRequise)} m de gabarit + ${fx(ech)} m de chaussée ou plateforme, soit H = ${fx(H)} m (à reprendre ensuite : les piédroits plus hauts reçoivent plus de poussée)`, champ: 'cf_H', unite: 'm', valeur: fx(H), valeurChamp: str(H), court: LIB_CADRE.cf_H, actuel: fx(g0.H) });
      modifs.cf_H = str(H);
    }
    if (G.largeurRequise > 0 && G.largeurLibre < G.largeurRequise - 1e-9) {
      const B = plafond(G.largeurRequise, 0.05);
      acts.push({ texte: `Ouverture B = ${fx(B)} m (largeur libre requise)`, champ: 'cf_B', unite: 'm', valeur: fx(B), valeurChamp: str(B), court: LIB_CADRE.cf_B, actuel: fx(g0.B) });
      modifs.cf_B = str(B);
    }
    acts.push({ texte: 'Ou vérifier le gabarit exigé et l\'épaisseur de chaussée saisie', champ: 'cf_gabH', court: LIB_CADRE.cf_gabH });
    items.push({ domaine: 'Cadre — voie franchie', lieu: 'Gabarit', verification: 'Gabarit libre', constat: `hauteur libre ${fx(G.hauteurLibre)} m pour ${fx(G.hauteurRequise)} m requis${G.largeurRequise > 0 ? `, ouverture ${fx(G.largeurLibre)} m pour ${fx(G.largeurRequise)} m` : ''}`, regle: 'gabarit du gestionnaire de la voie franchie',
      actions: acts, cibles: out.blocs.map((b, ib) => (b.gabarit && !b.gabarit.ok ? { bloc: ib, type: 'gabarit' } : null)).filter(Boolean) });
  });

  // ------------------------------------------------------------------ choc sur les piédroits (situation accidentelle)
  for (const [barre, champ] of [['Piédroit gauche', 'cf_ep'], ['Voile 1', 'cf_ei']]) {
    const ko = []; out.blocs.forEach((r, ib) => (r.choc?.verifs || []).forEach(v => { if (v.barre === barre && !(v.okFlexion && v.okTranchant)) ko.push({ v, ib }); }));
    if (!ko.length) continue;
    const w = ko.slice().sort((a, b) => (b.v.asReq - b.v.asFournie) - (a.v.asReq - a.v.asFournie))[0].v;
    const base = { ...champsEp }, e = +(base[champ] ?? g0[champ === 'cf_ep' ? 'ep' : 'ei']);
    const r = chercher(champ, grille(plafond(e + 0.001, 0.05), Math.min(e + 1.2, 2), 0.05), o => chocOk(o, barre), base);
    const acts = [];
    if (r.valeur != null) acts.push({ texte: `Épaissir le ${barre === 'Voile 1' ? 'voile' : 'piédroit'} à ${fx(r.valeur)} m${avecEp}`, champ, unite: 'm', valeur: fx(r.valeur), valeurChamp: str(r.valeur), court: LIB_CADRE[champ], actuel: fx(g0[champ === 'cf_ep' ? 'ep' : 'ei']) });
    else if (r.chercher) acts.push({ texte: `Épaissir le ${barre === 'Voile 1' ? 'voile' : 'piédroit'}`, champ, unite: 'm', chercher: r.chercher });
    else acts.push({ texte: `Aucune épaisseur jusqu'à ${fx(e + 1.2)} m ne suffit : protéger le piédroit par un dispositif de retenue ou l'éloigner de la voie`, champ, unite: 'm' });
    acts.push({ texte: 'Protéger le piédroit par un dispositif de retenue, ou l\'éloigner de la voie (force de choc réduite, à justifier)', champ: 'cf_chocF', court: LIB_CADRE.cf_chocF });
    acts.push({ texte: 'Une analyse en plaque peut justifier une largeur de diffusion b_eff supérieure', champ: 'cf_chocBeff', unite: 'm', court: LIB_CADRE.cf_chocBeff });
    items.push({ domaine: 'Cadre — voie franchie', lieu: barre, verification: 'Choc de véhicule ou de déraillement', constat: `${ko.length} point(s) NON, au plus ${w.ou} : M = ${fx(w.M)} t·m/ml, ${w.surarme ? 'section surarmée' : `A_s requis ${fx(w.asReq)} pour ${fx(w.asFournie)} cm²/ml fournis`}${w.okTranchant ? '' : `, τ = ${fx(w.tau, 3)} > ${fx(w.tauLim, 3)} MPa`}`, regle: 'EN 1991-1-7 § 4.3 / 4.5, situation accidentelle',
      actions: acts, cibles: ko.map(({ v, ib }) => ({ bloc: ib, type: 'choc', barre: v.barre, ou: v.ou, z: v.z })) });
  }

  // ------------------------------------------------------------------ portance du sol (radier ou semelles)
  {
    const ko = []; out.blocs.forEach((r, ib) => { if (r.portance && !r.portance.erreur) r.portance.synthese.forEach(v => { if (!v.ok) ko.push({ v, ib }); }); });
    if (ko.length) {
      const w = ko.slice().sort((a, b) => b.v.taux - a.v.taux)[0].v, P = out.inp.opts.portance, acts = [], base = { ...champsEp };
      if (pipo) {
        const ep = +(base.cf_ep ?? g0.ep), Bs = P.Bs > 0 ? P.Bs : Math.max(1.0, 3 * ep);
        const r = chercher('cf_Bsem', grille(plafond(Bs + 0.001, 0.05), Math.max(3 * Bs, 6), 0.05), portanceOk, base);
        if (r.valeur != null) acts.push({ texte: `Élargir les semelles à B = ${fx(r.valeur)} m${avecEp}`, champ: 'cf_Bsem', unite: 'm', valeur: fx(r.valeur), valeurChamp: str(r.valeur), court: LIB_CADRE.cf_Bsem, actuel: `${fx(Bs)}${P.Bs > 0 ? '' : ' (3 × piédroit)'}` });
        else if (r.chercher) acts.push({ texte: 'Élargir les semelles', champ: 'cf_Bsem', unite: 'm', chercher: r.chercher });
        else acts.push({ texte: `Élargir les semelles ne suffit pas (essayé jusqu'à ${fx(Math.max(3 * Bs, 6))} m)`, champ: 'cf_Bsem', unite: 'm' });
      } else acts.push({ texte: 'La largeur du radier est fixée par la géométrie : élargir l\'assise (débords de radier, hors modèle) ou alléger l\'ouvrage' });
      const D = P.D || 0, rD = chercher('cf_Dfond', grille(plafond(D + 0.001, 0.25), D + 6, 0.25), portanceOk, base);
      if (rD.valeur != null) acts.push({ texte: `Ou descendre l'assise : D = ${fx(rD.valeur)} m sous le terrain naturel (q'₀ = γ'·D) — seulement si l'assise est réellement plus profonde, le profil devant alors être repris depuis la nouvelle sous-face`, champ: 'cf_Dfond', unite: 'm', valeur: fx(rD.valeur), valeurChamp: str(rD.valeur), court: LIB_CADRE.cf_Dfond, actuel: fx(D) });
      else if (rD.chercher) acts.push({ texte: 'Ou descendre l\'assise (q\'₀ = γ\'·D)', champ: 'cf_Dfond', unite: 'm', chercher: rD.chercher });
      else acts.push({ texte: `Descendre l'assise ne suffit pas (essayé jusqu'à D = ${fx(D + 6)} m)`, champ: 'cf_Dfond', unite: 'm' });
      acts.push({ texte: 'Ou substituer ou améliorer le sol d\'assise (nouveau profil d\'essais), ou fonder sur pieux (hors module)', champ: 'cf_profil', libelleChamp: 'Profil sous le radier ou les semelles' });
      items.push({ domaine: 'Cadre — fondation', lieu: [...new Set(ko.map(k => k.v.fondation))].join(', '), verification: `Portance (${out.blocs[0].portance.referentiel === 'F62' ? 'Fascicule 62 titre V' : 'NF P94-261'})`,
        constat: `taux ${fx(w.taux)} > 1 (${w.fondation}, ${w.etat}, ${w.combinaison}${w.detail ? ', ' + w.detail : ''})`, regle: out.blocs[0].portance.referentiel === 'F62' ? 'Fascicule 62 titre V, annexes B et F' : 'NF P94-261, guide Cerema 2015',
        actions: acts, cibles: ko.map(({ v, ib }) => ({ bloc: ib, type: 'portance', fondation: v.fondation, etat: v.etat })) });
    }
  }

  // ------------------------------------------------------------------ réserves bloquantes
  const vues = new Set();
  out.blocs.forEach((r, ib) => r.reserves.forEach((x, ir) => {
    const cible = { bloc: ib, type: 'reserve', index: ir };
    // traitées ci-dessus : la réserve renvoie à la même recommandation
    const deja = /^PORTANCE NON VÉRIFIÉE/.test(x) ? items.find(i => /^Portance/.test(i.verification)) : /^GABARIT NON RESPECTÉ/.test(x) ? items.find(i => i.verification === 'Gabarit libre')
      : /NON VÉRIFIÉ en \d+ point/.test(x) ? items.find(i => /^Choc/.test(i.verification)) : null;
    if (deja) { deja.cibles.push(cible); return; }
    if (/^PORTANCE NON VÉRIFIÉE|^GABARIT NON RESPECTÉ|NON VÉRIFIÉ en \d+ point/.test(x)) return;
    const cle = x.replace(/bloc.*$/, '').slice(0, 40); if (vues.has(cle)) { const it = items.find(i => i._cle === cle); if (it) it.cibles.push(cible); return; } vues.add(cle);
    const push = (o) => items.push({ _cle: cle, cibles: [cible], ...o });
    if (/^SOULÈVEMENT NON VÉRIFIÉ/.test(x)) {
      const base = { ...champsEp }, er = +(base.cf_er ?? g0.er), Hr = g0.Hr, acts = [];
      const rE = chercher('cf_er', grille(plafond(er + 0.001, 0.05), er + 2, 0.05), flottaisonOk, base);
      if (rE.valeur != null) acts.push({ texte: `Épaissir le radier à ${fx(rE.valeur)} m (lest déjaugé)${avecEp}`, champ: 'cf_er', unite: 'm', valeur: fx(rE.valeur), valeurChamp: str(rE.valeur), court: LIB_CADRE.cf_er, actuel: fx(g0.er) });
      else if (rE.chercher) acts.push({ texte: 'Épaissir le radier (lest)', champ: 'cf_er', unite: 'm', chercher: rE.chercher });
      const rH = chercher('cf_Hr', grille(plafond(Hr + 0.001, 0.05), Hr + 5, 0.05), flottaisonOk, base);
      if (rH.valeur != null) acts.push({ texte: `Ou augmenter le remblai sur la traverse à ${fx(rH.valeur)} m (si le profil en long le permet ; les sections sont à revérifier)`, champ: 'cf_Hr', unite: 'm', valeur: fx(rH.valeur), valeurChamp: str(rH.valeur), court: LIB_CADRE.cf_Hr, actuel: fx(Hr) });
      acts.push({ texte: 'Ou rabattre la nappe par un drainage pérenne (niveau de nappe de calcul abaissé, à justifier)', champ: 'cf_hNappe', unite: 'm', court: LIB_CADRE.cf_hNappe });
      push({ domaine: 'Cadre — hydraulique', lieu: 'Radier', verification: 'Soulèvement (flottaison) ≥ 1,10', constat: x.split(' — ')[0].replace(/\. Il manque.*$/, ''), regle: 'guide PICF-EL ; coefficient 1,10 sur le poids mobilisable', actions: acts });
    } else if (/^Biais/.test(x)) {
      const b = +d.cf_biais || 100, cible70 = b < 100 ? 70 : 130;
      push({ domaine: 'Cadre — conception', lieu: 'Biais', verification: 'Biais ≥ 70 gr (guide PICF-EL, annexe 5)', constat: x.split(' : ')[0].split(' — ').slice(0, 2).join(' — '), regle: 'guide PICF-EL, annexe 5',
        actions: [{ texte: `Redresser l'ouvrage : biais de ${fx(cible70, 0)} gr au moins (angle aigu ≥ 70 gr)`, champ: 'cf_biais', unite: 'gr', valeur: fx(cible70, 0), valeurChamp: String(cible70), court: LIB_CADRE.cf_biais, actuel: fx(b, 0) },
          { texte: 'Sinon : modèle plaque (M_x, M_y, M_xy) et renfort des angles obtus, hors de ce calcul ; au-delà de 50 gr de biais, tablier-dalle biais (PSIDA)' }] });
    } else if (/Aucune situation hydraulique/.test(x)) {
      push({ domaine: 'Cadre — hydraulique', lieu: 'Situations hydrauliques', verification: 'Eau intérieure, nappe, sous-pression déclarées', constat: 'aucune situation hydraulique déclarée', regle: 'guide PICF-EL',
        actions: [{ texte: `Renseigner la hauteur d'eau intérieure de projet (à défaut, ouvrage plein : H = ${fx(g0.H)} m, enveloppe)`, champ: 'cf_hEau', unite: 'm', valeur: fx(g0.H), valeurChamp: str(g0.H), court: LIB_CADRE.cf_hEau, actuel: fx(h0.hEau) },
          { texte: 'Renseigner le niveau de nappe au-dessus du radier (cas « vide sous nappe haute »)', champ: 'cf_hNappe', unite: 'm', court: LIB_CADRE.cf_hNappe }] });
    } else if (/radier rigide à réaction linéaire/.test(x)) {
      const src = d.cf_solSrc || 'table', acts = [];
      if (d.cf_sol === 'rigide') acts.push({ texte: 'Modèle de sol élastique ESOL (programme PICF-EL)', champ: 'cf_sol', valeur: 'sol élastique ESOL', valeurChamp: 'winkler', court: LIB_CADRE.cf_sol, actuel: 'radier rigide' });
      if (src === 'table' && esolIndicatif(h0.nature, h0.etat) == null) acts.push({ texte: 'La table du guide ne donne pas d\'ESOL pour ce sol : choisir « ESOL saisi » et renseigner ESOL', champ: 'cf_solSrc', valeur: 'ESOL saisi', valeurChamp: 'esol', court: LIB_CADRE.cf_solSrc });
      if (src === 'esol' && !(h0.esol > 0)) acts.push({ texte: 'Renseigner ESOL (MPa)', champ: 'cf_esol', unite: 'MPa', court: LIB_CADRE.cf_esol });
      if (['pressio', 'cpt', 'dpt', 'spt'].includes(src) && !(h0.esol > 0)) acts.push({ texte: 'Le profil d\'essais ne donne pas d\'ESOL : compléter le profil sous le radier, ou saisir ESOL', champ: 'cf_profil', libelleChamp: 'Profil sous le radier ou les semelles' });
      if (!acts.length) acts.push({ texte: 'Choisir le sol élastique ESOL', champ: 'cf_sol', valeur: 'sol élastique ESOL', valeurChamp: 'winkler', court: LIB_CADRE.cf_sol });
      push({ domaine: 'Cadre — fondation', lieu: 'Sol sous radier', verification: 'Module de réaction ESOL', constat: 'radier rigide à réaction linéaire, sans module de réaction', regle: 'guide PICF-EL, annexe 2', actions: acts });
    } else if (/^Gabarit :/.test(x)) {
      push({ domaine: 'Cadre — voie franchie', lieu: 'Gabarit', verification: 'Gabarit renseigné', constat: 'hauteur libre requise non renseignée', regle: 'gestionnaire de la voie franchie',
        actions: [{ texte: 'Renseigner la hauteur libre exigée par le gestionnaire (par exemple 4,75 m sous route nationale en France)', champ: 'cf_gabH', unite: 'm', court: LIB_CADRE.cf_gabH }] });
    } else if (/déraillement.*ne sont pas renseignées/.test(x)) {
      push({ domaine: 'Cadre — voie franchie', lieu: 'Piédroits', verification: 'Action de déraillement renseignée', constat: 'force de calcul non renseignée', regle: 'EN 1991-1-7 § 4.5',
        actions: [{ texte: 'Saisir la force de calcul exigée par le gestionnaire du réseau', champ: 'cf_chocF', unite: 'kN', court: LIB_CADRE.cf_chocF }] });
    } else push({ domaine: 'Cadre — réserves', lieu: out.blocs.length > 1 ? `bloc ${ib + 1}` : '', verification: 'Réserve bloquante', constat: x.split(' REMÈDE')[0], regle: '', actions: [{ texte: x.includes('REMÈDE') ? x.split('REMÈDE : ')[1] : 'Voir la réserve dans les résultats' }] });
  }));
  for (const it of items) delete it._cle;

  const synthese = Object.keys(champsEp).length ? { texte: 'Épaisseurs cherchées ensemble pour faire passer toutes les sections', champs: champsEp } : null;
  return { items, synthese, calculs: nCalc, duree: Date.now() - t0 };
}

/** Première action applicable (champ et valeur) d'un élément : c'est l'indication « → à modifier » des tableaux. */
export function indication(it) {
  const a = it.actions.find(x => (x.champ && x.valeurChamp != null) || x.champs) || it.actions.find(x => x.champ) || it.actions[0];
  if (!a) return null;
  return { texte: a.court || a.texte, champ: a.champ || null, champs: a.champs || null, actuel: a.actuel, valeur: a.valeur, valeurChamp: a.valeurChamp, unite: a.unite || '', complet: a.texte };
}

/** Index des indications par ligne de tableau : clé `${bloc}|${type}|…`. */
export function indicationsParCible(items) {
  const m = new Map();
  for (const it of items) {
    const ind = indication(it); if (!ind) continue;
    for (const c of it.cibles || []) {
      const k = cleCible(c);
      if (!m.has(k)) m.set(k, ind);
    }
  }
  return m;
}
export const cleCible = c => [c.bloc, c.type, c.barre ?? c.fondation ?? c.index ?? '', c.ou ?? c.etat ?? '', c.z ?? ''].join('|');
