/* ============================================================
   assets/mock-data.js
   Clearly-synthetic sample data for parts of the dashboard spec
   that the real pipeline (track.py / results.json / history.json)
   does not capture: sub-queries, citations detail, own-page
   tracking, ad monitoring, and task-board items. Everything here
   is internally consistent (seeded from real prompts/categories
   where possible) but NOT real tracked data — do not confuse with
   results.json / history.json.
   ============================================================ */

const MOCK_DOMAINS = [
  { domain: 'coinswitch.co', type: 'Own' },
  { domain: 'coindcx.com', type: 'Competitor' },
  { domain: 'binance.com', type: 'Competitor' },
  { domain: 'wazirx.com', type: 'Competitor' },
  { domain: 'zebpay.com', type: 'Competitor' },
  { domain: 'reddit.com', type: 'User-generated' },
  { domain: 'quora.com', type: 'User-generated' },
  { domain: 'coindesk.com', type: 'Third party' },
  { domain: 'cointelegraph.com', type: 'Third party' },
  { domain: 'livemint.com', type: 'Third party' },
  { domain: 'economictimes.indiatimes.com', type: 'Third party' },
  { domain: 'investopedia.com', type: 'Third party' },
  { domain: 'coinmarketcap.com', type: 'Marketplace' },
  { domain: 'coingecko.com', type: 'Marketplace' },
  { domain: 'moneycontrol.com', type: 'Third party' },
];

const PAGE_TYPES = ['Product page', 'Blog post', 'Help center', 'Comparison page', 'Forum thread'];

function mockCitedPages(runs, competitors) {
  const rnd = seededRandom('citations-v1');
  const categories = [...new Set(runs.map(r => r.category).filter(Boolean))];
  const prompts = [...new Map(runs.map(r => [r.prompt, r])).values()];
  const pages = [];
  prompts.forEach((r, i) => {
    const domainCount = 1 + Math.floor(rnd() * 2);
    for (let d = 0; d < domainCount; d++) {
      const src = MOCK_DOMAINS[Math.floor(rnd() * MOCK_DOMAINS.length)];
      const path = '/' + (r.category || 'guide').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '/' + (100 + i);
      pages.push({
        url: 'https://' + src.domain + path,
        domain: src.domain,
        sourceType: src.type,
        intent: r.intent || 'Informational',
        pageType: PAGE_TYPES[Math.floor(rnd() * PAGE_TYPES.length)],
        brandMentioned: rnd() < (src.type === 'Own' ? 0.9 : 0.3) ? competitors[0] : (rnd() < 0.5 ? competitors[Math.floor(rnd() * competitors.length)] : null),
        prompt: r.prompt,
        category: r.category,
        platform: r.platform,
        platformCount: 1 + Math.floor(rnd() * 2),
      });
    }
  });
  return pages;
}

function mockTopCitedDomains(citedPages) {
  const byDomain = {};
  citedPages.forEach(p => {
    if (!byDomain[p.domain]) byDomain[p.domain] = { domain: p.domain, sourceType: p.sourceType, count: 0 };
    byDomain[p.domain].count++;
  });
  return Object.values(byDomain).sort((a, b) => b.count - a.count);
}

/** 2-4 plausible sub-queries an engine might issue while researching a prompt topic. */
function mockSubQueries(prompt, category) {
  const rnd = seededRandom('subq|' + prompt);
  const topic = (category || 'this topic').toLowerCase();
  const templates = [
    `best ${topic} platforms in India 2026`,
    `${topic} fees comparison India`,
    `is ${topic} safe and regulated in India`,
    `${topic} vs traditional alternatives`,
    `how to get started with ${topic}`,
    `${topic} customer reviews reddit`,
  ];
  const n = 2 + Math.floor(rnd() * 3);
  const picked = [];
  const used = new Set();
  while (picked.length < n && picked.length < templates.length) {
    const idx = Math.floor(rnd() * templates.length);
    if (used.has(idx)) continue;
    used.add(idx);
    picked.push(templates[idx]);
  }
  return picked;
}

/** Mock own-page URLs tracked for citation/mention lift, seeded + merged with any localStorage additions. */
function mockOwnPages() {
  const seed = [
    { url: 'https://coinswitch.co/futures-trading', citations: 18, mentions: 24, updated: '2026-10-12', suggested: false },
    { url: 'https://coinswitch.co/learn/crypto-sip', citations: 9, mentions: 14, updated: '2026-10-08', suggested: false },
    { url: 'https://coinswitch.co/pro/api-trading', citations: 4, mentions: 6, updated: '2026-09-29', suggested: true },
    { url: 'https://coinswitch.co/otc-desk', citations: 2, mentions: 3, updated: '2026-09-20', suggested: true },
    { url: 'https://coinswitch.co/learn/web3-coins-guide', citations: 11, mentions: 15, updated: '2026-10-15', suggested: false },
  ];
  let extra = [];
  try {
    extra = JSON.parse(localStorage.getItem('own-pages-extra') || '[]');
  } catch (e) { extra = []; }
  return seed.concat(extra);
}
function addOwnPage(url) {
  let extra = [];
  try { extra = JSON.parse(localStorage.getItem('own-pages-extra') || '[]'); } catch (e) { extra = []; }
  extra.push({ url, citations: 0, mentions: 0, updated: new Date().toISOString().slice(0, 10), suggested: true });
  localStorage.setItem('own-pages-extra', JSON.stringify(extra));
}

/** Mock own-page citation/mention trend, loosely following the real history dates. */
function mockOwnPageTrend(history) {
  if (!history.length) return [];
  const rnd = seededRandom('own-page-trend');
  let citations = 6, mentions = 9;
  return history.map(h => {
    citations = Math.max(0, citations + Math.round((rnd() - 0.4) * 3));
    mentions = Math.max(0, mentions + Math.round((rnd() - 0.4) * 3));
    return { date: h.date, pct: { 'Own-page citations': citations, 'Brand mentions': mentions } };
  });
}

/** Ad monitoring: which prompts (if any) showed a mock sponsored result, and who advertised. */
const MOCK_ADVERTISERS = ['Binance', 'CoinDCX', 'WazirX', 'Bybit India', 'KuCoin', 'Mudrex'];
function mockAdData(runs) {
  const rnd = seededRandom('ads-v1');
  const prompts = [...new Map(runs.map(r => [r.prompt, r])).values()];
  const rows = [];
  prompts.forEach(r => {
    if (rnd() < 0.28) {
      const n = 1 + Math.floor(rnd() * 2);
      const advertisers = [];
      for (let i = 0; i < n; i++) advertisers.push(MOCK_ADVERTISERS[Math.floor(rnd() * MOCK_ADVERTISERS.length)]);
      rows.push({ prompt: r.prompt, category: r.category, platform: r.platform, advertisers: [...new Set(advertisers)] });
    }
  });
  return rows;
}

/* ---------------- Task board mock data ---------------- */
const TASK_CHANNELS = ['Blog', 'Forum', 'Social'];
const TASK_ASSIGNEES = ['Agent', 'Priya S.', 'Rahul M.', 'Unassigned'];

/** Build initial To-Do cards from real content-opportunity gaps (rival-won + whitespace prompts). */
function taskCardsFromContentGaps(competitors, runs) {
  const TARGET = competitors.includes('CoinSwitch') ? 'CoinSwitch' : competitors[0];
  if (!TARGET || !runs.length) return [];
  const byPrompt = {};
  runs.forEach(r => {
    if (!byPrompt[r.prompt]) byPrompt[r.prompt] = { category: r.category, mentions: new Set() };
    r.mentions.forEach(m => byPrompt[r.prompt].mentions.add(m));
  });
  const groups = {};
  Object.entries(byPrompt).forEach(([prompt, v]) => {
    const isGap = !v.mentions.has(TARGET);
    if (!isGap) return;
    const cat = v.category || 'Uncategorized';
    if (!groups[cat]) groups[cat] = { count: 0, whitespace: v.mentions.size === 0 };
    groups[cat].count++;
  });
  const rnd = seededRandom('task-cards');
  return Object.entries(groups)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([cat, v], i) => ({
      id: 'gap-' + i,
      title: v.whitespace
        ? `"${cat}" guide — own the answer before a competitor does`
        : `${cat}: comparison piece to win back the AI answer`,
      channel: TASK_CHANNELS[Math.floor(rnd() * TASK_CHANNELS.length)],
      assignee: 'Unassigned',
      week: 'This week',
      column: 'todo',
      source: `${v.count} prompt gap${v.count === 1 ? '' : 's'} in ${cat}`,
    }));
}

function mockTaskBoard(gapCards) {
  const extra = [
    { id: 't1', title: 'Publish SIP vs lumpsum investing explainer', channel: 'Blog', assignee: 'Agent', week: 'This week', column: 'agent' },
    { id: 't2', title: 'Answer top Reddit thread on futures margin', channel: 'Forum', assignee: 'Priya S.', week: 'This week', column: 'review' },
    { id: 't3', title: 'LinkedIn carousel: OTC desk for HNIs', channel: 'Social', assignee: 'Rahul M.', week: 'Last week', column: 'review' },
    { id: 't4', title: 'Refresh "crypto deposit" help article', channel: 'Blog', assignee: 'Agent', week: 'Last week', column: 'completed', performance: 32 },
    { id: 't5', title: 'Quora answer: is CoinSwitch safe?', channel: 'Forum', assignee: 'Agent', week: 'Last week', column: 'completed', performance: 18 },
    { id: 't6', title: 'X thread: Web3 coins on CoinSwitch', channel: 'Social', assignee: 'Unassigned', week: 'This week', column: 'todo' },
  ];
  return gapCards.concat(extra);
}
