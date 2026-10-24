/* ===== Confluence FX engine: pure functions, no DOM ===== */
const CCY = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
const PAIRS = [];
for (let i = 0; i < CCY.length; i++) for (let j = i + 1; j < CCY.length; j++) PAIRS.push(CCY[i] + CCY[j]);

const MACRO_ASOF = (typeof window !== 'undefined' && window.CFX_ASOF) || '2026-10-23';

/* path = expected change in the policy rate over roughly 12 months, in basis points, from market pricing and economist polls.
   tilt = analyst adjustment from -2 to +2 for what the numbers do not capture (growth, labour, risk tone). */
const _MACRO_BASE = {
  USD: { bank: 'Fed', rate: 3.875, cpi: 3.7, cpiPrev: 3.4, unemp: 4.2, unempPrev: 4.1, path: 25, tilt: -0.5,
    note: 'Fed funds 3.75 to 4.00% after a 25bp hike on 16 Sep. Hold expected 28 Oct, December hike priced near 94%. CPI 3.7%, core 2.6%. September payrolls +29k, unemployment 4.2%.' },
  EUR: { bank: 'ECB', rate: 2.5, cpi: 3.8, cpiPrev: 3.2, unemp: null, unempPrev: null, path: 30, tilt: 0,
    note: 'Deposit rate 2.50% after a 25bp hike in September. Hold on 29 Oct expected by 70 of 73 economists, December hike by 64 of 73. Flash HICP 3.8%, core 2.5%, highest since Sep 2023.' },
  GBP: { bank: 'BoE', rate: 3.75, cpi: 3.5, cpiPrev: 3.1, unemp: 4.7, unempPrev: 4.9, path: 100, tilt: 0,
    note: 'Bank Rate 3.75%. September hold was 6 to 3, three votes for a hike. A 5 Nov hike is priced as near certain, about four hikes by mid-2027. Regular pay +3.7%, unemployment 4.7%.' },
  JPY: { bank: 'BoJ', rate: 1.25, cpi: 2.1, cpiPrev: 1.9, unemp: null, unempPrev: null, path: 25, tilt: 0,
    note: 'Policy rate 1.25% after a 25bp hike in September (7 to 2 vote). October hike under 5% priced, December about 80%. Real rate stays deeply negative.' },
  CHF: { bank: 'SNB', rate: 0, cpi: 1.0, cpiPrev: 0.8, unemp: null, unempPrev: null, path: 0, tilt: 0,
    note: 'SNB held 0% on 24 Sep, the fifth hold. Willing to act in FX as necessary. Next meeting 10 Dec. CPI 1.0%. Surveys see no hike before 2027 or 2028.' },
  AUD: { bank: 'RBA', rate: 4.6, cpi: 4.0, cpiPrev: 3.5, unemp: 4.7, unempPrev: null, path: 10, tilt: -0.5,
    note: 'Cash rate 4.60% after a hike on 30 Sep, a 15-year high. September unemployment 4.7%, a five-year high, employment down about 40k. Hold expected 3 Nov, risk still leans to a hike.' },
  NZD: { bank: 'RBNZ', rate: 2.75, cpi: 3.7, cpiPrev: 4.1, unemp: null, unempPrev: null, path: 60, tilt: 0,
    note: 'OCR 2.75%. A 25bp hike to 3.00% on 28 Oct is priced near 80%. BNZ sees a 3.75% peak. Q3 CPI 3.7% y/y against 4.1% in Q2.' },
  CAD: { bank: 'BoC', rate: 2.25, cpi: 3.1, cpiPrev: 3.0, unemp: null, unempPrev: null, path: 0, tilt: -0.5,
    note: 'Overnight rate 2.25%, unchanged since Oct 2025. Hold expected 28 Oct. CPI 3.1%, below the 3.2% consensus. Jobs fell in August and September.' }
};
const DEFAULT_MACRO = (typeof window !== 'undefined' && window.CFX_MACRO) || _MACRO_BASE;

const EVENTS = [
  { d: '2026-10-28', ccy: ['USD'], t: 'Fed decision', x: 'Hold expected, December hike priced' },
  { d: '2026-10-28', ccy: ['CAD'], t: 'BoC decision and MPR', x: 'Hold expected at 2.25%' },
  { d: '2026-10-28', ccy: ['NZD'], t: 'RBNZ decision', x: 'Hike to 3.00% priced near 80%' },
  { d: '2026-10-29', ccy: ['EUR'], t: 'ECB decision', x: 'Hold expected, December hike signalled' },
  { d: '2026-10-29', ccy: ['USD'], t: 'US Q3 GDP and September PCE', x: 'Inflation and growth read before the Fed hikes again' },
  { d: '2026-10-30', ccy: ['JPY'], t: 'BoJ decision', x: 'Hold expected, December hike about 80%' },
  { d: '2026-11-03', ccy: ['AUD'], t: 'RBA decision', x: 'Hold expected, hike risk remains' },
  { d: '2026-11-05', ccy: ['GBP'], t: 'BoE decision', x: 'Hike to 4.00% priced as near certain' },
  { d: '2026-12-10', ccy: ['CHF'], t: 'SNB decision', x: 'Hold at 0% expected' }
];

const MACRO_WEIGHTS = { path: 30, real: 20, carry: 15, infl: 10, labour: 15, tilt: 10, news: 6 };
const SCORE_DIV = 100; // fixed so adding a factor does not rescale the others
const FACTOR_LABELS = {
  path: 'Rate path priced', real: 'Real policy rate', carry: 'Yield level',
  infl: 'Inflation momentum', labour: 'Labour trend', tilt: 'Analyst tilt', news: 'Headline tone'
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sign = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

/* ---------- macro ---------- */
function macroFactors(macro) {
  const ccys = Object.keys(macro);
  const rates = ccys.map(c => macro[c].rate);
  const reals = ccys.map(c => macro[c].rate - macro[c].cpi);
  const mRate = mean(rates), mReal = mean(reals);
  const out = {};
  ccys.forEach(c => {
    const m = macro[c];
    const hasLab = m.unemp != null && m.unempPrev != null && !isNaN(m.unemp) && !isNaN(m.unempPrev);
    out[c] = {
      path: clamp((m.path || 0) / 40, -2, 2),
      real: clamp((m.rate - m.cpi - mReal) / 0.8, -2, 2),
      carry: clamp((m.rate - mRate) / 1.0, -2, 2),
      infl: clamp((m.cpi - m.cpiPrev) / 0.3, -2, 2),
      labour: hasLab ? clamp(-(m.unemp - m.unempPrev) / 0.3, -2, 2) : 0,
      tilt: clamp(m.tilt || 0, -2, 2),
      news: clamp((m.news || 0) * 2, -2, 2)
    };
  });
  return out;
}

function currencyScores(macro) {
  const f = macroFactors(macro);
  const total = SCORE_DIV;
  const scores = {};
  Object.keys(f).forEach(c => {
    let s = 0;
    for (const k in MACRO_WEIGHTS) s += MACRO_WEIGHTS[k] * f[c][k];
    scores[c] = (s / total) * 50; // -100..100
  });
  return { scores, factors: f };
}

function macroPair(pair, cs) {
  const b = pair.slice(0, 3), q = pair.slice(3);
  const score = clamp(cs.scores[b] - cs.scores[q], -100, 100);
  const total = SCORE_DIV;
  const drivers = Object.keys(MACRO_WEIGHTS).map(k => ({
    key: k, label: FACTOR_LABELS[k],
    value: (MACRO_WEIGHTS[k] * (cs.factors[b][k] - cs.factors[q][k]) / total) * 50,
    base: cs.factors[b][k], quote: cs.factors[q][k]
  })).sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  return { score, drivers };
}

/* ---------- indicators ---------- */
function ema(arr, n) {
  const out = new Array(arr.length).fill(null);
  if (arr.length < n) return out;
  let s = 0;
  for (let i = 0; i < n; i++) s += arr[i];
  let e = s / n;
  out[n - 1] = e;
  const k = 2 / (n + 1);
  for (let i = n; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

function atrSeries(bars, n = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length <= n) return out;
  const tr = bars.map((b, i) => i === 0 ? b.h - b.l :
    Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)));
  let a = mean(tr.slice(1, n + 1));
  out[n] = a;
  for (let i = n + 1; i < bars.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}

function rsiSeries(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
    l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

function macdHist(closes) {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const line = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const first = line.findIndex(v => v != null);
  if (first < 0) return null;
  const sig = ema(line.slice(first), 9);
  const last = line.length - 1;
  const sv = sig[sig.length - 1];
  if (sv == null) return null;
  return { line: line[last], signal: sv, hist: line[last] - sv };
}

/* ---------- technical score ---------- */
function techScore(bars, pair) {
  if (!bars || bars.length < 60) return null;
  const closes = bars.map(b => b.c);
  const n = bars.length, last = bars[n - 1];
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const atrS = atrSeries(bars), rsiS = rsiSeries(closes);
  const atr = atrS[n - 1], rsi = rsiS[n - 1];
  const md = macdHist(closes);
  if (atr == null || rsi == null || !md) return null;
  const c = last.c, E20 = e20[n - 1], E50 = e50[n - 1], E200 = e200[n - 1];
  const has200 = E200 != null;
  const slope50 = e50[n - 1] - e50[n - 11];

  // trend
  const checks = [
    sign(c - E50),
    has200 ? sign(E50 - E200) : sign(E20 - E50),
    has200 ? sign(c - E200) : sign(c - E20),
    sign(slope50)
  ];
  const trend = mean(checks);

  // momentum
  const macdN = Math.tanh(md.hist / (0.15 * atr));
  let rsiN = clamp((rsi - 50) / 20, -1, 1);
  if (rsi > 78) rsiN = 0.3;
  if (rsi < 22) rsiN = -0.3;
  const mom = 0.6 * macdN + 0.4 * rsiN;

  // structure
  const w55 = bars.slice(-55), HH55 = Math.max(...w55.map(b => b.h)), LL55 = Math.min(...w55.map(b => b.l));
  const pos = HH55 === LL55 ? 0 : ((c - LL55) / (HH55 - LL55) - 0.5) * 2;
  const prior20 = bars.slice(-21, -1);
  const HH20 = Math.max(...prior20.map(b => b.h)), LL20 = Math.min(...prior20.map(b => b.l));
  let brk = 0;
  if (c >= HH20) brk = 0.5; else if (c <= LL20) brk = -0.5;
  const struct = clamp(pos + brk, -1, 1);

  // rate of change
  const roc = Math.tanh(((c - bars[n - 21].c) / atr) / 3);

  const score = 100 * (0.35 * trend + 0.25 * mom + 0.25 * struct + 0.15 * roc);

  const pip = pair && pair.slice(3) === 'JPY' ? 0.01 : 0.0001;
  const sw10L = Math.min(...bars.slice(-10).map(b => b.l));
  const sw10H = Math.max(...bars.slice(-10).map(b => b.h));
  const flags = [];
  if (Math.abs(c - E20) > 2 * atr) flags.push('Extended from the 20 EMA by more than 2 ATR. Wait for a pullback.');
  if (rsi > 75) flags.push('RSI above 75, stretched to the upside.');
  if (rsi < 25) flags.push('RSI below 25, stretched to the downside.');
  if (!has200) flags.push('Fewer than 200 bars loaded. Trend uses the 20 and 50 EMA instead of the 200.');

  const notes = [];
  notes.push(`Close ${c >= E50 ? 'above' : 'below'} the 50 EMA${has200 ? ' and ' + (c >= E200 ? 'above' : 'below') + ' the 200 EMA' : ''}; 50 EMA ${slope50 >= 0 ? 'rising' : 'falling'}.`);
  notes.push(`MACD histogram ${md.hist >= 0 ? 'positive' : 'negative'}, RSI ${rsi.toFixed(0)}.`);
  if (brk > 0) notes.push('Closing above the prior 20-bar high.');
  else if (brk < 0) notes.push('Closing below the prior 20-bar low.');
  else notes.push(`Price sits at ${(((c - LL55) / (HH55 - LL55)) * 100).toFixed(0)}% of its 55-bar range.`);

  return {
    score,
    parts: { trend: trend * 100, mom: mom * 100, struct: struct * 100, roc: roc * 100 },
    ind: { close: c, ema20: E20, ema50: E50, ema200: E200, rsi, atr, atrPips: atr / pip, hist: md.hist, hh20: HH20, ll20: LL20, sw10L, sw10H, pip, n, date: last.t },
    series: { ema50: e50, ema200: e200 },
    flags, notes
  };
}

/* ---------- combination ---------- */
function combine(macroScore, tech) {
  const m = macroScore;
  if (!tech) {
    const dir = Math.abs(m) >= 40 ? sign(m) : 0;
    return { combined: m, tier: dir ? 'macro' : 'none', dir, aligned: false };
  }
  const t = tech.score;
  const combined = 0.5 * m + 0.5 * t;
  const aligned = sign(m) === sign(t) && Math.abs(m) >= 15 && Math.abs(t) >= 15;
  const conflict = sign(m) !== 0 && sign(t) !== 0 && sign(m) !== sign(t) && Math.abs(m) >= 20 && Math.abs(t) >= 20;
  let tier = 'none', dir = 0;
  if (aligned && Math.abs(combined) >= 45) { tier = 'strong'; dir = sign(combined); }
  else if (aligned && Math.abs(combined) >= 25) { tier = 'moderate'; dir = sign(combined); }
  else if (aligned) { tier = 'watch'; dir = sign(combined); }
  else if (conflict) { tier = 'conflict'; }
  return { combined, tier, dir, aligned };
}

function tradePlan(tech, dir) {
  if (!tech || !dir) return null;
  const { close, atr, sw10L, sw10H, pip } = tech.ind;
  const structural = dir > 0 ? (close - sw10L) + 0.25 * atr : (sw10H - close) + 0.25 * atr;
  const dist = clamp(structural, 1.2 * atr, 2.5 * atr);
  const sl = close - dir * dist;
  return {
    dir, entry: close, sl,
    tp1: close + dir * 1.5 * dist, tp2: close + dir * 3 * dist,
    stopPips: dist / pip, tp1Pips: 1.5 * dist / pip, tp2Pips: 3 * dist / pip
  };
}

/* ---------- CSV parsing ---------- */
function splitCSVLine(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === d && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseNum(s, decComma) {
  if (s == null) return NaN;
  let v = String(s).replace(/\s/g, '');
  if (decComma || /^-?\d+,\d+$/.test(v)) v = v.replace(',', '.'); else v = v.replace(/,/g, '');
  return parseFloat(v);
}

function parseDate(s) {
  if (s == null) return NaN;
  const v = String(s).trim();
  if (/^\d{13}$/.test(v)) return +v;
  if (/^\d{9,10}$/.test(v)) return +v * 1000;
  let m = v.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = v.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  const t = Date.parse(v + (/[zZ]|[+-]\d{2}:?\d{2}$|GMT|UTC/.test(v) ? '' : ' UTC'));
  return isNaN(t) ? Date.parse(v) : t;
}

function parseCSV(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 3) return { bars: [], error: 'File has too few rows.' };
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const d in counts) counts[d] = (lines[0].split(d).length - 1);
  const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (!counts[delim]) return { bars: [], error: 'Could not find columns. Use a comma, semicolon or tab separated file.' };
  const decComma = delim === ';';
  const rows = lines.map(l => splitCSVLine(l, delim));
  let idx = { t: 0, o: 1, h: 2, l: 3, c: 4 }, start = 0;
  const head = rows[0].map(s => s.toLowerCase().replace(/[<>]/g, ''));
  if (head.some(s => /[a-z]/.test(s)) && !rows[0].slice(1, 5).every(s => !isNaN(parseNum(s, decComma)))) {
    const find = re => head.findIndex(s => re.test(s));
    const t = find(/date|time/), o = find(/^open|^o$/), h = find(/^high|^h$/), l = find(/^low|^l$/), c = find(/^close|^c$|^price|^last/);
    if ([t, o, h, l, c].some(i => i < 0)) return { bars: [], error: 'Need Date, Open, High, Low and Close columns.' };
    const tm = head.findIndex((s, i) => i !== t && /^time$/.test(s));
    idx = { t, o, h, l, c, tm }; start = 1;
  }
  const byDay = new Map();
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const t = parseDate(idx.tm >= 0 ? r[idx.t] + ' ' + r[idx.tm] : r[idx.t]);
    const o = parseNum(r[idx.o], decComma), h = parseNum(r[idx.h], decComma), l = parseNum(r[idx.l], decComma), c = parseNum(r[idx.c], decComma);
    if ([t, o, h, l, c].some(v => !isFinite(v)) || h < l || o <= 0 || c <= 0 || l <= 0) continue;
    byDay.set(t, { t, o, h, l, c });
  }
  const bars = [...byDay.values()].sort((a, b) => a.t - b.t);
  if (bars.length < 3) return { bars: [], error: 'No valid rows found.' };
  return { bars };
}

function detectPair(name) {
  const letters = String(name).toUpperCase().replace(/[^A-Z]/g, '');
  for (let i = 0; i + 6 <= letters.length; i++) {
    const a = letters.slice(i, i + 3), b = letters.slice(i + 3, i + 6);
    if (CCY.includes(a) && CCY.includes(b) && a !== b) {
      const p = a + b;
      if (PAIRS.includes(p)) return { pair: p, inverted: false };
      if (PAIRS.includes(b + a)) return { pair: b + a, inverted: true };
    }
  }
  return null;
}

function invertBars(bars) {
  return bars.map(b => ({ t: b.t, o: 1 / b.o, h: 1 / b.l, l: 1 / b.h, c: 1 / b.c }));
}

if (typeof module !== 'undefined') module.exports = {
  CCY, PAIRS, DEFAULT_MACRO, MACRO_ASOF, EVENTS, currencyScores, macroPair, techScore, combine, tradePlan,
  parseCSV, detectPair, invertBars, ema, rsiSeries, atrSeries
};
