/**
 * Règles de recommandation des appuis et fondations (st.supports.lines[i][ref], ref = 'EC' ou 'BAEL').
 * Recherches « appuis » : seul le calcul des appuis est relancé avec la donnée modifiée.
 */
import { fx } from '../recommandations.js';

const nomLigne = (L, n) => (L.kind === 'culee' ? `Culée C${L.i}` : `Pile P${L.i}`) + (n ? '' : '');
const ligneDe = (st, i, ref) => st.supports && st.supports.lines[i] && st.supports.lines[i][ref];
const pire = (arr, k) => arr.reduce((m, c) => (c[k] != null && !Number.isNaN(c[k]) && (!m || c[k] > m[k]) ? c : m), null);

const NOMS_BRG = { distorsion: 'distorsion ε_q ≤ 1', deformationTotale: 'déformation totale ε_t ≤ 7', flambement: 'flambement', rotation: 'rotation (Σ v_z)', frettes: 'épaisseur des frettes' };

export const reglesAppuis = [
  // ---------------------------------------------------------------- fondations superficielles
  st => {
    const out = [], ref = st._recoRef || 'EC', sp = st.p && st.p.supports;
    if (!st.supports || !sp) return out;
    st.supports.lines.forEach((Lg, i) => {
      const L = Lg[ref]; if (!L || !L.found || L.found.type !== 'superficielle') return;
      const F = L.found, lieu = nomLigne(Lg), B = sp.found.B ?? F.B;   // B vide : largeur dimensionnée de la ligne
      const ok = r => { const f = ligneDe(r, i, ref)?.found; return f && f.worstV <= 1 && f.worstH <= 1 && f.excOk; };
      const rechB = { champ: 'ap_B', min: B, max: Math.max(12, 3 * B), pas: 0.05, vers: 'haut', depart: B, calcul: 'appuis', verifie: ok };
      if (F.worstV > 1) {
        const c = pire(F.checks, 'ratioV');
        out.push({ domaine: 'Fondations superficielles', lieu, verification: 'Portance', constat: F.worstV === Infinity ? 'surface comprimée nulle (résultante hors de la semelle)' : `V/R_v = ${fx(F.worstV)} > 1 (${c ? c.label : ''})`, regle: ref === 'EC' ? 'NF P 94-261' : 'Fascicule 62 V',
          actions: [{ texte: 'Élargir les semelles (largeur B commune à tous les appuis)', champ: 'ap_B', unite: 'm', chercher: rechB },
            { texte: 'Encastrer davantage la semelle (sol de meilleure portance, p*_le plus fort)', champ: 'ap_De', unite: 'm', chercher: { champ: 'ap_De', min: sp.found.De, max: sp.found.De + 4, pas: 0.1, vers: 'haut', depart: sp.found.De, calcul: 'appuis', verifie: ok } },
            { texte: 'Si le bon sol est profond : passer sur pieux (« Type de fondation »)', champ: 'ap_found', valeur: 'pieux', valeurChamp: 'pieux' }] });
      }
      if (F.worstH > 1) {
        const c = pire(F.checks, 'ratioH');
        out.push({ domaine: 'Fondations superficielles', lieu, verification: 'Glissement', constat: F.worstH === Infinity ? 'résistance au glissement nulle (surface comprimée nulle)' : `H/R_h = ${fx(F.worstH)} > 1 (${c ? c.label : ''})`, regle: ref === 'EC' ? 'NF P 94-261' : 'Fascicule 62 V',
          actions: [{ texte: 'Élargir les semelles (poids et surface de contact)', champ: 'ap_B', unite: 'm', chercher: rechB },
            { texte: 'Réduire les efforts horizontaux : répartir le freinage et les déformations (appareils plus souples, point fixe déplacé)', champ: 'xFixed', unite: 'm' },
            { texte: 'Bêche sous semelle ou pieux : à étudier hors PSIDA' }] });
      }
      if (!F.excOk) {
        const c = F.checks.filter(k => k.excOk === false).sort((a, b) => b.e - a.e)[0];
        out.push({ domaine: 'Fondations superficielles', lieu, verification: 'Excentrement (surface comprimée)', constat: `e = ${fx(c ? c.e : NaN)} m sur B = ${fx(B)} m (${c ? c.label : ''})`, regle: ref === 'EC' ? 'NF P 94-261 : 1 − 2e/B ≥ 1/15 (ELU), ≥ 1/2 (ELS)' : 'Fascicule 62 V : 10 % (ELU), 75 % (ELS)',
          actions: [{ texte: 'Élargir les semelles (largeur B commune à tous les appuis)', champ: 'ap_B', unite: 'm', chercher: rechB },
            ...(Lg.kind === 'culee' ? [{ texte: 'Culée « à vide » : réduire la poussée (remblai après pose du tablier) ou décaler la semelle vers le remblai — à étudier' }] : [])] });
      }
      if (F.scour && F.scour.ok === false) out.push({ domaine: 'Fondations superficielles', lieu, verification: 'Affouillement', constat: `D_e = ${fx(F.scour.De)} m ≤ profondeur d'affouillement ${fx(F.scour.dAff)} m`, regle: 'HEC-18, EN 1991-1-6',
        actions: [{ texte: 'Encastrer la semelle sous l\'affouillement', champ: 'ap_De', unite: 'm', valeur: fx(F.scour.dAff + 0.5, 2), valeurChamp: (F.scour.dAff + 0.5).toFixed(2) }, { texte: 'Ou fonder sur pieux', champ: 'ap_found', valeur: 'pieux', valeurChamp: 'pieux' }] });
    });
    return out;
  },
  // ---------------------------------------------------------------- pieux
  st => {
    const out = [], ref = st._recoRef || 'EC', sp = st.p && st.p.supports;
    if (!st.supports || !sp) return out;
    st.supports.lines.forEach((Lg, i) => {
      const L = Lg[ref]; if (!L || !L.found || L.found.type !== 'pieux') return;
      const F = L.found, lieu = nomLigne(Lg), Lp = sp.found.Lpile;
      const cr = F.capRatio || {}, worst = Math.max(...['ELU', 'ELS', 'ACC', 'traction', 'tractionELS', 'QP'].map(k => cr[k]).filter(Number.isFinite), 0);
      const okCap = r => { const f = ligneDe(r, i, ref)?.found; if (!f || !f.capRatio) return false; return ['ELU', 'ELS', 'ACC', 'traction', 'tractionELS', 'QP'].every(k => !(f.capRatio[k] > 1)); };
      if (worst > 1) {
        const k = Object.entries(cr).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1])[0];
        const fiche = F.fiche && Number.isFinite(F.fiche.governing) ? F.fiche.governing : null;
        out.push({ domaine: 'Pieux', lieu, verification: 'Portance des pieux', constat: `rapport ${k ? k[0] : ''} = ${fx(worst)} > 1`, regle: ref === 'EC' ? 'NF P 94-262' : 'Fascicule 62 V annexe C.3',
          actions: [{ texte: 'Allonger les pieux', champ: 'ap_Lpile', unite: 'm', ...(fiche ? { valeur: fx(Math.ceil(fiche * 2) / 2, 1) } : {}), chercher: { champ: 'ap_Lpile', min: Lp, max: Lp + 30, pas: 0.5, vers: 'haut', depart: Lp, calcul: 'appuis', verifie: okCap } },
            { texte: 'Augmenter le nombre de pieux par file', champ: 'ap_nPile', chercher: { champ: 'ap_nPile', min: sp.found.nPile, max: sp.found.nPile + 6, pas: 1, vers: 'haut', depart: sp.found.nPile, calcul: 'appuis', verifie: okCap } },
            { texte: 'Augmenter le diamètre', champ: 'ap_pileD', unite: 'm', chercher: { champ: 'ap_pileD', min: sp.found.pileD, max: 2, pas: 0.1, vers: 'haut', depart: sp.found.pileD, calcul: 'appuis', verifie: okCap } }] });
      }
      if (F.cap && F.cap.applicable === false) out.push({ domaine: 'Pieux', lieu, verification: 'Portance non calculable', constat: F.cap.motif || 'profil de sol insuffisant', actions: [{ texte: 'Compléter le profil pressiométrique jusqu\'à la pointe (champ « Profils »)', champ: 'ap_profil' }] });
      if (F.group && F.group.ratio > 1) out.push({ domaine: 'Pieux', lieu, verification: 'Effet de groupe', constat: `rapport = ${fx(F.group.ratio)} > 1 (C_e = ${fx(F.group.Ce)})`, regle: 'Fascicule 62 V annexe G.1',
        actions: [{ texte: 'Écarter les files', champ: 'ap_sPile', unite: 'm', chercher: { champ: 'ap_sPile', min: sp.found.sPile, max: sp.found.sPile * 3, pas: 0.1, vers: 'haut', depart: sp.found.sPile, calcul: 'appuis', verifie: r => !(ligneDe(r, i, ref)?.found?.group?.ratio > 1) } }, { texte: 'Allonger les pieux', champ: 'ap_Lpile', unite: 'm' }] });
      const sh = F.shear && F.shear.ELU;
      if (sh && sh.ok === false) out.push({ domaine: 'Pieux', lieu, verification: 'Effort tranchant du pieu', constat: sh.tau != null ? `τ = ${fx(sh.tau)} > ${fx(sh.lim)} MPa` : 'V_Ed > V_Rd,max', regle: ref === 'EC' ? 'EN 1992-1-1 § 6.2' : 'BAEL',
        actions: [{ texte: 'Augmenter le diamètre', champ: 'ap_pileD', unite: 'm', chercher: { champ: 'ap_pileD', min: sp.found.pileD, max: 2, pas: 0.1, vers: 'haut', depart: sp.found.pileD, calcul: 'appuis', verifie: r => ligneDe(r, i, ref)?.found?.shear?.ELU?.ok !== false } }, { texte: 'Augmenter le nombre de pieux', champ: 'ap_nPile' }] });
      const tie = F.tie;
      if (tie && tie.hOk === false) out.push({ domaine: 'Pieux', lieu, verification: 'Épaisseur de la semelle sur pieux', constat: `h_s = ${fx(sp.found.hs)} m < ${fx(tie.hmin)} m`, regle: 'PP73 § 4.6.2',
        actions: [{ texte: 'Épaissir la semelle', champ: 'ap_hs', unite: 'm', valeur: fx(Math.ceil(tie.hmin * 20) / 20, 2), valeurChamp: (Math.ceil(tie.hmin * 20) / 20).toFixed(2) }] });
      if (tie && (tie.thetaOk === false || tie.punchOk === false)) out.push({ domaine: 'Pieux', lieu, verification: tie.thetaOk === false ? 'Inclinaison des bielles θ ≥ 45°' : 'Poinçonnement de la semelle', constat: tie.thetaOk === false ? `θ = ${fx(tie.theta, 0)}°` : 'non vérifié', regle: 'PP73 § 4.3',
        actions: [{ texte: 'Épaissir la semelle', champ: 'ap_hs', unite: 'm', chercher: { champ: 'ap_hs', min: sp.found.hs, max: sp.found.hs + 3, pas: 0.05, vers: 'haut', depart: sp.found.hs, calcul: 'appuis', verifie: r => { const t = ligneDe(r, i, ref)?.found?.tie; return !t || (t.thetaOk !== false && t.punchOk !== false && t.hOk !== false); } } }] });
      const bl = F.blev;
      if (bl && bl.dOk === false) out.push({ domaine: 'Pieux', lieu, verification: 'Hauteur utile de la semelle (Blévot)', constat: `d hors de [${fx(bl.dmin)} ; ${fx(bl.dmax)}] m`, regle: 'Blévot, BAEL',
        actions: [{ texte: 'Ajuster l\'épaisseur de la semelle dans la plage', champ: 'ap_hs', unite: 'm', valeur: fx(bl.dmin + 0.1, 2), valeurChamp: (Math.ceil((bl.dmin + 0.1) * 20) / 20).toFixed(2) }] });
      const nf = F.negFr;
      if (nf && Math.max(nf.ratioELU || 0, nf.ratioELS || 0) > 1) out.push({ domaine: 'Pieux', lieu, verification: 'Frottement négatif', constat: `rapport = ${fx(Math.max(nf.ratioELU || 0, nf.ratioELS || 0))} > 1`, regle: 'Fascicule 62 V annexe G.2',
        actions: [{ texte: 'Allonger les pieux', champ: 'ap_Lpile', unite: 'm', chercher: { champ: 'ap_Lpile', min: Lp, max: Lp + 30, pas: 0.5, vers: 'haut', depart: Lp, calcul: 'appuis', verifie: r => { const n = ligneDe(r, i, ref)?.found?.negFr; return !n || Math.max(n.ratioELU || 0, n.ratioELS || 0) <= 1; } } }] });
      if (F.scour && Math.max(F.scour.ratioELU || 0, F.scour.ratioELS || 0) > 1) out.push({ domaine: 'Pieux', lieu, verification: 'Portance après affouillement', constat: `rapport = ${fx(Math.max(F.scour.ratioELU || 0, F.scour.ratioELS || 0))} > 1`, regle: 'HEC-18, EN 1991-1-6',
        actions: [{ texte: 'Allonger les pieux', champ: 'ap_Lpile', unite: 'm', chercher: { champ: 'ap_Lpile', min: Lp, max: Lp + 30, pas: 0.5, vers: 'haut', depart: Lp, calcul: 'appuis', verifie: r => { const s = ligneDe(r, i, ref)?.found?.scour; return !s || Math.max(s.ratioELU || 0, s.ratioELS || 0) <= 1; } } }] });
    });
    return out;
  },
  // ---------------------------------------------------------------- appareils (EN 1337-3) et tête d'appui
  st => {
    const out = [], ref = st._recoRef || 'EC', sp = st.p && st.p.supports;
    if (!st.supports || !sp) return out;
    st.supports.lines.forEach((Lg, i) => {
      const L = Lg[ref]; if (!L) return;
      const lieu = nomLigne(Lg), champ = Lg.kind === 'culee' ? 'brgCul' : 'brgPile';
      const B = L.brg;
      if (B && B.ok === false) {
        const ko = [...(B.rows || []), B.minRot].filter(r => r && r.ok === false);
        const noms = [...new Set(ko.flatMap(r => Object.entries(r.checks || {}).filter(([, v]) => !v).map(([k]) => NOMS_BRG[k] || k)))];
        if (B.slide && B.slide.okGlissement === false) noms.push('non-glissement');
        if (B.slide && B.slide.okPerm === false) noms.push('σ_m,min ≥ 3 MPa');
        const acts = [];
        if (B.proposal && B.proposal.label && B.proposal.label !== B.label) acts.push({ texte: `Retenir l'appareil standard qui vérifie l'EN 1337-3`, champ, valeur: B.proposal.label, valeurChamp: B.proposal.label });
        acts.push({ texte: 'Changer le nombre d\'appareils par ligne (répartition des réactions)', champ: 'nBearings' });
        if (noms.some(n => /distorsion|déformation/.test(n))) acts.push({ texte: 'Réduire les déplacements lents : point fixe au centre de la dilatation', champ: 'xFixed', unite: 'm' });
        out.push({ domaine: 'Appareils d\'appui', lieu, verification: 'Élastomère fretté (EN 1337-3)', constat: `${B.label} : ${noms.join(', ') || 'non vérifié'}${ko[0] ? ` (${ko[0].label})` : ''}`, regle: 'NF EN 1337-3 § 5.3.3, guide Sétra 2007', actions: acts });
      }
      const H = L.headChk;
      if (H) {
        for (const k of ['press', 'pressDiff']) {
          const c = H[k]; if (!c || c.ok !== false) continue;
          out.push({ domaine: 'Têtes d\'appui', lieu, verification: k === 'press' ? 'Pression localisée sous appareil' : 'Pression après diffusion', constat: `σ = ${fx(c.sig)} > ${fx(c.lim)} MPa`, regle: c.rule,
            actions: [{ texte: 'Agrandir le débord des bossages', champ: 'ap_bosDeb', unite: 'm', chercher: { champ: 'ap_bosDeb', min: sp.bossage.debord, max: 0.5, pas: 0.01, vers: 'haut', depart: sp.bossage.debord, calcul: 'appuis', verifie: r => ligneDe(r, i, ref)?.headChk?.[k]?.ok !== false } },
              { texte: 'Béton de bossage plus résistant', champ: 'ap_bosFck', unite: 'MPa', chercher: { champ: 'ap_bosFck', min: sp.bossage.fck || sp.mat.fck, max: 60, pas: 5, vers: 'haut', depart: sp.bossage.fck || sp.mat.fck, calcul: 'appuis', verifie: r => ligneDe(r, i, ref)?.headChk?.[k]?.ok !== false } },
              { texte: 'Appareil de plus grande surface', champ } ] });
        }
        const co = H.corbel;
        if (co && co.okTau === false) out.push({ domaine: 'Têtes d\'appui', lieu, verification: 'Console courte (τ_u)', constat: `τ_u = ${fx(co.tau)} > ${fx(co.tauLim)} MPa`, regle: 'BAEL annexe E.6',
          actions: [{ texte: 'Augmenter la hauteur de la tête en console', champ: 'ap_hcons', unite: 'm', chercher: { champ: 'ap_hcons', min: sp.pile.hcons, max: 3, pas: 0.05, vers: 'haut', depart: sp.pile.hcons, calcul: 'appuis', verifie: r => ligneDe(r, i, ref)?.headChk?.corbel?.okTau !== false } },
            { texte: 'Allonger le voile pour supprimer la console', champ: 'ap_pileLv', unite: 'm' }] });
      }
    });
    return out;
  },
  // ---------------------------------------------------------------- fûts, chevêtres, torsion, avertissements PP73
  st => {
    const out = [], ref = st._recoRef || 'EC', sp = st.p && st.p.supports;
    if (!st.supports || !sp) return out;
    st.supports.lines.forEach((Lg, i) => {
      const L = Lg[ref]; if (!L) return;
      const lieu = nomLigne(Lg), culee = Lg.kind === 'culee';
      const S = L.shaft;
      if (S && (S.ok === false || S.As == null)) {
        const [champ, cur, unite, lib] = culee ? (sp.culee.type === 'remblayee' ? ['ap_em', sp.culee.em, 'm', 'Épaissir le mur de front'] : ['ap_culD', sp.culee.D, 'm', 'Augmenter le diamètre des colonnes']) : (sp.pile.type === 'voile' ? ['ap_pileB', sp.pile.b, 'm', 'Épaissir le voile'] : ['ap_D', sp.pile.D, 'm', 'Augmenter le diamètre des colonnes']);
        out.push({ domaine: 'Piles et fûts', lieu, verification: 'Flexion composée (second ordre compris)', constat: S.As == null ? 'aucune section d\'acier ne suffit' : `A_s requis ${fx(S.AsReq * 1e4, 1)} cm² > maximum ${fx(S.mins.max * 1e4, 1)} cm²`, regle: ref === 'EC' ? 'EN 1992-1-1 § 5.8, 9.5.2' : 'BAEL A.4.4',
          actions: [{ texte: lib, champ, unite, chercher: { champ, min: cur, max: cur * 3, pas: 0.05, vers: 'haut', depart: cur, calcul: 'appuis', verifie: r => { const s = ligneDe(r, i, ref)?.shaft; return s && s.As != null && s.ok !== false; } } },
            ...(culee ? [] : [{ texte: 'Ajouter des colonnes', champ: 'ap_nCol' }]), { texte: 'Béton plus résistant', champ: 'ap_fck', unite: 'MPa' }] });
      }
      const C = L.cap;
      if (C && (C.AsTop === Infinity || C.AsBot === Infinity)) {
        const champ = culee ? 'ap_culHc' : 'ap_hc', cur = culee ? sp.culee.hc : sp.pile.hc;
        out.push({ domaine: 'Piles et fûts', lieu, verification: 'Chevêtre sur colonnes', constat: 'aciers impossibles (section trop faible)', regle: 'PP73 1.3.2 § 2.2.5',
          actions: [{ texte: 'Augmenter la hauteur du chevêtre', champ, unite: 'm', chercher: { champ, min: Math.max(cur, 0.6), max: 3, pas: 0.05, vers: 'haut', depart: Math.max(cur, 0.6), calcul: 'appuis', verifie: r => { const c = ligneDe(r, i, ref)?.cap; return !c || (c.AsTop !== Infinity && c.AsBot !== Infinity); } } },
            { texte: 'Ajouter des colonnes (portées du chevêtre plus courtes)', champ: culee ? 'ap_culNCol' : 'ap_nCol' }] });
      }
      const T = L.torsion;
      if (T && T.ratio > 1) out.push({ domaine: 'Piles et fûts', lieu, verification: 'Torsion du chevêtre de pile-culée', constat: `rapport = ${fx(T.ratio)} > 1`, regle: 'PP73 § 2.2.4',
        actions: [{ texte: 'Augmenter la hauteur du chevêtre', champ: 'ap_culHc', unite: 'm', chercher: { champ: 'ap_culHc', min: sp.culee.hc, max: 3, pas: 0.05, vers: 'haut', depart: sp.culee.hc, calcul: 'appuis', verifie: r => !(ligneDe(r, i, ref)?.torsion?.ratio > 1) } },
          { texte: 'Élargir le chevêtre', champ: 'ap_culLc', unite: 'm', chercher: { champ: 'ap_culLc', min: sp.culee.lc, max: 4, pas: 0.05, vers: 'haut', depart: sp.culee.lc, calcul: 'appuis', verifie: r => !(ligneDe(r, i, ref)?.torsion?.ratio > 1) } }] });
      for (const w0 of Lg.warnings || []) {
        const w = typeof w0 === 'string' ? w0 : (w0.text || JSON.stringify(w0)), F = sp.found, a = [];
        const val = (champ, v, texte, unite = 'm') => a.push({ texte, champ, unite, valeur: fx(v, 2), valeurChamp: String(+v.toFixed(2)) });
        if (/^colonnes Ø/.test(w)) val(culee ? 'ap_culD' : 'ap_D', 0.6, 'Porter le diamètre des colonnes à 0,60 m');
        else if (/^chevêtre/.test(w)) { val(culee ? 'ap_culHc' : 'ap_hc', Math.max(0.6, culee ? sp.culee.hc : sp.pile.hc), 'Hauteur du chevêtre ≥ 0,60 m'); val(culee ? 'ap_culLc' : 'ap_lc', Math.max(0.7, culee ? sp.culee.lc : sp.pile.lc), 'Largeur du chevêtre ≥ 0,70 m'); }
        else if (/^semelle B .*< 1,50/.test(w)) val('ap_B', 1.5, 'Semelle d\'au moins 1,50 m');
        else if (/^file unique/.test(w)) val('ap_pileD', 0.8, 'Pieux de 0,80 m pour une file unique');
        else if (/^entraxe des pieux/.test(w)) { if (F.nFiles > 1) val('ap_sPile', 3 * F.pileD, 'Entraxe des files ≥ 3 Ø'); a.push({ texte: 'Ou réduire le nombre de pieux par file (entraxe dans la file ≥ 3 Ø)', champ: 'ap_nPile' }); }
        else if (/^semelle sur pieux B/.test(w)) val('ap_B', 4.5 * F.pileD, 'Semelle sur pieux B ≥ 4,5 Ø');
        else if (/^garde-grève/.test(w)) a.push({ texte: 'Garde-grève de plus de 3 m : le calculer spécialement (hors ferraillages types), ou réduire sa hauteur', champ: 'ap_hGG', unite: 'm' });
        else if (/^mur en retour/.test(w)) a.push({ texte: 'Raccourcir les murs en retour (≤ 6 m) ou les calculer spécialement', champ: 'ap_Lret', unite: 'm', valeur: '6', valeurChamp: '6' });
        else a.push({ texte: 'Modifier la dimension citée (onglet Appuis et fondations)' });
        out.push({ domaine: 'Règles de conception des appuis (PP73)', lieu, verification: 'Disposition constructive', constat: w, regle: 'PP73', actions: a });
      }
    });
    return out;
  },
  // ---------------------------------------------------------------- séisme (moteur Pont EC8 embarqué, mode fondamental)
  st => {
    const S = st.supports && st.supports.seisme;
    if (!S || !S.conditions) return [];
    return S.conditions.filter(c => !c.respectee).map(c => ({ domaine: 'Séisme (EN 1998-2)', lieu: 'Mode fondamental', verification: c.libelle, constat: c.valeur, regle: 'EN 1998-2 § 4.2.2',
      actions: [...(c.conseils || []).map(t => ({ texte: t })), { texte: 'Calcul complet et note dans l\'onglet Calcul sismique (Pont EC8)' }] }));
  },
];
