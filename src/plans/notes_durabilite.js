/**
 * Notes de durabilité des plans, par partie d'ouvrage, à partir du calcul (EN 1992-1-1 § 4.4.1, src/durabilite.js) :
 * classe de béton et classes d'exposition, enrobage nominal c_nom au nu des armatures extérieures (cadres compris),
 * distance de l'axe des aciers longitudinaux retenue par le calcul, recouvrements en diamètres (§ 8.7.3).
 * Les plans d'entreprise relus (autoroute A640, lots 5 à 7) portent ces valeurs par partie : leur absence ou leur
 * dispersion d'une feuille à l'autre est le défaut le plus fréquent relevé.
 */
import { anchorage } from '../rebar.js';

/** Coupe une note en lignes de n caractères au plus (suite indentée de 3 espaces). */
export function couperLigne(t, n = 110) {
  const out = []; let l = '';
  for (const w of t.split(' ')) { if ((l + ' ' + w).trim().length > n) { out.push(l); l = '   ' + w; } else l = (l ? l + ' ' : '') + w; }
  if (l) out.push(l); return out;
}

const fr = (x, d = 1) => x.toFixed(d).replace('.', ',');
const CUBE = { 12: 15, 16: 20, 20: 25, 25: 30, 30: 37, 35: 45, 40: 50, 45: 55, 50: 60, 55: 67, 60: 75 };
export const classeBeton = fck => `C${fck}/${CUBE[fck] ?? Math.round(fck * 1.22)}`;

/** Recouvrements l₀ en diamètres pour les diamètres utilisés : « l₀ = 45 Ø (HA12 à HA16), 52 Ø (HA20) ». */
export function texteRecouvrements(phis, { fck, fyk }) {
  const g = new Map();
  for (const phi of [...new Set(phis)].sort((a, b) => a - b)) { const n = Math.ceil(anchorage(phi, { fck, fyk, h: 1 }).l0 / (phi / 1000) - 1e-9); if (!g.has(n)) g.set(n, []); g.get(n).push(phi); }
  return [...g.entries()].map(([n, ps]) => `${n} Ø (HA${ps.length > 1 ? `${ps[0]} à HA${ps[ps.length - 1]}` : ps[0]})`).join(', ');
}

/** Tablier (dalle) : béton, expositions, c_nom, axe des aciers ; gaines (dalle précontrainte aux Eurocodes). */
export function notesDurabiliteTablier(st) {
  const m = st.p.mat, D = st.durab, Gp = st.psidp && st.psidp.durabGaine;
  const beton = `Béton du tablier : ${classeBeton(m.fck)}${D ? ` — classes d'exposition ${D.expos.join(', ')} (minimum ${D.classeMin}, ${D.ref === 'CN' ? 'NF EN 206/CN' : 'EN 1992-1-1 tableau E.1N'})` : ''}.`;
  const enr = D
    ? `Enrobage nominal c_nom = ${D.cnom} mm au nu des armatures extérieures (EN 1992-1-1 § 4.4.1 : classe ${'S' + D.S}, ${D.vie} ans) ; axe des aciers longitudinaux extérieurs à ${fr(m.c * 100, 1)} cm${D.okEnrobage ? '' : ` — INSUFFISANT, ${fr(D.cAxeMin * 100, 1)} cm requis`}.`
    : `Distance de l'axe des aciers longitudinaux extérieurs au parement : ${fr(m.c * 100, 1)} cm.`;
  return [beton, enr, ...(Gp ? [`Gaines de précontrainte : enrobage ${fr(Gp.enrobage, 0)} mm ≥ c_nom,p = ${Gp.cnom} mm (Ø gaine ; tableau 4.5N).`] : [])];
}

/** Appuis : élévations, semelles, pieux. */
export function notesDurabiliteAppuis(st) {
  const sp = st.p.supports || {}, m = sp.mat || { fck: 25, fyk: 400, c: 0.05 }, D = st.supports && st.supports.durab;
  if (!D) return [`Béton des appuis : ${classeBeton(m.fck)}. Enrobage nominal ${fr(m.c * 100, 1)} cm (${fr(m.c * 100 + 2, 1)} cm contre le sol).`];
  return [
    `Béton des appuis : ${classeBeton(m.fck)} — élévations ${D.elev.expos.join(', ')}, fondations ${D.fond.expos.join(', ')} (minimum ${D.elev.classeMin}) ; béton de propreté C16/20, 10 cm.`,
    `Enrobages nominaux (EN 1992-1-1 § 4.4.1) : élévations ${Math.round(D.c)} mm (c_nom ${D.elev.cnom}) ; semelles ${Math.round(Math.max(D.c + 20, D.cnomSem))} mm (sur béton de propreté, k₁ = 40) ; pieux ${D.cnomPieu} mm (béton au contact du sol, k₂ = 75).`,
  ];
}

/** Couvertures à employer dans les plans des appuis (m) : élévations, faces contre le sol, pieux (au nu des cerces). */
export function enrobagesAppuis(st, mat) {
  const D = st.supports && st.supports.durab, c = mat.c;
  return D ? { c, cS: Math.max(c + 0.02, D.cnomSem / 1000), cP: D.cnomPieu / 1000 } : { c, cS: c + 0.02, cP: 0.07 };
}
