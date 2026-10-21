#!/usr/bin/env python3
"""LLM visibility tracker: run prompts across ChatGPT, Claude, Gemini."""

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone
from urllib.parse import quote_plus

import requests
from dotenv import load_dotenv

load_dotenv()
PROMPTS_FILE = "prompts.csv"
COMPETITORS_FILE = "competitors.txt"
RESULTS_FILE = "results.json"

OPENAI_MODEL = "gpt-5.1"
ANTHROPIC_MODEL = "claude-sonnet-5"
GEMINI_MODEL = "gemini-3.8-flash"

LIMIT = int(os.environ.get("PROMPT_LIMIT", "0"))

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
TRACKING_PARAMS_RE = re.compile(r"[?&](utm_[^=&]+|ref|fbclid|gclid)=[^&]*")

def extract_citations(text):
    if not text:
        return []
    seen = {}
    for match in URL_RE.finditer(text):
        url = match.group(1).rstrip(".,;:!?'\"")
        url = TRACKING_PARAMS_RE.sub("", url)
        try:
            domain = re.sub(r"^www\.", "", url.split("/")[2])
        except IndexError:
            continue
        if url not in seen:
            seen[url] = domain
    return [{"url": u, "domain": d} for u, d in seen.items()]

def query_openai(prompt):
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
    resp = requests.get(
        "https://app.scrapingbee.com/api/v1/gemini",
        params={
            "prompt": prompt,
            "country_code": "us",
        },
        headers={"authorization": f"Bearer {os.environ['SCRAPINGBEE_API_KEY']}"},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("results_text") or data.get("results_markdown") or json.dumps(data)

def _scrapingbee_get(target_url, render_js=True, extra_params=None):
    params = {
        "api_key": os.environ["SCRAPINGBEE_API_KEY"],
        "url": target_url,
        "render_js": "true" if render_js else "false",
    }
    if extra_params:
        params.update(extra_params)
    resp = requests.get("https://app.scrapingbee.com/api/v1/", params=params, timeout=60)
    resp.raise_for_status()
    return resp.text

def query_google_ai_overview(prompt):
    url = f"https://www.google.com/search?q={quote_plus(prompt)}"
    html = _scrapingbee_get(url, render_js=True, extra_params={"wait": "3000", "custom_google": "True"})
    match = re.search(r'id="m-x-content"[^>]*>(.*?)</div>\s*</div>\s*</div>', html, re.DOTALL)
    if not match:
        text = re.sub(r"<[^>]+>", " ", html)
        return "" if "AI Overview" not in html else re.sub(r"\s+", " ", text)[:3000]
    text = re.sub(r"<[^>]+>", " ", match.group(1))
    return re.sub(r"\s+", " ", text).strip()

def query_perplexity_web(prompt):
    url = f"https://www.perplexity.ai/search?q={quote_plus(prompt)}"
    html = _scrapingbee_get(url, render_js=True, extra_params={"wait": "5000"})
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:5000]

PLATFORMS = {
    "ChatGPT": (query_openai, "SCRAPINGBEE_API_KEY"),
    "Claude": (query_claude, "ANTHROPIC_API_KEY"),
    "Gemini": (query_gemini, "SCRAPINGBEE_API_KEY"),
    "Google AI Overview": (query_google_ai_overview, "SCRAPINGBEE_API_KEY"),
    "Perplexity": (query_perplexity_web, "SCRAPINGBEE_API_KEY"),
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

    for row in rows:
        prompt = row["prompt"].strip()
        intent = row.get("intent", "").strip()
        category = row.get("category", "").strip()
        for platform_name, fn in active.items():
            done += 1
            print(f"[{done}/{total}] [{platform_name}] {prompt[:60]}")
            try:
                response_text = fn(prompt)
                error = None
            except Exception as e:
                response_text = ""
                error = str(e)
                print(f"   error: {error}")
            mentions = find_mentions(response_text, competitors) if response_text else []
            citations = extract_citations(response_text)
            runs.append({
                "prompt": prompt,
                "intent": intent,
                "category": category,
                "platform": platform_name,
                "response": response_text,
                "mentions": mentions,
                "citations": citations,
                "error": error,
            })
            save()

    print(f"Saved {len(runs)} results to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
