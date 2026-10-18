/** Onglet « Dispositifs de retenue » : indice de danger (Cerema 2021) et choix du niveau de retenue. */
import { indiceDanger, RAYONS, chocSurDispositif } from '../src/ddr/indice.js';

const F = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));

export function parseDDR(d) {
  const v = (k, def) => (String(d[k] ?? '').trim() === '' ? def : +d[k]);
  const ref = RAYONS[d.dr_ref] || [null, null];
  return {
    T: v('dr_T', 0), PL: v('dr_PL', 0), typePL: d.dr_typePL || 'moyen', provisoire: !!d.dr_prov,
    R: String(d.dr_R || '').trim() === '' ? Infinity : +d.dr_R, Rm: v('dr_Rm', ref[0] ?? 0), Rdn: v('dr_Rdn', ref[1] ?? 0), existant: !!d.dr_exist,
    pente: v('dr_pente', 0), conflit: !!d.dr_conflit, LF: v('dr_LF', 10), vh: d.dr_vh || 'prioritaire',
    hc: v('dr_hc', 0), P: v('dr_P', 0), Tfranchie: v('dr_Tf', 0), trains: v('dr_trains', 0), habitat: d.dr_hab || 'aucune', zone: d.dr_zone || 'aucune',
    pietons: v('dr_piet', 0), routeImportante: !!d.dr_rimp, vitesse: v('dr_V', 90),
    choc: { classe: d.dr_classe || 'C', hDR: v('dr_hDR', 1.0), eDalle: v('dr_e', 0.25), dEnc: v('dr_dEnc', 1.0) },
  };
}

export function ddrHTML(inp) {
  const r = indiceDanger(inp);
  const lab = { 'ID1.1': 'trafic T15', 'ID1.2': 'tracé en plan', 'ID1.3': 'profil en long', 'ID1.4': 'point de conflit', 'ID1.5': 'longueur de franchissement', 'ID1.6': 'viabilité hivernale',
    'ID2.1': 'hauteur de chute', 'ID2.2': 'hauteur d\'eau', 'ID3.1': 'voie franchie', 'ID3.2': 'voie ferrée', 'ID3.3': 'habitations', 'ID3.4': 'zones sensibles' };
  const rows = Object.entries(r.s).map(([k, v]) => `<tr><td>${k} — ${lab[k]}</td><td>${F(v, 0)}</td></tr>`).join('');
  const choc = chocSurDispositif(inp.choc);
  return `<div class="ddr-res">
  <p style="font-size:18px;margin:4px 0">Indice de danger <strong>ID = ${r.ID}</strong> (${F(r.brut, 2)} arrondi à l'entier supérieur) → niveau de retenue minimal <strong>${r.niveau}</strong>${r.niveau !== r.niveauIndice ? ` (indice seul : ${r.niveauIndice}, relevé par un cas particulier)` : ''}</p>
  ${r.proche ? '<p class="small"><span class="badge warn">À EXAMINER</span> ID au voisinage d\'une borne (18, 26 ou 38) : envisager le niveau supérieur après revue de l\'ensemble des facteurs (§ 2.2.2.8).</p>' : ''}
  <table><thead><tr><th>Sous-indice</th><th>Valeur</th></tr></thead><tbody>${rows}
  <tr><td><strong>ID1</strong> = somme ID1.1 à ID1.6</td><td><strong>${F(r.ID1, 0)}</strong></td></tr>
  <tr><td><strong>ID2</strong> = max(ID2.1 ; ID2.2)</td><td><strong>${F(r.ID2, 0)}</strong></td></tr>
  <tr><td><strong>ID3</strong> = K × max(ID3.1 … ID3.4), K = ${F(r.K, 1)} (PL à 15 ans : ${F(r.PL15, 0)} PL/j)</td><td><strong>${F(r.ID3, 1)}</strong></td></tr>
  <tr><td><strong>ID</strong> = ID1 + max(ID2 ; ID3)</td><td><strong>${r.ID}</strong></td></tr></tbody></table>
  <h3>Cas particuliers et objectifs secondaires</h3><ul class="checks">${[...r.special, ...r.secondaire, ...r.alerts].map(t => `<li>${t}</li>`).join('') || '<li>Aucun.</li>'}</ul>
  <h3>Effort transmis au tablier par le dispositif retenu (EN 1991-2 § 4.7.3.3)</h3>
  <table><tbody><tr><td>Classe de l'effort de choc</td><td>${inp.choc.classe} : F = ${F(choc.F, 0)} kN</td></tr>
  <tr><td>Bras de levier jusqu'au feuillet moyen de la dalle</td><td>${F(choc.h, 2)} m</td></tr>
  <tr><td>Largeur de diffusion à l'encastrement (0,5 m + 2 × ${F(inp.choc.dEnc, 2)} m)</td><td>${F(choc.larg, 2)} m</td></tr>
  <tr><td>Moment d'encastrement accidentel de l'encorbellement</td><td>${F(choc.mHorizontal, 1)} kN·m/m (+ charge verticale concomitante ${F(choc.Fv, 0)} kN → ${F(choc.mVertical, 1)} kN·m/m)</td></tr></tbody></table>
  <p class="small">Méthode : guide méthodologique Cerema « Choix des performances d'un dispositif de retenue sur ouvrage d'art — Méthode de calcul de l'indice de danger » (novembre 2021), tableaux 1 à 18, § 2.2.2 à 2.3 ; il remplace le guide technique SETRA de 2002. Trafics à 15 ans T15 = 1,25 × trafic actuel (ouvrage définitif). Niveaux de retenue de la NF EN 1317-2 (N, H2, H3, H4b ; L = mêmes niveaux avec classe de sévérité améliorée). La classe de l'effort de choc (A 100, B 200, C 400, D 600 kN, valeurs recommandées de l'EN 1991-2 tableau 4.9(n)) dépend du dispositif choisi et de l'annexe nationale : à confirmer avec la fiche du produit.</p>
</div>`;
}
