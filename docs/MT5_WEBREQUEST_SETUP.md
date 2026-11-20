# MetaTrader 5 (XM) WebRequest & EA Setup Guide

Follow these steps to connect your XM MetaTrader 5 desktop terminal to your deployed SA AI TRADER Cloudflare Worker.

---

## 1. Enable WebRequest in MT5

MetaTrader 5 blocks outbound HTTP calls by default (Error `4060`) unless the destination URL is explicitly allowed:

1. Open **XM MetaTrader 5** on your Windows PC or VPS.
2. Click **Tools -> Options** (or press `Ctrl + O`).
3. Open the **Expert Advisors** tab.
4. Check **Allow algorithmic trading**.
5. Check **Allow WebRequest for listed URL**.
6. Double-click the blank row and add your Worker base URL:
   `https://sa-ai-trader-worker.your-subdomain.workers.dev`
7. Click **OK**.

---

## 2. Install & Compile `SA_AI_TRADER_BRIDGE.mq5`

1. In MT5, click **File -> Open Data Folder**.
2. Open `MQL5/Experts/`.
3. Copy `mt5/SA_AI_TRADER_BRIDGE.mq5` from this repository into `MQL5/Experts/`.
4. Open **MetaEditor** (`F4` in MT5), open `SA_AI_TRADER_BRIDGE.mq5`, and press **Compile (`F7`)**.
   - Verify `0 errors, 0 warnings` in the Toolbox window.

---

## 3. Attach the Read-Only EA to XM GOLD

1. In MT5 **Market Watch**, verify the exact symbol name used by your XM account type (usually `GOLD`, or `GOLDmicro` on Micro accounts).
2. Open a `GOLD` chart (any timeframe, e.g., `M15` — the EA reads all 7 timeframes `M1`–`D1` automatically).
3. Drag **SA_AI_TRADER_BRIDGE** from Navigator -> Expert Advisors onto the chart.
4. Configure the **Inputs** tab:
   - `InpApiEndpoint`: `https://sa-ai-trader-worker.your-subdomain.workers.dev/api/bridge/mt5`
   - `InpBridgeToken`: Paste your `XM_BRIDGE_TOKEN` secret
   - `InpSymbol`: `GOLD` (or your exact XM symbol name)
   - `InpIntervalSec`: `4` (must be between 3 and 5 seconds)
   - `InpCandlesCount`: `220`
5. Click **OK** and ensure **Algo Trading** is green/enabled on the MT5 toolbar.
6. Check the **Experts** tab at the bottom of MT5. You should see:
   `[SA AI TRADER] Read-only bridge initialized for GOLD (interval=4s, bars=220).`

> **Security Note:** The EA never requests your MT5 account password and contains zero order-execution code.
