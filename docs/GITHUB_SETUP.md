# GitHub Setup Instructions

Follow these steps to push **SA AI TRADER** to your own GitHub repository cleanly without committing any secrets.

## 1. Verify `.gitignore`

Confirm that `.env` and `node_modules/` are ignored before running `git add`. The repository `.gitignore` already excludes `.env*` while keeping `.env.example`.

**Never commit your `XM_BRIDGE_TOKEN` to GitHub.**

## 2. Initialize & Push Repository

```bash
git init
git add .
git status   # Double-check no .env file is listed!
git commit -m "Initial SA AI TRADER terminal, Cloudflare Worker, D1 schema, and MT5 bridge"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sa-ai-trader.git
git push -u origin main
```

## 3. Recommended GitHub Security Settings

- Enable **Secret Scanning** and **Push Protection** in GitHub Repository Settings -> Code security and analysis.
- Keep your `XM_BRIDGE_TOKEN` only in Cloudflare Worker Secrets and inside your local MT5 EA inputs.
