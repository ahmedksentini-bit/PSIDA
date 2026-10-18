/**
 * Onglet « Poutres » : lecture du formulaire, calcul du tablier à poutres, dimensionnement des poutres et réactions par
 * ligne d'appui (transmises au module « Appuis et fondations » en mode appuis seuls).
 */
import { beamDeck, beamCombinations, beamSection } from './index.js';
import { tBeamULS, prestressCheck, lineReactions } from './design.js';

const nums = s => String(s ?? '').split(/[,;\s]+/).filter(Boolean).map(Number);
const pairs = s => String(s ?? '').split(';').map(t => t.trim()).filter(Boolean).map(t => nums(t));

export function parsePoutres(d) {
  const parts = pairs(d.pt_parts).filter(p => p.length >= 2 && p[0] > 0 && p[1] > 0).map(([b, h]) => ({ b, h }));
  const v = (k, def) => (String(d[k] ?? '').trim() === '' ? def : +d[k]);
  return {
    spans: nums(d.pt_spans), n: v('pt_n', 4), b1: v('pt_b1', 3.28), hd: v('pt_hd', 0.30),
    beam: parts.length ? { parts } : { A: v('pt_A', 1.98), I: v('pt_I', 1.006), K: v('pt_K', 0.0364), v: v('pt_v', 0.65), vp: v('pt_vp', 1.67), H: v('pt_H', 2.32) },
    roadway: (([y1, y2]) => ({ y1, y2 }))(nums(d.pt_road || '-4, 4')),
    footways: pairs(d.pt_foot).filter(p => p.length >= 2).map(([y1, y2]) => ({ y1, y2 })),
    lines: String(d.pt_lines || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const [g, e] = t.split('@').map(Number); return { g, e }; }).filter(l => Number.isFinite(l.g) && Number.isFinite(l.e)),
    bands: String(d.pt_bands || '').split(';').map(t => t.trim()).filter(Boolean).map(t => { const [q, r] = t.split('sur'); const [y1, y2] = nums(r); return { q: +q, y1, y2 }; }).filter(b => Number.isFinite(b.q) && Number.isFinite(b.y1)),
    extraArea: v('pt_extra', 0) / 25,
    nRetenue: v('pt_ret', 0), mil: d.pt_mil || 'Mc120', alphaEC: d.alpha || 'recommended',
    type: d.pt_type || 'BP', fck: v('pt_fck', 35), fyk: v('pt_fyk', 500), b0: v('pt_b0', 0.25), cover: v('pt_cover', 0.12),
    P: v('pt_P', 0), e0: v('pt_e0', -1.46), fpr: v('pt_sp', 1100),
  };
}

export function computePoutres(inp) {
  const bd = beamDeck(inp);
  const sec = bd.sec, H = sec.H || inp.beam.H || 2, v = sec.v ?? inp.beam.v, vp = sec.vp ?? inp.beam.vp;
  const spans = [...bd.bySpan.values()].map(S => {
    const mid = S.deck.beam.sectionIndex(0, 0.5), x0 = S.deck.beam.sectionIndex(0, 0);
    const beams = S.beams.map(b => {
      const c = beamCombinations(b);
      const MuF = Math.max(...c.ELU_F61), MuE = Math.max(...c.ELU_EC);
      const out = { k: b.k, y: b.y, mid: {}, eta: {}, V0: {}, comb: { ELS_F61: c.ELS_F61[mid], ELU_F61: c.ELU_F61[mid], ELS_EC: c.ELS_EC[mid], ELU_EC: c.ELU_EC[mid] }, MuF, MuE };
      for (const id of ['G', 'A', 'Bc', 'Bt', 'Mc120', 'D240', 'trott', 'TS', 'UDL', 'gr1a', 'gr1b']) if (b[id]) { out.mid[id] = b[id].Mmax[mid]; out.eta[id] = b[id].eta; out.V0[id] = b[id].Vmax ? b[id].Vmax[x0] : null; }
      const d = H - inp.cover;
      if (inp.type === 'BA') {
        out.BA = { BAEL: tBeamULS({ M: MuF, beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'BAEL' }), EC: tBeamULS({ M: MuE, beff: inp.b1, hf: inp.hd, b0: inp.b0, d, fck: inp.fck, fyk: inp.fyk, code: 'EC' }) };
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
  return { inp, sec, spans, lines: lineReactions(bd), bd };
}

/** Texte « appuis seuls » (G ; G min ; A ; Bc ; Mc120 ; trottoirs ; TS ; UDL) à partir des réactions par ligne. */
export function linesToStandaloneText(lines) {
  return lines.map(l => [l.G, l.Gmin, l.A, l.Bc, l.Mc120, l.trott, l.TS, l.UDL].map(v => Math.round(v)).join(' ; ')).join('\n');
}
