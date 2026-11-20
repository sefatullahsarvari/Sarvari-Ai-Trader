# CLOUDFLARE_SETUP.md — SA AI TRADER Deployment Guide

> **Current Status:** The codebase is prepared and verified for Cloudflare, **but it is not deployed yet**. Nothing in this guide uses invented database IDs, Worker URLs, or secrets—you will create your own real values in your Cloudflare account.

---

## Architecture Overview

| Component | Where It Runs | Source Location |
| :--- | :--- | :--- |
| Frontend Dashboard | Cloudflare Pages | `src/` (built into `dist/`) |
| Backend API | Cloudflare Worker | `worker/src/index.ts` |
| Database | Cloudflare D1 (SQLite) | `database/migrations/0001_initial.sql` |
| Read-Only Market Bridge | XM MetaTrader 5 Desktop | `mt5/SA_AI_TRADER_BRIDGE.mq5` |

---

## Manual Actions You Must Perform in Cloudflare

Before deploying, review every manual action required on your Cloudflare account:

1. **Create a Cloudflare Account** (Free plan works) and install **Wrangler CLI** on your computer.
2. **Authenticate Wrangler** (`wrangler login`) in your browser.
3. **Create a Cloudflare D1 Database** named `sa-ai-trader-db` and copy the real `database_id` returned by Cloudflare.
4. **Paste that real `database_id` into `worker/wrangler.toml`** replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
5. **Apply the D1 Database Migration** (`0001_initial.sql`) to your remote D1 database.
6. **Generate a strong random `XM_BRIDGE_TOKEN`** and store it in Cloudflare Worker Secrets (`wrangler secret put XM_BRIDGE_TOKEN`).
7. **Deploy the Cloudflare Worker** (`wrangler deploy`) and copy the real `workers.dev` URL Cloudflare assigns to you.
8. **Deploy the Frontend to Cloudflare Pages** (connect your GitHub repo or upload `dist/`) with `VITE_API_BASE_URL` set to your real Worker URL.
9. **Lock Down CORS (`ALLOWED_ORIGIN`)** in `worker/wrangler.toml` to your real Cloudflare Pages URL and re-deploy the Worker.
10. **Configure XM MetaTrader 5** (`WebRequest` allowlist + attach `SA_AI_TRADER_BRIDGE.mq5` with your Worker URL and `XM_BRIDGE_TOKEN`).

---

## Step-by-Step Instructions

### Step 1: Push Project to GitHub

1. Create a new repository on GitHub (public or private).
2. Confirm `.env` is NOT committed (`.gitignore` already excludes `.env*` while keeping `.env.example`).
3. Push all files (`src/`, `worker/`, `database/`, `mt5/`, `package.json`, `CLOUDFLARE_SETUP.md`, etc.) to GitHub.

---

### Step 2: Install & Log In to Cloudflare Wrangler

On your computer (with Node.js 18+ installed):

```bash
npm install -g wrangler
wrangler login
```

This opens your browser so you can authorize Wrangler in your Cloudflare account.

---

### Step 3: Create the Cloudflare D1 Database

Navigate into the `worker` folder and create the D1 database:

```bash
cd worker
npx wrangler d1 create sa-ai-trader-db
```

Cloudflare will print output containing your real `database_id` (a UUID).

Open `worker/wrangler.toml` and replace:

```toml
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

with the exact `database_id` from Cloudflare.

---

### Step 4: Run the D1 Migration

Apply `database/migrations/0001_initial.sql` to your remote D1 database:

```bash
npx wrangler d1 migrations apply sa-ai-trader-db --remote
```

Confirm Wrangler reports `0001_initial.sql` applied successfully.

---

### Step 5: Create and Upload Your Secret `XM_BRIDGE_TOKEN`

Generate a random secret (at least 32 characters). For example, on macOS/Linux/Git Bash:

```bash
openssl rand -hex 32
```

Upload it to Cloudflare as an encrypted Worker secret:

```bash
npx wrangler secret put XM_BRIDGE_TOKEN
```

Paste your secret when prompted.

> **Security Rules:**
> - Never paste `XM_BRIDGE_TOKEN` into `wrangler.toml`, `src/`, `.env.example`, or Cloudflare Pages environment variables.
> - Only store it in Cloudflare Worker Secrets and in the MT5 Expert Advisor input when attaching to your chart.

---

### Step 6: Deploy the Cloudflare Worker

Still inside `worker/`:

```bash
npx wrangler deploy
```

Cloudflare will deploy your Worker and print your real Worker URL (for example, `https://sa-ai-trader-worker.<your-account>.workers.dev`).

Test the health endpoint by opening `<YOUR_WORKER_URL>/api/health` in your browser or with curl:

```bash
curl https://<YOUR_WORKER_URL>/api/health
```

Verify the JSON response returns:
- `"ok": true`
- `"bridgeAuthConfigured": true`
- `"storageMode": "cloudflare-d1"`

---

### Step 7: Deploy Frontend to Cloudflare Pages

1. Log in to the **Cloudflare Dashboard**.
2. Go to **Workers & Pages** &rarr; **Create** &rarr; **Pages** &rarr; **Connect to Git**.
3. Select your **SA AI TRADER** GitHub repository.
4. Enter these exact build settings:
   - **Project name:** `sa-ai-trader` (or any name you prefer)
   - **Production branch:** `main`
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Expand **Environment variables (advanced)** and add:
   - **Variable name:** `VITE_API_BASE_URL`
   - **Value:** `https://<YOUR_WORKER_URL>` *(no trailing slash)*
6. Click **Save and Deploy**.

Cloudflare Pages will assign your real frontend URL (for example, `https://sa-ai-trader.pages.dev`).

---

### Step 8: Restrict Worker CORS to Your Pages URL

1. Open `worker/wrangler.toml` and update `ALLOWED_ORIGIN`:

```toml
[vars]
ALLOWED_ORIGIN = "https://<YOUR_PAGES_DOMAIN>"
```

*(You can comma-separate multiple origins if you also test locally, e.g. `https://sa-ai-trader.pages.dev,http://localhost:3000`.)*

2. Re-deploy the Worker from `worker/`:

```bash
npx wrangler deploy
```

---

### Step 9: Connect XM MetaTrader 5 (Read-Only)

1. Open **XM MetaTrader 5** on Windows.
2. Go to **Tools &rarr; Options &rarr; Expert Advisors**.
3. Check **Allow algorithmic trading**.
4. Check **Allow WebRequest for listed URL** and add:
   `https://<YOUR_WORKER_URL>`
5. Open **MetaEditor (`F4`)**, copy `mt5/SA_AI_TRADER_BRIDGE.mq5` into `MQL5/Experts/`, and click **Compile (`F7`)**.
6. Drag **SA_AI_TRADER_BRIDGE** onto an XM `GOLD` chart and fill in:
   - `InpApiEndpoint`: `https://<YOUR_WORKER_URL>/api/bridge/mt5`
   - `InpBridgeToken`: *(paste your `XM_BRIDGE_TOKEN`)*
   - `InpSymbol`: `GOLD` *(verify exact symbol name in Market Watch)*
   - `InpIntervalSec`: `4`
   - `InpCandlesCount`: `220`
   - `InpIncrementalBars`: `3`
7. Enable **Algo Trading** on the MT5 toolbar.

---

## Cloudflare Free-Tier Usage Notes

- **Workers Free Plan:** 100,000 requests/day, 10ms CPU/request. Keep 1–2 dashboard tabs open during normal trading to stay comfortably inside the daily request quota.
- **D1 Free Plan:** 100,000 row writes/day and 5 million row reads/day. `SA_AI_TRADER_BRIDGE.mq5` performs one initial 220-bar backfill on startup and then sends only `3` recent bars per timeframe every `4` seconds (`~21` rows per tick) to minimize D1 writes.
- **Pages Free Plan:** Unlimited static bandwidth and 500 builds/month.
