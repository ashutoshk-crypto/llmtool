#!/usr/bin/env python3
"""LLM visibility tracker: run prompts across ChatGPT, Claude, Gemini, Google AI Overview."""

import csv
import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()
BRAND = os.environ.get("BRAND", "coinswitch").strip().lower()
BRAND_FILES = {
    "coinswitch": dict(prompts="prompts.csv", competitors="competitors.txt", results="results.json", history="history.json"),
    "lemonn": dict(prompts="lemonn-prompts.csv", competitors="lemonn-competitors.txt", results="results-lemonn.json", history="history-lemonn.json"),
}
cfg = BRAND_FILES.get(BRAND, BRAND_FILES["coinswitch"])
PROMPTS_FILE = cfg["prompts"]
COMPETITORS_FILE = cfg["competitors"]
RESULTS_FILE = cfg["results"]
HISTORY_FILE = cfg["history"]
SEARCH_QUERY_CACHE_FILE = "search_queries_cache.json"

OPENAI_MODEL = "gpt-5.1"
ANTHROPIC_MODEL = "claude-sonnet-5"
GEMINI_MODEL = "gemini-3.8-flash"

_search_query_cache = None
_search_query_cache_lock = threading.Lock()

def _load_search_query_cache():
    global _search_query_cache
    if _search_query_cache is None:
        if os.path.exists(SEARCH_QUERY_CACHE_FILE):
            with open(SEARCH_QUERY_CACHE_FILE, "r", encoding="utf-8") as f:
                _search_query_cache = json.load(f)
        else:
            _search_query_cache = {}
    return _search_query_cache

QUESTION_LEAD_RE = re.compile(
    r"^(how (can|do|does|would) i|how to|what('s| is| are| would be)|"
    r"which|where (can|do) i|can i|do i|is there a way to|"
    r"i want to know|i'd like to know)\s+",
    re.IGNORECASE,
)
SEARCH_STOP_WORDS = {
    "a", "an", "the", "my", "to", "for", "of", "on", "in", "and", "or",
    "is", "are", "using", "use", "with", "that", "this", "those", "these",
    "i", "me", "your", "you",
}

def shorten_to_search_query(prompt):
    """Google's AI Overview only fires on short, natural search queries —
    these prompts are written as conversational LLM questions, which rarely
    trigger it. Compress to how a real user would phrase the same intent
    as a Google search, caching results since prompts don't change."""
    cache = _load_search_query_cache()
    if prompt in cache:
        return cache[prompt]

    text = prompt.strip().rstrip("?").strip()
    text = QUESTION_LEAD_RE.sub("", text)
    text = re.split(r",| and | or ", text, maxsplit=1)[0]
    words = [w for w in re.findall(r"[A-Za-z0-9']+", text) if w.lower() not in SEARCH_STOP_WORDS]
    query = " ".join(words[:7]).lower().strip() or prompt.lower()

    with _search_query_cache_lock:
        cache = _load_search_query_cache()
        cache[prompt] = query
        with open(SEARCH_QUERY_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    return query

LIMIT = int(os.environ.get("PROMPT_LIMIT", "0"))
SCRAPINGBEE_CONCURRENCY = int(os.environ.get("SCRAPINGBEE_CONCURRENCY", "40"))

scrapingbee_semaphore = threading.Semaphore(SCRAPINGBEE_CONCURRENCY)

def load_prompts(path):
    if not os.path.exists(path):
        print(f"Missing file: {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [row for row in reader if row.get("prompt", "").strip()]
    return rows

def load_competitors(path):
    if not os.path.exists(path):
        print(f"Missing file: {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return [l.strip() for l in f if l.strip() and not l.strip().startswith("#")]

def find_mentions(text, competitors):
    found = []
    for name in competitors:
        pattern = r"\b" + re.escape(name) + r"\b"
        if re.search(pattern, text, re.IGNORECASE):
            found.append(name)
    return found

URL_RE = re.compile(r"\(?(https?://[^\s<>\")\]]+)\)?")
HREF_RE = re.compile(r'href=["\'](https?://[^"\']+)["\']')
TRACKING_PARAMS_RE = re.compile(r"[?&](utm_[^=&]+|ref|fbclid|gclid)=[^&]*")
SKIP_DOMAINS = ("google.com", "perplexity.ai", "gstatic.com", "googleapis.com")

def extract_citations(text, html=None):
    if not text and not html:
        return []
    seen = {}
    for source in filter(None, [html, text]):
        pattern = HREF_RE if source is html else URL_RE
        for match in pattern.finditer(source):
            url = match.group(1).rstrip(".,;:!?'\")")
            url = TRACKING_PARAMS_RE.sub("", url)
            try:
                domain = re.sub(r"^www\.", "", url.split("/")[2])
            except IndexError:
                continue
            if any(skip in domain for skip in SKIP_DOMAINS):
                continue
            if url not in seen:
                seen[url] = domain
    return [{"url": u, "domain": d} for u, d in seen.items()]

def query_openai(prompt):
    with scrapingbee_semaphore:
        resp = requests.get(
            "https://app.scrapingbee.com/api/v1/chatgpt",
            params={
                "prompt": prompt,
            },
            headers={"authorization": f"Bearer {os.environ['SCRAPINGBEE_API_KEY']}"},
            timeout=120,
        )
    resp.raise_for_status()
    data = resp.json()
    return data.get("results_text") or data.get("results_markdown") or json.dumps(data)

def query_claude(prompt):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")

def query_gemini(prompt):
    with scrapingbee_semaphore:
        resp = requests.get(
            "https://app.scrapingbee.com/api/v1/gemini",
            params={
                "prompt": prompt,
                "country_code": "in",
            },
            headers={"authorization": f"Bearer {os.environ['SCRAPINGBEE_API_KEY']}"},
            timeout=120,
        )
    resp.raise_for_status()
    data = resp.json()
    return data.get("results_text") or data.get("results_markdown") or json.dumps(data)

def query_google_ai_overview(prompt):
    try:
        search_query = shorten_to_search_query(prompt) or prompt
    except Exception:
        search_query = prompt

    with scrapingbee_semaphore:
        resp = requests.get(
            "https://app.scrapingbee.com/api/v1/google",
            params={
                "api_key": os.environ["SCRAPINGBEE_API_KEY"],
                "search": search_query,
                "country_code": "in",
            },
            timeout=60,
        )
    resp.raise_for_status()
    data = resp.json()
    overviews = data.get("ai_overviews") or []
    ai_overview = overviews[0] if overviews else {}

    fragments = [
        fragment
        for block in (ai_overview.get("answer_text") or [])
        for fragment in (block.get("fragments") or [])
    ]
    text = re.sub(r"\s+", " ", " ".join(
        fragment.get("text", "") for fragment in fragments if isinstance(fragment, dict)
    )).strip()

    sources = {
        item.get("url"): item.get("source", "")
        for item in (ai_overview.get("source_panel") or {}).get("items") or []
        if isinstance(item, dict) and item.get("url")
    }
    references = [
        ref
        for fragment in fragments
        for ref in (fragment.get("references") or [])
        if isinstance(ref, dict) and ref.get("url")
    ] or [{"url": url, "source": name} for url, name in sources.items()]
    html = "".join(
        f'<a href="{ref.get("url", "")}">{ref.get("source", "")}</a>'
        for ref in references
    )

    sub_queries = []
    seen_sub_queries = set()
    for q in data.get("questions") or []:
        if isinstance(q, dict) and q.get("text") and q["text"] not in seen_sub_queries:
            seen_sub_queries.add(q["text"])
            sub_queries.append(q["text"])
    for q in data.get("related_queries") or []:
        if isinstance(q, dict) and q.get("title") and q["title"] not in seen_sub_queries:
            seen_sub_queries.add(q["title"])
            sub_queries.append(q["title"])

    return text, html, sub_queries

PLATFORMS = {
    "ChatGPT": (query_openai, "SCRAPINGBEE_API_KEY"),
    "Claude": (query_claude, "ANTHROPIC_API_KEY"),
    "Gemini": (query_gemini, "SCRAPINGBEE_API_KEY"),
    "Google AI Overview": (query_google_ai_overview, "SCRAPINGBEE_API_KEY"),
}

def main():
    rows = load_prompts(PROMPTS_FILE)
    if LIMIT > 0:
        rows = rows[:LIMIT]
    competitors = load_competitors(COMPETITORS_FILE)

    active = {n: fn for n, (fn, key) in PLATFORMS.items() if os.environ.get(key)}
    platform_filter = [p.strip() for p in os.environ.get("PLATFORM_FILTER", "").split(",") if p.strip()]
    if platform_filter:
        active = {n: fn for n, fn in active.items() if n in platform_filter}
    skipped = [n for n in PLATFORMS if n not in active]
    if skipped:
        print(f"Skipping (no API key set or filtered out): {skipped}")
    if not active:
        print("No API keys found. Set at least one in .env - see .env.example.")
        sys.exit(1)

    print(f"Prompts: {len(rows)} | Competitors: {competitors} | Platforms: {list(active)}")

    existing_runs = []
    existing_platforms = []
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            existing = json.load(f)
        existing_runs = existing.get("runs", [])
        existing_platforms = existing.get("platforms", [])
    kept_runs = [r for r in existing_runs if r["platform"] not in active]
    all_platforms = sorted(set(existing_platforms) | set(active))

    runs = []
    runs_lock = threading.Lock()
    total = len(rows) * len(active)
    done = 0

    def save():
        output = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "competitors": competitors,
            "platforms": all_platforms,
            "runs": kept_runs + runs,
        }
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

    jobs = [
        (row["prompt"].strip(), row.get("intent", "").strip(), row.get("category", "").strip(), platform_name, fn)
        for row in rows
        for platform_name, fn in active.items()
    ]

    def run_job(job):
        nonlocal done
        prompt, intent, category, platform_name, fn = job
        with runs_lock:
            done += 1
            print(f"[{done}/{total}] [{platform_name}] {prompt[:60]}")
        response_html = None
        sub_queries = []
        try:
            result_val = fn(prompt)
            if isinstance(result_val, tuple):
                response_text, response_html = result_val[0], result_val[1]
                sub_queries = result_val[2] if len(result_val) > 2 and result_val[2] else []
            else:
                response_text = result_val
            error = None
        except Exception as e:
            response_text = ""
            error = str(e)
            print(f"   error: {error}")
        mentions = find_mentions(response_text, competitors) if response_text else []
        citations = extract_citations(response_text, response_html)
        result = {
            "prompt": prompt,
            "intent": intent,
            "category": category,
            "platform": platform_name,
            "sub_queries": sub_queries,
            "response": response_text,
            "mentions": mentions,
            "citations": citations,
            "error": error,
        }
        with runs_lock:
            runs.append(result)
            save()

    max_workers = max(SCRAPINGBEE_CONCURRENCY, len(active))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        list(executor.map(run_job, jobs))

    print(f"Saved {len(runs)} results to {RESULTS_FILE}")
    append_history_snapshot(competitors, kept_runs + runs)


def append_history_snapshot(competitors, runs):
    """Append a dated share-of-voice snapshot so trends can be tracked over time.

    Visibility % is measured against runs that named at least one brand, not every
    run — a run where no brand at all was mentioned isn't a fair "miss", it's just
    not a brand-relevant answer.
    """
    relevant_runs = [r for r in runs if r.get("mentions")]
    total = len(relevant_runs)
    counts = {c: 0 for c in competitors}
    for r in relevant_runs:
        for m in r["mentions"]:
            if m in counts:
                counts[m] += 1
    snapshot = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_runs": total,
        "counts": counts,
        "pct": {c: round((counts[c] / total) * 100, 1) if total else 0 for c in competitors},
    }

    history = []
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            try:
                history = json.load(f)
            except json.JSONDecodeError:
                history = []

    history = [h for h in history if h.get("date") != snapshot["date"]]
    history.append(snapshot)
    history.sort(key=lambda h: h["date"])

    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
    print(f"Saved share-of-voice snapshot for {snapshot['date']} to {HISTORY_FILE}")


if __name__ == "__main__":
    main()
