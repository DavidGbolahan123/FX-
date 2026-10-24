#!/usr/bin/env node
/* Send Telegram alerts when something changes. Needs TELEGRAM_TOKEN and TELEGRAM_CHAT_ID; without them it only prints.
   Reads docs/signals.json and docs/data.json. Keeps its memory in state/alerts.json between runs.
   Usage: node alerts.js [docsDir] [stateDir] */
const fs = require('fs');
const path = require('path');
const docs = process.argv[2] || 'docs', stateDir = process.argv[3] || 'state';
const sig = JSON.parse(fs.readFileSync(path.join(docs, 'signals.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(docs, 'data.json'), 'utf8'));
const statePath = path.join(stateDir, 'alerts.json');
const first = !fs.existsSync(statePath);
const st = first ? { pairs: {}, events: [] } : JSON.parse(fs.readFileSync(statePath, 'utf8'));
const px = (v, p) => v.toFixed(p.endsWith('JPY') ? 3 : 5);
const isAct = r => r.tier === 'strong' || r.tier === 'moderate';
const name = p => p.slice(0, 3) + '/' + p.slice(3);
const msgs = [];

for (const r of sig.signals) {
  const s = st.pairs[r.pair];
  if (isAct(r)) {
    if (!s || s.dir !== r.dir) {
      st.pairs[r.pair] = { dir: r.dir, tier: r.tier, plan: r.plan, hit: null, miss: 0 };
      if (!first) msgs.push(`${r.dir > 0 ? 'NEW LONG' : 'NEW SHORT'} ${name(r.pair)} (${r.tier})\nMacro ${r.macro.toFixed(0)} | Chart ${r.tech.toFixed(0)}\nEntry ${px(r.plan.entry, r.pair)} | SL ${px(r.plan.sl, r.pair)} | TP1 ${px(r.plan.tp1, r.pair)} | TP2 ${px(r.plan.tp2, r.pair)}\n${r.notes[0] || ''}`);
    } else {
      s.miss = 0;
      if (s.tier === 'moderate' && r.tier === 'strong') msgs.push(`UPGRADED ${name(r.pair)} ${r.dir > 0 ? 'LONG' : 'SHORT'} is now Strong (combined ${r.combined.toFixed(0)})`);
      s.tier = r.tier;
    }
  } else if (s) {
    s.miss = (s.miss || 0) + 1;
    if (s.miss >= 3) {
      msgs.push(`SIGNAL ENDED ${name(r.pair)} ${s.dir > 0 ? 'LONG' : 'SHORT'} no longer has macro and chart aligned. Review any open trade.`);
      delete st.pairs[r.pair];
      continue;
    }
  }
  const s2 = st.pairs[r.pair];
  if (s2 && s2.plan && r.live && s2.hit !== 'sl' && s2.hit !== 'tp2') {
    const d = s2.dir, p = s2.plan, v = r.live;
    let hit = null;
    if (v * d <= p.sl * d) hit = 'sl'; else if (v * d >= p.tp2 * d) hit = 'tp2'; else if (v * d >= p.tp1 * d) hit = 'tp1';
    if (hit && hit !== s2.hit) {
      s2.hit = hit;
      const lab = { sl: 'STOP LEVEL BREACHED', tp1: 'TARGET 1 REACHED', tp2: 'TARGET 2 REACHED' }[hit];
      msgs.push(`${lab} ${name(r.pair)} ${d > 0 ? 'LONG' : 'SHORT'}\nLive ${px(v, r.pair)} against ${hit === 'sl' ? 'SL ' + px(p.sl, r.pair) : hit === 'tp1' ? 'TP1 ' + px(p.tp1, r.pair) : 'TP2 ' + px(p.tp2, r.pair)}`);
    }
  }
}

const now = Date.now();
st.events = (st.events || []).filter(e => now - e.ts < 2 * 86400000);
for (const e of data.calendar || []) {
  if (e.impact !== 'High') continue;
  const mins = (e.ts - now) / 60000, id = `${e.ts}|${e.ccy}|${e.title}`;
  if (mins > 0 && mins <= 60 && !st.events.some(x => x.id === id)) {
    st.events.push({ id, ts: e.ts });
    if (!first) msgs.push(`HIGH IMPACT in ${Math.round(mins)} min: ${e.ccy} ${e.title}${e.forecast ? '\nForecast ' + e.forecast : ''}${e.previous ? ' | Previous ' + e.previous : ''}\nAvoid fresh ${e.ccy} entries until it settles.`);
  }
}

if (first) {
  const act = sig.signals.filter(isAct);
  msgs.push('Confluence FX alerts are on.\n' + (act.length ? 'Actionable now: ' + act.map(r => `${name(r.pair)} ${r.dir > 0 ? 'LONG' : 'SHORT'}`).join(', ') : 'No pair is actionable right now.') + '\nI will message you when a signal appears, flips, ends, or hits a level, and an hour before high-impact releases.');
}

fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(statePath, JSON.stringify(st));

(async () => {
  if (!msgs.length) { console.log('No alerts this run.'); return; }
  const text = msgs.join('\n\n');
  console.log(text);
  const { TELEGRAM_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) { console.log('\n(Telegram not configured, alerts printed only.)'); return; }
  const res = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true })
  });
  if (!res.ok) { console.error('Telegram error', res.status, await res.text()); process.exit(1); }
})();
