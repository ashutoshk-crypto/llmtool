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
