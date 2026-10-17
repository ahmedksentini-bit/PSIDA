/**
 * Zonage du ferraillage et dispositions constructives — guide SETRA « Ponts-dalles » (1989) § 3.4.4 à § 3.4.8.
 *
 *  - Chevêtres incorporés (§ 3.4.4) : de part et d'autre de chaque ligne d'appui, longueur mesurée suivant l'axe,
 *    a_i = entraxe des appareils d'appui sur la ligne i, ψ = biais géométrique :
 *      pile-culée (extrémité) : chevêtre = about + a/(3 sin ψ) ; extension = 2a/(3 sin ψ) ;
 *      appui intermédiaire : chevêtre = a/(3 sin ψ) de chaque côté ; extensions = 2a/(3 sin ψ) de chaque côté.
 *    Ferraillages longitudinal, transversal et vertical renforcés ; option 2 → renforts parallèles aux lignes d'appui ;
 *    armatures de poinçonnement près des appareils d'appui.
 *  - Bords libres (§ 3.4.5) : chaînage sur une largeur h le long de chaque bord libre, ≥ 0,9 ‰ par face et par direction,
 *    cadres ≥ 5 cm²/m ; ferraillage local des ancrages de BN4 (dossier GC).
 *  - Angles (§ 3.4.6) : quadrillage ≥ 1,2 ‰ (non-fragilité) par direction si orthogonal, (0,6/sin²(α/2)) ‰ sinon (α angle
 *    entre familles ; la formule redonne 1,2 ‰ à 90°, 2,4 ‰ à 60° et 4,1 ‰ à 45°, exemples du guide).
 *  - Encorbellements (§ 3.4.7) : doubler les aciers transversaux d'encorbellement dans chaque angle sur 1,5 × portée de
 *    l'encorbellement depuis l'about.
 *  - Abouts (§ 3.4.8) : chevêtre d'about, bielle d'about et coin inférieur (cadres verticaux + aciers inférieurs ancrés
 *    au-delà de la ligne d'appui avec retours).
 */

const GR = Math.PI / 200;

/**
 * @param {{spans:number[], overhangs?:number[], width:number, h:number, psi?:number, bearingPitch:number[]|number, optionFers?:1|2|3, angleFers?:number, cantilever?:number}} p
 *   bearingPitch : entraxe des appareils d'appui par ligne (ou valeur unique) ; angleFers : angle entre familles [°]
 */
export function zonage(p) {
  const { spans, width, h, psi = 100 } = p;
  const [aL, aR] = p.overhangs || [0, 0];
  const n = spans.length, sinPsi = Math.sin(psi * GR);
  const x0 = [0]; spans.forEach(L => x0.push(x0[x0.length - 1] + L));
  const pitch = i => (Array.isArray(p.bearingPitch) ? p.bearingPitch[i] : p.bearingPitch) || 0;
  const zones = [];
  x0.forEach((x, i) => {
    const a = pitch(i), c = a / (3 * sinPsi), e = 2 * a / (3 * sinPsi);
    const isL = i === 0, isR = i === n;
    const lab = isL ? 'C0' : isR ? 'C' + i : 'P' + i;
    if (isL) {
      zones.push({ kind: 'chevetre', support: lab, x1: -aL, x2: Math.min(x + c, x0[1]), text: `Chevêtre sur ${lab} : about ${aL.toFixed(2)} + a/(3 sin ψ) = ${c.toFixed(2)} m` });
      zones.push({ kind: 'extension', support: lab, x1: Math.min(x + c, x0[1]), x2: Math.min(x + c + e, x0[1]), text: `Extension de chevêtre sur ${lab} : 2a/(3 sin ψ) = ${e.toFixed(2)} m` });
    } else if (isR) {
      zones.push({ kind: 'chevetre', support: lab, x1: Math.max(x - c, x0[n - 1]), x2: x + aR, text: `Chevêtre sur ${lab} : a/(3 sin ψ) = ${c.toFixed(2)} + about ${aR.toFixed(2)} m` });
      zones.push({ kind: 'extension', support: lab, x1: Math.max(x - c - e, x0[n - 1]), x2: Math.max(x - c, x0[n - 1]), text: `Extension de chevêtre sur ${lab} : ${e.toFixed(2)} m` });
    } else {
      zones.push({ kind: 'chevetre', support: lab, x1: x - c, x2: x + c, text: `Chevêtre sur ${lab} : ± a/(3 sin ψ) = ± ${c.toFixed(2)} m` });
      zones.push({ kind: 'extension', support: lab, x1: x - c - e, x2: x - c, text: `Extension de chevêtre sur ${lab} (côté travée ${i}) : ${e.toFixed(2)} m` });
      zones.push({ kind: 'extension', support: lab, x1: x + c, x2: x + c + e, text: `Extension de chevêtre sur ${lab} (côté travée ${i + 1}) : ${e.toFixed(2)} m` });
    }
  });
  // zones courantes = complément
  const rules = [];
  const option = p.optionFers || (psi >= (p.type === 'DP' ? 70 : 80) ? 1 : 2);   // § 3.4.2, p. 79
  rules.push({ level: 'info', text: `Chevêtres incorporés (§ 3.4.4) : ferraillages longitudinal, transversal et vertical renforcés par rapport aux zones centrales ; concentrations d'efforts près des appareils d'appui ; armatures de poinçonnement (BAEL A.5.2,4 / EC2 6.4) au voisinage des appareils.${option === 2 ? ' Option 2 (fers transversaux non parallèles aux lignes d\'appui) : ajouter dans les chevêtres sur piles-culées des renforts parallèles aux lignes d\'appui (chaînage).' : ''}` });
  const rhoEdge = 0.9e-3, AsEdge = rhoEdge * h * 1e4;
  rules.push({ level: 'info', text: `Bords libres (§ 3.4.5) : chaînage sur une largeur ${h.toFixed(2)} m (= h) le long de chaque bord libre, ≥ 0,9 ‰ par face et par direction = ${AsEdge.toFixed(1)} cm²/m, relié par des cadres ≥ 5 cm²/m ; ferraillage local des ancrages de BN4 selon le dossier GC du SETRA.` });
  const alpha = p.angleFers || (option === 1 ? psi * 0.9 : 90);
  const rhoCorner = 0.6e-3 / Math.pow(Math.sin(alpha / 2 * Math.PI / 180), 2);
  rules.push({ level: alpha < 60 ? 'warn' : 'info', text: `Angles (§ 3.4.6) : quadrillage dans chaque direction ≥ ${(rhoCorner * 1000).toFixed(2)} ‰ de l'aire du béton (${Math.abs(alpha - 90) < 1e-6 ? '1,2 ‰, réseau orthogonal' : `0,6/sin²(α/2) ‰ avec α = ${alpha.toFixed(0)}°`}) = ${(rhoCorner * h * 1e4).toFixed(1)} cm²/m par face ; efforts de cisaillement de torsion croissant avec le biais.` });
  if (p.cantilever > 0) rules.push({ level: 'info', text: `Encorbellements (§ 3.4.7) : doubler les aciers transversaux d'encorbellement dans chaque angle sur 1,5 × ${p.cantilever.toFixed(2)} = ${(1.5 * p.cantilever).toFixed(2)} m depuis l'about ; aciers de liaison encorbellement–nervure (retrait différentiel, encastrement) ; encorbellements massifs à armer longitudinalement comme la nervure.` });
  rules.push({ level: 'info', text: `Abouts (§ 3.4.8) : chevêtre d'about, équilibre de la bielle d'about et du coin inférieur par cadres verticaux et aciers inférieurs ancrés au-delà de la ligne d'appui avec retours (crochets, U) ; longueur d'about ≥ 0,1 + 15 D (§ 3.2).` });
  return { zones, rules, option, alpha, rhoEdge, rhoCorner, x0, sinPsi };
}
