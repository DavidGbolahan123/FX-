#!/usr/bin/env node
/* Run the same engine as the page. Reads docs/data.json, writes docs/signals.md and docs/signals.json.
   Usage: node signals.js [dataJson] [outDir] */
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

const dataPath = process.argv[2] || 'docs/data.json';
const outDir = process.argv[3] || 'docs';
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
let macro = d.macro || E.DEFAULT_MACRO, asof = d.asof || E.MACRO_ASOF;
macro = JSON.parse(JSON.stringify(macro));
for (const c of E.CCY) if (macro[c]) macro[c].news = (d.pulse && d.pulse[c]) || 0;

const bars = {};
for (const p in d.bars) bars[p] = d.bars[p].map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }));

const cs = E.currencyScores(macro);
const f = (v, n = 0) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(n);
const px = (v, p) => v.toFixed(p.endsWith('JPY') ? 3 : 5);
const TIER = { strong: 'Strong', moderate: 'Moderate', watch: 'Watch', conflict: 'Conflict', macro: 'Macro only', none: 'No edge' };

const rows = E.PAIRS.map(p => {
  const mp = E.macroPair(p, cs);
  const tech = bars[p] ? E.techScore(bars[p], p) : null;
  const cb = E.combine(mp.score, tech);
  const plan = (cb.tier === 'strong' || cb.tier === 'moderate') ? E.tradePlan(tech, cb.dir) : null;
  const live = d.live && d.live[p] ? d.live[p].price : null;
  return { pair: p, macro: mp.score, tech: tech ? tech.score : null, combined: cb.combined, tier: cb.tier, dir: cb.dir, plan, live,
           flags: tech ? tech.flags : [], notes: tech ? tech.notes : [], drivers: mp.drivers.slice(0, 2).map(x => x.label) };
}).sort((a, b) => Math.abs(b.combined) - Math.abs(a.combined));

const act = rows.filter(r => r.tier === 'strong' || r.tier === 'moderate');
const L = ['# Confluence FX signals', '', `Prices fetched ${d.fetched || 'n/a'} (${d.tf || 'daily'} bars). Macro as of ${asof}.`, ''];
if (!act.length) L.push('No pair has macro and chart aligned right now.', '');
act.forEach(r => {
  L.push(`## ${r.pair} ${r.dir > 0 ? 'LONG' : 'SHORT'} (${TIER[r.tier]})`);
  L.push(`Macro ${f(r.macro)} | Chart ${f(r.tech)} | Combined ${f(r.combined)}${r.live ? ' | Live ' + px(r.live, r.pair) : ''}`);
  L.push(`Entry ${px(r.plan.entry, r.pair)} | SL ${px(r.plan.sl, r.pair)} (${r.plan.stopPips.toFixed(0)} pips) | TP1 ${px(r.plan.tp1, r.pair)} | TP2 ${px(r.plan.tp2, r.pair)}`);
  r.notes.slice(0, 2).forEach(n => L.push('- ' + n));
  r.flags.filter(x => !/Fewer than/.test(x)).forEach(n => L.push('- Caution: ' + n));
  L.push('');
});
const conf = rows.filter(r => r.tier === 'conflict').map(r => r.pair);
if (conf.length) L.push(`Conflicts, skip: ${conf.join(', ')}`, '');
L.push('Not financial advice.');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'signals.md'), L.join('\n'));
fs.writeFileSync(path.join(outDir, 'signals.json'), JSON.stringify({ fetched: d.fetched, fetchedTs: d.fetchedTs, macroAsOf: asof, signals: rows }, null, 1));
console.log(L.join('\n'));
