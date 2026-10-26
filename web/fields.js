/**
 * Éditeurs de saisie : les champs à valeurs multiples (portées, abouts, trottoirs, charges…) sont saisis valeur par valeur.
 * Le champ d'origine (input caché, même name) reste la donnée du formulaire : FormData, lien partageable (hash), tests et
 * notes ne changent pas. Chaque éditeur réécrit le champ caché à chaque frappe ; une affectation programmée
 * (exemples, lien partagé, `form.spans.value = …`) redessine l'éditeur.
 *
 * data-ed="list"   liste de longueur variable (data-item = préfixe des lignes, data-count = libellé du nombre)
 * data-ed="per"    une valeur par pile (data-per="piles") ou par file de pieux (data-per="files")
 * data-ed="tuple"  nombre fixe de valeurs (data-items="a|b|c", data-fmt="sur" pour « h sur y1,y2 »)
 * data-ed="table"  lignes × colonnes (data-fmt = pairs | lines | bands | lines0 | bands0)
 * data-ed="assign" sondage associé à chaque ligne d'appui (noms lus dans ap_profil)
 * data-ed="water"  piles dans l'eau (cases à cocher)
 * data-show="nom=v1|v2", "nom!=v" ou "nom" (case cochée) : affichage conditionnel d'un bloc.
 */
const NUM = s => String(s ?? '').split(/[,;\s]+/).filter(Boolean);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const VAL = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const SVAL = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const CHK = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');

/* ---------- formats des tableaux ---------- */
const kPart = t => { const m = t.match(/k\s*([\d.]+)\s*\/\s*([\d.]+)/i); return m ? { k: [m[1], m[2]], rest: t.replace(m[0], '') } : { k: ['', ''], rest: t }; };
const FMT = {
  pairs: { parse: s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => NUM(t).slice(0, 2)),
    ser: r => `${r[0]},${r[1]}` },
  lines: { parse: s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => { const { k, rest } = kPart(t); const [g, e] = rest.split('@').map(x => x.trim()); return [g, e, ...k]; }),
    ser: r => `${r[0]} @ ${r[1]}${kSer(r[2], r[3])}` },
  bands: { parse: s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => { const { k, rest } = kPart(t); const [q, y] = rest.split('sur'); const [a, b] = NUM(y); return [(q || '').trim(), a, b, ...k]; }),
    ser: r => `${r[0]} sur ${r[1]},${r[2]}${kSer(r[3], r[4])}` },
  lines0: { parse: s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => t.split('@').map(x => x.trim()).slice(0, 2)), ser: r => `${r[0]}@${r[1]}` },
  bands0: { parse: s => s.split(';').map(t => t.trim()).filter(Boolean).map(t => { const [q, y] = t.split('sur'); const [a, b] = NUM(y); return [(q || '').trim(), a, b]; }),
    ser: r => `${r[0]} sur ${r[1]},${r[2]}` },
};
function kSer(a, b) { a = String(a ?? '').trim(); b = String(b ?? '').trim(); if (!a && !b) return ''; a = a || '1'; b = b || '1'; return a === '1' && b === '1' ? '' : ` k ${a}/${b}`; }

/* ---------- comptages (piles, lignes d'appui, files) ---------- */
function spansOf(form) {
  const sa = form.querySelector('#standalone');
  const v = sa && sa.open ? form.elements.ss_spans.value : form.elements.spans.value;
  return Math.max(1, NUM(v).filter(x => +x > 0).length);
}
const COUNT = {
  piles: f => Math.max(0, spansOf(f) - 1),
  lines: f => spansOf(f) + 1,
  files: f => Math.max(1, Math.round(+f.elements.ap_nFiles.value || 1)),
};
const lineLabels = f => { const n = COUNT.lines(f); return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? `Culée C${i}` : `Pile P${i}`)); };

/* ---------- rendu ---------- */
const row = (cap, inner, cls = '') => `<div class="ed-row ${cls}"><span>${cap}</span>${inner}</div>`;
const inp = (v, i, ph = '', extra = '') => `<input class="ed-in" data-i="${i}" value="${esc(v)}" inputmode="decimal" placeholder="${esc(ph)}"${extra}>`;

function renderList(h, ed) {
  const vals = NUM(VAL.get.call(h));
  const item = h.dataset.item || '', cnt = h.dataset.count || 'Nombre';
  let s = row(cnt, `<span class="ed-count"><button type="button" class="ed-btn" data-act="minus" aria-label="retirer">−</button><b>${vals.length}</b><button type="button" class="ed-btn" data-act="plus" aria-label="ajouter">+</button></span>`, 'ed-head');
  s += `<div class="${h.dataset.compact ? 'ed-grid' : ''}">` + vals.map((v, i) => row(`${item}${i + 1}`, inp(v, i))).join('') + '</div>';
  ed.innerHTML = s;
}
// virgule décimale acceptée (14,5 → 14.5) : la virgule sépare les valeurs dans le champ caché
const dec = v => String(v ?? '').trim().replace(/\s+/g, '').replace(',', '.');
function readList(ed) { return [...ed.querySelectorAll('.ed-in')].map(e => (e.tagName === 'SELECT' ? e.value : dec(e.value))); }

function renderPer(h, ed, form) {
  const n = COUNT[h.dataset.per](form), vals = NUM(VAL.get.call(h)), ph = h.dataset.ph || '';
  if (!n) { ed.innerHTML = '<p class="small">Aucune pile (une seule travée).</p>'; return; }
  const item = h.dataset.item || '';
  // valeur absente : celle de la dernière pile saisie (même règle que le calcul, src/supports/index.js Hpile)
  ed.innerHTML = Array.from({ length: n }, (_, i) => row(`${item}${i + 1}`, inp(vals[i] ?? (ph ? '' : vals[vals.length - 1] ?? ''), i, ph))).join('');
}
function serPer(h, ed) {
  const v = readList(ed); if (h.dataset.ph !== undefined && v.every(x => !x)) return '';
  // une case vide reprend la valeur précédente (une valeur par pile, dans l'ordre)
  for (let i = 0; i < v.length; i++) if (!v[i]) v[i] = i ? v[i - 1] : (v.find(Boolean) || h.dataset.ph || '');
  return v.join(', ');
}

function renderTuple(h, ed) {
  const items = h.dataset.items.split('|'), ph = (h.dataset.ph || '').split('|'), raw = VAL.get.call(h);
  let vals;
  if (h.dataset.fmt === 'sur') { const [a, r] = raw.split('sur'); vals = [(a || '').trim(), ...NUM(r)]; }
  else vals = raw.split(',').map(x => x.trim());
  ed.innerHTML = items.map((c, i) => row(c, inp(vals[i] ?? '', i, ph[i] || ''))).join('');
}
function serTuple(h, ed) {
  const v = readList(ed);
  if (v.every(x => !x)) return '';
  if (h.dataset.fmt === 'sur') return `${v[0]} sur ${v[1]},${v[2]}`;
  return v.join(', ');
}

function renderTable(h, ed) {
  const cols = h.dataset.cols.split('|'), f = FMT[h.dataset.fmt];
  const rows = f.parse(VAL.get.call(h));
  const k = cols.length;
  let s = `<div class="ed-table" style="--nc:${k}"><div class="ed-th">${cols.map(c => `<span>${c}</span>`).join('')}<span></span></div>`;
  rows.forEach((r, j) => { s += `<div class="ed-tr" data-r="${j}">${cols.map((c, i) => inp(r[i] ?? '', i, /^k /.test(c) ? '1' : '')).join('')}<button type="button" class="ed-btn ed-del" data-act="del" aria-label="supprimer la ligne">×</button></div>`; });
  s += `</div><button type="button" class="ed-add" data-act="add">+ ${h.dataset.add || 'Ajouter une ligne'}</button>`;
  ed.innerHTML = s;
}
function serTable(h, ed) {
  const f = FMT[h.dataset.fmt];
  return [...ed.querySelectorAll('.ed-tr')].map(tr => [...tr.querySelectorAll('.ed-in')].map(e => dec(e.value)))
    .filter(r => r.slice(0, 2).every(Boolean)).map(f.ser).join(' ; ');
}

function profileNames(form) {
  const names = [...String(form.elements.ap_profil.value || '').matchAll(/^\s*\[(.+)\]\s*$/gm)].map(m => m[1].trim());
  return names.length ? names : ['SP1'];
}
function renderAssign(h, ed, form) {
  const labs = lineLabels(form), names = profileNames(form), vals = NUM(VAL.get.call(h));
  ed.innerHTML = labs.map((l, i) => { const cur = vals[i] ?? names[0]; // ligne sans sondage : le premier profil (règle du calcul)
    const opts = [...new Set([...names, cur])].map(n => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('');
    return row(l, `<select class="ed-in" data-i="${i}">${opts}</select>`); }).join('');
}
function serAssign(h, ed) { return readList(ed).join(', '); }

function renderWater(h, ed, form) {
  const n = COUNT.piles(form), raw = NUM(VAL.get.call(h)).map(Number);
  if (!n) { ed.innerHTML = '<p class="small">Aucune pile.</p>'; return; }
  const all = !raw.length;
  ed.innerHTML = '<div class="ed-checks">' + Array.from({ length: n }, (_, i) => `<label class="ed-chk"><input type="checkbox" class="ed-in" data-i="${i}"${all || raw.includes(i + 2) ? ' checked' : ''}> P${i + 1}</label>`).join('') + '</div>';
}
function serWater(h, ed) {
  const c = [...ed.querySelectorAll('.ed-in')].map(e => e.checked);
  if (c.every(Boolean)) return '';       // toutes les piles (valeur par défaut du calcul)
  if (!c.some(Boolean)) return '0';      // aucune pile en eau
  return c.map((x, i) => (x ? i + 2 : null)).filter(x => x !== null).join(', '); // numéro de ligne d'appui (C0 = 1)
}

const ED = {
  list: { render: renderList, ser: (h, ed) => readList(ed).filter(Boolean).join(', ') },
  per: { render: renderPer, ser: serPer },
  tuple: { render: renderTuple, ser: serTuple },
  table: { render: renderTable, ser: serTable },
  assign: { render: renderAssign, ser: serAssign },
  water: { render: renderWater, ser: serWater },
};

/* ---------- affichage conditionnel ---------- */
function showRule(form, rule) {
  // règles composées : « a=x&&b!=y||c=z » (OU de ET) ; « | » sépare les valeurs admises d'un même champ
  if (/&&|\|\|/.test(rule)) return rule.split('||').some(t => t.split('&&').every(u => showRule(form, u.trim())));
  const m = rule.match(/^(\w+)\s*(!?=)\s*(.*)$/);
  if (!m) { const el = form.elements[rule]; return !!(el && el.checked); }
  const el = form.elements[m[1]]; if (!el) return true;
  const ok = m[3].split('|').includes(el.value);
  return m[2] === '=' ? ok : !ok;
}

export function enhanceForm(form) {
  const hidden = [...form.querySelectorAll('input[data-ed]')];
  const edOf = new Map();
  const refreshShow = () => form.querySelectorAll('[data-show]').forEach(b => { b.hidden = !showRule(form, b.dataset.show); });
  const renderOne = h => { const ed = edOf.get(h); ED[h.dataset.ed].render(h, ed, form); };
  const dependents = name => hidden.filter(h => (name === 'spans' || name === 'ss_spans') ? ['per', 'assign', 'water'].includes(h.dataset.ed) && h.dataset.per !== 'files'
    : name === 'ap_nFiles' ? h.dataset.per === 'files' : name === 'ap_profil' ? h.dataset.ed === 'assign' : false);
  let syncing = false;
  // éditeur dépendant (piles, lignes, files) : redessiné ; le champ caché n'est complété que s'il manque des valeurs,
  // jamais tronqué (une portée effacée le temps de la retaper ne fait pas perdre les hauteurs de piles)
  const syncDep = d => { renderOne(d); if (d.dataset.ed === 'water') return; const s = ED[d.dataset.ed].ser(d, edOf.get(d)); if (NUM(s).length > NUM(d.value).length) write(d, s); };
  const write = (h, s) => {
    syncing = true; h.value = s; syncing = false;
    dependents(h.name).forEach(syncDep);
  };
  for (const h of hidden) {
    const ed = document.createElement('div');
    ed.className = `ed ed-${h.dataset.ed}`;
    h.after(ed); edOf.set(h, ed);
    Object.defineProperty(h, 'value', { configurable: true, get() { return VAL.get.call(this); },
      set(v) { VAL.set.call(this, v); if (!syncing) { renderOne(this); dependents(this.name).forEach(syncDep); } } });
    renderOne(h);
    ed.addEventListener('input', () => write(h, ED[h.dataset.ed].ser(h, ed)));
    ed.addEventListener('change', () => write(h, ED[h.dataset.ed].ser(h, ed)));
    ed.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b) return;
      ev.preventDefault();
      const act = b.dataset.act;
      if (h.dataset.ed === 'list') {
        const v = readList(ed).filter(Boolean);
        if (act === 'plus') v.push(v[v.length - 1] || '10'); else if (act === 'minus' && v.length > 1) v.pop();
        write(h, v.join(', ')); renderOne(h);
        if (act === 'plus') { const last = [...ed.querySelectorAll('.ed-in')].pop(); last && last.focus(); last && last.select(); }
      } else if (h.dataset.ed === 'table') {
        if (act === 'del') { b.closest('.ed-tr').remove(); write(h, serTable(h, ed)); }
        else if (act === 'add') {
          const t = ed.querySelector('.ed-table'), k = h.dataset.cols.split('|');
          const tr = document.createElement('div'); tr.className = 'ed-tr';
          tr.innerHTML = k.map((c, i) => inp('', i, /^k /.test(c) ? '1' : '')).join('') + '<button type="button" class="ed-btn ed-del" data-act="del" aria-label="supprimer la ligne">×</button>';
          t.appendChild(tr); tr.querySelector('input').focus();
        }
      }
      form.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  // nombres de piles, de lignes, de files, noms des sondages : éditeurs dépendants
  for (const n of ['ap_nFiles', 'ap_profil']) {
    const el = form.elements[n]; if (!el) continue;
    el.addEventListener('input', () => dependents(n).forEach(syncDep));
  }
  const sa = form.querySelector('#standalone');
  if (sa) sa.addEventListener('toggle', () => dependents('spans').forEach(syncDep));
  // affichage conditionnel : saisies et affectations programmées (exemples, lien partagé)
  // champs de pilotage : tous ceux cités dans les règles, composées comprises (« a=x&&b=y||c=z »)
  const ctrl = new Set([...form.querySelectorAll('[data-show]')].flatMap(b => b.dataset.show.split(/&&|\|\|/).map(t => (t.trim().match(/^\w+/) || [])[0]).filter(Boolean)));
  for (const n of ctrl) {
    const el = form.elements[n]; if (!el) continue;
    if (el instanceof HTMLSelectElement) Object.defineProperty(el, 'value', { configurable: true, get() { return SVAL.get.call(this); }, set(v) { SVAL.set.call(this, v); refreshShow(); } });
    else if (el.type === 'checkbox') Object.defineProperty(el, 'checked', { configurable: true, get() { return CHK.get.call(this); }, set(v) { CHK.set.call(this, v); refreshShow(); } });
    // champ caché de pilotage (ouvrage choisi dans le parcours) : affectation programmée sans événement
    else if (el.type === 'hidden' && !el.dataset.ed) Object.defineProperty(el, 'value', { configurable: true, get() { return VAL.get.call(this); }, set(v) { VAL.set.call(this, v); refreshShow(); } });
  }
  form.addEventListener('change', refreshShow);
  form.addEventListener('input', refreshShow);
  refreshShow();
  return { refresh: () => { hidden.forEach(renderOne); refreshShow(); } };
}
