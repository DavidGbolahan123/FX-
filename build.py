#!/usr/bin/env python3
"""Merge prices, live quotes, news, calendar and macro into docs/data.json, and bake the same data into docs/index.html.

Inputs (all optional except bars.json for a useful page): bars.json, news.json, calendar.json, fred.json, macro.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
path = lambda n: os.path.join(HERE, n)


def load(name, default=None):
    p = path(name)
    if not os.path.exists(p):
        return default
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception as e:
        print(f"Could not read {name}: {e}", file=sys.stderr)
        return default


def main(out_dir="docs"):
    bars, news, cal = load("bars.json", {}), load("news.json", {}), load("calendar.json", {})
    macro, fred = load("macro.json", {}), load("fred.json", {})
    if macro and fred:
        for c, fields in fred.items():
            macro["macro"].setdefault(c, {}).update(fields)
    data = {
        "fetched": bars.get("fetched"), "fetchedTs": bars.get("fetchedTs"), "tf": bars.get("tf", "1D"),
        "bars": bars.get("bars", {}), "live": bars.get("live", {}),
        "news": news.get("news", []), "pulse": news.get("pulse", {}), "newsTs": news.get("fetchedTs"),
        "calendar": cal.get("events", []),
        "macro": macro.get("macro"), "asof": macro.get("asof"),
    }
    if not data["bars"]:
        print("No prices in bars.json. The page will start empty.", file=sys.stderr)
    os.makedirs(os.path.join(HERE, out_dir), exist_ok=True)
    blob = json.dumps(data, separators=(",", ":"))
    open(os.path.join(HERE, out_dir, "data.json"), "w", encoding="utf-8").write(blob)

    inject = ["window.CFX_DATA=" + blob + ";"]
    if data["macro"]:
        inject.append("window.CFX_MACRO=" + json.dumps(data["macro"], separators=(",", ":")) + ";")
        inject.append("window.CFX_ASOF=" + json.dumps(data["asof"]) + ";")
    template = open(path("app.template.html"), encoding="utf-8").read()
    engine = open(path("engine.js"), encoding="utf-8").read()
    body = template.replace("/*PRICES*/", "\n".join(inject).replace("</", "<\\/")).replace("/*ENGINE*/", engine)
    page = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#0b1119">'
            '<style>body{margin:0}</style></head><body>' + body + "</body></html>")
    open(os.path.join(HERE, out_dir, "index.html"), "w", encoding="utf-8").write(page)
    print(f"Wrote {out_dir}/index.html ({len(page) // 1024} KB) and {out_dir}/data.json ({len(blob) // 1024} KB)")


if __name__ == "__main__":
    main(*sys.argv[1:2])
