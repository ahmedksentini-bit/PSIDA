/**
 * Contrôles automatiques des plans d'exécution générés (carte « Plans d'exécution ») : défauts relevés sur les plans
 * d'entreprise de l'autoroute A640 (nomenclature d'une pile recopiée de la culée, barre plus longue que sa semelle,
 * enrobages et recouvrements différents d'une feuille à l'autre). Pour chaque contrôle : { objet, controle, valeur,
 * limite, ok }.
 *   - tablier : axe des aciers ≥ c_nom + Ø/2, classe de béton ≥ minimum de durabilité ; barres ≤ 12 m (longueur
 *     commerciale, sinon pièces recouvertes) ; retours, cadres et épingles dans l'épaisseur moins 2 c_nom ;
 *   - appuis (une ligne par appui) : barres ≤ 12 m ; barres de semelle dans la semelle moins 2 enrobages ; cages et
 *     cerces de pieux dans le pieu moins 2 c_nom ; enrobages des plans = c_nom du calcul de durabilité ;
 *   - dalles de transition : flexion et effort tranchant sans armatures, barres ≤ 12 m ;
 *   - mandrins : EC2 § 8.3 (4 Ø jusqu'à Ø16, 7 Ø au-delà) par construction du bordereau.
 */
import { bordereau, longueurCoupe, rayonCintrage } from './bordereau.js';
import { reperesAppui } from './ferraillageAppuis.js';
import { geometrieAppui, appuisDisponibles } from './appuis.js';
import { enrobagesAppuis } from './notes_durabilite.js';
import { culeesAvecDalle, dalleTransitionCulee, reperesDalleTransition } from './dalle_transition.js';

const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');
const LMAX = 12000;

export function controlesPlans(st) {
  const out = [], add = (objet, controle, valeur, limite, ok) => out.push({ objet, controle, valeur, limite, ok });
  // ------------------------------------------------------------ tablier
  const D = st.durab, m = st.p.mat;
  if (D) {
    add('Tablier', 'Classe de béton (durabilité)', `C${D.fck}`, `≥ ${D.classeMin} (${D.expos.join(', ')})`, D.okBeton);
    add('Tablier', 'Axe des aciers extérieurs', `${fr(m.c * 100, 1)} cm`, `≥ c_nom + Ø/2 = ${fr(D.cAxeMin * 100, 1)} cm`, D.okEnrobage);
  }
  if (st.rebar && st.rebar.marks) {
    const L = bordereau(st), longs = L.filter(l => l.code !== '99' && l.L > LMAX + 1e-6);
    add('Tablier', 'Barres ≤ 12 m (longueur commerciale)', `${L.length - longs.length}/${L.length} repères`, longs.length ? `trop longues : ${longs.map(l => l.repere).join(', ')}` : '12 m', !longs.length);
    if (D) {
      const hMax = st.deck.h * 1000 - 2 * D.cnom, hors = L.filter(l => (l.code === '21' || l.code === '51') && l.role !== 'long' && Math.min(l.A || 0, l.C || 1e9) + l.phi > hMax + 1);
      const hr = L.filter(l => l.code === '21' || l.code === '51');
      add('Tablier', 'Retours, cadres, épingles dans h − 2 c_nom', `${hr.length - hors.length}/${hr.length} repères`, `≤ ${fr(hMax / 10, 1)} cm hors tout${hors.length ? ` — dépassent : ${hors.map(l => l.repere).join(', ')}` : ''}`, !hors.length);
    }
  }
  // ------------------------------------------------------------ appuis
  let lignes = [];
  try { lignes = appuisDisponibles(st); } catch (e) { lignes = []; }
  for (const i of lignes) {
    let A, marks;
    try { A = geometrieAppui(st, i); ({ marks } = reperesAppui(st, i)); } catch (e) { add(`Appui ${i}`, 'Repères', '—', e.message, false); continue; }
    const nom = A.nom || `Appui ${i}`, { c, cS, cP } = enrobagesAppuis(st, A.mat), Dd = st.supports.durab;
    const Lc = q => longueurCoupe(q.code, q.dims || {}, q.phi);
    const longs = marks.filter(q => q.code !== '99' && Lc(q) > LMAX + 1e-6);
    add(nom, 'Barres ≤ 12 m (longueur commerciale)', `${marks.length - longs.length}/${marks.length} repères`, longs.length ? `trop longues : ${longs.map(q => q.mark).join(', ')}` : '12 m', !longs.length);
    // semelle : chaque cote hors tout dans la plus grande dimension moins 2 enrobages contre le sol
    if (A.Lf && A.B) {
      const lim = (Math.max(A.Lf, A.B) - 2 * cS) * 1000 + 5, sem = marks.filter(q => q.elem === 'semelle'), hors = sem.filter(q => Math.max(q.dims.A || 0, q.dims.B || 0, q.dims.C || 0) > lim);
      add(nom, 'Barres de semelle dans la semelle', `${sem.length - hors.length}/${sem.length} repères`, `≤ ${fr(lim / 1000)} m${hors.length ? ` — dépassent : ${hors.map(q => q.mark).join(', ')}` : ''}`, !hors.length);
    }
    if (A.pieux) {
      const cer = marks.find(q => q.elem === 'pieux' && q.code === '99');
      if (cer) { const Dmax = A.Dp - 2 * cP, dev = Math.PI * Dmax * 1000; add(nom, 'Cerces des pieux dans Ø − 2 c_nom', `${fr((cer.dims.A || 0) / 1000)} m développés`, `≤ π (Ø − 2 c_nom) + l₀ ≈ ${fr(dev / 1000)} m + recouvrement`, (cer.dims.A || 0) <= dev + 2.5 * 50 * cer.phi + 1); }
    }
    if (Dd) {
      add(nom, 'Enrobages des plans = c_nom du calcul', `${Math.round(c * 1000)} / ${Math.round(cS * 1000)}${A.pieux ? ` / ${Math.round(cP * 1000)}` : ''} mm`, `élévations ${Dd.elev.cnom}, semelles ${Dd.cnomSem}${A.pieux ? `, pieux ${Dd.cnomPieu}` : ''} mm`, c * 1000 >= Dd.elev.cnom - 1e-6 && cS * 1000 >= Dd.cnomSem - 1e-6 && (!A.pieux || cP * 1000 >= Dd.cnomPieu - 1e-6));
    }
  }
  // ------------------------------------------------------------ dalles de transition
  let dts = [];
  try { dts = culeesAvecDalle(st); } catch (e) { dts = []; }
  for (const i of dts) {
    let D, marks;
    try { D = dalleTransitionCulee(st, i); marks = reperesDalleTransition(D); } catch (e) { add(`Dalle de transition ${i}`, 'Calcul', '—', e.message, false); continue; }
    const K = D.K, nom = `Dalle de transition ${D.A.nom}`, longs = marks.filter(q => q.L > LMAX + 1e-6);
    add(nom, 'Flexion (ELU, ELS, fissuration)', `HA${K.inf.phi} e=${fr(K.inf.s * 100, 1)} = ${fr(K.inf.As * 1e4, 1)} cm²/m`, `≥ ${fr(K.As.requis * 1e4, 1)} cm²/m (e = ${fr(D.DT.e)} m)`, K.okAs);
    add(nom, 'Effort tranchant sans armatures', `V_Ed = ${fr(K.V.ELU, 0)} kN/m`, `≤ V_Rd,c = ${fr(K.VRdc, 0)} kN/m`, K.okV);
    add(nom, 'Barres ≤ 12 m (longueur commerciale)', `${marks.length - longs.length}/${marks.length} repères`, '12 m', !longs.length);
    if (D.Kc) add(nom, 'Corbeau (EC2 J.3) : tirant et bielle', `HA${D.Kc.tirant.phi} e=${fr(D.Kc.tirant.s * 100, 0)} ; σ = ${fr(D.Kc.sig, 1)} MPa`, `≥ ${fr(D.Kc.As * 1e4, 2)} cm²/m ; ≤ ${fr(D.Kc.sigRd, 1)} MPa`, D.Kc.ok && D.Kc.tirant.As + 1e-12 >= D.Kc.As);
  }
  add('Bordereaux', 'Mandrins de cintrage (EC2 § 8.3)', `r = ${rayonCintrage(12)} mm (HA12), ${rayonCintrage(20)} mm (HA20)`, '4 Ø jusqu\'à Ø16, 7 Ø au-delà', true);
  return out;
}
