# Cloudflare Workers, D1 & Pages Deployment Guide

SA AI TRADER runs independently on Cloudflare's edge network:
- **Backend API**: Cloudflare Worker (`worker/src/index.ts`)
- **Database**: Cloudflare D1 (`database/migrations/0001_initial.sql`)
- **Frontend UI**: Cloudflare Pages (built from `npm run build` -> `dist/`)

---

## Step 1: Install Wrangler & Authenticate

```bash
npm install -g wrangler
wrangler login
```

---

## Step 2: Create the D1 Database & Run Migrations

From the `worker/` directory:

```bash
cd worker
npx wrangler d1 create sa-ai-trader-db
```

Copy the `database_id` printed by Wrangler and paste it into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sa-ai-trader-db"
database_id = "YOUR_ACTUAL_DATABASE_ID"
migrations_dir = "../database/migrations"
```

Apply the SQL migration to your remote D1 database:

```bash
npx wrangler d1 migrations apply sa-ai-trader-db --remote
```

---

## Step 3: Set Your Secret Bridge Token (`XM_BRIDGE_TOKEN`)

Generate a strong random token (32+ characters), for example:

```bash
openssl rand -hex 32
```

Store it as an encrypted Cloudflare Worker secret (never in `wrangler.toml` or frontend code):

```bash
npx wrangler secret put XM_BRIDGE_TOKEN
```

Paste your generated token when prompted. Save a copy securely to enter into your MT5 EA input.

---

## Step 4: Deploy the Cloudflare Worker

```bash
npx wrangler deploy
```

Wrangler will output your Worker URL, for example:
`https://sa-ai-trader-worker.your-subdomain.workers.dev`

Verify `/api/health`:

```bash
curl https://sa-ai-trader-worker.your-subdomain.workers.dev/api/health
```

Expected response includes `"ok": true` and `"bridgeAuthConfigured": true`.

---

## Step 5: Deploy the Frontend to Cloudflare Pages

1. Go to **Cloudflare Dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git**.
2. Select your `sa-ai-trader` GitHub repository.
3. Configure build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Add Environment Variable (Production & Preview):
   - `VITE_API_BASE_URL` = `https://sa-ai-trader-worker.your-subdomain.workers.dev`
   - *(Note: NEVER put `XM_BRIDGE_TOKEN` in Cloudflare Pages environment variables!)*
5. Click **Save and Deploy**.
6. *(Recommended)* Update `ALLOWED_ORIGIN` in `worker/wrangler.toml` to your exact Pages URL (e.g., `https://sa-ai-trader.pages.dev`) and run `npx wrangler deploy` again to restrict browser CORS to your frontend domain.
