import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SUPPORTED_TIMEFRAMES,
  type Candle,
  type HealthResponse,
  type MarketCandlesResponse,
  type MarketLatestResponse,
  type MarketSnapshot,
  type Timeframe,
  type TradeSignal,
} from './src/types/market.ts';
import {
  constantTimeEqual,
  FRESHNESS_THRESHOLD_MS,
  isValidTimeframe,
  validateBridgePayload,
} from './src/lib/validation.ts';
import { generateTradeSignal, verifySignalWithCandles } from './src/lib/signalEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MAX_CANDLES_STORED = 500;

// In-memory store representing live bridge state (mirrors Cloudflare D1 Worker behavior in local preview)
let currentSnapshot: MarketSnapshot | null = null;
const candleStore = new Map<string, Candle[]>();
const signalStore = new Map<string, TradeSignal>();
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getCandleKey(symbol: string, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`;
}

function upsertCandles(symbol: string, timeframe: Timeframe, incoming: Candle[]): void {
  const key = getCandleKey(symbol, timeframe);
  const existing = candleStore.get(key) ?? [];
  const merged = new Map<number, Candle>();

  for (const c of existing) {
    merged.set(c.time, c);
  }
  for (const c of incoming) {
    merged.set(c.time, c);
  }

  const sorted = Array.from(merged.values())
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_CANDLES_STORED);

  candleStore.set(key, sorted);
}

function computeConnectionStatus(
  snapshot: MarketSnapshot | null,
  nowMs: number,
): { status: 'CONNECTED' | 'STALE' | 'DISCONNECTED'; ageMs: number | null } {
  if (!snapshot) {
    return { status: 'DISCONNECTED', ageMs: null };
  }
  const ageMs = Math.max(0, nowMs - snapshot.receivedAt);
  if (ageMs > 60_000) {
    return { status: 'DISCONNECTED', ageMs };
  }
  if (ageMs > FRESHNESS_THRESHOLD_MS) {
    return { status: 'STALE', ageMs };
  }
  return { status: 'CONNECTED', ageMs };
}

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  const altHeader = req.header('x-bridge-token');
  if (altHeader && altHeader.trim().length > 0) {
    return altHeader.trim();
  }
  return null;
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // 1. Health endpoint
  app.get('/api/health', (_req, res) => {
    const nowMs = Date.now();
    const { status } = computeConnectionStatus(currentSnapshot, nowMs);
    const payload: HealthResponse = {
      ok: true,
      service: 'sa-ai-trader-local-bridge',
      timestamp: nowMs,
      bridgeAuthConfigured: Boolean(process.env.XM_BRIDGE_TOKEN && process.env.XM_BRIDGE_TOKEN.trim().length > 0),
      hasSnapshot: Boolean(currentSnapshot),
      lastUpdateAt: currentSnapshot?.receivedAt ?? null,
      connectionStatus: status,
      storageMode: 'local-memory-mirror',
    };
    res.status(200).json(payload);
  });

  // 2. Authenticated MT5 EA Bridge Ingestion
  app.post('/api/bridge/mt5', (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(`bridge:${clientIp}`, 30, 10_000)) {
      res.status(429).json({ ok: false, error: 'Rate limit exceeded. Poll every 3 to 5 seconds.' });
      return;
    }

    const expectedToken = process.env.XM_BRIDGE_TOKEN?.trim();
    if (!expectedToken) {
      res.status(503).json({
        ok: false,
        error: 'Bridge secret XM_BRIDGE_TOKEN is not configured on the server.',
      });
      return;
    }

    const providedToken = extractBearerToken(req);
    if (!providedToken) {
      res.status(401).json({ ok: false, error: 'Missing bridge authorization token.' });
      return;
    }

    if (!constantTimeEqual(providedToken, expectedToken)) {
      res.status(403).json({ ok: false, error: 'Invalid bridge authorization token.' });
      return;
    }

    const nowMs = Date.now();
    const validation = validateBridgePayload(req.body, nowMs);
    if (!validation.ok) {
      res.status(400).json({ ok: false, error: validation.error });
      return;
    }

    const data = validation.data;
    const lastCandleTimes: Partial<Record<Timeframe, number>> = {
      ...(currentSnapshot?.lastCandleTimes ?? {}),
    };

    for (const tf of SUPPORTED_TIMEFRAMES) {
      const candles = data.candles[tf];
      if (candles && candles.length > 0) {
        upsertCandles(data.symbol, tf, candles);
        lastCandleTimes[tf] = candles[candles.length - 1].time;
      }
    }

    currentSnapshot = {
      symbol: data.symbol,
      broker: data.broker,
      bid: data.bid,
      ask: data.ask,
      spread: data.spread,
      spreadPoints: data.spreadPoints,
      digits: data.digits,
      point: data.point,
      serverTime: data.serverTime,
      serverTimestamp: data.serverTimestampMs,
      receivedAt: nowMs,
      source: 'mt5-ea-bridge',
      lastCandleTimes,
      mt5Indicators: {
        ...(currentSnapshot?.mt5Indicators ?? {}),
        ...data.indicators,
      },
    };

    const candlesByTf: Partial<Record<Timeframe, Candle[]>> = {};
    for (const tf of SUPPORTED_TIMEFRAMES) {
      const stored = candleStore.get(getCandleKey(data.symbol, tf));
      if (stored) {
        candlesByTf[tf] = stored;
      }
    }

    for (const tf of ['M5', 'M15', 'M30', 'H1'] as Timeframe[]) {
      const sig = generateTradeSignal({
        snapshot: currentSnapshot,
        timeframe: tf,
        candlesByTimeframe: candlesByTf,
        nowMs,
      });
      if (sig.direction !== 'WAIT' && !signalStore.has(sig.id)) {
        signalStore.set(sig.id, sig);
      }
    }

    res.status(200).json({
      ok: true,
      receivedAt: nowMs,
      symbol: data.symbol,
      timeframesStored: Object.keys(data.candles),
    });
  });

  // 3. Latest market snapshot
  app.get('/api/market/latest', (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(`read:${clientIp}`, 240, 60_000)) {
      res.status(429).json({ ok: false, error: 'Too many requests.' });
      return;
    }

    const nowMs = Date.now();
    const { status, ageMs } = computeConnectionStatus(currentSnapshot, nowMs);
    const symbol = currentSnapshot?.symbol ?? 'GOLD';
    const candleCounts: Partial<Record<Timeframe, number>> = {};
    for (const tf of SUPPORTED_TIMEFRAMES) {
      const list = candleStore.get(getCandleKey(symbol, tf));
      if (list && list.length > 0) {
        candleCounts[tf] = list.length;
      }
    }

    const response: MarketLatestResponse = {
      snapshot: currentSnapshot,
      connectionStatus: status,
      ageMs,
      staleThresholdMs: FRESHNESS_THRESHOLD_MS,
      candleCounts,
      serverNow: nowMs,
    };
    res.status(200).json(response);
  });

  // 4. Candles by timeframe
  app.get('/api/market/candles', (req, res) => {
    const tfParam = String(req.query.timeframe ?? 'M15').toUpperCase();
    if (!isValidTimeframe(tfParam)) {
      res.status(400).json({
        ok: false,
        error: `Invalid timeframe "${tfParam}". Supported: ${SUPPORTED_TIMEFRAMES.join(', ')}`,
      });
      return;
    }

    const symbol = currentSnapshot?.symbol ?? 'GOLD';
    const candles = candleStore.get(getCandleKey(symbol, tfParam)) ?? [];

    const response: MarketCandlesResponse = {
      symbol,
      timeframe: tfParam,
      candles,
      lastCandleTime: candles.length > 0 ? candles[candles.length - 1].time : null,
      source: currentSnapshot?.source ?? 'none',
    };
    res.status(200).json(response);
  });

  // 5. Server-verified signal history
  app.get('/api/signals', (_req, res) => {
    const symbol = currentSnapshot?.symbol ?? 'GOLD';
    const list = Array.from(signalStore.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50)
      .map((sig) => {
        if (sig.direction !== 'WAIT' && sig.status === 'PENDING_VERIFICATION') {
          const candles = candleStore.get(getCandleKey(symbol, sig.timeframe)) ?? [];
          const verified = verifySignalWithCandles(sig, candles);
          signalStore.set(verified.id, verified);
          return verified;
        }
        return sig;
      });

    res.status(200).json({ signals: list });
  });

  // Unknown API routes
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ ok: false, error: 'API route not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SA AI TRADER server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
