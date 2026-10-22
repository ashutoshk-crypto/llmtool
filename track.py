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
PROMPTS_FILE = "prompts.csv"
COMPETITORS_FILE = "competitors.txt"
RESULTS_FILE = "results.json"
HISTORY_FILE = "history.json"

OPENAI_MODEL = "gpt-5.1"
ANTHROPIC_MODEL = "claude-sonnet-5"
GEMINI_MODEL = "gemini-3.8-flash"

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
            timeout=60,
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
            timeout=60,
        )
    resp.raise_for_status()
    data = resp.json()
    return data.get("results_text") or data.get("results_markdown") or json.dumps(data)

def query_google_ai_overview(prompt):
    with scrapingbee_semaphore:
        resp = requests.get(
            "https://app.scrapingbee.com/api/v1/google",
            params={
                "api_key": os.environ["SCRAPINGBEE_API_KEY"],
                "search": prompt,
                "country_code": "in",
            },
            timeout=60,
        )
    resp.raise_for_status()
    data = resp.json()
    ai_overview = data.get("ai_overview") or {}
    text_blocks = ai_overview.get("text_blocks") or []
    text = re.sub(r"\s+", " ", " ".join(
        block.get("snippet", "") for block in text_blocks if isinstance(block, dict)
    )).strip()
    if not text:
        text = re.sub(r"\s+", " ", str(ai_overview.get("text") or "")).strip()
    references = ai_overview.get("references") or []
    html = "".join(
        f'<a href="{ref.get("link", "")}">{ref.get("title", "")}</a>'
        for ref in references if isinstance(ref, dict) and ref.get("link")
    )
    return text, html

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
    skipped = [n for n in PLATFORMS if n not in active]
    if skipped:
        print(f"Skipping (no API key set): {skipped}")
    if not active:
        print("No API keys found. Set at least one in .env - see .env.example.")
        sys.exit(1)

    print(f"Prompts: {len(rows)} | Competitors: {competitors} | Platforms: {list(active)}")

    runs = []
    runs_lock = threading.Lock()
    total = len(rows) * len(active)
    done = 0

    def save():
        output = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "competitors": competitors,
            "platforms": list(active),
            "runs": runs,
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
        try:
            result_val = fn(prompt)
            response_text, response_html = result_val if isinstance(result_val, tuple) else (result_val, None)
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
    append_history_snapshot(competitors, runs)


def append_history_snapshot(competitors, runs):
    """Append a dated share-of-voice snapshot so trends can be tracked over time."""
    total = len(runs)
    counts = {c: 0 for c in competitors}
    for r in runs:
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
