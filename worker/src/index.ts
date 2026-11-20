import {
  SUPPORTED_TIMEFRAMES,
  type Candle,
  type HealthResponse,
  type MarketCandlesResponse,
  type MarketLatestResponse,
  type MarketSnapshot,
  type Timeframe,
  type TradeSignal,
} from '../../src/types/market.ts';
import {
  constantTimeEqual,
  FRESHNESS_THRESHOLD_MS,
  isValidTimeframe,
  validateBridgePayload,
} from '../../src/lib/validation.ts';
import { generateTradeSignal, verifySignalWithCandles } from '../../src/lib/signalEngine.ts';

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface Env {
  DB: D1Database;
  XM_BRIDGE_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
}

// Per-isolate sliding window rate limiter
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

function getReadCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const configuredList = (env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (configuredList.length > 0 && origin && configuredList.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  } else if (configuredList.length === 0 && origin) {
    // Public read-only market endpoints only when ALLOWED_ORIGIN is not yet locked down
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  return headers;
}

function jsonResponse(data: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  const altHeader = request.headers.get('X-Bridge-Token');
  if (altHeader && altHeader.trim().length > 0) {
    return altHeader.trim();
  }
  return null;
}

async function readSnapshotFromD1(db: D1Database): Promise<MarketSnapshot | null> {
  const row = await db
    .prepare('SELECT * FROM market_snapshots WHERE id = 1')
    .first<{
      symbol: string;
      broker: string;
      bid: number;
      ask: number;
      spread: number;
      spread_points: number;
      digits: number;
      point: number;
      server_time: string;
      server_timestamp: number;
      received_at: number;
      source: string;
      last_candle_times_json: string;
      indicators_json: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    symbol: row.symbol,
    broker: row.broker,
    bid: row.bid,
    ask: row.ask,
    spread: row.spread,
    spreadPoints: row.spread_points,
    digits: row.digits,
    point: row.point,
    serverTime: row.server_time,
    serverTimestamp: row.server_timestamp,
    receivedAt: row.received_at,
    source: row.source,
    lastCandleTimes: JSON.parse(row.last_candle_times_json || '{}'),
    mt5Indicators: JSON.parse(row.indicators_json || '{}'),
  };
}

async function readCandlesFromD1(
  db: D1Database,
  symbol: string,
  timeframe: Timeframe,
  limit = 320,
): Promise<Candle[]> {
  const { results } = await db
    .prepare(
      'SELECT time, open, high, low, close, volume FROM candles WHERE symbol = ? AND timeframe = ? ORDER BY time DESC LIMIT ?',
    )
    .bind(symbol, timeframe, limit)
    .all<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number | null;
    }>();

  return results
    .map((r) => ({
      time: r.time,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      ...(r.volume !== null && r.volume !== undefined ? { volume: r.volume } : {}),
    }))
    .reverse();
}

async function readCandleCounts(
  db: D1Database,
  symbol: string,
): Promise<Partial<Record<Timeframe, number>>> {
  const { results } = await db
    .prepare('SELECT timeframe, COUNT(*) as cnt FROM candles WHERE symbol = ? GROUP BY timeframe')
    .bind(symbol)
    .all<{ timeframe: string; cnt: number }>();

  const counts: Partial<Record<Timeframe, number>> = {};
  for (const r of results) {
    if (isValidTimeframe(r.timeframe)) {
      counts[r.timeframe] = r.cnt;
    }
  }
  return counts;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    if (request.method === 'OPTIONS') {
      if (path === '/api/bridge/mt5') {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 204, headers: getReadCorsHeaders(request, env) });
    }

    if (!env.DB) {
      return jsonResponse(
        {
          ok: false,
          error: 'Cloudflare D1 binding "DB" is not configured. Bind your D1 database in worker/wrangler.toml.',
        },
        503,
        getReadCorsHeaders(request, env),
      );
    }

    // 1. GET /api/health
    if (request.method === 'GET' && path === '/api/health') {
      const nowMs = Date.now();
      try {
        const snapshot = await readSnapshotFromD1(env.DB);
        const { status } = computeConnectionStatus(snapshot, nowMs);
        const health: HealthResponse = {
          ok: true,
          service: 'sa-ai-trader-worker',
          timestamp: nowMs,
          bridgeAuthConfigured: Boolean(env.XM_BRIDGE_TOKEN && env.XM_BRIDGE_TOKEN.trim().length > 0),
          hasSnapshot: Boolean(snapshot),
          lastUpdateAt: snapshot?.receivedAt ?? null,
          connectionStatus: status,
          storageMode: 'cloudflare-d1',
        };
        return jsonResponse(health, 200, getReadCorsHeaders(request, env));
      } catch (err) {
        return jsonResponse(
          {
            ok: false,
            service: 'sa-ai-trader-worker',
            timestamp: nowMs,
            bridgeAuthConfigured: Boolean(env.XM_BRIDGE_TOKEN && env.XM_BRIDGE_TOKEN.trim().length > 0),
            hasSnapshot: false,
            lastUpdateAt: null,
            connectionStatus: 'DISCONNECTED',
            storageMode: 'cloudflare-d1',
            error:
              err instanceof Error
                ? `D1 query failed (${err.message}). Apply D1 migrations first.`
                : 'D1 query failed. Apply D1 migrations first.',
          },
          500,
          getReadCorsHeaders(request, env),
        );
      }
    }

    // 2. POST /api/bridge/mt5 (Authenticated MT5 EA Bridge Ingestion)
    if (request.method === 'POST' && path === '/api/bridge/mt5') {
      if (!checkRateLimit(`bridge:${clientIp}`, 30, 10_000)) {
        return jsonResponse({ ok: false, error: 'Rate limit exceeded. Slow bridge polling to 3-5 seconds.' }, 429);
      }

      const expectedToken = env.XM_BRIDGE_TOKEN?.trim();
      if (!expectedToken) {
        return jsonResponse(
          { ok: false, error: 'Bridge secret XM_BRIDGE_TOKEN is not configured on Worker.' },
          503,
        );
      }

      const providedToken = extractBearerToken(request);
      if (!providedToken) {
        return jsonResponse({ ok: false, error: 'Missing bridge authorization token.' }, 401);
      }

      if (!constantTimeEqual(providedToken, expectedToken)) {
        return jsonResponse({ ok: false, error: 'Invalid bridge authorization token.' }, 403);
      }

      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: 'Malformed JSON body.' }, 400);
      }

      const nowMs = Date.now();
      const validation = validateBridgePayload(rawBody, nowMs);
      if (!validation.ok) {
        return jsonResponse({ ok: false, error: validation.error }, 400);
      }

      const data = validation.data;
      const lastCandleTimes: Partial<Record<Timeframe, number>> = {};
      const statements: D1PreparedStatement[] = [];

      for (const tf of SUPPORTED_TIMEFRAMES) {
        const list = data.candles[tf];
        if (!list || list.length === 0) {
          continue;
        }
        lastCandleTimes[tf] = list[list.length - 1].time;

        for (const c of list) {
          statements.push(
            env.DB.prepare(
              `INSERT INTO candles (symbol, timeframe, time, open, high, low, close, volume, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(symbol, timeframe, time) DO UPDATE SET
                 open = excluded.open,
                 high = excluded.high,
                 low = excluded.low,
                 close = excluded.close,
                 volume = excluded.volume,
                 updated_at = excluded.updated_at`,
            ).bind(
              data.symbol,
              tf,
              c.time,
              c.open,
              c.high,
              c.low,
              c.close,
              c.volume ?? null,
              nowMs,
            ),
          );
        }
      }

      // Preserve previously known lastCandleTimes for timeframes omitted in a single packet
      const existingSnapshot = await readSnapshotFromD1(env.DB);
      const mergedLastCandleTimes = {
        ...(existingSnapshot?.lastCandleTimes ?? {}),
        ...lastCandleTimes,
      };
      const mergedIndicators = {
        ...(existingSnapshot?.mt5Indicators ?? {}),
        ...data.indicators,
      };

      statements.unshift(
        env.DB.prepare(
          `INSERT INTO market_snapshots (
            id, symbol, broker, bid, ask, spread, spread_points, digits, point,
            server_time, server_timestamp, received_at, source, last_candle_times_json, indicators_json
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            symbol = excluded.symbol,
            broker = excluded.broker,
            bid = excluded.bid,
            ask = excluded.ask,
            spread = excluded.spread,
            spread_points = excluded.spread_points,
            digits = excluded.digits,
            point = excluded.point,
            server_time = excluded.server_time,
            server_timestamp = excluded.server_timestamp,
            received_at = excluded.received_at,
            source = excluded.source,
            last_candle_times_json = excluded.last_candle_times_json,
            indicators_json = excluded.indicators_json`,
        ).bind(
          data.symbol,
          data.broker,
          data.bid,
          data.ask,
          data.spread,
          data.spreadPoints,
          data.digits,
          data.point,
          data.serverTime,
          data.serverTimestampMs,
          nowMs,
          'mt5-ea-bridge',
          JSON.stringify(mergedLastCandleTimes),
          JSON.stringify(mergedIndicators),
        ),
      );

      // Batch in chunks of 100 for D1 limits
      for (let i = 0; i < statements.length; i += 100) {
        await env.DB.batch(statements.slice(i, i + 100));
      }

      // Compute server-side signals for M5, M15, H1 when candles exist & record directional signals
      const snapshotForSignal: MarketSnapshot = {
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
        lastCandleTimes: mergedLastCandleTimes,
        mt5Indicators: mergedIndicators,
      };

      const candlesByTf: Partial<Record<Timeframe, Candle[]>> = {};
      for (const tf of SUPPORTED_TIMEFRAMES) {
        candlesByTf[tf] = await readCandlesFromD1(env.DB, data.symbol, tf, 260);
      }

      for (const tf of ['M5', 'M15', 'M30', 'H1'] as Timeframe[]) {
        const sig = generateTradeSignal({
          snapshot: snapshotForSignal,
          timeframe: tf,
          candlesByTimeframe: candlesByTf,
          nowMs,
        });
        if (sig.direction !== 'WAIT') {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO signals (
              id, symbol, timeframe, direction, timestamp, entry_price, entry_zone_min, entry_zone_max,
              stop_loss, take_profit_1, take_profit_2, risk_reward_1, risk_reward_2,
              confirmation_score, data_quality_score, reasons_for_json, reasons_against_json,
              status, verified_at, verification_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              sig.id,
              sig.symbol,
              sig.timeframe,
              sig.direction,
              sig.timestamp,
              sig.entryPrice,
              sig.entryZone?.min ?? null,
              sig.entryZone?.max ?? null,
              sig.stopLoss,
              sig.takeProfit1,
              sig.takeProfit2,
              sig.riskReward1,
              sig.riskReward2,
              sig.confirmationScore,
              sig.dataQualityScore,
              JSON.stringify(sig.reasonsFor),
              JSON.stringify(sig.reasonsAgainst),
              sig.status,
              null,
              null,
            )
            .run();
        }
      }

      return jsonResponse({
        ok: true,
        receivedAt: nowMs,
        symbol: data.symbol,
        timeframesStored: Object.keys(data.candles),
      }, 200);
    }

    // Rate limit read endpoints
    if (!checkRateLimit(`read:${clientIp}`, 240, 60_000)) {
      return jsonResponse({ ok: false, error: 'Too many requests.' }, 429, getReadCorsHeaders(request, env));
    }

    // 3. GET /api/market/latest
    if (request.method === 'GET' && path === '/api/market/latest') {
      const nowMs = Date.now();
      const snapshot = await readSnapshotFromD1(env.DB);
      const { status, ageMs } = computeConnectionStatus(snapshot, nowMs);
      const candleCounts = snapshot ? await readCandleCounts(env.DB, snapshot.symbol) : {};

      const response: MarketLatestResponse = {
        snapshot,
        connectionStatus: status,
        ageMs,
        staleThresholdMs: FRESHNESS_THRESHOLD_MS,
        candleCounts,
        serverNow: nowMs,
      };
      return jsonResponse(response, 200, getReadCorsHeaders(request, env));
    }

    // 4. GET /api/market/candles?timeframe=M1
    if (request.method === 'GET' && path === '/api/market/candles') {
      const tfParam = (url.searchParams.get('timeframe') ?? 'M15').toUpperCase();
      if (!isValidTimeframe(tfParam)) {
        return jsonResponse(
          { ok: false, error: `Invalid timeframe "${tfParam}". Supported: ${SUPPORTED_TIMEFRAMES.join(', ')}` },
          400,
          getReadCorsHeaders(request, env),
        );
      }

      const snapshot = await readSnapshotFromD1(env.DB);
      const symbol = snapshot?.symbol ?? 'GOLD';
      const candles = await readCandlesFromD1(env.DB, symbol, tfParam, 320);

      const response: MarketCandlesResponse = {
        symbol,
        timeframe: tfParam,
        candles,
        lastCandleTime: candles.length > 0 ? candles[candles.length - 1].time : null,
        source: snapshot?.source ?? 'none',
      };
      return jsonResponse(response, 200, getReadCorsHeaders(request, env));
    }

    // 5. GET /api/signals (Server-verified signal history + current signal evaluation)
    if (request.method === 'GET' && path === '/api/signals') {
      const snapshot = await readSnapshotFromD1(env.DB);
      const symbol = snapshot?.symbol ?? 'GOLD';
      const { results } = await env.DB.prepare(
        'SELECT * FROM signals WHERE symbol = ? ORDER BY timestamp DESC LIMIT 50',
      )
        .bind(symbol)
        .all<{
          id: string;
          symbol: string;
          timeframe: string;
          direction: 'BUY' | 'SELL' | 'WAIT';
          timestamp: number;
          entry_price: number | null;
          entry_zone_min: number | null;
          entry_zone_max: number | null;
          stop_loss: number | null;
          take_profit_1: number | null;
          take_profit_2: number | null;
          risk_reward_1: number | null;
          risk_reward_2: number | null;
          confirmation_score: number;
          data_quality_score: number;
          reasons_for_json: string;
          reasons_against_json: string;
          status: TradeSignal['status'];
          verified_at: number | null;
          verification_note: string | null;
        }>();

      const candleCache = new Map<Timeframe, Candle[]>();
      const signals: TradeSignal[] = [];

      for (const row of results) {
        if (!isValidTimeframe(row.timeframe)) continue;
        let sig: TradeSignal = {
          id: row.id,
          symbol: row.symbol,
          timeframe: row.timeframe,
          direction: row.direction,
          timestamp: row.timestamp,
          entryPrice: row.entry_price,
          entryZone:
            row.entry_zone_min !== null && row.entry_zone_max !== null
              ? { min: row.entry_zone_min, max: row.entry_zone_max }
              : null,
          stopLoss: row.stop_loss,
          takeProfit1: row.take_profit_1,
          takeProfit2: row.take_profit_2,
          riskReward1: row.risk_reward_1,
          riskReward2: row.risk_reward_2,
          confirmationScore: row.confirmation_score,
          dataQualityScore: row.data_quality_score,
          reasonsFor: JSON.parse(row.reasons_for_json || '[]'),
          reasonsAgainst: JSON.parse(row.reasons_against_json || '[]'),
          status: row.status,
          verifiedAt: row.verified_at,
          verificationNote: row.verification_note ?? undefined,
        };

        if (sig.direction !== 'WAIT' && sig.status === 'PENDING_VERIFICATION') {
          let tfCandles = candleCache.get(sig.timeframe);
          if (!tfCandles) {
            tfCandles = await readCandlesFromD1(env.DB, symbol, sig.timeframe, 320);
            candleCache.set(sig.timeframe, tfCandles);
          }
          const verified = verifySignalWithCandles(sig, tfCandles);
          if (verified.status !== sig.status || verified.verificationNote !== sig.verificationNote) {
            await env.DB.prepare(
              'UPDATE signals SET status = ?, verified_at = ?, verification_note = ? WHERE id = ?',
            )
              .bind(verified.status, verified.verifiedAt ?? null, verified.verificationNote ?? null, verified.id)
              .run();
          }
          sig = verified;
        }
        signals.push(sig);
      }

      return jsonResponse({ signals }, 200, getReadCorsHeaders(request, env));
    }

    return jsonResponse({ ok: false, error: 'Endpoint not found.' }, 404, getReadCorsHeaders(request, env));
  },
};
