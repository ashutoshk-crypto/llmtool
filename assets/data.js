/* ============================================================
   AI Visibility Tracker — shared data + render helpers
   All data on every page is real, derived from results.json /
   history.json (produced by track.py). No synthetic/mock data.
   Pages with no real data source yet (sub-queries, ad monitoring)
   show an honest empty state instead of fabricating numbers.
   ============================================================ */

const SERIES_COLORS = ['--series-1','--series-2','--series-3','--series-4','--series-5','--series-6','--series-7'];
const OWN_BRAND = 'CoinSwitch';
const OWN_DOMAIN = 'coinswitch.co';
function isOwnDomain(domain) {
  return !!domain && (domain === OWN_DOMAIN || domain.endsWith('.' + OWN_DOMAIN));
}

/** Known competitor domains, for classifying a cited source as Own / Competitor / Third party. */
const COMPETITOR_DOMAINS = {
  'coindcx.com': 'CoinDCX',
  'binance.com': 'Binance',
  'wazirx.com': 'WazirX',
  'zebpay.com': 'Zebpay',
  'delta.exchange': 'Delta Exchange',
  'mudrex.com': 'Mudrex',
};
function sourceTypeForDomain(domain) {
  if (isOwnDomain(domain)) return 'Own';
  const hit = Object.keys(COMPETITOR_DOMAINS).find(d => domain === d || domain.endsWith('.' + d));
  if (hit) return 'Competitor';
  return 'Third party';
}

const NAV_SECTIONS = [
  { kind: 'group', label: 'Analytics', items: [
    { href: 'index.html', label: 'Overview', icon: 'M3 13h4v7H3zm7-6h4v13h-4zm7-4h4v17h-4z' },
    { href: 'prompts.html', label: 'Prompts', icon: 'M4 5h16v11H7l-3 3z' },
    { href: 'sub-queries.html', label: 'Sub-queries', icon: 'M10 4a6 6 0 104.47 10.03l4.25 4.25M10 4a6 6 0 016 6', badge: 'New' },
    { href: 'answers.html', label: 'Answers', icon: 'M4 5h16v11H7l-3 3z' },
    { href: 'citations.html', label: 'Citations', icon: 'M9 5H5v14h14v-4M14 4h6v6M20 4l-9 9' },
    { href: 'own-pages.html', label: 'Own-page tracking', icon: 'M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z' },
    { href: 'competitors.html', label: 'Competitors', icon: 'M4 6h16M4 12h16M4 18h10' },
    { href: 'ad-monitoring.html', label: 'Ad monitoring', icon: 'M3 11l18-7-7 18-2-8-8-2z' },
  ]},
  { kind: 'group', label: 'Configuration', items: [
    { href: '#', label: 'Settings & integrations', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z', disabled: true },
  ]},
  { kind: 'single', href: 'task-board.html', label: 'Task board', icon: 'M4 5h16v14H4zM4 10h16M9 5v14' },
];
// flat list kept for pages that still reference NAV_LINKS
const NAV_LINKS = NAV_SECTIONS.flatMap(s => s.kind === 'single' ? [s] : s.items);

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

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/** Deterministic hash → pick one of the series colors, for things that aren't in `competitors`. */
function colorForString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return cssVar(SERIES_COLORS[h % SERIES_COLORS.length]);
}

function logoFallback(img, initialsText, color, lg) {
  const span = document.createElement('span');
  span.className = 'initial-circle' + lg;
  span.style.background = color;
  span.textContent = initialsText;
  img.parentElement.replaceWith(span);
}
const COMPETITOR_LOGOS = {
  'CoinDCX': 'icons/coindcx.png',
  'Binance': 'icons/binance.png',
  'WazirX': 'icons/wazirx.png',
  'Zebpay': 'icons/zebpay.png',
  'Delta Exchange': 'icons/delta-exchange.png',
  'Mudrex': 'icons/mudrex.png',
};
function brandInitialsHTML(name, competitors, size) {
  const lg = size === 'lg' ? ' lg' : '';
  if (name === OWN_BRAND) {
    return `<span class="brand-logo-circle${lg}"><img src="icons/cs_mark.svg" alt="CoinSwitch" /></span>`;
  }
  const color = competitors ? colorForBrand(name, competitors) : colorForString(name);
  const logo = COMPETITOR_LOGOS[name];
  if (logo) {
    return `<span class="brand-logo-circle competitor${lg}"><img src="${logo}" alt="${esc(name)}" onerror="logoFallback(this,'${esc(initials(name)).replace(/'/g, "\\'")}','${color}','${lg}')" /></span>`;
  }
  return `<span class="initial-circle${lg}" style="background:${color}">${esc(initials(name))}</span>`;
}

const PLATFORM_COLORS = { ChatGPT: '#3FB950', Gemini: '#5B9BF8', Claude: '#D97757', 'Google AI Overview': '#F4B400' };
function platformIconHTML(platform) {
  const color = PLATFORM_COLORS[platform] || colorForString(platform);
  return `<span class="platform-icon" style="background:${color}" title="${esc(platform)}">${esc((platform || '?')[0])}</span>`;
}
function platformStackHTML(platforms, max) {
  max = max || 3;
  const shown = platforms.slice(0, max);
  const rest = platforms.length - shown.length;
  return `<span class="platform-stack">${shown.map(platformIconHTML).join('')}${rest > 0 ? `<span class="platform-overflow">+${rest}</span>` : ''}</span>`;
}

/* ---------------- Status chips ---------------- */
function chip(label, variant) {
  return `<span class="chip chip-${variant}">${esc(label)}</span>`;
}
function ownOrCompetitorChip(isOwn) {
  return isOwn ? chip('Own', 'own') : chip('Competitor', 'competitor');
}
function yesNoChip(val) {
  return val ? chip('Yes', 'yes') : chip('No', 'no');
}
function sourceTypeChip(type) {
  return chip(type, 'neutral');
}
function intentChip(intent) {
  return chip(intent, 'neutral');
}
function newBadge() {
  return '<span class="chip chip-new">New</span>';
}

/* ---------------- App shell ---------------- */
function renderNav(activeHref, opts) {
  opts = opts || {};
  document.body.classList.add('has-sidebar');

  const toggle = document.createElement('button');
  toggle.className = 'sidebar-toggle';
  toggle.setAttribute('aria-label', 'Toggle navigation');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  document.body.insertBefore(toggle, document.body.firstChild);

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';

  function renderItem(item) {
    if (item.disabled) {
      return `<span class="nav-link-disabled" title="Not available in this demo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"/></svg>
        <span>${esc(item.label)}</span>
      </span>`;
    }
    return `<a class="nav-link${item.href === activeHref ? ' active' : ''}" href="${item.href}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"/></svg>
      <span>${esc(item.label)}</span>
      ${item.badge ? `<span class="nav-badge-new">${esc(item.badge)}</span>` : ''}
    </a>`;
  }

  const sectionsHTML = NAV_SECTIONS.map(s => {
    if (s.kind === 'single') {
      return `<div class="sidebar-nav">${renderItem(s)}</div>`;
    }
    return `
      <div>
        <div class="sidebar-group-label">${esc(s.label)}</div>
        <div class="sidebar-nav">${s.items.map(renderItem).join('')}</div>
      </div>
    `;
  }).join('');

  const nav = document.createElement('div');
  nav.className = 'sidebar';
  nav.innerHTML = `
    <div class="workspace-switch">
      <span class="workspace-mark"><img src="icons/cs_mark.svg" alt="" /></span>
      <img class="workspace-wordmark" src="icons/cs_logo.svg" alt="CoinSwitch" />
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 10l5 5 5-5"/></svg>
    </div>
    <button class="sidebar-collapse" type="button">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>
      Collapse
    </button>
    <div class="sidebar-scroll">${sectionsHTML}</div>
    <div class="sidebar-account">
      <span class="avatar">AK</span>
      <div class="who">
        <div class="name">Ashutosh Kumar</div>
        <div class="email">ashutosh.k@peepal.co</div>
      </div>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);
  document.body.insertBefore(overlay, nav.nextSibling);

  const closeSidebar = () => document.body.classList.remove('sidebar-open');
  toggle.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  overlay.addEventListener('click', closeSidebar);
  nav.querySelector('.sidebar-collapse').addEventListener('click', () => {
    nav.classList.toggle('collapsed');
  });
}

function renderTitleBar(container, section, page, sub) {
  container.innerHTML = `
    <div class="title-bar">
      <div class="breadcrumb"><span class="section">${esc(section)}</span><span class="sep">·</span><span class="page">${esc(page)}</span></div>
      ${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}
    </div>
  `;
}

/* ---------------- Filter bar ---------------- */
const FILTER_ICONS = {
  date: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  type: 'M4 6h16M4 12h16M4 18h10',
  platform: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  topic: 'M20.59 13.41L13 21l-9-9V4h8l8.59 8.41a2 2 0 010 2.82z',
  country: 'M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z',
};
function filterIconSVG(kind) {
  const d = FILTER_ICONS[kind] || FILTER_ICONS.type;
  return `<svg class="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
const CHEV_SVG = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 10l5 5 5-5"/></svg>';

/** Build a simple single-select filter pill wrapping a <select>. Returns the <select> element. */
function buildFilterPill(parent, kind, labelAll, options) {
  const wrap = document.createElement('label');
  wrap.className = 'filter-pill';
  const sel = document.createElement('select');
  sel.insertAdjacentHTML('beforeend', `<option value="">${esc(labelAll)}</option>`);
  options.forEach(o => sel.insertAdjacentHTML('beforeend', `<option value="${esc(o)}">${esc(o)}</option>`));
  wrap.innerHTML = filterIconSVG(kind);
  wrap.appendChild(sel);
  wrap.insertAdjacentHTML('beforeend', CHEV_SVG);
  parent.appendChild(wrap);
  return sel;
}

/* ---------------- Toggle switch ---------------- */
function buildSwitch(parent, label, checked, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'switch';
  wrap.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span class="track"><span class="thumb"></span></span><span>${esc(label)}</span>`;
  parent.appendChild(wrap);
  const input = wrap.querySelector('input');
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

/* ---------------- CSV export ---------------- */
function exportCSV(filename, rows, columns) {
  // columns: [{key, label}]
  const esc2 = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map(c => esc2(c.label)).join(',')];
  rows.forEach(r => lines.push(columns.map(c => esc2(typeof c.key === 'function' ? c.key(r) : r[c.key])).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- Generic paginated table ---------------- */
/**
 * Renders a paginated data table.
 * opts: { columns:[{label,key,render(row),num}], rows:[...], pageSize, emptyMessage, onRowClick(row) }
 */
function renderPaginatedTable(container, opts) {
  const state = { page: 1, pageSize: opts.pageSize || 10 };

  function render() {
    const rows = opts.rows;
    if (!rows.length) {
      container.innerHTML = `<div class="empty-state">${esc(opts.emptyMessage || 'No rows match these filters.')}</div>`;
      return;
    }
    const pageSize = state.pageSize === 'all' ? rows.length : state.pageSize;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    const thead = `<thead><tr>
      ${opts.showCheckbox ? '<th style="width:30px"></th>' : ''}
      ${opts.columns.map(c => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}
    </tr></thead>`;

    const tbody = `<tbody>${pageRows.map((row, i) => `
      <tr${opts.onRowClick ? ' class="clickable"' : ''} data-idx="${start + i}">
        ${opts.showCheckbox ? `<td><input type="checkbox" class="checkbox"></td>` : ''}
        ${opts.columns.map(c => `<td${c.num ? ' class="num mono"' : ''}>${c.render ? c.render(row) : esc(row[c.key])}</td>`).join('')}
      </tr>
    `).join('')}</tbody>`;

    const pageButtons = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - state.page) <= 1) pageButtons.push(p);
      else if (pageButtons[pageButtons.length - 1] !== '...') pageButtons.push('...');
    }

    container.innerHTML = `
      <div class="table-scroll"><table>${thead}${tbody}</table></div>
      <div class="table-footer">
        <div class="rows-per-page">
          Rows per page
          <select class="rpp-select">
            ${[10, 25, 50, 'all'].map(n => `<option value="${n}" ${String(state.pageSize) === String(n) ? 'selected' : ''}>${n === 'all' ? 'All' : n}</option>`).join('')}
          </select>
        </div>
        <div class="text-muted" style="font-size:12.5px;">Page ${state.page}/${totalPages}</div>
        <div class="pagination">
          <button class="pg-prev" ${state.page === 1 ? 'disabled' : ''}>Prev</button>
          ${pageButtons.map(p => p === '...'
            ? '<span class="ellipsis">…</span>'
            : `<button data-page="${p}" class="${p === state.page ? 'active' : ''}">${p}</button>`).join('')}
          <button class="pg-next" ${state.page === totalPages ? 'disabled' : ''}>Next</button>
        </div>
      </div>
    `;

    container.querySelectorAll('.pagination button[data-page]').forEach(b => {
      b.addEventListener('click', () => { state.page = Number(b.dataset.page); render(); });
    });
    const prevBtn = container.querySelector('.pg-prev');
    const nextBtn = container.querySelector('.pg-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { state.page--; render(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.page++; render(); });
    const rppSel = container.querySelector('.rpp-select');
    if (rppSel) rppSel.addEventListener('change', () => {
      state.pageSize = rppSel.value === 'all' ? 'all' : Number(rppSel.value);
      state.page = 1; render();
    });
    if (opts.onRowClick) {
      container.querySelectorAll('tbody tr.clickable').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('input,a,button')) return;
          opts.onRowClick(rows[Number(tr.dataset.idx)]);
        });
      });
    }
  }
  render();
  return { refresh: render, resetPage: () => { state.page = 1; render(); } };
}

/* ---------------- Heatmap table ---------------- */
/** rows: [{label, cells: {brand: pct|null}}], brands: ordered brand list (own brand first) */
function renderHeatmap(container, brands, rows) {
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">No topics to show yet.</div>';
    return;
  }
  const thead = `<thead><tr>
    <th class="row-label">Topic</th>
    ${brands.map(b => `<th>${esc(b)}</th>`).join('')}
  </tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `
    <tr>
      <td class="row-label">${esc(r.label)}</td>
      ${brands.map(b => {
        const v = r.cells[b];
        if (v == null) return `<td><span class="text-muted">-</span></td>`;
        const alpha = Math.min(0.9, 0.12 + v / 100 * 0.6);
        const color = b === OWN_BRAND ? `rgba(63,185,80,${alpha})` : `rgba(91,155,248,${alpha})`;
        return `<td><span class="heatmap-cell" style="background:${color}">${v}%</span></td>`;
      }).join('')}
    </tr>
  `).join('')}</tbody>`;
  container.innerHTML = `<div class="heatmap-scroll"><table class="heatmap">${thead}${tbody}</table></div>`;
}

/* ---------------- Side drawer (singleton) ---------------- */
function ensureDrawer() {
  let overlay = document.querySelector('.drawer-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <div class="drawer">
      <div class="drawer-head">
        <div class="title" id="drawer-title">Detail</div>
        <button class="drawer-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="drawer-body" id="drawer-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDrawer(); });
  overlay.querySelector('.drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  return overlay;
}
function openDrawer(title, bodyHTML) {
  const overlay = ensureDrawer();
  overlay.querySelector('#drawer-title').textContent = title;
  overlay.querySelector('#drawer-body').innerHTML = bodyHTML;
  overlay.classList.add('open');
}
function closeDrawer() {
  const overlay = document.querySelector('.drawer-overlay');
  if (overlay) overlay.classList.remove('open');
}

/* ---------------- Onboarding tip (dismissible, localStorage) ---------------- */
function showOnboardingTip(anchorEl, key, text) {
  if (localStorage.getItem('tip-dismissed-' + key)) return;
  const tip = document.createElement('div');
  tip.className = 'tip-bubble';
  tip.innerHTML = `${esc(text)}<span class="tip-dismiss">Got it</span>`;
  document.body.appendChild(tip);
  const r = anchorEl.getBoundingClientRect();
  tip.style.top = (r.bottom + window.scrollY + 10) + 'px';
  tip.style.left = Math.max(10, r.left + window.scrollX - 20) + 'px';
  tip.querySelector('.tip-dismiss').addEventListener('click', () => {
    localStorage.setItem('tip-dismissed-' + key, '1');
    tip.remove();
  });
}

/* ---------------- Data loading (real data — untouched pipeline) ---------------- */
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

function setMetaLine(data, elId) {
  const el = document.getElementById(elId || 'meta-line');
  if (!el) return;
  if (!data.runs.length) {
    el.textContent = 'No results yet — run track.py to generate results.json.';
    return;
  }
  const genDate = new Date(data.generated_at);
  el.textContent = data.runs.length + ' responses, ' + data.platforms.join(', ') + ', generated ' + genDate.toLocaleString();
}

/** Runs where at least one brand (own or competitor) was named in the AI answer.
 *  Visibility % should be measured against this, not against every run — a run where
 *  no brand at all was mentioned isn't a fair "miss", it's just not a brand-relevant answer. */
function withAnyMention(runs) {
  return runs.filter(r => r.mentions && r.mentions.length > 0);
}

function brandCounts(competitors, runs) {
  const counts = {};
  competitors.forEach(c => counts[c] = 0);
  runs.forEach(r => r.mentions.forEach(m => { if (counts[m] !== undefined) counts[m]++; }));
  return counts;
}

/** Render a multi-series SoV-over-time line chart (percent, 0-100) into containerEl.
 *  Own brand renders as a thin white line; everything else as soft-blue family tints,
 *  only shown when compareOn is true. */
function renderTrendChart(containerEl, history, competitors, opts) {
  opts = opts || {};
  const compareOn = !!opts.compareOn;
  const ownBrand = opts.ownBrand || (competitors.includes(OWN_BRAND) ? OWN_BRAND : competitors[0]);
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
    <line x1="${padL}" y1="${y(pct)}" x2="${W - padR}" y2="${y(pct)}" stroke="var(--border)" stroke-width="1"/>
    <text x="${padL - 8}" y="${y(pct) + 4}" text-anchor="end" font-size="10" fill="var(--muted-fg)" font-family="var(--font-mono)">${pct}%</text>
  `).join('');

  const xLabels = history.map((h, i) => {
    if (n > 8 && i % Math.ceil(n / 8) !== 0 && i !== n - 1) return '';
    return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted-fg)" font-family="var(--font-mono)">${esc(h.date.slice(5))}</text>`;
  }).join('');

  const seriesList = compareOn ? competitors : [ownBrand];
  const softBlues = ['#5B9BF8', '#86B6F6', '#3C7FD6', '#9FC4F2', '#2E67B3'];
  let blueIdx = 0;
  const seriesColors = {};
  const lines = seriesList.map((c) => {
    const isOwn = c === ownBrand;
    const color = isOwn ? 'var(--white-line)' : softBlues[(blueIdx++) % softBlues.length];
    seriesColors[c] = color;
    const pts = history.map((h, i) => [x(i), y(h.pct ? (h.pct[c] || 0) : 0)]);
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${color}" stroke="var(--card)" stroke-width="1.5"/>`).join('');
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${isOwn ? 2.5 : 1.6}"/>${dots}`;
  }).join('');

  const hoverCols = history.map((h, i) => {
    const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
    const right = i === n - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
    return `<rect class="trend-hover-col" data-idx="${i}" x="${left.toFixed(1)}" y="${padT}" width="${(right - left).toFixed(1)}" height="${plotH}" fill="transparent"/>`;
  }).join('');

  containerEl.innerHTML = `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;" role="img" aria-label="Share of voice over time">
        ${gridLines}
        ${lines}
        <line class="trend-hover-line" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="var(--border)" stroke-width="1" opacity="0"/>
        ${xLabels}
        ${hoverCols}
      </svg>
      <div class="chart-tooltip"></div>
    </div>
  `;

  const svg = containerEl.querySelector('svg');
  const tooltip = containerEl.querySelector('.chart-tooltip');
  const hoverLine = containerEl.querySelector('.trend-hover-line');
  const cols = containerEl.querySelectorAll('.trend-hover-col');

  function showTooltip(i) {
    const h = history[i];
    hoverLine.setAttribute('x1', x(i).toFixed(1));
    hoverLine.setAttribute('x2', x(i).toFixed(1));
    hoverLine.setAttribute('opacity', '1');
    const rows = seriesList.map(c => {
      const pct = h.pct ? (h.pct[c] || 0) : 0;
      return `<div class="chart-tooltip-row"><span class="chart-tooltip-dot" style="background:${seriesColors[c]}"></span><span class="chart-tooltip-name">${esc(c)}</span><span class="chart-tooltip-val">${pct}%</span></div>`;
    }).join('');
    tooltip.innerHTML = `<div class="chart-tooltip-date">${esc(h.date)}</div>${rows}`;
    const pctX = (x(i) / W) * 100;
    tooltip.style.left = pctX + '%';
    const pctY = (y(Math.max(...seriesList.map(c => h.pct ? (h.pct[c] || 0) : 0))) / H) * 100;
    tooltip.style.top = Math.max(pctY - 2, 4) + '%';
    tooltip.style.opacity = '1';
  }

  function hideTooltip() {
    hoverLine.setAttribute('opacity', '0');
    tooltip.style.opacity = '0';
  }

  cols.forEach(col => {
    col.addEventListener('mouseenter', () => showTooltip(+col.dataset.idx));
    col.addEventListener('mouseleave', hideTooltip);
  });
  svg.addEventListener('mouseleave', hideTooltip);
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

/* ---------------- Deterministic "mock" helpers shared across pages ----------------
   Real pipeline doesn't track rank, intent-type-of-prompt classification detail,
   sub-queries, citations detail, ads, or own-page URLs. Where the brief needs these,
   we synthesize plausible, internally-consistent values from a seeded hash so the
   same prompt/run always maps to the same mock value (no flicker on re-render). */
function seededRandom(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return function () {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

/** Real rank 1-5+ for a run: position of `brand`'s first mention among all mentioned
    brands, ordered by where each brand first appears in the response text. Only
    meaningful when the brand was actually mentioned. */
function realRank(run, brand) {
  if (!run.mentions || !run.mentions.includes(brand)) return null;
  const text = (run.response || '').toLowerCase();
  const positions = run.mentions.map(name => {
    const idx = text.indexOf(name.toLowerCase());
    return { name, idx: idx === -1 ? Infinity : idx };
  }).sort((a, b) => a.idx - b.idx);
  const pos = positions.findIndex(p => p.name === brand) + 1;
  if (pos <= 0) return null;
  return pos >= 5 ? '5+' : pos;
}

/** Classify a prompt as Branded / Non-branded by whether it names any tracked brand. */
function classifyPromptType(prompt, competitors) {
  const p = prompt.toLowerCase();
  const named = competitors.some(c => p.includes(c.toLowerCase()));
  return named ? 'Branded' : 'Non-branded';
}

/** Build To-Do task-board cards from real content-opportunity gaps: categories where
    the own brand loses to a competitor or gets no mention at all (same logic as
    content-plan.html's gap detection). Real, derived from results.json — not mock. */
function taskCardsFromContentGaps(competitors, runs) {
  const TARGET = competitors.includes(OWN_BRAND) ? OWN_BRAND : competitors[0];
  if (!TARGET || !runs.length) return [];
  const byPrompt = {};
  runs.forEach(r => {
    if (!byPrompt[r.prompt]) byPrompt[r.prompt] = { category: r.category, mentions: new Set() };
    r.mentions.forEach(m => byPrompt[r.prompt].mentions.add(m));
  });
  const groups = {};
  Object.entries(byPrompt).forEach(([prompt, v]) => {
    if (v.mentions.has(TARGET)) return;
    const cat = v.category || 'Uncategorized';
    if (!groups[cat]) groups[cat] = { count: 0, whitespace: v.mentions.size === 0 };
    groups[cat].count++;
  });
  return Object.entries(groups)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cat, v], i) => ({
      id: 'gap-' + i,
      title: v.whitespace
        ? `"${cat}" guide — own the answer before a competitor does`
        : `${cat}: comparison piece to win back the AI answer`,
      category: cat,
      column: 'todo',
      source: `${v.count} prompt gap${v.count === 1 ? '' : 's'} in ${cat}`,
    }));
}
