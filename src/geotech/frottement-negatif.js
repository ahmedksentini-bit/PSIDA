// Copié du dépôt ahmedksentini-bit/fondation (commit 985d215, src/geotech/frottement-negatif.js) — module testé de fond.ksr-infra.org.
// Frottement négatif — méthode de Combarieu.
// Fascicule 62 titre V annexe G.2 ; NF P94-262 annexe H (guide Cerema, chap. 12).
// Les deux textes donnent la même méthode ; la norme ajoute une colonne
// « pieux chemisés au bitume » au tableau de K·tanδ.
//
// Unités : z en m (0 = terrain naturel, positif vers le bas ; le remblai
// traversé par le pieu est au-dessus, z < 0) · contraintes en kPa · forces en kN.

/** Tableau H.2.2.1 (EC7) = tableau de l'annexe G.2 (F62) : K·tanδ. */
export const K_TAN_DELTA = {
  "tourbe": { nom: "Tourbes, sols organiques", tube: 0.10, fore: 0.15, battu: 0.20, bitume: 0.05 },
  "argile-molle": { nom: "Argiles et limons mous", tube: 0.10, fore: 0.15, battu: 0.20, bitume: 0.05 },
  "argile-ferme": { nom: "Argiles et limons fermes à durs", tube: 0.15, fore: 0.20, battu: 0.30, bitume: 0.05 },
  "sable-tres-lache": { nom: "Sables et graves très lâches", tube: 0.35, fore: 0.35, battu: 0.35, bitume: 0.05 },
  "sable-lache": { nom: "Sables et graves lâches", tube: 0.45, fore: 0.45, battu: 0.45, bitume: 0.05 },
  "sable-autre": { nom: "Autres sables et graves", tube: 1.00, fore: 1.00, battu: 1.00, bitume: 0.05 },
};

/** λ d'après K·tanδ (corrélation expérimentale de Combarieu). */
export function lambdaCombarieu(Kt) {
  if (Kt <= 0.15) return 1 / (0.5 + 25 * Kt);
  if (Kt <= 0.385) return 0.385 - Kt;
  return 0;
}

/** μ(λ) = λ²/(1 + λ) pour un pieu isolé. */
export const muIsole = (lambda) => (lambda * lambda) / (1 + lambda);

/**
 * μ(λ, b) pour un pieu au sein d'un groupe illimité (rayon d'influence b) :
 * λ²/[1 + λ − (1 + λ b/R) e^(−λ (b − R)/R)], ou 2/[(b/R)² − 1] si λ = 0.
 */
export function muGroupe(lambda, b, R) {
  if (lambda === 0) return 2 / ((b / R) ** 2 - 1);
  return (lambda * lambda) / (1 + lambda - (1 + (lambda * b) / R) * Math.exp((-lambda * (b - R)) / R));
}

/**
 * Frottement négatif sur un pieu (isolé, ou « en groupe illimité » si b est donné).
 * Entrées :
 *   R : rayon (ou P/2π) ; remblai : { h, gamma } traversé par le pieu (facultatif) ;
 *   q : surcharge uniforme en tête du remblai (kPa) ;
 *   couches : [{ z0, z1, gamma (γ' déjaugé si sous nappe), Kt }] sous le terrain naturel ;
 *   h2 : profondeur (sous le TN) où le tassement libre restant atteint B/100 ;
 *   b : rayon d'influence d'un pieu dans un groupe (facultatif) ;
 *   pas : épaisseur des tranches (m).
 * La contrainte σ'v(z) se calcule de proche en proche (formule de récurrence
 * de l'annexe) ; le frottement est Fn = P ∫ K tanδ σ'v dz sur la hauteur
 * d'action h = min(h1 ; h2), h1 étant la cote où σ'v(z) redescend à σ'v0(z).
 */
export function frottementNegatif({ R, remblai = null, q = 0, couches, h2 = Infinity, b = null, KtRemblai = null, pas = 0.05 }) {
  const P = 2 * Math.PI * R;
  const tri = [...couches].sort((a, c) => a.z0 - c.z0);
  const base = tri[tri.length - 1].z1;
  const hr = remblai?.h ?? 0;
  const tranches = [];
  // Tranches du remblai (z de −hr à 0), puis des couches.
  if (hr > 0) tranches.push({ z0: -hr, z1: 0, gamma: remblai.gamma, Kt: KtRemblai ?? remblai.Kt ?? 1.0, remblai: true });
  for (const c of tri) tranches.push({ ...c });

  let z = -hr, sv = q, s1 = q, s0 = 0; // σ'v, σ'1 (non perturbée), σ'v0 (avant remblai)
  let Fn = 0, FnMax = 0, h1 = null;
  const profil = [{ z, s1, sv, s0 }];
  for (const t of tranches) {
    const Kt = t.Kt;
    const lam = lambdaCombarieu(Kt);
    const mu = b ? muGroupe(lam, b, R) : muIsole(lam);
    const L0 = mu > 0 ? R / (mu * Kt) : Infinity;
    const n = Math.max(1, Math.ceil((t.z1 - t.z0) / pas));
    const dz = (t.z1 - t.z0) / n;
    for (let i = 0; i < n; i++) {
      const pente = t.gamma; // dσ'1/dz
      const svAvant = sv;
      const svApres = Number.isFinite(L0)
        ? L0 * pente + (sv - L0 * pente) * Math.exp(-dz / L0)
        : sv + dz * pente;
      const s1Apres = s1 + pente * dz;
      const s0Apres = t.remblai ? 0 : s0 + pente * dz;
      const zApres = z + dz;
      // Hauteur d'action : sous le TN, dès que σ'v retombe à σ'v0, ou h2.
      const limite = Math.min(h2, base);
      let fin = zApres;
      let arret = false;
      if (!t.remblai && h1 === null && svApres <= s0Apres) {
        // interpolation linéaire du croisement σ'v = σ'v0
        const f0 = svAvant - s0, f1 = svApres - s0Apres;
        const x = f0 / (f0 - f1);
        h1 = z + x * dz;
        fin = Math.min(h1, limite);
        arret = true;
      }
      if (zApres >= limite) { fin = Math.min(fin, limite); arret = true; }
      const frac = (fin - z) / dz;
      if (frac > 0) {
        const svFin = svAvant + (svApres - svAvant) * frac;
        const s1Fin = s1 + (s1Apres - s1) * frac;
        Fn += P * Kt * 0.5 * (svAvant + svFin) * (fin - z);
        FnMax += P * Kt * 0.5 * (s1 + s1Fin) * (fin - z);
      }
      sv = svApres; s1 = s1Apres; s0 = s0Apres; z = zApres;
      profil.push({ z, s1, sv, s0 });
      if (arret) {
        const hAction = Math.min(h1 ?? Infinity, limite);
        let FnBorne = Fn;
        if (b) FnBorne = Math.min(Fn, Math.PI * b * b * (q + (remblai ? remblai.gamma * hr : 0)));
        return { applicable: true, P, h1, h2, hAction, Fn: FnBorne, FnSansBorne: Fn, FnMax, profil, groupe: Boolean(b) };
      }
    }
  }
  const hAction = Math.min(h1 ?? base, h2, base);
  return { applicable: true, P, h1, h2, hAction, Fn, FnSansBorne: Fn, FnMax, profil, groupe: Boolean(b) };
}

/** Rayon d'influence dans un groupe : file unique d/√π, plusieurs files √(d d'/π). */
export const rayonInfluence = ({ d, dPrime = null }) => (dPrime ? Math.sqrt((d * dPrime) / Math.PI) : d / Math.sqrt(Math.PI));

/**
 * Répartition empirique dans un groupe fini (F62 G.2 § 3.1 ; NF P94-262 H.3.1) :
 * file unique : extrémité ⅓ Fn(b) + ⅔ Fn(∞), courant ⅔ Fn(b) + ⅓ Fn(∞) ;
 * plusieurs files : angle 7/12 Fn(b) + 5/12 Fn(∞), bord 5/6 Fn(b) + 1/6 Fn(∞),
 * intérieur Fn(b).
 */
export function repartitionGroupe({ FnIsole, FnGroupe, files = 1 }) {
  if (files === 1) return {
    extremite: FnGroupe / 3 + (2 * FnIsole) / 3,
    courant: (2 * FnGroupe) / 3 + FnIsole / 3,
  };
  return {
    angle: (7 * FnGroupe) / 12 + (5 * FnIsole) / 12,
    bord: (5 * FnGroupe) / 6 + FnIsole / 6,
    interieur: FnGroupe,
  };
}

/**
 * Règles de cumul avec les actions variables.
 *  F62 C.3.3 : Fd = max(Fnd ; FQd) + FGd (effort normal défavorable).
 *  EC7 7.3.3 : Fd = G'd + max(Gsn,d ; Q'd), Q'd = part non quasi permanente.
 */
export const cumulF62 = ({ FGd, FQd, Fnd }) => FGd + Math.max(Fnd, FQd);
export const cumulEC7 = ({ Gd, Qd, Gsnd }) => Gd + Math.max(Gsnd, Qd);
