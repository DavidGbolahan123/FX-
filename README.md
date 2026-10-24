# Confluence FX, live

Every 15 minutes while the FX market is open, this pulls prices, news and the economic calendar, scores all 28 G10 pairs on macro and 4-hour chart structure, publishes a page you can open on your phone, and sends Telegram alerts when something changes.

## What it does
- **Live price action.** 4-hour bars for all 28 pairs, a live quote on top, and a Live line on the chart. The page shows how far price is from the entry reference and whether a stop or target level has been reached.
- **Fundamentals.** Rates, real yields, priced policy paths, labour and CPI feed the macro score. US numbers refresh themselves if you add a free FRED key. A headline-tone factor (6% weight) comes from the latest central bank and FX news.
- **News and releases.** Headlines from the Fed, ECB, BoE, BoC, RBA and FXStreet, and a calendar of medium and high impact releases in your local time. Pairs get a warning when a high-impact release for either currency is within 24 hours.
- **Telegram alerts.** New signal, signal flips or ends, a stop or target level reached, and one hour before high-impact releases.
- **Phone first.** The page re-checks for new data every minute and when you come back to the tab.

## Set it up from your phone (about 20 minutes)
1. In your Files app, unzip this folder.
2. In your phone browser, sign in at github.com and create a new **public** repository. Public matters: it keeps the scheduled runs free.
3. Add the files: tap Add file, then Upload files, and choose everything from the unzipped folder.
4. Add the workflow, because phones usually skip hidden folders: tap Add file, then Create new file. In the name box type `.github/workflows/daily.yml` (typing the slashes creates the folders). Open `daily.yml` from the unzipped folder, copy all of it, paste it in, and commit.
5. Go to Settings, then Pages, and set Source to **GitHub Actions**.
6. Go to the Actions tab, open "Confluence FX live update" and tap Run workflow. After a few minutes your page is at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`. Open it and use Add to Home Screen.

## Turn on Telegram alerts
1. In Telegram, message **@BotFather**, send `/newbot` and follow the prompts. Copy the token it gives you.
2. Open your new bot and send it any message, such as "hi".
3. In your browser open `https://api.telegram.org/botYOUR_TOKEN/getUpdates`. Find `"chat":{"id":123456789` and copy that number.
4. In your GitHub repository go to Settings, Secrets and variables, Actions, and add two secrets: `TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID`.
5. Run the workflow once. You get an "alerts are on" message listing what is actionable now.

## Optional: automatic US macro
Get a free key at fred.stlouisfed.org (My Account, API Keys) and add it as a secret named `FRED_API_KEY`. The US policy rate, CPI and unemployment then update on their own.

## What still needs you
- **Priced rate paths and the other currencies' macro.** No free feed gives market-priced rate expectations. After each central bank meeting or big data release, update `macro.json` (rate, CPI, unemployment, priced path in basis points, tilt, and the `asof` date). The page warns when macro data is more than 14 days old. You can edit the file on the GitHub website and commit.
- **Central bank dates.** The dated list in `engine.js` under `EVENTS` covers central bank meetings. The live release calendar updates by itself.

## Limits to know
- GitHub's scheduler can run late by 5 to 30 minutes, so this is near-live, not tick-live. The page tells you how old the prices are and warns when the feed is late.
- Yahoo Finance and the calendar and news feeds are free and unofficial. They can rate-limit, change format or go down. Failed news or calendar steps are skipped. If prices fail, the previous page stays up.
- Headline tone is a keyword count, not a reading of the article. It is a small nudge.
- A private repository uses GitHub's monthly free minutes quickly at this schedule. Keep it public, or change the cron lines in `daily.yml` to every 30 or 60 minutes.
- Not financial advice. Check spreads, news and your own risk before trading.

## Files
`fetch_prices.py` 4H bars and live quote · `fetch_news.py` headlines and tone · `fetch_calendar.py` releases · `fred_macro.py` US macro · `build.py` page and `data.json` · `signals.js` scoring and `signals.md` · `alerts.js` Telegram · `engine.js` scoring engine · `app.template.html` page · `feeds.json` news sources · `macro.json` your macro inputs · `.github/workflows/daily.yml` the schedule.

## Run on a computer instead
    python fetch_prices.py bars.json && python fetch_news.py news.json && python fetch_calendar.py calendar.json
    python build.py docs && node signals.js docs/data.json docs
Open `docs/index.html`.
