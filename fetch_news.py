#!/usr/bin/env python3
"""Pull central bank and FX news feeds, tag headlines by currency, score their tone, write news.json.

Tone is a rough keyword score: hawkish or strong-data words push a currency up, dovish or weak-data words push it down.
It is a nudge (6% weight in the macro score), not a reading of the article.
"""
import json
import math
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

UA = {"User-Agent": "Mozilla/5.0 (compatible; ConfluenceFX/1.0)"}
CCY = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"]

TAGS = {
    "USD": r"\b(fed|federal reserve|fomc|us dollar|dollar index|dxy|powell|warsh|nfp|nonfarm|treasury yields?|u\.s\.|us cpi|us gdp|usd)\b",
    "EUR": r"\b(ecb|euro|eurozone|euro area|lagarde|eur)\b",
    "GBP": r"\b(boe|bank of england|sterling|pound|bailey|gbp|uk cpi|uk gdp|u\.k\.)\b",
    "JPY": r"\b(boj|bank of japan|yen|ueda|jpy|japan|japanese)\b",
    "CHF": r"\b(snb|swiss national bank|franc|swiss|schlegel|chf)\b",
    "AUD": r"\b(rba|aussie|australian dollar|australia|australian|aud)\b",
    "NZD": r"\b(rbnz|kiwi|new zealand|nzd|orr)\b",
    "CAD": r"\b(boc|bank of canada|loonie|canadian dollar|canada|canadian|macklem|cad)\b",
}
UP = ["hike", "hikes", "hiked", "raise rates", "raises rates", "rate rise", "tighten", "hawkish", "higher for longer",
      "beats", "beat expectations", "above expectations", "stronger than expected", "accelerat", "hotter", "sticky",
      "rebound", "rallies", "extends gains", "jumps", "surges", "climbs", "upbeat", "robust"]
DOWN = ["cut rates", "rate cut", "cuts rates", "cuts", "dovish", "easing", "eases", "weaker than expected", "misses",
        "below expectations", "slows", "slowdown", "recession", "contraction", "layoffs", "job losses", "falls", "slumps",
        "drops", "declines", "retreats", "under pressure", "loses ground", "extends losses", "weak"]
TAG_RE = {c: re.compile(p, re.I) for c, p in TAGS.items()}


def get(url, timeout=25):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def strip_ns(tag):
    return tag.split("}", 1)[-1]


def parse_feed(raw):
    root = ET.fromstring(raw)
    items = []
    for it in root.iter():
        if strip_ns(it.tag) not in ("item", "entry"):
            continue
        d = {strip_ns(c.tag): (c.text or "").strip() for c in it}
        link = d.get("link", "")
        if not link:
            for c in it:
                if strip_ns(c.tag) == "link" and c.get("href"):
                    link = c.get("href")
        when = d.get("pubDate") or d.get("updated") or d.get("published") or ""
        ts = None
        try:
            ts = int(parsedate_to_datetime(when).timestamp() * 1000)
        except Exception:
            try:
                ts = int(datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp() * 1000)
            except Exception:
                pass
        items.append({"title": re.sub(r"\s+", " ", d.get("title", "")), "link": link, "ts": ts,
                      "desc": re.sub(r"<[^>]+>", " ", d.get("description", d.get("summary", "")))[:300]})
    return items


def tone(text):
    t = text.lower()
    up = sum(1 for w in UP if w in t)
    dn = sum(1 for w in DOWN if w in t)
    return max(-1, min(1, (up - dn) / 2))


def main(out="news.json", feeds_path="feeds.json"):
    feeds = json.load(open(feeds_path))["feeds"]
    now = time.time() * 1000
    seen, news, ok, bad = set(), [], [], []
    for f in feeds:
        try:
            items = parse_feed(get(f["url"]))
        except Exception as e:
            bad.append(f["name"])
            print(f"{f['name']}: FAILED {e}", file=sys.stderr)
            continue
        ok.append(f["name"])
        for it in items[:40]:
            if not it["ts"] or now - it["ts"] > 72 * 3600 * 1000 or it["title"] in seen:
                continue
            seen.add(it["title"])
            text = it["title"] + " " + it["desc"]
            ccy = list(f.get("ccy") or [c for c in CCY if TAG_RE[c].search(text)])
            if not ccy:
                continue
            tn = tone(text)
            news.append({"title": it["title"], "link": it["link"], "src": f["name"], "ts": it["ts"], "ccy": ccy, "tone": tn,
                         "official": not f.get("market")})
    news.sort(key=lambda n: -n["ts"])
    news = news[:80]
    pulse = {}
    for c in CCY:
        s = 0.0
        for n in news:
            if c in n["ccy"] and n["tone"]:
                age_h = (now - n["ts"]) / 3600000
                s += n["tone"] * math.exp(-age_h / 24)
        pulse[c] = round(math.tanh(s / 3), 3)  # -1 to 1
    json.dump({"fetchedTs": int(now), "news": news, "pulse": pulse}, open(out, "w"), separators=(",", ":"))
    print(f"News: {len(news)} items from {ok}; failed {bad}; pulse {pulse}")


if __name__ == "__main__":
    main(*sys.argv[1:2])
