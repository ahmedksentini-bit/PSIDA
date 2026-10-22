/**
 * Séisme des cadres fermés et portiques enterrés (Eurocode 8), calcul pseudo-statique élastique (q = 1).
 *
 * Action sismique (NF EN 1998-1 et annexe nationale française, arrêté du 26 octobre 2011 pour les ponts) :
 *   a_g = γ_I · a_gR ; amplitude au niveau de l'ouvrage a_g·S. Zone, catégorie et classe de sol comme l'onglet
 *   « Calcul sismique », ou a_g et S saisis directement (hors France).
 *
 * Deux approches complémentaires, dont on retient l'ENVELOPPE (et non la somme) :
 *  A. Forces d'inertie et poussée dynamique (NF EN 1998-2, 6.7 ; NF EN 1998-5, 7.3.2.2 et annexe E) :
 *     k_h = a_g·S/g (ouvrage enterré, r = 1 : il ne peut pas se déplacer), k_v = ±0,5·k_h ;
 *     inertie horizontale de la traverse, du remblai qu'elle porte et des voiles ; incrément de poussée d'une structure
 *     rigide ΔP_d = α·S·γ·H² (annexe E.9), réparti uniformément (α·S·γ·H) sur le piédroit, d'un seul côté ;
 *     composante verticale ±k_v sur les charges permanentes verticales.
 *  B. Déformation imposée par le terrain (méthode de la distorsion, Wang 1993 ; Penzien 2000 ; FHWA-NHI-10-034,
 *     Technical Manual for Design and Construction of Road Tunnels, § 13.5) :
 *     τ_max = (a_g·S/g)·σ_v·r_d (r_d de Seed et Idriss), γ_ff = τ_max/G, Δ_ff = γ_ff·h ;
 *     G = ρ·V_s²·(G/G_max), G/G_max selon NF EN 1998-5 tableau 4.1 ; rigidité de distorsion du cadre K_s (force en tête,
 *     pieds articulés) ; flexibilité F = (G/K_s)(L/h) ; R = 4(1−ν)F/(3 − 4ν + F) (interface sans glissement) ;
 *     Δ_s = R·Δ_ff imposé par une force en tête K_s·Δ_s.
 * Combinaison sismique (NF EN 1990, 6.4.3.4 ; NF EN 1998-2, 4.1.2) : G + P + A_Ed + ψ₂·Q, composantes ± et ±k_v.
 * Unités du module cadre : m, t, t/m² (1 t = 10 kN ; 1 MPa = 101,97 t/m²).
 */
import * as C from './cadre.js';

export const G_ACC = 9.81;
export const T_PAR_MPA = 101.9716;
/** a_gR (m/s²) par zone de sismicité (arrêté du 22 oct. 2010 / 26 oct. 2011, NF EN 1998-1/NA). */
export const AGR = { 1: 0.4, 2: 0.7, 3: 1.1, 4: 1.6, 5: 3.0 };
/** γ_I des ponts par catégorie d'importance (arrêté du 26 oct. 2011, art. 4). */
export const GAMMA_I = { I: 0.0, II: 1.0, III: 1.2, IV: 1.4 };
/** S par classe de sol (arrêté 2011 / NF EN 1998-1/NA) : zones 1 à 4 et zone 5. */
export const S_SOL = { z14: { A: 1, B: 1.35, C: 1.5, D: 1.6, E: 1.8 }, z5: { A: 1, B: 1.2, C: 1.15, D: 1.35, E: 1.4 } };
/** V_s indicatives (m/s) au milieu des fourchettes du tableau 3.1 de NF EN 1998-1, à remplacer par une mesure. */
export const VS_INDICATIF = { A: 900, B: 500, C: 250, D: 150, E: 150 };
/** NF EN 1998-5 tableau 4.1 : (a_g·S/g ; G/G_max). Interpolation linéaire. */
const G_RED = [[0.0, 1.0], [0.10, 0.80], [0.20, 0.50], [0.30, 0.36]];

const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');

export function reductionG(agSg) {
  if (agSg >= G_RED[G_RED.length - 1][0]) return G_RED[G_RED.length - 1][1];
  for (let i = 1; i < G_RED.length; i++) if (agSg <= G_RED[i][0]) { const [a0, r0] = G_RED[i - 1], [a1, r1] = G_RED[i]; return r0 + (r1 - r0) * (agSg - a0) / (a1 - a0); }
  return 1;
}
/** Coefficient de réduction des contraintes r_d (Seed et Idriss 1971), z en m. */
export const rd = z => z <= 9.15 ? 1 - 0.00765 * z : z <= 23 ? 1.174 - 0.0267 * z : 0.744 - 0.008 * z;
/** Rapport de distorsion R (Penzien 2000, sans glissement à l'interface). */
export const rapportDistorsion = (F, nu) => 4 * (1 - nu) * F / (3 - 4 * nu + F);

/** Paramètres de l'action sismique. */
export function actionSismique(s) {
  if (s.mode === 'direct') {
    const ag = s.ag, S = s.S;
    return { ag, S, agS: ag * S, kh: ag * S / G_ACC, classe: s.classeSol, source: `a_g = ${fr(ag)} m/s² et S = ${fr(S)} saisis` };
  }
  const zone = s.zone || 3, cat = s.categorie || 'III', classe = s.classeSol || 'B';
  const gI = GAMMA_I[cat] ?? 1.0, agR = AGR[zone], ag = gI * agR, S = (zone === 5 ? S_SOL.z5 : S_SOL.z14)[classe];
  return { ag, S, agS: ag * S, kh: ag * S / G_ACC, gI, agR, zone, cat, classe, soumis: zone > 1 && cat !== 'I',
    source: `zone ${zone} (a_gR = ${fr(agR)} m/s²), catégorie ${cat} (γ_I = ${fr(gI)}), sol ${classe} (S = ${fr(S)}) : a_g = ${fr(ag)} m/s², a_g·S = ${fr(ag * S)} m/s²` };
}

/**
 * Calcul sismique d'un cadre déjà défini par calculPicf : rend, pour chaque section, les moments et efforts tranchants
 * sismiques enveloppes (combinaison G + P + E), et le détail des deux approches.
 * ctx : { g, geom, h, n, resoudre, ouvert, qTrav, qRem, pNominal (poussée K₀ de la situation sismique), stations, interpoler }
 */
export function calculSismique(ctx, sIn) {
  const { g, geom, h, n, resoudre, ouvert, qTrav, qRem, pMax, pMin, accesseurs, stations, interpoler } = ctx;
  const A = actionSismique(sIn), kh = A.kh, kv = (sIn.kvRapport ?? 0.5) * kh, hc = C.hauteurCalc(g), L = C.largeurCalc(g);
  const notes = [`Action sismique : ${A.source} ; k_h = a_g·S/g = ${fr(kh, 3)}, k_v = ±${fr(sIn.kvRapport ?? 0.5)}·k_h = ${fr(kv, 3)} (NF EN 1998-5, 7.3.2.2, ouvrage enterré r = 1) ; comportement élastique q = 1.`];
  if (A.soumis === false) notes.push('Zone 1 ou catégorie I : ouvrage non soumis aux règles parasismiques (arrêté du 26 octobre 2011) ; calcul mené à titre indicatif.');

  // ── Charges permanentes de la situation sismique : G nominal (remblai ×1,00) et poussée K₀ max ou min ─────────
  const gVert = C.vertical(n, qTrav + qRem);
  // ── A : inertie + poussée dynamique ─────────────────────────────────────────────────────────────────────
  const Htot = geom.Hr + geom.et + geom.H + (ouvert ? 0 : geom.er);                       // hauteur de terre retenue
  const dP = (A.agS / G_ACC) * h.rhoR * Htot;                                             // ΔP_d/H (t/m²), E.9
  const Fi = kh * (qTrav + qRem) * L;                                                      // inertie traverse + remblai (t/ml)
  const voiles = j => ({ voile: j, z0: 0, l: hc, q: kh * h.rhoB * C.epVoile(g, j) });     // inertie des voiles
  const casA = sg => C.plus(C.plus(C.forceTete(n, sg * Fi), C.bandesVoile(n, Array.from({ length: n + 1 }, (_, j) => ({ ...voiles(j), q: sg * voiles(j).q })))),
    C.bandesVoile(n, [{ voile: sg > 0 ? 0 : n, z0: 0, l: hc, q: sg * dP }]));
  const vert = sv => C.vertical(n, sv * kv * (qTrav + qRem));
  notes.push(`Approche A (inertie et poussée dynamique) : inertie de la traverse et du remblai k_h·(${fr(qTrav + qRem, 3)} t/m²)·${fr(L)} m = ${fr(Fi)} t/ml en tête, inertie des voiles k_h·ρ_b·e ; incrément de poussée d'un ouvrage rigide ΔP_d = α·S·γ·H² (NF EN 1998-5, annexe E.9) avec H = ${fr(Htot)} m, soit ${fr(dP, 3)} t/m² uniforme sur un piédroit.`);

  // ── B : distorsion imposée ─────────────────────────────────────────────────────────────────────────────
  const Ei = 11000 * Math.cbrt(h.fc28) * T_PAR_MPA;                                       // module instantané (t/m²)
  const optsB = ouvert ? {} : { rotule: true };
  const unite = C.resoudreCadre(g, C.forceTete(n, 1), null, { ...optsB, ouvert });
  const Ks = Ei * 1 / unite.deriveTete;                                                    // t/m par m d'ouvrage (E = 1 dans le solveur)
  const Vs = sIn.Vs > 0 ? sIn.Vs : VS_INDICATIF[A.classe || 'C'] || 250, nu = sIn.nu ?? 0.35, rho = h.rhoR;     // t/m³
  const Gmax = rho * Vs * Vs / G_ACC, Gred = reductionG(A.agS / G_ACC), Gs = Gmax * Gred;  // t/m²
  const zm = geom.Hr + geom.et + geom.H / 2, sigv = rho * zm, tau = (A.agS / G_ACC) * sigv * rd(zm), gam = tau / Gs, dff = gam * hc;
  const Fl = (Gs / Ks) * (L / hc), R = rapportDistorsion(Fl, nu), ds = R * dff, Pb = Ks * ds;
  notes.push(`Approche B (distorsion imposée, FHWA-NHI-10-034 § 13.5) : V_s = ${Vs.toFixed(0)} m/s${sIn.Vs > 0 ? '' : ' (indicatif, à mesurer)'}, G = ρV_s²·${fr(Gred)} = ${fr(Gs / T_PAR_MPA, 1)} MPa ; à mi-hauteur z = ${fr(zm)} m, τ = ${fr(tau, 3)} t/m² (r_d = ${fr(rd(zm), 3)}), γ_ff = ${(gam * 1e3).toFixed(3).replace('.', ',')} ‰, Δ_ff = ${(dff * 1000).toFixed(2).replace('.', ',')} mm ; K_s = ${fr(Ks, 0)} t/m (E_i = ${(Ei / T_PAR_MPA).toFixed(0)} MPa), F = ${fr(Fl, 3)}, R = ${fr(R, 3)} (ν = ${fr(nu)}), Δ_s = ${(ds * 1000).toFixed(2).replace('.', ',')} mm, force en tête ${fr(Pb)} t/ml.`);

  // ── Combinaisons ─────────────────────────────────────────────────────────────────────────────────────
  const barres = accesseurs(n, !!ouvert);
  const frames = [], noms = [];
  const appr = sIn.approche || 'enveloppe', avecA = appr !== 'B', avecB = appr !== 'A';
  for (const [pNom, P] of [['K₀ max', pMax], ['K₀ min', pMin]])
    for (const sg of [1, -1]) for (const sv of [1, -1]) {
      if (avecA) frames.push({ f: resoudre(C.plus(C.plus(C.plus(gVert, P), casA(sg)), vert(sv))), nom: `A ${sg > 0 ? '+x' : '−x'}, k_v ${sv > 0 ? '+' : '−'}, ${pNom}`, B: null });
      if (avecB) frames.push({ f: resoudre(C.plus(C.plus(gVert, P), vert(sv))), nom: `B ${sg > 0 ? '+x' : '−x'}, k_v ${sv > 0 ? '+' : '−'}, ${pNom}`, B: C.resoudreCadre(g, C.forceTete(n, sg * Pb), null, { ...optsB, ouvert }) });
    }
  const effets = [];
  for (const [nb, get] of barres) for (const [ns, frac] of stations) {
    let Mmax = -Infinity, Mmin = Infinity, Vmax = 0, cMax = '', cMin = '';
    for (const c of frames) {
      const b = get(c.f), s = b.L * frac;
      let [M, V] = interpoler(b.res.diagramme(21), s);
      if (c.B) { const bb = get(c.B), [m2, v2] = interpoler(bb.res.diagramme(21), s); M += m2; V += v2; }
      if (M > Mmax) { Mmax = M; cMax = c.nom; } if (M < Mmin) { Mmin = M; cMin = c.nom; }
      Vmax = Math.max(Vmax, Math.abs(V));
    }
    effets.push({ barre: nb, ou: ns, Mmax, Mmin, V: Vmax, cMax, cMin });
  }
  const parA = effets.filter(e => e.cMax.startsWith('A') || e.cMin.startsWith('A')).length, parB = effets.filter(e => e.cMax.startsWith('B') || e.cMin.startsWith('B')).length;
  notes.push(`Enveloppe retenue : ${appr === 'enveloppe' ? 'approches A et B (la plus défavorable section par section)' : `approche ${appr} seule (choix de l'utilisateur)`} ; ${parA} section(s) commandée(s) par A, ${parB} par B.`);
  if (avecA && geom.Hr > geom.H + geom.et + (ouvert ? 0 : geom.er)) notes.push('Remblai plus épais que l\'ouvrage : l\'approche A, qui reporte toute l\'inertie du remblai sur la traverse, est très prudente ; sous forte couverture, le comportement est commandé par la déformation du terrain (approche B), et retenir « B seule » se justifie.');
  return { action: A, approche: appr, parA, parB, kh, kv, dP, Fi, Ks, Gs, Vs, nu, gam, dff, F: Fl, R, ds, Pb, effets, notes, combinaisons: frames.length };
}
