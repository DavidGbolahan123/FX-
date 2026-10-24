#!/usr/bin/env python3
"""Optional: refresh the US macro inputs from FRED when FRED_API_KEY is set. Writes fred.json.

Covers the Fed funds target mid, CPI year-on-year (and the month before), and the unemployment rate (and the month before).
Other currencies and the priced rate path stay in macro.json, because free official series for them arrive weeks late
and no free feed gives market-priced rate paths.
"""
import json
import os
import sys
import urllib.request

KEY = os.environ.get("FRED_API_KEY")


def series(sid, n):
    url = (f"https://api.stlouisfed.org/fred/series/observations?series_id={sid}&api_key={KEY}"
           f"&file_type=json&sort_order=desc&limit={n}")
    obs = json.loads(urllib.request.urlopen(url, timeout=25).read().decode())["observations"]
    return [float(o["value"]) for o in obs if o["value"] not in (".", "")]


def main(out="fred.json"):
    if not KEY:
        print("FRED_API_KEY not set. Skipping.")
        return
    cpi = series("CPIAUCSL", 15)   # index level, newest first
    un = series("UNRATE", 2)
    hi, lo = series("DFEDTARU", 1)[0], series("DFEDTARL", 1)[0]
    yoy = lambda i: round((cpi[i] / cpi[i + 12] - 1) * 100, 1)
    us = {"rate": round((hi + lo) / 2, 3), "cpi": yoy(0), "cpiPrev": yoy(1), "unemp": un[0], "unempPrev": un[1]}
    json.dump({"USD": us}, open(out, "w"))
    print("FRED US inputs:", us)


if __name__ == "__main__":
    main(*sys.argv[1:2])
