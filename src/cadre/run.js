/**
 * Onglet « Cadres et portiques » : lecture du formulaire (champs cf_*) et lancement du calcul PICF / PIPO.
 * Biais saisi en grades (100 gr = ouvrage droit), converti en degrés pour le moteur.
 */
import { calculPicf, calculPicfBlocs } from './picf.js';
import { epaisseurPicf } from './details.js';

const num = (v, d = null) => { if (v === undefined || v === null || String(v).trim() === '') return d; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : d; };

export function parseCadre(d) {
  const type = d.cf_type || 'picf', ouvert = type === 'pipo' ? (d.cf_appui || 'encastre') : null;
  const B = num(d.cf_B, 3), eDef = epaisseurPicf(B);
  const geom = {
    nom: d.cf_nom || '', n: Math.max(1, Math.round(num(d.cf_n, 1))), B, H: num(d.cf_H, 2.5), L: num(d.cf_L, 0),
    biais: num(d.cf_biais, 100) * 0.9,
    et: num(d.cf_et, eDef), er: num(d.cf_er, eDef), ep: num(d.cf_ep, eDef), ei: num(d.cf_ei, eDef), Hr: num(d.cf_Hr, 1),
  };
  const hyp = {
    code: d.cf_code === 'EC2' ? 'EC2' : 'BAEL', exposition: d.cf_expo || 'XC2-XC4',
    fc28: num(d.cf_fc28, 25), fe: num(d.cf_fe, 400), sigmaS: num(d.cf_sigmaS, 201.6), enrobage: num(d.cf_enrob, 0.05),
    rhoB: num(d.cf_rhoB, 2.5), rhoR: num(d.cf_rhoR, 2.0), K0max: num(d.cf_K0max, 0.5), K0min: num(d.cf_K0min, 0.25),
    psrem: num(d.cf_psrem, 1.0), qsupMin: num(d.cf_qsupMin, 0), qsupMax: num(d.cf_qsupMax, 0),
    marston: d.cf_marston !== 'non', incompressible: d.cf_fond !== 'compressible', phasage: d.cf_phasage !== 'non',
    classe: Math.round(num(d.cf_classe, 1)), bc: num(d.cf_bc, 1.10), bt: num(d.cf_bt, 1.00), a1: num(d.cf_a1, 1.0), a2: num(d.cf_a2, 1.0),
    systemes: { Al: true, Bc: true, Bt: true, Mc120: d.cf_mc120 !== 'non' },
    sol: d.cf_sol === 'rigide' ? 'rigide' : 'winkler', esol: num(d.cf_esol, 0), nature: d.cf_nature || 'argile', etat: d.cf_etat || 'normal',
    hEau: num(d.cf_hEau, 0), hNappe: num(d.cf_hNappe, 0),
  };
  const opts = {
    ouvert, usage: { franchie: d.cf_franchie || 'eau', portee: d.cf_portee || 'route' },
    rail: { alpha: num(d.cf_alpha, 1.0), entretien: d.cf_entretien === 'soigne' ? 'soigne' : 'normal', longueurTraverse: num(d.cf_ltrav, 2.6), ballast: num(d.cf_ballast, 0.30), sw0: d.cf_sw0 !== 'non', sw2: d.cf_sw2 === 'oui', LPhi: num(d.cf_LPhi, 0) },
    gabarit: { hauteur: num(d.cf_gabH, 0), largeur: num(d.cf_gabL, 0), epaisseurChaussee: num(d.cf_ech, null) ?? undefined },
    choc: { F: num(d.cf_chocF, null) ?? undefined, beff: num(d.cf_chocBeff, 0) },
    seisme: { actif: d.cf_sis === 'oui', mode: d.cf_sisMode === 'direct' ? 'direct' : 'zone', zone: Math.round(num(d.cf_zone, 3)), categorie: d.cf_cat || 'III', classeSol: d.cf_solEC8 || 'B',
      ag: num(d.cf_ag, 1.0), S: num(d.cf_S, 1.2), Vs: num(d.cf_Vs, 0), nu: num(d.cf_nuSol, 0.35), approche: d.cf_sisAppr || 'enveloppe' },
  };
  return { geom, hyp, opts, type };
}

/** Calcul : un PICF de plus de trois cellules est découpé en blocs monolithiques ; un PIPO est calculé d'un seul tenant. */
export function computeCadre(inp) {
  if (inp.type === 'picf') { const r = calculPicfBlocs(inp.geom, inp.hyp, inp.opts); if (r.split.refus) throw new Error(r.split.refus); return { ...r, inp }; }
  return { blocs: [calculPicf(inp.geom, inp.hyp, inp.opts)], split: null, inp };
}
