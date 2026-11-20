# Testing & Verification Guide

This document explains how to verify indicator math, fail-safe signal behavior, API authentication, error states, and end-to-end data flow.

---

## 1. Automated Unit & Fail-Safe Tests

Run the built-in verification suite to test EMA/RSI/MACD/ATR/Bollinger calculations, signal `WAIT` fail-safes (stale data > 10s, missing candles, excessive spread), risk calculator edge cases, and payload validation:

```bash
npx tsx scripts/verify-system.ts
```

---

## 2. TypeScript & Production Build Checks

```bash
npm run lint
npm run build
```

---

## 3. Testing Local API Authentication & Error States

Start the local server with a test token:

```bash
XM_BRIDGE_TOKEN="local-test-secret-123" npm run dev
```

### A. Verify Health Endpoint

```bash
curl -s http://localhost:3000/api/health
```

Confirm `"bridgeAuthConfigured": true` and `"hasSnapshot": false`.

### B. Verify Missing / Invalid Token Rejection

```bash
# Should return 401 Missing bridge authorization token
curl -i -X POST http://localhost:3000/api/bridge/mt5 \
  -H "Content-Type: application/json" \
  -d '{}'

# Should return 403 Invalid bridge authorization token
curl -i -X POST http://localhost:3000/api/bridge/mt5 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-token" \
  -d '{}'
```

### C. Verify Malformed Data Rejection

```bash
# Should return 400 (ask < bid rejected)
curl -i -X POST http://localhost:3000/api/bridge/mt5 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-test-secret-123" \
  -d '{"symbol":"GOLD","bid":2650.5,"ask":2650.0,"serverTime":"2026-01-01 12:00:00","serverTimestamp":1767268800,"candles":{}}'
```

### D. Verify Fail-Safe UI When Disconnected

Open `http://localhost:3000` with no MT5 feed active:
- Chart must display **"Waiting for MT5 candle data"** (no fake candles).
- Signal Engine must display **WAIT** with explicit disconnection reason.
- Risk Calculator must refuse to recommend lot sizes when Entry/SL are blank.

---

## 4. Verifying Live MT5 Integration

Once `SA_AI_TRADER_BRIDGE.mq5` is running on XM MT5:
1. Open the **Bridge** tab in SA AI TRADER and confirm status is `CONNECTED`.
2. Verify `Last Received Update` updates every 3–5 seconds.
3. Wait 12 seconds after pausing Algo Trading in MT5 to confirm the dashboard automatically transitions to `STALE (>10s)` and forces the Signal Engine to `WAIT`.
