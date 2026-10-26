/**
 * Onglet « Poutres » : lecture du formulaire, calcul du tablier à poutres, dimensionnement des poutres et réactions par
 * ligne d'appui (transmises au module « Appuis et fondations » en mode appuis seuls).
 */
import { beamDeck, beamCombinations, beamCombinationsRail, beamSection } from './index.js';
import { parseRail } from '../pipeline.js';
import { tBeamULS, prestressCheck, lineReactions, lineReactionsRail, etriersEC2 } from './design.js';
import { FORME_VIPP, sectionVIPP } from './vipp_section.js';
import { chaineVIPP, DEFAUTS_VIPP } from './vipp.js';
import { hourdisLocal } from './hourdis.js';
import { entretoiseVerinage } from './entretoise.js';
import { spectreVerticalDuFormulaire } from '../seisme_vertical.js';
import { deformationsRail, ecmDynamique } from '../rail_deformations.js';

const nums = s => String(s ?? '').split(/[,;\s]+/).filter(Boolean).map(Number);
const pairs = s => String(s ?? '').split(';').map(t => t.trim()).filter(Boolean).map(t => nums(t));

export function parsePoutres(d) {
  const parts = pairs(d.pt_parts).filter(p => p.length >= 2 && p[0] > 0 && p[1] > 0).map(([b, h]) => ({ b, h }));
  const v = (k, def) => (String(d[k] ?? '').trim() === '' ? def : +d[k]);
  // définition de la section : dimensions d'une poutre VIPP (défaut du formulaire), rectangles empilés, ou valeurs
  // (projets antérieurs : A, I, K donnés — la chaîne de précontrainte détaillée demande les dimensions)
  const geo = d.pt_geo || (parts.length ? 'rect' : 'valeurs');
  const F = FORME_VIPP, DV = DEFAUTS_VIPP, C = DV.cables;
  const forme = { hp: v('pt_hp', F.hp), bt: v('pt_bt', F.bt), hte: v('pt_hte', F.hte), pt: v('pt_pt', F.pt), gt: v('pt_gt', F.gt), b0: v('pt_b0v', F.b0), bta: v('pt_bta', F.bta), hpi: v('pt_hpi', F.hpi), tpan: v('pt_tpan', F.tpan), b0a: v('pt_b0a', F.b0a), Lb: v('pt_Lb', F.Lb) };
  const vipp = {
    forme, expo: d.pt_expo || DV.expo, fyk: v('pt_fyk', 500), cs: v('pt_cs', DV.cs),
    beton: { fckP: v('pt_fck', 40), fckH: v('pt_fckh', DV.beton.fckH), RH: v('pt_RH', DV.beton.RH), cimP: d.pt_cim || DV.beton.cimP, cimH: 'N', gamma: 25 },
    cables: { nc: v('pt_nc', C.nc), n2: v('pt_n2', C.n2), unite: d.pt_unite || C.unite, parLit: v('pt_parlit', C.parLit), cBas: v('pt_cbas', C.cBas), ev: v('pt_ev', C.ev),
      yaBas: v('pt_yab', C.yaBas), yaHaut: v('pt_yah', C.yaHaut), sigP0: v('pt_sp0', 0) || null, mu: v('pt_mu', C.mu), k: v('pt_kp', C.k), g: v('pt_g', C.g * 1000) / 1000, tension: d.pt_tens || C.tension, fpk: 1860, fp01k: 1640, classe: 2, rho1000: 2.5 },
    dates: { t1: v('pt_t1', DV.dates.t1), t2: v('pt_t2', DV.dates.t2), t2b: v('pt_t2b', DV.dates.t2b), t3: v('pt_t3', DV.dates.t3), fin: 36500 },
  };
  // PRAD : torons adhérents (src/beams/prad.js) ; la 2e famille n'existe pas (t2b = t2)
  if (d.pt_type === 'PRAD') {
    const e = v('pr_e', 0.05);
    vipp.adherence = { nt: Math.round(v('pr_nt', 20)), nsup: Math.round(v('pr_nsup', 0)), type: d.pr_type || 'T15S', cBas: v('pr_cbas', 0.05), ev: e, eh: e, alpha1: v('pr_rel', 1), dT: v('pr_dT', 0), about: v('pr_about', 0.30),
      groupes: [{ n: Math.round(v('pr_g1n', 4)), Lg: v('pr_g1L', 2) }, { n: Math.round(v('pr_g2n', 4)), Lg: v('pr_g2L', 4) }] };
    vipp.dates.t2b = vipp.dates.t2;
    // étuvage : âge équivalent t_T = Σ exp(−4000/(273 + T) + 13,65) Δt (EN 1992-1-1 § 10.3.1.1 (3)), T = 20 °C + ΔT pendant h heures
    const h = v('pr_hetuv', 0) / 24, T = 20 + v('pr_dT', 0);
    vipp.beton.decalage = h > 0 ? Math.max(0, h * (Math.exp(-4000 / (273 + T) + 13.65) - 1)) : 0;
  }
  const local = { tRev: v('pt_trev', 0.08), te: v('pt_te', 0.25), dv: v('pt_dv', 0.6), verinsRive: d.pt_vrive === undefined ? true : !!+d.pt_vrive || d.pt_vrive === 'on', fckH: v('pt_fckh', 30), c: v('pt_ch', 0.03) };
  // séisme vertical des tabliers précontraints (EN 1998-2 § 4.1.7(2)P), quand le séisme est activé dans l'onglet Appuis
  const sv = spectreVerticalDuFormulaire(d);
  if (sv) { vipp.spectreV = sv.spectreV; vipp.siteV = sv.site; }
  // pont à poutres sous rail (EN 1991-2 section 6) : mêmes données que le pont-dalle sous rail, champs pt_rail_*
  const rail = d.pt_trafic === 'ferroviaire' ? parseRail(Object.fromEntries([['trafic', 'ferroviaire'],
    ...Object.entries(d).filter(([k]) => k.startsWith('pt_rail_')).map(([k, x]) => [k.slice(3), x])])) : null;
  return {
    geo, vipp, local, rail,
    spans: nums(d.pt_spans), n: v('pt_n', 4), b1: v('pt_b1', 3.28), hd: v('pt_hd', 0.30),
    beam: geo === 'rect' && parts.length ? { parts } : { A: v('pt_A', 1.98), I: v('pt_I', 1.006), K: v('pt_K', 0.0364), v: v('pt_v', 0.65), vp: v('pt_vp', 1.67), H: v('pt_H', 2.32) },
    roadway: (([y1, y2]) => ({ y1, y2 }))(nums(d.pt_road || '-4, 4')),
    footways: pairs(d.pt_foot).filter(p => p.length >= 2).map(([y1, y2]) => ({ y1, y2 })),
    lines: String(d.pt_lines || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const [g, e] = t.split('@').map(Number); return { g, e }; }).filter(l => Number.isFinite(l.g) && Number.isFinite(l.e)),
    // k min / k max facultatifs (« q sur y1,y2 k 0.7/1.3 », EN 1991-1-1 § 5.2.3 : ballast ± 30 %) ; sans k : valeur nominale
    bands: String(d.pt_bands || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const m = t.match(/k\s*([\d.]+)\s*\/\s*([\d.]+)/i), t0 = m ? t.replace(m[0], '') : t; const [q, r] = t0.split('sur'); const [y1, y2] = nums(r); return m ? { q: +q, y1, y2, kmin: +m[1], kmax: +m[2] } : { q: +q, y1, y2 }; }).filter(b => Number.isFinite(b.q) && Number.isFinite(b.y1)),
    extraArea: v('pt_extra', 0) / 25,
    nRetenue: v('pt_ret', 0), mil: d.pt_mil || 'Mc120', alphaEC: d.alpha || 'recommended',
    type: d.pt_type || 'BP', fck: v('pt_fck', 35), fyk: v('pt_fyk', 500), b0: v('pt_b0', 0.25), cover: v('pt_cover', 0.12),
    P: v('pt_P', 0), e0: v('pt_e0', -1.46), fpr: v('pt_sp', 1100),
  };
}

export function computePoutres(inp) {
  if (inp.geo === 'dims') {
    // section VIPP : poutre + hourdis de largeur b₁ pour la répartition transversale (coefficient d'équivalence 1)
    const S = sectionVIPP(inp.vipp.forme, { b1: inp.b1, hd: inp.hd });
    inp = { ...inp, beam: { ...S.comp, v: S.comp.v, vp: S.comp.vp }, vippSection: S };
  }
  const bd = beamDeck(inp);
  const sec = bd.sec, H = sec.H || inp.beam.H || 2, v = sec.v ?? inp.beam.v, vp = sec.vp ?? inp.beam.vp;
  const spans = [...bd.bySpan.values()].map(S => {
    if (inp.rail) return traveeRail(S, inp, sec, H, v, vp);
    const mid = S.deck.beam.sectionIndex(0, 0.5), x0 = S.deck.beam.sectionIndex(0, 0);
    const beams = S.beams.map(b => {
      const c = beamCombinations(b);
      const MuF = Math.max(...c.ELU_F61), MuE = Math.max(...c.ELU_EC);
      const out = { k: b.k, y: b.y, mid: {}, eta: {}, etaL: {}, etaV: {}, V0: {}, comb: { ELS_F61: c.ELS_F61[mid], ELU_F61: c.ELU_F61[mid], ELS_EC: c.ELS_EC[mid], ELU_EC: c.ELU_EC[mid] }, MuF, MuE };
      for (const id of ['G', 'A', 'Bc', 'Bt', 'Mc120', 'D240', 'trott', 'TS', 'UDL', 'gr1a', 'gr1b']) if (b[id]) { out.mid[id] = b[id].Mmax[mid]; out.eta[id] = b[id].eta; out.etaL[id] = b[id].etaL ?? null; out.etaV[id] = b[id].etaV ?? b[id].eta; out.V0[id] = b[id].Vmax ? b[id].Vmax[x0] : null; }
      const d = H - inp.cover;
      if ((inp.type === 'BP' || inp.type === 'PRAD') && inp.geo === 'dims') {
        out.vipp = chaineVIPP({ ...inp.vipp, b1: inp.b1, hd: inp.hd, gExtra: 0 }, S.L, b, { elsF61: c.ELS_F61, eluF61: c.ELU_F61 });
      } else if (inp.type === 'BA') {
        out.BA = { BAEL: tBeamULS({ M: MuF, beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'BAEL' }), EC: tBeamULS({ M: MuE, beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'EC' }) };
        // le long de la travée : armatures inférieures (ELU, enveloppe EC / F61) et étriers (EC2 § 6.2.3), z = 0,9 d
        const secs = S.deck.beam.sections, half = secs.filter(q => q.x <= S.L / 2 + 1e-9);
        out.BA.travee = half.map((q, i) => {
          const VEd = 1.35 * Math.abs(b.G.Vmax?.[i] ?? 0) + 1.35 * Math.max(Math.abs(b.gr1a?.Vmax?.[i] ?? 0), Math.abs(b.gr1b?.Vmax?.[i] ?? 0));
          const As = tBeamULS({ M: Math.max(c.ELU_EC[i], c.ELU_F61[i]), beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'EC' });
          return { x: q.x, MEd: Math.max(c.ELU_EC[i], c.ELU_F61[i]), As: As.As, VEd, V: etriersEC2({ VEd, bw: inp.b0, z: 0.9 * d, fck: inp.fck, fyk: inp.fyk }) };
        });
      } else {
        const Gm = b.G.Mmin[mid], base = { A: sec.A, I: sec.I, v, vp, P: inp.P, e0: inp.e0, Mmin: Gm, fck: inp.fck };
        // BPEL classe II : combinaison rare (ELS Fascicule 61) ; EC2 : décompression sous quasi-permanente (ψ₂ = 0 : G seul),
        // compression ≤ 0,6 f_ck sous caractéristique
        const ecQP = prestressCheck({ ...base, Mmax: b.G.Mmax[mid], code: 'EC' }), ecCar = prestressCheck({ ...base, Mmax: c.ELS_EC[mid], code: 'EC' });
        out.BP = { BPEL: prestressCheck({ ...base, Mmax: c.ELS_F61[mid], code: 'BPEL' }),
          EC: { ...ecQP, enChargeCar: ecCar.enCharge, ok: ecQP.enCharge.inf >= -1e-6 && ecQP.aVide.sup >= -1e-6 && ecCar.enCharge.sup <= ecCar.sigClim + 1e-6 } };
      }
      return out;
    });
    return { L: S.L, theta: S.gp.theta, alpha: S.gp.alpha, Lguyon: S.gp.Lguyon, classe: S.f61.classe, deltaB: S.f61.deltaBc[0], deltaC: S.f61.deltaMc?.[0], beams };
  });
  // hourdis (flexion locale) et entretoises d'about (vérinage) : sections connues par leurs dimensions ou leurs rectangles
  // (sous rail : charges des traverses diffusées dans le ballast, coefficient dynamique du hourdis, tableau 6.2 cas 4.1)
  let hourdis = null, entretoise = null;
  const parts = inp.beam.parts, Lmax = Math.max(...inp.spans);
  const table = inp.geo === 'dims' ? { bt: inp.vipp.forme.bt, eTab: inp.vipp.forme.hte + inp.vipp.forme.pt * Math.max(inp.vipp.forme.bt / 2 - inp.vipp.forme.b0 / 2 - inp.vipp.forme.gt, 0) / 2, hp: inp.vipp.forme.hp }
    : parts ? { bt: parts[parts.length - 1].b, eTab: parts[parts.length - 1].h, hp: parts.reduce((a, q) => a + q.h, 0) } : null;
  const L0 = inp.local || {};
  if (table && inp.n >= 2) {
    try {
      hourdis = hourdisLocal({ n: inp.n, b1: inp.b1, hd: inp.hd, bt: table.bt, eTab: table.eTab, L: Lmax, roadway: inp.roadway, footways: inp.footways, lines: inp.lines, bands: inp.bands, tRev: L0.tRev, fck: inp.geo === 'dims' ? inp.vipp.beton.fckH : inp.fck, fyk: inp.fyk, c: L0.c, alphaEC: inp.alphaEC, classe: spans[0].classe, mil: inp.mil,
        ...(inp.rail ? { rail: { ...inp.rail, LPhiPoutres: Math.min(...spans.map(q => q.rail.LPhi.LPhi)) },
          bw0: inp.geo === 'dims' ? inp.vipp.forme.b0 : parts ? Math.min(...parts.map(q => q.b)) : inp.b0 } : {}) });
    } catch (e) { hourdis = { erreur: e.message }; }
  }
  {
    const hp = table ? table.hp : (sec.H || 2) - inp.hd, sp = spans.reduce((a, q) => (q.L > a.L ? q : a));
    entretoise = entretoiseVerinage({ ys: bd.ys, RG: sp.beams.map(b => b.V0.G ?? 0), dv: L0.dv, verinsRive: L0.verinsRive, he: Math.max(hp - 0.10, 0.5), te: L0.te, hd: inp.hd, fck: inp.fck, fyk: inp.fyk });
    entretoise.L = sp.L;
  }
  return { inp, sec, spans, lines: inp.rail ? lineReactionsRail(bd, inp.rail) : lineReactions(bd), bd, hourdis, entretoise, rail: !!inp.rail };
}

/**
 * Travée d'un pont à poutres sous rail : efforts par poutre sous les groupes ferroviaires (Φ inclus), combinaisons EN 1990
 * A2 (beamCombinationsRail) et dimensionnement des poutres aux Eurocodes seuls (Fascicule 61 / BAEL / BPEL sans objet).
 */
function traveeRail(S, inp, sec, H, v, vp) {
  const mid = S.deck.beam.sectionIndex(0, 0.5), x0 = S.deck.beam.sectionIndex(0, 0), R = S.rail, groupes = R.groupes;
  const ids = ['G', ...groupes.map(G => G.id)];
  const beams = S.beams.map(b => {
    const c = beamCombinationsRail(b, groupes), MuE = Math.max(...c.ELU);
    const out = { k: b.k, y: b.y, mid: {}, eta: {}, etaL: {}, etaV: {}, V0: {}, MuF: null, MuE, rail: true,
      comb: { ELS_F61: null, ELU_F61: null, ELS_EC: c.ELS_car[mid], FREQ_EC: c.ELS_freq[mid], ELU_EC: c.ELU[mid], gov: c.gov[mid] } };
    for (const id of ids) if (b[id]) { out.mid[id] = b[id].Mmax[mid]; out.eta[id] = b[id].eta; out.etaL[id] = b[id].etaL ?? null; out.etaV[id] = b[id].etaV ?? b[id].eta; out.V0[id] = b[id].Vmax ? Math.max(Math.abs(b[id].Vmax[x0]), Math.abs(b[id].Vmin?.[x0] ?? 0)) : null; }
    out.V0.QeluMax = c.QeluV[x0];
    const d = H - inp.cover;
    if ((inp.type === 'BP' || inp.type === 'PRAD') && inp.geo === 'dims') {
      out.vipp = chaineVIPP({ ...inp.vipp, b1: inp.b1, hd: inp.hd, gExtra: 0 }, S.L, b, { trafic: { Qcar: c.Qcar, Qfreq: c.Qfreq, QeluM: c.QeluM, QeluV: c.QeluV } });
    } else if (inp.type === 'BA') {
      out.BA = { BAEL: null, EC: tBeamULS({ M: MuE, beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'EC' }) };
      const secs = S.deck.beam.sections, half = secs.filter(q => q.x <= S.L / 2 + 1e-9);
      out.BA.travee = half.map((q, i) => {
        const VEd = 1.35 * Math.abs(b.G.Vmax?.[i] ?? 0) + c.QeluV[i];
        const As = tBeamULS({ M: c.ELU[i], beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'EC' });
        return { x: q.x, MEd: c.ELU[i], As: As.As, VEd, V: etriersEC2({ VEd, bw: inp.b0, z: 0.9 * d, fck: inp.fck, fyk: inp.fyk }) };
      });
    } else {
      const base = { A: sec.A, I: sec.I, v, vp, P: inp.P, e0: inp.e0, Mmin: b.G.Mmin[mid], fck: inp.fck };
      const ecQP = prestressCheck({ ...base, Mmax: b.G.Mmax[mid], code: 'EC' }), ecCar = prestressCheck({ ...base, Mmax: c.ELS_car[mid], code: 'EC' });
      out.BP = { BPEL: null, EC: { ...ecQP, enChargeCar: ecCar.enCharge, ok: ecQP.enCharge.inf >= -1e-6 && ecQP.aVide.sup >= -1e-6 && ecCar.enCharge.sup <= ecCar.sigClim + 1e-6 } };
    }
    return out;
  });
  return { L: S.L, theta: S.gp.theta, alpha: S.gp.alpha, Lguyon: S.gp.Lguyon, classe: null, deltaB: null, deltaC: null, beams,
    rail: { params: R.params, voies: R.voies, nV: R.nV, LPhi: R.LPhi, dyn: R.dyn, phi: R.phi, couverture: R.couverture, diffusion: R.diffusion, ecc: R.ecc,
      groupes: groupes.map(G => ({ id: G.id, ref: G.ref, label: G.label, gamma: G.gamma, psi0: G.psi0, psi1: G.psi1, psi2: G.psi2, nArr: G.nArr })),
      horizontal: R.horizontal, avert: R.avert, deformations: deformationsPoutresRail(S, inp, sec) } };
}

/**
 * Déformations et vibrations d'une travée de pont à poutres sous rail (lot 4) : tablier entier = n poutres composites
 * (poutre + hourdis, I de la section de calcul) non fissurées au module instantané E_cm du béton des poutres (limité à
 * C50/60, EN 1991-2 § 6.4.6.3.3) ; flexion horizontale portée par le hourdis seul (h_d (n b₁)³/12, prudent) ; répartition
 * transversale de Guyon-Massonnet du tablier à poutres (dalle orthotrope équivalente, θ et α de la travée) ; amortissement
 * du béton précontraint (VIPP, PRAD, BP) ou du béton armé (tableau 6.6) ; travée indépendante = structure simple (note 1).
 */
function deformationsPoutresRail(S, inp, sec) {
  try {
    const fck = inp.geo === 'dims' ? inp.vipp.beton.fckP : inp.fck, E = ecmDynamique(fck || 35), n = inp.n;
    const files = S.deck.permanentFiles();
    const gPerm = { nom: files.reduce((a, f) => a + f.q, 0), min: files.reduce((a, f) => a + f.q * (f.kmin ?? 1), 0), max: files.reduce((a, f) => a + f.q * (f.kmax ?? 1), 0) };
    const R = S.rail.params, about = R.about;
    const D = deformationsRail(S.deck, S.rail, { EI: E * 1000 * n * sec.I, EIz: E * 1000 * inp.hd * (n * inp.b1) ** 3 / 12, gPerm, eSup: sec.v ?? inp.beam.v ?? 0, abouts: about != null ? [about, about] : [0, 0],
      type: inp.type === 'BA' ? 'beton_arme' : 'precontraint', nT: R.nT, confort: R.confort, LdeltaFig: R.LdeltaFig, simple: true, E, nTravees: inp.spans.length });
    if (about == null) D.avert.push('distance de l\'appareil d\'appui à l\'extrémité du tablier non renseignée : soulèvement δV de l\'extrémité (§ 6.5.4.5.2(3)) non vérifié');
    return D;
  } catch (e) { return { erreur: e.message }; }
}

/** Texte « appuis seuls » (G ; G min ; A ; Bc ; Mc120 ; trottoirs ; TS ; UDL) à partir des réactions par ligne. */
export function linesToStandaloneText(lines) {
  return lines.map(l => [l.G, l.Gmin, l.A, l.Bc, l.Mc120, l.trott, l.TS, l.UDL].map(v => Math.round(v)).join(' ; ')).join('\n');
}
