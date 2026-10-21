/**
 * Règles de recommandation du tablier : diagnostics de conception (guide SETRA 1989), plan de ferraillage,
 * poinçonnement, effort tranchant, appareils d'appui (guide 1989), fatigue, précontrainte.
 * Recherches « complet » : le calcul complet est relancé avec la donnée modifiée (quelques secondes par essai).
 */
import { fx } from '../recommandations.js';

const rechH = (st, verifie, max = 2) => ({ champ: 'h', min: st.deck.h, max, pas: 0.05, vers: 'haut', depart: st.deck.h + 0.05, calcul: 'complet', verifie });

export const reglesTablier = [
  // ---------------------------------------------------------------- conception (guide SETRA « Ponts-dalles » 1989)
  st => {
    const out = [], c = st.concept;
    if (!c || !c.sections) return out;
    const [aL, aR] = st.deck.g.overhangs || [0, 0];
    for (const s of c.sections) for (const it of s.items || []) {
      if (it.level !== 'warn') continue;
      const t = it.text, a = [];
      if (/^About (gauche|droit)/.test(t) && c.abouts) {
        const req = Math.ceil(c.abouts.req * 20) / 20, gauche = /gauche/.test(t);
        const v = gauche ? `${req.toFixed(2)}, ${aR}` : `${aL}, ${req.toFixed(2)}`;
        a.push({ texte: `Porter l'about ${gauche ? 'gauche' : 'droit'} à ${fx(req)} m`, champ: 'overhangs', valeur: v, valeurChamp: v });
      } else if (/épaisseur|élancement/i.test(s.title || '') || /épaisseur/i.test(t)) {
        if (c.epaisseur && st.deck.h < 0.95 * c.epaisseur.h) a.push({ texte: 'Épaissir la dalle à l\'épaisseur du guide', champ: 'h', unite: 'm', valeur: fx(Math.ceil(c.epaisseur.h * 20) / 20), valeurChamp: (Math.ceil(c.epaisseur.h * 20) / 20).toFixed(2) });
        else a.push({ texte: 'Revoir l\'épaisseur (bouton « Rechercher l\'épaisseur » de l\'onglet Conception)', champ: 'h', unite: 'm' });
      } else if (/rive|travure|travées/i.test(t)) a.push({ texte: 'Revoir la travure : travées de rive entre 0,5 et 0,85 fois la travée voisine (variantes et bouton « Adopter » de l\'onglet Conception)', champ: 'spans', unite: 'm' });
      else if (/biais/i.test(t)) a.push({ texte: 'Biais mécanique faible : réduire le biais ou allonger les travées, sinon calculer le tablier en plaque (onglet Projet)', champ: 'methodeTablier', valeur: 'plaque', valeurChamp: 'plaque' });
      else a.push({ texte: 'Voir le diagnostic de l\'onglet Conception' });
      out.push({ domaine: 'Conception (guide SETRA 1989)', lieu: (s.title || '').replace(/\s*\(.*\)$/, ''), verification: 'Règle du guide', constat: t, regle: (s.title || '').match(/\(([^)]*)\)/)?.[1] || 'guide SETRA 1989', actions: a });
    }
    return out;
  },
  // ---------------------------------------------------------------- plan de ferraillage
  st => {
    const out = [];
    if (st.rebarError) out.push({ domaine: 'Tablier', lieu: 'Ferraillage', verification: 'Plan de ferraillage', constat: st.rebarError, regle: 'dispositions courantes, EC2 § 8-9',
      actions: [{ texte: 'Épaissir la dalle', champ: 'h', unite: 'm', chercher: rechH(st, r => !r.rebarError) }, { texte: 'Barres plus grosses', champ: 'phi', unite: 'mm' }, { texte: 'Précontraindre la dalle (onglet Précontrainte)', champ: 'bp_actif' }] });
    const R = st.rebar;
    if (R && R.deficits && R.deficits.length) {
      const d = R.deficits[0];
      out.push({ domaine: 'Tablier', lieu: 'Ferraillage', verification: 'Aciers mis en place ≥ aciers requis', constat: `${R.deficits.length} section(s), par exemple x = ${fx(d.x)} m : inf. ${fx(d.provBot * 1e4, 1)} / ${fx(Math.max(d.reqBot, d.shBot) * 1e4, 1)} cm²/m, sup. ${fx(d.provTop * 1e4, 1)} / ${fx(Math.max(d.reqTop, d.shTop) * 1e4, 1)} cm²/m`, regle: 'EC2 § 8.4, 8.7, épure décalée',
        actions: [{ texte: 'Barres longitudinales plus grosses', champ: 'phi', unite: 'mm' }, { texte: 'Épaissir la dalle', champ: 'h', unite: 'm' }] });
    }
    return out;
  },
  // ---------------------------------------------------------------- poinçonnement et effort tranchant
  st => {
    const out = [], E = st.design && st.design.EC, B = st.design && st.design.F61;
    if (E && E.punch) for (const k of ['LM1', 'LM2']) {
      const p = E.punch[k]; if (!p || p.ok !== false) continue;
      out.push({ domaine: 'Tablier', lieu: 'Dalle', verification: `Poinçonnement sous roue ${k}`, constat: `v_Ed = ${fx(p.vEd, 3)} > v_Rd,c = ${fx(p.vRdc, 3)} MPa`, regle: 'EN 1992-1-1 § 6.4',
        actions: [{ texte: 'Épaissir la dalle', champ: 'h', unite: 'm', chercher: rechH(st, r => r.design.EC.punch[k].ok !== false) }, { texte: 'Béton plus résistant', champ: 'fck', unite: 'MPa' }, { texte: 'Revêtement plus épais (diffusion)', champ: 'tRev', unite: 'm' }] });
    }
    if (B && B.punch) for (const k of ['Br', 'Bc']) {
      const p = B.punch[k]; if (!p || p.ok !== false) continue;
      out.push({ domaine: 'Tablier', lieu: 'Dalle', verification: `Poinçonnement sous roue ${k} (BAEL)`, constat: `Q_u = ${fx(p.Qu, 3)} > ${fx(p.QuLim, 3)} MN`, regle: 'BAEL A.5.2,42',
        actions: [{ texte: 'Épaissir la dalle', champ: 'h', unite: 'm', chercher: rechH(st, r => r.design.F61.punch[k].ok !== false) }, { texte: 'Béton plus résistant', champ: 'fck', unite: 'MPa' }] });
    }
    for (const [ref, dz] of [['EC', E], ['F61', B]]) {
      if (!dz || !dz.shear) continue;
      const ko = dz.shear.map((v, s) => (v.okMax === false ? s : -1)).filter(s => s >= 0);
      if (!ko.length) continue;
      const s = ko[0], v = dz.shear[s], x = st.deck.beam.sections[s].x;
      out.push({ domaine: 'Tablier', lieu: `x = ${fx(x)} m`, verification: `Effort tranchant : bielles (${ref === 'EC' ? 'V_Rd,max' : 'τ_u lim'})`, constat: ref === 'EC' ? `V_Ed = ${fx(v.VEd, 3)} > V_Rd,max = ${fx(v.VRdmax, 3)} MN/m` : `τ_u = ${fx(v.tau)} > ${fx(v.tauMax)} MPa`, regle: ref === 'EC' ? 'EN 1992-1-1 § 6.2.3' : 'BAEL A.5.1,21',
        actions: [{ texte: 'Épaissir la dalle', champ: 'h', unite: 'm', chercher: rechH(st, r => (ref === 'EC' ? r.design.EC : r.design.F61).shear.every(u => u.okMax !== false)) }, { texte: 'Béton plus résistant', champ: 'fck', unite: 'MPa' }] });
    }
    return out;
  },
  // ---------------------------------------------------------------- appareils d'appui (guide 1989, prédimensionnement)
  st => {
    const out = [], B = st.bearings;
    if (!B) return out;
    B.rows.forEach((r, i) => {
      const culee = i === 0 || i === B.rows.length - 1, champ = culee ? 'brgCul' : 'brgPile', lieu = culee ? `Culée C${i}` : `Pile P${i}`;
      if (!r.sel) out.push({ domaine: 'Appareils d\'appui', lieu, verification: 'Choix d\'un appareil standard', constat: `aucun appareil standard ne convient (P_max = ${fx(r.Pmax, 0)} kN, u_g = ${fx(r.ug * 1000, 1)} mm)`, regle: 'guide SETRA 1989 § 3.6',
        actions: [{ texte: 'Plus d\'appareils par ligne', champ: 'nBearings', chercher: { champ: 'nBearings', min: B.nb, max: B.nb + 6, pas: 1, vers: 'haut', depart: B.nb + 1, calcul: 'complet', verifie: s => !!s.bearings.rows[i].sel } },
          { texte: 'Rapprocher le point fixe pour réduire u_g', champ: 'xFixed', unite: 'm' }, { texte: 'Appareils à pot ou glissants (hors gamme PSIDA)' }] });
      else if (r.sel.imposed && !r.sel.ok) {
        const ko = Object.entries(r.sel.checks || {}).filter(([, v]) => !v).map(([k]) => k);
        out.push({ domaine: 'Appareils d\'appui', lieu, verification: 'Appareil imposé (guide 1989)', constat: `${r.sel.label} ne vérifie pas : ${ko.join(', ')}`, regle: 'guide SETRA 1989 § 3.6.1',
          actions: [{ texte: 'Laisser PSIDA choisir l\'appareil (vider le champ)', champ, valeur: '(choix automatique)', valeurChamp: '' }] });
      }
    });
    return out;
  },
  // ---------------------------------------------------------------- fatigue et précontrainte
  st => {
    const out = [], F = st.extra && st.extra.fatigue;
    if (F && F.rows) {
      const ko = F.rows.filter(r => r.ok === false);
      if (ko.length) { const w = ko.sort((a, b) => b.ratio - a.ratio)[0];
        out.push({ domaine: 'Fatigue', lieu: w.label, verification: 'Fatigue des aciers (FLM3)', constat: `Δσ_equ = ${fx(w.dSigEqu, 0)} > ${fx(w.lim, 0)} MPa (rapport ${fx(w.ratio)})`, regle: 'EN 1992-2 annexe NN',
          actions: [{ texte: `Augmenter la section d'acier d'environ ${fx((w.ratio - 1) * 100, 0)} % dans cette zone (barres plus grosses)`, champ: 'phi', unite: 'mm' }, { texte: 'Épaissir la dalle', champ: 'h', unite: 'm', chercher: rechH(st, r => r.extra.fatigue.rows.every(u => u.ok !== false)) }, { texte: 'Revoir les hypothèses de trafic (catégorie, nombre de voies lentes)', champ: 'fatCat' }] }); }
    }
    if (st.psidpError) out.push({ domaine: 'Précontrainte', lieu: 'Dalle', verification: 'Calcul de la précontrainte', constat: st.psidpError, actions: [{ texte: 'Épaissir la dalle', champ: 'h', unite: 'm' }, { texte: 'Unité de précontrainte plus forte', champ: 'bp_unite' }] });
    const P = st.psidp;
    if (P && P.checks) {
      const c = P.checks, ko = [];
      for (const e of c.extremes || []) if (e.ok === false) ko.push('contraintes (classe II)');
      for (const e of c.elu || []) if ((e.min && e.min.ok === false) || (e.max && e.max.ok === false)) ko.push('ELU de flexion');
      for (const e of c.shear || []) if (e.okBeton === false || e.okELS === false) ko.push('effort tranchant');
      if (ko.length) out.push({ domaine: 'Précontrainte', lieu: 'Dalle', verification: 'Justifications BPEL', constat: [...new Set(ko)].join(', ') + ' non vérifié(s)', regle: 'BPEL 91',
        actions: [{ texte: 'Ajouter des câbles', champ: 'bp_n' }, { texte: 'Unité plus forte', champ: 'bp_unite' }, { texte: 'Épaissir la dalle', champ: 'h', unite: 'm' }] });
    }
    return out;
  },
];
