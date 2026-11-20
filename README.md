# SA AI TRADER

A read-only XAUUSD / GOLD trading analysis terminal built with React, TypeScript, Tailwind CSS, Cloudflare Workers, Cloudflare D1, and a MetaTrader 5 Expert Advisor bridge (`SA_AI_TRADER_BRIDGE.mq5`) for XM accounts.

> **Important Safety Notice:** SA AI TRADER is strictly analytical and **read-only**. It never executes, modifies, or closes trades, never asks for your MT5 trading password, and never fabricates candles or market prices.

---

## Project Structure

- `src/` — React + TypeScript + Vite frontend terminal
  - `src/components/` — Header, MarketHeader, interactive HTML5 Canvas `CandlestickChart`, `SignalPanel`, `MarketStatusPanel`, `RiskCalculator`, `SignalHistory`, `ConnectionSettings`
  - `src/lib/indicators.ts` — Pure TypeScript EMA (9/21/50/200), RSI (14), MACD (12/26/9), ATR (14), Bollinger Bands, S/R clustering, and BOS/CHOCH market structure analysis
  - `src/lib/signalEngine.ts` — Transparent rule-based signal engine with strict `WAIT` fail-safes
  - `src/lib/riskCalculator.ts` — XM GOLD position sizing calculator
  - `src/lib/validation.ts` — Input validation & constant-time auth comparison
- `worker/` — Cloudflare Worker backend API (`POST /api/bridge/mt5`, `GET /api/market/latest`, `GET /api/market/candles`, `GET /api/signals`, `GET /api/health`)
- `database/` — Cloudflare D1 SQL schema (`schema.sql`) and migrations (`migrations/0001_initial.sql`)
- `mt5/` — MQL5 Expert Advisor source (`SA_AI_TRADER_BRIDGE.mq5`)
- `server.ts` — Local Node/Express + Vite bridge server for local development and testing
- `docs/` — Beginner-friendly setup guides for GitHub, Cloudflare, MT5 WebRequest, and testing

---

## Completed vs External Setup Required

### Ready in Repository
- Complete React terminal UI (desktop + Samsung/Android mobile responsive)
- Real-time OHLC candlestick chart with zoom/pan, crosshair, EMA 9/21/50/200, S/R levels, Volume, RSI 14, and MACD
- Multi-confirmation rule-based signal engine with `WAIT` fail-safes (>10s stale data, missing candles, excessive spread, conflicting HTF, invalid risk)
- XM GOLD Risk Calculator with editable contract specs
- Cloudflare Worker API + D1 SQL schema & migrations
- MQL5 Expert Advisor (`mt5/SA_AI_TRADER_BRIDGE.mq5`)

### Requires Your External Setup
1. **Cloudflare Account & D1 Database**: Create a D1 database, run migrations, deploy the Worker, and set `XM_BRIDGE_TOKEN` using `wrangler secret put`.
2. **Cloudflare Pages**: Connect your GitHub repository to Cloudflare Pages and configure `VITE_API_BASE_URL` pointing to your deployed Worker URL.
3. **XM MetaTrader 5 Desktop**: Enable `WebRequest` for your Worker URL, compile `SA_AI_TRADER_BRIDGE.mq5` in MetaEditor, and attach it to your `GOLD` chart.

---

## Quick Local Start

```bash
npm install
cp .env.example .env
# Set a strong random XM_BRIDGE_TOKEN in .env for local bridge testing
npm run dev
```

Open `http://localhost:3000`. Until your MT5 EA or an authenticated test request pushes real candles, the chart will display **"Waiting for MT5 candle data"** and the Signal Engine will remain safely on **WAIT**.

---

## Free-Tier Hosting Limits & Possible Charges

- **Cloudflare Workers Free Plan**: 100,000 requests/day and 10ms CPU time per invocation. Sending MT5 updates every 4 seconds equals ~21,600 POST requests/day (plus dashboard polling). If you keep multiple browser tabs open 24/7 polling every 3s (~28,800 GETs/tab/day), you can approach the 100,000/day free request cap; staying on 1–2 active tabs or increasing poll intervals keeps usage inside the free tier. Workers Paid starts at $5/month if exceeded.
- **Cloudflare D1 Free Plan**: 5 million row reads/day, 100,000 row writes/day, 5 GB storage. Note that writing 220 candles across 7 timeframes on *every* 4-second push would exceed 100k row writes/day if done continuously 24/7; in high-frequency production, reduce `InpCandlesCount` after initial backfill or send only recent 5–10 bars on steady ticks, or upgrade to Workers Paid ($5/mo includes 50M row writes/mo).
- **Cloudflare Pages Free Plan**: Unlimited static bandwidth and 500 builds/month.

See the `docs/` folder for step-by-step guides:
- [`docs/GITHUB_SETUP.md`](docs/GITHUB_SETUP.md)
- [`docs/CLOUDFLARE_DEPLOYMENT.md`](docs/CLOUDFLARE_DEPLOYMENT.md)
- [`docs/MT5_WEBREQUEST_SETUP.md`](docs/MT5_WEBREQUEST_SETUP.md)
- [`docs/TESTING.md`](docs/TESTING.md)
