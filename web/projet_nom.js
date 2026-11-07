/**
 * Nom de fichier d'un projet enregistré : nom de base suivi de la date et de l'heure locales de l'enregistrement,
 * « projet-psida-14-18-14_2026-11-07_09h54.json ». L'horodatage d'un enregistrement précédent est remplacé, pas cumulé.
 */
const HORO = /_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}(?:m\d{2})?$/;
const d2 = n => String(n).padStart(2, '0');

export function horodatage(d = new Date()) {
  return `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}_${d2(d.getHours())}h${d2(d.getMinutes())}`;
}

export function nomAvecHorodatage(nom, d = new Date()) {
  const base = String(nom || 'projet-psida').replace(/\.json$/i, '').replace(/\s*\(\d+\)$/, '').replace(HORO, '') || 'projet-psida';
  return `${base}_${horodatage(d)}.json`;
}
