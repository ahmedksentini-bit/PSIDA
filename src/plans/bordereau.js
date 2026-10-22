/**
 * Bordereau de façonnage des armatures du tablier (nomenclature) selon l'ISO 4066 et ses codes de forme (identiques
 * à la BS 8666) :
 *   00 droite                       L = A
 *   11 un retour à 90° (barre en L)  L = A + B − 0,5 r − d
 *   21 deux retours à 90° (U)        L = A + B + C − r − 2d
 *   51 cadre fermé à crochets        L = 2 (A + B + C) − 2,5 r − 5d
 *   99 forme spéciale (cerce circulaire de pieu ou de colonne) : A = longueur développée, recouvrement compris
 * Cotes A, B, C hors tout (mm, arrondies à 5 mm) ; r = rayon intérieur de cintrage, mandrin de l'EC2 (§ 8.3 :
 * φm = 4φ pour φ ≤ 16 mm, 7φ au-delà, r = φm / 2) ; longueur de coupe L arrondie aux 25 mm supérieurs.
 * Les barres trop longues pour une seule pièce (repères à plusieurs pièces de PSIDA) sont découpées en sous-repères
 * (7a, 7b…) : pièces d'extrémité avec leur retour, pièces courantes droites, recouvrements compris.
 */
import { massPerM } from '../rebar.js';

export const rayonCintrage = phi => (phi <= 16 ? 4 : 7) * phi / 2;   // mm
const r5 = x => Math.round(x / 5) * 5, r25 = x => Math.ceil(x / 25 - 1e-9) * 25;

/** Longueur de coupe (mm) d'un code de forme. */
export function longueurCoupe(code, { A = 0, B = 0, C = 0 }, phi) {
  const r = rayonCintrage(phi), d = phi;
  if (code === '00') return A;
  if (code === '11') return A + B - 0.5 * r - d;
  if (code === '21') return A + B + C - r - 2 * d;
  if (code === '51') return 2 * (A + B + C) - 2.5 * r - 5 * d;
  if (code === '99') return A;   // forme spéciale (cerce circulaire) : A = longueur développée, recouvrement compris
  throw new Error('code de forme inconnu : ' + code);
}

const lettre = k => String.fromCharCode(97 + k);

/**
 * Lignes du bordereau : { repere, mark, phi, code, A, B, C, L (mm), nombre, total (m), masse (kg), forme, face, role }.
 * `st` : état de calcul (st.rebar.marks, st.deck, st.p.mat).
 */
export function bordereau(st) {
  const marks = (st.rebar && st.rebar.marks) || [], h = st.deck.h, c = st.p.mat.c;
  const hr = (h - 2 * c) * 1000;   // hauteur hors tout d'un retour d'ancrage, d'un cadre, d'une épingle (mm)
  const out = [];
  const ligne = (m, suffixe, code, dims, nombre) => {
    const A = r5(dims.A || 0), B = r5(dims.B || 0), C = r5(dims.C || 0);
    const L = r25(longueurCoupe(code, { A, B, C }, m.phi));
    out.push({ repere: String(m.mark) + suffixe, mark: m.mark, phi: m.phi, code, A, B: code === '00' ? null : B, C: code === '21' || code === '51' ? C : null, L, nombre,
      total: L / 1000 * nombre, masse: L / 1000 * nombre * massPerM(m.phi), face: m.face, dir: m.dir, role: m.role, label: m.label });
  };
  for (const m of marks) {
    const phi = m.phi;
    if (m.dir === 'long') {
      const n = m.pieces || 1, Lp = (m.totalLen / n) * 1000;   // longueur droite d'une pièce, recouvrement compris (mm)
      const hk = [!!m.hookL, !!m.hookR];
      if (n === 1) {
        if (hk[0] && hk[1]) ligne(m, '', '21', { A: hr, B: Lp, C: hr }, m.count);
        else if (hk[0] || hk[1]) ligne(m, '', '11', { A: Lp, B: hr }, m.count);
        else ligne(m, '', '00', { A: Lp }, m.count);
      } else {
        // pièces : première, courantes, dernière (retours aux extrémités ancrées)
        const types = [];
        types.push({ code: hk[0] ? '11' : '00', nb: 1 });
        if (n > 2) types.push({ code: '00', nb: n - 2 });
        types.push({ code: hk[1] ? '11' : '00', nb: 1 });
        // regroupe les pièces identiques (droites sans retour)
        const groupes = [];
        for (const t of types) { const g = groupes.find(q => q.code === t.code && t.code === '00'); if (g) g.nb += t.nb; else groupes.push({ ...t }); }
        groupes.forEach((g, k) => ligne(m, groupes.length > 1 ? lettre(k) : '', g.code, g.code === '11' ? { A: Lp, B: hr } : { A: Lp }, g.nb * m.count));
      }
    } else if (m.dir === 'trans') {
      const ret = 10 * phi, B = m.len * 1000 - 2 * ret;
      ligne(m, '', '21', { A: ret + phi, B, C: ret + phi }, m.count);
    } else if (m.dir === 'cadre') {
      const Bc = Math.max(h - 2 * c, 0.3) * 1000;
      ligne(m, '', '51', { A: hr, B: Bc, C: 10 * phi }, m.count);
    } else if (m.dir === 'vertical') {
      ligne(m, '', '21', { A: 10 * phi, B: hr, C: 10 * phi }, m.count);
    }
  }
  return out;
}

/** Récapitulatif par diamètre : { phi, longueur (m), masse (kg) } et total. */
export function recapitulatif(lignes) {
  const par = new Map();
  for (const l of lignes) { const q = par.get(l.phi) || { phi: l.phi, longueur: 0, masse: 0 }; q.longueur += l.total; q.masse += l.masse; par.set(l.phi, q); }
  const diam = [...par.values()].sort((a, b) => a.phi - b.phi);
  return { diam, masse: diam.reduce((s, q) => s + q.masse, 0), longueur: diam.reduce((s, q) => s + q.longueur, 0) };
}

/**
 * Croquis d'un code de forme dans une case (mm papier) : polylignes et position des lettres A, B, C.
 * Proportions schématiques (non à l'échelle), comme dans les bordereaux usuels.
 */
export function croquisForme(code, [x, y, w, hc]) {
  const m = 2, X0 = x + m + 2, X1 = x + w - m - 2, Y0 = y + 1.6, Y1 = y + hc - 1.6;
  if (code === '00') return { traits: [[[X0, (Y0 + Y1) / 2], [X1, (Y0 + Y1) / 2]]], lettres: [['A', [(X0 + X1) / 2, (Y0 + Y1) / 2 + 1.2]]] };
  if (code === '11') return { traits: [[[X0, Y0], [X1, Y0], [X1, Y1]]], lettres: [['A', [(X0 + X1) / 2, Y0 + 1.2]], ['B', [X1 - 1.6, (Y0 + Y1) / 2]]] };
  if (code === '21') return { traits: [[[X0, Y1], [X0, Y0], [X1, Y0], [X1, Y1]]], lettres: [['A', [X0 + 1.6, (Y0 + Y1) / 2]], ['B', [(X0 + X1) / 2, Y0 + 1.2]], ['C', [X1 - 1.6, (Y0 + Y1) / 2]]] };
  if (code === '51') {
    const Xa = X0 + (X1 - X0) * 0.25, Xb = X1 - (X1 - X0) * 0.25;
    return { traits: [[[Xa + 2, Y1 - 1.4], [Xa, Y1], [Xa, Y0], [Xb, Y0], [Xb, Y1], [Xa, Y1], [Xa + 1.4, Y1 - 2]]], lettres: [['A', [Xa - 1.6, (Y0 + Y1) / 2]], ['B', [(Xa + Xb) / 2, Y0 + 1.2]], ['C', [Xa + 3.4, Y1 - 1.6]]] };
  }
  if (code === '99') {
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, r = Math.min(X1 - X0, Y1 - Y0) / 2 * 0.9, pts = [];
    for (let k = 0; k <= 24; k++) { const a = 2 * Math.PI * k / 22; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return { traits: [pts], lettres: [] };
  }
  return { traits: [], lettres: [] };
}
