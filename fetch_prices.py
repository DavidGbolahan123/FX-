#!/usr/bin/env python3
"""Download hourly FX prices, build 4-hour bars for the 28 G10 pairs and write bars.json.

Source: Yahoo Finance chart endpoint (no key needed). Yahoo has no 4-hour interval, so hourly bars
are grouped into UTC-aligned 4-hour buckets: 00-04, 04-08, 08-12, 12-16, 16-20, 20-24.
Output: {"fetched": "...", "bars": {"EURUSD": [[ms_bucket_start_utc, open, high, low, close], ...]}}
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

CCY = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"]
PAIRS = [CCY[i] + CCY[j] for i in range(len(CCY)) for j in range(i + 1, len(CCY))]
UA = {"User-Agent": "Mozilla/5.0 (compatible; ConfluenceFX/1.0)"}
BUCKET = 4 * 3600
KEEP = 500  # 4H bars kept per pair, about 17 weeks


def http_get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def parse_yahoo_hourly(payload):
    res = payload["chart"]["result"][0]
    ts = res.get("timestamp") or []
    q = res["indicators"]["quote"][0]
    out = []
    for i, t in enumerate(ts):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None in (o, h, l, c) or min(o, h, l, c) <= 0 or h < l:
            continue
        out.append((int(t), o, h, l, c))
    return sorted(out)


def to_4h(hourly, now_ts=None):
    """Group hourly bars into 4H buckets. A bucket still in progress is dropped."""
    now_ts = int(time.time()) if now_ts is None else now_ts
    buckets = {}
    for t, o, h, l, c in hourly:
        k = t // BUCKET * BUCKET
        b = buckets.get(k)
        if b is None:
            buckets[k] = [k * 1000, o, h, l, c]
        else:
            b[2] = max(b[2], h)
            b[3] = min(b[3], l)
            b[4] = c
    return [buckets[k] for k in sorted(buckets) if k + BUCKET <= now_ts]


def fetch_pair(pair):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{pair}=X?range=6mo&interval=1h&includePrePost=false"
    hourly = parse_yahoo_hourly(json.loads(http_get(url)))
    bars = to_4h(hourly)
    if len(bars) < 60:
        raise RuntimeError(f"only {len(bars)} four-hour bars")
    # live quote: the newest hourly close, compared with the last completed 4H close
    live = {"price": hourly[-1][4], "time": hourly[-1][0] * 1000, "prevClose": bars[-1][4]}
    return bars, live


def main(out="bars.json"):
    result, lives, failed = {}, {}, []
    for p in PAIRS:
        try:
            bars, live = fetch_pair(p)
            bars = bars[-KEEP:]
            result[p] = bars
            lives[p] = live
            last = datetime.fromtimestamp(bars[-1][0] / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")
            print(f"{p}: {len(bars)} 4H bars, last bar opened {last} UTC")
        except Exception as e:
            failed.append(p)
            print(f"{p}: FAILED {e}", file=sys.stderr)
        time.sleep(0.4)  # be polite to the free endpoint
    if len(result) < 7:
        print(f"Only {len(result)} pairs downloaded. Not writing {out}.", file=sys.stderr)
        sys.exit(1)
    with open(out, "w") as f:
        now = datetime.now(timezone.utc)
        json.dump({"fetched": now.strftime("%d %b %Y %H:%M UTC"), "fetchedTs": int(now.timestamp() * 1000),
                   "tf": "4H", "bars": result, "live": lives}, f, separators=(",", ":"))
    print(f"Wrote {out}: {len(result)} pairs, {len(failed)} failed {failed if failed else ''}")


if __name__ == "__main__":
    main(*sys.argv[1:2])
