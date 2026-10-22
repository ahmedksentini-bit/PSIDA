/**
 * Calcul de structure d'un cadre fermé (PICF, dalot) sous remblai, du chargement au ferraillage.
 * Portage de BVTrace.Core/CulvertStructure.cs (lui-même conforme au programme SETRA PICF-EL, guide de décembre 1991,
 * 2ᵉ édition juillet 1992, Fascicule 61 titre II, BAEL 91 révisé 99 ou EN 1992-1-1) :
 *  - charges permanentes : traverse, remblai alourdi par l'effet Marston, remblai léger ×0,90 et lourd ×1,10,
 *    superstructures ; poussées K₀ max (avec surcharge sur remblai PSREM) et K₀ min ; phasage de remblaiement ;
 *    phase de construction (radier portant les voiles) ; situations hydrauliques (eau intérieure, nappe, sous-pression) ;
 *  - charges d'exploitation A(l) (recalculée pour chaque longueur chargée), Bc, Bt, Mc120 diffusées à travers le
 *    remblai ; schémas de chargement partiel ; empreinte plus courte que la portée BALAYÉE le long de la travée ;
 *  - effets à sections fixes (abouts, quarts, mi-portée), pondérés effet par effet (γ défavorable s'il aggrave,
 *    favorable s'il soulage), groupes d'alternatives, un seul système d'exploitation à la fois ;
 *  - sections : ELS (flexion composée si N > 0,5 t/ml), ELU, non-fragilité, effort tranchant, choix des barres,
 *    fissuration EC2 ; épaisseurs proposées (jamais appliquées) ; avant-métré ; réserves bloquantes.
 * Unités : m, t, t/m², t·m/ml (1 t = 10 kN).
 *
 * Non porté de BVTrace : le modèle plaque de la traverse biaise (CulvertSkewCheck, MITC4) — le biais reste traité par
 * l'allongement en 1/sin et par les réserves du guide (70 gr, 50 gr).
 */
import * as C from './cadre.js';
import * as F61 from './charges61.js';
import * as Sol from './sol.js';
import * as S from './sections.js';
import * as Hy from './hydro.js';
import * as D from './details.js';
import * as Rail from './rail.js';
import * as Sis from './seisme.js';

const fr = (x, d = 2) => (isFinite(x) ? x.toFixed(d).replace('.', ',') : String(x));

export const HYP_DEFAUT = {
  code: 'BAEL', exposition: 'XC2-XC4', fc28: 25, fe: 400, sigmaS: 201.6, rhoB: 2.5, rhoR: 2.0, K0max: 0.50, K0min: 0.25,
  enrobage: 0.05, phi0: 0.016, classe: 1, bc: 1.10, bt: 1.00, a1: 1.0, a2: 1.0,
  gQs: 1.20, gG: 1.35, gQu: 1.60, gMs: 1.00, gMu: 1.35, remblaiMin: 0.90, remblaiMax: 1.10,
  incompressible: true, marston: true, sol: 'rigide', esol: 0, nature: 'argile', etat: 'normal',
  psrem: 1.0, qsupMin: 0, qsupMax: 0, phasage: true, hEau: 0, hNappe: 0,
  systemes: { Al: true, Bc: true, Bt: true, Mc120: true },
};

export const PAS_BALAYAGE = 0.10, POS_MIN = 5, POS_MAX = 17, PLANCHER_COMPARAISON = 0.02;
export const STATIONS = [['About A', 0], ['1/4', 0.25], ['Mi-portée', 0.5], ['3/4', 0.75], ['About B', 1]];
export const PAS_EPAISSEUR = 0.02, RECHERCHE_EPAISSEUR = 1.00;

/** Géométrie de calcul (dimensions intérieures, biais en degrés, 90 = droit). */
export function geometrieCadre(o) {
  const e = o.e > 0 ? o.e : D.epaisseurPicf(o.B);
  return {
    nom: o.nom || '', n: o.n, B: o.B, H: o.H, L: o.L || 0, biais: o.biais ?? 90,
    et: o.et ?? e, er: o.er ?? e, ep: o.ep ?? e, ei: o.ei ?? e, Hr: o.Hr ?? 0,
    gaucheExt: o.gaucheExt ?? true, droiteExt: o.droiteExt ?? true,
  };
}
export function cadreDe(geom) {
  const g = { ouv: new Array(geom.n).fill(geom.B), h: geom.H, et: geom.et, er: geom.er, ep: geom.ep, ei: geom.ei };
  return Math.abs(geom.biais - 90) < 1e-9 ? g : C.avecBiais(g, geom.biais);
}

function fractionsBalayage(course) {
  if (!(course > 1e-9)) return [0];
  const nb = Math.min(Math.max(Math.ceil(course / PAS_BALAYAGE) + 1, POS_MIN), POS_MAX);
  return Array.from({ length: nb }, (_, k) => k / (nb - 1));
}
const toutesBarres = r => [...r.traverses, ...r.radiers, ...r.voiles];
function pirePosition(frames) {
  let best = 0, bm = -Infinity;
  frames.forEach((f, k) => { let m = 0; for (const b of toutesBarres(f)) m = Math.max(m, Math.abs(b.MA), Math.abs(b.MB), Math.abs(b.Mmax)); if (m > bm) { bm = m; best = k; } });
  return best;
}
function accesseurs(n, ouvert = false) {
  const a = [];
  for (let i = 0; i < n; i++) a.push([`Traverse ${i + 1}`, f => f.traverses[i]]);
  if (!ouvert) for (let i = 0; i < n; i++) a.push([`Radier ${i + 1}`, f => f.radiers[i]]);
  for (let j = 0; j <= n; j++) a.push([(j === 0 || j === n) ? `Piédroit ${j === 0 ? 'gauche' : 'droit'}` : `Voile ${j}`, f => f.voiles[j]]);
  return a;
}
/** Diagramme échantillonné à 21 points (comme le C#) puis interpolé linéairement : mêmes valeurs aux stations. */
const diag = b => (b._d ||= b.res.diagramme(21));
function interpoler(d, s) {
  if (!d.length) return [0, 0];
  if (s <= d[0][0]) return [d[0][1], d[0][2]];
  const last = d[d.length - 1];
  if (s >= last[0]) return [last[1], last[2]];
  for (let i = 1; i < d.length; i++) if (s <= d[i][0]) { const t = (s - d[i - 1][0]) / (d[i][0] - d[i - 1][0]); return [d[i - 1][1] + t * (d[i][1] - d[i - 1][1]), d[i - 1][2] + t * (d[i][2] - d[i - 1][2])]; }
  return [last[1], last[2]];
}

/** Mesure, système par système, ce que le balayage change par rapport à la pression uniforme étalée sur la travée. */
function mesurerBalayages(n, runs, resoudre, ouvert = false) {
  const barres = accesseurs(n, ouvert), par = {};
  for (const run of runs) {
    if (run.frames.length <= 1 || run.libre) continue;
    const uni = resoudre(C.vertical(n, run.q, run.pattern));
    let ech = 0;
    for (const [, get] of barres) for (const p of diag(get(uni))) ech = Math.max(ech, Math.abs(p[1]));
    let dAgg = 0, dBal = 0, dUni = 0, dStart = 0, dB = '', dO = '', rM = 0, rBal = 0, rUni = 0, rStart = 0, rB = '', rO = '';
    for (const [nb, get] of barres) {
      const du = diag(get(uni)), L = du.length ? du[du.length - 1][0] : 0;
      for (const [ns, fr_] of STATIONS) {
        const s = L * fr_, mu = Math.abs(interpoler(du, s)[0]);
        let mb = 0, st = 0;
        run.frames.forEach((f, k) => { const m = Math.abs(interpoler(diag(get(f)), s)[0]); if (m > mb) { mb = m; st = run.fractions[k] * run.course; } });
        if (mb - mu > dAgg) { dAgg = mb - mu; dBal = mb; dUni = mu; dB = nb; dO = ns; dStart = st; }
        if (mu > PLANCHER_COMPARAISON * ech && mb / mu > rM) { rM = mb / mu; rBal = mb; rUni = mu; rB = nb; rO = ns; rStart = st; }
      }
    }
    const agg = dAgg > 0;
    if (!agg && rM <= 0) continue;
    const m = { systeme: run.sys, bande: run.bande, portee: run.bande + run.course, positions: run.fractions.length, pas: run.fractions.length > 1 ? run.course / (run.fractions.length - 1) : 0,
      barre: agg ? dB : rB, ou: agg ? dO : rO, debut: agg ? dStart : rStart, balaye: agg ? dBal : rBal, uniforme: agg ? dUni : rUni, echelle: ech };
    m.minorait = m.balaye > m.uniforme + 1e-9; m.delta = m.balaye - m.uniforme;
    m.message = `Charge ${m.systeme} : emprise diffusée de ${fr(m.bande)} m, plus courte que la portée (${fr(m.portee)} m) — la charge est LOCALISÉE. Elle est donc appliquée en bande, DÉPLACÉE le long de la travée en ${m.positions} positions (pas ${fr(m.pas)} m), et les enveloppes sont prises sur toutes ces positions. `
      + (m.minorait ? `MESURE : l'assimiler à une pression uniforme MINORAIT ${m.barre} — ${m.ou} : ${fr(m.uniforme, 3)} contre ${fr(m.balaye, 3)} t·m/ml en balayant (empreinte à ${fr(m.debut)} m de l'about), soit ${fr(m.delta, 3)} t·m/ml de plus — ${fr(m.echelle > 1e-12 ? 100 * m.delta / m.echelle : 0, 1)} % du plus fort moment du système (${fr(m.echelle, 3)} t·m/ml). L'hypothèse précédente était non conservative en ce point.`
        : `MESURE : l'hypothèse de pression uniforme restait enveloppe partout ; au plus serré (${m.barre} — ${m.ou}) elle donnait ${fr(m.uniforme, 3)} contre ${fr(m.balaye, 3)} t·m/ml en balayant. Elle appliquait en effet q × portée au lieu de q × emprise, soit une résultante plus lourde que la charge réelle.`)
      + ' Les empreintes des travées chargées se déplacent en phase ; la répartition transversale n\'est pas traitée (calcul par mètre linéaire d\'ouvrage).';
    const deja = par[m.systeme];
    if (!deja || (m.minorait && !deja.minorait) || (m.minorait === deja.minorait && m.delta > deja.delta)) par[m.systeme] = m;
  }
  return Object.values(par);
}

/** Combinaison à section fixe : règle du signe, alternatives, un seul système d'exploitation. */
function combiner(cas, mMax, mMin, vMax, vMin, h) {
  let pSM = 0, pSm = 0, pUM = 0, pUm = 0, vPM = 0, vPm = 0, lSM = 0, lSm = 0, lUM = 0, lUm = 0, vL = 0;
  const gM = {}, gm = {}, gVM = {}, gVm = {};
  cas.forEach((c, i) => {
    const sM = mMax[i], sm = mMin[i], tM = vMax[i], tm = vMin[i], grp = c.groupe || '';
    if ((c.nature === 'permanent' || c.nature === 'terres') && grp) {
      gM[grp] = grp in gM ? Math.max(gM[grp], sM) : sM; gm[grp] = grp in gm ? Math.min(gm[grp], sm) : sm;
      gVM[grp] = grp in gVM ? Math.max(gVM[grp], tM) : tM; gVm[grp] = grp in gVm ? Math.min(gVm[grp], tm) : tm;
      return;
    }
    if (c.nature === 'permanent' || c.nature === 'terres') {
      pSM += sM; pSm += sm; pUM += sM > 0 ? sM * h.gG : sM; pUm += sm < 0 ? sm * h.gG : sm;
      vPM += tM > 0 ? tM * h.gG : tM; vPm += tm < 0 ? tm * h.gG : tm;
    } else if (c.nature === 'civil' || c.nature === 'militaire') {
      const mil = c.nature === 'militaire', gS = c.gS ?? (mil ? h.gMs : h.gQs), gU = c.gU ?? (mil ? h.gMu : h.gQu);
      if (sM > 0) { lSM = Math.max(lSM, sM * gS); lUM = Math.max(lUM, sM * gU); }
      if (sm < 0) { lSm = Math.min(lSm, sm * gS); lUm = Math.min(lUm, sm * gU); }
      vL = Math.max(vL, Math.max(Math.abs(tM), Math.abs(tm)) * gU);
    }
  });
  const Ag = x => x > 0 ? x * h.gG : x, Al = x => x < 0 ? x * h.gG : x;
  let sM = pSM + lSM, sm = pSm + lSm, uM = pUM + lUM, um = pUm + lUm, vp = vPM + vL, vn = vPm - vL;
  for (const g of Object.keys(gM)) { sM += gM[g]; sm += gm[g]; uM += Ag(gM[g]); um += Al(gm[g]); vp += Ag(gVM[g]); vn += Al(gVm[g]); }
  return { sM, sm, uM, um, vU: Math.max(Math.abs(vp), Math.abs(vn)) };
}

function effetsCalcul(n, cas, h, ouvert = false) {
  const out = [];
  for (const [nb, get] of accesseurs(n, ouvert)) {
    const dref = diag(get(cas[0].frame)), L = dref.length ? dref[dref.length - 1][0] : 0;
    for (const [ns, frac] of STATIONS) {
      const s = L * frac, mMax = [], mMin = [], vMax = [], vMin = [];
      for (const c of cas) {
        let m0 = Infinity, m1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (const f of (c.balayage && c.balayage.length ? c.balayage : [c.frame])) { const [mm, vv] = interpoler(diag(get(f)), s); m0 = Math.min(m0, mm); m1 = Math.max(m1, mm); v0 = Math.min(v0, vv); v1 = Math.max(v1, vv); }
        mMin.push(m0); mMax.push(m1); vMin.push(v0); vMax.push(v1);
      }
      const k = combiner(cas, mMax, mMin, vMax, vMin, h);
      let nMin = 0; const grN = {};
      cas.forEach(c => { if (c.nature !== 'permanent') return; const nn = get(c.frame).N, g = c.groupe || ''; if (!g) nMin += nn; else grN[g] = g in grN ? Math.min(grN[g], nn) : nn; });
      for (const v of Object.values(grN)) nMin += v;
      out.push({ barre: nb, ou: ns, s, mMax, mMin, vMax, vMin, Mels: k.sM, mels: k.sm, Melu: k.uM, melu: k.um, Vu: k.vU, N: Math.max(nMin, 0) });
    }
  }
  return out;
}

const service = (h, M, d) => {
  const sig = h.code === 'EC2' ? Math.min(h.sigmaS, S.limiteAcierEc2(h.fe)) : h.sigmaS;
  const a = S.elsBael(M, d, sig, h.fc28, h.fe);
  if (h.code !== 'EC2') return a;
  const mn = S.minimumEc2(d, h.fc28, h.fe);
  return a.as >= mn ? a : { as: mn, alpha: a.alpha, minG: true, detail: `As = ${fr(mn)} cm²/ml — minimum EN 1992-1-1 §9.2.1.1 (calcul ${fr(a.as)} cm²/ml)` };
};
const ultime = (h, M, d) => h.code === 'EC2' ? S.eluEc2(M, d, h.fc28, h.fe) : S.eluBael(M, d, h.fc28, h.fe);
const minimum = (h, d) => h.code === 'EC2' ? S.minimumEc2(d, h.fc28, h.fe) : S.minimumBael(d, h.fc28, h.fe);
function retenir(els, elu, mn) {
  if (elu.surarme || !isFinite(elu.as)) return [els, false];
  const a = Math.max(elu.as, mn);
  if (a <= els.as) return [els, false];
  return [{ as: a, alpha: elu.alpha, minG: a > elu.as, detail: `As = ${fr(a)} cm²/ml — l'ELU gouverne (${elu.detail})` }, true];
}

function sectionsCalcul(geom, effets, h, alertes) {
  const ep = b => b.startsWith('Traverse') ? geom.et : b.startsWith('Radier') ? geom.er : b.startsWith('Voile') ? geom.ei : geom.ep;
  const signalee = new Set(), out = [];
  for (const e of effets) {
    const t = ep(e.barre);
    let d = t - h.enrobage - h.phi0 / 2;
    if (!(d > 0)) { if (!signalee.has(e.barre)) { signalee.add(e.barre); alertes.push(`${e.barre} : enrobage ${fr(h.enrobage)} m ≥ épaisseur ${fr(t)} m — hauteur utile nulle, section non calculée.`); } continue; }
    const comp = e.N > 0.5 && h.code === 'BAEL';
    let elsM = comp ? S.elsComposeeBael(e.Mels, e.N, t, d, h.sigmaS, h.fc28, h.fe) : service(h, Math.max(e.Mels, 0), d);
    let elsm = comp ? S.elsComposeeBael(e.mels, e.N, t, d, h.sigmaS, h.fc28, h.fe) : service(h, Math.max(-e.mels, 0), d);
    let eluM = ultime(h, Math.max(e.Melu, 0), d), elum = ultime(h, Math.max(-e.melu, 0), d), mn = minimum(h, d);
    const [rM0] = retenir(elsM, eluM, mn), [rm0] = retenir(elsm, elum, mn);
    const b0M = S.choixBarres(rM0.as), b0m = S.choixBarres(rm0.as);
    const phi = Math.max(b0M.option?.phiMax ?? h.phi0, b0m.option?.phiMax ?? h.phi0);
    if (Math.abs(phi - h.phi0) > 1e-9) {
      const d2 = t - h.enrobage - phi / 2;
      if (d2 > 0) {
        // Second passage avec le diamètre retenu. Comme dans BVTrace, il est conduit en flexion SIMPLE (sans le
        // soulagement de l'effort normal) : choix conservatif, signalé dans la note.
        d = d2; elsM = service(h, Math.max(e.Mels, 0), d); elsm = service(h, Math.max(-e.mels, 0), d);
        eluM = ultime(h, Math.max(e.Melu, 0), d); elum = ultime(h, Math.max(-e.melu, 0), d); mn = minimum(h, d);
      }
    }
    const [rM, guM] = retenir(elsM, eluM, mn), [rm, gum] = retenir(elsm, elum, mn);
    const bM = S.choixBarres(rM.as), bm = S.choixBarres(rm.as), tb = S.tranchantBael(e.Vu, d, h.fc28);
    const ec2 = h.code === 'EC2';
    const sec = {
      barre: e.barre, ou: e.ou, e: t, d, Mmin: Math.min(e.mels, e.melu), Mmax: Math.max(e.Mels, e.Melu), Vu: e.Vu, N: e.N,
      asMax: rM, asMin: rm, barresMax: bM, barresMin: bm, tranchant: tb, eluMax: eluM, eluMin: elum, eluGouvMax: guM, eluGouvMin: gum,
      tranchantEc2: ec2 ? S.tranchantEc2(e.Vu, d, h.fc28, Math.max(rM.as, rm.as)) : null,
      fissMax: ec2 ? S.fissureEc2(e.Mels, t, d, b0M.option?.aire ?? rM.as, phi, h.enrobage, h.fc28, h.exposition) : null,
      fissMin: ec2 ? S.fissureEc2(e.mels, t, d, b0m.option?.aire ?? rm.as, phi, h.enrobage, h.fc28, h.exposition) : null,
    };
    sec.asGouv = Math.max(rM.as, rm.as);
    sec.surarme = eluM.surarme || elum.surarme;
    sec.tranchantOk = sec.tranchantEc2 ? sec.tranchantEc2.ok : tb.ok;
    sec.tranchantMsg = sec.tranchantEc2 ? sec.tranchantEc2.message : tb.message;
    sec.fissureTrop = (sec.fissMax && !sec.fissMax.ok) || (sec.fissMin && !sec.fissMin.ok);
    sec.echec = !sec.tranchantOk || sec.surarme || sec.fissureTrop || !bM.ok || !bm.ok;
    out.push(sec);
  }
  return out;
}

function proposerEpaisseurs(h, sections) {
  const fam = {};
  for (const s of sections) if (s.echec) (fam[s.barre.split(' ')[0]] ||= []).push(s);
  return Object.entries(fam).map(([f, liste]) => {
    const pire = liste.slice().sort((a, b) => b.Vu - a.Vu)[0], ep = pire.e, M = Math.max(Math.abs(pire.Mmax), Math.abs(pire.Mmin));
    let trouvee = null;
    for (let e = ep + PAS_EPAISSEUR; e <= ep + RECHERCHE_EPAISSEUR + 1e-9; e += PAS_EPAISSEUR) {
      const d = e - h.enrobage; if (!(d > 0)) continue;
      const tOk = S.tranchantBael(pire.Vu, d, h.fc28).ok, elu = S.eluBael(M, d, h.fc28, h.fe), els = S.elsBael(M, d, h.sigmaS, h.fc28, h.fe);
      const a = elu.surarme ? els.as : Math.max(els.as, elu.as);
      if (tOk && !elu.surarme && S.choixBarres(a).ok) { trouvee = Math.round(e * 1000) / 1000; break; }
    }
    return { famille: f, actuelle: ep, proposee: trouvee, message: trouvee != null
      ? `${f} : ${fr(ep)} m ne suffit pas — ${fr(trouvee)} m conviendrait, à confirmer par un nouveau calcul (épaissir une pièce modifie les sollicitations de tout le cadre).`
      : `${f} : ${fr(ep)} m ne suffit pas, et aucun épaississement jusqu'à ${fr(ep + RECHERCHE_EPAISSEUR)} m n'y remédie. Revoir la conception — résistance du béton, ouverture, ou type d'ouvrage.` };
  });
}

/**
 * Calcul complet d'un bloc (cadre monolithique). `geom` : voir geometrieCadre ; `hyp` : surcharge de HYP_DEFAUT.
 * Option `chargesExploitation(ctx)` : fonction rendant la liste des systèmes [{ sys, q, nature, emprise, libelle? }]
 * pour un schéma — c'est le point d'extension des franchissements ferroviaires (src/cadre/rail.js).
 */
export function calculPicf(geomIn, hypIn = {}, opts = {}) {
  const ouvert = opts.ouvert || null, franchie = opts.usage?.franchie || 'eau', portee = opts.usage?.portee || 'route';
  const geom = geometrieCadre(ouvert ? { ...geomIn, er: 0 } : geomIn), h = { ...HYP_DEFAUT, ...hypIn, systemes: { ...HYP_DEFAUT.systemes, ...(hypIn.systemes || {}) } };
  if (ouvert) geom.er = 0;
  const g = cadreDe(geom); C.valider(g, !!ouvert);
  const n = geom.n, hc = C.hauteurCalc(g), largeur = C.largeurCalc(g), notes = [];

  let aireB = geom.et * largeur + geom.er * largeur;
  for (let j = 0; j <= n; j++) aireB += C.epVoile(g, j) * geom.H;
  const longueur = geom.L > 0 ? geom.L : 1, poids = longueur * (h.rhoB * aireB + h.rhoR * geom.Hr * largeur);
  const dB = F61.coefDynamique(largeur, poids, 76.8, h.classe), dMc = F61.coefDynamique(largeur, poids, 110.0, h.classe);

  const qTrav = h.rhoB * geom.et, qRemNu = h.rhoR * geom.Hr;
  const Dext = n * geom.B + (n - 1) * geom.ei + 2 * geom.ep, Hext = geom.H + geom.et + geom.er;
  const mars = h.marston ? Sol.marston(geom.Hr, Dext, Hext, h.incompressible) : { K: 1, borne: false, message: 'Alourdissement de Marston non appliqué (option).' };
  const qRem = qRemNu * mars.K;
  notes.push('Effet Marston — ' + mars.message);
  if (h.notesSol) notes.push(...h.notesSol);
  const gPerm = C.vertical(n, qTrav + qRem * h.remblaiMax + h.qsupMax), gPermMin = C.vertical(n, qTrav + qRem * h.remblaiMin + h.qsupMin);

  const esolV = h.esol > 0 ? h.esol : Sol.esolIndicatif(h.nature, h.etat);
  const esolSrc = h.esolSource ? h.esolSource : h.esol > 0 ? `ESOL saisi : ${fr(h.esol, 1)} MPa` : esolV != null ? `ESOL indicatif ${fr(esolV, 1)} MPa — ${Sol.libelleNature(h.nature)}, ${Sol.libelleEtat(h.nature, h.etat)} (annexe 2 du guide)` : `Le guide ne donne pas de valeur d'ESOL pour ${Sol.libelleNature(h.nature)} ${Sol.libelleEtat(h.nature, h.etat)} : la saisir.`;
  let sol = null;
  if (ouvert) notes.push(`Portique ouvert (PIPO) : piédroits ${ouvert === 'articule' ? 'articulés' : 'encastrés'} sur leurs semelles ; les réactions d'appui sont rendues pour justifier les fondations (portance, glissement, renversement), qui ne le sont pas ici.`);
  else if (h.sol === 'winkler') {
    if (esolV > 0) {
      sol = { ks: Sol.raideurT(esolV, largeur), E: Sol.moduleDiffereBeton(h.fc28) * Sol.T_PAR_M2_PAR_MPA };
      notes.push(`Sol élastique (Winkler) — ${esolSrc}, soit k = ${fr(Sol.kReaction(esolV, largeur), 1)} MPa/m sous un radier de ${fr(largeur)} m. Béton : module différé ${Sol.moduleDiffereBeton(h.fc28).toFixed(0)} MPa.`);
    } else notes.push('Sol élastique demandé mais ESOL indéterminé — ' + esolSrc + ' Le calcul revient au radier rigide (réaction linéaire).');
  } else notes.push('Sol : radier supposé rigide, réaction linéaire. Le programme PICF-EL emploie un sol élastique de module ESOL — changer d\'hypothèse pour s\'y conformer.');
  const resoudre = s => C.resoudreCadre(g, s, sol, { ouvert });

  const zH = geom.Hr + geom.et / 2, zB = zH + hc, svH = h.rhoR * zH, svB = h.rhoR * zB;
  const gB = geom.gaucheExt ? svB : 0, gH = geom.gaucheExt ? svH : 0, drB = geom.droiteExt ? svB : 0, drH = geom.droiteExt ? svH : 0;
  const rail = portee === 'rail' ? Rail.chargesFerroviaires(geom, g, opts.rail || {}, !!ouvert) : null;
  if (rail) notes.push(...rail.notes);
  const fournisseur = rail ? rail.fournisseur : opts.chargesExploitation;
  const qs = rail ? rail.psrem : Math.max(0, h.psrem), sG = geom.gaucheExt ? qs : 0, sD = geom.droiteExt ? qs : 0;
  const pMax = C.poussee(n, h.K0max * (gB + sG), h.K0max * (gH + sG), h.K0max * (drB + sD), h.K0max * (drH + sD));
  const pMin = C.poussee(n, h.K0min * gB, h.K0min * gH, h.K0min * drB, h.K0min * drH);

  // Systèmes d'exploitation routiers (Fascicule 61), sauf si une extension fournit les siens.
  const bc = F61.diffuser(F61.EMPREINTES.Bc, geom.Hr, geom.et), bt = F61.diffuser(F61.EMPREINTES.Bt, geom.Hr, geom.et), mc = F61.diffuserChenille(F61.EMPREINTES.Mc120, geom.Hr, geom.et);
  const qBc = bc.q * h.bc * dB, qBt = bt.q * h.bt * dB, qMc = mc.q * dMc, porteeRef = C.portee(g, 0);
  const derivations = rail ? [...rail.derivations] : [];
  if (!fournisseur) {
    derivations.push({ sys: 'A(l)', empreinte: `charge répartie, a₁ = ${fr(h.a1)} et a₂ = ${fr(h.a2)}`, H: geom.Hr, e: geom.et, pente: 0, s: 0, U: 0, V: 0, qBrute: F61.alBase(largeur), delta: 1, coef: h.a1 * h.a2, q: F61.al(largeur, h.a1, h.a2), portee: porteeRef, couverture: Infinity });
    for (const [sys, p, d, delta, coef, q] of [['Bc', F61.EMPREINTES.Bc, bc, dB, h.bc, qBc], ['Bt', F61.EMPREINTES.Bt, bt, dB, h.bt, qBt], ['Mc120', F61.EMPREINTES.Mc120, mc, dMc, 1, qMc]])
      derivations.push({ sys, empreinte: `empreinte ${fr(p.u)} × ${fr(p.v)} m, ${fr(p.P, 1)} t, entraxes ${fr(p.Et)} m en travers et ${p.El > 0 ? fr(p.El) + ' m en long' : 'empreinte unique en long'}`, H: geom.Hr, e: geom.et, pente: F61.PENTE_DIFFUSION, s: d.s, U: d.U, V: d.V, qBrute: d.q, delta, coef, q, portee: porteeRef, couverture: d.V / Math.max(porteeRef, 1e-9) });
  }
  const systemesRoute = (pat, lCharge, quoi) => {
    const qAl = F61.al(lCharge, h.a1, h.a2), L = [];
    if (h.systemes.Al) L.push({ sys: 'A(l)', q: qAl, nature: 'civil', emprise: Infinity, libelle: `A(l) ${quoi} (${fr(qAl, 3)} t/m², l = ${fr(lCharge)} m)` });
    if (h.systemes.Bc) L.push({ sys: 'Bc', q: qBc, nature: 'civil', emprise: bc.V });
    if (h.systemes.Bt) L.push({ sys: 'Bt', q: qBt, nature: 'civil', emprise: bt.V });
    if (h.systemes.Mc120) L.push({ sys: 'Mc120', q: qMc, nature: 'militaire', emprise: mc.V });
    return L;
  };
  const ctx = { geom, g, h, n, largeur, poids, hc };
  const bande = (q, emp, pat, u) => {
    const v = new Array(n).fill(0), bs = [];
    for (let i = 0; i < n; i++) { if (!pat[i]) continue; const lc = C.portee(g, i); if (emp >= lc - 1e-12) { v[i] = q; continue; } bs.push({ travee: i, x0: u * (lc - emp), l: emp, q }); }
    return C.jeu(n, { v, bandes: bs });
  };
  const course = (emp, pat) => { let c = 0; for (let i = 0; i < n; i++) if (pat[i]) { const lc = C.portee(g, i); c = Math.max(c, lc - Math.min(emp, lc)); } return c; };

  const runs = [];
  for (const pat of C.schemasPartiels(n)) {
    const quoi = C.nomSchema(pat);
    let lCh = 0; for (let i = 0; i < n; i++) if (pat[i]) lCh += C.portee(g, i);
    const syst = fournisseur ? fournisseur({ ...ctx, pattern: pat, longueurChargee: lCh, quoi }) : systemesRoute(pat, lCh, quoi);
    for (const sy of syst) {
      if (!(sy.q > 0)) continue;
      if (sy.jeux) {   // système fourni avec ses positions (charges ferroviaires) : pas de balayage par travée
        const frames = sy.jeux.map(resoudre), pire = pirePosition(frames), fracs = sy.jeux.map((_, k) => sy.jeux.length > 1 ? k / (sy.jeux.length - 1) : 0);
        runs.push({ sys: sy.sys, nom: sy.libelle || `${sy.sys} — ${quoi}`, nature: sy.nature, q: sy.q, bande: sy.bande || 0, quoi, pattern: pat, course: 0, fractions: fracs, sets: sy.jeux, frames, pire, gS: sy.gS, gU: sy.gU, libre: true });
        continue;
      }
      const crs = course(sy.emprise, pat), fracs = fractionsBalayage(crs), sets = [], frames = [];
      for (const u of fracs) { const s = bande(sy.q, sy.emprise, pat, u); sets.push(s); frames.push(resoudre(s)); }
      const pire = pirePosition(frames), bd = crs > 1e-9 ? sy.emprise : 0;
      const nom = sy.libelle || (fracs.length > 1 ? `${sy.sys} — ${quoi} (${fr(sy.q, 3)} t/m² sur bande de ${fr(bd)} m, ${fracs.length} positions)` : `${sy.sys} — ${quoi} (${fr(sy.q, 3)} t/m²)`);
      runs.push({ sys: sy.sys, nom, nature: sy.nature, q: sy.q, bande: bd, quoi, pattern: pat, course: crs, fractions: fracs, sets, frames, pire, gS: sy.gS, gU: sy.gU });
    }
  }
  const balayages = mesurerBalayages(n, runs, resoudre, !!ouvert);

  // Combinaisons tracées (diagrammes)
  const combos = [], add = (nom, s, elu) => combos.push({ nom, jeu: s, elu });
  add('ELS G+ + Pmax', C.plus(gPerm, pMax), false); add('ELS G+ + Pmin', C.plus(gPerm, pMin), false);
  add('ELS G− + Pmax', C.plus(gPermMin, pMax), false); add('ELS G− + Pmin', C.plus(gPermMin, pMin), false);
  add('ELU G+ + Pmax', C.plus(C.echelle(gPerm, h.gG), C.echelle(pMax, h.gG)), true); add('ELU G− + Pmax', C.plus(gPermMin, pMax), true);
  for (const r of runs) {
    const live = r.sets[r.pire], mil = r.nature === 'militaire';
    const gS = r.gS ?? (mil ? h.gMs : h.gQs), gU = r.gU ?? (mil ? h.gMu : h.gQu);
    const ou = r.libre ? ` — ${r.quoi}, position ${r.pire + 1}/${r.frames.length}` : r.frames.length > 1 ? ` — ${r.quoi}, empreinte de ${fr(r.bande)} m à ${fr(r.fractions[r.pire] * r.course)} m de l'about` : ` — ${r.quoi}`;
    add(`ELS ${r.sys}${ou}`, C.plus(C.plus(gPerm, pMax), C.echelle(live, gS)), false);
    add(`ELU ${r.sys}${ou}`, C.plus(C.plus(C.echelle(gPerm, h.gG), C.echelle(pMax, h.gG)), C.echelle(live, gU)), true);
  }
  if (h.phasage && (geom.gaucheExt || geom.droiteExt)) {
    const g0 = C.vertical(n, qTrav);
    if (geom.gaucheExt) add('Phasage — remblai côté gauche seul', C.plus(g0, C.poussee(n, h.K0max * svB, h.K0max * svH, 0, 0)), false);
    if (geom.droiteExt) add('Phasage — remblai côté droit seul', C.plus(g0, C.poussee(n, 0, 0, h.K0max * svB, h.K0max * svH)), false);
  }
  const pv = h.rhoB * geom.ep * geom.H;
  if (!ouvert) add('Phase de construction', C.poidsVoile(n, pv), false);

  // Cas élémentaires
  const cas = [{ nom: `Poids propre traverse (${fr(qTrav, 3)} t/m²)`, nature: 'permanent', frame: resoudre(C.vertical(n, qTrav)) }];
  if (qRem > 0) {
    const suf = mars.K > 1.0005 ? `, Marston ×${fr(mars.K, 3)}` : '';
    cas.push({ nom: `Remblai ×${fr(h.remblaiMax)} (${fr(qRem * h.remblaiMax, 3)} t/m²${suf})`, nature: 'permanent', groupe: 'remblai', frame: resoudre(C.vertical(n, qRem * h.remblaiMax)) });
    cas.push({ nom: `Remblai ×${fr(h.remblaiMin)} (${fr(qRem * h.remblaiMin, 3)} t/m²)`, nature: 'permanent', groupe: 'remblai', frame: resoudre(C.vertical(n, qRem * h.remblaiMin)) });
  }
  if (h.qsupMax > 0 || h.qsupMin > 0) {
    cas.push({ nom: `Superstructures max (${fr(h.qsupMax, 3)} t/m²)`, nature: 'permanent', groupe: 'qsup', frame: resoudre(C.vertical(n, h.qsupMax)) });
    cas.push({ nom: `Superstructures min (${fr(h.qsupMin, 3)} t/m²)`, nature: 'permanent', groupe: 'qsup', frame: resoudre(C.vertical(n, h.qsupMin)) });
  }
  cas.push({ nom: `Poussée max (K₀ = ${fr(h.K0max)}${qs > 0 ? `, surcharge ${fr(qs)} t/m²` : ''})`, nature: 'terres', groupe: 'terres', frame: resoudre(pMax) });
  cas.push({ nom: `Poussée min (K₀ = ${fr(h.K0min)})`, nature: 'terres', groupe: 'terres', frame: resoudre(pMin) });
  for (const r of runs) cas.push({ nom: r.nom, nature: r.nature, frame: r.frames[r.pire], balayage: r.frames.length > 1 ? r.frames : [], bande: r.bande, debut: r.fractions[r.pire] * r.course, gS: r.gS, gU: r.gU });
  if (!ouvert) cas.push({ nom: `Construction (${fr(pv, 3)} t/ml par voile)`, nature: 'construction', frame: resoudre(C.poidsVoile(n, pv)) });

  const hydrau = franchie === 'eau' && !ouvert, eauI = hydrau && h.hEau > 0, nappe = hydrau && h.hNappe > 0;
  for (const sit of [eauI && 'interieure', nappe && 'videNappe', eauI && nappe && 'pleineNappe'].filter(Boolean))
    cas.push({ nom: `Eau — ${Hy.SITUATIONS[sit]}`, nature: 'permanent', groupe: 'eau', frame: resoudre(Hy.chargesEau(g, sit, h.hEau, h.hNappe, geom.gaucheExt, geom.droiteExt)) });

  const frames = combos.map(c => resoudre(c.jeu));
  const effets = effetsCalcul(n, cas, h, !!ouvert);
  const alertes = [...notes];
  const sections = sectionsCalcul(geom, effets, h, alertes);

  // ── Séisme (EN 1998) : enveloppe des approches inertie/poussée et distorsion, sections renforcées si besoin ─────
  let sisme = null;
  if (opts.seisme && opts.seisme.actif) {
    sisme = Sis.calculSismique({ g, geom, h, n, resoudre, ouvert, qTrav, qRem, pMax, pMin, accesseurs, stations: STATIONS, interpoler }, opts.seisme);
    alertes.push(...sisme.notes);
    const gb = h.code === 'EC2' ? 1.5 : 1.15, gs = h.code === 'EC2' ? 1.15 : 1.0;
    sisme.verifs = [];
    for (const e of sisme.effets) {
      const sec = sections.find(x => x.barre === e.barre && x.ou === e.ou); if (!sec) continue;
      const elu = M => h.code === 'EC2' ? S.eluEc2(M, sec.d, h.fc28, h.fe, gb, gs) : S.eluBael(M, sec.d, h.fc28, h.fe, gb, gs);
      const uM = elu(Math.max(e.Mmax, 0)), um = elu(Math.max(-e.Mmin, 0)), tau = e.V / 100 / sec.d, lim = 0.07 * h.fc28 / gb;
      const v = { barre: e.barre, ou: e.ou, Mmax: e.Mmax, Mmin: e.Mmin, V: e.V, asM: uM.as, asm: um.as, surarme: uM.surarme || um.surarme, tau, lim, okT: tau <= lim, renforce: false };
      for (const [u, k, kb] of [[uM, 'asMax', 'barresMax'], [um, 'asMin', 'barresMin']]) {
        if (!u.surarme && isFinite(u.as) && u.as > sec[k].as + 1e-9) {
          sec[k] = { as: u.as, alpha: u.alpha, minG: false, detail: `As = ${fr(u.as)} cm²/ml — le séisme gouverne (${u.detail})` };
          sec[kb] = S.choixBarres(u.as); v.renforce = true; sec.sismeGouv = true;
        }
      }
      if (v.surarme) sec.surarme = true;
      if (!v.okT) { sec.tranchantOk = false; sec.tranchantMsg = `séisme : τ = ${fr(tau, 3)} MPa > ${fr(lim, 3)} MPa`; }
      sec.asGouv = Math.max(sec.asMax.as, sec.asMin.as);
      sec.echec = !sec.tranchantOk || sec.surarme || sec.fissureTrop || !sec.barresMax.ok || !sec.barresMin.ok;
      sisme.verifs.push(v);
    }
    const nR = sisme.verifs.filter(v => v.renforce).length;
    alertes.push(`Séisme : ${sisme.combinaisons} combinaisons (G + P + E, deux sens, ±k_v, K₀ max ou min, approches A et B en enveloppe) ; matériaux ${h.code === 'EC2' ? 'γc = 1,5 et γs = 1,15 (NF EN 1998-1, 5.2.4)' : 'γb = 1,15 et γs = 1,0 (situation accidentelle BAEL)'} ; ${nR ? `${nR} section(s) renforcée(s) par le séisme` : 'aucune section renforcée par le séisme'}. Les pressions hydrodynamiques de l'eau contenue ne sont pas prises en compte ; les charges d'exploitation n'entrent pas dans la combinaison sismique (ψ₂ = 0 pour le trafic routier, NF EN 1998-2, 4.1.2${portee === 'rail' ? ' ; pour une voie ferrée, le terme ψ₂·Q de NF EN 1998-2, 4.1.2 n’est pas encore ajouté' : ''}).`);
  }
  const res = {
    geom, h, cadre: g, combos, frames, cas, effets, sections, deltaB: dB, deltaMc: dMc, poids, marstonK: mars.K, marstonNote: mars.message,
    derivations, balayages, alertes, reserves: [], psrem: qs, ouvert, franchie, portee, sisme, rail: rail ? { phi: rail.phi, phiBrut: rail.phiBrut, LPhi: rail.LPhi, bt: rail.bt, sL: rail.sL } : null,
    metre: D.avantMetre(g, geom.H, geom.L, sections), propositions: proposerEpaisseurs(h, sections),
  };

  const aigu = 90 - Math.abs(90 - geom.biais), gr = aigu / 0.9, eta = geom.B > 0 && geom.L > 0 ? geom.L / geom.B : NaN;
  if (Math.abs(geom.biais - 90) > 1e-9) {
    if (gr < 70) res.reserves.push(`Biais ${fr(geom.biais, 1)}° — angle aigu ${fr(aigu, 1)}° (${gr.toFixed(0)} gr), coefficient de forme η = ${fr(eta)} : l'allongement de la portée en 1/sin ne suffit plus. Le guide PICF-EL (annexe 5) demande, en deçà de 70 gr de biais, d'orienter le ferraillage selon la direction mécanique et de renforcer les angles obtus — ce calcul ne le fait pas. REMÈDE : ramener le biais à 70 gr au moins (63° à 99° autour du droit) en redressant l'ouvrage, ou faire établir un modèle plaque donnant Mx, My et Mxy et armer les angles obtus en conséquence.`);
    else res.alertes.push(`Biais ${fr(geom.biais, 1)}° — angle aigu ${fr(aigu, 1)}° (${gr.toFixed(0)} gr), au-delà des 70 gr en deçà desquels le guide PICF-EL impose une orientation mécanique du ferraillage. Coefficient de forme η = ${fr(eta)} : l'option 1 du guide (ferraillage longitudinal parallèle aux bords libres, transversal parallèle aux piédroits) convient à tous les η dans ce domaine.`);
    if (gr < 50) res.reserves.push(`Biais ${gr.toFixed(0)} gr : au-delà d'une cinquantaine de grades de biais, le guide PICF-EL écarte le cadre. Réduire le biais en allongeant l'ouvrage, ou changer de type d'ouvrage (tablier-dalle biais PSIDA ou PSIDP).`);
  }
  if (geom.Hr < 0.50) res.alertes.push(`Couverture de ${fr(geom.Hr)} m seulement : la diffusion ne suffit plus à étaler les charges de roue, et il faudrait une répartition transversale (Guyon-Massonnet, annexe 6 du guide) que ce calcul ne fait pas. Les moments de la traverse sont sous-estimés.`);

  if (nappe) {
    res.flottaison = Hy.flottaison(g, geom.H, geom.Hr, h.hNappe, h.rhoB, h.rhoR);
    (res.flottaison.ok ? res.alertes : res.reserves).push(res.flottaison.message);
  }
  for (const b of balayages) res.alertes.push(b.message);
  if (hydrau && opts.hydraulique !== false && !eauI && !nappe) res.reserves.push('Aucune situation hydraulique déclarée : eau intérieure, nappe extérieure, sous-pression et flottabilité ne sont PAS justifiées. Pour un dalot hydraulique le cas « ouvrage vide sous nappe haute » inverse la flexion du radier et dimensionne souvent sa nappe supérieure. REMÈDE : renseigner la hauteur d\'eau intérieure et le niveau de nappe.');
  if (!ouvert && (h.sol !== 'winkler' || !(esolV > 0))) res.reserves.push('Sol modélisé en radier rigide à réaction linéaire, sans module de réaction issu d\'une reconnaissance. Les pressions sous radier ne sont donc pas opposables à une portance, et un décollement éventuel n\'est pas traité en contact unilatéral. REMÈDE : renseigner ESOL — la table indicative de l\'annexe 2 suffit en avant-projet, le guide rappelant qu\'une erreur de 50 % n\'a qu\'une faible incidence sur les efforts.');
  const nMax = Math.max(0, ...effets.map(e => e.N));
  if (nMax > 0.5) res.alertes.push(`Flexion composée appliquée : effort normal jusqu'à ${fr(nMax, 1)} t/ml, repris section par section ; c'est la compression la plus FAIBLE de chaque section qui est retenue.${h.code === 'EC2' ? ' (Non appliquée en Eurocode 2 : le calcul y reste en flexion simple.)' : ''}`);
  for (const p of res.propositions) res.alertes.push(p.message);
  res.alertes.push('Avant-métré — ' + res.metre.note);
  if (D.horsTableEpaisseur(geom.B)) res.alertes.push(`Ouverture ${fr(geom.B)} m hors de la table SETRA des épaisseurs (1,00 à 6,00 m) : l'épaisseur retenue est la valeur de bord, à justifier.`);
  for (const s of sections) {
    if (s.surarme) res.alertes.push(`${s.barre} — ${s.ou} : ${s.eluMax.surarme ? s.eluMax.detail : s.eluMin.detail}`);
    if (!s.tranchantOk) res.alertes.push(`${s.barre} — ${s.ou} : ${s.tranchantMsg}`);
    if (s.fissMax && !s.fissMax.ok) res.alertes.push(`${s.barre} — ${s.ou} : ${s.fissMax.detail}`);
    else if (s.fissMin && !s.fissMin.ok) res.alertes.push(`${s.barre} — ${s.ou} : ${s.fissMin.detail}`);
    if (!s.barresMax.ok) res.alertes.push(`${s.barre} — ${s.ou} : ${s.barresMax.message}`);
    else if (!s.barresMin.ok) res.alertes.push(`${s.barre} — ${s.ou} : ${s.barresMin.message}`);
  }
  // ── Portique ouvert : enveloppe des réactions d'appui (fondations) ──────────────────────────────
  if (ouvert) {
    res.reactions = Array.from({ length: n + 1 }, (_, j) => {
      const env = { els: { Vmax: -Infinity, Vmin: Infinity, Hmax: -Infinity, Hmin: Infinity, Mmax: -Infinity, Mmin: Infinity }, elu: { Vmax: -Infinity, Vmin: Infinity, Hmax: -Infinity, Hmin: Infinity, Mmax: -Infinity, Mmin: Infinity } };
      combos.forEach((c, k) => {
        const r = frames[k].reactions[j], e = env[c.elu ? 'elu' : 'els'];
        e.Vmax = Math.max(e.Vmax, r.V); e.Vmin = Math.min(e.Vmin, r.V); e.Hmax = Math.max(e.Hmax, r.H); e.Hmin = Math.min(e.Hmin, r.H); e.Mmax = Math.max(e.Mmax, r.M); e.Mmin = Math.min(e.Mmin, r.M);
      });
      return { appui: (j === 0 || j === n) ? `Piédroit ${j === 0 ? 'gauche' : 'droit'}` : `Voile ${j}`, ...env };
    });
    res.alertes.push('Réactions d\'appui des piédroits (enveloppes ELS et ELU, t/ml et t·m/ml) rendues pour le calcul des semelles ; la justification des fondations n\'est pas faite par ce module.');
  }

  // ── Voie franchie (route ou voie ferrée dans l'ouvrage) : gabarit et choc sur les piédroits ─────────
  if (franchie === 'route' || franchie === 'rail') {
    const gb = opts.gabarit || {}, ech = gb.epaisseurChaussee ?? (franchie === 'route' ? 0.30 : 0.60);
    const libreH = geom.H - ech, req = gb.hauteur || 0, reqL = gb.largeur || 0;
    res.gabarit = { hauteurLibre: libreH, hauteurRequise: req, largeurLibre: geom.B, largeurRequise: reqL, ok: (!(req > 0) || libreH >= req - 1e-9) && (!(reqL > 0) || geom.B >= reqL - 1e-9) };
    const txt = `Gabarit : hauteur libre ${fr(libreH)} m (hauteur intérieure ${fr(geom.H)} m moins ${fr(ech)} m de ${franchie === 'route' ? 'chaussée' : 'plateforme'})${req > 0 ? ` pour ${fr(req)} m requis` : ' — hauteur requise non renseignée'}, ouverture ${fr(geom.B)} m${reqL > 0 ? ` pour ${fr(reqL)} m requis` : ''}.`;
    if (!(req > 0)) res.reserves.push(txt + ' REMÈDE : renseigner le gabarit exigé par le gestionnaire de la voie franchie.');
    else (res.gabarit.ok ? res.alertes : res.reserves).push(res.gabarit.ok ? txt : 'GABARIT NON RESPECTÉ — ' + txt);

    const ch = opts.choc || {}, F = ch.F ?? (franchie === 'route' ? 500 : 0);
    if (F > 0) {
      const hb = ch.hauteur ?? 0.5, bImp = ch.largeur ?? 1.5, beff = ch.beff > 0 ? ch.beff : bImp + geom.H;
      const zs = ch.z != null ? [ch.z] : (franchie === 'route' ? [0.75, 1.25] : [1.8]);
      const q = F / Rail.KN_PAR_T / beff / hb, gbA = h.code === 'EC2' ? 1.2 : 1.15;
      const base = C.plus(gPermMin, pMin), verifs = [];
      const cibles = [{ voile: 0, signe: -1, nom: 'Piédroit gauche' }, ...(n > 1 ? [{ voile: 1, signe: 1, nom: 'Voile 1' }] : [])];
      for (const cb of cibles) for (const z of zs) {
        const z0 = geom.er / 2 + ech + z - hb / 2, fA = resoudre(C.plus(base, C.bandesVoile(n, [{ voile: cb.voile, z0, l: hb, q: cb.signe * q }])));
        const bar = fA.voiles[cb.voile], dg = bar.res.diagramme(41);
        const secs = sections.filter(x => x.barre === cb.nom);
        for (const st of STATIONS) {
          const sAbs = bar.L * st[1], [M, V] = interpoler(dg, sAbs), sec = secs.find(x => x.ou === st[0]);
          if (!sec) continue;
          const elu = h.code === 'EC2' ? S.eluEc2(M, sec.d, h.fc28, h.fe, 1.2, 1.0) : S.eluBael(M, sec.d, h.fc28, h.fe, 1.15, 1.0);
          const four = M >= 0 ? sec.barresMax.fournie : sec.barresMin.fournie, tau = Math.abs(V) / 100 / sec.d, tauLim = 0.07 * h.fc28 / gbA;
          verifs.push({ barre: cb.nom, ou: st[0], z, M, V, asReq: elu.as, asFournie: four, surarme: elu.surarme, okFlexion: !elu.surarme && elu.as <= four + 1e-9, tau, tauLim, okTranchant: tau <= tauLim });
        }
      }
      const ko = verifs.filter(v => !v.okFlexion || !v.okTranchant);
      res.choc = { F, beff, hb, q, zs, verifs, ok: ko.length === 0 };
      const hyp = `Choc ${franchie === 'route' ? 'de véhicule (EN 1991-1-7, 4.3.1 et tableau 4.1)' : 'de déraillement (EN 1991-1-7, 4.5 — valeur saisie)'} : F = ${fr(F, 0)} kN perpendiculaire au piédroit, sur ${fr(hb)} m de hauteur, diffusé sur b_eff = ${fr(beff)} m (hypothèse : ${fr(bImp)} m d'impact + hauteur intérieure), combinaison accidentelle G + K₀min + A_d (γ = 1 ; ${h.code === 'EC2' ? 'γc = 1,2' : 'γb = 1,15'}, γs = 1,0).`;
      if (ko.length) {
        const w = ko.slice().sort((a, b) => (b.asReq - b.asFournie) - (a.asReq - a.asFournie))[0];
        res.reserves.push(`${hyp} NON VÉRIFIÉ en ${ko.length} point(s), le plus sollicité ${w.barre} — ${w.ou} : M = ${fr(w.M)} t·m/ml, ${w.surarme ? 'section surarmée' : `As requis ${fr(w.asReq)} cm²/ml pour ${fr(w.asFournie)} fournis`}${w.okTranchant ? '' : `, τ = ${fr(w.tau, 3)} > ${fr(w.tauLim, 3)} MPa`}. REMÈDE : épaissir ou armer davantage le piédroit, l'éloigner de la voie, ou le protéger par un dispositif de retenue ; une analyse en plaque peut justifier une largeur de diffusion supérieure.`);
      } else res.alertes.push(hyp + ' Vérifié avec les armatures retenues.');
    } else if (franchie === 'rail') res.reserves.push('Voie ferrée franchie : les actions de déraillement (EN 1991-1-7, 4.5, classe de l\'ouvrage et distance à la voie) ne sont pas renseignées. REMÈDE : saisir la force de calcul exigée par le gestionnaire du réseau.');
  }

  res.ok = res.reserves.length === 0 && sections.every(s => s.tranchantOk && !s.fissureTrop && s.barresMax.ok && s.barresMin.ok);
  res.statut = res.ok ? 'Note d\'exécution — aucune réserve bloquante' : res.reserves.length ? `AVANT-PROJET seulement — ${res.reserves.length} réserve(s) bloquante(s) à lever` : 'Insuffisant — au moins une section ne passe pas';
  res.gouvernante = sections.slice().sort((a, b) => b.asGouv - a.asGouv)[0] || null;
  return res;
}

/** Calcul découpé en blocs monolithiques (barres de 12 m, 3 cellules par bloc). Un ouvrage de 1 à 3 cellules = un bloc. */
export function calculPicfBlocs(geomIn, hyp = {}, opts = {}) {
  const geom = geometrieCadre(geomIn), g = cadreDe(geom), split = D.decoupageBlocs(geom.n, geom.n > 0 ? C.portee(g, 0) : 0);
  if (split.refus) return { blocs: [], split };
  const blocs = split.blocs.map(b => {
    const r = calculPicf({ ...geom, n: b.n, nom: split.blocs.length === 1 ? geom.nom : `${geom.nom} — bloc ${b.label}`, gaucheExt: b.gaucheExt, droiteExt: b.droiteExt }, hyp, opts);
    if (split.blocs.length > 1) {
      r.alertes.push(split.explication);
      r.alertes.push(!b.gaucheExt && !b.droiteExt ? 'Bloc intérieur : aucune face au contact du remblai, donc aucune poussée des terres. L\'appui éventuel sur les blocs voisins au droit des joints n\'est pas mobilisé — hypothèse conservative.'
        : 'Bloc d\'extrémité : la poussée des terres ne s\'exerce que d\'un côté, l\'autre face longeant un joint sec. Le cadre travaille donc en poussée dissymétrique de façon permanente, et non seulement en phasage.');
    }
    return r;
  });
  return { blocs, split };
}
