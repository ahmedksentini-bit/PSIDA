/**
 * Onglet « Cadres et portiques » : lecture du formulaire (champs cf_*) et lancement du calcul PICF / PIPO.
 * Biais saisi en grades (100 gr = ouvrage droit), converti en degrés pour le moteur.
 */
import { calculPicf, calculPicfBlocs } from './picf.js';
import { epaisseurPicf } from './details.js';
import { solDepuisProfil } from './solProfil.js';
import { portanceCadre } from './portance.js';

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
      ag: num(d.cf_ag, 1.0), S: num(d.cf_S, 1.2), Vs: num(d.cf_Vs, 0), nu: num(d.cf_nuSol, 0.35), approche: d.cf_sisAppr || 'auto', Tc: num(d.cf_Tc, 0) },
  };
  // Sol : table indicative, ESOL saisi, ou profil d'essais (pressiomètre, pénétromètres statique ou dynamique, SPT)
  const src = d.cf_solSrc || 'table';
  if (src === 'table') hyp.esol = 0;
  if (['pressio', 'cpt', 'dpt', 'spt'].includes(src)) {
    const Bradier = geom.n * geom.B + (geom.n - 1) * geom.ei + 2 * geom.ep;
    const r = solDepuisProfil(src, d.cf_profil || '', Bradier, { rapportQd: num(d.cf_rqd, 0), L: geom.L });
    hyp.notesSol = r.notes;
    if (r.esol > 0) { hyp.esol = r.esol; hyp.esolSource = `ESOL ${r.esol.toFixed(1).replace('.', ',')} MPa tiré du profil ${({ pressio: 'pressiométrique', cpt: 'pénétrométrique statique', dpt: 'pénétrométrique dynamique', spt: 'SPT' })[src]}`; }
    if (r.vs > 0 && !(opts.seisme.Vs > 0)) { opts.seisme.Vs = r.vs; opts.seisme.vsSource = 'profil'; }
    if (r.nature) hyp.natureProfil = r.nature;
  }
  if (['pressio', 'cpt', 'dpt'].includes(src)) opts.portance = { type: src, texte: d.cf_profil || '', rapportQd: num(d.cf_rqd, 0),
    referentiel: d.cf_refGeo === 'F62' ? 'F62' : d.cf_refGeo === 'EC7' ? 'EC7' : (hyp.code === 'EC2' ? 'EC7' : 'F62'),
    D: num(d.cf_Dfond, 0), gamma: num(d.cf_gSol, 20), Bs: num(d.cf_Bsem, 0), hs: num(d.cf_hsem, 0) };
  return { geom, hyp, opts, type };
}

/** Portance (si un profil pressiométrique ou pénétrométrique est fourni) : ajoutée au résultat de chaque bloc. */
function ajouterPortance(r, opts) {
  if (!opts.portance) return r;
  const p = portanceCadre(r, opts.portance);
  r.portance = p;
  r.alertes.push(...p.notes);
  if (p.erreur) r.alertes.push(`Portance non vérifiée : ${p.erreur}.`);
  else {
    for (const v of p.synthese) if (!v.ok) r.reserves.push(`PORTANCE NON VÉRIFIÉE — ${v.fondation}, ${v.etat} : taux ${Number.isFinite(v.taux) ? v.taux.toFixed(2).replace('.', ',') : '∞'} (${v.combinaison}${v.detail ? ', ' + v.detail : ''}). REMÈDE : élargir le radier ou la semelle, descendre l'assise, ou substituer le sol de fondation.`);
    if (!p.ok) { r.ok = false; r.statut = `AVANT-PROJET seulement — ${r.reserves.length} réserve(s) bloquante(s) à lever`; }
  }
  return r;
}

/** Calcul : un PICF de plus de trois cellules est découpé en blocs monolithiques ; un PIPO est calculé d'un seul tenant. */
export function computeCadre(inp) {
  if (inp.type === 'picf') { const r = calculPicfBlocs(inp.geom, inp.hyp, inp.opts); if (r.split.refus) throw new Error(r.split.refus); r.blocs.forEach(b => ajouterPortance(b, inp.opts)); return { ...r, inp }; }
  return { blocs: [ajouterPortance(calculPicf(inp.geom, inp.hyp, inp.opts), inp.opts)], split: null, inp };
}
