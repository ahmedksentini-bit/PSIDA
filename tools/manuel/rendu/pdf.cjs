// PDF du manuel à partir du HTML de pandoc : formules trop larges réduites pour tenir dans la colonne,
// sommaire numéroté (deux passes). Usage : node pdf.cjs dossier/doc.html sortie.pdf
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { execFileSync } = require('child_process');
const fs = require('fs');
const HTML = require('path').resolve(process.argv[2]), OUT = process.argv[3], TMP = OUT.replace(/\.pdf$/, '.pass1.pdf');
const PDF = { format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8pt;width:100%;text-align:center;color:#666">PSIDA — Manuel d\'utilisation · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  margin: { top: '16mm', bottom: '18mm', left: '17mm', right: '17mm' } };
const norm = s => s.replace(/[ \s]+/g, ' ').replace(/[’]/g, "'").trim();
const pagesText = f => { const n = +execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1];
  return Array.from({ length: n }, (_, i) => execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), '-layout', f, '-']).toString().split('\n').map(norm)); };
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 665, height: 1000 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + HTML, { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(3000);
  await p.emulateMedia({ media: 'print' });
  const fit = await p.evaluate(() => {
    // 1. formules en display trop larges : police réduite jusqu'à tenir dans la largeur utile (sinon Chromium réduit toute la page)
    let n = 0;
    for (const d of document.querySelectorAll('.katex-display')) {
      const k = d.querySelector('.katex'); if (!k) continue;
      let fs = 1.21, guard = 0;
      while (k.scrollWidth > d.clientWidth + 1 && guard++ < 40) { fs *= 0.95; k.style.fontSize = fs + 'em'; }
      if (guard) n++;
    }
    // 2. sommaire : titre, points de conduite, numéro de page (provisoire « @@@ »)
    for (const a of document.querySelectorAll('nav#TOC a')) {
      const t = a.textContent.replace(/\s+/g, ' ').trim();
      a.innerHTML = `<span class="t"></span><span class="dots"></span><span class="pg">@@@</span>`; a.querySelector('.t').textContent = t;
    }
    const st = document.createElement('style');
    st.textContent = `nav#TOC { font-size: 10.5pt; } nav#TOC ul { padding-left: 0; } nav#TOC ul ul { padding-left: 14pt; }
      nav#TOC a { display: flex; align-items: baseline; color: #1b1b1b; text-decoration: none; padding: 1.2pt 0; }
      nav#TOC > ul > li > a { font-weight: 700; color: #1F3A5F; margin-top: 5pt; } nav#TOC .t { flex: 0 1 auto; }
      nav#TOC .dots { flex: 1 1 auto; border-bottom: 1px dotted #9aa; margin: 0 5pt; transform: translateY(-3pt); min-width: 12pt; }
      nav#TOC .pg { flex: 0 0 auto; min-width: 2em; text-align: right; font-variant-numeric: tabular-nums; }
      .katex-display { overflow: hidden; }`;
    document.head.appendChild(st);
    return { n, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  const st = await p.evaluate(() => ({ katex: document.querySelectorAll('.katex').length, errs: document.querySelectorAll('.katex-error').length, imgs: [...document.images].filter(i => !i.complete || !i.naturalWidth).length }));
  console.log(JSON.stringify({ ...st, formulesReduites: fit.n, debordement: fit.overflow }), errs.slice(0, 5));
  // passe 1
  await p.pdf({ ...PDF, path: TMP });
  const pages = pagesText(TMP);
  let tocEnd = 0; pages.forEach((ls, i) => { if (ls.some(l => /@@@$/.test(l))) tocEnd = i; });
  const heads = await p.evaluate(() => [...document.querySelectorAll('nav#TOC a')].map(a => { const h = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); return h ? h.textContent : a.textContent; }));
  let cur = tocEnd + 1; const nums = []; let miss = 0;
  for (const h of heads) {
    const key = norm(h).slice(0, 38); let found = -1;
    for (let i = cur; i < pages.length && found < 0; i++) if (pages[i].some(l => l.startsWith(key) || l.includes(' ' + key) && l.indexOf(key) < 12)) found = i;
    if (found < 0) { miss++; nums.push(''); } else { cur = found; nums.push(String(found + 1)); }
  }
  await p.evaluate(nums => { [...document.querySelectorAll('nav#TOC a .pg')].forEach((s, i) => { s.textContent = nums[i]; }); }, nums);
  await p.pdf({ ...PDF, path: OUT });
  const n1 = pages.length, n2 = pagesText(OUT).length;
  fs.unlinkSync(TMP);
  console.log(JSON.stringify({ pages: n2, pass1: n1, tocPages: tocEnd, entries: heads.length, missing: miss }));
  await b.close();
})();
