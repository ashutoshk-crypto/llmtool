const SERIES_COLORS = ['--series-1','--series-2','--series-3','--series-4','--series-5','--series-6','--series-7'];

const NAV_LINKS = [
  { href: 'index.html', label: 'Overview' },
  { href: 'platforms.html', label: 'Platforms' },
  { href: 'categories.html', label: 'Categories' },
  { href: 'opportunities.html', label: 'Content Opportunities' },
  { href: 'content-plan.html', label: 'Content Plan' },
  { href: 'responses.html', label: 'All Responses' },
];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function colorForBrand(brand, competitors) {
  const idx = competitors.indexOf(brand);
  if (idx === -1 || idx >= SERIES_COLORS.length) return cssVar('--series-other');
  return cssVar(SERIES_COLORS[idx]);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function renderNav(activeHref) {
  const nav = document.createElement('div');
  nav.className = 'topnav';
  nav.innerHTML = `
    <div class="topnav-inner">
      <a class="topnav-brand" href="index.html">AI Visibility Tracker</a>
      ${NAV_LINKS.map(l => `<a class="nav-link${l.href === activeHref ? ' active' : ''}" href="${l.href}">${esc(l.label)}</a>`).join('')}
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);
}

async function loadData() {
  try {
    const res = await fetch('results.json');
    const data = await res.json();
    if (!data || !data.runs || !data.runs.length) throw new Error('empty');
    data.runs.forEach(r => { if (!r.citations) r.citations = []; });
    return data;
  } catch (e) {
    return { generated_at: new Date().toISOString(), competitors: [], platforms: [], runs: [] };
  }
}

async function loadHistory() {
  try {
    const res = await fetch('history.json');
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('bad shape');
    return data.sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    return [];
  }
}

function setMetaLine(data) {
  const el = document.getElementById('meta-line');
  if (!el) return;
  if (!data.runs.length) {
    el.textContent = 'No results yet — run track.py to generate results.json.';
    return;
  }
  const genDate = new Date(data.generated_at);
  el.textContent = data.runs.length + ' responses, ' + data.platforms.join(', ') + ', generated ' + genDate.toLocaleString();
}

function brandCounts(competitors, runs) {
  const counts = {};
  competitors.forEach(c => counts[c] = 0);
  runs.forEach(r => r.mentions.forEach(m => { if (counts[m] !== undefined) counts[m]++; }));
  return counts;
}

/** Render a multi-series SoV-over-time line chart (percent, 0-100) into containerEl. */
function renderTrendChart(containerEl, history, competitors) {
  if (!history.length) {
    containerEl.innerHTML = '<p class="empty-state">Not enough history yet — run the tracker on more days to build a trend.</p>';
    return;
  }
  if (history.length === 1) {
    containerEl.innerHTML = '<p class="empty-state">Only one snapshot so far (' + esc(history[0].date) + '). Run the tracker again on a later day to see a trend line.</p>';
    return;
  }

  const W = 900, H = 260, padL = 36, padR = 16, padT = 14, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = history.length;
  const x = i => padL + (n === 1 ? 0 : (i / (n - 1)) * plotW);
  const y = pct => padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

  const gridLines = [0, 25, 50, 75, 100].map(pct => `
    <line x1="${padL}" y1="${y(pct)}" x2="${W - padR}" y2="${y(pct)}" stroke="var(--gridline)" stroke-width="1"/>
    <text x="${padL - 8}" y="${y(pct) + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${pct}%</text>
  `).join('');

  const xLabels = history.map((h, i) => {
    if (n > 8 && i % Math.ceil(n / 8) !== 0 && i !== n - 1) return '';
    return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${esc(h.date.slice(5))}</text>`;
  }).join('');

  const lines = competitors.map(c => {
    const pts = history.map((h, i) => [x(i), y(h.pct ? (h.pct[c] || 0) : 0)]);
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const color = colorForBrand(c, competitors);
    const dots = pts.map((p, i) => {
      const pct = history[i].pct ? (history[i].pct[c] || 0) : 0;
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${color}" stroke="var(--surface-1)" stroke-width="1.5"><title>${esc(c)} - ${esc(history[i].date)}: ${pct}%</title></circle>`;
    }).join('');
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>${dots}`;
  }).join('');

  containerEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;" role="img" aria-label="Share of voice over time">
      ${gridLines}
      ${lines}
      ${xLabels}
    </svg>
  `;
}

/** Aggregate every citation URL seen across runs into a ranked source list. */
function aggregateCitations(runs) {
  const byUrl = {};
  runs.forEach(r => {
    (r.citations || []).forEach(c => {
      if (!byUrl[c.url]) {
        byUrl[c.url] = { url: c.url, domain: c.domain, count: 0, prompts: new Set(), categories: new Set(), platforms: new Set() };
      }
      byUrl[c.url].count++;
      byUrl[c.url].prompts.add(r.prompt);
      if (r.category) byUrl[c.url].categories.add(r.category);
      byUrl[c.url].platforms.add(r.platform);
    });
  });
  return Object.values(byUrl)
    .map(s => ({ ...s, prompts: [...s.prompts], categories: [...s.categories], platforms: [...s.platforms] }))
    .sort((a, b) => b.count - a.count);
}
