/**
 * Ponts à poutres sous rail (chantier ponts-rails, lot 3) : groupes ferroviaires de l'EN 1991-2 sur le grillage de
 * Guyon-Massonnet, combinaisons EN 1990 A2, hourdis, réactions par ligne d'appui. Cas calculés à la main
 * indépendamment du code (lignes d'influence de la poutre isostatique, formules de Φ).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePoutres, computePoutres } from '../src/beams/run.js';
import { beamsBlocks, poutresNote } from '../web/beams_view.js';
import { formDefaults } from '../tools/formdefaults.mjs';

const proche = (a, b, tol = 1e-3, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);

// tablier de référence : 4 poutres données par leurs valeurs (pas de chaîne de précontrainte), travée de 25 m
const BASE = { ...formDefaults(), pt_geo: 'valeurs', pt_spans: '25', pt_n: '4', pt_b1: '3.28', pt_hd: '0.30', pt_A: '2.047', pt_I: '1.006057', pt_K: '0.036412',
  pt_v: '0.65', pt_vp: '1.67', pt_H: '2.32', pt_lines: '18 @ -6.87 ; 18 @ 6.87', pt_bands: '10.4 sur -1.8,1.8', pt_P: '6500', pt_e0: '-1.46', pt_type: 'BP' };
const RAIL = { pt_trafic: 'ferroviaire', pt_rail_n: '1', pt_rail_y: '0', pt_rail_alpha: '1', pt_rail_entretien: 'normal', pt_rail_ballast: '0.30', pt_rail_traverse: '2.60', pt_rail_hTrav: '0.22' };

/** Moment maximal à mi-travée d'une poutre isostatique de portée L sous LM71 (α), calculé à la main : ligne
 *  d'influence triangulaire (sommet L/4), un essieu sur la section, les autres à 1,60 m, 80α kN/m hors des 6,40 m. */
function lm71MiTravee(L, alpha = 1) {
  const il = x => (Math.abs(x) <= L / 2 ? (L / 2 - Math.abs(x)) / 2 : 0);
  const aire = (a, b) => { // intégrale exacte de la ligne d'influence sur [a, b] (bornée à la travée)
    const F = x => { const t = Math.max(-L / 2, Math.min(L / 2, x)); return t <= 0 ? (L / 2 * t + t * t / 2) / 2 + L * L / 16 : (L / 2 * t - t * t / 2) / 2 + L * L / 16; };
    return F(b) - F(a);
  };
  let best = 0;
  for (const k of [0, 1, 2, 3]) {      // essieu k au-dessus de la section
    const x0 = -1.6 * k;                // abscisse du premier essieu
    const ess = [0, 1.6, 3.2, 4.8].reduce((s, d) => s + 250 * alpha * il(x0 + d), 0);
    const rep = 80 * alpha * (L * L / 8 - aire(x0 - 0.8, x0 + 5.6));
    best = Math.max(best, ess + rep);
  }
  return best;
}
const phi3 = L => Math.min(Math.max(2.16 / (Math.sqrt(L) - 0.2) + 0.73, 1), 2);

test('Pont à poutres sous rail, 1 voie, 25 m : LM71 à la main, Φ3, part de la poutre la plus chargée', () => {
  const Mmain = lm71MiTravee(25);
  // à la main : essieu 2 sur la section → essieux 250 × (5,45 + 6,25 + 5,45 + 4,65) = 5 450 ; 80 × (78,125 − 34,56) = 3 485,2
  proche(Mmain, 8935.2, 1e-6, 'LM71 à mi-travée (main)');
  proche(phi3(25), 1.18, 1e-9, 'Φ3(25)');
  for (const alpha of [1, 1.21]) {
    const r = computePoutres(parsePoutres({ ...BASE, ...RAIL, pt_rail_alpha: String(alpha) }));
    const s = r.spans[0];
    assert.ok(r.rail && s.rail && s.classe === null);
    proche(s.rail.phi, 1.18, 1e-9, 'Φ retenu (couverture 0,52 m < 1 m)');
    assert.equal(s.rail.LPhi.LPhi, 25);
    // bande au feuillet moyen du hourdis : 2,60 + 2 × 0,30/4 + 0,30 = 3,05 m
    proche(s.rail.diffusion.bw, 3.05, 1e-12, 'b_w');
    // moment de chaque poutre = η_k × Φ × M / n (η_k du module, M calculé à la main)
    for (const b of s.beams) proche(b.mid.rail1, b.eta.rail1 * 1.18 * alpha * Mmain / 4, 2e-3, `poutre ${b.k + 1}, α = ${alpha}`);
    // poutre la plus chargée : une des poutres centrales (voie dans l'axe)
    const gov = s.beams.reduce((a, b) => (b.mid.rail1 > a.mid.rail1 ? b : a));
    assert.ok(gov.k === 1 || gov.k === 2);
    // combinaisons : ELU 1,35 G + 1,45 Q ; fréquente G + 0,8 Q (une voie, tableau A2.3)
    proche(gov.comb.ELU_EC, 1.35 * gov.mid.G + 1.45 * gov.mid.rail1, 1e-9, 'ELU');
    proche(gov.comb.ELS_EC, gov.mid.G + gov.mid.rail1, 1e-9, 'car.');
    proche(gov.comb.FREQ_EC, gov.mid.G + 0.8 * gov.mid.rail1, 1e-9, 'fréq.');
    assert.equal(gov.comb.ELU_F61, null); assert.equal(gov.BP.BPEL, null);
  }
});

test('Pont à poutres sous rail : deux voies, SW/2, γ et ψ des groupes', () => {
  const r = computePoutres(parsePoutres({ ...BASE, ...RAIL, pt_rail_n: '2', pt_rail_entraxe: '4.2', pt_rail_sw2: 'on' }));
  const s = r.spans[0], ids = s.rail.groupes.map(G => G.id);
  assert.deepEqual(ids, ['rail1', 'rail2', 'sw2', 'sw2b']);
  const G = Object.fromEntries(s.rail.groupes.map(g => [g.id, g]));
  assert.deepEqual([G.rail1.gamma, G.rail2.gamma, G.sw2.gamma, G.sw2b.gamma], [1.45, 1.45, 1.2, 1.2]);
  assert.deepEqual([G.rail1.psi1, G.rail2.psi1, G.sw2.psi1, G.sw2b.psi1], [0.8, 0.7, 0.8, 0.7]);
  for (const b of s.beams) {
    const elu = Math.max(...['rail1', 'rail2', 'sw2', 'sw2b'].map(id => G[id].gamma * b.mid[id]));
    proche(b.comb.ELU_EC, 1.35 * b.mid.G + elu, 1e-9, `ELU poutre ${b.k + 1}`);
  }
  // deux voies chargées : plus que une voie pour la poutre la plus chargée
  const gov = s.beams.reduce((a, b) => (b.comb.ELU_EC > a.comb.ELU_EC ? b : a));
  assert.ok(gov.mid.rail2 > gov.mid.rail1);
});

test('Pont à poutres sous rail : réactions par ligne d\'appui, hourdis, note sans mention routière', () => {
  // section par rectangles (le hourdis n'est calculé que si la table de la poutre est connue)
  const r = computePoutres(parsePoutres({ ...BASE, ...RAIL, pt_spans: '25, 25', pt_geo: 'rect', pt_parts: '0.6 0.25 ; 0.25 1.47 ; 1.0 0.3' }));
  // culée, travée de 25 m : essieux sur l'appui 250 × (25 + 23,4 + 21,8 + 20,2)/25 = 904 ;
  // répartie de 5,60 à 25 m : 80 × 19,4²/(2 × 25) = 602,176 → 1 506,176 kN (sans Φ)
  proche(r.lines[0].LM71, 1506.176, 1e-6, 'réaction de culée LM71');
  proche(r.lines[0].LM71phi, 1.18 * 1506.176, 1e-6, 'avec Φ');
  proche(r.lines[2].LM71, r.lines[0].LM71, 1e-9, 'culées symétriques');
  assert.ok(r.lines.every(l => Number.isFinite(l.LM71) && Number.isFinite(l.Qmax)));
  // pile entre deux travées de 25 m (triangle de base 50 m), essieu 2 sur l'appui : 250 × (0,936 + 1 + 0,936 + 0,872) = 936 ;
  // répartie hors de [−2,4 ; 4,0] : 80 × (25 − 2,2848 − 3,68) = 1 522,816 → 2 458,816 kN
  proche(r.lines[1].LM71, 2458.816, 1e-6, 'réaction de pile LM71');
  proche(r.lines[1].G, r.lines[0].G * 2, 1e-9, 'permanentes sur pile');
  // hourdis : coefficient dynamique avec L_Φ = 3 × portée du hourdis, au plus L_Φ des poutres (tableau 6.2, cas 4.1)
  const H = r.hourdis;
  assert.ok(H && !H.erreur && H.rail);
  proche(H.rail.LPhi, Math.min(3 * H.rail.portee, 25), 1e-12, 'L_Φ du hourdis');
  proche(H.rail.phi, phi3(H.rail.LPhi), 1e-12, 'Φ3 du hourdis');
  assert.ok(H.inf.As > 0 && H.sup.As > 0);
  const txt = JSON.stringify(poutresNote(r, { version: 't' })) + JSON.stringify(beamsBlocks(r));
  assert.match(txt, /EN 1991-2/); assert.match(txt, /gestionnaire du réseau/);
  for (const mot of ['Fascicule 61 :', 'gr1a', 'Bc (δ', 'Mc120 (δ', 'UDL', 'tandem', 'chaussée']) assert.ok(!txt.includes(mot), `mention routière « ${mot} » en mode ferroviaire`);
});

test('Pont à poutres routier inchangé par le mode ferroviaire', () => {
  const r = computePoutres(parsePoutres({ ...BASE, pt_spans: '33, 33', pt_bands: '1.79 sur -6.56,6.56', pt_road: '-4, 4', pt_foot: '-6.56,-4 ; 4,6.56' }));
  assert.ok(!r.rail && r.spans[0].classe && r.lines[1].Bc > r.lines[0].Bc);
  assert.ok(r.spans[0].beams.every(b => b.comb.ELU_F61 > 0 && b.comb.ELU_EC > 0 && !b.rail));
});
