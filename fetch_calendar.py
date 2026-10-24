#!/usr/bin/env python3
"""Download the free economic calendar (this week and next) and keep Medium and High impact events for the 8 currencies."""
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "Mozilla/5.0 (compatible; ConfluenceFX/1.0)"}
CCY = {"USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"}
URLS = ["https://nfs.faireconomy.media/ff_calendar_thisweek.json",
        "https://nfs.faireconomy.media/ff_calendar_nextweek.json"]


def main(out="calendar.json"):
    events, got = [], 0
    for u in URLS:
        try:
            req = urllib.request.Request(u, headers=UA)
            data = json.loads(urllib.request.urlopen(req, timeout=25).read().decode("utf-8"))
            got += 1
        except Exception as e:
            print(f"{u}: FAILED {e}", file=sys.stderr)
            continue
        for e in data:
            if e.get("country") not in CCY or e.get("impact") not in ("High", "Medium"):
                continue
            try:
                ts = int(datetime.fromisoformat(e["date"]).astimezone(timezone.utc).timestamp() * 1000)
            except Exception:
                continue
            events.append({"ts": ts, "ccy": e["country"], "title": e.get("title", ""), "impact": e["impact"],
                           "forecast": e.get("forecast", ""), "previous": e.get("previous", "")})
    if not got:
        sys.exit(1)
    events.sort(key=lambda x: x["ts"])
    json.dump({"fetchedTs": int(time.time() * 1000), "events": events}, open(out, "w"), separators=(",", ":"))
    print(f"Calendar: {len(events)} medium and high impact events")


if __name__ == "__main__":
    main(*sys.argv[1:2])
